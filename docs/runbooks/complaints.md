# A question or complaint about how personal data is handled

PDPA-13, and PDPA s11 and s12: the DPO's business contact and a process for receiving and answering complaints.

## Use this when

Someone writes, calls or posts a question or a complaint about how their personal data is handled. They reach the DPO through the contact the published notice and Settings › Privacy give, or send it from the form in Settings › Privacy.

## Who does what

- The DPO reads and answers it, alone (C0.9 OD-14). Nobody else is told that it exists.

## Before you start

- A question or complaint sent from Settings › Privacy is already a case on Requests, and the person has already seen its reference and the day a reply is due. One that came another way, the DPO logs with "Log a request", with the day it was received.
- The target is 10 business days, unless the DPO has set fewer (C0.9 OD-08): weekdays in the organisation's time zone, with public holidays counted. The case shows the due day.

## Steps

1. The DPO acknowledges receipt as soon as they can, saying when the person will hear back and, for one that came outside Hearth, giving its reference. They record "Told them it was received" on the case.
2. If it reports a suspected breach of personal data, the DPO starts [A suspected breach of personal data](breach.md) at once, and notes on the case that they did.
3. The DPO looks into it with the records the app shows: the registers, the published versions of the notice, and the audit log where it can be read.
4. The DPO answers in writing within the target, by the channel the case records or one the organisation already holds for a current member, quoting the reference, and records "Replied" with its day. If they need longer, they tell the person when they will hear back, and note it.
5. In every final reply, the DPO says that the person may complain to the Personal Data Protection Commission (PDPC) if they aren't satisfied.
6. For a complaint about the DPO, there is no second reader in Hearth (C0.9 OD-14). The DPO tells the person at once that they can go to the PDPC directly, and records that as a note on the case.
7. The DPO closes the case with its outcome.

## Check it worked

- Each complaint's case has the day it was received, the day of the reply and its outcome.

## Afterwards

- If it shows a gap in the notice or the registers, the DPO fixes it and publishes ([Publishing a version of the notice](publishing-the-notice.md)).

## Code paths

- `/dpo/contact`
- `/dpo/notice`
- `/dpo/requests`
- `/settings/privacy`
- `/api/admin/requests/log`
- `log_case()`
- `add_case_step()`
- `read_audit_events()`
