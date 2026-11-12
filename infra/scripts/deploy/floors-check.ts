// The rollback floors check (C11-D58; TECH-SPEC T24 item 22). A rollback to release R is refused when a
// floor's migration (infra/src/release/floors.ts) is in the floors commit's db/migrations/ but not in
// R's: R's image would run against a database that has contracted under it. It runs in the deploy
// workflow's gate and prod-gate, which hold no credentials and run no npm ci, and in a person's clone
// for break-glass's incident rollback, so it imports no npm package (IG-08): Node's built-ins, and
// floors.ts for its type alone. The floors are read at a named commit (`git show`, into a temporary
// file it imports), never from the working copy, which can predate the floor that refuses. Both
// commits must be on main (main's head or an ancestor of it), checked before anything is read at
// either: the release and migration records a person's choice of commit draws on are data that
// anything with Deployments write can add, a branch's workflow included, so a commit off main is
// refused and no floors.ts main never reviewed is imported, in the gate or in the break-glass shell.
// Main is the clone's `refs/remotes/origin/main` by default, read by that full name alone (`git show-ref
// --verify`) so no branch or tag called origin/main, nor a tag called refs/remotes/origin/main where the
// ref is missing, stands in for it, or the commit --main names (the gate gives the run's own).
// A floor whose file the floors commit lacks (a misspelt name) is refused, never read as binding nothing.
// For the gate's forward deploys, checkExpansions finds the floors whose contraction a deploy would run
// under the release an environment runs: those whose file it lacks while it predates their expansion.
// Removing a check here permits what removing a floor would, so it is on the owner's-read list
// (C11-D74).
//
//   node infra/scripts/deploy/floors-check.ts --target <commit> [--floors-at <commit or HEAD>]
//     [--main <commit or origin/main>] [--repo <dir>]
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

// Bad input, or floors that can't be read or are malformed. The message names the input or the problem;
// where it names a commit, it is one the caller passed or FLOORS names, checked to be 40 hex (or HEAD),
// or one either resolves to.
export class FloorsError extends Error {}

const MIGRATION = /^[0-9]{4}_[a-z0-9_]+\.sql$/
const COMMIT = /^[0-9a-f]{40}$/
// The default main: the clone's remote-tracking branch, by its full ref name.
export const ORIGIN_MAIN = 'origin/main'
const ORIGIN_MAIN_REF = 'refs/remotes/origin/main'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// FLOORS as floors.ts exports it: an array of { migration, expansion, why }, each migration a file name
// in db/migrations/, each expansion a full commit and each why a non-empty string, with no other key.
export function parseFloors(value: unknown): Floor[] {
  if (!Array.isArray(value)) throw new FloorsError('FLOORS is malformed')
  return value.map(entry => {
    if (!isRecord(entry)) throw new FloorsError('FLOORS is malformed')
    const { migration, expansion, why } = entry
    if (Object.keys(entry).some(key => key !== 'migration' && key !== 'expansion' && key !== 'why')) {
      throw new FloorsError('FLOORS is malformed')
    }
    if (typeof migration !== 'string' || !MIGRATION.test(migration)) throw new FloorsError('FLOORS is malformed')
    if (typeof expansion !== 'string' || !COMMIT.test(expansion)) throw new FloorsError('FLOORS is malformed')
    if (typeof why !== 'string' || why.trim() === '') throw new FloorsError('FLOORS is malformed')
    return { migration, expansion, why }
  })
}

// The floors a rollback would cross: each whose migration the floors commit has and the target lacks,
// in FLOORS's order. (A floor whose migration the floors commit lacks binds nothing here; floorsAndFiles
// refuses one before it gets here.)
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

// Main's head in the clone: a full commit as given, or origin/main read as refs/remotes/origin/main
// alone (a branch or tag named origin/main would win a short name's lookup, and rev-parse would take a
// tag refs/tags/refs/remotes/origin/main when the ref itself is missing; show-ref --verify reads only it).
export function resolveMain(name: string, repo: string): string {
  if (name !== ORIGIN_MAIN) return resolveCommit(name, repo)
  try {
    const id = git(repo, ['show-ref', '--verify', '--hash', ORIGIN_MAIN_REF]).trim()
    return git(repo, ['rev-parse', '--verify', '--quiet', `${id}^{commit}`]).trim()
  } catch {
    throw new FloorsError(`${ORIGIN_MAIN} is not in this clone`)
  }
}

// Whether a commit is main's head or an ancestor of it, in the clone.
export function isOnMain(commit: string, mainCommit: string, repo: string): boolean {
  try {
    git(repo, ['merge-base', '--is-ancestor', commit, mainCommit])
    return true
  } catch {
    return false
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

// The floors and the migration files at a commit, each floor's file among them: a floor naming a file
// its commit lacks is a mistake (the PR that adds a contraction adds its floor, and no migration is
// renamed or deleted), and would otherwise bind nothing, so it is refused.
export async function floorsAndFiles(commit: string, repo: string): Promise<{ floors: Floor[]; files: Set<string> }> {
  const floors = await floorsAt(commit, repo)
  const files = migrationsAt(commit, repo)
  const missing = floors.find(floor => !files.has(floor.migration))
  if (missing !== undefined) throw new FloorsError(`FLOORS names ${missing.migration}, which ${commit} lacks`)
  return { floors, files }
}

// A commit and the floors commit (HEAD by default) resolved in the clone and both checked to be on main
// (origin/main by default) before anything is read at either. The commit must be a full one, so a branch
// or tag name never stands in for it; `flag` names it in a refusal.
function onMain(input: { commit: string; flag: string; floorsAt?: string; main?: string; repo: string }): {
  commit: string
  at: string
} {
  if (!COMMIT.test(input.commit)) throw new FloorsError(`--${input.flag} is not a commit`)
  const mainName = input.main ?? ORIGIN_MAIN
  if (mainName !== ORIGIN_MAIN && !COMMIT.test(mainName)) throw new FloorsError('--main is not a commit or origin/main')
  const commit = resolveCommit(input.commit, input.repo)
  const atName = input.floorsAt ?? 'HEAD'
  const at = resolveCommit(atName, input.repo)
  const mainCommit = resolveMain(mainName, input.repo)
  for (const [name, each] of [
    [input.commit, commit],
    [atName, at],
  ] as const) {
    if (!isOnMain(each, mainCommit, input.repo)) throw new FloorsError(`${name} is not on ${mainName}`)
  }
  return { commit, at }
}

// The floors a rollback to `target` crosses, reading the floors and their migrations at `floorsAt`
// (HEAD by default). The target must be a full commit, so a branch or tag name never stands in for it,
// and both must be on main (origin/main by default), checked before anything is read at either.
export async function checkFloors(input: {
  target: string
  floorsAt?: string
  main?: string
  repo: string
}): Promise<Floor[]> {
  const { commit: target, at } = onMain({ ...input, commit: input.target, flag: 'target' })
  const { floors, files } = await floorsAndFiles(at, input.repo)
  return crossedFloors(floors, files, migrationsAt(target, input.repo))
}

// The floors whose contraction a forward deploy at `floorsAt` would run under `release`, the release an
// environment runs (C11-D58): each whose migration the release lacks while the release isn't the floor's
// expansion or a descendant of it, in FLOORS's order. The migrate step would contract the database under
// such a release while it still serves, and a failed Services deploy's own rollback would return it there.
// A release that holds the migration descends from the contraction, and so from its expansion. Each
// floor's expansion must be in the clone, on main at the floors commit and without the floor's file (the
// expansion comes before its contraction), or the floors are malformed. Both commits are checked as
// checkFloors checks them.
export async function checkExpansions(input: {
  release: string
  floorsAt?: string
  main?: string
  repo: string
}): Promise<Floor[]> {
  const { commit: release, at } = onMain({ ...input, commit: input.release, flag: 'release' })
  const { floors } = await floorsAndFiles(at, input.repo)
  for (const floor of floors) {
    const expansion = resolveCommit(floor.expansion, input.repo)
    if (!isOnMain(expansion, at, input.repo)) {
      throw new FloorsError(`FLOORS names ${floor.migration}'s expansion ${floor.expansion}, which is not on ${at}`)
    }
    if (migrationsAt(expansion, input.repo).has(floor.migration)) {
      throw new FloorsError(`FLOORS names ${floor.migration}'s expansion ${floor.expansion}, which already holds it`)
    }
  }
  const held = migrationsAt(release, input.repo)
  return floors.filter(floor => !held.has(floor.migration) && !isOnMain(floor.expansion, release, input.repo))
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
    const flags = readFlags(argv, ['target', 'floors-at', 'main', 'repo'])
    const target = flags.get('target')
    if (target === undefined) throw new FloorsError('--target is missing')
    const floorsAtFlag = flags.get('floors-at')
    if (floorsAtFlag !== undefined && floorsAtFlag !== 'HEAD' && !COMMIT.test(floorsAtFlag)) {
      throw new FloorsError('--floors-at is not a commit')
    }
    const crossed = await checkFloors({
      target,
      floorsAt: floorsAtFlag,
      main: flags.get('main'),
      repo: flags.get('repo') ?? io.cwd,
    })
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
