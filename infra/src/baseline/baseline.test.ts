// Hearth-nonprod-Baseline and Hearth-prod-Baseline (C11-D11, C11-D12, C11-D16, C11-D26, C11-D43, C11-D44,
// C11-D55; TECH-SPEC T24 items 4, 5 and 11), each statement as this file writes it:
// - IAC-11: hearth-break-glass's trust (the entry set's role in its own account, the person's sign-in
//   name as source identity, one reason tag of a reason's shape) and its scope, each grant under the
//   reason it needs: the bootstrap login and input under bootstrap: or recover:, the read-only login
//   under case:, the hearthbase roles under lz:pr- alone, each taking the session's source identity
//   on both sides, its grant and the role's trust in the committed bootstrap template; and every deny
//   unconditional;
// - IAC-10: GitHub's provider and roles, each trust exactly one environment's subject of the deploy
//   workflow on main; hearth-gh-deploy stops and tags only its own one-off tasks and assumes only the
//   two hearthapp roles; hearth-gh-diff reads the prod stacks and nothing else; hearth-boundary's
//   statements, NoNewIdentityProviders among them, within a managed policy's limit;
// - the fast rules each account holds, their patterns, states and inputs, and the topic they email;
// - C11-D43: the zones, Amazon's CAA alone, retained once made, and prod's `nonprod.` delegation only once its
//   name servers are committed, which a variant shows; C11-D44: the server image's repository.
// prod's statements also name the restore stage, which lives in its account (C11-Q02). Expected ARNs
// are joined from their parts (IG-01) and the model deny comes from the lists (IG-10).
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEPLOY_WORKFLOW_REF, githubSubject } from '../config/env.ts'
import { modelDenyActions } from '../config/models.ts'
import { appHost, userContentHost } from '../config/profiles.ts'
import { fixtureConfig } from '../testing/fixture.ts'
import { type LandingZoneSynth, synthLandingZone } from '../testing/landing-zone.ts'
import { policyStatements, renderedString } from '../testing/policies.ts'
import { LZ_REASON_SHAPES, REASON_SHAPES } from './break-glass.ts'

type Template = Record<string, unknown>
interface Resource {
  Type: string
  Properties?: Record<string, unknown>
  DependsOn?: string[]
  DeletionPolicy?: string
  UpdateReplacePolicy?: string
}
type Kind = 'nonprod' | 'prod'

const fixture = fixtureConfig()
const { logArchive } = fixture.accounts
const REGION = 'ap-southeast-1'
const S3_VIA = `s3.${REGION}.amazonaws.com`
const ACCOUNT: Record<Kind, string> = { nonprod: fixture.accounts.nonprod, prod: fixture.accounts.prod }
// Each account's stages: the restore stage lives in prod's account (C11-Q02).
const STAGES: Record<Kind, readonly string[]> = { nonprod: ['nonprod'], prod: ['prod', 'restore'] }
const KINDS: readonly Kind[] = ['nonprod', 'prod']

const resourcesIn = (template: Template): Array<[string, Resource]> =>
  Object.entries((template.Resources ?? {}) as Record<string, Resource>)
const ofType = (template: Template, type: string) => resourcesIn(template).filter(([, r]) => r.Type === type)
function one(template: Template, type: string, property: string, value: unknown): [string, Resource] {
  const found = ofType(template, type).filter(([, r]) => r.Properties?.[property] === value)
  if (found.length !== 1) throw new Error(`${found.length} ${type} with ${property} ${String(value)}, not one`)
  return found[0] as [string, Resource]
}
const arn = (service: string, region: string, account: string, resource: string) =>
  ['arn', 'aws', service, region, account, resource].join(':')
const variable = (name: string) => `\${${name}}`
const document = (Statement: unknown[]) => ({ Version: '2012-10-17', Statement })
const NO_MODELS = { Sid: 'NoModels', Effect: 'Deny', Action: modelDenyActions(), Resource: '*' }
const RULE9_SECRETS = [
  {
    Sid: 'NoRule9SecretByName',
    Effect: 'Deny',
    Action: 'secretsmanager:GetSecretValue',
    Resource: arn('secretsmanager', '*', '*', 'secret:hearth/*/rule9*'),
  },
  {
    Sid: 'NoRule9SecretByTag',
    Effect: 'Deny',
    Action: 'secretsmanager:GetSecretValue',
    Resource: '*',
    Condition: { StringEquals: { 'secretsmanager:ResourceTag/hearth:access': 'rule9' } },
  },
]

let lz: LandingZoneSynth
const templateOf = (kind: Kind) => (kind === 'nonprod' ? lz.templates.nonprodBaseline : lz.templates.prodBaseline)
const roleIn = (kind: Kind, name: string) => one(templateOf(kind), 'AWS::IAM::Role', 'RoleName', name)

beforeAll(() => {
  lz = synthLandingZone()
}, 60_000)

describe.each(KINDS)('C11-D27: %s’s construct ids, which the nag allowances and the runbook name', kind => {
  it('C11-D27: each of the Baseline’s constructs holds these, by id', () => {
    const stack = kind === 'nonprod' ? lz.stacks.nonprodBaseline : lz.stacks.prodBaseline
    const childrenOf = (id: string) => stack?.node.tryFindChild(id)?.node.children.map(child => child.node.id)
    expect(childrenOf('Boundary')).toEqual(['Policy'])
    expect(childrenOf('GithubOidc')).toEqual(
      kind === 'prod'
        ? ['Provider', 'DeployRole', 'DeployRoleArn', 'DiffRole', 'DiffRoleArn']
        : ['Provider', 'DeployRole', 'DeployRoleArn'],
    )
    expect(childrenOf('BreakGlass')).toEqual(['Role'])
    expect(childrenOf('OpsAlerts')).toEqual(['Topic'])
    expect(childrenOf('FastAlarms')).toEqual(
      kind === 'prod'
        ? [
            'A1BreakGlass',
            'A7EcsChanges',
            'A7RunCommand',
            'A7RunEnvironment',
            'A8Sessions',
            'A14Deployments',
            'A15Hearthbase',
          ]
        : ['A1BreakGlass', 'A14Deployments', 'A15Hearthbase'],
    )
    expect(childrenOf('ServerRepository')).toEqual(['Repository', 'Name'])
    expect(childrenOf('Zones')).toEqual(
      kind === 'prod'
        ? ['App', 'UserContent', 'AppZoneId', 'UserContentZoneId']
        : ['App', 'UserContent', 'AppNameServers', 'UserContentNameServers', 'AppZoneId', 'UserContentZoneId'],
    )
  })
})

// --- IAC-11: hearth-break-glass --------------------------------------------------------------------

// The trust (C11-D11).
const trust = (account: string) =>
  document([
    {
      Sid: 'EntrySetOnly',
      Effect: 'Allow',
      Principal: { AWS: arn('iam', '', account, 'root') },
      Action: ['sts:AssumeRole', 'sts:SetSourceIdentity', 'sts:TagSession'],
      Condition: {
        ArnLike: {
          'aws:PrincipalArn': arn(
            'iam',
            '',
            account,
            'role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_HearthBreakGlassEntry_*',
          ),
        },
        StringEquals: { 'sts:SourceIdentity': variable('aws:PrincipalTag/hearth-user'), 'aws:RequestedRegion': REGION },
        'ForAllValues:StringEquals': { 'aws:TagKeys': ['hearth-reason'] },
        Null: { 'aws:RequestTag/hearth-reason': 'false', 'sts:SourceIdentity': 'false' },
        StringLike: { 'aws:RequestTag/hearth-reason': [...REASON_SHAPES] },
      },
    },
  ])

// A workload account's break-glass scope (C11-D12, C11-D78), statement by statement.
function breakGlassStatements(kind: Kind): unknown[] {
  const account = ACCOUNT[kind]
  const stages = STAGES[kind]
  const at = (service: string, resource: string) => arn(service, REGION, account, resource)
  const clusters = stages.map(s => at('ecs', `cluster/hearth-${s}`))
  const tasks = stages.map(s => at('ecs', `task/hearth-${s}/*`))
  const bastionRoles = stages.flatMap(s => [
    arn('iam', '', account, `role/hearth-${s}-bastion-task`),
    arn('iam', '', account, `role/hearth-${s}-bastion-exec`),
  ])
  const entries = arn('s3', '', '', `hearth-break-glass-log-${logArchive}`)
  const hearthbase = (role: string) => arn('iam', '', account, `role/cdk-hearthbase-${role}-${account}-${REGION}`)
  return [
    {
      Sid: 'ReadLogs',
      Effect: 'Allow',
      Action: ['logs:FilterLogEvents', 'logs:GetLogEvents', 'logs:StartQuery'],
      Resource: stages.flatMap(s => [
        at('logs', `log-group:/hearth/${s}/*`),
        at('logs', `log-group:/hearth/${s}/*:log-stream:*`),
      ]),
    },
    {
      Sid: 'ReadQueries',
      Effect: 'Allow',
      Action: ['logs:GetQueryResults', 'logs:StopQuery', 'logs:DescribeLogGroups'],
      Resource: '*',
    },
    {
      Sid: 'Describe',
      Effect: 'Allow',
      Action: [
        'ecs:Describe*',
        'ecs:List*',
        'elasticloadbalancing:Describe*',
        'cloudformation:Describe*',
        'cloudformation:List*',
        'cloudformation:GetTemplate',
        'ecr:Describe*',
        'rds:Describe*',
        'elasticache:Describe*',
        'ec2:Describe*',
        'cloudwatch:Describe*',
        'cloudwatch:Get*',
        'cloudwatch:List*',
      ],
      Resource: '*',
    },
    {
      Sid: 'Params',
      Effect: 'Allow',
      Action: ['ssm:GetParameter', 'ssm:GetParameters'],
      Resource: at('ssm', 'parameter/hearth/*'),
    },
    {
      Sid: 'OperateServices',
      Effect: 'Allow',
      Action: 'ecs:UpdateService',
      Resource: stages.map(s => at('ecs', `service/hearth-${s}/*`)),
    },
    { Sid: 'StopTasks', Effect: 'Allow', Action: 'ecs:StopTask', Resource: tasks },
    {
      Sid: 'RunBastion',
      Effect: 'Allow',
      Action: 'ecs:RunTask',
      Resource: stages.map(s => at('ecs', `task-definition/hearth-${s}-bastion:*`)),
      Condition: { ArnEquals: { 'ecs:cluster': clusters } },
    },
    {
      Sid: 'TagBastion',
      Effect: 'Allow',
      Action: 'ecs:TagResource',
      Resource: tasks,
      Condition: { StringEquals: { 'ecs:CreateAction': 'RunTask' } },
    },
    {
      Sid: 'PassBastionRoles',
      Effect: 'Allow',
      Action: 'iam:PassRole',
      Resource: bastionRoles,
      Condition: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } },
    },
    { Sid: 'ExecCluster', Effect: 'Allow', Action: 'ecs:ExecuteCommand', Resource: clusters },
    {
      Sid: 'ExecBastion',
      Effect: 'Allow',
      Action: 'ecs:ExecuteCommand',
      Resource: tasks,
      Condition: { StringEquals: { 'aws:ResourceTag/hearth-role': 'bastion' } },
    },
    {
      Sid: 'PortForward',
      Effect: 'Allow',
      Action: 'ssm:StartSession',
      Resource: [...tasks, arn('ssm', REGION, '', 'document/AWS-StartPortForwardingSessionToRemoteHost')],
      Condition: { BoolIfExists: { 'ssm:SessionDocumentAccessCheck': 'true' } },
    },
    {
      Sid: 'OwnSessions',
      Effect: 'Allow',
      Action: ['ssm:TerminateSession', 'ssm:ResumeSession'],
      Resource: at('ssm', 'session/hearth-bg-*'),
    },
    {
      Sid: 'BootstrapLogin',
      Effect: 'Allow',
      Action: 'rds-db:connect',
      Resource: at('rds-db', 'dbuser:*/hearth_bootstrap'),
      Condition: {
        StringEquals: {
          'aws:PrincipalTag/hearth-reason': ['bootstrap:set-up', 'bootstrap:correct-number', 'recover:twilio'],
        },
      },
    },
    {
      Sid: 'ReadOnlyLogin',
      Effect: 'Allow',
      Action: 'rds-db:connect',
      Resource: at('rds-db', 'dbuser:*/hearth_breakglass_read'),
      Condition: { StringLike: { 'aws:PrincipalTag/hearth-reason': 'case:????-????' } },
    },
    {
      Sid: 'BootstrapInput',
      Effect: 'Allow',
      Action: ['secretsmanager:GetSecretValue', 'secretsmanager:ListSecretVersionIds', 'secretsmanager:DescribeSecret'],
      Resource: stages.map(s => at('secretsmanager', `secret:hearth/${s}/bootstrap-input-*`)),
      Condition: {
        StringEquals: { 'aws:PrincipalTag/hearth-reason': ['bootstrap:set-up', 'bootstrap:correct-number'] },
      },
    },
    {
      Sid: 'WriteLog',
      Effect: 'Allow',
      Action: ['s3:PutObject', 's3:GetObject'],
      Resource: `${entries}/break-glass/${account}/*`,
    },
    {
      Sid: 'ListLog',
      Effect: 'Allow',
      Action: 's3:ListBucket',
      Resource: entries,
      Condition: { StringLike: { 's3:prefix': `break-glass/${account}/*` } },
    },
    {
      Sid: 'LogKey',
      Effect: 'Allow',
      Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
      Resource: arn('kms', REGION, logArchive, 'key/*'),
      Condition: {
        StringEquals: { 'kms:ViaService': S3_VIA },
        StringLike: { 'kms:EncryptionContext:aws:s3:arn': [entries, `${entries}/*`] },
      },
    },
    {
      Sid: 'LandingZone',
      Effect: 'Allow',
      Action: ['sts:AssumeRole', 'sts:SetSourceIdentity'],
      Resource: [hearthbase('deploy-role'), hearthbase('file-publishing-role')],
      Condition: { StringLike: { 'aws:PrincipalTag/hearth-reason': [...LZ_REASON_SHAPES] } },
    },
    {
      Sid: 'NoIamWrites',
      Effect: 'Deny',
      Action: [
        'iam:Create*',
        'iam:Delete*',
        'iam:Put*',
        'iam:Attach*',
        'iam:Detach*',
        'iam:Update*',
        'iam:Add*',
        'iam:Remove*',
        'iam:Set*',
        'iam:Tag*',
        'iam:Untag*',
        'iam:Upload*',
        'iam:Change*',
        'iam:Enable*',
        'iam:Deactivate*',
        'iam:Resync*',
      ],
      Resource: '*',
    },
    { Sid: 'PassOnlyBastion', Effect: 'Deny', Action: 'iam:PassRole', NotResource: bastionRoles },
    {
      Sid: 'NoKeyAdministration',
      Effect: 'Deny',
      Action: [
        'kms:Create*',
        'kms:Put*',
        'kms:Update*',
        'kms:Enable*',
        'kms:Disable*',
        'kms:ScheduleKeyDeletion',
        'kms:CancelKeyDeletion',
        'kms:Delete*',
        'kms:Revoke*',
        'kms:RetireGrant',
        'kms:Import*',
        'kms:TagResource',
        'kms:UntagResource',
        'kms:CreateGrant',
      ],
      Resource: '*',
    },
    {
      Sid: 'NoLogTampering',
      Effect: 'Deny',
      Action: [
        's3:Delete*',
        's3:PutBucket*',
        's3:PutLifecycle*',
        's3:PutObjectRe*',
        's3:PutObjectLe*',
        's3:BypassGovernance*',
      ],
      Resource: '*',
    },
    {
      Sid: 'NoAuditChanges',
      Effect: 'Deny',
      Action: ['organizations:*', 'cloudtrail:*', 'guardduty:*'],
      Resource: '*',
    },
    { Sid: 'NoSecretWrites', Effect: 'Deny', Action: 'secretsmanager:PutSecretValue', Resource: '*' },
    {
      Sid: 'NoDirectStackChanges',
      Effect: 'Deny',
      Action: [
        'Create*',
        'Update*',
        'Delete*',
        'Execute*',
        'Continue*',
        'Rollback*',
        'Set*',
        'Import*',
        'Tag*',
        'Untag*',
        'Activate*',
        'Deactivate*',
        'Register*',
        'Deregister*',
        'Publish*',
      ].map(verb => `cloudformation:${verb}`),
      Resource: '*',
    },
    ...RULE9_SECRETS,
    NO_MODELS,
  ]
}

// IAM's limits on a role's inline policies together and on its trust, in characters without whitespace.
const INLINE_LIMIT = 10_240
const TRUST_LIMIT = 2_048

// The committed bootstrap template (strict JSON, IAC-24), whose roles a break-glass session chains into.
const BOOTSTRAP: Template = JSON.parse(
  readFileSync(new URL('../../bootstrap/hearth-bootstrap.yaml', import.meta.url), 'utf8'),
) as Template
interface Statement {
  Sid?: string
  Effect?: string
  Principal?: unknown
  Action?: string | string[]
  Resource?: string | string[]
}
const listOf = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]
const SAME_ACCOUNT = { AWS: { Ref: 'AWS::AccountId' } }

// C11-D11 and C11-D27: a break-glass session always carries a source identity (its trust requires
// one), and STS carries it into any role the session assumes, refusing the assumption unless both
// sides allow sts:SetSourceIdentity: the grant, and the target role's trust, here the bootstrap
// template's role whose name renders, for hearthbase in this account, to the granted ARN. The roles
// reached, by logical id, and each side's gap as "<Sid or logical id>: <what is missing>".
function chain(statements: Statement[], template: Template, account: string) {
  const roles = resourcesIn(template).filter(([, r]) => r.Type === 'AWS::IAM::Role')
  const named = (name: string) =>
    roles.find(([, r]) => {
      const sub = (r.Properties?.RoleName as { 'Fn::Sub'?: unknown } | undefined)?.['Fn::Sub']
      return (
        typeof sub === 'string' &&
        sub
          .replaceAll(variable('Qualifier'), 'hearthbase')
          .replaceAll(variable('AWS::AccountId'), account)
          .replaceAll(variable('AWS::Region'), REGION) === name
      )
    })
  const reached: string[] = []
  const gaps: string[] = []
  for (const statement of statements) {
    if (statement.Effect !== 'Allow' || !listOf(statement.Action).includes('sts:AssumeRole')) continue
    if (!listOf(statement.Action).includes('sts:SetSourceIdentity')) {
      gaps.push(`${statement.Sid}: no sts:SetSourceIdentity`)
    }
    for (const target of listOf(statement.Resource)) {
      const found = named(target.split(':role/')[1] ?? '')
      if (found === undefined) {
        gaps.push(`${target}: no bootstrap role`)
        continue
      }
      const [logicalId, role] = found
      reached.push(logicalId)
      const trust = (role.Properties?.AssumeRolePolicyDocument as { Statement?: Statement[] } | undefined)?.Statement
      const admits = (trust ?? []).some(
        s =>
          s.Effect === 'Allow' &&
          JSON.stringify(s.Principal) === JSON.stringify(SAME_ACCOUNT) &&
          listOf(s.Action).includes('sts:SetSourceIdentity'),
      )
      if (!admits) gaps.push(`${logicalId}: its trust allows the account no sts:SetSourceIdentity`)
    }
  }
  return { reached, gaps }
}

describe.each(KINDS)('IAC-11 C11-D11 C11-D12: %s’s hearth-break-glass', kind => {
  it('IAC-11 C11-D11: its trust admits the entry set’s role in its own account alone, with the person’s sign-in name as source identity and one reason tag of a reason’s shape, in ap-southeast-1, for an hour', () => {
    const [, role] = roleIn(kind, 'hearth-break-glass')
    expect(role.Properties?.AssumeRolePolicyDocument).toEqual(trust(ACCOUNT[kind]))
    expect(role.Properties?.MaxSessionDuration).toBe(3600)
    expect(role.Properties?.ManagedPolicyArns).toBeUndefined()
    expect(role.Properties?.PermissionsBoundary).toBeUndefined()
  })

  it('IAC-11 C11-D12 C11-D78: its one inline policy is exactly its scope, each grant under the reason it needs, the hearthbase roles under an lz:pr- reason alone, and every deny unconditional', () => {
    const [id, role] = roleIn(kind, 'hearth-break-glass')
    expect(role.Properties?.Policies).toEqual([
      { PolicyName: 'hearth-break-glass', PolicyDocument: document(breakGlassStatements(kind)) },
    ])
    const denies = policyStatements(templateOf(kind)).filter(s => s.logicalId === id && s.effect === 'Deny')
    expect(denies.filter(s => s.conditional || s.condition !== undefined).map(s => s.sid)).toEqual([
      'NoRule9SecretByTag',
    ])
  })

  it('IAC-11 C11-D11 C11-D27: each role it may assume, the hearthbase deploy and file-publishing roles, takes its source identity on both sides, its grant and the role’s trust in the committed bootstrap template, proved on planted gaps first', () => {
    const [, role] = roleIn(kind, 'hearth-break-glass')
    const policies = role.Properties?.Policies as Array<{ PolicyDocument: { Statement: Statement[] } }>
    const statements = policies.flatMap(policy => policy.PolicyDocument.Statement)
    const account = ACCOUNT[kind]
    // A grant of sts:AssumeRole alone is found, and so is the stock template's trust.
    const grantOnly = structuredClone(statements)
    for (const s of grantOnly) if (s.Sid === 'LandingZone') s.Action = 'sts:AssumeRole'
    expect(chain(grantOnly, BOOTSTRAP, account).gaps).toEqual(['LandingZone: no sts:SetSourceIdentity'])
    const stockTrust = structuredClone(BOOTSTRAP)
    for (const [, r] of resourcesIn(stockTrust)) {
      const trust = (r.Properties?.AssumeRolePolicyDocument as { Statement?: Statement[] } | undefined)?.Statement
      for (const s of trust ?? []) {
        if (listOf(s.Action).includes('sts:SetSourceIdentity')) {
          s.Action = listOf(s.Action).filter(action => action !== 'sts:SetSourceIdentity')
        }
      }
    }
    expect(chain(statements, stockTrust, account).gaps).toEqual([
      'DeploymentActionRole: its trust allows the account no sts:SetSourceIdentity',
      'FilePublishingRole: its trust allows the account no sts:SetSourceIdentity',
    ])
    // So is a grant widened to the lookup role, whose trust takes no source identity.
    const lookup = structuredClone(statements)
    for (const s of lookup) {
      if (s.Sid === 'LandingZone') {
        s.Resource = [
          ...listOf(s.Resource),
          arn('iam', '', account, `role/cdk-hearthbase-lookup-role-${account}-${REGION}`),
        ]
      }
    }
    expect(chain(lookup, BOOTSTRAP, account).gaps).toEqual([
      'LookupRole: its trust allows the account no sts:SetSourceIdentity',
    ])
    expect(chain(statements, BOOTSTRAP, account)).toEqual({
      reached: ['DeploymentActionRole', 'FilePublishingRole'],
      gaps: [],
    })
  })

  it('IAC-10 C11-D12: its inline policy and its trust fit IAM’s limits', () => {
    const [, role] = roleIn(kind, 'hearth-break-glass')
    const policies = role.Properties?.Policies as Array<{ PolicyDocument: unknown }>
    const inline = policies.reduce((total, policy) => total + JSON.stringify(policy.PolicyDocument).length, 0)
    expect(
      inline,
      'past the limit, move the denies into the customer-managed hearth-break-glass-denies attached by its Roles (TECH-SPEC T24 item 4)',
    ).toBeLessThanOrEqual(INLINE_LIMIT)
    expect(JSON.stringify(role.Properties?.AssumeRolePolicyDocument).length).toBeLessThanOrEqual(TRUST_LIMIT)
  })
})

// --- IAC-10: GitHub's provider and roles, and the boundary --------------------------------------------

// hearth-gh-deploy's statements (C11-D55): its stages' one-off tasks, the two hearthapp roles and the
// image push, and nothing it doesn't need.
function deployStatements(kind: Kind): unknown[] {
  const account = ACCOUNT[kind]
  const stages = STAGES[kind]
  const at = (service: string, resource: string) => arn(service, REGION, account, resource)
  const clusters = stages.map(s => at('ecs', `cluster/hearth-${s}`))
  const tasks = stages.map(s => at('ecs', `task/hearth-${s}/*`))
  const appRoles = ['deploy-role', 'file-publishing-role'].map(role =>
    arn('iam', '', account, `role/cdk-hearthapp-${role}-${account}-${REGION}`),
  )
  const oneOffs = ['migrate', 'probe']
  const groups = stages.flatMap(s => oneOffs.map(k => at('logs', `log-group:/hearth/${s}/${k}`)))
  const streams = groups.map(group => `${group}:log-stream:*`)
  return [
    { Sid: 'AssumeAppRoles', Effect: 'Allow', Action: 'sts:AssumeRole', Resource: appRoles },
    { Sid: 'EcrLogin', Effect: 'Allow', Action: 'ecr:GetAuthorizationToken', Resource: '*' },
    {
      Sid: 'EcrPush',
      Effect: 'Allow',
      Action: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:PutImage',
        'ecr:BatchGetImage',
        'ecr:GetDownloadUrlForLayer',
        'ecr:DescribeImages',
      ],
      Resource: at('ecr', 'repository/hearth-server'),
    },
    {
      Sid: 'RunOneOffs',
      Effect: 'Allow',
      Action: 'ecs:RunTask',
      Resource: stages.flatMap(s => oneOffs.map(k => at('ecs', `task-definition/hearth-${s}-${k}:*`))),
      Condition: { ArnEquals: { 'ecs:cluster': clusters } },
    },
    { Sid: 'WatchTasks', Effect: 'Allow', Action: 'ecs:DescribeTasks', Resource: tasks },
    {
      Sid: 'StopOneOffs',
      Effect: 'Allow',
      Action: 'ecs:StopTask',
      Resource: tasks,
      Condition: { StringEquals: { 'aws:ResourceTag/hearth-role': ['migrate', 'probe'] } },
    },
    {
      Sid: 'TagOneOffs',
      Effect: 'Allow',
      Action: 'ecs:TagResource',
      Resource: tasks,
      Condition: { StringEquals: { 'ecs:CreateAction': 'RunTask' } },
    },
    {
      Sid: 'ListOneOffs',
      Effect: 'Allow',
      Action: 'ecs:ListTasks',
      Resource: '*',
      Condition: { ArnEquals: { 'ecs:cluster': clusters } },
    },
    {
      Sid: 'DescribeServices',
      Effect: 'Allow',
      Action: 'ecs:DescribeServices',
      Resource: stages.map(s => at('ecs', `service/hearth-${s}/*`)),
    },
    {
      Sid: 'DescribeDeploy',
      Effect: 'Allow',
      Action: ['ecs:DescribeTaskDefinition', 'elasticloadbalancing:Describe*'],
      Resource: '*',
    },
    {
      Sid: 'DescribeStacks',
      Effect: 'Allow',
      Action: 'cloudformation:DescribeStacks',
      Resource: stages.map(s => at('cloudformation', `stack/Hearth-${s}-*/*`)),
    },
    {
      Sid: 'PassOneOffRoles',
      Effect: 'Allow',
      Action: 'iam:PassRole',
      Resource: stages.flatMap(s =>
        oneOffs.flatMap(k => [
          arn('iam', '', account, `role/hearth-${s}-${k}-task`),
          arn('iam', '', account, `role/hearth-${s}-${k}-exec`),
        ]),
      ),
      Condition: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } },
    },
    { Sid: 'ReadOneOffLogs', Effect: 'Allow', Action: 'logs:GetLogEvents', Resource: streams },
    {
      Sid: 'NoReads',
      Effect: 'Deny',
      Action: [
        'secretsmanager:GetSecretValue',
        'ecs:ExecuteCommand',
        'ssm:StartSession',
        'rds-db:connect',
        's3:GetObject',
      ],
      Resource: '*',
    },
    { Sid: 'OnlyOneOffLogs', Effect: 'Deny', Action: 'logs:*', NotResource: [...groups, ...streams] },
    { Sid: 'OnlyAppRoles', Effect: 'Deny', Action: 'sts:AssumeRole', NotResource: appRoles },
    NO_MODELS,
  ]
}

// GitHub's roles in each account, with the environment whose subject each trusts (C11-D55).
const GITHUB_ROLES: Record<Kind, Array<{ role: string; environment: 'nonprod' | 'prod-plan' | 'prod' }>> = {
  nonprod: [{ role: 'hearth-gh-deploy', environment: 'nonprod' }],
  prod: [
    { role: 'hearth-gh-deploy', environment: 'prod' },
    { role: 'hearth-gh-diff', environment: 'prod-plan' },
  ],
}

describe.each(KINDS)('IAC-10 C11-D55: %s’s GitHub provider and roles', kind => {
  it('IAC-10: one OIDC provider, GitHub’s token host for AWS’s audience', () => {
    expect(ofType(templateOf(kind), 'AWS::IAM::OIDCProvider').map(([, r]) => r.Properties)).toEqual([
      { Url: 'https://token.actions.githubusercontent.com', ClientIdList: ['sts.amazonaws.com'] },
    ])
  })

  it('IAC-10 C11-D55: each GitHub role trusts that provider for exactly one environment’s subject of the deploy workflow on main, by StringEquals alone, for an hour', () => {
    const template = templateOf(kind)
    const roles = ofType(template, 'AWS::IAM::Role')
      .map(([, r]) => String(r.Properties?.RoleName))
      .filter(name => name.startsWith('hearth-gh-'))
    expect(roles).toEqual(GITHUB_ROLES[kind].map(entry => entry.role))
    const provider = arn('iam', '', ACCOUNT[kind], 'oidc-provider/token.actions.githubusercontent.com')
    for (const { role: name, environment } of GITHUB_ROLES[kind]) {
      const [, role] = roleIn(kind, name)
      const subject = githubSubject(fixture.github, environment)
      expect(subject).toContain(`:environment:${environment}:`)
      expect(subject).toContain(DEPLOY_WORKFLOW_REF)
      const trust = role.Properties?.AssumeRolePolicyDocument as { Statement: Array<Record<string, unknown>> }
      expect(trust.Statement).toHaveLength(1)
      const [statement] = trust.Statement
      const { Principal, ...rest } = statement ?? {}
      expect(rest, name).toEqual({
        Sid: 'GithubEnvironment',
        Effect: 'Allow',
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': subject,
          },
        },
      })
      const federated = (Principal as { Federated: unknown }).Federated
      expect(renderedString(federated, { account: ACCOUNT[kind], region: REGION, template }), name).toBe(provider)
      expect(JSON.stringify(trust), name).not.toContain('StringLike')
      expect(role.Properties?.MaxSessionDuration, name).toBe(3600)
    }
  })

  it('IAC-10 C11-D55: hearth-gh-deploy pushes the image, runs, watches and stops its one-off tasks, assumes the two hearthapp roles alone, and reads nothing else', () => {
    const [, role] = roleIn(kind, 'hearth-gh-deploy')
    expect(role.Properties?.Policies).toEqual([
      { PolicyName: 'hearth-gh-deploy', PolicyDocument: document(deployStatements(kind)) },
    ])
    expect(role.Properties?.ManagedPolicyArns).toBeUndefined()
  })

  it('IAC-10 C11-D55: hearth-gh-deploy stops a task only by the one-off families’ hearth-role tag, and tags one only as RunTask makes it', () => {
    const [id] = roleIn(kind, 'hearth-gh-deploy')
    const statements = policyStatements(templateOf(kind)).filter(s => s.logicalId === id && s.effect === 'Allow')
    const granting = (action: string) => statements.filter(s => s.actions.includes(action))
    expect(granting('ecs:StopTask').map(s => [s.sid, s.condition])).toEqual([
      ['StopOneOffs', { StringEquals: { 'aws:ResourceTag/hearth-role': ['migrate', 'probe'] } }],
    ])
    expect(granting('ecs:TagResource').map(s => [s.sid, s.condition])).toEqual([
      ['TagOneOffs', { StringEquals: { 'ecs:CreateAction': 'RunTask' } }],
    ])
  })

  it('C11-D55: the roles’ ARNs are outputs by plain names, for the GitHub environments, never exports', () => {
    const outputs = (templateOf(kind).Outputs ?? {}) as Record<string, { Value: unknown; Export?: unknown }>
    const deploy = roleIn(kind, 'hearth-gh-deploy')[0]
    const zone = (name: string | undefined) => one(templateOf(kind), 'AWS::Route53::HostedZone', 'Name', `${name}.`)[0]
    const expected: Record<string, unknown> =
      kind === 'prod'
        ? {
            DeployRoleArn: { 'Fn::GetAtt': [deploy, 'Arn'] },
            DiffRoleArn: { 'Fn::GetAtt': [roleIn(kind, 'hearth-gh-diff')[0], 'Arn'] },
          }
        : {
            DeployRoleArn: { 'Fn::GetAtt': [deploy, 'Arn'] },
            AppNameServers: { 'Fn::Join': [',', { 'Fn::GetAtt': [zone(appHost('nonprod')), 'NameServers'] }] },
            UserContentNameServers: {
              'Fn::Join': [',', { 'Fn::GetAtt': [zone(userContentHost('nonprod')), 'NameServers'] }],
            },
          }
    expect(Object.fromEntries(Object.entries(outputs).map(([name, output]) => [name, output.Value]))).toEqual(expected)
    expect(Object.values(outputs).filter(output => output.Export !== undefined)).toEqual([])
  })
})

describe('IAC-10 C11-D55: prod’s hearth-gh-diff', () => {
  it('IAC-10: it reads the prod stacks’ templates, statuses and resources, assumes no role, and is denied every other action', () => {
    const [, role] = roleIn('prod', 'hearth-gh-diff')
    const reads = ['cloudformation:GetTemplate', 'cloudformation:DescribeStacks', 'cloudformation:ListStackResources']
    expect(role.Properties?.Policies).toEqual([
      {
        PolicyName: 'hearth-gh-diff',
        PolicyDocument: document([
          {
            Sid: 'ReadPlan',
            Effect: 'Allow',
            Action: reads,
            Resource: arn('cloudformation', REGION, ACCOUNT.prod, 'stack/Hearth-prod-*/*'),
          },
          { Sid: 'NoAssume', Effect: 'Deny', Action: 'sts:AssumeRole', Resource: '*' },
          { Sid: 'OnlyPlanReads', Effect: 'Deny', NotAction: reads, Resource: '*' },
        ]),
      },
    ])
    expect(() => roleIn('nonprod', 'hearth-gh-diff')).toThrow('0 AWS::IAM::Role')
  })
})

// hearth-boundary (C11-D26), statement by statement, in one account.
function boundaryStatements(account: string): unknown[] {
  const iam = (resource: string) => arn('iam', '', account, resource)
  const self = iam('policy/hearth-boundary')
  return [
    { Sid: 'AllowAll', Effect: 'Allow', Action: '*', Resource: '*' },
    NO_MODELS,
    {
      Sid: 'KeepBoundary',
      Effect: 'Deny',
      Action: ['iam:CreatePolicyVersion', 'iam:DeletePolicy', 'iam:DeletePolicyVersion', 'iam:SetDefaultPolicyVersion'],
      Resource: self,
    },
    {
      Sid: 'KeepBoundaryAttached',
      Effect: 'Deny',
      Action: ['iam:DeleteRolePermissionsBoundary', 'iam:DeleteUserPermissionsBoundary'],
      Resource: '*',
    },
    {
      Sid: 'BoundedRolesOnly',
      Effect: 'Deny',
      Action: ['iam:CreateRole', 'iam:PutRolePermissionsBoundary'],
      Resource: '*',
      Condition: { StringNotEquals: { 'iam:PermissionsBoundary': self } },
    },
    {
      Sid: 'NoLongLivedCredentials',
      Effect: 'Deny',
      Action: [
        'iam:CreateUser',
        'iam:CreateAccessKey',
        'iam:CreateLoginProfile',
        'iam:CreateServiceSpecificCredential',
      ],
      Resource: '*',
    },
    {
      Sid: 'NoNewIdentityProviders',
      Effect: 'Deny',
      Action: [
        'iam:CreateOpenIDConnectProvider',
        'iam:AddClientIDToOpenIDConnectProvider',
        'iam:UpdateOpenIDConnectProviderThumbprint',
        'iam:CreateSAMLProvider',
        'iam:UpdateSAMLProvider',
        'cognito-identity:*',
        'rolesanywhere:*',
        'ssm:CreateActivation',
        'ssm:UpdateManagedInstanceRole',
        'iot:CreateRoleAlias',
        'iot:UpdateRoleAlias',
      ],
      Resource: '*',
    },
    {
      Sid: 'ProtectedNames',
      Effect: 'Deny',
      Action: [
        'iam:Add*',
        'iam:Attach*',
        'iam:Create*',
        'iam:Delete*',
        'iam:Detach*',
        'iam:Put*',
        'iam:Remove*',
        'iam:SetDefaultPolicyVersion',
        'iam:Tag*',
        'iam:Untag*',
        'iam:Update*',
      ],
      Resource: [
        iam('role/hearth-break-glass*'),
        iam('role/hearth-gh-*'),
        iam('role/cdk-*'),
        iam('role/hearth-*-rule9-*'),
        iam('oidc-provider/token.actions.githubusercontent.com'),
        self,
        iam('role/aws-reserved/sso.amazonaws.com/*'),
      ],
    },
    {
      Sid: 'FencedPassRole',
      Effect: 'Deny',
      Action: 'iam:PassRole',
      Resource: [iam('role/hearth-*-rule9-*'), iam('role/cdk-*')],
    },
    ...RULE9_SECRETS,
    { Sid: 'NoAudit', Effect: 'Deny', Action: ['cloudtrail:*', 'guardduty:*', 'organizations:*'], Resource: '*' },
    {
      Sid: 'LogBuckets',
      Effect: 'Deny',
      Action: ['s3:Delete*', 's3:PutLifecycle*', 's3:PutObjectRe*', 's3:PutObjectLe*', 's3:BypassGovernance*'],
      Resource: ['hearth-org-trail-', 'hearth-break-glass-log-', 'hearth-archive-'].flatMap(prefix => [
        arn('s3', '', '', `${prefix}*`),
        arn('s3', '', '', `${prefix}*/*`),
      ]),
    },
    {
      Sid: 'NoRouteOut',
      Effect: 'Deny',
      Action: [
        'ec2:CreateNatGateway',
        'ec2:CreateEgressOnlyInternetGateway',
        'ec2:CreateVpcPeeringConnection',
        'ec2:AcceptVpcPeeringConnection',
        'ec2:CreateTransitGateway*',
        'ec2:CreateVpnGateway',
        'ec2:CreateCustomerGateway',
      ],
      Resource: '*',
    },
    {
      Sid: 'NoAwsSms',
      Effect: 'Deny',
      Action: [
        'sms-voice:*',
        'mobiletargeting:*',
        'sns:SetSMSAttributes',
        'sns:CreateSMSSandboxPhoneNumber',
        'sns:VerifySMSSandboxPhoneNumber',
        'sns:OptInPhoneNumber',
      ],
      Resource: '*',
    },
    {
      Sid: 'NoSmsSubscriptions',
      Effect: 'Deny',
      Action: 'sns:Subscribe',
      Resource: '*',
      Condition: { StringEquals: { 'sns:Protocol': 'sms' } },
    },
    { Sid: 'NoDirectPublish', Effect: 'Deny', Action: 'sns:Publish', NotResource: arn('sns', '*', '*', '*') },
  ]
}

// A managed policy's limit, in characters without whitespace (C11-D26).
const MANAGED_LIMIT = 6_144

describe.each(KINDS)('IAC-10 C11-D26: %s’s hearth-boundary', kind => {
  it('IAC-10 C11-D26: it allows everything and denies, unconditionally but for BoundedRolesOnly, exactly these, NoNewIdentityProviders among them; it is attached to no Baseline role and retained once made (never on a rolled-back create)', () => {
    const [, boundary] = one(templateOf(kind), 'AWS::IAM::ManagedPolicy', 'ManagedPolicyName', 'hearth-boundary')
    expect(boundary.Properties).toEqual({
      ManagedPolicyName: 'hearth-boundary',
      Description: 'The permissions boundary of every workload role (C11-D26)',
      PolicyDocument: document(boundaryStatements(ACCOUNT[kind])),
    })
    expect(boundary.DeletionPolicy).toBe('RetainExceptOnCreate')
    expect(boundary.UpdateReplacePolicy).toBe('Retain')
    for (const [, role] of ofType(templateOf(kind), 'AWS::IAM::Role')) {
      expect(role.Properties?.PermissionsBoundary, String(role.Properties?.RoleName)).toBeUndefined()
    }
  })

  it('IAC-10 C11-D26: it fits a managed policy’s 6,144 characters whole', () => {
    const [, boundary] = one(templateOf(kind), 'AWS::IAM::ManagedPolicy', 'ManagedPolicyName', 'hearth-boundary')
    expect(
      JSON.stringify(boundary.Properties?.PolicyDocument).length,
      'past the limit, drop the SMS statements, then NoRouteOut (the SCPs still deny both), never NoModels, NoLongLivedCredentials or NoNewIdentityProviders',
    ).toBeLessThanOrEqual(MANAGED_LIMIT)
  })
})

// --- IAC-11 and C11-D16: the fast rules and the topics ----------------------------------------------

const CLOUDTRAIL = 'AWS API Call via CloudTrail'
const CLOUDTRAIL_STATE = 'ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS'
// What each kind of input reads, and its template, by the alarm it names.
const ASSUME = {
  paths: {
    account: '$.account',
    'detail-eventName': '$.detail.eventName',
    'detail-requestParameters-sourceIdentity': '$.detail.requestParameters.sourceIdentity',
    'detail-requestParameters-tags-0--value': '$.detail.requestParameters.tags[0].value',
    'detail-errorCode': '$.detail.errorCode',
  },
  template: (alarm: string) =>
    `{"alarm":"${alarm}","account":<account>,"action":<detail-eventName>,"sourceIdentity":<detail-requestParameters-sourceIdentity>,"reason":<detail-requestParameters-tags-0--value>,"error":<detail-errorCode>}`,
}
const CALLER = {
  paths: {
    account: '$.account',
    'detail-eventName': '$.detail.eventName',
    'detail-userIdentity-arn': '$.detail.userIdentity.arn',
  },
  template: (alarm: string) =>
    `{"alarm":"${alarm}","account":<account>,"action":<detail-eventName>,"caller":<detail-userIdentity-arn>}`,
}
const RUN_TASK = { eventSource: ['ecs.amazonaws.com'], eventName: ['RunTask'] }
const assume = (roleArn: unknown) => ({
  source: ['aws.sts'],
  'detail-type': [CLOUDTRAIL],
  detail: { eventSource: ['sts.amazonaws.com'], eventName: ['AssumeRole'], requestParameters: { roleArn } },
})

// Each fast rule (C11-D16): its pattern, its state and its input.
const FAST_RULES: Record<string, { pattern: unknown; state: string; paths: unknown; inputTemplate: string }> = {
  'hearth-sec-a01-break-glass': {
    pattern: assume([{ suffix: ':role/hearth-break-glass' }]),
    state: CLOUDTRAIL_STATE,
    paths: ASSUME.paths,
    inputTemplate: ASSUME.template('A1'),
  },
  'hearth-sec-a07-ecs-changes': {
    pattern: {
      source: ['aws.ecs'],
      'detail-type': [CLOUDTRAIL],
      detail: {
        eventSource: ['ecs.amazonaws.com'],
        eventName: ['RegisterTaskDefinition', 'CreateService', 'UpdateService', 'DeleteService'],
        $or: [
          { userIdentity: { invokedBy: [{ exists: false }] } },
          { userIdentity: { invokedBy: [{ 'anything-but': 'cloudformation.amazonaws.com' }] } },
        ],
      },
    },
    state: CLOUDTRAIL_STATE,
    paths: CALLER.paths,
    inputTemplate: CALLER.template('A7'),
  },
  'hearth-sec-a07-run-command': {
    pattern: {
      source: ['aws.ecs'],
      'detail-type': [CLOUDTRAIL],
      detail: {
        ...RUN_TASK,
        requestParameters: { overrides: { containerOverrides: { command: [{ exists: true }] } } },
      },
    },
    state: CLOUDTRAIL_STATE,
    paths: CALLER.paths,
    inputTemplate: CALLER.template('A7'),
  },
  // The environment override as the API's name and value pairs (`exists` on a pair's name, since it
  // matches only a leaf) or redacted to one string, each paired with each way out of the probe's
  // exception, since a pattern holds one `$or`.
  'hearth-sec-a07-run-environment': {
    pattern: {
      source: ['aws.ecs'],
      'detail-type': [CLOUDTRAIL],
      detail: {
        ...RUN_TASK,
        $or: [{ environment: { name: [{ exists: true }] } }, { environment: [{ exists: true }] }].flatMap(
          environment => [
            {
              requestParameters: {
                overrides: { containerOverrides: environment },
                taskDefinition: [{ 'anything-but': { wildcard: '*hearth-prod-probe*' } }],
              },
            },
            {
              requestParameters: { overrides: { containerOverrides: environment } },
              userIdentity: { arn: [{ 'anything-but': { wildcard: '*:assumed-role/hearth-gh-deploy/*' } }] },
            },
          ],
        ),
      },
    },
    state: CLOUDTRAIL_STATE,
    paths: CALLER.paths,
    inputTemplate: CALLER.template('A7'),
  },
  'hearth-sec-a08-sessions': {
    pattern: {
      source: ['aws.ecs', 'aws.ssm'],
      'detail-type': [CLOUDTRAIL],
      detail: { eventName: ['ExecuteCommand', 'StartSession'] },
    },
    state: CLOUDTRAIL_STATE,
    paths: CALLER.paths,
    inputTemplate: CALLER.template('A8'),
  },
  'hearth-sec-a14-deployments': {
    pattern: {
      source: ['aws.ecs'],
      'detail-type': ['ECS Deployment State Change'],
      detail: { eventName: ['SERVICE_DEPLOYMENT_FAILED'] },
    },
    state: 'ENABLED',
    paths: {
      account: '$.account',
      'detail-eventName': '$.detail.eventName',
      'detail-deploymentId': '$.detail.deploymentId',
      'resources-0-': '$.resources[0]',
    },
    inputTemplate:
      '{"alarm":"A14","account":<account>,"eventName":<detail-eventName>,"deploymentId":<detail-deploymentId>,"service":<resources-0->}',
  },
  'hearth-sec-a15-hearthbase': {
    pattern: assume([{ wildcard: '*:role/cdk-hearthbase-*' }]),
    state: CLOUDTRAIL_STATE,
    paths: ASSUME.paths,
    inputTemplate: ASSUME.template('A15'),
  },
}
// Each account's rules: A7's production changes and A8's sessions in prod alone.
const RULES: Record<Kind, string[]> = {
  nonprod: ['hearth-sec-a01-break-glass', 'hearth-sec-a14-deployments', 'hearth-sec-a15-hearthbase'],
  prod: [
    'hearth-sec-a01-break-glass',
    'hearth-sec-a07-ecs-changes',
    'hearth-sec-a07-run-command',
    'hearth-sec-a07-run-environment',
    'hearth-sec-a08-sessions',
    'hearth-sec-a14-deployments',
    'hearth-sec-a15-hearthbase',
  ],
}

describe.each(KINDS)('IAC-11 C11-D16: %s’s fast alarms and topic', kind => {
  it('IAC-11 C11-D16: its rules, each matching exactly its pattern, on CloudTrail’s management events but A14’s service event, emailing its topic once the topic admits them, each input carrying ids alone', () => {
    const template = templateOf(kind)
    const topic = one(template, 'AWS::SNS::Topic', 'TopicName', 'hearth-ops-alerts')[0]
    const policy = ofType(template, 'AWS::SNS::TopicPolicy')[0]?.[0]
    const rules = ofType(template, 'AWS::Events::Rule').map(([, r]) => r)
    expect(rules.map(rule => rule.Properties?.Name)).toEqual(RULES[kind])
    for (const rule of rules) {
      const name = String(rule.Properties?.Name)
      const expected = FAST_RULES[name]
      expect(rule.Properties, name).toEqual({
        Name: name,
        EventPattern: expected?.pattern,
        State: expected?.state,
        Targets: [
          {
            Arn: { Ref: topic },
            Id: 'Target0',
            InputTransformer: { InputPathsMap: expected?.paths, InputTemplate: expected?.inputTemplate },
          },
        ],
      })
      expect(rule.DependsOn, name).toEqual([policy])
    }
  })

  it('C11-D16: its topic admits its own hearth-sec- rules alone, over TLS, and emails the ops mailbox', () => {
    const template = templateOf(kind)
    const topic = one(template, 'AWS::SNS::Topic', 'TopicName', 'hearth-ops-alerts')[0]
    expect(ofType(template, 'AWS::SNS::TopicPolicy').map(([, r]) => r.Properties)).toEqual([
      {
        Topics: [{ Ref: topic }],
        PolicyDocument: document([
          {
            Sid: 'AllowPublishThroughSSLOnly',
            Effect: 'Deny',
            Principal: '*',
            Action: 'sns:Publish',
            Resource: { Ref: topic },
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          },
          {
            Sid: 'FastAlarms',
            Effect: 'Allow',
            Principal: { Service: 'events.amazonaws.com' },
            Action: 'sns:Publish',
            Resource: { Ref: topic },
            Condition: {
              StringEquals: { 'aws:SourceAccount': ACCOUNT[kind] },
              ArnLike: { 'aws:SourceArn': arn('events', REGION, ACCOUNT[kind], 'rule/hearth-sec-*') },
            },
          },
        ]),
      },
    ])
  })
})

describe('C11-D16 C11-Q07: every alert leaves by email alone', () => {
  it('C11-Q07: every subscription in every landing-zone template emails the ops mailbox, and nothing subscribes by SMS, HTTP, Lambda, SQS or Firehose', () => {
    const subscriptions = Object.values(lz.templates).flatMap(template =>
      ofType(template, 'AWS::SNS::Subscription').map(([, r]) => r.Properties),
    )
    expect(subscriptions).toHaveLength(4)
    for (const subscription of subscriptions) {
      expect(subscription?.Protocol).toBe('email')
      expect(subscription?.Endpoint).toBe(fixture.alertEmail)
    }
    for (const template of Object.values(lz.templates)) {
      for (const [, topic] of ofType(template, 'AWS::SNS::Topic'))
        expect(topic.Properties?.Subscription).toBeUndefined()
    }
  })
})

// --- C11-D43 and C11-D44 ---------------------------------------------------------------------------

describe.each(KINDS)('C11-D43 C11-D44: %s’s zones, repository and parameters', kind => {
  const host = { app: appHost(kind), userContent: userContentHost(kind) }

  it('C11-D43: two public zones, the app’s and user content’s, each allowing Amazon’s certificate authority alone and retained once made, and no NS record until the delegation is committed', () => {
    const template = templateOf(kind)
    const zones = ofType(template, 'AWS::Route53::HostedZone')
    expect(zones.map(([, r]) => r.Properties)).toEqual([{ Name: `${host.app}.` }, { Name: `${host.userContent}.` }])
    for (const [, zone] of zones) {
      expect(zone.DeletionPolicy).toBe('RetainExceptOnCreate')
      expect(zone.UpdateReplacePolicy).toBe('Retain')
    }
    expect(ofType(template, 'AWS::Route53::RecordSet').map(([, r]) => r.Properties)).toEqual(
      zones.map(([id, zone]) => ({
        HostedZoneId: { Ref: id },
        Name: zone.Properties?.Name,
        Type: 'CAA',
        TTL: '1800',
        ResourceRecords: ['0 issue "amazon.com"'],
      })),
    )
  })

  it('C11-D24 C11-D43 C11-D44: the zones’ ids, the repository’s name and the break-glass-log bucket’s name sit in SSM parameters by fixed names', () => {
    const template = templateOf(kind)
    const zone = (name: string | undefined) => ({
      Ref: one(template, 'AWS::Route53::HostedZone', 'Name', `${name}.`)[0],
    })
    expect(
      ofType(template, 'AWS::SSM::Parameter').map(([, r]) => ({
        name: r.Properties?.Name,
        value: r.Properties?.Value,
      })),
    ).toEqual([
      { name: `/hearth/${kind}/ecr/server`, value: 'hearth-server' },
      { name: `/hearth/${kind}/zone/app`, value: zone(host.app) },
      { name: `/hearth/${kind}/zone/usercontent`, value: zone(host.userContent) },
      { name: '/hearth/break-glass/log-bucket', value: `hearth-break-glass-log-${logArchive}` },
    ])
  })

  it('C11-D44: hearth-server’s repository keeps tags fixed, scans every push, keeps the newest 50 images, lets hearth-gh-deploy alone push and nobody delete an image, and is retained once made', () => {
    const [, repository] = one(templateOf(kind), 'AWS::ECR::Repository', 'RepositoryName', 'hearth-server')
    const { LifecyclePolicy, ...properties } = repository.Properties ?? {}
    expect(properties).toEqual({
      RepositoryName: 'hearth-server',
      ImageTagMutability: 'IMMUTABLE',
      ImageScanningConfiguration: { ScanOnPush: true },
      RepositoryPolicyText: document([
        {
          Sid: 'PushOnlyFromDeploy',
          Effect: 'Deny',
          Principal: { AWS: '*' },
          Action: ['ecr:CompleteLayerUpload', 'ecr:InitiateLayerUpload', 'ecr:PutImage', 'ecr:UploadLayerPart'],
          Condition: { ArnNotEquals: { 'aws:PrincipalArn': arn('iam', '', ACCOUNT[kind], 'role/hearth-gh-deploy') } },
        },
        { Sid: 'NoImageDeletes', Effect: 'Deny', Principal: { AWS: '*' }, Action: 'ecr:BatchDeleteImage' },
      ]),
    })
    // AES-256 is ECR's default, which the template states by naming no key.
    expect(properties.EncryptionConfiguration).toBeUndefined()
    expect(JSON.parse(String((LifecyclePolicy as { LifecyclePolicyText: string }).LifecyclePolicyText))).toEqual({
      rules: [
        {
          rulePriority: 1,
          description: 'Keep the newest 50 images: the rollback window (C11-D44)',
          selection: { tagStatus: 'any', countType: 'imageCountMoreThan', countNumber: 50 },
          action: { type: 'expire' },
        },
      ],
    })
    expect(repository.DeletionPolicy).toBe('RetainExceptOnCreate')
    expect(repository.UpdateReplacePolicy).toBe('Retain')
  })
})

describe('C11-D43: prod’s delegation of nonprod.', () => {
  it('C11-D43: once non-prod’s name servers are committed, prod delegates nonprod. under each domain to them for two days; until then it delegates nothing', () => {
    const nameServers = {
      app: ['ns-1.awsdns-01.com', 'ns-2.awsdns-02.net', 'ns-3.awsdns-03.org', 'ns-4.awsdns-04.co.uk'],
      userContent: ['ns-5.awsdns-05.com', 'ns-6.awsdns-06.net', 'ns-7.awsdns-07.org', 'ns-8.awsdns-08.co.uk'],
    }
    const delegated = synthLandingZone({ nonprodNameServers: nameServers }).templates.prodBaseline
    const nsRecords = (template: Template) =>
      ofType(template, 'AWS::Route53::RecordSet')
        .filter(([, r]) => r.Properties?.Type === 'NS')
        .map(([, r]) => r.Properties)
    expect(nsRecords(templateOf('prod'))).toEqual([])
    const zone = (name: string | undefined) => ({
      Ref: one(delegated, 'AWS::Route53::HostedZone', 'Name', `${name}.`)[0],
    })
    expect(nsRecords(delegated)).toEqual([
      {
        HostedZoneId: zone(appHost('prod')),
        Name: `nonprod.${appHost('prod')}.`,
        Type: 'NS',
        TTL: '172800',
        ResourceRecords: nameServers.app,
      },
      {
        HostedZoneId: zone(userContentHost('prod')),
        Name: `nonprod.${userContentHost('prod')}.`,
        Type: 'NS',
        TTL: '172800',
        ResourceRecords: nameServers.userContent,
      },
    ])
    // Non-prod's Baseline never delegates.
    expect(nsRecords(synthLandingZone({ nonprodNameServers: nameServers }).templates.nonprodBaseline)).toEqual([])
  }, 60_000)
})
