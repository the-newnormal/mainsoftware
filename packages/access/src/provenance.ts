// C0.10 PR 2 (TECH-SPEC T23 item 14; BRAIN-08, Rule 3; LH-39): the World's derived facts from the
// provenance registry's stored rows. packages/access imports no app, so the rows are structural types
// mirroring the columns this reads (apps/server's provenance-rows.test.ts holds schema.ts's rows
// assignable to them, LCV-07). It reads no stored ACL column: the World always recomputes a derived
// item's readers from its sources, so a stale stored row can never widen anything. Every anomaly makes
// the whole item a fact with no sources, which reads as nobody (readers.ts, R3-17), never a fact with
// fewer sources, whose intersection would be wider.
import { type DerivedFact, type Id, RESOURCE_KINDS, type Ref, type ResourceKind } from './model.ts'

export interface ProvenanceItemRow {
  id: string
  org_id: string
  item_kind: string
  item_id: string
  mode: 'derived' | 'cited'
  state: 'live' | 'stale' | 'withdrawn'
  source_count: number | null
}
export interface ProvenanceSourceRow {
  org_id: string
  item: string
  number: number
  source_kind: string
  source_id: string
  gone_at: Date | string | null
}

const KINDS: ReadonlySet<string> = new Set(RESOURCE_KINDS)
const isResourceKind = (kind: string): kind is ResourceKind => KINDS.has(kind)

// The org's derived items, one fact per record of item kind derived, sorted by id. Cited records and
// other derived-mode kinds (a draft, a suggested task, a slide copy) keep their own read rules and
// produce nothing here; another org's rows and edges are passed over (ACC-11).
export function derivedFacts(
  orgId: Id,
  items: readonly ProvenanceItemRow[],
  sources: readonly ProvenanceSourceRow[],
): DerivedFact[] {
  const records = new Map<string, ProvenanceItemRow>()
  const itemIds = new Set<Id>()
  for (const row of items) {
    if (row.org_id !== orgId || row.item_kind !== 'derived') continue
    // The database's keys make either impossible, so a repeat is a bad loader join, which the World
    // refuses as it refuses two facts with one id.
    if (records.has(row.id)) throw new Error(`Two provenance records share the id ${row.id}`)
    if (itemIds.has(row.item_id)) throw new Error(`Two provenance records share the derived item ${row.item_id}`)
    records.set(row.id, row)
    itemIds.add(row.item_id)
  }
  const edges = new Map<string, ProvenanceSourceRow[]>()
  for (const edge of sources) {
    if (edge.org_id !== orgId || !records.has(edge.item)) continue
    const list = edges.get(edge.item)
    if (list) list.push(edge)
    else edges.set(edge.item, [edge])
  }
  return [...records.values()]
    .map(row => ({ id: row.item_id, sources: sourcesOf(row, edges.get(row.id) ?? []) }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

// An item's sources in number order, or none (nobody reads it) unless the record is a live or stale
// derived one whose every source_count edge is there, numbered 1 to source_count, live, of a kind the
// access core decides and named once. A stale item keeps its sources: staleness is freshness, not
// access (LH-42). A derived source stays a derived Ref, so the World resolves a chain and reads a
// cycle as nobody's (R3-20).
function sourcesOf(row: ProvenanceItemRow, edges: readonly ProvenanceSourceRow[]): Ref[] {
  if (row.mode !== 'derived' || (row.state !== 'live' && row.state !== 'stale')) return []
  if (edges.length === 0 || row.source_count !== edges.length) return []
  const ordered = [...edges].sort((a, b) => a.number - b.number)
  const named = new Set<string>()
  const refs: Ref[] = []
  for (const [at, edge] of ordered.entries()) {
    // A gap, a repeat, a 0 or a fraction each leave some edge off its place.
    if (edge.number !== at + 1 || edge.gone_at !== null || !isResourceKind(edge.source_kind)) return []
    const key = `${edge.source_kind}:${edge.source_id}`
    if (named.has(key)) return []
    named.add(key)
    refs.push({ kind: edge.source_kind, id: edge.source_id })
  }
  return refs
}
