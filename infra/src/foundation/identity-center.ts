// Identity Center's permission sets and their assignments (C11-D09, C11-D10), in Hearth-Foundation:
// how people reach AWS at all. The organisation instance itself, its directory, its MFA rule (security
// keys and passkeys only), its one-hour access-portal session, and the people and groups are made by
// hand (the set-up runbook): no resource makes an organisation instance, and names are personal data.
// The instance's ARN is formed at synth from its id by arnPattern() (TECH-SPEC T24 item 10), and the
// groups the sets are assigned to come from configuration.
//
// Five sets, each with an hour's session but the operator's eight and the reviewer's four, and each
// inline policy starting with the unconditional model deny, which is management's only fence for
// people, since SCPs never bind it (C11-D06, C11-D10):
// - HearthOrgAdmin (management): AdministratorAccess, which may neither close an account nor take one
//   out of the organisation without an alarmed edit of the set first (TECH-SPEC T24 item 3);
// - HearthBreakGlassEntry (every member account): nothing but assuming that account's
//   hearth-break-glass (C11-D11);
// - HearthNonprodOperator (non-prod, only while it holds no real data, C11-D69): read-only, service
//   updates, and no secret values;
// - HearthSecurityReview (management and log-archive): the trail's CloudWatch copy, the trail's and
//   break-glass entries' objects and their configuration, decrypted through S3 under the trail's or
//   the entries' encryption context alone, the keys' configuration, and the findings; never the
//   archive (C11-D17, C11-D21);
// - HearthBilling (management): billing read-only, through AWS's AWSBillingReadOnlyAccess, whose name
//   the set-up runbook confirms in AWS's managed-policy list (TECH-SPEC T24 item 3).
// Nobody holds a standing set in prod but the break-glass entry, and an account holding real data
// takes no other; the attribute for access control maps each person's sign-in name to hearth-user,
// which break-glass's trust compares with the session's source identity (C11-D11). HearthSetUp, the
// first deploys' set, is made by hand from HearthOrgAdmin's synthesised inline policy and deleted after
// them (TECH-SPEC T24 item 3). This file decides who may do what in AWS, so it is on the owner's-read
// list (C11-D74).
import * as cdk from 'aws-cdk-lib'
import * as sso from 'aws-cdk-lib/aws-sso'
import { Construct } from 'constructs'
import { arnPattern, awsManagedPolicyArn, bucketArns, roleArn } from '../config/arns.ts'
import type { LandingZoneConfig } from '../config/env.ts'
import {
  iamVariable,
  KEY_ALIAS,
  logBucketName,
  PERMISSION_SET,
  ROLE,
  SECURITY_LOG_GROUP,
  TRAIL_NAME,
} from '../config/names.ts'
import { REGION } from '../config/profiles.ts'
import { document, type IamStatement, modelDeny, NO_ACCOUNT_REMOVAL } from './denies.ts'
import type { ResolvedLandingZoneOptions } from './options.ts'

// The accounts a set may be assigned to, by their configuration names.
type AccountName = keyof LandingZoneConfig['accounts']
type GroupName = keyof LandingZoneConfig['identityCenter']['groups']

// The attribute for access control the break-glass trust reads (C11-D11).
export const USER_ATTRIBUTE = 'hearth-user'

// IAM's limit on a role's inline policies together, which a set's inline policy becomes in each
// account, in characters without whitespace.
const INLINE_LIMIT = 10_240

interface SetSpec {
  id: string
  name: string
  description: string
  sessionDuration: string
  managed: readonly string[]
  // Beyond the model deny, which every set's inline policy starts with.
  statements: IamStatement[]
}

interface AssignmentSpec {
  set: string
  group: GroupName
  account: AccountName
}

// What the reviewer reads: the trail's copy in management, and in log-archive the trail's and the
// break-glass entries' buckets and objects, decrypted through S3 under each one's encryption context
// alone, and the keys' configuration; never the archive bucket or its key (C11-D17, C11-D21).
function reviewStatements(config: LandingZoneConfig): IamStatement[] {
  const { management, logArchive } = config.accounts
  const logGroup = arnPattern({
    service: 'logs',
    region: REGION,
    account: management,
    resource: `log-group:${SECURITY_LOG_GROUP}`,
  })
  const [trailBucket, trailObjects] = bucketArns(logBucketName('trail', logArchive))
  const [entriesBucket, entriesObjects] = bucketArns(logBucketName('breakGlass', logArchive))
  const [archiveBucket, archiveObjects] = bucketArns(logBucketName('archive', logArchive))
  const keys = arnPattern({ service: 'kms', region: REGION, account: logArchive, resource: 'key/*' })
  const viaS3 = { 'kms:ViaService': `s3.${REGION}.amazonaws.com` }
  const trail = arnPattern({ service: 'cloudtrail', region: '*', account: management, resource: `trail/${TRAIL_NAME}` })
  return [
    {
      Sid: 'QueryTrailCopy',
      Effect: 'Allow',
      Action: ['logs:StartQuery', 'logs:GetLogEvents', 'logs:FilterLogEvents', 'logs:DescribeLogStreams'],
      Resource: [logGroup, `${logGroup}:*`],
    },
    {
      Sid: 'QueryResults',
      Effect: 'Allow',
      Action: [
        'logs:GetQueryResults',
        'logs:StopQuery',
        'logs:DescribeLogGroups',
        'logs:DescribeQueries',
        'logs:DescribeQueryDefinitions',
      ],
      Resource: '*',
    },
    {
      Sid: 'ReadLogs',
      Effect: 'Allow',
      Action: [
        's3:GetObject',
        's3:GetObjectVersion',
        's3:ListBucket',
        's3:ListBucketVersions',
        's3:GetBucketLocation',
        's3:GetBucketPolicy',
        's3:GetBucketVersioning',
        's3:GetBucketObjectLockConfiguration',
        's3:GetLifecycleConfiguration',
        's3:GetEncryptionConfiguration',
        's3:GetObjectRetention',
      ],
      Resource: [trailBucket, trailObjects, entriesBucket, entriesObjects],
    },
    // CloudTrail encrypts the trail's files under its own encryption context, the trail's ARN.
    {
      Sid: 'DecryptTrail',
      Effect: 'Allow',
      Action: 'kms:Decrypt',
      Resource: keys,
      Condition: { StringEquals: viaS3, StringLike: { 'kms:EncryptionContext:aws:cloudtrail:arn': trail } },
    },
    // S3 encrypts the break-glass entries under the bucket's.
    {
      Sid: 'DecryptEntries',
      Effect: 'Allow',
      Action: 'kms:Decrypt',
      Resource: keys,
      Condition: {
        StringEquals: viaS3,
        StringLike: { 'kms:EncryptionContext:aws:s3:arn': [entriesBucket, entriesObjects] },
      },
    },
    {
      Sid: 'KeyReadBack',
      Effect: 'Allow',
      Action: ['kms:DescribeKey', 'kms:GetKeyPolicy', 'kms:GetKeyRotationStatus', 'kms:ListResourceTags'],
      Resource: keys,
    },
    {
      Sid: 'Findings',
      Effect: 'Allow',
      Action: ['guardduty:Get*', 'guardduty:List*', 'access-analyzer:Get*', 'access-analyzer:List*'],
      Resource: '*',
    },
    { Sid: 'NeverTheArchive', Effect: 'Deny', Action: 's3:*', Resource: [archiveBucket, archiveObjects] },
    {
      Sid: 'NeverTheArchiveKey',
      Effect: 'Deny',
      Action: ['kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
      Resource: '*',
      Condition: { 'ForAnyValue:StringEquals': { 'kms:ResourceAliases': KEY_ALIAS.archive } },
    },
  ]
}

// The five sets (C11-D10).
function permissionSets(config: LandingZoneConfig): SetSpec[] {
  const ownAccount = iamVariable('aws:PrincipalAccount')
  return [
    {
      id: 'OrgAdmin',
      name: PERMISSION_SET.orgAdmin,
      description: 'Management administration, every model action denied (C11-D10)',
      sessionDuration: 'PT1H',
      managed: ['AdministratorAccess'],
      statements: [{ Sid: 'NoAccountRemoval', Effect: 'Deny', Action: NO_ACCOUNT_REMOVAL, Resource: '*' }],
    },
    {
      id: 'BreakGlassEntry',
      name: PERMISSION_SET.breakGlassEntry,
      description: "Only assuming this account's hearth-break-glass (C11-D11)",
      sessionDuration: 'PT1H',
      managed: [],
      statements: [
        {
          Sid: 'AssumeBreakGlass',
          Effect: 'Allow',
          Action: ['sts:AssumeRole', 'sts:TagSession', 'sts:SetSourceIdentity'],
          Resource: roleArn(ownAccount, ROLE.breakGlass),
          Condition: { StringEquals: { 'aws:RequestedRegion': REGION } },
        },
      ],
    },
    {
      id: 'NonprodOperator',
      name: PERMISSION_SET.nonprodOperator,
      description: 'Non-prod read-only and service updates, no secret values (C11-D10, C11-D69)',
      sessionDuration: 'PT8H',
      managed: ['ReadOnlyAccess'],
      statements: [
        {
          Sid: 'UpdateServices',
          Effect: 'Allow',
          Action: 'ecs:UpdateService',
          Resource: arnPattern({ service: 'ecs', region: REGION, account: ownAccount, resource: 'service/hearth-*/*' }),
        },
        { Sid: 'NoSecretValues', Effect: 'Deny', Action: 'secretsmanager:GetSecretValue', Resource: '*' },
      ],
    },
    {
      id: 'SecurityReview',
      name: PERMISSION_SET.securityReview,
      description: 'The trail, the break-glass entries and the findings, read-only, never the archive (C11-D17)',
      sessionDuration: 'PT4H',
      managed: [],
      statements: reviewStatements(config),
    },
    {
      id: 'Billing',
      name: PERMISSION_SET.billing,
      description: 'Billing read-only (C11-D10)',
      sessionDuration: 'PT1H',
      managed: ['AWSBillingReadOnlyAccess'],
      statements: [],
    },
  ]
}

// Who holds which set where (C11-D10): eight today, seven once non-prod holds real data (C11-D69).
function assignments(options: ResolvedLandingZoneOptions): AssignmentSpec[] {
  return [
    { set: 'OrgAdmin', group: 'orgAdmins', account: 'management' },
    { set: 'BreakGlassEntry', group: 'onCall', account: 'prod' },
    { set: 'BreakGlassEntry', group: 'onCall', account: 'logArchive' },
    { set: 'BreakGlassEntry', group: 'onCall', account: 'nonprod' },
    ...(options.holdsRealData.nonprod
      ? []
      : [{ set: 'NonprodOperator', group: 'nonprodOperators', account: 'nonprod' } as const]),
    { set: 'SecurityReview', group: 'reviewers', account: 'management' },
    { set: 'SecurityReview', group: 'reviewers', account: 'logArchive' },
    { set: 'Billing', group: 'billing', account: 'management' },
  ]
}

// The one set an account holding real data may be assigned (IAC-19): it grants nothing but assuming
// that account's alarmed break-glass role.
const REAL_DATA_SET = 'BreakGlassEntry'

export interface IdentityCenterProps {
  config: LandingZoneConfig
  options: ResolvedLandingZoneOptions
}

export class IdentityCenter extends Construct {
  readonly permissionSets: ReadonlyMap<string, sso.CfnPermissionSet>

  constructor(scope: Construct, id: string, props: IdentityCenterProps) {
    super(scope, id)
    const { config, options } = props
    const instanceArn = arnPattern({ service: 'sso', resource: `instance/${config.identityCenter.instanceId}` })

    new sso.CfnInstanceAccessControlAttributeConfiguration(this, 'AccessControlAttributes', {
      instanceArn,
      accessControlAttributes: [{ key: USER_ATTRIBUTE, value: { source: [iamVariable('path:userName')] } }],
    })

    const sets = new Map<string, sso.CfnPermissionSet>()
    for (const spec of permissionSets(config)) {
      const inline = document([modelDeny('NoModels'), ...spec.statements])
      const size = JSON.stringify(inline).length
      if (size > INLINE_LIMIT) {
        throw new Error(`${spec.name}'s inline policy holds ${size} characters, over ${INLINE_LIMIT}`)
      }
      const set = new sso.CfnPermissionSet(this, spec.id, {
        instanceArn,
        name: spec.name,
        description: spec.description,
        sessionDuration: spec.sessionDuration,
        ...(spec.managed.length > 0 ? { managedPolicies: spec.managed.map(awsManagedPolicyArn) } : {}),
        inlinePolicy: inline,
      })
      set.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
      sets.set(spec.id, set)
    }
    this.permissionSets = sets

    // An account whose profile holds real data takes no standing set but the break-glass entry. Unlike
    // the sets, the assignments are never retained: one that leaves the template, as NonprodOperator's
    // does when nonprod comes to hold real data, must leave AWS too (C11-D69, IAC-19).
    const realData: ReadonlySet<AccountName> = new Set(
      (['nonprod', 'prod'] as const).filter(account => options.holdsRealData[account]),
    )
    for (const assignment of assignments(options)) {
      if (realData.has(assignment.account) && assignment.set !== REAL_DATA_SET) {
        throw new Error(`${assignment.set} would be assigned to ${assignment.account}, which holds real data`)
      }
      const set = sets.get(assignment.set)
      if (set === undefined) throw new Error(`no permission set ${assignment.set}`)
      new sso.CfnAssignment(this, `${assignment.set}In${accountId(assignment.account)}`, {
        instanceArn,
        permissionSetArn: set.attrPermissionSetArn,
        principalType: 'GROUP',
        principalId: config.identityCenter.groups[assignment.group],
        targetType: 'AWS_ACCOUNT',
        targetId: config.accounts[assignment.account],
      })
    }
  }
}

// A construct id's account part: `logArchive` → `LogArchive`.
const accountId = (account: AccountName) => account.charAt(0).toUpperCase() + account.slice(1)
