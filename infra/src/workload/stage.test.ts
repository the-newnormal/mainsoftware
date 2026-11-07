// The workload's composition and its data (C11-D24, C11-D27, C11-D35, C11-D45, C11-D51, C11-D59,
// C11-D62; TECH-SPEC T24 items 12 to 14 and 25):
// - the run: resolveWorkloadRun() over every key's accepted and refused values, each refusal naming the
//   key and never the value given, and CI's fake release, built here the same way;
// - IAC-17: the drill builds non-prod's four stacks alone, each template equal to the committed one but
//   for realtime's LOG_LEVEL;
// - IAC-19's profile half: a stage holds real data only in an account whose own profile does, prod's
//   load balancer is protected from deletion and restore has none, no stage sends texts in C0.11, and a
//   profile asking for C0.12's CloudFront ingress is refused;
// - IAC-20's exact half: the restore stage's CIDRs apart from the other two, and what exists between
//   drills and while restoreActive is set (the isolation itself is aspects/templates.test.ts's);
// - C11-D35: non-prod's and prod's Valkey and every stage's AUTH_SECRET, exactly;
// - the wiring: every parameter a stack reads names one a stack it stands on writes, or a Baseline's,
//   by a type CloudFormation reads without checking it as the caller, under /hearth/, which the deploy
//   role may read; and the stacks' dependencies are exactly C11-D27's graph.
// Expected values are literals, or joined from their parts here (IG-01). Each checker is proved on a
// planted copy first.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { stagesIn } from '../config/names.ts'
import { ENVIRONMENTS, type EnvironmentName, PROFILES, type Profile } from '../config/profiles.ts'
import { synthWorkload, type WorkloadSynth } from '../testing/workload.ts'
import { fakeRelease, resolveWorkloadRun, WorkloadRunError } from './stage.ts'

type Template = Record<string, unknown>
interface Resource {
  Type: string
  Properties?: Record<string, unknown>
  DeletionPolicy?: string
  UpdateReplacePolicy?: string
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const resourcesIn = (template: Template): Array<[string, Resource]> =>
  Object.entries(isObject(template.Resources) ? (template.Resources as Record<string, Resource>) : {})
const ofType = (template: Template, type: string) => resourcesIn(template).filter(([, r]) => r.Type === type)
const propertiesOf = (resource: Resource | undefined): Record<string, unknown> => resource?.Properties ?? {}
const refOf = (value: unknown): string | undefined =>
  isObject(value) && typeof value.Ref === 'string' ? value.Ref : undefined
const parametersOf = (template: Template) =>
  (isObject(template.Parameters) ? template.Parameters : {}) as Record<string, { Type: string; Default?: string }>
// An SSM parameter's name under /hearth/, joined from its parts.
const hearth = (...parts: string[]) => ['', 'hearth', ...parts].join('/')
// A reference to an SSM parameter the template reads, as `{ssm:<name>}`; anything else as written.
function ssmOf(value: unknown, template: Template): unknown {
  const ref = refOf(value)
  const parameter = ref === undefined ? undefined : parametersOf(template)[ref]
  if (parameter?.Default !== undefined) return `{ssm:${parameter.Default}}`
  if (Array.isArray(value)) return value.map(item => ssmOf(item, template))
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ssmOf(v, template)]))
  return value
}

const PARTS = ['Platform', 'Data', 'Tasks', 'Services'] as const
type Part = (typeof PARTS)[number]

let committed: WorkloadSynth
let active: WorkloadSynth
const templateOf = (synth: WorkloadSynth, env: EnvironmentName, part: Part): Template => {
  const template = synth.templates[`Hearth-${env}-${part}`]
  if (template === undefined) throw new Error(`no Hearth-${env}-${part}`)
  return template
}

beforeAll(() => {
  committed = synthWorkload()
  active = synthWorkload({ run: { restoreActive: true } })
}, 60_000)

// --- The run (C11-D51, C11-D62) ------------------------------------------------------------------

// A release as the pipeline passes it, and CI's fake one, each built here.
const COMMIT = 'a'.repeat(40)
const DIGEST = `sha256:${'b'.repeat(64)}`
const RELEASE = `${COMMIT}:${DIGEST}`
const MARKER = { HEARTH_FAKE_RELEASE: '1' }

// The refusal a run gets, or undefined when it is accepted; any other error throws.
function refusal(
  context: Parameters<typeof resolveWorkloadRun>[0],
  environ: Record<string, string>,
): string | undefined {
  try {
    resolveWorkloadRun(context, environ)
    return undefined
  } catch (error) {
    if (!(error instanceof WorkloadRunError)) throw error
    return error.message
  }
}

describe('C11-D51 C11-D62: the run', () => {
  it('C11-D62: the fake release is a commit of 40 f and a digest of 64 zeros', () => {
    expect(fakeRelease()).toEqual({ commit: 'f'.repeat(40), digest: `sha256:${'0'.repeat(64)}` })
  })

  it('C11-D62 C11-D45 C11-D59: CI’s marker alone takes the fake release, and restoreActive and the drill each take their one accepted value', () => {
    const fake = fakeRelease()
    expect(resolveWorkloadRun({}, MARKER)).toEqual({ release: fake, restoreActive: false, drill: false })
    expect(resolveWorkloadRun({ restoreActive: true }, MARKER)).toEqual({
      release: fake,
      restoreActive: true,
      drill: false,
    })
    expect(resolveWorkloadRun({ restoreActive: 'true' }, MARKER).restoreActive).toBe(true)
    expect(resolveWorkloadRun({ drill: 'break:nonprod' }, MARKER)).toEqual({
      release: fake,
      restoreActive: false,
      drill: true,
    })
  })

  it('C11-D51 C11-Q08: a well-formed release is refused while DOMAINS holds a placeholder, and taken once it holds the owner’s names', async () => {
    expect(refusal({ release: RELEASE }, {})).toBe(
      "DOMAINS still holds a placeholder: a real release waits for the owner's names (C11-Q08)",
    )
    // The same function, loaded with the domains a reviewed PR would commit (RFC 2606's reserved .test,
    // which no placeholder check reads as .invalid).
    vi.resetModules()
    vi.doMock('../config/profiles.ts', async original => ({
      ...(await original<typeof import('../config/profiles.ts')>()),
      DOMAINS: { app: 'hearth-app.test', userContent: 'hearth-content.test' },
    }))
    try {
      const stage = await import('./stage.ts')
      expect(stage.resolveWorkloadRun({ release: RELEASE }, {})).toEqual({
        release: { commit: COMMIT, digest: DIGEST },
        restoreActive: false,
        drill: false,
      })
      expect(() => stage.resolveWorkloadRun({ release: RELEASE }, MARKER)).toThrow(
        'HEARTH_FAKE_RELEASE is set beside release',
      )
    } finally {
      vi.doUnmock('../config/profiles.ts')
      vi.resetModules()
    }
  }, 60_000)

  it('C11-D51 C11-D62 IAC-17: every other run is refused by naming its key and what it must be, never the value given', () => {
    const cases: Array<[Parameters<typeof resolveWorkloadRun>[0], Record<string, string>, string, unknown]> = [
      [{}, {}, 'release is missing: pass -c release=<commit>:<digest>', undefined],
      [{ release: 'abc123' }, {}, 'release is malformed', 'abc123'],
      [{ release: `${'A'.repeat(40)}:${DIGEST}` }, {}, 'release is malformed', 'A'.repeat(40)],
      [{ release: `${COMMIT}:${'b'.repeat(64)}` }, {}, 'release is malformed', COMMIT],
      [{ release: `${COMMIT}:sha256:${'b'.repeat(63)}` }, {}, 'release is malformed', COMMIT],
      [{ release: 12_345 }, {}, 'release is malformed', '12345'],
      [{ release: RELEASE }, MARKER, 'HEARTH_FAKE_RELEASE is set beside release', COMMIT],
      [{}, { HEARTH_FAKE_RELEASE: '2' }, 'HEARTH_FAKE_RELEASE is not 1', undefined],
      [{}, { HEARTH_FAKE_RELEASE: 'true' }, 'HEARTH_FAKE_RELEASE is not 1', undefined],
      [{}, { HEARTH_FAKE_RELEASE: '' }, 'HEARTH_FAKE_RELEASE is not 1', undefined],
      [{ restoreActive: 'yes' }, MARKER, 'restoreActive is not true', 'yes'],
      [{ restoreActive: false }, MARKER, 'restoreActive is not true', undefined],
      [{ restoreActive: 'True' }, MARKER, 'restoreActive is not true', 'True'],
      [{ restoreActive: 1 }, MARKER, 'restoreActive is not true', undefined],
      [{ drill: 'break:prod' }, MARKER, 'drill is not break:nonprod', 'break:prod'],
      [{ drill: 'break:restore' }, MARKER, 'drill is not break:nonprod', 'break:restore'],
      [{ drill: 'break:' }, MARKER, 'drill is not break:nonprod', undefined],
      [{ drill: 'nonprod' }, MARKER, 'drill is not break:nonprod', undefined],
      [{ drill: true }, MARKER, 'drill is not break:nonprod', undefined],
    ]
    for (const [context, environ, message, given] of cases) {
      const found = refusal(context, environ)
      expect(found, JSON.stringify(context)).toBe(message)
      if (typeof given === 'string') expect(found, JSON.stringify(context)).not.toContain(given)
    }
  })
})

// --- IAC-17: the drill ---------------------------------------------------------------------------

// Every path at which two JSON values differ, as `a.b[0].c`.
function differences(a: unknown, b: unknown, path = ''): string[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [`${path} (length)`]
    return a.flatMap((item, i) => differences(item, b[i], `${path}[${i}]`))
  }
  if (isObject(a) && isObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    return keys.flatMap(key => differences(a[key], b[key], path === '' ? key : `${path}.${key}`))
  }
  return isDeepStrictEqual(a, b) ? [] : [path]
}

describe('IAC-17 C11-D59: the drill', () => {
  it('IAC-17 finds a difference at its path, on planted values', () => {
    expect(differences({ a: [{ b: 1 }, { c: 'x' }] }, { a: [{ b: 1 }, { c: 'y' }] })).toEqual(['a[1].c'])
    expect(differences({ a: [1] }, { a: [1, 2] })).toEqual(['a (length)'])
    expect(differences({ a: 1 }, { b: 1 })).toEqual(['a', 'b'])
  })

  it('IAC-17: the drill builds non-prod’s four stacks alone, each template equal to the committed one but for realtime’s LOG_LEVEL, now `drill`', () => {
    const drill = synthWorkload({ run: { drill: true } })
    expect(drill.synthesised.stacks.map(stack => stack.stackName)).toEqual(PARTS.map(part => `Hearth-nonprod-${part}`))
    expect(Object.keys(drill.stages)).toEqual(['nonprod'])
    for (const part of PARTS) {
      const found = differences(templateOf(committed, 'nonprod', part), templateOf(drill, 'nonprod', part))
      if (part !== 'Services') {
        expect(found, part).toEqual([])
        continue
      }
      const services = templateOf(committed, 'nonprod', 'Services')
      const [realtime] = ofType(services, 'AWS::ECS::TaskDefinition').filter(
        ([, r]) => propertiesOf(r).Family === 'hearth-nonprod-realtime',
      )
      const environment = (
        propertiesOf(realtime?.[1]).ContainerDefinitions as Array<{ Environment: Array<{ Name: string }> }>
      )[0]?.Environment
      const level = environment?.findIndex(e => e.Name === 'LOG_LEVEL') ?? -1
      expect(level).toBeGreaterThanOrEqual(0)
      expect(found).toEqual([
        `Resources.${realtime?.[0]}.Properties.ContainerDefinitions[0].Environment[${level}].Value`,
      ])
      const drilled = templateOf(drill, 'nonprod', 'Services')
      const value = (template: Template) =>
        (
          propertiesOf(resourcesIn(template).find(([id]) => id === realtime?.[0])?.[1]).ContainerDefinitions as Array<{
            Environment: Array<{ Value: unknown }>
          }>
        )[0]?.Environment[level]?.Value
      expect([value(services), value(drilled)]).toEqual(['info', 'drill'])
    }
  }, 60_000)
})

// --- IAC-19's profile half ------------------------------------------------------------------------

// Each stage that holds real data in an account whose own profile doesn't: PR 2's assignment half,
// keyed by account, then wouldn't see it (TECH-SPEC T24 item 25).
function realDataProblems(profiles: Readonly<Record<EnvironmentName, Profile>>): string[] {
  return (['nonprod', 'prod'] as const).flatMap(account =>
    stagesIn(account)
      .filter(stage => profiles[stage].holdsRealData && !profiles[account].holdsRealData)
      .map(stage => `${stage} holds real data in ${account}'s account, whose own profile doesn't`),
  )
}

describe('IAC-19 C11-D69 C11-Q02: the profiles', () => {
  it('IAC-19 finds the restore stage holding real data in an account whose prod profile doesn’t, on planted profiles', () => {
    const planted = {
      ...PROFILES,
      prod: { ...PROFILES.prod, holdsRealData: false },
      restore: { ...PROFILES.restore, holdsRealData: true },
    }
    expect(realDataProblems(planted)).toEqual(["restore holds real data in prod's account, whose own profile doesn't"])
  })

  it('IAC-19: every stage holds real data only where its account’s own profile does', () => {
    expect(realDataProblems(PROFILES)).toEqual([])
    expect(stagesIn('prod')).toEqual(['prod', 'restore'])
    expect(stagesIn('nonprod')).toEqual(['nonprod'])
  })

  it('IAC-19 C11-D41 C11-D45: prod’s load balancer is protected from deletion, and the restore stage has none', () => {
    expect(PROFILES.prod.alb?.deletionProtection).toBe(true)
    expect(PROFILES.restore.alb).toBeUndefined()
  })

  it('IAC-19: no stage sends texts in C0.11: smsProvider is unset in every profile and no container carries SMS_PROVIDER', () => {
    for (const env of ENVIRONMENTS) expect(PROFILES[env].smsProvider, env).toBeUndefined()
    for (const synth of [committed, active]) {
      const named = Object.entries(synth.templates).flatMap(([name, template]) =>
        ofType(template, 'AWS::ECS::TaskDefinition').flatMap(([, r]) =>
          (propertiesOf(r).ContainerDefinitions as Array<{ Environment?: Array<{ Name: string }> }>).flatMap(
            container => (container.Environment ?? []).map(e => `${name} ${e.Name}`),
          ),
        ),
      )
      expect(named.length).toBeGreaterThan(0)
      expect(named.filter(entry => entry.endsWith(' SMS_PROVIDER'))).toEqual([])
    }
  })

  it('IAC-19 C11-D41: a profile asking for the CloudFront ingress is refused, since C0.12 builds it', () => {
    expect(() =>
      synthWorkload({ profiles: { prod: { alb: { ingress: 'cloudfront', deletionProtection: true } } } }),
    ).toThrow('C0.12 builds the CloudFront ingress')
  }, 60_000)

  it.todo('IAC-19 C0.12: prod refuses alb.ingress internet once the edge exists')
})

// --- IAC-20's exact half: the restore stage -------------------------------------------------------

// A CIDR block's first and last address, parsed.
function rangeOf(text: string): [number, number] {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(text)
  if (match === null) throw new Error(`${text} isn't an IPv4 CIDR`)
  const first = match.slice(1, 5).reduce((total, octet) => total * 256 + Number(octet), 0)
  return [first, first + 2 ** (32 - Number(match[5])) - 1]
}
const vpcCidr = (template: Template) => String(propertiesOf(ofType(template, 'AWS::EC2::VPC')[0]?.[1]).CidrBlock)
const restoreServices = (synth: WorkloadSynth) => ofType(templateOf(synth, 'restore', 'Services'), 'AWS::ECS::Service')
// A service role's environment in the restore stage, by name.
function restoreEnvironment(synth: WorkloadSynth, role: string): Record<string, unknown> {
  const services = templateOf(synth, 'restore', 'Services')
  const [definition] = ofType(services, 'AWS::ECS::TaskDefinition').filter(
    ([, r]) => propertiesOf(r).Family === `hearth-restore-${role}`,
  )
  const [container] = propertiesOf(definition?.[1]).ContainerDefinitions as Array<{
    Environment: Array<{ Name: string; Value: unknown }>
  }>
  return Object.fromEntries((container?.Environment ?? []).map(e => [e.Name, e.Value]))
}
const interfaceEndpoints = (template: Template) =>
  ofType(template, 'AWS::EC2::VPCEndpoint').filter(([, r]) => propertiesOf(r).VpcEndpointType === 'Interface')

describe('IAC-20 C11-D45: the restore stage, exactly', () => {
  it('IAC-20 finds two ranges that overlap, on planted CIDRs', () => {
    const overlap = (a: string, b: string) => {
      const [aFirst, aLast] = rangeOf(a)
      const [bFirst, bLast] = rangeOf(b)
      return aFirst <= bLast && bFirst <= aLast
    }
    expect(overlap('10.40.0.0/16', '10.40.128.0/17')).toBe(true)
    expect(overlap('10.40.0.0/16', '10.41.0.0/16')).toBe(false)
    expect(overlap('10.0.0.0/8', '10.40.0.0/16')).toBe(true)
  })

  it('IAC-20: the restore stage’s VPC shares no address with non-prod’s or prod’s, and its subnets are exactly 10.40.0.0/20 and 10.40.16.0/20', () => {
    const [first, last] = rangeOf(vpcCidr(templateOf(committed, 'restore', 'Platform')))
    for (const env of ['nonprod', 'prod'] as const) {
      const [otherFirst, otherLast] = rangeOf(vpcCidr(templateOf(committed, env, 'Platform')))
      expect(first > otherLast || otherFirst > last, env).toBe(true)
    }
    for (const synth of [committed, active]) {
      const subnets = ofType(templateOf(synth, 'restore', 'Platform'), 'AWS::EC2::Subnet')
        .map(([, r]) => rangeOf(String(propertiesOf(r).CidrBlock)))
        .sort((a, b) => a[0] - b[0])
      expect(subnets).toEqual([rangeOf('10.40.0.0/20'), rangeOf('10.40.16.0/20')])
    }
  })

  it('IAC-20 C11-D45: between drills it holds no Valkey and no interface endpoint, the S3 gateway alone, every service at 0, and the placeholder Valkey host', () => {
    expect(ofType(templateOf(committed, 'restore', 'Data'), 'AWS::ElastiCache::ReplicationGroup')).toEqual([])
    const platform = templateOf(committed, 'restore', 'Platform')
    expect(interfaceEndpoints(platform)).toEqual([])
    expect(ofType(platform, 'AWS::EC2::VPCEndpoint').map(([, r]) => propertiesOf(r).ServiceName)).toEqual([
      'com.amazonaws.ap-southeast-1.s3',
    ])
    const services = restoreServices(committed)
    expect(services.map(([id, r]) => [id, propertiesOf(r).DesiredCount])).toEqual([
      ['ApiService', 0],
      ['RealtimeService', 0],
      ['WorkerService', 0],
    ])
    const [endpoint] = ofType(templateOf(committed, 'restore', 'Data'), 'AWS::SSM::Parameter').filter(
      ([, r]) => propertiesOf(r).Name === hearth('restore', 'valkey', 'endpoint'),
    )
    expect(propertiesOf(endpoint?.[1]).Value).toBe('valkey.pending.invalid')
  })

  it('IAC-20 C11-D45: with restoreActive set it holds one Valkey, hearth-restore, that a deploy without it deletes, five interface endpoints in one subnet, the drill’s counts with no load balancer, and the parameter its endpoint', () => {
    const data = templateOf(active, 'restore', 'Data')
    const groups = ofType(data, 'AWS::ElastiCache::ReplicationGroup')
    expect(groups).toHaveLength(1)
    const [groupId, group] = groups[0] as [string, Resource]
    expect(propertiesOf(group).ReplicationGroupId).toBe('hearth-restore')
    expect(group.DeletionPolicy).toBeUndefined()
    expect(group.UpdateReplacePolicy).toBeUndefined()
    const endpoints = interfaceEndpoints(templateOf(active, 'restore', 'Platform'))
    expect(endpoints).toHaveLength(5)
    for (const [id, endpoint] of endpoints) expect(propertiesOf(endpoint).SubnetIds, id).toHaveLength(1)
    const services = restoreServices(active)
    expect(services.map(([id, r]) => [id, propertiesOf(r).DesiredCount])).toEqual([
      ['ApiService', 1],
      ['RealtimeService', 2],
      ['WorkerService', 1],
    ])
    for (const [id, service] of services) {
      expect(propertiesOf(service).HealthCheckGracePeriodSeconds, id).toBeUndefined()
      expect(propertiesOf(service).LoadBalancers, id).toBeUndefined()
    }
    const [endpoint] = ofType(data, 'AWS::SSM::Parameter').filter(
      ([, r]) => propertiesOf(r).Name === hearth('restore', 'valkey', 'endpoint'),
    )
    expect(propertiesOf(endpoint?.[1]).Value).toEqual({ 'Fn::GetAtt': [groupId, 'PrimaryEndPoint.Address'] })
  })

  it('IAC-20 C11-D28 C11-D45: in both, every role runs as prod at https://restore.invalid with no SMS provider, and the stage has its own AUTH_SECRET', () => {
    for (const synth of [committed, active]) {
      for (const role of ['api', 'realtime', 'worker']) {
        const environment = restoreEnvironment(synth, role)
        expect(environment.DEPLOY_ENV, role).toBe('prod')
        expect(environment.APP_ORIGIN, role).toBe('https://restore.invalid')
        expect(environment.SMS_PROVIDER, role).toBeUndefined()
      }
      const secrets = ofType(templateOf(synth, 'restore', 'Data'), 'AWS::SecretsManager::Secret')
      expect(secrets.map(([, r]) => propertiesOf(r).Name)).toEqual(['hearth/restore/auth-secret'])
    }
  })
})

// --- C11-D35: Valkey and the AUTH_SECRET ---------------------------------------------------------

describe('C11-D35 C11-Q01: Valkey and the AUTH_SECRET', () => {
  it.each(['nonprod', 'prod'] as const)(
    'C11-D35 %s: one Valkey 9.1 node, no failover, encrypted in transit and at rest, no snapshot and no log delivery, on 6379, evicting nothing, kept on delete',
    env => {
      const data = templateOf(committed, env, 'Data')
      const [subnets] = ofType(data, 'AWS::ElastiCache::SubnetGroup')
      const [settings] = ofType(data, 'AWS::ElastiCache::ParameterGroup')
      const groups = ofType(data, 'AWS::ElastiCache::ReplicationGroup')
      expect(groups).toHaveLength(1)
      const [, group] = groups[0] as [string, Resource]
      expect(ssmOf(propertiesOf(group), data)).toEqual({
        AtRestEncryptionEnabled: true,
        AutomaticFailoverEnabled: false,
        CacheNodeType: 'cache.t4g.micro',
        CacheParameterGroupName: { Ref: settings?.[0] },
        CacheSubnetGroupName: { Ref: subnets?.[0] },
        Engine: 'valkey',
        EngineVersion: '9.1',
        MultiAZEnabled: false,
        NumCacheClusters: 1,
        Port: 6379,
        ReplicationGroupDescription: `Hearth ${env} Valkey (C11-D35)`,
        ReplicationGroupId: `hearth-${env}`,
        SecurityGroupIds: [`{ssm:${hearth(env, 'security-group', 'valkey')}}`],
        SnapshotRetentionLimit: 0,
        TransitEncryptionEnabled: true,
        TransitEncryptionMode: 'required',
      })
      expect(group.DeletionPolicy).toBe('RetainExceptOnCreate')
      expect(group.UpdateReplacePolicy).toBe('Retain')
      expect(propertiesOf(settings?.[1])).toEqual({
        CacheParameterGroupFamily: 'valkey9',
        Description: `Hearth ${env} Valkey, which evicts nothing (C11-D35)`,
        Properties: { 'maxmemory-policy': 'noeviction' },
      })
      expect(ssmOf(propertiesOf(subnets?.[1]), data)).toEqual({
        Description: `Hearth ${env} Valkey, in the isolated subnets (C11-D35)`,
        SubnetIds: `{ssm:${hearth(env, 'network', 'isolated-subnets')}}`,
      })
    },
  )

  it.each(ENVIRONMENTS)(
    'C11-D35 %s: the AUTH_SECRET is generated (64 characters, no punctuation), never written, with no rotation, kept on delete, and its full ARN published',
    env => {
      for (const synth of [committed, active]) {
        const data = templateOf(synth, env, 'Data')
        const secrets = ofType(data, 'AWS::SecretsManager::Secret')
        expect(secrets).toHaveLength(1)
        const [secretId, secret] = secrets[0] as [string, Resource]
        expect(propertiesOf(secret)).toEqual({
          Description: `Hearth ${env} AUTH_SECRET, which every sign-in key derives from (C11-D35)`,
          GenerateSecretString: { ExcludePunctuation: true, PasswordLength: 64 },
          Name: `hearth/${env}/auth-secret`,
        })
        expect(secret.DeletionPolicy).toBe('RetainExceptOnCreate')
        expect(secret.UpdateReplacePolicy).toBe('Retain')
        expect(
          resourcesIn(data).filter(
            ([, r]) => r.Type.startsWith('AWS::SecretsManager::') && r.Type !== 'AWS::SecretsManager::Secret',
          ),
        ).toEqual([])
        const [published] = ofType(data, 'AWS::SSM::Parameter').filter(
          ([, r]) => propertiesOf(r).Name === hearth(env, 'auth-secret', 'arn'),
        )
        expect(propertiesOf(published?.[1]).Value).toEqual({ Ref: secretId })
      }
    },
  )
})

// --- The wiring (C11-D24) ------------------------------------------------------------------------

// What each part stands on (C11-D27): Data and Tasks on Platform, Services on Platform and Data, never
// on Tasks, so a rollback can deploy Tasks and Services alone (C11-D52).
const STANDS_ON: Readonly<Record<Part, readonly Part[]>> = {
  Platform: [],
  Data: ['Platform'],
  Tasks: ['Platform'],
  Services: ['Platform', 'Data'],
}
// The synthesizer's own parameter, which IAC-13 and IAC-24 pin.
const BOOTSTRAP_VERSION = ['', 'cdk-bootstrap', 'hearthapp', 'version'].join('/')
// The parameter types CloudFormation reads without checking each value against the account as the
// caller, which the deploy role couldn't.
const READABLE_TYPES = ['AWS::SSM::Parameter::Value<String>', 'AWS::SSM::Parameter::Value<List<String>>']

// Each parameter a stage's stack reads that it shouldn't, as problems: one no stack it stands on
// writes and no Baseline does, one of a type CloudFormation checks as the caller, one outside /hearth/,
// one the deployer would pass, and a bootstrap version that isn't the synthesizer's.
function wiringProblems(templates: Readonly<Record<string, Template>>, env: EnvironmentName): string[] {
  const baselines = [hearth(env, 'zone', 'app'), hearth('organisation', 'id')]
  return PARTS.flatMap(part => {
    const name = `Hearth-${env}-${part}`
    const template = templates[name] ?? {}
    const written = STANDS_ON[part].flatMap(other =>
      ofType(templates[`Hearth-${env}-${other}`] ?? {}, 'AWS::SSM::Parameter').map(([, r]) => propertiesOf(r).Name),
    )
    return Object.entries(parametersOf(template)).flatMap(([id, parameter]) => {
      const at = `${name} ${id}`
      if (id === 'BootstrapVersion') {
        return parameter.Default === BOOTSTRAP_VERSION && parameter.Type === READABLE_TYPES[0]
          ? []
          : [`${at}: not the synthesizer's bootstrap version`]
      }
      if (!parameter.Type.startsWith('AWS::SSM::Parameter::Value<')) return [`${at}: a parameter the deployer passes`]
      const found: string[] = []
      if (!READABLE_TYPES.includes(parameter.Type))
        found.push(`${at}: ${parameter.Type}, which CloudFormation checks as the caller`)
      const reads = String(parameter.Default)
      if (!reads.startsWith('/hearth/')) found.push(`${at}: ${reads}, outside what the deploy role reads`)
      if (!written.includes(reads) && !baselines.includes(reads)) {
        found.push(`${at}: ${reads}, which no stack it stands on writes`)
      }
      return found
    })
  })
}

// Each stack's dependencies as its stage's nested assembly declares them, by CloudFormation name.
function dependenciesOf(synth: WorkloadSynth): Record<string, string[]> {
  type Manifest = {
    artifacts?: Record<
      string,
      { type: string; dependencies?: string[]; properties?: { stackName?: string; directoryName?: string } }
    >
  }
  const read = (folder: string) =>
    JSON.parse(readFileSync(join(synth.synthesised.outdir, folder, 'manifest.json'), 'utf8')) as Manifest
  const result: Record<string, string[]> = {}
  for (const nested of Object.values(read('').artifacts ?? {})) {
    const folder = nested.type === 'cdk:cloud-assembly' ? nested.properties?.directoryName : undefined
    if (folder === undefined) continue
    const artifacts = read(folder).artifacts ?? {}
    const names = new Map(
      Object.entries(artifacts)
        .filter(([, a]) => a.type === 'aws:cloudformation:stack')
        .map(([id, a]) => [id, a.properties?.stackName ?? id]),
    )
    for (const [id, name] of names) {
      result[name] = (artifacts[id]?.dependencies ?? [])
        .filter(dependency => artifacts[dependency]?.type !== 'cdk:asset-manifest')
        .map(dependency => names.get(dependency) ?? `?${dependency}`)
        .sort()
    }
  }
  return result
}

describe('C11-D24 C11-D27: the wiring between the stacks', () => {
  it('C11-D24 finds a parameter no stack writes, a type CloudFormation checks as the caller, one outside /hearth/ and one the deployer passes, planted in copies of non-prod’s templates', () => {
    expect(wiringProblems(committed.templates, 'nonprod')).toEqual([])
    const templates = structuredClone(committed.templates) as Record<string, Template>
    const services = templates['Hearth-nonprod-Services'] ?? {}
    const parameters = parametersOf(services)
    const subnets = Object.entries(parameters).find(
      ([, p]) => p.Default === hearth('nonprod', 'network', 'isolated-subnets'),
    )?.[1]
    if (subnets === undefined) throw new Error('no isolated-subnets parameter')
    subnets.Type = 'AWS::SSM::Parameter::Value<List<AWS::EC2::Subnet::Id>>'
    parameters.PlantedNowhere = { Type: READABLE_TYPES[0] ?? '', Default: hearth('nonprod', 'nowhere') }
    parameters.PlantedOutside = { Type: READABLE_TYPES[0] ?? '', Default: '/elsewhere/value' }
    parameters.PlantedPassed = { Type: 'String' }
    expect(wiringProblems(templates, 'nonprod').sort()).toEqual(
      [
        `Hearth-nonprod-Services ${Object.entries(parameters).find(([, p]) => p === subnets)?.[0]}: AWS::SSM::Parameter::Value<List<AWS::EC2::Subnet::Id>>, which CloudFormation checks as the caller`,
        `Hearth-nonprod-Services PlantedNowhere: ${hearth('nonprod', 'nowhere')}, which no stack it stands on writes`,
        'Hearth-nonprod-Services PlantedOutside: /elsewhere/value, outside what the deploy role reads',
        'Hearth-nonprod-Services PlantedOutside: /elsewhere/value, which no stack it stands on writes',
        'Hearth-nonprod-Services PlantedPassed: a parameter the deployer passes',
      ].sort(),
    )
  })

  for (const [label, synth] of [
    ['committed', () => committed],
    ['restore-active', () => active],
  ] as const) {
    it.each(ENVIRONMENTS)(
      `C11-D24 %s (${label}): every parameter a stack reads is one a stack it stands on writes, or a Baseline's, of a type read as written, under /hearth/`,
      env => {
        expect(wiringProblems(synth().templates, env)).toEqual([])
      },
    )
  }

  it.each(ENVIRONMENTS)(
    'C11-D24 %s: what each stack reads, by name: Platform the organisation id (and the zone where it has a load balancer), Data the subnets (and Valkey’s group), Tasks the subnets and the one-offs’ groups, Services the rest',
    env => {
      for (const [label, synth, restoreLive] of [
        ['committed', committed, false],
        ['restore-active', active, true],
      ] as const) {
        const reads = (part: Part) =>
          Object.entries(parametersOf(templateOf(synth, env, part)))
            .filter(([id]) => id !== 'BootstrapVersion')
            .map(([, p]) => String(p.Default))
            .sort()
        const alb = env !== 'restore'
        const valkey = env !== 'restore' || restoreLive
        expect(reads('Platform'), label).toEqual(
          [hearth('organisation', 'id'), ...(alb ? [hearth(env, 'zone', 'app')] : [])].sort(),
        )
        expect(reads('Data'), label).toEqual(
          [
            hearth(env, 'network', 'isolated-subnets'),
            ...(valkey ? [hearth(env, 'security-group', 'valkey')] : []),
          ].sort(),
        )
        expect(reads('Tasks'), label).toEqual(
          [
            hearth(env, 'network', 'isolated-subnets'),
            hearth(env, 'security-group', 'migrate'),
            hearth(env, 'security-group', 'probe'),
          ].sort(),
        )
        expect(reads('Services'), label).toEqual(
          [
            hearth(env, 'network', 'isolated-subnets'),
            hearth(env, 'valkey', 'endpoint'),
            hearth(env, 'auth-secret', 'arn'),
            ...['api', 'realtime', 'worker'].map(role => hearth(env, 'security-group', role)),
            ...(alb ? ['api', 'realtime'].map(role => hearth(env, 'target-group', role)) : []),
          ].sort(),
        )
      }
    },
  )

  it('C11-D27 C11-D52: the assembly declares exactly each stack’s dependencies on the stacks it stands on, Services never on Tasks', () => {
    expect(dependenciesOf(committed)).toEqual(
      Object.fromEntries(
        ENVIRONMENTS.flatMap(env =>
          PARTS.map(part => [`Hearth-${env}-${part}`, STANDS_ON[part].map(other => `Hearth-${env}-${other}`).sort()]),
        ),
      ),
    )
  })
})
