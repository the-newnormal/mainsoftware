// Every id from C0.8's sign-in design that code cites is one TECH-SPEC T20 records, so a reader
// can look it up (T20's preamble). The AQ ids (the defaults C0.8 took) are checked wherever code
// cites them in apps/, packages/ and scripts/; "AQ-05/06" records or cites both ids. The Q ids (the
// design's open points) are checked only in the sign-in code, apps/server/src/auth/ and
// apps/web/src/sign-in/, since elsewhere a Q id is the PRD's (PRD §13) or fixture text (the Q4
// group DM). Comments count: a citation is a comment or a test's name.
//
// The same holds for C0.9's defaults (C0.9 PD-01): every PD id that code cites in apps/,
// packages/, scripts/ and db/ (the migration and the DB tests cite them too) is one TECH-SPEC T22
// records; "PD-04/05" names both. T22 records every default from PD-01 to the last its index row
// names (PD-62 from C0.9 PR 2: PD-32 to PD-57 and the amendments' PD-58 to PD-62; PD-86 from C0.9
// PR 3a: PD-63 to PD-86; PD-113 from C0.9 PR 3b: PD-87 to PD-113; PD-136 from the first-Owner
// bootstrap PR: PD-114 to PD-136, its defaults, T22 items 63 to 71), with no gap, so the index row and
// the items agree.
//
// And for C0.10's ids (LCG-01, C0.10 LH-02): every LH id that code cites in the same reach is one
// TECH-SPEC T23 records, and T23 records every one from LH-01 to the last its index row names
// ("LH-01 to LH-61"; the retired LH-28 and LH-52 stay recorded), with no gap. Code cites none of the
// id families of the designs C0.10's replaced (RK-, LD-, LQ- and LO-, DB-15): they were reworked into
// LH ids and kept only in the design's own record. LH- ends in neither PD- nor AQ-, so neither of
// the regexes above reads an LH id; RT-PD-nn would have been read as PD-nn, which is why the prefix
// is LH (both proved on planted text below).
//
// And LCG-07 (C0.10 review DOCS-07, LH-45, LH-46): every line of TECH-SPEC that names LH-45 or LH-46
// with the DPO's confirmation gives it one deadline, before PR 1 merges (or in PR 1's "Before
// merging" steps), and no other ("before a case records", "before Hearth holds", before a later
// step).
import { describe, expect, it } from 'vitest'
import { readRepoFile, repoFiles } from './repo-files'

const SELF = 'scripts/guards/design-ids.test.ts'
const CODE = /^(?:apps|packages|scripts)\/.+\.(?:[cm]?[jt]sx?|sh|sql)$/
const SIGN_IN_CODE = /^apps\/(?:server\/src\/auth|web\/src\/sign-in)\//
const PD_CODE = /^(?:apps|packages|scripts|db)\/.+\.(?:[cm]?[jt]sx?|sh|sql)$/

// The ids a text names: AQ-nn (AQ-nn/mm names both) and, when asked for, Qn.
function idsIn(text: string, options: { q: boolean }): Set<string> {
  const ids = new Set<string>()
  for (const [, first, second] of text.matchAll(/\bAQ-(\d+)(?:\/(\d+))?\b/g)) {
    ids.add(`AQ-${first}`)
    if (second !== undefined) ids.add(`AQ-${second}`)
  }
  if (options.q) for (const [id] of text.matchAll(/\bQ\d+\b/g)) ids.add(id)
  return ids
}

// The C0.9 PD ids a text names (PD-nn/mm names both).
function pdIdsIn(text: string): Set<string> {
  const ids = new Set<string>()
  for (const [, first, second] of text.matchAll(/\bPD-(\d+)(?:\/(\d+))?\b/g)) {
    ids.add(`PD-${first}`)
    if (second !== undefined) ids.add(`PD-${second}`)
  }
  return ids
}

// A section of TECH-SPEC (T20, T22), from its heading to the next.
function sectionOf(spec: string, id: string): string {
  const start = spec.indexOf(`\n## ${id}:`)
  if (start === -1) throw new Error(`docs/TECH-SPEC.md has no ${id} section`)
  const end = spec.indexOf('\n## ', start + 1)
  return spec.slice(start, end === -1 ? undefined : end)
}

// Each cited id T20 doesn't record, as "path: id".
function dangling(files: ReadonlyMap<string, string>, recorded: ReadonlySet<string>): string[] {
  const found: string[] = []
  for (const [path, text] of files) {
    for (const id of idsIn(text, { q: SIGN_IN_CODE.test(path) })) {
      if (!recorded.has(id)) found.push(`${path}: ${id}`)
    }
  }
  return found
}

describe('T20: the sign-in design ids code cites are recorded in TECH-SPEC T20', () => {
  it('finds a dangling id on planted files, and passes recorded ones', () => {
    const recorded = idsIn('(AQ-01) (AQ-05/06, Q10) Q27', { q: true })
    expect([...recorded].sort()).toEqual(['AQ-01', 'AQ-05', 'AQ-06', 'Q10', 'Q27'])
    const files = new Map([
      ['apps/server/src/auth/a.ts', '// AQ-01, AQ-05 and AQ-06/05 (Q10); and Q5'],
      ['apps/server/src/web/b.ts', '// AQ-99, and the Q4 group DM'],
      ['apps/web/src/sign-in/c.tsx', "it('AQ-05/07 Q27')"],
      ['packages/access/d.ts', '// PRD Q19'],
    ])
    expect(dangling(files, recorded)).toEqual([
      'apps/server/src/auth/a.ts: Q5',
      'apps/server/src/web/b.ts: AQ-99',
      'apps/web/src/sign-in/c.tsx: AQ-07',
    ])
  })

  it('every AQ id in code, and every Q id in the sign-in code, is one T20 records', () => {
    const recorded = idsIn(sectionOf(readRepoFile('docs/TECH-SPEC.md'), 'T20'), { q: true })
    const files = new Map(
      repoFiles()
        .filter(path => CODE.test(path) && path !== SELF)
        .map(path => [path, readRepoFile(path)] as const),
    )
    // Code does cite the design, so an empty match would mean the guard reads nothing.
    expect([...files.values()].some(text => idsIn(text, { q: false }).size > 0)).toBe(true)
    expect(dangling(files, recorded)).toEqual([])
  })
})

// Each cited PD id T22 doesn't record, as "path: id".
function danglingPd(files: ReadonlyMap<string, string>, recorded: ReadonlySet<string>): string[] {
  const found: string[] = []
  for (const [path, text] of files) {
    for (const id of pdIdsIn(text)) if (!recorded.has(id)) found.push(`${path}: ${id}`)
  }
  return found
}

describe('C0.9 T22: the defaults code cites are recorded in TECH-SPEC T22', () => {
  it('finds a dangling PD id on planted files, and passes recorded ones', () => {
    const recorded = pdIdsIn('(PD-01, PD-07) and PD-20/21')
    expect([...recorded].sort()).toEqual(['PD-01', 'PD-07', 'PD-20', 'PD-21'])
    const files = new Map([
      ['apps/server/src/compliance/a.ts', '// C0.9 PD-07 and PD-21/07'],
      ['db/migrations/0009_x.sql', '-- C0.9 PD-32'],
      ['apps/web/src/dpo/b.tsx', "it('C0.9 PD-20/22 and PD-7')"],
    ])
    expect(danglingPd(files, recorded)).toEqual([
      'db/migrations/0009_x.sql: PD-32',
      'apps/web/src/dpo/b.tsx: PD-22',
      'apps/web/src/dpo/b.tsx: PD-7',
    ])
  })

  it('C0.9 PD-01: every PD id in code is one T22 records', () => {
    const recorded = pdIdsIn(sectionOf(readRepoFile('docs/TECH-SPEC.md'), 'T22'))
    const files = new Map(
      repoFiles()
        .filter(path => PD_CODE.test(path) && path !== SELF)
        .map(path => [path, readRepoFile(path)] as const),
    )
    // Code does cite C0.9's defaults, so an empty match would mean the guard reads nothing.
    expect([...files.values()].some(text => pdIdsIn(text).size > 0)).toBe(true)
    expect(danglingPd(files, recorded)).toEqual([])
  })
})

describe('C0.9 PR 2, PR 3a, PR 3b and the bootstrap PR T22: the defaults are recorded with no gap, up to the index row’s last', () => {
  // The highest PD id the T22 index row names ("PD-01 to PD-136").
  const lastNamed = (spec: string): number | undefined => {
    const row = spec.split('\n').find(line => line.startsWith('| T22 |'))
    const found = row?.match(/\bPD-01 to PD-(\d+)\b/)
    return found?.[1] === undefined ? undefined : Number(found[1])
  }
  const missing = (recorded: ReadonlySet<string>, last: number): string[] =>
    Array.from({ length: last }, (_, i) => `PD-${String(i + 1).padStart(2, '0')}`).filter(id => !recorded.has(id))

  it('finds a gap on planted text, and the index row’s last id', () => {
    expect(lastNamed('| T22 | x (PD-01 to PD-07) | y |\n| T23 | (PD-01 to PD-99) |')).toBe(7)
    expect(lastNamed('| T21 | (PD-01 to PD-07) |')).toBeUndefined()
    expect(missing(pdIdsIn('PD-01, PD-02/03 and PD-05'), 5)).toEqual(['PD-04'])
  })

  it('C0.9 PD-32 to PD-136 (PD-63 to PD-86 from C0.9 PR 3a, PD-87 to PD-113 from PR 3b, PD-114 to PD-136 from the bootstrap PR, PD-134): T22 records PD-01 to the last id its index row names, PD-136 or later', () => {
    const spec = readRepoFile('docs/TECH-SPEC.md')
    const last = lastNamed(spec)
    expect(last).toBeGreaterThanOrEqual(136)
    expect(missing(pdIdsIn(sectionOf(spec, 'T22')), last ?? 0)).toEqual([])
  })
})

// The C0.10 LH ids a text names (LH-nn/mm names both).
function lhIdsIn(text: string): Set<string> {
  const ids = new Set<string>()
  for (const [, first, second] of text.matchAll(/\bLH-(\d+)(?:\/(\d+))?\b/g)) {
    ids.add(`LH-${first}`)
    if (second !== undefined) ids.add(`LH-${second}`)
  }
  return ids
}

// The id families of the designs C0.10's replaced (DB-15), each cited as "path: id".
const OLD_FAMILIES = /\b(?:RK|LD|LQ|LO)-\d+\b/g
function oldFamilies(files: ReadonlyMap<string, string>): string[] {
  const found: string[] = []
  for (const [path, text] of files) for (const [id] of text.matchAll(OLD_FAMILIES)) found.push(`${path}: ${id}`)
  return found
}

// Each cited LH id T23 doesn't record, as "path: id".
function danglingLh(files: ReadonlyMap<string, string>, recorded: ReadonlySet<string>): string[] {
  const found: string[] = []
  for (const [path, text] of files) {
    for (const id of lhIdsIn(text)) if (!recorded.has(id)) found.push(`${path}: ${id}`)
  }
  return found
}

// The highest LH id the T23 index row names ("LH-01 to LH-61"), the largest if it names several
// runs, so a sub-range written first ("LH-01 to LH-43") can't lower it.
function lastLhNamed(spec: string): number | undefined {
  const row = spec.split('\n').find(line => line.startsWith('| T23 |'))
  const lasts = [...(row ?? '').matchAll(/\bLH-01 to LH-(\d+)\b/g)].map(match => Number(match[1]))
  return lasts.length === 0 ? undefined : Math.max(...lasts)
}

const missingLh = (recorded: ReadonlySet<string>, last: number): string[] =>
  Array.from({ length: last }, (_, i) => `LH-${String(i + 1).padStart(2, '0')}`).filter(id => !recorded.has(id))

const codeFiles = () =>
  new Map(
    repoFiles()
      .filter(path => PD_CODE.test(path) && path !== SELF)
      .map(path => [path, readRepoFile(path)] as const),
  )

describe('C0.10 T23 (LCG-01, LH-02): the LH ids code cites are recorded in TECH-SPEC T23, with no gap', () => {
  it('reads LH ids apart from PD and AQ ids, finds a dangling one, a gap and an older family on planted text', () => {
    // LH-07 is no C0.9 or C0.8 id, PD-07 no LH id, and RT-PD-07 would have been read as PD-07 (a
    // hyphen before P is a word boundary), which is why C0.10's prefix is LH.
    expect([...pdIdsIn('// LH-07 and LH-08/09')]).toEqual([])
    expect([...idsIn('// LH-07 and LH-08/09', { q: true })]).toEqual([])
    expect([...lhIdsIn('// PD-07, AQ-07 and RT-PD-07')]).toEqual([])
    expect([...pdIdsIn('// RT-PD-07')]).toEqual(['PD-07'])
    const recorded = lhIdsIn('(LH-01, LH-07) and LH-20/21')
    expect([...recorded].sort()).toEqual(['LH-01', 'LH-07', 'LH-20', 'LH-21'])
    const files = new Map([
      ['db/migrations/0013_x.sql', '-- C0.10 LH-07 and LH-21/07'],
      ['apps/server/src/lifecycle/a.ts', '// LH-62, and LH-7'],
      ['packages/shared/src/b.ts', '// RK-08 and LD-03, not FIELD-2 or HELLO-3'],
    ])
    expect(danglingLh(files, recorded)).toEqual([
      'apps/server/src/lifecycle/a.ts: LH-62',
      'apps/server/src/lifecycle/a.ts: LH-7',
    ])
    expect(oldFamilies(files)).toEqual(['packages/shared/src/b.ts: RK-08', 'packages/shared/src/b.ts: LD-03'])
    expect(lastLhNamed('| T22 | (LH-01 to LH-09) |\n| T23 | x, LH-01 to LH-61 (LH-01 to LH-43) | y |')).toBe(61)
    expect(lastLhNamed('| T22 | (LH-01 to LH-09) |')).toBeUndefined()
    expect(missingLh(lhIdsIn('LH-01, LH-02/03 and LH-05'), 5)).toEqual(['LH-04'])
  })

  it('every LH id in code is one T23 records, and code cites no older design family', () => {
    const recorded = lhIdsIn(sectionOf(readRepoFile('docs/TECH-SPEC.md'), 'T23'))
    const files = codeFiles()
    // Code does cite C0.10's ids, so an empty match would mean the guard reads nothing.
    expect([...files.values()].some(text => lhIdsIn(text).size > 0)).toBe(true)
    expect(danglingLh(files, recorded)).toEqual([])
    expect(oldFamilies(files)).toEqual([])
  })

  it('T23 records LH-01 to the last id its index row names, LH-61 or later, the retired LH-28 and LH-52 included', () => {
    const spec = readRepoFile('docs/TECH-SPEC.md')
    const last = lastLhNamed(spec)
    expect(last).toBeGreaterThanOrEqual(61)
    const t23 = sectionOf(spec, 'T23')
    expect(missingLh(lhIdsIn(t23), last ?? 0)).toEqual([])
    expect(t23).toMatch(/\bLH-28\b[^\n]*retired/)
    expect(t23).toMatch(/\bLH-52\b[^\n]*retired/)
  })
})

// Each line that names LH-45 or LH-46 with the DPO's confirming, but gives it a deadline other
// than PR 1's merge in PR 1's "Before merging" steps, as "line n: why" (LCG-07, DOCS-07).
const DEADLINE = /\bbefore PR 1 merges\b|\bPR 1['’]s "Before merging" steps\b/
const OTHER_DEADLINE = /\bbefore (?:a case records|Hearth holds|C\d\.\d+|PR 2)\b/
function legalDeadlineProblems(text: string): string[] {
  const found: string[] = []
  for (const [index, line] of text.split('\n').entries()) {
    if (!/\bLH-4[56]\b/.test(line) || !/\bconfirm/.test(line)) continue
    if (!DEADLINE.test(line)) found.push(`line ${index + 1}: no "before PR 1 merges"`)
    if (OTHER_DEADLINE.test(line)) found.push(`line ${index + 1}: another deadline`)
  }
  return found
}

describe('LCG-07 (C0.10 review DOCS-07, LH-45, LH-46): T23 gives the DPO’s legal confirmation one deadline', () => {
  it('finds a line with none or another, on planted text', () => {
    const planted = [
      '- LH-45 (a): holds; stays for the DPO to confirm before PR 1 merges, in its "Before merging" steps;',
      '- LH-46 (a): the margin; regulation 8 stays for the DPO to confirm before a case records the hold;',
      '- LH-45 (a): holds. The DPO confirms whether the offence applies.',
      '- LH-46 (a): the margin (item 11).',
      '- confirmed in PR 1’s "Before merging" steps: the margin (LH-46).',
    ].join('\n')
    expect(legalDeadlineProblems(planted)).toEqual([
      'line 2: no "before PR 1 merges"',
      'line 2: another deadline',
      'line 3: no "before PR 1 merges"',
    ])
  })

  it('every line of TECH-SPEC naming LH-45’s or LH-46’s confirmation says before PR 1 merges, and the index row does', () => {
    const spec = readRepoFile('docs/TECH-SPEC.md')
    const t23 = sectionOf(spec, 'T23')
    const named = t23.split('\n').filter(line => /\bLH-4[56]\b/.test(line) && /\bconfirm/.test(line))
    // T23 does name the confirmation, so an empty match would mean the guard reads nothing.
    expect(named.length).toBeGreaterThan(3)
    expect(legalDeadlineProblems(spec)).toEqual([])
  })
})
