// LS-01 and LS-02 (C0.9 PR 3b, review DOCS-03): what PR 3b leaves to later steps is written where
// those steps' authors will read it. TECH-SPEC T22 item 50 lists what PR 3b leaves out, "each in
// its BUILD-PLAN row (item 62)", and item 62's "What later steps inherit" names each step with
// its part. So LS-01: every step item 50 sends something to has a bullet in item 62's list; and
// LS-02: every step with a bullet there that is a BUILD-PLAN step (C0.10) or requirement
// (SHEET-12) has a row in docs/BUILD-PLAN.md that names C0.9 PR 3b, so planning that step meets
// what it inherits. A deferral item 50 gives no step (attachments) names none, so neither case
// asks for one. The guard checks that each step's row carries PR 3b's part, not every word of it;
// review still reads the part itself. Both cases are first proved on planted text. LS-03 to LS-05
// (C0.10, LCG-06) hold the same for T23 items 1 and 20, below.
import { describe, expect, it } from 'vitest'
import { readRepoFile } from './repo-files'

// A BUILD-PLAN step (C0.10, C2.9) or requirement (SHEET-12, PDPA-05a).
const STEP_ID = /^(?:C\d+\.\d+|[A-Z]+-\d+[a-z]?)$/
const STEP_IDS = /\b(?:C\d+\.\d+|[A-Z]+-\d+[a-z]?)\b/g

// A section of TECH-SPEC (T22, T23), from its heading to the next.
function sectionOf(spec: string, id: string): string {
  const start = spec.indexOf(`\n## ${id}:`)
  if (start === -1) throw new Error(`docs/TECH-SPEC.md has no ${id} section`)
  const end = spec.indexOf('\n## ', start + 1)
  return spec.slice(start, end === -1 ? undefined : end)
}

// A numbered item of a section ("50. **…"), up to the next numbered item.
function itemOf(section: string, n: number): string {
  const start = section.indexOf(`\n${n}. **`)
  if (start === -1) throw new Error(`the section has no item ${n}`)
  const next = section.slice(start + 1).search(/\n\d+\. \*\*/)
  return section.slice(start, next === -1 ? undefined : start + 1 + next)
}

// The steps item 50's "It leaves out" sentence sends something to: the step ids in its brackets.
function deferredTo(item50: string): Set<string> {
  const sentence = item50.match(/It leaves out[\s\S]*?\)\.(?=\s|$)/)?.[0]
  if (sentence === undefined) throw new Error('T22 item 50 has no "It leaves out" sentence')
  const ids = new Set<string>()
  for (const [, inside = ''] of sentence.matchAll(/\(([^()]*)\)/g)) {
    for (const [id] of inside.matchAll(STEP_IDS)) ids.add(id)
  }
  return ids
}

// The steps item 62's "What later steps inherit" names in bold ("**C2.9:**", "**SHEET-12 (P2):**").
function inheritedBy(item62: string): Set<string> {
  const start = item62.indexOf('**What later steps inherit')
  if (start === -1) throw new Error('T22 item 62 has no "What later steps inherit" list')
  const ids = new Set<string>()
  for (const [, name = ''] of item62.slice(start).matchAll(/\*\*([^*]+?):\*\*/g)) {
    const id = name.split(' ')[0] ?? ''
    if (STEP_ID.test(id)) ids.add(id)
  }
  return ids
}

// The BUILD-PLAN row of a step ("| **C2.9** …") or a requirement ("| SHEET-12 | …").
const rowOf = (plan: string, id: string): string | undefined =>
  plan.split('\n').find(line => line.startsWith(`| **${id}** `) || line.startsWith(`| ${id} |`))

// LS-01: each step item 50 defers to that item 62 doesn't list.
const unlisted = (deferred: ReadonlySet<string>, inherited: ReadonlySet<string>): string[] =>
  [...deferred].filter(id => !inherited.has(id))

// LS-02: each step item 62 lists whose BUILD-PLAN row is missing or doesn't name PR 3b.
const unwritten = (plan: string, inherited: ReadonlySet<string>): string[] =>
  [...inherited].filter(id => !rowOf(plan, id)?.includes('PR 3b'))

const SPEC = [
  '',
  '## T22: x',
  '50. **Scope of PR 3b.** It adds things.',
  '',
  '    It leaves out, each in its BUILD-PLAN row (item 62): alerts (C0.14); replies (C1’s chat or C6.1); attachments (no step yet: CLAUDE.md’s S3 rules); retention (C0.10, C2.9); a holiday list (SHEET-12, P2). 0012 updates no row (C9.9).',
  '51. **Next.** (C7.7)',
  '62. **Open points.**',
  '    - **OD-23 (a):** not a step.',
  '    - **What later steps inherit,** each also in its BUILD-PLAN row:',
  '      - **The bootstrap PR:** v0.',
  '      - **C0.10:** a class.',
  '      - **C0.14:** an alert.',
  '      - **C6.1:** consoles. **SHEET-12 (P2):** holidays. **A2 onwards:** never indexed.',
  '## T23: y',
  '50. **Not T22’s.** It leaves out more (C8.8).',
].join('\n')

const PLAN = [
  '| **C0.10** Retention | From C0.9 PR 3b: a class. | C0.3 |  |',
  '| **C0.14** Push | An alert, from nothing. | C0.13 |  |',
  '| **C6.1** Consoles | Consoles over C0.9 PR 3b’s cases. | C2.10 |  |',
  '| SHEET-12 | P2 | core | Post-v1 formula features | SHEET-07 |  |',
].join('\n')

describe('C0.9 PR 3b T22 items 50 and 62: what PR 3b defers is in each later step’s BUILD-PLAN row', () => {
  it('finds an unlisted deferral and an unwritten row on planted text, and passes written ones', () => {
    const t22 = sectionOf(SPEC, 'T22')
    const deferred = deferredTo(itemOf(t22, 50))
    expect([...deferred].sort()).toEqual(['C0.10', 'C0.14', 'C2.9', 'C6.1', 'SHEET-12'])
    const inherited = inheritedBy(itemOf(t22, 62))
    expect([...inherited].sort()).toEqual(['C0.10', 'C0.14', 'C6.1', 'SHEET-12'])
    expect(unlisted(deferred, inherited)).toEqual(['C2.9'])
    expect(unwritten(PLAN, inherited).sort()).toEqual(['C0.14', 'SHEET-12'])
    expect(rowOf(PLAN, 'C0.1')).toBeUndefined()
  })

  it('LS-01 (DOCS-03): every step item 50 leaves something to has a bullet in item 62’s inherit list', () => {
    const t22 = sectionOf(readRepoFile('docs/TECH-SPEC.md'), 'T22')
    const deferred = deferredTo(itemOf(t22, 50))
    // Item 50 does defer to later steps, so an empty match would mean the guard reads nothing.
    expect(deferred.has('C6.1')).toBe(true)
    expect(unlisted(deferred, inheritedBy(itemOf(t22, 62)))).toEqual([])
  })

  it('LS-02 (DOCS-03): every step in item 62’s inherit list has a BUILD-PLAN row naming C0.9 PR 3b', () => {
    const inherited = inheritedBy(itemOf(sectionOf(readRepoFile('docs/TECH-SPEC.md'), 'T22'), 62))
    expect(inherited.has('C0.10')).toBe(true)
    expect(unwritten(readRepoFile('docs/BUILD-PLAN.md'), inherited)).toEqual([])
  })
})

// LS-03 and LS-04 (C0.10, LCG-06; LH-33): the same for C0.10's T23. Item 1 lists what C0.10 leaves
// to later steps, "each in its BUILD-PLAN row (item 20)", and item 20's "What later steps inherit"
// names each step in bold. C0.10 hands work to C stages and to A stages (A0.1, A2.3, A3.3), so a
// step here is a dotted stage id of either kind; T23 defers to no requirement row. So LS-03: every
// step item 1 sends something to has a bullet in item 20's list; and LS-04: every step with a
// bullet there has a BUILD-PLAN row that names C0.10. LS-02 above still holds, since the C0.10 row
// keeps naming C0.9 PR 3b. LS-05 (review DOCS-01) adds item 20's consumer-by-consumer interface
// table: every step its Step column names has a bullet in the inherit list too, so a step the table
// hands work to can't be missed when item 1 doesn't name it, and LS-04 then holds its row.
const T23_STEP_ID = /^[CA]\d+\.\d+$/
const T23_STEP_IDS = /\b[CA]\d+\.\d+\b/g

// The steps T23 item 1's "It leaves out" sentence sends something to: the step ids in its brackets.
function t23DeferredTo(item1: string): Set<string> {
  const sentence = item1.match(/It leaves out[\s\S]*?\)\.(?=\s|$)/)?.[0]
  if (sentence === undefined) throw new Error('T23 item 1 has no "It leaves out" sentence')
  const ids = new Set<string>()
  for (const [, inside = ''] of sentence.matchAll(/\(([^()]*)\)/g)) {
    for (const [id] of inside.matchAll(T23_STEP_IDS)) ids.add(id)
  }
  return ids
}

// The steps T23 item 20's "What later steps inherit" names in bold ("**C2.9:**", "**A0.1:**").
function t23InheritedBy(item20: string): Set<string> {
  const start = item20.indexOf('**What later steps inherit')
  if (start === -1) throw new Error('T23 item 20 has no "What later steps inherit" list')
  const ids = new Set<string>()
  for (const [, name = ''] of item20.slice(start).matchAll(/\*\*([^*]+?):\*\*/g)) {
    const id = name.split(' ')[0] ?? ''
    if (T23_STEP_ID.test(id)) ids.add(id)
  }
  return ids
}

// LS-04: each step item 20 lists whose BUILD-PLAN row is missing or doesn't name C0.10.
const unwrittenT23 = (plan: string, inherited: ReadonlySet<string>): string[] =>
  [...inherited].filter(id => !rowOf(plan, id)?.includes('C0.10'))

// LS-05: the steps T23 item 20's interface table names in its Step column ("| C2.4, C2.8 |"), read
// from its header row to the first line that isn't a table row.
function t23InterfaceSteps(item20: string): Set<string> {
  const start = item20.indexOf('| Step |')
  if (start === -1) throw new Error('T23 item 20 has no interface table')
  const ids = new Set<string>()
  for (const line of item20.slice(start).split('\n')) {
    const cell = line.match(/^\s*\|([^|]*)\|/)?.[1]
    if (cell === undefined) break
    for (const [id] of cell.matchAll(T23_STEP_IDS)) ids.add(id)
  }
  return ids
}

const T23_SPEC = [
  '',
  '## T23: x',
  '1. **Scope.** It adds things.',
  '',
  '    It leaves out, each in its BUILD-PLAN row (item 20): the shipper (C0.17); holds on rooms (C2.4); who sets the AI classes (A0.1); PDPA-09 retention (C2.9, LH-12); people inferences (A3.3, A3.4). Nothing for (C9.9).',
  '2. **Next.** (C7.7)',
  '20. **Open points.**',
  '    - **LH-44 (a):** not a step.',
  '    - **The interface:**',
  '      | Step | What | Seam | Adds |',
  '      |---|---|---|---|',
  '      | C0.17, C2.4 | a | b | c |',
  '      | C6.1 | a | b | c |',
  '',
  '    - **What later steps inherit,** each also in its BUILD-PLAN row:',
  '      - **C0.17:** the shipper.',
  '      - **C2.4:** rooms.',
  '      - **A0.1:** the AI classes. **A3.3:** inferences.',
  '      - **Never:** an AI feature reads holds.',
  '## T24: y',
  '1. **Not T23’s.** It leaves out more (C8.8).',
].join('\n')

const T23_PLAN = [
  '| **C0.17** Backup | From C0.10: the shipper. | C0.10 |  |',
  '| **C2.4** Sessions | Rooms, from nothing. | C2.2 |  |',
  '| **A0.1** Clearance | From C0.10 (TECH-SPEC T23 item 20): who sets them. | C6.9 |  |',
].join('\n')

describe('C0.10 T23 items 1 and 20: what C0.10 defers is in each later step’s BUILD-PLAN row', () => {
  it('finds an unlisted deferral and an unwritten row on planted text, and passes written ones', () => {
    const t23 = sectionOf(T23_SPEC, 'T23')
    const deferred = t23DeferredTo(itemOf(t23, 1))
    expect([...deferred].sort()).toEqual(['A0.1', 'A3.3', 'A3.4', 'C0.17', 'C2.4', 'C2.9'])
    const inherited = t23InheritedBy(itemOf(t23, 20))
    expect([...inherited].sort()).toEqual(['A0.1', 'A3.3', 'C0.17', 'C2.4'])
    expect(unlisted(deferred, inherited).sort()).toEqual(['A3.4', 'C2.9'])
    expect(unwrittenT23(T23_PLAN, inherited).sort()).toEqual(['A3.3', 'C2.4'])
    const table = t23InterfaceSteps(itemOf(t23, 20))
    expect([...table].sort()).toEqual(['C0.17', 'C2.4', 'C6.1'])
    expect(unlisted(table, inherited)).toEqual(['C6.1'])
  })

  it('LS-03 (LCG-06): every step T23 item 1 leaves something to has a bullet in item 20’s inherit list', () => {
    const t23 = sectionOf(readRepoFile('docs/TECH-SPEC.md'), 'T23')
    const deferred = t23DeferredTo(itemOf(t23, 1))
    // Item 1 does defer to later steps, so an empty match would mean the guard reads nothing.
    expect(deferred.has('C2.9')).toBe(true)
    expect(deferred.has('A0.1')).toBe(true)
    expect(unlisted(deferred, t23InheritedBy(itemOf(t23, 20)))).toEqual([])
  })

  it('LS-04 (LCG-06): every step in T23 item 20’s inherit list has a BUILD-PLAN row naming C0.10', () => {
    const inherited = t23InheritedBy(itemOf(sectionOf(readRepoFile('docs/TECH-SPEC.md'), 'T23'), 20))
    expect(inherited.has('C2.9')).toBe(true)
    expect(unwrittenT23(readRepoFile('docs/BUILD-PLAN.md'), inherited)).toEqual([])
  })

  it('LS-05 (DOCS-01): every step T23 item 20’s interface table names has a bullet in its inherit list', () => {
    const item20 = itemOf(sectionOf(readRepoFile('docs/TECH-SPEC.md'), 'T23'), 20)
    const steps = t23InterfaceSteps(item20)
    // The table names later steps, so an empty match would mean the guard reads nothing.
    expect(steps.has('C6.1')).toBe(true)
    expect(steps.has('A2.3')).toBe(true)
    expect(unlisted(steps, t23InheritedBy(item20))).toEqual([])
  })
})
