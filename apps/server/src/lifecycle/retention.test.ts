// The retention registry's server-side pins (C0.10; TECH-SPEC T23 items 6, 11 and 18): Valkey's
// families and figures against the code that sets each key's expiry (LCV-01) and the key names
// themselves (LCV-02); HF009 and HF010 answered by no refusal map (LCV-06); and the access-request
// hold's sample table, which the DB test 192 and packages/shared's mirror share (LCV-08).
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fromDatabase } from '#src/auth/errors.ts'
import { ATTEMPT_TTL_MS, LIMITS, OTP, PASSKEY_CHALLENGE_TTL_MS, REAUTH } from '#src/auth/policy.ts'
import { valkeyKeys } from '#src/auth/valkey-keys.ts'
import { HELD, retryable, sqlstateOf, UNLOGGED_DELETE } from '#src/db/sqlstate.ts'
import { GATEWAY_POLICY } from '#src/realtime/policy.ts'
import { familyOf, familyPatterns, valkeyFamilies } from '#src/testing/valkey-expiry.ts'

const SRC = new URL('../', import.meta.url)
const REPO = new URL('../../../../', import.meta.url)

// Every window the sliding-window limiter keeps a key for (auth/limiter.ts expires each window's key
// after the window itself).
const WINDOWS: readonly { name: string; windowMs: number }[] = Object.values(LIMITS).flat()

describe('C0.10 LH-07 T23 item 6: Valkey’s families in the retention registry', () => {
  it('LCV-01: each family’s figure is the expiry the code sets for it, and every LIMITS window fits the limit family’s', () => {
    const families = valkeyFamilies()
    const longest = Math.max(...WINDOWS.map(window => window.windowMs))
    expect(families).toEqual({
      // attempts.ts sets each attempt with ATTEMPT_TTL_MS, and KEEPTTL after.
      attempt: ATTEMPT_TTL_MS,
      // codes.ts's OPEN script expires a code challenge after OTP.recordTtlMs.
      otp: OTP.recordTtlMs,
      // sign-in.ts and account.ts set a passkey challenge with PASSKEY_CHALLENGE_TTL_MS.
      challenge: PASSKEY_CHALLENGE_TTL_MS,
      // account.ts: an approved SMS re-authentication code, and the send lock.
      reauthApproved: REAUTH.approvedMs,
      reauthSending: REAUTH.sendLockMs,
      // limiter.ts expires each window's key after its own window: the longest is a day.
      limit: longest,
      // realtime/stream.ts expires an org's stream and its epoch after streamTtlMs, at every refresh.
      stream: GATEWAY_POLICY.streamTtlMs,
      epoch: GATEWAY_POLICY.streamTtlMs,
      // Pub/sub channels keep nothing.
      revoked: 'not_stored',
      access: 'not_stored',
      flags: 'not_stored',
    })
    // A window longer than the limit family's figure fails here until the registry gives it one.
    for (const window of WINDOWS) expect(window.windowMs, window.name).toBeLessThanOrEqual(longest)
    expect(families.limit).toBe(86_400_000)
  })

  it('LCV-02: the families are valkeyKeys()’s key functions and channels, both ways, and each key name belongs to exactly its own family', () => {
    const names = valkeyKeys('h:test:')
    const families = valkeyFamilies()
    expect(Object.keys(families).sort()).toEqual(Object.keys(names).sort())
    for (const [family, name] of Object.entries(names)) {
      // A key function's family expires; a channel's (a plain name) keeps nothing.
      if (typeof name === 'function') expect(families[family], family).toEqual(expect.any(Number))
      else expect(families[family], family).toBe('not_stored')
    }
    const patterns = familyPatterns('h:test:')
    const org = 'a0000000-0000-4000-8000-000000000001'
    const samples: Record<string, string> = {
      otp: names.otp('Zk3x'),
      attempt: names.attempt('Zk3x'),
      challenge: names.challenge('signin', 'Zk3x'),
      reauthApproved: names.reauthApproved(org),
      reauthSending: names.reauthSending(org),
      limit: names.limit('otp-n10m', 'Zk3x'),
      stream: names.stream(org),
      epoch: names.epoch(org),
      revoked: names.revoked,
      access: names.access,
      flags: names.flags,
    }
    expect(Object.keys(samples).sort()).toEqual(Object.keys(names).sort())
    for (const [family, key] of Object.entries(samples)) expect(familyOf(patterns, key), key).toBe(family)
    // Another environment's prefix, or a name of no family, belongs to none.
    expect(familyOf(patterns, valkeyKeys('h:prod:').otp('Zk3x'))).toBeUndefined()
    expect(familyOf(patterns, 'h:test:cache:Zk3x')).toBeUndefined()
  })
})

describe('C0.10 LH-25 LH-37 T23 item 18: the guard’s codes reach no person', () => {
  it('LCV-06: HELD (HF009) and UNLOGGED_DELETE (HF010) are mapped by no refusal map, so either answers a logged 500 that never mentions a hold', () => {
    expect([HELD, UNLOGGED_DELETE]).toEqual(['HF009', 'HF010'])
    for (const code of [HELD, UNLOGGED_DELETE]) {
      const error = Object.assign(new Error('refused'), { code })
      expect(sqlstateOf(error)).toBe(code)
      // Not a conflict the client tries again (409 try_again), and never retried by a job.
      expect(fromDatabase(error)).toBeUndefined()
      expect(retryable(error)).toBe(false)
    }
    // Every refusal map is a switch over sqlstateOf() in a runtime file (compliance/routes.ts,
    // notice.ts, cases.ts, flags/set.ts): none names either code, by its constant or its value.
    const named: string[] = []
    for (const path of readdirSync(SRC, { recursive: true, encoding: 'utf8' })) {
      if (!path.endsWith('.ts') || path.endsWith('.test.ts') || path.startsWith('testing/')) continue
      if (path === 'db/sqlstate.ts') continue
      const text = readFileSync(new URL(path, SRC), 'utf8')
      if (/\b(?:HELD|UNLOGGED_DELETE)\b|['"`]HF0(?:09|10)['"`]/.test(text)) named.push(path)
    }
    expect(named).toEqual([])
  })
})

describe('C0.10 LH-19 LH-20 T23 item 11: the access-request hold’s samples', () => {
  it('LCV-08: db/tests/192_access_request_holds.sql holds exactly packages/shared/src/retention-samples.json between its samples markers', () => {
    const test = readFileSync(new URL('db/tests/192_access_request_holds.sql', REPO), 'utf8')
    const begin = test.indexOf('-- samples: begin')
    const end = test.indexOf('-- samples: end')
    expect(begin).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(begin)
    const block = test.slice(begin, end)
    const quotes = [...block.matchAll(/\$samples\$/g)].map(match => match.index)
    expect(quotes).toHaveLength(2)
    const json = block.slice((quotes[0] ?? 0) + '$samples$'.length, quotes[1])
    const file = readFileSync(new URL('packages/shared/src/retention-samples.json', REPO), 'utf8')
    const samples = JSON.parse(file) as unknown[]
    expect(samples.length).toBeGreaterThan(0)
    expect(JSON.parse(json)).toEqual(samples)
  })
})
