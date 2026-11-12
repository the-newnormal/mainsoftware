// The rollback floors check's cases (C11-D58; TECH-SPEC T24 item 22): the rule on its own, the
// floors' shape, a floor naming a file its commit lacks, the forward deploy's expansion check, and the
// command line in a scratch git repository with fictional migrations and a floors.ts of its own in the
// real one's shape, whose origin/main is c4, as a pulled clone's is, and a branch commit off it that
// main never merged. CI's runner gives git no identity, so every commit here names its own (an address
// built from parts, IG-01), and a developer's own git settings are set aside: git's own environment
// variables for the whole file (a hook's GIT_INDEX_FILE among them), and the system and global
// configuration files (a global hook, signed tags) for every git command the test runs itself. It holds
// what the floors check must decide, so it is on the owner's-read list (C11-D74).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { FLOORS } from '../../src/release/floors.ts'
import { checkExpansions, checkFloors, crossedFloors, FloorsError, main, parseFloors } from './floors-check.ts'

const SCRIPT = fileURLToPath(new URL('./floors-check.ts', import.meta.url))
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const EMAIL = ['test', 'example.invalid'].join('@')
// git's own variables set aside for the whole file, the script's own git commands included: a hook that
// runs these tests hands git GIT_INDEX_FILE (and can hand it GIT_DIR or GIT_WORK_TREE), which would
// point a command at the hook's repository and index instead of the scratch one, and a git -c value
// (GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT) would reach every command. Restored after the file.
for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
afterAll(() => {
  vi.unstubAllEnvs()
})
// What every git command the test runs itself is given: no system or global configuration file, an
// identity, and none of the developer's commit and tag signing or hooks, so a global setting can't
// refuse a commit or turn a plain tag into a signed one.
const GIT_ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
const GIT_SETTINGS = [
  ...['-c', 'user.name=hearth-test', '-c', `user.email=${EMAIL}`, '-c', 'commit.gpgsign=false'],
  ...['-c', 'tag.gpgSign=false', '-c', 'core.hooksPath=/dev/null'],
]

// A floors.ts in the real file's shape, holding the given floors.
const floorsSource = (floors: ReadonlyArray<{ migration: string; expansion: string; why: string }>) =>
  [
    'export interface Floor {',
    '  migration: string',
    '  expansion: string',
    '  why: string',
    '}',
    '',
    `export const FLOORS: readonly Floor[] = ${JSON.stringify(floors)}`,
    '',
  ].join('\n')

// The floors, each with the expansion it follows: y's is c2 and z's c3, set once beforeAll has made them.
const DROP_Y = { migration: '0017_drop_y.sql', expansion: '', why: 'drops y, which releases before 0016 still read' }
const DROP_Z = { migration: '0018_drop_z.sql', expansion: '', why: 'drops z, which releases before 0017 still read' }

let repo = ''
// The scratch repository's commits: c1 the base, c2 an expanding migration, c3 the contraction with
// its floor (its expansion c2), c4 a second contraction with its own (its expansion c3).
const c: Record<'c1' | 'c2' | 'c3' | 'c4', string> = { c1: '', c2: '', c3: '', c4: '' }

function run(args: readonly string[]): string {
  return execFileSync('git', [...GIT_SETTINGS, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: GIT_ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
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
  DROP_Y.expansion = c.c2
  c.c3 = commit(
    { 'db/migrations/0017_drop_y.sql': 'select 1;\n', 'infra/src/release/floors.ts': floorsSource([DROP_Y]) },
    'contract y',
  )
  DROP_Z.expansion = c.c3
  c.c4 = commit(
    {
      'db/migrations/0018_drop_z.sql': 'select 1;\n',
      'infra/src/release/floors.ts': floorsSource([DROP_Y, DROP_Z]),
    },
    'contract z',
  )
  // A pulled clone's remote-tracking main.
  run(['update-ref', 'refs/remotes/origin/main', c.c4])
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
    // A floor whose migration the floors commit lacks binds nothing here; checkFloors refuses such floors
    // before they get here (below).
    expect(crossedFloors([DROP_Y], atC2, new Set(['0015_base.sql']))).toEqual([])
    // Two crossed floors are both listed, in FLOORS's order.
    const atC4 = new Set([...atC3, '0018_drop_z.sql'])
    expect(crossedFloors([DROP_Y, DROP_Z], atC4, atC2)).toEqual([DROP_Y, DROP_Z])
  })

  it('C11-D58: parseFloors refuses a floor with no why or expansion, a name without .sql, an expansion that isn’t a full commit, an extra key and a non-array', () => {
    expect(parseFloors([DROP_Y])).toEqual([DROP_Y])
    expect(parseFloors([])).toEqual([])
    const expansion = 'a'.repeat(40)
    for (const bad of [
      [{ migration: '0017_drop_y.sql', expansion }],
      [{ migration: '0017_drop_y.sql', expansion, why: '  ' }],
      [{ migration: '0017_drop_y.sql', why: 'x' }],
      [{ migration: '0017_drop_y.sql', expansion: expansion.slice(1), why: 'x' }],
      [{ migration: '0017_drop_y.sql', expansion: 'A'.repeat(40), why: 'x' }],
      [{ migration: '0017_drop_y.sql', expansion: 'main', why: 'x' }],
      [{ migration: '0017_drop_y', expansion, why: 'x' }],
      [{ migration: '17_drop_y.sql', expansion, why: 'x' }],
      [{ migration: '0017_drop_y.sql', expansion, why: 'x', extra: 1 }],
      { migration: '0017_drop_y.sql', expansion, why: 'x' },
      'FLOORS',
      undefined,
    ]) {
      expect(() => parseFloors(bad)).toThrow(FloorsError)
    }
  })

  it('C11-D58: the command line exits 0 allowed, 1 with each floor crossed or a failure it didn’t expect, 2 for a malformed or unknown target', async () => {
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
    // A failure it didn't expect (here an output that throws the first time it's written to) is one
    // line, `floors-check: failed`, and 1, never the error's message.
    let out = ''
    let writes = 0
    const write = (text: string) => {
      writes += 1
      if (writes === 1) throw new Error(`stdout closed ${c.c3}`)
      out += text
    }
    expect([await main(['--target', c.c3, '--floors-at', c.c3], { write, cwd: repo }), out]).toEqual([
      1,
      'floors-check: failed\n',
    ])
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
      // bare is on main past origin/main, so it is named as main's head.
      expect(await cli(['--target', c.c1, '--floors-at', bare, '--main', bare])).toEqual({
        code: 2,
        lines: ['floors-check: FLOORS is malformed'],
      })
    } finally {
      run(['reset', '-q', '--hard', c.c4])
    }
    const orphan = mkdtempSync(join(tmpdir(), 'hearth-floors-orphan-'))
    try {
      const inside = { cwd: orphan, env: GIT_ENV, stdio: 'pipe' } as const
      execFileSync('git', [...GIT_SETTINGS, 'init', '-q', '-b', 'main'], inside)
      execFileSync('git', [...GIT_SETTINGS, 'commit', '-q', '--allow-empty', '-m', 'empty'], inside)
      const head = execFileSync('git', [...GIT_SETTINGS, 'rev-parse', 'HEAD'], { ...inside, encoding: 'utf8' }).trim()
      const inOrphan = async (argv: readonly string[]) => {
        let out = ''
        const code = await main([...argv, '--repo', orphan], { write: text => (out += text), cwd: repo })
        return [code, out]
      }
      // A clone with no origin/main is named, rather than read as main, and so is one where a tag named
      // refs/remotes/origin/main stands where the remote-tracking ref is missing (rev-parse would take it).
      expect(await inOrphan(['--target', head])).toEqual([2, 'floors-check: origin/main is not in this clone\n'])
      execFileSync('git', [...GIT_SETTINGS, 'tag', 'refs/remotes/origin/main', head], inside)
      expect(await inOrphan(['--target', head])).toEqual([2, 'floors-check: origin/main is not in this clone\n'])
      expect(await inOrphan(['--target', head, '--main', head])).toEqual([
        2,
        `floors-check: ${head} has no infra/src/release/floors.ts\n`,
      ])
    } finally {
      rmSync(orphan, { recursive: true, force: true })
    }
  })

  it('C11-D58: refuses a --target or --floors-at off main before reading anything at it, so a branch’s floors.ts never runs', async () => {
    // A branch commit off main's head, as a forged migration or release record could name: its
    // floors.ts writes a marker when imported, and allows everything.
    const marks = mkdtempSync(join(tmpdir(), 'hearth-floors-marks-'))
    const marker = join(marks, 'ran')
    run(['checkout', '-q', '-b', 'side'])
    const side = commit(
      {
        'db/migrations/0019_side.sql': 'select 1;\n',
        'infra/src/release/floors.ts': [
          "import { writeFileSync } from 'node:fs'",
          `writeFileSync(${JSON.stringify(marker)}, 'ran')`,
          'export const FLOORS = []',
          '',
        ].join('\n'),
      },
      'side',
    )
    run(['checkout', '-q', 'main'])
    const offMain = (name: string) => ({ code: 2, lines: [`floors-check: ${name} is not on origin/main`] })
    try {
      expect(await cli(['--target', c.c2, '--floors-at', side])).toEqual(offMain(side))
      expect(await cli(['--target', side, '--floors-at', c.c4])).toEqual(offMain(side))
      await expect(checkFloors({ target: c.c2, floorsAt: side, repo })).rejects.toThrow(FloorsError)
      // A branch and a tag named origin/main, which a short name's lookup would take first, don't stand
      // in for the remote-tracking ref.
      run(['branch', 'origin/main', side])
      run(['tag', 'origin/main', side])
      try {
        expect(await cli(['--target', c.c2, '--floors-at', side])).toEqual(offMain(side))
      } finally {
        run(['branch', '-q', '-D', 'origin/main'])
        run(['tag', '-d', 'origin/main'])
      }
      // The working copy at the branch commit: HEAD is off main too.
      run(['-c', 'advice.detachedHead=false', 'checkout', '-q', side])
      try {
        expect(await cli(['--target', c.c2])).toEqual(offMain('HEAD'))
      } finally {
        run(['checkout', '-q', 'main'])
      }
      // A main older than the floors commit refuses it as well; --main must be a commit or origin/main.
      expect(await cli(['--target', c.c2, '--floors-at', c.c4, '--main', c.c3])).toEqual({
        code: 2,
        lines: [`floors-check: ${c.c4} is not on ${c.c3}`],
      })
      expect(await cli(['--target', c.c2, '--main', 'main'])).toEqual({
        code: 2,
        lines: ['floors-check: --main is not a commit or origin/main'],
      })
      expect(existsSync(marker)).toBe(false)
      // Named as main, the branch commit's floors.ts is read, and runs: the marker shows what the
      // refusals above kept from running.
      expect(await cli(['--target', c.c2, '--floors-at', side, '--main', side])).toEqual({
        code: 0,
        lines: ['floors-check: allowed'],
      })
      expect(existsSync(marker)).toBe(true)
    } finally {
      run(['branch', '-q', '-D', 'side'])
      rmSync(marks, { recursive: true, force: true })
    }
  })

  // A commit on main past c4 whose floors.ts holds the given floors, run and then dropped, so main
  // returns to c4. It is named as main's head.
  async function withFloorsOnMain(floors: Parameters<typeof floorsSource>[0], body: (at: string) => Promise<void>) {
    const at = commit({ 'infra/src/release/floors.ts': floorsSource(floors) }, 'planted floors')
    try {
      await body(at)
    } finally {
      run(['reset', '-q', '--hard', c.c4])
    }
  }

  it('C11-D58: refuses a floor naming a file its commit lacks (a misspelt name), never reading it as binding nothing', async () => {
    const misspelt = { ...DROP_Z, migration: '0018_drop_z_col.sql' }
    await withFloorsOnMain([DROP_Y, misspelt], async at => {
      const lacks = `floors-check: FLOORS names ${misspelt.migration}, which ${at} lacks`
      // c2 lacks both drops, so with the name spelt right the rollback would be refused twice.
      expect(await cli(['--target', c.c2, '--floors-at', at, '--main', at])).toEqual({ code: 2, lines: [lacks] })
      await expect(checkFloors({ target: c.c3, floorsAt: at, main: at, repo })).rejects.toThrow(FloorsError)
      await expect(checkExpansions({ release: c.c3, floorsAt: at, main: at, repo })).rejects.toThrow(
        `FLOORS names ${misspelt.migration}, which ${at} lacks`,
      )
    })
  })

  it('C11-D58: checkExpansions finds the floors a forward deploy would contract the database under: each whose file the release lacks while it predates the floor’s expansion', async () => {
    // At c3 (y's floor, its expansion c2): c1 predates the expansion, c2 is it, and c3 holds the file.
    expect(await checkExpansions({ release: c.c1, floorsAt: c.c3, repo })).toEqual([DROP_Y])
    expect(await checkExpansions({ release: c.c2, floorsAt: c.c3, repo })).toEqual([])
    expect(await checkExpansions({ release: c.c3, floorsAt: c.c3, repo })).toEqual([])
    // At c4 (z's floor too, its expansion c3): c2 runs on y's contraction but predates z's expansion.
    expect(await checkExpansions({ release: c.c1, floorsAt: c.c4, repo })).toEqual([DROP_Y, DROP_Z])
    expect(await checkExpansions({ release: c.c2, floorsAt: c.c4, repo })).toEqual([DROP_Z])
    expect(await checkExpansions({ release: c.c3, floorsAt: c.c4, repo })).toEqual([])
    expect(await checkExpansions({ release: c.c4, floorsAt: c.c4, repo })).toEqual([])
    // Before any floor, nothing binds; the rollback rule is the other one: c2 is below y's floor.
    expect(await checkExpansions({ release: c.c1, floorsAt: c.c2, repo })).toEqual([])
    expect(await checkFloors({ target: c.c2, floorsAt: c.c3, repo })).toEqual([DROP_Y])
    // The release must be a full commit on main, as checkFloors's target must.
    await expect(checkExpansions({ release: 'main', floorsAt: c.c4, repo })).rejects.toThrow(
      '--release is not a commit',
    )
    await expect(checkExpansions({ release: c.c1, floorsAt: c.c4, main: c.c3, repo })).rejects.toThrow(
      `${c.c4} is not on ${c.c3}`,
    )
  })

  it('C11-D58: checkExpansions refuses an expansion the clone lacks, one off main, and one at or after its contraction', async () => {
    run(['checkout', '-q', '-b', 'side-expansion', c.c2])
    const side = commit({ 'side.txt': 'side\n' }, 'side')
    run(['checkout', '-q', 'main'])
    try {
      const unknown = 'e'.repeat(40)
      for (const [expansion, why] of [
        [unknown, `${unknown} is not in this clone`],
        [side, `FLOORS names ${DROP_Y.migration}'s expansion ${side}, which is not on `],
        [c.c3, `FLOORS names ${DROP_Y.migration}'s expansion ${c.c3}, which already holds it`],
        [c.c4, `FLOORS names ${DROP_Y.migration}'s expansion ${c.c4}, which already holds it`],
      ] as const) {
        await withFloorsOnMain([{ ...DROP_Y, expansion }, DROP_Z], async at => {
          await expect(checkExpansions({ release: c.c3, floorsAt: at, main: at, repo })).rejects.toThrow(why)
          // A rollback doesn't read the expansion: c4 crosses no floor, and c2 both, as ever.
          expect(await checkFloors({ target: c.c4, floorsAt: at, main: at, repo })).toEqual([])
          expect(await checkFloors({ target: c.c2, floorsAt: at, main: at, repo })).toEqual([
            { ...DROP_Y, expansion },
            DROP_Z,
          ])
        })
      }
    } finally {
      run(['branch', '-q', '-D', 'side-expansion'])
    }
  })

  it('C11-D58: the repository’s own FLOORS, read at HEAD, parses (empty today), and each floor names a migration HEAD holds', async () => {
    expect(parseFloors(FLOORS)).toEqual(FLOORS)
    // CI's checkout holds no origin/main, so HEAD is named as main.
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
    await expect(checkFloors({ target: head, main: head, repo: ROOT })).resolves.toEqual([])
    const files = execFileSync('git', ['ls-tree', '--full-tree', '--name-only', 'HEAD', 'db/migrations/'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(line => line !== '')
      .map(line => line.slice('db/migrations/'.length))
    for (const floor of FLOORS) expect(files, floor.migration).toContain(floor.migration)
    // Each expansion is on main before its contraction: read where the clone holds main's history (CI's
    // check job checks out one commit, and the gate, which holds it all, refuses a malformed one there).
    const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: ROOT, encoding: 'utf8' })
    if (shallow.trim() === 'false') {
      await expect(checkExpansions({ release: head, main: head, repo: ROOT })).resolves.toEqual([])
    }
  })
})
