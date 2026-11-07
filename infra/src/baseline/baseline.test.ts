// Hearth-nonprod-Baseline and Hearth-prod-Baseline (C11-D11, C11-D12, C11-D16, C11-D26, C11-D43, C11-D44,
// C11-D55; TECH-SPEC T24 items 4, 5 and 11), each statement as this file writes it:
// - IAC-11: hearth-break-glass's trust (the entry set's role in its own account, the person's sign-in
//   name as source identity, one reason tag of a reason's shape) and its scope, each grant under the
//   reason it needs: the bootstrap login and input under bootstrap: or recover:, the read-only login
//   under case:, the hearthbase roles under lz:pr- alone, each taking the session's source identity
//   on both sides, its grant and the role's trust in the committed bootstrap template, which takes one
//   from hearth-break-glass alone; and every deny unconditional;
// - IAC-10: GitHub's provider and roles, each trust exactly one environment's subject of the deploy
//   workflow on main, which the quarterly review's step 6 reads, run on them and the RCP, as expected;
//   hearth-gh-deploy stops and tags only its own one-off tasks and assumes only the two hearthapp
//   roles; hearth-gh-diff reads the prod stacks and nothing else; hearth-boundary's statements,
//   NoNewIdentityProviders among them, within a managed policy's limit;
// - the fast rules each account holds, their patterns, states and inputs, and the topic they email;
// - C11-D43: the zones, Amazon's CAA alone, retained once made, and prod's `nonprod.` delegation only once its
//   name servers are committed, which the committed synth follows and two variants pin (filled and
//   empty), so committing them turns none of these red; C11-D44: the server image's repository;
// - C11-D24, C11-D30: the SSM parameters by fixed names, the organisation's id among them, which the
//   workload's Platform stacks read into every endpoint policy (C0.11 PR 3), so the workload holds none.
// prod's statements also name the restore stage, which lives in its account (C11-Q02). Expected ARNs
// are joined from their parts (IG-01) and the model deny comes from the lists (IG-10).
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEPLOY_WORKFLOW_REF, githubSubject } from '../config/env.ts'
import { globsOverlap, modelDenyActions } from '../config/models.ts'
import { appHost, NONPROD_NAME_SERVERS, userContentHost } from '../config/profiles.ts'
import { RCP_NAME } from '../foundation/guardrails.ts'
import type { NameServers } from '../foundation/options.ts'
import { fixtureAccount, fixtureConfig } from '../testing/fixture.ts'
import { type LandingZoneSynth, synthLandingZone } from '../testing/landing-zone.ts'
import { policyStatements, renderedString } from '../testing/policies.ts'
import { REASON_SHAPES } from './break-glass.ts'

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
    // prod's delegation records follow the committed name servers, one for each list filled.
    const delegation = [
      ...(NONPROD_NAME_SERVERS.app.length > 0 ? ['NonprodApp'] : []),
      ...(NONPROD_NAME_SERVERS.userContent.length > 0 ? ['NonprodUserContent'] : []),
    ]
    expect(childrenOf('Zones')).toEqual(
      kind === 'prod'
        ? ['App', 'UserContent', ...delegation, 'AppZoneId', 'UserContentZoneId']
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
      // Written out, not read from LZ_REASON_SHAPES, so a wider subset in the source fails here (C0.11
      // review 5 TESTS-01).
      Condition: {
        StringLike: {
          'aws:PrincipalTag/hearth-reason': ['lz:pr-?', 'lz:pr-??', 'lz:pr-???', 'lz:pr-????', 'lz:pr-?????'],
        },
      },
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
  Condition?: unknown
}
const listOf = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]
const SAME_ACCOUNT = { AWS: { Ref: 'AWS::AccountId' } }

// C11-D11 and C11-D27: a break-glass session always carries a source identity (its trust requires
// one), and STS carries it into any role the session assumes, refusing the assumption unless both
// sides allow sts:SetSourceIdentity: the grant, and the target role's trust, here the bootstrap
// template's role whose name renders, for hearthbase in this account, to the granted ARN. A trust
// statement admits the chain only when it allows the action to the account under exactly one
// condition, ArnEquals on aws:PrincipalArn, rendering for this account to its own hearth-break-glass,
// whose trust sets the identity to the person's sign-in name: one with no condition would let anyone
// in the account set any source identity on these roles' sessions. The roles reached, by logical id,
// and each side's gap as "<Sid or logical id>: <what is missing>".
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
      const allows = (trust ?? []).filter(
        s =>
          s.Effect === 'Allow' &&
          JSON.stringify(s.Principal) === JSON.stringify(SAME_ACCOUNT) &&
          listOf(s.Action).includes('sts:SetSourceIdentity'),
      )
      if (allows.length === 0) {
        gaps.push(`${logicalId}: its trust allows the account no sts:SetSourceIdentity`)
      } else if (!allows.every(s => breakGlassOnly(s.Condition, account))) {
        gaps.push(`${logicalId}: its trust lets anyone in the account set a source identity`)
      }
    }
  }
  return { reached, gaps }
}

// Whether a trust statement's condition is exactly ArnEquals on aws:PrincipalArn, naming, rendered for
// this account, its own hearth-break-glass and nothing else.
function breakGlassOnly(condition: unknown, account: string): boolean {
  const keys = (value: unknown) => (typeof value === 'object' && value !== null ? Object.keys(value) : [])
  const arnEquals = (condition as { ArnEquals?: Record<string, unknown> } | undefined)?.ArnEquals
  const sub = (arnEquals?.['aws:PrincipalArn'] as { 'Fn::Sub'?: unknown } | undefined)?.['Fn::Sub']
  return (
    JSON.stringify(keys(condition)) === JSON.stringify(['ArnEquals']) &&
    JSON.stringify(keys(arnEquals)) === JSON.stringify(['aws:PrincipalArn']) &&
    JSON.stringify(keys(arnEquals?.['aws:PrincipalArn'])) === JSON.stringify(['Fn::Sub']) &&
    typeof sub === 'string' &&
    sub.replaceAll(variable('AWS::Partition'), 'aws').replaceAll(variable('AWS::AccountId'), account) ===
      arn('iam', '', account, 'role/hearth-break-glass')
  )
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

  it('IAC-11 C11-D11 C11-D27: each role it may assume, the hearthbase deploy and file-publishing roles, takes its source identity on both sides, its grant and the role’s trust in the committed bootstrap template, from hearth-break-glass alone (C0.11 review 2 TRUST-03), proved on planted gaps first', () => {
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
    // So is a trust that allows it to anyone in the account (C0.11 review 2 TRUST-03), with its condition dropped,
    // widened to every role, or a second, unconditioned statement beside it.
    const planted = (change: (s: Statement, trust: Statement[]) => void) => {
      const copy = structuredClone(BOOTSTRAP)
      for (const [, r] of resourcesIn(copy)) {
        const trust = (r.Properties?.AssumeRolePolicyDocument as { Statement?: Statement[] } | undefined)?.Statement
        const s = (trust ?? []).find(t => listOf(t.Action).includes('sts:SetSourceIdentity'))
        if (s !== undefined && trust !== undefined) change(s, trust)
      }
      return chain(statements, copy, account).gaps
    }
    const anyone = [
      'DeploymentActionRole: its trust lets anyone in the account set a source identity',
      'FilePublishingRole: its trust lets anyone in the account set a source identity',
    ]
    expect(planted(s => delete s.Condition)).toEqual(anyone)
    expect(
      planted(s => {
        s.Condition = {
          ArnLike: {
            'aws:PrincipalArn': {
              'Fn::Sub': `arn:${variable('AWS::Partition')}:iam::${variable('AWS::AccountId')}:role/*`,
            },
          },
        }
      }),
    ).toEqual(anyone)
    expect(planted((s, trust) => trust.push({ ...structuredClone(s), Condition: undefined }))).toEqual(anyone)
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

// The quarterly review's step 6 (docs/runbooks/break-glass-review.md) judges AWS against what it spells
// out: the subject's shape, the provider, the audience, each role's account and environment, and the
// RCP's statement (C0.11 review 11 V22B-05, V233-01). Its three sh blocks run here as a person runs
// them, with bash and jq (as the review needs; CI's runner has both), and gh and aws stand-ins. gh runs
// the block's own --jq over the fixture's repository as GitHub's API returns it; the fixture's subject
// has the immutable form first and owner/name in job_workflow_ref, so both forms are read. aws answers
// only the code's analyzer and RCP: a finding for each statement of each synthesised GitHub trust (the
// role's ARN, path included, its principal and its condition's keys and values, as Access Analyzer
// reports a role's trust), and the synthesised RCP. A finding carries no condition's operator, so a
// GitHub trust conditioned by anything but StringEquals fails the case (C0.11 review 13 CR-23). Every
// line must read expected, so a change to the trusts or the RCP that leaves the runbook behind (the
// set-up runbook's step O.2 fallback among them) fails here, not at the next review. Another
// repository, and each fault planted below, must read FINDING, so each refusal is held. bash finds
// only the stand-ins (gh, aws, and an env that takes only -u), jq and cat, and gh's and AWS's own
// configuration points nowhere, so a stand-in that can't run fails the case rather than reaching a real
// gh or aws (C0.11 review 12, review 13 T13-03).
describe('IAC-10 (C0.11 review 11 V22B-05): the quarterly review’s step 6 reads the trusts and the RCP the code renders as expected', () => {
  it('IAC-10: read 1 prints one expected line for each GitHub role, read 2 one for each environment, and another repository or a planted fault FINDING (C0.11 review 12)', () => {
    const review = readFileSync(new URL('../../../docs/runbooks/break-glass-review.md', import.meta.url), 'utf8')
    const step = review.slice(review.indexOf('\n6. '), review.indexOf('\n7. '))
    const blocks = [...step.matchAll(/^ *```sh\n([\s\S]*?)^ *```$/gm)].map(match => match[1] ?? '')
    expect(blocks).toHaveLength(3)
    // A block that looks past bash's PATH would reach a real gh or aws: command -p, a path to either
    // or to env (whose -i searches /bin:/usr/bin), or any use of PATH. The env bash finds is a stand-in
    // that refuses every option but -u, however it is spelt (C0.11 review 12 P2-03, review 13 T13-03).
    for (const block of blocks) expect(block).not.toMatch(/\bcommand\s+-p\b|\/(?:aws|gh|env)\b|\bPATH\b/)
    const ids = { "'<the non-prod account id>'": ACCOUNT.nonprod, "'<the prod account id>'": ACCOUNT.prod }
    let setUp = blocks[0] ?? ''
    for (const [placeholder, account] of Object.entries(ids)) {
      expect(setUp.split(placeholder)).toHaveLength(2)
      setUp = setUp.replace(placeholder, `'${account}'`)
    }
    const analyzedAt = '2026-10-01T00:00:00Z'
    const findings = KINDS.flatMap(kind => {
      const context = { account: ACCOUNT[kind], region: REGION, template: templateOf(kind) }
      return ofType(templateOf(kind), 'AWS::IAM::Role')
        .filter(([, r]) => String(r.Properties?.RoleName).startsWith('hearth-gh-'))
        .flatMap(([id, r]) => {
          const trust = r.Properties?.AssumeRolePolicyDocument as {
            Statement: Array<{ Principal?: { Federated?: unknown }; Condition?: Record<string, object> }>
          }
          return trust.Statement.map(statement => {
            expect(Object.keys(statement.Condition ?? {}), "step 6 reads a condition's keys and values only").toEqual([
              'StringEquals',
            ])
            return {
              resource: String(renderedString({ 'Fn::GetAtt': [id, 'Arn'] }, context)),
              resourceType: 'AWS::IAM::Role',
              resourceOwnerAccount: ACCOUNT[kind],
              status: 'ACTIVE',
              principal: { Federated: String(renderedString(statement.Principal?.Federated, context)) },
              condition: { ...statement.Condition?.StringEquals } as Record<string, unknown>,
              analyzedAt,
            }
          })
        })
    })
    const [, analyzer] = one(lz.templates.logArchive, 'AWS::AccessAnalyzer::Analyzer', 'Type', 'ORGANIZATION')
    const [, rcp] = one(lz.templates.foundation, 'AWS::Organizations::Policy', 'Name', RCP_NAME)
    const content = rcp.Properties?.Content
    type Statement = { Sid?: string; Condition?: Record<string, Record<string, unknown>> }
    const policy = (typeof content === 'string' ? JSON.parse(content) : content) as { Statement: Statement[] }
    const [owner = '', name = ''] = fixture.github.repository.split('/')
    const dir = mkdtempSync(join(tmpdir(), 'hearth-step6-'))
    try {
      // bash, and the two tools the blocks and stand-ins need, from this machine's PATH.
      const found = spawnSync('bash', ['-c', 'type -P bash jq cat'], { encoding: 'utf8' })
      expect(found.status, 'step 6 needs bash and jq').toBe(0)
      const [bash = '', ...tools] = found.stdout.trim().split('\n')
      for (const [i, tool] of ['jq', 'cat'].entries()) symlinkSync(tools[i] ?? '', join(dir, tool))
      const standIn = (command: string, lines: string[]) => {
        writeFileSync(join(dir, command), ['#!/bin/sh', ...lines, ''].join('\n'))
        chmodSync(join(dir, command), 0o755)
      }
      // env unsets each -u NAME, then runs the command through the shell's own search, the stand-ins'
      // folder; any other option or an assignment fails, so no spelling of -i reaches /usr/bin.
      standIn('env', [
        'while [ "$#" -gt 0 ]; do',
        '  case "$1" in',
        '    -u) [ "$#" -ge 3 ] && unset "$2" || exit 1; shift 2 ;;',
        '    -*|*=*) echo "env stand-in: $1 is not -u NAME" >&2; exit 1 ;;',
        '    *) exec "$@" ;;',
        '  esac',
        'done',
        'exit 1',
      ])
      standIn('aws', [
        'case " $* " in',
        `*" list-analyzers "*" analyzers[?name=='${String(analyzer.Properties?.AnalyzerName)}'].arn "*) echo analyzer ;;`,
        '*" list-findings "*" --analyzer-arn analyzer "*) cat "$STEP6/findings.json" ;;',
        `*" list-policies "*" Policies[?Name=='${RCP_NAME}'].Id "*) echo policy ;;`,
        '*" describe-policy --policy-id policy "*) cat "$STEP6/rcp.json" ;;',
        '*) exit 1 ;;',
        'esac',
      ])
      standIn('gh', [
        `[ "$#" = 4 ] && [ "$1" = api ] && [ "$2" = 'repos/{owner}/{repo}' ] && [ "$3" = --jq ] || exit 1`,
        'exec jq -cr "$4" "$STEP6/repo.json"',
      ])
      const env = {
        PATH: dir,
        HOME: dir,
        GH_CONFIG_DIR: dir,
        AWS_CONFIG_FILE: '/dev/null',
        AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
        AWS_EC2_METADATA_DISABLED: 'true',
        STEP6: dir,
      }
      const where = spawnSync(bash, ['-c', 'type -P gh aws env'], { encoding: 'utf8', env })
      expect(where.stdout, 'bash finds the stand-ins and no other gh, aws or env').toBe(
        `${join(dir, 'gh')}\n${join(dir, 'aws')}\n${join(dir, 'env')}\n`,
      )
      for (const option of ['-i', '--ignore-env', '-S-i', '-', 'PATH=/usr/bin'])
        expect(spawnSync(bash, ['-c', `env ${option} cat /dev/null`], { env }).status, option).not.toBe(0)
      expect(spawnSync(bash, ['-c', 'env -u GH_REPO -u GH_HOST cat /dev/null'], { env }).status).toBe(0)
      // The lines a read prints after the set-up's own, the repository's, over these answers.
      const run = (read: string, plant: { name?: string; findings?: unknown[]; policy?: unknown } = {}) => {
        const repository = plant.name ?? name
        const answers = {
          'repo.json': {
            full_name: `${owner}/${repository}`,
            name: repository,
            id: Number(fixture.github.repositoryId),
            owner: { login: owner, id: Number(fixture.github.ownerId) },
          },
          'findings.json': { findings: plant.findings ?? findings },
          'rcp.json': plant.policy ?? policy,
        }
        for (const [file, value] of Object.entries(answers)) writeFileSync(join(dir, file), JSON.stringify(value))
        const result = spawnSync(bash, ['-c', `set -euo pipefail\n${setUp}\n${read}`], { encoding: 'utf8', env })
        expect(result.status, result.stderr).toBe(0)
        return result.stdout.trim().split('\n').slice(1).sort()
      }
      const roles = KINDS.flatMap(kind => GITHUB_ROLES[kind].map(({ role }) => [ACCOUNT[kind], role]))
      const environments = [...new Set(KINDS.flatMap(kind => GITHUB_ROLES[kind].map(e => e.environment)))]
      const trusts = run(blocks[1] ?? '')
      expect(trusts.map(line => line.split('\t').slice(1))).toEqual(roles.map(r => [...r, 'expected']).sort())
      expect(trusts.every(line => line.startsWith(`${analyzedAt}\t`))).toBe(true)
      expect(step).toContain(`the first read prints exactly ${['one', 'two', 'three', 'four'][roles.length - 1]} lines`)
      expect(run(blocks[2] ?? '')).toEqual(environments.map(e => `${e}\texpected`).sort())
      expect(run(blocks[1] ?? '', { name: 'another' }).map(line => line.split('\t').at(-1))).toEqual(
        roles.map(() => 'FINDING'),
      )
      expect(run(blocks[2] ?? '', { name: 'another' })).toEqual(environments.map(e => `${e}\tFINDING`).sort())

      const gh = 'token.actions.githubusercontent.com'
      const [first, ...others] = findings
      if (first === undefined) throw new Error('no GitHub trust')
      const sub = String(first.condition[`${gh}:sub`])
      const elsewhere = environments.find(e => !sub.includes(`:environment:${e}:`))
      expect(sub.match(/:environment:[^:]+:/g)).toHaveLength(1)
      expect(sub.endsWith('@refs/heads/main')).toBe(true)
      const subjectOf = (subject: string) => [
        { ...first, condition: { ...first.condition, [`${gh}:sub`]: subject } },
        ...others,
      ]
      // Either form of this repository in each place reads expected, the fixture's arrangement among
      // the four (C0.11 review 13 T13-02).
      const forms = [
        fixture.github.repository,
        `${owner}@${fixture.github.ownerId}/${name}@${fixture.github.repositoryId}`,
      ] as const
      const placed = (inRepo: string, inWorkflow: string) =>
        sub
          .replace(/^repo:[^:]+:/, `repo:${inRepo}:`)
          .replace(/:job_workflow_ref:[^/]+\/[^/]+\//, `:job_workflow_ref:${inWorkflow}/`)
      expect(placed(forms[1], forms[0])).toBe(sub)
      for (const inRepo of forms)
        for (const inWorkflow of forms) {
          const lines = run(blocks[1] ?? '', { findings: subjectOf(placed(inRepo, inWorkflow)) })
          expect(
            lines.map(line => line.split('\t').at(-1)),
            `${inRepo} then ${inWorkflow}`,
          ).toEqual(roles.map(() => 'expected'))
        }

      // Read 1's refusals, a fault each, each one line FINDING: another environment's subject (which
      // the RCP lists, so only read 1 finds it), the workflow on another branch, another repository in
      // repo: alone, another in job_workflow_ref alone, another workflow file, another repository id or
      // owner id in the immutable form, in each place (the ids are what make that form name this
      // repository alone), another audience, another condition key, GitHub's provider in another
      // account, another role trusting GitHub's provider, and a GitHub role trusting a principal outside
      // the organisation with no GitHub key (C0.11 review 12 P2-01, P2-02, review 13 T13-01, P13-01).
      // Each subject planted differs from the fixture's.
      const changed = (subject: string) => {
        expect(subject).not.toBe(sub)
        return subjectOf(subject)
      }
      const { ownerId, repositoryId } = fixture.github
      const anotherRepository = `${owner}@${ownerId}/${name}@${Number(repositoryId) + 1}`
      const anotherOwner = `${owner}@${Number(ownerId) + 1}/${name}@${repositoryId}`
      for (const [i, plant] of [
        changed(sub.replace(/:environment:[^:]+:/, `:environment:${elsewhere}:`)),
        changed(sub.replace(/@refs\/heads\/main$/, '@refs/heads/other')),
        changed(sub.replace(/^repo:[^:]+:/, 'repo:elsewhere/hearth:')),
        changed(sub.replace(/:job_workflow_ref:[^/]+\/[^/]+\//, ':job_workflow_ref:elsewhere/hearth/')),
        changed(sub.replace('/deploy.yml@', '/other.yml@')),
        changed(placed(anotherRepository, forms[0])),
        changed(placed(anotherOwner, forms[0])),
        changed(placed(forms[1], anotherRepository)),
        changed(placed(forms[1], anotherOwner)),
        [{ ...first, condition: { ...first.condition, [`${gh}:aud`]: 'sts.example.com' } }, ...others],
        [{ ...first, condition: { ...first.condition, [`${gh}:actor`]: owner } }, ...others],
        [
          {
            ...first,
            principal: {
              Federated: first.principal.Federated.replace(`:${first.resourceOwnerAccount}:`, `:${logArchive}:`),
            },
          },
          ...others,
        ],
        [...findings, { ...first, resource: first.resource.replace(/[^/]*$/, 'hearth-other') }],
        [...findings, { ...first, principal: { AWS: fixtureAccount(999) }, condition: {} }],
      ].entries()) {
        expect(
          run(blocks[1] ?? '', { findings: plant }).filter(line => line.endsWith('\tFINDING')),
          `read 1's fault ${i}`,
        ).toHaveLength(1)
      }
      // Read 2's, each FINDING for every environment: a fourth subject naming another repository, a
      // further condition, and the statement allowing rather than denying.
      const ours = (statement: Statement) => statement.Sid === 'WebIdentityOnlyDeploySubjects'
      const subjects = policy.Statement.find(ours)?.Condition?.StringNotEquals?.[`${gh}:sub`] as string[]
      for (const change of [
        {
          Condition: {
            StringNotEquals: { [`${gh}:sub`]: [...subjects, subjects[0]?.replace(`/${name}@`, '/elsewhere@')] },
          },
        },
        { Condition: { StringNotEquals: { [`${gh}:sub`]: subjects }, Bool: { 'aws:ViaAWSService': 'false' } } },
        { Effect: 'Allow' },
      ]) {
        const plant = { ...policy, Statement: policy.Statement.map(s => (ours(s) ? { ...s, ...change } : s)) }
        expect(run(blocks[2] ?? '', { policy: plant })).toEqual(environments.map(e => `${e}\tFINDING`).sort())
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// hearth-boundary (C11-D26), statement by statement, in one account. Its SMS statements left by
// IAC-10's drop order when the owner's answer of 5 Nov 2026 (PR 2 question 1) added four model
// actions; hearth-baseline-2 denies AWS's own SMS in every member account (IAC-02).
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
        iam('saml-provider/AWSSSO_*_DO_NOT_DELETE'),
      ],
    },
    {
      Sid: 'FencedPassRole',
      Effect: 'Deny',
      Action: 'iam:PassRole',
      Resource: [iam('role/hearth-*-rule9-*'), iam('role/cdk-*')],
    },
    {
      Sid: 'BreakGlassParameter',
      Effect: 'Deny',
      Action: [
        'ssm:PutParameter',
        'ssm:DeleteParameter',
        'ssm:DeleteParameters',
        'ssm:LabelParameterVersion',
        'ssm:UnlabelParameterVersion',
      ],
      Resource: arn('ssm', REGION, account, 'parameter/hearth/break-glass/*'),
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
      'past the limit, drop NoRouteOut, then BreakGlassParameter (the SCPs still deny both; the SMS statements left first, PR 2 question 1), never NoModels, NoLongLivedCredentials or NoNewIdentityProviders',
    ).toBeLessThanOrEqual(MANAGED_LIMIT)
  })

  // Replayed against the boundary as rendered: the statements that deny a request outright, by action
  // and resource as IAM matches them, leaving out any statement with a condition, so the replay never
  // reports a deny the boundary might not make.
  const boundaryDenies = (template: ReturnType<typeof templateOf>) => {
    const [, boundary] = one(template, 'AWS::IAM::ManagedPolicy', 'ManagedPolicyName', 'hearth-boundary')
    const statements = (boundary.Properties?.PolicyDocument as { Statement: Statement[] } | undefined)?.Statement ?? []
    return (action: string, resource: string) =>
      statements
        .filter(statement => statement.Effect === 'Deny' && statement.Condition === undefined)
        .filter(statement =>
          listOf(statement.Action).some(pattern => globsOverlap(pattern.toLowerCase(), action.toLowerCase())),
        )
        .filter(statement => listOf(statement.Resource).some(pattern => globsOverlap(pattern, resource)))
        .map(statement => statement.Sid)
  }

  // The helper reads its bucket's name from the parameter by this name (infra/bin/break-glass.sh), and
  // the role it takes can only read it, so a bounded role that rewrote or deleted it would refuse every
  // break-glass session in the account.
  it('IAC-10 C11-D13 C11-D26: no bounded role rewrites, deletes or relabels the parameter the break-glass helper reads its bucket from; reading it, and writing the workload’s own parameters, stay open', () => {
    const template = templateOf(kind)
    const denies = boundaryDenies(template)
    const [, parameter] = one(template, 'AWS::SSM::Parameter', 'Name', '/hearth/break-glass/log-bucket')
    const at = (name: string) => arn('ssm', REGION, ACCOUNT[kind], `parameter${name}`)
    const helpers = at(String(parameter.Properties?.Name))
    for (const action of [
      'ssm:PutParameter',
      'ssm:DeleteParameter',
      'ssm:DeleteParameters',
      'ssm:LabelParameterVersion',
      'ssm:UnlabelParameterVersion',
    ]) {
      expect(denies(action, helpers), action).toEqual(['BreakGlassParameter'])
    }
    expect(denies('ssm:GetParameter', helpers)).toEqual([])
    expect(denies('ssm:GetParameters', helpers)).toEqual([])
    expect(denies('ssm:PutParameter', at(`/hearth/${kind}/app/setting`))).toEqual([])
  })

  // Every Identity Center sign-in to the account, HearthBreakGlassEntry's included, arrives through
  // Identity Center's own SAML provider, which its service-linked role makes and no boundary binds; a
  // bounded role that deleted it would shut the account's standing way in (hearth-baseline's
  // ProtectRoles refuses it to every other principal but the hearthbase execution role and OAAR).
  it('IAC-10 C11-D11 C11-D26: no bounded role deletes, changes or retags Identity Center’s own SAML provider, and none makes or changes another; reading it stays open', () => {
    const denies = boundaryDenies(templateOf(kind))
    const provider = arn('iam', '', ACCOUNT[kind], 'saml-provider/AWSSSO_0a1b2c3d4e5f6a7b_DO_NOT_DELETE')
    for (const action of ['iam:DeleteSAMLProvider', 'iam:TagSAMLProvider', 'iam:UntagSAMLProvider']) {
      expect(denies(action, provider), action).toEqual(['ProtectedNames'])
    }
    expect(denies('iam:UpdateSAMLProvider', provider)).toEqual(['NoNewIdentityProviders', 'ProtectedNames'])
    const another = arn('iam', '', ACCOUNT[kind], 'saml-provider/x')
    for (const action of ['iam:CreateSAMLProvider', 'iam:UpdateSAMLProvider']) {
      expect(denies(action, another), action).toEqual(['NoNewIdentityProviders'])
    }
    expect(denies('iam:GetSAMLProvider', provider)).toEqual([])
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
    'detail-userIdentity-arn': '$.detail.userIdentity.arn',
    'detail-requestParameters-sourceIdentity': '$.detail.requestParameters.sourceIdentity',
    'detail-userIdentity-sessionContext-sourceIdentity': '$.detail.userIdentity.sessionContext.sourceIdentity',
    'detail-requestParameters-tags-0--value': '$.detail.requestParameters.tags[0].value',
    'detail-errorCode': '$.detail.errorCode',
  },
  // A chained hop sets no source identity of its own, so the one its caller's session carries rides
  // beside it (C0.11 review 2 TRUST-03).
  template: (alarm: string) =>
    `{"alarm":"${alarm}","account":<account>,"action":<detail-eventName>,"caller":<detail-userIdentity-arn>,"sourceIdentity":<detail-requestParameters-sourceIdentity>,"inheritedSourceIdentity":<detail-userIdentity-sessionContext-sourceIdentity>,"reason":<detail-requestParameters-tags-0--value>,"error":<detail-errorCode>}`,
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

// The NS records a Baseline renders for prod's delegation of `nonprod.` to the given name servers: in
// prod alone, one under each domain whose list is filled, for two days; none while both are empty.
function delegationOf(template: Template, kind: Kind, nameServers: NameServers): unknown[] {
  if (kind !== 'prod') return []
  const zone = (name: string | undefined) => ({ Ref: one(template, 'AWS::Route53::HostedZone', 'Name', `${name}.`)[0] })
  return [
    { host: appHost('prod'), values: nameServers.app },
    { host: userContentHost('prod'), values: nameServers.userContent },
  ]
    .filter(({ values }) => values.length > 0)
    .map(({ host, values }) => ({
      HostedZoneId: zone(host),
      Name: `nonprod.${host}.`,
      Type: 'NS',
      TTL: '172800',
      ResourceRecords: [...values],
    }))
}
const nsRecords = (template: Template) =>
  ofType(template, 'AWS::Route53::RecordSet')
    .filter(([, r]) => r.Properties?.Type === 'NS')
    .map(([, r]) => r.Properties)

describe.each(KINDS)('C11-D43 C11-D44: %s’s zones, repository and parameters', kind => {
  const host = { app: appHost(kind), userContent: userContentHost(kind) }

  it('C11-D43: two public zones, the app’s and user content’s, each allowing Amazon’s certificate authority alone and retained once made, and no other record but prod’s delegation to the name servers committed in NONPROD_NAME_SERVERS (none while they are empty)', () => {
    const template = templateOf(kind)
    const zones = ofType(template, 'AWS::Route53::HostedZone')
    expect(zones.map(([, r]) => r.Properties)).toEqual([{ Name: `${host.app}.` }, { Name: `${host.userContent}.` }])
    for (const [, zone] of zones) {
      expect(zone.DeletionPolicy).toBe('RetainExceptOnCreate')
      expect(zone.UpdateReplacePolicy).toBe('Retain')
    }
    expect(ofType(template, 'AWS::Route53::RecordSet').map(([, r]) => r.Properties)).toEqual([
      ...zones.map(([id, zone]) => ({
        HostedZoneId: { Ref: id },
        Name: zone.Properties?.Name,
        Type: 'CAA',
        TTL: '1800',
        ResourceRecords: ['0 issue "amazon.com"'],
      })),
      ...delegationOf(template, kind, NONPROD_NAME_SERVERS),
    ])
  })

  it('C11-D24 C11-D30 C11-D43 C11-D44: the zones’ ids, the repository’s name, the break-glass-log bucket’s name and the organisation’s id sit in SSM parameters by fixed names, and nothing else does', () => {
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
      // The fixture's organisation id, joined from its parts as the fixture joins it (IG-01).
      { name: '/hearth/organisation/id', value: ['o', 'a'.repeat(10)].join('-') },
    ])
  })

  it('C11-D30: the organisation’s id, which every workload endpoint policy compares, is a plain String parameter holding the configuration’s id, made by the Baseline’s own construct', () => {
    const template = templateOf(kind)
    const [id, parameter] = one(template, 'AWS::SSM::Parameter', 'Name', '/hearth/organisation/id')
    expect(id).toMatch(/^OrganisationId[0-9A-F]{8}$/)
    expect(parameter.Properties).toEqual({
      Type: 'String',
      Name: '/hearth/organisation/id',
      Value: fixture.organization.id,
      Description: 'The organisation id the workload endpoint policies compare (C11-D30)',
    })
    expect(parameter.DeletionPolicy).toBeUndefined()
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
  it('C11-D43: once non-prod’s name servers are committed, prod delegates nonprod. under each domain to them for two days; until then it delegates nothing, and non-prod’s Baseline never does', () => {
    const nameServers = {
      app: ['ns-1.awsdns-01.com', 'ns-2.awsdns-02.net', 'ns-3.awsdns-03.org', 'ns-4.awsdns-04.co.uk'],
      userContent: ['ns-5.awsdns-05.com', 'ns-6.awsdns-06.net', 'ns-7.awsdns-07.org', 'ns-8.awsdns-08.co.uk'],
    }
    const none = { app: [], userContent: [] }
    // The committed synth delegates to whatever NONPROD_NAME_SERVERS holds, and the variants pin both
    // states whatever is committed.
    expect(nsRecords(templateOf('prod'))).toEqual(delegationOf(templateOf('prod'), 'prod', NONPROD_NAME_SERVERS))
    const delegated = synthLandingZone({ nonprodNameServers: nameServers }).templates
    const zone = (name: string | undefined) => ({
      Ref: one(delegated.prodBaseline, 'AWS::Route53::HostedZone', 'Name', `${name}.`)[0],
    })
    expect(nsRecords(delegated.prodBaseline)).toEqual([
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
    // The form the committed synth is checked against is this one.
    expect(delegationOf(delegated.prodBaseline, 'prod', nameServers)).toEqual(nsRecords(delegated.prodBaseline))
    expect(nsRecords(delegated.nonprodBaseline)).toEqual([])
    expect(nsRecords(synthLandingZone({ nonprodNameServers: none }).templates.prodBaseline)).toEqual([])
  }, 60_000)
})
