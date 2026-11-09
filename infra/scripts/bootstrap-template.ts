// The CDK bootstrap template Hearth deploys in every account, for both qualifiers (C11-D26, C11-D75;
// TECH-SPEC T24 item 11): the pinned CLI's own template with three changes that matter. Each of its
// five roles gets an inline hearth-no-models policy denying every model action (models.ts), so the
// roles cdk deploy assumes can never call a model, whatever the managed policies they're given
// allow. And the deploy and file-publishing roles' trust gains one statement, allowing
// sts:SetSourceIdentity to the account's hearth-break-glass role alone: a break-glass session always
// carries a source identity, which persists into every role it chains into, and STS refuses that
// chain unless the target's trust allows the action, so without it `cdk deploy` under an lz:pr-
// reason couldn't take the roles it needs (C11-D11, C11-D27). Bound to that role, whose own trust
// sets the identity to the person's sign-in name and which STS never lets a chain change, no other
// principal in the account can stamp a name of its choosing on these roles' sessions. And the deploy
// role reads the SSM parameters under /hearth/, which the workload stacks name by type (C11-D24):
// CloudFormation resolves a stack's AWS::SSM::Parameter::Value parameters at CreateChangeSet with the
// caller's credentials, the deploy role's, and the stock ReadVersion statement lets it read its own
// version parameter alone, so without this every workload change set would fail. One template serves
// both qualifiers, so hearthbase's deploy role gains the same read: the parameters there hold ids and
// names, never a secret, and that role already deploys the Baselines that write them. The only other
// change is BootstrapVariant's default, so a stock `cdk bootstrap` refuses to replace a Hearth toolkit
// stack without --force.
//
// It reads the CLI's YAML through aws-cdk-lib's CfnInclude, which turns CloudFormation's short tags
// into intrinsics, and throws on any YAML warning (an unknown tag would otherwise read as a plain
// value), then writes JSON text into infra/bootstrap/hearth-bootstrap.yaml: JSON is YAML, so
// `cdk bootstrap --template` reads it, and neither Biome nor the auto-push hook formats a .yaml file,
// so the bytes stay as written. IAC-24 (bootstrap-template.test.ts) fails while the committed file
// differs from what this writes, so a CDK upgrade whose template changed waits until a person runs
//   node infra/scripts/bootstrap-template.ts
// on its branch and reads the change, which is an owner's-read change (the output is under
// infra/bootstrap/). It needs no credentials, runs no CLI command and has no npm script (IG-07 refuses
// one named for bootstrap).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as cdk from 'aws-cdk-lib'
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include'
import { modelDenyActions } from '../src/config/models.ts'
import { iamVariable, ROLE } from '../src/config/names.ts'
import { REGION } from '../src/config/profiles.ts'

// A CloudFormation template as JSON.
export type CfnTemplate = Record<string, unknown>

// The CLI's template, by the subpath aws-cdk's package exports.
export const STOCK_TEMPLATE = createRequire(import.meta.url).resolve(
  'aws-cdk/lib/api/bootstrap/bootstrap-template.yaml',
)

// Where the generator writes, which IAC-24 compares.
export const COMMITTED_TEMPLATE = new URL('../bootstrap/hearth-bootstrap.yaml', import.meta.url)

// The stock template's own top-level keys, in its order. The reader keeps every key it reads, these
// first, so a CLI template that gains another (a Transform, Mappings, Rules, Metadata) reaches the
// generator, which refuses it, naming it.
const TOP_LEVEL_KEYS: readonly string[] = ['Description', 'Parameters', 'Conditions', 'Resources', 'Outputs']

// The stock template's own CloudFormation Validate findings, all on default parameter values that
// `cdk bootstrap` overrides. A bare App leaves them warnings, which change nothing in the template;
// acknowledging them keeps the generator's and the test's output quiet.
const STOCK_FINDINGS = [
  'CloudFormation-Validate::F3031',
  'CloudFormation-Validate::F3033',
  'CloudFormation-Validate::W1001',
  'CloudFormation-Validate::W2001',
  'CloudFormation-Validate::W3045',
] as const
const STOCK_REASON =
  "the stock CDK bootstrap template's default parameter values, which `cdk bootstrap` overrides (C11-D75)"

// The CLI's five roles, which the deny goes on; any other set means the CLI's template changed and a
// person reads it before the generator writes anything.
export const BOOTSTRAP_ROLES = [
  'FilePublishingRole',
  'ImagePublishingRole',
  'LookupRole',
  'DeploymentActionRole',
  'CloudFormationExecutionRole',
] as const

// The one managed policy the stock template may make (sic, the CLI's spelling): the example
// permissions boundary, created only when a person asks for it.
export const EXAMPLE_BOUNDARY = 'CdkBoostrapPermissionsBoundaryPolicy'

// The roles a break-glass session chains into under an lz:pr- reason (infra/src/baseline/break-glass.ts,
// its LandingZone statement), whose trust gains BREAK_GLASS_SOURCE_IDENTITY at its end. The generator
// was written for their stock trust, which holds one same-account sts:TagSession statement exactly
// as below and nothing naming sts:SetSourceIdentity; that statement stays as the CLI ships it, since
// widening it would let anyone in the account set any source identity. The lookup and
// image-publishing roles, which break-glass never takes, and every cross-account statement stay as
// they are.
export const SOURCE_IDENTITY_ROLES = ['FilePublishingRole', 'DeploymentActionRole'] as const
const STOCK_TAG_SESSION = { Action: 'sts:TagSession', Effect: 'Allow', Principal: { AWS: { Ref: 'AWS::AccountId' } } }
export const BREAK_GLASS_SOURCE_IDENTITY = {
  Sid: 'HearthBreakGlassSourceIdentity',
  Action: 'sts:SetSourceIdentity',
  Effect: 'Allow',
  Principal: { AWS: { Ref: 'AWS::AccountId' } },
  Condition: {
    ArnEquals: {
      'aws:PrincipalArn': {
        'Fn::Sub': `arn:${iamVariable('AWS::Partition')}:iam::${iamVariable('AWS::AccountId')}:role/${ROLE.breakGlass}`,
      },
    },
  },
} as const

// The deploy role's read of the parameters under /hearth/ (C11-D24), inserted straight after the stock
// ReadVersion statement in its inline policy, the one statement the generator adds to any role's grants.
// The generator was written for a deploy role holding exactly one ReadVersion and no statement of this
// Sid anywhere, and refuses any other.
export const DEPLOY_ROLE = 'DeploymentActionRole'
const READ_VERSION_SID = 'ReadVersion'
export const READ_PARAMETERS = {
  Sid: 'HearthReadParameters',
  Effect: 'Allow',
  Action: ['ssm:GetParameter', 'ssm:GetParameters'],
  Resource: {
    'Fn::Sub': `arn:${iamVariable('AWS::Partition')}:ssm:${iamVariable('AWS::Region')}:${iamVariable('AWS::AccountId')}:parameter/hearth/*`,
  },
} as const

export const NO_MODELS_POLICY = 'hearth-no-models'
export const NO_MODELS_SID = 'HearthNoModels'
export const VARIANT = 'Hearth: AWS CDK default resources with no model actions on any role (C11-D75)'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const propertiesOfResource = (resource: Record<string, unknown>): Record<string, unknown> =>
  isObject(resource.Properties) ? resource.Properties : {}

// Runs a function with any YAML warning thrown rather than printed: the YAML parser aws-cdk-lib
// bundles warns, and reads the value as plain text, on a tag it doesn't know.
function throwingYamlWarnings<T>(run: () => T): T {
  const emitWarning = process.emitWarning
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const name = warning instanceof Error ? warning.name : typeof rest[0] === 'string' ? rest[0] : undefined
    const type = isObject(rest[0]) ? rest[0].type : undefined
    if (name === 'YAMLWarning' || type === 'YAMLWarning') {
      throw new Error(`the template doesn't read cleanly as CloudFormation YAML: ${String(warning)}`)
    }
    return (emitWarning as (...args: unknown[]) => void).call(process, warning, ...rest)
  }) as typeof process.emitWarning
  try {
    return run()
  } finally {
    process.emitWarning = emitWarning
  }
}

// A CloudFormation template file, read as the CLI reads it (short tags as intrinsics), returned as
// JSON with every top-level key it holds, the stock template's own first in its order. The stack
// holding it only reads it and never deploys; its region is there for IG-05 and changes nothing in
// what is read.
export function readCloudFormationFile(path: string): CfnTemplate {
  const outdir = mkdtempSync(join(tmpdir(), 'hearth-bootstrap-'))
  try {
    return throwingYamlWarnings(() => {
      const app = new cdk.App({ outdir, analyticsReporting: false })
      const stack = new cdk.Stack(app, 'Stock', {
        synthesizer: new cdk.BootstraplessSynthesizer(),
        env: { region: REGION },
      })
      for (const id of STOCK_FINDINGS) cdk.Validations.of(stack).acknowledge({ id, reason: STOCK_REASON })
      new CfnInclude(stack, 'Template', { templateFile: path })
      const synthesised = app.synth().getStackByName(stack.stackName).template as CfnTemplate
      const template: CfnTemplate = {}
      for (const key of TOP_LEVEL_KEYS) if (synthesised[key] !== undefined) template[key] = synthesised[key]
      for (const [key, value] of Object.entries(synthesised)) if (!(key in template)) template[key] = value
      return template
    })
  } finally {
    rmSync(outdir, { recursive: true, force: true })
  }
}

// The deny each role gets: every model action, on everything, with no condition (IAC-01).
function noModelsPolicy(): Record<string, unknown> {
  return {
    PolicyName: NO_MODELS_POLICY,
    PolicyDocument: {
      Version: '2012-10-17',
      Statement: [{ Sid: NO_MODELS_SID, Effect: 'Deny', Action: modelDenyActions(), Resource: '*' }],
    },
  }
}

// The CLI's template with the deny on every role, the break-glass statement in the two roles' trust,
// the deploy role's parameter read and the variant's default changed. It refuses, naming
// what changed, anything it wasn't written for, so a CLI upgrade that moves the template is read by a
// person before it is deployed.
export function withModelDeny(cli: CfnTemplate): CfnTemplate {
  const template = structuredClone(cli)
  const resources = isObject(template.Resources) ? template.Resources : {}
  const problems: string[] = []
  if (JSON.stringify(template).includes(JSON.stringify(READ_PARAMETERS.Sid))) {
    problems.push(`the template already names ${READ_PARAMETERS.Sid}`)
  }
  for (const key of Object.keys(template)) {
    if (!TOP_LEVEL_KEYS.includes(key)) problems.push(`the top-level key ${key} isn't one the stock template held`)
  }
  const roles: string[] = []
  for (const [logicalId, resource] of Object.entries(resources)) {
    const type = isObject(resource) ? resource.Type : undefined
    if (type === 'AWS::IAM::Role') roles.push(logicalId)
    if (type === 'AWS::IAM::User' || type === 'AWS::IAM::Group' || type === 'AWS::IAM::InstanceProfile') {
      problems.push(`${logicalId} is an ${type}, which the stock template never held`)
    }
    if (type === 'AWS::IAM::ManagedPolicy' && logicalId !== EXAMPLE_BOUNDARY) {
      problems.push(`${logicalId} is a managed policy other than ${EXAMPLE_BOUNDARY}`)
    }
  }
  const expected = [...BOOTSTRAP_ROLES].sort()
  if (JSON.stringify([...roles].sort()) !== JSON.stringify(expected)) {
    problems.push(`the roles are ${[...roles].sort().join(', ')}, not ${expected.join(', ')}`)
  }
  for (const logicalId of roles) {
    const resource = resources[logicalId] as Record<string, unknown>
    const properties = isObject(resource.Properties) ? resource.Properties : {}
    resource.Properties = properties
    const policies = properties.Policies ?? []
    if (!Array.isArray(policies)) {
      problems.push(`${logicalId}'s Policies isn't a plain list, so the deny can't sit there unconditionally`)
      continue
    }
    if (policies.some(policy => isObject(policy) && policy.PolicyName === NO_MODELS_POLICY)) {
      problems.push(`${logicalId} already has a policy named ${NO_MODELS_POLICY}`)
      continue
    }
    properties.Policies = [...policies, noModelsPolicy()]
  }
  // The break-glass statement appended, only to a trust shaped as the stock template wrote it.
  for (const logicalId of SOURCE_IDENTITY_ROLES) {
    const resource = resources[logicalId]
    const properties = isObject(resource) && isObject(resource.Properties) ? resource.Properties : {}
    const trust = isObject(properties.AssumeRolePolicyDocument) ? properties.AssumeRolePolicyDocument : {}
    const statements = Array.isArray(trust.Statement) ? trust.Statement : []
    const matching = statements.filter(statement => isDeepStrictEqual(statement, STOCK_TAG_SESSION))
    const named = statements.filter(statement => JSON.stringify(statement).includes('sts:SetSourceIdentity'))
    if (matching.length !== 1 || named.length > 0) {
      problems.push(
        `${logicalId}'s trust doesn't hold exactly one same-account sts:TagSession statement as the stock template wrote it, and none naming sts:SetSourceIdentity`,
      )
      continue
    }
    statements.push(structuredClone(BREAK_GLASS_SOURCE_IDENTITY))
  }
  // The parameter read, straight after the stock ReadVersion statement of the deploy role's inline policy.
  const deployPolicies = isObject(resources[DEPLOY_ROLE]) ? propertiesOfResource(resources[DEPLOY_ROLE]).Policies : []
  const readVersions = (Array.isArray(deployPolicies) ? deployPolicies : []).flatMap(policy => {
    const document = isObject(policy) && isObject(policy.PolicyDocument) ? policy.PolicyDocument : {}
    const statements = Array.isArray(document.Statement) ? (document.Statement as unknown[]) : []
    return statements.flatMap((statement, index) =>
      isObject(statement) && statement.Sid === READ_VERSION_SID ? [{ statements, index }] : [],
    )
  })
  const [readVersion] = readVersions
  if (readVersions.length !== 1 || readVersion === undefined) {
    problems.push(
      `${DEPLOY_ROLE}'s inline policies hold ${readVersions.length} ${READ_VERSION_SID} statements, not one, so ${READ_PARAMETERS.Sid} has no place`,
    )
  } else {
    readVersion.statements.splice(readVersion.index + 1, 0, structuredClone(READ_PARAMETERS))
  }
  const outputs = isObject(template.Outputs) ? template.Outputs : {}
  const output = isObject(outputs.BootstrapVersion) ? outputs.BootstrapVersion.Value : undefined
  const version = resources.CdkBootstrapVersion
  const parameter =
    isObject(version) && isObject(version.Properties)
      ? (version.Properties as Record<string, unknown>).Value
      : undefined
  if (output === undefined || output !== parameter) {
    problems.push("the BootstrapVersion output isn't the CdkBootstrapVersion parameter's value")
  }
  const parameters = isObject(template.Parameters) ? template.Parameters : {}
  const variant = parameters.BootstrapVariant
  if (!isObject(variant)) problems.push('there is no BootstrapVariant parameter')
  else variant.Default = VARIANT
  if (problems.length > 0) {
    throw new Error(
      `The CDK CLI's bootstrap template isn't the one this generator was written for; read the change before regenerating: ${problems.join('; ')}`,
    )
  }
  return template
}

// The text written: JSON, two-space indented, one newline at the end.
export function render(template: CfnTemplate): string {
  return `${JSON.stringify(template, null, 2)}\n`
}

// The template as it should be committed.
export function hearthBootstrap(): string {
  return render(withModelDeny(readCloudFormationFile(STOCK_TEMPLATE)))
}

function main(): void {
  mkdirSync(new URL('.', COMMITTED_TEMPLATE), { recursive: true })
  writeFileSync(COMMITTED_TEMPLATE, hearthBootstrap())
  console.log('wrote infra/bootstrap/hearth-bootstrap.yaml')
}

if (import.meta.main) main()
