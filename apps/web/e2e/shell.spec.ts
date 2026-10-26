// The signed-in shell (BUILD-PLAN C0.8, T21 item 11): its navigation at every size,
// real URLs, the not-found and error screens inside the frame, the avatar menu, one h1 per screen,
// no AI copy and no Search bar, and the boot's scroll-cache wipe on the built bundle. Signed in as
// the project's persona (Marcus in Chromium; Farah and Daniel for the @smoke cases in WebKit and
// Firefox).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MyRequestsResponse, mailtoHref, NoticeResponse, SendRequestResponse, telHref } from '@hearth/shared'
import type { Page } from '@playwright/test'
import { SETTINGS } from '../src/strings/notice.ts'
import { REQUESTS } from '../src/strings/requests.ts'
import { expectAxeClean } from './support/axe.ts'
import { inputs16, noAiCopy, noSidewaysScroll, targets44, visibleH1s } from './support/checks.ts'
import { REPO_DIR } from './support/env.ts'
import { expect, type Guard, test } from './support/fixtures.ts'
import { CONTACT_PHONE, PERSONAS } from './support/personas.ts'
import { CHECK_SIZES, hasRail, SCHEMES, SCREENS, SIZES } from './support/viewports.ts'

const TABS = ['Today', 'Chats', 'Rooms', 'Tasks', 'More']
const RAIL = ['Today', 'Chats', 'Rooms', 'Tasks', 'Calendar', 'Drive']

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' })
const h1 = (page: Page) => page.getByRole('heading', { level: 1 })

// The names of the shown Main navigation's links, in order.
const navNames = (page: Page) => mainNav(page).getByRole('link').allInnerTexts()

// The page's start time, which a new document changes.
const timeOrigin = (page: Page) => page.evaluate(() => performance.timeOrigin)

// What the libraries themselves put on window in the browser, never the app (SH-10): TanStack
// Router's router (router-core's router.js, for its devtools) and zod's global config and registry
// (zod/v4/core). Sorted.
const LIBRARY_GLOBALS = ['__TSR_ROUTER__', '__zod_globalConfig', '__zod_globalRegistry']

// The built More screen's chunk.
const MORE_CHUNK = /\/assets\/MoreScreen-[^/]+\.js$/

// What a screen whose chunk fails to load logs, besides the failed request: the browser's own line,
// and, on the first failure, the router's error for the module the preload helper hands back empty
// while preBoot()'s reload for a gone deploy is under way (main.ts, T21 item 2): the page is
// replaced a moment later, and the reload is what the person sees.
function allowMissingChunk(guard: Guard): void {
  guard.allowFailedRequest(MORE_CHUNK)
  guard.allowConsole(/Failed to fetch dynamically imported module|error loading dynamically imported module/i)
  guard.allowConsole(/Cannot read properties of undefined \(reading 'MoreScreen'\)/)
}

test('SH-01 OD-02: under the rail breakpoint, five tabs in the bottom quarter with aria-current; at 1440 the rail six entries', {
  tag: '@smoke',
}, async ({ open }) => {
  const phone = await open({ ...SIZES.w390, signedIn: true, phone: true })
  await phone.goto('/chats')
  await expect(h1(phone)).toHaveText('Chats')
  expect((await navNames(phone)).map(name => name.trim())).toEqual(TABS)
  const box = await mainNav(phone).boundingBox()
  expect(box?.y ?? 0).toBeGreaterThanOrEqual(SIZES.w390.height * 0.75)
  await expect(mainNav(phone).getByRole('link', { name: 'Chats' })).toHaveAttribute('aria-current', 'page')
  await expect(mainNav(phone).locator('[aria-current]')).toHaveCount(1)

  const desktop = await open({ ...SIZES.desktop, signedIn: true })
  await desktop.goto('/chats')
  await expect(h1(desktop)).toHaveText('Chats')
  expect((await navNames(desktop)).map(name => name.trim())).toEqual(RAIL)
  await expect(mainNav(desktop).getByRole('link', { name: 'Chats' })).toHaveAttribute('aria-current', 'page')
})

test('SH-02 T21 item 5: 767 × 1024 tabs, 768 × 1024 rail, 1440 × 900 rail, 667 × 375 (a phone on its side) tabs', async ({
  page,
}) => {
  await page.goto('/today')
  await expect(h1(page)).toHaveText('Today')
  for (const size of [{ width: 767, height: 1024 }, SIZES.tablet, SIZES.desktop, SIZES.landscape]) {
    await page.setViewportSize(size)
    const names = (await navNames(page)).map(name => name.trim())
    expect(names, `${size.width} × ${size.height}`).toEqual(hasRail(size) ? RAIL : TABS)
    await expect(mainNav(page)).toHaveCount(1)
  }
})

test('SH-03 X12: every tab is a real URL; a deep link to /drive opens Drive; Back and Forward move between screens', async ({
  open,
}) => {
  const page = await open({ ...SIZES.w390, signedIn: true, phone: true })
  await page.goto('/drive')
  await expect(h1(page)).toHaveText('Drive')
  for (const [name, path] of [
    ['Today', '/today'],
    ['Chats', '/chats'],
    ['Rooms', '/rooms'],
    ['Tasks', '/tasks'],
    ['More', '/more'],
  ] as const) {
    await expect(mainNav(page).getByRole('link', { name })).toHaveAttribute('href', path)
  }
  await mainNav(page).getByRole('link', { name: 'Rooms' }).click()
  await expect(page).toHaveURL(/\/rooms$/)
  await expect(h1(page)).toHaveText('Rooms')
  await page.goBack()
  await expect(page).toHaveURL(/\/drive$/)
  await expect(h1(page)).toHaveText('Drive')
  await page.goForward()
  await expect(page).toHaveURL(/\/rooms$/)
  await expect(h1(page)).toHaveText('Rooms')
})

test('SH-04 OD-02: More lists Calendar and Drive on phones, and opening Calendar marks More current', async ({
  open,
}) => {
  const page = await open({ ...SIZES.w320, signedIn: true, phone: true })
  await page.goto('/more')
  await expect(h1(page)).toHaveText('More')
  const list = page.locator('#screen').getByRole('link')
  expect((await list.allInnerTexts()).map(name => name.trim())).toEqual(['Calendar', 'Drive'])
  await page.locator('#screen').getByRole('link', { name: 'Calendar' }).click()
  await expect(h1(page)).toHaveText('Calendar')
  // More holds the page, but isn't it: "true", never "page" (WCAG 4.1.2).
  await expect(mainNav(page).getByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'true')
  await expect(mainNav(page).locator('[aria-current]')).toHaveCount(1)
})

test('SH-05 OD-03: / lands on /chats', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/chats$/)
  await expect(h1(page)).toHaveText('Chats')
})

test('SH-06 T21 item 5: /xyz and /chats/abc show Page not found inside the shell (one h1, the tab bar or rail present) with a way to Chats', async ({
  open,
}) => {
  for (const size of [SIZES.w390, SIZES.desktop]) {
    const page = await open({ ...size, signedIn: true })
    for (const path of ['/xyz', '/chats/abc']) {
      await page.goto(path)
      await expect(h1(page)).toHaveText('Page not found')
      expect(await visibleH1s(page)).toEqual(['Page not found'])
      await expect(mainNav(page)).toHaveCount(1)
      // No entry claims a page that isn't its own.
      await expect(mainNav(page).locator('[aria-current]')).toHaveCount(0)
    }
    await page.locator('#screen').getByRole('link', { name: 'Go to Chats' }).click()
    await expect(page).toHaveURL(/\/chats$/)
    await expect(h1(page)).toHaveText('Chats')
  }
})

test('SH-07 OD-04 decision 8: no searchbox in the shell and no AI copy on any screen', async ({ open }) => {
  for (const size of [SIZES.w390, SIZES.desktop]) {
    const page = await open({ ...size, signedIn: true })
    for (const screen of SCREENS) {
      await page.goto(screen.path)
      await expect(h1(page)).toHaveText(screen.title)
      await expect(page.getByRole('searchbox')).toHaveCount(0)
      await expect(page.getByRole('search')).toHaveCount(0)
      expect(await noAiCopy(page), `${screen.path} at ${size.width}`).toEqual([])
    }
    // The avatar menu's items too.
    await page.getByRole('button', { name: /^Account, / }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    expect(await noAiCopy(page), `the avatar menu at ${size.width}`).toEqual([])
  }
})

test('SH-08 OD-05 WCAG 2.4.11 C0.9 PD-47 B-09: the avatar menu holds Settings and Sign out, and at 320 × 568, 768 × 480 (rail) and 1440 × 900 every item lies inside the viewport, and the point at its centre is the item', async ({
  open,
}) => {
  for (const size of [SIZES.w320, SIZES.short, SIZES.desktop]) {
    const page = await open({ ...size, signedIn: true })
    await page.goto('/chats')
    await expect(h1(page)).toHaveText('Chats')
    const trigger = page.getByRole('button', { name: 'Account, Marcus' })
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const items = page.getByRole('menu', { name: 'Account' }).getByRole('menuitem')
    expect((await items.allInnerTexts()).map(name => name.trim())).toEqual(['Settings', 'Sign out'])
    const placed = await items.evaluateAll(elements =>
      elements.map(element => {
        const box = element.getBoundingClientRect()
        const inside = box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight && box.right <= innerWidth
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        return { inside, reached: hit !== null && (hit === element || element.contains(hit)) }
      }),
    )
    expect(placed, `${size.width} × ${size.height}`).toEqual([
      { inside: true, reached: true },
      { inside: true, reached: true },
    ])
    await page.keyboard.press('Escape')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger).toBeFocused()
  }
})

test('SH-09 D-08 X16: exactly one visible h1 on every screen at 320, 390 and 1440, naming the screen', async ({
  open,
}) => {
  for (const size of [SIZES.w320, SIZES.w390, SIZES.desktop]) {
    const page = await open({ ...size, signedIn: true })
    for (const screen of SCREENS) {
      await page.goto(screen.path)
      await expect(h1(page)).toHaveText(screen.title)
      expect(await visibleH1s(page), `${screen.path} at ${size.width}`).toEqual([screen.title])
      await expect(page).toHaveTitle(`${screen.title} – Hearth`)
    }
  }
})

test('SH-10 SHL-26: no window.__hearth, and nothing else the app hangs on window for tests', async ({ page }) => {
  await page.goto('/chats')
  await expect(h1(page)).toHaveText('Chats')
  // The booted page's globals against a blank document's of the same origin in the same browser
  // (an iframe with no src, which inherits the page's origin), so the browser's own are left out,
  // whatever it exposes. Only the libraries' own may be added.
  const added = await page.evaluate(() => {
    const own = Object.keys(window)
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const blank = new Set(Object.keys(frame.contentWindow ?? {}))
    frame.remove()
    return own.filter(name => !blank.has(name))
  })
  expect(added.sort()).toEqual(LIBRARY_GLOBALS)
})

test("SH-11 T21 item 5: a failed session check shows Can't reach Hearth, and Try again recovers", async ({
  page,
  guard,
}) => {
  guard.expectResponses([{ path: '/api/session', status: 503 }])
  let failed = false
  await page.route('**/api/session', async route => {
    if (failed) return route.continue()
    failed = true
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'unavailable', message: "That isn't available right now." }),
    })
  })
  await page.goto('/chats')
  await expect(h1(page)).toHaveText("Can't reach Hearth")
  await expect(mainNav(page)).toHaveCount(0)
  const before = await timeOrigin(page)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(h1(page)).toHaveText('Chats')
  expect(await timeOrigin(page)).not.toBe(before)
})

test('SH-12 D-02 T21 item 2: on the built bundle, a foreign scroll cache seeded before every load is gone after boot, and the router then writes its own with no trace of it', async ({
  open,
}) => {
  const page = await open({ ...SIZES.w390, signedIn: true })
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'tsr-scroll-restoration-v1_3',
      JSON.stringify({ '/foreign-xyz': { window: { scrollX: 0, scrollY: 120 } } }),
    )
  })
  await page.goto('/chats')
  await expect(h1(page)).toHaveText('Chats')
  const cache = () =>
    page.evaluate(() =>
      Object.fromEntries(
        Object.keys(sessionStorage)
          .filter(key => key.startsWith('tsr-scroll-restoration'))
          .map(key => [key, sessionStorage.getItem(key)]),
      ),
    )
  // The boot removed it before the router loaded.
  expect(JSON.stringify(await cache())).not.toContain('foreign-xyz')
  // The router writes its whole cache on pagehide: the foreign entry is in none of it, and the key
  // name still matches what the boot removes.
  await mainNav(page).getByRole('link', { name: 'Tasks' }).click()
  await expect(h1(page)).toHaveText('Tasks')
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
  const written = await cache()
  expect(Object.keys(written).length).toBeGreaterThanOrEqual(1)
  expect(JSON.stringify(written)).not.toContain('foreign-xyz')
})

test('SH-13 T21 items 2 and 5: a screen whose code failed to load is recovered by Try again in a new document', async ({
  open,
  guard,
}) => {
  allowMissingChunk(guard)
  const page = await open({ ...SIZES.w390, signedIn: true, phone: true })
  await page.route(MORE_CHUNK, route => route.abort())
  await page.goto('/more')
  await expect(page.getByRole('heading', { level: 2, name: 'Something went wrong' })).toBeVisible({ timeout: 15_000 })
  await expect(h1(page)).toHaveText('More')
  await expect(mainNav(page)).toHaveCount(1)
  await page.unroute(MORE_CHUNK)
  const before = await timeOrigin(page)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('#screen').getByRole('link', { name: 'Calendar' })).toBeVisible()
  await expect(page.locator('#screen').getByRole('link', { name: 'Drive' })).toBeVisible()
  expect(await timeOrigin(page)).not.toBe(before)
})

test('SH-14 X11 WCAG 4.1.3: a screen that fails inside the shell is announced, with focus on its h1', async ({
  open,
  guard,
}) => {
  allowMissingChunk(guard)
  const page = await open({ ...SIZES.w390, signedIn: true, phone: true })
  await page.route(MORE_CHUNK, route => route.abort())
  await page.goto('/more')
  await expect(page.getByRole('heading', { level: 2, name: 'Something went wrong' })).toBeVisible({ timeout: 15_000 })
  await page.locator('#screen').getByRole('link', { name: 'Go to Chats' }).click()
  await expect(h1(page)).toHaveText('Chats')
  await mainNav(page).getByRole('link', { name: 'More' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Something went wrong' })).toBeVisible()
  await expect(h1(page)).toHaveText('More')
  await expect(h1(page)).toBeFocused()
  await expect(page.locator('[aria-live="assertive"]')).toHaveText(/Something went wrong/)
})

// A contact a published version printed (C0.9 PD-69), made up: a long mailbox on a reserved domain,
// a business line no one in the seed or the personas holds, and a postal address of three lines.
const PLANTED_CONTACT = {
  title: 'Data Protection Officer',
  email: 'data-protection-officer@tembusu-holdings.example',
  phone: CONTACT_PHONE,
  postal: '1 Example Road\nUnit 01-01\nSingapore 000000',
}

// The seed's phone numbers, as db/seed/tembusu.sql makes them: a persona's prefix and each suffix
// of its phone_numbers insert.
function seedNumbers(): string[] {
  const seed = readFileSync(resolve(REPO_DIR, 'db/seed/tembusu.sql'), 'utf8')
  const insert = seed.slice(seed.indexOf('insert into public.phone_numbers'))
  const suffixes = /unnest\(array\[([^\]]*)\]\)/.exec(insert)?.[1]?.match(/\d+/g) ?? []
  const prefix = PERSONAS.marcus.e164.slice(0, -2)
  return suffixes.map(suffix => `${prefix}${suffix}`)
}

test('NTE-01 PDPA-02 PDPA-03 PDPA-13 C0.9 PD-47 OD-12 PD-69: Settings, from the avatar menu, lists Privacy; Privacy says first how to reach the Data Protection Officer (the seed’s notice gives no contact yet), then the current notice, when Marcus acknowledged it and his acknowledgements; with a contact the notice printed, its email address and phone number are links; at 320 and 1440 px with nothing sideways, 44 px targets and no AI copy', async ({
  open,
}) => {
  // The planted number is no one's: not a persona's, and not one the seed holds.
  const e164 = CONTACT_PHONE.replace(/[ -]/g, '')
  expect(Object.values(PERSONAS).map(persona => persona.e164)).not.toContain(e164)
  expect(seedNumbers().length).toBeGreaterThan(0)
  expect(seedNumbers()).not.toContain(e164)
  for (const size of [SIZES.w320, SIZES.desktop]) {
    const page = await open({ ...size, signedIn: true })
    await page.goto('/chats')
    await expect(h1(page)).toHaveText('Chats')
    await page.getByRole('button', { name: 'Account, Marcus' }).click()
    await page.getByRole('menu', { name: 'Account' }).getByRole('menuitem', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(h1(page)).toHaveText('Settings')
    await expect(page).toHaveTitle('Settings – Hearth')
    const sections = page.getByRole('navigation', { name: SETTINGS.sections.label })
    await expect(sections.getByRole('link')).toHaveCount(1)
    // Privacy's line names the requests form, so someone looking for how to complain or get a copy
    // of their data knows to open it (C0.9 PR 3b, PPL-11).
    await expect(sections.getByRole('link', { name: /^Privacy/ })).toContainText(SETTINGS.sections.privacy)
    expect(SETTINGS.sections.privacy).toBe(
      'How to reach the Data Protection Officer, questions and requests, the privacy notice and your acknowledgements',
    )
    expect(await noSidewaysScroll(page), `/settings at ${size.width}`).toEqual([])
    expect(await targets44(page), `/settings at ${size.width}`).toEqual([])
    expect(await noAiCopy(page), `/settings at ${size.width}`).toEqual([])

    await sections.getByRole('link', { name: /^Privacy/ }).click()
    await expect(page).toHaveURL(/\/settings\/privacy$/)
    await expect(h1(page)).toHaveText('Privacy')
    const screen = page.locator('#screen')
    // How to reach the DPO comes first (OD-12): the seed's placeholder gives no contact.
    await expect(screen.getByRole('heading', { level: 2 }).first()).toHaveText(SETTINGS.privacy.contact.title)
    await expect(screen.getByText(SETTINGS.privacy.contact.none, { exact: true })).toBeVisible()
    await expect(screen.getByRole('heading', { level: 2, name: SETTINGS.privacy.noticeTitle })).toBeVisible()
    // The requests form and Marcus's own requests follow the contact (C0.9 PR 3b): the seed holds
    // none of his, read for real.
    await expect(screen.getByRole('heading', { level: 2, name: REQUESTS.title })).toBeVisible()
    await expect(screen.getByText(REQUESTS.mine.empty, { exact: true })).toBeVisible()
    // The seed's notice v0, which Marcus acknowledged in the app (db/seed/tembusu.sql).
    await expect(screen.getByText(/^Version 0 · published /)).toBeVisible()
    await expect(screen.getByText(/^You acknowledged version 0 on .+ \(in the app\)\.$/)).toBeVisible()
    await expect(screen.getByRole('heading', { level: 2, name: SETTINGS.privacy.historyTitle })).toBeVisible()
    await expect(screen.getByRole('listitem').filter({ hasText: /^Version 0, .+ \(in the app\)$/ })).toHaveCount(1)
    expect(await visibleH1s(page)).toEqual(['Privacy'])
    expect(await noSidewaysScroll(page), `/settings/privacy at ${size.width}`).toEqual([])
    expect(await targets44(page), `/settings/privacy at ${size.width}`).toEqual([])
    expect(await noAiCopy(page), `/settings/privacy at ${size.width}`).toEqual([])
    // Back returns to the list, a real URL each.
    await page.goBack()
    await expect(h1(page)).toHaveText('Settings')

    // A contact the latest version printed, planted in the real answer: the email address and the
    // phone number are links, at least 44 px, and the long address breaks rather than scrolling.
    await page.route('**/api/notice', async route => {
      if (route.request().method() !== 'GET') return route.fallback()
      const response = await route.fetch()
      const answer = NoticeResponse.parse(await response.json())
      return route.fulfill({ response, json: NoticeResponse.parse({ ...answer, contact: PLANTED_CONTACT }) })
    })
    await page.goto('/settings/privacy')
    await expect(screen.getByText(PLANTED_CONTACT.title, { exact: true })).toBeVisible()
    await expect(screen.getByRole('link', { name: PLANTED_CONTACT.email, exact: true })).toHaveAttribute(
      'href',
      mailtoHref(PLANTED_CONTACT.email),
    )
    await expect(screen.getByRole('link', { name: CONTACT_PHONE, exact: true })).toHaveAttribute(
      'href',
      telHref(CONTACT_PHONE),
    )
    await expect(screen.getByText('Singapore 000000')).toBeVisible()
    await expect(screen.getByText(SETTINGS.privacy.contact.leaving, { exact: true })).toBeVisible()
    expect(await noSidewaysScroll(page), `/settings/privacy with a contact at ${size.width}`).toEqual([])
    expect(await targets44(page), `/settings/privacy with a contact at ${size.width}`).toEqual([])
    expect(await noAiCopy(page), `/settings/privacy with a contact at ${size.width}`).toEqual([])
    await page.unroute('**/api/notice')
  }
})

// --- Questions and requests (C0.9 PR 3b) ----------------------------------------------------------

// Marcus's requests as the test answers GET /api/requests: a complaint the DPO replied to on time,
// and a copy of his data past its target day with no reply recorded. The org's day and every
// reference are fixed, so nothing here hangs on the clock; the words are made up.
const REQUESTS_DAY = '2026-11-12'
const SENT_ID = 'c0000000-0000-4000-8000-0000000000d3'
const myRequests = (sent: boolean) =>
  MyRequestsResponse.parse({
    today: REQUESTS_DAY,
    requests: [
      ...(sent
        ? [
            {
              id: SENT_ID,
              reference: 'HJK5MNP6',
              kind: 'complaint',
              cameBy: 'hearth',
              receivedOn: REQUESTS_DAY,
              state: 'received',
              dueOn: '2026-11-26',
              repliedOn: null,
              repliedInTime: false,
              closedOn: null,
            },
          ]
        : []),
      {
        id: 'c0000000-0000-4000-8000-0000000000d1',
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
        id: 'c0000000-0000-4000-8000-0000000000d2',
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
    ],
    more: false,
    open: sent ? 3 : 2,
  })

test('NTE-02 OD-07 OD-12 OD-15 PD-96 PD-97 PD-112: Settings › Privacy reads the contact, then Questions and requests, then Your requests, then the notice; the six kinds are 44 px rows at 390 and 320; A complaint opens a sheet with the published target and a 16 px box, Send held until something is written; a send whose answer is cut off keeps the words and says sending again won’t send twice; the confirmation gives the due day and the reference and stays until Done, which focuses the new row; Your requests shows a reply and a request past its target day with what to do; axe at 320, 390 and 1440 px in both schemes', async ({
  open,
  guard,
}, testInfo) => {
  test.setTimeout(180_000)
  guard.allowFailedRequest('/api/requests/send')
  const page = await open({ ...SIZES.w390, signedIn: true })
  let sent = false
  const sends: unknown[] = []
  await page.route('**/api/requests', route =>
    route.request().method() === 'GET' ? route.fulfill({ json: myRequests(sent) }) : route.fallback(),
  )
  // The first send's answer never arrives (the connection drops); the second, with the same key,
  // lands.
  await page.route('**/api/requests/send', route => {
    sends.push(route.request().postDataJSON())
    if (sends.length === 1) return route.abort('connectionreset')
    sent = true
    return route.fulfill({
      json: SendRequestResponse.parse({
        case: SENT_ID,
        reference: 'HJK5MNP6',
        receivedOn: REQUESTS_DAY,
        dueOn: '2026-11-26',
        changed: true,
      }),
    })
  })
  // The notice the seed published, as the api answers it, stating reply targets of 7 business days
  // and 21 calendar days, as a version from c09.3 would.
  await page.route('**/api/notice', async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    const response = await route.fetch()
    const answer = NoticeResponse.parse(await response.json())
    return route.fulfill({
      response,
      json: NoticeResponse.parse({ ...answer, targets: { businessDays: 7, calendarDays: 21 } }),
    })
  })
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

  await page.goto('/settings/privacy')
  await expect(h1(page)).toHaveText('Privacy')
  const screen = page.locator('#screen')
  await expect(screen.getByRole('heading', { level: 2 })).toHaveText([
    SETTINGS.privacy.contact.title,
    REQUESTS.title,
    REQUESTS.mine.title,
    SETTINGS.privacy.noticeTitle,
    SETTINGS.privacy.historyTitle,
  ])
  const form = screen.getByRole('region', { name: REQUESTS.title })
  await expect(form.getByRole('button')).toHaveText([
    'A question about my data',
    'A complaint',
    'A copy of my data',
    'Correct my data',
    'Withdraw consent',
    'Object to how my data is used',
  ])
  for (const size of [SIZES.w390, SIZES.w320]) {
    await page.setViewportSize(size)
    expect(await targets44(page), `the kinds at ${size.width}`).toEqual([])
  }
  await page.setViewportSize(SIZES.w390)

  // Your requests: the reply on time never reads as late; the copy past its day says what to do.
  const mine = screen.getByRole('region', { name: REQUESTS.mine.title })
  await expect(mine.getByText('The Data Protection Officer replied on Wed 4 Nov 2026.', { exact: true })).toBeVisible()
  await expect(mine.getByText('Past its target day (Sat 31 Oct 2026).', { exact: true })).toBeVisible()
  await expect(mine.getByText(REQUESTS.mine.lateHelp, { exact: true })).toBeVisible()
  await expect(mine.getByText(/^Past its target day/)).toHaveCount(1)
  await checked('/settings/privacy with requests')

  // A complaint's sheet: the published target, a 16 px box, Send held until something is written.
  await form.getByRole('button', { name: 'A complaint', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'A complaint' })
  await expect(sheet).toBeVisible()
  await expect(
    sheet.getByText('The Data Protection Officer aims to reply within 7 business days.', { exact: true }),
  ).toBeVisible()
  await expect(sheet.getByText(REQUESTS.reply, { exact: true })).toBeVisible()
  const box = sheet.getByLabel(REQUESTS.field, { exact: true })
  await expect(box).toHaveAttribute('dir', 'auto')
  const send = sheet.getByRole('button', { name: 'Send', exact: true })
  await expect(send).toHaveAttribute('aria-disabled', 'true')
  await box.fill('The delivery rota was shared with the wrong group.')
  await expect(send).not.toHaveAttribute('aria-disabled')
  await checked('the request sheet', [SIZES.w320, SIZES.w390])

  // The answer is cut off: the words stay, and the sheet says sending again won't send it twice.
  await send.click()
  await expect(sheet.getByText(REQUESTS.failed, { exact: true })).toBeVisible()
  await expect(box).toHaveValue('The delivery rota was shared with the wrong group.')
  // Again, with the same key: it lands, and the sheet's content is the confirmation.
  await send.click()
  await expect(sheet.getByText('Sent to the Data Protection Officer.', { exact: true })).toBeVisible()
  await expect(sheet.getByText('They aim to reply by Thu 26 Nov 2026.', { exact: true })).toBeVisible()
  await expect(
    sheet.getByText(/^Your reference is [B-Z2-9]{4}-[B-Z2-9]{4}\. Quote it if you write to them about this request\.$/),
  ).toBeVisible()
  expect(sends).toHaveLength(2)
  expect(sends[1]).toEqual(sends[0])
  expect(sends[0]).toMatchObject({ kind: 'complaint', details: 'The delivery rota was shared with the wrong group.' })
  // It stays until Done, which focuses the new row.
  await page.waitForTimeout(500)
  await expect(sheet.getByText('Sent to the Data Protection Officer.', { exact: true })).toBeVisible()
  await checked('the confirmation', [SIZES.w320, SIZES.w390, SIZES.desktop])
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(page.locator(`#request-${SENT_ID}`)).toBeFocused()
  await expect(page.locator(`#request-${SENT_ID}`)).toContainText(
    'Received Thu 12 Nov 2026 · Reply due Thu 26 Nov 2026',
  )
})
