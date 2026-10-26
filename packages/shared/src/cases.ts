// Requests to the DPO (PDPA-04, PDPA-13; C0.9 OD-06 to OD-09, OD-14 to OD-16; PD-88 to PD-104), as
// the api, Settings › Privacy and the DPO's queue share them: their kinds, the ways one arrives,
// the steps the DPO records, the outcomes and the states; the limits and rules migration 0012
// enforces on every write (submit_case(), log_case(), add_case_step() and the checks on cases and
// case_steps), mirrored here in its refusal order, so the forms word a problem before they send and
// the route answers 400 case_invalid before the database refuses; the reference people quote; and
// the bodies and answers of /api/requests and /api/admin/requests. A request is the DPO's alone
// (OD-14) and its requester's own (OD-15): nothing here names anyone a request is about, and only
// the DPO's answers carry what someone wrote or how to reach them. The database stays the one that
// decides: a rule here that drifts from 0012's lets a refusal through as HF006 (400 case_invalid),
// never a write. The problems are codes; the pages word each (apps/web's strings), never this file.
//
// The server loads this file on Node (T2), and the package compiles with lib ES2024 and no DOM or
// Node types. It imports neither notice.ts nor notice-text.ts (notice-text.ts imports it, for the
// reference the withdrawal reply quotes).
import { z } from 'zod'
import { CONTACT_EMAIL_MAX, CONTACT_EMAIL_PATTERN, CONTACT_PHONE_PATTERN, postalInShape } from './dpo-contact.ts'
import { IDS_NUMBER_MAX, LowerUuid } from './ids.ts'
import { Day, PersonName } from './web.ts'

// --- The vocabulary (0012's checks) -------------------------------------------------------------

// OD-07's six kinds: a question, a complaint, a copy of my data (s21), a correction (s22), withdrawing
// consent (s16) and an objection. C1.11 adds its incidents and investigations by replacing 0012's
// kind checks and read functions.
export const CASE_KINDS = ['question', 'complaint', 'access', 'correction', 'withdrawal', 'objection'] as const
export type CaseKind = (typeof CASE_KINDS)[number]
// The kinds whose target counts calendar days (OD-08): a copy and a correction. The rest count
// business days.
export const CALENDAR_KINDS = ['access', 'correction'] as const satisfies readonly CaseKind[]
// The kinds the DPO may record more time for: s21's written notice, which PDPA-07 extends to a
// correction.
export const EXTENDABLE_KINDS = CALENDAR_KINDS
// The kinds closed as answered only once a step records how the requester's identity was checked
// (PD-91): nothing is released or changed on a session alone.
export const IDENTITY_KINDS = CALENDAR_KINDS
// The kinds that can be refused, by the kind a request was closed as: a copy, a correction or an
// objection. A withdrawal is the person's right (s16), and a question or a complaint is answered.
export const REFUSABLE_KINDS = ['access', 'correction', 'objection'] as const satisfies readonly CaseKind[]

// How a request reached the DPO: the form in Hearth, or another way the DPO logs (OD-16).
export const CAME_BY = ['hearth', 'email', 'letter', 'phone', 'in_person', 'other'] as const
export type CameBy = (typeof CAME_BY)[number]
export const LOGGED_CAME_BY = ['email', 'letter', 'phone', 'in_person', 'other'] as const satisfies readonly CameBy[]
export type LoggedCameBy = (typeof LOGGED_CAME_BY)[number]

// One way to reach a requester outside Hearth, in the DPO contact's shapes (0011): an email
// address, a phone number in international format, or a postal address. Never collected by the
// form (PD-96): only the DPO records one, for someone without an account (required), someone who
// has left (required, PPL-01), or anyone else who gives one.
export const REQUESTER_CHANNELS = ['email', 'phone', 'post'] as const
export type RequesterChannel = (typeof REQUESTER_CHANNELS)[number]

// What the DPO records on a request (add_case_step()'s step): the steps case_steps keeps, and
// closed, which closes the request on its own row, once (PD-90, PD-91):
//   acknowledged      told them it was received
//   identity_checked  checked who they are, with how (one line, never an ID number: OD-16)
//   replied           the reply the request waits for, which ends the clock when on time (PD-112);
//                     a holding message is a note
//   extended          more time, for a copy or a correction, told in writing on or before the due
//                     day (s21, PPL-04)
//   reclassified      the kind it is now (PD-90)
//   note              the DPO's own working note, open or closed
//   review_started    the requester applied to the PDPC to review a refused copy (s22A, PDPA-09)
//   review_ended      that review ended
//   closed            the closure: the day, the outcome and a note (a refusal's why)
export const STEP_INPUTS = [
  'acknowledged',
  'identity_checked',
  'replied',
  'extended',
  'reclassified',
  'note',
  'review_started',
  'review_ended',
  'closed',
] as const
export type StepInput = (typeof STEP_INPUTS)[number]
// The steps case_steps keeps (0012's case_steps_step): every input but the closure, in its order.
export const CASE_STEPS = [
  'acknowledged',
  'identity_checked',
  'replied',
  'extended',
  'reclassified',
  'note',
  'review_started',
  'review_ended',
] as const satisfies readonly StepInput[]
export type CaseStepKind = (typeof CASE_STEPS)[number]

// How a request was closed (0012's cases_outcome): answered; refused (a copy, a correction or an
// objection, with why); withdrawn by them; a duplicate; not a request; or logged in error (a case
// the DPO logged against the wrong requester, which leaves their tracking).
export const OUTCOMES = ['answered', 'refused', 'withdrawn', 'duplicate', 'not_a_request', 'logged_in_error'] as const
export type Outcome = (typeof OUTCOMES)[number]

// Where a request stands, as its requester's tracking shows it (read_own_cases(), PD-97): received
// (sent in Hearth, nothing recorded yet), in progress, more time (an extension recorded), or
// closed. Never the steps, the notes or the outcome.
export const MY_STATES = ['received', 'in_progress', 'more_time', 'closed'] as const
export type MyState = (typeof MY_STATES)[number]
// Where an open request stands in the DPO's queue (read_cases(), PD-98): new (sent in Hearth,
// nothing recorded yet; one the DPO logged has been seen), in progress, or more time.
export const QUEUE_STATES = ['new', 'in_progress', 'more_time'] as const
export type QueueState = (typeof QUEUE_STATES)[number]
// A request in any state, as the queue's closed list and the case sheet's other requests show it.
export const CASE_STATES = [...QUEUE_STATES, 'closed'] as const
export type CaseState = (typeof CASE_STATES)[number]

// --- The limits (0012's, which RQD-02 and RQI-09 hold equal) ------------------------------------

// What a requester writes, and the DPO's summary of what they want, in characters as Postgres
// counts them (code points).
export const CASE_DETAILS_MAX = 4000
// A step's note, and a closing note.
export const CASE_NOTE_MAX = 2000
// How identity was checked: one line.
export const CASE_IDENTITY_NOTE_MAX = 500
// The name of someone without a Hearth account: one line.
export const CASE_NAME_MAX = 200
// How many of one person's requests may be open when they send another (PD-96, OD-25): a bound on
// how many one person can keep open, so the queue can't be flooded, not an exact limit.
export const CASE_OPEN_PER_REQUESTER_MAX = 10
// How many steps one request holds, so the case sheet is bounded by construction; the closure adds
// none (DB-03).
export const CASE_STEPS_MAX = 100
// How far back the DPO may log a request's day received, in days before today.
export const CASE_RECEIVED_BACK_DAYS = 365
// How far past the day received more time may run, in days.
export const CASE_EXTENSION_MAX_DAYS = 90
// The indicator counts a request due within this many business days, overdue included (PD-99).
export const CASE_ATTENTION_BUSINESS_DAYS = 2
// The most rows each list answers; a longer one says it was cut.
export const CASE_QUEUE_OPEN_MAX = 200
export const CASE_QUEUE_CLOSED_MAX = 100
export const CASE_MINE_MAX = 50
export const CASE_PEOPLE_MAX = 2000
export const CASE_OTHERS_MAX = 50 // the case sheet's "Their other requests" (PPL-07)

// NRIC- and FIN-shaped strings (OD-16: no ID number is kept), refused in what the DPO types and
// hinted against in a requester's own words. ASCII, so JavaScript and Postgres read it alike.
export const ID_NUMBER_SHAPE = /(^|[^a-z0-9])[stfgm][0-9]{7}[a-z]([^a-z0-9]|$)/i
// Bidirectional embedding, override and isolate characters (Rule 8: people's words read in the
// order they were written), refused everywhere 0012 refuses them. Written as \u escapes, never the
// raw characters, which could reorder how a reader sees this file (Trojan Source; DB-04, PD-113).
export const BIDI_FORMATTING = /[\u202A-\u202E\u2066-\u2069]/u

// --- The reference (PD-104) ---------------------------------------------------------------------

// A case's reference, which people outside Hearth quote (the requester, the DPO's replies, the
// break-glass log): eight symbols drawn by the database (new_case_reference()), with no vowel, no Y
// and no 0, 1 or L, the first and fifth always a letter, so none spells a word or holds more than
// three digits in a row. 0012's cases_reference check. Upper case, which is_ids_only() refuses, so
// it never rides in an event or a job; Hearth's own machinery uses the case's id.
export const CASE_REFERENCE_PATTERN =
  /^[BCDFGHJKMNPQRSTVWXZ][2-9BCDFGHJKMNPQRSTVWXZ]{3}[BCDFGHJKMNPQRSTVWXZ][2-9BCDFGHJKMNPQRSTVWXZ]{3}$/

// A reference as stored, eight symbols, which only parseCaseReference() makes.
export type CaseReference = string & { readonly caseReference: true }

// A reference as someone typed or pasted it: trimmed, spaces, hyphens and dashes dropped, upper
// case; null when it isn't one.
export function parseCaseReference(text: string): CaseReference | null {
  const compact = text.replace(/[\s\-\u2010-\u2015\u2212]/gu, '').toUpperCase()
  return CASE_REFERENCE_PATTERN.test(compact) ? (compact as CaseReference) : null
}

// As people read and quote it: two groups of four, K7QM-X3TD.
export const formatCaseReference = (reference: CaseReference): string =>
  `${reference.slice(0, 4)}-${reference.slice(4)}`

// As a screen reader should say it, symbol by symbol: "K 7 Q M, X 3 T D".
export const spelledReference = (reference: CaseReference): string =>
  `${[...reference.slice(0, 4)].join(' ')}, ${[...reference.slice(4)].join(' ')}`

// --- Text (as 0012's writers read it) ------------------------------------------------------------

// Postgres bounds text in code points, where a JavaScript string's length counts UTF-16 units.
const codePoints = (text: string) => [...text].length

// Text as the case writers read it: CRLF read as LF, trimmed of String.prototype.trim()'s set
// (which 0009's edges literal spells), and empty read as none.
export function caseText(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null
  const trimmed = text.replaceAll('\r\n', '\n').trim()
  return trimmed === '' ? null : trimmed
}

// Postgres's [[:cntrl:]] in the database's ctype is \p{Cc} exactly.
const CONTROL = /\p{Cc}/u
// Plain text on as many lines as it needs: no control character but the line break, and no
// bidirectional-formatting character.
const plainLines = (text: string) => !CONTROL.test(text.replaceAll('\n', '')) && !BIDI_FORMATTING.test(text)

// Whether a requester's words look like they hold an ID number, for the form's hint (never a
// refusal: a requester's words are theirs, PD-102).
export const idNumberLikely = (text: string | null | undefined): boolean =>
  text !== null && text !== undefined && ID_NUMBER_SHAPE.test(text)

// Whether an address is in its channel's shape, as 0012's cases_requester_contact admits it: an
// email address or a phone number in the DPO contact's patterns (0011), or a postal address in its
// shape with no bidirectional-formatting character. Given as stored: trimmed.
export function contactInShape(channel: RequesterChannel, contact: string): boolean {
  switch (channel) {
    case 'email':
      return codePoints(contact) <= CONTACT_EMAIL_MAX && CONTACT_EMAIL_PATTERN.test(contact)
    case 'phone':
      return CONTACT_PHONE_PATTERN.test(contact)
    case 'post':
      return postalInShape(contact) && !BIDI_FORMATTING.test(contact)
  }
}

const isChannel = (channel: string | null | undefined): channel is RequesterChannel =>
  channel !== null && channel !== undefined && (REQUESTER_CHANNELS as readonly string[]).includes(channel)

// A day shifted by whole days, on the calendar (YYYY-MM-DD in, YYYY-MM-DD out).
// setUTCFullYear() rather than Date.UTC(), which reads a year below 100 as 1900 and more.
function shiftDay(day: string, days: number): string {
  const [year = 1, month = 1, date = 1] = day.split('-').map(Number)
  const shifted = new Date(0)
  shifted.setUTCFullYear(year, month - 1, date + days)
  return shifted.toISOString().slice(0, 10)
}
const isDay = (day: string | null | undefined): day is string =>
  day !== null && day !== undefined && Day.safeParse(day).success

// --- What a request sent in Hearth needs (submit_case()) ----------------------------------------

// Why a request can't be sent, in submit_case()'s order (HF006, 400 case_invalid):
//   details_missing    nothing written, for any kind but a copy of their data
//   details_too_long   over 4,000 characters
//   details_not_plain  a control character other than the line break, or a bidirectional-formatting
//                      character
// No AI_COPY rule and no ID-number rule: a requester's words are theirs (PD-102); idNumberLikely()
// drives the form's hint. The cap of 10 open requests is the database's (HF006), which the form
// reads from MyRequestsResponse.open.
export const REQUEST_PROBLEMS = ['details_missing', 'details_too_long', 'details_not_plain'] as const
export type RequestProblem = (typeof REQUEST_PROBLEMS)[number]

export function requestProblems(request: { kind: CaseKind; details: string | null }): RequestProblem[] {
  const details = caseText(request.details)
  const found = new Set<RequestProblem>()
  if (details === null) {
    if (request.kind !== 'access') found.add('details_missing')
  } else {
    if (codePoints(details) > CASE_DETAILS_MAX) found.add('details_too_long')
    if (!plainLines(details)) found.add('details_not_plain')
  }
  return REQUEST_PROBLEMS.filter(problem => found.has(problem))
}

// --- What a request the DPO logs needs (log_case(), OD-16, PD-89) --------------------------------

// Why a logged request can't be saved, in log_case()'s order (HF006, 400 case_invalid), each naming
// its field, never its value:
//   requester_both          a person at the organisation and someone without an account, both
//   name_missing            someone without an account, with no name
//   name_too_long           a name over 200 characters
//   name_not_one_line       a name on more than one line
//   name_not_plain          a name with a control or bidirectional-formatting character
//   name_id_number          a name holding an NRIC- or FIN-shaped string (OD-16)
//   channel_missing         someone without an account with no channel, or an address with none
//   leaver_channel_missing  someone who has left, with no channel to reach them (PPL-01): only when
//                           the page passes the person it picked; the route passes none, and the
//                           function decides, reading the person FOR SHARE
//   contact_shape           an address missing, or not in its channel's shape (contactInShape())
//   contact_id_number       an address holding an NRIC- or FIN-shaped string
//   came_by                 not by email, letter, phone, in person or another way
//   received_range          no day received, or one before a year ago or after today, in the org's
//                           zone
//   details_missing         no summary of what they want
//   details_too_long        a summary over 4,000 characters
//   details_not_plain       a summary with a control character other than the line break, or a
//                           bidirectional-formatting character
//   details_id_number       a summary holding an NRIC- or FIN-shaped string
// How identity was checked isn't taken here: it is a step, with its own day (PPL-14).
export const LOG_PROBLEMS = [
  'requester_both',
  'name_missing',
  'name_too_long',
  'name_not_one_line',
  'name_not_plain',
  'name_id_number',
  'channel_missing',
  'leaver_channel_missing',
  'contact_shape',
  'contact_id_number',
  'came_by',
  'received_range',
  'details_missing',
  'details_too_long',
  'details_not_plain',
  'details_id_number',
] as const
export type LogProblem = (typeof LOG_PROBLEMS)[number]

// A logged request as the dialog holds it, with log_case()'s arguments: the person it names (an id)
// or the name of someone without an account, and one channel with its address. The page sends one
// of the two requesters (LogRequestBody); requester_both catches a page that sends both.
export interface LogDraft {
  cameBy: string | null
  receivedOn: string | null
  person: string | null
  name: string | null
  channel: string | null
  contact: string | null
  details: string | null
}

// The request the body carries, as the dialog's draft.
export function logDraftOf(body: LogRequestJSON | z.output<typeof LogRequestBody>): LogDraft {
  const requester = body.requester
  return {
    cameBy: body.cameBy,
    receivedOn: body.receivedOn,
    person: requester.type === 'person' ? requester.person : null,
    name: requester.type === 'outside' ? requester.name : null,
    channel: requester.channel ?? null,
    contact: requester.contact ?? null,
    details: body.details,
  }
}

// What holds a logged request back, in LOG_PROBLEMS order. It reads the text as log_case() does
// (caseText()), counted in code points. today is the org's, in its time zone, YYYY-MM-DD. picked is
// the people list's entry the dialog chose: with leftOn set, a channel is required (PPL-01). The
// route passes none, knowing nothing of the person's state, so the function decides.
export function logProblems(
  request: LogDraft | LogRequestJSON | z.output<typeof LogRequestBody>,
  today: string,
  picked?: { leftOn: string | null },
): LogProblem[] {
  const draft = 'requester' in request ? logDraftOf(request) : request
  const found = new Set<LogProblem>()
  const person = draft.person === null || draft.person === '' ? null : draft.person
  const name = caseText(draft.name)
  const contact = caseText(draft.contact)
  const channel = isChannel(draft.channel) ? draft.channel : null
  if (person !== null && name !== null) found.add('requester_both')
  if (person === null) {
    if (name === null) found.add('name_missing')
    else {
      if (codePoints(name) > CASE_NAME_MAX) found.add('name_too_long')
      // As log_case() reads it: a line feed is more than one line, and any other control character
      // (a carriage return left alone included) isn't plain text.
      if (name.includes('\n')) found.add('name_not_one_line')
      if (CONTROL.test(name.replaceAll('\n', '')) || BIDI_FORMATTING.test(name)) found.add('name_not_plain')
      if (ID_NUMBER_SHAPE.test(name)) found.add('name_id_number')
    }
    if (channel === null) found.add('channel_missing')
  } else if (channel === null && contact !== null) {
    found.add('channel_missing')
  } else if (picked !== undefined && picked.leftOn !== null && channel === null && contact === null) {
    found.add('leaver_channel_missing')
  }
  if (channel !== null) {
    if (contact === null || !contactInShape(channel, contact)) found.add('contact_shape')
  }
  if (contact !== null && ID_NUMBER_SHAPE.test(contact)) found.add('contact_id_number')
  if (draft.cameBy === null || !(LOGGED_CAME_BY as readonly string[]).includes(draft.cameBy)) found.add('came_by')
  if (
    !isDay(draft.receivedOn) ||
    draft.receivedOn > today ||
    draft.receivedOn < shiftDay(today, -CASE_RECEIVED_BACK_DAYS)
  ) {
    found.add('received_range')
  }
  const details = caseText(draft.details)
  if (details === null) found.add('details_missing')
  else {
    if (codePoints(details) > CASE_DETAILS_MAX) found.add('details_too_long')
    if (!plainLines(details)) found.add('details_not_plain')
    if (ID_NUMBER_SHAPE.test(details)) found.add('details_id_number')
  }
  return LOG_PROBLEMS.filter(problem => found.has(problem))
}

// --- What a step needs (add_case_step(), PD-90, PD-91) -------------------------------------------

// Why a step can't be recorded, in add_case_step()'s order (HF006, 400 case_invalid; a stale
// revision is HF005, 409 case_changed, which the page can't foresee):
//   too_many_steps           a step on a request that holds 100; never for the closure (DB-03)
//   day_range                no day, or one before the day received or after today, in the org's
//                            zone
//   note_too_long            a note over 2,000 characters
//   note_not_plain           a note with a control character other than the line break, or a
//                            bidirectional-formatting character
//   note_id_number           a note holding an NRIC- or FIN-shaped string (OD-16)
//   step_fields              a more-time date on anything but more time, a kind on anything but a
//                            reclassification or an outcome on anything but the closure, or a
//                            reclassification with no kind or a closure with no outcome (more time
//                            with no date is extension_range)
//   not_open                 the request is closed: only a note, or a PDPC review of a refused
//                            copy, is recorded on it
//   note_missing             a note step, or how identity was checked, with no note
//   identity_too_long        how identity was checked, over 500 characters
//   identity_not_one_line    how identity was checked, on more than one line
//   kind_same                a reclassification to the kind it is now
//   not_extendable           more time for anything but a copy or a correction
//   extension_range          more time to a day not after the current due day (or the day told),
//                            or more than 90 days after the day received
//   extension_told_late      more time told after the current due day (s21; PPL-04): a later notice
//                            is a note, so a late request never turns on time
//   review_not_refused_copy  a PDPC review started on anything but a copy closed as refused
//   review_open              a PDPC review started while one is open
//   review_none              a PDPC review ended with none open
//   refusal_kind             a refusal of a question, a complaint or a withdrawal
//   refusal_why              a refusal with no note saying why
//   logged_in_error_form     a request sent in Hearth closed as logged in error
//   identity_first           a copy or a correction closed as answered before identity is checked
//                            (PD-91)
// The page offers only the steps none of these refuses (stepsAllowed()); the function decides
// against the request it locks.
export const STEP_PROBLEMS = [
  'too_many_steps',
  'day_range',
  'note_too_long',
  'note_not_plain',
  'note_id_number',
  'step_fields',
  'not_open',
  'note_missing',
  'identity_too_long',
  'identity_not_one_line',
  'kind_same',
  'not_extendable',
  'extension_range',
  'extension_told_late',
  'review_not_refused_copy',
  'review_open',
  'review_none',
  'refusal_kind',
  'refusal_why',
  'logged_in_error_form',
  'identity_first',
] as const
export type StepProblem = (typeof STEP_PROBLEMS)[number]

// A step as the sheet holds it, with add_case_step()'s arguments.
export interface StepDraft {
  step: StepInput
  onDay: string | null
  note: string | null
  extendedTo: string | null
  kind: CaseKind | null
  outcome: Outcome | null
}

// The request as the sheet read it (CaseDetail has every field): its kind now, how it came, the
// day received, the current due day (null once closed, or not known), its revision (its steps,
// plus one once closed), its closure, whether identity has been checked and whether a PDPC review
// is open.
export interface StepCase {
  kind: CaseKind
  cameBy: CameBy
  receivedOn: string
  dueOn: string | null
  revision: number
  closedOn: string | null
  closedKind: CaseKind | null
  outcome: Outcome | null
  identityChecked: boolean
  reviewOpen: boolean
}

// What holds a step back, in STEP_PROBLEMS order, against the request the sheet read. today is the
// org's, in its time zone, YYYY-MM-DD. The note is read as add_case_step() reads it (caseText()).
export function stepProblems(draft: StepDraft, kase: StepCase, today: string): StepProblem[] {
  const found = new Set<StepProblem>()
  const note = caseText(draft.note)
  const closed = kase.closedOn !== null
  const steps = kase.revision - (closed ? 1 : 0)
  if (note !== null) {
    if (codePoints(note) > CASE_NOTE_MAX) found.add('note_too_long')
    if (!plainLines(note)) found.add('note_not_plain')
    if (ID_NUMBER_SHAPE.test(note)) found.add('note_id_number')
  }
  if (!isDay(draft.onDay) || draft.onDay < kase.receivedOn || draft.onDay > today) found.add('day_range')
  // A field on a step that doesn't take it, then a kind or an outcome missing where it is taken, as
  // add_case_step() refuses them; more time with no date is a date out of range, as there.
  if (
    (draft.extendedTo !== null && draft.step !== 'extended') ||
    (draft.kind !== null) !== (draft.step === 'reclassified') ||
    (draft.outcome !== null) !== (draft.step === 'closed')
  ) {
    found.add('step_fields')
  }
  switch (draft.step) {
    case 'closed':
      if (closed) found.add('not_open')
      if (draft.outcome === 'answered' && isIn(IDENTITY_KINDS, kase.kind) && !kase.identityChecked) {
        found.add('identity_first')
      }
      if (draft.outcome === 'refused') {
        if (!isIn(REFUSABLE_KINDS, kase.kind)) found.add('refusal_kind')
        if (note === null) found.add('refusal_why')
      }
      if (draft.outcome === 'logged_in_error' && kase.cameBy === 'hearth') found.add('logged_in_error_form')
      break
    case 'note':
      if (note === null) found.add('note_missing')
      break
    case 'review_started':
      if (!(closed && kase.outcome === 'refused' && kase.closedKind === 'access')) found.add('review_not_refused_copy')
      if (kase.reviewOpen) found.add('review_open')
      break
    case 'review_ended':
      if (!kase.reviewOpen) found.add('review_none')
      break
    default: {
      if (closed) found.add('not_open')
      if (draft.step === 'identity_checked') {
        if (note === null) found.add('note_missing')
        else {
          if (codePoints(note) > CASE_IDENTITY_NOTE_MAX) found.add('identity_too_long')
          if (note.includes('\n')) found.add('identity_not_one_line')
        }
      }
      if (draft.step === 'reclassified' && draft.kind === kase.kind) found.add('kind_same')
      if (draft.step === 'extended') {
        if (!isIn(EXTENDABLE_KINDS, kase.kind)) found.add('not_extendable')
        const to = draft.extendedTo
        if (
          !isDay(to) ||
          (kase.dueOn !== null && to <= kase.dueOn) ||
          (isDay(draft.onDay) && to <= draft.onDay) ||
          to > shiftDay(kase.receivedOn, CASE_EXTENSION_MAX_DAYS)
        ) {
          found.add('extension_range')
        }
        if (kase.dueOn !== null && isDay(draft.onDay) && draft.onDay > kase.dueOn) found.add('extension_told_late')
      }
    }
  }
  if (draft.step !== 'closed' && steps >= CASE_STEPS_MAX) found.add('too_many_steps')
  return STEP_PROBLEMS.filter(problem => found.has(problem))
}

const isIn = (kinds: readonly CaseKind[], kind: CaseKind) => kinds.includes(kind)

// The steps the sheet offers for a request: each one stepProblems() wouldn't refuse for its own
// sake, whatever is typed (the day, the note and the fields are the form's to fill).
export function stepsAllowed(kase: StepCase): StepInput[] {
  const closed = kase.closedOn !== null
  const steps = kase.revision - (closed ? 1 : 0)
  return STEP_INPUTS.filter(step => {
    if (step !== 'closed' && steps >= CASE_STEPS_MAX) return false
    switch (step) {
      case 'note':
        return true
      case 'review_started':
        return closed && kase.outcome === 'refused' && kase.closedKind === 'access' && !kase.reviewOpen
      case 'review_ended':
        return kase.reviewOpen
      case 'extended':
        return !closed && isIn(EXTENDABLE_KINDS, kase.kind)
      default:
        return !closed
    }
  })
}

// --- The api: bodies (apps/server/src/compliance/cases.ts) ---------------------------------------

// Text people type, through caseText(): CRLF read as LF, trimmed, null when blank. The bounds are
// generous (UTF-16 units, several times the column's), so a long text is a problem the page words,
// never a malformed body.
const typed = (max: number) => z.string().max(max).transform(caseText)
const typedOrNull = (max: number) => z.string().max(max).nullable().transform(caseText)
// A whole number of steps (a revision), within Postgres's integer.
const Revision = z.int().min(0).max(2_147_483_647)

// POST /api/requests/send (case.send_own): what it's about, what they wrote (null, or blank, only
// for a copy of their data), and the client key made when the sheet opened, so a resend after a
// lost answer returns the first case (PD-96). The requester is the session's person, never the
// body's; no reply address is taken (PD-96).
export const SendRequestBody = z.strictObject({
  kind: z.enum(CASE_KINDS),
  details: typedOrNull(20_000),
  key: LowerUuid,
})
export type SendRequestJSON = z.input<typeof SendRequestBody>

// Who sent a logged request: a person of the organisation, current or former, by id, with one
// channel and its address together or neither (required once they have left, which the function
// decides: PPL-01); or someone without a Hearth account, by name, with one channel and its address
// (OD-16).
const PersonRequesterBody = z
  .strictObject({
    type: z.literal('person'),
    person: LowerUuid,
    channel: z.enum(REQUESTER_CHANNELS).optional(),
    contact: typed(2000).optional(),
  })
  .refine(requester => (requester.channel === undefined) === (requester.contact === undefined), {
    message: 'a channel and its address together, or neither (C0.9 PPL-01)',
  })
const OutsideRequesterBody = z.strictObject({
  type: z.literal('outside'),
  name: typed(1000),
  channel: z.enum(REQUESTER_CHANNELS),
  contact: typed(2000),
})

// POST /api/admin/requests/log (case.log): what it's about, how it came, the day received, who sent
// it, the DPO's summary of what they want, and the client key made when the dialog opened. No
// identity note: that is a step (PPL-14). The DPO comes from the session; the route runs
// logProblems() before the function decides.
export const LogRequestBody = z.strictObject({
  kind: z.enum(CASE_KINDS),
  cameBy: z.enum(LOGGED_CAME_BY),
  receivedOn: Day,
  requester: z.discriminatedUnion('type', [PersonRequesterBody, OutsideRequesterBody]),
  details: typed(20_000),
  key: LowerUuid,
})
export type LogRequestJSON = z.input<typeof LogRequestBody>

// POST /api/admin/requests/step (case.step): the request, the revision the sheet showed, the step,
// the day it happened, the note (null or blank for none), and exactly the fields the step takes: a
// new date for more time, the kind now for a reclassification, an outcome for the closure.
export const CaseStepBody = z
  .strictObject({
    case: LowerUuid,
    seen: Revision,
    step: z.enum(STEP_INPUTS),
    onDay: Day,
    note: typedOrNull(10_000),
    extendedTo: Day.nullable(),
    kind: z.enum(CASE_KINDS).nullable(),
    outcome: z.enum(OUTCOMES).nullable(),
  })
  .refine(
    body =>
      (body.extendedTo !== null) === (body.step === 'extended') &&
      (body.kind !== null) === (body.step === 'reclassified') &&
      (body.outcome !== null) === (body.step === 'closed'),
    { message: 'exactly the fields the step takes (C0.9 PD-91)' },
  )
export type AddCaseStepJSON = z.input<typeof CaseStepBody>

// --- The api: answers ---------------------------------------------------------------------------

// A reference as stored, and as the web app reads one (P6: any case, with or without its hyphen).
const Reference = z.string().regex(CASE_REFERENCE_PATTERN)
const ReferenceForClient = z.string().transform((text, context): CaseReference => {
  const reference = parseCaseReference(text)
  if (reference === null) {
    context.addIssue({ code: 'custom', message: 'a case reference (C0.9 PD-104)' })
    return z.NEVER
  }
  return reference
})

// departments.name holds 1 to 100 characters (0002's check), which Postgres counts in code points.
const DepartmentName = z
  .string()
  .min(1)
  .refine(name => codePoints(name) <= 100, { message: 'at most 100 characters' })

// An address as stored: trimmed and bounded (the shape is checked with its channel).
const Contact = z
  .string()
  .min(1)
  .refine(text => codePoints(text) <= 500, { message: 'at most 500 characters' })
const channelled = (requester: { channel: RequesterChannel | null; contact: string | null }) =>
  requester.channel === null
    ? requester.contact === null
    : requester.contact !== null && contactInShape(requester.channel, requester.contact)
const CHANNELLED = { message: 'a channel with its address in that channel’s shape, or neither' }

// The day received, the day due and the outcome of a request in any list: open ones have a due day
// and no closure; closed ones a closing day and an outcome, and no due day.
const OPEN_OR_CLOSED = { message: 'an open request has a due day; a closed one its day and outcome, and no due day' }

// POST /api/requests/send's answer: the case, its reference, the day received and the day the reply
// is due, both in the org's zone, and whether this request recorded it (a resend from the same
// sheet records nothing and answers the first case).
export const SendRequestResponse = z.strictObject({
  case: LowerUuid,
  reference: Reference,
  receivedOn: Day,
  dueOn: Day,
  changed: z.boolean(),
})
export type SendRequestResponseJSON = z.infer<typeof SendRequestResponse>
export const SendRequestResponseForClient = z.object({
  case: LowerUuid,
  reference: ReferenceForClient,
  receivedOn: Day,
  dueOn: Day,
  changed: z.boolean().catch(true),
})
export type SendRequestResponseForClientJSON = z.infer<typeof SendRequestResponseForClient>

// POST /api/admin/requests/log's answer: the case, its reference, the day due, and whether this
// request recorded it.
export const LogRequestResponse = z.strictObject({
  case: LowerUuid,
  reference: Reference,
  dueOn: Day,
  changed: z.boolean(),
})
export type LogRequestResponseJSON = z.infer<typeof LogRequestResponse>
export const LogRequestResponseForClient = z.object({
  case: LowerUuid,
  reference: ReferenceForClient,
  dueOn: Day,
  changed: z.boolean().catch(true),
})

// POST /api/admin/requests/step's answer: the request's revision after the step or the closure.
export const CaseStepResponse = z.strictObject({
  revision: z
    .int()
    .min(1)
    .max(CASE_STEPS_MAX + 1),
})
export type CaseStepResponseJSON = z.infer<typeof CaseStepResponse>
export const CaseStepResponseForClient = z.object({ revision: z.int().min(1) })

// One of your requests (GET /api/requests, read_own_cases(), PD-97): its kind now, reference, how
// it came, the day received, its state, the day the reply is due while open, the day the DPO last
// replied and whether that reply was on time (PD-112), and the day it closed. Never your words, the
// DPO's notes, the steps or the outcome, and never a request closed as logged in error.
const myRequest = {
  id: LowerUuid,
  reference: Reference,
  kind: z.enum(CASE_KINDS),
  cameBy: z.enum(CAME_BY),
  receivedOn: Day,
  state: z.enum(MY_STATES),
  dueOn: Day.nullable(),
  repliedOn: Day.nullable(),
  repliedInTime: z.boolean(),
  closedOn: Day.nullable(),
}
const MyRequest = z
  .strictObject(myRequest)
  .refine(
    row => (row.state === 'closed') === (row.closedOn !== null) && (row.closedOn === null) === (row.dueOn !== null),
    OPEN_OR_CLOSED,
  )
  .refine(row => !row.repliedInTime || row.repliedOn !== null, { message: 'a reply on time has its day' })
export type MyRequestJSON = z.infer<typeof MyRequest>

// GET /api/requests (case.list_own): today in the org's zone; your requests, open first by due day,
// then closed, newest received, at most CASE_MINE_MAX, with more when there were others; and how
// many of yours are open, which the form reads for its cap (CASE_OPEN_PER_REQUESTER_MAX).
export const MyRequestsResponse = z.strictObject({
  today: Day,
  requests: z.array(MyRequest).max(CASE_MINE_MAX),
  more: z.boolean(),
  open: z.int().min(0).max(IDS_NUMBER_MAX),
})
export type MyRequestsJSON = z.infer<typeof MyRequestsResponse>

// Who sent a request, as the queue shows it: a person, by roster name and department and whether
// they have left; or someone without an account, by name. Never an address or a person's id.
const QueueRequester = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('person'),
    name: PersonName,
    department: DepartmentName.nullable(),
    left: z.boolean(),
  }),
  z.strictObject({ type: z.literal('outside'), name: PersonName }),
])

// A request in the DPO's queue (read_cases(), PD-98): its kind now, reference, how it came, the day
// received, the due day while open, the day the DPO last replied and whether on time (PD-112), its
// revision, its state, who sent it, and once closed its day and outcome. Never the words.
const queueRow = {
  id: LowerUuid,
  reference: Reference,
  kind: z.enum(CASE_KINDS),
  cameBy: z.enum(CAME_BY),
  receivedOn: Day,
  dueOn: Day.nullable(),
  repliedOn: Day.nullable(),
  repliedInTime: z.boolean(),
  revision: z
    .int()
    .min(0)
    .max(CASE_STEPS_MAX + 1),
  state: z.enum(CASE_STATES),
  requester: QueueRequester,
  closedOn: Day.nullable(),
  outcome: z.enum(OUTCOMES).nullable(),
}
const openOrClosed = (row: {
  state: CaseState
  dueOn: string | null
  closedOn: string | null
  outcome?: Outcome | null
}) =>
  (row.state === 'closed') === (row.closedOn !== null) &&
  (row.closedOn === null) === (row.dueOn !== null) &&
  (row.outcome === undefined || (row.outcome === null) === (row.closedOn === null))
const QueueRow = z
  .strictObject(queueRow)
  .refine(openOrClosed, OPEN_OR_CLOSED)
  .refine(row => !row.repliedInTime || row.repliedOn !== null, { message: 'a reply on time has its day' })
export type QueueRowJSON = z.infer<typeof QueueRow>

// GET /api/admin/requests (case.read): today in the org's zone; the open requests, soonest due
// first, at most CASE_QUEUE_OPEN_MAX, with how many are open in all; and the most recently closed,
// at most CASE_QUEUE_CLOSED_MAX, with closedMore when there were others.
export const RequestQueueResponse = z
  .strictObject({
    today: Day,
    open: z.array(QueueRow).max(CASE_QUEUE_OPEN_MAX),
    openTotal: z.int().min(0).max(IDS_NUMBER_MAX),
    closed: z.array(QueueRow).max(CASE_QUEUE_CLOSED_MAX),
    closedMore: z.boolean(),
  })
  .refine(answer => answer.open.length <= answer.openTotal, { message: 'more open rows than open requests' })
  .refine(answer => answer.open.every(row => row.closedOn === null), { message: 'a closed request in the open list' })
  .refine(answer => answer.closed.every(row => row.closedOn !== null), {
    message: 'an open request in the closed list',
  })
export type RequestQueueJSON = z.infer<typeof RequestQueueResponse>

// Who sent a request, on its sheet (read_case(), PPL-01, PPL-07): a person, by id (for a
// break-glass citation), roster name, department and manager, the day they left in the org's zone,
// and the channel and address the case records for them, if any; or someone without an account, by
// name, with their channel and address. Only the DPO reads this.
const CaseRequester = z.discriminatedUnion('type', [
  z
    .strictObject({
      type: z.literal('person'),
      person: LowerUuid,
      name: PersonName,
      department: DepartmentName.nullable(),
      manager: PersonName.nullable(),
      leftOn: Day.nullable(),
      channel: z.enum(REQUESTER_CHANNELS).nullable(),
      contact: Contact.nullable(),
    })
    .refine(channelled, CHANNELLED),
  z
    .strictObject({
      type: z.literal('outside'),
      name: PersonName,
      channel: z.enum(REQUESTER_CHANNELS),
      contact: Contact,
    })
    .refine(channelled, CHANNELLED),
])

// One request on its sheet (read_case()): everything on its row, its kind now and the kind it came
// as, the day it was logged and by whom, the due day while open, the day the DPO last replied and
// whether on time, its revision and state, whether identity has been checked and a PDPC review is
// open, and its closure (the day, the kind it was closed as, the outcome, the note and who). The
// words are the requester's own (sent in Hearth) or the DPO's summary (logged), and only the DPO
// reads them (OD-14).
const caseDetail = {
  id: LowerUuid,
  reference: Reference,
  kind: z.enum(CASE_KINDS),
  receivedKind: z.enum(CASE_KINDS),
  cameBy: z.enum(CAME_BY),
  receivedOn: Day,
  loggedOn: Day,
  loggedBy: PersonName.nullable(),
  requester: CaseRequester,
  details: z
    .string()
    .min(1)
    .refine(text => codePoints(text) <= CASE_DETAILS_MAX, { message: `at most ${CASE_DETAILS_MAX} characters` })
    .nullable(),
  dueOn: Day.nullable(),
  repliedOn: Day.nullable(),
  repliedInTime: z.boolean(),
  revision: z
    .int()
    .min(0)
    .max(CASE_STEPS_MAX + 1),
  state: z.enum(CASE_STATES),
  identityChecked: z.boolean(),
  reviewOpen: z.boolean(),
  closedOn: Day.nullable(),
  closedKind: z.enum(CASE_KINDS).nullable(),
  outcome: z.enum(OUTCOMES).nullable(),
  closedNote: z
    .string()
    .min(1)
    .refine(text => codePoints(text) <= CASE_NOTE_MAX, { message: `at most ${CASE_NOTE_MAX} characters` })
    .nullable(),
  closedBy: PersonName.nullable(),
}
// A closure is written all together, once (0012's cases_closed), and an open request has a due day.
const closedTogether = (row: {
  state: CaseState
  dueOn: string | null
  closedOn: string | null
  closedKind: CaseKind | null
  outcome: Outcome | null
  closedNote: string | null
  closedBy: string | null
}) =>
  (row.state === 'closed') === (row.closedOn !== null) &&
  (row.closedOn === null) === (row.closedKind === null) &&
  (row.closedOn === null) === (row.outcome === null) &&
  (row.closedOn !== null || (row.dueOn !== null && row.closedNote === null && row.closedBy === null))
const CLOSED_TOGETHER = { message: 'a closure all together, and a due day while open' }
const CaseDetail = z
  .strictObject(caseDetail)
  .refine(closedTogether, CLOSED_TOGETHER)
  .refine(row => !row.repliedInTime || row.repliedOn !== null, { message: 'a reply on time has its day' })
  .refine(row => row.details !== null || (row.cameBy === 'hearth' && row.receivedKind === 'access'), {
    message: 'only a copy of their data sent in Hearth comes with nothing written',
  })
export type CaseDetailJSON = z.infer<typeof CaseDetail>

// One step on a request's sheet (read_case_steps()), by number: the step, the day it happened, its
// note, a more-time date, the kind it was reclassified to, the day it was recorded and by whom.
const caseStep = {
  number: z.int().min(1).max(CASE_STEPS_MAX),
  step: z.enum(CASE_STEPS),
  onDay: Day,
  note: z
    .string()
    .min(1)
    .refine(text => codePoints(text) <= CASE_NOTE_MAX, { message: `at most ${CASE_NOTE_MAX} characters` })
    .nullable(),
  extendedTo: Day.nullable(),
  kind: z.enum(CASE_KINDS).nullable(),
  recordedOn: Day,
  recordedBy: PersonName.nullable(),
}
const CaseStep = z
  .strictObject(caseStep)
  .refine(
    row =>
      (row.extendedTo !== null) === (row.step === 'extended') && (row.kind !== null) === (row.step === 'reclassified'),
    { message: 'a more-time date only on more time, and a kind only on a reclassification' },
  )
export type CaseStepRowJSON = z.infer<typeof CaseStep>

// Another request from the same person (read_case_others(), PPL-07), in any state, closed as logged
// in error included: its kind now, reference, how it came, the day received, its state, the due day
// while open, whether a reply was on time, and once closed its day and outcome.
const otherCase = {
  id: LowerUuid,
  reference: Reference,
  kind: z.enum(CASE_KINDS),
  cameBy: z.enum(CAME_BY),
  receivedOn: Day,
  state: z.enum(CASE_STATES),
  dueOn: Day.nullable(),
  repliedInTime: z.boolean(),
  closedOn: Day.nullable(),
  outcome: z.enum(OUTCOMES).nullable(),
}
const OtherCase = z.strictObject(otherCase).refine(openOrClosed, OPEN_OR_CLOSED)
export type OtherCaseJSON = z.infer<typeof OtherCase>

// The longest withdrawal reply the sheet carries (withdrawalReply(), notice-text.ts): far more than
// every purpose's line.
export const CASE_REPLY_MAX = 20_000

// GET /api/admin/requests/:case (case.read): today in the org's zone; the request; its steps,
// oldest first; the same person's other requests, open first, at most CASE_OTHERS_MAX, with
// othersMore when there were others (none for someone without an account); and, for a withdrawal by
// its kind now once a version is published, the reply the DPO may copy (PD-105), else null.
export const CaseResponse = z
  .strictObject({
    today: Day,
    case: CaseDetail,
    steps: z.array(CaseStep).max(CASE_STEPS_MAX),
    others: z.array(OtherCase).max(CASE_OTHERS_MAX),
    othersMore: z.boolean(),
    reply: z.string().min(1).max(CASE_REPLY_MAX).nullable(),
  })
  .refine(answer => answer.reply === null || answer.case.kind === 'withdrawal', {
    message: 'a reply only for a withdrawal (C0.9 PD-105)',
  })
  .refine(answer => answer.case.requester.type === 'person' || (answer.others.length === 0 && !answer.othersMore), {
    message: 'other requests only for a person at the organisation',
  })
export type CaseResponseJSON = z.infer<typeof CaseResponse>

// GET /api/admin/requests/people (case.read): every person of the organisation but you, current and
// former, current first and then by name, by name, department, manager, the day they were added and
// the day they left (in the org's zone), at most CASE_PEOPLE_MAX, with more when there were others.
// Roster facts only: never a number, a device, a role or a standing.
const casePerson = {
  id: LowerUuid,
  name: PersonName,
  department: DepartmentName.nullable(),
  manager: PersonName.nullable(),
  addedOn: Day,
  leftOn: Day.nullable(),
}
export const CasePeopleResponse = z.strictObject({
  people: z.array(z.strictObject(casePerson)).max(CASE_PEOPLE_MAX),
  more: z.boolean(),
})
export type CasePeopleJSON = z.infer<typeof CasePeopleResponse>
export type CasePersonJSON = CasePeopleJSON['people'][number]

// --- The web app's readers (P6) ------------------------------------------------------------------

// A list as the web app reads it, saying when rows were dropped: unlike readableRows() (notice.ts,
// registers.ts), an unreadable row or one past the cap marks the list incomplete, so the queue never
// says "No open requests." when it couldn't read them; a list that can't be read at all reads as
// empty and incomplete.
export interface ListedRows<T> {
  rows: T[]
  complete: boolean
}
export function listedRows<T extends z.ZodType>(row: T, max: number) {
  return z
    .unknown()
    .optional()
    .transform((value): ListedRows<z.output<T>> => {
      if (!Array.isArray(value)) return { rows: [], complete: false }
      const rows: z.output<T>[] = []
      let complete = value.length <= max
      for (const item of value.slice(0, max)) {
        const read = row.safeParse(item)
        if (read.success) rows.push(read.data)
        else complete = false
      }
      return { rows, complete }
    })
}

// A name or department the web app can't read shows as nobody's, never as a failed row.
const nameForClient = PersonName.nullable().catch(null)
const departmentForClient = DepartmentName.nullable().catch(null)

// The rows as the web app reads them: fields added later are dropped; the fields a row is worded
// from are read as the strict schema reads them, so a row the page can't word truthfully is left
// out (and the list marked incomplete), never shown wrong.
const MyRequestReader = z
  .object({ ...myRequest, reference: ReferenceForClient })
  .refine(
    row => (row.state === 'closed') === (row.closedOn !== null) && (row.closedOn === null) === (row.dueOn !== null),
    OPEN_OR_CLOSED,
  )
  .refine(row => !row.repliedInTime || row.repliedOn !== null, { message: 'a reply on time has its day' })
export type MyRequestForClient = z.infer<typeof MyRequestReader>

// GET /api/requests, as the web app reads it: more reads true when unreadable (the safer reading),
// and an open count it can't read is null, so the form shows its rows and the server is the
// backstop for the cap.
export const MyRequestsResponseForClient = z.object({
  today: Day,
  requests: listedRows(MyRequestReader, CASE_MINE_MAX),
  more: z.boolean().catch(true),
  open: z.int().min(0).nullable().catch(null),
})
export type MyRequestsForClient = z.infer<typeof MyRequestsResponseForClient>

const QueueRequesterForClient = z.discriminatedUnion('type', [
  z.object({ type: z.literal('person'), name: PersonName, department: departmentForClient, left: z.boolean() }),
  z.object({ type: z.literal('outside'), name: PersonName }),
])
const QueueRowReader = z
  .object({ ...queueRow, reference: ReferenceForClient, revision: z.int().min(0), requester: QueueRequesterForClient })
  .refine(openOrClosed, OPEN_OR_CLOSED)
  .refine(row => !row.repliedInTime || row.repliedOn !== null, { message: 'a reply on time has its day' })
export type QueueRowForClient = z.infer<typeof QueueRowReader>

// GET /api/admin/requests, as the web app reads it: each list says whether it is complete; a total
// it can't read is null; closedMore reads true when unreadable.
export const RequestQueueResponseForClient = z.object({
  today: Day,
  open: listedRows(QueueRowReader, CASE_QUEUE_OPEN_MAX),
  openTotal: z.int().min(0).nullable().catch(null),
  closed: listedRows(QueueRowReader, CASE_QUEUE_CLOSED_MAX),
  closedMore: z.boolean().catch(true),
})
export type RequestQueueForClient = z.infer<typeof RequestQueueResponseForClient>

const CaseRequesterForClient = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('person'),
      person: LowerUuid,
      name: PersonName,
      department: departmentForClient,
      manager: nameForClient,
      leftOn: Day.nullable(),
      channel: z.enum(REQUESTER_CHANNELS).nullable(),
      contact: Contact.nullable(),
    })
    .refine(channelled, CHANNELLED),
  z
    .object({ type: z.literal('outside'), name: PersonName, channel: z.enum(REQUESTER_CHANNELS), contact: Contact })
    .refine(channelled, CHANNELLED),
])
const CaseDetailReader = z
  .object({
    ...caseDetail,
    reference: ReferenceForClient,
    loggedBy: nameForClient,
    closedBy: nameForClient,
    revision: z.int().min(0),
    requester: CaseRequesterForClient,
  })
  .refine(closedTogether, CLOSED_TOGETHER)
  .refine(row => !row.repliedInTime || row.repliedOn !== null, { message: 'a reply on time has its day' })
export type CaseDetailForClient = z.infer<typeof CaseDetailReader>

// GET /api/admin/requests/:case, as the web app reads it: a request it can't read fails the read,
// so the sheet shows the server's words with Try again, never a wrong request; steps and other
// requests say whether they are complete; othersMore reads true when unreadable; a reply it can't
// read is null, so no block is offered.
export const CaseResponseForClient = z.object({
  today: Day,
  case: CaseDetailReader,
  steps: listedRows(z.object({ ...caseStep, recordedBy: nameForClient }), CASE_STEPS_MAX),
  others: listedRows(
    z.object({ ...otherCase, reference: ReferenceForClient }).refine(openOrClosed, OPEN_OR_CLOSED),
    CASE_OTHERS_MAX,
  ),
  othersMore: z.boolean().catch(true),
  reply: z.string().min(1).max(CASE_REPLY_MAX).nullable().catch(null),
})
export type CaseForClient = z.infer<typeof CaseResponseForClient>
export type CaseStepForClient = CaseForClient['steps']['rows'][number]
export type OtherCaseForClient = CaseForClient['others']['rows'][number]

// GET /api/admin/requests/people, as the web app reads it: a person it can't read (one it couldn't
// name or post back) is left out and the list marked incomplete; a department or manager it can't
// read shows as none; more reads true when unreadable.
export const CasePeopleResponseForClient = z.object({
  people: listedRows(
    z.object({ ...casePerson, department: departmentForClient, manager: nameForClient }),
    CASE_PEOPLE_MAX,
  ),
  more: z.boolean().catch(true),
})
export type CasePeopleForClient = z.infer<typeof CasePeopleResponseForClient>
export type CasePersonForClient = CasePeopleForClient['people']['rows'][number]
