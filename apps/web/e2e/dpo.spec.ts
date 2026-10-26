// The DPO's registers and Notice tab in a real browser against the real api (C0.9 PD-20, PD-26,
// PD-27, PD-30, PD-48; PDPA-01, PDPA-02, PDPA-10, PDPA-13; OD-03; TECH-SPEC T22 items 15 and 31).
// Chromium only (not @smoke), and no visual shots: C0.16 moves the pages under /admin.
//
// Ashton, the seed's Owner and DPO (D35), holds PIN roles, so no storage state signs him in. The
// file signs him in once, through the api, before its tests (support/sign-in-api.ts): one code, then
// E2E_PIN set, so his session is issued under the PIN rule and re-authenticates with the PIN. A new
// session counts as re-authenticated for its first 5 minutes (§9.4), so the tests that read and
// write run first, and DPP-E3 confirms the PIN for real part-way. The file runs serially, in one
// worker, so the sign-in happens once and Ashton's one code is the run's only one (personas.ts).
// Marcus, the project's own persona (a Team Admin), is the one who isn't the DPO.
//
// What DPP-E2 records, and DPP-E5 clears and withdraws again, is made up and harmless: nothing in
// C0.9 PR 1 sends to a push service, and the e2e api's fake SMS provider names no transfer, so
// clearing or withdrawing changes no send. DPP-E6 publishes nothing: the seed's org keeps its
// placeholder version 0 until SE-05 publishes version 1, last in the run (session-end.spec.ts); its
// ready draft and its free-text problem are answers the test gives the page itself (C-05). DPP-E7
// and DPP-E8 (C0.9 PR 3a) write nothing either: their reads are the api's, and the contact's save
// and the recorded acknowledgement are answered by the test, so every case in this project sees
// the seed's org with no contact recorded, whatever the order, and SE-05 records the contact last.
// Past the session's first 5 minutes the api asks for the PIN again, and confirmPinIfAsked()
// answers it as DPP-E3 does. DPP-E9 and DPP-E10 (C0.9 PR 3b) write nothing either and spend no new
// code (PD-108): the queue, the cases, the people, the intake, the steps and the reply targets are
// answers the test gives the page itself, so nothing in this project writes a case or a target, and
// no case depends on another's order (PD-82's rule); DPP-E1 reads the seed's empty queue for real.
import {
  type AddCaseStepJSON,
  CasePeopleResponse,
  CaseResponse,
  type ContactAdminJSON,
  ContactAdminResponse,
  generateNotice,
  type LogRequestJSON,
  LogRequestResponse,
  NoticeAdminResponse,
  NoticePeopleResponse,
  REAUTH_METHOD_MESSAGES,
  RequestQueueResponse,
  type SetContactJSON,
  type SetTargetsJSON,
} from '@hearth/shared'
import type { Locator, Page } from '@playwright/test'
import { expectAxeClean } from './support/axe.ts'
import { inputs16, noAiCopy, noSidewaysScroll, targets44 } from './support/checks.ts'
import { stateFile } from './support/env.ts'
import { expect, test } from './support/fixtures.ts'
import { E2E_PIN, PERSONAS } from './support/personas.ts'
import { signInWithPinViaApi } from './support/sign-in-api.ts'
import { CHECK_SIZES, SCHEMES, SIZES } from './support/viewports.ts'

const ASHTON = stateFile('dpo-ashton')

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await signInWithPinViaApi(PERSONAS.ashton, E2E_PIN, ASHTON)
})

const h1 = (page: Page) => page.getByRole('heading', { level: 1 })
const toasts = (page: Page) => page.getByRole('region', { name: 'Notifications' })
const accountMenu = (page: Page) => page.getByRole('menu', { name: 'Account' })

// A card on a register's page, by its heading.
const card = (page: Page, name: string | RegExp) =>
  page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 2, name }) })

// The first purpose's card, which shows once the register has been read.
const firstPurpose = (page: Page) => page.getByRole('heading', { level: 2, name: /^Accounts and sign-in/ })

// DPP-E3's step, when the api asks for it: past the session's first 5 minutes, a read of the DPO's
// pages is refused for a fresh re-authentication (403 reauth_required), and the inline step
// confirms the PIN, after which the read is made again and `shown` appears.
async function confirmPinIfAsked(page: Page, shown: Locator): Promise<void> {
  const pin = page.getByLabel('Your PIN', { exact: true })
  await expect(shown.or(pin).first()).toBeVisible()
  if (!(await pin.isVisible())) return
  await pin.fill(E2E_PIN)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(shown).toBeVisible()
}

// The refusals confirmPinIfAsked() meets, for the guard.
const PIN_ASKED = (...paths: string[]) => paths.map(path => ({ path, status: 403 }))

// The day after a YYYY-MM-DD day.
const dayAfter = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

// A review date a year from now: after today in any zone.
const nextYear = () => {
  const date = new Date()
  date.setUTCFullYear(date.getUTCFullYear() + 1)
  return date.toISOString().slice(0, 10)
}

test('DPP-E1 PD-26 PD-27 PD-47 PD-98 decision 8 B-09: the DPO’s avatar menu holds Settings, Data protection and Sign out, and Data protection opens the requests (the seed’s org has none, read for real), then the processing register lists 14 purposes; both registers pass axe at 320, 390 and 1440 px in both schemes, show no AI copy, and scroll nothing sideways at 320', async ({
  open,
}, testInfo) => {
  const page = await open({ ...SIZES.w390, signedIn: ASHTON })
  await page.goto('/chats')
  await expect(h1(page)).toHaveText('Chats')
  await page.getByRole('button', { name: /^Account, Ashton/ }).click()
  const items = accountMenu(page).getByRole('menuitem')
  expect((await items.allInnerTexts()).map(name => name.trim())).toEqual(['Settings', 'Data protection', 'Sign out'])
  await items.filter({ hasText: 'Data protection' }).click()
  // The queue first (C0.9 PR 3b, PD-98): the seed's DPO has acknowledged its notice, and its org
  // holds no request.
  await expect(page).toHaveURL(/\/dpo\/requests$/)
  await expect(h1(page)).toHaveText('Requests')
  await expect(page.getByText('No open requests.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Open requests (0)' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Data protection' })
    .getByRole('link', { name: 'Purposes', exact: true })
    .click()
  await expect(page).toHaveURL(/\/dpo\/purposes$/)
  await expect(h1(page)).toHaveText('Processing register')
  await expect(firstPurpose(page)).toBeVisible()
  // Fourteen purposes, request_handling among them (C0.9 OD-17), none of the AI layer's (PD-27).
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(14)
  await expect(page.getByRole('heading', { level: 2, name: 'Transcribing sessions' })).toHaveCount(0)

  for (const [path, title, first] of [
    ['/dpo/purposes', 'Processing register', /^Accounts and sign-in/],
    ['/dpo/transfers', 'Transfer register', 'Amazon Web Services'],
  ] as const) {
    await page.goto(path)
    await expect(h1(page)).toHaveText(title)
    await expect(page.getByRole('heading', { level: 2, name: first })).toBeVisible()
    for (const size of CHECK_SIZES) {
      await page.setViewportSize(size)
      for (const scheme of SCHEMES) {
        await page.emulateMedia({ colorScheme: scheme })
        await expectAxeClean(page, `${path} at ${size.width} ${scheme}`, testInfo)
      }
      expect(await noAiCopy(page), `${path} at ${size.width}`).toEqual([])
    }
    await page.setViewportSize(SIZES.w320)
    expect(await noSidewaysScroll(page), `${path} at 320`).toEqual([])
    await page.setViewportSize(SIZES.w390)
  }
})

test('DPP-E3 PD-30 D46 T20 item 6: a read refused for want of a fresh re-authentication shows the PIN step, whose PIN confirms it’s the DPO for real, and the register is read again', async ({
  open,
  guard,
}) => {
  // The first read is answered here with the refusal the api gives a PIN-rule session past its 5
  // minutes; every later request goes to the api.
  guard.expectResponses([{ path: '/api/admin/registers', status: 403 }])
  const page = await open({ ...SIZES.w390, signedIn: ASHTON })
  let refused = false
  await page.route('**/api/admin/registers', async route => {
    if (refused || route.request().method() !== 'GET') return route.fallback()
    refused = true
    return route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'reauth_required',
        message: REAUTH_METHOD_MESSAGES.pin.required,
        method: 'pin',
      }),
    })
  })
  await page.goto('/dpo/purposes')
  await expect(h1(page)).toHaveText('Processing register')
  await expect(page.getByText(REAUTH_METHOD_MESSAGES.pin.method, { exact: true })).toBeVisible()
  const pin = page.getByLabel('Your PIN', { exact: true })
  await expect(pin).toBeFocused()
  await expect(pin).toHaveAttribute('autocomplete', 'current-password')
  await expect(firstPurpose(page)).toHaveCount(0)

  const confirmed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/reauth/pin')
  await pin.fill(E2E_PIN)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  expect((await confirmed).status()).toBe(200)
  await expect(firstPurpose(page)).toBeVisible()
  await expect(pin).toHaveCount(0)
  expect(refused).toBe(true)
})

test('DPP-E2 PDPA-01 PDPA-10 PD-04 PD-05 PD-11 PD-12: the DPO records security_audit on legitimate interests and sees version 2; recording_meetings offers no consent-type basis; apple_push’s made-up facts leave nothing still needed, and it is cleared for use, then withdrawn', async ({
  open,
}) => {
  const page = await open({ ...SIZES.desktop, signedIn: ASHTON })
  await page.goto('/dpo/purposes')
  await expect(h1(page)).toHaveText('Processing register')

  // security_audit starts active with nothing recorded (PD-06): a basis, its assessment and a
  // retention save it as version 2.
  await page.getByRole('button', { name: 'Edit Security audit and monitoring' }).click()
  let dialog = page.getByRole('dialog', { name: 'Edit Security audit and monitoring' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Legal basis', { exact: true }).selectOption('legitimate_interests')
  await dialog
    .getByLabel('Where the legitimate interests assessment is kept', { exact: true })
    .fill('Assessment 3, in the DPO’s file')
  await dialog.getByLabel('How long it’s kept', { exact: true }).fill('13 months')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toBeHidden()
  const audit = card(page, 'Security audit and monitoring')
  await expect(audit).toContainText('Legitimate interests')
  await expect(audit).toContainText('13 months')
  await expect(audit).toContainText(/Version\s*2/)
  await expect(audit).toContainText(/by Ashton/)

  // A purpose that needs a per-person switch rests on no consent-type basis until C2.11 (PD-11).
  await page.getByRole('button', { name: 'Edit Recording scheduled meetings and calls' }).click()
  dialog = page.getByRole('dialog', { name: 'Edit Recording scheduled meetings and calls' })
  const bases = (await dialog.getByLabel('Legal basis', { exact: true }).locator('option').allInnerTexts()).map(text =>
    text.trim(),
  )
  expect(bases).toContain('Legitimate interests')
  for (const consent of ['Consent', 'Deemed consent by conduct or contract', 'Deemed consent by notification']) {
    expect(bases, consent).not.toContain(consent)
  }
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()

  // The transfer register: a push service's facts, made up, then cleared and withdrawn.
  await page.getByRole('navigation', { name: 'Data protection' }).getByRole('link', { name: 'Transfers' }).click()
  await expect(h1(page)).toHaveText('Transfer register')
  const apple = card(page, 'Apple Push Notification service')
  await expect(apple).toContainText('Not cleared')
  await apple.getByRole('button', { name: 'Edit Apple Push Notification service' }).click()
  dialog = page.getByRole('dialog', { name: 'Edit Apple Push Notification service' })
  await expect(dialog).toContainText('Still needed before clearing')
  const field = (label: string) => dialog.getByLabel(label, { exact: true })
  await field('What it’s used for').fill('Notifications to Apple devices')
  await field('The personal data it receives').fill('A device token, and that something changed')
  await field('Countries it processes the data in').fill('us')
  await field('Countries it stores the data in').fill('US')
  await field('Where and when it confirmed the countries in writing').fill('Developer agreement, 1 Oct 2026')
  await field('Transfer safeguard').selectOption('dpa')
  await field('The safeguard’s reference').fill('Developer agreement, schedule 2')
  await dialog.getByRole('checkbox', { name: /^The agreement binds protection comparable to the PDPA/ }).check()
  await field('Training on the data').selectOption('not_applicable')
  await field('Zero-retention result').selectOption('not_offered')
  await field('How long it keeps the data').fill('Until delivered, at most 30 days')
  await field('Where and when it confirmed its retention in writing').fill('Developer documentation, 1 Oct 2026')
  await field('Who it passes the data on to').fill('None')
  await field('Review by').fill(nextYear())
  await expect(dialog).toContainText('Nothing more is needed to clear it.')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toBeHidden()

  await apple.getByRole('button', { name: 'Clear for use', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Clear Apple Push Notification service for use?' })
  await dialog.getByRole('button', { name: 'Clear for use', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(apple).toContainText(/Cleared on .* by Ashton/)

  await apple.getByRole('button', { name: 'Withdraw clearance', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Withdraw Apple Push Notification service’s clearance?' })
  await expect(dialog).toContainText('Nothing in Hearth sends to it yet')
  await dialog.getByRole('button', { name: 'Withdraw clearance', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(apple).toContainText('Clearance withdrawn on')
  await expect(apple.getByRole('button', { name: 'Clear for use', exact: true })).toBeVisible()
})

test('DPP-E5 NFR-02 PRD-66 WCAG 2.2 AA T22 item 15 PD-47 PD-98: on a phone, the DPO’s three-item avatar menu and the five Data protection links fit at 320 × 568 and 768 × 480; and at 320 and 390 both pages and every dialog of the edit, clear and withdraw flows have 44 px targets and 16 px inputs, scroll nothing sideways and pass axe', async ({
  open,
}, testInfo) => {
  // SH-08's placement check, with the DPO's menu: every item inside the viewport, and the point at
  // its centre is the item.
  for (const size of [SIZES.w320, SIZES.short]) {
    const page = await open({ ...size, signedIn: ASHTON, phone: true })
    await page.goto('/chats')
    await expect(h1(page)).toHaveText('Chats')
    await page.getByRole('button', { name: /^Account, Ashton/ }).click()
    const items = accountMenu(page).getByRole('menuitem')
    expect((await items.allInnerTexts()).map(name => name.trim())).toEqual(['Settings', 'Data protection', 'Sign out'])
    const placed = await items.evaluateAll(elements =>
      elements.map(element => {
        const box = element.getBoundingClientRect()
        const inside = box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight && box.right <= innerWidth
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        return { inside, reached: hit !== null && (hit === element || element.contains(hit)) }
      }),
    )
    const every = { inside: true, reached: true }
    expect(placed, `${size.width} × ${size.height}`).toEqual([every, every, every])
    expect(await targets44(page), `the avatar menu at ${size.width} × ${size.height}`).toEqual([])
    // The track's five links (C0.9 PR 3b: Requests first), wrapping to two rows at 320 px.
    await page.keyboard.press('Escape')
    await page.goto('/dpo/purposes')
    await expect(firstPurpose(page)).toBeVisible()
    expect(await trackFits(page), `the links at ${size.width} × ${size.height}`).toEqual([])
  }

  for (const size of [SIZES.w320, SIZES.w390]) {
    const page = await open({ ...size, signedIn: ASHTON, phone: true })
    // What NFR-02 asks of every screen, on the page or dialog as it stands.
    const checked = async (what: string) => {
      const label = `${what} at ${size.width}`
      expect(await targets44(page), label).toEqual([])
      expect(await inputs16(page), label).toEqual([])
      expect(await noSidewaysScroll(page), label).toEqual([])
      await expectAxeClean(page, label, testInfo)
    }

    await page.goto('/dpo/purposes')
    await expect(firstPurpose(page)).toBeVisible()
    await checked('/dpo/purposes')
    await page.getByRole('button', { name: 'Edit Security audit and monitoring' }).click()
    let dialog = page.getByRole('dialog', { name: 'Edit Security audit and monitoring' })
    await expect(dialog).toBeVisible()
    await checked('the purpose dialog')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()

    await page.goto('/dpo/transfers')
    const apple = card(page, 'Apple Push Notification service')
    await expect(apple).toContainText('Not cleared')
    await checked('/dpo/transfers')
    await apple.getByRole('button', { name: 'Edit Apple Push Notification service' }).click()
    dialog = page.getByRole('dialog', { name: 'Edit Apple Push Notification service' })
    await expect(dialog).toContainText('Nothing more is needed to clear it.')
    await checked('the transfer dialog')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()

    // On the facts DPP-E2 recorded: cleared, then withdrawn, each through its confirmation.
    await apple.getByRole('button', { name: 'Clear for use', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Clear Apple Push Notification service for use?' })
    await expect(dialog).toBeVisible()
    await checked('the clear confirmation')
    await dialog.getByRole('button', { name: 'Clear for use', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(apple).toContainText(/Cleared on .* by Ashton/)
    await apple.getByRole('button', { name: 'Withdraw clearance', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Withdraw Apple Push Notification service’s clearance?' })
    await expect(dialog).toBeVisible()
    await checked('the withdraw confirmation')
    await dialog.getByRole('button', { name: 'Withdraw clearance', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(apple).toContainText('Clearance withdrawn on')
  }
})

// A draft ready to publish, as GET /api/admin/notice would answer it once every active purpose has
// its basis and retention: the generator's own words for made-up entries, read with the strict
// schema so the answer is one the server could give. The digest is a stand-in: nothing publishes.
function readyAnswer(today: string) {
  const placeholder = {
    id: 'e0000000-0000-4000-8000-000000000001',
    version: 0,
    publishedAt: '2026-10-01T01:00:00.000Z',
    publishedBy: 'Ashton Teo',
    generated: false,
  }
  const body = generateNotice({
    org: 'Tembusu Logistics',
    purposes: [
      {
        key: 'accounts',
        version: 2,
        status: 'active',
        basis: 'employment',
        basisReference: null,
        retention: 'While you work here, then 30 days',
        providers: [],
      },
      {
        key: 'backups',
        version: 2,
        status: 'active',
        basis: 'legitimate_interests',
        basisReference: 'Assessment 2, in the DPO’s file',
        retention: '35 days',
        providers: [],
      },
    ],
    clearances: [],
    // The contact SE-05 records (support/registers-api.ts), made up, on a reserved domain, with the
    // reply targets every settings version starts with (C0.9 PD-94).
    contact: {
      version: 1,
      title: 'Data Protection Officer',
      email: 'dpo@tembusu.example',
      phone: null,
      postal: null,
      targets: { businessDays: 10, calendarDays: 30 },
    },
  })
  return NoticeAdminResponse.parse({
    today,
    latest: { ...placeholder, acknowledged: 11, people: 12 },
    draft: {
      version: 1,
      body,
      digest: 'ab'.repeat(32),
      problems: [],
      warnings: [{ code: 'production_access_pending' }],
      changes: {
        since: 0,
        purposes: { added: ['accounts', 'backups'], changed: [], removed: [] },
        providers: { added: [], changed: [], removed: [] },
        contact: 'added',
        targets: 'added',
        wording: true,
      },
      upToDate: false,
    },
    history: [placeholder],
  })
}

test('DPP-E6 PDPA-02 PD-37 PD-48 PD-62 PD-68 C-05: the Notice tab, from the Data protection links (badged Out of date), shows the placeholder version 0 with a count of acknowledgements, what holds publishing back (the DPO’s contact included) with links to the processing register and the contact page, Publish held and no preview; a ready draft shows its words and Publish asks first, and Cancel publishes nothing; free text the screens keep off is named by its field, never quoted; each state passes axe with no AI copy, 44 px targets and nothing sideways', async ({
  open,
}, testInfo) => {
  // Three states of the tab, each through axe at its sizes and schemes.
  test.setTimeout(120_000)
  const page = await open({ ...SIZES.w390, signedIn: ASHTON })
  const publishes: string[] = []
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/admin/notice/publish') publishes.push(request.method())
  })
  // What NFR-02 and decision 8 ask of the tab as it stands, at each size, in both schemes.
  const checked = async (what: string, sizes = CHECK_SIZES, schemes: readonly ('light' | 'dark')[] = SCHEMES) => {
    for (const size of sizes) {
      await page.setViewportSize(size)
      for (const scheme of schemes) {
        await page.emulateMedia({ colorScheme: scheme })
        await expectAxeClean(page, `${what} at ${size.width} ${scheme}`, testInfo)
      }
      expect(await noAiCopy(page), `${what} at ${size.width}`).toEqual([])
      expect(await targets44(page), `${what} at ${size.width}`).toEqual([])
    }
    await page.setViewportSize(SIZES.w320)
    expect(await noSidewaysScroll(page), `${what} at 320`).toEqual([])
    await page.setViewportSize(SIZES.w390)
    await page.emulateMedia({ colorScheme: 'light' })
  }

  // The seed's org as DPP-E2 left it: version 0 is a placeholder, and the pinned purposes and
  // backups still have no basis or retention, so the draft can't be written yet.
  await page.goto('/dpo/purposes')
  await expect(firstPurpose(page)).toBeVisible()
  const registers = page.getByRole('navigation', { name: 'Data protection' })
  const noticeLink = registers.getByRole('link', { name: /^Notice/ })
  await expect(noticeLink).toContainText('Out of date')
  await noticeLink.click()
  await expect(page).toHaveURL(/\/dpo\/notice$/)
  await expect(h1(page)).toHaveText('Publish the notice')
  await expect(registers.getByRole('link', { name: /^Notice/ })).toHaveAttribute('aria-current', 'page')
  const published = page.getByRole('region', { name: 'The published notice' })
  await expect(published.getByText(/^Version 0, published .+ by Ashton Teo\.$/)).toBeVisible()
  await expect(published.getByText(/^It’s a placeholder, not written from the registers\./)).toBeVisible()
  await expect(
    published.getByText(/^\d+ of the \d+ people at the organisation have acknowledged version 0\.$/),
  ).toBeVisible()
  await expect(page.getByText('Before you can publish', { exact: true })).toBeVisible()
  // Under the purpose it names: the list of what the next version adds names it too.
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: /^Backups/ })
      .filter({ hasText: 'Record its legal basis.' }),
  ).toBeVisible()
  // No contact is recorded in this project (C0.9 OD-10, PD-68), under its own heading, fixed on its
  // page.
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: /^Your contact details/ })
      .filter({ hasText: 'Record your contact details, so the notice can say how to reach you.' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open your contact details', exact: true })).toHaveAttribute(
    'href',
    '/dpo/contact',
  )
  const publish = page.getByRole('button', { name: 'Publish version 1', exact: true })
  await expect(publish).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByText('The preview shows once what’s listed above is fixed.', { exact: true })).toBeVisible()
  await checked('/dpo/notice with problems')
  await page.getByRole('link', { name: 'Open the processing register', exact: true }).click()
  await expect(page).toHaveURL(/\/dpo\/purposes$/)
  await expect(page.getByRole('link', { name: 'Open the notice', exact: true })).toBeVisible()

  // A ready draft, as the page would get it once the bases and retentions are recorded.
  let answer: unknown = readyAnswer(new Date().toISOString().slice(0, 10))
  await page.route('**/api/admin/notice', route =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer) })
      : route.fallback(),
  )
  await page.goto('/dpo/notice')
  const preview = page.getByRole('region', { name: 'Preview of version 1, as people will read it' })
  await expect(preview.getByRole('heading', { level: 3, name: 'About this notice' })).toBeVisible()
  await expect(preview.getByRole('heading', { level: 4, name: /^Accounts and sign-in/ })).toBeVisible()
  await expect(page.getByText('Now listed', { exact: true })).toBeVisible()
  await expect(
    page.getByText('The notice gives your contact details for the first time.', { exact: true }),
  ).toBeVisible()
  await expect(preview.getByText('Email: dpo@tembusu.example', { exact: true })).toBeVisible()
  await expect(publish).not.toHaveAttribute('aria-disabled')
  await checked('/dpo/notice ready')
  await publish.click()
  const confirm = page.getByRole('dialog', { name: 'Publish version 1?' })
  await expect(confirm).toContainText(
    'Everyone, you included, acknowledges version 1 before using Hearth again. People using Hearth now are taken to it within half a minute.',
  )
  await checked('the publish confirmation', [SIZES.w320, SIZES.w390], ['light'])
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expect(h1(page)).toHaveText('Publish the notice')

  // Free text Hearth keeps off its screens (PD-62): the problem names the purpose and the field,
  // never the words, so the page itself stays clean.
  const ready = readyAnswer(new Date().toISOString().slice(0, 10))
  answer = {
    ...ready,
    draft: {
      ...ready.draft,
      body: null,
      digest: null,
      problems: [{ code: 'free_text_ai_copy', purpose: 'backups', field: 'retention' }],
    },
  }
  NoticeAdminResponse.parse(answer)
  await page.goto('/dpo/notice')
  await expect(
    page.getByText('“How long it’s kept” uses wording Hearth keeps off its screens. Reword it.', { exact: true }),
  ).toBeVisible()
  await expect(publish).toHaveAttribute('aria-disabled', 'true')
  await checked('/dpo/notice with free text kept off', [SIZES.w390], ['light'])
  expect(publishes).toEqual([])
})

test('DPP-E7 PDPA-13 OD-10 PD-64 PD-70: the DPO opens Contact from the Data protection links; with none recorded the page says so, and Record contact details opens the dialog with the role title filled in; no channel, or a phone number without +, holds Save back with a line saying why; a made-up role, mailbox and address save, focus lands on Edit, and the card then says the published notice doesn’t give them yet; the page and the dialog pass axe at 320, 390 and 1440 px in both schemes, with no AI copy, 44 px targets, 16 px inputs and nothing sideways', async ({
  open,
  guard,
}, testInfo) => {
  test.setTimeout(150_000)
  guard.expectResponses(PIN_ASKED('/api/admin/registers', '/api/admin/notice/contact'))
  const page = await open({ ...SIZES.w390, signedIn: ASHTON })
  // The contact's reads go to the api (it has none: nothing in this project records one) until the
  // save, which the test answers itself, so nothing is written; then the read answers what the
  // server would for what was saved: recorded today, and not in the seed's placeholder (C0.9 PD-70).
  let real: ContactAdminJSON | undefined
  let saved: SetContactJSON | undefined
  await page.route('**/api/admin/notice/contact', async route => {
    if (saved === undefined || real === undefined) {
      const response = await route.fetch()
      if (response.status() === 200) real = ContactAdminResponse.parse(await response.json())
      return route.fulfill({ response })
    }
    const after = ContactAdminResponse.parse({
      notice: real.notice,
      contact: {
        version: 1,
        title: saved.title,
        email: saved.email,
        phone: saved.phone,
        postal: saved.postal,
        recordedOn: new Date().toISOString().slice(0, 10),
        recordedBy: 'Ashton Teo',
      },
      stated: 'not_printed',
      // Kept with the contact from C0.9 PR 3b (PD-94): OD-08's figures, which the placeholder
      // doesn't print.
      targets: { businessDays: 10, calendarDays: 30 },
      targetsStated: 'not_printed',
    })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(after) })
  })
  await page.route('**/api/admin/notice/contact/set', route => {
    saved = route.request().postDataJSON() as SetContactJSON
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: 1, changed: true }),
    })
  })
  // What NFR-02 and decision 8 ask of the page or dialog as it stands, at each size and scheme.
  const checked = async (what: string, sizes = CHECK_SIZES, schemes: readonly ('light' | 'dark')[] = SCHEMES) => {
    for (const size of sizes) {
      await page.setViewportSize(size)
      for (const scheme of schemes) {
        await page.emulateMedia({ colorScheme: scheme })
        await expectAxeClean(page, `${what} at ${size.width} ${scheme}`, testInfo)
      }
      const label = `${what} at ${size.width}`
      expect(await noAiCopy(page), label).toEqual([])
      expect(await targets44(page), label).toEqual([])
      expect(await inputs16(page), label).toEqual([])
    }
    await page.setViewportSize(SIZES.w320)
    expect(await noSidewaysScroll(page), `${what} at 320`).toEqual([])
    await page.setViewportSize(SIZES.w390)
    await page.emulateMedia({ colorScheme: 'light' })
  }

  await page.goto('/dpo/purposes')
  await confirmPinIfAsked(page, firstPurpose(page))
  const registers = page.getByRole('navigation', { name: 'Data protection' })
  await registers.getByRole('link', { name: 'Contact', exact: true }).click()
  await expect(page).toHaveURL(/\/dpo\/contact$/)
  await expect(h1(page)).toHaveText('Contact details')
  const none = page.getByRole('heading', { level: 2, name: 'No contact details yet' })
  await confirmPinIfAsked(page, none)
  await expect(registers.getByRole('link', { name: 'Contact', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('The notice can’t be published until you record them.', { exact: true })).toBeVisible()
  expect(real?.contact).toBeNull()
  await checked('/dpo/contact with none')

  await page.getByRole('button', { name: 'Record contact details', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Record your contact details' })
  await expect(dialog).toBeVisible()
  const field = (label: string) => dialog.getByLabel(label, { exact: true })
  await expect(field('Role title')).toHaveValue('Data Protection Officer')
  const save = dialog.getByRole('button', { name: 'Save', exact: true })
  // No channel outside Hearth (OD-10).
  await expect(
    dialog.getByText('Give an email address, a phone number or a postal address.', { exact: true }),
  ).toBeVisible()
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  // A number not in international format, marked on its field.
  await field('Phone').fill('12345')
  await expect(
    dialog.getByText('Enter the phone number starting with + and the country code.', { exact: true }),
  ).toBeVisible()
  await expect(field('Phone')).toHaveAttribute('aria-invalid', 'true')
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await checked('the contact dialog')

  await field('Phone').fill('')
  await field('Email address').fill('dpo@tembusu.example')
  await field('Postal address').fill('1 Example Road\nSingapore 000000')
  await expect(dialog.getByText('Before you can save', { exact: true })).toHaveCount(0)
  await expect(save).not.toHaveAttribute('aria-disabled')
  await save.click()
  await expect(dialog).toBeHidden()
  expect(saved).toEqual({
    seen: null,
    title: 'Data Protection Officer',
    email: 'dpo@tembusu.example',
    phone: null,
    postal: '1 Example Road\nSingapore 000000',
  })
  await expect(toasts(page).getByText('Contact details saved.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Data Protection Officer' })).toBeVisible()
  // The button that opened the dialog has gone with the empty card, so focus is on Edit, never <body>.
  await expect(page.getByRole('button', { name: 'Edit contact details', exact: true })).toBeFocused()
  // The contact's card; the reply targets' card below it says the same of the targets (C0.9 PR 3b).
  const contactCard = page.getByRole('region', { name: 'Data Protection Officer' })
  await expect(contactCard.getByText('Not in the published notice yet', { exact: true })).toBeVisible()
  await expect(
    contactCard.getByText(
      'The published notice doesn’t give your contact details yet. Publish a new version so it does.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(contactCard.getByRole('link', { name: 'Open the Notice tab', exact: true })).toHaveAttribute(
    'href',
    '/dpo/notice',
  )
  await expect(
    page
      .getByRole('region', { name: 'Reply targets' })
      .getByText('Questions, complaints, withdrawals and objections: 10 business days', {
        exact: true,
      }),
  ).toBeVisible()
  await checked('/dpo/contact with a contact', [SIZES.w390], ['light'])
})

test('DPP-E8 PDPA-03 OD-19 PD-75 PD-76: from the Notice tab, Record an acknowledgement lists the seed’s people but the DPO, by name and department with no number or status; a day after today and no note are each held back on the page; Rachel, a day and how are recorded, the body naming her, the placeholder version, the day and the note, once more after the dialog’s PIN step when the first is refused for a fresh re-authentication; the toast says so, the dialog closes and focus is back on the button; the dialog passes axe at 320 and 390 px in both schemes, with 44 px targets, 16 px inputs and nothing sideways', async ({
  open,
  guard,
}, testInfo) => {
  test.setTimeout(120_000)
  guard.expectResponses([
    ...PIN_ASKED('/api/admin/notice', '/api/admin/notice/people'),
    { path: '/api/admin/notice/acknowledgements/record', status: 403 },
  ])
  const page = await open({ ...SIZES.w390, signedIn: ASHTON })
  // The list is the api's (a read, which writes nothing); the record is answered here: the first
  // with the refusal the api gives a PIN-rule session past its 5 minutes, so the dialog's own PIN
  // step is shown (outside its form, since a form in a form never sends), the next recorded.
  const recorded: unknown[] = []
  await page.route('**/api/admin/notice/acknowledgements/record', route => {
    recorded.push(route.request().postDataJSON())
    return route.fulfill(
      recorded.length === 1
        ? {
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'reauth_required',
              message: REAUTH_METHOD_MESSAGES.pin.required,
              method: 'pin',
            }),
          }
        : { status: 200, contentType: 'application/json', body: JSON.stringify({ version: 0, changed: true }) },
    )
  })
  const listed = page.waitForResponse(
    response => new URL(response.url()).pathname === '/api/admin/notice/people' && response.status() === 200,
  )
  await page.goto('/dpo/notice')
  const count = page.getByText(/^\d+ of the \d+ people at the organisation have acknowledged version 0\.$/)
  await confirmPinIfAsked(page, count)
  const opener = page.getByRole('button', { name: 'Record an acknowledgement', exact: true })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Record an acknowledgement of version 0' })
  const who = dialog.getByLabel('Who acknowledged it', { exact: true })
  await confirmPinIfAsked(page, who)
  await expect(who).toBeFocused()
  const people = NoticePeopleResponse.parse(await (await listed).json())
  const rachel = people.people.find(person => person.name === 'Rachel Goh')
  expect(rachel).toBeDefined()
  expect(people.people.map(person => person.name)).not.toContain('Ashton Teo')
  const options = (await who.locator('option').allInnerTexts()).map(text => text.trim())
  expect(options[0]).toBe('Choose someone')
  expect(options).toContain('Rachel Goh (Commercial)')
  expect(options).toHaveLength(people.people.length + 1)
  // Roster facts only: no number, and nothing about who has acknowledged (PD-76).
  expect(options.filter(text => /\+\d|\d{8}|acknowledg/i.test(text))).toEqual([])

  const day = dialog.getByLabel('When they acknowledged it', { exact: true })
  const how = dialog.getByLabel('How they acknowledged it', { exact: true })
  const record = dialog.getByRole('button', { name: 'Record', exact: true })
  await who.selectOption(rachel?.id ?? '')
  await day.fill(dayAfter(people.today))
  await expect(
    dialog.getByText('Give a day from the day version 0 was published to today.', { exact: true }),
  ).toBeVisible()
  await expect(dialog.getByText('Say how they acknowledged it.', { exact: true })).toBeVisible()
  await expect(record).toHaveAttribute('aria-disabled', 'true')
  for (const size of [SIZES.w320, SIZES.w390]) {
    await page.setViewportSize(size)
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme })
      await expectAxeClean(page, `the record dialog at ${size.width} ${scheme}`, testInfo)
    }
    const label = `the record dialog at ${size.width}`
    expect(await targets44(page), label).toEqual([])
    expect(await inputs16(page), label).toEqual([])
    expect(await noSidewaysScroll(page), label).toEqual([])
    expect(await noAiCopy(page), label).toEqual([])
  }
  await page.emulateMedia({ colorScheme: 'light' })

  await day.fill(people.today)
  await how.fill('Signed a printed copy at induction')
  await expect(dialog.getByText('Before you can record', { exact: true })).toHaveCount(0)
  await record.click()
  const pin = dialog.getByLabel('Your PIN', { exact: true })
  await expect(pin).toBeVisible()
  expect(await dialog.locator('form form').count()).toBe(0)
  const confirmed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/reauth/pin')
  await pin.fill(E2E_PIN)
  await pin.press('Enter')
  expect((await confirmed).status()).toBe(200)
  await expect(dialog).toBeHidden()
  const body = {
    person: rachel?.id,
    notice: people.latest.notice,
    acknowledgedOn: people.today,
    note: 'Signed a printed copy at induction',
  }
  expect(recorded).toEqual([body, body])
  await expect(toasts(page).getByText('Recorded: Rachel Goh acknowledged version 0.', { exact: true })).toBeVisible()
  await expect(opener).toBeFocused()
})

// --- The requests to the DPO (C0.9 PR 3b): every answer the test's own (PD-108) -------------------

// The queue's org day, and the made-up requests DPP-E9 and DPP-E10 show. Every name, address and
// word is invented, on reserved domains, and holds nothing AI_COPY refuses.
const CASE_DAY = '2026-11-12'
const OVERDUE_ID = 'c0000000-0000-4000-8000-0000000000e1'
const WITHDRAWAL_ID = 'c0000000-0000-4000-8000-0000000000e2'
const CLOSED_ID = 'c0000000-0000-4000-8000-0000000000e3'
const LOGGED_ID = 'c0000000-0000-4000-8000-0000000000e4'
const RACHEL_ID = 'b0000000-0000-4000-8000-000000000007'
const LEAVER_ID = 'b0000000-0000-4000-8000-0000000000f1'

const QUEUE = RequestQueueResponse.parse({
  today: CASE_DAY,
  open: [
    {
      id: OVERDUE_ID,
      reference: 'BC2DFG3H',
      kind: 'access',
      cameBy: 'email',
      receivedOn: '2026-10-01',
      dueOn: '2026-10-31',
      repliedOn: null,
      repliedInTime: false,
      revision: 1,
      state: 'in_progress',
      requester: { type: 'outside', name: 'Lee Example' },
      closedOn: null,
      outcome: null,
    },
    {
      id: WITHDRAWAL_ID,
      reference: 'K7QMX3TD',
      kind: 'withdrawal',
      cameBy: 'hearth',
      receivedOn: '2026-11-02',
      dueOn: '2026-11-16',
      repliedOn: null,
      repliedInTime: false,
      revision: 0,
      state: 'new',
      requester: { type: 'person', name: 'Rachel Goh', department: 'Commercial', left: false },
      closedOn: null,
      outcome: null,
    },
  ],
  openTotal: 2,
  closed: [
    {
      id: CLOSED_ID,
      reference: 'MNP4QRS5',
      kind: 'question',
      cameBy: 'hearth',
      receivedOn: '2026-10-05',
      dueOn: null,
      repliedOn: '2026-10-08',
      repliedInTime: true,
      revision: 2,
      state: 'closed',
      requester: { type: 'person', name: 'Rachel Goh', department: 'Commercial', left: false },
      closedOn: '2026-10-09',
      outcome: 'answered',
    },
  ],
  closedMore: false,
})

// Rachel's withdrawal on its sheet, before and after the step DPP-E9 records.
const withdrawalCase = (revision: number) =>
  CaseResponse.parse({
    today: CASE_DAY,
    case: {
      id: WITHDRAWAL_ID,
      reference: 'K7QMX3TD',
      kind: 'withdrawal',
      receivedKind: 'withdrawal',
      cameBy: 'hearth',
      receivedOn: '2026-11-02',
      loggedOn: '2026-11-02',
      loggedBy: null,
      requester: {
        type: 'person',
        person: RACHEL_ID,
        name: 'Rachel Goh',
        department: 'Commercial',
        manager: 'Ahmad Rahman',
        leftOn: null,
        channel: null,
        contact: null,
      },
      details: 'I no longer want my photo shown on the team page.',
      dueOn: '2026-11-16',
      repliedOn: null,
      repliedInTime: false,
      revision,
      state: revision === 0 ? 'new' : 'in_progress',
      identityChecked: false,
      reviewOpen: false,
      closedOn: null,
      closedKind: null,
      outcome: null,
      closedNote: null,
      closedBy: null,
    },
    steps:
      revision === 0
        ? []
        : [
            {
              number: 1,
              step: 'acknowledged',
              onDay: CASE_DAY,
              note: null,
              extendedTo: null,
              kind: null,
              recordedOn: CASE_DAY,
              recordedBy: 'Ashton Teo',
            },
          ],
    others: [
      {
        id: CLOSED_ID,
        reference: 'MNP4QRS5',
        kind: 'question',
        cameBy: 'hearth',
        receivedOn: '2026-10-05',
        state: 'closed',
        dueOn: null,
        repliedInTime: true,
        closedOn: '2026-10-09',
        outcome: 'answered',
      },
    ],
    othersMore: false,
    reply:
      'Your reference: K7QM-X3TD\n\nThank you for writing to withdraw your consent.\n\nNone of the purposes Tembusu Logistics processes your personal data for rests on your consent, so withdrawing it doesn’t stop any of them.\n\nData Protection Officer',
  })

// The people DPP-E10 logs for: a leaver, and two nothing tells apart.
const CASE_PEOPLE = CasePeopleResponse.parse({
  people: [
    {
      id: RACHEL_ID,
      name: 'Rachel Goh',
      department: 'Commercial',
      manager: 'Ahmad Rahman',
      addedOn: '2026-10-01',
      leftOn: null,
    },
    {
      id: LEAVER_ID,
      name: 'Siti Aminah',
      department: 'Commercial',
      manager: null,
      addedOn: '2026-10-01',
      leftOn: '2026-11-02',
    },
    {
      id: 'b0000000-0000-4000-8000-0000000000f2',
      name: 'Wei Ming Lee',
      department: 'Operations',
      manager: 'Priya Nair',
      addedOn: '2026-10-01',
      leftOn: null,
    },
    {
      id: 'b0000000-0000-4000-8000-0000000000f3',
      name: 'Wei Ming Lee',
      department: 'Operations',
      manager: 'Priya Nair',
      addedOn: '2026-10-01',
      leftOn: null,
    },
  ],
  more: false,
})

// The request DPP-E10 logs, on its sheet once logged.
const LOGGED_CASE = CaseResponse.parse({
  today: CASE_DAY,
  case: {
    id: LOGGED_ID,
    reference: 'HJK5MNP6',
    kind: 'complaint',
    receivedKind: 'complaint',
    cameBy: 'email',
    receivedOn: CASE_DAY,
    loggedOn: CASE_DAY,
    loggedBy: 'Ashton Teo',
    requester: { type: 'outside', name: 'Lee Example', channel: 'email', contact: 'lee@mail.example' },
    details: 'They say the delivery notes showed their home address.',
    dueOn: '2026-11-26',
    repliedOn: null,
    repliedInTime: false,
    revision: 0,
    state: 'in_progress',
    identityChecked: false,
    reviewOpen: false,
    closedOn: null,
    closedKind: null,
    outcome: null,
    closedNote: null,
    closedBy: null,
  },
  steps: [],
  others: [],
  othersMore: false,
  reply: null,
})

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

// The Data protection track's five links at a size: each inside the viewport, at least 44 px, and the
// point at its centre is the link (PD-98: the track wraps to two rows at 320 px).
async function trackFits(page: Page): Promise<string[]> {
  const links = page.getByRole('navigation', { name: 'Data protection' }).getByRole('link')
  await expect(links).toHaveCount(5)
  return links.evaluateAll(elements =>
    elements.flatMap(element => {
      const box = element.getBoundingClientRect()
      const inside = box.left >= 0 && box.right <= innerWidth + 1 && box.width + 0.5 >= 44 && box.height + 0.5 >= 44
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      const reached = hit !== null && (hit === element || element.contains(hit))
      return inside && reached ? [] : [`${(element.textContent ?? '').trim()}: inside ${inside}, reached ${reached}`]
    }),
  )
}

test('DPP-E9 OD-14 OD-22 OD-24 PD-98 PD-99 PD-105 PPL-02 PPL-05 PPL-12: with a count of 2, the avatar button and Data protection say so in words and Data protection opens the queue, whose Requests link says it too; before the notice is acknowledged it opens the processing register and the queue reads nothing; the cards come soonest due first with their references; a withdrawal’s sheet opens without changing the URL, with its reply to copy; a step refused for the PIN is sent once more after it; closing the sheet returns focus to its card; the queue and the sheet pass axe at 320, 390 and 1440 px in both schemes, with no AI copy, 44 px targets, 16 px inputs and nothing sideways, and the five links fit at 320 × 568 and 768 × 480', async ({
  open,
  guard,
}, testInfo) => {
  test.setTimeout(240_000)
  guard.expectResponses([...PIN_ASKED('/api/admin/registers'), { path: '/api/admin/requests/step', status: 403 }])
  // The session answer is the api's, with a count of 2 and, for the second part, a standing before v0.
  let standing: 'acknowledged' | 'unpublished' = 'acknowledged'
  const sessionCount = async (page: Page) =>
    page.route('**/api/session', async route => {
      const response = await route.fetch()
      const answer = (await response.json()) as Record<string, unknown>
      return route.fulfill({
        response,
        json: { ...answer, requests: 2, notice: standing === 'unpublished' ? 'unpublished' : answer.notice },
      })
    })
  const page = await open({ ...SIZES.w390, signedIn: ASHTON })
  await sessionCount(page)
  let stepped = 0
  const steps: AddCaseStepJSON[] = []
  await page.route('**/api/admin/requests', route =>
    route.request().method() === 'GET' ? route.fulfill(json(QUEUE)) : route.fallback(),
  )
  await page.route(`**/api/admin/requests/${WITHDRAWAL_ID}`, route => route.fulfill(json(withdrawalCase(stepped))))
  await page.route('**/api/admin/requests/step', route => {
    steps.push(route.request().postDataJSON() as AddCaseStepJSON)
    if (steps.length === 1) {
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'reauth_required', message: REAUTH_METHOD_MESSAGES.pin.required, method: 'pin' }),
      })
    }
    stepped = 1
    return route.fulfill(json({ revision: 1 }))
  })
  // What NFR-02 and decision 8 ask of the page or sheet as it stands, at each size and scheme.
  const checked = async (what: string, sizes = CHECK_SIZES) => {
    for (const size of sizes) {
      await page.setViewportSize(size)
      for (const scheme of SCHEMES) {
        await page.emulateMedia({ colorScheme: scheme })
        await expectAxeClean(page, `${what} at ${size.width} ${scheme}`, testInfo)
      }
      const label = `${what} at ${size.width}`
      expect(await noAiCopy(page), label).toEqual([])
      expect(await targets44(page), label).toEqual([])
      expect(await inputs16(page), label).toEqual([])
    }
    await page.setViewportSize(SIZES.w320)
    expect(await noSidewaysScroll(page), `${what} at 320`).toEqual([])
    await page.setViewportSize(SIZES.w390)
    await page.emulateMedia({ colorScheme: 'light' })
  }

  await page.goto('/chats')
  await expect(h1(page)).toHaveText('Chats')
  // The seed's display name for Ashton, then the count in words (PPL-05).
  const account = page.getByRole('button', { name: /^Account, Ashton[^,]*, 2 requests need attention$/ })
  await expect(account).toBeVisible()
  await account.click()
  const dataProtection = accountMenu(page).getByRole('menuitem', {
    name: 'Data protection, 2 requests need attention',
    exact: true,
  })
  await expect(dataProtection).toContainText('2')
  await dataProtection.click()
  await expect(page).toHaveURL(/\/dpo\/requests$/)
  await expect(h1(page)).toHaveText('Requests')
  const track = page.getByRole('navigation', { name: 'Data protection' })
  await expect(track.getByRole('link', { name: 'Requests, 2 need attention', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )

  // The open cards, soonest due first, each with its reference; the overdue one says so in words.
  const openList = page.getByRole('region', { name: 'Open requests (2)' })
  const cards = openList.getByRole('button')
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0)).toContainText('BC2D-FG3H')
  await expect(cards.nth(0)).toContainText('Overdue since Sat 31 Oct 2026')
  await expect(cards.nth(1)).toContainText('K7QM-X3TD')
  await expect(cards.nth(1)).toContainText('Rachel Goh, Commercial')
  await checked('/dpo/requests')
  for (const size of [SIZES.w320, SIZES.short]) {
    await page.setViewportSize(size)
    expect(await trackFits(page), `the links at ${size.width} × ${size.height}`).toEqual([])
  }
  await page.setViewportSize(SIZES.w390)

  // Rachel's withdrawal: a sheet held in the page's state, so the URL stays as it was.
  const card = cards.nth(1)
  await card.click()
  const sheet = page.getByRole('dialog', { name: 'Withdrawal · K7QM-X3TD' })
  await expect(sheet).toBeVisible()
  await expect(page).toHaveURL(/\/dpo\/requests$/)
  await expect(sheet.getByRole('heading', { level: 2, name: 'Withdrawal · K7QM-X3TD' })).toBeFocused()
  await expect(sheet.getByText('I no longer want my photo shown on the team page.', { exact: true })).toBeVisible()
  await expect(sheet.getByText('No steps yet.', { exact: true })).toBeVisible()
  await expect(sheet.getByRole('heading', { level: 3, name: 'A reply you can copy' })).toBeVisible()
  await expect(sheet.getByText(/^Your reference: K7QM-X3TD/)).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Copy', exact: true })).toBeVisible()
  await checked('the case sheet')

  // A step, refused for a fresh re-authentication: the PIN step in the sheet, then the same step once
  // more.
  await sheet.getByLabel('What happened', { exact: true }).selectOption('acknowledged')
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  const pin = sheet.getByLabel('Your PIN', { exact: true })
  await expect(pin).toBeVisible()
  const confirmed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/reauth/pin')
  await pin.fill(E2E_PIN)
  await pin.press('Enter')
  expect((await confirmed).status()).toBe(200)
  await expect(toasts(page).getByText('Step saved.', { exact: true })).toBeVisible()
  const body = {
    case: WITHDRAWAL_ID,
    seen: 0,
    step: 'acknowledged',
    onDay: CASE_DAY,
    note: null,
    extendedTo: null,
    kind: null,
    outcome: null,
  }
  expect(steps).toEqual([body, body])
  await expect(sheet.getByRole('listitem').filter({ hasText: 'Told them it was received' })).toBeVisible()

  // Done closes it, and focus is back on the card that opened it.
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(card).toBeFocused()

  // Before the notice is acknowledged (v0 unpublished, the DPO's setup), Data protection opens the
  // processing register, and the Requests link's page says what opens the requests, sending nothing
  // to the queue (PPL-02).
  standing = 'unpublished'
  const before = await open({ ...SIZES.w390, signedIn: ASHTON })
  await sessionCount(before)
  const asked: string[] = []
  before.on('request', request => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/api/admin/requests')) asked.push(path)
  })
  await before.goto('/dpo/purposes')
  await confirmPinIfAsked(before, firstPurpose(before))
  await before.getByRole('button', { name: /^Account, Ashton/ }).click()
  await accountMenu(before)
    .getByRole('menuitem', { name: /^Data protection/ })
    .click()
  await expect(before).toHaveURL(/\/dpo\/purposes$/)
  await before
    .getByRole('navigation', { name: 'Data protection' })
    .getByRole('link', { name: /^Requests/ })
    .click()
  await expect(before).toHaveURL(/\/dpo\/requests$/)
  await expect(
    before.getByText('Requests open once the notice is published and you’ve acknowledged it.', { exact: true }),
  ).toBeVisible()
  await expect(before.getByRole('link', { name: 'Open the Notice tab', exact: true })).toHaveAttribute(
    'href',
    '/dpo/notice',
  )
  expect(asked).toEqual([])
})

test('DPP-E10 OD-08 OD-16 PD-89 PD-94 PPL-01 PPL-13 PPL-14: Log a request lists the people, a leaver’s How to reach them holding Log it back until a channel is given, two who read the same held back with the line saying what to do; someone without a Hearth account with an ID-shaped name is held back, then a made-up name and address are logged and the new request’s sheet opens with its reference; on the contact page, reply targets of 4 business days are held back and 7 are saved; the dialogs pass axe at 320 and 390 px in both schemes, with 44 px targets, 16 px inputs and nothing sideways', async ({
  open,
}, testInfo) => {
  test.setTimeout(200_000)
  const page = await open({ ...SIZES.w390, signedIn: ASHTON })
  const logged: LogRequestJSON[] = []
  await page.route('**/api/admin/requests', route =>
    route.request().method() === 'GET'
      ? route.fulfill(json({ ...QUEUE, open: [], openTotal: 0, closed: [], closedMore: false }))
      : route.fallback(),
  )
  await page.route('**/api/admin/requests/people', route => route.fulfill(json(CASE_PEOPLE)))
  await page.route('**/api/admin/requests/log', route => {
    logged.push(route.request().postDataJSON() as LogRequestJSON)
    return route.fulfill(
      json(LogRequestResponse.parse({ case: LOGGED_ID, reference: 'HJK5MNP6', dueOn: '2026-11-26', changed: true })),
    )
  })
  await page.route(`**/api/admin/requests/${LOGGED_ID}`, route => route.fulfill(json(LOGGED_CASE)))
  const dialogChecked = async (what: string) => {
    for (const size of [SIZES.w320, SIZES.w390]) {
      await page.setViewportSize(size)
      for (const scheme of SCHEMES) {
        await page.emulateMedia({ colorScheme: scheme })
        await expectAxeClean(page, `${what} at ${size.width} ${scheme}`, testInfo)
      }
      const label = `${what} at ${size.width}`
      expect(await targets44(page), label).toEqual([])
      expect(await inputs16(page), label).toEqual([])
      expect(await noSidewaysScroll(page), label).toEqual([])
      expect(await noAiCopy(page), label).toEqual([])
    }
    await page.setViewportSize(SIZES.w390)
    await page.emulateMedia({ colorScheme: 'light' })
  }

  await page.goto('/dpo/requests')
  await expect(page.getByText('No open requests.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Log a request', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Log a request' })
  await expect(dialog).toBeVisible()
  const field = (label: string) => dialog.getByLabel(label, { exact: true })
  const logIt = dialog.getByRole('button', { name: 'Log it', exact: true })
  await field('What it’s about').selectOption('complaint')
  await field('How it came').selectOption('email')
  await field('What they want').fill('They say the delivery notes showed their home address.')
  // A leaver: How to reach them is required (PPL-01).
  await field('Who').selectOption(LEAVER_ID)
  await expect(dialog.getByText('They’ve left, so give the channel they wrote from.').first()).toBeVisible()
  await expect(logIt).toHaveAttribute('aria-disabled', 'true')
  await dialog.getByRole('radio', { name: 'Email', exact: true }).check()
  await field('Email address, phone number or postal address').fill('siti@mail.example')
  await expect(dialog.getByText('Before you can log it', { exact: true })).toHaveCount(0)
  await expect(logIt).not.toHaveAttribute('aria-disabled')
  // Two who read the same can't be picked (PPL-13).
  const alike = (await field('Who').locator('option').allInnerTexts()).filter(text => text.startsWith('Wei Ming Lee'))
  expect(alike).toHaveLength(2)
  expect(alike[0]).toBe(alike[1])
  await field('Who').selectOption('b0000000-0000-4000-8000-0000000000f2')
  await expect(
    dialog
      .getByText(
        'Two people here have the same name, department and manager, and were added on the same day, so neither can be picked. Log it as someone without a Hearth account, with how to reach them, and keep who it is in your files.',
      )
      .first(),
  ).toBeVisible()
  await expect(logIt).toHaveAttribute('aria-disabled', 'true')
  // No identity field: it is a step on the logged request (PPL-14).
  await expect(dialog.getByLabel('How you checked who they are')).toHaveCount(0)
  await expect(
    dialog.getByText('Record how you checked who they are on the request once it’s logged.', { exact: true }),
  ).toBeVisible()
  await dialogChecked('the log dialog')

  // Someone without a Hearth account: an ID-shaped name is held back on the page.
  await dialog.getByRole('radio', { name: 'Someone without a Hearth account', exact: true }).check()
  await field('Their name').fill('S1234567D')
  await dialog.getByRole('radio', { name: 'Email', exact: true }).check()
  await field('Email address, phone number or postal address').fill('lee@mail.example')
  await expect(dialog.getByText('Leave the ID number out of their name.').first()).toBeVisible()
  await expect(logIt).toHaveAttribute('aria-disabled', 'true')
  await field('Their name').fill('Lee Example')
  await expect(logIt).not.toHaveAttribute('aria-disabled')
  await logIt.click()
  await expect(dialog).toBeHidden()
  expect(logged).toHaveLength(1)
  expect(logged[0]).toMatchObject({
    kind: 'complaint',
    cameBy: 'email',
    requester: { type: 'outside', name: 'Lee Example', channel: 'email', contact: 'lee@mail.example' },
    details: 'They say the delivery notes showed their home address.',
  })
  expect(logged[0]?.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  const sheet = page.getByRole('dialog', { name: 'Complaint · HJK5-MNP6' })
  await expect(sheet).toBeVisible()
  await expect(
    sheet.getByText('Logged as HJK5-MNP6. Give them this reference when you reply.', { exact: true }),
  ).toBeVisible()
  await expect(sheet.getByText('lee@mail.example', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(sheet).toBeHidden()

  // The reply targets on the contact page (PD-94): read and saved through the test's answers.
  let targets = { businessDays: 10, calendarDays: 30 }
  const sent: SetTargetsJSON[] = []
  const contactAnswer = () =>
    ContactAdminResponse.parse({
      notice: 'up_to_date',
      contact: {
        version: sent.length + 1,
        title: 'Data Protection Officer',
        email: 'dpo@tembusu.example',
        phone: null,
        postal: null,
        recordedOn: CASE_DAY,
        recordedBy: 'Ashton Teo',
      },
      stated: 'stated',
      targets,
      targetsStated: sent.length === 0 ? 'stated' : 'not_stated',
    })
  await page.route('**/api/admin/notice/contact', route => route.fulfill(json(contactAnswer())))
  await page.route('**/api/admin/notice/targets/set', route => {
    const body = route.request().postDataJSON() as SetTargetsJSON
    sent.push(body)
    targets = { businessDays: body.businessDays, calendarDays: body.calendarDays }
    return route.fulfill(json({ version: 2, changed: true }))
  })
  await page.goto('/dpo/contact')
  const card = page.getByRole('region', { name: 'Reply targets' })
  await expect(card.getByText('Questions, complaints, withdrawals and objections: 10 business days')).toBeVisible()
  await expect(card.getByText('In the published notice', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Change reply targets', exact: true }).click()
  const change = page.getByRole('dialog', { name: 'Change your reply targets' })
  const business = change.getByLabel('Business days for questions, complaints, withdrawals and objections', {
    exact: true,
  })
  const save = change.getByRole('button', { name: 'Save', exact: true })
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await business.fill('4')
  await expect(change.getByText('Choose from 5 to 10 business days.', { exact: true })).toBeVisible()
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await expect(
    change.getByText(
      'Once you save, the published notice is out of date. Everyone acknowledges the next version you publish.',
    ),
  ).toBeVisible()
  await dialogChecked('the reply targets dialog')
  await business.fill('7')
  await expect(save).not.toHaveAttribute('aria-disabled')
  await save.click()
  await expect(change).toBeHidden()
  expect(sent).toEqual([{ seen: 1, businessDays: 7, calendarDays: 30 }])
  await expect(toasts(page).getByText('Reply targets saved.', { exact: true })).toBeVisible()
  await expect(card.getByText('Questions, complaints, withdrawals and objections: 7 business days')).toBeVisible()
  await expect(card.getByText('The published notice still gives your earlier targets.', { exact: true })).toBeVisible()
})

test('DPP-E4 PD-20 PD-49 PD-70 PD-98 PDPA-13 OD-14 B-09 PPL-06: someone who isn’t the DPO (Marcus) has Settings and Sign out but no Data protection entry, no count and no link to the requests, and his deep links to the requests, a register, the contact page and the Notice tab are refused by the api and say the page is the DPO’s, with no Data protection links', async ({
  open,
  guard,
}) => {
  guard.expectResponses([
    { path: '/api/admin/requests', status: 403 },
    { path: '/api/admin/registers', status: 403 },
    { path: '/api/admin/notice/contact', status: 403 },
    { path: '/api/admin/notice', status: 403 },
  ])
  const page = await open({ ...SIZES.w390, signedIn: true })
  await page.goto('/chats')
  await expect(h1(page)).toHaveText('Chats')
  // His button carries no count (OD-14, PD-99).
  await page.getByRole('button', { name: 'Account, Marcus', exact: true }).click()
  const items = accountMenu(page).getByRole('menuitem')
  expect((await items.allInnerTexts()).map(name => name.trim())).toEqual(['Settings', 'Sign out'])
  await page.keyboard.press('Escape')
  // Nothing anywhere offers him the requests (OD-14).
  await expect(page.locator('a[href="/dpo/requests"]')).toHaveCount(0)

  // The requests are the DPO's alone (OD-14): the queue's read is refused.
  const requestsRefusal = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/requests')
  await page.goto('/dpo/requests')
  expect((await requestsRefusal).status()).toBe(403)
  await expect(h1(page)).toHaveText('Requests')
  await expect(
    page.getByRole('heading', { level: 2, name: 'This page is for the Data Protection Officer.' }),
  ).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Data protection' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Log a request' })).toHaveCount(0)
  await expect(page.locator('a[href="/dpo/requests"]')).toHaveCount(0)

  const refusal = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/registers')
  await page.goto('/dpo/transfers')
  expect((await refusal).status()).toBe(403)
  await expect(h1(page)).toHaveText('Transfer register')
  await expect(
    page.getByRole('heading', { level: 2, name: 'This page is for the Data Protection Officer.' }),
  ).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Data protection' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0)

  // The contact page is the DPO's alone (PD-70): reading it is notice.read's.
  const contactRefusal = page.waitForResponse(
    response => new URL(response.url()).pathname === '/api/admin/notice/contact',
  )
  await page.goto('/dpo/contact')
  expect((await contactRefusal).status()).toBe(403)
  await expect(h1(page)).toHaveText('Contact details')
  await expect(
    page.getByRole('heading', { level: 2, name: 'This page is for the Data Protection Officer.' }),
  ).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Data protection' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Record contact details' })).toHaveCount(0)

  // The Notice tab is the DPO's alone too (PD-49).
  const noticeRefusal = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/notice')
  await page.goto('/dpo/notice')
  expect((await noticeRefusal).status()).toBe(403)
  await expect(h1(page)).toHaveText('Publish the notice')
  await expect(
    page.getByRole('heading', { level: 2, name: 'This page is for the Data Protection Officer.' }),
  ).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Data protection' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Publish / })).toHaveCount(0)
})
