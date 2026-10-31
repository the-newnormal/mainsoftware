// IAC-19's assignment half and the permission sets (C11-D09 to C11-D11, C11-D69; TECH-SPEC T24 item
// 3), as Hearth-Foundation renders them. The attribute for access control maps each person's sign-in
// name to hearth-user, which break-glass's trust reads. Each of the five sets has its session length,
// its managed policy and exactly the inline policy this file builds, which opens with the model deny
// in place: management's only fence for people, since no SCP binds it. HearthOrgAdmin can't close an
// account or take one out of the organisation without an alarmed edit of itself first, and the
// reviewer decrypts only through S3 under the trail's or the break-glass entries' encryption context.
// Who holds which set where: nobody holds a standing set in an account whose profile holds real data
// but the break-glass entry, which grants nothing but assuming that account's alarmed break-glass
// role; non-prod's operator set is assigned only while non-prod holds no real data, which a variant
// synth shows. Expected ARNs are joined from their parts here (IG-01).
import { beforeAll, describe, expect, it } from 'vitest'
import { globsOverlap, modelDenyActions } from '../config/models.ts'
import { PROFILES } from '../config/profiles.ts'
import { fixtureConfig } from '../testing/fixture.ts'
import { type LandingZoneSynth, synthLandingZone } from '../testing/landing-zone.ts'
import { isModelDenyInPlace, policyStatements } from '../testing/policies.ts'

type Template = Record<string, unknown>
interface Resource {
  Type: string
  Properties?: Record<string, unknown>
  DeletionPolicy?: string
  UpdateReplacePolicy?: string
}

const fixture = fixtureConfig()
const { management, logArchive, nonprod, prod } = fixture.accounts
const REGION = 'ap-southeast-1'

const resourcesIn = (template: Template): Array<[string, Resource]> =>
  Object.entries((template.Resources ?? {}) as Record<string, Resource>)
const ofType = (template: Template, type: string) => resourcesIn(template).filter(([, r]) => r.Type === type)
const arn = (service: string, region: string, account: string, resource: string) =>
  ['arn', 'aws', service, region, account, resource].join(':')
// An IAM policy variable, written as a template so no plain string holds `${`.
const variable = (name: string) => `\${${name}}`
const INSTANCE = arn('sso', '', '', `instance/${fixture.identityCenter.instanceId}`)
const managed = (name: string) => arn('iam', '', 'aws', `policy/${name}`)

// The sets, each with what it must hold (C11-D10, C11-D11, C11-D17).
const NO_MODELS = { Sid: 'NoModels', Effect: 'Deny', Action: modelDenyActions(), Resource: '*' }
const keys = arn('kms', REGION, logArchive, 'key/*')
const viaS3 = { 'kms:ViaService': `s3.${REGION}.amazonaws.com` }
const bucket = (name: string) => arn('s3', '', '', name)
const trailBucket = bucket(`hearth-org-trail-${logArchive}`)
const entriesBucket = bucket(`hearth-break-glass-log-${logArchive}`)
const archiveBucket = bucket(`hearth-archive-${logArchive}`)
const trailCopy = arn('logs', REGION, management, 'log-group:/hearth/security/org-trail')
const SETS: Record<string, { session: string; managed: string[]; inline: unknown[] }> = {
  HearthOrgAdmin: {
    session: 'PT1H',
    managed: [managed('AdministratorAccess')],
    inline: [
      NO_MODELS,
      {
        Sid: 'NoAccountRemoval',
        Effect: 'Deny',
        Action: ['organizations:CloseAccount', 'organizations:RemoveAccountFromOrganization'],
        Resource: '*',
      },
    ],
  },
  HearthBreakGlassEntry: {
    session: 'PT1H',
    managed: [],
    inline: [
      NO_MODELS,
      {
        Sid: 'AssumeBreakGlass',
        Effect: 'Allow',
        Action: ['sts:AssumeRole', 'sts:TagSession', 'sts:SetSourceIdentity'],
        Resource: arn('iam', '', variable('aws:PrincipalAccount'), 'role/hearth-break-glass'),
        Condition: { StringEquals: { 'aws:RequestedRegion': REGION } },
      },
    ],
  },
  HearthNonprodOperator: {
    session: 'PT8H',
    managed: [managed('ReadOnlyAccess')],
    inline: [
      NO_MODELS,
      {
        Sid: 'UpdateServices',
        Effect: 'Allow',
        Action: 'ecs:UpdateService',
        Resource: arn('ecs', REGION, variable('aws:PrincipalAccount'), 'service/hearth-*/*'),
      },
      { Sid: 'NoSecretValues', Effect: 'Deny', Action: 'secretsmanager:GetSecretValue', Resource: '*' },
    ],
  },
  HearthSecurityReview: {
    session: 'PT4H',
    managed: [],
    inline: [
      NO_MODELS,
      {
        Sid: 'QueryTrailCopy',
        Effect: 'Allow',
        Action: ['logs:StartQuery', 'logs:GetLogEvents', 'logs:FilterLogEvents', 'logs:DescribeLogStreams'],
        Resource: [trailCopy, `${trailCopy}:*`],
      },
      {
        Sid: 'QueryResults',
        Effect: 'Allow',
        Action: [
          'logs:GetQueryResults',
          'logs:StopQuery',
          'logs:DescribeLogGroups',
          'logs:DescribeQueries',
          'logs:DescribeQueryDefinitions',
        ],
        Resource: '*',
      },
      {
        Sid: 'ReadLogs',
        Effect: 'Allow',
        Action: [
          's3:GetObject',
          's3:GetObjectVersion',
          's3:ListBucket',
          's3:ListBucketVersions',
          's3:GetBucketLocation',
          's3:GetBucketPolicy',
          's3:GetBucketVersioning',
          's3:GetBucketObjectLockConfiguration',
          's3:GetLifecycleConfiguration',
          's3:GetEncryptionConfiguration',
          's3:GetObjectRetention',
        ],
        Resource: [trailBucket, `${trailBucket}/*`, entriesBucket, `${entriesBucket}/*`],
      },
      {
        Sid: 'DecryptTrail',
        Effect: 'Allow',
        Action: 'kms:Decrypt',
        Resource: keys,
        Condition: {
          StringEquals: viaS3,
          StringLike: {
            'kms:EncryptionContext:aws:cloudtrail:arn': arn('cloudtrail', '*', management, 'trail/hearth-org-trail'),
          },
        },
      },
      {
        Sid: 'DecryptEntries',
        Effect: 'Allow',
        Action: 'kms:Decrypt',
        Resource: keys,
        Condition: {
          StringEquals: viaS3,
          StringLike: { 'kms:EncryptionContext:aws:s3:arn': [entriesBucket, `${entriesBucket}/*`] },
        },
      },
      {
        Sid: 'KeyReadBack',
        Effect: 'Allow',
        Action: ['kms:DescribeKey', 'kms:GetKeyPolicy', 'kms:GetKeyRotationStatus', 'kms:ListResourceTags'],
        Resource: keys,
      },
      {
        Sid: 'Findings',
        Effect: 'Allow',
        Action: ['guardduty:Get*', 'guardduty:List*', 'access-analyzer:Get*', 'access-analyzer:List*'],
        Resource: '*',
      },
      { Sid: 'NeverTheArchive', Effect: 'Deny', Action: 's3:*', Resource: [archiveBucket, `${archiveBucket}/*`] },
      {
        Sid: 'NeverTheArchiveKey',
        Effect: 'Deny',
        Action: ['kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
        Resource: '*',
        Condition: { 'ForAnyValue:StringEquals': { 'kms:ResourceAliases': 'alias/hearth-archive' } },
      },
    ],
  },
  HearthBilling: { session: 'PT1H', managed: [managed('AWSBillingReadOnlyAccess')], inline: [NO_MODELS] },
}

// The accounts and groups the fixture names, by the name a message gives them.
const ACCOUNT_NAMES: Record<string, string> = {
  [management]: 'management',
  [logArchive]: 'log-archive',
  [nonprod]: 'nonprod',
  [prod]: 'prod',
}
const GROUP_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(fixture.identityCenter.groups).map(([name, id]) => [id, name]),
)

// Each assignment as "set → account (group)", the set read through its PermissionSetArn's GetAtt.
function assignments(template: Template): string[] {
  const setNames = new Map(
    ofType(template, 'AWS::SSO::PermissionSet').map(([id, r]) => [id, String(r.Properties?.Name)]),
  )
  return ofType(template, 'AWS::SSO::Assignment').map(([, r]) => {
    const properties = r.Properties ?? {}
    const getAtt = (properties.PermissionSetArn as { 'Fn::GetAtt'?: [string, string] })['Fn::GetAtt']
    const set = getAtt?.[1] === 'PermissionSetArn' ? setNames.get(getAtt[0]) : undefined
    return `${set ?? 'an unreadable set'} → ${ACCOUNT_NAMES[String(properties.TargetId)] ?? 'another account'} (${GROUP_NAMES[String(properties.PrincipalId)] ?? 'another principal'})`
  })
}

// The sets assigned to each account whose profile holds real data, which may be the break-glass entry
// alone (IAC-19): prod's profile (and restore's, in prod's account) holds it today.
function realDataSets(template: Template, realData: ReadonlyArray<'nonprod' | 'prod'>): string[] {
  const names = realData.map(account => (account === 'prod' ? 'prod' : 'nonprod'))
  return assignments(template).filter(line => names.some(name => line.includes(`→ ${name} (`)))
}

let lz: LandingZoneSynth
let foundation: Template

beforeAll(() => {
  lz = synthLandingZone()
  foundation = lz.templates.foundation
}, 60_000)

describe('C11-D10: the permission sets', () => {
  it('C11-D09: the attribute for access control maps each person’s sign-in name to hearth-user, on the organisation’s instance', () => {
    const configs = ofType(foundation, 'AWS::SSO::InstanceAccessControlAttributeConfiguration')
    expect(configs.map(([, r]) => r.Properties)).toEqual([
      {
        InstanceArn: INSTANCE,
        AccessControlAttributes: [{ Key: 'hearth-user', Value: { Source: [variable('path:userName')] } }],
      },
    ])
  })

  it('C11-D10: the five sets and their assignments are IdentityCenter’s constructs, by these ids', () => {
    const identityCenter = lz.stacks.foundation?.node.tryFindChild('IdentityCenter')
    expect(identityCenter?.node.children.map(child => child.node.id)).toEqual([
      'AccessControlAttributes',
      'OrgAdmin',
      'BreakGlassEntry',
      'NonprodOperator',
      'SecurityReview',
      'Billing',
      'OrgAdminInManagement',
      'BreakGlassEntryInProd',
      'BreakGlassEntryInLogArchive',
      'BreakGlassEntryInNonprod',
      'NonprodOperatorInNonprod',
      'SecurityReviewInManagement',
      'SecurityReviewInLogArchive',
      'BillingInManagement',
    ])
  })

  it('C11-D10 C11-D11: each set has its session, its managed policy and exactly its inline policy, on the instance, retained once made (never on a rolled-back create)', () => {
    const sets = ofType(foundation, 'AWS::SSO::PermissionSet')
    expect(sets.map(([, r]) => r.Properties?.Name)).toEqual(Object.keys(SETS))
    for (const [, set] of sets) {
      const name = String(set.Properties?.Name)
      const expected = SETS[name]
      expect(set.Properties?.InstanceArn, name).toBe(INSTANCE)
      expect(set.Properties?.SessionDuration, name).toBe(expected?.session)
      expect(set.Properties?.ManagedPolicies ?? [], name).toEqual(expected?.managed)
      expect(set.Properties?.CustomerManagedPolicyReferences, name).toBeUndefined()
      expect(set.Properties?.PermissionsBoundary, name).toBeUndefined()
      expect(set.Properties?.InlinePolicy, name).toEqual({ Version: '2012-10-17', Statement: expected?.inline })
      expect(String(set.Properties?.Description), name).toMatch(/\((?:C11-D\d{2}, )*C11-D\d{2}\)$/)
      expect(set.DeletionPolicy, name).toBe('RetainExceptOnCreate')
      expect(set.UpdateReplacePolicy, name).toBe('Retain')
    }
  })

  it('C11-D06 C11-D10: every set’s inline policy opens with the model deny in place, its own and no other’s', () => {
    const statements = policyStatements(foundation).filter(s => s.type === 'AWS::SSO::PermissionSet')
    const opening = ofType(foundation, 'AWS::SSO::PermissionSet').map(([id, r]) => {
      const first = statements.find(s => s.logicalId === id)
      return `${String(r.Properties?.Name)}: ${first?.sid} ${first !== undefined && isModelDenyInPlace(first) ? 'in place' : 'NOT in place'}`
    })
    expect(opening).toEqual(Object.keys(SETS).map(name => `${name}: NoModels in place`))
  })

  it('C11-D10: HearthOrgAdmin may neither close an account nor take one out of the organisation, on anything, unconditionally', () => {
    const orgAdmin = ofType(foundation, 'AWS::SSO::PermissionSet').find(
      ([, r]) => r.Properties?.Name === 'HearthOrgAdmin',
    )
    const removal = policyStatements(foundation).filter(
      s => s.logicalId === orgAdmin?.[0] && s.sid === 'NoAccountRemoval',
    )
    expect(removal.map(s => ({ ...s, logicalId: 'set' }))).toEqual([
      {
        logicalId: 'set',
        type: 'AWS::SSO::PermissionSet',
        where: 'InlinePolicy',
        conditional: false,
        sid: 'NoAccountRemoval',
        effect: 'Deny',
        actions: ['organizations:CloseAccount', 'organizations:RemoveAccountFromOrganization'],
        notActions: [],
        resources: ['*'],
        notResources: [],
        principal: undefined,
        notPrincipal: undefined,
        condition: undefined,
      },
    ])
  })

  it('C11-D17 C11-D21: the reviewer decrypts only through S3, under the trail’s or the break-glass entries’ encryption context, and never the archive', () => {
    const review = ofType(foundation, 'AWS::SSO::PermissionSet').find(
      ([, r]) => r.Properties?.Name === 'HearthSecurityReview',
    )
    const decrypts = policyStatements(foundation).filter(
      s =>
        s.logicalId === review?.[0] &&
        s.effect === 'Allow' &&
        s.actions.some(action => globsOverlap(action.toLowerCase(), 'kms:decrypt')),
    )
    expect(decrypts.map(s => s.sid)).toEqual(['DecryptTrail', 'DecryptEntries'])
    for (const s of decrypts) {
      const condition = s.condition as Record<string, Record<string, unknown>>
      expect(condition.StringEquals, s.sid).toEqual(viaS3)
      expect(Object.keys(condition.StringLike ?? {}), s.sid).toHaveLength(1)
    }
    expect(decrypts[0]?.condition).toMatchObject({
      StringLike: {
        'kms:EncryptionContext:aws:cloudtrail:arn': arn('cloudtrail', '*', management, 'trail/hearth-org-trail'),
      },
    })
    expect(decrypts[1]?.condition).toMatchObject({
      StringLike: { 'kms:EncryptionContext:aws:s3:arn': [entriesBucket, `${entriesBucket}/*`] },
    })
  })
})

describe('IAC-19 C11-D10 C11-D69: who holds which set where', () => {
  const realData = (['nonprod', 'prod'] as const).filter(account => PROFILES[account].holdsRealData)

  it('IAC-19: eight group assignments to whole accounts: the organisation’s administrators, the on-call group’s break-glass entry in every member account, non-prod’s operators, the reviewers and billing', () => {
    expect(assignments(foundation)).toEqual([
      'HearthOrgAdmin → management (orgAdmins)',
      'HearthBreakGlassEntry → prod (onCall)',
      'HearthBreakGlassEntry → log-archive (onCall)',
      'HearthBreakGlassEntry → nonprod (onCall)',
      'HearthNonprodOperator → nonprod (nonprodOperators)',
      'HearthSecurityReview → management (reviewers)',
      'HearthSecurityReview → log-archive (reviewers)',
      'HearthBilling → management (billing)',
    ])
    for (const [, assignment] of ofType(foundation, 'AWS::SSO::Assignment')) {
      expect(assignment.Properties?.InstanceArn).toBe(INSTANCE)
      expect(assignment.Properties?.PrincipalType).toBe('GROUP')
      expect(assignment.Properties?.TargetType).toBe('AWS_ACCOUNT')
      // Never retained: one that leaves the template must leave AWS too (C11-D69).
      expect(assignment.DeletionPolicy).toBeUndefined()
    }
  })

  it('IAC-19 C11-Q02: an account whose profile holds real data (prod, restore’s too) holds no standing set but the break-glass entry', () => {
    expect(realData).toEqual(['prod'])
    expect(PROFILES.restore.holdsRealData).toBe(true)
    expect(realDataSets(foundation, realData)).toEqual(['HearthBreakGlassEntry → prod (onCall)'])
  })

  it('IAC-19 C11-D69: once non-prod holds real data, its operator set goes, and the break-glass entry is all it holds', () => {
    const variant = synthLandingZone({ holdsRealData: { nonprod: true } }).templates.foundation
    // The committed build still assigns the operator set, which the variant takes away.
    expect(realDataSets(foundation, ['nonprod'])).toContain('HearthNonprodOperator → nonprod (nonprodOperators)')
    expect(realDataSets(variant, ['nonprod', 'prod'])).toEqual([
      'HearthBreakGlassEntry → prod (onCall)',
      'HearthBreakGlassEntry → nonprod (onCall)',
    ])
    expect(assignments(variant)).toEqual(
      assignments(foundation).filter(line => line !== 'HearthNonprodOperator → nonprod (nonprodOperators)'),
    )
    // The set itself stays, retained, for the day it is assigned again.
    expect(ofType(variant, 'AWS::SSO::PermissionSet').map(([, r]) => r.Properties?.Name)).toEqual(Object.keys(SETS))
  }, 60_000)
})
