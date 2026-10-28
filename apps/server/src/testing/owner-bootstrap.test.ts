import { afterEach, describe, expect, it, vi } from 'vitest'

// The Owner bootstrap fixture's dates (testing/owner-bootstrap.ts), which CI's check of the script
// (apps/server/scripts/check-owner-bootstrap.ts) and the integration harness's first org share. The
// recovery cases expect the entry's own review date, so every set-up document a run makes must
// carry the dates the fixture pinned when it loaded, even once midnight in Singapore (16:00 UTC)
// has passed (design §10.2 BSS-07: both dates pinned in the fixture). Only Date is faked; nothing
// here spawns the script or connects anywhere.
const fixture = () => import('#src/testing/owner-bootstrap.ts')
const reviewOn = (facts: unknown): unknown => (facts as { reviewOn?: unknown }).reviewOn

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

describe('T22 item 70 the bootstrap fixture’s review dates', () => {
  it('TESTS-04 BSS-07: daysAhead() counts from the day an instant falls on in Singapore, which turns at 16:00 UTC', async () => {
    const { daysAhead } = await fixture()
    expect(daysAhead(0, 'Asia/Singapore', new Date('2026-10-27T15:59:59Z'))).toBe('2026-10-27')
    expect(daysAhead(0, 'Asia/Singapore', new Date('2026-10-27T16:00:00Z'))).toBe('2026-10-28')
    expect(daysAhead(60, 'Asia/Singapore', new Date('2026-10-27T15:59:59Z'))).toBe('2026-12-26')
    expect(daysAhead(365, 'UTC', new Date('2026-10-27T16:00:00Z'))).toBe('2027-10-27')
  })

  it('TESTS-04 BSS-07 BSS-10: a set-up document made after midnight in Singapore still carries the dates pinned when the fixture loaded', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-27T15:59:30Z'))
    vi.resetModules()
    const { REVIEW_DATES, daysAhead, setUpDocument } = await fixture()
    expect(REVIEW_DATES).toEqual({ twilio: '2026-12-26', aws: '2027-10-27' })
    const before = setUpDocument()

    vi.setSystemTime(new Date('2026-10-27T16:00:30Z'))
    expect(daysAhead(60)).toBe('2026-12-27')
    const after = setUpDocument()
    for (const document of [before, after]) {
      expect(reviewOn(document.twilio)).toBe(REVIEW_DATES.twilio)
      expect(reviewOn(document.aws)).toBe(REVIEW_DATES.aws)
    }
    expect(Object.isFrozen(REVIEW_DATES)).toBe(true)
  })
})
