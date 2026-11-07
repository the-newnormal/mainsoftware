// Both entries load and run under plain Node 24, as cdk.json and a person run them, by type stripping
// (C11-D23): Vitest compiles TypeScript itself, so only a real `node` proves Node can strip every
// file they load and resolve aws-cdk-lib's CommonJS. Each run gets cdk.json's context, as the CLI
// passes it (CDK_CONTEXT_JSON), so it builds what the CLI builds, CloudFormation Validate included,
// and writes its assembly to a temporary folder.
// - The workload entry builds its twelve stacks from CI's fake release (HEARTH_FAKE_RELEASE=1, as
//   synth:ci runs it; C11-D62) and prints nothing; its assembly, nested stages included, publishes
//   templates and the VPC's one handler zip alone (IAC-22) and holds no run of 12 digits outside a
//   digest or a hash (IG-01, C11-D24). It refuses every run it can't build with one line naming the
//   key, never its value: no release, a malformed one, the marker beside one or set to anything but 1,
//   another drill or restoreActive, and a real release while the domains are placeholders (C11-Q08).
// - The landing-zone entry builds its four over the fixture, which is also what CI's synth:lz
//   builds. A person's run builds one target (checkRun), and the entry refuses every real one while
//   the committed domains are placeholders (C11-Q08), so each target is also built alone in-process,
//   from the fixture's values read as a person's configuration, and must synthesise, CloudFormation
//   Validate included, what the four-target build holds.
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

// The stacks an assembly lists, by their CloudFormation names, sorted: its own and, through each
// stage's nested assembly, its stages'.
function stacksIn(outdir: string): string[] {
  const manifest = JSON.parse(readFileSync(join(outdir, 'manifest.json'), 'utf8')) as {
    artifacts?: Record<string, { type: string; properties?: { stackName?: string; directoryName?: string } }>
  }
  return Object.entries(manifest.artifacts ?? {})
    .flatMap(([id, artifact]) => {
      if (artifact.type === 'aws:cloudformation:stack') return [artifact.properties?.stackName ?? id]
      const nested = artifact.properties?.directoryName
      if (artifact.type === 'cdk:cloud-assembly' && nested !== undefined) return stacksIn(join(outdir, nested))
      return []
    })
    .sort()
}

// Every file under a folder, as paths relative to it.
function filesIn(root: string, folder = ''): string[] {
  return readdirSync(join(root, folder), { withFileTypes: true }).flatMap(entry => {
    const path = folder === '' ? entry.name : `${folder}/${entry.name}`
    return entry.isDirectory() ? filesIn(root, path) : [path]
  })
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
    const ran = await run('bin/workload.ts', { HEARTH_FAKE_RELEASE: '1' })
    expect(ran.stderr).toBe('')
    expect(ran.code).toBe(0)
    expect(stacksIn(ran.outdir)).toEqual(WORKLOAD_STACK_NAMES)
    const manifests = assetManifestsIn(ran.outdir)
    expect(manifests.size).toBe(12)
    expect(assetProblems(manifests, 'workload')).toEqual([])
    const files = filesIn(ran.outdir)
    expect(files.length).toBeGreaterThan(manifests.size)
    expect(files.filter(path => digitRunsOutsideHashes(readFileSync(join(ran.outdir, path), 'utf8')) > 0)).toEqual([])
  }, 60_000)

  it('bin/workload.ts refuses, with one line naming the key and never its value, a run with no release, the marker beside one or set to 2, a malformed release, another drill or restoreActive, and a real release on the placeholder domains (C11-D51, C11-D59, C11-D62, C11-Q08)', async () => {
    const context = (values: Record<string, unknown>) => ({
      CDK_CONTEXT_JSON: JSON.stringify({ ...cdkContext(), ...values }),
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
