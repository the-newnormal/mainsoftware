// The assured alarms (C11-D16), in Hearth-Foundation: metric filters on the organisation trail's
// CloudWatch copy (org-trail.ts) and one alarm each, emailing management's hearth-ops-alerts topic.
// They see every account's calls, a member account's fast rule or not, so they are the path that holds
// when a fast rule's delivery fails (TECH-SPEC T24 item 5):
// - A1 break-glass assumed, refused attempts included (C11-D11);
// - A2 a root sign-in or action, or a centralised root session;
// - A3 an administrator session: HearthOrgAdmin, the first deploys' HearthSetUp, or
//   OrganizationAccountAccessRole;
// - A4 Identity Center changed: permission sets, assignments, the attribute for access control, the
//   instance, the identity store or the directory;
// - A5 any write to Organizations;
// - A6 tampering: the audit services' writes; long-lived credentials, a new or changed identity
//   provider or Cognito identity pool, a deleted flow log; the fast alarms' rules, topics and log
//   groups; the log-archive keys' administration; the log buckets' configuration and their objects'
//   deletes and lock changes, allowed or denied; the alarms themselves; and IAM writes to the
//   break-glass and GitHub roles, the boundary and GitHub's provider;
// - A7 a CloudFormation change in prod, whatever the stack; A8 a session into prod's tasks;
// - A11 five failed sign-ins in fifteen minutes; A15 a hearthbase role assumed (C11-D26).
// A9, A10 and A14 are fast rules in log-archive and the Baselines; A12 is the budgets (budgets.ts).
// The accounts the patterns name are configuration, written into the template at synth. A pattern
// holds at most 1,024 characters, so an alarm may have several filters publishing one metric, and each
// is proved against recorded events by a person with `aws logs test-metric-filter` (the set-up
// runbook). This file decides what wakes someone, so it is on the owner's-read list (C11-D74).
import * as cdk from 'aws-cdk-lib'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'
import type { OpsAlerts } from '../baseline/ops-alerts.ts'
import type { LandingZoneConfig } from '../config/env.ts'
import {
  BOUNDARY,
  GITHUB_OIDC_HOST,
  LOG_BUCKET_PREFIX,
  OPS_TOPIC,
  PERMISSION_SET,
  QUALIFIER,
  ROLE,
  SEC_RULE_PREFIX,
  SECURITY_LOG_GROUP_PREFIX,
} from '../config/names.ts'

// The namespace every filter publishes to.
export const SECURITY_NAMESPACE = 'Hearth/Security'

// CloudWatch Logs' limit on one filter pattern, in characters.
const PATTERN_LIMIT = 1_024

export interface AssuredAlarm {
  // The construct id and the metric's name.
  metric: string
  // The alarm's name after hearth-sec-.
  name: string
  // One filter per pattern, each publishing 1 to the metric.
  patterns: readonly string[]
  // The alarm's period in minutes and its threshold: 5 and 1 unless said.
  periodMinutes?: number
  threshold?: number
}

// `a || b || …` and `a && b && …`, each part in brackets.
const any = (...parts: string[]) => parts.map(part => `(${part})`).join(' || ')
const all = (...parts: string[]) => parts.map(part => `(${part})`).join(' && ')
// A field equal to a value (`*` matches any run of characters).
const is = (field: string, value: string) => `$.${field} = "${value}"`
// A field equal to one of the values.
const oneOf = (field: string, values: readonly string[]) => any(...values.map(value => is(field, value)))
const WRITE = '$.readOnly IS FALSE'

// S3's object deletes and lock changes, written from parts: LCG-02 reads their names in any string as
// S3 calls, and these are event names a filter matches, never calls (C11-D08).
const OBJECT = 'Object'
const S3_OBJECT_CHANGES = [
  ['Delete', OBJECT].join(''),
  ['Delete', OBJECT, 's'].join(''),
  'DeleteObjectVersion',
  ['Put', OBJECT, 'Retention'].join(''),
  ['Put', OBJECT, 'LegalHold'].join(''),
]

// The log-archive buckets, by name pattern (their names end in log-archive's account id).
const LOG_BUCKETS = Object.values(LOG_BUCKET_PREFIX).map(prefix => `${prefix}*`)

// The key administration A6 watches in the log-archive account (C11-D05, C11-D17).
const KEY_ADMINISTRATION = [
  'PutKeyPolicy',
  'ScheduleKeyDeletion',
  'CancelKeyDeletion',
  'DisableKey',
  'EnableKey',
  'DisableKeyRotation',
  'CreateGrant',
  'TagResource',
  'UntagResource',
  'CreateAlias',
  'UpdateAlias',
  'DeleteAlias',
]

// The assured alarms and their patterns (C11-D16; TECH-SPEC T24 item 5).
export function assuredAlarms(config: LandingZoneConfig): AssuredAlarm[] {
  const { prod, logArchive } = config.accounts
  const assumeRole = (role: string) =>
    `{ ${all(is('eventSource', 'sts.amazonaws.com'), is('eventName', 'AssumeRole'), is('requestParameters.roleArn', `*:role/${role}`))} }`
  return [
    { metric: 'A01BreakGlass', name: 'a01-break-glass', patterns: [assumeRole(ROLE.breakGlass)] },
    {
      metric: 'A02Root',
      name: 'a02-root',
      patterns: [
        `{ ${all(is('userIdentity.type', 'Root'), '$.userIdentity.invokedBy NOT EXISTS', '$.eventType != "AwsServiceEvent"')} }`,
        `{ ${is('eventName', 'AssumeRoot')} }`,
      ],
    },
    {
      metric: 'A03Admin',
      name: 'a03-admin',
      patterns: [
        `{ ${any(
          all(
            is('eventName', 'AssumeRoleWithSAML'),
            oneOf('requestParameters.roleArn', [
              `*AWSReservedSSO_${PERMISSION_SET.orgAdmin}_*`,
              `*AWSReservedSSO_${PERMISSION_SET.setUp}_*`,
            ]),
          ),
          all(is('eventName', 'AssumeRole'), is('requestParameters.roleArn', `*:role/${ROLE.oaar}`)),
        )} }`,
      ],
    },
    {
      metric: 'A04Identity',
      name: 'a04-identity',
      patterns: [
        `{ ${all(
          is('eventSource', 'sso.amazonaws.com'),
          WRITE,
          oneOf('eventName', ['*PermissionSet*', '*AccountAssignment*', '*AccessControlAttribute*', '*Instance']),
        )} }`,
        `{ ${all(is('eventSource', 'identitystore.amazonaws.com'), WRITE)} }`,
        `{ ${all(is('eventSource', 'sso-directory.amazonaws.com'), WRITE)} }`,
      ],
    },
    {
      metric: 'A05Organizations',
      name: 'a05-organizations',
      patterns: [`{ ${all(is('eventSource', 'organizations.amazonaws.com'), WRITE)} }`],
    },
    {
      metric: 'A06Tampering',
      name: 'a06-tampering',
      patterns: [
        // (a) the audit services' writes
        `{ ${all(
          oneOf('eventSource', [
            'cloudtrail.amazonaws.com',
            'guardduty.amazonaws.com',
            'access-analyzer.amazonaws.com',
          ]),
          WRITE,
        )} }`,
        // (b) long-lived credentials, identity providers and Cognito identity pools, flow logs
        `{ ${any(
          all(
            is('eventSource', 'iam.amazonaws.com'),
            oneOf('eventName', [
              'CreateUser',
              'CreateAccessKey',
              'CreateLoginProfile',
              'CreateServiceSpecificCredential',
            ]),
          ),
          all(
            is('eventSource', 'iam.amazonaws.com'),
            WRITE,
            oneOf('eventName', ['*OpenIDConnectProvider*', '*SAMLProvider*']),
          ),
          all(is('eventSource', 'cognito-identity.amazonaws.com'), WRITE),
          all(is('eventSource', 'ec2.amazonaws.com'), is('eventName', 'DeleteFlowLogs')),
        )} }`,
        // (c) the fast alarms' rules
        `{ ${all(
          is('eventSource', 'events.amazonaws.com'),
          WRITE,
          any(is('requestParameters.name', `${SEC_RULE_PREFIX}*`), is('requestParameters.rule', `${SEC_RULE_PREFIX}*`)),
        )} }`,
        // (d) the alarm topics and their subscriptions
        `{ ${all(
          is('eventSource', 'sns.amazonaws.com'),
          WRITE,
          any(
            is('requestParameters.topicArn', `*:${OPS_TOPIC}`),
            is('requestParameters.subscriptionArn', `*:${OPS_TOPIC}:*`),
            is('requestParameters.name', OPS_TOPIC),
          ),
        )} }`,
        // (e) the security log groups
        `{ ${all(
          is('eventSource', 'logs.amazonaws.com'),
          WRITE,
          '$.eventName != "CreateLogStream"',
          is('requestParameters.logGroupName', `${SECURITY_LOG_GROUP_PREFIX}*`),
        )} }`,
        // (f) the log-archive keys' administration
        `{ ${all(
          is('eventSource', 'kms.amazonaws.com'),
          is('recipientAccountId', logArchive),
          oneOf('eventName', KEY_ADMINISTRATION),
        )} }`,
        // (g) the log buckets' configuration
        `{ ${all(
          is('eventSource', 's3.amazonaws.com'),
          is('eventCategory', 'Management'),
          WRITE,
          oneOf('requestParameters.bucketName', LOG_BUCKETS),
        )} }`,
        // (h) the alarms themselves, but CloudFormation's own updates of them
        `{ ${all(
          is('eventSource', 'monitoring.amazonaws.com'),
          any(
            is('eventName', 'DeleteAlarms'),
            is('eventName', 'DisableAlarmActions'),
            is('eventName', 'SetAlarmState'),
            all(is('eventName', 'PutMetricAlarm'), '$.userIdentity.invokedBy NOT EXISTS'),
          ),
        )} }`,
        // (i) the landing zone's roles, its boundary and GitHub's provider
        `{ ${all(
          is('eventSource', 'iam.amazonaws.com'),
          WRITE,
          any(
            is('requestParameters.roleName', `${ROLE.breakGlass}*`),
            is('requestParameters.roleName', 'hearth-gh-*'),
            is('requestParameters.policyArn', `*:policy/${BOUNDARY}`),
            is('requestParameters.openIDConnectProviderArn', `*${GITHUB_OIDC_HOST}`),
          ),
        )} }`,
        // (j) the log buckets' objects deleted or their locks changed, allowed or denied
        `{ ${all(
          is('eventSource', 's3.amazonaws.com'),
          is('eventCategory', 'Data'),
          oneOf('eventName', S3_OBJECT_CHANGES),
          oneOf('requestParameters.bucketName', LOG_BUCKETS),
        )} }`,
      ],
    },
    {
      metric: 'A07ProdChange',
      name: 'a07-prod-change',
      patterns: [
        `{ ${all(
          is('recipientAccountId', prod),
          is('eventSource', 'cloudformation.amazonaws.com'),
          oneOf('eventName', ['CreateChangeSet', 'ExecuteChangeSet', 'CreateStack', 'UpdateStack', 'DeleteStack']),
        )} }`,
      ],
    },
    {
      metric: 'A08ProdSession',
      name: 'a08-prod-session',
      patterns: [
        `{ ${all(
          is('recipientAccountId', prod),
          any(
            all(is('eventSource', 'ecs.amazonaws.com'), is('eventName', 'ExecuteCommand')),
            all(is('eventSource', 'ssm.amazonaws.com'), is('eventName', 'StartSession')),
          ),
        )} }`,
      ],
    },
    // A13 (the master secret's and the bootstrap input's reads) joins with C0.12.
    {
      metric: 'A11SignInFailures',
      name: 'a11-sign-in-failures',
      patterns: [
        `{ ${any(
          all(is('eventName', 'ConsoleLogin'), is('errorMessage', 'Failed authentication')),
          all(is('eventSource', 'signin.amazonaws.com'), is('serviceEventDetails.CredentialVerification', 'Failure')),
          all(is('eventSource', 'signin.amazonaws.com'), is('serviceEventDetails.CredentialChallenge', 'Failure')),
        )} }`,
      ],
      periodMinutes: 15,
      threshold: 5,
    },
    {
      metric: 'A15Hearthbase',
      name: 'a15-hearthbase',
      patterns: [assumeRole(`cdk-${QUALIFIER.base}-*`)],
    },
  ]
}

export interface SentinelProps {
  config: LandingZoneConfig
  // The trail's copy the filters read.
  logGroup: logs.ILogGroup
  // Management's topic, built beside this (foundation.ts), which every alarm emails.
  alerts: OpsAlerts
}

export class Sentinel extends Construct {
  readonly alarms: readonly cloudwatch.Alarm[]

  constructor(scope: Construct, id: string, props: SentinelProps) {
    super(scope, id)
    this.alarms = assuredAlarms(props.config).map(spec => {
      const group = new Construct(this, spec.metric)
      const alarmName = `${SEC_RULE_PREFIX}${spec.name}`
      spec.patterns.forEach((pattern, index) => {
        if (pattern.length > PATTERN_LIMIT) {
          throw new Error(
            `${alarmName}'s pattern ${index + 1} holds ${pattern.length} characters, over ${PATTERN_LIMIT}`,
          )
        }
        // One filter is the alarm's name; several are lettered a, b, c….
        const letter = spec.patterns.length === 1 ? '' : String.fromCharCode(97 + index)
        new logs.MetricFilter(group, `Filter${letter.toUpperCase()}`, {
          logGroup: props.logGroup,
          filterName: letter === '' ? alarmName : `${alarmName}-${letter}`,
          filterPattern: logs.FilterPattern.literal(pattern),
          metricNamespace: SECURITY_NAMESPACE,
          metricName: spec.metric,
          metricValue: '1',
        })
      })
      const alarm = new cloudwatch.Alarm(group, 'Alarm', {
        alarmName,
        metric: new cloudwatch.Metric({
          namespace: SECURITY_NAMESPACE,
          metricName: spec.metric,
          statistic: cloudwatch.Stats.SUM,
          period: cdk.Duration.minutes(spec.periodMinutes ?? 5),
        }),
        evaluationPeriods: 1,
        threshold: spec.threshold ?? 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      })
      alarm.addAlarmAction(new cwActions.SnsAction(props.alerts.topic))
      alarm.node.addDependency(props.alerts.policyDependable)
      return alarm
    })
  }
}
