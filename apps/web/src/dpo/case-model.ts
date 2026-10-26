// The DPO's case sheet and log dialog, pure (PDPA-04, PDPA-13; C0.9 OD-14, OD-16, PD-89 to PD-91,
// PD-98, PD-105, PD-112, PPL-01, PPL-04, PPL-07, PPL-13, PPL-14): the sheet's facts and steps, the
// steps a case offers and what holds one back, the log dialog's people and what holds an intake
// back, and what a refused write says, so every state is tested in Node with no DOM
// (dpo/requests-model.test.ts, RQW-08, RQW-09). The rules are packages/shared's (stepsAllowed,
// stepProblems, logProblems), which the routes run before 0012's add_case_step() and log_case() and
// the functions enforce again; this module only feeds them what the sheet or dialog would send and
// words their codes (strings/dpo-case.ts). Every day is the org's, as the server sent it, and the
// ranges are decided from the answer's own today, never the browser's clock. The sheet and the
// dialog load it with their own lazy chunks.
import {
  type AddCaseStepJSON,
  CASE_RECEIVED_BACK_DAYS,
  type CaseDetailForClient,
  type CaseForClient,
  type CaseKind,
  type CasePeopleForClient,
  type CasePersonForClient,
  type CaseReference,
  type CaseStepForClient,
  caseText,
  formatCaseReference,
  LOGGED_CAME_BY,
  type LoggedCameBy,
  type LogProblem,
  type LogRequestJSON,
  logProblems,
  type OtherCaseForClient,
  OUTCOMES,
  type Outcome,
  REFUSABLE_KINDS,
  type RequesterChannel,
  type StepCase,
  type StepInput,
  type StepProblem,
  spelledReference,
  stepProblems,
  stepsAllowed,
} from '@hearth/shared'
import { dayText } from '@/lib/time.ts'
import { CASE_COPY, CHANNEL_LABELS, LOG_PROBLEM_COPY, STEP_NAMES, STEP_PROBLEM_COPY } from '@/strings/dpo-case.ts'
import {
  CAME_BY_LABELS,
  CASE_KIND_LABELS,
  CASE_STATE_LABELS,
  OUTCOME_LABELS,
  REQUESTS_COPY,
} from '@/strings/dpo-requests.ts'
import { type Fact, failureOf, type Refusal, refusalOf } from './model.ts'
import { dueWords } from './requests-model.ts'

// --- The case sheet ------------------------------------------------------------------------------

// The case as stepProblems() and stepsAllowed() read it.
export const stepCaseOf = (kase: CaseDetailForClient): StepCase => ({
  kind: kase.kind,
  cameBy: kase.cameBy,
  receivedOn: kase.receivedOn,
  dueOn: kase.dueOn,
  revision: kase.revision,
  closedOn: kase.closedOn,
  closedKind: kase.closedKind,
  outcome: kase.outcome,
  identityChecked: kase.identityChecked,
  reviewOpen: kase.reviewOpen,
})

export const sheetTitle = (kase: Pick<CaseDetailForClient, 'kind' | 'reference'>): string =>
  CASE_COPY.sheetTitle(CASE_KIND_LABELS[kase.kind], formatCaseReference(kase.reference))

// Who sent it, on the sheet (PPL-01, PPL-07): a person's name, department, manager and the day
// they left, with the channel and address the case records, and their id for a break-glass
// citation; or someone without an account, by name, with their channel and address. Each address is
// plain text the DPO copies into their own mail: never a link.
export interface SheetRequester {
  readonly lines: readonly string[]
  readonly reach: { readonly channel: string; readonly contact: string } | undefined
  readonly personId: string | undefined
}

export function sheetRequester(requester: CaseDetailForClient['requester']): SheetRequester {
  const reach =
    requester.channel === null || requester.contact === null
      ? undefined
      : { channel: CHANNEL_LABELS[requester.channel], contact: requester.contact }
  if (requester.type === 'outside') {
    return { lines: [requester.name, CASE_COPY.requester.noAccount], reach, personId: undefined }
  }
  return {
    lines: [
      requester.department === null
        ? requester.name
        : REQUESTS_COPY.requester.person(requester.name, requester.department),
      ...(requester.manager === null ? [] : [CASE_COPY.requester.manager(requester.manager)]),
      ...(requester.leftOn === null ? [] : [CASE_COPY.requester.leftOn(dayText(requester.leftOn))]),
    ],
    reach,
    personId: requester.person,
  }
}

// The latest step of a kind, as the answer lists them oldest first.
const latestStep = (steps: readonly CaseStepForClient[], step: CaseStepForClient['step']) =>
  steps.filter(each => each.step === step).at(-1)

// The sheet's facts: how it came, the days received and logged, the due line, whether identity
// has been checked, a copy's or a correction's more time, an open PDPC review, and the closure.
export function caseFacts(answer: CaseForClient): Fact[] {
  const kase = answer.case
  const steps = answer.steps.rows
  const identity = latestStep(steps, 'identity_checked')
  const extended = latestStep(steps, 'extended')
  const due = kase.closedOn === null ? dueWords(kase, answer.today) : undefined
  const facts: Fact[] = [
    { term: CASE_COPY.facts.cameBy, value: CAME_BY_LABELS[kase.cameBy] },
    { term: CASE_COPY.facts.received, value: dayText(kase.receivedOn) },
  ]
  if (kase.cameBy !== 'hearth') {
    facts.push({
      term: CASE_COPY.facts.logged,
      value: CASE_COPY.loggedOn(dayText(kase.loggedOn), kase.loggedBy),
    })
  }
  if (due !== undefined) facts.push({ term: CASE_COPY.facts.due, value: due.text })
  facts.push({
    term: CASE_COPY.facts.identity,
    value: !kase.identityChecked
      ? CASE_COPY.facts.notChecked
      : identity?.note == null
        ? CASE_COPY.facts.checkedNoNote
        : CASE_COPY.facts.checked(identity.note),
  })
  if (extended?.extendedTo != null) {
    facts.push({ term: CASE_COPY.facts.moreTime, value: CASE_COPY.extendedTo(dayText(extended.extendedTo)) })
  }
  if (kase.reviewOpen) facts.push({ term: CASE_COPY.facts.review, value: CASE_COPY.facts.reviewOpen })
  if (kase.closedOn !== null && kase.outcome !== null) {
    facts.push({
      term: CASE_COPY.facts.closed,
      value: REQUESTS_COPY.closedOn(dayText(kase.closedOn), OUTCOME_LABELS[kase.outcome]),
    })
  }
  return facts
}

// One line of the steps list, oldest first, then the closure: what happened, its day, its note (the
// DPO's own words, shown as text), what it set (a new date, the kind now) and who recorded it.
export interface StepLine {
  readonly key: string
  readonly name: string
  readonly day: string
  readonly note: string | null
  readonly detail: string | undefined
  readonly recorded: string
}

export function stepLines(kase: CaseDetailForClient, steps: readonly CaseStepForClient[]): StepLine[] {
  const lines = steps.map(step => ({
    key: String(step.number),
    name: STEP_NAMES[step.step],
    day: dayText(step.onDay),
    note: step.note,
    detail:
      step.extendedTo !== null
        ? CASE_COPY.extendedTo(dayText(step.extendedTo))
        : step.kind !== null
          ? CASE_COPY.kindNowLine(CASE_KIND_LABELS[step.kind])
          : undefined,
    recorded: CASE_COPY.recorded(dayText(step.recordedOn), step.recordedBy),
  }))
  if (kase.closedOn !== null && kase.outcome !== null) {
    lines.push({
      key: 'closed',
      name: CASE_COPY.closure(OUTCOME_LABELS[kase.outcome]),
      day: dayText(kase.closedOn),
      note: kase.closedNote,
      detail: undefined,
      recorded: CASE_COPY.recorded(dayText(kase.closedOn), kase.closedBy),
    })
  }
  return lines
}

// Another request from the same person (PPL-07), as a button in the sheet.
export interface OtherLine {
  readonly id: string
  readonly kind: string
  readonly reference: string
  readonly referenceLabel: string
  readonly state: string
  readonly days: string
}

export function otherLine(row: OtherCaseForClient, today: string): OtherLine {
  const due = row.closedOn === null ? dueWords({ ...row, repliedOn: null }, today) : undefined
  return {
    id: row.id,
    kind: CASE_KIND_LABELS[row.kind],
    reference: formatCaseReference(row.reference),
    referenceLabel: REQUESTS_COPY.referenceLabel(spelledReference(row.reference)),
    state: CASE_STATE_LABELS[row.state],
    days: [
      REQUESTS_COPY.received(dayText(row.receivedOn)),
      row.closedOn !== null && row.outcome !== null
        ? REQUESTS_COPY.closedOn(dayText(row.closedOn), OUTCOME_LABELS[row.outcome])
        : due?.text,
    ]
      .filter(Boolean)
      .join(' · '),
  }
}

// --- Adding a step (RQW-08; PD-90, PD-91, PPL-04, PPL-14) ----------------------------------------

export interface StepForm {
  // '' before a step is chosen.
  readonly step: StepInput | ''
  // YYYY-MM-DD as a date input gives it: the day it happened (for more time, the day the requester
  // was told; for an identity check, the day it was checked).
  readonly onDay: string
  readonly note: string
  readonly extendedTo: string
  readonly kind: CaseKind | ''
  readonly outcome: Outcome | ''
}

export const emptyStep = (today: string): StepForm => ({
  step: '',
  onDay: today,
  note: '',
  extendedTo: '',
  kind: '',
  outcome: '',
})

// The outcomes a closure offers for this case: refused only for a kind that can be refused (by its
// kind now), and logged in error only for a request the DPO logged (PD-90).
export function outcomesFor(kase: StepCase): Outcome[] {
  return OUTCOMES.filter(outcome => {
    if (outcome === 'refused') return (REFUSABLE_KINDS as readonly CaseKind[]).includes(kase.kind)
    if (outcome === 'logged_in_error') return kase.cameBy !== 'hearth'
    return true
  })
}

// A step's problems in the sheet's words, naming what the step chosen needs.
export function stepProblemLine(code: StepProblem, form: StepForm): string {
  switch (code) {
    case 'step_fields':
      if (form.step === 'reclassified' && form.kind === '') return STEP_PROBLEM_COPY.kind_missing
      if (form.step === 'closed' && form.outcome === '') return STEP_PROBLEM_COPY.outcome_missing
      return STEP_PROBLEM_COPY.fields_other
    case 'note_missing':
      return form.step === 'identity_checked' ? STEP_PROBLEM_COPY.identity_missing : STEP_PROBLEM_COPY.note_missing
    default:
      return STEP_PROBLEM_COPY[code]
  }
}

export interface StepEditor {
  // The steps this case allows (stepsAllowed()), in their order.
  readonly offered: readonly StepInput[]
  readonly outcomes: readonly Outcome[]
  // What holds the save back, worded, in STEP_PROBLEMS' order; a step not chosen first.
  readonly problems: readonly string[]
  // POST /api/admin/requests/step's body, once nothing holds it back: the revision the sheet showed,
  // and exactly the fields the step takes.
  readonly body: AddCaseStepJSON | undefined
}

export function stepEditor(form: StepForm, kase: CaseDetailForClient, today: string): StepEditor {
  const stepCase = stepCaseOf(kase)
  const offered = stepsAllowed(stepCase)
  const outcomes = outcomesFor(stepCase)
  if (form.step === '' || !offered.includes(form.step)) {
    return { offered, outcomes, problems: [CASE_COPY.stepMissing], body: undefined }
  }
  const step = form.step
  const draft = {
    step,
    onDay: form.onDay === '' ? null : form.onDay,
    note: form.note,
    extendedTo: step === 'extended' ? (form.extendedTo === '' ? null : form.extendedTo) : null,
    kind: step === 'reclassified' ? (form.kind === '' ? null : form.kind) : null,
    outcome: step === 'closed' ? (form.outcome === '' ? null : form.outcome) : null,
  }
  const codes = stepProblems(draft, stepCase, today)
  return {
    offered,
    outcomes,
    problems: codes.map(code => stepProblemLine(code, form)),
    body:
      codes.length > 0 || draft.onDay === null
        ? undefined
        : {
            case: kase.id,
            seen: kase.revision,
            step,
            onDay: draft.onDay,
            note: caseText(form.note),
            extendedTo: draft.extendedTo,
            kind: draft.kind,
            outcome: draft.outcome,
          },
  }
}

// A refused step or intake, in the sheet's or dialog's words: 409 case_changed (the request moved
// since the sheet read it) offers Reload and keeps what was typed; 400 case_invalid (a rule the page
// didn't foresee) and 404 not_found say so; the rest as the register pages read them (the PIN step,
// a new sign-in, forbidden, or the server's words).
export function caseRefusalOf(error: unknown, invalid: string = CASE_COPY.invalid): Refusal {
  const failure = failureOf(error)
  if (failure.code === 'case_changed') return { kind: 'changed', text: CASE_COPY.changed }
  if (failure.code === 'case_invalid') return { kind: 'message', text: invalid }
  if (failure.code === 'not_found') return { kind: 'message', text: CASE_COPY.missing }
  return refusalOf(failure)
}

// A refused case read: a case that isn't there (or another org's) says so; the rest as a read.
export function caseReadRefusalOf(error: unknown): Refusal {
  const failure = failureOf(error)
  if (failure.code === 'not_found') return { kind: 'message', text: CASE_COPY.missing }
  return refusalOf(failure)
}

// --- Logging a request (RQW-09; OD-16, PD-89, PPL-01, PPL-13, PPL-14) ----------------------------

// The earliest day a request may be logged as received: a year before today (CASE_RECEIVED_BACK_DAYS),
// on the calendar, for the date input's min.
export function earliestReceived(today: string): string {
  const [year = 1, month = 1, date = 1] = today.split('-').map(Number)
  const day = new Date(0)
  day.setUTCFullYear(year, month - 1, date - CASE_RECEIVED_BACK_DAYS)
  return day.toISOString().slice(0, 10)
}

// The people a request may be logged for, as the dialog lists them: by name and department, "left
// on" a day for a leaver, then their manager and the day they were added where two would read the
// same. same: two still read the same after that, so neither can be picked (PD-76's safeguard).
export interface PeopleOptions {
  readonly options: readonly { readonly value: string; readonly label: string }[]
  readonly same: boolean
  // The ids nothing tells apart from someone else.
  readonly alike: ReadonlySet<string>
}

const repeated = (labels: readonly string[]): Set<string> => {
  const seen = new Set<string>()
  const twice = new Set<string>()
  for (const label of labels) {
    if (seen.has(label)) twice.add(label)
    seen.add(label)
  }
  return twice
}

export function peopleOptions(people: readonly CasePersonForClient[]): PeopleOptions {
  const words = CASE_COPY.people
  let labels = people.map(person => {
    const named = person.department === null ? person.name : words.withDepartment(person.name, person.department)
    return person.leftOn === null ? named : words.leftOn(named, dayText(person.leftOn))
  })
  let twice = repeated(labels)
  labels = labels.map((label, at) => {
    const manager = people[at]?.manager ?? null
    return twice.has(label) && manager !== null ? words.withManager(label, manager) : label
  })
  twice = repeated(labels)
  labels = labels.map((label, at) => {
    const person = people[at]
    return twice.has(label) && person !== undefined ? words.withAdded(label, dayText(person.addedOn)) : label
  })
  twice = repeated(labels)
  return {
    options: [
      { value: '', label: CASE_COPY.fields.choose },
      ...people.map((person, at) => ({ value: person.id, label: labels[at] ?? person.name })),
    ],
    same: twice.size > 0,
    alike: new Set(people.filter((_, at) => twice.has(labels[at] ?? '')).map(person => person.id)),
  }
}

export interface LogForm {
  readonly kind: CaseKind | ''
  readonly cameBy: LoggedCameBy | ''
  // YYYY-MM-DD; today in the org's zone by default.
  readonly receivedOn: string
  readonly who: 'member' | 'outside'
  // A person's id, or '' before one is chosen.
  readonly person: string
  readonly name: string
  // '' for none given (a person at the organisation who isn't a leaver may give none).
  readonly channel: RequesterChannel | ''
  readonly contact: string
  readonly details: string
}

export const emptyLog = (today: string): LogForm => ({
  kind: '',
  cameBy: '',
  receivedOn: today,
  who: 'member',
  person: '',
  name: '',
  channel: '',
  contact: '',
  details: '',
})

export interface LogEditor {
  // The person picked, when they have left: How to reach them is required (PPL-01).
  readonly leaver: boolean
  // What holds the intake back, worded: the kind, then the person (or two people nothing tells
  // apart), then LOG_PROBLEMS' order.
  readonly problems: readonly string[]
  // POST /api/admin/requests/log's body, once nothing holds it back, with the dialog's key. No
  // identity field: "Checked who they are" is a step on the new case (PPL-14).
  readonly body: LogRequestJSON | undefined
}

export function logEditor(
  form: LogForm,
  people: CasePeopleForClient | undefined,
  options: PeopleOptions | undefined,
  today: string,
  key: string,
): LogEditor {
  const member = form.who === 'member'
  const picked = member ? people?.people.rows.find(person => person.id === form.person) : undefined
  const leaver = picked !== undefined && picked.leftOn !== null
  const channel = form.channel === '' ? null : form.channel
  const draft = {
    cameBy: form.cameBy === '' ? null : form.cameBy,
    receivedOn: form.receivedOn === '' ? null : form.receivedOn,
    person: member ? (picked?.id ?? null) : null,
    name: member ? null : form.name,
    channel,
    contact: form.contact,
    details: form.details,
  }
  const codes = logProblems(draft, today, picked === undefined ? undefined : { leftOn: picked.leftOn })
  // A person not picked yet is that, not a missing name: the name and its channel rules are for
  // someone without an account.
  const shown: LogProblem[] =
    member && picked === undefined
      ? codes.filter(code => !code.startsWith('name_') && code !== 'channel_missing')
      : codes
  const alike = picked !== undefined && (options?.alike.has(picked.id) ?? false)
  const problems = [
    ...(form.kind === '' ? [CASE_COPY.fields.kindMissing] : []),
    ...(member && picked === undefined ? [CASE_COPY.fields.personMissing] : []),
    ...(alike ? [CASE_COPY.people.same] : []),
    ...shown.map(code => LOG_PROBLEM_COPY[code]),
  ]
  const kind = form.kind
  const contact = caseText(form.contact)
  const body: LogRequestJSON | undefined =
    problems.length > 0 || kind === '' || draft.cameBy === null || draft.receivedOn === null
      ? undefined
      : {
          kind,
          cameBy: draft.cameBy,
          receivedOn: draft.receivedOn,
          requester:
            member && picked !== undefined
              ? channel === null || contact === null
                ? { type: 'person', person: picked.id }
                : { type: 'person', person: picked.id, channel, contact }
              : {
                  type: 'outside',
                  name: caseText(form.name) ?? '',
                  channel: channel ?? 'email',
                  contact: contact ?? '',
                },
          details: form.details,
          key,
        }
  return { leaver, problems, body }
}

// The ways a logged request can arrive, as the dialog offers them.
export const CAME_BY_OPTIONS = LOGGED_CAME_BY.map(value => ({ value, label: CAME_BY_LABELS[value] }))

// The reference as the sheet's banner and the confirmation quote it.
export const loggedLine = (reference: CaseReference): string => CASE_COPY.logged(formatCaseReference(reference))
