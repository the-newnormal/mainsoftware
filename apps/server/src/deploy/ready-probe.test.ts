// RPB-01 to RPB-04 (C11-D53): the readiness probe against the server's own /ready route, so a change
// to /ready's body the probe can't read fails here, beside hand-written servers for what the route
// never answers (a hostile body, a large one, silence) and a port nothing listens on. RPB-05 runs
// the probe inside the image, from scripts/check-server.sh.
import { createServer } from 'node:net'
import { type FastifyInstance, fastify } from 'fastify'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '#src/app.ts'
import type { Check } from '#src/ready.ts'
import {
  failingChecks,
  main,
  type ProbeRole,
  type ProbeTiming,
  parseGate,
  parseTargets,
  probe,
  type Target,
} from './ready-probe.ts'

const TIMING: ProbeTiming = { timeoutMs: 200, intervalMs: 50, deadlineMs: 1000 }
const HOST = '127.0.0.1'

const ok: Check = async () => {}
const down: Check = async () => {
  throw new Error('connection refused')
}

// The body a hostile or broken task might answer: names that aren't code identifiers, one of them a
// secret's name, one too long and one with an email's @, beside a check that passed.
const HOSTILE = { checks: { 'Hearth-Secret': 'failed', ['x'.repeat(40)]: 'failed', 'a@b': 'failed', ok_one: 'ok' } }

const apps: FastifyInstance[] = []
const port = { ready: 0, notReady: 0, hostile: 0, large: 0, silent: 0, refusing: 0 }
// How many times each real route's /ready was asked.
const asked = { ready: 0, notReady: 0 }

async function listen(app: FastifyInstance): Promise<number> {
  apps.push(app)
  await app.listen({ host: HOST, port: 0 })
  const address = app.server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return address.port
}

function realRoute(checks: Record<string, Check>, count: keyof typeof asked): FastifyInstance {
  const app = buildApp({ appOrigin: 'https://hearth.example.com', logger: pino({ level: 'silent' }), checks })
  app.addHook('onRequest', async request => {
    if (request.url === '/ready') asked[count] += 1
  })
  return app
}

// A port nothing listens on: one a listener held and gave back.
async function refusingPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, HOST, resolve))
  const address = server.address()
  await new Promise<void>(resolve => server.close(() => resolve()))
  if (address === null || typeof address === 'string') throw new Error('no port')
  return address.port
}

beforeAll(async () => {
  port.ready = await listen(realRoute({ postgres: ok, storage: ok, valkey: ok }, 'ready'))
  // Both reject at once: a stub that hung would hold /ready for CHECK_TIMEOUT_MS, past TIMING's.
  port.notReady = await listen(realRoute({ postgres: down, storage: down, valkey: ok }, 'notReady'))
  const hostile = fastify()
  hostile.get('/ready', async (_request, reply) => reply.code(503).send(HOSTILE))
  port.hostile = await listen(hostile)
  const large = fastify()
  large.get('/ready', async (_request, reply) =>
    reply.code(503).send({ checks: { postgres: 'failed' }, padding: 'p'.repeat(5000) }),
  )
  port.large = await listen(large)
  const silent = fastify({ forceCloseConnections: true })
  silent.get('/ready', () => new Promise(() => {}))
  port.silent = await listen(silent)
  port.refusing = await refusingPort()
})

afterAll(async () => {
  await Promise.all(apps.map(app => app.close()))
})

const target = (role: ProbeRole, at: number, index = 0): Target => ({ role, index, address: HOST, port: at })

// Every line of every case is checked here: the line's own shape, and nothing a task was given or
// answered (its address and port, a URL, a body's words, an error's).
const LINE = /^(?:api|realtime|worker) \d+ (?:\d{3}|no-answer) (?:-|[a-z_?]+(?:,[a-z_?]+)*)$/
const NEVER = [HOST, 'http', 'ready', 'status', 'checks', 'failed', 'ok', 'Hearth', 'Secret', '@', 'xxxx', 'padding']
const ERRORS = ['Error', 'ECONN', 'abort', 'Abort', 'timeout', 'fetch', 'refused']
function expectClean(text: string) {
  expect(text).toMatch(LINE)
  for (const word of [...NEVER, ...ERRORS]) expect(text).not.toContain(word)
  for (const at of Object.values(port)) expect(text).not.toContain(String(at))
}

async function probed(targets: readonly Target[], gate: readonly ProbeRole[]) {
  const started = Date.now()
  const result = await probe(targets, gate, TIMING)
  for (const text of result.lines) expectClean(text)
  return { ...result, elapsed: Date.now() - started }
}

describe('C11-D53: the readiness probe', () => {
  it('RPB-01 C11-D53: every gated target answering 200 exits 0, one line each, in the targets’ order', async () => {
    const both = await probed([target('api', port.ready), target('realtime', port.ready)], ['api', 'realtime'])
    expect(both).toMatchObject({ code: 0, lines: ['api 0 200 -', 'realtime 0 200 -'] })
    const twice = await probed([target('api', port.ready, 0), target('api', port.ready, 1)], ['api'])
    expect(twice).toMatchObject({ code: 0, lines: ['api 0 200 -', 'api 1 200 -'] })
    // PROBE_TARGETS numbers each role's targets from 0, in its own order.
    const parsed = parseTargets(`api=${HOST}:3000,realtime=${HOST}:3001,api=10.0.0.2:3000`)
    expect(parsed.map(({ role, index }) => `${role} ${index}`)).toEqual(['api 0', 'realtime 0', 'api 1'])
    expect(parsed[2]).toEqual({ role: 'api', index: 1, address: '10.0.0.2', port: 3000 })
  })

  it('RPB-02 C11-D53: a gated 503 from the real route exits 1 after the deadline, naming its failing checks; ungated, one round exits 0', async () => {
    const before = asked.notReady
    const gated = await probed([target('api', port.notReady)], ['api'])
    expect(gated).toMatchObject({ code: 1, lines: ['api 0 503 postgres,storage'] })
    expect(gated.elapsed).toBeGreaterThanOrEqual(TIMING.deadlineMs - TIMING.intervalMs)
    expect(asked.notReady - before).toBeGreaterThan(1)

    // --gate=none: exactly one round, through the entry, with its own timing.
    const once = asked.notReady
    const written: string[] = []
    const code = await main(['--gate=none'], { PROBE_TARGETS: `api=${HOST}:${port.notReady}` }, text =>
      written.push(text),
    )
    expect(code).toBe(0)
    expect(written).toEqual(['api 0 503 postgres,storage\n'])
    expect(asked.notReady - once).toBe(1)

    // A gated role passing while an ungated one fails.
    const mixed = await probed([target('api', port.ready), target('worker', port.notReady)], ['api'])
    expect(mixed).toMatchObject({ code: 0, lines: ['api 0 200 -', 'worker 0 503 postgres,storage'] })
  })

  it('RPB-03 C11-D53: silence and a refusal read no-answer within the fetch’s bound; a hostile body prints only ?; no line holds what a task was given or answered', async () => {
    // A silent target ends at the fetch's 200 ms timeout. The bound stays under the deadline a gated
    // probe waits for (RPB-02), so an ungated probe that went on asking fails, yet it leaves 750 ms for
    // a loaded runner's late timers: squeezed onto one CPU, some took over 300 ms (C0.11 PR 3).
    const bound = TIMING.deadlineMs - TIMING.intervalMs
    const silent = await probed([target('api', port.silent)], [])
    expect(silent).toMatchObject({ code: 0, lines: ['api 0 no-answer -'] })
    expect(silent.elapsed).toBeLessThan(bound)
    const refused = await probed([target('realtime', port.refusing)], [])
    expect(refused).toMatchObject({ code: 0, lines: ['realtime 0 no-answer -'] })
    expect(refused.elapsed).toBeLessThan(bound)
    // Gated, a target that never answers fails the gate.
    expect(await probed([target('api', port.silent)], ['api'])).toMatchObject({
      code: 1,
      lines: ['api 0 no-answer -'],
    })

    // Three failing names, none a code identifier, each printed as ?, never deduplicated; the passing
    // check left out.
    const hostile = await probed([target('worker', port.hostile)], [])
    expect(hostile.lines).toEqual(['worker 0 503 ?,?,?'])
    // A body past 4,096 bytes reports no failing check, only its status.
    const large = await probed([target('api', port.large)], [])
    expect(large.lines).toEqual(['api 0 503 -'])

    // The checks are sorted by the raw key; a body with no checks object reports none.
    expect(failingChecks(HOSTILE)).toEqual(['?', '?', '?'])
    expect(failingChecks({ checks: { valkey: 'timed out', gateway: 'failed', postgres: 'ok' } })).toEqual([
      'gateway',
      'valkey',
    ])
    for (const body of [
      undefined,
      null,
      'not ready',
      [],
      { checks: ['postgres'] },
      { checks: null },
      { status: 'x' },
    ]) {
      expect(failingChecks(body)).toEqual([])
    }
  })

  it('RPB-04 C11-D53: bad input exits 2 with one line naming PROBE_TARGETS or --gate, never the input', async () => {
    const valid = `api=${HOST}:3000`
    const cases: Array<{ env: NodeJS.ProcessEnv; argv: string[]; names: string; holds: string[] }> = [
      { env: {}, argv: ['--gate=none'], names: 'PROBE_TARGETS', holds: [] },
      { env: { PROBE_TARGETS: '' }, argv: ['--gate=none'], names: 'PROBE_TARGETS', holds: [] },
      { env: { PROBE_TARGETS: `api@${HOST}:3000` }, argv: ['--gate=none'], names: 'PROBE_TARGETS', holds: ['@'] },
      { env: { PROBE_TARGETS: `api=${HOST}` }, argv: ['--gate=none'], names: 'PROBE_TARGETS', holds: [] },
      {
        env: { PROBE_TARGETS: 'api=localhost:3000' },
        argv: ['--gate=none'],
        names: 'PROBE_TARGETS',
        holds: ['localhost'],
      },
      {
        env: { PROBE_TARGETS: 'api=10.0.0.300:3000' },
        argv: ['--gate=none'],
        names: 'PROBE_TARGETS',
        holds: ['10.0', '300'],
      },
      { env: { PROBE_TARGETS: `api=${HOST}:0` }, argv: ['--gate=none'], names: 'PROBE_TARGETS', holds: [':0'] },
      { env: { PROBE_TARGETS: `db=${HOST}:3000` }, argv: ['--gate=none'], names: 'PROBE_TARGETS', holds: ['db'] },
      { env: { PROBE_TARGETS: valid }, argv: [], names: '--gate', holds: [] },
      { env: { PROBE_TARGETS: valid }, argv: ['--gate'], names: '--gate', holds: [] },
      { env: { PROBE_TARGETS: valid }, argv: ['--gate='], names: '--gate', holds: [] },
      { env: { PROBE_TARGETS: valid }, argv: ['--gate', 'api'], names: '--gate', holds: ['api'] },
      { env: { PROBE_TARGETS: valid }, argv: ['--gate=api,db'], names: '--gate', holds: ['api', 'db'] },
      { env: { PROBE_TARGETS: valid }, argv: ['--gate=worker'], names: '--gate', holds: ['worker'] },
      { env: { PROBE_TARGETS: valid }, argv: ['--gate=none', '--gate=none'], names: '--gate', holds: ['none'] },
      { env: { PROBE_TARGETS: valid }, argv: ['--gate=none', 'extra'], names: '--gate', holds: ['none', 'extra'] },
      // The gate is never read from a variable, so one set without the argument is no gate at all.
      { env: { PROBE_TARGETS: valid, PROBE_GATE: 'api' }, argv: [], names: '--gate', holds: ['PROBE_GATE', 'api'] },
    ]
    for (const { env, argv, names, holds } of cases) {
      const written: string[] = []
      expect(await main(argv, env, text => written.push(text)), JSON.stringify({ env, argv })).toBe(2)
      expect(written).toHaveLength(1)
      const [text = ''] = written
      expect(text).toMatch(new RegExp(`^probe: ${names} [^\\n]+\\n$`))
      for (const fragment of [...holds, HOST, '3000']) expect(text).not.toContain(fragment)
    }
    // The gate's own form: roles comma-separated, each once, or none.
    const targets = parseTargets(`${valid},realtime=${HOST}:3001`)
    expect(parseGate(['--gate=realtime,api'], targets)).toEqual(['realtime', 'api'])
    expect(parseGate(['--gate=none'], targets)).toEqual([])
    for (const argv of [['--gate=api,api'], ['--gate=api,'], ['--gate=none,api'], ['--gate=API']]) {
      expect(() => parseGate(argv, targets), argv.join(' ')).toThrow(/^--gate /)
    }
  })
})
