# A request for a copy of someone's personal data

PDPA s21 and PDPA-05: access to personal data, and how it has been used or disclosed in the past year.

## Use this when

Someone asks for a copy of their personal data, or how it has been used or disclosed in the past year: a member, someone who has left, or someone without a Hearth account.

## Who does what

- The DPO handles it, alone.
- The person on call for production reads production only as step 3 says, and never reads content.

## Before you start

- A request sent from Settings › Privacy is already a case on Requests. One that came another way, the DPO logs with "Log a request", with the day it was received, and gives the requester its reference. The 30 calendar days run from receipt, unless the DPO has set a shorter target (C0.9 OD-08); the case shows the due day.
- The DPO checks the requester's identity without relying on an old Hearth number, a PIN or the reference (in person, by video, or against HR records), and records it on the case as "Checked who they are", with how and the day it was checked, never copying an ID document or noting an ID number (C0.9 OD-16). Hearth won't close a copy as answered without that step.
- Log a request from someone who has left against their former person (shown as "Has left"), never as someone without an account: after a refusal, and while a request for a copy or a correction is open, Hearth keeps only a linked person's records.

## Steps

1. The DPO lists what C0 holds about a person: their roster facts (name, department, manager, roles); their number; their devices and sessions (labels and times); their sign-in and code audit rows; whether they set a PIN (never the PIN); their notice acknowledgements; their own requests to the DPO, listed under "Their other requests" on the case, in every state; and the registers' general description of how data is used and who receives it. A request someone else made that names the requester is disclosed only as PDPA s21(3) allows, never who made it. Sign-in state and rate-limit counters, kept at most a day under keyed hashes and ids, are not copied: for a roster number their facts are the sign-in and code audit rows above (TECH-SPEC T23 item 6).
2. The DPO gathers what the DPO's own pages show: the published notice, the contact, and the registers' general description (the processing register and Transfers). The DPO sees no one person's Settings, devices or acknowledgements in C0: the Notice tab shows counts only. A requester who still has a session may choose to show their own Settings › Privacy (the contact, their requests, the notice and their acknowledgements, with the day and how for any the DPO recorded) and their own devices (`GET /api/devices`, from their own tab; see [Before C0.16's console](README.md#before-c016s-console-what-exists)). Someone who has left, or has no account, has neither.
3. Until C6.1's console replaces this procedure, the person on call gathers the rest of step 1's records (the roster facts, the number, the devices and sessions, the sign-in and code audit rows, whether a PIN is set, the acknowledgements) only through a read-only production query for that one requester, under the logged break-glass role, and a second person reviews it. The break-glass log cites "PDPA access request" and the case's reference, never the requester's name or number. The DPO gives the person on call the requester's person id, which the case shows as "Person id (for a break-glass citation)". Never content: chat, direct messages and, later, recordings, transcripts and docs are read only through C1.11's Rule 9 service, never under this step. Never through the Rule 9 module's credential, and never by a coding agent. This is CLAUDE.md's one exception to "never one person's rows" (Security and privacy). The output goes only under `local-data/`. Once the organisation chooses its audit-log readers (C0.16), the DPO reads the sign-in and code audit rows through `read_audit_events()` instead.
4. The DPO reviews every item before it is released, and withholds other people's data (PDPA-05a).
5. The DPO replies in writing, by a channel outside Hearth: the one the case records, or one the organisation already holds for a current member. The reply quotes the reference. The DPO records "Replied" on the case with its day.
6. If the DPO needs more time, the DPO tells the requester in writing, on or before the due day, when they will have it, and records "More time needed" with the new date and the day they told them. Told any later, it is only a note, and the case stays overdue.
7. If the DPO refuses, the DPO closes the case as refused, with why. The data the request covers is then kept for at least 30 days after the refusal and, if the requester applies to the Personal Data Protection Commission (PDPC) for a review, until that review, any reconsideration and any appeal have all ended, whichever is later (PDPA s22A and regulation 8 of the Personal Data Protection Regulations 2021; PDPA-09), so nothing deletes it meanwhile. The hold runs from the closure's day. Hearth keeps it: from the closure's day every record in step 1's list, and their own requests, can't be deleted (`is_held()`, `case_hold_until()`; TECH-SPEC T23 item 11), and while a request for a copy or a correction is open its requester's records are kept the same way. The DPO records a refusal on the day it is made. The DPO records "They applied to the PDPC for a review" on the case when the requester applies. A reconsideration or an appeal is part of the same review: the hold's end is read from "The PDPC review ended", so the DPO records that step only once the review, any reconsideration and any appeal have all ended, and records a new start only for a fresh application. If they have no Hearth account, only the case itself is kept: once the legal-hold console exists (C1.11), the DPO places a legal hold on anything else the request covers that they identify. If they have left, Hearth keeps their records only when the request was logged against their former person (Before you start). A copy answered with some items withheld is not a refusal and starts no hold; if what was withheld must be kept, the DPO places a legal hold once the console exists (C1.11).

## Check it worked

- The case shows "Replied" on or before its due day, or "More time needed" recorded on or before it.
- The case's notes record what was sent and what was withheld.

## Afterwards

- The person on call deletes every working copy under `local-data/` once the reply is sent.
- The DPO closes the case: as answered, after "Checked who they are", or as refused, with why.

## Code paths

- `read_audit_events()`
- `is_held()`
- `case_hold_until()`
- `delete_case()`
- `log_case()`
- `add_case_step()`
- `case.log`
- `apps/web/src/settings/PrivacySettings.tsx`
- `devices.list_own`
- `/api/devices`
- `/api/admin/requests/log`
- `/dpo/requests`
- `/dpo/purposes`
- `/dpo/transfers`
- `/settings/privacy`
