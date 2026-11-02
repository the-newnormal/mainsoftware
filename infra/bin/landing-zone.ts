// A person's entry (C11-D23, C11-D25; TECH-SPEC T24 item 10): Hearth-Foundation, Hearth-LogArchive
// and the Baselines, with explicit accounts from the person's own environment (src/config/env.ts),
// one target a run. A person synthesises it in a shell with no AWS credentials,
//   npx cdk synth --app "node --env-file=.env.local bin/landing-zone.ts"
// reads the diff and the asset check (C11-D76, from C0.11 PR 2's runbook), and only then, in the
// credentialed shell, deploys the synthesised assembly (`cdk deploy --app cdk.out`), so no repository
// code runs where landing-zone or break-glass credentials exist. From C0.11 PR 2, CI synthesises it
// over the fixture (HEARTH_FIXTURE=1); coding agents never deploy it. It is on the owner's-read list
// (C11-D74).
//
// It refuses a fixture configuration for a real target, a real one under HEARTH_FIXTURE=1, and the
// committed .invalid domains for any real target (checkRun). C0.11 PR 2 adds the stacks for each
// target. Until then it defines none, so it isn't synthesised with the CLI, which refuses an app
// with no stacks (C11-D62).
import * as cdk from 'aws-cdk-lib'
import { LandingZoneConfigError, resolveLandingZone } from '../src/config/env.ts'
import { fixtureConfig } from '../src/testing/fixture.ts'

let targets: readonly string[]
let fixture: boolean
try {
  const run = resolveLandingZone(process.env, fixtureConfig)
  targets = run.targets
  fixture = run.config.fixture
} catch (error) {
  if (!(error instanceof LandingZoneConfigError)) throw error
  // The message names variables and what they must be, never a value.
  console.error(error.message)
  process.exit(1)
}

// Ids, never values: which configuration and which targets this run builds.
console.error(`landing zone: ${fixture ? 'the fixture' : 'your configuration'}, targets ${targets.join(', ')}`)

const app = new cdk.App()
app.synth()
