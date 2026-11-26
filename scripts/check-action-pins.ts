// deploy.yml's action pins against each action's own repository (C11-D48, C11-D79, DPW-04; TECH-SPEC T24
// item 28). It runs in CI's job action-pins, which has the network, and before a PR that moves a pin:
//
//   node scripts/check-action-pins.ts
//
// For each entry of ACTION_PINS (scripts/guards/action-pins.ts), which DPW-04 holds every uses: in
// deploy.yml to, it reads the version's tag from https://github.com/<action>.git with git ls-remote, and
// requires the commit the tag names (the peeled commit of an annotated tag, the tag's own of a lightweight
// one) to be exactly the pinned commit. A commit that exists only in a fork resolves under the action's name
// on GitHub but is named by no tag of the action's repository, and an older release's commit isn't its newer
// version's tag's, so neither passes. Only the two exact refs are read (ls-remote matches a pattern against
// the tail of a ref's name at a /, so it also prints a branch named refs/tags/v1.0.0, as
// refs/heads/refs/tags/v1.0.0, and a tag x/refs/tags/v1.0.0, either at any commit of the action's own
// repository). Reading is tried three times, since the
// network can blip; a pin that differs fails at once. It prints one line per action and exits 1 on any
// problem.
//
// It reads deploy.yml itself too, as Node reads the file and GitHub runs it (deployPinProblems), and
// requires every uses: there to be its action's entry in that table, so the commits it proves are the ones
// deploy.yml runs, whatever a test run loads in the table's place: DPW-04, under Vitest, binds deploy.yml to
// the table Vite resolves, which a sibling file Vite tries before action-pins.ts (an action-pins.mjs with a
// moved pin, say) or a test configuration's alias could make another file than the one this proves.
//
// git reads the repository from a folder of its own and with no configuration but its defaults (readTagRefs),
// whatever a step before it in its job, a person's machine or the runner left behind: no system, global or
// repository configuration file, none given in the environment, no other git folder, helper or askpass. A
// url.<base>.insteadOf a test wrote to $HOME/.gitconfig, say, would otherwise send the read to a fork whose
// tag names the fork's commit. CI runs this in a job of its own, before any repository code (ci.yml's
// action-pins, which DPW-04 holds), so nothing earlier on its runner can change the check itself either: its
// checkout is a folder below the workspace where setup-node runs node, npm and yarn, since Yarn 1 runs the
// program a .yarnrc's yarn-path names from the folder it runs in or any above it (a pull request's .yarnrc
// put a git first on the PATH that answered ls-remote with a fork's commit: round 12's fourth iteration).
// That job's checkout and setup-node run before this, each at its commit in PINS_JOB_ACTIONS, which this
// reads too: that catches a mistake there, though never a fork's commit, which would already have run, so a
// person proves a change to them by hand (action-pins.ts says how). Node runs this file, and it reads
// deploy.yml and the tables, as the checkout writes them through .gitattributes, while the owner reads their
// blobs: an ident attribute on this file turned a comparison the blob made into one that never held (round
// 12's third iteration). So before reading any tag it refuses a checkout whose files aren't HEAD's blobs, byte
// for byte (checkout-blobs.ts). That can't hold this file, or a module imported before it runs, since an
// attribute that rewrites this file can rewrite the call too, so the job's step, read from the workflow's blob,
// first writes every file again as its blob (BLOB_RESET, in the deploy-workflow guard), and the drift check is
// the layer inside it (round 12's fourth iteration). What this check decides holds a pin
// only as long as this file does, and CI runs it from the pull request's own head, so it is on the
// owner's-read list (C11-D74); DPW-04's tests run its decision (run) and its address (actionUrl) on planted
// answers.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkoutDrift, refusedDrift } from './checkout-blobs.ts'
import { ACTION_PINS, ACTION_SHAPE, PIN_SHAPE, PINS_JOB_ACTIONS } from './guards/action-pins.ts'
import { shapeProblems } from './guards/workflow.ts'

// The commit a version's tag names, from git ls-remote's answer for its two refs: the peeled line of an
// annotated tag, otherwise the tag's own line; undefined when the answer names neither exactly.
export function tagCommit(answer: string, version: string): string | undefined {
  const refs = new Map<string, string>()
  for (const line of answer.split('\n')) {
    const entry = /^([0-9a-f]{40})\t(\S+)$/.exec(line)
    if (entry !== null) refs.set(entry[2] ?? '', entry[1] ?? '')
  }
  return refs.get(`refs/tags/${version}^{}`) ?? refs.get(`refs/tags/${version}`)
}

// Each problem with the pins, given a reader of an action's tag refs: an entry in no shape this check reads,
// a tag the repository doesn't hold, or a tag naming another commit.
export function pinProblems(
  pins: Readonly<Record<string, string>>,
  read: (action: string, version: string) => string,
): string[] {
  const problems: string[] = []
  for (const [action, pin] of Object.entries(pins)) {
    const shaped = PIN_SHAPE.exec(pin)
    if (!ACTION_SHAPE.test(action) || shaped === null) {
      problems.push(`${action}: the pin is not <40-hex commit> # v<major>.<minor>.<patch>`)
      continue
    }
    const [, commit = '', version = ''] = shaped
    const named = tagCommit(read(action, version), version)
    if (named === undefined) problems.push(`${action}: the repository has no tag ${version}`)
    else if (named !== commit) problems.push(`${action}: tag ${version} names another commit than the pin's`)
  }
  return problems
}

// deploy.yml, beside this script wherever it runs from.
export const DEPLOY_FILE = new URL('../.github/workflows/deploy.yml', import.meta.url)
// A step's uses: as DPW-02 and DPW-04 hold deploy.yml to write it: the key alone, the action, @, a 40-hex
// commit and its version in a comment, and nothing else on the line.
const USES_LINE = /^ +(?:- )?uses: ([^\s@]+)@([0-9a-f]{40} # v\d+\.\d+\.\d+)$/

// Each problem with what deploy.yml runs, read from its own text: a line in none of the shapes the workflow
// reader reads (a quoted key, which can spell uses with an escape, a flow mapping, a tag, or an anchor or
// alias but a step's shared run, which holds no uses:), a line holding the word uses in any other shape than a
// step's pinned uses:, or an action at another commit or version than its ACTION_PINS entry, and no pinned
// uses: at all. Every line is read as stored, comments, runs and shared runs' anchors included, so no uses:
// stands where a reader of the YAML would miss it; a line that only mentions the word is refused too, and is
// reworded.
export function deployPinProblems(text: string): string[] {
  const problems = shapeProblems(text).map(
    index => `line ${index + 1}: in none of the shapes the workflow reader reads`,
  )
  let pinned = 0
  text.split('\n').forEach((line, index) => {
    if (!/\buses\b/i.test(line)) return
    const uses = USES_LINE.exec(line)
    const [, action = '', pin = ''] = uses ?? []
    if (uses === null) problems.push(`line ${index + 1}: names uses in another shape than a step's pinned uses:`)
    else if (!Object.hasOwn(ACTION_PINS, action) || ACTION_PINS[action] !== pin)
      problems.push(`line ${index + 1}: runs ${action} at another commit or version than its ACTION_PINS entry`)
    else pinned++
  })
  if (pinned === 0) problems.push('names no pinned uses:')
  return problems
}

// The variables git's network takes from whoever runs the check, since the network is theirs: a proxy and
// the certificate authority it needs. They choose how git reaches a host, never which repository it reads.
const NETWORK = /^(?:https?_proxy|all_proxy|no_proxy|GIT_SSL_CAINFO|GIT_SSL_CAPATH|SSL_CERT_FILE|SSL_CERT_DIR)$/i

// The environment git runs in: PATH and the network's variables from the caller's and nothing else of
// theirs, its home the read's own empty folder, no system or global configuration file, no search for a
// repository above that folder, and no prompt for a password (the repositories are public). So no
// configuration file, git -c value (GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT), git folder (GIT_DIR), helper
// folder (GIT_EXEC_PATH), askpass or .netrc reaches it.
export function gitEnvironment(env: NodeJS.ProcessEnv, folder: string): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && (name === 'PATH' || NETWORK.test(name))) kept[name] = value
  }
  return {
    ...kept,
    HOME: folder,
    XDG_CONFIG_HOME: folder,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CEILING_DIRECTORIES: dirname(folder),
    GIT_TERMINAL_PROMPT: '0',
  }
}

// One git ls-remote of a repository for a version's two refs, run in a new empty folder outside any
// repository, which it removes after, and in gitEnvironment's environment.
export function readTagRefs(url: string, version: string, env: NodeJS.ProcessEnv = process.env): string {
  const ref = `refs/tags/${version}`
  const folder = mkdtempSync(join(tmpdir(), 'action-pins-'))
  try {
    return execFileSync('git', ['ls-remote', url, ref, `${ref}^{}`], {
      cwd: folder,
      encoding: 'utf8',
      env: gitEnvironment(env, folder),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    })
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

// The address of an action's own repository on GitHub, the only one its tags are read from.
export const actionUrl = (action: string): string => `https://github.com/${action}.git`

// The action's own repository's two refs for the version, tried three times (readRefs is readTagRefs but in
// DPW-04's tests, which see the address it is given).
export function lsRemote(
  action: string,
  version: string,
  readRefs: (url: string, version: string) => string = readTagRefs,
): string {
  let failure: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return readRefs(actionUrl(action), version)
    } catch (error) {
      failure = error
      if (attempt < 3) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000)
    }
  }
  throw new Error(`check-action-pins: couldn't read ${action}'s tags: ${String(failure)}`)
}

// The check, given a reader of an action's tag refs (lsRemote, in CI) and deploy.yml's text (the file's own
// unless a test plants another): it holds deploy.yml's every uses: to ACTION_PINS, reads both tables, prints
// a line for each pin it proves and each problem, and answers the exit code, 1 on any problem or a read that
// fails and 0 only when every uses: in deploy.yml is its table entry and every pin is its version's tag's
// commit. The script exits with it.
export function run(
  read: (action: string, version: string) => string,
  deploy: string = readFileSync(DEPLOY_FILE, 'utf8'),
): number {
  const problems = deployPinProblems(deploy).map(problem => `deploy.yml ${problem}`)
  for (const [where, pins] of [
    ['deploy.yml', ACTION_PINS],
    ["ci.yml's action-pins job", PINS_JOB_ACTIONS],
  ] as const) {
    let found: string[]
    try {
      found = pinProblems(pins, read)
    } catch (error) {
      console.error(`\n${where}: ${error instanceof Error ? error.message : String(error)}`)
      return 1
    }
    for (const [action, pin] of Object.entries(pins)) {
      if (!found.some(problem => problem.startsWith(`${action}:`)))
        console.log(`  ${where}: ${action} ${pin}: its tag's commit`)
    }
    problems.push(...found.map(problem => `${where}: ${problem}`))
  }
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`)
    for (const problem of problems) console.error(`  - ${problem}`)
    return 1
  }
  console.log(
    "Every action deploy.yml pins, and each ci.yml's action-pins job runs first, is at the commit its version names in its own repository.",
  )
  return 0
}

// The script: the checkout first, as the repository this file stands in holds it, and then the pins.
export function main(): number {
  const drift = checkoutDrift(fileURLToPath(new URL('..', import.meta.url)))
  if (drift.length > 0) {
    for (const line of refusedDrift('check-action-pins', drift)) console.error(line)
    return 1
  }
  return run(lsRemote)
}

// Node 22.18 and 24.2 added import.meta.main, but 24.2 left it false on a TypeScript entry, which 24.3 set (by
// Node's changelogs, and a run of 22.18.0, 24.2.0 and 24.3.0; the runner image's own Node 22 has it). On a Node
// without it it is undefined, and on 24.2 false, so main would never be called and the script would exit 0 having
// read no tag: it refuses such a Node instead, by its version as well as by the value (CI's comes from .nvmrc,
// which DPW-04 holds to 24 alone, and a person runs it on Node 24).
const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split('.').map(Number)
const nodeSetsMain = nodeMajor === 22 ? nodeMinor >= 18 : nodeMajor === 24 ? nodeMinor >= 3 : nodeMajor > 24
if (typeof import.meta.main !== 'boolean' || !nodeSetsMain) {
  console.error('check-action-pins: this Node lacks import.meta.main (Node 22.18+, 24.3+), so no pin was read')
  process.exit(1)
}
if (import.meta.main) process.exit(main())
