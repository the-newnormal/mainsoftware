# A security alert

## Use this when

- An email arrives from any account's `hearth-ops-alerts` topic: one of the alarms A1 to A15 (A13 from C0.12), a budget or cost anomaly alert, a GuardDuty or Access Analyzer finding, or an ECS deployment failure.
- The same alert arrives twice, once from the account's own topic (the fast path, within a minute or so) and once from management's (the assured path, within 5 to 15 minutes): treat them as one.

## Who does what

- The person on call triages each alert within the working day, and at once for A1, A2, A6, A7 and A15.
- The DPO leads whenever personal data may be affected ([A suspected breach of personal data](breach.md)).
- An Owner answers for A3, A4 and A5, which are their own administration.
- An Owner, with `HearthOrgAdmin` in management, finds an assured alarm's calls for the person on call, who holds no set in management, and contains an unexpected session (both below).
- The second reviewer sees every alert in the quarterly review ([The quarterly review of break-glass uses](break-glass-review.md)).
- A coding agent never looks at production, an alert or its account.

## Before you start

- The email itself. A fast rule's names the alarm and the account, and: for A1 and A15, the call, the source identity (an operator's sign-in name), the reason tag and any error code; for A7 and A8, the call and the caller; for A9, the finding's severity, type and id; for A10, the finding's resource type and id; for A14, the deployment and the service. An assured alarm's (`hearth-sec-a01-break-glass` to `hearth-sec-a15-hearthbase`, from management) names only the alarm; its calls are in `/hearth/security/org-trail` in management, found with the alarm's own filter patterns (*Finding an assured alarm's calls*, below). A12's is AWS Budgets' or Cost Anomaly Detection's own. Alerts carry ids and references only, never content.
- Who was on call, and what break-glass sessions were open (their open entries, [Reaching production: the break-glass role](break-glass.md)).
- The merged PRs, and, from C0.11 PR 4, GitHub's deployment history.

## Steps

Find the alert's row. If it isn't expected, contain it first (*Containing an unexpected session*, below), then follow [A suspected breach of personal data](breach.md).

| Alert | What it means | First check | An incident when |
|---|---|---|---|
| A1 | `hearth-break-glass` was assumed, or an attempt was refused, in an account | A matching open entry, by an on-call person, with a reason that fits | No open entry matches, the reason isn't a reference, or the source identity isn't someone on call |
| A2 | The root user acted in an account, or someone used `AssumeRoot` from management | The set-up runbook's root-only steps | Any time after the set-up, unless it is a planned root-key task |
| A3 | A `HearthOrgAdmin` or `HearthSetUp` session began, or `OrganizationAccountAccessRole` was assumed | The set-up, a Foundation deploy, or a tier-2 change with its recorded reason | No planned change explains it; a `HearthSetUp` session after it was deleted |
| A4 | Identity Center changed: a permission set, an assignment, the attribute configuration, the instance, a user, a group or the directory | A reviewed PR deployed, or a person added or removed by an Owner | Nobody planned it, above all a new assignment to prod |
| A5 | Organizations changed: a policy, an attachment, a policy type, an OU, an account moved, a delegation, any attempt to leave | A Foundation deploy, a tier-2 move, a set-up step | Nobody planned it |
| A6 | Tampering, allowed or denied: the audit services, long-lived credentials, a new or changed identity provider or Cognito identity pool, any IAM Roles Anywhere change, an SSM hybrid activation or a change of the role an activated machine takes, an IoT role alias made or changed, a deleted flow log, the alarms' rules, topics (a subscription's attributes and the topic's data protection policy included), log groups (their deletion protection included) or alarms, the log keys or log buckets, objects deleted or unlocked there, or the landing zone's protected roles, boundary or GitHub provider | Always investigated: a denied attempt counts | Unless a reviewed deploy explains each call; any identity provider change outside a reviewed Baseline deploy, any Roles Anywhere, SSM activation or IoT role alias call (Hearth uses none, and each would hand a role to whoever holds a certificate or a code), and any delete or lock change on a log bucket, always |
| A7 | A production change: an ECS change not made through CloudFormation, a task run with its command or environment overridden, or any CloudFormation change in the prod account | Compared with the merged PRs and, from C0.11 PR 4, the deploy history | No approved deploy or break-glass session explains it. A restore drill's probe run by the deploy role in prod raises it too, and is expected during a drill |
| A8 | A session into a prod task, by ECS exec or Session Manager | Always paired with an A1 for the same session | No matching A1 and open entry |
| A9 | A GuardDuty finding of medium severity or higher | Triaged in log-archive by its finding id: by the second reviewer with `HearthSecurityReview`, or by the person on call through log-archive's break-glass role, which reads the findings (A1 alarms) | The finding is true, or can't be explained |
| A10 | Access Analyzer found external access to a resource | Read in log-archive by its finding id, as A9's are. Expected only for two kinds of role. `hearth-gh-deploy` and `hearth-gh-diff`, trusting `token.actions.githubusercontent.com` with exactly the subject the landing-zone synth renders for their environment: compare the finding's condition with it. And each `AWSReservedSSO_<set>_…` role Identity Center makes in an account for a permission set the synth assigns there (TECH-SPEC T24 item 3's table; `HearthSetUp` in management during the set-up), trusting that account's own Identity Center SAML provider (`AWSSSO_…_DO_NOT_DELETE`) and nothing else | Any other federated principal: another provider, another subject, a Cognito identity pool, a SAML provider other than that account's own Identity Center one, or an Identity Center role for a set not assigned there; or any other outside access. There is nobody to remove first: go to the breach runbook |
| A11 | Five or more failed console or Identity Center sign-ins in 15 minutes | Who was signing in, and from where | Nobody on the team explains it |
| A12 | A budget's 80 % or 100 % actual, or 100 % forecast, or a cost anomaly | Read with `HearthBilling` in Cost Explorer | Spend nobody planned, or a service nobody uses |
| A13 | (From C0.12) a read of the master secret or a bootstrap input secret, or a use of `HearthDpoBootstrapSecret` | A matching break-glass session under its reason, or the DPO's own use | No reason explains it |
| A14 | An ECS deployment failed, and the circuit breaker rolled it back | Handled by the deploy and rollback runbook, from C0.11 PR 4 | It repeats with no change merged |
| A15 | A hearthbase role was assumed, in any account: landing-zone administration under `lz:`, a Foundation deploy, the set-up, or tier 2 | A merged PR whose Baseline deploy it is, under its `lz:pr-` reason; a reviewed Foundation deploy under `HearthOrgAdmin`, with its A3; the set-up's first deploys; or a recorded tier-2 change | Anything else |

### Finding an assured alarm's calls

The person on call holds no set in management, so an Owner does this, with `HearthOrgAdmin` there (A3 alarms on that session: note it with the alert).

1. Read the alarm's filter patterns, giving its number: `aws logs describe-metric-filters --log-group-name /hearth/security/org-trail --filter-name-prefix hearth-sec-a06 --query 'metricFilters[].[filterName,filterPattern]' --output text`. A2 has two filters, A4 three and A6 ten, lettered `-a` onwards; every other alarm has one.
2. Search the copy with each pattern, as it is, over the alarm's five minutes (A11's fifteen) and a little either side: `aws logs filter-log-events --log-group-name /hearth/security/org-trail --start-time <ms> --end-time <ms> --filter-pattern '<the pattern>' --query 'events[].message'`, or the pattern in the console's search of the log group, which takes the same syntax. Each event names its account (`recipientAccountId`), its call (`eventSource`, `eventName`), its caller (`userIdentity`) and any `errorCode`, and for A6 the filter that found it names the clause.
3. For A1, A2, A3, A15 and an A5 that moved an account, the review's saved queries list the same calls ([The quarterly review of break-glass uses](break-glass-review.md)), which the second reviewer, with `HearthSecurityReview`, can also run.

### Containing an unexpected session

Removing someone from a group stops only new sessions. Credentials AWS has already issued keep working until they expire: an hour for `hearth-break-glass` and for a hearthbase role taken from it, an hour for `HearthOrgAdmin`, `HearthBreakGlassEntry` and `HearthBilling`, four for `HearthSecurityReview` and eight for `HearthNonprodOperator`. IAM's own *Revoke active sessions* writes a policy onto the role, which the guardrails refuse on these roles in a member account, and nobody can use `OrganizationAccountAccessRole` there. So an Owner, with `HearthOrgAdmin` in management, in this order:

1. Stops new sessions: removes the person from the Identity Center group that gives them the set (the sets are assigned to groups), and, if their sign-in may be someone else's, disables the user and deletes their access-portal sessions (A4 alarms).
2. Ends the live sessions in the member account at once, with an SCP named `hearth-containment` attached to that account alone (A5 alarms), never to the root or an OU. It denies every action on every resource where `aws:TokenIssueTime` is before the time of step 1, in UTC (`DateLessThan`, for example `2026-11-01T02:00:00Z`), and `aws:PrincipalArn` is like `*:role/hearth-break-glass`, `*:role/cdk-hearthbase-*` or `*:role/aws-reserved/sso.amazonaws.com/*` (`StringLike`). It binds the person on call's own sessions in that account too, who sign in again. Never widen it to every role, which would stop the service's own tasks.
3. Looks for a CloudFormation operation still running in that account (each stack's events), which CloudFormation finishes under its own role whatever the SCP, and for a task or bastion the session started.
4. Detaches and deletes `hearth-containment` once every session it covers has expired: eight hours after step 1 in non-prod, four in log-archive and one in prod. Both times go in the on-call notes for the quarterly review.

`hearth-containment` is the one SCP a person makes in the console, and only for this; every lasting change is a reviewed PR.

No SCP binds management. For an unexpected session there (an A3, or an A4 or A5 nobody planned), the Owner removes the person from the group as in step 1, then adds to that permission set's inline policy in Identity Center a statement denying every action on every resource where `aws:TokenIssueTime` is before that time, and provisions the set (A4 alarms). If that set is `HearthOrgAdmin`, it ends the Owner's own session too, who signs in again. Once the set's sessions have expired, the Owner removes the statement the same way.

For A2:

- An `AssumeRoot` session lasts at most 15 minutes, and its caller held `HearthOrgAdmin` in management: contain that caller as above, and add to the member account's `hearth-containment` (made as in step 2 if it has none) a statement denying every action where `aws:PrincipalArn` is like `*:root`, since no root user acts in a member account but for a planned task.
- The management root user is bound by no policy at all. Whoever holds its keys checks that both security keys are in their places, and if one isn't, or nobody explains the use, resets the root password through its role mailbox and registers new keys in place of the old. The DPO and the second reviewer are told.

## Check it worked

- Each alert is explained in the on-call notes, kept off GitHub.
- For an incident, the breach runbook's clocks were met.

## Afterwards

- Note each alert for the quarterly review.
- A filter, rule or alarm that needs changing is changed by a reviewed PR, never in the console.

## Don't

- Unsubscribe, mute or edit a topic, rule or alarm. The guardrails refuse a signed unsubscribe or a mute only in member accounts, where A6 alarms on the attempt. Management is bound by no guardrail: a `HearthOrgAdmin` or root session there that mutes A6 first, turning off the alarms' actions or removing the topic or its subscription, is reported by nobody until the quarterly review reads the alarms and the subscription back and the trail's files show the calls (TECH-SPEC T24 item 5). The unsubscribe link at the foot of every alert email is unsigned, so no guardrail sees it: it fails only because the set-up confirmed each subscription with authentication (its step N), and a subscription confirmed from the email's link could be ended by it with no credentials. Never follow that link, and treat an email from AWS saying a subscription was cancelled as an A6: an alert path is gone.
- Forward an alert, to anyone or anywhere: it names an account, and its footer carries the subscription's unsubscribe link.
- Assume silence means all is well: when mail you expect doesn't come (a drill's A1, a budget's notice), treat it as a lost subscription and check it as the set-up's step N does.
- Ask a coding agent to look at production or at an alert.
- Add an SMS subscription.
- Make or change an SCP or a permission set in the console, but for *Containing an unexpected session*.

## Code paths

- `infra/src/foundation/sentinel.ts`
- `infra/src/foundation/org-trail.ts`
- `infra/src/baseline/fast-alarms.ts`
- `infra/src/baseline/ops-alerts.ts`
- `infra/src/foundation/security-services.ts`
- `infra/src/foundation/budgets.ts`
- `infra/src/foundation/identity-center.ts`
