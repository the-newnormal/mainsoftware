// The rollback floors (C11-D58): each contracting migration (a drop or rename an older image still
// uses), the expansion it follows, and why. PR 4's infra/scripts/deploy/floors-check.ts refuses a
// rollback to a release whose db/migrations lacks a floor's file, so a contraction lands in a later
// release than the expansion it follows, and the PR that adds the contraction adds its floor here. The
// gate also refuses a forward deploy to an environment whose release lacks a floor's file and predates
// its expansion (history.ts, expansion-not-deployed): the migrate step would contract the database under
// that release while it still serves, and a failed Services deploy's own rollback would return it there.
// A floor naming a file its commit lacks is malformed, and every floors check refuses it; one whose
// expansion is off main, or at or after its contraction (already holding the file), the forward
// deploy's check refuses. Name the expansion's own commit on main (the one its pull request landed as),
// and merge the contraction only once both environments' newest release records, and what each runs
// (its newest read-back), descend from it (deploy-and-rollback.md's Floors): the gate reads the records
// alone, and a forward deploy deploys main's head alone, so once the contraction is on main no dispatch
// takes an environment to the expansion by itself.
//
// The list starts empty: the first prod deploy already includes 0014, and a rollback reaches only a
// release that environment has run. Removing a floor permits an unsafe rollback, so this file is on
// the owner's-read list (C11-D74). It imports nothing, since the gate runs it without npm ci (IG-08).

// One floor: the migration's file name in db/migrations/; the commit on main of the expansion it follows,
// from which on every release runs on the database the migration leaves (the oldest such release, which
// lacks the migration); and why an image older than it breaks.
export interface Floor {
  migration: string
  expansion: string
  why: string
}

export const FLOORS: readonly Floor[] = []
