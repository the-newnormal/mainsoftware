// Where the Owner bootstrap script may connect (target.ts; TECH-SPEC T22 items 63 to 71): BSU-06, the
// checks before and after connecting, and BSU-09, the client's settings (owner-bootstrap.ts).
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import { clientConfig, openClient, STARTUP_OPTIONS } from '../owner-bootstrap.ts'
import type { Arguments, DeployEnv } from './input.ts'
import { EXIT } from './output.ts'
import {
  AGENT_MARKERS,
  checkoutMigrations,
  environmentProblems,
  isIpAddress,
  markerOf,
  migrationProblems,
  type ServerFacts,
  serverProblems,
  type TargetEnvironment,
  type TargetProblem,
  tlsServerName,
} from './target.ts'

const ENDPOINT = 'hearth.cluster-abc.ap-southeast-1.rds.amazonaws.com'

function env(overrides: Partial<TargetEnvironment> = {}): TargetEnvironment {
  return {
    DEPLOY_ENV: 'test',
    PGHOST: '127.0.0.1',
    PGHOSTADDR: undefined,
    PGSERVICE: undefined,
    PGSERVICEFILE: undefined,
    PGSSLMODE: undefined,
    PGSSLNEGOTIATION: undefined,
    OWNER_BOOTSTRAP_TLS_NAME: undefined,
    markers: [],
    ...overrides,
  }
}
const remote = (overrides: Partial<TargetEnvironment> = {}) =>
  env({ DEPLOY_ENV: 'prod', PGHOST: ENDPOINT, ...overrides })

const MIGRATIONS = ['0001_tenancy', '0002_people_and_teams', '0012_request_cases']
const SAFE_LOGS = {
  log_parameter_max_length: '0',
  log_parameter_max_length_on_error: '0',
  log_statement: 'none',
  log_error_verbosity: 'terse',
  log_destination: 'stderr',
  debug_print_plan: 'off',
}

function facts(overrides: Partial<ServerFacts> = {}): ServerFacts {
  return {
    isolation: 'read committed',
    acting: 'hearth_owner',
    login: 'owner_bootstrap_check_ab',
    login_inherits: false,
    login_superuser: false,
    login_bypassrls: false,
    login_createrole: false,
    login_createdb: false,
    login_owns: false,
    memberships: [{ role: 'hearth_owner', set: true, inherit: false, admin: false }],
    database: 'owner_bootstrap_case_check',
    marker: null,
    rds: false,
    tls: false,
    migrations: MIGRATIONS,
    has_function: true,
    has_orgs: true,
    orgs_forced: false,
    transaction_timeout: '30s',
    lock_timeout: '2s',
    idle_timeout: '5s',
    logs: {},
    ...overrides,
  }
}
const remoteFacts = (overrides: Partial<ServerFacts> = {}) =>
  facts({ rds: true, tls: true, marker: 'hearth-env:prod', logs: SAFE_LOGS, ...overrides })

const codes = (problems: readonly TargetProblem[]) => problems.map(problem => problem.code)
const check = (f: ServerFacts, target: { env?: DeployEnv; mode?: 'set-up' | 'recover' | 'correct-number' } = {}) =>
  serverProblems(f, {
    env: target.env ?? 'test',
    database: 'owner_bootstrap_case_check',
    mode: target.mode ?? 'set-up',
  })

describe('BSU-06 (PD-120 to PD-123; R3): the target, before and after connecting', () => {
  it('refuses DEPLOY_ENV missing or unknown, before anything else', () => {
    expect(environmentProblems(env({ DEPLOY_ENV: undefined }))).toEqual([{ code: 'deploy_env_missing' }])
    expect(environmentProblems(env({ DEPLOY_ENV: '' }))).toEqual([{ code: 'deploy_env_missing' }])
    expect(environmentProblems(env({ DEPLOY_ENV: 'production' }))).toEqual([{ code: 'deploy_env_unknown' }])
  })

  it("under local and test: PGHOST on this machine, nothing pointing elsewhere, and no TLS name (db-local.sh's refusals)", () => {
    for (const host of [undefined, '127.0.0.1', 'localhost', '::1']) {
      expect(environmentProblems(env({ PGHOST: host })), String(host)).toEqual([])
      expect(environmentProblems(env({ DEPLOY_ENV: 'local', PGHOST: host }))).toEqual([])
    }
    expect(environmentProblems(env({ PGHOST: ENDPOINT }))).toEqual([{ code: 'host_not_loopback' }])
    expect(environmentProblems(env({ PGHOST: '10.0.0.5' }))).toEqual([{ code: 'host_not_loopback' }])
    expect(environmentProblems(env({ PGHOSTADDR: '10.0.0.5' }))).toEqual([
      { code: 'elsewhere', variable: 'PGHOSTADDR' },
    ])
    expect(environmentProblems(env({ PGSERVICE: 'x' }))).toEqual([{ code: 'elsewhere', variable: 'PGSERVICE' }])
    expect(environmentProblems(env({ PGSERVICEFILE: 'x' }))).toEqual([{ code: 'elsewhere', variable: 'PGSERVICEFILE' }])
    expect(environmentProblems(env({ OWNER_BOOTSTRAP_TLS_NAME: ENDPOINT }))).toEqual([{ code: 'tls_name_local' }])
    // A coding agent may run it against a throwaway local database.
    expect(environmentProblems(env({ markers: [...AGENT_MARKERS] }))).toEqual([])
  })

  it('refuses a PGSSLNEGOTIATION pg would refuse to make a client with, before connecting (IO-03, PD-132)', () => {
    for (const deployEnv of ['local', 'test', 'nonprod', 'prod']) {
      const base =
        deployEnv === 'local' || deployEnv === 'test'
          ? env({ DEPLOY_ENV: deployEnv })
          : remote({ DEPLOY_ENV: deployEnv })
      for (const value of [undefined, '', 'postgres']) {
        expect(environmentProblems({ ...base, PGSSLNEGOTIATION: value }), `${deployEnv} ${value}`).toEqual([])
      }
      expect(environmentProblems({ ...base, PGSSLNEGOTIATION: 'Direct' }), deployEnv).toEqual([
        { code: 'sslnegotiation' },
      ])
    }
    // Direct needs TLS: the script turns it on itself under nonprod and prod, PGSSLMODE under local
    // and test.
    expect(environmentProblems(remote({ PGSSLNEGOTIATION: 'direct' }))).toEqual([])
    expect(environmentProblems(env({ PGSSLNEGOTIATION: 'direct' }))).toEqual([{ code: 'sslnegotiation_direct' }])
    for (const mode of ['disable', 'allow', '']) {
      expect(environmentProblems(env({ PGSSLNEGOTIATION: 'direct', PGSSLMODE: mode })), mode).toEqual([
        { code: 'sslnegotiation_direct' },
      ])
    }
    for (const mode of ['prefer', 'require', 'verify-ca', 'verify-full', 'no-verify']) {
      expect(environmentProblems(env({ PGSSLNEGOTIATION: 'direct', PGSSLMODE: mode })), mode).toEqual([])
    }
  })

  it('under nonprod and prod: no agent or CI marker, PGSSLMODE unset or verify-full, and a TLS name exactly for an IP host', () => {
    for (const deployEnv of ['nonprod', 'prod']) {
      expect(environmentProblems(remote({ DEPLOY_ENV: deployEnv }))).toEqual([])
      for (const marker of AGENT_MARKERS) {
        expect(environmentProblems(remote({ DEPLOY_ENV: deployEnv, markers: [marker] }))).toEqual([
          { code: 'agent_marker', variable: marker },
        ])
      }
    }
    for (const mode of ['no-verify', 'disable', 'require', 'prefer', 'verify-ca']) {
      expect(environmentProblems(remote({ PGSSLMODE: mode })), mode).toEqual([{ code: 'sslmode' }])
    }
    expect(environmentProblems(remote({ PGSSLMODE: 'verify-full' }))).toEqual([])
    expect(environmentProblems(remote({ PGHOST: undefined }))).toEqual([{ code: 'host_missing' }])
    expect(environmentProblems(remote({ PGHOST: '/var/run/postgresql' }))).toEqual([{ code: 'host_socket' }])
    expect(environmentProblems(remote({ PGHOST: '127.0.0.1' }))).toEqual([{ code: 'tls_name_missing' }])
    expect(environmentProblems(remote({ PGHOST: '::1' }))).toEqual([{ code: 'tls_name_missing' }])
    expect(environmentProblems(remote({ PGHOST: '127.0.0.1', OWNER_BOOTSTRAP_TLS_NAME: ENDPOINT }))).toEqual([])
    expect(environmentProblems(remote({ PGHOST: '127.0.0.1', OWNER_BOOTSTRAP_TLS_NAME: 'db.example.org' }))).toEqual([
      { code: 'tls_name_malformed' },
    ])
    expect(environmentProblems(remote({ OWNER_BOOTSTRAP_TLS_NAME: ENDPOINT }))).toEqual([
      { code: 'tls_name_with_name' },
    ])
    expect(isIpAddress('127.0.0.1')).toBe(true)
    expect(isIpAddress('::1')).toBe(true)
    expect(isIpAddress(ENDPOINT)).toBe(false)
  })

  it('passes a local server under test, and refuses one that is RDS, or the wrong database', () => {
    expect(check(facts())).toEqual({ problems: [], logWarnings: [] })
    expect(codes(check(facts({ rds: true })).problems)).toEqual(['server_is_rds'])
    expect(codes(check(facts({ database: 'hearth' })).problems)).toEqual(['database_mismatch'])
    expect(codes(check(facts({ isolation: 'repeatable read' })).problems)).toEqual(['isolation'])
  })

  it('reads the environment marker: absent or matching under local and test, exactly matching under nonprod and prod', () => {
    expect(markerOf(null)).toBe('none')
    expect(markerOf('hearth-env:prod')).toBe('prod')
    expect(markerOf('hearth-env:prod ')).toBe('other')
    expect(markerOf('production')).toBe('other')
    expect(check(facts({ marker: 'hearth-env:test' })).problems).toEqual([])
    expect(check(facts({ marker: 'hearth-env:prod' })).problems).toEqual([{ code: 'marker', found: 'prod' }])
    expect(check(facts({ marker: 'something else' })).problems).toEqual([{ code: 'marker', found: 'other' }])
    expect(check(remoteFacts(), { env: 'prod' }).problems).toEqual([])
    expect(check(remoteFacts({ marker: null }), { env: 'prod' }).problems).toEqual([{ code: 'marker', found: 'none' }])
    expect(check(remoteFacts({ marker: 'hearth-env:nonprod' }), { env: 'prod' }).problems).toEqual([
      { code: 'marker', found: 'nonprod' },
    ])
    expect(check(remoteFacts({ marker: 'hearth-env:prod ' }), { env: 'prod' }).problems).toEqual([
      { code: 'marker', found: 'other' },
    ])
  })

  it('refuses under prod a local server, and one reached without TLS', () => {
    expect(codes(check(remoteFacts({ rds: false }), { env: 'prod' }).problems)).toEqual(['server_not_rds'])
    expect(codes(check(remoteFacts({ tls: false }), { env: 'prod' }).problems)).toEqual(['no_tls'])
  })

  it("holds the login to the bootstrap's own shape, reading each grant's options (PD-122)", () => {
    const member = (overrides: Partial<ServerFacts['memberships'][number]> = {}) => ({
      role: 'hearth_owner',
      set: true,
      inherit: false,
      admin: false,
      ...overrides,
    })
    const cases: [Partial<ServerFacts>, string[]][] = [
      [{ login: 'hearth_owner', memberships: [] }, ['login_is_owner']],
      [{ login_superuser: true, memberships: [] }, ['login_superuser', 'login_not_member']],
      [{ memberships: [member(), member({ role: 'rds_superuser' })] }, ['login_other_membership']],
      [{ login_inherits: true }, ['login_inherits']],
      [{ memberships: [member({ inherit: true })] }, ['login_grant']],
      [{ memberships: [member({ admin: true })] }, ['login_grant']],
      [{ memberships: [member({ set: false })] }, ['login_grant']],
      [{ memberships: [member(), member({ role: 'pg_read_all_data' })] }, ['login_other_membership']],
      // pg_read_all_settings on the login would change nothing pg_settings shows the acting role,
      // and is refused like any other second membership (IO-02).
      [{ memberships: [member(), member({ role: 'pg_read_all_settings' })] }, ['login_other_membership']],
      [{ memberships: [member(), member({ role: 'rds_iam' })] }, ['login_other_membership']],
      [{ login_createrole: true }, ['login_createrole']],
      [{ login_createdb: true }, ['login_createdb']],
      [{ login_bypassrls: true }, ['login_bypassrls']],
      [{ login_owns: true }, ['login_owns']],
      [{ acting: 'owner_bootstrap_check_ab' }, ['acting_role']],
    ]
    for (const [overrides, expected] of cases) {
      expect(codes(check(facts(overrides)).problems), JSON.stringify(overrides)).toEqual(expected)
    }
    // rds_iam is allowed on RDS, without ADMIN.
    expect(
      check(remoteFacts({ memberships: [member(), member({ role: 'rds_iam' })] }), { env: 'prod' }).problems,
    ).toEqual([])
    expect(
      codes(
        check(remoteFacts({ memberships: [member(), member({ role: 'rds_iam', admin: true })] }), { env: 'prod' })
          .problems,
      ),
    ).toEqual(['login_other_membership'])
  })

  it("refuses a schema without the function's signature, or whose orgs table forces row level security", () => {
    expect(codes(check(facts({ has_function: false })).problems)).toEqual(['no_function'])
    expect(codes(check(facts({ orgs_forced: true })).problems)).toEqual(['orgs_forced'])
    expect(codes(check(facts({ has_orgs: false })).problems)).toEqual(['no_orgs'])
  })

  it('refuses unsafe or unreadable log settings for set-up and correct-number, and warns of them for recover (PD-121)', () => {
    const unsafe: [Record<string, string>, string][] = [
      [{ log_statement: 'all' }, 'log_statement'],
      [{ log_parameter_max_length: '-1' }, 'log_parameter_max_length'],
      [{ log_parameter_max_length_on_error: '64' }, 'log_parameter_max_length_on_error'],
      [{ log_error_verbosity: 'default' }, 'log_error_verbosity'],
      [
        { 'auto_explain.log_min_duration': '0', 'auto_explain.log_parameter_max_length': '-1' },
        'auto_explain.log_min_duration',
      ],
      // A custom plan prints the bound values as literals whatever auto_explain's parameter length
      // says, which covers only its "Query Parameters" line (IO-01).
      [
        { 'auto_explain.log_min_duration': '0', 'auto_explain.log_parameter_max_length': '0' },
        'auto_explain.log_min_duration',
      ],
      [{ 'auto_explain.log_min_duration': '250' }, 'auto_explain.log_min_duration'],
      [{ 'pgaudit.log_parameter': 'on' }, 'pgaudit.log_parameter'],
      // csvlog and jsonlog write a message's DETAIL whatever log_error_verbosity says, so terse no
      // longer drops a failed row's values or a logged plan's Consts (R2SCRIPT-01); a destination
      // Postgres would read as csvlog is one, whatever its case, spacing or quotes.
      [{ log_destination: 'csvlog' }, 'log_destination'],
      [{ log_destination: 'stderr,csvlog' }, 'log_destination'],
      [{ log_destination: 'stderr, CSVLOG' }, 'log_destination'],
      [{ log_destination: 'stderr,"csvlog"' }, 'log_destination'],
      [{ log_destination: 'jsonlog' }, 'log_destination'],
      [{ log_destination: 'syslog,jsonlog' }, 'log_destination'],
      [{ log_destination: '' }, 'log_destination'],
      // A logged plan carries the bound name and number as Consts (R2DOCS-01): the start-up option
      // sets it off, so anything else means the option didn't hold.
      [{ debug_print_plan: 'on' }, 'debug_print_plan'],
    ]
    for (const [logs, setting] of unsafe) {
      const f = remoteFacts({ logs: { ...SAFE_LOGS, ...logs } })
      for (const mode of ['set-up', 'correct-number'] as const) {
        expect(check(f, { env: 'prod', mode }).problems, setting).toEqual([{ code: 'log_unsafe', settings: [setting] }])
      }
      expect(check(f, { env: 'prod', mode: 'recover' })).toEqual({ problems: [], logWarnings: [setting] })
    }
    for (const missing of Object.keys(SAFE_LOGS)) {
      const { [missing]: _gone, ...logs } = SAFE_LOGS as Record<string, string>
      expect(check(remoteFacts({ logs }), { env: 'prod' }).problems, missing).toEqual([
        { code: 'log_unreadable', settings: [missing] },
      ])
      expect(check(remoteFacts({ logs }), { env: 'nonprod', mode: 'recover' }).logWarnings).toEqual([missing])
    }
    const safe: Record<string, string>[] = [
      { log_statement: 'mod' },
      { log_statement: 'ddl' },
      { 'auto_explain.log_min_duration': '-1', 'auto_explain.log_parameter_max_length': '-1' },
      { 'auto_explain.log_min_duration': '-1' },
      { 'pgaudit.log_parameter': 'off' },
      { log_destination: 'stderr' },
      { log_destination: 'Stderr, syslog' },
      { log_destination: '"stderr",eventlog' },
    ]
    for (const logs of safe) {
      expect(check(remoteFacts({ logs: { ...SAFE_LOGS, ...logs } }), { env: 'prod' }).problems).toEqual([])
    }
    // Under local and test the logs aren't read.
    expect(check(facts({ logs: {} })).problems).toEqual([])
  })

  it("compares the applied migrations with the checkout's, both ways, by name (PD-123)", () => {
    expect(migrationProblems(MIGRATIONS, MIGRATIONS)).toEqual([])
    expect(migrationProblems([...MIGRATIONS, '9999_not_in_this_checkout'], MIGRATIONS)).toEqual([
      { code: 'migration_unknown', name: '9999_not_in_this_checkout' },
    ])
    expect(migrationProblems(MIGRATIONS.slice(0, -1), MIGRATIONS)).toEqual([
      { code: 'migration_missing', name: '0012_request_cases' },
    ])
    expect(migrationProblems([...MIGRATIONS, 'a name with spaces'], MIGRATIONS)).toEqual([
      { code: 'migration_unknown', name: null },
    ])
  })

  it("lists this checkout's migrations as the migrator names them, and calls an unreadable folder a problem", async () => {
    const listed = await checkoutMigrations()
    expect(listed.ok).toBe(true)
    if (listed.ok) {
      expect(listed.names).toContain('0001_tenancy')
      expect(listed.names.every(name => /^\d{4}_[a-z0-9_]+$/.test(name))).toBe(true)
      expect([...listed.names].sort()).toEqual(listed.names)
    }
    expect(await checkoutMigrations(new URL('./no-such-folder/', import.meta.url))).toEqual({ ok: false })
  })
})

describe("BSU-09 (PD-121, PD-125): the client's settings", () => {
  const args: Arguments = { mode: 'set-up', database: 'owner_bootstrap_case_check', commit: false }

  it('takes the role, the bounds and debug_print_plan off as start-up options (R2SCRIPT-01), and connects to --database whatever PGDATABASE says', () => {
    expect(STARTUP_OPTIONS).toBe(
      '-c role=hearth_owner -c transaction_timeout=30s -c lock_timeout=2s -c idle_in_transaction_session_timeout=5s -c debug_print_plan=off',
    )
    const config = clientConfig(args, env(), 'test')
    expect(config).toMatchObject({
      database: 'owner_bootstrap_case_check',
      application_name: 'hearth-owner-bootstrap',
      options: STARTUP_OPTIONS,
      query_timeout: 31_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
    })
    const before = process.env.PGDATABASE
    process.env.PGDATABASE = 'hearth'
    try {
      expect(new Client(config).database).toBe('owner_bootstrap_case_check')
    } finally {
      if (before === undefined) delete process.env.PGDATABASE
      else process.env.PGDATABASE = before
    }
  })

  it("treats a client pg can't make as a failure to connect, exit 2, never the unexpected line's exit 3 (IO-03, PD-132)", async () => {
    const saved = { negotiation: process.env.PGSSLNEGOTIATION, mode: process.env.PGSSLMODE }
    process.env.PGSSLNEGOTIATION = 'direct'
    delete process.env.PGSSLMODE
    try {
      // Port 1 on loopback, where nothing answers: a constructor that stopped throwing would show
      // as nothing_answered, not as this line.
      const opened = await openClient({ ...clientConfig(args, env(), 'test'), host: '127.0.0.1', port: 1 })
      expect(opened).toEqual({
        outcome: { lines: [{ kind: 'connect_failed', cause: 'other', code: null }], exit: EXIT.wrong },
      })
    } finally {
      if (saved.negotiation === undefined) delete process.env.PGSSLNEGOTIATION
      else process.env.PGSSLNEGOTIATION = saved.negotiation
      if (saved.mode !== undefined) process.env.PGSSLMODE = saved.mode
    }
  })

  it('verifies TLS itself under nonprod and prod, naming the endpoint only for a port forward, and leaves local alone', () => {
    expect('ssl' in clientConfig(args, env(), 'test')).toBe(false)
    expect('ssl' in clientConfig(args, env({ DEPLOY_ENV: 'local' }), 'local')).toBe(false)
    expect(clientConfig(args, remote(), 'prod').ssl).toEqual({ rejectUnauthorized: true })
    expect(clientConfig(args, remote({ DEPLOY_ENV: 'nonprod' }), 'nonprod').ssl).toEqual({ rejectUnauthorized: true })
    const forward = remote({ PGHOST: '127.0.0.1', OWNER_BOOTSTRAP_TLS_NAME: ENDPOINT })
    expect(clientConfig(args, forward, 'prod').ssl).toEqual({ rejectUnauthorized: true, servername: ENDPOINT })
    expect(tlsServerName(forward, 'prod')).toBe(ENDPOINT)
    expect(tlsServerName(remote({ OWNER_BOOTSTRAP_TLS_NAME: ENDPOINT }), 'prod')).toBeUndefined()
    expect(tlsServerName(env({ OWNER_BOOTSTRAP_TLS_NAME: ENDPOINT }), 'test')).toBeUndefined()
  })
})
