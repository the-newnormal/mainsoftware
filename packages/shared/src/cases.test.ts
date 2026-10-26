// Requests to the DPO (PDPA-04, PDPA-13; C0.9 OD-06 to OD-09, OD-14 to OD-16; PD-88 to PD-104): the
// vocabulary and limits migration 0012 holds, the rules it applies in its refusal order, the
// reference people quote, and the bodies and answers of /api/requests and /api/admin/requests. That
// the shared rules and 0012's functions refuse the same samples is the cases integration suite's
// (RQI-09); the database's own checks are db/tests/175_request_cases.sql's. Every name, address and
// word here is fictional, on reserved domains and in the seed's made-up +65 8000 range.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  BIDI_FORMATTING,
  CALENDAR_KINDS,
  CAME_BY,
  CASE_ATTENTION_BUSINESS_DAYS,
  CASE_DETAILS_MAX,
  CASE_EXTENSION_MAX_DAYS,
  CASE_IDENTITY_NOTE_MAX,
  CASE_KINDS,
  CASE_MINE_MAX,
  CASE_NAME_MAX,
  CASE_NOTE_MAX,
  CASE_OPEN_PER_REQUESTER_MAX,
  CASE_OTHERS_MAX,
  CASE_PEOPLE_MAX,
  CASE_QUEUE_CLOSED_MAX,
  CASE_QUEUE_OPEN_MAX,
  CASE_RECEIVED_BACK_DAYS,
  CASE_REFERENCE_PATTERN,
  CASE_STATES,
  CASE_STEPS,
  CASE_STEPS_MAX,
  CasePeopleResponse,
  CasePeopleResponseForClient,
  CaseResponse,
  CaseResponseForClient,
  CaseStepBody,
  CaseStepResponse,
  caseText,
  contactInShape,
  EXTENDABLE_KINDS,
  formatCaseReference,
  ID_NUMBER_SHAPE,
  IDENTITY_KINDS,
  idNumberLikely,
  LOG_PROBLEMS,
  LOGGED_CAME_BY,
  type LogDraft,
  LogRequestBody,
  LogRequestResponse,
  LogRequestResponseForClient,
  listedRows,
  logDraftOf,
  logProblems,
  MY_STATES,
  MyRequestsResponse,
  MyRequestsResponseForClient,
  OUTCOMES,
  parseCaseReference,
  QUEUE_STATES,
  REFUSABLE_KINDS,
  REQUEST_PROBLEMS,
  REQUESTER_CHANNELS,
  RequestQueueResponse,
  RequestQueueResponseForClient,
  requestProblems,
  SendRequestBody,
  SendRequestResponse,
  SendRequestResponseForClient,
  STEP_INPUTS,
  STEP_PROBLEMS,
  type StepCase,
  type StepDraft,
  spelledReference,
  stepProblems,
  stepsAllowed,
} from './cases.ts'

const char = (code: number) => String.fromCodePoint(code)
const SMILE = char(0x1f642)
// The bidirectional embedding, override and isolate characters, built from their code points so
// this file holds none of them raw (DB-04).
const BIDI = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069].map(char)

const TODAY = '2026-10-26'
const KEY = 'a0000000-0000-4000-8000-0000000000c1'
const CASE = 'c0000000-0000-4000-8000-000000000001'
const PERSON = 'b0000000-0000-4000-8000-000000000012'
const REFERENCE = 'K7QMX3TD'

describe('RQS-01 C0.9 OD-07 OD-08 PD-88 PD-89 PD-96: the vocabulary and limits are 0012’s', () => {
  it('RQS-01 OD-07: six kinds, six ways in (five the DPO logs), three channels, nine step inputs, six outcomes, as 0012’s checks list them', () => {
    expect([...CASE_KINDS]).toEqual(['question', 'complaint', 'access', 'correction', 'withdrawal', 'objection'])
    expect([...CAME_BY]).toEqual(['hearth', 'email', 'letter', 'phone', 'in_person', 'other'])
    expect([...LOGGED_CAME_BY]).toEqual(CAME_BY.filter(way => way !== 'hearth'))
    expect([...REQUESTER_CHANNELS]).toEqual(['email', 'phone', 'post'])
    expect([...STEP_INPUTS]).toEqual([
      'acknowledged',
      'identity_checked',
      'replied',
      'extended',
      'reclassified',
      'note',
      'review_started',
      'review_ended',
      'closed',
    ])
    // The closure lives on the request's row: case_steps_step admits every other input.
    expect([...CASE_STEPS]).toEqual(STEP_INPUTS.filter(step => step !== 'closed'))
    expect([...OUTCOMES]).toEqual(['answered', 'refused', 'withdrawn', 'duplicate', 'not_a_request', 'logged_in_error'])
  })

  it('RQS-01 PD-88 PD-96 PD-98 PD-99: each limit by value', () => {
    expect({
      CASE_DETAILS_MAX,
      CASE_NOTE_MAX,
      CASE_IDENTITY_NOTE_MAX,
      CASE_NAME_MAX,
      CASE_OPEN_PER_REQUESTER_MAX,
      CASE_STEPS_MAX,
      CASE_RECEIVED_BACK_DAYS,
      CASE_EXTENSION_MAX_DAYS,
      CASE_ATTENTION_BUSINESS_DAYS,
      CASE_QUEUE_OPEN_MAX,
      CASE_QUEUE_CLOSED_MAX,
      CASE_MINE_MAX,
      CASE_PEOPLE_MAX,
      CASE_OTHERS_MAX,
    }).toEqual({
      CASE_DETAILS_MAX: 4000,
      CASE_NOTE_MAX: 2000,
      CASE_IDENTITY_NOTE_MAX: 500,
      CASE_NAME_MAX: 200,
      CASE_OPEN_PER_REQUESTER_MAX: 10,
      CASE_STEPS_MAX: 100,
      CASE_RECEIVED_BACK_DAYS: 365,
      CASE_EXTENSION_MAX_DAYS: 90,
      CASE_ATTENTION_BUSINESS_DAYS: 2,
      CASE_QUEUE_OPEN_MAX: 200,
      CASE_QUEUE_CLOSED_MAX: 100,
      CASE_MINE_MAX: 50,
      CASE_PEOPLE_MAX: 2000,
      CASE_OTHERS_MAX: 50,
    })
  })
})

describe('RQS-02 C0.9 PD-88: text as 0012’s writers read it', () => {
  it('RQS-02: CRLF reads as LF, the ends are trimmed of String.prototype.trim()’s set, and empty reads as none', () => {
    expect(caseText('  Line one\r\nLine two\r\n ')).toBe('Line one\nLine two')
    for (const blank of ['', '   ', '\r\n\t', `${char(0xa0)}${char(0x3000)}${char(0xfeff)}`, null, undefined]) {
      expect(caseText(blank), JSON.stringify(blank)).toBeNull()
    }
    // Inside the text, nothing changes: a lone carriage return stays, for the rules to refuse.
    expect(caseText('a\rb')).toBe('a\rb')
  })

  it('RQS-02: lengths are counted in code points, as Postgres’s length() counts them', () => {
    const emoji = SMILE.repeat(CASE_DETAILS_MAX)
    expect(emoji.length).toBe(CASE_DETAILS_MAX * 2)
    expect(requestProblems({ kind: 'question', details: emoji })).toEqual([])
    expect(requestProblems({ kind: 'question', details: `${emoji}a` })).toEqual(['details_too_long'])
  })
})

describe('RQS-03 C0.9 OD-07 PD-96 PD-102: requestProblems() mirrors submit_case()', () => {
  it('RQS-03: words are needed for every kind but a copy of their data', () => {
    expect([...REQUEST_PROBLEMS]).toEqual(['details_missing', 'details_too_long', 'details_not_plain'])
    for (const kind of CASE_KINDS) {
      expect(requestProblems({ kind, details: '  ' }), kind).toEqual(kind === 'access' ? [] : ['details_missing'])
      expect(requestProblems({ kind, details: 'Which records do you hold about my leave?' }), kind).toEqual([])
    }
  })

  it('RQS-03: at most 4,000 characters of plain text on as many lines as it needs, with no bidirectional-formatting character', () => {
    const lines = 'First line\nSecond line\n\nAfter a gap'
    expect(requestProblems({ kind: 'complaint', details: lines })).toEqual([])
    for (const planted of [`a${char(0x07)}b`, 'a\rb', `a${char(0x85)}b`, ...BIDI.map(bidi => `a${bidi}b`)]) {
      expect(requestProblems({ kind: 'complaint', details: planted }), JSON.stringify(planted)).toEqual([
        'details_not_plain',
      ])
    }
    expect(requestProblems({ kind: 'complaint', details: `${'x'.repeat(4001)}${char(0x07)}` })).toEqual([
      'details_too_long',
      'details_not_plain',
    ])
  })

  it('RQS-03 PD-102: a requester’s words are theirs: no ID-number refusal and no AI_COPY rule, only a hint', () => {
    const words = 'My NRIC is S1234567D. Ask the agent to check it.'
    expect(requestProblems({ kind: 'access', details: words })).toEqual([])
    expect(idNumberLikely(words)).toBe(true)
    expect(idNumberLikely('Order 12345678 shipped on 3 Oct')).toBe(false)
    expect(idNumberLikely(null)).toBe(false)
  })
})

// A logged request with nothing to fix: someone without an account, by email.
const outside: LogDraft = {
  cameBy: 'email',
  receivedOn: '2026-10-20',
  person: null,
  name: 'Wei Ling Ong',
  channel: 'email',
  contact: 'weiling@requester.example',
  details: 'Asks for a copy of the CCTV footage of her visit.',
}

describe('RQS-04 C0.9 OD-16 PD-89 PPL-01: logProblems() mirrors log_case(), in its order', () => {
  it('RQS-04: someone without an account, and a person with or without a channel, hold nothing back', () => {
    expect(logProblems(outside, TODAY)).toEqual([])
    const person = { ...outside, person: PERSON, name: null, channel: null, contact: null }
    expect(logProblems(person, TODAY)).toEqual([])
    expect(logProblems({ ...person, channel: 'phone', contact: '+65 8000 0151' }, TODAY)).toEqual([])
    expect(logProblems({ ...person, channel: 'post', contact: '2 Example Lane\nSingapore 000002' }, TODAY)).toEqual([])
  })

  it('RQS-04 PPL-01: a leaver needs a channel only when the page passes the person it picked; the route passes none, and the function decides', () => {
    const leaver = { ...outside, person: PERSON, name: null, channel: null, contact: null }
    expect(logProblems(leaver, TODAY, { leftOn: '2026-09-30' })).toEqual(['leaver_channel_missing'])
    expect(logProblems(leaver, TODAY, { leftOn: null })).toEqual([])
    expect(logProblems(leaver, TODAY)).toEqual([])
    expect(
      logProblems({ ...leaver, channel: 'email', contact: 'former@requester.example' }, TODAY, {
        leftOn: '2026-09-30',
      }),
    ).toEqual([])
  })

  it('RQS-04: each rule on its own', () => {
    const cases: [Partial<LogDraft>, string][] = [
      [{ person: PERSON }, 'requester_both'],
      [{ name: '  ' }, 'name_missing'],
      [{ name: 'a'.repeat(CASE_NAME_MAX + 1) }, 'name_too_long'],
      [{ name: 'Wei Ling\nOng' }, 'name_not_one_line'],
      [{ name: `Wei Ling${char(0x07)}` }, 'name_not_plain'],
      [{ name: 'Wei Ling\rOng' }, 'name_not_plain'],
      [{ name: `Wei Ling${BIDI[4]}` }, 'name_not_plain'],
      [{ name: 'Wei Ling S1234567D' }, 'name_id_number'],
      [{ channel: null, contact: null }, 'channel_missing'],
      [{ channel: 'fax' }, 'channel_missing'],
      [{ contact: 'not an address' }, 'contact_shape'],
      [{ channel: 'phone' }, 'contact_shape'],
      [{ channel: 'email', contact: '  ' }, 'contact_shape'],
      [{ channel: 'post', contact: '---' }, 'contact_shape'],
      [{ channel: 'post', contact: `2 Example Lane${BIDI[0]}` }, 'contact_shape'],
      [{ channel: 'post', contact: '2 Example Lane\n\nSingapore' }, 'contact_shape'],
      [{ channel: 'post', contact: 'T1234567J Example Lane' }, 'contact_id_number'],
      [{ cameBy: 'hearth' }, 'came_by'],
      [{ cameBy: null }, 'came_by'],
      [{ receivedOn: '2026-10-27' }, 'received_range'],
      [{ receivedOn: '2025-10-25' }, 'received_range'],
      [{ receivedOn: '26 Oct 2026' }, 'received_range'],
      [{ receivedOn: null }, 'received_range'],
      [{ details: ' \r\n ' }, 'details_missing'],
      [{ details: 'x'.repeat(CASE_DETAILS_MAX + 1) }, 'details_too_long'],
      [{ details: `Wants a copy${BIDI[8]}` }, 'details_not_plain'],
      [{ details: 'Wants the record for G7654321N corrected' }, 'details_id_number'],
    ]
    for (const [change, problem] of cases) {
      expect(logProblems({ ...outside, ...change }, TODAY), JSON.stringify(change)).toEqual([problem])
    }
    // A year back to the day, and today, are in range.
    for (const receivedOn of ['2025-10-26', TODAY]) {
      expect(logProblems({ ...outside, receivedOn }, TODAY), receivedOn).toEqual([])
    }
    // A person with an address and no channel is told to choose the channel.
    expect(logProblems({ ...outside, person: PERSON, name: null, channel: null }, TODAY)).toEqual(['channel_missing'])
  })

  it('RQS-04 OD-16: the ID-number and bidirectional rules hold for what the DPO types, never for the requester’s own words', () => {
    expect(requestProblems({ kind: 'question', details: 'About F1234567X' })).toEqual([])
    expect(logProblems({ ...outside, details: 'About F1234567X' }, TODAY)).toEqual(['details_id_number'])
  })

  it('RQS-04: every problem at once comes in LOG_PROBLEMS order', () => {
    expect([...LOG_PROBLEMS]).toEqual([
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
    ])
    const everything: LogDraft = {
      cameBy: 'hearth',
      receivedOn: '2024-01-01',
      person: null,
      name: `${'S1234567D '.repeat(30)}\n${char(0x07)}`,
      channel: null,
      contact: 'x',
      details: `${'F1234567X '.repeat(450)}${char(0x07)}`,
    }
    expect(logProblems(everything, TODAY)).toEqual([
      'name_too_long',
      'name_not_one_line',
      'name_not_plain',
      'name_id_number',
      'channel_missing',
      'came_by',
      'received_range',
      'details_too_long',
      'details_not_plain',
      'details_id_number',
    ])
  })

  it('RQS-04: the route passes the parsed body, which reads as the dialog’s draft', () => {
    const body = LogRequestBody.parse({
      kind: 'access',
      cameBy: 'letter',
      receivedOn: '2026-10-20',
      requester: { type: 'person', person: PERSON },
      details: 'Asks for a copy of their personnel file.',
      key: KEY,
    })
    expect(logDraftOf(body)).toEqual({
      cameBy: 'letter',
      receivedOn: '2026-10-20',
      person: PERSON,
      name: null,
      channel: null,
      contact: null,
      details: 'Asks for a copy of their personnel file.',
    })
    expect(logProblems(body, TODAY)).toEqual([])
  })
})

// An open copy request, sent in Hearth, received a week ago, due in 30 days, with no step yet.
const kase: StepCase = {
  kind: 'access',
  cameBy: 'hearth',
  receivedOn: '2026-10-19',
  dueOn: '2026-11-18',
  revision: 0,
  closedOn: null,
  closedKind: null,
  outcome: null,
  identityChecked: false,
  reviewOpen: false,
}
const step = (change: Partial<StepDraft>): StepDraft => ({
  step: 'note',
  onDay: TODAY,
  note: 'Called them to confirm what they need.',
  extendedTo: null,
  kind: null,
  outcome: null,
  ...change,
})
// The same request closed as a refused copy.
const refusedCopy: StepCase = {
  ...kase,
  dueOn: null,
  revision: 3,
  closedOn: '2026-10-24',
  closedKind: 'access',
  outcome: 'refused',
}

describe('RQS-05 C0.9 PD-90 PD-91 PPL-04 DB-03: stepProblems() mirrors add_case_step(), against the request the sheet read', () => {
  it('RQS-05: the steps an open request allows, each with what it takes, hold nothing back', () => {
    const allowed: StepDraft[] = [
      step({ step: 'acknowledged', note: null }),
      step({ step: 'identity_checked', note: 'Against HR records, by video call' }),
      step({ step: 'replied', note: null }),
      step({ step: 'extended', note: null, onDay: TODAY, extendedTo: '2026-12-01' }),
      step({ step: 'reclassified', note: null, kind: 'correction' }),
      step({ step: 'note' }),
      step({ step: 'closed', note: null, outcome: 'withdrawn' }),
    ]
    for (const draft of allowed) expect(stepProblems(draft, kase, TODAY), draft.step).toEqual([])
  })

  it('RQS-05: the day, the note and the fields each step takes', () => {
    const cases: [Partial<StepDraft>, string[]][] = [
      [{ onDay: '2026-10-18' }, ['day_range']],
      [{ onDay: '2026-10-27' }, ['day_range']],
      [{ onDay: null }, ['day_range']],
      [{ note: 'x'.repeat(CASE_NOTE_MAX + 1) }, ['note_too_long']],
      [{ note: `Called${BIDI[2]}` }, ['note_not_plain']],
      [{ note: 'Matched S1234567D' }, ['note_id_number']],
      [{ note: '   ' }, ['note_missing']],
      [{ extendedTo: '2026-12-01' }, ['step_fields']],
      [{ kind: 'question' }, ['step_fields']],
      [{ outcome: 'answered' }, ['step_fields']],
      [{ step: 'reclassified', kind: null }, ['step_fields']],
      [{ step: 'closed', outcome: null }, ['step_fields']],
    ]
    for (const [change, problems] of cases) {
      expect(stepProblems(step(change), kase, TODAY), JSON.stringify(change)).toEqual(problems)
    }
    // A note's lines are kept; how identity was checked is one line of at most 500 characters.
    expect(stepProblems(step({ note: 'Line one\nLine two' }), kase, TODAY)).toEqual([])
    const identity = (note: string | null) => stepProblems(step({ step: 'identity_checked', note }), kase, TODAY)
    expect(identity(null)).toEqual(['note_missing'])
    expect(identity('x'.repeat(CASE_IDENTITY_NOTE_MAX + 1))).toEqual(['identity_too_long'])
    expect(identity('By video call\nand HR records')).toEqual(['identity_not_one_line'])
  })

  it('RQS-05 PD-90: a closed request takes only a note or a refused copy’s PDPC review', () => {
    const closed = { ...kase, dueOn: null, revision: 2, closedOn: '2026-10-24', closedKind: 'access' as const }
    const answered = { ...closed, outcome: 'answered' as const }
    for (const input of ['acknowledged', 'replied', 'closed'] as const) {
      const draft = step({ step: input, note: null, outcome: input === 'closed' ? 'duplicate' : null })
      expect(stepProblems(draft, answered, TODAY), input).toEqual(['not_open'])
    }
    expect(stepProblems(step({}), answered, TODAY)).toEqual([])
    expect(stepProblems(step({ step: 'review_started', note: null }), answered, TODAY)).toEqual([
      'review_not_refused_copy',
    ])
    expect(stepProblems(step({ step: 'review_started', note: null }), refusedCopy, TODAY)).toEqual([])
    expect(
      stepProblems(step({ step: 'review_started', note: null }), { ...refusedCopy, reviewOpen: true }, TODAY),
    ).toEqual(['review_open'])
    expect(stepProblems(step({ step: 'review_ended', note: null }), refusedCopy, TODAY)).toEqual(['review_none'])
    expect(
      stepProblems(step({ step: 'review_ended', note: null }), { ...refusedCopy, reviewOpen: true }, TODAY),
    ).toEqual([])
    // A refused correction or objection has no PDPC review step in Hearth (s22A is a copy's hold).
    const refusedCorrection = { ...refusedCopy, kind: 'correction' as const, closedKind: 'correction' as const }
    expect(stepProblems(step({ step: 'review_started', note: null }), refusedCorrection, TODAY)).toEqual([
      'review_not_refused_copy',
    ])
  })

  it('RQS-05 PD-90: a reclassification names another kind, and its rules follow the kind it is now', () => {
    expect(stepProblems(step({ step: 'reclassified', note: null, kind: 'access' }), kase, TODAY)).toEqual(['kind_same'])
    const question = { ...kase, kind: 'question' as const }
    expect(stepProblems(step({ step: 'extended', note: null, extendedTo: '2026-12-01' }), question, TODAY)).toEqual([
      'not_extendable',
    ])
    expect(
      stepProblems(step({ step: 'closed', note: 'Not ours to give', outcome: 'refused' }), question, TODAY),
    ).toEqual(['refusal_kind'])
    // Answering a question needs no identity step; answering a copy or a correction does (PD-91).
    expect(stepProblems(step({ step: 'closed', note: null, outcome: 'answered' }), question, TODAY)).toEqual([])
  })

  it('RQS-05 PPL-04: more time runs past the current due day, at most 90 days after receipt, and is told on or before the due day', () => {
    const extend = (change: Partial<StepDraft>, on: StepCase = kase) =>
      stepProblems(step({ step: 'extended', note: null, extendedTo: '2026-12-01', ...change }), on, TODAY)
    expect(extend({})).toEqual([])
    for (const extendedTo of ['2026-11-18', '2026-11-01', '2027-01-18', null]) {
      expect(extend({ extendedTo }), String(extendedTo)).toEqual(['extension_range'])
    }
    // 90 days after the day received is the last day it may run to.
    expect(extend({ extendedTo: '2027-01-17' })).toEqual([])
    // A request already past its due day: more time told now is late, so it stays late.
    const overdue = { ...kase, receivedOn: '2026-09-01', dueOn: '2026-10-01' }
    expect(extend({ onDay: '2026-10-02', extendedTo: '2026-11-15' }, overdue)).toEqual(['extension_told_late'])
    expect(extend({ onDay: '2026-10-01', extendedTo: '2026-11-15' }, overdue)).toEqual([])
    for (const kind of ['correction'] as const) expect(extend({}, { ...kase, kind }), kind).toEqual([])
  })

  it('RQS-05 PD-91: a refusal says why and is for a copy, a correction or an objection; logged in error is for a request the DPO logged; answering a copy or a correction needs identity checked', () => {
    const close = (change: Partial<StepDraft>, on: StepCase = kase) =>
      stepProblems(step({ step: 'closed', note: null, ...change }), on, TODAY)
    expect(close({ outcome: 'refused' })).toEqual(['refusal_why'])
    expect(close({ outcome: 'refused', note: 'It would reveal another person’s data.' })).toEqual([])
    for (const kind of ['question', 'complaint', 'withdrawal'] as const) {
      expect(close({ outcome: 'refused', note: 'Why' }, { ...kase, kind }), kind).toEqual(['refusal_kind'])
    }
    expect(close({ outcome: 'logged_in_error' })).toEqual(['logged_in_error_form'])
    expect(close({ outcome: 'logged_in_error' }, { ...kase, cameBy: 'email' })).toEqual([])
    for (const kind of IDENTITY_KINDS) {
      expect(close({ outcome: 'answered' }, { ...kase, kind }), kind).toEqual(['identity_first'])
      expect(close({ outcome: 'answered' }, { ...kase, kind, identityChecked: true }), kind).toEqual([])
    }
  })

  it('RQS-05 DB-03: a request at 100 steps takes no other step, but can still be closed', () => {
    const full = { ...kase, revision: CASE_STEPS_MAX, identityChecked: true }
    expect(stepProblems(step({}), full, TODAY)).toEqual(['too_many_steps'])
    expect(stepProblems(step({ step: 'closed', note: null, outcome: 'answered' }), full, TODAY)).toEqual([])
    expect(stepProblems(step({}), { ...full, revision: CASE_STEPS_MAX - 1 }, TODAY)).toEqual([])
    // A closed request's revision counts its closure too.
    const closedFull = { ...refusedCopy, revision: CASE_STEPS_MAX + 1 }
    expect(stepProblems(step({}), closedFull, TODAY)).toEqual(['too_many_steps'])
    expect(stepProblems(step({}), { ...closedFull, revision: CASE_STEPS_MAX }, TODAY)).toEqual([])
    expect(stepsAllowed(full)).toEqual(['closed'])
  })

  it('RQS-05: every problem at once comes in STEP_PROBLEMS order, add_case_step()’s', () => {
    expect(STEP_PROBLEMS[0]).toBe('too_many_steps')
    const full = { ...kase, revision: CASE_STEPS_MAX }
    const draft = step({ step: 'note', onDay: '2026-01-01', note: `S1234567D ${'x'.repeat(2000)}`, kind: 'question' })
    expect(stepProblems(draft, full, TODAY)).toEqual([
      'too_many_steps',
      'day_range',
      'note_too_long',
      'note_id_number',
      'step_fields',
    ])
  })
})

describe('RQS-06 C0.9 PD-96 PD-97 PD-98: the bodies are strict, and each answer refuses a row past its cap', () => {
  it('RQS-06 PD-96: a request names its kind, what they wrote (none only for a copy) and its client key; the requester is never the body’s', () => {
    const body = { kind: 'question', details: '  Which records do you hold?\r\n ', key: KEY }
    expect(SendRequestBody.parse(body)).toEqual({ kind: 'question', details: 'Which records do you hold?', key: KEY })
    expect(SendRequestBody.parse({ ...body, details: '  ' }).details).toBeNull()
    expect(SendRequestBody.parse({ ...body, details: null }).details).toBeNull()
    for (const bad of [
      { ...body, kind: 'incident' },
      { ...body, key: KEY.toUpperCase() },
      { ...body, key: undefined },
      { ...body, person: PERSON },
      { ...body, contact: 'me@requester.example' },
      { ...body, details: 'x'.repeat(20_001) },
    ]) {
      expect(SendRequestBody.safeParse(bad).success, JSON.stringify(bad).slice(0, 100)).toBe(false)
    }
  })

  it('RQS-06 PD-89 PPL-01 PPL-14: a logged request names one requester, a channel with its address or neither for a person, and takes no identity note', () => {
    const body = {
      kind: 'complaint',
      cameBy: 'phone',
      receivedOn: '2026-10-20',
      requester: { type: 'outside', name: ' Wei Ling Ong ', channel: 'phone', contact: '+65 8000 0151' },
      details: 'Says a colleague shared her number.',
      key: KEY,
    }
    expect(LogRequestBody.parse(body).requester).toEqual({
      type: 'outside',
      name: 'Wei Ling Ong',
      channel: 'phone',
      contact: '+65 8000 0151',
    })
    const person = { type: 'person', person: PERSON }
    expect(LogRequestBody.parse({ ...body, requester: person }).requester).toEqual(person)
    const reach = { ...person, channel: 'email', contact: 'former@requester.example' }
    expect(LogRequestBody.parse({ ...body, requester: reach }).requester).toEqual(reach)
    for (const bad of [
      { ...body, cameBy: 'hearth' },
      { ...body, receivedOn: '20 Oct 2026' },
      { ...body, requester: { ...person, channel: 'email' } },
      { ...body, requester: { ...person, contact: 'former@requester.example' } },
      { ...body, requester: { ...person, person: PERSON.toUpperCase() } },
      { ...body, requester: { ...person, name: 'Wei Ling Ong' } },
      { ...body, requester: { type: 'outside', name: 'Wei Ling Ong', channel: 'phone' } },
      { ...body, requester: { type: 'visitor', name: 'Wei Ling Ong' } },
      { ...body, identity: 'Checked against HR records' },
      { ...body, key: 'one' },
    ]) {
      expect(LogRequestBody.safeParse(bad).success, JSON.stringify(bad).slice(0, 120)).toBe(false)
    }
  })

  it('RQS-06 PD-91: a step carries exactly the fields it takes, from the revision the sheet showed', () => {
    const base = {
      case: CASE,
      seen: 2,
      step: 'note',
      onDay: TODAY,
      note: 'Called them.',
      extendedTo: null,
      kind: null,
      outcome: null,
    }
    expect(CaseStepBody.parse(base)).toEqual(base)
    const takes = [
      { step: 'extended', extendedTo: '2026-12-01' },
      { step: 'reclassified', kind: 'correction' },
      { step: 'closed', outcome: 'answered' },
    ]
    for (const change of takes) expect(CaseStepBody.safeParse({ ...base, ...change }).success, change.step).toBe(true)
    for (const bad of [
      { ...base, step: 'extended' },
      { ...base, step: 'reclassified' },
      { ...base, step: 'closed' },
      { ...base, extendedTo: '2026-12-01' },
      { ...base, kind: 'question' },
      { ...base, outcome: 'answered' },
      { ...base, case: CASE.toUpperCase() },
      { ...base, seen: -1 },
      { ...base, seen: 1.5 },
      { ...base, step: 'deleted' },
      { ...base, by: PERSON },
    ]) {
      expect(CaseStepBody.safeParse(bad).success, JSON.stringify(bad).slice(0, 120)).toBe(false)
    }
  })

  it('RQS-06: the write answers are the case, its reference and days, and whether this call recorded it; a step answers its revision', () => {
    const sent = { case: CASE, reference: REFERENCE, receivedOn: '2026-10-26', dueOn: '2026-11-09', changed: true }
    expect(SendRequestResponse.parse(sent)).toEqual(sent)
    for (const bad of [
      { ...sent, reference: 'K7QM-X3TD' },
      { ...sent, reference: 'k7qmx3td' },
      { ...sent, kind: 'complaint' },
      { ...sent, dueOn: null },
    ]) {
      expect(SendRequestResponse.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
    }
    expect(SendRequestResponseForClient.parse({ ...sent, reference: 'k7qm-x3td', later: 1 }).reference).toBe(REFERENCE)
    const logged = { case: CASE, reference: REFERENCE, dueOn: '2026-11-03', changed: false }
    expect(LogRequestResponse.parse(logged)).toEqual(logged)
    expect(LogRequestResponseForClient.parse(logged)).toEqual(logged)
    expect(CaseStepResponse.parse({ revision: 101 })).toEqual({ revision: 101 })
    expect(CaseStepResponse.safeParse({ revision: 0 }).success).toBe(false)
    expect(CaseStepResponse.safeParse({ revision: 102 }).success).toBe(false)
  })

  // Rows of each list, fictional.
  const mine = {
    id: CASE,
    reference: REFERENCE,
    kind: 'complaint',
    cameBy: 'hearth',
    receivedOn: '2026-10-27',
    state: 'received',
    dueOn: '2026-11-10',
    repliedOn: null,
    repliedInTime: false,
    closedOn: null,
  }
  const closedMine = { ...mine, state: 'closed', dueOn: null, closedOn: '2026-11-06' }
  const queueRow = {
    id: CASE,
    reference: REFERENCE,
    kind: 'complaint',
    cameBy: 'hearth',
    receivedOn: '2026-10-27',
    dueOn: '2026-11-10',
    repliedOn: '2026-11-04',
    repliedInTime: true,
    revision: 2,
    state: 'in_progress',
    requester: { type: 'person', name: 'Marcus Tan', department: 'Operations', left: false },
    closedOn: null,
    outcome: null,
  }
  const closedRow = {
    ...queueRow,
    state: 'closed',
    dueOn: null,
    revision: 3,
    closedOn: '2026-11-06',
    outcome: 'answered',
  }

  it('RQS-06 PD-97: your requests never carry your words, notes, steps or outcome; a closed one has its day and no due day', () => {
    const answer = { today: TODAY, requests: [mine, closedMine], more: false, open: 1 }
    expect(MyRequestsResponse.parse(answer)).toEqual(answer)
    for (const bad of [
      { ...answer, requests: [{ ...mine, details: 'My words' }] },
      { ...answer, requests: [{ ...mine, outcome: 'answered' }] },
      { ...answer, requests: [{ ...closedMine, dueOn: '2026-11-10' }] },
      { ...answer, requests: [{ ...mine, state: 'closed' }] },
      { ...answer, requests: [{ ...mine, dueOn: null }] },
      { ...answer, requests: [{ ...mine, repliedInTime: true }] },
      { ...answer, requests: [{ ...mine, state: 'new' }] },
      { ...answer, requests: Array.from({ length: CASE_MINE_MAX + 1 }, () => mine) },
    ]) {
      expect(MyRequestsResponse.safeParse(bad).success, JSON.stringify(bad).slice(0, 120)).toBe(false)
    }
    expect(MyRequestsResponse.safeParse({ ...answer, requests: Array(CASE_MINE_MAX).fill(mine) }).success).toBe(true)
  })

  it('RQS-06 PD-98: the queue’s rows carry no address or words, the open list never more than its total, and each list only its own', () => {
    const answer = { today: TODAY, open: [queueRow], openTotal: 1, closed: [closedRow], closedMore: false }
    expect(RequestQueueResponse.parse(answer)).toEqual(answer)
    const outsider = { ...queueRow, cameBy: 'email', requester: { type: 'outside', name: 'Wei Ling Ong' } }
    expect(RequestQueueResponse.safeParse({ ...answer, open: [outsider] }).success).toBe(true)
    for (const bad of [
      { ...answer, openTotal: 0 },
      { ...answer, open: [closedRow] },
      { ...answer, closed: [queueRow] },
      { ...answer, open: [{ ...queueRow, details: 'Their words' }] },
      { ...answer, open: [{ ...queueRow, requester: { ...queueRow.requester, contact: 'x@requester.example' } }] },
      { ...answer, open: [{ ...queueRow, requester: { type: 'outside', name: 'Wei', channel: 'email' } }] },
      { ...answer, open: [{ ...queueRow, reference: 'K7QM-3XTD' }] },
      { ...answer, open: Array(CASE_QUEUE_OPEN_MAX + 1).fill(queueRow), openTotal: 500 },
      { ...answer, closed: Array(CASE_QUEUE_CLOSED_MAX + 1).fill(closedRow) },
    ]) {
      expect(RequestQueueResponse.safeParse(bad).success, JSON.stringify(bad).slice(0, 120)).toBe(false)
    }
    expect(
      RequestQueueResponse.safeParse({ ...answer, open: Array(CASE_QUEUE_OPEN_MAX).fill(queueRow), openTotal: 500 })
        .success,
    ).toBe(true)
  })

  const detail = {
    id: CASE,
    reference: REFERENCE,
    kind: 'access',
    receivedKind: 'question',
    cameBy: 'email',
    receivedOn: '2026-10-20',
    loggedOn: '2026-10-21',
    loggedBy: 'Ashton Teo',
    requester: {
      type: 'person',
      person: PERSON,
      name: 'Marcus Tan',
      department: 'Operations',
      manager: 'Nadia Rahman',
      leftOn: '2026-09-30',
      channel: 'email',
      contact: 'former@requester.example',
    },
    details: 'Asks for a copy of their personnel file.',
    dueOn: '2026-11-03',
    repliedOn: null,
    repliedInTime: false,
    revision: 2,
    state: 'in_progress',
    identityChecked: true,
    reviewOpen: false,
    closedOn: null,
    closedKind: null,
    outcome: null,
    closedNote: null,
    closedBy: null,
  }
  const stepRow = {
    number: 1,
    step: 'reclassified',
    onDay: '2026-10-21',
    note: null,
    extendedTo: null,
    kind: 'access',
    recordedOn: '2026-10-21',
    recordedBy: 'Ashton Teo',
  }
  const other = {
    id: 'c0000000-0000-4000-8000-000000000002',
    reference: 'BCDFG345',
    kind: 'question',
    cameBy: 'hearth',
    receivedOn: '2026-08-01',
    state: 'closed',
    dueOn: null,
    repliedInTime: true,
    closedOn: '2026-08-05',
    outcome: 'logged_in_error',
  }

  it('RQS-06 PD-98 PPL-07: a case’s sheet holds the request, its steps, the same person’s other requests and a withdrawal’s reply, each bounded', () => {
    const answer = { today: TODAY, case: detail, steps: [stepRow], others: [other], othersMore: false, reply: null }
    expect(CaseResponse.parse(answer)).toEqual(answer)
    const outsider = {
      ...detail,
      requester: { type: 'outside', name: 'Wei Ling Ong', channel: 'post', contact: '2 Example Lane\nSingapore' },
    }
    expect(CaseResponse.safeParse({ ...answer, case: outsider, others: [] }).success).toBe(true)
    const withdrawal = { ...detail, kind: 'withdrawal' }
    expect(CaseResponse.safeParse({ ...answer, case: withdrawal, reply: 'Your reference: K7QM-X3TD' }).success).toBe(
      true,
    )
    const closed = {
      ...detail,
      state: 'closed',
      closedOn: '2026-10-25',
      closedKind: 'access',
      outcome: 'refused',
      closedNote: 'It would reveal another person’s data.',
      closedBy: 'Ashton Teo',
    }
    expect(CaseResponse.safeParse({ ...answer, case: closed }).success).toBe(true)
    for (const bad of [
      { ...answer, reply: 'A reply for a copy' },
      { ...answer, case: outsider },
      { ...answer, case: { ...outsider, others: [] }, othersMore: true },
      { ...answer, case: { ...detail, requester: { ...detail.requester, channel: null } } },
      { ...answer, case: { ...detail, requester: { ...detail.requester, contact: 'not an address' } } },
      { ...answer, case: { ...detail, closedOn: '2026-10-25' } },
      { ...answer, case: { ...closed, outcome: null } },
      { ...answer, case: { ...detail, dueOn: null } },
      { ...answer, case: { ...detail, details: null } },
      { ...answer, case: { ...detail, subject: PERSON } },
      { ...answer, steps: [{ ...stepRow, step: 'closed' }] },
      { ...answer, steps: [{ ...stepRow, kind: null }] },
      { ...answer, steps: Array(CASE_STEPS_MAX + 1).fill(stepRow) },
      { ...answer, others: Array(CASE_OTHERS_MAX + 1).fill(other) },
      { ...answer, reply: 'x'.repeat(20_001) },
    ]) {
      expect(CaseResponse.safeParse(bad).success, JSON.stringify(bad).slice(0, 140)).toBe(false)
    }
    // Only a copy of their data sent in Hearth comes with nothing written.
    const empty = { ...detail, kind: 'access', receivedKind: 'access', cameBy: 'hearth', details: null }
    expect(CaseResponse.safeParse({ ...answer, case: empty }).success).toBe(true)
  })

  it('RQS-06 PD-89: the people the DPO picks from are current and former, roster facts only, at most 2,000', () => {
    const person = {
      id: PERSON,
      name: 'Marcus Tan',
      department: 'Operations',
      manager: null,
      addedOn: '2026-01-05',
      leftOn: null,
    }
    const answer = { people: [person, { ...person, leftOn: '2026-09-30' }], more: false }
    expect(CasePeopleResponse.parse(answer)).toEqual(answer)
    for (const bad of [
      { ...answer, people: [{ ...person, phone: '+65 8000 0151' }] },
      { ...answer, people: [{ ...person, roles: ['dpo'] }] },
      { ...answer, people: Array(CASE_PEOPLE_MAX + 1).fill(person) },
      { people: [person] },
    ]) {
      expect(CasePeopleResponse.safeParse(bad).success, JSON.stringify(bad).slice(0, 120)).toBe(false)
    }
  })

  it('RQS-06 P6: the web app’s readers keep what they can read and say what they couldn’t', () => {
    const read = CaseResponseForClient.parse({
      today: TODAY,
      case: { ...detail, reference: 'k7qm-x3td', loggedBy: 7, later: 1 },
      steps: [stepRow, { number: 'two' }],
      others: [other],
      othersMore: 'perhaps',
      reply: 7,
    })
    expect(read.case.reference).toBe(REFERENCE)
    expect(read.case.loggedBy).toBeNull()
    expect(read.steps).toEqual({ rows: [stepRow], complete: false })
    expect(read.others).toEqual({ rows: [other], complete: true })
    expect(read.othersMore).toBe(true)
    expect(read.reply).toBeNull()
    // A request it can't read fails the read, so the sheet never shows a wrong one.
    expect(CaseResponseForClient.safeParse({ today: TODAY, case: { ...detail, kind: 'incident' } }).success).toBe(false)
    const people = CasePeopleResponseForClient.parse({
      people: [{ id: PERSON, name: 'Marcus Tan', department: 7, manager: null, addedOn: '2026-01-05', leftOn: null }],
    })
    expect(people).toEqual({
      people: {
        rows: [
          { id: PERSON, name: 'Marcus Tan', department: null, manager: null, addedOn: '2026-01-05', leftOn: null },
        ],
        complete: true,
      },
      more: true,
    })
  })
})

describe('RQS-07 C0.9 PD-98 P6: listedRows() says when rows were dropped', () => {
  const row = z.object({ n: z.int() })
  const list = z.object({ items: listedRows(row, 3) })

  it('RQS-07: every row read and none past the cap is complete; an unreadable row or one too many marks it incomplete', () => {
    expect(list.parse({ items: [{ n: 1 }, { n: 2 }] }).items).toEqual({ rows: [{ n: 1 }, { n: 2 }], complete: true })
    expect(list.parse({ items: [] }).items).toEqual({ rows: [], complete: true })
    expect(list.parse({ items: [{ n: 1 }, 'x', { n: 3 }] }).items).toEqual({
      rows: [{ n: 1 }, { n: 3 }],
      complete: false,
    })
    expect(list.parse({ items: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }] }).items).toEqual({
      rows: [{ n: 1 }, { n: 2 }, { n: 3 }],
      complete: false,
    })
  })

  it('RQS-07: a list that can’t be read at all, or is missing, reads as empty and incomplete, never as “No open requests.”', () => {
    for (const items of [null, 'rows', { n: 1 }, 7]) {
      expect(list.parse({ items }).items, JSON.stringify(items)).toEqual({ rows: [], complete: false })
    }
    expect(list.parse({}).items).toEqual({ rows: [], complete: false })
  })

  it('RQS-07 PD-98: the queue’s more reads true and its total null when unreadable', () => {
    const read = RequestQueueResponseForClient.parse({ today: TODAY, open: 'x', openTotal: 'many', closed: [] })
    expect(read).toEqual({
      today: TODAY,
      open: { rows: [], complete: false },
      openTotal: null,
      closed: { rows: [], complete: true },
      closedMore: true,
    })
    const mine = MyRequestsResponseForClient.parse({ today: TODAY, requests: [], open: -1 })
    expect(mine).toEqual({ today: TODAY, requests: { rows: [], complete: true }, more: true, open: null })
  })
})

describe('RQS-08 C0.9 PD-104 PPL-09: the reference', () => {
  it('RQS-08: eight symbols with no vowel, Y, 0, 1 or L, the first and fifth letters, as 0012’s check', () => {
    for (const reference of ['K7QMX3TD', 'BCDFG345', 'Z999Z999', 'BBBBBBBB']) {
      expect(CASE_REFERENCE_PATTERN.test(reference), reference).toBe(true)
    }
    for (const reference of [
      'K7QM3XTD',
      '7KQMX3TD',
      'A7QMX3TD',
      'K7QMX3TY',
      'K0QMX3TD',
      'K1QMX3TD',
      'KLQMX3TD',
      'k7qmx3td',
      'K7QM-X3TD',
      'K7QMX3T',
      'K7QMX3TDD',
    ]) {
      expect(CASE_REFERENCE_PATTERN.test(reference), reference).toBe(false)
    }
  })

  it('RQS-08 PPL-09: this design’s example parses however it is typed, and K7QM-3XTD is no reference', () => {
    for (const typed of ['K7QM-X3TD', 'k7qm-x3td', ' K7QM X3TD ', 'K7QMX3TD', 'K7QM\u2013X3TD', 'k 7 q m - x 3 t d']) {
      expect(parseCaseReference(typed), typed).toBe(REFERENCE)
    }
    for (const typed of ['K7QM-3XTD', '', 'K7QM_X3TD', 'K7QM.X3TD']) expect(parseCaseReference(typed), typed).toBeNull()
  })

  it('RQS-08: formatted in two groups of four, and spelled symbol by symbol for a screen reader', () => {
    const reference = parseCaseReference('k7qmx3td')
    expect(reference).not.toBeNull()
    if (reference === null) return
    expect(formatCaseReference(reference)).toBe('K7QM-X3TD')
    expect(spelledReference(reference)).toBe('K 7 Q M, X 3 T D')
  })
})

describe('RQS-09 C0.9 OD-16 DB-04 PD-113: the ID-number and bidirectional shapes', () => {
  it('RQS-09 OD-16: an NRIC or FIN shape alone, in either case, at a word’s edges; never inside a longer run', () => {
    for (const text of ['S1234567D', 't7654321j', 'NRIC S1234567D.', '(G1234567N)', 'F1234567X M7654321K']) {
      expect(ID_NUMBER_SHAPE.test(text), text).toBe(true)
    }
    for (const text of ['S123456D', 'S12345678D', 'XS1234567D', 'S1234567DX', 'A1234567D', '12345678', 'S1234567']) {
      expect(ID_NUMBER_SHAPE.test(text), text).toBe(false)
    }
    // ASCII only, so JavaScript and Postgres read the shape alike.
    expect(ID_NUMBER_SHAPE.source).toMatch(/^[\x20-\x7e]+$/)
  })

  it('RQS-09 DB-04: every embedding, override and isolate character, and nothing else, and the constant holds none of them raw', () => {
    for (const bidi of BIDI) expect(BIDI_FORMATTING.test(`a${bidi}b`), bidi.codePointAt(0)?.toString(16)).toBe(true)
    for (const other of [0x200e, 0x200f, 0x061c, 0x2029, 0x2065, 0x206a, 0x202f]) {
      expect(BIDI_FORMATTING.test(`a${char(other)}b`), other.toString(16)).toBe(false)
    }
    // Written as \u escapes (Trojan Source).
    expect(BIDI_FORMATTING.source).toBe('[\\u202A-\\u202E\\u2066-\\u2069]')
    for (const bidi of BIDI) expect(BIDI_FORMATTING.source.includes(bidi)).toBe(false)
    expect(BIDI_FORMATTING.source).toMatch(/^[\x20-\x7e]+$/)
  })

  it('RQS-09: a requester’s address is held to its channel’s shape', () => {
    expect(contactInShape('email', 'weiling@requester.example')).toBe(true)
    expect(contactInShape('email', 'wei ling@requester.example')).toBe(false)
    expect(contactInShape('phone', '+65 8000 0151')).toBe(true)
    expect(contactInShape('phone', '8000 0151')).toBe(false)
    expect(contactInShape('post', '2 Example Lane\nSingapore 000002')).toBe(true)
    expect(contactInShape('post', `2 Example Lane${BIDI[6]}`)).toBe(false)
  })
})

describe('RQS-10 C0.9 OD-08 PD-90 PD-91 PD-97 PD-98: the kind lists, the states and the steps offered', () => {
  it('RQS-10 OD-08: copies and corrections count calendar days and may have more time; they alone need identity checked; a copy, a correction or an objection can be refused', () => {
    expect([...CALENDAR_KINDS]).toEqual(['access', 'correction'])
    expect([...EXTENDABLE_KINDS]).toEqual(['access', 'correction'])
    expect([...IDENTITY_KINDS]).toEqual(['access', 'correction'])
    expect([...REFUSABLE_KINDS]).toEqual(['access', 'correction', 'objection'])
    for (const kind of [...CALENDAR_KINDS, ...REFUSABLE_KINDS])
      expect(CASE_KINDS as readonly string[], kind).toContain(kind)
    expect(REFUSABLE_KINDS as readonly string[]).not.toContain('withdrawal')
  })

  it('RQS-10 PD-97 PD-98: a requester sees received, in progress, more time or closed; the queue new, in progress or more time', () => {
    expect([...MY_STATES]).toEqual(['received', 'in_progress', 'more_time', 'closed'])
    expect([...QUEUE_STATES]).toEqual(['new', 'in_progress', 'more_time'])
    expect([...CASE_STATES]).toEqual([...QUEUE_STATES, 'closed'])
  })

  it('RQS-10 PD-90 PD-91: the sheet offers only the steps the request allows', () => {
    const open = STEP_INPUTS.filter(input => input !== 'review_started' && input !== 'review_ended')
    expect(stepsAllowed(kase)).toEqual(open)
    expect(stepsAllowed({ ...kase, kind: 'complaint' })).toEqual(open.filter(input => input !== 'extended'))
    expect(stepsAllowed(refusedCopy)).toEqual(['note', 'review_started'])
    expect(stepsAllowed({ ...refusedCopy, reviewOpen: true })).toEqual(['note', 'review_ended'])
    expect(stepsAllowed({ ...refusedCopy, outcome: 'answered' })).toEqual(['note'])
    // Each one offered holds nothing back for its own sake once its fields are filled.
    const filled: Record<string, Partial<StepDraft>> = {
      acknowledged: { note: null },
      identity_checked: { note: 'By video call' },
      replied: { note: null },
      extended: { note: null, extendedTo: '2026-12-01' },
      reclassified: { note: null, kind: 'objection' },
      note: {},
      closed: { note: null, outcome: 'withdrawn' },
    }
    for (const input of stepsAllowed(kase)) {
      expect(stepProblems(step({ step: input, ...filled[input] }), kase, TODAY), input).toEqual([])
    }
  })
})
