// Settings › Privacy's requests to the Data Protection Officer, pure (PDPA-04, PDPA-13; C0.9 OD-07,
// OD-12, OD-13, OD-15, PD-96, PD-97, PD-112): the kinds the form offers, the target line a sheet
// shows, the sheet's states and what each says, the confirmation once a request lands, and the rows
// of "Your requests", so every state is tested in Node with no DOM (settings/requests-model.test.ts,
// RQW-01 to RQW-05). The rules are packages/shared's (requestProblems, which the route runs before
// submit_case() in 0012 and the function enforces again); this module only feeds them what the
// sheet would send and words their codes (strings/requests.ts). The days are the org's, as the
// server sent them, and "late" is decided from the answer's own today, never the browser's clock.
import {
  CALENDAR_KINDS,
  CASE_KINDS,
  CASE_OPEN_PER_REQUESTER_MAX,
  type CaseKind,
  type CaseReference,
  formatCaseReference,
  idNumberLikely,
  type MyRequestsForClient,
  type ReplyTargets,
  requestProblems,
  spelledReference,
} from '@hearth/shared'
import { dayText } from '@/lib/time.ts'
import { MY_STATE_LABELS, REQUEST_INTROS, REQUEST_KINDS, REQUEST_PROBLEMS, REQUESTS } from '@/strings/requests.ts'

// --- The kinds (RQW-01) --------------------------------------------------------------------------

// The six kinds, in OD-07's order, each a row of the form.
export const REQUEST_ROWS: readonly { readonly kind: CaseKind; readonly label: string }[] = CASE_KINDS.map(kind => ({
  kind,
  label: REQUEST_KINDS[kind],
}))

// --- The target line (RQW-02) --------------------------------------------------------------------

// The line saying when the DPO aims to reply, from the published version's targets (OD-08): days for
// a copy or a correction, business days for the rest. None when the latest version prints none (a
// stand-in, or a c09.1 or c09.2 version: null) or the answer couldn't be read (undefined): never an
// invented figure.
export function targetLine(kind: CaseKind, targets: ReplyTargets | null | undefined): string | undefined {
  if (targets === null || targets === undefined) return undefined
  return (CALENDAR_KINDS as readonly CaseKind[]).includes(kind)
    ? REQUESTS.targetCalendar(String(targets.calendarDays))
    : REQUESTS.targetBusiness(String(targets.businessDays))
}

// --- The sheet (RQW-03, RQW-04) ------------------------------------------------------------------

// What a request landed as: the case, its reference, the day the reply is due and whether this send
// recorded it (a resend from the same sheet answers the first case with changed false).
export interface SentRequest {
  readonly case: string
  readonly reference: CaseReference
  readonly dueOn: string
  readonly changed: boolean
}

// One sheet, from the moment a kind's row opens it until Done or a discard: the kind, the client key
// made as it opened (crypto.randomUUID()) and kept while it stays open, so a second Send after an
// unknown outcome records nothing new (PD-96), what is written, and where the send stands:
//   editing  nothing sent yet, or the last send failed (failure says why, and the text stays)
//   sending  a send in flight: Send is held
//   sent     it landed: the sheet's content is the confirmation (sent)
export interface RequestSheet {
  readonly kind: CaseKind
  readonly key: string
  readonly text: string
  readonly phase: 'editing' | 'sending' | 'sent'
  readonly failure: string | undefined
  readonly sent: SentRequest | undefined
}

export const openSheet = (kind: CaseKind, key: string): RequestSheet => ({
  kind,
  key,
  text: '',
  phase: 'editing',
  failure: undefined,
  sent: undefined,
})

export const withText = (sheet: RequestSheet, text: string): RequestSheet =>
  sheet.phase === 'editing' ? { ...sheet, text } : sheet

export const sendingSheet = (sheet: RequestSheet): RequestSheet => ({ ...sheet, phase: 'sending', failure: undefined })

export const sentSheet = (sheet: RequestSheet, sent: SentRequest): RequestSheet => ({
  ...sheet,
  phase: 'sent',
  failure: undefined,
  sent,
})

// A refused or lost send, as api/http.ts's ApiFailure carries it.
export interface SendFailure {
  readonly status: number
  readonly code: string
  readonly serverMessage: string
}

// Why a send didn't land, in the sheet's words: no answer, or one that couldn't be read (offline, a
// 5xx, a timeout), says the request may have arrived and that sending again won't send it twice;
// 409 try_again, to try again; 400 case_invalid, which the page's own checks didn't foresee, reads
// as the cap of open requests when the page couldn't rule it out (it couldn't read how many are
// open, or one more would reach the cap), else to reload; anything else, in the server's words (a
// 403 notice_required moves the tab to /notice, and a 401 ends the document, before this shows).
export function sendFailureText(failure: SendFailure, open: number | null | undefined): string {
  if (failure.status === 0 || failure.status >= 500 || failure.code === 'invalid_response') return REQUESTS.failed
  if (failure.code === 'try_again') return REQUESTS.tryAgain
  if (failure.code === 'case_invalid') {
    return open === null || open === undefined || open >= CASE_OPEN_PER_REQUESTER_MAX - 1
      ? REQUESTS.atCap
      : REQUESTS.other
  }
  if (failure.code === 'invalid_request') return REQUESTS.other
  return failure.serverMessage
}

export const failedSheet = (
  sheet: RequestSheet,
  failure: SendFailure,
  open: number | null | undefined,
): RequestSheet => ({
  ...sheet,
  phase: 'editing',
  failure: sendFailureText(failure, open),
})

// Closing a sheet with something written asks once before it is discarded: nothing is kept in
// browser storage (WS-01). A sheet whose request landed closes at once.
export const needsDiscard = (sheet: RequestSheet): boolean => sheet.phase !== 'sent' && sheet.text.trim() !== ''

// --- Drafts (the words a forced close would lose) ------------------------------------------------

// The sheets the browser closed with no discard decision, by kind: a close the page can't refuse
// (Chrome's second Escape without a click between, under its close-watcher rule, or Android's back
// gesture; ui/Dialog.tsx's forced close). Settings › Privacy's requests section holds them in its
// own state, in memory only (WS-01: never browser storage), so reopening the kind's row shows the
// words again, with the same key, so a send the close cut off still records at most one request
// (PD-96). A reload, leaving Settings or a new sign-in drops them, as it drops an open sheet.
export type Drafts = Readonly<Partial<Record<CaseKind, RequestSheet>>>

export const NO_DRAFTS: Drafts = {}

// The sheet a kind's row opens: its kept draft, else a new one with the key made as it opens.
export const sheetFor = (drafts: Drafts, kind: CaseKind, key: string): RequestSheet =>
  drafts[kind] ?? openSheet(kind, key)

// What Close, Escape or the browser's own close does to a sheet (RequestsSection.tsx's close()):
//   done          its request landed: as Done
//   set_aside     the browser closed it already (forced), with no decision: the section keeps it
//   discard       nothing written: it goes, with nothing to decide
//   keep_writing  the discard question is asked already: answered as Keep writing, never Discard
//   confirm       words written: the discard question
//   nothing       a send in flight: it stays open until the answer
export type CloseAction = 'done' | 'set_aside' | 'discard' | 'keep_writing' | 'confirm' | 'nothing'

export function closeAction(sheet: RequestSheet, forced: boolean, confirming: boolean): CloseAction {
  if (sheet.phase === 'sent' && sheet.sent !== undefined) return 'done'
  if (forced) return 'set_aside'
  if (!needsDiscard(sheet)) return 'discard'
  if (confirming) return 'keep_writing'
  return sheet.phase === 'editing' ? 'confirm' : 'nothing'
}

// How a sheet closed: done, after Done on its confirmation (the send was confirmed); discarded,
// after Discard, or a close with nothing written (nothing to decide about); forced, by the browser
// with no decision.
export type SheetClose = 'done' | 'discarded' | 'forced'

// The drafts once a sheet has closed. Done or a discard clears the kind's draft. A forced close
// keeps the sheet when it holds words, or a send whose answer it never saw (a copy of their data may
// send nothing, and its key is what makes sending again safe), back in editing: a send in flight
// can't land in a sheet that has gone, so the next Send, with the same key, finds out.
export function draftsAfter(drafts: Drafts, sheet: RequestSheet, close: SheetClose): Drafts {
  const unconfirmed = sheet.phase === 'sending' || sheet.failure !== undefined
  const keep = close === 'forced' && sheet.phase !== 'sent' && (sheet.text.trim() !== '' || unconfirmed)
  const kept: RequestSheet | undefined = keep ? { ...sheet, phase: 'editing' } : undefined
  return { ...drafts, [sheet.kind]: kept }
}

// The count shows from 3,600 characters, counted as Postgres counts them (code points).
export const COUNT_FROM = 3600

export interface SheetView {
  readonly title: string
  readonly intro: string
  readonly target: string | undefined
  readonly label: string
  // A copy of their data may be sent with nothing written.
  readonly optional: boolean
  // Lines under the box: the count from 3,600 characters, and the ID-number hint while the text
  // holds that shape (a hint, never a refusal: PD-102).
  readonly notes: readonly string[]
  // What's wrong with the text as written, shown on the field (never "write something" before a
  // word is typed: that is only Send's reason).
  readonly error: string | undefined
  // Why Send is held, as its description; undefined when it can send.
  readonly held: string | undefined
  readonly sentAs: string
}

export function sheetView(sheet: RequestSheet, name: string, targets: ReplyTargets | null | undefined): SheetView {
  const problems = requestProblems({ kind: sheet.kind, details: sheet.text })
  const length = [...sheet.text].length
  const notes = [
    ...(length >= COUNT_FROM ? [REQUESTS.count(length.toLocaleString('en-GB'))] : []),
    ...(idNumberLikely(sheet.text) ? [REQUESTS.idHint] : []),
  ]
  const shown = problems.filter(problem => problem !== 'details_missing')
  return {
    title: REQUEST_KINDS[sheet.kind],
    intro: REQUEST_INTROS[sheet.kind],
    target: targetLine(sheet.kind, targets),
    label: sheet.kind === 'access' ? REQUESTS.fieldOptional : REQUESTS.field,
    optional: sheet.kind === 'access',
    notes,
    error: shown.length === 0 ? undefined : shown.map(problem => REQUEST_PROBLEMS[problem]).join(' '),
    held:
      sheet.phase === 'sending'
        ? REQUESTS.sending
        : problems.length > 0
          ? REQUEST_PROBLEMS[problems[0] ?? 'details_missing']
          : undefined,
    sentAs: REQUESTS.sentAs(name),
  }
}

// The confirmation, in order: that it was sent (or, for a resend the server had already recorded,
// that it was sent already), the due day the server answered, the reference to quote, and where to
// follow it. Nothing says the DPO was told or alerted (OD-22).
export function confirmationLines(sent: SentRequest): readonly string[] {
  return [
    sent.changed ? REQUESTS.sent : REQUESTS.sentAlready,
    REQUESTS.due(dayText(sent.dueOn)),
    REQUESTS.reference(formatCaseReference(sent.reference)),
    REQUESTS.follow,
  ]
}

// The body POST /api/requests/send takes: the kind, what was written (blank reads as none, which only
// a copy of their data may send) and the sheet's key. The requester is the session's person, never
// the body's.
export const sendBodyOf = (sheet: RequestSheet) => ({
  kind: sheet.kind,
  details: sheet.text.trim() === '' ? null : sheet.text,
  key: sheet.key,
})

// --- "Your requests" (RQW-05) --------------------------------------------------------------------

export interface RequestRow {
  readonly id: string
  readonly kind: string
  readonly state: string
  readonly reference: string
  readonly referenceLabel: string
  readonly cameBy: string
  readonly days: string
  // The DPO's latest reply, so the requester knows to look outside Hearth.
  readonly replied: string | undefined
  // Open past its due day with no reply on time (PD-112): the line, and what to do when no reply is
  // recorded at all.
  readonly late: { readonly line: string; readonly help: string | undefined } | undefined
}

type MyRequest = MyRequestsForClient['requests']['rows'][number]

export function requestRow(row: MyRequest, today: string): RequestRow {
  const late =
    row.closedOn === null && row.dueOn !== null && today > row.dueOn && !row.repliedInTime
      ? {
          line: REQUESTS.mine.late(dayText(row.dueOn)),
          help: row.repliedOn === null ? REQUESTS.mine.lateHelp : undefined,
        }
      : undefined
  return {
    id: row.id,
    kind: REQUEST_KINDS[row.kind],
    state: MY_STATE_LABELS[row.state],
    reference: formatCaseReference(row.reference),
    referenceLabel: REQUESTS.mine.referenceLabel(spelledReference(row.reference)),
    cameBy: REQUESTS.mine.cameBy[row.cameBy],
    days:
      row.closedOn !== null
        ? REQUESTS.mine.closed(dayText(row.receivedOn), dayText(row.closedOn))
        : REQUESTS.mine.open(dayText(row.receivedOn), dayText(row.dueOn ?? row.receivedOn)),
    replied: row.repliedOn === null ? undefined : REQUESTS.mine.replied(dayText(row.repliedOn)),
    late,
  }
}

// What "Your requests" shows: loading; unreadable (no answer, or nothing in it could be read); or the
// rows, with whether none exist (the same whether nothing was sent or nothing logged), whether some
// couldn't be read, and whether the list was cut at 50.
export type MineView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unreadable' }
  | {
      readonly kind: 'rows'
      readonly rows: readonly RequestRow[]
      readonly incomplete: boolean
      readonly cut: boolean
    }

export function mineView(answer: MyRequestsForClient | undefined, failed: boolean): MineView {
  if (answer === undefined) return failed ? { kind: 'unreadable' } : { kind: 'loading' }
  const { rows, complete } = answer.requests
  if (!complete && rows.length === 0) return { kind: 'unreadable' }
  return {
    kind: 'rows',
    rows: rows.map(row => requestRow(row, answer.today)),
    incomplete: !complete,
    cut: answer.more,
  }
}

// Whether the form shows the cap's line in place of the kinds: 10 open requests, as the answer
// counted them. An answer that couldn't be read leaves the kinds, and the server is the backstop.
export const atCap = (answer: MyRequestsForClient | undefined): boolean =>
  answer !== undefined && answer.open !== null && answer.open >= CASE_OPEN_PER_REQUESTER_MAX

// The id a row's element carries, so focus can land on the new row after Done.
export const requestRowId = (id: string): string => `request-${id}`
