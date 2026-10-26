// The DPO's queue, case sheet and log dialog, pure (dpo/requests-model.ts and dpo/case-model.ts;
// C0.9 OD-14, OD-16, OD-22, PD-89 to PD-91, PD-98, PD-99, PD-112, PPL-01, PPL-02, PPL-04, PPL-05,
// PPL-07, PPL-12, PPL-13, PPL-14), tested in Node with no DOM: RQW-06 to RQW-11.
import { MESSAGES } from '@hearth/shared'
import { describe, expect, it } from 'vitest'
import { ApiFailure } from '@/api/http.ts'
import { requestsCount } from '@/shell/avatar-menu.ts'
import { aiCopyIn } from '@/strings/ai-copy.ts'
import { DPO } from '@/strings/dpo.ts'
import { CASE_COPY, LOG_PROBLEM_COPY, STEP_PROBLEM_COPY } from '@/strings/dpo-case.ts'
import { REQUESTS_COPY } from '@/strings/dpo-requests.ts'
import { SHELL } from '@/strings/shell.ts'
import { countText } from '@/ui/CountBadge.tsx'
import {
  caseFacts,
  caseReadRefusalOf,
  caseRefusalOf,
  earliestReceived,
  emptyLog,
  emptyStep,
  type LogForm,
  logEditor,
  otherLine,
  outcomesFor,
  peopleOptions,
  sheetRequester,
  sheetTitle,
  stepCaseOf,
  stepEditor,
  stepLines,
} from './case-model.ts'
import { dueWords, queueCard, queueReadable, queueView } from './requests-model.ts'
import {
  ALIKE_IDS,
  CASE_IDS,
  CASE_TODAY,
  caseForClient,
  casePeopleForClient,
  LEAVER_ID,
  MARCUS_ID,
  queueForClient,
} from './testing/cases.ts'

const KEY = 'd0000000-0000-4000-8000-000000000005'

describe('C0.9 PR 3b: the DPO’s queue (dpo/requests-model.ts)', () => {
  it('RQW-06 PD-98 PD-112: the due line in words from the answer’s today (due, due today, overdue since its day with an icon, replied on time), and the states and outcomes in words', () => {
    const open = { dueOn: '2026-11-14', repliedOn: null, repliedInTime: false }
    expect(dueWords(open, CASE_TODAY)).toEqual({ text: 'Due Sat 14 Nov 2026', overdue: false })
    expect(dueWords(open, '2026-11-14')).toEqual({ text: 'Due today', overdue: false })
    expect(dueWords(open, '2026-11-16')).toEqual({ text: 'Overdue since Sat 14 Nov 2026', overdue: true })
    // A reply on time ends the clock, whatever today is (PD-112); a late reply doesn't.
    expect(dueWords({ ...open, repliedOn: '2026-11-10', repliedInTime: true }, '2026-12-01')).toEqual({
      text: 'Replied Tue 10 Nov 2026',
      overdue: false,
    })
    expect(dueWords({ ...open, repliedOn: '2026-11-15', repliedInTime: false }, '2026-11-16')?.overdue).toBe(true)
    expect(dueWords({ dueOn: null, repliedOn: null, repliedInTime: false }, CASE_TODAY)).toBeUndefined()

    const answer = queueForClient()
    const cards = answer.open.rows.map(row => queueCard(row, answer.today))
    expect(cards.map(card => [card.kind, card.reference, card.requester, card.state, card.due?.text])).toEqual([
      [
        'Copy of their data',
        'BC2D-FG3H',
        'Lee Example · No Hearth account',
        'In progress',
        'Overdue since Sat 31 Oct 2026',
      ],
      ['Complaint', 'K7QM-X3TD', 'Marcus Ong, Operations', 'New', 'Due Sat 14 Nov 2026'],
    ])
    expect(cards[0]?.referenceLabel).toBe('Reference B C 2 D, F G 3 H')
    expect(cards[0]?.cameBy).toBe('By email')
    const closed = queueCard(answer.closed.rows[0] as never, answer.today)
    expect(closed).toMatchObject({
      requester: 'Priya Nair',
      left: true,
      closed: 'Closed Fri 9 Oct 2026 · Answered',
      due: undefined,
    })
    for (const card of [...cards, closed]) {
      for (const text of Object.values(card).filter(value => typeof value === 'string')) {
        expect(aiCopyIn(text as string)).toBeUndefined()
      }
    }
  })

  it('RQW-07 PD-98: never “No open requests.” when the list couldn’t be read; the cut and incomplete notes; the total in the heading; the closed list’s notes', () => {
    const answer = queueForClient()
    expect(queueView(answer)).toMatchObject({
      openTitle: 'Open requests (2)',
      empty: false,
      notes: [],
      closedNotes: [],
    })
    const none = queueForClient({ open: [], openTotal: 0, closed: [], closedMore: false })
    expect(queueView(none)).toMatchObject({ empty: true, closedEmpty: true, openTitle: 'Open requests (0)' })
    // Unreadable: empty and incomplete, so never "No open requests.".
    const unreadable = { ...answer, open: { rows: [], complete: false }, openTotal: null }
    expect(queueView(unreadable)).toMatchObject({ empty: false, notes: [REQUESTS_COPY.incomplete] })
    // Cut: more open than listed.
    expect(queueView({ ...answer, openTotal: 250 }).notes).toEqual([
      'Only the 2 due soonest of 250 open requests are listed.',
    ])
    expect(queueView({ ...answer, closedMore: true }).closedNotes).toEqual([REQUESTS_COPY.closedCut])
    expect(queueView({ ...answer, closed: { rows: [], complete: false } }).closedNotes).toEqual([
      REQUESTS_COPY.closedIncomplete,
    ])
  })

  it('RQW-11 PPL-02: the queue is read only once the standing is acknowledged; before v0, or with an acknowledgement owed, the page shows its note and sends nothing', () => {
    expect(queueReadable('acknowledged')).toBe(true)
    expect(queueReadable('unpublished')).toBe(false)
    expect(queueReadable('required')).toBe(false)
    expect(REQUESTS_COPY.noticeFirst).toBe('Requests open once the notice is published and you’ve acknowledged it.')
  })

  it('RQW-10 PD-99 PPL-05 PPL-12: the badge’s text (none at 0, 99+ past 99) and the accessible names that say the count in words: the avatar button, the menu item and the Requests link', () => {
    expect(countText(1)).toBe('1')
    expect(countText(99)).toBe('99')
    expect(countText(100)).toBe('99+')
    expect(requestsCount({ requests: 0 })).toBeUndefined()
    expect(SHELL.account.triggerWithRequests('Ashton Teo', 1)).toBe('Account, Ashton Teo, 1 request needs attention')
    expect(SHELL.account.triggerWithRequests('Ashton Teo', 2)).toBe('Account, Ashton Teo, 2 requests need attention')
    expect(SHELL.account.dataProtectionCount(2)).toBe('Data protection, 2 requests need attention')
    expect(DPO.tabs.requestsCount(1)).toBe('Requests, 1 needs attention')
    expect(DPO.tabs.requestsCount(2)).toBe('Requests, 2 need attention')
  })
})

describe('C0.9 PR 3b: the case sheet and the log dialog (dpo/case-model.ts)', () => {
  it('PPL-01 PPL-07: the sheet names who sent it (a person’s department, manager and leaving day, with the channel the case records and their id for a break-glass citation; or someone without an account with theirs), and its title is the kind and the reference', () => {
    const answer = caseForClient()
    expect(sheetTitle(answer.case)).toBe('Complaint · K7QM-X3TD')
    expect(sheetRequester(answer.case.requester)).toEqual({
      lines: ['Marcus Ong, Operations', 'Reports to Priya Nair'],
      reach: undefined,
      personId: MARCUS_ID,
    })
    const leaver = caseForClient({
      case: {
        requester: {
          type: 'person',
          person: MARCUS_ID,
          name: 'Marcus Ong',
          department: null,
          manager: null,
          leftOn: '2026-11-02',
          channel: 'email',
          contact: 'marcus.home@mail.example',
        },
      },
    })
    expect(sheetRequester(leaver.case.requester)).toEqual({
      lines: ['Marcus Ong', 'Has left on Mon 2 Nov 2026'],
      reach: { channel: 'Email', contact: 'marcus.home@mail.example' },
      personId: MARCUS_ID,
    })
    const outside = caseForClient({
      case: {
        cameBy: 'letter',
        requester: {
          type: 'outside',
          name: 'Lee Example',
          channel: 'post',
          contact: '1 Example Road\nSingapore 000000',
        },
      },
      others: [],
    })
    expect(sheetRequester(outside.case.requester)).toEqual({
      lines: ['Lee Example', 'No Hearth account'],
      reach: { channel: 'Post', contact: '1 Example Road\nSingapore 000000' },
      personId: undefined,
    })
    expect(otherLine(answer.others.rows[0] as never, answer.today)).toEqual({
      id: CASE_IDS.closed,
      kind: 'Question',
      reference: 'MNP4-QRS5',
      referenceLabel: 'Reference M N P 4, Q R S 5',
      state: 'Closed',
      days: 'Received Mon 5 Oct 2026 · Closed Fri 9 Oct 2026 · Answered',
    })
  })

  it('PD-112 PPL-07: another open request replied to on time reads “Replied on time” past its due day, never “Overdue since”; one with no reply on time still reads as overdue', () => {
    const other = {
      id: CASE_IDS.copy,
      reference: 'BC2DFG3H',
      kind: 'access',
      cameBy: 'email',
      receivedOn: '2026-10-01',
      state: 'in_progress',
      dueOn: '2026-10-31',
      repliedInTime: true,
      closedOn: null,
      outcome: null,
    } as const
    const answer = caseForClient({ others: [other, { ...other, id: CASE_IDS.closed, repliedInTime: false }] })
    expect(answer.today > '2026-10-31').toBe(true)
    const [onTime, late] = answer.others.rows.map(row => otherLine(row as never, answer.today))
    expect(onTime?.days).toBe('Received Thu 1 Oct 2026 · Replied on time')
    expect(late?.days).toBe('Received Thu 1 Oct 2026 · Overdue since Sat 31 Oct 2026')
  })

  it('PD-90 PD-91 PD-112: the facts (how it came, received, logged for one the DPO logged, the due line, identity, more time, an open review, the closure) and the steps oldest first, then the closure', () => {
    const answer = caseForClient()
    expect(caseFacts(answer)).toEqual([
      { term: 'How it came', value: 'Sent in Hearth' },
      { term: 'Received', value: 'Thu 29 Oct 2026' },
      { term: 'Due', value: 'Due Sat 14 Nov 2026' },
      { term: 'Identity', value: 'Not checked yet' },
    ])
    const worked = caseForClient({
      case: {
        kind: 'access',
        receivedKind: 'access',
        cameBy: 'email',
        loggedOn: '2026-10-30',
        loggedBy: 'Ashton Teo',
        identityChecked: true,
        revision: 3,
        state: 'more_time',
        dueOn: '2026-12-15',
        closedOn: null,
      },
      steps: [
        {
          number: 1,
          step: 'acknowledged',
          onDay: '2026-10-30',
          note: null,
          extendedTo: null,
          kind: null,
          recordedOn: '2026-10-30',
          recordedBy: 'Ashton Teo',
        },
        {
          number: 2,
          step: 'identity_checked',
          onDay: '2026-11-02',
          note: 'By video call',
          extendedTo: null,
          kind: null,
          recordedOn: '2026-11-02',
          recordedBy: 'Ashton Teo',
        },
        {
          number: 3,
          step: 'extended',
          onDay: '2026-11-10',
          note: null,
          extendedTo: '2026-12-15',
          kind: null,
          recordedOn: '2026-11-10',
          recordedBy: null,
        },
      ],
      others: [],
    })
    expect(caseFacts(worked)).toEqual([
      { term: 'How it came', value: 'By email' },
      { term: 'Received', value: 'Thu 29 Oct 2026' },
      { term: 'Logged', value: 'Fri 30 Oct 2026 by Ashton Teo' },
      { term: 'Due', value: 'Due Tue 15 Dec 2026' },
      { term: 'Identity', value: 'Checked: By video call' },
      { term: 'More time', value: 'New date for the reply: Tue 15 Dec 2026' },
    ])
    expect(
      stepLines(worked.case, worked.steps.rows).map(line => [line.name, line.day, line.detail, line.recorded]),
    ).toEqual([
      ['Told them it was received', 'Fri 30 Oct 2026', undefined, 'Recorded Fri 30 Oct 2026 by Ashton Teo'],
      ['Checked who they are', 'Mon 2 Nov 2026', undefined, 'Recorded Mon 2 Nov 2026 by Ashton Teo'],
      ['More time needed', 'Tue 10 Nov 2026', 'New date for the reply: Tue 15 Dec 2026', 'Recorded Tue 10 Nov 2026'],
    ])
    const closed = caseForClient({
      case: {
        kind: 'access',
        receivedKind: 'access',
        revision: 1,
        state: 'closed',
        dueOn: null,
        closedOn: '2026-11-11',
        closedKind: 'access',
        outcome: 'refused',
        closedNote: 'The data is another person’s.',
        closedBy: 'Ashton Teo',
        reviewOpen: true,
      },
    })
    expect(caseFacts(closed)).toEqual(
      expect.arrayContaining([
        { term: 'PDPC review', value: 'Open' },
        { term: 'Closed', value: 'Closed Wed 11 Nov 2026 · Refused' },
      ]),
    )
    expect(caseFacts(closed).map(fact => fact.term)).not.toContain('Due')
    expect(stepLines(closed.case, [])).toEqual([
      {
        key: 'closed',
        name: 'Closed: Refused',
        day: 'Wed 11 Nov 2026',
        note: 'The data is another person’s.',
        detail: undefined,
        recorded: 'Recorded Wed 11 Nov 2026 by Ashton Teo',
      },
    ])
  })

  it('RQW-08 PD-90 PD-91 PPL-04 PPL-14: the steps a case allows from its kind now, state, identity step and review; more time held back when told after the due day; closing a copy as answered held until identity is checked; the body carries exactly the step’s fields and the revision shown', () => {
    const complaint = caseForClient()
    const editor = (form: Partial<ReturnType<typeof emptyStep>>, answer = complaint) =>
      stepEditor({ ...emptyStep(answer.today), ...form }, answer.case, answer.today)
    // A complaint: no more time, no review; a step not chosen yet holds Save.
    expect(editor({}).offered).toEqual([
      'acknowledged',
      'identity_checked',
      'replied',
      'reclassified',
      'note',
      'closed',
    ])
    expect(editor({}).problems).toEqual([CASE_COPY.stepMissing])
    expect(outcomesFor(stepCaseOf(complaint.case))).toEqual(['answered', 'withdrawn', 'duplicate', 'not_a_request'])
    // A note needs its words; a reply's note is optional.
    expect(editor({ step: 'note' }).problems).toEqual([STEP_PROBLEM_COPY.note_missing])
    expect(editor({ step: 'replied' }).body).toEqual({
      case: CASE_IDS.complaint,
      seen: 0,
      step: 'replied',
      onDay: CASE_TODAY,
      note: null,
      extendedTo: null,
      kind: null,
      outcome: null,
    })
    expect(editor({ step: 'identity_checked' }).problems).toEqual([STEP_PROBLEM_COPY.identity_missing])
    expect(editor({ step: 'reclassified' }).problems).toEqual([STEP_PROBLEM_COPY.kind_missing])
    expect(editor({ step: 'reclassified', kind: 'complaint' }).problems).toEqual([STEP_PROBLEM_COPY.kind_same])
    expect(editor({ step: 'closed' }).problems).toEqual([STEP_PROBLEM_COPY.outcome_missing])
    expect(editor({ step: 'closed', outcome: 'refused' }).problems).toEqual([
      STEP_PROBLEM_COPY.refusal_kind,
      STEP_PROBLEM_COPY.refusal_why,
    ])
    expect(editor({ step: 'note', note: 'Called them back.', onDay: '2026-10-01' }).problems).toEqual([
      STEP_PROBLEM_COPY.day_range,
    ])

    // A copy of their data, due 31 Oct, identity not checked.
    const copy = caseForClient({
      case: {
        id: CASE_IDS.copy,
        kind: 'access',
        receivedKind: 'access',
        receivedOn: '2026-10-01',
        loggedOn: '2026-10-01',
        dueOn: '2026-10-31',
        revision: 2,
        state: 'in_progress',
      },
    })
    expect(editor({}, copy).offered).toEqual([
      'acknowledged',
      'identity_checked',
      'replied',
      'extended',
      'reclassified',
      'note',
      'closed',
    ])
    expect(editor({ step: 'closed', outcome: 'answered' }, copy).problems).toEqual([STEP_PROBLEM_COPY.identity_first])
    // More time told after the due day is held back (PPL-04); told in time, it goes with its date.
    expect(editor({ step: 'extended', onDay: '2026-11-02', extendedTo: '2026-11-30' }, copy).problems).toEqual([
      STEP_PROBLEM_COPY.extension_told_late,
    ])
    expect(editor({ step: 'extended', onDay: '2026-10-30', extendedTo: '2026-11-30' }, copy).body).toMatchObject({
      step: 'extended',
      seen: 2,
      onDay: '2026-10-30',
      extendedTo: '2026-11-30',
      kind: null,
      outcome: null,
    })
    expect(editor({ step: 'extended', onDay: '2026-10-30', extendedTo: '2027-02-01' }, copy).problems).toEqual([
      STEP_PROBLEM_COPY.extension_range,
    ])

    // Closed as refused: only a note, or the PDPC review, may follow.
    const refused = caseForClient({
      case: {
        kind: 'access',
        receivedKind: 'access',
        revision: 1,
        state: 'closed',
        dueOn: null,
        closedOn: '2026-11-11',
        closedKind: 'access',
        outcome: 'refused',
        closedNote: 'Another person’s data.',
        closedBy: 'Ashton Teo',
      },
    })
    expect(editor({}, refused).offered).toEqual(['note', 'review_started'])
    const reviewing = caseForClient({ case: { ...refused.case, reviewOpen: true, reference: 'K7QMX3TD' } as never })
    expect(editor({}, reviewing).offered).toEqual(['note', 'review_ended'])
    // A request the DPO logged may close as logged in error; one sent in Hearth may not.
    const logged = caseForClient({ case: { cameBy: 'email', loggedBy: 'Ashton Teo' } })
    expect(outcomesFor(stepCaseOf(logged.case))).toContain('logged_in_error')
    expect(outcomesFor(stepCaseOf(complaint.case))).not.toContain('logged_in_error')
  })

  it('RQW-08 PD-90: a refused write in the sheet’s words: case_changed offers Reload, case_invalid and not_found say so; the PIN step and forbidden as the register pages read them', () => {
    expect(caseRefusalOf(new ApiFailure(409, 'case_changed', MESSAGES.case_changed))).toEqual({
      kind: 'changed',
      text: CASE_COPY.changed,
    })
    expect(caseRefusalOf(new ApiFailure(400, 'case_invalid', MESSAGES.case_invalid))).toEqual({
      kind: 'message',
      text: CASE_COPY.invalid,
    })
    expect(caseRefusalOf(new ApiFailure(404, 'not_found', 'Not found'))).toEqual({
      kind: 'message',
      text: CASE_COPY.missing,
    })
    expect(caseRefusalOf(new ApiFailure(403, 'reauth_required', 'PIN', { method: 'pin' }))).toEqual({ kind: 'pin' })
    expect(caseRefusalOf(new ApiFailure(403, 'forbidden', 'No'))).toEqual({ kind: 'forbidden', text: DPO.forbidden })
    expect(caseReadRefusalOf(new ApiFailure(404, 'not_found', 'Not found'))).toEqual({
      kind: 'message',
      text: CASE_COPY.missing,
    })
  })

  it('RQW-09 OD-16 PD-89 PPL-01 PPL-13 PPL-14: the people by name and department, a leaver’s day, the manager and day added where two read the same; two who still read the same can’t be picked, with the line to log it as someone without an account; How to reach them required for a leaver and optional otherwise; no identity field; the log’s problems worded', () => {
    const people = casePeopleForClient()
    const options = peopleOptions(people.people.rows)
    expect(options.options.map(option => option.label)).toEqual([
      'Choose someone',
      'Ahmad Rahman (Commercial)',
      'Marcus Ong (Operations)',
      'Wei Ming Lee (Operations), reports to Priya Nair, added Thu 1 Oct 2026',
      'Wei Ming Lee (Operations), reports to Priya Nair, added Thu 1 Oct 2026',
      'Siti Aminah (Commercial), left on Mon 2 Nov 2026',
    ])
    expect(options.same).toBe(true)
    expect([...options.alike]).toEqual([...ALIKE_IDS])

    const log = (form: Partial<LogForm>) =>
      logEditor({ ...emptyLog(CASE_TODAY), ...form }, people, options, CASE_TODAY, KEY)
    // Nothing chosen yet: the kind and the person first, then the rest in log_case()'s order.
    expect(log({}).problems).toEqual([
      CASE_COPY.fields.kindMissing,
      CASE_COPY.fields.personMissing,
      LOG_PROBLEM_COPY.came_by,
      LOG_PROBLEM_COPY.details_missing,
    ])
    const ready = { kind: 'complaint', cameBy: 'email', details: 'They say the rota showed their address.' } as const
    // Someone at the organisation, no channel given: optional.
    expect(log({ ...ready, person: MARCUS_ID }).body).toEqual({
      kind: 'complaint',
      cameBy: 'email',
      receivedOn: CASE_TODAY,
      requester: { type: 'person', person: MARCUS_ID },
      details: ready.details,
      key: KEY,
    })
    // A leaver needs the channel they wrote from (PPL-01).
    expect(log({ ...ready, person: LEAVER_ID }).leaver).toBe(true)
    expect(log({ ...ready, person: LEAVER_ID }).problems).toEqual([LOG_PROBLEM_COPY.leaver_channel_missing])
    expect(
      log({ ...ready, person: LEAVER_ID, channel: 'email', contact: 'siti@mail.example' }).body?.requester,
    ).toEqual({
      type: 'person',
      person: LEAVER_ID,
      channel: 'email',
      contact: 'siti@mail.example',
    })
    // Two nothing tells apart: held back, with the line that says what to do (PPL-13).
    expect(log({ ...ready, person: ALIKE_IDS[0] }).problems).toEqual([CASE_COPY.people.same])
    expect(log({ ...ready, person: ALIKE_IDS[0] }).body).toBeUndefined()
    // Someone without an account: a name and one channel; an ID-shaped name is held back.
    const outside = { ...ready, who: 'outside', channel: 'email', contact: 'lee@mail.example' } as const
    expect(log({ ...outside, name: 'S1234567D' }).problems).toEqual([LOG_PROBLEM_COPY.name_id_number])
    expect(log({ ...outside, name: 'Lee Example' }).body?.requester).toEqual({
      type: 'outside',
      name: 'Lee Example',
      channel: 'email',
      contact: 'lee@mail.example',
    })
    expect(log({ ...outside, name: 'Lee Example', contact: 'not an address' }).problems).toEqual([
      LOG_PROBLEM_COPY.contact_shape,
    ])
    // The day received: at most a year back, never after today.
    expect(earliestReceived(CASE_TODAY)).toBe('2025-11-12')
    expect(log({ ...ready, person: MARCUS_ID, receivedOn: '2025-11-11' }).problems).toEqual([
      LOG_PROBLEM_COPY.received_range,
    ])
    // No identity field: the body has none, and the dialog says where it goes (PPL-14).
    expect(Object.keys(log({ ...ready, person: MARCUS_ID }).body ?? {})).not.toContain('identity')
    expect(CASE_COPY.fields.identityAfter).toBe('Record how you checked who they are on the request once it’s logged.')
  })
})
