// infra/cdk.json (C11-D23, IG-03): the workload entry run by Node, no plugin, no ids, version
// reporting and the CLI's telemetry off, and only feature flags this aws-cdk-lib knows and still
// honours, each at the value it recommends (or a deviation listed below with its reason). A weekly CDK
// upgrade that adds a recommended flag doesn't fail here: adopting it is a reviewed change to cdk.json.
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
// id. None today: every flag is at its recommended value.
const DEVIATIONS: ReadonlyMap<string, unknown> = new Map()

// What's wrong with cdk.json's context: a flag this aws-cdk-lib doesn't know, one it no longer
// honours, or one at another value than it recommends (CURRENTLY_RECOMMENDED_FLAGS, or for a flag
// only a new project sets, NEW_PROJECT_DEFAULT_CONTEXT), unless DEVIATIONS lists it at that value.
function flagProblems(context: Record<string, unknown>): string[] {
  const recommended: Record<string, unknown> = {
    ...cxapi.NEW_PROJECT_DEFAULT_CONTEXT,
    ...cxapi.CURRENTLY_RECOMMENDED_FLAGS,
  }
  return Object.entries(context).flatMap(([key, value]) => {
    if (NOT_FLAGS.has(key)) return []
    if (cxapi.CURRENT_VERSION_EXPIRED_FLAGS.includes(key)) return [`${key}: expired`]
    if (!(key in recommended)) return [`${key}: unknown`]
    const expected = DEVIATIONS.has(key) ? DEVIATIONS.get(key) : recommended[key]
    return JSON.stringify(value) === JSON.stringify(expected) ? [] : [`${key}: not the recommended value`]
  })
}

describe('C11-D23: cdk.json', () => {
  it('runs the workload entry under Node, with nothing else the CLI would act on', () => {
    expect(cdkJson.app).toBe('node bin/workload.ts')
    expect(Object.keys(cdkJson).sort()).toEqual(['app', 'context', 'versionReporting'])
    expect(cdkJson.versionReporting).toBe(false)
    expect(cdkJson.context?.['cli-telemetry']).toBe(false)
  })

  it('finds a flag it doesn’t know, one expired and one turned off its recommended value, on a planted context', () => {
    const [expired = ''] = cxapi.CURRENT_VERSION_EXPIRED_FLAGS
    const flag = '@aws-cdk/aws-s3:publicAccessBlockedByDefault'
    expect(cxapi.CURRENTLY_RECOMMENDED_FLAGS).toHaveProperty([flag], true)
    expect(flagProblems({ 'cli-telemetry': false, [flag]: true })).toEqual([])
    expect(flagProblems({ '@aws-cdk/aws-x:made-up': true, [expired]: true, [flag]: false })).toEqual([
      '@aws-cdk/aws-x:made-up: unknown',
      `${expired}: expired`,
      `${flag}: not the recommended value`,
    ])
  })

  // T24 item 10: cdk.json sets this aws-cdk-lib's recommended flags, at their recommended values, so
  // turning a security-relevant one off (a default security group left open, public access to a
  // bucket) fails here (R2BUILD-03).
  it('sets only flags this aws-cdk-lib knows and still honours, each at its recommended value', () => {
    expect(flagProblems(cdkJson.context ?? {})).toEqual([])
  })
})
