# Twilio withdrawn, and no DPO signed in

## Use this when

- `sms_provider_not_cleared` is logged at error.
- `auth.code_requested` audit rows say `skipped_not_cleared`.
- Nobody gets a sign-in code, the DPO included.
- Twilio Verify's card on Transfers shows no open clearance: its clearance was withdrawn, or a plain Save changed its facts and ended it.

The break-glass re-clear restores Twilio Verify's clearance when no DPO can sign in to do it in the app (C0.9 OD-20, TECH-SPEC T22 item 44).

## Who does what

- The DPO decides, in person or by phone.
- An Owner confirms that it is the DPO deciding, in person or by video.
- The person on call for production runs the re-clear.
- A second person reviews the use, in C0.19's quarterly review of break-glass uses.

## Before you start

If there is no current DPO (the only one has left or lost the role), the re-clear refuses: "The person named as the DPO must be at the organisation and hold the DPO role." The Owners follow branch B until C0.16's grant makes a new DPO.

1. The person on call asks each DPO whether they are still signed in to Hearth on any device (the re-clear checks this itself, and refuses while one is; once step 6's inputs are in hand, the recovery mode's plan also prints how many DPOs are signed in and when the last of their sessions ends). If one is and can use that session, that DPO opens Transfers, enters the PIN and chooses "Clear for use" on Twilio Verify. Stop here.
2. If a DPO has a live session they can't use (their PIN is locked, or they lost the phone), the re-clear refuses until that session ends. What ends it now (see [Before C0.16's console](README.md#before-c016s-console-what-exists)):
   - on a device the DPO still holds, Sign out in the avatar menu;
   - a PIN locked for 15 minutes after 5 wrong tries unlocks by itself, and the DPO then clears Twilio Verify in Hearth (step 1);
   - from another of the DPO's own signed-in devices, the devices route (`POST /api/devices/sign-out`);
   - where an Owner other than the DPO exists, that Owner resets the DPO's PIN after checking it's them (`POST /api/admin/people/reset-pin`, which ends the DPO's sessions), or an Admin signs out the DPO's devices (`POST /api/admin/people/sign-out-devices`); neither has a screen until C0.16;
   - from the break-glass PIN reset's PR (before C0.15), the bootstrap script's PIN reset (TECH-SPEC T14 item 21), which ends the sole Owner and DPO's sessions;
   - otherwise, time: a DPO's session is issued under the PIN rule and ends at most 7 days after it was issued, and the re-clear is allowed from then; the recovery mode's plan prints when the last DPO session ends.
3. The DPO decides which branch you are in:
   - **A:** Twilio is still acceptable (a mistake, a plain Save, a short suspension);
   - **B:** it isn't (its agreement lapsed, a breach at Twilio, or its facts are no longer true).
4. For branch A, the DPO confirms that Twilio Verify's facts, as the published notice states them, are still true.
5. For branch A, the DPO gives the person on call a review date after today and at most 90 days ahead, and the reason in a sentence: what happened, which role decided, and where the record is. Nobody types the facts: the recovery mode reads them. The DPO gives their person id too, from their own records (the set-up's break-glass log entry holds it as well). If the DPO decided a stated fact changed (one the notice prints: services `services`, data types `data_types`, processing countries `processing_countries`, storage countries `storage_countries`, training `training`, provider retention `provider_retention`, onward recipients `onward_recipients`; the set-up document's spellings, such as `dataTypes`, work too), they name it; its value comes from their record on Transfers.
6. With the DPO's person id (from the DPO's records or the set-up's entry in the break-glass log; from C0.16, the console), the review date and the reason in hand, and branch A step 1 done (the deploy pipeline paused before the checkout, the run prepared and the break-glass session open), the person on call can run the recovery mode's plan (branch A, step 2) before going further: it changes nothing, repeats those inputs back, and prints how many DPOs are signed in, when the last of their sessions ends, and whether Twilio Verify is cleared now.

## Steps

### Branch A: re-clear Twilio Verify

1. The person on call pauses the deploy pipeline before taking the checkout, then prepares the run and opens a production session under the logged break-glass role, as [Running the Owner bootstrap script](first-owner-set-up.md#running-the-owner-bootstrap-script) says.
2. The person on call runs the recovery mode's plan, `OWNER_BOOTSTRAP_INPUT="$(cat)" node scripts/owner-bootstrap.ts recover --database <the database>`, types the recovery document, then presses Enter and Ctrl-D (Ctrl-D ends the input only at the start of a line). The document holds no name or number, so echo stays on: `{ "environment": "<DEPLOY_ENV's value>", "dpo": "<the DPO's person id>", "reviewOn": "<YYYY-MM-DD>", "reason": "<one sentence>", "fromEntry": [] }`. `environment` is exactly the target's `DEPLOY_ENV` (`nonprod` for a drill, `prod` in production): the script refuses any other. `fromEntry` lists only a stated fact the DPO decided changed (Before you start, step 5), and is otherwise empty.
   - The plan changes nothing. It repeats the inputs back, and prints how many DPOs are signed in, Twilio Verify's clearance now, where the facts come from, which facts would change and the send state it would leave.
   - The person on call checks its line starting `named DPO` against what the DPO gave.
   - If it can't connect (exit 2, a line `owner-bootstrap: could not connect: …`), the person on call uses [that section's table](first-owner-set-up.md#if-it-fails-before-it-connects).
3. The person on call runs the same command with `--commit`, and types the same document, then Enter and Ctrl-D. In one transaction as `hearth_owner`, acting as the organisation's Hearth principal, it sets the emergency marker and the server's 2-second lock timeout, reads the facts of the Twilio Verify clearance the latest published version names (or, with none, the clearance that ended last), and calls the bootstrap's function for `twilio` with those facts, the new review date, the DPO's id and the reason. Nobody types a fact into this repository or a chat.
4. If it answers that a DPO is signed in, the person on call stops: that DPO clears Twilio Verify in Hearth (Before you start, step 1).
5. If it answers that Twilio Verify is cleared already, the person on call stops: someone else cleared it. After an exit 4, step 7 first.
6. If it timed out waiting for a lock (exit 3, "a lock was busy: run it once more"), the person on call runs it once more, unless they stopped it themselves.
7. If it lost the connection while committing, or was stopped then (exit 4), the person on call runs the plan (the same command without `--commit`) and reads its `Twilio Verify now` line. Cleared by `break_glass` with the clearance id the `committing` line named means this run committed: go to Check it worked. Another clearance means someone else cleared it (step 5). `not cleared` means it didn't commit, so the person on call runs it again with `--commit`. What the plan answers after that line (a DPO signed in, cleared already) doesn't decide this.

Until C0.11 and C0.12 there is no production, so this branch runs only against throwaway databases. In local development, rebuild the database with `npm run db:reset`; never call the function by hand.

### Branch B: don't re-clear

1. The DPO tells the Owners that sign-in codes have stopped. There is no other SMS route until AWS End User Messaging has its own cleared entry, egress route and secret, which is a reviewed change (TECH-SPEC T7).
2. The Owners tell people, and keep sessions alive: nobody signs anyone out.
3. The owner decides the fallback.
4. If personal data was at risk, the DPO follows [A suspected breach of personal data](breach.md).

## Check it worked

- The recovery mode prints the new clearance and the send state for `twilio`. `cleared` means everyone gets codes again. `unstated` appears only if the DPO decided a stated fact changed: then codes go to the DPO alone until a new version is published ([A stated Twilio fact changed](twilio-fact-changed.md)). `no_notice` appears before production's first version (v0): codes then go to the DPO alone, as they did before the withdrawal.
- Once a version is published, a member signs in on their own phone and gets a code. Before v0, the DPO signs in and gets a code instead.
- Once the DPO signs in, Twilio Verify's card on Transfers says it was cleared again by the emergency re-clear.
- It also prints which facts changed: `review_on` alone when the review date is new, and then Transfers shows the entry as set by Hearth.

## Afterwards

- The DPO reviews Twilio Verify's entry on Transfers and records anything that changed, including any fact the re-clear put back from the published snapshot.
- The person on call records the use in the break-glass log, for the quarterly review, and resumes the deploy pipeline.
- The DPO notes it in their log.

## Don't

- Don't reset the DPO's PIN, deactivate them or sign out their devices while Twilio Verify isn't cleared, unless that DPO can't use their session to clear it (Before you start, step 2): it ends the last session that could.
- Never call the function by hand in an interactive transaction: an open transaction holds every DPO's row and stalls their access. The function ends one left open 30 seconds after the call anyway.
- Never write to a table directly.
- Never use the Rule 9 module's credential.
- Never let a coding agent run any step.

## Prevention

- Clear Twilio Verify again in the app before your own session ends. The withdraw dialog says so.
- A second DPO, from C0.16.

## Code paths

- `scripts/owner-bootstrap.ts`
- `bootstrap_transfer_clearance()`
- `clear_transfer_entry()`
- `withdraw_transfer_clearance()`
- `transfer_send_state()`
- `sms_provider_not_cleared`
- `skipped_not_cleared`
- `PIN_RULE_SESSION`
- `devices.sign_out_own`
- `person.reset_pin`
- `person.sign_out_devices`
- `/api/devices/sign-out`
- `/api/admin/people/reset-pin`
- `/api/admin/people/sign-out-devices`
- `/dpo/transfers`
