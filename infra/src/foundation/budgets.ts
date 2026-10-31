// A12: the budgets and Cost Anomaly Detection (C11-D20, C11-D73), in Hearth-Foundation. Five monthly
// cost budgets, the organisation's and one per account, in the amounts the owner chose (C11-Q09, 31 Oct
// 2026: USD 650 in all, prod 350, non-prod 250, management 25 and log-archive 25), held in the person's
// environment rather than committed (C11-D25). Each emails management's hearth-ops-alerts topic at
// 80 % and 100 % of actual spend and at 100 % of forecast. Costs are counted before GST, the basis the
// amounts were chosen on, so the 80 % alert keeps its headroom (TECH-SPEC T24's C11-Q09 entry).
//
// Each budget measures unblended cost and filters out the Tax record type, so credits, refunds,
// support and discounts still count. AWS Budgets takes either Metrics with a FilterExpression or the
// older CostTypes with CostFilters, never a mix, and the older pair is deprecated; every budget here
// uses the newer one, the organisation's with only the tax filter and each account's with that filter
// and its linked account.
//
// One anomaly monitor watches spend by service and alerts the topic at once on an anomaly whose total
// impact is at least USD 10. Cost Explorer may already hold a default AWS-services monitor, which
// would clash with this one, so the set-up runbook looks for it and removes it before Foundation's
// first deploy.
// Budgets and Cost Anomaly Detection check they may publish when a notification is made, so each waits
// for the topic's policy. This file decides when spend wakes someone, so it is on the owner's-read list
// (C11-D74).
import * as cdk from 'aws-cdk-lib'
import * as budgets from 'aws-cdk-lib/aws-budgets'
import * as ce from 'aws-cdk-lib/aws-ce'
import { Construct } from 'constructs'
import type { OpsAlerts } from '../baseline/ops-alerts.ts'
import type { LandingZoneConfig } from '../config/env.ts'

// The anomaly alert's floor, in US dollars of total impact.
export const ANOMALY_IMPACT_USD = 10

// Every charge but tax (C11-Q09's pre-GST basis).
const NOT_TAX: budgets.CfnBudget.ExpressionProperty = {
  not: { dimensions: { key: 'RECORD_TYPE', values: ['Tax'], matchOptions: ['EQUALS'] } },
}

export interface BudgetsProps {
  config: LandingZoneConfig
  // Management's topic, built beside this (foundation.ts).
  alerts: OpsAlerts
}

export class Budgets extends Construct {
  constructor(scope: Construct, id: string, props: BudgetsProps) {
    super(scope, id)
    const { config, alerts } = props
    const { budgetsUsd, accounts } = config
    const subscribers = [{ subscriptionType: 'SNS', address: alerts.topic.topicArn }]
    const notify = (notificationType: 'ACTUAL' | 'FORECASTED', threshold: number) => ({
      notification: { notificationType, comparisonOperator: 'GREATER_THAN', threshold, thresholdType: 'PERCENTAGE' },
      subscribers,
    })
    // The organisation's whole bill (consolidated billing), then each account's.
    const plan: ReadonlyArray<{ id: string; name: string; amount: number; account?: string }> = [
      { id: 'Organisation', name: 'hearth-organisation', amount: budgetsUsd.organisation },
      { id: 'Management', name: 'hearth-management', amount: budgetsUsd.management, account: accounts.management },
      { id: 'LogArchive', name: 'hearth-log-archive', amount: budgetsUsd.logArchive, account: accounts.logArchive },
      { id: 'Nonprod', name: 'hearth-nonprod', amount: budgetsUsd.nonprod, account: accounts.nonprod },
      { id: 'Prod', name: 'hearth-prod', amount: budgetsUsd.prod, account: accounts.prod },
    ]
    for (const entry of plan) {
      const budget = new budgets.CfnBudget(this, entry.id, {
        budget: {
          budgetName: entry.name,
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: entry.amount, unit: 'USD' },
          metrics: ['UnblendedCost'],
          filterExpression:
            entry.account === undefined
              ? NOT_TAX
              : {
                  and: [
                    { dimensions: { key: 'LINKED_ACCOUNT', values: [entry.account], matchOptions: ['EQUALS'] } },
                    NOT_TAX,
                  ],
                },
        },
        notificationsWithSubscribers: [notify('ACTUAL', 80), notify('ACTUAL', 100), notify('FORECASTED', 100)],
      })
      budget.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE)
      budget.node.addDependency(alerts.policyDependable)
    }

    const monitor = new ce.CfnAnomalyMonitor(this, 'AnomalyMonitor', {
      monitorName: 'hearth-services',
      monitorType: 'DIMENSIONAL',
      monitorDimension: 'SERVICE',
    })
    const subscription = new ce.CfnAnomalySubscription(this, 'AnomalySubscription', {
      subscriptionName: 'hearth-anomalies',
      frequency: 'IMMEDIATE',
      monitorArnList: [monitor.attrMonitorArn],
      subscribers: [{ type: 'SNS', address: alerts.topic.topicArn }],
      thresholdExpression: JSON.stringify({
        Dimensions: {
          Key: 'ANOMALY_TOTAL_IMPACT_ABSOLUTE',
          MatchOptions: ['GREATER_THAN_OR_EQUAL'],
          Values: [String(ANOMALY_IMPACT_USD)],
        },
      }),
    })
    subscription.node.addDependency(alerts.policyDependable)
  }
}
