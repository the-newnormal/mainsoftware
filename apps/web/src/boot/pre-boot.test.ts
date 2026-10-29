import { describe, expect, it, vi } from 'vitest'
import {
  LEAVE_GRACE_MS,
  type PreBootWindow,
  preBoot,
  type ScrollCacheStorage,
  safeSessionStorage,
  wipeScrollCache,
} from './pre-boot.ts'

function memoryStorage(entries: Record<string, string>): ScrollCacheStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(entries))
  return {
    map,
    get length() {
      return map.size
    },
    key: index => [...map.keys()][index] ?? null,
    removeItem: key => {
      map.delete(key)
    },
  }
}

// A window whose events the test dispatches by hand.
function fakeWindow(storage: () => ScrollCacheStorage) {
  const listeners = new Map<string, ((event: Event) => void)[]>()
  const reload = vi.fn()
  const timers: { run: () => void; ms: number }[] = []
  const win: PreBootWindow = {
    get sessionStorage() {
      return storage()
    },
    location: { reload },
    addEventListener: (type, listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    setTimeout: (run, ms) => {
      timers.push({ run, ms })
    },
  }
  const dispatch = (type: string, event: Event) => {
    for (const listener of listeners.get(type) ?? []) listener(event)
  }
  // The page is still here when its timers come due: runs every timer set so far.
  const stillHere = () => {
    for (const timer of timers.splice(0)) timer.run()
  }
  return { win, reload, dispatch, timers, stillHere }
}

const preloadError = () => new Event('vite:preloadError', { cancelable: true })

describe('T21 D-02: before any library loads (boot/pre-boot.ts)', () => {
  it('PB-01 D-02: every boot removes every tsr-scroll-restoration* key, with or without a leave marker; hearth:* and tanstack_router_reload:* stay', () => {
    const markers: Record<string, string>[] = [{}, { 'hearth:left': 'session_ended' }]
    for (const marker of markers) {
      const storage = memoryStorage({
        'tsr-scroll-restoration-v1_3': '{"/chats":{}}',
        'hearth:return-to': '/tasks',
        'tsr-scroll-restoration-v2': '{}',
        'tanstack_router_reload:Failed to fetch dynamically imported module': '1',
        'tsr-scroll-restoration': '{}',
        'hearth:reloaded-at': '1',
        ...marker,
      })
      const { win } = fakeWindow(() => storage)
      preBoot(win, () => 'blocked')
      expect([...storage.map.keys()].sort()).toEqual(
        [
          'hearth:reloaded-at',
          'hearth:return-to',
          'tanstack_router_reload:Failed to fetch dynamically imported module',
          ...Object.keys(marker),
        ].sort(),
      )
    }
  })

  it('PB-01 DC-05: storage the browser refuses is skipped, and a key that will not go doesn’t stop the rest', () => {
    const refused = fakeWindow(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    })
    expect(safeSessionStorage(refused.win)).toBeUndefined()
    expect(() => preBoot(refused.win, () => 'blocked')).not.toThrow()

    const storage = memoryStorage({ 'tsr-scroll-restoration-a': '1', 'tsr-scroll-restoration-b': '2' })
    const stubborn: ScrollCacheStorage = {
      get length() {
        return storage.length
      },
      key: index => storage.key(index),
      removeItem: key => {
        if (key.endsWith('-b')) throw new Error('no')
        storage.removeItem(key)
      },
    }
    wipeScrollCache(stubborn)
    expect([...storage.map.keys()]).toEqual(['tsr-scroll-restoration-b'])
    expect(() => wipeScrollCache(undefined)).not.toThrow()
  })

  it("PB-02 T21 item 2: a persisted pageshow (the back-forward cache's copy) reloads; a fresh one doesn't", () => {
    const { win, reload, dispatch } = fakeWindow(() => memoryStorage({}))
    preBoot(win, () => 'blocked')
    dispatch('pageshow', Object.assign(new Event('pageshow'), { persisted: false }))
    expect(reload).not.toHaveBeenCalled()
    dispatch('pageshow', Object.assign(new Event('pageshow'), { persisted: true }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("PB-03 T21 item 2: vite:preloadError calls onPreloadError once; 'reloaded' prevents the default, 'blocked' lets the error through", () => {
    const blocked = fakeWindow(() => memoryStorage({}))
    const ask = vi.fn((): 'reloaded' | 'blocked' => 'blocked')
    preBoot(blocked.win, ask)
    const first = preloadError()
    blocked.dispatch('vite:preloadError', first)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(first.defaultPrevented).toBe(false)

    const reloading = fakeWindow(() => memoryStorage({}))
    const reload = vi.fn((): 'reloaded' | 'blocked' => 'reloaded')
    preBoot(reloading.win, reload)
    const events = [preloadError(), preloadError(), preloadError()]
    for (const event of events) reloading.dispatch('vite:preloadError', event)
    // One reload for a burst of failed chunks; every one of them is stopped while it happens.
    expect(reload).toHaveBeenCalledTimes(1)
    expect(events.map(event => event.defaultPrevented)).toEqual([true, true, true])
  })

  it('PB-04 T21 item 2: once the page is leaving (beforeunload or pagehide), a preload error reloads nothing while the page goes, and the error goes on', () => {
    for (const leave of ['beforeunload', 'pagehide']) {
      const leaving = fakeWindow(() => memoryStorage({}))
      const ask = vi.fn((): 'reloaded' | 'blocked' => 'reloaded')
      preBoot(leaving.win, ask)
      leaving.dispatch(leave, new Event(leave))
      const events = [preloadError(), preloadError()]
      for (const event of events) leaving.dispatch('vite:preloadError', event)
      // A navigation that replaces the page ends its timers: nothing was asked, nothing reloads.
      expect(ask, leave).not.toHaveBeenCalled()
      expect(
        events.map(event => event.defaultPrevented),
        leave,
      ).toEqual([false, false])
      // One wait for a burst of errors, of LEAVE_GRACE_MS.
      expect(
        leaving.timers.map(timer => timer.ms),
        leave,
      ).toEqual([LEAVE_GRACE_MS])
    }
    // A reload already under way still stops the errors that follow it, leaving or not.
    const reloading = fakeWindow(() => memoryStorage({}))
    preBoot(reloading.win, () => 'reloaded')
    const first = preloadError()
    reloading.dispatch('vite:preloadError', first)
    reloading.dispatch('beforeunload', new Event('beforeunload'))
    const second = preloadError()
    reloading.dispatch('vite:preloadError', second)
    expect([first.defaultPrevented, second.defaultPrevented]).toEqual([true, true])
  })

  it('PB-05 T21 item 2: after a navigation that ended without replacing the page (a download, a 204), a real chunk failure still reloads, once the page is still here', () => {
    const aborted = fakeWindow(() => memoryStorage({}))
    const ask = vi.fn((): 'reloaded' | 'blocked' => 'reloaded')
    preBoot(aborted.win, ask)
    aborted.dispatch('beforeunload', new Event('beforeunload'))
    // The navigation ends with the page still here; a chunk of a gone deploy fails later.
    const failure = preloadError()
    aborted.dispatch('vite:preloadError', failure)
    expect(ask).not.toHaveBeenCalled()
    aborted.stillHere()
    expect(ask).toHaveBeenCalledTimes(1)
    // The reload is under way, so the errors that follow are stopped at once.
    const next = preloadError()
    aborted.dispatch('vite:preloadError', next)
    expect(next.defaultPrevented).toBe(true)
    expect(ask).toHaveBeenCalledTimes(1)
  })
})
