// The workload's composition (C11-D24, C11-D27): the stages bin/workload.ts builds, for the entry and
// the assertion tests alike, so the tests read exactly what the pipeline synthesises.
//
// One stage per environment (nonprod, prod and the restore stage, C11-D45), each with four stacks,
// Hearth-<env>-Platform, -Data, -Tasks and -Services, named so (a stage would otherwise name them
// <stage>-<id>, and the fences, hearth-gh-deploy's DescribeStacks and hearth-gh-diff match the names).
// Every stack is account-agnostic (`env: { region }`, no account), so the synth needs no credential
// and the assembly holds no account id, under the hearthapp qualifier (C11-D26), with every role made
// with hearth-boundary at creation (aspects/boundary.ts). Platform and Data keep termination
// protection; Tasks and Services, which every release changes, don't. The stacks are ordered by
// dependency alone, never an export (C11-D24): Data and Tasks stand on Platform, Services on Platform
// and Data. Services doesn't depend on Tasks, so a rollback can deploy Tasks and Services alone
// (C11-D52), which the pipeline does with the CLI's --exclusively, since the CLI otherwise deploys a
// selected stack's dependencies too.
//
// The run (resolveWorkloadRun) is what one synth is for, read from the CLI's context and one variable,
// each checked, and refused by naming the key alone, never its value:
// - release: `<commit>:<digest>` (40 and 64 lower-case hex), which the pipeline passes to infra's
//   synth script (C11-D51). It is refused while DOMAINS holds a placeholder, so no real release renders
//   a certificate that never validates (C11-Q08; TECH-SPEC T24 item 17);
// - HEARTH_FAKE_RELEASE=1, which only CI's synth:ci sets inside its cleared environment, asks for a
//   fake release built here, and is refused beside a release (C11-D62);
// - restoreActive: the restore stage's Valkey, interface endpoints and running services (C11-D45);
// - drill: `break:nonprod` builds the non-prod stage alone, with realtime's LOG_LEVEL broken, so a
//   drill can never reach prod's or restore's templates (C11-D59, IAC-17).
// The profiles are the committed ones (C11-D28); a test may pass variants through addWorkload's
// options, which the entry never does.
import * as cdk from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import { applyBoundary } from '../aspects/boundary.ts'
import { acknowledgeValidate } from '../aspects/nag.ts'
import { QUALIFIER, type WorkloadStackPart, workloadStackName } from '../config/names.ts'
import {
  DOMAINS,
  ENVIRONMENTS,
  type EnvironmentName,
  isPlaceholderDomain,
  PROFILES,
  type Profile,
  REGION,
} from '../config/profiles.ts'
import { DataStack } from './data.ts'
import { PlatformStack } from './platform.ts'
import { ServicesStack } from './services.ts'
import { TasksStack } from './tasks.ts'

// The image a synth deploys: the commit it was built from and its digest in ECR (C11-D51).
export interface Release {
  readonly commit: string
  readonly digest: string
}

// What one synth is for.
export interface WorkloadRun {
  readonly release: Release
  readonly restoreActive: boolean
  readonly drill: boolean
}

// A run the entry refuses; its message names the key and what it must be, never the value given.
export class WorkloadRunError extends Error {
  override name = 'WorkloadRunError'
}

// CI's release (C11-D62): a commit and a digest no build makes, built here so no source line holds a
// run of digits (IG-01).
export function fakeRelease(): Release {
  return { commit: 'f'.repeat(40), digest: `sha256:${'0'.repeat(64)}` }
}

const RELEASE = /^([0-9a-f]{40}):(sha256:[0-9a-f]{64})$/
const DRILL = 'break:nonprod'

export function resolveWorkloadRun(
  context: { release?: unknown; restoreActive?: unknown; drill?: unknown },
  environ: Record<string, string | undefined>,
): WorkloadRun {
  const marker = environ.HEARTH_FAKE_RELEASE
  if (marker !== undefined && marker !== '1') throw new WorkloadRunError('HEARTH_FAKE_RELEASE is not 1')
  let release: Release
  if (marker === '1') {
    if (context.release !== undefined) throw new WorkloadRunError('HEARTH_FAKE_RELEASE is set beside release')
    release = fakeRelease()
  } else {
    if (context.release === undefined) {
      throw new WorkloadRunError('release is missing: pass -c release=<commit>:<digest>')
    }
    const parts = typeof context.release === 'string' ? RELEASE.exec(context.release) : null
    const [, commit, digest] = parts ?? []
    if (commit === undefined || digest === undefined) throw new WorkloadRunError('release is malformed')
    if (Object.values(DOMAINS).some(isPlaceholderDomain)) {
      throw new WorkloadRunError(
        "DOMAINS still holds a placeholder: a real release waits for the owner's names (C11-Q08)",
      )
    }
    release = { commit, digest }
  }
  const { restoreActive, drill } = context
  if (restoreActive !== undefined && restoreActive !== true && restoreActive !== 'true') {
    throw new WorkloadRunError('restoreActive is not true')
  }
  if (drill !== undefined && drill !== DRILL) throw new WorkloadRunError(`drill is not ${DRILL}`)
  return { release, restoreActive: restoreActive !== undefined, drill: drill !== undefined }
}

// The tests' profile variants; the entry passes none.
export interface WorkloadOptions {
  profiles?: Partial<Record<EnvironmentName, Partial<Profile>>>
}

export interface WorkloadStageProps extends cdk.StageProps {
  environment: EnvironmentName
  profile: Profile
  run: WorkloadRun
}

// Every stack's description cites the decision that places it.
const DESCRIPTION: Readonly<Record<WorkloadStackPart, (environment: EnvironmentName) => string>> = {
  Platform: environment =>
    `Hearth's ${environment} platform: network, endpoints, task roles, cluster, log groups and any load balancer (C11-D27)`,
  Data: environment => `Hearth's ${environment} data: Valkey and the AUTH_SECRET (C11-D27, C11-D35)`,
  Tasks: environment => `Hearth's ${environment} one-off tasks: migrate, the readiness probe, the bastion (C11-D27)`,
  Services: environment => `Hearth's ${environment} services: api, realtime and worker at the release (C11-D27)`,
}

export class WorkloadStage extends cdk.Stage {
  readonly platform: PlatformStack
  readonly data: DataStack
  readonly tasks: TasksStack
  readonly services: ServicesStack

  constructor(scope: Construct, id: string, props: WorkloadStageProps) {
    super(scope, id, props)
    const { environment, profile, run } = props
    // What every stack of the stage is given: its name, its description, the hearthapp synthesizer
    // (made fresh for each: one instance can't serve two stacks) and the run.
    const shared = (part: WorkloadStackPart) => ({
      stackName: workloadStackName(environment, part),
      description: DESCRIPTION[part](environment),
      synthesizer: new cdk.DefaultStackSynthesizer({ qualifier: QUALIFIER.app }),
      environment,
      profile,
      run,
    })
    this.platform = new PlatformStack(this, 'Platform', {
      ...shared('Platform'),
      terminationProtection: true,
      env: { region: REGION },
    })
    this.data = new DataStack(this, 'Data', {
      ...shared('Data'),
      terminationProtection: true,
      env: { region: REGION },
    })
    this.tasks = new TasksStack(this, 'Tasks', {
      ...shared('Tasks'),
      terminationProtection: false,
      env: { region: REGION },
    })
    this.services = new ServicesStack(this, 'Services', {
      ...shared('Services'),
      terminationProtection: false,
      env: { region: REGION },
    })
    this.data.addStackDependency(this.platform)
    this.tasks.addStackDependency(this.platform)
    this.services.addStackDependency(this.platform)
    this.services.addStackDependency(this.data)
    for (const stack of [this.platform, this.data, this.tasks, this.services]) applyBoundary(stack)
  }
}

// Builds each environment's stage (the non-prod stage alone under the drill), with its committed
// profile or a test's variant of it, then acknowledges the reviewed CloudFormation Validate findings.
export function addWorkload(
  app: cdk.App,
  run: WorkloadRun,
  options: WorkloadOptions = {},
): Partial<Record<EnvironmentName, WorkloadStage>> {
  const stages: Partial<Record<EnvironmentName, WorkloadStage>> = {}
  const environments: readonly EnvironmentName[] = run.drill ? ['nonprod'] : ENVIRONMENTS
  for (const environment of environments) {
    const profile: Profile = { ...PROFILES[environment], ...options.profiles?.[environment] }
    stages[environment] = new WorkloadStage(app, environment, {
      environment,
      profile,
      run,
      env: { region: REGION },
    })
  }
  acknowledgeValidate(app)
  return stages
}
