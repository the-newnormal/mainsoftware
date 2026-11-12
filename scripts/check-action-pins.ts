// deploy.yml's action pins against each action's own repository (C11-D48, C11-D79, DPW-04; TECH-SPEC T24
// item 28). It runs in CI's check job, which has the network, and before a PR that moves a pin:
//
//   node scripts/check-action-pins.ts
//
// For each entry of ACTION_PINS (scripts/guards/action-pins.ts), which DPW-04 holds every uses: in
// deploy.yml to, it reads the version's tag from https://github.com/<action>.git with git ls-remote, and
// requires the commit the tag names (the peeled commit of an annotated tag, the tag's own of a lightweight
// one) to be exactly the pinned commit. A commit that exists only in a fork resolves under the action's name
// on GitHub but is named by no tag of the action's repository, and an older release's commit isn't its newer
// version's tag's, so neither passes. Only the two exact refs are read (ls-remote matches a pattern against
// the tail of a ref's name, so refs/tags/x/v1.0.0 would match too). Reading is tried three times, since the
// network can blip; a pin that differs fails at once. It prints one line per action and exits 1 on any
// problem.
import { execFileSync } from 'node:child_process'
import { ACTION_PINS, ACTION_SHAPE, PIN_SHAPE } from './guards/action-pins.ts'

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

// git ls-remote for the version's two refs, with no prompt for a password (the repositories are public).
function lsRemote(action: string, version: string): string {
  const ref = `refs/tags/${version}`
  let failure: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return execFileSync('git', ['ls-remote', `https://github.com/${action}.git`, ref, `${ref}^{}`], {
        encoding: 'utf8',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      })
    } catch (error) {
      failure = error
      if (attempt < 3) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000)
    }
  }
  throw new Error(`check-action-pins: couldn't read ${action}'s tags: ${String(failure)}`)
}

function main(): void {
  const problems = pinProblems(ACTION_PINS, lsRemote)
  for (const [action, pin] of Object.entries(ACTION_PINS)) {
    if (!problems.some(problem => problem.startsWith(`${action}:`))) console.log(`  ${action} ${pin}: its tag's commit`)
  }
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`)
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log('Every action deploy.yml pins is at the commit its version names in its own repository.')
}

if (import.meta.main) main()
