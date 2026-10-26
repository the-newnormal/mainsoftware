// Settings › Privacy's requests to the Data Protection Officer (PDPA-04, PDPA-13; C0.9 OD-07,
// OD-12, OD-13, OD-15, PD-96, PD-97, PD-112), straight after the DPO's contact:
// - "Questions and requests": the six kinds as rows. A row opens the kit's Dialog (a bottom sheet
//   on phones): what happens next, the published version's target for the kind (none when the
//   latest version prints none, never an invented figure), that the DPO replies outside Hearth (no
//   reply address is collected, PD-96), a box for what it's about (optional for a copy of their
//   data) and who it is sent as. The sheet makes a client key as it opens, so sending again after an
//   answer that never arrived records nothing new; once it lands, the sheet's content becomes the
//   confirmation (the due day, the reference to quote), which stays until Done, and focus then goes
//   to the new row. Closing with something written asks before discarding it: nothing is kept
//   anywhere (WS-01). The question takes focus as it replaces the box (and the footer's Cancel), so
//   a screen reader reads it first; Keep writing, or Close or Escape while it is asked, puts focus
//   back in the box, with the words kept (X6). With 10 open requests (OD-25) the rows are replaced
//   by a line saying so.
// - "Your requests": the requests where you are the requester, sent here or logged for you by the
//   DPO, with their kind, state, reference, how they came, the days received and due, the day the
//   DPO last replied, and, once one is late with no reply on time, what to do. Never your words, the
//   DPO's notes, the steps or the outcome (PD-97).
// It reads GET /api/requests itself, so the notice above and this load or fail apart; the form
// shows whether or not "Your requests" could be read. It imports nothing from the DPO's pages, and
// loads in Settings › Privacy's chunk with strings/requests.ts.
import type { ReplyTargets } from '@hearth/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, CircleAlert } from 'lucide-react'
import { type RefObject, useEffect, useId, useRef, useState } from 'react'
import type { ApiFailure } from '@/api/http.ts'
import { ownRequestsQuery, sendRequest, useSession } from '@/api/queries.ts'
import { focusAfter } from '@/lib/focus.ts'
import { REQUESTS } from '@/strings/requests.ts'
import { announce } from '@/ui/announce.ts'
import { Button } from '@/ui/Button.tsx'
import { Dialog } from '@/ui/Dialog.tsx'
import { Spelled } from '@/ui/Spelled.tsx'
import { TextArea } from '@/ui/TextArea.tsx'
import {
  atCap,
  confirmationLines,
  failedSheet,
  mineView,
  needsDiscard,
  openSheet,
  REQUEST_ROWS,
  type RequestRow,
  type RequestSheet,
  requestRowId,
  sendBodyOf,
  sendingSheet,
  sentSheet,
  sheetView,
  withText,
} from './requests-model.ts'

// The failure a send ended with, as the sheet reads it (anything not an api failure as no answer).
function failureOf(error: unknown): { status: number; code: string; serverMessage: string } {
  if (typeof error === 'object' && error !== null && 'code' in error && 'status' in error) {
    const failure = error as ApiFailure
    return { status: failure.status, code: failure.code, serverMessage: failure.serverMessage }
  }
  return { status: 0, code: 'network', serverMessage: REQUESTS.failed }
}

// targets: the published version's (null when it prints none, undefined when the notice couldn't be
// read).
export function RequestsSection({ targets }: { targets: ReplyTargets | null | undefined }) {
  const query = useQuery(ownRequestsQuery)
  const [sheet, setSheet] = useState<RequestSheet | undefined>()
  const formId = useId()
  const mineId = useId()
  const mineHeading = useRef<HTMLHeadingElement>(null)
  // After Done, focus goes to the new row (found by the case's id), once the sheet has gone (the
  // dialog first gives focus back to the row that opened it).
  const focusCase = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (sheet !== undefined || focusCase.current === undefined) return
    const id = requestRowId(focusCase.current)
    focusCase.current = undefined
    focusAfter(() => document.getElementById(id) ?? mineHeading.current)
  }, [sheet])
  const answer = query.data
  const mine = mineView(answer, query.isError)
  return (
    <>
      <section aria-labelledby={formId} className="flex flex-col gap-3">
        <h2 id={formId} className="font-display text-xl font-semibold">
          {REQUESTS.title}
        </h2>
        <p>{REQUESTS.intro}</p>
        {atCap(answer) ? (
          <p className="text-muted">{REQUESTS.atCap}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {REQUEST_ROWS.map(row => (
              <li key={row.kind}>
                <button
                  type="button"
                  onClick={() => setSheet(openSheet(row.kind, crypto.randomUUID()))}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-bg focus-visible:bg-bg"
                >
                  <span className="min-w-0 flex-1 break-words">{row.label}</span>
                  <ChevronRight aria-hidden size={18} className="shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby={mineId} className="flex flex-col gap-3">
        <h2 ref={mineHeading} id={mineId} tabIndex={-1} className="font-display text-xl font-semibold">
          {REQUESTS.mine.title}
        </h2>
        {mine.kind === 'loading' && (
          <p role="status" className="text-muted">
            {REQUESTS.mine.loading}
          </p>
        )}
        {mine.kind === 'unreadable' && <p className="text-muted">{REQUESTS.mine.unreadable}</p>}
        {mine.kind === 'rows' && (
          <>
            {mine.rows.length === 0 && !mine.incomplete && <p className="text-muted">{REQUESTS.mine.empty}</p>}
            {mine.rows.length > 0 && (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {mine.rows.map(row => (
                  <MyRequest key={row.id} row={row} />
                ))}
              </ul>
            )}
            {mine.incomplete && <p className="text-muted">{REQUESTS.mine.incomplete}</p>}
            {mine.cut && <p className="text-small text-muted">{REQUESTS.mine.cut}</p>}
          </>
        )}
      </section>
      {sheet !== undefined && (
        <RequestSheetDialog
          sheet={sheet}
          onChange={setSheet}
          targets={targets}
          open={answer?.open ?? null}
          onDone={caseId => {
            focusCase.current = caseId
            setSheet(undefined)
          }}
          onDiscard={() => setSheet(undefined)}
        />
      )}
    </>
  )
}

// One of your requests: the kind and its state in words; the reference (never broken across its
// hyphen, never translated, spelled out for a screen reader) and how it came; the days; the DPO's
// reply; and, once late, what to do. The row takes focus after Done (tabIndex -1).
export function MyRequest({ row }: { row: RequestRow }) {
  return (
    <li id={requestRowId(row.id)} tabIndex={-1} className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 break-words font-medium">{row.kind}</span>
        <span className="inline-flex shrink-0 items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-small font-medium text-fg">
          {row.state}
        </span>
      </div>
      <p className="text-small text-muted">
        <Spelled text={row.reference} spoken={row.referenceLabel} />
        {` · ${row.cameBy}`}
      </p>
      <p className="text-small text-muted">{row.days}</p>
      {row.replied !== undefined && <p className="text-small">{row.replied}</p>}
      {row.late !== undefined && (
        <div className="flex flex-col gap-1">
          <p className="flex items-start gap-1.5 text-small font-medium text-rec">
            <CircleAlert aria-hidden size={16} className="mt-px shrink-0" />
            <span>{row.late.line}</span>
          </p>
          {row.late.help !== undefined && <p className="text-small">{row.late.help}</p>}
        </div>
      )}
    </li>
  )
}

// The sheet a kind's row opens. Exported for its markup test (settings/settings.markup.test.tsx).
// open: how many of your requests are open, as "Your requests" read it (null when unknown).
export function RequestSheetDialog({
  sheet,
  onChange,
  targets,
  open,
  onDone,
  onDiscard,
}: {
  sheet: RequestSheet
  onChange(next: RequestSheet): void
  targets: ReplyTargets | null | undefined
  open: number | null
  onDone(caseId: string): void
  onDiscard(): void
}) {
  const queryClient = useQueryClient()
  const person = useSession()
  const [confirming, setConfirming] = useState(false)
  const formId = useId()
  const done = useRef<HTMLButtonElement>(null)
  // The box, and the discard question that replaces it: each takes focus as it comes back or
  // appears, since the control that had focus (the box, or Cancel) has gone.
  const box = useRef<HTMLTextAreaElement>(null)
  const question = useRef<HTMLParagraphElement>(null)
  // The latest sheet, for the send's callbacks, which land after the render that started them.
  const latest = useRef(sheet)
  latest.current = sheet
  // Offline, a send fails at once (rather than waiting for the network), so the sheet says it
  // couldn't confirm it and keeps the text. The list is read again before the confirmation shows,
  // so the new row is there for Done to focus.
  const send = useMutation({
    mutationFn: sendRequest,
    networkMode: 'always',
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ownRequestsQuery.queryKey }),
  })
  const view = sheetView(sheet, person.name, targets)
  useEffect(() => {
    if (sheet.phase !== 'sent' || sheet.sent === undefined) return
    done.current?.focus()
    announce(confirmationLines(sheet.sent).join(' '))
  }, [sheet.phase, sheet.sent])

  const submit = () => {
    if (view.held !== undefined || sheet.phase !== 'editing') return
    onChange(sendingSheet(sheet))
    send.mutate(sendBodyOf(sheet), {
      onSuccess: answer =>
        onChange(
          sentSheet(latest.current, {
            case: answer.case,
            reference: answer.reference,
            dueOn: answer.dueOn,
            changed: answer.changed,
          }),
        ),
      onError: error => onChange(failedSheet(latest.current, failureOf(error), open)),
    })
  }

  const keepWriting = () => {
    setConfirming(false)
    focusAfter(() => box.current)
  }

  const close = (forced?: boolean) => {
    if (sheet.phase === 'sent' && sheet.sent !== undefined) return onDone(sheet.sent.case)
    if (forced === true || !needsDiscard(sheet)) return onDiscard()
    // Asked already: Close or Escape answers the question as Keep writing, never as Discard.
    if (confirming) return keepWriting()
    if (sheet.phase === 'editing') {
      setConfirming(true)
      focusAfter(() => question.current)
    }
  }

  const sent = sheet.phase === 'sent' ? sheet.sent : undefined
  return (
    <Dialog
      open
      onClose={close}
      title={view.title}
      footer={
        sent !== undefined ? (
          <Button ref={done} variant="primary" onClick={() => onDone(sent.case)}>
            {REQUESTS.done}
          </Button>
        ) : confirming ? undefined : (
          <>
            <Button onClick={() => close()}>{REQUESTS.cancel}</Button>
            <Button type="submit" form={formId} variant="primary" disabledReason={view.held}>
              {sheet.phase === 'sending' ? REQUESTS.sending : REQUESTS.send}
            </Button>
          </>
        )
      }
    >
      {sent !== undefined ? (
        <div className="flex flex-col gap-3">
          {confirmationLines(sent).map(line => (
            <p key={line} className="break-words">
              {line}
            </p>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p>{view.intro}</p>
          {view.target !== undefined && <p className="font-medium">{view.target}</p>}
          <p>{REQUESTS.reply}</p>
          {confirming ? (
            <DiscardQuestion question={question} onKeep={keepWriting} onDiscard={onDiscard} />
          ) : (
            <form
              id={formId}
              method="post"
              noValidate
              onSubmit={event => {
                event.preventDefault()
                submit()
              }}
              className="flex flex-col gap-4"
            >
              <TextArea
                ref={box}
                label={view.label}
                hint={REQUESTS.hint}
                name="details"
                required={!view.optional}
                notes={view.notes}
                error={view.error}
                value={sheet.text}
                onChange={text => onChange(withText(sheet, text))}
              />
              <p className="text-small text-muted">{view.sentAs}</p>
              {sheet.failure !== undefined && (
                <p role="alert" className="flex items-start gap-1.5 text-rec">
                  <CircleAlert aria-hidden size={16} className="mt-1 shrink-0" />
                  <span>{sheet.failure}</span>
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </Dialog>
  )
}

// The question asked before discarding what was written: a group (a fieldset outside any form) named
// by the question, which takes focus (tabIndex -1) so a screen reader reads it before the two
// answers. Exported for its markup test (settings/settings.markup.test.tsx).
export function DiscardQuestion({
  question,
  onKeep,
  onDiscard,
}: {
  question: RefObject<HTMLParagraphElement | null>
  onKeep(): void
  onDiscard(): void
}) {
  const questionId = useId()
  return (
    <fieldset
      aria-labelledby={questionId}
      className="m-0 flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-accent-soft px-4 py-3"
    >
      <p ref={question} id={questionId} tabIndex={-1} className="font-medium">
        {REQUESTS.discard}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onKeep}>{REQUESTS.discardNo}</Button>
        <Button variant="danger" onClick={onDiscard}>
          {REQUESTS.discardYes}
        </Button>
      </div>
    </fieldset>
  )
}
