// The organisation's external-access analyzer and the findings alarms, in the log-archive account,
// which is GuardDuty's and Access Analyzer's delegated administrator (C11-D20). GuardDuty itself is
// delegated and switched on for every account by hand, through the runbook: a detector made here
// would clash with the one delegation makes. Both rules email log-archive's hearth-ops-alerts topic:
// A9 on a GuardDuty finding of medium severity or above, and A10 on an active Access Analyzer finding,
// each with the finding's ids only, never its addresses or the resource's details.
//
// The analyzer has no archive rule: one keyed on a principal would also hide a widened trust. Its
// expected findings are hearth-gh-deploy and hearth-gh-diff trusting GitHub's token host with exactly
// their environment's subject; any other federated principal is an incident (TECH-SPEC T24 item 7).
import * as cdk from 'aws-cdk-lib'
import * as accessanalyzer from 'aws-cdk-lib/aws-accessanalyzer'
import * as events from 'aws-cdk-lib/aws-events'
import type * as sns from 'aws-cdk-lib/aws-sns'
import { Construct, type IDependable } from 'constructs'
import { topicTarget } from '../baseline/ops-alerts.ts'
import { SEC_RULE_PREFIX } from '../config/names.ts'

export interface SecurityServicesProps {
  // Log-archive's hearth-ops-alerts topic, and its policy, which the rules wait for.
  topic: sns.ITopic
  topicPolicy: IDependable
}

export class SecurityServices extends Construct {
  readonly analyzer: accessanalyzer.CfnAnalyzer

  constructor(scope: Construct, id: string, props: SecurityServicesProps) {
    super(scope, id)
    this.analyzer = new accessanalyzer.CfnAnalyzer(this, 'Analyzer', {
      analyzerName: 'hearth-org-external',
      type: 'ORGANIZATION',
    })
    this.analyzer.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)

    // A service's events, so the rules stay ENABLED (no CloudTrail management events needed).
    const a9 = new events.Rule(this, 'A9GuardDuty', {
      ruleName: `${SEC_RULE_PREFIX}a09-guardduty`,
      eventPattern: {
        source: ['aws.guardduty'],
        detailType: ['GuardDuty Finding'],
        detail: { severity: events.Match.greaterThanOrEqual(4) },
      },
      targets: [
        topicTarget(
          props.topic,
          events.RuleTargetInput.fromObject({
            alarm: 'A9',
            account: events.EventField.fromPath('$.detail.accountId'),
            severity: events.EventField.fromPath('$.detail.severity'),
            type: events.EventField.fromPath('$.detail.type'),
            id: events.EventField.fromPath('$.detail.id'),
          }),
        ),
      ],
    })
    const a10 = new events.Rule(this, 'A10AccessAnalyzer', {
      ruleName: `${SEC_RULE_PREFIX}a10-access-analyzer`,
      eventPattern: {
        source: ['aws.access-analyzer'],
        detailType: ['Access Analyzer Finding'],
        detail: { status: ['ACTIVE'] },
      },
      targets: [
        topicTarget(
          props.topic,
          events.RuleTargetInput.fromObject({
            alarm: 'A10',
            account: events.EventField.fromPath('$.detail.accountId'),
            resourceType: events.EventField.fromPath('$.detail.resourceType'),
            id: events.EventField.fromPath('$.detail.id'),
          }),
        ),
      ],
    })
    a9.node.addDependency(props.topicPolicy)
    a10.node.addDependency(props.topicPolicy)
  }
}
