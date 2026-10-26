// The DPO's contact page, pure (PDPA-13, PDPA-02; C0.9 OD-10, OD-11, PD-64, PD-70): GET
// /api/admin/notice/contact's answer as the page shows it, the contact as its form holds it and as
// the body the api takes, what still holds a save back, and what a refused save says, so every
// state is tested in Node with no DOM (dpo/contact-model.test.ts, CTW-01 to CTW-05). The rules are
// packages/shared's (contactProblems, which the route runs before set_dpo_contact() in 0011 and the
// function enforces again); this module only feeds them the body the save would send and words
// their codes (strings/dpo-contact.ts). The page never decides whether the published notice gives
// the details: the answer's stated does (CONTACT_STATED). From C0.9 PR 3b (OD-08, PD-94) also the
// reply targets' card and dialog (targetsView, targetsEditor; CTW-06, CTW-07): the rules are
// packages/shared's targetsProblems(), which set_reply_targets() in 0012 enforces again, and the
// answer's targetsStated says whether the published notice gives them.
import {
  type ContactAdminForClient,
  type ContactField,
  type ContactRowForClient,
  type ContactStated,
  contactProblems,
  flatText,
  normalisePostal,
  postalLines,
  type ReplyTargets,
  type SetContactJSON,
  type SetTargetsJSON,
  sameTargets,
  targetsProblems,
} from '@hearth/shared'
import { dayText } from '@/lib/time.ts'
import { CONTACT, CONTACT_FIELD_NAMES, CONTACT_PROBLEM_COPY } from '@/strings/dpo-contact.ts'
import { type Fact, failureOf, type Refusal, refusalOf, textOrNull } from './model.ts'
import type { PillTone } from './parts.tsx'

// The title a first record starts from: the role, never a person's name (OD-10).
export const DEFAULT_TITLE = 'Data Protection Officer'

// --- The card --------------------------------------------------------------------------------------

export interface ContactPill {
  readonly tone: PillTone
  readonly text: string
}

export type ContactView =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'contact'
      readonly title: string
      // Whether the published notice gives these details, or none when the answer couldn't say.
      readonly pill: ContactPill | undefined
      // Under the pill when it doesn't: why, with a link to the Notice tab.
      readonly line: string | undefined
      readonly facts: readonly Fact[]
    }

const PILLS: Readonly<Record<ContactStated, ContactPill>> = {
  stated: { tone: 'ok', text: CONTACT.stated.yes },
  not_printed: { tone: 'warn', text: CONTACT.stated.no },
  not_stated: { tone: 'warn', text: CONTACT.stated.no },
  unpublished: { tone: 'muted', text: CONTACT.stated.none },
}

const LINES: Readonly<Partial<Record<ContactStated, string>>> = {
  not_printed: CONTACT.stated.notPrintedLine,
  not_stated: CONTACT.stated.noLine,
}

export function contactView(answer: Pick<ContactAdminForClient, 'contact' | 'stated'>): ContactView {
  const row = answer.contact
  if (row === null) return { kind: 'none' }
  const stated = answer.stated
  return {
    kind: 'contact',
    title: row.title,
    pill: stated === null ? undefined : PILLS[stated],
    line: stated === null ? undefined : LINES[stated],
    facts: [
      { term: CONTACT.card.email, value: row.email ?? CONTACT.card.notRecorded },
      { term: CONTACT.card.phone, value: row.phone ?? CONTACT.card.notRecorded },
      row.postal === null
        ? { term: CONTACT.card.postal, value: CONTACT.card.notRecorded }
        : { term: CONTACT.card.postal, value: postalLines(row.postal).join('\n'), lines: true },
      { term: CONTACT.card.recorded, value: CONTACT.recorded(dayText(row.recordedOn), row.recordedBy) },
    ],
  }
}

// --- The form --------------------------------------------------------------------------------------

export interface ContactForm {
  readonly title: string
  readonly email: string
  readonly phone: string
  readonly postal: string
}

// The current contact as the form starts from it, or, with none, the role's title alone.
export function contactFormOf(row: ContactRowForClient | null): ContactForm {
  if (row === null) return { title: DEFAULT_TITLE, email: '', phone: '', postal: '' }
  return { title: row.title, email: row.email ?? '', phone: row.phone ?? '', postal: row.postal ?? '' }
}

// POST /api/admin/notice/contact/set's body: the settings version the page read (null while none is
// recorded), and each field as the api reads it (SetContactBody): trimmed, a blank one not
// recorded, the role title as one line (flatText(), so a pasted tab is a space, never a "not one
// line" problem the DPO can't see), and the postal address's lines normalised (normalisePostal()).
export function contactBodyOf(row: ContactRowForClient | null, form: ContactForm): SetContactJSON {
  const postal = normalisePostal(form.postal)
  return {
    seen: row?.version ?? null,
    title: flatText(form.title),
    email: textOrNull(form.email),
    phone: textOrNull(form.phone),
    postal: postal === '' ? null : postal,
  }
}

// One line of what holds the save back, with the field it is about (none for a missing channel).
export interface ContactProblemLine {
  readonly field: ContactField | undefined
  readonly text: string
}

export interface ContactEditor {
  readonly problems: readonly ContactProblemLine[]
  // Saving makes the published notice out of date (OD-11): once a version is published.
  readonly stale: boolean
}

// What holds the save back, checked on the body the save would send (so stray spaces and blank
// lines the api drops are never held against the form), in contactProblems()' order; and whether a
// save makes the published notice out of date.
export function contactEditor(
  form: ContactForm,
  answer: Pick<ContactAdminForClient, 'contact' | 'notice'>,
): ContactEditor {
  const body = contactBodyOf(answer.contact, form)
  const problems = contactProblems({
    title: body.title,
    email: body.email,
    phone: body.phone,
    postal: body.postal,
  }).map(problem => ({
    field: problem.field,
    text: CONTACT_PROBLEM_COPY[problem.code](problem.field === undefined ? '' : CONTACT_FIELD_NAMES[problem.field]),
  }))
  return { problems, stale: answer.notice !== 'none' }
}

// --- Saving ----------------------------------------------------------------------------------------

// The toast once a save lands: the same contact again records nothing (PD-21's pattern).
export const contactSavedText = (result: { readonly changed: boolean }): string =>
  result.changed ? CONTACT.saved : CONTACT.nothingChanged

// A refused save, in the dialog: 409 register_changed (the contact moved since the page read it)
// offers Reload, and 400 register_invalid (a rule the page didn't catch) asks to check each field,
// in this page's words, since the server's are the registers'; the rest as the register pages read
// them (the PIN step, a new sign-in, forbidden, or the server's words).
export function contactRefusalOf(error: unknown): Refusal {
  const failure = failureOf(error)
  if (failure.code === 'register_changed') return { kind: 'changed', text: CONTACT.changedSince }
  if (failure.code === 'register_invalid') return { kind: 'message', text: CONTACT.invalid }
  return refusalOf(failure)
}

// --- The reply targets (C0.9 OD-08, OD-09, PD-94) -------------------------------------------------

// The card below the contact: none while no contact is recorded (the targets are kept with it, so
// there is nothing to change yet); unreadable when the answer couldn't be read (no figures and no
// change offered, since a save starts from them); else both figures, whether the published notice
// gives them (a pill, from targetsStated), and why not, with a link to the Notice tab.
export type TargetsView =
  | { readonly kind: 'first_contact' }
  | { readonly kind: 'unreadable' }
  | {
      readonly kind: 'targets'
      readonly business: string
      readonly calendar: string
      readonly pill: ContactPill | undefined
      readonly line: string | undefined
    }

const TARGET_LINES: Readonly<Partial<Record<ContactStated, string>>> = {
  not_printed: CONTACT.targets.notPrinted,
  not_stated: CONTACT.targets.notStated,
}

export function targetsView(answer: Pick<ContactAdminForClient, 'contact' | 'targets' | 'targetsStated'>): TargetsView {
  if (answer.contact === null) return { kind: 'first_contact' }
  const targets = answer.targets
  if (targets === null) return { kind: 'unreadable' }
  const stated = answer.targetsStated
  return {
    kind: 'targets',
    business: CONTACT.targets.business(String(targets.businessDays)),
    calendar: CONTACT.targets.calendar(String(targets.calendarDays)),
    pill: stated === null ? undefined : PILLS[stated],
    line: stated === null ? undefined : TARGET_LINES[stated],
  }
}

// The dialog's two figures as typed (a number field's text), so a half-typed figure is held back
// with its reason, never coerced.
export interface TargetsForm {
  readonly businessDays: string
  readonly calendarDays: string
}

export const targetsFormOf = (targets: ReplyTargets): TargetsForm => ({
  businessDays: String(targets.businessDays),
  calendarDays: String(targets.calendarDays),
})

// A whole number of days as typed (digits only, surrounding spaces ignored), or NaN, which
// targetsProblems() holds back as out of range.
const figureOf = (text: string): number => (/^\s*[0-9]{1,9}\s*$/.test(text) ? Number(text) : Number.NaN)

export interface TargetsEditor {
  // What holds the save back, worded, in targetsProblems()' order.
  readonly problems: readonly string[]
  // Nothing changed from the figures the page read: Save is held back with its reason.
  readonly unchanged: boolean
  // Saving makes the published notice out of date (PD-94): once a version is published.
  readonly stale: boolean
  // POST /api/admin/notice/targets/set's body, once nothing holds it back: the settings version the
  // page read and both figures (the DPO comes from the session).
  readonly body: SetTargetsJSON | undefined
}

export function targetsEditor(
  form: TargetsForm,
  answer: Pick<ContactAdminForClient, 'contact' | 'targets' | 'notice'>,
): TargetsEditor {
  const figures = { businessDays: figureOf(form.businessDays), calendarDays: figureOf(form.calendarDays) }
  const problems = targetsProblems(figures).map(code => CONTACT.targets.problems[code])
  const unchanged = answer.targets !== null && sameTargets(figures, answer.targets)
  const row = answer.contact
  return {
    problems,
    unchanged,
    stale: answer.notice !== 'none',
    body:
      problems.length > 0 || unchanged || row === null
        ? undefined
        : { seen: row.version, businessDays: figures.businessDays, calendarDays: figures.calendarDays },
  }
}

// The toast once a save lands: the same figures again record nothing.
export const targetsSavedText = (result: { readonly changed: boolean }): string =>
  result.changed ? CONTACT.targets.saved : CONTACT.nothingChanged

// A refused save, in the dialog: 409 register_changed offers Reload; 400 register_invalid (a figure
// out of range, or no contact recorded meanwhile) says to check, in this card's words; the rest as
// the register pages read them (the PIN step, a new sign-in, forbidden, or the server's words).
export function targetsRefusalOf(error: unknown): Refusal {
  const failure = failureOf(error)
  if (failure.code === 'register_changed') return { kind: 'changed', text: CONTACT.targets.changedSince }
  if (failure.code === 'register_invalid') return { kind: 'message', text: CONTACT.targets.invalid }
  return refusalOf(failure)
}
