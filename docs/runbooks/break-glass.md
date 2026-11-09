# Reaching production: the break-glass role

## Use this when

- Anyone needs production: prod, the restore stage in the prod account, and non-prod once it holds real data (from C0.12).
- Anyone needs the log-archive account, to triage an incident or for a drill.
- An incident.
- A run of the Owner bootstrap script, with [Setting up the organisation and its first Owner](first-owner-set-up.md#running-the-owner-bootstrap-script) or [Twilio withdrawn, and no DPO signed in](twilio-withdrawn.md).
- A request's extraction, with [A request for a copy of someone's personal data](access-request.md), from C0.12.
- A Baseline deploy under an `lz:pr-` reason ([Setting up the AWS organisation and its accounts](aws-account-set-up.md)).
- A drill.

## Who does what

- The person on call, in the on-call group, which holds the `HearthBreakGlassEntry` permission set, opens and closes every session.
- The DPO decides every `bootstrap:`, `recover:` and `case:` use before it happens.
- An Owner with `HearthOrgAdmin` runs tier 2 (below).
- The second reviewer reviews every use each quarter ([The quarterly review of break-glass uses](break-glass-review.md)).
- A coding agent never opens a session or runs any step: the helper refuses to run under one, or in CI.

## Before you start

- A terminal outside any Claude Code session, on an encrypted, up-to-date machine. Better, a separate operating-system user for break-glass, which a session under your own user can't read at all: the same user the set-up runbook keeps for the landing-zone shells, which also makes and synthesises a Baseline deploy's checkout (*A Baseline deploy under `lz:pr-N`*).
- The helper's own folder, yours alone: `mkdir -m 700 ~/.hearth-break-glass` (or set `HEARTH_BREAK_GLASS_HOME` to another such folder). The helper refuses to start until it exists with mode 700. It unsets every AWS variable you have, in either case (`AWS_*` and `aws_*`, so `aws_ca_bundle` too), curl's config folders (`CURL_HOME`, `XDG_CONFIG_HOME`), `SSLKEYLOGFILE`, the CA overrides the AWS CLI and curl honour (`REQUESTS_CA_BUNDLE`, `CURL_CA_BUNDLE`, `SSL_CERT_FILE`, `SSL_CERT_DIR`) and Node's `NODE_TLS_REJECT_UNAUTHORIZED`, `NODE_OPTIONS` and `NODE_USE_SYSTEM_CA`, sets `HOME` to that folder for the session, and runs curl so it reads no `.curlrc`.
- A shell that brings none of your own shell state: the helper refuses to start, in fixed words, while bash would carry your shell's settings into it, since bash takes them before the helper's first line: a shell option of yours such as a trace or noclobber, POSIX mode or `POSIXLY_CORRECT`, an exported `SHELLOPTS` or `BASHOPTS`, or `BASH_ENV` (which environment-modules and Lmod set). Run it then as `env -u SHELLOPTS -u BASHOPTS -u BASH_ENV -u POSIXLY_CORRECT infra/bin/break-glass.sh …`, and never under `bash -x`. It drops any function your shell exported (Fedora's `which`, say), so none stands in for `aws`. It still uses your `PATH`, your proxy settings and `NODE_EXTRA_CA_CERTS`, which gives the Owner bootstrap script RDS's CA ([Setting up the organisation and its first Owner](first-owner-set-up.md)); the CDK CLI ignores it once the entry profile names a `ca_bundle`.
- One session at a time in a folder: the helper takes the folder's lock, `run.lock` inside it, and refuses a second run while it is held, since a run's sign-out ends every access-portal token cached there. A second session open at the same time (log-archive triage during a prod session, say) needs a folder of its own, set up the same way (mode 700, its own `.aws/config`) and named in `HEARTH_BREAK_GLASS_HOME`. A `run.lock` left by a run that was killed (its clean-up never ran) is removed by hand, once no helper is running in that folder.
- That folder's own AWS config, `.aws/config`, holding one Identity Center profile per account it reaches, named exactly `hearth-nonprod-entry`, `hearth-prod-entry` and `hearth-log-archive-entry`. Account ids live only there:

  ```ini
  [profile hearth-prod-entry]
  sso_session = hearth
  sso_account_id = <prod's account id>
  sso_role_name = HearthBreakGlassEntry
  region = ap-southeast-1

  [sso-session hearth]
  sso_start_url = <the access portal's address>
  sso_region = ap-southeast-1
  sso_registration_scopes = sso:account:access
  ```

  The other two profiles are the same with their own account ids. Behind TLS inspection, an inherited `AWS_CA_BUNDLE`, `aws_ca_bundle`, `REQUESTS_CA_BUNDLE` or `NODE_TLS_REJECT_UNAUTHORIZED` is unset, so add `ca_bundle = <the bundle's full path>` to each `hearth-<env>-entry` profile: the helper reads it, refuses unless it is a file it can read, and passes it as `AWS_CA_BUNDLE` to everything it runs after the sign-in, the break-glass shell and a Baseline deploy's CDK CLI included, which then trusts that bundle alone. curl, for `--console`, trusts only its own default store, so the inspecting CA must be in the system's store, or the console link isn't made (the shell still works). Never set `cli_history`: the helper refuses while it is on.
- The tools: the AWS CLI version 2, new enough that `aws s3api put-object help` lists `--if-none-match`; `jq`; and `curl`, for `--console` only.
- The reason, in hand, in its exact form (below), and the runbook you follow.

## The tiers

- **Tier 1** is this role, `hearth-break-glass`, one in each member account: operating, and, in a workload account, administering it under an `lz:pr-` reason, which alarms on its own (A15).
- **Tier 2** is an account moved into the `Recovery` OU, for anything this role can't do (section below). It is the only way to change the log-archive account.

## The reasons

The reason rides in the session's `hearth-reason` tag into the organisation trail, which keeps it for 731 days under a lock nobody can lift. CloudTrail also keeps a refused `assume-role` with its tags. The role's trust checks only a reason's shape and length, so **the helper's exact check is the only thing that keeps a name out of the trail**: never break glass any other way.

| Reason | When | What it reaches, beyond operating |
|---|---|---|
| `case:XXXX-XXXX` | A request's extraction: its reference from the queue, from C0.12 | The read-only login, `hearth_breakglass_read`, which C0.12 makes; never content |
| `incident:YYYY-MM-DD-NN` | An incident, by the day it began in Singapore and its number that day (`01` the first) | From C0.12, the master secret, for incident repair alone |
| `bootstrap:set-up`, `bootstrap:correct-number` | The Owner bootstrap script's set-up, or its correction of the founder's number | The bootstrap login, `hearth_bootstrap`, and the bootstrap input secret, only to load it into the run |
| `recover:twilio` | The Owner bootstrap script's Twilio re-clear | The bootstrap login; its document is typed, never stored |
| `drill:YYYY-MM-DD` | A drill, by its day in Singapore | Nothing more |
| `lz:pr-N` | A Baseline deploy of the merged PR numbered `N` (no leading zero); from C0.12, its infra SQL | In a workload account alone, the hearthbase deploy and publishing roles, which administer the account (A15); from C0.12, the master secret |

- A case reference uses the queue's own alphabet, which has no vowels, so it can't spell a name. A date is a real day, never after today, counted in Singapore (UTC+8): between midnight and 8 a.m. there, Singapore's date is a day ahead of UTC's, and it is the one to give.
- In log-archive the helper takes only `incident:` and `drill:`.
- Every session may read the stage's logs and run queries, describe the stacks, services and networking, read `/hearth/*` parameters, update a service (an incident rollback to an earlier task definition included) and stop a task; and run the bastion and open a port forward through it (*The bastion and a port forward*), the only way into a VPC. Log-archive's role writes its own entries and triages instead: GuardDuty's and Access Analyzer's findings, CloudTrail's event history, and the configuration of the trail and break-glass-log buckets and of the keys. It reads no trail file and nothing of the archive bucket, and administers nothing.
- An incident rollback to an earlier task definition reaches the three services alone (api, realtime and worker), whose earlier revisions are kept, never the one-offs, whose aren't; its procedure comes with C0.11 PR 4, and until then no service is rolled back by hand (*An incident rollback to an earlier revision*).
- The master secret, from C0.12, is for C0.12's infra SQL and incident repair alone, never to read anyone's data.

## Steps

### Opening a session

1. In your terminal, from the checkout's root: `infra/bin/break-glass.sh <nonprod|prod|log-archive> <reason>`, adding `--console` only if you need the AWS console. Anything it refuses, it refuses in its own fixed words, never repeating what you typed.
2. Pick the runbook you follow from its numbered menu of seven (this one, the security alert, the breach, the first Owner's set-up, Twilio withdrawn, the access request and the AWS set-up). Its default follows the reason: `bootstrap:` the first Owner's set-up (`first-owner-set-up.md`), `recover:` Twilio withdrawn (`twilio-withdrawn.md`), `case:` the access request (`access-request.md`), `lz:` the AWS set-up (`aws-account-set-up.md`), anything else this one.
3. Sign in to the access portal in the browser it opens, with your security key.
4. The helper checks that you signed in with `HearthBreakGlassEntry`, takes the role for at most an hour under your reason, with your sign-in name as the session's source identity (A1 alarms), and writes the open entry before anything else. If the open entry can't be written, it stops, and nothing was done under the role, though it was assumed and A1 alarmed (*When it stops*).
5. With `--console`, it prints a console sign-in link for the same session, good for 15 minutes. It sends the session to AWS's sign-in federation endpoint in the body of a request it reads from standard input, never in an argument, a file or the link; the link holds only the sign-in token. Use it at once, and copy it nowhere.
6. Work in the shell it opens. Its prompt reads `[BREAK-GLASS <environment> <reason> <minutes>m]`, and it warns at 10 and 5 minutes left. Do only what the reason allows and your runbook says.

### A Baseline deploy under `lz:pr-N`

1. As the operating-system user the helper runs as, in the credential-free shell (no session open), make a fresh checkout of `main` at the merged PR and install it with `npm ci --ignore-scripts`, as [the set-up runbook's *Before you start*](aws-account-set-up.md#before-you-start) does (never a plain install, which runs the dependencies' install scripts as the user whose sign-in cache may hold a live portal token, and never `npx` before the install, which would fetch the CLI from the registry). Copy `infra/.env.local`, which holds every id the synth needs, into it from the checkout of the last landing-zone synth (at first, the set-up's), as the same user and readable by that user alone (mode 600), never retyped or taken from a chat. Then synthesise the Baseline and run the asset check, as [the set-up runbook's step F](aws-account-set-up.md#f-the-landing-zone-shell-the-synth-and-the-asset-check) says. Step 3 deploys from this checkout as the same user: the CDK CLI writes a read lock into the assembly folder (`read.<pid>.<n>.lock` in `cdk.out`), so a checkout another user owns stops it with `EACCES`, and that user's processes could change the assembly between the diff and the deploy.
2. Open a session in that workload account with `lz:pr-N` (A1 and A15 alarm).
3. In the break-glass shell, as the same user, from a folder with no `cdk.json` (never that checkout's `infra/`: beside a `cdk.json` the CLI first runs any `build` command it names, with the session's credentials), with that checkout's own CLI and the assembly's path, `CHECKOUT` being the checkout's path: `"$CHECKOUT/node_modules/.bin/cdk" diff --app "$CHECKOUT/infra/cdk.out"`, read it whole (anything it changes that PR N doesn't, a GitHub role's trust among them, stops the deploy, but for the subjects alone under the PR of [the set-up runbook's step E.2](aws-account-set-up.md#e-githubs-oidc-subject-and-the-rest-of-the-configuration) correction or rename), then `"$CHECKOUT/node_modules/.bin/cdk" deploy --app "$CHECKOUT/infra/cdk.out"`. Never use `npx` there, which outside the checkout would fetch the CLI from the registry, and never pass `--app` the entry itself.
4. Watch the CLI's warnings. One that the session's credentials "could not be used to assume" `cdk-hearthbase-lookup-role-…` and it is "Proceeding anyway" is expected: the role never takes the lookup role. The same warning naming `cdk-hearthbase-deploy-role-…` or `cdk-hearthbase-file-publishing-role-…` means the chain into hearthbase was refused, and the deploy will fail on CloudFormation's AccessDenied: stop, and check (*When it stops*).
5. Until TECH-SPEC T24 item 4 records it, the first such deploy that changes a Baseline (its diff isn't empty) settles one fact no unchanged deploy can, since the CLI skips an unchanged stack and CloudFormation then never takes the hearthbase execution role: whether CloudFormation's use of that role carries the session's source identity. Afterwards, an Owner with `HearthOrgAdmin` in management, or the second reviewer with `HearthSecurityReview`, finds in `/hearth/security/org-trail` the calls CloudFormation made under `cdk-hearthbase-cfn-exec-role-…` during the deploy, in that account, and reads whether they carry it (`userIdentity.sessionContext.sourceIdentity`), for a PR to item 4.

### The bastion and a port forward

The bastion is a task of the server image that runs nothing but a one-hour sleep, with no environment, secret or port, and only `hearth-break-glass` may start it. Its one use, in every account and under every reason, the set-up runbook's non-prod proof included, is a port forward through Session Manager to one private address: from C0.12, the database's writer endpoint. The one other run is the set-up runbook's, once, in non-prod ([step R.7](aws-account-set-up.md#r-before-the-first-workload-deploy)): its command overridden to exit at once, stopped at once, with no ECS Exec and nothing opened into it, so the trail holds a command override for A7's rule to be tried on. Never an interactive shell and never `aws ecs execute-command`: the cluster keeps no record of an exec session's output, and A8 alarms on every exec and session in prod. You need the AWS CLI's Session Manager plugin installed before the session opens. `<env>` below is the stage the session works in: `nonprod` or `prod`, or `restore` for the restore stage in prod's account, only while it is active, since its endpoints exist only then (TECH-SPEC T24 item 18). Everything below runs in the one break-glass shell the helper opened: it hands the role's credentials to that shell alone, as variables of its environment, and writes no profile, so a new terminal tab or window holds none of them, and a second helper run in the same folder is refused.

1. As the person on call, in the break-glass shell of a session open under the reason your runbook gives, read the stage's isolated subnets and the bastion's security group from SSM: `aws ssm get-parameter --name /hearth/<env>/network/isolated-subnets --query Parameter.Value --output text` (the subnet ids, comma-separated) and `aws ssm get-parameter --name /hearth/<env>/security-group/bastion --query Parameter.Value --output text`.
2. In the same shell, start the bastion: `aws ecs run-task --cluster hearth-<env> --task-definition hearth-<env>-bastion --launch-type FARGATE --enable-execute-command --propagate-tags TASK_DEFINITION --network-configuration "awsvpcConfiguration={subnets=[<subnet ids>],securityGroups=[<group id>],assignPublicIp=DISABLED}"`, and note the task's id, the last part of the task it prints.
3. Wait until it runs, `aws ecs wait tasks-running --cluster hearth-<env> --tasks <task id>`, then read its container's runtime id: `aws ecs describe-tasks --cluster hearth-<env> --tasks <task id> --query 'tasks[0].containers[0].runtimeId' --output text`.
4. In the same shell, open the forward as a background job of that shell, its input and output sent nowhere, so it holds the session's credentials and leaves the prompt free: `aws ssm start-session --target ecs:hearth-<env>_<task id>_<runtime id> --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters host=<writer endpoint>,portNumber=5432,localPortNumber=15432 </dev/null >/dev/null 2>&1 &`. Never open it in another terminal tab or window, or in a terminal multiplexer, whose windows take their environment from its server, which may have started outside the session and may outlive it. A few seconds later, `jobs` lists it as `Running`; if the shell reports it `Exit` or `Done`, it failed: run the same command without its last part (`</dev/null >/dev/null 2>&1 &`) to read the error (if it runs instead, Ctrl-C ends it), then start it in the background again. Port 15432 keeps clear of a local Postgres. Leave it running while you work at the same shell's prompt: the bytes it carries are TLS to Postgres, and nothing of them is logged; CloudTrail records `RunTask`, `ExecuteCommand` and `StartSession`. In prod, opening the forward raises A8, which pairs with the A1 your session raised.
5. When you are done, in the same shell, stop the forward first, with `kill %1` (or the job number `jobs` gives it), then the bastion: `aws ecs stop-task --cluster hearth-<env> --task <task id>`. `jobs` then lists nothing, and only then do you close the session. The bastion stops itself after an hour anyway, so a longer piece of work needs a new bastion.

The database end of it waits for C0.12, which makes the writer endpoint, the logins and the CA bundle the client checks it with. Give `port-forward` among the modes when you close the session.

### An incident rollback to an earlier revision

The three services' earlier revisions (api, realtime and worker) are kept when a release replaces them, so a rollback to an earlier revision is possible (TECH-SPEC T24 item 15). Its procedure, from choosing the revision and the floors check to what the pipeline does next, is written with C0.11 PR 4's deploy and rollback runbook, because it rests on the release record and the floors check PR 4 builds. Until it is written, no service is rolled back by hand outside the pipeline, whether under break-glass or as `HearthNonprodOperator`; and before PR 4 nothing is deployed, so there is nothing to roll back.

### Closing a session

1. Type `exit`. The helper asks what the session did (numbers from a fixed list: `none`, `exec`, `port-forward`, `ecs-update`, `rollback`, `plan`, `commit`, `set-up`, `correct-number`, `recover`, `extract`, `lz-deploy`), then the ids it printed, then how it ended (`completed`, `stopped` or `failed`).
2. For the ids, paste the Owner bootstrap script's `committed:` line whole, which the helper reads in the exact forms the script prints; or press Enter and type each id on its own line, each checked against its shape (a UUID, a date, a case reference, a PR number or a 40-character commit), then Enter on an empty line. Never a name, a number or an address.
3. It writes the close entry and signs you out of the access portal.

If the close comes within two minutes of the session's hour, or after it, the helper takes the role again under the same reason to write the close (A1 alarms again), writing a continuation entry first under the new session's name. If the access portal's hour has ended too, it asks you to sign in to the portal again, as yourself, with your security key, and refuses any other sign-in (another person, another permission set or another account), in which case the close isn't written. If the helper is stopped (Ctrl-C at its own prompts, a closed terminal), it still writes a close entry, unprompted, with outcome `stopped` and only the modes and ids you had already answered (none, if it stopped before the close's questions), and signs out; but a close that stops unprompted after the hour can't sign in again, so its close isn't written. Once the helper is closing, a further Ctrl-C or a closed terminal no longer stops it: it finishes the close and signs out. If it says a close entry wasn't written, tell the second reviewer.

### An id learnt later: an amend entry

An entry can never change, so an id learnt after the close (the DPO's person id, a set-up's committed ids) goes into an amend entry: `infra/bin/break-glass.sh <environment> <the session's own reason> --amend <hearth-bg-YYYYMMDDTHHMMSSZ>`, naming the session as its entries do. It asks for the ids, takes the role under that reason once (A1 alarms), writes the one amend entry, which names both sessions, and signs out. It opens no shell and no console, and writes no open or close entry.

### When it stops

Its messages are fixed, and the AWS CLI's own errors are silenced, since they would print the account id, the bucket's name and your sign-in name; only the access portal's sign-in (`aws sso login`) prints its own. So check, in order:

- "the sign-in didn't work", or "sign in with the HearthBreakGlassEntry permission set": the `hearth-<env>-entry` profile and its `sso-session` in the folder's `.aws/config`, and that you chose `HearthBreakGlassEntry` in the portal. If those are right and the portal still can't sign you in to that account, Identity Center's own SAML provider there (`AWSSSO_…_DO_NOT_DELETE`), through which every Identity Center sign-in to the account arrives, may have been deleted: the guardrails refuse that to everyone but the hearthbase execution role and OAAR, and A6 (b) raises on any `DeleteSAMLProvider`, a denied attempt included. Treat it as an incident ([A security alert](security-alerts.md)). To recover, an Owner with `HearthOrgAdmin` in management repairs the account's assignments in Identity Center, which provisions the provider again; prove that on non-prod before relying on it.
- "refused: it started with shell settings of yours …": your shell carries its own state into the helper (*Before you start*): run it as `env -u SHELLOPTS -u BASHOPTS -u BASH_ENV -u POSIXLY_CORRECT infra/bin/break-glass.sh …` from a shell with no option of your own set, never under `bash -x`, `sh` or `bash --posix`. Nothing was assumed.
- "another break-glass run holds this folder": finish the session open there first, or give a session open at the same time a folder of its own (*Before you start*); if no helper is running, a killed run left its `run.lock`: remove it by hand.
- "the entry profile's ca_bundle isn't a file it can read": the profile's `ca_bundle` names a file that exists and is readable, by its full path.
- "the close entry wasn't written": tell the second reviewer, who reconciles the session from the trail. A close entry for that session may still be in the bucket. The helper writes an entry only while its key is new, and the AWS CLI retries a put whose reply was lost: if S3 stored the first try, the retry is refused, and so is the helper's own unprompted second try, so the helper reports the close unwritten. The reviewer tells that apart from someone else's write by `hearth/review/break-glass-entry-writes` ([the quarterly review](break-glass-review.md)'s step 3): a successful put by the session itself, or by its continuation, under the same source identity, followed only by those sessions' refused puts (`PreconditionFailed`), is the helper's own. A close put by any other session (the bucket refuses only a second write of a key, never the first, by another session) is an incident, for [A suspected breach of personal data](breach.md).
- "a reason's date is never after today in Singapore": the reason's date is a later day than today in Singapore; give the day it began there. Any other reason it refuses prints only its usage: compare yours with the forms it lists.
- "the role wasn't assumed": the reason's exact form; that you signed in with `HearthBreakGlassEntry` through the right `hearth-<env>-entry` profile; that the account's Baseline is deployed. A call AWS refused is in the trail, with its error code and its tags, and A1 alarmed on it, with no open entry to match; so is a call AWS granted whose replies never arrived, which the CLI sends again under the same name before it gives up, so the trail shows the session assumed, maybe more than once, with no entry. The helper silences AWS's own errors, so tell the second reviewer the time either way, and note it for the quarterly review. One more cause refuses every assumption in the account, the `lz:pr-` one included: STS deactivated in ap-southeast-1 for that account (its error code `RegionDisabledException`). `hearth-baseline-2`'s `SetUpOnly` refuses that change to everyone but OrganizationAccountAccessRole, and A6 alarms on an attempt, so it is a tier-2 incident ([A security alert](security-alerts.md)): an Owner moves the account to `Recovery`, assumes OrganizationAccountAccessRole through STS in us-east-1, the global endpoint or the console's switch role (the account's own ap-southeast-1 endpoint refuses), activates ap-southeast-1 again under IAM's *Account settings*, then moves the account back.
- "the break-glass-log bucket's parameter wasn't read": the role was assumed (A1 alarmed), so tell the second reviewer. The account's `/hearth/break-glass/log-bucket` parameter is made by its Baseline (or `Hearth-LogArchive`), and nothing but the hearthbase execution role and OrganizationAccountAccessRole may change or delete it (the boundary and `hearth-baseline` refuse everyone else), so once that stack has deployed, a missing or changed parameter means tampering: treat it as an incident ([A security alert](security-alerts.md)). Tier 1 can't repair it, since the `lz:pr-` session that would redeploy the Baseline runs the same helper and stops here too, and a Baseline deploy with an unchanged template is skipped, while CloudFormation doesn't recreate a parameter deleted out of band anyway. Restore it through tier 2: an Owner moves the account to `Recovery` and puts the parameter as OrganizationAccountAccessRole, with the name and the value the Baseline renders (`hearth-break-glass-log-` followed by log-archive's account id), then moves it back.
- "the open entry wasn't written": the CLI is new enough for `--if-none-match`. The role was assumed (A1 alarmed) but nothing was done under it, and the session has no close entry and usually no open entry either: tell the second reviewer the time, note it for the quarterly review, then open a session again. If S3 stored the open entry but its reply was lost, the entry is in the bucket with no close, and the trail shows the session's own put succeeding and its retry refused, as for a close (above). If it persists with a current CLI, the parameter may name a bucket the role can't write to, which means the same tampering as above: treat it as an incident and restore the parameter the same way.
- "the amend entry wasn't written": the CLI is new enough for `--if-none-match`. The role was assumed (A1 alarmed) and nothing else was done under it, and the session usually has no entry: tell the second reviewer the time, note it for the quarterly review, then run the same `--amend` again, which takes the role under a new session and writes its own amend entry. If S3 stored the first amend entry but its reply was lost, the bucket then holds two amends of the same session with the same ids, and the trail shows the first amend session's put succeeding and its retry refused, as for a close (above): the reviewer reads the two as one. If it persists with a current CLI, treat it as for the open entry (above).
- "the access portal's hour has ended too; sign in again": sign in to the portal as yourself, with your security key and `HearthBreakGlassEntry`; "that sign-in isn't the one the session opened under" means another person, set or account signed in, and the close wasn't written.
- In a Baseline deploy under `lz:pr-N`, the CLI's warning that the session "could not be used to assume" `cdk-hearthbase-deploy-role-…` or `cdk-hearthbase-file-publishing-role-…`, "Proceeding anyway", then AccessDenied from CloudFormation: the hop into hearthbase was refused, and nothing was deployed. Check that the reason is `lz:pr-N` and the account a workload account, and that the account was bootstrapped from the committed template, whose deploy and file-publishing roles' trust takes the session's source identity ([the set-up runbook's step G](aws-account-set-up.md#g-bootstrapping-an-account)); if it wasn't, its bootstrap upgrade is tier 2.
- In a Baseline deploy under `lz:pr-N`, `EACCES` (permission denied) on a file in `cdk.out`, before any AWS call: the checkout isn't writable by the user the helper runs as, and nothing was deployed. Type `exit` with outcome `failed`, make and synthesise a checkout as that user (*A Baseline deploy under `lz:pr-N`*, step 1), and open a new session.

## Tier 2

For anything tier 1 can't do, and every change to the log-archive account: an Owner with `HearthOrgAdmin` moves the account into `Recovery` (A5, and A3 for the session), assumes `OrganizationAccountAccessRole` there, deploys through hearthbase (A15) from a credential-free synth and its asset check, and moves the account back, as [the set-up runbook's step Q](aws-account-set-up.md#q-a-week-later-compliance-as-tier-2) does. Root's guardrails still bind: nobody can delete or unlock the logs. Tier 2 writes no break-glass log entry, so the person who ran it records its reason for the quarterly review, and, if it wrote a GitHub role's trust, that it left that trust as the code renders it (the review's step 6).

## Check it worked

- A1's email arrived within minutes from the account's topic. Management's assured A1 emails once per episode, 5 to 15 minutes later: an ALARM email whose episode covers the session, or none if A1 was already in ALARM from an earlier call, whose episode then holds this session's call too ([A security alert](security-alerts.md)'s *Finding an assured alarm's calls*).
- The helper printed `open entry written for <session>` and then `close entry written` (or `amend entry written`).
- The second reviewer, with `HearthSecurityReview` in log-archive, finds the entries: `aws s3api list-objects-v2 --bucket <the log bucket> --prefix break-glass/<account>/<yyyy>/<mm>/<dd>/` lists them (the log bucket is `hearth-break-glass-log-` followed by log-archive's account id, and `<account>` the id of the account the session ran in, as [the quarterly review](break-glass-review.md)'s step 2 finds them), each one JSON object of schema `hearth.break-glass.v1`, keyed `<session>-open.json` and `<session>-close.json` (the session the helper opened), `<continuing session>-continuation.json` (under that session's own day) or `<the amend's own session>-amend-<the amended session's time>.json` (under the amend's own day).

## Afterwards

- Stop anything you started: the bastion (*The bastion and a port forward*, step 5), though it stops itself after an hour.
- Tell the DPO when a `case:`, `bootstrap:` or `recover:` use is done.
- Anything unexpected you saw goes to [A suspected breach of personal data](breach.md).
- Note for the quarterly review anything unusual: a continuation, a close entry that wasn't written, an amend, an open or amend entry that wasn't written, a refused attempt.

## Don't

- Set `session_replication_role` to `replica`: the database's deletion guard doesn't fire in replica mode.
- Use the Rule 9 credential: production access never uses it, and the role is denied it.
- Use `localhost` as the port forward's address, or a `PGSSLMODE` below `verify-full`. The Owner bootstrap script takes `PGHOST=127.0.0.1` and the writer endpoint in `OWNER_BOOTSTRAP_TLS_NAME`, which only it reads ([Setting up the organisation and its first Owner](first-owner-set-up.md#running-the-owner-bootstrap-script)); any other client, psql included, takes the writer endpoint as `PGHOST` and `127.0.0.1` as `PGHOSTADDR`, so it checks the certificate against the endpoint's name ([A request for a copy of someone's personal data](access-request.md), step 3).
- Run psql in the break-glass shell with its history on. psql would keep every query typed there in a `.psql_history`, and its pager a history file, outside `local-data/`: psql in the shell's home, the helper's folder, which outlives the session, or, for psql 14 and older, which ignore `HOME`, in your own account's home, or in whatever file a psqlrc's `HISTFILE` names, which wins over `PSQL_HISTORY`; the pager in the helper's folder, or under the folder `XDG_STATE_HOME` or `XDG_DATA_HOME` names, which the helper leaves as you had them. The helper's shell exports `PSQL_HISTORY=/dev/null PSQLRC=/dev/null LESSHISTFILE=-` itself, and you start psql as `psql -X`, which reads no psqlrc, the system's included: never set any of them back, and in any other shell export all three again and start psql as `psql -X` ([A request for a copy of someone's personal data](access-request.md), step 3).
- Run `aws ecs execute-command` into the bastion, or open a shell in it any other way, with no exception: its port forward is its only use. Nor override its command or environment, which runs whatever the override names inside the VPC (A7 alarms on either in prod), but for the set-up runbook's one non-prod run that exits at once (*The bastion and a port forward*).
- Paste a bootstrap document anywhere.
- Run `aws sts assume-role` yourself, or break glass any other way than the helper.
- Put a name, a number, an address or any free text in a reason.
- Pass the session's credentials to any program as an argument or through `env`, print them, or write them to a file; copy the console link anywhere.
- Delete or change anything in the log-archive account. The one exception is the set-up drill's attempt to replace its own open entry, which the bucket must refuse ([the set-up runbook's step P](aws-account-set-up.md#p-the-a1-drill)).
- Let a coding agent run any step, or see the session's output.

## Code paths

- `infra/bin/break-glass.sh`
- `infra/src/baseline/break-glass.ts`
- `infra/src/baseline/fast-alarms.ts`
- `infra/src/baseline/account-baseline.ts`
- `infra/src/foundation/guardrails.ts`
- `infra/src/foundation/log-archive.ts`
- `infra/src/foundation/identity-center.ts`
- `infra/src/workload/tasks.ts`
- `infra/src/workload/services.ts`
- `infra/src/workload/network.ts`
- `packages/shared/src/cases.ts`
- `CASE_REFERENCE_PATTERN`
- `scripts/owner-bootstrap/target.ts`
- `scripts/owner-bootstrap.ts`
- `break_glass_log`
- `RETENTION_CLASSES`
