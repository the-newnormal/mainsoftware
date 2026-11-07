// Hearth-<env>-Platform (C11-D27): what every other workload stack of the environment stands on, and
// what changes least. The network (VPC, subnets, flow log, security groups), the VPC endpoints, the
// twelve task and execution roles, the cluster, the six task kinds' log groups and, where the profile
// has one, the load balancer with its certificate and record; then the SSM parameters the Data, Tasks
// and Services stacks, the pipeline and break-glass read. It is deployed first, and the stage turns
// its termination protection on.
//
// Nothing crosses to another stack as a construct or an export (C11-D24): each value another stack
// needs is an SSM parameter named in names.ts (the isolated subnets, each task kind's and Valkey's
// security group, each target group), and everything else is a name (the cluster, the families, the
// roles, the log groups). The organisation id the endpoint policies trust is read the same way, from
// the parameter each workload Baseline writes (C11-D30).
//
// Every log group keeps its class's days (app_logs, network_logs) and outlives the stack, but not a
// first create that rolled back, whose retry would otherwise find the name taken. The cluster keeps no
// Container Insights (C0.13's observability decides, for cost) and logs nothing of an ECS Exec
// session: the bastion's one use is a port forward whose bytes are TLS to Postgres, and an interactive
// shell's output, whatever it showed, would otherwise sit in the bastion's group for its days.
// CloudTrail records RunTask, ExecuteCommand and StartSession, and A8 alarms on each in prod (C11-D40,
// TECH-SPEC T24 item 15).
import * as cdk from 'aws-cdk-lib'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'
import { clusterName, logGroupName, SSM_PARAMETER } from '../config/names.ts'
import type { EnvironmentName, Profile } from '../config/profiles.ts'
import { cloudWatchRetention } from '../config/retention.ts'
import { Endpoints } from './endpoints.ts'
import { LoadBalancer, ROUTED_ROLES } from './load-balancer.ts'
import { confineDefaultSgHandler, Network } from './network.ts'
import { constructId, WORKLOAD_KINDS, WorkloadRoles } from './roles.ts'

// What the Platform stack reads of the run (stage.ts's WorkloadRun): whether the restore stage is
// active, which decides whether its interface endpoints exist (C11-D45).
export interface PlatformRun {
  readonly restoreActive: boolean
}

export interface PlatformStackProps extends cdk.StackProps {
  environment: EnvironmentName
  profile: Profile
  run: PlatformRun
}

export class PlatformStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props)
    const { environment, profile, run } = props

    const network = new Network(this, 'Network', { environment, profile })
    confineDefaultSgHandler(this)
    const { vpc, groups } = network

    const orgId = ssm.StringParameter.valueForStringParameter(this, SSM_PARAMETER.organisationId)
    new Endpoints(this, 'Endpoints', {
      profile,
      vpc,
      group: groups.endpoints,
      orgId,
      interfaces: profile.live === true || run.restoreActive,
    })

    new WorkloadRoles(this, 'Roles', { environment, profile, vpcId: vpc.vpcId })

    new ecs.CfnCluster(this, 'Cluster', {
      clusterName: clusterName(environment),
      clusterSettings: [{ name: 'containerInsights', value: 'disabled' }],
      configuration: { executeCommandConfiguration: { logging: 'NONE' } },
    })

    const logGroups = new Construct(this, 'LogGroups')
    for (const kind of WORKLOAD_KINDS) {
      new logs.LogGroup(logGroups, constructId(kind), {
        logGroupName: logGroupName(environment, kind),
        retention: cloudWatchRetention('app_logs'),
        logGroupClass: logs.LogGroupClass.STANDARD,
        removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      })
    }

    const albGroup = groups.alb
    const loadBalancer =
      profile.alb === undefined || albGroup === undefined
        ? undefined
        : new LoadBalancer(this, 'LoadBalancer', { environment, profile, vpc, albGroup })

    // What the later stacks, the pipeline and break-glass read by name (C11-D24).
    const parameters = new Construct(this, 'Parameters')
    new ssm.StringListParameter(parameters, 'IsolatedSubnets', {
      parameterName: SSM_PARAMETER.isolatedSubnets(environment),
      stringListValue: vpc.isolatedSubnets.map(subnet => subnet.subnetId),
    })
    for (const kind of [...WORKLOAD_KINDS, 'valkey'] as const) {
      new ssm.StringParameter(parameters, `${constructId(kind)}Group`, {
        parameterName: SSM_PARAMETER.securityGroup(environment, kind),
        stringValue: groups[kind].attrGroupId,
      })
    }
    if (loadBalancer !== undefined) {
      for (const role of ROUTED_ROLES) {
        new ssm.StringParameter(parameters, `${constructId(role)}TargetGroup`, {
          parameterName: SSM_PARAMETER.targetGroup(environment, role),
          stringValue: loadBalancer.targetGroupArns[role],
        })
      }
    }
  }
}
