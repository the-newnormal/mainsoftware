// Settings and its Privacy section, rendered with react-dom/server in Node inside the shell (C0.9
// PD-47; PDPA-02 "always available in Settings", PDPA-03), and from C0.9 PR 3a how to reach the
// Data Protection Officer there (PDPA-13; OD-12, PD-69) and the acknowledgements the DPO records
// (OD-19, PD-75), and from C0.9 PR 3b the requests form and "Your requests" (OD-07, OD-15, PD-96,
// PD-97; NTW-15). How they lay out at each width is the e2e suite's (shell.spec.ts NTE-01, NTE-02).
import { MyRequestsResponseForClient, type NoticeForClient } from '@hearth/shared'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { createRef, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ApiFailure } from '@/api/http.ts'
import { ownRequestsQuery } from '@/api/queries.ts'
import { App } from '@/app/App.tsx'
import { RuntimeContext } from '@/app/runtime-context.ts'
import { formattersFor } from '@/lib/time.ts'
import { createLiveStore } from '@/live/live-status.ts'
import { APP_PATHS } from '@/router/paths.ts'
import { createAppRouter } from '@/router/router.tsx'
import { createNoticeStore } from '@/session/notice.ts'
import { createQueryClient } from '@/session/query-client.ts'
import type { SessionRuntime } from '@/session/runtime.ts'
import { aiCopyIn } from '@/strings/ai-copy.ts'
import { SETTINGS } from '@/strings/notice.ts'
import { REQUEST_KINDS, REQUESTS } from '@/strings/requests.ts'
import { ContactSection } from './PrivacySettings.tsx'
import { DiscardQuestion, RequestSheetDialog } from './RequestsSection.tsx'
import { openSheet, sentSheet, withText } from './requests-model.ts'
import { SETTINGS_SECTIONS } from './sections.ts'

// Marcus, from the Tembusu seed (db/seed/tembusu.sql), who has acknowledged its notice.
const MARCUS = {
  personId: 'b0000000-0000-4000-8000-000000000003',
  name: 'Marcus Lim',
  timeZone: 'Asia/Singapore',
  capabilities: { registers: false },
  notice: 'acknowledged' as const,
}

const ACKNOWLEDGED: NoticeForClient = {
  person: MARCUS.personId,
  standing: 'acknowledged',
  current: {
    id: 'e0000000-0000-4000-8000-000000000001',
    version: 1,
    publishedAt: '2026-10-23T01:00:00.000Z',
    body: '## About this notice\n\nThis notice tells you what personal data Hearth processes.\n\n### Backups\n- Kept for: 35 days.',
  },
  // The seed's stand-in prints no contact.
  contact: null,
  changes: null,
  mine: [
    { version: 1, acknowledgedAt: '2026-10-23T03:00:00.000Z', method: 'in_app', acknowledgedOn: null, note: null },
    // Recorded by the DPO before C0.9 PR 3a: no day or note (0011's NTU-06).
    {
      version: 0,
      acknowledgedAt: '2026-10-01T03:00:00.000Z',
      method: 'recorded_by_dpo',
      acknowledgedOn: null,
      note: null,
    },
  ],
}

// A contact on a reserved domain, with a number in the seed's made-up range that no persona uses.
const CONTACT = {
  title: 'Data Protection Officer',
  email: 'data-protection-officer@tembusu-holdings.example',
  phone: '+65 8000 0198',
  postal: '1 Example Road\nUnit 01-01\nSingapore 000000',
} as const

// Marcus's own requests (C0.9 OD-15, PD-97), as GET /api/requests would answer: one replied to on
// time, one past its target day with no reply, one closed. Every reference is made up.
const TODAY = '2026-11-12'
function myRequests(change: Record<string, unknown> = {}) {
  return MyRequestsResponseForClient.parse({
    today: TODAY,
    requests: [
      {
        id: 'c0000000-0000-4000-8000-000000000001',
        reference: 'K7QMX3TD',
        kind: 'complaint',
        cameBy: 'hearth',
        receivedOn: '2026-10-27',
        state: 'in_progress',
        dueOn: '2026-11-10',
        repliedOn: '2026-11-04',
        repliedInTime: true,
        closedOn: null,
      },
      {
        id: 'c0000000-0000-4000-8000-000000000002',
        reference: 'BC2DFG3H',
        kind: 'access',
        cameBy: 'email',
        receivedOn: '2026-10-01',
        state: 'received',
        dueOn: '2026-10-31',
        repliedOn: null,
        repliedInTime: false,
        closedOn: null,
      },
      {
        id: 'c0000000-0000-4000-8000-000000000003',
        reference: 'MNP4QRS5',
        kind: 'question',
        cameBy: 'hearth',
        receivedOn: '2026-08-03',
        state: 'closed',
        dueOn: null,
        repliedOn: '2026-08-05',
        repliedInTime: true,
        closedOn: '2026-08-07',
      },
    ],
    more: false,
    open: 2,
    ...change,
  })
}

type Requests = ReturnType<typeof myRequests> | ApiFailure

async function appAt(path: string, notice?: NoticeForClient, requests?: Requests): Promise<string> {
  const queryClient = createQueryClient(() => {})
  queryClient.setQueryData(['session'], MARCUS)
  if (notice !== undefined) queryClient.setQueryData(['notice'], notice)
  if (requests instanceof ApiFailure) {
    // A failed read stays failed as the page mounts (no retry on mount), as it shows once the
    // browser's first fetch has failed.
    queryClient.setQueryDefaults(ownRequestsQuery.queryKey, { retryOnMount: false })
    queryClient
      .getQueryCache()
      .build(queryClient, { queryKey: ownRequestsQuery.queryKey })
      .setState({ status: 'error', error: requests, fetchStatus: 'idle' })
  } else if (requests !== undefined) queryClient.setQueryData(ownRequestsQuery.queryKey, requests)
  const noop = () => {}
  const runtime = {
    info: MARCUS,
    queryClient,
    formatters: formattersFor(MARCUS.timeZone),
    live: createLiveStore('live'),
    notice: createNoticeStore({
      initial: 'acknowledged',
      live: { start: noop, resume: noop },
      refetchAll: noop,
      resetNotice: noop,
      fetchNotice: noop,
      refreshNotice: noop,
      post: noop,
    }),
    signOut: async () => 'ended',
    end: noop,
  } as unknown as SessionRuntime
  const router = createAppRouter({ runtime, storage: undefined }, createMemoryHistory({ initialEntries: [path] }))
  await router.load()
  return renderToStaticMarkup(<App router={router} runtime={runtime} />).replace(/<script\b.*?<\/script>/gs, '')
}

const textsOf = (markup: string, tag: string) =>
  [...markup.matchAll(new RegExp(`<${tag}\\b[^>]*>(.*?)</${tag}>`, 'gs'))].map(match =>
    (match[1] ?? '').replace(/<[^>]+>/g, '').replaceAll('&#x27;', "'"),
  )

// The screen's own part: what #screen holds, up to the toasts' region after it.
const screenOf = (markup: string) =>
  markup.slice(markup.indexOf('id="screen"'), markup.indexOf('aria-label="Notifications"'))

describe('C0.9 PD-47: Settings (settings/)', () => {
  it('NTW-08 PD-47 PDPA-02: the registry lists Privacy, an app path; /settings is its h1 and a 56 px link per section with its title and line', async () => {
    expect(SETTINGS_SECTIONS.map(section => [section.id, section.path, section.title])).toEqual([
      ['privacy', '/settings/privacy', 'Privacy'],
    ])
    for (const section of SETTINGS_SECTIONS) expect(APP_PATHS as readonly string[]).toContain(section.path)
    const markup = await appAt('/settings')
    expect(textsOf(markup, 'h1')).toEqual(['Settings'])
    const screen = screenOf(markup)
    expect(screen).toMatch(/<nav aria-label="Settings sections">/)
    const links = [...screen.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)].map(match => ({
      href: match[1]?.match(/href="([^"]*)"/)?.[1],
      text: (match[2] ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
      tall: (match[1] ?? '').includes('min-h-14'),
    }))
    expect(links).toEqual([
      {
        href: '/settings/privacy',
        text: 'Privacy How to reach the Data Protection Officer, questions and requests, the privacy notice and your acknowledgements',
        tall: true,
      },
    ])
  })

  it('NTW-08 PDPA-03: /settings/privacy shows the current notice, when and how you acknowledged it, and your acknowledgements newest first', async () => {
    const markup = await appAt('/settings/privacy', ACKNOWLEDGED)
    expect(textsOf(markup, 'h1')).toEqual(['Privacy'])
    const screen = screenOf(markup)
    // The contact first (C0.9 OD-12), then the form and your requests (PR 3b, NTW-15), then the
    // notice, then yours.
    expect(textsOf(screen, 'h2')).toEqual([
      'Contact the Data Protection Officer',
      'Questions and requests',
      'Your requests',
      'Privacy notice',
      'Your acknowledgements',
    ])
    // The body's sections sit under the card's h2.
    expect(textsOf(screen, 'h3')).toEqual(['About this notice'])
    expect(textsOf(screen, 'h4')).toEqual(['Backups'])
    expect(textsOf(screen, 'p')).toEqual(
      expect.arrayContaining([
        'Version 1 · published Fri 23 Oct 2026',
        'You acknowledged version 1 on Fri 23 Oct 2026 (in the app).',
      ]),
    )
    expect(textsOf(screen, 'li').slice(-2)).toEqual([
      'Version 1, Fri 23 Oct 2026 (in the app)',
      'Version 0, Thu 1 Oct 2026 (recorded by the Data Protection Officer)',
    ])
    expect(
      textsOf(screen, 'p')
        .concat(textsOf(screen, 'li'))
        .filter(text => aiCopyIn(text) !== undefined),
    ).toEqual([])
  })

  it('NTW-08: before an answer it says it is loading; with none published, so; with none acknowledged, so', async () => {
    expect(screenOf(await appAt('/settings/privacy'))).toMatch(/<p role="status"[^>]*>Loading the notice…<\/p>/)
    const none = screenOf(
      await appAt('/settings/privacy', { ...ACKNOWLEDGED, standing: 'unpublished', current: null, mine: [] }),
    )
    expect(textsOf(none, 'p')).toEqual([
      SETTINGS.privacy.contact.body,
      SETTINGS.privacy.contact.none,
      REQUESTS.intro,
      REQUESTS.mine.loading,
      'No privacy notice has been published yet.',
      'You haven’t acknowledged a version yet.',
    ])
    const notYet = screenOf(await appAt('/settings/privacy', { ...ACKNOWLEDGED, standing: 'required', mine: [] }))
    expect(textsOf(notYet, 'p')).toContain('You haven’t acknowledged version 1 yet.')
  })

  it('NTW-13 PDPA-13 OD-10 OD-12 PD-69: Settings › Privacy says first how to reach the Data Protection Officer: the role, then each channel the latest version printed, in order, the email and phone as mailto: and tel: links whose text is the value, the post as its lines, and that it works after you leave', () => {
    const markup = renderToStaticMarkup(<ContactSection contact={CONTACT} />)
    expect(textsOf(markup, 'h2')).toEqual([SETTINGS.privacy.contact.title])
    expect(textsOf(markup, 'p')).toEqual([
      SETTINGS.privacy.contact.body,
      CONTACT.title,
      CONTACT.postal,
      SETTINGS.privacy.contact.leaving,
    ])
    const links = [...markup.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)].map(match => ({
      href: match[1]?.match(/href="([^"]*)"/)?.[1],
      text: match[2],
      tall: (match[1] ?? '').includes('min-h-11'),
    }))
    expect(links).toEqual([
      { href: 'mailto:data-protection-officer@tembusu-holdings.example', text: CONTACT.email, tall: true },
      { href: 'tel:+6580000198', text: CONTACT.phone, tall: true },
    ])
    // Each row's term is visible text beside its value; the post keeps its lines.
    expect(textsOf(markup, 'span')).toEqual(['Email', 'Phone', 'Post'])
    expect(markup).toContain('whitespace-pre-line')
    // A long value breaks rather than scrolling sideways at 320 px.
    expect(markup.split('[overflow-wrap:anywhere]').length - 1).toBe(4)
    expect(
      textsOf(markup, 'p')
        .concat(textsOf(markup, 'span'), textsOf(markup, 'a'))
        .filter(text => aiCopyIn(text) !== undefined),
    ).toEqual([])
  })

  it('NTW-13 PD-69: every subset of channels shows only what was printed, in the same order; none printed says the policy gives it, and an unreadable answer says so', () => {
    const channels = ['email', 'phone', 'postal'] as const
    for (let mask = 1; mask < 8; mask++) {
      const contact = {
        title: CONTACT.title,
        email: mask & 1 ? CONTACT.email : null,
        phone: mask & 2 ? CONTACT.phone : null,
        postal: mask & 4 ? CONTACT.postal : null,
      }
      const markup = renderToStaticMarkup(<ContactSection contact={contact} />)
      const shown = channels.filter((_, at) => mask & (1 << at))
      expect(textsOf(markup, 'span'), String(mask)).toEqual(shown.map(channel => SETTINGS.privacy.contact[channel]))
      expect(markup.includes('href="mailto:'), String(mask)).toBe(contact.email !== null)
      expect(markup.includes('href="tel:'), String(mask)).toBe(contact.phone !== null)
    }
    const none = renderToStaticMarkup(<ContactSection contact={null} />)
    expect(textsOf(none, 'p')).toEqual([SETTINGS.privacy.contact.body, SETTINGS.privacy.contact.none])
    expect(none).not.toContain('<a ')
    const unreadable = renderToStaticMarkup(<ContactSection contact={undefined} />)
    expect(textsOf(unreadable, 'p')).toEqual([SETTINGS.privacy.contact.body, SETTINGS.privacy.contact.unreadable])
  })

  it('NTW-13 OD-19 PD-75: an acknowledgement the DPO recorded shows the day you acknowledged outside Hearth and how, in the standing line and the history; the contact the latest version printed shows first', async () => {
    const markup = await appAt('/settings/privacy', {
      ...ACKNOWLEDGED,
      contact: CONTACT,
      mine: [
        {
          version: 1,
          acknowledgedAt: '2026-10-23T03:00:00.000Z',
          method: 'recorded_by_dpo',
          acknowledgedOn: '2026-10-20',
          note: 'Signed a printed copy at induction',
        },
        { version: 0, acknowledgedAt: '2026-10-01T03:00:00.000Z', method: 'in_app', acknowledgedOn: null, note: null },
      ],
    })
    const screen = screenOf(markup)
    expect(textsOf(screen, 'h2')[0]).toBe(SETTINGS.privacy.contact.title)
    expect(screen).toContain('href="mailto:data-protection-officer@tembusu-holdings.example"')
    expect(textsOf(screen, 'p')).toContain(
      'You acknowledged version 1 on Tue 20 Oct 2026 (recorded by the Data Protection Officer).',
    )
    expect(textsOf(screen, 'span')).toEqual(
      expect.arrayContaining([
        'Version 1, Tue 20 Oct 2026 (recorded by the Data Protection Officer)',
        'How: Signed a printed copy at induction',
        'Version 0, Thu 1 Oct 2026 (in the app)',
      ]),
    )
    expect(textsOf(screen, 'span').filter(text => text.startsWith('How: '))).toHaveLength(1)
  })
})

// The sheet on its own, inside what it reads: Marcus's QueryClient and runtime.
function alone(node: ReactNode): string {
  const queryClient = createQueryClient(() => {})
  queryClient.setQueryData(['session'], MARCUS)
  const runtime = { info: MARCUS, queryClient, formatters: formattersFor(MARCUS.timeZone) } as unknown as SessionRuntime
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <RuntimeContext value={runtime}>{node}</RuntimeContext>
    </QueryClientProvider>,
  )
}

const decoded = (text: string) => text.replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&')

// What a reader meets: the text of every element, one line each.
const readable = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map(line => decoded(line.trim()))
    .filter(Boolean)

// The buttons, by their accessible name, with whether each is held.
const buttonsOf = (markup: string) =>
  [...markup.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].map(match => ({
    name: decoded((match[1] ?? '').match(/aria-label="([^"]*)"/)?.[1] ?? (match[2] ?? '').replace(/<[^>]+>/g, '')),
    held: /aria-disabled="true"/.test(match[1] ?? ''),
  }))

const PUBLISHED_TARGETS = { businessDays: 7, calendarDays: 21 }

describe('C0.9 PR 3b: requests to the Data Protection Officer on Settings › Privacy (settings/)', () => {
  it('NTW-15 OD-07 OD-15 T22 item 41: the page reads the contact, then Questions and requests (the six kinds as rows of at least 44 px, in OD-07’s order), then Your requests, then the notice, then your acknowledgements', async () => {
    const screen = screenOf(
      await appAt('/settings/privacy', { ...ACKNOWLEDGED, targets: PUBLISHED_TARGETS }, myRequests()),
    )
    expect(textsOf(screen, 'h2')).toEqual([
      SETTINGS.privacy.contact.title,
      REQUESTS.title,
      REQUESTS.mine.title,
      SETTINGS.privacy.noticeTitle,
      SETTINGS.privacy.historyTitle,
    ])
    const kinds = buttonsOf(screen).map(button => button.name)
    expect(kinds).toEqual(Object.values(REQUEST_KINDS))
    expect([...screen.matchAll(/<button\b([^>]*)>/g)].every(match => /\bmin-h-11\b/.test(match[1] ?? ''))).toBe(true)
    expect(readable(screen).filter(text => aiCopyIn(text) !== undefined)).toEqual([])
  })

  it('RQW-05 OD-15 PD-97 PD-112: Your requests shows each row’s kind, state in words, reference spelled out and never broken, how it came and its days; the DPO’s reply day; past its target day with what to do only when no reply is recorded; never the words or the outcome', async () => {
    const screen = screenOf(await appAt('/settings/privacy', ACKNOWLEDGED, myRequests()))
    const text = readable(screen)
    expect(text).toEqual(
      expect.arrayContaining([
        'A complaint',
        'In progress',
        'K7QM-X3TD',
        'Reference K 7 Q M, X 3 T D',
        '· Sent in Hearth',
        'Received Tue 27 Oct 2026 · Reply due Tue 10 Nov 2026',
        'The Data Protection Officer replied on Wed 4 Nov 2026.',
        'A copy of my data',
        'Received',
        '· Received by email',
        'Past its target day (Sat 31 Oct 2026).',
        REQUESTS.mine.lateHelp,
        'Closed',
        'Received Mon 3 Aug 2026 · Closed Fri 7 Aug 2026',
      ]),
    )
    // The complaint was replied to on time: it never reads as late (PD-112). Only the copy does.
    expect(text.filter(line => line.startsWith('Past its target day'))).toEqual([
      'Past its target day (Sat 31 Oct 2026).',
    ])
    expect(screen).toMatch(/translate="no" class="whitespace-nowrap"/)
    // Each row takes focus after Done (by the case's id).
    expect(screen).toContain('id="request-c0000000-0000-4000-8000-000000000001" tabindex="-1"')
    expect(text.filter(line => aiCopyIn(line) !== undefined)).toEqual([])
  })

  it('RQW-05 PD-97: Your requests says when it is loading, when there are none, when it can’t be read (and the form still shows), and when the list was cut at 50', async () => {
    const loading = screenOf(await appAt('/settings/privacy', ACKNOWLEDGED))
    expect(loading).toMatch(/<p role="status"[^>]*>Loading your requests…<\/p>/)
    const none = screenOf(await appAt('/settings/privacy', ACKNOWLEDGED, myRequests({ requests: [], open: 0 })))
    expect(readable(none)).toContain(REQUESTS.mine.empty)
    const failed = screenOf(
      await appAt('/settings/privacy', ACKNOWLEDGED, new ApiFailure(503, 'unavailable', 'Try again.')),
    )
    expect(readable(failed)).toContain(REQUESTS.mine.unreadable)
    expect(readable(failed)).not.toContain(REQUESTS.mine.empty)
    // The form shows whether or not Your requests could be read.
    expect(buttonsOf(failed).map(button => button.name)).toEqual(Object.values(REQUEST_KINDS))
    const cut = screenOf(await appAt('/settings/privacy', ACKNOWLEDGED, myRequests({ more: true })))
    expect(readable(cut)).toContain(REQUESTS.mine.cut)
  })

  it('RQW-05 PD-96 OD-25: with 10 open requests the kinds are replaced by the cap’s line, so nobody writes what they can’t send; an unreadable count leaves the kinds', async () => {
    const cap = screenOf(await appAt('/settings/privacy', ACKNOWLEDGED, myRequests({ open: 10 })))
    expect(readable(cap)).toContain(REQUESTS.atCap)
    expect(buttonsOf(cap).map(button => button.name)).not.toContain(REQUEST_KINDS.complaint)
    const unknown = screenOf(await appAt('/settings/privacy', ACKNOWLEDGED, myRequests({ open: 'ten' })))
    expect(buttonsOf(unknown).map(button => button.name)).toContain(REQUEST_KINDS.complaint)
  })

  it('RQW-03 OD-07 PD-96 PD-102: a kind’s sheet gives what happens next, the published target for the kind, that the reply comes outside Hearth, a 16 px box of five rows in its own direction with its hint, who it is sent as, and Send held until something is written; never an invented figure', () => {
    const sheet = openSheet('complaint', 'd0000000-0000-4000-8000-000000000001')
    const markup = alone(
      <RequestSheetDialog
        sheet={sheet}
        onChange={() => {}}
        targets={PUBLISHED_TARGETS}
        open={2}
        onDone={() => {}}
        onDiscard={() => {}}
      />,
    )
    expect(textsOf(markup, 'h2')).toEqual([REQUEST_KINDS.complaint])
    const text = readable(markup)
    expect(text).toEqual(
      expect.arrayContaining([
        'Say what went wrong. If you’d rather not raise it with your organisation, you can contact the PDPC instead, as the privacy notice says.',
        'The Data Protection Officer aims to reply within 7 business days.',
        REQUESTS.reply,
        REQUESTS.field,
        REQUESTS.hint,
        'Sent as Marcus Lim. The Data Protection Officer may check it’s you before replying.',
      ]),
    )
    const box = markup.match(/<textarea\b([^>]*)>/)?.[1] ?? ''
    expect(box).toMatch(/dir="auto"/)
    expect(box).toMatch(/rows="5"/)
    expect(box).toMatch(/\btext-base\b/)
    expect(box).toMatch(/\bmin-h-11\b/)
    expect(box).toMatch(/\bresize-y\b/)
    expect(box).not.toMatch(/maxLength/)
    expect(buttonsOf(markup).find(button => button.name === REQUESTS.send)).toEqual({ name: REQUESTS.send, held: true })
    // No target line when the notice prints none, or couldn't be read.
    for (const targets of [null, undefined]) {
      const bare = alone(
        <RequestSheetDialog
          sheet={sheet}
          onChange={() => {}}
          targets={targets}
          open={2}
          onDone={() => {}}
          onDiscard={() => {}}
        />,
      )
      expect(readable(bare).filter(line => line.includes('aims to reply'))).toEqual([])
    }
    // A copy of their data counts calendar days, and may be sent with nothing written.
    const copy = alone(
      <RequestSheetDialog
        sheet={openSheet('access', 'd0000000-0000-4000-8000-000000000002')}
        onChange={() => {}}
        targets={PUBLISHED_TARGETS}
        open={2}
        onDone={() => {}}
        onDiscard={() => {}}
      />,
    )
    expect(readable(copy)).toEqual(
      expect.arrayContaining([
        'The Data Protection Officer aims to reply within 21 calendar days.',
        REQUESTS.fieldOptional,
      ]),
    )
    expect(buttonsOf(copy).find(button => button.name === REQUESTS.send)?.held).toBe(false)
    expect(text.filter(line => aiCopyIn(line) !== undefined)).toEqual([])
  })

  it('RQW-03 RQW-04 OD-22 PD-96: written, Send acts; an ID-number shape adds a hint, never a refusal; once sent, the sheet’s content is the confirmation with the due day and the reference, and Done alone', () => {
    const written = withText(
      openSheet('question', 'd0000000-0000-4000-8000-000000000003'),
      'My number is S1234567D, please check.',
    )
    const markup = alone(
      <RequestSheetDialog
        sheet={written}
        onChange={() => {}}
        targets={PUBLISHED_TARGETS}
        open={2}
        onDone={() => {}}
        onDiscard={() => {}}
      />,
    )
    expect(buttonsOf(markup).find(button => button.name === REQUESTS.send)?.held).toBe(false)
    expect(readable(markup)).toContain(REQUESTS.idHint)
    const sent = sentSheet(written, {
      case: 'c0000000-0000-4000-8000-000000000009',
      reference: 'K7QMX3TD' as never,
      dueOn: '2026-11-10',
      changed: true,
    })
    const confirmation = alone(
      <RequestSheetDialog
        sheet={sent}
        onChange={() => {}}
        targets={PUBLISHED_TARGETS}
        open={2}
        onDone={() => {}}
        onDiscard={() => {}}
      />,
    )
    expect(textsOf(confirmation, 'p')).toEqual([
      'Sent to the Data Protection Officer.',
      'They aim to reply by Tue 10 Nov 2026.',
      'Your reference is K7QM-X3TD. Quote it if you write to them about this request.',
      'You can follow it under “Your requests”.',
    ])
    expect(buttonsOf(confirmation).map(button => button.name)).toEqual(['Close', REQUESTS.done])
    expect(confirmation).not.toContain('<textarea')
    // Nothing claims the DPO was told.
    expect(readable(confirmation).filter(line => /\b(?:told|alerted|notified)\b/.test(line))).toEqual([])
  })

  it('RQW-03 X6 R8: the discard question is a group named by the question, which takes focus (tabindex -1) so a screen reader reads it first, with Keep writing before Discard', () => {
    const markup = alone(<DiscardQuestion question={createRef()} onKeep={() => {}} onDiscard={() => {}} />)
    const group = markup.match(/<fieldset aria-labelledby="([^"]+)"/)
    const question = markup.match(/<p id="([^"]+)" tabindex="-1"[^>]*>(.*?)<\/p>/)
    expect(group?.[1]).toBeDefined()
    expect(question?.[1]).toBe(group?.[1])
    expect(decoded(question?.[2] ?? '')).toBe(REQUESTS.discard)
    expect(buttonsOf(markup).map(button => button.name)).toEqual([REQUESTS.discardNo, REQUESTS.discardYes])
  })
})
