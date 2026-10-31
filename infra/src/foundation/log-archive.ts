// Hearth-LogArchive (C11-D13, C11-D17 to C11-D21, C11-D27): the evidence the rest of the organisation
// can't reach, in the log-archive account, first deployed through OrganizationAccountAccessRole while
// the account sits in Root and afterwards only as tier 2. It holds:
// - two keys: hearth-sec, which encrypts the organisation trail and the break-glass entries, and
//   hearth-archive, kept for C0.17's deletion-log archive, which nobody may use yet (C11-D21);
// - three buckets, each versioned, under Object Lock, encrypted under its key, private, TLS 1.2 or
//   later, owner-enforced and retained: the trail's and the break-glass entries', whose every version
//   is locked for its class's period and then expires (C11-D18, C11-D19), and the archive, which holds
//   nothing yet and expires nothing;
// - the organisation's Access Analyzer and the A9 and A10 findings alarms (security-services.ts);
// - its own hearth-break-glass, which writes its entries and triages, and administers nothing;
// - its ops topic, the fast alarms A1 and A15, and the break-glass-log bucket's SSM parameter.
//
// Each key's policy is written out whole, so neither carries the account root's kms:* that CDK would
// otherwise add: the hearthbase execution role administers both, CloudTrail encrypts with hearth-sec
// for the organisation trail alone, the break-glass roles use it through S3 for their entries alone,
// the reviewer's Identity Center role decrypts the trail's and the entries' objects through S3, and
// the analyzer, the reviewer and break-glass read each key's configuration back (C11-D17). The
// guardrails deny everyone the buckets' deletes and the keys' deletion and disabling (the evidence
// floor), and, once the account sits in the Security OU, any change to the buckets' configuration or
// the keys' policies (C11-D05).
//
// This file is LCG-02's one LIFECYCLE_ALLOWED entry: the trail and break-glass-log buckets' versions
// expire, untagged, once their lock has passed, since their class's period is the bucket's own
// retention and CloudTrail can't tag its objects (C11-D19). The test pins each rule's shape.
import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as kms from 'aws-cdk-lib/aws-kms'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'
import { BreakGlassRole } from '../baseline/break-glass.ts'
import { FastAlarms } from '../baseline/fast-alarms.ts'
import { OpsAlerts } from '../baseline/ops-alerts.ts'
import { accountRoot, arnPattern, bucketArns, roleArn } from '../config/arns.ts'
import type { LandingZoneConfig } from '../config/env.ts'
import {
  BREAK_GLASS_KEY_PREFIX,
  iamVariable,
  KEY_ALIAS,
  logBucketName,
  PERMISSION_SET,
  QUALIFIER,
  ROLE,
  SEC_RULE_PREFIX,
  SEC_TAG,
  SSM_PARAMETER,
  SSO_ROLE_PATH,
  TRAIL_NAME,
} from '../config/names.ts'
import { REGION } from '../config/profiles.ts'
import { type LOCKED_LOG_CLASSES, objectLockDays } from '../config/retention.ts'
import type { ResolvedLandingZoneOptions } from './options.ts'
import { SecurityServices } from './security-services.ts'

export interface LogArchiveStackProps extends cdk.StackProps {
  config: LandingZoneConfig
  options: ResolvedLandingZoneOptions
}

const S3_VIA = `s3.${REGION}.amazonaws.com`
const CLOUDTRAIL = 'cloudtrail.amazonaws.com'

// The lifecycle of a locked log bucket (C11-D19), whose class's period is both its lock and its
// expiry: a version moves to Glacier Instant Retrieval after 30 days; at the end of the period, as its
// lock passes, it expires, which in a versioned bucket puts a delete marker over it and makes it
// noncurrent; a noncurrent version goes a day later (Object Lock holds back one whose lock hasn't
// passed); and the delete marker, with no version left under it, is then removed. S3 refuses
// ExpiredObjectDeleteMarker beside an expiry, hence two rules.
function lockedBucketRules(logClass: (typeof LOCKED_LOG_CLASSES)[number]): s3.LifecycleRule[] {
  return [
    {
      id: 'retention-exit',
      transitions: [
        { storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL, transitionAfter: cdk.Duration.days(30) },
      ],
      expiration: cdk.Duration.days(objectLockDays(logClass)),
      noncurrentVersionExpiration: cdk.Duration.days(1),
    },
    { id: 'expired-delete-markers', expiredObjectDeleteMarker: true },
  ]
}

export class LogArchiveStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LogArchiveStackProps) {
    super(scope, id, props)
    const { config, options } = props
    const account = config.accounts.logArchive
    if (this.account !== account) {
      throw new Error(`${id} must be deployed into the log-archive account its configuration names`)
    }
    const org = config.organization.id
    const management = config.accounts.management

    // The organisation trail in management, and any trail of management's (the encryption context
    // CloudTrail gives the key), which the key and the trail bucket admit CloudTrail for (C11-D17).
    const trail = arnPattern({
      service: 'cloudtrail',
      region: REGION,
      account: management,
      resource: `trail/${TRAIL_NAME}`,
    })
    const anyTrail = arnPattern({ service: 'cloudtrail', region: '*', account: management, resource: 'trail/*' })
    const [trailBucketArn] = bucketArns(logBucketName('trail', account))
    const [entriesArn, entriesObjectsArn] = bucketArns(logBucketName('breakGlass', account))
    const [, archiveObjectsArn] = bucketArns(logBucketName('archive', account))
    const execRole = roleArn(account, `cdk-${QUALIFIER.base}-cfn-exec-role-${account}-${REGION}`)
    const reviewer = roleArn(account, `${SSO_ROLE_PATH}*AWSReservedSSO_${PERMISSION_SET.securityReview}_*`)
    const anyBreakGlass = roleArn('*', ROLE.breakGlass)

    // Key policy statements (C11-D17, C11-D21).
    const keyAdministration = new iam.PolicyStatement({
      sid: 'KeyAdministration',
      principals: [new iam.ArnPrincipal(execRole)],
      actions: [
        'kms:Create*',
        'kms:Describe*',
        'kms:Enable*',
        'kms:List*',
        'kms:Put*',
        'kms:Update*',
        'kms:Revoke*',
        'kms:Disable*',
        'kms:Get*',
        'kms:Delete*',
        'kms:TagResource',
        'kms:UntagResource',
        'kms:ScheduleKeyDeletion',
        'kms:CancelKeyDeletion',
        'kms:RotateKeyOnDemand',
      ],
      resources: ['*'],
    })
    const readBack = new iam.PolicyStatement({
      sid: 'ReadBack',
      principals: [new iam.ArnPrincipal(accountRoot(account))],
      actions: [
        'kms:DescribeKey',
        'kms:GetKeyPolicy',
        'kms:GetKeyRotationStatus',
        'kms:ListResourceTags',
        'kms:ListGrants',
      ],
      resources: ['*'],
      conditions: {
        ArnLike: {
          'aws:PrincipalArn': [
            roleArn(account, 'aws-service-role/access-analyzer.amazonaws.com/AWSServiceRoleForAccessAnalyzer'),
            reviewer,
            roleArn(account, ROLE.breakGlass),
          ],
        },
      },
    })
    const secKey = new kms.Key(this, 'SecKey', {
      alias: KEY_ALIAS.sec,
      description: 'The organisation trail and the break-glass entries (C11-D13, C11-D17)',
      enableKeyRotation: true,
      pendingWindow: cdk.Duration.days(30),
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      policy: new iam.PolicyDocument({
        minimize: false,
        statements: [
          keyAdministration,
          new iam.PolicyStatement({
            sid: 'CloudTrailEncrypt',
            principals: [new iam.ServicePrincipal(CLOUDTRAIL)],
            actions: ['kms:GenerateDataKey*'],
            resources: ['*'],
            conditions: {
              StringEquals: { 'aws:SourceArn': trail },
              StringLike: { 'kms:EncryptionContext:aws:cloudtrail:arn': anyTrail },
            },
          }),
          new iam.PolicyStatement({
            sid: 'CloudTrailDescribe',
            principals: [new iam.ServicePrincipal(CLOUDTRAIL)],
            actions: ['kms:DescribeKey'],
            resources: ['*'],
            conditions: { StringEquals: { 'aws:SourceArn': trail } },
          }),
          // Every account's break-glass role writes and reads back its own entries, through S3.
          new iam.PolicyStatement({
            sid: 'BreakGlassLogWriters',
            principals: [new iam.AnyPrincipal()],
            actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
            resources: ['*'],
            conditions: {
              StringEquals: { 'aws:PrincipalOrgID': org, 'kms:ViaService': S3_VIA },
              ArnLike: { 'aws:PrincipalArn': anyBreakGlass },
              StringLike: { 'kms:EncryptionContext:aws:s3:arn': [entriesArn, entriesObjectsArn] },
            },
          }),
          // The reviewer decrypts the trail's files, under CloudTrail's context, and the entries,
          // under S3's, both through S3 (C11-D17).
          new iam.PolicyStatement({
            sid: 'ReviewerDecryptTrail',
            principals: [new iam.ArnPrincipal(accountRoot(account))],
            actions: ['kms:Decrypt'],
            resources: ['*'],
            conditions: {
              ArnLike: { 'aws:PrincipalArn': reviewer },
              StringEquals: { 'kms:ViaService': S3_VIA },
              StringLike: { 'kms:EncryptionContext:aws:cloudtrail:arn': anyTrail },
            },
          }),
          new iam.PolicyStatement({
            sid: 'ReviewerDecryptEntries',
            principals: [new iam.ArnPrincipal(accountRoot(account))],
            actions: ['kms:Decrypt'],
            resources: ['*'],
            conditions: {
              ArnLike: { 'aws:PrincipalArn': reviewer },
              StringEquals: { 'kms:ViaService': S3_VIA },
              StringLike: { 'kms:EncryptionContext:aws:s3:arn': [entriesArn, entriesObjectsArn] },
            },
          }),
          readBack,
        ],
      }),
    })
    cdk.Tags.of(secKey).add(SEC_TAG, 'true')

    // Kept for C0.17's deletion-log archive: administered and read back, used by nobody (C11-D21).
    const archiveKey = new kms.Key(this, 'ArchiveKey', {
      alias: KEY_ALIAS.archive,
      description: "The deletion log's archive, used by nobody until C0.17 names its readers (C11-D21)",
      enableKeyRotation: true,
      pendingWindow: cdk.Duration.days(30),
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      policy: new iam.PolicyDocument({ minimize: false, statements: [keyAdministration, readBack] }),
    })
    cdk.Tags.of(archiveKey).add(SEC_TAG, 'true')

    // What every log bucket is (C11-D17, C11-D18): versioned and under Object Lock, encrypted under
    // its key with a bucket key (but the trail's, below), private, TLS only and 1.2 or later
    // (enforceSSL and minimumTLSVersion each write a deny into its policy), owner-enforced, and retained
    // once made: a create that rolls back deletes it, empty, so a failed first deploy's retry isn't
    // refused by its name. The keys are retained the same way.
    const logBucket = (kind: 'trail' | 'breakGlass' | 'archive', encryptionKey: kms.IKey): s3.BucketProps => ({
      bucketName: logBucketName(kind, account),
      versioned: true,
      objectLockEnabled: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      minimumTLSVersion: 1.2,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    })
    // Each version locked for its class's period, in the mode the owner chose (C11-D18).
    const lock = (days: number) =>
      options.logLockMode === 'COMPLIANCE'
        ? s3.ObjectLockRetention.compliance(cdk.Duration.days(days))
        : s3.ObjectLockRetention.governance(cdk.Duration.days(days))

    // The organisation trail's files (C11-D17): CloudTrail checks the bucket's ACL and writes the
    // organisation's and management's own files, each only for the organisation trail. This bucket
    // alone has no bucket key: with one, making or updating a trail encrypted under SSE-KMS needs
    // kms:Decrypt, which hearth-sec gives neither CloudTrail nor management's execution role, since
    // that would make either a reader of the trail beside the reviewer. Each delivery then asks the
    // key for its own data key, which at this trail's rate costs next to nothing.
    const trailBucket = new s3.Bucket(this, 'TrailBucket', {
      ...logBucket('trail', secKey),
      bucketKeyEnabled: false,
      objectLockDefaultRetention: lock(objectLockDays('cloudtrail')),
      lifecycleRules: lockedBucketRules('cloudtrail'),
    })
    trailBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AWSCloudTrailAclCheck',
        principals: [new iam.ServicePrincipal(CLOUDTRAIL)],
        actions: ['s3:GetBucketAcl'],
        resources: [trailBucketArn],
        conditions: { StringEquals: { 'aws:SourceArn': trail } },
      }),
    )
    const cloudTrailWrite = (sid: string, prefix: string) =>
      new iam.PolicyStatement({
        sid,
        principals: [new iam.ServicePrincipal(CLOUDTRAIL)],
        actions: ['s3:PutObject'],
        resources: [`${trailBucketArn}/AWSLogs/${prefix}/*`],
        conditions: { StringEquals: { 's3:x-amz-acl': 'bucket-owner-full-control', 'aws:SourceArn': trail } },
      })
    trailBucket.addToResourcePolicy(cloudTrailWrite('AWSCloudTrailOrganizationWrite', org))
    trailBucket.addToResourcePolicy(cloudTrailWrite('AWSCloudTrailAccountWrite', management))

    // The break-glass entries (C11-D13): each account's role writes and reads back under its own
    // account's prefix, the reviewer reads them all, and nobody but this stack's execution role does
    // anything else to the bucket or its objects.
    const entriesBucket = new s3.Bucket(this, 'BreakGlassLogBucket', {
      ...logBucket('breakGlass', secKey),
      objectLockDefaultRetention: lock(objectLockDays('break_glass_log')),
      lifecycleRules: lockedBucketRules('break_glass_log'),
    })
    const ownPrefix = `${BREAK_GLASS_KEY_PREFIX}${iamVariable('aws:PrincipalAccount')}/*`
    const breakGlassRoles = {
      StringEquals: { 'aws:PrincipalOrgID': org },
      ArnLike: { 'aws:PrincipalArn': anyBreakGlass },
    }
    const entryStatement = (sid: string, action: string) =>
      new iam.PolicyStatement({
        sid,
        principals: [new iam.AnyPrincipal()],
        actions: [action],
        resources: [`${entriesArn}/${ownPrefix}`],
        conditions: breakGlassRoles,
      })
    entriesBucket.addToResourcePolicy(entryStatement('EntriesWrite', 's3:PutObject'))
    entriesBucket.addToResourcePolicy(entryStatement('EntriesRead', 's3:GetObject'))
    entriesBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'EntriesList',
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:ListBucket'],
        resources: [entriesArn],
        conditions: { ...breakGlassRoles, StringLike: { 's3:prefix': ownPrefix } },
      }),
    )
    entriesBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'ReviewerRead',
        principals: [new iam.ArnPrincipal(accountRoot(account))],
        actions: ['s3:Get*', 's3:List*'],
        resources: [entriesArn, entriesObjectsArn],
        conditions: { ArnLike: { 'aws:PrincipalArn': reviewer } },
      }),
    )
    // Every action but a read or an entry's write, by anyone but this stack's execution role: no
    // retention or legal-hold change, no policy, lifecycle or lock change, no delete (C11-D13).
    entriesBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'OnlyEntryActions',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        notActions: ['s3:Get*', 's3:List*', 's3:PutObject'],
        resources: [entriesArn, entriesObjectsArn],
        conditions: { ArnNotLike: { 'aws:PrincipalArn': execRole } },
      }),
    )

    // The deletion log's archive (C11-D21): locked with no default retention and no lifecycle rule,
    // and read by nobody until C0.17 names its readers. C0.17 adds the shipper's statement, reserved
    // here: an Allow of s3:PutObject under deletion-log/<env>/ to the shipper's role alone, and
    // nothing that reads.
    const archiveBucket = new s3.Bucket(this, 'ArchiveBucket', logBucket('archive', archiveKey))
    archiveBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'NoReadersYet',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:GetObject*'],
        resources: [archiveObjectsArn],
      }),
    )

    const alerts = new OpsAlerts(this, 'OpsAlerts', {
      account,
      alertEmail: config.alertEmail,
      publishers: [
        {
          sid: 'FastAlarms',
          service: 'events.amazonaws.com',
          sourceArn: arnPattern({ service: 'events', region: REGION, account, resource: `rule/${SEC_RULE_PREFIX}*` }),
        },
      ],
    })
    new SecurityServices(this, 'SecurityServices', { topic: alerts.topic, topicPolicy: alerts.policyDependable })
    new BreakGlassRole(this, 'BreakGlass', {
      account,
      kind: 'log-archive',
      logArchiveAccount: account,
      secKeyArn: secKey.keyArn,
    })
    const alarms = new FastAlarms(this, 'FastAlarms', { topic: alerts.topic, rules: ['A1', 'A15'] })
    alarms.node.addDependency(alerts.policyDependable)
    new ssm.StringParameter(this, 'BreakGlassLogBucketName', {
      parameterName: SSM_PARAMETER.breakGlassLogBucket,
      stringValue: logBucketName('breakGlass', account),
      description: 'The bucket break-glass entries are written to (C11-D13)',
    })
  }
}
