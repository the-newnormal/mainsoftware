// infra/cdk.json (C11-D23, IG-03): the workload entry run by Node, no plugin, no ids, version
// reporting and the CLI's telemetry off, and only feature flags this aws-cdk-lib knows and still
// honours, at the values it recommended when the file was written. A weekly CDK upgrade that adds a
// recommended flag doesn't fail here: adopting it is a reviewed change to cdk.json.
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

describe('C11-D23: cdk.json', () => {
  it('runs the workload entry under Node, with nothing else the CLI would act on', () => {
    expect(cdkJson.app).toBe('node bin/workload.ts')
    expect(Object.keys(cdkJson).sort()).toEqual(['app', 'context', 'versionReporting'])
    expect(cdkJson.versionReporting).toBe(false)
    expect(cdkJson.context?.['cli-telemetry']).toBe(false)
  })

  it('sets only flags this aws-cdk-lib knows and still honours, none expired', () => {
    const context = cdkJson.context ?? {}
    const known = new Set([
      ...Object.keys(cxapi.CURRENTLY_RECOMMENDED_FLAGS),
      ...Object.keys(cxapi.NEW_PROJECT_DEFAULT_CONTEXT),
    ])
    const unknown = Object.keys(context).filter(key => !NOT_FLAGS.has(key) && !known.has(key))
    expect(unknown).toEqual([])
    const expired = Object.keys(context).filter(key => cxapi.CURRENT_VERSION_EXPIRED_FLAGS.includes(key))
    expect(expired).toEqual([])
  })
})
