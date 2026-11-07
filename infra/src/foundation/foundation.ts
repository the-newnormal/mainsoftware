// Hearth-Foundation (C11-D27): the organisation's own resources, in the management account, deployed
// by a person from a credential-free synth through the hearthbase execution role, first under the
// hand-made HearthSetUp set and afterwards under HearthOrgAdmin, which this stack makes (TECH-SPEC T24
// item 3). SCPs never bind management, so everything here is fenced by its own policies alone
// (C11-D10). It holds:
// - the guardrails: the SCPs, the RCP and the AI services opt-out (guardrails.ts);
// - Identity Center's permission sets, their assignments and the attribute for access control
//   (identity-center.ts);
// - the organisation trail, its CloudWatch copy and the reviewer's saved queries (org-trail.ts);
// - management's hearth-ops-alerts topic, which the assured alarms (sentinel.ts) and the budgets and
//   anomaly alerts (budgets.ts) email: CloudWatch, Budgets and Cost Anomaly Detection may publish to it,
//   each for this account alone and, where the service says, for its own alarms and budgets (C11-D16).
// Nothing here refers to another stack: what crosses accounts is a name built from configuration
// (src/config/names.ts).
import * as cdk from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import { OpsAlerts } from '../baseline/ops-alerts.ts'
import { arnPattern } from '../config/arns.ts'
import type { LandingZoneConfig } from '../config/env.ts'
import { REGION } from '../config/profiles.ts'
import { Budgets } from './budgets.ts'
import { Guardrails } from './guardrails.ts'
import { IdentityCenter } from './identity-center.ts'
import type { ResolvedLandingZoneOptions } from './options.ts'
import { OrgTrail } from './org-trail.ts'
import { Sentinel } from './sentinel.ts'

export interface FoundationStackProps extends cdk.StackProps {
  config: LandingZoneConfig
  options: ResolvedLandingZoneOptions
}

export class FoundationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props)
    const { config, options } = props
    const account = config.accounts.management
    if (this.account !== account) {
      throw new Error(`${id} must be deployed into the management account its configuration names`)
    }

    new Guardrails(this, 'Guardrails', { config, options })
    new IdentityCenter(this, 'IdentityCenter', { config, options })
    const trail = new OrgTrail(this, 'OrgTrail', { config })
    const alerts = new OpsAlerts(this, 'OpsAlerts', {
      account,
      alertEmail: config.alertEmail,
      publishers: [
        {
          sid: 'AssuredAlarms',
          service: 'cloudwatch.amazonaws.com',
          sourceArn: arnPattern({ service: 'cloudwatch', region: REGION, account, resource: 'alarm:*' }),
        },
        {
          sid: 'Budgets',
          service: 'budgets.amazonaws.com',
          sourceArn: arnPattern({ service: 'budgets', account, resource: '*' }),
        },
        { sid: 'CostAnomalyDetection', service: 'costalerts.amazonaws.com' },
      ],
    })
    new Sentinel(this, 'Sentinel', { config, logGroup: trail.logGroup, alerts })
    new Budgets(this, 'Budgets', { config, alerts })
  }
}
