# A security alert

## Use this when

- An email arrives from any account's `hearth-ops-alerts` topic: one of the alarms A1 to A15 (A13 from C0.12), a budget or cost anomaly alert, a GuardDuty or Access Analyzer finding, or an ECS deployment failure.
- The same alert arrives twice, once from the account's own topic (the fast path, within a minute or so) and once from management's (the assured path, within 5 to 15 minutes): treat them as one.

## Who does what

- The person on call triages each alert within the working day, and at once for A1, A2, A6, A7 and A15.
- The DPO leads whenever personal data may be affected ([A suspected breach of personal data](breach.md)).
- An Owner answers for A3, A4 and A5, which are their own administration.
- The second reviewer sees every alert in the quarterly review ([The quarterly review of break-glass uses](break-glass-review.md)).
- A coding agent never looks at production, an alert or its account.

## Before you start

- The email itself: the alarm, the account, the call, the source identity (an operator's sign-in name), the reason tag and any error code. Alerts carry ids and references only, never content.
- Who was on call, and what break-glass sessions were open (their open entries, [Reaching production: the break-glass role](break-glass.md)).
- The merged PRs, and, from C0.11 PR 4, GitHub's deployment history.

## Steps

Find the alert's row. If it isn't expected, contain it first: remove the person's assignment in Identity Center (with `HearthOrgAdmin`), then follow [A suspected breach of personal data](breach.md).

| Alert | What it means | First check | An incident when |
|---|---|---|---|
| A1 | `hearth-break-glass` was assumed, or an attempt was refused, in an account | A matching open entry, by an on-call person, with a reason that fits | No open entry matches, the reason isn't a reference, or the source identity isn't someone on call |
| A2 | The root user acted in an account, or someone used `AssumeRoot` from management | The set-up runbook's root-only steps | Any time after the set-up, unless it is a planned root-key task |
| A3 | A `HearthOrgAdmin` or `HearthSetUp` session began, or `OrganizationAccountAccessRole` was assumed | The set-up, a Foundation deploy, or a tier-2 change with its recorded reason | No planned change explains it; a `HearthSetUp` session after it was deleted |
| A4 | Identity Center changed: a permission set, an assignment, the attribute configuration, a user, a group or the directory | A reviewed PR deployed, or a person added or removed by an Owner | Nobody planned it, above all a new assignment to prod |
| A5 | Organizations changed: a policy, an attachment, a policy type, an OU, an account moved, a delegation, any attempt to leave | A Foundation deploy, a tier-2 move, a set-up step | Nobody planned it |
| A6 | Tampering, allowed or denied: the audit services, long-lived credentials, a new or changed identity provider or Cognito identity pool, a deleted flow log, the alarms' rules, topics, log groups or alarms, the log keys or log buckets, objects deleted or unlocked there, or the landing zone's protected roles, boundary or GitHub provider | Always investigated: a denied attempt counts | Unless a reviewed deploy explains each call; any identity provider change outside a reviewed Baseline deploy, and any delete or lock change on a log bucket, always |
| A7 | A production change: an ECS change not made through CloudFormation, a task run with its command or environment overridden, or any CloudFormation change in the prod account | Compared with the merged PRs and, from C0.11 PR 4, the deploy history | No approved deploy or break-glass session explains it. A restore drill's probe run by the deploy role in prod raises it too, and is expected during a drill |
| A8 | A session into a prod task, by ECS exec or Session Manager | Always paired with an A1 for the same session | No matching A1 and open entry |
| A9 | A GuardDuty finding of medium severity or higher | Triaged in log-archive with `HearthSecurityReview`, by its finding id | The finding is true, or can't be explained |
| A10 | Access Analyzer found external access to a resource | Expected only for `hearth-gh-deploy` and `hearth-gh-diff`, trusting `token.actions.githubusercontent.com` with exactly the subject the landing-zone synth renders for their environment: compare the finding's condition with it | Any other federated principal: another provider, another subject, a Cognito identity pool, a SAML provider other than Identity Center's; or any other outside access |
| A11 | Five or more failed console or Identity Center sign-ins in 15 minutes | Who was signing in, and from where | Nobody on the team explains it |
| A12 | A budget's 80 % or 100 % actual, or 100 % forecast, or a cost anomaly | Read with `HearthBilling` in Cost Explorer | Spend nobody planned, or a service nobody uses |
| A13 | (From C0.12) a read of the master secret or a bootstrap input secret, or a use of `HearthDpoBootstrapSecret` | A matching break-glass session under its reason, or the DPO's own use | No reason explains it |
| A14 | An ECS deployment failed, and the circuit breaker rolled it back | Handled by the deploy and rollback runbook, from C0.11 PR 4 | It repeats with no change merged |
| A15 | A hearthbase role was assumed: landing-zone administration under `lz:`, or tier 2 | A merged PR whose Baseline deploy it is, under its `lz:pr-` reason, or a recorded tier-2 change | Anything else |

## Check it worked

- Each alert is explained in the on-call notes, kept off GitHub.
- For an incident, the breach runbook's clocks were met.

## Afterwards

- Note each alert for the quarterly review.
- A filter, rule or alarm that needs changing is changed by a reviewed PR, never in the console.

## Don't

- Unsubscribe, mute or edit a topic, rule or alarm: the guardrails refuse it, and A6 alarms on the attempt.
- Forward an alert, which names an account, anywhere public.
- Ask a coding agent to look at production or at an alert.
- Add an SMS subscription.

## Code paths

- `infra/src/foundation/sentinel.ts`
- `infra/src/foundation/org-trail.ts`
- `infra/src/baseline/fast-alarms.ts`
- `infra/src/baseline/ops-alerts.ts`
- `infra/src/foundation/security-services.ts`
- `infra/src/foundation/budgets.ts`
- `infra/src/foundation/identity-center.ts`
