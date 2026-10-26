# A request to correct someone's personal data

PDPA s22 and PDPA-07: correcting an error or omission in someone's personal data.

## Use this when

Someone asks for an error or omission in their personal data to be corrected, including something they can't see themselves.

## Who does what

- The DPO decides.
- From C0.16, an Owner or Admin corrects a roster fact or a number in the console (the roster import, and ACC-06's phone change). Until then Hearth has no screen or route that changes either, and nobody writes to a table instead: the DPO keeps the request open, replies in writing saying when it will be corrected, and has it corrected once the console lands.
- From C0.15, the person corrects their own profile.

## Before you start

- A request sent from Settings › Privacy is already a case on Requests. One that came another way, the DPO logs with "Log a request", with the day it was received, and gives the requester its reference. The target is 30 calendar days, unless the DPO has set fewer (C0.9 OD-08); the case shows the due day.
- The DPO checks the requester's identity, as for an access request ([A request for a copy of someone's personal data](access-request.md)), and records "Checked who they are" on the case before answering. A correction can change someone's number, so Hearth won't close one as answered without that step.

## Steps

1. The DPO finds the item.
2. The DPO decides whether it is wrong or missing.
3. If so, the DPO has it corrected at its source as soon as practicable: a roster fact or a number from C0.16, and until then as "Who does what" says. The registers' facts and the notice's text aren't anyone's personal data.
4. Where it applies, the DPO tells anyone it was disclosed to in the past year who needs the correction. In C0 no provider keeps a copy beyond the retention the transfer register states.
5. If the DPO doesn't correct it, the DPO tells the person, closes the case as refused, and records what was asked and why not. Hearth can't annotate the data itself until C6.1's PDPA-07 records.
6. The DPO replies in writing within the target, by the channel the case records or one the organisation already holds for a current member, quoting the reference, and records "Replied" with its day. If they need more time, they tell the person in writing on or before the due day and record "More time needed".

## Check it worked

- The item reads as corrected, or the case is closed as refused with the reason.

## Afterwards

- From C1, the DPO checks anything the item fed.
- The DPO closes the case.

## Code paths

- `apps/server/src/admin/people.ts`
- `log_case()`
- `add_case_step()`
- `/api/admin/requests/log`
- `/dpo/requests`
- `/settings/privacy`
