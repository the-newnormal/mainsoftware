# The quarterly review of break-glass uses

## Use this when

- Each quarter. The first is before production's v0, by C0.19.
- After any unexpected A1, A15 or tier-2 use ([A security alert](security-alerts.md)).

## Who does what

- The second reviewer runs the review, with `HearthSecurityReview` alone: read-only, and never the archive bucket. They needn't be technical.
- The person on call answers the reviewer's questions.
- The DPO reads the record, and confirms that each `case:` reference is a real request without naming anyone.
- The owner fixes what the review finds.
- A coding agent runs no step and sees no log line.

## Before you start

- `HearthSecurityReview` in management and in log-archive (a 4-hour session).
- The quarter's dates.
- Read access to the repository's merged PRs and, from C0.11 PR 4, its deployment history.
- The records of tier-2 changes the people who ran them kept for this review.

## Steps

1. In management, run each saved query on `/hearth/security/org-trail` over the quarter:
   - `hearth/review/break-glass-sessions`: every break-glass assumption, with its reason and source identity, refused ones included;
   - `hearth/review/admin-sessions`: every `HearthOrgAdmin` and `HearthSetUp` session, and every assumption of `OrganizationAccountAccessRole`;
   - `hearth/review/deploy-role-sessions`: the GitHub deploy roles' sessions, by environment;
   - `hearth/review/root-and-assume-root`: any root activity and `AssumeRoot`;
   - `hearth/review/recovery-moves`: every account moved into or out of `Recovery`.
2. In log-archive, list the quarter's break-glass entries (`aws s3api list-objects-v2 --bucket <the log bucket> --prefix break-glass/<account>/<yyyy>/<mm>/`), and read each one.
3. For each break-glass session the first query lists, reconcile three sources: the trail's assumption, the entries, and the merged PRs (and, from C0.11 PR 4, the deploy history). Check:
   - an open entry and a close entry exist, keyed by the session's name (`hearth-bg-` and its time);
   - the reason is a reference in its exact form, and holds no name;
   - the runbook named fits the reason;
   - a `case:` reference is a real request (the DPO confirms it);
   - an `lz:pr-` number is a merged PR whose diff matches what was deployed;
   - the close entry's modes and ids fit the runbook, and hold no name, number or address;
   - a session past its hour has a continuation entry, re-assumed under the same reason;
   - an amend entry names both its own session and the one it amends, under the amended session's reason, and the amend's own session wrote nothing else;
   - a refused attempt with a reason that isn't a reference is a finding, since its tags stay in the trail.
4. Each A15 has an `lz:` reason and a merged PR, a reviewed Foundation deploy (with its A3), the set-up's first deploys, or a recorded tier-2 change.
5. Each `HearthOrgAdmin` session and each assumption of `OrganizationAccountAccessRole` has a reason: a reviewed Foundation deploy, a tier-2 change, or the set-up. A `HearthSetUp` session after the set-up is a finding.
6. Each deploy-role session matches the deploy history (from C0.11 PR 4).
7. List the quarter's `HearthSecurityReview` sessions, your own included.
8. Check Identity Center's users, groups and assignments against who should hold each: nobody but the on-call group in prod, and `HearthNonprodOperator` gone once non-prod holds real data.
9. A use with no reason behind it goes to [A suspected breach of personal data](breach.md).

## Check it worked

- Every session the queries list is reconciled with its entries, or recorded as a finding.
- The record is written and dated.

## Afterwards

- The record holds counts, references, dates and findings, never a name, and is kept off GitHub, in the DPO's records. The DPO notes it.
- C0.19's first review lets the notice's warning that production access is still to be reviewed drop (TECH-SPEC T22 item 37).

## Don't

- Copy log lines, account ids, ARNs or names into GitHub, a chat or this repository.
- Try to read the archive bucket or use its key: no role may, until C0.17.
- Change anything, in any account.
- Let a coding agent run any step.

## Code paths

- `infra/src/foundation/org-trail.ts`
- `infra/src/foundation/identity-center.ts`
- `infra/src/foundation/log-archive.ts`
- `infra/bin/break-glass.sh`
- `packages/shared/src/notice-text.ts`
- `break_glass_log`
- `cloudtrail`
