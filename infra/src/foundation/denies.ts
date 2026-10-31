// The action lists, principal patterns and statement builders the landing zone's policies share
// (C11-D05, C11-D10, C11-D12, C11-D26): the SCPs, hearth-boundary, the break-glass roles and the
// permission sets name the same actions and the same excepted roles from here, so each list is written
// once and a fence can't drift from its twin. Documents are plain IAM JSON, typed, written into L1
// properties as they are, so a template holds exactly what the source says and nothing merges
// statements. Every ARN comes from arns.ts (IG-01), and every model action from models.ts (IG-10).
// Statement ids are fixed strings, which the assertion tests pin.
import { arnPattern, bucketArns, roleArn } from '../config/arns.ts'
import { modelDenyActions } from '../config/models.ts'
import { LOG_BUCKET_PREFIX, QUALIFIER, ROLE, TAG_KEY, type TaskRoleKind } from '../config/names.ts'
import { REGION } from '../config/profiles.ts'

// One IAM statement as a policy document holds it. No statement here or in any landing-zone policy
// is an Allow with NotAction (IAC-01 refuses one).
export interface IamStatement {
  Sid: string
  Effect: 'Allow' | 'Deny'
  Principal?: unknown
  Action?: string | readonly string[]
  NotAction?: readonly string[]
  Resource?: string | readonly string[]
  NotResource?: string | readonly string[]
  Condition?: Record<string, Record<string, string | readonly string[]>>
}

export interface IamDocument {
  Version: '2012-10-17'
  Statement: IamStatement[]
}

export const document = (Statement: IamStatement[]): IamDocument => ({ Version: '2012-10-17', Statement })

// The model deny (C11-D06): every model service and model action, on everything, with no condition, so
// IAC-01 counts it as in place wherever it stands.
export const modelDeny = (sid = 'NoModels'): IamStatement => ({
  Sid: sid,
  Effect: 'Deny',
  Action: modelDenyActions(),
  Resource: '*',
})

// Every IAM action that writes, as the protected-name fences deny it (C11-D05, C11-D26).
export const IAM_WRITE_ACTIONS: readonly string[] = [
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

// What no principal may do to the log-archive buckets (the evidence floor, C11-D05), written as
// wildcards LCG-02 doesn't read as S3 calls (C11-D08).
export const LOG_BUCKET_DENY_ACTIONS: readonly string[] = [
  's3:Delete*',
  's3:PutLifecycle*',
  's3:PutObjectRe*',
  's3:PutObjectLe*',
  's3:BypassGovernance*',
]

// The three log-archive buckets in any account, and their objects: six patterns, trail first.
export const LOG_BUCKET_PATTERNS = (): string[] =>
  Object.values(LOG_BUCKET_PREFIX).flatMap(prefix => bucketArns(`${prefix}*`))

// Long-lived credentials, which nobody makes: people sign in through Identity Center (C11-D09).
export const NO_LONG_LIVED_CREDENTIALS: readonly string[] = [
  'iam:CreateUser',
  'iam:CreateAccessKey',
  'iam:CreateLoginProfile',
  'iam:CreateServiceSpecificCredential',
]

// A new or changed identity provider, and Cognito's identity pools: a role trusting one would be a way
// in that no AssumeRole fence sees (C11-D07, TECH-SPEC T24 items 2 and 32).
export const NO_NEW_IDENTITY_PROVIDERS: readonly string[] = [
  'iam:CreateOpenIDConnectProvider',
  'iam:AddClientIDToOpenIDConnectProvider',
  'iam:UpdateOpenIDConnectProviderThumbprint',
  'iam:CreateSAMLProvider',
  'iam:UpdateSAMLProvider',
  'cognito-identity:*',
]

// Closing an account or taking it out of the organisation, which would lift every SCP from it and end
// its content after the post-closure period (C11-D10, TECH-SPEC T24 item 3).
export const NO_ACCOUNT_REMOVAL: readonly string[] = [
  'organizations:CloseAccount',
  'organizations:RemoveAccountFromOrganization',
]

// AWS's own SMS: Hearth's codes go through Twilio Verify alone (D46), and AWS sends no text.
export const SMS_DENY_ACTIONS: readonly string[] = [
  'sms-voice:*',
  'mobiletargeting:*',
  'sns:SetSMSAttributes',
  'sns:CreateSMSSandboxPhoneNumber',
  'sns:VerifySMSSandboxPhoneNumber',
  'sns:OptInPhoneNumber',
]

// A route out of a VPC that has none (C11-D29): NAT, egress-only gateways, peering, transit and VPN.
export const ROUTE_OUT_ACTIONS: readonly string[] = [
  'ec2:CreateNatGateway',
  'ec2:CreateEgressOnlyInternetGateway',
  'ec2:CreateVpcPeeringConnection',
  'ec2:AcceptVpcPeeringConnection',
  'ec2:CreateTransitGateway*',
  'ec2:CreateVpnGateway',
  'ec2:CreateCustomerGateway',
]

// What would change who a Rule 9 role is or what it may do, or hand it to a task (C11-D05).
export const RULE9_ROLE_WRITES: readonly string[] = [
  'iam:CreateRole',
  'iam:UpdateAssumeRolePolicy',
  'iam:PutRolePolicy',
  'iam:AttachRolePolicy',
  'iam:PutRolePermissionsBoundary',
  'iam:TagRole',
  'iam:UntagRole',
  'iam:PassRole',
]

// A key's administration, which break-glass never does (C11-D12).
export const KMS_ADMIN_ACTIONS: readonly string[] = [
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
]

// A stack changed directly rather than deployed through its bootstrap roles (C11-D12).
export const CFN_WRITE_ACTIONS: readonly string[] = [
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

// The roles an SCP may except, by name pattern in any account (C11-D05, C11-D26). Nothing else is ever
// excepted: IAC-02 holds every principal condition in the SCPs to these.
// Each qualifier's CloudFormation execution role, one `*` for the account.
export const EXEC_ROLE = `cdk-${QUALIFIER.base}-cfn-exec-role-*-${REGION}`
export const APP_EXEC_ROLE = `cdk-${QUALIFIER.app}-cfn-exec-role-*-${REGION}`
export const EXEC = roleArn('*', EXEC_ROLE)
export const APP_EXEC = roleArn('*', APP_EXEC_ROLE)
// The role Organizations makes in each member account (C11-D02).
export const OAAR = roleArn('*', ROLE.oaar)
export const BREAK_GLASS = roleArn('*', ROLE.breakGlass)
export const GH_DEPLOY = roleArn('*', ROLE.ghDeploy)
// GitHub's deploy and plan roles, and every role either qualifier's bootstrap makes.
export const GH_ROLES = roleArn('*', 'hearth-gh-*')
export const CDK_HEARTH = roleArn('*', 'cdk-hearth*')
// A server role's task role in any environment, and the Rule 9 task's execution role (C11-D38).
export const TASK_ROLE = (kind: TaskRoleKind) => roleArn('*', `hearth-*-${kind}-task`)
export const RULE9_EXEC = roleArn('*', 'hearth-*-rule9-exec')

// The Rule 9 module's secrets, by name and by tag, which no landing-zone principal reads (C11-D05,
// C11-D12): the SCP excepts only the Rule 9 task and its execution role, these deny everyone they bind.
export function rule9SecretDenies(): IamStatement[] {
  return [
    {
      Sid: 'NoRule9SecretByName',
      Effect: 'Deny',
      Action: 'secretsmanager:GetSecretValue',
      Resource: arnPattern({
        service: 'secretsmanager',
        region: '*',
        account: '*',
        resource: 'secret:hearth/*/rule9*',
      }),
    },
    {
      Sid: 'NoRule9SecretByTag',
      Effect: 'Deny',
      Action: 'secretsmanager:GetSecretValue',
      Resource: '*',
      Condition: { StringEquals: { [`secretsmanager:ResourceTag/${TAG_KEY.access}`]: 'rule9' } },
    },
  ]
}

// No SMS from AWS (D46): AWS's SMS services, an SMS subscription to a topic, and a publish to anything
// but a topic, which is how SNS texts a number directly.
export function smsDenies(): IamStatement[] {
  return [
    { Sid: 'NoAwsSms', Effect: 'Deny', Action: [...SMS_DENY_ACTIONS], Resource: '*' },
    {
      Sid: 'NoSmsSubscriptions',
      Effect: 'Deny',
      Action: 'sns:Subscribe',
      Resource: '*',
      Condition: { StringEquals: { 'sns:Protocol': 'sms' } },
    },
    {
      Sid: 'NoDirectPublish',
      Effect: 'Deny',
      Action: 'sns:Publish',
      NotResource: arnPattern({ service: 'sns', region: '*', account: '*', resource: '*' }),
    },
  ]
}
