// Proves on a real Postgres 17 that the SQL access filter (sql.ts, sqlReadableBy) admits exactly
// the rows the in-memory rule does (filterReadable; B.4, T3, BUILD-PLAN C0.4). C1.7's search and
// A2's retrieval pre-filter with it, so a difference would show or hide items (SRCH-04, PRD-107).
//
// It lives in scripts/ (Node types, pg) so that packages/access keeps a typecheck with no Node
// globals. It builds a throwaway database (access_sql_check) with every migration applied, as
// production's migrator applies them, plus a plain table holding one row per item as aclOf stores it
// (C0.6, C1.7), and checks:
// - edge rows (empty tokens, an empty clause, ragged clauses) against allows() for several key sets,
//   and a NULL acl_more, which no key set may read;
// - the fixture org, plus items whose readers need several clauses (the fixture's own all
//   normalise to one, so acl_more would otherwise go untested) and a chain (a digest made from a
//   derived item): for every person (those who have left included), both assistants and the system
//   principal, the rows, the count and every page SQL returns equal filterReadable;
// - after membership, team-membership and role changes only: the rows stored before the changes,
//   queried with each subject's new keys, equal filterReadable on the changed world, so a
//   membership change needs no re-ACL (lists.ts);
// - the provenance registry (0014; TECH-SPEC T23 item 14, BRAIN-08): every derived item written to
//   provenance_items and provenance_sources as a producer writes them, one transaction each, with
//   aclOf's row stored, reloads through derivedFacts() as the facts written, and the stored row
//   selects, for every subject, exactly what filterReadable allows on the World rebuilt from the
//   rows. Then lifecycle_cascade() from a deleted message withdraws everything made from it,
//   transitively, deleting none (each keeps a live source of a kind Hearth can't judge for holds
//   yet, so it is kept), and SQL then selects none of it, as filterReadable reads it from the rows
//   and from the world with the message deleted; and from a deleted session it deletes the one item
//   made from it alone, logging it;
// - agents: they read by scope, not by keys (AGT-04, can.ts), so the filter selects nothing for
//   them, over either table; A2's retrieval layer brings their SQL and its check.
//
//   node scripts/check-access-sql.ts
//
// Connects with the PG* variables as a superuser (default: the local stack) and refuses any host
// but this machine. The roles must exist (scripts/check-migrations.sh or npm run db:reset first; CI
// runs it after both). Exits 1 if any check fails.

import { createHash } from 'node:crypto'
import {
  aclOf,
  allows,
  type DerivedFact,
  derivedFacts,
  type Facts,
  filterReadable,
  keysOf,
  type Ref,
  type Subject,
  type Token,
  World,
} from '@hearth/access'
import { sqlReadableBy } from '@hearth/access/sql'
import {
  AG,
  ALL_REFS,
  AS,
  agent,
  assistant,
  C,
  CHAIN_DERIVED,
  CV,
  DV,
  FI,
  fixtureFacts,
  HEARTH,
  human,
  M,
  ORG,
  P,
  R,
  S,
  SEVERAL_CLAUSE_DERIVED,
  system,
  T,
} from '@hearth/access/testing'
import { type ColumnType, Kysely, PostgresDialect, sql } from 'kysely'
import { Client, Pool } from 'pg'
import { migrate } from '../apps/server/src/db/migrations.ts'
import type { DB as Schema } from '../apps/server/src/db/schema.ts'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const DB = 'access_sql_check'
const PAGE = 7
const host = process.env.PGHOST ?? '127.0.0.1'
const connection = {
  host,
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'postgres',
}

interface AclTable {
  kind: string
  id: string
  acl_tokens: string[]
  acl_more: ColumnType<unknown, string | null | undefined, string | null>
}
// The registry's tables as schema.ts types them, so reloaded rows pass to derivedFacts() as they are,
// and the plain tables this script makes itself.
interface Database extends Pick<Schema, 'deletion_log' | 'provenance_items' | 'provenance_sources'> {
  rows: AclTable
  edge_rows: AclTable
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function url(database: string): string {
  const result = new URL(`postgres://${connection.host.includes(':') ? `[${connection.host}]` : connection.host}`)
  result.port = String(connection.port)
  result.username = connection.user
  result.password = connection.password
  result.pathname = `/${database}`
  return result.toString()
}

// The derived items the checks add to the fixture's (packages/access testing): items whose readers
// need several clauses, and a chain, whose source is the fixture's ops summary.
const EXTRA_DERIVED: readonly DerivedFact[] = [...SEVERAL_CLAUSE_DERIVED, ...CHAIN_DERIVED]
function ref(kind: Ref['kind'], id: string): Ref {
  return { kind, id }
}
// The extra derived items, and a doc in the Trash whose trasher reads it only through a team grant
// (DRV-01), whose readers need several clauses too.
function withSeveralClauses(facts: Facts): Facts {
  return {
    ...facts,
    derived: [...facts.derived, ...EXTRA_DERIVED],
    files: facts.files.map(file =>
      file.id === FI.q4Proposal
        ? {
            ...file,
            trashedAt: 1,
            trashedById: P.daniel,
            grants: file.grants.filter(g => g.grantee.id !== P.daniel),
          }
        : file,
    ),
  }
}

// Membership, team-membership and role changes only (no grant, visibility, move or trash change):
// - Ahmad leaves the Q4 group DM after its last message, and Nadia joins it;
// - Farah leaves the floor group DM and rejoins it;
// - Priya leaves private #leadership, and Kelvin joins it;
// - Priya joins private #design-crit (Daniel is in it already), and Wei Ling leaves the private
//   board room;
// - Wei Ling and Daniel are removed from the Q4 team, and Nadia is added;
// - Marcus's Team Admin role for Operations is revoked, and Kelvin becomes Team Admin of People.
function withMembershipChanges(facts: Facts): Facts {
  const close = (id: string, throughSeq: number) => (m: Facts['memberships'][number]) =>
    m.id === id ? { ...m, throughSeq } : m
  const join = (spaceId: string, principalId: string, afterSeq: number) => ({
    id: `mb-check:${spaceId}:${principalId}:${afterSeq}`,
    spaceId,
    principalId,
    afterSeq,
    throughSeq: null,
  })
  const memberships = [
    close(`mb:${CV.q4}:${P.ahmad}:2`, 6),
    close(`mb:${CV.floor}:${P.farah}`, 1),
    close(`mb:${C.leadership}:${P.priya}`, 2),
    close(`mb:${R.board}:${P.weiling}`, 0),
  ].reduce((rows, change) => rows.map(change), [...facts.memberships])
  return {
    ...facts,
    memberships: [
      ...memberships,
      join(CV.q4, P.nadia, 6),
      join(CV.floor, P.farah, 1),
      join(C.leadership, P.kelvin, 2),
      join(C.studio, P.priya, 1),
    ],
    teamMembers: [
      ...facts.teamMembers.map(m =>
        m.teamId === T.q4 && (m.personId === P.weiling || m.personId === P.daniel) ? { ...m, removedAt: 2 } : m,
      ),
      { teamId: T.q4, personId: P.nadia, removedAt: null },
    ],
    roles: [
      ...facts.roles.map(r =>
        r.personId === P.marcus && r.role === 'team_admin' && r.teamId === T.operations ? { ...r, revokedAt: 2 } : r,
      ),
      { personId: P.kelvin, role: 'team_admin', teamId: T.people, revokedAt: null },
    ],
  }
}

const key = (r: { kind: string; id: string }) => `${r.kind}:${r.id}`
// Code-unit order, which is Postgres's "C" collation for these ASCII ids.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function describeSubject(subject: Subject): string {
  const name = Object.entries({ ...P, ...AS }).find(([, id]) => id === subject.id)?.[0] ?? subject.id
  return `${subject.kind} ${name}`
}

function difference(expected: readonly string[], actual: readonly string[]): string {
  const want = new Set(expected)
  const got = new Set(actual)
  const missing = expected.filter(x => !got.has(x))
  const extra = actual.filter(x => !want.has(x))
  return `missing [${missing.join(', ')}], extra [${extra.join(', ')}]`
}

// The database keys every row and token by uuid, and most fixture ids aren't one (m-ops-2, and
// mb:<space>:<principal> in an era token), so each maps to a fixed lower-case uuid of version 4's
// shape, from its sha256; a uuid stays as it is. The map runs both ways and refuses a collision, and
// an id it never made on the way back.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const fixtureIds = new Map<string, string>()
function uuidOf(id: string): string {
  let uuid = id
  if (!UUID.test(id)) {
    const hex = createHash('sha256').update(id).digest('hex')
    const variant = '89ab'.charAt(Number.parseInt(hex.charAt(16), 16) % 4)
    uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
  }
  const known = fixtureIds.get(uuid)
  if (known !== undefined && known !== id) throw new Error(`${id} and ${known} map to one uuid`)
  fixtureIds.set(uuid, id)
  return uuid
}
function idOf(uuid: string): string {
  const id = fixtureIds.get(uuid)
  if (id === undefined) throw new Error(`no fixture id maps to ${uuid}`)
  return id
}
// A token with its id mapped (m:ch-leadership, e:mb:… → e:<uuid>), so a stored row passes
// provenance_items_acl_tokens and a subject's keys meet it.
function tokenOf(token: Token): string {
  const at = token.indexOf(':')
  if (at < 1) throw new Error(`not a token: ${token}`)
  return `${token.slice(0, at)}:${uuidOf(token.slice(at + 1))}`
}

// A table compare() reads: the (kind, id) keys of the rows a subject's keys select, filtered in the
// query that counts and pages, how a subject's keys are stored, and the order its pages come in.
interface Target {
  rows(keys: readonly Token[], page?: { limit: number; offset: number }): Promise<string[]>
  count(keys: readonly Token[]): Promise<number>
  keys(world: World, subject: Subject): Token[]
  order(ref: Ref): string
}

// The plain table of every item's row, its ids as the fixture has them.
function aclRows(db: Kysely<Database>): Target {
  return {
    rows: async (keys, page) => {
      let query = db.selectFrom('rows').select(['kind', 'id']).where(sqlReadableBy(keys))
      if (page) {
        query = query.orderBy(sql`kind collate "C"`).orderBy(sql`id collate "C"`).limit(page.limit).offset(page.offset)
      }
      return (await query.execute()).map(key)
    },
    count: async keys => {
      const row = await db
        .selectFrom('rows')
        .select(eb => eb.fn.countAll<string>().as('total'))
        .where(sqlReadableBy(keys))
        .executeTakeFirstOrThrow()
      return Number(row.total)
    },
    keys: keysOf,
    order: key,
  }
}

// The registry's derived items, by the ACL row stored with each, their ids and tokens as uuids.
function registry(db: Kysely<Database>): Target {
  const base = (keys: readonly Token[]) =>
    db
      .selectFrom('provenance_items')
      .where('org_id', '=', ORG)
      .where('item_kind', '=', 'derived')
      .where(sqlReadableBy(keys))
  return {
    rows: async (keys, page) => {
      let query = base(keys).select('item_id')
      if (page) query = query.orderBy(sql`item_id::text collate "C"`).limit(page.limit).offset(page.offset)
      return (await query.execute()).map(r => key(ref('derived', idOf(r.item_id))))
    },
    count: async keys => {
      const row = await base(keys)
        .select(eb => eb.fn.countAll<string>().as('total'))
        .executeTakeFirstOrThrow()
      return Number(row.total)
    },
    keys: (world, subject) => keysOf(world, subject).map(tokenOf),
    order: r => uuidOf(r.id),
  }
}

// Every page of PAGE rows, in the target's order, filtered in the same query that pages.
async function pages(target: Target, keys: readonly Token[]): Promise<string[]> {
  const all: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const rows = await target.rows(keys, { limit: PAGE, offset })
    all.push(...rows)
    if (rows.length < PAGE) return all
  }
}

// Compares SQL with filterReadable for every subject; returns the failures.
async function compare(
  target: Target,
  world: World,
  subjects: readonly Subject[],
  refs: readonly Ref[],
): Promise<string[]> {
  const failures: string[] = []
  for (const subject of subjects) {
    const keys = target.keys(world, subject)
    const expected = filterReadable(world, subject, refs)
    const expectedKeys = expected.map(key).sort()
    const got = (await target.rows(keys)).sort()
    if (got.join('\n') !== expectedKeys.join('\n')) {
      failures.push(`${describeSubject(subject)}: rows ${difference(expectedKeys, got)}`)
    }
    const count = await target.count(keys)
    if (count !== expected.length)
      failures.push(`${describeSubject(subject)}: count ${count}, expected ${expected.length}`)
    const paged = await pages(target, keys)
    const inOrder = [...expected].sort((a, b) => byText(target.order(a), target.order(b))).map(key)
    if (paged.join('\n') !== inOrder.join('\n')) failures.push(`${describeSubject(subject)}: pages differ`)
  }
  return failures
}

async function checkEdgeRows(db: Kysely<Database>): Promise<string> {
  // A NULL acl_more (a table that forgot NOT NULL) must make a row nobody's, never drop its clauses.
  const nullMore = 'null-more'
  const rows: { id: string; acl: Token[][] }[] = [
    { id: 'no-clauses', acl: [] },
    { id: 'empty-first', acl: [[]] },
    { id: 'one', acl: [['a']] },
    { id: 'one-of-two', acl: [['a', 'b']] },
    { id: 'two', acl: [['a'], ['b']] },
    { id: 'empty-second', acl: [['a'], []] },
    { id: 'ragged', acl: [['a', 'b', 'c'], ['d'], ['b', 'e']] },
    { id: 'quoted', acl: [["p:it's"], ['m:"x"', 'e:a,b']] },
    { id: nullMore, acl: [['a']] },
  ]
  await db
    .insertInto('edge_rows')
    .values(
      rows.map(({ id, acl: [first = [], ...more] }) => ({
        kind: 'edge',
        id,
        acl_tokens: first,
        acl_more: id === nullMore ? null : JSON.stringify(more),
      })),
    )
    .execute()
  const keySets: Token[][] = [[], ['a'], ['b'], ['a', 'b'], ['a', 'd', 'e'], ['b', 'd'], ["p:it's", 'e:a,b'], ['z']]
  const failures: string[] = []
  for (const keys of keySets) {
    const got = (await db.selectFrom('edge_rows').select('id').where(sqlReadableBy(keys)).execute()).map(r => r.id)
    const expected = rows.filter(row => row.id !== nullMore && allows(row.acl, new Set(keys))).map(row => row.id)
    if ([...got].sort().join() !== [...expected].sort().join()) {
      failures.push(`keys [${keys.join(', ')}]: ${difference(expected, got)}`)
    }
  }
  if (failures.length > 0) throw new Error(failures.join('; '))
  return `${rows.length} rows x ${keySets.length} key sets agree with allows()`
}

// Writes one derived item's provenance as a producer will (0014; LH-39, LH-40): the item with
// aclOf's row, its tokens' ids mapped, then its edges 1 to n, in a transaction of its own (a derived
// item's sources must exist before it), as the superuser with the org set.
async function writeItem(db: Kysely<Database>, world: World, fact: DerivedFact): Promise<void> {
  const row = aclOf(world, ref('derived', fact.id))
  await db.transaction().execute(async trx => {
    await sql`select set_config('app.org_id', ${ORG}, true)`.execute(trx)
    const { id } = await trx
      .insertInto('provenance_items')
      .values({
        org_id: ORG,
        item_kind: 'derived',
        item_id: uuidOf(fact.id),
        mode: 'derived',
        source_count: fact.sources.length,
        acl_tokens: row.tokens.map(tokenOf),
        acl_more: JSON.stringify(row.more.map(clause => clause.map(tokenOf))),
        index_class: row.indexClass,
        acl_epoch: 1,
        created_by: HEARTH,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    for (const [at, source] of fact.sources.entries()) {
      await trx
        .insertInto('provenance_sources')
        .values({ org_id: ORG, item: id, number: at + 1, source_kind: source.kind, source_id: uuidOf(source.id) })
        .execute()
    }
  })
}

// The org's registry, all of each table in one statement, rebuilt as the World's derived facts.
async function reload(db: Kysely<Database>): Promise<DerivedFact[]> {
  const items = await db
    .selectFrom('provenance_items')
    .select(['id', 'org_id', 'item_kind', 'item_id', 'mode', 'state', 'source_count'])
    .where('org_id', '=', ORG)
    .execute()
  const sources = await db
    .selectFrom('provenance_sources')
    .select(['org_id', 'item', 'number', 'source_kind', 'source_id', 'gone_at'])
    .where('org_id', '=', ORG)
    .execute()
  return derivedFacts(
    ORG,
    items.map(r => ({ ...r, item_id: idOf(r.item_id) })),
    sources.map(e => ({ ...e, source_id: idOf(e.source_id) })),
  )
}

// Facts as comparable text: each item with its sources in order.
function factsText(facts: readonly DerivedFact[]): string {
  return [...facts]
    .sort((a, b) => byText(a.id, b.id))
    .map(f => `${f.id} <- ${f.sources.map(key).join(', ')}`)
    .join('\n')
}

// A deletion of a source, logged directly in the org's deletion log, then lifecycle_cascade() from
// it in one READ COMMITTED transaction with the org set: the log row's id and what the cascade
// deleted.
async function cascade(
  db: Kysely<Database>,
  source: Ref,
  logged: { class_key: string; object_table: string; cause: string },
): Promise<{ parent: string; deleted: number | undefined }> {
  return await db
    .transaction()
    .setIsolationLevel('read committed')
    .execute(async trx => {
      await sql`select set_config('app.org_id', ${ORG}, true)`.execute(trx)
      const id = uuidOf(source.id)
      // In SQL, so the log row's id comes back as pg gives a bigint, a string.
      const insert = sql<{ id: string }>`
        insert into public.deletion_log (org_id, class_key, object_table, object_id, cause)
        values (${ORG}, ${logged.class_key}, ${logged.object_table}, ${id}, ${logged.cause}) returning id`
      const parent = (await insert.execute(trx)).rows[0]?.id
      if (parent === undefined) throw new Error('the deletion was not logged')
      const call = sql<{ deleted: number }>`
        select public.lifecycle_cascade(${source.kind}, ${id}::uuid, ${parent}::bigint, 500) as deleted`
      const { rows } = await call.execute(trx)
      return { parent, deleted: rows[0]?.deleted }
    })
}

async function main(): Promise<number> {
  if (!LOCAL_HOSTS.has(host)) {
    console.error(`check-access-sql: refusing ${host}: point PG* at the local stack or CI's service`)
    return 2
  }
  const admin = new Client({ ...connection, database: 'postgres' })
  await admin.connect()
  try {
    await admin.query(`drop database if exists ${DB} with (force)`)
    await admin.query(`create database ${DB} owner hearth_owner template template0`)
  } finally {
    await admin.end()
  }

  let failed = 0
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool({ ...connection, database: DB, max: 2 }) }),
  })
  const run = async (name: string, check: () => Promise<string>) => {
    try {
      console.log(`ok    ${name}: ${await check()}`)
    } catch (error) {
      failed += 1
      console.error(`FAIL  ${name}: ${message(error)}`)
    }
  }
  try {
    const built = await migrate({ databaseUrl: url(DB), role: 'hearth_owner' })
    if (built.error !== undefined) throw new Error(`the migrations failed: ${message(built.error)}`)
    // The fixture org and its Hearth principal, as db/seed/tembusu.sql makes them.
    await sql`insert into public.orgs (id, name) values (${ORG}, 'Tembusu Logistics')`.execute(db)
    await sql`
      insert into public.principals (id, org_id, kind, system_key)
      values (${HEARTH}, ${ORG}, 'system', 'hearth')`.execute(db)
    for (const table of ['rows', 'edge_rows'] as const) {
      await db.schema
        .createTable(table)
        .addColumn('kind', 'text', c => c.notNull())
        .addColumn('id', 'text', c => c.notNull())
        .addColumn('acl_tokens', sql`text[]`, c => c.notNull())
        .addColumn('acl_more', 'jsonb', c => (table === 'rows' ? c.notNull().defaultTo(sql`'[]'::jsonb`) : c))
        .addPrimaryKeyConstraint(`${table}_pkey`, ['kind', 'id'])
        .execute()
    }

    const before = new World(withSeveralClauses(fixtureFacts()))
    const after = new World(withMembershipChanges(withSeveralClauses(fixtureFacts())))
    const refs = [...ALL_REFS(), ...EXTRA_DERIVED.map(d => ref('derived', d.id))]
    const subjects: Subject[] = [
      ...before.facts.people.map(person => human(person.id)),
      assistant(AS.ashton),
      assistant(AS.daniel),
      system,
    ]
    const stored = refs.map(r => ({ ref: r, row: aclOf(before, r) }))
    await db
      .insertInto('rows')
      .values(
        stored.map(({ ref: r, row }) => ({
          kind: r.kind,
          id: r.id,
          acl_tokens: [...row.tokens],
          acl_more: JSON.stringify(row.more),
        })),
      )
      .execute()
    const severalClauses = stored.filter(s => s.row.more.length > 0).length

    await run('edge rows', () => checkEdgeRows(db))

    await run('fixture rows', async () => {
      if (severalClauses === 0) throw new Error('no row has more than one clause, so acl_more went untested')
      const failures = await compare(aclRows(db), before, subjects, refs)
      if (failures.length > 0) throw new Error(failures.join('; '))
      return `${refs.length} rows (${severalClauses} with several clauses), ${subjects.length} subjects: rows, counts and pages of ${PAGE} equal filterReadable`
    })

    await run('membership changes need no re-ACL', async () => {
      const changed = stored.filter(s => JSON.stringify(aclOf(after, s.ref)) !== JSON.stringify(s.row))
      if (changed.length > 0) throw new Error(`stored rows changed: ${changed.map(s => key(s.ref)).join(', ')}`)
      return `aclOf gives the same row for all ${refs.length} items after the changes`
    })

    await run('stored rows with new keys', async () => {
      const moved = subjects.filter(
        s => filterReadable(before, s, refs).map(key).join('\n') !== filterReadable(after, s, refs).map(key).join('\n'),
      )
      if (moved.length === 0) throw new Error('the changes moved nobody’s access, so the check proves nothing')
      const failures = await compare(aclRows(db), after, subjects, refs)
      if (failures.length > 0) throw new Error(failures.join('; '))
      return `rows stored before the changes, queried with keys after them, equal filterReadable for ${subjects.length} subjects (${moved.length} of whom gained or lost access)`
    })

    await run('agents select nothing', async () => {
      const agents = Object.values(AG).map(agent)
      for (const a of agents) {
        const keys = keysOf(before, a)
        const got = await aclRows(db).rows(keys)
        if (keys.length > 0 || got.length > 0) throw new Error(`${a.id}: ${keys.length} keys, ${got.length} rows`)
      }
      return `${agents.length} agents hold no keys and match no row; they read by scope (A2)`
    })

    // The provenance registry (0014). dv-no-sources can't be stored, since a derived item has at
    // least one source (provenance_items_source_count); LCA-04g covers it in memory. Each item is
    // written after its derived sources, so the chain comes after the ops summary.
    const written = before.facts.derived.filter(d => d.sources.length > 0)
    const derivedRefs = written.map(d => ref('derived', d.id))
    const madeFromOps2 = [DV.opsSummary, DV.mixed, ...CHAIN_DERIVED.map(d => d.id)]
    const target = registry(db)
    let ready = false
    const registryWorld = (derived: readonly DerivedFact[], facts: Facts = before.facts) =>
      new World({ ...facts, derived })

    await run('registry rows rebuild the facts', async () => {
      const done = new Set<string>()
      for (const fact of written) {
        const early = fact.sources.find(s => s.kind === 'derived' && !done.has(s.id))
        if (early) throw new Error(`${fact.id} would be written before its source ${early.id}`)
        await writeItem(db, before, fact)
        done.add(fact.id)
      }
      const reloaded = await reload(db)
      if (factsText(reloaded) !== factsText(written)) {
        throw new Error(`reloaded:\n${factsText(reloaded)}\nwritten:\n${factsText(written)}`)
      }
      ready = true
      return `${written.length} derived items (${EXTRA_DERIVED.length} beside the fixture's, a chain among them) written one transaction each and reloaded through derivedFacts() as written`
    })

    await run('registry rows', async () => {
      if (!ready) throw new Error('the registry was not written')
      const w = registryWorld(await reload(db))
      const failures = await compare(target, w, subjects, derivedRefs)
      if (failures.length > 0) throw new Error(failures.join('; '))
      const read = subjects.filter(s => filterReadable(w, s, derivedRefs).length > 0).length
      if (read === 0) throw new Error('nobody reads any derived item, so the check proves nothing')
      return `${derivedRefs.length} stored rows, ${subjects.length} subjects (${read} of whom read some): rows, counts and pages of ${PAGE} equal filterReadable on the World rebuilt from the rows`
    })

    await run('registry: a deleted message withdraws what was made from it', async () => {
      if (!ready) throw new Error('the registry was not written')
      // No retention class lists a messages table before C1.1, so log_deletion() would refuse its
      // row (22023): the message's deletion is logged directly.
      const { deleted } = await cascade(db, ref('message', M.ops2), {
        class_key: 'messages',
        object_table: 'messages',
        cause: 'user',
      })
      // Each keeps a live source of a kind lifecycle_kinds() doesn't know yet (a message, a file), so
      // each is held, failing closed, and stays withdrawn.
      if (deleted !== 0) throw new Error(`the cascade deleted ${deleted}, expected 0`)
      const rows = await db
        .selectFrom('provenance_items')
        .select(['item_id', 'state', 'acl_tokens', 'acl_more'])
        .where('org_id', '=', ORG)
        .where('item_id', 'in', madeFromOps2.map(uuidOf))
        .execute()
      const nobodys = rows.filter(
        r => r.state === 'withdrawn' && r.acl_tokens?.length === 0 && JSON.stringify(r.acl_more) === '[]',
      )
      if (rows.length !== madeFromOps2.length || nobodys.length !== rows.length) {
        throw new Error(`expected ${madeFromOps2.length} withdrawn rows stored as nobody's: ${JSON.stringify(rows)}`)
      }
      const edges = await db
        .selectFrom('provenance_sources')
        .select(['gone_at'])
        .where('org_id', '=', ORG)
        .where('source_kind', '=', 'message')
        .where('source_id', '=', uuidOf(M.ops2))
        .execute()
      if (edges.length !== 2 || edges.some(e => e.gone_at === null)) {
        throw new Error(`expected M.ops2's two edges gone: ${JSON.stringify(edges)}`)
      }
      const reloaded = await reload(db)
      const emptied = reloaded.filter(f => madeFromOps2.includes(f.id) && f.sources.length === 0)
      if (emptied.length !== madeFromOps2.length) throw new Error(`reloaded with sources:\n${factsText(reloaded)}`)
      const failures: string[] = []
      for (const s of subjects) {
        const got = await target.rows(target.keys(before, s))
        const leaked = madeFromOps2.filter(id => got.includes(key(ref('derived', id))))
        if (leaked.length > 0) failures.push(`${describeSubject(s)} selects ${leaked.join(', ')}`)
      }
      const deletedMessage: Facts = {
        ...before.facts,
        messages: before.facts.messages.map(m => (m.id === M.ops2 ? { ...m, deletedAt: 2 } : m)),
      }
      failures.push(...(await compare(target, registryWorld(reloaded), subjects, derivedRefs)))
      failures.push(...(await compare(target, new World(deletedMessage), subjects, derivedRefs)))
      if (failures.length > 0) throw new Error(failures.join('; '))
      return `${madeFromOps2.length} items withdrawn (the chain's through the ops summary), stored as nobody's, kept; SQL selects none of them and equals filterReadable on the reloaded rows and on the world with the message deleted, for ${subjects.length} subjects`
    })

    await run('registry: a deleted session deletes what was made from it alone', async () => {
      if (!ready) throw new Error('the registry was not written')
      const record = await db
        .selectFrom('provenance_items')
        .select('id')
        .where('org_id', '=', ORG)
        .where('item_kind', '=', 'derived')
        .where('item_id', '=', uuidOf(DV.digest))
        .executeTakeFirstOrThrow()
      const { parent, deleted } = await cascade(db, ref('session', S.pricing), {
        class_key: 'session_records',
        object_table: 'session_records',
        cause: 'retention',
      })
      if (deleted !== 1) throw new Error(`the cascade deleted ${deleted}, expected 1 (the weekly digest)`)
      const reloaded = await reload(db)
      if (reloaded.some(f => f.id === DV.digest)) throw new Error('the weekly digest is still in the registry')
      const leftover = await db
        .selectFrom('provenance_sources')
        .select(eb => eb.fn.countAll<string>().as('total'))
        .where('org_id', '=', ORG)
        .where('item', '=', record.id)
        .executeTakeFirstOrThrow()
      if (Number(leftover.total) !== 0) throw new Error(`${leftover.total} edges of the weekly digest are left`)
      const logged = await db
        .selectFrom('deletion_log')
        .select(eb => eb.fn.countAll<string>().as('total'))
        .where('org_id', '=', ORG)
        .where('class_key', '=', 'provenance')
        .where('object_table', '=', 'provenance_items')
        .where('object_id', '=', record.id)
        .where('cause', '=', 'cascade')
        .where('parent_id', '=', parent)
        .executeTakeFirstOrThrow()
      if (Number(logged.total) !== 1) throw new Error(`${logged.total} log rows for the weekly digest, expected 1`)
      const failures = await compare(target, registryWorld(reloaded), subjects, derivedRefs)
      if (failures.length > 0) throw new Error(failures.join('; '))
      return `the weekly digest, made from the pricing review alone, deleted and logged once with the session's row as parent; selected by nobody, and SQL equals filterReadable for ${subjects.length} subjects`
    })

    await run('agents select nothing in the registry', async () => {
      if (!ready) throw new Error('the registry was not written')
      const agents = Object.values(AG).map(agent)
      for (const a of agents) {
        const keys = target.keys(before, a)
        const got = await target.rows(keys)
        if (keys.length > 0 || got.length > 0) throw new Error(`${a.id}: ${keys.length} keys, ${got.length} rows`)
      }
      return `${agents.length} agents hold no keys and match no stored derived item`
    })
  } finally {
    await db.destroy()
    const cleanup = new Client({ ...connection, database: 'postgres' })
    await cleanup.connect()
    await cleanup.query(`drop database if exists ${DB} with (force)`)
    await cleanup.end()
  }
  return failed === 0 ? 0 : 1
}

process.exitCode = await main().catch((error: unknown) => {
  console.error(`check-access-sql: ${message(error)}`)
  return 1
})
