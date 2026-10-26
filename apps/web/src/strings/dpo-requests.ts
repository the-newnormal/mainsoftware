// What the DPO's queue says (/dpo/requests; PDPA-04, PDPA-13; C0.9 OD-14, OD-22, PD-98, PD-99,
// PD-112): the queue's cards and lists, and the labels the case sheet and the log dialog share with
// it (a request's kind, state, outcome and how it came). strings/dpo.ts's header gives the rules for
// every DPO page's copy: British English, short and active, never "ask" and never an AI word
// (decision 8, ST-02, DPP-06). Only the queue's chunks load this file; the case sheet's and the log
// dialog's own copy is strings/dpo-case.ts, which loads with them when they first open, so the
// queue's chunk carries none of it. The DPO and the owner may reword any of it in the PR.
import type { CameBy, CaseKind, CaseState, Outcome } from '@hearth/shared'

// A request's kind, as the queue and the sheet name it.
export const CASE_KIND_LABELS: Readonly<Record<CaseKind, string>> = {
  question: 'Question',
  complaint: 'Complaint',
  access: 'Copy of their data',
  correction: 'Correction',
  withdrawal: 'Withdrawal',
  objection: 'Objection',
}

// Where a request stands, in a pill: words, never colour alone.
export const CASE_STATE_LABELS: Readonly<Record<CaseState, string>> = {
  new: 'New',
  in_progress: 'In progress',
  more_time: 'More time',
  closed: 'Closed',
}

export const OUTCOME_LABELS: Readonly<Record<Outcome, string>> = {
  answered: 'Answered',
  refused: 'Refused',
  withdrawn: 'Withdrawn by them',
  duplicate: 'A duplicate',
  not_a_request: 'Not a request',
  logged_in_error: 'Logged in error',
}

export const CAME_BY_LABELS: Readonly<Record<CameBy, string>> = {
  hearth: 'Sent in Hearth',
  email: 'By email',
  letter: 'By letter',
  phone: 'By phone',
  in_person: 'In person',
  other: 'Another way',
}
export const REQUESTS_COPY = {
  title: 'Requests',
  log: 'Log a request',
  loading: 'Loading the requests…',
  open: 'Open requests',
  openTitle: (total: string) => `Open requests (${total})`,
  closed: 'Closed requests',
  showClosed: 'Show closed requests',
  hideClosed: 'Hide closed requests',
  empty: 'No open requests.',
  emptyClosed: 'No closed requests yet.',
  cut: (n: string, total: string) => `Only the ${n} due soonest of ${total} open requests are listed.`,
  incomplete: 'Some open requests couldn’t be shown. Reload to try again.',
  closedIncomplete: 'Some closed requests couldn’t be shown. Reload to try again.',
  closedCut: 'Only the 100 most recently closed are listed.',
  // Before the notice is published and acknowledged (PPL-02): the queue isn't read at all.
  noticeFirst: 'Requests open once the notice is published and you’ve acknowledged it.',
  toNotice: 'Open the Notice tab',
  toPurposes: 'Open the processing register',
  toContact: 'Open your contact details',
  // The due line, from the answer's today (PD-112: a reply on time ends the clock).
  due: (day: string) => `Due ${day}`,
  dueToday: 'Due today',
  overdue: (day: string) => `Overdue since ${day}`,
  repliedOnTime: (day: string) => `Replied ${day}`,
  received: (day: string) => `Received ${day}`,
  closedOn: (day: string, outcome: string) => `Closed ${day} · ${outcome}`,
  // Who sent it.
  requester: {
    person: (name: string, department: string) => `${name}, ${department}`,
    left: 'Has left',
    outside: (name: string) => `${name} · No Hearth account`,
  },
  referenceLabel: (spelled: string) => `Reference ${spelled}`,
} as const
