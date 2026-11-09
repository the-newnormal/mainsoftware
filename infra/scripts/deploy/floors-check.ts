// The rollback floors check (C11-D58; TECH-SPEC T24 item 22). A rollback to release R is refused when a
// floor's migration (infra/src/release/floors.ts) is in the floors commit's db/migrations/ but not in
// R's: R's image would run against a database that has contracted under it. It runs in the deploy
// workflow's gate and prod-gate, which hold no credentials and run no npm ci, and in a person's clone
// for break-glass's incident rollback, so it imports no npm package (IG-08): Node's built-ins, and
// floors.ts for its type alone. The floors are read at a named commit (`git show`, into a temporary
// file it imports), never from the working copy, which can predate the floor that refuses. Removing a
// check here permits what removing a floor would, so it is on the owner's-read list (C11-D74).
//
//   node infra/scripts/deploy/floors-check.ts --target <commit> [--floors-at <commit or HEAD>] [--repo <dir>]
//
// prints `floors-check: allowed` and exits 0; or `floors-check: refused <migration> (<why>)`, one line
// for each floor crossed, and exits 1; or one line naming what is wrong with the input and exits 2.
// It prints migration names, a floor's why and commits, nothing else.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Floor } from '../../src/release/floors.ts'

// Bad input, or floors that can't be read. The message names the input or the problem; where it names
// a commit, it is one the caller passed, already checked to be 40 hex or HEAD.
export class FloorsError extends Error {}

const MIGRATION = /^[0-9]{4}_[a-z0-9_]+\.sql$/
const COMMIT = /^[0-9a-f]{40}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// FLOORS as floors.ts exports it: an array of { migration, why }, each migration a file name in
// db/migrations/ and each why a non-empty string, with no other key.
export function parseFloors(value: unknown): Floor[] {
  if (!Array.isArray(value)) throw new FloorsError('FLOORS is malformed')
  return value.map(entry => {
    if (!isRecord(entry)) throw new FloorsError('FLOORS is malformed')
    const { migration, why } = entry
    if (Object.keys(entry).some(key => key !== 'migration' && key !== 'why')) {
      throw new FloorsError('FLOORS is malformed')
    }
    if (typeof migration !== 'string' || !MIGRATION.test(migration)) throw new FloorsError('FLOORS is malformed')
    if (typeof why !== 'string' || why.trim() === '') throw new FloorsError('FLOORS is malformed')
    return { migration, why }
  })
}

// The floors a rollback would cross: each whose migration the floors commit has and the target lacks,
// in FLOORS's order.
export function crossedFloors(
  floors: readonly Floor[],
  floorsMigrations: ReadonlySet<string>,
  targetMigrations: ReadonlySet<string>,
): Floor[] {
  return floors.filter(floor => floorsMigrations.has(floor.migration) && !targetMigrations.has(floor.migration))
}

// git in the repository, with its arguments as an array (never a shell string), its output as text.
export function git(repo: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

// The full commit a name resolves to in the clone, or a FloorsError naming it.
export function resolveCommit(name: string, repo: string): string {
  if (name !== 'HEAD' && !COMMIT.test(name)) throw new FloorsError('a commit is malformed')
  try {
    return git(repo, ['rev-parse', '--verify', '--quiet', `${name}^{commit}`]).trim()
  } catch {
    throw new FloorsError(`${name} is not in this clone`)
  }
}

// FLOORS as the commit has it: floors.ts read by `git show` into a temporary folder, imported from
// there (it imports nothing), and the folder removed whatever happens.
export async function floorsAt(commit: string, repo: string): Promise<Floor[]> {
  let source: string
  try {
    source = git(repo, ['show', `${commit}:infra/src/release/floors.ts`])
  } catch {
    throw new FloorsError(`${commit} has no infra/src/release/floors.ts`)
  }
  const folder = mkdtempSync(join(tmpdir(), 'hearth-floors-'))
  try {
    const file = join(folder, 'floors.ts')
    writeFileSync(file, source)
    const module: unknown = await import(pathToFileURL(file).href)
    return parseFloors(isRecord(module) ? module.FLOORS : undefined)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

// The migration files the commit holds, by name.
export function migrationsAt(commit: string, repo: string): Set<string> {
  const listed = git(repo, ['ls-tree', '--full-tree', '--name-only', commit, 'db/migrations/'])
  return new Set(
    listed
      .split('\n')
      .filter(line => line !== '')
      .map(line => posix.basename(line)),
  )
}

// The floors a rollback to `target` crosses, reading the floors and their migrations at `floorsAt`
// (HEAD by default). The target must be a full commit, so a branch or tag name never stands in for it.
export async function checkFloors(input: { target: string; floorsAt?: string; repo: string }): Promise<Floor[]> {
  if (!COMMIT.test(input.target)) throw new FloorsError('--target is not a commit')
  const target = resolveCommit(input.target, input.repo)
  const at = resolveCommit(input.floorsAt ?? 'HEAD', input.repo)
  const floors = await floorsAt(at, input.repo)
  return crossedFloors(floors, migrationsAt(at, input.repo), migrationsAt(target, input.repo))
}

// The flags a command line gives, each `--name value` once, from those the command takes. A value may
// be empty (the deploy workflow passes an unset input as ''). A FloorsError names the flag at fault,
// never a value.
export function readFlags(argv: readonly string[], allowed: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i] ?? ''
    if (!name.startsWith('--') || !allowed.includes(name.slice(2))) {
      throw new FloorsError(/^--[a-z-]{1,32}$/.test(name) ? `${name} is not an option` : "an argument isn't an option")
    }
    const value = argv[i + 1]
    if (value === undefined) throw new FloorsError(`${name} needs a value`)
    if (flags.has(name.slice(2))) throw new FloorsError(`${name} is given twice`)
    flags.set(name.slice(2), value)
  }
  return flags
}

export interface Io {
  write: (text: string) => unknown
  cwd: string
}

const defaultIo: Io = { write: text => process.stdout.write(text), cwd: process.cwd() }

// The entry: one line a crossed floor, or `allowed`. Input it can't use is one line and 2; a failure
// it didn't expect is `floors-check: failed` and 1, so no error message or stack reaches a log.
export async function main(argv: readonly string[], io: Io = defaultIo): Promise<0 | 1 | 2> {
  try {
    const flags = readFlags(argv, ['target', 'floors-at', 'repo'])
    const target = flags.get('target')
    if (target === undefined) throw new FloorsError('--target is missing')
    const floorsAtFlag = flags.get('floors-at')
    if (floorsAtFlag !== undefined && floorsAtFlag !== 'HEAD' && !COMMIT.test(floorsAtFlag)) {
      throw new FloorsError('--floors-at is not a commit')
    }
    const crossed = await checkFloors({ target, floorsAt: floorsAtFlag, repo: flags.get('repo') ?? io.cwd })
    if (crossed.length === 0) {
      io.write('floors-check: allowed\n')
      return 0
    }
    for (const floor of crossed) io.write(`floors-check: refused ${floor.migration} (${floor.why})\n`)
    return 1
  } catch (error) {
    if (error instanceof FloorsError) {
      io.write(`floors-check: ${error.message}\n`)
      return 2
    }
    io.write('floors-check: failed\n')
    return 1
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
