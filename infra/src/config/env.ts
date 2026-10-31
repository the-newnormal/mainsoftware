// The landing-zone entry's configuration, validated (C11-D25): what only a person's environment
// holds, because the repository is public and these identify the organisation, its accounts and its
// people's groups. bin/landing-zone.ts alone reads it; the workload entry reads only the committed
// profiles (profiles.ts), so the pipeline never needs any of it (C11-D24, IG-08).
//
// A person keeps the values in infra/.env.local (git-ignored, as every .env* but .env.example) and
// synthesises in a shell with no AWS credentials, then deploys only the synthesised assembly
// (`cdk deploy --app cdk.out`) from the credentialed shell, so no repository code runs where
// HearthOrgAdmin, OrganizationAccountAccessRole or break-glass credentials exist (C11-D23).
// infra/.env.example documents every variable, each with a comment and an empty value. From C0.11
// PR 2, CI's synth:lz uses the fixture (src/testing/fixture.ts) under HEARTH_FIXTURE=1, whose account
// ids are made at run time.
//
// A problem names its variable and what it must be, never the value it read: a value may be an
// account id, a group id or an address. This file shapes every person-deployed template, so it is on
// the owner's-read list (C11-D74).
import { z } from 'zod'
import { DOMAINS, isPlaceholderDomain } from './profiles.ts'

// What one landing-zone run builds (C11-D27). A person synthesises and deploys one at a time, each
// into its own account under its own credentials; `all` is the fixture's alone (CI's synth:lz, from PR 2).
export const LANDING_ZONE_TARGETS = ['foundation', 'log-archive', 'nonprod-baseline', 'prod-baseline'] as const
export type LandingZoneTarget = (typeof LANDING_ZONE_TARGETS)[number]

// The GitHub environments whose OIDC trusts the Baselines write (C11-D55).
export type GithubEnvironment = 'nonprod' | 'prod-plan' | 'prod'

export interface LandingZoneConfig {
  // True only for src/testing/fixture.ts's configuration, which no real target accepts.
  fixture: boolean
  organization: {
    id: string
    rootId: string
    ous: { security: string; workloads: string; recovery: string }
  }
  accounts: { management: string; logArchive: string; nonprod: string; prod: string }
  // The organisation instance in ap-southeast-1 (C11-D09). Its ARN is formed at synth by arnPattern()
  // (src/config/arns.ts) from the id, so no ARN is written anywhere.
  identityCenter: {
    instanceId: string
    identityStoreId: string
    // The groups the permission sets are assigned to (C11-D10); people are added to them by hand.
    groups: { orgAdmins: string; onCall: string; nonprodOperators: string; reviewers: string; billing: string }
  }
  // The repository whose deploy workflow the OIDC trusts name (C11-D55). The subject format is read
  // back from the repository's OIDC customisation by an admin before PR 2's trusts deploy.
  github: { repository: string; ownerId: string; repositoryId: string; subjectFormat: string }
  // The ops role mailbox every alarm and budget emails (C11-D16, C11-Q07): email only, never SMS.
  alertEmail: string
  // Monthly budgets in US dollars (C11-D20, C11-Q09).
  budgetsUsd: { organisation: number; management: number; logArchive: number; nonprod: number; prod: number }
}

// The variable each value comes from, in .env.example's order.
export const CONFIG_VARIABLES = [
  'HEARTH_ORG_ID',
  'HEARTH_ORG_ROOT_ID',
  'HEARTH_OU_SECURITY',
  'HEARTH_OU_WORKLOADS',
  'HEARTH_OU_RECOVERY',
  'HEARTH_ACCOUNT_MANAGEMENT',
  'HEARTH_ACCOUNT_LOG_ARCHIVE',
  'HEARTH_ACCOUNT_NONPROD',
  'HEARTH_ACCOUNT_PROD',
  'HEARTH_SSO_INSTANCE_ID',
  'HEARTH_IDENTITY_STORE_ID',
  'HEARTH_GROUP_ORG_ADMINS',
  'HEARTH_GROUP_ON_CALL',
  'HEARTH_GROUP_NONPROD_OPERATORS',
  'HEARTH_GROUP_REVIEWERS',
  'HEARTH_GROUP_BILLING',
  'HEARTH_GITHUB_REPOSITORY',
  'HEARTH_GITHUB_OWNER_ID',
  'HEARTH_GITHUB_REPOSITORY_ID',
  'HEARTH_GITHUB_SUBJECT_FORMAT',
  'HEARTH_ALERT_EMAIL',
  'HEARTH_BUDGET_ORGANISATION_USD',
  'HEARTH_BUDGET_MANAGEMENT_USD',
  'HEARTH_BUDGET_LOG_ARCHIVE_USD',
  'HEARTH_BUDGET_NONPROD_USD',
  'HEARTH_BUDGET_PROD_USD',
] as const
export type ConfigVariable = (typeof CONFIG_VARIABLES)[number]

// The two that choose the run rather than describe the organisation.
export const CONTROL_VARIABLES = ['HEARTH_TARGET', 'HEARTH_FIXTURE'] as const

// The placeholders a subject format may use, each filled from the configuration or the environment.
const SUBJECT_PLACEHOLDERS = ['owner', 'name', 'repository', 'ownerId', 'repositoryId', 'environment'] as const
// What every rendered subject must name: the deploy workflow on main (C11-D55's job_workflow_ref).
export const DEPLOY_WORKFLOW_REF = '.github/workflows/deploy.yml@refs/heads/main'

// A refused configuration: every problem found, each naming its variable and never its value.
export class LandingZoneConfigError extends Error {
  readonly problems: readonly string[]
  constructor(problems: readonly string[]) {
    super(`the landing-zone configuration is refused:\n${problems.map(problem => `- ${problem}`).join('\n')}`)
    this.name = 'LandingZoneConfigError'
    this.problems = problems
  }
}

// One variable: unset or empty reads as not set, and a value that doesn't match says what it must be.
const text = (pattern: RegExp, what: string) =>
  z.preprocess(
    value => (value === '' ? undefined : value),
    z
      .string({ error: issue => (issue.input === undefined ? 'is not set' : `must be ${what}`) })
      .regex(pattern, `must be ${what}`),
  )
const dollars = text(/^[1-9]\d{0,5}$/, 'a whole number of US dollars from 1 to 999999')

const ACCOUNT = text(/^\d{12}$/, 'a 12-digit AWS account id')
const OU = text(/^ou-[0-9a-z]{4,32}-[a-z0-9]{8,32}$/, 'an organisational unit id (ou-…)')
const GROUP = text(
  /^(?:[0-9a-f]{10}-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'an Identity Center group id',
)
const GITHUB_ID = text(/^[1-9]\d{0,19}$/, "GitHub's numeric id")

const SCHEMA = z.object({
  HEARTH_ORG_ID: text(/^o-[a-z0-9]{10,32}$/, 'an organization id (o-…)'),
  HEARTH_ORG_ROOT_ID: text(/^r-[0-9a-z]{4,32}$/, "the organization's root id (r-…)"),
  HEARTH_OU_SECURITY: OU,
  HEARTH_OU_WORKLOADS: OU,
  HEARTH_OU_RECOVERY: OU,
  HEARTH_ACCOUNT_MANAGEMENT: ACCOUNT,
  HEARTH_ACCOUNT_LOG_ARCHIVE: ACCOUNT,
  HEARTH_ACCOUNT_NONPROD: ACCOUNT,
  HEARTH_ACCOUNT_PROD: ACCOUNT,
  HEARTH_SSO_INSTANCE_ID: text(/^ssoins-[0-9a-f]{16}$/, 'an Identity Center instance id (ssoins-…)'),
  HEARTH_IDENTITY_STORE_ID: text(/^d-[0-9a-f]{10}$/, 'an identity store id (d-…)'),
  HEARTH_GROUP_ORG_ADMINS: GROUP,
  HEARTH_GROUP_ON_CALL: GROUP,
  HEARTH_GROUP_NONPROD_OPERATORS: GROUP,
  HEARTH_GROUP_REVIEWERS: GROUP,
  HEARTH_GROUP_BILLING: GROUP,
  HEARTH_GITHUB_REPOSITORY: text(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/, 'owner/name'),
  HEARTH_GITHUB_OWNER_ID: GITHUB_ID,
  HEARTH_GITHUB_REPOSITORY_ID: GITHUB_ID,
  HEARTH_GITHUB_SUBJECT_FORMAT: text(/^repo:\S+$/, 'an OIDC subject format starting repo:'),
  HEARTH_ALERT_EMAIL: z.preprocess(
    value => (value === '' ? undefined : value),
    z.email({ error: issue => (issue.input === undefined ? 'is not set' : 'must be one email address') }),
  ),
  HEARTH_BUDGET_ORGANISATION_USD: dollars,
  HEARTH_BUDGET_MANAGEMENT_USD: dollars,
  HEARTH_BUDGET_LOG_ARCHIVE_USD: dollars,
  HEARTH_BUDGET_NONPROD_USD: dollars,
  HEARTH_BUDGET_PROD_USD: dollars,
})

type Environ = Readonly<Record<string, string | undefined>>

// Why a subject format is refused, or undefined: it must use only the known placeholders, name the
// environment once, name the deploy workflow on main, and hold no wildcard, since every trust
// compares it with StringEquals (C11-D55).
export function subjectFormatProblem(format: string): string | undefined {
  const used = [...format.matchAll(/\{([^}]*)\}/g)].map(match => match[1] ?? '')
  const unknown = used.filter(name => !(SUBJECT_PLACEHOLDERS as readonly string[]).includes(name))
  if (unknown.length > 0) return `uses a placeholder other than ${SUBJECT_PLACEHOLDERS.map(p => `{${p}}`).join(', ')}`
  if (used.filter(name => name === 'environment').length !== 1) return 'must name {environment} exactly once'
  if (/[*?]/.test(format)) return 'must hold no wildcard (* or ?): each trust matches it exactly'
  if (!format.includes(DEPLOY_WORKFLOW_REF)) return `must name the deploy workflow on main (${DEPLOY_WORKFLOW_REF})`
  return undefined
}

// The ways a subject may name the repository: owner/name, or GitHub's immutable form for
// repositories created after 15 July 2026, owner@ownerId/name@repositoryId (C11-D55: how the
// customised claim keys compose with it is read back before PR 2's trusts deploy, so either is taken).
function repositoryForms(github: LandingZoneConfig['github']): string[] {
  const [owner = '', name = ''] = github.repository.split('/')
  return [github.repository, `${owner}@${github.ownerId}/${name}@${github.repositoryId}`]
}

const ENVIRONMENTS: readonly GithubEnvironment[] = ['nonprod', 'prod-plan', 'prod']

// Why a configuration's subject doesn't bind this repository, or undefined. Rendered for each GitHub
// environment, the subject must start with repo: and the repository HEARTH_GITHUB_REPOSITORY names
// (or its immutable form, from the two ids), and name that repository's deploy workflow on main in its
// job_workflow_ref claim, each ending at a colon or the subject's end. Otherwise a format naming
// another repository, one that anyone could register under a near-identical owner, would pass, and
// that repository's own main and environments, with no reviewers, could assume the deploy roles.
export function subjectRepositoryProblem(github: LandingZoneConfig['github']): string | undefined {
  const forms = repositoryForms(github)
  for (const environment of ENVIRONMENTS) {
    const subject = githubSubject(github, environment)
    if (!forms.some(form => subject.startsWith(`repo:${form}:`))) {
      return 'must start with repo: and the repository HEARTH_GITHUB_REPOSITORY names, as owner/name or owner@id/name@id from HEARTH_GITHUB_OWNER_ID and HEARTH_GITHUB_REPOSITORY_ID'
    }
    const workflow = forms.some(form => {
      const claim = `:job_workflow_ref:${form}/${DEPLOY_WORKFLOW_REF}`
      const at = subject.indexOf(claim)
      return at >= 0 && (at + claim.length === subject.length || subject[at + claim.length] === ':')
    })
    if (!workflow) {
      return `must name, as job_workflow_ref, the deploy workflow on main of the repository HEARTH_GITHUB_REPOSITORY names (${DEPLOY_WORKFLOW_REF})`
    }
  }
  return undefined
}

// The OIDC subject a GitHub environment's job presents, as each trust names it exactly.
export function githubSubject(github: LandingZoneConfig['github'], environment: GithubEnvironment): string {
  const [owner = '', name = ''] = github.repository.split('/')
  const values: Record<(typeof SUBJECT_PLACEHOLDERS)[number], string> = {
    owner,
    name,
    repository: github.repository,
    ownerId: github.ownerId,
    repositoryId: github.repositoryId,
    environment,
  }
  return github.subjectFormat.replace(
    /\{([^}]*)\}/g,
    (_, key: string) => values[key as (typeof SUBJECT_PLACEHOLDERS)[number]] ?? '',
  )
}

// Each value that must differ from the others in its group but doesn't, as a problem.
function duplicates(group: string, entries: ReadonlyArray<readonly [string, string]>): string[] {
  const seen = new Map<string, string>()
  const found: string[] = []
  for (const [variable, value] of entries) {
    const first = seen.get(value)
    if (first === undefined) seen.set(value, variable)
    else found.push(`${variable}: must differ from ${first} (each ${group} is its own)`)
  }
  return found
}

// A real configuration from the person's environment, or every problem with it.
export function parseLandingZoneEnv(environ: Environ): LandingZoneConfig {
  const parsed = SCHEMA.safeParse(Object.fromEntries(CONFIG_VARIABLES.map(name => [name, environ[name]])))
  if (!parsed.success) {
    throw new LandingZoneConfigError(parsed.error.issues.map(issue => `${String(issue.path[0])}: ${issue.message}`))
  }
  const v = parsed.data
  const problems = [
    ...duplicates('account', [
      ['HEARTH_ACCOUNT_MANAGEMENT', v.HEARTH_ACCOUNT_MANAGEMENT],
      ['HEARTH_ACCOUNT_LOG_ARCHIVE', v.HEARTH_ACCOUNT_LOG_ARCHIVE],
      ['HEARTH_ACCOUNT_NONPROD', v.HEARTH_ACCOUNT_NONPROD],
      ['HEARTH_ACCOUNT_PROD', v.HEARTH_ACCOUNT_PROD],
    ]),
    ...duplicates('organisational unit', [
      ['HEARTH_OU_SECURITY', v.HEARTH_OU_SECURITY],
      ['HEARTH_OU_WORKLOADS', v.HEARTH_OU_WORKLOADS],
      ['HEARTH_OU_RECOVERY', v.HEARTH_OU_RECOVERY],
    ]),
    ...duplicates('group', [
      ['HEARTH_GROUP_ORG_ADMINS', v.HEARTH_GROUP_ORG_ADMINS.toLowerCase()],
      ['HEARTH_GROUP_ON_CALL', v.HEARTH_GROUP_ON_CALL.toLowerCase()],
      ['HEARTH_GROUP_NONPROD_OPERATORS', v.HEARTH_GROUP_NONPROD_OPERATORS.toLowerCase()],
      ['HEARTH_GROUP_REVIEWERS', v.HEARTH_GROUP_REVIEWERS.toLowerCase()],
      ['HEARTH_GROUP_BILLING', v.HEARTH_GROUP_BILLING.toLowerCase()],
    ]),
  ]
  const github = {
    repository: v.HEARTH_GITHUB_REPOSITORY,
    ownerId: v.HEARTH_GITHUB_OWNER_ID,
    repositoryId: v.HEARTH_GITHUB_REPOSITORY_ID,
    subjectFormat: v.HEARTH_GITHUB_SUBJECT_FORMAT,
  }
  const subject = subjectFormatProblem(github.subjectFormat) ?? subjectRepositoryProblem(github)
  if (subject !== undefined) problems.push(`HEARTH_GITHUB_SUBJECT_FORMAT: ${subject}`)
  if (problems.length > 0) throw new LandingZoneConfigError(problems)
  return {
    fixture: false,
    organization: {
      id: v.HEARTH_ORG_ID,
      rootId: v.HEARTH_ORG_ROOT_ID,
      ous: { security: v.HEARTH_OU_SECURITY, workloads: v.HEARTH_OU_WORKLOADS, recovery: v.HEARTH_OU_RECOVERY },
    },
    accounts: {
      management: v.HEARTH_ACCOUNT_MANAGEMENT,
      logArchive: v.HEARTH_ACCOUNT_LOG_ARCHIVE,
      nonprod: v.HEARTH_ACCOUNT_NONPROD,
      prod: v.HEARTH_ACCOUNT_PROD,
    },
    identityCenter: {
      instanceId: v.HEARTH_SSO_INSTANCE_ID,
      identityStoreId: v.HEARTH_IDENTITY_STORE_ID,
      groups: {
        orgAdmins: v.HEARTH_GROUP_ORG_ADMINS,
        onCall: v.HEARTH_GROUP_ON_CALL,
        nonprodOperators: v.HEARTH_GROUP_NONPROD_OPERATORS,
        reviewers: v.HEARTH_GROUP_REVIEWERS,
        billing: v.HEARTH_GROUP_BILLING,
      },
    },
    github,
    alertEmail: v.HEARTH_ALERT_EMAIL,
    budgetsUsd: {
      organisation: Number(v.HEARTH_BUDGET_ORGANISATION_USD),
      management: Number(v.HEARTH_BUDGET_MANAGEMENT_USD),
      logArchive: Number(v.HEARTH_BUDGET_LOG_ARCHIVE_USD),
      nonprod: Number(v.HEARTH_BUDGET_NONPROD_USD),
      prod: Number(v.HEARTH_BUDGET_PROD_USD),
    },
  }
}

// What a landing-zone run builds, and from which configuration.
export interface LandingZoneRun {
  config: LandingZoneConfig
  targets: readonly LandingZoneTarget[]
}

// The run bin/landing-zone.ts makes (C11-D25):
// - HEARTH_FIXTURE=1 builds every target from the fixture, and refuses a real value beside it, so a
//   person's environment never leaks into a fixture run and a fixture never reaches a real target;
// - otherwise it reads the person's configuration and builds the one target HEARTH_TARGET names.
// checkRun then refuses a fixture configuration for a real target, a real one for `all`, and the
// committed .invalid domains for any real target until the owner chooses them (C11-Q08).
export function resolveLandingZone(environ: Environ, fixture: () => LandingZoneConfig): LandingZoneRun {
  const flag = environ.HEARTH_FIXTURE
  if (flag !== undefined && flag !== '' && flag !== '1') {
    throw new LandingZoneConfigError(['HEARTH_FIXTURE: must be 1, or unset'])
  }
  const rawTarget = environ.HEARTH_TARGET === '' ? undefined : environ.HEARTH_TARGET
  if (
    rawTarget !== undefined &&
    rawTarget !== 'all' &&
    !(LANDING_ZONE_TARGETS as readonly string[]).includes(rawTarget)
  ) {
    throw new LandingZoneConfigError([`HEARTH_TARGET: must be one of ${LANDING_ZONE_TARGETS.join(', ')}`])
  }
  const target = rawTarget as LandingZoneTarget | 'all' | undefined
  if (flag === '1') {
    const real = CONFIG_VARIABLES.filter(name => (environ[name] ?? '') !== '')
    if (real.length > 0) {
      throw new LandingZoneConfigError([
        `HEARTH_FIXTURE: a fixture run takes no real configuration, but ${real.join(', ')} ${real.length === 1 ? 'is' : 'are'} set`,
      ])
    }
    return checkRun(fixture(), target ?? 'all')
  }
  if (target === undefined) {
    throw new LandingZoneConfigError([`HEARTH_TARGET: is not set (one of ${LANDING_ZONE_TARGETS.join(', ')})`])
  }
  return checkRun(parseLandingZoneEnv(environ), target)
}

// The refusals that hold however the configuration was made.
export function checkRun(
  config: LandingZoneConfig,
  target: LandingZoneTarget | 'all',
  domains: Readonly<Record<string, string>> = DOMAINS,
): LandingZoneRun {
  if (config.fixture && target !== 'all') {
    throw new LandingZoneConfigError([
      `HEARTH_TARGET: ${target} is a real deploy, and the fixture's accounts are made up: set HEARTH_TARGET=all, or use your own configuration`,
    ])
  }
  if (!config.fixture) {
    if (target === 'all') {
      throw new LandingZoneConfigError([
        'HEARTH_TARGET: a real run builds one target, each deployed into its own account under its own credentials',
      ])
    }
    const placeholders = Object.entries(domains).filter(([, domain]) => isPlaceholderDomain(domain))
    if (placeholders.length > 0) {
      throw new LandingZoneConfigError([
        `infra/src/config/profiles.ts: DOMAINS.${placeholders.map(([key]) => key).join(' and DOMAINS.')} still ${placeholders.length === 1 ? 'is a placeholder' : 'are placeholders'} under .invalid; the owner chooses the domains (C11-Q08) before any real deploy`,
      ])
    }
  }
  return { config, targets: target === 'all' ? LANDING_ZONE_TARGETS : [target] }
}
