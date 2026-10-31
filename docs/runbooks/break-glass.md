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

- A terminal outside any Claude Code session, on an encrypted, up-to-date machine. Better, a separate operating-system user for break-glass, which a session under your own user can't read at all.
- The helper's own folder, yours alone: `mkdir -m 700 ~/.hearth-break-glass` (or set `HEARTH_BREAK_GLASS_HOME` to another such folder). The helper refuses to start until it exists with mode 700, and it uses nothing outside it: it unsets every `AWS_` variable you have, and sets `HOME` to that folder for the session.
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

  The other two profiles are the same with their own account ids. Behind TLS inspection, add `ca_bundle = <the bundle's path>` there, since an inherited `AWS_CA_BUNDLE` is unset. Never set `cli_history`: the helper refuses while it is on.
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
| `incident:YYYY-MM-DD-NN` | An incident, by the day it began and its number that day (`01` the first) | From C0.12, the master secret, for incident repair alone |
| `bootstrap:set-up`, `bootstrap:correct-number` | The Owner bootstrap script's set-up, or its correction of the founder's number | The bootstrap login, `hearth_bootstrap`, and the bootstrap input secret, only to load it into the run |
| `recover:twilio` | The Owner bootstrap script's Twilio re-clear | The bootstrap login; its document is typed, never stored |
| `drill:YYYY-MM-DD` | A drill | Nothing more |
| `lz:pr-N` | A Baseline deploy of the merged PR numbered `N` (no leading zero); from C0.12, its infra SQL | In a workload account alone, the hearthbase deploy and publishing roles, which administer the account (A15); from C0.12, the master secret |

- A case reference uses the queue's own alphabet, which has no vowels, so it can't spell a name. A date is a real day, never after today.
- In log-archive the helper takes only `incident:` and `drill:`.
- Every session may read the stage's logs and run queries, describe the stacks, services and networking, read `/hearth/*` parameters, update a service (an incident rollback to an earlier task definition included) and stop a task; from C0.11 PR 3, run the bastion, exec into it and forward a port through it. Log-archive's role writes its own entries and triages instead: GuardDuty's and Access Analyzer's findings, CloudTrail's event history, and the configuration of the trail and break-glass-log buckets and of the keys. It reads no trail file and nothing of the archive bucket, and administers nothing.
- The master secret, from C0.12, is for C0.12's infra SQL and incident repair alone, never to read anyone's data.

## Steps

### Opening a session

1. In your terminal, from the checkout's root: `infra/bin/break-glass.sh <nonprod|prod|log-archive> <reason>`, adding `--console` only if you need the AWS console. Anything it refuses, it refuses in its own fixed words, never repeating what you typed.
2. Pick the runbook you follow from its numbered menu. Its default follows the reason: `bootstrap:` the set-up runbook, `recover:` Twilio withdrawn, `case:` the access request, `lz:` the AWS set-up, anything else this one.
3. Sign in to the access portal in the browser it opens, with your security key.
4. The helper checks that you signed in with `HearthBreakGlassEntry`, takes the role for at most an hour under your reason, with your sign-in name as the session's source identity (A1 alarms), and writes the open entry before anything else. If the open entry can't be written, it stops, and nothing was done.
5. With `--console`, it prints a console sign-in link for the same session, good for 15 minutes. It sends the session to AWS's sign-in federation endpoint in the body of a request it reads from standard input, never in an argument, a file or the link; the link holds only the sign-in token. Use it at once, and copy it nowhere.
6. Work in the shell it opens. Its prompt reads `[BREAK-GLASS <environment> <reason> <minutes>m]`, and it warns at 10 and 5 minutes left. Do only what the reason allows and your runbook says.

### A Baseline deploy under `lz:pr-N`

1. In the credential-free shell, from a fresh checkout of `main` at the merged PR, synthesise the Baseline and run the asset check, as [the set-up runbook's step F](aws-account-set-up.md#f-the-landing-zone-shell-the-synth-and-the-asset-check) says.
2. Open a session in that workload account with `lz:pr-N` (A1 and A15 alarm).
3. In the break-glass shell, from that checkout's `infra/` folder: `npx cdk diff --app cdk.out`, read it whole, then `npx cdk deploy --app cdk.out`. Never pass `--app` the entry itself.

### Closing a session

1. Type `exit`. The helper asks what the session did (numbers from a fixed list: `none`, `exec`, `port-forward`, `ecs-update`, `rollback`, `plan`, `commit`, `set-up`, `correct-number`, `recover`, `extract`, `lz-deploy`), then the ids it printed, then how it ended (`completed`, `stopped` or `failed`).
2. For the ids, paste the Owner bootstrap script's `committed:` line whole, which the helper reads in the exact forms the script prints; or press Enter and type each id on its own line, each checked against its shape (a UUID, a date, a case reference, a PR number or a 40-character commit), then Enter on an empty line. Never a name, a number or an address.
3. It writes the close entry and signs you out of the access portal.

If the session passed its hour, the helper takes the role again under the same reason to write the close (A1 alarms again), writing a continuation entry first. If the helper is stopped (Ctrl-C at its own prompts, a closed terminal), it still writes a close entry, unprompted, with outcome `stopped` and no modes or ids, and signs out. If it says a close entry wasn't written, tell the second reviewer.

### An id learnt later: an amend entry

An entry can never change, so an id learnt after the close (the DPO's person id, a set-up's committed ids) goes into an amend entry: `infra/bin/break-glass.sh <environment> <the session's own reason> --amend <hearth-bg-YYYYMMDDTHHMMSSZ>`, naming the session as its entries do. It asks for the ids, takes the role under that reason once (A1 alarms), writes the one amend entry, which names both sessions, and signs out. It opens no shell and no console, and writes no open or close entry.

### When it stops

Its messages are fixed, and the AWS CLI's own errors are silenced, since they would print the account id, the bucket's name and your sign-in name. So check, in order:

- "the role wasn't assumed": the reason's exact form; that you signed in with `HearthBreakGlassEntry` through the right `hearth-<env>-entry` profile; that the account's Baseline is deployed.
- "the break-glass-log bucket's parameter wasn't read": the account's `/hearth/break-glass/log-bucket` parameter exists (its Baseline, or `Hearth-LogArchive`, makes it).
- "the open entry wasn't written": the CLI is new enough for `--if-none-match`; nothing was done, so open it again.
- "the close entry wasn't written": tell the second reviewer, who reconciles the session from the trail.

## Tier 2

For anything tier 1 can't do, and every change to the log-archive account: an Owner with `HearthOrgAdmin` moves the account into `Recovery` (A5, and A3 for the session), assumes `OrganizationAccountAccessRole` there, deploys through hearthbase (A15) from a credential-free synth and its asset check, and moves the account back, as [the set-up runbook's step Q](aws-account-set-up.md#q-a-week-later-compliance-as-tier-2) does. Root's guardrails still bind: nobody can delete or unlock the logs. Tier 2 writes no break-glass log entry, so the person who ran it records its reason for the quarterly review.

## Check it worked

- A1's email arrived within minutes from the account's topic, and later from management's.
- The open and close entries (and any continuation or amend entry) exist: `aws s3api list-objects-v2 --bucket <the log bucket> --prefix break-glass/<account>/<yyyy>/<mm>/<dd>/` lists them, each one JSON object of schema `hearth.break-glass.v1`, keyed `<session>-open.json`, `<session>-close.json`, `<session>-continuation.json` or `<amended session>-amend-<the amend's time>.json`.

## Afterwards

- Stop anything you started (from C0.11 PR 3, the bastion).
- Tell the DPO when a `case:`, `bootstrap:` or `recover:` use is done.
- Anything unexpected you saw goes to [A suspected breach of personal data](breach.md).
- Note for the quarterly review anything unusual: a continuation, a close entry that wasn't written, an amend.

## Don't

- Set `session_replication_role` to `replica`: the database's deletion guard doesn't fire in replica mode.
- Use the Rule 9 credential: production access never uses it, and the role is denied it.
- Use `localhost` for `PGHOST`; use `127.0.0.1`.
- Paste a bootstrap document anywhere.
- Run `aws sts assume-role` yourself, or break glass any other way than the helper.
- Put a name, a number, an address or any free text in a reason.
- Pass the session's credentials to any program as an argument or through `env`, print them, or write them to a file; copy the console link anywhere.
- Delete or change anything in the log-archive account.
- Let a coding agent run any step, or see the session's output.

## Code paths

- `infra/bin/break-glass.sh`
- `infra/src/baseline/break-glass.ts`
- `infra/src/baseline/fast-alarms.ts`
- `infra/src/baseline/account-baseline.ts`
- `infra/src/foundation/guardrails.ts`
- `infra/src/foundation/log-archive.ts`
- `infra/src/foundation/identity-center.ts`
- `packages/shared/src/cases.ts`
- `CASE_REFERENCE_PATTERN`
- `scripts/owner-bootstrap/target.ts`
- `scripts/owner-bootstrap.ts`
- `break_glass_log`
- `RETENTION_CLASSES`
