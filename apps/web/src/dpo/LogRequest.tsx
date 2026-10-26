// Logging a request that came outside Hearth (PDPA-04, PDPA-13; C0.9 OD-07, OD-16, PD-89, PPL-01,
// PPL-13, PPL-14), from the queue's "Log a request": what it's about, how it came (by email, by
// letter, by phone, in person, another way), the day it arrived (today in the org's zone by default,
// at most a year back), who sent it, and the DPO's summary of what they want. Who sent it is someone
// at the organisation, current or former, picked from GET /api/admin/requests/people (read only
// while the dialog is open) by name and department, "left on" a day for a leaver, then their manager
// and the day they were added where two would read the same; two nothing tells apart can't be
// picked (PD-76's safeguard), and the dialog says to log it as someone without an account. A leaver
// needs the one channel they wrote from (PPL-01); anyone else at the organisation may give one. Or
// it is someone without a Hearth account, by name and one channel (OD-16). There is no identity
// field: "Checked who they are" is a step on the new request's sheet, with the day it was checked
// (PPL-14). Save is held back with its reason (logEditor); the dialog's key, made as it opens, makes a
// resend after a lost answer return the first case. Once logged, the dialog closes, the queue and
// the session's count are read again, and the new request's sheet opens with its reference. A
// refused read of the people (the PIN step) shows above the form, never in it, since a form inside
// a form never sends its submit. The lines about the list (two who read the same, a cut list, rows
// that couldn't be read) describe the person field, and the leaver's line describes How to reach
// them, so each is heard on the control it is about. The queue loads this module lazily, when the
// dialog first opens.
import {
  CASE_KINDS,
  CASE_NAME_MAX,
  type CaseReference,
  type LogRequestJSON,
  type RequesterChannel,
} from '@hearth/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useMemo, useRef, useState } from 'react'
import { DPO } from '@/strings/dpo.ts'
import { CASE_COPY, CHANNEL_LABELS } from '@/strings/dpo-case.ts'
import { CASE_KIND_LABELS, REQUESTS_COPY } from '@/strings/dpo-requests.ts'
import { Button } from '@/ui/Button.tsx'
import { Dialog } from '@/ui/Dialog.tsx'
import { Segmented } from '@/ui/Segmented.tsx'
import { Select } from '@/ui/Select.tsx'
import { TextArea } from '@/ui/TextArea.tsx'
import {
  CAME_BY_OPTIONS,
  caseRefusalOf,
  earliestReceived,
  emptyLog,
  type LogForm,
  logEditor,
  peopleOptions,
} from './case-model.ts'
import { CASE_WRITE_MOVES, casePeopleQuery, type LoggedRequest, logRequest } from './case-queries.ts'
import { type Refusal, refusalOfError } from './model.ts'
import { DateField, Note, TextField } from './parts.tsx'
import { ReadRefusal, WriteRefusal } from './RegisterPage.tsx'

export interface LogRequestProps {
  // Today in the org's zone, as the queue's answer gave it.
  today: string
  onClose(): void
  onLogged(id: string, reference: CaseReference): void
  // What the form starts with, over the empty one: for the markup test (dpo/dpo.markup.test.tsx).
  initial?: Partial<LogForm>
}

// One intake, as the register writes send theirs: its effects live on the mutation, so the queue and
// the session's count are read again even if the dialog has gone by the time it lands.
function useLog(onLogged: (logged: LoggedRequest) => void) {
  const queryClient = useQueryClient()
  const last = useRef<LogRequestJSON | undefined>(undefined)
  const [refusal, setRefusal] = useState<Refusal | undefined>()
  const mutation = useMutation({
    mutationFn: logRequest,
    onSuccess: () => Promise.all(CASE_WRITE_MOVES.map(queryKey => queryClient.invalidateQueries({ queryKey }))),
  })
  const send = (body: LogRequestJSON) => {
    if (mutation.isPending) return
    last.current = body
    setRefusal(undefined)
    mutation.mutate(body, {
      onSuccess: logged => onLogged(logged),
      onError: error => {
        const read = caseRefusalOf(error, CASE_COPY.logInvalid)
        // forbidden here is yourself, or someone not of the organisation (or the DPO role lost).
        setRefusal(read.kind === 'forbidden' ? { kind: 'message', text: CASE_COPY.logRefused } : read)
      },
    })
  }
  return {
    send,
    pending: mutation.isPending,
    refusal,
    // The PIN was confirmed: the refused intake once more, with the same key.
    retry: () => {
      if (last.current !== undefined) send(last.current)
    },
    reload: () => setRefusal(undefined),
  }
}

export function LogRequest({ today, onClose, onLogged, initial }: LogRequestProps) {
  const people = useQuery(casePeopleQuery)
  const peopleRefusal = people.error === null ? undefined : refusalOfError(people.error)
  const [form, setForm] = useState<LogForm>(() => ({ ...emptyLog(today), ...initial }))
  // The dialog's client key, made as it opens and kept while it stays open (PD-89).
  const [key] = useState(() => crypto.randomUUID())
  const options = useMemo(
    () => (people.data === undefined ? undefined : peopleOptions(people.data.people.rows)),
    [people.data],
  )
  const editor = logEditor(form, people.data, options, today, key)
  const log = useLog(logged => onLogged(logged.case, logged.reference))
  const formId = useId()
  const sameId = useId()
  const cutId = useId()
  const incompleteId = useId()
  const leaverId = useId()
  const set = (change: Partial<LogForm>) => setForm(before => ({ ...before, ...change }))
  const held = log.pending
    ? CASE_COPY.logging
    : editor.body === undefined
      ? (editor.problems[0] ?? DPO.fixFirst)
      : undefined
  const member = form.who === 'member'
  // The lines under the person field that describe it, while each shows.
  const personNotes =
    people.data === undefined || options === undefined
      ? undefined
      : [
          options.same ? sameId : undefined,
          people.data.more ? cutId : undefined,
          people.data.people.complete ? undefined : incompleteId,
        ]
          .filter(Boolean)
          .join(' ') || undefined
  const channelOptions: { value: RequesterChannel | ''; label: string }[] = [
    ...(member && !editor.leaver ? [{ value: '' as const, label: CASE_COPY.fields.noChannel }] : []),
    ...(['email', 'phone', 'post'] as const).map(value => ({ value, label: CHANNEL_LABELS[value] })),
  ]
  return (
    <Dialog
      open
      onClose={() => onClose()}
      title={REQUESTS_COPY.log}
      footer={
        <>
          <Button onClick={() => onClose()}>{DPO.cancel}</Button>
          <Button type="submit" form={formId} variant="primary" disabledReason={held}>
            {CASE_COPY.logSave}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <WriteRefusal writer={log} />
        {/* Outside the form: the PIN step it may show is a form of its own, and a form inside a
            form never sends its submit. */}
        {member && peopleRefusal !== undefined && (
          <ReadRefusal refusal={peopleRefusal} retry={() => void people.refetch()} />
        )}
        <form
          id={formId}
          method="post"
          noValidate
          onSubmit={event => {
            event.preventDefault()
            if (held === undefined && editor.body !== undefined) log.send(editor.body)
          }}
          className="flex flex-col gap-4"
        >
          <Select
            label={CASE_COPY.fields.kind}
            name="kind"
            value={form.kind}
            options={[
              { value: '', label: CASE_COPY.choose },
              ...CASE_KINDS.map(kind => ({ value: kind, label: CASE_KIND_LABELS[kind] })),
            ]}
            onChange={event => set({ kind: event.currentTarget.value as LogForm['kind'] })}
          />
          <Select
            label={CASE_COPY.fields.cameBy}
            name="came-by"
            value={form.cameBy}
            options={[{ value: '', label: CASE_COPY.choose }, ...CAME_BY_OPTIONS]}
            onChange={event => set({ cameBy: event.currentTarget.value as LogForm['cameBy'] })}
          />
          <DateField
            label={CASE_COPY.fields.received}
            hint={CASE_COPY.fields.receivedHint}
            name="received-on"
            min={earliestReceived(today)}
            max={today}
            value={form.receivedOn}
            onChange={receivedOn => set({ receivedOn })}
          />
          <div className="flex flex-col gap-1.5">
            {/* The visible name of the group; the group's own legend says it to a screen reader. */}
            <p aria-hidden className="font-medium">
              {CASE_COPY.fields.who}
            </p>
            <Segmented
              label={CASE_COPY.fields.who}
              value={form.who}
              options={[
                { value: 'member', label: CASE_COPY.fields.member },
                { value: 'outside', label: CASE_COPY.fields.outside },
              ]}
              onChange={who => set({ who, channel: '', contact: '' })}
            />
          </div>
          {member ? (
            <>
              {people.isPending && (
                <p role="status" className="text-muted">
                  {CASE_COPY.people.loading}
                </p>
              )}
              {people.data !== undefined && options !== undefined && (
                <>
                  {people.data.people.rows.length === 0 && people.data.people.complete ? (
                    <p>{CASE_COPY.people.empty}</p>
                  ) : (
                    <Select
                      label={CASE_COPY.fields.person}
                      name="person"
                      value={form.person}
                      options={options.options}
                      onChange={event => set({ person: event.currentTarget.value })}
                      aria-describedby={personNotes}
                    />
                  )}
                  {options.same && (
                    <Note tone="warn">
                      <p id={sameId}>{CASE_COPY.people.same}</p>
                    </Note>
                  )}
                  {people.data.more && (
                    <p id={cutId} className="text-small text-muted">
                      {CASE_COPY.people.cut}
                    </p>
                  )}
                  {!people.data.people.complete && (
                    <p id={incompleteId} className="text-small text-muted">
                      {CASE_COPY.people.incomplete}
                    </p>
                  )}
                </>
              )}
            </>
          ) : (
            <TextField
              label={CASE_COPY.fields.name}
              name="name"
              maxLength={CASE_NAME_MAX}
              value={form.name}
              onChange={name => set({ name })}
            />
          )}
          <div className="flex flex-col gap-1.5">
            <p aria-hidden className="font-medium">
              {member && !editor.leaver ? CASE_COPY.fields.reachOptional : CASE_COPY.fields.channel}
            </p>
            {editor.leaver && (
              <p id={leaverId} className="text-small text-muted">
                {CASE_COPY.fields.reachLeaver}
              </p>
            )}
            <Segmented
              label={member && !editor.leaver ? CASE_COPY.fields.reachOptional : CASE_COPY.fields.channel}
              describedBy={editor.leaver ? leaverId : undefined}
              value={form.channel}
              options={channelOptions}
              onChange={channel => set({ channel, ...(channel === '' ? { contact: '' } : {}) })}
            />
          </div>
          {form.channel !== '' && (
            <TextField
              label={CASE_COPY.fields.contact}
              name="contact"
              type={form.channel === 'email' ? 'email' : form.channel === 'phone' ? 'tel' : 'text'}
              inputMode={form.channel === 'email' ? 'email' : form.channel === 'phone' ? 'tel' : 'text'}
              multiline={form.channel === 'post'}
              rows={3}
              maxLength={500}
              value={form.contact}
              onChange={contact => set({ contact })}
            />
          )}
          <TextArea
            label={CASE_COPY.fields.details}
            hint={CASE_COPY.fields.detailsHint}
            name="details"
            required
            value={form.details}
            onChange={details => set({ details })}
          />
          <p className="text-small text-muted">{CASE_COPY.fields.identityAfter}</p>
          {editor.problems.length > 0 && <Note tone="info" title={CASE_COPY.beforeLogging} items={editor.problems} />}
        </form>
      </div>
    </Dialog>
  )
}
