// The rollback floors (C11-D58): each contracting migration (a drop or rename an older image still
// uses), with why. PR 4's infra/scripts/deploy/floors-check.ts refuses a rollback to a release whose
// db/migrations lacks a floor's file, so a contraction lands in a later release than the expansion
// it follows, and the PR that adds the contraction adds its floor here.
//
// The list starts empty: the first prod deploy already includes 0014, and a rollback reaches only a
// release that environment has run. Removing a floor permits an unsafe rollback, so this file is on
// the owner's-read list (C11-D74). It imports nothing, since the gate runs it without npm ci (IG-08).

// One floor: the migration's file name in db/migrations/, and why an image older than it breaks.
export interface Floor {
  migration: string
  why: string
}

export const FLOORS: readonly Floor[] = []
