// The test helpers later assertion tests stand on (C11-D70): an in-process synth with cdk.json's
// context, and the policy walker, proved on a small stack holding one policy of each kind they read;
// then IAC-01's check and what it stands on, each proved on planted templates, every breakage found
// and the template without it passing. Model actions are built from the lists, never written (IG-10),
// and ARNs joined from their parts (IG-01).
import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as organizations from 'aws-cdk-lib/aws-organizations'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as sso from 'aws-cdk-lib/aws-sso'
import { beforeAll, describe, expect, it } from 'vitest'
import { grantsModelAction, MODEL_ACTIONS, MODEL_SERVICE_PREFIXES, modelDenyActions } from '../config/models.ts'
import { GITHUB_OIDC_HOST, iamVariable, QUALIFIER } from '../config/names.ts'
import { REGION } from '../config/profiles.ts'
import { fixtureAccount } from './fixture.ts'
import {
  attachedPolicyName,
  isModelDenyInPlace,
  type ModelCheckAllowance,
  managedPolicyAttachments,
  modelCheck,
  modelGrants,
  namesModelAction,
  policyDocuments,
  policyStatements,
  principalOf,
  renderedString,
  unreadablePolicies,
} from './policies.ts'
import { cdkContext, resourcesOf, type Synthesised, synthesise, templateOf, testApp } from './synth.ts'

const [firstPrefix = ''] = MODEL_SERVICE_PREFIXES
const [firstAction = ''] = MODEL_ACTIONS
const actionService = firstAction.slice(0, firstAction.indexOf(':'))

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
  const condition = new cdk.CfnCondition(stack, 'C', { expression: cdk.Fn.conditionEquals('a', 'a') })
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
  // A policy that exists only under a condition, as the bootstrap template's permissions boundary
  // does, an inline user policy, and an Organizations policy whose type only CloudFormation resolves.
  const onCondition = new iam.CfnManagedPolicy(stack, 'OnCondition', {
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Deny', Action: `${firstPrefix}:*`, Resource: '*' }],
    },
  })
  onCondition.cfnOptions.condition = condition
  new iam.CfnUserPolicy(stack, 'UserInline', {
    userName: 'u',
    policyName: 'p',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Action: 'sts:GetCallerIdentity', Resource: '*' }],
    },
  })
  new organizations.CfnPolicy(stack, 'TypeByCondition', {
    name: 'test-type',
    type: cdk.Fn.conditionIf('C', 'SERVICE_CONTROL_POLICY', 'RESOURCE_CONTROL_POLICY').toString(),
    content: { Version: '2012-10-17', Statement: [{ Effect: 'Deny', Action: `${firstPrefix}:*`, Resource: '*' }] },
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

  // What a person's deploy acts on beyond the template, which IAC-24 and the landing-zone checks read.
  it('reads each stack’s artifact: account, Region, termination protection, deploy role and bootstrap version', () => {
    const app = testApp()
    const account = fixtureAccount(1)
    const stack = new cdk.Stack(app, 'Artifact', {
      stackName: 'Hearth-artifact-test',
      terminationProtection: true,
      synthesizer: new cdk.DefaultStackSynthesizer({ qualifier: QUALIFIER.base }),
      env: { account, region: REGION },
    })
    new cdk.CfnWaitConditionHandle(stack, 'Nothing')
    const [artifact] = synthesise(app).stacks.map(s => s.artifact)
    expect(artifact).toMatchObject({
      account,
      region: REGION,
      terminationProtection: true,
      bootstrapStackVersionSsmParameter: `/cdk-bootstrap/${QUALIFIER.base}/version`,
    })
    expect(artifact?.assumeRoleArn).toContain(`:role/cdk-${QUALIFIER.base}-deploy-role-${account}-${REGION}`)
    expect(artifact?.requiresBootstrapStackVersion).toBeGreaterThan(0)
    // A stack with no account and no protection, as the helper stack above.
    expect(synthesised.stacks[0]?.artifact).toMatchObject({ region: REGION, terminationProtection: false })
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
    expect(modelGrants(statements)).toEqual([])
    // Only the denies no condition decides count as in place.
    const denies = statements.filter(s => s.effect === 'Deny' && s.actions.some(grantsModelAction))
    expect(denies.map(s => [s.logicalId.replace(/[0-9A-F]{8}$/, ''), s.conditional])).toEqual([
      ['Managed', false],
      ['Scp', false],
      ['OnCondition', true],
    ])
  })

  // IAC-01's check on a template that breaks it: an Allow naming a model action, `*`, an Allow with
  // NotAction (which grants every action it doesn't name, model actions included) and a conditional
  // Allow are each found; an ordinary Allow and a Deny with NotAction aren't.
  it('IAC-01: modelGrants finds every Allow that can grant a model action, NotAction included', () => {
    const allow = (id: string, statement: Record<string, unknown>) => ({
      [id]: {
        Type: 'AWS::IAM::ManagedPolicy',
        Properties: { PolicyDocument: { Version: '2012-10-17', Statement: [{ Resource: '*', ...statement }] } },
      },
    })
    const breaking = {
      Resources: {
        ...allow('Named', { Effect: 'Allow', Action: `${firstPrefix}:InvokeModel` }),
        ...allow('Everything', { Effect: 'Allow', Action: '*' }),
        ...allow('AllButIam', { Effect: 'Allow', NotAction: 'iam:*' }),
        ...allow('Ordinary', { Effect: 'Allow', Action: ['s3:GetObject', 'logs:PutLogEvents'] }),
        ...allow('DenyAllButIam', { Effect: 'Deny', NotAction: 'iam:*' }),
        Conditional: {
          Type: 'AWS::IAM::ManagedPolicy',
          Properties: {
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  'Fn::If': [
                    'C',
                    { Effect: 'Allow', Action: `${firstPrefix}:*`, Resource: '*' },
                    { Ref: 'AWS::NoValue' },
                  ],
                },
              ],
            },
          },
        },
      },
    }
    expect(unreadablePolicies(breaking)).toEqual([])
    expect(modelGrants(policyStatements(breaking)).map(s => s.logicalId)).toEqual([
      'Named',
      'Everything',
      'AllButIam',
      'Conditional',
    ])
    expect(grantsModelAction('iam:*')).toBe(false)
  })

  it('reads an inline user policy, and reports an Organizations policy whose type only CloudFormation resolves', () => {
    expect(
      policyStatements(template)
        .filter(s => s.logicalId === 'UserInline')
        .map(s => s.actions),
    ).toEqual([['sts:GetCallerIdentity']])
    expect(unreadablePolicies(template)).toContain('TypeByCondition Content')
  })

  it('reports a document only CloudFormation can assemble, rather than skipping it', () => {
    expect(unreadablePolicies(template)).toEqual([
      'Joined PolicyDocument',
      'JoinedAction PolicyDocument',
      'JoinedNotAction PolicyDocument',
      'IntrinsicEffect PolicyDocument',
      'IntrinsicStatement PolicyDocument',
      'TypeByCondition Content',
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

// --- IAC-01's check and what it stands on, on planted templates ---------------------------------

type Template = Record<string, unknown>

// An IAM document, the in-place model deny, an Allow of everything, and an AWS-managed policy's ARN
// joined from its parts.
const doc = (...Statement: unknown[]) => ({ Version: '2012-10-17', Statement })
const noModels = (): Record<string, unknown> => ({
  Sid: 'NoModels',
  Effect: 'Deny',
  Action: modelDenyActions(),
  Resource: '*',
})
const allowAll = (Sid = 'AllowAll') => ({ Sid, Effect: 'Allow', Action: '*', Resource: '*' })
const awsPolicy = (name: string) => ['arn', 'aws', 'iam', '', 'aws', `policy/${name}`].join(':')
const role = (statements: unknown[], properties: Record<string, unknown> = {}) => ({
  Type: 'AWS::IAM::Role',
  Properties: {
    AssumeRolePolicyDocument: doc({
      Effect: 'Allow',
      Principal: { Service: 'ecs-tasks.amazonaws.com' },
      Action: 'sts:AssumeRole',
    }),
    Policies: [{ PolicyName: 'inline', PolicyDocument: doc(...statements) }],
    ...properties,
  },
})
// A service-wide grant (`<service>:*` of a service with model actions) and a pattern naming a model
// action by its first letters and `*`, built from the lists (IG-10).
const serviceWide = `${actionService}:*`
const actionPrefix = `${firstAction.slice(0, actionService.length + 4)}*`

// A template that passes IAC-01: a role allowed everything beside its deny and attaching
// AdministratorAccess (as HearthOrgAdmin's set does), hearth-boundary's shape (Allow everything,
// deny models) bounding a role allowed everything, a permission set attaching ReadOnlyAccess beside
// its inline deny, a bucket policy that only denies, and a role with an ordinary Allow.
function passing(): Template {
  return {
    Parameters: { ExecutionPolicies: { Type: 'CommaDelimitedList', Default: '' } },
    Conditions: { C: { 'Fn::Equals': ['a', 'a'] } },
    Resources: {
      Operator: role([allowAll(), noModels()], { ManagedPolicyArns: [awsPolicy('AdministratorAccess')] }),
      Boundary: {
        Type: 'AWS::IAM::ManagedPolicy',
        Properties: { ManagedPolicyName: 'hearth-boundary', PolicyDocument: doc(allowAll(), noModels()) },
      },
      Bounded: role([allowAll('Everything')], { PermissionsBoundary: { Ref: 'Boundary' } }),
      Set: {
        Type: 'AWS::SSO::PermissionSet',
        Properties: { Name: 'Set', ManagedPolicies: [awsPolicy('ReadOnlyAccess')], InlinePolicy: doc(noModels()) },
      },
      Logs: {
        Type: 'AWS::S3::BucketPolicy',
        Properties: {
          Bucket: 'logs',
          PolicyDocument: doc({
            Sid: 'TlsOnly',
            Effect: 'Deny',
            Principal: '*',
            Action: 's3:*',
            Resource: '*',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        },
      },
      Deployer: role([{ Sid: 'Pass', Effect: 'Allow', Action: 'iam:PassRole', Resource: '*' }]),
    },
  }
}
const allowance: ModelCheckAllowance = {
  grants: [],
  attachments: [
    { logicalId: 'Operator', policy: 'AdministratorAccess' },
    { logicalId: 'Set', policy: 'ReadOnlyAccess' },
  ],
}
// The passing template with some resources added or replaced.
const planted = (resources: Record<string, unknown>): Template => {
  const base = passing()
  return { ...base, Resources: { ...(base.Resources as Record<string, unknown>), ...resources } }
}
// The passing template's Operator with its deny (or a broken one) and any other statement passed.
const operator = (...extra: unknown[]) =>
  role([allowAll(), ...extra], { ManagedPolicyArns: [awsPolicy('AdministratorAccess')] })
// The problem an Allow of everything raises when its principal has no deny in place.
const uncovered = (key: string, where = 'Operator Policies[0].PolicyDocument AllowAll') => [
  `${where}: * can grant a model action, and ${key} has no model deny in place`,
]

describe('IAC-01 C11-D06: the managed policies a template attaches', () => {
  it('reads a role’s, group’s and permission set’s attachments and boundaries, normalising each policy', () => {
    const template: Template = {
      Parameters: { ExecutionPolicies: { Type: 'CommaDelimitedList' } },
      Resources: {
        Own: { Type: 'AWS::IAM::ManagedPolicy', Properties: { PolicyDocument: doc(noModels()) } },
        Exec: {
          Type: 'AWS::IAM::Role',
          Properties: {
            ManagedPolicyArns: [
              {
                'Fn::Sub': ['arn', iamVariable('AWS::Partition'), 'iam', '', 'aws', 'policy/AdministratorAccess'].join(
                  ':',
                ),
              },
              awsPolicy('ReadOnlyAccess'),
              { 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':iam::aws:policy/service-role/Example']] },
              { Ref: 'ExecutionPolicies' },
              { Ref: 'Own' },
              ['arn', 'aws', 'iam', '', fixtureAccount(3), 'policy/hearth-boundary'].join(':'),
              { 'Fn::GetAtt': ['Own', 'PolicyArn'] },
            ],
            PermissionsBoundary: { Ref: 'Own' },
          },
        },
        Lookup: {
          Type: 'AWS::IAM::Role',
          Condition: 'C',
          Properties: {
            ManagedPolicyArns: {
              'Fn::If': ['C', { Ref: 'ExecutionPolicies' }, [awsPolicy('ViewOnlyAccess')]],
            },
          },
        },
        Readers: {
          Type: 'AWS::IAM::Group',
          Properties: {
            ManagedPolicyArns: [{ 'Fn::If': ['C', awsPolicy('ReadOnlyAccess'), { Ref: 'AWS::NoValue' }] }],
          },
        },
        Set: {
          Type: 'AWS::SSO::PermissionSet',
          Properties: {
            ManagedPolicies: [awsPolicy('job-function/Billing')],
            CustomerManagedPolicyReferences: [{ Name: 'hearth-extra' }],
            PermissionsBoundary: { ManagedPolicyArn: awsPolicy('PowerUserAccess') },
          },
        },
        CustomerBounded: {
          Type: 'AWS::SSO::PermissionSet',
          Properties: { PermissionsBoundary: { CustomerManagedPolicyReference: { Name: 'hearth-boundary' } } },
        },
      },
    }
    const attachments = managedPolicyAttachments(template)
    expect(attachments.map(a => [a.principal, a.where, a.conditional, a.policy])).toEqual([
      ['role:Exec', 'ManagedPolicyArns[0]', false, { kind: 'aws', name: 'AdministratorAccess' }],
      ['role:Exec', 'ManagedPolicyArns[1]', false, { kind: 'aws', name: 'ReadOnlyAccess' }],
      ['role:Exec', 'ManagedPolicyArns[2]', false, { kind: 'aws', name: 'service-role/Example' }],
      ['role:Exec', 'ManagedPolicyArns[3]', false, { kind: 'parameter', name: 'ExecutionPolicies' }],
      ['role:Exec', 'ManagedPolicyArns[4]', false, { kind: 'template', logicalId: 'Own' }],
      // An account's own policy, and an attribute no static reading resolves.
      ['role:Exec', 'ManagedPolicyArns[5]', false, { kind: 'unreadable' }],
      ['role:Exec', 'ManagedPolicyArns[6]', false, { kind: 'unreadable' }],
      ['role:Exec', 'PermissionsBoundary', false, { kind: 'template', logicalId: 'Own' }],
      // Each branch of an Fn::If, AWS::NoValue dropped, on a resource that carries a Condition.
      ['role:Lookup', 'ManagedPolicyArns[0]', true, { kind: 'parameter', name: 'ExecutionPolicies' }],
      ['role:Lookup', 'ManagedPolicyArns[1]', true, { kind: 'aws', name: 'ViewOnlyAccess' }],
      ['group:Readers', 'ManagedPolicyArns[0]', true, { kind: 'aws', name: 'ReadOnlyAccess' }],
      ['set:Set', 'ManagedPolicies[0]', false, { kind: 'aws', name: 'job-function/Billing' }],
      ['set:Set', 'CustomerManagedPolicyReferences[0]', false, { kind: 'unreadable' }],
      ['set:Set', 'PermissionsBoundary', false, { kind: 'aws', name: 'PowerUserAccess' }],
      ['set:CustomerBounded', 'PermissionsBoundary', false, { kind: 'unreadable' }],
    ])
    // As modelCheck's allow-list names them; one no static reading resolves has no name.
    expect(attachments.map(a => attachedPolicyName(a.policy))).toEqual([
      'AdministratorAccess',
      'ReadOnlyAccess',
      'service-role/Example',
      'parameter:ExecutionPolicies',
      'template:Own',
      undefined,
      undefined,
      'template:Own',
      'parameter:ExecutionPolicies',
      'ViewOnlyAccess',
      'ReadOnlyAccess',
      'job-function/Billing',
      undefined,
      'PowerUserAccess',
      undefined,
    ])
  })
})

describe('IAC-01 C11-D06: whose statement it is', () => {
  const template: Template = {
    Resources: {
      Named: { Type: 'AWS::IAM::Role', Properties: { RoleName: 'hearth-named' } },
      Plain: role([allowAll()]),
      Attached: {
        Type: 'AWS::IAM::ManagedPolicy',
        Properties: { Roles: [{ Ref: 'Plain' }, 'hearth-named'], PolicyDocument: doc(noModels()) },
      },
      Loose: { Type: 'AWS::IAM::ManagedPolicy', Properties: { PolicyDocument: doc(noModels()) } },
      Elsewhere: {
        Type: 'AWS::IAM::Policy',
        Properties: { PolicyName: 'p', Roles: ['someone-else', { Ref: 'Loose' }], PolicyDocument: doc(allowAll()) },
      },
      Unlisted: {
        Type: 'AWS::IAM::Policy',
        Properties: { PolicyName: 'p', Roles: { Ref: 'AWS::NoValue' }, PolicyDocument: doc(allowAll()) },
      },
      Inline: {
        Type: 'AWS::IAM::RolePolicy',
        Properties: { RoleName: { Ref: 'Named' }, PolicyName: 'p', PolicyDocument: doc(allowAll()) },
      },
      Set: { Type: 'AWS::SSO::PermissionSet', Properties: { InlinePolicy: doc(noModels()) } },
      Bucket: {
        Type: 'AWS::S3::BucketPolicy',
        Properties: { Bucket: 'b', PolicyDocument: doc({ ...allowAll(), Principal: '*' }) },
      },
      Scp: {
        Type: 'AWS::Organizations::Policy',
        Properties: { Type: 'SERVICE_CONTROL_POLICY', Content: doc(noModels()) },
      },
      Key: { Type: 'AWS::KMS::Key', Properties: { KeyPolicy: doc({ ...allowAll(), Principal: '*' }) } },
    },
  }

  it('gives an identity statement its principals, and a trust, resource policy or SCP none', () => {
    const owners = policyStatements(template).map(s => [s.logicalId, s.where, principalOf(s, template)])
    expect(owners).toEqual([
      ['Plain', 'AssumeRolePolicyDocument', undefined],
      ['Plain', 'Policies[0].PolicyDocument', ['role:Plain']],
      ['Attached', 'PolicyDocument', ['role:Plain', 'role:Named']],
      ['Loose', 'PolicyDocument', ['managed:Loose']],
      // A name no role of the template has, and a Ref to something that isn't a role, cover nobody.
      ['Elsewhere', 'PolicyDocument', ['unresolved:Elsewhere.Roles[0]', 'unresolved:Elsewhere.Roles[1]']],
      ['Unlisted', 'PolicyDocument', ['unresolved:Unlisted.Roles']],
      ['Inline', 'PolicyDocument', ['role:Named']],
      ['Set', 'InlinePolicy', ['set:Set']],
      ['Bucket', 'PolicyDocument', undefined],
      ['Scp', 'Content', undefined],
      ['Key', 'KeyPolicy', undefined],
    ])
  })
})

describe('IAC-01 C11-D06: which deny counts as in place', () => {
  const statementOf = (statement: unknown, resource: Record<string, unknown> = {}) => {
    const template = {
      Resources: {
        P: { Type: 'AWS::IAM::ManagedPolicy', ...resource, Properties: { PolicyDocument: doc(statement) } },
      },
    }
    const [found] = policyStatements(template)
    if (found === undefined) throw new Error('no statement')
    return found
  }

  it('is a Deny of every model action on everything, which no condition decides', () => {
    expect(isModelDenyInPlace(statementOf(noModels()))).toBe(true)
    // More actions beside the model list leave it in place.
    expect(isModelDenyInPlace(statementOf({ ...noModels(), Action: [...modelDenyActions(), 'iam:CreateUser'] }))).toBe(
      true,
    )
    const broken: Array<[string, unknown, Record<string, unknown>?]> = [
      ['an Allow', { ...noModels(), Effect: 'Allow' }],
      ['an IAM condition', { ...noModels(), Condition: { ArnLike: { 'aws:PrincipalArn': 'x' } } }],
      ['one action short', { ...noModels(), Action: modelDenyActions().slice(1) }],
      ['a resource narrower than *', { ...noModels(), Resource: 'hearth-*' }],
      ['* among other resources', { ...noModels(), Resource: ['*', 'x'] }],
      ['a NotResource', { Sid: 'NoModels', Effect: 'Deny', Action: modelDenyActions(), NotResource: 'x' }],
      ['a NotAction', { Sid: 'NoModels', Effect: 'Deny', NotAction: 'iam:*', Resource: '*' }],
      ['a statement under Fn::If', { 'Fn::If': ['C', noModels(), { Ref: 'AWS::NoValue' }] }],
      ['a resource under a Condition', noModels(), { Condition: 'C' }],
    ]
    for (const [what, statement, resource] of broken) {
      expect(isModelDenyInPlace(statementOf(statement, resource)), what).toBe(false)
    }
  })
})

describe('IAC-01 C11-D06: which Allow names a model action outright', () => {
  it('any pattern but * whose service can be a model service, or whose action part can be a model action', () => {
    for (const pattern of modelDenyActions()) expect(namesModelAction(pattern), pattern).toBe(true)
    for (const prefix of MODEL_SERVICE_PREFIXES) expect(namesModelAction(`${prefix}:Describe*`), prefix).toBe(true)
    const named = [
      `${firstPrefix}:InvokeModel`,
      firstAction.toUpperCase(),
      actionPrefix,
      's*:*',
      '*:*',
      `${actionService}:*${firstAction.slice(actionService.length + 2)}`,
    ]
    for (const pattern of named) expect(namesModelAction(pattern), pattern).toBe(true)
    // `*` and an allowed service's `<service>:*` are the second rule's; ordinary reads name nothing.
    const notNamed = ['*', serviceWide, 'cloudwatch:Get*', 'logs:StartQuery', 'cloudtrail:LookupEvents', 's3:GetObject']
    for (const pattern of notNamed) expect(namesModelAction(pattern), pattern).toBe(false)
    expect(grantsModelAction(serviceWide)).toBe(true)
  })
})

describe('IAC-01 C11-D06: a value as CloudFormation renders it', () => {
  const account = fixtureAccount(4)
  const template: Template = {
    Parameters: { Name: { Type: 'String' } },
    Resources: {
      Bucket: { Type: 'AWS::S3::Bucket', Properties: { BucketName: `hearth-org-trail-${account}` } },
      Unnamed: { Type: 'AWS::S3::Bucket', Properties: {} },
      Role: { Type: 'AWS::IAM::Role', Properties: { RoleName: 'hearth-break-glass', Path: '/team/' } },
      Group: { Type: 'AWS::Logs::LogGroup', Properties: { LogGroupName: '/hearth/security/org-trail' } },
      Topic: { Type: 'AWS::SNS::Topic', Properties: { TopicName: 'hearth-ops-alerts' } },
      Provider: { Type: 'AWS::IAM::OIDCProvider', Properties: { Url: `https://${GITHUB_OIDC_HOST}` } },
      Boundary: { Type: 'AWS::IAM::ManagedPolicy', Properties: { ManagedPolicyName: 'hearth-boundary' } },
      Key: { Type: 'AWS::KMS::Key', Properties: {} },
    },
  }
  const context = { account, region: REGION, template }
  const arn = (...parts: string[]) => ['arn', 'aws', ...parts].join(':')
  const bucket = `hearth-org-trail-${account}`

  it('renders literals, pseudo-parameters, Fn::Join and Fn::Sub', () => {
    const cases: Array<[unknown, string]> = [
      ['text', 'text'],
      [{ Ref: 'AWS::Partition' }, 'aws'],
      [{ Ref: 'AWS::Region' }, REGION],
      [{ Ref: 'AWS::AccountId' }, account],
      [{ Ref: 'AWS::URLSuffix' }, 'amazonaws.com'],
      [{ 'Fn::Join': [':', ['a', { Ref: 'AWS::Region' }, 'b']] }, `a:${REGION}:b`],
      [{ 'Fn::Sub': ['x', iamVariable('AWS::AccountId'), 'y'].join('-') }, `x-${account}-y`],
      [{ 'Fn::Sub': [`${iamVariable('Who')}/${iamVariable('AWS::Region')}`, { Who: 'me' }] }, `me/${REGION}`],
      // ${!…} is CloudFormation's escape for a literal ${…}, as an IAM variable is written in a Sub.
      [{ 'Fn::Sub': `${iamVariable('!aws:username')}` }, iamVariable('aws:username')],
      [{ 'Fn::Sub': `${iamVariable('Bucket.Arn')}/*` }, `${arn('s3', '', '', bucket)}/*`],
    ]
    for (const [value, text] of cases) expect(renderedString(value, context), JSON.stringify(value)).toBe(text)
  })

  it('renders a reference or attribute whose resource’s properties fix it, and nothing else', () => {
    const cases: Array<[unknown, string | undefined]> = [
      [{ Ref: 'Bucket' }, bucket],
      [{ 'Fn::GetAtt': ['Bucket', 'Arn'] }, arn('s3', '', '', bucket)],
      [{ 'Fn::GetAtt': 'Bucket.Arn' }, arn('s3', '', '', bucket)],
      [{ Ref: 'Role' }, 'hearth-break-glass'],
      [{ 'Fn::GetAtt': ['Role', 'Arn'] }, arn('iam', '', account, 'role/team/hearth-break-glass')],
      [{ Ref: 'Group' }, '/hearth/security/org-trail'],
      [{ 'Fn::GetAtt': ['Group', 'Arn'] }, arn('logs', REGION, account, 'log-group:/hearth/security/org-trail:*')],
      [{ Ref: 'Topic' }, arn('sns', REGION, account, 'hearth-ops-alerts')],
      [{ 'Fn::GetAtt': ['Topic', 'TopicName'] }, 'hearth-ops-alerts'],
      [{ Ref: 'Provider' }, arn('iam', '', account, `oidc-provider/${GITHUB_OIDC_HOST}`)],
      [{ Ref: 'Boundary' }, arn('iam', '', account, 'policy/hearth-boundary')],
      // Undefined is "could be anything": a key's id, a name CloudFormation makes up, a parameter, a
      // pseudo-parameter that varies, a condition's choice or an import.
      [{ Ref: 'Key' }, undefined],
      [{ 'Fn::GetAtt': ['Key', 'Arn'] }, undefined],
      [{ Ref: 'Unnamed' }, undefined],
      [{ 'Fn::GetAtt': ['Unnamed', 'Arn'] }, undefined],
      [{ Ref: 'Name' }, undefined],
      [{ Ref: 'AWS::StackName' }, undefined],
      [{ 'Fn::Join': ['', ['a', { Ref: 'Name' }]] }, undefined],
      [{ 'Fn::Sub': `a-${iamVariable('Name')}` }, undefined],
      [{ 'Fn::If': ['C', 'a', 'b'] }, undefined],
      [{ 'Fn::ImportValue': 'x' }, undefined],
      [['a'], undefined],
      [42, undefined],
    ]
    for (const [value, text] of cases) expect(renderedString(value, context), JSON.stringify(value)).toBe(text)
    // Without the stack's account, what needs it can't be rendered.
    expect(renderedString({ Ref: 'AWS::AccountId' }, { template })).toBeUndefined()
    expect(renderedString({ 'Fn::GetAtt': ['Role', 'Arn'] }, { region: REGION, template })).toBeUndefined()
  })
})

describe('IAC-01 C11-D06, C11-D10, C11-D75: the model check on planted templates', () => {
  it('passes the template with every deny in place', () => {
    expect(modelCheck(passing(), allowance)).toEqual([])
  })

  it('finds a role attaching AdministratorAccess with no deny, then passes it with one', () => {
    const admin = (...statements: unknown[]) =>
      role([{ Sid: 'Read', Effect: 'Allow', Action: 's3:GetObject', Resource: '*' }, ...statements], {
        ManagedPolicyArns: [awsPolicy('AdministratorAccess')],
      })
    const listed = {
      ...allowance,
      attachments: [...allowance.attachments, { logicalId: 'Admin', policy: 'AdministratorAccess' }],
    }
    expect(modelCheck(planted({ Admin: admin() }), listed)).toEqual([
      'Admin ManagedPolicyArns[0]: attached to role:Admin, which has no model deny in place',
    ])
    expect(modelCheck(planted({ Admin: admin(noModels()) }), listed)).toEqual([])
  })

  it('finds a deny an IAM condition narrows, one under Fn::If and one an action short', () => {
    const attached = 'Operator ManagedPolicyArns[0]: attached to role:Operator, which has no model deny in place'
    const partial = [
      { ...noModels(), Condition: { ArnLike: { 'aws:PrincipalArn': 'x' } } },
      { 'Fn::If': ['C', noModels(), { Ref: 'AWS::NoValue' }] },
      { ...noModels(), Action: modelDenyActions().slice(0, -1) },
    ]
    for (const deny of partial) {
      expect(modelCheck(planted({ Operator: operator(deny) }), allowance)).toEqual([
        ...uncovered('role:Operator'),
        attached,
      ])
    }
    expect(modelCheck(planted({ Operator: operator(noModels()) }), allowance)).toEqual([])
  })

  it('finds a customer-managed policy reference, an unlisted policy and an unreadable one', () => {
    const set = (properties: Record<string, unknown>) => ({
      Type: 'AWS::SSO::PermissionSet',
      Properties: { Name: 'Set', InlinePolicy: doc(noModels()), ...properties },
    })
    expect(
      modelCheck(planted({ Set: set({ CustomerManagedPolicyReferences: [{ Name: 'hearth-extra' }] }) }), allowance),
    ).toEqual([
      "Set CustomerManagedPolicyReferences[0]: a customer-managed policy reference, whose document isn't in the template",
    ])
    expect(modelCheck(planted({ Set: set({ ManagedPolicies: [awsPolicy('PowerUserAccess')] }) }), allowance)).toEqual([
      "Set ManagedPolicies[0]: PowerUserAccess isn't on the allow-list",
    ])
    const own = ['arn', 'aws', 'iam', '', fixtureAccount(3), 'policy/hearth-extra'].join(':')
    expect(modelCheck(planted({ Set: set({ ManagedPolicies: [own] }) }), allowance)).toEqual([
      'Set ManagedPolicies[0]: a managed policy no static reading resolves',
    ])
    expect(modelCheck(planted({ Set: set({}) }), allowance)).toEqual([])
    // A parameter the deployer fills is listed by name, as the bootstrap's execution policies are.
    const exec = role([noModels()], { ManagedPolicyArns: { Ref: 'ExecutionPolicies' } })
    expect(modelCheck(planted({ Exec: exec }), allowance)).toEqual([
      "Exec ManagedPolicyArns[0]: parameter:ExecutionPolicies isn't on the allow-list",
    ])
    const withParameter = {
      ...allowance,
      attachments: [...allowance.attachments, { logicalId: 'Exec', policy: 'parameter:ExecutionPolicies' }],
    }
    expect(modelCheck(planted({ Exec: exec }), withParameter)).toEqual([])
  })

  it('finds an unlisted conditional Allow of everything, and lets one through only as listed and while its check holds', () => {
    const conditional = {
      Conditional: {
        Type: 'AWS::IAM::ManagedPolicy',
        Condition: 'C',
        Properties: { PolicyDocument: doc(allowAll('ExplicitAllowAll')) },
      },
    }
    const problem = uncovered('managed:Conditional', 'Conditional PolicyDocument ExplicitAllowAll')
    expect(modelCheck(planted(conditional), allowance)).toEqual(problem)
    const onCondition = (t: Template) =>
      ((t.Resources as Record<string, { Condition?: string }>).Conditional?.Condition ?? '') === 'C'
    const listed = (grant: ModelCheckAllowance['grants'][number]) => ({ ...allowance, grants: [grant] })
    expect(
      modelCheck(
        planted(conditional),
        listed({ logicalId: 'Conditional', sid: 'ExplicitAllowAll', when: onCondition }),
      ),
    ).toEqual([])
    expect(modelCheck(planted(conditional), listed({ logicalId: 'Conditional', when: () => false }))).toEqual(problem)
    expect(modelCheck(planted(conditional), listed({ logicalId: 'Conditional', sid: 'Other' }))).toEqual(problem)
  })

  it('finds an Allow with NotAction, whatever deny sits beside it', () => {
    const notAction = { Sid: 'AllButIam', Effect: 'Allow', NotAction: 'iam:*', Resource: '*' }
    expect(modelCheck(planted({ Operator: operator(noModels(), notAction) }), allowance)).toEqual([
      "Operator Policies[0].PolicyDocument AllButIam: an Allow with NotAction grants what it doesn't name",
    ])
  })

  // Rule 1: a model action named outright is refused beside the deny and whatever the allowance says.
  it('finds an Allow of a model action, or of a model service’s actions, beside the in-place deny', () => {
    const everyGrant = { ...allowance, grants: [{ logicalId: 'Operator' }] }
    for (const action of [firstAction, `${firstPrefix}:Get*`]) {
      const allow = { Sid: 'Named', Effect: 'Allow', Action: ['s3:GetObject', action], Resource: '*' }
      expect(modelCheck(planted({ Operator: operator(noModels(), allow) }), everyGrant)).toEqual([
        `Operator Policies[0].PolicyDocument Named: an Allow names a model action (${action})`,
      ])
    }
  })

  // Rule 2: `*` and a `<service>:*` that overlaps a model action need the principal's own deny, or its
  // boundary's.
  it('finds a service-wide Allow without the principal’s deny, and a boundary that is conditional or denies nothing', () => {
    const wide = { Sid: 'Wide', Effect: 'Allow', Action: serviceWide, Resource: '*' }
    expect(modelCheck(planted({ Deployer: role([wide]) }), allowance)).toEqual([
      `Deployer Policies[0].PolicyDocument Wide: ${serviceWide} can grant a model action, and role:Deployer has no model deny in place`,
    ])
    expect(modelCheck(planted({ Deployer: role([wide, noModels()]) }), allowance)).toEqual([])
    const everything = uncovered('role:Bounded', 'Bounded Policies[0].PolicyDocument Everything')
    const ifBounded = { 'Fn::If': ['C', { Ref: 'Boundary' }, { Ref: 'AWS::NoValue' }] }
    expect(
      modelCheck(planted({ Bounded: role([allowAll('Everything')], { PermissionsBoundary: ifBounded }) }), allowance),
    ).toEqual(everything)
    const allowOnly = {
      Type: 'AWS::IAM::ManagedPolicy',
      Properties: { ManagedPolicyName: 'hearth-boundary', PolicyDocument: doc(allowAll()) },
    }
    expect(modelCheck(planted({ Boundary: allowOnly }), allowance)).toEqual([
      ...uncovered('managed:Boundary', 'Boundary PolicyDocument AllowAll'),
      ...everything,
    ])
    // An AWS-managed boundary isn't one the template shows denying.
    const awsBounded = role([allowAll('Everything')], { PermissionsBoundary: awsPolicy('PowerUserAccess') })
    expect(modelCheck(planted({ Bounded: awsBounded }), allowance)).toEqual(everything)
  })

  it('covers a policy attached to a role by that role’s deny, and never one attached to a role it can’t resolve', () => {
    const attached = (roles: unknown[]) => ({
      Extra: {
        Type: 'AWS::IAM::Policy',
        Properties: { PolicyName: 'extra', Roles: roles, PolicyDocument: doc(allowAll()) },
      },
    })
    expect(modelCheck(planted(attached([{ Ref: 'Operator' }])), allowance)).toEqual([])
    expect(modelCheck(planted(attached([{ Ref: 'Operator' }, 'someone-else'])), allowance)).toEqual(
      uncovered('unresolved:Extra.Roles[1]', 'Extra PolicyDocument AllowAll'),
    )
  })

  it('finds a model grant in a resource policy or an SCP, which binds no principal of the template’s', () => {
    const open = {
      Logs: {
        Type: 'AWS::S3::BucketPolicy',
        Properties: { Bucket: 'logs', PolicyDocument: doc({ ...allowAll('Open'), Principal: { AWS: '*' } }) },
      },
      Scp: {
        Type: 'AWS::Organizations::Policy',
        Properties: {
          Type: 'SERVICE_CONTROL_POLICY',
          Content: JSON.stringify(doc({ Sid: 'Wide', Effect: 'Allow', Action: serviceWide, Resource: '*' })),
        },
      },
    }
    expect(modelCheck(planted(open), { ...allowance, grants: [{ logicalId: 'Logs' }, { logicalId: 'Scp' }] })).toEqual([
      'Logs PolicyDocument Open: * in a trust, resource policy, SCP or RCP can grant a model action',
      `Scp Content Wide: ${serviceWide} in a trust, resource policy, SCP or RCP can grant a model action`,
    ])
  })

  it('finds a document no static reading resolves', () => {
    const joined = {
      Joined: {
        Type: 'AWS::IAM::ManagedPolicy',
        Properties: { PolicyDocument: { 'Fn::Join': ['', ['{"Version":"2012-10-17",', '"Statement":[]}']] } },
      },
    }
    expect(modelCheck(planted(joined), allowance)).toEqual(['Joined PolicyDocument: unreadable'])
  })
})
