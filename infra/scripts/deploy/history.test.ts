// The release history's cases (C11-D58, C11-D61; TECH-SPEC T24 items 22 and 23): the records'
// validation and order, both incident-rollback rules and their parity (rebuilds of one commit
// included, and ECS's deployments in any order), a target's validation, the gate's plan mode by mode,
// prod-gate, the floors and their expansions read through git at the run's commit, the migration record,
// and what the command line prints, plan's lines past DOMAINS among them. The commits are real ones in
// scratch git repositories (main, a branch off it, and a second main whose floor lies between two
// releases, after its expansion), so ancestry and the floors are git's own answers, and a developer's own
// git settings are set aside (git's own environment variables for the whole file, a hook's
// GIT_INDEX_FILE among them, and the system and global configuration files, a global hook or signed
// tags, for every git command the test runs itself); every ARN, account id and address is built from
// parts at run time (IG-01). It holds what the history must decide, so it is on the owner's-read list
// (C11-D74).
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { DOMAINS, isPlaceholderDomain, REGION } from '../../src/config/profiles.ts'
import {
  chooseFromEcs,
  chooseFromRecords,
  current,
  type EcsHistory,
  gitExpansionsMet,
  gitFloorsAllowed,
  gitIsAncestor,
  HistoryInputError,
  type IsAncestor,
  main,
  migrated,
  PLAN_OUTPUTS,
  type PlanInput,
  type PullChecks,
  parseMigrationRecords,
  parseReleaseRecords,
  parseRestoreRecords,
  plan,
  prodGate,
  REFUSALS,
  recordedTarget,
  strictlyOlder,
  validateTarget,
} from './history.ts'

const EMAIL = ['test', 'example.invalid'].join('@')
const ACCOUNT = '1'.repeat(12)
const STAGE_SOURCE = fileURLToPath(new URL('../../src/workload/stage.ts', import.meta.url))

let repo = ''
let scratch = ''
// main's commits m[0] to m[6] (m[6] the run's), and a branch commit off m[3] that main never merged.
const m: string[] = []
let branch = ''
let isAncestor: IsAncestor = () => false

// git's own variables set aside for the whole file, the script's own git commands included: a hook that
// runs these tests hands git GIT_INDEX_FILE (and can hand it GIT_DIR or GIT_WORK_TREE), which would
// point a command at the hook's repository and index instead of the scratch one, and a git -c value
// (GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT) would reach every command. Restored after the file.
for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
afterAll(() => {
  vi.unstubAllEnvs()
})
const GIT_ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }

// git with no system or global configuration file, an identity, and none of the developer's commit and
// tag signing or hooks, so a global setting can't refuse a commit.
function git(args: readonly string[], cwd = repo): string {
  return execFileSync(
    'git',
    [
      ...['-c', 'user.name=hearth-test', '-c', `user.email=${EMAIL}`, '-c', 'commit.gpgsign=false'],
      ...['-c', 'tag.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    ],
    { cwd, encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()
}

function commit(name: string): string {
  writeFileSync(join(repo, `${name}.txt`), `${name}\n`)
  git(['add', '-A'])
  git(['commit', '-q', '-m', name])
  return git(['rev-parse', 'HEAD'])
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'hearth-history-test-'))
  scratch = mkdtempSync(join(tmpdir(), 'hearth-history-files-'))
  git(['init', '-q', '-b', 'main'])
  mkdirSync(join(repo, 'infra/src/release'), { recursive: true })
  mkdirSync(join(repo, 'db/migrations'), { recursive: true })
  writeFileSync(join(repo, 'db/migrations/0015_base.sql'), 'select 1;\n')
  writeFileSync(join(repo, 'infra/src/release/floors.ts'), 'export const FLOORS = []\n')
  for (let i = 0; i <= 3; i++) m.push(commit(`m${i}`))
  git(['checkout', '-q', '-b', 'side'])
  branch = commit('side')
  git(['checkout', '-q', 'main'])
  for (let i = 4; i <= 6; i++) m.push(commit(`m${i}`))
  isAncestor = gitIsAncestor(repo)
})

afterAll(() => {
  for (const folder of [repo, scratch]) if (folder !== '') rmSync(folder, { recursive: true, force: true })
})

const at = (i: number) => m[i] ?? ''
const digestOf = (seed: string) => `sha256:${seed.repeat(64)}`
const D = { a: digestOf('a'), b: digestOf('b'), c: digestOf('c'), d: digestOf('d'), e: digestOf('e'), f: digestOf('f') }

// One GitHub deployment carrying a release record.
function deployment(
  id: number,
  env: 'nonprod' | 'prod',
  commitSha: string,
  digest: string,
  revision: number,
  kind = 'deploy',
): Record<string, unknown> {
  return {
    id,
    task: 'hearth-release',
    environment: env,
    ref: 'main',
    sha: 'f'.repeat(40),
    payload: {
      schema: 1,
      kind,
      commit: commitSha,
      digest,
      migratedCommit: null,
      services: {
        api: `hearth-${env}-api:${revision}`,
        realtime: `hearth-${env}-realtime:${revision}`,
        worker: `hearth-${env}-worker:${revision}`,
      },
    },
  }
}

const records = (env: 'nonprod' | 'prod', ...entries: Array<Record<string, unknown>>) =>
  parseReleaseRecords(entries, env).records

const GOOD_CHECKS = (): PullChecks => ({
  pull: 7,
  base: 'main',
  mergeCommit: at(6),
  headTree: git(['rev-parse', `${at(6)}^{tree}`]),
  check: 'success',
  migrations: 'success',
})

const DOMAINS_OK = ['app.hearth.example', 'content.hearth.example']

// A plan input for the run at m[6], with nonprod running m[5] (after m[4]) and prod running m[4].
function planInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    event: 'push',
    ref: 'refs/heads/main',
    actor: 'a-person',
    triggeringActor: 'a-person',
    sha: at(6),
    target: '',
    mode: '',
    release: '',
    restore: '',
    records: {
      nonprod: records('nonprod', deployment(101, 'nonprod', at(4), D.d, 1), deployment(102, 'nonprod', at(5), D.e, 2)),
      prod: records('prod', deployment(201, 'prod', at(3), D.c, 1), deployment(202, 'prod', at(4), D.d, 2)),
    },
    checks: GOOD_CHECKS(),
    treeOf: commitSha => git(['rev-parse', `${commitSha}^{tree}`]),
    isAncestor,
    floorsAllowed: () => true,
    expansionsMet: () => true,
    domains: DOMAINS_OK,
    ...overrides,
  }
}

// Non-prod's records once a forward deploy of the run's commit (m[6]) has passed, as a drill-smoke needs.
const atHead = () =>
  records(
    'nonprod',
    deployment(101, 'nonprod', at(4), D.d, 1),
    deployment(102, 'nonprod', at(5), D.e, 2),
    deployment(103, 'nonprod', at(6), D.f, 3),
  )

const dispatch = (
  inputs: Partial<Pick<PlanInput, 'target' | 'mode' | 'release' | 'restore'>>,
  rest: Partial<PlanInput> = {},
) =>
  planInput({
    event: 'workflow_dispatch',
    target: 'nonprod',
    mode: 'deploy',
    release: '',
    restore: 'none',
    ...inputs,
    ...rest,
  })

async function outputsOf(input: PlanInput) {
  const result = await plan(input)
  if (!result.ok) throw new Error(`plan refused ${result.reason}`)
  return result.value
}

async function refusalOf(input: PlanInput) {
  const result = await plan(input)
  return result.ok ? 'allowed' : result.reason
}

describe('C11-D61, T24 item 23: the release record’s payload', () => {
  it('C11-D61: keeps a good record and one whose commit, digest and migratedCommit hold 12-digit runs, refuses an ARN, a long revision, an extra key, a string payload, another schema, a short migratedCommit and a fourth service, and never reads a per-job deployment', () => {
    const good = deployment(11, 'prod', 'a'.repeat(40), D.a, 3)
    const arn = deployment(12, 'prod', 'a'.repeat(40), D.a, 4)
    ;(arn.payload as { services: Record<string, string> }).services.api = [
      'arn',
      'aws',
      'ecs',
      REGION,
      ACCOUNT,
      'task-definition/hearth-prod-api:3',
    ].join(':')
    const longRevision = deployment(13, 'prod', 'a'.repeat(40), D.a, 5)
    ;(longRevision.payload as { services: Record<string, string> }).services.worker = `hearth-prod-worker:${ACCOUNT}`
    const sevenDigits = deployment(14, 'prod', 'a'.repeat(40), D.a, 1_000_000)
    const extra = deployment(15, 'prod', 'a'.repeat(40), D.a, 6)
    ;(extra.payload as Record<string, unknown>).note = 'x'
    const asString = deployment(16, 'prod', 'a'.repeat(40), D.a, 7)
    asString.payload = JSON.stringify(asString.payload)
    const nullMigrated = deployment(17, 'prod', 'b'.repeat(40), D.b, 8, 'rollback')
    const migratedSet = deployment(18, 'prod', 'c'.repeat(40), D.c, 9, 'pipeline-rollback')
    ;(migratedSet.payload as Record<string, unknown>).migratedCommit = 'b'.repeat(40)
    const badKind = deployment(19, 'prod', 'a'.repeat(40), D.a, 10, 'hotfix')
    const otherEnvFamily = deployment(20, 'prod', 'a'.repeat(40), D.a, 11)
    ;(otherEnvFamily.payload as { services: Record<string, string> }).services.realtime = 'hearth-nonprod-realtime:11'
    const perJob = { id: 21, task: 'deploy', environment: 'prod', ref: 'main', payload: {} }
    const otherEnvironment = deployment(22, 'nonprod', 'a'.repeat(40), D.a, 12)
    // A later schema's record is never read as this one's, whatever it holds.
    const schemaTwo = deployment(23, 'prod', 'a'.repeat(40), D.a, 13)
    ;(schemaTwo.payload as Record<string, unknown>).schema = 2
    const shortMigrated = deployment(24, 'prod', 'a'.repeat(40), D.a, 14)
    ;(shortMigrated.payload as Record<string, unknown>).migratedCommit = 'b'.repeat(12)
    const fourthService = deployment(25, 'prod', 'a'.repeat(40), D.a, 15)
    ;(fourthService.payload as { services: Record<string, string> }).services.scheduler = 'hearth-prod-scheduler:15'
    // A commit, digest and migratedCommit made of digits alone: each holds a 12-digit run, as a real id
    // can, and is no account id, so the record is kept (each field's exemption on its own).
    const allDigits = deployment(26, 'prod', '1'.repeat(40), `sha256:${'2'.repeat(64)}`, 16, 'rollback')
    ;(allDigits.payload as Record<string, unknown>).migratedCommit = '3'.repeat(40)
    const parsed = parseReleaseRecords(
      [
        good,
        arn,
        longRevision,
        sevenDigits,
        extra,
        asString,
        nullMigrated,
        migratedSet,
        badKind,
        otherEnvFamily,
        perJob,
        otherEnvironment,
        schemaTwo,
        shortMigrated,
        fourthService,
        allDigits,
      ],
      'prod',
    )
    expect(parsed.records.map(record => record.id)).toEqual([11, 17, 18, 26])
    expect(parsed.ignored).toEqual([12, 13, 14, 15, 16, 19, 20, 23, 24, 25])
    expect(parsed.records[3]).toMatchObject({
      commit: '1'.repeat(40),
      digest: `sha256:${'2'.repeat(64)}`,
      migratedCommit: '3'.repeat(40),
    })
    // The record's ref is main; its payload's commit is the release's.
    expect(parsed.records[0]).toMatchObject({
      commit: 'a'.repeat(40),
      digest: D.a,
      migratedCommit: null,
      kind: 'deploy',
    })
    expect(parsed.records[2]?.migratedCommit).toBe('b'.repeat(40))
    // gh's --paginate --slurp writes an array of pages; it reads the same.
    expect(parseReleaseRecords([[good], [nullMigrated]], 'prod').records.map(record => record.id)).toEqual([11, 17])
    expect(() => parseReleaseRecords({ id: 1 }, 'prod')).toThrow()
    expect(() => parseReleaseRecords([{ id: 'x', task: 'hearth-release', environment: 'prod' }], 'prod')).toThrow()
  })

  it('C11-D61: orders records by the api revision, the deployment id breaking a tie, and reads the migration and restore records, ignoring another schema’s and keeping a commit or digest of digits', () => {
    // Run B's record (higher revisions) lands before run A's: read in revision order.
    const parsed = parseReleaseRecords(
      [
        deployment(30, 'nonprod', at(2), D.b, 5),
        deployment(31, 'nonprod', at(1), D.a, 4),
        deployment(29, 'nonprod', at(1), D.a, 4),
      ],
      'nonprod',
    )
    expect(parsed.records.map(record => record.id)).toEqual([29, 31, 30])
    expect(current(parsed.records)?.id).toBe(30)
    const migrations = parseMigrationRecords(
      [
        { id: 9, task: 'hearth-migrated', environment: 'prod', payload: { schema: 1, commit: at(2) } },
        { id: 3, task: 'hearth-migrated', environment: 'prod', payload: { schema: 1, commit: at(1) } },
        { id: 10, task: 'hearth-migrated', environment: 'prod', payload: { schema: 1, commit: at(3), extra: 1 } },
        { id: 11, task: 'hearth-migrated', environment: 'nonprod', payload: { schema: 1, commit: at(4) } },
        { id: 12, task: 'hearth-migrated', environment: 'prod', payload: { schema: 2, commit: at(3) } },
        // A commit of digits alone holds a 12-digit run and is kept, as a release record's is.
        { id: 13, task: 'hearth-migrated', environment: 'prod', payload: { schema: 1, commit: '4'.repeat(40) } },
      ],
      'prod',
    )
    expect(migrations).toEqual({
      records: [
        { id: 3, commit: at(1) },
        { id: 9, commit: at(2) },
        { id: 13, commit: '4'.repeat(40) },
      ],
      ignored: [10, 12],
    })
    const restores = parseRestoreRecords([
      {
        id: 5,
        task: 'hearth-restore',
        environment: 'prod',
        payload: { schema: 1, kind: 'up', commit: at(4), digest: D.d },
      },
      {
        id: 6,
        task: 'hearth-restore',
        environment: 'prod',
        payload: { schema: 1, kind: 'sideways', commit: at(4), digest: D.d },
      },
      {
        id: 7,
        task: 'hearth-restore',
        environment: 'prod',
        payload: { schema: 2, kind: 'down', commit: at(4), digest: D.d },
      },
      // A commit and digest of digits alone, each holding a 12-digit run: kept.
      {
        id: 8,
        task: 'hearth-restore',
        environment: 'prod',
        payload: { schema: 1, kind: 'down', commit: '5'.repeat(40), digest: `sha256:${'6'.repeat(64)}` },
      },
    ])
    expect(restores).toEqual({
      records: [
        { id: 5, kind: 'up', commit: at(4), digest: D.d },
        { id: 8, kind: 'down', commit: '5'.repeat(40), digest: `sha256:${'6'.repeat(64)}` },
      ],
      ignored: [6, 7],
    })
  })
})

describe('C11-D58, T24 item 22: choosing the release to go back to from the records', () => {
  it('C11-D58: chooses the release that ran before the current one first did, never the one before the newest', () => {
    const r = [at(1), at(2), at(3), at(4)]
    const history = records(
      'prod',
      deployment(1, 'prod', at(1), D.a, 1),
      deployment(2, 'prod', at(2), D.b, 2),
      deployment(3, 'prod', at(3), D.c, 3),
    )
    const chosen = chooseFromRecords(history, { commit: at(3), digest: D.c }, isAncestor)
    expect(chosen.ok && chosen.value.commit).toBe(at(2))
    // R1 R2 R3 R2 (a rollback to R2): the release before R2 first ran is R1, never R3.
    const rolledBack = [...history, ...records('prod', deployment(4, 'prod', at(2), D.b, 4, 'rollback'))]
    const fromR2 = chooseFromRecords(rolledBack, { commit: at(2), digest: D.b }, isAncestor)
    expect(fromR2.ok && fromR2.value.commit).toBe(at(1))
    // A single release has nothing before it.
    expect(chooseFromRecords(history.slice(0, 1), { commit: at(1), digest: D.a }, isAncestor)).toEqual({
      ok: false,
      reason: 'no-earlier-release',
    })
    expect(chooseFromRecords([], { commit: at(1), digest: D.a }, isAncestor)).toEqual({
      ok: false,
      reason: 'no-earlier-release',
    })
    // R4 live with no record (its smoke failed and its rollback didn't run): the newest record, R3.
    const unrecorded = chooseFromRecords(history, { commit: r[3] ?? '', digest: D.d }, isAncestor)
    expect(unrecorded.ok && unrecorded.value.commit).toBe(at(3))
    // ...refused when the newest record isn't strictly older than the live commit.
    expect(chooseFromRecords(history, { commit: at(0), digest: D.f }, isAncestor)).toEqual({
      ok: false,
      reason: 'not-an-ancestor',
    })
    // A live build of a recorded commit with no record of its own is that commit's release: the
    // record before the commit first ran (R1 for R2), nothing for R1.
    const liveBuild = chooseFromRecords(history, { commit: at(2), digest: D.f }, isAncestor)
    expect(liveBuild.ok && liveBuild.value.commit).toBe(at(1))
    expect(chooseFromRecords(history, { commit: at(1), digest: D.f }, isAncestor)).toEqual({
      ok: false,
      reason: 'no-earlier-release',
    })
    // A record naming the current digest under another commit (only a forged one would) counts as
    // the current release's first: the record before it, never the forged record itself.
    const forged = records(
      'prod',
      deployment(1, 'prod', at(1), D.a, 1),
      deployment(2, 'prod', at(2), D.c, 2),
      deployment(3, 'prod', at(3), D.c, 3),
    )
    const pastForged = chooseFromRecords(forged, { commit: at(3), digest: D.c }, isAncestor)
    expect(pastForged.ok && pastForged.value).toMatchObject({ id: 1, commit: at(1), digest: D.a })
  })

  it('C11-D58: reads records written out of order in revision order (run B’s before run A’s)', () => {
    // R1, then run A (m2) and run B (m3); B's record job finished first, so its id is lower.
    const outOfOrder = records(
      'nonprod',
      deployment(1, 'nonprod', at(1), D.a, 1),
      deployment(2, 'nonprod', at(3), D.c, 3),
      deployment(3, 'nonprod', at(2), D.b, 2),
    )
    expect(outOfOrder.map(record => record.commit)).toEqual([at(1), at(2), at(3)])
    const chosen = chooseFromRecords(outOfOrder, { commit: at(3), digest: D.c }, isAncestor)
    expect(chosen.ok && chosen.value.commit).toBe(at(2))
  })

  it('C11-D58: skips an earlier build of the current commit, recorded or live with no record', () => {
    // R1, then two builds of R2 (a dispatch after a rejected approval rebuilds main's head under a new
    // digest): the release before R2 first ran is R1, never R2's earlier build.
    const rebuilt = records(
      'prod',
      deployment(1, 'prod', at(1), D.a, 1),
      deployment(2, 'prod', at(2), D.b, 2),
      deployment(3, 'prod', at(2), D.c, 3),
    )
    const fromRebuild = chooseFromRecords(rebuilt, { commit: at(2), digest: D.c }, isAncestor)
    expect(fromRebuild.ok && fromRebuild.value).toMatchObject({ commit: at(1), digest: D.a })
    // A third build of R2 live with no record (its smoke failed and its rollback didn't run): R1 too.
    const unrecorded = chooseFromRecords(rebuilt, { commit: at(2), digest: D.d }, isAncestor)
    expect(unrecorded.ok && unrecorded.value.commit).toBe(at(1))
    // A rollback to R1 between the builds changes nothing: R2 first ran after R1.
    const between = [
      ...rebuilt.slice(0, 2),
      ...records('prod', deployment(4, 'prod', at(1), D.a, 4, 'rollback'), deployment(5, 'prod', at(2), D.e, 5)),
    ]
    const fromBetween = chooseFromRecords(between, { commit: at(2), digest: D.e }, isAncestor)
    expect(fromBetween.ok && fromBetween.value.commit).toBe(at(1))
    // Only builds of one commit: nothing ran before it.
    expect(chooseFromRecords(rebuilt.slice(1), { commit: at(2), digest: D.c }, isAncestor)).toEqual({
      ok: false,
      reason: 'no-earlier-release',
    })
    // The choice passes validation, where the earlier build would read as the release that runs.
    expect(validateTarget(rebuilt, { commit: at(2), digest: D.c }, at(1), isAncestor)).toMatchObject({ ok: true })
    expect(validateTarget(rebuilt, { commit: at(2), digest: D.c }, at(2), isAncestor)).toEqual({
      ok: false,
      reason: 'same-digest',
    })
  })
})

describe('C11-D58, T24 item 22: checking a target against the records', () => {
  const history = () =>
    records(
      'prod',
      deployment(1, 'prod', at(1), D.a, 1),
      deployment(2, 'prod', at(2), D.b, 2),
      deployment(3, 'prod', at(3), D.c, 3),
    )

  it('C11-D58: validateTarget refuses the current digest, a release first recorded after it, a non-ancestor and a rebuild', () => {
    const h = history()
    expect(validateTarget(h, { commit: at(3), digest: D.c }, at(2), isAncestor)).toMatchObject({ ok: true })
    expect(validateTarget(h, { commit: at(3), digest: D.c }, at(3), isAncestor)).toEqual({
      ok: false,
      reason: 'same-digest',
    })
    expect(validateTarget(h, { commit: at(2), digest: D.b }, at(3), isAncestor)).toEqual({
      ok: false,
      reason: 'recorded-after-current',
    })
    // A build of m2 live with no record (D.f): R3 was first recorded after m2 first ran.
    expect(validateTarget(h, { commit: at(2), digest: D.f }, at(3), isAncestor)).toEqual({
      ok: false,
      reason: 'recorded-after-current',
    })
    // m0 live with no record of its commit: R3, recorded, but not strictly older than it.
    expect(validateTarget(h, { commit: at(0), digest: D.f }, at(3), isAncestor)).toEqual({
      ok: false,
      reason: 'not-an-ancestor',
    })
    // A rebuild of the current commit (m3 live as D.e, unrecorded) going back to its recorded build
    // changes nothing: the same commit is refused.
    expect(validateTarget(h, { commit: at(3), digest: D.e }, at(3), isAncestor)).toEqual({
      ok: false,
      reason: 'not-an-ancestor',
    })
    expect(validateTarget(h, { commit: at(3), digest: D.c }, at(5), isAncestor)).toEqual({
      ok: false,
      reason: 'not-recorded',
    })
  })

  it('C11-D58: recordedTarget passes a recorded release while a later one runs unrecorded, again after an incident rollback, and refuses one off main', () => {
    const h = history()
    // R4 (m4) runs with no record: the gate still passes the rollback to R3, the newest record. An
    // incident rollback to R3 under break-glass writes no record either, so the first pipeline run
    // afterwards, `mode=rollback` to R3, passes the same way (the plan's case below).
    const r3 = recordedTarget(h, at(3), at(6), isAncestor)
    expect(r3.ok && r3.value.digest).toBe(D.c)
    expect(recordedTarget(h, at(5), at(6), isAncestor)).toEqual({ ok: false, reason: 'not-recorded' })
    const onBranch = [...h, ...records('prod', deployment(9, 'prod', branch, D.f, 9))]
    expect(recordedTarget(onBranch, branch, at(6), isAncestor)).toEqual({ ok: false, reason: 'not-on-main' })
  })
})

// ECS's view of a history: per role, each successful deployment (when it finished and the revision it
// deployed) and those revisions, with ARNs built from parts as the CLI returns them.
const minute = 60_000
const revisionArn = (role: string, n: number) =>
  ['arn', 'aws', 'ecs', REGION, ACCOUNT, `service-revision/hearth-prod/hearth-prod-${role}/${n}`].join(':')
const taskDefinitionArn = (role: string, revision: number) =>
  ['arn', 'aws', 'ecs', REGION, ACCOUNT, `task-definition/hearth-prod-${role}:${revision}`].join(':')

// One role's history from (finished minute, digest, task definition revision) entries.
function ecsHistory(role: string, entries: ReadonlyArray<readonly [number, string, number]>): EcsHistory {
  return {
    deployments: entries.map(([when], i) => ({ finishedAt: when * minute, revision: revisionArn(role, i + 1) })),
    revisions: entries.map(([, digest, revision], i) => ({
      revision: revisionArn(role, i + 1),
      taskDefinition: taskDefinitionArn(role, revision),
      digest,
    })),
  }
}

const sameForAll = (entries: ReadonlyArray<readonly [number, string, number]>) => ({
  api: ecsHistory('api', entries),
  realtime: ecsHistory('realtime', entries),
  worker: ecsHistory('worker', entries),
})

// Each role's deployments in the order given by their indexes in time order (ECS promises none).
const listedAs = (pages: ReturnType<typeof sameForAll>, order: readonly number[]): ReturnType<typeof sameForAll> => {
  const reorder = (history: EcsHistory): EcsHistory => ({
    ...history,
    deployments: order.flatMap(i => history.deployments[i] ?? []),
  })
  return { api: reorder(pages.api), realtime: reorder(pages.realtime), worker: reorder(pages.worker) }
}

describe('C11-D58, T24 item 22: choosing the release to go back to from ECS’s deployments (GitHub down)', () => {
  it('C11-D58: takes the deployment before the current release’s first, not the newest whose image isn’t current', () => {
    // R2, R3 (current), then R4: the api updated, realtime failed and CloudFormation rolled the stack
    // back, which left the api a successful deployment of R4 and then of R3 again.
    const pages = {
      api: ecsHistory('api', [
        [10, D.b, 2],
        [20, D.c, 3],
        [30, D.d, 4],
        [31, D.c, 5],
      ]),
      realtime: ecsHistory('realtime', [
        [10, D.b, 2],
        [20, D.c, 3],
      ]),
      worker: ecsHistory('worker', [
        [10, D.b, 2],
        [20, D.c, 3],
      ]),
    }
    expect(chooseFromEcs(pages, new Set([D.c]))).toEqual({
      ok: true,
      value: {
        digest: D.b,
        services: { api: 'hearth-prod-api:2', realtime: 'hearth-prod-realtime:2', worker: 'hearth-prod-worker:2' },
      },
    })
  })

  it('C11-D58: chooses the same whatever order ECS lists the deployments in, which it doesn’t promise', () => {
    // R1, R2, then R3 (current): read in time order the choice is R2; taken in the order listed, newest
    // first, the deployment before R3's would be the last one listed, R1.
    const pages = sameForAll([
      [10, D.a, 1],
      [20, D.b, 2],
      [30, D.c, 3],
    ])
    const expected = {
      ok: true,
      value: {
        digest: D.b,
        services: { api: 'hearth-prod-api:2', realtime: 'hearth-prod-realtime:2', worker: 'hearth-prod-worker:2' },
      },
    }
    expect(chooseFromEcs(pages, new Set([D.c]))).toEqual(expected)
    // Newest first, and out of order with the current release listed first or between the others.
    for (const order of [
      [2, 1, 0],
      [2, 0, 1],
      [1, 2, 0],
    ]) {
      expect(chooseFromEcs(listedAs(pages, order), new Set([D.c])), order.join()).toEqual(expected)
    }
  })

  it('C11-D58: counts every build of the current commit as the current release', () => {
    // R1, then two builds of R2 (D.b, then D.c, which runs): with both of R2's digests given, the
    // deployment before R2 first ran, R1; with the running one alone, R2's earlier build.
    const pages = sameForAll([
      [10, D.a, 1],
      [20, D.b, 2],
      [30, D.c, 3],
    ])
    const both = chooseFromEcs(pages, new Set([D.b, D.c]))
    expect(both.ok && both.value).toEqual({
      digest: D.a,
      services: { api: 'hearth-prod-api:1', realtime: 'hearth-prod-realtime:1', worker: 'hearth-prod-worker:1' },
    })
    const runningAlone = chooseFromEcs(pages, new Set([D.c]))
    expect(runningAlone.ok && runningAlone.value.digest).toBe(D.b)
  })

  it('C11-D58: refuses services that disagree, nothing before the current release’s first, and a drill’s revision', () => {
    const disagree = {
      ...sameForAll([
        [10, D.b, 2],
        [20, D.c, 3],
      ]),
      api: ecsHistory('api', [
        [5, D.a, 1],
        [20, D.c, 3],
      ]),
    }
    const c = new Set([D.c])
    expect(chooseFromEcs(disagree, c)).toEqual({ ok: false, reason: 'services-disagree' })
    expect(chooseFromEcs(sameForAll([[20, D.c, 3]]), c)).toEqual({ ok: false, reason: 'none-qualifies' })
    expect(chooseFromEcs(sameForAll([[20, D.b, 2]]), c)).toEqual({ ok: false, reason: 'none-qualifies' })
    const pages = sameForAll([
      [10, D.b, 2],
      [20, D.c, 3],
    ])
    expect(chooseFromEcs(pages, c, new Set(['hearth-prod-realtime:2']))).toEqual({
      ok: false,
      reason: 'drill-revision',
    })
    expect(chooseFromEcs(pages, c, new Set(['hearth-prod-realtime:3']))).toMatchObject({ ok: true })
  })

  it('C11-D58: refuses a role whose chosen revision names another role’s task definition, or one that isn’t hearth’s', () => {
    // Every role shares the release's digest, so services-disagree can't see a mix-up: the api's pages
    // holding the worker's, as a mistyped --service would save them, are refused by the family alone.
    const entries: ReadonlyArray<readonly [number, string, number]> = [
      [10, D.b, 2],
      [20, D.c, 3],
    ]
    const c = new Set([D.c])
    const refusal = "a api revision's task definition isn't one of hearth's"
    const mixed = { ...sameForAll(entries), api: ecsHistory('worker', entries) }
    expect(() => chooseFromEcs(mixed, c)).toThrow(HistoryInputError)
    expect(() => chooseFromEcs(mixed, c)).toThrow(refusal)
    // The api's own revisions, one naming the realtime family: the chosen one is refused.
    const api = ecsHistory('api', entries)
    const renamed: EcsHistory = {
      deployments: api.deployments,
      revisions: api.revisions.map(revision => ({ ...revision, taskDefinition: taskDefinitionArn('realtime', 2) })),
    }
    expect(() => chooseFromEcs({ ...sameForAll(entries), api: renamed }, c)).toThrow(refusal)
    // A family that isn't hearth's.
    const other: EcsHistory = {
      deployments: api.deployments,
      revisions: api.revisions.map(revision => ({ ...revision, taskDefinition: 'other-prod-api:2' })),
    }
    expect(() => chooseFromEcs({ ...sameForAll(entries), api: other }, c)).toThrow(refusal)
  })
})

describe('C11-D58, T24 item 22: both incident-rollback rules choose the same release', () => {
  it('C11-D58: parity over one history, written as records and as ECS deployments', () => {
    // R1, R2, R3 deployed; R4's smoke failed and the pipeline rolled back to R3, which registered
    // new revisions and wrote a pipeline-rollback record; R4 has no record.
    const history = records(
      'prod',
      deployment(1, 'prod', at(1), D.a, 1),
      deployment(2, 'prod', at(2), D.b, 2),
      deployment(3, 'prod', at(3), D.c, 3),
      deployment(5, 'prod', at(3), D.c, 5, 'pipeline-rollback'),
    )
    // ECS lists them newest first.
    const pages = listedAs(
      sameForAll([
        [10, D.a, 1],
        [20, D.b, 2],
        [30, D.c, 3],
        [40, D.d, 4],
        [50, D.c, 5],
      ]),
      [4, 3, 2, 1, 0],
    )
    const fromRecords = chooseFromRecords(history, { commit: at(3), digest: D.c }, isAncestor)
    const fromEcs = chooseFromEcs(pages, new Set([D.c]))
    expect(fromRecords.ok && fromRecords.value.digest).toBe(D.b)
    expect(fromEcs.ok && fromEcs.value.digest).toBe(D.b)
    expect(fromRecords.ok && fromEcs.ok && fromRecords.value.services).toEqual(fromEcs.ok && fromEcs.value.services)
  })

  it('C11-D58: parity after two builds of the current commit, every build of it given to the ECS rule', () => {
    // R1 and R2 deployed, then R3 twice (a dispatch after a rejected approval), the second build running.
    const history = records(
      'prod',
      deployment(1, 'prod', at(1), D.a, 1),
      deployment(2, 'prod', at(2), D.b, 2),
      deployment(3, 'prod', at(3), D.c, 3),
      deployment(4, 'prod', at(3), D.d, 4),
    )
    // ECS lists them out of order.
    const pages = listedAs(
      sameForAll([
        [10, D.a, 1],
        [20, D.b, 2],
        [30, D.c, 3],
        [40, D.d, 4],
      ]),
      [3, 1, 2, 0],
    )
    const fromRecords = chooseFromRecords(history, { commit: at(3), digest: D.d }, isAncestor)
    const fromEcs = chooseFromEcs(pages, new Set([D.c, D.d]))
    expect(fromRecords.ok && fromRecords.value.digest).toBe(D.b)
    expect(fromEcs.ok && fromEcs.value.digest).toBe(D.b)
    expect(fromRecords.ok && fromEcs.ok && fromRecords.value.services).toEqual(fromEcs.ok && fromEcs.value.services)
  })

  it('C11-D58: past ECS’s 90 days, a later return to the current release passes for its first, and the ancestry check refuses the choice', () => {
    // R2 (m2) first ran more than 90 days ago; R3 (m3) ran and was recorded; a rollback returned to
    // R2. ECS still lists only R3 and the return to R2, so the rule takes R3, which descends from R2.
    const pages = sameForAll([
      [30, D.c, 3],
      [40, D.b, 4],
    ])
    const chosen = chooseFromEcs(pages, new Set([D.b]))
    expect(chosen.ok && chosen.value.digest).toBe(D.c)
    expect(strictlyOlder(at(3), at(2), isAncestor)).toBe(false)
    // Read against R3's record (R2's own records past the newest 100), validate refuses it by ancestry.
    const h = records('prod', deployment(3, 'prod', at(3), D.c, 3))
    expect(validateTarget(h, { commit: at(2), digest: D.b }, at(3), isAncestor)).toEqual({
      ok: false,
      reason: 'not-an-ancestor',
    })
  })
})

describe('C11-D49, C11-D58, T24 item 20: the gate’s plan, mode by mode', () => {
  it('C11-D49: a push deploys the run’s commit to non-prod, then prod, each with its current release as the previous', async () => {
    const outputs = await outputsOf(planInput())
    expect(Object.keys(outputs)).toEqual([...PLAN_OUTPUTS])
    expect(outputs).toEqual({
      mode: 'deploy',
      target: 'prod',
      restore: 'none',
      commit: at(6),
      digest: '',
      build: 'true',
      nonprod: 'true',
      prod: 'true',
      current_nonprod: `${at(5)}:${D.e}`,
      current_nonprod_id: '102',
      current_prod: `${at(4)}:${D.d}`,
      current_prod_id: '202',
      previous_nonprod_commit: at(5),
      previous_nonprod_digest: D.e,
      previous_prod_commit: at(4),
      previous_prod_digest: D.d,
      rollback_nonprod: 'true',
      rollback_prod: 'true',
      first_nonprod: 'false',
      first_prod: 'false',
    })
    expect(await outputsOf(dispatch({ target: 'prod' }))).toEqual({ ...outputs })
  })

  it('C11-D49: a dispatched deploy to non-prod stops there', async () => {
    expect(await outputsOf(dispatch({}))).toMatchObject({
      mode: 'deploy',
      target: 'nonprod',
      commit: at(6),
      build: 'true',
      nonprod: 'true',
      prod: 'false',
      current_prod: '',
      current_prod_id: '',
      previous_nonprod_commit: at(5),
      previous_prod_commit: '',
      rollback_nonprod: 'true',
      rollback_prod: 'false',
    })
  })

  it('C11-D58: a first deploy has no previous release and no automatic rollback; a previous below a floor has none either', async () => {
    const first = await outputsOf(planInput({ records: { nonprod: [], prod: [] } }))
    expect(first).toMatchObject({
      first_nonprod: 'true',
      first_prod: 'true',
      current_nonprod: '',
      previous_nonprod_commit: '',
      previous_prod_commit: '',
      rollback_nonprod: 'false',
      rollback_prod: 'false',
    })
    const below = await outputsOf(planInput({ floorsAllowed: target => target !== at(4) }))
    expect(below).toMatchObject({ rollback_nonprod: 'true', rollback_prod: 'false', previous_prod_commit: at(4) })
    // A rebuild of the commit prod already runs (a dispatch after a rejected approval) keeps it as
    // the previous release, an earlier build of the same code.
    const rebuild = planInput({
      records: { nonprod: records('nonprod', deployment(103, 'nonprod', at(6), D.f, 3)), prod: [] },
    })
    expect(await outputsOf(rebuild)).toMatchObject({ previous_nonprod_commit: at(6), previous_nonprod_digest: D.f })
  })

  it('C11-D58: a deploy is refused while a deployed environment runs a release older than a floor’s expansion, each asked with its release and the run’s commit', async () => {
    const asked: Array<[string, string]> = []
    const met = (release: string, floorsAt: string) => {
      asked.push([release, floorsAt])
      return release !== at(4)
    }
    // Prod runs m[4], which the stand-in counts as before an expansion; non-prod's m[5] isn't.
    expect(await refusalOf(planInput({ expansionsMet: met }))).toBe('expansion-not-deployed')
    expect(asked).toEqual([
      [at(5), at(6)],
      [at(4), at(6)],
    ])
    // A dispatch to non-prod alone asks of non-prod's release alone.
    asked.length = 0
    expect(await refusalOf(dispatch({}, { expansionsMet: met }))).toBe('allowed')
    expect(asked).toEqual([[at(5), at(6)]])
    // A first deploy runs no release; a rollback, a drill and a restore apply no migration the release
    // they go to lacks, so none asks.
    const never = () => false
    expect(await refusalOf(planInput({ records: { nonprod: [], prod: [] }, expansionsMet: never }))).toBe('allowed')
    const others: Array<Partial<Pick<PlanInput, 'target' | 'mode' | 'release' | 'restore'>>> = [
      { mode: 'rollback', release: at(4) },
      { target: 'prod', mode: 'rollback', release: at(3) },
      { mode: 'drill-break' },
      { target: 'restore', restore: 'up' },
      { target: 'restore', restore: 'down' },
    ]
    for (const inputs of others) {
      expect(await refusalOf(dispatch(inputs, { expansionsMet: never })), JSON.stringify(inputs)).toBe('allowed')
    }
    const drill = dispatch({ mode: 'drill-smoke' }, { expansionsMet: never })
    expect(await refusalOf({ ...drill, records: { ...drill.records, nonprod: atHead() } })).toBe('allowed')
  })

  it('C11-D58: a rollback deploys its recorded target to its environment alone', async () => {
    expect(await outputsOf(dispatch({ mode: 'rollback', release: at(4) }))).toMatchObject({
      mode: 'rollback',
      target: 'nonprod',
      commit: at(4),
      digest: D.d,
      build: 'false',
      nonprod: 'true',
      prod: 'false',
      current_nonprod: `${at(5)}:${D.e}`,
      previous_nonprod_commit: '',
      rollback_nonprod: 'false',
    })
    expect(await outputsOf(dispatch({ target: 'prod', mode: 'rollback', release: at(3) }))).toMatchObject({
      target: 'prod',
      commit: at(3),
      digest: D.c,
      build: 'false',
      nonprod: 'false',
      prod: 'true',
      current_prod_id: '202',
      current_nonprod: '',
    })
    // After an incident rollback to the environment's newest record (R5 in non-prod, a later release
    // that ran unrecorded rolled back under break-glass), the rollback to it passes the gate: only
    // AWS_CHECK, against what runs, decides whether it changes anything.
    expect(await outputsOf(dispatch({ mode: 'rollback', release: at(5) }))).toMatchObject({
      mode: 'rollback',
      target: 'nonprod',
      commit: at(5),
      digest: D.e,
      nonprod: 'true',
      current_nonprod: `${at(5)}:${D.e}`,
    })
    expect(await outputsOf(dispatch({ target: 'prod', mode: 'rollback', release: at(4) }))).toMatchObject({
      commit: at(4),
      digest: D.d,
      prod: 'true',
    })
    expect(await refusalOf(dispatch({ mode: 'rollback', release: at(2) }))).toBe('not-recorded')
    expect(await refusalOf(dispatch({ mode: 'rollback', release: at(4) }, { floorsAllowed: () => false }))).toBe(
      'floor-crossed',
    )
  })

  it('C11-D59: drill-break runs non-prod’s current release; drill-smoke, after a forward deploy of the run’s commit, adds the release before it as the previous', async () => {
    expect(await outputsOf(dispatch({ mode: 'drill-break' }))).toMatchObject({
      mode: 'drill-break',
      commit: at(5),
      digest: D.e,
      build: 'false',
      nonprod: 'true',
      prod: 'false',
      previous_nonprod_commit: '',
      rollback_nonprod: 'false',
    })
    const head = { nonprod: atHead(), prod: [] }
    expect(await outputsOf(dispatch({ mode: 'drill-smoke' }, { records: head }))).toMatchObject({
      mode: 'drill-smoke',
      commit: at(6),
      digest: D.f,
      previous_nonprod_commit: at(5),
      previous_nonprod_digest: D.e,
      rollback_nonprod: 'true',
    })
    // The drill's previous is chooseFromRecords' choice: after two builds of the run's commit, the
    // release before its first, never its earlier build.
    const rebuilt = records(
      'nonprod',
      deployment(101, 'nonprod', at(4), D.d, 1),
      deployment(102, 'nonprod', at(5), D.e, 2),
      deployment(103, 'nonprod', at(6), D.c, 3),
      deployment(104, 'nonprod', at(6), D.f, 4),
    )
    expect(
      await outputsOf(dispatch({ mode: 'drill-smoke' }, { records: { nonprod: rebuilt, prod: [] } })),
    ).toMatchObject({
      commit: at(6),
      digest: D.f,
      previous_nonprod_commit: at(5),
      previous_nonprod_digest: D.e,
    })
    // Its deploy path deploys Platform and Data from the release's assembly, so it runs only where a
    // forward deploy of the run's commit left them: refused while non-prod's newest record is a rollback
    // (a person's to an older commit, or the pipeline's back to an earlier build) or a forward deploy of
    // an older commit (one of the run's commit may have moved them and failed with no record).
    const afterRollback = records(
      'nonprod',
      deployment(101, 'nonprod', at(4), D.d, 1),
      deployment(102, 'nonprod', at(6), D.f, 2),
      deployment(103, 'nonprod', at(4), D.d, 3, 'rollback'),
    )
    const afterPipelineRollback = records(
      'nonprod',
      deployment(101, 'nonprod', at(5), D.e, 1),
      deployment(102, 'nonprod', at(6), D.f, 2),
      deployment(103, 'nonprod', at(6), D.f, 3, 'pipeline-rollback'),
    )
    for (const nonprod of [afterRollback, afterPipelineRollback]) {
      expect(await refusalOf(dispatch({ mode: 'drill-smoke' }, { records: { nonprod, prod: [] } }))).toBe(
        'drill-not-forward',
      )
    }
    expect(await refusalOf(dispatch({ mode: 'drill-smoke' }))).toBe('drill-not-forward')
    expect(await refusalOf(dispatch({ mode: 'drill-smoke' }, { records: head, floorsAllowed: () => false }))).toBe(
      'floor-crossed',
    )
    const single = { nonprod: records('nonprod', deployment(1, 'nonprod', at(6), D.f, 1)), prod: [] }
    expect(await refusalOf(dispatch({ mode: 'drill-smoke' }, { records: single }))).toBe('no-earlier-release')
    const onlyRebuilds = { nonprod: rebuilt.slice(2), prod: [] }
    expect(await refusalOf(dispatch({ mode: 'drill-smoke' }, { records: onlyRebuilds }))).toBe('no-earlier-release')
    expect(await refusalOf(dispatch({ mode: 'drill-break' }, { records: { nonprod: [], prod: [] } }))).toBe(
      'no-release',
    )
  })

  it('C11-D45: a restore runs prod’s current release, up or down, with no restore record needed', async () => {
    const up = await outputsOf(dispatch({ target: 'restore', restore: 'up' }))
    expect(up).toMatchObject({
      mode: 'deploy',
      target: 'restore',
      restore: 'up',
      commit: at(4),
      digest: D.d,
      build: 'false',
      nonprod: 'false',
      prod: 'true',
      current_prod_id: '202',
      first_prod: 'false',
    })
    expect(await outputsOf(dispatch({ target: 'restore', restore: 'down' }))).toEqual({ ...up, restore: 'down' })
    expect(
      await refusalOf(dispatch({ target: 'restore', restore: 'up' }, { records: { nonprod: [], prod: [] } })),
    ).toBe('no-release')
  })

  it('C11-D49: refuses each malformed or mismatched input, a bot, a ref off main and another event', async () => {
    const cases: Array<[PlanInput, string]> = [
      [dispatch({ target: 'staging' }), 'bad-target'],
      [dispatch({ mode: 'hotfix' }), 'bad-mode'],
      [dispatch({ restore: 'sideways' }), 'bad-restore'],
      [dispatch({ mode: 'rollback', release: at(4).slice(0, 12) }), 'bad-release'],
      [dispatch({ mode: 'rollback', release: at(4).toUpperCase() }), 'bad-release'],
      [dispatch({ target: 'prod', mode: 'drill-break' }), 'drill-not-nonprod'],
      [dispatch({ target: 'restore', mode: 'drill-smoke', restore: 'up' }), 'drill-not-nonprod'],
      [dispatch({ target: 'prod', restore: 'up' }), 'restore-misnamed'],
      [dispatch({ target: 'restore' }), 'restore-misnamed'],
      [dispatch({ target: 'restore', mode: 'rollback', release: at(4), restore: 'up' }), 'restore-misnamed'],
      [dispatch({ release: at(4) }), 'release-unexpected'],
      [dispatch({ mode: 'drill-break', release: at(4) }), 'release-unexpected'],
      [dispatch({ mode: 'rollback' }), 'release-missing'],
      [planInput({ target: 'nonprod' }), 'bad-input'],
      [planInput({ actor: 'github-actions[bot]' }), 'bot-actor'],
      [planInput({ triggeringActor: 'renovate[bot]' }), 'bot-actor'],
      [dispatch({}, { triggeringActor: 'github-actions[bot]' }), 'bot-actor'],
      [planInput({ actor: '' }), 'bad-input'],
      [planInput({ ref: 'refs/heads/side' }), 'not-main'],
      [planInput({ ref: 'refs/tags/main' }), 'not-main'],
      [planInput({ event: 'pull_request_target' }), 'bad-event'],
      [planInput({ event: 'workflow_run' }), 'bad-event'],
      [planInput({ sha: 'main' }), 'bad-input'],
    ]
    for (const [input, reason] of cases) expect(await refusalOf(input), reason).toBe(reason)
  })

  it('C11-Q08: refuses while DOMAINS holds a placeholder, in the workload entry’s own words', async () => {
    expect(await refusalOf(planInput({ domains: ['hearth-app.invalid', 'content.hearth.example'] }))).toBe(
      'domains-placeholder',
    )
    expect(await refusalOf(dispatch({ mode: 'rollback', release: at(4) }, { domains: ['x.invalid'] }))).toBe(
      'domains-placeholder',
    )
    expect(readFileSync(STAGE_SOURCE, 'utf8')).toContain(`"${REFUSALS['domains-placeholder']}"`)
  })

  it('C11-D49: a deploy needs the merged pull request that produced the commit, its tree and its green checks', async () => {
    const checks = GOOD_CHECKS()
    expect(await refusalOf(planInput({ checks: undefined }))).toBe('pr-not-found')
    expect(await refusalOf(planInput({ checks: { ...checks, pull: null } }))).toBe('pr-not-found')
    expect(await refusalOf(planInput({ checks: { ...checks, base: 'side' } }))).toBe('pr-not-found')
    expect(await refusalOf(planInput({ checks: { ...checks, mergeCommit: at(5) } }))).toBe('pr-not-found')
    expect(await refusalOf(planInput({ checks: { ...checks, headTree: git(['rev-parse', `${at(5)}^{tree}`]) } }))).toBe(
      'pr-tree-differs',
    )
    expect(await refusalOf(planInput({ checks: { ...checks, check: 'failure' } }))).toBe('pr-checks-failed')
    expect(await refusalOf(planInput({ checks: { ...checks, migrations: 'skipped' } }))).toBe('pr-checks-failed')
    // A rollback, a drill and a restore read no pull request.
    expect(await refusalOf(dispatch({ mode: 'drill-break' }, { checks: undefined }))).toBe('allowed')
  })

  it('C11-D49: a commit off main is refused in every mode, before any code of it runs', async () => {
    const offNonprod = records(
      'nonprod',
      deployment(101, 'nonprod', at(4), D.d, 1),
      deployment(109, 'nonprod', branch, D.f, 9),
    )
    const prod = records('prod', deployment(202, 'prod', at(4), D.d, 2))
    const withBranch = { nonprod: offNonprod, prod }
    // As a current (and so a previous) release, a drill's release, and a restore's.
    expect(await refusalOf(planInput({ records: withBranch }))).toBe('off-main')
    expect(await refusalOf(dispatch({ mode: 'drill-break' }, { records: withBranch }))).toBe('off-main')
    const offProd = { nonprod: [], prod: records('prod', deployment(209, 'prod', branch, D.f, 9)) }
    expect(await refusalOf(dispatch({ target: 'restore', restore: 'down' }, { records: offProd }))).toBe('off-main')
    // As a rollback's target, recorded or not.
    const recordedBranch = {
      nonprod: records(
        'nonprod',
        deployment(108, 'nonprod', branch, D.f, 1),
        deployment(110, 'nonprod', at(5), D.e, 2),
      ),
      prod,
    }
    expect(await refusalOf(dispatch({ mode: 'rollback', release: branch }, { records: recordedBranch }))).toBe(
      'off-main',
    )
    expect(await refusalOf(dispatch({ mode: 'rollback', release: branch }))).toBe('off-main')
    // As a drill-smoke's previous release.
    const branchThenHead = {
      nonprod: records(
        'nonprod',
        deployment(108, 'nonprod', branch, D.e, 1),
        deployment(111, 'nonprod', at(6), D.f, 3),
      ),
      prod,
    }
    expect(await refusalOf(dispatch({ mode: 'drill-smoke' }, { records: branchThenHead }))).toBe('off-main')
  })
})

describe('C11-D52, T24 item 20: prod-gate', () => {
  const prodRecords = () =>
    records('prod', deployment(201, 'prod', at(3), D.c, 1), deployment(202, 'prod', at(4), D.d, 2))
  // Built inside each case, once beforeAll has made the commits.
  const base = () => ({
    mode: 'deploy',
    target: 'prod',
    sha: at(6),
    commit: at(6),
    digest: '',
    recordId: '202',
    buildDigest: D.f,
    nonprodDigest: D.f,
    isAncestor: (a: string, b: string) => isAncestor(a, b),
    floorsAllowed: () => true,
    expansionsMet: () => true,
  })

  it('C11-D52: a deploy of the run’s commit descends from prod’s newest record and deploys the image non-prod deployed', async () => {
    expect(await prodGate({ ...base(), records: prodRecords() })).toEqual({
      ok: true,
      value: { current_prod_id: '202' },
    })
    expect(await prodGate({ ...base(), records: [] })).toEqual({ ok: true, value: { current_prod_id: '' } })
    const ahead = [...prodRecords(), ...records('prod', deployment(209, 'prod', branch, D.e, 9))]
    expect(await prodGate({ ...base(), records: ahead })).toEqual({ ok: false, reason: 'older-than-prod' })
    expect(await prodGate({ ...base(), records: prodRecords(), nonprodDigest: D.e })).toEqual({
      ok: false,
      reason: 'digest-differs',
    })
    expect(await prodGate({ ...base(), records: prodRecords(), buildDigest: '', nonprodDigest: '' })).toEqual({
      ok: false,
      reason: 'digest-differs',
    })
    // Prod's newest record, read afresh, must hold every floor's expansion it needs; a rollback and a
    // restore don't ask.
    expect(await prodGate({ ...base(), records: prodRecords(), expansionsMet: release => release !== at(4) })).toEqual({
      ok: false,
      reason: 'expansion-not-deployed',
    })
    expect(
      await prodGate({
        ...base(),
        mode: 'rollback',
        commit: at(3),
        digest: D.c,
        records: prodRecords(),
        expansionsMet: () => false,
      }),
    ).toMatchObject({ ok: true })
    expect(
      await prodGate({
        ...base(),
        target: 'restore',
        commit: at(4),
        digest: D.d,
        records: prodRecords(),
        expansionsMet: () => false,
      }),
    ).toMatchObject({ ok: true })
    // A deploy's commit is the run's own: a commit the gate didn't output for this run is refused,
    // though it descends from prod's newest record.
    expect(await prodGate({ ...base(), commit: at(5), records: prodRecords() })).toEqual({
      ok: false,
      reason: 'bad-input',
    })
  })

  it('C11-D52: a rollback is re-validated against prod’s records read afresh and the floors at the run’s commit', async () => {
    const rollback = { ...base(), mode: 'rollback', commit: at(3), digest: D.c, buildDigest: '', nonprodDigest: '' }
    expect(await prodGate({ ...rollback, records: prodRecords() })).toEqual({
      ok: true,
      value: { current_prod_id: '202' },
    })
    expect(await prodGate({ ...rollback, commit: at(2), records: prodRecords() })).toEqual({
      ok: false,
      reason: 'not-recorded',
    })
    expect(await prodGate({ ...rollback, digest: D.e, records: prodRecords() })).toEqual({
      ok: false,
      reason: 'record-changed',
    })
    expect(await prodGate({ ...rollback, records: prodRecords(), floorsAllowed: () => false })).toEqual({
      ok: false,
      reason: 'floor-crossed',
    })
    const onBranch = [...prodRecords(), ...records('prod', deployment(209, 'prod', branch, D.e, 9))]
    expect(await prodGate({ ...rollback, commit: branch, digest: D.e, records: onBranch })).toEqual({
      ok: false,
      reason: 'not-on-main',
    })
  })

  it('C11-D45: a restore needs prod’s newest record unchanged since the gate', async () => {
    const restore = { ...base(), target: 'restore', commit: at(4), digest: D.d, buildDigest: '', nonprodDigest: '' }
    expect(await prodGate({ ...restore, records: prodRecords() })).toEqual({
      ok: true,
      value: { current_prod_id: '202' },
    })
    expect(await prodGate({ ...restore, recordId: '201', records: prodRecords() })).toEqual({
      ok: false,
      reason: 'record-changed',
    })
    expect(await prodGate({ ...restore, records: [] })).toEqual({ ok: false, reason: 'no-release' })
    expect(await prodGate({ ...restore, mode: 'drill-break', records: prodRecords() })).toEqual({
      ok: false,
      reason: 'bad-input',
    })
  })
})

// The floors through git, never a stand-in (C11-D58, T24 item 22): a second main whose f[1] is an
// expansion and f[2] adds a contracting migration and its floor (its expansion f[1]), so a release at
// f[1] lies below the floor and one at f[3] above it, one at f[0] predates the expansion, and f[4] is the
// run's commit. f[1]'s own floors.ts names no floor, so floors read at the target, or a call that swaps
// the target and the run's commit, would allow what the run's commit refuses.
describe('C11-D58, T24 item 22: the floors read through git at the run’s commit', () => {
  let floorRepo = ''
  const f: string[] = []
  const fat = (i: number) => f[i] ?? ''
  const fgit = (args: readonly string[]) => git(args, floorRepo)
  const step = (name: string, files: Record<string, string>) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(floorRepo, path, '..'), { recursive: true })
      writeFileSync(join(floorRepo, path), text)
    }
    fgit(['add', '-A'])
    fgit(['commit', '-q', '-m', name])
    return fgit(['rev-parse', 'HEAD'])
  }
  const floorsSource = (floors: ReadonlyArray<{ migration: string; expansion: string; why: string }>) =>
    `export const FLOORS = ${JSON.stringify(floors)}\n`

  beforeAll(() => {
    floorRepo = mkdtempSync(join(tmpdir(), 'hearth-history-floors-'))
    fgit(['init', '-q', '-b', 'main'])
    f.push(
      step('f0', { 'db/migrations/0015_base.sql': 'select 1;\n', 'infra/src/release/floors.ts': floorsSource([]) }),
    )
    f.push(step('f1', { 'f1.txt': 'f1 stops reading y\n' }))
    f.push(
      step('f2', {
        'db/migrations/0016_drop_y.sql': 'select 1;\n',
        'infra/src/release/floors.ts': floorsSource([
          { migration: '0016_drop_y.sql', expansion: fat(1), why: 'drops y, which f0 still reads' },
        ]),
      }),
    )
    f.push(step('f3', { 'f3.txt': 'f3\n' }), step('f4', { 'f4.txt': 'f4\n' }))
  })

  afterAll(() => {
    if (floorRepo !== '') rmSync(floorRepo, { recursive: true, force: true })
  })

  // A plan input for the run at f[4], every answer git's in the floors repository.
  const floorInput = (overrides: Partial<PlanInput> = {}): PlanInput => ({
    ...planInput(),
    sha: fat(4),
    checks: {
      pull: 8,
      base: 'main',
      mergeCommit: fat(4),
      headTree: fgit(['rev-parse', `${fat(4)}^{tree}`]),
      check: 'success',
      migrations: 'success',
    },
    treeOf: commitSha => fgit(['rev-parse', `${commitSha}^{tree}`]),
    isAncestor: gitIsAncestor(floorRepo),
    floorsAllowed: gitFloorsAllowed(floorRepo, fat(4)),
    expansionsMet: gitExpansionsMet(floorRepo, fat(4)),
    ...overrides,
  })
  const floorDispatch = (inputs: Partial<Pick<PlanInput, 'target' | 'mode' | 'release'>>, rest: Partial<PlanInput>) =>
    floorInput({
      event: 'workflow_dispatch',
      target: 'nonprod',
      mode: 'deploy',
      release: '',
      restore: 'none',
      ...inputs,
      ...rest,
    })

  it('C11-D58: gitFloorsAllowed refuses a release below a floor that the run’s commit holds, and allows one above it', async () => {
    const allowed = gitFloorsAllowed(floorRepo, fat(4))
    expect(await allowed(fat(1), fat(4))).toBe(false)
    expect(await allowed(fat(3), fat(4))).toBe(true)
    // Read at f[1], before the floor, nothing is refused: the run's commit decides.
    expect(await allowed(fat(1), fat(1))).toBe(true)
    // Main is the commit the gate gives (the run's): floors read at a commit that isn't on it are
    // refused before they are read, so no floors.ts off main is ever imported.
    await expect(gitFloorsAllowed(floorRepo, fat(3))(fat(1), fat(4))).rejects.toThrow(`${fat(4)} is not on ${fat(3)}`)
  })

  it('C11-D58: the gate’s plan reads them for a deploy’s previous releases, a rollback and a drill-smoke’s previous', async () => {
    // A deploy: non-prod's previous (f[3]) above the floor, prod's (f[1]) below it.
    const deploy = floorInput({
      records: {
        nonprod: records('nonprod', deployment(301, 'nonprod', fat(3), D.c, 1)),
        prod: records('prod', deployment(401, 'prod', fat(1), D.a, 1)),
      },
    })
    expect(await outputsOf(deploy)).toMatchObject({
      previous_nonprod_commit: fat(3),
      rollback_nonprod: 'true',
      previous_prod_commit: fat(1),
      rollback_prod: 'false',
    })
    // A rollback to f[1] crosses the floor; one to f[3] doesn't.
    const recorded = {
      nonprod: records(
        'nonprod',
        deployment(301, 'nonprod', fat(1), D.a, 1),
        deployment(302, 'nonprod', fat(3), D.c, 2),
        deployment(303, 'nonprod', fat(4), D.d, 3),
      ),
      prod: [],
    }
    expect(await refusalOf(floorDispatch({ mode: 'rollback', release: fat(1) }, { records: recorded }))).toBe(
      'floor-crossed',
    )
    expect(await refusalOf(floorDispatch({ mode: 'rollback', release: fat(3) }, { records: recorded }))).toBe('allowed')
    // A drill-smoke whose previous release is f[1] crosses it; one whose previous is f[3] doesn't.
    const below = {
      nonprod: records(
        'nonprod',
        deployment(301, 'nonprod', fat(1), D.a, 1),
        deployment(303, 'nonprod', fat(4), D.d, 3),
      ),
      prod: [],
    }
    expect(await refusalOf(floorDispatch({ mode: 'drill-smoke' }, { records: below }))).toBe('floor-crossed')
    expect(await outputsOf(floorDispatch({ mode: 'drill-smoke' }, { records: recorded }))).toMatchObject({
      previous_nonprod_commit: fat(3),
      rollback_nonprod: 'true',
    })
  })

  it('C11-D58: the gate refuses a deploy while an environment runs a release older than a floor’s expansion, and prod-gate refuses it again', async () => {
    // Non-prod at f[3], above the floor; prod at f[0], before y's expansion: the migrate step would drop y
    // under prod's release, and a failed Services deploy's own rollback would return it there.
    const before = {
      nonprod: records('nonprod', deployment(301, 'nonprod', fat(3), D.c, 1)),
      prod: records('prod', deployment(401, 'prod', fat(0), D.a, 1)),
    }
    expect(await refusalOf(floorInput({ records: before }))).toBe('expansion-not-deployed')
    // A dispatch to non-prod alone checks non-prod alone; non-prod before the expansion is refused too.
    expect(await refusalOf(floorDispatch({}, { records: before }))).toBe('allowed')
    const nonprodBefore = { nonprod: records('nonprod', deployment(301, 'nonprod', fat(0), D.a, 1)), prod: [] }
    expect(await refusalOf(floorDispatch({}, { records: nonprodBefore }))).toBe('expansion-not-deployed')
    // At the expansion (f[1]) prod may be deployed over, though below the floor its automatic rollback
    // can't run; and a first deploy has no release to check.
    const atExpansion = { ...before, prod: records('prod', deployment(401, 'prod', fat(1), D.b, 1)) }
    expect(await outputsOf(floorInput({ records: atExpansion }))).toMatchObject({
      previous_prod_commit: fat(1),
      rollback_prod: 'false',
    })
    expect(await refusalOf(floorInput({ records: { ...before, prod: [] } }))).toBe('allowed')
    // prod-gate reads prod's records afresh: one that went back before the expansion since the gate read
    // them is refused there.
    const gate = {
      mode: 'deploy',
      target: 'prod',
      sha: fat(4),
      commit: fat(4),
      digest: '',
      recordId: '401',
      buildDigest: D.d,
      nonprodDigest: D.d,
      isAncestor: gitIsAncestor(floorRepo),
      floorsAllowed: gitFloorsAllowed(floorRepo, fat(4)),
      expansionsMet: gitExpansionsMet(floorRepo, fat(4)),
    }
    expect(await prodGate({ ...gate, records: before.prod })).toEqual({ ok: false, reason: 'expansion-not-deployed' })
    expect(await prodGate({ ...gate, records: atExpansion.prod })).toEqual({
      ok: true,
      value: { current_prod_id: '401' },
    })
    // The same from the command line, every answer git's in the floors repository.
    const folder = join(scratch, 'expansion-records')
    const checks = writeJson(join(scratch, 'expansion-checks.json'), floorInput().checks)
    writeJson(join(folder, 'release-nonprod.json'), [deployment(301, 'nonprod', fat(3), D.c, 1)])
    writeJson(join(folder, 'release-prod.json'), [deployment(401, 'prod', fat(0), D.a, 1)])
    const push = ['--event', 'push', '--target', '', '--mode', '', '--release', '', '--restore', '']
    const plan = [
      ...['plan', '--ref', 'refs/heads/main', '--actor', 'a-person', '--triggering-actor', 'a-person'],
      ...['--sha', fat(4), ...push, '--records', folder, '--checks', checks, '--repo', floorRepo],
    ]
    const refused = {
      code: 1,
      out: [`history: refused expansion-not-deployed: ${REFUSALS['expansion-not-deployed']}`],
      err: [],
    }
    expect(await cli(plan, DOMAINS_OK)).toEqual(refused)
    const prodGateArgs = [
      ...['prod-gate', '--mode', 'deploy', '--target', 'prod', '--sha', fat(4), '--commit', fat(4), '--digest', ''],
      ...['--record-id', '401', '--build-digest', D.d, '--nonprod-digest', D.d, '--records', folder],
      ...['--repo', floorRepo],
    ]
    expect(await cli(prodGateArgs)).toEqual(refused)
    writeJson(join(folder, 'release-prod.json'), [deployment(401, 'prod', fat(1), D.b, 1)])
    expect((await cli(plan, DOMAINS_OK)).out).toEqual(
      expect.arrayContaining([`previous_prod_commit=${fat(1)}`, 'rollback_prod=false']),
    )
    expect(await cli(prodGateArgs)).toEqual({ code: 0, out: ['current_prod_id=401'], err: [] })
  })

  it('C11-D58: prod-gate reads them for a rollback, in process and from the command line', async () => {
    const prodRecords = records(
      'prod',
      deployment(401, 'prod', fat(1), D.a, 1),
      deployment(402, 'prod', fat(3), D.c, 2),
      deployment(403, 'prod', fat(4), D.d, 3),
    )
    const rollback = {
      mode: 'rollback',
      target: 'prod',
      sha: fat(4),
      recordId: '403',
      buildDigest: '',
      nonprodDigest: '',
      records: prodRecords,
      isAncestor: gitIsAncestor(floorRepo),
      floorsAllowed: gitFloorsAllowed(floorRepo, fat(4)),
      expansionsMet: gitExpansionsMet(floorRepo, fat(4)),
    }
    expect(await prodGate({ ...rollback, commit: fat(1), digest: D.a })).toEqual({ ok: false, reason: 'floor-crossed' })
    expect(await prodGate({ ...rollback, commit: fat(3), digest: D.c })).toEqual({
      ok: true,
      value: { current_prod_id: '403' },
    })
    const folder = join(scratch, 'floor-records')
    writeJson(join(folder, 'release-prod.json'), [
      deployment(401, 'prod', fat(1), D.a, 1),
      deployment(402, 'prod', fat(3), D.c, 2),
      deployment(403, 'prod', fat(4), D.d, 3),
    ])
    const gate = (commitSha: string, digest: string) => [
      'prod-gate',
      ...['--mode', 'rollback', '--target', 'prod', '--sha', fat(4), '--commit', commitSha, '--digest', digest],
      ...['--record-id', '403', '--build-digest', '', '--nonprod-digest', '', '--records', folder, '--repo', floorRepo],
    ]
    expect(await cli(gate(fat(1), D.a))).toEqual({
      code: 1,
      out: [`history: refused floor-crossed: ${REFUSALS['floor-crossed']}`],
      err: [],
    })
    expect(await cli(gate(fat(3), D.c))).toEqual({ code: 0, out: ['current_prod_id=403'], err: [] })
  })
})

describe('C11-D61, T24 item 23: the commit the database was migrated by', () => {
  it('C11-D61: none with no migration record, the newest commit otherwise', () => {
    expect(migrated([])).toBe('none')
    expect(
      migrated([
        { id: 3, commit: at(1) },
        { id: 9, commit: at(2) },
      ]),
    ).toBe(at(2))
  })
})

// The command line in process, against files in the scratch folder: its stdout and stderr lines. plan
// checks the committed DOMAINS unless domains are given.
async function cli(
  argv: readonly string[],
  domains?: readonly string[],
): Promise<{ code: number; out: string[]; err: string[] }> {
  let out = ''
  let err = ''
  const code = await main(argv, {
    write: text => (out += text),
    warn: text => (err += text),
    readText: path => readFileSync(path, 'utf8'),
    cwd: repo,
    ...(domains === undefined ? {} : { domains }),
  })
  const lines = (text: string) => text.split('\n').filter(line => line !== '')
  return { code, out: lines(out), err: lines(err) }
}

function writeJson(path: string, value: unknown): string {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(value))
  return path
}

// What the gate saves for plan in the scratch folder: non-prod at m[6] after m[4] and m[5], prod at m[4]
// after m[3], and the pull request checks of m[6]; and the plan command line for one run of it, a
// dispatch to non-prod unless the fields say otherwise.
function planFiles() {
  const folder = join(scratch, 'plan-records')
  writeJson(join(folder, 'release-nonprod.json'), [
    deployment(101, 'nonprod', at(4), D.d, 1),
    deployment(102, 'nonprod', at(5), D.e, 2),
    deployment(103, 'nonprod', at(6), D.f, 3),
  ])
  writeJson(join(folder, 'release-prod.json'), [
    deployment(201, 'prod', at(3), D.c, 1),
    deployment(202, 'prod', at(4), D.d, 2),
  ])
  const checks = writeJson(join(scratch, 'plan-checks.json'), GOOD_CHECKS())
  return { folder, checks }
}

function planArgs(folder: string, fields: Record<string, string> = {}): string[] {
  const all: Record<string, string> = {
    event: 'workflow_dispatch',
    ref: 'refs/heads/main',
    actor: 'a-person',
    'triggering-actor': 'a-person',
    sha: at(6),
    target: 'nonprod',
    mode: 'deploy',
    release: '',
    restore: 'none',
    records: folder,
    ...fields,
  }
  return ['plan', ...Object.entries(all).flatMap(([name, value]) => [`--${name}`, value])]
}

const PUSH = { event: 'push', target: '', mode: '', release: '', restore: '' }

// The lines plan prints for an input, every output in order.
const planLines = (outputs: Record<string, string>) => PLAN_OUTPUTS.map(key => `${key}=${outputs[key] ?? ''}`)

describe('C11-D58, C11-D61: the command line', () => {
  it('C11-D58: each subcommand prints its lines, and refuses or names bad input in one line', async () => {
    const folder = join(scratch, 'records')
    writeJson(join(folder, 'release-nonprod.json'), [
      deployment(101, 'nonprod', at(4), D.d, 1),
      deployment(102, 'nonprod', at(5), D.e, 2),
      { ...deployment(103, 'nonprod', at(5), D.e, 3), payload: 'not an object' },
    ])
    writeJson(join(folder, 'release-prod.json'), [deployment(202, 'prod', at(4), D.d, 2)])
    const migratedFile = writeJson(join(scratch, 'migrated.json'), [
      { id: 4, task: 'hearth-migrated', environment: 'prod', payload: { schema: 1, commit: at(3) } },
    ])
    const empty = writeJson(join(scratch, 'empty.json'), [])
    const push = [
      'plan',
      ...['--event', 'push', '--ref', 'refs/heads/main', '--actor', 'a-person', '--triggering-actor', 'a-person'],
      ...['--sha', at(6), '--target', '', '--mode', '', '--release', '', '--restore', '', '--records', folder],
    ]
    // With the committed DOMAINS: refused while they hold a placeholder, and once they hold the owner's
    // names, refused for want of the pull request checks this run didn't save.
    const refusal = Object.values(DOMAINS).some(isPlaceholderDomain) ? 'domains-placeholder' : 'pr-not-found'
    expect(await cli(push)).toEqual({
      code: 1,
      out: [`history: refused ${refusal}: ${REFUSALS[refusal]}`],
      err: ['history: ignored hearth-release record 103 in nonprod: its payload fails validation'],
    })
    expect(await cli(['migrated', '--records', empty])).toEqual({ code: 0, out: ['none'], err: [] })
    expect(await cli(['migrated', '--records', migratedFile, '--env', 'prod'])).toEqual({
      code: 0,
      out: [`commit ${at(3)}`],
      err: [],
    })
    const nonprodRecords = join(folder, 'release-nonprod.json')
    expect(
      await cli(['choose', '--env', 'nonprod', '--records', nonprodRecords, '--current', `${at(5)}:${D.e}`]),
    ).toEqual({
      code: 0,
      out: [
        `commit ${at(4)}`,
        `digest ${D.d}`,
        'api hearth-nonprod-api:1',
        'realtime hearth-nonprod-realtime:1',
        'worker hearth-nonprod-worker:1',
      ],
      err: ['history: ignored hearth-release record 103 in nonprod: its payload fails validation'],
    })
    const validate = ['validate', '--env', 'nonprod', '--records', nonprodRecords, '--current', `${at(4)}:${D.d}`]
    expect((await cli([...validate, '--target', at(5)])).out).toEqual([
      `history: refused recorded-after-current: ${REFUSALS['recorded-after-current']}`,
    ])
    const gate = [
      'prod-gate',
      ...['--mode', 'deploy', '--target', 'prod', '--sha', at(6), '--commit', at(6), '--digest', ''],
      ...['--record-id', '202', '--build-digest', D.f, '--nonprod-digest', D.f, '--records', folder],
    ]
    expect((await cli(gate)).out).toEqual(['current_prod_id=202'])
    // --nonprod-digest reaches its input: the image non-prod pushed differing from the build's is refused.
    const otherImage = gate.map((arg, i) => (gate[i - 1] === '--nonprod-digest' ? D.e : arg))
    expect(await cli(otherImage)).toEqual({
      code: 1,
      out: [`history: refused digest-differs: ${REFUSALS['digest-differs']}`],
      err: [],
    })
    const rollbackGate = [
      'prod-gate',
      ...['--mode', 'rollback', '--target', 'prod', '--sha', at(6), '--commit', at(4), '--digest', D.d],
      ...['--record-id', '202', '--build-digest', '', '--nonprod-digest', '', '--records', folder],
    ]
    expect((await cli(rollbackGate)).out).toEqual(['current_prod_id=202'])
    // --target reaches its input: a restore passes on the record the gate read, and only on it.
    const restoreGate = (recordId: string) => [
      'prod-gate',
      ...['--mode', 'deploy', '--target', 'restore', '--sha', at(6), '--commit', at(4), '--digest', D.d],
      ...['--record-id', recordId, '--build-digest', '', '--nonprod-digest', '', '--records', folder],
    ]
    expect(await cli(restoreGate('202'))).toEqual({ code: 0, out: ['current_prod_id=202'], err: [] })
    expect((await cli(restoreGate('201'))).out).toEqual([
      `history: refused record-changed: ${REFUSALS['record-changed']}`,
    ])
    // --env reaches choose and validate: prod's records read as prod's, with prod's task definitions.
    const prodHistory = writeJson(join(folder, 'release-prod-history.json'), [
      deployment(201, 'prod', at(3), D.c, 1),
      deployment(202, 'prod', at(4), D.d, 2),
      deployment(102, 'nonprod', at(4), D.e, 3),
    ])
    const prodChoice = {
      code: 0,
      out: [
        `commit ${at(3)}`,
        `digest ${D.c}`,
        'api hearth-prod-api:1',
        'realtime hearth-prod-realtime:1',
        'worker hearth-prod-worker:1',
      ],
      err: [],
    }
    const onProd = ['--env', 'prod', '--records', prodHistory, '--current', `${at(4)}:${D.d}`]
    expect(await cli(['choose', ...onProd])).toEqual(prodChoice)
    expect(await cli(['validate', ...onProd, '--target', at(3)])).toEqual(prodChoice)
    // Bad input: one line naming it, exit 2.
    expect(await cli([])).toMatchObject({ code: 2, out: [expect.stringMatching(/^history: the command is not /)] })
    expect(await cli(['choose', '--env', 'staging'])).toMatchObject({
      code: 2,
      out: ['history: --env is not nonprod or prod'],
    })
    expect(
      await cli(['choose', '--env', 'prod', '--records', join(scratch, 'missing.json'), '--current', 'x']),
    ).toMatchObject({
      code: 2,
      out: ["history: --records can't be read"],
    })
    expect(await cli(['plan', '--records', join(scratch, 'nowhere')])).toMatchObject({
      code: 2,
      out: ['history: --event is missing'],
    })
    expect(await cli(['migrated', '--records', empty, '--colour', 'red'])).toMatchObject({
      code: 2,
      out: ['history: --colour is not an option'],
    })
  })

  it('C11-D58: a failure it didn’t expect is one line, `history: failed`, and exit 1, never the error’s message', async () => {
    const empty = writeJson(join(scratch, 'failed', 'empty.json'), [])
    // An output that throws the first time it's written to: the error isn't one the command names.
    let out = ''
    let writes = 0
    const code = await main(['migrated', '--records', empty], {
      write: text => {
        writes += 1
        if (writes === 1) throw new Error(`stdout closed ${ACCOUNT}`)
        out += text
      },
      warn: () => undefined,
      readText: path => readFileSync(path, 'utf8'),
      cwd: repo,
    })
    expect([code, out]).toEqual([1, 'history: failed\n'])
  })

  it('C11-D58: choose and validate name a commit the clone lacks, never reading it as a release that isn’t older', async () => {
    // A clone behind main: the current release's commit, a target or a chosen record's commit isn't in it.
    const missing = 'e'.repeat(40)
    const file = writeJson(join(scratch, 'behind', 'release-nonprod.json'), [
      deployment(101, 'nonprod', at(4), D.d, 1),
      deployment(102, 'nonprod', at(5), D.e, 2),
    ])
    const notInClone = { code: 2, out: [`history: ${missing} is not in this clone`], err: [] }
    const ask = (command: string, current: string, ...rest: string[]) =>
      cli([command, '--env', 'nonprod', '--records', file, '--current', current, ...rest])
    expect(await ask('choose', `${missing}:${D.f}`)).toEqual(notInClone)
    expect(await ask('validate', `${missing}:${D.f}`, '--target', at(4))).toEqual(notInClone)
    expect(await ask('validate', `${at(5)}:${D.e}`, '--target', missing)).toEqual(notInClone)
    const chosenMissing = writeJson(join(scratch, 'behind', 'release-chosen.json'), [
      deployment(101, 'nonprod', missing, D.d, 1),
      deployment(102, 'nonprod', at(5), D.e, 2),
    ])
    expect(
      await cli(['choose', '--env', 'nonprod', '--records', chosenMissing, '--current', `${at(5)}:${D.e}`]),
    ).toEqual(notInClone)
    // In the clone, the same choice and check pass.
    expect((await ask('choose', `${at(5)}:${D.e}`)).out[0]).toBe(`commit ${at(4)}`)
    expect((await ask('validate', `${at(5)}:${D.e}`, '--target', at(4))).code).toBe(0)
  })

  it('C11-D58: choose-ecs takes every digest of the current commit', async () => {
    const pages = join(scratch, 'pages-rebuilt')
    // R1, then two builds of R2 (D.b, then D.c, which runs).
    const entries: ReadonlyArray<readonly [number, string, number]> = [
      [10, D.a, 1],
      [20, D.b, 2],
      [30, D.c, 3],
    ]
    for (const role of ['api', 'realtime', 'worker']) {
      writeJson(join(pages, `${role}-deployments-1.json`), {
        next: null,
        deployments: entries.map(([when], i) => [new Date(when * minute).toISOString(), revisionArn(role, i + 1)]),
      })
      writeJson(
        join(pages, `${role}-revisions-1.json`),
        entries.map(([, digest, revision], i) => [revisionArn(role, i + 1), taskDefinitionArn(role, revision), digest]),
      )
    }
    expect(await cli(['choose-ecs', '--pages', pages, '--current-digest', `${D.b},${D.c}`])).toEqual({
      code: 0,
      out: [`digest ${D.a}`, 'api hearth-prod-api:1', 'realtime hearth-prod-realtime:1', 'worker hearth-prod-worker:1'],
      err: [],
    })
    for (const bad of ['', `${D.b},`, `${D.b},sha256:x`]) {
      expect(await cli(['choose-ecs', '--pages', pages, '--current-digest', bad])).toEqual({
        code: 2,
        out: ['history: --current-digest is not a list of digests'],
        err: [],
      })
    }
  })

  it('C11-D58: choose-ecs refuses an api’s pages that hold the worker’s, as a mistyped --service would save them', async () => {
    const pages = join(scratch, 'pages-mixed')
    rmSync(pages, { recursive: true, force: true })
    const entries: ReadonlyArray<readonly [number, string, number]> = [
      [10, D.b, 2],
      [20, D.c, 3],
    ]
    for (const role of ['api', 'realtime', 'worker']) {
      // The api's files hold the worker's deployments and revisions.
      const saved = role === 'api' ? 'worker' : role
      writeJson(join(pages, `${role}-deployments-1.json`), {
        next: null,
        deployments: entries.map(([when], i) => [new Date(when * minute).toISOString(), revisionArn(saved, i + 1)]),
      })
      writeJson(
        join(pages, `${role}-revisions-1.json`),
        entries.map(([, digest, revision], i) => [
          revisionArn(saved, i + 1),
          taskDefinitionArn(saved, revision),
          digest,
        ]),
      )
    }
    expect(await cli(['choose-ecs', '--pages', pages, '--current-digest', D.c])).toEqual({
      code: 2,
      out: ["history: a api revision's task definition isn't one of hearth's"],
      err: [],
    })
  })

  it('C11-D49, C11-D58: plan’s command line past DOMAINS: every flag, the checks file, git’s trees, ancestry and floors, and every line it prints', async () => {
    const { folder, checks } = planFiles()
    const plan = (fields: Record<string, string>) => cli(planArgs(folder, fields), DOMAINS_OK)
    const nonprodRecords = records(
      'nonprod',
      deployment(101, 'nonprod', at(4), D.d, 1),
      deployment(102, 'nonprod', at(5), D.e, 2),
      deployment(103, 'nonprod', at(6), D.f, 3),
    )
    const prodRecords = records('prod', deployment(201, 'prod', at(3), D.c, 1), deployment(202, 'prod', at(4), D.d, 2))
    // A push with its pull request's checks: every line, as the gate writes them to its outputs.
    const push = await plan({ ...PUSH, checks })
    expect(push).toEqual({
      code: 0,
      out: planLines({
        mode: 'deploy',
        target: 'prod',
        restore: 'none',
        commit: at(6),
        digest: '',
        build: 'true',
        nonprod: 'true',
        prod: 'true',
        current_nonprod: `${at(6)}:${D.f}`,
        current_nonprod_id: '103',
        current_prod: `${at(4)}:${D.d}`,
        current_prod_id: '202',
        previous_nonprod_commit: at(6),
        previous_nonprod_digest: D.f,
        previous_prod_commit: at(4),
        previous_prod_digest: D.d,
        rollback_nonprod: 'true',
        rollback_prod: 'true',
        first_nonprod: 'false',
        first_prod: 'false',
      }),
      err: [],
    })
    // The gate's own check of each line.
    expect(push.out.filter(line => !/^[a-z_]+=[0-9a-z:._-]*$/.test(line))).toEqual([])
    // Each flag reaches its input: another event, a ref off main, a bot as the actor or as the triggering
    // actor (the other a person), no checks file, a head tree git doesn't give the commit, and a release
    // off main are each refused, on a push the same flags otherwise pass.
    const refused = (reason: keyof typeof REFUSALS) => ({
      code: 1,
      out: [`history: refused ${reason}: ${REFUSALS[reason]}`],
      err: [],
    })
    expect(await plan({ ...PUSH, checks, event: 'workflow_run' })).toEqual(refused('bad-event'))
    expect(await plan({ ...PUSH, checks, ref: 'refs/heads/side' })).toEqual(refused('not-main'))
    expect(await plan({ ...PUSH, checks, actor: 'github-actions[bot]' })).toEqual(refused('bot-actor'))
    expect(await plan({ ...PUSH, checks, 'triggering-actor': 'github-actions[bot]' })).toEqual(refused('bot-actor'))
    expect(await plan({ ...PUSH, checks: join(scratch, 'no-checks.json') })).toEqual(refused('pr-not-found'))
    const otherTree = writeJson(join(scratch, 'plan-checks-tree.json'), {
      ...GOOD_CHECKS(),
      headTree: git(['rev-parse', `${at(5)}^{tree}`]),
    })
    expect(await plan({ ...PUSH, checks: otherTree })).toEqual(refused('pr-tree-differs'))
    expect(await plan({ mode: 'rollback', release: branch })).toEqual(refused('off-main'))
    // --repo is where git answers (the command's folder otherwise): a folder outside any clone knows
    // no commit, so the current releases read as off main.
    expect(await plan({ ...PUSH, checks, repo: scratch })).toEqual(refused('off-main'))
    // A rollback, a drill and a restore print what plan decides for the same input in process.
    const same = {
      records: { nonprod: nonprodRecords, prod: prodRecords },
      floorsAllowed: gitFloorsAllowed(repo, at(6)),
    }
    const runs: Array<[Record<string, string>, PlanInput]> = [
      [{ mode: 'rollback', release: at(4) }, dispatch({ mode: 'rollback', release: at(4) }, same)],
      [
        { target: 'prod', mode: 'rollback', release: at(3) },
        dispatch({ target: 'prod', mode: 'rollback', release: at(3) }, same),
      ],
      [{ mode: 'drill-break' }, dispatch({ mode: 'drill-break' }, same)],
      [{ mode: 'drill-smoke' }, dispatch({ mode: 'drill-smoke' }, same)],
      [{ target: 'restore', restore: 'up' }, dispatch({ target: 'restore', restore: 'up' }, same)],
      [{ target: 'restore', restore: 'down' }, dispatch({ target: 'restore', restore: 'down' }, same)],
    ]
    for (const [fields, input] of runs) {
      expect(await plan(fields), JSON.stringify(fields)).toEqual({
        code: 0,
        out: planLines(await outputsOf(input)),
        err: [],
      })
    }
    expect((await plan({ mode: 'drill-smoke' })).out).toEqual(
      expect.arrayContaining([
        `commit=${at(6)}`,
        `previous_nonprod_commit=${at(5)}`,
        `previous_nonprod_digest=${D.e}`,
        'rollback_nonprod=true',
      ]),
    )
  })

  it('C11-D58: choose-ecs reads break-glass’s saved pages, every page to the one whose next is null', async () => {
    const pages = join(scratch, 'pages')
    const history: Record<string, ReadonlyArray<readonly [number, string, number]>> = {
      api: [
        [10, D.b, 2],
        [20, D.c, 3],
        [30, D.d, 4],
        [31, D.c, 5],
      ],
      realtime: [
        [10, D.b, 2],
        [20, D.c, 3],
      ],
      worker: [
        [10, D.b, 2],
        [20, D.c, 3],
      ],
    }
    for (const [role, entries] of Object.entries(history)) {
      const rows = entries.map(([when], i) => [new Date(when * minute).toISOString(), revisionArn(role, i + 1)])
      // The api's in two pages, the first naming a next token.
      const split = role === 'api' ? [rows.slice(0, 2), rows.slice(2)] : [rows]
      for (const [i, page] of split.entries()) {
        writeJson(join(pages, `${role}-deployments-${i + 1}.json`), {
          next: i === split.length - 1 ? null : 'token',
          deployments: page,
        })
      }
      writeJson(
        join(pages, `${role}-revisions-1.json`),
        entries.map(([, digest, revision], i) => [revisionArn(role, i + 1), taskDefinitionArn(role, revision), digest]),
      )
    }
    expect(await cli(['choose-ecs', '--pages', pages, '--current-digest', D.c])).toEqual({
      code: 0,
      out: [`digest ${D.b}`, 'api hearth-prod-api:2', 'realtime hearth-prod-realtime:2', 'worker hearth-prod-worker:2'],
      err: [],
    })
    expect(
      (await cli(['choose-ecs', '--pages', pages, '--current-digest', D.c, '--drill', 'hearth-prod-realtime:2'])).out,
    ).toEqual([`history: refused drill-revision: ${REFUSALS['drill-revision']}`])
    // A last page that still names a next token: pages are missing.
    writeJson(join(pages, 'worker-deployments-1.json'), { next: 'token', deployments: [] })
    expect(await cli(['choose-ecs', '--pages', pages, '--current-digest', D.c])).toMatchObject({
      code: 2,
      out: ["history: worker's deployment pages don't end where next is null"],
    })
  })

  it('C11-D58: choose-ecs reads pages saved newest first, the newest on page 1, as it reads them in time order', async () => {
    // R1, R2, then R3 (current), the same for each role, in two pages: page 1 holds R3 and R2.
    const pages = join(scratch, 'pages-newest-first')
    const entries: ReadonlyArray<readonly [number, string, number]> = [
      [30, D.c, 3],
      [20, D.b, 2],
      [10, D.a, 1],
    ]
    for (const role of ['api', 'realtime', 'worker']) {
      const rows = entries.map(([when, , revision]) => [
        new Date(when * minute).toISOString(),
        revisionArn(role, revision),
      ])
      writeJson(join(pages, `${role}-deployments-1.json`), { next: 'token', deployments: rows.slice(0, 2) })
      writeJson(join(pages, `${role}-deployments-2.json`), { next: null, deployments: rows.slice(2) })
      writeJson(
        join(pages, `${role}-revisions-1.json`),
        entries.map(([, digest, revision]) => [revisionArn(role, revision), taskDefinitionArn(role, revision), digest]),
      )
    }
    expect(await cli(['choose-ecs', '--pages', pages, '--current-digest', D.c])).toEqual({
      code: 0,
      out: [`digest ${D.b}`, 'api hearth-prod-api:2', 'realtime hearth-prod-realtime:2', 'worker hearth-prod-worker:2'],
      err: [],
    })
  })

  it('C11-D58: choose-ecs refuses a gap in the deployment pages and a deployment whose revision wasn’t saved, never choosing past them', async () => {
    // R1, R2, then R3 (current), the same for each role, one deployment a page.
    const entries: ReadonlyArray<readonly [number, string, number]> = [
      [10, D.a, 1],
      [20, D.b, 2],
      [30, D.c, 3],
    ]
    // Each role's pages in a folder of their own: [page number, entry] pairs, only the last page's next
    // null, and one revisions page holding the entries' revisions given.
    const save = (name: string, pageEntries: ReadonlyArray<readonly [number, number]>, saved = [0, 1, 2]) => {
      const folder = join(scratch, name)
      rmSync(folder, { recursive: true, force: true })
      for (const role of ['api', 'realtime', 'worker']) {
        for (const [i, [n, entry]] of pageEntries.entries()) {
          const [when = 0] = entries[entry] ?? []
          writeJson(join(folder, `${role}-deployments-${n}.json`), {
            next: i === pageEntries.length - 1 ? null : `token${n}`,
            deployments: [[new Date(when * minute).toISOString(), revisionArn(role, entry + 1)]],
          })
        }
        const revisions = saved.map(entry => {
          const [, digest = '', revision = 0] = entries[entry] ?? []
          return [revisionArn(role, entry + 1), taskDefinitionArn(role, revision), digest]
        })
        writeJson(join(folder, `${role}-revisions-1.json`), revisions)
      }
      return ['choose-ecs', '--pages', folder, '--current-digest', D.c]
    }
    // Every page and revision saved: the release before R3's first, R2.
    expect(
      await cli(
        save('pages-whole', [
          [1, 0],
          [2, 1],
          [3, 2],
        ]),
      ),
    ).toEqual({
      code: 0,
      out: [`digest ${D.b}`, 'api hearth-prod-api:2', 'realtime hearth-prod-realtime:2', 'worker hearth-prod-worker:2'],
      err: [],
    })
    // Page 2 (R2's) missing, the pages still ending where next is null: refused, never R1, two back.
    const gap = { code: 2, out: ["history: --pages lacks api's deployment pages, numbered from 1"], err: [] }
    expect(
      await cli(
        save('pages-gap', [
          [1, 0],
          [3, 2],
        ]),
      ),
    ).toEqual(gap)
    // Pages that don't start at 1.
    expect(
      await cli(
        save('pages-from-2', [
          [2, 1],
          [3, 2],
        ]),
      ),
    ).toEqual(gap)
    // R2's deployment saved but not its revision: refused, never choosing R1 from what's left.
    expect(
      await cli(
        save(
          'pages-no-revision',
          [
            [1, 0],
            [2, 1],
            [3, 2],
          ],
          [0, 2],
        ),
      ),
    ).toEqual({ code: 2, out: ["history: a api deployment's revision isn't in its pages"], err: [] })
  })

  it('C11-D61: no output line of any subcommand holds an ARN, a 12-digit run outside a commit or digest, or an IPv4 address', async () => {
    // Its own files, in a folder of its own: non-prod's records with an ignored one holding an ARN,
    // prod's, a migration record, and break-glass's pages, whose rows hold ARNs as the CLI saves them.
    const own = join(scratch, 'no-output')
    rmSync(own, { recursive: true, force: true })
    const withArn = deployment(104, 'nonprod', at(5), D.e, 4)
    ;(withArn.payload as { services: Record<string, string> }).services.api = taskDefinitionArn('api', 4)
    const folder = join(own, 'records')
    const nonprodFile = writeJson(join(folder, 'release-nonprod.json'), [
      deployment(101, 'nonprod', at(4), D.d, 1),
      deployment(102, 'nonprod', at(5), D.e, 2),
      withArn,
    ])
    writeJson(join(folder, 'release-prod.json'), [deployment(202, 'prod', at(4), D.d, 2)])
    const migratedFile = writeJson(join(own, 'migrated.json'), [
      { id: 4, task: 'hearth-migrated', environment: 'prod', payload: { schema: 1, commit: at(3) } },
    ])
    const pages = join(own, 'pages')
    const entries: ReadonlyArray<readonly [number, string, number]> = [
      [10, D.b, 2],
      [20, D.c, 3],
    ]
    for (const role of ['api', 'realtime', 'worker']) {
      writeJson(join(pages, `${role}-deployments-1.json`), {
        next: null,
        deployments: entries.map(([when], i) => [new Date(when * minute).toISOString(), revisionArn(role, i + 1)]),
      })
      writeJson(
        join(pages, `${role}-revisions-1.json`),
        entries.map(([, digest, revision], i) => [revisionArn(role, i + 1), taskDefinitionArn(role, revision), digest]),
      )
    }
    const gateArgs = (target: string, commitSha: string, digest: string, build: string) => [
      'prod-gate',
      ...['--mode', 'deploy', '--target', target, '--sha', at(6), '--commit', commitSha, '--digest', digest],
      ...['--record-id', '202', '--build-digest', build, '--nonprod-digest', build, '--records', folder],
    ]
    // Each run's exit code and first line, so a missing file or a usage error never stands in for what
    // the subcommand prints.
    const runs: Array<[string[], number, string]> = [
      [['choose', '--env', 'nonprod', '--records', nonprodFile, '--current', `${at(5)}:${D.e}`], 0, `commit ${at(4)}`],
      [
        ['validate', '--env', 'nonprod', '--records', nonprodFile, '--current', `${at(5)}:${D.e}`, '--target', at(4)],
        0,
        `commit ${at(4)}`,
      ],
      [['choose-ecs', '--pages', pages, '--current-digest', D.c], 0, `digest ${D.b}`],
      [
        ['choose-ecs', '--pages', pages, '--current-digest', D.a],
        1,
        `history: refused none-qualifies: ${REFUSALS['none-qualifies']}`,
      ],
      [['migrated', '--records', migratedFile], 0, `commit ${at(3)}`],
      [gateArgs('prod', at(6), '', D.f), 0, 'current_prod_id=202'],
      [gateArgs('restore', at(4), D.d, ''), 0, 'current_prod_id=202'],
    ]
    const printed: string[] = []
    for (const [argv, code, first] of runs) {
      const { code: exit, out, err } = await cli(argv)
      expect([exit, out[0]], argv.join(' ')).toEqual([code, first])
      printed.push(...out, ...err)
    }
    // The record ignored for its ARN is named by its id alone, once for each command that read it.
    const ignored = 'history: ignored hearth-release record 104 in nonprod: its payload fails validation'
    expect(printed.filter(line => line === ignored)).toHaveLength(2)
    // The plan's lines in every mode, as the command prints them once DOMAINS holds real names.
    const plans = planFiles()
    const modes: Array<Record<string, string>> = [
      { ...PUSH, checks: plans.checks },
      { checks: plans.checks },
      { mode: 'rollback', release: at(4) },
      { target: 'prod', mode: 'rollback', release: at(3) },
      { mode: 'drill-break' },
      { mode: 'drill-smoke' },
      { target: 'restore', restore: 'up' },
      { target: 'restore', restore: 'down' },
    ]
    for (const fields of modes) {
      const { code, out, err } = await cli(planArgs(plans.folder, fields), DOMAINS_OK)
      expect(code, JSON.stringify(fields)).toBe(0)
      printed.push(...out, ...err)
    }
    expect(printed.length).toBeGreaterThan(runs.length + modes.length * PLAN_OUTPUTS.length)
    const stripped = printed.map(line => line.replace(/sha256:[0-9a-f]{64}/g, '').replace(/\b[0-9a-f]{40}\b/g, ''))
    expect(
      stripped.filter(line => /arn:/i.test(line) || /\d{12}/.test(line) || /\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(line)),
    ).toEqual([])
  })
})
