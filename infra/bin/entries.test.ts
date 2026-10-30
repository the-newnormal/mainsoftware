// Both entries load and run under plain Node 24, as cdk.json and a person run them, by type stripping
// (C11-D23): Vitest compiles TypeScript itself, so only a real `node` proves Node can strip every
// file they load and resolve aws-cdk-lib's CommonJS. With no stacks yet the CLI would refuse to
// synthesise them (C11-D62), so each writes its empty assembly to a temporary folder instead.
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANDING_ZONE_TARGETS } from '../src/config/env.ts'

const INFRA = new URL('..', import.meta.url).pathname

interface Ran {
  code: number
  stderr: string
  outdir: string
}

// Runs an entry with only the variables given (and PATH), never the caller's own HEARTH_* or AWS_*.
function run(entry: string, environ: Record<string, string> = {}): Promise<Ran> {
  const outdir = mkdtempSync(join(tmpdir(), 'hearth-entry-'))
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [entry],
      { cwd: INFRA, env: { PATH: process.env.PATH ?? '', CDK_OUTDIR: outdir, ...environ }, timeout: 60_000 },
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

describe('C11-D23: the entries run under plain Node', () => {
  it('bin/workload.ts loads and writes an assembly with no stack yet (PR 3 adds them)', async () => {
    const ran = await run('bin/workload.ts')
    expect(ran.stderr).toBe('')
    expect(ran.code).toBe(0)
    expect(existsSync(join(ran.outdir, 'manifest.json'))).toBe(true)
    expect(stacksIn(ran.outdir)).toEqual([])
  }, 60_000)

  it('bin/landing-zone.ts builds every target over the fixture, and refuses a real target for it or a run with no configuration', async () => {
    const [fixture, realTarget, none] = await Promise.all([
      run('bin/landing-zone.ts', { HEARTH_FIXTURE: '1' }),
      run('bin/landing-zone.ts', { HEARTH_FIXTURE: '1', HEARTH_TARGET: 'prod-baseline' }),
      run('bin/landing-zone.ts'),
    ])
    expect(fixture.code).toBe(0)
    expect(fixture.stderr.trim()).toBe(`landing zone: the fixture, targets ${LANDING_ZONE_TARGETS.join(', ')}`)
    expect(stacksIn(fixture.outdir)).toEqual([])
    expect(realTarget.code).toBe(1)
    expect(realTarget.stderr).toContain("HEARTH_TARGET: prod-baseline is a real deploy, and the fixture's accounts")
    expect(existsSync(join(realTarget.outdir, 'manifest.json'))).toBe(false)
    expect(none.code).toBe(1)
    expect(none.stderr).toContain('HEARTH_TARGET: is not set')
  }, 60_000)
})
