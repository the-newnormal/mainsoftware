// The files the guard tests read: everything git tracks plus new files it doesn't ignore. So
// node_modules/, build output and local-data/ are never read: local-data/ holds people's data,
// which coding agents and CI never open (CLAUDE.md, Security and privacy).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()

export function repoFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  // A tracked file deleted in the working tree is still listed, so keep only files that exist.
  return out.split('\0').filter(path => path && !/(^|\/)local-data\//.test(path) && existsSync(join(root, path)))
}

export const readRepoFile = (path: string) => readFileSync(join(root, path), 'utf8')

// The git attributes set on each path, by name (git check-attr --all, which reads .gitattributes,
// $GIT_DIR/info/attributes and core.attributesFile as a checkout does): a path with none is written by a
// checkout exactly as its blob holds it.
export function gitAttributes(paths: readonly string[], cwd = root): Map<string, string[]> {
  const found = new Map<string, string[]>(paths.map(path => [path, []]))
  if (paths.length === 0) return found
  const out = execFileSync('git', ['check-attr', '-z', '--all', '--', ...paths], { cwd, encoding: 'utf8' })
  // Each attribute is three fields: the path, the attribute and its state or value, each ended by a NUL.
  const fields = out.split('\0')
  for (let i = 0; i + 2 < fields.length; i += 3) {
    const path = fields[i] ?? ''
    found.set(path, [...(found.get(path) ?? []), fields[i + 1] ?? ''])
  }
  return found
}

// This repository's owner/name, lower-cased: GitHub's GITHUB_REPOSITORY in CI, or else the last two folders of
// the origin remote's URL (https://host/owner/name(.git) or git@host:owner/name(.git)); undefined when neither
// reads as one. The DPW-02 case refuses a step that names this repository's own action by its full name.
const OWNER_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/
export function ownRepository(): string | undefined {
  const fromCi = process.env.GITHUB_REPOSITORY ?? ''
  if (OWNER_NAME.test(fromCi)) return fromCi.toLowerCase()
  let url = ''
  try {
    url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim()
  } catch {
    return undefined
  }
  const name = /[/:]([^/:]+\/[^/:]+?)(?:\.git)?\/?$/.exec(url)?.[1] ?? ''
  return OWNER_NAME.test(name) ? name.toLowerCase() : undefined
}

// JavaScript and TypeScript sources and configs, wherever they are.
export const isScript = (path: string) => /\.[cm]?[jt]sx?$/.test(path)
