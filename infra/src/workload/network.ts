// A workload environment's network (C11-D29, C11-D31, C11-D32): the VPC and its subnets, the flow log,
// and the security groups with every rule between them. The Platform stack makes it as `Network`.
//
// Subnets (C11-D29): two AZs by Fn::GetAZs (no lookup, C11-D24), no NAT. `public` (/24 an AZ) holds
// the load balancer alone. Its subnets give an instance no public address on launch, a setting that
// doesn't cover a Fargate task: a task gets one only if its own assignPublicIp asks for one. The
// services set DISABLED (aspects/templates.test.ts holds it). A one-off task takes its subnets and
// assignPublicIp from its run-task call alone, and RunTask has no IAM condition key for either, so
// break-glass.md's bastion run passes DISABLED and the isolated subnets, as the pipeline's migrate
// and probe runs must (C0.11 PR 4): a run that asked for an address in a public subnet would get one
// (VPC Block Public Access waits for C0.19). `isolated` (/20 an AZ) holds the tasks, the endpoints
// and Valkey, with no route but the VPC's own and the S3 gateway endpoint, which only the isolated
// route tables carry. The restore stage has no public group, so no internet gateway or public route
// can exist there (C11-D45). CDK allocates each group's CIDRs in the order the groups are listed, so
// C0.12 appends its `egress` group last, never before an existing one, or every subnet after it
// would move and be replaced.
//
// The flow log (C11-D32) sends all of the VPC's traffic to /hearth/<env>/vpc-flow, kept for the
// network_logs class's days, through an unnamed role only VPC Flow Logs may assume, for this
// account's own flow logs. ec2:DeleteFlowLogs is fenced at Root but for the two CloudFormation
// execution roles (ProtectFlowLogs), and A6 alarms on a deleted one.
//
// Security groups (C11-D31) are L1s, each with EC2's placeholder rule written inline as its only
// egress (NO_TRAFFIC), so CloudFormation removes the allow-all egress EC2 gives a new group
// whatever the separate rules do. Every group-to-group rule is a separate resource written on both
// sides (the source's egress and the peer's ingress), and every prefix-list rule a separate egress.
// Every task group reaches the interface endpoints and the S3 gateway on 443, since a Fargate
// task's own interface pulls its image, ships its logs and fetches its secrets. The groups carry no
// name, so a change that replaces one can, and their descriptions are never edited (a new
// description replaces the group). The rules each group may hold are pinned in
// aspects/templates.test.ts and network.test.ts.
//
// The VPC's default security group is emptied by aws-cdk-lib's own handler, the one custom resource
// infra may hold (TECH-SPEC T24 item 28); confineDefaultSgHandler leaves it no logs permission.
import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'
import { FLOW_LOG_KIND, logGroupName, type WorkloadKind } from '../config/names.ts'
import type { EnvironmentName, Profile } from '../config/profiles.ts'
import { cloudWatchRetention } from '../config/retention.ts'
import { constructId, document, ownArn, WORKLOAD_KINDS } from './roles.ts'

// EC2's own placeholder egress rule, which aws-cdk-lib writes for a group that may send nothing: no
// packet matches ICMP type 252, code 86, to the broadcast address. Every workload group carries it
// as its one inline egress rule.
export const NO_TRAFFIC = {
  cidrIp: '255.255.255.255/32',
  description: 'Disallow all traffic',
  ipProtocol: 'icmp',
  fromPort: 252,
  toPort: 86,
} as const

// The port every server role listens on, the load balancer's and the probe's target.
const SERVER_PORT = 3000
const HTTPS_PORT = 443
const VALKEY_PORT = 6379

// The groups the network makes: one per task kind, the load balancer's (none in restore), the
// interface endpoints' and Valkey's.
export type GroupKind = WorkloadKind | 'alb' | 'endpoints' | 'valkey'

export interface NetworkGroups extends Readonly<Record<Exclude<GroupKind, 'alb'>, ec2.CfnSecurityGroup>> {
  readonly alb: ec2.CfnSecurityGroup | undefined
}

export interface NetworkProps {
  environment: EnvironmentName
  profile: Profile
}

// What each group is, in a sentence that never changes once deployed.
const GROUP_DESCRIPTION: Readonly<Record<GroupKind, string>> = {
  alb: 'load balancer in front of api and realtime',
  api: 'api tasks',
  realtime: 'realtime tasks',
  worker: 'worker tasks',
  migrate: 'migrate one-off tasks',
  probe: 'readiness probe one-off tasks',
  bastion: 'bastion task',
  endpoints: 'interface endpoints',
  valkey: 'Valkey',
}

export class Network extends Construct {
  readonly vpc: ec2.Vpc
  readonly groups: NetworkGroups

  constructor(scope: Construct, id: string, props: NetworkProps) {
    super(scope, id)
    const { environment, profile } = props
    const hasAlb = profile.alb !== undefined

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `hearth-${environment}`,
      ipAddresses: ec2.IpAddresses.cidr(profile.vpcCidr),
      maxAzs: profile.taskAzs,
      natGateways: 0,
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        ...(hasAlb
          ? [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24, mapPublicIpOnLaunch: false }]
          : []),
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 20 },
        // C0.12's `egress` group goes here, after every existing one.
      ],
    })
    const vpcId = this.vpc.vpcId

    // The flow log (C11-D32).
    const flowLogGroupName = logGroupName(environment, FLOW_LOG_KIND)
    const flowLogGroup = new logs.LogGroup(this, 'FlowLogGroup', {
      logGroupName: flowLogGroupName,
      retention: cloudWatchRetention('network_logs'),
      logGroupClass: logs.LogGroupClass.STANDARD,
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    })
    const flowLogGroupArn = ownArn('logs', `log-group:${flowLogGroupName}`)
    const flowLogRole = new iam.CfnRole(this, 'FlowLogRole', {
      assumeRolePolicyDocument: document([
        {
          Sid: 'VpcFlowLogs',
          Effect: 'Allow',
          Principal: { Service: 'vpc-flow-logs.amazonaws.com' },
          Action: 'sts:AssumeRole',
          Condition: {
            StringEquals: { 'aws:SourceAccount': cdk.Aws.ACCOUNT_ID },
            ArnLike: { 'aws:SourceArn': ownArn('ec2', 'vpc-flow-log/*') },
          },
        },
      ]),
      policies: [
        {
          policyName: 'hearth-flow-log',
          policyDocument: document([
            {
              Sid: 'DeliverFlowLogs',
              Effect: 'Allow',
              Action: ['logs:CreateLogStream', 'logs:DescribeLogStreams', 'logs:PutLogEvents'],
              Resource: [flowLogGroupArn, `${flowLogGroupArn}:*`],
            },
          ]),
        },
      ],
    })
    new ec2.CfnFlowLog(this, 'FlowLog', {
      resourceId: vpcId,
      resourceType: 'VPC',
      trafficType: 'ALL',
      logDestinationType: 'cloud-watch-logs',
      logGroupName: flowLogGroup.logGroupName,
      deliverLogsPermissionArn: flowLogRole.attrArn,
      maxAggregationInterval: 600,
    })

    // The security groups and their rules (C11-D31).
    const groupScope = new Construct(this, 'Groups')
    const group = (kind: GroupKind, ingress?: ec2.CfnSecurityGroup.IngressProperty[]) =>
      new ec2.CfnSecurityGroup(groupScope, constructId(kind), {
        vpcId,
        groupDescription: `Hearth ${environment} ${GROUP_DESCRIPTION[kind]} (C11-D31)`,
        securityGroupEgress: [NO_TRAFFIC],
        ...(ingress === undefined ? {} : { securityGroupIngress: ingress }),
      })
    // C0.12 turns the load balancer's one inline rule to CloudFront's prefix list.
    const alb = hasAlb
      ? group('alb', [
          {
            ipProtocol: 'tcp',
            fromPort: HTTPS_PORT,
            toPort: HTTPS_PORT,
            cidrIp: '0.0.0.0/0',
            description: 'HTTPS from the internet until C0.12 (C11-D31)',
          },
        ])
      : undefined
    const tasks = {} as Record<WorkloadKind, ec2.CfnSecurityGroup>
    for (const kind of WORKLOAD_KINDS) tasks[kind] = group(kind)
    const endpoints = group('endpoints')
    const valkey = group('valkey')
    this.groups = { ...tasks, alb, endpoints, valkey }

    // One rule between two groups, written on both sides: the source's egress and the target's
    // ingress, each named for what it does (`ApiToValkey`, `ValkeyFromApi`).
    const connect = (from: GroupKind, to: GroupKind, port: number) => {
      const source = this.groups[from]
      const target = this.groups[to]
      if (source === undefined || target === undefined) throw new Error(`no ${from} or ${to} group to connect`)
      const what = `tcp ${port} (C11-D31)`
      new ec2.CfnSecurityGroupEgress(groupScope, `${constructId(from)}To${constructId(to)}`, {
        groupId: source.attrGroupId,
        destinationSecurityGroupId: target.attrGroupId,
        ipProtocol: 'tcp',
        fromPort: port,
        toPort: port,
        description: `${from} to ${to}, ${what}`,
      })
      new ec2.CfnSecurityGroupIngress(groupScope, `${constructId(to)}From${constructId(from)}`, {
        groupId: target.attrGroupId,
        sourceSecurityGroupId: source.attrGroupId,
        ipProtocol: 'tcp',
        fromPort: port,
        toPort: port,
        description: `${to} from ${from}, ${what}`,
      })
    }
    // A task group's way to the S3 gateway endpoint, for ECR's image layers: the Region's S3 prefix
    // list, which no construct exposes and no lookup may read (IG-02), so the profile names it.
    const toS3 = (from: WorkloadKind) =>
      new ec2.CfnSecurityGroupEgress(groupScope, `${constructId(from)}ToS3`, {
        groupId: tasks[from].attrGroupId,
        destinationPrefixListId: profile.s3PrefixList,
        ipProtocol: 'tcp',
        fromPort: HTTPS_PORT,
        toPort: HTTPS_PORT,
        description: `${from} to the S3 gateway endpoint, tcp ${HTTPS_PORT} (C11-D31)`,
      })

    // The load balancer reaches the two roles it routes to.
    if (hasAlb) {
      connect('alb', 'api', SERVER_PORT)
      connect('alb', 'realtime', SERVER_PORT)
    }
    // The probe reaches each service's /ready.
    for (const role of ['api', 'realtime', 'worker'] as const) connect('probe', role, SERVER_PORT)
    // Every task reaches the interface endpoints and the S3 gateway.
    for (const kind of WORKLOAD_KINDS) {
      connect(kind, 'endpoints', HTTPS_PORT)
      toS3(kind)
    }
    // The three services reach Valkey (C11-D35).
    for (const role of ['api', 'realtime', 'worker'] as const) connect(role, 'valkey', VALKEY_PORT)
  }
}

// aws-cdk-lib's handler for the VPC's default security group (restrictDefaultSecurityGroup) revokes
// that group's rules once, when the VPC is made, through a Lambda function and its own role, both raw
// CloudFormation resources the stack holds beside each other. As made, the role carries AWS's basic
// Lambda execution policy, so Lambda would write the handler's output to a /aws/lambda/ group no
// retention class covers. This takes that managed policy off: the handler keeps only its inline
// rights on the default group, Lambda makes no log group, and a failure shows in the stack's events.
// The two are found by their CloudFormation types, never by the provider's id (IG-11). An
// aws-cdk-lib upgrade that moves them makes this throw, and the IAC cases fail with it.
export function confineDefaultSgHandler(stack: cdk.Stack): void {
  const handlers = stack.node
    .findAll()
    .filter(
      (construct): construct is cdk.CfnResource =>
        cdk.CfnResource.isCfnResource(construct) && construct.cfnResourceType === 'AWS::Lambda::Function',
    )
  const handler = handlers[0]
  if (handlers.length !== 1 || handler === undefined) {
    throw new Error(`${stack.node.path} holds ${handlers.length} Lambda functions, not the default group's one handler`)
  }
  const scope = handler.node.scope
  const roles = (scope?.node.children ?? []).filter(
    (construct): construct is cdk.CfnResource =>
      cdk.CfnResource.isCfnResource(construct) && construct.cfnResourceType === 'AWS::IAM::Role',
  )
  const role = roles[0]
  if (roles.length !== 1 || role === undefined) {
    throw new Error(`the default group's handler in ${stack.node.path} has ${roles.length} roles beside it, not one`)
  }
  role.addPropertyDeletionOverride('ManagedPolicyArns')
}
