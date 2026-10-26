// Requests to the DPO at the api (compliance/cases.ts; C0.9 PR 3b, RQV-01 to RQV-09), on a scripted
// pool: the bodies and the path read strictly before anything else, can() and the notice gate
// before the database, the shared rules before the functions, each SQLSTATE as design 1.20 answers
// it, the id-only events, the lists' caps, which reads run read-only, and the withdrawal reply. The
// integration suite (cases.integration.test.ts) runs them on the Compose stack. Every fixture is
// fictional.
import {
  CASE_MINE_MAX,
  CASE_OTHERS_MAX,
  CASE_PEOPLE_MAX,
  CASE_QUEUE_CLOSED_MAX,
  CASE_QUEUE_OPEN_MAX,
  CasePeopleResponse,
  CaseResponse,
  CaseStepBody,
  CaseStepResponse,
  LogRequestBody,
  LogRequestResponse,
  MyRequestsResponse,
  RequestQueueResponse,
  SendRequestBody,
  SendRequestResponse,
} from '@hearth/shared'
import type { Redis } from 'ioredis'
import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { type Api, registerApi } from '#src/api.ts'
import { buildApp } from '#src/app.ts'
import { Breaker } from '#src/auth/breaker.ts'
import { type AuthKeys, deriveKeys } from '#src/auth/crypto.ts'
import { ApiError } from '#src/auth/errors.ts'
import { relyingParty } from '#src/auth/passkeys.ts'
import { OTP } from '#src/auth/policy.ts'
import { valkeyKeys } from '#src/auth/valkey-keys.ts'
import {
  addCaseStep,
  CASE_ERRORS,
  caseAttention,
  logRequest,
  readCase,
  readCasePeople,
  readMyRequests,
  readQueue,
  sendRequest,
  stepShapeProblems,
} from '#src/compliance/cases.ts'
import { createDatabase } from '#src/db/database.ts'
import { AfterResponse, parse, type ReqInfo } from '#src/http.ts'
import { createLogger } from '#src/logger.ts'
import { staticFlags } from '#src/testing/flags.ts'
import { appended, pgError, type Statement, scriptedPool, standingsOf } from '#src/testing/pool.ts'
import { NOTHING_CLEARED } from '#src/testing/transfers.ts'

const ORG = 'a0000000-0000-4000-8000-000000000001'
const OWNER = 'b0000000-0000-4000-8000-000000000001'
const DPO = 'b0000000-0000-4000-8000-000000000005'
const MEMBER = 'b0000000-0000-4000-8000-000000000008'
const LEFT = 'b0000000-0000-4000-8000-000000000009'
// Someone in another org, or nobody: the World holds neither.
const ELSEWHERE = 'b0000000-0000-4000-8000-0000000000ff'
const DEVICE = 'd0000000-0000-4000-8000-000000000001'
const CASE = 'e0000000-0000-4000-8000-0000000000c1'
const NOTICE = 'c0000000-0000-4000-8000-0000000000a1'
const KEY = 'f0000000-0000-4000-8000-0000000000b1'
const APP_ORIGIN = 'https://hearth.example.com'
// The design's example reference (PPL-09), as stored.
const REFERENCE = 'K7QMX3TD'

const session = (userId = DPO) => ({
  sessionId: 'e0000000-0000-4000-8000-000000000001',
  orgId: ORG,
  userId,
  deviceId: DEVICE,
})

// A row of the requester's tracking, as read_own_cases() returns it.
const mineRow = (n: number, change: Record<string, unknown> = {}) => ({
  id: `e0000000-0000-4000-8000-${String(0x100 + n).padStart(12, '0')}`,
  reference: REFERENCE,
  kind: 'complaint',
  came_by: 'hearth',
  received_on: '2026-10-27',
  state: 'received',
  due_on: '2026-11-10',
  replied_on: null,
  replied_in_time: false,
  closed_on: null,
  open_total: 3,
  ...change,
})

// A row of the queue, as read_cases() returns it.
const queueRow = (n: number, closed: boolean, change: Record<string, unknown> = {}) => ({
  id: `e0000000-0000-4000-8000-${String(0x200 + n).padStart(12, '0')}`,
  reference: REFERENCE,
  kind: 'complaint',
  came_by: 'hearth',
  received_on: '2026-10-27',
  due_on: closed ? null : '2026-11-10',
  replied_on: null,
  replied_in_time: false,
  revision: closed ? 1 : 0,
  state: closed ? 'closed' : 'new',
  requester_name: 'Marcus Tan',
  requester_department: 'Operations',
  requester_outside: false,
  requester_left: false,
  closed_on: closed ? '2026-11-06' : null,
  outcome: closed ? 'answered' : null,
  open_total: closed ? null : 250,
  ...change,
})

// The request on its sheet, as read_case() returns it: Marcus's complaint, sent in Hearth.
const caseRow = (change: Record<string, unknown> = {}) => ({
  id: CASE,
  reference: REFERENCE,
  kind: 'complaint',
  received_kind: 'complaint',
  came_by: 'hearth',
  received_on: '2026-10-27',
  logged_on: '2026-10-27',
  logged_by_name: 'Marcus Tan',
  requester_person_id: MEMBER,
  requester_name: 'Marcus Tan',
  requester_outside: false,
  requester_department: 'Operations',
  requester_manager: 'Ashton Teo',
  requester_left_on: null,
  requester_channel: null,
  requester_contact: null,
  details: 'A fictional complaint about the rota.',
  today: '2026-10-28',
  due_on: '2026-11-10',
  replied_on: null,
  replied_in_time: false,
  revision: 1,
  state: 'in_progress',
  identity_checked: false,
  review_open: false,
  closed_on: null,
  closed_kind: null,
  outcome: null,
  closed_note: null,
  closed_by_name: null,
  ...change,
})

const stepRow = {
  number: 1,
  step: 'acknowledged',
  on_day: '2026-10-28',
  note: null,
  extended_to: null,
  kind: null,
  recorded_on: '2026-10-28',
  recorded_by_name: 'Ashton Teo',
}

const otherRow = (n: number) => ({
  id: `e0000000-0000-4000-8000-${String(0x300 + n).padStart(12, '0')}`,
  reference: REFERENCE,
  kind: 'question',
  came_by: 'email',
  received_on: '2026-09-01',
  state: 'closed',
  due_on: null,
  replied_in_time: true,
  closed_on: '2026-09-05',
  outcome: 'answered',
})

const personRow = (n: number) => ({
  id: `b0000000-0000-4000-8000-${String(0x400 + n).padStart(12, '0')}`,
  name: `Fictional Person ${n}`,
  department: null,
  manager: null,
  added_on: '2026-01-05',
  left_on: n % 2 === 0 ? '2026-06-30' : null,
})

interface World {
  // Whether the acting session was re-authenticated in the last 5 minutes.
  fresh?: boolean
  standing?: 'acknowledged' | 'required' | 'unpublished'
  // Each function's rows, or an error to raise (only the writer the test calls is asked).
  call?: unknown[] | Error
  mine?: unknown[] | Error
  open?: unknown[]
  closed?: unknown[]
  kase?: unknown[] | Error
  steps?: unknown[]
  others?: unknown[]
  people?: unknown[]
  // The latest published version for the withdrawal reply: generated (c09.3) unless null.
  latest?: { generator: string | null } | null
}

function org(w: World = {}) {
  return scriptedPool((statement: Statement) => {
    const { text, values } = statement
    if (text.includes('from people p join devices d')) {
      return [{ fresh: w.fresh ?? true, pin_set: true, issued_under_pin_rule: true }]
    }
    if (text.startsWith('select "id", "deactivated_at" from "people"')) {
      return [
        { id: OWNER, deactivated_at: null },
        { id: DPO, deactivated_at: null },
        { id: MEMBER, deactivated_at: null },
        { id: LEFT, deactivated_at: new Date('2026-10-01T00:00:00Z') },
      ]
    }
    if (text.startsWith('select "person_id", "role"')) {
      return [
        { person_id: OWNER, role: 'owner', team_id: null, revoked_at: null },
        { person_id: DPO, role: 'dpo', team_id: null, revoked_at: null },
      ]
    }
    if (text.startsWith('select x.person, case when v.id is null') && w.standing !== undefined) {
      return standingsOf([OWNER, DPO, MEMBER, LEFT], w.standing)
    }
    if (text.startsWith('select ((now() at time zone time_zone)::date)::text as today from orgs')) {
      return [{ today: '2026-10-28' }]
    }
    if (text.includes('from public.read_own_cases(')) return w.mine ?? [mineRow(1)]
    if (text.includes('from public.read_cases(')) {
      return values[0] === true ? [...(w.closed ?? [queueRow(9, true)])] : [...(w.open ?? [queueRow(1, false)])]
    }
    if (text.includes('from public.read_case(')) return w.kase ?? [caseRow()]
    if (text.includes('from public.read_case_steps(')) return [...(w.steps ?? [stepRow])]
    if (text.includes('from public.read_case_others(')) return [...(w.others ?? [otherRow(1)])]
    if (text.startsWith('select p.id, p.full_name as name, d.name as department')) {
      return [...(w.people ?? [personRow(1)])]
    }
    if (text.startsWith('select v.id, o.name as org, s.contact_title as title')) {
      const latest = w.latest === undefined ? { generator: 'c09.3' } : w.latest
      return latest === null || latest.generator === null
        ? []
        : [{ id: NOTICE, org: 'Tembusu Example', title: 'Data Protection Officer' }]
    }
    if (text.startsWith('select l.purpose, r.basis from notice_version_purposes l')) {
      return [
        { purpose: 'accounts', basis: 'employment' },
        { purpose: 'security_audit', basis: 'legitimate_interests' },
      ]
    }
    if (/^select (id, reference|revision)\b.*from public\.(submit_case|log_case|add_case_step)\(/.test(text)) {
      return w.call ?? []
    }
    if (text.startsWith('select public.case_attention()')) return [{ count: 2 }]
    return []
  })
}

function context(pool: ReturnType<typeof scriptedPool>) {
  const after = vi.fn()
  const api: Api = {
    db: pool.db,
    valkey: { publish: vi.fn() } as unknown as Redis,
    keys: deriveKeys('unit-test-unit-test-unit-test-unit-test'),
    sms: undefined,
    keyPrefix: 'it:unit:',
    flags: staticFlags(),
    afterResponse: new AfterResponse(),
    appOrigin: APP_ORIGIN,
    names: valkeyKeys('it:unit:'),
    rp: relyingParty(APP_ORIGIN),
    otp: { verifyFloorMs: 0, breaker: new Breaker(OTP.breaker) },
    passkeys: false,
    transfers: NOTHING_CLEARED,
  }
  const info: ReqInfo = {
    ip: '198.51.100.7',
    requestId: 'f0000000-0000-4000-8000-000000000001',
    userAgent: undefined,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ReqInfo['log'],
    after,
  }
  return { api, info, after }
}

async function refusal(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  if (!(error instanceof ApiError)) throw new Error(`expected an ApiError, got ${String(error)}`)
  return error
}

const callOf = (pool: ReturnType<typeof scriptedPool>, name: string) =>
  pool.statements.find(statement => statement.text.includes(`from public.${name}(`))
const calledAny = (pool: ReturnType<typeof scriptedPool>) =>
  pool.texts().some(text => /from public\.(submit_case|log_case|add_case_step|read_\w+)\(/.test(text))

const sendBody = (input: Record<string, unknown> = {}) =>
  parse(SendRequestBody, { kind: 'complaint', details: ' A fictional complaint. ', key: KEY, ...input })
const logBody = (input: Record<string, unknown> = {}) =>
  parse(LogRequestBody, {
    kind: 'access',
    cameBy: 'email',
    receivedOn: '2026-10-25',
    requester: { type: 'outside', name: 'Sam Example', channel: 'email', contact: 'sam@requests.example' },
    details: 'Asks for a copy of what is held about them.',
    key: KEY,
    ...input,
  })
const stepBody = (input: Record<string, unknown> = {}) =>
  parse(CaseStepBody, {
    case: CASE,
    seen: 1,
    step: 'note',
    onDay: '2026-10-28',
    note: 'Called them back.',
    extendedTo: null,
    kind: null,
    outcome: null,
    ...input,
  })

// The api app with a database it must never reach, for what is decided before any read.
function routeApp() {
  let touched = 0
  const pool = {
    connect: async () => {
      touched++
      throw new Error('the database was touched')
    },
    end: async () => {},
    options: {},
  } as unknown as Pool
  const logger = createLogger({ logLevel: 'silent', role: 'api' })
  const app = buildApp({ appOrigin: APP_ORIGIN, logger, checks: {} })
  registerApi(app, {
    appOrigin: APP_ORIGIN,
    db: createDatabase(pool),
    valkey: {} as Redis,
    keys: {} as AuthKeys,
    sms: undefined,
    keyPrefix: 'it:unit:',
    flags: staticFlags(),
  })
  const post = (url: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url,
      headers: {
        origin: APP_ORIGIN,
        'content-type': 'application/json',
        cookie: `__Host-hearth_session=${'t'.repeat(43)}`,
      },
      payload: JSON.stringify(payload),
    })
  const get = (url: string) =>
    app.inject({ method: 'GET', url, headers: { cookie: `__Host-hearth_session=${'t'.repeat(43)}` } })
  return { app, post, get, touched: () => touched }
}

describe('RQV-01 C0.9 PR 3b the bodies and the path, read strictly before the session', () => {
  it('answers a malformed body 400 invalid_request, never echoing it, before the session is read', async () => {
    const { post, touched } = routeApp()
    for (const [url, body] of [
      ['/api/requests/send', { kind: 'complaint', details: 'x', key: KEY, extra: 1 }],
      ['/api/requests/send', { kind: 'gossip', details: 'x', key: KEY }],
      // An upper-case key: ids are lower case (LowerUuid).
      ['/api/requests/send', { kind: 'question', details: 'x', key: KEY.toUpperCase() }],
      ['/api/admin/requests/log', { ...logBody(), cameBy: 'hearth' }],
      ['/api/admin/requests/log', { ...logBody(), requester: { type: 'person', person: MEMBER, channel: 'email' } }],
      ['/api/admin/requests/step', { ...stepBody(), extendedTo: '2026-11-20' }],
      ['/api/admin/requests/step', { ...stepBody(), step: 'closed' }],
      ['/api/admin/notice/targets/set', { seen: 1, businessDays: 7.5, calendarDays: 21 }],
    ] as const) {
      const response = await post(url, body)
      expect(response.statusCode, `${url} ${JSON.stringify(body)}`).toBe(400)
      expect(response.json().error).toBe('invalid_request')
      expect(response.body).not.toContain('gossip')
    }
    expect(touched()).toBe(0)
  })

  it('takes a request’s id in the path only as a lower-case uuid, else 400 before the session; the static paths are matched first', async () => {
    const { get, touched } = routeApp()
    for (const id of ['K7QM-X3TD', CASE.toUpperCase(), 'not-a-uuid', `${CASE}x`]) {
      const response = await get(`/api/admin/requests/${encodeURIComponent(id)}`)
      expect(response.statusCode, id).toBe(400)
      expect(response.json().error).toBe('invalid_request')
    }
    expect(touched()).toBe(0)
    // /people is its own route, not a request's id: it reaches the session read (and this
    // database), never the path's 400.
    const people = await get('/api/admin/requests/people')
    expect(people.statusCode).not.toBe(400)
  })

  it('reads each body as packages/shared says: text trimmed and blank as null, enums, days and exactly the fields a step takes', () => {
    expect(sendBody({ details: '  ' }).details).toBeNull()
    expect(sendBody().details).toBe('A fictional complaint.')
    expect(stepBody({ step: 'extended', extendedTo: '2026-11-20' }).extendedTo).toBe('2026-11-20')
    expect(CaseStepBody.safeParse({ ...stepBody(), step: 'reclassified' }).success).toBe(false)
    expect(LogRequestBody.safeParse({ ...logBody(), receivedOn: '0000-12-31' }).success).toBe(false)
  })
})

describe('RQV-02 C0.9 OD-13 OD-14 can() and the notice gate decide before the database', () => {
  const dpoRoutes = [
    ['queue', (c: ReturnType<typeof context>, who: string) => readQueue(c.api, session(who), c.info)],
    ['people', (c: ReturnType<typeof context>, who: string) => readCasePeople(c.api, session(who), c.info)],
    ['case', (c: ReturnType<typeof context>, who: string) => readCase(c.api, CASE, session(who), c.info)],
    ['log', (c: ReturnType<typeof context>, who: string) => logRequest(c.api, logBody(), session(who), c.info)],
    ['step', (c: ReturnType<typeof context>, who: string) => addCaseStep(c.api, stepBody(), session(who), c.info)],
  ] as const

  it('refuses an Owner, a Member and a DPO whose PIN is more than 5 minutes old on every DPO route, before any function is called', async () => {
    for (const [name, call] of dpoRoutes) {
      for (const [who, fresh, code] of [
        [OWNER, true, 'forbidden'],
        [MEMBER, true, 'forbidden'],
        [DPO, false, 'reauth_required'],
      ] as const) {
        const pool = org({ fresh, call: [{ id: CASE, reference: REFERENCE, due_on: '2026-11-24', changed: true }] })
        const c = context(pool)
        const error = await refusal(call(c, who))
        expect(error, `${name} ${who}`).toMatchObject({ status: 403, code })
        if (code === 'reauth_required') expect(error.extra).toEqual({ method: 'pin' })
        expect(calledAny(pool), name).toBe(false)
        expect(appended(pool.statements)).toEqual([])
      }
    }
  })

  it('refuses logging for yourself, another org’s person or an unknown id through can() (403), and allows a leaver and someone without an account', async () => {
    for (const person of [DPO, ELSEWHERE]) {
      const pool = org({ call: [{ id: CASE, reference: REFERENCE, due_on: '2026-11-24', changed: true }] })
      const c = context(pool)
      const body = logBody({ requester: { type: 'person', person } })
      expect(await refusal(logRequest(c.api, body, session(), c.info)), person).toMatchObject({
        status: 403,
        code: 'forbidden',
      })
      expect(callOf(pool, 'log_case')).toBeUndefined()
    }
    for (const requester of [
      { type: 'person', person: LEFT, channel: 'email', contact: 'former@requests.example' },
      { type: 'person', person: MEMBER },
    ]) {
      const pool = org({ call: [{ id: CASE, reference: REFERENCE, due_on: '2026-11-24', changed: true }] })
      const c = context(pool)
      const { body } = await logRequest(c.api, logBody({ requester }), session(), c.info)
      expect(LogRequestResponse.parse(body).changed).toBe(true)
    }
  })

  it('OD-13: before acknowledging the current version, the requester’s two answer 403 notice_required, and so do the DPO’s, before v0 too (not setup uses: PD-98)', async () => {
    for (const standing of ['required', 'unpublished'] as const) {
      for (const [name, call] of [
        ['send', (c: ReturnType<typeof context>) => sendRequest(c.api, sendBody(), session(MEMBER), c.info)],
        ['mine', (c: ReturnType<typeof context>) => readMyRequests(c.api, session(MEMBER), c.info)],
        ...dpoRoutes.map(([route, f]) => [route, (c: ReturnType<typeof context>) => f(c, DPO)] as const),
      ] as const) {
        const pool = org({ standing })
        const c = context(pool)
        expect(await refusal(call(c)), `${name} ${standing}`).toMatchObject({ status: 403, code: 'notice_required' })
        expect(calledAny(pool)).toBe(false)
      }
    }
  })

  it('answers someone no longer at the org 401 signed_out on the requester’s two, clearing the cookie', async () => {
    for (const call of [
      (c: ReturnType<typeof context>) => sendRequest(c.api, sendBody(), session(LEFT), c.info),
      (c: ReturnType<typeof context>) => readMyRequests(c.api, session(LEFT), c.info),
    ]) {
      const pool = org()
      const c = context(pool)
      const error = await refusal(call(c))
      expect(error).toMatchObject({ status: 401, code: 'signed_out' })
      expect(error.clear.length).toBeGreaterThan(0)
      expect(calledAny(pool)).toBe(false)
    }
  })
})

describe('RQV-03 C0.9 PD-89 PD-96 PD-102 the shared rules answer 400 case_invalid before the functions', () => {
  it('a request with nothing written (but a copy), too long or not plain text', async () => {
    for (const input of [
      { kind: 'question', details: null },
      { details: 'x'.repeat(4001) },
      { details: 'Plain\u0007bell' },
      { details: 'Reads\u202Ebackwards' },
    ]) {
      const pool = org({ call: [] })
      const c = context(pool)
      expect(await refusal(sendRequest(c.api, sendBody(input), session(MEMBER), c.info))).toMatchObject({
        status: 400,
        code: 'case_invalid',
      })
      expect(callOf(pool, 'submit_case')).toBeUndefined()
      expect(pool.texts().at(-1)).toBe('rollback')
    }
    // A copy needs no words, and an ID-number shape in a requester's own words is theirs (PD-102).
    for (const input of [{ kind: 'access', details: null }, { details: 'My number is S1234567D' }]) {
      const pool = org({
        call: [{ id: CASE, reference: REFERENCE, received_on: '2026-10-28', due_on: '2026-11-27', changed: true }],
      })
      const c = context(pool)
      await sendRequest(c.api, sendBody(input), session(MEMBER), c.info)
      expect(callOf(pool, 'submit_case')).toBeDefined()
    }
  })

  it('a logged request against today in the org’s zone: an ID number in what the DPO types, a day out of range, a contact out of shape', async () => {
    for (const input of [
      { requester: { type: 'outside', name: 'Sam S1234567D', channel: 'email', contact: 'sam@requests.example' } },
      { requester: { type: 'outside', name: 'Sam Example', channel: 'email', contact: 'not an address' } },
      { requester: { type: 'outside', name: 'Sam\nExample', channel: 'phone', contact: '+65 8000 0101' } },
      { receivedOn: '2026-10-29' },
      { receivedOn: '2025-10-27' },
      { details: 'Their NRIC is S1234567D.' },
    ]) {
      const pool = org({ call: [] })
      const c = context(pool)
      expect(await refusal(logRequest(c.api, logBody(input), session(), c.info)), JSON.stringify(input)).toMatchObject({
        status: 400,
        code: 'case_invalid',
      })
      expect(callOf(pool, 'log_case')).toBeUndefined()
      // Today is the org's, read before the rules.
      expect(pool.texts().some(text => text.startsWith('select ((now() at time zone time_zone)::date)::text'))).toBe(
        true,
      )
    }
  })

  it('a step’s shape alone: a note step with no note, a note too long or with an ID number, an identity note on two lines, a refusal with no why; the rest is the function’s to decide against the request it locks', async () => {
    for (const input of [
      { note: null },
      { note: 'x'.repeat(2001) },
      { note: 'Checked S1234567D' },
      { step: 'identity_checked', note: 'Called back\non their number' },
      { step: 'closed', outcome: 'refused', note: null },
    ]) {
      const pool = org({ call: [{ revision: 2 }] })
      const c = context(pool)
      expect(
        await refusal(addCaseStep(c.api, stepBody(input), session(), c.info)),
        JSON.stringify(input),
      ).toMatchObject({ status: 400, code: 'case_invalid' })
      expect(callOf(pool, 'add_case_step')).toBeUndefined()
    }
    // A refusal of a complaint, closing a copy before identity is checked, more time told late:
    // the route can't know the request, so the function decides (HF006).
    expect(stepShapeProblems(stepBody({ step: 'closed', outcome: 'refused', note: 'No copy is held.' }))).toEqual([])
    expect(stepShapeProblems(stepBody({ step: 'closed', outcome: 'answered', note: null }))).toEqual([])
    expect(
      stepShapeProblems(stepBody({ step: 'extended', extendedTo: '2026-11-30', onDay: '2026-11-20', note: null })),
    ).toEqual([])
  })
})

describe('RQV-04 C0.9 design 1.20 each SQLSTATE as the api answers it', () => {
  const writes = [
    [
      'submit_case',
      (c: ReturnType<typeof context>) => sendRequest(c.api, sendBody(), session(MEMBER), c.info),
      'signed_out',
    ],
    ['log_case', (c: ReturnType<typeof context>) => logRequest(c.api, logBody(), session(), c.info), 'forbidden'],
    [
      'add_case_step',
      (c: ReturnType<typeof context>) => addCaseStep(c.api, stepBody(), session(), c.info),
      'forbidden',
    ],
  ] as const

  it('HF005 409 case_changed, HF006 and a case table’s check 400 case_invalid, 22023 404, 42501 the caller’s: forbidden for the DPO’s, signed_out for the requester’s', async () => {
    for (const [name, call, insufficient] of writes) {
      for (const [sqlstate, status, code, constraint] of [
        ['HF005', 409, 'case_changed', undefined],
        ['HF006', 400, 'case_invalid', undefined],
        ['23514', 400, 'case_invalid', 'cases_requester_contact'],
        ['23514', 400, 'case_invalid', 'case_steps_note'],
        ['22023', 404, 'not_found', undefined],
        ['42501', insufficient === 'forbidden' ? 403 : 401, insufficient, undefined],
      ] as const) {
        const pool = org({ call: pgError(sqlstate, constraint) })
        const c = context(pool)
        expect(await refusal(call(c)), `${name} ${sqlstate}`).toMatchObject({ status, code })
        expect(appended(pool.statements)).toEqual([])
        expect(pool.texts().at(-1)).toBe('rollback')
      }
    }
  })

  it('leaves a conflict to the api’s 409 try_again, and a row count out of bounds (2201W) or another table’s check unanswered: a logged 500', async () => {
    for (const [sqlstate, constraint] of [
      ['40P01', undefined],
      ['40001', undefined],
      ['2201W', undefined],
      ['23514', 'audit_events_action'],
      ['23514', undefined],
    ] as const) {
      const pool = org({ call: pgError(sqlstate, constraint) })
      const c = context(pool)
      const error = await logRequest(c.api, logBody(), session(), c.info).then(
        () => undefined,
        (e: unknown) => e,
      )
      expect(error, sqlstate).not.toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ code: sqlstate })
    }
    // The reads answer theirs the same way: none, or another org's, is 404; 2201W a 500.
    const missing = context(org({ kase: pgError('22023') }))
    expect(await refusal(readCase(missing.api, CASE, session(), missing.info))).toMatchObject({
      status: 404,
      code: 'not_found',
    })
    const notDpo = context(org({ kase: pgError('42501') }))
    expect(await refusal(readCase(notDpo.api, CASE, session(), notDpo.info))).toMatchObject({
      status: 403,
      code: 'forbidden',
    })
    const mine = context(org({ mine: pgError('2201W') }))
    const error = await readMyRequests(mine.api, session(MEMBER), mine.info).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error).not.toBeInstanceOf(ApiError)
  })
})

describe('RQV-05 C0.9 PD-101 the id-only events', () => {
  const eventOf = (pool: ReturnType<typeof scriptedPool>) =>
    pool.statements.find(statement => statement.text.startsWith('insert into outbox_events'))

  it('sends through submit_case() with the session’s device, and appends case.opened ({via: form}) only when something was recorded: the case as entity, no subjects, request_handling', async () => {
    for (const changed of [true, false]) {
      const pool = org({
        call: [{ id: CASE, reference: REFERENCE, received_on: '2026-10-28', due_on: '2026-11-11', changed }],
      })
      const c = context(pool)
      const { body } = await sendRequest(c.api, sendBody(), session(MEMBER), c.info)
      expect(SendRequestResponse.parse(body)).toEqual({
        case: CASE,
        reference: REFERENCE,
        receivedOn: '2026-10-28',
        dueOn: '2026-11-11',
        changed,
      })
      const call = callOf(pool, 'submit_case')
      expect(call?.text).toBe(
        'select id, reference, received_on::text as received_on, due_on::text as due_on, changed from public.submit_case($1, $2, $3::uuid, $4, $5::uuid, $6::inet)',
      )
      expect(call?.values).toEqual(['complaint', 'A fictional complaint.', KEY, c.info.requestId, DEVICE, c.info.ip])
      expect(appended(pool.statements)).toEqual(
        changed ? [{ type: 'case.opened', entity: CASE, subjects: [], ids: { via: 'form' }, actor: undefined }] : [],
      )
      if (changed) expect(eventOf(pool)?.values).toContain('request_handling')
      // can() first, re-reading the acting session FOR SHARE, then the function.
      const texts = pool.texts()
      const acting = texts.findIndex(text => text.includes('from people p join devices d'))
      expect(texts[acting]).toMatch(/for share of p, d, s/)
      expect(acting).toBeLessThan(texts.findIndex(text => text.includes('from public.submit_case(')))
      expect(texts.at(-1)).toBe('commit')
    }
  })

  it('logs through log_case() with the requester’s fields as given, and appends case.opened ({via: intake}) only when something was recorded', async () => {
    for (const changed of [true, false]) {
      const pool = org({ call: [{ id: CASE, reference: REFERENCE, due_on: '2026-11-24', changed }] })
      const c = context(pool)
      const { body } = await logRequest(c.api, logBody(), session(), c.info)
      expect(LogRequestResponse.parse(body)).toEqual({ case: CASE, reference: REFERENCE, dueOn: '2026-11-24', changed })
      expect(callOf(pool, 'log_case')?.values).toEqual([
        'access',
        'email',
        '2026-10-25',
        null,
        'Sam Example',
        'email',
        'sam@requests.example',
        'Asks for a copy of what is held about them.',
        KEY,
        c.info.requestId,
        DEVICE,
        c.info.ip,
      ])
      expect(appended(pool.statements)).toEqual(
        changed ? [{ type: 'case.opened', entity: CASE, subjects: [], ids: { via: 'intake' }, actor: undefined }] : [],
      )
    }
    // A person requester passes their id and no name; a channel only when given.
    const pool = org({ call: [{ id: CASE, reference: REFERENCE, due_on: '2026-11-24', changed: true }] })
    const c = context(pool)
    await logRequest(c.api, logBody({ requester: { type: 'person', person: MEMBER } }), session(), c.info)
    expect(callOf(pool, 'log_case')?.values.slice(3, 7)).toEqual([MEMBER, null, null, null])
  })

  it('records a step through add_case_step() from the revision the sheet showed, and always appends case.changed with the new revision', async () => {
    const pool = org({ call: [{ revision: 2 }] })
    const c = context(pool)
    const { body } = await addCaseStep(
      c.api,
      stepBody({ step: 'closed', outcome: 'answered', note: null }),
      session(),
      c.info,
    )
    expect(CaseStepResponse.parse(body)).toEqual({ revision: 2 })
    const call = callOf(pool, 'add_case_step')
    expect(call?.text).toBe(
      'select revision from public.add_case_step($1::uuid, $2::integer, $3, $4::date, $5, $6::date, $7, $8, $9, $10::uuid, $11::inet)',
    )
    expect(call?.values).toEqual([
      CASE,
      1,
      'closed',
      '2026-10-28',
      null,
      null,
      null,
      'answered',
      c.info.requestId,
      DEVICE,
      c.info.ip,
    ])
    expect(appended(pool.statements)).toEqual([
      { type: 'case.changed', entity: CASE, subjects: [], ids: { revision: 2 }, actor: undefined },
    ])
    // The event names no kind, no reference and no words.
    expect(JSON.stringify(eventOf(pool)?.values)).not.toMatch(/K7QM|complaint|answered/)
  })
})

describe('RQV-06 C0.9 PD-97 PD-98 PPL-07 each list asks for its cap plus one and says when it was cut', () => {
  it('your requests: at most CASE_MINE_MAX, with more past it, and the open count from the window', async () => {
    for (const count of [CASE_MINE_MAX, CASE_MINE_MAX + 1]) {
      const pool = org({ mine: Array.from({ length: count }, (_, n) => mineRow(n)) })
      const c = context(pool)
      const answer = MyRequestsResponse.parse((await readMyRequests(c.api, session(MEMBER), c.info)).body)
      expect(answer.requests).toHaveLength(CASE_MINE_MAX)
      expect(answer.more).toBe(count > CASE_MINE_MAX)
      expect(answer.open).toBe(3)
      expect(answer.today).toBe('2026-10-28')
      expect(callOf(pool, 'read_own_cases')?.values).toEqual([CASE_MINE_MAX + 1])
    }
    // None at all: nothing open.
    const none = context(org({ mine: [] }))
    expect(MyRequestsResponse.parse((await readMyRequests(none.api, session(MEMBER), none.info)).body)).toEqual({
      today: '2026-10-28',
      requests: [],
      more: false,
      open: 0,
    })
    // One row too many fails the strict schema, which is why the route slices.
    expect(
      MyRequestsResponse.safeParse({
        today: '2026-10-28',
        requests: Array.from({ length: CASE_MINE_MAX + 1 }, () => ({
          id: CASE,
          reference: REFERENCE,
          kind: 'complaint',
          cameBy: 'hearth',
          receivedOn: '2026-10-27',
          state: 'received',
          dueOn: '2026-11-10',
          repliedOn: null,
          repliedInTime: false,
          closedOn: null,
        })),
        more: true,
        open: 1,
      }).success,
    ).toBe(false)
  })

  it('the queue: the open list to CASE_QUEUE_OPEN_MAX with the total, the closed one to CASE_QUEUE_CLOSED_MAX with closedMore, and who sent each without an address', async () => {
    const pool = org({
      open: Array.from({ length: CASE_QUEUE_OPEN_MAX + 1 }, (_, n) => queueRow(n, false)),
      closed: [
        ...Array.from({ length: CASE_QUEUE_CLOSED_MAX }, (_, n) => queueRow(n, true)),
        queueRow(999, true, { requester_outside: true, requester_name: 'Sam Example', requester_department: null }),
      ],
    })
    const c = context(pool)
    const answer = RequestQueueResponse.parse((await readQueue(c.api, session(), c.info)).body)
    expect(answer.open).toHaveLength(CASE_QUEUE_OPEN_MAX)
    expect(answer.openTotal).toBe(250)
    expect(answer.closed).toHaveLength(CASE_QUEUE_CLOSED_MAX)
    expect(answer.closedMore).toBe(true)
    expect(answer.open[0]?.requester).toEqual({
      type: 'person',
      name: 'Marcus Tan',
      department: 'Operations',
      left: false,
    })
    const reads = pool.statements.filter(statement => statement.text.includes('from public.read_cases('))
    expect(reads.map(read => read.values)).toEqual([
      [false, CASE_QUEUE_OPEN_MAX + 1],
      [true, CASE_QUEUE_CLOSED_MAX + 1],
    ])
    // Short lists: nothing cut; an outside requester by name alone.
    const short = org({
      open: [queueRow(1, false, { requester_outside: true, requester_name: 'Sam Example', open_total: 1 })],
      closed: [],
    })
    const s = context(short)
    const small = RequestQueueResponse.parse((await readQueue(s.api, session(), s.info)).body)
    expect(small.open[0]?.requester).toEqual({ type: 'outside', name: 'Sam Example' })
    expect(small.closedMore).toBe(false)
  })

  it('the case sheet’s other requests to CASE_OTHERS_MAX with othersMore, and the people list to CASE_PEOPLE_MAX with more', async () => {
    const pool = org({ others: Array.from({ length: CASE_OTHERS_MAX + 1 }, (_, n) => otherRow(n)) })
    const c = context(pool)
    const answer = CaseResponse.parse((await readCase(c.api, CASE, session(), c.info)).body)
    expect(answer.others).toHaveLength(CASE_OTHERS_MAX)
    expect(answer.othersMore).toBe(true)
    expect(callOf(pool, 'read_case_others')?.values).toEqual([CASE, CASE_OTHERS_MAX + 1])
    const people = org({ people: Array.from({ length: CASE_PEOPLE_MAX + 1 }, (_, n) => personRow(n)) })
    const p = context(people)
    const list = CasePeopleResponse.parse((await readCasePeople(p.api, session(), p.info)).body)
    expect(list.people).toHaveLength(CASE_PEOPLE_MAX)
    expect(list.more).toBe(true)
    const read = people.statements.find(statement => statement.text.startsWith('select p.id, p.full_name as name'))
    // Current and former, never the DPO, current first; roster facts only.
    expect(read?.text).toContain('where p.org_id = $1 and p.id <> $2 order by p.deactivated_at is not null')
    expect(read?.text).not.toMatch(/phone|e164|role|acknowledg/)
    expect(read?.values).toEqual([ORG, DPO, CASE_PEOPLE_MAX + 1])
    expect(list.people[0]).toEqual({
      id: personRow(0).id,
      name: 'Fictional Person 0',
      department: null,
      manager: null,
      addedOn: '2026-01-05',
      leftOn: '2026-06-30',
    })
  })

  it('the sheet carries the request, its steps and its requester, a leaver’s channel and an outside requester’s, to the DPO alone', async () => {
    const pool = org()
    const c = context(pool)
    const answer = CaseResponse.parse((await readCase(c.api, CASE, session(), c.info)).body)
    expect(answer.today).toBe('2026-10-28')
    expect(answer.case).toMatchObject({
      id: CASE,
      reference: REFERENCE,
      kind: 'complaint',
      details: 'A fictional complaint about the rota.',
      requester: { type: 'person', person: MEMBER, name: 'Marcus Tan', manager: 'Ashton Teo', channel: null },
      loggedBy: 'Marcus Tan',
    })
    expect(answer.steps).toEqual([
      {
        number: 1,
        step: 'acknowledged',
        onDay: '2026-10-28',
        note: null,
        extendedTo: null,
        kind: null,
        recordedOn: '2026-10-28',
        recordedBy: 'Ashton Teo',
      },
    ])
    for (const read of ['read_case', 'read_case_steps', 'read_case_others']) {
      expect(callOf(pool, read)?.values[0], read).toBe(CASE)
    }
    const outside = org({
      kase: [
        caseRow({
          requester_person_id: null,
          requester_outside: true,
          requester_name: 'Sam Example',
          requester_department: null,
          requester_manager: null,
          requester_channel: 'post',
          requester_contact: '1 Fictional Road\nSingapore 000001',
          came_by: 'letter',
        }),
      ],
      others: [],
    })
    const o = context(outside)
    expect(CaseResponse.parse((await readCase(o.api, CASE, session(), o.info)).body).case.requester).toEqual({
      type: 'outside',
      name: 'Sam Example',
      channel: 'post',
      contact: '1 Fictional Road\nSingapore 000001',
    })
  })
})

describe('RQV-07 C0.9 PR 3b the codes only these routes answer', () => {
  it('are case_changed and case_invalid', () => {
    expect([...CASE_ERRORS]).toEqual(['case_changed', 'case_invalid'])
  })
})

describe('RQV-08 C0.9 PD-97 PD-98 which reads run read-only', () => {
  it('the requester’s list and the people list run read-only; the queue and the sheet read-write, since their functions re-read the DPO FOR SHARE', async () => {
    for (const [name, call, readOnly] of [
      ['mine', (c: ReturnType<typeof context>) => readMyRequests(c.api, session(MEMBER), c.info), true],
      ['people', (c: ReturnType<typeof context>) => readCasePeople(c.api, session(), c.info), true],
      ['queue', (c: ReturnType<typeof context>) => readQueue(c.api, session(), c.info), false],
      ['case', (c: ReturnType<typeof context>) => readCase(c.api, CASE, session(), c.info), false],
    ] as const) {
      const pool = org()
      const c = context(pool)
      await call(c)
      expect(pool.texts()[0], name).toBe(
        readOnly
          ? 'start transaction isolation level read committed read only'
          : 'start transaction isolation level read committed',
      )
      // The acting session is re-read with no lock for a read.
      expect(
        pool.texts().find(text => text.includes('from people p join devices d')),
        name,
      ).not.toMatch(/for share/)
      // Each counts as use of the session.
      expect(c.after, name).toHaveBeenCalled()
    }
  })

  it('caseAttention() asks case_attention() and answers its number', async () => {
    const pool = org()
    const count = await pool.db.transaction().execute(trx => caseAttention(trx as never))
    expect(count).toBe(2)
    expect(pool.texts()).toContain('select public.case_attention() as count')
  })
})

describe('RQV-09 C0.9 PDPA-04 PD-105 the withdrawal reply', () => {
  it('is built for a withdrawal by its kind now, from the latest generated version’s purposes and bases, the reference first', async () => {
    const pool = org({ kase: [caseRow({ kind: 'withdrawal', received_kind: 'question' })] })
    const c = context(pool)
    const answer = CaseResponse.parse((await readCase(c.api, CASE, session(), c.info)).body)
    expect(answer.reply?.startsWith('Your reference: K7QM-X3TD')).toBe(true)
    expect(answer.reply).toContain('Tembusu Example')
    expect(answer.reply).toContain("the PDPA's exception for managing the employment relationship")
    expect(answer.reply).toContain('Personal Data Protection Commission (PDPC)')
    expect(answer.reply?.endsWith('Data Protection Officer')).toBe(true)
  })

  it('is null for any other kind now (one reclassified away from a withdrawal included), and before v0 or with a stand-in as the latest', async () => {
    for (const [kase, latest] of [
      [caseRow({ kind: 'objection' }), undefined],
      [caseRow({ kind: 'question', received_kind: 'withdrawal' }), undefined],
      [caseRow({ kind: 'withdrawal' }), null],
      [caseRow({ kind: 'withdrawal' }), { generator: null }],
    ] as const) {
      const pool = org({ kase: [kase], latest })
      const c = context(pool)
      const answer = CaseResponse.parse((await readCase(c.api, CASE, session(), c.info)).body)
      expect(answer.reply, `${kase.kind} ${JSON.stringify(latest)}`).toBeNull()
    }
    // The purposes are read only for a withdrawal.
    const question = org({ kase: [caseRow()] })
    const q = context(question)
    await readCase(q.api, CASE, session(), q.info)
    expect(question.texts().some(text => text.includes('notice_version_purposes'))).toBe(false)
  })
})
