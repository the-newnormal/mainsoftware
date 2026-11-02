// A person's entry (C11-D23, C11-D25; TECH-SPEC T24 item 10): Hearth-Foundation, Hearth-LogArchive
// and the Baselines, with explicit accounts from the person's own environment (src/config/env.ts),
// one target a run. A person synthesises it in a shell with no AWS credentials,
//   AWS_EC2_METADATA_DISABLED=true npx cdk synth --app "node --env-file=.env.local bin/landing-zone.ts" --no-lookups
// and runs the asset check (C11-D76, docs/runbooks/aws-account-set-up.md step F), and only then, in
// the credentialed shell, from a folder with no cdk.json (beside one, the CLI first runs any `build`
// command it names, with those credentials) and with the checkout's own CLI, reads the diff and
// deploys the synthesised assembly (`cdk deploy --app <checkout>/infra/cdk.out`), so no repository
// code runs where landing-zone or break-glass credentials exist. CI synthesises every
// target over the fixture (HEARTH_FIXTURE=1) with the synth:lz script, credential-free and offline;
// coding agents never deploy it. It is on the owner's-read list (C11-D74).
//
// It refuses a fixture configuration for a real target, a real one under HEARTH_FIXTURE=1, and the
// committed .invalid domains for any real target (checkRun), then builds the run's targets through
// addLandingZone(), which the assertion tests share (src/foundation/landing-zone.ts).
import * as cdk from 'aws-cdk-lib'
import { LandingZoneConfigError, type LandingZoneRun, resolveLandingZone } from '../src/config/env.ts'
import { addLandingZone } from '../src/foundation/landing-zone.ts'
import { fixtureConfig } from '../src/testing/fixture.ts'

let run: LandingZoneRun
try {
  run = resolveLandingZone(process.env, fixtureConfig)
} catch (error) {
  if (!(error instanceof LandingZoneConfigError)) throw error
  // The message names variables and what they must be, never a value.
  console.error(error.message)
  process.exit(1)
}

// Ids, never values: which configuration and which targets this run builds.
console.error(
  `landing zone: ${run.config.fixture ? 'the fixture' : 'your configuration'}, targets ${run.targets.join(', ')}`,
)

const app = new cdk.App()
addLandingZone(app, run)
app.synth()
