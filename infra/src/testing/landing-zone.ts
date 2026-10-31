// The landing zone as the assertion tests read it (C11-D70): addLandingZone() over the fixture, every
// target, in an App with cdk.json's context, synthesised to a temporary folder. The four templates are
// returned by stack, beside the app and its stacks, which the cdk-nag check (IAC-15) reads. The
// committed build is synthesised once per test worker and shared; a variant (a test's options) is
// synthesised afresh each time, so no test sees another's.
import type * as cdk from 'aws-cdk-lib'
import { checkRun } from '../config/env.ts'
import { baselineStackName, STACK } from '../config/names.ts'
import { addLandingZone, type LandingZoneStacks } from '../foundation/landing-zone.ts'
import type { LandingZoneOptions } from '../foundation/options.ts'
import { fixtureConfig } from './fixture.ts'
import { type Synthesised, synthesise, templateOf, testApp } from './synth.ts'

export interface LandingZoneSynth {
  synthesised: Synthesised
  templates: {
    foundation: Record<string, unknown>
    logArchive: Record<string, unknown>
    nonprodBaseline: Record<string, unknown>
    prodBaseline: Record<string, unknown>
  }
  app: cdk.App
  stacks: LandingZoneStacks
}

let committed: LandingZoneSynth | undefined

function build(options: LandingZoneOptions | undefined): LandingZoneSynth {
  const app = testApp()
  const stacks = addLandingZone(app, checkRun(fixtureConfig(), 'all'), options)
  const synthesised = synthesise(app)
  return {
    synthesised,
    templates: {
      foundation: templateOf(synthesised, STACK.foundation),
      logArchive: templateOf(synthesised, STACK.logArchive),
      nonprodBaseline: templateOf(synthesised, baselineStackName('nonprod')),
      prodBaseline: templateOf(synthesised, baselineStackName('prod')),
    },
    app,
    stacks,
  }
}

// The fixture's landing zone: the committed build with no options, or a variant with them.
export function synthLandingZone(options?: LandingZoneOptions): LandingZoneSynth {
  if (options !== undefined) return build(options)
  committed ??= build(undefined)
  return committed
}
