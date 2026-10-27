// The requests to the DPO's calls (PDPA-04, PDPA-13; C0.9 OD-14, OD-16, PD-89 to PD-91, PD-98), all
// through api/http.ts (WS-03) and read with packages/shared's lenient readers (cases.ts), which say
// when a list dropped rows so the queue never claims there are none:
// - GET /api/admin/requests, the queue: the open requests soonest due first, the most recently
//   closed, and today in the org's zone. Read when the page opens and again after each write; never
//   on focus or reconnect, so a stale stamp doesn't turn a page the DPO is reading into a PIN step
//   (the registers' policy, dpo/queries.ts).
// - GET /api/admin/requests/:case, one case with its steps, the same person's other requests and,
//   for a withdrawal, the reply to copy, under a key per case; the path is built only from the
//   lower-case uuid the queue (or the case's own answer) gave, never from a reference or typed text.
// - GET /api/admin/requests/people, the people a request may be logged for (current and former),
//   read only while the log dialog is open, as the record dialog's people are.
// - POST /api/admin/requests/log and /step, each moving the queue, the case and the session (whose
//   count badges the avatar button, "Data protection" and the Requests link: PD-99).
// Only the queue's chunks load this module (dpo/RequestsScreen.tsx, CaseSheet.tsx, LogRequest.tsx),
// so the chunk every DPO page shares carries none of these schemas. Nothing is kept outside Query's
// cache (D-01); an unsaved step or intake is component state, never storage (WS-01).
import {
  type AddCaseStepJSON,
  CasePeopleResponseForClient,
  type CaseReference,
  CaseResponseForClient,
  CaseStepResponseForClient,
  type LogRequestJSON,
  LogRequestResponseForClient,
  RequestQueueResponseForClient,
  UUID_PATTERN,
} from '@hearth/shared'
import { queryOptions } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/api/http.ts'
import { sessionQuery } from '@/api/queries.ts'

const QUIET = { staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false } as const

export const requestQueueQuery = queryOptions({
  queryKey: ['requests', 'queue'] as const,
  queryFn: ({ signal }) => apiGet('/api/admin/requests', RequestQueueResponseForClient, { signal }),
  ...QUIET,
})

// A case's path: a lower-case uuid only (the queue's answers read ids with LowerUuid), so nothing
// else can reach the path; the reference is never in one (PD-104).
export function caseApiPath(id: string): `/api/admin/requests/${string}` {
  if (!UUID_PATTERN.test(id)) throw new Error('A case is read by its lower-case id')
  return `/api/admin/requests/${id}`
}

export const caseQuery = (id: string) =>
  queryOptions({
    queryKey: ['requests', 'case', id] as const,
    queryFn: ({ signal }) => apiGet(caseApiPath(id), CaseResponseForClient, { signal }),
    ...QUIET,
  })

export const casePeopleQuery = queryOptions({
  queryKey: ['requests', 'people'] as const,
  queryFn: ({ signal }) => apiGet('/api/admin/requests/people', CasePeopleResponseForClient, { signal }),
  ...QUIET,
})

export type LoggedRequest = { readonly case: string; readonly reference: CaseReference; readonly changed: boolean }

export async function logRequest(body: LogRequestJSON): Promise<LoggedRequest> {
  const answer = await apiPost('/api/admin/requests/log', body, LogRequestResponseForClient)
  // A 2xx is always read with the schema, so an answer is there.
  if (answer === undefined) throw new Error('the log answered nothing')
  return { case: answer.case, reference: answer.reference, changed: answer.changed }
}

export async function addCaseStep(body: AddCaseStepJSON): Promise<{ revision: number }> {
  const answer = await apiPost('/api/admin/requests/step', body, CaseStepResponseForClient)
  if (answer === undefined) throw new Error('the step answered nothing')
  return { revision: answer.revision }
}

// What a case write moves: the queue, every case's answer (the case written, and the other
// requests another case's sheet lists), and the session, whose count badges the avatar button and
// the Requests link (PD-99).
export const CASE_WRITE_MOVES = [requestQueueQuery.queryKey, ['requests', 'case'], sessionQuery.queryKey] as const
