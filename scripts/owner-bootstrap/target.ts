// Where the Owner bootstrap script connects, and whether it is the database the person meant
// (TECH-SPEC T22 items 63 to 71; PD-121 to PD-123). Two checks, both pure: environmentProblems()
// before connecting, from the environment alone, and serverProblems() and migrationProblems() in
// each transaction's second statement, from what the server says and what this checkout holds.
// checkoutMigrations() is this file's one I/O: it lists db/migrations/.
//
// The target is what DEPLOY_ENV says, the input document's environment repeats (input.ts), the
// server confirms and the database's environment marker states (COMMENT ON DATABASE … IS
// 'hearth-env:<env>', which C0.12 sets as the database's owner and nothing in this repository
// writes). An SSM port forward makes RDS look local, so the server's facts decide, never the host.
import { readdir } from 'node:fs/promises'
import { z } from 'zod'
import { type DeployEnv, isDeployEnv, isRemote, type Mode } from './input.ts'

// --- Before connecting (2.3) --------------------------------------------------------------------

// The variables whose presence marks a coding agent or CI. Only their presence is read, never
// their values: under nonprod and prod any of them refuses the run (PD-121, R7).
export const AGENT_MARKERS = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'AI_AGENT', 'CI', 'GITHUB_ACTIONS'] as const
export type AgentMarker = (typeof AGENT_MARKERS)[number]

// The variables that would send a client somewhere other than PGHOST says (db-local.sh refuses
// them too).
export const ELSEWHERE = ['PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE'] as const
export type Elsewhere = (typeof ELSEWHERE)[number]

// What the script reads of the environment to decide where it may connect. pg reads PGHOST,
// PGPORT, PGUSER and PGPASSWORD itself; the script reads them only to classify the target.
export interface TargetEnvironment {
  DEPLOY_ENV: string | undefined
  PGHOST: string | undefined
  PGHOSTADDR: string | undefined
  PGSERVICE: string | undefined
  PGSERVICEFILE: string | undefined
  PGSSLMODE: string | undefined
  OWNER_BOOTSTRAP_TLS_NAME: string | undefined
  markers: readonly AgentMarker[]
}

export type EnvironmentProblem =
  | { code: 'deploy_env_missing' }
  | { code: 'deploy_env_unknown' }
  // local and test: PGHOST isn't this machine.
  | { code: 'host_not_loopback' }
  | { code: 'elsewhere'; variable: Elsewhere }
  | { code: 'tls_name_local' }
  // nonprod and prod.
  | { code: 'agent_marker'; variable: AgentMarker }
  | { code: 'host_missing' }
  | { code: 'host_socket' }
  | { code: 'sslmode' }
  | { code: 'tls_name_missing' }
  | { code: 'tls_name_with_name' }
  | { code: 'tls_name_malformed' }

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
// An RDS endpoint's DNS name, which the server's certificate names.
const RDS_ENDPOINT =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.rds\.amazonaws\.com$/i

const given = (value: string | undefined): value is string => value !== undefined && value !== ''

// An IPv4 or IPv6 address, as pg tells one from a name (net.isIP, which the script may not import:
// it opens no socket of its own). A host name never holds a colon.
export const isIpAddress = (host: string): boolean => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')

// DEPLOY_ENV as one of the four, or undefined.
export const deployEnvOf = (value: string | undefined): DeployEnv | undefined =>
  isDeployEnv(value) ? value : undefined

// Everything the environment alone can refuse. Under local and test: PGHOST on this machine, none
// of the variables that point elsewhere, and no TLS name. Under nonprod and prod: no agent or CI
// marker, PGHOST given and not a socket, PGSSLMODE unset or verify-full (the script verifies TLS
// itself, so the person's stated intent and the connection agree), and OWNER_BOOTSTRAP_TLS_NAME
// exactly when PGHOST is an IP address (a port forward), naming an RDS endpoint.
export function environmentProblems(env: TargetEnvironment): EnvironmentProblem[] {
  if (!given(env.DEPLOY_ENV)) return [{ code: 'deploy_env_missing' }]
  const deployEnv = deployEnvOf(env.DEPLOY_ENV)
  if (deployEnv === undefined) return [{ code: 'deploy_env_unknown' }]
  const problems: EnvironmentProblem[] = []
  if (!isRemote(deployEnv)) {
    if (given(env.PGHOST) && !LOCAL_HOSTS.has(env.PGHOST)) problems.push({ code: 'host_not_loopback' })
    for (const variable of ELSEWHERE) if (given(env[variable])) problems.push({ code: 'elsewhere', variable })
    if (given(env.OWNER_BOOTSTRAP_TLS_NAME)) problems.push({ code: 'tls_name_local' })
    return problems
  }
  for (const variable of env.markers) problems.push({ code: 'agent_marker', variable })
  if (!given(env.PGHOST)) problems.push({ code: 'host_missing' })
  else if (env.PGHOST.startsWith('/')) problems.push({ code: 'host_socket' })
  if (given(env.PGSSLMODE) && env.PGSSLMODE !== 'verify-full') problems.push({ code: 'sslmode' })
  if (given(env.PGHOST) && !env.PGHOST.startsWith('/')) {
    const name = env.OWNER_BOOTSTRAP_TLS_NAME
    if (isIpAddress(env.PGHOST)) {
      if (!given(name)) problems.push({ code: 'tls_name_missing' })
      else if (!RDS_ENDPOINT.test(name)) problems.push({ code: 'tls_name_malformed' })
    } else if (given(name)) {
      problems.push({ code: 'tls_name_with_name' })
    }
  }
  return problems
}

// The name the server's certificate is checked against for a port forward (nonprod and prod, an IP
// PGHOST): pg sets servername from the host only when the host is a name, and keeps one the config
// gives for an IP address (connection.js).
export function tlsServerName(env: TargetEnvironment, deployEnv: DeployEnv): string | undefined {
  if (!isRemote(deployEnv) || !given(env.PGHOST) || !isIpAddress(env.PGHOST)) return undefined
  return given(env.OWNER_BOOTSTRAP_TLS_NAME) ? env.OWNER_BOOTSTRAP_TLS_NAME : undefined
}

// --- After connecting (section 3) ---------------------------------------------------------------

// The log settings that decide whether a statement's bind values could reach the server's log, as
// pg_settings names them (PD-121). The first four are core and must be readable.
export const LOG_SETTINGS = [
  'log_parameter_max_length',
  'log_parameter_max_length_on_error',
  'log_statement',
  'log_error_verbosity',
  'auto_explain.log_min_duration',
  'auto_explain.log_parameter_max_length',
  'pgaudit.log_parameter',
] as const
export type LogSetting = (typeof LOG_SETTINGS)[number]
const CORE_LOG_SETTINGS: readonly LogSetting[] = LOG_SETTINGS.slice(0, 4)

// The second statement's row (steps.ts, PROLOGUE), as Postgres returns it.
export const ServerFactsRow = z.object({
  isolation: z.string(),
  acting: z.string(),
  login: z.string(),
  login_inherits: z.boolean(),
  login_superuser: z.boolean(),
  login_bypassrls: z.boolean(),
  login_createrole: z.boolean(),
  login_createdb: z.boolean(),
  login_owns: z.boolean(),
  memberships: z.array(z.object({ role: z.string(), set: z.boolean(), inherit: z.boolean(), admin: z.boolean() })),
  database: z.string(),
  marker: z.string().nullable(),
  rds: z.boolean(),
  tls: z.boolean(),
  migrations: z.array(z.string()),
  has_function: z.boolean(),
  has_orgs: z.boolean(),
  orgs_forced: z.boolean(),
  transaction_timeout: z.string(),
  lock_timeout: z.string(),
  idle_timeout: z.string(),
  logs: z.record(z.string(), z.string()),
})
export type ServerFacts = z.infer<typeof ServerFactsRow>

export type Marker = DeployEnv | 'none' | 'other'

export type TargetProblem =
  | { code: 'checkout_unreadable' }
  | { code: 'no_ledger' }
  | { code: 'isolation' }
  // The login (session_user).
  | { code: 'login_is_owner' }
  | { code: 'login_inherits' }
  | { code: 'login_superuser' }
  | { code: 'login_bypassrls' }
  | { code: 'login_createrole' }
  | { code: 'login_createdb' }
  | { code: 'login_owns' }
  | { code: 'login_not_member' }
  | { code: 'login_grant' }
  | { code: 'login_other_membership' }
  // The acting role (current_user).
  | { code: 'acting_role' }
  // The server and the database.
  | { code: 'server_is_rds' }
  | { code: 'server_not_rds' }
  | { code: 'no_tls' }
  | { code: 'database_mismatch' }
  | { code: 'marker'; found: Marker }
  // The schema.
  | { code: 'no_function' }
  | { code: 'no_orgs' }
  | { code: 'orgs_forced' }
  | { code: 'migration_unknown'; name: string | null }
  | { code: 'migration_missing'; name: string | null }
  // The logs (nonprod and prod; set-up and correct-number refuse, recover warns).
  | { code: 'log_unsafe'; settings: LogSetting[] }
  | { code: 'log_unreadable'; settings: LogSetting[] }

const MARKER = /^hearth-env:(local|test|nonprod|prod)$/

// The database's environment marker as one of the four, none, or text that is no Hearth marker
// (never printed).
export function markerOf(comment: string | null): Marker {
  if (comment === null) return 'none'
  const match = MARKER.exec(comment)
  return match !== null && isDeployEnv(match[1]) ? match[1] : 'other'
}

// The log settings a statement's bind values could reach the log through: both parameter lengths
// must be 0 (a statement logged by log_statement or log_min_duration_statement then shows only its
// placeholders, so mod is as safe as none), errors terse (a failed statement's DETAIL can carry a
// row's values), auto_explain absent or logging none (since Postgres 16 it logs a slow statement's
// bind values by its own length setting, -1 by default), and pgaudit's parameter logging off. A
// core setting pg_settings doesn't show this role is unreadable, by name.
export function logFindings(logs: Readonly<Record<string, string>>): {
  unsafe: LogSetting[]
  unreadable: LogSetting[]
} {
  const unreadable = CORE_LOG_SETTINGS.filter(name => logs[name] === undefined)
  const unsafe: LogSetting[] = []
  const at = (name: LogSetting) => logs[name]
  if (at('log_parameter_max_length') !== undefined && at('log_parameter_max_length') !== '0') {
    unsafe.push('log_parameter_max_length')
  }
  if (at('log_parameter_max_length_on_error') !== undefined && at('log_parameter_max_length_on_error') !== '0') {
    unsafe.push('log_parameter_max_length_on_error')
  }
  const statement = at('log_statement')
  if (statement !== undefined && !['none', 'ddl', 'mod'].includes(statement)) unsafe.push('log_statement')
  const verbosity = at('log_error_verbosity')
  if (verbosity !== undefined && verbosity !== 'terse') unsafe.push('log_error_verbosity')
  const explainAfter = at('auto_explain.log_min_duration')
  if (explainAfter !== undefined && explainAfter !== '-1' && at('auto_explain.log_parameter_max_length') !== '0') {
    unsafe.push('auto_explain.log_parameter_max_length')
  }
  const audit = at('pgaudit.log_parameter')
  if (audit !== undefined && audit !== 'off') unsafe.push('pgaudit.log_parameter')
  return { unsafe, unreadable }
}

// What the server's facts refuse, and, for the recovery mode, the log findings it only warns of: it
// binds no name or number (an org id, a DPO's id, a day, fact keys and a reason that names roles),
// so a parameter group C0.12 chose differently must not stop the emergency re-clear.
export function serverProblems(
  facts: ServerFacts,
  target: { env: DeployEnv; database: string; mode: Mode },
): { problems: TargetProblem[]; logWarnings: LogSetting[] } {
  const remote = isRemote(target.env)
  const problems: TargetProblem[] = []
  if (facts.isolation !== 'read committed') problems.push({ code: 'isolation' })

  // The login: never hearth_owner itself (CREATEROLE, the owner of every table), a NOINHERIT login
  // with no power of its own whose only membership is hearth_owner, granted with SET and without
  // INHERIT or ADMIN (on Postgres 16 and later inheritance is each grant's own), and on RDS also
  // the powerless rds_iam. So its power is hearth_owner's, taken for its transaction, no more.
  if (facts.login === 'hearth_owner') problems.push({ code: 'login_is_owner' })
  if (facts.login_inherits) problems.push({ code: 'login_inherits' })
  if (facts.login_superuser) problems.push({ code: 'login_superuser' })
  if (facts.login_bypassrls) problems.push({ code: 'login_bypassrls' })
  if (facts.login_createrole) problems.push({ code: 'login_createrole' })
  if (facts.login_createdb) problems.push({ code: 'login_createdb' })
  if (facts.login_owns) problems.push({ code: 'login_owns' })
  if (facts.login !== 'hearth_owner') {
    const owner = facts.memberships.filter(m => m.role === 'hearth_owner')
    if (owner.length === 0) problems.push({ code: 'login_not_member' })
    else if (owner.some(m => !m.set || m.inherit || m.admin)) problems.push({ code: 'login_grant' })
    const others = facts.memberships.filter(
      m => m.role !== 'hearth_owner' && !(remote && m.role === 'rds_iam' && !m.admin),
    )
    if (others.length > 0) problems.push({ code: 'login_other_membership' })
  }
  if (facts.acting !== 'hearth_owner') problems.push({ code: 'acting_role' })

  // The server: RDS only under nonprod and prod, over the TLS the script asked for.
  if (remote) {
    if (!facts.rds) problems.push({ code: 'server_not_rds' })
    if (!facts.tls) problems.push({ code: 'no_tls' })
  } else if (facts.rds) {
    problems.push({ code: 'server_is_rds' })
  }
  if (facts.database !== target.database) problems.push({ code: 'database_mismatch' })
  const marker = markerOf(facts.marker)
  if (remote ? marker !== target.env : marker !== 'none' && marker !== target.env) {
    problems.push({ code: 'marker', found: marker })
  }

  // The schema: the function the clearances go through, and an orgs table whose owner sees every
  // org (S4's once rule reads across orgs).
  if (!facts.has_function) problems.push({ code: 'no_function' })
  if (!facts.has_orgs) problems.push({ code: 'no_orgs' })
  else if (facts.orgs_forced) problems.push({ code: 'orgs_forced' })

  const logWarnings: LogSetting[] = []
  if (remote) {
    const { unsafe, unreadable } = logFindings(facts.logs)
    if (target.mode === 'recover') {
      logWarnings.push(...unreadable, ...unsafe)
    } else {
      if (unsafe.length > 0) problems.push({ code: 'log_unsafe', settings: unsafe })
      if (unreadable.length > 0) problems.push({ code: 'log_unreadable', settings: unreadable })
    }
  }
  return { problems, logWarnings }
}

// A migration's name as it may be printed; anything else (a ledger row a person wrote by hand)
// prints as unnamed.
const PRINTABLE_MIGRATION = /^[0-9A-Za-z_.-]{1,100}$/
const printable = (name: string): string | null => (PRINTABLE_MIGRATION.test(name) ? name : null)

// The applied migrations (kysely_migration) against this checkout's db/migrations/, both ways, so a
// checkout older or newer than the database is refused by name (PD-123). No constant here names a
// migration, so a later migration's PR leaves the script alone unless it changes what it relies on.
export function migrationProblems(applied: readonly string[], checkout: readonly string[]): TargetProblem[] {
  const inCheckout = new Set(checkout)
  const inDatabase = new Set(applied)
  return [
    ...[...inDatabase]
      .filter(name => !inCheckout.has(name))
      .sort()
      .map(name => ({ code: 'migration_unknown' as const, name: printable(name) })),
    ...[...inCheckout]
      .filter(name => !inDatabase.has(name))
      .sort()
      .map(name => ({ code: 'migration_missing' as const, name: printable(name) })),
  ]
}

// The checkout's migrations as the migrator names them (apps/server/src/db/migrations.ts): each
// plain file in db/migrations/ ending .sql, without the suffix. A folder that can't be read, or holds
// none, is a problem, never an empty list. dir is for the unit tests alone.
export async function checkoutMigrations(
  dir: URL = new URL('../../db/migrations/', import.meta.url),
): Promise<{ ok: true; names: string[] } | { ok: false }> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const names = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
      .map(entry => entry.name.slice(0, -'.sql'.length))
      .sort()
    return names.length > 0 ? { ok: true, names } : { ok: false }
  } catch {
    return { ok: false }
  }
}
