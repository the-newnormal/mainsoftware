// Checks that the catalogues in code match the database the migrations build, both ways (C0.6;
// TECH-SPEC T16 item 7, T17 item 1, T18), against the scratch database scripts/check-migrations.sh
// builds (CHECK_DB, default hearth_check):
//   1. every way a runtime transaction can write a table in schema public is covered by
//      apps/server/src/outbox/coverage.ts: every INSERT, UPDATE (by column) and DELETE any runtime
//      role holds on one, every function of public such a role may execute, and every SECURITY
//      DEFINER and trigger function there, each with an event or a reasoned exemption; each
//      function's entry lists every table (every column, for an UPDATE) its body writes, and no
//      body is one this can't read (BEGIN ATOMIC, or EXECUTE outside DYNAMIC_DDL); no stale entry; MATCH names real
//      columns; no content table (packages/shared CONTENT_TABLES, or one an event with an ACL
//      snapshot covers) is exempt, by grant or through a function, and no insert into the
//      provenance registry (a producer's, T23 item 14) is exempt. scripts/check-migrations.sh
//      refuses any other schema, and rules, so nothing writes outside what this reads. Postgres's
//      own functions (pg_catalog's, such as the large-object ones every role may call by default)
//      aren't the schema's and aren't checked;
//   2. packages/shared EVENTS' names equal migration 0007's outbox_events_type list;
//   3. packages/shared FLAGS equals feature_flag_defaults() (keys, defaults and locks), with every
//      ai.* flag off and locked in both;
//   4. apps/server/src/db/roles.ts JOB_ROLES equals the job roles hearth_worker may SET;
//   5. every outbox consumer the worker runs (apps/server/src/worker/index.ts productionRegistries)
//      is bound in outbox_checkpoints_own_row() to exactly the role it runs as, and every name bound
//      there is one of them (0008, T16 item 3): read from the function's body, and tried in a
//      transaction it rolls back (a scratch org's checkpoint naming another job role must be
//      refused, one naming the consumer's own role accepted);
//   6. packages/shared PURPOSES, PINNED_PURPOSES and ACTIVE_FROM_START equal
//      processing_register_defaults() (keys, ai, pinned, needs_switch and the starting status), and
//      PROVIDERS and AI_PROVIDERS equal transfer_register_defaults() (keys and ai), both ways; every
//      org has exactly those rows (one this makes too, in a transaction it rolls back, whose rows
//      come from the trigger on orgs), and every later version keeps its version 1's fixed columns
//      (C0.9, TECH-SPEC T22 item 18); and, from C0.9 PR 2, NOTICE_TRANSFER_FACTS equals the keys
//      notice_facts() (0010) builds, each read from the snapshot's key of the same name (PD-41). No
//      runtime role may run notice_facts(), so this superuser calls it;
//   7. from C0.10 (TECH-SPEC T23 items 3 and 19; LH-04, LH-12), the retention registry: packages/shared
//      RETENTION_CLASSES' Postgres and S3 classes equal retention_class_defaults() (0013) on every
//      column, both ways (a); every table of public, the migrator's ledger aside, is in exactly one
//      class (b); each fixed age is the interval in its function's body, comments aside (c); the
//      guard (lifecycle_guard() and lifecycle_no_truncate()) is on exactly the tables
//      apps/server/src/lifecycle/deletes.ts GUARDED_TABLES lists, each naming its own table, enabled
//      the default way, with no WHEN condition or UPDATE OF list, with deletion_log_kept() (before
//      every insert, update and delete: GUARD-01) and legal_holds_kept() on theirs (d); every AI class
//      has a finite period and none is kept (e); HOLD_TARGET_KINDS, DELETION_CAUSES, HOLD_KINDS and
//      REFUSED_COPY_HOLD equal the database's, and retention_period_days() answers every days class's
//      default (f); and the hold decision's resolvers know every kind and every holds-apply table,
//      tried in a transaction it rolls back (g). None of these functions is a runtime role's, so this
//      superuser calls them;
//   8. from C0.10 (T23 item 9; LH-14), every delete path the database allows (a runtime role's DELETE
//      grant, a function of public whose body deletes, a plain helper no runtime role may run
//      included, since a definer can call it (GUARD-03), a foreign key that cascades or sets null or
//      a default, a DYNAMIC_DDL function) is decided in apps/server/src/lifecycle/deletes.ts
//      DELETE_PATHS as guarded, checked (only into a table a leaver's reduction marks, logging each
//      row: GUARD-02) or exempt, each decision one docs/TECH-SPEC.md records, and no entry is stale;
//      every guarded path says what it is to the provenance registry (T23 item 14): one whose rows
//      can be a source calls provenance_forget() in its body, one whose rows never are cites a
//      decision TECH-SPEC records or an id T23 cites, and the registry's own deletes from its two
//      tables alone;
//      no function body of public runs TRUNCATE, DROP TABLE, DETACH PARTITION, a trigger disabled,
//      dropped or enabled ALWAYS or REPLICA, a setting of session_replication_role, a change to
//      the guard's functions, or a guard's trigger replaced or made with a WHEN condition or an
//      UPDATE OF list, none of which is a DELETE a path could decide, as a plain statement or in a
//      DYNAMIC_DDL function's strings; every DYNAMIC_DDL function's body is the one pinned with it
//      (R2CODE-01); and no function check 1 doesn't reach has a body this can't read (BEGIN ATOMIC,
//      or EXECUTE outside DYNAMIC_DDL).
// The runtime roles are found as scripts/check-migrations.sh finds them: every role granted
// something in the database (the owner aside), and every role that can use one of them by SET or
// INHERIT. The integration suites' sweep (apps/server/src/testing/writes.ts) checks the writes the
// code actually makes; this checks every write the database allows.
//
//   node apps/server/scripts/check-catalogues.ts
//
// CI's migrations job runs it after the DB tests. Connects with the PG* variables as a superuser
// (default: the local stack) and refuses any host but this machine. Exits 1 on any problem.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  ACTIVE_FROM_START,
  AI_PROVIDERS,
  DELETION_CAUSES,
  EVENT_TYPES,
  FLAGS,
  HOLD_KINDS,
  HOLD_TARGET_KINDS,
  NOTICE_TRANSFER_FACTS,
  PINNED_PURPOSES,
  PROVIDERS,
  PURPOSES,
  REFUSED_COPY_HOLD,
  RETENTION_CLASSES,
  type RetentionClass,
  retentionClassDefaults,
} from '@hearth/shared'
import { Client } from 'pg'
import { JOB_ROLES } from '#src/db/roles.ts'
import { DELETE_PATHS, GUARDED_TABLES } from '#src/lifecycle/deletes.ts'
import { MATCH, WRITES } from '#src/outbox/coverage.ts'
import { productionRegistries } from '#src/worker/index.ts'
import {
  aiClassProblems,
  type BindingProbe,
  bindingProblems,
  bodyDdlProblems,
  bodyProblems,
  type ClassDefault,
  checkpointBindings,
  classTableProblems,
  contentProblems,
  coverageProblems,
  deletePathProblems,
  deletePathsOf,
  eventProblems,
  type Fn,
  type ForeignKey,
  fixedAgeProblems,
  flagProblems,
  type Grant,
  guardProblems,
  helperBodyProblems,
  holdsTables,
  matchProblems,
  noticeFactProbe,
  noticeFactProblems,
  type OrgRegisters,
  type ProviderDefault,
  type PurposeDefault,
  type Relation,
  type ResolverProbe,
  recordedDecisions,
  recordedReasons,
  registerProblems,
  resolverProblems,
  retentionDefaultProblems,
  roleProblems,
  type TriggerRow,
  type Vocabularies,
  vocabularyProblems,
} from './catalogues.ts'

// The worker's consumers, by name and role. Building the registries publishes nothing: the
// handlers' publisher is only called when a job runs, which never happens here.
const NO_PUBLISH = {
  valkey: { publish: async () => 0 },
  keyPrefix: 'check-catalogues:',
  logger: { warn: () => {}, error: () => {} },
}
const consumers = productionRegistries(NO_PUBLISH).consumers.map(({ name, role }) => ({ name, role }))

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const host = process.env.PGHOST ?? '127.0.0.1'
if (!LOCAL_HOSTS.has(host)) {
  process.stderr.write(`Refusing to check Postgres on ${host}: this runs on the local stack or in CI only.\n`)
  process.exit(2)
}
const database = process.env.CHECK_DB ?? 'hearth_check'

// The runtime roles, as scripts/check-migrations.sh finds them.
const RUNTIME = `
  with recursive rel as (
    select c.oid, c.relowner, c.relacl from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  ), fn as (
    select p.oid, p.proowner, p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ), runtime (oid) as (
    select a.grantee from rel cross join lateral aclexplode(relacl) a where a.grantee not in (0, rel.relowner)
    union
    select a.grantee from rel join pg_attribute att on att.attrelid = rel.oid and att.attnum > 0
      cross join lateral aclexplode(att.attacl) a where a.grantee not in (0, rel.relowner)
    union
    select a.grantee from fn cross join lateral aclexplode(fn.proacl) a where a.grantee not in (0, fn.proowner)
    union
    select m.member from pg_auth_members m join runtime r on r.oid = m.roleid where m.set_option or m.inherit_option
  )
  select r.oid, r.rolname from runtime x join pg_roles r on r.oid = x.oid`

// Every write grant of every runtime role: a row INSERT when it may insert any column, an UPDATE
// per column it may update, a DELETE.
const GRANTS = `
  with runtime as (${RUNTIME}),
  tables as (
    select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
  ),
  columns as (
    select t.oid, t.relname, a.attnum, a.attname from tables t
    join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
  )
  select distinct r.rolname as role, c.relname as table, 'INSERT' as op, null as column
  from runtime r join columns c on has_column_privilege(r.oid, c.oid, c.attnum, 'INSERT')
  union all
  select r.rolname, c.relname, 'UPDATE', c.attname
  from runtime r join columns c on has_column_privilege(r.oid, c.oid, c.attnum, 'UPDATE')
  union all
  select r.rolname, t.relname, 'DELETE', null
  from runtime r join tables t on has_table_privilege(r.oid, t.oid, 'DELETE')
  order by 1, 2, 3, 4`

// Every function of public, each marked whether a runtime transaction can reach it (executable by a
// runtime role, SECURITY DEFINER, or a trigger function): check 1 reads the reachable ones, and check
// 8 every one, since a plain helper deletes just as well when a definer calls it (GUARD-03).
// Functions that belong to an extension aren't the schema's own.
const FUNCTIONS = `
  with runtime as (${RUNTIME})
  select p.proname || '(' || oidvectortypes(p.proargtypes) || ')' as key, p.prosecdef as definer,
         p.prorettype = 'trigger'::regtype as trigger, p.prosrc as source,
         p.prosqlbody is not null as atomic,
         array(select r.rolname::text from runtime r where has_function_privilege(r.oid, p.oid, 'EXECUTE') order by 1)
           as executors,
         (p.prosecdef or p.prorettype = 'trigger'::regtype
          or exists (select 1 from runtime r where has_function_privilege(r.oid, p.oid, 'EXECUTE'))) as reachable
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  order by 1`

const client = new Client({
  host,
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'postgres',
  database,
})

try {
  await client.connect()
} catch {
  process.stderr.write(`Can't connect to ${database}: run scripts/check-migrations.sh first (with the stack up).\n`)
  process.exit(2)
}

try {
  const grants = (await client.query<Grant & { column: string | null }>(GRANTS)).rows.map(row =>
    row.column === null ? { role: row.role, table: row.table, op: row.op } : row,
  ) as Grant[]
  const everyFunction = (await client.query<Fn & { reachable: boolean }>(FUNCTIONS)).rows
  const functions = everyFunction.filter(fn => fn.reachable)
  const columns = new Set(
    (
      await client.query<{ name: string }>(`
        select c.relname || '.' || a.attname as name from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        where n.nspname = 'public' and c.relkind in ('r', 'p')`)
    ).rows.map(row => row.name),
  )
  const check = (
    await client.query<{ definition: string }>(`
      select pg_get_constraintdef(c.oid) as definition from pg_constraint c
      where c.conrelid = 'public.outbox_events'::regclass and c.conname = 'outbox_events_type'`)
  ).rows[0]?.definition
  const types = [...(check ?? '').matchAll(/'([^']+)'::text/g)].map(match => match[1] ?? '')
  const defaults = (
    await client.query<{ key: string; enabled: boolean; locked: boolean }>(
      'select key, enabled, locked from public.feature_flag_defaults()',
    )
  ).rows
  // rds_iam, which IAM sign-in needs on RDS, is no job role.
  const settable = (
    await client.query<{ role: string }>(`
      select r.rolname as role from pg_auth_members m
      join pg_roles r on r.oid = m.roleid join pg_roles w on w.oid = m.member
      where w.rolname = 'hearth_worker' and m.set_option and r.rolname <> 'rds_iam'
      order by 1`)
  ).rows.map(row => row.role)

  const ownRow = (
    await client.query<{ source: string }>(`
      select p.prosrc as source from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'outbox_checkpoints_own_row'`)
  ).rows
  const bound = ownRow.length === 1 ? checkpointBindings(ownRow[0]?.source ?? '') : undefined
  const probes = await probeBindings()
  const purposeDefaults = (
    await client.query<PurposeDefault>(
      'select purpose, ai, pinned, needs_switch, status from public.processing_register_defaults()',
    )
  ).rows
  const providerDefaults = (
    await client.query<ProviderDefault>('select provider, ai from public.transfer_register_defaults()')
  ).rows
  const orgs = await readOrgRegisters()
  // Every key a clearance's snapshot may hold (transfer_register_facts(), 0009), each with a value
  // of its own name, so notice_facts() shows which it reads and from where.
  const snapshotKeys = (
    await client.query<{ key: string }>(
      'select jsonb_object_keys(public.transfer_register_facts(null::public.transfer_register)) as key',
    )
  ).rows.map(row => row.key)
  const noticeFacts = (
    await client.query<{ facts: unknown }>('select public.notice_facts($1::jsonb) as facts', [
      JSON.stringify(noticeFactProbe([...new Set([...snapshotKeys, ...NOTICE_TRANSFER_FACTS])])),
    ])
  ).rows[0]?.facts

  // Check 7: the retention registry.
  const classes: Readonly<Record<string, RetentionClass>> = RETENTION_CLASSES
  const classRows = (
    await client.query<ClassDefault>(
      'select key, store, ai, period_kind, days, anchor, follows, holds, tables, objects from public.retention_class_defaults()',
    )
  ).rows
  // Every table of public with the root of its partition tree, the migrator's ledger aside.
  const relations = (
    await client.query<Relation>(`
      select c.relname as name,
             coalesce((select r.relname from pg_class r where r.oid = pg_partition_root(c.oid)), c.relname) as root
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and c.relname not in ('kysely_migration', 'kysely_migration_lock')
      order by 1`)
  ).rows
  const fixedFns = [...new Set(Object.values(classes).flatMap(spec => (spec.fixedIn ?? []).map(f => f.fn)))]
  const bodies = new Map<string, string[]>()
  for (const row of (
    await client.query<{ name: string; source: string }>(
      `select p.proname as name, p.prosrc as source from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any($1)`,
      [fixedFns],
    )
  ).rows) {
    bodies.set(row.name, [...(bodies.get(row.name) ?? []), row.source])
  }
  const triggers = (
    await client.query<Omit<TriggerRow, 'args'> & { tgargs: Buffer; nargs: number }>(`
      select c.relname as relation,
             coalesce((select r.relname from pg_class r where r.oid = pg_partition_root(c.oid)), c.relname) as root,
             t.tgname as name, p.proname as fn, t.tgtype::int as type, t.tgenabled as enabled,
             t.tgargs, t.tgnargs::int as nargs, t.tgqual is not null as conditional,
             cardinality(t.tgattr::int2[]) as columns
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'public' and not t.tgisinternal
      order by 1, 3`)
  ).rows.map(({ tgargs, nargs, ...row }) => ({
    ...row,
    // tgargs holds each argument followed by a zero byte.
    args: tgargs.toString('utf8').split('\0').slice(0, nargs),
  }))
  const targetCheck = (
    await client.query<{ definition: string }>(`
      select pg_get_constraintdef(c.oid) as definition from pg_constraint c
      where c.conrelid = 'public.legal_holds'::regclass and c.conname = 'legal_holds_target_kind'`)
  ).rows[0]?.definition
  const refused = (
    await client.query<{ days: number; notice_margin_days: number }>(
      'select days, notice_margin_days from public.refused_copy_hold()',
    )
  ).rows[0]
  const lifecycleKinds = (
    await client.query<{ kind: string }>('select k as kind from public.lifecycle_kinds() k')
  ).rows.map(row => row.kind)
  const database: Vocabularies = {
    holdTargetKinds: [...(targetCheck ?? '').matchAll(/'([^']+)'::text/g)].map(match => match[1] ?? ''),
    deletionCauses: (
      await client.query<{ cause: string }>('select x as cause from public.deletion_causes() x')
    ).rows.map(row => row.cause),
    holdKinds: lifecycleKinds,
    refusedCopyHold:
      refused === undefined ? undefined : { days: refused.days, noticeMarginDays: refused.notice_margin_days },
    periods: {},
  }
  const codeRows = retentionClassDefaults()
  const dayClasses = Object.fromEntries(
    codeRows.flatMap(row => (row.period_kind === 'days' && row.days !== null ? [[row.key, row.days]] : [])),
  ) as Record<string, number>
  const { periods, probes: resolverProbes } = await probeLifecycle(
    Object.keys(dayClasses),
    lifecycleKinds,
    classRows.filter(row => row.holds === 'apply').flatMap(row => row.tables),
  )
  database.periods = periods
  const applyTables = new Set(classRows.filter(row => row.holds === 'apply').flatMap(row => row.tables))

  // Check 8: every delete path, decided.
  const foreignKeys = (
    await client.query<ForeignKey>(`
      select c.relname as table, k.conname as name, k.confdeltype as action, p.relname as parent
      from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_class p on p.oid = k.confrelid
      join pg_namespace n on n.oid = k.connamespace
      where n.nspname = 'public' and k.contype = 'f' and k.conparentid = 0 and k.confdeltype in ('c', 'n', 'd')
      order by 1, 2`)
  ).rows
  const deletePaths = deletePathsOf(grants, everyFunction, foreignKeys)
  const spec = readFileSync(new URL('../../../docs/TECH-SPEC.md', import.meta.url), 'utf8')

  const problems = [
    ...coverageProblems(WRITES, grants, functions),
    ...bodyProblems(WRITES, functions, grants),
    ...matchProblems(WRITES, MATCH, columns),
    ...contentProblems(WRITES),
    ...(check === undefined ? ['outbox_events has no outbox_events_type check'] : eventProblems(EVENT_TYPES, types)),
    ...flagProblems(FLAGS, defaults),
    ...roleProblems(JOB_ROLES, settable),
    ...bindingProblems(consumers, bound, probes),
    ...registerProblems(
      {
        purposes: PURPOSES,
        pinned: PINNED_PURPOSES,
        activeFromStart: ACTIVE_FROM_START,
        providers: PROVIDERS,
        aiProviders: AI_PROVIDERS,
      },
      purposeDefaults,
      providerDefaults,
      orgs,
    ),
    ...noticeFactProblems(NOTICE_TRANSFER_FACTS, noticeFacts),
    ...retentionDefaultProblems(codeRows, classRows),
    ...classTableProblems(
      classes,
      relations.filter(r => r.name === r.root).map(r => r.name),
    ),
    ...fixedAgeProblems(classes, bodies),
    ...guardProblems(GUARDED_TABLES, relations, triggers, applyTables),
    ...aiClassProblems(classRows),
    ...(targetCheck === undefined ? ['legal_holds has no legal_holds_target_kind check'] : []),
    ...vocabularyProblems(
      {
        holdTargetKinds: HOLD_TARGET_KINDS,
        deletionCauses: DELETION_CAUSES,
        holdKinds: HOLD_KINDS,
        refusedCopyHold: REFUSED_COPY_HOLD,
        periods: dayClasses,
      },
      database,
    ),
    ...resolverProblems(resolverProbes),
    ...deletePathProblems(
      DELETE_PATHS,
      GUARDED_TABLES,
      deletePaths,
      holdsTables(classes),
      recordedDecisions(spec),
      recordedReasons(spec),
    ),
    ...bodyDdlProblems(everyFunction),
    ...helperBodyProblems(everyFunction.filter(fn => !fn.reachable)),
  ]
  if (problems.length > 0) {
    process.stderr.write(`The catalogues and the database disagree:\n${problems.map(p => `  - ${p}`).join('\n')}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(
      `OK: ${grants.length} write grants and ${functions.length} functions covered; ${types.length} event types, ${defaults.length} flags, ${settable.length} job roles, ${consumers.length} consumers' checkpoint bindings, ${purposeDefaults.length} purposes and ${providerDefaults.length} providers in ${orgs.length} orgs' registers, ${NOTICE_TRANSFER_FACTS.length} stated notice facts, ${classRows.length} retention classes over ${relations.filter(r => r.name === r.root).length} tables, the guard on ${GUARDED_TABLES.length} tables, ${resolverProbes.length} resolver calls and ${deletePaths.length} delete paths over ${everyFunction.length} functions match.\n`,
    )
  }
} finally {
  await client.end()
}

// Tries each consumer's checkpoint in a scratch org, as this superuser (who may use every role, so
// only the binding can refuse), in one transaction it rolls back: nothing it writes stays.
async function probeBindings(): Promise<BindingProbe[]> {
  const probes: BindingProbe[] = []
  await client.query('begin')
  try {
    const org = (
      await client.query<{ id: string }>(`insert into public.orgs (name) values ('check-catalogues') returning id`)
    ).rows[0]?.id
    const accepted = async (consumer: string, role: string): Promise<boolean> => {
      await client.query('savepoint probe')
      try {
        await client.query('insert into public.outbox_checkpoints (org_id, consumer, role_name) values ($1, $2, $3)', [
          org,
          consumer,
          role,
        ])
        return true
      } catch (error) {
        if ((error as { code?: unknown }).code === '42501') return false
        throw error
      } finally {
        await client.query('rollback to savepoint probe')
      }
    }
    for (const { name, role } of consumers) {
      const other = JOB_ROLES.find(r => r !== role) ?? 'hearth_queue'
      probes.push({
        consumer: name,
        otherRefused: !(await accepted(name, other)),
        ownAccepted: await accepted(name, role),
      })
    }
  } finally {
    await client.query('rollback')
  }
  return probes
}

// Every org's register rows, as this superuser (who skips row level security), with one more org
// made in the same transaction, which it rolls back: its rows come from orgs_add_registers(), so a
// new org is checked too, whatever orgs the database already holds.
async function readOrgRegisters(): Promise<OrgRegisters[]> {
  await client.query('begin')
  try {
    await client.query(`insert into public.orgs (name) values ('check-catalogues registers')`)
    const purposes = (
      await client.query<PurposeDefault & { org: string }>(`
        select org_id::text as org, purpose, ai, pinned, needs_switch, status
        from public.processing_register where version = 1`)
    ).rows
    const providers = (
      await client.query<ProviderDefault & { org: string }>(
        'select org_id::text as org, provider, ai from public.transfer_register',
      )
    ).rows
    const drifted = (
      await client.query<{ org: string; purpose: string; version: number }>(`
        select r.org_id::text as org, r.purpose, r.version from public.processing_register r
        join public.processing_register f on f.org_id = r.org_id and f.purpose = r.purpose and f.version = 1
        where r.version > 1 and (r.ai, r.pinned, r.needs_switch) is distinct from (f.ai, f.pinned, f.needs_switch)`)
    ).rows
    const ids = (await client.query<{ id: string }>('select id::text as id from public.orgs order by id')).rows
    return ids.map(({ id }) => ({
      org: id,
      purposes: purposes.filter(row => row.org === id).map(({ org: _, ...row }) => row),
      providers: providers.filter(row => row.org === id).map(({ org: _, ...row }) => row),
      drifted: drifted.filter(row => row.org === id).map(({ org: _, ...row }) => row),
    }))
  } finally {
    await client.query('rollback')
  }
}

// Check 7f's periods and 7g's resolvers, as this superuser, in one transaction it rolls back, with a
// scratch org (whose rows come from the triggers on orgs): retention_period_days() for every days
// class; lifecycle_persons_of() and lifecycle_containers_of() for every kind, each with a random id;
// lifecycle_lock_target() for a person, a case, every container kind those returned and every hold
// target kind lifecycle_kinds() knows; and lifecycle_row_anchors() for every holds-apply table, over a
// row of that table with a random id (jsonb_populate_record). Each call has a savepoint of its own,
// so one that raises is recorded and the rest still run.
async function probeLifecycle(
  dayClasses: readonly string[],
  kinds: readonly string[],
  applyTables: readonly string[],
): Promise<{ periods: Record<string, number | null>; probes: ResolverProbe[] }> {
  const periods: Record<string, number | null> = {}
  const probes: ResolverProbe[] = []
  await client.query('begin')
  try {
    const org = (
      await client.query<{ id: string }>(
        `insert into public.orgs (name) values ('check-catalogues lifecycle') returning id`,
      )
    ).rows[0]?.id
    const attempt = async <T extends object>(sql: string, values: unknown[]): Promise<T[] | string> => {
      await client.query('savepoint probe')
      try {
        return (await client.query<T>(sql, values)).rows
      } catch (error) {
        const { code, message } = error as { code?: unknown; message?: unknown }
        return `${String(code)} (${String(message)})`
      } finally {
        await client.query('rollback to savepoint probe')
      }
    }
    for (const key of dayClasses) {
      const rows = await attempt<{ days: number }>('select public.retention_period_days($1, $2) as days', [org, key])
      periods[key] = typeof rows === 'string' ? null : (rows[0]?.days ?? null)
    }
    const containerKinds = new Set<string>()
    for (const kind of kinds) {
      const persons = await attempt('select public.lifecycle_persons_of($1, $2, gen_random_uuid()) as persons', [
        org,
        kind,
      ])
      probes.push({
        call: `lifecycle_persons_of(org, '${kind}', <random id>)`,
        ...(typeof persons === 'string' ? { error: persons } : {}),
      })
      const containers = await attempt<{ kind: string }>(
        'select container_kind as kind from public.lifecycle_containers_of($1, $2, gen_random_uuid())',
        [org, kind],
      )
      probes.push({
        call: `lifecycle_containers_of(org, '${kind}', <random id>)`,
        ...(typeof containers === 'string' ? { error: containers } : {}),
      })
      if (typeof containers !== 'string') for (const row of containers) containerKinds.add(row.kind)
    }
    const lockKinds = new Set(['person', 'case', ...containerKinds])
    for (const kind of HOLD_TARGET_KINDS) if (kinds.includes(kind)) lockKinds.add(kind)
    for (const kind of lockKinds) {
      const locked = await attempt("select public.lifecycle_lock_target($1, $2, gen_random_uuid(), 'share')", [
        org,
        kind,
      ])
      probes.push({
        call: `lifecycle_lock_target(org, '${kind}', <random id>, 'share')`,
        ...(typeof locked === 'string' ? { error: locked } : {}),
      })
    }
    for (const table of [...new Set(applyTables)].sort()) {
      // A random id of the id column's own type, if the table has one.
      const idType = (
        await client.query<{ type: string }>(
          `select format_type(a.atttypid, a.atttypmod) as type from pg_attribute a
           where a.attrelid = to_regclass('public.' || quote_ident($1)) and a.attname = 'id' and not a.attisdropped`,
          [table],
        )
      ).rows[0]?.type
      const id =
        idType === 'uuid'
          ? randomUUID()
          : idType === 'bigint' || idType === 'integer'
            ? String(1 + Math.floor(Math.random() * 1_000_000_000))
            : null
      const anchors = await attempt<{ n: number }>(
        `select count(*)::int as n from public.lifecycle_row_anchors($1, $2,
           to_jsonb(jsonb_populate_record(null::public.${client.escapeIdentifier(table)}, jsonb_build_object('id', $3::text))))`,
        [org, table, id],
      )
      probes.push({
        call: `lifecycle_row_anchors(org, '${table}', <a row with a random id>)`,
        wantRows: 1,
        ...(typeof anchors === 'string' ? { error: anchors } : { rows: anchors[0]?.n ?? 0 }),
      })
    }
  } finally {
    await client.query('rollback')
  }
  return { periods, probes }
}
