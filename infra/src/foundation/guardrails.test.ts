// IAC-02 (C11-D05 to C11-D08; TECH-SPEC T24 item 2): the organisation's guardrails as Hearth-Foundation
// renders them. Each SCP's, the RCP's and the AI opt-out's Content is minified JSON text, so what is
// measured is what Organizations receives, parsed back here to exactly the document this file builds
// from the fixture and literal lists: the evidence floor, the protected names, the Region fence, the
// log-archive and workload fences and the data perimeter. Every exception names one of the listed
// role patterns and nothing wider; the floor binds everyone, keyed on nothing but a key's tag; the
// log-protect SCP excepts nobody; the RCP's STS statements reach one call each. A small evaluator
// replays the requests that would mute an alarm, hand a role outside, or reach the hearthbase
// execution role through CloudFormation against the SCPs binding a workload account. Root holds four of
// Hearth's SCPs beside AWS's FullAWSAccess, the five Organizations allows, so a later step merges into
// one of them. The floor's bucket patterns are checked against LogArchive's actual bucket names, so the
// two can't drift apart. The pure scpProblems() is proved on planted contents first, and the RCP's
// stage on a variant synth with it at Root. Expected ARNs are joined from their parts here, never built
// through src/config/arns.ts (IG-01), and the model deny comes from the lists (IG-10).
import { beforeAll, describe, expect, it } from 'vitest'
import { LZ_REASON_SHAPES } from '../baseline/break-glass.ts'
import { githubSubject } from '../config/env.ts'
import { globsOverlap, modelDenyActions } from '../config/models.ts'
import { fixtureConfig } from '../testing/fixture.ts'
import { type LandingZoneSynth, synthLandingZone } from '../testing/landing-zone.ts'

type Template = Record<string, unknown>
interface Resource {
  Type: string
  Properties?: Record<string, unknown>
  DeletionPolicy?: string
  UpdateReplacePolicy?: string
}
interface Statement {
  Sid?: string
  Effect?: string
  Principal?: unknown
  Action?: string | string[]
  NotAction?: string | string[]
  Resource?: string | string[]
  NotResource?: string | string[]
  Condition?: Record<string, Record<string, string | string[]>>
}

const fixture = fixtureConfig()
const { rootId } = fixture.organization
const { security, workloads, recovery } = fixture.organization.ous

const resourcesIn = (template: Template): Array<[string, Resource]> =>
  Object.entries((template.Resources ?? {}) as Record<string, Resource>)
const list = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

// ARNs and patterns, joined from their parts (IG-01).
const arn = (service: string, region: string, account: string, resource: string) =>
  ['arn', 'aws', service, region, account, resource].join(':')
const anyIam = (resource: string) => arn('iam', '', '*', resource)
const anywhere = (service: string, resource: string) => arn(service, '*', '*', resource)
const role = (name: string) => anyIam(`role/${name}`)
const dbUser = (login: string) => anywhere('rds-db', `dbuser:*/${login}`)
const secret = (name: string) => anywhere('secretsmanager', `secret:${name}`)
const taskDefinitions = (family: string) => anywhere('ecs', `task-definition/${family}:*`)

// The role patterns an SCP may name in a principal condition (C11-D05, C11-D26): each qualifier's
// CloudFormation execution role and deploy role, OrganizationAccountAccessRole, break-glass, GitHub's
// deploy role and both GitHub roles, every hearth bootstrap role, the server task roles by kind and
// Rule 9's execution role, each in any account.
const EXEC = role('cdk-hearthbase-cfn-exec-role-*-ap-southeast-1')
const APP_EXEC = role('cdk-hearthapp-cfn-exec-role-*-ap-southeast-1')
const BASE_DEPLOY = role('cdk-hearthbase-deploy-role-*-ap-southeast-1')
const APP_DEPLOY = role('cdk-hearthapp-deploy-role-*-ap-southeast-1')
const OAAR = role('OrganizationAccountAccessRole')
const BREAK_GLASS = role('hearth-break-glass')
const GH_DEPLOY = role('hearth-gh-deploy')
const GH_ROLES = role('hearth-gh-*')
const CDK_HEARTH = role('cdk-hearth*')
const task = (kind: string) => role(`hearth-*-${kind}-task`)
const RULE9_EXEC = role('hearth-*-rule9-exec')
const ALLOWED_PRINCIPAL_PATTERNS: readonly string[] = [
  OAAR,
  EXEC,
  APP_EXEC,
  BASE_DEPLOY,
  APP_DEPLOY,
  BREAK_GLASS,
  GH_DEPLOY,
  GH_ROLES,
  CDK_HEARTH,
  task('migrate'),
  task('api'),
  task('realtime'),
  task('worker'),
  task('rule9'),
  RULE9_EXEC,
]

// The three log-archive buckets and their objects, in any account (C11-D05).
const LOG_BUCKETS = ['hearth-org-trail-', 'hearth-break-glass-log-', 'hearth-archive-'].flatMap(prefix => [
  arn('s3', '', '', `${prefix}*`),
  arn('s3', '', '', `${prefix}*/*`),
])
// A key carrying the hearth-sec tag, which the floor protects keys by.
const TAGGED = { Null: { 'aws:ResourceTag/hearth-sec': 'false' } }
const except = (...patterns: string[]) => ({
  ArnNotLike: { 'aws:PrincipalArn': patterns.length === 1 ? (patterns[0] ?? '') : patterns },
})
const only = (pattern: string) => ({ ArnLike: { 'aws:PrincipalArn': pattern } })

// The lists the guardrails name, written out here so a change to one fails this test.
const IAM_WRITES = [
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
]
const SMS = [
  'sms-voice:*',
  'mobiletargeting:*',
  'sns:SetSMSAttributes',
  'sns:CreateSMSSandboxPhoneNumber',
  'sns:VerifySMSSandboxPhoneNumber',
  'sns:OptInPhoneNumber',
]
const NEW_IDENTITY_PROVIDERS = [
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
]
const CFN_WRITES = [
  'cloudformation:Create*',
  'cloudformation:Update*',
  'cloudformation:Delete*',
  'cloudformation:Execute*',
  'cloudformation:Continue*',
  'cloudformation:Rollback*',
  'cloudformation:Set*',
  'cloudformation:Import*',
  'cloudformation:Tag*',
  'cloudformation:Untag*',
  'cloudformation:Activate*',
  'cloudformation:Deactivate*',
  'cloudformation:Register*',
  'cloudformation:Deregister*',
  'cloudformation:Publish*',
]
const REGION_NOT_ACTIONS = [
  'iam:*',
  'organizations:*',
  'sts:*',
  'route53:*',
  'route53domains:*',
  'cloudfront:*',
  'support:*',
  'budgets:*',
  'ce:*',
  'cur:*',
  'health:*',
  'account:*',
  'sso:*',
  'sso-directory:*',
  'identitystore:*',
  'signin:*',
  'billing:*',
  'pricing:*',
  'trustedadvisor:*',
  's3:ListAllMyBuckets',
  's3:GetAccountPublic*',
  'ec2:DescribeRegions',
  'guardduty:*',
]

// The documents each policy must hold, exactly (C11-D05 to C11-D08).
const document = (Statement: Statement[]) => ({ Version: '2012-10-17', Statement })
const NO_OAAR: Statement = { Sid: 'NoOaar', Effect: 'Deny', Action: '*', Resource: '*', Condition: only(OAAR) }
const EXPECTED: Record<string, { type: string; targets: string[]; document: unknown }> = {
  'hearth-baseline': {
    type: 'SERVICE_CONTROL_POLICY',
    targets: [rootId],
    document: document([
      { Sid: 'FloorLogBuckets', Effect: 'Deny', Action: ['s3:Delete*', 's3:BypassGovernance*'], Resource: LOG_BUCKETS },
      {
        Sid: 'FloorLogKeys',
        Effect: 'Deny',
        Action: ['kms:ScheduleKeyDeletion', 'kms:DisableKey'],
        Resource: '*',
        Condition: TAGGED,
      },
      {
        Sid: 'FloorLogKeyTag',
        Effect: 'Deny',
        Action: 'kms:UntagResource',
        Resource: '*',
        Condition: { 'ForAnyValue:StringEquals': { 'aws:TagKeys': ['hearth-sec'] } },
      },
      {
        Sid: 'FloorLogKeyLockout',
        Effect: 'Deny',
        Action: 'kms:PutKeyPolicy',
        Resource: '*',
        Condition: { ...TAGGED, Bool: { 'kms:BypassPolicyLockoutSafetyCheck': 'true' } },
      },
      {
        Sid: 'FloorLogKeyAliases',
        Effect: 'Deny',
        Action: ['kms:UpdateAlias', 'kms:DeleteAlias'],
        Resource: [anywhere('kms', 'alias/hearth-sec'), anywhere('kms', 'alias/hearth-archive')],
      },
      { Sid: 'StayInOrganization', Effect: 'Deny', Action: 'organizations:LeaveOrganization', Resource: '*' },
      {
        Sid: 'ProtectAudit',
        Effect: 'Deny',
        Action: [
          'cloudtrail:StopLogging',
          'cloudtrail:DeleteTrail',
          'cloudtrail:UpdateTrail',
          'cloudtrail:PutEventSelectors',
          'cloudtrail:PutInsightSelectors',
          'guardduty:Delete*',
          'guardduty:Disassociate*',
          'guardduty:StopMonitoringMembers',
          'guardduty:UpdateDetector',
          'guardduty:UpdateOrganizationConfiguration',
          'guardduty:UpdateMemberDetectors',
          'guardduty:CreateFilter',
          'guardduty:UpdateFilter',
          'guardduty:CreateIPSet',
          'guardduty:UpdateIPSet',
          'access-analyzer:DeleteAnalyzer',
          'access-analyzer:*ArchiveRule',
        ],
        Resource: '*',
        Condition: except(EXEC, OAAR),
      },
      {
        Sid: 'ProtectAlarms',
        Effect: 'Deny',
        Action: [
          'events:DeleteRule',
          'events:DisableRule',
          'events:PutRule',
          'events:PutTargets',
          'events:RemoveTargets',
          'sns:DeleteTopic',
          'sns:SetTopicAttributes',
          'sns:AddPermission',
          'sns:RemovePermission',
          'sns:Subscribe',
          'sns:Unsubscribe',
          'sns:SetSubscriptionAttributes',
          'sns:PutDataProtectionPolicy',
          'logs:Delete*',
          'logs:Put*',
          'logs:Disassociate*',
        ],
        Resource: [
          anywhere('events', 'rule/hearth-sec-*'),
          anywhere('sns', 'hearth-ops-alerts'),
          anywhere('sns', 'hearth-ops-alerts:*'),
          anywhere('logs', 'log-group:/hearth/security/*'),
        ],
        Condition: except(EXEC, OAAR),
      },
      {
        Sid: 'ProtectRoles',
        Effect: 'Deny',
        Action: IAM_WRITES,
        Resource: [
          anyIam('role/hearth-break-glass*'),
          anyIam('role/hearth-gh-*'),
          anyIam('role/aws-reserved/sso.amazonaws.com/*'),
          anyIam('oidc-provider/token.actions.githubusercontent.com'),
          anyIam('policy/hearth-boundary'),
        ],
        Condition: except(EXEC, OAAR),
      },
      {
        Sid: 'ProtectFlowLogs',
        Effect: 'Deny',
        Action: 'ec2:DeleteFlowLogs',
        Resource: '*',
        Condition: except(EXEC, APP_EXEC),
      },
      {
        Sid: 'ProtectBootstrapRoles',
        Effect: 'Deny',
        Action: IAM_WRITES,
        Resource: anyIam('role/cdk-*'),
        Condition: except(OAAR),
      },
    ]),
  },
  'hearth-baseline-2': {
    type: 'SERVICE_CONTROL_POLICY',
    targets: [rootId],
    document: document([
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
        Sid: 'NoAccountChanges',
        Effect: 'Deny',
        Action: [
          'account:PutContactInformation',
          'account:PutAlternateContact',
          'account:DeleteAlternateContact',
          'account:EnableRegion',
          'account:DisableRegion',
          'account:PutAccountName',
        ],
        Resource: '*',
      },
      {
        Sid: 'NoExternalShares',
        Effect: 'Deny',
        Action: ['ram:CreateResourceShare', 'ram:UpdateResourceShare'],
        Resource: '*',
        Condition: { Bool: { 'ram:RequestedAllowsExternalPrincipals': 'true' } },
      },
      {
        Sid: 'NoExternalShareAssociations',
        Effect: 'Deny',
        Action: 'ram:AssociateResourceShare',
        Resource: '*',
        Condition: { Bool: { 'ram:AllowsExternalPrincipals': 'true' } },
      },
      {
        Sid: 'SetUpOnly',
        Effect: 'Deny',
        Action: ['s3:PutAccountPublicAccessBlock', 'ec2:DisableEbsEncryptionByDefault'],
        Resource: '*',
        Condition: except(OAAR),
      },
      {
        Sid: 'NoSnapshotSharing',
        Effect: 'Deny',
        Action: [
          'rds:ModifyDBSnapshotAttribute',
          'rds:ModifyDBClusterSnapshotAttribute',
          'ec2:ModifySnapshotAttribute',
        ],
        Resource: '*',
      },
      { Sid: 'NoAwsSms', Effect: 'Deny', Action: SMS, Resource: '*' },
      {
        Sid: 'NoSmsSubscriptions',
        Effect: 'Deny',
        Action: 'sns:Subscribe',
        Resource: '*',
        Condition: { StringEquals: { 'sns:Protocol': 'sms' } },
      },
      { Sid: 'NoDirectPublish', Effect: 'Deny', Action: 'sns:Publish', NotResource: anywhere('sns', '*') },
    ]),
  },
  'hearth-no-models': {
    type: 'SERVICE_CONTROL_POLICY',
    targets: [rootId],
    document: document([{ Sid: 'NoModels', Effect: 'Deny', Action: modelDenyActions(), Resource: '*' }]),
  },
  'hearth-region': {
    type: 'SERVICE_CONTROL_POLICY',
    targets: [rootId],
    document: document([
      {
        Sid: 'OnlySingapore',
        Effect: 'Deny',
        NotAction: REGION_NOT_ACTIONS,
        Resource: '*',
        Condition: { StringNotEquals: { 'aws:RequestedRegion': 'ap-southeast-1' } },
      },
      {
        Sid: 'GuardDutyAlsoUsEast1',
        Effect: 'Deny',
        Action: 'guardduty:*',
        Resource: '*',
        Condition: { StringNotEquals: { 'aws:RequestedRegion': ['ap-southeast-1', 'us-east-1'] } },
      },
    ]),
  },
  'hearth-log-protect': {
    type: 'SERVICE_CONTROL_POLICY',
    targets: [security],
    document: document([
      {
        Sid: 'NoLogBucketAdministration',
        Effect: 'Deny',
        Action: ['s3:PutBucket*', 's3:PutLifecycle*', 's3:PutObjectRe*', 's3:PutObjectLe*', 's3:PutEncryption*'],
        Resource: LOG_BUCKETS,
      },
      {
        Sid: 'NoLogKeyAdministration',
        Effect: 'Deny',
        Action: ['kms:PutKeyPolicy', 'kms:CreateGrant'],
        Resource: '*',
        Condition: TAGGED,
      },
      {
        Sid: 'NoLandingZoneDeploys',
        Effect: 'Deny',
        Action: 'sts:AssumeRole',
        Resource: anyIam('role/cdk-hearthbase-*'),
      },
      NO_OAAR,
    ]),
  },
  'hearth-workload-fences': {
    type: 'SERVICE_CONTROL_POLICY',
    targets: [workloads],
    document: document([
      NO_OAAR,
      {
        Sid: 'ExecOnlyBreakGlass',
        Effect: 'Deny',
        Action: ['ecs:ExecuteCommand', 'ssm:StartSession'],
        Resource: '*',
        Condition: except(BREAK_GLASS),
      },
      {
        Sid: 'BastionOnlyBreakGlass',
        Effect: 'Deny',
        Action: 'ecs:RunTask',
        Resource: taskDefinitions('hearth-*-bastion'),
        Condition: except(BREAK_GLASS),
      },
      {
        Sid: 'OneOffsOnlyDeploy',
        Effect: 'Deny',
        Action: 'ecs:RunTask',
        Resource: [taskDefinitions('hearth-*-migrate'), taskDefinitions('hearth-*-probe')],
        Condition: except(GH_DEPLOY),
      },
      {
        Sid: 'DbBreakGlassLogins',
        Effect: 'Deny',
        Action: 'rds-db:connect',
        Resource: [dbUser('hearth_bootstrap'), dbUser('hearth_breakglass_read')],
        Condition: except(BREAK_GLASS),
      },
      {
        Sid: 'DbMigrateLogin',
        Effect: 'Deny',
        Action: 'rds-db:connect',
        Resource: dbUser('hearth_migrate'),
        Condition: except(task('migrate')),
      },
      {
        Sid: 'DbAppLogin',
        Effect: 'Deny',
        Action: 'rds-db:connect',
        Resource: dbUser('hearth_app'),
        Condition: except(task('api'), task('realtime')),
      },
      {
        Sid: 'DbWorkerLogin',
        Effect: 'Deny',
        Action: 'rds-db:connect',
        Resource: dbUser('hearth_worker'),
        Condition: except(task('worker')),
      },
      {
        Sid: 'DbRule9Login',
        Effect: 'Deny',
        Action: 'rds-db:connect',
        Resource: dbUser('hearth_rule9'),
        Condition: except(task('rule9')),
      },
      {
        Sid: 'DbNoOtherLogin',
        Effect: 'Deny',
        Action: 'rds-db:connect',
        NotResource: [
          'hearth_bootstrap',
          'hearth_breakglass_read',
          'hearth_migrate',
          'hearth_app',
          'hearth_worker',
          'hearth_rule9',
        ].map(dbUser),
      },
    ]),
  },
  'hearth-workload-fences-2': {
    type: 'SERVICE_CONTROL_POLICY',
    targets: [workloads],
    document: document([
      {
        Sid: 'NoPipelineSecretReads',
        Effect: 'Deny',
        Action: 'secretsmanager:GetSecretValue',
        Resource: '*',
        Condition: { ArnLike: { 'aws:PrincipalArn': [GH_ROLES, CDK_HEARTH] } },
      },
      {
        Sid: 'BootstrapInputOnlyBreakGlass',
        Effect: 'Deny',
        Action: 'secretsmanager:GetSecretValue',
        Resource: secret('hearth/*/bootstrap-input*'),
        Condition: except(BREAK_GLASS),
      },
      {
        Sid: 'Rule9SecretByName',
        Effect: 'Deny',
        Action: 'secretsmanager:GetSecretValue',
        Resource: secret('hearth/*/rule9*'),
        Condition: except(task('rule9'), RULE9_EXEC),
      },
      {
        Sid: 'Rule9SecretByTag',
        Effect: 'Deny',
        Action: 'secretsmanager:GetSecretValue',
        Resource: '*',
        Condition: {
          StringEquals: { 'secretsmanager:ResourceTag/hearth:access': 'rule9' },
          ...except(task('rule9'), RULE9_EXEC),
        },
      },
      {
        Sid: 'HearthbaseOnlyBreakGlass',
        Effect: 'Deny',
        Action: 'sts:AssumeRole',
        Resource: anyIam('role/cdk-hearthbase-*'),
        Condition: except(BREAK_GLASS),
      },
      {
        Sid: 'HearthbaseOnlyLzReason',
        Effect: 'Deny',
        Action: 'sts:AssumeRole',
        Resource: anyIam('role/cdk-hearthbase-*'),
        Condition: { StringNotLike: { 'aws:PrincipalTag/hearth-reason': [...LZ_REASON_SHAPES] } },
      },
      {
        Sid: 'HearthappOnlyDeploy',
        Effect: 'Deny',
        Action: 'sts:AssumeRole',
        Resource: anyIam('role/cdk-hearthapp-*'),
        Condition: except(GH_DEPLOY),
      },
      {
        Sid: 'HearthbaseExecOnlyItsDeploy',
        Effect: 'Deny',
        Action: 'iam:PassRole',
        Resource: EXEC,
        Condition: except(BASE_DEPLOY),
      },
      {
        Sid: 'HearthappExecOnlyItsDeploy',
        Effect: 'Deny',
        Action: 'iam:PassRole',
        Resource: APP_EXEC,
        Condition: except(APP_DEPLOY),
      },
      {
        Sid: 'HearthbaseStacksOnlyItsDeploy',
        Effect: 'Deny',
        Action: CFN_WRITES,
        Resource: [
          anywhere('cloudformation', 'stack/Hearth-*-Baseline/*'),
          anywhere('cloudformation', 'stack/CDKToolkit-hearthbase/*'),
        ],
        Condition: except(BASE_DEPLOY),
      },
      {
        Sid: 'Rule9RolesFenced',
        Effect: 'Deny',
        Action: [
          'iam:CreateRole',
          'iam:UpdateAssumeRolePolicy',
          'iam:PutRolePolicy',
          'iam:AttachRolePolicy',
          'iam:PutRolePermissionsBoundary',
          'iam:TagRole',
          'iam:UntagRole',
          'iam:PassRole',
        ],
        Resource: anyIam('role/hearth-*-rule9-*'),
      },
      {
        Sid: 'AppRolesBounded',
        Effect: 'Deny',
        Action: 'iam:CreateRole',
        Resource: '*',
        Condition: {
          ...only(APP_EXEC),
          StringNotLike: { 'iam:PermissionsBoundary': anyIam('policy/hearth-boundary') },
        },
      },
      {
        Sid: 'BoundaryOnlyHearthbase',
        Effect: 'Deny',
        Action: ['iam:DeleteRolePermissionsBoundary', 'iam:PutRolePermissionsBoundary'],
        Resource: '*',
        Condition: except(EXEC),
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
        Sid: 'NoNewIdentityProviders',
        Effect: 'Deny',
        Action: NEW_IDENTITY_PROVIDERS,
        Resource: '*',
        Condition: except(EXEC, OAAR),
      },
    ]),
  },
  'hearth-data-perimeter': {
    type: 'RESOURCE_CONTROL_POLICY',
    targets: [fixture.accounts.nonprod],
    document: document([
      {
        Sid: 'OrgPrincipalsOnly',
        Effect: 'Deny',
        Principal: '*',
        Action: ['s3:*', 'kms:*', 'secretsmanager:*'],
        Resource: '*',
        Condition: {
          StringNotEqualsIfExists: { 'aws:PrincipalOrgID': fixture.organization.id },
          BoolIfExists: { 'aws:PrincipalIsAWSService': 'false' },
        },
      },
      {
        Sid: 'TlsOnly',
        Effect: 'Deny',
        Principal: '*',
        Action: 's3:*',
        Resource: '*',
        Condition: { BoolIfExists: { 'aws:SecureTransport': 'false' } },
      },
      {
        Sid: 'AssumeRoleOrgOnly',
        Effect: 'Deny',
        Principal: '*',
        Action: 'sts:AssumeRole',
        Resource: '*',
        Condition: {
          StringNotEqualsIfExists: { 'aws:PrincipalOrgID': fixture.organization.id },
          BoolIfExists: { 'aws:PrincipalIsAWSService': 'false' },
        },
      },
      {
        Sid: 'WebIdentityOnlyDeploySubjects',
        Effect: 'Deny',
        Principal: '*',
        Action: 'sts:AssumeRoleWithWebIdentity',
        Resource: '*',
        Condition: {
          StringNotEquals: {
            'token.actions.githubusercontent.com:sub': [
              githubSubject(fixture.github, 'nonprod'),
              githubSubject(fixture.github, 'prod-plan'),
              githubSubject(fixture.github, 'prod'),
            ],
          },
        },
      },
    ]),
  },
  'hearth-ai-opt-out': {
    type: 'AISERVICES_OPT_OUT_POLICY',
    targets: [rootId],
    document: {
      services: {
        '@@operators_allowed_for_child_policies': ['@@none'],
        default: {
          '@@operators_allowed_for_child_policies': ['@@none'],
          opt_out_policy: { '@@operators_allowed_for_child_policies': ['@@none'], '@@assign': 'optOut' },
        },
      },
    },
  },
}

// Organizations' limit on an SCP's or RCP's content, in characters.
const POLICY_LIMIT = 5_120

// IAC-02's rules on one SCP's or the RCP's Content (C11-D05, C11-D07), as problems: it is minified
// JSON text within the limit, version 2012-10-17, Deny-only; every principal condition names a listed
// role pattern; a floor statement is keyed on no principal; and an RCP statement names Principal `*`
// and, for STS, exactly one call, AssumeRole or AssumeRoleWithWebIdentity (never `sts:*` or a
// wildcard that would reach tagging, source identity or SAML).
function scpProblems(content: unknown, allowedPatterns: readonly string[], kind: 'scp' | 'rcp'): string[] {
  if (typeof content !== 'string') return ['its content is not text']
  let parsed: { Version?: unknown; Statement?: Statement[] }
  try {
    parsed = JSON.parse(content) as typeof parsed
  } catch {
    return ['its content is not JSON']
  }
  const problems: string[] = []
  if (content !== JSON.stringify(parsed)) problems.push('its content is not minified')
  if (content.length > POLICY_LIMIT)
    problems.push(`its content holds ${content.length} characters, over ${POLICY_LIMIT}`)
  if (parsed.Version !== '2012-10-17') problems.push('its version is not 2012-10-17')
  for (const statement of parsed.Statement ?? []) {
    const sid = statement.Sid ?? '(no Sid)'
    if (statement.Effect !== 'Deny')
      problems.push(`${sid}: an ${String(statement.Effect)}, where only a Deny may stand`)
    for (const [operator, keys] of Object.entries(statement.Condition ?? {})) {
      for (const [key, value] of Object.entries(keys)) {
        if (key.startsWith('aws:Principal') && sid.startsWith('Floor')) {
          problems.push(`${sid}: a floor statement keyed on the principal (${operator} ${key})`)
        }
        if (key !== 'aws:PrincipalArn' || !/^(?:Arn|String)(?:Not)?Like$/.test(operator)) continue
        for (const pattern of list(value)) {
          if (!allowedPatterns.includes(pattern)) problems.push(`${sid}: names ${pattern}, which isn't a listed role`)
        }
      }
    }
    if (kind === 'rcp') {
      if (statement.Principal !== '*') problems.push(`${sid}: an RCP statement names no Principal *`)
      for (const action of list(statement.Action)) {
        const sts = globsOverlap(action.toLowerCase(), 'sts:*')
        if (sts && action !== 'sts:AssumeRole' && action !== 'sts:AssumeRoleWithWebIdentity') {
          problems.push(`${sid}: ${action} reaches more of STS than one call`)
        }
      }
    }
  }
  return problems
}

let lz: LandingZoneSynth
let foundation: Template
// Each Organizations policy in a Foundation template, by name.
const policiesIn = (template: Template) =>
  new Map(
    resourcesIn(template)
      .filter(([, r]) => r.Type === 'AWS::Organizations::Policy')
      .map(([, r]) => [String(r.Properties?.Name), r] as const),
  )

beforeAll(() => {
  lz = synthLandingZone()
  foundation = lz.templates.foundation
}, 60_000)

describe('IAC-02 C11-D05: scpProblems', () => {
  const ok = (statement: Statement) => JSON.stringify(document([statement]))
  const floor: Statement = { Sid: 'FloorLogBuckets', Effect: 'Deny', Action: 's3:Delete*', Resource: LOG_BUCKETS }
  const rcp: Statement = { Sid: 'TlsOnly', Effect: 'Deny', Principal: '*', Action: 's3:*', Resource: '*' }

  it('IAC-02 finds content over 5,120 characters, not minified, not JSON or not text, an Allow, an unlisted exception and a floor statement keyed on the principal, on planted SCPs', () => {
    const long = ok({ Sid: 'Long', Effect: 'Deny', Action: 's3:Delete*', Resource: Array(200).fill(LOG_BUCKETS[0]) })
    expect(scpProblems(long, ALLOWED_PRINCIPAL_PATTERNS, 'scp')).toEqual([
      `its content holds ${long.length} characters, over 5120`,
    ])
    expect(scpProblems(JSON.stringify(document([floor]), null, 2), ALLOWED_PRINCIPAL_PATTERNS, 'scp')).toEqual([
      'its content is not minified',
    ])
    expect(scpProblems('{', ALLOWED_PRINCIPAL_PATTERNS, 'scp')).toEqual(['its content is not JSON'])
    expect(scpProblems(document([floor]), ALLOWED_PRINCIPAL_PATTERNS, 'scp')).toEqual(['its content is not text'])
    expect(
      scpProblems(ok({ Sid: 'Open', Effect: 'Allow', Action: '*', Resource: '*' }), ALLOWED_PRINCIPAL_PATTERNS, 'scp'),
    ).toEqual(['Open: an Allow, where only a Deny may stand'])
    expect(
      scpProblems(
        ok({ Sid: 'Wide', Effect: 'Deny', Action: '*', Resource: '*', Condition: except(EXEC, role('hearth-*')) }),
        ALLOWED_PRINCIPAL_PATTERNS,
        'scp',
      ),
    ).toEqual([`Wide: names ${role('hearth-*')}, which isn't a listed role`])
    expect(scpProblems(ok({ ...floor, Condition: except(EXEC) }), ALLOWED_PRINCIPAL_PATTERNS, 'scp')).toEqual([
      'FloorLogBuckets: a floor statement keyed on the principal (ArnNotLike aws:PrincipalArn)',
    ])
    expect(scpProblems(ok(floor), ALLOWED_PRINCIPAL_PATTERNS, 'scp')).toEqual([])
  })

  it('IAC-02 C11-D07 finds an RCP statement reaching all of STS, or any wildcard of it, and one naming no Principal *', () => {
    const sts = (action: string): Statement => ({ ...rcp, Sid: 'Sts', Action: action })
    expect(scpProblems(ok(sts('sts:*')), ALLOWED_PRINCIPAL_PATTERNS, 'rcp')).toEqual([
      'Sts: sts:* reaches more of STS than one call',
    ])
    expect(scpProblems(ok(sts('sts:AssumeRole*')), ALLOWED_PRINCIPAL_PATTERNS, 'rcp')).toEqual([
      'Sts: sts:AssumeRole* reaches more of STS than one call',
    ])
    expect(scpProblems(ok(sts('*')), ALLOWED_PRINCIPAL_PATTERNS, 'rcp')).toEqual([
      'Sts: * reaches more of STS than one call',
    ])
    const { Principal: _, ...withoutPrincipal } = rcp
    expect(scpProblems(ok(withoutPrincipal), ALLOWED_PRINCIPAL_PATTERNS, 'rcp')).toEqual([
      'TlsOnly: an RCP statement names no Principal *',
    ])
    expect(scpProblems(ok(sts('sts:AssumeRole')), ALLOWED_PRINCIPAL_PATTERNS, 'rcp')).toEqual([])
  })
})

describe('IAC-02 C11-D05 to C11-D08: the guardrails as Hearth-Foundation renders them', () => {
  it('IAC-02: seven SCPs, one RCP and one AI opt-out, each a construct of Guardrails, retained once made (never on a rolled-back create, so a failed first deploy can be retried), with a description citing its decision', () => {
    const guardrails = lz.stacks.foundation?.node.tryFindChild('Guardrails')
    expect(guardrails?.node.children.map(child => child.node.id)).toEqual([
      'Baseline',
      'Baseline2',
      'NoModels',
      'Region',
      'LogProtect',
      'WorkloadFences',
      'WorkloadFences2',
      'DataPerimeter',
      'AiOptOut',
    ])
    const policies = policiesIn(foundation)
    expect([...policies.keys()]).toEqual(Object.keys(EXPECTED))
    for (const [name, policy] of policies) {
      expect(policy.Properties?.Type, name).toBe(EXPECTED[name]?.type)
      expect(policy.DeletionPolicy, name).toBe('RetainExceptOnCreate')
      expect(policy.UpdateReplacePolicy, name).toBe('Retain')
      expect(String(policy.Properties?.Description), name).toMatch(/\(C11-D\d{2}[,)]/)
    }
  })

  it('IAC-02: each policy’s Content is minified JSON text, parsed back to exactly the document this test builds, on exactly its targets', () => {
    for (const [name, policy] of policiesIn(foundation)) {
      const content = policy.Properties?.Content
      expect(typeof content, name).toBe('string')
      expect(content, name).toBe(JSON.stringify(JSON.parse(String(content))))
      expect(JSON.parse(String(content)), name).toEqual(EXPECTED[name]?.document)
      expect(policy.Properties?.TargetIds, name).toEqual(EXPECTED[name]?.targets)
    }
  })

  it('IAC-02: every SCP and the RCP passes scpProblems with ALLOWED_PRINCIPAL_PATTERNS, within 5,120 characters and Deny-only', () => {
    for (const [name, policy] of policiesIn(foundation)) {
      if (policy.Properties?.Type === 'AISERVICES_OPT_OUT_POLICY') continue
      const kind = policy.Properties?.Type === 'RESOURCE_CONTROL_POLICY' ? 'rcp' : 'scp'
      expect(scpProblems(policy.Properties?.Content, ALLOWED_PRINCIPAL_PATTERNS, kind), name).toEqual([])
    }
  })

  it('IAC-02 C11-D05: who each statement excepts, and no pattern wider than one role family', () => {
    const exceptions: string[] = []
    for (const [name, policy] of policiesIn(foundation)) {
      if (policy.Properties?.Type === 'AISERVICES_OPT_OUT_POLICY') continue
      const parsed = JSON.parse(String(policy.Properties?.Content)) as { Statement: Statement[] }
      for (const statement of parsed.Statement) {
        for (const [operator, keys] of Object.entries(statement.Condition ?? {})) {
          for (const [key, value] of Object.entries(keys)) {
            if (!key.startsWith('aws:Principal')) continue
            // A role pattern by its name alone; any other value (a reason, the organisation) as it is.
            const names = list(value).map(pattern =>
              pattern.includes(':role/') ? pattern.slice(pattern.indexOf(':role/') + ':role/'.length) : pattern,
            )
            exceptions.push(`${name} ${statement.Sid} ${operator} ${key}: ${names.join(', ')}`)
            if (key === 'aws:PrincipalArn') {
              for (const roleName of names) expect(['*', 'cdk-*', 'hearth-*']).not.toContain(roleName)
            }
          }
        }
      }
    }
    const lz = LZ_REASON_SHAPES.join(', ')
    expect(exceptions).toEqual([
      'hearth-baseline ProtectAudit ArnNotLike aws:PrincipalArn: cdk-hearthbase-cfn-exec-role-*-ap-southeast-1, OrganizationAccountAccessRole',
      'hearth-baseline ProtectAlarms ArnNotLike aws:PrincipalArn: cdk-hearthbase-cfn-exec-role-*-ap-southeast-1, OrganizationAccountAccessRole',
      'hearth-baseline ProtectRoles ArnNotLike aws:PrincipalArn: cdk-hearthbase-cfn-exec-role-*-ap-southeast-1, OrganizationAccountAccessRole',
      'hearth-baseline ProtectFlowLogs ArnNotLike aws:PrincipalArn: cdk-hearthbase-cfn-exec-role-*-ap-southeast-1, cdk-hearthapp-cfn-exec-role-*-ap-southeast-1',
      'hearth-baseline ProtectBootstrapRoles ArnNotLike aws:PrincipalArn: OrganizationAccountAccessRole',
      'hearth-baseline-2 SetUpOnly ArnNotLike aws:PrincipalArn: OrganizationAccountAccessRole',
      'hearth-log-protect NoOaar ArnLike aws:PrincipalArn: OrganizationAccountAccessRole',
      'hearth-workload-fences NoOaar ArnLike aws:PrincipalArn: OrganizationAccountAccessRole',
      'hearth-workload-fences ExecOnlyBreakGlass ArnNotLike aws:PrincipalArn: hearth-break-glass',
      'hearth-workload-fences BastionOnlyBreakGlass ArnNotLike aws:PrincipalArn: hearth-break-glass',
      'hearth-workload-fences OneOffsOnlyDeploy ArnNotLike aws:PrincipalArn: hearth-gh-deploy',
      'hearth-workload-fences DbBreakGlassLogins ArnNotLike aws:PrincipalArn: hearth-break-glass',
      'hearth-workload-fences DbMigrateLogin ArnNotLike aws:PrincipalArn: hearth-*-migrate-task',
      'hearth-workload-fences DbAppLogin ArnNotLike aws:PrincipalArn: hearth-*-api-task, hearth-*-realtime-task',
      'hearth-workload-fences DbWorkerLogin ArnNotLike aws:PrincipalArn: hearth-*-worker-task',
      'hearth-workload-fences DbRule9Login ArnNotLike aws:PrincipalArn: hearth-*-rule9-task',
      'hearth-workload-fences-2 NoPipelineSecretReads ArnLike aws:PrincipalArn: hearth-gh-*, cdk-hearth*',
      'hearth-workload-fences-2 BootstrapInputOnlyBreakGlass ArnNotLike aws:PrincipalArn: hearth-break-glass',
      'hearth-workload-fences-2 Rule9SecretByName ArnNotLike aws:PrincipalArn: hearth-*-rule9-task, hearth-*-rule9-exec',
      'hearth-workload-fences-2 Rule9SecretByTag ArnNotLike aws:PrincipalArn: hearth-*-rule9-task, hearth-*-rule9-exec',
      'hearth-workload-fences-2 HearthbaseOnlyBreakGlass ArnNotLike aws:PrincipalArn: hearth-break-glass',
      `hearth-workload-fences-2 HearthbaseOnlyLzReason StringNotLike aws:PrincipalTag/hearth-reason: ${lz}`,
      'hearth-workload-fences-2 HearthappOnlyDeploy ArnNotLike aws:PrincipalArn: hearth-gh-deploy',
      'hearth-workload-fences-2 HearthbaseExecOnlyItsDeploy ArnNotLike aws:PrincipalArn: cdk-hearthbase-deploy-role-*-ap-southeast-1',
      'hearth-workload-fences-2 HearthappExecOnlyItsDeploy ArnNotLike aws:PrincipalArn: cdk-hearthapp-deploy-role-*-ap-southeast-1',
      'hearth-workload-fences-2 HearthbaseStacksOnlyItsDeploy ArnNotLike aws:PrincipalArn: cdk-hearthbase-deploy-role-*-ap-southeast-1',
      'hearth-workload-fences-2 AppRolesBounded ArnLike aws:PrincipalArn: cdk-hearthapp-cfn-exec-role-*-ap-southeast-1',
      'hearth-workload-fences-2 BoundaryOnlyHearthbase ArnNotLike aws:PrincipalArn: cdk-hearthbase-cfn-exec-role-*-ap-southeast-1',
      'hearth-workload-fences-2 NoNewIdentityProviders ArnNotLike aws:PrincipalArn: cdk-hearthbase-cfn-exec-role-*-ap-southeast-1, OrganizationAccountAccessRole',
      `hearth-data-perimeter OrgPrincipalsOnly StringNotEqualsIfExists aws:PrincipalOrgID: ${fixture.organization.id}`,
      'hearth-data-perimeter OrgPrincipalsOnly BoolIfExists aws:PrincipalIsAWSService: false',
      `hearth-data-perimeter AssumeRoleOrgOnly StringNotEqualsIfExists aws:PrincipalOrgID: ${fixture.organization.id}`,
      'hearth-data-perimeter AssumeRoleOrgOnly BoolIfExists aws:PrincipalIsAWSService: false',
    ])
  })

  it('IAC-02 C11-D05 C11-D08: the evidence floor binds everyone, keyed on nothing but the hearth-sec tag, and its bucket patterns match LogArchive’s actual buckets and objects', () => {
    const baseline = JSON.parse(String(policiesIn(foundation).get('hearth-baseline')?.Properties?.Content)) as {
      Statement: Statement[]
    }
    const floor = baseline.Statement.filter(statement => statement.Sid?.startsWith('Floor'))
    expect(floor.map(statement => statement.Sid)).toEqual([
      'FloorLogBuckets',
      'FloorLogKeys',
      'FloorLogKeyTag',
      'FloorLogKeyLockout',
      'FloorLogKeyAliases',
    ])
    for (const statement of floor) {
      const keys = Object.values(statement.Condition ?? {}).flatMap(Object.keys)
      expect(
        keys.filter(
          key => !['aws:ResourceTag/hearth-sec', 'aws:TagKeys', 'kms:BypassPolicyLockoutSafetyCheck'].includes(key),
        ),
        statement.Sid,
      ).toEqual([])
    }
    expect(floor[0]?.Condition).toBeUndefined()

    const buckets = resourcesIn(lz.templates.logArchive)
      .filter(([, r]) => r.Type === 'AWS::S3::Bucket')
      .map(([, r]) => String(r.Properties?.BucketName))
    expect(buckets).toHaveLength(3)
    // Each kind's bucket pattern matches its bucket, and its objects pattern its objects (IAM's `*`
    // also crosses `/`, so the bucket pattern reaches the objects too); no other kind's pattern does.
    const patterns = list(floor[0]?.Resource)
    for (const bucket of buckets) {
      const bucketArn = arn('s3', '', '', bucket)
      const prefix = bucket.slice(0, bucket.lastIndexOf('-') + 1)
      const own = [arn('s3', '', '', `${prefix}*`), arn('s3', '', '', `${prefix}*/*`)]
      expect(
        patterns.filter(pattern => globsOverlap(pattern, bucketArn)),
        bucket,
      ).toEqual([own[0]])
      expect(
        patterns.filter(pattern => globsOverlap(pattern, `${bucketArn}/AWSLogs/x`)),
        bucket,
      ).toEqual(own)
    }
  })

  it('IAC-02 C11-D05: hearth-log-protect excepts nobody: its one principal condition binds OrganizationAccountAccessRole', () => {
    const logProtect = JSON.parse(String(policiesIn(foundation).get('hearth-log-protect')?.Properties?.Content)) as {
      Statement: Statement[]
    }
    const principalKeys = logProtect.Statement.flatMap(statement =>
      Object.entries(statement.Condition ?? {}).flatMap(([operator, keys]) =>
        Object.keys(keys)
          .filter(key => key.startsWith('aws:Principal'))
          .map(key => `${statement.Sid} ${operator} ${key}`),
      ),
    )
    expect(principalKeys).toEqual(['NoOaar ArnLike aws:PrincipalArn'])
  })

  it('IAC-02 C11-D05: hearth-region leaves only the global services, names no Region by wildcard, and lets GuardDuty alone into us-east-1', () => {
    const region = JSON.parse(String(policiesIn(foundation).get('hearth-region')?.Properties?.Content)) as {
      Statement: Statement[]
    }
    const regions = region.Statement.flatMap(statement =>
      list(statement.Condition?.StringNotEquals?.['aws:RequestedRegion']),
    )
    expect(regions.filter(value => value.includes('*') || value.includes('?'))).toEqual([])
    const [onlySingapore, usEast1] = region.Statement
    expect(onlySingapore?.NotAction).toEqual(REGION_NOT_ACTIONS)
    expect(usEast1?.Action).toBe('guardduty:*')
  })

  it('IAC-02 C11-D05: Root holds four of Hearth’s SCPs, which with AWS’s FullAWSAccess are the five Organizations allows; every other target holds at most five of a type', () => {
    const attached = new Map<string, string[]>()
    for (const [name, policy] of policiesIn(foundation)) {
      for (const target of (policy.Properties?.TargetIds ?? []) as string[]) {
        const key = `${target} ${String(policy.Properties?.Type)}`
        attached.set(key, [...(attached.get(key) ?? []), name])
      }
    }
    const rootScps = attached.get(`${rootId} SERVICE_CONTROL_POLICY`) ?? []
    expect(
      rootScps.length,
      'Root is full: a later Root SCP merges into one of these, since FullAWSAccess takes the fifth slot',
    ).toBe(4)
    expect(rootScps).toEqual(['hearth-baseline', 'hearth-baseline-2', 'hearth-no-models', 'hearth-region'])
    expect(attached.get(`${security} SERVICE_CONTROL_POLICY`)).toEqual(['hearth-log-protect'])
    expect(attached.get(`${workloads} SERVICE_CONTROL_POLICY`)).toEqual([
      'hearth-workload-fences',
      'hearth-workload-fences-2',
    ])
    expect([...attached.keys()].filter(key => key.startsWith(recovery))).toEqual([])
    expect(attached.get(`${rootId} AISERVICES_OPT_OUT_POLICY`)).toEqual(['hearth-ai-opt-out'])
    // Each type's AWS-managed default takes a slot on every target (none for the opt-out).
    for (const [key, names] of attached) expect(names.length + 1, key).toBeLessThanOrEqual(5)
  })
})

// A request as the SCPs binding a workload account see it: its action, its resource, and the
// principal's ARN, with the Region fixed at Hearth's and any other context key the case names.
interface Request {
  action: string
  resource: string
  principal: string
  context?: Record<string, string>
}

// Whether one condition holds, by IAM's rules for the operators these SCPs use: a key missing from
// the request satisfies a negated operator or an IfExists one, and no other; a Like operator matches
// a glob, and ForAnyValue any one value.
function conditionHolds(operator: string, key: string, expected: string | string[], request: Request): boolean {
  const context: Record<string, string | undefined> = {
    'aws:PrincipalArn': request.principal,
    'aws:RequestedRegion': 'ap-southeast-1',
    ...request.context,
  }
  const actual = context[key]
  const values = list(expected)
  if (operator === 'Null') return (actual === undefined) === (values[0] === 'true')
  const base = operator.replace(/^ForAnyValue:/, '').replace(/IfExists$/, '')
  const negated = base.includes('Not')
  if (actual === undefined) return negated || operator.endsWith('IfExists')
  const hit = values.some(value => (/Like$/.test(base) ? globsOverlap(value, actual) : value === actual))
  return negated ? !hit : hit
}

// The statements that deny a request: those whose action, resource and every condition match. Actions
// match whatever their case; ARNs as written.
function denyingStatements(statements: readonly Statement[], request: Request): string[] {
  const actionMatches = (pattern: string) => globsOverlap(pattern.toLowerCase(), request.action.toLowerCase())
  const resourceMatches = (pattern: string) => globsOverlap(pattern, request.resource)
  return statements
    .filter(statement => statement.Effect === 'Deny')
    .filter(statement =>
      statement.NotAction === undefined
        ? list(statement.Action).some(actionMatches)
        : !list(statement.NotAction).some(actionMatches),
    )
    .filter(statement =>
      statement.NotResource === undefined
        ? list(statement.Resource).some(resourceMatches)
        : !list(statement.NotResource).some(resourceMatches),
    )
    .filter(statement =>
      Object.entries(statement.Condition ?? {}).every(([operator, keys]) =>
        Object.entries(keys).every(([key, value]) => conditionHolds(operator, key, value, request)),
      ),
    )
    .map(statement => statement.Sid ?? '(no Sid)')
}

describe('IAC-02 C11-D05 C11-D07 C11-D16 C11-D26: requests replayed against the SCPs binding a workload account', () => {
  const prod = fixture.accounts.prod
  const prodRole = (name: string) => arn('iam', '', prod, `role/${name}`)
  const task = prodRole('hearth-prod-api-task')
  const exec = prodRole(`cdk-hearthbase-cfn-exec-role-${prod}-ap-southeast-1`)
  const appExec = prodRole(`cdk-hearthapp-cfn-exec-role-${prod}-ap-southeast-1`)
  const baseDeploy = prodRole(`cdk-hearthbase-deploy-role-${prod}-ap-southeast-1`)
  const appDeploy = prodRole(`cdk-hearthapp-deploy-role-${prod}-ap-southeast-1`)
  const stack = (name: string) => arn('cloudformation', 'ap-southeast-1', prod, `stack/${name}/0a1b2c3d`)
  const topic = arn('sns', 'ap-southeast-1', prod, 'hearth-ops-alerts')
  // The statements of every SCP at Root and on the Workloads OU, which together bind a workload account.
  let binding: Statement[]
  beforeAll(() => {
    binding = [...policiesIn(foundation).values()]
      .filter(policy => policy.Properties?.Type === 'SERVICE_CONTROL_POLICY')
      .filter(policy => {
        const targets = (policy.Properties?.TargetIds ?? []) as string[]
        return targets.includes(rootId) || targets.includes(workloads)
      })
      .flatMap(policy => (JSON.parse(String(policy.Properties?.Content)) as { Statement: Statement[] }).Statement)
  })
  const denied = (request: Request) => denyingStatements(binding, request)

  it('IAC-02 C11-D26: an execution role is passed to CloudFormation only by its own deploy role, and the Baselines and hearthbase’s toolkit stack change only through hearthbase’s deploy role, which a stack’s stored role would otherwise sidestep', () => {
    expect(denied({ action: 'iam:PassRole', resource: exec, principal: task })).toEqual(['HearthbaseExecOnlyItsDeploy'])
    expect(denied({ action: 'iam:PassRole', resource: appExec, principal: task })).toEqual([
      'HearthappExecOnlyItsDeploy',
    ])
    expect(denied({ action: 'iam:PassRole', resource: exec, principal: appDeploy })).toEqual([
      'HearthbaseExecOnlyItsDeploy',
    ])
    expect(denied({ action: 'iam:PassRole', resource: exec, principal: baseDeploy })).toEqual([])
    expect(denied({ action: 'iam:PassRole', resource: appExec, principal: appDeploy })).toEqual([])
    for (const action of [
      'cloudformation:CreateChangeSet',
      'cloudformation:ExecuteChangeSet',
      'cloudformation:UpdateStack',
      'cloudformation:DeleteStack',
      'cloudformation:UpdateTerminationProtection',
      'cloudformation:SetStackPolicy',
    ]) {
      for (const name of ['Hearth-prod-Baseline', 'CDKToolkit-hearthbase']) {
        expect(denied({ action, resource: stack(name), principal: task }), `${action} ${name}`).toEqual([
          'HearthbaseStacksOnlyItsDeploy',
        ])
        expect(denied({ action, resource: stack(name), principal: appDeploy }), `${action} ${name}`).toEqual([
          'HearthbaseStacksOnlyItsDeploy',
        ])
        expect(denied({ action, resource: stack(name), principal: baseDeploy }), `${action} ${name}`).toEqual([])
      }
      // The workload's own stacks are hearthapp's deploy role's to change.
      expect(denied({ action, resource: stack('Hearth-prod-Workload'), principal: appDeploy }), action).toEqual([])
    }
  })

  it('IAC-02 C11-D16: no workload principal mutes hearth-ops-alerts through its subscription’s filter or the topic’s data protection policy, but the hearthbase execution role may', () => {
    const subscription = `${topic}:0a1b2c3d`
    for (const [action, resource] of [
      ['sns:SetSubscriptionAttributes', subscription],
      ['sns:SetSubscriptionAttributes', topic],
      ['sns:PutDataProtectionPolicy', topic],
      ['sns:Unsubscribe', subscription],
    ] as const) {
      expect(denied({ action, resource, principal: task }), action).toEqual(['ProtectAlarms'])
      expect(denied({ action, resource, principal: exec }), action).toEqual([])
    }
    // Publishing to the topic stays open, so the replay isn't denying everything.
    expect(denied({ action: 'sns:Publish', resource: topic, principal: task })).toEqual([])
  })

  it('IAC-02 C11-D07: no workload principal makes a way to hand a role outside, by provider, certificate, activation or role alias, but the hearthbase execution role may', () => {
    const at = (service: string, resource: string) => arn(service, 'ap-southeast-1', prod, resource)
    for (const [action, resource] of [
      ['iam:CreateOpenIDConnectProvider', arn('iam', '', prod, 'oidc-provider/example.invalid')],
      ['cognito-identity:CreateIdentityPool', at('cognito-identity', 'identitypool/x')],
      ['rolesanywhere:CreateTrustAnchor', at('rolesanywhere', 'trust-anchor/x')],
      ['rolesanywhere:CreateProfile', at('rolesanywhere', 'profile/x')],
      ['rolesanywhere:DisableCrl', at('rolesanywhere', 'crl/x')],
      ['ssm:CreateActivation', '*'],
      ['ssm:UpdateManagedInstanceRole', at('ssm', 'managed-instance/mi-0a1b2c3d')],
      ['iot:CreateRoleAlias', at('iot', 'rolealias/x')],
      ['iot:UpdateRoleAlias', at('iot', 'rolealias/x')],
    ] as const) {
      expect(denied({ action, resource, principal: task }), action).toEqual(['NoNewIdentityProviders'])
      expect(denied({ action, resource, principal: exec }), action).toEqual([])
    }
  })
})

describe('IAC-02 C11-D07: the RCP’s stage', () => {
  const rcpTargets = (template: Template) =>
    policiesIn(template).get('hearth-data-perimeter')?.Properties?.TargetIds as string[] | undefined

  it('IAC-02 C11-D07: the RCP binds the non-prod account until a reviewed PR moves it to Root, which the variant shows', () => {
    const atRoot = synthLandingZone({ rcpTarget: 'root' })
    expect(rcpTargets(foundation)).toEqual([fixture.accounts.nonprod])
    expect(rcpTargets(foundation)).not.toEqual([rootId])
    expect(rcpTargets(atRoot.templates.foundation)).toEqual([rootId])
    // Only the target moves.
    const content = (template: Template) => policiesIn(template).get('hearth-data-perimeter')?.Properties?.Content
    expect(content(atRoot.templates.foundation)).toBe(content(foundation))
  }, 60_000)
})
