// The fixture is complete, made up, and marked so (C11-D25).
import { describe, expect, it } from 'vitest'
import { parseLandingZoneEnv } from '../config/env.ts'
import { configEnvironment, fixtureAccount, fixtureConfig, fixtureGroupId } from './fixture.ts'

describe('C11-D25: the fixture', () => {
  it('pads n to 12 digits for an account id, and refuses what it can’t pad', () => {
    expect(fixtureAccount(3)).toHaveLength(12)
    expect(fixtureAccount(3)).toBe(`${'0'.repeat(11)}3`)
    expect(fixtureAccount(999).endsWith('999')).toBe(true)
    expect(() => fixtureAccount(0)).toThrow()
    expect(() => fixtureAccount(1_000)).toThrow()
    expect(() => fixtureAccount(1.5)).toThrow()
    expect(fixtureGroupId(1)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('is marked as the fixture, with four accounts of its own', () => {
    const config = fixtureConfig()
    expect(config.fixture).toBe(true)
    expect(new Set(Object.values(config.accounts)).size).toBe(4)
  })

  it('passes the same checks a real configuration does', () => {
    expect(parseLandingZoneEnv(configEnvironment(fixtureConfig()))).toEqual({ ...fixtureConfig(), fixture: false })
  })

  it('addresses alerts to the reserved .invalid domain, which never delivers', () => {
    expect(fixtureConfig().alertEmail.endsWith('.invalid')).toBe(true)
  })
})
