// Settings › Privacy's requests to the Data Protection Officer, pure (settings/requests-model.ts;
// C0.9 OD-07, OD-15, OD-25, PD-96, PD-97, PD-102, PD-112): the kinds, the target line, the sheet's
// states, the confirmation and the rows of "Your requests", tested in Node with no DOM.
import { CASE_KINDS, MyRequestsResponseForClient, type ReplyTargets } from '@hearth/shared'
import { describe, expect, it } from 'vitest'
import { aiCopyIn } from '@/strings/ai-copy.ts'
import { REQUEST_KINDS, REQUEST_PROBLEMS, REQUESTS } from '@/strings/requests.ts'
import {
  atCap,
  COUNT_FROM,
  closeAction,
  confirmationLines,
  draftsAfter,
  failedSheet,
  mineView,
  NO_DRAFTS,
  needsDiscard,
  openSheet,
  REQUEST_ROWS,
  requestRow,
  sendBodyOf,
  sendFailureText,
  sendingSheet,
  sentSheet,
  sheetFor,
  sheetView,
  targetLine,
  withText,
} from './requests-model.ts'

const TARGETS: ReplyTargets = { businessDays: 7, calendarDays: 21 }
const KEY = 'd0000000-0000-4000-8000-000000000001'

const row = (change: Record<string, unknown> = {}) =>
  MyRequestsResponseForClient.parse({
    today: '2026-11-12',
    requests: [
      {
        id: 'c0000000-0000-4000-8000-000000000001',
        reference: 'K7QMX3TD',
        kind: 'complaint',
        cameBy: 'hearth',
        receivedOn: '2026-10-27',
        state: 'received',
        dueOn: '2026-11-10',
        repliedOn: null,
        repliedInTime: false,
        closedOn: null,
        ...change,
      },
    ],
    more: false,
    open: 1,
  })

describe('C0.9 PR 3b: the requests form and your requests (settings/requests-model.ts)', () => {
  it('RQW-01 OD-07: the six kinds in OD-07’s order, each with its label, none holding AI_COPY', () => {
    expect(REQUEST_ROWS.map(each => each.kind)).toEqual([...CASE_KINDS])
    expect(REQUEST_ROWS.map(each => each.label)).toEqual([
      'A question about my data',
      'A complaint',
      'A copy of my data',
      'Correct my data',
      'Withdraw consent',
      'Object to how my data is used',
    ])
    for (const each of REQUEST_ROWS) expect(aiCopyIn(each.label), each.kind).toBeUndefined()
  })

  it('RQW-02 OD-08 PD-95: the target line is business days for a question, a complaint, a withdrawal or an objection and calendar days for a copy or a correction, from the published version; none when it prints none or couldn’t be read', () => {
    for (const kind of ['question', 'complaint', 'withdrawal', 'objection'] as const) {
      expect(targetLine(kind, TARGETS), kind).toBe('The Data Protection Officer aims to reply within 7 business days.')
    }
    for (const kind of ['access', 'correction'] as const) {
      expect(targetLine(kind, TARGETS), kind).toBe('The Data Protection Officer aims to reply within 21 calendar days.')
    }
    for (const kind of CASE_KINDS) {
      expect(targetLine(kind, null), kind).toBeUndefined()
      expect(targetLine(kind, undefined), kind).toBeUndefined()
    }
  })

  it('RQW-03 PD-96 PD-102: the sheet goes editing → sending → sent, or back to editing with why; its key is made as it opens and kept across every retry; Send is held until something is written (a copy of their data may send nothing); an ID-number shape is a hint, never a refusal; the count shows from 3,600 characters', () => {
    const sheet = openSheet('complaint', KEY)
    expect(sheet).toMatchObject({ kind: 'complaint', key: KEY, text: '', phase: 'editing', failure: undefined })
    expect(sheetView(sheet, 'Marcus Lim', TARGETS).held).toBe(REQUEST_PROBLEMS.details_missing)
    // Nothing written: no error on the field, only Send's reason.
    expect(sheetView(sheet, 'Marcus Lim', TARGETS).error).toBeUndefined()
    expect(sheetView(openSheet('access', KEY), 'Marcus Lim', TARGETS).held).toBeUndefined()
    expect(needsDiscard(sheet)).toBe(false)
    expect(needsDiscard(withText(sheet, '   '))).toBe(false)

    const written = withText(sheet, 'The rota was shared with another team.')
    expect(sheetView(written, 'Marcus Lim', TARGETS)).toMatchObject({ held: undefined, error: undefined, notes: [] })
    expect(needsDiscard(written)).toBe(true)
    expect(sendBodyOf(written)).toEqual({ kind: 'complaint', details: written.text, key: KEY })
    expect(sendBodyOf(openSheet('access', KEY))).toEqual({ kind: 'access', details: null, key: KEY })

    // Sending holds Send; a failure goes back to editing with the text and the same key.
    const sending = sendingSheet(written)
    expect(sheetView(sending, 'Marcus Lim', TARGETS).held).toBe(REQUESTS.sending)
    expect(withText(sending, 'changed while sending')).toBe(sending)
    const failed = failedSheet(sending, { status: 0, code: 'network', serverMessage: 'x' }, 1)
    expect(failed).toMatchObject({ phase: 'editing', text: written.text, key: KEY, failure: REQUESTS.failed })
    expect(sendBodyOf(sendingSheet(failed)).key).toBe(KEY)
    expect(sendingSheet(failed).failure).toBeUndefined()

    // An ID-number shape is a hint, and Send still acts (PD-102).
    const id = sheetView(withText(sheet, 'My NRIC is S1234567D.'), 'Marcus Lim', TARGETS)
    expect(id.notes).toEqual([REQUESTS.idHint])
    expect(id.held).toBeUndefined()
    // The count, from 3,600 characters (code points), and the limit's error past 4,000.
    expect(sheetView(withText(sheet, 'a'.repeat(COUNT_FROM - 1)), 'M', TARGETS).notes).toEqual([])
    expect(sheetView(withText(sheet, 'a'.repeat(COUNT_FROM)), 'M', TARGETS).notes).toEqual([
      '3,600 of 4,000 characters',
    ])
    const long = sheetView(withText(sheet, '😀'.repeat(4001)), 'M', TARGETS)
    expect(long.error).toBe('Keep it to 4,000 characters.')
    expect(long.held).toBe('Keep it to 4,000 characters.')
    expect(sheetView(withText(sheet, `a${String.fromCodePoint(0x202e)}b`), 'M', TARGETS).error).toBe(
      'Use plain text, without special formatting characters.',
    )
    expect(sheetView(sheet, 'Marcus Lim', TARGETS).sentAs).toBe(
      'Sent as Marcus Lim. The Data Protection Officer may check it’s you before replying.',
    )
    // Once sent, closing needs no confirmation.
    const sent = sentSheet(written, {
      case: 'c0000000-0000-4000-8000-000000000009',
      reference: 'K7QMX3TD' as never,
      dueOn: '2026-11-10',
      changed: true,
    })
    expect(needsDiscard(sent)).toBe(false)
  })

  it('RQW-03 PD-96: why a send didn’t land: no answer or an unreadable one says it may have arrived and won’t be sent twice; try again; case_invalid reads as the cap when the page couldn’t rule it out, else to reload; anything else in the server’s words', () => {
    expect(sendFailureText({ status: 0, code: 'network', serverMessage: '' }, 3)).toBe(REQUESTS.failed)
    expect(sendFailureText({ status: 502, code: 'internal', serverMessage: '' }, 3)).toBe(REQUESTS.failed)
    expect(sendFailureText({ status: 200, code: 'invalid_response', serverMessage: '' }, 3)).toBe(REQUESTS.failed)
    expect(sendFailureText({ status: 409, code: 'try_again', serverMessage: '' }, 3)).toBe(REQUESTS.tryAgain)
    expect(sendFailureText({ status: 400, code: 'case_invalid', serverMessage: '' }, null)).toBe(REQUESTS.atCap)
    expect(sendFailureText({ status: 400, code: 'case_invalid', serverMessage: '' }, 9)).toBe(REQUESTS.atCap)
    expect(sendFailureText({ status: 400, code: 'case_invalid', serverMessage: '' }, 3)).toBe(REQUESTS.other)
    expect(sendFailureText({ status: 400, code: 'invalid_request', serverMessage: '' }, 3)).toBe(REQUESTS.other)
    expect(sendFailureText({ status: 403, code: 'forbidden', serverMessage: 'Not yours.' }, 3)).toBe('Not yours.')
  })

  it('RQW-03 X6: what Close, Escape or the browser’s own close does: a landed request closes as Done; a forced close sets the sheet aside, whatever its phase or the question; nothing written goes; with words written the question, and once it is asked Keep writing, never Discard; a send in flight stays open', () => {
    const empty = openSheet('complaint', KEY)
    const written = withText(empty, 'The rota was shared with another team.')
    const sending = sendingSheet(written)
    const landed = sentSheet(written, {
      case: 'c0000000-0000-4000-8000-000000000009',
      reference: 'K7QMX3TD' as never,
      dueOn: '2026-11-10',
      changed: true,
    })
    expect(closeAction(landed, false, false)).toBe('done')
    expect(closeAction(landed, true, false)).toBe('done')
    for (const sheet of [empty, written, sending]) {
      for (const confirming of [false, true]) {
        expect(closeAction(sheet, true, confirming), `${sheet.phase} ${String(confirming)}`).toBe('set_aside')
      }
    }
    expect(closeAction(empty, false, false)).toBe('discard')
    expect(closeAction(withText(empty, '  \n '), false, false)).toBe('discard')
    expect(closeAction(written, false, false)).toBe('confirm')
    expect(closeAction(written, false, true)).toBe('keep_writing')
    expect(closeAction(sending, false, false)).toBe('nothing')
  })

  it('RQW-03 PD-96 WS-01 lost words: a forced close keeps the sheet as its kind’s draft (words, or a send it never saw answered), back in editing with its key and why the last send failed; a forced close with nothing to keep, Done or a discard clears the kind’s draft; other kinds’ drafts stay; the row opens the draft, else a new sheet with the new key', () => {
    const written = withText(openSheet('complaint', KEY), 'The rota was shared with another team.')
    const other = 'd0000000-0000-4000-8000-000000000002'
    expect(NO_DRAFTS).toEqual({})
    expect(sheetFor(NO_DRAFTS, 'complaint', other)).toEqual(openSheet('complaint', other))

    // Words written: kept as they were.
    const kept = draftsAfter(NO_DRAFTS, written, 'forced')
    expect(kept.complaint).toEqual(written)
    expect(sheetFor(kept, 'complaint', other)).toEqual(written)
    expect(sheetFor(kept, 'question', other)).toEqual(openSheet('question', other))

    // A send cut off by the close: back in editing, the same key, so the next Send records it once.
    const inFlight = draftsAfter(NO_DRAFTS, sendingSheet(written), 'forced')
    expect(inFlight.complaint).toMatchObject({ phase: 'editing', key: KEY, text: written.text, failure: undefined })
    expect(sheetView(sheetFor(inFlight, 'complaint', other), 'M', TARGETS).held).toBeUndefined()
    // A failed send keeps why, and a copy of their data with nothing written keeps its key too.
    const lost = { status: 0, code: 'network', serverMessage: '' }
    const failed = failedSheet(sendingSheet(written), lost, 1)
    expect(draftsAfter(NO_DRAFTS, failed, 'forced').complaint).toEqual(failed)
    const bareCopy = failedSheet(sendingSheet(openSheet('access', KEY)), lost, 1)
    expect(draftsAfter(NO_DRAFTS, bareCopy, 'forced').access).toMatchObject({ key: KEY, failure: REQUESTS.failed })
    expect(draftsAfter(NO_DRAFTS, sendingSheet(openSheet('access', KEY)), 'forced').access?.phase).toBe('editing')

    // Nothing to keep: a forced close of an empty or blank sheet, or of a landed one, keeps nothing.
    expect(draftsAfter(kept, openSheet('complaint', other), 'forced').complaint).toBeUndefined()
    expect(draftsAfter(kept, withText(openSheet('complaint', other), ' \n'), 'forced').complaint).toBeUndefined()
    const landed = sentSheet(written, {
      case: 'c0000000-0000-4000-8000-000000000009',
      reference: 'K7QMX3TD' as never,
      dueOn: '2026-11-10',
      changed: true,
    })
    expect(draftsAfter(kept, landed, 'forced').complaint).toBeUndefined()

    // Done (a confirmed send) or a discard clears the kind's draft, and only that kind's.
    const two = draftsAfter(kept, withText(openSheet('question', other), 'Who reads my messages?'), 'forced')
    expect(Object.keys(two).sort()).toEqual(['complaint', 'question'])
    for (const how of ['done', 'discarded'] as const) {
      const after = draftsAfter(two, written, how)
      expect(after.complaint, how).toBeUndefined()
      expect(after.question?.text, how).toBe('Who reads my messages?')
      expect(sheetFor(after, 'complaint', other), how).toEqual(openSheet('complaint', other))
    }
    // Each step makes a new object, so React's state sees the change.
    expect(draftsAfter(NO_DRAFTS, written, 'forced')).not.toBe(NO_DRAFTS)
  })

  it('RQW-04 OD-22: the confirmation says it was sent (or was sent already), the due day, the reference to quote and where to follow it; never that the DPO was told', () => {
    const sent = { case: 'c0000000-0000-4000-8000-000000000009', reference: 'K7QMX3TD' as never, dueOn: '2026-11-10' }
    expect(confirmationLines({ ...sent, changed: true })).toEqual([
      'Sent to the Data Protection Officer.',
      'They aim to reply by Tue 10 Nov 2026.',
      'Your reference is K7QM-X3TD. Quote it if you write to them about this request.',
      'You can follow it under “Your requests”.',
    ])
    expect(confirmationLines({ ...sent, changed: false })[0]).toBe('This was sent already.')
    for (const line of confirmationLines({ ...sent, changed: true })) {
      expect(line).not.toMatch(/\b(?:told|alerted|notified)\b/)
      expect(aiCopyIn(line)).toBeUndefined()
    }
  })

  it('RQW-05 PD-97 PD-112: a row’s pill, spelled reference, how it came and days; the reply line; past its target day from the answer’s today, the help only with no reply recorded, and never once a reply was on time; a closed row its closing day', () => {
    const answer = row()
    const open = requestRow(answer.requests.rows[0] as never, answer.today)
    expect(open).toEqual({
      id: 'c0000000-0000-4000-8000-000000000001',
      kind: REQUEST_KINDS.complaint,
      state: 'Received',
      reference: 'K7QM-X3TD',
      referenceLabel: 'Reference K 7 Q M, X 3 T D',
      cameBy: 'Sent in Hearth',
      days: 'Received Tue 27 Oct 2026 · Reply due Tue 10 Nov 2026',
      replied: undefined,
      late: { line: 'Past its target day (Tue 10 Nov 2026).', help: REQUESTS.mine.lateHelp },
    })
    const lateReply = row({ state: 'in_progress', repliedOn: '2026-11-11' })
    expect(requestRow(lateReply.requests.rows[0] as never, lateReply.today)).toMatchObject({
      replied: 'The Data Protection Officer replied on Wed 11 Nov 2026.',
      late: { line: 'Past its target day (Tue 10 Nov 2026).', help: undefined },
    })
    const onTime = row({ state: 'in_progress', repliedOn: '2026-11-04', repliedInTime: true })
    expect(requestRow(onTime.requests.rows[0] as never, onTime.today).late).toBeUndefined()
    // Due today isn't late.
    expect(requestRow(row().requests.rows[0] as never, '2026-11-10').late).toBeUndefined()
    const closed = row({ state: 'closed', dueOn: null, closedOn: '2026-11-06', cameBy: 'letter' })
    expect(requestRow(closed.requests.rows[0] as never, closed.today)).toMatchObject({
      state: 'Closed',
      cameBy: 'Received by letter',
      days: 'Received Tue 27 Oct 2026 · Closed Fri 6 Nov 2026',
      late: undefined,
    })
  })

  it('RQW-05 PD-96 OD-25: the list’s states (loading, unreadable, rows with whether some were left out or cut) and the cap’s state from open', () => {
    expect(mineView(undefined, false)).toEqual({ kind: 'loading' })
    expect(mineView(undefined, true)).toEqual({ kind: 'unreadable' })
    const answer = row()
    expect(mineView(answer, false)).toMatchObject({ kind: 'rows', incomplete: false, cut: false })
    const unreadable = MyRequestsResponseForClient.parse({
      today: '2026-11-12',
      requests: 'nothing',
      more: false,
      open: 0,
    })
    expect(mineView(unreadable, false)).toEqual({ kind: 'unreadable' })
    const partly = MyRequestsResponseForClient.parse({
      today: '2026-11-12',
      requests: [...row().requests.rows.map(each => ({ ...each, reference: 'K7QM-X3TD' })), { id: 'not a row' }],
      more: false,
      open: 1,
    })
    expect(mineView(partly, false)).toMatchObject({ kind: 'rows', incomplete: true })
    expect(mineView({ ...answer, more: true }, false)).toMatchObject({ cut: true })
    expect(atCap(undefined)).toBe(false)
    expect(atCap({ ...answer, open: 9 })).toBe(false)
    expect(atCap({ ...answer, open: 10 })).toBe(true)
    expect(atCap({ ...answer, open: null })).toBe(false)
  })
})
