// The landing zone's and the workload's reviewed exceptions to their two template checks (C11-D70;
// TECH-SPEC T24 item 28), as data:
// - NAG_ALLOWANCES: each cdk-nag AwsSolutions finding a stack keeps, by rule and by the construct
//   path of the resource it is raised on, with its reason. cdk-nag 3.0.2 runs only in nag.test.ts
//   (IAC-15), which applies these: no entry loads cdk-nag, a devDependency, and cdk-nag 3's own
//   acknowledgements name each finding by an id holding the fixture's account ids, which no source
//   may hold (IG-01). One allowance covers every finding of its rule on its resource (AwsSolutions-IAM5
//   raises one for each wildcard action or resource), and IAC-16 holds each to being used. A workload
//   path starts with its stage (`nonprod/Platform/…`), and the workload's are written once for every
//   stage that builds the resource;
// - VALIDATE_ACKNOWLEDGEMENTS: each CloudFormation Validate finding (cdk.json's
//   validateAgainstDefaultRules) kept, acknowledged on its construct by acknowledgeValidate(), which
//   addLandingZone() and addWorkload() call, so the CLI's synth and the tests see the same. It holds
//   only reviewed exceptions, today the two E3510s on the account variable below, and none in the
//   workload: any other finding is fixed rather than kept, and one raised on a stack is always fixed,
//   since an acknowledgement on a stack would cover all of it.
// Every reason is at least 20 characters and cites the C11 decision that keeps the finding. This file
// imports aws-cdk-lib, the stacks' names and the profiles alone, never cdk-nag. It decides which
// findings the landing zone and the workload keep, so it is on the owner's-read list (C11-D74).
import * as cdk from 'aws-cdk-lib'
import { baselineStackName, STACK, WORKLOAD_STACK_PARTS } from '../config/names.ts'
import { ENVIRONMENTS, PROFILES } from '../config/profiles.ts'

export interface NagAllowance {
  // The AwsSolutions rule, without the finding's bracketed detail (`AwsSolutions-IAM5`).
  rule: string
  // The violating resource's construct path (an L2's is its `…/Resource`).
  path: string
  reason: string
}

// The log buckets keep no server access log, and an access-log bucket would need an expiry with no
// tag, a second LCG-02 exception (C11-D19). What the organisation trail's data events record instead
// differs by bucket (C11-D17): on the break-glass log and the archive, every object read and write;
// on the trail bucket, every object read and every write but PutObject, which the trail leaves out
// so CloudTrail's own deliveries don't log themselves. A PutObject there by anyone else is recorded
// nowhere, and validate-logs shows a delivered file overwritten but not one added beside the digests;
// recording it is the owner's alternative in TECH-SPEC T24 item 6 (C0.11 review 1 TRUST-03), so this
// allowance is decided on that gap.
const NO_ACCESS_LOGS =
  'Data events in the organisation trail log every object read and write; an access-log bucket would need an untagged expiry (C11-D17, C11-D19)'
const TRAIL_BUCKET_NO_ACCESS_LOGS =
  "Data events in the organisation trail log every object read and every write but PutObject, left out so CloudTrail's deliveries don't log themselves, so a PutObject by anyone else is unrecorded; an access-log bucket would need an untagged expiry (C11-D17, C11-D19)"
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

// The workload's (C0.11 PR 3), one entry per stage that builds the resource.
const ALB_OPEN =
  'The load balancer answers 443 from the internet until C0.12 puts CloudFront in front of it; nothing behind it holds data or can send an SMS (C11-D31)'
const ALB_NO_ACCESS_LOGS = 'Load balancer access logs come with C0.13, in a retention class of their own (C11-D41)'
const NO_CONTAINER_INSIGHTS = "Container Insights waits for C0.13's observability decision, for its cost (C11-D39)"
const PLAIN_ENVIRONMENT =
  'The plain environment holds no secret: the AUTH_SECRET is a reference, and C0.12 moves the database and Valkey URLs to secrets (C11-D37)'
const VALKEY_ONE_NODE =
  "One Valkey node, as C11-Q01's answer pulled it forward, until C0.12 decides on a replica; reachable only from the api, realtime and worker groups (C11-D35)"
const VALKEY_NO_AUTH =
  "No Valkey AUTH until C0.12's ACL users; it is reachable over TLS only from the api, realtime and worker groups (C11-D35)"
const NO_ROTATION = "The AUTH_SECRET's rotation, with AUTH_SECRET_PREVIOUS, is C0.12's (C11-D35)"
const EXEC_ROLES =
  "The registry token takes no resource, and each execution role writes only its own log group's streams (C11-D38)"
const ECS_EXEC_CHANNELS =
  "ECS Exec's four channel actions take no resource, and only the bastion's task role holds them (C11-D40)"
const FLOW_LOG_ROLE = 'VPC Flow Logs names each stream at delivery, in the one flow-log group (C11-D32)'

// The kinds whose execution roles the Platform stack makes, as their construct ids name them.
const EXEC_ROLE_IDS = ['Api', 'Realtime', 'Worker', 'Migrate', 'Probe', 'Bastion'] as const
// The services' task definitions, which carry a plain environment.
const SERVICE_TASK_IDS = ['Api', 'Realtime', 'Worker'] as const

// One stage's allowances. The restore stage has no load balancer, and its Valkey exists only while
// restoreActive is set, so its two Valkey allowances are used by that build alone (C11-D45).
function workloadAllowances(env: (typeof ENVIRONMENTS)[number]): NagAllowance[] {
  return [
    ...(PROFILES[env].alb === undefined
      ? []
      : [
          { rule: 'AwsSolutions-EC23', path: `${env}/Platform/Network/Groups/Alb`, reason: ALB_OPEN },
          { rule: 'AwsSolutions-ELB2', path: `${env}/Platform/LoadBalancer/Alb/Resource`, reason: ALB_NO_ACCESS_LOGS },
        ]),
    { rule: 'AwsSolutions-ECS4', path: `${env}/Platform/Cluster`, reason: NO_CONTAINER_INSIGHTS },
    ...EXEC_ROLE_IDS.map(id => ({
      rule: 'AwsSolutions-IAM5',
      path: `${env}/Platform/Roles/${id}Exec`,
      reason: EXEC_ROLES,
    })),
    { rule: 'AwsSolutions-IAM5', path: `${env}/Platform/Roles/BastionTask`, reason: ECS_EXEC_CHANNELS },
    { rule: 'AwsSolutions-IAM5', path: `${env}/Platform/Network/FlowLogRole`, reason: FLOW_LOG_ROLE },
    { rule: 'AwsSolutions-AEC4', path: `${env}/Data/Valkey/Group`, reason: VALKEY_ONE_NODE },
    { rule: 'AwsSolutions-AEC6', path: `${env}/Data/Valkey/Group`, reason: VALKEY_NO_AUTH },
    { rule: 'AwsSolutions-SMG4', path: `${env}/Data/AuthSecret/Resource`, reason: NO_ROTATION },
    ...SERVICE_TASK_IDS.map(id => ({
      rule: 'AwsSolutions-ECS2',
      path: `${env}/Services/${id}Task/Resource`,
      reason: PLAIN_ENVIRONMENT,
    })),
  ]
}

export const NAG_ALLOWANCES: readonly NagAllowance[] = [
  {
    rule: 'AwsSolutions-IAM5',
    path: 'Hearth-Foundation/OrgTrail/TrailLogsRole',
    reason:
      "CloudTrail names each account's stream at delivery, so its role writes any stream of the one copy log group (C11-D17)",
  },
  { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/TrailBucket/Resource', reason: TRAIL_BUCKET_NO_ACCESS_LOGS },
  { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/BreakGlassLogBucket/Resource', reason: NO_ACCESS_LOGS },
  { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/ArchiveBucket/Resource', reason: NO_ACCESS_LOGS },
  { rule: 'AwsSolutions-IAM5', path: 'Hearth-LogArchive/BreakGlass/Role', reason: BREAK_GLASS },
  ...(['nonprod', 'prod'] as const).flatMap(account => [
    { rule: 'AwsSolutions-IAM5', path: `Hearth-${account}-Baseline/Boundary/Policy`, reason: BOUNDARY },
    { rule: 'AwsSolutions-IAM5', path: `Hearth-${account}-Baseline/BreakGlass/Role`, reason: BREAK_GLASS },
    { rule: 'AwsSolutions-IAM5', path: `Hearth-${account}-Baseline/GithubOidc/DeployRole`, reason: GITHUB_ROLES },
  ]),
  { rule: 'AwsSolutions-IAM5', path: 'Hearth-prod-Baseline/GithubOidc/DiffRole', reason: GITHUB_ROLES },
  ...ENVIRONMENTS.flatMap(env => workloadAllowances(env)),
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

// The stacks the landing zone builds (C11-D27), each in its own run but the fixture's, by construct path.
const LANDING_ZONE_STACKS: readonly string[] = [
  STACK.foundation,
  STACK.logArchive,
  baselineStackName('nonprod'),
  baselineStackName('prod'),
]

// The stacks the workload builds, by construct path: each stage's four (`nonprod/Platform`).
const WORKLOAD_STACKS: readonly string[] = ENVIRONMENTS.flatMap(env =>
  WORKLOAD_STACK_PARTS.map(part => `${env}/${part}`),
)

// The stack a path belongs to: the longest known stack path it is, or starts with followed by `/`.
function stackOf(path: string): string | undefined {
  return [...LANDING_ZONE_STACKS, ...WORKLOAD_STACKS]
    .filter(stack => path === stack || path.startsWith(`${stack}/`))
    .sort((a, b) => b.length - a.length)[0]
}

// Acknowledges each CloudFormation Validate finding on its own construct. An entry belongs to the
// stack its path starts with (a landing-zone stack's id, or a workload stage's `<env>/<Part>`), and a
// person's run builds one target and the drill one stage, so it applies only in a run that builds that
// stack (every run of the fixture's does). There its path must be exactly one construct, neither the
// app nor a stack, so no acknowledgement covers more than the resource it names. An entry whose path
// starts with no stack either entry builds is refused in every run, so a misspelt stack can't leave
// it waiting for a run that never comes.
export function acknowledgeValidate(
  app: cdk.App,
  acknowledgements: readonly ValidateAcknowledgement[] = VALIDATE_ACKNOWLEDGEMENTS,
): void {
  const all = app.node.findAll()
  const built = new Set(all.filter(construct => cdk.Stack.isStack(construct)).map(stack => stack.node.path))
  for (const entry of acknowledgements) {
    const stack = stackOf(entry.path)
    if (stack === undefined) {
      throw new Error(`${entry.id} names ${entry.path}, in no stack the landing zone builds or a workload stage holds`)
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
