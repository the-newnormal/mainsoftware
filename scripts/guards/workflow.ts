// How the guard tests read a GitHub Actions workflow without a YAML parser: its top-level keys, its
// jobs, each job's runs-on and timeout-minutes, every key of a job with its raw lines, and each step
// both as text and parsed into its keys. It reads only the shape this repo's workflows are written in
// (two-space indents: top-level keys at column 0, job ids at two, a job's keys at four, its steps at
// six, a step's keys at eight and their mapping entries at ten, a block scalar's content deeper),
// block mappings, block sequences, flow sequences of scalars, the empty flow mapping {} and block
// scalars, so a test that uses it first checks it found the jobs and steps it expects, and a
// reformatted file fails the test rather than passing unread. What it can't read: a flow mapping with
// anything in it, an anchor, an alias or a tag (&, *, !), a quoted key, a value continued on the next
// line (a plain or quoted scalar, or a flow sequence, over two lines), a key given twice, a plain value
// YAML reads as structure (starting with -, ? or : and a blank), a flow item YAML reads otherwise than
// split at its commas (one holding a quoted comma, a : and a blank or at its end, or a #), and any other
// indent; shapeProblems() names each line in none of the shapes it reads. It reads a block scalar's
// lines as they stand, as a literal one (|, |- or |+) with no indentation indicator is, so
// literalProblems() names each block scalar folded (>) or given an indentation indicator, which YAML
// reads otherwise, and indicatorProblems() each given an indentation indicator alone. commentLines()
// names the YAML comment lines, never a line starting with # inside a block scalar, which is the
// scalar's. It splits a file into lines only at a newline, so a carriage return, NEL, LS or PS,
// which YAML readers break lines at too, would hide what follows it on its line from every rule: the
// deploy-workflow guard refuses any of them, and any other control or format character or blank but a
// space or a tab, in every workflow before anything else reads it. It also refuses every line
// shapeProblems() names in every workflow, every one literalProblems() names in deploy.yml and every one
// indicatorProblems() names in every other, a double-quoted scalar holding an escape in every workflow,
// and in deploy.yml any flow mapping and quoted item too (DPW-02). That guard
// (scripts/guards/deploy-workflow.ts) reads the deploy workflow through this file, so this file is on
// the owner's-read list (C11-D74).

// One job: its id, its runner, its timeout in minutes, and its steps, each as its own lines with
// the indent and the step's leading "- " taken off (so `run: npm test`, or `uses: …` then `with:`
// and its keys), and comment and blank lines left out. Beside those, every key at four spaces with
// its raw lines (its own line first, then each line up to the next key or job, comment and blank
// lines kept, so a block scalar's comments survive), and every key's name in order, a repeated one
// as often as it appears.
export interface WorkflowJob {
  id: string
  runsOn: string | undefined
  timeoutMinutes: number | undefined
  steps: string[]
  keys: Map<string, string[]>
  keyNames: string[]
}

const withoutComment = (value: string) => value.replace(/\s+#.*$/, '').trim()

export function workflowJobs(text: string): WorkflowJob[] {
  const lines = text.split('\n')
  const start = lines.findIndex(line => /^jobs:\s*(?:#.*)?$/.test(line))
  if (start === -1) return []
  const jobs: WorkflowJob[] = []
  let job: WorkflowJob | undefined
  let keyLines: string[] | undefined
  let inSteps = false
  let step: string[] | undefined
  const endStep = () => {
    if (job && step) job.steps.push(step.join('\n'))
    step = undefined
  }
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || /^\s*#/.test(line)) {
      keyLines?.push(line)
      continue
    }
    // Another top-level key ends the jobs.
    if (/^\S/.test(line)) break
    const header = /^ {2}([\w-]+):\s*(?:#.*)?$/.exec(line)
    if (header) {
      endStep()
      job = {
        id: header[1] ?? '',
        runsOn: undefined,
        timeoutMinutes: undefined,
        steps: [],
        keys: new Map(),
        keyNames: [],
      }
      jobs.push(job)
      keyLines = undefined
      inSteps = false
      continue
    }
    if (job === undefined) continue
    const key = /^ {4}([\w-]+):\s*(.*)$/.exec(line)
    if (key) {
      endStep()
      const name = key[1] ?? ''
      keyLines = [line]
      if (!job.keys.has(name)) job.keys.set(name, keyLines)
      job.keyNames.push(name)
      inSteps = name === 'steps'
      if (name === 'runs-on') job.runsOn = withoutComment(key[2] ?? '')
      if (name === 'timeout-minutes') job.timeoutMinutes = Number(withoutComment(key[2] ?? ''))
      continue
    }
    keyLines?.push(line)
    if (!inSteps) continue
    if (/^ {6}- /.test(line)) {
      endStep()
      step = [line.slice(8).trim()]
    } else if (step && /^ {8}/.test(line)) {
      step.push(line.trim())
    }
  }
  endStep()
  return jobs
}

// Each top-level key (name, on, permissions, concurrency, env, defaults, jobs, …) with its raw lines:
// its own line first, then each line up to the next top-level key, comment and blank lines kept. The
// lines before the first key (a header comment) belong to no key.
export function workflowTop(text: string): Map<string, string[]> {
  const top = new Map<string, string[]>()
  let current: string[] | undefined
  for (const line of text.split('\n')) {
    const key = /^([\w-]+):(?:\s|$)/.exec(line)
    if (key) {
      current = [line]
      if (!top.has(key[1] ?? '')) top.set(key[1] ?? '', current)
      continue
    }
    current?.push(line)
  }
  return top
}

const indentOf = (line: string) => line.length - line.trimStart().length
const isBlankOrComment = (line: string) => line.trim() === '' || /^\s*#/.test(line)
// A block scalar's indicator: literal (|) or folded (>), with a chomping indicator (+ or -) and an
// indentation indicator (1 to 9) in either order, then an optional comment.
const BLOCK_SCALAR = /^[|>](?:[+-][1-9]?|[1-9][+-]?)?\s*(?:#.*)?$/
// The block scalars this reader reads as YAML does: literal, with no indentation indicator.
const LITERAL_SCALAR = /^\|[+-]?\s*(?:#.*)?$/

// A scalar as written after its key: a quoted one unquoted (a single-quoted '' read as ', a
// double-quoted one's escapes left as written), a plain one with its comment cut off.
export function scalarValue(raw: string): string {
  const text = raw.trim()
  if (text.startsWith("'")) {
    const end = /^'((?:[^']|'')*)'/.exec(text)
    return end ? (end[1] ?? '').replace(/''/g, "'") : text
  }
  if (text.startsWith('"')) {
    const end = /^"((?:[^"\\]|\\.)*)"/.exec(text)
    return end ? (end[1] ?? '') : text
  }
  return text.replace(/(?:^|\s+)#.*$/, '').trim()
}

// A block scalar's content: the lines indented past its key, the first content line's indent taken
// off each, ending at the first line indented less (a blank line inside it kept, trailing blank lines
// dropped), and how many lines it took.
function blockScalar(lines: readonly string[], keyIndent: number): { text: string; taken: number } {
  const content: string[] = []
  let blockIndent: number | undefined
  let taken = 0
  for (const line of lines) {
    if (line.trim() === '') {
      content.push('')
      taken++
      continue
    }
    const indent = indentOf(line)
    if (indent <= keyIndent || (blockIndent !== undefined && indent < blockIndent)) break
    blockIndent ??= indent
    content.push(line.slice(blockIndent))
    taken++
  }
  while (content.length > 0 && content[content.length - 1] === '') content.pop()
  return { text: content.join('\n'), taken }
}

// A value as this reader reads it: a scalar (its text, unquoted), a sequence of scalars (flow or
// block), or a block mapping of keys (unquoted) to values, in order. A flow mapping reads as its raw
// text, a block scalar as its content.
export type BlockValue = string | readonly string[] | ReadonlyMap<string, BlockValue>

const KEY_LINE = /^(\s*)(?:-\s+)?([\w-]+|"[^"\n]*"|'[^'\n]*'):(?:\s+(.*))?$/

// A key's value from its raw lines, the key's own line first (a job's keys, a top-level key's lines).
export function blockValue(lines: readonly string[]): BlockValue {
  const first = KEY_LINE.exec(lines[0] ?? '')
  const keyIndent = first ? indentOf(lines[0] ?? '') : -1
  const inline = first ? (first[3] ?? '').trim() : ''
  const rest = lines.slice(1)
  if (inline !== '' && !inline.startsWith('#')) {
    if (BLOCK_SCALAR.test(inline)) return blockScalar(rest, keyIndent).text
    const flow = /^\[(.*)\]\s*(?:#.*)?$/.exec(inline)
    if (flow) {
      const items = (flow[1] ?? '').trim()
      return items === '' ? [] : items.split(',').map(item => scalarValue(item))
    }
    return scalarValue(inline)
  }
  const children = rest.filter(line => !isBlankOrComment(line))
  const childIndent = children[0] === undefined ? undefined : indentOf(children[0])
  if (childIndent === undefined || childIndent <= keyIndent) return ''
  if (/^\s*-\s/.test(children[0] ?? '')) {
    return children.filter(line => indentOf(line) === childIndent).map(line => scalarValue(line.trim().slice(1)))
  }
  const mapping = new Map<string, BlockValue>()
  for (let i = 0; i < rest.length; i++) {
    const line = rest[i] ?? ''
    if (isBlankOrComment(line) || indentOf(line) !== childIndent) continue
    const key = KEY_LINE.exec(line)
    if (!key) continue
    let end = i + 1
    while (end < rest.length && (isBlankOrComment(rest[end] ?? '') || indentOf(rest[end] ?? '') > childIndent)) end++
    const name = scalarValue(key[2] ?? '')
    if (!mapping.has(name)) mapping.set(name, blockValue(rest.slice(i, end)))
    i = end - 1
  }
  return mapping
}

// A job key's scalar (if, runs-on, timeout-minutes, …): undefined when the job hasn't the key or its
// value isn't a scalar.
export function jobScalar(job: WorkflowJob, key: string): string | undefined {
  const lines = job.keys.get(key)
  if (lines === undefined) return undefined
  const value = blockValue(lines)
  return typeof value === 'string' ? value : undefined
}

// The environment a job names: the literal name of a scalar environment: or of its name:, or
// { expression: true } for anything holding ${{, or { unreadable: true } for any other shape (a flow
// mapping, a mapping with no literal name).
export function jobEnvironment(job: WorkflowJob): string | { expression: true } | { unreadable: true } | undefined {
  const lines = job.keys.get('environment')
  if (lines === undefined) return undefined
  if (lines.some(line => !/^\s*#/.test(line) && line.includes('${{'))) return { expression: true }
  const value = blockValue(lines)
  if (typeof value === 'string') return value === '' || /^[{[&*]/.test(value) ? { unreadable: true } : value
  if (value instanceof Map) {
    const name = value.get('name')
    return typeof name === 'string' && name !== '' ? name : { unreadable: true }
  }
  return { unreadable: true }
}

// A job's (or the workflow's) permissions: each scope's level, or write-all, read-all or {} as
// written, or unreadable for any other shape (a flow mapping, a nested value).
export type Permissions = ReadonlyMap<string, string> | 'write-all' | 'read-all' | '{}' | 'unreadable'

export function permissionsOf(lines: readonly string[] | undefined): Permissions | undefined {
  if (lines === undefined) return undefined
  const value = blockValue(lines)
  if (value === 'write-all' || value === 'read-all') return value
  if (typeof value === 'string') return /^\{\s*\}$/.test(value) ? '{}' : 'unreadable'
  if (!(value instanceof Map)) return 'unreadable'
  const scopes = new Map<string, string>()
  for (const [scope, level] of value) {
    if (typeof level !== 'string') return 'unreadable'
    scopes.set(scope, level)
  }
  return scopes
}

export const jobPermissions = (job: WorkflowJob): Permissions | undefined => permissionsOf(job.keys.get('permissions'))

// The jobs a job needs, a scalar or a list, in order; none when it needs none.
export function jobNeeds(job: WorkflowJob): string[] {
  const lines = job.keys.get('needs')
  if (lines === undefined) return []
  const value = blockValue(lines)
  if (typeof value === 'string') return value === '' ? [] : [value]
  return Array.isArray(value) ? [...value] : []
}

// A job's (or the workflow's) concurrency: its group, its cancel-in-progress, and any other key; a
// scalar is a group alone.
export interface Concurrency {
  group: string | undefined
  cancelInProgress: string | undefined
  other: string[]
}

export function concurrencyOf(lines: readonly string[] | undefined): Concurrency | undefined {
  if (lines === undefined) return undefined
  const value = blockValue(lines)
  if (typeof value === 'string') return { group: value, cancelInProgress: undefined, other: [] }
  if (!(value instanceof Map)) return { group: undefined, cancelInProgress: undefined, other: ['(a list)'] }
  const group = value.get('group')
  const cancel = value.get('cancel-in-progress')
  return {
    group: typeof group === 'string' ? group : undefined,
    cancelInProgress: typeof cancel === 'string' ? cancel : undefined,
    other: [...value.keys()].filter(key => key !== 'group' && key !== 'cancel-in-progress'),
  }
}

export const jobConcurrency = (job: WorkflowJob): Concurrency | undefined => concurrencyOf(job.keys.get('concurrency'))

// One step, parsed: its name, id, if, uses (the action and its pin, the version comment cut off),
// its with: and env: entries, and its run (a block scalar's text with the block's indent taken off,
// comment and blank lines inside it kept, line order kept, trailing blank lines dropped; or the one
// line). Every key it has, with its value as read, is in keys, every key's name in order (a repeated
// one as often as it appears) in keyNames, and its raw lines in lines.
export interface WorkflowStep {
  name: string | undefined
  id: string | undefined
  if: string | undefined
  uses: string | undefined
  with: Map<string, string>
  env: Map<string, string>
  run: string | undefined
  keys: Map<string, string>
  keyNames: string[]
  lines: string[]
}

// A step's mapping (with:, env:): each entry at ten spaces, a block scalar entry read whole.
function stepMapping(lines: readonly string[]): Map<string, string> {
  const entries = new Map<string, string>()
  for (let i = 0; i < lines.length; i++) {
    const entry = /^ {10}([\w-]+):(?:\s+(.*))?$/.exec(lines[i] ?? '')
    if (!entry) continue
    const raw = (entry[2] ?? '').trim()
    if (BLOCK_SCALAR.test(raw)) {
      const block = blockScalar(lines.slice(i + 1), 10)
      entries.set(entry[1] ?? '', block.text)
      i += block.taken
    } else {
      entries.set(entry[1] ?? '', scalarValue(raw))
    }
  }
  return entries
}

// Each step of a job, from its steps: key's raw lines, so a run's comment lines are read as written.
export function parsedSteps(job: WorkflowJob): WorkflowStep[] {
  const raw = job.keys.get('steps') ?? []
  const groups: string[][] = []
  for (const line of raw.slice(1)) {
    if (/^ {6}- /.test(line)) groups.push([line])
    else groups[groups.length - 1]?.push(line)
  }
  // A step ends at its last line of content: blank lines and comments shallower than its keys after it
  // (the next job's own comment, say) are no part of it.
  for (const lines of groups) {
    while (lines.length > 1) {
      const last = lines[lines.length - 1] ?? ''
      if (last.trim() !== '' && !(/^\s*#/.test(last) && indentOf(last) <= 8)) break
      lines.pop()
    }
  }
  return groups.map(lines => {
    // The step's first key sits after its "- ", read as if at eight spaces like the others.
    const shaped = [`        ${(lines[0] ?? '').slice(8)}`, ...lines.slice(1)]
    const keys = new Map<string, string>()
    const keyNames: string[] = []
    let withEntries = new Map<string, string>()
    let envEntries = new Map<string, string>()
    for (let i = 0; i < shaped.length; i++) {
      const key = /^ {8}([\w-]+):(?:\s+(.*))?$/.exec(shaped[i] ?? '')
      if (!key) continue
      const name = key[1] ?? ''
      keyNames.push(name)
      const inline = (key[2] ?? '').trim()
      let end = i + 1
      while (end < shaped.length && (isBlankOrComment(shaped[end] ?? '') || indentOf(shaped[end] ?? '') > 8)) end++
      const body = shaped.slice(i + 1, end)
      let value: string
      if (BLOCK_SCALAR.test(inline)) value = blockScalar(body, 8).text
      else if (inline === '' && (name === 'with' || name === 'env')) value = body.join('\n')
      else value = scalarValue(inline)
      if (name === 'with') withEntries = stepMapping(body)
      if (name === 'env') envEntries = stepMapping(body)
      if (!keys.has(name)) keys.set(name, value)
      i = end - 1
    }
    return {
      name: keys.get('name'),
      id: keys.get('id'),
      if: keys.get('if'),
      uses: keys.get('uses'),
      with: withEntries,
      env: envEntries,
      run: keys.get('run'),
      keys,
      keyNames,
      lines,
    }
  })
}

// What each line of a workflow is to YAML: a YAML line, a comment, a block scalar's content or blank. A
// block scalar's content is read as blockScalar() reads it: the lines past its key, ending at the first
// indented less than its first line, so a line starting with # inside it is content (bash's to read, and
// in a quoted string or a here-document no comment at all), never a YAML comment.
type LineKind = 'yaml' | 'comment' | 'content' | 'blank'
function lineKinds(text: string): LineKind[] {
  const kinds: LineKind[] = []
  let blockKey: number | undefined
  let blockIndent: number | undefined
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      kinds.push('blank')
      continue
    }
    if (blockKey !== undefined) {
      const indent = indentOf(line)
      if (indent > blockKey && (blockIndent === undefined || indent >= blockIndent)) {
        blockIndent ??= indent
        kinds.push('content')
        continue
      }
      blockKey = undefined
      blockIndent = undefined
    }
    if (/^\s*#/.test(line)) {
      kinds.push('comment')
      continue
    }
    kinds.push('yaml')
    const key = KEY_LINE.exec(line)
    if (key && BLOCK_SCALAR.test((key[3] ?? '').trim())) {
      blockKey = /^\s*-\s/.test(line) ? indentOf(line) + 2 : indentOf(line)
    }
  }
  return kinds
}

// The lines of a workflow that are YAML rather than a block scalar's content or a comment, each with
// its index, for the checks of the file's own shape.
export function yamlLines(text: string): Array<{ index: number; text: string }> {
  const lines = text.split('\n')
  return lineKinds(text).flatMap((kind, index) => (kind === 'yaml' ? [{ index, text: lines[index] ?? '' }] : []))
}

// The lines (by index) that are YAML comments: outside every block scalar's content (lineKinds).
export function commentLines(text: string): number[] {
  return lineKinds(text).flatMap((kind, index) => (kind === 'comment' ? [index] : []))
}

// The lines (by index) whose key's value is a block scalar other than a literal one with no indentation
// indicator: folded (>), whose lines YAML joins, or with an indentation indicator, which sets an indent
// this reader doesn't take (DPW-02 refuses each in deploy.yml, whose runs it reads as bash).
export function literalProblems(text: string): number[] {
  return yamlLines(text).flatMap(({ index, text: line }) => {
    const value = (KEY_LINE.exec(line)?.[3] ?? '').trim()
    return BLOCK_SCALAR.test(value) && !LITERAL_SCALAR.test(value) ? [index] : []
  })
}

// The lines (by index) whose key's value is a block scalar with an indentation indicator (|2, >-1), whose
// content YAML takes at an indent this reader doesn't, so a line YAML reads as content would be read
// here as YAML or the other way round (DPW-02 refuses each in every workflow; a folded one, which no rule
// outside deploy.yml reads as bash, stays allowed there).
export function indicatorProblems(text: string): number[] {
  return yamlLines(text).flatMap(({ index, text: line }) => {
    const value = (KEY_LINE.exec(line)?.[3] ?? '').trim()
    return BLOCK_SCALAR.test(value) && /^[|>][+-]?[1-9]/.test(value) ? [index] : []
  })
}

// A value that starts with a node property (an anchor &, an alias *, a tag !), which this reader would
// read as plain text.
const NODE_PROPERTY = /^[&*!]/
// A plain value that starts with an indicator YAML reads as structure, not text: - and a blank (a nested
// sequence), ? and a blank (a complex key) or : and a blank (an empty key).
const STRUCTURE = /^[-?:](?:\s|$)/

// Whether a flow sequence's items, between its brackets, are read here as YAML reads them: split at each
// comma outside quotes (a comma inside a quoted item would split it here, so none may hold one), each item
// a quoted scalar whole or a plain one starting with no node property or indicator and holding no : with a
// blank or at its end (YAML reads that item as a mapping) and no #.
function flowItemsRead(inner: string): boolean {
  if (inner.trim() === '') return true
  const items: string[] = []
  let item = ''
  let quote: string | undefined
  for (const c of inner) {
    if (quote !== undefined) {
      if (c === ',') return false
      if (c === quote) quote = undefined
      item += c
    } else if (c === ',') {
      items.push(item)
      item = ''
    } else {
      if ((c === '"' || c === "'") && item.trim() === '') quote = c
      item += c
    }
  }
  if (quote !== undefined) return false
  items.push(item)
  return items.every(each => {
    const text = each.trim()
    if (text.startsWith('"')) return /^"[^"\\]*"$/.test(text)
    if (text.startsWith("'")) return /^'(?:[^']|'')*'$/.test(text)
    return text !== '' && !NODE_PROPERTY.test(text) && !STRUCTURE.test(text) && !/:(?:\s|$)|#/.test(text)
  })
}

// The lines (by index) in none of the shapes this reader reads, so a check can refuse a file it would
// otherwise read wrong (DPW-02). Each YAML line (yamlLines) sits two spaces inside the key that opens
// it, at the indent of the mapping or sequence it belongs to: a key (`name:` or `name: value`, the
// name a plain word, given once in its mapping) or a sequence item (`- value`, or `- name:` starting a
// mapping whose keys sit two spaces in). A value after its key is whole on its line, and starts with
// no anchor, alias or tag: a block scalar's indicator, a plain scalar no line below continues (anything
// deeper under it is refused) and that starts with no indicator YAML reads as structure (STRUCTURE), a
// quoted scalar closed on the line, a flow sequence closed on the line whose items are scalars read as
// YAML reads them (flowItemsRead), or the empty flow mapping {}.
export function shapeProblems(text: string): number[] {
  const problems: number[] = []
  const open: Array<{ indent: number; kind: 'map' | 'list' | undefined; keys: Set<string> }> = [
    { indent: 0, kind: 'map', keys: new Set() },
  ]
  for (const { index, text: line } of yamlLines(text)) {
    const indent = indentOf(line)
    while (open.length > 1 && (open[open.length - 1]?.indent ?? 0) > indent) open.pop()
    const block = open[open.length - 1]
    const body = line.slice(indent)
    const item = /^- (?! )/.test(body)
    if (block === undefined || block.indent !== indent || block.kind === (item ? 'map' : 'list')) {
      problems.push(index)
      continue
    }
    block.kind = item ? 'list' : 'map'
    const rest = item ? body.slice(2) : body
    const key = /^([\w-]+):(?:\s+(.*))?$/.exec(rest)
    if (!key && !item) {
      problems.push(index)
      continue
    }
    if (key && !item && block.keys.has(key[1] ?? '')) {
      problems.push(index)
      continue
    }
    if (key && !item) block.keys.add(key[1] ?? '')
    // An item that is a mapping: its keys sit two spaces past its dash.
    if (key && item) open.push({ indent: indent + 2, kind: 'map', keys: new Set([key[1] ?? '']) })
    const value = key ? (key[2] ?? '').trim() : rest.trim()
    if (key && (value === '' || value.startsWith('#'))) {
      open.push({ indent: (item ? indent + 2 : indent) + 2, kind: undefined, keys: new Set() })
      continue
    }
    const flow = /^\[([^[\]{}]*)\]\s*(?:#.*)?$/.exec(value)
    const whole =
      !NODE_PROPERTY.test(value) &&
      (BLOCK_SCALAR.test(value) ||
        (value.startsWith("'")
          ? /^'(?:[^']|'')*'\s*(?:#.*)?$/.test(value)
          : value.startsWith('"')
            ? /^"(?:[^"\\]|\\.)*"\s*(?:#.*)?$/.test(value)
            : value.startsWith('[')
              ? flow !== null && flowItemsRead(flow[1] ?? '')
              : value.startsWith('{')
                ? /^\{\s*\}\s*(?:#.*)?$/.test(value)
                : !STRUCTURE.test(value)))
    if (!whole) problems.push(index)
  }
  return problems
}
