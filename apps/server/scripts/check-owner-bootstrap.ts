// Checks the first-Owner bootstrap script (scripts/owner-bootstrap.ts and scripts/owner-bootstrap/;
// CLAUDE.md, Database › Admin powers; TECH-SPEC T22 items 63 to 71, PD-133) end to end, as a person
// runs it: a child process (testing/owner-bootstrap.ts, runOwnerBootstrap()) with its input in the
// environment, connecting as a throwaway login of the bootstrap login's shape (LOGIN NOINHERIT, no
// power of its own, its one membership hearth_owner, granted with SET alone), against throwaway
// databases on this machine, with fictional values only. Nothing here imports the script's modules:
// the check sees only what the script prints, how it exits and what it leaves in the database.
//
//   node apps/server/scripts/check-owner-bootstrap.ts [BSS-02 BSR-01 …]
//
// With ids, only the cases whose names start with one of them run (each builds what it needs). CI's
// migrations job runs it whole after check-access-sql.ts and before db:types, with the job's PG*
// variables (the service's superuser); hearth_owner exists from scripts/check-migrations.sh, and is
// created here with that script's attributes when missing, for a run on the local stack.
//
// It refuses any host but this machine, a PGUSER that isn't a superuser and an RDS server, and it
// only ever creates, copies and drops databases named owner_bootstrap_<case>_check, so it never
// touches hearth, hearth_check or hearth_e2e. One template (owner_bootstrap_template_check) is built
// with production's migrator (migrate()) as the throwaway login and given the outbox sweep's write
// tracking (testing/writes.ts, installWriteTracking()) as the superuser; two more are copied from it
// and arranged (owner_bootstrap_setup_check: the set-up committed through the script;
// owner_bootstrap_published_check: then the DPO's bases, contact and v0, through the checked
// functions, the superuser acting as the founder), and each case copies the one it needs, so the
// job pays for one migration. The login, every database and any role a case made are dropped at the
// end (and on SIGTERM or SIGINT), and checked gone.
//
// digest() reads every public table's row count and an md5 of its rows (partitions through their
// parent, it_* left out), every sequence's last value, and every table's count of rows ever
// inserted, updated or deleted (pg_stat_user_tables, which counts a write that rolled back too, read
// once the script's backend has gone and flushed its counts): unchanged rows, sequences and counts
// prove a refusal came before the first write; unchanged rows with moved counts prove a rollback.
// Only audit_events and outbox_events have sequences, so the counts are what see a rolled-back
// insert into orgs (the mutation that moves S4 after S5).
//
//   BSS-01 to BSS-16  the script: plans, the set-up's rows and write set, refusals before and after
//                     connecting, bounds, the recovery mode's facts and refusals, its lock bound, the
//                     correction, no input in any output, a lost commit, a database default
//   BSR-01 to BSR-05  races between processes: two set-ups, a plan and a commit, a correction
//                     against a PIN step, a re-clear against a DPO's sign-in, a set-up against a
//                     deploy's migration
//
// Exits 1 if any case fails, and prints the script's output only for a failing case (ids, codes,
// days and counts, by the script's own design).
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import {
  EVENTS,
  type EventType,
  FLAGS,
  formatE164,
  maskNumber,
  NOTICE_GENERATOR,
  normalisePhone,
  PROVIDERS,
  PURPOSE_KEYS,
} from '@hearth/shared'
import { sql } from 'kysely'
import { Client, Pool } from 'pg'
import { holdsRoleNow } from '#src/access/world.ts'
import { noticeDraft } from '#src/compliance/notice.ts'
import { noticeStanding } from '#src/compliance/notice-standing.ts'
import { codeMaySend } from '#src/compliance/transfers.ts'
import { createDatabase, type Database, withOrg } from '#src/db/database.ts'
import { migrate } from '#src/db/migrations.ts'
import { personByPhone } from '#src/db/pre-org.ts'
import {
  BOOTSTRAP_APPLICATION,
  type BootstrapLogin,
  type BootstrapMode,
  type BootstrapRun,
  type BootstrapRunOptions,
  CORRECTED_E164,
  CORRECTED_NUMBER,
  CORRECTION_REASON,
  correctionDocument,
  daysAhead,
  FACT_TEXTS,
  FOUNDER_E164,
  FOUNDER_NAME,
  FOUNDER_NUMBER,
  makeBootstrapLogin,
  ORG_NAME,
  RECOVERY_REASON,
  REVIEW_DATES,
  recoverDocument,
  runOwnerBootstrap,
  SET_UP_REASON,
  setUpDocument,
} from '#src/testing/owner-bootstrap.ts'
import { installWriteTracking } from '#src/testing/writes.ts'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const host = process.env.PGHOST ?? '127.0.0.1'
const connection = {
  host,
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'postgres',
}

// The id of the lock Kysely's migrator holds for its whole run (kysely 0.29.6, postgres-adapter.js's
// LOCK_ID), which the set-up takes too (S3; BSU-12 pins it to the installed Kysely).
const KYSELY_LOCK = '3853314791062309107'
const ZONE = 'Asia/Singapore'
const PREFIX = 'owner-bootstrap: '

// Every database this check makes is named owner_bootstrap_<case>_check, short enough that Postgres
// keeps the whole name, and nothing else is ever created, copied or dropped.
const DB_NAME = /^owner_bootstrap_[a-z0-9_]+_check$/
function dbName(name: string): string {
  const db = `owner_bootstrap_${name}_check`
  if (!DB_NAME.test(db) || db.length > 63) throw new Error(`not a check database's name: ${db}`)
  return db
}
const TEMPLATE = dbName('template')
const SET_UP = dbName('setup')
const PUBLISHED = dbName('published')

// --- State, and its clean-up --------------------------------------------------------------------

let login: BootstrapLogin | undefined
// Every database made, and every role a case made (its drop), for the clean-up.
const made = new Set<string>()
const roleDrops = new Map<string, () => Promise<void>>()
// Every run of the script, by case, for BSS-14's sweep and a failing case's output.
const runs: { name: string; run: BootstrapRun }[] = []
let currentCase = ''

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function expect(ok: boolean, what: string): void {
  if (!ok) throw new Error(what)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// JSON with every object's keys sorted, so two values compare whatever order jsonb gave the keys.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
const sameJson = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b)

async function admin<T>(database: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ ...connection, database })
  client.on('error', () => {})
  await client.connect()
  try {
    return await work(client)
  } finally {
    await client.end()
  }
}

async function connect(database: string, as: { user: string; password: string } = connection): Promise<Client> {
  const client = new Client({ ...connection, ...as, database })
  client.on('error', () => {})
  await client.connect()
  return client
}

function url(database: string, as: { user: string; password: string }): string {
  const result = new URL(`postgres://${connection.host.includes(':') ? `[${connection.host}]` : connection.host}`)
  result.port = String(connection.port)
  result.username = as.user
  result.password = as.password
  result.pathname = `/${database}`
  return result.toString()
}

async function dropDatabase(db: string): Promise<void> {
  if (!DB_NAME.test(db)) throw new Error(`refusing to drop ${db}`)
  await admin('postgres', client => client.query(`drop database if exists ${db} with (force)`))
  made.delete(db)
}

// A copy of a template (or of another arranged database), as hearth_owner's, so a case pays for
// no migration. A template's last backend can take a moment to go, so a busy source is retried.
async function copy(name: string, from = TEMPLATE): Promise<string> {
  const db = dbName(name)
  await dropDatabase(db)
  for (let tries = 0; ; tries += 1) {
    try {
      await admin('postgres', client => client.query(`create database ${db} template ${from} owner hearth_owner`))
      made.add(db)
      return db
    } catch (error) {
      if (tries >= 50 || !/being accessed by other users/.test(message(error))) throw error
      await sleep(100)
    }
  }
}

// A role a case makes (a login of another shape, a role it holds, rds_superuser), dropped with
// everything else.
async function makeRole(statements: string[], name: string): Promise<void> {
  await admin('postgres', async client => {
    for (const statement of statements) await client.query(statement)
  })
  roleDrops.set(name, () => admin('postgres', async client => void (await client.query(`drop role if exists ${name}`))))
}

async function dropRole(name: string): Promise<void> {
  await roleDrops.get(name)?.()
  roleDrops.delete(name)
}

let cleaning: Promise<string[]> | undefined
// Drops every database and role made, and the login; answers what it couldn't drop.
function cleanUp(): Promise<string[]> {
  cleaning ??= (async () => {
    const problems: string[] = []
    for (const db of [...made]) {
      await dropDatabase(db).catch(error => problems.push(`${db}: ${message(error)}`))
    }
    for (const name of [...roleDrops.keys()]) {
      await dropRole(name).catch(error => problems.push(`${name}: ${message(error)}`))
    }
    const user = login?.user
    if (user !== undefined) {
      await admin('postgres', client => client.query(`drop role if exists ${user}`)).catch(error =>
        problems.push(`the login: ${message(error)}`),
      )
    }
    return problems
  })()
  return cleaning
}

// --- Running the script -------------------------------------------------------------------------

type ScriptOptions = Omit<BootstrapRunOptions, 'database' | 'login' | 'host' | 'port'> & {
  login?: { user: string; password: string }
  port?: number
}

async function script(mode: BootstrapMode, db: string, o: ScriptOptions = {}): Promise<BootstrapRun> {
  if (login === undefined) throw new Error('no login yet')
  const run = await runOwnerBootstrap(mode, {
    ...o,
    database: db,
    login: o.login ?? login,
    host: connection.host,
    port: o.port ?? connection.port,
  })
  runs.push({ name: currentCase, run })
  return run
}

const output = (run: BootstrapRun) => `${run.stdout}${run.stderr}`
// A line the run printed, its prefix taken off, that starts as given.
const lineOf = (run: BootstrapRun, start: string): string | undefined =>
  `${run.stdout}${run.stderr}`
    .split('\n')
    .map(text => (text.startsWith(PREFIX) ? text.slice(PREFIX.length) : text))
    .find(text => text.startsWith(start))

function expectExit(run: BootstrapRun, status: number, what: string): void {
  expect(run.status === status, `${what}: exited ${run.status ?? run.signal}, not ${status}`)
}
function expectSaid(run: BootstrapRun, text: string, what: string): void {
  expect(output(run).includes(text), `${what}: didn't print ${JSON.stringify(text)}`)
}
function expectNotSaid(run: BootstrapRun, text: string, what: string): void {
  expect(!output(run).includes(text), `${what}: printed ${JSON.stringify(text)}`)
}

// A local port nothing listens on, so a run that tries to connect fails at once (BSS-04).
async function closedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await new Promise(resolve => server.close(resolve))
  if (address === null || typeof address === 'string') throw new Error('no port')
  return address.port
}

// The environment under which DEPLOY_ENV prod passes every check before connecting, PGHOST being
// this machine's address: a port forward's TLS name, as the runbook gives it. Not a real endpoint.
const PROD_ENV = {
  DEPLOY_ENV: 'prod',
  OWNER_BOOTSTRAP_TLS_NAME: 'hearth-check.cluster-check.ap-southeast-1.rds.amazonaws.com',
}

// The checkout's migrations, as the migrator (and the script) name them.
async function checkoutMigrations(): Promise<string[]> {
  const entries = await readdir(new URL('../../../db/migrations/', import.meta.url), { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
    .map(entry => entry.name.slice(0, -'.sql'.length))
    .sort()
}

// --- Reading a database -------------------------------------------------------------------------

interface Digest {
  rows: Map<string, string>
  sequences: Map<string, string>
  writes: Map<string, string>
}

async function digest(db: string): Promise<Digest> {
  // The script's backend flushes its counts as it exits, which can trail the process by a moment.
  await admin('postgres', async client => {
    await until(async () => {
      const { rows: found } = await client.query<{ n: number }>(
        'select count(*)::int as n from pg_stat_activity where datname = $1 and application_name = $2',
        [db, BOOTSTRAP_APPLICATION],
      )
      return found[0]?.n === 0
    }, 'the script’s backend gone')
  })
  await sleep(100)
  return admin(db, async client => {
    const tables = (
      await client.query<{ name: string }>(`
        select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition and c.relname not like 'it\\_%'
        order by 1`)
    ).rows
    const rows = new Map<string, string>()
    for (const { name } of tables) {
      const { rows: found } = await client.query<{ n: string; h: string }>(
        `select count(*)::text as n, md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h from public."${name}" t`,
      )
      rows.set(name, `${found[0]?.n}:${found[0]?.h}`)
    }
    const sequences = new Map<string, string>()
    for (const row of (
      await client.query<{ name: string; value: string | null }>(
        `select sequencename as name, last_value::text as value from pg_sequences where schemaname = 'public'`,
      )
    ).rows) {
      sequences.set(row.name, row.value ?? 'unused')
    }
    const writes = new Map<string, string>()
    for (const row of (
      await client.query<{ name: string; n: string }>(
        `select relname as name, (n_tup_ins + n_tup_upd + n_tup_del)::text as n from pg_stat_user_tables
         where schemaname = 'public' and relname not like 'it\\_%'`,
      )
    ).rows) {
      writes.set(row.name, row.n)
    }
    return { rows, sequences, writes }
  })
}

const differing = (a: Map<string, string>, b: Map<string, string>): string[] =>
  [...new Set([...a.keys(), ...b.keys()])].filter(key => a.get(key) !== b.get(key)).sort()

function expectRowsKept(before: Digest, after: Digest, what: string): void {
  const changed = differing(before.rows, after.rows)
  expect(changed.length === 0, `${what}: rows changed in ${changed.join(', ')}`)
}
function expectNothingWritten(before: Digest, after: Digest, what: string): void {
  expectRowsKept(before, after, what)
  const written = differing(before.writes, after.writes)
  expect(written.length === 0, `${what}: it wrote (and rolled back) ${written.join(', ')}`)
  const moved = differing(before.sequences, after.sequences)
  expect(moved.length === 0, `${what}: sequences moved (${moved.join(', ')}), so it got as far as a write`)
}

// One query's rows as the superuser.
async function rows<Row extends object>(db: string, text: string, values: unknown[] = []): Promise<Row[]> {
  return admin(db, async client => (await client.query<Row>(text, values)).rows)
}

// The org, its Hearth principal, the founder and their current number's row, and Twilio's and
// AWS's open clearances, in a database the set-up ran in.
interface Founded {
  org: string
  hearth: string
  founder: string
  phone: string
}
async function founded(db: string): Promise<Founded> {
  const found = await rows<Founded>(
    db,
    `select o.id::text as org, h.id::text as hearth, p.id::text as founder, n.id::text as phone
     from orgs o
     join principals h on h.org_id = o.id and h.kind = 'system' and h.system_key = 'hearth'
     join people p on p.org_id = o.id
     join role_assignments r on r.org_id = o.id and r.person_id = p.id and r.role = 'dpo' and r.created_by = h.id
     join phone_numbers n on n.org_id = o.id and n.person_id = p.id and n.removed_at is null
     order by p.created_at limit 1`,
  )
  const [first] = found
  if (first === undefined) throw new Error(`${db} has no founder`)
  return first
}

// Statements as the superuser acting as someone in the org, in a transaction of their own, as the
// harness's publishNotice() acts as the DPO through the checked functions.
async function acting<Row extends object>(
  db: string,
  as: { org: string; user: string },
  statements: readonly [string, unknown[]][],
): Promise<Row[]> {
  return admin(db, async client => {
    await client.query('begin')
    try {
      await client.query("select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)", [
        as.org,
        as.user,
      ])
      let last: Row[] = []
      for (const [text, values] of statements) last = (await client.query<Row>(text, values)).rows
      await client.query('commit')
      return last
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  })
}

// The server's own reads, as hearth_app: a pool whose sessions take the role at connection (the
// superuser may), so withOrg(), the pre-org lookups and the readers run under hearth_app's grants
// and row level security, as the api runs them.
async function asServer<T>(db: string, work: (app: Database) => Promise<T>): Promise<T> {
  const pool = new Pool({ ...connection, database: db, max: 2, options: '-c role=hearth_app' })
  pool.on('error', () => {})
  const app = createDatabase(pool)
  try {
    return await work(app)
  } finally {
    await app.destroy()
  }
}

// Twilio Verify's send state, as a later hearth_app transaction reads it (read-write: it reads the
// clearance FOR SHARE), acting as the founder.
async function sendState(db: string, f: Founded): Promise<string | undefined> {
  return asServer(db, app =>
    withOrg(app, { orgId: f.org, userId: f.founder }, async trx => {
      const { rows: found } = await sql<{
        state: string
      }>`select public.transfer_send_state('twilio') as state`.execute(trx)
      return found[0]?.state
    }),
  )
}

// --- Arranging a database through the checked functions, as the founder -------------------------

// The founder publishes v0: a basis and a retention for each active purpose that has none
// (set_register_purpose()), their business contact (set_dpo_contact()), then the draft the
// registers make, through publish_notice(), which links the set-up's two clearances, as the
// harness's publishNotice() does. scripts/guards/api-test-overrides.test.ts lets CI's checks in
// this folder call the last two.
async function publishV1(db: string): Promise<void> {
  const f = await founded(db)
  const as = { org: f.org, user: f.founder }
  const entries = await rows<{
    purpose: string
    version: number
    status: string
    basis: string | null
    basis_reference: string | null
    opt_out_days: number | null
    retention: string | null
    providers: string[]
  }>(
    db,
    `select distinct on (purpose) purpose, version, status, basis, basis_reference, opt_out_days, retention, providers
     from processing_register where org_id = $1 and not ai order by purpose, version desc`,
    [f.org],
  )
  for (const entry of entries.filter(
    row => row.status === 'active' && (row.basis === null || row.retention === null),
  )) {
    await acting(db, as, [
      [
        `select public.set_register_purpose($1, $2::integer, 'active', $3, $4, $5::integer, $6, $7::text[], $8, null, null)`,
        [
          entry.purpose,
          entry.version,
          entry.basis ?? 'employment',
          entry.basis === null ? null : entry.basis_reference,
          entry.opt_out_days,
          entry.retention ?? 'Kept while you work here, then 90 days',
          entry.providers,
          randomUUID(),
        ],
      ],
    ])
  }
  // A role title and a mailbox on a reserved .example domain, built here so no address is written.
  const mailbox = ['dpo', 'check.example'].join('@')
  await acting(db, as, [
    [
      'select version from public.set_dpo_contact(null, $1, $2, null, null, $3, null, null)',
      ['Data Protection Officer', mailbox, randomUUID()],
    ],
  ])
  const draft = await asServer(db, app =>
    withOrg(app, { orgId: f.org, userId: f.founder }, trx => noticeDraft(trx, f.org), { readOnly: true }),
  )
  if (draft.body === null || draft.problems.length > 0) {
    throw new Error(`the draft can't be published: ${draft.problems.map(problem => problem.code).join(', ')}`)
  }
  await acting(db, as, [
    [
      `select notice, version from public.publish_notice($1::integer, $2, $3, $4::text[], $5::integer[], $6::uuid[],
         $7::integer, $8, null, null)`,
      [
        draft.latest?.version ?? null,
        draft.body,
        NOTICE_GENERATOR,
        draft.sources.purposes.map(purpose => purpose.key),
        draft.sources.purposes.map(purpose => purpose.version),
        draft.sources.clearances.map(clearance => clearance.id),
        draft.sources.contact?.version ?? null,
        randomUUID(),
      ],
    ],
  ])
}

// The founder, as the DPO, withdraws Twilio Verify's open clearance (dpo_decision).
async function withdrawTwilio(db: string): Promise<void> {
  const f = await founded(db)
  await acting(db, { org: f.org, user: f.founder }, [
    ["select * from public.withdraw_transfer_clearance('twilio', $1, null, null)", [randomUUID()]],
  ])
}

// The founder records Twilio Verify's facts again from the entry as it stands, changing the
// provider's retention and, if given, the countries' confirmation (record_transfer_entry(); with
// keep, "Save and keep cleared").
async function recordTwilio(
  db: string,
  change: { providerRetention: string; countriesConfirmed?: string },
  keep: boolean,
): Promise<void> {
  const f = await founded(db)
  await acting(db, { org: f.org, user: f.founder }, [
    [
      `select r.revision from public.transfer_register t
       cross join lateral public.record_transfer_entry('twilio', t.revision, t.services, t.data_types,
         t.processing_countries, t.storage_countries, coalesce($2, t.countries_confirmed), t.safeguard,
         t.safeguard_reference, t.certificate_verified_on, t.dpa_terms_confirmed, t.training, t.zero_retention, $3,
         t.retention_confirmed, t.onward_recipients, t.review_on, $4::boolean, $5, null, null) r
       where t.org_id = $1 and t.provider = 'twilio'`,
      [f.org, change.countriesConfirmed ?? null, change.providerRetention, keep, randomUUID()],
    ],
  ])
}

// Empties the write tracking, so a case reads only its run's writes and events.
async function resetTracking(db: string): Promise<void> {
  await admin(db, client => client.query('truncate public.it_writes, public.it_events'))
}

// Twilio Verify's clearances, oldest first.
const twilioClearances = (db: string) =>
  rows<{ id: string; cleared_via: string; cleared_by: string; withdrawn_at: Date | null; facts: unknown }>(
    db,
    `select id::text, cleared_via, cleared_by::text, withdrawn_at, facts from transfer_clearances
     where provider = 'twilio' order by cleared_at, id`,
  )
const twilioEntry = async (db: string) =>
  (
    await rows<{ revision: string; updated_by: string | null; facts: Record<string, unknown> }>(
      db,
      `select t.revision::text, t.updated_by::text, public.transfer_register_facts(t) as facts
       from transfer_register t where t.provider = 'twilio'`,
    )
  )[0]
// The latest register.transfer_cleared audit row.
const lastClearedAudit = async (db: string) =>
  (
    await rows<{ actor_id: string; reason: string; details: Record<string, unknown> }>(
      db,
      `select actor_id::text, reason, details from audit_events
       where action = 'register.transfer_cleared' order by id desc limit 1`,
    )
  )[0]

// yyyy-mm-dd hh:mm in a zone, as the dpo_sessions line prints an instant.
function clock(at: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((all, part) => Object.assign(all, { [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

// Polls until check passes, for at most ms (5 s unless given).
async function until(check: () => Promise<boolean>, what: string, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms
  for (;;) {
    if (await check()) return
    if (Date.now() > deadline) throw new Error(`still not ${what} after ${ms} ms`)
    await sleep(25)
  }
}

// How many backends in the database wait on a lock of this kind: the script's (by its
// application_name) or anyone else's, and the pids of those waiting.
async function waiting(
  watcher: Client,
  db: string,
  o: { script: boolean; event?: string; except?: readonly number[] },
): Promise<number[]> {
  const { rows: found } = await watcher.query<{ pid: number }>(
    `select pid from pg_stat_activity
     where datname = $1 and wait_event_type = 'Lock' and ($2::text is null or wait_event = $2)
       and (application_name = $3) = $4 and not (pid = any ($5::int[])) and pid <> pg_backend_pid()`,
    [db, o.event ?? null, BOOTSTRAP_APPLICATION, o.script, [...(o.except ?? [])]],
  )
  return found.map(row => row.pid)
}

const pidOf = async (client: Client): Promise<number> =>
  (await client.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]?.pid ?? 0

// The parts of the committed line a set-up prints.
function committedSetUp(run: BootstrapRun): {
  org: string
  hearth: string
  founder: string
  twilio: string
  twilioReview: string
  aws: string
  awsReview: string
} {
  const found =
    /^committed: organisation (\S+); Hearth (\S+); founder \(Owner and DPO\) (\S+); Twilio Verify cleared (\S+), review (\S+); AWS cleared (\S+), review (\S+)$/.exec(
      lineOf(run, 'committed: organisation') ?? '',
    )
  if (found === null) throw new Error('the set-up printed no committed line')
  const [, org = '', hearth = '', founder = '', twilio = '', twilioReview = '', aws = '', awsReview = ''] = found
  return { org, hearth, founder, twilio, twilioReview, aws, awsReview }
}

// A set-up committed through the script in a fresh copy of the template.
async function setUpCommitted(name: string, document = setUpDocument()): Promise<{ db: string; run: BootstrapRun }> {
  const db = await copy(name)
  const run = await script('set-up', db, { commit: true, input: document })
  expectExit(run, 0, 'the set-up')
  return { db, run }
}

// --- The cases ----------------------------------------------------------------------------------

// The set-up documents' review dates (REVIEW_DATES, pinned once in the fixture): Twilio Verify's, 60
// days ahead of the day the run began, and AWS's, a year ahead. Every case's set-up and the
// templates' carry them, so each is the entry's own date whatever the day is now (TESTS-04).
const D60 = REVIEW_DATES.twilio
const D365 = REVIEW_DATES.aws
const STATED = 'send state for Twilio Verify: '
const WOULD_LEAVE = `${PREFIX}would leave the send state for Twilio Verify at `
const CLEARED_TEXT = 'cleared (everyone gets sign-in codes again)'
const NO_NOTICE_TEXT = 'no_notice (codes go to the DPO alone until the first version is published)'
const UNSTATED_TEXT =
  'unstated (codes go to the DPO alone until a new version states the change: docs/runbooks/twilio-fact-changed.md)'
const SIGNED_IN = 'A Data Protection Officer is signed in, so they clear Twilio Verify again in Hearth.'
const CLEARED_ALREADY = 'Twilio Verify is cleared already. The DPO changes its entry in Hearth.'
const NEVER_CLEARED = 'The emergency re-clear restores only a clearance that has ended. Run the set-up without it.'
const NOT_DPO = 'The person named as the DPO must be at the organisation and hold the DPO role.'
const AT_MOST_90 = 'An emergency re-clear sets a review date at most 90 days ahead. The DPO sets a later one in Hearth.'
const AFTER_TODAY = 'Set a review date after today before clearing it.'
const LOCK_BUSY = 'a lock was busy: run it once more. Nothing was written (SQLSTATE 55P03).'
const KEPT_NOTHING = 'plan only: every check passed and nothing was kept. Run it again with --commit.'

type Case = [string, () => Promise<void>]

const SET_UP_CASES: Case[] = [
  [
    'BSS-01 PD-115: the set-up’s plan keeps nothing, and prints the org’s name, the name’s length (stdout is a pipe), the masked number and both review dates',
    async () => {
      const db = await copy('bss01')
      const before = await digest(db)
      const run = await script('set-up', db, { input: setUpDocument() })
      expectExit(run, 0, 'the plan')
      const after = await digest(db)
      expectRowsKept(before, after, 'the plan')
      expect(differing(before.sequences, after.sequences).length > 0, 'the plan moved no sequence, so it wrote nothing')
      const newest = (await checkoutMigrations()).at(-1)
      expectSaid(
        run,
        `${PREFIX}set-up (plan) on database ${db}, DEPLOY_ENV test, input for test, marker none, ${(await checkoutMigrations()).length} migrations applied, the newest ${newest}; bounds: transaction 30s, lock 2s, idle 5s\n`,
        'the target line',
      )
      expectSaid(run, `${PREFIX}organisation name: ${ORG_NAME}\n`, 'the plan')
      expectSaid(
        run,
        `${PREFIX}founder's name: ${[...FOUNDER_NAME].length} characters (shown only on a terminal)\n`,
        'the plan',
      )
      expectSaid(run, `${PREFIX}founder's number: ${maskNumber(FOUNDER_E164)}\n`, 'the plan')
      expectSaid(run, `${PREFIX}review dates: Twilio Verify ${D60}, AWS ${D365}\n`, 'the plan')
      expectSaid(run, `${WOULD_LEAVE}${NO_NOTICE_TEXT}\n`, 'the plan')
      expectSaid(run, `${PREFIX}${KEPT_NOTHING}\n`, 'the plan')
      expectNotSaid(run, 'committing', 'the plan')
    },
  ],
  [
    'BSS-02 T22 items 16 and 20 BSC-02 D35 ACC-10: the set-up writes BSC-02’s rows through the script, which the server then reads as it should',
    async () => {
      const db = await copy('bss02')
      const run = await script('set-up', db, {
        commit: true,
        input: setUpDocument({ organisation: `  ${ORG_NAME} `, reason: `  ${SET_UP_REASON}  ` }),
      })
      expectExit(run, 0, 'the set-up')
      const printed = committedSetUp(run)
      expectSaid(run, `${PREFIX}committing organisation ${printed.org}\n`, 'the set-up')
      expectSaid(run, `${PREFIX}${STATED}${NO_NOTICE_TEXT}\n`, 'the set-up')
      expectSaid(
        run,
        `${PREFIX}next: the founder signs in now on their own phone, then follows docs/runbooks/publishing-the-notice.md\n`,
        'the set-up',
      )
      expect(printed.twilioReview === D60 && printed.awsReview === D365, 'the committed review dates')

      const orgs = await rows<{ id: string; name: string; time_zone: string }>(
        db,
        'select id::text, name, time_zone from orgs',
      )
      expect(
        orgs.length === 1 && orgs[0]?.id === printed.org && orgs[0]?.name === ORG_NAME && orgs[0]?.time_zone === ZONE,
        `orgs: ${JSON.stringify(orgs)}`,
      )
      const principals = await rows<{ id: string; kind: string; system_key: string | null }>(
        db,
        'select id::text, kind, system_key from principals order by kind',
      )
      expect(
        sameJson(principals, [
          { id: printed.founder, kind: 'human', system_key: null },
          { id: printed.hearth, kind: 'system', system_key: 'hearth' },
        ]),
        `principals: ${JSON.stringify(principals)}`,
      )
      const people = await rows<{ id: string; full_name: string; created_by: string; deactivated_at: Date | null }>(
        db,
        'select id::text, full_name, created_by::text, deactivated_at from people',
      )
      expect(
        people.length === 1 &&
          people[0]?.id === printed.founder &&
          people[0]?.full_name === FOUNDER_NAME &&
          people[0]?.created_by === printed.hearth &&
          people[0]?.deactivated_at === null,
        'the founder’s person row',
      )
      const numbers = await rows<{ person_id: string; e164: string; created_by: string; removed_at: Date | null }>(
        db,
        'select person_id::text, e164, created_by::text, removed_at from phone_numbers',
      )
      expect(
        numbers.length === 1 &&
          numbers[0]?.person_id === printed.founder &&
          numbers[0]?.e164 === normalisePhone(FOUNDER_NUMBER) &&
          numbers[0]?.created_by === printed.hearth &&
          numbers[0]?.removed_at === null,
        'the founder’s number',
      )
      const roles = await rows<{ role: string; ok: boolean }>(
        db,
        `select role, (person_id = $1 and created_by = $2 and approved_by is null and approved_at is null
                       and revoked_at is null and team_id is null) as ok
         from role_assignments order by role`,
        [printed.founder, printed.hearth],
      )
      expect(
        sameJson(roles, [
          { role: 'dpo', ok: true },
          { role: 'owner', ok: true },
        ]),
        `role_assignments: ${JSON.stringify(roles)}`,
      )
      const flags = await rows<{ key: string; enabled: boolean; locked: boolean }>(
        db,
        'select key, enabled, locked from feature_flags order by key',
      )
      const expectedFlags = Object.entries(FLAGS)
        .map(([key, spec]) => ({ key, enabled: spec.default, locked: spec.locked }))
        .sort((a, b) => (a.key < b.key ? -1 : 1))
      expect(sameJson(flags, expectedFlags), `feature_flags: ${JSON.stringify(flags)}`)
      expect(
        flags.filter(flag => flag.key.startsWith('ai.')).every(flag => !flag.enabled && flag.locked) &&
          !flags.some(flag => flag.key.startsWith('it.')),
        'an ai.* flag on or unlocked, or an it.* flag',
      )
      const purposes = await rows<{ purpose: string; version: number; status: string }>(
        db,
        'select purpose, version, status from processing_register order by purpose',
      )
      expect(
        purposes.length === PURPOSE_KEYS.length &&
          new Set(purposes.map(row => row.purpose)).size === PURPOSE_KEYS.length &&
          purposes.every(row => row.version === 1) &&
          purposes.find(row => row.purpose === 'request_handling')?.status === 'active',
        `processing_register: ${JSON.stringify(purposes)}`,
      )
      const entries = await rows<{ provider: string; revision: string; updated_by: string | null }>(
        db,
        'select provider, revision::text, updated_by::text from transfer_register order by provider',
      )
      expect(entries.length === PROVIDERS.length, `transfer_register has ${entries.length} entries`)
      for (const entry of entries) {
        const cleared = entry.provider === 'twilio' || entry.provider === 'aws'
        expect(
          cleared
            ? entry.revision === '2' && entry.updated_by === printed.hearth
            : entry.revision === '1' && entry.updated_by === null,
          `${entry.provider}'s entry: revision ${entry.revision}, updated by ${entry.updated_by}`,
        )
      }
      const baseline = PROVIDERS.find(provider => provider !== 'twilio' && provider !== 'aws')
      for (const provider of ['twilio', 'aws'] as const) {
        const reviewOn = provider === 'twilio' ? D60 : D365
        const facts = await rows<{ ok: boolean }>(
          db,
          `select (t.services, t.data_types, t.processing_countries, t.storage_countries, t.countries_confirmed,
                   t.safeguard, t.safeguard_reference, t.certificate_verified_on, t.dpa_terms_confirmed, t.training,
                   t.zero_retention, t.provider_retention, t.retention_confirmed, t.onward_recipients, t.review_on::text)
                  is not distinct from
                  ('Plover sign-in codes by text message', 'Plover mobile number and the code sent', '{US}'::text[],
                   '{US}'::text[], 'Plover agreement, annex 1', 'dpa', 'Plover agreement', null::date, true,
                   'not_applicable', 'not_applicable', 'Plover records kept for thirty days',
                   'Plover agreement, annex 2', 'Plover carriers only', $2::text) as ok
           from transfer_register t where t.provider = $1`,
          [provider, reviewOn],
        )
        expect(facts[0]?.ok === true, `${provider}'s facts aren't as given (trimmed, countries normalised)`)
        const clearances = await rows<{ id: string; ok: boolean }>(
          db,
          `select c.id::text, (c.cleared_via = 'bootstrap' and c.cleared_by = $2 and c.withdrawn_at is null
                               and c.facts = public.transfer_register_facts(t)) as ok
           from transfer_clearances c join transfer_register t on t.id = c.entry_id where c.provider = $1`,
          [provider, printed.founder],
        )
        expect(
          clearances.length === 1 &&
            clearances[0]?.ok === true &&
            clearances[0]?.id === (provider === 'twilio' ? printed.twilio : printed.aws),
          `${provider}'s clearance: ${JSON.stringify(clearances)}`,
        )
        const audit = await rows<{ ok: boolean; details: unknown }>(
          db,
          `select (a.actor_id = $2 and a.target_type = 'transfer_entry' and a.reason = $3 and a.via is null
                   and a.on_behalf_of_id is null and a.request_id is null
                   and a.details = jsonb_build_object('by', 'bootstrap', 'decided_by', $4::uuid, 'revision', 2,
                                                      'was_revision', 1, 'changed', (
                     select coalesce(jsonb_object_agg(w.key, jsonb_build_object('from', w.value, 'to', n.value)), '{}')
                     from jsonb_each(public.transfer_register_facts(b)) w
                     join jsonb_each(public.transfer_register_facts(t)) n on n.key = w.key
                     where w.value is distinct from n.value), 'clearance', $5::uuid)) as ok, a.details
           from audit_events a
           join transfer_register t on t.provider = a.target_id
           join transfer_register b on b.provider = $6
           where a.action = 'register.transfer_cleared' and a.target_id = $1`,
          [
            provider,
            printed.hearth,
            SET_UP_REASON,
            printed.founder,
            provider === 'twilio' ? printed.twilio : printed.aws,
            baseline,
          ],
        )
        expect(audit.length === 1 && audit[0]?.ok === true, `${provider}'s audit row: ${JSON.stringify(audit)}`)
        const events = await rows<{ ok: boolean }>(
          db,
          `select (e.entity_type = 'transfer_entry' and e.entity_id = t.id and e.actor_id = $2 and e.actor_kind = 'system'
                   and e.purpose = 'service_operation'
                   and e.ids = jsonb_build_object('provider', $1::text, 'cleared', true)) as ok
           from outbox_events e join transfer_register t on t.provider = $1
           where e.type = 'register.transfer_changed' and e.ids ->> 'provider' = $1`,
          [provider, printed.hearth],
        )
        expect(events.length === 1 && events[0]?.ok === true, `${provider}'s register.transfer_changed`)
      }
      const own = await rows<{ ok: boolean }>(
        db,
        `select (a.actor_id = $1 and a.target_type = 'person' and a.target_id = $2 and a.reason = $3
                 and a.details = jsonb_build_object('by', 'bootstrap', 'roles', jsonb_build_array('owner', 'dpo'),
                                                    'hearth', $1::uuid, 'number', n.id)
                 and a.via is null and a.on_behalf_of_id is null and a.request_id is null and a.device_id is null
                 and a.ip is null and a.case_id is null) as ok
         from audit_events a join phone_numbers n on true
         where a.action = 'bootstrap.set_up'`,
        [printed.hearth, printed.founder, SET_UP_REASON],
      )
      expect(own.length === 1 && own[0]?.ok === true, 'the set-up’s own audit row (PD-126)')
      for (const table of [
        'users',
        'devices',
        'sessions',
        'passkeys',
        'profiles',
        'notice_versions',
        'notice_acknowledgments',
        'dpo_settings',
        'cases',
        'audit_log_readers',
        'processing_restrictions',
      ]) {
        const [count] = await rows<{ n: number }>(db, `select count(*)::int as n from public.${table}`)
        expect(count?.n === 0, `the set-up wrote ${table}`)
      }

      // As the server reads them: hearth_app, through withOrg()'s settings and the pre-org lookup.
      await asServer(db, async app => {
        const system = await withOrg(app, { orgId: printed.org, system: true }, async trx => {
          const { rows: found } = await sql<{ id: string }>`select current_setting('app.user_id') as id`.execute(trx)
          return found[0]?.id
        })
        expect(system === printed.hearth, 'withOrg({ system: true }) found no Hearth principal, or another')
        for (const typed of [FOUNDER_NUMBER, FOUNDER_E164, '0044 7700 900123']) {
          const e164 = normalisePhone(typed)
          expect(e164 !== undefined, 'sign-in’s parser refused a typed form of the number')
          const matches = await personByPhone(app, e164 ?? '')
          expect(
            matches.length === 1 && matches[0]?.personId === printed.founder && matches[0]?.orgId === printed.org,
            `personByPhone() answered ${matches.length} matches for a typed form of the number`,
          )
        }
        await withOrg(app, { orgId: printed.org, userId: printed.founder }, async trx => {
          expect(
            (await holdsRoleNow(trx, printed.org, printed.founder, 'owner')) &&
              (await holdsRoleNow(trx, printed.org, printed.founder, 'dpo')),
            'the server doesn’t see the founder’s roles',
          )
          const { rows: found } = await sql<{
            state: 'not_cleared' | 'no_notice' | 'cleared' | 'unstated'
          }>`select public.transfer_send_state('twilio') as state`.execute(trx)
          const state = found[0]?.state
          expect(state === 'no_notice', `Twilio Verify's send state is ${state}`)
          expect(
            state !== undefined && codeMaySend(state, true) && !codeMaySend(state, false),
            'before v0 a code must go to the DPO alone (PD-59)',
          )
          expect(
            (await noticeStanding(trx, printed.org, printed.founder)) === 'unpublished',
            'the notice standing isn’t unpublished',
          )
        })
      })
    },
  ],
  [
    'BSS-03 R12 PD-126: the set-up’s write set, both ways: one transaction, every write hearth_owner’s, exactly section 4’s rows, two events and nothing reserved',
    async () => {
      const { db, run } = await setUpCommitted('bss03')
      const printed = committedSetUp(run)
      const actors = await rows<{ xid: string; role: string }>(
        db,
        'select distinct xid::text, role from it_writes order by 1, 2',
      )
      expect(
        actors.length === 1 && actors[0]?.role === 'hearth_owner',
        `the writes: ${JSON.stringify(actors.map(actor => actor.role))} in ${new Set(actors.map(actor => actor.xid)).size} transactions`,
      )
      const counts = await rows<{ what: string; n: number }>(
        db,
        `select table_name || ' ' || op as what, count(*)::int as n from it_writes group by 1 order by 1`,
      )
      const expected: Record<string, number> = {
        'audit_events INSERT': 3,
        'feature_flags INSERT': Object.keys(FLAGS).length,
        'orgs INSERT': 1,
        'people INSERT': 1,
        'phone_numbers INSERT': 1,
        'principals INSERT': 2,
        'processing_register INSERT': PURPOSE_KEYS.length,
        'role_assignments INSERT': 2,
        'transfer_clearances INSERT': 2,
        'transfer_register INSERT': PROVIDERS.length,
        'transfer_register UPDATE': 2,
      }
      const got = Object.fromEntries(counts.map(row => [row.what, row.n]))
      expect(sameJson(got, expected), `the write set: ${JSON.stringify(got)}`)
      const events = await rows<{ xid: string; type: string }>(db, 'select xid::text, type from it_events')
      expect(
        events.length === 2 &&
          events.every(event => event.type === 'register.transfer_changed' && event.xid === actors[0]?.xid),
        `the events: ${JSON.stringify(events.map(event => event.type))}`,
      )
      const outbox = await rows<{ type: string; entity_type: string; purpose: string; ids: unknown; org_id: string }>(
        db,
        'select type, entity_type, purpose, ids, org_id::text from outbox_events',
      )
      for (const event of outbox) {
        expect(event.type !== 'person.added' && event.type !== 'role.changed', `a reserved event: ${event.type}`)
        const spec = EVENTS[event.type as EventType] as (typeof EVENTS)[EventType] | undefined
        expect(
          spec !== undefined &&
            spec.status === 'emitted' &&
            spec.entity === event.entity_type &&
            (spec.purposes as readonly string[]).includes(event.purpose) &&
            spec.ids?.safeParse(event.ids).success === true &&
            event.org_id === printed.org,
          `${event.type} doesn't parse as appendOutbox() would require`,
        )
      }
      // Every row the set-up left carries the new org's id (the database was empty before it).
      const tables = await rows<{ name: string }>(
        db,
        `select c.table_name as name from information_schema.columns c
         join pg_class k on k.relname = c.table_name join pg_namespace s on s.oid = k.relnamespace and s.nspname = 'public'
         where c.table_schema = 'public' and c.column_name = 'org_id' and k.relkind in ('r', 'p') and not k.relispartition
           and c.table_name not like 'it\\_%' order by 1`,
      )
      for (const { name } of tables) {
        const [other] = await rows<{ n: number }>(
          db,
          `select count(*)::int as n from public."${name}" where org_id is distinct from $1::uuid`,
          [printed.org],
        )
        expect(other?.n === 0, `${name} holds a row of another org`)
      }
      const [orgs] = await rows<{ n: number }>(db, 'select count(*)::int as n from orgs where id <> $1', [printed.org])
      expect(orgs?.n === 0, 'another org')
    },
  ],
]

const REFUSAL_CASES: Case[] = [
  [
    'BSS-04 PD-116 to PD-121 T22 item 37: every refusal before connecting exits 2 with the input’s own message, never a connection’s, on a port nothing answers',
    async () => {
      const port = await closedPort()
      const db = dbName('bss04')
      const refuses = async (
        what: string,
        o: { mode?: BootstrapMode; input?: unknown; env?: Record<string, string>; args?: string[]; planted?: string },
        text: string,
      ) => {
        const run = await script(o.mode ?? 'set-up', db, {
          port,
          ...(o.input === undefined ? {} : { input: o.input }),
          ...(o.env === undefined ? {} : { env: o.env }),
          ...(o.args === undefined ? {} : { args: o.args }),
        })
        expectExit(run, 2, what)
        expectSaid(run, text, what)
        expectNotSaid(run, 'could not connect', what)
        expectNotSaid(run, 'on database', what)
        if (o.planted !== undefined) expectNotSaid(run, o.planted, what)
      }
      const named = (name: string) => setUpDocument({ organisation: name })
      const aiCopy = 'organisation: holds wording the app keeps off its screens before its AI stages (AI_COPY)'
      for (const name of [
        'Ask Freight',
        'AI Freight',
        'Assistant Freight',
        'Agent Freight',
        'Copilot Freight',
        'Coming Soon Freight',
        'Star ✦ Freight',
        'ＡＩ Freight',
        'Ａｓｋ Co',
      ]) {
        await refuses(`the org's name ${JSON.stringify(name)}`, { input: named(name), planted: name }, aiCopy)
      }
      await refuses(
        'a zero-width character in the org’s name',
        { input: named(`Kestrel${String.fromCodePoint(0x200b)}Freight`) },
        'organisation: holds a control or invisible character',
      )
      await refuses('an empty org name', { input: named('') }, 'organisation: empty')
      await refuses('an org name of spaces alone', { input: named('   ') }, 'organisation: empty')
      await refuses(
        'an org name of 201 characters, astral ones included',
        { input: named(`${'𝒦'.repeat(100)}${'k'.repeat(101)}`) },
        'organisation: more than 200 characters',
      )
      await refuses(
        'a number sign-in’s parser refuses',
        { input: setUpDocument({ founder: { fullName: FOUNDER_NAME, number: 'not a number' } }) },
        'founder.number: not a phone number sign-in reads',
      )
      // A number outside the drama range: a North American number from the 555-01xx range kept for
      // fiction, built here from its parts.
      const elsewhere = ['+1', '202', '555', '0123'].join(' ')
      await refuses(
        'a number outside the drama range under DEPLOY_ENV test',
        { input: setUpDocument({ founder: { fullName: FOUNDER_NAME, number: elsewhere } }) },
        'founder.number: under DEPLOY_ENV local or test only the fictional range',
      )
      await refuses(
        'a fiction number under DEPLOY_ENV prod',
        { input: setUpDocument({ environment: 'prod' }), env: PROD_ENV },
        "founder.number: under DEPLOY_ENV nonprod or prod a fictional or the seed's number is refused",
      )
      const facts = setUpDocument().twilio as Record<string, unknown>
      for (const [field, value, code] of [
        ['services', null, 'services'],
        ['dataTypes', '  ', 'data_types'],
        ['processingCountries', [], 'processing_countries'],
        ['storageCountries', [], 'storage_countries'],
        ['countriesConfirmed', null, 'countries_confirmed'],
        ['safeguard', null, 'safeguard'],
        ['safeguardReference', null, 'safeguard_reference'],
        ['dpaTermsConfirmed', false, 'dpa_terms'],
        ['training', null, 'training'],
        ['zeroRetention', null, 'zero_retention'],
        ['providerRetention', null, 'provider_retention'],
        ['retentionConfirmed', null, 'retention_confirmed'],
        ['onwardRecipients', null, 'onward_recipients'],
        ['reviewOn', null, 'review_on'],
        ['reviewOn', daysAhead(0), 'review_due'],
      ] as const) {
        await refuses(
          `twilio's ${field} missing`,
          { input: setUpDocument({ twilio: { ...facts, [field]: value } }) },
          `twilio: the facts aren't complete for a clearance today: ${code}`,
        )
      }
      for (const field of ['services', 'dataTypes', 'providerRetention', 'onwardRecipients']) {
        await refuses(
          `twilio's ${field} matching AI_COPY`,
          {
            input: setUpDocument({ twilio: { ...facts, [field]: 'Kestrel agents handle it' } }),
            planted: 'Kestrel agents',
          },
          `twilio.${field}: holds wording the app keeps off its screens`,
        )
      }
      await refuses('an empty reason', { input: setUpDocument({ reason: '' }) }, 'reason: empty')
      await refuses('a reason of spaces alone', { input: setUpDocument({ reason: '   ' }) }, 'reason: empty')
      await refuses(
        'a reason of 2,001 characters',
        { input: setUpDocument({ reason: 'r'.repeat(2001) }) },
        'reason: more than 2,000 characters',
      )
      await refuses('an unknown key', { input: setUpDocument({ extra: 1 }) }, 'the document: an unknown key, extra')
      await refuses('a pin key', { input: setUpDocument({ pin: '271828' }) }, 'the document: an unknown key, pin')
      await refuses(
        'a recovery document given to set-up',
        { input: recoverDocument({ dpo: randomUUID(), reviewOn: D60 }) },
        'the document: an unknown key, dpo',
      )
      await refuses(
        'a fromEntry of countries_confirmed',
        {
          mode: 'recover',
          input: recoverDocument({ dpo: randomUUID(), reviewOn: D60, fromEntry: ['countries_confirmed'] }),
        },
        'fromEntry.0: not a fact the notice states',
      )
      await refuses(
        'malformed JSON',
        { input: '{"environment": "test", "organisation": ' },
        'OWNER_BOOTSTRAP_INPUT is not valid JSON',
      )
      await refuses(
        'a truncated paste',
        { input: '{' },
        "OWNER_BOOTSTRAP_INPUT: only the first line arrived: load it with the runbook's command, which reads every line",
      )
      await refuses(
        'a document written for prod under DEPLOY_ENV test',
        { input: setUpDocument({ environment: 'prod' }) },
        'OWNER_BOOTSTRAP_INPUT was written for prod, not DEPLOY_ENV test',
      )
      await refuses(
        'an extra argument',
        { input: setUpDocument(), args: ['set-up', 'again', '--database', db] },
        'give one mode and nothing else',
      )
      await refuses(
        'an unknown mode',
        { input: setUpDocument(), args: ['make', '--database', db] },
        'the mode must be set-up, recover or correct-number',
      )
      await refuses('no --database', { input: setUpDocument(), args: ['set-up'] }, '--database <name> is required')
      for (const [variable, value, text] of [
        ['CI', 'true', 'CI is set: the script never runs against nonprod or prod from a coding agent or CI'],
        ['CLAUDECODE', '1', 'CLAUDECODE is set: the script never runs against nonprod or prod'],
        ['PGSSLMODE', 'no-verify', 'PGSSLMODE must be unset or verify-full under nonprod and prod'],
      ] as const) {
        await refuses(
          `prod with ${variable}`,
          { input: setUpDocument({ environment: 'prod' }), env: { ...PROD_ENV, [variable]: value } },
          text,
        )
      }
      await refuses(
        'OWNER_BOOTSTRAP_TLS_NAME under DEPLOY_ENV test',
        { input: setUpDocument(), env: { OWNER_BOOTSTRAP_TLS_NAME: PROD_ENV.OWNER_BOOTSTRAP_TLS_NAME } },
        'OWNER_BOOTSTRAP_TLS_NAME is set: it is only for a port forward under nonprod or prod',
      )
      // IO-03: a PGSSLNEGOTIATION pg would refuse to make a client with is refused by name before
      // connecting, never left to the constructor.
      await refuses(
        'a PGSSLNEGOTIATION pg doesn’t know',
        { input: setUpDocument(), env: { PGSSLNEGOTIATION: 'bogus' } },
        'PGSSLNEGOTIATION must be unset, postgres or direct',
      )
      await refuses(
        'PGSSLNEGOTIATION direct without TLS under DEPLOY_ENV test',
        { input: setUpDocument(), env: { PGSSLNEGOTIATION: 'direct' } },
        'PGSSLNEGOTIATION is direct, which needs TLS',
      )
    },
  ],
  [
    'BSS-05 a R2 D1: a database holding the Tembusu seed is refused before any write, naming its org',
    async () => {
      const db = await copy('bss05a')
      const seed = await readFile(new URL('../../../db/seed/tembusu.sql', import.meta.url), 'utf8')
      await admin(db, async client => {
        await client.query('begin')
        await client.query('set local role hearth_owner')
        await client.query(seed)
        await client.query('commit')
      })
      const [first] = await rows<{ id: string }>(db, 'select id::text from orgs order by created_at, id limit 1')
      const before = await digest(db)
      const run = await script('set-up', db, { commit: true, input: setUpDocument() })
      expectExit(run, 1, 'the set-up over the seed')
      expectSaid(
        run,
        `This database already has organisation ${first?.id}. The set-up runs once, so nothing was written.`,
        'the set-up over the seed',
      )
      expectNothingWritten(before, await digest(db), 'the set-up over the seed')
    },
  ],
  [
    'BSS-05 b R2 PD-124: a second set-up after one committed is refused before any write, naming the first’s org',
    async () => {
      const { db, run: first } = await setUpCommitted('bss05b')
      const before = await digest(db)
      const run = await script('set-up', db, { commit: true, input: setUpDocument() })
      expectExit(run, 1, 'the second set-up')
      expectSaid(
        run,
        `This database already has organisation ${committedSetUp(first).org}. The set-up runs once, so nothing was written.`,
        'the second set-up',
      )
      expectNothingWritten(before, await digest(db), 'the second set-up')
    },
  ],
  [
    'BSS-05 c R3 PD-121: --database decides, not PGDATABASE: a database that doesn’t exist fails to connect, naming the cause',
    async () => {
      const real = await copy('bss05c')
      const run = await script('set-up', dbName('absent'), { input: setUpDocument(), env: { PGDATABASE: real } })
      expectExit(run, 2, 'the run')
      expectSaid(run, "could not connect: that database doesn't exist", 'the run')
      const [orgs] = await rows<{ n: number }>(real, 'select count(*)::int as n from orgs')
      expect(orgs?.n === 0, 'the run wrote to PGDATABASE')
    },
  ],
  [
    'BSS-05 d PD-121 PD-132: under DEPLOY_ENV prod the script asks for verified TLS itself, and a server that offers none fails to connect with its own line',
    async () => {
      const db = await copy('bss05d')
      const run = await script('recover', db, {
        input: recoverDocument({ dpo: randomUUID(), reviewOn: D60, environment: 'prod' }),
        env: PROD_ENV,
      })
      expectExit(run, 2, 'the run')
      expect(
        [
          "could not connect: the server doesn't offer TLS",
          "could not connect: the server's certificate isn't trusted",
          "could not connect: the certificate doesn't name the host you connected to",
        ].some(text => output(run).includes(text)),
        'the run didn’t print a TLS line',
      )
      expectNotSaid(run, 'connection was lost', 'the run')
      expectNotSaid(run, 'on database', 'the run')
    },
  ],
  [
    'BSS-05 e PD-123: migrations other than the checkout’s, either way, are refused by name before any write',
    async () => {
      const newest = (await checkoutMigrations()).at(-1) ?? ''
      const behind = await copy('bss05e_behind')
      await admin(behind, client => client.query('delete from public.kysely_migration where name = $1', [newest]))
      const before = await digest(behind)
      const late = await script('set-up', behind, { commit: true, input: setUpDocument() })
      expectExit(late, 2, 'a database behind the checkout')
      expectSaid(late, `This database hasn't applied ${newest}: run the deploy's migrate step first`, 'behind')
      expectNothingWritten(before, await digest(behind), 'behind')

      const ahead = await copy('bss05e_ahead')
      await admin(ahead, client =>
        client.query(
          `insert into public.kysely_migration (name, timestamp) values ('9999_not_in_this_checkout', now()::text)`,
        ),
      )
      const after = await digest(ahead)
      const early = await script('set-up', ahead, { commit: true, input: setUpDocument() })
      expectExit(early, 2, 'a database ahead of the checkout')
      expectSaid(
        early,
        "This database has applied 9999_not_in_this_checkout, which this checkout doesn't have",
        'ahead',
      )
      expectNothingWritten(after, await digest(ahead), 'ahead')
    },
  ],
  [
    'BSS-05 f PD-122: only a login of the bootstrap login’s shape may run it; the rest are refused by name, and one that can’t act as hearth_owner or signs in wrongly fails to connect',
    async () => {
      const db = await copy('bss05f')
      const before = await digest(db)
      const shaped = async (shape: string, grants: string[]) => {
        const name = `owner_bootstrap_check_${randomUUID().replaceAll('-', '').slice(0, 12)}`
        const password = randomUUID()
        await makeRole(
          [
            `create role ${name} login ${shape} password '${password}'`,
            ...grants.map(grant => grant.replace('%', name)),
          ],
          name,
        )
        return { user: name, password }
      }
      const cases: [string, { user: string; password: string }, string][] = [
        ['the superuser itself', { user: connection.user, password: connection.password }, 'the login is a superuser'],
        [
          'a login that inherits',
          await shaped('inherit nosuperuser nocreaterole nocreatedb nobypassrls', ['grant hearth_owner to %']),
          'the login inherits its roles: it must be NOINHERIT',
        ],
        [
          'a NOINHERIT login granted hearth_owner WITH INHERIT TRUE',
          await shaped('noinherit nosuperuser nocreaterole nocreatedb nobypassrls', [
            'grant hearth_owner to % with inherit true, set true',
          ]),
          "the login's hearth_owner grant must have SET and neither INHERIT nor ADMIN",
        ],
      ]
      const other = `owner_bootstrap_check_${randomUUID().replaceAll('-', '').slice(0, 12)}`
      await makeRole([`create role ${other} nologin`], other)
      cases.push([
        'a login that holds another role too',
        await shaped('noinherit nosuperuser nocreaterole nocreatedb nobypassrls', [
          'grant hearth_owner to % with inherit false, set true',
          `grant ${other} to % with inherit false, set true`,
        ]),
        'the login holds a role besides hearth_owner',
      ])
      cases.push([
        'a login that can’t act as hearth_owner',
        await shaped('noinherit nosuperuser nocreaterole nocreatedb nobypassrls', []),
        'could not connect: this login may not act as hearth_owner',
      ])
      if (login === undefined) throw new Error('no login')
      cases.push([
        'a wrong password',
        { user: login.user, password: 'not the password' },
        'could not connect: signing in to Postgres failed: check PGUSER and get a fresh IAM token',
      ])
      for (const [what, as, text] of cases) {
        const run = await script('set-up', db, { commit: true, input: setUpDocument(), login: as })
        expectExit(run, 2, what)
        expectSaid(run, text, what)
        expectNothingWritten(before, await digest(db), what)
      }
    },
  ],
  [
    'BSS-05 g R11 PD-119: a failure part-way (a planted refusal of AWS’s clearance, after Twilio’s went in) rolls the whole set-up back, and a retry then sets up',
    async () => {
      const db = await copy('bss05g')
      // The planted refusal's detail holds the number and the name, which the script must never
      // print (BSS-14; the mutation that prints an error's detail).
      await admin(db, async client => {
        await client.query(`create function public.it_refuse_aws() returns trigger language plpgsql as $$
          begin
            if new.provider = 'aws' then
              raise exception 'planted refusal' using errcode = 'P0001', detail = '${FOUNDER_E164} ${FOUNDER_NAME}';
            end if;
            return new;
          end $$`)
        // After the insert, once the table's own triggers have filled in the provider.
        await client.query(`create trigger it_refuse_aws after insert on public.transfer_clearances
          for each row execute function public.it_refuse_aws()`)
      })
      const before = await digest(db)
      const run = await script('set-up', db, { commit: true, input: setUpDocument() })
      expectExit(run, 1, 'the set-up refused part-way')
      expectSaid(run, 'Postgres refused it (SQLSTATE P0001). Nothing was written.', 'the set-up refused part-way')
      const after = await digest(db)
      expectRowsKept(before, after, 'the set-up refused part-way')
      expect(
        differing(before.sequences, after.sequences).length > 0,
        'no sequence moved, so Twilio’s clearance never ran',
      )
      await admin(db, client => client.query('drop trigger it_refuse_aws on public.transfer_clearances'))
      const retry = await script('set-up', db, { commit: true, input: setUpDocument() })
      expectExit(retry, 0, 'the retry')
    },
  ],
  [
    'BSS-05 h PD-121: a database marked hearth-env:prod is refused under DEPLOY_ENV test',
    async () => {
      const db = await copy('bss05h')
      await admin(db, client => client.query(`comment on database ${db} is 'hearth-env:prod'`))
      const before = await digest(db)
      const run = await script('set-up', db, { input: setUpDocument() })
      expectExit(run, 2, 'the run')
      expectSaid(run, "this database is marked hearth-env:prod, which isn't DEPLOY_ENV", 'the run')
      expectNothingWritten(before, await digest(db), 'the run')
    },
  ],
  [
    'BSS-05 i PD-121: a server that looks like RDS (it has rds_superuser) is refused under DEPLOY_ENV test',
    async () => {
      const db = await copy('bss05i')
      const before = await digest(db)
      await makeRole(['create role rds_superuser nologin'], 'rds_superuser')
      try {
        const run = await script('set-up', db, { input: setUpDocument() })
        expectExit(run, 2, 'the run')
        expectSaid(run, 'this is an RDS server, but DEPLOY_ENV says local or test', 'the run')
      } finally {
        await dropRole('rds_superuser')
      }
      expectNothingWritten(before, await digest(db), 'the run')
    },
  ],
  [
    'BSS-06 PD-125 T22 item 44: the start-up options bound every mode, whatever the login’s own defaults say',
    async () => {
      const db = await copy('bss06')
      if (login === undefined) throw new Error('no login')
      await admin('postgres', async client => {
        await client.query(`alter role ${login?.user} in database ${db} set transaction_timeout = '10min'`)
        await client.query(`alter role ${login?.user} in database ${db} set lock_timeout = '1min'`)
        await client.query(`alter role ${login?.user} in database ${db} set idle_in_transaction_session_timeout = 0`)
      })
      // The defaults are in force for a session without the script's options, so the case means
      // something.
      const plain = await connect(db, login)
      try {
        const { rows: found } = await plain.query<{ t: string; l: string; i: string }>(
          `select current_setting('transaction_timeout') as t, current_setting('lock_timeout') as l,
                  current_setting('idle_in_transaction_session_timeout') as i`,
        )
        expect(
          found[0]?.t === '10min' && found[0]?.l === '1min' && found[0]?.i === '0',
          'the login’s defaults aren’t in force',
        )
      } finally {
        await plain.end()
      }
      const bounds = 'bounds: transaction 30s, lock 2s, idle 5s'
      const setUp = await script('set-up', db, { input: setUpDocument() })
      expectExit(setUp, 0, 'the set-up plan')
      const recover = await script('recover', db, { input: recoverDocument({ dpo: randomUUID(), reviewOn: D60 }) })
      expectExit(recover, 1, 'the recovery plan with no org')
      const correction = await script('correct-number', db, { input: correctionDocument() })
      expectExit(correction, 1, 'the correction plan with no org')
      for (const run of [setUp, recover, correction]) {
        expect(lineOf(run, `${run.mode} (plan) on database`)?.endsWith(bounds) === true, `${run.mode}'s target line`)
      }
    },
  ],
]

// A copy of the published template with Twilio Verify withdrawn by the founder, no DPO signed in,
// and its write tracking emptied: BSS-07's arrangement, from which most recovery cases start.
async function withdrawnCopy(
  name: string,
): Promise<{ db: string; f: Founded; setUpClearance: string; version: number }> {
  const db = await copy(name, PUBLISHED)
  await withdrawTwilio(db)
  await resetTracking(db)
  const [first] = await twilioClearances(db)
  if (first === undefined) throw new Error('no Twilio clearance')
  return { db, f: await founded(db), setUpClearance: first.id, version: await latestVersion(db) }
}

// The number of the org's latest notice version (the founder's first generated one is v0).
async function latestVersion(db: string): Promise<number> {
  const [latest] = await rows<{ version: number | null }>(db, 'select max(version) as version from notice_versions')
  if (latest?.version === null || latest?.version === undefined) throw new Error(`${db} has no notice version`)
  return latest.version
}

// The lines every recovery run prints before the function decides (TECH-SPEC T22 item 69).
const inputsLine = (f: Founded, reviewOn: string, days: number, fromEntry = 'none', reason = RECOVERY_REASON) =>
  `${PREFIX}named DPO ${f.founder}; review date ${reviewOn} (${days} ${days === 1 ? 'day' : 'days'} ahead in ${ZONE}); from the DPO's record: ${fromEntry}; reason: ${[...reason].length} characters\n`
const NO_DPO_SIGNED_IN = `${PREFIX}DPOs signed in, before the re-clear's own check: 0\n`
const notClearedSince = (day: string | undefined) => `${PREFIX}Twilio Verify now: not cleared since ${day}\n`

// The run's inputs line. The script counts the days ahead from the day its transaction began in
// Singapore, which fell between the run's spawn and its exit, so the line may count from either
// day: a run that crosses midnight there counts one fewer than a case worked out before it did
// (TESTS-04).
function expectInputsLine(run: BootstrapRun, f: Founded, reviewOn: string, what: string, fromEntry?: string): void {
  const counts = new Set(
    [run.started, run.started + run.ms].map(
      at => (Date.parse(reviewOn) - Date.parse(daysAhead(0, ZONE, new Date(at)))) / 86_400_000,
    ),
  )
  expect(
    [...counts].some(days => output(run).includes(inputsLine(f, reviewOn, days, fromEntry))),
    `${what}: didn't print the inputs line for ${reviewOn}, ${[...counts].join(' or ')} days ahead`,
  )
}

// Days the script prints from rows, read from the rows rather than the check's clock, so a case
// that crosses midnight in Singapore still expects the day the row holds (TESTS-04): the day
// Twilio Verify's last clearance ended, and the day a clearance was made (undefined if it wasn't).
async function withdrawnOn(db: string): Promise<string | undefined> {
  const [found] = await rows<{ day: string | null }>(
    db,
    `select ((max(withdrawn_at) at time zone $1)::date)::text as day from transfer_clearances
     where provider = 'twilio'`,
    [ZONE],
  )
  return found?.day ?? undefined
}
async function clearedOn(db: string, clearance: string | undefined): Promise<string | undefined> {
  if (clearance === undefined) return undefined
  const [found] = await rows<{ day: string }>(
    db,
    'select ((cleared_at at time zone $2)::date)::text as day from transfer_clearances where id = $1',
    [clearance, ZONE],
  )
  return found?.day
}

// A committed re-clear's records: one new open clearance by break_glass in the founder's name, its
// audit row (the function's own) and its event, and the write set one transaction of hearth_owner's.
async function expectRecleared(
  db: string,
  run: BootstrapRun,
  f: Founded,
  expected: {
    reviewOn: string
    changed: Record<string, unknown>
    revision: string
    wasRevision: string
    ended: string
  },
): Promise<{ clearance: string }> {
  expectExit(run, 0, 'the re-clear')
  const committing = /committing the re-clear of Twilio Verify, clearance (\S+)$/.exec(
    lineOf(run, 'committing the re-clear') ?? '',
  )?.[1]
  expect(committing !== undefined, 'no committing line')
  expectSaid(
    run,
    `${PREFIX}committed: Twilio Verify cleared again by the emergency re-clear, ${committing}, review ${expected.reviewOn}\n`,
    'the re-clear',
  )
  const open = (await twilioClearances(db)).filter(c => c.withdrawn_at === null)
  expect(
    open.length === 1 &&
      open[0]?.id === committing &&
      open[0]?.cleared_via === 'break_glass' &&
      open[0]?.cleared_by === f.founder,
    `the open clearance: ${JSON.stringify(open.map(c => [c.cleared_via, c.cleared_by === f.founder]))}`,
  )
  const audit = await lastClearedAudit(db)
  expect(
    sameJson(audit?.details, {
      by: 'break_glass',
      decided_by: f.founder,
      revision: Number(expected.revision),
      was_revision: Number(expected.wasRevision),
      changed: expected.changed,
      clearance: committing,
      ended_clearance: expected.ended,
      ended_reason: 'dpo_decision',
    }) &&
      audit?.actor_id === f.hearth &&
      audit?.reason === RECOVERY_REASON,
    `the re-clear's audit row: ${JSON.stringify(audit?.details)}`,
  )
  // The printed names are the audit row's changed keys (compared, never read, by the script).
  const keys = Object.keys(expected.changed).sort()
  expectSaid(
    run,
    `${PREFIX}facts changed from the entry: ${keys.length === 0 ? 'none' : keys.join(', ')}\n`,
    'the re-clear',
  )
  const events = await rows<{ type: string }>(db, 'select type from it_events')
  expect(
    events.length === 1 && events[0]?.type === 'register.transfer_changed',
    `the re-clear's events: ${JSON.stringify(events)}`,
  )
  const actors = await rows<{ xid: string; role: string }>(db, 'select distinct xid::text, role from it_writes')
  expect(
    actors.length === 1 && actors[0]?.role === 'hearth_owner',
    'the re-clear’s writes: one transaction as hearth_owner',
  )
  return { clearance: committing ?? '' }
}

// A live session for the founder (a users row, a device and a session ending at the instant
// given), inserted as the superuser.
async function signedInFounder(db: string, f: Founded, ends: Date): Promise<{ device: string }> {
  const device = randomUUID()
  await admin(db, async client => {
    await client.query('insert into users (id, org_id) values ($1, $2)', [f.founder, f.org])
    await client.query(`insert into devices (id, org_id, user_id, label) values ($1, $2, $3, 'Phone')`, [
      device,
      f.org,
      f.founder,
    ])
    await client.query(
      `insert into sessions (org_id, user_id, device_id, token_hash, expires_at)
       values ($1, $2, $3, sha256($4::bytea), $5)`,
      [f.org, f.founder, device, Buffer.from(randomUUID()), ends],
    )
  })
  return { device }
}

const RECOVERY_CASES: Case[] = [
  [
    'BSS-07 BSC-05 T22 item 44 C0.9 OD-20 PD-77 to PD-80: the re-clear on the facts v0 states clears Twilio Verify for everyone; with the entry’s own review date the revision stays, with a new one it moves on as Hearth’s',
    async () => {
      const { db, f, setUpClearance, version } = await withdrawnCopy('bss07a')
      const entry = await twilioEntry(db)
      expect(entry?.facts.review_on === D60, `the entry's review date is ${entry?.facts.review_on}, not the set-up's`)
      const before = await digest(db)
      const plan = await script('recover', db, { input: recoverDocument({ dpo: f.founder, reviewOn: D60 }) })
      expectExit(plan, 0, 'the plan')
      expectInputsLine(plan, f, D60, 'the plan')
      expectSaid(plan, NO_DPO_SIGNED_IN, 'the plan')
      expectSaid(plan, notClearedSince(await withdrawnOn(db)), 'the plan')
      expectSaid(
        plan,
        `${PREFIX}facts: the Twilio Verify clearance version ${version} states (${setUpClearance})\n`,
        'the plan',
      )
      expectSaid(plan, `${PREFIX}facts changed from the entry: none\n`, 'the plan')
      expectSaid(plan, `${WOULD_LEAVE}${CLEARED_TEXT}\n`, 'the plan')
      expectSaid(plan, `${PREFIX}${KEPT_NOTHING}\n`, 'the plan')
      expectRowsKept(before, await digest(db), 'the plan')
      await resetTracking(db)

      const run = await script('recover', db, {
        commit: true,
        input: recoverDocument({ dpo: f.founder, reviewOn: D60 }),
      })
      const { clearance } = await expectRecleared(db, run, f, {
        reviewOn: D60,
        changed: {},
        revision: entry?.revision ?? '',
        wasRevision: entry?.revision ?? '',
        ended: setUpClearance,
      })
      const after = await twilioEntry(db)
      expect(
        after?.revision === entry?.revision && after?.updated_by === entry?.updated_by,
        'the entry’s revision or updated_by moved',
      )
      const [stamped] = await rows<{ same: boolean }>(
        db,
        `select c.facts = s.facts as same from transfer_clearances c join transfer_clearances s on s.id = $2 where c.id = $1`,
        [clearance, setUpClearance],
      )
      expect(stamped?.same === true, 'the re-clear’s facts aren’t the linked snapshot’s')
      expectSaid(run, `${PREFIX}${STATED}${CLEARED_TEXT}\n`, 'the re-clear')
      expect((await sendState(db, f)) === 'cleared', 'a later hearth_app transaction doesn’t read cleared')

      const { db: other, f: g, setUpClearance: ended } = await withdrawnCopy('bss07b')
      const was = await twilioEntry(other)
      const d30 = daysAhead(30)
      const moved = await script('recover', other, {
        commit: true,
        input: recoverDocument({ dpo: g.founder, reviewOn: d30 }),
      })
      await expectRecleared(other, moved, g, {
        reviewOn: d30,
        changed: { review_on: { to: d30, from: was?.facts.review_on } },
        revision: String(Number(was?.revision) + 1),
        wasRevision: was?.revision ?? '',
        ended,
      })
      const now = await twilioEntry(other)
      expect(
        now?.revision === String(Number(was?.revision) + 1) && now?.updated_by === g.hearth,
        'a new review date didn’t move the revision on, as Hearth’s',
      )
      expectSaid(moved, `${PREFIX}${STATED}${CLEARED_TEXT}\n`, 'the re-clear with a new review date')
      expect((await sendState(other, g)) === 'cleared', 'a new review date left Twilio Verify not cleared')
    },
  ],
  [
    'BSS-08 T22 item 44 PD-78: the snapshot the latest version links comes before the clearance that ended last',
    async () => {
      const db = await copy('bss08', PUBLISHED)
      const f = await founded(db)
      const [linked] = await twilioClearances(db)
      await recordTwilio(db, { providerRetention: 'Plover records kept for sixty days' }, true)
      await withdrawTwilio(db)
      const later = (await twilioClearances(db)).at(-1)
      expect(later !== undefined && later.id !== linked?.id, 'Save and keep cleared opened no second clearance')
      await resetTracking(db)
      const entry = await twilioEntry(db)
      const run = await script('recover', db, {
        commit: true,
        input: recoverDocument({ dpo: f.founder, reviewOn: D60 }),
      })
      expectSaid(
        run,
        `${PREFIX}facts: the Twilio Verify clearance version ${await latestVersion(db)} states (${linked?.id})\n`,
        'the re-clear',
      )
      await expectRecleared(db, run, f, {
        reviewOn: D60,
        changed: {
          provider_retention: { to: 'Plover records kept for thirty days', from: 'Plover records kept for sixty days' },
        },
        revision: String(Number(entry?.revision) + 1),
        wasRevision: entry?.revision ?? '',
        ended: later?.id ?? '',
      })
      expectSaid(run, `${PREFIX}${STATED}${CLEARED_TEXT}\n`, 'the re-clear')
    },
  ],
  [
    'BSS-09 T22 item 44 PD-59 PD-33: with no published version the re-clear takes the clearance that ended last (no_notice); a stand-in as the latest links nothing, so it falls back too (cleared)',
    async () => {
      const db = await copy('bss09a', SET_UP)
      await withdrawTwilio(db)
      await resetTracking(db)
      const f = await founded(db)
      const [ended] = await twilioClearances(db)
      const entry = await twilioEntry(db)
      const run = await script('recover', db, {
        commit: true,
        input: recoverDocument({ dpo: f.founder, reviewOn: D60 }),
      })
      expectSaid(
        run,
        `${PREFIX}facts: the Twilio Verify clearance that ended last (${ended?.id}), since no published version names one\n`,
        'the re-clear with no version',
      )
      const { clearance } = await expectRecleared(db, run, f, {
        reviewOn: D60,
        changed: {},
        revision: entry?.revision ?? '',
        wasRevision: entry?.revision ?? '',
        ended: ended?.id ?? '',
      })
      const [same] = await rows<{ same: boolean }>(
        db,
        'select c.facts = s.facts as same from transfer_clearances c join transfer_clearances s on s.id = $2 where c.id = $1',
        [clearance, ended?.id],
      )
      expect(same?.same === true, 'the re-clear’s facts aren’t the set-up clearance’s')
      expectSaid(run, `${PREFIX}${STATED}${NO_NOTICE_TEXT}\n`, 'the re-clear with no version')

      const standIn = await copy('bss09b', SET_UP)
      const g = await founded(standIn)
      await admin(standIn, client =>
        client.query('insert into notice_versions (org_id, version, body, published_by) values ($1, 0, $2, $3)', [
          g.org,
          'Check stand-in for the privacy notice, version 0.',
          g.hearth,
        ]),
      )
      await withdrawTwilio(standIn)
      const [first] = await twilioClearances(standIn)
      const fell = await script('recover', standIn, {
        commit: true,
        input: recoverDocument({ dpo: g.founder, reviewOn: D60 }),
      })
      expectExit(fell, 0, 'the re-clear under a stand-in')
      expectSaid(
        fell,
        `${PREFIX}facts: the Twilio Verify clearance that ended last (${first?.id}), since no published version names one\n`,
        'the re-clear under a stand-in',
      )
      expectSaid(fell, `${PREFIX}${STATED}${CLEARED_TEXT}\n`, 'the re-clear under a stand-in')
    },
  ],
  [
    'BSS-10 T22 item 44: a stated fact the DPO decided changed comes from their record, in either spelling, and nothing else does',
    async () => {
      const sixty = 'Plover records kept for sixty days'
      const { db, f } = await withdrawnCopy('bss10a')
      await recordTwilio(db, { providerRetention: sixty }, false)
      await resetTracking(db)
      const entry = await twilioEntry(db)
      expect(entry?.updated_by === f.founder, 'the DPO’s record didn’t move the entry to their revision')
      const run = await script('recover', db, {
        commit: true,
        input: recoverDocument({ dpo: f.founder, reviewOn: D60, fromEntry: ['provider_retention'] }),
      })
      expectInputsLine(run, f, D60, 'the re-clear', 'provider_retention')
      expect(
        lineOf(run, `facts: the Twilio Verify clearance version ${await latestVersion(db)} states`)?.endsWith(
          "; from the DPO's record: provider_retention",
        ) === true,
        'the facts line',
      )
      const [ended] = (await twilioClearances(db)).filter(c => c.withdrawn_at !== null)
      const { clearance } = await expectRecleared(db, run, f, {
        reviewOn: D60,
        changed: {},
        revision: entry?.revision ?? '',
        wasRevision: entry?.revision ?? '',
        ended: ended?.id ?? '',
      })
      const after = await twilioEntry(db)
      expect(after?.revision === entry?.revision && after?.updated_by === f.founder, 'the revision isn’t the DPO’s')
      const [same] = await rows<{ same: boolean }>(
        db,
        `select c.facts = public.transfer_register_facts(t) as same
         from transfer_clearances c join transfer_register t on t.id = c.entry_id where c.id = $1`,
        [clearance],
      )
      expect(same?.same === true, 'the clearance’s facts aren’t the entry’s')
      expectSaid(run, `${PREFIX}${STATED}${UNSTATED_TEXT}\n`, 'the re-clear')

      const other = await withdrawnCopy('bss10b')
      await recordTwilio(other.db, { providerRetention: sixty, countriesConfirmed: 'Plover agreement, annex 3' }, false)
      await resetTracking(other.db)
      const was = await twilioEntry(other.db)
      const [gone] = (await twilioClearances(other.db)).filter(c => c.withdrawn_at !== null)
      const both = await script('recover', other.db, {
        commit: true,
        input: recoverDocument({ dpo: other.f.founder, reviewOn: D60, fromEntry: ['providerRetention'] }),
      })
      await expectRecleared(other.db, both, other.f, {
        reviewOn: D60,
        changed: { countries_confirmed: { to: 'Plover agreement, annex 1', from: 'Plover agreement, annex 3' } },
        revision: String(Number(was?.revision) + 1),
        wasRevision: was?.revision ?? '',
        ended: gone?.id ?? '',
      })
      const now = await twilioEntry(other.db)
      expect(now?.updated_by === other.f.hearth, 'an unstated fact put back didn’t move the revision on as Hearth’s')

      const port = await closedPort()
      const refused = await script('recover', other.db, {
        port,
        input: recoverDocument({ dpo: other.f.founder, reviewOn: D60, fromEntry: ['countries_confirmed'] }),
      })
      expectExit(refused, 2, 'an unstated fact in fromEntry')
      expectSaid(refused, 'fromEntry.0: not a fact the notice states', 'an unstated fact in fromEntry')
    },
  ],
  [
    'BSS-11 BSC-04: the re-clear refuses as the function does, writing nothing, after printing the DPOs signed in and Twilio Verify now',
    async () => {
      // A live DPO session, ending on the hour three days from now.
      const ends = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 + 3 * 86_400_000)
      const live = await withdrawnCopy('bss11_live')
      await signedInFounder(live.db, live.f, ends)
      const before = await digest(live.db)
      const refused = await script('recover', live.db, {
        commit: true,
        input: recoverDocument({ dpo: live.f.founder, reviewOn: D60 }),
      })
      expectExit(refused, 1, 'a re-clear with a DPO signed in')
      expectSaid(
        refused,
        `${PREFIX}DPOs signed in, before the re-clear's own check: 1, the last session ending ${clock(ends, ZONE)} ${ZONE} (${clock(ends, 'UTC')} UTC) (the re-clear refuses until then, unless that session is signed out)\n`,
        'a re-clear with a DPO signed in',
      )
      expectSaid(refused, notClearedSince(await withdrawnOn(live.db)), 'a re-clear with a DPO signed in')
      expectSaid(refused, `${SIGNED_IN} (SQLSTATE HF006). Nothing was written.`, 'a re-clear with a DPO signed in')
      expect(
        output(refused).indexOf('Twilio Verify now') < output(refused).indexOf(SIGNED_IN),
        'the lines came after the refusal',
      )
      expectNothingWritten(before, await digest(live.db), 'a re-clear with a DPO signed in')

      const out = await withdrawnCopy('bss11_out')
      const { device } = await signedInFounder(out.db, out.f, ends)
      await admin(out.db, client =>
        client.query('update devices set signed_out_at = now(), signed_out_by = $2 where id = $1', [
          device,
          out.f.founder,
        ]),
      )
      const ahead = await script('recover', out.db, {
        commit: true,
        input: recoverDocument({ dpo: out.f.founder, reviewOn: D60 }),
      })
      expectExit(ahead, 0, 'a re-clear once the DPO’s device is signed out')
      expectSaid(ahead, NO_DPO_SIGNED_IN, 'a re-clear once the DPO’s device is signed out')

      const cleared = await copy('bss11_cleared', PUBLISHED)
      const c = await founded(cleared)
      const [open] = await twilioClearances(cleared)
      const already = await script('recover', cleared, {
        commit: true,
        input: recoverDocument({ dpo: c.founder, reviewOn: D60 }),
      })
      expectExit(already, 1, 'a re-clear while Twilio Verify is cleared')
      expectSaid(
        already,
        `${PREFIX}Twilio Verify now: cleared, clearance ${open?.id}, by bootstrap, ${await clearedOn(cleared, open?.id)}\n`,
        'a re-clear while Twilio Verify is cleared',
      )
      expectSaid(already, CLEARED_ALREADY, 'a re-clear while Twilio Verify is cleared')

      // An org a fixture built, its DPO named, Twilio Verify never cleared.
      const never = await copy('bss11_never')
      const org = randomUUID()
      const hearth = randomUUID()
      const dpo = randomUUID()
      await admin(never, async client => {
        await client.query('begin')
        await client.query('set local role hearth_owner')
        await client.query(`insert into orgs (id, name) values ($1, 'Check org with no clearance')`, [org])
        await client.query(
          `insert into principals (id, org_id, kind, system_key) values ($1, $2, 'system', 'hearth')`,
          [hearth, org],
        )
        await client.query(`insert into principals (id, org_id, kind) values ($1, $2, 'human')`, [dpo, org])
        await client.query(`insert into people (id, org_id, full_name, created_by) values ($1, $2, 'Check DPO', $3)`, [
          dpo,
          org,
          hearth,
        ])
        await client.query(
          `insert into role_assignments (org_id, person_id, role, created_by) values ($1, $2, 'dpo', $3)`,
          [org, dpo, hearth],
        )
        await client.query('commit')
      })
      const first = await script('recover', never, { commit: true, input: recoverDocument({ dpo, reviewOn: D60 }) })
      expectExit(first, 1, 'a re-clear where Twilio Verify was never cleared')
      expectSaid(
        first,
        `${PREFIX}Twilio Verify now: never cleared\n`,
        'a re-clear where Twilio Verify was never cleared',
      )
      expectSaid(first, NEVER_CLEARED, 'a re-clear where Twilio Verify was never cleared')

      // The review date, and the DPO named: each refusal writes nothing, then 90 days goes ahead.
      const dates = await withdrawnCopy('bss11_dates')
      const plain = randomUUID()
      const leaver = randomUUID()
      await admin(dates.db, async client => {
        for (const id of [plain, leaver]) {
          await client.query(`insert into principals (id, org_id, kind) values ($1, $2, 'human')`, [id, dates.f.org])
          await client.query(
            `insert into people (id, org_id, full_name, created_by) values ($1, $2, 'Check person', $3)`,
            [id, dates.f.org, dates.f.hearth],
          )
        }
        await client.query(
          `insert into role_assignments (org_id, person_id, role, created_by) values ($1, $2, 'dpo', $3)`,
          [dates.f.org, leaver, dates.f.hearth],
        )
        await client.query('update people set deactivated_at = now(), deactivated_by = $2 where id = $1', [
          leaver,
          dates.f.hearth,
        ])
      })
      const kept = await digest(dates.db)
      for (const [what, document, text] of [
        ['91 days ahead', recoverDocument({ dpo: dates.f.founder, reviewOn: daysAhead(91) }), AT_MOST_90],
        ['today', recoverDocument({ dpo: dates.f.founder, reviewOn: daysAhead(0) }), AFTER_TODAY],
        ['someone without the role', recoverDocument({ dpo: plain, reviewOn: D60 }), NOT_DPO],
        ['a leaver', recoverDocument({ dpo: leaver, reviewOn: D60 }), NOT_DPO],
        ['nobody', recoverDocument({ dpo: randomUUID(), reviewOn: D60 }), NOT_DPO],
      ] as const) {
        const run = await script('recover', dates.db, { commit: true, input: document })
        expectExit(run, 1, `a re-clear naming ${what}`)
        expectSaid(run, text, `a re-clear naming ${what}`)
        expectRowsKept(kept, await digest(dates.db), `a re-clear naming ${what}`)
      }
      const ninety = await script('recover', dates.db, {
        commit: true,
        input: recoverDocument({ dpo: dates.f.founder, reviewOn: daysAhead(90) }),
      })
      expectExit(ninety, 0, 'a re-clear 90 days ahead')

      const two = await withdrawnCopy('bss11_two')
      await admin(two.db, client =>
        client.query(`insert into orgs (id, name) values ($1, 'Check second org')`, [randomUUID()]),
      )
      const twice = await digest(two.db)
      const orgs = await script('recover', two.db, {
        commit: true,
        input: recoverDocument({ dpo: two.f.founder, reviewOn: D60 }),
      })
      expectExit(orgs, 1, 'a re-clear with two orgs')
      expectSaid(
        orgs,
        'This database has more than one organisation: stop, and tell the DPO and the Owners.',
        'two orgs',
      )
      expectNothingWritten(twice, await digest(two.db), 'a re-clear with two orgs')
    },
  ],
  [
    'BSS-12 T22 item 44: the re-clear waits at most 2 s for a lock (a table R7 reads, held), then exits 3, writing nothing',
    async () => {
      const { db, f } = await withdrawnCopy('bss12')
      const before = await digest(db)
      const holder = await connect(db)
      try {
        await holder.query('begin')
        await holder.query('lock table public.notice_version_providers in access exclusive mode')
        const run = await script('recover', db, {
          commit: true,
          input: recoverDocument({ dpo: f.founder, reviewOn: D60 }),
        })
        expectExit(run, 3, 'the re-clear behind a held lock')
        expectSaid(run, LOCK_BUSY, 'the re-clear behind a held lock')
        const target = run.lines.find(line => line.text.startsWith(`${PREFIX}recover (commit) on database`))
        const waited = run.ms - (target?.at ?? 0)
        expect(target !== undefined && waited >= 1900 && waited <= 3500, `it waited ${waited} ms, not 2 to 3.5 s`)
      } finally {
        await holder.query('rollback')
        await holder.end()
      }
      expectNothingWritten(before, await digest(db), 'the re-clear behind a held lock')
    },
  ],
  [
    'BSS-13 PD-129 OD-29: the correction replaces the number only before anyone has signed in, writing no event, and refuses otherwise, writing nothing',
    async () => {
      const db = await copy('bss13', SET_UP)
      await resetTracking(db)
      const f = await founded(db)
      const before = await digest(db)
      const plan = await script('correct-number', db, { input: correctionDocument() })
      expectExit(plan, 0, 'the correction’s plan')
      expectSaid(plan, `${PREFIX}founder's number: ${maskNumber(CORRECTED_E164)}\n`, 'the correction’s plan')
      expectSaid(plan, `${PREFIX}${KEPT_NOTHING}\n`, 'the correction’s plan')
      expectRowsKept(before, await digest(db), 'the correction’s plan')

      const run = await script('correct-number', db, { commit: true, input: correctionDocument() })
      expectExit(run, 0, 'the correction')
      expectSaid(run, `${PREFIX}committing the correction\n`, 'the correction')
      expectSaid(run, `${PREFIX}committed: the founder's number is corrected\n`, 'the correction')
      const numbers = await rows<{
        id: string
        e164: string
        removed_by: string | null
        created_by: string
        current: boolean
      }>(
        db,
        'select id::text, e164, removed_by::text, created_by::text, removed_at is null as current from phone_numbers order by created_at',
      )
      const [old, now] = numbers
      expect(
        numbers.length === 2 &&
          old?.id === f.phone &&
          old.e164 === FOUNDER_E164 &&
          !old.current &&
          old.removed_by === f.hearth &&
          now !== undefined &&
          now.e164 === normalisePhone(CORRECTED_NUMBER) &&
          now.current &&
          now.created_by === f.hearth,
        'the numbers after the correction',
      )
      const audit = await rows<{ ok: boolean }>(
        db,
        `select (actor_id = $1 and target_type = 'person' and target_id = $2 and reason = $3
                 and details = jsonb_build_object('by', 'bootstrap', 'from', $4::uuid, 'to', $5::uuid)) as ok
         from audit_events where action = 'bootstrap.correct_number'`,
        [f.hearth, f.founder, CORRECTION_REASON, f.phone, now?.id],
      )
      expect(audit.length === 1 && audit[0]?.ok === true, 'the correction’s audit row')
      const [events] = await rows<{ n: number }>(db, 'select count(*)::int as n from it_events')
      expect(events?.n === 0, 'the correction appended an event')
      await asServer(db, async app => {
        const found = await personByPhone(app, CORRECTED_E164)
        expect(
          found.length === 1 && found[0]?.personId === f.founder,
          'personByPhone() doesn’t find the founder by the new number',
        )
        expect(
          (await personByPhone(app, FOUNDER_E164)).length === 0,
          'personByPhone() still finds someone by the old number',
        )
      })
      const kept = await digest(db)
      const again = await script('correct-number', db, { commit: true, input: correctionDocument() })
      expectExit(again, 1, 'a retry')
      expectSaid(again, "The founder's number is already that one. Nothing to correct.", 'a retry')
      expectNothingWritten(kept, await digest(db), 'a retry')

      const refusals: [string, (copyDb: string, g: Founded) => Promise<void>, string][] = [
        ['the same number', async () => {}, "The founder's number is already that one."],
        [
          'a users row',
          (copyDb, g) =>
            admin(
              copyDb,
              async client =>
                void (await client.query('insert into users (id, org_id) values ($1, $2)', [g.founder, g.org])),
            ),
          "The founder has signed in, so their number can't be corrected here. C0.16's phone change does it (ACC-06).",
        ],
        [
          'a stand-in version',
          (copyDb, g) =>
            admin(copyDb, async client => {
              await client.query(
                'insert into notice_versions (org_id, version, body, published_by) values ($1, 0, $2, $3)',
                [g.org, 'Check stand-in for the privacy notice, version 0.', g.hearth],
              )
            }),
          "The first version of the notice is published, so the set-up's number can't be corrected here.",
        ],
        [
          'a second person',
          (copyDb, g) =>
            admin(copyDb, async client => {
              const id = randomUUID()
              await client.query(`insert into principals (id, org_id, kind) values ($1, $2, 'human')`, [id, g.org])
              await client.query(
                `insert into people (id, org_id, full_name, created_by) values ($1, $2, 'Check person', $3)`,
                [id, g.org, g.hearth],
              )
            }),
          "Someone other than the founder is on the roster, so the set-up's number can't be corrected here.",
        ],
      ]
      for (const [index, [what, arrange, text]] of refusals.entries()) {
        const copyDb = await copy(`bss13_${index}`, SET_UP)
        const g = await founded(copyDb)
        await arrange(copyDb, g)
        const was = await digest(copyDb)
        const refused = await script('correct-number', copyDb, {
          commit: true,
          input: correctionDocument(what === 'the same number' ? { number: FOUNDER_NUMBER } : {}),
        })
        expectExit(refused, 1, `the correction with ${what}`)
        expectSaid(refused, text, `the correction with ${what}`)
        expectNothingWritten(was, await digest(copyDb), `the correction with ${what}`)
      }
    },
  ],
]

// Every way the founder's number (or the corrected one) could be written out: E.164, its digits,
// the digits after the country code, the national form, formatE164()'s groups and the typed form.
function numberForms(e164: string, typed: string): string[] {
  const digits = e164.slice(1)
  const local = digits.slice(2)
  return [e164, digits, local, `0${local}`, `0${local.slice(0, 4)} ${local.slice(4)}`, formatE164(e164), typed]
}

const SWEEP_CASES: Case[] = [
  [
    'BSS-14 R1 PD-131: no input value reaches any output, and the name and number are stored only where they belong',
    async () => {
      // The database part first, so its runs are swept too: a set-up and a correction committed.
      const { db } = await setUpCommitted('bss14')
      const corrected = await script('correct-number', db, { commit: true, input: correctionDocument() })
      expectExit(corrected, 0, 'the correction')
      const tables = await rows<{ name: string }>(
        db,
        `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition order by 1`,
      )
      const stored = [
        FOUNDER_NAME,
        ...numberForms(FOUNDER_E164, FOUNDER_NUMBER),
        ...numberForms(CORRECTED_E164, CORRECTED_NUMBER),
      ]
      for (const { name } of tables) {
        // people.full_name and phone_numbers.e164 are where they belong; every other column of every
        // table (audit rows, the outbox, the registers, the clearances, the tracking) holds neither.
        const leave = name === 'people' ? 'full_name' : name === 'phone_numbers' ? 'e164' : ''
        const found = await rows<{ row: string }>(
          db,
          `select (to_jsonb(t) - $1::text)::text as row from public."${name}" t`,
          [leave],
        )
        for (const { row } of found) {
          for (const value of stored) expect(!row.includes(value), `${name} holds the founder’s name or number`)
        }
      }

      const secrets = [
        FOUNDER_NAME,
        'Wren',
        ...numberForms(FOUNDER_E164, FOUNDER_NUMBER),
        ...numberForms(CORRECTED_E164, CORRECTED_NUMBER),
        SET_UP_REASON,
        RECOVERY_REASON,
        CORRECTION_REASON,
        ...FACT_TEXTS,
        'Plover',
        ...(login === undefined ? [] : [login.password]),
      ]
      const masked = /\+\d{1,3} x+\d{2}/
      for (const { name, run } of runs) {
        const text = output(run)
        for (const secret of secrets) {
          expect(
            !text.includes(secret),
            `a run in "${name.slice(0, 6)}" printed an input value (${secret.length} characters)`,
          )
        }
        for (const line of text.split('\n')) {
          if (masked.test(line)) {
            expect(
              line.startsWith(`${PREFIX}founder's number: `),
              `a run in "${name.slice(0, 6)}" printed a masked number elsewhere`,
            )
          }
        }
      }
      expect(runs.length > 1, 'no run to sweep')
    },
  ],
]

// Ends the script's backend in the database (its connection lost while committing).
async function terminate(db: string): Promise<void> {
  await admin('postgres', client =>
    client.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and application_name = $2',
      [db, BOOTSTRAP_APPLICATION],
    ),
  )
}

// A commit made slow (a deferred trigger that sleeps at COMMIT, planted as the superuser), so a
// backend ended on the committing line is ended while the COMMIT is still running.
async function slowCommit(db: string, table: 'orgs' | 'transfer_clearances'): Promise<() => Promise<void>> {
  await admin(db, async client => {
    await client.query(`create or replace function public.it_slow_commit() returns trigger language plpgsql as $$
      begin perform pg_catalog.pg_sleep(5); return null; end $$`)
    await client.query(`create constraint trigger it_slow_commit after insert on public.${table}
      deferrable initially deferred for each row execute function public.it_slow_commit()`)
  })
  return () => admin(db, async client => void (await client.query(`drop trigger it_slow_commit on public.${table}`)))
}

// Runs the script and ends its backend as soon as it prints its committing line.
async function lostAtCommit(mode: BootstrapMode, db: string, input: unknown): Promise<BootstrapRun> {
  let ended: Promise<void> | undefined
  const run = await script(mode, db, {
    commit: true,
    input,
    onLine: line => {
      if (line.startsWith(`${PREFIX}committing`)) ended ??= terminate(db)
    },
  })
  await ended
  return run
}

const LOST_CASES: Case[] = [
  [
    'BSS-15 R9 PD-132: a connection lost at the commit tells the truth: exit 4 (or 0), and the same command run again says which',
    async () => {
      // The set-up, whichever way the race falls.
      const raced = await copy('bss15_raced')
      const first = await lostAtCommit('set-up', raced, setUpDocument())
      const org = /committing organisation (\S+)$/.exec(lineOf(first, 'committing organisation') ?? '')?.[1]
      expect(org !== undefined && (first.status === 4 || first.status === 0), `the set-up exited ${first.status}`)
      if (first.status === 4) {
        expectSaid(
          first,
          `the connection was lost while committing organisation ${org}, so it may or may not have committed.`,
          'lost',
        )
      }
      const [{ n: kept } = { n: -1 }] = await rows<{ n: number }>(
        raced,
        'select count(*)::int as n from orgs where id = $1',
        [org],
      )
      const again = await script('set-up', raced, { commit: true, input: setUpDocument() })
      if (kept === 1) {
        expectExit(again, 1, 'the rerun after a commit that went through')
        expectSaid(
          again,
          `This database already has organisation ${org}.`,
          'the rerun after a commit that went through',
        )
      } else {
        expectExit(again, 0, 'the rerun after a commit that didn’t')
      }
      const [orgs] = await rows<{ n: number }>(raced, 'select count(*)::int as n from orgs')
      expect(orgs?.n === 1, `${orgs?.n} orgs after the rerun`)

      // The set-up, its COMMIT held long enough to be cut: exit 4, nothing committed, and the rerun
      // sets up.
      const cut = await copy('bss15_cut')
      const undo = await slowCommit(cut, 'orgs')
      const lost = await lostAtCommit('set-up', cut, setUpDocument())
      expectExit(lost, 4, 'the set-up cut at its commit')
      const cutOrg = /committing organisation (\S+)$/.exec(lineOf(lost, 'committing organisation') ?? '')?.[1]
      expectSaid(
        lost,
        `the connection was lost while committing organisation ${cutOrg}, so it may or may not have committed. Run the same command again`,
        'the set-up cut at its commit',
      )
      await undo()
      const [none] = await rows<{ n: number }>(cut, 'select count(*)::int as n from orgs')
      expect(none?.n === 0, 'a cut commit committed')
      expectExit(
        await script('set-up', cut, { commit: true, input: setUpDocument() }),
        0,
        'the rerun after a cut commit',
      )

      // The re-clear, whichever way the race falls: the plan's Twilio Verify now line says which.
      const recovered = await withdrawnCopy('bss15_reclear')
      const document = recoverDocument({ dpo: recovered.f.founder, reviewOn: D60 })
      const once = await lostAtCommit('recover', recovered.db, document)
      const clearance = /clearance (\S+)$/.exec(lineOf(once, 'committing the re-clear') ?? '')?.[1]
      expect(clearance !== undefined && (once.status === 4 || once.status === 0), `the re-clear exited ${once.status}`)
      if (once.status === 4) {
        expectSaid(
          once,
          `the connection was lost while committing the re-clear (clearance ${clearance})`,
          'the lost re-clear',
        )
      }
      const plan = await script('recover', recovered.db, { input: document })
      // Which way it fell is the database's to say, and the plan must agree.
      const committedOn = await clearedOn(recovered.db, clearance)
      if (committedOn !== undefined) {
        expectSaid(
          plan,
          `Twilio Verify now: cleared, clearance ${clearance}, by break_glass, ${committedOn}`,
          'the plan after a re-clear that went through',
        )
        expectExit(plan, 1, 'the plan after a re-clear that went through')
        expectSaid(plan, CLEARED_ALREADY, 'the plan after a re-clear that went through')
      } else {
        expectSaid(
          plan,
          notClearedSince(await withdrawnOn(recovered.db)),
          'the plan after a re-clear that didn’t go through',
        )
        expectExit(plan, 0, 'the plan after a re-clear that didn’t go through')
        expectExit(
          await script('recover', recovered.db, { commit: true, input: document }),
          0,
          'the re-clear run again',
        )
      }

      // The re-clear cut at its commit: exit 4 naming the clearance, the plan shows it isn't the
      // open one, and the same command commits.
      const severed = await withdrawnCopy('bss15_cut_reclear')
      const restore = await slowCommit(severed.db, 'transfer_clearances')
      const again2 = recoverDocument({ dpo: severed.f.founder, reviewOn: D60 })
      const cutRun = await lostAtCommit('recover', severed.db, again2)
      expectExit(cutRun, 4, 'the re-clear cut at its commit')
      const named = /clearance (\S+)$/.exec(lineOf(cutRun, 'committing the re-clear') ?? '')?.[1]
      expectSaid(
        cutRun,
        `the connection was lost while committing the re-clear (clearance ${named}), so it may or may not have committed. Run the plan (the same command without --commit): if its "Twilio Verify now" line names clearance ${named}, this run committed.`,
        'the re-clear cut at its commit',
      )
      await restore()
      const look = await script('recover', severed.db, { input: again2 })
      expectExit(look, 0, 'the plan after a cut re-clear')
      expectSaid(look, notClearedSince(await withdrawnOn(severed.db)), 'the plan after a cut re-clear')
      expectExit(
        await script('recover', severed.db, { commit: true, input: again2 }),
        0,
        'the re-clear after a cut one',
      )
    },
  ],
  [
    'BSS-16 R4 PD-125 PD-77: a database default for the emergency marker can’t make a set-up a re-clear',
    async () => {
      const db = await copy('bss16')
      await admin(db, client => client.query(`alter database ${db} set hearth.break_glass = 'twilio_reclear'`))
      if (login === undefined) throw new Error('no login')
      const plain = await connect(db, login)
      try {
        const { rows: found } = await plain.query<{ v: string }>("select current_setting('hearth.break_glass') as v")
        expect(found[0]?.v === 'twilio_reclear', 'the database default isn’t in force')
      } finally {
        await plain.end()
      }
      const run = await script('set-up', db, { commit: true, input: setUpDocument() })
      expectExit(run, 0, 'the set-up under the default')
      const vias = await rows<{ cleared_via: string }>(
        db,
        'select cleared_via from transfer_clearances order by provider',
      )
      expect(
        vias.length === 2 && vias.every(row => row.cleared_via === 'bootstrap'),
        'a clearance isn’t the bootstrap’s',
      )
      const by = await rows<{ by: string }>(
        db,
        `select details ->> 'by' as by from audit_events where action = 'register.transfer_cleared'`,
      )
      expect(by.length === 2 && by.every(row => row.by === 'bootstrap'), 'an audit row isn’t the bootstrap’s')
    },
  ],
]

// --- The races ----------------------------------------------------------------------------------

// What a set-up left: orgs, Hearth principals, people, current numbers and open clearances per
// provider.
async function setUpCounts(db: string) {
  const [counts] = await rows<{
    orgs: number
    hearths: number
    people: number
    numbers: number
    twilio: number
    aws: number
  }>(
    db,
    `select (select count(*)::int from orgs) as orgs,
            (select count(*)::int from principals where kind = 'system' and system_key = 'hearth') as hearths,
            (select count(*)::int from people) as people,
            (select count(*)::int from phone_numbers where removed_at is null) as numbers,
            (select count(*)::int from transfer_clearances where provider = 'twilio' and withdrawn_at is null) as twilio,
            (select count(*)::int from transfer_clearances where provider = 'aws' and withdrawn_at is null) as aws`,
  )
  return counts
}

// Two committing set-ups, one wins, the other is refused naming the winner's org.
function oneWon(a: BootstrapRun, b: BootstrapRun, what: string): void {
  const [won, lost] = a.status === 0 ? [a, b] : [b, a]
  expectExit(won, 0, `${what}: the winner`)
  expectExit(lost, 1, `${what}: the other`)
  expectSaid(lost, `This database already has organisation ${committedSetUp(won).org}.`, `${what}: the other`)
}

const ONE_OF_EACH = { orgs: 1, hearths: 1, people: 1, numbers: 1, twilio: 1, aws: 1 }

const RACE_CASES: Case[] = [
  [
    'BSR-01 R2 PD-124: two set-ups at once leave one org; the other is refused, naming it',
    async () => {
      const db = await copy('bsr01')
      const holder = await connect(db)
      const watcher = await connect('postgres')
      try {
        await holder.query("select pg_advisory_lock(hashtextextended('hearth.owner_bootstrap', 0))")
        const a = script('set-up', db, { commit: true, input: setUpDocument() })
        const b = script('set-up', db, { commit: true, input: setUpDocument() })
        await until(
          async () => (await waiting(watcher, db, { script: true, event: 'advisory' })).length >= 1,
          'one waiting',
        )
        await until(
          async () => (await waiting(watcher, db, { script: true, event: 'advisory' })).length === 2,
          'both waiting on the bootstrap’s lock',
          1500,
        )
        await holder.query("select pg_advisory_unlock(hashtextextended('hearth.owner_bootstrap', 0))")
        oneWon(await a, await b, 'two set-ups queued')
      } finally {
        await holder.end()
        await watcher.end()
      }
      expect(sameJson(await setUpCounts(db), ONE_OF_EACH), 'two set-ups queued left more than one of each')

      const free = await copy('bsr01_free')
      const [c, d] = await Promise.all([
        script('set-up', free, { commit: true, input: setUpDocument() }),
        script('set-up', free, { commit: true, input: setUpDocument() }),
      ])
      oneWon(c, d, 'two set-ups started together')
      expect(sameJson(await setUpCounts(free), ONE_OF_EACH), 'two set-ups together left more than one of each')
    },
  ],
  [
    'BSR-02 PD-124: a plan and a commit queued, the plan first: it rolls back, and the commit then sets up',
    async () => {
      const db = await copy('bsr02')
      const holder = await connect(db)
      const watcher = await connect('postgres')
      let plan: Promise<BootstrapRun> | undefined
      let commit: Promise<BootstrapRun> | undefined
      try {
        await holder.query("select pg_advisory_lock(hashtextextended('hearth.owner_bootstrap', 0))")
        plan = script('set-up', db, { input: setUpDocument() })
        await until(
          async () => (await waiting(watcher, db, { script: true, event: 'advisory' })).length === 1,
          'the plan waiting',
        )
        commit = script('set-up', db, { commit: true, input: setUpDocument() })
        await until(
          async () => (await waiting(watcher, db, { script: true, event: 'advisory' })).length === 2,
          'both waiting',
          1500,
        )
        await holder.query("select pg_advisory_unlock(hashtextextended('hearth.owner_bootstrap', 0))")
      } finally {
        await holder.end()
        await watcher.end()
      }
      const planned = await plan
      const committed = await commit
      expectExit(planned, 0, 'the plan')
      expectSaid(planned, KEPT_NOTHING, 'the plan')
      expectExit(committed, 0, 'the commit')
      const [only] = await rows<{ id: string }>(db, 'select id::text from orgs')
      expect(only?.id === committedSetUp(committed).org, 'the org isn’t the commit’s')
    },
  ],
  [
    'BSR-03 PD-129 CLAUDE.md lock order: a correction against the founder’s PIN step, each order, the real script held only by a lock the check takes',
    async () => {
      // The step as the api's setPin() makes it, as hearth_app acting as Hearth (no session yet):
      // the person FOR SHARE, the number FOR SHARE, the account, a device and a session. Answers
      // whether it issued them (it doesn't once the number is no longer theirs).
      const pinStep = async (client: Client, f: Founded): Promise<boolean> => {
        await client.query('begin')
        await client.query('set local role hearth_app')
        await client.query(
          "select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true), set_config('lock_timeout', '10s', true)",
          [f.org, f.hearth],
        )
        await client.query('select 1 from people where org_id = $1 and id = $2 and deactivated_at is null for share', [
          f.org,
          f.founder,
        ])
        const number = await client.query(
          'select 1 from phone_numbers where org_id = $1 and id = $2 and person_id = $3 and removed_at is null for share',
          [f.org, f.phone, f.founder],
        )
        if (number.rowCount !== 1) {
          await client.query('rollback')
          return false
        }
        await client.query('insert into users (id, org_id) values ($1, $2)', [f.founder, f.org])
        const device = randomUUID()
        await client.query(`insert into devices (id, org_id, user_id, label) values ($1, $2, $3, 'Phone')`, [
          device,
          f.org,
          f.founder,
        ])
        await client.query(
          `insert into sessions (org_id, user_id, device_id, token_hash, expires_at)
           values ($1, $2, $3, sha256($4::bytea), now() + interval '168 hours')`,
          [f.org, f.founder, device, Buffer.from(randomUUID())],
        )
        return true
      }

      // The step first, left open: the correction waits on the person row, then sees the account.
      const db = await copy('bsr03_step', SET_UP)
      const f = await founded(db)
      const step = await connect(db)
      const watcher = await connect('postgres')
      try {
        expect(await pinStep(step, f), 'the step issued nothing')
        const correction = script('correct-number', db, { commit: true, input: correctionDocument() })
        // From the spawn, so the window covers the child's cold start: the script's 2 s lock bound
        // starts only once it waits, and the step commits as soon as it is seen waiting (CI-02).
        await until(async () => (await waiting(watcher, db, { script: true })).length === 1, 'the correction waiting')
        await step.query('commit')
        const run = await correction
        expectExit(run, 1, 'the correction after the step')
        expectSaid(
          run,
          "The founder has signed in, so their number can't be corrected here.",
          'the correction after the step',
        )
        const numbers = await rows<{ id: string }>(db, 'select id::text from phone_numbers where removed_at is null')
        expect(numbers.length === 1 && numbers[0]?.id === f.phone, 'the correction changed the number')
      } finally {
        await step.end()
        await watcher.end()
      }

      // The correction first, held at its audit row (C11) after replacing the number: the step and
      // the pre-org lookup of the old number both wait, and once it commits the step finds the
      // number gone and issues nothing, and the lookup finds no one.
      const other = await copy('bsr03_correction', SET_UP)
      const g = await founded(other)
      const holder = await connect(other)
      const later = await connect(other)
      const look = await connect('postgres')
      try {
        await holder.query('begin')
        await holder.query('lock table public.audit_events in share mode')
        const correction = script('correct-number', other, { commit: true, input: correctionDocument() })
        await until(
          async () => (await waiting(look, other, { script: true, event: 'relation' })).length === 1,
          'the correction held at its audit row',
        )
        const stepPid = await pidOf(later)
        // Each settled where it is made, as BSR-04's sign-in is: if a wait below throws, finally ends
        // the connections under them, and a rejection nothing awaits would end the process before
        // the clean-up (CI-01).
        const issued = pinStep(later, g).then(
          made => made,
          (error: unknown) => message(error),
        )
        const lookup = asServer(other, app => personByPhone(app, FOUNDER_E164)).then(
          found => found,
          (error: unknown) => message(error),
        )
        await until(
          async () => {
            const others = await waiting(look, other, { script: false })
            return others.includes(stepPid) && others.length >= 2
          },
          'the step and the lookup waiting',
          1500,
        )
        await holder.query('commit')
        const run = await correction
        expectExit(run, 0, 'the correction held at its audit row')
        const stepped = await issued
        expect(
          stepped === false,
          typeof stepped === 'string'
            ? `the step failed: ${stepped}`
            : 'the step issued a session on a number no longer theirs',
        )
        const looked = await lookup
        expect(
          Array.isArray(looked) && looked.length === 0,
          typeof looked === 'string' ? `the lookup failed: ${looked}` : 'the lookup of the old number found someone',
        )
        const [users] = await rows<{ n: number }>(other, 'select count(*)::int as n from users')
        expect(users?.n === 0, 'the step made an account')
      } finally {
        await holder.end()
        await later.end()
        await look.end()
      }
    },
  ],
  [
    'BSR-04 BGR-01 through the script: a re-clear against a DPO’s sign-in in progress, each order; the function’s locked check decides, and neither deadlocks',
    async () => {
      // The DPO's sign-in issuing a session, as hearth_app acting as Hearth: the person FOR SHARE,
      // then the session on their device.
      const signIn = async (client: Client, f: Founded, device: string): Promise<void> => {
        await client.query('begin')
        await client.query('set local role hearth_app')
        await client.query(
          "select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true), set_config('lock_timeout', '10s', true)",
          [f.org, f.hearth],
        )
        await client.query('select 1 from people where org_id = $1 and id = $2 and deactivated_at is null for share', [
          f.org,
          f.founder,
        ])
        await client.query(
          `insert into sessions (org_id, user_id, device_id, token_hash, expires_at)
           values ($1, $2, $3, sha256($4::bytea), now() + interval '168 hours')`,
          [f.org, f.founder, device, Buffer.from(randomUUID())],
        )
      }
      const arranged = async (name: string) => {
        const made = await withdrawnCopy(name)
        const device = randomUUID()
        await admin(made.db, async client => {
          await client.query('insert into users (id, org_id) values ($1, $2)', [made.f.founder, made.f.org])
          await client.query(`insert into devices (id, org_id, user_id, label) values ($1, $2, $3, 'Phone')`, [
            device,
            made.f.org,
            made.f.founder,
          ])
        })
        return { ...made, device }
      }

      // The sign-in first, left open: the count reads 0, the function waits on the DPO's row and,
      // once the sign-in commits, refuses.
      const first = await arranged('bsr04_signin')
      const step = await connect(first.db)
      const watcher = await connect('postgres')
      try {
        await signIn(step, first.f, first.device)
        const reclear = script('recover', first.db, {
          commit: true,
          input: recoverDocument({ dpo: first.f.founder, reviewOn: D60 }),
        })
        // From the spawn, as BSR-03's first wait is (CI-02).
        await until(
          async () => (await waiting(watcher, first.db, { script: true })).length === 1,
          'the re-clear waiting',
        )
        await step.query('commit')
        const run = await reclear
        expectExit(run, 1, 'the re-clear after the sign-in')
        expectSaid(run, NO_DPO_SIGNED_IN, 'the re-clear after the sign-in')
        expectSaid(run, SIGNED_IN, 'the re-clear after the sign-in')
        expect(
          (await twilioClearances(first.db)).every(c => c.withdrawn_at !== null),
          'the re-clear cleared Twilio Verify',
        )
      } finally {
        await step.end()
        await watcher.end()
      }

      // The re-clear first, held at its audit row after taking the DPOs' rows: the sign-in waits,
      // and commits after the re-clear does.
      const second = await arranged('bsr04_reclear')
      const holder = await connect(second.db)
      const later = await connect(second.db)
      const look = await connect('postgres')
      try {
        await holder.query('begin')
        await holder.query('lock table public.audit_events in share mode')
        const reclear = script('recover', second.db, {
          commit: true,
          input: recoverDocument({ dpo: second.f.founder, reviewOn: D60 }),
        })
        await until(
          async () => (await waiting(look, second.db, { script: true, event: 'relation' })).length === 1,
          'the re-clear held at its audit row',
        )
        const laterPid = await pidOf(later)
        const signingIn = signIn(later, second.f, second.device).then(
          () => undefined,
          (error: unknown) => message(error),
        )
        await until(
          async () => (await waiting(look, second.db, { script: false })).includes(laterPid),
          'the sign-in waiting',
          1500,
        )
        await holder.query('commit')
        const run = await reclear
        expectExit(run, 0, 'the re-clear before the sign-in')
        const failed = await signingIn
        expect(failed === undefined, `the sign-in failed: ${failed}`)
        await later.query('commit')
        const [order] = await rows<{ after: boolean }>(
          second.db,
          `select s.created_at >= c.cleared_at as after from sessions s
           join transfer_clearances c on c.cleared_via = 'break_glass' limit 1`,
        )
        expect(order?.after === true, 'the session started before the re-clear committed')
      } finally {
        await holder.end()
        await later.end()
        await look.end()
      }
    },
  ],
  [
    'BSR-05 PD-123 PD-124: a set-up against a deploy’s migration: they take turns through Kysely’s lock, and a migration committed meanwhile is refused by name',
    async () => {
      // (a) The migrator's lock held: the set-up waits 2 s, then exits 3, writing nothing.
      const held = await copy('bsr05a')
      const before = await digest(held)
      const migrator = await connect(held)
      try {
        await migrator.query(`select pg_advisory_lock(${KYSELY_LOCK})`)
        const run = await script('set-up', held, { commit: true, input: setUpDocument() })
        expectExit(run, 3, 'the set-up behind the migrator’s lock')
        expectSaid(run, LOCK_BUSY, 'the set-up behind the migrator’s lock')
        const target = run.lines.find(line => line.text.startsWith(`${PREFIX}set-up (commit) on database`))
        const waited = run.ms - (target?.at ?? 0)
        expect(target !== undefined && waited >= 1900 && waited <= 3500, `it waited ${waited} ms, not 2 to 3.5 s`)
      } finally {
        await migrator.end()
      }
      expectNothingWritten(before, await digest(held), 'the set-up behind the migrator’s lock')

      // (b) A set-up held at its own audit row (after its locks), then production's migrator: the
      // migrator waits on the lock, the set-up commits, and the migrator finishes.
      const turns = await copy('bsr05b')
      const holder = await connect(turns)
      const look = await connect('postgres')
      if (login === undefined) throw new Error('no login')
      try {
        await holder.query('begin')
        await holder.query('lock table public.audit_events in share mode')
        const setUp = script('set-up', turns, { commit: true, input: setUpDocument() })
        await until(
          async () => (await waiting(look, turns, { script: true, event: 'relation' })).length === 1,
          'the set-up held at its audit row',
        )
        const migrated = migrate({ databaseUrl: url(turns, login), role: 'hearth_owner' })
        await until(
          async () => (await waiting(look, turns, { script: false, event: 'advisory' })).length === 1,
          'the migrator waiting on its lock',
          1500,
        )
        await holder.query('commit')
        expectExit(await setUp, 0, 'the set-up before the migrator')
        const { error, results } = await migrated
        expect(error === undefined && (results ?? []).length === 0, `the migrator: ${message(error)}`)
      } finally {
        await holder.end()
        await look.end()
      }

      // (c) A migration that commits while the set-up waits for the migrator's lock: S4 compares
      // the ledger again under it and refuses by name, writing nothing.
      const late = await copy('bsr05c')
      const kept = await digest(late)
      const lock = await connect(late)
      const watcher = await connect('postgres')
      try {
        await lock.query(`select pg_advisory_lock(${KYSELY_LOCK})`)
        const setUp = script('set-up', late, { commit: true, input: setUpDocument() })
        await until(
          async () => (await waiting(watcher, late, { script: true, event: 'advisory' })).length === 1,
          'the set-up waiting on the migrator’s lock',
        )
        await lock.query(`insert into public.kysely_migration (name, timestamp) values ('9999_late', now()::text)`)
        await lock.query(`select pg_advisory_unlock(${KYSELY_LOCK})`)
        const run = await setUp
        expectExit(run, 2, 'the set-up after a late migration')
        expectSaid(
          run,
          "This database has applied 9999_late, which this checkout doesn't have",
          'the set-up after a late migration',
        )
      } finally {
        await lock.end()
        await watcher.end()
      }
      await admin(late, client => client.query(`delete from public.kysely_migration where name = '9999_late'`))
      // The ledger's own counts moved with the row the check added and took away.
      const after = await digest(late)
      for (const d of [kept, after]) d.writes.delete('kysely_migration')
      expectNothingWritten(kept, after, 'the set-up after a late migration')
    },
  ],
]

const CASES: Case[] = [
  ...SET_UP_CASES,
  ...REFUSAL_CASES,
  ...RECOVERY_CASES,
  ...LOST_CASES,
  ...RACE_CASES,
  // Last, so it sweeps every run before it.
  ...SWEEP_CASES,
]

// --- Main ---------------------------------------------------------------------------------------

// The templates every case copies: migrated as the login, tracked, then set up through the script,
// then published through the checked functions.
async function buildTemplates(): Promise<void> {
  if (login === undefined) throw new Error('no login')
  await dropDatabase(TEMPLATE)
  await admin('postgres', client => client.query(`create database ${TEMPLATE} owner hearth_owner template template0`))
  made.add(TEMPLATE)
  const { error } = await migrate({ databaseUrl: url(TEMPLATE, login), role: 'hearth_owner' })
  if (error !== undefined) throw new Error(`the migrations failed: ${message(error)}`)
  await admin(TEMPLATE, client => installWriteTracking(client))
  currentCase = 'templates'
  await copy('setup')
  const run = await script('set-up', SET_UP, { commit: true, input: setUpDocument() })
  if (run.status !== 0) throw new Error(`the template's set-up exited ${run.status}:\n${output(run)}`)
  await copy('published', SET_UP)
  await publishV1(PUBLISHED)
}

async function main(): Promise<number> {
  if (!LOCAL_HOSTS.has(host)) {
    console.error(`check-owner-bootstrap: refusing ${host}: point PG* at the local stack or CI's service`)
    return 2
  }
  const server = await admin('postgres', async client => {
    const { rows: found } = await client.query<{ superuser: boolean; rds: boolean }>(
      `select (select rolsuper from pg_roles where rolname = current_user) as superuser,
              exists (select 1 from pg_roles where rolname = 'rds_superuser') as rds`,
    )
    return found[0]
  })
  if (server?.superuser !== true) {
    console.error('check-owner-bootstrap: connect as a superuser (PGUSER): this check creates roles and databases')
    return 2
  }
  if (server.rds) {
    console.error('check-owner-bootstrap: refusing an RDS server: point PG* at the local stack or CI’s service')
    return 2
  }
  const only = process.argv.slice(2)
  const chosen = only.length === 0 ? CASES : CASES.filter(([name]) => only.some(id => name.startsWith(id)))
  if (chosen.length === 0) {
    console.error(`check-owner-bootstrap: no case starts with ${only.join(' or ')}`)
    return 2
  }
  // hearth_owner, as scripts/check-migrations.sh makes it, for a run on the local stack.
  await admin('postgres', async client => {
    await client.query('set client_min_messages = warning')
    await client.query(
      'do $$ begin create role hearth_owner nologin createrole; exception when duplicate_object then null; end $$',
    )
    await client.query('alter role hearth_owner nosuperuser nobypassrls createrole')
  })
  let failed = 0
  try {
    login = await admin('postgres', client => makeBootstrapLogin(client, 'owner_bootstrap_check'))
    await buildTemplates()
    for (const [name, check] of chosen) {
      currentCase = name
      const started = Date.now()
      try {
        await check()
        console.log(`ok    ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`)
      } catch (error) {
        failed += 1
        console.error(`FAIL  ${name}: ${message(error)}`)
        for (const { run } of runs.filter(entry => entry.name === name)) {
          console.error(`      ${run.mode} exited ${run.status ?? run.signal}:`)
          for (const text of output(run).split('\n').filter(Boolean)) console.error(`        ${text}`)
        }
      }
    }
  } finally {
    const problems = await cleanUp()
    const left = await admin('postgres', async client => {
      const { rows: found } = await client.query<{ name: string }>(
        `select rolname as name from pg_roles where rolname = any ($1)
         union all select datname from pg_database where datname like 'owner\\_bootstrap\\_%\\_check'`,
        [[login?.user ?? '', ...roleDrops.keys()]],
      )
      return found.map(row => row.name)
    })
    for (const problem of [...problems, ...left.map(name => `${name} is still there`)]) {
      failed += 1
      console.error(`FAIL  clean-up: ${problem}`)
    }
  }
  return failed === 0 ? 0 : 1
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void cleanUp().finally(() => process.exit(1))
  })
}
// A rejection nothing handles (a case's promise left behind when a wait threw) would otherwise end
// the process at once, leaving the databases and the login behind: name it, clean up, exit 1
// (CI-01).
process.on('unhandledRejection', error => {
  console.error(`check-owner-bootstrap: unhandled rejection in ${currentCase || 'the start-up'}: ${message(error)}`)
  void cleanUp().finally(() => process.exit(1))
})

process.exitCode = await main().catch(async (error: unknown) => {
  console.error(`check-owner-bootstrap: ${message(error)}`)
  await cleanUp()
  return 1
})
