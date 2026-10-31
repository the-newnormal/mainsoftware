// IAC-24 and IAC-01 over the CDK bootstrap template Hearth deploys (C11-D26, C11-D75; TECH-SPEC T24
// item 11): the committed infra/bootstrap/hearth-bootstrap.yaml is strict JSON, is exactly what the
// generator makes from the pinned CLI's own template, differs from that template only by the model
// deny on each of its five roles, sts:SetSourceIdentity in the deploy and file-publishing roles'
// same-account trust (which a break-glass session's chain into them needs: C11-D11, C11-D27) and the
// variant's default, fits the landing zone's bootstrap version and qualifier, keeps the stock
// template's S3 delete grants and lifecycle rules where they were, passes IAC-01's model check and
// its own copy of the template check (no Lambda, custom resource, transform or import, its one export
// pinned), and fits the request body `cdk bootstrap` sends. The generator's refusals are proved on
// planted CLI templates. A CDK upgrade whose CLI template changed fails here until a person runs
// `node infra/scripts/bootstrap-template.ts` on its branch and reads the change. This file holds
// IAC-24's rules, so it is on the owner's-read list (C11-D74). Model actions come from the lists,
// never written (IG-10).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { globsOverlap, modelDenyActions } from '../src/config/models.ts'
import { synthLandingZone } from '../src/testing/landing-zone.ts'
import {
  attachedPolicyName,
  isModelDenyInPlace,
  type ModelCheckAllowance,
  managedPolicyAttachments,
  modelCheck,
  policyStatements,
} from '../src/testing/policies.ts'
import {
  BOOTSTRAP_ROLES,
  type CfnTemplate,
  COMMITTED_TEMPLATE,
  readCloudFormationFile,
  render,
  STOCK_TEMPLATE,
  withModelDeny,
} from './bootstrap-template.ts'

const REGENERATE =
  'the committed bootstrap template differs from what the generator makes: run `node infra/scripts/bootstrap-template.ts` and read the change (an owner’s-read change, C11-D75)'

// The deny each role must carry, written out here rather than taken from the generator.
const NO_MODELS = {
  PolicyName: 'hearth-no-models',
  PolicyDocument: {
    Version: '2012-10-17',
    Statement: [{ Sid: 'HearthNoModels', Effect: 'Deny', Action: modelDenyActions(), Resource: '*' }],
  },
}
const VARIANT = 'Hearth: AWS CDK default resources with no model actions on any role (C11-D75)'

// The roles a break-glass session chains into under an lz:pr- reason, written out here rather than
// taken from the generator, and the stock same-account statement whose action list gains
// sts:SetSourceIdentity in each.
const SOURCE_IDENTITY_ROLES = ['DeploymentActionRole', 'FilePublishingRole']
const SAME_ACCOUNT = { AWS: { Ref: 'AWS::AccountId' } }
const STOCK_TAG_SESSION = { Action: 'sts:TagSession', Effect: 'Allow', Principal: SAME_ACCOUNT }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const resources = (template: CfnTemplate): Record<string, Record<string, unknown>> =>
  (isObject(template.Resources) ? template.Resources : {}) as Record<string, Record<string, unknown>>
const propertiesOf = (template: CfnTemplate, logicalId: string): Record<string, unknown> => {
  const properties = resources(template)[logicalId]?.Properties
  return isObject(properties) ? properties : {}
}
const typesOf = (template: CfnTemplate, type: string) =>
  Object.entries(resources(template))
    .filter(([, resource]) => resource.Type === type)
    .map(([logicalId]) => logicalId)

// IAC-24 (a): the committed file is strict JSON, so a YAML short tag or any other YAML-only form is a
// parse error rather than a plain string.
const parseCommitted = (text: string): CfnTemplate => JSON.parse(text) as CfnTemplate

// IAC-24 (d): every leaf where two templates differ, as a path with its two values. A list longer on
// one side differs at each extra index; a key one side lacks differs as a whole.
interface Difference {
  path: string
  before: unknown
  after: unknown
}
function differences(before: unknown, after: unknown, path = ''): Difference[] {
  if (isDeepStrictEqual(before, after)) return []
  const at = (key: string | number) =>
    typeof key === 'number' ? `${path}[${key}]` : path === '' ? key : `${path}.${key}`
  if (Array.isArray(before) && Array.isArray(after)) {
    return Array.from({ length: Math.max(before.length, after.length) }, (_, i) =>
      differences(before[i], after[i], at(i)),
    ).flat()
  }
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    return keys.flatMap(key => differences(before[key], after[key], at(key)))
  }
  return [{ path, before, after }]
}

// A role's trust statements, as the template holds them.
const trustStatements = (template: CfnTemplate, role: string): unknown[] => {
  const trust = propertiesOf(template, role).AssumeRolePolicyDocument
  return isObject(trust) && Array.isArray(trust.Statement) ? trust.Statement : []
}

// The differences the deny, the trust and the variant make, and nothing else: each role's deny
// appended to its Policies (the list made where the stock role has none), the two roles' stock
// same-account TagSession statement given sts:SetSourceIdentity too, and the variant's default.
function expectedDifferences(stock: CfnTemplate): Difference[] {
  const roles = BOOTSTRAP_ROLES.map(role => {
    const stockPolicies = propertiesOf(stock, role).Policies
    return Array.isArray(stockPolicies)
      ? { path: `Resources.${role}.Properties.Policies[${stockPolicies.length}]`, before: undefined, after: NO_MODELS }
      : { path: `Resources.${role}.Properties.Policies`, before: undefined, after: [NO_MODELS] }
  })
  const trusts = SOURCE_IDENTITY_ROLES.map(role => {
    const index = trustStatements(stock, role).findIndex(statement => isDeepStrictEqual(statement, STOCK_TAG_SESSION))
    return {
      path: `Resources.${role}.Properties.AssumeRolePolicyDocument.Statement[${index}].Action`,
      before: 'sts:TagSession',
      after: ['sts:TagSession', 'sts:SetSourceIdentity'],
    }
  })
  const parameters = isObject(stock.Parameters) ? stock.Parameters : {}
  const variant = isObject(parameters.BootstrapVariant) ? parameters.BootstrapVariant.Default : undefined
  return [...roles, ...trusts, { path: 'Parameters.BootstrapVariant.Default', before: variant, after: VARIANT }]
}

// IAC-24 (j): each role's trust statements that name sts:SetSourceIdentity, as "the account" for an
// unconditional Allow to the account itself and "elsewhere" for any other (a cross-account statement
// under Fn::If, a condition, another principal).
function sourceIdentityTrust(template: CfnTemplate): Record<string, string[]> {
  return Object.fromEntries(
    typesOf(template, 'AWS::IAM::Role').map(role => [
      role,
      trustStatements(template, role)
        .filter(statement => JSON.stringify(statement).includes('sts:SetSourceIdentity'))
        .map(statement =>
          isObject(statement) &&
          statement.Effect === 'Allow' &&
          statement.Condition === undefined &&
          isDeepStrictEqual(statement.Principal, SAME_ACCOUNT)
            ? 'the account'
            : 'elsewhere',
        ),
    ]),
  )
}

// IAC-24 (k): `cdk bootstrap --template` sends the template as YAML in the request's body, and above
// 50 KiB (51,200 characters) asks the account for a toolkit bucket to upload it to, which a bootstrap
// never has, so it fails with a message blaming the CLI (aws-cdk's makeBodyParameter). The template is
// rendered here by aws-cdk-lib's own CloudFormation YAML writer, with the CLI's settings (the YAML 1.1
// schema, no line folding), which renders this template to the length the CLI's does; 1 KiB of the
// limit is kept spare for any difference between the two writers. Every model action the lists gain
// costs about 200 characters, once in each of the five roles' deny.
const TEMPLATE_BODY_LIMIT = 50 * 1024
const WRITER_MARGIN = 1024
const resolveFrom = createRequire(import.meta.url)
const cfnYaml = resolveFrom(
  join(dirname(resolveFrom.resolve('aws-cdk-lib/package.json')), 'core/lib/private/yaml-cfn.js'),
) as {
  serialize: (value: unknown) => string
}
const bodyLength = (template: CfnTemplate): number => cfnYaml.serialize(template).length

// IAC-24 (e): each role's model denies in place, as "role: count Sid", where one with Sid
// HearthNoModels and modelDenyActions() in order is the only answer that passes.
function roleDenies(template: CfnTemplate): Record<string, string[]> {
  const statements = policyStatements(template)
  return Object.fromEntries(
    typesOf(template, 'AWS::IAM::Role').map(role => [
      role,
      statements
        .filter(s => s.logicalId === role && isModelDenyInPlace(s))
        .map(
          s => `${s.sid ?? '(no Sid)'} ${isDeepStrictEqual(s.actions, modelDenyActions()) ? 'in order' : 'reordered'}`,
        ),
    ]),
  )
}

// IAC-24 (i): the template check's own copy (a test never imports a test, and templates.test.ts holds
// the landing zone's): any Lambda, custom resource, SAM resource, macro or nested stack; a transform
// at the top or at any depth; an import at any depth; and every export, by output name.
function forbiddenInBootstrap(template: CfnTemplate): string[] {
  const found: string[] = []
  for (const [logicalId, resource] of Object.entries(resources(template))) {
    const type = String(resource.Type)
    if (
      type.startsWith('AWS::Lambda::') ||
      type.startsWith('Custom::') ||
      type.startsWith('AWS::Serverless::') ||
      type === 'AWS::CloudFormation::CustomResource' ||
      type === 'AWS::CloudFormation::Macro' ||
      type === 'AWS::CloudFormation::Stack'
    ) {
      found.push(`${logicalId}: ${type}`)
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
  walk(template, '')
  const outputs = isObject(template.Outputs) ? template.Outputs : {}
  for (const [name, output] of Object.entries(outputs)) {
    if (isObject(output) && output.Export !== undefined) found.push(`export: ${name}`)
  }
  return found
}

// The stock template's one export: the file assets key's ARN, which the CLI's older deploys read.
const FILE_ASSET_KEY_EXPORT = { 'Fn::Sub': `CdkBootstrap-\${Qualifier}-FileAssetKeyArn` }

// IAC-01's allowances for the bootstrap template: the example permissions boundary's Allow of
// everything, only while it is made on request alone and the request is off by default (a boundary
// grants nothing anyway); and the managed policies the CLI attaches, each to a role carrying the deny.
const BOOTSTRAP_ALLOWANCE: ModelCheckAllowance = {
  grants: [
    {
      logicalId: 'CdkBoostrapPermissionsBoundaryPolicy',
      sid: 'ExplicitAllowAll',
      when: template => {
        const parameters = isObject(template.Parameters) ? template.Parameters : {}
        const use = parameters.UseExamplePermissionsBoundary
        return (
          resources(template).CdkBoostrapPermissionsBoundaryPolicy?.Condition === 'ShouldCreatePermissionsBoundary' &&
          isObject(use) &&
          use.Default === 'false'
        )
      },
    },
  ],
  attachments: [
    { logicalId: 'LookupRole', policy: 'ReadOnlyAccess' },
    { logicalId: 'DeploymentActionRole', policy: 'AWSCloudFormationReadOnlyAccess' },
    { logicalId: 'CloudFormationExecutionRole', policy: 'parameter:CloudFormationExecutionPolicies' },
    { logicalId: 'CloudFormationExecutionRole', policy: 'AdministratorAccess' },
  ],
}

let stock: CfnTemplate
let committedText: string
let committed: CfnTemplate
const scratch = mkdtempSync(join(tmpdir(), 'hearth-bootstrap-test-'))

beforeAll(() => {
  stock = readCloudFormationFile(STOCK_TEMPLATE)
  committedText = readFileSync(COMMITTED_TEMPLATE, 'utf8')
  // A committed file that isn't JSON fails (a) by name; the other cases then read an empty template.
  try {
    committed = parseCommitted(committedText)
  } catch {
    committed = {}
  }
}, 60_000)

afterAll(() => rmSync(scratch, { recursive: true, force: true }))

// A planted YAML file, written to this run's scratch folder.
function plantedYaml(name: string, text: string): string {
  const path = join(scratch, name)
  writeFileSync(path, text)
  return path
}

describe('IAC-24 (C11-D75): the bootstrap template is the CLI’s own, with the model deny on every role', () => {
  it('(a) the committed file is strict JSON, and a YAML short tag in it fails to parse', () => {
    expect(() => parseCommitted(committedText)).not.toThrow()
    expect(isObject(committed.Resources)).toBe(true)
    const planted = committedText.replace('"Value": "32"', `"Value": !Sub '\${AWS::AccountId}'`)
    expect(planted).not.toBe(committedText)
    expect(() => parseCommitted(planted)).toThrow()
  })

  it('(b) the CLI’s template reads with no YAML warning, holding the five known roles and no user, group or instance profile', () => {
    expect(typesOf(stock, 'AWS::IAM::Role').sort()).toEqual([...BOOTSTRAP_ROLES].sort())
    for (const type of ['AWS::IAM::User', 'AWS::IAM::Group', 'AWS::IAM::InstanceProfile']) {
      expect(typesOf(stock, type), type).toEqual([])
    }
    // A tag CloudFormation doesn't have would read as a plain value; the reader throws instead.
    const unknown = plantedYaml(
      'unknown-tag.yaml',
      [
        'Resources:',
        '  P:',
        '    Type: AWS::SSM::Parameter',
        '    Properties:',
        '      Type: String',
        '      Value: !Length [1]',
        '',
      ].join('\n'),
    )
    expect(() => readCloudFormationFile(unknown)).toThrow(/YAML/)
    // A known short tag reads as its intrinsic.
    const known = plantedYaml(
      'short-tag.yaml',
      [
        'Resources:',
        '  P:',
        '    Type: AWS::SSM::Parameter',
        '    Properties:',
        '      Type: String',
        "      Value: !Ref 'AWS::Region'",
        '',
      ].join('\n'),
    )
    expect(propertiesOf(readCloudFormationFile(known), 'P').Value).toEqual({ Ref: 'AWS::Region' })
  })

  it('(c) the committed bytes are exactly what the generator writes from the CLI’s template', () => {
    expect(committedText, REGENERATE).toBe(render(withModelDeny(stock)))
    // A committed copy missing one role's deny differs.
    const missing = structuredClone(committed)
    propertiesOf(missing, 'LookupRole').Policies = (propertiesOf(missing, 'LookupRole').Policies as unknown[]).slice(
      0,
      -1,
    )
    expect(render(missing)).not.toBe(render(withModelDeny(stock)))
  })

  it('(d) it differs from the CLI’s template by the five denies, the two roles’ trust and the variant’s default alone', () => {
    const byPath = (list: Difference[]) => [...list].sort((a, b) => a.path.localeCompare(b.path))
    expect(byPath(differences(stock, committed))).toEqual(byPath(expectedDifferences(stock)))
    const missing = structuredClone(committed)
    const policies = propertiesOf(missing, 'DeploymentActionRole').Policies as unknown[]
    propertiesOf(missing, 'DeploymentActionRole').Policies = policies.slice(0, -1)
    expect(byPath(differences(stock, missing))).not.toEqual(byPath(expectedDifferences(stock)))
    // So does a trust widened anywhere else: the lookup role's same-account statement.
    const lookup = structuredClone(committed)
    const statement = trustStatements(lookup, 'LookupRole').find(s => isDeepStrictEqual(s, STOCK_TAG_SESSION))
    expect(statement).toBeDefined()
    ;(statement as Record<string, unknown>).Action = ['sts:TagSession', 'sts:SetSourceIdentity']
    expect(byPath(differences(stock, lookup))).not.toEqual(byPath(expectedDifferences(stock)))
  })

  it('(e) every role holds exactly one model deny in place, Sid HearthNoModels, every model action in order', () => {
    const expected = Object.fromEntries(BOOTSTRAP_ROLES.map(role => [role, ['HearthNoModels in order']]))
    expect(roleDenies(committed)).toEqual(expected)
    const missing = structuredClone(committed)
    propertiesOf(missing, 'ImagePublishingRole').Policies = []
    expect(roleDenies(missing).ImagePublishingRole).toEqual([])
    // A deny under Fn::If is conditional, so it isn't in place.
    const conditional = structuredClone(committed)
    propertiesOf(conditional, 'FilePublishingRole').Policies = {
      'Fn::If': ['HasTrustedAccounts', [NO_MODELS], { Ref: 'AWS::NoValue' }],
    }
    expect(roleDenies(conditional).FilePublishingRole).toEqual([])
  })

  it('(f) its version is the bootstrap parameter’s and at least what every landing-zone stack requires, under the hearthbase qualifier', () => {
    const outputs = committed.Outputs as Record<string, { Value: unknown }>
    const version = Number(outputs.BootstrapVersion?.Value)
    expect(Number.isInteger(version)).toBe(true)
    expect(version).toBe(Number(propertiesOf(committed, 'CdkBootstrapVersion').Value))
    const { synthesised } = synthLandingZone()
    expect(synthesised.stacks.length).toBe(4)
    const required = synthesised.stacks.map(stack => stack.artifact.requiresBootstrapStackVersion ?? 0)
    expect(version).toBeGreaterThanOrEqual(Math.max(...required))
    for (const stack of synthesised.stacks) {
      expect(stack.artifact.bootstrapStackVersionSsmParameter, stack.stackName).toBe(
        '/cdk-bootstrap/hearthbase/version',
      )
      expect(stack.artifact.assumeRoleArn, stack.stackName).toContain('cdk-hearthbase-deploy-role-')
      const parameters = stack.template.Parameters as Record<string, { Default?: unknown }> | undefined
      expect(parameters?.BootstrapVersion?.Default, stack.stackName).toBe('/cdk-bootstrap/hearthbase/version')
    }
  }, 60_000)

  // The example permissions boundary's Allow of everything is left out: a boundary grants nothing, it
  // only narrows, and (h) holds it to being made on request alone.
  it('(g) the stock S3 delete grants and lifecycle rules stay where they were, and nowhere else', () => {
    const deleting = policyStatements(committed)
      .filter(s => s.effect === 'Allow' && s.logicalId !== 'CdkBoostrapPermissionsBoundaryPolicy')
      .filter(s => s.actions.some(action => globsOverlap(action.toLowerCase(), 's3:delete*')))
      .map(s => `${s.logicalId} ${s.sid ?? '(no Sid)'}`)
    expect(deleting.sort()).toEqual([
      'DeploymentActionRole PipelineCrossAccountArtifactsBucket',
      'FilePublishingRoleDefaultPolicy (no Sid)',
    ])
    const withLifecycle = Object.keys(resources(committed)).filter(
      id => propertiesOf(committed, id).LifecycleConfiguration !== undefined,
    )
    expect(withLifecycle).toEqual(['StagingBucket'])
    const rules = (propertiesOf(committed, 'StagingBucket').LifecycleConfiguration as { Rules: { Id: string }[] }).Rules
    expect(rules.map(rule => rule.Id)).toEqual(['CleanupOldVersions', 'AbortIncompleteMultipartUploads'])
  })

  it('(h) IAC-01: every policy reads, no Allow names a model action, every other grant and attachment sits on a role carrying the deny', () => {
    expect(modelCheck(committed, BOOTSTRAP_ALLOWANCE)).toEqual([])
    const attached = managedPolicyAttachments(committed)
      .filter(a => a.where !== 'PermissionsBoundary')
      .map(a => `${a.logicalId} ${attachedPolicyName(a.policy) ?? 'unreadable'}`)
    expect(attached.sort()).toEqual(BOOTSTRAP_ALLOWANCE.attachments.map(a => `${a.logicalId} ${a.policy}`).sort())
    // The stock template, without the deny, fails on every attachment and grant the deny covers.
    expect(modelCheck(stock, BOOTSTRAP_ALLOWANCE).length).toBeGreaterThan(0)
    // The example boundary's Allow of everything passes only while it is made on request, off by
    // default.
    const onByDefault = structuredClone(committed)
    ;(onByDefault.Parameters as Record<string, Record<string, unknown>>).UseExamplePermissionsBoundary = {
      ...(committed.Parameters as Record<string, Record<string, unknown>>).UseExamplePermissionsBoundary,
      Default: 'true',
    }
    expect(modelCheck(onByDefault, BOOTSTRAP_ALLOWANCE)).toEqual([
      'CdkBoostrapPermissionsBoundaryPolicy PolicyDocument ExplicitAllowAll: * can grant a model action, and managed:CdkBoostrapPermissionsBoundaryPolicy has no model deny in place',
    ])
  })

  it('(i) no Lambda, custom resource, transform or import, and the file assets key’s ARN its one export, proved on a planted template first', () => {
    const planted: CfnTemplate = {
      Transform: 'AWS::Serverless-2016-10-31',
      Resources: {
        F: { Type: 'AWS::Lambda::Function', Properties: {} },
        C: { Type: 'Custom::Other', Properties: {} },
        R: { Type: 'AWS::CloudFormation::CustomResource', Properties: {} },
        S: { Type: 'AWS::Serverless::Function', Properties: {} },
        M: { Type: 'AWS::CloudFormation::Macro', Properties: {} },
        N: { Type: 'AWS::CloudFormation::Stack', Properties: {} },
        P: {
          Type: 'AWS::SSM::Parameter',
          Properties: { Value: { 'Fn::Transform': { Name: 'AWS::Include' } }, Name: { 'Fn::ImportValue': 'x' } },
        },
      },
      Outputs: { O: { Value: 'x', Export: { Name: 'x' } } },
    }
    expect(forbiddenInBootstrap(planted)).toEqual([
      'F: AWS::Lambda::Function',
      'C: Custom::Other',
      'R: AWS::CloudFormation::CustomResource',
      'S: AWS::Serverless::Function',
      'M: AWS::CloudFormation::Macro',
      'N: AWS::CloudFormation::Stack',
      'a top-level Transform',
      '.Resources.P.Properties.Value: Fn::Transform',
      '.Resources.P.Properties.Name: Fn::ImportValue',
      'export: O',
    ])
    expect(forbiddenInBootstrap(committed)).toEqual(['export: FileAssetKeyArn'])
    const outputs = committed.Outputs as Record<string, { Export?: { Name?: unknown } }>
    expect(outputs.FileAssetKeyArn?.Export?.Name).toEqual(FILE_ASSET_KEY_EXPORT)
  })

  it('(j) the deploy and file-publishing roles’ same-account trust allows sts:SetSourceIdentity, which a break-glass session’s chain into them needs, and no other statement names it', () => {
    const expected = {
      CloudFormationExecutionRole: [],
      DeploymentActionRole: ['the account'],
      FilePublishingRole: ['the account'],
      ImagePublishingRole: [],
      LookupRole: [],
    }
    expect(sourceIdentityTrust(committed)).toEqual(expected)
    // The stock template names it nowhere, so a chained deploy under lz:pr- would be refused.
    expect(sourceIdentityTrust(stock)).not.toEqual(expected)
    // A cross-account statement naming it is found as one.
    const crossAccount = structuredClone(committed)
    const conditional = trustStatements(crossAccount, 'DeploymentActionRole').find(
      s => isObject(s) && JSON.stringify(s).includes('TrustedAccounts') && JSON.stringify(s).includes('sts:TagSession'),
    ) as { 'Fn::If': [string, Record<string, unknown>, unknown] } | undefined
    expect(conditional).toBeDefined()
    if (conditional !== undefined) conditional['Fn::If'][1].Action = ['sts:TagSession', 'sts:SetSourceIdentity']
    expect(sourceIdentityTrust(crossAccount).DeploymentActionRole).toEqual(['the account', 'elsewhere'])
  })

  it('(k) it fits the request body `cdk bootstrap` sends, with 1 KiB of the limit to spare, proved on a planted template first', () => {
    // The writer has the CLI's settings: no folding of a long line, and YAML 1.1's booleans quoted.
    expect(cfnYaml.serialize({ a: `${'word '.repeat(40)}end` })).toBe(`a: ${'word '.repeat(40)}end\n`)
    expect(cfnYaml.serialize({ a: 'on' })).not.toBe('a: on\n')
    const ceiling = TEMPLATE_BODY_LIMIT - WRITER_MARGIN
    const spare = (template: CfnTemplate) =>
      `${ceiling - bodyLength(template)} characters to spare under ${ceiling}: past ${TEMPLATE_BODY_LIMIT}, \`cdk bootstrap --template\` fails with BootstrapStackRequired`
    // Forty more actions in every role's deny pass it.
    const planted = structuredClone(committed)
    for (const role of BOOTSTRAP_ROLES) {
      const policies = propertiesOf(planted, role).Policies as Array<typeof NO_MODELS>
      const deny = policies.find(policy => policy.PolicyName === NO_MODELS.PolicyName)?.PolicyDocument.Statement[0]
      deny?.Action.push(...Array.from({ length: 40 }, (_, i) => `planted:PlantedActionNumber${i}`))
    }
    expect(bodyLength(planted)).toBeGreaterThan(ceiling)
    expect(bodyLength(committed), spare(committed)).toBeLessThanOrEqual(ceiling)
    // And what the generator makes from the CLI's template now, should it differ from the committed file.
    const generated = withModelDeny(stock)
    expect(bodyLength(generated), spare(generated)).toBeLessThanOrEqual(ceiling)
  })
})

describe('IAC-24 (C11-D75): the generator refuses a CLI template it wasn’t written for, naming what changed', () => {
  const plant = (change: (template: CfnTemplate) => void): CfnTemplate => {
    const template = structuredClone(stock)
    change(template)
    return template
  }

  it('passes the CLI’s own template', () => {
    expect(() => withModelDeny(stock)).not.toThrow()
    // And leaves its input as it was.
    expect(differences(readCloudFormationFile(STOCK_TEMPLATE), stock)).toEqual([])
  })

  it('refuses a sixth role, Policies given as Fn::If, an existing hearth-no-models, a user, another managed policy, a version mismatch and a trust it wasn’t written for', () => {
    const cases: Array<[string, CfnTemplate, RegExp]> = [
      [
        'a sixth role',
        plant(t => {
          resources(t).ExtraRole = { Type: 'AWS::IAM::Role', Properties: { AssumeRolePolicyDocument: {} } }
        }),
        /the roles are .*ExtraRole/,
      ],
      [
        'Policies as Fn::If',
        plant(t => {
          const properties = propertiesOf(t, 'LookupRole')
          properties.Policies = { 'Fn::If': ['HasTrustedAccounts', properties.Policies, { Ref: 'AWS::NoValue' }] }
        }),
        /LookupRole's Policies isn't a plain list/,
      ],
      [
        'an existing hearth-no-models',
        plant(t => {
          propertiesOf(t, 'DeploymentActionRole').Policies = [
            ...(propertiesOf(t, 'DeploymentActionRole').Policies as unknown[]),
            { PolicyName: 'hearth-no-models', PolicyDocument: {} },
          ]
        }),
        /DeploymentActionRole already has a policy named hearth-no-models/,
      ],
      [
        'a user',
        plant(t => {
          resources(t).Someone = { Type: 'AWS::IAM::User', Properties: {} }
        }),
        /Someone is an AWS::IAM::User/,
      ],
      [
        'another managed policy',
        plant(t => {
          resources(t).Wide = { Type: 'AWS::IAM::ManagedPolicy', Properties: {} }
        }),
        /Wide is a managed policy other than CdkBoostrapPermissionsBoundaryPolicy/,
      ],
      [
        'a version mismatch',
        plant(t => {
          propertiesOf(t, 'CdkBootstrapVersion').Value = '999'
        }),
        /BootstrapVersion output isn't the CdkBootstrapVersion parameter's value/,
      ],
      [
        'a deploy role with no same-account TagSession statement',
        plant(t => {
          const trust = propertiesOf(t, 'DeploymentActionRole').AssumeRolePolicyDocument as { Statement: unknown[] }
          trust.Statement = trust.Statement.filter(s => !isDeepStrictEqual(s, STOCK_TAG_SESSION))
        }),
        /DeploymentActionRole's trust doesn't hold exactly one same-account sts:TagSession statement/,
      ],
      [
        'a file-publishing role whose same-account TagSession statement has a condition',
        plant(t => {
          const statement = trustStatements(t, 'FilePublishingRole').find(s => isDeepStrictEqual(s, STOCK_TAG_SESSION))
          if (isObject(statement)) statement.Condition = { Bool: { 'aws:SecureTransport': 'true' } }
        }),
        /FilePublishingRole's trust doesn't hold exactly one same-account sts:TagSession statement/,
      ],
      [
        'a deploy role whose trust already names sts:SetSourceIdentity',
        plant(t => {
          trustStatements(t, 'DeploymentActionRole').push({
            Action: 'sts:SetSourceIdentity',
            Effect: 'Allow',
            Principal: SAME_ACCOUNT,
          })
        }),
        /DeploymentActionRole's trust doesn't hold exactly one/,
      ],
    ]
    for (const [name, template, message] of cases) {
      expect(() => withModelDeny(template), name).toThrow(message)
      expect(() => withModelDeny(template), name).toThrow(/read the change before regenerating/)
    }
  })

  it('reads every top-level key a CLI template holds, and refuses one the stock template never held, naming it', () => {
    // A transform, mappings, rules and metadata, which the synth keeps and the stock template lacks.
    const extra = readCloudFormationFile(
      plantedYaml(
        'extra-keys.yaml',
        [
          'Transform: AWS::LanguageExtensions',
          'Metadata:',
          '  X: y',
          'Mappings:',
          '  M:',
          '    a:',
          '      b: c',
          'Rules:',
          '  R:',
          '    Assertions:',
          '      - Assert: !Equals [a, a]',
          'Resources:',
          '  P:',
          '    Type: AWS::SSM::Parameter',
          '    Properties:',
          '      Type: String',
          '      Value: !FindInMap [M, a, b]',
          '',
        ].join('\n'),
      ),
    )
    expect(Object.keys(extra).sort()).toEqual(['Mappings', 'Metadata', 'Resources', 'Rules', 'Transform'])
    for (const key of ['Transform', 'Metadata', 'Mappings', 'Rules']) {
      expect(() => withModelDeny(extra), key).toThrow(new RegExp(`top-level key ${key} `))
    }
    const transformed = plant(t => {
      t.Transform = 'AWS::LanguageExtensions'
    })
    expect(() => withModelDeny(transformed)).toThrow(/top-level key Transform /)
    expect(() => withModelDeny(transformed)).toThrow(/read the change before regenerating/)
  })
})
