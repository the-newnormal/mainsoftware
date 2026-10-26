// What the DPO's case sheet and log dialog say (/dpo/requests; PDPA-04, PDPA-13; C0.9 OD-14, OD-16,
// PD-89 to PD-91, PD-98, PD-105, PD-112, PPL-01, PPL-04, PPL-07, PPL-13, PPL-14): one request's facts,
// steps and reply, adding a step, and logging a request that came outside Hearth. strings/dpo.ts's
// header gives the rules for every DPO page's copy: British English, short and active, never "ask"
// and never an AI word (decision 8, ST-02, DPP-06). A file of its own, so it loads with the sheet's
// and the dialog's lazy chunks, never the queue's; the labels they share with the queue are
// strings/dpo-requests.ts's. What holds an intake or a step back is packages/shared's codes
// (LOG_PROBLEMS and STEP_PROBLEMS, in the order 0012's log_case() and add_case_step() refuse them),
// worded here once each, naming the field and never a value. People's own words on the case sheet
// aren't Hearth's copy (PD-102): they are shown as text, never from here. The DPO and the owner may
// reword any of it in the PR.
import type { LogProblem, RequesterChannel, StepInput } from '@hearth/shared'

// One way to reach a requester outside Hearth (the log dialog's choice and the sheet's term).
export const CHANNEL_LABELS: Readonly<Record<RequesterChannel, string>> = {
  email: 'Email',
  phone: 'Phone',
  post: 'Post',
}

// The steps the sheet offers (add_case_step()'s inputs), and their names in the steps list.
export const STEP_NAMES: Readonly<Record<StepInput, string>> = {
  acknowledged: 'Told them it was received',
  identity_checked: 'Checked who they are',
  replied: 'Replied',
  extended: 'More time needed',
  reclassified: 'Changed the kind',
  note: 'Note',
  review_started: 'They applied to the PDPC for a review',
  review_ended: 'The PDPC review ended',
  closed: 'Close the request',
}

// What holds a logged request back (packages/shared logProblems), in LOG_PROBLEMS' order.
export const LOG_PROBLEM_COPY: Readonly<Record<LogProblem, string>> = {
  requester_both: 'Choose someone at the organisation or someone without a Hearth account, not both.',
  name_missing: 'Give their name.',
  name_too_long: 'Keep their name to 200 characters.',
  name_not_one_line: 'Keep their name on one line.',
  name_not_plain: 'Use plain text in their name, without special formatting characters.',
  name_id_number: 'Leave the ID number out of their name.',
  channel_missing: 'Choose how to reach them: by email, phone or post.',
  leaver_channel_missing: 'They’ve left, so give the channel they wrote from.',
  contact_shape:
    'Give an address that fits how to reach them: an email address, a phone number starting with + and the country code, or a postal address.',
  contact_id_number: 'Leave the ID number out of how to reach them.',
  came_by: 'Choose how it came.',
  received_range: 'Give the day it was received, from a year ago to today.',
  details_missing: 'Write your summary of what they want.',
  details_too_long: 'Keep your summary to 4,000 characters.',
  details_not_plain: 'Use plain text in your summary, without special formatting characters.',
  details_id_number: 'Leave the ID number out of your summary.',
}

// What holds a step back (packages/shared stepProblems), in STEP_PROBLEMS' order. note_missing and
// step_fields name what the step chosen needs (dpo/case-model.ts stepProblemLine).
export const STEP_PROBLEM_COPY = {
  too_many_steps: 'This request holds 100 steps, the most one can. You can still close it.',
  day_range: 'Give the day it happened, from the day it was received to today.',
  note_too_long: 'Keep the note to 2,000 characters.',
  note_not_plain: 'Use plain text in the note, without special formatting characters.',
  note_id_number: 'Leave the ID number out of the note.',
  // step_fields: a kind or an outcome not chosen yet.
  kind_missing: 'Choose what kind it is now.',
  outcome_missing: 'Choose the outcome.',
  fields_other: 'Fill in only what this step takes. Reload the request and try again.',
  not_open: 'This request is closed: only a note, or a PDPC review of a refused copy, can be added.',
  // note_missing: a note step's, or how identity was checked.
  note_missing: 'Write the note.',
  identity_missing: 'Say how you checked who they are.',
  identity_too_long: 'Keep how you checked who they are to 500 characters.',
  identity_not_one_line: 'Keep how you checked who they are on one line.',
  kind_same: 'Choose a kind other than the one it is now.',
  not_extendable: 'More time is only for a copy of their data or a correction.',
  extension_range: 'Pick a date after the current due day, at most 90 days after it was received.',
  extension_told_late: 'Record more time only on or before the current due day. If you told them later, add a note.',
  // What Hearth records, not the law: the PDPC may review a refused correction too (PDPA s48H), but
  // Hearth tracks a review only where it holds data back from deletion (DOCS-06).
  review_not_refused_copy:
    'Hearth records a PDPC review only for a refused copy, whose data must be kept meanwhile. Add a note for a review of anything else.',
  review_open: 'A PDPC review is already open on this request.',
  review_none: 'There’s no open PDPC review to end.',
  refusal_kind: 'Only a copy, a correction or an objection can be refused.',
  refusal_why: 'Say why you refused.',
  logged_in_error_form: 'A request sent in Hearth can’t be closed as logged in error.',
  identity_first: 'Record how you checked who they are before you close it as answered.',
} as const

export const CASE_COPY = {
  // Who sent it, on the sheet.
  requester: {
    leftOn: (day: string) => `Has left on ${day}`,
    noAccount: 'No Hearth account',
    reach: 'How to reach them',
    personId: 'Person id (for a break-glass citation)',
    manager: (name: string) => `Reports to ${name}`,
  },
  sheetTitle: (kind: string, reference: string) => `${kind} · ${reference}`,
  // The sheet's title before the request is read.
  sheetLoading: 'Request',
  sheetLoadingBody: 'Loading the request…',
  facts: {
    from: 'From',
    received: 'Received',
    logged: 'Logged',
    due: 'Due',
    cameBy: 'How it came',
    identity: 'Identity',
    checked: (note: string) => `Checked: ${note}`,
    // Checked, where the step that says how couldn't be read.
    checkedNoNote: 'Checked',
    notChecked: 'Not checked yet',
    moreTime: 'More time',
    review: 'PDPC review',
    reviewOpen: 'Open',
    closed: 'Closed',
  },
  loggedOn: (day: string, name: string | null) => (name === null ? day : `${day} by ${name}`),
  wrote: 'What they wrote',
  summary: 'Your summary',
  nothingWritten: 'They wrote nothing more.',
  steps: 'Steps',
  noSteps: 'No steps yet.',
  stepsIncomplete: 'Some steps couldn’t be shown. Reload to try again.',
  recorded: (day: string, name: string | null) => (name === null ? `Recorded ${day}` : `Recorded ${day} by ${name}`),
  extendedTo: (day: string) => `New date for the reply: ${day}`,
  kindNowLine: (kind: string) => `Now: ${kind}`,
  closure: (outcome: string) => `Closed: ${outcome}`,
  others: 'Their other requests',
  othersEmpty: 'No other requests from them.',
  othersCut: 'Only the 50 most recent are listed.',
  othersIncomplete: 'Some of their other requests couldn’t be shown. Reload to try again.',
  // A withdrawal's reply, filled from the published notice (PD-105).
  reply: 'A reply you can copy',
  replyHint: 'Filled in from the published notice. Edit it in your own mail before you send it.',
  copy: 'Copy',
  copied: 'Copied.',
  copyFailed: 'Couldn’t copy it. The text is selected: copy it from there.',
  // Adding a step.
  addStep: 'Add a step',
  step: 'What happened',
  stepMissing: 'Choose what happened.',
  repliedHint: 'The reply their request is waiting for. A holding message is a note.',
  // The refusal's hold ends with this step (access-request.md step 7; PDPA s22A, regulation 8).
  reviewEndedHint: 'Record it only once the review, any reconsideration and any appeal have all ended.',
  day: 'The day it happened',
  dayHint: 'From the day it was received to today.',
  identityDay: 'The day you checked',
  note: 'Note',
  noteOptional: 'Note (optional)',
  noteHint:
    'Your own working notes, for the Data Protection Officer only. Never paste messages, files or anything else you read in Hearth.',
  identityLabel: 'How you checked who they are',
  identityHint:
    'For example: against HR records, or by video call. Never an ID number or a copy of an ID document, and never an old Hearth number or PIN.',
  extendedToField: 'New date for the reply',
  toldOn: 'The day you told them in writing',
  toldOnHint: 'On or before the current due day. If you told them later, add a note instead.',
  kindNow: 'What kind it is now',
  outcome: 'Outcome',
  why: 'Why you refused',
  loggedInError: 'Logged in error takes it out of their requests. Log it again with the right details.',
  choose: 'Choose',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Step saved.',
  closedSaved: 'Request closed.',
  beforeSaving: 'Before you can save',
  // 409 case_changed: the request moved since the sheet read it; the typed note stays.
  changed: 'This request changed since you opened it.',
  reload: 'Reload',
  // 400 case_invalid with nothing found here.
  invalid: 'This can’t be saved as it is. Reload the request and try again.',
  // 404 not_found. A case opens in a sheet, never from a URL (PD-98), and is never deleted, so this
  // names no cause (WEB-08).
  missing: 'Hearth can’t find this request. Reload the requests and try again.',
  forbidden: 'This page is for the Data Protection Officer.',
  done: 'Done',
  logged: (ref: string) => `Logged as ${ref}. Give them this reference when you reply.`,
  // The log dialog (OD-16, PD-89).
  fields: {
    kind: 'What it’s about',
    kindMissing: 'Choose what it’s about.',
    personMissing: 'Choose who sent it.',
    cameBy: 'How it came',
    received: 'When it was received',
    receivedHint: 'From a year ago to today.',
    who: 'Who sent it',
    member: 'Someone at the organisation',
    outside: 'Someone without a Hearth account',
    person: 'Who',
    choose: 'Choose someone',
    name: 'Their name',
    channel: 'How to reach them',
    contact: 'Email address, phone number or postal address',
    reachOptional: 'How to reach them (optional)',
    reachLeaver: 'They’ve left, so give the channel they wrote from.',
    noChannel: 'Not given',
    identityAfter: 'Record how you checked who they are on the request once it’s logged.',
    details: 'What they want',
    detailsHint:
      'Your summary of what they wrote or said. Keep the letter or email itself in your files, and leave out content you read anywhere else in Hearth.',
  },
  people: {
    loading: 'Loading the people at the organisation…',
    empty: 'There’s nobody else at the organisation.',
    cut: 'Only the first 2,000 are listed.',
    incomplete: 'Some people couldn’t be listed. Reload to try again.',
    same: 'Two people here have the same name, department and manager, and were added on the same day, so neither can be picked. Log it as someone without a Hearth account, with how to reach them, and keep who it is in your files.',
    withDepartment: (name: string, department: string) => `${name} (${department})`,
    leftOn: (label: string, day: string) => `${label}, left on ${day}`,
    withManager: (label: string, manager: string) => `${label}, reports to ${manager}`,
    withAdded: (label: string, day: string) => `${label}, added ${day}`,
  },
  logging: 'Logging…',
  logSave: 'Log it',
  beforeLogging: 'Before you can log it',
  // A refused intake, in this dialog's words.
  logInvalid: 'This can’t be logged as it is. Check each field.',
  logRefused: 'You can log a request only for someone else at the organisation, current or former.',
} as const
