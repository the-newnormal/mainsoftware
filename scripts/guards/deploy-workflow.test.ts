// The deploy-workflow guard's cases (DPW-01 to DPW-14; C0.11, TECH-SPEC T24 items 20 to 23 and 28). The
// reader first finds the fifteen jobs and their steps, and reads every canonical text back exactly, so a
// reformatted workflow fails rather than passing unread. Then each case is proved on planted text, an
// exact edit of the real file that throws when its anchor is gone, before it holds the repository.
// AWS_CHECK runs with bash and jq against planted AWS answers and a real git, ASSET_CHECK against
// planted copies of the workload's own assembly, protect-environments.sh check --from against planted
// answers, and history.ts's plan is driven for the gate's refusals. Every commit is made in a scratch
// repository, and nothing names an account, a login or an address.
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
  checkoutFindings,
  credentialedCodeFindings,
  credentialJobFindings,
  DEPLOY,
  DEPLOY_WORDS,
  deployStepFindings,
  evaluateIf,
  forbiddenWordFindings,
  GENERAL_WORDS,
  gateFindings,
  JOB_IDS,
  MIGRATE_LINES,
  maskingFindings,
  NET_JQ,
  ONE_OFF,
  OVERRIDES_JQ,
  PREAMBLE,
  PROBE,
  PROBE_LINES,
  permissionFindings,
  prodPathFindings,
  RESTORE_DOWN,
  RULESET,
  RUN_TASK_MIGRATE,
  RUN_TASK_PROBE,
  releaseFindings,
  SKOPEO_COPY,
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
const manifests: ReadonlyMap<string, string> = new Map(
  files
    .filter(path =>
      /^(?:package\.json|(?:apps|packages)\/[^/]+\/package\.json|infra\/package\.json|demo\/package\.json)$/.test(path),
    )
    .map(path => [path, readRepoFile(path)]),
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
  })
})

describe('DPW-01 (C11-D47, C11-D62): what starts the workflow', () => {
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
      `${secrets}: DPW-02 no key or value is spelled with an escape, which could name id-token or write-all unseen`,
    ])
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
    expect(ci(check, `${check}    permissions: { contents: read, id-token: write }\n`)).toEqual(idToken)
    expect(ci(check, `${check}    permissions:\n      contents: read\n      'id-token': write\n`)).toEqual(idToken)
    expect(ci(check, `${check}    permissions:\n      "id-token": write\n`)).toEqual(idToken)
    expect(ci(check, `${check}    # ID-TOKEN: write, once\n`)).toEqual(idToken)
    expect(
      ci(
        '  secrets:\n    uses: ./.github/workflows/secrets.yml\n',
        '  secrets:\n    permissions:\n      id-token: write\n    uses: ./.github/workflows/secrets.yml\n',
      ),
    ).toEqual(idToken)
    expect(ci(check, `${check}    permissions: { "id\\x2Dtoken": write }\n`)).toEqual(escaped)
    expect(ci(check, `${check}    permissions:\n      "id\\u002Dtoken": write\n`)).toEqual(escaped)
    expect(ci(check, `${check}    permissions: "write\\x2Dall"\n`)).toEqual(escaped)
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
  })

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
    ).toEqual([at('nonprod', 'probes once, after every Services deploy but restore=down’s')])
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

  it('finds each planted breakage', () => {
    expect(added('set -x')).toEqual([
      at(readBack, 'runs no set -x, set -o xtrace, bare env or set, printenv, export -p or declare -p'),
    ])
    expect(added('env | sort')).toEqual([
      at(readBack, 'runs no set -x, set -o xtrace, bare env or set, printenv, export -p or declare -p'),
    ])
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
    expect(
      maskingFindings(
        plant('      STAGE: nonprod\n', '      STAGE: nonprod\n      AWS_REGION: ap-southeast-1\n', job('nonprod')),
      ),
    ).toEqual([at('nonprod', 'sets no AWS_ variable and no ROLE_TO_ASSUME')])
  })

  it('holds the repository', () => {
    expect(maskingFindings(workflows)).toEqual([])
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
      `            echo "fast re-check: prod's release records changed since prod-gate read them"`,
      '            exit 1',
      '',
    ].join('\n')
    expect(prodPathFindings(plant(elif, '', job('prod')))).toEqual([at('prod', RECHECK)])
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
  })

  it('holds the repository', () => {
    expect(prodPathFindings(workflows)).toEqual([])
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
    })
  })
})

describe('DPW-10 (C11-D48, C11-D76): no repository code where the credentials are', () => {
  const at = (where: string, rule: string) => `${DEPLOY}: DPW-10 ${where}: ${rule}`
  const RUNS =
    'runs nothing but bash’s own, its functions, gh, git, jq, the text tools, aws, skopeo and the pinned CLI: no npx, node, shell, source, eval, docker, npm exec, python, make, curl, wget or script'
  const REFUSED = 'passes none of the CLI’s refused flags or subcommands'
  const CLI =
    'runs the CLI only as deploy or diff, with --app "$ASSEMBLY" (set once to the folder it downloaded), after CDK_FOLDER and no other change of folder, with --no-lookups --no-notices, and a deploy with --require-approval never --ci --exclusively'
  const readBack = (id: string) => `${id} (Read back what runs)`
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
    expect(added('nonprod', 'npm run synth -w @hearth/infra')).toEqual([at(readBack('nonprod'), RUNS)])
    expect(added('prod', 'node infra/scripts/deploy/history.ts migrated --records x')).toEqual([
      at(readBack('prod'), RUNS),
    ])
    expect(added('nonprod', 'bash scripts/x.sh')).toEqual([at(readBack('nonprod'), RUNS)])
    expect(added('nonprod', 'npx cdk deploy')).toEqual([at(readBack('nonprod'), RUNS)])
    expect(added('nonprod', 'docker load -i x.tar')).toEqual([at(readBack('nonprod'), RUNS)])
    expect(added('nonprod', 'X=$(curl -s x)')).toEqual([at(readBack('nonprod'), RUNS)])
    expect(added('nonprod', './scripts/x.ts')).toEqual([at(readBack('nonprod'), RUNS)])
    expect(added('nonprod', '"$TOOL" x')).toEqual([at(readBack('nonprod'), RUNS)])
    expect(added('nonprod', 'jq() { :; }')).toEqual([at(readBack('nonprod'), RUNS)])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --no-rollback', services)).toEqual([
      at('nonprod (Deploy Services)', REFUSED),
    ])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --hotswap', services)).toEqual([
      at('nonprod (Deploy Services)', REFUSED),
    ])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --all', services)).toEqual([
      at('nonprod (Deploy Services)', REFUSED),
    ])
    expect(find('"$STAGE/Services" --exclusively', '"$STAGE/Services" --exclusively --role-arn x', services)).toEqual([
      at('nonprod (Deploy Services)', REFUSED),
    ])
    expect(find('run "$CDK" deploy --app', 'run "$CDK" destroy --app', services)).toEqual([
      at('nonprod (Deploy Services)', REFUSED),
      at('nonprod (Deploy Services)', CLI),
    ])
    expect(
      find(
        'run "$CDK" deploy --app',
        'run "$CDK" rollback --orphan x --app',
        '      - name: Roll back to the target\n',
      ),
    ).toEqual([at('nonprod (Roll back to the target)', REFUSED), at('nonprod (Roll back to the target)', CLI)])
    expect(find('--no-lookups ', '', services)).toEqual([at('nonprod (Deploy Services)', CLI)])
    expect(
      find(`          ${CDK_FOLDER}\n`, `          ${CDK_FOLDER}\n          cd "$GITHUB_WORKSPACE/infra"\n`, services),
    ).toEqual([at('nonprod (Deploy Services)', CLI)])
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
  })

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
  })

  it('holds the repository', () => {
    expect(credentialedCodeFindings(workflows, manifests, lockfile)).toEqual([])
    expect([...manifests.keys()]).toEqual(
      expect.arrayContaining(['package.json', 'infra/package.json', 'apps/server/package.json']),
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
    expect(find('auto_merge: false, ', '', job('record-nonprod'))).toEqual([
      at('record-nonprod (Write the record)', BODY),
    ])
    expect(
      find(
        'id=$(gh api -X POST "repos/$REPO/deployments" --input - --jq .id <<<"$body")',
        'id=$(gh api -X POST "repos/$REPO/deployments" -f ref=main -f payload="$2" --jq .id)',
        job('record-nonprod'),
      ),
    ).toEqual([at('record-nonprod (Write the record)', 'sends a record’s body whole, with --input -')])
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
  const c: Record<'A' | 'B' | 'C' | 'X', string> = { A: '', B: '', C: '', X: '' }
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
    git(['checkout', '-q', 'main'])
  })
  afterAll(() => {
    for (const folder of [repo, scratch]) if (folder !== '') rmSync(folder, { recursive: true, force: true })
  })

  const digest = (n: number) => `sha256:${String(n).padStart(64, '0')}`
  const D = { A: digest(1), B: digest(2), C: digest(3), D: digest(4) }
  const release = (commit: 'A' | 'B' | 'C' | 'X', d: string) => `${c[commit]}:${d}`
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
    first?: boolean
    stack: string
    services: string
    running: string
    drift?: string
    ecr?: string
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
        FIRST: String(a.first ?? false),
        STACK: a.stack,
        SERVICES: a.services,
        RUNNING: a.running,
        DRIFT: a.drift ?? '',
        ECR: a.ecr ?? '{}',
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
    // The refusal is shown through the 12-digit filter, which a commit's own digits can trip.
    const shown = c.A.replace(/[0-9]{12}/g, '***')
    expect(deploy.said).toContain(`dispatch mode=rollback with release ${shown} first (deploy-and-rollback.md)`)
    expect(awsCheck({ mode: 'deploy', release: release('C', D.C), ...runsB(), drift: D.A, ecr: all() }).verdict).toBe(
      'refused',
    )
    expect(awsCheck({ mode: 'drill', release: release('B', D.B), ...drifted, ecr: all() }).verdict).toBe('refused')
    expect(awsCheck({ mode: 'rollback', release: release('A', D.A), ...drifted, ecr: all() }).verdict).toBe('pass')
    const elsewhere = { stack: stack('UPDATE_COMPLETE', release('C', D.C)), services: ONE, running: D.B }
    expect(awsCheck({ mode: 'rollback', release: release('A', D.A), ...elsewhere, ecr: all() }).verdict).toBe('refused')
    expect(awsCheck({ mode: 'rollback', release: release('A', D.A), ...runsB(), drift: D.A, ecr: all() }).verdict).toBe(
      'refused',
    )
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
  })

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

  it('reads prod’s Release for a restore, never the restore stage’s own stacks', () => {
    const restore = { mode: 'restore' as const, stage: 'restore', services: 'nocluster', running: D.B, ecr: all() }
    expect(
      awsCheck({ ...restore, release: release('B', D.B), stack: stack('UPDATE_COMPLETE', release('C', D.C)) }).said,
    ).toBe('aws-check: what runs is not the release the gate read')
    expect(awsCheck({ ...restore, release: release('B', D.B), stack: 'none' }).verdict).toBe('refused')
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
  })

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
  })

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
  })

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
  })

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
  })

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
