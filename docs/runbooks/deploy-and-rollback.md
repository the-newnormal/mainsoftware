# Deploying a release, and rolling one back

## Use this when

- A merge to `main` is deploying: non-prod by itself, then prod once its reviewer approves.
- A release must be rolled back, in non-prod or in prod.
- The pipeline rolled a release back: a red run, or an A14 email ([A security alert](security-alerts.md)).
- A deploy job was cancelled or timed out, a stack is stuck, or a migration failed.
- A failed job is to be re-run.
- The pipeline must be paused, and later resumed: around every run of the Owner bootstrap script ([Setting up the organisation and its first Owner](first-owner-set-up.md), [Twilio withdrawn, and no DPO signed in](twilio-withdrawn.md)) and around the set-up runbook's cut-off of the GitHub roles ([Setting up the AWS organisation and its accounts](aws-account-set-up.md), step E.2).
- The commit the database was migrated by is needed.
- The rollback rehearsal is due, or the restore stage goes up or down.
- A7 emails about a prod run.
- The upkeep calendar (*Upkeep*, below).

## Who does what

- Whoever merges a PR to `main` starts non-prod's deploy, Claude among them while non-prod holds synthetic data. From C0.12's change that makes non-prod hold real data, `.github/environments/nonprod.json` asks for a reviewer and non-prod's deploy waits for the owner too (C11-Q05).
- The owner approves prod's deploys and rollbacks and the restore stage, only in GitHub's web UI, and dispatches rollbacks, drills and restores there: Actions, then the deploy workflow, then Run workflow.
- A repo admin pauses and resumes the workflow, applies the environments with `scripts/protect-environments.sh apply` and sets their secrets ([Setting up the AWS organisation and its accounts](aws-account-set-up.md), step E.4).
- The person on call handles A14 and A7 and, while GitHub is down, the incident rollback under break-glass ([Reaching production: the break-glass role](break-glass.md#an-incident-rollback-to-an-earlier-revision)).
- The second reviewer reconciles the deploy roles' sessions with the deployments each quarter ([The quarterly review of break-glass uses](break-glass-review.md), step 6).
- Claude, like any coding agent, never approves, rejects, dispatches, re-runs or cancels a run, never pauses or resumes the workflow, never writes a deployment, and never edits an environment, its reviewers or its secrets, by any route: a terminal, a GitHub connector or a browser.

## Before you start

- A GitHub login that can take the step: the owner's to approve and dispatch, a repo admin's to pause, never one a Claude Code session can use (C11-D57).
- For a `gh` line: `gh`, signed in, and `jq`, in a terminal outside any Claude Code session, in a checkout of `main` kept current, where `gh` fills `{owner}/{repo}` from the checkout's own remote, with `GH_REPO` and `GH_HOST` unset. For a `node infra/scripts/deploy/…` line: Node 24 (`node --version` prints `v24`) in the same checkout. The scripts load no npm package, so the checkout needs no install.
- A release is `<commit>:<digest>`: the commit on `main` it was built from, and its image's digest. The release a run deploys is the gate's `commit` with, for a deploy, the build's digest (`build: hearth-server@<digest>` in the build job's summary), or else the gate's `digest` (its summary, *The plan*). The deploy jobs' lines name it too, through a filter that blanks an account id (a run of twelve digits with no digit or lowercase hex letter beside it) and leaves a commit or digest whole.
- The records are GitHub deployments in the environment `nonprod` or `prod`, which the repository's Deployments page lists by environment. The pipeline writes three kinds, by task: `hearth-release` (a release that passed its smoke, or the release the pipeline rolled back to), `hearth-migrated` (the commit a migrate step applied, from C0.12) and `hearth-restore` (the restore stage brought up or down). GitHub adds one of its own for each job that names an environment, which names no release. An environment's release records, newest written first: `gh api 'repos/{owner}/{repo}/deployments?environment=<env>&task=hearth-release&per_page=20' --jq '.[] | [.id, .payload.kind, .payload.commit, .payload.digest] | @tsv'`. The pipeline orders them by the api service's task definition revision instead, since a record job runs outside the deploy group and a later run's record can land first. Read them as data: anything with Deployments write can add one, and the pipeline's own readers ignore any whose payload fails validation, each named by its id in the gate's and `prod-gate`'s summaries (`history: ignored hearth-release record <id> in <env>: its payload fails validation`).

## Steps

### What a dispatch can ask for

A dispatch runs on `main` (Actions, then the deploy workflow, then Run workflow), with four inputs. A deploy always deploys `main`'s head; an older release goes back only as a rollback. The gate refuses every other combination, and any run a bot starts; on a bot's re-run each job's own bot test skips it, so nothing runs.

| To | target | mode | release | restore |
|---|---|---|---|---|
| Deploy to non-prod alone | `nonprod` | `deploy` | empty | `none` |
| Deploy to non-prod, then prod | `prod` | `deploy` | empty | `none` |
| Roll an environment back | `nonprod` or `prod` | `rollback` | the release's commit | `none` |
| Run a drill | `nonprod` | `drill-break` or `drill-smoke` | empty | `none` |
| Bring the restore stage up or down | `restore` | `deploy` | empty | `up` or `down` |

### A release, from merge to prod

A push to `main` runs the deploy workflow as `mode=deploy`, `target=prod`. Each job's summary says what it did. In order:

1. `gate` checks who started the run and where; that the commit is its merged PR's tree, with that PR's `check` and `migrations` green; that `main`'s ruleset and the environments are live as written; the floors; and that `DOMAINS` holds no placeholder. *The plan* lists the mode, the target, the commit, each environment's current release and the release each automatic rollback would go back to. A refusal is one line, `history: refused <code>: <why>`.
2. `build` makes the server image on ARM and checks it as CI does; `synth` synthesises the release's cloud assembly, and each environment's previous release's. Neither holds a credential.
3. `nonprod` checks what runs (`aws-check: deploy passed: Hearth-nonprod-Services is <status> and runs <release>`), pushes the image, deploys Platform, Data and Tasks, migrates (from C0.12), deploys Services, probes, and reads back what runs (`read-back: Hearth-nonprod-Services runs <release>`). `smoke-nonprod` prints one line a check, `SMK-0n pass` or `SMK-0n fail <reason>`, and `record-nonprod` writes the release record and shows it in its summary. C0.11's Done asks for under 20 minutes from the merge to the green smoke; the first runs measure it. A red non-prod never stages prod.
4. `prod-plan` diffs prod's deployed templates against the release through `hearth-gh-diff`, a role that reads templates and nothing else, into its summary, *What prod's deploy changes*, cut at 900 KB with a line saying so. Two warnings are expected: the session "could not be used to assume" the lookup role, and "Lookup role … was not assumed. Proceeding with default credentials." A normal release changes the Tasks and Services stacks' task definitions (the image's digest) and the `Release` output. Anything else is a change the merged PR made: match it with the PR before approving.
5. `prod-gate` waits up to 30 minutes for `main`'s own CI on the commit (`ci.yml`'s `check` and `migrations`), then checks that the commit descends from prod's current release and that prod gets the very image non-prod deployed.
6. `prod` waits for its reviewer. Approve only on the run's page in the web UI (Review deployments, then `prod`, then Approve and deploy), after reading the diff and *The plan*. After the approval it reads prod's records again before it takes any credential, then deploys as `nonprod` did. `smoke-prod` and `record-prod` follow.

On approving:

- An older run still waiting for its approval is replaced by a newer run's, or you reject it (*Afterwards*). Rejecting starts no rollback job.
- A run's artifacts last 14 days: an approval given later fails at its download, and a dispatch of `deploy` to `prod` replaces it.
- **Prod's first approval** waits until the set-up runbook's step R.7 proofs and non-prod's rehearsal (*The rehearsal*, whose `drill-break` gives the A14 email) are done (TECH-SPEC T24 item 5). Leave the first run's prod approval waiting meanwhile, or reject it and dispatch `deploy` to `prod` afterwards.
- Every approved prod run raises one assured A7 episode, since each changes stacks in prod's account (a deploy or a rollback at least the Tasks and Services stacks, whose task definitions name another image): match it with the run ([A security alert](security-alerts.md)).

### When the pipeline rolled back

- A deploy job that failed once its Services deploy began, or a failed smoke: ECS's circuit breaker and CloudFormation's stack rollback act first (A14 emails when the breaker fires). Then `rollback-<env>` checks that this run's release is what runs and, if it is, deploys the release before it (*The plan*'s `previous_<env>_commit`) from that release's own assembly, probes and reads back; `resmoke-<env>` judges it, and `record-<env>` writes a `pipeline-rollback` record. Prod's rollback job waits for the reviewer again. The run ends red either way (`record: the release's own smoke didn't pass, so the run ends red`).
- What next: a forward fix by PR, or a manual rollback further back (*A manual rollback*).
- When no rollback ran (a first deploy, or a previous release below a floor: *The plan*'s `rollback_<env>` reads `false`), or the rollback job was rejected, failed or found `aws-check: auto: this run's release isn't what runs …` (another run deployed since), the failed release may be live with no record. Take what runs from the run's summary (*Before you start*), then dispatch `mode=rollback` to the previous release (*A manual rollback*), or fix forward by PR. The gate checks what the records show, and the deploy job that the target is strictly older than what runs.
- When the smoke passed but the record job failed (a GitHub error), re-run the record job (*Re-running a failed job*). Until then the release is live with no record, which the pipeline allows for.

### A manual rollback

1. Choose the release. By default it is the one that ran before the current release first did, never simply the record before the newest: a rollback writes a record too. In your checkout of `main`, save the environment's release records, `gh api 'repos/{owner}/{repo}/deployments?environment=<env>&task=hearth-release&per_page=100' > <folder>/records.json`, and let the release history choose: `node infra/scripts/deploy/history.ts choose --env <env> --records <folder>/records.json --current <commit>:<digest>`, the current release being what runs now (*Before you start*). It prints `commit <commit>`, `digest <digest>` and each service's task definition, or one line, `history: refused <code>: <why>`.
2. To go back to another release from the list, check it the same way: `node infra/scripts/deploy/history.ts validate --env <env> --records <folder>/records.json --current <commit>:<digest> --target <commit>`.
3. Check the floors: `node infra/scripts/deploy/floors-check.ts --target <commit>` prints `floors-check: allowed`, or a `floors-check: refused <migration> (<why>)` line for each floor in the way (*Floors*). The gate runs the same check; running it first saves a refused run.
4. Dispatch it in the web UI: Actions, then the deploy workflow, then Run workflow on `main`, with mode `rollback`, target `nonprod` or `prod`, release the chosen commit, and restore `none`.
5. The gate (and, for prod, `prod-gate`, which doesn't wait for CI) checks what the records show: the release is recorded in that environment with its digest, it is on `main`, and it is above every floor. The deploy job checks what runs: the release's digest isn't the one running, its commit is strictly older than what runs, and ECR still holds its image under its commit's tag. ECR keeps the newest 50 images, and past them the release can't start (`aws-check: ECR holds no image of the release under its commit's tag`).
6. It deploys the Tasks and Services stacks alone, from the release's own assembly: it never migrates and never pushes an image. Then the probe and the smoke. Prod's waits for the reviewer, after the `prod-plan` diff (*What prod's rollback changes*).
7. `record-<env>` writes a `rollback` record, its `migratedCommit` carried forward unchanged.

While a dispatched rollback waits, hold merges to `main`: a push's run can replace a pending one.

### After a rollback outside the pipeline

After break-glass's incident rollback ([Reaching production: the break-glass role](break-glass.md#an-incident-rollback-to-an-earlier-revision)), or `HearthNonprodOperator`'s in non-prod, the services run the release gone back to while the Services stack's `Release` and the release record still name the release rolled back from.

- The first run in that environment is a manual rollback to the release the services now run (*A manual rollback*). It registers that release's revisions afresh, records it, and brings the stack into line.
- Until it has run, hold merges to `main` (a push deploys non-prod) and approve no forward prod deploy.
- A forward deploy or a drill refuses by itself meanwhile: `aws-check: the services don't run Release's image (an incident rollback outside the pipeline): dispatch mode=rollback with release <commit> first (deploy-and-rollback.md)`, naming the commit whose image the services run. A rollback may then go only to that release.
- A dispatched rollback still waiting when a push arrives can be replaced by the push's run, which then refuses: dispatch the rollback again.

### A deploy job that was cancelled or timed out

GitHub stops the job, not CloudFormation or a one-off task it started, and no rollback job runs after a cancelled job. Read the run's last summary line, then the Services stack's status and `Release`: from the next run's refusal, or with `aws cloudformation describe-stacks --stack-name Hearth-<env>-Services --query "Stacks[0].[StackStatus, Outputs[?OutputKey=='Release'].OutputValue | [0]]" --output text` in a break-glass session under a `drill:` reason ([Reaching production: the break-glass role](break-glass.md)), or in non-prod, while it holds synthetic data, as `HearthNonprodOperator` in your own shell.

- Still `_IN_PROGRESS`: wait. The next run refuses until it settles (`aws-check: a deployment is in progress: wait for it to settle, then dispatch again`).
- Settled on the new release: judge it as a failed smoke (*When the pipeline rolled back*), and roll back or fix forward.
- Settled back on the old one: nothing moved.

A job cancelled or timed out in its migrate step may leave the migrate task running: see *The commit the database was migrated by*. Another workflow, a branch's included, can cancel a deploy job through its concurrency group (`deploy-nonprod` or `deploy-prod`, which are the repository's): a cancelled run nobody here cancelled is a finding for the quarterly review.

### A stack that is stuck

Only hearthapp's deploy role may continue, roll back or delete a stage's stack, so the pipeline's next deploy of that stack repairs it. The deploy job's log names the stack and its status.

- `_IN_PROGRESS` (a job that timed out or was cancelled while CloudFormation worked): wait, then dispatch the same mode again.
- `UPDATE_ROLLBACK_FAILED` (a rollback that failed, as when a containment cut the execution role off mid-update): dispatch the same mode again. The CLI continues the rollback, skipping nothing, then deploys. If it fails again, a resource can't roll back, and that is tier 2 ([Reaching production: the break-glass role](break-glass.md#tier-2)): continuing the rollback with that resource skipped. Record it in the on-call notes.
- `ROLLBACK_COMPLETE` after a failed create: a fresh push or a dispatch of `deploy` deletes and creates a Tasks or Services stack again. A Platform or Data stack keeps its termination protection, which the CLI never turns off, so it waits for tier 2.

Each of these is the CLI's own behaviour, unproved until the first stack left so (TECH-SPEC T24 item 20). If the run fails instead, it fails closed: tier 2, and this section corrected by PR.

### A failed migration

From C0.12, once the Tasks stack's `HasDatabase` is on. The migrate step prints only its status lines (`migrate: applied <migration>`, `migrate: nothing to apply` and the like) and a count of the lines it withheld. On a non-zero exit the job stops before the Services deploy, so the services still run the previous release, on the new Tasks stack's definitions, which nothing else runs.

- `migrate: nothing was applied; the batch rolled back`: the database is as it was. Fix forward by PR.
- Any other line after a failure, or a task that never stopped (`migrate: the task didn't stop in time, so it is …`): the database may have moved. Read the migration record and the newest image's tag (*The commit the database was migrated by*), and pause deploys (*Pausing and resuming*) until the person on call has looked.
- Never roll back across it (*Floors*).

### Floors

A floor marks a contracting migration: one that removes or renames what an older release still reads. The PR that adds such a migration adds its floor to `infra/src/release/floors.ts` (an owner's read), with why. A rollback to a release whose migrations lack a floor's migration is refused once the floors' commit has it.

- The pipeline reads the floors at the run's own commit (`main`'s head for a dispatch), so it may refuse a rollback for a floor whose migration the environment hasn't applied yet: roll forward, or wait for that release.
- The infra seams follow the same rule (TECH-SPEC T24 item 22): a PR that removes or renames an SSM parameter, a security group, a role, a log group or the cluster the Tasks and Services stacks read keeps the old one while any release among ECR's newest 50 images reads it, or says in its description that rollbacks before it are impossible. A rollback that meets a removed seam fails at its change set and leaves the current release running.

### Re-running a failed job

On the run's page, Re-run jobs, then the failed jobs or one job. A re-run runs only those jobs and the ones after them, with the gate's first answers; each job runs its own bot test again, so on a bot's re-run every job is skipped and nothing runs. It gets a new attempt number, so a new image tag and new client tokens. A person, never Claude, may re-run:

- `record-<env>` after a failed write: it writes the record from the first attempt's results;
- `prod-gate`, once `main`'s CI, re-run, has passed;
- a deploy job after a transient error: its fast re-check and its check of what runs run again, and refuse if another run has deployed since.

Re-run nothing older than its artifacts (14 days): dispatch afresh instead.

### Pausing and resuming

A repo admin, in the web UI (Actions, then the deploy workflow, then Disable workflow) or in a terminal outside any Claude Code session:

1. Disables the workflow: `gh workflow disable deploy.yml`.
2. Rejects any run waiting for its approval (`waiting`), on its page, which opens no rollback approval.
3. Lets a running one finish. It may be cancelled (Cancel workflow on its page, or `gh run cancel <run id>`) only while none of its deploy jobs has reached its migrate step or its probe: a one-off task already started runs on after its job is cancelled, and a migrate finishing then writes no migration record.
4. Then sees no run of it in any of six statuses: for each of `in_progress`, `queued`, `waiting`, `pending`, `requested` and `action_required`, `gh run list --workflow deploy.yml --status <status> --json databaseId --jq length` prints `0`.

To resume:

1. Enable the workflow: `gh workflow enable deploy.yml`.
2. Compare `main`'s head (`git ls-remote origin refs/heads/main`) with each environment's newest release record's commit: `gh api 'repos/{owner}/{repo}/deployments?environment=<env>&task=hearth-release&per_page=1' --jq '.[0].payload.commit // "none"'`, for `nonprod` and for `prod`.
3. If either differs, dispatch `deploy` to `prod`, since pushes made while the workflow was disabled were never queued. Otherwise do nothing: a dispatch builds and deploys both environments again under a new digest, and asks for prod's approval.

Every run of the Owner bootstrap script happens inside such a pause ([Setting up the organisation and its first Owner](first-owner-set-up.md#running-the-owner-bootstrap-script)), and so does the set-up runbook's cut-off of the GitHub roles before an owner's rename ([Setting up the AWS organisation and its accounts](aws-account-set-up.md#e-githubs-oidc-subject-and-the-rest-of-the-configuration)).

### The commit the database was migrated by

`gh api 'repos/{owner}/{repo}/deployments?environment=<env>&task=hearth-migrated&per_page=1' --jq '.[0].payload.commit // "none"'` prints the newest migration record's commit, or `none` when no migration has run there (no database yet: C0.11). It is the newest release record's `migratedCommit`, or newer after a run that failed once it had migrated.

The record can lag the database: a migrate task that finished after its job was cancelled or timed out writes none. So, in the break-glass session the Owner bootstrap script's run opens anyway, read the commit in the tag (`sha-<commit>-<run id>-<attempt>`) of the newest image in that account's ECR: `aws ecr describe-images --repository-name hearth-server --query 'sort_by(imageDetails, &imagePushedAt)[-1].imageTags' --output text`. A deploy pushes its image before it migrates, so that commit is at or after any commit that has migrated the database. When the two differ, take the newer: on `main` one descends from the other (`git merge-base --is-ancestor <older> <newer>` succeeds). The Owner bootstrap script refuses any other checkout anyway, by comparing its migrations with the database's, so a checkout taken before the session that turns out older is taken again at the newer commit, and the run starts again.

### The rehearsal

The rollback rehearsal (C11-D59), dispatched in the web UI: on non-prod before prod's first workload deploy (TECH-SPEC T24 item 5), on prod the same week, then quarterly. On non-prod:

1. `drill-break`: it deploys non-prod's Services with realtime unable to start, and passes when that deploy fails and CloudFormation and the circuit breaker put realtime back on the revision it ran (`drill-break: the broken deploy failed and realtime runs <family:revision> again`); then the smoke passes. Expect an A14 email. The run is green when the drill passed. Afterwards the person on call, in a break-glass session under a `drill:` reason, lists realtime's family's `ACTIVE` revisions, `aws ecs list-task-definitions --family-prefix hearth-nonprod-realtime --status ACTIVE`, and notes for C0.11 PR 5's record, by revision number alone and never an ARN, whether the drill's own revision (the one whose `LOG_LEVEL` is `drill`, read as the incident rollback's step 2 reads a revision) stays among them. If it does, the incident rollback names it to `history.ts choose-ecs` with `--drill`, so it is never chosen.
2. `drill-smoke`: the normal deploy path with non-prod's current release (no change and no migrate), the probe, then the smoke, inverted on SMK-05, fails on purpose; `rollback-nonprod` deploys the release that ran before, `resmoke-nonprod` passes and `record-nonprod` writes a `pipeline-rollback` record. The run ends red by design, and non-prod is left on the earlier release.
3. A forward deploy: dispatch `deploy` to `nonprod`.
4. A rollback outside the pipeline, by someone holding `HearthNonprodOperator`, following break-glass's incident rollback while GitHub can be read.
5. A dispatch of `deploy` to `nonprod`, which must be refused for drift (*After a rollback outside the pipeline*).
6. A dispatch of `rollback` to the release the services now run, which must pass.
7. A manual rollback (*A manual rollback*), then a forward deploy again.

On prod, the same week: one manual rollback, with the approval, and one forward deploy. C0.11 PR 5 records the dates and run numbers in TECH-SPEC T24 item 34.

### The first runs' proofs

Once each, before prod's first deploy; C0.11 PR 5 records them. The set-up runbook's step R.7 has the ones read in AWS ([Setting up the AWS organisation and its accounts](aws-account-set-up.md#r-before-the-first-workload-deploy)).

- The OIDC subject GitHub sends. A first `nonprod` job that fails at its credentials step was given the wrong form: take the set-up runbook's step E.2 correction path ([Setting up the AWS organisation and its accounts](aws-account-set-up.md#e-githubs-oidc-subject-and-the-rest-of-the-configuration)), in its order: the reviewed PR recording the form first, then `Hearth-Foundation` under `HearthOrgAdmin`, then both Baselines under `lz:pr-<that PR>`, each diff changing the subjects alone.
- The environments' fields the gate reads, `can_admins_bypass` among them. If GitHub's read leaves one out, the gate refuses every run until a reviewed PR moves that field to a quarterly read-back in the web UI.
- The build's containerd image store and `psql` on the ARM runner.
- `prod-plan`'s template diff as `hearth-gh-diff`.
- The first image pull through the S3 gateway.
- A release record into `prod`, which has a required reviewer, taking its `success` status at once.

### Restore up and down

The restore stage (C11-D45), in prod's account:

1. Dispatch mode `deploy`, target `restore`, restore `up`. The gate needs a prod release record: the restore runs prod's current release, already in prod's ECR.
2. Approve the run's `prod` job, as for a prod deploy. There is no `prod-plan` diff, so read the run's summary first: the direction, the commit and the digest.
3. It deploys the restore stage's Platform, Data, Tasks and Services, Valkey and five endpoints among them (about 20 minutes), then the probe, which raises A7 in prod (expected), and the read-back. `smoke-prod` checks the services' half of SMK-06, and `record-prod` writes a `hearth-restore` record, `up`.
4. The same day, dispatch restore `down`, since an active stage costs about USD 2 a day. It deploys Services, then Data, then Platform, each only if it exists and has settled, with no probe, and `record-prod` writes a `hearth-restore` record, `down`.

### A restore that failed

An `up` that failed or timed out leaves its stacks wherever CloudFormation took them, and costs money while Valkey and the endpoints exist. Dispatch `down` the same day. It deploys Services, Data and Platform in that order, each only if it exists and has settled: it skips one that doesn't exist (`restore down: Hearth-restore-<Part> doesn't exist, so it is skipped`) or that a failed create left (`… is what a failed create left, so it is skipped`), which holds nothing billed, and refuses one still moving (`… is <status>: wait for it to settle, then dispatch again`), so wait and dispatch again. A restore Platform or Data stack that a failed first create left waits for tier 2 to remove it before the next `up`.

### Upkeep

What one person maintains (C11-D72):

| When | What | Time |
|---|---|---|
| Each merge | Glance at the non-prod run; for prod, read the diff and approve | 2 min |
| Weekly (Monday) | Renovate's CDK group PR and its action-pin PRs, each pin to `deploy.yml` an owner's read: CI proves synth and the tests, and the inventory snapshot shows any new resource type | 10 min |
| On an alert email | Break-glass: expected or not. GuardDuty: triage. A7: was this my deploy? Budget: look | as needed |
| Quarterly | The rollback rehearsal on non-prod; the second reviewer's break-glass review (every A1, A15 and tier-2 use); Identity Center users and assignments; Budgets; the manual landing-zone steps against the runbook's read-backs, the bootstrap roles' model deny included | 1 h, plus the reviewer's hour |
| Twice a year | Both security keys work; alert delivery (a test message to each `hearth-ops-alerts`) | 15 min |
| C0.17 onwards, quarterly | The restore drill (C6.5) | C0.17's |

## Check it worked

- The run is green, but for a `drill-smoke`, which ends red by design.
- The environment's newest `hearth-release` record names the release and its `services`.
- The Services stack's `Release` output equals it: from the run's summary (`read-back: Hearth-<env>-Services runs <release>`), or in a break-glass session under a `drill:` reason.
- After a rollback, both name the release gone back to.
- After a restore `down`, the restore stage's services show a desired count of 0 (the read-back, and `smoke-prod`'s SMK-06), or none where `down` skipped their stack.

## Afterwards

- Reject a stale waiting approval: a run waiting for its approval may hold `deploy-prod` (the first runs show whether it does) and so block later prod deploys until it is approved or rejected.
- Note in the on-call notes a cancelled run nobody here cancelled, and a rollback outside the pipeline not yet reconciled.
- Each quarter, the second reviewer reconciles the deploy roles' sessions with the deployments ([The quarterly review of break-glass uses](break-glass-review.md), step 6).
- Keep to the calendar (*Upkeep*).

## Don't

- Approve from a terminal, or approve a run whose diff and plan you haven't read.
- Approve a forward deploy while a rollback outside the pipeline is unreconciled.
- Edit an environment or its reviewers in the web UI rather than by PR and `scripts/protect-environments.sh apply`. Secrets are the exception: only the web UI or `gh secret set` sets them.
- Write or delete a deployment by hand.
- Re-run an old run's prod job to deploy it: the fast re-check refuses an older release anyway.
- Cancel a run past its migrate step or its probe.
- Roll back past a floor.
- Leave the restore stage up.
- Give any Claude Code session a token with Deployments write, Actions write or Administration, or browser or computer control over a GitHub sign-in that can approve prod.

## Code paths

- `.github/workflows/deploy.yml`
- `.github/environments/prod.json`
- `.github/environments/nonprod.json`
- `.github/environments/prod-plan.json`
- `scripts/protect-environments.sh`
- `infra/scripts/deploy/history.ts`
- `infra/scripts/deploy/floors-check.ts`
- `infra/scripts/deploy/smoke.ts`
- `infra/src/release/floors.ts`
- `infra/src/workload/stage.ts`
- `infra/src/workload/services.ts`
- `infra/src/workload/tasks.ts`
- `apps/server/src/deploy/ready-probe.ts`
- `apps/server/src/db/migrate.ts`
