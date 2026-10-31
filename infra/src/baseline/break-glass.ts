// hearth-break-glass (C11-D11 to C11-D15, C11-D78): the one role a person takes in a member account,
// from the HearthBreakGlassEntry permission set, for an hour, under a reason. The trust admits only
// that set's role in the same account, only with the person's own sign-in name as the session's
// source identity and exactly one session tag, hearth-reason, whose value has one of the fixed-length
// shapes below; the helper (infra/bin/break-glass.sh) checks each reason's exact form before it
// assumes the role, and its open and close entries go to the log-archive account's break-glass-log
// bucket. A1 alarms on every assumption, fast in the account and assured from the organisation trail.
//
// The role is L1 with literal documents, so the template holds exactly what IAC-11 pins and nothing
// merges its statements. Its scope differs by account:
// - a workload account's role reads logs, describes the stacks and services, operates the services,
//   runs the bastion and its port forward, connects to the bootstrap login under a bootstrap: or
//   recover: reason and to the read-only login under a case: reason, reads the Owner bootstrap
//   script's input under a bootstrap: reason, and assumes the hearthbase deploy and publishing roles
//   under an lz:pr- reason (C11-D12, C11-D78);
// - log-archive's role writes its own entries and triages: GuardDuty and Access Analyzer reads,
//   CloudTrail's event history and the trail's status, and the configuration of the trail and
//   break-glass-log buckets and of the keys, never the trail's objects (the reviewer is their only
//   reader) and never the archive bucket (C11-D21). It administers nothing, through hearthbase or
//   otherwise.
// Both deny IAM writes, key administration, any change to logs and their buckets, the organisation's
// and the audit services' writes, secret writes, direct stack changes, the Rule 9 secrets and every
// model action, unconditionally. The whole inline policy stays within IAM's 10,240 characters, which
// IAC-10 measures; when C0.12 adds the master secret's statement and it would pass, the denies move
// into a customer-managed policy, hearth-break-glass-denies, attached to this role (TECH-SPEC T24
// item 4). This file holds who may break glass and what they may do, so it is on the owner's-read
// list (C11-D74).
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import { accountRoot, arnPattern, roleArn } from '../config/arns.ts'
import { grantsModelAction } from '../config/models.ts'
import {
  BREAK_GLASS_KEY_PREFIX,
  bootstrapInputSecret,
  clusterName,
  DB_LOGIN,
  execRoleName,
  iamVariable,
  logBucketName,
  logGroupName,
  PERMISSION_SET,
  QUALIFIER,
  ROLE,
  SSO_ROLE_PATH,
  stagesIn,
  TAG_KEY,
  taskFamily,
  taskRoleName,
} from '../config/names.ts'
import { REGION } from '../config/profiles.ts'
import {
  CFN_WRITE_ACTIONS,
  document,
  type IamStatement,
  KMS_ADMIN_ACTIONS,
  modelDeny,
  rule9SecretDenies,
} from '../foundation/denies.ts'

// The reasons a session may carry, as IAM StringLike patterns of fixed length (`?` one character), so
// no free text, and so no name, can stand in the tag (C11-D11): a request's case reference, an
// incident by date and number, the Owner bootstrap script's two modes and its Twilio recovery, a
// drill by date, and a landing-zone PR by number. The helper holds each to its exact form.
export const REASON_SHAPES = [
  'case:????-????',
  'incident:????-??-??-??',
  'bootstrap:set-up',
  'bootstrap:correct-number',
  'recover:twilio',
  'drill:????-??-??',
  'lz:pr-?',
  'lz:pr-??',
  'lz:pr-???',
  'lz:pr-????',
  'lz:pr-?????',
] as const

// The landing-zone reasons, under which a workload account's role may administer it through hearthbase.
export const LZ_REASON_SHAPES = REASON_SHAPES.filter(shape => shape.startsWith('lz:'))

// The reasons each grant needs (C11-D12, C11-D78): the bootstrap login for the Owner bootstrap
// script's set-up, its correction and its Twilio recovery; its input secret for the first two alone;
// the read-only login under a request's case reference.
const BOOTSTRAP_LOGIN_REASONS = ['bootstrap:set-up', 'bootstrap:correct-number', 'recover:twilio']
const BOOTSTRAP_INPUT_REASONS = ['bootstrap:set-up', 'bootstrap:correct-number']
const READ_ONLY_REASON = 'case:????-????'

const REASON_TAG = TAG_KEY.reason
const S3_VIA = `s3.${REGION}.amazonaws.com`

export interface BreakGlassRoleProps {
  // The account the role is in.
  account: string
  kind: 'workload' | 'log-archive'
  // The workload account's kind, whose stages the role's statements name (workload kind only).
  workloadAccount?: 'nonprod' | 'prod'
  logArchiveAccount: string
  // The hearth-sec key's ARN, in the same stack (log-archive kind only).
  secKeyArn?: string
}

// What a break-glass session may never do, in either kind of account: an IAM write, by every verb that
// changes an IAM resource (C11-D12).
const NO_IAM_WRITES: IamStatement = {
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
}

// Any change to a bucket's objects' lifetime or its configuration, as wildcards (C11-D08): deletes,
// the bucket's settings and lifecycle, objects' retention and legal holds, and governance bypass.
const LOG_TAMPERING = [
  's3:Delete*',
  's3:PutBucket*',
  's3:PutLifecycle*',
  's3:PutObjectRe*',
  's3:PutObjectLe*',
  's3:BypassGovernance*',
]

// What a workload account's role reads to see the stacks and services, none of which is a model action.
const DESCRIBE_ACTIONS = [
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
]

// The trust (C11-D11): the HearthBreakGlassEntry set's role in this account (its path with or without
// a Region segment), the session's source identity equal to the person's hearth-user principal tag,
// which Identity Center sets from their user name, the one hearth-reason tag in a reason's shape, and
// ap-southeast-1.
function trust(account: string) {
  return document([
    {
      Sid: 'EntrySetOnly',
      Effect: 'Allow',
      Principal: { AWS: accountRoot(account) },
      Action: ['sts:AssumeRole', 'sts:SetSourceIdentity', 'sts:TagSession'],
      Condition: {
        ArnLike: {
          'aws:PrincipalArn': roleArn(account, `${SSO_ROLE_PATH}*AWSReservedSSO_${PERMISSION_SET.breakGlassEntry}_*`),
        },
        StringEquals: {
          'sts:SourceIdentity': iamVariable(`aws:PrincipalTag/${TAG_KEY.user}`),
          'aws:RequestedRegion': REGION,
        },
        'ForAllValues:StringEquals': { 'aws:TagKeys': [REASON_TAG] },
        Null: { [`aws:RequestTag/${REASON_TAG}`]: 'false', 'sts:SourceIdentity': 'false' },
        StringLike: { [`aws:RequestTag/${REASON_TAG}`]: [...REASON_SHAPES] },
      },
    },
  ])
}

// The break-glass-log bucket's ARN, and the prefix under it this account's entries go to (C11-D13).
function entries(account: string, logArchiveAccount: string) {
  const bucket = logBucketName('breakGlass', logArchiveAccount)
  return {
    bucket: arnPattern({ service: 's3', resource: bucket }),
    objects: arnPattern({ service: 's3', resource: `${bucket}/${BREAK_GLASS_KEY_PREFIX}${account}/*` }),
    prefix: `${BREAK_GLASS_KEY_PREFIX}${account}/*`,
    // The encryption context S3 gives the key for the bucket's objects: the bucket (with a bucket key)
    // or the object.
    context: [arnPattern({ service: 's3', resource: bucket }), arnPattern({ service: 's3', resource: `${bucket}/*` })],
  }
}

// A workload account's role (C11-D12, C11-D78): `<s>` ranges over the account's stages, so prod's role
// also names the restore stage's cluster, families, roles, groups and secrets (C11-Q02).
function workloadStatements(props: BreakGlassRoleProps, workloadAccount: 'nonprod' | 'prod'): IamStatement[] {
  const { account, logArchiveAccount } = props
  const stages = stagesIn(workloadAccount)
  const arn = (service: string, resource: string) => arnPattern({ service, region: REGION, account, resource })
  const clusters = stages.map(s => arn('ecs', `cluster/${clusterName(s)}`))
  const tasks = stages.map(s => arn('ecs', `task/${clusterName(s)}/*`))
  const bastionRoles = stages.flatMap(s => [
    roleArn(account, taskRoleName(s, 'bastion')),
    roleArn(account, execRoleName(s, 'bastion')),
  ])
  const log = entries(account, logArchiveAccount)
  const hearthbase = (role: string) => roleArn(account, `cdk-${QUALIFIER.base}-${role}-${account}-${REGION}`)
  const unknown = DESCRIBE_ACTIONS.filter(grantsModelAction)
  if (unknown.length > 0) throw new Error(`break-glass's Describe would grant a model action: ${unknown.join(', ')}`)
  return [
    {
      Sid: 'ReadLogs',
      Effect: 'Allow',
      Action: ['logs:FilterLogEvents', 'logs:GetLogEvents', 'logs:StartQuery'],
      Resource: stages.flatMap(s => [
        arn('logs', `log-group:${logGroupName(s, '*')}`),
        arn('logs', `log-group:${logGroupName(s, '*')}:log-stream:*`),
      ]),
    },
    {
      Sid: 'ReadQueries',
      Effect: 'Allow',
      Action: ['logs:GetQueryResults', 'logs:StopQuery', 'logs:DescribeLogGroups'],
      Resource: '*',
    },
    { Sid: 'Describe', Effect: 'Allow', Action: DESCRIBE_ACTIONS, Resource: '*' },
    {
      Sid: 'Params',
      Effect: 'Allow',
      Action: ['ssm:GetParameter', 'ssm:GetParameters'],
      Resource: arn('ssm', 'parameter/hearth/*'),
    },
    {
      Sid: 'OperateServices',
      Effect: 'Allow',
      Action: 'ecs:UpdateService',
      Resource: stages.map(s => arn('ecs', `service/${clusterName(s)}/*`)),
    },
    { Sid: 'StopTasks', Effect: 'Allow', Action: 'ecs:StopTask', Resource: tasks },
    {
      Sid: 'RunBastion',
      Effect: 'Allow',
      Action: 'ecs:RunTask',
      Resource: stages.map(s => arn('ecs', `task-definition/${taskFamily(s, 'bastion')}:*`)),
      Condition: { ArnEquals: { 'ecs:cluster': clusters } },
    },
    // ECS asks for TagResource when a run's tags (the bastion's hearth-role) land on its task.
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
    // ECS authorises an exec on the cluster and on the task, separately: the task must be the bastion.
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
      Resource: [
        ...tasks,
        arnPattern({ service: 'ssm', region: REGION, resource: 'document/AWS-StartPortForwardingSessionToRemoteHost' }),
      ],
      Condition: { BoolIfExists: { 'ssm:SessionDocumentAccessCheck': 'true' } },
    },
    // The helper's own sessions, named hearth-bg-<time>.
    {
      Sid: 'OwnSessions',
      Effect: 'Allow',
      Action: ['ssm:TerminateSession', 'ssm:ResumeSession'],
      Resource: arn('ssm', 'session/hearth-bg-*'),
    },
    {
      Sid: 'BootstrapLogin',
      Effect: 'Allow',
      Action: 'rds-db:connect',
      Resource: arn('rds-db', `dbuser:*/${DB_LOGIN.bootstrap}`),
      Condition: { StringEquals: { [`aws:PrincipalTag/${REASON_TAG}`]: BOOTSTRAP_LOGIN_REASONS } },
    },
    {
      Sid: 'ReadOnlyLogin',
      Effect: 'Allow',
      Action: 'rds-db:connect',
      Resource: arn('rds-db', `dbuser:*/${DB_LOGIN.breakglassRead}`),
      Condition: { StringLike: { [`aws:PrincipalTag/${REASON_TAG}`]: READ_ONLY_REASON } },
    },
    {
      Sid: 'BootstrapInput',
      Effect: 'Allow',
      Action: ['secretsmanager:GetSecretValue', 'secretsmanager:ListSecretVersionIds', 'secretsmanager:DescribeSecret'],
      Resource: stages.map(s => arn('secretsmanager', `secret:${bootstrapInputSecret(s)}-*`)),
      Condition: { StringEquals: { [`aws:PrincipalTag/${REASON_TAG}`]: BOOTSTRAP_INPUT_REASONS } },
    },
    { Sid: 'WriteLog', Effect: 'Allow', Action: ['s3:PutObject', 's3:GetObject'], Resource: log.objects },
    {
      Sid: 'ListLog',
      Effect: 'Allow',
      Action: 's3:ListBucket',
      Resource: log.bucket,
      Condition: { StringLike: { 's3:prefix': log.prefix } },
    },
    // The log bucket's key sits in the log-archive account under an id no configuration holds, so the
    // grant names any key there, bounded to S3's use of it for this bucket.
    {
      Sid: 'LogKey',
      Effect: 'Allow',
      Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
      Resource: arnPattern({ service: 'kms', region: REGION, account: logArchiveAccount, resource: 'key/*' }),
      Condition: {
        StringEquals: { 'kms:ViaService': S3_VIA },
        StringLike: { 'kms:EncryptionContext:aws:s3:arn': log.context },
      },
    },
    // Landing-zone administration through hearthbase (C11-D27), under an lz:pr- reason alone; never
    // the lookup role, whose ReadOnlyAccess reads objects and logs.
    {
      Sid: 'LandingZone',
      Effect: 'Allow',
      Action: 'sts:AssumeRole',
      Resource: [hearthbase('deploy-role'), hearthbase('file-publishing-role')],
      Condition: { StringLike: { [`aws:PrincipalTag/${REASON_TAG}`]: [...LZ_REASON_SHAPES] } },
    },
    NO_IAM_WRITES,
    { Sid: 'PassOnlyBastion', Effect: 'Deny', Action: 'iam:PassRole', NotResource: bastionRoles },
    {
      Sid: 'NoKeyAdministration',
      Effect: 'Deny',
      Action: [...KMS_ADMIN_ACTIONS, 'kms:CreateGrant'],
      Resource: '*',
    },
    { Sid: 'NoLogTampering', Effect: 'Deny', Action: LOG_TAMPERING, Resource: '*' },
    {
      Sid: 'NoAuditChanges',
      Effect: 'Deny',
      Action: ['organizations:*', 'cloudtrail:*', 'guardduty:*'],
      Resource: '*',
    },
    { Sid: 'NoSecretWrites', Effect: 'Deny', Action: 'secretsmanager:PutSecretValue', Resource: '*' },
    { Sid: 'NoDirectStackChanges', Effect: 'Deny', Action: CFN_WRITE_ACTIONS, Resource: '*' },
    ...rule9SecretDenies(),
    modelDeny(),
  ]
}

// Log-archive's role: its own entries and triage, and nothing it could administer (C11-D12, C11-D21).
function logArchiveStatements(props: BreakGlassRoleProps, secKeyArn: string): IamStatement[] {
  const { account } = props
  const log = entries(account, account)
  const buckets = [
    arnPattern({ service: 's3', resource: logBucketName('trail', account) }),
    arnPattern({ service: 's3', resource: logBucketName('breakGlass', account) }),
  ]
  return [
    { Sid: 'OwnEntries', Effect: 'Allow', Action: ['s3:PutObject', 's3:GetObject'], Resource: log.objects },
    {
      Sid: 'ListOwnEntries',
      Effect: 'Allow',
      Action: 's3:ListBucket',
      Resource: log.bucket,
      Condition: { StringLike: { 's3:prefix': log.prefix } },
    },
    {
      Sid: 'OwnEntriesKey',
      Effect: 'Allow',
      Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
      Resource: secKeyArn,
      Condition: {
        StringEquals: { 'kms:ViaService': S3_VIA },
        StringLike: { 'kms:EncryptionContext:aws:s3:arn': log.context },
      },
    },
    {
      Sid: 'Params',
      Effect: 'Allow',
      Action: 'ssm:GetParameter',
      Resource: arnPattern({ service: 'ssm', region: REGION, account, resource: 'parameter/hearth/break-glass/*' }),
    },
    {
      Sid: 'Triage',
      Effect: 'Allow',
      Action: [
        'guardduty:Get*',
        'guardduty:List*',
        'access-analyzer:Get*',
        'access-analyzer:List*',
        'cloudtrail:LookupEvents',
        'cloudtrail:DescribeTrails',
        'cloudtrail:GetTrailStatus',
      ],
      Resource: '*',
    },
    // The two log buckets' configuration, never their objects (the trail's reader is the reviewer
    // alone) and never the archive bucket's (C11-D21).
    {
      Sid: 'TriageBuckets',
      Effect: 'Allow',
      Action: ['s3:GetBucket*', 's3:GetLifecycleConfiguration', 's3:GetEncryptionConfiguration'],
      Resource: buckets,
    },
    {
      Sid: 'TriageKeys',
      Effect: 'Allow',
      Action: ['kms:DescribeKey', 'kms:GetKeyPolicy', 'kms:GetKeyRotationStatus'],
      Resource: arnPattern({ service: 'kms', region: REGION, account, resource: 'key/*' }),
    },
    NO_IAM_WRITES,
    { Sid: 'NoPassRole', Effect: 'Deny', Action: 'iam:PassRole', Resource: '*' },
    { Sid: 'NoKeyAdministration', Effect: 'Deny', Action: [...KMS_ADMIN_ACTIONS, 'kms:CreateGrant'], Resource: '*' },
    { Sid: 'NoLogTampering', Effect: 'Deny', Action: LOG_TAMPERING, Resource: '*' },
    { Sid: 'NoOrganizations', Effect: 'Deny', Action: 'organizations:*', Resource: '*' },
    // The audit services' writes, named so their reads still work.
    {
      Sid: 'NoAuditWrites',
      Effect: 'Deny',
      Action: [
        'guardduty:Create*',
        'guardduty:Update*',
        'guardduty:Delete*',
        'guardduty:Disassociate*',
        'guardduty:Disable*',
        'guardduty:Stop*',
        'guardduty:Archive*',
        'guardduty:Unarchive*',
        'guardduty:Accept*',
        'guardduty:Decline*',
        'guardduty:Invite*',
        'guardduty:Enable*',
        'guardduty:Start*',
        'access-analyzer:Create*',
        'access-analyzer:Update*',
        'access-analyzer:Delete*',
        'access-analyzer:Apply*',
        'access-analyzer:Start*',
        'access-analyzer:Cancel*',
        'cloudtrail:Create*',
        'cloudtrail:Update*',
        'cloudtrail:Delete*',
        'cloudtrail:Put*',
        'cloudtrail:Stop*',
        'cloudtrail:Start*',
        'cloudtrail:Add*',
        'cloudtrail:Remove*',
      ],
      Resource: '*',
    },
    { Sid: 'NoSecretWrites', Effect: 'Deny', Action: 'secretsmanager:PutSecretValue', Resource: '*' },
    { Sid: 'NoDirectStackChanges', Effect: 'Deny', Action: CFN_WRITE_ACTIONS, Resource: '*' },
    {
      Sid: 'NoLandingZone',
      Effect: 'Deny',
      Action: 'sts:AssumeRole',
      Resource: roleArn('*', `cdk-${QUALIFIER.base}-*`),
    },
    ...rule9SecretDenies(),
    modelDeny(),
  ]
}

export class BreakGlassRole extends Construct {
  readonly role: iam.CfnRole

  constructor(scope: Construct, id: string, props: BreakGlassRoleProps) {
    super(scope, id)
    let statements: IamStatement[]
    if (props.kind === 'workload') {
      if (props.workloadAccount === undefined) throw new Error('a workload break-glass role names its account kind')
      statements = workloadStatements(props, props.workloadAccount)
    } else {
      if (props.secKeyArn === undefined) throw new Error("log-archive's break-glass role names the hearth-sec key")
      statements = logArchiveStatements(props, props.secKeyArn)
    }
    this.role = new iam.CfnRole(this, 'Role', {
      roleName: ROLE.breakGlass,
      maxSessionDuration: 3600,
      assumeRolePolicyDocument: trust(props.account),
      policies: [{ policyName: ROLE.breakGlass, policyDocument: document(statements) }],
    })
  }
}
