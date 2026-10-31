// Each account's alarm topic, hearth-ops-alerts (C11-D16): the fast rules, and in management the
// assured alarms and the budgets, publish to it, and it emails the ops role mailbox alone (C11-Q07:
// email only, never SMS). Its policy names every publisher by its service, bound to this account
// (aws:SourceAccount) and, where the service sets one, to its own resources (aws:SourceArn), so no
// other account's rule or alarm can post to it.
//
// The topic is unencrypted, with TLS enforced: EventBridge, CloudWatch, Budgets and Cost Anomaly
// Detection can't publish under the AWS-managed SNS key, and the alerts carry only ids, an operator's
// sign-in name and references, and leave by email anyway (C11-D16, TECH-SPEC T24 item 5).
import type * as events from 'aws-cdk-lib/aws-events'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions'
import { Construct, type IDependable } from 'constructs'
import { OPS_TOPIC } from '../config/names.ts'

// A service that publishes to the topic: its statement's Sid, its principal, and the resources it
// publishes from (an ARN pattern), where the service sets aws:SourceArn.
export interface Publisher {
  sid: string
  service: string
  sourceArn?: string
}

export interface OpsAlertsProps {
  // The account the topic is in, which every publisher must act for.
  account: string
  // The ops role mailbox (C11-Q07).
  alertEmail: string
  publishers: readonly Publisher[]
}

export class OpsAlerts extends Construct {
  readonly topic: sns.Topic
  // The topic's policy, which a publisher's rule or alarm waits for, so it never fires into a topic
  // that refuses it.
  readonly policyDependable: IDependable

  constructor(scope: Construct, id: string, props: OpsAlertsProps) {
    super(scope, id)
    if (props.publishers.length === 0) throw new Error('OpsAlerts needs at least one publisher')
    this.topic = new sns.Topic(this, 'Topic', { topicName: OPS_TOPIC, enforceSSL: true })
    let dependable: IDependable | undefined
    for (const publisher of props.publishers) {
      const added = this.topic.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: publisher.sid,
          principals: [new iam.ServicePrincipal(publisher.service)],
          actions: ['sns:Publish'],
          resources: [this.topic.topicArn],
          conditions: {
            StringEquals: { 'aws:SourceAccount': props.account },
            ...(publisher.sourceArn === undefined ? {} : { ArnLike: { 'aws:SourceArn': publisher.sourceArn } }),
          },
        }),
      )
      dependable = added.policyDependable ?? dependable
    }
    if (dependable === undefined) throw new Error("OpsAlerts: the topic's policy was not made")
    this.policyDependable = dependable
    this.topic.addSubscription(new subs.EmailSubscription(props.alertEmail))
  }
}

// A rule's target: the topic, with the rule's input. Written here rather than through
// aws-events-targets' SnsTopic, whose bind adds a publish grant for events.amazonaws.com with no
// condition; the topic's own policy admits the rules (C11-D16).
export function topicTarget(topic: sns.ITopic, input: events.RuleTargetInput): events.IRuleTarget {
  return { bind: () => ({ arn: topic.topicArn, input }) }
}
