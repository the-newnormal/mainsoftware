// C0.10 PR 2 (LCA-04; TECH-SPEC T23 item 14, BRAIN-08, Rule 3): derivedFacts() rebuilds the World's
// derived facts from the provenance registry's rows, and every anomaly a stored row or a loader could
// bring makes the whole item nobody's, never a narrower intersection of fewer sources. Each case
// builds the World from the rebuilt facts and checks every subject: every person (those who have
// left included), both assistants, every agent and the system principal.
import { describe, expect, test } from 'vitest'
import {
  aclOf,
  canRead,
  type DerivedFact,
  derivedFacts,
  type Facts,
  type Id,
  indexClassOf,
  isLive,
  type ProvenanceItemRow,
  type ProvenanceSourceRow,
  readersOf,
  type Subject,
  World,
} from './index.ts'
import {
  AG,
  AS,
  agent,
  assistant,
  CHAIN_DERIVED,
  DV,
  fixtureFacts,
  human,
  M,
  markGone,
  markStale,
  ORG,
  ORG_2,
  ORG_2_IDS,
  ORG_2_PEOPLE,
  otherOrgFacts,
  P,
  type ProvenanceRows,
  provenanceRowsOf,
  ref,
  S,
  SC,
  SEVERAL_CLAUSE_DERIVED,
  ST,
  system,
  withdraw,
} from './testing/index.ts'

const subjects: Subject[] = [
  ...fixtureFacts().people.map(p => human(p.id)),
  ...Object.values(AS).map(assistant),
  ...Object.values(AG).map(agent),
  system,
]
const label = (s: Subject) => `${s.kind} ${s.id}`
const byId = (a: { id: Id }, b: { id: Id }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const FIXTURE_IDS = Object.values(DV)

// The fixture's facts with these derived items in place of its own.
function worldOf(derived: readonly DerivedFact[], base: Facts = fixtureFacts()): World {
  return new World({ ...base, derived })
}
function rebuilt(rows: Pick<ProvenanceRows, 'items' | 'sources'>, base: Facts = fixtureFacts()): World {
  return worldOf(derivedFacts(ORG, rows.items, rows.sources), base)
}
// Who among every subject reads a derived item.
function readersAmong(w: World, id: Id): string[] {
  return subjects.filter(s => canRead(w, s, ref.derived(id))).map(label)
}
// Nobody reads it, it is not live, never indexed, and its stored row would select no one.
function expectNobody(w: World, id: Id): void {
  const item = ref.derived(id)
  expect(readersAmong(w, id), id).toEqual([])
  expect(readersOf(w, item), id).toEqual([])
  expect(isLive(w, item), id).toBe(false)
  expect(indexClassOf(w, item), id).toBe('restricted')
  expect(aclOf(w, item).tokens, id).toEqual([])
}
// A fixture item someone reads, so a case that makes it nobody's proves something.
function expectSomeone(w: World, id: Id): void {
  expect(readersAmong(w, id).length, id).toBeGreaterThan(0)
}
// Rows in a fixed, scrambled order: a loader's rows come in no order.
function scrambled<T>(rows: readonly T[]): T[] {
  return rows
    .map((row, at) => ({ row, at: (at * 37 + 11) % 101 }))
    .sort((a, b) => a.at - b.at)
    .map(x => x.row)
}
// The rows with one item's edges replaced.
function withEdges(rows: ProvenanceRows, id: Id, edges: (own: ProvenanceSourceRow[]) => ProvenanceSourceRow[]) {
  const record = `pv-${id}`
  const own = rows.sources.filter(e => e.item === record)
  return { ...rows, sources: [...rows.sources.filter(e => e.item !== record), ...edges(own)] }
}
function withItem(rows: ProvenanceRows, id: Id, change: (row: ProvenanceItemRow) => ProvenanceItemRow) {
  return { ...rows, items: rows.items.map(r => (r.item_id === id ? change(r) : r)) }
}

const fixture = worldOf(fixtureFacts().derived)
const fixtureRows = provenanceRowsOf(fixture, FIXTURE_IDS)

describe('derivedFacts() (C0.10 PR 2, LCA-04)', () => {
  test('LCA-04a BRAIN-08: rows in any order rebuild the fixture’s facts, each item’s sources in number order', () => {
    const facts = derivedFacts(ORG, scrambled(fixtureRows.items), scrambled(fixtureRows.sources))
    expect(facts).toEqual([...fixtureFacts().derived].sort(byId))
    // dv-no-sources, which no database row can hold (source_count is at least 1), rebuilds from its
    // count-0 row with no edges as a fact with no sources, as it was.
    expect(facts.find(f => f.id === DV.empty)).toEqual({ id: DV.empty, sources: [] })
    const w = rebuilt(fixtureRows)
    for (const id of FIXTURE_IDS) expect(readersAmong(w, id), id).toEqual(readersAmong(fixture, id))
  })

  test('LCA-04b BRAIN-08 Rule 5: only records of item kind derived become facts; cited records and other derived-mode kinds give nothing', () => {
    const record = (id: string, kind: string, itemId: Id, mode: ProvenanceItemRow['mode']): ProvenanceItemRow => ({
      id,
      org_id: ORG,
      item_kind: kind,
      item_id: itemId,
      mode,
      state: 'live',
      source_count: mode === 'derived' ? 1 : null,
    })
    // A draft citing a message, and a suggested task and a slide copy made from the pricing review.
    const others = [
      record('pv-draft', 'draft', 'dr-ops-reply', 'cited'),
      record('pv-st', 'suggested_task', ST.board, 'derived'),
      record('pv-sc', 'slide_copy', SC.pricing, 'derived'),
    ]
    const edge = (item: string, kind: string, id: Id): ProvenanceSourceRow => ({
      org_id: ORG,
      item,
      number: 1,
      source_kind: kind,
      source_id: id,
      gone_at: null,
    })
    const rows = {
      items: [...fixtureRows.items, ...others],
      sources: [
        ...fixtureRows.sources,
        edge('pv-draft', 'message', M.ops1),
        edge('pv-st', 'session', S.pricing),
        edge('pv-sc', 'session', S.pricing),
      ],
    }
    expect(derivedFacts(ORG, rows.items, rows.sources)).toEqual([...fixtureFacts().derived].sort(byId))
    // The suggested task keeps its owner-only rule (Rule 5), which nothing here touches.
    const w = rebuilt(rows)
    expect(subjects.filter(s => canRead(w, s, ref.suggestedTask(ST.board))).map(label)).toEqual([
      label(human(P.ashton)),
      label(assistant(AS.ashton)),
    ])
  })

  test('LCA-04c Rule 3 Rule 7: a withdrawn item, or a derived record in cited mode, reads as nobody’s', () => {
    expectSomeone(fixture, DV.digest)
    const rows = withdraw(fixtureRows, [DV.digest])
    expect(derivedFacts(ORG, rows.items, rows.sources)).toContainEqual({ id: DV.digest, sources: [] })
    const w = rebuilt(rows)
    expectNobody(w, DV.digest)
    // Its neighbours are untouched.
    expect(readersAmong(w, DV.mixed)).toEqual(readersAmong(fixture, DV.mixed))
    // The database refuses a derived record in cited mode (provenance_items_derived_kind); a loader
    // that met one still reads it as nobody's.
    expectNobody(rebuilt(withItem(fixtureRows, DV.digest, r => ({ ...r, mode: 'cited' }))), DV.digest)
  })

  test('LCA-04d Rule 7: one gone edge beside live ones makes the item nobody’s', () => {
    // M.ops1 is a source of the ops summary alone; M.ops2 stays live beside it.
    expectSomeone(fixture, DV.opsSummary)
    const w = rebuilt(markGone(fixtureRows, ref.message(M.ops1)))
    expectNobody(w, DV.opsSummary)
    expect(readersAmong(w, DV.mixed)).toEqual(readersAmong(fixture, DV.mixed))
  })

  test('LCA-04e RQS-11 Rule 3: a source of a kind the access core doesn’t decide makes the item nobody’s', () => {
    for (const kind of ['case', 'person', 'signin_session', 'draft', '']) {
      const rows = withEdges(fixtureRows, DV.opsSummary, own =>
        own.map(e => (e.number === 2 ? { ...e, source_kind: kind } : e)),
      )
      expectNobody(rebuilt(rows), DV.opsSummary)
    }
  })

  test('LCA-04f BRAIN-08: edges off their numbers, a source named twice, or a count one more than the edges make the item nobody’s', () => {
    const renumber = (numbers: number[]) =>
      withEdges(fixtureRows, DV.opsSummary, own => own.map((e, at) => ({ ...e, number: numbers[at] ?? e.number })))
    const broken: [string, Pick<ProvenanceRows, 'items' | 'sources'>][] = [
      ['a gap', renumber([1, 3])],
      ['a repeat', renumber([1, 1])],
      ['a 0', renumber([0, 1])],
      ['a fraction', renumber([1, 1.5])],
      ['one source twice', withEdges(fixtureRows, DV.opsSummary, own => own.map(e => ({ ...e, source_id: M.ops1 })))],
      // A loader that dropped the last edge: the intersection of the first alone would be wider.
      ['a dropped last edge', withItem(fixtureRows, DV.opsSummary, r => ({ ...r, source_count: 3 }))],
    ]
    for (const [what, rows] of broken) {
      expect(
        derivedFacts(ORG, rows.items, rows.sources).find(f => f.id === DV.opsSummary),
        what,
      ).toEqual({ id: DV.opsSummary, sources: [] })
      expectNobody(rebuilt(rows), DV.opsSummary)
    }
  })

  test('LCA-04g BRAIN-08 B.4: an item with no edges reads as nobody’s, its count kept or none', () => {
    expectNobody(rebuilt(withEdges(fixtureRows, DV.opsSummary, () => [])), DV.opsSummary)
    expectNobody(rebuilt(fixtureRows), DV.empty)
  })

  test('LCA-04h ACC-11: another org’s item is absent, and its edge naming this org’s record never attaches', () => {
    const theirs: ProvenanceItemRow = {
      id: 'pv-org2-digest',
      org_id: ORG_2,
      item_kind: 'derived',
      item_id: 'dv-org2-digest',
      mode: 'derived',
      state: 'live',
      source_count: 1,
    }
    const theirEdges: ProvenanceSourceRow[] = [
      {
        org_id: ORG_2,
        item: theirs.id,
        number: 1,
        source_kind: 'message',
        source_id: ORG_2_IDS.message,
        gone_at: null,
      },
      // Its org's edge naming this org's record, as a bad join might bring it.
      {
        org_id: ORG_2,
        item: `pv-${DV.opsSummary}`,
        number: 3,
        source_kind: 'message',
        source_id: M.general,
        gone_at: null,
      },
    ]
    const items = [...fixtureRows.items, theirs]
    const sources = [...fixtureRows.sources, ...theirEdges]
    expect(derivedFacts(ORG, items, sources)).toEqual([...fixtureFacts().derived].sort(byId))
    const w = worldOf(derivedFacts(ORG, items, sources))
    expect(readersAmong(w, DV.opsSummary)).toEqual(readersAmong(fixture, DV.opsSummary))
    expect(readersAmong(w, theirs.item_id)).toEqual([])
    // The other org's own view holds its item alone, read by its Owner.
    const theirFacts = derivedFacts(ORG_2, items, sources)
    expect(theirFacts).toEqual([{ id: theirs.item_id, sources: [ref.message(ORG_2_IDS.message)] }])
    const theirWorld = worldOf(theirFacts, otherOrgFacts())
    expect(canRead(theirWorld, human(ORG_2_PEOPLE.owner), ref.derived(theirs.item_id))).toBe(true)
  })

  test('LCA-04i LH-42: a stale item keeps its sources and the same readers as a live one, for every subject', () => {
    const stale = markStale(fixtureRows, FIXTURE_IDS)
    expect(stale.items.every(r => r.state === 'stale')).toBe(true)
    expect(derivedFacts(ORG, stale.items, stale.sources)).toEqual([...fixtureFacts().derived].sort(byId))
    const w = rebuilt(stale)
    for (const id of FIXTURE_IDS) {
      for (const s of subjects) {
        expect(canRead(w, s, ref.derived(id)), `${label(s)} ${id}`).toBe(canRead(fixture, s, ref.derived(id)))
      }
    }
  })

  test('LCA-04j BRAIN-08: two records with one id, or two for one derived item, are a bad join and throw', () => {
    const [first] = fixtureRows.items
    if (!first) throw new Error('the fixture has derived items')
    expect(() => derivedFacts(ORG, [...fixtureRows.items, { ...first, item_id: 'dv-other' }], [])).toThrow(
      /share the id/,
    )
    expect(() => derivedFacts(ORG, [...fixtureRows.items, { ...first, id: 'pv-other' }], [])).toThrow(
      /share the derived item/,
    )
  })

  test('LCA-04k Rule 3: dropping any one edge, its count kept, or marking any one gone never widens who reads an item', () => {
    const base = worldOf([...fixtureFacts().derived, ...SEVERAL_CLAUSE_DERIVED])
    const ids = base.facts.derived.filter(d => d.sources.length > 0).map(d => d.id)
    const rows = provenanceRowsOf(base, ids)
    let variants = 0
    let readBefore = 0
    for (const id of ids) {
      const before = new Set(readersAmong(base, id))
      if (before.size > 0) readBefore++
      const record = `pv-${id}`
      const own = rows.sources.filter(e => e.item === record)
      for (const edge of own) {
        const dropped = { ...rows, sources: rows.sources.filter(e => e !== edge) }
        const gone = { ...rows, sources: rows.sources.map(e => (e === edge ? { ...e, gone_at: new Date(0) } : e)) }
        for (const [what, variant] of [
          ['dropped', dropped],
          ['gone', gone],
        ] as const) {
          const after = readersAmong(rebuilt(variant, base.facts), id)
          const name = `${id} edge ${edge.number} ${what}`
          expect(
            after.filter(s => !before.has(s)),
            name,
          ).toEqual([])
          // Here, none at all: the item reads as nobody's.
          expect(after, name).toEqual([])
          variants++
        }
      }
    }
    expect(variants).toBe(2 * rows.sources.length)
    expect(readBefore).toBe(ids.length)
  })

  test('LCA-04l Rule 3 Rule 7: an item made from a withdrawn derived item reads as nobody’s, its own row still live', () => {
    const base = worldOf([...fixtureFacts().derived, ...CHAIN_DERIVED])
    const [chain] = CHAIN_DERIVED
    if (!chain) throw new Error('CHAIN_DERIVED holds the chain')
    const rows = provenanceRowsOf(
      base,
      base.facts.derived.map(d => d.id),
    )
    expectSomeone(base, chain.id)
    expect(readersAmong(rebuilt(rows, base.facts), chain.id)).toEqual(readersAmong(base, chain.id))
    const withdrawn = withdraw(rows, [DV.opsSummary])
    expect(withdrawn.items.find(r => r.item_id === chain.id)?.state).toBe('live')
    const w = rebuilt(withdrawn, base.facts)
    // The outer item keeps both its sources; the inner one now reads as nobody's, so it does too.
    expect(w.get({ kind: 'derived', id: chain.id })?.sources).toEqual(chain.sources)
    expectNobody(w, DV.opsSummary)
    expectNobody(w, chain.id)
  })
})
