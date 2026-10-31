// infra/cdk.json (C11-D23, IG-03): the workload entry run by Node, no plugin, no ids, version
// reporting and the CLI's telemetry off, and every feature flag this aws-cdk-lib recommends setting, as
// of the release cdk.json last adopted (ADOPTED), each at the value it recommends (or a deviation
// listed below with its reason), and no other. A weekly CDK upgrade that adds a recommended flag
// doesn't fail here: adopting it, and moving ADOPTED, is a reviewed change to cdk.json.
import { readFileSync } from 'node:fs'
import * as cxapi from 'aws-cdk-lib/cx-api'
import { describe, expect, it } from 'vitest'

const cdkJson = JSON.parse(readFileSync(new URL('../../cdk.json', import.meta.url), 'utf8')) as {
  app?: unknown
  versionReporting?: unknown
  context?: Record<string, unknown>
  [key: string]: unknown
}

// Context keys that aren't feature flags: the CLI's telemetry switch, read from context.
const NOT_FLAGS = new Set(['cli-telemetry'])

// Flags cdk.json sets to another value than this aws-cdk-lib recommends, each with its reason and C11
// id; a deviation is still written out in cdk.json, at its value. None today: every flag is at its
// recommended value.
const DEVIATIONS: ReadonlyMap<string, unknown> = new Map()

// The aws-cdk-lib release whose recommended flags cdk.json last adopted: every flag recommended by then
// must be set, since leaving one out can turn it off (R3RULES-02).
const ADOPTED = '2.274.0'

// Whether release a (x.y.z) is at or before release b. One that isn't x.y.z counts as at or before, so
// its flag is required rather than skipped.
function atOrBefore(a: string | undefined, b: string): boolean {
  const pa = a?.match(/^(\d+)\.(\d+)\.(\d+)$/)
  const pb = b.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!pa || !pb) return true
  for (const i of [1, 2, 3]) {
    const d = Number(pa[i]) - Number(pb[i])
    if (d !== 0) return d < 0
  }
  return true
}

// What's wrong with cdk.json's context: a flag this aws-cdk-lib no longer honours, one it doesn't
// recommend setting (CURRENTLY_RECOMMENDED_FLAGS holds only flags whose recommended value differs from
// their behaviour when unset), one at another value than it recommends unless DEVIATIONS lists it at
// that value, and a recommended flag introduced by the adopted release that's missing.
function flagProblems(context: Record<string, unknown>, adopted = ADOPTED): string[] {
  const recommended: Record<string, unknown> = cxapi.CURRENTLY_RECOMMENDED_FLAGS
  const set = Object.entries(context).flatMap(([key, value]) => {
    if (NOT_FLAGS.has(key)) return []
    if (cxapi.CURRENT_VERSION_EXPIRED_FLAGS.includes(key)) return [`${key}: expired`]
    if (!(key in recommended)) return [`${key}: not a recommended flag`]
    const expected = DEVIATIONS.has(key) ? DEVIATIONS.get(key) : recommended[key]
    return JSON.stringify(value) === JSON.stringify(expected) ? [] : [`${key}: not the recommended value`]
  })
  const missing = Object.keys(recommended)
    .filter(key => !(key in context) && atOrBefore(cxapi.FLAGS[key]?.introducedIn.v2, adopted))
    .map(key => `${key}: missing`)
  return [...set, ...missing]
}

describe('C11-D23: cdk.json', () => {
  it('runs the workload entry under Node, with nothing else the CLI would act on', () => {
    expect(cdkJson.app).toBe('node bin/workload.ts')
    expect(Object.keys(cdkJson).sort()).toEqual(['app', 'context', 'versionReporting'])
    expect(cdkJson.versionReporting).toBe(false)
    expect(cdkJson.context?.['cli-telemetry']).toBe(false)
  })

  it('finds a flag it doesn’t recommend, one expired and one turned off its recommended value, on a planted context', () => {
    const [expired = ''] = cxapi.CURRENT_VERSION_EXPIRED_FLAGS
    const flag = '@aws-cdk/aws-s3:publicAccessBlockedByDefault'
    const context = { ...cdkJson.context }
    expect(cxapi.CURRENTLY_RECOMMENDED_FLAGS).toHaveProperty([flag], true)
    expect(flagProblems({ ...context, 'cli-telemetry': false, [flag]: true })).toEqual([])
    // Known and honoured, but at its recommended value it behaves as when unset, so it's not set.
    const unrecommended = '@aws-cdk/core:aspectStabilization'
    expect(cxapi.FLAGS).toHaveProperty([unrecommended])
    const planted = { '@aws-cdk/aws-x:made-up': true, [unrecommended]: true, [expired]: true, [flag]: false }
    expect(flagProblems({ ...context, ...planted }).sort()).toEqual(
      [
        '@aws-cdk/aws-x:made-up: not a recommended flag',
        `${unrecommended}: not a recommended flag`,
        `${expired}: expired`,
        `${flag}: not the recommended value`,
      ].sort(),
    )
  })

  // Leaving a recommended-on flag out turns it off as surely as setting it off: without the default
  // security group's restriction, a VPC's default security group stays open (R3RULES-02).
  it('finds a recommended flag left out, but not one a later release than the adopted one added', () => {
    const flag = '@aws-cdk/aws-ec2:restrictDefaultSecurityGroup'
    const { [flag]: _restricted, ...withoutFlag } = cdkJson.context ?? {}
    expect(flagProblems(withoutFlag)).toEqual([`${flag}: missing`])
    // The flag the adopted release itself introduced isn't required of a cdk.json that adopted the one
    // before it, as after a weekly upgrade.
    const latest = '@aws-cdk/aws-apigateway:logGroupDestinationArnWithoutWildcard'
    expect(cxapi.FLAGS[latest]?.introducedIn.v2).toBe(ADOPTED)
    const { [latest]: _latest, ...beforeLatest } = cdkJson.context ?? {}
    expect(flagProblems(beforeLatest)).toEqual([`${latest}: missing`])
    expect(flagProblems(beforeLatest, '2.273.0')).toEqual([])
  })

  // T24 item 10: cdk.json sets every flag this aws-cdk-lib recommended by the adopted release, at its
  // recommended value, so turning a security-relevant one off, by its value or by leaving it out (a
  // default security group left open, public access to a bucket), fails here (R2BUILD-03, R3RULES-02).
  it('sets every recommended flag, each at its recommended value, and no other', () => {
    expect(flagProblems(cdkJson.context ?? {})).toEqual([])
  })
})
