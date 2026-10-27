// The requests to the DPO's answers for the queue's tests (Vitest only; nothing in the app imports
// this folder; C0.9 PR 3b): GET /api/admin/requests, GET /api/admin/requests/:case and GET
// /api/admin/requests/people as the server would send them, checked with the strict schemas and read
// with the web app's lenient ones. Every name, reference, address and word is made up, every
// address is on a reserved domain, and no text holds a word AI_COPY refuses.
import {
  type CaseForClient,
  type CasePeopleForClient,
  type CasePeopleJSON,
  CasePeopleResponse,
  CasePeopleResponseForClient,
  CaseResponse,
  CaseResponseForClient,
  type CaseResponseJSON,
  type QueueRowJSON,
  type RequestQueueForClient,
  type RequestQueueJSON,
  RequestQueueResponse,
  RequestQueueResponseForClient,
} from '@hearth/shared'

export const CASE_TODAY = '2026-11-12'

export const CASE_IDS = {
  complaint: 'c0000000-0000-4000-8000-000000000001',
  copy: 'c0000000-0000-4000-8000-000000000002',
  withdrawal: 'c0000000-0000-4000-8000-000000000003',
  closed: 'c0000000-0000-4000-8000-000000000004',
} as const

// Marcus, from the Tembusu seed (db/seed/tembusu.sql).
export const MARCUS_ID = 'b0000000-0000-4000-8000-000000000003'

// An open complaint from Marcus, due in two days, sent in Hearth and not yet worked.
export function queueRow(change: Partial<QueueRowJSON> = {}): QueueRowJSON {
  return {
    id: CASE_IDS.complaint,
    reference: 'K7QMX3TD',
    kind: 'complaint',
    cameBy: 'hearth',
    receivedOn: '2026-10-29',
    dueOn: '2026-11-14',
    repliedOn: null,
    repliedInTime: false,
    revision: 0,
    state: 'new',
    requester: { type: 'person', name: 'Marcus Ong', department: 'Operations', left: false },
    closedOn: null,
    outcome: null,
    ...change,
  }
}

// The queue: two open (the overdue copy of their data first, then the complaint), and one closed.
export function queueAnswer(change: Partial<RequestQueueJSON> = {}): RequestQueueJSON {
  return RequestQueueResponse.parse({
    today: CASE_TODAY,
    open: [
      queueRow({
        id: CASE_IDS.copy,
        reference: 'BC2DFG3H',
        kind: 'access',
        cameBy: 'email',
        receivedOn: '2026-10-01',
        dueOn: '2026-10-31',
        revision: 1,
        state: 'in_progress',
        requester: { type: 'outside', name: 'Lee Example' },
      }),
      queueRow(),
    ],
    openTotal: 2,
    closed: [
      queueRow({
        id: CASE_IDS.closed,
        reference: 'MNP4QRS5',
        kind: 'question',
        receivedOn: '2026-10-05',
        dueOn: null,
        revision: 3,
        state: 'closed',
        requester: { type: 'person', name: 'Priya Nair', department: null, left: true },
        closedOn: '2026-10-09',
        outcome: 'answered',
      }),
    ],
    closedMore: false,
    ...change,
  })
}

export const queueForClient = (...args: Parameters<typeof queueAnswer>): RequestQueueForClient =>
  RequestQueueResponseForClient.parse(queueAnswer(...args))

type CaseChange = Partial<Omit<CaseResponseJSON, 'case'>> & { case?: Partial<CaseResponseJSON['case']> }

// One request's sheet: Marcus's complaint, sent in Hearth, with what he wrote, no steps yet and one
// other request of his, closed.
export function caseAnswer(change: CaseChange = {}): CaseResponseJSON {
  const { case: kase, ...rest } = change
  return CaseResponse.parse({
    today: CASE_TODAY,
    case: {
      id: CASE_IDS.complaint,
      reference: 'K7QMX3TD',
      kind: 'complaint',
      receivedKind: 'complaint',
      cameBy: 'hearth',
      receivedOn: '2026-10-29',
      loggedOn: '2026-10-29',
      loggedBy: null,
      requester: {
        type: 'person',
        person: MARCUS_ID,
        name: 'Marcus Ong',
        department: 'Operations',
        manager: 'Priya Nair',
        leftOn: null,
        channel: null,
        contact: null,
      },
      details: 'The shift rota with my home address was posted in the wrong group.\nPlease take it down.',
      dueOn: '2026-11-14',
      repliedOn: null,
      repliedInTime: false,
      revision: 0,
      state: 'new',
      identityChecked: false,
      reviewOpen: false,
      closedOn: null,
      closedKind: null,
      outcome: null,
      closedNote: null,
      closedBy: null,
      ...kase,
    },
    steps: [],
    others: [
      {
        id: CASE_IDS.closed,
        reference: 'MNP4QRS5',
        kind: 'question',
        cameBy: 'hearth',
        receivedOn: '2026-10-05',
        state: 'closed',
        dueOn: null,
        repliedInTime: true,
        closedOn: '2026-10-09',
        outcome: 'answered',
      },
    ],
    othersMore: false,
    reply: null,
    ...rest,
  })
}

export const caseForClient = (...args: Parameters<typeof caseAnswer>): CaseForClient =>
  CaseResponseForClient.parse(caseAnswer(...args))

// The people a request may be logged for: two current, a leaver, and two nothing tells apart.
export function casePeopleAnswer(change: Partial<CasePeopleJSON> = {}): CasePeopleJSON {
  return CasePeopleResponse.parse({
    people: [
      {
        id: 'b0000000-0000-4000-8000-000000000006',
        name: 'Ahmad Rahman',
        department: 'Commercial',
        manager: null,
        addedOn: '2026-10-01',
        leftOn: null,
      },
      {
        id: MARCUS_ID,
        name: 'Marcus Ong',
        department: 'Operations',
        manager: 'Priya Nair',
        addedOn: '2026-10-01',
        leftOn: null,
      },
      {
        id: 'b0000000-0000-4000-8000-000000000021',
        name: 'Wei Ming Lee',
        department: 'Operations',
        manager: 'Priya Nair',
        addedOn: '2026-10-01',
        leftOn: null,
      },
      {
        id: 'b0000000-0000-4000-8000-000000000022',
        name: 'Wei Ming Lee',
        department: 'Operations',
        manager: 'Priya Nair',
        addedOn: '2026-10-01',
        leftOn: null,
      },
      {
        id: 'b0000000-0000-4000-8000-000000000009',
        name: 'Siti Aminah',
        department: 'Commercial',
        manager: 'Ahmad Rahman',
        addedOn: '2026-10-01',
        leftOn: '2026-11-02',
      },
    ],
    more: false,
    ...change,
  })
}

export const casePeopleForClient = (...args: Parameters<typeof casePeopleAnswer>): CasePeopleForClient =>
  CasePeopleResponseForClient.parse(casePeopleAnswer(...args))

export const LEAVER_ID = 'b0000000-0000-4000-8000-000000000009'
export const ALIKE_IDS = ['b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000022'] as const
