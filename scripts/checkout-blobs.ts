// The checkout as its commit holds it (C0.11 PR 4; TECH-SPEC T24 items 22, 28 and 31). A checkout writes each
// file through its git attributes (the index's .gitattributes first, then the working tree's), and five of them
// write other bytes than the blob's: ident rewrites a span from $Id: to the next $ that holds no blank or line
// break, eol and text change line endings, filter runs a configured program, and working-tree-encoding
// re-encodes the file. The owner reads a pull request's blobs, and GitHub runs a workflow from its blob, while
// CI's checks and the deploy jobs run and read the checkout: a manifest whose blob pins one CDK CLI could check
// out pinning a lower one, which CLI_FETCH then fetched while the CLI pin check read the blob, and a check could
// compare in its blob and compare nothing in its checkout (round 12's third iteration). So the two checks that
// run first in their jobs, with nothing of the repository's before them (scripts/check-cli-pin.ts and
// scripts/check-action-pins.ts), first refuse a checkout whose files aren't their committed blobs, byte for byte,
// whatever attribute or step made them differ, and DPW-02 refuses any git attribute on any file as a second layer.
// This can't hold the check that calls it, or a module imported before it runs (this one among them), since an
// attribute that rewrites a file can rewrite the call too: so each job's step, read from the workflow's blob,
// first writes every file again as its blob (BLOB_RESET, in the deploy-workflow guard), before node runs either
// check (round 12's fourth iteration).
// This file decides what those two checks run on, so it is on the owner's-read list beside them.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'

// One entry of git ls-tree -r -z: its mode, type, object id and path.
const ENTRY = /^(\d{6}) (blob|tree|commit) ([0-9a-f]{40}|[0-9a-f]{64})\t([^\0]+)$/

// Each file HEAD commits whose checkout isn't its blob, as a line naming the path and never its bytes: a
// regular file's bytes and a symbolic link's target (or the file a checkout without links writes in its place)
// hashed as git hashes a blob, in the repository's own object format, against the id HEAD's tree names. A
// submodule is skipped, since no checkout here writes one; anything else is a problem.
export function checkoutDrift(root: string): string[] {
  const format = execFileSync('git', ['rev-parse', '--show-object-format'], { cwd: root, encoding: 'utf8' }).trim()
  if (format !== 'sha1' && format !== 'sha256') return [`git names an object format this check doesn't read`]
  const listed = execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  const problems: string[] = []
  for (const entry of listed.split('\0')) {
    if (entry === '') continue
    const [, mode = '', type = '', id = '', path = ''] = ENTRY.exec(entry) ?? []
    if (path === '') {
      problems.push('git ls-tree printed an entry this check does not read')
      continue
    }
    if (type === 'commit') continue
    const file = join(root, path)
    let bytes: Buffer
    try {
      const stat = lstatSync(file)
      if (mode === '120000' && stat.isSymbolicLink()) bytes = readlinkSync(file, { encoding: 'buffer' })
      else if (stat.isFile() && (mode === '100644' || mode === '100755' || mode === '120000'))
        bytes = readFileSync(file)
      else {
        problems.push(`${path}: the checkout holds another kind of file than its commit`)
        continue
      }
    } catch {
      problems.push(`${path}: the checkout doesn't hold it`)
      continue
    }
    const hash = createHash(format).update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    if (hash !== id) problems.push(`${path}: the checkout's bytes aren't its committed blob's`)
  }
  return problems
}

// The lines a check prints before it refuses, and stops: the drift found, then what it means.
export function refusedDrift(check: string, drift: readonly string[]): string[] {
  return [
    ...drift,
    `${check}: the checkout isn't what HEAD commits (a git attribute, such as ident, eol, text, filter or working-tree-encoding, or a step before this wrote other bytes), so nothing was checked`,
  ]
}
