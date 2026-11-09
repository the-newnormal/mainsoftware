// The rollback floors check's cases (C11-D58; TECH-SPEC T24 item 22): the rule on its own, the
// floors' shape, and the command line in a scratch git repository with fictional migrations and a
// floors.ts of its own in the real one's shape. CI's runner gives git no identity, so every commit
// here names its own (an address built from parts, IG-01). It holds what the floors check must
// decide, so it is on the owner's-read list (C11-D74).
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../../src/release/floors.ts'
import { checkFloors, crossedFloors, FloorsError, main, parseFloors } from './floors-check.ts'

const SCRIPT = fileURLToPath(new URL('./floors-check.ts', import.meta.url))
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const EMAIL = ['test', 'example.invalid'].join('@')

// A floors.ts in the real file's shape, holding the given floors.
const floorsSource = (floors: ReadonlyArray<{ migration: string; why: string }>) =>
  [
    'export interface Floor {',
    '  migration: string',
    '  why: string',
    '}',
    '',
    `export const FLOORS: readonly Floor[] = ${JSON.stringify(floors)}`,
    '',
  ].join('\n')

const DROP_Y = { migration: '0017_drop_y.sql', why: 'drops y, which releases before 0016 still read' }
const DROP_Z = { migration: '0018_drop_z.sql', why: 'drops z, which releases before 0017 still read' }

let repo = ''
// The scratch repository's commits: c1 the base, c2 an expanding migration, c3 the contraction with
// its floor, c4 a second contraction with its own.
const c: Record<'c1' | 'c2' | 'c3' | 'c4', string> = { c1: '', c2: '', c3: '', c4: '' }

function run(args: readonly string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=hearth-test', '-c', `user.email=${EMAIL}`, '-c', 'commit.gpgsign=false', ...args],
    { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()
}

function commit(files: Record<string, string>, message: string): string {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(repo, path, '..'), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
  run(['add', '-A'])
  run(['commit', '-q', '-m', message])
  return run(['rev-parse', 'HEAD'])
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'hearth-floors-test-'))
  run(['init', '-q', '-b', 'main'])
  c.c1 = commit(
    { 'db/migrations/0015_base.sql': 'select 1;\n', 'infra/src/release/floors.ts': floorsSource([]) },
    'base',
  )
  c.c2 = commit({ 'db/migrations/0016_add_x.sql': 'select 1;\n' }, 'expand')
  c.c3 = commit(
    { 'db/migrations/0017_drop_y.sql': 'select 1;\n', 'infra/src/release/floors.ts': floorsSource([DROP_Y]) },
    'contract y',
  )
  c.c4 = commit(
    {
      'db/migrations/0018_drop_z.sql': 'select 1;\n',
      'infra/src/release/floors.ts': floorsSource([DROP_Y, DROP_Z]),
    },
    'contract z',
  )
})

afterAll(() => {
  if (repo !== '') rmSync(repo, { recursive: true, force: true })
})

// The command line in process: its lines and exit code.
async function cli(argv: readonly string[]): Promise<{ code: number; lines: string[] }> {
  let out = ''
  const code = await main(argv, { write: text => (out += text), cwd: repo })
  return { code, lines: out.split('\n').filter(line => line !== '') }
}

describe('C11-D58: the rollback floors check', () => {
  it('C11-D58: refuses a rollback across a contracting migration, and allows one between floors or with no floor', () => {
    const atC3 = new Set(['0015_base.sql', '0016_add_x.sql', '0017_drop_y.sql'])
    const atC2 = new Set(['0015_base.sql', '0016_add_x.sql'])
    expect(crossedFloors([DROP_Y], atC3, atC2)).toEqual([DROP_Y])
    // Between floors: the target already has the floor's migration.
    expect(crossedFloors([DROP_Y], atC3, atC3)).toEqual([])
    // With FLOORS empty, anything goes.
    expect(crossedFloors([], atC3, new Set())).toEqual([])
    // A floor whose migration the floors commit doesn't have yet binds nothing.
    expect(crossedFloors([DROP_Y], atC2, new Set(['0015_base.sql']))).toEqual([])
    // Two crossed floors are both listed, in FLOORS's order.
    const atC4 = new Set([...atC3, '0018_drop_z.sql'])
    expect(crossedFloors([DROP_Y, DROP_Z], atC4, atC2)).toEqual([DROP_Y, DROP_Z])
  })

  it('C11-D58: parseFloors refuses a floor with no why, a name without .sql, an extra key and a non-array', () => {
    expect(parseFloors([DROP_Y])).toEqual([DROP_Y])
    expect(parseFloors([])).toEqual([])
    for (const bad of [
      [{ migration: '0017_drop_y.sql' }],
      [{ migration: '0017_drop_y.sql', why: '  ' }],
      [{ migration: '0017_drop_y', why: 'x' }],
      [{ migration: '17_drop_y.sql', why: 'x' }],
      [{ migration: '0017_drop_y.sql', why: 'x', extra: 1 }],
      { migration: '0017_drop_y.sql', why: 'x' },
      'FLOORS',
      undefined,
    ]) {
      expect(() => parseFloors(bad)).toThrow(FloorsError)
    }
  })

  it('C11-D58: the command line exits 0 allowed, 1 with each floor crossed, 2 for a malformed or unknown target', async () => {
    expect(await cli(['--target', c.c3, '--floors-at', c.c3])).toEqual({ code: 0, lines: ['floors-check: allowed'] })
    expect(await cli(['--target', c.c2, '--floors-at', c.c3])).toEqual({
      code: 1,
      lines: [`floors-check: refused ${DROP_Y.migration} (${DROP_Y.why})`],
    })
    expect(await cli(['--target', c.c2, '--floors-at', c.c4])).toEqual({
      code: 1,
      lines: [
        `floors-check: refused ${DROP_Y.migration} (${DROP_Y.why})`,
        `floors-check: refused ${DROP_Z.migration} (${DROP_Z.why})`,
      ],
    })
    expect(await cli(['--target', c.c3.slice(0, 12), '--floors-at', c.c3])).toEqual({
      code: 2,
      lines: ['floors-check: --target is not a commit'],
    })
    expect(await cli(['--target', 'main', '--floors-at', c.c3])).toEqual({
      code: 2,
      lines: ['floors-check: --target is not a commit'],
    })
    const unknown = 'e'.repeat(40)
    expect(await cli(['--target', unknown, '--floors-at', c.c3])).toEqual({
      code: 2,
      lines: [`floors-check: ${unknown} is not in this clone`],
    })
    expect(await cli([])).toEqual({ code: 2, lines: ['floors-check: --target is missing'] })
    expect(await cli(['--target'])).toEqual({ code: 2, lines: ['floors-check: --target needs a value'] })
    expect(await cli(['--target', c.c3, '--floors-at', 'main'])).toEqual({
      code: 2,
      lines: ['floors-check: --floors-at is not a commit'],
    })
    expect(await cli(['--force', 'x'])).toEqual({ code: 2, lines: ['floors-check: --force is not an option'] })
    expect(await cli(['--target', c.c3, '--target', c.c3])).toEqual({
      code: 2,
      lines: ['floors-check: --target is given twice'],
    })
  })

  it('C11-D58: runs as a script under Node, with the same lines and exit codes', () => {
    const node = (args: readonly string[]) =>
      spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
    const allowed = node(['--target', c.c3, '--floors-at', c.c3])
    expect([allowed.status, allowed.stdout, allowed.stderr]).toEqual([0, 'floors-check: allowed\n', ''])
    const refused = node(['--target', c.c2, '--floors-at', c.c3])
    expect([refused.status, refused.stdout]).toEqual([1, `floors-check: refused ${DROP_Y.migration} (${DROP_Y.why})\n`])
    const bad = node([])
    expect([bad.status, bad.stdout, bad.stderr]).toEqual([2, 'floors-check: --target is missing\n', ''])
  }, 60_000)

  it('C11-D58: --floors-at reads the later commit’s floor though the working copy predates it', async () => {
    run(['-c', 'advice.detachedHead=false', 'checkout', '-q', c.c2])
    try {
      // The working copy's floors.ts (c2's) is empty, so reading it would allow the rollback.
      expect(await cli(['--target', c.c2])).toEqual({ code: 0, lines: ['floors-check: allowed'] })
      expect(await checkFloors({ target: c.c2, floorsAt: 'HEAD', repo })).toEqual([])
      expect(await checkFloors({ target: c.c2, floorsAt: c.c3, repo })).toEqual([DROP_Y])
      expect(await cli(['--target', c.c2, '--floors-at', c.c3])).toEqual({
        code: 1,
        lines: [`floors-check: refused ${DROP_Y.migration} (${DROP_Y.why})`],
      })
    } finally {
      run(['checkout', '-q', 'main'])
    }
  })

  it('C11-D58: refuses a floors commit with no floors.ts, and malformed floors there', async () => {
    await expect(checkFloors({ target: c.c1, floorsAt: c.c1, repo })).resolves.toEqual([])
    const bare = commit({ 'infra/src/release/floors.ts': 'export const FLOORS = [{ migration: "x" }]\n' }, 'bad floors')
    try {
      expect(await cli(['--target', c.c1, '--floors-at', bare])).toEqual({
        code: 2,
        lines: ['floors-check: FLOORS is malformed'],
      })
    } finally {
      run(['reset', '-q', '--hard', c.c4])
    }
    const orphan = mkdtempSync(join(tmpdir(), 'hearth-floors-orphan-'))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: orphan })
      execFileSync(
        'git',
        [
          '-c',
          'user.name=hearth-test',
          '-c',
          `user.email=${EMAIL}`,
          '-c',
          'commit.gpgsign=false',
          'commit',
          '-q',
          '--allow-empty',
          '-m',
          'empty',
        ],
        { cwd: orphan },
      )
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: orphan, encoding: 'utf8' }).trim()
      let out = ''
      const code = await main(['--target', head, '--repo', orphan], { write: text => (out += text), cwd: repo })
      expect([code, out]).toEqual([2, `floors-check: ${head} has no infra/src/release/floors.ts\n`])
    } finally {
      rmSync(orphan, { recursive: true, force: true })
    }
  })

  it('C11-D58: the repository’s own FLOORS, read at HEAD, parses (empty today)', async () => {
    expect(parseFloors(FLOORS)).toEqual(FLOORS)
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
    await expect(checkFloors({ target: head, repo: ROOT })).resolves.toEqual([])
  })
})
