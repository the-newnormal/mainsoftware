// The workload network's exact half (C11-D29, C11-D31, C11-D32; TECH-SPEC T24 items 13 and 28), over
// each stage's Platform template, committed and with restoreActive set:
// - IAC-03: no group carries a name; 443 from the internet reaches the load balancer's group alone; the
//   rules between the groups are exactly C11-D31's table, from each group's own side, with every peer
//   resolved to its group by the description that names it (restore's without the load balancer's
//   rows); every prefix-list peer is the Region's S3 list the profile names; the endpoints' and
//   Valkey's groups send nothing;
// - IAC-04: each stage's VPC and subnets at exactly their CIDRs (parsed) and AZs by Fn::GetAZs, no
//   route in an isolated table, the S3 gateway on exactly the isolated tables, one internet gateway
//   where there is a load balancer, and every service in its own stage's isolated subnets;
// - C11-D32: one flow log of all the VPC's traffic to /hearth/<env>/vpc-flow, through an unnamed role
//   only VPC Flow Logs may assume, for this account, that writes that group's streams alone;
// - the VPC's default-group handler (T24 item 28): one custom resource, its one function and that
//   function's role, which holds no managed policy, carries the boundary and may change only the
//   default group's rules, and no Lambda log group; confineDefaultSgHandler() refuses a stack it can't
//   read.
// The invariants every workload template keeps (no open egress, the placeholder on every group, the one
// route shape, no public address, the restore stage's isolation) are aspects/templates.test.ts's, on
// the owner's-read list; this file holds the exact rules, CIDRs and counts, which a reviewed change to
// the network edits. Expected values are literals, or joined from their parts here (IG-01), and ARNs
// are rendered with a made-up account. Each checker is proved on a planted copy of a real template
// first.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { beforeAll, describe, expect, it } from 'vitest'
import { ENVIRONMENTS, type EnvironmentName, PROFILES, REGION } from '../config/profiles.ts'
import { fixtureAccount } from '../testing/fixture.ts'
import { renderedString } from '../testing/policies.ts'
import { synthWorkload, type WorkloadSynth } from '../testing/workload.ts'
import { confineDefaultSgHandler } from './network.ts'

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
// The logical id a `{ Ref }` names, or a `{ Fn::GetAtt: [id, attribute] }` of the attribute given.
const refOf = (value: unknown): string | undefined =>
  isObject(value) && typeof value.Ref === 'string' ? value.Ref : undefined
function getAttOf(value: unknown, attribute: string): string | undefined {
  const getAtt = isObject(value) ? value['Fn::GetAtt'] : undefined
  return Array.isArray(getAtt) && getAtt[1] === attribute && typeof getAtt[0] === 'string' ? getAtt[0] : undefined
}
const tagOf = (resource: Resource, key: string): unknown =>
  ((propertiesOf(resource).Tags ?? []) as Array<{ Key: string; Value: unknown }>).find(tag => tag.Key === key)?.Value

// A made-up account the templates' pseudo-parameters render to, and ARNs joined from their parts.
const ACCOUNT = fixtureAccount(7)
const arn = (service: string, region: string, account: string, resource: string) =>
  ['arn', 'aws', service, region, account, resource].join(':')
// A value with every intrinsic renderedString can read rendered, for the made-up account.
function rendered(value: unknown, template: Template): unknown {
  const text = renderedString(value, { account: ACCOUNT, region: REGION, template })
  if (text !== undefined && typeof value !== 'string') return text
  if (Array.isArray(value)) return value.map(item => rendered(item, template))
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rendered(v, template)]))
  return value
}

// Each Platform template, committed and with restoreActive set.
let committed: WorkloadSynth
let active: WorkloadSynth
const platformOf = (synth: WorkloadSynth, env: EnvironmentName): Template => {
  const template = synth.templates[`Hearth-${env}-Platform`]
  if (template === undefined) throw new Error(`no Hearth-${env}-Platform`)
  return template
}
const builds = () =>
  [
    ['committed', committed],
    ['restore-active', active],
  ] as const

beforeAll(() => {
  committed = synthWorkload()
  active = synthWorkload({ run: { restoreActive: true } })
}, 60_000)

// --- IAC-03: the security groups and their rules -------------------------------------------------

// What each group is, as its description says it (C11-D31): `Hearth <env> <what> (C11-D31)`. A new
// description replaces the group, so the words are pinned here as well as read.
const GROUPS = {
  alb: 'load balancer in front of api and realtime',
  api: 'api tasks',
  realtime: 'realtime tasks',
  worker: 'worker tasks',
  migrate: 'migrate one-off tasks',
  probe: 'readiness probe one-off tasks',
  bastion: 'bastion task',
  endpoints: 'interface endpoints',
  valkey: 'Valkey',
} as const
type GroupKind = keyof typeof GROUPS

// C11-D31's table, each group's rules from its own side: `<direction> <protocol> <port> <peer>`, the
// peer a group, `s3` (the Region's S3 prefix list) or a CIDR. Every task reaches the interface
// endpoints and the S3 gateway on 443, since a Fargate task's own interface pulls its image, ships its
// logs and fetches its secrets.
const RULES: Readonly<Record<GroupKind, readonly string[]>> = {
  alb: ['ingress tcp 443 cidr 0.0.0.0/0', 'egress tcp 3000 api', 'egress tcp 3000 realtime'],
  api: [
    'ingress tcp 3000 alb',
    'ingress tcp 3000 probe',
    'egress tcp 443 endpoints',
    'egress tcp 443 s3',
    'egress tcp 6379 valkey',
  ],
  realtime: [
    'ingress tcp 3000 alb',
    'ingress tcp 3000 probe',
    'egress tcp 443 endpoints',
    'egress tcp 443 s3',
    'egress tcp 6379 valkey',
  ],
  worker: ['ingress tcp 3000 probe', 'egress tcp 443 endpoints', 'egress tcp 443 s3', 'egress tcp 6379 valkey'],
  migrate: ['egress tcp 443 endpoints', 'egress tcp 443 s3'],
  probe: [
    'egress tcp 3000 api',
    'egress tcp 3000 realtime',
    'egress tcp 3000 worker',
    'egress tcp 443 endpoints',
    'egress tcp 443 s3',
  ],
  bastion: ['egress tcp 443 endpoints', 'egress tcp 443 s3'],
  endpoints: [
    'ingress tcp 443 api',
    'ingress tcp 443 realtime',
    'ingress tcp 443 worker',
    'ingress tcp 443 migrate',
    'ingress tcp 443 probe',
    'ingress tcp 443 bastion',
  ],
  valkey: ['ingress tcp 6379 api', 'ingress tcp 6379 realtime', 'ingress tcp 6379 worker'],
}

// A stage's rules as `<group> <rule>`, sorted: the restore stage has no load balancer, so neither its
// group nor any rule naming it (C11-D45).
function expectedRules(env: EnvironmentName): string[] {
  const alb = env !== 'restore'
  return Object.entries(RULES)
    .filter(([group]) => alb || group !== 'alb')
    .flatMap(([group, rules]) => rules.filter(rule => alb || !rule.endsWith(' alb')).map(rule => `${group} ${rule}`))
    .sort()
}

// EC2's placeholder egress rule, which leaves a group sending nothing (written here as CloudFormation
// renders it; the invariant that every group carries it alone is templates.test.ts's).
const NO_TRAFFIC = {
  CidrIp: '255.255.255.255/32',
  Description: 'Disallow all traffic',
  FromPort: 252,
  IpProtocol: 'icmp',
  ToPort: 86,
}

// Each security group's kind, by its logical id, read from its description; a group whose description
// is no stage's gets `?<logical id>`, so its rules show as unexpected.
function groupsOf(template: Template, env: EnvironmentName): Map<string, string> {
  const byDescription = new Map<string, string>(
    Object.entries(GROUPS).map(([kind, what]) => [`Hearth ${env} ${what} (C11-D31)`, kind]),
  )
  return new Map(
    ofType(template, 'AWS::EC2::SecurityGroup').map(([id, r]) => [
      id,
      byDescription.get(String(propertiesOf(r).GroupDescription)) ?? `?${id}`,
    ]),
  )
}

// Every rule a Platform template holds, inline on a group (but the placeholder) or as its own
// resource, as `<group> <direction> <protocol> <port> <peer>`, sorted.
function rulesOf(template: Template, env: EnvironmentName): string[] {
  const groups = groupsOf(template, env)
  const group = (value: unknown) => {
    const id = getAttOf(value, 'GroupId')
    return id === undefined ? `?${JSON.stringify(value)}` : (groups.get(id) ?? `?${id}`)
  }
  const peer = (rule: Record<string, unknown>, side: 'Source' | 'Destination') => {
    if (rule.CidrIp !== undefined) return `cidr ${String(rule.CidrIp)}`
    if (rule.CidrIpv6 !== undefined) return `cidr ${String(rule.CidrIpv6)}`
    const prefixList = rule[`${side}PrefixListId`]
    if (prefixList !== undefined)
      return prefixList === PROFILES[env].s3PrefixList ? 's3' : `prefix list ${String(prefixList)}`
    const peerGroup = rule[`${side}SecurityGroupId`]
    return peerGroup === undefined ? '?' : group(peerGroup)
  }
  const port = (rule: Record<string, unknown>) =>
    rule.FromPort === rule.ToPort ? String(rule.FromPort) : `${String(rule.FromPort)}-${String(rule.ToPort)}`
  const line = (owner: string, direction: string, rule: Record<string, unknown>, side: 'Source' | 'Destination') =>
    `${owner} ${direction} ${String(rule.IpProtocol)} ${port(rule)} ${peer(rule, side)}`
  const found: string[] = []
  for (const [id, r] of ofType(template, 'AWS::EC2::SecurityGroup')) {
    const owner = groups.get(id) ?? `?${id}`
    const inline = (key: string) => (propertiesOf(r)[key] ?? []) as Array<Record<string, unknown>>
    for (const rule of inline('SecurityGroupIngress')) found.push(line(owner, 'ingress', rule, 'Source'))
    for (const rule of inline('SecurityGroupEgress')) {
      if (!isDeepStrictEqual(rule, NO_TRAFFIC)) found.push(line(owner, 'egress', rule, 'Destination'))
    }
  }
  for (const [, r] of ofType(template, 'AWS::EC2::SecurityGroupIngress')) {
    found.push(line(group(propertiesOf(r).GroupId), 'ingress', propertiesOf(r), 'Source'))
  }
  for (const [, r] of ofType(template, 'AWS::EC2::SecurityGroupEgress')) {
    found.push(line(group(propertiesOf(r).GroupId), 'egress', propertiesOf(r), 'Destination'))
  }
  return found.sort()
}

// IAC-03's exact rule set, as problems: each rule the template holds beyond the stage's table, each
// one of the table it lacks, and each held twice.
function ruleProblems(template: Template, env: EnvironmentName): string[] {
  const rules = rulesOf(template, env)
  const expected = expectedRules(env)
  return [
    ...rules.filter(rule => !expected.includes(rule)).map(rule => `unexpected: ${rule}`),
    ...expected.filter(rule => !rules.includes(rule)).map(rule => `missing: ${rule}`),
    ...rules.filter((rule, i) => rules.indexOf(rule) !== i).map(rule => `twice: ${rule}`),
  ]
}

// Every ingress from anywhere on the internet, inline or its own resource, as `<group> <protocol> <port>`.
function openIngress(template: Template, env: EnvironmentName): string[] {
  return rulesOf(template, env)
    .filter(rule => / ingress .* cidr (?:0\.0\.0\.0\/0|::\/0)$/.test(rule))
    .map(rule => rule.replace(/ ingress /, ' ').replace(/ cidr .*$/, ''))
}

// A copy of a template with its resources edited.
function planted(template: Template, edit: (resources: Record<string, Resource>) => void): Template {
  const copy = structuredClone(template)
  edit(copy.Resources as Record<string, Resource>)
  return copy
}
// A group's logical id in a template, by its kind.
function groupId(template: Template, env: EnvironmentName, kind: GroupKind): string {
  const found = [...groupsOf(template, env)].filter(([, k]) => k === kind)
  if (found.length !== 1 || found[0] === undefined) throw new Error(`${found.length} ${kind} groups, not one`)
  return found[0][0]
}

describe('IAC-03 C11-D31: the security groups, exactly', () => {
  it('IAC-03 finds an extra 5432 rule, a missing ApiToEndpoints and a second 0.0.0.0/0 ingress, planted in copies of non-prod’s Platform', () => {
    const template = platformOf(committed, 'nonprod')
    expect(ruleProblems(template, 'nonprod')).toEqual([])
    const groupAt = (kind: GroupKind) => ({ 'Fn::GetAtt': [groupId(template, 'nonprod', kind), 'GroupId'] })

    const extra = planted(template, resources => {
      resources.PlantedMigrateToValkey = {
        Type: 'AWS::EC2::SecurityGroupEgress',
        Properties: {
          GroupId: groupAt('migrate'),
          DestinationSecurityGroupId: groupAt('valkey'),
          IpProtocol: 'tcp',
          FromPort: 5432,
          ToPort: 5432,
          Description: 'planted',
        },
      }
    })
    expect(ruleProblems(extra, 'nonprod')).toEqual(['unexpected: migrate egress tcp 5432 valkey'])

    const missing = planted(template, resources => {
      const [id] =
        Object.entries(resources).find(
          ([, r]) =>
            r.Type === 'AWS::EC2::SecurityGroupEgress' &&
            isDeepStrictEqual(propertiesOf(r).GroupId, groupAt('api')) &&
            isDeepStrictEqual(propertiesOf(r).DestinationSecurityGroupId, groupAt('endpoints')),
        ) ?? []
      if (id === undefined) throw new Error('no ApiToEndpoints')
      delete resources[id]
    })
    expect(ruleProblems(missing, 'nonprod')).toEqual(['missing: api egress tcp 443 endpoints'])

    const open = planted(template, resources => {
      const api = resources[groupId(template, 'nonprod', 'api')]
      if (api?.Properties === undefined) throw new Error('no api group')
      api.Properties.SecurityGroupIngress = [{ CidrIp: '0.0.0.0/0', IpProtocol: 'tcp', FromPort: 3000, ToPort: 3000 }]
    })
    expect(ruleProblems(open, 'nonprod')).toEqual(['unexpected: api ingress tcp 3000 cidr 0.0.0.0/0'])
    expect(openIngress(open, 'nonprod')).toEqual(['alb tcp 443', 'api tcp 3000'])
  })

  for (const [label, synth] of [
    ['committed', () => committed],
    ['restore-active', () => active],
  ] as const) {
    it.each(ENVIRONMENTS)(
      `IAC-03 %s (${label}): the rules are exactly C11-D31's table, from each group's side`,
      env => {
        const template = platformOf(synth(), env)
        expect(rulesOf(template, env)).toEqual(expectedRules(env))
        expect(ruleProblems(template, env)).toEqual([])
      },
    )
  }

  it.each(ENVIRONMENTS)(
    'IAC-03 %s: nine groups (eight in restore), none named, each described; 20 egress and 14 ingress rules of their own (18 and 12 in restore), each described',
    env => {
      const template = platformOf(committed, env)
      const groups = ofType(template, 'AWS::EC2::SecurityGroup')
      const kinds = [...groupsOf(template, env).values()].sort()
      expect(kinds).toEqual(
        (Object.keys(GROUPS) as GroupKind[]).filter(kind => env !== 'restore' || kind !== 'alb').sort(),
      )
      expect(groups.length).toBe(env === 'restore' ? 8 : 9)
      for (const [id, group] of groups) expect(propertiesOf(group).GroupName, id).toBeUndefined()
      const egress = ofType(template, 'AWS::EC2::SecurityGroupEgress')
      const ingress = ofType(template, 'AWS::EC2::SecurityGroupIngress')
      expect([egress.length, ingress.length]).toEqual(env === 'restore' ? [18, 12] : [20, 14])
      for (const [id, rule] of [...egress, ...ingress]) {
        expect(String(propertiesOf(rule).Description ?? ''), id).toMatch(/\(C11-D31\)$/)
      }
    },
  )

  it.each(ENVIRONMENTS)(
    'IAC-03 %s: 0.0.0.0/0 reaches only the load balancer’s group, on tcp 443 (none in restore)',
    env => {
      for (const [, synth] of builds()) {
        expect(openIngress(platformOf(synth, env), env)).toEqual(env === 'restore' ? [] : ['alb tcp 443'])
      }
    },
  )

  it.each(ENVIRONMENTS)(
    'IAC-03 %s: every prefix-list peer is the Region’s S3 list the profile names, and the endpoints’ and Valkey’s groups send nothing',
    env => {
      const template = platformOf(committed, env)
      const lists = [
        ...ofType(template, 'AWS::EC2::SecurityGroupEgress').map(([, r]) => propertiesOf(r).DestinationPrefixListId),
        ...ofType(template, 'AWS::EC2::SecurityGroupIngress').map(([, r]) => propertiesOf(r).SourcePrefixListId),
      ].filter(list => list !== undefined)
      expect(lists).toHaveLength(6)
      expect(new Set(lists)).toEqual(new Set([PROFILES[env].s3PrefixList]))
      expect(rulesOf(template, env).filter(rule => /^(?:endpoints|valkey) egress /.test(rule))).toEqual([])
    },
  )
})

// --- IAC-04: the VPC, its subnets and routes -----------------------------------------------------

// A CIDR block, parsed: its network address as a number and its prefix length. A host bit set, or
// anything that isn't dotted IPv4 and a prefix, throws.
function parseCidr(text: string): { network: number; prefix: number } {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(text)
  if (match === null) throw new Error(`${text} isn't an IPv4 CIDR`)
  const octets = match.slice(1, 5).map(Number)
  const prefix = Number(match[5])
  if (octets.some(octet => octet > 255) || prefix > 32) throw new Error(`${text} is out of range`)
  const network = octets.reduce((total, octet) => total * 256 + octet, 0)
  if (network % 2 ** (32 - prefix) !== 0) throw new Error(`${text} has a host bit set`)
  return { network, prefix }
}

// Each stage's VPC and subnets (C11-D29): `<subnet group> <CIDR> <AZ index>`. C0.12 appends its egress
// group after these, so none of them moves.
const VPCS: Readonly<Record<EnvironmentName, string>> = {
  nonprod: '10.20.0.0/16',
  prod: '10.30.0.0/16',
  restore: '10.40.0.0/16',
}
const SUBNETS: Readonly<Record<EnvironmentName, readonly string[]>> = {
  nonprod: ['public 10.20.0.0/24 0', 'public 10.20.1.0/24 1', 'isolated 10.20.16.0/20 0', 'isolated 10.20.32.0/20 1'],
  prod: ['public 10.30.0.0/24 0', 'public 10.30.1.0/24 1', 'isolated 10.30.16.0/20 0', 'isolated 10.30.32.0/20 1'],
  restore: ['isolated 10.40.0.0/20 0', 'isolated 10.40.16.0/20 1'],
}

interface Subnet {
  id: string
  group: unknown
  cidr: { network: number; prefix: number }
  az: number | undefined
}
// Each subnet a template holds: its subnet group (the subnet-name tag aws-cdk-lib writes), its CIDR
// parsed, and the AZ it takes, when it takes it by index from Fn::GetAZs '' (never a lookup).
function subnetsOf(template: Template): Subnet[] {
  return ofType(template, 'AWS::EC2::Subnet').map(([id, r]) => {
    const select = propertiesOf(r).AvailabilityZone
    const args = isObject(select) ? select['Fn::Select'] : undefined
    const byIndex =
      Array.isArray(args) &&
      typeof args[0] === 'number' &&
      isDeepStrictEqual(args[1], { 'Fn::GetAZs': '' }) &&
      Object.keys(select as object).length === 1
    return {
      id,
      group: tagOf(r, 'aws-cdk:subnet-name'),
      cidr: parseCidr(String(propertiesOf(r).CidrBlock)),
      az: byIndex ? (args[0] as number) : undefined,
    }
  })
}
const expectedSubnets = (env: EnvironmentName) =>
  SUBNETS[env].map(line => {
    const [group, cidr = '', az] = line.split(' ')
    return { group, cidr: parseCidr(cidr), az: Number(az) }
  })

// The route tables of a template whose every associated subnet is of one subnet group.
function routeTablesOf(template: Template, group: string): string[] {
  const groupOf = new Map(subnetsOf(template).map(subnet => [subnet.id, subnet.group]))
  const tables = new Map<string, unknown[]>()
  for (const [, r] of ofType(template, 'AWS::EC2::SubnetRouteTableAssociation')) {
    const table = refOf(propertiesOf(r).RouteTableId) ?? '?'
    tables.set(table, [...(tables.get(table) ?? []), groupOf.get(refOf(propertiesOf(r).SubnetId) ?? '')])
  }
  return [...tables]
    .filter(([, groups]) => groups.length > 0 && groups.every(g => g === group))
    .map(([table]) => table)
    .sort()
}
const vpcIdOf = (template: Template) => ofType(template, 'AWS::EC2::VPC')[0]?.[0] ?? ''

describe('IAC-04 C11-D29: the VPC, its subnets and routes, exactly', () => {
  it('IAC-04 parses a CIDR, refusing a host bit, a wrong shape and an out-of-range octet', () => {
    expect(parseCidr('10.20.16.0/20')).toEqual({ network: (10 * 256 + 20) * 65_536 + 16 * 256, prefix: 20 })
    expect(() => parseCidr('10.20.17.0/20')).toThrow('host bit')
    expect(() => parseCidr('10.20.0/20')).toThrow("isn't an IPv4 CIDR")
    expect(() => parseCidr('10.20.256.0/24')).toThrow('out of range')
  })

  it.each(ENVIRONMENTS)(
    'IAC-04 %s: one VPC at its CIDR, and its subnets exactly at theirs, each in an AZ by Fn::GetAZs, inside the VPC',
    env => {
      for (const [label, synth] of builds()) {
        const template = platformOf(synth, env)
        const vpcs = ofType(template, 'AWS::EC2::VPC')
        expect(
          vpcs.map(([, r]) => parseCidr(String(propertiesOf(r).CidrBlock))),
          label,
        ).toEqual([parseCidr(VPCS[env])])
        const subnets = subnetsOf(template)
        const sorted = (list: Array<{ group: unknown; cidr: { network: number }; az: number | undefined }>) =>
          [...list].sort((a, b) => a.cidr.network - b.cidr.network)
        expect(
          sorted(subnets).map(({ group, cidr, az }) => ({ group, cidr, az })),
          label,
        ).toEqual(sorted(expectedSubnets(env)))
        const vpc = parseCidr(VPCS[env])
        for (const { id, cidr } of subnets) {
          const inside =
            cidr.prefix >= vpc.prefix &&
            Math.floor(cidr.network / 2 ** (32 - vpc.prefix)) === vpc.network / 2 ** (32 - vpc.prefix)
          expect(inside, `${env} ${id}`).toBe(true)
        }
      }
    },
  )

  it.each(ENVIRONMENTS)(
    'IAC-04 %s: no isolated route table holds a route, and the S3 gateway endpoint is on exactly the isolated tables',
    env => {
      for (const [label, synth] of builds()) {
        const template = platformOf(synth, env)
        const isolated = routeTablesOf(template, 'isolated')
        expect(isolated, label).toHaveLength(2)
        const routed = ofType(template, 'AWS::EC2::Route').map(([, r]) => refOf(propertiesOf(r).RouteTableId))
        expect(
          routed.filter(table => table !== undefined && isolated.includes(table)),
          label,
        ).toEqual([])
        const gateways = ofType(template, 'AWS::EC2::VPCEndpoint').filter(
          ([, r]) => propertiesOf(r).VpcEndpointType === 'Gateway',
        )
        expect(gateways, label).toHaveLength(1)
        const tables = (propertiesOf(gateways[0]?.[1]).RouteTableIds ?? []) as unknown[]
        expect(tables.map(refOf).sort(), label).toEqual(isolated)
      }
    },
  )

  it.each(['nonprod', 'prod'] as const)(
    'IAC-04 %s: one internet gateway, attached to the VPC, and each public table’s one route 0.0.0.0/0 to it',
    env => {
      const template = platformOf(committed, env)
      const gateways = ofType(template, 'AWS::EC2::InternetGateway')
      expect(gateways).toHaveLength(1)
      const gateway = gateways[0]?.[0]
      expect(ofType(template, 'AWS::EC2::VPCGatewayAttachment').map(([, r]) => propertiesOf(r))).toEqual([
        { VpcId: { Ref: vpcIdOf(template) }, InternetGatewayId: { Ref: gateway } },
      ])
      const publicTables = routeTablesOf(template, 'public')
      expect(publicTables).toHaveLength(2)
      expect(
        ofType(template, 'AWS::EC2::Route')
          .map(([, r]) => propertiesOf(r))
          .sort((a, b) => String(refOf(a.RouteTableId)).localeCompare(String(refOf(b.RouteTableId)))),
      ).toEqual(
        publicTables.map(table => ({
          DestinationCidrBlock: '0.0.0.0/0',
          GatewayId: { Ref: gateway },
          RouteTableId: { Ref: table },
        })),
      )
    },
  )

  it.each(ENVIRONMENTS)(
    'IAC-04 C11-D39 %s: every service runs in its own stage’s isolated subnets, by the parameter Platform writes from them',
    env => {
      for (const [label, synth] of builds()) {
        const platform = platformOf(synth, env)
        const name = ['', 'hearth', env, 'network', 'isolated-subnets'].join('/')
        const written = ofType(platform, 'AWS::SSM::Parameter').filter(([, r]) => propertiesOf(r).Name === name)
        expect(written, label).toHaveLength(1)
        const value = propertiesOf(written[0]?.[1]).Value as { 'Fn::Join': [string, unknown[]] }
        expect(value['Fn::Join'][0], label).toBe(',')
        expect(value['Fn::Join'][1].map(refOf).sort(), label).toEqual(
          subnetsOf(platform)
            .filter(subnet => subnet.group === 'isolated')
            .map(subnet => subnet.id)
            .sort(),
        )
        expect(propertiesOf(written[0]?.[1]).Type).toBe('StringList')

        const services = synth.templates[`Hearth-${env}-Services`] ?? {}
        const parameters = (services.Parameters ?? {}) as Record<string, { Type: string; Default: string }>
        const ecs = ofType(services, 'AWS::ECS::Service')
        expect(ecs, label).toHaveLength(3)
        for (const [id, service] of ecs) {
          const network = propertiesOf(service).NetworkConfiguration as {
            AwsvpcConfiguration: { Subnets: unknown }
          }
          const parameter = parameters[refOf(network.AwsvpcConfiguration.Subnets) ?? '']
          expect(parameter, `${label} ${id}`).toEqual({
            Type: 'AWS::SSM::Parameter::Value<List<String>>',
            Default: name,
          })
        }
      }
    },
  )
})

// --- C11-D32: the flow log -----------------------------------------------------------------------

describe('C11-D32: the VPC’s flow log', () => {
  it.each(ENVIRONMENTS)(
    'C11-D32 %s: one flow log of all the VPC’s traffic, every ten minutes, to /hearth/<env>/vpc-flow',
    env => {
      const template = platformOf(committed, env)
      const logs = ofType(template, 'AWS::EC2::FlowLog')
      expect(logs).toHaveLength(1)
      const groupName = ['', 'hearth', env, 'vpc-flow'].join('/')
      const groups = ofType(template, 'AWS::Logs::LogGroup').filter(
        ([, r]) => propertiesOf(r).LogGroupName === groupName,
      )
      expect(groups).toHaveLength(1)
      const roles = ofType(template, 'AWS::IAM::Role').filter(([, r]) =>
        JSON.stringify(propertiesOf(r).AssumeRolePolicyDocument).includes('vpc-flow-logs.amazonaws.com'),
      )
      expect(roles).toHaveLength(1)
      expect(propertiesOf(logs[0]?.[1])).toEqual({
        DeliverLogsPermissionArn: { 'Fn::GetAtt': [roles[0]?.[0], 'Arn'] },
        LogDestinationType: 'cloud-watch-logs',
        LogGroupName: { Ref: groups[0]?.[0] },
        MaxAggregationInterval: 600,
        ResourceId: { Ref: vpcIdOf(template) },
        ResourceType: 'VPC',
        TrafficType: 'ALL',
      })
    },
  )

  it.each(ENVIRONMENTS)(
    'C11-D32 %s: its role is unnamed, bounded, trusted by VPC Flow Logs for this account’s own flow logs alone, and writes that group’s streams alone',
    env => {
      const template = platformOf(committed, env)
      const [role] = ofType(template, 'AWS::IAM::Role').filter(([, r]) =>
        JSON.stringify(propertiesOf(r).AssumeRolePolicyDocument).includes('vpc-flow-logs.amazonaws.com'),
      )
      const group = arn('logs', REGION, ACCOUNT, `log-group:${['', 'hearth', env, 'vpc-flow'].join('/')}`)
      expect(rendered(propertiesOf(role?.[1]), template)).toEqual({
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'VpcFlowLogs',
              Effect: 'Allow',
              Principal: { Service: 'vpc-flow-logs.amazonaws.com' },
              Action: 'sts:AssumeRole',
              Condition: {
                StringEquals: { 'aws:SourceAccount': ACCOUNT },
                ArnLike: { 'aws:SourceArn': arn('ec2', REGION, ACCOUNT, 'vpc-flow-log/*') },
              },
            },
          ],
        },
        PermissionsBoundary: arn('iam', '', ACCOUNT, 'policy/hearth-boundary'),
        Policies: [
          {
            PolicyName: 'hearth-flow-log',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Sid: 'DeliverFlowLogs',
                  Effect: 'Allow',
                  Action: ['logs:CreateLogStream', 'logs:DescribeLogStreams', 'logs:PutLogEvents'],
                  Resource: [group, `${group}:*`],
                },
              ],
            },
          },
        ],
      })
    },
  )
})

// --- The default-group handler (TECH-SPEC T24 item 28) -------------------------------------------

// The custom resource aws-cdk-lib's restrictDefaultSecurityGroup makes, the one infra may hold (IG-11).
const DEFAULT_GROUP_RESOURCE = 'Custom::VpcRestrictDefaultSG'
const HANDLER_ACTIONS = [
  'ec2:AuthorizeSecurityGroupIngress',
  'ec2:AuthorizeSecurityGroupEgress',
  'ec2:RevokeSecurityGroupIngress',
  'ec2:RevokeSecurityGroupEgress',
]

describe('T24 item 28: the VPC’s default-group handler', () => {
  for (const [label, synth] of [
    ['committed', () => committed],
    ['restore-active', () => active],
  ] as const) {
    it.each(ENVIRONMENTS)(
      `T24 item 28 %s (${label}): one custom resource, its one function and that function's role, with no managed policy, the boundary, and rights on the default group's rules alone`,
      env => {
        const template = platformOf(synth(), env)
        const custom = ofType(template, DEFAULT_GROUP_RESOURCE)
        const functions = ofType(template, 'AWS::Lambda::Function')
        expect(custom).toHaveLength(1)
        expect(functions).toHaveLength(1)
        const handler = functions[0]?.[0] ?? ''
        expect(getAttOf(propertiesOf(custom[0]?.[1]).ServiceToken, 'Arn')).toBe(handler)
        expect(propertiesOf(custom[0]?.[1]).DefaultSecurityGroupId).toEqual({
          'Fn::GetAtt': [vpcIdOf(template), 'DefaultSecurityGroup'],
        })
        const roleId = getAttOf(propertiesOf(functions[0]?.[1]).Role, 'Arn') ?? ''
        const role = resourcesIn(template).find(([id]) => id === roleId)?.[1]
        expect(role?.Type).toBe('AWS::IAM::Role')
        expect(propertiesOf(role).ManagedPolicyArns).toBeUndefined()
        expect(propertiesOf(role).RoleName).toBeUndefined()
        const properties = rendered(propertiesOf(role), template) as Record<string, unknown>
        expect(properties.PermissionsBoundary).toBe(arn('iam', '', ACCOUNT, 'policy/hearth-boundary'))
        expect(properties.AssumeRolePolicyDocument).toEqual({
          Version: '2012-10-17',
          Statement: [{ Action: 'sts:AssumeRole', Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' } }],
        })
        // The default group's id is the VPC's attribute, which no rendering fixes, so the ARN is read
        // as joined, its account rendered.
        expect(properties.Policies).toEqual([
          {
            PolicyName: 'Inline',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: HANDLER_ACTIONS,
                  Resource: [
                    {
                      'Fn::Join': [
                        '',
                        [
                          `${['arn', 'aws', 'ec2', REGION].join(':')}:`,
                          ACCOUNT,
                          ':security-group/',
                          { 'Fn::GetAtt': [vpcIdOf(template), 'DefaultSecurityGroup'] },
                        ],
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ])
        expect(
          ofType(template, 'AWS::Logs::LogGroup').filter(([, r]) =>
            String(propertiesOf(r).LogGroupName).startsWith('/aws/lambda/'),
          ),
        ).toEqual([])
      },
    )
  }

  // A stack holding a made-up provider: some functions and some roles beside them, each a raw
  // resource as aws-cdk-lib's provider makes them.
  function providerStack(functions: number, roles: number): { app: cdk.App; stack: cdk.Stack } {
    const app = new cdk.App({ outdir: mkdtempSync(join(tmpdir(), 'hearth-planted-')) })
    const stack = new cdk.Stack(app, 'Planted', { env: { region: REGION } })
    const provider = new Construct(stack, 'Provider')
    for (let i = 0; i < functions; i += 1) {
      new cdk.CfnResource(provider, `Handler${i}`, { type: 'AWS::Lambda::Function', properties: {} })
    }
    for (let i = 0; i < roles; i += 1) {
      new cdk.CfnResource(provider, `Role${i}`, {
        type: 'AWS::IAM::Role',
        properties: { ManagedPolicyArns: ['planted'] },
      })
    }
    return { app, stack }
  }

  it('T24 item 28: confineDefaultSgHandler() refuses a stack with no function, two functions, no role beside it or two, and takes the managed policy off the one role', () => {
    expect(() => confineDefaultSgHandler(providerStack(0, 1).stack)).toThrow('holds 0 Lambda functions')
    expect(() => confineDefaultSgHandler(providerStack(2, 1).stack)).toThrow('holds 2 Lambda functions')
    expect(() => confineDefaultSgHandler(providerStack(1, 0).stack)).toThrow('has 0 roles beside it, not one')
    expect(() => confineDefaultSgHandler(providerStack(1, 2).stack)).toThrow('has 2 roles beside it, not one')
    const { app, stack } = providerStack(1, 1)
    confineDefaultSgHandler(stack)
    const template = app.synth().getStackByName(stack.stackName).template as Template
    const [role] = ofType(template, 'AWS::IAM::Role')
    expect(role?.[1].Properties ?? {}).toEqual({})
  })
})
