// /api/admin (T14 item 16): actions on a person, each needing a session, a re-authentication from the
// last 5 minutes and can()'s yes (admin/people.ts), from C0.6 changing a feature flag
// (flags/set.ts, T17 item 9), and from C0.9 the DPO's registers (compliance/routes.ts, TECH-SPEC
// T22 items 13 and 14) and, from C0.9 PR 2, the DPO's notice: its draft and publishing
// (compliance/notice.ts, T22 item 25), and from C0.9 PR 3a the DPO's business contact (its read in
// compliance/notice.ts, its write in compliance/routes.ts), the people they may record an
// acknowledgement for, and recording one (T22 items 38 to 49), and from C0.9 PR 3b the DPO's reply
// targets (their write in compliance/routes.ts) and requests to the DPO: the queue, the people a
// request may be logged for, one request, logging one and recording a step (compliance/cases.ts,
// T22 items 50 to 62). A person id or a request's id in a path is fine: neither is personal data
// nor names anyone (T19), and the path is what gets logged; a request's reference never appears in
// one (PD-104).
import {
  CaseStepBody,
  ClearTransferBody,
  LogRequestBody,
  LowerUuid,
  PublishBody,
  RecordAcknowledgementBody,
  RecordTransferBody,
  SetContactBody,
  SetPurposeBody,
  SetTargetsBody,
  WithdrawTransferBody,
} from '@hearth/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { deactivate, listDevices, resetPin, signOutDevices } from '#src/admin/people.ts'
import type { Api } from '#src/api.ts'
import { requireSession } from '#src/auth/sessions.ts'
import { addCaseStep, logRequest, readCase, readCasePeople, readQueue } from '#src/compliance/cases.ts'
import {
  publishNotice,
  readContactAdmin,
  readNoticeAdmin,
  readNoticePeople,
  recordAcknowledgement,
} from '#src/compliance/notice.ts'
import {
  clearTransfer,
  readRegisters,
  recordTransfer,
  setContact,
  setPurpose,
  setTargets,
  withdrawTransfer,
} from '#src/compliance/routes.ts'
import { SetFlagBody, setFlag } from '#src/flags/set.ts'
import { parse, requestInfo, send, Uuid } from '#src/http.ts'

const PersonBody = z.strictObject({ person: Uuid })
const ResetPinBody = z.strictObject({
  person: Uuid,
  // How the admin checked it was them (ACC-06).
  identityCheck: z.enum(['in_person', 'video_call']),
  // Kept as the audit row's reason.
  note: z.string().trim().min(1).max(500).optional(),
})
const PersonParams = z.strictObject({ person: Uuid })
// A request's id in a path: lower case as the queue answered it, else 400 invalid_request.
const CaseParams = z.strictObject({ case: LowerUuid })

export function adminRoutes(api: Api) {
  return async (scope: FastifyInstance): Promise<void> => {
    scope.post('/people/deactivate', async (request, reply) => {
      const body = parse(PersonBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await deactivate(api, body, session, requestInfo(api, request)))
    })
    scope.post('/people/reset-pin', async (request, reply) => {
      const body = parse(ResetPinBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await resetPin(api, body, session, requestInfo(api, request)))
    })
    scope.post('/people/sign-out-devices', async (request, reply) => {
      const body = parse(PersonBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await signOutDevices(api, body, session, requestInfo(api, request)))
    })
    scope.get('/people/:person/devices', async (request, reply) => {
      const { person } = parse(PersonParams, request.params)
      const session = await requireSession(api.db, request)
      return send(reply, await listDevices(api, person, session, requestInfo(api, request)))
    })
    scope.post('/flags/set', async (request, reply) => {
      const body = parse(SetFlagBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await setFlag(api, body, session, requestInfo(api, request)))
    })
    scope.get('/registers', async (request, reply) => {
      const session = await requireSession(api.db, request)
      return send(reply, await readRegisters(api, session, requestInfo(api, request)))
    })
    scope.post('/registers/purposes/set', async (request, reply) => {
      const body = parse(SetPurposeBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await setPurpose(api, body, session, requestInfo(api, request)))
    })
    scope.post('/registers/transfers/record', async (request, reply) => {
      const body = parse(RecordTransferBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await recordTransfer(api, body, session, requestInfo(api, request)))
    })
    scope.post('/registers/transfers/clear', async (request, reply) => {
      const body = parse(ClearTransferBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await clearTransfer(api, body, session, requestInfo(api, request)))
    })
    scope.post('/registers/transfers/withdraw', async (request, reply) => {
      const body = parse(WithdrawTransferBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await withdrawTransfer(api, body, session, requestInfo(api, request)))
    })
    scope.get('/notice', async (request, reply) => {
      const session = await requireSession(api.db, request)
      return send(reply, await readNoticeAdmin(api, session, requestInfo(api, request)))
    })
    scope.post('/notice/publish', async (request, reply) => {
      const body = parse(PublishBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await publishNotice(api, body, session, requestInfo(api, request)))
    })
    scope.get('/notice/contact', async (request, reply) => {
      const session = await requireSession(api.db, request)
      return send(reply, await readContactAdmin(api, session, requestInfo(api, request)))
    })
    scope.post('/notice/contact/set', async (request, reply) => {
      const body = parse(SetContactBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await setContact(api, body, session, requestInfo(api, request)))
    })
    scope.post('/notice/targets/set', async (request, reply) => {
      const body = parse(SetTargetsBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await setTargets(api, body, session, requestInfo(api, request)))
    })
    scope.get('/notice/people', async (request, reply) => {
      const session = await requireSession(api.db, request)
      return send(reply, await readNoticePeople(api, session, requestInfo(api, request)))
    })
    scope.post('/notice/acknowledgements/record', async (request, reply) => {
      const body = parse(RecordAcknowledgementBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await recordAcknowledgement(api, body, session, requestInfo(api, request)))
    })
    // Requests to the DPO (C0.9 PR 3b). The static paths are matched before /requests/:case.
    scope.get('/requests', async (request, reply) => {
      const session = await requireSession(api.db, request)
      return send(reply, await readQueue(api, session, requestInfo(api, request)))
    })
    scope.get('/requests/people', async (request, reply) => {
      const session = await requireSession(api.db, request)
      return send(reply, await readCasePeople(api, session, requestInfo(api, request)))
    })
    scope.post('/requests/log', async (request, reply) => {
      const body = parse(LogRequestBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await logRequest(api, body, session, requestInfo(api, request)))
    })
    scope.post('/requests/step', async (request, reply) => {
      const body = parse(CaseStepBody, request.body)
      const session = await requireSession(api.db, request)
      return send(reply, await addCaseStep(api, body, session, requestInfo(api, request)))
    })
    scope.get('/requests/:case', async (request, reply) => {
      const params = parse(CaseParams, request.params)
      const session = await requireSession(api.db, request)
      return send(reply, await readCase(api, params.case, session, requestInfo(api, request)))
    })
  }
}
