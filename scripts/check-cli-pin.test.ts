import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cliPinOf, cliPinProblems } from './check-cli-pin.ts'
import { root } from './guards/repo-files.ts'

const SCRIPT = join(root, 'scripts/check-cli-pin.ts')
const repos: string[] = []
afterEach(() => {
  for (const dir of repos.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const manifest = (pin: string) => JSON.stringify({ devDependencies: { 'aws-cdk': pin } })

// A throwaway repo whose main pins one CLI, on a branch from it that pins another.
function repo(onMain: string, onBranch: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'hearth-cli-pin-'))
  repos.push(dir)
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
      cwd: dir,
      stdio: 'pipe',
    })
  git('init', '-q', '-b', 'main')
  mkdirSync(join(dir, 'infra'))
  writeFileSync(join(dir, 'infra/package.json'), manifest(onMain))
  git('add', '-A')
  git('commit', '-qm', 'main')
  git('checkout', '-qb', 'feature')
  writeFileSync(join(dir, 'infra/package.json'), manifest(onBranch))
  git('commit', '-q', '--allow-empty', '-am', 'feature')
  return dir
}

// The CLI's pin never goes down (round 11): a pin lowered on main left every rollback, prod-plan's
// rollback diff and a restore to a release a newer library built unable to read its assembly.
describe('check-cli-pin: the CDK CLI never goes down', () => {
  it('refuses a lower pin and one that is no exact version, and passes an equal or higher one', () => {
    expect(cliPinProblems('2.1146.1', '2.1146.1')).toEqual([])
    expect(cliPinProblems('2.1146.1', '2.1146.2')).toEqual([])
    expect(cliPinProblems('2.1146.1', '2.1200.0')).toEqual([])
    expect(cliPinProblems('2.1146.1', '3.0.0')).toEqual([])
    for (const lower of ['2.1146.0', '2.1100.0', '2.999.9', '1.9999.9']) {
      expect(cliPinProblems('2.1146.1', lower), lower).toHaveLength(1)
      expect(cliPinProblems('2.1146.1', lower)[0], lower).toContain(`pins aws-cdk ${lower}, lower than 2.1146.1`)
    }
    for (const loose of ['^2.1146.1', '~2.1146.1', '2.1146', 'latest', '2.1146.1-rc.0', '02.1146.1']) {
      expect(cliPinProblems('2.1146.1', loose), loose).toEqual([
        `infra/package.json pins no exact aws-cdk version (${loose})`,
      ])
    }
    expect(cliPinProblems('2.1146.1', undefined)).toHaveLength(1)
    // A base with no exact pin holds nothing to compare.
    expect(cliPinProblems(undefined, '2.1146.1')).toEqual([])
    expect(cliPinProblems('^2.0.0', '2.1146.1')).toEqual([])
  })

  it('reads the pin infra pins, and the repository’s is an exact version', () => {
    expect(cliPinOf(manifest('2.1146.1'))).toBe('2.1146.1')
    expect(cliPinOf(JSON.stringify({ dependencies: { 'aws-cdk': '2.1.0' } }))).toBe('2.1.0')
    expect(cliPinOf('{')).toBeUndefined()
    expect(cliPinOf('{}')).toBeUndefined()
    const pin = cliPinOf(readFileSync(join(root, 'infra/package.json'), 'utf8'))
    expect(cliPinProblems(pin, pin)).toEqual([])
  })

  it('compares a branch with its base as CI runs it', () => {
    const run = (dir: string) => spawnSync(process.execPath, [SCRIPT, 'main'], { cwd: dir, encoding: 'utf8' })
    expect(run(repo('2.1146.1', '2.1146.1')).status).toBe(0)
    expect(run(repo('2.1146.1', '2.1150.0')).status).toBe(0)
    const lowered = run(repo('2.1146.1', '2.1100.0'))
    expect(lowered.status).toBe(1)
    expect(lowered.stderr).toContain('pins aws-cdk 2.1100.0, lower than 2.1146.1')
    const missing = spawnSync(process.execPath, [SCRIPT, 'no-such-branch'], {
      cwd: repo('2.1146.1', '2.1146.1'),
      encoding: 'utf8',
    })
    expect(missing.status).toBe(2)
  })
})
