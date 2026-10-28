// The Owner bootstrap script run as a person runs it (test-only; the image leaves testing/ out),
// for CI's check of the script (apps/server/scripts/check-owner-bootstrap.ts, BSS-01 to BSS-16 and
// BSR-01 to BSR-05) and the integration harness's first org (testing/stack.ts, startStack({
// firstOrg: 'bootstrap' }); BSI-01 to BSI-03). TECH-SPEC T22 items 63 to 71, PD-133.
//
// runOwnerBootstrap() spawns the script as a child process from the repository's root, with an
// environment built from nothing but PATH, DEPLOY_ENV (test unless a case says otherwise), where
// to connect (PGHOST, PGPORT), the throwaway login it connects as (PGUSER, PGPASSWORD) and its
// input in OWNER_BOOTSTRAP_INPUT: no PGDATABASE, since --database names the database, and none of
// CI's or a coding agent's markers unless a case adds one. This file is the only one that names the
// script's path (scripts/guards/owner-bootstrap.test.ts, BSG-02); nothing under apps/ imports the
// script's modules, so the check sees only what the script prints and writes.
//
// Every value here is fictional (CLAUDE.md, Security and privacy; T22 item 70): the names, a
// number from Ofcom's range reserved for drama (+44 7700 900000 to +44 7700 900999, which the
// script accepts under DEPLOY_ENV local and test alone), facts no provider wrote, and reasons that
// name roles. Nothing here calls Twilio or any provider; the script can't. makeBootstrapLogin()
// makes a login of the bootstrap login's shape (T22 item 65): LOGIN NOINHERIT, no power of its
// own, its one membership hearth_owner, granted with SET and neither INHERIT nor ADMIN.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { Client as PgClient } from 'pg'

// The script and the folder it runs from. Its own checks read the checkout's db/migrations/.
const SCRIPT = new URL('../../../../scripts/owner-bootstrap.ts', import.meta.url)
const ROOT = new URL('../../../../', import.meta.url)

export type BootstrapMode = 'set-up' | 'recover' | 'correct-number'

// The application_name the script connects with, by which a check finds its backend.
export const BOOTSTRAP_APPLICATION = 'hearth-owner-bootstrap'

// The fictional founder (the first Owner and DPO, D35), as they would type their number, and the
// E.164 sign-in's parser (normalisePhone()) makes of it; the number the correction puts right; and
// the org's name, which the notice prints. None is a seed persona's.
export const FOUNDER_NAME = 'Wren Example'
export const FOUNDER_NUMBER = '+44 7700 900123'
export const FOUNDER_E164 = '+447700900123'
export const CORRECTED_NUMBER = '+44 7700 900145'
export const CORRECTED_E164 = '+447700900145'
export const ORG_NAME = 'Kestrel Test Freight'
// Reasons, as the runbook asks for them: what this is, which role decided, where the records are.
export const SET_UP_REASON = 'Check set-up of the first Owner and DPO, as the DPO decided (heron file)'
export const RECOVERY_REASON = 'Check re-clear: Twilio Verify withdrawn and no DPO signed in (heron file)'
export const CORRECTION_REASON = 'Check correction of the founder number, at their request (heron file)'

// A provider's facts as the set-up document gives them (TransferFactsBody's fields), complete enough
// to clear and to publish (no AI_COPY word in the stated text), each text holding the word Plover,
// which nothing the script prints ever does (BSS-14).
export function bootstrapFacts(reviewOn: string): Record<string, unknown> {
  return {
    services: 'Plover sign-in codes by text message',
    dataTypes: 'Plover mobile number and the code sent',
    processingCountries: ['us', 'US'],
    storageCountries: ['US'],
    countriesConfirmed: 'Plover agreement, annex 1',
    safeguard: 'dpa',
    safeguardReference: 'Plover agreement',
    certificateVerifiedOn: null,
    dpaTermsConfirmed: true,
    training: 'not_applicable',
    zeroRetention: 'not_applicable',
    providerRetention: '  Plover records kept for thirty days  ',
    retentionConfirmed: 'Plover agreement, annex 2',
    onwardRecipients: 'Plover carriers only',
    reviewOn,
  }
}
// The text facts bootstrapFacts() gives, as stored (trimmed), for a check that no output holds one.
export const FACT_TEXTS: readonly string[] = [
  'Plover sign-in codes by text message',
  'Plover mobile number and the code sent',
  'Plover agreement, annex 1',
  'Plover agreement',
  'Plover records kept for thirty days',
  'Plover agreement, annex 2',
  'Plover carriers only',
]

// The day (YYYY-MM-DD) a number of days from the day an instant (now, unless given) falls on in a
// time zone (Asia/Singapore, every new org's zone, unless given), as the function and the
// clearance trigger judge review dates.
export function daysAhead(days: number, zone = 'Asia/Singapore', at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(at)
    .reduce<Record<string, string>>((all, part) => Object.assign(all, { [part.type]: part.value }), {})
  const today = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  return new Date(today + days * 86_400_000).toISOString().slice(0, 10)
}

// The set-up documents' review dates, Twilio's 60 days ahead and AWS's a year ahead of the day
// this module loaded, worked out once and never again: every document a run makes (the check's
// templates and its cases, the harness's first org) carries the same two, so a run that crosses
// midnight in Singapore still finds the entry's own date where a case expects it (design §10.2
// BSS-07: both dates pinned in the fixture, since the function diffs review_on too).
export const REVIEW_DATES: { readonly twilio: string; readonly aws: string } = Object.freeze({
  twilio: daysAhead(60),
  aws: daysAhead(365),
})

// The set-up document (T22 item 64), with the founder, the org, the reason and both providers'
// facts, with REVIEW_DATES' review dates unless given, written for DEPLOY_ENV test. A case changes
// what it tests with patch, which replaces keys whole.
export function setUpDocument(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    environment: 'test',
    organisation: ORG_NAME,
    founder: { fullName: FOUNDER_NAME, number: FOUNDER_NUMBER },
    reason: SET_UP_REASON,
    twilio: bootstrapFacts(REVIEW_DATES.twilio),
    aws: bootstrapFacts(REVIEW_DATES.aws),
    ...patch,
  }
}

// The recovery document (T22 item 64): the named DPO, the review date and the stated facts whose
// values come from the DPO's record.
export function recoverDocument(o: {
  dpo: string
  reviewOn: string
  fromEntry?: readonly string[]
  reason?: string
  environment?: string
}): Record<string, unknown> {
  return {
    environment: o.environment ?? 'test',
    dpo: o.dpo,
    reviewOn: o.reviewOn,
    reason: o.reason ?? RECOVERY_REASON,
    ...(o.fromEntry === undefined ? {} : { fromEntry: [...o.fromEntry] }),
  }
}

// The correction document (T22 item 64): the founder's right number.
export function correctionDocument(o: { number?: string; reason?: string; environment?: string } = {}) {
  return {
    environment: o.environment ?? 'test',
    number: o.number ?? CORRECTED_NUMBER,
    reason: o.reason ?? CORRECTION_REASON,
  }
}

export interface BootstrapLogin {
  user: string
  password: string
  // Drops the login (and with it its membership and any setting made for it). Safe to call twice.
  drop(): Promise<void>
}

// A throwaway login of the bootstrap login's shape (T22 item 65; as check-migrations.sh
// makes its migrator): LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB, a random
// password, and hearth_owner its one membership, granted WITH INHERIT FALSE, SET TRUE (ADMIN off),
// so its power is hearth_owner's, taken by the script's start-up option, and no more. prefix names
// who made it (owner_bootstrap_check, owner_bootstrap_it), so a leftover says where it came from.
export async function makeBootstrapLogin(
  superuser: Pick<PgClient, 'query'>,
  prefix: 'owner_bootstrap_check' | 'owner_bootstrap_it',
): Promise<BootstrapLogin> {
  const user = `${prefix}_${randomBytes(6).toString('hex')}`
  const password = randomBytes(16).toString('hex')
  await superuser.query(
    `create role ${user} login noinherit nosuperuser nobypassrls nocreaterole nocreatedb password '${password}'`,
  )
  await superuser.query(`grant hearth_owner to ${user} with inherit false, set true`)
  return {
    user,
    password,
    drop: async () => {
      await superuser.query(`drop role if exists ${user}`)
    },
  }
}

export interface BootstrapRun {
  mode: BootstrapMode
  // The exit status, or null when a signal ended it (the run's own timeout among them).
  status: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  // Each stdout line as it arrived, with the milliseconds since the spawn.
  lines: { text: string; at: number }[]
  // When it was spawned (ms since the epoch), and how long it took, spawn to exit: its transaction
  // began between the two, so a check can bracket the day the script's now() fell on.
  started: number
  ms: number
}

export interface BootstrapRunOptions {
  // The database --database names.
  database: string
  commit?: boolean
  // The document, JSON-encoded; a string is passed as it is (a truncated paste, say); undefined
  // leaves OWNER_BOOTSTRAP_INPUT unset.
  input?: unknown
  login: { user: string; password: string }
  host: string
  port: number
  // Variables added to (or, for DEPLOY_ENV, PGHOST and PGPORT, replacing) the run's environment:
  // CI or a marker, PGDATABASE, PGSSLMODE, PGSSLNEGOTIATION, OWNER_BOOTSTRAP_TLS_NAME.
  env?: Readonly<Record<string, string>>
  // The arguments after the script, in place of `<mode> --database <name> [--commit]`, for the
  // command line's own refusals.
  args?: readonly string[]
  // Called with each stdout line as it arrives (a check that acts on the committing line).
  onLine?: (line: string) => void
  // Ends a run that outlives it (default 60 s) with SIGKILL, so a hung run fails rather than hangs.
  timeoutMs?: number
}

// Runs the script once, as a person runs it, and answers what it printed and how it exited.
export function runOwnerBootstrap(mode: BootstrapMode, o: BootstrapRunOptions): Promise<BootstrapRun> {
  const args = o.args ?? [mode, '--database', o.database, ...(o.commit === true ? ['--commit'] : [])]
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    DEPLOY_ENV: 'test',
    PGHOST: o.host,
    PGPORT: String(o.port),
    PGUSER: o.login.user,
    PGPASSWORD: o.login.password,
    ...(o.input === undefined
      ? {}
      : { OWNER_BOOTSTRAP_INPUT: typeof o.input === 'string' ? o.input : JSON.stringify(o.input, null, 2) }),
    ...o.env,
  }
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(SCRIPT), ...args], {
      cwd: fileURLToPath(ROOT),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let partial = ''
    const lines: { text: string; at: number }[] = []
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      partial += chunk
      let end = partial.indexOf('\n')
      while (end !== -1) {
        const text = partial.slice(0, end)
        partial = partial.slice(end + 1)
        lines.push({ text, at: Date.now() - started })
        o.onLine?.(text)
        end = partial.indexOf('\n')
      }
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), o.timeoutMs ?? 60_000)
    child.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      if (partial !== '') lines.push({ text: partial, at: Date.now() - started })
      resolve({ mode, status, signal, stdout, stderr, lines, started, ms: Date.now() - started })
    })
  })
}

// What a set-up made, read back as the superuser: the org and its Hearth principal, and the founder
// with their current number.
export interface FirstOrg {
  org: { id: string; system: string }
  founder: { id: string; e164: string; phoneNumberId: string }
}

// Sets up the integration harness's first org through the script (startStack({ firstOrg:
// 'bootstrap' }); T22 item 70), in the gap after the migrations and the runtime roles' logins and
// before the write tracking starts, so the outbox sweep sees only the suite's own writes: a
// throwaway login of the bootstrap login's shape, dropped straight after the run (track() gets its
// drop too, among the stack's closers), one committing set-up under DEPLOY_ENV test with the
// fictional document (Twilio's review date 60 days ahead, AWS's a year), and the rows read back.
// Any exit but 0 throws, with what the script printed (ids and codes only, by its design).
export async function setUpFirstOrg(
  superuser: Pick<PgClient, 'query'>,
  target: { host: string; port: number; database: string },
  track: (drop: () => Promise<void>) => void,
): Promise<FirstOrg> {
  const login = await makeBootstrapLogin(superuser, 'owner_bootstrap_it')
  track(login.drop)
  let run: BootstrapRun
  try {
    run = await runOwnerBootstrap('set-up', { ...target, login, commit: true, input: setUpDocument() })
  } finally {
    await login.drop()
  }
  if (run.status !== 0) {
    throw new Error(`the Owner bootstrap script's set-up exited ${run.status}:\n${run.stdout}${run.stderr}`)
  }
  const { rows } = await superuser.query<{ org: string; system: string; founder: string; e164: string; phone: string }>(
    `select o.id as org, h.id as system, p.id as founder, n.e164, n.id as phone
     from orgs o
     join principals h on h.org_id = o.id and h.kind = 'system' and h.system_key = 'hearth'
     join people p on p.org_id = o.id
     join phone_numbers n on n.org_id = o.id and n.person_id = p.id and n.removed_at is null`,
  )
  const [made] = rows
  if (rows.length !== 1 || made === undefined) throw new Error(`the set-up left ${rows.length} founders, not one`)
  return {
    org: { id: made.org, system: made.system },
    founder: { id: made.founder, e164: made.e164, phoneNumberId: made.phone },
  }
}
