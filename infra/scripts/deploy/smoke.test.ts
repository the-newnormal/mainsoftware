// The smoke's cases, SMK-T01 to SMK-T08 (C11-D54; TECH-SPEC T24 items 16, 20 and 28): each check on
// recorded answers, the read-back's validation, --profile-at in a scratch git repository, and the whole
// command against a local TLS server with a certificate made for the test, so the network code runs
// too. Commits are made by git or built as repeats, and an ARN, account id or address is built from
// parts at run time (IG-01).
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appHost, originHost, PROFILES, REGION } from '../../src/config/profiles.ts'
import {
  type HttpAnswer,
  type HttpRequest,
  liveAnswers,
  main,
  nodeTransport,
  parseReadBack,
  type RawAnswer,
  type ReadBack,
  ReadBackError,
  smk01,
  smk02,
  smk03,
  smk04,
  smk05,
  smk06,
  smk07,
  type TlsAnswer,
  type Transport,
} from './smoke.ts'

const EMAIL = ['test', 'example.invalid'].join('@')
const PROFILES_SOURCE = fileURLToPath(new URL('../../src/config/profiles.ts', import.meta.url))
const DIGEST = `sha256:${'b'.repeat(64)}`
const EARLIER = `sha256:${'c'.repeat(64)}`
const RELEASE = `${'a'.repeat(40)}:${DIGEST}`
const HOST = originHost('nonprod') ?? ''
const APP_ORIGIN = `https://${appHost('nonprod') ?? ''}`
const MARKER = 'MARKER-7f3a9'

// A good non-prod read-back: api 1 task, realtime 2 in two AZs, worker 1, both target groups healthy.
function readBack(): ReadBack {
  const task = (az: string) => ({ az, last: 'RUNNING', health: 'HEALTHY', digest: DIGEST })
  const service = (role: 'api' | 'realtime' | 'worker', tasks: string[]) => ({
    role,
    desired: tasks.length,
    running: tasks.length,
    deployments: [{ status: 'PRIMARY', rollout: 'COMPLETED', desired: tasks.length, running: tasks.length, failed: 0 }],
    tasks: tasks.map(task),
  })
  return {
    schema: 1,
    env: 'nonprod',
    release: RELEASE,
    probe: 'ran',
    services: [
      service('api', ['ap-southeast-1a']),
      service('realtime', ['ap-southeast-1a', 'ap-southeast-1b']),
      service('worker', ['ap-southeast-1b']),
    ],
    targetGroups: [
      { role: 'api', healthy: 1, other: 0, deregistration: 10, stickiness: false, healthPath: '/health' },
      { role: 'realtime', healthy: 2, other: 0, deregistration: 10, stickiness: false, healthPath: '/ready/local' },
    ],
    loadBalancer: { idleTimeout: 60 },
  }
}

// A changed copy of the good read-back.
function changed(edit: (value: ReadBack) => void): ReadBack {
  const value = structuredClone(readBack())
  edit(value)
  return value
}

const service = (value: ReadBack, role: string) => {
  const found = value.services.find(s => s.role === role)
  if (found === undefined) throw new Error(`no ${role}`)
  return found
}

const verdictOf = (value: ReadBack, env: 'nonprod' | 'prod' | 'restore' = 'nonprod', restore?: 'up' | 'down') =>
  smk06(value, RELEASE, PROFILES[env], env, restore)

const TLS_GOOD: TlsAnswer = { authorized: true, protocol: 'TLSv1.3', altNames: `DNS:${HOST}` }

describe('SMK-T01 to SMK-T05 (C11-D54): the anonymous checks on recorded answers', () => {
  it('SMK-T01 (SMK-01): a valid TLS 1.3 answer naming the host passes; unauthorized, TLS 1.1 and another host fail', () => {
    expect(smk01(TLS_GOOD, HOST)).toEqual({ pass: true })
    expect(smk01({ ...TLS_GOOD, protocol: 'TLSv1.2', altNames: `DNS:other.example, DNS:${HOST}` }, HOST)).toEqual({
      pass: true,
    })
    expect(smk01({ ...TLS_GOOD, authorized: false }, HOST)).toEqual({ pass: false, code: 'tls-unauthorized' })
    expect(smk01({ ...TLS_GOOD, protocol: 'TLSv1.1' }, HOST)).toEqual({ pass: false, code: 'tls-protocol' })
    expect(smk01({ ...TLS_GOOD, altNames: 'DNS:origin.other.example' }, HOST)).toEqual({
      pass: false,
      code: 'tls-name',
    })
    expect(smk01({ ...TLS_GOOD, altNames: undefined }, HOST)).toEqual({ pass: false, code: 'tls-name' })
    expect(smk01('no-answer', HOST)).toEqual({ pass: false, code: 'no-answer' })
  })

  it('SMK-T02 (SMK-02): unset, 503 unavailable passes and 400 fails; twilio, 400 invalid_phone passes and 503 fails', () => {
    expect(smk02({ status: 503, error: 'unavailable' }, undefined)).toEqual({ pass: true })
    expect(smk02({ status: 400, error: 'invalid_phone' }, undefined)).toEqual({ pass: false, code: 'status-400' })
    expect(smk02({ status: 400, error: 'invalid_phone' }, 'twilio')).toEqual({ pass: true })
    expect(smk02({ status: 503, error: 'unavailable' }, 'twilio')).toEqual({ pass: false, code: 'status-503' })
    expect(smk02({ status: 503, error: 'sms_global_cap' }, undefined)).toEqual({
      pass: false,
      code: 'error-sms_global_cap',
    })
    // An error word that isn't a code identifier is never printed as it came.
    expect(smk02({ status: 503, error: MARKER }, undefined)).toEqual({ pass: false, code: 'error-other' })
    expect(smk02({ status: 503 }, undefined)).toEqual({ pass: false, code: 'error-none' })
    expect(smk02('no-answer', undefined)).toEqual({ pass: false, code: 'no-answer' })
  })

  it('SMK-T03 (SMK-03): 403 passes; 400, 503 and 200 fail', () => {
    expect(smk03({ status: 403 })).toEqual({ pass: true })
    for (const status of [400, 503, 200]) expect(smk03({ status })).toEqual({ pass: false, code: `status-${status}` })
  })

  it('SMK-T04 (SMK-04): 403 passes; an upgrade (101) fails; the api’s 404 fails', () => {
    expect(smk04({ status: 403 })).toEqual({ pass: true })
    expect(smk04({ upgraded: true })).toEqual({ pass: false, code: 'status-101' })
    expect(smk04({ status: 404 })).toEqual({ pass: false, code: 'status-404' })
    expect(smk04('no-answer')).toEqual({ pass: false, code: 'no-answer' })
  })

  it('SMK-T05 (SMK-05): two 404s pass; a 200 fails; inverted, two 404s fail (drill-smoke)', () => {
    const notFound: HttpAnswer = { status: 404 }
    expect(smk05([notFound, notFound], false)).toEqual({ pass: true })
    expect(smk05([{ status: 200 }, notFound], false)).toEqual({ pass: false, code: 'status-200' })
    expect(smk05([notFound, { status: 200 }], false)).toEqual({ pass: false, code: 'status-200' })
    expect(smk05([notFound, notFound], true)).toEqual({ pass: false, code: 'inverted' })
    expect(smk05([{ status: 200 }, notFound], true)).toEqual({ pass: true })
  })
})

describe('SMK-T06 (SMK-06, C11-D54): what runs is the run’s own release', () => {
  it('SMK-T06: a recorded good read-back passes, and each way a release can be wrong fails', () => {
    expect(verdictOf(readBack())).toEqual({ pass: true })
    const cases: Array<[ReadBack, string]> = [
      [
        changed(v => {
          const [task] = service(v, 'realtime').tasks
          if (task !== undefined) task.digest = EARLIER
        }),
        'readback-realtime-digest',
      ],
      // A run that changed nothing: Release names the run's release, every task an earlier one.
      [
        changed(v => {
          for (const s of v.services) for (const task of s.tasks) task.digest = EARLIER
        }),
        'readback-api-digest',
      ],
      [
        changed(v => {
          service(v, 'api').deployments.push({
            status: 'ACTIVE',
            rollout: 'COMPLETED',
            desired: 1,
            running: 1,
            failed: 0,
          })
        }),
        'readback-api-deployments',
      ],
      [
        changed(v => {
          const [deployment] = service(v, 'worker').deployments
          if (deployment !== undefined) deployment.rollout = 'IN_PROGRESS'
        }),
        'readback-worker-rollout',
      ],
      [
        changed(v => {
          for (const task of service(v, 'realtime').tasks) task.az = 'ap-southeast-1a'
        }),
        'readback-realtime-azs',
      ],
      [
        changed(v => {
          const realtime = service(v, 'realtime')
          realtime.running = 1
          realtime.tasks.pop()
        }),
        'readback-realtime-running',
      ],
      [
        changed(v => {
          const [task] = service(v, 'worker').tasks
          if (task !== undefined) task.health = 'UNHEALTHY'
        }),
        'readback-worker-health',
      ],
      [
        changed(v => {
          const [group] = v.targetGroups
          if (group !== undefined) Object.assign(group, { healthy: 0, other: 1 })
        }),
        'readback-api-targets',
      ],
      [
        changed(v => {
          const [task] = service(v, 'api').tasks
          if (task !== undefined) task.last = 'PENDING'
        }),
        'readback-api-tasks',
      ],
      [changed(v => v.services.pop()), 'readback-services'],
      [changed(v => Object.assign(v, { release: `${'a'.repeat(40)}:${EARLIER}` })), 'readback-release'],
      [changed(v => Object.assign(v, { env: 'prod' })), 'readback-env'],
    ]
    for (const [value, code] of cases) expect(verdictOf(value), code).toEqual({ pass: false, code })
  })

  it('SMK-T06: the restore stage’s services half, up at the profile’s counts and down at none', () => {
    const counts = PROFILES.restore.services
    const restoreUp = changed(v => {
      v.env = 'restore'
      v.probe = 'ran'
      v.targetGroups = []
      v.loadBalancer = null
      for (const s of v.services) {
        const n = counts[s.role].count
        s.desired = n
        s.running = n
        s.deployments = [{ status: 'PRIMARY', rollout: 'COMPLETED', desired: n, running: n, failed: 0 }]
        s.tasks = Array.from({ length: n }, () => ({
          az: 'ap-southeast-1a',
          last: 'RUNNING',
          health: 'UNKNOWN',
          digest: DIGEST,
        }))
      }
    })
    expect(verdictOf(restoreUp, 'restore', 'up')).toEqual({ pass: true })
    const tooMany = changed(v => Object.assign(v, structuredClone(restoreUp)))
    const api = service(tooMany, 'api')
    api.desired = counts.api.count + 1
    expect(verdictOf(tooMany, 'restore', 'up')).toEqual({ pass: false, code: 'readback-api-running' })
    expect(
      verdictOf(
        changed(v => Object.assign(v, { env: 'restore', services: [] })),
        'restore',
        'up',
      ),
    ).toEqual({
      pass: false,
      code: 'readback-services',
    })
    // Down: desired and running 0, or no services at all (stacks skipped).
    const down = changed(v => {
      v.env = 'restore'
      v.probe = 'skipped'
      for (const s of v.services) Object.assign(s, { desired: 0, running: 0, deployments: [], tasks: [] })
    })
    expect(verdictOf(down, 'restore', 'down')).toEqual({ pass: true })
    expect(
      verdictOf(
        changed(v => Object.assign(v, { env: 'restore', services: [] })),
        'restore',
        'down',
      ),
    ).toEqual({
      pass: true,
    })
    expect(verdictOf(restoreUp, 'restore', 'down')).toEqual({ pass: false, code: 'readback-api-running' })
    expect(verdictOf(down, 'restore', 'up')).toEqual({ pass: false, code: 'readback-api-deployments' })
  })
})

describe('SMK-T07 (SMK-07, C11-D42, T24 item 16): the load balancer’s settings', () => {
  it('SMK-T07: deregistration 10 passes and 11 fails; stickiness on, realtime on /health and idle 59 fail', () => {
    expect(smk07(readBack())).toEqual({ pass: true })
    const realtime = (edit: Partial<ReadBack['targetGroups'][number]>) =>
      changed(v => {
        const group = v.targetGroups.find(g => g.role === 'realtime')
        if (group !== undefined) Object.assign(group, edit)
      })
    expect(smk07(realtime({ deregistration: 11 }))).toEqual({ pass: false, code: 'readback-realtime-deregistration' })
    expect(smk07(realtime({ stickiness: true }))).toEqual({ pass: false, code: 'readback-realtime-stickiness' })
    expect(smk07(realtime({ healthPath: '/health' }))).toEqual({ pass: false, code: 'readback-realtime-health-path' })
    expect(smk07(changed(v => Object.assign(v, { loadBalancer: { idleTimeout: 59 } })))).toEqual({
      pass: false,
      code: 'readback-idle-timeout',
    })
    expect(smk07(changed(v => Object.assign(v, { loadBalancer: null })))).toEqual({
      pass: false,
      code: 'readback-load-balancer',
    })
    expect(smk07(changed(v => v.targetGroups.pop()))).toEqual({ pass: false, code: 'readback-realtime-target-group' })
  })
})

// A transport answering from a table, and recording what it was asked.
function fakeTransport(answers: { tls: TlsAnswer | 'no-answer'; http: (request: HttpRequest) => RawAnswer }) {
  const asked: HttpRequest[] = []
  const transport: Transport = {
    tls: async () => answers.tls,
    http: async (_host, request) => {
      asked.push(request)
      return answers.http(request)
    },
  }
  return { transport, asked }
}

const bytes = (text: string) => new TextEncoder().encode(text)

// The api and load balancer as the smoke expects them in C0.11, with a marker in every body.
function goodAnswer(request: HttpRequest): RawAnswer {
  if (request.path === '/api/auth/otp/request') {
    return request.headers.origin === APP_ORIGIN
      ? { status: 503, body: bytes(JSON.stringify({ error: 'unavailable', detail: MARKER })) }
      : { status: 403, body: bytes(MARKER) }
  }
  if (request.path === '/ws') return { status: 403, body: bytes(MARKER) }
  return { status: 404, body: bytes(MARKER) }
}

let repo = ''
let scratch = ''
let before = ''
let after = ''

function git(args: readonly string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=hearth-test', '-c', `user.email=${EMAIL}`, '-c', 'commit.gpgsign=false', ...args],
    { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'hearth-smoke-test-'))
  scratch = mkdtempSync(join(tmpdir(), 'hearth-smoke-files-'))
  git(['init', '-q', '-b', 'main'])
  mkdirSync(join(repo, 'infra/src/config'), { recursive: true })
  const source = readFileSync(PROFILES_SOURCE, 'utf8')
  writeFileSync(join(repo, 'infra/src/config/profiles.ts'), source)
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'profiles'])
  before = git(['rev-parse', 'HEAD'])
  // The next release turns non-prod's smsProvider to twilio (nonprod's profile comes first).
  const flipped = source.replace('smsProvider: undefined,', "smsProvider: 'twilio',")
  if (flipped === source) throw new Error("profiles.ts no longer reads 'smsProvider: undefined,'")
  writeFileSync(join(repo, 'infra/src/config/profiles.ts'), flipped)
  git(['commit', '-q', '-am', 'flip'])
  after = git(['rev-parse', 'HEAD'])
})

afterAll(() => {
  for (const folder of [repo, scratch]) if (folder !== '') rmSync(folder, { recursive: true, force: true })
})

function writeReadBack(value: unknown, name = 'readback.json'): string {
  const path = join(scratch, name)
  writeFileSync(path, JSON.stringify(value))
  return path
}

async function cli(argv: readonly string[], transport: Transport): Promise<{ code: number; out: string }> {
  let out = ''
  const code = await main(argv, {
    write: text => (out += text),
    readText: path => readFileSync(path, 'utf8'),
    cwd: repo,
    transport,
  })
  return { code, out }
}

describe('SMK-T08 (C11-D54): the read-back, --profile-at and what the smoke prints', () => {
  it('SMK-T08: parseReadBack keeps a good read-back and refuses an ARN, an address, a 12-digit run, an unknown key and schema 2', () => {
    expect(parseReadBack(readBack())).toEqual(readBack())
    const refused = (value: unknown) => {
      try {
        parseReadBack(value)
        return 'kept'
      } catch (error) {
        return error instanceof ReadBackError ? error.message : 'threw'
      }
    }
    const arn = ['arn', 'aws', 'ecs', REGION, '1'.repeat(12), 'task/hearth-nonprod/x'].join(':')
    expect(refused(changed(v => Object.assign(service(v, 'api'), { role: arn })))).toBe('arn')
    expect(
      refused(changed(v => Object.assign(v.targetGroups[0] ?? {}, { healthPath: `/${'ARN:'.toLowerCase()}x` }))),
    ).toBe('arn')
    const address = [10, 20, 1, 7].join('.')
    expect(refused(changed(v => Object.assign(service(v, 'api').tasks[0] ?? {}, { az: address })))).toBe('address')
    expect(
      refused(changed(v => Object.assign(v.targetGroups[0] ?? {}, { deregistration: Number('1'.repeat(12)) }))),
    ).toBe('account')
    expect(refused(changed(v => Object.assign(service(v, 'worker').tasks[0] ?? {}, { ip: 'x' })))).toBe('key')
    expect(refused(changed(v => Object.assign(v, { schema: 2 })))).toBe('schema')
    expect(refused(changed(v => Object.assign(v, { probe: 'maybe' })))).toBe('probe')
    expect(refused(changed(v => Object.assign(service(v, 'api').tasks[0] ?? {}, { digest: 'latest' })))).toBe('tasks')
    // The release's commit and the digests may hold any run of digits.
    const digits = `${'1'.repeat(40)}:sha256:${'2'.repeat(64)}`
    expect(refused(changed(v => Object.assign(v, { release: digits })))).toBe('kept')
  })

  it('SMK-T08: --profile-at judges SMK-02 by that commit’s smsProvider, not the checkout’s', async () => {
    const readback = writeReadBack(readBack())
    const invalidPhone = fakeTransport({
      tls: TLS_GOOD,
      http: request =>
        request.path === '/api/auth/otp/request' && request.headers.origin === APP_ORIGIN
          ? { status: 400, body: bytes(JSON.stringify({ error: 'invalid_phone' })) }
          : goodAnswer(request),
    })
    const args = (commit: string) => [
      '--env',
      'nonprod',
      '--release',
      RELEASE,
      '--readback',
      readback,
      '--profile-at',
      commit,
      '--repo',
      repo,
    ]
    expect(await cli(args(after), invalidPhone.transport)).toEqual({
      code: 0,
      out: ['SMK-01', 'SMK-02', 'SMK-03', 'SMK-04', 'SMK-05', 'SMK-06', 'SMK-07'].map(id => `${id} pass\n`).join(''),
    })
    const atBefore = await cli(args(before), invalidPhone.transport)
    expect(atBefore.code).toBe(1)
    expect(atBefore.out.split('\n')).toContain('SMK-02 fail status-400')
    // The anonymous requests: sign-in from the app's origin and from another, the upgrade, and the two GETs.
    expect(invalidPhone.asked.map(request => [request.method, request.path, request.headers.origin ?? '-'])).toEqual([
      ['POST', '/api/auth/otp/request', APP_ORIGIN],
      ['POST', '/api/auth/otp/request', 'https://example.invalid'],
      ['GET', '/ws', 'https://example.invalid'],
      ['GET', '/health', '-'],
      ['GET', '/', '-'],
      ['POST', '/api/auth/otp/request', APP_ORIGIN],
      ['POST', '/api/auth/otp/request', 'https://example.invalid'],
      ['GET', '/ws', 'https://example.invalid'],
      ['GET', '/health', '-'],
      ['GET', '/', '-'],
    ])
    expect(invalidPhone.asked[0]?.body).toBe('{"phone":"x"}')
    expect(invalidPhone.asked[2]?.headers.upgrade).toBe('websocket')
  })

  it('SMK-T08: with answers whose bodies hold a marker, nothing the smoke prints holds it', async () => {
    const readback = writeReadBack(readBack())
    const leaky = fakeTransport({
      tls: { ...TLS_GOOD, altNames: `DNS:${HOST}, DNS:${MARKER.toLowerCase()}.example` },
      http: request =>
        request.path === '/api/auth/otp/request' && request.headers.origin === APP_ORIGIN
          ? { status: 503, body: bytes(JSON.stringify({ error: MARKER, message: MARKER })) }
          : goodAnswer(request),
    })
    const { code, out } = await cli(
      ['--env', 'nonprod', '--release', RELEASE, '--readback', readback, '--profile-at', before, '--repo', repo],
      leaky.transport,
    )
    expect(code).toBe(1)
    expect(out).toContain('SMK-02 fail error-other\n')
    expect(out.toLowerCase()).not.toContain(MARKER.toLowerCase())
  })

  it('SMK-T08: the restore stage prints SMK-06 alone; a drill inverts SMK-05; a bad read-back fails SMK-06 and SMK-07', async () => {
    const down = writeReadBack(
      changed(v =>
        Object.assign(v, { env: 'restore', probe: 'skipped', services: [], targetGroups: [], loadBalancer: null }),
      ),
      'down.json',
    )
    const unreachable = fakeTransport({ tls: 'no-answer', http: () => 'no-answer' })
    const restore = ['--env', 'restore', '--restore', 'down', '--release', RELEASE, '--readback', down]
    expect(await cli([...restore, '--profile-at', before, '--repo', repo], unreachable.transport)).toEqual({
      code: 0,
      out: 'SMK-06 pass\n',
    })
    expect(unreachable.asked).toEqual([])
    const good = writeReadBack(readBack())
    const answers = fakeTransport({ tls: TLS_GOOD, http: goodAnswer })
    const drill = ['--env', 'nonprod', '--release', RELEASE, '--readback', good, '--profile-at', before, '--repo', repo]
    const inverted = await cli([...drill, '--invert', 'SMK-05'], answers.transport)
    expect(inverted.code).toBe(1)
    expect(inverted.out).toContain('SMK-05 fail inverted\n')
    const address = [10, 20, 1, 7].join('.')
    const leaking = writeReadBack(
      changed(v => Object.assign(service(v, 'api').tasks[0] ?? {}, { az: address })),
      'bad.json',
    )
    const bad = await cli(
      ['--env', 'nonprod', '--release', RELEASE, '--readback', leaking, '--profile-at', before, '--repo', repo],
      answers.transport,
    )
    expect(bad.code).toBe(1)
    expect(bad.out).toContain('SMK-06 fail readback-address\nSMK-07 fail readback-address\n')
    expect(bad.out).not.toContain(address)
  })

  it('SMK-T08: bad arguments exit 2 with one line', async () => {
    const none = fakeTransport({ tls: 'no-answer', http: () => 'no-answer' }).transport
    const readback = writeReadBack(readBack())
    const base = ['--env', 'nonprod', '--release', RELEASE, '--readback', readback, '--profile-at', before]
    const cases: Array<[string[], string]> = [
      [[], 'smoke: --env is missing\n'],
      [['--env', 'staging', ...base.slice(2)], 'smoke: --env is not nonprod, prod or restore\n'],
      [[...base.slice(0, 2), '--release', 'x', ...base.slice(4)], 'smoke: --release is not <commit>:<digest>\n'],
      [[...base.slice(0, 6), '--profile-at', 'main'], 'smoke: --profile-at is not a commit\n'],
      [[...base, '--invert', 'SMK-04'], 'smoke: --invert is SMK-05, with --env nonprod alone\n'],
      [
        ['--env', 'prod', ...base.slice(2), '--invert', 'SMK-05'],
        'smoke: --invert is SMK-05, with --env nonprod alone\n',
      ],
      [['--env', 'restore', ...base.slice(2)], 'smoke: --restore is up or down, with --env restore alone\n'],
      [[...base, '--restore', 'up'], 'smoke: --restore is up or down, with --env restore alone\n'],
      [[...base, '--colour', 'red'], 'smoke: --colour is not an option\n'],
      [[...base, '--env', 'prod'], 'smoke: --env is given twice\n'],
      [
        [...base.slice(0, 6), '--profile-at', 'e'.repeat(40)],
        'smoke: --profile-at names no commit with infra/src/config/profiles.ts in this clone\n',
      ],
    ]
    for (const [argv, out] of cases) expect(await cli(argv, none), out).toEqual({ code: 2, out })
  })
})

// A local TLS server standing in for the load balancer, with a certificate made for the test.
describe('SMK-T08 (C11-D54): the whole smoke against a local TLS server', () => {
  let server: Server | undefined
  let port = 0
  let cert = ''
  let upgradeAnswer = 'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'

  beforeAll(async () => {
    const folder = join(scratch, 'tls')
    mkdirSync(folder, { recursive: true })
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-nodes',
        '-keyout',
        join(folder, 'key.pem'),
        '-out',
        join(folder, 'cert.pem'),
        '-days',
        '1',
        '-subj',
        `/CN=${HOST}`,
        '-addext',
        `subjectAltName=DNS:${HOST}`,
      ],
      { stdio: 'ignore' },
    )
    cert = readFileSync(join(folder, 'cert.pem'), 'utf8')
    server = createServer({ key: readFileSync(join(folder, 'key.pem')), cert }, (request, response) => {
      const send = (status: number, body: string) => {
        response.writeHead(status, { 'content-type': 'application/json', 'x-detail': MARKER })
        response.end(body)
      }
      if (request.url === '/api/auth/otp/request' && request.method === 'POST') {
        request.resume()
        if (request.headers.origin !== APP_ORIGIN) return send(403, JSON.stringify({ error: 'forbidden' }))
        return send(503, JSON.stringify({ error: 'unavailable', detail: MARKER, pad: 'x'.repeat(100) }))
      }
      return send(404, JSON.stringify({ error: 'Not Found', detail: MARKER }))
    })
    server.on('upgrade', (_request, socket) => socket.end(upgradeAnswer))
    await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  }, 30_000)

  afterAll(async () => {
    await new Promise<void>(resolve => (server === undefined ? resolve() : server.close(() => resolve())))
  })

  const transport = () => nodeTransport({ address: [127, 0, 0, 1].join('.'), port, ca: cert })

  it('SMK-T08: every check passes over the network code, and nothing printed holds the marker or the address', async () => {
    const answers = await liveAnswers(HOST, APP_ORIGIN, transport())
    expect(answers).toEqual({
      tls: { authorized: true, protocol: 'TLSv1.3', altNames: `DNS:${HOST}` },
      signIn: { status: 503, error: 'unavailable' },
      foreignPost: { status: 403 },
      foreignUpgrade: { status: 403 },
      health: { status: 404 },
      root: { status: 404 },
    })
    const readback = writeReadBack(readBack(), 'live.json')
    const { code, out } = await cli(
      ['--env', 'nonprod', '--release', RELEASE, '--readback', readback, '--profile-at', before, '--repo', repo],
      transport(),
    )
    expect([code, out]).toEqual([
      0,
      ['SMK-01', 'SMK-02', 'SMK-03', 'SMK-04', 'SMK-05', 'SMK-06', 'SMK-07'].map(id => `${id} pass\n`).join(''),
    ])
    expect(out).not.toContain(MARKER)
  }, 30_000)

  it('SMK-T08: an upgrade answered 101 fails SMK-04, an untrusted certificate fails SMK-01, and nothing answering is no-answer', async () => {
    upgradeAnswer = 'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
    try {
      const answers = await liveAnswers(HOST, APP_ORIGIN, transport())
      expect(smk04(answers.foreignUpgrade)).toEqual({ pass: false, code: 'status-101' })
    } finally {
      upgradeAnswer = 'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
    }
    const untrusted = await liveAnswers(HOST, APP_ORIGIN, nodeTransport({ address: [127, 0, 0, 1].join('.'), port }))
    expect(smk01(untrusted.tls, HOST)).toEqual({ pass: false, code: 'tls-unauthorized' })
    // Without the test's root, the https requests refuse the certificate too.
    expect(untrusted.signIn).toBe('no-answer')
    const closed = await liveAnswers(HOST, APP_ORIGIN, nodeTransport({ address: [127, 0, 0, 1].join('.'), port: 1 }))
    expect(Object.values(closed)).toEqual(Array(6).fill('no-answer'))
  }, 30_000)
})
