// What reviewers should see of each environment, committed (C11-D25, C11-D28): domain names, CIDRs,
// AZ counts, task sizes and counts, and the flags that change what an environment may do. Nothing
// here identifies an account: account ids, the organisation's ids and people's details come from
// the person's own environment (env.ts), and only for the landing-zone entry. The workload entry
// (bin/workload.ts) reads only this file, so the pipeline's synth needs no person's configuration
// (C11-D24, IG-08).
//
// A change to holdsRealData, logLockMode, smsProvider, DOMAINS or NONPROD_NAME_SERVERS is on the
// owner's-read list (C11-D74): holdsRealData brings production's rules to an environment (C11-D69),
// logLockMode makes the audit store's lock one nobody can lift (C11-D18), smsProvider starts real
// texts, DOMAINS names prod's zones, and NONPROD_NAME_SERVERS decides who answers for `nonprod.`,
// which is same-site with prod (C11-D43).

// Every stack is in ap-southeast-1 (D37, B.6), C0.12's Hearth-<env>-Edge alone in us-east-1 (IG-05).
export const REGION = 'ap-southeast-1'

// The two registrable domains (C11-D43): the app's, and a separate one for user content, so user
// content is never same-site with the app. The owner chose two domains (C11-Q08, 30 Oct 2026) and
// gives their names before PR 2 deploys, so until then these are placeholders under the reserved
// .invalid top-level domain, which never resolves, and bin/landing-zone.ts refuses them for a real
// target (isPlaceholderDomain). PR 2's zones are created from the names.
export const DOMAINS = {
  app: 'hearth-app.invalid',
  userContent: 'hearth-content.invalid',
} as const

// The non-prod zones' name servers, which prod's Baseline delegates `nonprod.` to (C11-D43). Committed
// by a reviewed PR after non-prod's Baseline first deploys (its outputs), never looked up (IG-02) or
// delegated by a Lambda (IG-11). Empty until then, so prod's Baseline renders no NS record. The shape
// (profiles.test.ts) can't tell non-prod's zone from anyone else's, so the set-up runbook compares the
// values with non-prod's own zone before prod's Baseline deploys.
export const NONPROD_NAME_SERVERS: { readonly app: readonly string[]; readonly userContent: readonly string[] } = {
  app: [],
  userContent: [],
}

// A domain nobody can register or resolve (RFC 2606's .invalid), so a real deploy refuses it.
export function isPlaceholderDomain(domain: string): boolean {
  return /(?:^|\.)invalid\.?$/i.test(domain)
}

// The environments the pipeline deploys. `restore` is the isolated restore stage (C11-D45), in the
// prod account by default (C11-Q02), which holds production data whenever it holds any.
export const ENVIRONMENTS = ['nonprod', 'prod', 'restore'] as const
export type EnvironmentName = (typeof ENVIRONMENTS)[number]

// The server's roles (apps/server/src/config.ts, ROLE).
export const ROLES = ['api', 'realtime', 'worker'] as const
export type ServerRole = (typeof ROLES)[number]

// One service's Fargate shape: desired count, CPU units (1,024 to a vCPU) and memory in MiB.
export interface ServiceSize {
  count: number
  cpu: number
  memoryMiB: number
}

export interface Profile {
  // The server's DEPLOY_ENV. The restore stage holds production data, so it runs as prod, with its
  // own Valkey so its keys never meet prod's (C11-D28).
  deployEnv: 'nonprod' | 'prod'
  vpcCidr: string
  // Task subnets span this many AZs (Fn::GetAZs, never a lookup: C11-D24).
  taskAzs: number
  // Interface endpoints sit in this many of them: one in non-prod and restore for cost, two in prod
  // so one AZ's loss doesn't stop image pulls and logs (C11-D30).
  endpointAzs: number
  // Desired counts while live. The restore stage's are what a drill runs; it stays at 0 unless the
  // restoreActive context is set (C11-D45).
  services: Readonly<Record<ServerRole, ServiceSize>>
  // Whether the services run (C11-Q01: live in both environments from C0.11), or, for restore, only
  // under the restoreActive context.
  live: boolean | 'restoreActive'
  // Whether the environment holds a real person's data. From then it counts as production for
  // coding agents and logs (C0.9 OD-31): no standing assignment to its account (IAC-19) and a
  // person's approval on its deploys. Non-prod flips with C0.12, once its bootstrap login,
  // environment marker and parameter group exist and before it sends a code (C11-D69, C11-Q05).
  holdsRealData: boolean
  // The server's SMS_PROVIDER: unset everywhere in C0.11, so sign-in answers 503 `unavailable`
  // (SMK-02). Non-prod's turns to twilio with C0.12's flip, on its own subaccount; prod's in the
  // reviewed change that takes Twilio live there, before the production set-up's commit (T22 item
  // 71); restore's never.
  smsProvider: 'twilio' | undefined
  // The Region's AWS-managed S3 prefix list (com.amazonaws.ap-southeast-1.s3), the tasks' S3 egress
  // target for ECR's image layers (C11-D31): no construct exposes it, and lookups and custom
  // resources are refused (IG-02, IG-11). Not an account id, and the same in every account of the
  // Region; the set-up runbook reads it back in each account before the Platform stack deploys.
  s3PrefixList: string
  // Whether the environment has its RDS database yet (C0.12): until then the database URLs are
  // placeholders on a host that never resolves (C11-D37) and the pipeline's migrate step is skipped.
  hasDatabase: boolean
  // The roles whose full /ready gates a release (C11-D53): none until C0.12's data plane, then all
  // three. Until then the readiness probe reports without gating.
  readyGate: readonly ServerRole[]
  // GuardDuty Runtime Monitoring (C0.19 decides it, with prices).
  runtimeMonitoring: boolean
  // The internet-facing ALB (C11-D41): its ingress (`internet` until C0.12's CloudFront, then
  // `cloudfront`) and deletion protection. None for restore, which has no listener (IAC-20).
  alb: { ingress: 'internet' | 'cloudfront'; deletionProtection: boolean } | undefined
  // The interface endpoints' resource-org statement (C11-D30) and the task roles' network perimeter
  // (C11-D33) go on in non-prod first, and in prod after a week of clean deploys.
  endpointResourceOrg: boolean
  taskRolePerimeter: boolean
}

// Every task's open-file limit, soft and hard (C11-D28), for realtime's sockets.
export const NOFILE_LIMIT = 65_536
// Realtime's heap cap in MiB (`node --max-old-space-size=1536 src/main.ts`), inside its 2 GB.
export const REALTIME_HEAP_MIB = 1_536

// Realtime is sized from a stated estimate for T19 item 16's 25,000 sockets a task: about 30 KB of
// heap per idle socket with its topic subscriptions and about 10 KB of kernel socket memory charged
// to the task, so about 1 GB, plus about 200 MB for the process. 2 GB with the heap capped at
// 1.5 GB, and 0.5 vCPU for 25,000 sockets' 25-second heartbeats (1,000 a second). C1.12's load
// test proves it or changes it here (C11-D28).
const REALTIME: ServiceSize = { count: 2, cpu: 512, memoryMiB: 2_048 }

// AWS's managed S3 prefix list in ap-southeast-1: UNCONFIRMED until the set-up runbook reads it
// back in each account (aws ec2 describe-managed-prefix-lists), before PR 3's Platform deploys.
const S3_PREFIX_LIST_AP_SOUTHEAST_1 = 'pl-6fa54006'

export const PROFILES: Readonly<Record<EnvironmentName, Profile>> = {
  nonprod: {
    deployEnv: 'nonprod',
    vpcCidr: '10.20.0.0/16',
    taskAzs: 2,
    endpointAzs: 1,
    services: {
      api: { count: 1, cpu: 512, memoryMiB: 1_024 },
      // T19 item 16: two realtime tasks, on non-prod too, each sized for 25,000 sockets.
      realtime: REALTIME,
      worker: { count: 1, cpu: 256, memoryMiB: 512 },
    },
    live: true,
    holdsRealData: false,
    smsProvider: undefined,
    s3PrefixList: S3_PREFIX_LIST_AP_SOUTHEAST_1,
    hasDatabase: false,
    readyGate: [],
    runtimeMonitoring: false,
    alb: { ingress: 'internet', deletionProtection: false },
    endpointResourceOrg: true,
    taskRolePerimeter: true,
  },
  prod: {
    deployEnv: 'prod',
    vpcCidr: '10.30.0.0/16',
    taskAzs: 2,
    endpointAzs: 2,
    services: {
      api: { count: 2, cpu: 512, memoryMiB: 1_024 },
      realtime: REALTIME,
      worker: { count: 2, cpu: 256, memoryMiB: 512 },
    },
    live: true,
    holdsRealData: true,
    smsProvider: undefined,
    s3PrefixList: S3_PREFIX_LIST_AP_SOUTHEAST_1,
    hasDatabase: false,
    readyGate: [],
    runtimeMonitoring: false,
    alb: { ingress: 'internet', deletionProtection: true },
    endpointResourceOrg: false,
    taskRolePerimeter: false,
  },
  restore: {
    deployEnv: 'prod',
    vpcCidr: '10.40.0.0/16',
    taskAzs: 2,
    endpointAzs: 1,
    services: {
      api: { count: 1, cpu: 512, memoryMiB: 1_024 },
      realtime: REALTIME,
      worker: { count: 1, cpu: 256, memoryMiB: 512 },
    },
    live: 'restoreActive',
    holdsRealData: true,
    smsProvider: undefined,
    s3PrefixList: S3_PREFIX_LIST_AP_SOUTHEAST_1,
    hasDatabase: false,
    readyGate: [],
    runtimeMonitoring: false,
    alb: undefined,
    endpointResourceOrg: true,
    taskRolePerimeter: true,
  },
}

// The log-archive account's trail and break-glass-log buckets lock each version for their class's
// days (C11-D18): GOVERNANCE for the first week, then COMPLIANCE, which nobody can lift or shorten,
// in a one-line PR under the owner's-read rule, deployed as tier 2.
export const LOG_ARCHIVE = {
  logLockMode: 'GOVERNANCE' as 'GOVERNANCE' | 'COMPLIANCE',
} as const

// The host the app answers at in an environment: prod at the app domain, non-prod under `nonprod.`
// (C11-D43). The restore stage has no DNS records.
export function appHost(environment: EnvironmentName): string | undefined {
  if (environment === 'prod') return DOMAINS.app
  if (environment === 'nonprod') return `nonprod.${DOMAINS.app}`
  return undefined
}

// The user-content host, beside the app's, on the other registrable domain.
export function userContentHost(environment: EnvironmentName): string | undefined {
  if (environment === 'prod') return DOMAINS.userContent
  if (environment === 'nonprod') return `nonprod.${DOMAINS.userContent}`
  return undefined
}

// The ALB's own name, `origin.<app host>`, with its DNS-validated certificate: CloudFront's origin
// from C0.12, and the smoke checks' host until then, so no record moves later (C11-D43).
export function originHost(environment: EnvironmentName): string | undefined {
  const host = appHost(environment)
  return host === undefined ? undefined : `origin.${host}`
}
