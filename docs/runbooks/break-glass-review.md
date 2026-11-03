# The quarterly review of break-glass uses

## Use this when

- Each quarter. The first is before production's v0, by C0.19.
- After any unexpected A1, A15 or tier-2 use ([A security alert](security-alerts.md)).

## Who does what

- The second reviewer runs the review, with `HearthSecurityReview` alone: read-only, and never the archive bucket. They needn't be technical.
- An Owner, with `HearthOrgAdmin` in management, shows which account and OU id is which before step 1, and lists Identity Center's assignments and groups (step 8), each while the reviewer watches, since `HearthSecurityReview` sees accounts and OUs only as the policies' targets, by id and name, never their state, and can't read the directory. A3 alarms on that session, which the review expects.
- The person on call answers the reviewer's questions.
- The DPO reads the record, and confirms that each `case:` reference is a real request without naming anyone.
- The owner fixes what the review finds.
- A coding agent runs no step and sees no log line.

## Before you start

- `HearthSecurityReview` in management and in log-archive (a 4-hour session).
- An Owner with `HearthOrgAdmin`, for the ids before step 1 and for step 8.
- The quarter's dates.
- Read access to the repository's merged PRs and, from C0.11 PR 4, its deployment history, `gh`, signed in, and `jq`.
- This repository's current name and two ids, which step 6's comparison reads once, before it compares anything: `env -u GH_REPO -u GH_HOST gh api 'repos/{owner}/{repo}'`, run in a checkout of `main`, where gh fills `{owner}/{repo}` from the checkout's own remote (as the set-up runbook's step E.2 does), or, without a checkout, with `{owner}/{repo}` replaced by the owner and name in the address of the repository page whose merged PRs you read. Clearing `GH_REPO` and `GH_HOST` keeps a stray setting from choosing the repository. Take the name it prints, not the one it was asked for, since GitHub answers a former name of a renamed or transferred repository with the repository it now names. Never ask it for a name taken from a row, an alert, a finding, the set-up's notes or `infra/.env.local`: GitHub would answer for whatever repository that name is. The one exception is step 6's check of a former name, which asks only for that name's repository id, to compare it with this read's, and never builds a subject from it.
- The records of tier-2 changes the people who ran them kept for this review, the set-up's notes, and the on-call notes (step 6 reads each A10 email's note where the analyzer no longer holds its finding).
- The ops mailbox's alert emails of the quarter, kept until this review: every ALARM and OK email from management's topic (step 9), and every A10 email from log-archive's (step 6; at the first review, from the set-up's first day, as its second read).

## Steps

First, which id is which. The queries and the buckets show accounts and OUs by id alone, and `HearthSecurityReview` can't read an account's state, so while you watch, the Owner, with `HearthOrgAdmin` in management, shows each account's id by its name (`aws organizations list-accounts --query 'Accounts[].[Id,Name,State]' --output table`) and each OU's (`aws organizations list-roots --query 'Roots[].Id' --output text` prints the root, then `aws organizations list-organizational-units-for-parent --parent-id <the root> --query 'OrganizationalUnits[].[Id,Name]' --output table`). Expect exactly four accounts, management, log-archive, non-prod and prod, each `ACTIVE` (any other state, `SUSPENDED` or `PENDING_CLOSURE` say, is a finding), and three OUs under the root, `Security`, `Workloads` and `Recovery`; any other is a finding. Then check those ids yourself, in your management session: `aws organizations list-targets-for-policy --policy-id p-FullAWSAccess --query 'Targets[].[Type,TargetId,Name]' --output table` lists the root and every OU and account by id and name, since AWS's `FullAWSAccess` stays attached to each. Every id and name must match what the Owner showed; a difference is a finding. Note which id is which for this review alone, off GitHub and out of the record, and destroy the note once the record is written: the Owner shows them again next quarter. Steps 1 to 6 read accounts, OUs and the root by this note.

1. In management, run each saved query on `/hearth/security/org-trail` over the quarter and a day either side of it, in UTC (Logs Insights' UTC setting, not local time), since the entries' folders are UTC days and `validate-logs` takes UTC times. Each row shows two times: `@timestamp`, when the copy received the event, which a query's range goes by, and `eventTime`, when the call was made. CloudTrail's guide says the copy's time is its delivery's, typically about 5 minutes after the call and not promised, so a call made in the quarter's last minutes can be stamped in the next quarter; and a session's close, or its continuation, can come an hour or so after it began. So take each row into the quarter it belongs to, never by its `@timestamp`: a break-glass assumption by the UTC time in its session's name (for a name not of the helper's form, by its `eventTime`), a put on the break-glass-log bucket by the session its key names, and any other row by its `eventTime`. A row that belongs to the quarter before or after is that quarter's record, read here only to reconcile this quarter's sessions with it (step 3).
   - `hearth/review/break-glass-sessions`: every break-glass assumption, with its session name, reason and source identity, refused ones included;
   - `hearth/review/admin-sessions`: every `HearthOrgAdmin` and `HearthSetUp` session, and every assumption of `OrganizationAccountAccessRole` or of a hearthbase role (`cdk-hearthbase-*`, what A15 alarms on);
   - `hearth/review/deploy-role-sessions`: the GitHub roles' sessions (`hearth-gh-deploy` and `hearth-gh-diff`), by account;
   - `hearth/review/root-and-assume-root`: any root activity and `AssumeRoot`;
   - `hearth/review/recovery-moves`: every account moved between OUs, with the ids of the OUs it left and joined, so the moves into and out of `Recovery`, and any other move, show by the ids the Owner showed (step 5 checks each);
   - `hearth/review/break-glass-entry-writes`: every put on the break-glass-log bucket, refused ones included, with its error code, the writing session (`userIdentity.arn`, the name after `assumed-role/hearth-break-glass/`) and its source identity beside the key, each key's puts together (step 3's writer check).
2. In log-archive, list the quarter's break-glass entries in every account's folder, and read each one. The log bucket is `hearth-break-glass-log-` followed by log-archive's account id, which `aws sts get-caller-identity --query Account --output text` prints in your log-archive session. `aws s3api list-objects-v2 --bucket <the log bucket> --prefix break-glass/ --delimiter / --query 'CommonPrefixes[].Prefix'` lists every account's folder, and `aws s3api list-objects-v2 --bucket <the log bucket> --prefix break-glass/<account>/<yyyy>/<mm>/` each folder's entries for a month. The folders are the UTC days the sessions began, so list the quarter's months in UTC, and the next quarter's first day (`--prefix break-glass/<account>/<yyyy>/<mm>/01/`), which holds the continuation entry of a session begun in this quarter's last hour. List them from the bucket, never only for the accounts the first query prints: the queries read the trail's CloudWatch copy, which shows nothing at all if it has stopped receiving the trail.
   - Each entry was written once: for each account's folder and month, `aws s3api list-object-versions --bucket <the log bucket> --prefix break-glass/<account>/<yyyy>/<mm>/` lists every version and delete marker. Each entry's key holds exactly one version and no delete marker; a key with more is a finding (the bucket's `EntriesNeverReplaced` should have refused the second put), and every version of it is read.
   - The accounts the trail delivers for are the trail bucket's folders, which come from the trail itself, not its copy: `aws organizations describe-organization --query Organization.Id --output text` prints the organisation's id, and `aws s3api list-objects-v2 --bucket <the trail bucket> --prefix AWSLogs/<the organisation's id>/ --delimiter / --query 'CommonPrefixes[].Prefix' --output text` lists one folder per account, named by its id. The trail bucket is `hearth-org-trail-` followed by log-archive's account id. Expect four, management, log-archive, non-prod and prod, whether or not anyone broke glass into them; one more or one fewer is a finding. Management's is the account in the trail's ARN, which `describe-trails` prints (below).
   - If the set-up's notes record a trail copy removed after Foundation's failed first deploy (with its event count and times), list the trail bucket (`hearth-org-trail-` and the same id) for those days, under `AWSLogs/`, and check it holds log files for those times; if it doesn't, it is a finding.
   - Validate the quarter's trail files against their signed digests, which shows a delivered file overwritten or deleted since. For each of the four accounts the trail bucket's folders name (above), management included, and in each of ap-southeast-1 and us-east-1, where the trail delivers the global services' events: `aws cloudtrail validate-logs --trail-arn <the trail> --account-id <the account> --start-time <the quarter's first day, as 2026-07-01T00:00:00Z> --region <the Region>`. `aws cloudtrail describe-trails --region ap-southeast-1 --query 'trailList[].TrailARN' --output text` prints the trail, `hearth-org-trail`. Each run ends by counting the digest and log files it found valid. An `AccessDenied` is a finding to raise, never a pass: the reviewer's reads, or `hearth-region`'s fence for them, have changed. Any `INVALID`, a missing file, or a gap it reports goes to [A suspected breach of personal data](breach.md), with `aws s3api list-object-versions --bucket <the trail bucket> --prefix <the key it names>` read for the keys it names. Record counts and results, never a key.
3. For each break-glass session the first query lists, and each session an entry names, reconcile three sources: the trail's assumption, the entries, and the merged PRs (and, from C0.11 PR 4, the deploy history). Every entry is keyed by its own session, the `session` it names, under the UTC day that session began. An entry keyed by a session the first query doesn't list over step 1's range is a finding: the copy missed the trail's event, and the Owner reads the trail's delivery to it at once (step 9). A session an entry names only in `continues` or `amends` may have begun in an earlier quarter: reconcile it with that quarter's record, not as a missed trail event. Check:
   - each session has one of these shapes, by the entries keyed by its name (`hearth-bg-` and its time), and any other shape is a finding:
     - a session the helper opened: an open entry and a close entry, the close written by the session or by its continuation (below). One with an open entry and no close is one whose close the helper reported unwritten, which the person noted, or that stopped unprompted past its hour: reconcile it from the trail;
     - a continuation: only its continuation entry, under its own day, whose `continues` names the session whose close it wrote, under the same reason and source identity;
     - an amend: only its amend entry (below);
     - no entry at all: a refused assumption (below); one the helper reported as "the role wasn't assumed" (AWS granted it but its reply never arrived); or one the helper stopped before its own entry was written, having reported the break-glass-log bucket's parameter unread, or its open entry, for a continuation its continuation entry, or for an amend its amend entry, unwritten. The person notes each of those with its time for this review ([Reaching production: the break-glass role](break-glass.md#when-it-stops));
   - each entry's `session` and `environment` match its key and the account its folder names, by the ids the Owner showed (non-prod's folder holds only `nonprod` entries, prod's only `prod`, log-archive's only `log-archive`);
   - the reason is a reference in its exact form, and holds no name;
   - the runbook named fits the reason;
   - a `case:` reference is a real request (the DPO confirms it);
   - an `lz:pr-` number is a merged PR whose diff matches what was deployed, but for the GitHub deploy subjects, which come from `infra/.env.local`, never from a PR: a deploy may change them, as a correction of GitHub's OIDC subject or a rename or transfer of the repository does ([the set-up runbook's step E](aws-account-set-up.md#e-githubs-oidc-subject-and-the-rest-of-the-configuration)), each citing the PR that records it, and step 6 judges every subject a deploy set. Any other change in that deploy is a finding;
   - the close entry's modes and ids fit the runbook, and hold no name, number or address;
   - a session closed within two minutes of its hour, or after it, has its close written by a continuation, the role taken again under the same reason, unless the close wasn't written; one that stopped unprompted past its hour has no continuation and no close entry, so reconcile it from the trail. A session that began in the last hour before the quarter has its open and close in the previous quarter's folder and its continuation in this one, and one that began in this quarter's last hour has its continuation in the next quarter's first day (step 2). Before recording a missing assumption, entry or put for a session near either end of the quarter, look past that end;
   - a close entry with outcome `stopped` and no modes was written by the helper on its own, as it stopped: note what stopped it;
   - an amend entry, keyed by its own session under its own day, names the session it amends (`amends`, which may be an earlier quarter's), under that session's reason, and the amend's own session wrote nothing else;
   - a refused attempt with a reason that isn't a reference is a finding, since its tags stay in the trail;
   - each entry was written by the session its key names, from `hearth/review/break-glass-entry-writes`: the key's successful put came from the session after `assumed-role/hearth-break-glass/` in its `userIdentity.arn`, and the writer's source identity is the one on the `hearth/review/break-glass-sessions` row in the key's account whose `requestParameters.roleSessionName` equals that session name: match by name, never by source identity alone. Read the row whose `recipientAccountId` is the key's account, since log-archive's copy of another account's put may carry no session. Two writers are expected besides: a close written by the continuation session whose entry's `continues` names the key's session, with the same source identity, and an amend, `<the amend's own session>-amend-<the amended session's time>.json`, written by the amend's own session. Refused puts of a key that holds an entry have one expected shape: its successful put by one of those writers, followed within minutes, by `eventTime`, only by refused puts of it with `PreconditionFailed`, from that same session or one whose continuation entry `continues` the same session, under the same source identity. That is the AWS CLI retrying a put whose reply was lost, which then meets the stored entry, and, for a close, the helper's own unprompted second try, made with the same session's credentials (or, if the hour's last two minutes began in between, by a new session that writes its own continuation entry first). The helper then reported the entry unwritten, so the person's note of an unwritten entry may stand beside an entry that exists. The CLI retries an assumption the same way: when the reply to the helper's `assume-role` is lost, it sends the call again under the same name, and AWS grants it again. So two or three successful assumptions under one name in one account, within about three minutes of each other by `eventTime`, all with the same source identity and the same reason, are that retry: note it, it isn't a finding (the role's trust holds a session's source identity to the caller's own sign-in, so nobody else's session can match it). A name's time is the person's clock, read just before the helper assumes the role: normally seconds before the assumption's `eventTime`; up to about three minutes before it when the CLI retried; and off by as much as that clock is off AWS's, which can be up to about five minutes, since AWS refuses a signed request further off. Where the session wrote an open entry, its `at`, from the same clock, comes a few seconds after the name's time, or up to about three minutes after when the CLI retried. Note a larger gap with the person's account of it (a slow network, their machine's clock). Each of these is a finding for [A suspected breach of personal data](breach.md): any other writer; two sessions sharing a name (one session name on more than one successful assumption in one account, in `hearth/review/break-glass-sessions`) beyond the CLI's retry; a successful assumption whose name isn't of the helper's form, `hearth-bg-` and a UTC time, or whose time is further from its `eventTime` than those bounds with nothing to account for it; any other refused put of a key that already holds an entry (beyond step P.1's drill, which the set-up's notes record), an `AccessDenied` or one by another session or source identity among them; an entry with no put row. The role's trust doesn't constrain session names, so another session in the account can take an open session's name: the by-name match then finds two assumptions under it that aren't the CLI's retry, which is the finding itself. Record counts, never a key or a name.
4. Each hearthbase assumption (A15) the second query lists has an `lz:` reason and a merged PR, a reviewed Foundation deploy (with its A3; the RCP's subjects come from `infra/.env.local` too, and step 6 reads them as they stand), the set-up's first deploys, or a recorded tier-2 change.
5. Each `HearthOrgAdmin` session and each assumption of `OrganizationAccountAccessRole` has a reason: a reviewed Foundation deploy, a tier-2 change, or the set-up. A `HearthSetUp` session after the set-up is a finding. Each move `hearth/review/recovery-moves` lists is a recorded tier-2 change, the account moved from its own OU (log-archive's `Security`, a workload account's `Workloads`) into `Recovery` and back into that same OU, or one of the set-up's moves, each account from the root into its own OU; any other move is a finding, even one undone since, and so is a refused one that no recorded change explains.
6. Each deploy-role session matches the deploy history (from C0.11 PR 4). Then check whom GitHub's deploy roles and the RCP let in, as they stand and as the quarter's calls set them. This step judges what each subject is. Who made each change, and in which deploy, steps 3 to 5 and 9 have already reconciled: A15, and A6 (i), which alarms on every IAM write to these roles, refused ones included.

   Four places hold the subjects: non-prod's `hearth-gh-deploy`, for GitHub's `nonprod` environment; prod's `hearth-gh-deploy`, for `prod`; prod's `hearth-gh-diff`, for `prod-plan`; and the RCP's `WebIdentityOnlyDeploySubjects`, which lists all three. A subject is this repository's when it is exactly `repo:<R>:environment:<the environment>:job_workflow_ref:<R>/.github/workflows/deploy.yml@refs/heads/main`, each `<R>` being this repository as GitHub names it now, as `owner/name` or as `owner@<owner id>/name@<repository id>`. Either form in either place names this repository alone: a form GitHub doesn't send only refuses deploys, which the set-up runbook's step E.2 corrects. A role's environment comes from its account and its name, never from its subject. Nothing counts how often a subject changed, and no row older than the quarter is read: what stood when the quarter began is what the last review passed.

   **Set up the comparison** in each shell that runs a read below: your log-archive session and your management session. Paste it with the account ids the Owner showed before step 1. Its first two lines print this repository's name and two ids, read as *Before you start* says, and every shell must print the same line. In a break-glass shell (an A10 triaged by the person on call), `gh` isn't signed in, since the helper gives the shell its own `HOME`: run the first two lines in your own shell, and in the break-glass shell paste `read -r n o i <<<'<the line your own shell printed>'; REPO="$(jq -cn --arg name "$n" --arg owner "$o" --arg id "$i" '{$name, $owner, $id}')"` in place of the first.

   ```sh
   REPO="$(env -u GH_REPO -u GH_HOST gh api 'repos/{owner}/{repo}' --jq '{name: .full_name, owner: (.owner.id | tostring), id: (.id | tostring)}')"
   jq -r '"\(.name) \(.owner) \(.id)"' <<<"$REPO"
   NONPROD='<the non-prod account id>' PROD='<the prod account id>' FORMERS='[]'
   judge() {
     jq -r --argjson repo "$REPO" --argjson formers "$FORMERS" --arg nonprod "$NONPROD" --arg prod "$PROD" '
       def gh: "token.actions.githubusercontent.com";
       def ids: ($repo.name | split("/")) as [$o, $n] | "\($o)@\($repo.owner)/\($n)@\($repo.id)";
       def environment($account; $role):
         if $role == "hearth-gh-deploy" and $account == $nonprod then "nonprod"
         elif $role == "hearth-gh-deploy" and $account == $prod then "prod"
         elif $role == "hearth-gh-diff" and $account == $prod then "prod-plan"
         else null end;
       def place:
         if . == $repo.name then "name"
         elif . == ids then "ids"
         elif test("^[A-Za-z0-9-]+@[0-9]+/[A-Za-z0-9._-]+@" + $repo.id + "$") or IN($formers[]) then "former"
         elif test("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$") then "check"
         else "other" end;
       def subject($environment):
         (if type == "string" then capture("^repo:(?<a>[^:]+):environment:(?<e>[^:]+):job_workflow_ref:(?<b>[^:]+)/[.]github/workflows/deploy[.]yml@refs/heads/main$") else empty end // null) as $p
         | if $p == null then "FINDING shape \(.)"
           elif $p.e != $environment then "FINDING environment \(.)"
           else [($p.a, $p.b) | place] as $w
             | if any($w[]; . == "other") then "FINDING repository \(.)"
               elif any($w[]; . == "check") then "FINDING name \([($p.a, $p.b) | select(place == "check")] | unique | join(" "))"
               elif any($w[]; . == "former") then "former \(.)"
               else "expected \($w | join("/"))" end end;
       def provider($account): type == "string"
         and (split(":") | length == 6 and .[0] == "arn" and .[2] == "iam" and .[4] == $account and .[5] == "oidc-provider/" + gh);
       def trust($account; $environment):
         (if type == "string" then (try fromjson catch null) else . end) as $d
         | ([$d.Statement?] | flatten) as $s
         | if ($d | type) != "object" then "FINDING unreadable"
           elif ($s | length) != 1 or ($s[0] | type) != "object" then "FINDING statements"
           elif ($s[0] | ((keys - ["Sid"]) != ["Action", "Condition", "Effect", "Principal"]) or .Effect != "Allow"
               or ([.Action] | flatten) != ["sts:AssumeRoleWithWebIdentity"]
               or (.Principal | type != "object" or keys != ["Federated"] or (.Federated | provider($account) | not))
               or (.Condition | type != "object" or keys != ["StringEquals"])
               or (.Condition.StringEquals | type != "object" or keys != [gh + ":aud", gh + ":sub"])
               or .Condition.StringEquals[gh + ":aud"] != "sts.amazonaws.com")
           then "FINDING trust"
           else $s[0].Condition.StringEquals[gh + ":sub"] | subject($environment) end;
       def finding($statuses):
         .resourceOwnerAccount as $account | (.resource | sub("^.*:role/"; "")) as $role
         | select(($role | startswith("hearth-gh-")) or (.principal.Federated? // "" | tostring | contains(gh)))
         | environment($account; $role) as $environment
         | [.analyzedAt, .status, $account, $role, $environment,
            (if (.status | IN($statuses[]) | not) then "FINDING status \(.status)"
             elif .error != null then "FINDING error \(.error)"
             elif (.principal // {} | keys) != ["Federated"] or (.principal.Federated | provider($account) | not) then "FINDING principal"
             elif (.condition // {} | keys) != [gh + ":aud", gh + ":sub"] or .condition[gh + ":aud"] != "sts.amazonaws.com" then "FINDING condition"
             else .condition[gh + ":sub"] | subject($environment) end)]
         | @tsv;
     '"$1"
   }
   ```

   `judge` prints, for each subject, `expected` and the form in each place (`name` or `ids`); `former` and the subject, for a former name of this repository; or `FINDING`, what kind, and what the place holds (*What each result means*, below). Its `finding` judges one of the analyzer's findings, holding its status to those it is given. Any role but the three has no environment (its column is empty), so every subject on it reads `FINDING environment`.

   1. **The trusts as they stand**, in your log-archive session, from the organisation analyzer, `hearth-org-external`. It reads every role in every account. It has no archive rule, and only tier 2 could archive a finding, which A6 reports. This lists each active or archived finding on a role named `hearth-gh-…` or trusting GitHub's provider, with when the analyzer last read the role (`analyzedAt`):

      ```sh
      ANALYZER="$(aws accessanalyzer list-analyzers --region ap-southeast-1 --type ORGANIZATION --query "analyzers[?name=='hearth-org-external' && status=='ACTIVE'].arn" --output text)"
      aws accessanalyzer list-findings --region ap-southeast-1 --analyzer-arn "$ANALYZER" \
        --filter '{"resourceType": {"eq": ["AWS::IAM::Role"]}, "status": {"eq": ["ACTIVE", "ARCHIVED"]}}' --output json \
      | judge '.findings[] | finding(["ACTIVE"])'
      ```

      Expect exactly three lines: non-prod's `hearth-gh-deploy`, prod's `hearth-gh-deploy` and prod's `hearth-gh-diff`, each `expected`, and each read (`analyzedAt`) after that role's last line in the second read that isn't `refused`; a refused call changes nothing for the analyzer to read. A role changed in the last day may still show its old finding, or none yet: read again the next day. If a day later a line was still read before that change, it is a finding: the analyzer hasn't read the role since, so its trust is unchecked.
   2. **Every trust the quarter's calls set**, in your management session, from the trail's copy, over the quarter and a day either side by the copy's own times (at the first review, from the set-up's first day). Take each line into the quarter by its `eventTime` (step 1). `jq` turns each day into the milliseconds since 1970, in UTC, that the command takes. It lists each `CreateRole`, `UpdateAssumeRolePolicy` and `DeleteRole` of a role named `hearth-gh-…` or whose trust names GitHub's provider, refused ones included, and holds each trust to the one statement `infra/src/baseline/github-oidc.ts` writes. Over a quarter it may take several minutes:

      ```sh
      aws logs filter-log-events --region ap-southeast-1 --log-group-name /hearth/security/org-trail \
        --start-time "$(jq -n '"<the day before the quarter>T00:00:00Z" | fromdateiso8601 * 1000')" \
        --end-time "$(jq -n '"<the day after the quarter>T23:59:59Z" | fromdateiso8601 * 1000')" \
        --filter-pattern '{ ($.eventSource = "iam.amazonaws.com") && (($.eventName = "CreateRole") || ($.eventName = "UpdateAssumeRolePolicy") || ($.eventName = "DeleteRole")) && (($.requestParameters.roleName = "hearth-gh-*") || ($.requestParameters.assumeRolePolicyDocument = "*token.actions.githubusercontent.com*") || ($.requestParameters.policyDocument = "*token.actions.githubusercontent.com*")) }' \
        --query 'events[].message' --output json \
      | judge '.[] | fromjson
        | .recipientAccountId as $account | (.requestParameters.roleName // "-") as $role
        | environment($account; $role) as $environment
        | (if .eventName == "DeleteRole" then "deleted"
           else (.requestParameters.assumeRolePolicyDocument // .requestParameters.policyDocument)
             | if . == null then "unread" else trust($account; $environment) end end) as $verdict
        | [.eventTime, $account, .eventName, $role, $environment,
           (if .errorCode then "refused \(.errorCode) \($verdict)" else $verdict end)]
        | @tsv'
      ```

      Each line must read `expected`, `former` or `deleted`, or `refused` on a role named `hearth-gh-…`. A `refused` line changed nothing: it shows the subject the call tried to set. On a `hearth-gh-…` role, step 9 reconciles it with its A6 (i) episode, whose triage treats an unexplained refused write as an incident. A6 (i) watches those names alone, so a `refused` line on a role of any other name has no alarm behind it: it is a finding, investigated as an A6 would be (a denied attempt counts). Each role a `deleted` line names must be back in the first read.
   3. **The RCP as it stands**, in your management session, where `HearthSecurityReview` reads the organisation's policies and their targets:

      ```sh
      RCP="$(aws organizations list-policies --filter RESOURCE_CONTROL_POLICY --query "Policies[?Name=='hearth-data-perimeter'].Id" --output text)"
      aws organizations describe-policy --policy-id "$RCP" --query Policy.Content --output text \
      | judge '[[.Statement] | flatten | .[] | select(.Sid? == "WebIdentityOnlyDeploySubjects")] as $found
        | (try $found[0].Condition.StringNotEquals[gh + ":sub"] catch null) as $s
        | if ($found | length) != 1
             or ($found[0] | ((keys - ["Sid"]) != ["Action", "Condition", "Effect", "Principal", "Resource"])
               or .Effect != "Deny" or .Principal != "*" or .Resource != "*" or .Action != "sts:AssumeRoleWithWebIdentity"
               or (.Condition | type != "object" or keys != ["StringNotEquals"])
               or (.Condition.StringNotEquals | type != "object" or keys != [gh + ":sub"]))
             or ($s | type) != "array" or ($s | length) != 3
             or ([$s[] | strings | capture(":environment:(?<e>[^:]+):").e] | sort) != ["nonprod", "prod", "prod-plan"]
          then "FINDING statement \($found | tojson)"
          else $s[] | capture(":environment:(?<e>[^:]+):").e as $e | [$e, subject($e)] | @tsv end'
      aws organizations list-targets-for-policy --policy-id "$RCP" --query 'Targets[].[Type,TargetId]' --output text
      ```

      Expect three lines, one for each environment, each `expected`, then one target: `ACCOUNT` and non-prod's account id while `RCP_TARGET` in `infra/src/foundation/options.ts` on `main` is `'nonprod'`, or `ROOT` and the root's id once it is `'root'`.
   4. **The quarter's A10 emails**, in your log-archive session, with `ANALYZER` set as the first read sets it. A10 comes from log-archive's own rule on the analyzer, not from the trail's copy, and a trust whose subject changes gets a new finding, which emails (TECH-SPEC T24 item 5), so this shows a trust that was set and replaced even if the copy missed both calls. For each of the quarter's A10 emails on a role (`AWS::IAM::Role`), read its finding by the id the email names, whatever its status now:

      ```sh
      aws accessanalyzer get-finding --region ap-southeast-1 --analyzer-arn "$ANALYZER" --id '<the finding id the email names>' --output json \
      | judge '.finding | finding(["ACTIVE", "RESOLVED"])'
      ```

      It prints one line for a GitHub role's finding, with its status (`RESOLVED` once a later change replaced that trust), and nothing for another role's, which the A10 row's own check covers. Each line must read `expected` or `former`; an `ACTIVE` one is also in the first read. The analyzer deletes a resolved finding after a while, and then answers that it holds none (`ResourceNotFoundException`): the email's triage note, which records the finding's status and verdict ([A security alert](security-alerts.md)'s A10 row), stands in for it. An email whose finding is gone and whose note doesn't record them is a finding.

   What each result means:

   - **It passed** when the first read prints three `expected` lines, each read after its role's last line in the second read that isn't `refused`; every line of the second read is `expected`, `former`, `refused` or `deleted`, and each deleted role is back; the third prints three `expected` lines and the one target; and every A10 email on a role reads `expected` or `former`, by its finding or, once that is gone, by its note. Record that each read passed, never a subject, a name or an id.
   - **`former`**: a place names a former name of this repository. Either it is an `owner@<owner id>/name@<repository id>` form that carries this repository's id under another owner, name or owner id, which only this repository could ever send, since GitHub never reuses a repository's id; or it is an `owner/name` that GitHub still sends here (next item). On a trust that no longer stands (a second-read line, or a `RESOLVED` fourth-read line) it passes: a trust set before a rename, or put back by a redeploy's rollback. In the first or third read, a trust or the RCP still names it: a finding the owner fixes at once by the set-up runbook's step E.2.
   - **`FINDING name`** lists each `owner/name` in the subject that isn't this repository's. Each may be a former name, after a rename or transfer. For each, run `env -u GH_REPO -u GH_HOST gh api repos/<that owner>/<that name> --jq '.id, .created_at'`. GitHub answers a former name with the repository it now names, so if it prints this repository's id (the last on the comparison's first line), nobody else holds that path. Then set `FORMERS='["<that owner>/<that name>"]'` (each such name, comma-separated) and run the read again: the line now reads `former`. This is the one time GitHub is asked about a name taken from a line, and only for the id and creation time it prints. If it prints another id, or answers that it can't find the repository (a private one may hold the path), the line is a finding for [A suspected breach of personal data](breach.md), with one exception. On a second-read line, or a `RESOLVED` fourth-read line the second read also shows, a repository created (`created_at`) after the role's next line in the second read that isn't `refused`, the call that replaced that trust, reached the path only after the trust stopped naming it, since no repository is at a path before it is created. That line admitted nobody else: an owner's finding, not a breach, since the set-up runbook's step E.2 keeps a path the repository left free until the next review.
   - **Fewer than three lines in the first read.** First see whether the analyzer reads the roles at all: `aws accessanalyzer list-findings --region ap-southeast-1 --analyzer-arn "$ANALYZER" --filter '{"resourceType": {"eq": ["AWS::IAM::Role"]}}' --query 'length(findings)'` counts every role finding, Identity Center's among them. None means the analyzer has stopped reading: a finding, and the trusts stay unchecked until the owner fixes it. Otherwise the missing role's last line in the second read decides. A `deleted` line in a deploy that steps 3 to 5 account for, and whose A6 (i) episode step 9 reconciles, is a finding the owner fixes by deploying that Baseline again. Anything else is a finding for [A suspected breach of personal data](breach.md): a trust the analyzer no longer reports may still let someone in.
   - **The RCP still on non-prod's account** once `main` names the root: step O's Foundation deploy hasn't run. A finding the owner fixes by deploying it.
   - **`unread`**: the row's trust isn't in the field the second read expects. Read that event's message (the same command without `| judge …`) and judge its trust by eye, as the read would. The owner corrects this step by a reviewed PR; until then it is a finding.
   - **`FINDING error`**: the analyzer couldn't read the role, so its trust is unchecked. A finding to raise, never a pass; the second read still judges what the quarter's calls set.
   - **A command that fails** (`AccessDenied`, an empty `ANALYZER`, no `hearth-data-perimeter`) is a finding, never a pass, but for the fourth read's answer for a deleted finding.
   - **Anything else** is a finding for [A suspected breach of personal data](breach.md): every other `FINDING` (another repository or ids, another environment or workflow, another provider or principal, a condition added, changed or dropped, an archived finding, an RCP statement of any other shape), a line beyond the three in the first read, and an RCP on no target, on two, or on one that `main` doesn't name.
7. List the quarter's `HearthSecurityReview` sessions, your own included, with this query on the same log group (no saved query lists them), and check each against who should hold the set. Run it again at the end of the review, over today: today's own sessions, in management and in log-archive, must be listed (the copy receives them within about 15 minutes). If they aren't, the copy has stopped receiving the trail, and every assured alarm with it: it is a finding, and the Owner reads the trail's delivery to it at once (step 9).

   ```
   fields @timestamp, recipientAccountId, errorCode
   | filter eventName = "AssumeRoleWithSAML" and requestParameters.roleArn like /AWSReservedSSO_HearthSecurityReview_/
   | sort @timestamp desc
   ```

8. Check who holds what in Identity Center, which only an Owner can list:
   - While you watch, the Owner, with `HearthOrgAdmin`, shows each account's assignments (Identity Center's *AWS accounts*, or `aws sso-admin list-account-assignments` for each account and permission set) and each group's members (`aws identitystore list-group-memberships`). Every assignment is to a group, never to a person, and they are exactly the landing zone's: `HearthOrgAdmin`, `HearthSecurityReview` and `HearthBilling` in management; `HearthBreakGlassEntry` in prod, log-archive and non-prod; `HearthSecurityReview` in log-archive; and `HearthNonprodOperator` in non-prod only until it holds real data. So nobody but the on-call group holds anything in prod. Each group holds only the people who should be in it.
   - Then run this query on the same log group over the quarter, which lists every change to Identity Center by the names A4 watches, and match each with the A4 episode that covers it and with a reviewed PR or a person an Owner added or removed. Several changes in one episode share its ALARM and OK emails. An episode covers changes from its first breaching period, which its ALARM email's *Reason for State Change* names, up to 15 minutes and a period before that email, until its OK email ([A security alert](security-alerts.md#finding-an-assured-alarms-calls), step 1): match by each change's `@timestamp`, the copy's time, which the alarm's periods go by, not by the emails' times or the call's `eventTime`.

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
- `infra/src/foundation/security-services.ts`
- `infra/src/foundation/guardrails.ts`
- `infra/src/foundation/options.ts`
- `infra/src/baseline/github-oidc.ts`
- `infra/bin/break-glass.sh`
- `packages/shared/src/notice-text.ts`
- `break_glass_log`
- `cloudtrail`
