// What check-catalogues.ts compares, as pure functions over what it reads from the database, so
// catalogues.test.ts can prove each check fails when it should (TECH-SPEC T16 item 7, T17 item 1,
// T18, T22 item 18, T23 item 19). Each problem names the gap and how to close it.
import {
  CONTENT_TABLES,
  EVENTS,
  type EventType,
  type FlagSpec,
  holdsOf,
  isAiFlag,
  type PurposeSpec,
  type RetentionClass,
} from '@hearth/shared'
import type { DeletePath } from '#src/lifecycle/deletes.ts'
import { type Coverage, grantKey } from '#src/outbox/coverage.ts'

// A write a runtime role may make through a grant: a row operation by table, an update by column.
export interface Grant {
  role: string
  table: string
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  column?: string
}

// A function a runtime transaction can reach: one a runtime role may execute, a SECURITY DEFINER
// function, or a trigger function. `key` is '<name>(<argument types>)'; `source` its body
// (pg_proc.prosrc), `atomic` whether it is written with BEGIN ATOMIC (pg_proc.prosqlbody, with no
// source) and `executors` the runtime roles that may execute it, for bodyProblems.
export interface Fn {
  key: string
  definer: boolean
  trigger: boolean
  source?: string
  atomic?: boolean
  executors?: readonly string[]
}

const grantText = (grant: Grant) =>
  grant.op === 'UPDATE'
    ? `${grant.role} may UPDATE public.${grant.table}.${grant.column}`
    : `${grant.role} may ${grant.op} rows of public.${grant.table}`

// 1. Every way to write is covered, and no entry is stale.
export function coverageProblems(
  writes: Readonly<Record<string, Coverage>>,
  grants: readonly Grant[],
  functions: readonly Fn[],
): string[] {
  const problems: string[] = []
  const known = new Set<string>()
  for (const grant of grants) {
    const key = grantKey(grant.role, grant.table, grant.op, grant.column)
    known.add(key)
    if (writes[key] === undefined) {
      problems.push(
        `${grantText(grant)}, but apps/server/src/outbox/coverage.ts doesn't say which event covers it or why it's exempt: add '${key}'`,
      )
    }
  }
  for (const fn of functions) {
    known.add(fn.key)
    const entry = writes[fn.key]
    const kind = fn.trigger ? 'trigger function' : fn.definer ? 'SECURITY DEFINER function' : 'function'
    if (entry === undefined) {
      problems.push(
        `the ${kind} public.${fn.key} can run in a runtime transaction, but apps/server/src/outbox/coverage.ts doesn't list what it writes (writes: [] if nothing) and what covers it: add '${fn.key}'`,
      )
    } else if (entry.writes === undefined) {
      problems.push(
        `apps/server/src/outbox/coverage.ts's '${fn.key}' must list the writes it makes (writes: [] if none)`,
      )
    }
  }
  for (const key of Object.keys(writes)) {
    if (!known.has(key)) {
      problems.push(
        `apps/server/src/outbox/coverage.ts covers '${key}', which no runtime role's grant or reachable function matches any more: remove it`,
      )
    }
  }
  return problems
}

// A function's body with its comments gone and every string literal (quoted, E'', dollar-quoted)
// emptied, in lower case, so a write named in a comment or a message isn't read as one. Quoted
// identifiers stay as written, quotes and case and all ("AuditData" is not auditdata).
export function stripSql(source: string): string {
  let out = ''
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source[i]
    if (c === '-' && source[i + 1] === '-') {
      while (i < n && source[i] !== '\n') i += 1
      out += ' '
    } else if (c === '/' && source[i + 1] === '*') {
      let depth = 0
      do {
        if (source[i] === '/' && source[i + 1] === '*') {
          depth += 1
          i += 2
        } else if (source[i] === '*' && source[i + 1] === '/') {
          depth -= 1
          i += 2
        } else i += 1
      } while (i < n && depth > 0)
      out += ' '
    } else if (c === "'") {
      const escapes = /[eE]/.test(source[i - 1] ?? '') && !/[A-Za-z0-9_$]/.test(source[i - 2] ?? '')
      i += 1
      while (i < n) {
        if (escapes && source[i] === '\\') i += 2
        else if (source[i] === "'" && source[i + 1] === "'") i += 2
        else if (source[i] === "'") {
          i += 1
          break
        } else i += 1
      }
      out += "''"
    } else if (c === '$' && !/[A-Za-z0-9_$]/.test(source[i - 1] ?? '')) {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(source.slice(i))?.[0]
      if (tag === undefined) {
        out += c
        i += 1
      } else {
        const end = source.indexOf(tag, i + tag.length)
        i = end < 0 ? n : end + tag.length
        out += "''"
      }
    } else if (c === '"') {
      const start = i
      i += 1
      while (i < n && !(source[i] === '"' && source[i + 1] !== '"')) i += source[i] === '"' ? 2 : 1
      i += 1
      out += source.slice(start, i)
    } else {
      out += c?.toLowerCase()
      i += 1
    }
  }
  return out
}

// An identifier: quoted (any characters, "" for a quote, its case kept) or not (folded to lower
// case, as Postgres does, which stripSql has done). IDENT captures it; ident() gives its name.
const IDENT = String.raw`("(?:[^"]|"")+"|[\p{L}_][\p{L}\p{N}_$]*)`
const IDENT_ANY = String.raw`(?:"(?:[^"]|"")+"|[\p{L}_][\p{L}\p{N}_$]*)`
const ident = (raw: string): string => (raw.startsWith('"') ? raw.slice(1, -1).replaceAll('""', '"') : raw)

// The columns a SET list names, read from just after `set`: each item, at the start and after
// each comma outside brackets, is `column = ...` or `(a, b) = ...`, and the list ends at the first
// item that isn't one (a FROM list's second table, RETURNING's second column), a semicolon or the
// bracket that closes its statement. A list it can't read gives '?', which no entry lists, so the
// check fails rather than miss a column.
function setColumns(text: string, from: number): string[] {
  const columns: string[] = []
  const ITEM = new RegExp(String.raw`^\s*(?:${IDENT}\s*(?:\[[^\]]*\]\s*)?|\(([^()]*)\)\s*)=(?!=)`, 'u')
  const NAME = new RegExp(String.raw`^\s*${IDENT}\s*$`, 'u')
  let depth = 0
  let item = true
  let i = from
  while (i < text.length) {
    if (item) {
      const match = ITEM.exec(text.slice(i))
      if (match === null) break
      columns.push(
        ...(match[1] !== undefined
          ? [ident(match[1])]
          : (match[2] ?? '').split(',').map(name => {
              const raw = NAME.exec(name)?.[1]
              return raw === undefined ? '?' : ident(raw)
            })),
      )
      i += match[0].length
      item = false
      continue
    }
    const c = text[i]
    if (depth === 0 && (c === ';' || c === ')' || c === ']')) break
    if (c === '(' || c === '[') depth += 1
    else if (c === ')' || c === ']') depth -= 1
    else if (c === ',' && depth === 0) item = true
    i += 1
  }
  return columns.length > 0 ? columns : ['?']
}

// A schema-qualified table of public, quoted or not. A name after `public.` it can't read
// captures nothing, and is reported as the table '?', which no entry lists, so the check fails
// rather than miss the write.
const TABLE = String.raw`(?:public|"public")\s*\.\s*${IDENT}?`
const tableName = (raw: string | undefined): string => (raw === undefined ? '?' : ident(raw))

// The writes a function's body makes: every `insert into`, `update` (by each column its SET list
// names) and `delete from` a table of public, with or without ONLY, an upsert's `on conflict ... do
// update set` as an UPDATE of its columns, and `merge into` as what its own action clauses do: an
// INSERT for `then insert`, a DELETE for `then delete` and an UPDATE of the columns each `then update
// set` names (`then do nothing` writes nothing). Every SECURITY DEFINER function must schema-qualify its
// tables under search_path = '' (and every function here does). Dynamic SQL (EXECUTE) and BEGIN
// ATOMIC bodies can't be read this way, and bodyProblems refuses them.
export function bodyWrites(source: string): Array<{ table: string; op: Grant['op']; column?: string }> {
  const text = stripSql(source)
  const found: Array<{ at: number; table: string; op: Grant['op']; column?: string }> = []
  const inserts: Array<{ at: number; table: string }> = []
  for (const match of text.matchAll(new RegExp(String.raw`\binsert\s+into\s+${TABLE}`, 'gu'))) {
    const table = tableName(match[1])
    inserts.push({ at: match.index, table })
    found.push({ at: match.index, table, op: 'INSERT' })
  }
  for (const match of text.matchAll(new RegExp(String.raw`\bdelete\s+from\s+(?:only\s+)?${TABLE}`, 'gu'))) {
    found.push({ at: match.index, table: tableName(match[1]), op: 'DELETE' })
  }
  const update = new RegExp(
    String.raw`\bupdate\s+(?:only\s+)?${TABLE}(?:\s*\*)?(?:\s+(?:as\s+)?(?!set\b)${IDENT_ANY})?\s+set\b`,
    'gu',
  )
  for (const match of text.matchAll(update)) {
    for (const column of setColumns(text, match.index + match[0].length)) {
      found.push({ at: match.index, table: tableName(match[1]), op: 'UPDATE', column })
    }
  }
  for (const match of text.matchAll(new RegExp(String.raw`\bupdate\s+(?:only\s+)?${TABLE}`, 'gu'))) {
    if (!found.some(write => write.at === match.index)) {
      found.push({ at: match.index, table: tableName(match[1]), op: 'UPDATE', column: '?' })
    }
  }
  for (const match of text.matchAll(/\bon\s+conflict\b[^;]*?\bdo\s+update\s+set\b/g)) {
    const insert = inserts.filter(row => row.at < match.index).at(-1)
    for (const column of setColumns(text, match.index + match[0].length)) {
      found.push({ at: match.index, table: insert?.table ?? '?', op: 'UPDATE', column })
    }
  }
  for (const match of text.matchAll(new RegExp(String.raw`\bmerge\s+into\s+(?:only\s+)?${TABLE}`, 'gu'))) {
    const table = tableName(match[1])
    // Only this statement's own action clauses (DO NOTHING writes nothing).
    const end = text.indexOf(';', match.index)
    const statement = text.slice(match.index, end < 0 ? text.length : end)
    if (/\bthen\s+insert\b/.test(statement)) found.push({ at: match.index, table, op: 'INSERT' })
    if (/\bthen\s+delete\b/.test(statement)) found.push({ at: match.index, table, op: 'DELETE' })
    for (const clause of statement.matchAll(/\bthen\s+update\s+set\b/g)) {
      for (const column of setColumns(text, match.index + clause.index + clause[0].length)) {
        found.push({ at: match.index, table, op: 'UPDATE', column })
      }
    }
  }
  const seen = new Map<string, { table: string; op: Grant['op']; column?: string }>()
  for (const { at: _, ...write } of found.sort((a, b) => a.at - b.at)) {
    const key = `${write.table}:${write.op}:${write.column ?? ''}`
    if (!seen.has(key)) seen.set(key, write)
  }
  return [...seen.values()]
}

// Functions whose body runs dynamic SQL (EXECUTE) that only changes the schema and writes no row,
// with why; bodyProblems refuses EXECUTE in any other. Adding one is a reviewed change.
export const DYNAMIC_DDL: Readonly<Record<string, string>> = {
  'create_data_access_partitions(integer)':
    "creates data_access_events' month partitions and turns on their row level security",
}

const verbOf = (op: Grant['op'], table: string, column?: string): string =>
  op === 'INSERT'
    ? `insert into public.${table}`
    : op === 'DELETE'
      ? `delete from public.${table}`
      : column === undefined
        ? `update public.${table}`
        : `update public.${table} set ${column}`

// Every write a function's body makes is in its entry's `writes`, with the same operation and, for
// an UPDATE, the same column, unless every runtime role that may execute it holds that write itself
// (the same column, for an UPDATE), so its grant's entry covers it (set_feature_flag()'s audit row).
// A trigger runs for whoever writes its table, so only its `writes` count. Without this, a function
// could write a table or a column its entry doesn't list, and the sweep would credit the write to
// another function's entry. A body this can't read is refused: one written with BEGIN ATOMIC
// (Postgres keeps no source text for it), and dynamic SQL outside DYNAMIC_DDL.
export function bodyProblems(
  writes: Readonly<Record<string, Coverage>>,
  functions: readonly Fn[],
  grants: readonly Grant[],
  dynamic: Readonly<Record<string, string>> = DYNAMIC_DDL,
): string[] {
  const problems: string[] = []
  for (const fn of functions) {
    if (fn.atomic === true) {
      problems.push(
        `public.${fn.key} is written with BEGIN ATOMIC, whose writes check-catalogues can't read: write its body as a quoted string (as $$ ... $$)`,
      )
      continue
    }
    if (fn.source !== undefined && /\bexecute\b/.test(stripSql(fn.source)) && dynamic[fn.key] === undefined) {
      problems.push(
        `public.${fn.key} runs dynamic SQL (EXECUTE), whose writes check-catalogues can't read: write them as plain statements, or, if it only changes the schema, add it to DYNAMIC_DDL in apps/server/scripts/catalogues.ts with why`,
      )
    }
    const declared = writes[fn.key]?.writes
    if (declared === undefined || fn.source === undefined) continue
    for (const { table, op, column } of bodyWrites(fn.source)) {
      const listed = declared.includes(op === 'UPDATE' ? `${table}.${column}:UPDATE` : `${table}:${op}`)
      if (listed) continue
      const executors = fn.executors ?? []
      const granted =
        !fn.trigger &&
        executors.length > 0 &&
        executors.every(role =>
          grants.some(
            grant =>
              grant.role === role &&
              grant.table === table &&
              grant.op === op &&
              (op !== 'UPDATE' || grant.column === column),
          ),
        )
      if (granted) continue
      const add = op === 'UPDATE' ? `'${table}.${column}:UPDATE'` : `'${table}:${op}'`
      problems.push(
        table === '?'
          ? `public.${fn.key} runs ${op === 'INSERT' ? 'insert into' : op === 'DELETE' ? 'delete from' : 'update'} a table of public whose name check-catalogues can't read: write it as a plain or quoted identifier`
          : column === '?'
            ? `public.${fn.key} runs update public.${table}, but check-catalogues can't read which columns it sets: name them in a plain SET list`
            : `public.${fn.key} runs ${verbOf(op, table, column)}, but its entry in apps/server/src/outbox/coverage.ts doesn't list that write: add ${add} to its writes`,
      )
    }
  }
  const keys = new Set(functions.map(fn => fn.key))
  for (const key of Object.keys(dynamic)) {
    if (!keys.has(key))
      problems.push(
        `DYNAMIC_DDL in apps/server/scripts/catalogues.ts lists ${key}, which no reachable function is: remove it`,
      )
  }
  return problems
}

// Every table an entry requires an event for must say which column the event names, and the column
// must exist.
export function matchProblems(
  writes: Readonly<Record<string, Coverage>>,
  match: Readonly<Record<string, string>>,
  columns: ReadonlySet<string>,
): string[] {
  const problems: string[] = []
  for (const [table, column] of Object.entries(match)) {
    if (!columns.has(`${table}.${column}`)) {
      problems.push(`apps/server/src/outbox/coverage.ts's MATCH names public.${table}.${column}, which doesn't exist`)
    }
  }
  for (const [key, coverage] of Object.entries(writes)) {
    if (!('events' in coverage)) continue
    const tables = /^hearth_[a-z0-9_]+ ([a-z_]+)[.:]/.exec(key)?.[1]
    const written =
      tables !== undefined ? [tables] : (coverage.writes ?? []).map(write => /^([a-z_]+)[.:]/.exec(write)?.[1])
    for (const table of written) {
      if (table !== undefined && match[table] === undefined) {
        problems.push(
          `'${key}' needs an event, but MATCH in apps/server/src/outbox/coverage.ts doesn't say which column of ${table} the event must name`,
        )
      }
    }
  }
  return problems
}

// A content table may not have an exemption, by its grant or through a function that writes it:
// every content write appends its event with its snapshot (CLAUDE.md, Build order). The content
// tables are packages/shared CONTENT_TABLES, and any table an entry covers with an event that
// carries an ACL snapshot.
export function contentProblems(
  writes: Readonly<Record<string, Coverage>>,
  carriesSnapshot: (type: EventType) => boolean = type => (EVENTS[type].acl as string) === 'snapshot',
  contentTables: readonly string[] = CONTENT_TABLES,
): string[] {
  const tableOf = (key: string): string | undefined => /^hearth_[a-z0-9_]+ ([a-z_]+)[.:]/.exec(key)?.[1]
  const writtenBy = (key: string, coverage: Coverage): string[] => {
    const table = tableOf(key)
    if (table !== undefined) return [table]
    return (coverage.writes ?? []).flatMap(write => /^([a-z_][a-z0-9_]*)[.:]/.exec(write)?.[1] ?? [])
  }
  const content = new Set<string>(contentTables)
  for (const [key, coverage] of Object.entries(writes)) {
    if ('events' in coverage && coverage.events.some(carriesSnapshot)) {
      for (const table of writtenBy(key, coverage)) content.add(table)
    }
  }
  const problems: string[] = []
  for (const [key, coverage] of Object.entries(writes)) {
    if (!('exempt' in coverage)) continue
    for (const table of new Set(writtenBy(key, coverage))) {
      if (content.has(table)) {
        problems.push(
          `'${key}' is exempt, but writes ${table}, which holds content, whose every write appends its event with an ACL snapshot`,
        )
      }
    }
  }
  return problems
}

// 2. The catalogue's names equal the outbox's type check, both ways.
export function eventProblems(catalogue: readonly string[], database: readonly string[]): string[] {
  const inDatabase = new Set(database)
  const inCatalogue = new Set(catalogue)
  return [
    ...catalogue
      .filter(type => !inDatabase.has(type))
      .map(type => `${type} is in packages/shared EVENTS but not in outbox_events_type: a migration adds it`),
    ...database
      .filter(type => !inCatalogue.has(type))
      .map(type => `${type} is in outbox_events_type but not in packages/shared EVENTS: add it to the catalogue`),
  ]
}

// 3. The flag registry equals feature_flag_defaults(), both ways, and every ai.* flag is off and
// locked in both.
export function flagProblems(
  registry: Readonly<Record<string, FlagSpec>>,
  defaults: readonly { key: string; enabled: boolean; locked: boolean }[],
): string[] {
  const problems: string[] = []
  const byKey = new Map(defaults.map(row => [row.key, row]))
  for (const [key, spec] of Object.entries(registry)) {
    const row = byKey.get(key)
    if (row === undefined) {
      problems.push(`${key} is in packages/shared FLAGS but not in feature_flag_defaults(): a migration adds it`)
      continue
    }
    if (row.enabled !== spec.default || row.locked !== spec.locked) {
      problems.push(
        `${key}: FLAGS says default ${spec.default}, locked ${spec.locked}; feature_flag_defaults() says ${row.enabled}, ${row.locked}`,
      )
    }
    if (isAiFlag(key) && (spec.default || !spec.locked))
      problems.push(`${key} is an AI flag, so FLAGS must keep it off and locked until A0`)
  }
  for (const row of defaults) {
    if (!Object.hasOwn(registry, row.key)) {
      problems.push(`${row.key} is in feature_flag_defaults() but not in packages/shared FLAGS: register it`)
    }
    if (isAiFlag(row.key) && (row.enabled || !row.locked)) {
      problems.push(`${row.key} is an AI flag, so feature_flag_defaults() must keep it off and locked until A0`)
    }
  }
  return problems
}

// 4. JOB_ROLES equals the job roles hearth_worker may take.
export function roleProblems(code: readonly string[], database: readonly string[]): string[] {
  return [
    ...code
      .filter(role => !database.includes(role))
      .map(
        role => `${role} is in apps/server/src/db/roles.ts JOB_ROLES, but hearth_worker can't SET it in the database`,
      ),
    ...database
      .filter(role => !code.includes(role))
      .map(role => `hearth_worker can SET ${role}, which apps/server/src/db/roles.ts JOB_ROLES doesn't list`),
  ]
}

// 5. Each outbox consumer the worker runs (productionRegistries) is bound in
// outbox_checkpoints_own_row() to the role it runs as, and every name bound there is one of them
// (0008; TECH-SPEC T16 item 3), so a consumer added without its binding, or bound to another role,
// fails here rather than leaving its checkpoint open to another role. The binding is read from the
// function's body: one CASE on new.consumer, holding only `when '<consumer>' then '<role>'` pairs.
// Anything else there (an ELSE, a comment, a pair of another shape, a name twice, a second such
// CASE) leaves it unread (undefined), which is itself a problem: fail closed.
const BINDING_CASE = /\bcase\s+new\s*\.\s*consumer\b([\s\S]*?)\bend\b/gi
const BINDING_PAIR = /\bwhen\s+'([^']*)'\s+then\s+'([^']*)'/gi

export function checkpointBindings(source: string): ReadonlyMap<string, string> | undefined {
  const cases = [...source.matchAll(BINDING_CASE)]
  if (cases.length !== 1) return undefined
  const body = cases[0]?.[1] ?? ''
  if (body.replace(BINDING_PAIR, '').trim() !== '') return undefined
  const bound = new Map<string, string>()
  for (const [, name, role] of body.matchAll(BINDING_PAIR)) {
    if (name === undefined || role === undefined || bound.has(name)) return undefined
    bound.set(name, role)
  }
  return bound
}

// What check-catalogues.ts saw when it tried a consumer's checkpoint in a transaction it rolled
// back: whether a row naming another job role was refused, and one naming its own accepted. This
// proves the binding the body reads is the one the trigger enforces.
export interface BindingProbe {
  consumer: string
  otherRefused: boolean
  ownAccepted: boolean
}

const OWN_ROW = 'outbox_checkpoints_own_row()'

export function bindingProblems(
  consumers: readonly { name: string; role: string }[],
  bound: ReadonlyMap<string, string> | undefined,
  probes: readonly BindingProbe[],
): string[] {
  const problems: string[] = []
  if (bound === undefined) {
    problems.push(
      `check-catalogues can't read ${OWN_ROW}'s binding: keep it one CASE on new.consumer holding only when '<consumer>' then '<role>' pairs`,
    )
  } else {
    for (const { name, role } of consumers) {
      const to = bound.get(name)
      if (to === undefined) {
        problems.push(
          `the worker's consumer ${name} isn't bound in ${OWN_ROW}: the migration that adds it binds it to ${role}`,
        )
      } else if (to !== role) {
        problems.push(`the worker's consumer ${name} runs as ${role}, but ${OWN_ROW} binds it to ${to}`)
      }
    }
    const names = new Set(consumers.map(consumer => consumer.name))
    for (const [name, role] of bound) {
      if (!names.has(name)) {
        problems.push(
          `${OWN_ROW} binds ${name} to ${role}, but no consumer the worker runs (apps/server/src/worker/index.ts productionRegistries) is called ${name}`,
        )
      }
    }
  }
  for (const consumer of consumers) {
    const probe = probes.find(p => p.consumer === consumer.name)
    if (probe === undefined) problems.push(`check-catalogues didn't try a checkpoint of ${consumer.name}`)
    else {
      if (!probe.otherRefused) {
        problems.push(`a checkpoint of ${consumer.name} naming a role other than ${consumer.role} was accepted`)
      }
      if (!probe.ownAccepted) problems.push(`a checkpoint of ${consumer.name} naming ${consumer.role} was refused`)
    }
  }
  return problems
}

// 6. The registers' starting rows equal the code that judges them (C0.9 PD-03, PD-04, PD-06, PD-07;
// TECH-SPEC T22 items 4 and 18), both ways: processing_register_defaults() lists exactly PURPOSES,
// each with ai and needs_switch as PURPOSES has them, pinned exactly for PINNED_PURPOSES and a
// starting status of active exactly for ACTIVE_FROM_START (planned otherwise);
// transfer_register_defaults() lists exactly PROVIDERS, with ai exactly for AI_PROVIDERS. Every org
// in the database (and one the check makes, whose rows come from the trigger on orgs) has exactly
// those version-1 purpose rows and provider rows, and every later version keeps its version 1's
// fixed columns, which nothing but a migration may change.
export interface RegisterCode {
  purposes: Readonly<Record<string, PurposeSpec>>
  pinned: readonly string[]
  activeFromStart: readonly string[]
  providers: readonly string[]
  aiProviders: readonly string[]
}

export interface PurposeDefault {
  purpose: string
  ai: boolean
  pinned: boolean
  needs_switch: boolean
  status: string
}

export interface ProviderDefault {
  provider: string
  ai: boolean
}

// One org's rows: its purposes' version 1, its providers, and the later versions (purpose and
// version) whose fixed columns differ from their version 1's.
export interface OrgRegisters {
  org: string
  purposes: readonly PurposeDefault[]
  providers: readonly ProviderDefault[]
  drifted: readonly { purpose: string; version: number }[]
}

const fixed = (row: PurposeDefault) =>
  `ai ${row.ai}, pinned ${row.pinned}, needs_switch ${row.needs_switch}, status ${row.status}`

export function registerProblems(
  code: RegisterCode,
  purposeDefaults: readonly PurposeDefault[],
  providerDefaults: readonly ProviderDefault[],
  orgs: readonly OrgRegisters[],
): string[] {
  const problems: string[] = []
  // What code says each purpose starts as.
  const expected = Object.entries(code.purposes).map(
    ([purpose, spec]): PurposeDefault => ({
      purpose,
      ai: spec.ai,
      pinned: code.pinned.includes(purpose),
      needs_switch: spec.needsSwitch,
      status: code.activeFromStart.includes(purpose) ? 'active' : 'planned',
    }),
  )
  const byPurpose = new Map(purposeDefaults.map(row => [row.purpose, row]))
  for (const want of expected) {
    const row = byPurpose.get(want.purpose)
    if (row === undefined) {
      problems.push(
        `${want.purpose} is in packages/shared PURPOSES but not in processing_register_defaults(): a migration adds it, with rows for the orgs already there`,
      )
    } else if (fixed(row) !== fixed(want)) {
      problems.push(
        `${want.purpose}: packages/shared says ${fixed(want)} (PURPOSES, PINNED_PURPOSES, ACTIVE_FROM_START); processing_register_defaults() says ${fixed(row)}`,
      )
    }
  }
  for (const row of purposeDefaults) {
    if (!Object.hasOwn(code.purposes, row.purpose)) {
      problems.push(`${row.purpose} is in processing_register_defaults() but not in packages/shared PURPOSES: add it`)
    }
  }
  const byProvider = new Map(providerDefaults.map(row => [row.provider, row]))
  for (const provider of code.providers) {
    const row = byProvider.get(provider)
    const ai = code.aiProviders.includes(provider)
    if (row === undefined) {
      problems.push(
        `${provider} is in packages/shared PROVIDERS but not in transfer_register_defaults(): a migration adds it, with rows for the orgs already there`,
      )
    } else if (row.ai !== ai) {
      problems.push(
        `${provider}: packages/shared says ai ${ai} (AI_PROVIDERS); transfer_register_defaults() says ai ${row.ai}`,
      )
    }
  }
  for (const row of providerDefaults) {
    if (!code.providers.includes(row.provider)) {
      problems.push(`${row.provider} is in transfer_register_defaults() but not in packages/shared PROVIDERS: add it`)
    }
  }
  const purposesWanted = new Map(purposeDefaults.map(row => [row.purpose, fixed(row)]))
  const providersWanted = new Map(providerDefaults.map(row => [row.provider, row.ai]))
  for (const { org, purposes, providers, drifted } of orgs) {
    const has = new Map(purposes.map(row => [row.purpose, fixed(row)]))
    for (const [purpose, want] of purposesWanted) {
      const got = has.get(purpose)
      if (got === undefined) problems.push(`org ${org} has no version 1 of ${purpose} in processing_register`)
      else if (got !== want) {
        problems.push(`org ${org}'s version 1 of ${purpose} says ${got}; processing_register_defaults() says ${want}`)
      }
    }
    for (const purpose of has.keys()) {
      if (!purposesWanted.has(purpose)) {
        problems.push(
          `org ${org} has ${purpose} in processing_register, which processing_register_defaults() doesn't list`,
        )
      }
    }
    const holds = new Map(providers.map(row => [row.provider, row.ai]))
    for (const [provider, ai] of providersWanted) {
      const got = holds.get(provider)
      if (got === undefined) problems.push(`org ${org} has no ${provider} entry in transfer_register`)
      else if (got !== ai) {
        problems.push(`org ${org}'s ${provider} entry says ai ${got}; transfer_register_defaults() says ai ${ai}`)
      }
    }
    for (const provider of holds.keys()) {
      if (!providersWanted.has(provider)) {
        problems.push(
          `org ${org} has ${provider} in transfer_register, which transfer_register_defaults() doesn't list`,
        )
      }
    }
    for (const { purpose, version } of drifted) {
      problems.push(
        `org ${org}'s version ${version} of ${purpose} has other fixed columns (ai, pinned, needs_switch) than its version 1: every version copies them`,
      )
    }
  }
  return problems
}

// 6, from C0.9 PR 2: the facts a notice version states about a provider (C0.9 PD-41, TECH-SPEC T22
// item 18) are the same in code and in the database, both ways: packages/shared
// NOTICE_TRANSFER_FACTS lists exactly the keys notice_facts() (0010) builds, and notice_facts() reads
// each from the snapshot's key of the same name. probe is what notice_facts() returned for a
// snapshot that holds every key a clearance's snapshot may (transfer_register_facts(), 0009) with
// the value `v:<key>` (noticeFactProbe()), so a fact it reads from another key shows.
export const noticeFactProbe = (keys: readonly string[]): Record<string, string> =>
  Object.fromEntries(keys.map(key => [key, `v:${key}`]))

export function noticeFactProblems(code: readonly string[], probe: unknown): string[] {
  if (typeof probe !== 'object' || probe === null || Array.isArray(probe)) {
    return ['notice_facts() returned no object']
  }
  const stated = probe as Record<string, unknown>
  const problems: string[] = []
  for (const key of code) {
    if (!Object.hasOwn(stated, key)) {
      problems.push(`${key} is in packages/shared NOTICE_TRANSFER_FACTS but notice_facts() doesn't state it`)
    } else if (stated[key] !== `v:${key}`) {
      problems.push(`notice_facts() states ${key} from another fact of the snapshot`)
    }
  }
  for (const key of Object.keys(stated)) {
    if (!code.includes(key)) {
      problems.push(`notice_facts() states ${key}, which packages/shared NOTICE_TRANSFER_FACTS doesn't list`)
    }
  }
  return problems
}

// --- C0.10: the retention registry (check 7) and the delete paths (check 8) ---------------------
// TECH-SPEC T23 items 3, 8, 9 and 19; LH-04, LH-12, LH-14.

// A function body cut into its pieces, as stripSql reads it: code, comments, string literals (quoted,
// E'' and dollar-quoted, with their quotes, and `body` their contents) and quoted identifiers.
interface SqlPiece {
  kind: 'code' | 'comment' | 'string' | 'ident'
  text: string
  body?: string
}

function sqlPieces(source: string): SqlPiece[] {
  const pieces: SqlPiece[] = []
  const n = source.length
  let code = ''
  const push = (piece: SqlPiece) => {
    if (code !== '') pieces.push({ kind: 'code', text: code })
    code = ''
    pieces.push(piece)
  }
  let i = 0
  while (i < n) {
    const c = source[i]
    const start = i
    if (c === '-' && source[i + 1] === '-') {
      while (i < n && source[i] !== '\n') i += 1
      push({ kind: 'comment', text: source.slice(start, i) })
    } else if (c === '/' && source[i + 1] === '*') {
      let depth = 0
      do {
        if (source[i] === '/' && source[i + 1] === '*') {
          depth += 1
          i += 2
        } else if (source[i] === '*' && source[i + 1] === '/') {
          depth -= 1
          i += 2
        } else i += 1
      } while (i < n && depth > 0)
      push({ kind: 'comment', text: source.slice(start, i) })
    } else if (c === "'") {
      const escapes = /[eE]/.test(source[i - 1] ?? '') && !/[A-Za-z0-9_$]/.test(source[i - 2] ?? '')
      i += 1
      let end = n
      while (i < n) {
        if (escapes && source[i] === '\\') i += 2
        else if (source[i] === "'" && source[i + 1] === "'") i += 2
        else if (source[i] === "'") {
          end = i
          i += 1
          break
        } else i += 1
      }
      push({ kind: 'string', text: source.slice(start, i), body: source.slice(start + 1, end) })
    } else if (c === '$' && !/[A-Za-z0-9_$]/.test(source[i - 1] ?? '')) {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(source.slice(i))?.[0]
      if (tag === undefined) {
        code += c
        i += 1
      } else {
        const close = source.indexOf(tag, i + tag.length)
        i = close < 0 ? n : close + tag.length
        const body = source.slice(start + tag.length, close < 0 ? n : close)
        push({ kind: 'string', text: source.slice(start, i), body })
      }
    } else if (c === '"') {
      i += 1
      while (i < n && !(source[i] === '"' && source[i + 1] !== '"')) i += source[i] === '"' ? 2 : 1
      i += 1
      push({ kind: 'ident', text: source.slice(start, i) })
    } else {
      code += c
      i += 1
    }
  }
  if (code !== '') pieces.push({ kind: 'code', text: code })
  return pieces
}

// A function's body with its comments gone and everything else as written, string literals
// included, so check 7c reads an interval literal never through stripSql, which empties every string
// (DB-10), and never one a comment names.
export function stripComments(source: string): string {
  return sqlPieces(source)
    .map(piece => (piece.kind === 'comment' ? ' ' : piece.text))
    .join('')
}

// The contents of a body's string literals, its comments aside: a DYNAMIC_DDL function's format
// strings, for check 8.
export function stringLiterals(source: string): string[] {
  return sqlPieces(source).flatMap(piece => (piece.kind === 'string' ? [piece.body ?? ''] : []))
}

// One row of retention_class_defaults() (0013), or of packages/shared retentionClassDefaults(), which
// lists what the function must.
export interface ClassDefault {
  key: string
  store: string
  ai: boolean
  period_kind: string
  days: number | null
  anchor: string | null
  follows: string | null
  holds: string
  tables: readonly string[]
}

const CLASS_COLUMNS = ['store', 'ai', 'period_kind', 'days', 'anchor', 'follows', 'holds', 'tables'] as const
const columnText = (row: ClassDefault, column: (typeof CLASS_COLUMNS)[number]): string =>
  column === 'tables' ? `[${[...row.tables].sort().join(', ')}]` : String(row[column])

// 7a. Every class whose data Postgres or S3 holds is a row of retention_class_defaults(), on every
// column, and every row a class, both ways, as check 6 holds PURPOSES (T22 item 18).
export function retentionDefaultProblems(code: readonly ClassDefault[], database: readonly ClassDefault[]): string[] {
  const problems: string[] = []
  const byKey = new Map<string, ClassDefault>()
  for (const row of database) {
    if (byKey.has(row.key)) problems.push(`retention_class_defaults() lists ${row.key} twice`)
    byKey.set(row.key, row)
  }
  for (const want of code) {
    const row = byKey.get(want.key)
    if (row === undefined) {
      problems.push(
        `${want.key} is a Postgres or S3 class in packages/shared RETENTION_CLASSES but not in retention_class_defaults(): a migration replaces the function with it`,
      )
      continue
    }
    const differ = CLASS_COLUMNS.filter(column => columnText(row, column) !== columnText(want, column))
    if (differ.length > 0) {
      problems.push(
        `${want.key}: packages/shared RETENTION_CLASSES says ${differ.map(c => `${c} ${columnText(want, c)}`).join(', ')}; retention_class_defaults() says ${differ.map(c => `${c} ${columnText(row, c)}`).join(', ')}`,
      )
    }
  }
  const inCode = new Set(code.map(row => row.key))
  for (const row of byKey.values()) {
    if (!inCode.has(row.key)) {
      problems.push(
        `${row.key} is in retention_class_defaults() but not a Postgres or S3 class in packages/shared RETENTION_CLASSES: add it there`,
      )
    }
  }
  return problems
}

// 7b. Every table of public (relkind r or p, not a partition, the migrator's ledger aside) is in
// exactly one class's tables, and every name a class lists is such a table, so a new table without a
// class fails its own PR (LH-04).
export function classTableProblems(
  classes: Readonly<Record<string, Pick<RetentionClass, 'tables'>>>,
  tables: readonly string[],
): string[] {
  const problems: string[] = []
  const owners = new Map<string, string[]>()
  for (const [key, spec] of Object.entries(classes)) {
    for (const table of spec.tables) owners.set(table, [...(owners.get(table) ?? []), key])
  }
  const known = new Set(tables)
  for (const table of tables) {
    const of = owners.get(table) ?? []
    if (of.length === 0) {
      problems.push(
        `public.${table} is in no retention class: add it to one class's tables in packages/shared RETENTION_CLASSES, and to retention_class_defaults()`,
      )
    } else if (of.length > 1) {
      problems.push(`public.${table} is in more than one retention class (${of.join(', ')}): keep it in one`)
    }
  }
  for (const [table, of] of owners) {
    if (!known.has(table)) {
      problems.push(`the retention class ${of.join(', ')} lists ${table}, which isn't a table of public`)
    }
  }
  return problems
}

// The distinct `interval '<n> days'` literals a body holds, comments aside, each as '<n> days'.
export function dayIntervals(source: string): string[] {
  const found = new Set<string>()
  for (const match of stripComments(source).matchAll(/\binterval\s*'\s*(\d+)\s+(days?)\s*'/gi)) {
    found.add(`${Number(match[1])} ${(match[2] ?? 'days').toLowerCase()}`)
  }
  return [...found].sort()
}

// 7c. Each fixed age the database enforces is the one its class lists: the distinct interval
// literals in each fixedIn function's body (pg_proc.prosrc, comments stripped) equal the class's
// intervals, so changing an age is a migration and a registry change together (T15's preamble).
// bodies: each function of public by name, with every overload's body.
export function fixedAgeProblems(
  classes: Readonly<Record<string, Pick<RetentionClass, 'fixedIn'>>>,
  bodies: ReadonlyMap<string, readonly string[]>,
): string[] {
  const problems: string[] = []
  for (const [key, spec] of Object.entries(classes)) {
    for (const { fn, intervals } of spec.fixedIn ?? []) {
      const sources = bodies.get(fn) ?? []
      if (sources.length !== 1) {
        problems.push(
          sources.length === 0
            ? `the retention class ${key} says public.${fn}() fixes its age, but there is no such function`
            : `the retention class ${key} says public.${fn}() fixes its age, but public has ${sources.length} functions of that name: check 7c can't tell which`,
        )
        continue
      }
      const held = dayIntervals(sources[0] ?? '')
      const want = [...intervals].sort()
      if (held.join(', ') !== want.join(', ')) {
        problems.push(
          `the retention class ${key} says public.${fn}() fixes ${want.map(i => `'${i}'`).join(', ')}; its body holds interval ${held.map(i => `'${i}'`).join(', ') || 'none'}`,
        )
      }
    }
  }
  return problems
}

// A table of public and the table at the root of its partition tree (itself, for any other).
export interface Relation {
  name: string
  root: string
}

// A trigger of public, as pg_trigger holds it: the relation it is on and that relation's root, its
// name, the function it executes, tgtype, tgenabled and its arguments.
export interface TriggerRow {
  relation: string
  root: string
  name: string
  fn: string
  type: number
  enabled: string
  args: readonly string[]
}

// pg_trigger.tgtype's bits.
const ROW = 1
const BEFORE = 2
const DELETE = 8
const UPDATE = 16
const TRUNCATE = 32
// The guard's triggers and the two history triggers, each with the tgtype it must have: the guard
// BEFORE DELETE FOR EACH ROW, the TRUNCATE refusal BEFORE TRUNCATE FOR EACH STATEMENT,
// deletion_log_kept() BEFORE UPDATE OR DELETE and legal_holds_kept() BEFORE UPDATE, each row by row.
const GUARD_TYPES: Readonly<Record<string, number>> = {
  lifecycle_guard: ROW | BEFORE | DELETE,
  lifecycle_no_truncate: BEFORE | TRUNCATE,
  deletion_log_kept: ROW | BEFORE | UPDATE | DELETE,
  legal_holds_kept: ROW | BEFORE | UPDATE,
}

function triggerTypeText(type: number): string {
  const events = [type & 4 ? 'INSERT' : '', type & DELETE ? 'DELETE' : '', type & UPDATE ? 'UPDATE' : '']
  if (type & TRUNCATE) events.push('TRUNCATE')
  const when = type & BEFORE ? 'BEFORE' : type & 64 ? 'INSTEAD OF' : 'AFTER'
  return `${when} ${events.filter(e => e !== '').join(' OR ')} FOR EACH ${type & ROW ? 'ROW' : 'STATEMENT'}`
}

// 7d. The guard is on exactly the right tables, the way it must be (LH-11, LH-12; C010-SPEC-09):
// every table in GUARDED_TABLES (each of a class whose holds apply) carries lifecycle_guard() with its
// own name as the argument, and every partition of one carries its clone naming the parent; each
// carries lifecycle_no_truncate(); deletion_log carries lifecycle_no_truncate() and
// deletion_log_kept(), and legal_holds legal_holds_kept(); each enabled the default way (O), named as
// its function, with its tgtype; and no other table carries any of them. A migration that disables,
// drops, misnames or re-points one, or enables it ALWAYS, fails here, though the schema digest would
// agree with a fresh build made the same way. applyTables: the tables of classes whose holds apply.
export function guardProblems(
  guarded: readonly string[],
  relations: readonly Relation[],
  triggers: readonly TriggerRow[],
  applyTables: ReadonlySet<string>,
): string[] {
  const problems: string[] = []
  const guardedSet = new Set(guarded)
  const roots = new Set(relations.filter(r => r.name === r.root).map(r => r.name))
  // Where each trigger function must be: relation → the functions it must carry.
  const want = new Map<string, Set<string>>()
  const expect = (relation: string, fn: string) => want.set(relation, new Set([...(want.get(relation) ?? []), fn]))
  for (const table of guarded) {
    if (!roots.has(table)) {
      problems.push(
        `GUARDED_TABLES in apps/server/src/lifecycle/deletes.ts lists ${table}, which isn't a table of public`,
      )
      continue
    }
    if (!applyTables.has(table)) {
      problems.push(
        `GUARDED_TABLES lists ${table}, whose retention class's holds don't apply: the guard belongs only on tables the deletion code deletes held-checked`,
      )
    }
    for (const relation of relations) if (relation.root === table) expect(relation.name, 'lifecycle_guard')
    expect(table, 'lifecycle_no_truncate')
  }
  expect('deletion_log', 'lifecycle_no_truncate')
  expect('deletion_log', 'deletion_log_kept')
  expect('legal_holds', 'legal_holds_kept')
  for (const [relation, fns] of want) {
    for (const fn of fns) {
      const found = triggers.filter(t => t.relation === relation && t.fn === fn)
      const root = relations.find(r => r.name === relation)?.root ?? relation
      const args = fn === 'lifecycle_guard' ? [root] : []
      if (found.length !== 1) {
        problems.push(
          found.length === 0
            ? `public.${relation} has no trigger executing ${fn}(): the migration that adds it creates "${fn}" ${triggerTypeText(GUARD_TYPES[fn] ?? 0)}${args.length > 0 ? ` with the argument '${args[0]}'` : ''}`
            : `public.${relation} has ${found.length} triggers executing ${fn}(): keep one`,
        )
        continue
      }
      const trigger = found[0] as TriggerRow
      if (trigger.name !== fn)
        problems.push(`public.${relation}'s trigger executing ${fn}() is named ${trigger.name}: name it ${fn}`)
      if (trigger.type !== GUARD_TYPES[fn]) {
        problems.push(
          `public.${relation}'s ${fn} fires ${triggerTypeText(trigger.type)}; it must fire ${triggerTypeText(GUARD_TYPES[fn] ?? 0)}`,
        )
      }
      if (trigger.enabled !== 'O') {
        problems.push(
          `public.${relation}'s ${fn} is enabled ${trigger.enabled === 'D' ? 'nowhere (disabled)' : trigger.enabled === 'A' ? 'ALWAYS' : trigger.enabled === 'R' ? 'only on a replica' : trigger.enabled}; it must be enabled the default way (O), so it fires for every writer and not in a replica's apply (LH-11)`,
        )
      }
      if (trigger.args.join(',') !== args.join(',')) {
        problems.push(
          fn === 'lifecycle_guard'
            ? `public.${relation}'s lifecycle_guard names ${trigger.args.map(a => `'${a}'`).join(', ') || 'no table'}; it must name ${relation === root ? 'its own table' : 'its parent'}, '${root}'`
            : `public.${relation}'s ${fn} takes arguments (${trigger.args.join(', ')}); it takes none`,
        )
      }
    }
  }
  for (const trigger of triggers) {
    const fnKnown = Object.hasOwn(GUARD_TYPES, trigger.fn)
    const nameKnown = Object.hasOwn(GUARD_TYPES, trigger.name)
    if (nameKnown && trigger.fn !== trigger.name) {
      problems.push(
        `public.${trigger.relation}'s trigger ${trigger.name} executes ${trigger.fn}(), not ${trigger.name}(): a guard's trigger is named as its function`,
      )
    }
    if (!fnKnown) continue
    const wanted = want.get(trigger.relation)?.has(trigger.fn) ?? false
    // A TRUNCATE refusal on a partition of a guarded table is allowed: Postgres doesn't clone a
    // statement trigger, so a step guarding a partitioned table may add one to each partition.
    const partitionTruncate =
      trigger.fn === 'lifecycle_no_truncate' && trigger.relation !== trigger.root && guardedSet.has(trigger.root)
    if (!wanted && !partitionTruncate) {
      problems.push(
        `public.${trigger.relation} carries ${trigger.fn}(), but ${trigger.fn === 'lifecycle_guard' || trigger.fn === 'lifecycle_no_truncate' ? "GUARDED_TABLES in apps/server/src/lifecycle/deletes.ts doesn't list it" : `only ${trigger.fn === 'deletion_log_kept' ? 'deletion_log' : 'legal_holds'} carries it`}: add the table with its first delete path, or drop the trigger`,
      )
    }
  }
  return problems
}

// Whether a class's period is finite through its chain: a day count (a days period, or an until
// period with one), or a follows chain that ends at one or at 'source'. A loop, a while period or
// an until period with no day count is not.
function finitePeriod(key: string, byKey: ReadonlyMap<string, ClassDefault>): boolean {
  const seen = new Set<string>()
  let at: string | null = key
  while (at !== null) {
    if (at === 'source') return true
    if (seen.has(at)) return false
    seen.add(at)
    const row = byKey.get(at)
    if (row === undefined) return false
    if (row.period_kind === 'follows') at = row.follows
    else return (row.period_kind === 'days' || row.period_kind === 'until') && row.days !== null
  }
  return false
}

// 7e. Every AI class has a finite period, through its follows chain, and none is kept (LH-06; D12,
// D41): read from retention_class_defaults(), which 7a holds to the registry.
export function aiClassProblems(rows: readonly ClassDefault[]): string[] {
  const byKey = new Map(rows.map(row => [row.key, row]))
  const problems: string[] = []
  for (const row of rows) {
    if (!row.ai) continue
    if (!finitePeriod(row.key, byKey)) {
      problems.push(
        `the AI retention class ${row.key} has no finite period: give it a day count, or a follows chain that ends at one or at its source (LH-06)`,
      )
    }
    if (row.holds === 'kept')
      problems.push(`the AI retention class ${row.key} is kept: every AI class is deleted (LH-06)`)
  }
  return problems
}

// The vocabularies and figures code and the database must share (7f), and each days class's period
// in days: in code its default, in the database what retention_period_days() answered for a scratch
// org (null when it raised).
export interface Vocabularies {
  holdTargetKinds: readonly string[]
  deletionCauses: readonly string[]
  holdKinds: readonly string[]
  refusedCopyHold: { days: number; noticeMarginDays: number } | undefined
  periods: Readonly<Record<string, number | null>>
}

function listProblems(
  code: readonly string[],
  database: readonly string[],
  codeName: string,
  dbName: string,
): string[] {
  const inDatabase = new Set(database)
  const inCode = new Set(code)
  return [
    ...code.filter(v => !inDatabase.has(v)).map(v => `${v} is in packages/shared ${codeName} but not in ${dbName}`),
    ...database.filter(v => !inCode.has(v)).map(v => `${v} is in ${dbName} but not in packages/shared ${codeName}`),
  ]
}

// 7f. HOLD_TARGET_KINDS equals legal_holds_target_kind's list, DELETION_CAUSES deletion_causes()
// (C010-SPEC-02), HOLD_KINDS lifecycle_kinds(), REFUSED_COPY_HOLD refused_copy_hold(), and
// retention_period_days() answers every days class's default (LH-09, LH-15, LH-18, LH-19).
export function vocabularyProblems(code: Vocabularies, database: Vocabularies): string[] {
  const problems = [
    ...listProblems(code.holdTargetKinds, database.holdTargetKinds, 'HOLD_TARGET_KINDS', 'legal_holds_target_kind'),
    ...listProblems(code.deletionCauses, database.deletionCauses, 'DELETION_CAUSES', 'deletion_causes()'),
    ...listProblems(code.holdKinds, database.holdKinds, 'HOLD_KINDS', 'lifecycle_kinds()'),
  ]
  const want = code.refusedCopyHold
  const got = database.refusedCopyHold
  if (got === undefined) problems.push('refused_copy_hold() answered no row')
  else if (want !== undefined && (want.days !== got.days || want.noticeMarginDays !== got.noticeMarginDays)) {
    problems.push(
      `packages/shared REFUSED_COPY_HOLD says ${want.days} days and a ${want.noticeMarginDays}-day margin; refused_copy_hold() says ${got.days} and ${got.noticeMarginDays}`,
    )
  }
  for (const [key, days] of Object.entries(code.periods)) {
    const answered = database.periods[key]
    if (answered === undefined || answered === null) {
      problems.push(`retention_period_days() gave no period for ${key}, whose default is ${days} days`)
    } else if (answered !== days) {
      problems.push(`retention_period_days() answers ${answered} days for ${key}; its default is ${days}`)
    }
  }
  return problems
}

// One resolver call check-catalogues tried in a transaction it rolled back (7g): what it called, the
// SQLSTATE and message it raised, if it did, and how many rows it returned when exactly some are
// needed.
export interface ResolverProbe {
  call: string
  error?: string
  rows?: number
  wantRows?: number
}

// 7g. The hold decision's resolvers know every kind, container kind and table they will be asked
// about: lifecycle_persons_of() and lifecycle_containers_of() for every kind lifecycle_kinds() lists,
// lifecycle_lock_target() for a person, a case and every container or holdable kind, and
// lifecycle_row_anchors() for every table of a class whose holds apply, each without raising, and the
// last returning exactly one row. A step that moves a table into a holds-apply class, or adds a kind
// or a container kind, without its resolver fails CI before its guard is ever attached (LH-12, LH-18,
// LH-56).
export function resolverProblems(probes: readonly ResolverProbe[]): string[] {
  const problems: string[] = []
  for (const probe of probes) {
    if (probe.error !== undefined) {
      problems.push(
        `${probe.call} raised ${probe.error}: the step that adds that kind or table replaces the resolver to know it`,
      )
    } else if (probe.wantRows !== undefined && probe.rows !== probe.wantRows) {
      problems.push(`${probe.call} returned ${probe.rows ?? 0} rows; the guard reads exactly ${probe.wantRows}`)
    }
  }
  return problems
}

// A foreign key whose ON DELETE action deletes or changes its child: CASCADE (c), SET NULL (n) or
// SET DEFAULT (d).
export interface ForeignKey {
  table: string
  name: string
  action: 'c' | 'n' | 'd'
  parent: string
}

// A delete path the database allows (check 8): its DELETE_PATHS key, the tables it deletes from, and
// for a function its body (`checked` reads it), for a DYNAMIC_DDL function its body too (its format
// strings), for a CASCADE key its parent.
export interface FoundPath {
  key: string
  deletes: readonly string[]
  body?: string
  ddl?: string
  cascadeParent?: string
}

// Every delete path, found as check 1 finds writes (DB-10): a runtime role's DELETE grant (its
// table); a reachable function whose body deletes (the tables its DELETEs name); a foreign key that
// cascades (its child) or sets null or a default (nothing: an UPDATE of the child, whose firing delete
// is its parent's own path); and every DYNAMIC_DDL function (nothing, if its format strings keep to
// creating).
export function deletePathsOf(
  grants: readonly Grant[],
  functions: readonly Fn[],
  foreignKeys: readonly ForeignKey[],
  dynamic: Readonly<Record<string, string>> = DYNAMIC_DDL,
): FoundPath[] {
  const found: FoundPath[] = []
  for (const grant of grants) {
    if (grant.op === 'DELETE') found.push({ key: grantKey(grant.role, grant.table, 'DELETE'), deletes: [grant.table] })
  }
  for (const fn of functions) {
    if (fn.source === undefined) continue
    const deletes = bodyWrites(fn.source)
      .filter(write => write.op === 'DELETE')
      .map(write => write.table)
    if (deletes.length > 0) found.push({ key: fn.key, deletes: [...new Set(deletes)], body: fn.source })
  }
  for (const key of foreignKeys) {
    found.push({
      key: `fk ${key.table}.${key.name}`,
      deletes: key.action === 'c' ? [key.table] : [],
      ...(key.action === 'c' ? { cascadeParent: key.parent } : {}),
    })
  }
  for (const key of Object.keys(dynamic)) {
    const fn = functions.find(f => f.key === key)
    found.push({ key: `ddl ${key}`, deletes: [], ddl: fn?.source ?? '' })
  }
  return found.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

// Whether a decision a DELETE_PATHS entry cites is one TECH-SPEC records: an LH id T23 records
// (LH-nn/mm records both), or a TECH-SPEC item ("T15 item 16": section T15 has an item 16).
export function recordedDecisions(spec: string): (decision: string) => boolean {
  const sections = new Map<string, string>()
  const headings = [...spec.matchAll(/^## (T\d+):/gm)]
  headings.forEach((heading, i) => {
    sections.set(heading[1] ?? '', spec.slice(heading.index, headings[i + 1]?.index ?? spec.length))
  })
  const lh = new Set<string>()
  for (const [, first, second] of (sections.get('T23') ?? '').matchAll(/\bLH-(\d+)(?:\/(\d+))?\b/g)) {
    lh.add(`LH-${first}`)
    if (second !== undefined) lh.add(`LH-${second}`)
  }
  return decision => {
    if (/^LH-\d+$/.test(decision)) return lh.has(decision)
    const item = /^(T\d+) item (\d+)$/.exec(decision)
    if (item === null) return false
    const section = sections.get(item[1] ?? '')
    return section !== undefined && new RegExp(`\\n${item[2]}\\. `).test(section)
  }
}

// What the registry says of each table's holds: the tables of classes whose holds apply, and of
// classes kept as history (packages/shared RETENTION_CLASSES).
export function holdsTables(classes: Readonly<Record<string, Pick<RetentionClass, 'tables' | 'holds'>>>): {
  apply: ReadonlySet<string>
  kept: ReadonlySet<string>
} {
  const apply = new Set<string>()
  const kept = new Set<string>()
  for (const spec of Object.values(classes)) {
    const holds = holdsOf(spec.holds)
    for (const table of spec.tables) {
      if (holds === 'apply') apply.add(table)
      if (holds === 'kept') kept.add(table)
    }
  }
  return { apply, kept }
}

// The verbs a DYNAMIC_DDL function's format strings may not name: it only creates (check 8).
const DESTRUCTIVE = /\b(drop|truncate|detach|delete)\b/i
// A checked path's own hold decision, comments and strings aside.
const ASKS_HELD = /\b(?:lifecycle_held|is_held)\s*\(/

const deletesText = (tables: readonly string[]) =>
  tables.length === 0 ? 'nothing' : tables.map(table => `public.${table}`).join(', ')

// 8. Every delete path the database allows is decided in apps/server/src/lifecycle/deletes.ts
// DELETE_PATHS, and no entry is stale (LH-12, LH-14, LH-26, LH-48, LH-58): a guarded path deletes
// only from GUARDED_TABLES, so a step's first delete path brings the guard; a checked path is a
// function whose body asks lifecycle_held() or is_held() and deletes from no guarded or kept table;
// an exempt path deletes from no table whose holds apply; an exempt or checked path cites a decision
// TECH-SPEC records; no path deletes from a table kept as history; a CASCADE key into a guarded table
// cascades into a guarded or listed child; and a DYNAMIC_DDL function's format strings name no drop,
// truncate, detach or delete, so "only changes the schema and writes no row" is checked, not trusted.
export function deletePathProblems(
  entries: Readonly<Record<string, DeletePath>>,
  guarded: readonly string[],
  found: readonly FoundPath[],
  holds: { apply: ReadonlySet<string>; kept: ReadonlySet<string> },
  recorded: (decision: string) => boolean,
): string[] {
  const problems: string[] = []
  const guardedSet = new Set(guarded)
  const where = 'DELETE_PATHS in apps/server/src/lifecycle/deletes.ts'
  for (const path of found) {
    const entry = entries[path.key]
    if (path.ddl !== undefined) {
      for (const literal of stringLiterals(path.ddl)) {
        const verb = DESTRUCTIVE.exec(literal)?.[1]
        if (verb !== undefined) {
          problems.push(
            `public.${path.key.slice(4)} is in DYNAMIC_DDL, which only creates, but a string it runs names ${verb.toLowerCase()}: a deletion goes through the deletion code, never dynamic DDL`,
          )
        }
      }
    }
    if (entry === undefined) {
      problems.push(
        path.cascadeParent !== undefined && guardedSet.has(path.cascadeParent) && !guardedSet.has(path.deletes[0] ?? '')
          ? `${path.key} cascades a delete of guarded public.${path.cascadeParent} into unguarded public.${path.deletes[0]}: guard the child, or list the key in ${where} with why`
          : `${path.key} deletes from ${deletesText(path.deletes)}, but ${where} doesn't decide it: add '${path.key}' as guarded, checked or exempt with its decision`,
      )
      continue
    }
    const kept = path.deletes.filter(table => holds.kept.has(table))
    if (kept.length > 0) {
      problems.push(`${path.key} deletes from ${deletesText(kept)}, whose retention class keeps every row as history`)
    }
    if ('guarded' in entry) {
      const unguarded = path.deletes.filter(table => !guardedSet.has(table))
      if (unguarded.length > 0) {
        problems.push(
          `${path.key} is guarded in ${where}, but deletes from ${deletesText(unguarded)}, which GUARDED_TABLES doesn't list: a table gets lifecycle_guard() with its first delete path (LH-12)`,
        )
      }
      continue
    }
    if (!recorded(entry.decision)) {
      problems.push(
        `'${path.key}' in ${where} cites ${entry.decision}, which isn't an LH id docs/TECH-SPEC.md T23 records or a TECH-SPEC item (T<n> item <m>)`,
      )
    }
    if ('checked' in entry) {
      if (path.body === undefined) {
        problems.push(`${path.key} is checked in ${where}, but only a function can ask lifecycle_held() itself`)
      } else if (!ASKS_HELD.test(stripSql(path.body))) {
        problems.push(
          `${path.key} is checked in ${where}, but its body never calls lifecycle_held() or is_held(): ask it and skip a held row, or guard its tables (LH-58)`,
        )
      }
      const barred = path.deletes.filter(table => guardedSet.has(table) || holds.kept.has(table))
      if (barred.length > 0) {
        problems.push(
          `${path.key} is checked in ${where}, but deletes from ${deletesText(barred)}: a guarded table's path is guarded, and a kept table has none`,
        )
      }
      continue
    }
    const held = path.deletes.filter(table => holds.apply.has(table))
    if (held.length > 0) {
      problems.push(
        `${path.key} is exempt in ${where}, but deletes from ${deletesText(held)}, whose retention class's holds apply: make it guarded or checked`,
      )
    }
  }
  const keys = new Set(found.map(path => path.key))
  for (const key of Object.keys(entries)) {
    if (!keys.has(key))
      problems.push(`${where} decides '${key}', which no delete path the database allows matches: remove it`)
  }
  return problems
}
