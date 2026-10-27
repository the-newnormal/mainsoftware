// The DPO's queue, pure (PDPA-04, PDPA-13; C0.9 OD-14, OD-22, PD-98, PD-99, PD-112, PPL-02): whether
// the queue may be read yet, and the cards with their due words, so every state is tested in Node
// with no DOM (dpo/requests-model.test.ts, RQW-06, RQW-07, RQW-11). The case sheet's and the log
// dialog's logic is dpo/case-model.ts, which loads with them. Every day is the org's, as the server
// sent it, and "due" and "overdue" are decided from the answer's own today, never the browser's
// clock.
import {
  formatCaseReference,
  type NoticeStanding,
  type QueueRowForClient,
  type RequestQueueForClient,
  spelledReference,
} from '@hearth/shared'
import { dayText } from '@/lib/time.ts'
import {
  CAME_BY_LABELS,
  CASE_KIND_LABELS,
  CASE_STATE_LABELS,
  OUTCOME_LABELS,
  REQUESTS_COPY,
} from '@/strings/dpo-requests.ts'

// --- Whether the queue is read (RQW-11, PPL-02) --------------------------------------------------

// The queue is read only once the person has acknowledged the current notice: before v0 (the DPO's
// setup) every case read would be refused with notice_required, which moves the tab to /notice in
// the middle of the setup, so the page shows its own note instead and sends nothing.
export const queueReadable = (standing: NoticeStanding): boolean => standing === 'acknowledged'

// --- The cards (RQW-06, RQW-07) ------------------------------------------------------------------

// The due line of an open request, in words, from the answer's today: replied on time (PD-112: the
// clock has stopped), due today, overdue since its due day (with an icon beside it, never colour
// alone), or due on its day.
export interface DueWords {
  readonly text: string
  readonly overdue: boolean
}

export function dueWords(
  row: { readonly dueOn: string | null; readonly repliedOn: string | null; readonly repliedInTime: boolean },
  today: string,
): DueWords | undefined {
  if (row.repliedInTime && row.repliedOn !== null) {
    return { text: REQUESTS_COPY.repliedOnTime(dayText(row.repliedOn)), overdue: false }
  }
  if (row.dueOn === null) return undefined
  if (row.dueOn === today) return { text: REQUESTS_COPY.dueToday, overdue: false }
  if (row.dueOn < today) return { text: REQUESTS_COPY.overdue(dayText(row.dueOn)), overdue: true }
  return { text: REQUESTS_COPY.due(dayText(row.dueOn)), overdue: false }
}

// Who sent a request, as a card names them: a person by roster name and department, and whether
// they have left; someone without an account by name.
export function requesterLine(requester: QueueRowForClient['requester']): { name: string; left: boolean } {
  if (requester.type === 'outside') return { name: REQUESTS_COPY.requester.outside(requester.name), left: false }
  return {
    name:
      requester.department === null
        ? requester.name
        : REQUESTS_COPY.requester.person(requester.name, requester.department),
    left: requester.left,
  }
}

export interface QueueCard {
  readonly id: string
  readonly kind: string
  readonly reference: string
  readonly referenceLabel: string
  readonly requester: string
  readonly left: boolean
  readonly cameBy: string
  readonly received: string
  // Open: the due line; closed: the day and the outcome.
  readonly due: DueWords | undefined
  readonly closed: string | undefined
  readonly state: string
}

// The element id of a case's card, by which focus finds it again once its sheet has closed: a step
// that closes the case moves the card to the closed list, so the button that opened the sheet has
// gone (RequestsScreen.tsx).
export const queueCardId = (id: string): string => `case-${id}`

export function queueCard(row: QueueRowForClient, today: string): QueueCard {
  const requester = requesterLine(row.requester)
  return {
    id: row.id,
    kind: CASE_KIND_LABELS[row.kind],
    reference: formatCaseReference(row.reference),
    referenceLabel: REQUESTS_COPY.referenceLabel(spelledReference(row.reference)),
    requester: requester.name,
    left: requester.left,
    cameBy: CAME_BY_LABELS[row.cameBy],
    received: REQUESTS_COPY.received(dayText(row.receivedOn)),
    due: row.closedOn === null ? dueWords(row, today) : undefined,
    closed:
      row.closedOn === null || row.outcome === null
        ? undefined
        : REQUESTS_COPY.closedOn(dayText(row.closedOn), OUTCOME_LABELS[row.outcome]),
    state: CASE_STATE_LABELS[row.state],
  }
}

// The queue as the page shows it: the open cards (soonest due first, as the answer orders them)
// with the total in the heading, whether the list was cut or couldn't all be read, and "No open
// requests." only when the list was read in full and holds none; the closed cards likewise.
export interface QueueView {
  readonly open: readonly QueueCard[]
  readonly openTitle: string
  readonly empty: boolean
  readonly notes: readonly string[]
  readonly closed: readonly QueueCard[]
  readonly closedEmpty: boolean
  readonly closedNotes: readonly string[]
}

export function queueView(answer: RequestQueueForClient): QueueView {
  const open = answer.open.rows.map(row => queueCard(row, answer.today))
  const total = answer.openTotal
  const cut = answer.open.complete && total !== null && total > open.length
  const closed = answer.closed.rows.map(row => queueCard(row, answer.today))
  return {
    open,
    openTitle: REQUESTS_COPY.openTitle(String(total ?? open.length)),
    empty: answer.open.complete && open.length === 0 && (total === null || total === 0),
    notes: [
      ...(cut ? [REQUESTS_COPY.cut(String(open.length), String(total))] : []),
      ...(answer.open.complete ? [] : [REQUESTS_COPY.incomplete]),
    ],
    closed,
    closedEmpty: answer.closed.complete && closed.length === 0 && !answer.closedMore,
    closedNotes: [
      ...(answer.closedMore ? [REQUESTS_COPY.closedCut] : []),
      ...(answer.closed.complete ? [] : [REQUESTS_COPY.closedIncomplete]),
    ],
  }
}
