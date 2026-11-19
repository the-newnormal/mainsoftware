// The smoke's cases, SMK-T01 to SMK-T08 (C11-D54; TECH-SPEC T24 items 16, 20 and 28): each check on
// recorded answers, the read-back's validation, --profile-at in a scratch git repository, the command
// line for each stage (the host, origin and profile each --env maps to), a failure it didn't expect in
// either half of main (one line, `smoke: failed`, and exit 1), and the whole command against a local TLS
// server with a certificate made for the test, so the network code runs too, its body limit and its
// timeouts among it. Commits are made by git (a developer's own git settings set aside: git's own
// environment variables for the whole file, a hook's GIT_INDEX_FILE among them, and the system and
// global configuration files, a global hook or signed tags, for every git command the test runs itself)
// or built as repeats, and an ARN, account id or address is built from parts at run time (IG-01). It
// holds what the smoke must decide, so it is on the owner's-read list (C11-D74).
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { createServer, type Server } from 'node:https'
import { type AddressInfo, createServer as createTcpServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
const SMOKE = fileURLToPath(new URL('./smoke.ts', import.meta.url))
const DIGEST = `sha256:${'b'.repeat(64)}`
const EARLIER = `sha256:${'c'.repeat(64)}`
const RELEASE = `${'a'.repeat(40)}:${DIGEST}`
const HOST = originHost('nonprod') ?? ''
const APP_ORIGIN = `https://${appHost('nonprod') ?? ''}`
const PROD_HOST = originHost('prod') ?? ''
const PROD_ORIGIN = `https://${appHost('prod') ?? ''}`
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

// The restore stage brought up: every service at the restore profile's count, every task running the
// release, with no load balancer or target group (the probe ran).
function restoreUpReadBack(): ReadBack {
  const counts = PROFILES.restore.services
  return changed(v => {
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
}

// A good prod read-back: each service at prod's count, its tasks across two AZs, the target groups
// healthy.
function prodReadBack(): ReadBack {
  const counts = PROFILES.prod.services
  return changed(v => {
    v.env = 'prod'
    for (const s of v.services) {
      const n = counts[s.role].count
      s.desired = n
      s.running = n
      s.deployments = [{ status: 'PRIMARY', rollout: 'COMPLETED', desired: n, running: n, failed: 0 }]
      s.tasks = Array.from({ length: n }, (_, i) => ({
        az: i % 2 === 0 ? 'ap-southeast-1a' : 'ap-southeast-1b',
        last: 'RUNNING',
        health: 'HEALTHY',
        digest: DIGEST,
      }))
    }
    for (const group of v.targetGroups) group.healthy = counts[group.role].count
  })
}

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
      // One deployment, completed but no longer the service's primary.
      [
        changed(v => {
          const [deployment] = service(v, 'api').deployments
          if (deployment !== undefined) deployment.status = 'ACTIVE'
        }),
        'readback-api-rollout',
      ],
      // The deployment's own counts disagreeing with the service's, each alone.
      [
        changed(v => {
          const [deployment] = service(v, 'api').deployments
          if (deployment !== undefined) deployment.desired = 2
        }),
        'readback-api-running',
      ],
      [
        changed(v => {
          const [deployment] = service(v, 'api').deployments
          if (deployment !== undefined) deployment.running = 0
        }),
        'readback-api-running',
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
      // A worker task whose health check hasn't answered yet is not yet healthy.
      [
        changed(v => {
          const [task] = service(v, 'worker').tasks
          if (task !== undefined) task.health = 'UNKNOWN'
        }),
        'readback-worker-health',
      ],
      // The healthy count alone, nothing in another state: the api's task runs but isn't registered, a
      // realtime target short of its two tasks, and one more healthy api target than tasks running.
      [
        changed(v => {
          const [group] = v.targetGroups
          if (group !== undefined) Object.assign(group, { healthy: 0, other: 0 })
        }),
        'readback-api-targets',
      ],
      [
        changed(v => {
          const group = v.targetGroups.find(each => each.role === 'realtime')
          if (group !== undefined) Object.assign(group, { healthy: 1, other: 0 })
        }),
        'readback-realtime-targets',
      ],
      [
        changed(v => {
          const [group] = v.targetGroups
          if (group !== undefined) Object.assign(group, { healthy: 2, other: 0 })
        }),
        'readback-api-targets',
      ],
      // Every target healthy, and one more in another state (one draining or still registering).
      [
        changed(v => {
          const [group] = v.targetGroups
          if (group !== undefined) group.other = 1
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
      // Two tasks running and one listed: a task on another digest could hide in the one not read.
      [
        changed(v => {
          const worker = service(v, 'worker')
          worker.desired = 2
          worker.running = 2
          worker.deployments = [{ status: 'PRIMARY', rollout: 'COMPLETED', desired: 2, running: 2, failed: 0 }]
        }),
        'readback-worker-tasks',
      ],
      // A service scaled to nothing outside the restore stage taken down.
      [
        changed(v => {
          const worker = service(v, 'worker')
          worker.desired = 0
          worker.running = 0
          worker.deployments = [{ status: 'PRIMARY', rollout: 'COMPLETED', desired: 0, running: 0, failed: 0 }]
          worker.tasks = []
        }),
        'readback-worker-running',
      ],
      [changed(v => v.services.pop()), 'readback-services'],
      // A fourth service repeating a role, its tasks on an earlier release: one service a role, each once.
      [
        changed(v => {
          const extra = structuredClone(service(v, 'api'))
          for (const task of extra.tasks) task.digest = EARLIER
          v.services.push(extra)
        }),
        'readback-services',
      ],
      // A second target group for a role, healthy as the first: one target group a role.
      [
        changed(v => {
          const [group] = v.targetGroups
          if (group !== undefined) v.targetGroups.push({ ...group })
        }),
        'readback-api-targets',
      ],
      [
        changed(v => {
          const group = v.targetGroups.find(g => g.role === 'realtime')
          if (group !== undefined) v.targetGroups.push({ ...group })
        }),
        'readback-realtime-targets',
      ],
      [changed(v => Object.assign(v, { release: `${'a'.repeat(40)}:${EARLIER}` })), 'readback-release'],
      [changed(v => Object.assign(v, { env: 'prod' })), 'readback-env'],
    ]
    for (const [value, code] of cases) expect(verdictOf(value), code).toEqual({ pass: false, code })
  })

  it('SMK-T06: the restore stage’s services half, up at the profile’s counts and down at none', () => {
    const counts = PROFILES.restore.services
    const restoreUp = restoreUpReadBack()
    expect(verdictOf(restoreUp, 'restore', 'up')).toEqual({ pass: true })
    // The api one above the profile's count in every field, every task running on the digest: the
    // restore stage runs at the profile's counts, not at whatever its service asks for.
    const tooMany = structuredClone(restoreUp)
    const api = service(tooMany, 'api')
    const more = counts.api.count + 1
    Object.assign(api, {
      desired: more,
      running: more,
      deployments: [{ status: 'PRIMARY', rollout: 'COMPLETED', desired: more, running: more, failed: 0 }],
      tasks: Array.from({ length: more }, () => ({
        az: 'ap-southeast-1a',
        last: 'RUNNING',
        health: 'UNKNOWN',
        digest: DIGEST,
      })),
    })
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
    // Down fails on each sign of a task left, alone: one still asked for, one still counted as
    // running, and one still listed (a restore-stage task holds production data).
    const leftUp = (edit: Partial<ReadBack['services'][number]>) =>
      verdictOf(
        changed(v => {
          Object.assign(v, structuredClone(down))
          Object.assign(service(v, 'api'), edit)
        }),
        'restore',
        'down',
      )
    expect(leftUp({ desired: 1 })).toEqual({ pass: false, code: 'readback-api-running' })
    expect(leftUp({ running: 1 })).toEqual({ pass: false, code: 'readback-api-running' })
    const task = { az: 'ap-southeast-1a', last: 'RUNNING', health: 'UNKNOWN', digest: DIGEST }
    expect(leftUp({ tasks: [task] })).toEqual({ pass: false, code: 'readback-api-running' })
  })
})

describe('SMK-T07 (SMK-07, C11-D42, T24 item 16): the load balancer’s settings', () => {
  it('SMK-T07: deregistration 10 passes and 11 fails; stickiness on, realtime on /health, the api on /ready/local, idle 59 and a role’s second target group fail', () => {
    expect(smk07(readBack())).toEqual({ pass: true })
    const group = (role: 'api' | 'realtime', edit: Partial<ReadBack['targetGroups'][number]>) =>
      changed(v => {
        const found = v.targetGroups.find(g => g.role === role)
        if (found !== undefined) Object.assign(found, edit)
      })
    const realtime = (edit: Partial<ReadBack['targetGroups'][number]>) => group('realtime', edit)
    expect(smk07(realtime({ deregistration: 11 }))).toEqual({ pass: false, code: 'readback-realtime-deregistration' })
    expect(smk07(realtime({ stickiness: true }))).toEqual({ pass: false, code: 'readback-realtime-stickiness' })
    expect(smk07(realtime({ healthPath: '/health' }))).toEqual({ pass: false, code: 'readback-realtime-health-path' })
    expect(smk07(group('api', { healthPath: '/ready/local' }))).toEqual({
      pass: false,
      code: 'readback-api-health-path',
    })
    expect(smk07(changed(v => Object.assign(v, { loadBalancer: { idleTimeout: 59 } })))).toEqual({
      pass: false,
      code: 'readback-idle-timeout',
    })
    expect(smk07(changed(v => Object.assign(v, { loadBalancer: null })))).toEqual({
      pass: false,
      code: 'readback-load-balancer',
    })
    expect(smk07(changed(v => v.targetGroups.pop()))).toEqual({ pass: false, code: 'readback-realtime-target-group' })
    // A second target group for a role, with the first's settings: one target group a role.
    for (const role of ['api', 'realtime'] as const) {
      const twice = changed(v => {
        const found = v.targetGroups.find(g => g.role === role)
        if (found !== undefined) v.targetGroups.push({ ...found })
      })
      expect(smk07(twice), role).toEqual({ pass: false, code: `readback-${role}-target-group` })
    }
  })
})

// A transport answering from a table, and recording what it was asked and of which host (`tls <host>`
// or `http <host>`, in order).
function fakeTransport(answers: { tls: TlsAnswer | 'no-answer'; http: (request: HttpRequest) => RawAnswer }) {
  const asked: HttpRequest[] = []
  const hosts: string[] = []
  const transport: Transport = {
    tls: async host => {
      hosts.push(`tls ${host}`)
      return answers.tls
    },
    http: async (host, request) => {
      hosts.push(`http ${host}`)
      asked.push(request)
      return answers.http(request)
    },
  }
  return { transport, asked, hosts }
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
// Commits whose prod smsProvider differs from non-prod's, each way round, whatever the committed
// profiles.ts sets: prod unset with non-prod on twilio, and prod on twilio with non-prod unset.
let prodUnset = ''
let prodTwilio = ''
// Non-prod's own smsProvider line, whatever the committed profiles.ts sets it to (C0.12 turns it to
// twilio).
const NONPROD_SMS = /(\n {2}nonprod: \{\n(?: {4}.*\n)*? {4}smsProvider: )[^,\n]*,/

// git's own variables set aside for the whole file, the script's own git command included: a hook that
// runs these tests hands git GIT_INDEX_FILE (and can hand it GIT_DIR or GIT_WORK_TREE), which would
// point a command at the hook's repository and index instead of the scratch one, and a git -c value
// (GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT) would reach every command. Restored after the file.
for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
afterAll(() => {
  vi.unstubAllEnvs()
})
const GIT_ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }

// git with no system or global configuration file, an identity, and none of the developer's commit and
// tag signing or hooks, so a global setting can't refuse a commit.
function git(args: readonly string[]): string {
  return execFileSync(
    'git',
    [
      ...['-c', 'user.name=hearth-test', '-c', `user.email=${EMAIL}`, '-c', 'commit.gpgsign=false'],
      ...['-c', 'tag.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    ],
    { cwd: repo, encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'hearth-smoke-test-'))
  scratch = mkdtempSync(join(tmpdir(), 'hearth-smoke-files-'))
  git(['init', '-q', '-b', 'main'])
  mkdirSync(join(repo, 'infra/src/config'), { recursive: true })
  const source = readFileSync(PROFILES_SOURCE, 'utf8')
  // The release before has non-prod's smsProvider unset, and the next release turns it to twilio.
  if (!NONPROD_SMS.test(source)) throw new Error("profiles.ts no longer gives non-prod's smsProvider a line")
  writeFileSync(join(repo, 'infra/src/config/profiles.ts'), source.replace(NONPROD_SMS, '$1undefined,'))
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'profiles'])
  before = git(['rev-parse', 'HEAD'])
  writeFileSync(join(repo, 'infra/src/config/profiles.ts'), source.replace(NONPROD_SMS, "$1'twilio',"))
  git(['commit', '-q', '-am', 'flip'])
  after = git(['rev-parse', 'HEAD'])
  const prodSms = /(\n {2}prod: \{\n(?: {4}.*\n)*? {4}smsProvider: )[^,\n]*,/
  if (!prodSms.test(source)) throw new Error("profiles.ts no longer gives prod's smsProvider a line")
  const both = (nonprod: string, prod: string) =>
    source.replace(NONPROD_SMS, `$1${nonprod},`).replace(prodSms, `$1${prod},`)
  writeFileSync(join(repo, 'infra/src/config/profiles.ts'), both("'twilio'", 'undefined'))
  git(['commit', '-q', '--allow-empty', '-am', 'prod unset'])
  prodUnset = git(['rev-parse', 'HEAD'])
  writeFileSync(join(repo, 'infra/src/config/profiles.ts'), both('undefined', "'twilio'"))
  git(['commit', '-q', '--allow-empty', '-am', 'prod on twilio'])
  prodTwilio = git(['rev-parse', 'HEAD'])
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
  it('SMK-T08: parseReadBack keeps a good read-back and refuses an ARN, an address, a 12-digit run, a key more or fewer at every level and schema 2', () => {
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
    // Exactly its keys at every level: one key more, or its first key gone, at the top, a service, a
    // deployment, a task, a target group and the load balancer. A level the good read-back lacks edits a
    // throwaway object, which keeps the read-back and fails the case.
    const levels: readonly [string, (v: ReadBack) => object][] = [
      ['top', v => v],
      ['service', v => service(v, 'api')],
      ['deployment', v => service(v, 'api').deployments[0] ?? {}],
      ['task', v => service(v, 'worker').tasks[0] ?? {}],
      ['target group', v => v.targetGroups[0] ?? {}],
      ['load balancer', v => v.loadBalancer ?? {}],
    ]
    for (const [level, at] of levels) {
      expect(refused(changed(v => Object.assign(at(v), { ip: 'x' }))), `${level} with a key more`).toBe('key')
      const fewer = changed(v => {
        const value = at(v)
        Reflect.deleteProperty(value, Object.keys(value)[0] ?? '')
      })
      expect(refused(fewer), `${level} with a key fewer`).toBe('key')
    }
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

  it('SMK-T08: --env prod asks prod’s load balancer with prod’s origin, judges SMK-02 by prod’s smsProvider, and prints all seven', async () => {
    const readback = writeReadBack(prodReadBack(), 'prod.json')
    // The api as prod's would answer: sign-in from prod's own origin answered as given, any other 403.
    const prodAnswers = (signIn: RawAnswer) =>
      fakeTransport({
        tls: { ...TLS_GOOD, altNames: `DNS:${PROD_HOST}` },
        http: request => {
          if (request.path === '/api/auth/otp/request') {
            return request.headers.origin === PROD_ORIGIN ? signIn : { status: 403, body: bytes(MARKER) }
          }
          return request.path === '/ws' ? { status: 403 } : { status: 404 }
        },
      })
    const unavailable = { status: 503, body: bytes(JSON.stringify({ error: 'unavailable' })) }
    const invalidPhone = { status: 400, body: bytes(JSON.stringify({ error: 'invalid_phone' })) }
    const prod = (commit: string) => [
      ...['--env', 'prod', '--release', RELEASE, '--readback', readback],
      ...['--profile-at', commit, '--repo', repo],
    ]
    const sevenPass = ['SMK-01', 'SMK-02', 'SMK-03', 'SMK-04', 'SMK-05', 'SMK-06', 'SMK-07'].map(id => `${id} pass\n`)
    // Prod unset while non-prod is on twilio: 503 unavailable passes and 400 fails.
    const unset = prodAnswers(unavailable)
    expect(await cli(prod(prodUnset), unset.transport)).toEqual({ code: 0, out: sevenPass.join('') })
    expect(unset.hosts).toEqual([`tls ${PROD_HOST}`, ...Array.from({ length: 5 }, () => `http ${PROD_HOST}`)])
    expect(unset.asked.map(request => [request.method, request.path, request.headers.origin ?? '-'])).toEqual([
      ['POST', '/api/auth/otp/request', PROD_ORIGIN],
      ['POST', '/api/auth/otp/request', 'https://example.invalid'],
      ['GET', '/ws', 'https://example.invalid'],
      ['GET', '/health', '-'],
      ['GET', '/', '-'],
    ])
    const unsetTwilio = await cli(prod(prodUnset), prodAnswers(invalidPhone).transport)
    expect(unsetTwilio.code).toBe(1)
    expect(unsetTwilio.out.split('\n')).toContain('SMK-02 fail status-400')
    // Prod on twilio while non-prod is unset: 400 invalid_phone passes and 503 fails.
    expect(await cli(prod(prodTwilio), prodAnswers(invalidPhone).transport)).toEqual({
      code: 0,
      out: sevenPass.join(''),
    })
    const twilioUnavailable = await cli(prod(prodTwilio), prodAnswers(unavailable).transport)
    expect(twilioUnavailable.code).toBe(1)
    expect(twilioUnavailable.out.split('\n')).toContain('SMK-02 fail status-503')
    // Non-prod's host and origin are never prod's.
    expect(PROD_HOST).not.toBe(HOST)
    expect(PROD_ORIGIN).not.toBe(APP_ORIGIN)
  })

  it('SMK-T08: --env restore --restore up judges SMK-06 alone at the restore profile’s counts, and asks nothing', async () => {
    const up = writeReadBack(restoreUpReadBack(), 'restore-up.json')
    const unreachable = fakeTransport({ tls: 'no-answer', http: () => 'no-answer' })
    const restore = (half: 'up' | 'down') => [
      ...['--env', 'restore', '--restore', half, '--release', RELEASE, '--readback', up],
      ...['--profile-at', before, '--repo', repo],
    ]
    expect(await cli(restore('up'), unreachable.transport)).toEqual({ code: 0, out: 'SMK-06 pass\n' })
    expect(unreachable.hosts).toEqual([])
    // The same read-back judged as down fails: its tasks still run.
    expect(await cli(restore('down'), unreachable.transport)).toEqual({
      code: 1,
      out: 'SMK-06 fail readback-api-running\n',
    })
    expect(unreachable.hosts).toEqual([])
  })

  // An export named `then` makes a module's namespace a thenable, so an import() of profiles.ts itself
  // would call it as the promise settles and take what it answers for the file's exports, or let it
  // print a verdict of its own and exit. The smoke loads profiles.ts through a wrapper instead, judging
  // by the values the file holds without calling its `then`. The case runs the smoke under Node, as a
  // smoke job does: Vitest's own module runner rewrites every import into an await of the module, so in
  // process the namespace is awaited whatever the smoke does. The restore stage asks nothing of the
  // network, so its down half needs no server.
  it('SMK-T08: a profiles.ts that exports `then` is read for its values, and its `then` never runs as it loads', () => {
    const source = readFileSync(PROFILES_SOURCE, 'utf8')
    const down = writeReadBack(
      changed(v =>
        Object.assign(v, { env: 'restore', probe: 'skipped', services: [], targetGroups: [], loadBalancer: null }),
      ),
      'then-down.json',
    )
    const notJson = join(scratch, 'then-not-json.json')
    writeFileSync(notJson, 'not json')
    const smoke = (readback: string, then: string) => {
      writeFileSync(join(repo, 'infra/src/config/profiles.ts'), `${source}\n${then}\n`)
      git(['commit', '-q', '-am', 'then'])
      const commit = git(['rev-parse', 'HEAD'])
      const argv = ['--env', 'restore', '--restore', 'down', '--release', RELEASE, '--readback', readback]
      const node = spawnSync(process.execPath, [SMOKE, ...argv, '--profile-at', commit, '--repo', repo], {
        cwd: repo,
        encoding: 'utf8',
        timeout: 30_000,
      })
      return [node.status, node.stdout, node.stderr]
    }
    try {
      // A `then` that answers with nothing the smoke can read, which would make it refuse as bad input.
      const empty = [
        'export function then(resolve: (value: unknown) => void): void {',
        "  process.stderr.write('then ran\\n')",
        '  resolve({})',
        '}',
      ].join('\n')
      expect(smoke(down, empty)).toEqual([0, 'SMK-06 pass\n', ''])
      // A `then` that prints a pass and exits 0, over a read-back that isn't JSON.
      const verdict = [
        'export function then(): void {',
        "  process.stdout.write('SMK-06 pass\\n')",
        '  process.exit(0)',
        '}',
      ].join('\n')
      expect(smoke(notJson, verdict)).toEqual([1, 'SMK-06 fail readback-json\n', ''])
    } finally {
      git(['reset', '-q', '--hard', prodTwilio])
    }
  }, 60_000)

  // A failure it didn't expect, in each half of main: before the judgement, a --profile-at commit whose
  // profiles.ts doesn't load; in it, a restore profile with no worker, whose count SMK-06 reads, and an
  // output that throws the first time it's written to. Each is one line and exit 1, so a smoke that
  // can't judge never passes, and no error message or stack reaches the log.
  it('SMK-T08: a failure it didn’t expect is one line, `smoke: failed`, and exit 1, never the error’s message', async () => {
    const source = readFileSync(PROFILES_SOURCE, 'utf8')
    const restoreWorker = /(\n {2}restore: \{\n(?: {4}.*\n)*?) {6}worker: [^\n]*\n/
    if (!restoreWorker.test(source)) throw new Error("profiles.ts no longer gives the restore profile's worker a line")
    const committed = (text: string) => {
      writeFileSync(join(repo, 'infra/src/config/profiles.ts'), text)
      git(['commit', '-q', '-am', 'failed'])
      return git(['rev-parse', 'HEAD'])
    }
    const unreachable = fakeTransport({ tls: 'no-answer', http: () => 'no-answer' })
    const up = writeReadBack(restoreUpReadBack(), 'failed-up.json')
    const restoreUp = (commit: string) => [
      ...['--env', 'restore', '--restore', 'up', '--release', RELEASE, '--readback', up],
      ...['--profile-at', commit, '--repo', repo],
    ]
    const failed = { code: 1, out: 'smoke: failed\n' }
    try {
      expect(await cli(restoreUp(committed(`${source}\nexport const = ${MARKER}\n`)), unreachable.transport)).toEqual(
        failed,
      )
      expect(await cli(restoreUp(committed(source.replace(restoreWorker, '$1'))), unreachable.transport)).toEqual(
        failed,
      )
    } finally {
      git(['reset', '-q', '--hard', prodTwilio])
    }
    // The same read-back passes at the restore profile as committed, so the profile is what failed it.
    expect(await cli(restoreUp(prodTwilio), unreachable.transport)).toEqual({ code: 0, out: 'SMK-06 pass\n' })
    let out = ''
    let writes = 0
    const code = await main(restoreUp(prodTwilio), {
      write: text => {
        writes += 1
        if (writes === 1) throw new Error(`stdout closed ${MARKER}`)
        out += text
      },
      readText: path => readFileSync(path, 'utf8'),
      cwd: repo,
      transport: unreachable.transport,
    })
    expect([code, out]).toEqual([1, 'smoke: failed\n'])
    expect(unreachable.hosts).toEqual([])
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
    // A release whose profile names an smsProvider the smoke doesn't know: refused as bad input before
    // anything is asked, never judged as if it were unset or twilio.
    const source = readFileSync(PROFILES_SOURCE, 'utf8')
    let unknown = ''
    try {
      writeFileSync(join(repo, 'infra/src/config/profiles.ts'), source.replace(NONPROD_SMS, "$1'sns',"))
      git(['commit', '-q', '-am', 'unknown smsProvider'])
      unknown = git(['rev-parse', 'HEAD'])
    } finally {
      git(['reset', '-q', '--hard', prodTwilio])
    }
    const answers = fakeTransport({ tls: TLS_GOOD, http: goodAnswer })
    expect(await cli([...base.slice(0, 6), '--profile-at', unknown, '--repo', repo], answers.transport)).toEqual({
      code: 2,
      out: "smoke: --profile-at's smsProvider is not one the smoke knows\n",
    })
    expect(answers.hosts).toEqual([])
  })
})

// A local TLS server standing in for the load balancer, with a certificate made for the test.
describe('SMK-T08 (C11-D54): the whole smoke against a local TLS server', () => {
  let server: Server | undefined
  let port = 0
  let cert = ''
  let upgradeAnswer = 'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
  // The body the api's sign-in answers from the app's origin, when a case sets one.
  let signInBody: string | undefined
  // Requests to /hang, which are never answered, and what to call when one arrives.
  const hanging: ServerResponse[] = []
  let onHang: () => void = () => undefined

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
        return send(503, signInBody ?? JSON.stringify({ error: 'unavailable', detail: MARKER, pad: 'x'.repeat(100) }))
      }
      if (request.url === '/hang') {
        hanging.push(response)
        return onHang()
      }
      return send(404, JSON.stringify({ error: 'Not Found', detail: MARKER }))
    })
    server.on('upgrade', (_request, socket) => socket.end(upgradeAnswer))
    await new Promise<void>(resolve => server?.listen(0, [127, 0, 0, 1].join('.'), resolve))
    port = (server.address() as AddressInfo).port
  }, 30_000)

  afterAll(async () => {
    for (const response of hanging) response.destroy()
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

  it('SMK-T08: a body past 4 KiB is cut off unread, so SMK-02 never reads its error word', async () => {
    // A sign-in answer of exactly the limit's bytes is read whole; one byte more is cut off.
    const sized = (bytes: number) => {
      const start = '{"error":"unavailable","pad":"'
      return `${start}${'x'.repeat(bytes - start.length - 2)}"}`
    }
    try {
      signInBody = sized(4096)
      expect((await liveAnswers(HOST, APP_ORIGIN, transport())).signIn).toEqual({ status: 503, error: 'unavailable' })
      signInBody = sized(4097)
      const cut = (await liveAnswers(HOST, APP_ORIGIN, transport())).signIn
      expect(cut).toEqual({ status: 503 })
      expect(smk02(cut, undefined)).toEqual({ pass: false, code: 'error-none' })
    } finally {
      signInBody = undefined
    }
  }, 30_000)

  it('SMK-T08: a request nothing answers gives up as no-answer at 10 s, and not before', async () => {
    const arrived = new Promise<void>(resolve => {
      onHang = resolve
    })
    // Only the transport's own timers are the test's to move; the sockets run on real time.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      let answer: RawAnswer | undefined
      void transport()
        .http(HOST, { method: 'GET', path: '/hang', headers: {}, readBody: false })
        .then(raw => {
          answer = raw
        })
      await arrived
      const settle = () => new Promise(resolve => setImmediate(resolve))
      vi.advanceTimersByTime(9_999)
      await settle()
      expect(answer).toBeUndefined()
      vi.advanceTimersByTime(1)
      await settle()
      expect(answer).toBe('no-answer')
    } finally {
      vi.useRealTimers()
      for (const response of hanging.splice(0)) response.destroy()
    }
  }, 30_000)

  it('SMK-T08: a TLS handshake nothing answers gives up as no-answer at 10 s, and not before', async () => {
    // A server that takes the connection and never says a word, so neither the handshake nor an error
    // ends the wait: only the transport's own timer does.
    const silent: Socket[] = []
    let accepted: () => void = () => undefined
    const arrived = new Promise<void>(resolve => {
      accepted = resolve
    })
    const mute = createTcpServer(socket => {
      silent.push(socket)
      accepted()
    })
    await new Promise<void>(resolve => mute.listen(0, [127, 0, 0, 1].join('.'), resolve))
    const mutePort = (mute.address() as AddressInfo).port
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      let answer: TlsAnswer | 'no-answer' | undefined
      void nodeTransport({ address: [127, 0, 0, 1].join('.'), port: mutePort, ca: cert })
        .tls(HOST)
        .then(raw => {
          answer = raw
        })
      await arrived
      const settle = () => new Promise(resolve => setImmediate(resolve))
      await settle()
      vi.advanceTimersByTime(9_999)
      await settle()
      expect(answer).toBeUndefined()
      vi.advanceTimersByTime(1)
      await settle()
      expect(answer).toBe('no-answer')
    } finally {
      vi.useRealTimers()
      for (const socket of silent) socket.destroy()
      await new Promise<void>(resolve => mute.close(() => resolve()))
    }
  }, 30_000)
})
