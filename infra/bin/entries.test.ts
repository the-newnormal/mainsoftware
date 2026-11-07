// Both entries load and run under plain Node 24, as cdk.json and a person run them, by type stripping
// (C11-D23): Vitest compiles TypeScript itself, so only a real `node` proves Node can strip every
// file they load and resolve aws-cdk-lib's CommonJS. Each run gets cdk.json's context, read here
// rather than through a test helper, as the CLI passes it (CDK_CONTEXT_JSON), so it builds the CLI's
// stacks and templates, CloudFormation Validate included, and writes its assembly to a temporary
// folder. The CLI adds settings of its own to that context, and of those only its path and asset
// metadata change what it writes: aws:cdk:path in each resource's Metadata, and aws:asset:path and
// aws:asset:property in the VPC handler's, which deploy nothing and which no assertion reads, and so
// each template's hash where the manifests name it.
// - The workload entry builds its twelve stacks from CI's fake release (HEARTH_FAKE_RELEASE=1, as
//   synth:ci runs it; C11-D62) and prints nothing; its assembly, nested stages included, publishes
//   templates and the VPC's one handler zip alone (IAC-22). It refuses every run it can't build with
//   one line naming the key, never its value: no release, a malformed one, the marker beside one or
//   set to anything but 1, another drill or restoreActive, and a real release while the domains are
//   placeholders (C11-Q08).
// - No assembly it writes here, nested stages included, holds a run of 12 digits outside a digest or a
//   hash (IG-01, C11-D24): CI's fake release, restoreActive's and the drill's alike, since a value the
//   source joins from parts passes IG-01 and can still name an account in the one run that builds it.
// - What it writes, read from its assembly here, equals what the workload assertions read from
//   src/testing/workload.ts for the same run: the committed build (synthWorkload() with no options)
//   and the two run variants they read, restoreActive and the drill. That is every template, every
//   stack's artifact facts in the manifest (its place in the assembly, account, Region, termination
//   protection, deploy role and bootstrap version and parameter: termination protection is in no
//   template), every asset manifest, and every other file of the assembly, its validation report and
//   construct tree (tree.json) included, both as the helper wrote them and as the app it hands back
//   writes them when synthesised again here. The construct tree records every construct's path and
//   type and each resource's own properties before any override, which is what cdk-nag reads
//   (IAC-15), so an app the helper changed after synthesis, or one it didn't synthesise, fails here
//   (an override written in the source the entry builds is the entry's own, outside this binding);
//   and the stages it hands beside that app must be the app's own. Only the stack traces CDK records,
//   which name the code that made a construct or an acknowledgement (the entry or the helper), are
//   left out. So neither that helper nor src/testing/synth.ts, which are off the owner's-read list,
//   can hand those assertions a profile, a run, a context, a construct tree or a stack's facts the
//   entry doesn't build without failing this owner's-read file. A profile variant a test asks for by
//   name is the test's own, in its own file.
// - The landing-zone entry builds its four over the fixture, which is also what CI's synth:lz
//   builds, and its assembly equals the committed build the landing-zone assertions read
//   (synthLandingZone() with no options) in the same ways, the templates it hands them by stack and
//   the app and stacks cdk-nag reads included, for the same reason. A person's run builds one target
//   (checkRun), and the entry refuses every real one while the committed domains are placeholders
//   (C11-Q08), so each target is also built alone in-process, from the fixture's values read as a
//   person's configuration, and must synthesise, CloudFormation Validate included, what the
//   four-target build holds.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import * as cdk from 'aws-cdk-lib'
import * as sns from 'aws-cdk-lib/aws-sns'
import { ConstructOrder } from 'constructs'
import { describe, expect, it } from 'vitest'
import { checkRun, LANDING_ZONE_TARGETS, type LandingZoneTarget, parseLandingZoneEnv } from '../src/config/env.ts'
import { REGION } from '../src/config/profiles.ts'
import { addLandingZone, type LandingZoneStacks } from '../src/foundation/landing-zone.ts'
import { configEnvironment, fixtureConfig } from '../src/testing/fixture.ts'
import { type LandingZoneSynth, synthLandingZone } from '../src/testing/landing-zone.ts'
import { type Synthesised, synthesise, templateOf, testApp } from '../src/testing/synth.ts'
import { synthWorkload, type WorkloadSynthOptions } from '../src/testing/workload.ts'
import type { WorkloadStage } from '../src/workload/stage.ts'

const INFRA = fileURLToPath(new URL('..', import.meta.url))

// cdk.json's context, the feature flags the CLI passes to an entry, read by this file itself.
function cdkJsonContext(): Record<string, unknown> {
  const json = JSON.parse(readFileSync(join(INFRA, 'cdk.json'), 'utf8')) as { context?: unknown }
  if (typeof json.context !== 'object' || json.context === null) throw new Error('infra/cdk.json has no context')
  return json.context as Record<string, unknown>
}

interface Ran {
  code: number
  stderr: string
  outdir: string
}

// Runs an entry with only the variables given (and PATH, the output folder and cdk.json's context),
// never the caller's own HEARTH_* or AWS_*.
function run(entry: string, environ: Record<string, string> = {}): Promise<Ran> {
  const outdir = mkdtempSync(join(tmpdir(), 'hearth-entry-'))
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [entry],
      {
        cwd: INFRA,
        env: {
          PATH: process.env.PATH ?? '',
          CDK_OUTDIR: outdir,
          CDK_CONTEXT_JSON: JSON.stringify(cdkJsonContext()),
          ...environ,
        },
        timeout: 60_000,
      },
      (error, _stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1
        resolve({ code, stderr, outdir })
      },
    )
  })
}

// What an assembly's manifest says of a stack beyond its template, read here as the CLI reads it, and
// what the owner's-read assertions read of it from src/testing/synth.ts: its place in the assembly
// (its display name, Stage/Stack, the CLI's hierarchical id), the account and Region it goes to,
// whether termination protection is on (absent is off), the role the CLI assumes to deploy it, and
// the bootstrap version and SSM parameter it checks. Termination protection is in no template, so
// comparing templates alone would let a helper report it otherwise.
interface StackFacts {
  id: string
  account: string
  region: string
  terminationProtection: boolean
  assumeRoleArn: string | undefined
  requiresBootstrapStackVersion: number | undefined
  bootstrapStackVersionSsmParameter: string | undefined
}

// One artifact of an assembly's manifest, as much of it as this file reads.
interface ArtifactManifest {
  type: string
  environment?: string
  displayName?: string
  properties?: {
    stackName?: string
    templateFile?: string
    directoryName?: string
    terminationProtection?: boolean
    assumeRoleArn?: string
    requiresBootstrapStackVersion?: number
    bootstrapStackVersionSsmParameter?: string
  }
}

// The stacks an assembly lists, its own and, through each stage's nested assembly, its stages': each
// one's CloudFormation name, the path of the template file it names, and its facts.
function stackFilesIn(outdir: string): Array<{ stackName: string; templatePath: string; facts: StackFacts }> {
  const manifest = JSON.parse(readFileSync(join(outdir, 'manifest.json'), 'utf8')) as {
    artifacts?: Record<string, ArtifactManifest>
  }
  return Object.entries(manifest.artifacts ?? {}).flatMap(([id, artifact]) => {
    const properties = artifact.properties ?? {}
    if (artifact.type === 'aws:cloudformation:stack') {
      const templatePath = join(outdir, properties.templateFile ?? `${id}.template.json`)
      const [, account, region] = /^aws:\/\/([^/]+)\/([^/]+)$/.exec(artifact.environment ?? '') ?? []
      if (account === undefined || region === undefined) throw new Error(`${id} names no aws://account/region`)
      const facts: StackFacts = {
        id: artifact.displayName ?? id,
        account,
        region,
        terminationProtection: properties.terminationProtection ?? false,
        assumeRoleArn: properties.assumeRoleArn,
        requiresBootstrapStackVersion: properties.requiresBootstrapStackVersion,
        bootstrapStackVersionSsmParameter: properties.bootstrapStackVersionSsmParameter,
      }
      return [{ stackName: properties.stackName ?? id, templatePath, facts }]
    }
    const nested = properties.directoryName
    if (artifact.type === 'cdk:cloud-assembly' && nested !== undefined) return stackFilesIn(join(outdir, nested))
    return []
  })
}

// Each stack's facts as the assembly's manifest holds them, read here, by its CloudFormation name.
function stackFactsIn(outdir: string): Map<string, StackFacts> {
  return new Map(stackFilesIn(outdir).map(stack => [stack.stackName, stack.facts]))
}

// Each stack's facts as a helper reports them to the assertions, by its CloudFormation name: its id
// beside every artifact fact it reports, so a fact the helper reports and this file doesn't read
// shows as a difference too.
function reportedFacts(synthesised: Synthesised): Map<string, unknown> {
  return new Map(synthesised.stacks.map(stack => [stack.stackName, { id: stack.id, ...stack.artifact }]))
}

// Where what this file reads from an entry's assembly and what a helper reports differ, by name (a
// stack's, or an asset manifest's path): each top-level key whose value isn't the same, `missing` for
// a name only one side holds, and nothing when they agree.
function reportDifferences(read: ReadonlyMap<string, unknown>, reported: ReadonlyMap<string, unknown>): string[] {
  const found: string[] = []
  for (const name of [...new Set([...read.keys(), ...reported.keys()])].sort()) {
    const [left, right] = [read.get(name), reported.get(name)]
    if (left === undefined || right === undefined) {
      found.push(`${name}: missing`)
      continue
    }
    const keys = new Set([...Object.keys(entriesOf(left)), ...Object.keys(entriesOf(right))])
    for (const key of [...keys].sort()) {
      if (!isDeepStrictEqual(entriesOf(left)[key], entriesOf(right)[key])) found.push(`${name}: ${key}`)
    }
  }
  return found
}

// The stacks an assembly lists, by their CloudFormation names, sorted.
function stacksIn(outdir: string): string[] {
  return stackFilesIn(outdir)
    .map(stack => stack.stackName)
    .sort()
}

// Each stack's template as the assembly's file holds it, read here, by its CloudFormation name.
function templatesIn(outdir: string): Map<string, unknown> {
  return new Map(
    stackFilesIn(outdir).map(stack => [stack.stackName, JSON.parse(readFileSync(stack.templatePath, 'utf8'))]),
  )
}

// A JSON value as an object's entries, or none for anything else.
function entriesOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

// Where two builds' templates differ, by stack name: each top-level section, or each entry of an
// object-valued one (`Resources.<logical id>`), whose JSON isn't the same, `missing` for a stack only
// one build holds, and nothing for two equal builds, so a failure names where to look rather than
// printing twelve templates.
function templateDifferences(
  rendered: ReadonlyMap<string, unknown>,
  read: Readonly<Record<string, unknown>>,
): Record<string, string[]> {
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
  const keysOf = (left: unknown, right: unknown) => [
    ...new Set([...Object.keys(entriesOf(left)), ...Object.keys(entriesOf(right))]),
  ]
  const found: Record<string, string[]> = {}
  for (const name of new Set([...rendered.keys(), ...Object.keys(read)])) {
    const left = rendered.get(name)
    const right = read[name]
    if (left === undefined || right === undefined) {
      found[name] = ['missing']
      continue
    }
    const differing = keysOf(left, right).flatMap(section => {
      const [l, r] = [entriesOf(left)[section], entriesOf(right)[section]]
      if (same(l, r)) return []
      const children = keysOf(l, r).filter(key => !same(entriesOf(l)[key], entriesOf(r)[key]))
      return children.length > 0 ? children.map(key => `${section}.${key}`) : [section]
    })
    if (differing.length > 0) found[name] = differing
  }
  return found
}

// Every file under a folder, as paths relative to it.
function filesIn(root: string, folder = ''): string[] {
  return readdirSync(join(root, folder), { withFileTypes: true }).flatMap(entry => {
    const path = folder === '' ? entry.name : `${folder}/${entry.name}`
    return entry.isDirectory() ? filesIn(root, path) : [path]
  })
}

// The keys whose values are stack traces, which name the code that made a construct, a metadata entry
// or an acknowledgement (the entry, or the helper that called the same code), so they differ between
// the two by design: a metadata entry's `trace`, and the validation report's `stackTraces` and
// `acknowledgedStackTrace`.
const STACK_TRACE_KEYS = new Set(['trace', 'stackTraces', 'acknowledgedStackTrace'])

// A JSON value with every stack trace left out, at any depth.
function withoutStackTraces(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutStackTraces)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !STACK_TRACE_KEYS.has(key))
      .map(([key, inner]) => [key, withoutStackTraces(inner)]),
  )
}

// One file of an assembly as this file compares it: a JSON file parsed, any other as its bytes. A
// stack's metadata file (`*.metadata.json`, each construct's entries) without its stack traces, its
// `aws:cdk:creationStack` entries included, and each distinct entry once, since synthesising again
// adds a stack's `aws:cdk:templateFile` entry again; the validation report without its stack traces.
function comparableFile(path: string, bytes: Buffer): unknown {
  if (!path.endsWith('.json')) return bytes.toString('base64')
  const json = JSON.parse(bytes.toString('utf8')) as unknown
  if (path.endsWith('.metadata.json')) {
    return Object.fromEntries(
      Object.entries(json as Record<string, unknown[]>).map(([construct, entries]) => {
        const kept = entries
          .filter(entry => (entry as { type?: unknown }).type !== 'aws:cdk:creationStack')
          .map(withoutStackTraces)
        return [
          construct,
          kept.filter((entry, index) => kept.findIndex(other => isDeepStrictEqual(entry, other)) === index),
        ]
      }),
    )
  }
  return path.endsWith('validation-report.json') ? withoutStackTraces(json) : json
}

// Every file of an assembly, nested stages' included, by its path relative to it, as compared.
function assemblyIn(outdir: string): Map<string, unknown> {
  return new Map(
    filesIn(outdir)
      .sort()
      .map(path => [path, comparableFile(path, readFileSync(join(outdir, path)))]),
  )
}

// Where two assemblies differ, file by file: each path whose content isn't the same, or `missing` for
// one only one side holds, and nothing when they agree.
function fileDifferences(read: ReadonlyMap<string, unknown>, other: ReadonlyMap<string, unknown>): string[] {
  return [...new Set([...read.keys(), ...other.keys()])].sort().flatMap(path => {
    if (!read.has(path) || !other.has(path)) return [`${path}: missing`]
    return isDeepStrictEqual(read.get(path), other.get(path)) ? [] : [`${path}: differs`]
  })
}

// Synthesises an app again as it stands now, into the folder it synthesised to before, and returns that
// folder: every nested stage first, innermost first and forced, since an app's synthesis reuses a
// stage's earlier assembly, then the app itself, whose tree.json records every construct, each
// resource's own properties included.
function synthesisedAgain(app: cdk.App): string {
  for (const construct of app.node.findAll(ConstructOrder.POSTORDER)) {
    if (construct !== app && cdk.Stage.isStage(construct)) construct.synth({ force: true })
  }
  return app.synth({ force: true }).directory
}

// The environments whose stages a run builds, from its stacks' names (Hearth-<env>-<Part>).
const environmentsOf = (stackNames: readonly string[]) => [...new Set(stackNames.map(name => name.split('-')[1]))]

// Where the stages a workload helper hands beside its app aren't that app's own: a set of environments
// other than the run's, a stage the app doesn't hold under its environment's name, or one of a stage's
// four stacks the stage doesn't hold under its id.
function stageProblems(
  app: cdk.App,
  stages: Readonly<Partial<Record<string, WorkloadStage>>>,
  environments: readonly (string | undefined)[],
): string[] {
  const found: string[] = []
  const handed = Object.keys(stages).sort()
  if (!isDeepStrictEqual(handed, [...environments].sort())) found.push(`stages: ${handed.join(', ')}`)
  for (const [environment, stage] of Object.entries(stages)) {
    if (stage === undefined || app.node.tryFindChild(environment) !== stage) {
      found.push(`${environment}: not the app's`)
      continue
    }
    const stacks = { Platform: stage.platform, Data: stage.data, Tasks: stage.tasks, Services: stage.services }
    for (const [id, stack] of Object.entries(stacks)) {
      if (stage.node.tryFindChild(id) !== stack) found.push(`${environment}/${id}: not the stage's`)
    }
  }
  return found
}

// The landing-zone helper's names for its four stacks, in its templates and its stacks, and each
// one's CloudFormation name.
const LANDING_ZONE_STACK_NAMES: Record<keyof LandingZoneSynth['templates'] & keyof LandingZoneStacks, string> = {
  foundation: 'Hearth-Foundation',
  logArchive: 'Hearth-LogArchive',
  nonprodBaseline: 'Hearth-nonprod-Baseline',
  prodBaseline: 'Hearth-prod-Baseline',
}

// Where the stacks the landing-zone helper hands beside its app aren't that app's own: a set of names
// other than the four, or a stack that isn't the app's child of that CloudFormation name.
function landingZoneStackProblems(app: cdk.App, stacks: LandingZoneStacks): string[] {
  const found: string[] = []
  const handed = Object.keys(stacks).sort()
  if (!isDeepStrictEqual(handed, Object.keys(LANDING_ZONE_STACK_NAMES).sort()))
    found.push(`stacks: ${handed.join(', ')}`)
  for (const [key, name] of Object.entries(LANDING_ZONE_STACK_NAMES)) {
    const stack = stacks[key as keyof LandingZoneStacks]
    if (stack === undefined || stack.node.scope !== app || stack.stackName !== name)
      found.push(`${key}: not the app's ${name}`)
  }
  return found
}

// The one packaged asset the workload may publish (TECH-SPEC T24 item 28): the VPC's
// default-security-group handler's code, which aws-cdk-lib adds to each Platform stack, as a zip it
// makes in-process with no command. It is admitted by its display name and packaging, never its hash,
// which changes with aws-cdk-lib.
const HANDLER_CODE = 'Custom::VpcRestrictDefaultSGCustomResourceProvider Code'
// A Platform stack's asset manifest, as a stage's nested assembly names it (`nonprodPlatform<hash>`).
const PLATFORM_MANIFEST = /(?:^|\/)[a-z]+Platform[0-9A-F]{8}\.assets\.json$/

// IAC-22 (C11-D76), this file's own copy: what an assembly's asset manifests would make the CLI run or
// build. The landing zone publishes its templates alone: no Docker image, and every file asset a
// template, copied as it is, with no command to run for it. The workload publishes the same, and in
// each Platform manifest exactly one handler zip besides, with no command either.
function assetProblems(
  manifests: ReadonlyMap<string, unknown>,
  allow: 'templates' | 'workload' = 'templates',
): string[] {
  const found: string[] = []
  for (const [path, manifest] of manifests) {
    const { files, dockerImages } = manifest as {
      files?: Record<string, unknown>
      dockerImages?: Record<string, unknown>
    }
    if (dockerImages !== undefined && Object.keys(dockerImages).length > 0) found.push(`${path}: a Docker image`)
    const platform = allow === 'workload' && PLATFORM_MANIFEST.test(path)
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

// Every asset manifest an assembly holds, nested stages' included, by its path relative to it.
function assetManifestsIn(outdir: string): Map<string, unknown> {
  return new Map(
    filesIn(outdir)
      .filter(path => path.endsWith('.assets.json'))
      .map(path => [path, JSON.parse(readFileSync(join(outdir, path), 'utf8')) as unknown]),
  )
}

// The runs of 12 or more digits a text holds outside a `sha256:` digest and a maximal run of exactly 64
// lower-case hex (an asset's or a template's hash, which can hold such a run by chance), the two spans
// IG-01 lets through: anything else could be an account id (C11-D24). Each span is blanked, not cut,
// so the digits either side of one never join.
function digitRunsOutsideHashes(text: string): number {
  const masked = text
    .replace(/sha256:[0-9a-f]{64}(?![0-9a-f])/g, ' ')
    .replace(/(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/g, ' ')
  return masked.match(/\d{12,}/g)?.length ?? 0
}

// The files of an assembly, nested stages' included, that hold such a run, by their paths relative to it.
function filesWithDigitRuns(outdir: string): string[] {
  return filesIn(outdir).filter(path => digitRunsOutsideHashes(readFileSync(join(outdir, path), 'utf8')) > 0)
}

// The workload's twelve stacks (C11-D27), as an assembly lists them.
const WORKLOAD_STACK_NAMES = [
  'Hearth-nonprod-Data',
  'Hearth-nonprod-Platform',
  'Hearth-nonprod-Services',
  'Hearth-nonprod-Tasks',
  'Hearth-prod-Data',
  'Hearth-prod-Platform',
  'Hearth-prod-Services',
  'Hearth-prod-Tasks',
  'Hearth-restore-Data',
  'Hearth-restore-Platform',
  'Hearth-restore-Services',
  'Hearth-restore-Tasks',
]

// The runs the workload assertions read, each as the entry is asked for it (the context beside CI's
// fake release) and as they ask synthWorkload() for it, with the stacks it builds: the committed run,
// which takes no options, and the two variants they read, the restore stage active and the drill.
const WORKLOAD_RUNS: Array<
  [string, Record<string, string> | undefined, WorkloadSynthOptions | undefined, readonly string[]]
> = [
  ["CI's fake release (synthWorkload() with no options)", undefined, undefined, WORKLOAD_STACK_NAMES],
  ['restoreActive', { restoreActive: 'true' }, { run: { restoreActive: true } }, WORKLOAD_STACK_NAMES],
  [
    'the drill',
    { drill: 'break:nonprod' },
    { run: { drill: true } },
    WORKLOAD_STACK_NAMES.filter(name => name.startsWith('Hearth-nonprod-')),
  ],
]

// The stack each target builds.
const STACK_OF: Record<LandingZoneTarget, string> = {
  foundation: 'Hearth-Foundation',
  'log-archive': 'Hearth-LogArchive',
  'nonprod-baseline': 'Hearth-nonprod-Baseline',
  'prod-baseline': 'Hearth-prod-Baseline',
}

// Each entry's successful run, made once and shared by the cases that read its assembly.
let fakeWorkload: Promise<Ran> | undefined
function fakeWorkloadRun(): Promise<Ran> {
  fakeWorkload ??= run('bin/workload.ts', { HEARTH_FAKE_RELEASE: '1' })
  return fakeWorkload
}
let fixtureLandingZone: Promise<Ran> | undefined
function fixtureLandingZoneRun(): Promise<Ran> {
  fixtureLandingZone ??= run('bin/landing-zone.ts', { HEARTH_FIXTURE: '1' })
  return fixtureLandingZone
}

describe('C11-D23: the entries run under plain Node', () => {
  it('IAC-22 finds an asset that runs a command, a Docker image, a packaged file and a file that is no template, on planted manifests', () => {
    const planted = new Map<string, unknown>([
      ['a.assets.json', { files: { x: { source: { executable: ['sh', '-c', 'x'], path: 'x.template.json' } } } }],
      ['b.assets.json', { dockerImages: { y: { source: { directory: '.' } } } }],
      ['c.assets.json', { files: { z: { source: { path: 'z.zip', packaging: 'zip' } } } }],
      ['d.assets.json', { files: { t: { source: { path: 'Stack.template.json', packaging: 'file' } } } }],
    ])
    expect(assetProblems(planted)).toEqual([
      'a.assets.json: x runs a command',
      'b.assets.json: a Docker image',
      'c.assets.json: z is packaged',
      "c.assets.json: z isn't a template",
    ])
  })

  it('IAC-22 C11-D76 admits in each workload Platform manifest exactly one handler zip that runs nothing, and finds a second one, none, one in a Services manifest and one with a command, on planted manifests', () => {
    const template = (name: string) => ({ source: { path: `${name}.template.json`, packaging: 'file' } })
    const handler = (env: string) => ({
      displayName: `${env}/Platform/${HANDLER_CODE}`,
      source: { path: '../asset.x', packaging: 'zip' },
    })
    const planted = new Map<string, unknown>([
      ['assembly-nonprod/nonprodPlatformABCDEF01.assets.json', { files: { h: handler('nonprod'), t: template('p') } }],
      [
        'assembly-prod/prodPlatformABCDEF02.assets.json',
        { files: { h: handler('prod'), h2: handler('prod'), t: template('p') } },
      ],
      ['assembly-restore/restorePlatformABCDEF03.assets.json', { files: { t: template('p') } }],
      ['assembly-nonprod/nonprodServicesABCDEF04.assets.json', { files: { h: handler('nonprod'), t: template('s') } }],
      [
        'assembly-restore/restorePlatformABCDEF05.assets.json',
        {
          files: {
            h: { ...handler('restore'), source: { ...handler('restore').source, executable: ['sh', '-c', 'x'] } },
            t: template('p'),
          },
        },
      ],
    ])
    expect(assetProblems(planted, 'workload')).toEqual([
      'assembly-prod/prodPlatformABCDEF02.assets.json: holds 2 handler zips, not one',
      'assembly-restore/restorePlatformABCDEF03.assets.json: holds 0 handler zips, not one',
      'assembly-nonprod/nonprodServicesABCDEF04.assets.json: h is packaged',
      "assembly-nonprod/nonprodServicesABCDEF04.assets.json: h isn't a template",
      'assembly-restore/restorePlatformABCDEF05.assets.json: h runs a command',
    ])
    // The landing zone admits no zip at all.
    expect(assetProblems(new Map([...planted].slice(0, 1)))).toEqual([
      'assembly-nonprod/nonprodPlatformABCDEF01.assets.json: h is packaged',
      "assembly-nonprod/nonprodPlatformABCDEF01.assets.json: h isn't a template",
    ])
  })

  it('IG-01 C11-D24 finds a 12-digit run beside a digest or a hash, and lets a digest or a 64-hex hash alone through, on planted text', () => {
    const account = ['1234', '5678', '9012'].join('')
    const digest = `sha256:${'0'.repeat(64)}`
    const hash = `${'1'.repeat(30)}${'ab'.repeat(17)}`
    expect(digitRunsOutsideHashes(`role ${account} ${digest}`)).toBe(1)
    expect(digitRunsOutsideHashes(`${account}${digest}`)).toBe(1)
    expect(digitRunsOutsideHashes(`${account}${hash}`)).toBe(1)
    expect(digitRunsOutsideHashes(`image@${digest}`)).toBe(0)
    expect(digitRunsOutsideHashes(`asset.${hash}.zip "${hash}"`)).toBe(0)
  })

  it('bin/workload.ts builds the twelve workload stacks from CI’s fake release, printing nothing, with templates and the one handler zip a Platform stack for its only assets (IAC-22), and no account id anywhere in its assembly (C11-D24, C11-D62)', async () => {
    const ran = await fakeWorkloadRun()
    expect(ran.stderr).toBe('')
    expect(ran.code).toBe(0)
    expect(stacksIn(ran.outdir)).toEqual(WORKLOAD_STACK_NAMES)
    const manifests = assetManifestsIn(ran.outdir)
    expect(manifests.size).toBe(12)
    expect(assetProblems(manifests, 'workload')).toEqual([])
    const files = filesIn(ran.outdir)
    expect(files.length).toBeGreaterThan(manifests.size)
    expect(filesWithDigitRuns(ran.outdir)).toEqual([])
  }, 60_000)

  it('the binding finds a stack whose termination protection, deploy role, bootstrap version, account, Region or place a helper reports otherwise, a fact it reports that this file does not read, a stack or a manifest only one side holds, and an asset manifest that differs, on a planted assembly (C11-D70, C11-D74)', () => {
    const outdir = mkdtempSync(join(tmpdir(), 'hearth-planted-'))
    mkdirSync(join(outdir, 'assembly-x'))
    const stack = (part: string, properties: Record<string, unknown>) => ({
      type: 'aws:cloudformation:stack',
      environment: 'aws://unknown-account/ap-southeast-1',
      displayName: `x/${part}`,
      properties: { templateFile: `x${part}.template.json`, stackName: `Hearth-x-${part}`, ...properties },
    })
    const deploy = {
      assumeRoleArn: 'deploy',
      requiresBootstrapStackVersion: 6,
      bootstrapStackVersionSsmParameter: '/v',
    }
    const assembly = { type: 'cdk:cloud-assembly', properties: { directoryName: 'assembly-x', displayName: 'x' } }
    writeFileSync(join(outdir, 'manifest.json'), JSON.stringify({ artifacts: { 'assembly-x': assembly } }))
    writeFileSync(
      join(outdir, 'assembly-x', 'manifest.json'),
      JSON.stringify({
        artifacts: {
          xData: stack('Data', { terminationProtection: true, ...deploy }),
          xTasks: stack('Tasks', deploy),
        },
      }),
    )
    const read = stackFactsIn(outdir)
    // Absent is off, as the CLI reads it.
    expect(read.get('Hearth-x-Tasks')?.terminationProtection).toBe(false)
    const artifact = { account: 'unknown-account', region: 'ap-southeast-1', ...deploy }
    const helper = (changes: Partial<Record<'Data' | 'Tasks', Record<string, unknown>>> = {}): Synthesised => ({
      outdir,
      stacks: (['Data', 'Tasks'] as const).map(part => ({
        id: `x/${part}`,
        stackName: `Hearth-x-${part}`,
        template: {},
        artifact: { ...artifact, terminationProtection: part === 'Data', ...changes[part] },
      })),
      assetManifests: new Map(),
    })
    expect(reportDifferences(read, reportedFacts(helper()))).toEqual([])
    expect(reportDifferences(read, reportedFacts(helper({ Data: { terminationProtection: false } })))).toEqual([
      'Hearth-x-Data: terminationProtection',
    ])
    expect(
      reportDifferences(
        read,
        reportedFacts(
          helper({
            Data: { assumeRoleArn: 'other', requiresBootstrapStackVersion: 30 },
            Tasks: { account: 'elsewhere', region: 'us-east-1', bootstrapStackVersionSsmParameter: '/w', more: 1 },
          }),
        ),
      ),
    ).toEqual([
      'Hearth-x-Data: assumeRoleArn',
      'Hearth-x-Data: requiresBootstrapStackVersion',
      'Hearth-x-Tasks: account',
      'Hearth-x-Tasks: bootstrapStackVersionSsmParameter',
      'Hearth-x-Tasks: more',
      'Hearth-x-Tasks: region',
    ])
    const moved = helper()
    expect(
      reportDifferences(read, reportedFacts({ ...moved, stacks: moved.stacks.map(s => ({ ...s, id: 'y' })) })),
    ).toEqual(['Hearth-x-Data: id', 'Hearth-x-Tasks: id'])
    expect(reportDifferences(read, reportedFacts({ ...moved, stacks: moved.stacks.slice(0, 1) }))).toEqual([
      'Hearth-x-Tasks: missing',
    ])
    const destination = (role: string) => ({ files: { t: { destinations: { d: { assumeRoleArn: role } } } } })
    expect(
      reportDifferences(
        new Map([['a.assets.json', destination('publish')]]),
        new Map([
          ['a.assets.json', destination('deploy')],
          ['b.assets.json', destination('publish')],
        ]),
      ),
    ).toEqual(['a.assets.json: files', 'b.assets.json: missing'])
  })

  it('the binding finds an app changed after synthesis, in a nested stage or at its top, by a template, the construct tree or a stack’s metadata, a property set back under an override that keeps the template included, and leaves out only the stack traces and the repeated template-file entry of synthesising again, on planted apps (C11-D70, C11-D74)', () => {
    // A fresh app each time, synthesised once, with a topic in a stage's stack and one in a stack of its
    // own, and the differences once a change is made and the app is synthesised again (a nested stack's
    // file named without the hash CDK adds to it). Synthesising again keeps a template's earlier
    // asset entry beside the new one, so each change is made to an app of its own.
    const plantedChange = (change: (topics: { nested: sns.CfnTopic; top: sns.CfnTopic }) => void): string[] => {
      const app = testApp()
      const topic = (stack: cdk.Stack, name: string) => new sns.CfnTopic(stack, 'Topic', { topicName: name })
      const stage = new cdk.Stage(app, 'x', { env: { region: REGION } })
      const nested = topic(new cdk.Stack(stage, 'Part', { stackName: 'Hearth-x-Part', env: { region: REGION } }), 'a')
      const top = topic(new cdk.Stack(app, 'Top', { stackName: 'Hearth-Top', env: { region: REGION } }), 'b')
      app.synth()
      const written = assemblyIn(app.outdir)
      change({ nested, top })
      return fileDifferences(written, assemblyIn(synthesisedAgain(app))).map(found =>
        found.replace(/[0-9A-F]{8}\./, '.'),
      )
    }
    expect(plantedChange(() => {})).toEqual([])
    // A property in a stage's stack: its template, and the template's hash in the stage's manifest and
    // asset manifest, and the construct tree.
    expect(
      plantedChange(({ nested }) => {
        nested.topicName = 'changed'
      }),
    ).toEqual([
      'assembly-x/manifest.json: differs',
      'assembly-x/xPart.assets.json: differs',
      'assembly-x/xPart.template.json: differs',
      'tree.json: differs',
    ])
    // The same property under an override that keeps the template as it was: only the construct tree,
    // whose properties are the ones cdk-nag reads, shows it.
    expect(
      plantedChange(({ nested }) => {
        nested.topicName = 'changed'
        nested.addPropertyOverride('TopicName', 'a')
      }),
    ).toEqual(['tree.json: differs'])
    expect(
      plantedChange(({ top }) => {
        top.topicName = 'changed'
      }),
    ).toEqual([
      'Top.assets.json: differs',
      'Top.template.json: differs',
      'manifest.json: differs',
      'tree.json: differs',
    ])
    expect(
      plantedChange(({ top }) => {
        top.node.addMetadata('hearth:planted', 'a planted entry')
      }),
    ).toEqual(['Top.metadata.json: differs'])
  })

  it.each(WORKLOAD_RUNS)(
    'bin/workload.ts writes for %s what the workload assertions read for it from synthWorkload(): each template, each stack’s artifact facts (its place, account, Region, termination protection, deploy role and bootstrap version), each asset manifest and every other file, the construct tree cdk-nag reads included, as the helper wrote them and as its app writes them again, with its stages the app’s own, so no test helper can hand them a profile, a run, a context, a construct tree or a stack’s facts the entry does not build (C11-D70, C11-D74), and no account id anywhere in that assembly (C11-D24)',
    async (_name, context, options, stackNames) => {
      const ran =
        context === undefined
          ? await fakeWorkloadRun()
          : await run('bin/workload.ts', {
              HEARTH_FAKE_RELEASE: '1',
              CDK_CONTEXT_JSON: JSON.stringify({ ...cdkJsonContext(), ...context }),
            })
      expect(ran.stderr).toBe('')
      expect(ran.code).toBe(0)
      // No account id in any file of this run's assembly, nested stages included (C11-D24): a value
      // only this run builds is in no other assembly a check reads.
      expect(filesWithDigitRuns(ran.outdir)).toEqual([])
      const rendered = templatesIn(ran.outdir)
      expect([...rendered.keys()].sort()).toEqual(stackNames)
      const { templates, synthesised, app, stages } = synthWorkload(options)
      expect(templateDifferences(rendered, templates)).toEqual({})
      expect(templates).toStrictEqual(Object.fromEntries(rendered))
      expect(reportDifferences(stackFactsIn(ran.outdir), reportedFacts(synthesised))).toEqual([])
      expect(reportDifferences(assetManifestsIn(ran.outdir), synthesised.assetManifests)).toEqual([])
      // Every file, as the helper wrote it, then as the app it hands the cdk-nag check writes it again
      // (IAC-15), whose stages are the app's own.
      const files = assemblyIn(ran.outdir)
      expect(synthesised.outdir).toBe(app.outdir)
      expect(fileDifferences(files, assemblyIn(synthesised.outdir))).toEqual([])
      expect(stageProblems(app, stages, environmentsOf(stackNames))).toEqual([])
      expect(fileDifferences(files, assemblyIn(synthesisedAgain(app)))).toEqual([])
    },
    120_000,
  )

  it('bin/workload.ts refuses, with one line naming the key and never its value, a run with no release, the marker beside one or set to 2, a malformed release, another drill or restoreActive, and a real release on the placeholder domains (C11-D51, C11-D59, C11-D62, C11-Q08)', async () => {
    const context = (values: Record<string, unknown>) => ({
      CDK_CONTEXT_JSON: JSON.stringify({ ...cdkJsonContext(), ...values }),
    })
    const fake = ['f'.repeat(40), `sha256:${'0'.repeat(64)}`].join(':')
    const real = ['a'.repeat(40), `sha256:${'a'.repeat(64)}`].join(':')
    const cases: Array<[Record<string, string>, string, string[]]> = [
      [{}, 'release is missing: pass -c release=<commit>:<digest>', []],
      [
        { HEARTH_FAKE_RELEASE: '1', ...context({ release: fake }) },
        'HEARTH_FAKE_RELEASE is set beside release',
        [fake],
      ],
      [{ HEARTH_FAKE_RELEASE: '2' }, 'HEARTH_FAKE_RELEASE is not 1', ['2']],
      [context({ release: 'not-a-release' }), 'release is malformed', ['not-a-release']],
      [{ HEARTH_FAKE_RELEASE: '1', ...context({ drill: 'break:prod' }) }, 'drill is not break:nonprod', ['break:prod']],
      [{ HEARTH_FAKE_RELEASE: '1', ...context({ restoreActive: 'yes' }) }, 'restoreActive is not true', ['yes']],
      [
        context({ release: real }),
        "DOMAINS still holds a placeholder: a real release waits for the owner's names (C11-Q08)",
        [real, 'a'.repeat(40)],
      ],
    ]
    const ran = await Promise.all(cases.map(([environ]) => run('bin/workload.ts', environ)))
    for (const [index, [, message, values]] of cases.entries()) {
      const result = ran[index]
      expect(result?.code).toBe(1)
      expect(result?.stderr).toBe(`workload: ${message}\n`)
      for (const value of values) expect(result?.stderr).not.toContain(value)
      expect(existsSync(join(result?.outdir ?? '', 'manifest.json'))).toBe(false)
    }
  }, 60_000)

  it('bin/landing-zone.ts builds every target over the fixture, Validate-clean, with templates for its only assets (IAC-22), and refuses a real target for it or a run with no configuration', async () => {
    const [fixture, realTarget, none] = await Promise.all([
      fixtureLandingZoneRun(),
      run('bin/landing-zone.ts', { HEARTH_FIXTURE: '1', HEARTH_TARGET: 'prod-baseline' }),
      run('bin/landing-zone.ts'),
    ])
    expect(fixture.code).toBe(0)
    // One line, exactly: a CloudFormation Validate finding or a deprecation would print here too.
    expect(fixture.stderr.trim()).toBe(`landing zone: the fixture, targets ${LANDING_ZONE_TARGETS.join(', ')}`)
    expect(stacksIn(fixture.outdir)).toEqual([
      'Hearth-Foundation',
      'Hearth-LogArchive',
      'Hearth-nonprod-Baseline',
      'Hearth-prod-Baseline',
    ])
    const manifests = assetManifestsIn(fixture.outdir)
    expect(manifests.size).toBe(4)
    expect(assetProblems(manifests)).toEqual([])
    expect(realTarget.code).toBe(1)
    expect(realTarget.stderr).toContain("HEARTH_TARGET: prod-baseline is a real deploy, and the fixture's accounts")
    expect(existsSync(join(realTarget.outdir, 'manifest.json'))).toBe(false)
    expect(none.code).toBe(1)
    expect(none.stderr).toContain('HEARTH_TARGET: is not set')
  }, 60_000)

  it('bin/landing-zone.ts writes over the fixture the committed build every landing-zone assertion reads (synthLandingZone() with no options): each template, by stack and as the helper hands them by name, each stack’s artifact facts, each asset manifest and every other file, the construct tree cdk-nag reads included, as the helper wrote them and as its app writes them again, with its stacks the app’s own, so no test helper can hand those assertions options, a context, a construct tree or a stack’s facts the entry does not build (C11-D70, C11-D74)', async () => {
    const ran = await fixtureLandingZoneRun()
    expect(ran.code).toBe(0)
    const rendered = templatesIn(ran.outdir)
    const { synthesised, templates: named, app, stacks } = synthLandingZone()
    const templates = Object.fromEntries(synthesised.stacks.map(stack => [stack.stackName, stack.template]))
    expect(Object.keys(templates).sort()).toEqual(Object.values(STACK_OF).sort())
    expect(templateDifferences(rendered, templates)).toEqual({})
    expect(templates).toStrictEqual(Object.fromEntries(rendered))
    // The templates the landing-zone assertions read by name (lz.templates.foundation and the rest).
    expect(Object.keys(named).sort()).toEqual(Object.keys(LANDING_ZONE_STACK_NAMES).sort())
    expect(
      templateDifferences(
        rendered,
        Object.fromEntries(
          Object.entries(named).map(([key, template]) => [
            LANDING_ZONE_STACK_NAMES[key as keyof typeof LANDING_ZONE_STACK_NAMES],
            template,
          ]),
        ),
      ),
    ).toEqual({})
    for (const [key, name] of Object.entries(LANDING_ZONE_STACK_NAMES)) {
      expect(named[key as keyof typeof named], key).toStrictEqual(rendered.get(name))
    }
    expect(reportDifferences(stackFactsIn(ran.outdir), reportedFacts(synthesised))).toEqual([])
    expect(reportDifferences(assetManifestsIn(ran.outdir), synthesised.assetManifests)).toEqual([])
    // Every file, as the helper wrote it, then as the app it hands the cdk-nag check writes it again
    // (IAC-15), whose stacks are the app's own.
    const files = assemblyIn(ran.outdir)
    expect(synthesised.outdir).toBe(app.outdir)
    expect(fileDifferences(files, assemblyIn(synthesised.outdir))).toEqual([])
    expect(landingZoneStackProblems(app, stacks)).toEqual([])
    expect(fileDifferences(files, assemblyIn(synthesisedAgain(app)))).toEqual([])
  }, 120_000)
})

describe("C11-D25: a person's run builds one target", () => {
  it.each(LANDING_ZONE_TARGETS)(
    '%s alone synthesises, Validate included, the template the four-target build holds (C11-D27)',
    target => {
      // The committed domains are still placeholders (C11-Q08), so checkRun is given none to refuse.
      const run = checkRun(parseLandingZoneEnv(configEnvironment(fixtureConfig())), target, {})
      expect(run.targets).toEqual([target])
      const app = testApp()
      addLandingZone(app, run)
      const synthesised = synthesise(app)
      expect(synthesised.stacks.map(stack => stack.stackName)).toEqual([STACK_OF[target]])
      expect(templateOf(synthesised, STACK_OF[target])).toEqual(
        templateOf(synthLandingZone().synthesised, STACK_OF[target]),
      )
    },
    60_000,
  )
})
