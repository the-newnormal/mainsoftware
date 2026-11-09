// IAC-15 and IAC-16 (C11-D70; TECH-SPEC T24 item 28): the landing zone's and the workload's two
// template checks and the exceptions they keep.
// - IAC-15 runs cdk-nag 3.0.2's AwsSolutions pack over each landing-zone stack and each workload stack,
//   of every build the pipeline deploys: the committed one, the one with restoreActive set (whose
//   restore stage holds Valkey) and the drill's (the non-prod stage alone, C11-D59), here alone
//   (cdk-nag is a devDependency no entry loads), and expects nothing left once NAG_ALLOWANCES has
//   removed the findings it keeps, each matched by its rule (the finding's name before any bracket)
//   and its violating resource's construct path, one resource at a time, since one finding can list
//   several. cdk-nag reads each resource's properties, not its template, so no build holds an override
//   that could make the template hold what it doesn't read: only an SCP's Content written as its own
//   document, an IAM role's permissions boundary (aws-cdk-lib's aspect) and an IAM role's managed
//   policies taken away (the default group's handler).
// - IAC-16 holds each allowance, and each CloudFormation Validate acknowledgement acknowledgeValidate()
//   applies, to the same rules: a rule or id of the right shape; a reason of at least 20 characters
//   citing the C11 decision that keeps it; a path that is exactly one resource, never a stack or the
//   app, so nothing is kept in bulk; no entry twice; and each one used, so a stale one fails. An
//   allowance is held over the four builds together: its path is one resource in a build that holds
//   it, and some build's findings use it. A Validate acknowledgement is used when the synth's
//   validation report lists the finding it suppressed; one raised on a stack can't name a resource,
//   so it is fixed rather than kept. The workload keeps none: Validate runs over its stacks (proved on
//   a planted finding, which a warning reports without failing the synth) and finds nothing.
// - acknowledgeValidate() applies an acknowledgement only in a run that builds its stack, since a
//   person's run builds one target, and refuses one whose path names neither a landing-zone stack nor
//   a workload stage's stack in any run.
// - No acknowledgement escapes the list: in infra/, only nag.ts and the bootstrap template's generator
//   acknowledge a Validate finding, only this file names the metadata key acknowledgements are kept
//   under, and no construct of any build acknowledges an AwsSolutions rule there, which cdk-nag would
//   leave out (on the resource or any construct above it).
// Each rule is proved on planted lists first. This file holds the rules every exception is held to, so
// it is on the owner's-read list (C11-D74).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import * as cdk from 'aws-cdk-lib'
import * as elasticache from 'aws-cdk-lib/aws-elasticache'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as organizations from 'aws-cdk-lib/aws-organizations'
import { AwsSolutionsChecks } from 'cdk-nag'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { REGION } from '../config/profiles.ts'
import { addLandingZone } from '../foundation/landing-zone.ts'
import { fixtureConfig } from '../testing/fixture.ts'
import { type LandingZoneSynth, synthLandingZone } from '../testing/landing-zone.ts'
import { synthesise, testApp } from '../testing/synth.ts'
import { synthWorkload, type WorkloadSynth } from '../testing/workload.ts'
import { addWorkload, fakeRelease } from '../workload/stage.ts'
import {
  acknowledgeValidate,
  NAG_ALLOWANCES,
  type NagAllowance,
  VALIDATE_ACKNOWLEDGEMENTS,
  type ValidateAcknowledgement,
} from './nag.ts'

let lz: LandingZoneSynth
// The workload in each build the pipeline deploys: committed, with restoreActive set (C11-D45), and the
// drill's (C11-D59).
let workload: WorkloadSynth
let active: WorkloadSynth
let drill: WorkloadSynth
// The four builds every allowance is held over.
const apps = () => [lz.app, workload.app, active.app, drill.app]

beforeAll(() => {
  lz = synthLandingZone()
  workload = synthWorkload()
  active = synthWorkload({ run: { restoreActive: true } })
  drill = synthWorkload({ run: { drill: true } })
}, 60_000)

// One cdk-nag finding on one resource: its rule without the bracketed detail, and the resource's path.
interface Finding {
  rule: string
  path: string
}

// Every AwsSolutions finding in an app's stacks, its stages' included, resource by resource, worked out
// once per app.
const findingsOf = new WeakMap<cdk.App, Finding[]>()
function nagFindings(app: cdk.App): Finding[] {
  const known = findingsOf.get(app)
  if (known !== undefined) return known
  const found = app.node
    .findAll()
    .filter(cdk.Stack.isStack)
    .flatMap(stack =>
      new AwsSolutionsChecks().validateScope(stack).violations.flatMap(violation =>
        violation.violatingResources.map(resource => ({
          rule: violation.ruleName.replace(/\[.*$/, ''),
          path: resource.constructPath ?? `${stack.node.path}/${resource.resourceLogicalId ?? '(no id)'}`,
        })),
      ),
    )
  findingsOf.set(app, found)
  return found
}

const allowed = (finding: Finding, list: readonly NagAllowance[]) =>
  list.some(allowance => allowance.rule === finding.rule && allowance.path === finding.path)

// --- IAC-16's rules, shared by both lists ----------------------------------------------------------

const NAG_RULE = /^AwsSolutions-[A-Z]+\d+$/
const VALIDATE_ID = /^CloudFormation-Validate::[EFW]\d+$/
const CITES_C11 = /\bC11-[DQ]\d{2}\b/

// Why a reason can't keep a finding: too short to say why, or citing no C11 decision.
function reasonProblems(reason: string): string[] {
  return [
    ...(reason.length < 20 ? ['its reason is under 20 characters'] : []),
    ...(CITES_C11.test(reason) ? [] : ['its reason cites no C11 decision']),
  ]
}

// Why a path can't name what an exception is kept on: it must be exactly one construct of an app that
// holds it (none holding two), a CloudFormation resource, never a stack or the app, so no exception
// covers more than one resource. The restore stage's Valkey is in the restoreActive build alone.
function pathProblems(path: string, apps: readonly cdk.App[]): string[] {
  const found = apps.map(app => app.node.findAll().filter(construct => construct.node.path === path))
  const most = Math.max(...found.map(constructs => constructs.length))
  const target = found.find(constructs => constructs.length === 1)?.[0]
  const app = apps[found.findIndex(constructs => constructs.length === 1)]
  if (most !== 1 || target === undefined) return [`its path is ${most} constructs, not one`]
  if (target === app || cdk.Stack.isStack(target)) return ['its path is a whole stack or the app']
  if (!cdk.CfnResource.isCfnResource(target)) return ["its path isn't a resource"]
  return []
}

// IAC-16 over NAG_ALLOWANCES: every rule above, and each allowance used by a finding on its resource in
// one of the builds.
function allowanceProblems(list: readonly NagAllowance[], apps: readonly cdk.App[]): string[] {
  const findings = apps.flatMap(nagFindings)
  const seen = new Set<string>()
  return list.flatMap(allowance => {
    const at = `${allowance.rule} ${allowance.path}`
    const problems = [
      ...(NAG_RULE.test(allowance.rule) ? [] : ['its rule is no AwsSolutions rule']),
      ...reasonProblems(allowance.reason),
      ...pathProblems(allowance.path, apps),
      ...(seen.has(at) ? ['it is listed twice'] : []),
      ...(findings.some(finding => finding.rule === allowance.rule && finding.path === allowance.path)
        ? []
        : ['it matches no finding']),
    ]
    seen.add(at)
    return problems.map(problem => `${at}: ${problem}`)
  })
}

// What CloudFormation Validate kept in a synth: each suppressed finding's acknowledged id and the
// constructs it was raised on, from the assembly's validation report.
interface ValidationReport {
  pluginReports: Array<{
    pluginName: string
    violations: unknown[]
    suppressedViolations?: Array<{ acknowledgedId: string; violatingConstructs: Array<{ constructPath: string }> }>
  }>
}
function validateReport(outdir: string): ValidationReport['pluginReports'][number] {
  const report = JSON.parse(readFileSync(join(outdir, 'validation-report.json'), 'utf8')) as ValidationReport
  const validate = report.pluginReports.find(plugin => plugin.pluginName === 'CloudFormation Validate')
  if (validate === undefined) throw new Error('the synth ran no CloudFormation Validate')
  return validate
}

// IAC-16 over VALIDATE_ACKNOWLEDGEMENTS: every rule above, in an app that builds every stack, and each
// acknowledgement used: the report suppressed a finding of its id on its path, which the synth would
// otherwise have failed on.
function acknowledgementProblems(
  list: readonly ValidateAcknowledgement[],
  app: cdk.App,
  report: ValidationReport['pluginReports'][number],
): string[] {
  const seen = new Set<string>()
  return list.flatMap(entry => {
    const at = `${entry.id} ${entry.path}`
    const used = (report.suppressedViolations ?? []).some(
      suppressed =>
        suppressed.acknowledgedId === entry.id &&
        suppressed.violatingConstructs.some(construct => construct.constructPath === entry.path),
    )
    const problems = [
      ...(VALIDATE_ID.test(entry.id) ? [] : ['its id is no CloudFormation Validate finding']),
      ...reasonProblems(entry.reason),
      ...pathProblems(entry.path, [app]),
      ...(seen.has(at) ? ['it is listed twice'] : []),
      ...(used ? [] : ['it suppressed no finding']),
    ]
    seen.add(at)
    return problems.map(problem => `${at}: ${problem}`)
  })
}

// What a resource's template holds beyond the properties cdk-nag reads: its overrides, which a
// CfnResource keeps apart from its properties and merges in only when it writes the template, so an
// override can hold what no finding sees (TransitEncryptionEnabled false over a property left true).
// aws-cdk-lib 2.274.0 keeps them in a private field, read here; a resource whose field can't be read
// counts against its build, so a renamed field fails rather than passes.
function overridesOf(resource: cdk.CfnResource): Record<string, unknown> | undefined {
  const raw = (resource as unknown as { rawOverrides?: unknown }).rawOverrides
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined
}

// Each override in an app that could leave its template holding what cdk-nag doesn't read, as
// problems. Three kinds pass, each leaving the template holding no more than cdk-nag reads: an SCP's
// Content, which guardrails.ts writes as the same document as its property, as JSON text; on an IAM
// role, the permissions boundary aws-cdk-lib's PermissionsBoundary aspect writes (boundary.ts), which
// no AwsSolutions rule reads; and on an IAM role, its managed policies taken away (network.ts, the
// default group's handler), so the template holds less than cdk-nag reads. Any other override, of a
// property or of anything beside the properties, is found.
function overrideProblems(app: cdk.App): string[] {
  return app.node
    .findAll()
    .filter(cdk.CfnResource.isCfnResource)
    .flatMap(resource => {
      const path = resource.node.path
      const overrides = overridesOf(resource)
      if (overrides === undefined) return [`${path}: its overrides can't be read`]
      const { Properties: properties = {}, ...beside } = overrides
      if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
        return [`${path}: overrides its Properties whole`]
      }
      return [
        ...Object.keys(beside).map(key => `${path}: overrides ${key}`),
        ...Object.entries(properties).flatMap(([key, value]) => {
          if (
            resource instanceof organizations.CfnPolicy &&
            key === 'Content' &&
            typeof value === 'string' &&
            isDeepStrictEqual(JSON.parse(value), resource.stack.resolve(resource.content))
          ) {
            return []
          }
          const role = resource.cfnResourceType === 'AWS::IAM::Role'
          if (role && key === 'PermissionsBoundary') return []
          if (role && key === 'ManagedPolicyArns' && value === undefined) return []
          return [`${path}: overrides Properties.${key}`]
        }),
      ]
    })
}

// Every AwsSolutions rule a construct of an app acknowledges under Validations' acknowledged-rules
// metadata key, which cdk-nag 3.0.2 reads on a resource and on every construct above it, the app
// included, with or without an `annotation::` prefix, and so leaves the finding out: as `<rule>
// <path>`. No exception may be kept that way; each is NAG_ALLOWANCES', which the test applies.
function nagAcknowledgements(app: cdk.App): string[] {
  return app.node.findAll().flatMap(construct =>
    construct.node.metadata
      .filter(entry => entry.type === cdk.Validations.ACKNOWLEDGED_RULES_METADATA_KEY)
      .flatMap(entry => Object.keys(typeof entry.data === 'object' && entry.data !== null ? entry.data : {}))
      .map(id => id.replace(/^annotation::/i, ''))
      .filter(id => /^awssolutions-/i.test(id))
      .map(id => `${id} ${construct.node.path || '(the app)'}`),
  )
}

// --- IAC-15 ---------------------------------------------------------------------------------------

describe('IAC-15 C11-D70: cdk-nag’s AwsSolutions pack over the landing zone and the workload', () => {
  it('IAC-15: without its allowances the pack finds exactly the rules and resources NAG_ALLOWANCES keeps, over the landing zone and every workload build together, so the check reads every stack', () => {
    const pairs = [
      ...new Set(
        apps()
          .flatMap(nagFindings)
          .map(finding => `${finding.rule} ${finding.path}`),
      ),
    ].sort()
    expect(pairs.length).toBeGreaterThan(0)
    expect(pairs).toEqual(NAG_ALLOWANCES.map(allowance => `${allowance.rule} ${allowance.path}`).sort())
  })

  it('IAC-15: each build’s findings read its own stacks: the landing zone’s alone, each workload build’s every stage it builds, and the restore stage’s Valkey with restoreActive set alone', () => {
    const stacksOf = (app: cdk.App) => new Set(nagFindings(app).map(finding => finding.path.split('/')[0]))
    expect([...stacksOf(lz.app)].sort()).toEqual([
      'Hearth-Foundation',
      'Hearth-LogArchive',
      'Hearth-nonprod-Baseline',
      'Hearth-prod-Baseline',
    ])
    expect([...stacksOf(workload.app)].sort()).toEqual(['nonprod', 'prod', 'restore'])
    expect([...stacksOf(active.app)].sort()).toEqual(['nonprod', 'prod', 'restore'])
    expect([...stacksOf(drill.app)].sort()).toEqual(['nonprod'])
    const valkey = (app: cdk.App) =>
      nagFindings(app)
        .filter(finding => finding.path === 'restore/Data/Valkey/Group')
        .map(finding => finding.rule)
        .sort()
    expect(valkey(workload.app)).toEqual([])
    expect(valkey(active.app)).toEqual(['AwsSolutions-AEC4', 'AwsSolutions-AEC6'])
  })

  it('IAC-15: no finding is left once NAG_ALLOWANCES has removed the ones it keeps, in any build', () => {
    for (const app of apps()) {
      const left = nagFindings(app).filter(finding => !allowed(finding, NAG_ALLOWANCES))
      expect(left.map(finding => `${finding.rule} ${finding.path}`)).toEqual([])
    }
  })

  it('IAC-15: cdk-nag reads what every template holds: no build holds an override but an SCP’s Content written as its own document, an IAM role’s permissions boundary and an IAM role’s managed policies taken away; each other, planted on fresh apps after cdk-nag is seen to miss it, is found', () => {
    // A replication group whose properties hold transit encryption on, and a role and an SCP.
    const planted = (
      edit: (made: { group: elasticache.CfnReplicationGroup; role: iam.CfnRole; scp: organizations.CfnPolicy }) => void,
    ) => {
      const app = testApp()
      const stack = new cdk.Stack(app, 'Planted', { env: { region: REGION } })
      const group = new elasticache.CfnReplicationGroup(stack, 'Group', {
        replicationGroupDescription: 'planted',
        engine: 'valkey',
        atRestEncryptionEnabled: true,
        transitEncryptionEnabled: true,
      })
      const role = new iam.CfnRole(stack, 'Role', {
        assumeRolePolicyDocument: { Version: '2012-10-17', Statement: [] },
        managedPolicyArns: ['planted'],
      })
      const document = { Version: '2012-10-17', Statement: [{ Effect: 'Deny', Action: 'planted:*', Resource: '*' }] }
      const scp = new organizations.CfnPolicy(stack, 'Scp', {
        name: 'planted',
        type: 'SERVICE_CONTROL_POLICY',
        content: document,
      })
      scp.addPropertyOverride('Content', JSON.stringify(document))
      role.addPropertyOverride('PermissionsBoundary', ['arn', 'aws', 'iam', '', 'aws', 'policy/planted'].join(':'))
      role.addPropertyDeletionOverride('ManagedPolicyArns')
      edit({ group, role, scp })
      return app
    }
    expect(overrideProblems(planted(() => {}))).toEqual([])
    // The finding's own route: transit encryption off in the template alone, which cdk-nag doesn't see.
    const off = planted(({ group }) => group.addPropertyOverride('TransitEncryptionEnabled', false))
    expect(nagFindings(off).filter(finding => finding.rule === 'AwsSolutions-AEC3')).toEqual([])
    expect(synthesise(off).stacks[0]?.template).toMatchObject({
      Resources: { Group: { Properties: { TransitEncryptionEnabled: false } } },
    })
    expect(overrideProblems(off)).toEqual(['Planted/Group: overrides Properties.TransitEncryptionEnabled'])
    // A property taken away (ElastiCache's default is no encryption), an SCP's Content that isn't its
    // own document, managed policies set rather than taken away, an override beside the properties,
    // the properties whole, and a field that can't be read.
    for (const [edit, problem] of [
      [
        ({ group }) => group.addPropertyDeletionOverride('AtRestEncryptionEnabled'),
        'Planted/Group: overrides Properties.AtRestEncryptionEnabled',
      ],
      [
        ({ scp }) => scp.addPropertyOverride('Content', '{"Version":"2012-10-17","Statement":[]}'),
        'Planted/Scp: overrides Properties.Content',
      ],
      [
        ({ role }) => role.addPropertyOverride('ManagedPolicyArns', ['planted']),
        'Planted/Role: overrides Properties.ManagedPolicyArns',
      ],
      [({ group }) => group.addOverride('Condition', 'Planted'), 'Planted/Group: overrides Condition'],
      [
        ({ group }) => group.addOverride('Properties', { Engine: 'valkey' }),
        'Planted/Group: overrides Properties.Engine',
      ],
      [({ group }) => group.addOverride('Properties', 'planted'), 'Planted/Group: overrides its Properties whole'],
      [({ group }) => Reflect.deleteProperty(group, 'rawOverrides'), "Planted/Group: its overrides can't be read"],
    ] as const satisfies ReadonlyArray<readonly [Parameters<typeof planted>[0], string]>) {
      expect(overrideProblems(planted(edit)), problem).toEqual([problem])
    }
    for (const app of apps()) expect(overrideProblems(app)).toEqual([])
  })

  it('IAC-15 C11-D27: each stack’s top-level construct ids, which every allowance’s and acknowledgement’s path starts from', () => {
    const children = (stack: cdk.Stack | undefined) => stack?.node.children.map(child => child.node.id)
    const bootstrap = ['BootstrapVersion', 'CheckBootstrapVersion']
    const baseline = ['Boundary', 'GithubOidc', 'BreakGlass', 'OpsAlerts', 'FastAlarms', 'ServerRepository', 'Zones']
    expect(children(lz.stacks.foundation)).toEqual([
      'Guardrails',
      'IdentityCenter',
      'OrgTrail',
      'OpsAlerts',
      'Sentinel',
      'Budgets',
      ...bootstrap,
    ])
    expect(children(lz.stacks.logArchive)).toEqual([
      'SecKey',
      'ArchiveKey',
      'TrailBucket',
      'BreakGlassLogBucket',
      'ArchiveBucket',
      'OpsAlerts',
      'SecurityServices',
      'BreakGlass',
      'FastAlarms',
      'BreakGlassLogBucketName',
      ...bootstrap,
    ])
    expect(children(lz.stacks.nonprodBaseline)).toEqual([
      ...baseline,
      'BreakGlassLogBucketName',
      'OrganisationId',
      ...bootstrap,
    ])
    expect(children(lz.stacks.prodBaseline)).toEqual([
      ...baseline,
      'BreakGlassLogBucketName',
      'OrganisationId',
      ...bootstrap,
    ])
  })

  it('IAC-15 C11-D27: each workload stack’s top-level construct ids, by stage, every build, besides the SSM parameters it reads, whose names aws-cdk-lib writes into the ids', () => {
    // CDK names the construct that reads an SSM parameter after the parameter's name and a fixed UUID,
    // so those ids are read by the name alone.
    const reads = 'SsmParameterValue:'
    const children = (stack: cdk.Stack) =>
      stack.node.children.map(child => child.node.id).filter(id => !id.startsWith(reads))
    const read = (stack: cdk.Stack) => [
      ...new Set(
        stack.node.children
          .map(child => child.node.id)
          .filter(id => id.startsWith(reads))
          .map(id => id.split(':')[1]),
      ),
    ]
    const tail = ['Boundary', 'BootstrapVersion', 'CheckBootstrapVersion']
    const roles = (kind: string) => [
      `MutableRole${kind}TaskRole`,
      `${kind}TaskRole`,
      `MutableRole${kind}ExecRole`,
      `${kind}ExecRole`,
    ]
    for (const synth of [workload, active, drill]) {
      for (const [env, stage] of Object.entries(synth.stages)) {
        if (stage === undefined) continue
        const alb = env !== 'restore'
        expect(
          stage.node.children.map(child => child.node.id),
          env,
        ).toEqual(['Platform', 'Data', 'Tasks', 'Services'])
        expect(children(stage.platform), env).toEqual([
          'Network',
          'Custom::VpcRestrictDefaultSGCustomResourceProvider',
          'Endpoints',
          'Roles',
          'Cluster',
          'LogGroups',
          ...(alb ? ['LoadBalancer'] : []),
          'Parameters',
          ...tail,
        ])
        expect(children(stage.data), env).toEqual(['Valkey', 'AuthSecret', 'Parameters', ...tail])
        expect(children(stage.tasks), env).toEqual([
          ...['Migrate', 'Probe', 'Bastion'].flatMap(kind => [...roles(kind), `${kind}Task`]),
          'BastionLinux',
          'Cluster',
          'IsolatedSubnets',
          'MigrateSecurityGroup',
          'ProbeSecurityGroup',
          'MigrateTaskDefinition',
          'ProbeTaskDefinition',
          'HasDatabase',
          ...tail,
        ])
        expect(children(stage.services), env).toEqual([
          'AuthSecret',
          ...['Api', 'Realtime', 'Worker'].flatMap(kind => [...roles(kind), `${kind}Task`, `${kind}Service`]),
          'Release',
          ...tail,
        ])
        expect(read(stage.platform), env).toEqual([
          '--hearth--organisation--id',
          ...(alb ? [`--hearth--${env}--zone--app`] : []),
        ])
      }
    }
  })
})

// --- IAC-16 ---------------------------------------------------------------------------------------

describe('IAC-16 C11-D70: every exception the landing zone and the workload keep', () => {
  it('IAC-16 finds a bad rule, a short reason, a reason citing nothing, an unknown path, a stack, a construct that is no resource, a duplicate and an unused allowance, on planted lists', () => {
    const reason = 'A planted allowance for the test, which cites C11-D70'
    const planted: NagAllowance[] = [
      { rule: 'AwsSolutions-IAM5[Resource::*]', path: 'Hearth-LogArchive/BreakGlass/Role', reason },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/TrailBucket/Resource', reason: 'Short (C11-D17)' },
      {
        rule: 'AwsSolutions-S1',
        path: 'Hearth-LogArchive/ArchiveBucket/Resource',
        reason: 'A reason long enough that cites no decision',
      },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/NoSuchBucket/Resource', reason },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive', reason },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/TrailBucket', reason },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/BreakGlassLogBucket/Resource', reason },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/BreakGlassLogBucket/Resource', reason },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/SecKey/Resource', reason },
    ]
    expect(allowanceProblems(planted, [lz.app])).toEqual([
      'AwsSolutions-IAM5[Resource::*] Hearth-LogArchive/BreakGlass/Role: its rule is no AwsSolutions rule',
      'AwsSolutions-IAM5[Resource::*] Hearth-LogArchive/BreakGlass/Role: it matches no finding',
      'AwsSolutions-S1 Hearth-LogArchive/TrailBucket/Resource: its reason is under 20 characters',
      'AwsSolutions-S1 Hearth-LogArchive/ArchiveBucket/Resource: its reason cites no C11 decision',
      'AwsSolutions-S1 Hearth-LogArchive/NoSuchBucket/Resource: its path is 0 constructs, not one',
      'AwsSolutions-S1 Hearth-LogArchive/NoSuchBucket/Resource: it matches no finding',
      'AwsSolutions-S1 Hearth-LogArchive: its path is a whole stack or the app',
      'AwsSolutions-S1 Hearth-LogArchive: it matches no finding',
      "AwsSolutions-S1 Hearth-LogArchive/TrailBucket: its path isn't a resource",
      'AwsSolutions-S1 Hearth-LogArchive/TrailBucket: it matches no finding',
      'AwsSolutions-S1 Hearth-LogArchive/BreakGlassLogBucket/Resource: it is listed twice',
      'AwsSolutions-S1 Hearth-LogArchive/SecKey/Resource: it matches no finding',
    ])
  })

  it('IAC-16 C11-D45: a workload allowance is held in the build that holds its resource: the restore stage’s Valkey is no resource of the committed build, and one of the restoreActive build, on planted lists', () => {
    const reason = 'A planted allowance for the test, which cites C11-D35'
    const planted: NagAllowance[] = [{ rule: 'AwsSolutions-AEC4', path: 'restore/Data/Valkey/Group', reason }]
    expect(allowanceProblems(planted, [workload.app])).toEqual([
      'AwsSolutions-AEC4 restore/Data/Valkey/Group: its path is 0 constructs, not one',
      'AwsSolutions-AEC4 restore/Data/Valkey/Group: it matches no finding',
    ])
    expect(allowanceProblems(planted, [workload.app, active.app])).toEqual([])
    expect(
      allowanceProblems(
        [{ rule: 'AwsSolutions-AEC4', path: 'nonprod/Data/Valkey', reason }],
        [workload.app, active.app],
      ),
    ).toEqual([
      "AwsSolutions-AEC4 nonprod/Data/Valkey: its path isn't a resource",
      'AwsSolutions-AEC4 nonprod/Data/Valkey: it matches no finding',
    ])
  })

  it('IAC-16: every NAG_ALLOWANCES entry keeps one rule on one resource, for a cited reason, and is used, over the landing zone and every workload build', () => {
    expect(allowanceProblems(NAG_ALLOWANCES, apps())).toEqual([])
  })

  it('IAC-16 finds a bad id, a short reason, a reason citing nothing, an unknown path, a stack, a duplicate and an unused acknowledgement, on planted lists', () => {
    const report = validateReport(lz.synthesised.outdir)
    const reason = 'A planted acknowledgement for the test, which cites C11-D70'
    const entry = (id: ValidateAcknowledgement['id'], path: string, why = reason): ValidateAcknowledgement => ({
      id,
      path,
      reason: why,
    })
    const planted = [
      entry('CloudFormation-Validate::E3510[x]', 'Hearth-Foundation/IdentityCenter/BreakGlassEntry'),
      entry('CloudFormation-Validate::E3510', 'Hearth-Foundation/IdentityCenter/NonprodOperator', 'Short (C11-D10)'),
      entry(
        'CloudFormation-Validate::E3510',
        'Hearth-Foundation/IdentityCenter/NonprodOperator',
        'Long enough, but cites nothing',
      ),
      entry('CloudFormation-Validate::E3510', 'Hearth-Foundation/IdentityCenter/NoSuchSet'),
      entry('CloudFormation-Validate::W1001', 'Hearth-Foundation'),
      entry('CloudFormation-Validate::E3510', 'Hearth-Foundation/IdentityCenter/OrgAdmin'),
    ]
    expect(acknowledgementProblems(planted, lz.app, report)).toEqual([
      'CloudFormation-Validate::E3510[x] Hearth-Foundation/IdentityCenter/BreakGlassEntry: its id is no CloudFormation Validate finding',
      'CloudFormation-Validate::E3510[x] Hearth-Foundation/IdentityCenter/BreakGlassEntry: it suppressed no finding',
      'CloudFormation-Validate::E3510 Hearth-Foundation/IdentityCenter/NonprodOperator: its reason is under 20 characters',
      'CloudFormation-Validate::E3510 Hearth-Foundation/IdentityCenter/NonprodOperator: its reason cites no C11 decision',
      'CloudFormation-Validate::E3510 Hearth-Foundation/IdentityCenter/NonprodOperator: it is listed twice',
      'CloudFormation-Validate::E3510 Hearth-Foundation/IdentityCenter/NoSuchSet: its path is 0 constructs, not one',
      'CloudFormation-Validate::E3510 Hearth-Foundation/IdentityCenter/NoSuchSet: it suppressed no finding',
      'CloudFormation-Validate::W1001 Hearth-Foundation: its path is a whole stack or the app',
      'CloudFormation-Validate::W1001 Hearth-Foundation: it suppressed no finding',
      'CloudFormation-Validate::E3510 Hearth-Foundation/IdentityCenter/OrgAdmin: it suppressed no finding',
    ])
  })

  it('IAC-16 C11-D10 C11-D11: every VALIDATE_ACKNOWLEDGEMENTS entry keeps one finding on one resource of the four-stack build, for a cited reason, and suppressed it; Validate left nothing else', () => {
    const report = validateReport(lz.synthesised.outdir)
    expect(acknowledgementProblems(VALIDATE_ACKNOWLEDGEMENTS, lz.app, report)).toEqual([])
    expect(report.violations).toEqual([])
    const suppressed = (report.suppressedViolations ?? []).flatMap(violation =>
      violation.violatingConstructs.map(construct => `${violation.acknowledgedId} ${construct.constructPath}`),
    )
    expect(suppressed.sort()).toEqual(VALIDATE_ACKNOWLEDGEMENTS.map(entry => `${entry.id} ${entry.path}`).sort())
  })

  it('IAC-16 C11-D70: CloudFormation Validate finds nothing in any workload stack of any build, and nothing is acknowledged there; a finding planted in one is reported on its construct', () => {
    for (const synth of [workload, active, drill]) {
      const path = join(synth.synthesised.outdir, 'validation-report.json')
      const report = existsSync(path)
        ? (JSON.parse(readFileSync(path, 'utf8')) as ValidationReport)
        : { pluginReports: [] }
      const validate = report.pluginReports.find(plugin => plugin.pluginName === 'CloudFormation Validate')
      expect(validate?.violations ?? []).toEqual([])
      expect(validate?.suppressedViolations ?? []).toEqual([])
    }
    // A warning is reported without failing the synth, so the report is read rather than the synth's
    // outcome; the drill builds the one stage the plant needs, and the report's printout is kept quiet.
    const app = testApp()
    const stages = addWorkload(app, { release: fakeRelease(), restoreActive: false, drill: true })
    const service = stages.nonprod?.services.node.findChild('ApiService') as cdk.CfnResource
    service.addPropertyOverride('LaunchType', 'NOT_A_LAUNCH_TYPE')
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let planted: ValidationReport['pluginReports'][number]
    try {
      planted = validateReport(synthesise(app).outdir)
    } finally {
      quiet.mockRestore()
    }
    const violations = planted.violations as Array<{
      ruleName: string
      violatingConstructs: Array<{ constructPath: string }>
    }>
    expect(violations.flatMap(v => v.violatingConstructs.map(c => `${v.ruleName} ${c.constructPath}`))).toEqual([
      'W3030 nonprod/Services/ApiService',
    ])
  }, 60_000)

  it('IAC-16 C11-D59: in a run that builds one stage, acknowledgeValidate() refuses a misspelt stack and a bad path in the stage it builds, and skips an entry for a stage it doesn’t build', () => {
    const app = testApp()
    addWorkload(app, { release: fakeRelease(), restoreActive: false, drill: true })
    const reason = 'A planted acknowledgement for the test, which cites C11-D70'
    const id = 'CloudFormation-Validate::W3030' as const
    expect(() => acknowledgeValidate(app, [{ id, path: 'nonprod/Servics/ApiService', reason }])).toThrow(
      'names nonprod/Servics/ApiService, in no stack the landing zone builds or a workload stage holds',
    )
    expect(() => acknowledgeValidate(app, [{ id, path: 'nonprod/Services/NoSuchService', reason }])).toThrow(
      'names nonprod/Services/NoSuchService, which is 0 constructs, not one',
    )
    expect(() => acknowledgeValidate(app, [{ id, path: 'nonprod/Services', reason }])).toThrow(
      'names nonprod/Services, a whole stack or the app',
    )
    expect(() => acknowledgeValidate(app, [{ id, path: 'prod/Services/ApiService', reason }])).not.toThrow()
  })

  it('IAC-16 C11-D25: in a run that builds one target, acknowledgeValidate() refuses a misspelt stack and a bad path in the stack it builds, and skips an entry for a stack it doesn’t build', () => {
    const app = testApp()
    addLandingZone(app, { config: fixtureConfig(), targets: ['log-archive'] })
    const reason = 'A planted acknowledgement for the test, which cites C11-D70'
    const id = 'CloudFormation-Validate::E3510' as const
    expect(() =>
      acknowledgeValidate(app, [{ id, path: 'Hearth-Fundation/IdentityCenter/BreakGlassEntry', reason }]),
    ).toThrow('names Hearth-Fundation/IdentityCenter/BreakGlassEntry, in no stack the landing zone builds')
    expect(() => acknowledgeValidate(app, [{ id, path: 'Hearth-LogArchive/NoSuchKey', reason }])).toThrow(
      'names Hearth-LogArchive/NoSuchKey, which is 0 constructs, not one',
    )
    expect(() => acknowledgeValidate(app, [{ id, path: 'Hearth-LogArchive', reason }])).toThrow(
      'names Hearth-LogArchive, a whole stack or the app',
    )
    expect(() => acknowledgeValidate(app, [{ id, path: 'Hearth-Foundation/NoSuchSet', reason }])).not.toThrow()
  })
})

// --- No acknowledgement outside the list ------------------------------------------------------------

const INFRA = fileURLToPath(new URL('../..', import.meta.url))
// The two files that may acknowledge a Validate finding: this list's own, and the bootstrap template's
// generator, which acknowledges the stock template's findings on the stack it never deploys.
const ACKNOWLEDGERS = ['src/aspects/nag.ts', 'scripts/bootstrap-template.ts']
// A Validate acknowledgement, however spelt across a line break.
const ACKNOWLEDGES = [/\bValidations\s*\.\s*of\s*\(/, /\.\s*acknowledge\s*\(/]
// The metadata key an acknowledgement is stored under, by its constant's name or its value, which a
// construct's own metadata could write past acknowledge() (cdk-nag reads it too): only this file names
// it, to find every such entry in every build (above).
const NAMES_THE_KEY = [/ACKNOWLEDGED_RULES_METADATA_KEY/, /acknowledged-rules/]

// Every TypeScript file under infra/, as a path relative to it, but its dependencies and assemblies.
function infraScripts(folder = ''): string[] {
  return readdirSync(join(INFRA, folder), { withFileTypes: true }).flatMap(entry => {
    const path = folder === '' ? entry.name : `${folder}/${entry.name}`
    if (entry.isDirectory()) return ['node_modules', 'cdk.out'].includes(entry.name) ? [] : infraScripts(path)
    return /\.[cm]?ts$/.test(entry.name) ? [path] : []
  })
}

describe('IAC-16 C11-D70: no acknowledgement escapes the list', () => {
  it('IAC-16: no construct of any build acknowledges an AwsSolutions rule, which cdk-nag would then leave out; one planted on a fresh app, on the resource with a prefix and on its stack without, is seen to hide its finding and is found', () => {
    const planted = (acknowledge?: (stack: cdk.Stack, group: elasticache.CfnReplicationGroup) => void) => {
      const app = testApp()
      const stack = new cdk.Stack(app, 'Planted', { env: { region: REGION } })
      const group = new elasticache.CfnReplicationGroup(stack, 'Group', {
        replicationGroupDescription: 'planted',
        engine: 'valkey',
        atRestEncryptionEnabled: false,
        transitEncryptionEnabled: true,
      })
      acknowledge?.(stack, group)
      return app
    }
    const aec3 = (app: cdk.App) => nagFindings(app).filter(finding => finding.rule === 'AwsSolutions-AEC3')
    const key = cdk.Validations.ACKNOWLEDGED_RULES_METADATA_KEY
    expect(aec3(planted())).toEqual([{ rule: 'AwsSolutions-AEC3', path: 'Planted/Group' }])
    expect(nagAcknowledgements(planted())).toEqual([])
    const onGroup = planted((_, group) => group.node.addMetadata(key, { 'Annotation::AwsSolutions-AEC3': 'planted' }))
    expect(aec3(onGroup)).toEqual([])
    expect(nagAcknowledgements(onGroup)).toEqual(['AwsSolutions-AEC3 Planted/Group'])
    const onStack = planted(stack => stack.node.addMetadata(key, { 'AwsSolutions-AEC3': 'planted' }))
    expect(aec3(onStack)).toEqual([])
    expect(nagAcknowledgements(onStack)).toEqual(['AwsSolutions-AEC3 Planted'])
    for (const app of apps()) expect(nagAcknowledgements(app)).toEqual([])
  })

  it('IAC-16: only nag.ts and the bootstrap template’s generator acknowledge a Validate finding in infra/', () => {
    const acknowledging = infraScripts().filter(path => {
      const text = readFileSync(join(INFRA, path), 'utf8')
      return ACKNOWLEDGES.some(pattern => pattern.test(text))
    })
    expect(acknowledging.sort()).toEqual([...ACKNOWLEDGERS].sort())
  })

  it('IAC-16: only this file names the acknowledged-rules metadata key in infra/', () => {
    const naming = infraScripts().filter(path => {
      const text = readFileSync(join(INFRA, path), 'utf8')
      return NAMES_THE_KEY.some(pattern => pattern.test(text))
    })
    expect(naming).toEqual(['src/aspects/nag.test.ts'])
  })
})
