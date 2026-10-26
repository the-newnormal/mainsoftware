// Requests to the DPO on the Compose stack (PDPA-04, PDPA-13; C0.9 OD-06 to OD-09, OD-13 to OD-17,
// OD-22; TECH-SPEC T22 items 50 to 62): the real api over migration 0012, members sending requests
// from Settings › Privacy and following them, the DPO's queue, case sheet, intake and steps on a
// PIN-rule session, the indicator's count in the session answer, the reply targets and the
// withdrawal reply. Each test makes its own org (s.newOrg()) and people, so `-t` on one test works
// and no publish sends another test's people to /notice; the stack's realtime app runs production's
// admission (admissionForTests: 'notice'). Every fixture is fictional: .example addresses, numbers
// in the +65 8000 range, invented names and words. `npm run test:integration` runs it with the
// stack up (`docker compose up -d --wait`).
//
// afterAll checks every reply was no-store and none a 500, that no Node warning fired, the outbox's
// contract for the run (every committed write covered; this suite owns case.opened and
// case.changed), and, when every test passed, that each of CASE_ERRORS was answered.
import { randomUUID } from 'node:crypto'
import {
  ACTIVE_FROM_START,
  type CaseKind,
  CasePeopleResponse,
  CaseResponse,
  type CaseResponseJSON,
  CaseStepResponse,
  type ContactAdminJSON,
  ContactAdminResponse,
  formatCaseReference,
  type LogDraft,
  LogRequestResponse,
  logProblems,
  type MyRequestsJSON,
  MyRequestsResponse,
  NoticeAdminResponse,
  NoticePeopleResponse,
  NoticeResponse,
  type Outcome,
  parseCaseReference,
  RegistersResponse,
  type RequestQueueJSON,
  RequestQueueResponse,
  requestProblems,
  SendRequestResponse,
  type SendRequestResponseJSON,
  SessionResponse,
  type StepDraft,
  type StepInput,
  stepProblems,
  targetsProblems,
} from '@hearth/shared'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CASE_ERRORS } from '#src/compliance/cases.ts'
import { withOrg } from '#src/db/database.ts'
import { type Client, HARNESS_CONTACT, type Org, type Person, type Stack, startStack } from '#src/testing/stack.ts'
import { everyTestPassed, expectEveryWriteCovered } from '#src/testing/writes.ts'

let s: Stack

// --- Days --------------------------------------------------------------------------------------

// A day shifted by whole calendar days (YYYY-MM-DD).
const shift = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()
// The days-th weekday after start, as 0012's case_add_business_days() counts (OD-09): the day of
// receipt never counts, weekends are skipped and public holidays count.
function addBusinessDays(start: string, days: number): string {
  let day = start
  let left = days
  while (left > 0) {
    day = shift(day, 1)
    if (weekday(day) !== 0 && weekday(day) !== 6) left--
  }
  return day
}

// Today in the org's own zone, as the functions judge a day.
async function todayIn(org: Org): Promise<string> {
  const [row] = await s.query<{ today: string }>(
    'select ((now() at time zone time_zone)::date)::text as today from orgs where id = $1',
    [org.id],
  )
  if (row === undefined) throw new Error('no org')
  return row.today
}

// --- The api, strictly as the server types it --------------------------------------------------

async function mine(client: Client): Promise<MyRequestsJSON> {
  const reply = await client.get('/api/requests')
  expect([reply.status, reply.error]).toEqual([200, undefined])
  return MyRequestsResponse.parse(reply.body)
}

async function queue(client: Client): Promise<RequestQueueJSON> {
  const reply = await client.get('/api/admin/requests')
  expect([reply.status, reply.error]).toEqual([200, undefined])
  return RequestQueueResponse.parse(reply.body)
}

async function caseOf(client: Client, id: string): Promise<CaseResponseJSON> {
  const reply = await client.get(`/api/admin/requests/${id}`)
  expect([reply.status, reply.error]).toEqual([200, undefined])
  return CaseResponse.parse(reply.body)
}

async function countOf(client: Client): Promise<number | null> {
  const reply = await client.get('/api/session')
  expect(reply.status).toBe(200)
  return SessionResponse.parse(reply.body).requests
}

async function contactOf(client: Client): Promise<ContactAdminJSON> {
  const reply = await client.get('/api/admin/notice/contact')
  expect([reply.status, reply.error]).toEqual([200, undefined])
  return ContactAdminResponse.parse(reply.body)
}

async function send(
  client: Client,
  kind: string,
  details: string | null,
  key?: string,
): Promise<SendRequestResponseJSON> {
  const reply = await s.sendRequest(client, { kind, details, ...(key === undefined ? {} : { key }) })
  expect([reply.status, reply.error]).toEqual([200, undefined])
  return SendRequestResponse.parse(reply.body)
}

// A step from the revision the sheet shows now, as the sheet sends it.
async function step(
  client: Client,
  id: string,
  input: {
    step: string
    onDay: string
    note?: string | null
    extendedTo?: string | null
    kind?: string | null
    outcome?: string | null
  },
) {
  const seen = (await caseOf(client, id)).case.revision
  return client.post('/api/admin/requests/step', {
    case: id,
    seen,
    step: input.step,
    onDay: input.onDay,
    note: input.note ?? null,
    extendedTo: input.extendedTo ?? null,
    kind: input.kind ?? null,
    outcome: input.outcome ?? null,
  })
}

async function stepped(client: Client, id: string, input: Parameters<typeof step>[2]): Promise<number> {
  const reply = await step(client, id, input)
  expect([input.step, reply.status, reply.error]).toEqual([input.step, 200, undefined])
  return CaseStepResponse.parse(reply.body).revision
}

const logBody = (input: Record<string, unknown> = {}) => ({
  kind: 'question',
  cameBy: 'email',
  requester: { type: 'outside', name: 'Sam Example', channel: 'email', contact: 'sam@requests.example' },
  details: 'Asks which teams can see their working hours.',
  key: randomUUID(),
  ...input,
})

// What the org's case tables, audit log and outbox hold, so a refusal can show it wrote nothing.
async function written(org: Org) {
  const [row] = await s.query<{ cases: number; steps: number; audit: number; events: number }>(
    `select (select count(*)::int from cases where org_id = $1) as cases,
            (select count(*)::int from case_steps where org_id = $1) as steps,
            (select count(*)::int from audit_events where org_id = $1 and target_type = 'case') as audit,
            (select count(*)::int from outbox_events where org_id = $1 and type like 'case.%') as events`,
    [org.id],
  )
  return row
}

// An org of the test's own whose latest version is generated (c09.3, printing OD-08's targets:
// the harness's contact holds 10 and 30), its DPO signed in with a fresh PIN and having
// acknowledged it. Everyone made after acknowledges it as they are made.
async function requestOrg(): Promise<{ org: Org; dpo: Person; dpoClient: Client }> {
  const org = await s.newOrg()
  const dpo = await s.person({ org, roles: ['dpo'] })
  await s.publishNotice(org, dpo, { acknowledge: [dpo] })
  const dpoClient = await s.signIn(dpo)
  return { org, dpo, dpoClient }
}

const nameOf = (person: Person) => `Person ${person.id.slice(0, 8)}`

// The DPO records a basis and a retention for every purpose active from the start, request_handling
// among them (C0.9 OD-17), through the registers' route, so the draft has words.
async function recordActivePurposes(dpoClient: Client): Promise<void> {
  const read = RegistersResponse.parse((await dpoClient.get('/api/admin/registers')).body)
  for (const purpose of read.purposes.filter(row => ACTIVE_FROM_START.includes(row.purpose))) {
    const recorded = await dpoClient.post('/api/admin/registers/purposes/set', {
      purpose: purpose.purpose,
      seen: purpose.version,
      status: 'active',
      basis: 'employment',
      basisReference: null,
      optOutDays: null,
      retention: 'Kept while you work here, then 90 days',
      providers: purpose.providers,
    })
    expect([purpose.purpose, recorded.status, recorded.error]).toEqual([purpose.purpose, 200, undefined])
  }
}

// The count the queue implies (PD-99): new, or due within 2 business days (overdue included)
// without a reply on time.
const attentionIn = (read: RequestQueueJSON) =>
  read.open.filter(
    row =>
      row.state === 'new' || (row.dueOn !== null && row.dueOn <= addBusinessDays(read.today, 2) && !row.repliedInTime),
  ).length

describe('C0.9 PR 3b requests to the DPO (PDPA-04, PDPA-13, T22 items 50 to 62)', () => {
  beforeAll(async () => {
    s = await startStack({ admissionForTests: 'notice' })
  })

  // biome-ignore lint/correctness/noEmptyPattern: the hook takes no fixtures.
  afterAll(async ({}, suite) => {
    if (s === undefined) return
    try {
      for (const reply of s.replies) {
        expect(reply.cacheControl, `${reply.method} ${reply.url}`).toBe('no-store')
        expect(reply.error, `${reply.method} ${reply.url}`).not.toBe('internal')
      }
      expect(s.warnings.map(warning => `${warning.name}: ${warning.message}`)).toEqual([])
      const all = everyTestPassed(suite)
      await expectEveryWriteCovered(s.superuser, 'cases', { allPassed: all })
      if (all) {
        const answered = new Set(s.replies.map(reply => reply.error))
        expect(CASE_ERRORS.filter(code => !answered.has(code))).toEqual([])
      }
    } finally {
      await s.stop()
    }
  })

  it('RQI-01 C0.9 Done: a request reaches the DPO’s queue (PDPA-04, PDPA-13; OD-07, OD-15, OD-22): sent from the form, counted for the DPO alone, listed and read with a fresh PIN, followed by its requester and no one else', async () => {
    const { org, dpoClient } = await requestOrg()
    const member = await s.person({ org })
    const another = await s.person({ org })
    const owner = await s.person({ org, roles: ['owner'] })
    const mc = await s.signIn(member)
    const today = await todayIn(org)
    const words = 'The rota for the night shift was shared with the whole floor.'

    const sent = await send(mc, 'complaint', words)
    expect(parseCaseReference(sent.reference)).toBe(sent.reference)
    expect(sent).toMatchObject({ receivedOn: today, dueOn: addBusinessDays(today, 10), changed: true })

    // The count: the DPO's, and nobody else's.
    expect(await countOf(dpoClient)).toBe(1)
    expect(await countOf(mc)).toBeNull()
    const read = await queue(dpoClient)
    expect(read.open).toEqual([
      expect.objectContaining({
        id: sent.case,
        reference: sent.reference,
        kind: 'complaint',
        cameBy: 'hearth',
        state: 'new',
        dueOn: sent.dueOn,
        requester: { type: 'person', name: nameOf(member), department: null, left: false },
      }),
    ])
    expect(read.openTotal).toBe(1)
    const sheet = await caseOf(dpoClient, sent.case)
    expect(sheet.case).toMatchObject({ details: words, requester: { type: 'person', person: member.id } })

    // The requester follows it; someone else sees nothing.
    expect((await mine(mc)).requests).toEqual([
      {
        id: sent.case,
        reference: sent.reference,
        kind: 'complaint',
        cameBy: 'hearth',
        receivedOn: today,
        state: 'received',
        dueOn: sent.dueOn,
        repliedOn: null,
        repliedInTime: false,
        closedOn: null,
      },
    ])
    expect((await mine(await s.signIn(another))).requests).toEqual([])

    // An Owner who isn't the DPO: no count, and every DPO route refused (OD-14).
    const oc = await s.signIn(owner)
    expect(await countOf(oc)).toBeNull()
    for (const reply of [await oc.get('/api/admin/requests'), await oc.get(`/api/admin/requests/${sent.case}`)]) {
      expect([reply.status, reply.error]).toEqual([403, 'forbidden'])
    }

    // The event: the case as entity, no subjects, request_handling, ids only.
    expect(
      await s.query('select type, subject_ids, purpose, ids from outbox_events where org_id = $1 and entity_id = $2', [
        org.id,
        sent.case,
      ]),
    ).toEqual([{ type: 'case.opened', subject_ids: [], purpose: 'request_handling', ids: { via: 'form' } }])
    // The audit row: no details and no case_id (0004 keeps it for Rule 9's reads).
    expect(
      await s.query(
        "select action, actor_id, details, case_id from audit_events where org_id = $1 and target_type = 'case' and target_id = $2",
        [org.id, sent.case],
      ),
    ).toEqual([{ action: 'case.submitted', actor_id: member.id, details: {}, case_id: null }])
    // No gateway frame carried anything about it.
    expect(s.gatewayFrames.filter(frame => frame.includes(sent.case) || frame.includes(sent.reference))).toEqual([])
  })

  it('RQI-02 OD-13 PD-98: nobody sends or reads a request before acknowledging the current version; before v0 the DPO’s case routes wait too, while the targets are a setup use', async () => {
    // A member who hasn't acknowledged the stand-in.
    const org = await s.newOrg()
    const late = await s.person({ org, acknowledged: false })
    const lc = await s.signIn(late)
    for (const reply of [
      await s.sendRequest(lc, { kind: 'question', details: 'A fictional question.' }),
      await lc.get('/api/requests'),
    ]) {
      expect([reply.status, reply.error]).toEqual([403, 'notice_required'])
    }
    expect(await written(org)).toEqual({ cases: 0, steps: 0, audit: 0, events: 0 })

    // Before v0: the DPO's case routes answer notice_required; the targets, after a contact, 200.
    const bare = await s.newOrg({ notice: 'none' })
    const dpo = await s.person({ org: bare, roles: ['dpo'] })
    const dpoClient = await s.signIn(dpo)
    const id = randomUUID()
    for (const reply of [
      await dpoClient.get('/api/admin/requests'),
      await dpoClient.get('/api/admin/requests/people'),
      await dpoClient.get(`/api/admin/requests/${id}`),
      await dpoClient.post('/api/admin/requests/log', logBody({ receivedOn: await todayIn(bare) })),
      await dpoClient.post('/api/admin/requests/step', {
        case: id,
        seen: 0,
        step: 'note',
        onDay: await todayIn(bare),
        note: 'A note',
        extendedTo: null,
        kind: null,
        outcome: null,
      }),
    ]) {
      expect([reply.status, reply.error]).toEqual([403, 'notice_required'])
    }
    expect(await countOf(dpoClient)).toBeNull()
    const version = await s.recordContact(bare, dpo)
    const set = await dpoClient.post('/api/admin/notice/targets/set', {
      seen: version,
      businessDays: 7,
      calendarDays: 30,
    })
    expect([set.status, set.error]).toEqual([200, undefined])

    // After v0, before the DPO acknowledges it: still notice_required, and no count.
    await s.publishNotice(bare, dpo)
    for (const reply of [await dpoClient.get('/api/admin/requests'), await dpoClient.get('/api/requests')]) {
      expect([reply.status, reply.error]).toEqual([403, 'notice_required'])
    }
    expect(await countOf(dpoClient)).toBeNull()
  })

  it('RQI-03 OD-14: every role but the DPO is refused every DPO case route, the people list included; the DPO with a stale PIN is asked for it, then let through', async () => {
    const { org, dpo, dpoClient } = await requestOrg()
    const member = await s.person({ org })
    const sent = await send(await s.signIn(member), 'question', 'A fictional question.')
    const today = await todayIn(org)
    for (const roles of [
      ['owner'],
      ['admin'],
      ['ai_admin'],
      ['leadership'],
      ['compliance_officer'],
      ['team_admin'],
      [],
    ] as const) {
      const who = await s.person({ org, roles: [...roles] })
      const client = await s.signIn(who)
      for (const reply of [
        await client.get('/api/admin/requests'),
        await client.get('/api/admin/requests/people'),
        await client.get(`/api/admin/requests/${sent.case}`),
        await client.post('/api/admin/requests/log', logBody({ receivedOn: today })),
        await client.post('/api/admin/requests/step', {
          case: sent.case,
          seen: 0,
          step: 'note',
          onDay: today,
          note: 'A note',
          extendedTo: null,
          kind: null,
          outcome: null,
        }),
      ]) {
        expect([roles.join(','), reply.status, reply.error]).toEqual([roles.join(','), 403, 'forbidden'])
      }
    }
    expect(await written(org)).toMatchObject({ cases: 1, steps: 0 })

    await s.age((await s.sessionOf(dpoClient)).id, '6 minutes')
    const stale = await dpoClient.get('/api/admin/requests')
    expect([stale.status, stale.error, stale.json<{ method?: string }>().method]).toEqual([
      403,
      'reauth_required',
      'pin',
    ])
    await s.reauth(dpoClient, dpo)
    expect((await queue(dpoClient)).open.map(row => row.id)).toEqual([sent.case])
  })

  it('RQI-04 OD-16 PD-89 PPL-01: the DPO logs requests that came another way: someone without an account, a member, a leaver (with the one channel they wrote from), never themselves or another org’s person; an ID number is refused and a resend makes no second case', async () => {
    const { org, dpo, dpoClient } = await requestOrg()
    const member = await s.person({ org })
    const leaver = await s.person({ org, left: true })
    const today = await todayIn(org)

    // Someone without an account, a copy received three days ago: 30 days from receipt.
    const outside = await dpoClient.post(
      '/api/admin/requests/log',
      logBody({ kind: 'access', receivedOn: shift(today, -3), details: 'Asks for a copy of what is held about them.' }),
    )
    expect([outside.status, outside.error]).toEqual([200, undefined])
    const copy = LogRequestResponse.parse(outside.body)
    expect(copy).toMatchObject({ dueOn: shift(today, 27), changed: true })
    expect((await caseOf(dpoClient, copy.case)).case).toMatchObject({
      cameBy: 'email',
      identityChecked: false,
      requester: { type: 'outside', name: 'Sam Example', channel: 'email', contact: 'sam@requests.example' },
    })

    // A member's question by email: in their tracking as received by email.
    const asked = await dpoClient.post(
      '/api/admin/requests/log',
      logBody({ receivedOn: today, requester: { type: 'person', person: member.id } }),
    )
    expect([asked.status, asked.error]).toEqual([200, undefined])
    const question = LogRequestResponse.parse(asked.body)
    expect((await mine(await s.signIn(member))).requests).toEqual([
      expect.objectContaining({ id: question.case, cameBy: 'email', state: 'in_progress' }),
    ])

    // A leaver: listed for intake with their day left (never by the notice's people list), refused
    // without a channel, logged with the address they wrote from, which only the DPO's sheet shows.
    const people = CasePeopleResponse.parse((await dpoClient.get('/api/admin/requests/people')).body)
    expect(people.people.find(person => person.id === leaver.id)).toMatchObject({ leftOn: today })
    expect(people.people.find(person => person.id === dpo.id)).toBeUndefined()
    expect(people.people.find(person => person.id === member.id)).toMatchObject({ leftOn: null })
    const noticePeople = NoticePeopleResponse.parse((await dpoClient.get('/api/admin/notice/people')).body)
    expect(noticePeople.people.find(person => person.id === leaver.id)).toBeUndefined()
    const before = await written(org)
    const bare = await dpoClient.post(
      '/api/admin/requests/log',
      logBody({ receivedOn: today, requester: { type: 'person', person: leaver.id } }),
    )
    expect([bare.status, bare.error]).toEqual([400, 'case_invalid'])
    expect(await written(org)).toEqual(before)
    const withEmail = await dpoClient.post(
      '/api/admin/requests/log',
      logBody({
        kind: 'access',
        receivedOn: today,
        requester: { type: 'person', person: leaver.id, channel: 'email', contact: 'former@requests.example' },
      }),
    )
    expect([withEmail.status, withEmail.error]).toEqual([200, undefined])
    const left = LogRequestResponse.parse(withEmail.body)
    expect((await caseOf(dpoClient, left.case)).case.requester).toMatchObject({
      type: 'person',
      person: leaver.id,
      leftOn: today,
      channel: 'email',
      contact: 'former@requests.example',
    })
    const queueText = JSON.stringify(await queue(dpoClient))
    expect(queueText).not.toContain('former@requests.example')
    expect(queueText).not.toContain('sam@requests.example')

    // Never themselves, never another org's person (can()'s 403); an ID number in what the DPO
    // types is refused, writing nothing.
    const elsewhere = await s.person({ org: 'second' })
    for (const person of [dpo.id, elsewhere.id]) {
      const refused = await dpoClient.post(
        '/api/admin/requests/log',
        logBody({ receivedOn: today, requester: { type: 'person', person } }),
      )
      expect([refused.status, refused.error]).toEqual([403, 'forbidden'])
    }
    const counted = await written(org)
    const nric = await dpoClient.post(
      '/api/admin/requests/log',
      logBody({
        receivedOn: today,
        requester: { type: 'outside', name: 'Sam S1234567D', channel: 'email', contact: 'sam@requests.example' },
      }),
    )
    expect([nric.status, nric.error]).toEqual([400, 'case_invalid'])
    expect(await written(org)).toEqual(counted)

    // The same dialog sent twice: the first case, once.
    const body = logBody({ receivedOn: today })
    const first = LogRequestResponse.parse((await dpoClient.post('/api/admin/requests/log', body)).body)
    const again = LogRequestResponse.parse((await dpoClient.post('/api/admin/requests/log', body)).body)
    expect(again).toEqual({ ...first, changed: false })
    expect(
      await s.query('select count(*)::int as n from outbox_events where org_id = $1 and entity_id = $2', [
        org.id,
        first.case,
      ]),
    ).toEqual([{ n: 1 }])
  })

  it('RQI-05 PD-90 PD-91 PD-97 PD-112 PPL-04 PPL-08: the DPO works requests over the routes, and the requester sees only Hearth’s labels and days', async () => {
    const { org, dpo, dpoClient } = await requestOrg()
    const member = await s.person({ org })
    const mc = await s.signIn(member)
    const today = await todayIn(org)
    const log = (kind: string, receivedOn: string) =>
      s.logRequest(org, dpo, { kind, receivedOn, person: member.id, details: `A fictional ${kind} request.` })

    // Acknowledged, then replied on time.
    const a = await send(mc, 'complaint', 'A fictional complaint.')
    expect(await stepped(dpoClient, a.case, { step: 'acknowledged', onDay: today })).toBe(1)
    expect((await mine(mc)).requests.find(row => row.id === a.case)?.state).toBe('in_progress')
    expect(await stepped(dpoClient, a.case, { step: 'replied', onDay: today })).toBe(2)
    expect((await mine(mc)).requests.find(row => row.id === a.case)).toMatchObject({
      repliedOn: today,
      repliedInTime: true,
    })

    // A reply on time ends the clock: once the due day has passed with the request still open,
    // neither the requester's row, the queue nor the count calls it late (PD-112).
    const overdue = await log('question', shift(today, -30))
    expect(overdue.dueOn < today).toBe(true)
    const counted = await countOf(dpoClient)
    await stepped(dpoClient, overdue.id, { step: 'replied', onDay: shift(today, -29) })
    expect(await countOf(dpoClient)).toBe((counted ?? 0) - 1)
    expect((await mine(mc)).requests.find(row => row.id === overdue.id)).toMatchObject({
      dueOn: overdue.dueOn,
      repliedInTime: true,
    })
    expect((await queue(dpoClient)).open.find(row => row.id === overdue.id)?.repliedInTime).toBe(true)

    // More time on a copy, told on or before the due day: More time, and the day moves; told after
    // it, refused (PPL-04).
    const copy = await log('access', shift(today, -5))
    expect(copy.dueOn).toBe(shift(today, 25))
    await stepped(dpoClient, copy.id, { step: 'extended', onDay: today, extendedTo: shift(today, 35) })
    expect((await mine(mc)).requests.find(row => row.id === copy.id)).toMatchObject({
      state: 'more_time',
      dueOn: shift(today, 35),
    })
    const lateCopy = await log('access', shift(today, -40))
    const told = await step(dpoClient, lateCopy.id, { step: 'extended', onDay: today, extendedTo: shift(today, 20) })
    expect([told.status, told.error]).toEqual([400, 'case_invalid'])

    // A copy reclassified as a question three weeks on is due no earlier than the next business
    // day, so it doesn't read as late (PPL-08).
    const weeks = await log('access', shift(today, -21))
    await stepped(dpoClient, weeks.id, { step: 'reclassified', onDay: today, kind: 'question' })
    const reclassified = (await mine(mc)).requests.find(row => row.id === weeks.id)
    expect(reclassified).toMatchObject({ kind: 'question', dueOn: addBusinessDays(today, 1) })
    // A question reclassified as a copy keeps the question's earlier day.
    const q = await log('question', today)
    await stepped(dpoClient, q.id, { step: 'reclassified', onDay: today, kind: 'access' })
    expect((await caseOf(dpoClient, q.id)).case).toMatchObject({ kind: 'access', dueOn: q.dueOn })

    // A copy closes as answered only once identity is checked (PD-91).
    const early = await step(dpoClient, copy.id, { step: 'closed', onDay: today, outcome: 'answered' })
    expect([early.status, early.error]).toEqual([400, 'case_invalid'])
    await stepped(dpoClient, copy.id, {
      step: 'identity_checked',
      onDay: today,
      note: 'Called back on the number held',
    })
    await stepped(dpoClient, copy.id, { step: 'closed', onDay: today, outcome: 'answered' })

    // A complaint can't be refused; a copy can, with why, and then a PDPC review starts and ends.
    const complaint = await log('complaint', today)
    const refusedComplaint = await step(dpoClient, complaint.id, {
      step: 'closed',
      onDay: today,
      outcome: 'refused',
      note: 'Not upheld.',
    })
    expect([refusedComplaint.status, refusedComplaint.error]).toEqual([400, 'case_invalid'])
    const refusable = await log('access', today)
    await stepped(dpoClient, refusable.id, {
      step: 'closed',
      onDay: today,
      outcome: 'refused',
      note: 'The data asked for is about someone else.',
    })
    await stepped(dpoClient, refusable.id, { step: 'review_started', onDay: today })
    await stepped(dpoClient, refusable.id, { step: 'review_ended', onDay: today })
    expect((await caseOf(dpoClient, refusable.id)).case).toMatchObject({
      state: 'closed',
      closedKind: 'access',
      outcome: 'refused',
      reviewOpen: false,
    })

    // A stale revision is 409; another org's request is 404 alike to none.
    const stale = await dpoClient.post('/api/admin/requests/step', {
      case: a.case,
      seen: 0,
      step: 'note',
      onDay: today,
      note: 'A late note',
      extendedTo: null,
      kind: null,
      outcome: null,
    })
    expect([stale.status, stale.error]).toEqual([409, 'case_changed'])
    const otherOrg = await s.newOrg()
    const otherDpo = await s.person({ org: otherOrg, roles: ['dpo'] })
    const theirs = await s.logRequest(otherOrg, otherDpo, {
      kind: 'question',
      receivedOn: today,
      name: 'Sam Example',
      channel: 'email',
      contact: 'sam@requests.example',
      details: 'A fictional question.',
    })
    for (const id of [theirs.id, randomUUID()]) {
      const missing = await dpoClient.post('/api/admin/requests/step', {
        case: id,
        seen: 0,
        step: 'note',
        onDay: today,
        note: 'A note',
        extendedTo: null,
        kind: null,
        outcome: null,
      })
      expect([missing.status, missing.error]).toEqual([404, 'not_found'])
      expect((await dpoClient.get(`/api/admin/requests/${id}`)).error).toBe('not_found')
    }

    // One logged against the wrong member leaves their tracking once closed as logged in error.
    const wrong = await log('question', today)
    expect((await mine(mc)).requests.some(row => row.id === wrong.id)).toBe(true)
    await stepped(dpoClient, wrong.id, { step: 'closed', onDay: today, outcome: 'logged_in_error' })
    expect((await mine(mc)).requests.some(row => row.id === wrong.id)).toBe(false)

    // The requester's answers never carry words, notes, steps or outcomes.
    const tracking = JSON.stringify(await mine(mc))
    for (const text of ['A fictional', 'Called back', 'about someone else', 'refused', 'answered']) {
      expect(tracking).not.toContain(text)
    }
    // Each write appended case.changed with its revision.
    expect(
      (
        await s.query<{ ids: { revision: number } }>(
          "select ids from outbox_events where org_id = $1 and entity_id = $2 and type = 'case.changed' order by id",
          [org.id, a.case],
        )
      ).map(row => row.ids.revision),
    ).toEqual([1, 2])
  })

  it('RQI-06 PD-96 OD-25: one client key makes one case, one event and one audit row; an 11th open request is refused until the DPO closes one', async () => {
    const { org, dpoClient } = await requestOrg()
    const member = await s.person({ org })
    const mc = await s.signIn(member)
    const key = randomUUID()
    const first = await send(mc, 'question', 'A fictional question.', key)
    const again = await send(mc, 'question', 'A fictional question.', key)
    expect(again).toEqual({ ...first, changed: false })
    expect(await written(org)).toEqual({ cases: 1, steps: 0, audit: 1, events: 1 })

    for (let n = 2; n <= 10; n++) await send(mc, 'question', `Fictional question ${n}.`)
    expect((await mine(mc)).open).toBe(10)
    const before = await written(org)
    const eleventh = await s.sendRequest(mc, { kind: 'question', details: 'One too many.' })
    expect([eleventh.status, eleventh.error]).toEqual([400, 'case_invalid'])
    expect(await written(org)).toEqual(before)
    await stepped(dpoClient, first.case, { step: 'closed', onDay: await todayIn(org), outcome: 'answered' })
    await send(mc, 'question', 'Now it fits.')
  })

  it('RQI-07 R2 PD-100 PD-101 PD-102: a request’s words, an outside requester’s name and address and the DPO’s notes reach no log line, audit row, event or session answer; the reference no log line; only a DPO reader reads a request’s audit rows', async () => {
    const { org, dpo, dpoClient } = await requestOrg()
    const member = await s.person({ org })
    const mc = await s.signIn(member)
    const today = await todayIn(org)
    const marker = `Zephyrmark${randomUUID().slice(0, 8)}`
    const sent = await send(mc, 'complaint', `The words ${marker} are mine.`)
    const logged = await dpoClient.post(
      '/api/admin/requests/log',
      logBody({
        kind: 'access',
        cameBy: 'letter',
        receivedOn: today,
        requester: {
          type: 'outside',
          name: `Sam ${marker}`,
          channel: 'post',
          contact: `1 ${marker} Road\nSingapore 000001`,
        },
        details: `Wants a copy, ${marker}.`,
      }),
    )
    expect([logged.status, logged.error]).toEqual([200, undefined])
    const copy = LogRequestResponse.parse(logged.body)
    await stepped(dpoClient, copy.case, { step: 'identity_checked', onDay: today, note: `Checked ${marker} in person` })
    await stepped(dpoClient, copy.case, { step: 'note', onDay: today, note: `Working note ${marker}` })
    await stepped(dpoClient, copy.case, { step: 'closed', onDay: today, outcome: 'answered', note: `Closed ${marker}` })
    await s.settled()

    const sessions = [await dpoClient.get('/api/session'), await mc.get('/api/session')]
    for (const reply of sessions) expect(reply.text).not.toContain(marker)
    const lines = s.logs.map(line => JSON.stringify(line))
    expect(lines.filter(line => line.includes(marker))).toEqual([])
    for (const reference of [sent.reference, copy.reference]) {
      expect(lines.filter(line => line.includes(reference))).toEqual([])
    }
    const audit = await s.query<{ details: unknown }>('select details from audit_events where org_id = $1', [org.id])
    expect(audit.filter(row => JSON.stringify(row.details).includes(marker))).toEqual([])
    const events = await s.query('select * from outbox_events where org_id = $1', [org.id])
    expect(events.filter(row => JSON.stringify(row).includes(marker))).toEqual([])

    // OD-23: an audit reader who isn't the DPO never reads a request's rows; the DPO does.
    const officer = await s.person({ org, roles: ['compliance_officer'] })
    await s.addAuditReader(org, 'compliance_officer')
    await s.addAuditReader(org, 'dpo')
    const targets = (reader: Person) =>
      withOrg(s.db, { orgId: org.id, userId: reader.id }, async trx => {
        const { rows } = await sql<{ target_type: string | null }>`
          select target_type from public.read_audit_events(now() - interval '1 day', now() + interval '1 minute')`.execute(
          trx,
        )
        return rows.map(row => row.target_type)
      })
    const officerSees = await targets(officer)
    expect(officerSees.length).toBeGreaterThan(0)
    expect(officerSees).not.toContain('case')
    expect(await targets(dpo)).toContain('case')
  })

  it('RQI-08 OD-09 PD-92 PD-93: due days over the api: a Friday’s request is due the Friday two weeks on; a shorter target brings an open request forward, a longer one never pushes it back, and every answer agrees', async () => {
    const { org, dpo, dpoClient } = await requestOrg()
    const member = await s.person({ org })
    const mc = await s.signIn(member)
    const today = await todayIn(org)
    let friday = shift(today, -1)
    while (weekday(friday) !== 5) friday = shift(friday, -1)
    const fridays = await s.logRequest(org, dpo, {
      kind: 'question',
      receivedOn: friday,
      person: member.id,
      details: 'A fictional question.',
    })
    expect(fridays.dueOn).toBe(shift(friday, 14))

    // 10 printed and in force; 7 then recorded: the open request's day moves to 7's.
    const q1 = await send(mc, 'question', 'A fictional question.')
    expect(q1.dueOn).toBe(addBusinessDays(today, 10))
    const setTargets = async (businessDays: number) => {
      const seen = (await contactOf(dpoClient)).contact?.version
      const reply = await dpoClient.post('/api/admin/notice/targets/set', { seen, businessDays, calendarDays: 30 })
      expect([reply.status, reply.error]).toEqual([200, undefined])
    }
    await setTargets(7)
    const seven = addBusinessDays(today, 7)
    expect((await caseOf(dpoClient, q1.case)).case.dueOn).toBe(seven)
    expect((await queue(dpoClient)).open.find(row => row.id === q1.case)?.dueOn).toBe(seven)
    expect((await mine(mc)).requests.find(row => row.id === q1.case)?.dueOn).toBe(seven)

    // 7 printed, 10 then recorded: a request received under 7 stays at 7's.
    await s.publishNotice(org, dpo, { acknowledge: [dpo, member] })
    const q2 = await send(mc, 'question', 'Another fictional question.')
    expect(q2.dueOn).toBe(seven)
    await setTargets(10)
    expect((await caseOf(dpoClient, q2.case)).case.dueOn).toBe(seven)
    expect((await queue(dpoClient)).open.find(row => row.id === q2.case)?.dueOn).toBe(seven)
    expect((await mine(mc)).requests.find(row => row.id === q2.case)?.dueOn).toBe(seven)
    // The count agrees with the queue's.
    expect(await countOf(dpoClient)).toBe(attentionIn(await queue(dpoClient)))
  })

  it('RQI-09 PD-89 PD-94 PD-96: the shared rules and the functions refuse the same samples, each on both sides', async () => {
    const { org, dpo } = await requestOrg()
    const member = await s.person({ org })
    const today = await todayIn(org)
    // A call as the given person in a transaction that rolls back: 'saved', 'refused' (HF006, or a
    // case table's check), or the SQLSTATE.
    const attempt = async (actor: Person, text: string, values: unknown[]): Promise<string> => {
      await s.query('begin')
      try {
        await s.query("select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)", [
          org.id,
          actor.id,
        ])
        await s.query(text, values)
        return 'saved'
      } catch (error) {
        const { code, constraint } = error as { code?: string; constraint?: string }
        if (code === 'HF006' || (code === '23514' && /^(cases|case_steps|dpo_settings)_/.test(constraint ?? ''))) {
          return 'refused'
        }
        return `${code}`
      } finally {
        await s.query('rollback')
      }
    }
    const verdict = (problems: readonly unknown[]) => (problems.length > 0 ? 'refused' : 'saved')

    // What a requester writes.
    for (const sample of [
      { kind: 'question', details: null },
      { kind: 'access', details: null },
      { kind: 'question', details: '' },
      { kind: 'question', details: ' \t ' },
      { kind: 'question', details: 'x'.repeat(4000) },
      { kind: 'question', details: 'x'.repeat(4001) },
      { kind: 'question', details: '\u{1F600}'.repeat(4000) },
      { kind: 'question', details: '\u{1F600}'.repeat(4001) },
      { kind: 'question', details: 'Two\nlines' },
      { kind: 'question', details: 'Two\r\nlines' },
      { kind: 'question', details: 'A\ttab' },
      { kind: 'question', details: 'A lone\rreturn' },
      { kind: 'question', details: 'Reads \u202Ebackwards' },
      { kind: 'question', details: 'An isolate \u2066here' },
      { kind: 'question', details: 'My number is S1234567D' },
    ] as const) {
      const got = await attempt(member, 'select id from public.submit_case($1, $2, $3::uuid, $4, null, null)', [
        sample.kind,
        sample.details,
        randomUUID(),
        randomUUID(),
      ])
      expect(got, JSON.stringify(sample)).toBe(verdict(requestProblems(sample)))
    }

    // What the DPO logs.
    const base: LogDraft = {
      cameBy: 'email',
      receivedOn: today,
      person: null,
      name: 'Sam Example',
      channel: 'email',
      contact: 'sam@requests.example',
      details: 'Asks a fictional question.',
    }
    for (const change of [
      {},
      { name: '' },
      { name: 'x'.repeat(200) },
      { name: 'x'.repeat(201) },
      { name: 'Sam\nExample' },
      { name: 'Sam\rExample' },
      { name: 'Sam \u202EExample' },
      { name: 'Sam S1234567D' },
      { name: 'Sam s1234567d' },
      { channel: null },
      { channel: 'phone', contact: '+65 8000 0101' },
      { channel: 'phone', contact: '6580000101' },
      { channel: 'email', contact: 'not an address' },
      { channel: 'post', contact: '1 Fictional Road\nSingapore 000001' },
      { channel: 'post', contact: '1 Fictional Road\n\nSingapore' },
      { channel: 'post', contact: '1 Fictional \u202ERoad' },
      { channel: 'post', contact: '1 S1234567D Road' },
      { person: member.id, name: null, channel: null, contact: null },
      { person: member.id, name: null, channel: 'email', contact: 'member@requests.example' },
      { person: member.id, name: null, channel: null, contact: 'member@requests.example' },
      { cameBy: 'hearth' },
      { cameBy: 'fax' },
      { receivedOn: shift(today, 1) },
      { receivedOn: shift(today, -365) },
      { receivedOn: shift(today, -366) },
      { details: '' },
      { details: 'x'.repeat(4001) },
      { details: 'Their NRIC is S1234567D.' },
      { details: 'A \u2067tricky one' },
    ] as const) {
      const draft = { ...base, ...change }
      const got = await attempt(
        dpo,
        'select id from public.log_case($1, $2, $3::date, $4::uuid, $5, $6, $7, $8, $9::uuid, $10, null, null)',
        [
          'question',
          draft.cameBy,
          draft.receivedOn,
          draft.person,
          draft.name,
          draft.channel,
          draft.contact,
          draft.details,
          randomUUID(),
          randomUUID(),
        ],
      )
      expect(got, JSON.stringify(change)).toBe(verdict(logProblems(draft, today)))
    }

    // A step on an open question received today, by the full shared rules against the case read.
    const open = await s.logRequest(org, dpo, {
      kind: 'question',
      receivedOn: today,
      person: member.id,
      details: 'A fictional question.',
    })
    const dpoClient = await s.signIn(dpo)
    const kase = (await caseOf(dpoClient, open.id)).case
    const held = {
      kind: kase.kind,
      cameBy: kase.cameBy,
      receivedOn: kase.receivedOn,
      dueOn: kase.dueOn,
      revision: kase.revision,
      closedOn: kase.closedOn,
      closedKind: kase.closedKind,
      outcome: kase.outcome,
      identityChecked: kase.identityChecked,
      reviewOpen: kase.reviewOpen,
    }
    type StepSample = {
      step: StepInput
      onDay?: string
      note?: string | null
      extendedTo?: string
      kind?: CaseKind
      outcome?: Outcome
    }
    for (const change of [
      { step: 'note', note: 'A note' },
      { step: 'note', note: null },
      { step: 'note', note: 'x'.repeat(2000) },
      { step: 'note', note: 'x'.repeat(2001) },
      { step: 'note', note: 'Saw S1234567D' },
      { step: 'note', note: 'Reads \u202Ebackwards' },
      { step: 'note', note: 'A\u0007bell' },
      { step: 'note', note: 'A note', onDay: shift(today, 1) },
      { step: 'note', note: 'A note', onDay: shift(today, -1) },
      { step: 'identity_checked', note: 'Called back' },
      { step: 'identity_checked', note: 'Called\nback' },
      { step: 'identity_checked', note: 'x'.repeat(500) },
      { step: 'identity_checked', note: 'x'.repeat(501) },
      { step: 'identity_checked', note: null },
      { step: 'reclassified', kind: 'question' },
      { step: 'reclassified', kind: 'complaint' },
      { step: 'extended', extendedTo: shift(today, 20) },
      { step: 'closed', outcome: 'refused', note: 'Why' },
      { step: 'closed', outcome: 'answered' },
      { step: 'closed', outcome: 'logged_in_error' },
      { step: 'review_started' },
      { step: 'review_ended' },
    ] satisfies StepSample[]) {
      const draft: StepDraft = {
        step: change.step,
        onDay: change.onDay ?? today,
        note: change.note ?? null,
        extendedTo: change.extendedTo ?? null,
        kind: change.kind ?? null,
        outcome: change.outcome ?? null,
      }
      const got = await attempt(
        dpo,
        'select revision from public.add_case_step($1::uuid, $2::integer, $3, $4::date, $5, $6::date, $7, $8, $9, null, null)',
        [
          open.id,
          held.revision,
          draft.step,
          draft.onDay,
          draft.note,
          draft.extendedTo,
          draft.kind,
          draft.outcome,
          randomUUID(),
        ],
      )
      expect(got, JSON.stringify(change)).toBe(verdict(stepProblems(draft, held, today)))
    }

    // The reply targets.
    const [current] = await s.query<{ version: number }>(
      'select max(version) as version from dpo_settings where org_id = $1',
      [org.id],
    )
    for (const [businessDays, calendarDays] of [
      [4, 30],
      [5, 30],
      [10, 30],
      [11, 30],
      [7, 13],
      [7, 14],
      [7, 31],
      [0, 0],
    ] as const) {
      const got = await attempt(
        dpo,
        'select version from public.set_reply_targets($1::integer, $2, $3, $4, null, null)',
        [current?.version, businessDays, calendarDays, randomUUID()],
      )
      expect(got, `${businessDays} ${calendarDays}`).toBe(verdict(targetsProblems({ businessDays, calendarDays })))
    }
  })

  it('RQI-10 OD-22 PD-99 PD-112: the session’s count: a new form request counts; a logged one only once nearly due; an acknowledged one stops; a reply on time stops it for good, a late one counts until closed; null while the DPO owes an acknowledgement', async () => {
    const { org, dpo, dpoClient } = await requestOrg()
    const member = await s.person({ org })
    const mc = await s.signIn(member)
    const today = await todayIn(org)
    const log = (receivedOn: string) =>
      s.logRequest(org, dpo, { kind: 'question', receivedOn, person: member.id, details: 'A fictional question.' })

    expect(await countOf(dpoClient)).toBe(0)
    const fresh = await send(mc, 'question', 'A fictional question.')
    expect(await countOf(dpoClient)).toBe(1)
    await log(today)
    expect(await countOf(dpoClient)).toBe(1)
    const overdue = await log(shift(today, -30))
    expect(await countOf(dpoClient)).toBe(2)
    await stepped(dpoClient, fresh.case, { step: 'acknowledged', onDay: today })
    expect(await countOf(dpoClient)).toBe(1)
    // A reply after the due day: still counted, until closed.
    await stepped(dpoClient, overdue.id, { step: 'replied', onDay: today })
    expect(await countOf(dpoClient)).toBe(1)
    await stepped(dpoClient, overdue.id, { step: 'closed', onDay: today, outcome: 'answered' })
    expect(await countOf(dpoClient)).toBe(0)
    // Nearly due: received so that its day is the first on or after today.
    let received = today
    for (let back = 0; back < 30; back++) {
      if (addBusinessDays(shift(today, -back), 10) >= today) received = shift(today, -back)
    }
    const nearly = await log(received)
    expect(nearly.dueOn >= today && nearly.dueOn <= addBusinessDays(today, 2)).toBe(true)
    expect(await countOf(dpoClient)).toBe(1)
    expect(await countOf(dpoClient)).toBe(attentionIn(await queue(dpoClient)))
    await stepped(dpoClient, nearly.id, { step: 'replied', onDay: today })
    expect(await countOf(dpoClient)).toBe(0)
    expect(await countOf(dpoClient)).toBe(attentionIn(await queue(dpoClient)))

    // A new version the DPO hasn't acknowledged: no count.
    await send(mc, 'complaint', 'A fictional complaint.')
    await s.recordContact(org, dpo, { ...HARNESS_CONTACT, email: 'privacy@harness.example' })
    await s.publishNotice(org, dpo)
    expect(await countOf(dpoClient)).toBeNull()
  })

  it('RQI-11 PDPA-04 PD-105: a withdrawal’s sheet carries the reply the DPO may copy, from the latest published version; an objection’s and a question’s carry none, and so does a withdrawal under a stand-in', async () => {
    const { org, dpoClient } = await requestOrg()
    const member = await s.person({ org })
    const mc = await s.signIn(member)
    const withdrawal = await send(mc, 'withdrawal', 'I withdraw my consent.')
    const sheet = await caseOf(dpoClient, withdrawal.case)
    const reference = parseCaseReference(withdrawal.reference)
    if (reference === null) throw new Error('not a reference')
    expect(sheet.reply?.startsWith(`Your reference: ${formatCaseReference(reference)}`)).toBe(true)
    expect(sheet.reply).toContain("the PDPA's exception for managing the employment relationship")
    expect(sheet.reply).toContain('Handling questions, complaints and requests about personal data')
    expect(sheet.reply).toContain('Personal Data Protection Commission (PDPC)')
    for (const kind of ['objection', 'question']) {
      const other = await send(mc, kind, `A fictional ${kind}.`)
      expect((await caseOf(dpoClient, other.case)).reply, kind).toBeNull()
    }

    // An org whose latest version is a stand-in: no reply.
    const standIn = await s.newOrg()
    const standInDpo = await s.person({ org: standIn, roles: ['dpo'] })
    const logged = await s.logRequest(standIn, standInDpo, {
      kind: 'withdrawal',
      receivedOn: await todayIn(standIn),
      name: 'Sam Example',
      channel: 'email',
      contact: 'sam@requests.example',
      details: 'Withdraws their consent.',
    })
    expect((await caseOf(await s.signIn(standInDpo), logged.id)).reply).toBeNull()
  })

  it('RQI-12 OD-08 PD-94 PD-95: the targets: refused before a contact, set after it before v0, stated by the draft and the published notice, added after a c09.2 version, and a targets-only change keeps the contact stated', async () => {
    const org = await s.newOrg({ notice: 'none' })
    const dpo = await s.person({ org, roles: ['dpo'] })
    const member = await s.person({ org })
    const dpoClient = await s.signIn(dpo)
    const before = await dpoClient.post('/api/admin/notice/targets/set', { seen: 1, businessDays: 7, calendarDays: 21 })
    expect([before.status, before.error]).toEqual([400, 'register_invalid'])
    expect(await contactOf(dpoClient)).toMatchObject({ contact: null, targets: null, targetsStated: 'unpublished' })

    // A c09.2 version stands in production's place before 3b: it prints the contact, no targets.
    const settings = await s.recordContact(org, dpo)
    await s.query(
      `insert into notice_versions (org_id, version, body, generator, published_by, dpo_settings_version)
       values ($1, 0, 'A version from the generator before PR 3b.', 'c09.2', $2, $3)`,
      [org.id, dpo.id, settings],
    )
    await s.acknowledge(dpo)
    await s.acknowledge(member)
    const mc = await s.signIn(member)
    const old = NoticeResponse.parse((await mc.get('/api/notice')).body)
    expect(old).toMatchObject({ targets: null, contact: { title: 'Data Protection Officer' } })
    expect(await contactOf(dpoClient)).toMatchObject({ stated: 'stated', targetsStated: 'not_printed' })

    // Set after the contact; the draft states them and reads out of date.
    await recordActivePurposes(dpoClient)
    const set = await dpoClient.post('/api/admin/notice/targets/set', {
      seen: settings,
      businessDays: 7,
      calendarDays: 21,
    })
    expect([set.status, set.error]).toEqual([200, undefined])
    const draft = NoticeAdminResponse.parse((await dpoClient.get('/api/admin/notice')).body).draft
    expect(draft.upToDate).toBe(false)
    expect(draft.body).toContain('within 7 business days')
    expect(draft.body).toContain('within 21 calendar days')
    expect(draft.body).toContain('use the form in Settings › Privacy in Hearth')
    expect(draft.changes).toMatchObject({ targets: 'added' })

    // Published: the notice answers them, and what changed for the member names them added.
    await s.publishNotice(org, dpo, { acknowledge: [dpo] })
    const now = NoticeResponse.parse((await mc.get('/api/notice')).body)
    expect(now.targets).toEqual({ businessDays: 7, calendarDays: 21 })
    expect(now.changes).toMatchObject({ since: 0, targets: 'added' })
    expect(await contactOf(dpoClient)).toMatchObject({ stated: 'stated', targetsStated: 'stated' })

    // A targets-only change: the contact still stated, the targets not.
    const seen = (await contactOf(dpoClient)).contact?.version
    const again = await dpoClient.post('/api/admin/notice/targets/set', { seen, businessDays: 5, calendarDays: 21 })
    expect([again.status, again.error]).toEqual([200, undefined])
    expect(await contactOf(dpoClient)).toMatchObject({
      stated: 'stated',
      targets: { businessDays: 5, calendarDays: 21 },
      targetsStated: 'not_stated',
    })
    // The same figures again record nothing.
    const same = await dpoClient.post('/api/admin/notice/targets/set', {
      seen: (await contactOf(dpoClient)).contact?.version,
      businessDays: 5,
      calendarDays: 21,
    })
    expect(same.json()).toMatchObject({ changed: false })
    // No outbox event for a targets change (PD-72), and an audit row with numbers only.
    expect(
      await s.query<{ details: Record<string, unknown> }>(
        "select details from audit_events where org_id = $1 and action = 'notice.targets_set' order by at",
        [org.id],
      ),
    ).toEqual([
      { details: expect.objectContaining({ business_days: [10, 7], calendar_days: [30, 21] }) },
      { details: expect.objectContaining({ business_days: [7, 5], calendar_days: [21, 21] }) },
    ])
  })
})
