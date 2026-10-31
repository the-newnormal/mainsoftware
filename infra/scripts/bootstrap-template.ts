// The CDK bootstrap template Hearth deploys in every account, for both qualifiers (C11-D26, C11-D75;
// TECH-SPEC T24 item 11): the pinned CLI's own template with one change that matters, an inline
// hearth-no-models policy denying every model action (models.ts) on each of its five roles, so the
// roles cdk deploy assumes can never call a model, whatever the managed policies they're given
// allow. The only other change is BootstrapVariant's default, so a stock `cdk bootstrap` refuses to
// replace a Hearth toolkit stack without --force.
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
import * as cdk from 'aws-cdk-lib'
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include'
import { modelDenyActions } from '../src/config/models.ts'
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

export const NO_MODELS_POLICY = 'hearth-no-models'
export const NO_MODELS_SID = 'HearthNoModels'
export const VARIANT = 'Hearth: AWS CDK default resources with no model actions on any role (C11-D75)'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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

// The CLI's template with the deny on every role and the variant's default changed. It refuses, naming
// what changed, anything it wasn't written for, so a CLI upgrade that moves the template is read by a
// person before it is deployed.
export function withModelDeny(cli: CfnTemplate): CfnTemplate {
  const template = structuredClone(cli)
  const resources = isObject(template.Resources) ? template.Resources : {}
  const problems: string[] = []
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
