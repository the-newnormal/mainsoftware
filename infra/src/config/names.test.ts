// The names that cross stacks and PRs (C11-D27) and the ARN builder every policy uses (C11-D74's
// owner's read): each helper is held to the string the test joins itself from literal parts, never
// through arns.ts, so a helper that returned `*` or another account fails here.
import * as cdk from 'aws-cdk-lib'
import { describe, expect, it } from 'vitest'
import { fixtureAccount } from '../testing/fixture.ts'
import { testApp } from '../testing/synth.ts'
import { accountRoot, arnPattern, awsManagedPolicyArn, bucketArns, PARTITION, roleArn } from './arns.ts'
import {
  baselineStackName,
  clusterName,
  execRoleName,
  iamVariable,
  LOG_BUCKET_PREFIX,
  logBucketName,
  QUALIFIER,
  SSM_PARAMETER,
  stagesIn,
  TOOLKIT_STACK,
  taskFamily,
  taskRoleName,
} from './names.ts'
import { REGION } from './profiles.ts'

// An ARN joined here from its parts, as a test builds what it expects.
const joined = (...parts: string[]) => ['arn', 'aws', ...parts].join(':')

describe('C11-D27: the names that cross stacks and PRs', () => {
  it('names each log-archive bucket for the log-archive account', () => {
    const logArchive = fixtureAccount(2)
    expect(logBucketName('trail', logArchive)).toBe(`hearth-org-trail-${logArchive}`)
    expect(logBucketName('breakGlass', logArchive)).toBe(`hearth-break-glass-log-${logArchive}`)
    expect(logBucketName('archive', logArchive)).toBe(`hearth-archive-${logArchive}`)
    expect(Object.keys(LOG_BUCKET_PREFIX)).toEqual(['trail', 'breakGlass', 'archive'])
  })

  it('C11-Q02: prod’s account holds the prod and restore stages, non-prod’s only its own', () => {
    expect(stagesIn('prod')).toEqual(['prod', 'restore'])
    expect(stagesIn('nonprod')).toEqual(['nonprod'])
  })

  it('names the workload’s cluster, families, roles and parameters per environment', () => {
    expect(clusterName('restore')).toBe('hearth-restore')
    expect(taskFamily('prod', 'bastion')).toBe('hearth-prod-bastion')
    expect(taskRoleName('nonprod', 'rule9')).toBe('hearth-nonprod-rule9-task')
    expect(execRoleName('prod', 'migrate')).toBe('hearth-prod-migrate-exec')
    expect(SSM_PARAMETER.zoneUserContent('nonprod')).toBe('/hearth/nonprod/zone/usercontent')
    expect(baselineStackName('nonprod')).toBe('Hearth-nonprod-Baseline')
  })

  it('writes an IAM policy variable without a string literal holding one', () => {
    expect(iamVariable('aws:PrincipalAccount')).toBe(`$${'{aws:PrincipalAccount}'}`)
    expect(iamVariable('aws:PrincipalAccount')).toBe(['$', '{aws:PrincipalAccount}'].join(''))
  })

  it('C11-D26: each qualifier fits the bootstrap template, and its longest role name fits IAM’s 64', () => {
    for (const qualifier of Object.values(QUALIFIER)) expect(qualifier).toMatch(/^[A-Za-z0-9_-]{1,10}$/)
    expect(TOOLKIT_STACK.base).toBe(`CDKToolkit-${QUALIFIER.base}`)
    expect(TOOLKIT_STACK.app).toBe(`CDKToolkit-${QUALIFIER.app}`)
    const longest = `cdk-${QUALIFIER.base}-image-publishing-role-${fixtureAccount(999)}-${REGION}`
    expect(longest.length).toBeLessThanOrEqual(64)
  })
})

describe('C11-D74: the ARN builder', () => {
  it('joins six fields with the fixed partition', () => {
    expect(
      arnPattern({ service: 'sns', region: REGION, account: fixtureAccount(1), resource: 'hearth-ops-alerts' }),
    ).toBe(joined('sns', REGION, fixtureAccount(1), 'hearth-ops-alerts'))
    expect(arnPattern({ service: 's3', resource: 'b' })).toBe(joined('s3', '', '', 'b'))
  })

  it('throws on a part that is a token, which would render an Fn::Join', () => {
    expect(() => arnPattern({ service: 'iam', account: cdk.Aws.ACCOUNT_ID, resource: 'root' })).toThrow(/literal/)
    expect(() => arnPattern({ service: 'iam', region: cdk.Aws.REGION, resource: 'root' })).toThrow(/literal/)
  })

  it('the fixed partition is the one the CLI renders under cdk.json’s context in ap-southeast-1', () => {
    const stack = new cdk.Stack(testApp(), 'Partition', { env: { region: REGION } })
    expect(stack.partition).toBe(PARTITION)
    expect(cdk.Token.isUnresolved(stack.partition)).toBe(false)
  })

  it('each helper equals the ARN joined from parts, for one account and for any', () => {
    for (const account of [fixtureAccount(3), '*']) {
      expect(accountRoot(account)).toBe(joined('iam', '', account, 'root'))
      expect(roleArn(account, 'hearth-break-glass')).toBe(joined('iam', '', account, 'role/hearth-break-glass'))
      expect(roleArn(account, 'cdk-hearthbase-*')).toBe(joined('iam', '', account, 'role/cdk-hearthbase-*'))
    }
    expect(awsManagedPolicyArn('ReadOnlyAccess')).toBe(joined('iam', '', 'aws', 'policy/ReadOnlyAccess'))
    for (const bucket of [logBucketName('trail', fixtureAccount(2)), `${LOG_BUCKET_PREFIX.archive}*`]) {
      expect(bucketArns(bucket)).toEqual([joined('s3', '', '', bucket), joined('s3', '', '', `${bucket}/*`)])
    }
  })
})
