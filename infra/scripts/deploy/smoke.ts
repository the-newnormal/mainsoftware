// The smoke checks (C11-D54; TECH-SPEC T24 items 16 and 20), judged in a deploy-workflow job that holds
// no credentials: anonymous requests to `origin.<app host>`, the load balancer's own name until C0.12's
// CloudFront (C11-D43), and the read-back the deploy job wrote of what runs. SMK-01 reads the TLS
// handshake; SMK-02 asks for a sign-in code for the phone `x`, which the api answers 503 `unavailable`
// while the profile's smsProvider is unset and 400 `invalid_phone` once it is `twilio`, both before it
// reads the number or touches Valkey, so no SMS is ever sent; SMK-03 and SMK-04 send a foreign Origin,
// which the api and realtime refuse with 403; SMK-05 reads that /health and / answer the load
// balancer's fixed 404; SMK-06 and SMK-07 judge the read-back. The restore stage, which has no listener,
// gets SMK-06's services half alone. SMK-08, through the edge, is C0.12's.
//
// It always runs from the run's own checkout, so the read-back that run's deploy.yml wrote is judged by
// the code of the same commit, and reads the profile at the release it judges (--profile-at: that
// commit's profiles.ts, by `git show` into a temporary file it imports), so SMK-02 follows that
// release's smsProvider. It imports only Node's built-ins and profiles.ts's types (IG-08), so its jobs
// need no npm ci. It prints one line a check, `SMK-0n pass` or `SMK-0n fail <code>`, and never a body,
// a header value, an address or an ARN. It decides whether a release passed, so it is on the
// owner's-read list (C11-D74).
//
//   node infra/scripts/deploy/smoke.ts --env <nonprod|prod|restore> --release <commit>:<digest>
//     --readback <file> --profile-at <commit> [--restore <up|down>] [--repo <dir>] [--invert SMK-05]
//
// --restore is given with --env restore alone, and --invert SMK-05 with nonprod alone (drill-smoke,
// whose smoke must fail). Exit 0 when every check passes, 1 when one fails, 2 on bad input.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from 'node:tls'
import { pathToFileURL } from 'node:url'
import type { EnvironmentName, Profile, ServerRole } from '../../src/config/profiles.ts'

const ENVIRONMENTS: readonly EnvironmentName[] = ['nonprod', 'prod', 'restore']
const ROLES: readonly ServerRole[] = ['api', 'realtime', 'worker']
const COMMIT = /^[0-9a-f]{40}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const RELEASE = /^[0-9a-f]{40}:sha256:[0-9a-f]{64}$/
// An ECS status word (a deployment's status and rollout state, a task's last status and health).
const STATE = /^[A-Z_]{1,32}$/
const AZ = /^ap-southeast-1[a-c]$/
const PATH = /^\/[a-z0-9/_-]{0,64}$/
// How long each request may take, and the most of a body read.
const TIMEOUT_MS = 10_000
const BODY_LIMIT = 4096

// Bad input. The message names the input, never its value.
export class SmokeInputError extends Error {}

// A read-back it refuses, naming the field at fault, which becomes `readback-<field>`.
export class ReadBackError extends Error {}

export interface ReadBackDeployment {
  status: string
  rollout: string
  desired: number
  running: number
  failed: number
}

export interface ReadBackTask {
  az: string
  last: string
  health: string
  digest: string
}

export interface ReadBackService {
  role: ServerRole
  desired: number
  running: number
  deployments: ReadBackDeployment[]
  tasks: ReadBackTask[]
}

export interface ReadBackTargetGroup {
  role: 'api' | 'realtime'
  healthy: number
  other: number
  deregistration: number
  stickiness: boolean
  healthPath: string
}

// What the deploy job read back of what runs (C11-D54, C11-D61): states, counts, AZ names, settings and
// digests, never an ARN or an address.
export interface ReadBack {
  schema: 1
  env: EnvironmentName
  release: string
  probe: 'ran' | 'skipped'
  services: ReadBackService[]
  targetGroups: ReadBackTargetGroup[]
  loadBalancer: { idleTimeout: number } | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// An object with exactly these keys, or a ReadBackError naming `field`.
function exactly(value: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ReadBackError(field)
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) {
    throw new ReadBackError('key')
  }
  return value
}

function count(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new ReadBackError(field)
  return value
}

function text(value: unknown, shape: RegExp, field: string): string {
  if (typeof value !== 'string' || !shape.test(value)) throw new ReadBackError(field)
  return value
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new ReadBackError(field)
  return value
}

// Whether the JSON holds anything a read-back never carries: an ARN (in any case), an IPv4 address, or
// a run of 12 digits (an account id) outside a digest or the release's commit.
function identifyingIn(json: unknown): 'arn' | 'address' | 'account' | undefined {
  const strings: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') strings.push(value)
    else if (typeof value === 'number') strings.push(String(value))
    else if (Array.isArray(value)) value.forEach(walk)
    else if (isRecord(value)) {
      for (const [key, item] of Object.entries(value)) {
        strings.push(key)
        walk(item)
      }
    }
  }
  walk(json)
  if (strings.some(value => /arn:/i.test(value))) return 'arn'
  if (strings.some(value => /(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.])/.test(value))) return 'address'
  const bare = strings.map(value => value.replace(/sha256:[0-9a-f]{64}/g, '').replace(/^[0-9a-f]{40}(?=:|$)/, ''))
  if (bare.some(value => /\d{12}/.test(value))) return 'account'
  return undefined
}

// The deploy job's read-back, schema 1, checked whole: exactly its keys at every level, each value of
// its shape, and nothing identifying anywhere.
export function parseReadBack(json: unknown): ReadBack {
  const identifying = identifyingIn(json)
  if (identifying !== undefined) throw new ReadBackError(identifying)
  const top = exactly(json, ['schema', 'env', 'release', 'probe', 'services', 'targetGroups', 'loadBalancer'], 'shape')
  if (top.schema !== 1) throw new ReadBackError('schema')
  if (typeof top.env !== 'string' || !(ENVIRONMENTS as readonly string[]).includes(top.env)) {
    throw new ReadBackError('env')
  }
  if (top.probe !== 'ran' && top.probe !== 'skipped') throw new ReadBackError('probe')
  const services = list(top.services, 'services').map(entry => {
    const service = exactly(entry, ['role', 'desired', 'running', 'deployments', 'tasks'], 'services')
    if (typeof service.role !== 'string' || !(ROLES as readonly string[]).includes(service.role)) {
      throw new ReadBackError('services')
    }
    return {
      role: service.role as ServerRole,
      desired: count(service.desired, 'services'),
      running: count(service.running, 'services'),
      deployments: list(service.deployments, 'deployments').map(item => {
        const deployment = exactly(item, ['status', 'rollout', 'desired', 'running', 'failed'], 'deployments')
        return {
          status: text(deployment.status, STATE, 'deployments'),
          rollout: text(deployment.rollout, STATE, 'deployments'),
          desired: count(deployment.desired, 'deployments'),
          running: count(deployment.running, 'deployments'),
          failed: count(deployment.failed, 'deployments'),
        }
      }),
      tasks: list(service.tasks, 'tasks').map(item => {
        const task = exactly(item, ['az', 'last', 'health', 'digest'], 'tasks')
        return {
          az: text(task.az, AZ, 'tasks'),
          last: text(task.last, STATE, 'tasks'),
          health: text(task.health, STATE, 'tasks'),
          digest: text(task.digest, DIGEST, 'tasks'),
        }
      }),
    }
  })
  const targetGroups = list(top.targetGroups, 'target-groups').map(entry => {
    const group = exactly(
      entry,
      ['role', 'healthy', 'other', 'deregistration', 'stickiness', 'healthPath'],
      'target-groups',
    )
    if (group.role !== 'api' && group.role !== 'realtime') throw new ReadBackError('target-groups')
    if (typeof group.stickiness !== 'boolean') throw new ReadBackError('target-groups')
    return {
      role: group.role,
      healthy: count(group.healthy, 'target-groups'),
      other: count(group.other, 'target-groups'),
      deregistration: count(group.deregistration, 'target-groups'),
      stickiness: group.stickiness,
      healthPath: text(group.healthPath, PATH, 'target-groups'),
    } satisfies ReadBackTargetGroup
  })
  const loadBalancer =
    top.loadBalancer === null
      ? null
      : { idleTimeout: count(exactly(top.loadBalancer, ['idleTimeout'], 'load-balancer').idleTimeout, 'load-balancer') }
  return {
    schema: 1,
    env: top.env as EnvironmentName,
    release: text(top.release, RELEASE, 'release'),
    probe: top.probe,
    services,
    targetGroups,
    loadBalancer,
  }
}

// One check's verdict: pass, or fail with a code (`status-<n>`, `error-<word>`, `tls-<reason>`,
// `no-answer`, `readback-<field>`, `inverted`), which carries no value from an answer but its status
// and the api's own error word.
export type Verdict = { pass: true } | { pass: false; code: string }
const PASS: Verdict = { pass: true }
const fail = (code: string): Verdict => ({ pass: false, code })

export interface TlsAnswer {
  authorized: boolean
  protocol: string | null
  // The certificate's subjectaltname, as Node gives it (`DNS:a, DNS:b`).
  altNames: string | undefined
}

// An HTTP answer as the smoke keeps it: the status, and for SMK-02 the api's JSON `error` word.
export type HttpAnswer = { status: number; error?: string } | { upgraded: true } | 'no-answer'

// SMK-01: TLS 1.2 or 1.3, a certificate that verifies, naming the host.
export function smk01(tls: TlsAnswer | 'no-answer', host: string): Verdict {
  if (tls === 'no-answer') return fail('no-answer')
  if (!tls.authorized) return fail('tls-unauthorized')
  if (tls.protocol !== 'TLSv1.2' && tls.protocol !== 'TLSv1.3') return fail('tls-protocol')
  const names = (tls.altNames ?? '').split(',').map(name => name.trim())
  return names.includes(`DNS:${host}`) ? PASS : fail('tls-name')
}

// An error word as a code carries it: a code identifier as it is, anything else `other`.
const word = (error: string | undefined) =>
  error === undefined ? 'none' : /^[a-z_]{1,32}$/.test(error) ? error : 'other'

// SMK-02: sign-in from the app's origin answers before any SMS: 503 `unavailable` while smsProvider is
// unset, 400 `invalid_phone` once it is twilio.
export function smk02(answer: HttpAnswer, smsProvider: 'twilio' | undefined): Verdict {
  if (answer === 'no-answer') return fail('no-answer')
  if ('upgraded' in answer) return fail('status-101')
  const [status, error] = smsProvider === 'twilio' ? [400, 'invalid_phone'] : [503, 'unavailable']
  if (answer.status !== status) return fail(`status-${answer.status}`)
  return answer.error === error ? PASS : fail(`error-${word(answer.error)}`)
}

const statusIs = (answer: HttpAnswer, status: number): Verdict => {
  if (answer === 'no-answer') return fail('no-answer')
  if ('upgraded' in answer) return fail('status-101')
  return answer.status === status ? PASS : fail(`status-${answer.status}`)
}

// SMK-03: a POST from another origin is refused, 403.
export const smk03 = (answer: HttpAnswer): Verdict => statusIs(answer, 403)

// SMK-04: a WebSocket upgrade from another origin is refused, 403; an upgrade (101) or the load
// balancer's or the api's 404 fails.
export const smk04 = (answer: HttpAnswer): Verdict => statusIs(answer, 403)

// SMK-05: /health and / answer 404 at the load balancer (nothing but /ws and /api/* reaches a task).
// Inverted, for drill-smoke, two 404s fail.
export function smk05(answers: readonly [HttpAnswer, HttpAnswer], invert: boolean): Verdict {
  const verdicts = answers.map(answer => statusIs(answer, 404))
  const first = verdicts.find(verdict => !verdict.pass)
  if (invert) return first === undefined ? fail('inverted') : PASS
  return first ?? PASS
}

const one = <T>(items: readonly T[], test: (item: T) => boolean) => items.filter(test).length === 1

// SMK-06: each service has exactly one deployment, PRIMARY and COMPLETED; running equals desired;
// every task runs, on the run's own digest (so a run that changed nothing fails rather than passing on
// an earlier release's tasks); each target group's healthy count equals its service's running count
// with no target in another state; realtime runs at least 2 tasks in at least 2 AZs; the worker's
// tasks are HEALTHY. The restore stage gets the services half: up, running equals desired at the
// profile's counts on the digest; down, desired and running 0 (a stack `down` skipped reads as no
// services).
export function smk06(
  readBack: ReadBack,
  release: string,
  profile: Profile,
  env: EnvironmentName,
  restore?: 'up' | 'down',
): Verdict {
  if (readBack.env !== env) return fail('readback-env')
  if (readBack.release !== release) return fail('readback-release')
  const digest = release.slice(41)
  if (env === 'restore' && restore === 'down') {
    const up = readBack.services.find(
      service => service.desired !== 0 || service.running !== 0 || service.tasks.length > 0,
    )
    return up === undefined ? PASS : fail(`readback-${up.role}-running`)
  }
  if (readBack.services.length !== ROLES.length || !ROLES.every(role => one(readBack.services, s => s.role === role))) {
    return fail('readback-services')
  }
  for (const role of ROLES) {
    const service = readBack.services.find(s => s.role === role)
    if (service === undefined) return fail('readback-services')
    const [deployment, ...others] = service.deployments
    if (deployment === undefined || others.length > 0) return fail(`readback-${role}-deployments`)
    if (deployment.status !== 'PRIMARY' || deployment.rollout !== 'COMPLETED') return fail(`readback-${role}-rollout`)
    const wanted = env === 'restore' ? profile.services[role].count : service.desired
    if (
      service.desired < 1 ||
      service.desired !== wanted ||
      service.running !== service.desired ||
      deployment.desired !== service.desired ||
      deployment.running !== service.desired
    ) {
      return fail(`readback-${role}-running`)
    }
    if (service.tasks.length !== service.running || service.tasks.some(task => task.last !== 'RUNNING')) {
      return fail(`readback-${role}-tasks`)
    }
    if (service.tasks.some(task => task.digest !== digest)) return fail(`readback-${role}-digest`)
    if (env === 'restore') continue
    if (role === 'realtime' && (service.tasks.length < 2 || new Set(service.tasks.map(task => task.az)).size < 2)) {
      return fail('readback-realtime-azs')
    }
    if (role === 'worker' && service.tasks.some(task => task.health !== 'HEALTHY'))
      return fail('readback-worker-health')
    if (role === 'api' || role === 'realtime') {
      const groups = readBack.targetGroups.filter(group => group.role === role)
      const [group] = groups
      if (groups.length !== 1 || group === undefined || group.healthy !== service.running || group.other !== 0) {
        return fail(`readback-${role}-targets`)
      }
    }
  }
  return PASS
}

// SMK-07: the load balancer's settings T19 item 16 needs: a deregistration delay of at most 10 s and
// no stickiness on both target groups, realtime checked on /ready/local and the api on /health, and an
// idle timeout of at least 60 s.
export function smk07(readBack: ReadBack): Verdict {
  if (readBack.loadBalancer === null) return fail('readback-load-balancer')
  for (const role of ['api', 'realtime'] as const) {
    const groups = readBack.targetGroups.filter(group => group.role === role)
    const [group] = groups
    if (groups.length !== 1 || group === undefined) return fail(`readback-${role}-target-group`)
    if (group.deregistration > 10) return fail(`readback-${role}-deregistration`)
    if (group.stickiness) return fail(`readback-${role}-stickiness`)
    if (group.healthPath !== (role === 'realtime' ? '/ready/local' : '/health')) {
      return fail(`readback-${role}-health-path`)
    }
  }
  return readBack.loadBalancer.idleTimeout >= 60 ? PASS : fail('readback-idle-timeout')
}

// One request as the transport sends it, and the raw answer it gives back: the status with at most
// BODY_LIMIT bytes of the body (only when asked), an upgrade, or no answer.
export interface HttpRequest {
  method: 'GET' | 'POST'
  path: string
  headers: Record<string, string>
  body?: string
  readBody: boolean
}
export type RawAnswer = { status: number; body?: Uint8Array } | { upgraded: true } | 'no-answer'

export interface Transport {
  tls: (host: string) => Promise<TlsAnswer | 'no-answer'>
  http: (host: string, request: HttpRequest) => Promise<RawAnswer>
}

// Node's https and tls, each call bounded by TIMEOUT_MS, never following a redirect. `address`, `port`
// and `ca` exist for the tests' local server; the smoke itself connects to the host on 443 and trusts
// Node's own roots.
export function nodeTransport(options: { address?: string; port?: number; ca?: string } = {}): Transport {
  const port = options.port ?? 443
  return {
    tls: host =>
      new Promise(resolve => {
        const socket = connect({
          host: options.address ?? host,
          servername: host,
          port,
          minVersion: 'TLSv1.2',
          rejectUnauthorized: false,
          ...(options.ca === undefined ? {} : { ca: options.ca }),
        })
        const timer = setTimeout(() => {
          socket.destroy()
          resolve('no-answer')
        }, TIMEOUT_MS)
        socket.once('secureConnect', () => {
          clearTimeout(timer)
          const certificate = socket.getPeerCertificate()
          resolve({
            authorized: socket.authorized,
            protocol: socket.getProtocol(),
            altNames: certificate.subjectaltname,
          })
          socket.destroy()
        })
        socket.once('error', () => {
          clearTimeout(timer)
          resolve('no-answer')
        })
      }),
    http: (host, wanted) =>
      new Promise(resolve => {
        let settled = false
        const done = (answer: RawAnswer) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(answer)
        }
        const outgoing = request({
          host: options.address ?? host,
          servername: host,
          port,
          method: wanted.method,
          path: wanted.path,
          headers: { host, ...wanted.headers },
          agent: false,
          minVersion: 'TLSv1.2',
          ...(options.ca === undefined ? {} : { ca: options.ca }),
        })
        const timer = setTimeout(() => {
          outgoing.destroy()
          done('no-answer')
        }, TIMEOUT_MS)
        outgoing.on('upgrade', (_response, socket) => {
          socket.destroy()
          done({ upgraded: true })
        })
        outgoing.on('response', response => {
          const status = response.statusCode ?? 0
          if (!wanted.readBody) {
            response.destroy()
            done({ status })
            return
          }
          const chunks: Buffer[] = []
          let size = 0
          response.on('data', (chunk: Buffer) => {
            size += chunk.byteLength
            if (size > BODY_LIMIT) {
              response.destroy()
              done({ status })
              return
            }
            chunks.push(chunk)
          })
          response.on('end', () => done({ status, body: Buffer.concat(chunks) }))
          response.on('error', () => done({ status }))
          response.on('close', () => done({ status }))
        })
        outgoing.on('error', () => done('no-answer'))
        outgoing.end(wanted.body)
      }),
  }
}

// The api's JSON `error` word from a body, or undefined: nothing else of a body is kept.
function errorWord(body: Uint8Array | undefined): string | undefined {
  if (body === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body).toString('utf8'))
    return isRecord(parsed) && typeof parsed.error === 'string' ? parsed.error : undefined
  } catch {
    return undefined
  }
}

const kept = (raw: RawAnswer, readError = false): HttpAnswer => {
  if (raw === 'no-answer' || 'upgraded' in raw) return raw
  return readError ? { status: raw.status, error: errorWord(raw.body) } : { status: raw.status }
}

export interface LiveAnswers {
  tls: TlsAnswer | 'no-answer'
  signIn: HttpAnswer
  foreignPost: HttpAnswer
  foreignUpgrade: HttpAnswer
  health: HttpAnswer
  root: HttpAnswer
}

// The origin a foreign request claims: a reserved name that never resolves (RFC 2606).
const FOREIGN_ORIGIN = 'https://example.invalid'

// The anonymous requests SMK-01 to SMK-05 judge, one at a time.
export async function liveAnswers(host: string, appOrigin: string, transport: Transport): Promise<LiveAnswers> {
  const signIn = (origin: string): HttpRequest => ({
    method: 'POST',
    path: '/api/auth/otp/request',
    headers: { 'content-type': 'application/json', origin },
    body: '{"phone":"x"}',
    readBody: origin === appOrigin,
  })
  const get = (path: string): HttpRequest => ({ method: 'GET', path, headers: {}, readBody: false })
  return {
    tls: await transport.tls(host),
    signIn: kept(await transport.http(host, signIn(appOrigin)), true),
    foreignPost: kept(await transport.http(host, signIn(FOREIGN_ORIGIN))),
    foreignUpgrade: kept(
      await transport.http(host, {
        method: 'GET',
        path: '/ws',
        headers: {
          connection: 'Upgrade',
          upgrade: 'websocket',
          'sec-websocket-version': '13',
          'sec-websocket-key': randomBytes(16).toString('base64'),
          origin: FOREIGN_ORIGIN,
        },
        readBody: false,
      }),
    ),
    health: kept(await transport.http(host, get('/health'))),
    root: kept(await transport.http(host, get('/'))),
  }
}

// What the smoke reads of a release's profiles.ts.
export interface ProfilesAt {
  PROFILES: Readonly<Record<EnvironmentName, Profile>>
  appHost: (environment: EnvironmentName) => string | undefined
  originHost: (environment: EnvironmentName) => string | undefined
}

// profiles.ts as the commit has it, read by `git show` into a temporary folder and imported from there
// (it imports nothing), the folder removed whatever happens.
export async function profilesAt(commit: string, repo: string): Promise<ProfilesAt> {
  let source: string
  try {
    source = execFileSync('git', ['show', `${commit}:infra/src/config/profiles.ts`], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    throw new SmokeInputError('--profile-at names no commit with infra/src/config/profiles.ts in this clone')
  }
  const folder = mkdtempSync(join(tmpdir(), 'hearth-profiles-'))
  try {
    const file = join(folder, 'profiles.ts')
    writeFileSync(file, source)
    const module: unknown = await import(pathToFileURL(file).href)
    if (
      !isRecord(module) ||
      !isRecord(module.PROFILES) ||
      typeof module.appHost !== 'function' ||
      typeof module.originHost !== 'function'
    ) {
      throw new SmokeInputError("--profile-at's profiles.ts is not one the smoke can read")
    }
    return module as unknown as ProfilesAt
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

// The flags a command line gives, each `--name value` once. A SmokeInputError names the flag at
// fault, never a value.
function readFlags(argv: readonly string[], allowed: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i] ?? ''
    if (!name.startsWith('--') || !allowed.includes(name.slice(2))) {
      throw new SmokeInputError(
        /^--[a-z-]{1,32}$/.test(name) ? `${name} is not an option` : "an argument isn't an option",
      )
    }
    const value = argv[i + 1]
    if (value === undefined) throw new SmokeInputError(`${name} needs a value`)
    if (flags.has(name.slice(2))) throw new SmokeInputError(`${name} is given twice`)
    flags.set(name.slice(2), value)
  }
  return flags
}

export interface Io {
  write: (text: string) => unknown
  readText: (path: string) => string
  cwd: string
  transport: Transport
}

const defaultIo: Io = {
  write: text => process.stdout.write(text),
  readText: path => readFileSync(path, 'utf8'),
  cwd: process.cwd(),
  transport: nodeTransport(),
}

interface Args {
  env: EnvironmentName
  release: string
  readback: string
  profileAt: string
  repo: string
  restore: 'up' | 'down' | undefined
  invert: boolean
}

function readArgs(argv: readonly string[], cwd: string): Args {
  const flags = readFlags(argv, ['env', 'release', 'readback', 'profile-at', 'repo', 'restore', 'invert'])
  const required = (name: string) => {
    const value = flags.get(name)
    if (value === undefined) throw new SmokeInputError(`--${name} is missing`)
    return value
  }
  const env = required('env')
  if (!(ENVIRONMENTS as readonly string[]).includes(env))
    throw new SmokeInputError('--env is not nonprod, prod or restore')
  const release = required('release')
  if (!RELEASE.test(release)) throw new SmokeInputError('--release is not <commit>:<digest>')
  const readback = required('readback')
  const profileAt = required('profile-at')
  if (!COMMIT.test(profileAt)) throw new SmokeInputError('--profile-at is not a commit')
  const restore = flags.get('restore')
  if (env === 'restore' ? restore !== 'up' && restore !== 'down' : restore !== undefined) {
    throw new SmokeInputError('--restore is up or down, with --env restore alone')
  }
  const invert = flags.get('invert')
  if (invert !== undefined && (invert !== 'SMK-05' || env !== 'nonprod')) {
    throw new SmokeInputError('--invert is SMK-05, with --env nonprod alone')
  }
  return {
    env: env as EnvironmentName,
    release,
    readback,
    profileAt,
    repo: flags.get('repo') ?? cwd,
    restore: restore as 'up' | 'down' | undefined,
    invert: invert !== undefined,
  }
}

// The read-back from its file, or the field it fails on.
function readBackFrom(io: Io, path: string): ReadBack | { field: string } {
  let json: unknown
  try {
    json = JSON.parse(io.readText(path))
  } catch {
    return { field: 'json' }
  }
  try {
    return parseReadBack(json)
  } catch (error) {
    if (error instanceof ReadBackError) return { field: error.message }
    throw error
  }
}

const line = (id: string, verdict: Verdict) => (verdict.pass ? `${id} pass` : `${id} fail ${verdict.code}`)

// The entry: one line a check, in order. Bad input is one line and 2; a failure it didn't expect is
// `smoke: failed` and 1, so no error message or stack reaches a log.
export async function main(argv: readonly string[], io: Io = defaultIo): Promise<0 | 1 | 2> {
  let args: Args
  let profiles: ProfilesAt
  try {
    args = readArgs(argv, io.cwd)
    profiles = await profilesAt(args.profileAt, args.repo)
  } catch (error) {
    io.write(error instanceof SmokeInputError ? `smoke: ${error.message}\n` : 'smoke: failed\n')
    return error instanceof SmokeInputError ? 2 : 1
  }
  try {
    const profile = profiles.PROFILES[args.env]
    if (!isRecord(profile) || !isRecord(profile.services)) {
      io.write("smoke: --profile-at's profiles.ts has no profile for --env\n")
      return 2
    }
    const smsProvider = profile.smsProvider
    if (smsProvider !== undefined && smsProvider !== 'twilio') {
      io.write("smoke: --profile-at's smsProvider is not one the smoke knows\n")
      return 2
    }
    const readBack = readBackFrom(io, args.readback)
    const fromReadBack = (judge: (value: ReadBack) => Verdict): Verdict =>
      'field' in readBack ? fail(`readback-${readBack.field}`) : judge(readBack)
    const lines: string[] = []
    if (args.env !== 'restore') {
      const host = profiles.originHost(args.env)
      const app = profiles.appHost(args.env)
      if (typeof host !== 'string' || typeof app !== 'string') {
        io.write("smoke: --profile-at's profiles.ts names no host for --env\n")
        return 2
      }
      const answers = await liveAnswers(host, `https://${app}`, io.transport)
      lines.push(
        line('SMK-01', smk01(answers.tls, host)),
        line('SMK-02', smk02(answers.signIn, smsProvider)),
        line('SMK-03', smk03(answers.foreignPost)),
        line('SMK-04', smk04(answers.foreignUpgrade)),
        line('SMK-05', smk05([answers.health, answers.root], args.invert)),
      )
    }
    lines.push(
      line(
        'SMK-06',
        fromReadBack(value => smk06(value, args.release, profile, args.env, args.restore)),
      ),
    )
    if (args.env !== 'restore') lines.push(line('SMK-07', fromReadBack(smk07)))
    for (const text of lines) io.write(`${text}\n`)
    return lines.every(text => text.endsWith(' pass')) ? 0 : 1
  } catch {
    io.write('smoke: failed\n')
    return 1
  }
}

// Node 24.2 added import.meta.main. On an older Node it is undefined, so main would never run and the
// script would exit 0 having judged nothing: it refuses such a Node instead.
if (typeof import.meta.main !== 'boolean') {
  process.stderr.write('smoke: Node 24.2 or later is needed (import.meta.main), so nothing was judged\n')
  process.exit(1)
}
if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
