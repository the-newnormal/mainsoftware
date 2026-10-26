// One request on its sheet (PDPA-04, PDPA-13; C0.9 OD-14, OD-16, PD-90, PD-91, PD-98, PD-105, PD-112,
// PPL-01, PPL-04, PPL-07, PPL-14): the kit's Dialog as the whole screen on phones and a wide dialog
// from md:, opened from a card and held in the queue's state, never a URL (T21 item 5, RO-04).
// Closing it (Done, Close or Escape) returns focus to the card that opened it; focus lands on its
// title as it opens. It reads GET /api/admin/requests/:case (caseQuery) and shows:
// - who sent it: a person's name, department, manager and the day they left, with the channel and
//   address the case records, and their id to copy into a break-glass citation (PPL-07); or someone
//   without an account, with theirs. Every address is plain text the DPO copies into their own mail,
//   never a link;
// - the facts: how it came, the days received and logged, the due line, whether identity has been
//   checked, more time, an open PDPC review, the closure;
// - what they wrote (or the DPO's summary of one logged), as quoted text in its own direction
//   (dir="auto"): text only, never markup, a link or Markdown (Rule 8). People's words aren't
//   Hearth's copy (PD-102);
// - the steps, oldest first, then the closure, each with its day, its note and who recorded it;
// - the same person's other requests (PPL-07), each opening in this sheet;
// - for a withdrawal, once a version is published, the reply to copy (PD-105), filled by the server
//   from the published notice;
// - Add a step: only the steps the case allows (stepsAllowed()), with the fields each takes, Save
//   held back with its reason, the PIN inline and the same write once more after it, and a 409
//   case_changed offering Reload while keeping what was typed.
// Nothing is kept outside the sheet's state (WS-01). The queue loads this module lazily, when a card
// is first opened.
import {
  type AddCaseStepJSON,
  CASE_IDENTITY_NOTE_MAX,
  CASE_KINDS,
  type CaseForClient,
  type CaseReference,
  type StepInput,
} from '@hearth/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { DPO } from '@/strings/dpo.ts'
import { CASE_COPY, STEP_NAMES } from '@/strings/dpo-case.ts'
import { CASE_KIND_LABELS, CASE_STATE_LABELS, OUTCOME_LABELS } from '@/strings/dpo-requests.ts'
import { announce } from '@/ui/announce.ts'
import { Button } from '@/ui/Button.tsx'
import { Dialog } from '@/ui/Dialog.tsx'
import { Select } from '@/ui/Select.tsx'
import { Spelled } from '@/ui/Spelled.tsx'
import { TextArea } from '@/ui/TextArea.tsx'
import { toast } from '@/ui/toast.ts'
import {
  caseFacts,
  caseReadRefusalOf,
  caseRefusalOf,
  emptyStep,
  loggedLine,
  otherLine,
  type StepForm,
  sheetRequester,
  sheetTitle,
  stepEditor,
  stepLines,
} from './case-model.ts'
import { addCaseStep, CASE_WRITE_MOVES, caseQuery } from './case-queries.ts'
import type { Refusal } from './model.ts'
import { DateField, Facts, Note, Pill, TextField } from './parts.tsx'
import { ReadRefusal, WriteRefusal } from './RegisterPage.tsx'

export interface CaseSheetProps {
  id: string
  // The reference of a request the DPO just logged, which the sheet shows until it closes.
  logged?: CaseReference
  onClose(): void
  // Another request from the same person, opened in this sheet.
  onOpen(id: string): void
}

export function CaseSheet({ id, logged, onClose, onOpen }: CaseSheetProps) {
  const query = useQuery(caseQuery(id))
  const refusal = query.error === null ? undefined : caseReadRefusalOf(query.error)
  const answer = query.data
  useEffect(() => {
    if (logged !== undefined) announce(loggedLine(logged))
  }, [logged])
  return (
    <Dialog
      open
      onClose={() => onClose()}
      title={answer === undefined ? CASE_COPY.sheetLoading : sheetTitle(answer.case)}
      presentation="full"
      focusTitle
      footer={
        <Button variant="primary" onClick={() => onClose()}>
          {CASE_COPY.done}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {logged !== undefined && (
          <Note tone="info">
            <p className="font-medium">{loggedLine(logged)}</p>
          </Note>
        )}
        {refusal !== undefined && <ReadRefusal refusal={refusal} retry={() => void query.refetch()} />}
        {query.isPending && (
          <p role="status" className="text-muted">
            {CASE_COPY.sheetLoadingBody}
          </p>
        )}
        {answer !== undefined && refusal?.kind !== 'forbidden' && <CaseContent answer={answer} onOpen={onOpen} />}
      </div>
    </Dialog>
  )
}

// The case, as the sheet shows it. Exported for its markup test (dpo/dpo.markup.test.tsx).
export function CaseContent({ answer, onOpen }: { answer: CaseForClient; onOpen(id: string): void }) {
  const kase = answer.case
  const requester = sheetRequester(kase.requester)
  const steps = stepLines(kase, answer.steps.rows)
  const wroteId = useId()
  const stepsId = useId()
  const othersId = useId()
  return (
    <>
      <div>
        <Pill tone="plain">{CASE_STATE_LABELS[kase.state]}</Pill>
      </div>
      <dl className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
          <dt className="text-small text-muted sm:w-44 sm:shrink-0 sm:pt-px">{CASE_COPY.facts.from}</dt>
          <dd className="flex min-w-0 flex-col break-words [overflow-wrap:anywhere]">
            {requester.lines.map(line => (
              <span key={line}>{line}</span>
            ))}
          </dd>
        </div>
        {requester.reach !== undefined && (
          <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
            <dt className="text-small text-muted sm:w-44 sm:shrink-0 sm:pt-px">{CASE_COPY.requester.reach}</dt>
            <dd className="flex min-w-0 flex-col break-words [overflow-wrap:anywhere]">
              <span>{requester.reach.channel}</span>
              <span dir="auto" className="select-all whitespace-pre-line">
                {requester.reach.contact}
              </span>
            </dd>
          </div>
        )}
        {requester.personId !== undefined && (
          <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
            <dt className="text-small text-muted sm:w-44 sm:shrink-0 sm:pt-px">{CASE_COPY.requester.personId}</dt>
            <dd className="min-w-0 break-all font-mono text-small select-all">{requester.personId}</dd>
          </div>
        )}
      </dl>
      <Facts facts={caseFacts(answer)} />
      <section aria-labelledby={wroteId} className="flex flex-col gap-2">
        <h3 id={wroteId} className="font-semibold">
          {kase.cameBy === 'hearth' ? CASE_COPY.wrote : CASE_COPY.summary}
        </h3>
        {kase.details === null ? (
          <p className="text-muted">{CASE_COPY.nothingWritten}</p>
        ) : (
          <blockquote
            dir="auto"
            className="whitespace-pre-wrap break-words rounded-xl border-l-4 border-line-strong bg-surface-2 px-4 py-3 [overflow-wrap:anywhere]"
          >
            {kase.details}
          </blockquote>
        )}
      </section>
      <section aria-labelledby={stepsId} className="flex flex-col gap-2">
        <h3 id={stepsId} className="font-semibold">
          {CASE_COPY.steps}
        </h3>
        {steps.length === 0 && answer.steps.complete && <p className="text-muted">{CASE_COPY.noSteps}</p>}
        {steps.length > 0 && (
          <ol className="flex flex-col divide-y divide-line rounded-2xl border border-line">
            {steps.map(step => (
              <li key={step.key} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="font-medium">{step.name}</span>
                <span className="text-small text-muted">{step.day}</span>
                {step.detail !== undefined && <span className="text-small">{step.detail}</span>}
                {step.note !== null && (
                  <span dir="auto" className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {step.note}
                  </span>
                )}
                <span className="text-small text-muted">{step.recorded}</span>
              </li>
            ))}
          </ol>
        )}
        {!answer.steps.complete && <p className="text-small text-muted">{CASE_COPY.stepsIncomplete}</p>}
      </section>
      {kase.requester.type === 'person' && (
        <section aria-labelledby={othersId} className="flex flex-col gap-2">
          <h3 id={othersId} className="font-semibold">
            {CASE_COPY.others}
          </h3>
          {answer.others.rows.length === 0 && answer.others.complete && !answer.othersMore && (
            <p className="text-muted">{CASE_COPY.othersEmpty}</p>
          )}
          {answer.others.rows.length > 0 && (
            <ul className="flex flex-col gap-2">
              {answer.others.rows.map(row => {
                const other = otherLine(row, answer.today)
                return (
                  <li key={other.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(other.id)}
                      className="flex min-h-11 w-full flex-col gap-0.5 rounded-xl border border-line bg-surface px-4 py-2.5 text-left hover:bg-bg focus-visible:bg-bg"
                    >
                      <span className="font-medium">
                        {other.kind} · {other.state}
                      </span>
                      <span className="text-small text-muted">
                        <Spelled text={other.reference} spoken={other.referenceLabel} />
                        {` · ${other.days}`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {answer.othersMore && <p className="text-small text-muted">{CASE_COPY.othersCut}</p>}
          {!answer.others.complete && <p className="text-small text-muted">{CASE_COPY.othersIncomplete}</p>}
        </section>
      )}
      {answer.reply !== null && <ReplyToCopy reply={answer.reply} />}
      <AddStep key={kase.id} answer={answer} />
    </>
  )
}

// A withdrawal's reply, filled from the published notice (PD-105), with Copy. On a browser that
// can't copy it, the text is selected for the DPO to copy themselves.
function ReplyToCopy({ reply }: { reply: string }) {
  const id = useId()
  const block = useRef<HTMLDivElement>(null)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reply)
      announce(CASE_COPY.copied)
    } catch {
      const selection = window.getSelection()
      if (block.current !== null && selection !== null) selection.selectAllChildren(block.current)
      announce(CASE_COPY.copyFailed)
    }
  }
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="font-semibold">
        {CASE_COPY.reply}
      </h3>
      <p className="text-small text-muted">{CASE_COPY.replyHint}</p>
      <div
        ref={block}
        dir="auto"
        className="whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 px-4 py-3 [overflow-wrap:anywhere]"
      >
        {reply}
      </div>
      <Button className="self-start" onClick={() => void copy()}>
        {CASE_COPY.copy}
      </Button>
    </section>
  )
}

// One step, as useRegisterWrite() sends a register's write: its effects live on the mutation, so the
// queue, the case and the session's count are read again and the toast shown even if the sheet has
// closed by the time it lands.
function useStepWrite(caseId: string, onLanded: () => void) {
  const queryClient = useQueryClient()
  const last = useRef<AddCaseStepJSON | undefined>(undefined)
  const [refusal, setRefusal] = useState<Refusal | undefined>()
  const mutation = useMutation({
    mutationFn: addCaseStep,
    onSuccess: async (_, body) => {
      await Promise.all(CASE_WRITE_MOVES.map(queryKey => queryClient.invalidateQueries({ queryKey })))
      toast({ text: body.step === 'closed' ? CASE_COPY.closedSaved : CASE_COPY.saved })
    },
  })
  const send = (body: AddCaseStepJSON) => {
    if (mutation.isPending) return
    last.current = body
    setRefusal(undefined)
    mutation.mutate(body, {
      onSuccess: () => onLanded(),
      onError: error => setRefusal(caseRefusalOf(error)),
    })
  }
  return {
    send,
    pending: mutation.isPending,
    refusal,
    // The PIN was confirmed: the refused step once more.
    retry: () => {
      if (last.current !== undefined) send(last.current)
    },
    // case_changed: the case is read again; what was typed stays, and is checked against it.
    reload: () => {
      setRefusal(undefined)
      void queryClient.invalidateQueries({ queryKey: caseQuery(caseId).queryKey })
    },
  }
}

// Add a step: the steps the case allows, the fields the chosen one takes, and Save. Exported for its
// markup test (dpo/dpo.markup.test.tsx).
export function AddStep({ answer, initial }: { answer: CaseForClient; initial?: Partial<StepForm> }) {
  const [form, setForm] = useState<StepForm>(() => ({ ...emptyStep(answer.today), ...initial }))
  const editor = stepEditor(form, answer.case, answer.today)
  const writer = useStepWrite(answer.case.id, () => setForm(emptyStep(answer.today)))
  const formId = useId()
  const titleId = useId()
  const set = (change: Partial<StepForm>) => setForm(before => ({ ...before, ...change }))
  if (editor.offered.length === 0) return null
  const kase = answer.case
  const step = form.step
  const held = writer.pending
    ? CASE_COPY.saving
    : editor.body === undefined
      ? (editor.problems[0] ?? DPO.fixFirst)
      : undefined
  const noteLabel =
    step === 'note'
      ? CASE_COPY.note
      : step === 'closed' && form.outcome === 'refused'
        ? CASE_COPY.why
        : CASE_COPY.noteOptional
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5"
    >
      <h3 id={titleId} className="font-semibold">
        {CASE_COPY.addStep}
      </h3>
      {/* Outside the form: the PIN step it may show is a form of its own. */}
      <WriteRefusal writer={writer} />
      <form
        id={formId}
        method="post"
        noValidate
        onSubmit={event => {
          event.preventDefault()
          if (held === undefined && editor.body !== undefined) writer.send(editor.body)
        }}
        className="flex flex-col gap-4"
      >
        <Select
          label={CASE_COPY.step}
          name="step"
          value={step}
          options={[
            { value: '', label: CASE_COPY.choose },
            ...editor.offered.map(value => ({ value, label: STEP_NAMES[value] })),
          ]}
          hint={
            step === 'replied' ? CASE_COPY.repliedHint : step === 'review_ended' ? CASE_COPY.reviewEndedHint : undefined
          }
          onChange={event => set({ step: event.currentTarget.value as StepInput | '' })}
        />
        {step !== '' && (
          <>
            {step === 'reclassified' && (
              <Select
                label={CASE_COPY.kindNow}
                name="kind"
                value={form.kind}
                options={[
                  { value: '', label: CASE_COPY.choose },
                  ...CASE_KINDS.filter(kind => kind !== kase.kind).map(kind => ({
                    value: kind,
                    label: CASE_KIND_LABELS[kind],
                  })),
                ]}
                onChange={event => set({ kind: event.currentTarget.value as StepForm['kind'] })}
              />
            )}
            {step === 'closed' && (
              <Select
                label={CASE_COPY.outcome}
                name="outcome"
                value={form.outcome}
                options={[
                  { value: '', label: CASE_COPY.choose },
                  ...editor.outcomes.map(outcome => ({ value: outcome, label: OUTCOME_LABELS[outcome] })),
                ]}
                onChange={event => set({ outcome: event.currentTarget.value as StepForm['outcome'] })}
              />
            )}
            {step === 'closed' && form.outcome === 'logged_in_error' && <p>{CASE_COPY.loggedInError}</p>}
            <DateField
              label={
                step === 'extended'
                  ? CASE_COPY.toldOn
                  : step === 'identity_checked'
                    ? CASE_COPY.identityDay
                    : CASE_COPY.day
              }
              hint={step === 'extended' ? CASE_COPY.toldOnHint : CASE_COPY.dayHint}
              name="on-day"
              min={kase.receivedOn}
              max={answer.today}
              value={form.onDay}
              onChange={onDay => set({ onDay })}
            />
            {step === 'extended' && (
              <DateField
                label={CASE_COPY.extendedToField}
                name="extended-to"
                min={kase.dueOn ?? kase.receivedOn}
                value={form.extendedTo}
                onChange={extendedTo => set({ extendedTo })}
              />
            )}
            {step === 'identity_checked' ? (
              <TextField
                label={CASE_COPY.identityLabel}
                hint={CASE_COPY.identityHint}
                name="identity"
                maxLength={CASE_IDENTITY_NOTE_MAX}
                value={form.note}
                onChange={note => set({ note })}
              />
            ) : (
              <TextArea
                label={noteLabel}
                hint={CASE_COPY.noteHint}
                name="note"
                rows={3}
                required={step === 'note' || (step === 'closed' && form.outcome === 'refused')}
                value={form.note}
                onChange={note => set({ note })}
              />
            )}
            {editor.problems.length > 0 && <Note tone="info" title={CASE_COPY.beforeSaving} items={editor.problems} />}
          </>
        )}
        <Button type="submit" variant="primary" className="self-start" disabledReason={held}>
          {CASE_COPY.save}
        </Button>
      </form>
    </section>
  )
}
