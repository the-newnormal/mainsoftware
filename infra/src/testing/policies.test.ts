// The test helpers later assertion tests stand on (C11-D70): an in-process synth with cdk.json's
// context, and the policy walker, proved on a small stack holding one policy of each kind they read.
import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as organizations from 'aws-cdk-lib/aws-organizations'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as sso from 'aws-cdk-lib/aws-sso'
import { beforeAll, describe, expect, it } from 'vitest'
import { grantsModelAction, MODEL_SERVICE_PREFIXES } from '../config/models.ts'
import { REGION } from '../config/profiles.ts'
import { policyDocuments, policyStatements, unreadablePolicies } from './policies.ts'
import { cdkContext, resourcesOf, type Synthesised, synthesise, templateOf, testApp } from './synth.ts'

const [firstPrefix = ''] = MODEL_SERVICE_PREFIXES

let synthesised: Synthesised
let template: Record<string, unknown>

beforeAll(() => {
  const app = testApp()
  const stack = new cdk.Stack(app, 'HelperTest', { env: { region: REGION }, stackName: 'Hearth-helper-test' })
  const role = new iam.Role(stack, 'Role', { assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com') })
  role.addToPolicy(new iam.PolicyStatement({ actions: ['logs:CreateLogStream'], resources: ['*'] }))
  new iam.ManagedPolicy(stack, 'Managed', {
    statements: [new iam.PolicyStatement({ effect: iam.Effect.DENY, actions: [`${firstPrefix}:*`], resources: ['*'] })],
  })
  const bucket = new s3.Bucket(stack, 'Bucket', { enforceSSL: true, removalPolicy: cdk.RemovalPolicy.RETAIN })
  bucket.addToResourcePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:Delete*'],
      resources: [bucket.arnForObjects('*')],
    }),
  )
  new organizations.CfnPolicy(stack, 'Scp', {
    name: 'test-scp',
    type: 'SERVICE_CONTROL_POLICY',
    content: { Version: '2012-10-17', Statement: [{ Effect: 'Deny', Action: [`${firstPrefix}:*`], Resource: '*' }] },
  })
  new organizations.CfnPolicy(stack, 'OptOut', {
    name: 'test-opt-out',
    type: 'AISERVICES_OPT_OUT_POLICY',
    content: { services: { default: { opt_out_policy: { '@@assign': 'optOut' } } } },
  })
  new sso.CfnPermissionSet(stack, 'Set', {
    name: 'TestSet',
    instanceArn: stack.formatArn({
      service: 'sso',
      region: '',
      account: '',
      resource: 'instance',
      resourceName: `ssoins-${'0'.repeat(16)}`,
      arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
    }),
    inlinePolicy: {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Action: ['sts:AssumeRole'], Resource: '*' }],
    },
  })
  // A document given as JSON text, as a log resource policy's is.
  new logs.CfnResourcePolicy(stack, 'LogsPolicy', {
    policyName: 'test-logs',
    policyDocument: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'delivery.logs.amazonaws.com' },
          Action: 'logs:PutLogEvents',
          Resource: '*',
        },
      ],
    }),
  })
  // A document only CloudFormation can assemble, which a static reading must report, not skip.
  const joined = new iam.CfnManagedPolicy(stack, 'Joined', { policyDocument: { Version: '2012-10-17', Statement: [] } })
  joined.addPropertyOverride('PolicyDocument', { 'Fn::Join': ['', ['{"Version":"2012-10-17",', '"Statement":[]}']] })
  // Documents that read as objects but hold what only CloudFormation can assemble: an Action built by
  // an intrinsic (which would read as no model action), an Effect left to one, and a whole statement
  // given as one.
  new cdk.CfnCondition(stack, 'C', { expression: cdk.Fn.conditionEquals('a', 'a') })
  new iam.CfnManagedPolicy(stack, 'JoinedAction', {
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Action: [{ 'Fn::Join': ['', [firstPrefix, ':*']] }], Resource: '*' }],
    },
  })
  new iam.CfnManagedPolicy(stack, 'JoinedNotAction', {
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Deny', NotAction: { 'Fn::Join': ['', ['sts', ':*']] }, Resource: '*' }],
    },
  })
  new iam.CfnManagedPolicy(stack, 'IntrinsicEffect', {
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Effect: { 'Fn::If': ['C', 'Allow', 'Deny'] }, Action: 'sts:AssumeRole', Resource: '*' }],
    },
  })
  new iam.CfnManagedPolicy(stack, 'IntrinsicStatement', {
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        { Effect: 'Allow', Action: 'sts:TagSession', Resource: '*' },
        {
          'Fn::If': [
            'C',
            { Effect: 'Allow', Action: [{ 'Fn::Join': ['', [firstPrefix, ':*']] }], Resource: '*' },
            { Ref: 'AWS::NoValue' },
          ],
        },
      ],
    },
  })
  // A trust the CDK CLI's bootstrap template writes (its publishing, lookup and deployment roles):
  // the trusted accounts' statement is there only under a condition, its other branch no statement.
  new iam.CfnRole(stack, 'ConditionalTrust', {
    assumeRolePolicyDocument: {
      Statement: [
        { Action: 'sts:TagSession', Effect: 'Allow', Principal: { AWS: { Ref: 'AWS::AccountId' } } },
        {
          'Fn::If': [
            'C',
            { Action: ['sts:AssumeRole'], Effect: 'Allow', Principal: { AWS: { Ref: 'AWS::AccountId' } } },
            { Ref: 'AWS::NoValue' },
          ],
        },
        {
          'Fn::If': [
            'C',
            { Action: 'sts:AssumeRole', Effect: 'Deny', Principal: { AWS: '*' } },
            { Action: 'sts:TagSession', Effect: 'Deny', Principal: { AWS: '*' } },
          ],
        },
      ],
    },
  })
  synthesised = synthesise(app)
  template = templateOf(synthesised, 'Hearth-helper-test')
}, 60_000)

describe('C11-D70: synthesis for the assertion tests', () => {
  it('the App carries cdk.json’s feature flags, as the CLI passes them', () => {
    const context = cdkContext()
    expect(context['@aws-cdk/aws-iam:minimizePolicies']).toBe(true)
    expect(Object.keys(context).length).toBeGreaterThan(50)
  })

  it('reads back each stack’s template by its CloudFormation name, and the asset manifests', () => {
    expect(synthesised.stacks.map(stack => stack.stackName)).toEqual(['Hearth-helper-test'])
    expect(Object.keys(resourcesOf(template)).length).toBeGreaterThan(5)
    expect(synthesised.assetManifests.size).toBeGreaterThan(0)
    expect(() => templateOf(synthesised, 'Hearth-missing')).toThrow(/synthesised: Hearth-helper-test/)
  })
})

describe('C11-D70: the policy walker', () => {
  it('finds a role’s trust and inline policy, a managed policy, a bucket policy, an SCP and a permission set’s policy', () => {
    const places = policyDocuments(template).map(found => `${found.type} ${found.where}`)
    expect(places).toEqual(
      expect.arrayContaining([
        'AWS::IAM::Role AssumeRolePolicyDocument',
        'AWS::IAM::Policy PolicyDocument',
        'AWS::IAM::ManagedPolicy PolicyDocument',
        'AWS::S3::BucketPolicy PolicyDocument',
        'AWS::Organizations::Policy Content',
        'AWS::SSO::PermissionSet InlinePolicy',
        'AWS::Logs::ResourcePolicy PolicyDocument',
      ]),
    )
    // The AI opt-out's content is no IAM policy, so it isn't read as one.
    expect(policyDocuments(template).some(found => found.logicalId.startsWith('OptOut'))).toBe(false)
  })

  it('normalises each statement’s lists, so a test reads actions and resources the same whatever their form', () => {
    const statements = policyStatements(template)
    const trust = statements.find(s => s.where === 'AssumeRolePolicyDocument')
    expect(trust?.actions).toEqual(['sts:AssumeRole'])
    expect(trust?.principal).toEqual({ Service: 'ecs-tasks.amazonaws.com' })
    const scp = statements.find(s => s.type === 'AWS::Organizations::Policy')
    expect(scp).toMatchObject({ effect: 'Deny', actions: [`${firstPrefix}:*`], resources: ['*'] })
    const set = statements.find(s => s.type === 'AWS::SSO::PermissionSet')
    expect(set).toMatchObject({ effect: 'Allow', actions: ['sts:AssumeRole'] })
    // A single Action written as text reads as a list of one.
    const fromText = statements.find(s => s.type === 'AWS::Logs::ResourcePolicy')
    expect(fromText).toMatchObject({ effect: 'Allow', actions: ['logs:PutLogEvents'], resources: ['*'] })
    const bucket = statements.filter(s => s.type === 'AWS::S3::BucketPolicy')
    expect(bucket.map(s => s.actions)).toEqual(expect.arrayContaining([['s3:*'], ['s3:Delete*']]))
  })

  it('IAC-01 reads through it: denies may name a model service, no Allow here grants one', () => {
    const statements = policyStatements(template)
    const allows = statements.filter(s => s.effect === 'Allow')
    expect(allows.flatMap(s => s.actions).filter(grantsModelAction)).toEqual([])
    expect(statements.filter(s => s.effect === 'Deny' && s.actions.some(grantsModelAction)).length).toBe(2)
  })

  it('reports a document only CloudFormation can assemble, rather than skipping it', () => {
    expect(unreadablePolicies(template)).toEqual([
      'Joined PolicyDocument',
      'JoinedAction PolicyDocument',
      'JoinedNotAction PolicyDocument',
      'IntrinsicEffect PolicyDocument',
      'IntrinsicStatement PolicyDocument',
    ])
  })

  // The CDK CLI's bootstrap template adds statements under a condition, which must read as each branch
  // rather than make its trusts unreadable, and a check that a Deny is in place can't count one.
  it('reads a statement given as Fn::If as each of its branches, marked conditional', () => {
    const trust = policyStatements(template).filter(s => s.logicalId === 'ConditionalTrust')
    expect(trust.map(s => [s.effect, s.actions, s.conditional])).toEqual([
      ['Allow', ['sts:TagSession'], false],
      ['Allow', ['sts:AssumeRole'], true],
      ['Deny', ['sts:AssumeRole'], true],
      ['Deny', ['sts:TagSession'], true],
    ])
    expect(unreadablePolicies(template).some(entry => entry.startsWith('ConditionalTrust'))).toBe(false)
  })

  // What unreadablePolicies reports is left out of policyStatements, so a check over the statements
  // never passes on one it couldn't read.
  it('leaves an unreadable statement out of the statements', () => {
    const ids = new Set(policyStatements(template).map(s => s.logicalId))
    expect(['JoinedAction', 'JoinedNotAction', 'IntrinsicEffect'].some(id => ids.has(id))).toBe(false)
    const partly = policyStatements(template).filter(s => s.logicalId === 'IntrinsicStatement')
    expect(partly.map(s => s.actions)).toEqual([['sts:TagSession']])
  })

  // An Action an intrinsic builds would read as `[object Object]` and grant no model action, so the
  // document holding it is reported, and IAC-01's check can't pass on it unseen.
  it('reports a statement whose Effect, Action or NotAction only CloudFormation can assemble', () => {
    const unreadable = unreadablePolicies(template)
    for (const id of ['JoinedAction', 'JoinedNotAction', 'IntrinsicEffect', 'IntrinsicStatement']) {
      expect(unreadable).toContain(`${id} PolicyDocument`)
    }
    // And nothing aws-cdk-lib's own constructs write, whose actions and effects are always literal.
    expect(unreadable.filter(entry => /^(?:Role|Managed|Bucket|Scp|Set|LogsPolicy)/.test(entry))).toEqual([])
  })
})
