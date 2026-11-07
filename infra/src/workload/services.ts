// Hearth-<env>-Services (C11-D27, C11-D39): the api, realtime and worker task definitions at the
// release's image, their ECS services, and the Release output, AWS's copy of what runs (C11-D61). It
// is the stack every release changes, so its termination protection stays off and a rollback deploys
// it, with Tasks, alone (C11-D52).
//
// Each definition is sized by the profile (C11-D28), runs its role's command with its role's
// environment and nothing else (C11-D36, C11-D37, T18 item 6: each role reads only its own database
// login), and takes Platform's roles by name, immutable, so ECS adds no grant (C11-D38). The api's
// container alone gets the AUTH_SECRET, by reference to the secret's full ARN, which the Data stack
// writes to SSM (C11-D35).
//
// Each definition is kept when a release replaces it (C11-D12, C11-D58). A definition can't change in
// place, so every release replaces all three, and CloudFormation's default would deregister the ones
// it replaced; ECS refuses to point a service at a deregistered (INACTIVE) revision, so break-glass's
// incident rollback to an earlier revision while GitHub is down, which can neither register a
// revision nor pass these roles, would have nothing to go back to. A revision costs nothing, and a
// first create that rolls back still removes its own (RetainExceptOnCreate). Such a rollback skips the
// pipeline's floors check (C11-D58), and the next pipeline deploy reconciles it.
//
// The services are L1s, so the template holds exactly what is written here: Fargate on the latest
// platform, in the cluster by name, in the isolated subnets with the role's own security group and no
// public address; rolling deploys at 100 % minimum and 200 % maximum with the circuit breaker rolling a
// failed release back; AZ rebalancing on; no ECS Exec; no autoscaling. The api and realtime are
// registered with their target groups, read by name from SSM, where the profile has a load balancer,
// with a 30 s health-check grace period, which only a service with a load balancer has (so never the
// worker, and never a restore service). Realtime runs at least two tasks wherever there is a load
// balancer (T19 item 16). There are no deployment alarms in C0.11 (C11-D39): SMK-02's expected 503
// counts as a target 5xx, so an alarm that rolls back on it would roll back every deploy; C0.13 adds
// them once SMK-02 expects 400.
//
// The restore stage's services exist at desired 0, reading its placeholder Valkey host, unless
// restoreActive is set (C11-D45).
import * as cdk from 'aws-cdk-lib'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'
import { clusterName, execRoleName, SSM_PARAMETER, serviceName, taskFamily, taskRoleName } from '../config/names.ts'
import { type EnvironmentName, type Profile, ROLES } from '../config/profiles.ts'
import { constructId } from './roles.ts'
import { SERVER_PORT, serverCommand, serverContainer, serverEnvironment } from './server-task.ts'
import type { WorkloadRun } from './stage.ts'

export interface ServicesStackProps extends cdk.StackProps {
  environment: EnvironmentName
  profile: Profile
  run: WorkloadRun
}

export class ServicesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ServicesStackProps) {
    super(scope, id, props)
    const { environment, profile, run } = props
    if (profile.alb !== undefined && profile.services.realtime.count < 2) {
      throw new Error(`${environment} has a load balancer, so realtime runs at least two tasks (T19 item 16)`)
    }
    // Whether the services run: always where the profile is live, and in the restore stage only while
    // it is active.
    const live = profile.live === true || (profile.live === 'restoreActive' && run.restoreActive)

    const read = (name: string) => ssm.StringParameter.valueForStringParameter(this, name)
    const subnets = ssm.StringListParameter.valueForTypedListParameter(this, SSM_PARAMETER.isolatedSubnets(environment))
    const valkeyHost = read(SSM_PARAMETER.valkeyEndpoint(environment))
    const authSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'AuthSecret',
      read(SSM_PARAMETER.authSecretArn(environment)),
    )

    for (const role of ROLES) {
      const name = constructId(role)
      const size = profile.services[role]
      const definition = new ecs.FargateTaskDefinition(this, `${name}Task`, {
        family: taskFamily(environment, role),
        cpu: size.cpu,
        memoryLimitMiB: size.memoryMiB,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
        taskRole: iam.Role.fromRoleName(this, `${name}TaskRole`, taskRoleName(environment, role), { mutable: false }),
        executionRole: iam.Role.fromRoleName(this, `${name}ExecRole`, execRoleName(environment, role), {
          mutable: false,
        }),
      })
      // Kept when replaced or removed, so an earlier release's revision stays ACTIVE (the header).
      definition.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE)
      serverContainer(definition, {
        env: environment,
        kind: role,
        release: run.release,
        command: serverCommand(role),
        environment: serverEnvironment(environment, role, profile, valkeyHost, run.drill),
        ...(role === 'api' ? { secrets: { AUTH_SECRET: ecs.Secret.fromSecretsManager(authSecret) } } : {}),
        service: true,
        readonlyRoot: true,
      })

      // The api's and realtime's target group, where the profile has a load balancer.
      const targetGroupArn =
        profile.alb !== undefined && role !== 'worker' ? read(SSM_PARAMETER.targetGroup(environment, role)) : undefined
      new ecs.CfnService(this, `${name}Service`, {
        serviceName: serviceName(environment, role),
        cluster: clusterName(environment),
        taskDefinition: definition.taskDefinitionArn,
        launchType: 'FARGATE',
        platformVersion: 'LATEST',
        desiredCount: live ? size.count : 0,
        networkConfiguration: {
          awsvpcConfiguration: {
            assignPublicIp: 'DISABLED',
            subnets,
            securityGroups: [read(SSM_PARAMETER.securityGroup(environment, role))],
          },
        },
        deploymentConfiguration: {
          minimumHealthyPercent: 100,
          maximumPercent: 200,
          deploymentCircuitBreaker: { enable: true, rollback: true },
        },
        availabilityZoneRebalancing: 'ENABLED',
        enableExecuteCommand: false,
        ...(targetGroupArn === undefined
          ? {}
          : {
              loadBalancers: [{ containerName: 'server', containerPort: SERVER_PORT, targetGroupArn }],
              healthCheckGracePeriodSeconds: 30,
            }),
      })
    }

    new cdk.CfnOutput(this, 'Release', {
      value: `${run.release.commit}:${run.release.digest}`,
      description: 'The release these services run, as <commit>:<digest> (C11-D61)',
    })
  }
}
