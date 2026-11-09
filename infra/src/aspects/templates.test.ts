// The checks that read every landing-zone and workload template whole (C11-D70), beside each stack's
// own tests. Over the landing zone's four templates:
// - IAC-01, the model check, over the four templates, both of its rules: no Allow anywhere names a
//   model action, and every Allow that could still grant one (`*`, a model-overlapping `<service>:*`)
//   binds a principal carrying its own model deny in place, or bounded by hearth-boundary, which does;
//   the managed policies attached are Foundation's three alone, each to a set with its own deny, and
//   hearth-no-models renders the lists' deny on Root (C11-D06, C11-D10). The SCP is never counted as
//   a principal's cover: management has no SCP above it, and a test can't see an SCP deployed;
// - IAC-10's cross-template rules: the one Allow of `*` on `*` is hearth-boundary's, nothing else
//   allows an S3 delete, PassRole names roles for ECS tasks alone, sessions into tasks and the
//   database logins are break-glass's alone, no session outlasts an hour, and every IAM document fits
//   its limit (C11-D12, C11-D26);
// - IAC-13's landing-zone half: no Lambda, custom resource, SAM resource, macro, nested stack,
//   transform, import or export (C11-D24, C11-D76), and each stack's artifact: termination
//   protection, its account and Region, and the hearthbase deploy role (C11-D26, C11-D27);
// - IAC-22: the assets are the templates alone, with no command and no Docker image (C11-D76);
// - every event pattern holds no list inside a list, which EventBridge would never match.
// Over the workload's templates in every build the pipeline deploys: the committed twelve, the twelve
// with restoreActive set, and the drill's four, non-prod's alone (C0.11 PR 3, C11-D59):
// - IAC-01: the model check, with no allowance at all: no Allow names a model action, none can grant
//   one, and nothing is attached but each role's boundary;
// - IAC-10: every role bounded by hearth-boundary, the twelve task and execution roles by name and
//   nothing for rule9, each one's trust and policies exactly C11-D38's, the perimeter on the task roles
//   in non-prod and restore and on none in prod, pinned literally (C11-D33; the profile's switch is
//   off the owner's-read list, so this pin is what holds it); the stage's only other roles the flow
//   log's and the default-group handler's, each exactly its own trust and grant; every task
//   definition on its own kind's task and execution roles, and a secret on the api's alone; no Allow
//   of a database login, a session into a task, a role passed on or an S3 delete; and no policy
//   document but a role's own trust and inline policy and an endpoint's policy, so no policy, user or
//   group resource grants a role more and no resource policy opens a workload resource;
// - IAC-12: the VPC endpoints exactly C11-D30's, by service, each policy exactly its statements under
//   the organisation's id read from SSM, the resource statement pinned as the perimeter is, an
//   interface endpoint nowhere the stage has none, and no endpoint outside the stage's Platform;
// - IAC-13's workload half: the landing zone's list, a cross-stack reference's output and
//   Fn::GetStackOutput, the one default-group handler and its custom resource allowed only together
//   in a Platform template, and each stack's artifact;
// - IAC-22's workload half: the templates and each Platform's one handler zip, which runs nothing;
// - no trust a machine outside AWS could use (federated, Roles Anywhere, Systems Manager's hybrid
//   activations, IoT's credentials provider; T24 item 28), and each service trusted only by its own
//   roles: ECS's tasks by the twelve, VPC Flow Logs by the flow log's, Lambda by the handler's;
// - one cluster per stage, whose ECS Exec logging is NONE, so a break-glass session into the network
//   leaves nothing behind but CloudTrail's record of it (C11-D40, T24 item 15);
// - the network's invariants (C11-D29 to C11-D31, C11-D37, C11-D45), which no SCP backs and none can
//   target the restore stage with: no egress to 0.0.0.0/0 or ::/0 from any group (every other egress
//   peer, which the design keeps to the stage's own groups and its S3 prefix list, is network.test.ts's
//   exact table, off the owner's-read list) and EC2's placeholder as every group's one inline egress,
//   no route but a public table's default to its own internet gateway, none of EC2's other ways out or
//   in and none of other services' ways in (VPC Lattice, API Gateway's VPC links, CloudFront's VPC
//   origins, Global Accelerator, a classic load balancer), one application load balancer per stage, in
//   its Platform, every security group, rule and VPC endpoint in the stage's Platform, every ingress
//   from the stage's own groups but that load balancer's tcp 443 from anywhere, no public address, the
//   restore stage's isolation (IAC-20's isolation half), every image by digest, every secret by
//   reference, and no plain environment value with a URL's password (in the user information of any URL
//   in it, or a query or fragment key naming a credential), a dynamic reference of any kind, a part no
//   template fixes anywhere but a URL's host, a part read from any SSM parameter but the stage's Valkey
//   endpoint, or a shape no static reading fixes; that endpoint written once a stage, in its Data, as
//   the replication group's address or a literal host; and no SSM parameter a workload template writes
//   with a name no static reading fixes or a dynamic reference in its value. The exact rules, CIDRs and
//   counts are src/workload's tests'.
// The planted cases come first, each found, so no check passes by reading nothing. This file holds
// rules every template is held to, so it is on the owner's-read list (C11-D74). Expected ARNs are
// joined from their parts here (IG-01), rendered with a made-up account for the workload's, model
// actions come from the lists (IG-10), and the forbidden types it looks for are named only in a test
// (IG-11, IG-12).
import { isDeepStrictEqual } from 'node:util'
import { beforeAll, describe, expect, it } from 'vitest'
import { globsOverlap, MODEL_ACTIONS, MODEL_SERVICE_PREFIXES, modelDenyActions } from '../config/models.ts'
import { ENVIRONMENTS, type EnvironmentName, REGION } from '../config/profiles.ts'
import { fixtureAccount, fixtureConfig } from '../testing/fixture.ts'
import { type LandingZoneSynth, synthLandingZone } from '../testing/landing-zone.ts'
import {
  attachedPolicyName,
  DOCUMENT_PROPERTIES,
  isModelDenyInPlace,
  type ModelCheckAllowance,
  managedPolicyAttachments,
  modelCheck,
  modelGrants,
  namesModelAction,
  type PolicyStatementAt,
  policyStatements,
  principalOf,
  renderedString,
  unreadablePolicies,
} from '../testing/policies.ts'
import { synthWorkload, type WorkloadSynth } from '../testing/workload.ts'

type Template = Record<string, unknown>
interface Resource {
  Type: string
  Properties?: Record<string, unknown>
  Condition?: string
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const resources = (template: Template): Array<[string, Resource]> =>
  Object.entries(isObject(template.Resources) ? (template.Resources as Record<string, Resource>) : {})
const ofType = (template: Template, type: string) => resources(template).filter(([, r]) => r.Type === type)
const propertiesOf = (template: Template, logicalId: string): Record<string, unknown> =>
  resources(template).find(([id]) => id === logicalId)?.[1].Properties ?? {}
// The one resource of a type whose property has a value, by its logical id.
function logicalIdOf(template: Template, type: string, property: string, value: unknown): string {
  const found = ofType(template, type).filter(([, r]) => r.Properties?.[property] === value)
  if (found.length !== 1) throw new Error(`${found.length} ${type} with ${property} ${String(value)}, not one`)
  return found[0]?.[0] ?? ''
}
const lower = (action: string) => action.toLowerCase()

const fixture = fixtureConfig()
// The four stacks, each with the account it goes to.
const STACKS = [
  { name: 'Hearth-Foundation', account: fixture.accounts.management },
  { name: 'Hearth-LogArchive', account: fixture.accounts.logArchive },
  { name: 'Hearth-nonprod-Baseline', account: fixture.accounts.nonprod },
  { name: 'Hearth-prod-Baseline', account: fixture.accounts.prod },
] as const
const BASELINES = ['Hearth-nonprod-Baseline', 'Hearth-prod-Baseline'] as const

let lz: LandingZoneSynth
const templateOf = (name: string): Template => {
  const found = lz.synthesised.stacks.find(stack => stack.stackName === name)
  if (found === undefined) throw new Error(`no stack ${name}`)
  return found.template
}
const accountOf = (name: string) => STACKS.find(stack => stack.name === name)?.account ?? ''
const renderIn = (name: string) => (value: unknown) =>
  renderedString(value, { account: accountOf(name), region: REGION, template: templateOf(name) })

// The workload in each build the pipeline deploys: committed, with restoreActive set (C11-D45), and
// the drill's, the non-prod stage alone with its one break (C11-D59).
let workload: WorkloadSynth
let active: WorkloadSynth
let drill: WorkloadSynth

beforeAll(() => {
  lz = synthLandingZone()
  workload = synthWorkload()
  active = synthWorkload({ run: { restoreActive: true } })
  drill = synthWorkload({ run: { drill: true } })
}, 60_000)

// hearth-boundary's one statement that allows everything, which a boundary uses to bound rather than
// to grant (C11-D26): the only Allow every cross-template rule below sets aside.
const isBoundaryAllowAll = (template: Template, s: PolicyStatementAt) =>
  s.type === 'AWS::IAM::ManagedPolicy' &&
  propertiesOf(template, s.logicalId).ManagedPolicyName === 'hearth-boundary' &&
  s.sid === 'AllowAll'

// Every Allow in every template, with its stack, but hearth-boundary's AllowAll.
function allows(): Array<{ stack: string; template: Template; s: PolicyStatementAt }> {
  return STACKS.flatMap(({ name }) => {
    const template = templateOf(name)
    return policyStatements(template)
      .filter(s => s.effect === 'Allow' && !isBoundaryAllowAll(template, s))
      .map(s => ({ stack: name, template, s }))
  })
}
// A role's name, or a permission set's, for a message.
const ownerName = (template: Template, logicalId: string) => {
  const properties = propertiesOf(template, logicalId)
  return String(properties.RoleName ?? properties.Name ?? properties.ManagedPolicyName ?? logicalId)
}

// --- IAC-01: the model check -----------------------------------------------------------------------

// Foundation's attachments (C11-D10): AdministratorAccess on HearthOrgAdmin, ReadOnlyAccess on
// HearthNonprodOperator and AWS's billing read-only policy on HearthBilling; no other template
// attaches a managed policy, and no grant needs an allowance.
function allowanceFor(name: string): ModelCheckAllowance {
  if (name !== 'Hearth-Foundation') return { grants: [], attachments: [] }
  const set = (setName: string) => logicalIdOf(templateOf(name), 'AWS::SSO::PermissionSet', 'Name', setName)
  return {
    grants: [],
    attachments: [
      { logicalId: set('HearthOrgAdmin'), policy: 'AdministratorAccess' },
      { logicalId: set('HearthNonprodOperator'), policy: 'ReadOnlyAccess' },
      { logicalId: set('HearthBilling'), policy: 'AWSBillingReadOnlyAccess' },
    ],
  }
}

// A template with one statement removed from, or added to, a resource's document.
function withStatements(
  template: Template,
  logicalId: string,
  edit: (statements: Array<Record<string, unknown>>) => Array<Record<string, unknown>>,
): Template {
  const copy = structuredClone(template)
  const properties = (copy.Resources as Record<string, Resource>)[logicalId]?.Properties ?? {}
  const document = (properties.InlinePolicy ??
    properties.PolicyDocument ??
    (properties.Policies as Array<{ PolicyDocument: unknown }> | undefined)?.[0]?.PolicyDocument) as {
    Statement: Array<Record<string, unknown>>
  }
  document.Statement = edit(document.Statement)
  return copy
}

describe('IAC-01 C11-D06: no model permission in any landing-zone template', () => {
  it('IAC-01 finds a set without its deny, a boundary without its deny and an Allow naming a model action, planted in copies of the real templates', () => {
    const foundation = templateOf('Hearth-Foundation')
    const orgAdmin = logicalIdOf(foundation, 'AWS::SSO::PermissionSet', 'Name', 'HearthOrgAdmin')
    const noDeny = withStatements(foundation, orgAdmin, statements => statements.filter(s => s.Sid !== 'NoModels'))
    expect(modelCheck(noDeny, allowanceFor('Hearth-Foundation'))).toEqual([
      `${orgAdmin} ManagedPolicies[0]: attached to set:${orgAdmin}, which has no model deny in place`,
    ])

    const prod = templateOf('Hearth-prod-Baseline')
    const boundary = logicalIdOf(prod, 'AWS::IAM::ManagedPolicy', 'ManagedPolicyName', 'hearth-boundary')
    const openBoundary = withStatements(prod, boundary, statements => statements.filter(s => s.Sid !== 'NoModels'))
    expect(modelCheck(openBoundary, allowanceFor('Hearth-prod-Baseline'))).toEqual([
      `${boundary} PolicyDocument AllowAll: * can grant a model action, and managed:${boundary} has no model deny in place`,
    ])

    const deploy = logicalIdOf(prod, 'AWS::IAM::Role', 'RoleName', 'hearth-gh-deploy')
    const [modelAction = ''] = MODEL_ACTIONS
    const [modelPrefix = ''] = MODEL_SERVICE_PREFIXES
    const named = withStatements(prod, deploy, statements => [
      ...statements,
      { Sid: 'Planted', Effect: 'Allow', Action: [modelAction, `${modelPrefix}:Get*`], Resource: '*' },
    ])
    expect(modelCheck(named, allowanceFor('Hearth-prod-Baseline'))).toEqual([
      `${deploy} Policies[0].PolicyDocument Planted: an Allow names a model action (${modelAction})`,
      `${deploy} Policies[0].PolicyDocument Planted: an Allow names a model action (${modelPrefix}:Get*)`,
    ])
  })

  // unreadablePolicies also reports each resource of a type the walker hasn't classified, which may
  // hold a document it never reads, so a new type fails here until a person classifies it (C0.11
  // review 7 TESTS-02).
  it.each(STACKS.map(stack => stack.name))(
    'IAC-01 %s: every policy reads, and the model check passes with Foundation’s three attachments its only allowances',
    name => {
      expect(unreadablePolicies(templateOf(name))).toEqual([])
      expect(modelCheck(templateOf(name), allowanceFor(name))).toEqual([])
    },
  )

  it('IAC-01: no Allow in any document names a model action, whatever deny sits beside it', () => {
    const found = STACKS.flatMap(({ name }) =>
      policyStatements(templateOf(name))
        .filter(s => s.effect === 'Allow')
        .flatMap(s => s.actions.filter(namesModelAction).map(action => `${name} ${s.logicalId} ${s.sid}: ${action}`)),
    )
    expect(found).toEqual([])
  })

  it('IAC-01: the only Allows that could grant a model action are the two boundaries’ AllowAll, each covered by its own deny in place, and no resource policy, SCP or RCP holds one', () => {
    const grants = STACKS.flatMap(({ name }) => {
      const template = templateOf(name)
      const statements = policyStatements(template)
      return modelGrants(statements).map(s => {
        const keys = principalOf(s, template) ?? []
        const covered = keys.length > 0 && keys.every(key => key === `managed:${s.logicalId}`)
        const ownDeny = statements.some(d => d.logicalId === s.logicalId && isModelDenyInPlace(d))
        return `${name} ${ownerName(template, s.logicalId)} ${s.sid}: ${covered && ownDeny ? 'covered' : 'NOT covered'}`
      })
    })
    expect(grants).toEqual([
      'Hearth-nonprod-Baseline hearth-boundary AllowAll: covered',
      'Hearth-prod-Baseline hearth-boundary AllowAll: covered',
    ])
  })

  it('IAC-01 C11-D10: the only managed policies attached are Foundation’s three, each to a set whose inline policy opens with its own model deny', () => {
    const attached = STACKS.flatMap(({ name }) => {
      const template = templateOf(name)
      return managedPolicyAttachments(template).map(a => {
        const statements = policyStatements(template).filter(s => s.logicalId === a.logicalId)
        const deny =
          statements[0] !== undefined && statements[0].sid === 'NoModels' && isModelDenyInPlace(statements[0])
        return `${name} ${ownerName(template, a.logicalId)} ${a.where} ${attachedPolicyName(a.policy)}${a.conditional ? ' (conditional)' : ''}: ${deny ? 'NoModels' : 'NO DENY'}`
      })
    })
    expect(attached).toEqual([
      'Hearth-Foundation HearthOrgAdmin ManagedPolicies[0] AdministratorAccess: NoModels',
      'Hearth-Foundation HearthNonprodOperator ManagedPolicies[0] ReadOnlyAccess: NoModels',
      'Hearth-Foundation HearthBilling ManagedPolicies[0] AWSBillingReadOnlyAccess: NoModels',
    ])
  })

  it('IAC-01 C11-D06: hearth-no-models is one unconditional Deny of modelDenyActions(), in order, on everything, attached to Root', () => {
    const foundation = templateOf('Hearth-Foundation')
    const policy = propertiesOf(
      foundation,
      logicalIdOf(foundation, 'AWS::Organizations::Policy', 'Name', 'hearth-no-models'),
    )
    expect(policy.Type).toBe('SERVICE_CONTROL_POLICY')
    expect(JSON.parse(String(policy.Content))).toEqual({
      Version: '2012-10-17',
      Statement: [{ Sid: 'NoModels', Effect: 'Deny', Action: modelDenyActions(), Resource: '*' }],
    })
    expect(policy.TargetIds).toEqual([fixture.organization.rootId])
  })
})

// --- IAC-10: IAM across the templates ------------------------------------------------------------

// IAM's limits, in characters without whitespace: a role's inline policies together, its trust, a
// managed policy, and a permission set's inline policy, which Identity Center makes a role's.
const LIMIT = { inline: 10_240, trust: 2_048, managed: 6_144, setInline: 10_240 } as const
// What to do when a document passes its limit, named in the failure (TECH-SPEC T24 item 4; C11-D26).
const WHEN_FULL = {
  'hearth-break-glass':
    'move the denies into the customer-managed hearth-break-glass-denies attached by its Roles (TECH-SPEC T24 item 4), before adding a statement',
  'hearth-boundary':
    'drop NoRouteOut, then BreakGlassParameter (the SCPs still deny both; the SMS statements left first, PR 2 question 1), never NoModels, NoLongLivedCredentials or NoNewIdentityProviders',
} as Record<string, string>

// A document's size as IAM counts it: its JSON with no whitespace. A reference CloudFormation
// renders is counted as its intrinsic; log-archive's break-glass role, the one holding one, is
// thousands of characters inside its limit.
const sizeOf = (document: unknown) => JSON.stringify(document).length

describe('IAC-10 C11-D12 C11-D26: IAM in every landing-zone template', () => {
  it('IAC-10: the only Allow of * on * is hearth-boundary’s AllowAll, in each Baseline', () => {
    const found = STACKS.flatMap(({ name }) => {
      const template = templateOf(name)
      return policyStatements(template)
        .filter(s => s.effect === 'Allow' && s.actions.includes('*') && s.resources.includes('*'))
        .map(s => `${name} ${ownerName(template, s.logicalId)} ${s.sid}`)
    })
    expect(found).toEqual([
      'Hearth-nonprod-Baseline hearth-boundary AllowAll',
      'Hearth-prod-Baseline hearth-boundary AllowAll',
    ])
  })

  it('IAC-10 C11-D08: no Allow, in an identity or a resource policy, can delete an S3 object or bucket', () => {
    const found = allows()
      .filter(({ s }) => s.notActions.length > 0 || s.actions.some(action => globsOverlap(lower(action), 's3:delete*')))
      .map(({ stack, template, s }) => `${stack} ${ownerName(template, s.logicalId)} ${s.sid}`)
    expect(found).toEqual([])
  })

  it('IAC-10: every iam:PassRole Allow names its own account’s roles, never a wildcard, for ECS tasks alone', () => {
    const passes = allows().filter(({ s }) => s.actions.some(action => globsOverlap(lower(action), 'iam:passrole')))
    expect(passes.map(({ stack, template, s }) => `${stack} ${ownerName(template, s.logicalId)} ${s.sid}`)).toEqual([
      'Hearth-nonprod-Baseline hearth-gh-deploy PassOneOffRoles',
      'Hearth-nonprod-Baseline hearth-break-glass PassBastionRoles',
      'Hearth-prod-Baseline hearth-gh-deploy PassOneOffRoles',
      'Hearth-prod-Baseline hearth-break-glass PassBastionRoles',
    ])
    for (const { stack, s } of passes) {
      expect(s.actions).toEqual(['iam:PassRole'])
      expect(s.notResources).toEqual([])
      const roles = ['arn', 'aws', 'iam', '', accountOf(stack), 'role/'].join(':')
      for (const resource of s.resources.map(renderIn(stack))) {
        expect(resource?.startsWith(roles) && !resource.includes('*'), `${stack} ${s.sid}: ${resource}`).toBe(true)
      }
      expect(s.condition).toEqual({ StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } })
    }
  })

  it('IAC-10 C11-D12: ecs:ExecuteCommand and ssm:StartSession are allowed only in hearth-break-glass', () => {
    const found = allows()
      .filter(({ s }) =>
        s.actions.some(
          action =>
            globsOverlap(lower(action), 'ecs:executecommand') || globsOverlap(lower(action), 'ssm:startsession'),
        ),
      )
      .map(({ stack, template, s }) => `${stack} ${ownerName(template, s.logicalId)} ${s.sid}`)
    expect(found).toEqual([
      'Hearth-nonprod-Baseline hearth-break-glass ExecCluster',
      'Hearth-nonprod-Baseline hearth-break-glass ExecBastion',
      'Hearth-nonprod-Baseline hearth-break-glass PortForward',
      'Hearth-prod-Baseline hearth-break-glass ExecCluster',
      'Hearth-prod-Baseline hearth-break-glass ExecBastion',
      'Hearth-prod-Baseline hearth-break-glass PortForward',
    ])
  })

  it('IAC-10 C11-D78: rds-db:connect is allowed only in the workload accounts’ hearth-break-glass, the bootstrap login under a bootstrap: or recover: reason and the read-only login under a case: reason', () => {
    const connects = allows().filter(({ s }) => s.actions.some(action => globsOverlap(lower(action), 'rds-db:connect')))
    expect(connects.map(({ stack, template, s }) => `${stack} ${ownerName(template, s.logicalId)} ${s.sid}`)).toEqual([
      'Hearth-nonprod-Baseline hearth-break-glass BootstrapLogin',
      'Hearth-nonprod-Baseline hearth-break-glass ReadOnlyLogin',
      'Hearth-prod-Baseline hearth-break-glass BootstrapLogin',
      'Hearth-prod-Baseline hearth-break-glass ReadOnlyLogin',
    ])
    for (const stack of BASELINES) {
      const dbUser = (login: string) =>
        ['arn', 'aws', 'rds-db', REGION, accountOf(stack), `dbuser:*/${login}`].join(':')
      const bySid = new Map(connects.filter(c => c.stack === stack).map(c => [c.s.sid, c.s]))
      expect(bySid.get('BootstrapLogin')?.resources).toEqual([dbUser('hearth_bootstrap')])
      expect(bySid.get('BootstrapLogin')?.condition).toEqual({
        StringEquals: {
          'aws:PrincipalTag/hearth-reason': ['bootstrap:set-up', 'bootstrap:correct-number', 'recover:twilio'],
        },
      })
      expect(bySid.get('ReadOnlyLogin')?.resources).toEqual([dbUser('hearth_breakglass_read')])
      expect(bySid.get('ReadOnlyLogin')?.condition).toEqual({
        StringLike: { 'aws:PrincipalTag/hearth-reason': 'case:????-????' },
      })
    }
  })

  it('IAC-10 C11-D11: no role’s session lasts more than an hour', () => {
    const found = STACKS.flatMap(({ name }) =>
      ofType(templateOf(name), 'AWS::IAM::Role')
        .filter(
          ([, r]) => r.Properties?.MaxSessionDuration !== undefined && Number(r.Properties.MaxSessionDuration) > 3600,
        )
        .map(([, r]) => `${name} ${String(r.Properties?.RoleName)}`),
    )
    expect(found).toEqual([])
  })

  it('IAC-10: every role’s inline policies and trust, every managed policy and every permission set’s inline policy fit IAM’s limits', () => {
    const over: string[] = []
    const check = (what: string, size: number, limit: number, owner: string) => {
      if (size > limit)
        over.push(`${what} holds ${size} characters, over ${limit}${WHEN_FULL[owner] ? `: ${WHEN_FULL[owner]}` : ''}`)
    }
    for (const { name } of STACKS) {
      const template = templateOf(name)
      for (const [, role] of ofType(template, 'AWS::IAM::Role')) {
        const roleName = String(role.Properties?.RoleName)
        const policies = (role.Properties?.Policies ?? []) as Array<{ PolicyDocument: unknown }>
        const inline = policies.reduce((total, policy) => total + sizeOf(policy.PolicyDocument), 0)
        check(`${name} ${roleName}'s inline policies`, inline, LIMIT.inline, roleName)
        check(`${name} ${roleName}'s trust`, sizeOf(role.Properties?.AssumeRolePolicyDocument), LIMIT.trust, roleName)
      }
      for (const [, policy] of ofType(template, 'AWS::IAM::ManagedPolicy')) {
        const policyName = String(policy.Properties?.ManagedPolicyName)
        check(`${name} ${policyName}`, sizeOf(policy.Properties?.PolicyDocument), LIMIT.managed, policyName)
      }
      for (const [, set] of ofType(template, 'AWS::SSO::PermissionSet')) {
        const setName = String(set.Properties?.Name)
        check(`${name} ${setName}'s inline policy`, sizeOf(set.Properties?.InlinePolicy), LIMIT.setInline, setName)
      }
    }
    expect(over).toEqual([])
  })
})

// --- IAC-13's landing-zone half: what a template may not hold ---------------------------------------

// Each construct a template must not hold (C11-D24, C11-D76; IG-11): a Lambda of any kind, any custom
// resource, a SAM resource, a macro, a nested stack, a transform at the top or at any depth, an import
// at any depth, and an export; and a cross-stack reference in either form aws-cdk-lib makes one
// without an export (cdk.json's weak references): Fn::GetStackOutput at any depth, and the output it
// reads, whose id starts PublishOutput. The workload allowance admits one exception (TECH-SPEC T24
// item 28): in a Platform template, the VPC's default-group custom resource and the one function its
// provider makes, only together and once each.
type TemplateAllowance = 'landing-zone' | 'workload'
// The custom resource aws-cdk-lib's restrictDefaultSecurityGroup makes, the one infra may hold (IG-11).
const DEFAULT_GROUP_RESOURCE = 'Custom::VpcRestrictDefaultSG'
function forbiddenInTemplate(template: Template, allowance: TemplateAllowance, stackName = ''): string[] {
  const found: string[] = []
  const handler =
    allowance === 'workload' &&
    stackName.endsWith('-Platform') &&
    ofType(template, DEFAULT_GROUP_RESOURCE).length === 1 &&
    ofType(template, 'AWS::Lambda::Function').length === 1
  for (const [logicalId, resource] of resources(template)) {
    const type = String(resource.Type)
    if (handler && (type === DEFAULT_GROUP_RESOURCE || type === 'AWS::Lambda::Function')) continue
    if (
      type.startsWith('AWS::Lambda::') ||
      type.startsWith('Custom::') ||
      type.startsWith('AWS::Serverless::') ||
      type === 'AWS::CloudFormation::CustomResource' ||
      type === 'AWS::CloudFormation::Macro' ||
      type === 'AWS::CloudFormation::Stack'
    ) {
      found.push(`${logicalId}: ${type} (not in a ${allowance} template)`)
    }
  }
  if (template.Transform !== undefined) found.push('a top-level Transform')
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      for (const [i, item] of value.entries()) walk(item, `${path}[${i}]`)
    } else if (isObject(value)) {
      for (const [key, inner] of Object.entries(value)) {
        if (key === 'Fn::Transform' || key === 'Fn::ImportValue' || key === 'Fn::GetStackOutput') {
          found.push(`${path}: ${key}`)
        }
        walk(inner, `${path}.${key}`)
      }
    }
  }
  for (const section of ['Resources', 'Outputs', 'Conditions', 'Parameters', 'Mappings', 'Metadata', 'Rules']) {
    walk(template[section], section)
  }
  const outputs = isObject(template.Outputs) ? template.Outputs : {}
  for (const [name, output] of Object.entries(outputs)) {
    if (isObject(output) && output.Export !== undefined) found.push(`Outputs.${name}: an export`)
    if (name.startsWith('PublishOutput')) found.push(`Outputs.${name}: a cross-stack reference's output`)
  }
  return found
}

describe('IAC-13 C11-D24 C11-D76: what no landing-zone template holds', () => {
  it('IAC-13 finds each forbidden construct in a planted template', () => {
    const planted: Template = {
      Transform: 'AWS::Serverless-2016-10-31',
      Resources: {
        Fn: { Type: 'AWS::Lambda::Function' },
        Perm: { Type: 'AWS::Lambda::Permission' },
        Other: { Type: 'Custom::Other' },
        Custom: { Type: 'AWS::CloudFormation::CustomResource' },
        Sam: { Type: 'AWS::Serverless::Function' },
        Macro: { Type: 'AWS::CloudFormation::Macro' },
        Nested: { Type: 'AWS::CloudFormation::Stack' },
        Bucket: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketName: { 'Fn::ImportValue': 'Elsewhere' },
            Tags: [{ 'Fn::Transform': { Name: 'AWS::Include', Parameters: { Location: 'x' } } }],
          },
        },
      },
      Outputs: { Shared: { Value: 'x', Export: { Name: 'Shared' } } },
    }
    expect(forbiddenInTemplate(planted, 'landing-zone')).toEqual([
      'Fn: AWS::Lambda::Function (not in a landing-zone template)',
      'Perm: AWS::Lambda::Permission (not in a landing-zone template)',
      'Other: Custom::Other (not in a landing-zone template)',
      'Custom: AWS::CloudFormation::CustomResource (not in a landing-zone template)',
      'Sam: AWS::Serverless::Function (not in a landing-zone template)',
      'Macro: AWS::CloudFormation::Macro (not in a landing-zone template)',
      'Nested: AWS::CloudFormation::Stack (not in a landing-zone template)',
      'a top-level Transform',
      'Resources.Bucket.Properties.BucketName: Fn::ImportValue',
      'Resources.Bucket.Properties.Tags[0]: Fn::Transform',
      'Outputs.Shared: an export',
    ])
  })

  it.each(STACKS.map(stack => stack.name))('IAC-13 %s holds none of them', name => {
    expect(forbiddenInTemplate(templateOf(name), 'landing-zone')).toEqual([])
  })

  it('IAC-13 C11-D27: each stack goes to its own account in ap-southeast-1, termination-protected, deployed through hearthbase', () => {
    expect(lz.synthesised.stacks.map(stack => stack.stackName)).toEqual(STACKS.map(stack => stack.name))
    for (const stack of lz.synthesised.stacks) {
      const account = accountOf(stack.stackName)
      expect(stack.artifact.account, stack.stackName).toBe(account)
      expect(stack.artifact.region, stack.stackName).toBe(REGION)
      expect(stack.artifact.terminationProtection, stack.stackName).toBe(true)
      expect(
        stack.artifact.assumeRoleArn?.endsWith(`:iam::${account}:role/cdk-hearthbase-deploy-role-${account}-${REGION}`),
        stack.stackName,
      ).toBe(true)
      expect(stack.artifact.bootstrapStackVersionSsmParameter, stack.stackName).toBe(
        '/cdk-bootstrap/hearthbase/version',
      )
    }
  })
})

// --- IAC-22: the assets are the templates alone ---------------------------------------------------

// The one packaged asset the workload may publish (TECH-SPEC T24 item 28): the VPC's default-group
// handler's code, which aws-cdk-lib zips in-process into each Platform stack's assets, admitted by its
// display name and packaging, never its hash, which changes with aws-cdk-lib.
const HANDLER_CODE = 'Custom::VpcRestrictDefaultSGCustomResourceProvider Code'
// A Platform stack's asset manifest, as a stage's nested assembly names it (`nonprodPlatform<hash>`).
const PLATFORM_MANIFEST = /(?:^|\/)[a-z]+Platform[0-9A-F]{8}\.assets\.json$/

// IAC-22 (C11-D76), this file's own copy (entries.test.ts holds the entry's): what an asset manifest
// would make the CLI run or build. A landing-zone stack publishes its template alone; a workload stack
// the same, and each Platform stack exactly one handler zip besides, which runs nothing either.
function assetProblems(
  manifests: ReadonlyMap<string, unknown>,
  allowance: TemplateAllowance = 'landing-zone',
): string[] {
  const found: string[] = []
  for (const [path, manifest] of manifests) {
    const { files, dockerImages } = manifest as {
      files?: Record<string, unknown>
      dockerImages?: Record<string, unknown>
    }
    if (dockerImages !== undefined && Object.keys(dockerImages).length > 0) found.push(`${path}: a Docker image`)
    const platform = allowance === 'workload' && PLATFORM_MANIFEST.test(path)
    let handlers = 0
    for (const [id, file] of Object.entries(files ?? {})) {
      const { source = {}, displayName } = file as { source?: Record<string, unknown>; displayName?: unknown }
      if ('executable' in source) found.push(`${path}: ${id} runs a command`)
      if (
        platform &&
        source.packaging === 'zip' &&
        typeof displayName === 'string' &&
        displayName.endsWith(HANDLER_CODE)
      ) {
        handlers += 1
        continue
      }
      if (source.packaging !== undefined && source.packaging !== 'file') found.push(`${path}: ${id} is packaged`)
      if (typeof source.path !== 'string' || !source.path.endsWith('.template.json')) {
        found.push(`${path}: ${id} isn't a template`)
      }
    }
    if (platform && handlers !== 1) found.push(`${path}: holds ${handlers} handler zips, not one`)
  }
  return found
}

describe('IAC-22 C11-D76: the landing zone publishes its templates alone', () => {
  it('IAC-22 finds a command, a Docker image and a packaged file, on planted manifests', () => {
    expect(
      assetProblems(
        new Map<string, unknown>([
          ['a.assets.json', { files: { x: { source: { executable: ['sh', '-c', 'x'], path: 'x.template.json' } } } }],
          ['b.assets.json', { dockerImages: { y: { source: { directory: '.' } } } }],
          ['c.assets.json', { files: { z: { source: { path: 'z.zip', packaging: 'zip' } } } }],
        ]),
      ),
    ).toEqual([
      'a.assets.json: x runs a command',
      'b.assets.json: a Docker image',
      'c.assets.json: z is packaged',
      "c.assets.json: z isn't a template",
    ])
  })

  it('IAC-22: each stack’s one asset manifest lists its template alone', () => {
    expect([...lz.synthesised.assetManifests.keys()].sort()).toEqual(
      STACKS.map(stack => `${stack.name}.assets.json`).sort(),
    )
    expect(assetProblems(lz.synthesised.assetManifests)).toEqual([])
  })
})

// --- The workload's templates (C0.11 PR 3) --------------------------------------------------------

// The workload's four stacks per stage (C11-D27), and each build's templates by stack name.
const PARTS = ['Platform', 'Data', 'Tasks', 'Services'] as const
const KINDS = ['api', 'realtime', 'worker', 'migrate', 'probe', 'bastion'] as const
// Each build the pipeline deploys, with the stages it holds: the drill's builds non-prod's alone, and
// the pipeline deploys it to non-prod at each rehearsal (C11-D59), so every rule here reads it too.
const builds = (): ReadonlyArray<readonly [string, WorkloadSynth, readonly EnvironmentName[]]> => [
  ['committed', workload, ENVIRONMENTS],
  ['restore-active', active, ENVIRONMENTS],
  ['drill', drill, ['nonprod']],
]
// The builds that hold a stage.
const buildsWith = (env: EnvironmentName) => builds().filter(([, , envs]) => envs.includes(env))
// Every workload template of every build, as `<build> <stack>`.
function workloadTemplates(): Array<{ label: string; name: string; env: EnvironmentName; template: Template }> {
  return builds().flatMap(([build, synth]) =>
    Object.entries(synth.templates).map(([name, template]) => ({
      label: `${build} ${name}`,
      name,
      env: name.split('-')[1] as EnvironmentName,
      template,
    })),
  )
}
const workloadTemplate = (synth: WorkloadSynth, env: EnvironmentName, part: (typeof PARTS)[number]): Template => {
  const template = synth.templates[`Hearth-${env}-${part}`]
  if (template === undefined) throw new Error(`no Hearth-${env}-${part}`)
  return template
}

// A made-up account the workload's pseudo-parameters render to (the stacks are account-agnostic).
const ACCOUNT = fixtureAccount(7)
const workloadArn = (service: string, region: string, resource: string) =>
  ['arn', 'aws', service, region, ACCOUNT, resource].join(':')
// A workload value with every intrinsic renderedString can read rendered in the made-up account.
function renderedIn(value: unknown, template: Template): unknown {
  const text = renderedString(value, { account: ACCOUNT, region: REGION, template })
  if (text !== undefined && typeof value !== 'string') return text
  if (Array.isArray(value)) return value.map(item => renderedIn(item, template))
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renderedIn(v, template)]))
  return value
}
const refOf = (value: unknown): string | undefined =>
  isObject(value) && typeof value.Ref === 'string' ? value.Ref : undefined
function getAttOf(value: unknown, attribute: string): string | undefined {
  const getAtt = isObject(value) ? value['Fn::GetAtt'] : undefined
  return Array.isArray(getAtt) && getAtt[1] === attribute && typeof getAtt[0] === 'string' ? getAtt[0] : undefined
}
const asList = (value: unknown): unknown[] => (value === undefined ? [] : Array.isArray(value) ? value : [value])
// The logical id of the SSM parameter a template reads by a name, or undefined.
const parameterNamed = (template: Template, name: string): string | undefined =>
  Object.entries(isObject(template.Parameters) ? template.Parameters : {}).find(
    ([, parameter]) => isObject(parameter) && parameter.Default === name,
  )?.[0]
const tagOf = (resource: Resource, key: string): unknown =>
  ((resource.Properties?.Tags ?? []) as Array<{ Key: string; Value: unknown }>).find(tag => tag.Key === key)?.Value
// A copy of a template with its resources edited.
function plantedIn(template: Template, edit: (resources: Record<string, Resource>) => void): Template {
  const copy = structuredClone(template)
  edit(copy.Resources as Record<string, Resource>)
  return copy
}

// --- IAC-01 over the workload ---------------------------------------------------------------------

describe('IAC-01 C11-D06: no model permission in any workload template', () => {
  it('IAC-01: every workload template reads, and passes the model check with no allowance at all', () => {
    for (const { label, template } of workloadTemplates()) {
      expect(unreadablePolicies(template), label).toEqual([])
      expect(modelCheck(template, { grants: [], attachments: [] }), label).toEqual([])
    }
  })

  it('IAC-01: no Allow names a model action, and none can grant one (no `*`, no model-overlapping `<service>:*`), so whether a boundary attached by ARN covers it never arises', () => {
    for (const { label, template } of workloadTemplates()) {
      const statements = policyStatements(template)
      if (label.endsWith('-Platform')) expect(statements.length, label).toBeGreaterThan(0)
      const named = statements
        .filter(s => s.effect === 'Allow')
        .flatMap(s => s.actions.filter(namesModelAction).map(action => `${s.logicalId} ${s.sid}: ${action}`))
      expect(named, label).toEqual([])
      expect(
        modelGrants(statements).map(s => `${s.logicalId} ${s.sid}`),
        `${label}: an Allow that can grant a model action would need its principal's own deny, which no workload role holds`,
      ).toEqual([])
    }
  })

  it('IAC-01 C11-D26: no workload template attaches a managed policy; each role’s boundary is the only policy referenced by ARN', () => {
    for (const { label, template } of workloadTemplates()) {
      const attached = managedPolicyAttachments(template)
      expect(
        attached.filter(a => a.where !== 'PermissionsBoundary').map(a => `${a.logicalId} ${a.where}`),
        label,
      ).toEqual([])
      expect(attached.length, label).toBe(ofType(template, 'AWS::IAM::Role').length)
    }
  })
})

// --- IAC-10 over the workload ---------------------------------------------------------------------

// Who may assume a task or execution role (C11-D38): ECS's tasks, for this account's own clusters.
const ECS_TASKS_TRUST = () => ({
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'EcsTasks',
      Effect: 'Allow',
      Principal: { Service: 'ecs-tasks.amazonaws.com' },
      Action: 'sts:AssumeRole',
      Condition: {
        StringEquals: { 'aws:SourceAccount': ACCOUNT },
        ArnLike: { 'aws:SourceArn': workloadArn('ecs', REGION, '*') },
      },
    },
  ],
})
// ECS Exec's four channel actions, which the bastion's task role alone holds (C11-D40).
const EXEC_CHANNELS = ['Create', 'Open'].flatMap(verb =>
  ['Control', 'Data'].map(channel => `ssmmessages:${verb}${channel}Channel`),
)
// A task role's policy (C11-D33, C11-D40): the network perimeter on its stage's VPC while the profile
// has it on, and the bastion's channels; a role with neither holds none.
function taskStatements(kind: string, perimeter: boolean, vpc: string): Array<Record<string, unknown>> {
  return [
    ...(perimeter
      ? [
          {
            Sid: 'NetworkPerimeter',
            Effect: 'Deny',
            NotAction: 'rds-db:connect',
            Resource: '*',
            Condition: {
              StringNotEqualsIfExists: { 'aws:SourceVpc': { Ref: vpc } },
              BoolIfExists: { 'aws:ViaAWSService': 'false' },
            },
          },
        ]
      : []),
    ...(kind === 'bastion' ? [{ Sid: 'EcsExecChannels', Effect: 'Allow', Action: EXEC_CHANNELS, Resource: '*' }] : []),
  ]
}
// An execution role's policy (C11-D35, C11-D38): the server image, the registry's token, its own log
// group's streams, and the api's AUTH_SECRET by its name and the six characters Secrets Manager adds.
function execStatements(env: EnvironmentName, kind: string): Array<Record<string, unknown>> {
  return [
    {
      Sid: 'PullServerImage',
      Effect: 'Allow',
      Action: ['ecr:BatchCheckLayerAvailability', 'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'],
      Resource: workloadArn('ecr', REGION, 'repository/hearth-server'),
    },
    { Sid: 'RegistryToken', Effect: 'Allow', Action: 'ecr:GetAuthorizationToken', Resource: '*' },
    {
      Sid: 'WriteOwnLogs',
      Effect: 'Allow',
      Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      Resource: workloadArn('logs', REGION, `log-group:/hearth/${env}/${kind}:log-stream:*`),
    },
    ...(kind === 'api'
      ? [
          {
            Sid: 'ReadAuthSecret',
            Effect: 'Allow',
            Action: 'secretsmanager:GetSecretValue',
            Resource: workloadArn('secretsmanager', REGION, `secret:hearth/${env}/auth-secret-??????`),
          },
        ]
      : []),
  ]
}
// The boundary every workload role carries, as an ARN in the made-up account.
const BOUNDARY_ARN = workloadArn('iam', '', 'policy/hearth-boundary')
// A role's properties exactly, rendered: its name, the ECS trust, the boundary and its one policy.
function expectedRole(name: string, policyName: string, statements: Array<Record<string, unknown>>) {
  return {
    AssumeRolePolicyDocument: ECS_TASKS_TRUST(),
    PermissionsBoundary: BOUNDARY_ARN,
    ...(statements.length === 0
      ? {}
      : { Policies: [{ PolicyDocument: { Version: '2012-10-17', Statement: statements }, PolicyName: policyName }] }),
    RoleName: name,
  }
}
const renderedRole = (role: Resource, template: Template) => renderedIn(role.Properties, template)

// The two roles the stage holds beside the twelve, which network.ts and aws-cdk-lib make rather than
// roles.ts, pinned here as exactly as those: the flow log's (C11-D32), which VPC Flow Logs alone, for
// this account's own flow logs, may assume, to write to its own group; and the default-group handler's
// (T24 item 28), which Lambda may assume, to revoke the VPC's default group's rules and nothing else,
// with no managed policy (network.ts's confineDefaultSgHandler takes Lambda's logging one off).
function expectedFlowLogRole(env: EnvironmentName) {
  const group = workloadArn('logs', REGION, `log-group:/hearth/${env}/vpc-flow`)
  return {
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
            ArnLike: { 'aws:SourceArn': workloadArn('ec2', REGION, 'vpc-flow-log/*') },
          },
        },
      ],
    },
    PermissionsBoundary: BOUNDARY_ARN,
    Policies: [
      {
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
        PolicyName: 'hearth-flow-log',
      },
    ],
  }
}
// The handler's role, its one resource the VPC's default group, whose id the template reads from the
// VPC (rendered as far as it goes: the group's id is the VPC's attribute).
function expectedHandlerRole(vpc: string) {
  return {
    AssumeRolePolicyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'sts:AssumeRole', Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' } }],
    },
    PermissionsBoundary: BOUNDARY_ARN,
    Policies: [
      {
        PolicyName: 'Inline',
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['Authorize', 'Revoke'].flatMap(verb =>
                ['Ingress', 'Egress'].map(direction => `ec2:${verb}SecurityGroup${direction}`),
              ),
              Resource: [
                {
                  'Fn::Join': [
                    '',
                    [
                      ['arn', 'aws', 'ec2', REGION, ''].join(':'),
                      ACCOUNT,
                      ':security-group/',
                      { 'Fn::GetAtt': [vpc, 'DefaultSecurityGroup'] },
                    ],
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  }
}
// The roles the resources of a type in a template name by a property's Fn::GetAtt Arn, by logical id,
// and any named some other way as the type and property, so it matches no role.
function roleBehind(template: Template, type: string, property: string): string[] {
  return ofType(template, type).map(([, r]) => getAttOf(r.Properties?.[property], 'Arn') ?? `${type} ${property}?`)
}

// Each task definition's roles (C11-D35, C11-D38): its family names its kind, `hearth-<env>-<kind>`,
// and it runs as that kind's task role and pulls with that kind's execution role, by their ARNs in the
// account, so no definition takes another kind's grants, or a role the pins above don't read, through
// a file off the owner's-read list; and only the api's holds a secret, the AUTH_SECRET its execution
// role alone may read.
function taskDefinitionProblems(template: Template, env: EnvironmentName): string[] {
  const arn = (value: unknown) => renderedString(value, { account: ACCOUNT, region: REGION, template })
  return ofType(template, 'AWS::ECS::TaskDefinition').flatMap(([id, r]) => {
    const p = r.Properties ?? {}
    const kind = KINDS.find(k => p.Family === `hearth-${env}-${k}`)
    if (kind === undefined) return [`${id}: its family ${JSON.stringify(p.Family)} names no kind of the stage`]
    const containers = asList(p.ContainerDefinitions) as Array<Record<string, unknown>>
    return [
      ...(arn(p.TaskRoleArn) === workloadArn('iam', '', `role/hearth-${env}-${kind}-task`)
        ? []
        : [`${id}: doesn't run as ${kind}'s task role`]),
      ...(arn(p.ExecutionRoleArn) === workloadArn('iam', '', `role/hearth-${env}-${kind}-exec`)
        ? []
        : [`${id}: doesn't pull with ${kind}'s execution role`]),
      ...(kind === 'api' || containers.every(c => asList(c.Secrets).length === 0)
        ? []
        : [`${id}: a secret outside the api's definition`]),
    ]
  })
}

// Every Allow in the workload, by template, which may not grant what IAC-10 keeps for break-glass and
// the pipeline: a database login, a session into a task, a role passed on, an S3 delete, or anything
// on `*`; nor may any Allow be written with NotAction, which grants everything it doesn't name.
const KEPT_ACTIONS = ['rds-db:connect', 'ecs:executecommand', 'ssm:startsession', 'iam:passrole', 's3:delete*']
function keptGrants(template: Template): string[] {
  return policyStatements(template)
    .filter(s => s.effect === 'Allow')
    .flatMap(s => [
      ...s.actions
        .filter(action => action === '*' || KEPT_ACTIONS.some(kept => globsOverlap(lower(action), kept)))
        .map(action => `${s.logicalId} ${s.sid}: ${action}`),
      ...(s.notActions.length > 0 ? [`${s.logicalId} ${s.sid}: NotAction`] : []),
    ])
}

// The policy documents a workload template may hold (C11-D38, C11-D30): a role's own trust and inline
// policy, which the cases below pin, and an endpoint's policy, which IAC-12 pins; a log group may be
// made, holding none. Any other resource that holds a document, or grants a role more by naming it (a
// policy, a managed policy, a role's, user's or group's policy, a user, a group), and any resource
// policy (a secret's, a log group's, a bucket's, a key's), is reported, so no file off the
// owner's-read list grants a workload role more, or opens one of the workload's resources, without a
// change to this file.
const ADMITTED_DOCUMENTS: Readonly<Record<string, readonly string[]>> = {
  'AWS::IAM::Role': ['AssumeRolePolicyDocument', 'Policies'],
  'AWS::EC2::VPCEndpoint': ['PolicyDocument'],
  'AWS::Logs::LogGroup': [],
}
function otherPolicies(template: Template): string[] {
  return resources(template).flatMap(([id, r]) => {
    if (!Object.hasOwn(DOCUMENT_PROPERTIES, r.Type)) return []
    if (!Object.hasOwn(ADMITTED_DOCUMENTS, r.Type)) return [`${id}: ${r.Type}`]
    const admitted = ADMITTED_DOCUMENTS[r.Type] ?? []
    return (DOCUMENT_PROPERTIES[r.Type] ?? [])
      .filter(place => !admitted.includes(place) && r.Properties?.[place] !== undefined)
      .map(place => `${id}: ${r.Type} ${place}`)
  })
}

describe('IAC-10 C11-D26 C11-D33 C11-D38: IAM in every workload template', () => {
  it('IAC-10 C11-D26: every role in every workload template carries hearth-boundary at creation', () => {
    for (const { label, template } of workloadTemplates()) {
      const roles = ofType(template, 'AWS::IAM::Role')
      for (const [id, role] of roles) {
        expect(
          renderedString(role.Properties?.PermissionsBoundary, { account: ACCOUNT, region: REGION, template }),
          `${label} ${id}`,
        ).toBe(BOUNDARY_ARN)
      }
    }
  })

  it.each(ENVIRONMENTS)(
    'IAC-10 C11-D38 %s: the stage’s named roles are exactly its six kinds’ task and execution roles, none for rule9, and its only unnamed roles are its Platform’s flow log’s and default-group handler’s',
    env => {
      for (const [build, synth] of buildsWith(env)) {
        const roles = PARTS.flatMap(part =>
          ofType(workloadTemplate(synth, env, part), 'AWS::IAM::Role').map(([id, r]) => ({ part, id, r })),
        )
        expect(
          roles
            .map(({ r }) => r.Properties?.RoleName)
            .filter(name => name !== undefined)
            .sort(),
          build,
        ).toEqual(KINDS.flatMap(kind => [`hearth-${env}-${kind}-exec`, `hearth-${env}-${kind}-task`]).sort())
        const behind = (type: string, property: string) =>
          PARTS.flatMap(part =>
            roleBehind(workloadTemplate(synth, env, part), type, property).map(id => `${part} ${id}`),
          )
        const flowLog = behind('AWS::EC2::FlowLog', 'DeliverLogsPermissionArn')
        const handler = behind('AWS::Lambda::Function', 'Role')
        expect([flowLog.length, handler.length], build).toEqual([1, 1])
        expect(flowLog[0]?.startsWith('Platform '), build).toBe(true)
        expect(
          roles
            .filter(({ r }) => r.Properties?.RoleName === undefined)
            .map(({ part, id }) => `${part} ${id}`)
            .sort(),
          build,
        ).toEqual([...flowLog, ...handler].sort())
        expect(JSON.stringify(roles), build).not.toContain('rule9')
      }
    },
  )

  it.each(ENVIRONMENTS)(
    'IAC-10 C11-D32 %s: the flow log’s role and the default-group handler’s are each exactly their trust, boundary and policy',
    env => {
      for (const [build, synth] of buildsWith(env)) {
        const platform = workloadTemplate(synth, env, 'Platform')
        const vpc = ofType(platform, 'AWS::EC2::VPC')[0]?.[0] ?? ''
        const role = (id: string | undefined) =>
          ofType(platform, 'AWS::IAM::Role').find(([roleId]) => roleId === id)?.[1] ?? { Type: 'missing' }
        const [flowLog] = roleBehind(platform, 'AWS::EC2::FlowLog', 'DeliverLogsPermissionArn')
        const [handler] = roleBehind(platform, 'AWS::Lambda::Function', 'Role')
        expect(renderedRole(role(flowLog), platform), `${build} flow log`).toEqual(expectedFlowLogRole(env))
        expect(renderedRole(role(handler), platform), `${build} handler`).toEqual(expectedHandlerRole(vpc))
      }
    },
  )

  it('IAC-10 C11-D32 C11-D38 finds the flow log’s role re-trusted and granted more, the handler’s granted a way out, and a definition on another kind’s roles, on a role from a parameter, with another kind’s secret or of no kind, planted in copies of the real templates', () => {
    const platform = workloadTemplate(workload, 'nonprod', 'Platform')
    const [flowLog = ''] = roleBehind(platform, 'AWS::EC2::FlowLog', 'DeliverLogsPermissionArn')
    const [handler = ''] = roleBehind(platform, 'AWS::Lambda::Function', 'Role')
    const vpc = ofType(platform, 'AWS::EC2::VPC')[0]?.[0] ?? ''
    const edited = plantedIn(platform, resources => {
      const flowLogRole = resources[flowLog]?.Properties as {
        AssumeRolePolicyDocument: { Statement: unknown[] }
        Policies: Array<{ PolicyDocument: { Statement: unknown[] } }>
      }
      flowLogRole.AssumeRolePolicyDocument.Statement.push({
        Effect: 'Allow',
        Principal: { Service: 'ecs-tasks.amazonaws.com' },
        Action: 'sts:AssumeRole',
      })
      flowLogRole.Policies[0]?.PolicyDocument.Statement.push({
        Effect: 'Allow',
        Action: 'secretsmanager:GetSecretValue',
        Resource: workloadArn('secretsmanager', REGION, 'secret:hearth/*'),
      })
      const handlerRole = resources[handler]?.Properties as {
        Policies: Array<{ PolicyDocument: { Statement: unknown[] } }>
      }
      handlerRole.Policies[0]?.PolicyDocument.Statement.push({
        Effect: 'Allow',
        Action: 'ec2:CreateRoute',
        Resource: '*',
      })
    })
    const role = (template: Template, id: string) => (template.Resources as Record<string, Resource>)[id] as Resource
    expect(renderedRole(role(platform, flowLog), platform)).toEqual(expectedFlowLogRole('nonprod'))
    expect(renderedRole(role(platform, handler), platform)).toEqual(expectedHandlerRole(vpc))
    expect(federatedTrustProblems(platform)).toEqual([])
    expect(renderedRole(role(edited, flowLog), edited)).not.toEqual(expectedFlowLogRole('nonprod'))
    expect(renderedRole(role(edited, handler), edited)).not.toEqual(expectedHandlerRole(vpc))
    expect(federatedTrustProblems(edited)).toEqual([
      `${flowLog}: trusts ecs-tasks.amazonaws.com, which only the twelve task and execution roles may`,
    ])

    const services = workloadTemplate(workload, 'nonprod', 'Services')
    const tasks = workloadTemplate(workload, 'nonprod', 'Tasks')
    expect(taskDefinitionProblems(services, 'nonprod')).toEqual([])
    expect(taskDefinitionProblems(tasks, 'nonprod')).toEqual([])
    const definition = (template: Template, kind: string) =>
      ofType(template, 'AWS::ECS::TaskDefinition').find(
        ([, r]) => r.Properties?.Family === `hearth-nonprod-${kind}`,
      ) as [string, Resource]
    const [api, apiDefinition] = definition(services, 'api')
    const [worker] = definition(services, 'worker')
    const [realtime] = definition(services, 'realtime')
    const [bastion, bastionDefinition] = definition(tasks, 'bastion')
    const parameter = parameterNamed(services, ['', 'hearth', 'nonprod', 'valkey', 'endpoint'].join('/'))
    const swapped = plantedIn(services, resources => {
      const apiProperties = resources[api]?.Properties ?? {}
      const workerProperties = resources[worker]?.Properties ?? {}
      const realtimeProperties = resources[realtime]?.Properties ?? {}
      workerProperties.ExecutionRoleArn = structuredClone(apiDefinition.Properties?.ExecutionRoleArn)
      const [workerContainer] = (workerProperties.ContainerDefinitions ?? []) as Array<Record<string, unknown>>
      const [apiContainer] = (apiDefinition.Properties?.ContainerDefinitions ?? []) as Array<Record<string, unknown>>
      if (workerContainer !== undefined) workerContainer.Secrets = structuredClone(apiContainer?.Secrets)
      apiProperties.TaskRoleArn = structuredClone(bastionDefinition.Properties?.TaskRoleArn)
      realtimeProperties.TaskRoleArn = { Ref: parameter }
      resources.Unkinded = { Type: 'AWS::ECS::TaskDefinition', Properties: { Family: 'hearth-nonprod-planted' } }
    })
    expect(taskDefinitionProblems(swapped, 'nonprod')).toEqual([
      `${api}: doesn't run as api's task role`,
      `${realtime}: doesn't run as realtime's task role`,
      `${worker}: doesn't pull with worker's execution role`,
      `${worker}: a secret outside the api's definition`,
      'Unkinded: its family "hearth-nonprod-planted" names no kind of the stage',
    ])
    const exec = plantedIn(tasks, resources => {
      const properties = resources[bastion]?.Properties
      if (properties !== undefined) delete properties.ExecutionRoleArn
    })
    expect(taskDefinitionProblems(exec, 'nonprod')).toEqual([`${bastion}: doesn't pull with bastion's execution role`])
  })

  it.each(ENVIRONMENTS)(
    'IAC-10 C11-D35 C11-D38 %s: every task definition runs as its own kind’s task role and pulls with its own kind’s execution role, each kind has one, and only the api’s holds a secret',
    env => {
      for (const [build, synth] of buildsWith(env)) {
        const templates = PARTS.map(part => workloadTemplate(synth, env, part))
        expect(
          templates.flatMap(template => taskDefinitionProblems(template, env)),
          build,
        ).toEqual([])
        expect(
          [
            ...new Set(
              templates.flatMap(template =>
                ofType(template, 'AWS::ECS::TaskDefinition').map(([, r]) => r.Properties?.Family),
              ),
            ),
          ].sort(),
          build,
        ).toEqual(KINDS.map(kind => `hearth-${env}-${kind}`).sort())
      }
    },
  )

  it.each(ENVIRONMENTS)(
    'IAC-10 C11-D33 C11-D38 %s: each task and execution role is exactly its trust, boundary and policy, the perimeter on the task roles in non-prod and restore and on none in prod, pinned literally, never on an execution role',
    env => {
      // Literal, never read from PROFILES: taskRolePerimeter is off the owner's-read list, so this pin
      // is what makes turning the perimeter off in non-prod or restore need the owner's read; turning
      // it on in prod changes this line too (the variant case below proves prod's follows the profile).
      const perimeter = env !== 'prod'
      for (const [build, synth] of buildsWith(env)) {
        const platform = workloadTemplate(synth, env, 'Platform')
        const vpc = ofType(platform, 'AWS::EC2::VPC')[0]?.[0] ?? ''
        for (const kind of KINDS) {
          const named = (name: string) =>
            ofType(platform, 'AWS::IAM::Role').find(([, r]) => r.Properties?.RoleName === name)?.[1]
          const task = named(`hearth-${env}-${kind}-task`)
          const exec = named(`hearth-${env}-${kind}-exec`)
          if (task === undefined || exec === undefined) throw new Error(`${build} ${env} ${kind}: a role is missing`)
          expect(renderedRole(task, platform), `${build} ${env} ${kind} task`).toEqual(
            expectedRole(`hearth-${env}-${kind}-task`, 'hearth-task', taskStatements(kind, perimeter, vpc)),
          )
          expect(renderedRole(exec, platform), `${build} ${env} ${kind} exec`).toEqual(
            expectedRole(`hearth-${env}-${kind}-exec`, 'hearth-exec', execStatements(env, kind)),
          )
        }
      }
    },
  )

  it('IAC-10 C11-D33: the variant with prod’s perimeter on gives prod’s task roles the perimeter on prod’s VPC, as non-prod’s have it now', () => {
    const variant = synthWorkload({ profiles: { prod: { taskRolePerimeter: true } } })
    const platform = workloadTemplate(variant, 'prod', 'Platform')
    const vpc = ofType(platform, 'AWS::EC2::VPC')[0]?.[0] ?? ''
    for (const kind of KINDS) {
      const [, task] = ofType(platform, 'AWS::IAM::Role').find(
        ([, r]) => r.Properties?.RoleName === `hearth-prod-${kind}-task`,
      ) as [string, Resource]
      expect(renderedRole(task, platform), kind).toEqual(
        expectedRole(`hearth-prod-${kind}-task`, 'hearth-task', taskStatements(kind, true, vpc)),
      )
    }
  }, 60_000)

  it('IAC-10 C11-D12 finds an Allow of each kept action, of `*` and with NotAction, and no Deny, planted in a copy of a real workload template', () => {
    const platform = workloadTemplate(workload, 'nonprod', 'Platform')
    expect(keptGrants(platform)).toEqual([])
    const [roleId] = ofType(platform, 'AWS::IAM::Role').find(
      ([, r]) => r.Properties?.RoleName === 'hearth-nonprod-api-task',
    ) as [string, Resource]
    const s3Delete = ['s3', ['Delete', 'Bucket'].join('')].join(':')
    const planted = plantedIn(platform, resources => {
      resources.PlantedPolicy = {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: 'planted',
          Roles: [{ Ref: roleId }],
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              { Sid: 'Login', Effect: 'Allow', Action: 'rds-db:connect', Resource: '*' },
              { Sid: 'Exec', Effect: 'Allow', Action: 'ecs:ExecuteCommand', Resource: '*' },
              { Sid: 'Session', Effect: 'Allow', Action: 'ssm:StartSession', Resource: '*' },
              { Sid: 'Pass', Effect: 'Allow', Action: 'iam:PassRole', Resource: '*' },
              { Sid: 'Delete', Effect: 'Allow', Action: s3Delete, Resource: '*' },
              { Sid: 'Everything', Effect: 'Allow', Action: '*', Resource: '*' },
              { Sid: 'AllBut', Effect: 'Allow', NotAction: 'logs:PutLogEvents', Resource: '*' },
              { Sid: 'Refused', Effect: 'Deny', Action: ['ecs:ExecuteCommand', '*'], Resource: '*' },
            ],
          },
        },
      }
    })
    expect(unreadablePolicies(planted)).toEqual([])
    expect(keptGrants(planted)).toEqual([
      'PlantedPolicy Login: rds-db:connect',
      'PlantedPolicy Exec: ecs:ExecuteCommand',
      'PlantedPolicy Session: ssm:StartSession',
      'PlantedPolicy Pass: iam:PassRole',
      `PlantedPolicy Delete: ${s3Delete}`,
      'PlantedPolicy Everything: *',
      'PlantedPolicy AllBut: NotAction',
    ])
  })

  it('IAC-10 C11-D12: no Allow in any workload template grants a database login, a session into a task, a role passed on, an S3 delete, or anything on `*`, and none has NotAction', () => {
    for (const { label, template } of workloadTemplates()) expect(keptGrants(template), label).toEqual([])
  })

  it('IAC-10 C11-D38 finds a policy naming a role by name and by Ref, a managed, role, user or group policy, a user, a group, a secret’s resource policy and a log group’s, planted in copies of the real templates', () => {
    const platform = workloadTemplate(workload, 'nonprod', 'Platform')
    const services = workloadTemplate(workload, 'nonprod', 'Services')
    const data = workloadTemplate(workload, 'nonprod', 'Data')
    for (const template of [platform, services, data]) expect(otherPolicies(template)).toEqual([])
    const document = (Action: string, Resource: unknown) => ({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Action, Resource }],
    })
    const authSecret = { Ref: parameterNamed(services, ['', 'hearth', 'nonprod', 'auth-secret', 'arn'].join('/')) }
    const read = plantedIn(services, resources => {
      resources.Reader = {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: 'planted',
          Roles: ['hearth-nonprod-worker-task'],
          PolicyDocument: document('secretsmanager:GetSecretValue', authSecret),
        },
      }
    })
    expect(unreadablePolicies(read)).toEqual([])
    expect(otherPolicies(read)).toEqual(['Reader: AWS::IAM::Policy'])
    const [roleId] = ofType(platform, 'AWS::IAM::Role').find(
      ([, r]) => r.Properties?.RoleName === 'hearth-nonprod-worker-task',
    ) as [string, Resource]
    const [logGroup] = ofType(platform, 'AWS::Logs::LogGroup')[0] as [string, Resource]
    const granted = plantedIn(platform, resources => {
      const group = resources[logGroup]
      if (group?.Properties !== undefined) {
        group.Properties.ResourcePolicyDocument = document('logs:GetLogEvents', '*')
      }
      const reads = document('ssm:GetParameter', '*')
      resources.Managed = {
        Type: 'AWS::IAM::ManagedPolicy',
        Properties: { Roles: [{ Ref: roleId }], PolicyDocument: reads },
      }
      resources.Inline = {
        Type: 'AWS::IAM::RolePolicy',
        Properties: { RoleName: { Ref: roleId }, PolicyName: 'planted', PolicyDocument: reads },
      }
      resources.User = { Type: 'AWS::IAM::User', Properties: {} }
      resources.UserInline = {
        Type: 'AWS::IAM::UserPolicy',
        Properties: { UserName: { Ref: 'User' }, PolicyName: 'planted', PolicyDocument: reads },
      }
      resources.Group = { Type: 'AWS::IAM::Group', Properties: {} }
      resources.GroupInline = {
        Type: 'AWS::IAM::GroupPolicy',
        Properties: { GroupName: { Ref: 'Group' }, PolicyName: 'planted', PolicyDocument: reads },
      }
    })
    expect(otherPolicies(granted)).toEqual([
      `${logGroup}: AWS::Logs::LogGroup ResourcePolicyDocument`,
      'Managed: AWS::IAM::ManagedPolicy',
      'Inline: AWS::IAM::RolePolicy',
      'User: AWS::IAM::User',
      'UserInline: AWS::IAM::UserPolicy',
      'Group: AWS::IAM::Group',
      'GroupInline: AWS::IAM::GroupPolicy',
    ])
    const [secretId] = ofType(data, 'AWS::SecretsManager::Secret')[0] as [string, Resource]
    const opened = plantedIn(data, resources => {
      resources.Opened = {
        Type: 'AWS::SecretsManager::ResourcePolicy',
        Properties: {
          SecretId: { Ref: secretId },
          ResourcePolicy: document('secretsmanager:GetSecretValue', '*'),
        },
      }
    })
    expect(otherPolicies(opened)).toEqual(['Opened: AWS::SecretsManager::ResourcePolicy'])
  })

  it('IAC-10 C11-D38: no workload template holds a policy document but a role’s own trust and inline policy and an endpoint’s policy, nor a policy, user or group resource that grants a role more, in any build', () => {
    for (const { label, template } of workloadTemplates()) expect(otherPolicies(template), label).toEqual([])
  })

  it('IAC-10 C11-D11: no workload role’s session lasts more than an hour, and every role’s inline policies and trust fit IAM’s limits', () => {
    for (const { label, template } of workloadTemplates()) {
      for (const [id, role] of ofType(template, 'AWS::IAM::Role')) {
        const duration = role.Properties?.MaxSessionDuration
        expect(duration === undefined || Number(duration) <= 3600, `${label} ${id}`).toBe(true)
        const policies = (role.Properties?.Policies ?? []) as Array<{ PolicyDocument: unknown }>
        const inline = policies.reduce((total, policy) => total + sizeOf(policy.PolicyDocument), 0)
        expect(inline, `${label} ${id}`).toBeLessThanOrEqual(LIMIT.inline)
        expect(sizeOf(role.Properties?.AssumeRolePolicyDocument), `${label} ${id}`).toBeLessThanOrEqual(LIMIT.trust)
      }
    }
  })
})

// --- IAC-12: the VPC endpoints --------------------------------------------------------------------

// The endpoints C11-D30 gives a stage, by service: the S3 gateway always, and the five interface
// endpoints a Fargate task and the bastion need wherever the stage runs (non-prod, prod, and restore
// while restoreActive is set), each with its service's actions and the AWS-owned calls its resource
// statement lets through.
const INTERFACES: Readonly<Record<string, { actions: string; awsOwned: readonly string[] }>> = {
  'ecr.api': { actions: 'ecr:*', awsOwned: ['ecr:GetAuthorizationToken'] },
  'ecr.dkr': { actions: 'ecr:*', awsOwned: [] },
  logs: { actions: 'logs:*', awsOwned: [] },
  secretsmanager: { actions: 'secretsmanager:*', awsOwned: [] },
  ssmmessages: { actions: 'ssmmessages:*', awsOwned: EXEC_CHANNELS },
}
const serviceName = (service: string) => ['com', 'amazonaws', REGION, service].join('.')
// The AZs each stage's interface endpoints sit in (C11-D30).
const ENDPOINT_AZS: Readonly<Record<EnvironmentName, number>> = { nonprod: 1, prod: 2, restore: 1 }
// ECR's own bucket for image layers in the Region, joined from its parts.
const ECR_LAYERS = ['arn', 'aws', 's3', '', '', `${['prod', REGION, 'starport-layer-bucket'].join('-')}/*`].join(':')

// IAC-12's endpoint set, as problems: an endpoint of a service the stage shouldn't have (another AWS
// service, a non-AWS PrivateLink service), one it lacks, one twice, and an interface endpoint without
// private DNS, its AZs or the endpoints' group.
function endpointProblems(template: Template, env: EnvironmentName, interfaces: boolean): string[] {
  const expected = [serviceName('s3'), ...(interfaces ? Object.keys(INTERFACES).map(serviceName) : [])]
  const endpoints = ofType(template, 'AWS::EC2::VPCEndpoint')
  const names = endpoints.map(([, r]) => String(r.Properties?.ServiceName))
  const [endpointsGroup] = ofType(template, 'AWS::EC2::SecurityGroup').filter(
    ([, r]) => r.Properties?.GroupDescription === `Hearth ${env} interface endpoints (C11-D31)`,
  )
  return [
    ...names.filter(name => !expected.includes(name)).map(name => `unexpected: ${name}`),
    ...expected.filter(name => !names.includes(name)).map(name => `missing: ${name}`),
    ...names.filter((name, i) => names.indexOf(name) !== i).map(name => `twice: ${name}`),
    ...endpoints.flatMap(([id, r]) => {
      const p = r.Properties ?? {}
      const gateway = p.ServiceName === serviceName('s3')
      if (gateway) return p.VpcEndpointType === 'Gateway' ? [] : [`${id}: the S3 endpoint isn't a gateway`]
      return [
        ...(p.VpcEndpointType === 'Interface' ? [] : [`${id}: not an interface endpoint`]),
        ...(p.PrivateDnsEnabled === true ? [] : [`${id}: no private DNS`]),
        ...(asList(p.SubnetIds).length === ENDPOINT_AZS[env] ? [] : [`${id}: not in ${ENDPOINT_AZS[env]} AZs`]),
        ...(isDeepStrictEqual(p.SecurityGroupIds, [{ 'Fn::GetAtt': [endpointsGroup?.[0], 'GroupId'] }])
          ? []
          : [`${id}: not in the endpoints' group alone`]),
      ]
    }),
  ]
}

// Each endpoint's policy (C11-D30), Allow-based and service-scoped: an organisation principal to an
// organisation resource, and to the AWS-owned resources its service needs, with the resource statement
// on; to anything, with it off. The S3 gateway: ECR's layers to anyone in the VPC, and an organisation
// principal's reads, lists and writes of an organisation bucket, never a delete.
function expectedPolicy(service: string, org: unknown, resourceOrg: boolean): Record<string, unknown> {
  const anyone = { AWS: '*' }
  const both = { StringEquals: { 'aws:PrincipalOrgID': org, 'aws:ResourceOrgID': org } }
  const principal = { StringEquals: { 'aws:PrincipalOrgID': org } }
  if (service === 's3') {
    return {
      Version: '2012-10-17',
      Statement: [
        { Sid: 'EcrImageLayers', Effect: 'Allow', Principal: anyone, Action: 's3:GetObject', Resource: ECR_LAYERS },
        {
          Sid: 'OrgResources',
          Effect: 'Allow',
          Principal: anyone,
          Action: ['s3:GetObject', 's3:ListBucket', 's3:PutObject'],
          Resource: '*',
          Condition: both,
        },
      ],
    }
  }
  const { actions, awsOwned } = INTERFACES[service] ?? { actions: '', awsOwned: [] }
  if (!resourceOrg) {
    return {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'OrgPrincipals',
          Effect: 'Allow',
          Principal: anyone,
          Action: actions,
          Resource: '*',
          Condition: principal,
        },
      ],
    }
  }
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'OrgPrincipalsToOrgResources',
        Effect: 'Allow',
        Principal: anyone,
        Action: actions,
        Resource: '*',
        Condition: both,
      },
      ...(awsOwned.length === 0
        ? []
        : [
            {
              Sid: 'OrgPrincipalsToAwsResources',
              Effect: 'Allow',
              Principal: anyone,
              Action: [...awsOwned],
              Resource: '*',
              Condition: principal,
            },
          ]),
    ],
  }
}
// Each endpoint's policy in a template, by its service's short name.
function endpointPolicies(template: Template): Record<string, unknown> {
  return Object.fromEntries(
    ofType(template, 'AWS::EC2::VPCEndpoint').map(([, r]) => [
      String(r.Properties?.ServiceName).slice(serviceName('').length),
      r.Properties?.PolicyDocument,
    ]),
  )
}

describe('IAC-12 C11-D30: the VPC endpoints', () => {
  it('IAC-12 finds a sixth endpoint in the endpoints’ group, a non-AWS service and an interface endpoint in the restore stage between drills, planted in copies of the real templates', () => {
    const nonprod = workloadTemplate(workload, 'nonprod', 'Platform')
    expect(endpointProblems(nonprod, 'nonprod', true)).toEqual([])
    const ecrApi = (template: Template) =>
      ofType(template, 'AWS::EC2::VPCEndpoint').find(([, r]) => r.Properties?.ServiceName === serviceName('ecr.api'))
    const copyAs = (service: string) => (resources: Record<string, Resource>) => {
      const [, endpoint] = ecrApi(nonprod) as [string, Resource]
      resources.Planted = structuredClone(endpoint)
      if (resources.Planted.Properties !== undefined) resources.Planted.Properties.ServiceName = service
    }
    expect(endpointProblems(plantedIn(nonprod, copyAs(serviceName('sts'))), 'nonprod', true)).toEqual([
      `unexpected: ${serviceName('sts')}`,
    ])
    const partner = ['com', 'amazonaws', 'vpce', REGION, `vpce-svc-${'a'.repeat(17)}`].join('.')
    expect(endpointProblems(plantedIn(nonprod, copyAs(partner)), 'nonprod', true)).toEqual([`unexpected: ${partner}`])
    const restore = workloadTemplate(workload, 'restore', 'Platform')
    expect(endpointProblems(restore, 'restore', false)).toEqual([])
    const drilled = plantedIn(restore, resources => {
      const [id, endpoint] = ecrApi(workloadTemplate(active, 'restore', 'Platform')) as [string, Resource]
      resources[id] = structuredClone(endpoint)
    })
    expect(endpointProblems(drilled, 'restore', false)).toEqual([`unexpected: ${serviceName('ecr.api')}`])
  })

  it.each(ENVIRONMENTS)(
    'IAC-12 %s: the endpoints are exactly the S3 gateway and, where the stage runs, the five interface endpoints, each with private DNS in its AZs and the endpoints’ group alone',
    env => {
      for (const [build, synth] of buildsWith(env)) {
        const interfaces = env !== 'restore' || build === 'restore-active'
        expect(endpointProblems(workloadTemplate(synth, env, 'Platform'), env, interfaces), build).toEqual([])
      }
    },
  )

  it.each(ENVIRONMENTS)(
    'IAC-12 %s: each endpoint’s policy is exactly its statements under the organisation’s id from SSM, the resource statement on in non-prod and restore and off in prod, pinned literally as the perimeter is',
    env => {
      for (const [build, synth] of buildsWith(env)) {
        const platform = workloadTemplate(synth, env, 'Platform')
        const org = { Ref: parameterNamed(platform, ['', 'hearth', 'organisation', 'id'].join('/')) }
        expect(org.Ref, build).toBeDefined()
        const policies = endpointPolicies(platform)
        const services = Object.keys(policies).sort()
        expect(services, build).toEqual(
          env === 'restore' && build === 'committed' ? ['s3'] : ['s3', ...Object.keys(INTERFACES)].sort(),
        )
        for (const service of services) {
          expect(policies[service], `${build} ${env} ${service}`).toEqual(expectedPolicy(service, org, env !== 'prod'))
        }
      }
    },
  )

  it('IAC-12 C11-D30: the variant with prod’s resource statement on gives prod’s interface endpoints the organisation-resource statement and the AWS-owned exceptions, logs and Secrets Manager none', () => {
    const variant = synthWorkload({ profiles: { prod: { endpointResourceOrg: true } } })
    const platform = workloadTemplate(variant, 'prod', 'Platform')
    const org = { Ref: parameterNamed(platform, ['', 'hearth', 'organisation', 'id'].join('/')) }
    const policies = endpointPolicies(platform)
    for (const service of Object.keys(INTERFACES)) {
      expect(policies[service], service).toEqual(expectedPolicy(service, org, true))
    }
    const sids = (service: string) =>
      ((policies[service] as { Statement: Array<{ Sid: string }> }).Statement ?? []).map(s => s.Sid)
    expect(sids('logs')).toEqual(['OrgPrincipalsToOrgResources'])
    expect(sids('secretsmanager')).toEqual(['OrgPrincipalsToOrgResources'])
  }, 60_000)
})

// --- IAC-13's workload half -----------------------------------------------------------------------

describe('IAC-13 C11-D24 C11-D76: what no workload template holds', () => {
  it('IAC-13 finds a second function, another custom resource, Fn::GetStackOutput, a cross-stack reference’s output and an export in a Platform template, and the handler’s pair outside one, on planted copies', () => {
    const platform = workloadTemplate(workload, 'nonprod', 'Platform')
    expect(forbiddenInTemplate(platform, 'workload', 'Hearth-nonprod-Platform')).toEqual([])
    const [handler] = ofType(platform, 'AWS::Lambda::Function')
    const [custom] = ofType(platform, DEFAULT_GROUP_RESOURCE)
    const planted = plantedIn(platform, resources => {
      resources.Second = { Type: 'AWS::Lambda::Function' }
      resources.Other = { Type: 'Custom::Other' }
      resources.Reads = {
        Type: 'AWS::SSM::Parameter',
        Properties: { Value: { 'Fn::GetStackOutput': { OutputName: 'x' } } },
      }
    })
    planted.Outputs = { PublishOutputRefVpc: { Value: 'x' }, Shared: { Value: 'x', Export: { Name: 'Shared' } } }
    expect(forbiddenInTemplate(planted, 'workload', 'Hearth-nonprod-Platform').sort()).toEqual(
      [
        `${custom?.[0]}: ${DEFAULT_GROUP_RESOURCE} (not in a workload template)`,
        `${handler?.[0]}: AWS::Lambda::Function (not in a workload template)`,
        'Second: AWS::Lambda::Function (not in a workload template)',
        'Other: Custom::Other (not in a workload template)',
        'Resources.Reads.Properties.Value: Fn::GetStackOutput',
        "Outputs.PublishOutputRefVpc: a cross-stack reference's output",
        'Outputs.Shared: an export',
      ].sort(),
    )
    expect(forbiddenInTemplate(platform, 'workload', 'Hearth-nonprod-Services').sort()).toEqual(
      [
        `${custom?.[0]}: ${DEFAULT_GROUP_RESOURCE} (not in a workload template)`,
        `${handler?.[0]}: AWS::Lambda::Function (not in a workload template)`,
      ].sort(),
    )
    expect(forbiddenInTemplate(platform, 'landing-zone')).toHaveLength(2)
  })

  it('IAC-13: no workload template holds any of them, in any build', () => {
    for (const { label, name, template } of workloadTemplates()) {
      expect(forbiddenInTemplate(template, 'workload', name), label).toEqual([])
    }
  })

  it('IAC-13 C11-D24 C11-D26 C11-D27: the twelve stacks, each account-agnostic in ap-southeast-1, deployed through hearthapp’s deploy role after its bootstrap version, named Hearth-<env>-<Part>, termination-protected on Platform and Data alone', () => {
    for (const [build, synth, envs] of builds()) {
      expect(
        synth.synthesised.stacks.map(stack => [stack.id, stack.stackName]),
        build,
      ).toEqual(envs.flatMap(env => PARTS.map(part => [`${env}/${part}`, `Hearth-${env}-${part}`])))
      for (const stack of synth.synthesised.stacks) {
        const { account, region, terminationProtection, assumeRoleArn, bootstrapStackVersionSsmParameter } =
          stack.artifact
        const at = `${build} ${stack.stackName}`
        expect(`aws://${account}/${region}`, at).toBe(`aws://unknown-account/${REGION}`)
        expect(assumeRoleArn, at).toContain('cdk-hearthapp-deploy-role-')
        expect(bootstrapStackVersionSsmParameter, at).toBe('/cdk-bootstrap/hearthapp/version')
        expect(terminationProtection, at).toBe(/-(?:Platform|Data)$/.test(stack.stackName))
      }
    }
  })
})

// --- IAC-22's workload half -----------------------------------------------------------------------

describe('IAC-22 C11-D76: the workload publishes its templates and each Platform’s one handler zip', () => {
  it('IAC-22 admits one handler zip in a Platform manifest and finds a second, one in a Services manifest and one with a command, on planted manifests', () => {
    const template = (name: string) => ({ source: { path: `${name}.template.json`, packaging: 'file' } })
    const handler = {
      displayName: `nonprod/Platform/${HANDLER_CODE}`,
      source: { path: '../asset.x', packaging: 'zip' },
    }
    const planted = new Map<string, unknown>([
      ['assembly-nonprod/nonprodPlatformABCDEF01.assets.json', { files: { h: handler, t: template('p') } }],
      ['assembly-prod/prodPlatformABCDEF02.assets.json', { files: { h: handler, h2: handler, t: template('p') } }],
      ['assembly-prod/prodServicesABCDEF03.assets.json', { files: { h: handler, t: template('s') } }],
      [
        'assembly-restore/restorePlatformABCDEF04.assets.json',
        { files: { h: { ...handler, source: { ...handler.source, executable: ['sh'] } }, t: template('p') } },
      ],
    ])
    expect(assetProblems(planted, 'workload')).toEqual([
      'assembly-prod/prodPlatformABCDEF02.assets.json: holds 2 handler zips, not one',
      'assembly-prod/prodServicesABCDEF03.assets.json: h is packaged',
      "assembly-prod/prodServicesABCDEF03.assets.json: h isn't a template",
      'assembly-restore/restorePlatformABCDEF04.assets.json: h runs a command',
    ])
    expect(assetProblems(new Map([...planted].slice(0, 1)), 'landing-zone')).toEqual([
      'assembly-nonprod/nonprodPlatformABCDEF01.assets.json: h is packaged',
      "assembly-nonprod/nonprodPlatformABCDEF01.assets.json: h isn't a template",
    ])
  })

  it('IAC-22: every workload stack’s manifest of every build lists its template and, a Platform’s, the one handler zip', () => {
    for (const [build, synth, envs] of builds()) {
      expect(synth.synthesised.assetManifests.size, build).toBe(envs.length * PARTS.length)
      expect(assetProblems(synth.synthesised.assetManifests, 'workload'), build).toEqual([])
    }
  })
})

// --- Federated trusts (TECH-SPEC T24 item 28) -------------------------------------------------------

// The services a workload role may trust, each by the roles that may trust it: ECS's tasks by the
// twelve task and execution roles, by name, VPC Flow Logs by the role a flow log delivers through, and
// Lambda by the role the default-group handler runs as (C11-D32, C11-D38).
const TRUSTED_SERVICES: Readonly<Record<string, string>> = {
  'ecs-tasks.amazonaws.com': 'the twelve task and execution roles',
  'vpc-flow-logs.amazonaws.com': "the flow log's role",
  'lambda.amazonaws.com': "the default-group handler's role",
}
const HANDLER_SERVICE = 'lambda.amazonaws.com'
const TASK_ROLE_NAME = new RegExp(`^hearth-(?:${ENVIRONMENTS.join('|')})-(?:${KINDS.join('|')})-(?:task|exec)$`)
// The services that hand AWS credentials to a machine outside AWS: IAM Roles Anywhere, Systems
// Manager's hybrid activations and IoT's credentials provider, refused by name as well as by the list.
const OUTSIDE_SERVICES = ['rolesanywhere.amazonaws.com', 'ssm.amazonaws.com', 'credentials.iot.amazonaws.com']

// Each way a template lets a machine outside AWS hold a workload role's credentials, as problems: a
// federated or non-service principal in a trust, an action that federates, a service outside the
// workload's own or outside the role's own, and a resource that issues credentials outside AWS.
function federatedTrustProblems(template: Template): string[] {
  const handlerRoles = new Set(roleBehind(template, 'AWS::Lambda::Function', 'Role'))
  const flowLogRoles = new Set(roleBehind(template, 'AWS::EC2::FlowLog', 'DeliverLogsPermissionArn'))
  const found: string[] = []
  for (const [id, role] of ofType(template, 'AWS::IAM::Role')) {
    const trust = role.Properties?.AssumeRolePolicyDocument as { Statement?: unknown } | undefined
    for (const statement of asList(trust?.Statement) as Array<Record<string, unknown>>) {
      const principal = statement.Principal
      if (!isObject(principal)) {
        found.push(`${id}: trusts ${JSON.stringify(principal)}, not a service`)
        continue
      }
      for (const key of Object.keys(principal).filter(key => key !== 'Service')) {
        found.push(`${id}: trusts a principal of type ${key}`)
      }
      for (const service of asList(principal.Service).map(String)) {
        if (OUTSIDE_SERVICES.includes(service)) {
          found.push(`${id}: trusts ${service}, which hands AWS credentials to a machine outside AWS`)
        }
        const own = [
          ...(TASK_ROLE_NAME.test(String(role.Properties?.RoleName)) ? ['ecs-tasks.amazonaws.com'] : []),
          ...(flowLogRoles.has(id) ? ['vpc-flow-logs.amazonaws.com'] : []),
          ...(handlerRoles.has(id) ? [HANDLER_SERVICE] : []),
        ]
        if (!Object.hasOwn(TRUSTED_SERVICES, service)) {
          found.push(`${id}: trusts ${service}, outside the workload's services`)
        } else if (!own.includes(service)) {
          found.push(`${id}: trusts ${service}, which only ${TRUSTED_SERVICES[service]} may`)
        }
      }
      if (statement.NotAction !== undefined) found.push(`${id}: a trust with NotAction`)
      for (const action of asList(statement.Action).map(String)) {
        if (globsOverlap(lower(action), 'sts:assumerolewith*')) found.push(`${id}: ${action} federates`)
      }
    }
  }
  for (const [id, resource] of resources(template)) {
    if (
      resource.Type.startsWith('AWS::RolesAnywhere::') ||
      /^AWS::SSM::.*Activation/.test(resource.Type) ||
      resource.Type === 'AWS::IoT::RoleAlias'
    ) {
      found.push(`${id}: ${resource.Type}, which issues AWS credentials outside AWS`)
    }
  }
  return found
}

describe('T24 item 28: no workload role trusts a machine outside AWS', () => {
  it('T24 item 28 finds a federated principal, a federating action, an outside service by name and by the list, a workload service on a role not its own, another principal, and the credential-issuing resources, on a planted template', () => {
    const role = (Principal: unknown, Action: unknown = 'sts:AssumeRole', RoleName?: string) => ({
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal, Action }] },
        ...(RoleName === undefined ? {} : { RoleName }),
      },
    })
    const ecsTasks = { Service: 'ecs-tasks.amazonaws.com' }
    const flowLogs = { Service: 'vpc-flow-logs.amazonaws.com' }
    const planted: Template = {
      Resources: {
        Federated: role({ Federated: 'cognito-identity.amazonaws.com' }, 'sts:AssumeRoleWithWebIdentity'),
        Saml: role(ecsTasks, 'sts:AssumeRoleWithSAML', 'hearth-nonprod-api-task'),
        Wildcard: role(ecsTasks, 'sts:*', 'hearth-nonprod-api-exec'),
        // ECS's tasks on an unnamed role, a role of another name and the flow log's role, VPC Flow
        // Logs on a task role, and Lambda on a role the handler doesn't run as.
        Unnamed: role(ecsTasks),
        Misnamed: role(ecsTasks, 'sts:AssumeRole', 'hearth-nonprod-planted-task'),
        FlowLogRole: role({ Service: ['vpc-flow-logs.amazonaws.com', 'ecs-tasks.amazonaws.com'] }),
        FlowLog: {
          Type: 'AWS::EC2::FlowLog',
          Properties: { DeliverLogsPermissionArn: { 'Fn::GetAtt': ['FlowLogRole', 'Arn'] } },
        },
        TaskFlowLogs: role(flowLogs, 'sts:AssumeRole', 'hearth-nonprod-worker-task'),
        Anywhere: role({ Service: 'rolesanywhere.amazonaws.com' }),
        Hybrid: role({ Service: 'ssm.amazonaws.com' }),
        Iot: role({ Service: 'credentials.iot.amazonaws.com' }),
        Lambda: role({ Service: HANDLER_SERVICE }),
        Account: role({ AWS: ACCOUNT }),
        Anyone: role('*'),
        TrustAnchor: { Type: 'AWS::RolesAnywhere::TrustAnchor' },
        Activation: { Type: 'AWS::SSM::Activation' },
        RoleAlias: { Type: 'AWS::IoT::RoleAlias' },
      },
    }
    expect(federatedTrustProblems(planted)).toEqual([
      'Federated: trusts a principal of type Federated',
      'Federated: sts:AssumeRoleWithWebIdentity federates',
      'Saml: sts:AssumeRoleWithSAML federates',
      'Wildcard: sts:* federates',
      'Unnamed: trusts ecs-tasks.amazonaws.com, which only the twelve task and execution roles may',
      'Misnamed: trusts ecs-tasks.amazonaws.com, which only the twelve task and execution roles may',
      'FlowLogRole: trusts ecs-tasks.amazonaws.com, which only the twelve task and execution roles may',
      "TaskFlowLogs: trusts vpc-flow-logs.amazonaws.com, which only the flow log's role may",
      'Anywhere: trusts rolesanywhere.amazonaws.com, which hands AWS credentials to a machine outside AWS',
      "Anywhere: trusts rolesanywhere.amazonaws.com, outside the workload's services",
      'Hybrid: trusts ssm.amazonaws.com, which hands AWS credentials to a machine outside AWS',
      "Hybrid: trusts ssm.amazonaws.com, outside the workload's services",
      'Iot: trusts credentials.iot.amazonaws.com, which hands AWS credentials to a machine outside AWS',
      "Iot: trusts credentials.iot.amazonaws.com, outside the workload's services",
      `Lambda: trusts ${HANDLER_SERVICE}, which only the default-group handler's role may`,
      'Account: trusts a principal of type AWS',
      'Anyone: trusts "*", not a service',
      'TrustAnchor: AWS::RolesAnywhere::TrustAnchor, which issues AWS credentials outside AWS',
      'Activation: AWS::SSM::Activation, which issues AWS credentials outside AWS',
      'RoleAlias: AWS::IoT::RoleAlias, which issues AWS credentials outside AWS',
    ])
  })

  it('T24 item 28 C11-D38: every workload template’s roles trust only their own service, ECS’s tasks the twelve, VPC Flow Logs the flow log’s and Lambda the handler’s, and nothing issues credentials outside AWS', () => {
    for (const { label, template } of workloadTemplates()) {
      expect(federatedTrustProblems(template), label).toEqual([])
    }
  })
})

// --- What a break-glass session into the network leaves behind (C11-D40; T24 item 15) -------------

// Each stage's one cluster keeps nothing of an ECS Exec session: its execute-command logging is NONE,
// with no log configuration or key, since the bastion's one sanctioned use is a port forward whose
// bytes are TLS to Postgres, and DEFAULT, which ECS also applies when the configuration is left out,
// would copy any interactive shell's output into the bastion's log group. CloudTrail still records
// RunTask, ExecuteCommand and StartSession. The owner and the DPO read a change to it (C11-D74).
const NO_EXEC_LOGGING = { ExecuteCommandConfiguration: { Logging: 'NONE' } }
function execLoggingProblems(template: Template, platform: boolean): string[] {
  const clusters = ofType(template, 'AWS::ECS::Cluster')
  return [
    ...(clusters.length === (platform ? 1 : 0) ? [] : [`${clusters.length} clusters`]),
    ...clusters
      .filter(([, cluster]) => !isDeepStrictEqual(cluster.Properties?.Configuration, NO_EXEC_LOGGING))
      .map(([id, cluster]) => `${id}: ${JSON.stringify(cluster.Properties?.Configuration ?? null)}`),
  ]
}

describe('T24 item 15 C11-D40: ECS Exec keeps nothing of a session', () => {
  it('T24 item 15 finds logging DEFAULT, a log configuration, the configuration left out and a second cluster, planted in copies of a real Platform template', () => {
    const platform = workloadTemplate(workload, 'nonprod', 'Platform')
    expect(execLoggingProblems(platform, true)).toEqual([])
    const [clusterId, cluster] = ofType(platform, 'AWS::ECS::Cluster')[0] as [string, Resource]
    const withConfiguration = (configuration: unknown) =>
      plantedIn(platform, resources => {
        const properties = resources[clusterId]?.Properties ?? {}
        if (configuration === undefined) delete properties.Configuration
        else properties.Configuration = configuration
      })
    expect(
      execLoggingProblems(withConfiguration({ ExecuteCommandConfiguration: { Logging: 'DEFAULT' } }), true),
    ).toEqual([`${clusterId}: {"ExecuteCommandConfiguration":{"Logging":"DEFAULT"}}`])
    const logged = {
      ExecuteCommandConfiguration: {
        Logging: 'NONE',
        LogConfiguration: { CloudWatchLogGroupName: 'hearth/nonprod/bastion' },
      },
    }
    expect(execLoggingProblems(withConfiguration(logged), true)).toEqual([`${clusterId}: ${JSON.stringify(logged)}`])
    expect(execLoggingProblems(withConfiguration(undefined), true)).toEqual([`${clusterId}: null`])
    const second = plantedIn(platform, resources => {
      resources.PlantedCluster = structuredClone(cluster)
    })
    expect(execLoggingProblems(second, true)).toEqual(['2 clusters'])
    const tasks = plantedIn(workloadTemplate(workload, 'nonprod', 'Tasks'), resources => {
      resources.PlantedCluster = structuredClone(cluster)
    })
    expect(execLoggingProblems(tasks, false)).toEqual(['1 clusters'])
  })

  it('T24 item 15: each stage’s Platform holds one cluster, with ECS Exec’s logging NONE, and no other workload template holds one, in any build', () => {
    for (const { label, name, template } of workloadTemplates()) {
      expect(execLoggingProblems(template, name.endsWith('-Platform')), label).toEqual([])
    }
  })
})

// --- The network's invariants (C11-D29 to C11-D31, C11-D37, C11-D45) -------------------------------

// EC2's placeholder egress rule, written here as CloudFormation renders it: no packet matches ICMP type
// 252, code 86, to the broadcast address, so a group carrying it alone sends nothing.
const NO_TRAFFIC = {
  CidrIp: '255.255.255.255/32',
  Description: 'Disallow all traffic',
  FromPort: 252,
  IpProtocol: 'icmp',
  ToPort: 86,
}
const OPEN = ['0.0.0.0/0', '::/0']
// The ways out of a VPC and into one but the bastion's and the load balancer's (C11-D29, C11-D40):
// EC2's NAT, egress-only gateways, peering, transit, VPN, Client VPN, Instance Connect, endpoint
// services (a PrivateLink service of Hearth's own), Verified Access, carrier and local gateways and
// Elastic IPs; and other services' ways into a VPC: VPC Lattice (a resource gateway is a point of
// ingress into the VPC, by CloudFormation's own description), API Gateway's VPC links, CloudFront's
// VPC origins, Global Accelerator and the classic load balancer. NoOtherWayIn names EC2's four
// products and VPC Lattice's resource gateway, target group and VPC association; the rest, and every
// Lattice type, are held here, and an unclassified type also fails IAC-01 until policies.ts
// classifies it.
const OTHER_WAYS = [
  /^AWS::EC2::NatGateway$/,
  /^AWS::EC2::EgressOnlyInternetGateway$/,
  /^AWS::EC2::VPCPeeringConnection$/,
  /^AWS::EC2::TransitGateway/,
  /^AWS::EC2::VPNGateway/,
  /^AWS::EC2::VPNConnection/,
  /^AWS::EC2::CustomerGateway$/,
  /^AWS::EC2::ClientVpn/,
  /^AWS::EC2::InstanceConnectEndpoint$/,
  /^AWS::EC2::VPCEndpointService/,
  /^AWS::EC2::VerifiedAccess/,
  /^AWS::EC2::CarrierGateway$/,
  /^AWS::EC2::LocalGateway/,
  /^AWS::EC2::EIP/,
  /^AWS::VpcLattice::/,
  /^AWS::ApiGateway::VpcLink$/,
  /^AWS::ApiGatewayV2::VpcLink$/,
  /^AWS::CloudFront::VpcOrigin$/,
  /^AWS::GlobalAccelerator::/,
  /^AWS::ElasticLoadBalancing::/,
]
// What only the stages with a load balancer may hold (C11-D45): the restore stage is sealed.
const PUBLIC_TYPES = [
  'AWS::EC2::InternetGateway',
  'AWS::EC2::VPCGatewayAttachment',
  'AWS::ElasticLoadBalancingV2::LoadBalancer',
  'AWS::ElasticLoadBalancingV2::Listener',
  'AWS::ElasticLoadBalancingV2::ListenerRule',
  'AWS::ElasticLoadBalancingV2::TargetGroup',
  'AWS::CertificateManager::Certificate',
  'AWS::Route53::RecordSet',
]
// The properties an ingress rule names its peer by.
const INGRESS_PEERS = [
  'CidrIp',
  'CidrIpv6',
  'SourcePrefixListId',
  'SourceSecurityGroupId',
  'SourceSecurityGroupName',
  'SourceSecurityGroupOwnerId',
] as const
// A route's targets other than an internet gateway, any of which would be another way out.
const ROUTE_TARGETS = [
  'CarrierGatewayId',
  'CoreNetworkArn',
  'EgressOnlyInternetGatewayId',
  'InstanceId',
  'LocalGatewayId',
  'NatGatewayId',
  'NetworkInterfaceId',
  'TransitGatewayId',
  'VpcEndpointId',
  'VpcPeeringConnectionId',
]
// Variables only a secret may carry, and the ones C0.12 or a person sets (IAC-09).
const SECRET_NAMES = [
  /^SMS_PROVIDER$/,
  /^TWILIO_/,
  /^TRUST_PROXY$/,
  /^OWNER_BOOTSTRAP_/,
  /^MIGRATION_/,
  /^S3_ENDPOINT$/,
  /^S3_FORCE_PATH_STYLE$/,
  /^S3_ACCESS_KEY_ID$/,
  /^S3_SECRET_ACCESS_KEY$/,
  /(?:SECRET|TOKEN|PASSWORD|KEY)$/,
]
// What a part of an environment value no template fixes (an SSM parameter's value) is written as, so
// a check can see where such a part sits: the object replacement character, which no value holds.
const UNFIXED = '\uFFFC'
// An environment value as the task will hold it: literal text, or a Fn::Join of literal text and Refs,
// each Ref rendered where the template fixes it and UNFIXED where it doesn't, its logical id added to
// `unfixed`. Any other shape (an Fn::If, an Fn::Sub, an import) is undefined, which the check refuses
// rather than reads.
function environmentText(value: unknown, template: Template, unfixed: string[] = []): string | undefined {
  if (typeof value === 'string') return value
  const ref = refOf(value)
  if (ref !== undefined && Object.keys(value as object).length === 1) {
    const text = renderedString(value, { account: ACCOUNT, region: REGION, template })
    if (text === undefined) unfixed.push(ref)
    return text ?? UNFIXED
  }
  const join = isObject(value) && Object.keys(value).length === 1 ? value['Fn::Join'] : undefined
  if (!Array.isArray(join) || join.length !== 2 || typeof join[0] !== 'string' || !Array.isArray(join[1])) {
    return undefined
  }
  const parts = join[1].map(part => environmentText(part, template, unfixed))
  return parts.every(part => part !== undefined) ? parts.join(join[0]) : undefined
}
// Where each URL in a value starts: at every scheme, so a URL joined to another by a comma or a
// semicolon, or written as a query value, is read as a URL of its own.
const SCHEME = /[a-z][a-z0-9+.-]*:\/\//gi
// A URL from its scheme to the next space or the value's end: its authority (user information, host
// and port), up to the first `/`, `?` or `#`, then the rest: its path, query and fragment, and all
// that follows them, so text shaped like a scheme inside its query never cuts a key off it.
const URL_AT = /^[a-z][a-z0-9+.-]*:\/\/([^/?#\s]*)(\S*)/i
interface UrlParts {
  userinfo: string
  // Where its host sits in the value, from its first character to the one after its last.
  host: readonly [number, number]
  rest: string
}
function urlsIn(text: string): UrlParts[] {
  return [...text.matchAll(SCHEME)].flatMap(({ index }) => {
    const match = URL_AT.exec(text.slice(index))
    if (match === null) return []
    const [whole, authority = '', rest = ''] = match
    const at = authority.lastIndexOf('@')
    const hostStart = index + whole.indexOf('://') + 3 + at + 1
    const hostLength = /^(?:\[[^\]]*\]|[^:]*)/.exec(authority.slice(at + 1))?.[0].length ?? 0
    return [{ userinfo: at === -1 ? '' : authority.slice(0, at), host: [hostStart, hostStart + hostLength], rest }]
  })
}
// A query or fragment key that names a credential, read percent-decoded as the server's clients read
// it: pg and ioredis take a password from the query (`password`, any case, `pass%77ord` included) as
// readily as from the user information. The words are listed here by hand, not read from
// SECRET_NAMES: the four its last pattern ends in (password, secret, token, key), and `pass` and
// `pwd`, which take in password's other spellings, so `sslpassword`, `pwd`, a token or a key are
// refused too.
const CREDENTIAL_KEY = /pass|pwd|secret|token|key/i
// Whether a value holds a URL with a password: in the user information of any URL in it, or as a
// query or fragment key that names a credential. This is the text CloudFormation resolves into a task
// definition's plain environment, which anyone who can describe it reads. A query that names no
// credential (`sslmode=verify-full`) is not refused.
function holdsUrlPassword(text: string): boolean {
  return urlsIn(text).some(({ userinfo, rest }) => {
    if (userinfo.includes(':')) return true
    const hash = rest.indexOf('#')
    const beforeHash = hash === -1 ? rest : rest.slice(0, hash)
    const question = beforeHash.indexOf('?')
    const query = question === -1 ? '' : beforeHash.slice(question + 1)
    const fragment = hash === -1 ? '' : rest.slice(hash + 1)
    return [query, fragment].some(part => [...new URLSearchParams(part).keys()].some(key => CREDENTIAL_KEY.test(key)))
  })
}
// Whether a value holds a part no template fixes anywhere but a URL's host: in a URL's user
// information, port, path, query or fragment, in its scheme, or outside any URL (a value that is an
// SSM parameter's whole value), where it could carry a password the checks above never see. A host
// is the one place such a part may sit, and the one part that may sit there is the stage's Valkey
// endpoint, which its Data stack writes as an address (below).
function holdsUnfixedOutsideHost(text: string): boolean {
  let outside = text
  for (const { host } of urlsIn(text)) {
    outside = `${outside.slice(0, host[0])}${' '.repeat(host[1] - host[0])}${outside.slice(host[1])}`
  }
  return outside.includes(UNFIXED)
}
// A dynamic reference, which CloudFormation resolves into the template, and so into the plain
// environment, at deploy: a secret's, or a plain SSM parameter's, whose value no template fixes.
const DYNAMIC_REFERENCE = /\{\{resolve:/
// The stage's Valkey endpoint, the one SSM parameter a plain environment value may read.
const valkeyEndpointName = (env: EnvironmentName) => ['', 'hearth', env, 'valkey', 'endpoint'].join('/')
// The type of a template parameter CloudFormation fills at deploy from the SSM parameter it names.
const SSM_STRING = 'AWS::SSM::Parameter::Value<String>'
// The first rule a plain environment value, as environmentText reads it, breaks, or undefined.
function environmentProblem(text: string | undefined): string | undefined {
  if (text === undefined) return 'is a value no static reading fixes'
  if (DYNAMIC_REFERENCE.test(text)) return 'resolves a dynamic reference into the plain environment'
  if (holdsUrlPassword(text)) return 'holds a URL with a password'
  if (holdsUnfixedOutsideHost(text)) return "holds a part no template fixes outside a URL's host"
  return undefined
}

// Each place a workload template breaks one of the network's invariants, as problems. C0.12's egress
// proxy group (tagged hearth:egress-proxy) will be the one exception to the egress rules, in the same
// change that adds it.
function networkProblems(template: Template, env: EnvironmentName): string[] {
  const found: string[] = []
  const igws = new Set(ofType(template, 'AWS::EC2::InternetGateway').map(([id]) => id))
  const publicSubnets = new Set(
    ofType(template, 'AWS::EC2::Subnet')
      .filter(([, r]) => tagOf(r, 'aws-cdk:subnet-type') === 'Public')
      .map(([id]) => id),
  )
  const tables = new Map<string, string[]>()
  for (const [, r] of ofType(template, 'AWS::EC2::SubnetRouteTableAssociation')) {
    const table = refOf(r.Properties?.RouteTableId) ?? '?'
    tables.set(table, [...(tables.get(table) ?? []), refOf(r.Properties?.SubnetId) ?? '?'])
  }
  const publicTable = (table: string | undefined) => {
    const subnets = tables.get(table ?? '') ?? []
    return subnets.length > 0 && subnets.every(subnet => publicSubnets.has(subnet))
  }

  for (const [id, r] of ofType(template, 'AWS::EC2::SecurityGroup')) {
    const egress = (r.Properties?.SecurityGroupEgress ?? []) as unknown[]
    if (egress.length !== 1 || !isDeepStrictEqual(egress[0], NO_TRAFFIC)) {
      found.push(`${id}: its inline egress isn't EC2's placeholder alone`)
    }
    for (const rule of egress as Array<Record<string, unknown>>) {
      for (const cidr of [rule.CidrIp, rule.CidrIpv6]) {
        if (OPEN.includes(String(cidr))) found.push(`${id}: egress to ${String(cidr)}`)
      }
    }
  }
  for (const [id, r] of ofType(template, 'AWS::EC2::SecurityGroupEgress')) {
    for (const cidr of [r.Properties?.CidrIp, r.Properties?.CidrIpv6]) {
      if (OPEN.includes(String(cidr))) found.push(`${id}: egress to ${String(cidr)}`)
    }
  }
  // Ingress (C11-D31): every rule, inline or its own resource, on one of the stage's own groups and
  // from one of them, but the load balancer's group's tcp 443 from anywhere, so nothing outside the
  // stage's groups reaches a task, an endpoint or Valkey but through the one load balancer. The exact
  // rules are network.test.ts's. The restore stage's load balancer is reported above.
  const groups = new Set(ofType(template, 'AWS::EC2::SecurityGroup').map(([id]) => id))
  const ownGroup = (value: unknown) => groups.has(getAttOf(value, 'GroupId') ?? '')
  const balancers = env === 'restore' ? [] : ofType(template, 'AWS::ElasticLoadBalancingV2::LoadBalancer')
  const balancerGroups = new Set(
    balancers.flatMap(([, r]) =>
      asList(r.Properties?.SecurityGroups).flatMap(group => getAttOf(group, 'GroupId') ?? []),
    ),
  )
  const admitted = (group: string, rule: Record<string, unknown>) => {
    const peers = INGRESS_PEERS.filter(key => rule[key] !== undefined)
    if (peers.length !== 1) return false
    if (peers[0] === 'SourceSecurityGroupId') return ownGroup(rule.SourceSecurityGroupId)
    const https = rule.IpProtocol === 'tcp' && rule.FromPort === 443 && rule.ToPort === 443
    return balancerGroups.has(group) && peers[0] === 'CidrIp' && rule.CidrIp === '0.0.0.0/0' && https
  }
  for (const [id, r] of ofType(template, 'AWS::EC2::SecurityGroup')) {
    for (const rule of (r.Properties?.SecurityGroupIngress ?? []) as Array<Record<string, unknown>>) {
      if (!admitted(id, rule)) found.push(`${id}: inline ingress from outside the stage's own groups`)
    }
  }
  for (const [id, r] of ofType(template, 'AWS::EC2::SecurityGroupIngress')) {
    const group = getAttOf(r.Properties?.GroupId, 'GroupId') ?? ''
    if (!groups.has(group) || !admitted(group, r.Properties ?? {})) {
      found.push(`${id}: ingress from outside the stage's own groups`)
    }
  }
  for (const [id, r] of balancers) {
    if (r.Properties?.Type !== 'application') found.push(`${id}: not an application load balancer`)
    const named = asList(r.Properties?.SecurityGroups)
    if (named.length !== 1 || !ownGroup(named[0])) found.push(`${id}: not in one of the stage's own groups alone`)
  }
  for (const [id, r] of ofType(template, 'AWS::EC2::Route')) {
    const p = r.Properties ?? {}
    if (p.DestinationIpv6CidrBlock !== undefined) found.push(`${id}: an IPv6 route`)
    for (const key of ROUTE_TARGETS.filter(key => p[key] !== undefined)) found.push(`${id}: a route to a ${key}`)
    if (p.DestinationCidrBlock !== '0.0.0.0/0' || !igws.has(refOf(p.GatewayId) ?? '')) {
      found.push(`${id}: not a default route to the stage's internet gateway`)
    }
    if (!publicTable(refOf(p.RouteTableId))) found.push(`${id}: a route in a table that isn't public`)
  }
  for (const [id, r] of resources(template)) {
    if (OTHER_WAYS.some(type => type.test(r.Type))) found.push(`${id}: ${r.Type}`)
    if (env === 'restore' && PUBLIC_TYPES.includes(r.Type)) found.push(`${id}: ${r.Type} in the restore stage`)
  }
  for (const [id, r] of ofType(template, 'AWS::EC2::Subnet')) {
    if (r.Properties?.MapPublicIpOnLaunch === true) found.push(`${id}: gives a public address on launch`)
    if (env === 'restore' && publicSubnets.has(id)) found.push(`${id}: a public subnet in the restore stage`)
  }
  for (const [id, r] of ofType(template, 'AWS::ECS::Service')) {
    const network = r.Properties?.NetworkConfiguration as { AwsvpcConfiguration?: { AssignPublicIp?: unknown } }
    if (network?.AwsvpcConfiguration?.AssignPublicIp !== 'DISABLED') found.push(`${id}: may take a public address`)
  }

  const authSecret = parameterNamed(template, ['', 'hearth', env, 'auth-secret', 'arn'].join('/'))
  // The template's own read of the stage's Valkey endpoint, as an SSM parameter (a parameter of
  // another type takes whatever value the deploy passes it).
  const endpoint = parameterNamed(template, valkeyEndpointName(env))
  const read = isObject(template.Parameters) ? template.Parameters[endpoint ?? ''] : undefined
  const valkeyEndpoint = isObject(read) && read.Type === SSM_STRING ? endpoint : undefined
  for (const [id, r] of ofType(template, 'AWS::ECS::TaskDefinition')) {
    const containers = (r.Properties?.ContainerDefinitions ?? []) as Array<Record<string, unknown>>
    for (const container of containers) {
      const image = renderedString(container.Image, { account: ACCOUNT, region: REGION, template })
      if (!/@sha256:[0-9a-f]{64}$/.test(image ?? '')) found.push(`${id}: an image not by digest`)
      for (const secret of (container.Secrets ?? []) as Array<{ Name: string; ValueFrom: unknown }>) {
        if (authSecret === undefined || refOf(secret.ValueFrom) !== authSecret) {
          found.push(`${id}: ${secret.Name} not by reference to the stage's AUTH_SECRET`)
        }
      }
      for (const { Name, Value } of (container.Environment ?? []) as Array<{ Name: string; Value: unknown }>) {
        if (SECRET_NAMES.some(name => name.test(Name))) found.push(`${id}: ${Name} in the plain environment`)
        const unfixed: string[] = []
        const problem = environmentProblem(environmentText(Value, template, unfixed))
        if (problem !== undefined) found.push(`${id}: ${Name} ${problem}`)
        if (unfixed.some(ref => ref !== valkeyEndpoint)) {
          found.push(`${id}: ${Name} reads a part no template fixes other than the stage's Valkey endpoint`)
        }
      }
    }
  }
  for (const [id, r] of ofType(template, 'AWS::SecretsManager::Secret')) {
    if (r.Properties?.SecretString !== undefined) found.push(`${id}: a secret written into the template`)
  }
  // Every SSM parameter a workload template writes: a name a static reading fixes, so the Valkey
  // endpoint's writers can be counted (below), and a value with no dynamic reference, so no secret is
  // copied into a plain parameter, which ssm:GetParameter reads as text.
  for (const [id, r] of ofType(template, 'AWS::SSM::Parameter')) {
    if (renderedString(r.Properties?.Name, { template }) === undefined) {
      found.push(`${id}: a parameter whose name no static reading fixes`)
    }
    if (DYNAMIC_REFERENCE.test(JSON.stringify(r.Properties?.Value ?? ''))) {
      found.push(`${id}: a parameter that resolves a dynamic reference`)
    }
  }
  return found
}

// The Valkey endpoint parameter a stage's templates write (C11-D37): one, in its Data, whose value is
// the replication group's own address there or a literal host, so the one part of a plain environment
// value no template fixes, a URL's host, never carries user information, a port or a query at deploy.
const ADDRESS = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/i
function valkeyEndpointProblems(templates: ReadonlyArray<readonly [string, Template]>, env: EnvironmentName): string[] {
  const writers = templates.flatMap(([part, template]) =>
    ofType(template, 'AWS::SSM::Parameter')
      .filter(([, r]) => renderedString(r.Properties?.Name, { template }) === valkeyEndpointName(env))
      .map(([id, r]) => ({ part, template, id, value: r.Properties?.Value })),
  )
  if (writers.length !== 1) return [`${writers.length} writers of ${valkeyEndpointName(env)}, not one`]
  const [{ part, template, id, value }] = writers as [(typeof writers)[number]]
  const group = getAttOf(value, 'PrimaryEndPoint.Address')
  const address =
    (group !== undefined && ofType(template, 'AWS::ElastiCache::ReplicationGroup').some(([g]) => g === group)) ||
    (typeof value === 'string' && ADDRESS.test(value))
  return [
    ...(part === 'Data' ? [] : [`${id}: in ${part}, not Data`]),
    ...(address ? [] : [`${id}: neither the replication group's address nor a literal host`]),
  ]
}

// The part of each load balancer a stage's templates hold: one, in its Platform, where the stage has
// one, so no second load balancer of any type is another way in (C11-D31, C11-D45).
const stageBalancers = (templates: ReadonlyArray<readonly [string, Template]>): string[] =>
  templates.flatMap(([part, template]) => ofType(template, 'AWS::ElasticLoadBalancingV2::LoadBalancer').map(() => part))
// The security groups, rules and VPC endpoints a stack other than its stage's Platform holds, which
// must be none (C11-D30, C11-D31): every group and rule is Platform's, so no later stack opens a way
// between the groups it reads by name, which the ingress check above, reading one template, can't
// resolve; and every endpoint is, so IAC-12's exact set, read in each Platform, is the stage's whole
// set, and no later stack adds an endpoint to another service, an AWS one or a PrivateLink service
// outside AWS, in a group the tasks already reach. The exact rule table is network.test.ts's.
const PLATFORM_ONLY_TYPES = [
  'AWS::EC2::SecurityGroup',
  'AWS::EC2::SecurityGroupIngress',
  'AWS::EC2::SecurityGroupEgress',
  'AWS::EC2::VPCEndpoint',
]
const outsidePlatform = (name: string, template: Template): string[] =>
  name.endsWith('-Platform')
    ? []
    : resources(template)
        .filter(([, r]) => PLATFORM_ONLY_TYPES.includes(r.Type))
        .map(([id, r]) => `${id}: ${r.Type}`)

describe('C11-D29 to C11-D31 C11-D37 C11-D45: the network’s invariants', () => {
  it('IAC-03 IAC-04 IAC-20 C11-D37: the invariants find each break, planted in copies of the real templates', () => {
    const nonprod = workloadTemplate(workload, 'nonprod', 'Platform')
    const restore = workloadTemplate(workload, 'restore', 'Platform')
    const services = workloadTemplate(workload, 'nonprod', 'Services')
    const data = workloadTemplate(workload, 'nonprod', 'Data')
    for (const [env, template] of [
      ['nonprod', nonprod],
      ['restore', restore],
      ['nonprod', services],
      ['nonprod', data],
    ] as const) {
      expect(networkProblems(template, env)).toEqual([])
    }
    const groupOf = (template: Template, what: string) =>
      ofType(template, 'AWS::EC2::SecurityGroup').find(([, r]) =>
        String(r.Properties?.GroupDescription).includes(` ${what} (C11-D31)`),
      )?.[0] ?? ''
    const api = groupOf(nonprod, 'api tasks')
    const egress = (cidr: Record<string, string>) => (resources: Record<string, Resource>) => {
      resources.Planted = {
        Type: 'AWS::EC2::SecurityGroupEgress',
        Properties: { GroupId: { 'Fn::GetAtt': [api, 'GroupId'] }, IpProtocol: '-1', ...cidr },
      }
    }
    expect(networkProblems(plantedIn(nonprod, egress({ CidrIp: '0.0.0.0/0' })), 'nonprod')).toEqual([
      'Planted: egress to 0.0.0.0/0',
    ])
    expect(networkProblems(plantedIn(nonprod, egress({ CidrIpv6: '::/0' })), 'nonprod')).toEqual([
      'Planted: egress to ::/0',
    ])
    const open = plantedIn(nonprod, resources => {
      const group = resources[api]
      if (group?.Properties !== undefined)
        group.Properties.SecurityGroupEgress = [{ CidrIp: '0.0.0.0/0', IpProtocol: '-1' }]
    })
    expect(networkProblems(open, 'nonprod')).toEqual([
      `${api}: its inline egress isn't EC2's placeholder alone`,
      `${api}: egress to 0.0.0.0/0`,
    ])
    const igw = ofType(nonprod, 'AWS::EC2::InternetGateway')[0]?.[0] ?? ''
    const isolatedTable =
      ofType(nonprod, 'AWS::EC2::RouteTable').find(([id]) => id.includes('isolated'))?.[0] ?? 'no isolated table'
    const route = (properties: Record<string, unknown>) => (resources: Record<string, Resource>) => {
      resources.Planted = { Type: 'AWS::EC2::Route', Properties: properties }
    }
    expect(
      networkProblems(
        plantedIn(
          nonprod,
          route({ DestinationCidrBlock: '0.0.0.0/0', GatewayId: { Ref: igw }, RouteTableId: { Ref: isolatedTable } }),
        ),
        'nonprod',
      ),
    ).toEqual(["Planted: a route in a table that isn't public"])
    const publicTable = ofType(nonprod, 'AWS::EC2::Route')[0]?.[1].Properties?.RouteTableId
    expect(
      networkProblems(
        plantedIn(
          nonprod,
          route({ DestinationIpv6CidrBlock: '::/0', GatewayId: { Ref: igw }, RouteTableId: publicTable }),
        ),
        'nonprod',
      ),
    ).toEqual(['Planted: an IPv6 route', "Planted: not a default route to the stage's internet gateway"])
    expect(
      networkProblems(
        plantedIn(
          nonprod,
          route({ DestinationCidrBlock: '0.0.0.0/0', NatGatewayId: 'nat', RouteTableId: publicTable }),
        ),
        'nonprod',
      ),
    ).toEqual(['Planted: a route to a NatGatewayId', "Planted: not a default route to the stage's internet gateway"])
    const types = [
      'AWS::EC2::NatGateway',
      'AWS::EC2::EgressOnlyInternetGateway',
      'AWS::EC2::VPCPeeringConnection',
      'AWS::EC2::TransitGatewayAttachment',
      'AWS::EC2::VPNGateway',
      'AWS::EC2::VPNConnection',
      'AWS::EC2::CustomerGateway',
      'AWS::EC2::ClientVpnEndpoint',
      'AWS::EC2::InstanceConnectEndpoint',
      'AWS::EC2::VPCEndpointService',
      'AWS::EC2::VerifiedAccessEndpoint',
      'AWS::EC2::CarrierGateway',
      'AWS::EC2::LocalGatewayRouteTable',
      'AWS::EC2::EIP',
      'AWS::EC2::EIPAssociation',
      'AWS::VpcLattice::ResourceGateway',
      'AWS::VpcLattice::ServiceNetworkVpcAssociation',
      'AWS::ApiGateway::VpcLink',
      'AWS::ApiGatewayV2::VpcLink',
      'AWS::CloudFront::VpcOrigin',
      'AWS::GlobalAccelerator::EndpointGroup',
      'AWS::ElasticLoadBalancing::LoadBalancer',
    ]
    const ways = plantedIn(nonprod, resources => {
      for (const [i, Type] of types.entries()) resources[`Way${i}`] = { Type }
    })
    expect(networkProblems(ways, 'nonprod')).toEqual(types.map((type, i) => `Way${i}: ${type}`))
    // Ingress from outside the stage's own groups: Valkey from the VPC's range, inline and as its own
    // rule, the api from a prefix list, a rule on a group the template doesn't make, one naming two
    // peers, and the load balancer's group from anywhere on IPv6 and on another port; its own tcp 443
    // from anywhere is admitted as a rule of its own too.
    const alb = groupOf(nonprod, 'load balancer in front of api and realtime')
    const valkeyGroup = groupOf(nonprod, 'Valkey')
    const group = (id: string) => ({ 'Fn::GetAtt': [id, 'GroupId'] })
    const ingress = (properties: Record<string, unknown>) => (resources: Record<string, Resource>) => {
      resources.Planted = { Type: 'AWS::EC2::SecurityGroupIngress', Properties: { IpProtocol: 'tcp', ...properties } }
    }
    const vpcRange = ['10', '0', '0', '0/8'].join('.')
    const refused = ["Planted: ingress from outside the stage's own groups"]
    for (const properties of [
      { GroupId: group(valkeyGroup), CidrIp: vpcRange, FromPort: 6379, ToPort: 6379 },
      { GroupId: group(api), SourcePrefixListId: 'pl-planted', FromPort: 3000, ToPort: 3000 },
      { GroupId: { Ref: 'PlantedGroup' }, SourceSecurityGroupId: group(api), FromPort: 6379, ToPort: 6379 },
      {
        GroupId: group(valkeyGroup),
        SourceSecurityGroupId: group(api),
        CidrIp: vpcRange,
        FromPort: 6379,
        ToPort: 6379,
      },
      { GroupId: group(api), CidrIp: '0.0.0.0/0', FromPort: 443, ToPort: 443 },
      { GroupId: group(alb), CidrIpv6: '::/0', FromPort: 443, ToPort: 443 },
      { GroupId: group(alb), CidrIp: '0.0.0.0/0', FromPort: 80, ToPort: 80 },
    ]) {
      expect(networkProblems(plantedIn(nonprod, ingress(properties)), 'nonprod'), JSON.stringify(properties)).toEqual(
        refused,
      )
    }
    expect(
      networkProblems(
        plantedIn(nonprod, ingress({ GroupId: group(alb), CidrIp: '0.0.0.0/0', FromPort: 443, ToPort: 443 })),
        'nonprod',
      ),
    ).toEqual([])
    const inline = plantedIn(nonprod, resources => {
      const properties = resources[valkeyGroup]?.Properties
      if (properties !== undefined) {
        properties.SecurityGroupIngress = [{ CidrIp: vpcRange, IpProtocol: 'tcp', FromPort: 6379, ToPort: 6379 }]
      }
      const balancerGroup = resources[alb]?.Properties
      if (balancerGroup !== undefined) {
        balancerGroup.SecurityGroupIngress = [
          ...((balancerGroup.SecurityGroupIngress ?? []) as unknown[]),
          { CidrIpv6: '::/0', IpProtocol: 'tcp', FromPort: 443, ToPort: 443 },
        ]
      }
    })
    expect(networkProblems(inline, 'nonprod')).toEqual([
      `${alb}: inline ingress from outside the stage's own groups`,
      `${valkeyGroup}: inline ingress from outside the stage's own groups`,
    ])
    // A load balancer of another type, or outside the stage's one group (the stage's count is below).
    const [balancer] = ofType(nonprod, 'AWS::ElasticLoadBalancingV2::LoadBalancer')[0] as [string, Resource]
    const balancers = plantedIn(nonprod, resources => {
      const properties = resources[balancer]?.Properties
      if (properties !== undefined) properties.Type = 'network'
      resources.Ungrouped = { Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer', Properties: { Type: 'application' } }
    })
    expect(networkProblems(balancers, 'nonprod')).toEqual([
      `${balancer}: not an application load balancer`,
      "Ungrouped: not in one of the stage's own groups alone",
    ])
    const service = plantedIn(services, resources => {
      const network = resources.ApiService?.Properties?.NetworkConfiguration as {
        AwsvpcConfiguration: Record<string, unknown>
      }
      network.AwsvpcConfiguration.AssignPublicIp = 'ENABLED'
    })
    expect(networkProblems(service, 'nonprod')).toEqual(['ApiService: may take a public address'])
    const isolatedSubnet = ofType(nonprod, 'AWS::EC2::Subnet').find(([id]) => id.includes('isolated'))?.[0] ?? ''
    const mapping = plantedIn(nonprod, resources => {
      const subnet = resources[isolatedSubnet]
      if (subnet?.Properties !== undefined) subnet.Properties.MapPublicIpOnLaunch = true
    })
    expect(networkProblems(mapping, 'nonprod')).toEqual([`${isolatedSubnet}: gives a public address on launch`])
    const exposed = plantedIn(restore, resources => {
      const [subnetId, subnet] = ofType(nonprod, 'AWS::EC2::Subnet').find(
        ([, r]) => tagOf(r, 'aws-cdk:subnet-type') === 'Public',
      ) as [string, Resource]
      resources[subnetId] = structuredClone(subnet)
      resources.Balancer = { Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer' }
    })
    const publicSubnet = ofType(nonprod, 'AWS::EC2::Subnet').find(
      ([, r]) => tagOf(r, 'aws-cdk:subnet-type') === 'Public',
    )?.[0]
    expect(networkProblems(exposed, 'restore')).toEqual([
      'Balancer: AWS::ElasticLoadBalancingV2::LoadBalancer in the restore stage',
      `${publicSubnet}: a public subnet in the restore stage`,
    ])
    const container = (edit: (container: Record<string, unknown>) => void, base: Template = services) =>
      plantedIn(base, resources => {
        const [id] =
          ofType(base, 'AWS::ECS::TaskDefinition').find(([, r]) => r.Properties?.Family === 'hearth-nonprod-api') ?? []
        const [first] = (resources[id ?? '']?.Properties?.ContainerDefinitions ?? []) as Array<Record<string, unknown>>
        if (first !== undefined) edit(first)
      })
    const apiTask = ofType(services, 'AWS::ECS::TaskDefinition').find(
      ([, r]) => r.Properties?.Family === 'hearth-nonprod-api',
    )?.[0]
    expect(
      networkProblems(
        container(c => {
          c.Image = 'hearth-server:latest'
        }),
        'nonprod',
      ),
    ).toEqual([`${apiTask}: an image not by digest`])
    expect(
      networkProblems(
        container(c => {
          c.Secrets = [{ Name: 'AUTH_SECRET', ValueFrom: workloadArn('secretsmanager', REGION, 'secret:x') }]
        }),
        'nonprod',
      ),
    ).toEqual([`${apiTask}: AUTH_SECRET not by reference to the stage's AUTH_SECRET`])
    expect(
      networkProblems(
        container(c => {
          c.Environment = [...((c.Environment ?? []) as unknown[]), { Name: 'TWILIO_AUTH_TOKEN', Value: 'x' }]
        }),
        'nonprod',
      ),
    ).toEqual([`${apiTask}: TWILIO_AUTH_TOKEN in the plain environment`])
    // A value set in place of the api's own, each as C0.12's Valkey users or a database password might
    // be written: the password in literal text or an SSM parameter's value inside the user information,
    // a dynamic reference, and a shape no static reading fixes.
    const valued = (Name: string, Value: unknown, base: Template = services) =>
      networkProblems(
        container(c => {
          const environment = (c.Environment ?? []) as Array<{ Name: string; Value: unknown }>
          c.Environment = [...environment.filter(e => e.Name !== Name), { Name, Value }]
        }, base),
        'nonprod',
      )
    const password = (Name: string) => [`${apiTask}: ${Name} holds a URL with a password`]
    const outsideHost = (Name: string) => [`${apiTask}: ${Name} holds a part no template fixes outside a URL's host`]
    const pair = ['hearth_api', 'planted'].join(':')
    const host = { Ref: parameterNamed(services, valkeyEndpointName('nonprod')) }
    const valkey = (...parts: unknown[]) => ({ 'Fn::Join': ['', ['rediss://', ...parts, '@', host, ':6379']] })
    expect(host.Ref).toBeDefined()
    expect(valued('VALKEY_URL', valkey('hearth_api:', host))).toEqual(password('VALKEY_URL'))
    expect(valued('VALKEY_URL', valkey(pair))).toEqual(password('VALKEY_URL'))
    expect(valued('VALKEY_URL', valkey(host))).toEqual(outsideHost('VALKEY_URL'))
    expect(valued('VALKEY_URL', valkey('hearth_api'))).toEqual([])
    expect(
      valued('DATABASE_URL', ['postgres://hearth_app:', 'planted', '@database.pending.invalid:5432/hearth'].join('')),
    ).toEqual(password('DATABASE_URL'))
    // Every URL in a value, not the first alone: a second joined by a comma (after a URL with no path,
    // or with one) or a semicolon, one written as a query value, a writer and a reader, a key naming a
    // credential in a later URL's query, and one after text shaped like a scheme inside a query, which
    // never cuts the first URL's query short. Two URLs with no password pass, each host fixed or not.
    for (const value of [
      `rediss://valkey-a:6379,rediss://${pair}@valkey-b:6379`,
      `https://a.example/x,postgres://${pair}@db:5432/hearth`,
      `https://otel.example:4318;postgres://${pair}@db/hearth`,
      `https://a.example/cb?next=postgres://${pair}@db:5432/hearth`,
      { 'Fn::Join': [',', ['postgres://hearth_app@writer/hearth', `postgres://${pair}@reader/hearth`]] },
      'https://a.example/x?y=1,postgres://db/hearth?password=x',
      'postgres://hearth_app@db/hearth?x=y://&password=x',
    ]) {
      expect(valued('DATABASE_URL', value), JSON.stringify(value)).toEqual(password('DATABASE_URL'))
    }
    expect(valued('VALKEY_URL', 'rediss://valkey-a:6379,rediss://valkey-b:6379')).toEqual([])
    expect(valued('VALKEY_URL', { 'Fn::Join': [',', [valkey('hearth_api'), valkey('hearth_api')]] })).toEqual([])
    // A part no template fixes outside a URL's host, where it could carry a password no reading here
    // sees: an SSM parameter's whole value, a scheme read from one before a literal password, part of
    // a scheme, and user information. And any part read from a parameter but the stage's Valkey
    // endpoint, even as a URL's host, as a database's URL or host might be read: a parameter of the
    // database's, and the endpoint's own read as a plain parameter, which the deploy fills.
    expect(valued('DATABASE_URL', host)).toEqual(outsideHost('DATABASE_URL'))
    for (const parts of [
      [host, `://${pair}@db.internal:5432/hearth`],
      ['postgres', host, ['://hearth_app', 'db.internal:5432/hearth'].join('@')],
      ['postgres://', host, '@db.internal:5432/hearth'],
    ]) {
      expect(valued('DATABASE_URL', { 'Fn::Join': ['', parts] }), JSON.stringify(parts)).toEqual(
        outsideHost('DATABASE_URL'),
      )
    }
    const database = ['postgres://hearth_app', 'database.pending.invalid:5432/hearth'].join('@')
    const read = structuredClone(services)
    read.Parameters = {
      ...(read.Parameters as Record<string, unknown>),
      PlantedDatabase: { Type: SSM_STRING, Default: ['', 'hearth', 'nonprod', 'database', 'url'].join('/') },
    }
    const other = [`${apiTask}: DATABASE_URL reads a part no template fixes other than the stage's Valkey endpoint`]
    expect(valued('DATABASE_URL', { Ref: 'PlantedDatabase' }, read)).toEqual([...outsideHost('DATABASE_URL'), ...other])
    expect(
      valued(
        'DATABASE_URL',
        { 'Fn::Join': ['', ['postgres://hearth_app@', { Ref: 'PlantedDatabase' }, ':5432']] },
        read,
      ),
    ).toEqual(other)
    const untyped = structuredClone(services)
    const parameter = (untyped.Parameters as Record<string, Record<string, unknown>>)[host.Ref ?? '']
    if (parameter !== undefined) parameter.Type = 'String'
    expect(networkProblems(untyped, 'nonprod')).toEqual(
      ofType(services, 'AWS::ECS::TaskDefinition').map(
        ([id]) => `${id}: VALKEY_URL reads a part no template fixes other than the stage's Valkey endpoint`,
      ),
    )
    // A password in the query, which pg and ioredis read as readily as from the user information:
    // literal, in any case and percent-encoded, with a user or without, in a fragment, and from a part
    // no template fixes. Such a part is refused anywhere but the host (the port, the path, the query),
    // whatever key it follows. A query that names no credential passes, and so does each real value.
    for (const query of ['password=x', 'PASSWORD=x', 'pass%77ord=x', 'sslpassword=x', 'user=hearth_app&password=x']) {
      expect(valued('DATABASE_URL', `${database}?${query}`), query).toEqual(password('DATABASE_URL'))
    }
    expect(
      valued(
        'DATABASE_URL',
        ['postgres://database.pending.invalid:5432/hearth', 'user=hearth_app&password=x'].join('?'),
      ),
    ).toEqual(password('DATABASE_URL'))
    expect(valued('DATABASE_URL', { 'Fn::Join': ['', [`${database}?password=`, host]] })).toEqual(
      password('DATABASE_URL'),
    )
    expect(valued('DATABASE_URL', `${database}?sslmode=verify-full`)).toEqual([])
    expect(valued('DATABASE_URL', database)).toEqual([])
    const queried = (...parts: unknown[]) => ({ 'Fn::Join': ['', ['rediss://', host, ':6379', ...parts]] })
    expect(valued('VALKEY_URL', ['rediss://valkey.pending.invalid:6379', 'password=x'].join('?'))).toEqual(
      password('VALKEY_URL'),
    )
    for (const parts of [
      ['?password=x'],
      ['?username=hearth_api&password=', host],
      ['?password=', host],
      ['#password=x'],
    ]) {
      expect(valued('VALKEY_URL', queried(...parts)), JSON.stringify(parts)).toEqual(password('VALKEY_URL'))
    }
    for (const parts of [
      ['?', host],
      ['/', host],
    ]) {
      expect(valued('VALKEY_URL', queried(...parts)), JSON.stringify(parts)).toEqual(outsideHost('VALKEY_URL'))
    }
    expect(valued('VALKEY_URL', { 'Fn::Join': ['', ['rediss://', host, ':', host]] })).toEqual(
      outsideHost('VALKEY_URL'),
    )
    expect(valued('VALKEY_URL', queried())).toEqual([])
    // A dynamic reference, a secret's or a plain SSM parameter's, whole or as a later URL's password.
    const dynamic = (Name: string) => [`${apiTask}: ${Name} resolves a dynamic reference into the plain environment`]
    for (const value of [
      { 'Fn::Join': ['', ['postgres://hearth_app:', '{{resolve:secretsmanager:planted}}', '@h']] },
      `{{resolve:ssm:${['', 'hearth', 'nonprod', 'database', 'url'].join('/')}}}`,
      `${database},postgres://hearth_ro:{{resolve:ssm:${['', 'hearth', 'nonprod', 'planted'].join('/')}}}@reader/hearth`,
    ]) {
      expect(valued('DATABASE_URL', value), JSON.stringify(value)).toEqual(dynamic('DATABASE_URL'))
    }
    expect(valued('VALKEY_URL', { 'Fn::If': ['Planted', valkey('hearth_api'), 'rediss://h:6379'] })).toEqual([
      `${apiTask}: VALKEY_URL is a value no static reading fixes`,
    ])
    const written = plantedIn(data, resources => {
      const [id] = ofType(data, 'AWS::SecretsManager::Secret')[0] ?? []
      const secret = resources[id ?? '']
      if (secret?.Properties !== undefined) secret.Properties.SecretString = 'planted'
    })
    expect(networkProblems(written, 'nonprod')).toEqual([
      `${ofType(data, 'AWS::SecretsManager::Secret')[0]?.[0]}: a secret written into the template`,
    ])
    // An SSM parameter that copies a secret into plain text, as a database's URL might be written, and
    // one whose name no static reading fixes.
    const parameterIn = (properties: Record<string, unknown>) =>
      plantedIn(data, resources => {
        resources.Planted = { Type: 'AWS::SSM::Parameter', Properties: { Type: 'String', ...properties } }
      })
    const url = { 'Fn::Join': ['', ['postgres://hearth_app:', '{{resolve:secretsmanager:planted}}', '@db.internal']] }
    expect(
      networkProblems(
        parameterIn({ Name: ['', 'hearth', 'nonprod', 'database', 'url'].join('/'), Value: url }),
        'nonprod',
      ),
    ).toEqual(['Planted: a parameter that resolves a dynamic reference'])
    expect(networkProblems(parameterIn({ Name: { Ref: 'PlantedName' }, Value: 'h' }), 'nonprod')).toEqual([
      'Planted: a parameter whose name no static reading fixes',
    ])
  })

  it('C11-D37 IAC-09: each stage writes its Valkey endpoint, the one part of a plain environment value no template fixes, once, in its Data, as the replication group’s address or a literal host, in every build; each break, planted in copies of the real templates, is found', () => {
    const stage = (synth: WorkloadSynth, env: EnvironmentName) =>
      PARTS.map(part => [part, workloadTemplate(synth, env, part)] as const)
    const nonprod = stage(workload, 'nonprod')
    const swapped = (part: string, template: Template) =>
      valkeyEndpointProblems(
        nonprod.map(([p, t]) => [p, p === part ? template : t] as const),
        'nonprod',
      )
    const data = workloadTemplate(workload, 'nonprod', 'Data')
    const platform = workloadTemplate(workload, 'nonprod', 'Platform')
    const [id, written] = ofType(data, 'AWS::SSM::Parameter').find(
      ([, r]) => r.Properties?.Name === valkeyEndpointName('nonprod'),
    ) as [string, Resource]
    const valued = (Value: unknown) =>
      swapped(
        'Data',
        plantedIn(data, resources => {
          const properties = resources[id]?.Properties
          if (properties !== undefined) properties.Value = Value
        }),
      )
    // A value that isn't the replication group's address or a host: user information with a password,
    // a port, a dynamic reference, an SSM parameter of the account's, and another resource's address.
    const notAddress = [`${id}: neither the replication group's address nor a literal host`]
    for (const value of [
      `${['hearth_api', 'planted'].join(':')}@valkey.internal`,
      'valkey.internal:6379',
      '{{resolve:secretsmanager:planted}}',
      { Ref: 'PlantedParameter' },
      { 'Fn::GetAtt': ['Planted', 'PrimaryEndPoint.Address'] },
    ]) {
      expect(valued(value), JSON.stringify(value)).toEqual(notAddress)
    }
    expect(valued('valkey.pending.invalid')).toEqual([])
    // Written a second time, in Platform instead, and by none.
    const moved = { ...structuredClone(written), Properties: { ...written.Properties, Value: 'valkey.internal' } }
    const twice = plantedIn(platform, resources => {
      resources.Planted = moved
    })
    const none = plantedIn(data, resources => {
      delete resources[id]
    })
    const count = (n: number) => [`${n} writers of ${valkeyEndpointName('nonprod')}, not one`]
    expect(swapped('Platform', twice)).toEqual(count(2))
    expect(
      valkeyEndpointProblems(
        nonprod.map(([p, t]) => [p, p === 'Platform' ? twice : p === 'Data' ? none : t] as const),
        'nonprod',
      ),
    ).toEqual(['Planted: in Platform, not Data'])
    expect(swapped('Data', none)).toEqual(count(0))
    for (const [build, synth, envs] of builds()) {
      for (const env of envs) expect(valkeyEndpointProblems(stage(synth, env), env), `${build} ${env}`).toEqual([])
    }
  })

  it('IAC-03 IAC-12 C11-D30 C11-D31: no security group, rule or VPC endpoint outside a stage’s Platform, in any build; one planted in each of copies of the real Services, Data and Tasks templates is found, an endpoint to a PrivateLink service outside AWS among them', () => {
    const plant = (part: 'Services' | 'Data' | 'Tasks', type: string, properties: Record<string, unknown> = {}) =>
      outsidePlatform(
        `Hearth-nonprod-${part}`,
        plantedIn(workloadTemplate(workload, 'nonprod', part), resources => {
          resources.Planted = { Type: type, Properties: properties }
        }),
      )
    expect(plant('Services', 'AWS::EC2::SecurityGroupEgress')).toEqual(['Planted: AWS::EC2::SecurityGroupEgress'])
    expect(plant('Data', 'AWS::EC2::SecurityGroupIngress')).toEqual(['Planted: AWS::EC2::SecurityGroupIngress'])
    expect(plant('Tasks', 'AWS::EC2::SecurityGroup')).toEqual(['Planted: AWS::EC2::SecurityGroup'])
    // Platform's own ecr.api endpoint, copied whole, and once as an endpoint to a partner's service.
    const [, ecrApi] = ofType(workloadTemplate(workload, 'nonprod', 'Platform'), 'AWS::EC2::VPCEndpoint').find(
      ([, r]) => r.Properties?.ServiceName === serviceName('ecr.api'),
    ) as [string, Resource]
    const partner = ['com', 'amazonaws', 'vpce', REGION, `vpce-svc-${'a'.repeat(17)}`].join('.')
    expect(plant('Data', 'AWS::EC2::VPCEndpoint', { ...ecrApi.Properties, ServiceName: partner })).toEqual([
      'Planted: AWS::EC2::VPCEndpoint',
    ])
    expect(plant('Services', 'AWS::EC2::VPCEndpoint', structuredClone(ecrApi.Properties))).toEqual([
      'Planted: AWS::EC2::VPCEndpoint',
    ])
    expect(plant('Tasks', 'AWS::EC2::VPCEndpoint', structuredClone(ecrApi.Properties))).toEqual([
      'Planted: AWS::EC2::VPCEndpoint',
    ])
    for (const type of ['AWS::EC2::SecurityGroup', 'AWS::EC2::VPCEndpoint']) {
      expect(
        workloadTemplates()
          .filter(({ name }) => name.endsWith('-Platform'))
          .map(({ template }) => ofType(template, type).length > 0),
        type,
      ).toEqual(builds().flatMap(([, , envs]) => envs.map(() => true)))
    }
    for (const { label, name, template } of workloadTemplates()) {
      expect(outsidePlatform(name, template), label).toEqual([])
    }
  })

  it('IAC-03 C11-D31: a stage holds one load balancer, in its Platform, and the restore stage none; a second, planted in a copy of a real Services template, is found', () => {
    const stage = (synth: WorkloadSynth, env: EnvironmentName, swap?: Template) =>
      stageBalancers(PARTS.map(part => [part, part === 'Services' && swap ? swap : workloadTemplate(synth, env, part)]))
    const second = plantedIn(workloadTemplate(workload, 'nonprod', 'Services'), resources => {
      resources.Second = { Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer', Properties: { Type: 'network' } }
    })
    expect(stage(workload, 'nonprod', second)).toEqual(['Platform', 'Services'])
    for (const [build, synth, envs] of builds()) {
      for (const env of envs) {
        expect(stage(synth, env), `${build} ${env}`).toEqual(env === 'restore' ? [] : ['Platform'])
      }
    }
  })

  it('IAC-03 IAC-04 IAC-20 C11-D37: every workload template keeps them, in every build', () => {
    for (const { label, env, template } of workloadTemplates()) {
      expect(networkProblems(template, env), label).toEqual([])
    }
  })

  it('C11-D45 IAC-20: the restore stage holds no public subnet, internet gateway, route, load balancer, listener, target group, certificate or record, committed or with restoreActive set', () => {
    for (const [build, synth] of buildsWith('restore')) {
      for (const part of PARTS) {
        const template = workloadTemplate(synth, 'restore', part)
        const found = resources(template)
          .filter(([, r]) => [...PUBLIC_TYPES, 'AWS::EC2::Route'].includes(r.Type))
          .map(([id]) => id)
        expect(found, `${build} ${part}`).toEqual([])
      }
      const subnets = ofType(workloadTemplate(synth, 'restore', 'Platform'), 'AWS::EC2::Subnet')
      expect(subnets, build).toHaveLength(2)
      for (const [id, subnet] of subnets) expect(tagOf(subnet, 'aws-cdk:subnet-type'), id).toBe('Isolated')
    }
  })
})

// --- Event patterns: a Match helper is never wrapped in another list (C11-D16) ----------------------

// Each place an event pattern holds a list inside a list, which EventBridge never matches.
function nestedLists(pattern: unknown, path = ''): string[] {
  if (Array.isArray(pattern)) {
    return pattern.flatMap((item, i) => (Array.isArray(item) ? [`${path}[${i}]`] : nestedLists(item, `${path}[${i}]`)))
  }
  if (isObject(pattern)) return Object.entries(pattern).flatMap(([key, value]) => nestedLists(value, `${path}.${key}`))
  return []
}

describe('C11-D16: every event pattern is one EventBridge can match', () => {
  it('finds a Match helper wrapped in a list, on a planted pattern', () => {
    const planted = { detail: { requestParameters: { roleArn: [[{ suffix: ':role/x' }]] }, eventName: ['AssumeRole'] } }
    expect(nestedLists(planted)).toEqual(['.detail.requestParameters.roleArn[0]'])
  })

  it('no rule’s pattern in any landing-zone template holds a list inside a list', () => {
    const rules = STACKS.flatMap(({ name }) =>
      ofType(templateOf(name), 'AWS::Events::Rule').map(([, rule]) => ({ name, rule })),
    )
    expect(rules.length).toBe(14)
    const found = rules.flatMap(({ name, rule }) =>
      nestedLists(rule.Properties?.EventPattern).map(path => `${name} ${String(rule.Properties?.Name)}${path}`),
    )
    expect(found).toEqual([])
  })
})
