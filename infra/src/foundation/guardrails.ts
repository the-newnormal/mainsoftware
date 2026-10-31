// The organisation's guardrails (C11-D05 to C11-D08), in Hearth-Foundation: the service control
// policies, the resource control policy and the AI services opt-out, each attached to Root, an OU or
// an account named by configuration. SCPs never bind the management account, so its own principals
// are fenced by their permission sets alone (C11-D10). Every policy is Deny-only, and every exception
// names a role pattern from denies.ts, never a person or an account:
// - Root: hearth-baseline and hearth-baseline-2 (the evidence floor, the protected names and the
//   account-wide denies, split in two to stay within 5,120 characters each), hearth-no-models
//   (C11-D06) and hearth-region (C11-D05), with AWS's FullAWSAccess, so Root holds the five SCPs
//   Organizations allows and a later step merges into one of these rather than adding a sixth
//   (TECH-SPEC T24 item 2); and the AI services opt-out (C11-D06);
// - the Security OU, where log-archive sits once set up: hearth-log-protect, with no exception for
//   anyone, so from then nobody changes the log buckets' configuration or the tagged keys' policies
//   and grants, and LogArchive changes only as tier 2 (C11-D05, C11-D27);
// - the Workloads OU: hearth-workload-fences and hearth-workload-fences-2 (C11-D05, C11-D12,
//   C11-D26, C11-D78);
// - the Recovery OU: nothing of Hearth's;
// - the RCP, hearth-data-perimeter (C11-D07): the non-prod account first, then Root by a reviewed
//   PR after a week of clean non-prod deploys (options.ts). It keeps its target's buckets, keys,
//   secrets and roles to the organisation's principals and its buckets to TLS, and lets a web
//   identity in only as GitHub with one of the deploy workflow's three subjects, which departs from
//   C11-D07's "federation is untouched" (TECH-SPEC T24 item 2).
//
// Each policy's Content is its document as minified JSON text, so what IAC-02 measures is exactly
// what Organizations receives: the props take the object (their validator refuses a string), and an
// override then replaces it with the text. No document holds a token. Each policy is retained, and
// the SCP, RCP and opt-out policy types are enabled on Root by hand first (the set-up runbook). This
// file decides what nobody in the organisation may do, so it is on the owner's-read list (C11-D74).
import * as cdk from 'aws-cdk-lib'
import * as organizations from 'aws-cdk-lib/aws-organizations'
import { Construct } from 'constructs'
import { LZ_REASON_SHAPES } from '../baseline/break-glass.ts'
import { arnPattern } from '../config/arns.ts'
import { githubSubject, type LandingZoneConfig } from '../config/env.ts'
import {
  BOUNDARY,
  DB_LOGIN,
  GITHUB_OIDC_HOST,
  KEY_ALIAS,
  OPS_TOPIC,
  QUALIFIER,
  ROLE,
  SEC_RULE_PREFIX,
  SEC_TAG,
  SECURITY_LOG_GROUP_PREFIX,
  SSO_ROLE_PATH,
} from '../config/names.ts'
import { REGION } from '../config/profiles.ts'
import {
  APP_EXEC,
  BREAK_GLASS,
  CDK_HEARTH,
  document,
  EXEC,
  GH_DEPLOY,
  GH_ROLES,
  IAM_WRITE_ACTIONS,
  type IamDocument,
  type IamStatement,
  LOG_BUCKET_PATTERNS,
  modelDeny,
  NO_LONG_LIVED_CREDENTIALS,
  NO_NEW_IDENTITY_PROVIDERS,
  OAAR,
  ROUTE_OUT_ACTIONS,
  RULE9_EXEC,
  RULE9_ROLE_WRITES,
  smsDenies,
  TASK_ROLE,
} from './denies.ts'
import type { ResolvedLandingZoneOptions } from './options.ts'

// The policies' names, which the tests and the set-up runbook's read-backs name.
export const SCP_NAMES = {
  baseline: 'hearth-baseline',
  baseline2: 'hearth-baseline-2',
  noModels: 'hearth-no-models',
  region: 'hearth-region',
  logProtect: 'hearth-log-protect',
  workloadFences: 'hearth-workload-fences',
  workloadFences2: 'hearth-workload-fences-2',
} as const
export const RCP_NAME = 'hearth-data-perimeter'
export const OPT_OUT_NAME = 'hearth-ai-opt-out'

// Organizations' limits on one policy's content, in characters.
export const POLICY_LIMIT = { serviceControl: 5_120, resourceControl: 5_120, aiOptOut: 2_500 } as const

// The global services hearth-region leaves to any Region (C11-D05): IAM, Organizations, STS, Route 53,
// CloudFront, Support, billing and cost, Health, the account's own settings and Identity Center, plus
// the calls the CLI and the console route to us-east-1 (listing buckets, the account's public access
// block, describing Regions), and GuardDuty, which the next statement fences to its two Regions.
export const REGION_NOT_ACTIONS: readonly string[] = [
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

// The Regions GuardDuty runs in: Hearth's, and us-east-1, where the global services' events arrive
// (C11-D20). C0.12 widens us-east-1's carve-outs by a reviewed change, never with a wildcard Region.
const GUARDDUTY_REGIONS: readonly string[] = [REGION, 'us-east-1']

// One policy as Organizations holds it: its construct id, name, type, a description citing its
// decision, its document and its targets.
export interface GuardrailPolicy {
  id: string
  name: string
  type: 'SERVICE_CONTROL_POLICY' | 'RESOURCE_CONTROL_POLICY' | 'AISERVICES_OPT_OUT_POLICY'
  description: string
  document: IamDocument | Record<string, unknown>
  targets: readonly string[]
}

// A condition excepting principals by ARN pattern: one as a string, several as a list.
const exceptFor = (...patterns: string[]) => ({
  ArnNotLike: { 'aws:PrincipalArn': patterns.length === 1 ? (patterns[0] ?? '') : patterns },
})
// A condition binding only the principals that match.
const onlyFor = (...patterns: string[]) => ({
  ArnLike: { 'aws:PrincipalArn': patterns.length === 1 ? (patterns[0] ?? '') : patterns },
})
// A key carrying the hearth-sec tag (C11-D05: the floor protects keys by it).
const TAGGED = { Null: { [`aws:ResourceTag/${SEC_TAG}`]: 'false' } }

// IAM resources in any account, by path.
const anyIam = (resource: string) => arnPattern({ service: 'iam', account: '*', resource })
// Any Region's and any account's resources of a service, by path.
const anywhere = (service: string, resource: string) => arnPattern({ service, region: '*', account: '*', resource })
// A task definition family's revisions in any account.
const taskDefinitions = (family: string) => anywhere('ecs', `task-definition/${family}:*`)
// A database login in any account's database.
const dbUser = (login: string) => anywhere('rds-db', `dbuser:*/${login}`)
// A secret by name pattern in any account.
const secret = (name: string) => anywhere('secretsmanager', `secret:${name}`)

// The bootstrap roles of hearthbase and hearthapp in any account.
const HEARTHBASE_ROLES = anyIam(`role/cdk-${QUALIFIER.base}-*`)
const HEARTHAPP_ROLES = anyIam(`role/cdk-${QUALIFIER.app}-*`)

// hearth-baseline (Root): the evidence floor, which binds everyone and is keyed on nothing but a
// key's tag, and the protected names, which only the hearthbase execution role and, while an account
// sits in Root for its set-up, OrganizationAccountAccessRole may change (C11-D05, C11-D08, C11-D26).
function baselineStatements(): IamStatement[] {
  return [
    // Wildcards, so LCG-02 reads no S3 call (C11-D08); also makes GOVERNANCE unbypassable (C11-D18).
    {
      Sid: 'FloorLogBuckets',
      Effect: 'Deny',
      Action: ['s3:Delete*', 's3:BypassGovernance*'],
      Resource: LOG_BUCKET_PATTERNS(),
    },
    {
      Sid: 'FloorLogKeys',
      Effect: 'Deny',
      Action: ['kms:ScheduleKeyDeletion', 'kms:DisableKey'],
      Resource: '*',
      Condition: TAGGED,
    },
    // The tag the floor relies on can't be taken off (never a deny of tagging: CreateKey needs it).
    {
      Sid: 'FloorLogKeyTag',
      Effect: 'Deny',
      Action: 'kms:UntagResource',
      Resource: '*',
      Condition: { 'ForAnyValue:StringEquals': { 'aws:TagKeys': [SEC_TAG] } },
    },
    // Nor can a tagged key's policy be rewritten past KMS's lockout check.
    {
      Sid: 'FloorLogKeyLockout',
      Effect: 'Deny',
      Action: 'kms:PutKeyPolicy',
      Resource: '*',
      Condition: { ...TAGGED, Bool: { 'kms:BypassPolicyLockoutSafetyCheck': 'true' } },
    },
    // Nor can the log keys' aliases be moved: the trail names hearth-sec by its alias. Only these two,
    // so C0.12's aliases stay free.
    {
      Sid: 'FloorLogKeyAliases',
      Effect: 'Deny',
      Action: ['kms:UpdateAlias', 'kms:DeleteAlias'],
      Resource: [anywhere('kms', KEY_ALIAS.sec), anywhere('kms', KEY_ALIAS.archive)],
    },
    { Sid: 'StayInOrganization', Effect: 'Deny', Action: 'organizations:LeaveOrganization', Resource: '*' },
    // The audit services, and the suppression rules, trusted lists and archive rules that would
    // silence their findings.
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
      Condition: exceptFor(EXEC, OAAR),
    },
    // The fast alarms, their topic and the security log groups (C11-D16).
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
        'logs:Delete*',
        'logs:Put*',
        'logs:Disassociate*',
      ],
      Resource: [
        anywhere('events', `rule/${SEC_RULE_PREFIX}*`),
        anywhere('sns', OPS_TOPIC),
        anywhere('sns', `${OPS_TOPIC}:*`),
        anywhere('logs', `log-group:${SECURITY_LOG_GROUP_PREFIX}*`),
      ],
      Condition: exceptFor(EXEC, OAAR),
    },
    // The roles and names the landing zone makes: break-glass, GitHub's roles and provider, Identity
    // Center's roles and the boundary (C11-D11, C11-D26, C11-D55).
    {
      Sid: 'ProtectRoles',
      Effect: 'Deny',
      Action: IAM_WRITE_ACTIONS,
      Resource: [
        anyIam(`role/${ROLE.breakGlass}*`),
        anyIam('role/hearth-gh-*'),
        anyIam(`role/${SSO_ROLE_PATH}*`),
        anyIam(`oidc-provider/${GITHUB_OIDC_HOST}`),
        anyIam(`policy/${BOUNDARY}`),
      ],
      Condition: exceptFor(EXEC, OAAR),
    },
    // A Platform update may replace a flow log through either execution role; A6 alarms either way.
    {
      Sid: 'ProtectFlowLogs',
      Effect: 'Deny',
      Action: 'ec2:DeleteFlowLogs',
      Resource: '*',
      Condition: exceptFor(EXEC, APP_EXEC),
    },
    // Only `cdk bootstrap`, run as OrganizationAccountAccessRole, makes or changes the bootstrap roles.
    {
      Sid: 'ProtectBootstrapRoles',
      Effect: 'Deny',
      Action: IAM_WRITE_ACTIONS,
      Resource: anyIam('role/cdk-*'),
      Condition: exceptFor(OAAR),
    },
  ]
}

// hearth-baseline-2 (Root): long-lived credentials, the accounts' own settings, sharing outside the
// organisation, the set-up-only switches, snapshot sharing (C0.17 carves restore's out, C11-Q02), and
// AWS's own SMS (D46).
function baseline2Statements(): IamStatement[] {
  return [
    { Sid: 'NoLongLivedCredentials', Effect: 'Deny', Action: NO_LONG_LIVED_CREDENTIALS, Resource: '*' },
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
    // Set at an account's set-up through OrganizationAccountAccessRole, which is fenced once the
    // account sits in its OU.
    {
      Sid: 'SetUpOnly',
      Effect: 'Deny',
      Action: ['s3:PutAccountPublicAccessBlock', 'ec2:DisableEbsEncryptionByDefault'],
      Resource: '*',
      Condition: exceptFor(OAAR),
    },
    {
      Sid: 'NoSnapshotSharing',
      Effect: 'Deny',
      Action: ['rds:ModifyDBSnapshotAttribute', 'rds:ModifyDBClusterSnapshotAttribute', 'ec2:ModifySnapshotAttribute'],
      Resource: '*',
    },
    ...smsDenies(),
  ]
}

// hearth-region (Root): every call outside ap-southeast-1 but the global services', and GuardDuty in
// its two Regions alone (C11-D05, C11-D20).
function regionStatements(): IamStatement[] {
  return [
    {
      Sid: 'OnlySingapore',
      Effect: 'Deny',
      NotAction: REGION_NOT_ACTIONS,
      Resource: '*',
      Condition: { StringNotEquals: { 'aws:RequestedRegion': REGION } },
    },
    {
      Sid: 'GuardDutyAlsoUsEast1',
      Effect: 'Deny',
      Action: 'guardduty:*',
      Resource: '*',
      Condition: { StringNotEquals: { 'aws:RequestedRegion': GUARDDUTY_REGIONS } },
    },
  ]
}

// The organisation's access role, denied everything wherever this binds: an account is set up through
// it while it sits in Root, and never again once it is in its OU (C11-D02).
const NO_OAAR: IamStatement = { Sid: 'NoOaar', Effect: 'Deny', Action: '*', Resource: '*', Condition: onlyFor(OAAR) }

// hearth-log-protect (Security OU): no change to the log buckets' configuration or the tagged keys'
// policies and grants, no landing-zone deploy, and no organisation access role, for anyone (C11-D05).
function logProtectStatements(): IamStatement[] {
  return [
    {
      Sid: 'NoLogBucketAdministration',
      Effect: 'Deny',
      Action: ['s3:PutBucket*', 's3:PutLifecycle*', 's3:PutObjectRe*', 's3:PutObjectLe*', 's3:PutEncryption*'],
      Resource: LOG_BUCKET_PATTERNS(),
    },
    {
      Sid: 'NoLogKeyAdministration',
      Effect: 'Deny',
      Action: ['kms:PutKeyPolicy', 'kms:CreateGrant'],
      Resource: '*',
      Condition: TAGGED,
    },
    { Sid: 'NoLandingZoneDeploys', Effect: 'Deny', Action: 'sts:AssumeRole', Resource: HEARTHBASE_ROLES },
    NO_OAAR,
  ]
}

// hearth-workload-fences (Workloads OU): sessions into tasks and the bastion by break-glass alone,
// the one-off tasks by the deploy role alone, and each database login by its own role alone
// (C11-D05, C11-D12, C11-D78).
function workloadFenceStatements(): IamStatement[] {
  const logins = [
    DB_LOGIN.bootstrap,
    DB_LOGIN.breakglassRead,
    DB_LOGIN.migrate,
    DB_LOGIN.app,
    DB_LOGIN.worker,
    DB_LOGIN.rule9,
  ].map(dbUser)
  return [
    NO_OAAR,
    {
      Sid: 'ExecOnlyBreakGlass',
      Effect: 'Deny',
      Action: ['ecs:ExecuteCommand', 'ssm:StartSession'],
      Resource: '*',
      Condition: exceptFor(BREAK_GLASS),
    },
    {
      Sid: 'BastionOnlyBreakGlass',
      Effect: 'Deny',
      Action: 'ecs:RunTask',
      Resource: taskDefinitions('hearth-*-bastion'),
      Condition: exceptFor(BREAK_GLASS),
    },
    {
      Sid: 'OneOffsOnlyDeploy',
      Effect: 'Deny',
      Action: 'ecs:RunTask',
      Resource: [taskDefinitions('hearth-*-migrate'), taskDefinitions('hearth-*-probe')],
      Condition: exceptFor(GH_DEPLOY),
    },
    {
      Sid: 'DbBreakGlassLogins',
      Effect: 'Deny',
      Action: 'rds-db:connect',
      Resource: [dbUser(DB_LOGIN.bootstrap), dbUser(DB_LOGIN.breakglassRead)],
      Condition: exceptFor(BREAK_GLASS),
    },
    {
      Sid: 'DbMigrateLogin',
      Effect: 'Deny',
      Action: 'rds-db:connect',
      Resource: dbUser(DB_LOGIN.migrate),
      Condition: exceptFor(TASK_ROLE('migrate')),
    },
    {
      Sid: 'DbAppLogin',
      Effect: 'Deny',
      Action: 'rds-db:connect',
      Resource: dbUser(DB_LOGIN.app),
      Condition: exceptFor(TASK_ROLE('api'), TASK_ROLE('realtime')),
    },
    {
      Sid: 'DbWorkerLogin',
      Effect: 'Deny',
      Action: 'rds-db:connect',
      Resource: dbUser(DB_LOGIN.worker),
      Condition: exceptFor(TASK_ROLE('worker')),
    },
    {
      Sid: 'DbRule9Login',
      Effect: 'Deny',
      Action: 'rds-db:connect',
      Resource: dbUser(DB_LOGIN.rule9),
      Condition: exceptFor(TASK_ROLE('rule9')),
    },
    { Sid: 'DbNoOtherLogin', Effect: 'Deny', Action: 'rds-db:connect', NotResource: logins },
  ]
}

// hearth-workload-fences-2 (Workloads OU): secrets the pipeline never reads, the bootstrap input and
// Rule 9's secrets to their own roles, hearthbase to break-glass under a landing-zone reason, hearthapp
// to the deploy role, Rule 9's roles unchangeable, every role hearthapp makes bounded, no route out,
// and no new identity provider but GitHub's, made by hearthbase (C11-D05, C11-D07, C11-D12, C11-D26,
// C11-D29). A workload role is created with its boundary, never given one later, since only the
// hearthbase execution role may put a boundary on a role.
function workloadFence2Statements(): IamStatement[] {
  const rule9Roles = [TASK_ROLE('rule9'), RULE9_EXEC]
  return [
    {
      Sid: 'NoPipelineSecretReads',
      Effect: 'Deny',
      Action: 'secretsmanager:GetSecretValue',
      Resource: '*',
      Condition: onlyFor(GH_ROLES, CDK_HEARTH),
    },
    {
      Sid: 'BootstrapInputOnlyBreakGlass',
      Effect: 'Deny',
      Action: 'secretsmanager:GetSecretValue',
      Resource: secret('hearth/*/bootstrap-input*'),
      Condition: exceptFor(BREAK_GLASS),
    },
    {
      Sid: 'Rule9SecretByName',
      Effect: 'Deny',
      Action: 'secretsmanager:GetSecretValue',
      Resource: secret('hearth/*/rule9*'),
      Condition: exceptFor(...rule9Roles),
    },
    {
      Sid: 'Rule9SecretByTag',
      Effect: 'Deny',
      Action: 'secretsmanager:GetSecretValue',
      Resource: '*',
      Condition: {
        StringEquals: { 'secretsmanager:ResourceTag/hearth:access': 'rule9' },
        ...exceptFor(...rule9Roles),
      },
    },
    {
      Sid: 'HearthbaseOnlyBreakGlass',
      Effect: 'Deny',
      Action: 'sts:AssumeRole',
      Resource: HEARTHBASE_ROLES,
      Condition: exceptFor(BREAK_GLASS),
    },
    {
      Sid: 'HearthbaseOnlyLzReason',
      Effect: 'Deny',
      Action: 'sts:AssumeRole',
      Resource: HEARTHBASE_ROLES,
      Condition: { StringNotLike: { 'aws:PrincipalTag/hearth-reason': LZ_REASON_SHAPES } },
    },
    {
      Sid: 'HearthappOnlyDeploy',
      Effect: 'Deny',
      Action: 'sts:AssumeRole',
      Resource: HEARTHAPP_ROLES,
      Condition: exceptFor(GH_DEPLOY),
    },
    { Sid: 'Rule9RolesFenced', Effect: 'Deny', Action: RULE9_ROLE_WRITES, Resource: anyIam('role/hearth-*-rule9-*') },
    {
      Sid: 'AppRolesBounded',
      Effect: 'Deny',
      Action: 'iam:CreateRole',
      Resource: '*',
      Condition: {
        ...onlyFor(APP_EXEC),
        StringNotLike: { 'iam:PermissionsBoundary': anyIam(`policy/${BOUNDARY}`) },
      },
    },
    {
      Sid: 'BoundaryOnlyHearthbase',
      Effect: 'Deny',
      Action: ['iam:DeleteRolePermissionsBoundary', 'iam:PutRolePermissionsBoundary'],
      Resource: '*',
      Condition: exceptFor(EXEC),
    },
    { Sid: 'NoRouteOut', Effect: 'Deny', Action: ROUTE_OUT_ACTIONS, Resource: '*' },
    // The Baseline, deployed by the hearthbase execution role, makes GitHub's provider.
    {
      Sid: 'NoNewIdentityProviders',
      Effect: 'Deny',
      Action: NO_NEW_IDENTITY_PROVIDERS,
      Resource: '*',
      Condition: exceptFor(EXEC, OAAR),
    },
  ]
}

// hearth-data-perimeter (the RCP, C11-D07): every statement names Principal `*`, as RCPs require. Only
// the organisation's principals (or an AWS service acting for one) reach Hearth's buckets, keys and
// secrets or assume its roles, S3 only over TLS, and a web identity only as GitHub's token for one of
// the three subjects the deploy roles trust: a token from any other provider lacks the key, so
// StringNotEquals holds and it is denied too. Whether an RCP reaches web-identity federation and this
// provider-named key is proved on non-prod first (TECH-SPEC T24 items 2 and 32).
function dataPerimeterStatements(config: LandingZoneConfig): IamStatement[] {
  const orgOnly = {
    StringNotEqualsIfExists: { 'aws:PrincipalOrgID': config.organization.id },
    BoolIfExists: { 'aws:PrincipalIsAWSService': 'false' },
  }
  return [
    {
      Sid: 'OrgPrincipalsOnly',
      Effect: 'Deny',
      Principal: '*',
      Action: ['s3:*', 'kms:*', 'secretsmanager:*'],
      Resource: '*',
      Condition: orgOnly,
    },
    {
      Sid: 'TlsOnly',
      Effect: 'Deny',
      Principal: '*',
      Action: 's3:*',
      Resource: '*',
      Condition: { BoolIfExists: { 'aws:SecureTransport': 'false' } },
    },
    // sts:AssumeRole alone: never the tagging or source-identity calls a session also makes, nor the
    // federation calls, which the next statement and Identity Center's own trust decide.
    {
      Sid: 'AssumeRoleOrgOnly',
      Effect: 'Deny',
      Principal: '*',
      Action: 'sts:AssumeRole',
      Resource: '*',
      Condition: orgOnly,
    },
    {
      Sid: 'WebIdentityOnlyDeploySubjects',
      Effect: 'Deny',
      Principal: '*',
      Action: 'sts:AssumeRoleWithWebIdentity',
      Resource: '*',
      Condition: {
        StringNotEquals: {
          [`${GITHUB_OIDC_HOST}:sub`]: [
            githubSubject(config.github, 'nonprod'),
            githubSubject(config.github, 'prod-plan'),
            githubSubject(config.github, 'prod'),
          ],
        },
      },
    },
  ]
}

// The AI services opt-out (C11-D06): no AWS AI service keeps or learns from the organisation's
// content, and no account below may change that.
const NONE_BELOW = { '@@operators_allowed_for_child_policies': ['@@none'] }
const AI_OPT_OUT = {
  services: {
    ...NONE_BELOW,
    default: { ...NONE_BELOW, opt_out_policy: { ...NONE_BELOW, '@@assign': 'optOut' } },
  },
}

// Every policy the Foundation stack attaches, with its targets: Root, the Security and Workloads OUs,
// and the RCP's stage (the non-prod account, or Root).
export function guardrailPolicies(config: LandingZoneConfig, options: ResolvedLandingZoneOptions): GuardrailPolicy[] {
  const root = config.organization.rootId
  const { security, workloads } = config.organization.ous
  const scp = 'SERVICE_CONTROL_POLICY'
  return [
    {
      id: 'Baseline',
      name: SCP_NAMES.baseline,
      type: scp,
      description: 'The evidence floor and the protected names (C11-D05, C11-D08, C11-D26)',
      document: document(baselineStatements()),
      targets: [root],
    },
    {
      id: 'Baseline2',
      name: SCP_NAMES.baseline2,
      type: scp,
      description: 'Credentials, account settings, sharing, set-up switches, snapshots and SMS (C11-D05)',
      document: document(baseline2Statements()),
      targets: [root],
    },
    {
      id: 'NoModels',
      name: SCP_NAMES.noModels,
      type: scp,
      description: 'No model permissions anywhere (C11-D06)',
      document: document([modelDeny('NoModels')]),
      targets: [root],
    },
    {
      id: 'Region',
      name: SCP_NAMES.region,
      type: scp,
      description: 'ap-southeast-1 only, but the global services (C11-D05)',
      document: document(regionStatements()),
      targets: [root],
    },
    {
      id: 'LogProtect',
      name: SCP_NAMES.logProtect,
      type: scp,
      description: "The log-archive account's buckets and keys, with no exception (C11-D05)",
      document: document(logProtectStatements()),
      targets: [security],
    },
    {
      id: 'WorkloadFences',
      name: SCP_NAMES.workloadFences,
      type: scp,
      description: 'Sessions, the bastion, one-off tasks and database logins (C11-D05, C11-D12, C11-D78)',
      document: document(workloadFenceStatements()),
      targets: [workloads],
    },
    {
      id: 'WorkloadFences2',
      name: SCP_NAMES.workloadFences2,
      type: scp,
      description: 'Secrets, the bootstrap roles, Rule 9 roles, boundaries, routes out, identity providers (C11-D05)',
      document: document(workloadFence2Statements()),
      targets: [workloads],
    },
    {
      id: 'DataPerimeter',
      name: RCP_NAME,
      type: 'RESOURCE_CONTROL_POLICY',
      description: "The organisation's principals only, over TLS, and GitHub's deploy subjects only (C11-D07)",
      document: document(dataPerimeterStatements(config)),
      targets: [options.rcpTarget === 'root' ? root : config.accounts.nonprod],
    },
    {
      id: 'AiOptOut',
      name: OPT_OUT_NAME,
      type: 'AISERVICES_OPT_OUT_POLICY',
      description: 'Every AI service opted out, for every account (C11-D06)',
      document: AI_OPT_OUT,
      targets: [root],
    },
  ]
}

// The longest content each type may hold.
const limitOf = (type: GuardrailPolicy['type']) =>
  type === 'AISERVICES_OPT_OUT_POLICY'
    ? POLICY_LIMIT.aiOptOut
    : type === 'RESOURCE_CONTROL_POLICY'
      ? POLICY_LIMIT.resourceControl
      : POLICY_LIMIT.serviceControl

export interface GuardrailsProps {
  config: LandingZoneConfig
  options: ResolvedLandingZoneOptions
}

export class Guardrails extends Construct {
  readonly policies: readonly organizations.CfnPolicy[]

  constructor(scope: Construct, id: string, props: GuardrailsProps) {
    super(scope, id)
    this.policies = guardrailPolicies(props.config, props.options).map(policy => {
      const content = JSON.stringify(policy.document)
      // Organizations refuses a longer one at deploy; fail at synth instead (IAC-02 measures it too).
      if (content.length > limitOf(policy.type)) {
        throw new Error(`${policy.name} holds ${content.length} characters, over ${limitOf(policy.type)}`)
      }
      if (cdk.Token.isUnresolved(content)) throw new Error(`${policy.name} holds a token`)
      const made = new organizations.CfnPolicy(this, policy.id, {
        name: policy.name,
        type: policy.type,
        description: policy.description,
        content: policy.document,
        targetIds: [...policy.targets],
      })
      made.addPropertyOverride('Content', content)
      made.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
      return made
    })
  }
}
