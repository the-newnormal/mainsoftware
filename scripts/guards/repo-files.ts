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
