// The CDK CLI's pin never goes down (C0.11 PR 4; TECH-SPEC T24 items 20 and 22). Every credentialed deploy
// job fetches one CLI, its run's commit's pin (infra/package.json's aws-cdk, which DPW-10 holds to the
// lockfile's registry tarball), and deploys or diffs cloud assemblies that older commits' own libraries wrote:
// a rollback's target, prod's previous release, a restore's record. A CLI refuses an assembly whose schema is
// newer than the newest it reads, so a pin lowered on main (the revert of a CDK group's PR, say) would leave
// the pipeline unable to roll back to, or diff, a release the higher pin's library built, and the failed
// release would stay live. Each commit's CLI reads its own library's assemblies (CI's synth steps prove it),
// so a CLI that never goes down reads every ancestor's. A revert of a CDK group's PR reverts aws-cdk-lib,
// constructs and cdk-nag, and keeps aws-cdk.
//
//   node scripts/check-cli-pin.ts [BASE]   (BASE defaults to origin/main)
//
// CI's migrations job runs it on pull requests against the PR's base branch, which that job fetches whole.
// It compares this checkout's infra/package.json with BASE's, and fails when the pin isn't an exact version
// or is lower than BASE's.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MANIFEST = 'infra/package.json'
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

// The aws-cdk version a manifest pins (devDependencies first, as infra's is), or undefined when it names none
// or isn't JSON.
export function cliPinOf(manifest: string): string | undefined {
  try {
    const parsed = JSON.parse(manifest) as Record<string, unknown>
    for (const field of ['devDependencies', 'dependencies']) {
      const entries = parsed[field]
      if (typeof entries !== 'object' || entries === null) continue
      const pin = (entries as Record<string, unknown>)['aws-cdk']
      if (typeof pin === 'string') return pin
    }
  } catch {
    return undefined
  }
  return undefined
}

// What is wrong with moving the pin from base's to head's: head's must be an exact version, and no lower than
// base's when base's is one (a base with no exact pin, before the CLI joined infra, holds nothing to compare).
export function cliPinProblems(base: string | undefined, head: string | undefined): string[] {
  const parts = (version: string) => VERSION.exec(version)?.slice(1, 4).map(Number)
  const now = head === undefined ? undefined : parts(head)
  if (now === undefined) return [`${MANIFEST} pins no exact aws-cdk version (${head ?? 'none'})`]
  const then = base === undefined ? undefined : parts(base)
  if (then === undefined) return []
  for (let i = 0; i < 3; i++) {
    const [a, b] = [now[i] ?? 0, then[i] ?? 0]
    if (a > b) return []
    if (a < b) {
      return [
        `${MANIFEST} pins aws-cdk ${head}, lower than ${base} on the base branch: the deploy jobs' CLI would refuse the assemblies a newer library built, a rollback's and prod's previous release's among them, so keep aws-cdk at ${base} or above (a revert of a CDK group's PR keeps it)`,
      ]
    }
  }
  return []
}

function run(base: string): number {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  let then: string
  try {
    then = execFileSync('git', ['show', `${base}:${MANIFEST}`], { cwd: root, encoding: 'utf8', stdio: 'pipe' })
  } catch {
    console.error(`check-cli-pin: ${base} has no ${MANIFEST} (fetch it first, e.g. git fetch origin main)`)
    return 2
  }
  const head = cliPinOf(readFileSync(join(root, MANIFEST), 'utf8'))
  const problems = cliPinProblems(cliPinOf(then), head)
  for (const problem of problems) console.error(problem)
  if (problems.length === 0) console.log(`OK: aws-cdk ${head} is no lower than ${cliPinOf(then) ?? 'none'} on ${base}.`)
  return problems.length === 0 ? 0 : 1
}

// Node 24.2 added import.meta.main; on an older Node it is undefined and nothing would be checked, so such a
// Node is refused (CI's comes from .nvmrc).
if (typeof import.meta.main !== 'boolean') {
  console.error('check-cli-pin: Node 24.2 or later is needed (import.meta.main), so no pin was read')
  process.exit(1)
}
if (import.meta.main) process.exit(run(process.argv[2] ?? 'origin/main'))
