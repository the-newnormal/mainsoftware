# Setting up the organisation and its first Owner

## Use this when

- A new environment's database (non-prod or production) has been migrated, holds no organisation yet, and the founder is to become its first Owner and its first DPO (D35).
- Never against a database that already holds an organisation: the script refuses, and writes nothing.

The Owner bootstrap script's set-up mode creates the organisation, Hearth's own principal and the founder as Owner and DPO with their number, and clears Twilio Verify and AWS in the transfer register, in one transaction (TECH-SPEC T22 items 63 to 66). It writes no notice and no contact: the DPO publishes the first version in Hearth afterwards ([Publishing a version of the notice](publishing-the-notice.md)).

## Who does what

- The DPO (the founder) decides the providers' facts and the reason, writes their own name and number into the input, is there in person or by video while the script runs, and signs in straight after.
- The DPO writes, checks and corrects the bootstrap secret in the AWS console, through C0.12's access to that one secret and nothing else, so nobody else sees the founder's whole number. The person on call only loads it into a run, as [Running the Owner bootstrap script](#running-the-owner-bootstrap-script) says, and never opens it in the console.
- The person on call for production runs the script under C0.11's logged break-glass role.
- A second person reviews the use, in C0.19's quarterly review of break-glass uses.

## Before you start

1. The environment exists, with its break-glass role, the bootstrap's own database login and the database's environment marker (C0.11, C0.12), and the deploy's migrate step has run against this database.
2. Twilio Verify's and AWS's facts are complete and confirmed in writing: Twilio's log retention and the countries it stores in above all (TECH-SPEC T20 item 11), and AWS's services naming hosting and CloudWatch with RUM (TECH-SPEC T22 item 3). Each review date is after today.
3. The founder's number's country is allowed in Twilio's Geo Permissions (TECH-SPEC T20 item 11).
4. The DPO writes the set-up document into this environment's bootstrap secret in Secrets Manager, in the AWS console with their own access to that secret (C0.12), never on a command line (the shell's history and the process list would keep the founder's name and number). Its `environment` names this environment, and its reason is one sentence that names roles, never people: what this is, which role decided, and where the records are. Its shape (TECH-SPEC T22 item 64), with every fact as Transfers names it:

   ```
   {
     "environment": "<nonprod or prod>",
     "organisation": "<the organisation's name>",
     "founder": { "fullName": "<the founder's full name>", "number": "<their number, with + and the country code>" },
     "reason": "<one sentence>",
     "twilio": { "services": "…", "dataTypes": "…", "processingCountries": ["…"], "storageCountries": ["…"],
                 "countriesConfirmed": "…", "safeguard": "…", "safeguardReference": "…",
                 "certificateVerifiedOn": null, "dpaTermsConfirmed": true, "training": "…",
                 "zeroRetention": "…", "providerRetention": "…", "retentionConfirmed": "…",
                 "onwardRecipients": "…", "reviewOn": "<a day after today, YYYY-MM-DD>" },
     "aws": { "…the same fifteen facts…" }
   }
   ```

5. The person on call prepares the run, as [Running the Owner bootstrap script](#running-the-owner-bootstrap-script) says.
6. The person on call checks that Database Activity Streams are off on this database (C0.12): they would record the founder's name and number. They also check that `auto_explain` is not loaded, or `auto_explain.log_min_duration` is -1, on it: it would print the founder's name and number in a logged plan.

## Running the Owner bootstrap script

Every mode is prepared the same way. The recovery runbook ([Twilio withdrawn, and no DPO signed in](twilio-withdrawn.md)) sends you here too.

- First, before the checkout: the deploy pipeline paused, so no deploy migrates the database past the commit you check out. It stays paused until the last command has finished, and is resumed then, whether or not it committed: the recovery mode takes no migration lock, and a migration applied in between makes the next command refuse.
- Then a fresh checkout of the commit the database was migrated by (the script refuses any other), installed with `npm ci --ignore-scripts` before the break-glass session opens.
- Node 24.12 or later (`node --version`).
- A terminal outside any Claude Code session, and outside any folder another tool syncs.
- `DEPLOY_ENV` set to the environment: `nonprod` or `prod`.
- `PGHOST`: the RDS endpoint, or, through a port forward, `127.0.0.1` (an IP address: never `localhost`, which the script reads as a name) with `OWNER_BOOTSTRAP_TLS_NAME` set to the endpoint's name, so the certificate's name is still checked.
- `PGPORT`, and `PGUSER` set to the bootstrap's own login, never `hearth_owner`.
- `PGPASSWORD`: a fresh IAM token, taken just before the plan, and again before the commit if 15 minutes have passed.
- No `PGDATABASE`: the command names the database with `--database`, and the script ignores `PGDATABASE`.
- `NODE_EXTRA_CA_CERTS` pointing at RDS's CA bundle.
- The input set for each command on its own, never kept in the shell.
- For `set-up` and `correct-number`, which load the input from the secret, the AWS CLI keeps no history for the profile in use: `aws configure get cli_history` prints nothing or `disabled`. If it prints `enabled`, run `aws configure set cli_history disabled` first: the CLI's history would keep the secret's value, the founder's name and number, in `~/.aws/cli/history`. Never add the debug option (`aws --debug`): it prints the secret's value.

Load the input from the secret, for `set-up` and `correct-number`. Before the plan, the person on call writes down the current version id of the secret, an id that says nothing of what it holds:

```
aws secretsmanager list-secret-version-ids --secret-id <the secret> --query "Versions[?contains(VersionStages, 'AWSCURRENT')].VersionId" --output text
```

The plan and the commit both load that version, so the commit runs on exactly the document the plan checked: Secrets Manager never changes a version once it is written. If the DPO changes the secret after the plan, read the new version id and run the plan again before the commit.

```
OWNER_BOOTSTRAP_INPUT="$(aws secretsmanager get-secret-value --secret-id <the secret> --version-id <the version id> --query SecretString --output text)" node scripts/owner-bootstrap.ts <mode> --database <the database>
```

Only if the secret can't be read, the DPO pastes the document at the person on call's terminal, with echo off, so nobody else holds the founder's whole number: the person on call runs the command below, and the DPO pastes the document over several lines, then presses Enter and Ctrl-D (Ctrl-D ends the input only at the start of a line). Lay the document out with one fact to a line, each line under 1,000 characters: a terminal cuts a longer line without showing it (at 1,024 bytes on macOS), and the script then answers that the input is not valid JSON. If the DPO is there only by video, the run waits until the secret can be read. After a Ctrl-C, type `stty echo` to see your typing again.

```
OWNER_BOOTSTRAP_INPUT="$(stty -echo; cat; stty echo)" node scripts/owner-bootstrap.ts <mode> --database <the database>
```

The recovery document holds no name or number, so it is typed the same way with echo on, ended with Enter and Ctrl-D:

```
OWNER_BOOTSTRAP_INPUT="$(cat)" node scripts/owner-bootstrap.ts recover --database <the database>
```

A pasted or typed document is pasted or typed again for the commit. The commit prints the same lines as its plan before its `committing` line, so the person on call compares them with the plan's. If one differs, the commit ran on a different document: they tell the DPO, who corrects it (a number with `correct-number` below, a review date with their own Save in Hearth).

Never `read` it into a variable, and never `export` it: a one-line `read` takes only the first line and runs the rest of a pasted document as shell commands, which land in the history.

Every line the script prints starts `owner-bootstrap:`; this runbook quotes what follows it.

Each run without `--commit` is a plan: it runs every check and every write, then keeps nothing. Only the same command with `--commit` added keeps anything.

### If it fails before it connects

It exits 2, with a line `owner-bootstrap: could not connect: …`. It never names the host, the login or the database.

| The line says | What to change |
|---|---|
| the database host's name wasn't found | `PGHOST`, and the network path C0.11 gives |
| nothing answered on that host and port | the port forward, or the security group |
| timed out connecting | the network path |
| the server's certificate isn't trusted | `NODE_EXTRA_CA_CERTS`, pointing at RDS's CA bundle |
| the certificate doesn't name the host you connected to | the endpoint's name in `PGHOST`; or, for a port forward, `PGHOST` set to `127.0.0.1` with `OWNER_BOOTSTRAP_TLS_NAME` |
| the server doesn't offer TLS | nothing: this is the wrong server. Stop |
| signing in to Postgres failed | `PGUSER` set to the bootstrap's login, and a fresh IAM token in `PGPASSWORD` |
| that database doesn't exist | `--database` |
| this login may not act as hearth_owner | nothing: this is the wrong login. Stop and tell the owner |
| this is a read-only server | `PGHOST` set to the writer endpoint |

A refusal that names the input or the environment comes before it connects. One that names the target (the checkout, the server, the database, its marker, its migrations, its settings or the login) is followed by the line `nothing was written`. Each exits 2, writes nothing, and says what to fix in words: the DPO fixes the secret in the AWS console, or the person on call fixes the environment, and the plan runs again.

## Steps

1. The person on call opens a production session under the logged break-glass role, with a path to the database.
2. The person on call runs the plan, `set-up --database <the database>`, loading the input from the secret as [Running the Owner bootstrap script](#running-the-owner-bootstrap-script) says, in the terminal itself, not piped to a file, so the founder's name shows.
3. The founder checks the plan's lines with the person on call:
   - the organisation's name, letter by letter;
   - their own full name, letter by letter;
   - the number's country code and last two digits, against their phone (the script never prints the whole number);
   - both review dates.
4. The person on call checks the plan's first line, `set-up (plan) on database …`: the database, `DEPLOY_ENV`, the input's environment (`input for …`), the marker and the newest migration.
5. If the plan refused, its line names the field or the setting, never its value. The DPO fixes the secret in the AWS console, and the person on call runs the plan again.
6. The person on call runs the same command with `--commit`.
7. The person on call records the ids the `committed: …` line prints in the break-glass log entry (after an exit 4, see [If a run stops before it says "committed"](#if-a-run-stops-before-it-says-committed)). The DPO keeps their own person id in their records: the recovery mode needs it, and the recovery runbook asks the DPO for it, or sends the person on call to that entry.
8. Within five minutes, the founder opens Hearth on their own phone, asks for a code once, enters it and sets their PIN (TECH-SPEC T20 item 12). Before the first version of the notice, only the DPO gets a code.

### If a run stops before it says "committed"

- Exit 2 with `owner-bootstrap: could not connect: …`: [the table above](#if-it-fails-before-it-connects).
- Exit 3: run it once more. If you stopped it yourself, nothing was committed.
- Exit 4 (the connection was lost, or the run stopped, while committing): run the same command again. If it answers that the database already has an organisation, compare that organisation with the one the `committing organisation …` line named: the same one means it committed. Otherwise it sets up now.
- After an exit 4 whose commit landed, the `committed: …` line never printed, so Hearth's id, the founder's person id and the clearance ids weren't shown. The person on call records the organisation id in the break-glass log entry, notes that the other ids weren't printed, and goes on to step 8. Once the founder has signed in, the DPO opens `/api/session` in their own signed-in browser, reads `personId`, keeps it in their records and gives it to the person on call to add to the entry. Transfers shows both clearances as cleared by the set-up.

### If the founder's code doesn't arrive within two minutes

1. The founder doesn't ask again yet: three requests in 10 minutes is the limit (TECH-SPEC T14 item 5).
2. The DPO checks the number in the secret, which is still there, in the AWS console with their own access: never the person on call, so nobody else sees the whole number.
3. If the number is wrong and the founder has never signed in, the DPO writes the correction document into the same secret as a new version, in the AWS console as in Before you start, step 4: its `environment`, the right `number` and a `reason`. The set-up document stays in the previous version, and goes when the secret is deleted.
4. The person on call loads it from the secret, exactly as for the set-up, never typing the number, and runs `correct-number --database <the database>`: the plan, which prints the new number's country code and last two digits for the founder to check, then the same command with `--commit`. A retry after a lost connection that answers "already that one" means it committed.
5. The founder asks for a code once more.
6. If the number was right, the person with Twilio Console access checks the code's delivery (TECH-SPEC T20 item 10).

The correction refuses once the founder has signed in (C0.16's phone change does that, ACC-06), once the first version of the notice is published, or while anyone else is on the roster.

## Check it worked

- The commit printed the organisation, Hearth's id and the founder's person id, both clearances with their review dates, and the send state for Twilio Verify, `no_notice`: codes go to the DPO alone until the first version is published. After an exit 4 whose commit landed, it printed none of these: the ids come as [that section](#if-a-run-stops-before-it-says-committed) says.
- The founder got a code, set a PIN and reached Hearth.
- Transfers shows Twilio Verify and AWS cleared by the set-up.

## Afterwards

- Once the founder has signed in, the person on call schedules the secret's deletion: the database now holds the only copy needed. Not before, so a correction stays possible.
- The person on call records the use in the break-glass log, for the quarterly review, and resumes the deploy pipeline.
- If the AWS CLI's history turns out to have been on during a run, the person on call deletes `~/.aws/cli/history/history.db`.
- The DPO notes the set-up in their log, then follows [Publishing a version of the notice](publishing-the-notice.md).

## Don't

- Never pass a value on the command line, in a file or in a chat, and never load the input any way but the three commands above.
- Never run the script from a Claude Code session or from CI, and never let a coding agent run any step.
- Never edit the script to skip a check, and never change the database's environment marker to get past a refusal.
- Never write to a table instead.
- If someone other than the founder signed in with the committed number, stop, and the DPO follows [A suspected breach of personal data](breach.md).

## Code paths

- `scripts/owner-bootstrap.ts`
- `bootstrap_transfer_clearance()`
- `transfer_send_state()`
- `person_by_phone()`
- `orgNameProblems`
- `maskNumber`
- `PIN_RULE_SESSION`
- `skipped_no_notice`
- `/dpo/transfers`
