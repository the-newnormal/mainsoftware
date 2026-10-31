// The organisation trail and its CloudWatch copy (C11-D17), in Hearth-Foundation: one multi-Region
// trail for every account, delivered to the log-archive account's trail bucket under its hearth-sec
// key, and copied to /hearth/security/org-trail in management, where the assured alarms read it
// (sentinel.ts) and the reviewer queries it. Hand steps first (the set-up runbook): CloudTrail's
// trusted access, and Hearth-LogArchive deployed, since CloudTrail checks the bucket and key policies
// when the trail is made.
//
// The trail is L1: the L2 Trail has no advanced event selectors, wants a key object rather than
// another account's alias, and sets its log group's retention through a Lambda (IG-11). It records:
// - every management event, read and write;
// - the trail bucket's object reads, and its object writes but PutObject, which leaves out
//   CloudTrail's own deliveries (each delivery logged would be delivered and logged again): a delete,
//   a retention or legal-hold call, or any other write (a copy, a multipart upload, a tag or ACL
//   change) is recorded, allowed or denied. A PutObject is recorded for nobody, CloudTrail or anyone
//   else: log file validation shows a delivered file overwritten, but not a file added beside the
//   digests;
// - every object read and write on the break-glass-log and archive buckets.
// The key is named by its alias's ARN in log-archive, since its id exists only once LogArchive deploys
// (TECH-SPEC T24 item 6); whether CloudTrail takes another account's alias at create is proved at the
// first deploy, with a configured key id as the fallback. Insights is off. The copy keeps its class's
// period, standard class (metric filters need it), and can't be deleted while its deletion protection
// is on: management is fenced by no SCP, so it is the one brake (IAC-07).
//
// The reviewer's saved queries live here too: they read the copy, and the reviewer types no
// natural-language query, since generating one is a model action (C11-D06). This file decides what
// the organisation's evidence records, so it is on the owner's-read list (C11-D74).
import * as cdk from 'aws-cdk-lib'
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'
import { arnPattern, bucketArns } from '../config/arns.ts'
import type { LandingZoneConfig } from '../config/env.ts'
import { KEY_ALIAS, logBucketName, QUALIFIER, ROLE, SECURITY_LOG_GROUP, TRAIL_NAME } from '../config/names.ts'
import { REGION } from '../config/profiles.ts'
import { cloudWatchRetention } from '../config/retention.ts'
import { document } from './denies.ts'

// The reviewer's saved queries (C11-D17), each over the copy alone, run once at set-up by the runbook.
export const REVIEW_QUERIES: ReadonlyArray<{ id: string; name: string; query: string }> = [
  {
    id: 'BreakGlassSessions',
    name: 'hearth/review/break-glass-sessions',
    query: [
      'fields @timestamp, recipientAccountId, requestParameters.sourceIdentity, requestParameters.tags.0.value, errorCode',
      `filter eventSource = "sts.amazonaws.com" and eventName = "AssumeRole" and requestParameters.roleArn like /:role\\/${ROLE.breakGlass}$/`,
      'sort @timestamp desc',
    ].join(' | '),
  },
  {
    id: 'AdminSessions',
    name: 'hearth/review/admin-sessions',
    query: [
      'fields @timestamp, recipientAccountId, eventName, requestParameters.roleArn, errorCode',
      `filter (eventName = "AssumeRoleWithSAML" and requestParameters.roleArn like /AWSReservedSSO_Hearth(OrgAdmin|SetUp)_/) or (eventName = "AssumeRole" and requestParameters.roleArn like /:role\\/(${ROLE.oaar}|cdk-${QUALIFIER.base}-[^\\/]+)$/)`,
      'sort @timestamp desc',
    ].join(' | '),
  },
  {
    id: 'DeployRoleSessions',
    name: 'hearth/review/deploy-role-sessions',
    query: [
      'fields @timestamp, recipientAccountId, requestParameters.roleArn, errorCode',
      'filter eventName = "AssumeRoleWithWebIdentity" and requestParameters.roleArn like /:role\\/hearth-gh-/',
      'sort recipientAccountId asc, @timestamp desc',
    ].join(' | '),
  },
  {
    id: 'RootAndAssumeRoot',
    name: 'hearth/review/root-and-assume-root',
    query: [
      'fields @timestamp, recipientAccountId, eventSource, eventName, errorCode',
      'filter (userIdentity.type = "Root" and not ispresent(userIdentity.invokedBy)) or eventName = "AssumeRoot"',
      'sort @timestamp desc',
    ].join(' | '),
  },
  {
    id: 'RecoveryMoves',
    name: 'hearth/review/recovery-moves',
    query: [
      'fields @timestamp, requestParameters.accountId, requestParameters.sourceParentId, requestParameters.destinationParentId, errorCode',
      'filter eventSource = "organizations.amazonaws.com" and eventName = "MoveAccount"',
      'sort @timestamp desc',
    ].join(' | '),
  },
]

// An S3 object data event selector over the buckets' objects, by their ARNs' prefix.
const objectEvents = (prefixes: readonly string[]) => [
  { field: 'eventCategory', equalTo: ['Data'] },
  { field: 'resources.type', equalTo: ['AWS::S3::Object'] },
  { field: 'resources.ARN', startsWith: prefixes.map(prefix => `${prefix}/`) },
]

export interface OrgTrailProps {
  config: LandingZoneConfig
}

export class OrgTrail extends Construct {
  readonly logGroup: logs.LogGroup
  readonly trail: cloudtrail.CfnTrail

  constructor(scope: Construct, id: string, props: OrgTrailProps) {
    super(scope, id)
    const { management, logArchive } = props.config.accounts

    // Retained even when the create that made it rolls back: CloudFormation can't delete a group under
    // deletion protection, so the rollback would fail instead. The set-up runbook's "A first deploy
    // failed" turns the protection off and deletes the empty group by hand before the retry.
    this.logGroup = new logs.LogGroup(this, 'TrailCopy', {
      logGroupName: SECURITY_LOG_GROUP,
      retention: cloudWatchRetention('cloudtrail'),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      logGroupClass: logs.LogGroupClass.STANDARD,
      deletionProtectionEnabled: true,
    })

    // CloudTrail's delivery into the copy: its streams' creation and writes, nothing else.
    const role = new iam.CfnRole(this, 'TrailLogsRole', {
      roleName: ROLE.trailLogs,
      description: "CloudTrail's delivery of the organisation trail to its CloudWatch copy (C11-D17)",
      assumeRolePolicyDocument: document([
        {
          Sid: 'CloudTrail',
          Effect: 'Allow',
          Principal: { Service: 'cloudtrail.amazonaws.com' },
          Action: 'sts:AssumeRole',
          Condition: { StringEquals: { 'aws:SourceAccount': management } },
        },
      ]),
      policies: [
        {
          policyName: ROLE.trailLogs,
          policyDocument: document([
            {
              Sid: 'DeliverToCopy',
              Effect: 'Allow',
              Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
              Resource: arnPattern({
                service: 'logs',
                region: REGION,
                account: management,
                resource: `log-group:${SECURITY_LOG_GROUP}:log-stream:*`,
              }),
            },
          ]),
        },
      ],
    })

    const [trailBucket] = bucketArns(logBucketName('trail', logArchive))
    const [entriesBucket] = bucketArns(logBucketName('breakGlass', logArchive))
    const [archiveBucket] = bucketArns(logBucketName('archive', logArchive))
    this.trail = new cloudtrail.CfnTrail(this, 'OrgTrail', {
      trailName: TRAIL_NAME,
      isLogging: true,
      isOrganizationTrail: true,
      isMultiRegionTrail: true,
      includeGlobalServiceEvents: true,
      enableLogFileValidation: true,
      s3BucketName: logBucketName('trail', logArchive),
      kmsKeyId: arnPattern({ service: 'kms', region: REGION, account: logArchive, resource: KEY_ALIAS.sec }),
      cloudWatchLogsLogGroupArn: this.logGroup.logGroupArn,
      cloudWatchLogsRoleArn: role.attrArn,
      advancedEventSelectors: [
        { name: 'management', fieldSelectors: [{ field: 'eventCategory', equalTo: ['Management'] }] },
        {
          name: 'trail-bucket-reads',
          fieldSelectors: [...objectEvents([trailBucket]), { field: 'readOnly', equalTo: ['true'] }],
        },
        {
          name: 'trail-bucket-writes',
          fieldSelectors: [
            ...objectEvents([trailBucket]),
            { field: 'readOnly', equalTo: ['false'] },
            { field: 'eventName', notEquals: ['PutObject'] },
          ],
        },
        { name: 'log-buckets', fieldSelectors: objectEvents([entriesBucket, archiveBucket]) },
      ],
    })
    this.trail.addResourceDependency(role)
    // Retained once made, but deleted when the create that made it rolls back, so a failed first
    // deploy leaves no trail behind to refuse its retry by name.
    this.trail.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE)

    for (const query of REVIEW_QUERIES) {
      new logs.CfnQueryDefinition(this, query.id, {
        name: query.name,
        queryLanguage: 'CWLI',
        queryString: query.query,
        logGroupNames: [SECURITY_LOG_GROUP],
      })
    }
  }
}
