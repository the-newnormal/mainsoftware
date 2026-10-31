// The names more than one stack, PR or guardrail rely on, fixed in one place (C11-D27): the
// landing zone's policies name PR 3's cluster, task families, roles and log groups before they exist,
// the SCPs except roles by name, and the Baselines and the workload stacks must agree on both. They
// live under src/config/, the one folder both entries may import (IG-08), so the workload entry never
// reaches the landing zone to read them.
//
// A rename here moves an SCP or RCP exception, a trust principal or an alarm's match without touching
// the policy that uses it, so this file is on the owner's-read list (C11-D74). The ARNs built from
// these names come from arns.ts, never from a literal.
import type { EnvironmentName } from './profiles.ts'

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
// leave the tagged secret unfenced, so each is written here once.
export const TAG_KEY = { user: 'hearth-user', reason: 'hearth-reason', access: 'hearth:access' } as const

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

// The workload's names per environment, which PR 3's stacks make and the landing zone's policies name
// before them (C11-D38, C11-D40).
export const clusterName = (env: EnvironmentName) => `hearth-${env}`
export const ONE_OFF_FAMILIES = ['migrate', 'probe'] as const
export const taskFamily = (env: EnvironmentName, kind: 'migrate' | 'probe' | 'bastion') => `hearth-${env}-${kind}`
export const TASK_ROLE_KINDS = ['api', 'realtime', 'worker', 'migrate', 'probe', 'bastion', 'rule9'] as const
export type TaskRoleKind = (typeof TASK_ROLE_KINDS)[number]
export const taskRoleName = (env: EnvironmentName, kind: TaskRoleKind) => `hearth-${env}-${kind}-task`
export const execRoleName = (env: EnvironmentName, kind: TaskRoleKind) => `hearth-${env}-${kind}-exec`
export const logGroupName = (env: EnvironmentName, kind: string) => `/hearth/${env}/${kind}`

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
// repository, and the break-glass-log bucket the helper writes to.
export const SSM_PARAMETER = {
  zoneApp: (env: EnvironmentName) => `/hearth/${env}/zone/app`,
  zoneUserContent: (env: EnvironmentName) => `/hearth/${env}/zone/usercontent`,
  ecrServer: (env: EnvironmentName) => `/hearth/${env}/ecr/server`,
  breakGlassLogBucket: '/hearth/break-glass/log-bucket',
} as const

// The pipeline's stages in each workload account: the restore stage lives in prod (C11-Q02), so prod's
// Baseline names its families and roles too.
export const stagesIn = (account: 'nonprod' | 'prod'): readonly EnvironmentName[] =>
  account === 'prod' ? ['prod', 'restore'] : ['nonprod']

// An IAM policy variable (`${aws:PrincipalAccount}`), written as a template so no string literal holds
// one: Biome's noTemplateCurlyInString reads a plain string with `${` as a template written by mistake.
export const iamVariable = (name: string) => `\${${name}}`
