// The checks that read every landing-zone template whole (C11-D70), beside each stack's own tests:
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
// The planted cases come first, each found, so no check passes by reading nothing. This file holds
// rules every landing-zone template is held to, so it is on the owner's-read list (C11-D74). Expected
// ARNs are joined from their parts here (IG-01), model actions come from the lists (IG-10), and the
// forbidden types it looks for are named only in a test (IG-11, IG-12). PR 3 adds the workload
// entry's templates, with the VPC's one custom resource and its provider.
import { beforeAll, describe, expect, it } from 'vitest'
import { globsOverlap, MODEL_ACTIONS, MODEL_SERVICE_PREFIXES, modelDenyActions } from '../config/models.ts'
import { REGION } from '../config/profiles.ts'
import { fixtureConfig } from '../testing/fixture.ts'
import { type LandingZoneSynth, synthLandingZone } from '../testing/landing-zone.ts'
import {
  attachedPolicyName,
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

beforeAll(() => {
  lz = synthLandingZone()
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
    'drop the SMS statements, then NoRouteOut (the SCPs still deny both), never NoModels, NoLongLivedCredentials or NoNewIdentityProviders',
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

// Each construct a landing-zone template must not hold (C11-D24, C11-D76; IG-11): a Lambda of any
// kind, any custom resource, a SAM resource, a macro, a nested stack, a transform at the top or at any
// depth, an import at any depth, and an export. PR 3 adds the workload allowance: the VPC's one
// default-security-group custom resource, its provider's function and role.
type TemplateAllowance = 'landing-zone'
function forbiddenInTemplate(template: Template, allowance: TemplateAllowance): string[] {
  const found: string[] = []
  for (const [logicalId, resource] of resources(template)) {
    const type = String(resource.Type)
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
        if (key === 'Fn::Transform' || key === 'Fn::ImportValue') found.push(`${path}: ${key}`)
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

// IAC-22 (C11-D76), this file's own copy (entries.test.ts holds the entry's): what an asset manifest
// would make the CLI run or build. A landing-zone stack publishes its template alone.
function assetProblems(manifests: ReadonlyMap<string, unknown>): string[] {
  const found: string[] = []
  for (const [path, manifest] of manifests) {
    const { files, dockerImages } = manifest as {
      files?: Record<string, unknown>
      dockerImages?: Record<string, unknown>
    }
    if (dockerImages !== undefined && Object.keys(dockerImages).length > 0) found.push(`${path}: a Docker image`)
    for (const [id, file] of Object.entries(files ?? {})) {
      const source = (file as { source?: Record<string, unknown> }).source ?? {}
      if ('executable' in source) found.push(`${path}: ${id} runs a command`)
      if (source.packaging !== undefined && source.packaging !== 'file') found.push(`${path}: ${id} is packaged`)
      if (typeof source.path !== 'string' || !source.path.endsWith('.template.json')) {
        found.push(`${path}: ${id} isn't a template`)
      }
    }
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
