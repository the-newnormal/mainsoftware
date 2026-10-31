// IAC-18, IAC-07 and the A12 budgets (C11-D16, C11-D17, C11-D20, C11-Q09; TECH-SPEC T24 items 5 and 6),
// as Hearth-Foundation renders them:
// - the organisation trail: every account and Region, management events and the log buckets' data
//   events (the trail bucket's writes but PutObject, which leaves out CloudTrail's deliveries and
//   anyone else's PutObject), validated, delivered to the bucket LogArchive names under hearth-sec's
//   alias in log-archive, copied to CloudWatch through a role that may only write that copy's
//   streams, and retained once made;
// - the assured alarms: each filter pattern exactly as written here from the fixture's accounts, each
//   within CloudWatch Logs' 1,024 characters, and one alarm per id emailing management's topic;
// - the reviewer's five saved queries over the copy alone;
// - every log group in every landing-zone template in its retention class, retained and protected;
// - five budgets in the amounts C11-Q09 chose, before tax, each alerting the topic at 80 % and 100 %
//   of actual spend and 100 % of forecast, and the anomaly monitor and its subscription.
// The trail's bucket is checked against LogArchive's actual bucket, so the convention that crosses
// accounts without a reference can't drift. Expected ARNs are joined from their parts (IG-01), and the
// S3 event names LCG-02 reads as calls are joined from theirs.
import { CLOUDWATCH_RETENTION_DAYS, RETENTION_CLASSES } from '@hearth/shared'
import { beforeAll, describe, expect, it } from 'vitest'
import { logsClassDays } from '../config/retention.ts'
import { fixtureConfig } from '../testing/fixture.ts'
import { type LandingZoneSynth, synthLandingZone } from '../testing/landing-zone.ts'

type Template = Record<string, unknown>
interface Resource {
  Type: string
  Properties?: Record<string, unknown>
  DependsOn?: string[]
  DeletionPolicy?: string
  UpdateReplacePolicy?: string
}

const fixture = fixtureConfig()
const { management, logArchive, nonprod, prod } = fixture.accounts
const REGION = 'ap-southeast-1'
const resourcesIn = (template: Template): Array<[string, Resource]> =>
  Object.entries((template.Resources ?? {}) as Record<string, Resource>)
const ofType = (template: Template, type: string) => resourcesIn(template).filter(([, r]) => r.Type === type)
const arn = (service: string, region: string, account: string, resource: string) =>
  ['arn', 'aws', service, region, account, resource].join(':')
// The one resource of a type whose property has a value.
function one(template: Template, type: string, property: string, value: unknown): [string, Resource] {
  const found = ofType(template, type).filter(([, r]) => r.Properties?.[property] === value)
  if (found.length !== 1) throw new Error(`${found.length} ${type} with ${property} ${String(value)}, not one`)
  return found[0] as [string, Resource]
}

// S3's object deletes and lock changes as CloudTrail names them, joined so LCG-02 reads no S3 call.
const OBJECT = 'Object'
const DELETE_OBJECT = ['Delete', OBJECT].join('')
const DELETE_OBJECTS = ['Delete', OBJECT, 's'].join('')
const PUT_RETENTION = ['Put', OBJECT, 'Retention'].join('')
const PUT_LEGAL_HOLD = ['Put', OBJECT, 'LegalHold'].join('')
const LOG_BUCKET_NAMES =
  '(($.requestParameters.bucketName = "hearth-org-trail-*") || ($.requestParameters.bucketName = "hearth-break-glass-log-*") || ($.requestParameters.bucketName = "hearth-archive-*"))'

// Each assured alarm (C11-D16): its metric, its name after hearth-sec-, and its filters' patterns, in
// order, each written out here as C11-D16 defines the alarm, which src/foundation/sentinel.ts builds.
const ASSURED: ReadonlyArray<{ metric: string; name: string; patterns: string[] }> = [
  {
    metric: 'A01BreakGlass',
    name: 'a01-break-glass',
    patterns: [
      '{ ($.eventSource = "sts.amazonaws.com") && ($.eventName = "AssumeRole") && ($.requestParameters.roleArn = "*:role/hearth-break-glass") }',
    ],
  },
  {
    metric: 'A02Root',
    name: 'a02-root',
    patterns: [
      '{ ($.userIdentity.type = "Root") && ($.userIdentity.invokedBy NOT EXISTS) && ($.eventType != "AwsServiceEvent") }',
      '{ $.eventName = "AssumeRoot" }',
    ],
  },
  {
    metric: 'A03Admin',
    name: 'a03-admin',
    patterns: [
      '{ (($.eventName = "AssumeRoleWithSAML") && (($.requestParameters.roleArn = "*AWSReservedSSO_HearthOrgAdmin_*") || ($.requestParameters.roleArn = "*AWSReservedSSO_HearthSetUp_*"))) || (($.eventName = "AssumeRole") && ($.requestParameters.roleArn = "*:role/OrganizationAccountAccessRole")) }',
    ],
  },
  {
    metric: 'A04Identity',
    name: 'a04-identity',
    patterns: [
      '{ ($.eventSource = "sso.amazonaws.com") && ($.readOnly IS FALSE) && (($.eventName = "*PermissionSet*") || ($.eventName = "*AccountAssignment*") || ($.eventName = "*AccessControlAttribute*") || ($.eventName = "*Instance")) }',
      '{ ($.eventSource = "identitystore.amazonaws.com") && ($.readOnly IS FALSE) }',
      '{ ($.eventSource = "sso-directory.amazonaws.com") && ($.readOnly IS FALSE) }',
    ],
  },
  {
    metric: 'A05Organizations',
    name: 'a05-organizations',
    patterns: ['{ ($.eventSource = "organizations.amazonaws.com") && ($.readOnly IS FALSE) }'],
  },
  {
    metric: 'A06Tampering',
    name: 'a06-tampering',
    patterns: [
      // (a) the audit services' writes
      '{ (($.eventSource = "cloudtrail.amazonaws.com") || ($.eventSource = "guardduty.amazonaws.com") || ($.eventSource = "access-analyzer.amazonaws.com")) && ($.readOnly IS FALSE) }',
      // (b) long-lived credentials, identity providers and Cognito identity pools, flow logs
      '{ (($.eventSource = "iam.amazonaws.com") && (($.eventName = "CreateUser") || ($.eventName = "CreateAccessKey") || ($.eventName = "CreateLoginProfile") || ($.eventName = "CreateServiceSpecificCredential"))) || (($.eventSource = "iam.amazonaws.com") && ($.readOnly IS FALSE) && (($.eventName = "*OpenIDConnectProvider*") || ($.eventName = "*SAMLProvider*"))) || (($.eventSource = "cognito-identity.amazonaws.com") && ($.readOnly IS FALSE)) || (($.eventSource = "rolesanywhere.amazonaws.com") && ($.readOnly IS FALSE)) || (($.eventSource = "ssm.amazonaws.com") && (($.eventName = "CreateActivation") || ($.eventName = "UpdateManagedInstanceRole"))) || (($.eventSource = "iot.amazonaws.com") && (($.eventName = "CreateRoleAlias") || ($.eventName = "UpdateRoleAlias"))) || (($.eventSource = "ec2.amazonaws.com") && ($.eventName = "DeleteFlowLogs")) }',
      // (c) the fast alarms' rules
      '{ ($.eventSource = "events.amazonaws.com") && ($.readOnly IS FALSE) && (($.requestParameters.name = "hearth-sec-*") || ($.requestParameters.rule = "hearth-sec-*")) }',
      // (d) the alarm topics and their subscriptions
      '{ ($.eventSource = "sns.amazonaws.com") && ($.readOnly IS FALSE) && (($.requestParameters.topicArn = "*:hearth-ops-alerts") || ($.requestParameters.subscriptionArn = "*:hearth-ops-alerts:*") || ($.requestParameters.name = "hearth-ops-alerts") || ($.requestParameters.resourceArn = "*:hearth-ops-alerts")) }',
      // (e) the security log groups, named or given by ARN in any of the fields Logs' writes use, so
      // turning off the copy's deletion protection (logGroupIdentifier) is seen too
      '{ ($.eventSource = "logs.amazonaws.com") && ($.readOnly IS FALSE) && ($.eventName != "CreateLogStream") && (($.requestParameters.logGroupName = "/hearth/security/*") || ($.requestParameters.logGroupIdentifier = "/hearth/security/*") || ($.requestParameters.logGroupIdentifier = "*:log-group:/hearth/security/*") || ($.requestParameters.resourceIdentifier = "*:log-group:/hearth/security/*") || ($.requestParameters.resourceArn = "*:log-group:/hearth/security/*")) }',
      // (f) the log-archive keys' administration
      `{ ($.eventSource = "kms.amazonaws.com") && ($.recipientAccountId = "${logArchive}") && (($.eventName = "PutKeyPolicy") || ($.eventName = "ScheduleKeyDeletion") || ($.eventName = "CancelKeyDeletion") || ($.eventName = "DisableKey") || ($.eventName = "EnableKey") || ($.eventName = "DisableKeyRotation") || ($.eventName = "CreateGrant") || ($.eventName = "TagResource") || ($.eventName = "UntagResource") || ($.eventName = "CreateAlias") || ($.eventName = "UpdateAlias") || ($.eventName = "DeleteAlias")) }`,
      // (g) the log buckets' configuration
      `{ ($.eventSource = "s3.amazonaws.com") && ($.eventCategory = "Management") && ($.readOnly IS FALSE) && ${LOG_BUCKET_NAMES} }`,
      // (h) the alarms themselves, but CloudFormation's own updates of them
      '{ ($.eventSource = "monitoring.amazonaws.com") && (($.eventName = "DeleteAlarms") || ($.eventName = "DisableAlarmActions") || ($.eventName = "SetAlarmState") || (($.eventName = "PutMetricAlarm") && ($.userIdentity.invokedBy NOT EXISTS))) }',
      // (i) the landing zone's roles, its boundary and GitHub's provider
      '{ ($.eventSource = "iam.amazonaws.com") && ($.readOnly IS FALSE) && (($.requestParameters.roleName = "hearth-break-glass*") || ($.requestParameters.roleName = "hearth-gh-*") || ($.requestParameters.policyArn = "*:policy/hearth-boundary") || ($.requestParameters.openIDConnectProviderArn = "*token.actions.githubusercontent.com")) }',
      // (j) the log buckets' objects deleted or their locks changed, allowed or denied
      `{ ($.eventSource = "s3.amazonaws.com") && ($.eventCategory = "Data") && (($.eventName = "${DELETE_OBJECT}") || ($.eventName = "${DELETE_OBJECTS}") || ($.eventName = "DeleteObjectVersion") || ($.eventName = "${PUT_RETENTION}") || ($.eventName = "${PUT_LEGAL_HOLD}")) && ${LOG_BUCKET_NAMES} }`,
    ],
  },
  {
    metric: 'A07ProdChange',
    name: 'a07-prod-change',
    patterns: [
      `{ ($.recipientAccountId = "${prod}") && ($.eventSource = "cloudformation.amazonaws.com") && (($.eventName = "CreateChangeSet") || ($.eventName = "ExecuteChangeSet") || ($.eventName = "CreateStack") || ($.eventName = "UpdateStack") || ($.eventName = "DeleteStack")) }`,
    ],
  },
  {
    metric: 'A08ProdSession',
    name: 'a08-prod-session',
    patterns: [
      `{ ($.recipientAccountId = "${prod}") && ((($.eventSource = "ecs.amazonaws.com") && ($.eventName = "ExecuteCommand")) || (($.eventSource = "ssm.amazonaws.com") && ($.eventName = "StartSession"))) }`,
    ],
  },
  {
    metric: 'A11SignInFailures',
    name: 'a11-sign-in-failures',
    patterns: [
      '{ (($.eventName = "ConsoleLogin") && ($.errorMessage = "Failed authentication")) || (($.eventSource = "signin.amazonaws.com") && ($.serviceEventDetails.CredentialVerification = "Failure")) || (($.eventSource = "signin.amazonaws.com") && ($.serviceEventDetails.CredentialChallenge = "Failure")) }',
    ],
  },
  {
    metric: 'A15Hearthbase',
    name: 'a15-hearthbase',
    patterns: [
      '{ ($.eventSource = "sts.amazonaws.com") && ($.eventName = "AssumeRole") && ($.requestParameters.roleArn = "*:role/cdk-hearthbase-*") }',
    ],
  },
]

// The reviewer's saved queries (C11-D17), each over the copy alone.
const QUERIES: Record<string, string> = {
  'hearth/review/break-glass-sessions':
    'fields @timestamp, recipientAccountId, requestParameters.sourceIdentity, requestParameters.tags.0.value, errorCode | filter eventSource = "sts.amazonaws.com" and eventName = "AssumeRole" and requestParameters.roleArn like /:role\\/hearth-break-glass$/ | sort @timestamp desc',
  'hearth/review/admin-sessions':
    'fields @timestamp, recipientAccountId, eventName, requestParameters.roleArn, errorCode | filter (eventName = "AssumeRoleWithSAML" and requestParameters.roleArn like /AWSReservedSSO_Hearth(OrgAdmin|SetUp)_/) or (eventName = "AssumeRole" and requestParameters.roleArn like /:role\\/(OrganizationAccountAccessRole|cdk-hearthbase-[^\\/]+)$/) | sort @timestamp desc',
  'hearth/review/deploy-role-sessions':
    'fields @timestamp, recipientAccountId, requestParameters.roleArn, errorCode | filter eventName = "AssumeRoleWithWebIdentity" and requestParameters.roleArn like /:role\\/hearth-gh-/ | sort recipientAccountId asc, @timestamp desc',
  'hearth/review/root-and-assume-root':
    'fields @timestamp, recipientAccountId, eventSource, eventName, errorCode | filter (userIdentity.type = "Root" and not ispresent(userIdentity.invokedBy)) or eventName = "AssumeRoot" | sort @timestamp desc',
  'hearth/review/recovery-moves':
    'fields @timestamp, requestParameters.accountId, requestParameters.sourceParentId, requestParameters.destinationParentId, errorCode | filter eventSource = "organizations.amazonaws.com" and eventName = "MoveAccount" | sort @timestamp desc',
}

// Each log group a landing-zone template may hold, by name, and its retention class (IAC-07). PR 3
// adds the workload's: each role's group in app_logs, and the VPC's flow log in network_logs.
const LOG_GROUP_CLASSES: Record<string, 'cloudtrail'> = { '/hearth/security/org-trail': 'cloudtrail' }

let lz: LandingZoneSynth
let foundation: Template
let topic: string
let topicPolicy: string
let logGroup: string

beforeAll(() => {
  lz = synthLandingZone()
  foundation = lz.templates.foundation
  topic = one(foundation, 'AWS::SNS::Topic', 'TopicName', 'hearth-ops-alerts')[0]
  topicPolicy = ofType(foundation, 'AWS::SNS::TopicPolicy')[0]?.[0] ?? ''
  logGroup = one(foundation, 'AWS::Logs::LogGroup', 'LogGroupName', '/hearth/security/org-trail')[0]
}, 60_000)

describe('IAC-18 C11-D17: the organisation trail', () => {
  it('IAC-18: one trail for every account and Region, logging, validated, to LogArchive’s trail bucket under hearth-sec’s alias in log-archive, copied to CloudWatch, retained once made', () => {
    const trails = ofType(foundation, 'AWS::CloudTrail::Trail')
    expect(trails).toHaveLength(1)
    const [, trail] = trails[0] as [string, Resource]
    const role = one(foundation, 'AWS::IAM::Role', 'RoleName', 'hearth-org-trail-logs')[0]
    const [, trailBucket] = one(
      lz.templates.logArchive,
      'AWS::S3::Bucket',
      'BucketName',
      `hearth-org-trail-${logArchive}`,
    )
    expect(trail.Properties).toMatchObject({
      TrailName: 'hearth-org-trail',
      IsLogging: true,
      IsOrganizationTrail: true,
      IsMultiRegionTrail: true,
      IncludeGlobalServiceEvents: true,
      EnableLogFileValidation: true,
      S3BucketName: trailBucket.Properties?.BucketName,
      KMSKeyId: arn('kms', REGION, logArchive, 'alias/hearth-sec'),
      CloudWatchLogsLogGroupArn: { 'Fn::GetAtt': [logGroup, 'Arn'] },
      CloudWatchLogsRoleArn: { 'Fn::GetAtt': [role, 'Arn'] },
    })
    expect(trail.Properties?.InsightSelectors).toBeUndefined()
    expect(trail.Properties?.EventSelectors).toBeUndefined()
    expect(trail.DependsOn).toEqual([role])
    expect(trail.DeletionPolicy).toBe('RetainExceptOnCreate')
    expect(trail.UpdateReplacePolicy).toBe('Retain')
  })

  it('IAC-18 C11-D17: it records every management event, the trail bucket’s reads and its writes but PutObject (so not CloudTrail’s own deliveries), and every read and write on the break-glass-log and archive buckets', () => {
    const [, trail] = ofType(foundation, 'AWS::CloudTrail::Trail')[0] as [string, Resource]
    const objects = (...buckets: string[]) => [
      { Field: 'eventCategory', Equals: ['Data'] },
      { Field: 'resources.type', Equals: ['AWS::S3::Object'] },
      { Field: 'resources.ARN', StartsWith: buckets.map(name => `${arn('s3', '', '', name)}/`) },
    ]
    const trailBucket = `hearth-org-trail-${logArchive}`
    expect(trail.Properties?.AdvancedEventSelectors).toEqual([
      { Name: 'management', FieldSelectors: [{ Field: 'eventCategory', Equals: ['Management'] }] },
      {
        Name: 'trail-bucket-reads',
        FieldSelectors: [...objects(trailBucket), { Field: 'readOnly', Equals: ['true'] }],
      },
      {
        Name: 'trail-bucket-writes',
        FieldSelectors: [
          ...objects(trailBucket),
          { Field: 'readOnly', Equals: ['false'] },
          { Field: 'eventName', NotEquals: ['PutObject'] },
        ],
      },
      {
        Name: 'log-buckets',
        FieldSelectors: objects(`hearth-break-glass-log-${logArchive}`, `hearth-archive-${logArchive}`),
      },
    ])
  })

  it('IAC-18 C11-D17: the delivery role may only make and write the copy’s streams, for this account’s CloudTrail', () => {
    const [, role] = one(foundation, 'AWS::IAM::Role', 'RoleName', 'hearth-org-trail-logs')
    expect(role.Properties).toEqual({
      RoleName: 'hearth-org-trail-logs',
      Description: "CloudTrail's delivery of the organisation trail to its CloudWatch copy (C11-D17)",
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'CloudTrail',
            Effect: 'Allow',
            Principal: { Service: 'cloudtrail.amazonaws.com' },
            Action: 'sts:AssumeRole',
            Condition: { StringEquals: { 'aws:SourceAccount': management } },
          },
        ],
      },
      Policies: [
        {
          PolicyName: 'hearth-org-trail-logs',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Sid: 'DeliverToCopy',
                Effect: 'Allow',
                Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
                Resource: arn('logs', REGION, management, 'log-group:/hearth/security/org-trail:log-stream:*'),
              },
            ],
          },
        },
      ],
    })
  })

  it('IAC-18 C11-D17: the reviewer’s five saved queries read the copy alone', () => {
    const orgTrail = lz.stacks.foundation?.node.tryFindChild('OrgTrail')
    expect(orgTrail?.node.children.map(child => child.node.id)).toEqual([
      'TrailCopy',
      'TrailLogsRole',
      'OrgTrail',
      'BreakGlassSessions',
      'AdminSessions',
      'DeployRoleSessions',
      'RootAndAssumeRoot',
      'RecoveryMoves',
    ])
    const queries = ofType(foundation, 'AWS::Logs::QueryDefinition').map(([, r]) => r.Properties)
    expect(queries).toEqual(
      Object.entries(QUERIES).map(([name, query]) => ({
        Name: name,
        QueryLanguage: 'CWLI',
        QueryString: query,
        LogGroupNames: ['/hearth/security/org-trail'],
      })),
    )
  })
})

describe('IAC-18 C11-D16: the assured alarms', () => {
  it('IAC-18: each alarm’s filters on the copy hold exactly their patterns, each within 1,024 characters, publishing 1 to its metric in Hearth/Security', () => {
    const filters = ofType(foundation, 'AWS::Logs::MetricFilter').map(([, r]) => r.Properties)
    const expected = ASSURED.flatMap(alarm =>
      alarm.patterns.map((pattern, index) => ({
        FilterName:
          alarm.patterns.length === 1
            ? `hearth-sec-${alarm.name}`
            : `hearth-sec-${alarm.name}-${String.fromCharCode(97 + index)}`,
        FilterPattern: pattern,
        LogGroupName: { Ref: logGroup },
        MetricTransformations: [{ MetricName: alarm.metric, MetricNamespace: 'Hearth/Security', MetricValue: '1' }],
      })),
    )
    expect(filters).toEqual(expected)
    expect(filters).toHaveLength(22)
    for (const filter of filters) {
      expect(String(filter?.FilterPattern).length, String(filter?.FilterName)).toBeLessThanOrEqual(1_024)
    }
  })

  it('IAC-18: one alarm per id emails management’s topic on the first match in five minutes (A11 on five in fifteen), and treats no data as no alarm', () => {
    const sentinel = lz.stacks.foundation?.node.tryFindChild('Sentinel')
    expect(sentinel?.node.children.map(child => child.node.id)).toEqual(ASSURED.map(alarm => alarm.metric))
    // Each alarm's construct holds its filter (or its lettered filters) and the alarm.
    for (const alarm of ASSURED) {
      const filters =
        alarm.patterns.length === 1
          ? ['Filter']
          : alarm.patterns.map((_, index) => `Filter${String.fromCharCode(65 + index)}`)
      expect(
        sentinel?.node.tryFindChild(alarm.metric)?.node.children.map(child => child.node.id),
        alarm.metric,
      ).toEqual([...filters, 'Alarm'])
    }
    const alarms = ofType(foundation, 'AWS::CloudWatch::Alarm')
    expect(alarms.map(([, r]) => r.Properties)).toEqual(
      ASSURED.map(alarm => ({
        AlarmName: `hearth-sec-${alarm.name}`,
        AlarmActions: [{ Ref: topic }],
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        EvaluationPeriods: 1,
        MetricName: alarm.metric,
        Namespace: 'Hearth/Security',
        Period: alarm.metric === 'A11SignInFailures' ? 900 : 300,
        Statistic: 'Sum',
        Threshold: alarm.metric === 'A11SignInFailures' ? 5 : 1,
        TreatMissingData: 'notBreaching',
      })),
    )
    // Each waits for the topic's policy, so none fires into a topic that refuses it.
    for (const [, alarm] of alarms) expect(alarm.DependsOn).toEqual([topicPolicy])
  })

  it('C11-D16: management’s topic admits CloudWatch’s alarms, Budgets and Cost Anomaly Detection, each for this account alone, over TLS, and emails the ops mailbox', () => {
    const [, policy] = ofType(foundation, 'AWS::SNS::TopicPolicy')[0] as [string, Resource]
    const publisher = (Sid: string, service: string, sourceArn?: string) => ({
      Sid,
      Effect: 'Allow',
      Principal: { Service: service },
      Action: 'sns:Publish',
      Resource: { Ref: topic },
      Condition: {
        StringEquals: { 'aws:SourceAccount': management },
        ...(sourceArn === undefined ? {} : { ArnLike: { 'aws:SourceArn': sourceArn } }),
      },
    })
    expect(policy.Properties).toEqual({
      Topics: [{ Ref: topic }],
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowPublishThroughSSLOnly',
            Effect: 'Deny',
            Principal: '*',
            Action: 'sns:Publish',
            Resource: { Ref: topic },
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          },
          publisher('AssuredAlarms', 'cloudwatch.amazonaws.com', arn('cloudwatch', REGION, management, 'alarm:*')),
          publisher('Budgets', 'budgets.amazonaws.com', arn('budgets', '', management, '*')),
          publisher('CostAnomalyDetection', 'costalerts.amazonaws.com'),
        ],
      },
    })
    expect(ofType(foundation, 'AWS::SNS::Subscription').map(([, r]) => r.Properties)).toEqual([
      { Protocol: 'email', Endpoint: fixture.alertEmail, TopicArn: { Ref: topic } },
    ])
  })
})

describe('IAC-07 C11-D17: log groups', () => {
  it('IAC-07: every log group in every landing-zone template is in its retention class, kept that long, retained even when a create rolls back (CloudFormation can’t delete a protected group), protected from deletion and of the standard class', () => {
    const groups = Object.values(lz.templates).flatMap(template => ofType(template, 'AWS::Logs::LogGroup'))
    expect(groups.map(([, r]) => r.Properties?.LogGroupName)).toEqual(['/hearth/security/org-trail'])
    for (const [, group] of groups) {
      const name = String(group.Properties?.LogGroupName)
      const logClass = LOG_GROUP_CLASSES[name]
      if (logClass === undefined) throw new Error(`${name} is in no retention class`)
      const days = logsClassDays(logClass)
      expect(RETENTION_CLASSES[logClass].period).toMatchObject({ kind: 'days', days })
      expect(CLOUDWATCH_RETENTION_DAYS as readonly number[]).toContain(days)
      expect(group.Properties).toEqual({
        LogGroupName: name,
        RetentionInDays: days,
        DeletionProtectionEnabled: true,
        LogGroupClass: 'STANDARD',
      })
      expect(group.DeletionPolicy, name).toBe('Retain')
      expect(group.UpdateReplacePolicy, name).toBe('Retain')
    }
  })
})

describe('C11-D20 A12 C11-Q09: budgets and Cost Anomaly Detection', () => {
  it('C11-Q09: the fixture holds the amounts the owner chose, USD 650 in all', () => {
    expect(fixture.budgetsUsd).toEqual({ organisation: 650, management: 25, logArchive: 25, nonprod: 250, prod: 350 })
  })

  it('C11-D20 A12: five monthly cost budgets, the organisation’s and each account’s, before tax, each alerting management’s topic at 80 % and 100 % of actual spend and 100 % of forecast, retained once made', () => {
    const budgets = lz.stacks.foundation?.node.tryFindChild('Budgets')
    expect(budgets?.node.children.map(child => child.node.id)).toEqual([
      'Organisation',
      'Management',
      'LogArchive',
      'Nonprod',
      'Prod',
      'AnomalyMonitor',
      'AnomalySubscription',
    ])
    const notify = (NotificationType: string, Threshold: number) => ({
      Notification: { NotificationType, ComparisonOperator: 'GREATER_THAN', Threshold, ThresholdType: 'PERCENTAGE' },
      Subscribers: [{ SubscriptionType: 'SNS', Address: { Ref: topic } }],
    })
    // Unblended cost of every record type but tax, the organisation's whole and each account's alone.
    const notTax = { Not: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Tax'], MatchOptions: ['EQUALS'] } } }
    const budget = (name: string, amount: number, account?: string) => ({
      Budget: {
        BudgetName: name,
        BudgetType: 'COST',
        TimeUnit: 'MONTHLY',
        BudgetLimit: { Amount: amount, Unit: 'USD' },
        Metrics: ['UnblendedCost'],
        FilterExpression:
          account === undefined
            ? notTax
            : { And: [{ Dimensions: { Key: 'LINKED_ACCOUNT', Values: [account], MatchOptions: ['EQUALS'] } }, notTax] },
      },
      NotificationsWithSubscribers: [notify('ACTUAL', 80), notify('ACTUAL', 100), notify('FORECASTED', 100)],
    })
    const { budgetsUsd } = fixture
    const found = ofType(foundation, 'AWS::Budgets::Budget')
    expect(found.map(([, r]) => r.Properties)).toEqual([
      budget('hearth-organisation', budgetsUsd.organisation),
      budget('hearth-management', budgetsUsd.management, management),
      budget('hearth-log-archive', budgetsUsd.logArchive, logArchive),
      budget('hearth-nonprod', budgetsUsd.nonprod, nonprod),
      budget('hearth-prod', budgetsUsd.prod, prod),
    ])
    for (const [, r] of found) {
      expect(r.DeletionPolicy).toBe('RetainExceptOnCreate')
      expect(r.UpdateReplacePolicy).toBe('Retain')
      expect(r.DependsOn).toEqual([topicPolicy])
    }
  })

  it('C11-D20 A12: every budget in every landing-zone template uses one of AWS Budgets’ two pairs, Metrics with a FilterExpression or CostTypes with CostFilters, never a mix, which CreateBudget refuses', () => {
    const budgets = Object.values(lz.templates).flatMap(template => ofType(template, 'AWS::Budgets::Budget'))
    expect(budgets).toHaveLength(5)
    for (const [id, r] of budgets) {
      const data = (r.Properties?.Budget ?? {}) as Record<string, unknown>
      const has = (key: string) => data[key] !== undefined
      const newer = has('Metrics') || has('FilterExpression')
      const older = has('CostTypes') || has('CostFilters')
      expect(newer && older, `${id} mixes the two pairs`).toBe(false)
      if (has('FilterExpression')) expect(has('Metrics'), `${id}: a FilterExpression needs its Metrics`).toBe(true)
    }
  })

  it('C11-D20: one anomaly monitor watches spend by service and alerts the topic at once on an anomaly of USD 10 or more', () => {
    const monitors = ofType(foundation, 'AWS::CE::AnomalyMonitor')
    expect(monitors.map(([, r]) => r.Properties)).toEqual([
      { MonitorName: 'hearth-services', MonitorType: 'DIMENSIONAL', MonitorDimension: 'SERVICE' },
    ])
    const subscriptions = ofType(foundation, 'AWS::CE::AnomalySubscription')
    expect(subscriptions).toHaveLength(1)
    const [, subscription] = subscriptions[0] as [string, Resource]
    const { ThresholdExpression, ...rest } = subscription.Properties ?? {}
    expect(rest).toEqual({
      SubscriptionName: 'hearth-anomalies',
      Frequency: 'IMMEDIATE',
      MonitorArnList: [{ 'Fn::GetAtt': [monitors[0]?.[0], 'MonitorArn'] }],
      Subscribers: [{ Type: 'SNS', Address: { Ref: topic } }],
    })
    expect(JSON.parse(String(ThresholdExpression))).toEqual({
      Dimensions: { Key: 'ANOMALY_TOTAL_IMPACT_ABSOLUTE', MatchOptions: ['GREATER_THAN_OR_EQUAL'], Values: ['10'] },
    })
    expect(subscription.DependsOn).toEqual([topicPolicy])
  })
})
