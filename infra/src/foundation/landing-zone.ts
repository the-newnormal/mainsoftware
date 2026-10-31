// The landing zone's composition (C11-D27): the stacks a run builds, for bin/landing-zone.ts and the
// assertion tests alike, so the tests read exactly what a person synthesises. Each target is one
// stack in its own account, under the hearthbase qualifier (C11-D26), with termination protection on:
// - foundation: Hearth-Foundation, in management;
// - log-archive: Hearth-LogArchive, in log-archive;
// - nonprod-baseline and prod-baseline: Hearth-nonprod-Baseline and Hearth-prod-Baseline.
// Each stack's env is written out here with its account from configuration (IG-05), and no stack
// refers to another: what crosses accounts is a name built from configuration (C11-D24). The options
// are resolved once, to their committed values unless a test names another (options.ts). The
// CloudFormation Validate findings the landing zone keeps are acknowledged on their constructs here,
// so the CLI's synth and the tests see the same (src/aspects/nag.ts). This file decides what each
// landing-zone deploy holds, so it is on the owner's-read list (C11-D74).
import * as cdk from 'aws-cdk-lib'
import { acknowledgeValidate } from '../aspects/nag.ts'
import { BaselineStack } from '../baseline/account-baseline.ts'
import type { LandingZoneRun } from '../config/env.ts'
import { baselineStackName, QUALIFIER, STACK } from '../config/names.ts'
import { REGION } from '../config/profiles.ts'
import { FoundationStack } from './foundation.ts'
import { LogArchiveStack } from './log-archive.ts'
import { type LandingZoneOptions, resolveLandingZoneOptions } from './options.ts'

export interface LandingZoneStacks {
  foundation?: FoundationStack
  logArchive?: LogArchiveStack
  nonprodBaseline?: BaselineStack
  prodBaseline?: BaselineStack
}

// Every stack's description cites the decision that places it.
const DESCRIPTION = {
  foundation: "Hearth's organisation: guardrails, identity, the trail, assured alarms and budgets (C11-D27)",
  logArchive: "Hearth's evidence: the trail and break-glass logs, their keys, and the analyzer (C11-D27)",
  baseline: (account: 'nonprod' | 'prod') =>
    `Hearth's ${account} account: boundary, deploy roles, break-glass, alarms, image repository, zones (C11-D27)`,
} as const

// Each stack's synthesizer, made fresh for it: one instance can't serve two stacks.
const hearthbase = () => new cdk.DefaultStackSynthesizer({ qualifier: QUALIFIER.base })

export function addLandingZone(app: cdk.App, run: LandingZoneRun, options: LandingZoneOptions = {}): LandingZoneStacks {
  const { config } = run
  const resolved = resolveLandingZoneOptions(options)
  const stacks: LandingZoneStacks = {}
  for (const target of run.targets) {
    switch (target) {
      case 'foundation':
        stacks.foundation = new FoundationStack(app, STACK.foundation, {
          config,
          options: resolved,
          synthesizer: hearthbase(),
          terminationProtection: true,
          description: DESCRIPTION.foundation,
          env: { account: config.accounts.management, region: REGION },
        })
        break
      case 'log-archive':
        stacks.logArchive = new LogArchiveStack(app, STACK.logArchive, {
          config,
          options: resolved,
          synthesizer: hearthbase(),
          terminationProtection: true,
          description: DESCRIPTION.logArchive,
          env: { account: config.accounts.logArchive, region: REGION },
        })
        break
      case 'nonprod-baseline':
        stacks.nonprodBaseline = new BaselineStack(app, baselineStackName('nonprod'), {
          config,
          account: 'nonprod',
          options: resolved,
          synthesizer: hearthbase(),
          terminationProtection: true,
          description: DESCRIPTION.baseline('nonprod'),
          env: { account: config.accounts.nonprod, region: REGION },
        })
        break
      case 'prod-baseline':
        stacks.prodBaseline = new BaselineStack(app, baselineStackName('prod'), {
          config,
          account: 'prod',
          options: resolved,
          synthesizer: hearthbase(),
          terminationProtection: true,
          description: DESCRIPTION.baseline('prod'),
          env: { account: config.accounts.prod, region: REGION },
        })
        break
    }
  }
  acknowledgeValidate(app)
  return stacks
}
