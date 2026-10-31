# The quarterly review of break-glass uses

## Use this when

- Each quarter. The first is before production's v0, by C0.19.
- After any unexpected A1, A15 or tier-2 use ([A security alert](security-alerts.md)).

## Who does what

- The second reviewer runs the review, with `HearthSecurityReview` alone: read-only, and never the archive bucket. They needn't be technical.
- An Owner, with `HearthOrgAdmin` in management, lists Identity Center's assignments and groups while the reviewer watches (step 8), since `HearthSecurityReview` reads no directory. A3 alarms on that session, which the review expects.
- The person on call answers the reviewer's questions.
- The DPO reads the record, and confirms that each `case:` reference is a real request without naming anyone.
- The owner fixes what the review finds.
- A coding agent runs no step and sees no log line.

## Before you start

- `HearthSecurityReview` in management and in log-archive (a 4-hour session).
- An Owner with `HearthOrgAdmin`, for step 8.
- The quarter's dates.
- Read access to the repository's merged PRs and, from C0.11 PR 4, its deployment history.
- The records of tier-2 changes the people who ran them kept for this review.

## Steps

1. In management, run each saved query on `/hearth/security/org-trail` over the quarter:
   - `hearth/review/break-glass-sessions`: every break-glass assumption, with its reason and source identity, refused ones included;
   - `hearth/review/admin-sessions`: every `HearthOrgAdmin` and `HearthSetUp` session, and every assumption of `OrganizationAccountAccessRole` or of a hearthbase role (`cdk-hearthbase-*`, what A15 alarms on);
   - `hearth/review/deploy-role-sessions`: the GitHub roles' sessions (`hearth-gh-deploy` and `hearth-gh-diff`), by account;
   - `hearth/review/root-and-assume-root`: any root activity and `AssumeRoot`;
   - `hearth/review/recovery-moves`: every account moved between OUs, with the ids of the OUs it left and joined, so the moves into and out of `Recovery` show by its id.
2. In log-archive, list the quarter's break-glass entries (`aws s3api list-objects-v2 --bucket <the log bucket> --prefix break-glass/<account>/<yyyy>/<mm>/`), and read each one.
3. For each break-glass session the first query lists, reconcile three sources: the trail's assumption, the entries, and the merged PRs (and, from C0.11 PR 4, the deploy history). Check:
   - an open entry and a close entry exist, keyed by the session's name (`hearth-bg-` and its time);
   - the reason is a reference in its exact form, and holds no name;
   - the runbook named fits the reason;
   - a `case:` reference is a real request (the DPO confirms it);
   - an `lz:pr-` number is a merged PR whose diff matches what was deployed;
   - the close entry's modes and ids fit the runbook, and hold no name, number or address;
   - a session closed within two minutes of its hour, or after it, has a continuation entry, re-assumed under the same reason, if the person signed in again; one that stopped unprompted past its hour has no continuation and no close entry, so reconcile it from the trail;
   - a close entry with outcome `stopped` and no modes was written by the helper on its own, as it stopped: note what stopped it;
   - an amend entry names both its own session and the one it amends, under the amended session's reason, and the amend's own session wrote nothing else;
   - a refused attempt with a reason that isn't a reference is a finding, since its tags stay in the trail.
4. Each hearthbase assumption (A15) the second query lists has an `lz:` reason and a merged PR, a reviewed Foundation deploy (with its A3), the set-up's first deploys, or a recorded tier-2 change.
5. Each `HearthOrgAdmin` session and each assumption of `OrganizationAccountAccessRole` has a reason: a reviewed Foundation deploy, a tier-2 change, or the set-up. A `HearthSetUp` session after the set-up is a finding.
6. Each deploy-role session matches the deploy history (from C0.11 PR 4).
7. List the quarter's `HearthSecurityReview` sessions, your own included, with this query on the same log group (no saved query lists them), and check each against who should hold the set:

   ```
   fields @timestamp, recipientAccountId, errorCode
   | filter eventName = "AssumeRoleWithSAML" and requestParameters.roleArn like /AWSReservedSSO_HearthSecurityReview_/
   | sort @timestamp desc
   ```

8. Check who holds what in Identity Center, which only an Owner can list:
   - While you watch, the Owner, with `HearthOrgAdmin`, shows each account's assignments (Identity Center's *AWS accounts*, or `aws sso-admin list-account-assignments` for each account and permission set) and each group's members (`aws identitystore list-group-memberships`). Every assignment is to a group, never to a person, and they are exactly the landing zone's: `HearthOrgAdmin`, `HearthSecurityReview` and `HearthBilling` in management; `HearthBreakGlassEntry` in prod, log-archive and non-prod; `HearthSecurityReview` in log-archive; and `HearthNonprodOperator` in non-prod only until it holds real data. So nobody but the on-call group holds anything in prod. Each group holds only the people who should be in it.
   - Then run this query on the same log group over the quarter, which lists every change to Identity Center, and match each with its A4 email and with a reviewed PR or a person an Owner added or removed:

   ```
   fields @timestamp, eventSource, eventName, errorCode
   | filter (eventSource = "sso.amazonaws.com" and eventName like /PermissionSet|AccountAssignment|AccessControlAttribute|Instance$/) or eventSource = "identitystore.amazonaws.com" or eventSource = "sso-directory.amazonaws.com"
   | filter eventName not like /^(Get|List|Describe|Search|IsMember)/
   | sort @timestamp desc
   ```

   Record counts and findings, never a name.
9. With the Owner, check that the quarter's read-backs in management were done ([the set-up runbook's *The quarterly read-backs*](aws-account-set-up.md#the-quarterly-read-backs)): every `hearth-sec` alarm with its actions on and management's topic alone as its action, management's topic with one email subscription, confirmed and authenticated, and the trail query there showing no change to any other account's topic. A management session can silence those alarms before they email anyone, which only this read and the trail would show.
10. A use with no reason behind it goes to [A suspected breach of personal data](breach.md).

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
