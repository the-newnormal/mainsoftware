// Both entries load and run under plain Node 24, as cdk.json and a person run them, by type stripping
// (C11-D23): Vitest compiles TypeScript itself, so only a real `node` proves Node can strip every
// file they load and resolve aws-cdk-lib's CommonJS. Each run gets cdk.json's context, as the CLI
// passes it (CDK_CONTEXT_JSON), so it builds what the CLI builds, CloudFormation Validate included,
// and writes its assembly to a temporary folder. The workload entry has no stack until C0.11 PR 3, so
// the CLI would refuse to synthesise it (C11-D62); the landing-zone entry builds its four over the
// fixture, which is also what CI's synth:lz builds. A person's run builds one target (checkRun), and
// the entry refuses every real one while the committed domains are placeholders (C11-Q08), so each
// target is also built alone in-process, from the fixture's values read as a person's configuration,
// and must synthesise, CloudFormation Validate included, what the four-target build holds.
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkRun, LANDING_ZONE_TARGETS, type LandingZoneTarget, parseLandingZoneEnv } from '../src/config/env.ts'
import { addLandingZone } from '../src/foundation/landing-zone.ts'
import { configEnvironment, fixtureConfig } from '../src/testing/fixture.ts'
import { synthLandingZone } from '../src/testing/landing-zone.ts'
import { cdkContext, synthesise, templateOf, testApp } from '../src/testing/synth.ts'

const INFRA = fileURLToPath(new URL('..', import.meta.url))

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
          CDK_CONTEXT_JSON: JSON.stringify(cdkContext()),
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

// The stacks an assembly's manifest lists.
function stacksIn(outdir: string): string[] {
  const manifest = JSON.parse(readFileSync(join(outdir, 'manifest.json'), 'utf8')) as {
    artifacts?: Record<string, { type: string }>
  }
  return Object.entries(manifest.artifacts ?? {})
    .filter(([, artifact]) => artifact.type === 'aws:cloudformation:stack')
    .map(([id]) => id)
}

// IAC-22 (C11-D76), this file's own copy: what an assembly's asset manifests would make the CLI run or
// build. The landing zone publishes its templates alone: no Docker image, and every file asset a
// template, copied as it is, with no command to run for it.
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

// Every asset manifest an assembly holds, by file name.
function assetManifestsIn(outdir: string): Map<string, unknown> {
  return new Map(
    readdirSync(outdir)
      .filter(name => name.endsWith('.assets.json'))
      .map(name => [name, JSON.parse(readFileSync(join(outdir, name), 'utf8')) as unknown]),
  )
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

  it('bin/workload.ts loads and writes an assembly with no stack yet (PR 3 adds them)', async () => {
    const ran = await run('bin/workload.ts')
    expect(ran.stderr).toBe('')
    expect(ran.code).toBe(0)
    expect(existsSync(join(ran.outdir, 'manifest.json'))).toBe(true)
    expect(stacksIn(ran.outdir)).toEqual([])
  }, 60_000)

  it('bin/landing-zone.ts builds every target over the fixture, Validate-clean, with templates for its only assets (IAC-22), and refuses a real target for it or a run with no configuration', async () => {
    const [fixture, realTarget, none] = await Promise.all([
      run('bin/landing-zone.ts', { HEARTH_FIXTURE: '1' }),
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
})

// The stack each target builds.
const STACK_OF: Record<LandingZoneTarget, string> = {
  foundation: 'Hearth-Foundation',
  'log-archive': 'Hearth-LogArchive',
  'nonprod-baseline': 'Hearth-nonprod-Baseline',
  'prod-baseline': 'Hearth-prod-Baseline',
}

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
