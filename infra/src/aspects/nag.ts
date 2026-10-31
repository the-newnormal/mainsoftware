// The landing zone's reviewed exceptions to its two template checks (C11-D70; TECH-SPEC T24 item 28),
// as data:
// - NAG_ALLOWANCES: each cdk-nag AwsSolutions finding the landing zone keeps, by rule and by the
//   construct path of the resource it is raised on, with its reason. cdk-nag 3.0.2 runs only in
//   nag.test.ts (IAC-15), which applies these: no entry loads cdk-nag, a devDependency, and cdk-nag 3's
//   own acknowledgements name each finding by an id holding the fixture's account ids, which no source
//   may hold (IG-01). One allowance covers every finding of its rule on its resource (AwsSolutions-IAM5
//   raises one for each wildcard action or resource), and IAC-16 holds each to being used;
// - VALIDATE_ACKNOWLEDGEMENTS: each CloudFormation Validate finding (cdk.json's
//   validateAgainstDefaultRules) kept, acknowledged on its construct by acknowledgeValidate(), which
//   addLandingZone() calls, so the CLI's synth and the tests see the same. It holds only reviewed
//   exceptions, today the two E3510s on the account variable below: any other finding is fixed rather
//   than kept, and one raised on a stack is always fixed, since an acknowledgement on a stack would
//   cover all of it.
// Every reason is at least 20 characters and cites the C11 decision that keeps the finding. This file
// imports aws-cdk-lib and the stacks' names alone, never cdk-nag. It decides which findings the
// landing zone keeps, so it is on the owner's-read list (C11-D74).
import * as cdk from 'aws-cdk-lib'
import { baselineStackName, STACK } from '../config/names.ts'

export interface NagAllowance {
  // The AwsSolutions rule, without the finding's bracketed detail (`AwsSolutions-IAM5`).
  rule: string
  // The violating resource's construct path (an L2's is its `…/Resource`).
  path: string
  reason: string
}

// The log buckets keep no server access log: their data events log every access (C11-D17), and an
// access-log bucket would need an expiry with no tag, a second LCG-02 exception (C11-D19).
const NO_ACCESS_LOGS =
  'Data events in the organisation trail log every access; an access-log bucket would need an untagged expiry (C11-D17, C11-D19)'
// Break-glass reads and triages by service-wide read patterns and its own account's names, and denies
// every write it doesn't need, for an hour under an alarmed session with a reason.
const BREAK_GLASS =
  "Break-glass reads by service-wide read patterns and its own account's names, for an alarmed hour under a reason, and denies the writes it doesn't need (C11-D12)"
// hearth-boundary allows everything and denies by name: a boundary grants nothing, it bounds.
const BOUNDARY =
  "A permissions boundary's Allow of everything grants nothing; it bounds every workload role, and its denies name what no role may do (C11-D26)"
// GitHub's roles name their own environments' cluster, task families, stacks and log groups, which
// C0.11 PR 3 makes, and the describes and the registry login that take only `*`.
const GITHUB_ROLES =
  "GitHub's roles name their own environments' cluster, task families, stacks and log groups by pattern, and only the calls that take no resource on * (C11-D55)"

export const NAG_ALLOWANCES: readonly NagAllowance[] = [
  {
    rule: 'AwsSolutions-IAM5',
    path: 'Hearth-Foundation/OrgTrail/TrailLogsRole',
    reason:
      "CloudTrail names each account's stream at delivery, so its role writes any stream of the one copy log group (C11-D17)",
  },
  { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/TrailBucket/Resource', reason: NO_ACCESS_LOGS },
  { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/BreakGlassLogBucket/Resource', reason: NO_ACCESS_LOGS },
  { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/ArchiveBucket/Resource', reason: NO_ACCESS_LOGS },
  { rule: 'AwsSolutions-IAM5', path: 'Hearth-LogArchive/BreakGlass/Role', reason: BREAK_GLASS },
  ...(['nonprod', 'prod'] as const).flatMap(account => [
    { rule: 'AwsSolutions-IAM5', path: `Hearth-${account}-Baseline/Boundary/Policy`, reason: BOUNDARY },
    { rule: 'AwsSolutions-IAM5', path: `Hearth-${account}-Baseline/BreakGlass/Role`, reason: BREAK_GLASS },
    { rule: 'AwsSolutions-IAM5', path: `Hearth-${account}-Baseline/GithubOidc/DeployRole`, reason: GITHUB_ROLES },
  ]),
  { rule: 'AwsSolutions-IAM5', path: 'Hearth-prod-Baseline/GithubOidc/DiffRole', reason: GITHUB_ROLES },
]

export interface ValidateAcknowledgement {
  id: `CloudFormation-Validate::${string}`
  path: string
  reason: string
}

// IAM reads a policy variable anywhere in a resource's ARN, the account included, and Identity Center
// provisions a set's inline policy as IAM does; CloudFormation Validate's pattern for an ARN takes only
// a literal account there. The two sets name their own account's role and services by
// ${aws:PrincipalAccount}, so each, in every account it is assigned to, reaches that account's alone.
const ACCOUNT_VARIABLE =
  "IAM policy variables are valid in an ARN's account; Validate's pattern reads only a literal one, and the set reaches only its own account's (C11-D10, C11-D11)"

export const VALIDATE_ACKNOWLEDGEMENTS: readonly ValidateAcknowledgement[] = [
  {
    id: 'CloudFormation-Validate::E3510',
    path: 'Hearth-Foundation/IdentityCenter/BreakGlassEntry',
    reason: ACCOUNT_VARIABLE,
  },
  {
    id: 'CloudFormation-Validate::E3510',
    path: 'Hearth-Foundation/IdentityCenter/NonprodOperator',
    reason: ACCOUNT_VARIABLE,
  },
]

// The stacks the landing zone builds (C11-D27), each in its own run but the fixture's.
const LANDING_ZONE_STACKS: readonly string[] = [
  STACK.foundation,
  STACK.logArchive,
  baselineStackName('nonprod'),
  baselineStackName('prod'),
]

// Acknowledges each CloudFormation Validate finding on its own construct. An entry belongs to the
// stack its path starts with, and a person's run builds one target, so it applies only in a run that
// builds that stack (every run of the fixture's does). There its path must be exactly one construct,
// neither the app nor a stack, so no acknowledgement covers more than the resource it names. An entry
// whose path starts with no landing-zone stack is refused in every run, so a misspelt stack can't
// leave it waiting for a run that never comes.
export function acknowledgeValidate(
  app: cdk.App,
  acknowledgements: readonly ValidateAcknowledgement[] = VALIDATE_ACKNOWLEDGEMENTS,
): void {
  const built = new Set(app.node.children.filter(child => cdk.Stack.isStack(child)).map(stack => stack.node.id))
  const all = app.node.findAll()
  for (const entry of acknowledgements) {
    const stack = entry.path.split('/')[0] ?? ''
    if (!LANDING_ZONE_STACKS.includes(stack)) {
      throw new Error(`${entry.id} names ${entry.path}, in no stack the landing zone builds`)
    }
    if (!built.has(stack)) continue
    const found = all.filter(construct => construct.node.path === entry.path)
    const target = found[0]
    if (found.length !== 1 || target === undefined) {
      throw new Error(`${entry.id} names ${entry.path}, which is ${found.length} constructs, not one`)
    }
    if (target === app || cdk.Stack.isStack(target)) {
      throw new Error(`${entry.id} names ${entry.path}, a whole stack or the app`)
    }
    cdk.Validations.of(target).acknowledge({ id: entry.id, reason: entry.reason })
  }
}
