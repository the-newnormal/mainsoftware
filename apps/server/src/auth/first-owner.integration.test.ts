// The first Owner and DPO (D35), set up by the Owner bootstrap script, through the real api on the
// Compose stack (suite first-owner, BSI-01 to BSI-03; TECH-SPEC T22 items 63 to 71, PD-133).
// startStack({ firstOrg: 'bootstrap' }) has the script set up the stack's org as a person sets up
// production's (testing/owner-bootstrap.ts: a child process, a throwaway login of the bootstrap
// login's shape, DEPLOY_ENV test, fictional values), before the write tracking starts, so the sweep
// below sees only this suite's own writes. The org is production's shape: no it.* flag rows, no
// stand-in v0, and nobody in it but the founder until a test adds someone. `npm run
// test:integration` runs it with the stack up (`docker compose up -d --wait`).
//
// Codes go through FakeVerify, never Twilio: on an api whose fake names Twilio Verify's
// transfer-register entry (as XFR-I4 starts one), so the real transfer gate decides each send, or,
// for a sign-in that only gets the founder to a page, on the stack's own api, whose fake names no
// entry. PRD-53 allows each number 3 code requests per 10 minutes; each test's first comment gives
// its budget. The recovery mode isn't run here: XFR-I8 proves the re-clear reaching the api, and the
// script's check (apps/server/scripts/check-owner-bootstrap.ts, BSS-07 to BSS-11) that the script
// passes it the right arguments.
//
// afterAll sweeps the run as the sign-in suite does (testing/leaks.ts: no log line or audit row
// holds a number, code, PIN, token or attempt id, every /api reply was no-store and none a 500, no
// Node warning fired) and checks the outbox's contract for its writes (testing/writes.ts): the suite
// owns no event type, and its sign-ins are the writes it checks.
import { RegistersResponse } from '@hearth/shared'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OTP, PIN_RULE_SESSION } from '#src/auth/policy.ts'
import { FakeVerify } from '#src/auth/sms/fake.ts'
import { withOrg } from '#src/db/database.ts'
import { expectNothingLeaked } from '#src/testing/leaks.ts'
import { FOUNDER_NAME, FOUNDER_NUMBER } from '#src/testing/owner-bootstrap.ts'
import { type Person, type Stack, startStack } from '#src/testing/stack.ts'
import { everyTestPassed, expectEveryWriteCovered } from '#src/testing/writes.ts'

let s: Stack

// The reply every code request gets, sent or held back (PRD-53: the same answer either way).
const CODE_SENT = { status: 'code_sent', expiresInSeconds: OTP.ttlMs / 1000, codeLength: OTP.length }

const founderOf = (): Person => {
  if (s.founder === undefined) throw new Error('the stack has no founder: start it with firstOrg: bootstrap')
  return s.founder
}

// The sign-in audit rows naming the person as their target, oldest first: action and details (the
// founder is also the target of the set-up's own row, bootstrap.set_up).
const auditOf = (person: Person) =>
  s.query<{ action: string; details: Record<string, unknown> }>(
    `select action, details from audit_events
     where org_id = $1 and target_id = $2::text and action like 'auth.%' order by id`,
    [person.orgId, person.id],
  )

// An api whose fake names Twilio Verify's entry, so the real transfer gate decides each send.
async function twilioApi(): Promise<{ app: Awaited<ReturnType<Stack['startApi']>>; twilioLike: FakeVerify }> {
  const twilioLike = new FakeVerify({ transfer: 'twilio' })
  return { app: await s.startApi({ sms: twilioLike }), twilioLike }
}

describe('first-owner: the org the Owner bootstrap script set up, on the real api (BSI-01 to BSI-03; D35, PDPA-10)', () => {
  beforeAll(async () => {
    s = await startStack({ firstOrg: 'bootstrap' })
  })

  // biome-ignore lint/correctness/noEmptyPattern: the hook takes no fixtures.
  afterAll(async ({}, suite) => {
    if (s === undefined) return
    try {
      await expectNothingLeaked(s)
      await expectEveryWriteCovered(s.superuser, 'first-owner', { allPassed: everyTestPassed(suite) })
    } finally {
      await s.stop()
    }
  })

  it('BSI-01 ACC-01 D46 PD-59 T20 item 12: the founder asks for a code by their number as they type it, gets one before any notice (a dpo holder, no_notice), is offered a new PIN, and is signed in on a PIN-rule session only then', async () => {
    // Budgets: the founder 1 code request, on an api whose fake names Twilio Verify's entry.
    const founder = founderOf()
    const { app, twilioLike } = await twilioApi()
    const browser = s.client({ app })
    const requested = await browser.post('/api/auth/otp/request', { phone: FOUNDER_NUMBER })
    expect([requested.status, requested.body]).toEqual([200, CODE_SENT])
    await s.settled()
    expect(twilioLike.countTo(founder.e164)).toBe(1)
    expect(await auditOf(founder)).toEqual([{ action: 'auth.code_requested', details: { send: 'attempted' } }])

    const verified = await browser.post('/api/auth/otp/verify', { code: await twilioLike.nextCode(founder.e164) })
    expect([verified.status, verified.body]).toEqual([200, { status: 'code_verified', next: 'set_pin' }])
    // The enrolment window (T20 item 12): no account until the PIN is set.
    expect(await s.query('select 1 from users where org_id = $1 and id = $2', [founder.orgId, founder.id])).toEqual([])

    const pin = s.newPin()
    const set = await browser.post('/api/auth/pin/set', { pin })
    expect([set.status, set.json<{ status: string }>().status]).toEqual([200, 'signed_in'])
    founder.pin = pin
    expect(
      await s.query('select 1 from users where org_id = $1 and id = $2', [founder.orgId, founder.id]),
    ).toHaveLength(1)
    const { id: sessionId } = await s.sessionOf(browser)
    const [term] = await s.query<{ pin_rule: boolean }>(
      `select expires_at - created_at = $2::interval as pin_rule from sessions where id = $1`,
      [sessionId, PIN_RULE_SESSION.lifetime],
    )
    expect(term?.pin_rule).toBe(true)
    expect((await auditOf(founder)).map(row => row.action)).toEqual([
      'auth.code_requested',
      'auth.sign_in',
      'auth.pin_set',
    ])
  })

  it('BSI-02 T22 items 27, 29 and 37 PD-44: before any notice a member gets the same reply and no code (skipped_no_notice); the founder sees Twilio Verify and AWS cleared by the bootstrap in their name, and a use outside the notice’s setup is refused', async () => {
    // Budgets: the member 1 code request, on an api whose fake names Twilio Verify's entry; the
    // founder 1 sign-in, on the stack's own api.
    const founder = founderOf()
    const member = await s.person()
    const { app, twilioLike } = await twilioApi()
    const asked = await s.client({ app }).post('/api/auth/otp/request', { phone: member.e164 })
    expect([asked.status, asked.body]).toEqual([200, CODE_SENT])
    await s.settled()
    expect(twilioLike.countTo(member.e164)).toBe(0)
    expect(await auditOf(member)).toEqual([{ action: 'auth.code_requested', details: { send: 'skipped_no_notice' } }])

    const browser = await s.signIn(founder)
    const read = await browser.get('/api/admin/registers')
    expect([read.status, read.error]).toEqual([200, undefined])
    const transfers = RegistersResponse.parse(read.body).transfers
    for (const provider of ['twilio', 'aws'] as const) {
      expect(transfers.find(entry => entry.provider === provider)?.clearance, provider).toMatchObject({
        clearedVia: 'bootstrap',
        clearedBy: FOUNDER_NAME,
        withdrawnOn: null,
      })
    }
    // Changing a flag is neither free nor setup (NOTICE_FREE, NOTICE_SETUP): refused before can().
    const refused = await browser.post('/api/admin/flags/set', { key: 'it.optional', enabled: false })
    expect([refused.status, refused.error]).toEqual([403, 'notice_required'])
  })

  it('BSI-03 PD-84 R11: the founder publishes v0 over the set-up’s clearances, which it links; Twilio Verify is then cleared for everyone, and a member who acknowledged it gets a code', async () => {
    // Budgets: the member 1 code request, on an api whose fake names Twilio Verify's entry.
    const founder = founderOf()
    const member = await s.person()
    const version = await s.publishNotice(s.org, founder, { acknowledge: [founder, member] })
    const linked = await s.query<{ id: string }>(
      `select l.clearance_id as id from notice_version_providers l
       where l.org_id = $1 and l.notice_version_id = $2 order by 1`,
      [s.org.id, version.id],
    )
    const bootstrapped = await s.query<{ id: string }>(
      `select id from transfer_clearances
       where org_id = $1 and cleared_via = 'bootstrap' and provider in ('twilio', 'aws') order by 1`,
      [s.org.id],
    )
    expect(bootstrapped).toHaveLength(2)
    expect(linked).toEqual(bootstrapped)
    const state = await withOrg(s.db, { orgId: s.org.id, userId: founder.id }, async trx => {
      const { rows } = await sql<{ state: string }>`select public.transfer_send_state('twilio') as state`.execute(trx)
      return rows[0]?.state
    })
    expect(state).toBe('cleared')

    const { app, twilioLike } = await twilioApi()
    const asked = await s.client({ app }).post('/api/auth/otp/request', { phone: member.e164 })
    expect([asked.status, asked.body]).toEqual([200, CODE_SENT])
    await s.settled()
    expect(twilioLike.countTo(member.e164)).toBe(1)
    expect(await auditOf(member)).toEqual([{ action: 'auth.code_requested', details: { send: 'attempted' } }])
  })
})
