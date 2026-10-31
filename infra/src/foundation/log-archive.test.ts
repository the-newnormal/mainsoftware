// Hearth-LogArchive (C11-D13, C11-D17 to C11-D21; TECH-SPEC T24 items 6 and 7), the evidence the rest
// of the organisation can't reach:
// - IAC-05: its three buckets, and no bucket anywhere else: private, encrypted under their own key
//   with a bucket key, versioned, owner-enforced, retained, and each policy refusing plain HTTP and
//   TLS below 1.2;
// - IAC-06: every version of the trail and break-glass-log buckets locked for its class's period in
//   the mode configured (a variant shows COMPLIANCE), then expired by exactly two lifecycle rules
//   with no tag filter, LCG-02's one exception; the archive locked with no default and no rule;
// - the keys: rotated, a 30-day deletion window, tagged hearth-sec and retained, each policy exactly
//   as written here, so neither carries the account root's kms:*;
// - IAC-23: nothing reads the archive bucket or can use the archive key, in any template; every grant
//   on log-archive's keys by pattern is bounded by an encryption context naming only the trail or the
//   break-glass log; the reviewer decrypts only through S3 under those contexts;
// - IAC-11 for log-archive's hearth-break-glass: its trust, and a scope that writes its own entries
//   and triages, with no landing-zone role, bastion, database login, secret or trail object;
// - C11-D20 A9 A10: the organisation's analyzer, with no archive rule, and the findings alarms.
// Planted cases come first for IAC-23's checks. Expected ARNs are joined from their parts (IG-01),
// the template's own expiry keys are compared as written (LCG-02), and the model deny comes from the
// lists (IG-10).
import { RETENTION_CLASSES } from '@hearth/shared'
import { beforeAll, describe, expect, it } from 'vitest'
import { REASON_SHAPES } from '../baseline/break-glass.ts'
import { globsOverlap, modelDenyActions } from '../config/models.ts'
import { LOG_ARCHIVE } from '../config/profiles.ts'
import { objectLockDays } from '../config/retention.ts'
import { fixtureConfig } from '../testing/fixture.ts'
import { type LandingZoneSynth, synthLandingZone } from '../testing/landing-zone.ts'
import { type PolicyStatementAt, policyStatements, renderedString } from '../testing/policies.ts'

type Template = Record<string, unknown>
interface Resource {
  Type: string
  Properties?: Record<string, unknown>
  DependsOn?: string[]
  DeletionPolicy?: string
  UpdateReplacePolicy?: string
}

const fixture = fixtureConfig()
const { management, logArchive } = fixture.accounts
const REGION = 'ap-southeast-1'
const resourcesIn = (template: Template): Array<[string, Resource]> =>
  Object.entries((template.Resources ?? {}) as Record<string, Resource>)
const ofType = (template: Template, type: string) => resourcesIn(template).filter(([, r]) => r.Type === type)
function one(template: Template, type: string, property: string, value: unknown): [string, Resource] {
  const found = ofType(template, type).filter(([, r]) => r.Properties?.[property] === value)
  if (found.length !== 1) throw new Error(`${found.length} ${type} with ${property} ${String(value)}, not one`)
  return found[0] as [string, Resource]
}
const arn = (service: string, region: string, account: string, resource: string) =>
  ['arn', 'aws', service, region, account, resource].join(':')
const variable = (name: string) => `\${${name}}`
const lower = (action: string) => action.toLowerCase()
const overlapsAny = (actions: readonly string[], patterns: readonly string[]) =>
  actions.some(action => patterns.some(pattern => globsOverlap(lower(action), pattern)))

// The three buckets, by name, and their ARNs.
const BUCKET = {
  trail: `hearth-org-trail-${logArchive}`,
  breakGlass: `hearth-break-glass-log-${logArchive}`,
  archive: `hearth-archive-${logArchive}`,
}
const bucketArn = (name: string) => arn('s3', '', '', name)
const S3_VIA = `s3.${REGION}.amazonaws.com`
const EXEC = arn('iam', '', logArchive, `role/cdk-hearthbase-cfn-exec-role-${logArchive}-${REGION}`)
const REVIEWER = arn(
  'iam',
  '',
  logArchive,
  'role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_HearthSecurityReview_*',
)
const ROOT = arn('iam', '', logArchive, 'root')
const ORG_TRAIL = arn('cloudtrail', REGION, management, 'trail/hearth-org-trail')
const ANY_TRAIL = arn('cloudtrail', '*', management, 'trail/*')

let lz: LandingZoneSynth
let template: Template
const STACKS = () => [
  { name: 'Hearth-Foundation', account: management, template: lz.templates.foundation },
  { name: 'Hearth-LogArchive', account: logArchive, template: lz.templates.logArchive },
  { name: 'Hearth-nonprod-Baseline', account: fixture.accounts.nonprod, template: lz.templates.nonprodBaseline },
  { name: 'Hearth-prod-Baseline', account: fixture.accounts.prod, template: lz.templates.prodBaseline },
]
// Each key's logical id, by its alias.
const keyOf = (t: Template, alias: string) => {
  const target = one(t, 'AWS::KMS::Alias', 'AliasName', alias)[1].Properties?.TargetKeyId as { 'Fn::GetAtt': string[] }
  return target['Fn::GetAtt'][0] ?? ''
}
const bucketOf = (t: Template, name: string) => one(t, 'AWS::S3::Bucket', 'BucketName', name)

beforeAll(() => {
  lz = synthLandingZone()
  template = lz.templates.logArchive
}, 60_000)

// --- IAC-05 and IAC-06 ----------------------------------------------------------------------------

describe('IAC-05 C11-D17: the log-archive buckets', () => {
  it('IAC-05: the three buckets are LogArchive’s, by these construct ids, and no other landing-zone template holds a bucket', () => {
    expect(ofType(template, 'AWS::S3::Bucket').map(([, r]) => r.Properties?.BucketName)).toEqual(Object.values(BUCKET))
    for (const other of [lz.templates.foundation, lz.templates.nonprodBaseline, lz.templates.prodBaseline]) {
      expect(ofType(other, 'AWS::S3::Bucket')).toEqual([])
    }
    const stack = lz.stacks.logArchive
    expect(
      ['TrailBucket', 'BreakGlassLogBucket', 'ArchiveBucket'].map(id => stack?.node.tryFindChild(id)?.node.id),
    ).toEqual(['TrailBucket', 'BreakGlassLogBucket', 'ArchiveBucket'])
  })

  it('IAC-05: each is private, encrypted under its own key with a bucket key (the log buckets under hearth-sec, the archive under hearth-archive), versioned, owner-enforced and retained', () => {
    const keyFor = { trail: 'alias/hearth-sec', breakGlass: 'alias/hearth-sec', archive: 'alias/hearth-archive' }
    for (const [kind, name] of Object.entries(BUCKET) as Array<[keyof typeof BUCKET, string]>) {
      const [, bucket] = bucketOf(template, name)
      expect(bucket.Properties, name).toMatchObject({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              BucketKeyEnabled: true,
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'aws:kms',
                KMSMasterKeyID: { 'Fn::GetAtt': [keyOf(template, keyFor[kind]), 'Arn'] },
              },
            },
          ],
        },
        VersioningConfiguration: { Status: 'Enabled' },
        OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
      })
      expect(bucket.Properties?.LoggingConfiguration, name).toBeUndefined()
      expect(bucket.DeletionPolicy, name).toBe('Retain')
      expect(bucket.UpdateReplacePolicy, name).toBe('Retain')
    }
  })

  it('IAC-05 C11-D13 C11-D17 C11-D21: each bucket’s policy is exactly its two TLS denies and its own statements', () => {
    const tlsDenies = (bucketId: string) => {
      const resource = [
        { 'Fn::GetAtt': [bucketId, 'Arn'] },
        { 'Fn::Join': ['', [{ 'Fn::GetAtt': [bucketId, 'Arn'] }, '/*']] },
      ]
      return [
        {
          Effect: 'Deny',
          Principal: { AWS: '*' },
          Action: 's3:*',
          Resource: resource,
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        },
        {
          Effect: 'Deny',
          Principal: { AWS: '*' },
          Action: 's3:*',
          Resource: resource,
          Condition: { NumericLessThan: { 's3:TlsVersion': 1.2 } },
        },
      ]
    }
    const breakGlassRoles = {
      StringEquals: { 'aws:PrincipalOrgID': fixture.organization.id },
      ArnLike: { 'aws:PrincipalArn': arn('iam', '', '*', 'role/hearth-break-glass') },
    }
    const ownEntries = `${bucketArn(BUCKET.breakGlass)}/break-glass/${variable('aws:PrincipalAccount')}/*`
    const cloudTrailWrite = (Sid: string, prefix: string) => ({
      Sid,
      Effect: 'Allow',
      Principal: { Service: 'cloudtrail.amazonaws.com' },
      Action: 's3:PutObject',
      Resource: `${bucketArn(BUCKET.trail)}/AWSLogs/${prefix}/*`,
      Condition: { StringEquals: { 's3:x-amz-acl': 'bucket-owner-full-control', 'aws:SourceArn': ORG_TRAIL } },
    })
    const expected: Record<string, unknown[]> = {
      [BUCKET.trail]: [
        {
          Sid: 'AWSCloudTrailAclCheck',
          Effect: 'Allow',
          Principal: { Service: 'cloudtrail.amazonaws.com' },
          Action: 's3:GetBucketAcl',
          Resource: bucketArn(BUCKET.trail),
          Condition: { StringEquals: { 'aws:SourceArn': ORG_TRAIL } },
        },
        cloudTrailWrite('AWSCloudTrailOrganizationWrite', fixture.organization.id),
        cloudTrailWrite('AWSCloudTrailAccountWrite', management),
      ],
      [BUCKET.breakGlass]: [
        {
          Sid: 'EntriesWrite',
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: 's3:PutObject',
          Resource: ownEntries,
          Condition: breakGlassRoles,
        },
        {
          Sid: 'EntriesRead',
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: 's3:GetObject',
          Resource: ownEntries,
          Condition: breakGlassRoles,
        },
        {
          Sid: 'EntriesList',
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: 's3:ListBucket',
          Resource: bucketArn(BUCKET.breakGlass),
          Condition: {
            ...breakGlassRoles,
            StringLike: { 's3:prefix': `break-glass/${variable('aws:PrincipalAccount')}/*` },
          },
        },
        {
          Sid: 'ReviewerRead',
          Effect: 'Allow',
          Principal: { AWS: ROOT },
          Action: ['s3:Get*', 's3:List*'],
          Resource: [bucketArn(BUCKET.breakGlass), `${bucketArn(BUCKET.breakGlass)}/*`],
          Condition: { ArnLike: { 'aws:PrincipalArn': REVIEWER } },
        },
        {
          Sid: 'OnlyEntryActions',
          Effect: 'Deny',
          Principal: { AWS: '*' },
          NotAction: ['s3:Get*', 's3:List*', 's3:PutObject'],
          Resource: [bucketArn(BUCKET.breakGlass), `${bucketArn(BUCKET.breakGlass)}/*`],
          Condition: { ArnNotLike: { 'aws:PrincipalArn': EXEC } },
        },
      ],
      [BUCKET.archive]: [
        {
          Sid: 'NoReadersYet',
          Effect: 'Deny',
          Principal: { AWS: '*' },
          Action: 's3:GetObject*',
          Resource: `${bucketArn(BUCKET.archive)}/*`,
        },
      ],
    }
    const policies = ofType(template, 'AWS::S3::BucketPolicy')
    expect(policies).toHaveLength(3)
    for (const name of Object.values(BUCKET)) {
      const [bucketId] = bucketOf(template, name)
      const policy = policies.filter(
        ([, p]) => (p.Properties?.Bucket as { Ref?: string } | undefined)?.Ref === bucketId,
      )
      expect(
        policy.map(([, p]) => p.Properties?.PolicyDocument),
        name,
      ).toEqual([{ Version: '2012-10-17', Statement: [...tlsDenies(bucketId), ...(expected[name] ?? [])] }])
    }
  })
})

describe('IAC-06 C11-D18 C11-D19: Object Lock and the locked buckets’ expiry', () => {
  const lockedRules = (days: number) => [
    {
      Id: 'retention-exit',
      Status: 'Enabled',
      Transitions: [{ StorageClass: 'GLACIER_IR', TransitionInDays: 30 }],
      ExpirationInDays: days,
      NoncurrentVersionExpiration: { NoncurrentDays: 1 },
    },
    { Id: 'expired-delete-markers', Status: 'Enabled', ExpiredObjectDeleteMarker: true },
  ]
  const locked = (t: Template, mode: string) => {
    for (const [name, logClass] of [
      [BUCKET.trail, 'cloudtrail'],
      [BUCKET.breakGlass, 'break_glass_log'],
    ] as const) {
      const days = objectLockDays(logClass)
      expect(RETENTION_CLASSES[logClass].period, name).toMatchObject({ kind: 'days', days })
      const [, bucket] = bucketOf(t, name)
      expect(bucket.Properties?.ObjectLockEnabled, name).toBe(true)
      expect(bucket.Properties?.ObjectLockConfiguration, name).toEqual({
        ObjectLockEnabled: 'Enabled',
        Rule: { DefaultRetention: { Mode: mode, Days: days } },
      })
      // LCG-02's exception, at the template: two rules, no tag filter, the expiry at the lock's end.
      expect(bucket.Properties?.LifecycleConfiguration, name).toEqual({ Rules: lockedRules(days) })
    }
  }

  it('IAC-06: every version of the trail and break-glass-log buckets is locked for its class’s period in the configured mode, then expires by two rules with no tag filter', () => {
    expect(LOG_ARCHIVE.logLockMode).toBe('GOVERNANCE')
    locked(template, LOG_ARCHIVE.logLockMode)
  })

  it('IAC-06 C11-D21: the archive is locked with no default retention and no lifecycle rule, under a key of its own', () => {
    const [, archive] = bucketOf(template, BUCKET.archive)
    expect(archive.Properties?.ObjectLockEnabled).toBe(true)
    expect(archive.Properties?.ObjectLockConfiguration).toBeUndefined()
    expect(archive.Properties?.LifecycleConfiguration).toBeUndefined()
    expect(keyOf(template, 'alias/hearth-archive')).not.toBe(keyOf(template, 'alias/hearth-sec'))
  })

  it('IAC-06 C11-D18: the COMPLIANCE variant locks both log buckets in COMPLIANCE, and leaves the archive as it was', () => {
    const compliance = synthLandingZone({ logLockMode: 'COMPLIANCE' }).templates.logArchive
    expect(() => locked(template, 'COMPLIANCE')).toThrow()
    locked(compliance, 'COMPLIANCE')
    expect(bucketOf(compliance, BUCKET.archive)[1]).toEqual(bucketOf(template, BUCKET.archive)[1])
  }, 60_000)

  it('IAC-06 C11-D17 C11-D21: both keys rotate, keep a 30-day deletion window, carry the hearth-sec tag the floor protects them by, and are retained', () => {
    for (const alias of ['alias/hearth-sec', 'alias/hearth-archive']) {
      const [, key] = resourcesIn(template).find(([id]) => id === keyOf(template, alias)) as [string, Resource]
      expect(key.Properties, alias).toMatchObject({
        EnableKeyRotation: true,
        PendingWindowInDays: 30,
        Tags: [{ Key: 'hearth-sec', Value: 'true' }],
      })
      expect(key.DeletionPolicy, alias).toBe('Retain')
      expect(key.UpdateReplacePolicy, alias).toBe('Retain')
    }
    expect(['SecKey', 'ArchiveKey'].map(id => lz.stacks.logArchive?.node.tryFindChild(id)?.node.id)).toEqual([
      'SecKey',
      'ArchiveKey',
    ])
  })

  it('C11-D17 C11-D21: each key’s policy is exactly what this test writes: the hearthbase execution role administers both, CloudTrail, break-glass and the reviewer use hearth-sec alone, and three readers read each back', () => {
    const administration = {
      Sid: 'KeyAdministration',
      Effect: 'Allow',
      Principal: { AWS: EXEC },
      Action: [
        'kms:Create*',
        'kms:Describe*',
        'kms:Enable*',
        'kms:List*',
        'kms:Put*',
        'kms:Update*',
        'kms:Revoke*',
        'kms:Disable*',
        'kms:Get*',
        'kms:Delete*',
        'kms:TagResource',
        'kms:UntagResource',
        'kms:ScheduleKeyDeletion',
        'kms:CancelKeyDeletion',
        'kms:RotateKeyOnDemand',
      ],
      Resource: '*',
    }
    const readBack = {
      Sid: 'ReadBack',
      Effect: 'Allow',
      Principal: { AWS: ROOT },
      Action: [
        'kms:DescribeKey',
        'kms:GetKeyPolicy',
        'kms:GetKeyRotationStatus',
        'kms:ListResourceTags',
        'kms:ListGrants',
      ],
      Resource: '*',
      Condition: {
        ArnLike: {
          'aws:PrincipalArn': [
            arn(
              'iam',
              '',
              logArchive,
              'role/aws-service-role/access-analyzer.amazonaws.com/AWSServiceRoleForAccessAnalyzer',
            ),
            REVIEWER,
            arn('iam', '', logArchive, 'role/hearth-break-glass'),
          ],
        },
      },
    }
    const entries = [bucketArn(BUCKET.breakGlass), `${bucketArn(BUCKET.breakGlass)}/*`]
    const policyOf = (alias: string) =>
      resourcesIn(template).find(([id]) => id === keyOf(template, alias))?.[1].Properties?.KeyPolicy
    expect(policyOf('alias/hearth-sec')).toEqual({
      Version: '2012-10-17',
      Statement: [
        administration,
        {
          Sid: 'CloudTrailEncrypt',
          Effect: 'Allow',
          Principal: { Service: 'cloudtrail.amazonaws.com' },
          Action: 'kms:GenerateDataKey*',
          Resource: '*',
          Condition: {
            StringEquals: { 'aws:SourceArn': ORG_TRAIL },
            StringLike: { 'kms:EncryptionContext:aws:cloudtrail:arn': ANY_TRAIL },
          },
        },
        {
          Sid: 'CloudTrailDescribe',
          Effect: 'Allow',
          Principal: { Service: 'cloudtrail.amazonaws.com' },
          Action: 'kms:DescribeKey',
          Resource: '*',
          Condition: { StringEquals: { 'aws:SourceArn': ORG_TRAIL } },
        },
        {
          Sid: 'BreakGlassLogWriters',
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
          Resource: '*',
          Condition: {
            StringEquals: { 'aws:PrincipalOrgID': fixture.organization.id, 'kms:ViaService': S3_VIA },
            ArnLike: { 'aws:PrincipalArn': arn('iam', '', '*', 'role/hearth-break-glass') },
            StringLike: { 'kms:EncryptionContext:aws:s3:arn': entries },
          },
        },
        {
          Sid: 'ReviewerDecryptTrail',
          Effect: 'Allow',
          Principal: { AWS: ROOT },
          Action: 'kms:Decrypt',
          Resource: '*',
          Condition: {
            ArnLike: { 'aws:PrincipalArn': REVIEWER },
            StringEquals: { 'kms:ViaService': S3_VIA },
            StringLike: { 'kms:EncryptionContext:aws:cloudtrail:arn': ANY_TRAIL },
          },
        },
        {
          Sid: 'ReviewerDecryptEntries',
          Effect: 'Allow',
          Principal: { AWS: ROOT },
          Action: 'kms:Decrypt',
          Resource: '*',
          Condition: {
            ArnLike: { 'aws:PrincipalArn': REVIEWER },
            StringEquals: { 'kms:ViaService': S3_VIA },
            StringLike: { 'kms:EncryptionContext:aws:s3:arn': entries },
          },
        },
        readBack,
      ],
    })
    expect(policyOf('alias/hearth-archive')).toEqual({ Version: '2012-10-17', Statement: [administration, readBack] })
  })
})

// --- IAC-23: the archive ----------------------------------------------------------------------------

interface StackTemplate {
  name: string
  account: string
  template: Template
}

// Whether a statement is hearth-boundary's AllowAll, which bounds roles rather than granting anything.
const isBoundaryAllowAll = (t: Template, s: PolicyStatementAt) =>
  s.type === 'AWS::IAM::ManagedPolicy' &&
  resourcesIn(t).find(([id]) => id === s.logicalId)?.[1].Properties?.ManagedPolicyName === 'hearth-boundary' &&
  s.sid === 'AllowAll'
// Every Allow in the templates, with what its resources render to: one that can't be rendered, and an
// Allow with NotResource, could be anything, so counts as `*`.
function allowsIn(stacks: readonly StackTemplate[]) {
  return stacks.flatMap(({ name, account, template: t }) =>
    policyStatements(t)
      .filter(s => s.effect === 'Allow' && !isBoundaryAllowAll(t, s))
      .map(s => ({
        at: `${name} ${s.logicalId} ${s.sid ?? '(no Sid)'}`,
        s,
        resources:
          s.notResources.length > 0
            ? ['*']
            : s.resources.map(value => renderedString(value, { account, region: REGION, template: t }) ?? '*'),
      })),
  )
}

// IAC-23 (C11-D21): each Allow that could read the archive bucket or its configuration: an action that
// can read (s3:Get*, s3:List*, or NotAction) on a resource that could be the bucket or its objects.
function archiveReaders(stacks: readonly StackTemplate[]): string[] {
  const archive = [arn('s3', '', '', 'hearth-archive-*'), arn('s3', '', '', 'hearth-archive-*/*')]
  return allowsIn(stacks)
    .filter(({ s }) => s.notActions.length > 0 || overlapsAny(s.actions, ['s3:get*', 's3:list*']))
    .filter(({ resources }) => resources.some(resource => archive.some(pattern => globsOverlap(resource, pattern))))
    .map(({ at, resources }) => `${at}: could read the archive (${resources.join(', ')})`)
}

// Whether a condition holds the encryption context of the trail's files or the break-glass entries
// alone, required (never IfExists): CloudTrail's names management's trails, S3's the trail or
// break-glass-log bucket and their objects.
function namesOnlyTheLogs(condition: unknown): boolean {
  const logBuckets = [BUCKET.trail, BUCKET.breakGlass].flatMap(name => [bucketArn(name), `${bucketArn(name)}/*`])
  const contexts = Object.entries((condition ?? {}) as Record<string, Record<string, string | string[]>>).flatMap(
    ([operator, keys]) =>
      Object.entries(keys)
        .filter(([key]) => key.startsWith('kms:EncryptionContext'))
        .map(([key, value]) => ({ operator, key, values: Array.isArray(value) ? value : [value] })),
  )
  return (
    contexts.length > 0 &&
    contexts.every(({ operator, key, values }) => {
      if (operator !== 'StringEquals' && operator !== 'StringLike') return false
      if (key === 'kms:EncryptionContext:aws:s3:arn') return values.every(value => logBuckets.includes(value))
      if (key === 'kms:EncryptionContext:aws:cloudtrail:arn') {
        return values.every(value => {
          const [prefix, partition, service, , account, resource = ''] = value.split(':')
          return (
            prefix === 'arn' &&
            partition === 'aws' &&
            service === 'cloudtrail' &&
            account === management &&
            resource.startsWith('trail/')
          )
        })
      }
      return false
    })
  )
}

// Whether a condition makes S3 the only service the key is used through, required (never IfExists):
// the other bound on a grant over log-archive's keys by pattern (C11-D17).
function throughS3Only(condition: unknown): boolean {
  const via = (condition as Record<string, Record<string, unknown>> | undefined)?.StringEquals?.['kms:ViaService']
  return via === S3_VIA || (Array.isArray(via) && via.length === 1 && via[0] === S3_VIA)
}

// Both bounds: through S3, under the trail's or the break-glass entries' context alone.
const boundedToTheLogs = (condition: unknown) => throughS3Only(condition) && namesOnlyTheLogs(condition)

const DECRYPTS = ['kms:decrypt', 'kms:reencrypt*', 'kms:generatedatakey*']

// IAC-23 (C11-D21): each grant that could use the archive key: in the archive key's own policy, any
// that decrypts or makes a data key; anywhere else, one on a resource that could be a key in
// log-archive (`key/*`, or a reference no static reading renders) not bounded to S3 and the logs'
// context.
function archiveKeyUsers(stacks: readonly StackTemplate[]): string[] {
  const keys = arn('kms', REGION, logArchive, 'key/*')
  const archiveKeys = new Set(
    stacks.flatMap(({ template: t }) =>
      ofType(t, 'AWS::KMS::Alias')
        .filter(([, alias]) => alias.Properties?.AliasName === 'alias/hearth-archive')
        .map(
          ([, alias]) =>
            (alias.Properties?.TargetKeyId as { 'Fn::GetAtt'?: string[] } | undefined)?.['Fn::GetAtt']?.[0],
        ),
    ),
  )
  return allowsIn(stacks)
    .filter(({ s }) => s.notActions.length > 0 || overlapsAny(s.actions, DECRYPTS))
    .flatMap(({ at, s, resources }) => {
      if (s.type === 'AWS::KMS::Key') return archiveKeys.has(s.logicalId) ? [`${at}: uses the archive key`] : []
      const couldBeTheKey = resources.some(resource => globsOverlap(resource, keys))
      return couldBeTheKey && !boundedToTheLogs(s.condition) ? [`${at}: could use the archive key`] : []
    })
}

// A copy of LogArchive with statements added to its break-glass role and to the archive key's policy.
function planted(roleStatements: unknown[], archiveKeyStatements: unknown[] = []): StackTemplate[] {
  const copy = structuredClone(template)
  const resources = copy.Resources as Record<string, Resource>
  const role = one(copy, 'AWS::IAM::Role', 'RoleName', 'hearth-break-glass')[0]
  const policies = resources[role]?.Properties?.Policies as Array<{ PolicyDocument: { Statement: unknown[] } }>
  policies[0]?.PolicyDocument.Statement.push(...roleStatements)
  const key = (resources[keyOf(copy, 'alias/hearth-archive')]?.Properties?.KeyPolicy ?? {}) as { Statement: unknown[] }
  key.Statement.push(...archiveKeyStatements)
  return [{ name: 'Hearth-LogArchive', account: logArchive, template: copy }]
}

describe('IAC-23 C11-D21: nobody reads the archive or uses its key', () => {
  it('IAC-23 finds a read of the archive bucket’s configuration, a read by NotAction, a decrypt on log-archive’s keys with no context, only an IfExists one or no kms:ViaService, and a decrypt in the archive key’s policy, planted in a copy of LogArchive', () => {
    const role = one(template, 'AWS::IAM::Role', 'RoleName', 'hearth-break-glass')[0]
    expect(
      archiveReaders(
        planted([
          { Sid: 'Planted', Effect: 'Allow', Action: 's3:GetBucketPolicy', Resource: bucketArn(BUCKET.archive) },
          { Sid: 'Wide', Effect: 'Allow', NotAction: 'iam:*', Resource: '*' },
        ]),
      ),
    ).toEqual([
      `Hearth-LogArchive ${role} Planted: could read the archive (${bucketArn(BUCKET.archive)})`,
      `Hearth-LogArchive ${role} Wide: could read the archive (*)`,
    ])
    const keys = arn('kms', REGION, logArchive, 'key/*')
    expect(
      archiveKeyUsers(
        planted(
          [
            { Sid: 'Bare', Effect: 'Allow', Action: 'kms:Decrypt', Resource: keys },
            {
              Sid: 'IfExists',
              Effect: 'Allow',
              Action: 'kms:Decrypt',
              Resource: keys,
              Condition: { StringLikeIfExists: { 'kms:EncryptionContext:aws:s3:arn': bucketArn(BUCKET.breakGlass) } },
            },
            {
              Sid: 'Archive',
              Effect: 'Allow',
              Action: 'kms:Decrypt',
              Resource: keys,
              Condition: { StringLike: { 'kms:EncryptionContext:aws:s3:arn': bucketArn(BUCKET.archive) } },
            },
            {
              Sid: 'NoVia',
              Effect: 'Allow',
              Action: 'kms:Decrypt',
              Resource: keys,
              Condition: { StringEquals: { 'kms:EncryptionContext:aws:s3:arn': bucketArn(BUCKET.breakGlass) } },
            },
          ],
          [{ Sid: 'Planted', Effect: 'Allow', Principal: { AWS: ROOT }, Action: 'kms:Decrypt', Resource: '*' }],
        ),
      ),
    ).toEqual([
      `Hearth-LogArchive ${keyOf(template, 'alias/hearth-archive')} Planted: uses the archive key`,
      `Hearth-LogArchive ${role} Bare: could use the archive key`,
      `Hearth-LogArchive ${role} IfExists: could use the archive key`,
      `Hearth-LogArchive ${role} Archive: could use the archive key`,
      `Hearth-LogArchive ${role} NoVia: could use the archive key`,
    ])
  })

  it('IAC-23: no Allow in any landing-zone template could read the archive bucket, its objects or its configuration', () => {
    expect(archiveReaders(STACKS())).toEqual([])
  })

  it('IAC-23: no grant in any landing-zone template could use the archive key, and every grant on log-archive’s keys by pattern is bounded to the logs’ encryption context', () => {
    expect(archiveKeyUsers(STACKS())).toEqual([])
    // The grants that check reads: it isn't vacuous.
    const keys = arn('kms', REGION, logArchive, 'key/*')
    const bounded = allowsIn(STACKS())
      .filter(({ s }) => s.type !== 'AWS::KMS::Key' && overlapsAny(s.actions, DECRYPTS))
      .filter(({ resources }) => resources.some(resource => globsOverlap(resource, keys)))
      .map(
        ({ at, s }) =>
          `${at.split(' ')[0]} ${at.split(' ')[2]}: ${boundedToTheLogs(s.condition) ? 'bounded' : 'NOT bounded'}`,
      )
    expect(bounded).toEqual([
      'Hearth-Foundation DecryptTrail: bounded',
      'Hearth-Foundation DecryptEntries: bounded',
      'Hearth-LogArchive OwnEntriesKey: bounded',
      'Hearth-nonprod-Baseline LogKey: bounded',
      'Hearth-prod-Baseline LogKey: bounded',
    ])
  })

  it('IAC-23 C11-D17: hearth-sec’s policy and the reviewer’s set decrypt only through S3, under the trail’s or the break-glass entries’ context', () => {
    const decrypts = allowsIn(STACKS()).filter(
      ({ s }) =>
        overlapsAny(s.actions, ['kms:decrypt']) &&
        (s.type === 'AWS::KMS::Key' ||
          resourcesIn(lz.templates.foundation).find(([id]) => id === s.logicalId)?.[1].Properties?.Name ===
            'HearthSecurityReview'),
    )
    expect(decrypts.map(({ at }) => at.split(' ')[2])).toEqual([
      'DecryptTrail',
      'DecryptEntries',
      'BreakGlassLogWriters',
      'ReviewerDecryptTrail',
      'ReviewerDecryptEntries',
    ])
    for (const { at, s } of decrypts) {
      const condition = s.condition as Record<string, Record<string, unknown>>
      expect(condition.StringEquals?.['kms:ViaService'], at).toBe(S3_VIA)
      expect(namesOnlyTheLogs(s.condition), at).toBe(true)
    }
  })

  it('IAC-23 C11-D21: the archive bucket’s own policy allows nothing', () => {
    const [bucketId] = bucketOf(template, BUCKET.archive)
    const policy = ofType(template, 'AWS::S3::BucketPolicy').find(
      ([, p]) => (p.Properties?.Bucket as { Ref?: string } | undefined)?.Ref === bucketId,
    )
    const statements = policyStatements(template).filter(s => s.logicalId === policy?.[0])
    expect(statements.length).toBeGreaterThan(0)
    expect(statements.filter(s => s.effect === 'Allow')).toEqual([])
  })
})

// --- IAC-11: log-archive's break-glass role ----------------------------------------------------------

// The break-glass trust (C11-D11): the entry set's role in this account alone, the person's sign-in
// name as the source identity, the one reason tag in a reason's shape, and ap-southeast-1.
const trust = (account: string) => ({
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'EntrySetOnly',
      Effect: 'Allow',
      Principal: { AWS: arn('iam', '', account, 'root') },
      Action: ['sts:AssumeRole', 'sts:SetSourceIdentity', 'sts:TagSession'],
      Condition: {
        ArnLike: {
          'aws:PrincipalArn': arn(
            'iam',
            '',
            account,
            'role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_HearthBreakGlassEntry_*',
          ),
        },
        StringEquals: { 'sts:SourceIdentity': variable('aws:PrincipalTag/hearth-user'), 'aws:RequestedRegion': REGION },
        'ForAllValues:StringEquals': { 'aws:TagKeys': ['hearth-reason'] },
        Null: { 'aws:RequestTag/hearth-reason': 'false', 'sts:SourceIdentity': 'false' },
        StringLike: { 'aws:RequestTag/hearth-reason': [...REASON_SHAPES] },
      },
    },
  ],
})

// The denies both kinds of break-glass role carry, as lists written out here.
const NO_IAM_WRITES = [
  'iam:Create*',
  'iam:Delete*',
  'iam:Put*',
  'iam:Attach*',
  'iam:Detach*',
  'iam:Update*',
  'iam:Add*',
  'iam:Remove*',
  'iam:Set*',
  'iam:Tag*',
  'iam:Untag*',
  'iam:Upload*',
  'iam:Change*',
  'iam:Enable*',
  'iam:Deactivate*',
  'iam:Resync*',
]
const KEY_ADMINISTRATION = [
  'kms:Create*',
  'kms:Put*',
  'kms:Update*',
  'kms:Enable*',
  'kms:Disable*',
  'kms:ScheduleKeyDeletion',
  'kms:CancelKeyDeletion',
  'kms:Delete*',
  'kms:Revoke*',
  'kms:RetireGrant',
  'kms:Import*',
  'kms:TagResource',
  'kms:UntagResource',
  'kms:CreateGrant',
]
const LOG_TAMPERING = [
  's3:Delete*',
  's3:PutBucket*',
  's3:PutLifecycle*',
  's3:PutObjectRe*',
  's3:PutObjectLe*',
  's3:BypassGovernance*',
]
const STACK_WRITES = [
  'cloudformation:Create*',
  'cloudformation:Update*',
  'cloudformation:Delete*',
  'cloudformation:Execute*',
  'cloudformation:Continue*',
  'cloudformation:Rollback*',
  'cloudformation:Set*',
  'cloudformation:Import*',
  'cloudformation:Tag*',
  'cloudformation:Untag*',
  'cloudformation:Activate*',
  'cloudformation:Deactivate*',
  'cloudformation:Register*',
  'cloudformation:Deregister*',
  'cloudformation:Publish*',
]

describe('IAC-11 C11-D12: log-archive’s hearth-break-glass', () => {
  it('IAC-11 C11-D11: its trust admits the entry set’s role in log-archive alone, with the person’s sign-in name, one reason tag of a reason’s shape, in ap-southeast-1, for an hour', () => {
    const [, role] = one(template, 'AWS::IAM::Role', 'RoleName', 'hearth-break-glass')
    expect(role.Properties?.AssumeRolePolicyDocument).toEqual(trust(logArchive))
    expect(role.Properties?.MaxSessionDuration).toBe(3600)
    expect(role.Properties?.ManagedPolicyArns).toBeUndefined()
    expect(role.Properties?.PermissionsBoundary).toBeUndefined()
  })

  it('IAC-11 C11-D12 C11-D21: its one inline policy writes its own entries and triages, and denies every change, the landing zone, the Rule 9 secrets and every model action', () => {
    const [, role] = one(template, 'AWS::IAM::Role', 'RoleName', 'hearth-break-glass')
    const entries = bucketArn(BUCKET.breakGlass)
    expect(role.Properties?.Policies).toEqual([
      {
        PolicyName: 'hearth-break-glass',
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'OwnEntries',
              Effect: 'Allow',
              Action: ['s3:PutObject', 's3:GetObject'],
              Resource: `${entries}/break-glass/${logArchive}/*`,
            },
            {
              Sid: 'ListOwnEntries',
              Effect: 'Allow',
              Action: 's3:ListBucket',
              Resource: entries,
              Condition: { StringLike: { 's3:prefix': `break-glass/${logArchive}/*` } },
            },
            {
              Sid: 'OwnEntriesKey',
              Effect: 'Allow',
              Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
              Resource: { 'Fn::GetAtt': [keyOf(template, 'alias/hearth-sec'), 'Arn'] },
              Condition: {
                StringEquals: { 'kms:ViaService': S3_VIA },
                StringLike: { 'kms:EncryptionContext:aws:s3:arn': [entries, `${entries}/*`] },
              },
            },
            {
              Sid: 'Params',
              Effect: 'Allow',
              Action: 'ssm:GetParameter',
              Resource: arn('ssm', REGION, logArchive, 'parameter/hearth/break-glass/*'),
            },
            {
              Sid: 'Triage',
              Effect: 'Allow',
              Action: [
                'guardduty:Get*',
                'guardduty:List*',
                'access-analyzer:Get*',
                'access-analyzer:List*',
                'cloudtrail:LookupEvents',
                'cloudtrail:DescribeTrails',
                'cloudtrail:GetTrailStatus',
              ],
              Resource: '*',
            },
            {
              Sid: 'TriageBuckets',
              Effect: 'Allow',
              Action: ['s3:GetBucket*', 's3:GetLifecycleConfiguration', 's3:GetEncryptionConfiguration'],
              Resource: [bucketArn(BUCKET.trail), entries],
            },
            {
              Sid: 'TriageKeys',
              Effect: 'Allow',
              Action: ['kms:DescribeKey', 'kms:GetKeyPolicy', 'kms:GetKeyRotationStatus'],
              Resource: arn('kms', REGION, logArchive, 'key/*'),
            },
            { Sid: 'NoIamWrites', Effect: 'Deny', Action: NO_IAM_WRITES, Resource: '*' },
            { Sid: 'NoPassRole', Effect: 'Deny', Action: 'iam:PassRole', Resource: '*' },
            { Sid: 'NoKeyAdministration', Effect: 'Deny', Action: KEY_ADMINISTRATION, Resource: '*' },
            { Sid: 'NoLogTampering', Effect: 'Deny', Action: LOG_TAMPERING, Resource: '*' },
            { Sid: 'NoOrganizations', Effect: 'Deny', Action: 'organizations:*', Resource: '*' },
            {
              Sid: 'NoAuditWrites',
              Effect: 'Deny',
              Action: [
                ...[
                  'Create*',
                  'Update*',
                  'Delete*',
                  'Disassociate*',
                  'Disable*',
                  'Stop*',
                  'Archive*',
                  'Unarchive*',
                ].map(verb => `guardduty:${verb}`),
                ...['Accept*', 'Decline*', 'Invite*', 'Enable*', 'Start*'].map(verb => `guardduty:${verb}`),
                ...['Create*', 'Update*', 'Delete*', 'Apply*', 'Start*', 'Cancel*'].map(
                  verb => `access-analyzer:${verb}`,
                ),
                ...['Create*', 'Update*', 'Delete*', 'Put*', 'Stop*', 'Start*', 'Add*', 'Remove*'].map(
                  verb => `cloudtrail:${verb}`,
                ),
              ],
              Resource: '*',
            },
            { Sid: 'NoSecretWrites', Effect: 'Deny', Action: 'secretsmanager:PutSecretValue', Resource: '*' },
            { Sid: 'NoDirectStackChanges', Effect: 'Deny', Action: STACK_WRITES, Resource: '*' },
            {
              Sid: 'NoLandingZone',
              Effect: 'Deny',
              Action: 'sts:AssumeRole',
              Resource: arn('iam', '', '*', 'role/cdk-hearthbase-*'),
            },
            {
              Sid: 'NoRule9SecretByName',
              Effect: 'Deny',
              Action: 'secretsmanager:GetSecretValue',
              Resource: arn('secretsmanager', '*', '*', 'secret:hearth/*/rule9*'),
            },
            {
              Sid: 'NoRule9SecretByTag',
              Effect: 'Deny',
              Action: 'secretsmanager:GetSecretValue',
              Resource: '*',
              Condition: { StringEquals: { 'secretsmanager:ResourceTag/hearth:access': 'rule9' } },
            },
            { Sid: 'NoModels', Effect: 'Deny', Action: modelDenyActions(), Resource: '*' },
          ],
        },
      },
    ])
  })

  it('IAC-11 C11-D12: it assumes no landing-zone role, runs no bastion, connects to no database, reads no secret and no trail object, and reads only the two log buckets’ configuration', () => {
    const role = one(template, 'AWS::IAM::Role', 'RoleName', 'hearth-break-glass')[0]
    // The role's construct path, and so its logical id, is the same in every stack: read LogArchive's alone.
    const logArchiveOnly = STACKS().filter(stack => stack.name === 'Hearth-LogArchive')
    const allows = allowsIn(logArchiveOnly).filter(
      ({ s }) => s.logicalId === role && s.where !== 'AssumeRolePolicyDocument',
    )
    const granting = (patterns: string[]) =>
      allows.filter(({ s }) => overlapsAny(s.actions, patterns)).map(({ s }) => s.sid)
    expect(granting(['sts:assumerole'])).toEqual([])
    expect(granting(['ecs:runtask', 'ecs:executecommand', 'ssm:startsession', 'iam:passrole'])).toEqual([])
    expect(granting(['rds-db:connect'])).toEqual([])
    expect(granting(['secretsmanager:getsecretvalue'])).toEqual([])
    const trailObjects = `${bucketArn(BUCKET.trail)}/AWSLogs/x`
    expect(
      allows
        .filter(({ s }) => overlapsAny(s.actions, ['s3:getobject']))
        .filter(({ resources }) => resources.some(resource => globsOverlap(resource, trailObjects)))
        .map(({ s }) => s.sid),
    ).toEqual([])
    expect(
      allows.filter(({ s }) => overlapsAny(s.actions, ['s3:getbucket*'])).map(({ s, resources }) => [s.sid, resources]),
    ).toEqual([['TriageBuckets', [bucketArn(BUCKET.trail), bucketArn(BUCKET.breakGlass)]]])
  })
})

// --- Fast alarms, the analyzer and the findings alarms -----------------------------------------------

const CLOUDTRAIL = 'AWS API Call via CloudTrail'
const ASSUME_INPUT = {
  account: '$.account',
  'detail-eventName': '$.detail.eventName',
  'detail-requestParameters-sourceIdentity': '$.detail.requestParameters.sourceIdentity',
  'detail-requestParameters-tags-0--value': '$.detail.requestParameters.tags[0].value',
  'detail-errorCode': '$.detail.errorCode',
}

describe('C11-D16 C11-D20: log-archive’s alarms', () => {
  // Each rule's name, pattern, state and what its input reads.
  const rules = () =>
    ofType(template, 'AWS::Events::Rule').map(([, r]) => {
      const targets = r.Properties?.Targets as Array<{
        Arn: unknown
        Id: string
        InputTransformer: { InputPathsMap: unknown }
      }>
      return {
        name: r.Properties?.Name,
        pattern: r.Properties?.EventPattern,
        state: r.Properties?.State,
        targets: targets.map(target => target.Arn),
        input: targets[0]?.InputTransformer.InputPathsMap,
        dependsOn: r.DependsOn,
      }
    })

  it('C11-D16 C11-D20: four rules email log-archive’s topic once its policy admits them: A1 and A15 on CloudTrail’s management events, A9 and A10 on the services’ own findings, each input carrying ids alone', () => {
    const topic = one(template, 'AWS::SNS::Topic', 'TopicName', 'hearth-ops-alerts')[0]
    const policy = ofType(template, 'AWS::SNS::TopicPolicy')[0]?.[0]
    const assume = (roleArn: unknown) => ({
      source: ['aws.sts'],
      'detail-type': [CLOUDTRAIL],
      detail: { eventSource: ['sts.amazonaws.com'], eventName: ['AssumeRole'], requestParameters: { roleArn } },
    })
    const rule = (name: string, pattern: unknown, state: string, input: unknown) => ({
      name,
      pattern,
      state,
      targets: [{ Ref: topic }],
      input,
      dependsOn: [policy],
    })
    expect(rules()).toEqual([
      rule(
        'hearth-sec-a09-guardduty',
        {
          source: ['aws.guardduty'],
          'detail-type': ['GuardDuty Finding'],
          detail: { severity: [{ numeric: ['>=', 4] }] },
        },
        'ENABLED',
        {
          'detail-accountId': '$.detail.accountId',
          'detail-severity': '$.detail.severity',
          'detail-type': '$.detail.type',
          'detail-id': '$.detail.id',
        },
      ),
      rule(
        'hearth-sec-a10-access-analyzer',
        { source: ['aws.access-analyzer'], 'detail-type': ['Access Analyzer Finding'], detail: { status: ['ACTIVE'] } },
        'ENABLED',
        {
          'detail-accountId': '$.detail.accountId',
          'detail-resourceType': '$.detail.resourceType',
          'detail-id': '$.detail.id',
        },
      ),
      rule(
        'hearth-sec-a01-break-glass',
        assume([{ suffix: ':role/hearth-break-glass' }]),
        'ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS',
        ASSUME_INPUT,
      ),
      rule(
        'hearth-sec-a15-hearthbase',
        assume([{ wildcard: '*:role/cdk-hearthbase-*' }]),
        'ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS',
        ASSUME_INPUT,
      ),
    ])
  })

  it('C11-D16: log-archive’s topic admits its own hearth-sec- rules alone, over TLS, and emails the ops mailbox', () => {
    const topic = one(template, 'AWS::SNS::Topic', 'TopicName', 'hearth-ops-alerts')[0]
    expect(ofType(template, 'AWS::SNS::TopicPolicy').map(([, r]) => r.Properties)).toEqual([
      {
        Topics: [{ Ref: topic }],
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'AllowPublishThroughSSLOnly',
              Effect: 'Deny',
              Principal: '*',
              Action: 'sns:Publish',
              Resource: { Ref: topic },
              Condition: { Bool: { 'aws:SecureTransport': 'false' } },
            },
            {
              Sid: 'FastAlarms',
              Effect: 'Allow',
              Principal: { Service: 'events.amazonaws.com' },
              Action: 'sns:Publish',
              Resource: { Ref: topic },
              Condition: {
                StringEquals: { 'aws:SourceAccount': logArchive },
                ArnLike: { 'aws:SourceArn': arn('events', REGION, logArchive, 'rule/hearth-sec-*') },
              },
            },
          ],
        },
      },
    ])
    expect(ofType(template, 'AWS::SNS::Subscription').map(([, r]) => r.Properties)).toEqual([
      { Protocol: 'email', Endpoint: fixture.alertEmail, TopicArn: { Ref: topic } },
    ])
  })

  it('C11-D20: one organisation analyzer of external access, with no archive rule, retained, beside the alarms and the role by their construct ids', () => {
    const analyzers = ofType(template, 'AWS::AccessAnalyzer::Analyzer')
    expect(analyzers.map(([, r]) => r.Properties)).toEqual([
      { AnalyzerName: 'hearth-org-external', Type: 'ORGANIZATION' },
    ])
    expect(analyzers[0]?.[1].DeletionPolicy).toBe('Retain')
    const childrenOf = (id: string) =>
      lz.stacks.logArchive?.node.tryFindChild(id)?.node.children.map(child => child.node.id)
    expect(childrenOf('SecurityServices')).toEqual(['Analyzer', 'A9GuardDuty', 'A10AccessAnalyzer'])
    expect(childrenOf('FastAlarms')).toEqual(['A1BreakGlass', 'A15Hearthbase'])
    expect(childrenOf('OpsAlerts')).toEqual(['Topic'])
    expect(childrenOf('BreakGlass')).toEqual(['Role'])
  })

  it('C11-D13: the break-glass-log bucket’s name sits in its SSM parameter, for the helper to read', () => {
    expect(ofType(template, 'AWS::SSM::Parameter').map(([, r]) => r.Properties)).toEqual([
      {
        Name: '/hearth/break-glass/log-bucket',
        Type: 'String',
        Value: BUCKET.breakGlass,
        Description: 'The bucket break-glass entries are written to (C11-D13)',
      },
    ])
  })
})
