// Requests to the DPO (PDPA-04, PDPA-13; C0.9 OD-06 to OD-09, OD-13 to OD-16, OD-22; PD-88 to
// PD-112; TECH-SPEC T22 items 50 to 62):
//   POST /api/requests/send            you send a question, complaint or request from Settings ›
//                                      Privacy (case.send_own)
//   GET  /api/requests                 the requests you are the requester of, sent or logged for
//                                      you, with what the form needs for its cap (case.list_own)
// and the DPO's, registered in admin/routes.ts under /api/admin:
//   GET  /api/admin/requests           the queue: the open requests, soonest due first, and the
//                                      most recently closed (case.read)
//   GET  /api/admin/requests/people    the people a request may be logged for, current and former
//                                      (case.read)
//   GET  /api/admin/requests/:case     one request with its steps, the same person's other
//                                      requests and, for a withdrawal, the reply the DPO may copy
//                                      (case.read)
//   POST /api/admin/requests/log       the DPO logs one that came another way (case.log)
//   POST /api/admin/requests/step      the DPO records a step on one, or closes it (case.step)
//
// A request is the DPO's alone (OD-14) and its requester's own (OD-15): no role holds a grant on
// cases or case_steps, so every read and write here goes through 0012's checked functions, which
// re-check the DPO (FOR SHARE) or filter by the session's person. Request details aren't Rule 9
// material (OD-06), and nothing here reads or stores content under Rule 9 or reaches the privileged
// module. The answers carry a request's words and the requester's details only to the DPO, under a
// fresh PIN (PD-30), and never in a log line, an event or an audit row: the bodies' fields are on
// the logger's redaction list as a backstop, and parse() never echoes a body (R2). The requester's
// tracking shows Hearth's own labels and days, never the words, the DPO's notes, the steps or the
// outcome (PD-97). Each case write appends its id-only event in the same transaction (PD-101):
// case.opened when a request reached the queue, case.changed for every step; neither names a subject
// nor carries a snapshot, and the reference, which people quote, never rides in one (PD-104).
//
// None of these routes is free of the acknowledgement gate (OD-13): nobody sends or reads a request
// before acknowledging the current notice, and the DPO's aren't setup uses (PD-98), so before v0
// they answer 403 notice_required like every other gated route. No flag gates them (CLAUDE.md, T17
// item 10: a flag never gates an access check or a privacy control).
//
// Every day an answer carries is the database's, as text, in the org's zone, and every answer the
// pages word "due", "overdue" or "past its target day" from carries today, so the browser never
// guesses the org's day.
import {
  CASE_MINE_MAX,
  CASE_OTHERS_MAX,
  CASE_PEOPLE_MAX,
  CASE_QUEUE_CLOSED_MAX,
  CASE_QUEUE_OPEN_MAX,
  type CameBy,
  type CaseDetailJSON,
  type CaseKind,
  type CasePeopleJSON,
  type CaseResponseJSON,
  type CaseState,
  type CaseStepBody,
  type CaseStepKind,
  type CaseStepResponseJSON,
  type CaseStepRowJSON,
  type LogRequestBody,
  type LogRequestResponseJSON,
  logProblems,
  type MyRequestJSON,
  type MyRequestsJSON,
  type MyState,
  type OtherCaseJSON,
  type Outcome,
  type QueueRowJSON,
  type RequesterChannel,
  type RequestQueueJSON,
  requestProblems,
  SendRequestBody,
  type SendRequestResponseJSON,
  type StepProblem,
  stepProblems,
  withdrawalReply,
} from '@hearth/shared'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import type { z } from 'zod'
import { authorise, consider } from '#src/access/world.ts'
import type { Api } from '#src/api.ts'
import { ApiError } from '#src/auth/errors.ts'
import { inSession, requireSession, type SessionIds, signedOut } from '#src/auth/sessions.ts'
import { readLatestPurposes } from '#src/compliance/notice.ts'
import type { InOrg } from '#src/db/database.ts'
import {
  INSUFFICIENT_PRIVILEGE,
  INVALID_PARAMETER,
  REGISTER_CHANGED,
  REGISTER_INVALID,
  sqlstateOf,
} from '#src/db/sqlstate.ts'
import { type Answer, parse, type ReqInfo, requestInfo, send } from '#src/http.ts'
import { appendOutbox } from '#src/outbox/append.ts'

// The codes only these routes answer, which the cases suite must see (and the sign-in suite's
// sweep of every code leaves to it, beside REGISTER_ERRORS and NOTICE_ERRORS).
export const CASE_ERRORS = ['case_changed', 'case_invalid'] as const

// --- The functions' refusals (design 1.20) --------------------------------------------------------

// A check constraint (23514) of the case tables: a backstop for a shape the shared rules and the
// functions refuse first, which answers as the rule it is. Postgres names the constraint, and each
// of these tables' names starts with its table's (0012). A check of any other table the functions
// write (the audit log's, say) is a fault in the server: a logged 500.
const CHECK_VIOLATION = '23514'
const CASE_CONSTRAINT = /^(?:cases|case_steps)_/

function caseCheck(error: unknown): boolean {
  const { constraint } = error as { constraint?: unknown }
  return typeof constraint === 'string' && CASE_CONSTRAINT.test(constraint)
}

// What 0012's case functions refuse with, as the api answers it (C0.9 PD-103: 0012 adds no
// SQLSTATE). HF005 and HF006 carry the register codes' numbers, since the case functions reuse
// them, and answer the case routes' own words, so a requester never reads "This entry can't be saved
// as it is". 22023 is the same 404 for another org's request as for none. 42501 is the caller's: 403
// forbidden for the DPO's routes (cases_check_dpo(), logging yourself), 401 signed_out for the
// requester's (they left in a race, and their deactivation ended the session in the same commit). A
// read's row count out of bounds (2201W) is a programming error the routes never send: a logged 500.
// A lock not granted in time, a deadlock or a reference that clashed 10 times (40001) is the api's
// 409 try_again already (auth/errors.ts fromDatabase).
function refusalOf(error: unknown, insufficient: () => ApiError): ApiError | undefined {
  switch (sqlstateOf(error)) {
    case REGISTER_CHANGED:
      return new ApiError(409, 'case_changed')
    case REGISTER_INVALID:
      return new ApiError(400, 'case_invalid')
    case CHECK_VIOLATION:
      return caseCheck(error) ? new ApiError(400, 'case_invalid') : undefined
    case INVALID_PARAMETER:
      return new ApiError(404, 'not_found')
    case INSUFFICIENT_PRIVILEGE:
      return insufficient()
    default:
      return undefined
  }
}

async function refusing<T>(work: Promise<T>, insufficient: () => ApiError): Promise<T> {
  try {
    return await work
  } catch (error) {
    throw refusalOf(error, insufficient) ?? error
  }
}

const forbidden = () => new ApiError(403, 'forbidden')

// Today in the org's zone, plainly: the day a logged request is checked against and every answer's
// today. Past can() the org exists.
async function todayIn(trx: InOrg, orgId: string): Promise<string> {
  const { rows } = await sql<{ today: string }>`
    select ((now() at time zone time_zone)::date)::text as today from orgs where id = ${orgId}`.execute(trx)
  const row = rows[0]
  if (row === undefined) throw new ApiError(404, 'not_found')
  return row.today
}

// --- POST /api/requests/send ----------------------------------------------------------------------

// You send a request from Settings › Privacy (PDPA-13; C0.9 OD-07, OD-13, PD-96), in one
// transaction: can() decides case.send_own after the gate (403 notice_required first; a refusal is
// only a person no longer at the org, whose session ended in the same commit: 401 signed_out); the
// shared rules refuse what the body itself shows to be wrong (400 case_invalid) before the database
// is asked; submit_case() (0012) re-reads you FOR SHARE, returns the first case for a client key it
// has seen (a resend after a lost answer makes no second case), refuses a rule or your 11th open
// request (HF006, 400 case_invalid) and writes the case and its audit row; case.opened ({via:
// 'form'}) goes to the outbox in the same transaction only when something was recorded. You are the
// requester: the session's person and device, never the body's. No reply address is taken (PD-96).
export async function sendRequest(
  api: Api,
  body: z.output<typeof SendRequestBody>,
  session: SessionIds,
  info: ReqInfo,
): Promise<Answer> {
  const { orgId } = session
  const answer = await inSession(api, info, session, async (trx): Promise<SendRequestResponseJSON> => {
    // The gate's 403 notice_required comes first (consider()). The action's one refusal is someone
    // no longer at the org (case.send_own is for any active person): an ended session, as
    // acknowledging answers it.
    const { verdict } = await consider(trx, session, { action: 'case.send_own' })
    if (verdict !== 'allowed') throw signedOut()
    if (requestProblems(body).length > 0) throw new ApiError(400, 'case_invalid')
    const { rows } = await refusing(
      sql<{ id: string; reference: string; received_on: string; due_on: string; changed: boolean }>`
        select id, reference, received_on::text as received_on, due_on::text as due_on, changed
        from public.submit_case(${body.kind}, ${body.details}, ${body.key}::uuid, ${info.requestId},
          ${session.deviceId}::uuid, ${info.ip}::inet)`.execute(trx),
      signedOut,
    )
    const row = rows[0]
    if (row === undefined) throw new Error('submit_case() returned no row')
    if (row.changed) {
      await appendOutbox(trx, {
        orgId,
        type: 'case.opened',
        entity: { type: 'case', id: row.id },
        subjects: [],
        purpose: 'request_handling',
        ids: { via: 'form' },
      })
    }
    return {
      case: row.id,
      reference: row.reference,
      receivedOn: row.received_on,
      dueOn: row.due_on,
      changed: row.changed,
    }
  })
  return { body: answer }
}

// --- GET /api/requests ----------------------------------------------------------------------------

type MineRow = {
  id: string
  reference: string
  kind: CaseKind
  came_by: CameBy
  received_on: string
  state: MyState
  due_on: string | null
  replied_on: string | null
  replied_in_time: boolean
  closed_on: string | null
  open_total: number
}

// The requests you are the requester of (PDPA-13; C0.9 OD-15, PD-97), sent in Hearth or logged for
// you by the DPO, never one you are only named in, and never one closed as logged in error: open
// first by due day, then closed, newest received, at most CASE_MINE_MAX, with more when there were
// others, and how many of yours are open, which the form reads for its cap. Kinds, references,
// states and days only. In a read-only transaction (read_own_cases() takes no lock); the request
// counts as use of the session. A refusal is someone no longer at the org: 401 signed_out.
export async function readMyRequests(api: Api, session: SessionIds, info: ReqInfo): Promise<Answer> {
  const { orgId } = session
  const body = await inSession(
    api,
    info,
    session,
    async (trx): Promise<MyRequestsJSON> => {
      const { verdict } = await consider(trx, session, { action: 'case.list_own' }, { lock: false })
      if (verdict !== 'allowed') throw signedOut()
      const today = await todayIn(trx, orgId)
      const { rows } = await refusing(
        sql<MineRow>`
          select id, reference, kind, came_by, received_on::text as received_on, state, due_on::text as due_on,
            replied_on::text as replied_on, replied_in_time, closed_on::text as closed_on, open_total
          from public.read_own_cases(${CASE_MINE_MAX + 1})`.execute(trx),
        signedOut,
      )
      return {
        today,
        requests: rows.slice(0, CASE_MINE_MAX).map(
          (row): MyRequestJSON => ({
            id: row.id,
            reference: row.reference,
            kind: row.kind,
            cameBy: row.came_by,
            receivedOn: row.received_on,
            state: row.state,
            dueOn: row.due_on,
            repliedOn: row.replied_on,
            repliedInTime: row.replied_in_time,
            closedOn: row.closed_on,
          }),
        ),
        more: rows.length > CASE_MINE_MAX,
        open: rows[0]?.open_total ?? 0,
      }
    },
    { readOnly: true },
  )
  return { body }
}

// --- GET /api/admin/requests ----------------------------------------------------------------------

type QueueDbRow = {
  id: string
  reference: string
  kind: CaseKind
  came_by: CameBy
  received_on: string
  due_on: string | null
  replied_on: string | null
  replied_in_time: boolean
  revision: number
  state: CaseState
  requester_name: string
  requester_department: string | null
  requester_outside: boolean
  requester_left: boolean
  closed_on: string | null
  outcome: Outcome | null
  open_total: number | null
}

const queueRow = (row: QueueDbRow): QueueRowJSON => ({
  id: row.id,
  reference: row.reference,
  kind: row.kind,
  cameBy: row.came_by,
  receivedOn: row.received_on,
  dueOn: row.due_on,
  repliedOn: row.replied_on,
  repliedInTime: row.replied_in_time,
  revision: row.revision,
  state: row.state,
  requester: row.requester_outside
    ? { type: 'outside', name: row.requester_name }
    : {
        type: 'person',
        name: row.requester_name,
        department: row.requester_department,
        left: row.requester_left,
      },
  closedOn: row.closed_on,
  outcome: row.outcome,
})

const readQueueRows = (trx: InOrg, closed: boolean, max: number) =>
  refusing(
    sql<QueueDbRow>`
      select id, reference, kind, came_by, received_on::text as received_on, due_on::text as due_on,
        replied_on::text as replied_on, replied_in_time, revision, state, requester_name, requester_department,
        requester_outside, requester_left, closed_on::text as closed_on, outcome, open_total
      from public.read_cases(${closed}, ${max + 1})`.execute(trx),
    forbidden,
  )

// The DPO's queue (PDPA-04, PDPA-13; C0.9 OD-14, PD-98), with a fresh PIN (PD-30): today; the open
// requests, soonest due first, at most CASE_QUEUE_OPEN_MAX, with how many are open in all; and the
// most recently closed, at most CASE_QUEUE_CLOSED_MAX, with closedMore when there were others. Who
// sent each by roster name and department, or an outside requester's name; never an address or the
// words. In a read-write transaction, because read_cases() re-reads the DPO FOR SHARE, which a
// read-only transaction refuses (25006); both lists in it, so they agree.
export async function readQueue(api: Api, session: SessionIds, info: ReqInfo): Promise<Answer> {
  const { orgId } = session
  const body = await inSession(api, info, session, async (trx): Promise<RequestQueueJSON> => {
    await authorise(trx, session, { action: 'case.read' }, 'forbidden', { lock: false })
    const today = await todayIn(trx, orgId)
    const { rows: open } = await readQueueRows(trx, false, CASE_QUEUE_OPEN_MAX)
    const { rows: closed } = await readQueueRows(trx, true, CASE_QUEUE_CLOSED_MAX)
    return {
      today,
      open: open.slice(0, CASE_QUEUE_OPEN_MAX).map(queueRow),
      openTotal: open[0]?.open_total ?? 0,
      closed: closed.slice(0, CASE_QUEUE_CLOSED_MAX).map(queueRow),
      closedMore: closed.length > CASE_QUEUE_CLOSED_MAX,
    }
  })
  return { body }
}

// --- GET /api/admin/requests/people ---------------------------------------------------------------

type PersonRow = {
  id: string
  name: string
  department: string | null
  manager: string | null
  added_on: string
  left_on: string | null
}

// The people the DPO may log a request for (C0.9 OD-16, PD-89, PPL-01): every person of the
// organisation but the DPO, current and former (a leaver's request is theirs: PDPA-05 works for
// deactivated accounts), current first and then by name, by name, department, manager, the day they
// were added and the day they left in the org's zone, at most CASE_PEOPLE_MAX, with more when there
// were others, so a cut list is never silent. Roster facts only, with hearth_app's own grants on the
// roster: never a number, a device, a role or a standing. notice.people.read's list stays
// active-only (compliance/notice.ts), since a recorded acknowledgement is for someone still at the
// organisation (OD-19). In a read-only transaction; the request counts as use of the session.
export async function readCasePeople(api: Api, session: SessionIds, info: ReqInfo): Promise<Answer> {
  const { orgId, userId } = session
  const body = await inSession(
    api,
    info,
    session,
    async (trx): Promise<CasePeopleJSON> => {
      await authorise(trx, session, { action: 'case.read' }, 'forbidden', { lock: false })
      const { rows } = await sql<PersonRow>`
        select p.id, p.full_name as name, d.name as department, m.full_name as manager,
          ((p.created_at at time zone o.time_zone)::date)::text as added_on,
          ((p.deactivated_at at time zone o.time_zone)::date)::text as left_on
        from people p
        join orgs o on o.id = p.org_id
        left join departments d on d.org_id = p.org_id and d.id = p.department_id
        left join people m on m.org_id = p.org_id and m.id = p.manager_id
        where p.org_id = ${orgId} and p.id <> ${userId}
        order by p.deactivated_at is not null, p.full_name collate "C", p.id
        limit ${CASE_PEOPLE_MAX + 1}`.execute(trx)
      return {
        people: rows.slice(0, CASE_PEOPLE_MAX).map(row => ({
          id: row.id,
          name: row.name,
          department: row.department,
          manager: row.manager,
          addedOn: row.added_on,
          leftOn: row.left_on,
        })),
        more: rows.length > CASE_PEOPLE_MAX,
      }
    },
    { readOnly: true },
  )
  return { body }
}

// --- GET /api/admin/requests/:case ----------------------------------------------------------------

type CaseRow = {
  id: string
  reference: string
  kind: CaseKind
  received_kind: CaseKind
  came_by: CameBy
  received_on: string
  logged_on: string
  logged_by_name: string | null
  requester_person_id: string | null
  requester_name: string
  requester_outside: boolean
  requester_department: string | null
  requester_manager: string | null
  requester_left_on: string | null
  requester_channel: RequesterChannel | null
  requester_contact: string | null
  details: string | null
  today: string
  due_on: string | null
  replied_on: string | null
  replied_in_time: boolean
  revision: number
  state: CaseState
  identity_checked: boolean
  review_open: boolean
  closed_on: string | null
  closed_kind: CaseKind | null
  outcome: Outcome | null
  closed_note: string | null
  closed_by_name: string | null
}
type StepRow = {
  number: number
  step: CaseStepKind
  on_day: string
  note: string | null
  extended_to: string | null
  kind: CaseKind | null
  recorded_on: string
  recorded_by_name: string | null
}
type OtherRow = {
  id: string
  reference: string
  kind: CaseKind
  came_by: CameBy
  received_on: string
  state: CaseState
  due_on: string | null
  replied_in_time: boolean
  closed_on: string | null
  outcome: Outcome | null
}

function requesterOf(row: CaseRow): CaseDetailJSON['requester'] {
  if (row.requester_outside || row.requester_person_id === null) {
    // 0012's cases_requester: someone without an account always has a channel and its address.
    if (row.requester_channel === null || row.requester_contact === null) {
      throw new Error('read_case() returned an outside requester with no channel')
    }
    return {
      type: 'outside',
      name: row.requester_name,
      channel: row.requester_channel,
      contact: row.requester_contact,
    }
  }
  return {
    type: 'person',
    person: row.requester_person_id,
    name: row.requester_name,
    department: row.requester_department,
    manager: row.requester_manager,
    leftOn: row.requester_left_on,
    channel: row.requester_channel,
    contact: row.requester_contact,
  }
}

const caseDetail = (row: CaseRow): CaseDetailJSON => ({
  id: row.id,
  reference: row.reference,
  kind: row.kind,
  receivedKind: row.received_kind,
  cameBy: row.came_by,
  receivedOn: row.received_on,
  loggedOn: row.logged_on,
  loggedBy: row.logged_by_name,
  requester: requesterOf(row),
  details: row.details,
  dueOn: row.due_on,
  repliedOn: row.replied_on,
  repliedInTime: row.replied_in_time,
  revision: row.revision,
  state: row.state,
  identityChecked: row.identity_checked,
  reviewOpen: row.review_open,
  closedOn: row.closed_on,
  closedKind: row.closed_kind,
  outcome: row.outcome,
  closedNote: row.closed_note,
  closedBy: row.closed_by_name,
})

// One request on the DPO's sheet (PDPA-04, PDPA-13; C0.9 OD-14, PD-98, PD-105, PPL-01, PPL-07),
// with a fresh PIN: today; the request, with what they wrote (or the DPO's summary), who sent it
// (a person's id, for a break-glass citation, and the channel the case records for them, if any; or
// an outside requester's name and channel), its due day, replies, revision, state, whether identity
// has been checked and a PDPC review is open, and its closure; its steps, oldest first (at most 100
// by construction); the same person's other requests, at most CASE_OTHERS_MAX, with othersMore past
// it; and for a withdrawal by its kind now, once a generated version is published, the reply the DPO
// may copy, written by code from that version's active purposes and bases (withdrawalReply(), D41:
// no model), else null. The id comes from the path, a lower-case uuid the queue answered, which names
// nobody (T19); none, or another org's, is 404 alike. In a read-write transaction: each function
// re-reads the DPO FOR SHARE.
export async function readCase(api: Api, id: string, session: SessionIds, info: ReqInfo): Promise<Answer> {
  const { orgId } = session
  const body = await inSession(api, info, session, async (trx): Promise<CaseResponseJSON> => {
    await authorise(trx, session, { action: 'case.read' }, 'forbidden', { lock: false })
    const { rows } = await refusing(
      sql<CaseRow>`
        select id, reference, kind, received_kind, came_by, received_on::text as received_on,
          logged_on::text as logged_on, logged_by_name, requester_person_id, requester_name, requester_outside,
          requester_department, requester_manager, requester_left_on::text as requester_left_on, requester_channel,
          requester_contact, details, today::text as today, due_on::text as due_on, replied_on::text as replied_on,
          replied_in_time, revision, state, identity_checked, review_open, closed_on::text as closed_on, closed_kind,
          outcome, closed_note, closed_by_name
        from public.read_case(${id}::uuid)`.execute(trx),
      forbidden,
    )
    const row = rows[0]
    if (row === undefined) throw new ApiError(404, 'not_found')
    const { rows: steps } = await refusing(
      sql<StepRow>`
        select number, step, on_day::text as on_day, note, extended_to::text as extended_to, kind,
          recorded_on::text as recorded_on, recorded_by_name
        from public.read_case_steps(${id}::uuid)`.execute(trx),
      forbidden,
    )
    const { rows: others } = await refusing(
      sql<OtherRow>`
        select id, reference, kind, came_by, received_on::text as received_on, state, due_on::text as due_on,
          replied_in_time, closed_on::text as closed_on, outcome
        from public.read_case_others(${id}::uuid, ${CASE_OTHERS_MAX + 1})`.execute(trx),
      forbidden,
    )
    return {
      today: row.today,
      case: caseDetail(row),
      steps: steps.map(
        (step): CaseStepRowJSON => ({
          number: step.number,
          step: step.step,
          onDay: step.on_day,
          note: step.note,
          extendedTo: step.extended_to,
          kind: step.kind,
          recordedOn: step.recorded_on,
          recordedBy: step.recorded_by_name,
        }),
      ),
      others: others.slice(0, CASE_OTHERS_MAX).map(
        (other): OtherCaseJSON => ({
          id: other.id,
          reference: other.reference,
          kind: other.kind,
          cameBy: other.came_by,
          receivedOn: other.received_on,
          state: other.state,
          dueOn: other.due_on,
          repliedInTime: other.replied_in_time,
          closedOn: other.closed_on,
          outcome: other.outcome,
        }),
      ),
      othersMore: others.length > CASE_OTHERS_MAX,
      reply: row.kind === 'withdrawal' ? await withdrawalReplyFor(trx, orgId, row.reference) : null,
    }
  })
  return { body }
}

// The withdrawal reply (PDPA-04; C0.9 PD-105) from what the latest published version told people,
// or null with none, or a latest that printed no contact (a stand-in, a c09.1 version).
async function withdrawalReplyFor(trx: InOrg, orgId: string, reference: string): Promise<string | null> {
  const latest = await readLatestPurposes(trx, orgId)
  if (latest === null) return null
  return withdrawalReply({
    org: latest.org,
    reference,
    purposes: latest.purposes,
    contactTitle: latest.contactTitle,
  })
}

// --- POST /api/admin/requests/log -----------------------------------------------------------------

// The DPO logs a request that came by email, letter, phone, in person or another way (PDPA-04,
// PDPA-13; C0.9 OD-16, PD-89, PPL-01, PPL-14), with a fresh PIN, in one transaction: can() decides
// case.log for the person it names (someone else of the org, current or former, or null for
// someone without an account: yourself, another org's person or an unknown id is 403 before the
// function); the shared rules refuse what the body itself shows to be wrong against today in the
// org's zone (400 case_invalid); the route knows nothing of the person's state, so a leaver with no
// channel is the function's to refuse (HF006), which the page words before it sends; log_case()
// (0012) re-checks the DPO, reads the person FOR SHARE, returns the first case for a client key it
// has seen, and writes the case and its audit row; case.opened ({via: 'intake'}) goes to the outbox
// when something was recorded. How identity was checked isn't taken here: it is a step (PPL-14).
export async function logRequest(
  api: Api,
  body: z.output<typeof LogRequestBody>,
  session: SessionIds,
  info: ReqInfo,
): Promise<Answer> {
  const { orgId } = session
  const requester = body.requester
  const person = requester.type === 'person' ? requester.person : null
  const answer = await inSession(api, info, session, async (trx): Promise<LogRequestResponseJSON> => {
    await authorise(trx, session, { action: 'case.log', person }, 'forbidden')
    const today = await todayIn(trx, orgId)
    if (logProblems(body, today).length > 0) throw new ApiError(400, 'case_invalid')
    const { rows } = await refusing(
      sql<{ id: string; reference: string; due_on: string; changed: boolean }>`
        select id, reference, due_on::text as due_on, changed
        from public.log_case(${body.kind}, ${body.cameBy}, ${body.receivedOn}::date, ${person}::uuid,
          ${requester.type === 'outside' ? requester.name : null}, ${requester.channel ?? null},
          ${requester.contact ?? null}, ${body.details}, ${body.key}::uuid, ${info.requestId},
          ${session.deviceId}::uuid, ${info.ip}::inet)`.execute(trx),
      forbidden,
    )
    const row = rows[0]
    if (row === undefined) throw new Error('log_case() returned no row')
    if (row.changed) {
      await appendOutbox(trx, {
        orgId,
        type: 'case.opened',
        entity: { type: 'case', id: row.id },
        subjects: [],
        purpose: 'request_handling',
        ids: { via: 'intake' },
      })
    }
    return { case: row.id, reference: row.reference, dueOn: row.due_on, changed: row.changed }
  })
  return { body: answer }
}

// --- POST /api/admin/requests/step ----------------------------------------------------------------

// The step problems the body shows by itself (the shape): a note's rules (length, plain text, no
// ID-number shape), the fields each step takes, a note step or an identity step with no note, an
// identity note on more than one line or too long, and a refusal with no why. The shared
// stepProblems() finds them against any open request; every other problem depends on the request
// (its kind now, closure, due day, identity step and review), which add_case_step() decides against
// the request it locks.
const STEP_SHAPE: ReadonlySet<StepProblem> = new Set<StepProblem>([
  'note_too_long',
  'note_not_plain',
  'note_id_number',
  'step_fields',
  'note_missing',
  'identity_too_long',
  'identity_not_one_line',
  'refusal_why',
])
// A request against which no problem but the body's shape can arise: open, received on the first
// day there is, with no due day, identity checked and no review.
const ANY_OPEN_REQUEST = {
  kind: 'question',
  cameBy: 'email',
  receivedOn: '0001-01-01',
  dueOn: null,
  revision: 0,
  closedOn: null,
  closedKind: null,
  outcome: null,
  identityChecked: true,
  reviewOpen: false,
} as const

export function stepShapeProblems(body: z.output<typeof CaseStepBody>): StepProblem[] {
  return stepProblems(body, ANY_OPEN_REQUEST, '9999-12-31').filter(problem => STEP_SHAPE.has(problem))
}

// The DPO records a step on a request, or closes it (PDPA-04; C0.9 PD-90, PD-91, PD-112, PPL-04,
// PPL-08), with a fresh PIN, in one transaction, from the revision the sheet showed: can() decides
// case.step (the DPO; which request is the function's to check); the body's shape refuses what it
// shows by itself (400 case_invalid); add_case_step() (0012) re-checks the DPO, locks the request,
// refuses a stale revision (HF005, 409 case_changed: the sheet reloads it and keeps the typed note),
// any rule against the request (HF006, 400 case_invalid: a copy closed as answered before identity
// is checked, more time told after the due day, and the rest), and another org's or no request
// (22023, 404), writes the step or the closure with its audit row, and returns the new revision;
// case.changed ({revision}) goes to the outbox in the same transaction.
export async function addCaseStep(
  api: Api,
  body: z.output<typeof CaseStepBody>,
  session: SessionIds,
  info: ReqInfo,
): Promise<Answer> {
  const { orgId } = session
  const answer = await inSession(api, info, session, async (trx): Promise<CaseStepResponseJSON> => {
    await authorise(trx, session, { action: 'case.step' }, 'forbidden')
    if (stepShapeProblems(body).length > 0) throw new ApiError(400, 'case_invalid')
    const { rows } = await refusing(
      sql<{ revision: number }>`
        select revision from public.add_case_step(${body.case}::uuid, ${body.seen}::integer, ${body.step},
          ${body.onDay}::date, ${body.note}, ${body.extendedTo}::date, ${body.kind}, ${body.outcome},
          ${info.requestId}, ${session.deviceId}::uuid, ${info.ip}::inet)`.execute(trx),
      forbidden,
    )
    const row = rows[0]
    if (row === undefined) throw new Error('add_case_step() returned no row')
    await appendOutbox(trx, {
      orgId,
      type: 'case.changed',
      entity: { type: 'case', id: body.case },
      subjects: [],
      purpose: 'request_handling',
      ids: { revision: row.revision },
    })
    return { revision: row.revision }
  })
  return { body: answer }
}

// --- The count on the DPO's avatar button (GET /api/session) --------------------------------------

// How many open requests need the DPO's attention (C0.9 OD-22, PD-99): new, due within 2 business
// days, or overdue, leaving out one replied to on time, from case_attention() (0012), which takes no
// lock, so it runs in the session read's read-only transaction, and answers null for anyone who
// isn't the DPO still at the org. A number, never a name. web/session.ts asks it only for someone
// can() and the notice would let read the queue.
export async function caseAttention(trx: InOrg): Promise<number | null> {
  const { rows } = await sql<{ count: number | null }>`select public.case_attention() as count`.execute(trx)
  return rows[0]?.count ?? null
}

// --- Routes ---------------------------------------------------------------------------------------

// /api/requests and /api/requests/send, registered in api.ts under /api with the prefix
// /requests. The DPO's five are in admin/routes.ts.
export function caseRoutes(api: Api) {
  return async (scope: FastifyInstance): Promise<void> => {
    scope.get('/', async (request, reply) => {
      const session = await requireSession(api.db, request)
      return send(reply, await readMyRequests(api, session, requestInfo(api, request)))
    })
    scope.post('/send', async (request, reply) => {
      const body = parse(SendRequestBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await sendRequest(api, body, session, requestInfo(api, request)))
    })
  }
}
