// The DPO's queue (/dpo/requests; PDPA-04, PDPA-13; C0.9 OD-14, OD-16, OD-22, PD-98, PD-99, PPL-02),
// the first of the DPO's links: the open requests, soonest due first, each a card naming its kind,
// reference, requester, how it came, the day received, the due line in words (with an icon when
// overdue, never colour alone) and its state; the most recently closed under a disclosure; and "Log
// a request" for one that came another way. A card opens the case sheet (dpo/CaseSheet.tsx) held in
// this page's state, never the URL (T21 item 5, RO-04), and closing it returns focus to the card;
// the sheet and the log dialog (dpo/LogRequest.tsx) load behind their own lazy imports when opened.
//
// The server decides who may read it (can(): the DPO alone, freshly re-authenticated, OD-14, PD-30);
// the page says what it answered, as the registers do (ReadRefusal): the PIN step, a new sign-in, or
// "This page is for the Data Protection Officer." with no links. Before the person has acknowledged
// the current notice (the DPO's setup before v0) the page sends no case query at all and says the
// requests open once the notice is published and acknowledged, with links to the setup's pages, so
// no refusal moves the tab to /notice in the middle of the setup (queueReadable, PPL-02). The
// router loads this module lazily (router/router.tsx).
import type { CaseReference, RequestQueueForClient } from '@hearth/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, CircleAlert, Plus } from 'lucide-react'
import { lazy, Suspense, useId, useState, useSyncExternalStore } from 'react'
import { useRuntime } from '@/app/runtime-context.ts'
import { REQUESTS_COPY } from '@/strings/dpo-requests.ts'
import { Button, buttonClass } from '@/ui/Button.tsx'
import { cx } from '@/ui/cx.ts'
import { Page } from '@/ui/Page.tsx'
import { Spelled } from '@/ui/Spelled.tsx'
import { requestQueueQuery } from './case-queries.ts'
import { failureOf, refusalOfError } from './model.ts'
import { Note, Pill } from './parts.tsx'
import { ReadRefusal, RegisterLinks } from './RegisterPage.tsx'
import { type QueueCard as Card, queueReadable, queueView } from './requests-model.ts'

const CaseSheet = lazy(() => import('./CaseSheet.tsx').then(module => ({ default: module.CaseSheet })))
const LogRequest = lazy(() => import('./LogRequest.tsx').then(module => ({ default: module.LogRequest })))

export function RequestsScreen() {
  const runtime = useRuntime()
  const standing = useSyncExternalStore(runtime.notice.subscribe, runtime.notice.standing, runtime.notice.standing)
  return (
    <Page>
      <div className="flex flex-col gap-5">{queueReadable(standing) ? <Queue /> : <NoticeFirst />}</div>
    </Page>
  )
}

// Before the notice is published and acknowledged (PPL-02): the setup's pages, and nothing read.
// Exported for its markup test (dpo/dpo.markup.test.tsx).
export function NoticeFirst() {
  return (
    <>
      <RegisterLinks current="requests" />
      <Note tone="info">
        <p>{REQUESTS_COPY.noticeFirst}</p>
        <div className="flex flex-wrap gap-2">
          <Link to="/dpo/purposes" activeOptions={{ exact: true }} activeProps={{}} className={buttonClass()}>
            {REQUESTS_COPY.toPurposes}
          </Link>
          <Link to="/dpo/contact" activeOptions={{ exact: true }} activeProps={{}} className={buttonClass()}>
            {REQUESTS_COPY.toContact}
          </Link>
          <Link to="/dpo/notice" activeOptions={{ exact: true }} activeProps={{}} className={buttonClass()}>
            {REQUESTS_COPY.toNotice}
          </Link>
        </div>
      </Note>
    </>
  )
}

// What the page holds open: a case's sheet (with the reference to quote when it was just logged),
// or the log dialog.
type Opened = { readonly id: string; readonly logged?: CaseReference }

function Queue() {
  const query = useQuery(requestQueueQuery)
  const error = query.error
  // A read refused with notice_required (a backstop: the page sends none before the person has
  // acknowledged) says what opens the requests, as the note before v0 does.
  const noticeRequired = error !== null && failureOf(error).code === 'notice_required'
  const refusal = error === null || noticeRequired ? undefined : refusalOfError(error)
  const [opened, setOpened] = useState<Opened | undefined>()
  const [logging, setLogging] = useState(false)
  if (noticeRequired) return <NoticeFirst />
  return (
    <>
      {refusal?.kind !== 'forbidden' && <RegisterLinks current="requests" />}
      {refusal !== undefined && <ReadRefusal refusal={refusal} retry={() => void query.refetch()} />}
      {query.isPending && (
        <p role="status" className="text-muted">
          {REQUESTS_COPY.loading}
        </p>
      )}
      {query.data !== undefined && refusal?.kind !== 'forbidden' && (
        <QueueContent answer={query.data} onOpen={id => setOpened({ id })} onLog={() => setLogging(true)} />
      )}
      {logging && query.data !== undefined && (
        <Suspense fallback={null}>
          <LogRequest
            today={query.data.today}
            onClose={() => setLogging(false)}
            onLogged={(id, reference) => {
              setLogging(false)
              setOpened({ id, logged: reference })
            }}
          />
        </Suspense>
      )}
      {opened !== undefined && (
        <Suspense fallback={null}>
          <CaseSheet
            key={opened.id}
            id={opened.id}
            logged={opened.logged}
            onClose={() => setOpened(undefined)}
            onOpen={id => setOpened({ id })}
          />
        </Suspense>
      )}
    </>
  )
}

// The queue's answer, as the page shows it. Exported for its markup test (dpo/dpo.markup.test.tsx).
export function QueueContent({
  answer,
  onOpen,
  onLog,
}: {
  answer: RequestQueueForClient
  onOpen(id: string): void
  onLog(): void
}) {
  const view = queueView(answer)
  const [showClosed, setShowClosed] = useState(false)
  const openId = useId()
  const closedId = useId()
  const closedListId = useId()
  return (
    <>
      <Button variant="primary" icon={Plus} className="self-start" onClick={onLog}>
        {REQUESTS_COPY.log}
      </Button>
      <section aria-labelledby={openId} className="flex flex-col gap-3">
        <h2 id={openId} className="font-display text-xl font-semibold">
          {view.openTitle}
        </h2>
        {view.empty && <p className="text-muted">{REQUESTS_COPY.empty}</p>}
        {view.open.length > 0 && (
          <ul className="flex flex-col gap-3">
            {view.open.map(card => (
              <li key={card.id}>
                <QueueCardButton card={card} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )}
        {view.notes.map(note => (
          <p key={note} className="text-small text-muted">
            {note}
          </p>
        ))}
      </section>
      <section aria-labelledby={closedId} className="flex flex-col gap-3">
        <h2 id={closedId} className="font-display text-xl font-semibold">
          {REQUESTS_COPY.closed}
        </h2>
        <Button
          icon={showClosed ? ChevronDown : ChevronRight}
          className="self-start"
          aria-expanded={showClosed}
          aria-controls={closedListId}
          onClick={() => setShowClosed(shown => !shown)}
        >
          {showClosed ? REQUESTS_COPY.hideClosed : REQUESTS_COPY.showClosed}
        </Button>
        <div id={closedListId} hidden={!showClosed} className="flex flex-col gap-3">
          {view.closedEmpty && <p className="text-muted">{REQUESTS_COPY.emptyClosed}</p>}
          {view.closed.length > 0 && (
            <ul className="flex flex-col gap-3">
              {view.closed.map(card => (
                <li key={card.id}>
                  <QueueCardButton card={card} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          )}
          {view.closedNotes.map(note => (
            <p key={note} className="text-small text-muted">
              {note}
            </p>
          ))}
        </div>
      </section>
    </>
  )
}

// A card: the whole of it is one button that opens the case's sheet. Its lines are spans (a button
// holds phrasing content only), each on its own line; the reference never breaks across its hyphen
// and is spelled out for a screen reader. The page's find-in-page finds a reference a requester
// quotes (search waits for C6.1, PD-98).
function QueueCardButton({ card, onOpen }: { card: Card; onOpen(id: string): void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(card.id)}
      className="flex min-h-11 w-full flex-col gap-1 rounded-2xl border border-line bg-surface p-4 text-left hover:bg-bg focus-visible:bg-bg"
    >
      <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 break-words font-medium">{card.kind}</span>
        {card.closed === undefined && <Pill tone="plain">{card.state}</Pill>}
      </span>
      <span className="text-small text-muted">
        <Spelled text={card.reference} spoken={card.referenceLabel} />
        {` · ${card.cameBy}`}
      </span>
      <span className="break-words [overflow-wrap:anywhere]">
        {card.requester}
        {card.left && <span className="text-muted">{` · ${REQUESTS_COPY.requester.left}`}</span>}
      </span>
      <span className="text-small text-muted">{card.received}</span>
      {card.due !== undefined && (
        <span className={cx('flex items-start gap-1.5 text-small', card.due.overdue ? 'font-medium text-rec' : '')}>
          {card.due.overdue && <CircleAlert aria-hidden size={16} className="mt-px shrink-0" />}
          <span>{card.due.text}</span>
        </span>
      )}
      {card.closed !== undefined && <span className="text-small">{card.closed}</span>}
    </button>
  )
}
