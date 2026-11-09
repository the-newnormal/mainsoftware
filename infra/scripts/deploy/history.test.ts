// The release history's cases (C11-D58, C11-D61; TECH-SPEC T24 items 22 and 23): the records'
// validation and order, both incident-rollback rules and their parity, a target's validation, the
// gate's plan mode by mode, prod-gate, the migration record, and what the command line prints. The
// commits are real ones in a scratch git repository (main, and a branch off it), so ancestry is git's
// own answer; every ARN, account id and address is built from parts at run time (IG-01). It holds what
// the history must decide, so it is on the owner's-read list (C11-D74).
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { REGION } from '../../src/config/profiles.ts'
import {
  chooseFromEcs,
  chooseFromRecords,
  current,
  type EcsHistory,
  gitIsAncestor,
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

function git(args: readonly string[], cwd = repo): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=hearth-test', '-c', `user.email=${EMAIL}`, '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
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
    domains: DOMAINS_OK,
    ...overrides,
  }
}

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
  it('C11-D61: keeps a good record, refuses an ARN, a long revision, an extra key and a string payload, and never reads a per-job deployment', () => {
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
      ],
      'prod',
    )
    expect(parsed.records.map(record => record.id)).toEqual([11, 17, 18])
    expect(parsed.ignored).toEqual([12, 13, 14, 15, 16, 19, 20])
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

  it('C11-D61: orders records by the api revision, the deployment id breaking a tie, and reads the migration and restore records', () => {
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
      ],
      'prod',
    )
    expect(migrations).toEqual({
      records: [
        { id: 3, commit: at(1) },
        { id: 9, commit: at(2) },
      ],
      ignored: [10],
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
    ])
    expect(restores).toEqual({ records: [{ id: 5, kind: 'up', commit: at(4), digest: D.d }], ignored: [6] })
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
    expect(chooseFromRecords(history, { commit: at(2), digest: D.f }, isAncestor)).toEqual({
      ok: false,
      reason: 'not-an-ancestor',
    })
    expect(chooseFromRecords(history, { commit: at(1), digest: D.f }, isAncestor)).toEqual({
      ok: false,
      reason: 'not-an-ancestor',
    })
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
    // Live with no record (D.f): R3, recorded, but not strictly older than a live m2.
    expect(validateTarget(h, { commit: at(2), digest: D.f }, at(3), isAncestor)).toEqual({
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
    expect(chooseFromEcs(pages, D.c)).toEqual({
      ok: true,
      value: {
        digest: D.b,
        services: { api: 'hearth-prod-api:2', realtime: 'hearth-prod-realtime:2', worker: 'hearth-prod-worker:2' },
      },
    })
    // The pages come in no promised order.
    const shuffled = { ...pages, api: { ...pages.api, deployments: [...pages.api.deployments].reverse() } }
    expect(chooseFromEcs(shuffled, D.c)).toEqual(chooseFromEcs(pages, D.c))
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
    expect(chooseFromEcs(disagree, D.c)).toEqual({ ok: false, reason: 'services-disagree' })
    expect(chooseFromEcs(sameForAll([[20, D.c, 3]]), D.c)).toEqual({ ok: false, reason: 'none-qualifies' })
    expect(chooseFromEcs(sameForAll([[20, D.b, 2]]), D.c)).toEqual({ ok: false, reason: 'none-qualifies' })
    const pages = sameForAll([
      [10, D.b, 2],
      [20, D.c, 3],
    ])
    expect(chooseFromEcs(pages, D.c, new Set(['hearth-prod-realtime:2']))).toEqual({
      ok: false,
      reason: 'drill-revision',
    })
    expect(chooseFromEcs(pages, D.c, new Set(['hearth-prod-realtime:3']))).toMatchObject({ ok: true })
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
    const pages = sameForAll([
      [10, D.a, 1],
      [20, D.b, 2],
      [30, D.c, 3],
      [40, D.d, 4],
      [50, D.c, 5],
    ])
    const fromRecords = chooseFromRecords(history, { commit: at(3), digest: D.c }, isAncestor)
    const fromEcs = chooseFromEcs(pages, D.c)
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
    const chosen = chooseFromEcs(pages, D.b)
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

  it('C11-D59: drill-break runs non-prod’s current release; drill-smoke adds the release before it as the previous', async () => {
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
    expect(await outputsOf(dispatch({ mode: 'drill-smoke' }))).toMatchObject({
      mode: 'drill-smoke',
      commit: at(5),
      digest: D.e,
      previous_nonprod_commit: at(4),
      previous_nonprod_digest: D.d,
      rollback_nonprod: 'true',
    })
    // The drill's previous is chooseFromRecords' choice: after a rollback to R2, the release before R2.
    const rolledBack = records(
      'nonprod',
      deployment(1, 'nonprod', at(1), D.a, 1),
      deployment(2, 'nonprod', at(2), D.b, 2),
      deployment(3, 'nonprod', at(3), D.c, 3),
      deployment(4, 'nonprod', at(2), D.b, 4, 'rollback'),
    )
    const input = dispatch({ mode: 'drill-smoke' }, { records: { nonprod: rolledBack, prod: [] } })
    expect(await outputsOf(input)).toMatchObject({ commit: at(2), previous_nonprod_commit: at(1) })
    expect(await refusalOf(dispatch({ mode: 'drill-smoke' }, { floorsAllowed: () => false }))).toBe('floor-crossed')
    const single = { nonprod: records('nonprod', deployment(1, 'nonprod', at(1), D.a, 1)), prod: [] }
    expect(await refusalOf(dispatch({ mode: 'drill-smoke' }, { records: single }))).toBe('no-earlier-release')
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
    expect(await refusalOf(dispatch({ mode: 'drill-smoke' }, { records: recordedBranch }))).toBe('off-main')
    // A previous release that isn't strictly older than its current one.
    const backwards = records(
      'nonprod',
      deployment(101, 'nonprod', at(5), D.e, 1),
      deployment(102, 'nonprod', at(4), D.d, 2),
    )
    expect(await refusalOf(dispatch({ mode: 'drill-smoke' }, { records: { nonprod: backwards, prod } }))).toBe(
      'previous-not-older',
    )
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
  })

  it('C11-D52: a deploy descends from prod’s newest record and deploys the image non-prod deployed', async () => {
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

// The command line in process, against files in the scratch folder: its stdout and stderr lines.
async function cli(argv: readonly string[]): Promise<{ code: number; out: string[]; err: string[] }> {
  let out = ''
  let err = ''
  const code = await main(argv, {
    write: text => (out += text),
    warn: text => (err += text),
    readText: path => readFileSync(path, 'utf8'),
    cwd: repo,
  })
  const lines = (text: string) => text.split('\n').filter(line => line !== '')
  return { code, out: lines(out), err: lines(err) }
}

function writeJson(path: string, value: unknown): string {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(value))
  return path
}

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
    // The repository still holds DOMAINS's placeholders, so a real plan stops there.
    expect(await cli(push)).toEqual({
      code: 1,
      out: [`history: refused domains-placeholder: ${REFUSALS['domains-placeholder']}`],
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
    const rollbackGate = [
      'prod-gate',
      ...['--mode', 'rollback', '--target', 'prod', '--sha', at(6), '--commit', at(4), '--digest', D.d],
      ...['--record-id', '202', '--build-digest', '', '--nonprod-digest', '', '--records', folder],
    ]
    expect((await cli(rollbackGate)).out).toEqual(['current_prod_id=202'])
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

  it('C11-D61: no output line of any subcommand holds an ARN, a 12-digit run outside a commit or digest, or an IPv4 address', async () => {
    const folder = join(scratch, 'records')
    const pages = join(scratch, 'pages')
    writeJson(join(pages, 'worker-deployments-1.json'), {
      next: null,
      deployments: [
        [new Date(10 * minute).toISOString(), revisionArn('worker', 1)],
        [new Date(20 * minute).toISOString(), revisionArn('worker', 2)],
      ],
    })
    const runs = [
      [
        'plan',
        '--event',
        'push',
        '--ref',
        'refs/heads/main',
        '--actor',
        'a',
        '--triggering-actor',
        'a',
        '--sha',
        at(6),
      ],
      ['choose', '--env', 'nonprod', '--records', join(folder, 'release-nonprod.json'), '--current', `${at(5)}:${D.e}`],
      ['choose-ecs', '--pages', pages, '--current-digest', D.c],
      ['choose-ecs', '--pages', pages, '--current-digest', D.a],
      [
        'validate',
        '--env',
        'nonprod',
        '--records',
        join(folder, 'release-nonprod.json'),
        '--current',
        `${at(5)}:${D.e}`,
        '--target',
        at(4),
      ],
      ['migrated', '--records', join(scratch, 'migrated.json')],
      ['prod-gate', '--mode', 'restore'],
      [
        'prod-gate',
        ...['--mode', 'deploy', '--target', 'prod', '--sha', at(6), '--commit', at(6), '--digest', ''],
        ...['--record-id', '202', '--build-digest', D.f, '--nonprod-digest', D.f, '--records', folder],
      ],
    ]
    const printed: string[] = []
    for (const argv of runs) {
      const { out, err } = await cli(argv)
      printed.push(...out, ...err)
    }
    expect(printed).toContain('current_prod_id=202')
    // The plan's lines in every mode, as the command prints them once DOMAINS holds real names.
    const inputs = [
      planInput(),
      dispatch({}),
      dispatch({ mode: 'rollback', release: at(4) }),
      dispatch({ target: 'prod', mode: 'rollback', release: at(3) }),
      dispatch({ mode: 'drill-break' }),
      dispatch({ mode: 'drill-smoke' }),
      dispatch({ target: 'restore', restore: 'up' }),
      dispatch({ target: 'restore', restore: 'down' }),
    ]
    for (const input of inputs) {
      const outputs = await outputsOf(input)
      printed.push(...PLAN_OUTPUTS.map(key => `${key}=${outputs[key]}`))
    }
    expect(printed.length).toBeGreaterThan(runs.length + inputs.length * PLAN_OUTPUTS.length)
    const stripped = printed.map(line => line.replace(/sha256:[0-9a-f]{64}/g, '').replace(/\b[0-9a-f]{40}\b/g, ''))
    expect(
      stripped.filter(line => /arn:/i.test(line) || /\d{12}/.test(line) || /\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(line)),
    ).toEqual([])
  })
})
