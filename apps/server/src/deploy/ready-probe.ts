// The readiness probe (C0.11, C11-D53): reads every new task's /ready before the deploy pipeline
// calls a release good, without serving /ready through the load balancer. It runs from the server
// image as its own one-off task (`node src/deploy/ready-probe.ts --gate=<roles>` or `--gate=none`),
// never inside a server role, and RPB-01 to RPB-05 test it.
//
// It has two inputs. PROBE_TARGETS, the run's only override and the only variable it reads, names
// each task to ask as role=address:port, comma-separated (an IPv4 address; never role@address, which
// has an email's shape). The gate, the roles whose /ready must answer 200, is the one command
// argument, written into the task definition from the profile's readyGate, `none` while that is
// empty. It is an argument rather than a variable so that changing it is a command override, which
// A7's command rule alarms on in prod, whoever makes it (non-prod has no A7). A7's environment rule
// deliberately lets hearth-gh-deploy's override of prod's probe through whatever it names,
// NODE_OPTIONS included, which Node reads before this file runs, so what keeps a release gated is
// PR 4's DPW case, which pins the override to PROBE_TARGETS alone (TECH-SPEC T24 items 5 and 15).
//
// It loads no config and opens no connection but its fetches: loadConfig() would demand the server's
// variables, and the probe starts with those two inputs alone. Each fetch has CHECK_TIMEOUT_MS plus a
// second, so a dependency that hangs shows as /ready's own failing check rather than as no answer; a
// round runs every 3 s for up to 60 s, until every gated target answers 200, and with nothing gated
// one round reports and gates nothing (C0.11, whose every /ready fails on the placeholders).
//
// It prints one line per target at the end, `<role> <index> <status> <failing>`: the HTTP status or
// no-answer, and the failing checks' names, each a code identifier or `?`, or `-` for none. It never
// prints an address, a port, a URL, a body, an error message or a stack, so its log in
// /hearth/<env>/probe holds no address, body or error, only each target's role, index, status and
// check names. Exit 0 when every gated target answered 200, 1 when one didn't by the deadline, 2 on
// bad input, naming PROBE_TARGETS or --gate.
import { isIPv4 } from 'node:net'
import { CHECK_TIMEOUT_MS } from '#src/ready.ts'

export const PROBE_ROLES = ['api', 'realtime', 'worker'] as const
export type ProbeRole = (typeof PROBE_ROLES)[number]

// One task to ask: its role, its place among that role's targets (from 0, in PROBE_TARGETS's order),
// and where it listens.
export interface Target {
  role: ProbeRole
  index: number
  address: string
  port: number
}

// Bad input. The message names the input (PROBE_TARGETS or --gate) and the problem, never its value.
export class ProbeInputError extends Error {}

const isRole = (value: string): value is ProbeRole => (PROBE_ROLES as readonly string[]).includes(value)

// The tasks PROBE_TARGETS names: role=address:port, comma-separated, each address IPv4 and each port
// 1 to 65535, with no space or empty entry.
export function parseTargets(text: string | undefined): Target[] {
  if (text === undefined) throw new ProbeInputError('PROBE_TARGETS is unset')
  if (text === '') throw new ProbeInputError('PROBE_TARGETS is empty')
  const counts = new Map<ProbeRole, number>()
  return text.split(',').map(entry => {
    const shape = /^([^=]+)=([^:]+):(\d{1,5})$/.exec(entry)
    if (shape === null) throw new ProbeInputError("PROBE_TARGETS has an entry that isn't role=address:port")
    const [, role = '', address = '', portText = ''] = shape
    if (!isRole(role)) throw new ProbeInputError('PROBE_TARGETS names an unknown role')
    if (!isIPv4(address)) throw new ProbeInputError("PROBE_TARGETS has an address that isn't IPv4")
    const port = Number(portText)
    if (port < 1 || port > 65_535 || String(port) !== portText) {
      throw new ProbeInputError('PROBE_TARGETS has a port outside 1 to 65535')
    }
    const index = counts.get(role) ?? 0
    counts.set(role, index + 1)
    return { role, index, address, port }
  })
}

// The gated roles: the one argument, --gate=none or --gate=<roles> (comma-separated, each once), and
// every gated role has a target, since a gate with nothing to ask would pass by default.
export function parseGate(argv: readonly string[], targets: readonly Target[]): ProbeRole[] {
  const [argument] = argv
  if (argv.length !== 1 || argument === undefined || !argument.startsWith('--gate=')) {
    throw new ProbeInputError('--gate must be the one argument')
  }
  const value = argument.slice('--gate='.length)
  if (value === '') throw new ProbeInputError('--gate is empty')
  if (value === 'none') return []
  const roles = value.split(',')
  if (roles.some(role => role === '')) throw new ProbeInputError("--gate isn't a comma-separated list of roles")
  const gate: ProbeRole[] = []
  for (const role of roles) {
    if (!isRole(role)) throw new ProbeInputError('--gate names an unknown role')
    if (gate.includes(role)) throw new ProbeInputError('--gate names a role twice')
    if (!targets.some(target => target.role === role)) throw new ProbeInputError('--gate names a role with no target')
    gate.push(role)
  }
  return gate
}

export interface ProbeTiming {
  // How long one fetch of /ready may take, its body included.
  timeoutMs: number
  // How often a round starts.
  intervalMs: number
  // How long after the first round no round starts.
  deadlineMs: number
}

export const PROBE_TIMING: ProbeTiming = { timeoutMs: CHECK_TIMEOUT_MS + 1000, intervalMs: 3000, deadlineMs: 60_000 }

// What one target last answered: the HTTP status, or no-answer when it refused, timed out or broke off.
export interface Answer {
  status: number | 'no-answer'
  failing: string[]
}

// The largest /ready body the probe reads; a larger one reports no failing check.
const BODY_LIMIT = 4096
// A check's name the probe prints as it is; any other is printed as `?`.
const CHECK_NAME = /^[a-z_]{1,32}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// The keys of /ready's checks whose value isn't 'ok', sorted by the raw key, each printed as itself if
// it is a code identifier and as `?` otherwise, and never deduplicated, so a reader can count them. A
// body with no checks object reports none.
export function failingChecks(body: unknown): string[] {
  if (!isRecord(body) || !isRecord(body.checks)) return []
  const checks = body.checks
  return Object.keys(checks)
    .sort()
    .filter(name => checks[name] !== 'ok')
    .map(name => (CHECK_NAME.test(name) ? name : '?'))
}

export function line(target: Target, answer: Answer): string {
  return `${target.role} ${target.index} ${answer.status} ${answer.failing.join(',') || '-'}`
}

// The body, parsed, or undefined when it isn't JSON or is larger than BODY_LIMIT. Reading it stops at
// the limit, and the fetch's signal bounds it in time.
async function readBody(response: Response): Promise<unknown> {
  if (response.body === null) return undefined
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > BODY_LIMIT) {
      await reader.cancel()
      return undefined
    }
    chunks.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

// One fetch of a target's /ready. A refusal, a timeout or a body cut off is no answer; nothing about
// why is kept, so nothing about it can be printed. A redirect is reported by its status, never
// followed.
async function ask(target: Target, timeoutMs: number): Promise<Answer> {
  try {
    const response = await fetch(`http://${target.address}:${target.port}/ready`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    })
    return { status: response.status, failing: failingChecks(await readBody(response)) }
  } catch {
    return { status: 'no-answer', failing: [] }
  }
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// Asks every target each round, keeping each one's last answer, until every gated target's last
// answer is 200 (at once with nothing gated) or no further round can start before the deadline. The
// lines come in the targets' order.
export async function probe(
  targets: readonly Target[],
  gate: readonly ProbeRole[],
  timing: ProbeTiming = PROBE_TIMING,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<{ lines: string[]; code: 0 | 1 }> {
  const deadline = now() + timing.deadlineMs
  for (;;) {
    const began = now()
    const answers = await Promise.all(targets.map(target => ask(target, timing.timeoutMs)))
    const lines = targets.map((target, i) => line(target, answers[i] ?? { status: 'no-answer', failing: [] }))
    const passed = targets.every((target, i) => !gate.includes(target.role) || answers[i]?.status === 200)
    if (passed) return { lines, code: 0 }
    const next = began + timing.intervalMs
    if (next >= deadline) return { lines, code: 1 }
    await sleep(Math.max(0, next - now()))
  }
}

// The entry: parses PROBE_TARGETS, then the gate, probes, and writes each line. Bad input writes one
// line naming the input and returns 2; an unexpected failure writes `probe: failed` alone and returns
// 1, so no error message or stack reaches the log.
export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  write: (text: string) => unknown = text => process.stdout.write(text),
): Promise<0 | 1 | 2> {
  let targets: Target[]
  let gate: ProbeRole[]
  try {
    targets = parseTargets(env.PROBE_TARGETS)
    gate = parseGate(argv, targets)
  } catch (error) {
    write(error instanceof ProbeInputError ? `probe: ${error.message}\n` : 'probe: failed\n')
    return error instanceof ProbeInputError ? 2 : 1
  }
  try {
    const { lines, code } = await probe(targets, gate)
    for (const text of lines) write(`${text}\n`)
    return code
  } catch {
    write('probe: failed\n')
    return 1
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2), process.env)
