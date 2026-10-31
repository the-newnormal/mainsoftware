#!/usr/bin/env bash
# The break-glass helper (C11-D11 to C11-D15; TECH-SPEC T24 item 4; docs/runbooks/break-glass.md).
# A person's tool, run in their own terminal: it takes hearth-break-glass in one member account for at
# most an hour, under one reason, writes an open entry to the log-archive account's break-glass-log
# bucket before anything else is done, opens a shell holding the role's credentials, and writes a close
# entry when that shell ends.
#
#   infra/bin/break-glass.sh <nonprod|prod|log-archive> <reason> [--console]
#   infra/bin/break-glass.sh <nonprod|prod|log-archive> <reason> --amend <session>
#
# The reason is one of the exact forms below, never free text, because it rides in the session's
# hearth-reason tag into the organisation trail and no name may (C11-D11): a request's case reference,
# an incident by date and number, the Owner bootstrap script's set-up or correction, its Twilio
# recovery, a drill by date, or a landing-zone PR by number. In log-archive only an incident or a drill.
# The role's trust holds the tag to fixed-length shapes; this script holds it to the exact forms
# (infra/src/baseline/break-glass.test.ts checks the two agree).
#
# --console also prints a console sign-in link for the same session. --amend writes an amend entry for
# an earlier session, under that session's reason, with ids learnt after it closed: it opens no shell
# and no console, writes no open or close entry, and signs out at once (C11-D13).
#
# It refuses a coding agent or CI before anything else, and refuses unless standard input and output
# are a terminal. It works only in its own folder ($HEARTH_BREAK_GLASS_HOME, else
# ~/.hearth-break-glass, mode 700), whose AWS config holds the hearth-<env>-entry profiles, never the
# person's own, and it signs out of the access portal whatever way it ends. Credentials reach a command
# only as bash prefix assignments, never as an argument, and are never printed or written, the console
# exchange included. It never prints the person's sign-in name, an account id, the bucket's name or an
# input it refused.
#
# No test runs it: IG-09 (scripts/guards/infra.test.ts) reads its text, parses it with bash -n and runs
# only its pure functions, extracted. It runs top to bottom, each function defined before its first
# use, so its text order is its run order, which IG-09 reads. It is on the owner's-read list (C11-D74).
set -euo pipefail
umask 077
IFS=$' \n\t'
export LC_ALL=C
# Nothing it reads is a file pattern, so nothing typed is expanded as one.
set -f

# The reasons, each matched whole. A request's reference is CASE_REFERENCE_PATTERN
# (packages/shared/src/cases.ts) quoted as two groups of four; a date is checked against the calendar
# and today by valid_date.
REASON_FORM_CASE='^case:[BCDFGHJKMNPQRSTVWXZ][2-9BCDFGHJKMNPQRSTVWXZ]{3}-[BCDFGHJKMNPQRSTVWXZ][2-9BCDFGHJKMNPQRSTVWXZ]{3}$'
REASON_FORM_INCIDENT='^incident:(20[0-9]{2})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-(0[1-9]|[1-9][0-9])$'
REASON_FORM_BOOTSTRAP='^bootstrap:(set-up|correct-number)$'
REASON_FORM_RECOVER='^recover:twilio$'
REASON_FORM_DRILL='^drill:(20[0-9]{2})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
REASON_FORM_LZ='^lz:pr-[1-9][0-9]{0,4}$'

# A session this script names, which holds the time it began (UTC), and STS's rule for a source
# identity, which the person's sign-in name must meet.
SESSION_FORM='^hearth-bg-[0-9]{8}T[0-9]{6}Z$'
SOURCE_IDENTITY_FORM='^[A-Za-z0-9_+=,.@-]{2,64}$'
SCHEMA='hearth.break-glass.v1'

usage() {
  cat >&2 <<'USAGE'
usage: infra/bin/break-glass.sh <nonprod|prod|log-archive> <reason> [--console]
       infra/bin/break-glass.sh <nonprod|prod|log-archive> <reason> --amend <session>
reason, exactly one of:
  case:XXXX-XXXX             a request's reference
  incident:YYYY-MM-DD-NN     an incident, by date and number
  bootstrap:set-up           the Owner bootstrap script's set-up
  bootstrap:correct-number   its correction of the founder's number
  recover:twilio             its Twilio Verify recovery
  drill:YYYY-MM-DD           a drill, by date
  lz:pr-N                    a landing-zone change, by PR number
in log-archive, only incident: and drill:
session (--amend): hearth-bg-YYYYMMDDTHHMMSSZ, as the entry being amended names it
USAGE
  exit 2
}

# A refusal, in words fixed here, never holding what was typed.
refuse() {
  printf 'break-glass: %s\n' "$1" >&2
  exit 2
}

# A coding agent or CI is never a person: any of their markers set, even empty, refuses the run.
refuse_agents() {
  local name
  for name in CLAUDECODE CLAUDE_CODE_ENTRYPOINT AI_AGENT CI GITHUB_ACTIONS; do
    if [ -n "${!name+x}" ]; then
      printf 'break-glass: refused: %s is set, so this is a coding agent or CI; break glass yourself, in your own terminal\n' "$name" >&2
      exit 3
    fi
  done
}

# A piped or scripted run isn't a person either.
require_terminal() {
  if ! [ -t 0 ] || ! [ -t 1 ]; then
    printf 'break-glass: refused: run it yourself, with standard input and output both a terminal\n' >&2
    exit 3
  fi
}

# Whether a YYYY-MM-DD date is on the calendar (month lengths and leap years by arithmetic, since BSD
# date can't parse one) and not after today, in UTC.
valid_date() {
  local date="$1" form='^(20[0-9]{2})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' year month day last today
  [[ $date =~ $form ]] || return 1
  year=$((10#${BASH_REMATCH[1]}))
  month=$((10#${BASH_REMATCH[2]}))
  day=$((10#${BASH_REMATCH[3]}))
  case "$month" in
    4 | 6 | 9 | 11) last=30 ;;
    2) if (((year % 4 == 0 && year % 100 != 0) || year % 400 == 0)); then last=29; else last=28; fi ;;
    *) last=31 ;;
  esac
  ((day <= last)) || return 1
  today="$(date -u +%Y-%m-%d)"
  [[ ! $date > $today ]]
}

# Whether a reason matches exactly one form, and its date, if it has one, is real and not in the future.
valid_reason() {
  local reason="$1" form matches=0 rest
  for form in "$REASON_FORM_CASE" "$REASON_FORM_INCIDENT" "$REASON_FORM_BOOTSTRAP" "$REASON_FORM_RECOVER" \
    "$REASON_FORM_DRILL" "$REASON_FORM_LZ"; do
    if [[ $reason =~ $form ]]; then matches=$((matches + 1)); fi
  done
  [ "$matches" -eq 1 ] || return 1
  case "$reason" in
    incident:*)
      rest="${reason#incident:}"
      valid_date "${rest%-*}"
      ;;
    drill:*) valid_date "${reason#drill:}" ;;
  esac
}

refuse_agents
require_terminal

# --- The arguments ---------------------------------------------------------------------------------

[ "$#" -ge 2 ] || usage
environment="$1"
reason="$2"
shift 2
console=no
amend=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --console) console=yes ;;
    --amend)
      [ "$#" -ge 2 ] || usage
      amend="$2"
      shift
      ;;
    *) usage ;;
  esac
  shift
done

case "$environment" in
  nonprod | prod | log-archive) ;;
  *) usage ;;
esac
if ! valid_reason "$reason"; then usage; fi
# Tier 2 is the only way into log-archive's landing zone, so there it breaks glass only to triage.
if [ "$environment" = log-archive ]; then
  case "$reason" in
    incident:* | drill:*) ;;
    *) usage ;;
  esac
fi
if [ -n "$amend" ] && [ "$console" = yes ]; then refuse 'refused: --amend opens no console'; fi
if [ -n "$amend" ] && ! [[ $amend =~ $SESSION_FORM ]]; then usage; fi
profile="hearth-$environment-entry"

# --- Isolation: its own folder, config and region, and nothing inherited ---------------------------

BG_HOME="${HEARTH_BREAK_GLASS_HOME:-$HOME/.hearth-break-glass}"
if [ -z "$(find "$BG_HOME" -maxdepth 0 -type d -user "$(id -u)" -perm 700 2>/dev/null)" ]; then
  refuse 'refused: make its folder first, yours alone (mkdir -m 700 ~/.hearth-break-glass), with the entry profiles in .aws/config there (docs/runbooks/break-glass.md)'
fi
# Every AWS variable it inherits goes: credentials, profiles, roles, and any endpoint or CA override.
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN \
  AWS_ROLE_ARN AWS_ROLE_SESSION_NAME AWS_WEB_IDENTITY_TOKEN_FILE AWS_CONTAINER_CREDENTIALS_RELATIVE_URI \
  AWS_CONTAINER_CREDENTIALS_FULL_URI AWS_CONTAINER_AUTHORIZATION_TOKEN AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE
for inherited in $(compgen -e); do
  case "$inherited" in
    AWS_*) unset "$inherited" ;;
  esac
done
export HOME="$BG_HOME"
export AWS_CONFIG_FILE="$BG_HOME/.aws/config"
export AWS_SHARED_CREDENTIALS_FILE=/dev/null
export AWS_STS_REGIONAL_ENDPOINTS=regional
export AWS_REGION=ap-southeast-1
export AWS_DEFAULT_REGION=ap-southeast-1
export AWS_EC2_METADATA_DISABLED=true
export AWS_PAGER=
export CDK_HOME="$BG_HOME/.cdk"

case "$(aws --version 2>&1)" in
  aws-cli/2.*) ;;
  *) refuse 'refused: it needs the AWS CLI, version 2' ;;
esac
command -v jq >/dev/null 2>&1 || refuse 'refused: it needs jq'
if [ "$console" = yes ]; then command -v curl >/dev/null 2>&1 || refuse 'refused: --console needs curl'; fi
# The CLI's history would keep every command and its answers on disk.
if [ "$(aws configure get cli_history 2>/dev/null || true)" = enabled ] ||
  [ "$(aws configure get cli_history --profile "$profile" 2>/dev/null || true)" = enabled ]; then
  refuse "refused: the AWS CLI's history is on in its folder's config; turn cli_history off there"
fi

# --- What it does with the role --------------------------------------------------------------------

ak=''
sk=''
st=''
expires=''
expires_at=0
session=''
first_session=''
account=''
role=''
user=''
bucket=''
runbook=''
opened=no
closed=no
modes_json='[]'
ids_json='{}'
outcome=stopped
entry_file="$BG_HOME/entry.json"
rc="$BG_HOME/shell.rc"

# The runbook the session follows, from a numbered menu defaulted from the reason.
choose_runbook() {
  local runbooks="break-glass.md security-alerts.md breach.md first-owner-set-up.md twilio-withdrawn.md access-request.md aws-account-set-up.md"
  local default=1 n=0 count item choice
  case "$reason" in
    bootstrap:*) default=4 ;;
    recover:*) default=5 ;;
    case:*) default=6 ;;
    lz:*) default=7 ;;
  esac
  printf 'Which runbook are you following?\n'
  for item in $runbooks; do
    n=$((n + 1))
    printf '  %s) docs/runbooks/%s\n' "$n" "$item"
  done
  count="$n"
  while :; do
    printf 'Number [%s]: ' "$default"
    read -r choice
    [ -n "$choice" ] || choice="$default"
    if [[ $choice =~ ^[1-9][0-9]*$ ]] && [ "$choice" -le "$count" ]; then break; fi
    printf 'break-glass: a number from 1 to %s\n' "$count"
  done
  n=0
  for item in $runbooks; do
    n=$((n + 1))
    if [ "$n" -eq "$choice" ]; then runbook="$item"; fi
  done
}

# The ids a session's close or amend entry records: the Owner bootstrap script's committed: line,
# pasted and read in the exact forms it prints (scripts/owner-bootstrap/output.ts), or ids typed one at
# a time, each checked against its shape.
collect_ids() {
  local uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' day='20[0-9]{2}-[0-9]{2}-[0-9]{2}'
  local set_up recover corrected line kind value
  set_up="^(owner-bootstrap: )?committed: organisation ($uuid); Hearth ($uuid); founder \\(Owner and DPO\\) ($uuid); Twilio Verify cleared ($uuid), review ($day); AWS cleared ($uuid), review ($day)$"
  recover="^(owner-bootstrap: )?committed: Twilio Verify cleared again by the emergency re-clear, ($uuid), review ($day)$"
  corrected="^(owner-bootstrap: )?committed: the founder's number is corrected$"
  ids_json='{}'
  printf "Paste the Owner bootstrap script's committed: line, or press Enter to type ids one at a time.\n"
  while :; do
    printf 'committed: line: '
    read -r line
    if [ -z "$line" ]; then break; fi
    if [[ $line =~ $set_up ]]; then
      ids_json="$(jq -cn --arg organisation "${BASH_REMATCH[2]}" --arg hearth "${BASH_REMATCH[3]}" \
        --arg founder "${BASH_REMATCH[4]}" --arg twilio_clearance "${BASH_REMATCH[5]}" \
        --arg twilio_review "${BASH_REMATCH[6]}" --arg aws_clearance "${BASH_REMATCH[7]}" \
        --arg aws_review "${BASH_REMATCH[8]}" \
        '{organisation: $organisation, hearth: $hearth, founder: $founder, twilio_clearance: $twilio_clearance, twilio_review: $twilio_review, aws_clearance: $aws_clearance, aws_review: $aws_review}')"
      return 0
    elif [[ $line =~ $recover ]]; then
      ids_json="$(jq -cn --arg twilio_clearance "${BASH_REMATCH[2]}" --arg twilio_review "${BASH_REMATCH[3]}" \
        '{twilio_clearance: $twilio_clearance, twilio_review: $twilio_review}')"
      return 0
    elif [[ $line =~ $corrected ]]; then
      ids_json="$(jq -cn '{corrected: true}')"
      return 0
    fi
    printf "break-glass: that isn't a committed: line the script prints; paste it whole, or press Enter\n"
  done
  printf 'Type each id, then press Enter on an empty line: a UUID, a date (YYYY-MM-DD), a case reference (XXXX-XXXX), a PR number or a 40-character commit.\n'
  while :; do
    printf 'id: '
    read -r value
    if [ -z "$value" ]; then break; fi
    kind=''
    if [[ $value =~ ^$uuid$ ]]; then
      kind=uuid
    elif [[ $value =~ ^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$ ]]; then
      kind=date
    elif [[ "case:$value" =~ $REASON_FORM_CASE ]]; then
      kind=case
    elif [[ $value =~ ^[1-9][0-9]{0,4}$ ]]; then
      kind=pr
    elif [[ $value =~ ^[0-9a-f]{40}$ ]]; then
      kind=commit
    fi
    if [ -z "$kind" ]; then
      printf "break-glass: that isn't a UUID, a date, a case reference, a PR number or a commit\n"
      continue
    fi
    ids_json="$(jq -c --arg kind "$kind" --arg value "$value" '.typed += [{kind: $kind, value: $value}]' <<<"$ids_json")"
  done
}

# What the session did, and how it ended, from fixed lists.
collect_close() {
  local all="none exec port-forward ecs-update rollback plan commit set-up correct-number recover extract lz-deploy"
  local item n count choices choice ok
  printf 'What did the session do? Numbers, separated by spaces.\n'
  n=0
  for item in $all; do
    n=$((n + 1))
    printf '  %s) %s\n' "$n" "$item"
  done
  count="$n"
  while :; do
    printf 'Numbers: '
    read -r choices
    ok=yes
    modes_json='[]'
    for choice in $choices; do
      if ! [[ $choice =~ ^[1-9][0-9]*$ ]] || [ "$choice" -gt "$count" ]; then ok=no; fi
    done
    if [ -n "$choices" ] && [ "$ok" = yes ]; then break; fi
    printf 'break-glass: numbers from 1 to %s\n' "$count"
  done
  for choice in $choices; do
    n=0
    for item in $all; do
      n=$((n + 1))
      if [ "$n" -eq "$choice" ]; then
        modes_json="$(jq -c --arg mode "$item" '. + [$mode] | unique' <<<"$modes_json")"
      fi
    done
  done
  collect_ids
  while :; do
    printf 'How did it end? 1) completed  2) stopped  3) failed: '
    read -r choice
    case "$choice" in
      1) outcome=completed && break ;;
      2) outcome=stopped && break ;;
      3) outcome=failed && break ;;
    esac
    printf 'break-glass: 1, 2 or 3\n'
  done
}

# The role, for an hour at most, under the reason, with the person's sign-in name as the session's
# source identity, which CloudTrail carries; the session's own name holds only the time.
assume_role() {
  session="hearth-bg-$(date -u +%Y%m%dT%H%M%SZ)"
  expires_at=$(($(date -u +%s) + 60 * 60))
  if ! read -r ak sk st expires < <(aws sts assume-role --profile "$profile" --role-arn "$role" \
    --role-session-name "$session" --source-identity "$user" --tags "Key=hearth-reason,Value=$reason" \
    --duration-seconds 3600 --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken,Expiration]' \
    --output text 2>/dev/null); then
    printf "break-glass: the role wasn't assumed: check the reason's form, that you signed in with HearthBreakGlassEntry, and docs/runbooks/break-glass.md\n" >&2
    return 1
  fi
}

# One entry, under this account's prefix, never over another (--if-none-match) and with the checksum
# Object Lock asks for. The credentials reach the CLI as prefix assignments alone.
put_entry() {
  AWS_ACCESS_KEY_ID="$ak" AWS_SECRET_ACCESS_KEY="$sk" AWS_SESSION_TOKEN="$st" \
    aws s3api put-object --bucket "$bucket" --key "$1" --body "$entry_file" --content-type application/json \
    --checksum-algorithm SHA256 --if-none-match '*' >/dev/null 2>&1
}

# An entry's key: the session's own date, from its name, under this account's prefix.
entry_key() {
  printf 'break-glass/%s/%s/%s/%s/%s-%s.json' "$account" "${1:10:4}" "${1:14:2}" "${1:16:2}" "$1" "$2"
}

# The open entry, written before the shell opens: nothing is done under the role until it is.
open_session() {
  local key
  read -r bucket < <(AWS_ACCESS_KEY_ID="$ak" AWS_SECRET_ACCESS_KEY="$sk" AWS_SESSION_TOKEN="$st" \
    aws ssm get-parameter --name /hearth/break-glass/log-bucket --query Parameter.Value --output text 2>/dev/null) ||
    refuse "the break-glass-log bucket's parameter wasn't read, so nothing was done; see docs/runbooks/break-glass.md"
  key="$(entry_key "$session" open)"
  jq -n --arg schema "$SCHEMA" --arg environment "$environment" --arg reason "$reason" --arg runbook "$runbook" \
    --arg session "$session" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg expires "$expires" \
    '{schema: $schema, entry: "open", environment: $environment, reason: $reason, runbook: $runbook, session: $session, at: $at, expires: $expires}' \
    >"$entry_file"
  put_entry "$key" || refuse "the open entry wasn't written, so nothing was done; see docs/runbooks/break-glass.md"
  opened=yes
  first_session="$session"
  printf 'break-glass: open entry written for %s\n' "$session"
}

# The close entry, for the first session. Past its hour the role is taken again under the same reason,
# which raises A1 again, and that session writes a continuation entry naming the first before it
# writes the close.
close_session() {
  local key
  if [ "$1" = prompted ]; then collect_close; fi
  if [ "$(date -u +%s)" -ge $((expires_at - 120)) ]; then
    assume_role || return 1
    jq -n --arg schema "$SCHEMA" --arg environment "$environment" --arg reason "$reason" --arg session "$session" \
      --arg continues "$first_session" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg expires "$expires" \
      '{schema: $schema, entry: "continuation", environment: $environment, reason: $reason, session: $session, continues: $continues, at: $at, expires: $expires}' \
      >"$entry_file"
    put_entry "$(entry_key "$session" continuation)" || return 1
  fi
  key="$(entry_key "$first_session" close)"
  jq -n --arg schema "$SCHEMA" --arg environment "$environment" --arg session "$first_session" \
    --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson modes "$modes_json" --argjson ids "$ids_json" \
    --arg outcome "$outcome" \
    '{schema: $schema, entry: "close", environment: $environment, session: $session, at: $at, modes: $modes, ids: $ids, outcome: $outcome}' \
    >"$entry_file"
  put_entry "$key" || return 1
  closed=yes
  printf 'break-glass: close entry written\n'
}

# An amend entry for an earlier session, under its reason: the ids first, then the role for the one
# write, then signed out. No shell, no console, no open or close entry.
amend_session() {
  local key
  printf 'Amending %s.\n' "$amend"
  collect_ids
  assume_role || exit 1
  key="$(entry_key "$amend" "amend-${session#hearth-bg-}")"
  jq -n --arg schema "$SCHEMA" --arg environment "$environment" --arg reason "$reason" --arg session "$session" \
    --arg amends "$amend" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson ids "$ids_json" \
    '{schema: $schema, entry: "amend", environment: $environment, reason: $reason, session: $session, amends: $amends, at: $at, ids: $ids}' \
    >"$entry_file"
  read -r bucket < <(AWS_ACCESS_KEY_ID="$ak" AWS_SECRET_ACCESS_KEY="$sk" AWS_SESSION_TOKEN="$st" \
    aws ssm get-parameter --name /hearth/break-glass/log-bucket --query Parameter.Value --output text 2>/dev/null) ||
    refuse "the break-glass-log bucket's parameter wasn't read, so nothing was written"
  put_entry "$key" || refuse "the amend entry wasn't written; see docs/runbooks/break-glass.md"
  printf 'break-glass: amend entry written\n'
  ak=''
  sk=''
  st=''
  aws sso logout >/dev/null 2>&1 || true
}

# A console sign-in link for this session, on request: the session goes to the sign-in endpoint in a
# POST body read from standard input, never in an argument or a URL, and the link printed holds only
# the sign-in token, good for 15 minutes.
open_console() {
  local token destination
  if ! read -r token < <(AWS_ACCESS_KEY_ID="$ak" AWS_SECRET_ACCESS_KEY="$sk" AWS_SESSION_TOKEN="$st" \
    jq -cjn '{sessionId: env.AWS_ACCESS_KEY_ID, sessionKey: env.AWS_SECRET_ACCESS_KEY, sessionToken: env.AWS_SESSION_TOKEN}' |
    curl -fsS --proto '=https' --tlsv1.2 --data-urlencode 'Action=getSigninToken' --data-urlencode 'Session@-' \
      https://signin.aws.amazon.com/federation 2>/dev/null | jq -r '.SigninToken // empty'); then
    printf "break-glass: the console link wasn't made; the shell still works\n"
    return 0
  fi
  token="$(jq -rn --arg token "$token" '$token | @uri')"
  destination="$(jq -rn '"https://ap-southeast-1.console.aws.amazon.com/" | @uri')"
  printf 'Console sign-in for this session (the link works for 15 minutes):\n'
  printf '%s\n' "https://signin.aws.amazon.com/federation?Action=login&Destination=$destination&SigninToken=$token"
}

# The shell holding the role: the credentials reach it as prefix assignments alone, so they sit in its
# environment and never in an argument; its prompt counts the minutes left and warns at 10 and 5.
run_shell() {
  cat >"$rc" <<'RC'
unset HISTFILE
hearth_bg_prompt() {
  local left
  left=$(( (HEARTH_BREAK_GLASS_UNTIL - $(date -u +%s)) / 60 ))
  if [ "$left" -le 5 ] && [ "${hearth_bg_warned:-}" != 5 ]; then
    hearth_bg_warned=5
    printf 'break-glass: about %s minutes left: finish, then type exit so the close entry is written\n' "$left"
  elif [ "$left" -le 10 ] && [ -z "${hearth_bg_warned:-}" ]; then
    hearth_bg_warned=10
    printf 'break-glass: about %s minutes left\n' "$left"
  fi
  if [ "$left" -lt 0 ]; then left=0; fi
  PS1="[BREAK-GLASS $HEARTH_BREAK_GLASS ${left}m] "
}
PROMPT_COMMAND=hearth_bg_prompt
RC
  printf 'break-glass: the role is yours for the hour; type exit when done, and the close entry is written.\n'
  # Ctrl-C in the shell is the shell's: this script waits it out rather than ending with it.
  trap ':' INT
  AWS_ACCESS_KEY_ID="$ak" AWS_SECRET_ACCESS_KEY="$sk" AWS_SESSION_TOKEN="$st" \
    HEARTH_BREAK_GLASS="$environment $reason" HEARTH_BREAK_GLASS_UNTIL="$expires_at" HISTFILE=/dev/null \
    bash --rcfile "$rc" -i || true
  trap 'on_exit' INT
}

# However it ends: a close entry, unprompted (stopped, with no modes or ids), if the session opened
# and none was written; the credentials dropped, its files removed, and the access portal signed out.
on_exit() {
  local status=$?
  trap - EXIT INT TERM HUP
  if [ "$opened" = yes ] && [ "$closed" = no ]; then
    close_session unprompted || printf "break-glass: the close entry wasn't written; tell the reviewer (docs/runbooks/break-glass-review.md)\n" >&2
  fi
  ak=''
  sk=''
  st=''
  rm -f "$entry_file" "$rc"
  aws sso logout >/dev/null 2>&1 || true
  exit "$status"
}

# --- The session -----------------------------------------------------------------------------------

if [ -z "$amend" ]; then choose_runbook; fi
trap 'on_exit' EXIT INT TERM HUP
aws sso login --profile "$profile"

# Who signed in: Identity Center's HearthBreakGlassEntry role in this account, whose session name is
# the person's sign-in name, which becomes the source identity. The role's ARN is built here, so no
# ARN is written in this file.
read -r account caller < <(aws sts get-caller-identity --profile "$profile" --query '[Account,Arn]' --output text 2>/dev/null) ||
  refuse "the sign-in didn't work; see docs/runbooks/break-glass.md"
[[ $account =~ ^[0-9]{12}$ ]] || refuse "the sign-in didn't name an account"
partition="${caller#arn:}"
partition="${partition%%:*}"
[[ $partition =~ ^aws(-[a-z]+)*$ ]] || refuse "the sign-in didn't name a partition"
assumed="${caller#*:assumed-role/}"
case "${assumed%%/*}" in
  AWSReservedSSO_HearthBreakGlassEntry_*) ;;
  *) refuse 'refused: sign in with the HearthBreakGlassEntry permission set (its hearth-<env>-entry profile)' ;;
esac
user="${assumed#*/}"
[[ $user =~ $SOURCE_IDENTITY_FORM ]] || refuse "refused: your sign-in name can't be a session's source identity"
role="arn:$partition:iam::$account:role/hearth-break-glass"

if [ -n "$amend" ]; then
  amend_session
  exit 0
fi

assume_role || exit 1
open_session
if [ "$console" = yes ]; then open_console; fi
run_shell
close_session prompted
