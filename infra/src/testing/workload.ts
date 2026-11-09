// The workload as the assertion tests read it (C11-D70): addWorkload() over the committed profiles and
// CI's fake release, every stage, in an App with cdk.json's context, synthesised to a temporary
// folder. The twelve templates are returned by stack name, beside the app and its stages, which the
// cdk-nag check (IAC-15) reads. The committed build is synthesised once per test worker and shared; a
// variant (another run, such as restoreActive or the drill, or a profile a test changes) is
// synthesised afresh each time, so no test sees another's. The workload entry never loads this file
// (IG-08).
import type * as cdk from 'aws-cdk-lib'
import type { EnvironmentName } from '../config/profiles.ts'
import {
  addWorkload,
  fakeRelease,
  type WorkloadOptions,
  type WorkloadRun,
  type WorkloadStage,
} from '../workload/stage.ts'
import { type Synthesised, synthesise, testApp } from './synth.ts'

export interface WorkloadSynth {
  synthesised: Synthesised
  // Each stack's template, by its CloudFormation name (Hearth-<env>-<Part>).
  templates: Record<string, Record<string, unknown>>
  app: cdk.App
  stages: Partial<Record<EnvironmentName, WorkloadStage>>
}

export interface WorkloadSynthOptions {
  run?: Partial<WorkloadRun>
  profiles?: WorkloadOptions['profiles']
}

let committed: WorkloadSynth | undefined

function build(options: WorkloadSynthOptions): WorkloadSynth {
  const app = testApp()
  const run: WorkloadRun = { release: fakeRelease(), restoreActive: false, drill: false, ...options.run }
  const stages = addWorkload(app, run, options.profiles === undefined ? {} : { profiles: options.profiles })
  const synthesised = synthesise(app)
  const templates = Object.fromEntries(synthesised.stacks.map(stack => [stack.stackName, stack.template]))
  return { synthesised, templates, app, stages }
}

// The committed workload with no options, or a variant with them.
export function synthWorkload(options?: WorkloadSynthOptions): WorkloadSynth {
  if (options !== undefined) return build(options)
  committed ??= build({})
  return committed
}
