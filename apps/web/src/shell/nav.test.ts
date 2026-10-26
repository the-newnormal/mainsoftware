import { type NoticeStanding, SessionResponseForClient } from '@hearth/shared'
import { describe, expect, it, vi } from 'vitest'
import { APP_PATHS, NAV_PATHS } from '@/router/paths.ts'
import type { SessionRuntime } from '@/session/runtime.ts'
import { aiCopyIn } from '@/strings/ai-copy.ts'
import {
  AVATAR_MENU,
  dpoItem,
  type MenuSession,
  menuItemsFor,
  requestsCount,
  settingsItem,
  signOutItem,
} from './avatar-menu.ts'
import { activeTab, currentOf, MORE_ENTRIES, NAV, RAIL, TABS } from './nav.ts'

// The toast the sign-out item raises when the sign-out fails, without the app's store.
const toasts = vi.hoisted(() => [] as unknown[])
vi.mock('@/ui/toast.ts', () => ({ toast: (input: unknown) => toasts.push(input) }))

describe('T21 OD-02: the navigation (shell/nav.ts)', () => {
  it('NV-01 OD-02 PRD §6.1 C0.9 PD-26: tabs Today, Chats, Rooms, Tasks, More in order; the rail Today, Chats, Rooms, Tasks, Calendar, Drive; More lists Calendar and Drive; every NAV_PATHS path is reachable from both layouts, and no navigation lists a path outside it', () => {
    expect(TABS.map(entry => entry.label)).toEqual(['Today', 'Chats', 'Rooms', 'Tasks', 'More'])
    expect(RAIL.map(entry => entry.label)).toEqual(['Today', 'Chats', 'Rooms', 'Tasks', 'Calendar', 'Drive'])
    expect(MORE_ENTRIES.map(entry => entry.label)).toEqual(['Calendar', 'Drive'])
    // Every entry is a navigation path (and so an app path), and every navigation path is reachable
    // from both layouts.
    for (const entry of Object.values(NAV)) {
      expect(NAV_PATHS as readonly string[], entry.id).toContain(entry.to)
      expect(APP_PATHS as readonly string[], entry.id).toContain(entry.to)
      expect(entry.to, entry.id).toBe(`/${entry.id}`)
    }
    const phone = new Set<string>([...TABS, ...MORE_ENTRIES].map(entry => entry.to))
    const rail = new Set<string>(RAIL.map(entry => entry.to))
    for (const path of NAV_PATHS) {
      expect(phone.has(path), path).toBe(true)
      if (path !== '/more') expect(rail.has(path), path).toBe(true)
    }
    // The app paths no navigation lists are Settings and the DPO's pages, which the avatar menu
    // opens (C0.9 PD-47; /dpo/contact from PR 3a, PD-70; /dpo/requests from PR 3b, PD-98).
    const unlisted = APP_PATHS.filter(path => !phone.has(path) && !rail.has(path))
    expect(unlisted).toEqual([
      '/settings',
      '/settings/privacy',
      '/dpo/requests',
      '/dpo/purposes',
      '/dpo/transfers',
      '/dpo/contact',
      '/dpo/notice',
    ])
  })

  it('NV-02 T21 item 5 PRD:128 Principle 3: no AI, Ask, assistant or agent entry or path', () => {
    for (const entry of Object.values(NAV)) {
      expect(aiCopyIn(entry.label), entry.id).toBeUndefined()
      expect(aiCopyIn(entry.to.replaceAll('/', ' ')), entry.id).toBeUndefined()
    }
    // By whole segment: "tasks" holds "ask" and is no AI path.
    const named = (path: string) =>
      path.split('/').some(segment => /^(?:ask|assistants?|agents?|ai|co-?pilots?)$/i.test(segment))
    expect(APP_PATHS.filter(named)).toEqual([])
    expect(['/ask', '/agents', '/ai/x'].every(named)).toBe(true)
  })

  it('NV-03 T21 item 5: on phones Calendar and Drive mark More active; on the rail they mark themselves and More marks nothing; an unknown path marks nothing', () => {
    expect(activeTab('/calendar', 'phone')).toBe('more')
    expect(activeTab('/drive', 'phone')).toBe('more')
    expect(activeTab('/more', 'phone')).toBe('more')
    expect(activeTab('/calendar', 'rail')).toBe('calendar')
    expect(activeTab('/drive', 'rail')).toBe('drive')
    expect(activeTab('/more', 'rail')).toBeUndefined()
    for (const entry of TABS) expect(activeTab(entry.to, 'phone')).toBe(entry.id)
    for (const entry of RAIL) expect(activeTab(entry.to, 'rail')).toBe(entry.id)
    for (const path of ['/', '/xyz', '/chats/abc', '/sign-in', '/todayx']) {
      expect(activeTab(path, 'phone'), path).toBeUndefined()
      expect(activeTab(path, 'rail'), path).toBeUndefined()
    }
    // A trailing slash is the same place.
    expect(activeTab('/chats/', 'phone')).toBe('chats')
  })

  it('NV-05 WCAG 4.1.2: aria-current is "page" only on the link to the page shown; More holding Calendar or Drive on a phone is "true"', () => {
    for (const path of ['/calendar', '/drive', '/drive/']) {
      expect(currentOf(NAV.more, path, 'phone'), path).toBe('true')
      expect(
        TABS.filter(entry => entry.id !== 'more').map(entry => currentOf(entry, path, 'phone')),
        path,
      ).toEqual([undefined, undefined, undefined, undefined])
    }
    expect(currentOf(NAV.more, '/more', 'phone')).toBe('page')
    for (const entry of TABS) expect(currentOf(entry, entry.to, 'phone'), entry.id).toBe('page')
    for (const entry of RAIL) {
      expect(currentOf(entry, entry.to, 'rail'), entry.id).toBe('page')
      expect(currentOf(entry, `${entry.to}/`, 'rail'), entry.id).toBe('page')
    }
    for (const path of ['/xyz', '/chats/abc', '/more']) {
      expect(RAIL.map(entry => currentOf(entry, path, 'rail')).filter(Boolean), path).toEqual([])
    }
    expect(TABS.map(entry => currentOf(entry, '/xyz', 'phone')).filter(Boolean)).toEqual([])
  })

  it('NV-04 OD-05 C0.9 PD-26 PD-47 PD-98 PPL-02: AVATAR_MENU is Settings, Data protection, then Sign out; Settings shows to everyone and opens /settings; Data protection shows only when the session’s capabilities allow the registers and opens /dpo/requests once the notice is acknowledged, /dpo/purposes before; Sign out asks the runtime to sign out and says so only when that failed', async () => {
    expect(AVATAR_MENU.map(item => item.label)).toEqual(['Settings', 'Data protection', 'Sign out'])
    expect(AVATAR_MENU).toEqual([settingsItem, dpoItem, signOutItem])
    expect(dpoItem.shown?.({ capabilities: { registers: true } })).toBe(true)
    expect(dpoItem.shown?.({ capabilities: { registers: false } })).toBe(false)
    expect(settingsItem.shown).toBeUndefined()
    expect(signOutItem.shown).toBeUndefined()

    const context = (answer: 'ended' | 'failed', standing: NoticeStanding = 'acknowledged') => ({
      runtime: {
        signOut: vi.fn(async () => answer),
        notice: { standing: () => standing },
      } as unknown as SessionRuntime,
      navigate: vi.fn(),
    })

    // Once acknowledged, the queue (the first link, what its badge counts); before v0, the first
    // setup task, since a case read would move the tab to /notice (PPL-02).
    const opened = context('ended')
    await dpoItem.run(opened)
    expect(opened.navigate.mock.calls).toEqual([['/dpo/requests']])
    expect(opened.runtime.signOut).not.toHaveBeenCalled()
    for (const standing of ['unpublished', 'required'] as const) {
      const setup = context('ended', standing)
      await dpoItem.run(setup)
      expect(setup.navigate.mock.calls, standing).toEqual([['/dpo/purposes']])
    }
    const settings = context('ended')
    await settingsItem.run(settings)
    expect(settings.navigate.mock.calls).toEqual([['/settings']])
    expect(settings.runtime.signOut).not.toHaveBeenCalled()

    const ended = context('ended')
    await signOutItem.run(ended)
    expect(ended.runtime.signOut).toHaveBeenCalledTimes(1)
    expect(ended.navigate).not.toHaveBeenCalled()
    expect(toasts).toEqual([])

    const failed = context('failed')
    await signOutItem.run(failed)
    expect(toasts).toEqual([{ tone: 'error', text: "Couldn't sign out. Check your connection and try again." }])
  })

  it('DPP-07 C0.9 PD-26 PD-47 P6 B-09: the menu a person sees: the DPO gets Settings, Data protection and Sign out, everyone else Settings and Sign out; a session answer with no readable capability (missing, not a boolean, an unparsed cache entry) reads as not allowed', () => {
    const labels = (session: MenuSession) => menuItemsFor(session).map(item => item.label)
    expect(labels({ capabilities: { registers: true } })).toEqual(['Settings', 'Data protection', 'Sign out'])
    expect(labels({ capabilities: { registers: false } })).toEqual(['Settings', 'Sign out'])
    expect(labels({})).toEqual(['Settings', 'Sign out'])
    expect(labels({ capabilities: {} })).toEqual(['Settings', 'Sign out'])
    // The lenient reading the boot and the session query use: only a literal true reads true.
    const person = { personId: 'b0000000-0000-4000-8000-000000000001', name: 'Ashton', timeZone: 'Asia/Singapore' }
    const read = (capabilities: unknown) => SessionResponseForClient.parse({ ...person, capabilities })
    expect(read({ registers: true }).capabilities).toEqual({ registers: true })
    for (const capabilities of [undefined, null, 'yes', { registers: 'true' }, { registers: 1 }, {}]) {
      expect(read(capabilities).capabilities, JSON.stringify(capabilities)).toEqual({ registers: false })
      expect(labels(read(capabilities)), JSON.stringify(capabilities)).toEqual(['Settings', 'Sign out'])
    }
    expect(SessionResponseForClient.parse(person).capabilities).toEqual({ registers: false })
  })

  it('RQW-10 OD-22 PD-99 PPL-05 OD-24: the count of requests needing attention badges only the DPO’s item, named in words; 0, none, or a count that isn’t a whole number shows nothing, and over 99 reads 99+', () => {
    expect(settingsItem.badge).toBeUndefined()
    expect(signOutItem.badge).toBeUndefined()
    expect(dpoItem.badge?.({ capabilities: { registers: true }, requests: 2 })).toEqual({
      text: '2',
      label: 'Data protection, 2 requests need attention',
    })
    expect(dpoItem.badge?.({ capabilities: { registers: true }, requests: 1 })).toEqual({
      text: '1',
      label: 'Data protection, 1 request needs attention',
    })
    expect(dpoItem.badge?.({ requests: 140 })?.text).toBe('99+')
    for (const requests of [0, null, undefined, -1, 1.5]) {
      expect(dpoItem.badge?.({ capabilities: { registers: true }, requests }), String(requests)).toBeUndefined()
      expect(requestsCount({ requests }), String(requests)).toBeUndefined()
    }
    // The session answer's lenient reading: a missing or unreadable count is none (P6).
    const person = { personId: 'b0000000-0000-4000-8000-000000000001', name: 'Ashton', timeZone: 'Asia/Singapore' }
    expect(SessionResponseForClient.parse({ ...person, requests: 3 }).requests).toBe(3)
    expect(requestsCount(SessionResponseForClient.parse({ ...person, requests: 'many' }))).toBeUndefined()
    expect(requestsCount(SessionResponseForClient.parse(person))).toBeUndefined()
  })
})
