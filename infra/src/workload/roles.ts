// The workload's task and execution roles (C11-D38), and the small IAM helpers every workload
// construct writes its policies with. One task role and one execution role per kind
// (hearth-<env>-<kind>-task and -exec; rule9's are C1.11's), each an L1 role with plain-object
// documents, so a template holds exactly what this file says and nothing merges statements. The task
// definitions take them by name and immutable, so ECS adds no grant of its own, and every one is made
// with hearth-boundary (C11-D26, aspects/boundary.ts). No role here carries a managed policy.
//
// Task roles hold the network perimeter while the profile has it on (C11-D33: non-prod and restore
// now, prod after a week of clean deploys) and, the bastion's alone, ECS Exec's channels (C11-D40);
// C0.12 grants each its own bucket actions and database login. A task role with nothing to hold has
// no inline policy. Execution roles pull the server image, write their own group's streams and, the
// api's alone, read the AUTH_SECRET (C11-D35, C11-D38). Every trust names ECS's tasks with the
// confused-deputy conditions on the deploying account; whether ECS meets both is proved when
// non-prod's first task starts, and the fallback is the account condition alone (TECH-SPEC T24 item 15).
//
// The roles' names are the landing zone's fences' (hearth-workload-fences' database logins,
// break-glass's PassBastionRoles, hearth-gh-deploy's PassOneOffRoles), so a rename moves a fence. The
// helpers live here because foundation/denies.ts is out of the workload entry's graph (IG-08). An ARN
// in the deploying account is joined from parts with its account as a pseudo-parameter (ownArn), an
// account-less one comes from arnPattern(), and none is written as a literal (IG-01). This file holds
// every workload grant and the network perimeter, so it is on the owner's-read list (C11-D74).
import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import { PARTITION } from '../config/arns.ts'
import {
  authSecretName,
  execRoleName,
  logGroupName,
  SERVER_REPOSITORY,
  TASK_ROLE_KINDS,
  taskRoleName,
  type WorkloadKind,
} from '../config/names.ts'
import { type EnvironmentName, type Profile, REGION } from '../config/profiles.ts'

// One IAM statement as a workload document holds it. A Resource or Condition value may be a token (an
// account, a VPC's id, the organisation's id from SSM), which CloudFormation renders. A trust's
// statements name no resource.
export interface IamStatement {
  Sid: string
  Effect: 'Allow' | 'Deny'
  Principal?: unknown
  Action?: string | readonly string[]
  NotAction?: string | readonly string[]
  Resource?: unknown
  Condition?: Record<string, Record<string, unknown>>
}

export interface IamDocument {
  Version: '2012-10-17'
  Statement: IamStatement[]
}

export const document = (Statement: IamStatement[]): IamDocument => ({ Version: '2012-10-17', Statement })

// An ARN in the deploying account and ap-southeast-1, joined from its parts: the account is
// AWS::AccountId, so the stack stays account-agnostic (C11-D24), and the partition is literal, so plain
// Node and the CLI render the same.
export const ownArn = (service: string, resource: string): string =>
  ['arn', PARTITION, service, REGION, cdk.Aws.ACCOUNT_ID, resource].join(':')

// The kinds the workload makes roles, groups and log groups for, in TASK_ROLE_KINDS' order: every one
// but rule9 (C1.11).
export const WORKLOAD_KINDS: readonly WorkloadKind[] = TASK_ROLE_KINDS.filter(
  (kind): kind is WorkloadKind => kind !== 'rule9',
)

// A kind's construct id (`api` is `Api`), which the nag allowances' paths name.
export const constructId = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1)

// The network perimeter (C11-D33), AWS's data-perimeter shape: a task credential used outside this
// VPC, other than by an AWS service acting for it, can do nothing. rds-db:connect is left out because
// RDS evaluates it with no aws:SourceVpc, so C0.12's IAM logins would fail otherwise.
export function perimeterDeny(vpcId: string): IamStatement {
  return {
    Sid: 'NetworkPerimeter',
    Effect: 'Deny',
    NotAction: 'rds-db:connect',
    Resource: '*',
    Condition: {
      StringNotEqualsIfExists: { 'aws:SourceVpc': vpcId },
      BoolIfExists: { 'aws:ViaAWSService': 'false' },
    },
  }
}

// The four calls ECS Exec's agent makes to Systems Manager's message service, which take no resource
// (C11-D40). The bastion's task role holds them, and the ssmmessages endpoint lets them through.
export const ECS_EXEC_CHANNELS = [
  'ssmmessages:CreateControlChannel',
  'ssmmessages:CreateDataChannel',
  'ssmmessages:OpenControlChannel',
  'ssmmessages:OpenDataChannel',
] as const

// Who may assume a task or execution role: ECS's tasks, for a task of this account's own clusters.
const ecsTasksTrust = (): IamDocument =>
  document([
    {
      Sid: 'EcsTasks',
      Effect: 'Allow',
      Principal: { Service: 'ecs-tasks.amazonaws.com' },
      Action: 'sts:AssumeRole',
      Condition: {
        StringEquals: { 'aws:SourceAccount': cdk.Aws.ACCOUNT_ID },
        ArnLike: { 'aws:SourceArn': ownArn('ecs', '*') },
      },
    },
  ])

// A task role's statements: the perimeter while the profile has it on, and the bastion's channels.
function taskStatements(kind: WorkloadKind, profile: Profile, vpcId: string): IamStatement[] {
  return [
    ...(profile.taskRolePerimeter ? [perimeterDeny(vpcId)] : []),
    ...(kind === 'bastion'
      ? [{ Sid: 'EcsExecChannels', Effect: 'Allow' as const, Action: [...ECS_EXEC_CHANNELS], Resource: '*' }]
      : []),
  ]
}

// An execution role's statements: the server image by its repository, the registry's token (which
// takes no resource), its own group's streams, and the api's AUTH_SECRET. The Data stack makes the
// secret after Platform, so it is named by its pattern: the name and the six characters Secrets
// Manager appends.
function execStatements(environment: EnvironmentName, kind: WorkloadKind): IamStatement[] {
  return [
    {
      Sid: 'PullServerImage',
      Effect: 'Allow',
      Action: ['ecr:BatchCheckLayerAvailability', 'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'],
      Resource: ownArn('ecr', `repository/${SERVER_REPOSITORY}`),
    },
    { Sid: 'RegistryToken', Effect: 'Allow', Action: 'ecr:GetAuthorizationToken', Resource: '*' },
    {
      Sid: 'WriteOwnLogs',
      Effect: 'Allow',
      Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      Resource: ownArn('logs', `log-group:${logGroupName(environment, kind)}:log-stream:*`),
    },
    ...(kind === 'api'
      ? [
          {
            Sid: 'ReadAuthSecret',
            Effect: 'Allow' as const,
            Action: 'secretsmanager:GetSecretValue',
            Resource: ownArn('secretsmanager', `secret:${authSecretName(environment)}-??????`),
          },
        ]
      : []),
  ]
}

export interface WorkloadRolesProps {
  environment: EnvironmentName
  profile: Profile
  // The VPC the perimeter holds task credentials to.
  vpcId: string
}

// Each kind's two roles, as `<Kind>Task` and `<Kind>Exec`.
export class WorkloadRoles extends Construct {
  readonly task: Readonly<Record<WorkloadKind, iam.CfnRole>>
  readonly exec: Readonly<Record<WorkloadKind, iam.CfnRole>>

  constructor(scope: Construct, id: string, props: WorkloadRolesProps) {
    super(scope, id)
    const { environment, profile, vpcId } = props
    const task = {} as Record<WorkloadKind, iam.CfnRole>
    const exec = {} as Record<WorkloadKind, iam.CfnRole>
    for (const kind of WORKLOAD_KINDS) {
      const statements = taskStatements(kind, profile, vpcId)
      task[kind] = new iam.CfnRole(this, `${constructId(kind)}Task`, {
        roleName: taskRoleName(environment, kind),
        assumeRolePolicyDocument: ecsTasksTrust(),
        ...(statements.length === 0
          ? {}
          : { policies: [{ policyName: 'hearth-task', policyDocument: document(statements) }] }),
      })
      exec[kind] = new iam.CfnRole(this, `${constructId(kind)}Exec`, {
        roleName: execRoleName(environment, kind),
        assumeRolePolicyDocument: ecsTasksTrust(),
        policies: [{ policyName: 'hearth-exec', policyDocument: document(execStatements(environment, kind)) }],
      })
    }
    this.task = task
    this.exec = exec
  }
}
