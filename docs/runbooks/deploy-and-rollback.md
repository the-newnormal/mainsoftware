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
- For a `gh` line: `gh`, signed in, and `jq`, in a terminal outside any Claude Code session, in a checkout of `main` kept current, where `gh` fills `{owner}/{repo}` from the checkout's own remote, with `GH_REPO` and `GH_HOST` unset. A line that writes (disabling or enabling the workflow, cancelling a run) needs a repo admin's login, which lives only with the separate operating-system user the set-up runbook keeps for its shells ([Setting up the AWS organisation and its accounts](aws-account-set-up.md#before-you-start)), where no Claude Code session runs: `gh` keeps its login in the operating-system user's own credential store, which every process of that user can read. The other lines only read. For a `node infra/scripts/deploy/…` line: Node 24 (`node --version` prints `v24`) in the same checkout. The scripts load no npm package, so the checkout needs no install.
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

1. `gate` checks who started the run and where; that the commit is its merged PR's tree, with that PR's `check` and `migrations` green; that `main`'s ruleset and the environments are live as written (a `protect-environments: <name> <field> differs` line names what isn't: the set-up runbook's step E.4 puts an environment right, and its step E.1 an `oidc` line); the floors; and that `DOMAINS` holds no placeholder. *The plan* lists the mode, the target, the commit, each environment's current release and the release each automatic rollback would go back to. A refusal is one line, `history: refused <code>: <why>`. The PR's checks are read from the newest `ci.yml` run on its head commit from the PR's own head repository (by id) and branch, so `history: refused pr-checks-failed` while the PR shows green means another run of `ci.yml` at that head was chosen: a repo admin, never Claude, deletes that stray run in the web UI (its page, then Delete workflow run), and the deploy is dispatched again (`deploy` to `prod`).
2. `build` makes the server image on ARM and checks it as CI does; `synth` synthesises the release's cloud assembly, and each environment's previous release's. Neither holds a credential.
3. `nonprod` checks what runs and that no image in ECR is of a later commit than the run's (`aws-check: deploy passed: Hearth-nonprod-Services is <status> and runs <release>`), pushes the image, deploys Platform, Data and Tasks, migrates (from C0.12), deploys Services, probes, and reads back what runs (`read-back: Hearth-nonprod-Services runs <release>`). `smoke-nonprod` prints one line a check, `SMK-0n pass` or `SMK-0n fail <reason>`, and `record-nonprod` writes the release record and shows it in its summary. C0.11's Done asks for under 20 minutes from the merge to the green smoke; the first runs measure it. A red non-prod never stages prod.
4. `prod-plan` diffs prod's deployed templates against the release through `hearth-gh-diff`, a role that reads templates and nothing else, into its summary, *What prod's deploy changes*, cut at 900 KB with a line saying so. Two warnings are expected: the session "could not be used to assume" the lookup role, and "Lookup role … was not assumed. Proceeding with default credentials." A normal release changes the Tasks and Services stacks' task definitions (the image's digest) and the `Release` output. Anything else is a change the merged PR made: match it with the PR before approving.
5. `prod-gate` waits up to 30 minutes for `main`'s own CI on the commit (`ci.yml`'s `check` and `migrations`), then checks that the commit descends from prod's current release and that prod gets the very image non-prod deployed.
6. `prod` waits for its reviewer. Approve only on the run's page in the web UI (Review deployments, then `prod`, then Approve and deploy), after reading the diff and *The plan*. After the approval it checks that `prod-plan` ran in the same attempt of the run and that prod's newest release record is still the one `prod-gate` read, before it takes any credential, then deploys as `nonprod` did. `smoke-prod` and `record-prod` follow.

On approving:

- An older run still waiting for its approval is replaced by a newer run's, or you reject it (*Afterwards*). Rejecting starts no rollback job.
- A run's artifacts last 14 days: an approval given later fails at its download, and a dispatch of `deploy` to `prod` replaces it.
- **Prod's first approval** waits until the set-up runbook's step R.7 proofs and non-prod's rehearsal (*The rehearsal*, whose `drill-break` gives the A14 email) are done (TECH-SPEC T24 item 5). Leave the first run's prod approval waiting meanwhile, or reject it and dispatch `deploy` to `prod` afterwards.
- Every approved prod run raises one assured A7 episode, since each changes stacks in prod's account (a deploy or a rollback at least the Tasks and Services stacks, whose task definitions name another image): match it with the run ([A security alert](security-alerts.md)).

### When the pipeline rolled back

- A deploy job that failed once its Services deploy began, or a failed smoke: ECS's circuit breaker and CloudFormation's stack rollback act first (A14 emails when the breaker fires). Then `rollback-<env>` checks that this run's release is what runs, that the release this run's deploy replaced is the previous release or a later one (a rebuild or a later commit), and that no image in ECR is of a later commit than the run's. If all three hold, it deploys the previous release (*The plan*'s `previous_<env>_commit`: the newest release record when the gate read them) from that release's own assembly, probes and reads back; `resmoke-<env>` judges it, and `record-<env>` writes a `pipeline-rollback` record. Prod's rollback job waits for the reviewer again, with no `prod-plan` diff of its own: it deploys the Tasks and Services stacks of *The plan*'s `previous_prod_commit`, so before approving read that and the run's *What prod's deploy changes*, whose Tasks and Services changes it takes back. The run ends red either way (`record: the release's own smoke didn't pass, so the run ends red`).
- What next: a forward fix by PR, or a manual rollback further back (*A manual rollback*).
- On a first deploy (*The plan*'s `first_<env>` reads `true`) there is no earlier release to go back to, and a dispatched rollback is refused (`no-release`). Fix forward by PR, or, for a failure that may not recur, dispatch `deploy` to the same target, which deploys `main`'s head again (TECH-SPEC T24 item 20); a Tasks or Services stack a failed create left is handled as *A stack that is stuck* says.
- When the rollback job rolled nothing back (`rolled=false`) because `aws-check: auto: this run's release isn't what runs …`, nothing of this run is live. Either ECS's circuit breaker and CloudFormation's stack rollback already put back the release this run's deploy replaced, which is the usual end of a failed Services deploy and of a forward deploy's A14 email (the deploy job's `aws-check: deploy passed: … runs <release>` line names that release), or another run has deployed since, and its own smoke and rollback judge it. Roll nothing back for this run: fix forward by PR. Only if the release that runs now is itself failing, read it (`Release`, as *A deploy job that was cancelled or timed out* reads it), judge it as a failed smoke, and choose with `--current` set to it (*A manual rollback*).
- When no rollback ran otherwise (a previous release below a floor: *The plan*'s `rollback_<env>` reads `false`), or the rollback job was rejected, cancelled or failed, or rolled nothing back for either reason below, the failed release may be live with no record. A rollback job that rolled nothing back for one of these names it in its summary:
  - `aws-check: auto: this run's deploy replaced <release>, not the previous release (<release>) or a later one …`: a rollback landed after the gate read the records, or one whose smoke failed left an older release live with no record, so going back to the previous release would move forward past it. Choose the release afresh (*A manual rollback*, step 1, which goes by the records).
  - `aws-check: auto: a later commit (<commit>) pushed an image, so it may have migrated the database, and nothing is rolled back: check the floors at it (deploy-and-rollback.md)`: a later run pushed its image, and a deploy pushes before it migrates, so the database may have moved past a floor the gate read at this run's commit (*Floors*).

  Then read what runs. After either of those two lines it was this run's release (*Before you start*) when the check ran. Otherwise it was the deploy job's `read-back: Hearth-<env>-Services runs <release>` line when that job got so far and the rollback job deployed nothing, or else `Release`, read as *A deploy job that was cancelled or timed out* reads it, since CloudFormation may have put the run's own release back. A line of this run's holds only while no other run's deploy or rollback job has used the group (`deploy-<env>`) since: once one has (the workflow's later runs show it), read `Release` now, or take the newest `read-back:` line among those runs, and if what runs is a later run's release, that run's own smoke and rollback judge it, so roll nothing back for this run unless that release is itself failing. Dispatch `mode=rollback` to the release chosen with `--current` set to what runs (*A manual rollback*), or fix forward by PR. The gate checks what the records show, and the deploy job that the target is strictly older than what runs and that no later commit than the dispatch's has pushed an image.
- A rollback job that failed on `aws-check: the Services stack is UPDATE_ROLLBACK_FAILED …` moved nothing: the deploy's Services update failed and so did CloudFormation's rollback of it. The stack waits for tier 2 (*A stack that is stuck*); once tier 2 has continued its rollback, read what runs and judge it as above.
- When the smoke passed but the record job failed (a GitHub error), re-run the record job (*Re-running a failed job*). Until then the release is live with no record, which the pipeline allows for.

### A manual rollback

1. Choose the release. By default it is the one that ran before the current release's commit first did, never simply the record before the newest (a rollback writes a record too), and never an earlier build of the current commit, which holds the same code. In your checkout of `main`, pulled first (*Before you start*), save the environment's release records, `gh api 'repos/{owner}/{repo}/deployments?environment=<env>&task=hearth-release&per_page=100' > <folder>/records.json`, and let the release history choose: `node infra/scripts/deploy/history.ts choose --env <env> --records <folder>/records.json --current <commit>:<digest>`, the current release being what runs now: the Services stack's `Release`, which the last run that read it back names (`read-back: Hearth-<env>-Services runs <release>`), or as *When the pipeline rolled back* says after a failure. It prints `commit <commit>`, `digest <digest>` and each service's task definition, or one line, `history: refused <code>: <why>`, or, for a commit your checkout lacks, `history: <commit> is not in this clone` (pull `main` and run it again).
2. To go back to another release from the list, or when `choose` refuses, check one the same way: `node infra/scripts/deploy/history.ts validate --env <env> --records <folder>/records.json --current <commit>:<digest> --target <commit>`.
3. Check the floors: `node infra/scripts/deploy/floors-check.ts --target <commit>` prints `floors-check: allowed`, or a `floors-check: refused <migration> (<why>)` line for each floor in the way (*Floors*). `floors-check.ts` itself refuses, before it reads anything, a `--target`, a `--floors-at` or a checkout (HEAD) that isn't on the clone's `origin/main`: `floors-check: <commit or HEAD> is not on origin/main`, or `floors-check: origin/main is not in this clone`, exit 2. Pull `main` and run it again; if it still refuses, stop: the commit is off `main`. The gate runs the same check; running it first saves a refused run.
4. Dispatch it in the web UI: Actions, then the deploy workflow, then Run workflow on `main`, with mode `rollback`, target `nonprod` or `prod`, release the chosen commit, and restore `none`.
5. The gate (and, for prod, `prod-gate`, which doesn't wait for CI) checks what the records show: the release is recorded in that environment with its digest, it is on `main`, and it is above every floor. The deploy job checks what runs: the release's digest isn't the one running, its commit is strictly older than what runs, and ECR still holds its image under its commit's tag. ECR keeps the newest 50 images, and past them the release can't start (`aws-check: ECR holds no image of the release under its commit's tag`).
6. It deploys the Tasks and Services stacks alone, from the release's own assembly: it never migrates and never pushes an image. Then the probe and the smoke. Prod's waits for the reviewer, after the `prod-plan` diff (*What prod's rollback changes*).
7. `record-<env>` writes a `rollback` record, its `migratedCommit` the newest migration record's commit when the record is written (a rollback migrates nothing, so it never moves back).

While a dispatched rollback waits, hold merges to `main`: a push's run can replace a pending one.

A dispatched rollback has no automatic rollback of its own. If its smoke fails, its target stays live with no record, and the newest record still names the release rolled back from, so the next forward deploy's automatic rollback rolls nothing back (`aws-check: auto: this run's deploy replaced …`, *When the pipeline rolled back*). Dispatch another rollback, chosen afresh, or fix forward.

The deploy job also refuses `aws-check: a later commit (<commit>) pushed an image, so it may have migrated the database: check the floors at it (deploy-and-rollback.md)` when an image in ECR is of a later commit than the dispatch's (a push's run since): check the floors at it (*Floors*), then dispatch the rollback again from `main`'s head.

### After a rollback outside the pipeline

After break-glass's incident rollback ([Reaching production: the break-glass role](break-glass.md#an-incident-rollback-to-an-earlier-revision)), or `HearthNonprodOperator`'s in non-prod, the services run the release gone back to while the Services stack's `Release` and the release record still name the release rolled back from.

- The first run in that environment is a manual rollback to the release the services now run (*A manual rollback*). It registers that release's revisions afresh, records it, and brings the stack into line.
- Until it has run, hold merges to `main` (a push deploys non-prod) and approve no forward prod deploy.
- A forward deploy or a drill refuses by itself meanwhile: `aws-check: the services don't run Release's image (an incident rollback outside the pipeline): dispatch mode=rollback with release <commit> first (deploy-and-rollback.md)`, naming the commit whose image the services run. A rollback may then go only to that release.
- A dispatched rollback still waiting when a push arrives can be replaced by the push's run, which then refuses: dispatch the rollback again.

### A deploy job that was cancelled or timed out

GitHub stops the job, not CloudFormation or a one-off task it started, and no rollback job runs after a cancelled job. Read the run's last summary line, then the Services stack's status and `Release`: from the next run's refusal, or with `aws cloudformation describe-stacks --stack-name Hearth-<env>-Services --query "Stacks[0].[StackStatus, Outputs[?OutputKey=='Release'].OutputValue | [0]]" --output text` in a break-glass session under a `drill:` reason ([Reaching production: the break-glass role](break-glass.md)), or in non-prod, while it holds synthetic data, as `HearthNonprodOperator` in your own shell.

- Still `_IN_PROGRESS`, but for `REVIEW_IN_PROGRESS`: wait. The next run refuses until it settles (`aws-check: a deployment is in progress: wait for it to settle, then dispatch again`).
- `REVIEW_IN_PROGRESS` with no `Release`: a first create whose change set never ran, as when the job was cancelled between the two. It holds no resource and never settles, so don't wait: dispatch `deploy` again, which creates the stack afresh.
- `UPDATE_ROLLBACK_FAILED`: the pipeline can't repair it (*A stack that is stuck*).
- Settled on the new release: judge it as a failed smoke (*When the pipeline rolled back*), and roll back or fix forward.
- Settled back on the old one: nothing moved.

A job cancelled or timed out in its migrate step may leave the migrate task running: see *The commit the database was migrated by*.

The pipeline also cancels its own pending jobs. Its deploy and rollback jobs share each concurrency group (`deploy-nonprod` or `deploy-prod`), which holds one running job and one pending, so a job that starts waiting cancels the one already pending, which then ends cancelled without having started: a later push's deploy job replaces an earlier one's, a rollback job replaces a later run's pending deploy job, and a deploy job a pending rollback job. A cancellation that came as another of this workflow's jobs started waiting for the same group is that, never a finding. Then:

- A forward deploy replaced by a later run's deploy job needs nothing: that run deploys the newer commit. Otherwise, once the group is free, dispatch `deploy` to `prod` if no run of `main`'s head (`git ls-remote origin refs/heads/main`) has deployed it or is still to come.
- A rollback job replaced so was replaced by another run's deploy job, which runs next in the group. Once that job has finished, read what runs: its `read-back:` line, or, if it refused or never got so far, `Release`, read as above. If that is still this run's release, the replacing job deployed nothing, and this is handled as a rejected rollback, with `--current` set to it (*When the pipeline rolled back*). Otherwise that run moved what runs, and its own smoke and rollback judge it: roll nothing back for this run, as when another run has deployed since; only if the release that runs now is itself failing, judge it as a failed smoke and choose with `--current` set to it (*A manual rollback*).

Another workflow, a branch's included, can cancel a deploy or rollback job through the same groups, which are the repository's: a cancellation with no job of this workflow starting to wait for that group at that moment, and that nobody here made, is a finding for the quarterly review.

### A stack that is stuck

Only hearthapp's deploy role may continue, roll back or delete a stage's stack, so short of tier 2 the pipeline's next deploy of that stack is the only repair, and it repairs only some states. The deploy job's log names the stack and its status.

- `_IN_PROGRESS` but for `REVIEW_IN_PROGRESS` (a job that timed out or was cancelled while CloudFormation worked): wait for it to settle, then dispatch the same mode again. The deploy job doesn't wait for it: before then the check refuses a Services stack still moving (`aws-check: a deployment is in progress: …`), and any other stack fails the job at its change set.
- `REVIEW_IN_PROGRESS` (a create whose change set was never run, as when a first deploy's job was cancelled between the two; it holds no resource and never settles): dispatch the same mode again, which creates the stack afresh.
- `UPDATE_ROLLBACK_FAILED` (a rollback that failed, as when a containment cut the execution role off mid-update): the pipeline can't continue it. The CLI's deploy first asks to roll the stack back, a prompt that a job with no terminal can't answer (`TtyNotAttached` in the log), unless CloudFormation has already refused the change set. So don't dispatch until tier 2 ([Reaching production: the break-glass role](break-glass.md#tier-2)) has continued the rollback, skipping nothing; only if that fails does it continue with the failing resources skipped. CloudFormation then marks a skipped resource `UPDATE_COMPLETE` though it no longer matches the template, so tier 2 records each in the on-call notes and makes it match again before the next deploy, as CloudFormation asks. Then dispatch the same mode again. A dispatch before then moves nothing when the stack is Services: the check refuses it before anything moves (`aws-check: the Services stack is UPDATE_ROLLBACK_FAILED (an update whose rollback failed), which waits for tier 2 (deploy-and-rollback.md)`), in every mode, a restore's (which reads prod's) and the automatic rollback's included. Any other stack so left fails the job at its change set, after the push, and still waits for tier 2.
- `ROLLBACK_COMPLETE` after a failed create: a fresh push or a dispatch of `deploy` deletes and creates a Tasks or Services stack again. A Platform or Data stack keeps its termination protection, which the CLI never turns off, so it waits for tier 2.
- `ROLLBACK_FAILED` (a failed create whose rollback failed too, so some of its resources may remain): the deploy job's check refuses a Services stack so left (`aws-check: the Services stack is ROLLBACK_FAILED (a failed create whose rollback failed), which waits for tier 2 (deploy-and-rollback.md)`). For any other stack so left, the CLI tries to delete it and create it again, which Platform's and Data's termination protection refuses. Each that remains waits for tier 2, which deletes it ([Reaching production: the break-glass role](break-glass.md#tier-2): the account moved into `Recovery`), turning its termination protection off first for Platform or Data; then dispatch the same mode again.

What the CLI does with each is read from its own code (TECH-SPEC T24 item 20), and is unproved until the first stack left so. If a run fails where this says it repairs, it fails closed: tier 2, and this section corrected by PR.

### A failed migration

From C0.12, once the Tasks stack's `HasDatabase` is on. The migrate step prints only its status lines (`migrate: applied <migration>`, `migrate: nothing to apply` and the like) and a count of the lines it withheld. On a non-zero exit the job stops before the Services deploy, so the services still run the previous release, on the new Tasks stack's definitions, which nothing else runs.

- `migrate: nothing was applied; the batch rolled back`: the database is as it was. Fix forward by PR.
- Any other line after a failure, or a task that never stopped (`migrate: the task didn't stop in time, so it is …`): the database may have moved. Read the migration record and every image's tag (*The commit the database was migrated by*), and pause deploys (*Pausing and resuming*) until the person on call has looked.
- Never roll back across it (*Floors*).

### Floors

A floor marks a contracting migration: one that removes or renames what an older release still reads. The PR that adds such a migration adds its floor to `infra/src/release/floors.ts` (an owner's read), with why. A rollback to a release whose migrations lack a floor's migration is refused once the floors' commit has it.

- The pipeline reads the floors at the run's own commit (`main`'s head for a dispatch), so it may refuse a rollback for a floor whose migration the environment hasn't applied yet: roll forward, or wait for that release.
- A later commit than the run's can have migrated the database since the gate read the floors: a later run pushes its image, then migrates, and may fail before its record. So every deploy job but a restore's reads every image's tag in ECR before anything moves: when one is of a commit that isn't the run's or an ancestor of it, a forward deploy or a drill refuses (`aws-check: a later commit (<commit>) pushed an image, so it may have moved the stacks or migrated the database: dispatch again from main's head (deploy-and-rollback.md)`), a dispatched rollback refuses (`aws-check: a later commit (<commit>) pushed an image, so it may have migrated the database: check the floors at it (deploy-and-rollback.md)`) and the pipeline's own rolls nothing back (`aws-check: auto: a later commit (<commit>) pushed an image, …`). The forward deploy or drill is an older run that GitHub's queue started after a later one, which may have moved Platform, Data and Tasks forward: dispatch again from `main`'s head. For a rollback, in your checkout of `main`, pulled, run `node infra/scripts/deploy/floors-check.ts --target <the chosen release's commit> --floors-at <that commit>`, which refuses either commit when it isn't on the checkout's `origin/main` (`floors-check: <commit> is not on origin/main`: pull `main` and run it again, and stop if it still refuses): on `floors-check: allowed`, dispatch the rollback again from `main`'s head (*A manual rollback*), whose gate reads the floors there; on a refusal, fix forward. Only a first deploy, whose Services stack holds no release, may find no image in ECR at all; anywhere else that is refused (`aws-check: ECR holds no image, which only a first deploy may find`), and is a finding for the person on call, since ECR keeps the newest 50 images.
- The infra seams follow the same rule (TECH-SPEC T24 item 22): a PR that removes or renames an SSM parameter, a security group, a role, a log group or the cluster the Tasks and Services stacks read keeps the old one while any release among ECR's newest 50 images reads it, or says in its description that rollbacks before it are impossible. A rollback that meets a removed seam fails at its change set and leaves the current release running.

### Re-running a failed job

On the run's page, Re-run jobs, then the failed jobs or one job. A re-run runs only those jobs and the ones after them, with the gate's first answers; each job runs its own bot test again, so on a bot's re-run every job is skipped and nothing runs. It gets a new attempt number, so a new image tag and new client tokens. A person, never Claude, may re-run:

- `record-<env>` after a failed write: it writes the record from the results of the jobs it needs, as the latest attempt each of them ran in left them (after a re-run of `prod-plan` or the deploy job, that later attempt's);
- `prod-plan`, after `prod-gate` failed and `main`'s CI, re-run, has passed: it re-runs `prod-gate` and `prod` after it;
- `nonprod` in a forward deploy (a push's run, or mode `deploy`) after a transient error, while its run's commit is still `main`'s head (`git ls-remote origin refs/heads/main`); once `main` has moved on, dispatch `deploy` to `prod` instead, which deploys `main`'s head. Its fast re-check and its check of what runs run again, and refuse if a later commit's release has been recorded or runs since, or a later commit has pushed an image (`aws-check: a later commit (<commit>) pushed an image, so it may have moved the stacks or migrated the database: dispatch again from main's head (deploy-and-rollback.md)`);
- `nonprod` in a dispatched rollback or drill after a transient error, whether or not `main` has moved, since the re-run checks everything again: it refuses if non-prod's release records changed since the gate read them (`fast re-check: nonprod's release records changed since the gate read them`), if a rollback's target is now the release running or not strictly older than it, or a drill's release isn't what runs, or if a later commit has pushed an image (a rollback's line ends `check the floors at it`: *Floors*). After a refusal, dispatch the same mode again from `main`'s head, a rollback's release chosen afresh (*A manual rollback*), never a forward deploy in its place, which would deploy `main`'s head rather than the release the rollback was for. Hold merges meanwhile, as for any dispatched rollback;
- for a prod deploy or a prod rollback, `prod-plan` in place of `prod`, a deploy's only while its commit is still `main`'s head and a rollback's whether or not `main` has moved: it re-runs `prod-gate`, `prod` and the jobs after them, and the reviewer reads its fresh diff before approving again. `prod-gate` re-validates a rollback's target against prod's records read afresh (`history: refused record-changed` when its recorded digest has changed, or `floor-crossed`: choose the release afresh and dispatch it). `prod` re-run on its own, by "Re-run failed jobs", or after `prod-gate` re-run on its own, keeps `prod-plan`'s diff from the earlier attempt (and `prod-gate`'s read too, unless `prod-gate` was re-run), so its fast re-check refuses before any credential (`fast re-check: prod-plan's diff is from another attempt of this run: re-run prod-plan, which re-runs prod-gate and this job after it, or dispatch afresh`). It also refuses when prod's newest release record has changed since `prod-gate` read it (`fast re-check: prod's release records changed since prod-gate read them`), as after a rollback or another run's record: re-run `prod-plan` again, or dispatch afresh;
- a restore's `prod`, which has no `prod-plan`, after a transient failure alone. When its fast re-check refused because prod's records changed (`fast re-check: prod's release records changed since prod-gate read them`), or an `up`'s check found prod running another release than the gate read (`aws-check: what runs is not the release the gate read`), re-running `prod` or `prod-gate` refuses again, since both compare with what the gate read: dispatch the restore afresh.

A smoke (`smoke-<env>`) or a resmoke (`resmoke-<env>`) is never re-run on its own, whether it failed or passed. It judges only the read-back its deploy or rollback job wrote in the same attempt, and a re-run alone keeps that job's read-back from an earlier attempt, so it refuses (`smoke: the read-back is from another attempt of this run: re-run the job that wrote it, or dispatch afresh`) and fails. A smoke's failure starts its rollback job, which rolls back only if this run's release still runs (and in prod waits for the reviewer). To retry a smoke, re-run its deploy job (in prod, `prod-plan`, as above), which deploys again (no change if nothing moved since; after the pipeline rolled back, see below), reads back afresh, and runs the smoke after it.

After the pipeline rolled back, what "Re-run failed jobs" does depends on what started the rollback:

- A failed smoke (the deploy job green, its smoke red): it re-runs the smoke, which refuses, and the rollback job, which finds this run's release no longer runs and rolls nothing back, so the run stays red and writes no record. Fix forward or dispatch afresh.
- The deploy job's own failure once its Services deploy began (the deploy job red, as at its probe or its read-back): in non-prod it re-runs the deploy job, which deploys again the release the pipeline just rolled back from and, if its smoke then passes, records it and goes on to stage prod, as a dispatch of `deploy` of that commit would. In prod it re-runs `prod`, whose fast re-check refuses (`prod-plan`'s diff is from another attempt), so nothing moves and the run stays red; to deploy that release again in prod, re-run `prod-plan`, whose fresh diff shows it, and approve `prod` again. Use either only for a failure judged transient, and only while the run's commit is still `main`'s head; otherwise fix forward or dispatch afresh. In prod, the approval deploys the release that just failed again: never approve it as though nothing would move.

Re-run nothing older than its artifacts (14 days): dispatch afresh instead.

### Pausing and resuming

A repo admin, in the web UI (Actions, then the deploy workflow, then Disable workflow), or with `gh` as the separate operating-system user (*Before you start*):

1. Notes `main`'s head (`git ls-remote origin refs/heads/main`), then disables the workflow: `gh workflow disable deploy.yml`.
2. Rejects any run whose deploy job (`nonprod` or `prod`) waits for its approval (`waiting`), on its page, noting its commit: rejecting it starts no rollback job. A run whose `rollback-<env>` job waits is a failed release that is still live: the owner approves it (*When the pipeline rolled back*), and it finishes as in step 3; a rollback never migrates.
3. Lets a running one finish. It may be cancelled (Cancel workflow on its page, or `gh run cancel <run id>`) only while none of its deploy jobs has reached its migrate step or its probe: a one-off task already started runs on after its job is cancelled, and a migrate finishing then writes no migration record.
4. Then sees no run of it in any of six statuses: for each of `in_progress`, `queued`, `waiting`, `pending`, `requested` and `action_required`, `gh run list --workflow deploy.yml --status <status> --json databaseId --jq length` prints `0`.

To resume:

1. Enable the workflow: `gh workflow enable deploy.yml`.
2. If a rollback the pause met was rejected or failed, the release that failed is live: follow *When the pipeline rolled back* first.
3. Dispatch `deploy` to `prod` only if `main`'s head now (`git ls-remote origin refs/heads/main`) differs from the one noted when pausing, since pushes made while the workflow was disabled were never queued, or if pausing rejected or cancelled a forward deploy (a push's run, or mode `deploy` to `nonprod` or `prod`); a rejected rollback, drill or restore is dispatched again by whoever wanted it. Otherwise do nothing, however the release records read: after any rollback an environment's newest record names an older commit than `main`'s head, which is no missed push, and a dispatch would deploy the release that was rolled back. A dispatch builds and deploys both environments again under a new digest, and asks for prod's approval.

Every run of the Owner bootstrap script happens inside such a pause ([Setting up the organisation and its first Owner](first-owner-set-up.md#running-the-owner-bootstrap-script)), and so does the set-up runbook's cut-off of the GitHub roles before an owner's rename ([Setting up the AWS organisation and its accounts](aws-account-set-up.md#e-githubs-oidc-subject-and-the-rest-of-the-configuration)).

### The commit the database was migrated by

`gh api 'repos/{owner}/{repo}/deployments?environment=<env>&task=hearth-migrated&per_page=1' --jq '.[0].payload.commit // "none"'` prints the newest migration record's commit, or `none` when no migration has run there (no database yet: C0.11). It is the newest release record's `migratedCommit`, or newer after a run that failed once it had migrated, unless a pipeline rollback has recorded since.

The record can lag the database: a migrate task that finished after its job was cancelled or timed out writes none. A deploy pushes its image before it migrates, so every commit that has migrated the database pushed an image first. Go by every image's commit, never the newest image by `imagePushedAt`: push order is commit order only while every deploy job refused to push behind a later commit's image, and ECR doesn't document whether a re-tag moves an image's push time. So, in the break-glass session the Owner bootstrap script's run opens anyway, list every image's commit, from its tag (`sha-<commit>-<run id>-<attempt>`), in that account's ECR: `aws ecr describe-images --repository-name hearth-server --query 'imageDetails[].imageTags[]' --output json | jq -r '[.[] | strings | capture("^sha-(?<c>[0-9a-f]{40})-[0-9]+-[0-9]+$").c] | unique[]'`. With the record's commit (unless it printed `none`), each checked to be 40 lowercase hex digits before you paste it and pasted quoted, take, in your checkout of `main`, pulled first (`git pull`, which fetches `origin/main`), the one every other is an ancestor of: `n=; bad=; for c in "<commit>" "<commit>" …; do if ! printf '%s\n' "$c" | grep -qxE '[0-9a-f]{40}' || ! git cat-file -e "$c^{commit}"; then bad=1; elif ! git merge-base --is-ancestor "$c" origin/main; then echo "off main: $c"; elif [ -z "$n" ] || git merge-base --is-ancestor "$n" "$c"; then n=$c; elif ! git merge-base --is-ancestor "$c" "$n"; then bad=1; fi; done; [ -z "$bad" ] && [ -n "$n" ] && echo "$n" || echo stop` prints it. A line `off main: <commit>` names a commit that isn't on `main`, which only a forged record names: a migration record is data that anything with Deployments write can add, a branch's workflow included, while the pipeline pushes and deploys only `main`'s commits. The loop leaves it out; never paste it onward, and note it for the quarterly review. If it is the current release's commit or an image's, stop. If it prints `stop`, one of them isn't a commit's 40 hex digits, the checkout lacks one of them (pull `main` and run it again), or two aren't on one line, which on `main` never happens: stop and tell the person on call. No later commit has migrated the database, but this one may not have either (a run that pushed and then failed before its migrate applied anything). The Owner bootstrap script refuses any other checkout than the one the database was migrated by, by comparing its migrations with the database's both ways and naming the difference: a checkout taken before the session that turns out older is taken again at the newer commit, and one that holds a migration the database hasn't applied is taken again at the next older commit among those listed, until the script accepts it, the run starting again each time.

### The rehearsal

The rollback rehearsal (C11-D59), dispatched in the web UI: on non-prod before prod's first workload deploy (TECH-SPEC T24 item 5), on prod the same week, then quarterly. Each rollback in it goes back to a recorded release of an older commit, so before step 2 non-prod's release records name at least two different commits. The pipeline's first run records one, so merge at least one more PR first (its run's prod approval left waiting or rejected, as for the first run's); a dispatch of `deploy` rebuilds the same commit and doesn't count. `drill-smoke` also runs only straight after a passed forward deploy of `main`'s head to non-prod: non-prod's newest release record must be a `deploy` of the run's commit, since the drill deploys Platform, Data and Tasks from that release's assembly, and after a rollback those would be older than the ones that run. A `drill-smoke` refused `no-earlier-release` (non-prod's records name one commit only, however many builds of it) or `drill-not-forward` (the newest record is a rollback, or a forward deploy of an older commit) means this isn't met yet: merge, or dispatch `deploy` to `nonprod`, first. On non-prod:

1. `drill-break`: it deploys non-prod's Services with realtime unable to start, and passes when that deploy fails and CloudFormation and the circuit breaker put realtime back on the revision it ran (`drill-break: the broken deploy failed and realtime runs <family:revision> again`); then the smoke passes. Expect an A14 email. The run is green when the drill passed. Afterwards the person on call, in a break-glass session under a `drill:` reason, lists realtime's family's `ACTIVE` revisions, `aws ecs list-task-definitions --family-prefix hearth-nonprod-realtime --status ACTIVE`, and notes for C0.11 PR 5's record, by revision number alone and never an ARN, whether the drill's own revision (the one whose `LOG_LEVEL` is `drill`, read as the incident rollback's step 2 reads a revision) stays among them. If it does, the incident rollback names it to `history.ts choose-ecs` with `--drill`, so it is never chosen.
2. `drill-smoke`, straight after a passed forward deploy of `main`'s head to non-prod: the normal deploy path with non-prod's current release (no change and no migrate), the probe, then the smoke, inverted on SMK-05, fails on purpose; `rollback-nonprod` deploys the release that ran before, `resmoke-nonprod` passes and `record-nonprod` writes a `pipeline-rollback` record. The run ends red by design, and non-prod is left on the earlier release. A second `drill-smoke` needs a forward deploy (dispatch `deploy` to `nonprod`) first.
3. A forward deploy: dispatch `deploy` to `nonprod`.
4. A rollback outside the pipeline, by someone holding `HearthNonprodOperator`, following break-glass's incident rollback while GitHub can be read.
5. A dispatch of `deploy` to `nonprod`, which must be refused for drift (*After a rollback outside the pipeline*).
6. A dispatch of `rollback` to the release the services now run, which must pass.
7. A forward deploy (dispatch `deploy` to `nonprod`), then a manual rollback (*A manual rollback*) to the release `history.ts choose` gives, then a forward deploy again. The forward deploy comes first because steps 2 to 6 leave non-prod on the older commit, which may have no recorded release before it.

On prod, the same week, once a merge after prod's first deploy has reached prod with the approval, so that prod's release records name two different commits: one manual rollback to the release before it, with the approval, then one forward deploy (dispatch `deploy` to `prod`). C0.11 PR 5 records the dates and run numbers in TECH-SPEC T24 item 34.

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

1. Dispatch mode `deploy`, target `restore`, restore `up`. The gate needs a prod release record: the restore runs prod's newest release record, already in prod's ECR, and renders the restore stage's Platform and Data from that release too. After a prod rollback that record is older than prod's own Platform and Data, and a restore at an older release than the stage last ran can leave behind a named log group the newer one added, which then blocks the next `up` until tier 2 removes it.
2. Approve the run's `prod` job, as for a prod deploy. There is no `prod-plan` diff, so read the run's summary first: the direction, the commit and the digest.
3. It deploys the restore stage's Platform, Data, Tasks and Services, Valkey and five endpoints among them (about 20 minutes), then the probe, which raises A7 in prod (expected), and the read-back. `smoke-prod` checks the services' half of SMK-06, and `record-prod` writes a `hearth-restore` record, `up`.
4. The same day, dispatch restore `down`, since an active stage costs about USD 2 a day. It deploys Services, then Data, then Platform, each only if it exists and has settled, with no probe, and `record-prod` writes a `hearth-restore` record, `down`. `down` takes only the restore stage's own stacks down, so it compares no release of prod's and works while prod runs a release with no record; it still waits while prod's Services stack is moving (`aws-check: a deployment is in progress: wait for it to settle, then dispatch again`), and while it is left `ROLLBACK_FAILED` or `UPDATE_ROLLBACK_FAILED`, until tier 2 has dealt with it (*A stack that is stuck*).

### A restore that failed

An `up` that failed or timed out leaves its stacks wherever CloudFormation took them, and costs money while Valkey and the endpoints exist. Dispatch `down` the same day. It deploys Services, Data and Platform in that order, each only if it exists and has settled: it skips one that doesn't exist (`restore down: Hearth-restore-<Part> doesn't exist, so it is skipped`) or that a failed create left, in `ROLLBACK_COMPLETE` or `REVIEW_IN_PROGRESS` (`… is what a failed create left, so it is skipped`), which holds nothing billed, and refuses one still moving (`… is <status>: wait for it to settle, then dispatch again`), so wait and dispatch again. Its read-back reads a restore Services stack so left, or one that doesn't exist, as the release `down` was given, so the run ends green. One whose failed create couldn't roll back either, `ROLLBACK_FAILED`, may still hold billed resources: `down` skips it too (`restore down: Hearth-restore-<Part> is ROLLBACK_FAILED (a failed create whose rollback failed), so it is skipped: it may hold billed resources and waits for tier 2`), takes the later stacks down, then fails (`restore down: the restore stage isn't down: tier 2 deletes Hearth-restore-<Part> … (deploy-and-rollback.md)`) and writes no `down` record. Tier 2 ([Reaching production: the break-glass role](break-glass.md#tier-2)) deletes that stack the same day, turning its termination protection off first for Platform or Data; then dispatch `down` again. A restore Platform or Data stack that a failed first create left in `ROLLBACK_COMPLETE` waits for tier 2 to remove it before the next `up`, since its termination protection refuses the CLI's delete; one left in `REVIEW_IN_PROGRESS` holds no resource, and the next `up` creates it afresh. A restore stack left `UPDATE_ROLLBACK_FAILED` (an update whose rollback failed) is handed to the CLI, which can't continue it (*A stack that is stuck*), so `down` fails there, before the stacks after it, and Valkey and the endpoints may still be billed: tier 2 continues its rollback the same day, then dispatch `down` again.

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

- Reject a stale waiting approval of a deploy (never a waiting `rollback-<env>`, whose failed release is live: *When the pipeline rolled back*): a run waiting for its approval may hold `deploy-prod` (the first runs show whether it does) and so block later prod deploys until it is approved or rejected.
- Note in the on-call notes a deploy or rollback job that nobody here cancelled and no job of this workflow replaced (*A deploy job that was cancelled or timed out*), and a rollback outside the pipeline not yet reconciled.
- Each quarter, the second reviewer reconciles the deploy roles' sessions with the deployments ([The quarterly review of break-glass uses](break-glass-review.md), step 6).
- Keep to the calendar (*Upkeep*).

## Don't

- Approve from a terminal, or approve a run whose diff and plan you haven't read.
- Approve a forward deploy while a rollback outside the pipeline is unreconciled.
- Edit an environment or its reviewers in the web UI rather than by PR and `scripts/protect-environments.sh apply`. Secrets are the exception: only the web UI or `gh secret set` sets them.
- Write or delete a deployment by hand.
- Re-run a prod deploy's or rollback's `prod` or `prod-gate` on its own: `prod`'s fast re-check refuses `prod-plan`'s diff from an earlier attempt. Re-run `prod-plan`, for a deploy only while the run's commit is still `main`'s head, for a rollback whether or not `main` has moved (*Re-running a failed job*).
- Answer a failed or refused rollback or drill with a forward deploy: dispatch the same mode again, a rollback's release chosen afresh.
- Re-run a smoke or a resmoke on its own, whether it failed or passed: it refuses a read-back from an earlier attempt and fails (*Re-running a failed job*).
- Cancel a run past its migrate step or its probe.
- Roll back past a floor.
- Leave the restore stage up.
- Give any Claude Code session a token with Deployments write, Actions write or Administration, or browser or computer control over a GitHub sign-in that can approve prod, or sign `gh` in with such a token, or leave one anywhere git finds a github.com credential (a credential helper, a URL or an `insteadOf` rewrite, an `extraHeader`, an askpass program such as an editor's terminal sets, or `~/.netrc`), as the operating-system user Claude Code runs as (*Before you start*; [Setting up the AWS organisation and its accounts](aws-account-set-up.md), step E.4, reads each back).

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
