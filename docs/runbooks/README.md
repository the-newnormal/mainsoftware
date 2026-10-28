# Runbooks and procedures

## What these are

The procedures the Data Protection Officer (DPO) and the people running Hearth follow when something needs doing by hand: PDPA-04's written manual procedure, the PDPA's accountability row, C0.9's Done and the C0 exit ("the breach runbook and the access and correction procedures are written"). They were written in C0.9 PR 3a (TECH-SPEC T22 item 46), C0.9 PR 3b moved the request procedures to the queue (item 60), the first-Owner bootstrap PR added the set-up's runbook (items 63 to 71), and C0.10 added how records are kept and deleted (TECH-SPEC T23). C1.11 runs them as timed dry runs and updates them for the Rule 9 service, and C6.1's consoles replace the request procedures.

Every runbook but this one has the same sections, in this order: *Use this when*, *Who does what*, *Before you start*, *Steps*, *Check it worked*, *Afterwards* and *Code paths*. *Don't* may sit between them where a mistake would make things worse, and other sections, such as *Prevention*, may too. *Code paths* lists the code each one relies on, so a change to that code shows here (`scripts/guards/runbooks.test.ts`).

## The rules

- This repository is public, so the runbooks name roles only: the DPO, an Owner, an Admin, the person on call for production (who holds C0.11's logged break-glass role) and the second reviewer. Never a person's name, a phone number, an email address, a postal address, an account or a Console user.
- Nothing here holds anyone's data. Facts are read at run time, from Secrets Manager or from the DPO's own records.
- Any output that holds people's data goes only under `local-data/` at the repository root, which git ignores, and is never committed.
- Production steps need C0.11's logged break-glass role, and each use is reviewed by a second person every quarter (C0.19); the one exception is the DPO's own writing and checking of the bootstrap secret, through C0.12's access to that one secret alone ([Setting up the organisation and its first Owner](first-owner-set-up.md)). No production step is ever a coding agent's: coding agents never connect to production.
- Nothing calls Twilio from CI. Tests use the fake provider, with fictional numbers only.

## Before C0.16's console: what exists

Hearth has no screen yet for signing out someone else's devices, resetting a PIN, deactivating an account, changing a number or correcting a roster fact. C0.16's console brings them. Until then:

- The current device's session ends with Sign out in the avatar menu.
- These api routes exist with no screen:
  - your own devices: `GET /api/devices` lists them, and `POST /api/devices/sign-out` signs out one device, or all your other devices;
  - an Owner's or Admin's: `POST /api/admin/people/sign-out-devices`, `POST /api/admin/people/reset-pin` and `POST /api/admin/people/deactivate`, and `GET /api/admin/people/:person/devices`.
- Each admin route needs a re-authentication within the last 5 minutes (for an Owner or an Admin, the PIN, through `POST /api/auth/reauth/pin`) and an actor who has acknowledged the latest version of the notice (TECH-SPEC T22 item 36). The Owner or Admin sends it from their own signed-in Hearth tab, with the person on call guiding them if needed. A coding agent never sends one.
- A PIN reset or a deactivation refuses an action on yourself, and only an Owner resets a DPO's PIN. So while one founder is the sole Owner and the DPO (D35), nobody can reset their PIN in the app. From the break-glass PIN reset's PR, before C0.15, the bootstrap script's PIN reset can (TECH-SPEC T14 item 21).
- Nothing changes a number or a roster fact until C0.16 (ACC-06's phone change, the roster import), and nobody writes to a table instead, except the founder's own number before their first sign-in, which the bootstrap script's correction replaces ([Setting up the organisation and its first Owner](first-owner-set-up.md)).

## The index

| Runbook | Use it when | Who leads |
|---|---|---|
| [Setting up the organisation and its first Owner](first-owner-set-up.md) | A new environment's database holds no organisation yet | The DPO decides; the person on call runs it |
| [Publishing a version of the notice](publishing-the-notice.md) | Production's first version, and every later one | The DPO |
| [A stated Twilio fact changed, and codes go to the DPO alone](twilio-fact-changed.md) | Sign-in codes reach only the DPO after a change to Twilio Verify's entry | The DPO |
| [Twilio withdrawn, and no DPO signed in](twilio-withdrawn.md) | Nobody gets a sign-in code, the DPO included | The DPO decides; the person on call runs it |
| [A suspected breach of personal data](breach.md) | Anyone suspects personal data was lost, disclosed, changed or reached without authority | The DPO |
| [A request for a copy of someone's personal data](access-request.md) | Someone asks for their personal data, or how it was used | The DPO |
| [A request to correct someone's personal data](correction-request.md) | Someone asks for an error or omission to be corrected | The DPO |
| [A withdrawal of consent, or an objection, carried out by hand](withdrawal-by-hand.md) | Someone withdraws deemed consent or objects; and before recording deemed consent by conduct for any purpose | The DPO |
| [A question or complaint about how personal data is handled](complaints.md) | Someone asks or complains about how their personal data is handled | The DPO |

## Reply targets

The DPO sets the reply targets on Contact (`/dpo/contact`), and the published notice prints them under "Your rights" (C0.9 OD-08):

- questions, complaints, withdrawals and objections: 10 business days, unless the DPO sets fewer (from 5 to 10);
- a copy of someone's data, and a correction: 30 calendar days, unless the DPO sets fewer (from 14 to 30).

How a due day is counted:

- The day a request is received never counts.
- Business days are weekdays in the organisation's time zone. Public holidays count as business days, so a due day errs early, never late (C0.9 OD-09).
- A copy or a correction counts calendar days, weekends and public holidays included.

The queue shows each request's due day, and it never moves later than the targets stated when the request arrived: a shorter target applies to open requests at once, and a longer one only to requests received after the notice that states it is published. A request that arrived before any notice stated targets (one logged as received before v0) follows the targets on Contact as soon as they are recorded, sooner or later, never past 10 business days or 30 days.

## Records: the queue

Every request is a case on Requests (`/dpo/requests`, the first page under Data protection): sent from the form in Settings › Privacy, or logged with "Log a request" when it came another way (C0.9 PD-109). A case holds what the private request log held:

- the day it was received, and how it came;
- the kind: a question, a complaint, a copy of their data, a correction, a withdrawal or an objection;
- the requester;
- how their identity was checked, as a step on the case ("Checked who they are", with how and the day it was checked), never a copy of an ID document or an ID number (C0.9 OD-16);
- the due date;
- each step, with its date;
- the outcome.

Each case has a reference: eight letters and digits, shown as two groups of four. It names nobody and reveals no count.

- Quote it in every reply outside Hearth and in any break-glass citation, never the requester's name.
- A reference doesn't prove who is writing, since anyone who sees an email can quote it. Reply only to the channel the case records (required for someone who has left and for someone without an account, and optional for a current member), or else one the organisation already holds for a current member, after checking identity.
- A case note holds your own working notes, never messages, files or anything else read in Hearth.

### Moving the private log into the queue

Before C0.9 PR 3b the DPO kept one private request log, outside Hearth and outside this repository (C0.9 PD-85). The queue opens only once v0 is published and you have acknowledged it. Then:

1. The DPO logs each open entry with "Log a request", with the day it was originally received (and, for someone who has left, the channel they wrote from).
2. On its case, the DPO records its earlier steps with their days, how identity was checked included.
3. The DPO writes "moved:" and the case's reference beside the entry in the private log.
4. Once every open entry has moved, the DPO closes the private log and keeps it under their retention.

## The daily routine until C0.14

The count on the avatar button, and on "Data protection" in its menu, shows the requests needing attention when Hearth is opened: new ones sent in Hearth, and any due within 2 business days or overdue (C0.9 OD-22). Each working day the DPO also checks the mailbox and any other channel the contact names, and logs what came there. Hearth still sends no alert.

## If the DPO leaves

Only the DPO reads requests (C0.9 OD-14). If the sole DPO leaves, nobody reads open requests until C0.16's console grants a new DPO, who then reads every case, complaints about their predecessor included, while the due days keep running.

## Keeping and deleting, until C0.15

Until C0.15, nothing deletes anyone's data. The only deletions are the C0.6 clean-up's of the outbox, the job queue and its runs, which hold ids only (TECH-SPEC T16 item 6); the DPO confirmed that exemption from holds (TECH-SPEC T23 item 15).

- A refused request for a copy keeps the requester's records for at least 30 days after the refusal, plus a 14-day margin for a review the PDPC tells the organisation of late, and through any PDPC review; an open request for a copy or a correction keeps them until it is closed (TECH-SPEC T23 item 11). Hearth works this out from the case, so the DPO records closures and review steps on the day they happen.
- A request from someone who has left keeps their records only when it is logged against their former person ([A request for a copy of someone's personal data](access-request.md)).
- Legal holds arrive with C1.11's console. Until then the DPO places none by hand, and nobody writes a hold or deletes anything in production by hand.
- The retention defaults the DPO confirms are TECH-SPEC T23 item 2's.

C0.15 (its first S3 deletions) and C1.2 (the first deleted messages) each update this section when their first deletes land.

## Changing a runbook

By pull request, like any other change to this repository. The DPO confirms every change to a procedure before it merges.
