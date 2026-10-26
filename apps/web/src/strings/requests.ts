// What Settings › Privacy says about requests to the Data Protection Officer (PDPA-04, PDPA-13;
// C0.9 OD-07, OD-12, OD-13, OD-15, PD-96, PD-97): the form ("Questions and requests") and your own
// requests ("Your requests"). British English, short and active (CLAUDE.md, Conventions); never
// "ask" in any form and never an AI word (decision 8, strings/ai-copy.ts, ST-02). Nothing here says
// the DPO was told or alerted (OD-22), promises a reply by a day it doesn't know, or suggests an
// unsent request is kept: it lives in the sheet's state only (WS-01). Only Settings › Privacy's lazy
// chunk loads this file. The DPO and the owner may reword any of it in the PR.
import type { CaseKind, MyState, RequestProblem } from '@hearth/shared'

// The kind of a request as the form offers it, in OD-07's order, and the line under each sheet's
// title saying what happens next.
export const REQUEST_KINDS: Readonly<Record<CaseKind, string>> = {
  question: 'A question about my data',
  complaint: 'A complaint',
  access: 'A copy of my data',
  correction: 'Correct my data',
  withdrawal: 'Withdraw consent',
  objection: 'Object to how my data is used',
}

export const REQUEST_INTROS: Readonly<Record<CaseKind, string>> = {
  question: 'Raise anything about how your personal data is handled.',
  complaint:
    'Say what went wrong. If you’d rather not raise it with your organisation, you can contact the PDPC instead, as the privacy notice says.',
  // PRD's s21 row; a copy may be refused, so nothing promises it unconditionally (PPL-15).
  access:
    'The Data Protection Officer gathers the personal data your organisation holds about you, checks it for other people’s data, and sends you a copy with how it was used or disclosed in the past year. If the law lets them withhold any of it, they tell you why.',
  correction: 'Say what’s wrong and where it is. If it isn’t changed, they tell you why.',
  withdrawal:
    'The privacy notice says which purposes rest on your consent. The Data Protection Officer replies saying what stops for you and what continues.',
  objection:
    'For a purpose that rests on your organisation’s legitimate interests. The Data Protection Officer weighs your objection and replies with their decision and why.',
}

// Why a request can't be sent (packages/shared requestProblems), each naming what to change.
export const REQUEST_PROBLEMS: Readonly<Record<RequestProblem, string>> = {
  details_missing: 'Write what it’s about.',
  details_too_long: 'Keep it to 4,000 characters.',
  details_not_plain: 'Use plain text, without special formatting characters.',
}

// Where a request stands, as your tracking shows it (PD-97): words in a pill, never colour alone.
export const MY_STATE_LABELS: Readonly<Record<MyState, string>> = {
  received: 'Received',
  in_progress: 'In progress',
  more_time: 'More time',
  closed: 'Closed',
}

export const REQUESTS = {
  title: 'Questions and requests',
  intro:
    'Write to the Data Protection Officer about your personal data. Only they read it, and you can follow it under “Your requests”.',
  // The published version's target for the kind (OD-08): business days for a question, a complaint,
  // a withdrawal or an objection; calendar days for a copy or a correction.
  targetBusiness: (n: string) => `The Data Protection Officer aims to reply within ${n} business days.`,
  targetCalendar: (n: string) => `The Data Protection Officer aims to reply within ${n} calendar days.`,
  // Hearth collects no reply address (PD-96).
  reply: 'They reply outside Hearth, by a channel your organisation already has for you.',
  field: 'What it’s about',
  fieldOptional: 'Anything that narrows it down (optional)',
  hint: 'Up to 4,000 characters. Leave out ID numbers, health details and copies of other people’s messages: the Data Protection Officer will get in touch if they need more.',
  count: (n: string) => `${n} of 4,000 characters`,
  // While the text holds an ID-number shape: a hint, never a refusal (PD-102).
  idHint: 'This looks like an ID number. Send it only if the Data Protection Officer needs it.',
  sentAs: (name: string) => `Sent as ${name}. The Data Protection Officer may check it’s you before replying.`,
  cancel: 'Cancel',
  send: 'Send',
  sending: 'Sending…',
  done: 'Done',
  // The confirmation, which stays in the sheet until Done.
  sent: 'Sent to the Data Protection Officer.',
  sentAlready: 'This was sent already.',
  due: (day: string) => `They aim to reply by ${day}.`,
  reference: (ref: string) => `Your reference is ${ref}. Quote it if you write to them about this request.`,
  follow: 'You can follow it under “Your requests”.',
  // No answer arrived (offline, a 5xx, a timeout): the client key makes a resend safe.
  failed:
    'Hearth couldn’t confirm it was sent. Check your connection, then send it again: if the first one arrived, it won’t be sent twice.',
  // A refusal the page didn't foresee (400 case_invalid with nothing found here).
  other: 'This request can’t be sent as it is. Reload the page and try again.',
  tryAgain: 'Something else happened at the same moment. Try again.',
  discard: 'Discard what you’ve written? It isn’t saved anywhere.',
  discardYes: 'Discard',
  discardNo: 'Keep writing',
  // With 10 open requests (PD-96, OD-25), in place of the kinds.
  atCap:
    'You have 10 open requests. You can send another once one is closed, or contact the Data Protection Officer using the details above.',
  // "Your requests" (OD-15, PD-97).
  mine: {
    title: 'Your requests',
    loading: 'Loading your requests…',
    empty: 'You haven’t sent a request.',
    unreadable: 'Your requests can’t be shown. Reload the page to try again.',
    incomplete: 'Some of your requests can’t be shown. Reload the page to try again.',
    cut: 'Only your 50 most recent requests are listed.',
    // How a request came: sent here, or logged by the DPO from another channel.
    cameBy: {
      hearth: 'Sent in Hearth',
      email: 'Received by email',
      letter: 'Received by letter',
      phone: 'Received by phone',
      in_person: 'Received in person',
      other: 'Received another way',
    },
    open: (received: string, due: string) => `Received ${received} · Reply due ${due}`,
    closed: (received: string, closed: string) => `Received ${received} · Closed ${closed}`,
    replied: (day: string) => `The Data Protection Officer replied on ${day}.`,
    late: (due: string) => `Past its target day (${due}).`,
    lateHelp: 'If you haven’t heard from the Data Protection Officer, use their details above, or contact the PDPC.',
    referenceLabel: (spelled: string) => `Reference ${spelled}`,
  },
} as const
