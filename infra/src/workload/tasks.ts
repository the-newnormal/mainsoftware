// Hearth-<env>-Tasks (C11-D27, C11-D40): the three one-off task definitions at the release's image,
// and the outputs the pipeline's run-task reads (C0.11 PR 4). No service runs them: each runs only
// when asked, and each is fenced by name in the landing zone.
// - hearth-<env>-migrate: `node src/db/migrate.ts`, read-only root. Only hearth-gh-deploy may run it,
//   always without overrides; the pipeline skips it until the profile has a database (C0.12, which
//   gives it its login).
// - hearth-<env>-probe: the readiness probe (C11-D53), read-only root, run by hearth-gh-deploy alone
//   after every deploy. Its only variable is PROBE_TARGETS, the run's one override; the roles whose
//   /ready must answer 200 are its command's --gate= argument, from the profile's readyGate (none
//   until C0.12). The gate is in the command, never the environment, so changing it is a command
//   override, which A7RunCommand alarms on whoever makes it. That alone doesn't keep a release gated:
//   A7RunEnvironment lets through any environment override of prod's probe the deploy role makes,
//   NODE_OPTIONS or PROBE_TARGETS naming any task included, so PR 4's DPW case pins the override to
//   PROBE_TARGETS alone, from the new deployment's tasks (TECH-SPEC T24 items 5 and 15).
// - hearth-<env>-bastion: the server image running a timer that exits after an hour, so it runs no
//   server code; no environment, no secret, no port. Only hearth-break-glass may run it (C11-D11), with
//   ECS Exec for its one sanctioned use, a port forward. ECS Exec needs to write, so its root is
//   writable, and its init process is on, as AWS recommends for ECS Exec; whether the forward works
//   with the node user, and with a read-only root and writable volumes instead, is tried on non-prod
//   before either is relied on (TECH-SPEC T24 item 15).
// Each definition is tagged hearth-role with its kind (TECH-SPEC T24 item 11), which hearth-gh-deploy's
// StopOneOffs and break-glass's exec statement match once RunTask propagates it to the task. The roles
// are Platform's, by name and immutable, so ECS adds no grant (C11-D38).
//
// The outputs carry no export (C11-D24), and are what hearth-gh-deploy's DescribeStacks on
// Hearth-<env>-* reads: the cluster, the isolated subnets (comma-joined), the migrate and probe security
// groups, the two definitions' ARNs, and whether the environment has its database yet. The bastion's
// network comes from SSM, which break-glass reads (/hearth/<env>/network/isolated-subnets and
// /hearth/<env>/security-group/bastion).
import * as cdk from 'aws-cdk-lib'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'
import { clusterName, execRoleName, SSM_PARAMETER, TAG_KEY, taskFamily, taskRoleName } from '../config/names.ts'
import type { EnvironmentName, Profile } from '../config/profiles.ts'
import { constructId } from './roles.ts'
import { serverContainer } from './server-task.ts'
import type { WorkloadRun } from './stage.ts'

export interface TasksStackProps extends cdk.StackProps {
  environment: EnvironmentName
  profile: Profile
  run: WorkloadRun
}

// The one-offs this stack defines.
export const ONE_OFF_KINDS = ['migrate', 'probe', 'bastion'] as const
export type OneOffKind = (typeof ONE_OFF_KINDS)[number]

// Each one-off's command. The probe's gate is its one argument, `none` while the profile gates no role.
export function oneOffCommand(kind: OneOffKind, profile: Profile): string[] {
  switch (kind) {
    case 'migrate':
      return ['node', 'src/db/migrate.ts']
    case 'probe':
      return [
        'node',
        'src/deploy/ready-probe.ts',
        `--gate=${profile.readyGate.length === 0 ? 'none' : profile.readyGate.join(',')}`,
      ]
    case 'bastion':
      return ['node', '-e', 'setTimeout(()=>{},60*60*1000)']
  }
}

export class TasksStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TasksStackProps) {
    super(scope, id, props)
    const { environment, profile, run } = props

    const definitions = {} as Record<OneOffKind, ecs.FargateTaskDefinition>
    for (const kind of ONE_OFF_KINDS) {
      const name = constructId(kind)
      const definition = new ecs.FargateTaskDefinition(this, `${name}Task`, {
        family: taskFamily(environment, kind),
        cpu: 256,
        memoryLimitMiB: 512,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
        taskRole: iam.Role.fromRoleName(this, `${name}TaskRole`, taskRoleName(environment, kind), { mutable: false }),
        executionRole: iam.Role.fromRoleName(this, `${name}ExecRole`, execRoleName(environment, kind), {
          mutable: false,
        }),
      })
      serverContainer(definition, {
        env: environment,
        kind,
        release: run.release,
        command: oneOffCommand(kind, profile),
        service: false,
        readonlyRoot: kind !== 'bastion',
        ...(kind === 'bastion'
          ? { linuxParameters: new ecs.LinuxParameters(this, 'BastionLinux', { initProcessEnabled: true }) }
          : {}),
      })
      cdk.Tags.of(definition).add(TAG_KEY.role, kind)
      definitions[kind] = definition
    }

    const securityGroup = (kind: 'migrate' | 'probe') =>
      ssm.StringParameter.valueForStringParameter(this, SSM_PARAMETER.securityGroup(environment, kind))
    const outputs: Record<string, { value: string; description: string }> = {
      Cluster: { value: clusterName(environment), description: 'The cluster the one-offs run in (C11-D40)' },
      IsolatedSubnets: {
        value: cdk.Fn.join(
          ',',
          ssm.StringListParameter.valueForTypedListParameter(this, SSM_PARAMETER.isolatedSubnets(environment)),
        ),
        description: 'The isolated subnets a one-off runs in, comma-joined (C11-D29)',
      },
      MigrateSecurityGroup: {
        value: securityGroup('migrate'),
        description: "The migrate task's security group (C11-D31)",
      },
      ProbeSecurityGroup: { value: securityGroup('probe'), description: "The probe task's security group (C11-D31)" },
      MigrateTaskDefinition: {
        value: definitions.migrate.taskDefinitionArn,
        description: 'The migrate definition at this release (C11-D40)',
      },
      ProbeTaskDefinition: {
        value: definitions.probe.taskDefinitionArn,
        description: 'The readiness probe definition at this release (C11-D53)',
      },
      HasDatabase: {
        value: String(profile.hasDatabase),
        description: 'Whether the pipeline runs migrate: false until C0.12 makes the database (C11-D37)',
      },
    }
    for (const [outputId, output] of Object.entries(outputs)) new cdk.CfnOutput(this, outputId, output)
  }
}
