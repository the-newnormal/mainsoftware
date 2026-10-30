// A complete, made-up landing-zone configuration for the tests now, and CI's synth:lz and the
// assertion tests from C0.11 PR 2 (C11-D25).
// Nothing in it is real, and nothing in this file is written in a shape that identifies an account
// or a person (IG-01): account ids are padded at run time (fixtureAccount), group ids are built the
// same way, and the organisation's and Identity Center's ids and the alert address are joined from
// their parts. It is marked `fixture: true`, which
// bin/landing-zone.ts refuses for any real target (checkRun), and AWS would refuse its accounts.
import type { ConfigVariable, LandingZoneConfig } from '../config/env.ts'

// The n-th made-up account id: n padded to 12 digits.
export function fixtureAccount(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) throw new Error('fixtureAccount takes 1 to 999')
  return String(n).padStart(12, '0')
}

// The n-th made-up Identity Center group id, in the identity store's UUID shape.
export function fixtureGroupId(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) throw new Error('fixtureGroupId takes 1 to 999')
  return ['00000000', '0000', '4000', '8000', String(n).padStart(12, '0')].join('-')
}

// A made-up organisation or Identity Center id, joined from its parts so the source holds none whole.
const madeUp = (...parts: string[]) => parts.join('-')

export function fixtureConfig(): LandingZoneConfig {
  return {
    fixture: true,
    organization: {
      id: madeUp('o', 'a'.repeat(10)),
      rootId: madeUp('r', 'abcd'),
      ous: {
        security: madeUp('ou', 'abcd', 'a'.repeat(8)),
        workloads: madeUp('ou', 'abcd', 'b'.repeat(8)),
        recovery: madeUp('ou', 'abcd', 'c'.repeat(8)),
      },
    },
    accounts: {
      management: fixtureAccount(1),
      logArchive: fixtureAccount(2),
      nonprod: fixtureAccount(3),
      prod: fixtureAccount(4),
    },
    identityCenter: {
      instanceId: madeUp('ssoins', '0'.repeat(16)),
      identityStoreId: madeUp('d', '0'.repeat(10)),
      groups: {
        orgAdmins: fixtureGroupId(1),
        onCall: fixtureGroupId(2),
        nonprodOperators: fixtureGroupId(3),
        reviewers: fixtureGroupId(4),
        billing: fixtureGroupId(5),
      },
    },
    github: {
      repository: 'example-org/hearth',
      ownerId: '1',
      repositoryId: '2',
      subjectFormat:
        'repo:{repository}:environment:{environment}:job_workflow_ref:{repository}/.github/workflows/deploy.yml@refs/heads/main',
    },
    alertEmail: ['hearth-ops', 'example.invalid'].join('@'),
    // C11-Q09's recommended amounts, as fictional as the rest.
    budgetsUsd: { organisation: 550, management: 25, logArchive: 25, nonprod: 200, prod: 300 },
  }
}

// A configuration written back as the HEARTH_* variables a person would set, for the reader's tests.
export function configEnvironment(config: LandingZoneConfig): Record<ConfigVariable, string> {
  return {
    HEARTH_ORG_ID: config.organization.id,
    HEARTH_ORG_ROOT_ID: config.organization.rootId,
    HEARTH_OU_SECURITY: config.organization.ous.security,
    HEARTH_OU_WORKLOADS: config.organization.ous.workloads,
    HEARTH_OU_RECOVERY: config.organization.ous.recovery,
    HEARTH_ACCOUNT_MANAGEMENT: config.accounts.management,
    HEARTH_ACCOUNT_LOG_ARCHIVE: config.accounts.logArchive,
    HEARTH_ACCOUNT_NONPROD: config.accounts.nonprod,
    HEARTH_ACCOUNT_PROD: config.accounts.prod,
    HEARTH_SSO_INSTANCE_ID: config.identityCenter.instanceId,
    HEARTH_IDENTITY_STORE_ID: config.identityCenter.identityStoreId,
    HEARTH_GROUP_ORG_ADMINS: config.identityCenter.groups.orgAdmins,
    HEARTH_GROUP_ON_CALL: config.identityCenter.groups.onCall,
    HEARTH_GROUP_NONPROD_OPERATORS: config.identityCenter.groups.nonprodOperators,
    HEARTH_GROUP_REVIEWERS: config.identityCenter.groups.reviewers,
    HEARTH_GROUP_BILLING: config.identityCenter.groups.billing,
    HEARTH_GITHUB_REPOSITORY: config.github.repository,
    HEARTH_GITHUB_OWNER_ID: config.github.ownerId,
    HEARTH_GITHUB_REPOSITORY_ID: config.github.repositoryId,
    HEARTH_GITHUB_SUBJECT_FORMAT: config.github.subjectFormat,
    HEARTH_ALERT_EMAIL: config.alertEmail,
    HEARTH_BUDGET_ORGANISATION_USD: String(config.budgetsUsd.organisation),
    HEARTH_BUDGET_MANAGEMENT_USD: String(config.budgetsUsd.management),
    HEARTH_BUDGET_LOG_ARCHIVE_USD: String(config.budgetsUsd.logArchive),
    HEARTH_BUDGET_NONPROD_USD: String(config.budgetsUsd.nonprod),
    HEARTH_BUDGET_PROD_USD: String(config.budgetsUsd.prod),
  }
}
