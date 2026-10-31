// GitHub's OIDC provider in a workload account and the roles its deploy workflow assumes (C11-D55):
// hearth-gh-deploy in both accounts, for the deploy job of the account's own GitHub environment, and
// hearth-gh-diff in prod, for the prod-plan environment's diff. Each trust takes exactly one subject,
// githubSubject()'s for its environment, which names the repository, the environment and the deploy
// workflow on main, and the AWS audience, both by StringEquals, so no other repository, branch,
// workflow or environment can assume either role.
//
// hearth-gh-deploy pushes the server image, assumes the two hearthapp roles that deploy and publish
// the workload's stacks, and runs, watches and stops the migrate and probe one-off tasks; it reads
// nothing else (no secret, log, object, session or database login) and assumes no other role.
// hearth-gh-diff reads the prod stacks' templates and nothing else. The provider keeps its default
// removal policy, under the stack's termination protection and the guardrails' protected names, since
// a retained provider would make a failed first deploy's retry fail (TECH-SPEC T24 item 11). This file
// holds who may deploy, so it is on the owner's-read list (C11-D74).
import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import { arnPattern, roleArn } from '../config/arns.ts'
import { type GithubEnvironment, githubSubject, type LandingZoneConfig } from '../config/env.ts'
import {
  clusterName,
  execRoleName,
  GITHUB_OIDC_HOST,
  logGroupName,
  OIDC_AUDIENCE,
  ONE_OFF_FAMILIES,
  QUALIFIER,
  ROLE,
  SERVER_REPOSITORY,
  stagesIn,
  taskFamily,
  taskRoleName,
} from '../config/names.ts'
import { REGION } from '../config/profiles.ts'
import { document, type IamStatement, modelDeny } from '../foundation/denies.ts'

export interface GithubOidcProps {
  // The account the provider and roles are in, and its kind.
  account: string
  workloadAccount: 'nonprod' | 'prod'
  github: LandingZoneConfig['github']
}

// What hearth-gh-diff may do: read a stack's template, its status and its resources.
const PLAN_READS = ['cloudformation:GetTemplate', 'cloudformation:DescribeStacks', 'cloudformation:ListStackResources']

export class GithubOidc extends Construct {
  readonly provider: iam.OidcProviderNative
  readonly deployRole: iam.CfnRole
  readonly diffRole?: iam.CfnRole

  constructor(scope: Construct, id: string, props: GithubOidcProps) {
    super(scope, id)
    const { account, workloadAccount } = props
    this.provider = new iam.OidcProviderNative(this, 'Provider', {
      url: `https://${GITHUB_OIDC_HOST}`,
      clientIds: [OIDC_AUDIENCE],
    })
    const trust = (environment: GithubEnvironment) =>
      document([
        {
          Sid: 'GithubEnvironment',
          Effect: 'Allow',
          Principal: { Federated: this.provider.oidcProviderArn },
          Action: 'sts:AssumeRoleWithWebIdentity',
          Condition: {
            StringEquals: {
              [`${GITHUB_OIDC_HOST}:aud`]: OIDC_AUDIENCE,
              [`${GITHUB_OIDC_HOST}:sub`]: githubSubject(props.github, environment),
            },
          },
        },
      ])

    this.deployRole = new iam.CfnRole(this, 'DeployRole', {
      roleName: ROLE.ghDeploy,
      maxSessionDuration: 3600,
      assumeRolePolicyDocument: trust(workloadAccount),
      policies: [{ policyName: ROLE.ghDeploy, policyDocument: document(deployStatements(account, workloadAccount)) }],
    })
    // Outputs, not exports: the person copies each into its GitHub environment (C0.11 PR 4), by the
    // plain name the runbook reads.
    new cdk.CfnOutput(this, 'DeployRoleArn', {
      description: "hearth-gh-deploy's ARN, for the GitHub environment's deploy role (C11-D55)",
      value: this.deployRole.attrArn,
    }).overrideLogicalId('DeployRoleArn')

    // The prod-plan environment's diff of the prod stacks (C11-D51), in prod alone.
    if (workloadAccount === 'prod') {
      const stacks = arnPattern({
        service: 'cloudformation',
        region: REGION,
        account,
        resource: 'stack/Hearth-prod-*/*',
      })
      this.diffRole = new iam.CfnRole(this, 'DiffRole', {
        roleName: ROLE.ghDiff,
        maxSessionDuration: 3600,
        assumeRolePolicyDocument: trust('prod-plan'),
        policies: [
          {
            policyName: ROLE.ghDiff,
            policyDocument: document([
              { Sid: 'ReadPlan', Effect: 'Allow', Action: PLAN_READS, Resource: stacks },
              { Sid: 'NoAssume', Effect: 'Deny', Action: 'sts:AssumeRole', Resource: '*' },
              { Sid: 'OnlyPlanReads', Effect: 'Deny', NotAction: PLAN_READS, Resource: '*' },
            ]),
          },
        ],
      })
      new cdk.CfnOutput(this, 'DiffRoleArn', {
        description: "hearth-gh-diff's ARN, for the prod-plan environment's diff role (C11-D55)",
        value: this.diffRole.attrArn,
      }).overrideLogicalId('DiffRoleArn')
    }
  }
}

// hearth-gh-deploy's statements (C11-D55): `<s>` ranges over the account's stages, so prod's names the
// restore stage's families, roles and groups too (C11-Q02).
function deployStatements(account: string, workloadAccount: 'nonprod' | 'prod'): IamStatement[] {
  const stages = stagesIn(workloadAccount)
  const arn = (service: string, resource: string) => arnPattern({ service, region: REGION, account, resource })
  const clusters = stages.map(s => arn('ecs', `cluster/${clusterName(s)}`))
  const tasks = stages.map(s => arn('ecs', `task/${clusterName(s)}/*`))
  const hearthapp = (role: string) => roleArn(account, `cdk-${QUALIFIER.app}-${role}-${account}-${REGION}`)
  const appRoles = [hearthapp('deploy-role'), hearthapp('file-publishing-role')]
  const oneOffGroups = stages.flatMap(s =>
    ONE_OFF_FAMILIES.map(kind => arn('logs', `log-group:${logGroupName(s, kind)}`)),
  )
  const oneOffStreams = oneOffGroups.map(group => `${group}:log-stream:*`)
  return [
    { Sid: 'AssumeAppRoles', Effect: 'Allow', Action: 'sts:AssumeRole', Resource: appRoles },
    { Sid: 'EcrLogin', Effect: 'Allow', Action: 'ecr:GetAuthorizationToken', Resource: '*' },
    {
      Sid: 'EcrPush',
      Effect: 'Allow',
      Action: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:PutImage',
        'ecr:BatchGetImage',
        'ecr:GetDownloadUrlForLayer',
        'ecr:DescribeImages',
      ],
      Resource: arn('ecr', `repository/${SERVER_REPOSITORY}`),
    },
    {
      Sid: 'RunOneOffs',
      Effect: 'Allow',
      Action: 'ecs:RunTask',
      Resource: stages.flatMap(s =>
        ONE_OFF_FAMILIES.map(kind => arn('ecs', `task-definition/${taskFamily(s, kind)}:*`)),
      ),
      Condition: { ArnEquals: { 'ecs:cluster': clusters } },
    },
    // The deploy reads every task in the cluster back after a release (C11-D52).
    { Sid: 'WatchTasks', Effect: 'Allow', Action: 'ecs:DescribeTasks', Resource: tasks },
    // It stops only the one-off tasks, by the hearth-role tag their task definitions carry, which a
    // run propagates to the task (so TagResource on a run's own task).
    {
      Sid: 'StopOneOffs',
      Effect: 'Allow',
      Action: 'ecs:StopTask',
      Resource: tasks,
      Condition: { StringEquals: { 'aws:ResourceTag/hearth-role': [...ONE_OFF_FAMILIES] } },
    },
    {
      Sid: 'TagOneOffs',
      Effect: 'Allow',
      Action: 'ecs:TagResource',
      Resource: tasks,
      Condition: { StringEquals: { 'ecs:CreateAction': 'RunTask' } },
    },
    {
      Sid: 'ListOneOffs',
      Effect: 'Allow',
      Action: 'ecs:ListTasks',
      Resource: '*',
      Condition: { ArnEquals: { 'ecs:cluster': clusters } },
    },
    {
      Sid: 'DescribeServices',
      Effect: 'Allow',
      Action: 'ecs:DescribeServices',
      Resource: stages.map(s => arn('ecs', `service/${clusterName(s)}/*`)),
    },
    {
      Sid: 'DescribeDeploy',
      Effect: 'Allow',
      Action: ['ecs:DescribeTaskDefinition', 'elasticloadbalancing:Describe*'],
      Resource: '*',
    },
    {
      Sid: 'DescribeStacks',
      Effect: 'Allow',
      Action: 'cloudformation:DescribeStacks',
      Resource: stages.map(s => arn('cloudformation', `stack/Hearth-${s}-*/*`)),
    },
    {
      Sid: 'PassOneOffRoles',
      Effect: 'Allow',
      Action: 'iam:PassRole',
      Resource: stages.flatMap(s =>
        ONE_OFF_FAMILIES.flatMap(kind => [
          roleArn(account, taskRoleName(s, kind)),
          roleArn(account, execRoleName(s, kind)),
        ]),
      ),
      Condition: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } },
    },
    { Sid: 'ReadOneOffLogs', Effect: 'Allow', Action: 'logs:GetLogEvents', Resource: oneOffStreams },
    {
      Sid: 'NoReads',
      Effect: 'Deny',
      Action: [
        'secretsmanager:GetSecretValue',
        'ecs:ExecuteCommand',
        'ssm:StartSession',
        'rds-db:connect',
        's3:GetObject',
      ],
      Resource: '*',
    },
    { Sid: 'OnlyOneOffLogs', Effect: 'Deny', Action: 'logs:*', NotResource: [...oneOffGroups, ...oneOffStreams] },
    // The guardrails let it assume any hearthapp role; it needs the two that deploy and publish, never
    // the lookup role, whose ReadOnlyAccess reads objects and logs.
    { Sid: 'OnlyAppRoles', Effect: 'Deny', Action: 'sts:AssumeRole', NotResource: appRoles },
    modelDeny(),
  ]
}
