import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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

// git in a throwaway repo, with no configuration of the machine's.
function gitIn(dir: string) {
  return (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
      cwd: dir,
      stdio: 'pipe',
    })
}

// A throwaway repo whose main (fetched as origin/main, as CI's migrations job fetches it) pins one CLI, on a
// branch from it that pins another.
function repo(onMain: string, onBranch: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'hearth-cli-pin-'))
  repos.push(dir)
  const git = gitIn(dir)
  git('init', '-q', '-b', 'main')
  mkdirSync(join(dir, 'infra'))
  writeFileSync(join(dir, 'infra/package.json'), manifest(onMain))
  git('add', '-A')
  git('commit', '-qm', 'main')
  git('update-ref', 'refs/remotes/origin/main', 'main')
  git('checkout', '-qb', 'feature')
  writeFileSync(join(dir, 'infra/package.json'), manifest(onBranch))
  git('commit', '-q', '--allow-empty', '-am', 'feature')
  return dir
}

// infra/package.json made a symbolic link to a file beside it that holds the same manifest.
function linkManifest(dir: string): void {
  renameSync(join(dir, 'infra/package.json'), join(dir, 'infra/package.manifest.json'))
  symlinkSync('package.manifest.json', join(dir, 'infra/package.json'))
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
    // A base with no exact pin is refused, never read as nothing to compare (round 11): main has pinned one
    // since C0.11 PR 2, and a base that can't be read would otherwise pass any pin after it.
    for (const base of [undefined, '^2.0.0', 'latest']) {
      expect(cliPinProblems(base, '2.1146.1', 'origin/main'), String(base)).toEqual([
        `infra/package.json on origin/main pins no exact aws-cdk version (${base ?? 'none'}), so there is nothing to hold the pin to`,
      ])
    }
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
    const run = (dir: string) => spawnSync(process.execPath, [SCRIPT, 'origin/main'], { cwd: dir, encoding: 'utf8' })
    expect(run(repo('2.1146.1', '2.1146.1')).status).toBe(0)
    expect(run(repo('2.1146.1', '2.1150.0')).status).toBe(0)
    const lowered = run(repo('2.1146.1', '2.1100.0'))
    expect(lowered.status).toBe(1)
    expect(lowered.stderr).toContain('pins aws-cdk 2.1100.0, lower than 2.1146.1')
    const missing = spawnSync(process.execPath, [SCRIPT, 'origin/no-such-branch'], {
      cwd: repo('2.1146.1', '2.1146.1'),
      encoding: 'utf8',
    })
    expect(missing.status).toBe(2)
    // A base is named origin/<branch> and read by its full remote-tracking ref, so a short name (a local
    // branch, a tag) is refused before anything is compared.
    for (const name of ['main', 'refs/tags/x', 'origin/', 'origin/a..b']) {
      const shortName = spawnSync(process.execPath, [SCRIPT, name], {
        cwd: repo('2.1146.1', '2.1146.1'),
        encoding: 'utf8',
      })
      expect(shortName.status, name).toBe(2)
      expect(shortName.stdout, name).not.toContain('OK')
    }
  })

  // A tag named origin/main (or origin/<base>) stood in for the branch (round 11): CI's fetch-depth: 0 fetches
  // every tag, git's lookup of a short name takes refs/tags/ before refs/remotes/, and anyone who can push a
  // branch can push a tag, so a lowered pin compared with an older commit's manifest and passed.
  it('reads each base by its full remote-tracking ref, never a tag of its short name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hearth-cli-pin-'))
    repos.push(dir)
    const git = gitIn(dir)
    git('init', '-q', '-b', 'main')
    mkdirSync(join(dir, 'infra'))
    writeFileSync(join(dir, 'infra/package.json'), manifest('2.1100.0'))
    git('add', '-A')
    git('commit', '-qm', 'old: CLI 2.1100.0')
    const old = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
    writeFileSync(join(dir, 'infra/package.json'), manifest('2.1146.1'))
    git('commit', '-qam', 'CDK group: CLI 2.1146.1')
    git('update-ref', 'refs/remotes/origin/main', 'main')
    git('checkout', '-qb', 'stack')
    git('commit', '-q', '--allow-empty', '-m', 'stacked base')
    git('update-ref', 'refs/remotes/origin/stack', 'stack')
    git('checkout', '-qb', 'revert')
    writeFileSync(join(dir, 'infra/package.json'), manifest('2.1100.0'))
    git('commit', '-qam', 'revert the CDK group')
    // The tags as checkout's fetch-depth: 0 fetches them, each at the old commit with the lower pin.
    git('tag', 'origin/main', old)
    git('tag', 'origin/stack', old)
    git('tag', 'refs/remotes/origin/main', old)
    for (const base of ['origin/main', 'origin/stack']) {
      const run = spawnSync(process.execPath, [SCRIPT, base], { cwd: dir, encoding: 'utf8' })
      expect(run.status, base).toBe(1)
      expect(run.stderr, base).toContain(`pins aws-cdk 2.1100.0, lower than 2.1146.1 on ${base}`)
      expect(run.stdout, base).not.toContain('OK')
    }
    // With the remote-tracking branch gone, the tag of its name doesn't stand in for it.
    git('update-ref', '-d', 'refs/remotes/origin/stack')
    expect(spawnSync(process.execPath, [SCRIPT, 'origin/stack'], { cwd: dir, encoding: 'utf8' }).status).toBe(2)
    git('update-ref', '-d', 'refs/remotes/origin/main')
    expect(spawnSync(process.execPath, [SCRIPT, 'origin/main'], { cwd: dir, encoding: 'utf8' }).status).toBe(2)
  })
  // A link read as no pin (round 11): git show prints a symbolic link's target path, which no JSON parse reads,
  // while the deploy jobs' jq reads the file it names, so a link on main, then a lower pin in the file it named,
  // passed while every deploy job fetched the lower CLI.
  it('refuses a manifest that is a symbolic link, on the base or in the checkout', () => {
    const run = (dir: string) => spawnSync(process.execPath, [SCRIPT, 'origin/main'], { cwd: dir, encoding: 'utf8' })
    const head = repo('2.1146.1', '2.1146.1')
    linkManifest(head)
    gitIn(head)('add', '-A')
    gitIn(head)('commit', '-qm', 'link')
    const headLinked = run(head)
    expect(headLinked.status).toBe(1)
    expect(headLinked.stderr).toContain("infra/package.json in this checkout isn't a regular file")
    // The link merged to main, then a branch that lowers the pin in the file it names.
    const base = repo('2.1146.1', '2.1146.1')
    const git = gitIn(base)
    git('checkout', '-q', 'main')
    linkManifest(base)
    git('add', '-A')
    git('commit', '-qm', 'link on main')
    git('update-ref', 'refs/remotes/origin/main', 'main')
    git('checkout', '-qB', 'feature', 'main')
    writeFileSync(join(base, 'infra/package.manifest.json'), manifest('2.1100.0'))
    git('commit', '-qam', 'lower in the linked file')
    const baseLinked = run(base)
    expect(baseLinked.status).toBe(1)
    expect(baseLinked.stderr).toContain("infra/package.json on origin/main isn't a regular file")
    expect(baseLinked.stdout).not.toContain('OK')
  })

  // A pull request retargeted to main (round 11): GitHub starts no run when a base changes, and main's ruleset
  // reads the result the head commit holds, so a branch that already holds main's head is held to main's pin
  // whatever its base.
  it('holds a branch that holds main to main’s pin, whatever its base', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hearth-cli-pin-'))
    repos.push(dir)
    const git = gitIn(dir)
    git('init', '-q', '-b', 'main')
    mkdirSync(join(dir, 'infra'))
    writeFileSync(join(dir, 'infra/package.json'), manifest('2.1100.0'))
    git('add', '-A')
    git('commit', '-qm', 'c0')
    git('checkout', '-qb', 'x')
    writeFileSync(join(dir, 'infra/package.json'), manifest('2.1120.0'))
    git('commit', '-qam', 'x: its own bump')
    git('update-ref', 'refs/remotes/origin/x', 'x')
    git('checkout', '-q', 'main')
    writeFileSync(join(dir, 'infra/package.json'), manifest('2.1146.1'))
    git('commit', '-qam', 'c1: the CDK group')
    git('update-ref', 'refs/remotes/origin/main', 'main')
    git('checkout', '-qb', 'b', 'x')
    const run = () => spawnSync(process.execPath, [SCRIPT, 'origin/x'], { cwd: dir, encoding: 'utf8' })
    // Before b holds main's head, a pull request into x is held to x alone.
    expect(run().status).toBe(0)
    // b merges main and keeps x's manifest in the conflict, as a stacked branch does: now a retarget to main
    // would need no new push, so the run against x holds it to main's pin too.
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'merge', '-q', 'main'], { cwd: dir })
    git('checkout', '-q', '--ours', 'infra/package.json')
    git('add', 'infra/package.json')
    git('commit', '-qm', 'b: merge main, keeping x’s manifest')
    expect(execFileSync('git', ['show', 'HEAD:infra/package.json'], { cwd: dir, encoding: 'utf8' })).toBe(
      manifest('2.1120.0'),
    )
    const held = run()
    expect(held.status).toBe(1)
    expect(held.stderr).toContain('pins aws-cdk 2.1120.0, lower than 2.1146.1 on origin/main')
    // Without origin/main fetched, nothing is compared.
    git('update-ref', '-d', 'refs/remotes/origin/main')
    expect(run().status).toBe(2)
  })
})
