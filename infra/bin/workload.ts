// The deploy pipeline's entry (C11-D23, C11-D24; TECH-SPEC T24 item 10), which cdk.json names and
// Node 24 runs as it is, by type stripping, as the server runs (T2). Its stacks are account-agnostic
// (`env: { region }` only), built from the committed profiles alone, so its synth needs no AWS
// credential and no person's configuration, and its cloud assembly holds no account id. Its import
// graph never reaches src/foundation/ or src/baseline/, the landing zone's (IG-08).
//
// C0.11 PR 3 adds the nonprod, prod and restore stages here. Until then it defines no stack, so it
// isn't synthesised with the CLI, which refuses an app with no stacks (C11-D62).
import * as cdk from 'aws-cdk-lib'

const app = new cdk.App()
app.synth()
