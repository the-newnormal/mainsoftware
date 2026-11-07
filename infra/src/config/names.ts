// The names more than one stack, PR or guardrail rely on, fixed in one place (C11-D27): the
// landing zone's policies name the workload's stacks, cluster, task families, roles, log groups and
// parameters, which C0.11 PR 3's stacks make, the SCPs except roles and stacks by name, and the
// Baselines and the workload stacks must agree on both. They live under src/config/, the one folder
// both entries may import (IG-08), so the workload entry never reaches the landing zone to read them.
//
// A rename here moves an SCP or RCP exception, a trust principal or an alarm's match without touching
// the policy that uses it, so this file is on the owner's-read list (C11-D74). The ARNs built from
// these names come from arns.ts, never from a literal.
import type { EnvironmentName, ServerRole } from './profiles.ts'

// The two bootstrap qualifiers (C11-D26): hearthbase for the landing zone, deployed by a person, and
// hearthapp for the workload stacks, deployed by the pipeline. Each fits the bootstrap template's
// [A-Za-z0-9_-]{1,10}, and with it the longest role name the template makes is IAM's 64 characters.
export const QUALIFIER = { base: 'hearthbase', app: 'hearthapp' } as const

// Each qualifier's toolkit stack, named apart so the second bootstrap never replaces the first.
export const TOOLKIT_STACK = { base: 'CDKToolkit-hearthbase', app: 'CDKToolkit-hearthapp' } as const

// The landing zone's stacks (C11-D27).
export const STACK = { foundation: 'Hearth-Foundation', logArchive: 'Hearth-LogArchive' } as const
// A workload account's Baseline, or `*` for every Baseline, as hearth-workload-fences-2 names them.
export const baselineStackName = (account: 'nonprod' | 'prod' | '*') => `Hearth-${account}-Baseline`

// The roles the landing zone makes or fences by name: break-glass in every member account (C11-D11),
// GitHub's deploy and plan roles in the workload accounts (C11-D55), the trail's delivery role in
// management (C11-D17), and the role Organizations makes in each member account (C11-D02).
export const ROLE = {
  breakGlass: 'hearth-break-glass',
  ghDeploy: 'hearth-gh-deploy',
  ghDiff: 'hearth-gh-diff',
  trailLogs: 'hearth-org-trail-logs',
  oaar: 'OrganizationAccountAccessRole',
} as const

// The permissions boundary every workload role carries (C11-D26).
export const BOUNDARY = 'hearth-boundary'

// Where Identity Center puts the roles its permission sets make in each account.
export const SSO_ROLE_PATH = 'aws-reserved/sso.amazonaws.com/'
// The SAML provider Identity Center makes in each account it provisions a set in, which each of
// those roles trusts, as an IAM resource path (`AWSSSO_<id>_DO_NOT_DELETE`).
export const SSO_SAML_PROVIDER = 'saml-provider/AWSSSO_*_DO_NOT_DELETE'

// The permission sets (C11-D10). HearthSetUp is made by hand for the first deploys and deleted after
// them, never by CDK; it is named here so its sessions match A3's alarm (C11-D16).
export const PERMISSION_SET = {
  orgAdmin: 'HearthOrgAdmin',
  breakGlassEntry: 'HearthBreakGlassEntry',
  nonprodOperator: 'HearthNonprodOperator',
  securityReview: 'HearthSecurityReview',
  billing: 'HearthBilling',
  setUp: 'HearthSetUp',
} as const

// The alarms' topic in each account, the fast rules' name prefix and the management account's copy of
// the trail (C11-D16, C11-D17).
export const OPS_TOPIC = 'hearth-ops-alerts'
export const SEC_RULE_PREFIX = 'hearth-sec-'
export const SECURITY_LOG_GROUP_PREFIX = '/hearth/security/'
export const SECURITY_LOG_GROUP = '/hearth/security/org-trail'

// The organisation trail, its key and the archive's key, and the tag the evidence floor protects keys
// by (C11-D05, C11-D17, C11-D21).
export const TRAIL_NAME = 'hearth-org-trail'
export const KEY_ALIAS = { sec: 'alias/hearth-sec', archive: 'alias/hearth-archive' } as const
export const SEC_TAG = 'hearth-sec'

// The tag keys a policy in one stack matches and another stack, the helper or C0.12 sets (C11-D05,
// C11-D09, C11-D11): Identity Center sets hearth-user from each person's sign-in name, which the
// break-glass trust compares with the session's source identity; the helper tags each break-glass
// session hearth-reason, which the trust, the role's statements and the workload fences read; and
// C0.12 tags the Rule 9 secret hearth:access, which the fences and break-glass's denies match. A
// rename on one side alone would refuse every break-glass session, deny every landing-zone deploy or
// leave the tagged secret unfenced, so each is written here once. The workload's Tasks stack tags the
// migrate, probe and bastion definitions hearth-role (T24 item 11), which hearth-gh-deploy's
// StopOneOffs and break-glass's exec statement match: those two Baseline policies write the literal
// 'hearth-role', and their tests and the workload's each pin it, so a rename on one side fails a test.
export const TAG_KEY = {
  user: 'hearth-user',
  reason: 'hearth-reason',
  access: 'hearth:access',
  role: 'hearth-role',
} as const

// The log-archive account's three buckets, each named for that account at synth, so a name crosses
// accounts without a reference (C11-D13, C11-D17, C11-D21).
export const LOG_BUCKET_PREFIX = {
  trail: 'hearth-org-trail-',
  breakGlass: 'hearth-break-glass-log-',
  archive: 'hearth-archive-',
} as const
export const logBucketName = (kind: keyof typeof LOG_BUCKET_PREFIX, logArchiveAccount: string) =>
  `${LOG_BUCKET_PREFIX[kind]}${logArchiveAccount}`

// Where the break-glass helper writes its entries in the break-glass-log bucket (C11-D13).
export const BREAK_GLASS_KEY_PREFIX = 'break-glass/'

// The server image's repository in each workload account (C11-D44).
export const SERVER_REPOSITORY = 'hearth-server'

// GitHub's OIDC issuer and the audience its tokens carry for AWS (C11-D55).
export const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com'
export const OIDC_AUDIENCE = 'sts.amazonaws.com'

// The workload's four stacks per environment (C11-D27), deployed in this order under the hearthapp
// qualifier. The workload fences name each part (`*` for every environment), never
// `Hearth-<env>-*`, which would match the Baselines too.
export const WORKLOAD_STACK_PARTS = ['Platform', 'Data', 'Tasks', 'Services'] as const
export type WorkloadStackPart = (typeof WORKLOAD_STACK_PARTS)[number]
export const workloadStackName = (env: EnvironmentName | '*', part: WorkloadStackPart) => `Hearth-${env}-${part}`

// The workload's names per environment, which C0.11 PR 3's stacks make and the landing zone's policies
// name too (C11-D38, C11-D40).
export const clusterName = (env: EnvironmentName) => `hearth-${env}`
export const ONE_OFF_FAMILIES = ['migrate', 'probe'] as const
export const TASK_ROLE_KINDS = ['api', 'realtime', 'worker', 'migrate', 'probe', 'bastion', 'rule9'] as const
export type TaskRoleKind = (typeof TASK_ROLE_KINDS)[number]
// The kinds the workload makes in C0.11: every task role's but rule9, whose role, definition and
// login are C1.11's (C11-D38).
export type WorkloadKind = Exclude<TaskRoleKind, 'rule9'>
// A task definition's family, for the three services and the three one-offs alike.
export const taskFamily = (env: EnvironmentName, kind: WorkloadKind) => `hearth-${env}-${kind}`
export const taskRoleName = (env: EnvironmentName, kind: TaskRoleKind) => `hearth-${env}-${kind}-task`
export const execRoleName = (env: EnvironmentName, kind: TaskRoleKind) => `hearth-${env}-${kind}-exec`
export const logGroupName = (env: EnvironmentName, kind: string) => `/hearth/${env}/${kind}`
// The VPC's flow-log group's kind, so its group is logGroupName(env, FLOW_LOG_KIND) (C11-D32).
export const FLOW_LOG_KIND = 'vpc-flow'
// Each server role's ECS service (C11-D39).
export const serviceName = (env: EnvironmentName, role: ServerRole) => `hearth-${env}-${role}`
// The load balancer and its two target groups, each within ELB's 32 characters (C11-D41).
export const loadBalancerName = (env: EnvironmentName) => `hearth-${env}`
export const targetGroupName = (env: EnvironmentName, role: 'api' | 'realtime') => `hearth-${env}-${role}`
// The Valkey replication group and the generated AUTH_SECRET's secret (C11-D35).
export const valkeyGroupId = (env: EnvironmentName) => `hearth-${env}`
export const authSecretName = (env: EnvironmentName) => `hearth/${env}/auth-secret`

// The database logins the IAM fences name (C11-D05, C11-D65, C11-D78); C0.12 makes them.
export const DB_LOGIN = {
  bootstrap: 'hearth_bootstrap',
  breakglassRead: 'hearth_breakglass_read',
  migrate: 'hearth_migrate',
  app: 'hearth_app',
  worker: 'hearth_worker',
  rule9: 'hearth_rule9',
} as const

// The Owner bootstrap script's input secret per environment (C11-D15; C0.12 makes it).
export const bootstrapInputSecret = (env: EnvironmentName) => `hearth/${env}/bootstrap-input`

// The SSM parameters a stack reads by name instead of a reference (C11-D24): the zones, the image
// repository, and the break-glass-log bucket the helper writes to, which the Baselines write; the
// organisation id the endpoint policies trust, which each workload Baseline writes (C11-D30); and the
// workload's own, which its Platform and Data stacks write and its later stacks, the pipeline and
// break-glass read: the isolated subnets, each kind's security group, the two target groups, the Valkey
// endpoint and the AUTH_SECRET's ARN. Restore's stacks read no zone and no ecrServer: it has no load
// balancer, and its tasks reach the repository by SERVER_REPOSITORY in prod's account.
export const SSM_PARAMETER = {
  zoneApp: (env: EnvironmentName) => `/hearth/${env}/zone/app`,
  zoneUserContent: (env: EnvironmentName) => `/hearth/${env}/zone/usercontent`,
  ecrServer: (env: EnvironmentName) => `/hearth/${env}/ecr/server`,
  breakGlassLogBucket: '/hearth/break-glass/log-bucket',
  organisationId: '/hearth/organisation/id',
  isolatedSubnets: (env: EnvironmentName) => `/hearth/${env}/network/isolated-subnets`,
  securityGroup: (env: EnvironmentName, kind: WorkloadKind | 'valkey') => `/hearth/${env}/security-group/${kind}`,
  targetGroup: (env: EnvironmentName, role: 'api' | 'realtime') => `/hearth/${env}/target-group/${role}`,
  valkeyEndpoint: (env: EnvironmentName) => `/hearth/${env}/valkey/endpoint`,
  authSecretArn: (env: EnvironmentName) => `/hearth/${env}/auth-secret/arn`,
} as const

// The pipeline's stages in each workload account: the restore stage lives in prod (C11-Q02), so prod's
// Baseline names its families and roles too.
export const stagesIn = (account: 'nonprod' | 'prod'): readonly EnvironmentName[] =>
  account === 'prod' ? ['prod', 'restore'] : ['nonprod']

// An IAM policy variable (`${aws:PrincipalAccount}`), written as a template so no string literal holds
// one: Biome's noTemplateCurlyInString reads a plain string with `${` as a template written by mistake.
export const iamVariable = (name: string) => `\${${name}}`
