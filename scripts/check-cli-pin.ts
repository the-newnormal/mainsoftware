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
// or is lower than BASE's. GitHub starts no run when a pull request's base changes, and main's ruleset reads
// the result its head commit already holds, so a branch that already holds main's head (one a retarget to
// main would leave up to date, needing no new push) is compared with origin/main too, whatever its base: the
// result then holds for any base the pull request is moved to (round 11). Both manifests must be regular
// files, each read as itself: git show prints a symbolic link's target path, never the file it names, so a
// link would read as no pin at all, while jq in the deploy jobs reads through it. A base that pins no exact
// version is refused too, since main has pinned one since C0.11 PR 2, so nothing reads as nothing to compare.
import { execFileSync, spawnSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MANIFEST = 'infra/package.json'
const MAIN = 'origin/main'
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
// git ls-tree's line for a regular file (either of git's two modes for one) at the manifest's path.
const REGULAR_ENTRY = /^100(?:644|755) blob [0-9a-f]{40,64}\tinfra\/package\.json$/

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

// What is wrong with moving the pin from base's to head's: each must be an exact version, and head's no lower
// than base's. A base with no exact pin is refused rather than read as nothing to compare: main has pinned one
// since C0.11 PR 2, and a base that can't be read (a manifest made a symbolic link, say) would otherwise pass
// any pin after it (round 11).
export function cliPinProblems(
  base: string | undefined,
  head: string | undefined,
  baseName = 'the base branch',
): string[] {
  const parts = (version: string) => VERSION.exec(version)?.slice(1, 4).map(Number)
  const now = head === undefined ? undefined : parts(head)
  if (now === undefined) return [`${MANIFEST} pins no exact aws-cdk version (${head ?? 'none'})`]
  const then = base === undefined ? undefined : parts(base)
  if (then === undefined) {
    return [
      `${MANIFEST} on ${baseName} pins no exact aws-cdk version (${base ?? 'none'}), so there is nothing to hold the pin to`,
    ]
  }
  for (let i = 0; i < 3; i++) {
    const [a, b] = [now[i] ?? 0, then[i] ?? 0]
    if (a > b) return []
    if (a < b) {
      return [
        `${MANIFEST} pins aws-cdk ${head}, lower than ${base} on ${baseName}: the deploy jobs' CLI would refuse the assemblies a newer library built, a rollback's and prod's previous release's among them, so keep aws-cdk at ${base} or above (a revert of a CDK group's PR keeps it)`,
      ]
    }
  }
  return []
}

// The manifest as a commit holds it, or a problem: it must be a regular file there, never a symbolic link,
// whose git show is its target's path.
function manifestAt(root: string, ref: string): { text: string } | { problem: string } {
  const listed = spawnSync('git', ['ls-tree', ref, '--', MANIFEST], { cwd: root, encoding: 'utf8' })
  if (listed.status !== 0)
    return { problem: `check-cli-pin: ${ref} can't be read (fetch it first, e.g. git fetch origin main)` }
  if (!REGULAR_ENTRY.test(listed.stdout.trimEnd())) return { problem: `${MANIFEST} on ${ref} isn't a regular file` }
  return { text: execFileSync('git', ['show', `${ref}:${MANIFEST}`], { cwd: root, encoding: 'utf8', stdio: 'pipe' }) }
}

// This checkout's manifest, read only when it and its folder are themselves (no symbolic link), as git
// holds them.
function headManifest(root: string): { text: string } | { problem: string } {
  try {
    if (!lstatSync(join(root, 'infra')).isDirectory() || !lstatSync(join(root, MANIFEST)).isFile()) {
      return { problem: `${MANIFEST} in this checkout isn't a regular file in a folder of its own` }
    }
  } catch {
    return { problem: `this checkout has no ${MANIFEST}` }
  }
  return { text: readFileSync(join(root, MANIFEST), 'utf8') }
}

function run(base: string): number {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  // The bases to compare with: BASE, and origin/main whenever this checkout already holds its head.
  if (spawnSync('git', ['rev-parse', '--verify', '--quiet', `${MAIN}^{commit}`], { cwd: root }).status !== 0) {
    console.error(`check-cli-pin: ${MAIN} isn't fetched (git fetch origin main), so no pin was compared`)
    return 2
  }
  const holdsMain = spawnSync('git', ['merge-base', '--is-ancestor', MAIN, 'HEAD'], { cwd: root }).status
  if (holdsMain !== 0 && holdsMain !== 1) {
    console.error(`check-cli-pin: whether HEAD holds ${MAIN}'s head can't be read, so no pin was compared`)
    return 2
  }
  const bases = holdsMain === 0 && base !== MAIN ? [base, MAIN] : [base]
  const head = headManifest(root)
  const problems: string[] = 'problem' in head ? [head.problem] : []
  const pin = 'text' in head ? cliPinOf(head.text) : undefined
  for (const ref of bases) {
    const then = manifestAt(root, ref)
    if ('problem' in then) {
      if (then.problem.startsWith('check-cli-pin:')) {
        console.error(then.problem)
        return 2
      }
      problems.push(then.problem)
    } else if ('text' in head) {
      problems.push(...cliPinProblems(cliPinOf(then.text), pin, ref))
    }
  }
  for (const problem of [...new Set(problems)]) console.error(problem)
  if (problems.length === 0) console.log(`OK: aws-cdk ${pin} is no lower than ${bases.join("'s or ")}'s.`)
  return problems.length === 0 ? 0 : 1
}

// Node 24.2 added import.meta.main; on an older Node it is undefined and nothing would be checked, so such a
// Node is refused (CI's comes from .nvmrc).
if (typeof import.meta.main !== 'boolean') {
  console.error('check-cli-pin: Node 24.2 or later is needed (import.meta.main), so no pin was read')
  process.exit(1)
}
if (import.meta.main) process.exit(run(process.argv[2] ?? MAIN))
