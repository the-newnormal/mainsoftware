// What the Owner bootstrap script sends to Postgres, statement by statement (TECH-SPEC T22 items 63
// to 71; design sections 4 to 6): the set-up (T22 items 16, 20 and 37; BSC-02), Twilio Verify's
// break-glass re-clear (T22 item 44, C0.9 OD-20; BSC-04, BSC-05) and the founder's number before
// their first sign-in (PD-129). The only file that names bootstrap_transfer_clearance,
// hearth.break_glass, twilio_reclear or hearth.owner_bootstrap (BSG-04).
//
// Every statement is a constant below, and every value travels as a bound parameter (BSG-05). Each
// mode runs one READ COMMITTED transaction on one connection whose start-up options already bound
// it (owner-bootstrap.ts: role hearth_owner, a 30 s transaction_timeout, a 2 s lock_timeout and a
// 5 s idle_in_transaction_session_timeout), and is a plan unless the person gave --commit: the
// whole transaction runs, every check and write included, and rolls back. A refusal rolls back and
// throws Refused; nothing is ever half-written.
//
// The set-up and the correction set the emergency marker to '' as their transaction's first act,
// so no role or database default can turn their clearance into a re-clear (PD-125, BSS-16); only
// recover() sets it to twilio_reclear, and bootstrap_transfer_clearance() reads it in that
// transaction alone (0011).
import { FLAGS, maskNumber, type NoticeTransferFact, PROVIDERS, PURPOSE_KEYS, type TransferFacts } from '@hearth/shared'
import { z } from 'zod'
import type { CorrectNumberDocument, DeployEnv, Mode, RecoverDocument, SetUpDocument } from './input.ts'
import { isRemote } from './input.ts'
import {
  type CommittingLine,
  type Line,
  NotStarted,
  Refused,
  SEND_STATES,
  TRANSFER_FACT_KEYS,
  type TransferFactKey,
  type VerificationFailure,
} from './output.ts'
import {
  LOG_SETTINGS,
  markerOf,
  migrationProblems,
  type ServerFacts,
  ServerFactsRow,
  serverProblems,
} from './target.ts'

// The lock Kysely's migrator holds for its whole run (kysely 0.29.6, postgres-adapter.js: a
// session-level pg_advisory_lock on its LOCK_ID, this number), which conflicts with a
// transaction-level lock on the same key. The set-up and the correction take it too, so a deploy's
// migration can't commit in the middle of one (PD-124); BSU-12 pins it to the installed Kysely. It
// is passed as a parameter, written with separators so no long run of digits appears (BSG-01).
export const KYSELY_MIGRATION_LOCK = 3_853_314_791_062_309_107n

export const SQL = {
  begin: 'begin isolation level read committed read write',
  rollback: 'rollback',
  commit: 'commit',

  // S2, R2, C2: the lock bound and the emergency marker ($1: '' or twilio_reclear) first, both
  // transaction-local, then what the server says about itself, for target.ts to compare with what
  // the person said and what the checkout holds. $2 names the log settings to read (none under
  // local and test). A database with no kysely_migration table fails here with 42P01.
  prologue: `select pg_catalog.set_config('lock_timeout', '2s', true) as lock_bound,
       pg_catalog.set_config('hearth.break_glass', $1, true) as marker_set,
       pg_catalog.current_setting('transaction_isolation') as isolation,
       current_user::text as acting,
       l.rolname::text as login,
       l.rolinherit as login_inherits,
       l.rolsuper as login_superuser,
       l.rolbypassrls as login_bypassrls,
       l.rolcreaterole as login_createrole,
       l.rolcreatedb as login_createdb,
       exists (select 1 from pg_catalog.pg_class c where c.relowner = l.oid) as login_owns,
       coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role', g.rolname, 'set', m.set_option,
                                                                     'inherit', m.inherit_option,
                                                                     'admin', m.admin_option) order by g.rolname)
                 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles g on g.oid = m.roleid
                 where m.member = l.oid), '[]'::jsonb) as memberships,
       pg_catalog.current_database()::text as database,
       (select pg_catalog.shobj_description(d.oid, 'pg_database') from pg_catalog.pg_database d
        where d.datname = pg_catalog.current_database()) as marker,
       exists (select 1 from pg_catalog.pg_roles r where r.rolname = 'rds_superuser') as rds,
       coalesce((select s.ssl from pg_catalog.pg_stat_ssl s where s.pid = pg_catalog.pg_backend_pid()), false) as tls,
       array(select k.name::text from public.kysely_migration k order by k.name) as migrations,
       pg_catalog.to_regprocedure('public.bootstrap_transfer_clearance(text, uuid, text, text, text[], text[], text, text, text, date, boolean, text, text, text, text, text, date, text)') is not null as has_function,
       pg_catalog.to_regclass('public.orgs') is not null as has_orgs,
       coalesce((select c.relforcerowsecurity from pg_catalog.pg_class c
                 where c.oid = pg_catalog.to_regclass('public.orgs')), false) as orgs_forced,
       pg_catalog.current_setting('transaction_timeout') as transaction_timeout,
       pg_catalog.current_setting('lock_timeout') as lock_timeout,
       pg_catalog.current_setting('idle_in_transaction_session_timeout') as idle_timeout,
       (select coalesce(pg_catalog.jsonb_object_agg(s.name, s.setting), '{}'::jsonb) from pg_catalog.pg_settings s
        where s.name = any ($2::text[])) as logs
from pg_catalog.pg_roles l
where l.rolname = session_user`,

  // S3, C3: the bootstrap's own lock, then the migrator's ($1), alone in their statement and held to
  // the transaction's end, before any row. Two set-ups, or a set-up and a correction, take turns,
  // and so does either with a deploy's migration. Each waits at most the 2 s lock bound (55P03).
  locks: `select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hearth.owner_bootstrap', 0)),
       pg_catalog.pg_advisory_xact_lock($1::bigint)`,

  // S4: in a statement of its own, so under READ COMMITTED its snapshot is taken after S3 returned
  // and sees an org a competing run committed while this one waited, and the ledger again, now that
  // no migration can run. The owner skips row level security on orgs (it owns it, and S2 checked it
  // isn't forced), so this reads across orgs: org ids only, a named exception to ACC-11.
  existing: `select (select o.id::text from public.orgs o order by o.created_at, o.id limit 1) as org,
       array(select k.name::text from public.kysely_migration k order by k.name) as migrations`,

  // S5: the org, whose triggers give it every flag at its default (0007) and its registers (0009,
  // with 0012's defaults).
  insertOrg: 'insert into public.orgs (id, name) values ($1, $2)',
  // S6: Hearth, which every created_by below names and withOrg({ system: true }) will find.
  insertHearth: `insert into public.principals (id, org_id, kind, system_key) values ($1, $2, 'system', 'hearth')`,
  // S7, R5, C6: acting as the org's Hearth principal, as withOrg() sets it (T22 item 20).
  actAsHearth: `select pg_catalog.set_config('app.org_id', $1, true), pg_catalog.set_config('app.user_id', $2, true)`,
  // S8: the founder's principal, whose id is also their person's (and later their account's).
  insertHuman: `insert into public.principals (id, org_id, kind) values ($1, $2, 'human')`,
  // S9: the founder, with no department or manager.
  insertPerson: 'insert into public.people (id, org_id, full_name, created_by) values ($1, $2, $3, $4)',
  // S10, C10: a current number.
  insertNumber:
    'insert into public.phone_numbers (id, org_id, person_id, e164, created_by) values ($1, $2, $3, $4, $5)',
  // S11: Owner and DPO, granted by Hearth with no second approver, as 0002 allows for the bootstrap's
  // first Owner and DPO (D35).
  insertRoles: `insert into public.role_assignments (org_id, person_id, role, created_by)
values ($1, $2, 'owner', $3), ($1, $2, 'dpo', $3)`,
  // S12: the set-up's own audit row: Hearth the actor, the founder the target, ids only (PD-126).
  auditSetUp: `insert into public.audit_events (org_id, actor_id, action, target_type, target_id, reason, details)
values ($1, $2, 'bootstrap.set_up', 'person', $3, $4, $5::jsonb)`,
  // S13, S14: 0009's set-up path through 0011's function, the facts in its order.
  clear: `select public.bootstrap_transfer_clearance($1, $2::uuid, $3, $4, $5::text[], $6::text[], $7, $8, $9, $10::date,
         $11::boolean, $12, $13, $14, $15, $16, $17::date, $18) as id`,
  // S15: what the triggers and the function made, before COMMIT. A plain org-scoped read of the
  // number, not person_by_phone() (a pre-org sign-in lookup): S4 already proved no other org exists.
  // transfer_send_state() in a transaction that decides no send is a named exception (PD-128).
  verifySetUp: `select (select pg_catalog.count(*)::int from public.feature_flags f where f.org_id = $1) as flags,
       (select pg_catalog.count(distinct r.purpose)::int from public.processing_register r where r.org_id = $1) as purposes,
       (select pg_catalog.count(*)::int from public.transfer_register t where t.org_id = $1) as providers,
       (select pg_catalog.count(*)::int from public.principals p
        where p.org_id = $1 and p.kind = 'system' and p.system_key = 'hearth') as hearth,
       array(select n.person_id::text from public.phone_numbers n
             where n.org_id = $1 and n.e164 = $2 and n.removed_at is null) as holders,
       (select pg_catalog.count(*)::int from public.notice_versions v where v.org_id = $1) as notices,
       (select pg_catalog.count(*)::int from public.dpo_settings s where s.org_id = $1) as contacts,
       public.transfer_send_state('twilio') as state`,

  // R3: exactly one org (D1), and its zone for the printed times: ids and zones only, the second
  // named exception to ACC-11.
  orgs: 'select o.id::text as id, o.time_zone from public.orgs o order by o.id limit 2',
  // R4, C5: the org's Hearth principal.
  hearth: `select p.id::text as id from public.principals p
where p.org_id = $1 and p.kind = 'system' and p.system_key = 'hearth'`,
  // R6: plain reads, before the function: the DPOs signed in (item 44 check 7's predicate, word for
  // word from 0011, so the count means what the function will decide) and when the last of those
  // sessions ends; Twilio Verify's open clearance, else when its last one ended; and how far ahead
  // the review date is in the org's zone ($3). Counts, clearance ids, days and an instant.
  twilioNow: `with dpos as (
  select pg_catalog.count(distinct s.user_id)::int as signed_in, pg_catalog.max(s.expires_at) as last_ends
  from public.sessions s
  join public.devices d on d.org_id = s.org_id and d.user_id = s.user_id and d.id = s.device_id
  where s.org_id = $1 and s.revoked_at is null and s.expires_at > pg_catalog.now() and d.signed_out_at is null
    and s.user_id in (select r.person_id from public.role_assignments r
                      join public.people p on p.org_id = r.org_id and p.id = r.person_id
                      where r.org_id = $1 and r.role = 'dpo' and r.revoked_at is null and p.deactivated_at is null)
), open as (
  select c.id::text as id, c.cleared_via, ((c.cleared_at at time zone $3::text)::date)::text as cleared_on
  from public.transfer_clearances c
  where c.org_id = $1 and c.provider = 'twilio' and c.withdrawn_at is null
  order by c.cleared_at desc
  limit 1
), ended as (
  select ((pg_catalog.max(c.withdrawn_at) at time zone $3::text)::date)::text as since
  from public.transfer_clearances c
  where c.org_id = $1 and c.provider = 'twilio'
)
select d.signed_in, d.last_ends, o.id as open_id, o.cleared_via as open_via, o.cleared_on as open_on,
       e.since as withdrawn_since, ($2::date - (pg_catalog.now() at time zone $3::text)::date) as days_ahead
from dpos d cross join ended e left join open o on true`,
  // R7: the re-clear in one statement ($1 the org, $2 the named DPO, $3 the review date, $4 the
  // fromEntry keys, $5 the reason). It reads the facts snapshot of the Twilio clearance the latest
  // version links, else the last ended one's, overlays the DPO's record (the entry) only for the
  // named stated facts and only through notice_facts(), and maps every fact to the function's 18
  // arguments inside Postgres, so no fact is parsed, mapped or printed by the process (PD-127). The
  // review date is always $3. It also returns the entry's facts as they stood before the call, as
  // opaque text for R8; an outer query never sees what a function it calls writes. With no snapshot
  // at all, f is null and the function refuses in its own words before it reads a fact.
  reclear: `with latest as (
  select v.id, v.version from public.notice_versions v where v.org_id = $1 order by v.version desc limit 1
), linked as (
  select c.id, c.facts, 1 as rank, lv.version
  from latest lv
  join public.notice_version_providers l on l.org_id = $1 and l.notice_version_id = lv.id
  join public.transfer_clearances c on c.org_id = l.org_id and c.id = l.clearance_id and c.provider = 'twilio'
), ended as (
  select c.id, c.facts, 2 as rank, null::integer as version
  from public.transfer_clearances c
  where c.org_id = $1 and c.provider = 'twilio' and c.withdrawn_at is not null
  order by c.cleared_at desc
  limit 1
), source as (
  select * from (select * from linked union all select * from ended) s order by s.rank limit 1
), recorded as (
  select public.notice_facts(public.transfer_register_facts(t)) as facts
  from public.transfer_register t where t.org_id = $1 and t.provider = 'twilio'
), before as (
  select public.transfer_register_facts(t)::text as facts
  from public.transfer_register t where t.org_id = $1 and t.provider = 'twilio'
), given as (
  select s.id as source_clearance, s.version as source_version,
         s.facts || coalesce((select pg_catalog.jsonb_object_agg(e.key, e.value)
                              from recorded r, pg_catalog.jsonb_each(r.facts) e
                              where e.key = any ($4::text[])), '{}'::jsonb) as f
  from (select 1) one left join source s on true
)
select public.bootstrap_transfer_clearance('twilio', $2::uuid, f ->> 'services', f ->> 'data_types',
         array(select pg_catalog.jsonb_array_elements_text(f -> 'processing_countries')),
         array(select pg_catalog.jsonb_array_elements_text(f -> 'storage_countries')),
         f ->> 'countries_confirmed', f ->> 'safeguard', f ->> 'safeguard_reference',
         (f ->> 'certificate_verified_on')::date, (f ->> 'dpa_terms_confirmed')::boolean, f ->> 'training',
         f ->> 'zero_retention', f ->> 'provider_retention', f ->> 'retention_confirmed',
         f ->> 'onward_recipients', $3::date, $5)::text as clearance,
       source_clearance::text as source_clearance, source_version, (select b.facts from before b) as before_facts
from given`,
  // R8: what to print: the clearance, how it was made, its review date, the names (never the
  // values) of the facts that moved in the entry, compared before ($3, R7's opaque text) and after,
  // never read from audit_events, and the send state the commit would leave (PD-128).
  afterReclear: `select c.id::text as id, c.cleared_via, t.review_on::text as review_on,
       array(select b.key from pg_catalog.jsonb_each($3::jsonb) b
             where (public.transfer_register_facts(t) -> b.key) is distinct from b.value order by b.key) as changed,
       public.transfer_send_state('twilio') as state
from public.transfer_clearances c
join public.transfer_register t on t.org_id = c.org_id and t.id = c.entry_id
where c.org_id = $1 and c.id = $2`,

  // C4: the orgs (ids only, at most two) and the ledger again, under the locks.
  orgsAndLedger: `select array(select o.id::text from public.orgs o order by o.id limit 2) as orgs,
       array(select k.name::text from public.kysely_migration k order by k.name) as migrations`,
  // C7: the roster, people who have left included, the founder's row held as CLAUDE.md asks of
  // anything that may end a person's access: a sign-in step holding it FOR SHARE finishes first and
  // is then seen; one that starts later waits for this.
  roster: 'select p.id::text as id from public.people p where p.org_id = $1 for no key update',
  // C8: plain reads, once that row is held ($2 the founder, $3 Hearth, $4 the new number): their
  // current Owner and DPO rows by Hearth, whether they have an account (so have ever signed in),
  // whether a notice is published, their current number's row, and whether it is already the new
  // one, compared in Postgres, so the current number never reaches the process.
  founder: `select (select pg_catalog.count(*)::int from public.role_assignments r
        where r.org_id = $1 and r.person_id = $2 and r.revoked_at is null and r.role in ('owner', 'dpo')
          and r.created_by = $3 and r.team_id is null) as founder_roles,
       exists (select 1 from public.users u where u.org_id = $1 and u.id = $2) as signed_in,
       exists (select 1 from public.notice_versions v where v.org_id = $1) as published,
       (select n.id::text from public.phone_numbers n
        where n.org_id = $1 and n.person_id = $2 and n.removed_at is null) as number_id,
       exists (select 1 from public.phone_numbers n
               where n.org_id = $1 and n.person_id = $2 and n.removed_at is null and n.e164 = $4) as same`,
  // C9: the old number removed, never overwritten (0002).
  removeNumber:
    'update public.phone_numbers set removed_at = pg_catalog.now(), removed_by = $3 where org_id = $1 and id = $2',
  // C11: the correction's audit row, phone ids only.
  auditCorrection: `insert into public.audit_events (org_id, actor_id, action, target_type, target_id, reason, details)
values ($1, $2, 'bootstrap.correct_number', 'person', $3, $4, $5::jsonb)`,
  // C12: the new number current for the founder alone ($2), and the old one ($3, its row) current
  // for nobody, compared in Postgres.
  verifyCorrection: `select array(select n.person_id::text from public.phone_numbers n
             where n.org_id = $1 and n.e164 = $2 and n.removed_at is null) as holders,
       (select pg_catalog.count(*)::int from public.phone_numbers o
        join public.phone_numbers n on n.org_id = o.org_id and n.e164 = o.e164 and n.removed_at is null
        where o.org_id = $1 and o.id = $3) as old_current`,
} as const

// A connection the steps run on: a pg Client, or a test's fake.
export interface Queryable {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: readonly unknown[] }>
}

export interface StepContext {
  db: Queryable
  commit: boolean
  env: DeployEnv
  database: string
  // The checkout's migrations (target.ts, checkoutMigrations()).
  checkout: readonly string[]
  say(line: Line): void
  // Prints the committing line and marks the run as committing, just before COMMIT is sent: from
  // then a lost connection or a stop may or may not have committed (exit 4).
  committing(line: CommittingLine): void
}

// The ids the set-up mints before connecting: the org, its Hearth principal, the founder (person
// and human principal share it) and their number's row.
export interface SetUpIds {
  org: string
  hearth: string
  founder: string
  number: string
}

const codeOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : undefined
}

// Exactly one row, as its schema reads it.
function one<T>(result: { rows: readonly unknown[] }, schema: z.ZodType<T>): T {
  if (result.rows.length !== 1) throw new Error(`expected one row, got ${result.rows.length}`)
  return schema.parse(result.rows[0])
}

// S1, R1, C1. Explicit, so no session or role default changes the level. A failure here means the
// run never started (a read-only server answers with 25006 or 0A000).
async function begin(db: Queryable): Promise<void> {
  try {
    await db.query(SQL.begin)
  } catch (error) {
    throw new NotStarted(error)
  }
}

// After a refusal or a failure. A connection that is gone rolls back on the server by itself.
async function rollbackQuietly(db: Queryable): Promise<void> {
  try {
    await db.query(SQL.rollback)
  } catch {
    // Nothing to do: the server rolls back a transaction whose connection ended.
  }
}

const PRINTABLE_MIGRATION = /^[0-9A-Za-z_.-]{1,100}$/

// S2, R2, C2, then the target line and the checks of section 3. A problem rolls back and exits 2;
// the recovery mode prints log findings as a warning and goes on.
async function prologue(
  ctx: StepContext,
  mode: Mode,
  marker: '' | 'twilio_reclear',
  inputEnv: DeployEnv,
): Promise<ServerFacts> {
  let result: { rows: readonly unknown[] }
  try {
    result = await ctx.db.query(SQL.prologue, [marker, isRemote(ctx.env) ? [...LOG_SETTINGS] : []])
  } catch (error) {
    // The only table S2 names outside pg_catalog is the migrator's ledger.
    if (codeOf(error) === '42P01') throw new Refused({ kind: 'target', problems: [{ code: 'no_ledger' }] })
    throw error
  }
  const facts = one(result, ServerFactsRow)
  const newest = facts.migrations.at(-1)
  ctx.say({
    kind: 'target',
    mode,
    commit: ctx.commit,
    database: ctx.database,
    env: ctx.env,
    inputEnv,
    marker: markerOf(facts.marker),
    migrations: facts.migrations.length,
    newest: newest !== undefined && PRINTABLE_MIGRATION.test(newest) ? newest : null,
    bounds: { transaction: facts.transaction_timeout, lock: facts.lock_timeout, idle: facts.idle_timeout },
  })
  const { problems, logWarnings } = serverProblems(facts, { env: ctx.env, database: ctx.database, mode })
  problems.push(...migrationProblems(facts.migrations, ctx.checkout))
  if (problems.length > 0) throw new Refused({ kind: 'target', problems })
  if (logWarnings.length > 0) ctx.say({ kind: 'log_warning', settings: logWarnings })
  return facts
}

// S3, C3.
async function lock(db: Queryable): Promise<void> {
  await db.query(SQL.locks, [KYSELY_MIGRATION_LOCK.toString()])
}

// R4, C5: the org's one Hearth principal.
async function hearthOf(db: Queryable, org: string): Promise<string> {
  const rows = (await db.query(SQL.hearth, [org])).rows
  if (rows.length !== 1) throw new Refused({ kind: 'no_hearth' })
  return z.object({ id: z.string() }).parse(rows[0]).id
}

// A provider's parsed facts as the function's 18 arguments, field by field in its order (0011), as
// the harness's bootstrapClearance() maps them.
export function clearanceValues(
  provider: 'twilio' | 'aws',
  dpo: string,
  facts: TransferFacts,
  reason: string,
): unknown[] {
  return [
    provider,
    dpo,
    facts.services,
    facts.dataTypes,
    [...facts.processingCountries],
    [...facts.storageCountries],
    facts.countriesConfirmed,
    facts.safeguard,
    facts.safeguardReference,
    facts.certificateVerifiedOn,
    facts.dpaTermsConfirmed,
    facts.training,
    facts.zeroRetention,
    facts.providerRetention,
    facts.retentionConfirmed,
    facts.onwardRecipients,
    facts.reviewOn,
    reason,
  ]
}

const IdRow = z.object({ id: z.string() })
const SendState = z.enum(SEND_STATES)
const ExistingRow = z.object({ org: z.string().nullable(), migrations: z.array(z.string()) })
const VerifySetUpRow = z.object({
  flags: z.number(),
  purposes: z.number(),
  providers: z.number(),
  hearth: z.number(),
  holders: z.array(z.string()),
  notices: z.number(),
  contacts: z.number(),
  state: SendState,
})

// The set-up (section 4): the org, Hearth, the first Owner and DPO with their number, one audit row
// of its own, and both clearances, in one transaction, once. No notice, no contact, no event of its
// own (PD-126).
export async function setUp(ctx: StepContext, doc: SetUpDocument, ids: SetUpIds): Promise<void> {
  const { db } = ctx
  let twilio: string
  let aws: string
  await begin(db)
  try {
    await prologue(ctx, 'set-up', '', doc.environment)
    await lock(db)
    const existing = one(await db.query(SQL.existing), ExistingRow)
    const late = migrationProblems(existing.migrations, ctx.checkout)
    if (late.length > 0) throw new Refused({ kind: 'target', problems: late })
    if (existing.org !== null) throw new Refused({ kind: 'org_exists', org: existing.org })
    await db.query(SQL.insertOrg, [ids.org, doc.organisation])
    await db.query(SQL.insertHearth, [ids.hearth, ids.org])
    await db.query(SQL.actAsHearth, [ids.org, ids.hearth])
    await db.query(SQL.insertHuman, [ids.founder, ids.org])
    await db.query(SQL.insertPerson, [ids.founder, ids.org, doc.founder.fullName, ids.hearth])
    await db.query(SQL.insertNumber, [ids.number, ids.org, ids.founder, doc.founder.e164, ids.hearth])
    await db.query(SQL.insertRoles, [ids.org, ids.founder, ids.hearth])
    const details = { by: 'bootstrap', roles: ['owner', 'dpo'], hearth: ids.hearth, number: ids.number }
    await db.query(SQL.auditSetUp, [ids.org, ids.hearth, ids.founder, doc.reason, JSON.stringify(details)])
    twilio = one(await db.query(SQL.clear, clearanceValues('twilio', ids.founder, doc.twilio, doc.reason)), IdRow).id
    aws = one(await db.query(SQL.clear, clearanceValues('aws', ids.founder, doc.aws, doc.reason)), IdRow).id
    const made = one(await db.query(SQL.verifySetUp, [ids.org, doc.founder.e164]), VerifySetUpRow)
    const failures: VerificationFailure[] = []
    if (made.flags !== Object.keys(FLAGS).length) failures.push('flags')
    if (made.purposes !== PURPOSE_KEYS.length) failures.push('purposes')
    if (made.providers !== PROVIDERS.length) failures.push('providers')
    if (made.hearth !== 1) failures.push('hearth')
    if (made.holders.length !== 1 || made.holders[0] !== ids.founder) failures.push('number')
    if (made.notices !== 0) failures.push('notice')
    if (made.contacts !== 0) failures.push('contact')
    if (made.state !== 'no_notice') failures.push('send_state')
    if (failures.length > 0) throw new Refused({ kind: 'verification', failures })
    if (!ctx.commit) {
      ctx.say({ kind: 'organisation', name: doc.organisation })
      ctx.say({ kind: 'founder_name', name: doc.founder.fullName })
      ctx.say({ kind: 'number', masked: maskNumber(doc.founder.e164) })
      ctx.say({ kind: 'reviews', twilio: doc.twilio.reviewOn ?? '', aws: doc.aws.reviewOn ?? '' })
      ctx.say({ kind: 'send_state', state: made.state, committed: false })
      await db.query(SQL.rollback)
      ctx.say({ kind: 'kept_nothing' })
      return
    }
    ctx.committing({ kind: 'committing', mode: 'set-up', org: ids.org })
    await db.query(SQL.commit)
  } catch (error) {
    await rollbackQuietly(db)
    throw error
  }
  ctx.say({
    kind: 'committed',
    mode: 'set-up',
    org: ids.org,
    hearth: ids.hearth,
    founder: ids.founder,
    twilio: { clearance: twilio, reviewOn: doc.twilio.reviewOn ?? '' },
    aws: { clearance: aws, reviewOn: doc.aws.reviewOn ?? '' },
  })
  ctx.say({ kind: 'send_state', state: 'no_notice', committed: true })
  ctx.say({ kind: 'next' })
}

const OrgRow = z.object({ id: z.string(), time_zone: z.string() })
const TwilioNowRow = z.object({
  signed_in: z.number(),
  last_ends: z.date().nullable(),
  open_id: z.string().nullable(),
  open_via: z.enum(['app', 'bootstrap', 'break_glass']).nullable(),
  open_on: z.string().nullable(),
  withdrawn_since: z.string().nullable(),
  days_ahead: z.number(),
})
const ReclearRow = z.object({
  clearance: z.string(),
  source_clearance: z.string().nullable(),
  source_version: z.number().nullable(),
  before_facts: z.string(),
})
const AfterReclearRow = z.object({
  id: z.string(),
  cleared_via: z.string(),
  review_on: z.string(),
  changed: z.array(z.string()),
  state: SendState,
})

const isFactKey = (key: string): key is TransferFactKey => (TRANSFER_FACT_KEYS as readonly string[]).includes(key)

// Twilio Verify's break-glass re-clear (section 5; T22 item 44's contract): non-interactive, one
// transaction, acting as the org's Hearth principal, with the marker and the lock bound set at its
// start, from the facts the latest published version states (else the last ended clearance's), the
// person giving only the named DPO, the review date, the reason and which stated facts come from
// the DPO's record. bootstrap_transfer_clearance() decides every refusal in its own words. No
// advisory lock: item 44's own locks serialise two re-clears and a re-clear against the DPO's
// clear, and it creates no org a migration's backfill could miss (PD-124).
export async function recover(ctx: StepContext, doc: RecoverDocument): Promise<void> {
  const { db } = ctx
  // The emergency marker's value: set here alone (BSG-04).
  const reclearMarker = 'twilio_reclear'
  let after: z.infer<typeof AfterReclearRow>
  await begin(db)
  try {
    await prologue(ctx, 'recover', reclearMarker, doc.environment)
    const orgs = (await db.query(SQL.orgs)).rows.map(row => OrgRow.parse(row))
    const [only] = orgs
    if (only === undefined) throw new Refused({ kind: 'no_org' })
    if (orgs.length > 1) throw new Refused({ kind: 'two_orgs' })
    const hearth = await hearthOf(db, only.id)
    await db.query(SQL.actAsHearth, [only.id, hearth])
    const now = one(await db.query(SQL.twilioNow, [only.id, doc.reviewOn, only.time_zone]), TwilioNowRow)
    ctx.say({
      kind: 'inputs',
      dpo: doc.dpo,
      reviewOn: doc.reviewOn,
      daysAhead: now.days_ahead,
      zone: only.time_zone,
      fromEntry: doc.fromEntry,
      reasonLength: [...doc.reason].length,
    })
    ctx.say({ kind: 'dpo_sessions', count: now.signed_in, lastEnds: now.last_ends, zone: only.time_zone })
    if (now.open_id !== null && now.open_via !== null && now.open_on !== null) {
      ctx.say({ kind: 'twilio_now', clearance: now.open_id, via: now.open_via, on: now.open_on })
    } else if (now.withdrawn_since !== null) {
      ctx.say({ kind: 'twilio_now', since: now.withdrawn_since })
    } else {
      ctx.say({ kind: 'twilio_now', never: true })
    }
    const fromEntry: NoticeTransferFact[] = doc.fromEntry
    const recleared = one(
      await db.query(SQL.reclear, [only.id, doc.dpo, doc.reviewOn, fromEntry, doc.reason]),
      ReclearRow,
    )
    if (recleared.source_clearance !== null) {
      ctx.say({
        kind: 'facts_source',
        clearance: recleared.source_clearance,
        version: recleared.source_version,
        fromEntry,
      })
    }
    // before_facts crosses the process once, as opaque text: never parsed, logged or printed.
    after = one(
      await db.query(SQL.afterReclear, [only.id, recleared.clearance, recleared.before_facts]),
      AfterReclearRow,
    )
    ctx.say({ kind: 'changed', keys: after.changed.filter(isFactKey) })
    if (!ctx.commit) {
      ctx.say({ kind: 'send_state', state: after.state, committed: false })
      await db.query(SQL.rollback)
      ctx.say({ kind: 'kept_nothing' })
      return
    }
    ctx.committing({ kind: 'committing', mode: 'recover', clearance: recleared.clearance })
    await db.query(SQL.commit)
  } catch (error) {
    await rollbackQuietly(db)
    throw error
  }
  ctx.say({ kind: 'committed', mode: 'recover', clearance: after.id, reviewOn: after.review_on })
  ctx.say({ kind: 'send_state', state: after.state, committed: true })
}

const OrgsAndLedgerRow = z.object({ orgs: z.array(z.string()), migrations: z.array(z.string()) })
const FounderRow = z.object({
  founder_roles: z.number(),
  signed_in: z.boolean(),
  published: z.boolean(),
  number_id: z.string().nullable(),
  same: z.boolean(),
})
const VerifyCorrectionRow = z.object({ holders: z.array(z.string()), old_current: z.number() })

// The founder's number, replaced only while the database has one org whose one person is the
// founder (Owner and DPO by Hearth), who has never signed in, and no notice is published (section
// 6; PD-129). Under the same two locks as the set-up; the founder's row FOR NO KEY UPDATE; the old
// number removed by Hearth and the new one inserted; one audit row of phone ids; no event.
export async function correctNumber(ctx: StepContext, doc: CorrectNumberDocument, newNumberId: string): Promise<void> {
  const { db } = ctx
  await begin(db)
  try {
    await prologue(ctx, 'correct-number', '', doc.environment)
    await lock(db)
    const found = one(await db.query(SQL.orgsAndLedger), OrgsAndLedgerRow)
    const late = migrationProblems(found.migrations, ctx.checkout)
    if (late.length > 0) throw new Refused({ kind: 'target', problems: late })
    const [org] = found.orgs
    if (org === undefined) throw new Refused({ kind: 'no_org' })
    if (found.orgs.length > 1) throw new Refused({ kind: 'two_orgs' })
    const hearth = await hearthOf(db, org)
    await db.query(SQL.actAsHearth, [org, hearth])
    const roster = (await db.query(SQL.roster, [org])).rows.map(row => IdRow.parse(row).id)
    const [founder] = roster
    if (founder === undefined) throw new Refused({ kind: 'no_founder' })
    if (roster.length > 1) throw new Refused({ kind: 'roster' })
    const state = one(await db.query(SQL.founder, [org, founder, hearth, doc.e164]), FounderRow)
    if (state.founder_roles !== 2) throw new Refused({ kind: 'not_founder' })
    if (state.signed_in) throw new Refused({ kind: 'signed_in' })
    if (state.published) throw new Refused({ kind: 'published' })
    if (state.number_id === null) throw new Refused({ kind: 'no_number' })
    if (state.same) throw new Refused({ kind: 'already' })
    await db.query(SQL.removeNumber, [org, state.number_id, hearth])
    await db.query(SQL.insertNumber, [newNumberId, org, founder, doc.e164, hearth])
    const details = { by: 'bootstrap', from: state.number_id, to: newNumberId }
    await db.query(SQL.auditCorrection, [org, hearth, founder, doc.reason, JSON.stringify(details)])
    const made = one(await db.query(SQL.verifyCorrection, [org, doc.e164, state.number_id]), VerifyCorrectionRow)
    const failures: VerificationFailure[] = []
    if (made.holders.length !== 1 || made.holders[0] !== founder) failures.push('number')
    if (made.old_current !== 0) failures.push('old_number')
    if (failures.length > 0) throw new Refused({ kind: 'verification', failures })
    if (!ctx.commit) {
      ctx.say({ kind: 'number', masked: maskNumber(doc.e164) })
      await db.query(SQL.rollback)
      ctx.say({ kind: 'kept_nothing' })
      return
    }
    ctx.committing({ kind: 'committing', mode: 'correct-number' })
    await db.query(SQL.commit)
  } catch (error) {
    await rollbackQuietly(db)
    throw error
  }
  ctx.say({ kind: 'committed', mode: 'correct-number' })
}
