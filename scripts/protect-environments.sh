#!/usr/bin/env bash
# The deploy pipeline's GitHub environments as code (C11-D56; TECH-SPEC T24 items 20 and 21):
# .github/environments/nonprod.json, prod-plan.json and prod.json say what each environment must be,
# and this script applies them to GitHub or checks GitHub's live settings against them. Mirrors
# scripts/protect-main.sh. It holds who may approve a deploy, so it is on the owner's-read list
# (C11-D74).
#
#   scripts/protect-environments.sh check [owner/repo]
#   scripts/protect-environments.sh check --from <dir> [owner/repo]
#   PROD_REVIEWERS=<login>[,<login>...] scripts/protect-environments.sh apply [owner/repo]
#
# check only reads: the deploy workflow's gate runs it on every run, and refuses the run unless every
# environment is live exactly as written (C11-D49). For each environment it reads the environment, its
# deployment branch policies and its custom deployment protection rules, and then the repository's
# OIDC subject template, and compares them field by field: required_reviewers 0 means no
# required-reviewers rule at all and n a rule with at least n reviewers, prevent_self_review as
# written where that rule exists, no wait timer (or 0), the branch policy setting exactly as written
# with exactly one branch policy, main of type branch, no custom protection rule, can_admins_bypass
# present and equal (absent counts as differing), and the subject template not the default, with
# exactly the keys repo, context and job_workflow_ref. It prints `protect-environments: <name> ok`,
# or `protect-environments: <name> <field> differs` for each finding (a field's name, never a
# value), and exits 0 when every environment and the template are as written, else 1. A read that
# fails differs. With --from it reads answers saved earlier from <dir> instead of calling GitHub
# (<name>.json, <name>-branch-policies.json and <name>-protection-rules.json for each environment,
# and oidc.json), so a test can run the comparison on fixtures and a repo admin can check answers
# saved before.
#
# apply is a repo admin's, run in their own terminal, never by a coding agent or CI: it refuses while
# any of the markers the Owner bootstrap script refuses is set (AGENT_MARKERS below, kept equal to
# scripts/owner-bootstrap/target.ts's by the deploy-workflow guard), and the deny rules in
# .claude/settings.json name it. It needs the gh CLI logged in as a repo admin (Administration
# write). A file that asks for reviewers needs PROD_REVIEWERS, the reviewers' GitHub logins,
# comma-separated, set for the one command: logins are given at run time and never committed, since
# the repository is public. For each environment it sets the wait timer, self-review, reviewers
# (each login resolved to its user id), the branch policy setting and admin bypass, makes the branch
# policies exactly main of type branch (deleting any other, adding main if it is missing), then runs
# check and exits with its status. A custom protection rule it leaves for the admin to remove, and
# check names it. The environments' secrets are not its business: aws-account-set-up.md step E has
# the person set them with `gh secret set <NAME> --env <environment>`.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
dir="$root/.github/environments"
ENVIRONMENTS=(nonprod prod-plan prod)
AGENT_MARKERS=(CLAUDECODE CLAUDE_CODE_ENTRYPOINT AI_AGENT CI GITHUB_ACTIONS)
CLAIM_KEYS='["repo","context","job_workflow_ref"]'

usage() {
  echo 'usage: scripts/protect-environments.sh check [--from <dir>] [owner/repo] | apply [owner/repo]' >&2
  exit 2
}

command -v jq >/dev/null || {
  echo 'protect-environments: needs jq' >&2
  exit 2
}

# A file's settings, checked against the shape every environment file has; prints the file's JSON
# compacted, or nothing when it is not one.
desired() {
  local name=$1
  jq -ce --arg name "$name" '
    select(
      type == "object"
      and (keys == (["environment", "required_reviewers", "prevent_self_review", "wait_timer", "can_admins_bypass", "deployment_branch_policy", "branch_policies"] | sort))
      and .environment == $name
      and (.required_reviewers | type == "number" and . >= 0 and . <= 6 and floor == .)
      and (.prevent_self_review | type == "boolean")
      and .wait_timer == 0
      and (.can_admins_bypass | type == "boolean")
      and .deployment_branch_policy == {"protected_branches": false, "custom_branch_policies": true}
      and .branch_policies == [{"name": "main", "type": "branch"}]
    )' "$dir/$name.json" 2>/dev/null
}

# The folder holds exactly the three files, each of its shape.
check_files() {
  local found=0 file name
  for file in "$dir"/* "$dir"/.[!.]*; do
    [ -e "$file" ] || continue
    name=$(basename "$file")
    case "$name" in
      nonprod.json | prod-plan.json | prod.json) ;;
      *)
        echo "protect-environments: $name is not one of the three environment files"
        found=1
        ;;
    esac
  done
  for name in "${ENVIRONMENTS[@]}"; do
    if [ -z "$(desired "$name")" ]; then
      echo "protect-environments: $name file differs"
      found=1
    fi
  done
  return "$found"
}

# One answer, from GitHub or from the saved folder; nothing, and a non-zero status, when it can't be
# read or isn't a JSON object.
answer() {
  local saved=$1 path=$2 text
  if [ -n "$from" ]; then
    text=$(cat "$from/$saved" 2>/dev/null) || return 1
  else
    text=$(gh api "repos/$repo/$path" 2>/dev/null) || return 1
  fi
  jq -ce 'select(type == "object")' <<<"$text" 2>/dev/null
}

# The fields of one environment that differ from its file, one name a line.
differing() {
  local want=$1 settings=$2 branches=$3 custom=$4
  jq -rn --argjson d "$want" --argjson e "$settings" --argjson b "$branches" --argjson c "$custom" '
    def rules($t): [($e.protection_rules // [])[]? | select(type == "object" and .type == $t)];
    (if $e == null then "settings" else
      (if $e.name == $d.environment then empty else "name" end),
      (rules("required_reviewers") as $r
        | if $d.required_reviewers == 0 then (if ($r | length) == 0 then empty else "required_reviewers" end)
          elif ($r | length) == 1 and (($r[0].reviewers // []) | length) >= $d.required_reviewers then empty
          else "required_reviewers" end),
      (rules("required_reviewers") as $r
        | if ($r | length) == 1 and $r[0].prevent_self_review != $d.prevent_self_review then "prevent_self_review"
          else empty end),
      (rules("wait_timer") as $w
        | if ($w | length) == 0 or (($w | length) == 1 and $w[0].wait_timer == $d.wait_timer) then empty
          else "wait_timer" end),
      (if ($e.protection_rules // []) | type == "array" and all(.[]; type == "object" and (.type == "required_reviewers" or .type == "wait_timer" or .type == "branch_policy"))
        then empty else "protection_rules" end),
      (if ($e | has("can_admins_bypass")) and $e.can_admins_bypass == $d.can_admins_bypass then empty
        else "can_admins_bypass" end),
      (if $e.deployment_branch_policy == $d.deployment_branch_policy then empty else "deployment_branch_policy" end)
    end),
    (if ($b.branch_policies | type) == "array" and ($b.branch_policies | map({name, type})) == $d.branch_policies
      then empty else "branch_policies" end),
    (if ($c.custom_deployment_protection_rules | type) == "array" and ($c.custom_deployment_protection_rules | length) == 0
      then empty else "custom_deployment_protection_rules" end)'
}

check() {
  local status=0 name want settings branches custom fields field oidc
  check_files || status=1
  for name in "${ENVIRONMENTS[@]}"; do
    want=$(desired "$name") || true
    [ -n "$want" ] || continue
    settings=$(answer "$name.json" "environments/$name") || settings=null
    branches=$(answer "$name-branch-policies.json" "environments/$name/deployment-branch-policies") || branches=null
    custom=$(answer "$name-protection-rules.json" "environments/$name/deployment_protection_rules") || custom=null
    fields=$(differing "$want" "$settings" "$branches" "$custom") || fields=settings
    if [ -z "$fields" ]; then
      echo "protect-environments: $name ok"
    else
      status=1
      while IFS= read -r field; do echo "protect-environments: $name $field differs"; done <<<"$fields"
    fi
  done
  oidc=$(answer oidc.json actions/oidc/customization/sub) || oidc=null
  fields=$(jq -rn --argjson o "$oidc" --argjson keys "$CLAIM_KEYS" '
    if $o == null then "subject_template" else
      (if $o.use_default == false then empty else "use_default" end),
      (if $o.include_claim_keys == $keys then empty else "include_claim_keys" end)
    end')
  if [ -z "$fields" ]; then
    echo 'protect-environments: oidc ok'
  else
    status=1
    while IFS= read -r field; do echo "protect-environments: oidc $field differs"; done <<<"$fields"
  fi
  return "$status"
}

# The user id of each login in PROD_REVIEWERS, as the reviewers a PUT takes.
reviewers() {
  local login id list='[]'
  IFS=',' read -r -a logins <<<"${PROD_REVIEWERS:-}"
  for login in "${logins[@]}"; do
    [[ "$login" =~ ^[A-Za-z0-9](-?[A-Za-z0-9]){0,38}$ ]] || {
      echo 'protect-environments: PROD_REVIEWERS holds something other than GitHub logins' >&2
      exit 2
    }
    id=$(gh api "users/$login" --jq .id)
    [[ "$id" =~ ^[0-9]+$ ]] || {
      echo 'protect-environments: a login in PROD_REVIEWERS names no user' >&2
      exit 1
    }
    list=$(jq -c --argjson id "$id" '. + [{type: "User", id: $id}]' <<<"$list")
  done
  echo "$list"
}

apply() {
  local marker name want count people body policies id policy_name type has_main
  for marker in "${AGENT_MARKERS[@]}"; do
    if [[ -v $marker ]]; then
      echo "protect-environments: refused while $marker is set: a repo admin runs apply in their own terminal, never a coding agent or CI" >&2
      exit 1
    fi
  done
  check_files || exit 1
  command -v gh >/dev/null || {
    echo 'protect-environments: needs the gh CLI' >&2
    exit 2
  }
  for name in "${ENVIRONMENTS[@]}"; do
    want=$(desired "$name")
    count=$(jq -r .required_reviewers <<<"$want")
    people=null
    if [ "$count" -gt 0 ]; then
      people=$(reviewers)
      if [ "$(jq length <<<"$people")" -lt "$count" ]; then
        echo "protect-environments: $name asks for $count reviewers; set PROD_REVIEWERS for this command" >&2
        exit 2
      fi
    fi
    body=$(jq -n --argjson d "$want" --argjson people "$people" '{
      wait_timer: $d.wait_timer,
      prevent_self_review: $d.prevent_self_review,
      reviewers: $people,
      deployment_branch_policy: $d.deployment_branch_policy,
      can_admins_bypass: $d.can_admins_bypass
    }')
    gh api -X PUT "repos/$repo/environments/$name" --input - --silent <<<"$body"
    policies=$(gh api "repos/$repo/environments/$name/deployment-branch-policies?per_page=100" \
      --jq '.branch_policies[] | [.id, .name, .type] | @tsv')
    has_main=0
    while IFS=$'\t' read -r id policy_name type; do
      [ -n "$id" ] || continue
      if [ "$policy_name" = main ] && [ "$type" = branch ] && [ "$has_main" = 0 ]; then
        has_main=1
      else
        gh api -X DELETE "repos/$repo/environments/$name/deployment-branch-policies/$id" --silent
      fi
    done <<<"$policies"
    if [ "$has_main" = 0 ]; then
      gh api -X POST "repos/$repo/environments/$name/deployment-branch-policies" -f name=main -f type=branch --silent
    fi
    echo "protect-environments: applied $name"
  done
  check
}

command=${1:-}
[ -n "$command" ] || usage
shift
from=''
if [ "$command" = check ] && [ "${1:-}" = --from ]; then
  [ -n "${2:-}" ] || usage
  from=$2
  shift 2
fi
[ "$#" -le 1 ] || usage
repo=${1:-}
if [ -z "$repo" ] && [ -z "$from" ]; then
  repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
fi

case "$command" in
  check) check ;;
  apply) apply ;;
  *) usage ;;
esac
