// The deploy pipeline's entry (C11-D23, C11-D24; TECH-SPEC T24 item 10), which cdk.json names and
// Node 24 runs as it is, by type stripping, as the server runs (T2). It builds the nonprod, prod and
// restore stages (C11-D27, C11-D45), twelve account-agnostic stacks (`env: { region }` only), from the
// committed profiles alone, so its synth needs no AWS credential and no person's configuration, and
// its cloud assembly holds no account id. Its import graph never reaches src/foundation/,
// src/baseline/, src/config/env.ts or src/testing/ (IG-08).
//
// The release it deploys is the one the pipeline passes, `-c release=<commit>:<digest>`, through
// infra's synth script (C11-D51); in CI's synth:ci alone, HEARTH_FAKE_RELEASE=1 asks for a fake one
// instead (C11-D62). It also reads the restoreActive and drill contexts (C11-D45, C11-D59). It refuses
// a missing or malformed release, the marker beside a release or set to anything but 1, a real
// release while DOMAINS holds a placeholder, and any other restoreActive or drill, with one line
// naming the key and never its value, and exits 1. On success it prints nothing. It is on the
// owner's-read list (C11-D74).
import * as cdk from 'aws-cdk-lib'
import { addWorkload, resolveWorkloadRun, WorkloadRunError } from '../src/workload/stage.ts'

const app = new cdk.App()
try {
  const run = resolveWorkloadRun(
    {
      release: app.node.tryGetContext('release'),
      restoreActive: app.node.tryGetContext('restoreActive'),
      drill: app.node.tryGetContext('drill'),
    },
    process.env,
  )
  addWorkload(app, run)
} catch (error) {
  if (!(error instanceof WorkloadRunError)) throw error
  process.stderr.write(`workload: ${error.message}\n`)
  process.exit(1)
}
app.synth()
