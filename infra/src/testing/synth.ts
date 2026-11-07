// Synthesis for the assertion tests (C11-D70): an App with cdk.json's context, so an in-process
// synth builds what the CLI builds, written to a fresh temporary folder, and what it wrote read back:
// every stack's template (nested stages included) and every asset manifest, which IAC-22 reads for an
// `executable` source or a Docker image (C11-D76). No AWS credential is needed or read: the
// workload stacks are account-agnostic and the landing-zone stacks take the fixture's made-up ids.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as cdk from 'aws-cdk-lib'

// cdk.json's context: the feature flags the CLI passes to the app.
export function cdkContext(): Record<string, unknown> {
  const json: unknown = JSON.parse(readFileSync(new URL('../../cdk.json', import.meta.url), 'utf8'))
  const context = (json as { context?: unknown }).context
  if (typeof context !== 'object' || context === null) throw new Error('infra/cdk.json has no context')
  return context as Record<string, unknown>
}

// An App as the CLI would make it, plus any context a test adds (a drill's, restoreActive), writing
// to its own temporary folder. Version reporting is off, as cdk.json's versionReporting sets it.
export function testApp(context: Record<string, unknown> = {}): cdk.App {
  return new cdk.App({
    outdir: mkdtempSync(join(tmpdir(), 'hearth-cdk-')),
    context: { ...cdkContext(), ...context },
    analyticsReporting: false,
  })
}

// What the cloud assembly says of one stack beyond its template, which a person's deploy acts on: the
// account and Region it goes to, whether termination protection is on, the role the CLI assumes to
// deploy it, and the bootstrap version and SSM parameter it checks (IAC-24 reads the last two).
export interface StackArtifactFacts {
  account: string
  region: string
  terminationProtection: boolean
  assumeRoleArn?: string
  requiresBootstrapStackVersion?: number
  bootstrapStackVersionSsmParameter?: string
}

// One synthesised stack: its path in the assembly (Stage/Stack), its CloudFormation name, its
// template as JSON, and its artifact's facts.
export interface SynthesisedStack {
  id: string
  stackName: string
  template: Record<string, unknown>
  artifact: StackArtifactFacts
}

export interface Synthesised {
  outdir: string
  stacks: readonly SynthesisedStack[]
  // Every *.assets.json under the assembly, by its path relative to outdir.
  assetManifests: ReadonlyMap<string, unknown>
}

// Every file under a folder whose name ends with the suffix, as paths relative to it.
function filesEndingWith(root: string, suffix: string, prefix = ''): string[] {
  return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) return filesEndingWith(root, suffix, path)
    return entry.name.endsWith(suffix) ? [path] : []
  })
}

export function synthesise(app: cdk.App): Synthesised {
  const assembly = app.synth()
  const stacks = assembly.stacksRecursively.map(stack => ({
    id: stack.hierarchicalId,
    stackName: stack.stackName,
    template: stack.template as Record<string, unknown>,
    artifact: {
      account: stack.environment.account,
      region: stack.environment.region,
      // The artifact leaves it out when it is off.
      terminationProtection: stack.terminationProtection ?? false,
      assumeRoleArn: stack.assumeRoleArn,
      requiresBootstrapStackVersion: stack.requiresBootstrapStackVersion,
      bootstrapStackVersionSsmParameter: stack.bootstrapStackVersionSsmParameter,
    },
  }))
  const assetManifests = new Map(
    filesEndingWith(assembly.directory, '.assets.json').map(path => [
      path,
      JSON.parse(readFileSync(join(assembly.directory, path), 'utf8')) as unknown,
    ]),
  )
  return { outdir: assembly.directory, stacks, assetManifests }
}

// One stack's template by name, or a clear failure naming the ones there are.
export function templateOf(synthesised: Synthesised, stackName: string): Record<string, unknown> {
  const found = synthesised.stacks.find(stack => stack.stackName === stackName)
  if (found === undefined) {
    throw new Error(`no stack ${stackName}; synthesised: ${synthesised.stacks.map(s => s.stackName).join(', ')}`)
  }
  return found.template
}

// A template's resources, by logical id.
export function resourcesOf(template: Record<string, unknown>): Record<string, { Type: string; Properties?: unknown }> {
  const resources = template.Resources
  return typeof resources === 'object' && resources !== null
    ? (resources as Record<string, { Type: string; Properties?: unknown }>)
    : {}
}
