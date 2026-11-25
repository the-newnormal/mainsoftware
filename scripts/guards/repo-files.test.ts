// What the guards' reading of the repository answers (repo-files.ts). The deploy-workflow, infra and runbooks
// guards hold the repository through repoFiles() and the deploy-workflow guard names this repository through
// ownRepository(), while their planted cases pass file lists and names of their own, so a change that drops a
// file from the listing (a dot-named one, say) or reads the name from somewhere else first would leave every
// planted case green. These cases hold each function to its answer on a throwaway repository, and repoFiles()
// to the files git tracks here. gitAttributes() is held by DPW-02's own planted repositories.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ownRepository, repoFiles, root } from './repo-files'

// A throwaway repository's folder, and git run in it with no configuration but the repository's own.
function throwaway(): { folder: string; git: (...args: string[]) => string } {
  const folder = mkdtempSync(join(tmpdir(), 'hearth-repo-files-'))
  const env = { PATH: process.env.PATH ?? '', HOME: folder, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: folder,
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  git('init', '-q')
  return { folder, git }
}

const write = (folder: string, path: string, text = 'x\n') => {
  mkdirSync(dirname(join(folder, path)), { recursive: true })
  writeFileSync(join(folder, path), text)
}

describe('repo-files: what the guards read the repository through', () => {
  const made: string[] = []
  afterEach(() => {
    vi.unstubAllEnvs()
    for (const folder of made.splice(0)) rmSync(folder, { recursive: true, force: true })
  })

  it('lists every tracked or new file, dot-named ones and those in dot folders included, and no other', () => {
    // repoFiles() runs git with this process's environment, stubbed here so that no global or system
    // configuration (a core.excludesFile, the default ignore file under XDG_CONFIG_HOME) decides what the
    // listing leaves out.
    const { folder, git } = throwaway()
    made.push(folder)
    for (const [name, value] of Object.entries({
      HOME: folder,
      XDG_CONFIG_HOME: folder,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
    })) {
      vi.stubEnv(name, value)
    }
    write(folder, '.gitignore', 'build/\nignored.txt\n')
    for (const path of ['.nvmrc', '.github/workflows/ci.yml', '.claude/settings.json', 'a folder/with space.md']) {
      write(folder, path)
    }
    write(folder, 'apps/web/local-data/tracked.json')
    write(folder, 'gone.md')
    git('add', '--', '.gitignore', '.nvmrc', '.github', '.claude', 'a folder', 'apps', 'gone.md')
    rmSync(join(folder, 'gone.md'))
    // New files git doesn't ignore, a dot-named one and one in a dot folder among them; then what it ignores,
    // and local-data/ at the root, which the listing drops by its own rule.
    for (const path of ['.yarnrc', '.yarn/releases/yarn.cjs', 'docs/new.md']) write(folder, path)
    for (const path of ['ignored.txt', 'build/out.js', 'local-data/export.json']) write(folder, path)
    expect(repoFiles(folder).sort()).toEqual([
      '.claude/settings.json',
      '.github/workflows/ci.yml',
      '.gitignore',
      '.nvmrc',
      '.yarn/releases/yarn.cjs',
      '.yarnrc',
      'a folder/with space.md',
      'docs/new.md',
    ])
  })

  it('lists every file git tracks in this repository that is on disk, dot-named ones included', () => {
    const tracked = execFileSync('git', ['ls-files', '-z', '--cached'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\0')
      .filter(path => path && !/(^|\/)local-data\//.test(path) && existsSync(join(root, path)))
    const listed = new Set(repoFiles())
    expect(tracked.filter(path => !listed.has(path))).toEqual([])
    for (const path of [
      '.nvmrc',
      '.github/workflows/ci.yml',
      '.github/workflows/deploy.yml',
      '.claude/settings.json',
    ]) {
      expect(listed.has(path), path).toBe(true)
    }
  })

  it("names this repository by GitHub's GITHUB_REPOSITORY first, then by the origin remote's last two folders", () => {
    const { folder, git } = throwaway()
    made.push(folder)
    const remote = (url: string) => {
      git('remote', 'remove', 'origin')
      git('remote', 'add', 'origin', url)
    }
    git('remote', 'add', 'origin', 'https://example.invalid/an-owner/a-repo.git')
    // GitHub's name wins over the remote's, lower-cased, whatever the remote names.
    expect(ownRepository({ GITHUB_REPOSITORY: 'Other-Owner/Other.Repo' }, folder)).toBe('other-owner/other.repo')
    // A value that isn't an owner/name falls back to the remote.
    for (const value of [undefined, '', 'an-owner', 'an-owner/a-repo/extra', '-owner/a-repo']) {
      expect(ownRepository({ GITHUB_REPOSITORY: value }, folder), String(value)).toBe('an-owner/a-repo')
    }
    for (const [url, name] of [
      ['https://example.invalid/An-Owner/A-Repo.git', 'an-owner/a-repo'],
      ['https://example.invalid/an-owner/a-repo', 'an-owner/a-repo'],
      ['https://example.invalid/an-owner/a-repo/', 'an-owner/a-repo'],
      ['ssh://git@example.invalid/an-owner/a-repo.git', 'an-owner/a-repo'],
      ['git@example.invalid:an-owner/a-repo.git', 'an-owner/a-repo'],
    ] as const) {
      remote(url)
      expect(ownRepository({}, folder), url).toBe(name)
    }
    remote('https://example.invalid/')
    expect(ownRepository({}, folder)).toBeUndefined()
    git('remote', 'remove', 'origin')
    expect(ownRepository({}, folder)).toBeUndefined()
  })

  // GitHub sets GITHUB_REPOSITORY in every run, so there the name the guard holds is the run's own.
  it.runIf(process.env.GITHUB_ACTIONS === 'true')('names this repository as GitHub does in CI', () => {
    expect(ownRepository()).toBe(process.env.GITHUB_REPOSITORY?.toLowerCase())
  })
})
