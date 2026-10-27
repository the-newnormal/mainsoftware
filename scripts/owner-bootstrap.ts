// The Owner bootstrap script (CLAUDE.md, Database: "The org's first Owner, who is also its first DPO
// (D35), is created once by a reviewed bootstrap script … that a person runs against the target
// database"; TECH-SPEC T22 items 16, 20, 37, 44 and 63 to 71; docs/runbooks/first-owner-set-up.md
// and twilio-withdrawn.md). A person runs it, never a coding agent and never CI against anything but
// a throwaway database on its own machine with fictional values; it calls no provider.
//
//   node scripts/owner-bootstrap.ts set-up         --database <name> [--commit]
//   node scripts/owner-bootstrap.ts recover        --database <name> [--commit]
//   node scripts/owner-bootstrap.ts correct-number --database <name> [--commit]
//
//   set-up          the org, its Hearth principal, the first Owner and DPO with their number, and
//                   Twilio Verify's and AWS's clearances, once (BSC-02). No notice, no contact.
//   recover         Twilio Verify's break-glass re-clear, while no DPO is signed in (BSC-04, BSC-05).
//   correct-number  the founder's number, only while they have never signed in and no notice is
//                   published (PD-129).
//
// Every mode is a plan unless given --commit: it runs its whole transaction and rolls back. Its
// input is one JSON document in OWNER_BOOTSTRAP_INPUT, set for the one command from the
// environment's bootstrap secret (or pasted by the runbook's command, which reads every line), never
// an argument, a file or a prompt. DEPLOY_ENV names the target, which the document names too; the
// standard PG* variables say where to connect, and --database which database, whatever PGDATABASE
// says. Exit statuses: 0 done or the plan passed, 1 refused, 2 the inputs or the target are wrong or
// connecting failed, 3 nothing written (run it again), 4 lost while committing (output.ts).
import { randomUUID } from 'node:crypto'
import { Client, type ClientConfig } from 'pg'
import {
  type Arguments,
  type DeployEnv,
  dayIn,
  isRemote,
  ORG_ZONE,
  parseArguments,
  parseDocument,
} from './owner-bootstrap/input.ts'
import {
  connectFailure,
  EXIT,
  type ExitStatus,
  interrupted,
  type Outcome,
  outcomeOf,
  type Phase,
  type Print,
  printer,
  processSink,
  refused,
  report,
} from './owner-bootstrap/output.ts'
import { correctNumber, type Queryable, recover, type StepContext, setUp } from './owner-bootstrap/steps.ts'
import {
  AGENT_MARKERS,
  type AgentMarker,
  checkoutMigrations,
  deployEnvOf,
  environmentProblems,
  type TargetEnvironment,
  tlsServerName,
} from './owner-bootstrap/target.ts'

// The connection's role and bounds, as start-up options, so every transaction is bounded from its
// first statement and a login that can't take hearth_owner fails to connect (42501). A timer set
// later can't shorten one already running (BGR-06). The only place the script takes a role.
// debug_print_plan is set off here too: any role may turn it on (user context), and a plan it logs
// carries the bound name and number as Consts in its DETAIL, which no parameter length shortens and
// csvlog or jsonlog write whatever the verbosity. A client's start-up value outranks the parameter
// group's, ALTER DATABASE's and ALTER ROLE's, and the log check reads it back (target.ts).
// debug_print_parse and debug_print_rewritten print trees from before planning, which hold Params.
export const STARTUP_OPTIONS =
  '-c role=hearth_owner -c transaction_timeout=30s -c lock_timeout=2s -c idle_in_transaction_session_timeout=5s -c debug_print_plan=off'

interface Environment extends TargetEnvironment {
  input: string | undefined
}

// The one place the script reads process.env. OWNER_BOOTSTRAP_INPUT is deleted once read, so
// nothing the script starts or prints can reach it. pg reads PGHOST, PGPORT, PGUSER, PGPASSWORD,
// PGSSLMODE and PGSSLNEGOTIATION itself when the client is made.
function readEnvironment(): Environment {
  const env = process.env
  const input = env.OWNER_BOOTSTRAP_INPUT
  delete process.env.OWNER_BOOTSTRAP_INPUT
  const present: Record<AgentMarker, boolean> = {
    CLAUDECODE: env.CLAUDECODE !== undefined,
    CLAUDE_CODE_ENTRYPOINT: env.CLAUDE_CODE_ENTRYPOINT !== undefined,
    AI_AGENT: env.AI_AGENT !== undefined,
    CI: env.CI !== undefined,
    GITHUB_ACTIONS: env.GITHUB_ACTIONS !== undefined,
  }
  return {
    input,
    DEPLOY_ENV: env.DEPLOY_ENV,
    PGHOST: env.PGHOST,
    PGHOSTADDR: env.PGHOSTADDR,
    PGSERVICE: env.PGSERVICE,
    PGSERVICEFILE: env.PGSERVICEFILE,
    PGSSLMODE: env.PGSSLMODE,
    PGSSLNEGOTIATION: env.PGSSLNEGOTIATION,
    OWNER_BOOTSTRAP_TLS_NAME: env.OWNER_BOOTSTRAP_TLS_NAME,
    // Their presence only, never their values.
    markers: AGENT_MARKERS.filter(name => present[name]),
  }
}

// The client's settings (design 1.4). The host, port, user and password come from the PG*
// variables as pg reads them; the database is --database, so a stale or unset PGDATABASE never
// decides. Under nonprod and prod the script verifies TLS itself, against RDS's CA
// (NODE_EXTRA_CA_CERTS) and PGHOST's name, or OWNER_BOOTSTRAP_TLS_NAME for a port forward; under
// local and test pg reads PGSSLMODE as it does for every script.
export function clientConfig(args: Arguments, env: TargetEnvironment, deployEnv: DeployEnv): ClientConfig {
  const servername = tlsServerName(env, deployEnv)
  return {
    database: args.database,
    application_name: 'hearth-owner-bootstrap',
    options: STARTUP_OPTIONS,
    // The client's own give-up, so a silent connection can't hang the script.
    query_timeout: 31_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    ...(isRemote(deployEnv)
      ? { ssl: { rejectUnauthorized: true, ...(servername === undefined ? {} : { servername }) } }
      : {}),
  }
}

// Makes the client and connects it, in one try: pg's constructor throws on a setting it can't use
// (PGSSLNEGOTIATION direct without TLS, say), and that is a failure to connect too, exit 2 with its
// connect_failed line, never the unexpected line's "run it again" (PD-132).
export async function openClient(config: ClientConfig): Promise<{ client: Client } | { outcome: Outcome }> {
  try {
    const client = new Client(config)
    // A connection the server ends emits 'error' on the client, which without a listener would
    // crash the process; the statement in flight rejects either way, and the printer reports it.
    client.on('error', () => {})
    await client.connect()
    return { client }
  } catch (error) {
    return { outcome: { lines: [connectFailure(error)], exit: EXIT.wrong } }
  }
}

async function main(phase: Phase, print: Print): Promise<ExitStatus> {
  const finish = (outcome: Outcome): ExitStatus => report(outcome, print)

  const args = parseArguments(process.argv.slice(2))
  if (!args.ok) return finish(refused({ kind: 'arguments', problem: args.problem }))
  phase.mode = args.value.mode
  const env = readEnvironment()
  const problems = environmentProblems(env)
  const deployEnv = deployEnvOf(env.DEPLOY_ENV)
  if (problems.length > 0 || deployEnv === undefined) {
    return finish(
      refused({ kind: 'environment', problems: problems.length > 0 ? problems : [{ code: 'deploy_env_unknown' }] }),
    )
  }
  // The input's parse, the org's name among it (orgNameProblems()), comes before any connection.
  const document = parseDocument(args.value.mode, env.input, deployEnv, dayIn(ORG_ZONE, new Date()))
  if (!document.ok) return finish(refused({ kind: 'input', problems: document.problems }))
  const checkout = await checkoutMigrations()
  if (!checkout.ok) return finish(refused({ kind: 'target', problems: [{ code: 'checkout_unreadable' }] }))
  // Minted before connecting, so a lost commit's line can name the organisation.
  const ids = { org: randomUUID(), hearth: randomUUID(), founder: randomUUID(), number: randomUUID() }

  const opened = await openClient(clientConfig(args.value, env, deployEnv))
  if ('outcome' in opened) return finish(opened.outcome)
  const { client } = opened
  const db: Queryable = { query: (text, values) => client.query(text, values === undefined ? [] : [...values]) }
  const ctx: StepContext = {
    db,
    commit: args.value.commit,
    env: deployEnv,
    database: args.value.database,
    checkout: checkout.names,
    say: print,
    committing: line => {
      print(line)
      phase.committing = line
    },
  }
  try {
    const doc = document.value
    if (doc.mode === 'set-up') await setUp(ctx, doc, ids)
    else if (doc.mode === 'recover') await recover(ctx, doc)
    else await correctNumber(ctx, doc, ids.number)
    return EXIT.done
  } catch (error) {
    return finish(outcomeOf(error, phase))
  } finally {
    await client.end().catch(() => {})
  }
}

if (import.meta.main) {
  const phase: Phase = { mode: undefined, committing: undefined }
  const print = printer(processSink)
  // The first act: an error nothing caught goes through the sanitiser, so Node's own print (which
  // would show a DatabaseError's detail) never runs; a stop prints its own line and exits 3 before
  // "committing" or 4 after. The server rolls back a transaction whose connection ends.
  const fail = (error: unknown) => process.exit(report(outcomeOf(error, phase), print))
  process.on('uncaughtException', fail)
  process.on('unhandledRejection', fail)
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => process.exit(report(interrupted(phase), print)))
  }
  process.exitCode = await main(phase, print)
}
