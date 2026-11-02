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
- The records of tier-2 changes the people who ran them kept for this review, and the set-up's notes.
- The ops mailbox's alert emails of the quarter, every ALARM and OK email from management's topic among them, kept until this review (step 9).

## Steps

1. In management, run each saved query on `/hearth/security/org-trail` over the quarter in UTC (Logs Insights' UTC setting, not local time), since the entries' folders are UTC days and `validate-logs` takes UTC times: a range set in Singapore time would put a session begun between midnight and 8 a.m. on the quarter's first day into this quarter's query while its entries sit in the last quarter's folder, so it would read as a use with no entry.
   - `hearth/review/break-glass-sessions`: every break-glass assumption, with its session name, reason and source identity, refused ones included;
   - `hearth/review/admin-sessions`: every `HearthOrgAdmin` and `HearthSetUp` session, and every assumption of `OrganizationAccountAccessRole` or of a hearthbase role (`cdk-hearthbase-*`, what A15 alarms on);
   - `hearth/review/deploy-role-sessions`: the GitHub roles' sessions (`hearth-gh-deploy` and `hearth-gh-diff`), by account;
   - `hearth/review/root-and-assume-root`: any root activity and `AssumeRoot`;
   - `hearth/review/recovery-moves`: every account moved between OUs, with the ids of the OUs it left and joined, so the moves into and out of `Recovery` show by its id;
   - `hearth/review/break-glass-entry-writes`: every put on the break-glass-log bucket, refused ones included, with its error code, the writing session (`userIdentity.arn`, the name after `assumed-role/hearth-break-glass/`) and its source identity beside the key, each key's puts together (step 3's writer check).
2. In log-archive, list the quarter's break-glass entries in every account's folder, and read each one. The log bucket is `hearth-break-glass-log-` followed by log-archive's account id, which `aws sts get-caller-identity --query Account --output text` prints in your log-archive session. `aws s3api list-objects-v2 --bucket <the log bucket> --prefix break-glass/ --delimiter / --query 'CommonPrefixes[].Prefix'` lists every account's folder, and `aws s3api list-objects-v2 --bucket <the log bucket> --prefix break-glass/<account>/<yyyy>/<mm>/` each folder's entries for a month. The folders are the UTC days the sessions began, so list the quarter's months in UTC. List them from the bucket, never only for the accounts the first query prints: the queries read the trail's CloudWatch copy, which shows nothing at all if it has stopped receiving the trail.
   - Each entry was written once: for each account's folder and month, `aws s3api list-object-versions --bucket <the log bucket> --prefix break-glass/<account>/<yyyy>/<mm>/` lists every version and delete marker. Each entry's key holds exactly one version and no delete marker; a key with more is a finding (the bucket's `EntriesNeverReplaced` should have refused the second put), and every version of it is read.
   - The accounts the trail delivers for are the trail bucket's folders, which come from the trail itself, not its copy: `aws organizations describe-organization --query Organization.Id --output text` prints the organisation's id, and `aws s3api list-objects-v2 --bucket <the trail bucket> --prefix AWSLogs/<the organisation's id>/ --delimiter / --query 'CommonPrefixes[].Prefix' --output text` lists one folder per account, named by its id. The trail bucket is `hearth-org-trail-` followed by log-archive's account id. Expect four, management, log-archive, non-prod and prod, whether or not anyone broke glass into them; one more or one fewer is a finding. Management's is the account in the trail's ARN, which `describe-trails` prints (below).
   - If the set-up's notes record a trail copy removed after Foundation's failed first deploy (with its event count and times), list the trail bucket (`hearth-org-trail-` and the same id) for those days, under `AWSLogs/`, and check it holds log files for those times; if it doesn't, it is a finding.
   - Validate the quarter's trail files against their signed digests, which shows a delivered file overwritten or deleted since. For each of the four accounts the trail bucket's folders name (above), management included, and in each of ap-southeast-1 and us-east-1, where the trail delivers the global services' events: `aws cloudtrail validate-logs --trail-arn <the trail> --account-id <the account> --start-time <the quarter's first day, as 2026-07-01T00:00:00Z> --region <the Region>`. `aws cloudtrail describe-trails --region ap-southeast-1 --query 'trailList[].TrailARN' --output text` prints the trail, `hearth-org-trail`. Each run ends by counting the digest and log files it found valid. An `AccessDenied` is a finding to raise, never a pass: the reviewer's reads, or `hearth-region`'s fence for them, have changed. Any `INVALID`, a missing file, or a gap it reports goes to [A suspected breach of personal data](breach.md), with `aws s3api list-object-versions --bucket <the trail bucket> --prefix <the key it names>` read for the keys it names. Record counts and results, never a key.
3. For each break-glass session the first query lists, and each session an entry names, reconcile three sources: the trail's assumption, the entries, and the merged PRs (and, from C0.11 PR 4, the deploy history). Every entry is keyed by its own session, the `session` it names, under the UTC day that session began. An entry keyed by a session the first query doesn't list is a finding: the copy missed the trail's event, and the Owner reads the trail's delivery to it at once (step 9). A session an entry names only in `continues` or `amends` may have begun in an earlier quarter: reconcile it with that quarter's record, not as a missed trail event. Check:
   - an open entry and a close entry exist, keyed by the session's name (`hearth-bg-` and its time), and each entry's `session` and `environment` match its key and the account its folder names;
   - the reason is a reference in its exact form, and holds no name;
   - the runbook named fits the reason;
   - a `case:` reference is a real request (the DPO confirms it);
   - an `lz:pr-` number is a merged PR whose diff matches what was deployed;
   - the close entry's modes and ids fit the runbook, and hold no name, number or address;
   - a session closed within two minutes of its hour, or after it, has a continuation entry, re-assumed under the same reason, if the person signed in again; one that stopped unprompted past its hour has no continuation and no close entry, so reconcile it from the trail. A session that began in the last hour before the quarter has its open and close in the previous quarter's folder and its continuation in this one;
   - a close entry with outcome `stopped` and no modes was written by the helper on its own, as it stopped: note what stopped it;
   - an amend entry, keyed by its own session under its own day, names the session it amends (`amends`, which may be an earlier quarter's), under that session's reason, and the amend's own session wrote nothing else;
   - a refused attempt with a reason that isn't a reference is a finding, since its tags stay in the trail;
   - each entry was written by the session its key names, from `hearth/review/break-glass-entry-writes`: the key's successful put came from the session after `assumed-role/hearth-break-glass/` in its `userIdentity.arn`, and the writer's source identity is the one on the `hearth/review/break-glass-sessions` row in the key's account whose `requestParameters.roleSessionName` equals that session name: match by name, never by source identity alone. Read the row whose `recipientAccountId` is the key's account, since log-archive's copy of another account's put may carry no session. Two writers are expected besides: a close written by the continuation session whose entry's `continues` names the key's session, with the same source identity, and an amend, `<the amend's own session>-amend-<the amended session's time>.json`, written by the amend's own session. Refused puts of a key that holds an entry have one expected shape: its successful put by one of those writers, followed within minutes only by refused puts of it with `PreconditionFailed`, from that same session or one whose continuation entry `continues` the same session, under the same source identity. That is the AWS CLI retrying a put whose reply was lost, which then meets the stored entry, and, for a close, the helper's own unprompted second try, made with the same session's credentials (or, if the hour's last two minutes began in between, by a new session that writes its own continuation entry first). The helper then reported the entry unwritten, so the person's note of an unwritten entry may stand beside an entry that exists. Each of these is a finding for [A suspected breach of personal data](breach.md): any other writer; two sessions sharing a name (one session name on more than one successful assumption in one account, in `hearth/review/break-glass-sessions`); a successful assumption whose name isn't of the helper's form, `hearth-bg-<UTC time>` with that time at most a few seconds before the assumption's own `@timestamp` (the helper reads the clock just before it assumes the role, so the two can't match to the second); any other refused put of a key that already holds an entry (beyond step P.1's drill, which the set-up's notes record), an `AccessDenied` or one by another session or source identity among them; an entry with no put row. The role's trust doesn't constrain session names, so another session in the account can take an open session's name: the by-name match then finds two assumptions under it, which is the finding itself. Record counts, never a key or a name.
4. Each hearthbase assumption (A15) the second query lists has an `lz:` reason and a merged PR, a reviewed Foundation deploy (with its A3), the set-up's first deploys, or a recorded tier-2 change.
5. Each `HearthOrgAdmin` session and each assumption of `OrganizationAccountAccessRole` has a reason: a reviewed Foundation deploy, a tier-2 change, or the set-up. A `HearthSetUp` session after the set-up is a finding.
6. Each deploy-role session matches the deploy history (from C0.11 PR 4).
7. List the quarter's `HearthSecurityReview` sessions, your own included, with this query on the same log group (no saved query lists them), and check each against who should hold the set. Run it again at the end of the review, over today: today's own sessions, in management and in log-archive, must be listed (the copy receives them within about 15 minutes). If they aren't, the copy has stopped receiving the trail, and every assured alarm with it: it is a finding, and the Owner reads the trail's delivery to it at once (step 9).

   ```
   fields @timestamp, recipientAccountId, errorCode
   | filter eventName = "AssumeRoleWithSAML" and requestParameters.roleArn like /AWSReservedSSO_HearthSecurityReview_/
   | sort @timestamp desc
   ```

8. Check who holds what in Identity Center, which only an Owner can list:
   - While you watch, the Owner, with `HearthOrgAdmin`, shows each account's assignments (Identity Center's *AWS accounts*, or `aws sso-admin list-account-assignments` for each account and permission set) and each group's members (`aws identitystore list-group-memberships`). Every assignment is to a group, never to a person, and they are exactly the landing zone's: `HearthOrgAdmin`, `HearthSecurityReview` and `HearthBilling` in management; `HearthBreakGlassEntry` in prod, log-archive and non-prod; `HearthSecurityReview` in log-archive; and `HearthNonprodOperator` in non-prod only until it holds real data. So nobody but the on-call group holds anything in prod. Each group holds only the people who should be in it.
   - Then run this query on the same log group over the quarter, which lists every change to Identity Center by the names A4 watches, and match each with the A4 episode that covers it and with a reviewed PR or a person an Owner added or removed. Several changes in one episode share its ALARM and OK emails. An episode covers changes from its first breaching period, which its ALARM email's *Reason for State Change* names, up to 15 minutes and a period before that email, until its OK email ([A security alert](security-alerts.md#finding-an-assured-alarms-calls), step 1): match by each change's `@timestamp`, not by the emails' times.

   ```
   fields @timestamp, eventSource, eventName, errorCode
   | filter (eventSource = "sso.amazonaws.com" and eventName like /PermissionSet|AccountAssignment|AccessControlAttribute|Instance$|Configuration$|Directory|Trust|Application|Profile|Region$|PermissionsPolicy$|^TagResource$|^UntagResource$|^StartSSO$/) or eventSource = "identitystore.amazonaws.com" or eventSource = "sso-directory.amazonaws.com"
   | filter eventName not like /^(Get|List|Describe|Search|IsMember)/
   | sort @timestamp desc
   ```

   Record counts and findings, never a name.
9. With the Owner, check that the quarter's read-backs in management were done ([the set-up runbook's *The quarterly read-backs*](aws-account-set-up.md#the-quarterly-read-backs)): every `hearth-sec` alarm, the copy's intake alarm among them, with its actions on and management's topic alone as its alarm action and as its OK action, and its state (`StateValue`) `OK` unless an episode the notes explain is open, each of the quarter's episodes reconciled from the mailbox's ALARM and OK emails and the alarm's hourly statistics with the calls found, and the last 30 days' history with the emails (CloudWatch keeps an alarm's history for 30 days only, so its history can't show the quarter's first two months: [the set-up runbook's *Check it worked*](aws-account-set-up.md#check-it-worked) says how), no alarm mute rule (`aws cloudwatch list-alarm-mute-rules` lists none), management's topic with one email subscription, confirmed and authenticated, the trail delivering to its copy (`get-trail-status`'s CloudWatch Logs error empty and its last delivery within the hour, and `get-trail` naming the copy and `hearth-org-trail-logs`), with no start or stop of its logging since the last read-back that a reviewed change doesn't explain (`get-trail-status`'s `StartLoggingTime` and `StopLoggingTime`), and the trail query there showing no change to any other account's topic. A management session can silence those alarms before they email anyone, by turning their actions off or muting them with a mute rule, which only this read and the trail would show, or by holding one in ALARM with datapoints put into `Hearth/Security`, which the trail doesn't record and only the state, the alarm's metric, the mailbox and, for 30 days, its history show.
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
