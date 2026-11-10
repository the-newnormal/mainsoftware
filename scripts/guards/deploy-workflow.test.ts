// The deploy-workflow guard's cases (DPW-01 to DPW-14; C0.11, TECH-SPEC T24 items 20 to 23 and 28). The
// reader first finds the fifteen jobs and their steps, and reads every canonical text back exactly, and
// DPW-02 refuses any line in a shape it doesn't read, so a reformatted workflow fails rather than passing
// unread. Then each case is proved on planted text, an exact edit of the real file that throws when its
// anchor is gone, before it holds the repository.
// AWS_CHECK runs with bash and jq against planted AWS answers and a real git, ASSET_CHECK against
// planted copies of the workload's own assembly, protect-environments.sh check --from against planted
// answers, and history.ts's plan is driven for the gate's refusals. Every commit is made in a scratch
// repository, and nothing names an account, a login or an address. Last, `.claude/settings.json`'s deny
// rules are read for a `:*` anywhere but at a Bash rule's end (C11-D77), which Claude Code reads literally.
// This file and deploy-workflow.ts are on the owner's-read list (C11-D74).
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gitIsAncestor, type PlanInput, parseReleaseRecords, plan } from '../../infra/scripts/deploy/history.ts'
import { PROFILES } from '../../infra/src/config/profiles.ts'
import { synthWorkload } from '../../infra/src/testing/workload.ts'
import { AGENT_MARKERS } from '../owner-bootstrap/target.ts'
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
  canonicalTextFindings,
  checkoutFindings,
  credentialedCodeFindings,
  credentialJobFindings,
  DEPLOY,
  DEPLOY_WORDS,
  deployStepFindings,
  evaluatedLines,
  evaluateIf,
  FAST_RECHECK_NONPROD,
  FAST_RECHECK_PROD,
  forbiddenWordFindings,
  functionDefinitions,
  GENERAL_WORDS,
  GUARD,
  gateFindings,
  JOB_IDS,
  MAIN_CI,
  MIGRATE_LINES,
  maskingFindings,
  NET_JQ,
  NEWEST_RELEASE,
  ONE_OFF,
  OVERRIDES_JQ,
  outsideEvaluations,
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

// DPW-02's finding for a file workflow.ts would read wrong.
const SHAPE =
  'is written in the shape workflow.ts reads: two-space block nesting, each key once in its mapping, each value whole on its line'

// The findings for a run's own lines (every line outside a canonical text standing whole): one the table
// doesn't name, at its line (DPW-07, DPW-10, DPW-13), and a command not held to its uses (DPW-10, DPW-13).
const AS_BASH =
  'is written in the shell the guard reads: outside a canonical text standing whole, only what SHELL_TABLE names (blanks that are a space or a tab, its word characters, single and double quotes, its expansions, substitutions, operators, redirections, keywords, tests, case patterns, functions and assignments, its builtins as it holds them, a comment only at a line’s start or after a blank), each stretch closing all it opens'
const HELD =
  'gives each command its own lines run only the flags and arguments the workflow uses (GLUE_USES), no assignment before it, and no file to read but the diff or to write but its outputs, its summary, the diff and /dev/null, so none runs code, reads a file the guard can’t see or writes one'

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
    nonprod: 20,
    'smoke-nonprod': 3,
    'rollback-nonprod': 13,
    'resmoke-nonprod': 3,
    'record-nonprod': 1,
    'prod-plan': 9,
    'prod-gate': 5,
    prod: 20,
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
    const texts = { PREAMBLE, ASSET_CHECK, CDK_FOLDER, AWS_CHECK, CLI_CHECK, ONE_OFF, PROBE }
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
    for (const text of [PREAMBLE, ASSET_CHECK, CDK_FOLDER, AWS_CHECK, CLI_CHECK, ONE_OFF, PROBE, TASKS_OUTPUTS]) {
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
        plant('    needs: [secrets, audit]\n', '    needs: [secrets, audit, gate]\n', '', CI),
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
    const check = '  check:\n    needs: [secrets, audit]\n'
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
    const install = '        run: npm ci --ignore-scripts -w @hearth/infra\n'
    expect(permissionFindings(plant(install, `${install}          && npx cdk deploy --all\n`, job('nonprod')))).toEqual(
      shape(DEPLOY),
    )
    expect(
      permissionFindings(
        plant(
          install,
          '        run: "npm ci --ignore-scripts -w @hearth/infra\n          && npx cdk deploy --all"\n',
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
    const check = '  check:\n    needs: [secrets, audit]\n'
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
    const check = '  check:\n    needs: [secrets, audit]\n'
    expect(
      permissionFindings(plant(check, '  check:\n    concurrency: *g\n    needs: [secrets, audit]\n', '', CI)),
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
    const needs = '    needs: [secrets, audit]\n'
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
  const FOUND = [
    `${DEPLOY}: DPW-04 gate: every uses: is checkout, setup-node, upload-artifact, download-artifact or the credentials action, at a 40-hex commit with its version comment`,
  ]
  const pin = (to: string) => actionPinFindings(plant(PIN, to))

  it('finds each planted breakage', () => {
    expect(pin('actions/checkout@v7')).toEqual(FOUND)
    expect(pin('actions/checkout@main # v7.0.1')).toEqual(FOUND)
    expect(pin(`actions/checkout@${'a'.repeat(39)} # v7.0.1`)).toEqual(FOUND)
    expect(pin(`actions/checkout@${'a'.repeat(40)}`)).toEqual(FOUND)
    expect(pin(`docker/setup-buildx-action@${'a'.repeat(40)} # v3.11.1`)).toEqual(FOUND)
    expect(pin('./.github/actions/x')).toEqual(FOUND)
    expect(pin('docker://alpine@sha256:0')).toEqual(FOUND)
  })

  it('holds the repository', () => {
    expect(actionPinFindings(workflows)).toEqual([])
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
    const check = '  check:\n    needs: [secrets, audit]\n'
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
    'runs every step up to its credentials action, and AWS_CHECK after it, unconditionally, but its downloads'
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
  const TRACE =
    'runs no set -x, set -o xtrace, env, printenv, export -p or declare -p, and no set, declare, export, local or readonly given no name'

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
    for (const line of ['env -0', 'env -u X', 'X=1 env', 'jq -n env', 'declare -x']) {
      expect(added(line)).toEqual([at(readBack, TRACE)])
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
    for (const line of [
      "jq -n 'env' >/dev/null",
      'jq -n "env" >/dev/null',
      `jq -n '$ENV' | mask | tee -a "$GITHUB_STEP_SUMMARY"`,
      "jq -rn 'env.AWS_SESSION_TOKEN' | mask",
      'cat /proc/self/environ | mask',
      'echo "$AWS_SESSION_TOKEN" | mask',
    ]) {
      expect(added(line), line).toEqual([at(readBack, PRINTS)])
    }
    // Round 2's GUARDS-01: a # right after a substitution's ) hides nothing that prints.
    expect(added('echo $(true)#;set -x')).toEqual([at(readBack, TRACE)])
    expect(added('echo $(true)#;env | base64 -w0')).toEqual([at(readBack, TRACE)])
    // env as an object's key prints nothing, and a job with no credentials is no concern of this rule.
    expect(added("jq -n '{env: 1}' >/dev/null")).toEqual([])
    expect(
      maskingFindings(
        plant(
          `          printf '%s' "$READBACK"`,
          `          jq -n 'env' >/dev/null\n          printf '%s' "$READBACK"`,
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
      expect(plan(line), line).toEqual([at('gate (Plan), line 17', AS_BASH)])
    }
    expect(plan('/usr/bin/env')).toEqual([at('gate (Plan)', TRACE)])
    expect(plan('( printenv )')).toEqual([at('gate (Plan), line 17', AS_BASH), at('gate (Plan)', TRACE)])
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
      env: { PATH: process.env.PATH ?? '', GITHUB_WORKSPACE: '/nowhere' },
    })
    expect(result.status).toBe(0)
    expect(result.stdout.split('\n')).toEqual([
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
    ).toEqual([at('rollback-prod', SAME_STEPS)])
    // Each run the gates rest on is pinned whole: an early exit 0 or a forged output is found.
    const WAIT = "waits for main's check and migrations for a deploy alone, read from ci.yml's own run and its jobs"
    expect(
      prodPathFindings(addedBefore('prod-gate', "main's own CI", '          DEADLINE=', '          exit 0\n')),
    ).toEqual([at('prod-gate', WAIT)])
    expect(
      prodPathFindings(
        addedBefore(
          'prod-gate',
          'The prod gate',
          '          if ! OUT=$(node',
          '          echo current_prod_id= >>"$GITHUB_OUTPUT"; exit 0\n',
        ),
      ),
    ).toEqual([at('prod-gate', 'runs history.ts prod-gate with the mode')])
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
    ])
    // The check after smoke.ts has judged, or in a step of its own beside it, comes too late.
    const smokeLine = '          node infra/scripts/deploy/smoke.ts '
    const moved = edited(
      edited(deployText, check, '', job('smoke-nonprod')),
      smokeLine,
      `${check}${smokeLine}`,
      job('smoke-nonprod'),
    )
    expect(prodPathFindings(withText(DEPLOY, moved))).toEqual([stale('smoke-nonprod', 'nonprod')])
    expect(prodPathFindings(copiedStep('smoke-prod', 'Smoke', 'smoke-prod', 'Smoke'))).toEqual([
      stale('smoke-prod', 'prod'),
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
    ])
    expect(gate(plant('--release "$RELEASE" --restore', '--release "" --restore', job('gate')))).toEqual([
      at('gate', 'plans through history.ts plan, every input and actor through env:'),
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
    ).toEqual([`${dir}/prod.json: DPW-09 asks for at least one reviewer and no admin bypass`])
    expect(
      gate(
        workflows,
        envFile('prod.json', record => (record.can_admins_bypass = true)),
      ),
    ).toEqual([`${dir}/prod.json: DPW-09 asks for at least one reviewer and no admin bypass`])
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
        ['-c', 'user.name=hearth-test', '-c', `user.email=${email}`, '-c', 'commit.gpgsign=false', ...args],
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
      planted(() => write('prod.json', { ...prod(), name: 'prod-x' }), 'protect-environments: prod name differs')
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
    'runs nothing but bash’s own, its functions, gh api, git merge-base, jq, the text tools, aws, skopeo and the pinned CLI, and names no npx, node, shell, source, eval, docker, python, make, curl, wget or script: no tool is handed a program to run'
  const WRITES = "writes no file but its outputs, its summary, prod-plan's diff and /dev/null"
  const LOADER =
    "sets no PATH, HOME (but CDK_FOLDER's), BASH_ENV or other variable that chooses what runs, and writes neither GITHUB_ENV nor GITHUB_PATH"
  const JOB_KEYS =
    'holds only needs, if, runs-on, timeout-minutes, cache-mode, permissions, environment, concurrency, outputs, env and steps, each once: no container, services, defaults, strategy, uses or continue-on-error'
  const STEP_KEYS =
    'holds only name, id, if, uses, with, env and run (and working-directory in synth), each once: no shell or continue-on-error'
  const WITH = 'gives its action only the inputs the workflow uses: no repository, run-id, token or other source'
  const ENV = 'sets only the environment variables the workflow uses: no BASH_ENV, PATH or NODE_OPTIONS'
  const REFUSED = 'passes none of the CLI’s refused flags or subcommands'
  const DEFINES =
    'defines a function only where a canonical text (the preamble, ASSET_CHECK, AWS_CHECK, TASKS_OUTPUTS, ONE_OFF or NEWEST_RELEASE) does, as it does'
  const SETS =
    "sets a variable by printf -v, read, mapfile or for only on a canonical text's line, or the read-back's or the release loop's"
  const CLI =
    'runs the CLI only as deploy or diff, with --app "$ASSEMBLY" (set once to the folder it downloaded), after CDK_FOLDER and no other change of folder, with --no-lookups --no-notices, and a deploy with --require-approval never --ci --exclusively'
  const readBack = (id: string) => `${id} (Read back what runs)`
  // A planted line refused by the table, at its line in the read-back's run (16, where added() plants), and a
  // command it reads that isn't held to its uses.
  const refused = (id: string, line = 16) => at(`${readBack(id)}, line ${line}`, AS_BASH)
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
    expect(added('nonprod', 'jq() { :; }')).toEqual([refused('nonprod'), at(readBack('nonprod'), DEFINES)])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --no-rollback', services)).toEqual([
      at('nonprod (Deploy Services)', REFUSED),
      at('nonprod (Deploy Services)', HELD),
    ])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --hotswap', services)).toEqual([
      at('nonprod (Deploy Services)', REFUSED),
      at('nonprod (Deploy Services)', HELD),
    ])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --all', services)).toEqual([
      at('nonprod (Deploy Services)', REFUSED),
      at('nonprod (Deploy Services)', HELD),
    ])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --role-arn x', services)).toEqual([
      at('nonprod (Deploy Services)', REFUSED),
      at('nonprod (Deploy Services)', HELD),
    ])
    expect(find('run "$CDK" deploy --app', 'run "$CDK" destroy --app', services)).toEqual([
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
      at('nonprod (Roll back to the target)', REFUSED),
      at('nonprod (Roll back to the target)', HELD),
      at('nonprod (Roll back to the target)', CLI),
    ])
    expect(find('--no-lookups ', '', services)).toEqual([
      at('nonprod (Deploy Services)', HELD),
      at('nonprod (Deploy Services)', CLI),
    ])
    // A change of folder, cd, is a builtin the table refuses outside a canonical text.
    expect(
      find(`          ${CDK_FOLDER}\n`, `          ${CDK_FOLDER}\n          cd "$GITHUB_WORKSPACE/infra"\n`, services),
    ).toEqual([at('nonprod (Deploy Services), line 13', AS_BASH), at('nonprod (Deploy Services)', CLI)])
    expect(find('ASSEMBLY="$RUNNER_TEMP/assembly"', 'ASSEMBLY="$RUNNER_TEMP/assembly-previous"', services)).toEqual([
      at('nonprod (Deploy Services)', CLI),
    ])
    expect(
      find(
        'CDK="$GITHUB_WORKSPACE/node_modules/aws-cdk/bin/cdk"',
        'CDK="$GITHUB_WORKSPACE/node_modules/.bin/cdk"',
        '      - name: What runs\n',
      ),
    ).toEqual([
      at(
        'nonprod (What runs)',
        'assigns CDK only in the preamble, as the registry package’s node_modules/aws-cdk/bin/cdk',
      ),
      // The preamble changed is no preamble, so its lines are the run's own, the table refusing the first
      // function the table doesn't name, and its mask, run and get are functions of the run's own.
      at('nonprod (What runs), line 4', AS_BASH),
      at('nonprod (What runs)', DEFINES),
    ])
    expect(
      credentialedCodeFindings(
        copiedStep('gate', 'Node, from .nvmrc', 'prod', 'The pinned CDK CLI'),
        manifests,
        lockfile,
      ),
    ).toEqual([at('prod (Node, from .nvmrc)', 'uses only checkout, download-artifact and the credentials action')])
    expect(credentialedCodeFindings(removedStep('nonprod', "The CLI is the registry's"), manifests, lockfile)).toEqual([
      at(
        'nonprod',
        'installs only the pinned CLI (npm ci --ignore-scripts -w @hearth/infra), then runs CLI_CHECK, before the credentials action',
      ),
    ])
  }, 30_000)

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
      at('nonprod (Deploy Services)', LOADER),
    ])
    expect(deployServices(assembly, "          printf -v RUNNER_TEMP '%s' x\n")).toEqual([
      at('nonprod (Deploy Services), line 11', AS_BASH),
      at('nonprod (Deploy Services)', SETS),
    ])
    const folder = `          ${CDK_FOLDER}\n`
    expect(deployServices(folder, '          read -r ASSEMBLY <<<"x"\n')).toEqual([
      at('nonprod (Deploy Services), line 12', AS_BASH),
      at('nonprod (Deploy Services)', SETS),
    ])
    expect(deployServices(folder, '          ASSEMBLY+=/x\n')).toEqual([
      at('nonprod (Deploy Services), line 12', AS_BASH),
      at('nonprod (Deploy Services)', CLI),
    ])
    expect(find('DIFF="$RUNNER_TEMP/diff.txt"', 'DIFF=node_modules/aws-cdk/bin/cdk', job('prod-plan'))).toEqual([
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
    ])
    const ids = `          artifact-ids: \${{ needs.synth.outputs.assembly }}\n`
    expect(find(ids, `${ids}          run-id: 1\n          github-token: x\n`, job('nonprod'))).toEqual([
      at('nonprod (Download the assembly)', WITH),
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
      expect(added('nonprod', line), line).toEqual([refused('nonprod', 17)])
    }
    expect(added('nonprod', 'X=$(true) $(echo cp) "$RUNNER_TEMP/assembly/x.js" node_modules/aws-cdk/bin/cdk')).toEqual([
      refused('nonprod'),
    ])
    // A compound assignment over three lines, whose subscript line also reads as a command of its own.
    expect(added('nonprod', lines(`y=${quoted}`, 'a=(', '  [y]=1', ')'))).toEqual([...runs, refused('nonprod', 17)])
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
      "package-lock.json: DPW-10 node_modules/aws-cdk is the registry's package at infra's pin, with an integrity and no link"
    const withEntry = (changed: Record<string, unknown>) =>
      credentialedCodeFindings(
        workflows,
        manifests,
        JSON.stringify({ ...lock, packages: { ...lock.packages, 'node_modules/aws-cdk': changed } }),
      )
    expect(withEntry({ ...entry, link: true })).toEqual([LOCK])
    expect(withEntry({ ...entry, resolved: 'https://registry.example.invalid/aws-cdk.tgz' })).toEqual([LOCK])
    expect(withEntry({ ...entry, version: '0.0.1' })).toEqual([LOCK])
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
        line.startsWith('cat') ? refused('nonprod') : refused('nonprod', 17),
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
      at(
        'deploy.yml',
        "synthesises only with the pipeline's npm run synth, never synth:ci, synth:lz, HEARTH_FAKE_RELEASE or cdk synth",
      ),
      at('synth (Synthesise the release)', SYNTH),
    ])
    expect(find('          CONTEXT=()\n', '          CONTEXT=()\n          export HEARTH_FAKE_RELEASE=1\n')).toEqual([
      at(
        'deploy.yml',
        "synthesises only with the pipeline's npm run synth, never synth:ci, synth:lz, HEARTH_FAKE_RELEASE or cdk synth",
      ),
    ])
    expect(find('          CONTEXT=()\n', '          CONTEXT=(-c release=x)\n')).toEqual([
      at('synth (Synthesise the release)', SYNTH),
    ])
    expect(find(':sha-$COMMIT-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"', ':latest"', push)).toEqual([
      at('deploy.yml', 'names no image :latest'),
      at('nonprod (Push the image)', TAG),
      at('nonprod (Push the image)', PUSH),
    ])
    expect(find(':sha-$COMMIT-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"', ':sha-$COMMIT-$GITHUB_RUN_ID"', push)).toEqual([
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
    ).toEqual([at('nonprod (Migrate)', 'writes in its migrate step the one migration record and its status alone')])
    // Any other write, GraphQL's included, is no record's.
    expect(record("gh api graphql -f query='mutation { x }'")).toEqual([
      at('nonprod (Read back what runs)', 'makes no GitHub API write but a record’s'),
      at('nonprod (Read back what runs)', 'sends a record’s body whole, with --input -'),
    ])
    expect(find('auto_merge: false, ', '', job('record-nonprod'))).toEqual([
      at('record-nonprod (Write the record)', BODY),
    ])
    expect(
      find(
        'id=$(gh api -X POST "repos/$REPO/deployments" --input - --jq .id <<<"$body")',
        'id=$(gh api -X POST "repos/$REPO/deployments" -f ref=main -f payload="$2" --jq .id)',
        job('record-nonprod'),
      ),
    ).toEqual([
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
    ).toEqual([at('prod (Push the image)', ONLY_PUSH)])
  }, 30_000)

  // A record job holds deployments: write, so it runs no repository code: one step, no action, and only
  // bash's own, its functions, jq and gh api.
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
    expect(find(write, `${checkout}${write}`, job('record-nonprod'))).toEqual([at('record-nonprod', RECORD)])
    expect(
      releaseFindings(
        addedBefore('record-prod', 'Write the record', '          record() {\n', '          node scripts/x.ts\n'),
      ),
    ).toEqual([at('record-prod', RECORD), at('record-prod (Write the record)', HELD)])
    expect(
      releaseFindings(
        addedBefore('record-prod', 'Write the record', '          record() {\n', '          ./scripts/x.sh\n'),
      ),
    ).toEqual([at('record-prod', RECORD), at('record-prod (Write the record)', HELD)])
    // GUARDS-01: an escaped blank before # once hid what follows it from the reader; the table names no
    // unquoted backslash, and refuses it at its line (9, where the plant stands in the run).
    expect(
      releaseFindings(
        addedBefore('record-nonprod', 'Write the record', '          record() {\n', '          echo a\\ #;node x\n'),
      ),
    ).toEqual([at('record-nonprod', RECORD), at('record-nonprod (Write the record), line 9', AS_BASH)])
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
    expect(record(post)).toEqual([
      at('record-nonprod (Write the record)', HELD),
      at('record-nonprod (Write the record)', WHOLE),
    ])
    expect(record(`echo $(echo)#;${post}`)).toEqual([refused, at('record-nonprod (Write the record)', WHOLE)])
    expect(record(`echo \${x:-a #}; ${post}`)).toEqual([refused, at('record-nonprod (Write the record)', WHOLE)])
    expect(record(`echo \`${post}\``)).toEqual([refused, at('record-nonprod (Write the record)', WHOLE)])
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
      expect(record(...lines), lines.join('; ')).toEqual([at('record-nonprod (Write the record), line 10', AS_BASH)])
    }
    expect(record(`y=${quoted}`, `: "\${@:y}"`)).toEqual([
      at('record-nonprod', RECORD),
      at('record-nonprod (Write the record), line 10', AS_BASH),
    ])
    const refused = at('record-nonprod (Write the record), line 9', AS_BASH)
    expect(record('local -n r=x')).toEqual([at('record-nonprod', RECORD), refused])
    expect(record('local -i n')).toEqual([at('record-nonprod', RECORD), refused])
    expect(record(`X=$(true) ${post}`)).toEqual([
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
      ['-c', 'user.name=hearth-test', '-c', `user.email=${email}`, '-c', 'commit.gpgsign=false', ...args],
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
    const bin = join(scratch, 'workspace', 'node_modules', 'aws-cdk', 'bin')
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
  const nonprod = (dir: string) => join(dir, 'assembly-nonprod')
  const prod = (dir: string) => join(dir, 'assembly-prod')

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
    expect(
      check(dir => {
        for (const folder of [dir, nonprod(dir), prod(dir), join(dir, 'assembly-restore')]) {
          edit(join(folder, 'manifest.json'), json => {
            json.artifacts = Object.fromEntries(
              Object.entries(artifacts(json)).filter(([, artifact]) => artifact.type !== 'cdk:asset-manifest'),
            )
          })
        }
      }),
    ).toBe(refused('no asset manifest was read'))
  }, 30_000)

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
      check(dir =>
        edit(named(prod(dir), 'Services', '.template.json'), json => {
          const outputs = json.Outputs as Record<string, { Value: unknown }>
          if (outputs.Release !== undefined) outputs.Release.Value = other
        }),
      ),
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
