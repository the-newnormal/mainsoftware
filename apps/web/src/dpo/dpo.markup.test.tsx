// The DPO pages and their dialogs, rendered with react-dom/server in Node (C0.9 PD-26, PD-27;
// T21, D-03): the app's root over a router at /dpo/purposes, /dpo/transfers, /dpo/contact (C0.9
// PR 3a, PD-70) or /dpo/notice with the answers in the person's Query cache, and each dialog and
// refusal on its own. What the markup holds (the h1, the links between the pages, the cards, names,
// held buttons, the fields each basis takes, the contact's fields and the record dialog's) is
// checked here; how it behaves in a browser is dpo.spec.ts's.

import { MESSAGES, REAUTH_METHOD_MESSAGES } from '@hearth/shared'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ApiFailure } from '@/api/http.ts'
import { App } from '@/app/App.tsx'
import { RuntimeContext } from '@/app/runtime-context.ts'
import { formattersFor } from '@/lib/time.ts'
import { createLiveStore } from '@/live/live-status.ts'
import { createAppRouter } from '@/router/router.tsx'
import { createNoticeStore } from '@/session/notice.ts'
import { createQueryClient } from '@/session/query-client.ts'
import type { SessionRuntime } from '@/session/runtime.ts'
import { aiCopyIn } from '@/strings/ai-copy.ts'
import { DPO } from '@/strings/dpo.ts'
import { CASE_COPY } from '@/strings/dpo-case.ts'
import { CONTACT } from '@/strings/dpo-contact.ts'
import { NOTICE_MARKERS, NOTICE_TAB } from '@/strings/dpo-notice.ts'
import { PURPOSES_COPY } from '@/strings/dpo-purposes.ts'
import { RECORD } from '@/strings/dpo-record.ts'
import { REQUESTS_COPY } from '@/strings/dpo-requests.ts'
import { PROVIDER_CHECKS, TRANSFERS_COPY } from '@/strings/dpo-transfers.ts'
import { SHELL } from '@/strings/shell.ts'
import { AddStep, CaseSheet } from './CaseSheet.tsx'
import { ContactDialog, TargetsDialog } from './ContactScreen.tsx'
import { casePeopleQuery, caseQuery, requestQueueQuery } from './case-queries.ts'
import { LogRequest } from './LogRequest.tsx'
import { PurposeDialog } from './PurposesScreen.tsx'
import { contactQuery, noticeAdminQuery, noticePeopleQuery, registersQuery } from './queries.ts'
import { RecordDialog } from './RecordAcknowledgement.tsx'
import { ReadRefusal } from './RegisterPage.tsx'
import { NoticeFirst, QueueContent } from './RequestsScreen.tsx'
import { ClearDialog, TransferDialog, WithdrawDialog } from './TransfersScreen.tsx'
import {
  ALIKE_IDS,
  CASE_IDS,
  CASE_TODAY,
  caseForClient,
  casePeopleForClient,
  LEAVER_ID,
  MARCUS_ID,
  queueForClient,
} from './testing/cases.ts'
import {
  COMPLETE_FACTS,
  contactAdminForClient,
  contactRow,
  NO_CONTACT_DRAFT,
  noticeAdminForClient,
  noticePeopleForClient,
  registersForClient,
  TODAY,
} from './testing/registers.ts'

// Ashton, the Tembusu seed's Owner and DPO (db/seed/tembusu.sql).
const ASHTON = {
  personId: 'b0000000-0000-4000-8000-000000000001',
  name: 'Ashton Teo',
  timeZone: 'Asia/Singapore',
  capabilities: { registers: true },
  notice: 'acknowledged' as const,
}

const CLEARED = {
  clearedOn: '2026-10-02',
  clearedBy: 'Ashton Teo',
  clearedVia: 'app',
  revision: 2,
  withdrawnOn: null,
  withdrawnBy: null,
  withdrawReason: null,
} as const

const REGISTERS = registersForClient(
  { security_audit: { version: 2, basis: 'legitimate_interests', basisReference: 'DPO file', retention: '13 months' } },
  { twilio: { ...COMPLETE_FACTS, revision: 2, clearance: CLEARED } },
)

const purpose = (key: string) => {
  const row = REGISTERS.purposes.find(each => each.purpose === key)
  if (row === undefined) throw new Error(`no ${key} in the fixture`)
  return row
}
const transfer = (key: string) => {
  const row = REGISTERS.transfers.find(each => each.provider === key)
  if (row === undefined) throw new Error(`no ${key} in the fixture`)
  return row
}

type NoticeAdmin = ReturnType<typeof noticeAdminForClient>

// Other answers in the cache: the contact page's (C0.9 PD-70) and the record dialog's people (PD-76).
interface Cached {
  readonly contact?: ReturnType<typeof contactAdminForClient>
  readonly people?: ReturnType<typeof noticePeopleForClient>
  // The people's read failed, with this.
  readonly peopleFailed?: ApiFailure
}

function runtime(registers?: typeof REGISTERS, notice?: NoticeAdmin, cached: Cached = {}): SessionRuntime {
  const queryClient = createQueryClient(() => {})
  queryClient.setQueryData(['session'], ASHTON)
  if (registers !== undefined) queryClient.setQueryData(registersQuery.queryKey, registers)
  if (notice !== undefined) queryClient.setQueryData(noticeAdminQuery.queryKey, notice)
  if (cached.contact !== undefined) queryClient.setQueryData(contactQuery.queryKey, cached.contact)
  if (cached.people !== undefined) queryClient.setQueryData(noticePeopleQuery.queryKey, cached.people)
  if (cached.peopleFailed !== undefined) {
    // A failed read stays failed as the dialog mounts (no retry on mount), as it shows once the
    // browser's first fetch has failed.
    queryClient.setQueryDefaults(noticePeopleQuery.queryKey, { retryOnMount: false })
    queryClient
      .getQueryCache()
      .build(queryClient, { queryKey: noticePeopleQuery.queryKey })
      .setState({ status: 'error', error: cached.peopleFailed, fetchStatus: 'idle' })
  }
  const noop = () => {}
  return {
    info: ASHTON,
    queryClient,
    formatters: formattersFor(ASHTON.timeZone),
    live: createLiveStore('live'),
    // Ashton has acknowledged the current notice, so the shell's guard lets every path through.
    notice: createNoticeStore({
      initial: ASHTON.notice,
      live: { start: noop, resume: noop },
      refetchAll: noop,
      resetNotice: noop,
      fetchNotice: noop,
      refreshNotice: noop,
      post: noop,
    }),
    signOut: async () => 'ended',
    end: () => {},
  } as unknown as SessionRuntime
}

async function appAt(
  path: string,
  registers: typeof REGISTERS | null = REGISTERS,
  notice?: NoticeAdmin,
  cached: Cached = {},
): Promise<string> {
  const session = runtime(registers ?? undefined, notice, cached)
  const router = createAppRouter(
    { runtime: session, storage: undefined },
    createMemoryHistory({ initialEntries: [path] }),
  )
  await router.load()
  return renderToStaticMarkup(<App router={router} runtime={session} />).replace(/<script\b.*?<\/script>/gs, '')
}

// A piece rendered on its own, inside what it reads: the person's QueryClient and runtime, and a
// router.
function alone(node: ReactNode, cached: Cached = {}): string {
  const session = runtime(REGISTERS, undefined, cached)
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ['/'] }) })
  return renderToStaticMarkup(
    <QueryClientProvider client={session.queryClient}>
      <RuntimeContext value={session}>
        <RouterContextProvider router={router}>{node}</RouterContextProvider>
      </RuntimeContext>
    </QueryClientProvider>,
  )
}

// The attributes of every element with this tag, in order (React's casing: autoComplete, inputMode).
function tags(markup: string, tag: string): Map<string, string>[] {
  return [...markup.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))].map(
    match => new Map([...(match[1] ?? '').matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map(a => [a[1] ?? '', a[2] ?? ''])),
  )
}

const decoded = (text: string) =>
  text.replaceAll('&#x27;', "'").replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&lt;', '<')

// The text of every element with this tag.
const textsOf = (markup: string, tag: string) =>
  [...markup.matchAll(new RegExp(`<${tag}\\b[^>]*>(.*?)</${tag}>`, 'gs'))].map(match =>
    decoded((match[1] ?? '').replace(/<[^>]+>/g, '')),
  )

// What a reader meets: the text, and every aria-label, title and alt.
function readable(markup: string): string[] {
  const text = markup
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  const names = [...markup.matchAll(/\b(?:aria-label|title|alt)="([^"]*)"/g)].map(match => match[1] ?? '')
  return [...text, ...names].map(decoded)
}

// The buttons, by their accessible name (aria-label, else the text), with whether each is held.
const buttons = (markup: string) =>
  [...markup.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].map(match => {
    const attributes = match[1] ?? ''
    const name = attributes.match(/aria-label="([^"]*)"/)?.[1] ?? (match[2] ?? '').replace(/<[^>]+>/g, '')
    return {
      name: decoded(name),
      held: /aria-disabled="true"/.test(attributes),
      type: attributes.match(/type="(\w+)"/)?.[1],
    }
  })

const optionsOf = (markup: string, name: string) => {
  const start = markup.search(new RegExp(`<select[^>]*name="${name}"`))
  return textsOf(markup.slice(start, markup.indexOf('</select>', start)), 'option')
}

describe('C0.9 PD-26: the DPO pages (dpo/)', () => {
  it('DPP-05 PDPA-01 PD-07 PD-27: /dpo/purposes is the shell’s page titled Processing register, with the links between the registers (Purposes current), a card per non-AI purpose with its status and an Edit named for it, the pinned purposes saying Hearth keeps them, and the two lines under the list', async () => {
    const markup = await appAt('/dpo/purposes')
    expect(textsOf(markup, 'h1')).toEqual(['Processing register'])
    // The track is named for all the DPO's pages, "Data protection", never "Registers" again, since
    // it holds the requests and the notice too (C0.9 PR 3b, PPL-06).
    const registers = tags(markup, 'nav').filter(nav => nav.get('aria-label') === 'Data protection')
    expect(registers).toHaveLength(1)
    expect(tags(markup, 'nav').filter(nav => nav.get('aria-label') === 'Registers')).toEqual([])
    const links = [...markup.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)]
      .filter(match => /href="\/dpo\//.test(match[1] ?? ''))
      .map(match => [match[1]?.match(/href="([^"]*)"/)?.[1], match[1]?.match(/aria-current="([^"]*)"/)?.[1]])
    // The Data protection links (C0.9 PD-48 adds the Notice tab's, PR 3a the contact page's, PR 3b the
    // requests', first), then the banner's link to the Notice tab: on its first day the org has
    // published no notice.
    expect(links).toEqual([
      ['/dpo/requests', undefined],
      ['/dpo/purposes', 'page'],
      ['/dpo/transfers', undefined],
      ['/dpo/contact', undefined],
      ['/dpo/notice', undefined],
      ['/dpo/notice', undefined],
    ])
    const cards = textsOf(markup, 'h2')
    // 14 from C0.9 PR 3b: request_handling (OD-17).
    expect(cards).toHaveLength(14)
    expect(cards[0]).toBe('Accounts and sign-in: the roster, phone numbers and one-time codes, devices, profiles')
    expect(cards).not.toContain('Transcribing sessions')
    expect(buttons(markup).filter(button => button.name.startsWith('Edit '))).toHaveLength(14)
    expect(buttons(markup).map(button => button.name)).toContain('Edit Security audit and monitoring')
    expect(markup.split(PURPOSES_COPY.pinned).length - 1).toBe(2)
    expect(readable(markup)).toEqual(
      expect.arrayContaining([PURPOSES_COPY.startsWhenNotified, PURPOSES_COPY.laterStages]),
    )
    // It claims nothing the cards contradict: the pinned purposes, security audit and backups show
    // as active before any notice exists, so the line sets them apart (T22 items 4 and 5).
    expect(PURPOSES_COPY.startsWhenNotified).toMatch(/^Apart from the purposes Hearth keeps active, /)
    expect(PURPOSES_COPY.startsWhenNotified).toContain('Hearth already keeps the audit log and backups.')
    expect(readable(markup).filter(text => aiCopyIn(text) !== undefined)).toEqual([])
    // No tab of the navigation claims the page.
    expect(
      tags(markup, 'a').filter(link => link.get('aria-current') && !link.get('href')?.startsWith('/dpo/')),
    ).toEqual([])
  })

  it('DPP-05 PDPA-10 PD-13 T22 item 3: /dpo/transfers is titled Transfer register, with a card per non-AI provider; Clear for use is held while facts are missing, a cleared provider offers Withdraw clearance, and each says what checks it', async () => {
    const markup = await appAt('/dpo/transfers')
    expect(textsOf(markup, 'h1')).toEqual(['Transfer register'])
    expect(textsOf(markup, 'h2')).toEqual([
      'Amazon Web Services',
      'AWS text messages',
      'Twilio Verify',
      'LiveKit Cloud',
      'Apple Push Notification service',
      'Firebase Cloud Messaging',
      'Mozilla Push Service',
      'Windows Push Notification Services',
    ])
    const all = buttons(markup)
    expect(all.filter(button => button.name === TRANSFERS_COPY.withdraw)).toEqual([
      { name: TRANSFERS_COPY.withdraw, held: false, type: 'button' },
    ])
    const clears = all.filter(button => button.name === TRANSFERS_COPY.clearForUse)
    expect(clears).toHaveLength(7)
    expect(clears.every(button => button.held)).toBe(true)
    expect(markup).toContain(TRANSFERS_COPY.clearHeld)
    expect(readable(markup)).toEqual(expect.arrayContaining(['Cleared on Fri 2 Oct 2026 by Ashton Teo']))
    expect(readable(markup).filter(text => aiCopyIn(text) !== undefined)).toEqual([])
  })

  it('DPP-05 T21 item 5: before the answer, the page says it is loading, in a status', async () => {
    const markup = await appAt('/dpo/purposes', null)
    expect(markup).toMatch(/<p role="status"[^>]*>Loading the register…<\/p>/)
    expect(textsOf(markup, 'h2')).toEqual([])
  })

  it('DPP-05 PD-11 PD-07: the purpose dialog offers only what can save: a pinned purpose its one status as text and no consent-type basis; one that needs a switch every status and no consent-type basis; a legitimate-interests entry its assessment field', () => {
    const accounts = alone(<PurposeDialog row={purpose('accounts')} onClose={() => {}} />)
    expect(textsOf(accounts, 'h2')[0]).toMatch(/^Edit Accounts and sign-in/)
    expect(tags(accounts, 'fieldset').length).toBe(1)
    expect(accounts).toContain('Status: </span>Active')
    expect(optionsOf(accounts, 'basis')).toEqual([
      'Not recorded',
      'Employment: managing the working relationship',
      'Legitimate interests',
      'Business improvement',
      'Another exception or legal requirement',
    ])

    const recording = alone(<PurposeDialog row={purpose('recording_meetings')} onClose={() => {}} />)
    expect(
      tags(recording, 'input')
        .filter(input => input.get('type') === 'radio')
        .map(input => input.get('value')),
    ).toEqual(['planned', 'active', 'retired'])
    expect(optionsOf(recording, 'basis')).not.toEqual(expect.arrayContaining(['Consent']))

    const audit = alone(<PurposeDialog row={purpose('security_audit')} onClose={() => {}} />)
    expect(textsOf(audit, 'label')).toEqual(
      expect.arrayContaining(['Where the legitimate interests assessment is kept', 'How long it’s kept']),
    )
    expect(textsOf(audit, 'label')).not.toContain('Opt-out window (days)')
    // Eight providers to choose from, none of the AI layer's; every control's text at 16 px.
    expect(tags(audit, 'input').filter(input => input.get('type') === 'checkbox')).toHaveLength(8)
    for (const control of [...tags(audit, 'textarea'), ...tags(audit, 'select')]) {
      expect(control.get('class')).toMatch(/\btext-base\b/)
    }
    // A complete entry: Save acts, and nothing is listed as blocking it.
    expect(buttons(audit).find(button => button.name === 'Save')).toMatchObject({ held: false, type: 'submit' })
    expect(audit).not.toContain(DPO.beforeSaving)
  })

  it('DPP-05 PD-05 PD-12: the transfer dialog of a cleared provider offers Save and keep cleared as its submit and a plain Save beside it; of one not cleared, Save alone, with what is still needed before clearing', () => {
    const twilio = transfer('twilio')
    const cleared = alone(<TransferDialog row={twilio} today={TODAY} onClose={() => {}} />)
    expect(buttons(cleared).filter(button => button.name !== 'Close')).toEqual([
      { name: 'Cancel', held: false, type: 'button' },
      { name: 'Save', held: false, type: 'button' },
      { name: 'Save and keep cleared', held: false, type: 'submit' },
    ])
    expect(cleared).toContain(TRANSFERS_COPY.nothingNeeded)
    expect(textsOf(cleared, 'label')).toEqual(
      expect.arrayContaining(['Countries it processes the data in', 'Review by']),
    )
    // The countries' names show as the field's hint.
    expect(cleared).toContain('Ireland, United States')

    const apple = transfer('apple_push')
    const empty = alone(<TransferDialog row={apple} today={TODAY} onClose={() => {}} />)
    expect(
      buttons(empty)
        .filter(button => button.name !== 'Close')
        .map(button => [button.name, button.type]),
    ).toEqual([
      ['Cancel', 'button'],
      ['Save', 'submit'],
    ])
    expect(empty).toContain(TRANSFERS_COPY.stillNeeded)
    expect(textsOf(empty, 'li')).toEqual(expect.arrayContaining(['What it’s used for', 'A review date']))
    for (const markup of [cleared, empty]) {
      expect(readable(markup).filter(text => aiCopyIn(text) !== undefined)).toEqual([])
    }
  })

  it('DPP-05 T22 item 3: the confirmations say what clearing records and what withdrawing stops, for Twilio Verify every sign-in code', () => {
    const twilio = transfer('twilio')
    const withdraw = alone(<WithdrawDialog row={twilio} today={TODAY} onClose={() => {}} />)
    expect(textsOf(withdraw, 'h2')).toEqual(['Withdraw Twilio Verify’s clearance?'])
    expect(withdraw).toContain('Nobody can get a sign-in code')
    expect(buttons(withdraw).map(button => button.name)).toEqual(['Close', 'Cancel', 'Withdraw clearance'])

    const aws = transfer('aws')
    const clear = alone(<ClearDialog row={aws} today={TODAY} onClose={() => {}} />)
    expect(textsOf(clear, 'h2')).toEqual(['Clear Amazon Web Services for use?'])
    expect(textsOf(clear, 'p')).toEqual([TRANSFERS_COPY.confirmClear.body, PROVIDER_CHECKS.aws.checkedBy])
  })

  it('DPP-05 PD-20 PD-30: a refused read shows the PIN step (a current-password PIN field, paste allowed), a new sign-in, or the DPO-only line', () => {
    const pin = alone(<ReadRefusal refusal={{ kind: 'pin' }} retry={() => {}} />)
    const field = tags(pin, 'input').find(input => input.get('name') === 'pin')
    expect(field?.get('autoComplete')).toBe('current-password')
    expect(field?.get('inputMode')).toBe('numeric')
    expect(textsOf(pin, 'label')).toEqual(['Your PIN'])
    expect(readable(pin)).toEqual(expect.arrayContaining([REAUTH_METHOD_MESSAGES.pin.method]))
    expect(buttons(pin).find(button => button.name === 'Confirm')).toMatchObject({ type: 'submit', held: false })

    const signIn = alone(<ReadRefusal refusal={{ kind: 'sign_in', text: 'Sign in again.' }} retry={() => {}} />)
    expect(buttons(signIn).map(button => button.name)).toEqual(['Sign out'])

    const forbidden = alone(<ReadRefusal refusal={{ kind: 'forbidden', text: DPO.forbidden }} retry={() => {}} />)
    expect(textsOf(forbidden, 'h2')).toEqual(['This page is for the Data Protection Officer.'])
  })
})

// The Data protection links' targets, with which is current.
const registerLinks = (markup: string) => {
  const start = markup.indexOf('<nav aria-label="Data protection"')
  const nav = markup.slice(start, markup.indexOf('</nav>', start))
  return [...nav.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)].map(match => ({
    href: match[1]?.match(/href="([^"]*)"/)?.[1],
    current: match[1]?.match(/aria-current="([^"]*)"/)?.[1],
    text: decoded(
      (match[2] ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    ),
  }))
}

describe('C0.9 PD-48 B-12: the Notice tab and the register pages’ notice markers (dpo/)', () => {
  it('NTW-09 PD-48 PDPA-03: /dpo/notice is the shell’s page titled Publish the notice (not /notice’s title) under the Data protection links (Notice current): the published version with its status and a count of acknowledgements, what the next version changes and warns of, Publish acting, the words under h3s as text, and the versions published', async () => {
    const markup = await appAt('/dpo/notice', REGISTERS, noticeAdminForClient())
    expect(textsOf(markup, 'h1')).toEqual(['Publish the notice'])
    expect(SHELL.dpo.notice).not.toBe(SHELL.notice)
    expect(registerLinks(markup)).toEqual([
      { href: '/dpo/requests', current: undefined, text: 'Requests' },
      { href: '/dpo/purposes', current: undefined, text: 'Purposes' },
      { href: '/dpo/transfers', current: undefined, text: 'Transfers' },
      { href: '/dpo/contact', current: undefined, text: 'Contact' },
      { href: '/dpo/notice', current: 'page', text: 'Notice' },
    ])
    expect(textsOf(markup, 'h2')).toEqual([
      'The published notice',
      'Publishing version 1',
      'Preview of version 1',
      'Published versions',
    ])
    const text = readable(markup)
    expect(text).toEqual(
      expect.arrayContaining([
        'Out of date',
        'Version 0, published Wed 21 Oct 2026 by Ashton Teo.',
        '9 of the 12 people at the organisation have acknowledged version 0.',
        NOTICE_TAB.draft.changes,
        'Backups',
        NOTICE_TAB.draft.warnings,
      ]),
    )
    expect(buttons(markup).find(button => button.name === 'Publish version 1')).toMatchObject({ held: false })
    // Beside the count, once a version is published (C0.9 OD-19).
    expect(buttons(markup).find(button => button.name === RECORD.open)).toMatchObject({ held: false, type: 'button' })
    // The words, drawn by /notice's reader one level down, as text: no markup of their own.
    expect(textsOf(markup, 'h3')).toEqual(['About this notice', 'Why your data is processed', 'Your rights'])
    expect(textsOf(markup, 'h4')).toEqual(['Accounts and sign-in'])
    expect(tags(markup, 'section').some(section => section.get('aria-label') === NOTICE_TAB.preview.label('1'))).toBe(
      true,
    )
    expect(text.filter(line => aiCopyIn(line) !== undefined)).toEqual([])
  })

  it('NTW-09 PD-37 C-05: with problems, the tab lists them under their purposes with a link to each register page that fixes them, holds Publish with the reason, and shows no words', async () => {
    const answer = noticeAdminForClient({
      draft: {
        version: 1,
        body: null,
        digest: null,
        problems: [
          { code: 'purpose_basis_missing', purpose: 'backups' },
          { code: 'free_text_ai_copy', provider: 'twilio', field: 'onward_recipients' },
        ],
        warnings: [],
        changes: null,
        upToDate: false,
      },
    })
    const markup = await appAt('/dpo/notice', REGISTERS, answer)
    expect(readable(markup)).toEqual(
      expect.arrayContaining([
        NOTICE_TAB.draft.problems,
        'Backups',
        'Record its legal basis.',
        'Twilio Verify',
        '“Who it passes the data on to” uses wording Hearth keeps off its screens. Reword it.',
        NOTICE_TAB.preview.hidden,
      ]),
    )
    const fixes = [...markup.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)]
      .filter(match => /Open the/.test(match[2] ?? ''))
      .map(match => [match[1]?.match(/href="([^"]*)"/)?.[1], decoded(match[2] ?? '')])
    expect(fixes).toEqual([
      ['/dpo/purposes', NOTICE_TAB.draft.toPurposes],
      ['/dpo/transfers', NOTICE_TAB.draft.toTransfers],
    ])
    expect(buttons(markup).find(button => button.name === 'Publish version 1')).toMatchObject({ held: true })
    expect(markup).toContain(DPO.fixFirst)
    expect(textsOf(markup, 'h3')).toEqual([])
    expect(readable(markup).filter(line => aiCopyIn(line) !== undefined)).toEqual([])
  })

  it('NTW-09 T21 item 5: before the answer, the Notice tab says it is loading, in a status, under the Data protection links', async () => {
    const markup = await appAt('/dpo/notice', null)
    expect(markup).toMatch(/<p role="status"[^>]*>Loading the notice…<\/p>/)
    expect(registerLinks(markup).map(link => link.href)).toEqual([
      '/dpo/requests',
      '/dpo/purposes',
      '/dpo/transfers',
      '/dpo/contact',
      '/dpo/notice',
    ])
    expect(textsOf(markup, 'h2')).toEqual([])
  })

  it('NTW-09 PD-40 PD-41 PD-48 PD-59 PD-61 B-04 B-12: the register pages badge the Notice link while the notice is out of date, show the banner (a stale pinned purpose listed by name), and mark the cards that wait for the next notice', async () => {
    const CLEARED = {
      clearedOn: '2026-10-02',
      clearedBy: 'Ashton Teo',
      clearedVia: 'app',
      revision: 2,
      withdrawnOn: null,
      withdrawnBy: null,
      withdrawReason: null,
    } as const
    const registers = registersForClient(
      { accounts: { version: 2, stale: true }, service_operation: { notified: true }, backups: { notified: true } },
      { twilio: { ...COMPLETE_FACTS, revision: 2, clearance: CLEARED, sendsWait: true } },
      'out_of_date',
    )
    const purposes = await appAt('/dpo/purposes', registers)
    expect(registerLinks(purposes).at(-1)).toEqual({
      href: '/dpo/notice',
      current: undefined,
      text: 'Notice Out of date',
    })
    expect(readable(purposes)).toEqual(
      expect.arrayContaining([
        NOTICE_MARKERS.banner.stale,
        'Accounts and sign-in: the roster, phone numbers and one-time codes, devices, profiles',
        NOTICE_MARKERS.banner.toNotice,
        NOTICE_MARKERS.pinnedStale,
      ]),
    )
    // security_audit and, from C0.9 PR 3b, request_handling are active, not pinned and not notified;
    // backups is notified.
    expect(purposes.split(NOTICE_MARKERS.waitingForNotice).length - 1).toBe(2)
    expect(textsOf(purposes, 'h2')).toHaveLength(14)

    const transfers = await appAt('/dpo/transfers', registers)
    expect(registerLinks(transfers).at(-1)?.text).toBe('Notice Out of date')
    expect(transfers.split(NOTICE_MARKERS.sendsWaitTwilio).length - 1).toBe(1)
    expect(transfers).not.toContain(NOTICE_MARKERS.sendsWait)

    // Up to date: no badge and no banner.
    const upToDate = await appAt('/dpo/purposes', registersForClient({}, {}, 'up_to_date'))
    expect(registerLinks(upToDate).at(-1)?.text).toBe('Notice')
    expect(upToDate).not.toContain(NOTICE_MARKERS.banner.toNotice)
    for (const markup of [purposes, transfers, upToDate]) {
      expect(readable(markup).filter(line => aiCopyIn(line) !== undefined)).toEqual([])
    }
  })
})

// The attributes of the control a label names (its for= id), with the label's text.
function controlOf(markup: string, label: string): Map<string, string> | undefined {
  const match = [...markup.matchAll(/<label\b[^>]*for="([^"]*)"[^>]*>(.*?)<\/label>/gs)].find(
    each => decoded((each[2] ?? '').replace(/<[^>]+>/g, '')) === label,
  )
  const id = match?.[1]
  if (id === undefined) return undefined
  return [...tags(markup, 'input'), ...tags(markup, 'textarea'), ...tags(markup, 'select')].find(
    control => control.get('id') === id,
  )
}

// The text of the elements an aria-describedby names, in order.
const describedBy = (markup: string, control: Map<string, string> | undefined) =>
  (control?.get('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map(id => {
      const at = markup.indexOf(`id="${id}"`)
      const start = markup.indexOf('>', at) + 1
      return decoded(markup.slice(start, markup.indexOf('</', start)).replace(/<[^>]+>/g, ''))
    })

// How deep forms nest in the markup: 1 when none sits inside another.
function formDepth(markup: string): number {
  let depth = 0
  let deepest = 0
  for (const match of markup.matchAll(/<(\/?)form\b/g)) {
    depth += match[1] === '/' ? -1 : 1
    deepest = Math.max(deepest, depth)
  }
  return deepest
}

describe('C0.9 PD-70 OD-19: the contact page and recording an acknowledgement (dpo/)', () => {
  it('DPP-05 PDPA-13 OD-10 PD-70: /dpo/contact is the shell’s page titled Contact details under the four links (Contact current, the Notice link badged), saying what the contact is for; with none recorded it says publishing waits for it and offers Record contact details', async () => {
    const markup = await appAt('/dpo/contact', REGISTERS, undefined, { contact: contactAdminForClient() })
    expect(textsOf(markup, 'h1')).toEqual(['Contact details'])
    expect(registerLinks(markup)).toEqual([
      { href: '/dpo/requests', current: undefined, text: 'Requests' },
      { href: '/dpo/purposes', current: undefined, text: 'Purposes' },
      { href: '/dpo/transfers', current: undefined, text: 'Transfers' },
      { href: '/dpo/contact', current: 'page', text: 'Contact' },
      { href: '/dpo/notice', current: undefined, text: 'Notice Not published' },
    ])
    // Each link a 44 px target, in a track that wraps at 320 px.
    expect(markup).toMatch(/<div class="inline-flex max-w-full flex-wrap/)
    expect(
      tags(markup, 'a')
        .filter(link => link.get('href')?.startsWith('/dpo/'))
        .every(link => /min-h-11 min-w-11/.test(link.get('class') ?? '')),
    ).toBe(true)
    // The reply targets' card below it says to record the contact first, and offers no change (C0.9
    // PR 3b, PD-94).
    expect(textsOf(markup, 'h2')).toEqual([CONTACT.none.title, CONTACT.targets.title])
    expect(readable(markup)).toEqual(
      expect.arrayContaining([CONTACT.intro, CONTACT.none.body, CONTACT.targets.firstContact]),
    )
    expect(buttons(markup).map(button => button.name)).not.toContain(CONTACT.targets.edit)
    expect(buttons(markup).find(button => button.name === CONTACT.none.record)).toMatchObject({ held: false })
    expect(readable(markup).filter(text => aiCopyIn(text) !== undefined)).toEqual([])

    const loading = await appAt('/dpo/contact')
    expect(loading).toMatch(/<p role="status"[^>]*>Loading your contact details…<\/p>/)
  })

  it('DPP-05 PD-70 OD-11: with a contact, its card is headed by the role title, says in a pill whether the published notice gives it (with why and a link to the Notice tab when it doesn’t), lists its facts and offers Edit contact details', async () => {
    for (const [stated, pill, line] of [
      ['stated', CONTACT.stated.yes, undefined],
      ['not_printed', CONTACT.stated.no, CONTACT.stated.notPrintedLine],
      ['not_stated', CONTACT.stated.no, CONTACT.stated.noLine],
      ['unpublished', CONTACT.stated.none, undefined],
    ] as const) {
      const answer = contactAdminForClient({
        notice: stated === 'unpublished' ? 'none' : 'out_of_date',
        contact: contactRow(),
        stated,
      })
      const page = await appAt('/dpo/contact', REGISTERS, undefined, { contact: answer })
      expect(textsOf(page, 'h2'), stated).toEqual(['Data Protection Officer', CONTACT.targets.title])
      // The contact's card, up to the reply targets' (C0.9 PR 3b).
      const markup = page.slice(0, page.indexOf(CONTACT.targets.title))
      const text = readable(markup)
      expect(text, stated).toEqual(
        expect.arrayContaining([
          pill,
          'Email address',
          'dpo@tembusu.example',
          'Recorded',
          'Tue 20 Oct 2026 by Ashton Teo',
        ]),
      )
      const toNotice = [...markup.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)].filter(match => match[2] === CONTACT.toNotice)
      expect(toNotice.length, stated).toBe(line === undefined ? 0 : 1)
      if (line !== undefined) {
        expect(text, stated).toContain(line)
        expect(toNotice[0]?.[1], stated).toMatch(/href="\/dpo\/notice"/)
      }
      expect(
        buttons(markup).find(button => button.name === CONTACT.edit),
        stated,
      ).toMatchObject({ held: false })
      // The postal address keeps its lines.
      expect(markup, stated).toMatch(/whitespace-pre-line[^>]*>1 Example Road\nSingapore 000000</)
      expect(text.filter(each => aiCopyIn(each) !== undefined)).toEqual([])
    }
  })

  it('DPP-05 PD-64 PD-70 OD-10 KM-14: the dialog asks for a role title (filled in), then at least one channel: an email address and a phone number with their own types and keyboards, a postal address of three lines; no field lets the browser fill it, each is 16 px with its hint linked; what holds Save back is listed and its field marked; once a version is published it says the notice goes out of date', () => {
    const markup = alone(<ContactDialog answer={contactAdminForClient()} onClose={() => {}} />)
    expect(textsOf(markup, 'h2')).toEqual([CONTACT.dialog.recordTitle])
    expect(readable(markup)).toEqual(expect.arrayContaining([CONTACT.advice, CONTACT.dialog.channels]))
    expect(tags(markup, 'form')[0]?.has('noValidate')).toBe(true)
    const title = controlOf(markup, 'Role title')
    const email = controlOf(markup, 'Email address')
    const phone = controlOf(markup, 'Phone')
    const postal = controlOf(markup, 'Postal address')
    expect([title, email, phone].map(control => [control?.get('type'), control?.get('inputMode')])).toEqual([
      ['text', undefined],
      ['email', 'email'],
      ['tel', 'tel'],
    ])
    expect(title?.get('value')).toBe('Data Protection Officer')
    expect([title, email, phone, postal].map(control => control?.get('maxLength'))).toEqual(['120', '254', '30', '500'])
    expect(postal?.get('rows')).toBe('3')
    for (const control of [title, email, phone, postal]) {
      expect(control?.get('autoComplete')).toBe('off')
      expect(control?.get('class')).toMatch(/\btext-base\b/)
      expect(control?.get('class')).toMatch(/\bmin-h-11\b/)
    }
    expect(describedBy(markup, email)).toEqual([CONTACT.dialog.emailHint])
    expect(describedBy(markup, phone)).toEqual([CONTACT.dialog.phoneHint])
    // The three channels are one group whose legend says any one will do (WCAG 1.3.1, 3.3.2); the
    // role title isn't in it, and the line saying none is given yet describes the group.
    const group = markup.slice(markup.indexOf('<fieldset'), markup.indexOf('</fieldset>'))
    expect(decoded(group)).toContain(`>${CONTACT.dialog.channels}</legend>`)
    for (const control of [email, phone, postal]) expect(group).toContain(`id="${control?.get('id')}"`)
    expect(group).not.toContain(`id="${title?.get('id')}"`)
    expect(describedBy(markup, tags(markup, 'fieldset')[0])).toEqual([
      'Give an email address, a phone number or a postal address.',
    ])
    // No channel yet: listed with no field marked, and Save held.
    expect(readable(markup)).toEqual(
      expect.arrayContaining([DPO.beforeSaving, 'Give an email address, a phone number or a postal address.']),
    )
    expect([title, email, phone, postal].some(control => control?.has('aria-invalid'))).toBe(false)
    expect(buttons(markup).find(button => button.name === 'Save')).toMatchObject({ held: true, type: 'submit' })
    expect(markup).not.toContain(CONTACT.dialog.staleWarning)

    // A problem with a field marks it, and its line describes it after the hint: here a title
    // recorded before its wording joined AI_COPY (PD-65), whose line names the field, never the word.
    const marked = alone(
      <ContactDialog
        answer={contactAdminForClient({ contact: contactRow({ title: 'AI Data Protection Officer' }) })}
        onClose={() => {}}
      />,
    )
    const markedTitle = controlOf(marked, 'Role title')
    expect(markedTitle?.get('aria-invalid')).toBe('true')
    expect(describedBy(marked, markedTitle)).toEqual([
      CONTACT.dialog.titleHint,
      'The role title uses wording Hearth keeps off its screens. Reword it.',
    ])
    expect(controlOf(marked, 'Email address')?.has('aria-invalid')).toBe(false)
    // With a channel given, nothing describes the group.
    expect(tags(marked, 'fieldset')[0]?.has('aria-describedby')).toBe(false)

    // Once a version is published, saving makes it out of date (OD-11).
    const edit = alone(
      <ContactDialog
        answer={contactAdminForClient({
          notice: 'out_of_date',
          contact: contactRow({ email: 'dpo@tembusu.example' }),
          stated: 'stated',
        })}
        onClose={() => {}}
      />,
    )
    expect(textsOf(edit, 'h2')).toEqual([CONTACT.dialog.editTitle])
    expect(edit).toContain(CONTACT.dialog.staleWarning)
    expect(buttons(edit).find(button => button.name === 'Save')).toMatchObject({ held: false })
    expect(readable(edit).filter(text => aiCopyIn(text) !== undefined)).toEqual([])
  })

  it('NTW-11 OD-10 PD-68: with no contact recorded, the Notice tab lists it under “Your contact details” and links the contact page', async () => {
    const markup = await appAt('/dpo/notice', REGISTERS, noticeAdminForClient({ draft: NO_CONTACT_DRAFT }))
    expect(readable(markup)).toEqual(
      expect.arrayContaining([
        NOTICE_TAB.draft.contactSubject,
        'Record your contact details, so the notice can say how to reach you.',
        NOTICE_TAB.preview.hidden,
      ]),
    )
    const fixes = [...markup.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)]
      .filter(match => /Open your/.test(match[2] ?? ''))
      .map(match => [match[1]?.match(/href="([^"]*)"/)?.[1], decoded(match[2] ?? '')])
    expect(fixes).toEqual([['/dpo/contact', NOTICE_TAB.draft.toContact]])
  })

  it('NTW-12 OD-19 PD-76: the record dialog reads the people as it opens: loading, a failed read with Try again, nobody else at the organisation, or the form', () => {
    const loading = alone(<RecordDialog version="0" onClose={() => {}} />)
    expect(textsOf(loading, 'h2')).toEqual(['Record an acknowledgement of version 0'])
    expect(loading).toMatch(/<p role="status"[^>]*>Loading the people at the organisation…<\/p>/)
    expect(readable(loading)).toContain(RECORD.intro)
    expect(buttons(loading).map(button => button.name)).toEqual(['Close', 'Cancel'])

    const failed = alone(<RecordDialog version="0" onClose={() => {}} />, {
      peopleFailed: new ApiFailure(500, 'internal', MESSAGES.internal),
    })
    expect(readable(failed)).toContain(MESSAGES.internal)
    expect(buttons(failed).map(button => button.name)).toEqual(['Close', DPO.retry, 'Cancel'])

    const nobody = alone(<RecordDialog version="0" onClose={() => {}} />, {
      people: noticePeopleForClient({ people: [] }),
    })
    expect(readable(nobody)).toContain(RECORD.nobody)
    expect(tags(nobody, 'form')).toEqual([])
    expect(buttons(nobody).map(button => button.name)).toEqual(['Close', 'Cancel'])
  })

  it('NTW-12 OD-19 PD-75 PD-76: the form picks who (Choose someone first, names with departments, no numbers), the day between the version’s publication and today, and how, each labelled with its hint; Record is held until nothing is missing, and a cut list says so', () => {
    const markup = alone(<RecordDialog version="0" onClose={() => {}} />, { people: noticePeopleForClient() })
    expect(tags(markup, 'form')[0]?.has('noValidate')).toBe(true)
    expect(textsOf(markup, 'label')).toEqual([RECORD.person, RECORD.day, RECORD.how])
    expect(optionsOf(markup, 'person')).toEqual([
      'Choose someone',
      'Ahmad Rahman (Commercial)',
      'Kelvin Tan',
      'Marcus Ong (Operations)',
      'Priya Nair (Operations)',
      'Rachel Goh (Commercial)',
    ])
    // No number is shown (PD-76).
    expect(readable(markup).filter(text => /\+\d|\d{8}/.test(text))).toEqual([])
    const day = controlOf(markup, RECORD.day)
    expect([day?.get('type'), day?.get('min'), day?.get('max')]).toEqual(['date', '2026-10-21', TODAY])
    expect(describedBy(markup, day)).toEqual(['From Wed 21 Oct 2026 to Thu 22 Oct 2026.'])
    const how = controlOf(markup, RECORD.how)
    expect([how?.get('type'), how?.get('maxLength'), how?.get('autoComplete')]).toEqual(['text', '500', 'off'])
    expect(describedBy(markup, how)).toEqual([RECORD.howHint])
    for (const control of [controlOf(markup, RECORD.person), day, how]) {
      expect(control?.get('class')).toMatch(/\btext-base\b/)
    }
    expect(readable(markup)).toEqual(
      expect.arrayContaining([RECORD.beforeRecording, RECORD.problems.person_missing, RECORD.problems.note_missing]),
    )
    expect(markup).not.toContain(RECORD.more)
    expect(markup).not.toContain(RECORD.sameDetails)
    expect(buttons(markup).find(button => button.name === RECORD.record)).toMatchObject({ held: true, type: 'submit' })
    expect(readable(markup).filter(text => aiCopyIn(text) !== undefined)).toEqual([])

    expect(controlOf(markup, RECORD.person)?.has('aria-describedby')).toBe(false)

    // A cut list says so, and the line describes the person field, so it is heard on the field.
    const cut = alone(<RecordDialog version="0" onClose={() => {}} />, {
      people: noticePeopleForClient({ more: true }),
    })
    expect(readable(cut)).toContain(RECORD.more)
    expect(describedBy(cut, controlOf(cut, RECORD.person))).toEqual([RECORD.more])
  })
})

// The DPO's queue at /dpo/requests (C0.9 PR 3b), in the app over a router: Ashton's session with its
// count of requests needing attention, his standing with the notice, and the queue's answer (or its
// refusal) in his Query cache. Every fetch is recorded, so a case where nothing may be read proves it.
interface QueueCase {
  readonly standing?: 'acknowledged' | 'unpublished' | 'required'
  readonly requests?: number | null
  readonly queue?: ReturnType<typeof queueForClient>
  readonly queueFailed?: ApiFailure
}

async function queueAt(path: string, options: QueueCase = {}): Promise<{ markup: string; fetched: string[] }> {
  const session = runtime(REGISTERS)
  const person = { ...ASHTON, notice: options.standing ?? ASHTON.notice, requests: options.requests ?? null }
  session.queryClient.setQueryData(['session'], person)
  const noop = () => {}
  const withStanding = {
    ...session,
    info: person,
    notice: createNoticeStore({
      initial: options.standing ?? 'acknowledged',
      live: { start: noop, resume: noop },
      refetchAll: noop,
      resetNotice: noop,
      fetchNotice: noop,
      refreshNotice: noop,
      post: noop,
    }),
  } as SessionRuntime
  if (options.queue !== undefined) withStanding.queryClient.setQueryData(requestQueueQuery.queryKey, options.queue)
  if (options.queueFailed !== undefined) {
    withStanding.queryClient.setQueryDefaults(requestQueueQuery.queryKey, { retryOnMount: false })
    withStanding.queryClient
      .getQueryCache()
      .build(withStanding.queryClient, { queryKey: requestQueueQuery.queryKey })
      .setState({ status: 'error', error: options.queueFailed, fetchStatus: 'idle' })
  }
  const fetched: string[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    fetched.push(String(url))
    throw new TypeError('no network in markup tests')
  }) as typeof fetch
  try {
    const router = createAppRouter(
      { runtime: withStanding, storage: undefined },
      createMemoryHistory({ initialEntries: [path] }),
    )
    await router.load()
    const markup = renderToStaticMarkup(<App router={router} runtime={withStanding} />).replace(
      /<script\b.*?<\/script>/gs,
      '',
    )
    return { markup, fetched }
  } finally {
    globalThis.fetch = realFetch
  }
}

// A piece of the queue rendered on its own, with these answers in the cache.
function aloneWith(node: ReactNode, seed: (client: SessionRuntime['queryClient']) => void): string {
  const session = runtime(REGISTERS)
  seed(session.queryClient)
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ['/'] }) })
  return renderToStaticMarkup(
    <QueryClientProvider client={session.queryClient}>
      <RuntimeContext value={session}>
        <RouterContextProvider router={router}>{node}</RouterContextProvider>
      </RuntimeContext>
    </QueryClientProvider>,
  )
}

// The Requests link's accessible name and badge, and the track's links.
const requestsLink = (markup: string) => {
  const start = markup.indexOf('<nav aria-label="Data protection"')
  const nav = markup.slice(start, markup.indexOf('</nav>', start))
  return nav.match(/<a\b[^>]*href="\/dpo\/requests"[^>]*>.*?<\/a>/s)?.[0] ?? ''
}

describe('C0.9 PR 3b: the requests to the DPO (dpo/)', () => {
  it('DPP-05 PD-98 PD-99 PPL-06 PPL-12: every DPO page’s track is "Data protection" with Requests first; with a count, the Requests link carries it as a pill hidden from assistive technology and says it in words in its name; with none, or 0, nothing', async () => {
    for (const path of ['/dpo/purposes', '/dpo/contact']) {
      const { markup } = await queueAt(path, { requests: 2 })
      const link = requestsLink(markup)
      expect(link, path).toMatch(/aria-label="Requests, 2 need attention"/)
      expect(link, path).toMatch(/<span aria-hidden="true" class="inline-flex h-5 min-w-5[^"]*">2<\/span>/)
      expect(registerLinks(markup)[0], path).toMatchObject({ href: '/dpo/requests', text: 'Requests 2' })
    }
    for (const requests of [0, null]) {
      const { markup } = await queueAt('/dpo/purposes', { requests })
      const link = requestsLink(markup)
      expect(link, String(requests)).not.toMatch(/aria-label=/)
      expect(registerLinks(markup)[0]?.text, String(requests)).toBe('Requests')
    }
    const many = await queueAt('/dpo/purposes', { requests: 140 })
    expect(registerLinks(many.markup)[0]?.text).toBe('Requests 99+')
  })

  it('RQW-11 PPL-02: before the notice is published (or while an acknowledgement is owed) /dpo/requests says the requests open once it is, with links to the processing register, the contact details and the Notice tab, and reads nothing', async () => {
    for (const standing of ['unpublished'] as const) {
      const { markup, fetched } = await queueAt('/dpo/requests', { standing })
      expect(textsOf(markup, 'h1')).toEqual(['Requests'])
      expect(readable(markup)).toContain(REQUESTS_COPY.noticeFirst)
      // The note's links, after the track's.
      const links = [...markup.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)]
        .map(match => [match[1]?.match(/href="([^"]*)"/)?.[1], decoded(match[2] ?? '')] as const)
        .filter(([, text]) => text.startsWith('Open'))
      expect(links).toEqual([
        ['/dpo/purposes', REQUESTS_COPY.toPurposes],
        ['/dpo/contact', REQUESTS_COPY.toContact],
        ['/dpo/notice', REQUESTS_COPY.toNotice],
      ])
      expect(markup).not.toContain(REQUESTS_COPY.loading)
      expect(fetched.filter(url => url.startsWith('/api/admin/requests'))).toEqual([])
    }
    const note = aloneWith(<NoticeFirst />, () => {})
    expect(readable(note)).toContain(REQUESTS_COPY.noticeFirst)
  })

  it('DPP-05 PD-98 PD-112: /dpo/requests is titled Requests (Requests current): Log a request, the open cards soonest due first with the total in the heading, each a whole-card button with its kind, reference spelled out, requester, how it came, received and due words (an icon beside overdue), and the closed ones under a disclosure', async () => {
    const { markup } = await queueAt('/dpo/requests', { queue: queueForClient() })
    expect(textsOf(markup, 'h1')).toEqual(['Requests'])
    expect(registerLinks(markup)[0]).toMatchObject({ href: '/dpo/requests', current: 'page' })
    expect(textsOf(markup, 'h2')).toEqual(['Open requests (2)', 'Closed requests'])
    const all = buttons(markup)
    expect(all[0]?.name.includes('Log a request') || all.some(button => button.name === 'Log a request')).toBe(true)
    const cardMatches = [
      ...markup.matchAll(
        /<button type="button" id="([^"]*)" class="flex min-h-11 w-full flex-col[^"]*">(.*?)<\/button>/gs,
      ),
    ]
    const cards = cardMatches.map(match => readable(match[2] ?? ''))
    // Each card is found by its case's id once its sheet closes, and the open requests' heading takes
    // focus when the card can't (a step closed the case and its card moved out of sight; 4.5).
    expect(cardMatches.map(match => match[1])).toEqual([
      `case-${CASE_IDS.copy}`,
      `case-${CASE_IDS.complaint}`,
      `case-${CASE_IDS.closed}`,
    ])
    expect(markup).toMatch(/<h2 id="[^"]*" tabindex="-1" class="[^"]*">Open requests \(2\)<\/h2>/)
    expect(cards[0]).toEqual([
      'Copy of their data',
      'In progress',
      'BC2D-FG3H',
      'Reference B C 2 D, F G 3 H',
      '· By email',
      'Lee Example · No Hearth account',
      'Received Thu 1 Oct 2026',
      'Overdue since Sat 31 Oct 2026',
    ])
    expect(cards[1]).toEqual([
      'Complaint',
      'New',
      'K7QM-X3TD',
      'Reference K 7 Q M, X 3 T D',
      '· Sent in Hearth',
      'Marcus Ong, Operations',
      'Received Thu 29 Oct 2026',
      'Due Sat 14 Nov 2026',
    ])
    // The closed list sits under its disclosure, hidden until opened.
    expect(markup).toMatch(/aria-expanded="false"[^>]*>.*?Show closed requests/s)
    expect(markup).toMatch(/<div id="[^"]*" hidden="" class="flex flex-col gap-3">/)
    expect(readable(markup)).toEqual(expect.arrayContaining(['Closed Fri 9 Oct 2026 · Answered', ' · Has left'.trim()]))
    expect(readable(markup).filter(text => aiCopyIn(text) !== undefined)).toEqual([])
  })

  it('RQW-07 PD-98: never “No open requests.” when the list couldn’t be read; the cut and empty states; a refused read: the PIN step, forbidden (no links), notice_required as the note', async () => {
    const empty = aloneWith(
      <QueueContent
        answer={queueForClient({ open: [], openTotal: 0, closed: [], closedMore: false })}
        onOpen={() => {}}
        onLog={() => {}}
      />,
      () => {},
    )
    expect(readable(empty)).toEqual(expect.arrayContaining([REQUESTS_COPY.empty, REQUESTS_COPY.emptyClosed]))
    const unreadable = aloneWith(
      <QueueContent
        answer={{ ...queueForClient(), open: { rows: [], complete: false }, openTotal: null }}
        onOpen={() => {}}
        onLog={() => {}}
      />,
      () => {},
    )
    expect(readable(unreadable)).toContain(REQUESTS_COPY.incomplete)
    expect(readable(unreadable)).not.toContain(REQUESTS_COPY.empty)
    const pin = await queueAt('/dpo/requests', {
      queueFailed: new ApiFailure(403, 'reauth_required', 'Enter your PIN.', { method: 'pin' }),
    })
    expect(
      tags(pin.markup, 'input')
        .find(input => input.get('name') === 'pin')
        ?.get('autoComplete'),
    ).toBe('current-password')
    const forbidden = await queueAt('/dpo/requests', { queueFailed: new ApiFailure(403, 'forbidden', 'No') })
    expect(textsOf(forbidden.markup, 'h2')).toEqual(['This page is for the Data Protection Officer.'])
    expect(forbidden.markup).not.toContain('<nav aria-label="Data protection"')
    const notice = await queueAt('/dpo/requests', {
      queueFailed: new ApiFailure(403, 'notice_required', MESSAGES.notice_required),
    })
    expect(readable(notice.markup)).toContain(REQUESTS_COPY.noticeFirst)
  })

  it('PD-98 PPL-01 PPL-07 Rule 8: the case sheet is a whole-screen dialog with the kind and reference as its title (focused as it opens): who sent it with their manager, the person id for a break-glass citation, the facts, what they wrote as quoted text in its own direction, the steps, their other requests as buttons, and Add a step with only the steps the case allows', () => {
    const markup = aloneWith(<CaseSheet id={CASE_IDS.complaint} onClose={() => {}} onOpen={() => {}} />, client =>
      client.setQueryData(caseQuery(CASE_IDS.complaint).queryKey, caseForClient()),
    )
    expect(textsOf(markup, 'h2')).toEqual(['Complaint · K7QM-X3TD'])
    expect(markup).toMatch(/<h2 id="[^"]*" tabindex="-1"/)
    expect(tags(markup, 'dialog')[0]?.get('class')).toMatch(/\bh-dvh\b.*\bmd:max-w-3xl\b/)
    const text = readable(markup)
    expect(text).toEqual(
      expect.arrayContaining([
        'New',
        'From',
        'Marcus Ong, Operations',
        'Reports to Priya Nair',
        CASE_COPY.requester.personId,
        MARCUS_ID,
        'Sent in Hearth',
        'Thu 29 Oct 2026',
        'Due Sat 14 Nov 2026',
        'Not checked yet',
        'What they wrote',
        'No steps yet.',
        'Their other requests',
        'Add a step',
      ]),
    )
    // What they wrote: quoted text in its own direction, never markup or a link.
    expect(markup).toMatch(
      /<blockquote dir="auto" class="whitespace-pre-wrap[^"]*">The shift rota with my home address was posted in the wrong group.\nPlease take it down.<\/blockquote>/,
    )
    expect(markup).not.toMatch(/<a\b/)
    // The person id, copyable.
    expect(markup).toMatch(new RegExp(`select-all">${MARCUS_ID}</dd>`))
    // Their other request opens in this sheet.
    expect(buttons(markup).map(button => button.name)).toEqual(
      expect.arrayContaining([
        'Question · ClosedMNP4-QRS5Reference M N P 4, Q R S 5 · Received Mon 5 Oct 2026 · Closed Fri 9 Oct 2026 · Answered',
      ]),
    )
    expect(optionsOf(markup, 'step')).toEqual([
      'Choose',
      'Told them it was received',
      'Checked who they are',
      'Replied',
      'Changed the kind',
      'Note',
      'Close the request',
    ])
    expect(buttons(markup).find(button => button.name === 'Save')).toMatchObject({ held: true, type: 'submit' })
    expect(text.filter(line => aiCopyIn(line) !== undefined)).toEqual([])
  })

  it('PPL-01 PD-105: a leaver’s case shows the channel the case records as plain text in its own direction; someone without an account their name and channel; a withdrawal its reply to copy; a just-logged request its reference until the sheet closes', () => {
    const leaver = aloneWith(<CaseSheet id={CASE_IDS.complaint} onClose={() => {}} onOpen={() => {}} />, client =>
      client.setQueryData(
        caseQuery(CASE_IDS.complaint).queryKey,
        caseForClient({
          case: {
            kind: 'withdrawal',
            receivedKind: 'withdrawal',
            cameBy: 'email',
            loggedBy: 'Ashton Teo',
            requester: {
              type: 'person',
              person: LEAVER_ID,
              name: 'Siti Aminah',
              department: 'Commercial',
              manager: null,
              leftOn: '2026-11-02',
              channel: 'email',
              contact: 'siti@mail.example',
            },
          },
          others: [],
          reply: 'Your reference: K7QM-X3TD\n\nThank you for writing to withdraw your consent.',
        }),
      ),
    )
    const text = readable(leaver)
    expect(textsOf(leaver, 'h2')).toEqual(['Withdrawal · K7QM-X3TD'])
    expect(text).toEqual(
      expect.arrayContaining([
        'Has left on Mon 2 Nov 2026',
        CASE_COPY.requester.reach,
        'Email',
        'siti@mail.example',
        'Your summary',
        'No other requests from them.',
        CASE_COPY.reply,
        'Copy',
      ]),
    )
    expect(leaver).toMatch(/<span dir="auto" class="select-all whitespace-pre-line">siti@mail.example<\/span>/)
    expect(leaver).not.toMatch(/href="mailto:/)
    expect(leaver).toMatch(/<div dir="auto" class="whitespace-pre-wrap[^"]*">Your reference: K7QM-X3TD\n\nThank you/)
    const outside = aloneWith(
      <CaseSheet id={CASE_IDS.copy} logged={'BC2DFG3H' as never} onClose={() => {}} onOpen={() => {}} />,
      client =>
        client.setQueryData(
          caseQuery(CASE_IDS.copy).queryKey,
          caseForClient({
            case: {
              id: CASE_IDS.copy,
              reference: 'BC2DFG3H',
              kind: 'access',
              receivedKind: 'access',
              cameBy: 'letter',
              requester: {
                type: 'outside',
                name: 'Lee Example',
                channel: 'post',
                contact: '1 Example Road\nSingapore 000000',
              },
            },
            others: [],
          }),
        ),
    )
    expect(readable(outside)).toEqual(
      expect.arrayContaining([
        'Logged as BC2D-FG3H. Give them this reference when you reply.',
        'Lee Example',
        'No Hearth account',
        'Post',
      ]),
    )
    expect(readable(outside)).not.toContain('Their other requests')
    expect(readable(outside)).not.toContain(CASE_COPY.requester.personId)
    // Loading, and a case that isn't there.
    const loading = aloneWith(<CaseSheet id={CASE_IDS.closed} onClose={() => {}} onOpen={() => {}} />, () => {})
    expect(textsOf(loading, 'h2')).toEqual([CASE_COPY.sheetLoading])
    expect(loading).toMatch(/<p role="status"[^>]*>Loading the request…<\/p>/)
  })

  it('RQW-08 PD-91 PD-112 PPL-04 PPL-14: Add a step shows the fields the chosen step takes: the day it was checked and how for an identity check (one line, its hint), the day told and the new date for more time, the outcome and why for a refusal, the logged-in-error line; Save held with its reason', () => {
    const copy = caseForClient({
      case: {
        id: CASE_IDS.copy,
        reference: 'BC2DFG3H',
        kind: 'access',
        receivedKind: 'access',
        cameBy: 'email',
        loggedBy: 'Ashton Teo',
        receivedOn: '2026-10-01',
        loggedOn: '2026-10-01',
        dueOn: '2026-10-31',
        revision: 1,
        state: 'in_progress',
      },
      others: [],
    })
    const identity = aloneWith(<AddStep answer={copy} initial={{ step: 'identity_checked' }} />, () => {})
    expect(textsOf(identity, 'label')).toEqual(['What happened', CASE_COPY.identityDay, CASE_COPY.identityLabel])
    expect(readable(identity)).toEqual(expect.arrayContaining([CASE_COPY.identityHint, CASE_COPY.beforeSaving]))
    const extended = aloneWith(
      <AddStep answer={copy} initial={{ step: 'extended', onDay: '2026-11-02', extendedTo: '2026-11-20' }} />,
      () => {},
    )
    expect(textsOf(extended, 'label')).toEqual([
      'What happened',
      CASE_COPY.toldOn,
      CASE_COPY.extendedToField,
      CASE_COPY.noteOptional,
    ])
    expect(readable(extended)).toEqual(expect.arrayContaining([CASE_COPY.toldOnHint, STEP_LATE]))
    expect(buttons(extended).find(button => button.name === 'Save')?.held).toBe(true)
    const refuse = aloneWith(<AddStep answer={copy} initial={{ step: 'closed', outcome: 'refused' }} />, () => {})
    expect(textsOf(refuse, 'label')).toEqual(['What happened', CASE_COPY.outcome, CASE_COPY.day, CASE_COPY.why])
    expect(optionsOf(refuse, 'outcome')).toEqual([
      'Choose',
      'Answered',
      'Refused',
      'Withdrawn by them',
      'A duplicate',
      'Not a request',
      'Logged in error',
    ])
    const error = aloneWith(
      <AddStep answer={copy} initial={{ step: 'closed', outcome: 'logged_in_error' }} />,
      () => {},
    )
    expect(readable(error)).toContain(CASE_COPY.loggedInError)
    const replied = aloneWith(<AddStep answer={copy} initial={{ step: 'replied' }} />, () => {})
    expect(readable(replied)).toContain(CASE_COPY.repliedHint)
    expect(buttons(replied).find(button => button.name === 'Save')?.held).toBe(false)
    for (const markup of [identity, extended, refuse, error, replied]) {
      for (const control of [...tags(markup, 'textarea'), ...tags(markup, 'select'), ...tags(markup, 'input')]) {
        expect(control.get('class')).toMatch(/\btext-base\b/)
      }
    }
  })

  it('RQW-09 OD-16 PD-89 PPL-01 PPL-13 PPL-14: Log a request asks what it is about, how it came, the day received (a year back to today), who sent it (someone at the organisation from the list, or someone without an account), how to reach them and the summary; no identity field; two who read the same can’t be picked, with the line saying what to do; the people’s states', () => {
    const markup = aloneWith(<LogRequest today={CASE_TODAY} onClose={() => {}} onLogged={() => {}} />, client =>
      client.setQueryData(casePeopleQuery.queryKey, casePeopleForClient()),
    )
    expect(textsOf(markup, 'h2')).toEqual(['Log a request'])
    expect(
      textsOf(markup, 'label').filter(
        label => !['Someone at the organisation', 'Someone without a Hearth account'].includes(label),
      ),
    ).toEqual(
      expect.arrayContaining(['What it’s about', 'How it came', 'When it was received', 'Who', 'What they want']),
    )
    const received = controlOf(markup, 'When it was received')
    expect(received?.get('min')).toBe('2025-11-12')
    expect(received?.get('max')).toBe(CASE_TODAY)
    expect(received?.get('value')).toBe(CASE_TODAY)
    expect(optionsOf(markup, 'came-by')).toEqual([
      'Choose',
      'By email',
      'By letter',
      'By phone',
      'In person',
      'Another way',
    ])
    expect(optionsOf(markup, 'person')).toEqual(
      expect.arrayContaining(['Siti Aminah (Commercial), left on Mon 2 Nov 2026']),
    )
    expect(readable(markup)).toEqual(
      expect.arrayContaining([CASE_COPY.people.same, CASE_COPY.fields.identityAfter, 'Not given']),
    )
    expect(textsOf(markup, 'label')).not.toEqual(expect.arrayContaining([CASE_COPY.identityLabel]))
    expect(buttons(markup).find(button => button.name === 'Log it')).toMatchObject({ held: true, type: 'submit' })
    const details = tags(markup, 'textarea').find(control => control.get('name') === 'details')
    expect(details?.get('dir')).toBe('auto')
    // The people's states.
    const loading = aloneWith(<LogRequest today={CASE_TODAY} onClose={() => {}} onLogged={() => {}} />, () => {})
    expect(loading).toMatch(/<p role="status"[^>]*>Loading the people at the organisation…<\/p>/)
    const nobody = aloneWith(<LogRequest today={CASE_TODAY} onClose={() => {}} onLogged={() => {}} />, client =>
      client.setQueryData(casePeopleQuery.queryKey, casePeopleForClient({ people: [] })),
    )
    expect(readable(nobody)).toContain(CASE_COPY.people.empty)
    const cut = aloneWith(<LogRequest today={CASE_TODAY} onClose={() => {}} onLogged={() => {}} />, client =>
      client.setQueryData(casePeopleQuery.queryKey, casePeopleForClient({ more: true })),
    )
    expect(readable(cut)).toContain(CASE_COPY.people.cut)
    expect(ALIKE_IDS).toHaveLength(2)
    expect(readable(markup).filter(text => aiCopyIn(text) !== undefined)).toEqual([])
  })

  it('RQW-09 PD-30 PD-89: a read of the people refused for the PIN shows the PIN step above the intake form, never inside it, since a form inside a form never sends its submit', () => {
    const refused = aloneWith(<LogRequest today={CASE_TODAY} onClose={() => {}} onLogged={() => {}} />, client => {
      // A failed read stays failed as the dialog mounts (no retry on mount), as it shows once the
      // browser's first fetch has failed.
      client.setQueryDefaults(casePeopleQuery.queryKey, { retryOnMount: false })
      client
        .getQueryCache()
        .build(client, { queryKey: casePeopleQuery.queryKey })
        .setState({
          status: 'error',
          error: new ApiFailure(403, 'reauth_required', 'Enter your PIN.', { method: 'pin' }),
          fetchStatus: 'idle',
        })
    })
    expect(
      tags(refused, 'input')
        .find(input => input.get('name') === 'pin')
        ?.get('autoComplete'),
    ).toBe('current-password')
    // The PIN step's form and the intake form, side by side.
    expect(tags(refused, 'form')).toHaveLength(2)
    expect(formDepth(refused)).toBe(1)
    expect(refused.indexOf('name="pin"')).toBeLessThan(refused.indexOf('name="kind"'))
  })

  it('RQW-09 PD-89 PPL-01 PPL-13: the lines about the people list (two who read the same, a cut list, rows that couldn’t be read) describe the person field, and a leaver’s line describes How to reach them, so each is heard on the control it is about', () => {
    const plain = aloneWith(<LogRequest today={CASE_TODAY} onClose={() => {}} onLogged={() => {}} />, client =>
      client.setQueryData(casePeopleQuery.queryKey, casePeopleForClient({ people: [] })),
    )
    expect(controlOf(plain, CASE_COPY.fields.person)).toBeUndefined()
    const listed = casePeopleForClient({ more: true })
    const cut = aloneWith(<LogRequest today={CASE_TODAY} onClose={() => {}} onLogged={() => {}} />, client =>
      client.setQueryData(casePeopleQuery.queryKey, listed),
    )
    expect(describedBy(cut, controlOf(cut, CASE_COPY.fields.person))).toEqual([
      CASE_COPY.people.same,
      CASE_COPY.people.cut,
    ])
    const incomplete = aloneWith(<LogRequest today={CASE_TODAY} onClose={() => {}} onLogged={() => {}} />, client =>
      client.setQueryData(casePeopleQuery.queryKey, {
        more: false,
        people: { rows: listed.people.rows.slice(0, 2), complete: false },
      }),
    )
    expect(describedBy(incomplete, controlOf(incomplete, CASE_COPY.fields.person))).toEqual([
      CASE_COPY.people.incomplete,
    ])
    const whole = aloneWith(<LogRequest today={CASE_TODAY} onClose={() => {}} onLogged={() => {}} />, client =>
      client.setQueryData(casePeopleQuery.queryKey, {
        more: false,
        people: { rows: listed.people.rows.slice(0, 2), complete: true },
      }),
    )
    expect(controlOf(whole, CASE_COPY.fields.person)?.has('aria-describedby')).toBe(false)
    // Nothing describes How to reach them until a leaver is picked; then their line does.
    expect(tags(whole, 'fieldset').filter(fieldset => fieldset.has('aria-describedby'))).toEqual([])
    const leaver = aloneWith(
      <LogRequest today={CASE_TODAY} onClose={() => {}} onLogged={() => {}} initial={{ person: LEAVER_ID }} />,
      client => client.setQueryData(casePeopleQuery.queryKey, casePeopleForClient()),
    )
    const described = tags(leaver, 'fieldset').filter(fieldset => fieldset.has('aria-describedby'))
    expect(described).toHaveLength(1)
    expect(describedBy(leaver, described[0])).toEqual([CASE_COPY.fields.reachLeaver])
  })

  it('CTW-06 CTW-07 OD-08 PD-94: /dpo/contact shows the reply targets below the contact with their pill and Change reply targets; the dialog has two 16 px numeric fields with their ranges as hints, Save held while nothing changed, and the out-of-date warning once a version is published', async () => {
    const answer = contactAdminForClient({
      notice: 'up_to_date',
      contact: contactRow(),
      stated: 'stated',
      targetsStated: 'not_stated',
    })
    const markup = await appAt('/dpo/contact', REGISTERS, undefined, { contact: answer })
    const card = markup.slice(markup.indexOf(CONTACT.targets.title))
    expect(readable(card)).toEqual(
      expect.arrayContaining([
        'Questions, complaints, withdrawals and objections: 10 business days',
        'Copies of data and corrections: 30 calendar days',
        CONTACT.stated.no,
        CONTACT.targets.notStated,
        CONTACT.targets.edit,
      ]),
    )
    const dialog = alone(<TargetsDialog answer={answer} onClose={() => {}} />)
    expect(textsOf(dialog, 'h2')).toEqual([CONTACT.targets.dialogTitle])
    const business = controlOf(dialog, CONTACT.targets.businessField)
    const calendar = controlOf(dialog, CONTACT.targets.calendarField)
    expect([business, calendar].map(control => [control?.get('inputMode'), control?.get('value')])).toEqual([
      ['numeric', '10'],
      ['numeric', '30'],
    ])
    for (const control of [business, calendar]) expect(control?.get('class')).toMatch(/\btext-base\b/)
    expect(describedBy(dialog, business)).toEqual([CONTACT.targets.businessHint])
    expect(describedBy(dialog, calendar)).toEqual([CONTACT.targets.calendarHint])
    expect(buttons(dialog).find(button => button.name === 'Save')).toMatchObject({ held: true })
    expect(dialog).toContain(CONTACT.targets.unchanged)
    expect(readable(dialog)).toContain(CONTACT.dialog.staleWarning)
  })
})

// More time told after the due day, as the sheet words it (PPL-04).
const STEP_LATE = 'Record more time only on or before the current due day. If you told them later, add a note.'
