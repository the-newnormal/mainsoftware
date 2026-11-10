// The release history (C11-D58, C11-D61; TECH-SPEC T24 items 22 and 23). The deploy pipeline's records
// are GitHub deployments of three tasks: `hearth-release` (a release that passed its smoke, or the
// pipeline's rollback to one, with its commit, digest, migratedCommit and each service's task
// definition as family:revision), `hearth-migrated` (the commit a migrate step applied) and
// `hearth-restore` (the restore stage brought up or down). Only .github/workflows/deploy.yml writes
// them, and anything with Deployments write could add one, so this reads them as data: a record of
// one of those tasks whose payload fails validation is ignored and named by its id, and GitHub's own
// per-job deployments (task `deploy`) are never read. A release record exists only for a release that
// passed, so no status is read. Release records are ordered by the api service's task definition
// revision, which every recorded deploy and rollback raises, since a record job runs outside the
// deploy concurrency group and a later run's record can land first; the deployment id breaks a tie.
//
// It decides, for the workflow's gate, what a run deploys and whether its automatic rollback may run
// (plan), re-checks that before prod's approval (prod-gate), and for break-glass's incident rollback
// chooses the release to go back to from the records (choose) or, while GitHub is down, from ECS's
// saved deployments (choose-ecs), and checks a choice (validate). It imports no npm package (IG-08):
// the gate and prod-gate run it without npm ci. It prints commits, digests, family:revision, ids and
// reason codes, never an ARN or an address. It decides which rollbacks are safe, so it is on the
// owner's-read list (C11-D74). A rebuild of one commit holds the same code under a new digest (the image
// isn't reproducible), so the release that ran before the current one is found by its commit: every
// build of the current commit counts as the current release.
//
//   node infra/scripts/deploy/history.ts plan --event <e> --ref <r> --actor <a> --triggering-actor <a>
//     --sha <commit> --target <t> --mode <m> --release <commit or ''> --restore <r> --records <dir>
//     [--checks <file>] [--repo <dir>]
//   node infra/scripts/deploy/history.ts prod-gate --mode <m> --target <prod|restore> --sha <commit>
//     --commit <commit> --digest <digest or ''> --record-id <id or ''> --build-digest <d or ''>
//     --nonprod-digest <d or ''> --records <dir> [--repo <dir>]
//   node infra/scripts/deploy/history.ts choose --env <env> --records <file> --current <commit>:<digest>
//   node infra/scripts/deploy/history.ts validate --env <env> --records <file> --current <commit>:<digest>
//     --target <commit> [--repo <dir>]
//   node infra/scripts/deploy/history.ts choose-ecs --pages <dir> --current-digest <digest>,…
//     [--drill <family:revision>,…]
//   node infra/scripts/deploy/history.ts migrated --records <file> [--env <env>]
//
// plan and prod-gate print key=value lines for $GITHUB_OUTPUT; the others print `commit <40 hex>`,
// `digest sha256:<64 hex>` and `<role> <family:revision>` lines (migrated: `commit <40 hex>` or `none`).
// choose-ecs takes every digest ECR tags with the current commit (`sha-<commit>-*`), the running one
// among them. A refusal is one line, `history: refused <code>: <why>`, and exit 1; input it can't use
// (a commit choose or validate needs that the clone lacks among it) is one line naming it, and exit 2.
// An ignored record is one line on stderr. The records folder holds what the gate saves, one `gh api`
// answer a file: release-nonprod.json, release-prod.json (and migrated-nonprod.json, migrated-prod.json
// and restore-prod.json, which plan doesn't read).
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DOMAINS, isPlaceholderDomain } from '../../src/config/profiles.ts'
import { checkFloors, FloorsError, readFlags, resolveCommit } from './floors-check.ts'

export const RECORD_ENVIRONMENTS = ['nonprod', 'prod'] as const
export type RecordEnvironment = (typeof RECORD_ENVIRONMENTS)[number]
export const SERVICE_ROLES = ['api', 'realtime', 'worker'] as const
export type ServiceRole = (typeof SERVICE_ROLES)[number]
export const RELEASE_KINDS = ['deploy', 'rollback', 'pipeline-rollback'] as const
export type ReleaseKind = (typeof RELEASE_KINDS)[number]
export const MODES = ['deploy', 'rollback', 'drill-break', 'drill-smoke'] as const
export type Mode = (typeof MODES)[number]
export const TARGETS = ['nonprod', 'prod', 'restore'] as const
export type Target = (typeof TARGETS)[number]
export const RESTORES = ['none', 'up', 'down'] as const
export type Restore = (typeof RESTORES)[number]

const COMMIT = /^[0-9a-f]{40}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const RELEASE = /^([0-9a-f]{40}):(sha256:[0-9a-f]{64})$/
const TASK_DEFINITION = (env: string, role: ServiceRole) => new RegExp(`^hearth-${env}-${role}:[1-9][0-9]{0,5}$`)

// A release: the commit it was built from and its image's digest.
export interface Release {
  commit: string
  digest: string
}

export interface ReleaseRecord extends Release {
  id: number
  kind: ReleaseKind
  migratedCommit: string | null
  // Each service's task definition, family:revision.
  services: Readonly<Record<ServiceRole, string>>
}

export interface MigrationRecord {
  id: number
  commit: string
}

export interface RestoreRecord extends Release {
  id: number
  kind: 'up' | 'down'
}

// What a parse kept, in order, and the ids of the records of its task it ignored.
export interface Parsed<T> {
  records: T[]
  ignored: number[]
}

// Input this can't use. The message names the input, never its value.
export class HistoryInputError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))

export const releaseText = (release: Release) => `${release.commit}:${release.digest}`

export function parseRelease(text: string): Release | undefined {
  const match = RELEASE.exec(text)
  return match?.[1] === undefined || match[2] === undefined ? undefined : { commit: match[1], digest: match[2] }
}

// Whether a payload holds anything a record never carries: an ARN anywhere (in any case), or a run of
// 12 digits outside its commits and digest, the shape of an account id.
function carriesIdentifying(payload: Record<string, unknown>): boolean {
  const hex = new Set(['commit', 'digest', 'migratedCommit'])
  const walk = (value: unknown, exempt: boolean): boolean => {
    if (typeof value === 'string') return /arn:/i.test(value) || (!exempt && /\d{12}/.test(value))
    if (typeof value === 'number') return /\d{12}/.test(String(value))
    if (Array.isArray(value)) return value.some(item => walk(item, false))
    if (isRecord(value)) {
      return Object.entries(value).some(([key, item]) => /arn:/i.test(key) || walk(item, false))
    }
    return false
  }
  return Object.entries(payload).some(([key, value]) => /arn:/i.test(key) || walk(value, hex.has(key)))
}

// The deployments a `GET /repos/{r}/deployments` answer holds: an array of them, or the array of pages
// `gh api --paginate --slurp` writes.
function deploymentsOf(json: unknown): unknown[] {
  if (!Array.isArray(json)) throw new HistoryInputError('the records are not a list of deployments')
  if (json.length > 0 && json.every(Array.isArray)) return json.flat()
  if (json.some(Array.isArray)) throw new HistoryInputError('the records are not a list of deployments')
  return json
}

// Each deployment of the task and environment, its payload read by `payload` (undefined when it fails
// validation, and then its id is ignored).
function parseDeployments<T>(
  json: unknown,
  task: string,
  environment: string | undefined,
  payload: (value: Record<string, unknown>, environment: string) => Omit<T, 'id'> | undefined,
): Parsed<T> {
  const records: T[] = []
  const ignored: number[] = []
  for (const deployment of deploymentsOf(json)) {
    if (!isRecord(deployment) || deployment.task !== task) continue
    const env = deployment.environment
    if (typeof env !== 'string' || (environment !== undefined ? env !== environment : !isRecordEnvironment(env))) {
      continue
    }
    const id = deployment.id
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
      throw new HistoryInputError('a deployment has no id')
    }
    const raw = deployment.payload
    const parsed = isRecord(raw) && !carriesIdentifying(raw) ? payload(raw, env) : undefined
    if (parsed === undefined) ignored.push(id)
    else records.push({ ...parsed, id } as T)
  }
  return { records, ignored }
}

const isRecordEnvironment = (value: string): value is RecordEnvironment =>
  (RECORD_ENVIRONMENTS as readonly string[]).includes(value)

function releasePayload(payload: Record<string, unknown>, env: string): Omit<ReleaseRecord, 'id'> | undefined {
  if (!hasKeys(payload, ['schema', 'kind', 'commit', 'digest', 'migratedCommit', 'services'])) return undefined
  const { schema, kind, commit, digest, migratedCommit, services } = payload
  if (schema !== 1) return undefined
  if (typeof kind !== 'string' || !(RELEASE_KINDS as readonly string[]).includes(kind)) return undefined
  if (typeof commit !== 'string' || !COMMIT.test(commit)) return undefined
  if (typeof digest !== 'string' || !DIGEST.test(digest)) return undefined
  if (migratedCommit !== null && (typeof migratedCommit !== 'string' || !COMMIT.test(migratedCommit))) return undefined
  if (!isRecord(services) || !hasKeys(services, SERVICE_ROLES)) return undefined
  const roles: Partial<Record<ServiceRole, string>> = {}
  for (const role of SERVICE_ROLES) {
    const value = services[role]
    if (typeof value !== 'string' || !TASK_DEFINITION(env, role).test(value)) return undefined
    roles[role] = value
  }
  return {
    kind: kind as ReleaseKind,
    commit,
    digest,
    migratedCommit,
    services: roles as Record<ServiceRole, string>,
  }
}

// The api service's revision, by which release records are ordered.
const apiRevision = (record: ReleaseRecord) => Number(record.services.api.split(':')[1])

// An environment's release records, in the order releases were recorded (the api revision, then the
// deployment id). The record's `ref` is `main` and is never read for the commit: the payload's is.
export function parseReleaseRecords(json: unknown, environment: RecordEnvironment): Parsed<ReleaseRecord> {
  const parsed = parseDeployments<ReleaseRecord>(json, 'hearth-release', environment, releasePayload)
  parsed.records.sort((a, b) => apiRevision(a) - apiRevision(b) || a.id - b.id)
  return parsed
}

// An environment's migration records (or every environment's, with none named), by deployment id.
export function parseMigrationRecords(json: unknown, environment?: RecordEnvironment): Parsed<MigrationRecord> {
  const parsed = parseDeployments<MigrationRecord>(json, 'hearth-migrated', environment, payload => {
    if (!hasKeys(payload, ['schema', 'commit']) || payload.schema !== 1) return undefined
    return typeof payload.commit === 'string' && COMMIT.test(payload.commit) ? { commit: payload.commit } : undefined
  })
  parsed.records.sort((a, b) => a.id - b.id)
  return parsed
}

// Prod's restore records, by deployment id.
export function parseRestoreRecords(json: unknown): Parsed<RestoreRecord> {
  const parsed = parseDeployments<RestoreRecord>(json, 'hearth-restore', 'prod', payload => {
    if (!hasKeys(payload, ['schema', 'kind', 'commit', 'digest']) || payload.schema !== 1) return undefined
    const { kind, commit, digest } = payload
    if (kind !== 'up' && kind !== 'down') return undefined
    if (typeof commit !== 'string' || !COMMIT.test(commit)) return undefined
    if (typeof digest !== 'string' || !DIGEST.test(digest)) return undefined
    return { kind, commit, digest }
  })
  parsed.records.sort((a, b) => a.id - b.id)
  return parsed
}

// The newest record, or undefined.
export function current<T>(records: readonly T[]): T | undefined {
  return records.at(-1)
}

// The newest migration record's commit, or `none`.
export function migrated(records: readonly MigrationRecord[]): string {
  return current(records)?.commit ?? 'none'
}

export type IsAncestor = (ancestor: string, descendant: string) => boolean

// Strictly older on main: an ancestor and not the same commit (a rebuild of one commit holds the same
// code, so going back to it changes nothing).
export const strictlyOlder = (older: string, newer: string, isAncestor: IsAncestor) =>
  older !== newer && isAncestor(older, newer)

// Why a release can't be chosen or deployed, as a code a log line carries.
export const REFUSALS = {
  'bad-event': 'the run is neither a push nor a dispatch',
  'not-main': 'the run is not on refs/heads/main',
  'bot-actor': 'a bot started or re-ran the run',
  'bad-input': 'an input is malformed',
  'bad-target': 'target is not nonprod, prod or restore',
  'bad-mode': 'mode is not deploy, rollback, drill-break or drill-smoke',
  'bad-restore': 'restore is not none, up or down',
  'bad-release': 'release is not a 40-hex commit',
  'drill-not-nonprod': 'a drill runs on nonprod alone',
  'drill-not-forward':
    "non-prod's newest release is not a forward deploy of the run's commit: deploy it to non-prod first",
  'restore-misnamed': 'restore up or down goes with target restore and mode deploy, and only then',
  'release-unexpected': 'release is given only for a rollback',
  'release-missing': 'a rollback needs a release',
  'domains-placeholder': "DOMAINS still holds a placeholder: a real release waits for the owner's names (C11-Q08)",
  'pr-not-found': 'no merged pull request to main produced this commit',
  'pr-tree-differs': "the commit's tree differs from its pull request's head",
  'pr-checks-failed': "the pull request's check and migrations jobs did not both succeed",
  'off-main': "a commit the run would use is not on main at the run's commit",
  'no-release': 'the environment has no release record',
  'not-recorded': 'the release has no release record in the environment',
  'not-on-main': "the release is not on main at the run's commit",
  'floor-crossed': 'a rollback floor lies between the release and the database',
  'no-earlier-release': 'no release ran before the current one',
  'not-an-ancestor': 'the release is not strictly older than the current one',
  'previous-not-older': 'the previous release is not strictly older than the current one',
  'same-digest': 'the release is the one running now',
  'recorded-after-current': 'the release was first recorded after the current one',
  'older-than-prod': 'prod already runs a release this commit does not descend from',
  'digest-differs': 'the image is not the one the run built and non-prod deployed',
  'record-changed': "prod's release records changed since the gate read them",
  'none-qualifies': "a service has no successful deployment before the current release's first",
  'services-disagree': 'the three services come to different releases',
  'drill-revision': "a chosen task definition is a drill's",
} as const
export type Refusal = keyof typeof REFUSALS

export type Outcome<T> = { ok: true; value: T } | { ok: false; reason: Refusal }
const ok = <T>(value: T): Outcome<T> => ({ ok: true, value })
const no = <T = never>(reason: Refusal): Outcome<T> => ({ ok: false, reason })

// The index of the current release's oldest record: the oldest of any build of its commit (or of a
// record naming its digest under another commit, which only a forged record would), or -1 for none.
const firstOfCurrent = (records: readonly ReleaseRecord[], release: Release) =>
  records.findIndex(record => record.commit === release.commit || record.digest === release.digest)

// The release to go back to while GitHub can be read (break-glass's incident rollback, and the drill's
// previous release): the one that ran before the current release first did, which is the record just
// before the oldest record of the current commit, never simply the one before the newest (after R1, R2,
// R3 and a rollback to R2 the records read R1 R2 R3 R2, and the one before the newest is R3), and never
// an earlier build of the current commit (after R1 and two builds of R2 the records read R1 R2 R2, and
// the record before the newest build is the same code). When the current commit has no record (its
// smoke failed and its rollback didn't run, or its record failed to write), the newest record, which
// must be strictly older than the current commit.
export function chooseFromRecords(
  records: readonly ReleaseRecord[],
  release: Release,
  isAncestor: IsAncestor,
): Outcome<ReleaseRecord> {
  const first = firstOfCurrent(records, release)
  if (first === -1) {
    const newest = current(records)
    if (newest === undefined) return no('no-earlier-release')
    return strictlyOlder(newest.commit, release.commit, isAncestor) ? ok(newest) : no('not-an-ancestor')
  }
  const chosen = records[first - 1]
  return chosen === undefined ? no('no-earlier-release') : ok(chosen)
}

// The newest record of a commit.
const newestOf = (records: readonly ReleaseRecord[], commit: string) =>
  records.findLast(record => record.commit === commit)

// The gate's and prod-gate's check of a rollback's target, what the records can show: recorded in
// the environment (its newest record gives the digest and the services) and on main at the run's
// commit. What runs now is the deploy job's to check (its digest not the running one, its commit
// strictly older), since a release whose smoke failed and whose rollback didn't run is live with no
// record.
export function recordedTarget(
  records: readonly ReleaseRecord[],
  targetCommit: string,
  runCommit: string,
  isAncestor: IsAncestor,
): Outcome<ReleaseRecord> {
  const record = newestOf(records, targetCommit)
  if (record === undefined) return no('not-recorded')
  return isAncestor(targetCommit, runCommit) ? ok(record) : no('not-on-main')
}

// The incident procedure's check of a chosen release against the current one (read from the Services
// stack's Release output): recorded, not the running digest, not first recorded after the current
// release's first record (its commit's, when that has one), and strictly older than the current commit.
export function validateTarget(
  records: readonly ReleaseRecord[],
  release: Release,
  targetCommit: string,
  isAncestor: IsAncestor,
): Outcome<ReleaseRecord> {
  const record = newestOf(records, targetCommit)
  if (record === undefined) return no('not-recorded')
  if (record.digest === release.digest) return no('same-digest')
  const currentFirst = firstOfCurrent(records, release)
  const targetFirst = records.findIndex(each => each.digest === record.digest)
  if (currentFirst !== -1 && targetFirst > currentFirst) return no('recorded-after-current')
  return strictlyOlder(targetCommit, release.commit, isAncestor) ? ok(record) : no('not-an-ancestor')
}

// One service's history as break-glass saves it from ECS while GitHub is down: its successful
// deployments (when each finished, in ms, and the service revision it deployed) and those revisions
// (their task definition, as an ARN or family:revision, and image digest).
export interface EcsHistory {
  deployments: ReadonlyArray<{ finishedAt: number; revision: string }>
  revisions: ReadonlyArray<{ revision: string; taskDefinition: string; digest: string }>
}

// A task definition as family:revision: an ARN cut to its last segment, checked to be the role's.
export function familyRevision(taskDefinition: string, role: ServiceRole): string {
  const last = taskDefinition.slice(taskDefinition.lastIndexOf('/') + 1)
  if (!new RegExp(`^hearth-[a-z]+-${role}:[1-9][0-9]{0,5}$`).test(last)) {
    throw new HistoryInputError(`a ${role} revision's task definition isn't one of hearth's`)
  }
  return last
}

// The release to go back to while GitHub is down, from each service's saved ECS deployments: the
// newest successful deployment that finished before the oldest one whose image is the current release,
// never simply the newest whose image isn't current (a release CloudFormation rolled back can leave one
// service with a successful deployment of it after the current release's first). ECS knows digests,
// not commits, so the current release is every digest ECR tags with the current commit, the one that
// runs among them: an earlier build of the same commit is the same code, as chooseFromRecords has it.
// All three services must come to the same digest, and none to a task definition the caller marks as a
// drill's (LOG_LEVEL drill). Past ECS's 90 days the oldest listed deployment of the current release can
// be a later return to it, so the person then checks the choice is strictly older (validate, or git).
export function chooseFromEcs(
  pages: Readonly<Record<ServiceRole, EcsHistory>>,
  currentDigests: ReadonlySet<string>,
  drill: ReadonlySet<string> = new Set(),
): Outcome<{ digest: string; services: Record<ServiceRole, string> }> {
  const chosen: Partial<Record<ServiceRole, { digest: string; taskDefinition: string }>> = {}
  for (const role of SERVICE_ROLES) {
    const { deployments, revisions } = pages[role]
    const byRevision = new Map(revisions.map(revision => [revision.revision, revision]))
    const history = deployments
      .map(deployment => {
        const revision = byRevision.get(deployment.revision)
        if (revision === undefined) throw new HistoryInputError(`a ${role} deployment's revision isn't in its pages`)
        return { finishedAt: deployment.finishedAt, digest: revision.digest, taskDefinition: revision.taskDefinition }
      })
      .sort((a, b) => a.finishedAt - b.finishedAt)
    const firstCurrent = history.find(entry => currentDigests.has(entry.digest))
    if (firstCurrent === undefined) return no('none-qualifies')
    const before = history.filter(entry => entry.finishedAt < firstCurrent.finishedAt).at(-1)
    if (before === undefined) return no('none-qualifies')
    chosen[role] = { digest: before.digest, taskDefinition: familyRevision(before.taskDefinition, role) }
  }
  const digests = new Set(SERVICE_ROLES.map(role => chosen[role]?.digest))
  const [digest] = digests
  if (digests.size !== 1 || digest === undefined) return no('services-disagree')
  const services = Object.fromEntries(SERVICE_ROLES.map(role => [role, chosen[role]?.taskDefinition ?? ''])) as Record<
    ServiceRole,
    string
  >
  if (SERVICE_ROLES.some(role => drill.has(services[role]))) return no('drill-revision')
  return ok({ digest, services })
}

// What the gate saves of the pull request that produced a pushed commit (deploy.yml's gate writes it
// from `gh api`): the merged pull request with base main whose merge commit is the run's (pull null
// when there is none), its head's tree, and the conclusions of its ci.yml run's `check` and
// `migrations` jobs.
export interface PullChecks {
  pull: number | null
  base: string
  mergeCommit: string
  headTree: string
  check: string
  migrations: string
}

export function parsePullChecks(json: unknown): PullChecks {
  if (!isRecord(json) || !hasKeys(json, ['pull', 'base', 'mergeCommit', 'headTree', 'check', 'migrations'])) {
    throw new HistoryInputError('--checks is not the pull request checks')
  }
  const { pull, base, mergeCommit, headTree, check, migrations } = json
  if (pull !== null && (typeof pull !== 'number' || !Number.isSafeInteger(pull) || pull < 1)) {
    throw new HistoryInputError('--checks is not the pull request checks')
  }
  for (const value of [base, mergeCommit, headTree, check, migrations]) {
    if (typeof value !== 'string') throw new HistoryInputError('--checks is not the pull request checks')
  }
  return { pull, base, mergeCommit, headTree, check, migrations } as PullChecks
}

export interface PlanInput {
  event: string
  ref: string
  actor: string
  triggeringActor: string
  // The run's commit: the pushed commit, or main's head for a dispatch.
  sha: string
  // The dispatch's inputs, each '' on a push.
  target: string
  mode: string
  release: string
  restore: string
  records: Readonly<Record<RecordEnvironment, readonly ReleaseRecord[]>>
  checks: PullChecks | undefined
  treeOf: (commit: string) => string | undefined
  isAncestor: IsAncestor
  // Whether a rollback to the target crosses no floor, the floors read at floorsAt (floors-check.ts).
  floorsAllowed: (target: string, floorsAt: string) => boolean | Promise<boolean>
  domains: readonly string[]
}

// The gate's outputs, every one always set ('' or 'false' where it doesn't apply).
export const PLAN_OUTPUTS = [
  'mode',
  'target',
  'restore',
  'commit',
  'digest',
  'build',
  'nonprod',
  'prod',
  'current_nonprod',
  'current_nonprod_id',
  'current_prod',
  'current_prod_id',
  'previous_nonprod_commit',
  'previous_nonprod_digest',
  'previous_prod_commit',
  'previous_prod_digest',
  'rollback_nonprod',
  'rollback_prod',
  'first_nonprod',
  'first_prod',
] as const
export type PlanOutputs = Record<(typeof PLAN_OUTPUTS)[number], string>

const isOneOf = <T extends string>(list: readonly T[], value: string): value is T =>
  (list as readonly string[]).includes(value)

// The dispatch's inputs checked one by one and then together (a push is a deploy to prod, with every
// input empty).
function readInputs(input: PlanInput): Outcome<{ target: Target; mode: Mode; release: string; restore: Restore }> {
  if (input.event === 'push') {
    if ([input.target, input.mode, input.release, input.restore].some(value => value !== '')) return no('bad-input')
    return ok({ target: 'prod', mode: 'deploy', release: '', restore: 'none' })
  }
  const { target, mode, release, restore } = input
  if (!isOneOf(TARGETS, target)) return no('bad-target')
  if (!isOneOf(MODES, mode)) return no('bad-mode')
  if (!isOneOf(RESTORES, restore)) return no('bad-restore')
  if (release !== '' && !COMMIT.test(release)) return no('bad-release')
  if (mode.startsWith('drill-') && target !== 'nonprod') return no('drill-not-nonprod')
  if (restore !== 'none' && target !== 'restore') return no('restore-misnamed')
  if (target === 'restore' && (restore === 'none' || mode !== 'deploy')) return no('restore-misnamed')
  if (release !== '' && mode !== 'rollback') return no('release-unexpected')
  if (mode === 'rollback' && release === '') return no('release-missing')
  return ok({ target, mode, release, restore })
}

// What the gate decides (C11-D49, C11-D58; TECH-SPEC T24 item 20): who started the run and where,
// the inputs, DOMAINS, for a deploy the pull request that produced the commit, and from the records
// each environment's current release, the release to deploy, and each deployed environment's previous
// release with whether its automatic rollback may run (above every floor at the run's commit). Every
// commit it outputs is on main at the run's commit (an ancestor of it), so no code off main is checked
// out or run, whatever a record names. An environment's current release here is its newest release
// record when the gate read it, which is what runs unless a release went live unrecorded or another run
// deployed since; only the deploy job, reading AWS, can see that (AWS_CHECK). A deploy's previous
// release is that current release, which may be an earlier build of the run's own commit (a dispatch
// after a rejected approval); a drill-smoke's is the one that ran before the current commit first did,
// and must be strictly older.
export async function plan(input: PlanInput): Promise<Outcome<PlanOutputs>> {
  if (input.event !== 'push' && input.event !== 'workflow_dispatch') return no('bad-event')
  if (input.ref !== 'refs/heads/main') return no('not-main')
  if (input.actor === '' || input.triggeringActor === '' || !COMMIT.test(input.sha)) return no('bad-input')
  if (input.actor.endsWith('[bot]') || input.triggeringActor.endsWith('[bot]')) return no('bot-actor')
  const read = readInputs(input)
  if (!read.ok) return read
  const { target, mode, release, restore } = read.value
  if (input.domains.some(isPlaceholderDomain)) return no('domains-placeholder')
  const { sha, isAncestor } = input

  const nonprod = target === 'nonprod' || (target === 'prod' && mode === 'deploy')
  const prod = target === 'prod' || target === 'restore'
  const outputs: PlanOutputs = Object.fromEntries(PLAN_OUTPUTS.map(key => [key, ''])) as PlanOutputs
  Object.assign(outputs, {
    mode,
    target,
    restore,
    build: String(mode === 'deploy' && target !== 'restore'),
    nonprod: String(nonprod),
    prod: String(prod),
    rollback_nonprod: 'false',
    rollback_prod: 'false',
    first_nonprod: 'false',
    first_prod: 'false',
  })

  // Each deployed environment's current release, which must be on main.
  const currents: Partial<Record<RecordEnvironment, ReleaseRecord>> = {}
  for (const env of RECORD_ENVIRONMENTS) {
    if (env === 'nonprod' ? !nonprod : !prod) continue
    const newest = current(input.records[env])
    if (newest === undefined) {
      if (mode !== 'deploy' || target === 'restore') return no('no-release')
      outputs[`first_${env}` as const] = 'true'
      continue
    }
    if (!isAncestor(newest.commit, sha)) return no('off-main')
    currents[env] = newest
    outputs[`current_${env}` as const] = releaseText(newest)
    outputs[`current_${env}_id` as const] = String(newest.id)
  }

  if (mode === 'deploy' && target !== 'restore') {
    const checks = input.checks
    if (checks === undefined || checks.pull === null || checks.base !== 'main' || checks.mergeCommit !== sha) {
      return no('pr-not-found')
    }
    const tree = input.treeOf(sha)
    if (tree === undefined || tree !== checks.headTree) return no('pr-tree-differs')
    if (checks.check !== 'success' || checks.migrations !== 'success') return no('pr-checks-failed')
    outputs.commit = sha
    // Each deployed environment's previous release is its newest record (none on its first deploy),
    // which may be this very commit's earlier build; its automatic rollback runs only above every floor.
    for (const env of RECORD_ENVIRONMENTS) {
      const previous = currents[env]
      if (previous === undefined) continue
      outputs[`previous_${env}_commit` as const] = previous.commit
      outputs[`previous_${env}_digest` as const] = previous.digest
      outputs[`rollback_${env}` as const] = String(await input.floorsAllowed(previous.commit, sha))
    }
    return ok(outputs)
  }

  if (mode === 'rollback') {
    const env = target as RecordEnvironment
    if (!isAncestor(release, sha)) return no('off-main')
    const recorded = recordedTarget(input.records[env], release, sha, isAncestor)
    if (!recorded.ok) return recorded
    if (!(await input.floorsAllowed(release, sha))) return no('floor-crossed')
    outputs.commit = recorded.value.commit
    outputs.digest = recorded.value.digest
    return ok(outputs)
  }

  // A drill runs non-prod's current release, a restore prod's.
  const running = currents[target === 'restore' ? 'prod' : 'nonprod']
  if (running === undefined) return no('no-release')
  outputs.commit = running.commit
  outputs.digest = running.digest
  if (mode === 'drill-smoke') {
    // Its deploy path deploys Platform, Data and Tasks from the release's own assembly, so the release
    // must be the one a forward deploy left them at: a deploy of the run's commit, main's head. After a
    // rollback (which deploys Tasks and Services alone), or a forward deploy that moved Platform and
    // Data and then failed with no record, they are newer than non-prod's newest record, and the drill
    // would take them back.
    if (running.kind !== 'deploy' || running.commit !== sha) return no('drill-not-forward')
    const chosen = chooseFromRecords(input.records.nonprod, running, isAncestor)
    if (!chosen.ok) return chosen
    const previous = chosen.value
    if (!isAncestor(previous.commit, sha)) return no('off-main')
    // The chooser never takes a build of the running commit, so an ancestor of the run's commit is
    // strictly older than it; this keeps the rule whatever the chooser becomes.
    if (!strictlyOlder(previous.commit, running.commit, isAncestor)) return no('previous-not-older')
    if (!(await input.floorsAllowed(previous.commit, sha))) return no('floor-crossed')
    outputs.previous_nonprod_commit = previous.commit
    outputs.previous_nonprod_digest = previous.digest
    outputs.rollback_nonprod = 'true'
  }
  return ok(outputs)
}

export interface ProdGateInput {
  // The gate's outputs: the mode and target, the run's commit, and the release's commit and digest.
  mode: string
  target: string
  sha: string
  commit: string
  digest: string
  // The id of prod's newest release record when the gate read it ('' when there was none).
  recordId: string
  // The digest the build made and the one the nonprod job pushed (deploy only).
  buildDigest: string
  nonprodDigest: string
  // Prod's release records, read afresh.
  records: readonly ReleaseRecord[]
  isAncestor: IsAncestor
  floorsAllowed: (target: string, floorsAt: string) => boolean | Promise<boolean>
}

// prod-gate's checks, before prod's approval: a deploy's commit descends from prod's newest record and
// its image is the one non-prod deployed in this run; a rollback's target is still recorded, on main,
// at the gate's digest and above every floor at the run's commit; a restore's record is the one the
// gate read. It outputs prod's newest record id, which the prod job's fast re-check compares.
export async function prodGate(input: ProdGateInput): Promise<Outcome<{ current_prod_id: string }>> {
  const { mode, target, sha, commit, isAncestor } = input
  if (!COMMIT.test(sha) || !COMMIT.test(commit)) return no('bad-input')
  const newest = current(input.records)
  const outputs = { current_prod_id: newest === undefined ? '' : String(newest.id) }
  if (target === 'prod' && mode === 'deploy') {
    if (commit !== sha) return no('bad-input')
    if (newest !== undefined && !isAncestor(newest.commit, sha)) return no('older-than-prod')
    if (!DIGEST.test(input.buildDigest) || input.buildDigest !== input.nonprodDigest) return no('digest-differs')
    return ok(outputs)
  }
  if (target === 'prod' && mode === 'rollback') {
    const recorded = recordedTarget(input.records, commit, sha, isAncestor)
    if (!recorded.ok) return recorded
    if (recorded.value.digest !== input.digest) return no('record-changed')
    if (!(await input.floorsAllowed(commit, sha))) return no('floor-crossed')
    return ok(outputs)
  }
  if (target === 'restore' && mode === 'deploy') {
    if (newest === undefined) return no('no-release')
    if (String(newest.id) !== input.recordId) return no('record-changed')
    return ok(outputs)
  }
  return no('bad-input')
}

// git's answers in a clone: whether one commit is an ancestor of (or is) another, and a commit's tree.
// Anything git can't answer (a commit not in the clone) reads as not an ancestor, so it refuses.
export function gitIsAncestor(repo: string): IsAncestor {
  return (ancestor, descendant) => {
    if (!COMMIT.test(ancestor) || !COMMIT.test(descendant)) return false
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: repo, stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
}

function gitTreeOf(repo: string): (commit: string) => string | undefined {
  return commit => {
    if (!COMMIT.test(commit)) return undefined
    try {
      return execFileSync('git', ['rev-parse', '--verify', '--quiet', `${commit}^{tree}`], {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      return undefined
    }
  }
}

// Whether a rollback to the target crosses no floor, the floors and their migrations read at floorsAt.
export const gitFloorsAllowed =
  (repo: string) =>
  async (target: string, floorsAt: string): Promise<boolean> =>
    (await checkFloors({ target, floorsAt, repo })).length === 0

// The ECS pages break-glass saves (break-glass.md's incident rollback, step 2): for each role,
// <role>-deployments-<n>.json, each `{ next, deployments: [[finishedAt, revisionArn], …] }` with only
// the last page's next null, and <role>-revisions-<n>.json, each `[[revisionArn, taskDefinition,
// imageDigest], …]`. finishedAt is the CLI's ISO time or epoch seconds.
export function readEcsPages(folder: string, readText: (path: string) => string): Record<ServiceRole, EcsHistory> {
  const names = readdirSync(folder)
  const parse = (name: string): unknown => {
    try {
      return JSON.parse(readText(join(folder, name)))
    } catch {
      throw new HistoryInputError(`${name} is not JSON`)
    }
  }
  const time = (value: unknown, role: ServiceRole): number => {
    const ms = typeof value === 'number' ? value * 1000 : typeof value === 'string' ? Date.parse(value) : Number.NaN
    if (!Number.isFinite(ms)) throw new HistoryInputError(`a ${role} deployment has no finishedAt`)
    return ms
  }
  const pages = {} as Record<ServiceRole, EcsHistory>
  for (const role of SERVICE_ROLES) {
    const numbered = (kind: string) =>
      names
        .map(name => ({ name, n: new RegExp(`^${role}-${kind}-([1-9][0-9]*)\\.json$`).exec(name)?.[1] }))
        .filter((entry): entry is { name: string; n: string } => entry.n !== undefined)
        .sort((a, b) => Number(a.n) - Number(b.n))
    const deploymentFiles = numbered('deployments')
    if (deploymentFiles.length === 0 || deploymentFiles.some((entry, i) => Number(entry.n) !== i + 1)) {
      throw new HistoryInputError(`--pages lacks ${role}'s deployment pages, numbered from 1`)
    }
    const deployments: Array<{ finishedAt: number; revision: string }> = []
    deploymentFiles.forEach((entry, i) => {
      const page = parse(entry.name)
      const last = i === deploymentFiles.length - 1
      if (!isRecord(page) || !hasKeys(page, ['next', 'deployments']) || !Array.isArray(page.deployments)) {
        throw new HistoryInputError(`${entry.name} is not a deployments page`)
      }
      if (last ? page.next !== null : typeof page.next !== 'string') {
        throw new HistoryInputError(`${role}'s deployment pages don't end where next is null`)
      }
      for (const row of page.deployments) {
        if (!Array.isArray(row) || row.length !== 2 || typeof row[1] !== 'string') {
          throw new HistoryInputError(`${entry.name} is not a deployments page`)
        }
        deployments.push({ finishedAt: time(row[0], role), revision: row[1] })
      }
    })
    const revisions: Array<{ revision: string; taskDefinition: string; digest: string }> = []
    for (const entry of numbered('revisions')) {
      const page = parse(entry.name)
      if (!Array.isArray(page)) throw new HistoryInputError(`${entry.name} is not a revisions page`)
      for (const row of page) {
        if (!Array.isArray(row) || row.length !== 3 || !row.every(cell => typeof cell === 'string')) {
          throw new HistoryInputError(`${entry.name} is not a revisions page`)
        }
        const [revision, taskDefinition, digest] = row as [string, string, string]
        if (!DIGEST.test(digest)) throw new HistoryInputError(`a ${role} revision has no image digest`)
        revisions.push({ revision, taskDefinition, digest })
      }
    }
    pages[role] = { deployments, revisions }
  }
  return pages
}

export interface Io {
  write: (text: string) => unknown
  warn: (text: string) => unknown
  readText: (path: string) => string
  cwd: string
  // The domains plan checks for a placeholder: the committed DOMAINS unless a test gives others.
  domains?: readonly string[]
}

const defaultIo: Io = {
  write: text => process.stdout.write(text),
  warn: text => process.stderr.write(text),
  readText: path => readFileSync(path, 'utf8'),
  cwd: process.cwd(),
}

function readJson(io: Io, path: string, flag: string): unknown {
  let text: string
  try {
    text = io.readText(path)
  } catch {
    throw new HistoryInputError(`${flag} can't be read`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new HistoryInputError(`${flag} is not JSON`)
  }
}

function required(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name)
  if (value === undefined) throw new HistoryInputError(`--${name} is missing`)
  return value
}

function environmentFlag(flags: ReadonlyMap<string, string>): RecordEnvironment {
  const env = required(flags, 'env')
  if (!isRecordEnvironment(env)) throw new HistoryInputError('--env is not nonprod or prod')
  return env
}

function releaseFlag(flags: ReadonlyMap<string, string>, name: string): Release {
  const release = parseRelease(required(flags, name))
  if (release === undefined) throw new HistoryInputError(`--${name} is not <commit>:<digest>`)
  return release
}

// A parse's ignored records, each a line on stderr naming its id.
function warnIgnored(io: Io, task: string, env: string, ignored: readonly number[]) {
  for (const id of ignored) io.warn(`history: ignored ${task} record ${id} in ${env}: its payload fails validation\n`)
}

function releaseRecordsIn(io: Io, folder: string, env: RecordEnvironment): ReleaseRecord[] {
  const parsed = parseReleaseRecords(readJson(io, join(folder, `release-${env}.json`), '--records'), env)
  warnIgnored(io, 'hearth-release', env, parsed.ignored)
  return parsed.records
}

function printRelease(io: Io, release: { commit?: string; digest: string; services: Record<ServiceRole, string> }) {
  if (release.commit !== undefined) io.write(`commit ${release.commit}\n`)
  io.write(`digest ${release.digest}\n`)
  for (const role of SERVICE_ROLES) io.write(`${role} ${release.services[role]}\n`)
}

function refuse(io: Io, reason: Refusal): 1 {
  io.write(`history: refused ${reason}: ${REFUSALS[reason]}\n`)
  return 1
}

async function run(argv: readonly string[], io: Io): Promise<0 | 1 | 2> {
  const [command, ...rest] = argv
  switch (command) {
    case 'plan': {
      const flags = readFlags(rest, [
        'event',
        'ref',
        'actor',
        'triggering-actor',
        'sha',
        'target',
        'mode',
        'release',
        'restore',
        'records',
        'checks',
        'repo',
      ])
      const repo = flags.get('repo') ?? io.cwd
      const records = required(flags, 'records')
      const checksPath = flags.get('checks')
      const result = await plan({
        event: required(flags, 'event'),
        ref: required(flags, 'ref'),
        actor: required(flags, 'actor'),
        triggeringActor: required(flags, 'triggering-actor'),
        sha: required(flags, 'sha'),
        target: required(flags, 'target'),
        mode: required(flags, 'mode'),
        release: required(flags, 'release'),
        restore: required(flags, 'restore'),
        records: { nonprod: releaseRecordsIn(io, records, 'nonprod'), prod: releaseRecordsIn(io, records, 'prod') },
        checks:
          checksPath !== undefined && existsSync(checksPath)
            ? parsePullChecks(readJson(io, checksPath, '--checks'))
            : undefined,
        treeOf: gitTreeOf(repo),
        isAncestor: gitIsAncestor(repo),
        floorsAllowed: gitFloorsAllowed(repo),
        domains: io.domains ?? Object.values(DOMAINS),
      })
      if (!result.ok) return refuse(io, result.reason)
      for (const key of PLAN_OUTPUTS) io.write(`${key}=${result.value[key]}\n`)
      return 0
    }
    case 'prod-gate': {
      const flags = readFlags(rest, [
        'mode',
        'target',
        'sha',
        'commit',
        'digest',
        'record-id',
        'build-digest',
        'nonprod-digest',
        'records',
        'repo',
      ])
      const repo = flags.get('repo') ?? io.cwd
      const result = await prodGate({
        mode: required(flags, 'mode'),
        target: required(flags, 'target'),
        sha: required(flags, 'sha'),
        commit: required(flags, 'commit'),
        digest: required(flags, 'digest'),
        recordId: required(flags, 'record-id'),
        buildDigest: required(flags, 'build-digest'),
        nonprodDigest: required(flags, 'nonprod-digest'),
        records: releaseRecordsIn(io, required(flags, 'records'), 'prod'),
        isAncestor: gitIsAncestor(repo),
        floorsAllowed: gitFloorsAllowed(repo),
      })
      if (!result.ok) return refuse(io, result.reason)
      io.write(`current_prod_id=${result.value.current_prod_id}\n`)
      return 0
    }
    case 'choose':
    case 'validate': {
      const flags = readFlags(
        rest,
        command === 'choose' ? ['env', 'records', 'current', 'repo'] : ['env', 'records', 'current', 'target', 'repo'],
      )
      const env = environmentFlag(flags)
      const parsed = parseReleaseRecords(readJson(io, required(flags, 'records'), '--records'), env)
      warnIgnored(io, 'hearth-release', env, parsed.ignored)
      const release = releaseFlag(flags, 'current')
      const repo = flags.get('repo') ?? io.cwd
      // A commit the clone lacks would read as not an ancestor; it is named instead, so a clone behind
      // main is never taken for a release that isn't older.
      resolveCommit(release.commit, repo)
      const isAncestor = gitIsAncestor(repo)
      let target: string
      if (command === 'choose') {
        const chosen = chooseFromRecords(parsed.records, release, isAncestor)
        if (!chosen.ok) return refuse(io, chosen.reason)
        target = chosen.value.commit
      } else {
        target = required(flags, 'target')
        if (!COMMIT.test(target)) throw new HistoryInputError('--target is not a commit')
      }
      resolveCommit(target, repo)
      const checked = validateTarget(parsed.records, release, target, isAncestor)
      if (!checked.ok) return refuse(io, checked.reason)
      printRelease(io, checked.value)
      return 0
    }
    case 'choose-ecs': {
      const flags = readFlags(rest, ['pages', 'current-digest', 'drill'])
      const digests = new Set(required(flags, 'current-digest').split(','))
      if ([...digests].some(digest => !DIGEST.test(digest))) {
        throw new HistoryInputError('--current-digest is not a list of digests')
      }
      const drillText = flags.get('drill') ?? ''
      const drill = new Set(drillText === '' ? [] : drillText.split(','))
      if ([...drill].some(entry => !/^hearth-[a-z]+-(?:api|realtime|worker):[1-9][0-9]{0,5}$/.test(entry))) {
        throw new HistoryInputError('--drill is not a list of family:revision')
      }
      const folder = required(flags, 'pages')
      if (!existsSync(folder)) throw new HistoryInputError("--pages can't be read")
      const chosen = chooseFromEcs(readEcsPages(folder, io.readText), digests, drill)
      if (!chosen.ok) return refuse(io, chosen.reason)
      printRelease(io, chosen.value)
      return 0
    }
    case 'migrated': {
      const flags = readFlags(rest, ['records', 'env'])
      const env = flags.has('env') ? environmentFlag(flags) : undefined
      const parsed = parseMigrationRecords(readJson(io, required(flags, 'records'), '--records'), env)
      warnIgnored(io, 'hearth-migrated', env ?? 'any environment', parsed.ignored)
      const commit = migrated(parsed.records)
      io.write(commit === 'none' ? 'none\n' : `commit ${commit}\n`)
      return 0
    }
    default:
      throw new HistoryInputError('the command is not plan, prod-gate, choose, choose-ecs, validate or migrated')
  }
}

// The entry. Input it can't use is one line and 2; a failure it didn't expect is `history: failed`
// and 1, so no error message or stack reaches a log.
export async function main(argv: readonly string[], io: Io = defaultIo): Promise<0 | 1 | 2> {
  try {
    return await run(argv, io)
  } catch (error) {
    if (error instanceof HistoryInputError || error instanceof FloorsError) {
      io.write(`history: ${error.message}\n`)
      return 2
    }
    io.write('history: failed\n')
    return 1
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
