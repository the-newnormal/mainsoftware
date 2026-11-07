// What the workload runs (C11-D36 to C11-D42, C11-D52; TECH-SPEC T18 item 6, T19 item 16, T24 items 14
// to 16), over every stage's templates, committed and with restoreActive set:
// - IAC-08: non-prod's and prod's load balancer, its one HTTPS listener and its two path rules, the
//   target groups' checks and attributes, realtime's two tasks, the `origin.` certificate and its alias
//   record; the restore stage holds none of them;
// - IAC-09: every task definition, the three services' and the three one-offs', field by field: the
//   image by the release's digest, the node user, the read-only root but the bastion's, the open-file
//   limit, the logs, each kind's command and each service role's environment exactly, the AUTH_SECRET
//   by reference to the api alone, the hearth-role tag on the one-offs, and no variable C0.12 or a
//   person sets; a profile that gates the probe changes only its command, and one with a database or
//   an SMS provider is refused;
// - IAC-21: each service role's environment, its references resolved to fictional values, passes the
//   server's own configuration check, which reads back the role, environment, origin, port and host;
// - C11-D39: each stage's cluster, and each ECS service, property by property, with the grace period
//   exactly where it has a load balancer, and no autoscaling anywhere;
// - C11-D52's seams: the Tasks stack's outputs and the Services stack's Release.
// Expected values are literals, or joined from their parts here (IG-01): a reference to an SSM
// parameter renders as `{ssm:<name>}`, and the account as a made-up one. This file stays off the
// owner's-read list: the invariants these resources keep (the image by digest, secrets by reference,
// no public address) are aspects/templates.test.ts's.
import { readFileSync } from 'node:fs'
import { ConfigError, loadConfig } from '@hearth/server/config'
import { beforeAll, describe, expect, it } from 'vitest'
import { DOMAINS, ENVIRONMENTS, type EnvironmentName, REGION } from '../config/profiles.ts'
import { fixtureAccount } from '../testing/fixture.ts'
import { synthWorkload, type WorkloadSynth } from '../testing/workload.ts'

type Template = Record<string, unknown>
interface Resource {
  Type: string
  Properties?: Record<string, unknown>
  DeletionPolicy?: string
  UpdateReplacePolicy?: string
}
type Container = Record<string, unknown> & { Environment?: Array<{ Name: string; Value: unknown }> }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const resourcesIn = (template: Template): Array<[string, Resource]> =>
  Object.entries(isObject(template.Resources) ? (template.Resources as Record<string, Resource>) : {})
const ofType = (template: Template, type: string) => resourcesIn(template).filter(([, r]) => r.Type === type)
const propertiesOf = (resource: Resource | undefined): Record<string, unknown> => resource?.Properties ?? {}
const refOf = (value: unknown): string | undefined =>
  isObject(value) && typeof value.Ref === 'string' ? value.Ref : undefined

// A made-up account, the release CI synthesises (C11-D62), and ARNs, all joined from their parts.
const ACCOUNT = fixtureAccount(7)
const DIGEST = `sha256:${'0'.repeat(64)}`
const RELEASE = `${'f'.repeat(40)}:${DIGEST}`
const arn = (service: string, region: string, account: string, resource: string) =>
  ['arn', 'aws', service, region, account, resource].join(':')
const ssm = (...parts: string[]) => `{ssm:${['', 'hearth', ...parts].join('/')}}`

// A value as CloudFormation would render it in an account: the pseudo-parameters, a Ref to one of the
// template's SSM parameters as `{ssm:<name>}` (or the value a test gives that name), an Fn::Join over
// those; a Ref to a resource, and anything else, as written.
function render(value: unknown, template: Template, values: Record<string, string> = {}): unknown {
  if (Array.isArray(value)) return value.map(item => render(item, template, values))
  if (!isObject(value)) return value
  const ref = refOf(value)
  if (ref !== undefined && Object.keys(value).length === 1) {
    const pseudo: Record<string, string> = {
      'AWS::AccountId': ACCOUNT,
      'AWS::Region': REGION,
      'AWS::Partition': 'aws',
      'AWS::URLSuffix': 'amazonaws.com',
    }
    if (pseudo[ref] !== undefined) return pseudo[ref]
    const parameter = (template.Parameters as Record<string, { Default?: string }> | undefined)?.[ref]
    if (parameter?.Default !== undefined) return values[parameter.Default] ?? `{ssm:${parameter.Default}}`
    return value
  }
  const join = value['Fn::Join']
  if (Array.isArray(join) && typeof join[0] === 'string' && Array.isArray(join[1]) && Object.keys(value).length === 1) {
    const parts = join[1].map(part => render(part, template, values))
    if (parts.every(part => typeof part === 'string')) return parts.join(join[0])
  }
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, render(inner, template, values)]))
}

let committed: WorkloadSynth
let active: WorkloadSynth
const templateOf = (synth: WorkloadSynth, env: EnvironmentName, part: string): Template => {
  const template = synth.templates[`Hearth-${env}-${part}`]
  if (template === undefined) throw new Error(`no Hearth-${env}-${part}`)
  return template
}

beforeAll(() => {
  committed = synthWorkload()
  active = synthWorkload({ run: { restoreActive: true } })
}, 60_000)

const ROLES = ['api', 'realtime', 'worker'] as const
const ONE_OFFS = ['migrate', 'probe', 'bastion'] as const
type Kind = (typeof ROLES)[number] | (typeof ONE_OFFS)[number]
const LIVE = ['nonprod', 'prod'] as const

// --- IAC-08: the load balancer ---------------------------------------------------------------------

// Each target group's check and settings (C11-D41, C11-D42): realtime on /ready/local, the api on
// /health, each plain HTTP/1 to port 3000 by IP, with no stickiness, round robin, and the server's 10 s
// drain.
const TARGET_GROUPS = {
  api: { path: '/health', interval: 15 },
  realtime: { path: '/ready/local', interval: 10 },
} as const

describe('IAC-08 T19 item 16 C11-D41 C11-D42: the load balancer', () => {
  it.each(LIVE)(
    'IAC-08 %s: one internet-facing load balancer in the public subnets with its own group, idle 60 s, invalid headers dropped, defensive desync, HTTP/2, deletion protection per profile',
    env => {
      const platform = templateOf(committed, env, 'Platform')
      const balancers = ofType(platform, 'AWS::ElasticLoadBalancingV2::LoadBalancer')
      expect(balancers).toHaveLength(1)
      const publicSubnets = ofType(platform, 'AWS::EC2::Subnet')
        .filter(([, r]) =>
          ((propertiesOf(r).Tags ?? []) as Array<{ Key: string; Value: string }>).some(
            tag => tag.Key === 'aws-cdk:subnet-name' && tag.Value === 'public',
          ),
        )
        .map(([id]) => ({ Ref: id }))
      const [albGroup] = ofType(platform, 'AWS::EC2::SecurityGroup').filter(
        ([, r]) =>
          propertiesOf(r).GroupDescription === `Hearth ${env} load balancer in front of api and realtime (C11-D31)`,
      )
      const { LoadBalancerAttributes, ...rest } = propertiesOf(balancers[0]?.[1])
      expect(rest).toEqual({
        Name: `hearth-${env}`,
        Scheme: 'internet-facing',
        SecurityGroups: [{ 'Fn::GetAtt': [albGroup?.[0], 'GroupId'] }],
        Subnets: publicSubnets,
        Type: 'application',
      })
      expect(publicSubnets).toHaveLength(2)
      const attributes = Object.fromEntries(
        (LoadBalancerAttributes as Array<{ Key: string; Value: string }>).map(({ Key, Value }) => [Key, Value]),
      )
      expect(attributes).toEqual({
        'deletion_protection.enabled': env === 'prod' ? 'true' : 'false',
        'routing.http2.enabled': 'true',
        'idle_timeout.timeout_seconds': '60',
        'routing.http.drop_invalid_header_fields.enabled': 'true',
        'routing.http.desync_mitigation_mode': 'defensive',
      })
    },
  )

  it('IAC-08 T24 item 16: the idle timeout is 60 s because the server keeps an idle connection for Fastify’s default 72 s, which its comment names', () => {
    const source = readFileSync(new URL('./load-balancer.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/Fastify's default 72 s/)
    expect(source).toMatch(/idleTimeout: cdk\.Duration\.seconds\(60\)/)
  })

  it.each(LIVE)(
    'IAC-08 %s: exactly one listener, HTTPS on 443 with the restricted post-quantum TLS policy and the origin certificate, answering 404 by default; none on 80',
    env => {
      const platform = templateOf(committed, env, 'Platform')
      const [balancer] = ofType(platform, 'AWS::ElasticLoadBalancingV2::LoadBalancer')
      const [certificate] = ofType(platform, 'AWS::CertificateManager::Certificate')
      expect(ofType(platform, 'AWS::ElasticLoadBalancingV2::Listener').map(([, r]) => propertiesOf(r))).toEqual([
        {
          Certificates: [{ CertificateArn: { Ref: certificate?.[0] } }],
          DefaultActions: [
            {
              FixedResponseConfig: { ContentType: 'text/plain', MessageBody: 'Not found', StatusCode: '404' },
              Type: 'fixed-response',
            },
          ],
          LoadBalancerArn: { Ref: balancer?.[0] },
          Port: 443,
          Protocol: 'HTTPS',
          SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09',
        },
      ])
    },
  )

  it.each(LIVE)(
    'IAC-08 %s: exactly two rules, by path alone: /ws to realtime at 10 and /api/* to the api at 20',
    env => {
      const platform = templateOf(committed, env, 'Platform')
      const [listener] = ofType(platform, 'AWS::ElasticLoadBalancingV2::Listener')
      const group = (name: string) =>
        ofType(platform, 'AWS::ElasticLoadBalancingV2::TargetGroup').find(([, r]) => propertiesOf(r).Name === name)?.[0]
      const rule = (priority: number, path: string, role: string) => ({
        Actions: [{ TargetGroupArn: { Ref: group(`hearth-${env}-${role}`) }, Type: 'forward' }],
        Conditions: [{ Field: 'path-pattern', PathPatternConfig: { Values: [path] } }],
        ListenerArn: { Ref: listener?.[0] },
        Priority: priority,
      })
      const rules = ofType(platform, 'AWS::ElasticLoadBalancingV2::ListenerRule')
        .map(([, r]) => propertiesOf(r))
        .sort((a, b) => Number(a.Priority) - Number(b.Priority))
      expect(rules).toEqual([rule(10, '/ws', 'realtime'), rule(20, '/api/*', 'api')])
      expect(JSON.stringify(rules)).not.toContain('host-header')
    },
  )

  it.each(LIVE)('IAC-08 C11-D41 C11-D42 %s: the two target groups exactly', env => {
    const platform = templateOf(committed, env, 'Platform')
    const [vpc] = ofType(platform, 'AWS::EC2::VPC')
    const groups = ofType(platform, 'AWS::ElasticLoadBalancingV2::TargetGroup')
      .map(([, r]) => propertiesOf(r))
      .sort((a, b) => String(a.Name).localeCompare(String(b.Name)))
    expect(groups).toEqual(
      (['api', 'realtime'] as const).map(role => ({
        HealthCheckIntervalSeconds: TARGET_GROUPS[role].interval,
        HealthCheckPath: TARGET_GROUPS[role].path,
        HealthCheckTimeoutSeconds: 5,
        HealthyThresholdCount: 2,
        Matcher: { HttpCode: '200' },
        Name: `hearth-${env}-${role}`,
        Port: 3000,
        Protocol: 'HTTP',
        ProtocolVersion: 'HTTP1',
        TargetGroupAttributes: [
          { Key: 'deregistration_delay.timeout_seconds', Value: '10' },
          { Key: 'stickiness.enabled', Value: 'false' },
          { Key: 'load_balancing.algorithm.type', Value: 'round_robin' },
        ],
        TargetType: 'ip',
        UnhealthyThresholdCount: 3,
        VpcId: { Ref: vpc?.[0] },
      })),
    )
  })

  it.each(LIVE)('IAC-08 T19 item 16 %s: realtime runs at least two tasks, across both isolated subnets', env => {
    const services = templateOf(committed, env, 'Services')
    const realtime = propertiesOf(ofType(services, 'AWS::ECS::Service').find(([id]) => id === 'RealtimeService')?.[1])
    expect(Number(realtime.DesiredCount)).toBeGreaterThanOrEqual(2)
    expect(render(realtime.NetworkConfiguration, services)).toMatchObject({
      AwsvpcConfiguration: { Subnets: ssm(env, 'network', 'isolated-subnets') },
    })
    const platform = templateOf(committed, env, 'Platform')
    const [list] = ofType(platform, 'AWS::SSM::Parameter').filter(
      ([, r]) => propertiesOf(r).Name === ['', 'hearth', env, 'network', 'isolated-subnets'].join('/'),
    )
    const joined = propertiesOf(list?.[1]).Value as { 'Fn::Join': [string, unknown[]] }
    const isolated = ofType(platform, 'AWS::EC2::Subnet')
      .filter(([, r]) => JSON.stringify(propertiesOf(r).Tags).includes('"Value":"isolated"'))
      .map(([id]) => ({ Ref: id }))
    expect(isolated).toHaveLength(2)
    expect(joined['Fn::Join'][1]).toEqual(isolated)
  })

  it.each(LIVE)(
    'IAC-08 C11-D43 %s: the origin certificate, validated by DNS in the app zone and kept, and an alias A record to the load balancer',
    env => {
      const platform = templateOf(committed, env, 'Platform')
      const origin = env === 'prod' ? ['origin', DOMAINS.app].join('.') : ['origin', 'nonprod', DOMAINS.app].join('.')
      const zone = ssm(env, 'zone', 'app')
      const certificates = ofType(platform, 'AWS::CertificateManager::Certificate')
      expect(certificates).toHaveLength(1)
      const [, certificate] = certificates[0] as [string, Resource]
      const properties = render(propertiesOf(certificate), platform) as Record<string, unknown>
      expect(properties.DomainName).toBe(origin)
      expect(properties.ValidationMethod).toBe('DNS')
      expect(properties.DomainValidationOptions).toEqual([{ DomainName: origin, HostedZoneId: zone }])
      expect(properties.SubjectAlternativeNames).toBeUndefined()
      expect(certificate.DeletionPolicy).toBe('RetainExceptOnCreate')
      expect(certificate.UpdateReplacePolicy).toBe('Retain')
      const [balancer] = ofType(platform, 'AWS::ElasticLoadBalancingV2::LoadBalancer')
      expect(ofType(platform, 'AWS::Route53::RecordSet').map(([, r]) => render(propertiesOf(r), platform))).toEqual([
        {
          AliasTarget: {
            DNSName: { 'Fn::Join': ['', ['dualstack.', { 'Fn::GetAtt': [balancer?.[0], 'DNSName'] }]] },
            HostedZoneId: { 'Fn::GetAtt': [balancer?.[0], 'CanonicalHostedZoneID'] },
          },
          HostedZoneId: zone,
          Name: `${origin}.`,
          Type: 'A',
        },
      ])
    },
  )

  it('IAC-08 C11-D45: the restore stage holds no load balancer, listener, rule, target group, certificate or record, committed or active', () => {
    const types = [
      'AWS::ElasticLoadBalancingV2::LoadBalancer',
      'AWS::ElasticLoadBalancingV2::Listener',
      'AWS::ElasticLoadBalancingV2::ListenerRule',
      'AWS::ElasticLoadBalancingV2::TargetGroup',
      'AWS::CertificateManager::Certificate',
      'AWS::Route53::RecordSet',
    ]
    for (const synth of [committed, active]) {
      const found = Object.entries(synth.templates)
        .filter(([name]) => name.startsWith('Hearth-restore-'))
        .flatMap(([name, template]) =>
          resourcesIn(template)
            .filter(([, r]) => types.includes(r.Type))
            .map(([id]) => `${name} ${id}`),
        )
      expect(found).toEqual([])
    }
  })
})

// --- IAC-09: the task definitions ----------------------------------------------------------------

// Each service role's size per stage (C11-D28), as `<cpu>/<memory>`; the one-offs take 256/512.
const SIZES: Readonly<Record<EnvironmentName, Readonly<Record<(typeof ROLES)[number], string>>>> = {
  nonprod: { api: '512/1024', realtime: '512/2048', worker: '256/512' },
  prod: { api: '512/1024', realtime: '512/2048', worker: '256/512' },
  restore: { api: '512/1024', realtime: '512/2048', worker: '256/512' },
}
// Each kind's command (C11-D36, C11-D40, C11-D53): realtime's heap capped inside its 2 GB, the probe
// ungated while no role is, the bastion a timer that runs no server code.
const COMMANDS: Readonly<Record<Kind, readonly string[]>> = {
  api: ['node', 'src/main.ts'],
  realtime: ['node', '--max-old-space-size=1536', 'src/main.ts'],
  worker: ['node', 'src/main.ts'],
  migrate: ['node', 'src/db/migrate.ts'],
  probe: ['node', 'src/deploy/ready-probe.ts', '--gate=none'],
  bastion: ['node', '-e', 'setTimeout(()=>{},60*60*1000)'],
}
// The services' liveness check (C11-D36): /health over the loopback with Node's own fetch, no shell.
const HEALTH_CHECK = {
  Command: [
    'CMD',
    'node',
    '-e',
    "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))",
  ],
  Interval: 30,
  Retries: 3,
  StartPeriod: 20,
  Timeout: 5,
}
const APP_ORIGINS: Readonly<Record<EnvironmentName, string>> = {
  nonprod: `https://${['nonprod', DOMAINS.app].join('.')}`,
  prod: `https://${DOMAINS.app}`,
  restore: 'https://restore.invalid',
}
// A login's placeholder database URL, joined from its parts (IG-01).
const pendingUrl = (login: string) => [`postgres://${login}`, 'database.pending.invalid:5432/hearth'].join('@')

// Each service role's environment exactly (C11-D37, T18 item 6): its own database login alone.
function expectedEnvironment(env: EnvironmentName, role: (typeof ROLES)[number]): Record<string, string> {
  return {
    ROLE: role,
    DEPLOY_ENV: env === 'nonprod' ? 'nonprod' : 'prod',
    APP_ORIGIN: APP_ORIGINS[env],
    LOG_LEVEL: 'info',
    HOST: '0.0.0.0',
    PORT: '3000',
    VALKEY_URL: `rediss://${ssm(env, 'valkey', 'endpoint')}:6379`,
    S3_BUCKET: `hearth-pending-${env}`,
    S3_REGION: 'ap-southeast-1',
    ...(role === 'worker'
      ? { WORKER_DATABASE_URL: pendingUrl('hearth_worker'), WORKER_CONCURRENCY: '4' }
      : { DATABASE_URL: pendingUrl('hearth_app') }),
  }
}

// Each kind's definition exactly, as rendered, its environment as an object (its order unpinned).
function expectedDefinition(env: EnvironmentName, kind: Kind): Record<string, unknown> {
  const service = (ROLES as readonly string[]).includes(kind)
  const [cpu, memory] = service
    ? (SIZES[env][kind as (typeof ROLES)[number]].split('/') as [string, string])
    : ['256', '512']
  const role = (suffix: string) => arn('iam', '', ACCOUNT, `role/hearth-${env}-${kind}-${suffix}`)
  return {
    ContainerDefinitions: [
      {
        Command: COMMANDS[kind],
        ...(service ? { Environment: expectedEnvironment(env, kind as (typeof ROLES)[number]) } : {}),
        Essential: true,
        ...(service ? { HealthCheck: HEALTH_CHECK } : {}),
        Image: `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/hearth-server@${DIGEST}`,
        ...(kind === 'bastion' ? { LinuxParameters: { Capabilities: {}, InitProcessEnabled: true } } : {}),
        LogConfiguration: {
          LogDriver: 'awslogs',
          Options: {
            'awslogs-group': `/hearth/${env}/${kind}`,
            'awslogs-stream-prefix': kind,
            'awslogs-region': REGION,
            mode: 'non-blocking',
            'max-buffer-size': '26214400b',
          },
        },
        Name: 'server',
        ...(service ? { PortMappings: [{ ContainerPort: 3000, Protocol: 'tcp' }] } : {}),
        ReadonlyRootFilesystem: kind !== 'bastion',
        ...(kind === 'api' ? { Secrets: [{ Name: 'AUTH_SECRET', ValueFrom: ssm(env, 'auth-secret', 'arn') }] } : {}),
        StopTimeout: 30,
        Ulimits: [{ HardLimit: 65536, Name: 'nofile', SoftLimit: 65536 }],
        User: 'node',
      },
    ],
    Cpu: cpu,
    ExecutionRoleArn: role('exec'),
    Family: `hearth-${env}-${kind}`,
    Memory: memory,
    NetworkMode: 'awsvpc',
    RequiresCompatibilities: ['FARGATE'],
    RuntimePlatform: { CpuArchitecture: 'ARM64', OperatingSystemFamily: 'LINUX' },
    ...(service ? {} : { Tags: [{ Key: 'hearth-role', Value: kind }] }),
    TaskRoleArn: role('task'),
  }
}

interface Definition {
  stack: string
  id: string
  template: Template
  properties: Record<string, unknown>
}
// Every task definition a build holds, by family.
function definitionsOf(synth: WorkloadSynth): Map<string, Definition> {
  return new Map(
    Object.entries(synth.templates).flatMap(([stack, template]) =>
      ofType(template, 'AWS::ECS::TaskDefinition').map(
        ([id, r]) => [String(propertiesOf(r).Family), { stack, id, template, properties: propertiesOf(r) }] as const,
      ),
    ),
  )
}
const containersOf = (definition: Definition) => definition.properties.ContainerDefinitions as Container[]
// A definition rendered, its container's environment made an object.
function renderedDefinition(definition: Definition, values: Record<string, string> = {}): Record<string, unknown> {
  const properties = render(definition.properties, definition.template, values) as Record<string, unknown>
  const containers = (properties.ContainerDefinitions as Container[]).map(container =>
    container.Environment === undefined
      ? container
      : { ...container, Environment: Object.fromEntries(container.Environment.map(e => [e.Name, e.Value])) },
  )
  return { ...properties, ContainerDefinitions: containers }
}

// Variables no container may carry in C0.11 (IAC-09): C0.12's SMS provider and Twilio's, the proxies,
// the Owner bootstrap script's and the migrator's own, and the local object store's.
const FORBIDDEN_NAMES = [
  /^SMS_PROVIDER$/,
  /^TWILIO_/,
  /^TRUST_PROXY$/,
  /^OWNER_BOOTSTRAP_/,
  /^MIGRATION_/,
  /^S3_ENDPOINT$/,
  /^S3_FORCE_PATH_STYLE$/,
  /^S3_ACCESS_KEY_ID$/,
  /^S3_SECRET_ACCESS_KEY$/,
]
// A URL's user information with a password in it.
const USERINFO_PASSWORD = /^[a-z]+:\/\/[^/@]*:[^/@]*@/

describe('IAC-09 C11-D36 to C11-D40: the task definitions', () => {
  it('IAC-09: each stage holds six definitions, the three services’ in Services and the three one-offs’ in Tasks, and no other', () => {
    const families = [...definitionsOf(committed)].map(([family, d]) => `${d.stack} ${family}`).sort()
    expect(families).toEqual(
      ENVIRONMENTS.flatMap(env => [
        ...ROLES.map(role => `Hearth-${env}-Services hearth-${env}-${role}`),
        ...ONE_OFFS.map(kind => `Hearth-${env}-Tasks hearth-${env}-${kind}`),
      ]).sort(),
    )
  })

  for (const [label, synth] of [
    ['committed', () => committed],
    ['restore-active', () => active],
  ] as const) {
    it.each(ENVIRONMENTS)(
      `IAC-09 %s (${label}): every definition exactly: Fargate on ARM64, its size, its two roles by name, one essential container running the release by digest as node with a read-only root but the bastion's, its limits, its logs, its command and, for a service, its check, port and environment`,
      env => {
        const definitions = definitionsOf(synth())
        for (const kind of [...ROLES, ...ONE_OFFS]) {
          const definition = definitions.get(`hearth-${env}-${kind}`)
          if (definition === undefined) throw new Error(`no hearth-${env}-${kind}`)
          expect(renderedDefinition(definition), `${env} ${kind}`).toEqual(expectedDefinition(env, kind))
        }
      },
    )
  }

  it('IAC-09 C11-D53: the probe’s command is exactly its script with --gate=none, and it carries no environment', () => {
    for (const env of ENVIRONMENTS) {
      const [container] = containersOf(definitionsOf(committed).get(`hearth-${env}-probe`) as Definition)
      expect(container?.Command).toEqual(['node', 'src/deploy/ready-probe.ts', '--gate=none'])
      expect(container?.Environment).toBeUndefined()
      expect(container?.Secrets).toBeUndefined()
    }
  })

  it('IAC-09 T18 item 6: DATABASE_URL is the hearth_app placeholder on the api and realtime alone, WORKER_DATABASE_URL the hearth_worker one on the worker alone, and only the api holds a secret, the AUTH_SECRET by reference', () => {
    for (const synth of [committed, active]) {
      for (const definition of definitionsOf(synth).values()) {
        const [container] = containersOf(definition)
        const environment = Object.fromEntries((container?.Environment ?? []).map(e => [e.Name, e.Value]))
        const family = String(definition.properties.Family)
        const role = family.slice(family.lastIndexOf('-') + 1)
        expect(environment.DATABASE_URL, family).toBe(
          role === 'api' || role === 'realtime' ? pendingUrl('hearth_app') : undefined,
        )
        expect(environment.WORKER_DATABASE_URL, family).toBe(
          role === 'worker' ? pendingUrl('hearth_worker') : undefined,
        )
        const secrets = render(container?.Secrets, definition.template)
        const env = family.split('-')[1] ?? ''
        expect(secrets, family).toEqual(
          role === 'api' ? [{ Name: 'AUTH_SECRET', ValueFrom: ssm(env, 'auth-secret', 'arn') }] : undefined,
        )
      }
    }
  })

  it('IAC-09: no container carries SMS_PROVIDER, a TWILIO_, TRUST_PROXY, OWNER_BOOTSTRAP_ or MIGRATION_ variable or the local store’s, and no value holds a URL with a password', () => {
    const planted = (Name: string, Value: string) => [{ Name, Value }]
    const problems = (environment: Array<{ Name: string; Value: unknown }>) => [
      ...environment.filter(e => FORBIDDEN_NAMES.some(name => name.test(e.Name))).map(e => e.Name),
      ...environment.filter(e => typeof e.Value === 'string' && USERINFO_PASSWORD.test(e.Value)).map(e => e.Name),
    ]
    expect(problems(planted('TWILIO_API_KEY_SID', 'x'))).toEqual(['TWILIO_API_KEY_SID'])
    expect(problems(planted('SMS_PROVIDER', 'twilio'))).toEqual(['SMS_PROVIDER'])
    expect(problems(planted('DATABASE_URL', ['postgres://hearth_app:', 'x', '@h:5432/hearth'].join('')))).toEqual([
      'DATABASE_URL',
    ])
    for (const synth of [committed, active]) {
      for (const definition of definitionsOf(synth).values()) {
        for (const container of containersOf(definition)) {
          const secrets = (container.Secrets ?? []) as Array<{ Name: string; ValueFrom: unknown }>
          expect(
            problems([...(container.Environment ?? []), ...secrets.map(s => ({ Name: s.Name, Value: s.ValueFrom }))]),
            String(definition.properties.Family),
          ).toEqual([])
        }
      }
    }
  })

  it('IAC-09 T24 item 11 C11-D40: the hearth-role tag is exactly migrate, probe and bastion on those three, and the bastion alone runs an init process', () => {
    for (const definition of definitionsOf(committed).values()) {
      const family = String(definition.properties.Family)
      const kind = family.slice(family.lastIndexOf('-') + 1)
      const oneOff = (ONE_OFFS as readonly string[]).includes(kind)
      expect(definition.properties.Tags, family).toEqual(oneOff ? [{ Key: 'hearth-role', Value: kind }] : undefined)
      const [container] = containersOf(definition)
      expect(
        (container?.LinuxParameters as { InitProcessEnabled?: boolean } | undefined)?.InitProcessEnabled,
        family,
      ).toBe(kind === 'bastion' ? true : undefined)
      expect(container?.Privileged, family).toBeUndefined()
    }
  })

  it('IAC-09 C11-D53: a profile that gates the probe changes only its command’s argument, and adds no variable', () => {
    const gated = synthWorkload({ profiles: { prod: { readyGate: ['api', 'realtime', 'worker'] } } })
    const probe = definitionsOf(gated).get('hearth-prod-probe') as Definition
    const [container] = containersOf(probe)
    expect(container?.Command).toEqual(['node', 'src/deploy/ready-probe.ts', '--gate=api,realtime,worker'])
    expect(container?.Environment).toBeUndefined()
    const { ContainerDefinitions, ...rest } = renderedDefinition(probe)
    const { ContainerDefinitions: expected, ...expectedRest } = expectedDefinition('prod', 'probe')
    expect(rest).toEqual(expectedRest)
    expect(ContainerDefinitions).toEqual([
      { ...(expected as Array<Record<string, unknown>>)[0], Command: container?.Command },
    ])
    expect(definitionsOf(gated).get('hearth-nonprod-probe')?.properties.ContainerDefinitions).toEqual(
      definitionsOf(committed).get('hearth-nonprod-probe')?.properties.ContainerDefinitions,
    )
  }, 60_000)

  it('IAC-09 C11-D37: a profile with a database, or an SMS provider, is refused, so no placeholder deploys beside a real database or texts', () => {
    expect(() => synthWorkload({ profiles: { nonprod: { hasDatabase: true } } })).toThrow(
      'C0.12 moves the database URLs to secrets',
    )
    expect(() => synthWorkload({ profiles: { nonprod: { smsProvider: 'twilio' } } })).toThrow(
      'C0.12 adds SMS_PROVIDER and the TWILIO_ secrets',
    )
  }, 60_000)
})

// --- IAC-21: each environment passes the server's own check --------------------------------------

// Fictional values for what a container reads by reference: Valkey's host and, for the api, an
// AUTH_SECRET of 64 letters, built here.
const VALKEY_HOST = 'valkey.test.invalid'
const AUTH_SECRET = ['fictional', 'auth', 'secret'].join('-').padEnd(64, 'x')

// A service role's environment as its container would see it: the plain variables, references
// resolved to the fictional values, and the api's secret.
function environmentOf(
  synth: WorkloadSynth,
  env: EnvironmentName,
  role: (typeof ROLES)[number],
): Record<string, string> {
  const definition = definitionsOf(synth).get(`hearth-${env}-${role}`) as Definition
  const rendered = renderedDefinition(definition, {
    [['', 'hearth', env, 'valkey', 'endpoint'].join('/')]: VALKEY_HOST,
  })
  const [container] = rendered.ContainerDefinitions as Array<{ Environment: Record<string, string>; Secrets?: unknown }>
  return { ...container?.Environment, ...(container?.Secrets === undefined ? {} : { AUTH_SECRET }) }
}

describe('IAC-21 C11-D37 T18 item 6: each service role’s environment passes the server’s configuration check', () => {
  for (const [label, synth] of [
    ['committed', () => committed],
    ['restore-active', () => active],
  ] as const) {
    it.each(ENVIRONMENTS)(`IAC-21 %s (${label}): every role's environment loads, as the definition states it`, env => {
      for (const role of ROLES) {
        const environment = environmentOf(synth(), env, role)
        expect(environment.VALKEY_URL).toBe(`rediss://${VALKEY_HOST}:6379`)
        const config = loadConfig(environment)
        expect(
          {
            role: config.role,
            deployEnv: config.deployEnv,
            appOrigin: config.appOrigin,
            port: config.port,
            host: config.host,
          },
          `${env} ${role}`,
        ).toEqual({
          role,
          deployEnv: environment.DEPLOY_ENV,
          appOrigin: environment.APP_ORIGIN,
          port: 3000,
          host: '0.0.0.0',
        })
        expect(config.databaseUrl).toBe(environment.DATABASE_URL ?? environment.WORKER_DATABASE_URL)
        expect(config.auth === undefined, `${env} ${role}`).toBe(role !== 'api')
        expect(config.auth?.smsProvider).toBeUndefined()
        expect(config.trustProxy).toBe(false)
      }
    })
  }

  it('IAC-21 refuses, naming the variable, an environment without APP_ORIGIN, with DEPLOY_ENV staging, with VALKEY_URL http://x, realtime’s without S3_BUCKET, and the drill’s LOG_LEVEL', () => {
    const refusal = (environment: Record<string, string>) => {
      try {
        loadConfig(environment)
      } catch (error) {
        if (!(error instanceof ConfigError)) throw error
        return [...error.message.matchAll(/^ {2}(\w+):/gm)].map(([, name]) => name)
      }
      return []
    }
    const without = (environment: Record<string, string>, name: string) =>
      Object.fromEntries(Object.entries(environment).filter(([key]) => key !== name))
    const api = environmentOf(committed, 'nonprod', 'api')
    const realtime = environmentOf(committed, 'nonprod', 'realtime')
    expect(refusal(api)).toEqual([])
    expect(refusal(realtime)).toEqual([])
    expect(refusal(without(api, 'APP_ORIGIN'))).toEqual(['APP_ORIGIN'])
    expect(refusal({ ...api, DEPLOY_ENV: 'staging' })).toEqual(['DEPLOY_ENV'])
    expect(refusal({ ...api, VALKEY_URL: 'http://x' })).toEqual(['VALKEY_URL'])
    expect(refusal(without(realtime, 'S3_BUCKET'))).toEqual(['S3_BUCKET'])
    expect(refusal({ ...realtime, LOG_LEVEL: 'drill' })).toEqual(['LOG_LEVEL'])
  })
})

// --- C11-D39: the services -----------------------------------------------------------------------

// Each role's desired count per stage while live (C11-D28); restore's only under restoreActive.
const COUNTS: Readonly<Record<EnvironmentName, Readonly<Record<(typeof ROLES)[number], number>>>> = {
  nonprod: { api: 1, realtime: 2, worker: 1 },
  prod: { api: 2, realtime: 2, worker: 2 },
  restore: { api: 1, realtime: 2, worker: 1 },
}

describe('C11-D39: the ECS services', () => {
  it.each(ENVIRONMENTS)(
    'C11-D39 T24 item 15 %s: the cluster exactly, in Platform: named hearth-<env>, Container Insights off, and ECS Exec’s logging NONE, committed and with restoreActive set',
    env => {
      for (const synth of [committed, active]) {
        expect(
          ofType(templateOf(synth, env, 'Platform'), 'AWS::ECS::Cluster').map(([id, r]) => [id, propertiesOf(r)]),
        ).toEqual([
          [
            'Cluster',
            {
              ClusterName: `hearth-${env}`,
              ClusterSettings: [{ Name: 'containerInsights', Value: 'disabled' }],
              Configuration: { ExecuteCommandConfiguration: { Logging: 'NONE' } },
            },
          ],
        ])
      }
    },
  )

  for (const [label, synth, restoreLive] of [
    ['committed', () => committed, false],
    ['restore-active', () => active, true],
  ] as const) {
    it.each(ENVIRONMENTS)(
      `C11-D39 %s (${label}): each service exactly: Fargate on the latest platform in its cluster, its isolated subnets and own group with no public address, rolling at 100/200 with the circuit breaker rolling back, AZ rebalancing, no ECS Exec, its count, and a load balancer with a 30 s grace period on the api and realtime where the stage has one`,
      env => {
        const services = templateOf(synth(), env, 'Services')
        const definitions = Object.fromEntries(
          ofType(services, 'AWS::ECS::TaskDefinition').map(([id, r]) => [String(propertiesOf(r).Family), id]),
        )
        const live = env !== 'restore' || restoreLive
        const balanced = (role: string) => env !== 'restore' && role !== 'worker'
        expect(ofType(services, 'AWS::ECS::Service').map(([id, r]) => [id, render(propertiesOf(r), services)])).toEqual(
          ROLES.map(role => [
            `${role.charAt(0).toUpperCase()}${role.slice(1)}Service`,
            {
              AvailabilityZoneRebalancing: 'ENABLED',
              Cluster: `hearth-${env}`,
              DeploymentConfiguration: {
                DeploymentCircuitBreaker: { Enable: true, Rollback: true },
                MaximumPercent: 200,
                MinimumHealthyPercent: 100,
              },
              DesiredCount: live ? COUNTS[env][role] : 0,
              EnableExecuteCommand: false,
              ...(balanced(role) ? { HealthCheckGracePeriodSeconds: 30 } : {}),
              LaunchType: 'FARGATE',
              ...(balanced(role)
                ? {
                    LoadBalancers: [
                      { ContainerName: 'server', ContainerPort: 3000, TargetGroupArn: ssm(env, 'target-group', role) },
                    ],
                  }
                : {}),
              NetworkConfiguration: {
                AwsvpcConfiguration: {
                  AssignPublicIp: 'DISABLED',
                  SecurityGroups: [ssm(env, 'security-group', role)],
                  Subnets: ssm(env, 'network', 'isolated-subnets'),
                },
              },
              PlatformVersion: 'LATEST',
              ServiceName: `hearth-${env}-${role}`,
              TaskDefinition: { Ref: definitions[`hearth-${env}-${role}`] },
            },
          ]),
        )
      },
    )
  }

  it('C11-D39: the grace period is set exactly where a service has a load balancer, in both builds, so never on the worker or a restore service', () => {
    for (const synth of [committed, active]) {
      for (const [name, template] of Object.entries(synth.templates)) {
        for (const [id, service] of ofType(template, 'AWS::ECS::Service')) {
          const { LoadBalancers, HealthCheckGracePeriodSeconds } = propertiesOf(service)
          expect(HealthCheckGracePeriodSeconds === undefined, `${name} ${id}`).toBe(LoadBalancers === undefined)
          if (name.startsWith('Hearth-restore-') || id === 'WorkerService') {
            expect(LoadBalancers, `${name} ${id}`).toBeUndefined()
          }
        }
      }
    }
  })

  it('C11-D39: no workload template holds autoscaling', () => {
    for (const synth of [committed, active]) {
      const found = Object.entries(synth.templates).flatMap(([name, template]) =>
        resourcesIn(template)
          .filter(([, r]) => r.Type.startsWith('AWS::ApplicationAutoScaling::'))
          .map(([id]) => `${name} ${id}`),
      )
      expect(found).toEqual([])
    }
  })
})

// --- C11-D52's seams: the outputs ----------------------------------------------------------------

describe('C11-D52 C11-D61: what the pipeline and break-glass read', () => {
  it.each(ENVIRONMENTS)(
    'C11-D52 %s: the Tasks stack’s outputs are exactly the cluster, the isolated subnets comma-joined, the migrate and probe groups and definitions, and whether there is a database yet, none exported',
    env => {
      const tasks = templateOf(committed, env, 'Tasks')
      const outputs = tasks.Outputs as Record<string, { Value: unknown; Export?: unknown; Description?: string }>
      expect(Object.keys(outputs)).toEqual([
        'Cluster',
        'IsolatedSubnets',
        'MigrateSecurityGroup',
        'ProbeSecurityGroup',
        'MigrateTaskDefinition',
        'ProbeTaskDefinition',
        'HasDatabase',
      ])
      for (const [name, output] of Object.entries(outputs)) {
        expect(output.Export, name).toBeUndefined()
        expect(output.Description, name).toMatch(/\(C11-D\d{2}\)$/)
      }
      const definition = (kind: string) =>
        ofType(tasks, 'AWS::ECS::TaskDefinition').find(
          ([, r]) => propertiesOf(r).Family === `hearth-${env}-${kind}`,
        )?.[0]
      const subnets = outputs.IsolatedSubnets?.Value as { 'Fn::Join': [string, unknown] }
      expect(subnets['Fn::Join'][0]).toBe(',')
      expect(render(subnets['Fn::Join'][1], tasks)).toBe(ssm(env, 'network', 'isolated-subnets'))
      expect(
        Object.fromEntries(
          Object.entries(outputs)
            .filter(([name]) => name !== 'IsolatedSubnets')
            .map(([name, output]) => [name, render(output.Value, tasks)]),
        ),
      ).toEqual({
        Cluster: `hearth-${env}`,
        MigrateSecurityGroup: ssm(env, 'security-group', 'migrate'),
        ProbeSecurityGroup: ssm(env, 'security-group', 'probe'),
        MigrateTaskDefinition: { Ref: definition('migrate') },
        ProbeTaskDefinition: { Ref: definition('probe') },
        HasDatabase: 'false',
      })
    },
  )

  it.each(ENVIRONMENTS)(
    'C11-D61 %s: the Services stack’s one output is the release, <commit>:<digest>, never exported; Data and Platform have none',
    env => {
      expect(templateOf(committed, env, 'Services').Outputs).toEqual({
        Release: { Description: 'The release these services run, as <commit>:<digest> (C11-D61)', Value: RELEASE },
      })
      expect(templateOf(committed, env, 'Platform').Outputs).toBeUndefined()
      expect(templateOf(committed, env, 'Data').Outputs).toBeUndefined()
    },
  )
})
