// The fast alarms (C11-D16): EventBridge rules in a member account that email its hearth-ops-alerts
// topic within a minute or so of what they match. They are the quick path; the assured path is the
// organisation trail's metric filters and alarms in management (A1 to A8, A11, A15), which see the
// same calls even if a member account's delivery of management events to its default bus fails
// (TECH-SPEC T24 item 5). Every input carries ids, an operator's sign-in name, a reason reference
// and error codes only, never a request's content.
//
// Patterns: a Match helper is the whole value it matches with, never wrapped in another list, and a
// raw matcher (`[{ exists: false }]`) is written as a list itself, so no pattern holds a list inside
// a list, which EventBridge would never match. `exists` matches only a leaf, never an object or a
// list of objects, so a field holding objects is matched by a leaf inside them. A rule matching
// CloudTrail's management events is switched on for them
// (ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS); a service event's rule stays ENABLED. `$or`,
// `exists` and `anything-but` with `wildcard`, and ECS's rollback event, are proved by a person with
// `aws events test-event-pattern` before they are relied on (the set-up runbook).
import * as events from 'aws-cdk-lib/aws-events'
import type * as sns from 'aws-cdk-lib/aws-sns'
import { Construct } from 'constructs'
import { QUALIFIER, ROLE, SEC_RULE_PREFIX, taskFamily } from '../config/names.ts'
import { topicTarget } from './ops-alerts.ts'

// The fast alarms a Baseline or LogArchive may hold: A1 break-glass, A7 production changes (three
// rules), A8 sessions into tasks, A14 a failed deployment, A15 a hearthbase role assumed.
export type FastRuleId = 'A1' | 'A7' | 'A8' | 'A14' | 'A15'

export interface FastAlarmsProps {
  topic: sns.ITopic
  rules: readonly FastRuleId[]
}

const CLOUDTRAIL = 'AWS API Call via CloudTrail'
const CLOUDTRAIL_STATE = 'ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS'

// What an AssumeRole alarm says: the alarm, the account, the call, the session's source identity (the
// operator's sign-in name), the reason tag and any error code.
const assumeInput = (alarm: string) =>
  events.RuleTargetInput.fromObject({
    alarm,
    account: events.EventField.account,
    action: events.EventField.fromPath('$.detail.eventName'),
    sourceIdentity: events.EventField.fromPath('$.detail.requestParameters.sourceIdentity'),
    reason: events.EventField.fromPath('$.detail.requestParameters.tags[0].value'),
    error: events.EventField.fromPath('$.detail.errorCode'),
  })

// What a production-change alarm says: the alarm, the account, the call and who made it.
const callerInput = (alarm: string) =>
  events.RuleTargetInput.fromObject({
    alarm,
    account: events.EventField.account,
    action: events.EventField.fromPath('$.detail.eventName'),
    caller: events.EventField.fromPath('$.detail.userIdentity.arn'),
  })

// An ECS RunTask call, by CloudTrail.
const RUN_TASK = { eventSource: ['ecs.amazonaws.com'], eventName: ['RunTask'] }

// A container's environment overridden, in either shape CloudTrail may record it: the API's list of
// name and value pairs, matched by a pair's name since `exists` sees only a leaf, or that list
// redacted to one string, since the API marks it sensitive. Which one a real RunTask carries is
// proved with `aws events test-event-pattern` (the set-up runbook).
const ENVIRONMENT_OVERRIDDEN = [
  { overrides: { containerOverrides: { environment: { name: [{ exists: true }] } } } },
  { overrides: { containerOverrides: { environment: [{ exists: true }] } } },
]

interface FastRule {
  id: string
  name: string
  pattern: events.EventPattern
  input: events.RuleTargetInput
  cloudTrail: boolean
}

function rulesFor(id: FastRuleId): FastRule[] {
  switch (id) {
    case 'A1':
      return [
        {
          id: 'A1BreakGlass',
          name: `${SEC_RULE_PREFIX}a01-break-glass`,
          pattern: {
            source: ['aws.sts'],
            detailType: [CLOUDTRAIL],
            detail: {
              eventSource: ['sts.amazonaws.com'],
              eventName: ['AssumeRole'],
              requestParameters: { roleArn: events.Match.suffix(`:role/${ROLE.breakGlass}`) },
            },
          },
          input: assumeInput('A1'),
          cloudTrail: true,
        },
      ]
    case 'A15':
      return [
        {
          id: 'A15Hearthbase',
          name: `${SEC_RULE_PREFIX}a15-hearthbase`,
          pattern: {
            source: ['aws.sts'],
            detailType: [CLOUDTRAIL],
            detail: {
              eventSource: ['sts.amazonaws.com'],
              eventName: ['AssumeRole'],
              requestParameters: { roleArn: events.Match.wildcard(`*:role/cdk-${QUALIFIER.base}-*`) },
            },
          },
          input: assumeInput('A15'),
          cloudTrail: true,
        },
      ]
    case 'A7':
      return [
        // ECS changes not made through CloudFormation: invokedBy absent, or another service.
        {
          id: 'A7EcsChanges',
          name: `${SEC_RULE_PREFIX}a07-ecs-changes`,
          pattern: {
            source: ['aws.ecs'],
            detailType: [CLOUDTRAIL],
            detail: {
              eventSource: ['ecs.amazonaws.com'],
              eventName: ['RegisterTaskDefinition', 'CreateService', 'UpdateService', 'DeleteService'],
              $or: [
                { userIdentity: { invokedBy: [{ exists: false }] } },
                { userIdentity: { invokedBy: [{ 'anything-but': 'cloudformation.amazonaws.com' }] } },
              ],
            },
          },
          input: callerInput('A7'),
          cloudTrail: true,
        },
        // A task run with its command overridden, whoever runs it.
        {
          id: 'A7RunCommand',
          name: `${SEC_RULE_PREFIX}a07-run-command`,
          pattern: {
            source: ['aws.ecs'],
            detailType: [CLOUDTRAIL],
            detail: {
              ...RUN_TASK,
              requestParameters: { overrides: { containerOverrides: { command: [{ exists: true }] } } },
            },
          },
          input: callerInput('A7'),
          cloudTrail: true,
        },
        // A task run with its environment overridden, unless it is prod's readiness probe started by
        // hearth-gh-deploy, whose override holds only the probe's targets (C11-D53). A pattern has one
        // `$or`, so each shape of the override is paired with each way out of the exception.
        {
          id: 'A7RunEnvironment',
          name: `${SEC_RULE_PREFIX}a07-run-environment`,
          pattern: {
            source: ['aws.ecs'],
            detailType: [CLOUDTRAIL],
            detail: {
              ...RUN_TASK,
              $or: ENVIRONMENT_OVERRIDDEN.flatMap(overridden => [
                {
                  requestParameters: {
                    ...overridden,
                    taskDefinition: [{ 'anything-but': { wildcard: `*${taskFamily('prod', 'probe')}*` } }],
                  },
                },
                {
                  requestParameters: overridden,
                  userIdentity: { arn: [{ 'anything-but': { wildcard: `*:assumed-role/${ROLE.ghDeploy}/*` } }] },
                },
              ]),
            },
          },
          input: callerInput('A7'),
          cloudTrail: true,
        },
      ]
    case 'A8':
      return [
        {
          id: 'A8Sessions',
          name: `${SEC_RULE_PREFIX}a08-sessions`,
          pattern: {
            source: ['aws.ecs', 'aws.ssm'],
            detailType: [CLOUDTRAIL],
            detail: { eventName: ['ExecuteCommand', 'StartSession'] },
          },
          input: callerInput('A8'),
          cloudTrail: true,
        },
      ]
    case 'A14':
      // The circuit breaker's rollback raises SERVICE_DEPLOYMENT_FAILED. Ids only: the deployment and
      // the service's ARN.
      return [
        {
          id: 'A14Deployments',
          name: `${SEC_RULE_PREFIX}a14-deployments`,
          pattern: {
            source: ['aws.ecs'],
            detailType: ['ECS Deployment State Change'],
            detail: { eventName: ['SERVICE_DEPLOYMENT_FAILED'] },
          },
          input: events.RuleTargetInput.fromObject({
            alarm: 'A14',
            account: events.EventField.account,
            eventName: events.EventField.fromPath('$.detail.eventName'),
            deploymentId: events.EventField.fromPath('$.detail.deploymentId'),
            service: events.EventField.fromPath('$.resources[0]'),
          }),
          cloudTrail: false,
        },
      ]
  }
}

export class FastAlarms extends Construct {
  readonly rules: readonly events.Rule[]

  constructor(scope: Construct, id: string, props: FastAlarmsProps) {
    super(scope, id)
    this.rules = props.rules.flatMap(rulesFor).map(rule => {
      const made = new events.Rule(this, rule.id, {
        ruleName: rule.name,
        eventPattern: rule.pattern,
        targets: [topicTarget(props.topic, rule.input)],
      })
      if (rule.cloudTrail) (made.node.defaultChild as events.CfnRule).state = CLOUDTRAIL_STATE
      return made
    })
  }
}
