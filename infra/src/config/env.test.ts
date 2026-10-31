// The landing-zone configuration's reader and the run's refusals (C11-D25). Every value here is the
// fixture's or built from it at run time; a problem never prints the value it read.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { configEnvironment, fixtureAccount, fixtureConfig } from '../testing/fixture.ts'
import {
  CONFIG_VARIABLES,
  CONTROL_VARIABLES,
  checkRun,
  DEPLOY_WORKFLOW_REF,
  githubSubject,
  LANDING_ZONE_TARGETS,
  type LandingZoneConfig,
  LandingZoneConfigError,
  parseLandingZoneEnv,
  resolveLandingZone,
  subjectFormatProblem,
  subjectRepositoryProblem,
} from './env.ts'

const realEnvironment = () => configEnvironment(fixtureConfig())
const real = (): LandingZoneConfig => ({ ...fixtureConfig(), fixture: false })
const chosen = { app: 'example.com', userContent: 'example-content.com' }

// The problems a call refuses with, or a failure if it doesn't refuse.
function problemsOf(call: () => unknown): readonly string[] {
  try {
    call()
  } catch (error) {
    if (error instanceof LandingZoneConfigError) return error.problems
    throw error
  }
  throw new Error('expected a refusal')
}

describe('C11-D25: the person’s configuration, read from HEARTH_* variables', () => {
  it('reads a complete configuration back as it was written, marked real', () => {
    expect(parseLandingZoneEnv(realEnvironment())).toEqual(real())
  })

  it('names every variable that is unset or empty, and only those', () => {
    const environ: Record<string, string | undefined> = { ...realEnvironment() }
    delete environ.HEARTH_ACCOUNT_PROD
    environ.HEARTH_ALERT_EMAIL = ''
    expect(problemsOf(() => parseLandingZoneEnv(environ))).toEqual([
      'HEARTH_ACCOUNT_PROD: is not set',
      'HEARTH_ALERT_EMAIL: is not set',
    ])
  })

  it('says what a malformed value must be, and never prints the value', () => {
    const bad = {
      ...realEnvironment(),
      HEARTH_ACCOUNT_NONPROD: `${fixtureAccount(3)}9`,
      HEARTH_ORG_ID: 'org-secret-value',
      HEARTH_ALERT_EMAIL: 'not-an-address',
      HEARTH_BUDGET_PROD_USD: '-5',
      HEARTH_GROUP_BILLING: 'billing',
    }
    const problems = problemsOf(() => parseLandingZoneEnv(bad))
    expect(problems).toEqual([
      'HEARTH_ORG_ID: must be an organization id (o-…)',
      'HEARTH_ACCOUNT_NONPROD: must be a 12-digit AWS account id',
      'HEARTH_GROUP_BILLING: must be an Identity Center group id',
      'HEARTH_ALERT_EMAIL: must be one email address',
      'HEARTH_BUDGET_PROD_USD: must be a whole number of US dollars from 1 to 999999',
    ])
    const text = problems.join('\n')
    for (const value of [bad.HEARTH_ACCOUNT_NONPROD, bad.HEARTH_ORG_ID, bad.HEARTH_ALERT_EMAIL, 'billing']) {
      expect(text).not.toContain(value)
    }
  })

  it('refuses two accounts, organisational units or groups that are the same', () => {
    const environ = {
      ...realEnvironment(),
      HEARTH_ACCOUNT_PROD: fixtureAccount(3),
      HEARTH_OU_RECOVERY: fixtureConfig().organization.ous.security,
      HEARTH_GROUP_BILLING: fixtureConfig().identityCenter.groups.onCall.toUpperCase(),
    }
    expect(problemsOf(() => parseLandingZoneEnv(environ))).toEqual([
      'HEARTH_ACCOUNT_PROD: must differ from HEARTH_ACCOUNT_NONPROD (each account is its own)',
      'HEARTH_OU_RECOVERY: must differ from HEARTH_OU_SECURITY (each organisational unit is its own)',
      'HEARTH_GROUP_BILLING: must differ from HEARTH_GROUP_ON_CALL (each group is its own)',
    ])
  })
})

describe('C11-D55: the OIDC subject each trust names exactly', () => {
  it('renders the fixture’s format for each GitHub environment, naming the deploy workflow on main', () => {
    const { github } = fixtureConfig()
    expect(githubSubject(github, 'prod')).toBe(
      `repo:example-org/hearth:environment:prod:job_workflow_ref:example-org/hearth/${DEPLOY_WORKFLOW_REF}`,
    )
    expect(githubSubject(github, 'nonprod')).toContain(':environment:nonprod:')
    expect(githubSubject(github, 'prod-plan')).toContain(':environment:prod-plan:')
  })

  it('fills the immutable form’s ids too', () => {
    const github = {
      ...fixtureConfig().github,
      subjectFormat: `repo:{owner}@{ownerId}/{name}@{repositoryId}:environment:{environment}:job_workflow_ref:{repository}/${DEPLOY_WORKFLOW_REF}`,
    }
    expect(githubSubject(github, 'nonprod')).toBe(
      `repo:example-org@1/hearth@2:environment:nonprod:job_workflow_ref:example-org/hearth/${DEPLOY_WORKFLOW_REF}`,
    )
  })

  it('refuses a format with a wildcard, an unknown placeholder, no environment or two, or no deploy workflow on main', () => {
    const tail = `:job_workflow_ref:{repository}/${DEPLOY_WORKFLOW_REF}`
    expect(subjectFormatProblem(`repo:{repository}:environment:{environment}${tail}`)).toBeUndefined()
    expect(subjectFormatProblem(`repo:{repository}:environment:*${tail}`)).toMatch(/exactly once/)
    expect(subjectFormatProblem(`repo:{repository}:*:environment:{environment}${tail}`)).toMatch(/wildcard/)
    expect(subjectFormatProblem(`repo:{repo}:environment:{environment}${tail}`)).toMatch(/placeholder/)
    expect(subjectFormatProblem(`repo:{repository}:environment:{environment}:{environment}${tail}`)).toMatch(
      /exactly once/,
    )
    expect(
      subjectFormatProblem(
        'repo:{repository}:environment:{environment}:job_workflow_ref:{repository}/.github/workflows/ci.yml@refs/heads/main',
      ),
    ).toMatch(/deploy workflow on main/)
    const environ = {
      ...realEnvironment(),
      HEARTH_GITHUB_SUBJECT_FORMAT: 'repo:{repository}:environment:{environment}',
    }
    expect(problemsOf(() => parseLandingZoneEnv(environ))).toEqual([
      `HEARTH_GITHUB_SUBJECT_FORMAT: must name the deploy workflow on main (${DEPLOY_WORKFLOW_REF})`,
    ])
  })
})

describe('C11-D55: the subject binds the repository the configuration names', () => {
  const workflow = `.github/workflows/deploy.yml@refs/heads/main`
  const withFormat = (subjectFormat: string) => ({ ...fixtureConfig().github, subjectFormat })
  const repoProblem = /must start with repo: and the repository HEARTH_GITHUB_REPOSITORY names/
  const workflowProblem = /must name, as job_workflow_ref, the deploy workflow on main of the repository/

  it('takes a format naming this repository by placeholder, by literal or in the immutable form', () => {
    expect(subjectRepositoryProblem(fixtureConfig().github)).toBeUndefined()
    expect(
      subjectRepositoryProblem(
        withFormat(`repo:example-org/hearth:environment:{environment}:job_workflow_ref:example-org/hearth/${workflow}`),
      ),
    ).toBeUndefined()
    expect(
      subjectRepositoryProblem(
        withFormat(
          `repo:{owner}@{ownerId}/{name}@{repositoryId}:environment:{environment}:job_workflow_ref:{repository}/${workflow}`,
        ),
      ),
    ).toBeUndefined()
    expect(
      subjectRepositoryProblem(
        withFormat(
          `repo:example-org@1/hearth@2:environment:{environment}:job_workflow_ref:example-org@1/hearth@2/${workflow}:x`,
        ),
      ),
    ).toBeUndefined()
  })

  it('refuses a format naming another repository, near-identical owner or ids included, in either position', () => {
    // A one-character change of the owner, which anyone could register.
    expect(
      subjectRepositoryProblem(
        withFormat(`repo:examp1e-org/hearth:environment:{environment}:job_workflow_ref:examp1e-org/hearth/${workflow}`),
      ),
    ).toMatch(repoProblem)
    expect(
      subjectRepositoryProblem(
        withFormat(`repo:example-org@1/hearth@3:environment:{environment}:job_workflow_ref:{repository}/${workflow}`),
      ),
    ).toMatch(repoProblem)
    expect(
      subjectRepositoryProblem(
        withFormat(`repo:{repository}-fork:environment:{environment}:job_workflow_ref:{repository}/${workflow}`),
      ),
    ).toMatch(repoProblem)
    expect(
      subjectRepositoryProblem(
        withFormat(`repo:{repository}:environment:{environment}:job_workflow_ref:examp1e-org/hearth/${workflow}`),
      ),
    ).toMatch(workflowProblem)
    expect(
      subjectRepositoryProblem(
        withFormat(`repo:{repository}:environment:{environment}:job_workflow_ref:{repository}/${workflow}-x`),
      ),
    ).toMatch(workflowProblem)
    expect(
      subjectRepositoryProblem(withFormat(`repo:{repository}:environment:{environment}:ref:{repository}/${workflow}`)),
    ).toMatch(workflowProblem)
  })

  it('the reader refuses it by the variable’s name, never printing the subject', () => {
    const typo = `repo:examp1e-org/hearth:environment:{environment}:job_workflow_ref:examp1e-org/hearth/${workflow}`
    const problems = problemsOf(() => parseLandingZoneEnv({ ...realEnvironment(), HEARTH_GITHUB_SUBJECT_FORMAT: typo }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/^HEARTH_GITHUB_SUBJECT_FORMAT: must start with repo:/)
    expect(problems.join('\n')).not.toContain('examp1e-org')
  })
})

describe('C11-D25: the run bin/landing-zone.ts makes', () => {
  it('HEARTH_FIXTURE=1 builds every target from the fixture', () => {
    const run = resolveLandingZone({ HEARTH_FIXTURE: '1' }, fixtureConfig)
    expect(run.config.fixture).toBe(true)
    expect(run.targets).toEqual(LANDING_ZONE_TARGETS)
    expect(resolveLandingZone({ HEARTH_FIXTURE: '1', HEARTH_TARGET: 'all' }, fixtureConfig).targets).toEqual(
      LANDING_ZONE_TARGETS,
    )
  })

  it('refuses a fixture configuration for a real target', () => {
    for (const target of LANDING_ZONE_TARGETS) {
      expect(
        problemsOf(() => resolveLandingZone({ HEARTH_FIXTURE: '1', HEARTH_TARGET: target }, fixtureConfig)),
      ).toEqual([
        `HEARTH_TARGET: ${target} is a real deploy, and the fixture's accounts are made up: set HEARTH_TARGET=all, or use your own configuration`,
      ])
      expect(() => checkRun(fixtureConfig(), target, chosen)).toThrow(LandingZoneConfigError)
    }
  })

  it('refuses a real value under HEARTH_FIXTURE=1, naming the variables and not their values', () => {
    const problems = problemsOf(() =>
      resolveLandingZone(
        { HEARTH_FIXTURE: '1', HEARTH_ACCOUNT_PROD: fixtureAccount(9), HEARTH_ORG_ID: ['o', 'x'.repeat(10)].join('-') },
        fixtureConfig,
      ),
    )
    expect(problems).toEqual([
      'HEARTH_FIXTURE: a fixture run takes no real configuration, but HEARTH_ORG_ID, HEARTH_ACCOUNT_PROD are set',
    ])
    expect(problems.join()).not.toContain(fixtureAccount(9))
  })

  it('a real run needs one named target, and refuses all', () => {
    expect(problemsOf(() => resolveLandingZone(realEnvironment(), fixtureConfig))).toEqual([
      `HEARTH_TARGET: is not set (one of ${LANDING_ZONE_TARGETS.join(', ')})`,
    ])
    expect(problemsOf(() => resolveLandingZone({ ...realEnvironment(), HEARTH_TARGET: 'all' }, fixtureConfig))).toEqual(
      ['HEARTH_TARGET: a real run builds one target, each deployed into its own account under its own credentials'],
    )
    expect(
      problemsOf(() => resolveLandingZone({ ...realEnvironment(), HEARTH_TARGET: 'everything' }, fixtureConfig)),
    ).toEqual([`HEARTH_TARGET: must be one of ${LANDING_ZONE_TARGETS.join(', ')}`])
    expect(problemsOf(() => resolveLandingZone({ HEARTH_FIXTURE: 'yes' }, fixtureConfig))).toEqual([
      'HEARTH_FIXTURE: must be 1, or unset',
    ])
  })

  it('C11-Q08: refuses the committed .invalid domains for any real target, until the owner chooses them', () => {
    for (const target of LANDING_ZONE_TARGETS) {
      expect(
        problemsOf(() => resolveLandingZone({ ...realEnvironment(), HEARTH_TARGET: target }, fixtureConfig)),
      ).toEqual([
        'infra/src/config/profiles.ts: DOMAINS.app and DOMAINS.userContent still are placeholders under .invalid; the owner chooses the domains (C11-Q08) before any real deploy',
      ])
    }
    expect(problemsOf(() => checkRun(real(), 'foundation', { ...chosen, userContent: 'x.invalid' }))).toEqual([
      'infra/src/config/profiles.ts: DOMAINS.userContent still is a placeholder under .invalid; the owner chooses the domains (C11-Q08) before any real deploy',
    ])
  })

  it('builds the one named target from a real configuration once the domains are chosen', () => {
    const run = checkRun(parseLandingZoneEnv(realEnvironment()), 'prod-baseline', chosen)
    expect(run.config.fixture).toBe(false)
    expect(run.targets).toEqual(['prod-baseline'])
  })
})

describe('C11-D25: infra/.env.example documents every variable, with placeholders only', () => {
  const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8')
  const lines = example.split('\n')
  const assignments = lines.flatMap((line, index) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    return match ? [{ name: match[1] ?? '', value: match[2] ?? '', index }] : []
  })

  it('names exactly the variables the reader and the run read, each once', () => {
    expect(assignments.map(a => a.name).sort()).toEqual([...CONFIG_VARIABLES, ...CONTROL_VARIABLES].sort())
  })

  it('each has a comment above it, or shares the comment of the group it is listed with', () => {
    for (const { name, index } of assignments) {
      let above = index - 1
      while (above >= 0 && /^[A-Z][A-Z0-9_]*=/.test(lines[above] ?? '')) above -= 1
      expect(lines[above] ?? '', name).toMatch(/^# \S/)
    }
  })

  it('leaves every value empty, so nothing real or made-up can be mistaken for a setting', () => {
    expect(assignments.filter(a => a.value !== '').map(a => a.name)).toEqual([])
  })
})
