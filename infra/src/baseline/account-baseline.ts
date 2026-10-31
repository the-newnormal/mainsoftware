// Hearth-<account>-Baseline (C11-D27): what each workload account holds beside the workload itself,
// deployed by a person through hearthbase, first through OrganizationAccountAccessRole while the
// account sits in Root and afterwards under break-glass with an lz:pr- reason (A1 and A15 alarm on
// both). It holds:
// - hearth-boundary, the permissions boundary every workload role carries from C0.11 PR 3 (C11-D26);
// - GitHub's OIDC provider, hearth-gh-deploy and, in prod, hearth-gh-diff (C11-D55);
// - hearth-break-glass (C11-D11, C11-D12);
// - the ops topic and the fast alarms: A1, A14 and A15, and in prod A7 and A8 (C11-D16);
// - the server image's repository (C11-D44) and the public zones (C11-D43);
// - the SSM parameters the workload stacks and the break-glass helper read by name (C11-D24).
// Nothing here refers to another stack: names cross accounts by construction (src/config/names.ts).
import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'
import { arnPattern } from '../config/arns.ts'
import type { LandingZoneConfig } from '../config/env.ts'
import {
  BOUNDARY,
  GITHUB_OIDC_HOST,
  logBucketName,
  ROLE,
  SEC_RULE_PREFIX,
  SSM_PARAMETER,
  SSO_ROLE_PATH,
} from '../config/names.ts'
import { REGION } from '../config/profiles.ts'
import {
  document,
  IAM_WRITE_ACTIONS,
  LOG_BUCKET_DENY_ACTIONS,
  LOG_BUCKET_PATTERNS,
  modelDeny,
  NO_LONG_LIVED_CREDENTIALS,
  NO_NEW_IDENTITY_PROVIDERS,
  ROUTE_OUT_ACTIONS,
  rule9SecretDenies,
  smsDenies,
} from '../foundation/denies.ts'
import type { ResolvedLandingZoneOptions } from '../foundation/options.ts'
import { BreakGlassRole } from './break-glass.ts'
import { ServerRepository } from './ecr.ts'
import { FastAlarms, type FastRuleId } from './fast-alarms.ts'
import { GithubOidc } from './github-oidc.ts'
import { OpsAlerts } from './ops-alerts.ts'
import { Zones } from './zones.ts'

export interface BaselineStackProps extends cdk.StackProps {
  config: LandingZoneConfig
  // Which workload account this Baseline is for.
  account: 'nonprod' | 'prod'
  options: ResolvedLandingZoneOptions
}

// Each account's fast alarms (C11-D16): A7's production changes and A8's sessions in prod alone.
const FAST_RULES: Readonly<Record<'nonprod' | 'prod', readonly FastRuleId[]>> = {
  nonprod: ['A1', 'A14', 'A15'],
  prod: ['A1', 'A7', 'A8', 'A14', 'A15'],
}

export class BaselineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BaselineStackProps) {
    super(scope, id, props)
    const { config } = props
    const account = config.accounts[props.account]
    if (this.account !== account) {
      throw new Error(`${id} must be deployed into the ${props.account} account its configuration names`)
    }
    const logArchive = config.accounts.logArchive

    new Boundary(this, 'Boundary', { account })
    new GithubOidc(this, 'GithubOidc', { account, workloadAccount: props.account, github: config.github })
    new BreakGlassRole(this, 'BreakGlass', {
      account,
      kind: 'workload',
      workloadAccount: props.account,
      logArchiveAccount: logArchive,
    })
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
    const alarms = new FastAlarms(this, 'FastAlarms', { topic: alerts.topic, rules: FAST_RULES[props.account] })
    alarms.node.addDependency(alerts.policyDependable)
    new ServerRepository(this, 'ServerRepository', { account, workloadAccount: props.account })
    new Zones(this, 'Zones', {
      workloadAccount: props.account,
      nonprodNameServers: props.options.nonprodNameServers,
    })
    // The break-glass-log bucket's name, which the helper reads rather than holds (C11-D13).
    new ssm.StringParameter(this, 'BreakGlassLogBucketName', {
      parameterName: SSM_PARAMETER.breakGlassLogBucket,
      stringValue: logBucketName('breakGlass', logArchive),
      description: 'The bucket break-glass entries are written to (C11-D13)',
    })
  }
}

// hearth-boundary (C11-D26): the permissions boundary of every workload role, so the most a role made
// by a merged workload PR can do is bounded here, whatever its own policies say. It allows everything
// else (AllowAll is the one Allow of * on * the landing zone holds, IAC-10), and denies, with no
// caller excepted: every model action; changing or detaching itself, and making a role without it;
// long-lived credentials and new identity providers; IAM writes to the roles and names the
// guardrails protect, and passing a Rule 9 role; the Rule 9 secrets; the audit services; deletes and
// lock changes on the log-archive buckets; a route out of the VPC; and AWS's own SMS. A role takes
// one boundary, so it can't be split: it stays within a managed policy's 6,144 characters, which
// IAC-10 measures, and were it to grow past them, the SMS statements go first and then the route-out
// one (the SCPs still deny both), never the model, credential or identity-provider denies.
class Boundary extends Construct {
  readonly policy: iam.CfnManagedPolicy

  constructor(scope: Construct, id: string, props: { account: string }) {
    super(scope, id)
    const { account } = props
    const iamArn = (resource: string) => arnPattern({ service: 'iam', account, resource })
    const self = iamArn(`policy/${BOUNDARY}`)
    this.policy = new iam.CfnManagedPolicy(this, 'Policy', {
      managedPolicyName: BOUNDARY,
      description: 'The permissions boundary of every workload role (C11-D26)',
      policyDocument: document([
        { Sid: 'AllowAll', Effect: 'Allow', Action: '*', Resource: '*' },
        modelDeny(),
        {
          Sid: 'KeepBoundary',
          Effect: 'Deny',
          Action: [
            'iam:CreatePolicyVersion',
            'iam:DeletePolicy',
            'iam:DeletePolicyVersion',
            'iam:SetDefaultPolicyVersion',
          ],
          Resource: self,
        },
        {
          Sid: 'KeepBoundaryAttached',
          Effect: 'Deny',
          Action: ['iam:DeleteRolePermissionsBoundary', 'iam:DeleteUserPermissionsBoundary'],
          Resource: '*',
        },
        {
          Sid: 'BoundedRolesOnly',
          Effect: 'Deny',
          Action: ['iam:CreateRole', 'iam:PutRolePermissionsBoundary'],
          Resource: '*',
          Condition: { StringNotEquals: { 'iam:PermissionsBoundary': self } },
        },
        { Sid: 'NoLongLivedCredentials', Effect: 'Deny', Action: NO_LONG_LIVED_CREDENTIALS, Resource: '*' },
        { Sid: 'NoNewIdentityProviders', Effect: 'Deny', Action: NO_NEW_IDENTITY_PROVIDERS, Resource: '*' },
        {
          Sid: 'ProtectedNames',
          Effect: 'Deny',
          Action: IAM_WRITE_ACTIONS,
          Resource: [
            iamArn(`role/${ROLE.breakGlass}*`),
            iamArn('role/hearth-gh-*'),
            iamArn('role/cdk-*'),
            iamArn('role/hearth-*-rule9-*'),
            iamArn(`oidc-provider/${GITHUB_OIDC_HOST}`),
            self,
            iamArn(`role/${SSO_ROLE_PATH}*`),
          ],
        },
        { Sid: 'Rule9PassRole', Effect: 'Deny', Action: 'iam:PassRole', Resource: iamArn('role/hearth-*-rule9-*') },
        ...rule9SecretDenies(),
        {
          Sid: 'NoAudit',
          Effect: 'Deny',
          Action: ['cloudtrail:*', 'guardduty:*', 'organizations:*'],
          Resource: '*',
        },
        { Sid: 'LogBuckets', Effect: 'Deny', Action: LOG_BUCKET_DENY_ACTIONS, Resource: LOG_BUCKET_PATTERNS() },
        { Sid: 'NoRouteOut', Effect: 'Deny', Action: ROUTE_OUT_ACTIONS, Resource: '*' },
        ...smsDenies(),
      ]),
    })
    this.policy.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
  }
}
