# Setting up the AWS organisation and its accounts

## Use this when

- Building the landing zone for the first time: the organisation, its four accounts (management, log-archive, non-prod and prod), Identity Center, the guardrails, the organisation trail, break-glass and the alarms (TECH-SPEC T24 items 1 to 8, 11 and 17).
- Redoing one of its manual steps, which sit outside code and can drift.
- A tier-2 change: switching the log buckets to COMPLIANCE, any change to `Hearth-LogArchive`, or upgrading any account's bootstrap (step Q).
- A later deploy of `Hearth-Foundation` after a reviewed PR (step K's deploy, under `HearthOrgAdmin`).
- The quarterly read-backs (*Check it worked*).

## Who does what

- The owner, as the organisation's administrator, runs every AWS step: steps A to D and the start of H with the management root's keys, the only identity the management account has until then, then with the temporary `HearthSetUp` permission set, then with `HearthOrgAdmin`.
- A repo admin sets GitHub's OIDC subject customisation for this repository and reads it back (step E).
- The DPO confirms that the AWS transfer entry's facts name the United States for AWS's global services (Identity Center's sign-in events and the global services' CloudTrail events are first recorded in us-east-1, and GuardDuty runs there too).
- The person on call runs the A1 drill (step P).
- The second reviewer sees every alarm the set-up raises in the first quarterly review ([The quarterly review of break-glass uses](break-glass-review.md)).
- A coding agent runs no step, and never sees an account id, a `.env.local` line or a command's output.

## Before you start

- An encrypted, up-to-date machine.
- A separate operating-system user for the landing-zone and break-glass shells, or at least a dedicated home folder for each (mode 700, `mkdir -m 700`), with no Claude Code session running under it. Two shells:
  - the **credential-free shell**, with no AWS credentials, profile or SSO session at all (`env | grep '^AWS_'` prints nothing, and its AWS config and credentials files are empty or point at `/dev/null`), where every synth runs;
  - the **credentialed shell**, in its own folder, whose AWS config holds this set-up's Identity Center profiles (and, from step J, a profile per member account that assumes `OrganizationAccountAccessRole` from the management session), where `cdk diff`, `cdk deploy`, `cdk bootstrap` and the `aws` commands run. Account ids live only in that config and in `infra/.env.local`.
- AWS CLI version 2, Node 24.12 or later, `jq`; two FIDO2 security keys.
- The role mailboxes (C11-Q07): one per account root, on the organisation's domain, and the ops mailbox that reaches the person on call, the second reviewer and the DPO.
- C11-Q08's two domain names committed in `DOMAINS` in `infra/src/config/profiles.ts` by a reviewed, owner's-read PR: every real target refuses the `.invalid` placeholders, so nothing here deploys before they are.
- C11-Q09's budget amounts.
- A fresh checkout of `main` at the merged PR, installed with `npm ci --ignore-scripts`.
- `infra/.env.local`, copied from `infra/.env.example` and filled in as the steps give each value, never committed, and never pasted into a chat, an issue, a PR or a coding agent's session.
- The AWS CLI's history off in both shells: `aws configure get cli_history` prints nothing or `disabled`.

## Steps

The order matters, and each step says why it comes where it does, so a later re-run keeps it. Steps A to D, and H's first part, run as the management account's root user on its keys: until `HearthSetUp` exists it is the only identity the management account has. Nothing after uses it.

### A. The management account

1. Secure the management account's root user: register both FIDO2 keys (one stays with the founder, the other goes to the second sealed place), and remove any access key. A2 alarms on every root action once the trail exists.
2. Create the organisation with all features.
3. Enable the policy types on the root: service control policies, resource control policies and AI services opt-out policies.
4. Enable trusted access for IAM and centralised root access (`aws organizations enable-aws-service-access --service-principal iam.amazonaws.com`, then `aws iam enable-organizations-root-credentials-management` and `aws iam enable-organizations-root-sessions`), before any member account exists, so every member account is made with no root password or keys.
5. Write the organisation's id and its root's id into `infra/.env.local` (`HEARTH_ORG_ID`, `HEARTH_ORG_ROOT_ID`).

### B. The OUs

Create three OUs under the root: `Security`, `Workloads` and `Recovery`. Write their ids into `infra/.env.local` (`HEARTH_OU_SECURITY`, `HEARTH_OU_WORKLOADS`, `HEARTH_OU_RECOVERY`). `Recovery` stays empty but while tier 2 holds an account there.

### C. The accounts

Create log-archive, non-prod and prod one at a time (`aws organizations create-account`, then `aws organizations describe-create-account-status` until it succeeds), each with its own role mailbox. Write each id into `infra/.env.local` (`HEARTH_ACCOUNT_*`, management's too). Each stays in the root until its own step moves it: while it sits there, `OrganizationAccountAccessRole` (OAAR) can set it up, and once it is in its OU nobody can use OAAR there.

### D. Identity Center

1. Enable Identity Center's organisation instance in management, with ap-southeast-1 as its home Region and the built-in directory.
2. Require MFA at every sign-in, allowing only security keys and passkeys.
3. Set the access portal's session to the shortest Identity Center allows (1 hour), not the 8-hour default, and write down the shortest it offered for TECH-SPEC T24 item 3.
4. Create the five groups (the org admins, the on-call group, the non-prod operators, the reviewers and billing) and add their people by hand: names are personal data and never reach the repository. Write the instance's id, the identity store's id and each group's id into `infra/.env.local` (`HEARTH_SSO_INSTANCE_ID`, `HEARTH_IDENTITY_STORE_ID`, `HEARTH_GROUP_*`).

### E. GitHub's OIDC subject, and the rest of the configuration

Every synth reads the whole configuration, so it is complete before the first one. The Baselines' deploy roles trust one exact subject each, so the repository's subject format is fixed here.

1. A repo admin sets the repository's OIDC subject customisation to include `job_workflow_ref` (`gh api -X PUT repos/{owner}/{repo}/actions/oidc/customization/sub` with `use_default` false and the claim keys `repo`, `context` and `job_workflow_ref`), then reads it back with `gh api repos/{owner}/{repo}/actions/oidc/customization/sub`.
2. The owner writes the format it gives into `HEARTH_GITHUB_SUBJECT_FORMAT`, with the repository and its two ids (`HEARTH_GITHUB_REPOSITORY`, `HEARTH_GITHUB_OWNER_ID`, `HEARTH_GITHUB_REPOSITORY_ID`). The synth refuses a format naming another repository, or not naming the deploy workflow on `main`.
3. The ops mailbox's address into `HEARTH_ALERT_EMAIL`, and C11-Q09's amounts into the five `HEARTH_BUDGET_*_USD`.

From C0.11 PR 4 this step also covers, in its own words: the GitHub environments and their secrets, the repository's Actions settings, the owner's narrowed GitHub token, and `.claude/settings.json`'s deny rules on any machine running Claude Code.

### F. The landing-zone shell, the synth and the asset check

Every deploy below runs these three parts, in this order, so no repository code runs where credentials exist.

1. In the credential-free shell, from `infra/` in the checkout: `HEARTH_TARGET=<target> npx cdk synth --app "node --env-file=.env.local bin/landing-zone.ts" --no-lookups`, with `<target>` one of `foundation`, `log-archive`, `nonprod-baseline` or `prod-baseline`. Its one line on standard error names the target; a refusal names a variable and what it must be, never its value.
2. Still there, the asset check, which runs no repository code: `jq -s -e 'map([(.files // {})[] | .source | select(has("executable"))] + [(.dockerImages // {})[]]) | flatten | length == 0' cdk.out/*.assets.json` must print `true`. Anything else (`false`, or an error because no manifest matched) stops the deploy.
3. In the credentialed shell, from its own folder, which holds no `cdk.json`, with the checkout's own CLI and the assembly's path (`CHECKOUT` is the checkout's path, as in step G): `"$CHECKOUT/node_modules/.bin/cdk" diff --app "$CHECKOUT/infra/cdk.out"`, read it whole, then `"$CHECKOUT/node_modules/.bin/cdk" deploy --app "$CHECKOUT/infra/cdk.out"`. Both read the synthesised assembly and run no repository code. Never run them from `infra/`: beside a `cdk.json` the CLI first runs any `build` command it names, with your credentials. Never use `npx` there, which outside the checkout would fetch the CLI from the registry, and never pass `--app` the entry itself.

**A first deploy failed.** A create that rolls back deletes what it made, the retained resources included (each is retained once made, `RetainExceptOnCreate`), with one exception: `Hearth-Foundation`'s `/hearth/security/org-trail` log group, under deletion protection, which CloudFormation can't delete, so its events name it `DELETE_SKIPPED`. In that stack's account, with the session that ran the deploy:

1. Read the stack's events (`aws cloudformation describe-stack-events --stack-name <the stack> --query 'StackEvents[].[LogicalResourceId,ResourceStatus,ResourceStatusReason]' --output text`), and fix the cause by a reviewed PR.
2. Turn termination protection off for that stack alone: `aws cloudformation update-termination-protection --no-enable-termination-protection --stack-name <the stack>`.
3. Remove each `DELETE_SKIPPED` leftover the events name (an exception *Don't* names): for the trail's copy, while it holds nothing, `aws logs put-log-group-deletion-protection --log-group-identifier /hearth/security/org-trail --no-deletion-protection-enabled`, then `aws logs delete-log-group --log-group-name /hearth/security/org-trail`.
4. Run step F again from part 1: the CLI deletes the failed stack before it makes it anew, with termination protection on again.

First deploys run in the root (log-archive and the workload accounts through OAAR before their moves, management with `HearthSetUp`), where no `Workloads` fence binds. In a workload account already in `Workloads`, `HearthbaseStacksOnlyItsDeploy` lets only hearthbase's deploy role change a Baseline's termination protection, so a failed Baseline create there is cleared as tier 2. Note each step for the quarterly review.

### G. Bootstrapping an account

In the credentialed shell, from a folder with no `cdk.json` (beside one, the CLI would synthesise the app with your credentials), with the checkout's own CLI and the account read from the session, never typed:

```sh
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
"$CHECKOUT/node_modules/.bin/cdk" bootstrap "$ACCOUNT/ap-southeast-1" \
  --qualifier hearthbase --toolkit-stack-name CDKToolkit-hearthbase \
  --template "$CHECKOUT/infra/bootstrap/hearth-bootstrap.yaml" \
  --termination-protection --public-access-block-configuration true --no-notices
```

`CHECKOUT` is the checkout's path. Management and log-archive take `hearthbase` alone. The workload accounts also take `hearthapp`, once their Baseline has made `hearth-boundary` (step L): `--qualifier hearthapp --toolkit-stack-name CDKToolkit-hearthapp --custom-permissions-boundary hearth-boundary`, the rest the same. Each qualifier has its own toolkit stack, so the second never replaces the first. Never pass `--cloudformation-execution-policies`. Every account is bootstrapped from this committed template, whose deploy and file-publishing roles' trust takes a break-glass session's source identity, which an `lz:pr-` deploy needs (TECH-SPEC T24 item 11); an account bootstrapped from an older template is bootstrapped again from the committed one before step J or L moves it. Once an account sits in its OU, a bootstrap upgrade is tier 2 (step Q).

### H. The set-up permission set

Management has no OAAR, and `HearthOrgAdmin` is made by `Hearth-Foundation` itself, so the first deploys need a permission set of their own.

1. Synthesise `foundation` (step F, part 1 alone) and read `HearthOrgAdmin`'s inline policy from `cdk.out/Hearth-Foundation.template.json` (the `AWS::SSO::PermissionSet` named `HearthOrgAdmin`, its `InlinePolicy`).
2. As the root user, make `HearthSetUp` in Identity Center: AdministratorAccess, a 1-hour session, and that inline policy pasted whole, so it carries both `NoModels` and `NoAccountRemoval`. Assign it to the owner in management alone.
3. Sign in with `HearthSetUp`, and put the root user's keys away. `HearthSetUp` runs management's bootstrap, log-archive's first deploy through OAAR and `Hearth-Foundation`'s first deploy; step K deletes it.

### I. Trusted access, Cost Explorer and the anomaly monitor

1. Enable trusted access for CloudTrail, GuardDuty, IAM Access Analyzer and Identity Center.
2. Enable Cost Explorer.
3. Look for a cost anomaly monitor AWS may already have made: `aws ce get-anomaly-monitors --query 'AnomalyMonitors[].[MonitorName,MonitorType,MonitorDimension]' --output text`. If one watches AWS services by dimension, delete it (`aws ce delete-anomaly-monitor`) before Foundation's first deploy, which makes its own and would otherwise fail.

### J. Log-archive, through OAAR while it sits in the root

Log-archive comes before Foundation: the trail Foundation makes needs its bucket and its `hearth-sec` key.

1. Through OAAR in log-archive (from `HearthSetUp` in management): account-level Block Public Access on, and EBS encryption by default on.
2. Bootstrap `hearthbase` (step G).
3. From management, make log-archive the delegated administrator of GuardDuty, in ap-southeast-1 and in us-east-1, and of IAM Access Analyzer.
4. Deploy `Hearth-LogArchive` (step F, target `log-archive`).
5. Through OAAR in log-archive, in both Regions: GuardDuty's organisation configuration auto-enables `ALL` accounts, with the foundational sources and S3 Protection; Runtime Monitoring stays off.
6. Through OAAR in log-archive: confirm its topic's subscription (step N), and read back what nobody can read there once it sits in `Security` (*Check it worked*, "In log-archive"): GuardDuty's organisation configuration in both Regions, `CDKToolkit-hearthbase` and its roles, and the archive bucket's Object Lock configuration.
7. Move log-archive into `Security`. From then on nobody administers it, its own break-glass role included; `Hearth-LogArchive` changes only as tier 2 (step Q). Steps 1, 3, 5 and 6 can't be done after this move.

### K. Foundation, in management

1. Confirm the billing set's managed policy: `aws iam list-policies --scope AWS --query "Policies[?PolicyName=='AWSBillingReadOnlyAccess'].PolicyName" --output text` prints its name. If it prints nothing, stop: the set's policy name is wrong, and a PR fixes `infra/src/foundation/identity-center.ts` first.
2. Bootstrap `hearthbase` in management (step G), with `HearthSetUp`.
3. Deploy `Hearth-Foundation` (step F, target `foundation`), with `HearthSetUp`. It attaches the guardrails, makes the five permission sets and their assignments, the trail and its copy, the assured alarms, the budgets and management's topic.
4. Sign in with `HearthOrgAdmin` and confirm it works.
5. With `HearthOrgAdmin`, confirm management's topic's subscription (step N).
6. Unassign `HearthSetUp` and delete it. A4 alarms: note it as the first entry for the quarterly review.

Later deploys of `Hearth-Foundation`, after a reviewed PR, are the same step F under `HearthOrgAdmin` (A3 alarms on each session).

### L. Each workload account, non-prod then prod, through OAAR while it sits in the root

For non-prod first, then prod:

1. Through OAAR: account-level Block Public Access on, and EBS encryption by default on.
2. Bootstrap `hearthbase` (step G).
3. Deploy its Baseline (step F, target `nonprod-baseline` or `prod-baseline`). It makes GitHub's OIDC provider and roles, `hearth-break-glass`, `hearth-boundary`, the fast alarms, the topic, the image repository, the zones and the parameters.
4. Bootstrap `hearthapp` with `--custom-permissions-boundary hearth-boundary` (step G).
5. Read back the S3 prefix list: `aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.ap-southeast-1.s3 --query 'PrefixLists[].PrefixListId' --output text` prints the id `infra/src/config/profiles.ts` holds. A different id stops here, for a reviewed PR to the profile.
6. Through OAAR: confirm its topic's subscription (step N), and read back what nobody can read there once it sits in `Workloads` (*Check it worked*, "In each workload account"): both bootstrap stacks and their roles, and the image registry's scanning configuration. For prod, also read each zone's name servers, for step M: the zone's id from SSM (`aws ssm get-parameter --name /hearth/prod/zone/app --query Parameter.Value --output text`, then `/hearth/prod/zone/usercontent`), then `aws route53 get-hosted-zone --id <the zone's id> --query 'DelegationSet.NameServers'`. Write them down for step M; name servers are public, not secret.
7. Move the account into `Workloads`. From then on its Baseline changes only under break-glass with an `lz:pr-` reason ([Reaching production: the break-glass role](break-glass.md)), and a bootstrap upgrade only as tier 2. Step 6 can't be done after this move.

Between non-prod and prod, the delegation of `nonprod.`:

1. Read non-prod's name servers from its Baseline's outputs (`aws cloudformation describe-stacks --stack-name Hearth-nonprod-Baseline --query 'Stacks[0].Outputs'`, `AppNameServers` and `UserContentNameServers`), and again from each zone in non-prod (`aws route53 get-hosted-zone --id <the zone's id> --query 'DelegationSet.NameServers'`). The two must agree.
2. Put them into `NONPROD_NAME_SERVERS` in `infra/src/config/profiles.ts` by a reviewed PR, which the owner reads before it merges (an owner's-read value).
3. Before prod's Baseline deploys, compare the committed lists with both readings again, from a fresh checkout of `main`. Refuse any difference: a wrong name server would hand someone else a subdomain of prod's domain.

### M. The domains at the registrar

Point each registrable domain, at the registrar, at the name servers step L read for prod's zones before prod moved into `Workloads` (no identity reads prod's zones after that move), and turn on registry lock where the registrar offers it.

### N. Confirm each email subscription

Each of the four `hearth-ops-alerts` topics emails the ops mailbox a confirmation when its stack first deploys: log-archive's in step J, management's in step K, non-prod's and prod's in step L. Each is confirmed in that account's own step, within two days of the deploy (the confirmation's token expires) and before the account moves into its OU, since it needs that account's own credentials: OAAR in a member account, `HearthOrgAdmin` in management.

Ask for the ops mailbox's link scanning (a mail service's safe-links or preview fetches) to be off for AWS's notification address, since a scanner that follows the link confirms the subscription unauthenticated. Never confirm one by opening the email's link. A subscription confirmed by its link takes an unsubscribe from anyone holding any later alert email, by the unsigned link at its foot, which no guardrail can refuse; one confirmed with a signed call refuses every unsubscribe that isn't signed by its account, and CloudFormation can't ask for that itself.

1. Copy the confirmation link from the email without opening it (and with nothing previewing it), and take its `Token` parameter's value.
2. In that account, read the topic's ARN (`aws sns list-topics --query "Topics[?ends_with(TopicArn, ':hearth-ops-alerts')].TopicArn" --output text`), then confirm: `aws sns confirm-subscription --topic-arn <the topic> --token <the token> --authenticate-on-unsubscribe true`.
3. Check: `aws sns list-subscriptions-by-topic --topic-arn <the topic> --query 'Subscriptions[].SubscriptionArn' --output text` names one subscription, not `PendingConfirmation`, and `aws sns get-subscription-attributes --subscription-arn <it> --query 'Attributes.[PendingConfirmation,ConfirmationWasAuthenticated]' --output text` prints `false` and `true`.

If it prints `false` for `ConfirmationWasAuthenticated` (the link was opened first, by a person or by a mail scanner), replace the subscription in the same account and step, before the move: remove it with a signed call, `aws sns unsubscribe --subscription-arn <it>`, then subscribe the mailbox again, `aws sns subscribe --topic-arn <the topic> --protocol email --notification-endpoint <the ops mailbox>`, which sends a new confirmation, and confirm that as above. If the token expired before you confirmed, subscribe the mailbox again the same way. The topic's stack still records the subscription it made, so note the replacement for the quarterly review. Once management's alarms exist (step K), A6 alarms on each confirmation, unsubscribe and subscribe: expected here, and noted the same way.

### O. The RCP, staged

Foundation attaches `hearth-data-perimeter` to non-prod alone. On non-prod, prove each statement before it reaches anything else:

1. Every role assumption the landing zone makes still works: break-glass (step P's drill), and from C0.11 PR 4 the deploy role's two `hearthapp` roles.
2. `WebIdentityOnlyDeploySubjects`: from C0.11 PR 4, the deploy workflow's `nonprod` job assumes `hearth-gh-deploy`, and a web-identity assumption with any other subject is refused (CloudTrail shows the refusal). If an RCP turns out not to reach web-identity federation, or not to read that condition key, stop: a PR records it in TECH-SPEC T24 items 2 and 32, with the fallback (`aws:FederatedProvider`) or the residual.

After a week of clean non-prod deploys (from C0.11 PR 4), a reviewed PR moves the RCP to the root, and step F deploys `Hearth-Foundation`.

### P. The A1 drill

1. The person on call runs `infra/bin/break-glass.sh nonprod drill:<today's date in Singapore>` with `--console` once, then exits ([Reaching production: the break-glass role](break-glass.md)). This first run proves what no test can: the sign-in profiles, the source identity matching the person's `hearth-user` tag, the entries written once each under Object Lock, and the console link.
2. Then the same on prod: `infra/bin/break-glass.sh prod drill:<today's date in Singapore>`.
3. A1's email arrives within minutes from the account's topic (fast) and again from management's (assured), for each run. The open and close entries exist under `break-glass/<account>/<yyyy>/<mm>/<dd>/` in the break-glass-log bucket.
4. In non-prod, before step L's prod move relies on it, prove the chain an `lz:pr-` session takes into hearthbase: open a session with `lz:pr-<the PR that last changed non-prod's Baseline>` and, as [Reaching production: the break-glass role](break-glass.md)'s *A Baseline deploy under `lz:pr-N`* says, run a deploy of the unchanged non-prod Baseline from that PR's synth (a no-op). The CLI must print no warning that the session "could not be used to assume" `cdk-hearthbase-deploy-role-…` or `cdk-hearthbase-file-publishing-role-…` ("Proceeding anyway"); one naming the lookup role is expected. `cdk diff` alone isn't enough, since it can read through the session's own credentials. Then find the deploy in `/hearth/security/org-trail` and note whether CloudFormation's use of the hearthbase execution role carries the session's source identity, for TECH-SPEC T24 item 4's unproved list, by a PR.

### Q. A week later, COMPLIANCE, as tier 2

Once the first week's deliveries are confirmed (*Check it worked*), before C0.12's first database holds a real number:

1. A one-line PR sets `logLockMode` to `COMPLIANCE` in `infra/src/config/profiles.ts`, merged under the owner's-read rule.
2. With `HearthOrgAdmin`, move log-archive into `Recovery` (A5, and A3 for the session).
3. Through OAAR in log-archive, deploy `Hearth-LogArchive` (step F; A15 alarms).
4. Move log-archive back into `Security`.

The same four steps make every later tier-2 change: any `Hearth-LogArchive` change, and any account's bootstrap upgrade (the workload accounts move back into `Workloads`). Each is counted as a break-glass-class use: the person who ran it records its reason for the quarterly review, since tier 2 writes no break-glass log entry.

## Check it worked

Read each back with a `--query` that prints only the fields you need. Never paste the output anywhere. Each group names who reads it: once log-archive and prod sit in their OUs, nobody can read most of what they hold, so steps J and L read it, through OAAR, before each move.

- With `HearthOrgAdmin` in management:
  - Every account's parent: `aws organizations list-parents --child-id <account>` (log-archive in `Security`, non-prod and prod in `Workloads`, `Recovery` empty).
  - The policies on each target: `aws organizations list-policies-for-target --target-id <target> --filter SERVICE_CONTROL_POLICY` shows five at the root (`FullAWSAccess`, `hearth-baseline`, `hearth-baseline-2`, `hearth-no-models`, `hearth-region`), `hearth-log-protect` on `Security`, both `hearth-workload-fences` policies on `Workloads`. The same command with `--filter RESOURCE_CONTROL_POLICY` shows the RCP on non-prod's account (then on the root), and with `--filter AISERVICES_OPT_OUT_POLICY` the AI opt-out on the root. The three policy types are enabled on the root.
  - The delegated administrators: log-archive for GuardDuty in both Regions (`aws guardduty list-organization-admin-accounts`) and for Access Analyzer (`aws organizations list-delegated-administrators`).
  - Management's bootstrap stack and its roles (*Each bootstrap stack*, below).
  - After Foundation's first deploy, the trail was made and delivers: its `CreateTrail` succeeded (the stack's events), `aws cloudtrail get-trail-status --name hearth-org-trail --query '[IsLogging,LatestDeliveryError,LatestDigestDeliveryError]'` prints `true` and no error, a log file and a digest file have landed in the trail bucket, and the reviewer decrypts one (below). The trail's stored key is the `hearth-sec` alias's (`aws cloudtrail get-trail --name hearth-org-trail --query 'Trail.KmsKeyId'`).
  - Each permission set's session duration (1 hour, but the non-prod operator's 8 and the reviewer's 4), and the access portal's 1 hour.
  - Every fast rule's pattern, tried on a recorded event of the kind it should match and one it shouldn't: `aws events test-event-pattern --event-pattern <the rule's pattern> --event <the recorded event>`, which reads no account's rule. This proves the patterns no test can (`$or`, `exists`, `anything-but` with `wildcard`, ECS's rollback event) and that a member account receives management events. For `hearth-sec-a07-run-environment`, a recorded `RunTask` that overrides a container's environment must match, in whichever shape CloudTrail recorded it, and the probe run by `hearth-gh-deploy` must not.
  - Every metric filter's pattern, the 22 in `/hearth/security/org-trail` (`aws logs describe-metric-filters --log-group-name /hearth/security/org-trail` lists them, each named `hearth-sec-` and its alarm, with `-a`, `-b` and so on where an alarm has several), tried on recorded events: `aws logs test-metric-filter --filter-pattern <the pattern> --log-event-messages <recorded events>`, the one it should match and one it shouldn't. A6 (e) (`hearth-sec-a06-tampering-e`) must match `PutLogGroupDeletionProtection` naming the copy by name and by ARN, and `PutTransformer`.
  - Each assured alarm is on and emails management's topic alone: `aws cloudwatch describe-alarms --alarm-name-prefix hearth-sec- --query 'MetricAlarms[].[AlarmName,ActionsEnabled,length(AlarmActions)]' --output text` lists ten alarms, each `True` and `1`.
  - Each of the five saved queries in `/hearth/security/org-trail` run once over the set-up's events.
  - Each budget's amount and its three notifications (`aws budgets describe-budgets`), and the one anomaly monitor and its subscription.
  - Management's subscription, as step N checks it.
- In log-archive, through OAAR, in step J before its move:
  - GuardDuty's organisation configuration in both Regions: auto-enable `ALL`, S3 Protection on, Runtime Monitoring off (`aws guardduty describe-organization-configuration --detector-id <the Region's detector, from aws guardduty list-detectors>`).
  - Its bootstrap stack and its roles (*Each bootstrap stack*, below).
  - The archive bucket's Object Lock configuration (`aws s3api get-object-lock-configuration --bucket <bucket>`): enabled, with no default retention.
  - Its subscription, as step N checks it.
- In each workload account, through OAAR, in step L before its move:
  - Both bootstrap stacks and their roles (*Each bootstrap stack*, below).
  - The image registry's scanning configuration is the default, basic scanning on push (`aws ecr get-registry-scanning-configuration`).
  - The S3 prefix list's id equals the profile's (step L).
  - Its subscription, as step N checks it.
- *Each bootstrap stack:* its `BootstrapVariant` parameter reads Hearth's own variant (`aws cloudformation describe-stacks --stack-name CDKToolkit-hearthbase`, and `CDKToolkit-hearthapp`), and each of its roles holds the inline policy `hearth-no-models` (`aws iam get-role-policy --role-name <the role> --policy-name hearth-no-models`, its one statement `HearthNoModels`, a Deny on `*`).
- By the second reviewer, with `HearthSecurityReview` in log-archive:
  - The trail and break-glass-log buckets' Object Lock configuration (`aws s3api get-object-lock-configuration --bucket <bucket>`): GOVERNANCE for 731 days (COMPLIANCE after step Q).
  - Decrypting the first trail file and the drill's entries.

### The quarterly read-backs

Each quarter, read back again everything listed for management (with `HearthOrgAdmin`), the two buckets the reviewer reads, and non-prod's list with `HearthNonprodOperator` while it is assigned. The rest of log-archive's and the workload accounts' lists can be read there only as tier 2, so instead the second reviewer or an Owner runs this query on `/hearth/security/org-trail` in management over the quarter. It lists any change to those since steps J and L read them; none is expected, and each one is explained by a recorded tier-2 change or a reviewed Baseline deploy under its `lz:pr-` reason, or is a finding for [the quarterly review](break-glass-review.md):

```
fields @timestamp, recipientAccountId, eventSource, eventName, errorCode
| filter eventName not like /^(Get|List|Describe)/
| filter (eventSource = "guardduty.amazonaws.com" and eventName like /OrganizationConfiguration/) or eventName = "PutRegistryScanningConfiguration" or eventName = "PutObjectLockConfiguration" or (eventSource = "iam.amazonaws.com" and requestParameters.roleName like /^cdk-hearth/) or (eventSource = "cloudformation.amazonaws.com" and requestParameters.stackName like /CDKToolkit-hearth/) or (eventSource = "sns.amazonaws.com" and (requestParameters.topicArn like /:hearth-ops-alerts$/ or requestParameters.subscriptionArn like /:hearth-ops-alerts:/))
| sort @timestamp desc
```

## Afterwards

- `aws sso logout` in the credentialed shell; close both shells.
- The ids stay only in `infra/.env.local` and the credentialed shell's AWS config. C0.11 PR 5 records the dates (never an id) in TECH-SPEC T24 item 34.
- Anything that differed from this runbook is a PR to it.

## Closing a Hearth account

Closing a Hearth account, or taking it out of the organisation, would lift every SCP from it, the evidence floor included, and end its content after AWS's post-closure period. `HearthOrgAdmin` can't do it: its permission set denies both calls (`NoAccountRemoval`), and removing that deny is an alarmed edit (A4). It is a task for the management root's keys alone, after a reviewed decision, and the DPO and the second reviewer are told before it is done.

## Don't

- Run `cdk bootstrap`, `cdk diff` or `cdk deploy` from `infra/` (or any folder holding a `cdk.json`), or with `--app` naming the entry, or synthesise in a credentialed shell: each runs repository code under credentials.
- Edit an SCP, the RCP, a permission set, a topic, a rule or an alarm in the console. Every change is a reviewed PR, with three exceptions: step N's confirmation or replacement of a subscription; a security alert's containment ([A security alert](security-alerts.md#containing-an-unexpected-session)); and step F's *A first deploy failed*, which turns one failed stack's termination protection off and removes what its rolled-back create left, nothing else.
- Open the link in a subscription's confirmation email, or the unsubscribe link in any alert email.
- Use `CfnAccount` or Control Tower.
- Add an SMS subscription to any topic.
- Paste an account id, an ARN, a `.env.local` line or a command's output into a chat, an issue, a PR or a coding agent's session.
- Let a coding agent run any step.

## Code paths

- `infra/bin/landing-zone.ts`
- `infra/src/foundation/landing-zone.ts`
- `infra/src/config/env.ts`
- `infra/.env.example`
- `infra/src/config/profiles.ts`
- `infra/src/config/models.ts`
- `infra/src/config/names.ts`
- `infra/bootstrap/hearth-bootstrap.yaml`
- `infra/scripts/bootstrap-template.ts`
- `infra/src/foundation/foundation.ts`
- `infra/src/foundation/guardrails.ts`
- `infra/src/foundation/identity-center.ts`
- `infra/src/foundation/org-trail.ts`
- `infra/src/foundation/sentinel.ts`
- `infra/src/foundation/budgets.ts`
- `infra/src/foundation/log-archive.ts`
- `infra/src/foundation/security-services.ts`
- `infra/src/baseline/account-baseline.ts`
- `infra/src/baseline/github-oidc.ts`
- `infra/src/baseline/zones.ts`
- `infra/src/baseline/ecr.ts`
- `infra/src/baseline/ops-alerts.ts`
- `infra/src/baseline/fast-alarms.ts`
- `infra/bin/break-glass.sh`
- `infra/package.json`
- `RETENTION_CLASSES`
