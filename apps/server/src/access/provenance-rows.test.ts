// C0.10 PR 2 (LCV-07; TECH-SPEC T23 item 14): schema.ts's generated rows fit what derivedFacts()
// reads, and the state and mode unions are equal both ways, so a new state or mode fails typecheck
// here until derivedFacts() decides it.
import type { ProvenanceItemRow, ProvenanceSourceRow } from '@hearth/access'
import { derivedFacts } from '@hearth/access'
import type { Selectable } from 'kysely'
import { describe, expect, it } from 'vitest'
import type { ProvenanceItems, ProvenanceSources } from '#src/db/schema.ts'

const item = (row: Selectable<ProvenanceItems>): ProvenanceItemRow => row
const source = (row: Selectable<ProvenanceSources>): ProvenanceSourceRow => row
const stateIn = (s: Selectable<ProvenanceItems>['state']): ProvenanceItemRow['state'] => s
const stateOut = (s: ProvenanceItemRow['state']): Selectable<ProvenanceItems>['state'] => s
const modeIn = (m: Selectable<ProvenanceItems>['mode']): ProvenanceItemRow['mode'] => m
const modeOut = (m: ProvenanceItemRow['mode']): Selectable<ProvenanceItems>['mode'] => m

// Made-up ids: the seed's fixture org and its Hearth principal, and a derived item made from a
// message and a file.
const ORG = 'a0000000-0000-4000-8000-000000000001'
const HEARTH = 'b0000000-0000-4000-8000-000000000000'
const RECORD = 'e1000000-0000-4000-8000-000000000001'
const DERIVED = 'e2000000-0000-4000-8000-000000000001'
const MESSAGE = 'e3000000-0000-4000-8000-000000000001'
const FILE = 'e4000000-0000-4000-8000-000000000001'

describe('the provenance registry’s rows as Kysely selects them (LCV-07)', () => {
  it('LCV-07 BRAIN-08: a selected item and its edges pass to derivedFacts() as they are', () => {
    const record: Selectable<ProvenanceItems> = {
      id: RECORD,
      org_id: ORG,
      created_tx: '1001',
      item_kind: 'derived',
      item_id: DERIVED,
      mode: modeOut(modeIn('derived')),
      state: stateOut(stateIn('live')),
      stale_since: null,
      stale_reason: null,
      withdrawn_at: null,
      withdrawn_reason: null,
      fingerprint: null,
      source_count: 2,
      acl_tokens: [`o:${ORG}`],
      acl_more: [],
      index_class: 'normal',
      acl_epoch: '1',
      // schema.ts types a column with a default as Generated<…>, and Selectable unwraps only that, so a
      // timestamp's selected type is still Timestamp's wrapper; pg gives a Date, so the row casts one.
      created_at: new Date('2026-10-29T00:00:00.000Z') as unknown as Selectable<ProvenanceItems>['created_at'],
      created_by: HEARTH,
    }
    const edge = (number: number, kind: string, id: string): Selectable<ProvenanceSources> => ({
      org_id: ORG,
      item: RECORD,
      number,
      source_kind: kind,
      source_id: id,
      source_version: null,
      anchor: null,
      gone_at: null,
    })
    // The edges in reverse, as a loader may read them.
    const facts = derivedFacts(
      ORG,
      [item(record)],
      [source(edge(2, 'file', FILE)), source(edge(1, 'message', MESSAGE))],
    )
    expect(facts).toEqual([
      {
        id: DERIVED,
        sources: [
          { kind: 'message', id: MESSAGE },
          { kind: 'file', id: FILE },
        ],
      },
    ])
    // Every state and mode crosses both ways.
    const states = ['live', 'stale', 'withdrawn'] as const
    const modes = ['derived', 'cited'] as const
    expect(states.map(s => stateOut(stateIn(s)))).toEqual([...states])
    expect(modes.map(m => modeOut(modeIn(m)))).toEqual([...modes])
  })
})
