// The deploy-workflow guard's rules (DPW-01 to DPW-14; C0.11, TECH-SPEC T24 items 20 to 23 and 28):
// what .github/workflows/deploy.yml must be, what every other workflow mustn't do around it, and the
// GitHub environments written as code beside it. deploy-workflow.test.ts proves each case on planted
// text, then holds the repository to it. Each case is one function taking the texts it reads (the
// workflows by path, the environment files, non-prod's holdsRealData, the manifests) and returning
// findings, `<path>: DPW-nn <rule>`, each naming a rule (and a job or step) and never a value.
//
// Beside the cases are the canonical texts the workflow pastes byte for byte wherever it runs them:
// the preamble, the CLI's folder, the CLI, asset and AWS checks, the one-off runs and their parts,
// the newest-release reader, the gates' reads of the CI runs and prod-gate's call, the fast re-checks,
// the CLI's lines, the push and the synth's lines, so the workflow and its guard can't drift apart
// unseen. A shell text here is a raw template in which a backtick is written \` and a dollar-brace $\{,
// the one way it differs from the workflow's own text.
//
// The workflow is read through workflow.ts, which refuses any shape it can't read (DPW-02). Each run is
// read twice. Its own lines, every line outside a canonical text standing whole, are read by readShell()
// through SHELL_TABLE, an allowlist of the shell forms the workflow uses (blanks, word characters, quoting,
// expansions, substitutions, operators, redirections, keywords, tests, case patterns, functions,
// assignments and builtins as it holds them), so any form the table doesn't name is refused at its line
// (DPW-10 in a credentialed job, DPW-13 in a record job, DPW-07 in every other), whatever it is, and no
// review has to find it first; each command it reads in a credentialed or record job is held to the flags
// and arguments the workflow uses (GLUE_USES). A canonical text is read whole, so it is held instead to
// bash's own reading of it (readsAsBash()) and to evaluating only what it sets itself
// (outsideEvaluations()). Beside that, the regex reader shellViews() and shellCommands() still reads
// every run as a second layer that only ever adds a command: it sets aside what bash reads as data
// (comments, quoted text outside its command substitutions, a test's operands and a case's patterns) and
// reads through what comes before a command (an assignment, a redirection, a wrapper such as exec, command
// or env), so a word a rule forbids as a command is found where bash would run it and not where it is a
// jq path, a message or a URL; the words no credentialed job may name at all (an interpreter's, say) are
// found anywhere outside a comment. An if: is read by evaluateIf(), which asks whether any value it
// doesn't know could let a bot, a drill or a failed job through. This file decides who and what may
// deploy, so it is on the owner's-read list (C11-D74).
import {
  type BlockValue,
  blockValue,
  commentLines,
  concurrencyOf,
  indicatorProblems,
  jobConcurrency,
  jobEnvironment,
  jobNeeds,
  jobPermissions,
  jobScalar,
  literalProblems,
  parsedSteps,
  permissionsOf,
  shapeProblems,
  type WorkflowJob,
  type WorkflowStep,
  workflowJobs,
  workflowTop,
  yamlLines,
} from './workflow'

// A shell text written as a raw template: \` stands for a backtick and $\{ for a dollar-brace, which a
// template can't hold as written; nothing else changes.
function sh(strings: TemplateStringsArray, ...values: readonly string[]): string {
  const raw = strings.raw.map(part => part.replaceAll('\\`', '`').replaceAll('$\\{', '$' + '{'))
  return String.raw({ raw }, ...values)
}

// --- The canonical texts ------------------------------------------------------------------------------

// The preamble (C11-D61): the first lines of every run step after the credentials action. Every aws,
// cdk and skopeo command then runs as `run …`, its output shown through the account-id filter (a run
// of twelve digits with no digit or lowercase hex letter beside it, so a commit or digest stays whole),
// or inside `$(get …)`, its output kept and never printed and its errors filtered (DPW-07).
export const PREAMBLE = sh`set -euo pipefail
# Every aws, cdk and skopeo command runs as \`run …\` (its output shown through the account-id filter)
# or inside \`$(get …)\` (its output kept for use and never printed, its errors filtered) (C11-D61).
mask() { sed -uE ':a; s/(^|[^0-9a-f])[0-9]{12}([^0-9a-f]|$)/\1***\2/; ta'; }
run() { "$@" 2>&1 | mask; }
get() { "$@" 2> >(mask >&2); }
CDK="$GITHUB_WORKSPACE/node_modules/aws-cdk/bin/cdk"
export CDK_DISABLE_CLI_TELEMETRY=true CDK_DISABLE_VERSION_CHECK=true`

// The CLI's folder (C11-D76, DPW-10, DPW-14): before any CDK line, an empty folder made for the run and a
// fresh HOME, so no cdk.json (which could name a plugin or a build command) and no ~/.cdk.json waits there.
export const CDK_FOLDER = sh`cd "$(mktemp -d)" && HOME="$(mktemp -d)" && export HOME`

// The CLI check (C11-D48, C11-D76, DPW-10): the whole run of the step after `npm ci`, before the credentials
// action. The CLI is the registry's aws-cdk at infra's pin, never a workspace's or a link.
export const CLI_CHECK = sh`set -euo pipefail
# The CLI check (CLI_CHECK; C11-D48, C11-D76): the CDK CLI this job runs is the registry's aws-cdk at
# infra's pin, never a workspace's or a link. The lockfile's entry resolves from the registry with an
# integrity hash and no link, the installed package is aws-cdk at that version and no link itself,
# and its bin stays inside it. One line names a failure.
pin=$(jq -r '.devDependencies["aws-cdk"]' infra/package.json)
[[ "$pin" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "cli-check: infra's aws-cdk isn't pinned to one version"; exit 1; }
jq -e --arg pin "$pin" '.packages["node_modules/aws-cdk"] | type == "object" and .version == $pin and (.resolved | type == "string" and startswith("https://registry.npmjs.org/aws-cdk/-/")) and (.integrity | type == "string" and startswith("sha512-")) and (has("link") | not)' package-lock.json >/dev/null ||
  { echo "cli-check: the lockfile's aws-cdk isn't the registry's at infra's pin"; exit 1; }
[ ! -L node_modules/aws-cdk ] && jq -e --arg pin "$pin" '.name == "aws-cdk" and .version == $pin' node_modules/aws-cdk/package.json >/dev/null ||
  { echo "cli-check: the installed aws-cdk isn't the registry's package at infra's pin"; exit 1; }
case "$(readlink -f node_modules/aws-cdk/bin/cdk)" in
  "$(readlink -f node_modules/aws-cdk)"/*) ;;
  *) echo 'cli-check: the CLI resolves outside the aws-cdk package'; exit 1 ;;
esac`

// The asset and release checks (C11-D76, DPW-14): check_assembly and check_release_in, defined here and called
// by each step that runs them on each folder it downloaded or uploads.
export const ASSET_CHECK = sh`# The asset and release checks (ASSET_CHECK; C11-D76, DPW-14). A downloaded cloud assembly is data
# the CLI acts on, so before any credential each one is walked from its root manifest through every
# nested assembly, the files its manifests name and not file names, and refused for: missing context
# (the CLI would look it up with this job's credentials); an artifact type a workload synth never
# writes; a named file that isn't a plain name in its own folder; a legacy asset entry in any
# artifact's metadata, inline or in its metadata file (the CLI would build or upload it whatever the
# asset manifests say); a container image asset, or a file asset that runs a command, is packaged
# otherwise than file or zip, or whose path leaves the tree; no asset manifest at all; any symbolic
# link. The release check then requires every Services template's Release output to be the release
# this job deploys, and every container image in the Tasks and Services templates to be the server
# image at its digest. A refusal is one line naming the rule, never a path or value from the
# assembly.
asset_refuse() {
  echo "asset-check: $1"
  exit 1
}
# Each cloud assembly folder in the tree, the root first (read once check_assembly has passed).
assembly_dirs() {
  local queue=("$1") dir name
  while [ "$\{#queue[@]}" -gt 0 ]; do
    dir=$\{queue[0]}
    queue=("$\{queue[@]:1}")
    printf '%s\n' "$dir"
    while IFS= read -r name; do
      queue+=("$dir/$name")
    done < <(jq -r '(.artifacts // {})[] | select(.type == "cdk:cloud-assembly") | .properties.directoryName' "$dir/manifest.json")
  done
}
check_assembly() {
  local root dir file path manifests=0 queue
  [ -d "$1" ] || asset_refuse 'the assembly folder is missing'
  root=$(cd "$1" && pwd -P)
  [ -z "$(find "$root" -type l -print -quit)" ] || asset_refuse 'the assembly holds a symbolic link'
  queue=("$root")
  while [ "$\{#queue[@]}" -gt 0 ]; do
    dir=$\{queue[0]}
    queue=("$\{queue[@]:1}")
    [ -f "$dir/manifest.json" ] || asset_refuse 'a cloud assembly has no manifest.json'
    jq -e 'type == "object"' "$dir/manifest.json" >/dev/null 2>&1 || asset_refuse 'a manifest is not a JSON object'
    jq -e '(.missing // []) | length == 0' "$dir/manifest.json" >/dev/null ||
      asset_refuse 'a manifest has missing context, which the CLI would look up'
    jq -e '(.artifacts // {}) | all(.[]; .type | IN("aws:cloudformation:stack", "cdk:asset-manifest", "cdk:cloud-assembly", "cdk:tree", "cdk:feature-flag-report"))' "$dir/manifest.json" >/dev/null ||
      asset_refuse 'an artifact type is not one a workload synth writes'
    jq -e '[(.artifacts // {})[] | (.additionalMetadataFile // empty), (if .type == "aws:cloudformation:stack" then .properties.templateFile elif .type == "cdk:cloud-assembly" then .properties.directoryName elif .type == "cdk:asset-manifest" or .type == "cdk:tree" then .properties.file else empty end)] | all(.[]; type == "string" and test("^[^./][^/]*$") and (contains("..") | not) and (test("[[:cntrl:]]") | not))' "$dir/manifest.json" >/dev/null ||
      asset_refuse 'a manifest names a file that is not a plain name in its own folder'
    jq -e '(.artifacts // {}) | all(.[]; (.metadata // {}) | type == "object" and all(.[]; type == "array" and all(.[]; type == "object")))' "$dir/manifest.json" >/dev/null ||
      asset_refuse "an artifact's metadata is not a JSON object of entry lists"
    jq -e '[(.artifacts // {})[] | (.metadata // {})[][] | .type] | all(.[]; . != "aws:cdk:asset")' "$dir/manifest.json" >/dev/null ||
      asset_refuse 'an artifact carries a legacy asset entry, which the CLI would build or upload'
    while IFS= read -r file; do
      [ -f "$dir/$file" ] || asset_refuse 'a metadata file is missing'
      jq -e 'type == "object" and all(.[]; type == "array" and all(.[]; type == "object"))' "$dir/$file" >/dev/null 2>&1 ||
        asset_refuse 'a metadata file is not a JSON object of entry lists'
      jq -e '[.[][] | .type] | all(.[]; . != "aws:cdk:asset")' "$dir/$file" >/dev/null ||
        asset_refuse 'an artifact carries a legacy asset entry, which the CLI would build or upload'
    done < <(jq -r '(.artifacts // {})[] | .additionalMetadataFile // empty' "$dir/manifest.json")
    while IFS= read -r file; do
      [ -f "$dir/$file" ] || asset_refuse 'an asset manifest is missing'
      jq -e '(.dockerImages // {}) | length == 0' "$dir/$file" >/dev/null || asset_refuse 'an asset manifest holds a container image asset'
      jq -e '(.files // {}) | all(.[]; (.source | type == "object") and (.source | has("executable") | not) and (.source.packaging | IN("file", "zip")) and (.source.path | type == "string" and (startswith("/") | not) and (test("[[:cntrl:]]") | not)))' "$dir/$file" >/dev/null ||
        asset_refuse 'a file asset runs a command, is packaged otherwise than file or zip, or names no relative path'
      while IFS= read -r path; do
        case "$(realpath -m -- "$dir/$path")" in
          "$root"/*) ;;
          *) asset_refuse 'an asset path leaves the assembly' ;;
        esac
      done < <(jq -r '(.files // {})[] | .source.path' "$dir/$file")
      manifests=$((manifests + 1))
    done < <(jq -r '(.artifacts // {})[] | select(.type == "cdk:asset-manifest") | .properties.file' "$dir/manifest.json")
    while IFS= read -r file; do
      [ -d "$dir/$file" ] || asset_refuse 'a nested assembly is missing'
      queue+=("$dir/$file")
    done < <(jq -r '(.artifacts // {})[] | select(.type == "cdk:cloud-assembly") | .properties.directoryName' "$dir/manifest.json")
  done
  [ "$manifests" -gt 0 ] || asset_refuse 'no asset manifest was read'
}
check_release_in() {
  local root release=$2 digest services=0 dir stack template
  [[ "$release" =~ ^[0-9a-f]{40}:sha256:[0-9a-f]{64}$ ]] || asset_refuse 'the release is not <commit>:<digest>'
  digest=$\{release#*:}
  root=$(cd "$1" && pwd -P)
  while IFS= read -r dir; do
    while IFS=$'\t' read -r stack template; do
      case "$stack" in
        Hearth-*-Services)
          services=$((services + 1))
          jq -e --arg release "$release" '.Outputs.Release.Value == $release' "$dir/$template" >/dev/null ||
            asset_refuse "a Services template's Release is not this job's release"
          ;;&
        Hearth-*-Tasks | Hearth-*-Services)
          jq -e --arg image "/hearth-server@$digest" '[.Resources[]? | select(.Type == "AWS::ECS::TaskDefinition") | .Properties.ContainerDefinitions[]?.Image] | length > 0 and all(.[]; type == "object" and (.["Fn::Join"] | type == "array") and (.["Fn::Join"][1] | type == "array" and (last | type == "string" and endswith($image))))' "$dir/$template" >/dev/null ||
            asset_refuse 'a container image is not the server image at this release'
          ;;
      esac
    done < <(jq -r '(.artifacts // {})[] | select(.type == "aws:cloudformation:stack") | [.properties.stackName, .properties.templateFile] | @tsv' "$dir/manifest.json")
  done < <(assembly_dirs "$root")
  [ "$services" -gt 0 ] || asset_refuse 'the assembly holds no Services template'
}`

// The AWS-side check (C11-D52, C11-D58, C11-D61, DPW-06): aws_check, after the preamble in the step right
// after the credentials action of every deploy job, called with the job's mode.
export const AWS_CHECK = sh`# What runs (AWS_CHECK; C11-D52, C11-D58, C11-D61; TECH-SPEC T24 items 4, 15 and 22): AWS's own
# answer, which no GitHub actor can write, read before anything moves: the Services stack's status and
# Release output (prod's for a restore, whose own stacks are never compared), the three services'
# deployments and the image each runs, and ECR's tags for a recorded digest. Called with the check's
# mode (deploy, rollback, drill, restore or auto, the pipeline's own rollback); reads STAGE, RELEASE
# (the release this job deploys, or for auto the one this run deployed), PREVIOUS (auto: the release it
# goes back to), REPLACED (auto: what the deploy job's own check found running, or none), FIRST (true
# when the gate found no release record) and, for a restore, RESTORE (up or down) from the environment.
# - No Services stack, or one a failed first create left with no Release, is no release, which only
#   a first deploy may find. A stack still moving, or a service with more than one deployment, waits;
#   one whose rollback failed refuses, since it waits for tier 2: a failed create's (ROLLBACK_FAILED),
#   or an update's (UPDATE_ROLLBACK_FAILED), which the CLI can't continue and would otherwise read as
#   settled, so a dispatch would move Platform, Data and Tasks and migrate before failing at Services.
# - deploy: what runs is on main at this run's commit. rollback: the target's digest isn't the one
#   running and its commit is strictly older. drill and restore=up: what runs is the release the gate
#   read (restore=down deploys only the restore stage's own stacks, so it compares no release). auto:
#   what runs is this run's release, or it outputs rolled=false and deploys nothing (another run
#   deployed since, or this release never went live); and the release this run's deploy replaced is
#   PREVIOUS or a later one (or none), or it outputs rolled=false too (a rollback, or a failed one,
#   left an older release live after the gate read the records, and PREVIOUS would move it forward).
# - Every mode but restore: no image in ECR is a later commit's than this run's (a deploy pushes before
#   it moves Platform, Data and Tasks and migrates, so no later commit can have moved them or migrated
#   the database since the gate read the floors at this commit, and no older commit's deploy goes over
#   a later one's, which GitHub's queue for a concurrency group doesn't keep in order); otherwise auto
#   outputs rolled=false and every other mode refuses, naming that commit. Only a first deploy, finding
#   no release, may find no image at all.
# - Drift (services running a digest other than Release's, as after an incident rollback outside the
#   pipeline) refuses a deploy and a drill, naming the rollback to what runs, and allows a rollback
#   only to the release all three services run.
# - Every recorded digest it deploys is in ECR under its own commit's tag (sha-<commit>-<run>-<attempt>).
# It writes go=true, or go=false, to the step's outputs (deploy and drill also replaced=<the release
# found running, or none>, for the rollback job's auto check), and one summary line through the filter.
aws_refuse() {
  echo "aws-check: $1" | mask
  exit 1
}
is_ancestor() { git merge-base --is-ancestor "$1" "$2" 2>/dev/null; }
release_shape() { [[ "$1" =~ ^[0-9a-f]{40}:sha256:[0-9a-f]{64}$ ]]; }
# Whether ECR holds the digest $2 under a tag of commit $1.
ecr_has() {
  local tags
  tags=$(get aws ecr describe-images --repository-name hearth-server --image-ids "imageDigest=$2" --query 'imageDetails[0].imageTags' --output json) || return 1
  jq -e --arg commit "$1" 'any(.[]?; test("^sha-" + $commit + "-[0-9]+-[0-9]+$"))' <<<"$tags" >/dev/null
}
aws_check() {
  local mode=$1 stage=$STAGE out status release='' running='' digests=() td image tag pushed='' commit
  [ "$stage" = restore ] && stage=prod
  release_shape "$RELEASE" || aws_refuse 'the release is not <commit>:<digest>'
  if ! out=$(get aws cloudformation describe-stacks --stack-name "Hearth-$stage-Services" --query 'Stacks[0].[StackStatus, Outputs[?OutputKey==\`Release\`].OutputValue | [0]]' --output json 2>&1); then
    case "$out" in
      *'does not exist'*) status=NONE ;;
      *) aws_refuse "the Services stack can't be read" ;;
    esac
  else
    status=$(jq -er '.[0] | select(type == "string" and test("^[A-Z_]{1,40}$"))' <<<"$out") || aws_refuse "the Services stack's status can't be read"
    release=$(jq -r '.[1] // ""' <<<"$out")
  fi
  if [ "$status" = NONE ] || { [ -z "$release" ] && [[ "$status" =~ ^(ROLLBACK_COMPLETE|REVIEW_IN_PROGRESS)$ ]]; }; then
    [ "$mode" = deploy ] && [ "$FIRST" = true ] || aws_refuse 'the Services stack holds no release, which only a first deploy may find'
    release=none
  else
    [ "$status" != ROLLBACK_FAILED ] ||
      aws_refuse "the Services stack is ROLLBACK_FAILED (a failed create whose rollback failed), which waits for tier 2 (deploy-and-rollback.md)"
    [ "$status" != UPDATE_ROLLBACK_FAILED ] ||
      aws_refuse "the Services stack is UPDATE_ROLLBACK_FAILED (an update whose rollback failed), which waits for tier 2 (deploy-and-rollback.md)"
    [[ "$status" != *_IN_PROGRESS ]] || aws_refuse 'a deployment is in progress: wait for it to settle, then dispatch again'
    release_shape "$release" || aws_refuse "the Services stack's Release output is malformed"
  fi
  case "$mode" in
    deploy)
      [ "$release" = none ] || is_ancestor "$\{release%%:*}" "$GITHUB_SHA" ||
        aws_refuse "what runs is not on main at this run's commit"
      ;;
    rollback)
      [ "$\{release#*:}" != "$\{RELEASE#*:}" ] || aws_refuse 'the target is the release running now'
      { [ "$\{release%%:*}" != "$\{RELEASE%%:*}" ] && is_ancestor "$\{RELEASE%%:*}" "$\{release%%:*}"; } ||
        aws_refuse 'the target is not strictly older than the release running now'
      ;;
    drill)
      [ "$release" = "$RELEASE" ] || aws_refuse 'what runs is not the release the gate read'
      ;;
    restore)
      [ "$\{RESTORE:-}" = down ] || [ "$release" = "$RELEASE" ] || aws_refuse 'what runs is not the release the gate read'
      ;;
    auto)
      release_shape "$PREVIOUS" || aws_refuse 'the previous release is not <commit>:<digest>'
      if [ "$release" != "$RELEASE" ]; then
        printf 'go=false\nrolled=false\n' >>"$GITHUB_OUTPUT"
        echo "aws-check: auto: this run's release isn't what runs (another run deployed since, or it never went live), so nothing is rolled back" |
          mask | tee -a "$GITHUB_STEP_SUMMARY"
        return 0
      fi
      if [ "$\{REPLACED:-}" != none ] &&
        ! { release_shape "$\{REPLACED:-}" && { [ "$\{PREVIOUS%%:*}" = "$\{REPLACED%%:*}" ] || is_ancestor "$\{PREVIOUS%%:*}" "$\{REPLACED%%:*}"; }; }; then
        printf 'go=false\nrolled=false\n' >>"$GITHUB_OUTPUT"
        echo "aws-check: auto: this run's deploy replaced $\{REPLACED:-a release it never named}, not the previous release ($PREVIOUS) or a later one (a rollback, or a failed one, left an older release live after the gate read the records), so nothing is rolled back: dispatch mode=rollback (deploy-and-rollback.md)" |
          mask | tee -a "$GITHUB_STEP_SUMMARY"
        return 0
      fi
      ;;
    *) aws_refuse 'the mode is not deploy, rollback, drill, restore or auto' ;;
  esac
  # Nothing moves while a later commit than this run's, at which the gate read the floors, can have moved
  # the stacks or migrated the database: every image's commit (its tag's, sha-<commit>-<run>-<attempt>) is
  # this run's or an ancestor of it, since a deploy pushes its image before it moves anything and nothing
  # else pushes. A restore deploys only the restore stage's own stacks, so it reads no image's commit.
  if [ "$mode" != restore ]; then
    out=$(get aws ecr describe-images --repository-name hearth-server --query 'imageDetails[].imageTags[]' --output json) ||
      aws_refuse "ECR's image tags can't be read"
    jq -e 'type == "array"' <<<"$out" >/dev/null || aws_refuse "ECR's image tags can't be read"
    jq -e 'length > 0' <<<"$out" >/dev/null || [ "$release" = none ] ||
      aws_refuse 'ECR holds no image, which only a first deploy may find'
    while IFS= read -r commit; do
      is_ancestor "$commit" "$GITHUB_SHA" || pushed=$commit
    done < <(jq -r '[.[] | strings | capture("^sha-(?<c>[0-9a-f]{40})-[0-9]+-[0-9]+$").c] | unique[]' <<<"$out")
    if [ -n "$pushed" ]; then
      case "$mode" in
        rollback) aws_refuse "a later commit ($pushed) pushed an image, so it may have migrated the database: check the floors at it (deploy-and-rollback.md)" ;;
        deploy | drill) aws_refuse "a later commit ($pushed) pushed an image, so it may have moved the stacks or migrated the database: dispatch again from main's head (deploy-and-rollback.md)" ;;
      esac
      printf 'go=false\nrolled=false\n' >>"$GITHUB_OUTPUT"
      echo "aws-check: auto: a later commit ($pushed) pushed an image, so it may have migrated the database, and nothing is rolled back: check the floors at it (deploy-and-rollback.md)" |
        mask | tee -a "$GITHUB_STEP_SUMMARY"
      return 0
    fi
  fi
  # The three services: one deployment each, and the image each runs (a restore leaves prod's alone).
  if [ "$mode" != restore ]; then
    if ! out=$(get aws ecs describe-services --cluster "hearth-$stage" --services "hearth-$stage-api" "hearth-$stage-realtime" "hearth-$stage-worker" --query '{services: services[?status!=\`INACTIVE\`].deployments[].taskDefinition, counts: services[?status!=\`INACTIVE\`].length(deployments)}' --output json 2>&1); then
      case "$out" in
        *ClusterNotFoundException*) out='{"services": [], "counts": []}' ;;
        *) aws_refuse "the services can't be read" ;;
      esac
    fi
    if [ "$release" = none ]; then
      jq -e '(.counts | length) == 0' <<<"$out" >/dev/null || aws_refuse 'the services run, but the Services stack holds no release'
    else
      jq -e '(.counts | length) == 3' <<<"$out" >/dev/null || aws_refuse 'a service is missing'
      jq -e 'all(.counts[]; . == 1)' <<<"$out" >/dev/null ||
        aws_refuse 'a deployment is in progress: wait for it to settle, then dispatch again'
      while IFS= read -r td; do
        image=$(get aws ecs describe-task-definition --task-definition "$td" --query "taskDefinition.containerDefinitions[?name=='server'].image | [0]" --output text)
        [[ "$\{image##*@}" =~ ^sha256:[0-9a-f]{64}$ ]] || aws_refuse "a service's image isn't named by its digest"
        digests+=("$\{image##*@}")
      done < <(jq -r '.services[]' <<<"$out")
      [ "$\{#digests[@]}" = 3 ] || aws_refuse "a service's deployment can't be read"
      running=$(printf '%s\n' "$\{digests[@]}" | sort -u)
      if [ "$running" != "$\{release#*:}" ]; then
        case "$mode" in
          rollback)
            [ "$running" = "$\{RELEASE#*:}" ] ||
              aws_refuse "the services don't run Release's image, so a rollback may go only to the release all three run"
            ;;
          deploy | drill)
            tag=$(get aws ecr describe-images --repository-name hearth-server --image-ids "imageDigest=$\{digests[0]}" --query 'imageDetails[0].imageTags' --output json 2>/dev/null | jq -r 'first(.[]? | capture("^sha-(?<c>[0-9a-f]{40})-").c) // ""' || true)
            aws_refuse "the services don't run Release's image (an incident rollback outside the pipeline): dispatch mode=rollback with release $\{tag:-the commit whose image they run} first (deploy-and-rollback.md)"
            ;;
        esac
      fi
    fi
  fi
  # Every recorded digest this job deploys is in ECR under its own commit's tag.
  case "$mode" in
    rollback | drill | restore) ecr_has "$\{RELEASE%%:*}" "$\{RELEASE#*:}" || aws_refuse "ECR holds no image of the release under its commit's tag" ;;
    auto) ecr_has "$\{PREVIOUS%%:*}" "$\{PREVIOUS#*:}" || aws_refuse "ECR holds no image of the previous release under its commit's tag" ;;
  esac
  echo 'go=true' >>"$GITHUB_OUTPUT"
  case "$mode" in
    deploy | drill) echo "replaced=$release" >>"$GITHUB_OUTPUT" ;;
  esac
  echo "aws-check: $mode passed: Hearth-$stage-Services is $status and runs $release" | mask | tee -a "$GITHUB_STEP_SUMMARY"
}`

// The Tasks stack's outputs (C11-D40, C11-D53, DPW-06), read afresh by each one-off's step: the cluster, the
// isolated subnets, each kind's group and definition (family:revision), and HasDatabase.
export const TASKS_OUTPUTS = sh`# The Tasks stack's outputs (C11-D40, C11-D53): the cluster, the isolated subnets, the migrate and
# probe groups and definitions, and whether the environment has its database yet, each checked by
# its shape. A definition is kept as family:revision, never its ARN, and nothing here is printed.
tasks_outputs() {
  local outputs kind definition
  outputs=$(get aws cloudformation describe-stacks --stack-name "Hearth-$STAGE-Tasks" --query 'Stacks[0].Outputs' --output json)
  output() { jq -er --arg key "$1" 'first(.[] | select(.OutputKey == $key) | .OutputValue | select(type == "string"))' <<<"$outputs"; }
  CLUSTER=$(output Cluster)
  ISOLATED_SUBNETS=$(output IsolatedSubnets)
  MIGRATE_SG=$(output MigrateSecurityGroup)
  PROBE_SG=$(output ProbeSecurityGroup)
  HAS_DATABASE=$(output HasDatabase)
  if [ "$CLUSTER" != "hearth-$STAGE" ] || ! [[ "$ISOLATED_SUBNETS" =~ ^subnet-[0-9a-f]{8,17}(,subnet-[0-9a-f]{8,17}){0,15}$ ]] ||
    ! [[ "$MIGRATE_SG" =~ ^sg-[0-9a-f]{8,17}$ && "$PROBE_SG" =~ ^sg-[0-9a-f]{8,17}$ && "$HAS_DATABASE" =~ ^(true|false)$ ]]; then
    echo "tasks: Hearth-$STAGE-Tasks's outputs aren't of their shapes" | mask
    exit 1
  fi
  for kind in migrate probe; do
    definition=$(output "$\{kind^}TaskDefinition")
    if [[ "$definition" != *":task-definition/hearth-$STAGE-$kind:"* || ! "$\{definition##*/}" =~ ^hearth-$STAGE-$kind:[1-9][0-9]{0,5}$ ]]; then
      echo "tasks: Hearth-$STAGE-Tasks's $kind definition isn't hearth-$STAGE-$kind's" | mask
      exit 1
    fi
    printf -v "$\{kind^^}_TD" '%s' "$\{definition##*/}"
  done
}
tasks_outputs`

// The probe's targets (C11-D53; TECH-SPEC T24 items 5 and 15, DPW-06): each service's PRIMARY deployment's
// running tasks, by their typed addresses.
export const TARGETS_QUERY = sh`tasks[?startedBy=='$DEPLOYMENT' && lastStatus=='RUNNING'][].containers[?name=='server'][].networkInterfaces[].privateIpv4Address`

// The probe's one override (DPW-06): PROBE_TARGETS alone, since A7 watches every other override key.
export const OVERRIDES_JQ = sh`OVERRIDES=$(jq -nc --arg t "$TARGETS" '{containerOverrides:[{name:"server",environment:[{name:"PROBE_TARGETS",value:$t}]}]}')`

// The lines a one-off may print (C11-D52, DPW-06): migrate's own, and the probe's (ready-probe.ts's), each
// matched whole; any other line is withheld and counted.
export const MIGRATE_LINES = sh`^migrate: (applied|rolled back|failed) [0-9]{4}_[a-z0-9_]+$|^migrate: nothing to apply$|^migrate: nothing was applied; the batch rolled back$`

export const PROBE_LINES = sh`^(api|realtime|worker) [0-9]+ ([0-9]{3}|no-answer) (-|([a-z_]{1,32}|\?)(,([a-z_]{1,32}|\?))*)$|^probe: failed$`

// A one-off's end (C11-D52, DPW-06): one task placed, two bounded waits, then stop-task, and only exit 0
// with EssentialContainerExited passes; only lines of the kind's pattern are printed.
export const ONE_OFF = sh`# A one-off's end (C11-D52; TECH-SPEC T24 items 11 and 15): ECS placed exactly one task; a bounded wait
# for it to stop, then a second; one that still runs is stopped, waited for, and fails the job, so no
# one-off outlives the job's view of it. Only exit 0 with EssentialContainerExited passes. Only the
# log lines that match the kind's pattern are printed (never an address or an error's text), with a
# count of those withheld.
MIGRATE_LINES='${MIGRATE_LINES}'
PROBE_LINES='${PROBE_LINES}'
one_off_end() {
  local kind=$1 lines=$2 placed=$3 task ended log shown='' withheld=0 stopped=0 stopping
  if ! jq -e '.failures == 0 and (.tasks | length) == 1' <<<"$placed" >/dev/null; then
    echo "$kind: ECS didn't place exactly one task" | mask
    exit 1
  fi
  task=$(jq -r '.tasks[0]' <<<"$placed")
  if [[ "$task" != *":task/$CLUSTER/"* || ! "$\{task##*/}" =~ ^[0-9a-f]{32}$ ]]; then
    echo "$kind: the task isn't one of $CLUSTER's" | mask
    exit 1
  fi
  if ! run aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$task" && ! run aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$task"; then
    stopped=1
    stopping=$(get aws ecs stop-task --cluster "$CLUSTER" --task "$task" --reason 'the deploy job stopped waiting for it' --query 'task.desiredStatus' --output text)
    echo "$kind: the task didn't stop in time, so it is $stopping" | mask
    run aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$task"
  fi
  ended=$(get aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$task" --query 'tasks[0].{exit: containers[0].exitCode, stop: stopCode}' --output json)
  if log=$(get aws logs get-log-events --log-group-name "/hearth/$STAGE/$kind" --log-stream-name "$kind/server/$\{task##*/}" --start-from-head --query 'events[].message' --output json); then
    shown=$(jq -r '.[]' <<<"$log" | grep -E "$lines" || true)
    withheld=$(jq --argjson shown "$(printf '%s' "$shown" | grep -c '^' || true)" 'length - $shown' <<<"$log" || true)
  fi
  if [ -n "$shown" ]; then printf '%s\n' "$shown" | mask | tee -a "$GITHUB_STEP_SUMMARY"; fi
  echo "$kind: $withheld log lines withheld" | mask | tee -a "$GITHUB_STEP_SUMMARY"
  if [ "$stopped" = 1 ] || ! jq -e '.exit == 0 and .stop == "EssentialContainerExited"' <<<"$ended" >/dev/null; then
    echo "$kind: failed (exit $(jq -r '.exit // "none"' <<<"$ended"), stop code $(jq -r '.stop // "none"' <<<"$ended"))" | mask | tee -a "$GITHUB_STEP_SUMMARY"
    exit 1
  fi
}`

// The one-off runs' network configurations (C11-D52; TECH-SPEC T24 items 11 and 13, DPW-06): each kind's own
// group, the isolated subnets, no public IP.
export const NET_JQ = {
  migrate: sh`NET_MIGRATE=$(jq -nc --arg s "$ISOLATED_SUBNETS" --arg g "$MIGRATE_SG" '{awsvpcConfiguration:{subnets:($s|split(",")),securityGroups:[$g],assignPublicIp:"DISABLED"}}')`,
  probe: sh`NET_PROBE=$(jq -nc --arg s "$ISOLATED_SUBNETS" --arg g "$PROBE_SG" '{awsvpcConfiguration:{subnets:($s|split(",")),securityGroups:[$g],assignPublicIp:"DISABLED"}}')`,
} as const

// The one-off runs (C11-D52, C11-D53; TECH-SPEC T24 items 11, 13 and 15, DPW-06): Fargate, one task of the
// Tasks stack's definition, its kind's network configuration, the definition's tags, started by the run and
// with the job's own client token; the probe's alone with its override.
export const RUN_TASK_MIGRATE = sh`RUN=$(get aws ecs run-task --cluster "$CLUSTER" --task-definition "$MIGRATE_TD" --launch-type FARGATE --platform-version LATEST --count 1 --network-configuration "$NET_MIGRATE" --propagate-tags TASK_DEFINITION --started-by "gha-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" --client-token "$TOKEN" --query '{failures: length(failures), tasks: tasks[].taskArn}' --output json)`
export const RUN_TASK_PROBE = sh`RUN=$(get aws ecs run-task --cluster "$CLUSTER" --task-definition "$PROBE_TD" --launch-type FARGATE --platform-version LATEST --count 1 --network-configuration "$NET_PROBE" --propagate-tags TASK_DEFINITION --started-by "gha-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" --client-token "$TOKEN" --overrides "$OVERRIDES" --query '{failures: length(failures), tasks: tasks[].taskArn}' --output json)`

// The probe's run (C11-D53, DPW-06): its targets, its override, its network configuration and run-task line,
// then the one-off's end.
export const PROBE = sh`# The readiness probe (C11-D53; TECH-SPEC T24 items 5 and 15). Its one override is PROBE_TARGETS: each
# service's new tasks, its PRIMARY deployment's running ones by their typed addresses, as many as its
# desired count, never printed. Its gate is the definition's own --gate= argument, never overridden.
# Any exit but 0 fails the release.
TARGETS=''
for ROLE in api realtime worker; do
  SERVICE=$(get aws ecs describe-services --cluster "$CLUSTER" --services "hearth-$STAGE-$ROLE" --query 'services[0].{desired: desiredCount, deployment: deployments[?status==\`PRIMARY\`] | [0].id}' --output json)
  DESIRED=$(jq -er '.desired | select(type == "number" and . >= 0)' <<<"$SERVICE")
  [ "$DESIRED" -gt 0 ] || continue
  DEPLOYMENT=$(jq -er '.deployment | select(type == "string" and test("^ecs-svc/[0-9]{1,32}$"))' <<<"$SERVICE")
  ARNS=$(get aws ecs list-tasks --cluster "$CLUSTER" --service-name "hearth-$STAGE-$ROLE" --desired-status RUNNING --query 'taskArns' --output json)
  mapfile -t TASK_ARNS < <(jq -r '.[]' <<<"$ARNS")
  if [ "$\{#TASK_ARNS[@]}" = 0 ]; then
    echo "probe: hearth-$STAGE-$ROLE runs no task" | mask
    exit 1
  fi
  # The [] after the task filter ends its projection, so the container filter runs on each task's list.
  ADDRESSES=$(get aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$\{TASK_ARNS[@]}" --query "${TARGETS_QUERY}" --output json)
  if ! jq -e --argjson n "$DESIRED" 'length == $n and all(.[]; type == "string" and test("^[0-9]{1,3}([.][0-9]{1,3}){3}$"))' <<<"$ADDRESSES" >/dev/null; then
    echo "probe: hearth-$STAGE-$ROLE's new running tasks aren't its desired count" | mask
    exit 1
  fi
  TARGETS=$(jq -r --arg role "$ROLE" --arg before "$TARGETS" '[($before | select(. != "")), (.[] | "\($role)=\(.):3000")] | join(",")' <<<"$ADDRESSES")
done
if [ -z "$TARGETS" ]; then
  echo 'probe: every service wants 0 tasks, so there is nothing to probe' | mask
  exit 1
fi
${OVERRIDES_JQ}
${NET_JQ.probe}
${RUN_TASK_PROBE}
one_off_end probe "$PROBE_LINES" "$RUN"`
// What a step that runs a one-off holds after its preamble (C11-D52, C11-D53, DPW-06): for the probe, its
// job's TOKEN, the Tasks outputs, the one-off's end and the probe's run; for migrate (nonprod and prod,
// a deploy alone), the Tasks outputs, the one-off's end, then its run below and the migration record.
export type Stage = 'nonprod' | 'prod'

export const tokenLine = (kind: 'migrate' | 'probe', environment: Stage, job: 'deploy' | 'rollback') =>
  `TOKEN="${kind}-${environment}-${job}-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"`

export const probeRun = (environment: Stage, job: 'deploy' | 'rollback') =>
  [PREAMBLE, tokenLine('probe', environment, job), TASKS_OUTPUTS, ONE_OFF, PROBE].join('\n')

export const migrateRun = (
  environment: Stage,
) => sh`# Migrate (C11-D52; TECH-SPEC T24 item 15): only for a deploy, only once the environment has its
# database (HasDatabase, from C0.12), after the push and before Services, with no override.
if [ "$HAS_DATABASE" != true ]; then
  echo 'migrate: skipped, since the environment has no database yet' | mask | tee -a "$GITHUB_STEP_SUMMARY"
  exit 0
fi
${tokenLine('migrate', environment, 'deploy')}
${NET_JQ.migrate}
${RUN_TASK_MIGRATE}
one_off_end migrate "$MIGRATE_LINES" "$RUN"`

// The fast re-checks' reader (C11-D52, C11-D58, DPW-08): an environment's newest release record, its
// payload checked as history.ts checks it (each pattern held to the whole string by \A and \z, since
// jq's $ also matches before a final newline, where JavaScript's doesn't), in its order (the api's
// revision, then the deployment's id), and one line in the log naming each record it ignores (the gate's
// and prod-gate's summaries name it too, from history.ts's own line).
export const NEWEST_RELEASE = sh`newest_release() {
  local records
  records=$(gh api "repos/$REPO/deployments?environment=$1&task=hearth-release&per_page=100" | jq -c --arg environment "$1" '
    [.[] | select(.task == "hearth-release" and .environment == $environment)
      | {id, payload, valid: (
          (.payload | type == "object")
          and (.payload | keys) == ["commit", "digest", "kind", "migratedCommit", "schema", "services"]
          and .payload.schema == 1
          and (.payload.kind | IN("deploy", "rollback", "pipeline-rollback"))
          and (.payload.commit | type == "string" and test("\\A[0-9a-f]{40}\\z"))
          and (.payload.digest | type == "string" and test("\\Asha256:[0-9a-f]{64}\\z"))
          and (.payload.migratedCommit == null or (.payload.migratedCommit | type == "string" and test("\\A[0-9a-f]{40}\\z")))
          and (.payload.services | type == "object" and keys == ["api", "realtime", "worker"])
          and all(.payload.services | to_entries[]; .key as $role | .value | type == "string" and test("\\Ahearth-" + $environment + "-" + $role + ":[1-9][0-9]{0,5}\\z")))}]
    | {ignored: [.[] | select(.valid | not) | .id],
      newest: ([.[] | select(.valid) | {id, commit: .payload.commit, revision: (.payload.services.api | split(":")[1] | tonumber)}] | sort_by(.revision, .id) | last)}') || return
  jq -r --arg environment "$1" '.ignored[] | "fast re-check: ignored hearth-release record \(.) in \($environment): its payload fails validation"' <<<"$records" >&2 || return
  jq -c .newest <<<"$records"
}`

// The gate's read of a deploy's pull request (C11-D49, DPW-08): the merged pull request whose merge commit
// is this run's, its head's tree and its ci.yml run's check and migrations, read from the newest such run
// on its own head repository and branch (never another fork's at the same commit) and its jobs, for
// history.ts plan to decide.
export const PULL_CHECKS = sh`set -euo pipefail
# For a deploy (C11-D49): the merged pull request into main whose merge commit is this run's, its
# head's tree, and the conclusions of its ci.yml run's check and migrations jobs on that head (the
# newest such run from the pull request's own head repository and branch, so another fork's pull
# request at the same commit is never read; its path read without any @<ref> GitHub adds, and read
# from the run and its jobs, never from a check run, which any token with checks: write can make).
# history.ts plan decides; no merged pull request writes pull: null.
if [ "$\{MODE:-deploy}" != deploy ] || [ "$TARGET" = restore ]; then exit 0; fi
PULLS=$(gh api "repos/$REPO/commits/$SHA/pulls")
PULL=$(jq -c --arg sha "$SHA" '[.[] | select(.merged_at != null and .base.ref == "main" and .merge_commit_sha == $sha)] | if length == 1 then .[0] else null end' <<<"$PULLS")
if [ "$PULL" = null ]; then
  jq -n '{pull: null, base: "", mergeCommit: "", headTree: "", check: "", migrations: ""}' >"$RUNNER_TEMP/checks.json"
  exit 0
fi
HEAD=$(jq -er '.head.sha | select(test("^[0-9a-f]{40}$"))' <<<"$PULL")
TREE=$(gh api "repos/$REPO/git/commits/$HEAD" --jq .tree.sha)
RUNS=$(gh api "repos/$REPO/actions/runs?head_sha=$HEAD&event=pull_request&per_page=100")
RUN_ID=$(jq -r --arg head "$HEAD" --argjson pull "$PULL" '[.workflow_runs[] | select((.path | sub("@.*$"; "")) == ".github/workflows/ci.yml" and .head_sha == $head and ($pull.head.repo.id | type == "number") and .head_repository.id == $pull.head.repo.id and .head_branch == $pull.head.ref)] | max_by(.id) | .id // ""' <<<"$RUNS")
JOBS='{"jobs": []}'
if [ -n "$RUN_ID" ]; then JOBS=$(gh api "repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100"); fi
jq -n --argjson pull "$PULL" --arg tree "$TREE" --argjson jobs "$JOBS" '
  def conclusion($name): [$jobs.jobs[] | select(.name == $name)] | if length == 1 then (.[0].conclusion // "pending") else "missing" end;
  {pull: $pull.number, base: $pull.base.ref, mergeCommit: $pull.merge_commit_sha, headTree: $tree, check: conclusion("check"), migrations: conclusion("migrations")}' >"$RUNNER_TEMP/checks.json"`

// prod-gate's wait for main's own CI (C11-D52, DPW-08): ci.yml's push run on main for this commit, its check
// and migrations jobs, until both succeed.
export const MAIN_CI = sh`set -euo pipefail
# main's own CI on this commit (C11-D52): ci.yml's push run on main (its path read without any @<ref>
# GitHub adds), the newest, read from the run and its jobs (never a check run, which any token with
# checks: write can make), until check and migrations both succeed; any other conclusion fails at
# once, and 30 minutes ends the wait.
DEADLINE=$((SECONDS + 30 * 60))
while :; do
  RUNS=$(gh api "repos/$REPO/actions/runs?head_sha=$SHA&event=push&branch=main&per_page=100")
  RUN_ID=$(jq -r --arg sha "$SHA" '[.workflow_runs[] | select((.path | sub("@.*$"; "")) == ".github/workflows/ci.yml" and .head_sha == $sha)] | max_by(.id) | .id // ""' <<<"$RUNS")
  if [ -n "$RUN_ID" ]; then
    JOBS=$(gh api "repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100")
    CONCLUSIONS=$(jq -r '[("check", "migrations") as $name | [.jobs[] | select(.name == $name)] | if length == 1 then (.[0].conclusion // "pending") else "pending" end] | join(" ")' <<<"$JOBS")
    if [ "$CONCLUSIONS" = 'success success' ]; then break; fi
    for CONCLUSION in $CONCLUSIONS; do
      case "$CONCLUSION" in
        success | pending) ;;
        *)
          echo "prod-gate: main's CI on this commit concluded $CONCLUSION"
          exit 1
          ;;
      esac
    done
  fi
  if [ "$SECONDS" -ge "$DEADLINE" ]; then
    echo "prod-gate: main's CI on this commit didn't succeed within 30 minutes"
    exit 1
  fi
  sleep 30
done
echo "prod-gate: main's check and migrations passed on this commit" >>"$GITHUB_STEP_SUMMARY"`

// prod-gate's call of history.ts prod-gate (C11-D52, C11-D58, DPW-08), with the mode.
export const PROD_GATE_CALL = sh`set -euo pipefail
# history.ts prod-gate (C11-D52, C11-D58): a deploy's commit descends from prod's newest release and its
# image is the one non-prod deployed in this run; a rollback's target is still recorded, on main, at
# the gate's digest and above every floor at this commit; a restore's record is the one the gate read.
# Each record history.ts ignores gets one line naming its id (its stderr), in the log and the summary.
if ! OUT=$(node infra/scripts/deploy/history.ts prod-gate --mode "$MODE" --target "$TARGET" --sha "$SHA" --commit "$COMMIT" --digest "$DIGEST" --record-id "$CURRENT_PROD_ID" --build-digest "$BUILD_DIGEST" --nonprod-digest "$NONPROD_DIGEST" --records "$RUNNER_TEMP/records" 2>"$RUNNER_TEMP/prod-gate-ignored.txt"); then
  tee -a "$GITHUB_STEP_SUMMARY" <"$RUNNER_TEMP/prod-gate-ignored.txt" >&2
  printf '%s\n' "$OUT"
  exit 1
fi
tee -a "$GITHUB_STEP_SUMMARY" <"$RUNNER_TEMP/prod-gate-ignored.txt" >&2
if ! [[ "$OUT" =~ ^current_prod_id=[0-9]*$ ]]; then
  echo 'prod-gate: history.ts printed something else'
  exit 1
fi
echo "$OUT" >>"$GITHUB_OUTPUT"`

// The fast re-checks (C11-D52, DPW-08), before the credentials: the newest release record read again; a
// deploy's ancestry (and in prod both digests), any other mode's record id (in prod every mode's, after
// it holds a prod deploy's or rollback's approval to prod-plan's diff of this attempt).
export const FAST_RECHECK_NONPROD = sh`set -euo pipefail
# The fast re-check (C11-D52), before the credentials: non-prod's newest release record, read again
# and checked by its shape. A deploy's commit descends from it (none on a first deploy); any other
# mode finds the record the gate read.
${NEWEST_RELEASE}
newest=$(newest_release nonprod)
if [ "$MODE" = deploy ]; then
  if [ "$newest" != null ] && ! git merge-base --is-ancestor "$(jq -r .commit <<<"$newest")" "$GITHUB_SHA"; then
    echo "fast re-check: nonprod's newest release isn't an ancestor of this commit"
    exit 1
  fi
elif [ "$(jq -r '.id // ""' <<<"$newest")" != "$RECORD_ID" ]; then
  echo "fast re-check: nonprod's release records changed since the gate read them"
  exit 1
fi`
export const FAST_RECHECK_PROD = sh`set -euo pipefail
# The fast re-check (C11-D52), after the approval and before the credentials. A prod deploy or
# rollback is approved against the diff prod-plan read in this attempt: a re-run of this job alone,
# or of the failed jobs, keeps an earlier attempt's diff (and prod-gate's read, unless prod-gate
# was re-run too), so it refuses, and re-running prod-plan re-runs prod-gate and this job after it.
# Then prod's newest release record, read again and checked by its shape, is the one prod-gate
# read; a deploy's commit descends from it (none on a first deploy) and its image is the one the
# build made and non-prod deployed in this run.
if [ "$TARGET" = prod ] && [ "$PLAN_ATTEMPT" != "$GITHUB_RUN_ATTEMPT" ]; then
  echo "fast re-check: prod-plan's diff is from another attempt of this run: re-run prod-plan, which re-runs prod-gate and this job after it, or dispatch afresh"
  exit 1
fi
${NEWEST_RELEASE}
newest=$(newest_release prod)
if [ "$(jq -r '.id // ""' <<<"$newest")" != "$RECORD_ID" ]; then
  echo "fast re-check: prod's release records changed since prod-gate read them"
  exit 1
fi
if [ "$MODE" = deploy ] && [ "$TARGET" = prod ]; then
  if [ "$newest" != null ] && ! git merge-base --is-ancestor "$(jq -r .commit <<<"$newest")" "$GITHUB_SHA"; then
    echo "fast re-check: prod's newest release isn't an ancestor of this commit"
    exit 1
  fi
  if ! [[ "$BUILD_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || [ "$BUILD_DIGEST" != "$NONPROD_DIGEST" ]; then
    echo "fast re-check: the image isn't the one the build made and non-prod deployed"
    exit 1
  fi
fi`

// A smoke's first lines after set -euo pipefail (C11-D54, DPW-08): it judges only the read-back its deploy
// or rollback job wrote in this attempt, since a smoke re-run alone keeps that job's outputs from an
// earlier attempt while what runs may have changed since (a rollback, say).
export const SMOKE_ATTEMPT = sh`# The read-back is the one its job wrote in this attempt: re-run alone, this smoke would judge an
# earlier attempt's while what runs may have changed since (a rollback, say), so it refuses.
if [ "$ATTEMPT" != "$GITHUB_RUN_ATTEMPT" ]; then
  echo 'smoke: the read-back is from another attempt of this run: re-run the job that wrote it, or dispatch afresh'
  exit 1
fi`

// The CLI's lines (C11-D52, C11-D59, C11-D76; TECH-SPEC T24 items 11 and 18, DPW-06, DPW-10): one per shape,
// each naming its stacks through "$STAGE", which its job sets once, and its folder through "$ASSEMBLY",
// which its step sets once; every deploy with --exclusively.
const DEPLOY_FLAGS = '--exclusively --require-approval never --no-lookups --no-notices --ci --progress events'
export const CDK_DEPLOY_FORWARD = `run "$CDK" deploy --app "$ASSEMBLY" "$STAGE/Platform" "$STAGE/Data" "$STAGE/Tasks" --exclusively --concurrency 2 --require-approval never --no-lookups --no-notices --ci --progress events`
export const CDK_DEPLOY_SERVICES = `run "$CDK" deploy --app "$ASSEMBLY" "$STAGE/Services" ${DEPLOY_FLAGS}`
export const CDK_DEPLOY_DRILL = `if ${CDK_DEPLOY_SERVICES}; then`
export const CDK_DEPLOY_ROLLBACK = `run "$CDK" deploy --app "$ASSEMBLY" "$STAGE/Tasks" "$STAGE/Services" ${DEPLOY_FLAGS}`
export const CDK_DEPLOY_DOWN = `run "$CDK" deploy --app "$ASSEMBLY" "$STAGE/$PART" ${DEPLOY_FLAGS}`
export const CDK_DIFF_PROD = `run "$CDK" diff --app "$ASSEMBLY" "$STAGE/*" --method template --no-lookups --no-notices --no-color --fail-on never`
export const CDK_DIFF_ROLLBACK = `run "$CDK" diff --app "$ASSEMBLY" "$STAGE/Tasks" "$STAGE/Services" --exclusively --method template --no-lookups --no-notices --no-color --fail-on never`
// restore=down (C11-D45; TECH-SPEC T24 item 18, DPW-06): Services, then Data, then Platform, one call each,
// each only for a restore stack that exists and has settled; one a failed create left (ROLLBACK_COMPLETE,
// or REVIEW_IN_PROGRESS, which never settles) is skipped, and one whose rollback failed too
// (ROLLBACK_FAILED, which the CLI would delete and create again) is skipped and fails the step after the
// others are down.
export const RESTORE_DOWN = sh`KEPT=''
for PART in Services Data Platform; do
  if ! STATUS=$(get aws cloudformation describe-stacks --stack-name "Hearth-$STAGE-$PART" --query 'Stacks[0].StackStatus' --output text 2>&1); then
    case "$STATUS" in
      *'does not exist'*)
        echo "restore down: Hearth-$STAGE-$PART doesn't exist, so it is skipped" | mask | tee -a "$GITHUB_STEP_SUMMARY"
        continue
        ;;
      *)
        echo "restore down: Hearth-$STAGE-$PART can't be read" | mask
        exit 1
        ;;
    esac
  fi
  case "$STATUS" in
    ROLLBACK_COMPLETE | REVIEW_IN_PROGRESS)
      echo "restore down: Hearth-$STAGE-$PART is what a failed create left, so it is skipped" | mask | tee -a "$GITHUB_STEP_SUMMARY"
      continue
      ;;
    ROLLBACK_FAILED)
      echo "restore down: Hearth-$STAGE-$PART is ROLLBACK_FAILED (a failed create whose rollback failed), so it is skipped: it may hold billed resources and waits for tier 2" | mask | tee -a "$GITHUB_STEP_SUMMARY"
      KEPT="$KEPT Hearth-$STAGE-$PART"
      continue
      ;;
    *_IN_PROGRESS)
      echo "restore down: Hearth-$STAGE-$PART is $STATUS: wait for it to settle, then dispatch again" | mask
      exit 1
      ;;
  esac
  ${CDK_DEPLOY_DOWN}
done
if [ -n "$KEPT" ]; then
  echo "restore down: the restore stage isn't down: tier 2 deletes$KEPT (deploy-and-rollback.md)" | mask | tee -a "$GITHUB_STEP_SUMMARY"
  exit 1
fi`

// The push (C11-D50, C11-D79, DPW-07, DPW-13): the login, the only skopeo line not through run, and the copy
// of the build's own archive, its digest kept, to this run's own tag.
export const SKOPEO_LOGIN = `get aws ecr get-login-password --region ap-southeast-1 | skopeo login --username AWS --password-stdin "$REGISTRY" 2>&1 | mask`
export const SKOPEO_COPY = `run skopeo copy --preserve-digests --digestfile "$RUNNER_TEMP/pushed" "oci-archive:$RUNNER_TEMP/image/image.tar:build" "docker://$REGISTRY/hearth-server:sha-$COMMIT-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"`

// The pipeline's synth (C11-D51; TECH-SPEC T24 item 10, DPW-13): the release's, with a drill-break's
// context or a restore up's restoreActive by mode, and each previous release's, each into its own folder.
export const SYNTH_LINES: readonly string[] = [
  'CONTEXT=()',
  'if [ "$MODE" = drill-break ]; then CONTEXT=(-c drill=break:nonprod); fi',
  'if [ "$RESTORE" = up ]; then CONTEXT=(-c restoreActive=true); fi',
  sh`npm run synth -w @hearth/infra -- -c release="$COMMIT:$DIGEST" "$\{CONTEXT[@]}" -o "$RUNNER_TEMP/assembly"`,
  'npm run synth -w @hearth/infra -- -c release="$COMMIT:$DIGEST" -o "$RUNNER_TEMP/assembly-previous-nonprod"',
  'npm run synth -w @hearth/infra -- -c release="$COMMIT:$DIGEST" -o "$RUNNER_TEMP/assembly-previous-prod"',
]

// --- The workflow's jobs, as the cases read them ------------------------------------------------------

export type Finding = string
export type Texts = ReadonlyMap<string, string>

export const DEPLOY = '.github/workflows/deploy.yml'
export const CI = '.github/workflows/ci.yml'
export const RULESET = '.github/rulesets/protect-main.json'
export const ENVIRONMENTS_DIR = '.github/environments'
export const PROTECT_ENVIRONMENTS = 'scripts/protect-environments.sh'

// The fifteen jobs, in the workflow's order (C11-D47 to C11-D52, T24 item 20).
export const JOB_IDS = [
  'gate',
  'build',
  'synth',
  'nonprod',
  'smoke-nonprod',
  'rollback-nonprod',
  'resmoke-nonprod',
  'record-nonprod',
  'prod-plan',
  'prod-gate',
  'prod',
  'smoke-prod',
  'rollback-prod',
  'resmoke-prod',
  'record-prod',
] as const
export type JobId = (typeof JOB_IDS)[number]

// The five jobs that name a GitHub environment, which only they may, and so the only ones that hold AWS
// credentials (C11-D55, C11-D56, DPW-03).
export const ENVIRONMENT_JOBS: Readonly<Record<string, string>> = {
  nonprod: 'nonprod',
  'rollback-nonprod': 'nonprod',
  'prod-plan': 'prod-plan',
  prod: 'prod',
  'rollback-prod': 'prod',
}
const CREDENTIALED: readonly string[] = Object.keys(ENVIRONMENT_JOBS)

// The four that deploy, each with the stage it deploys to and whether it is the pipeline's rollback.
const DEPLOY_JOBS: Readonly<Record<string, { stage: Stage; rollback: boolean }>> = {
  nonprod: { stage: 'nonprod', rollback: false },
  'rollback-nonprod': { stage: 'nonprod', rollback: true },
  prod: { stage: 'prod', rollback: false },
  'rollback-prod': { stage: 'prod', rollback: true },
}

// Each job's longest run, in minutes (DPW-05): inside the deploy roles' one-hour sessions.
export const TIMEOUTS: Readonly<Record<JobId, number>> = {
  gate: 15,
  build: 30,
  synth: 25,
  nonprod: 50,
  'smoke-nonprod': 10,
  'rollback-nonprod': 50,
  'resmoke-nonprod': 10,
  'record-nonprod': 5,
  'prod-plan': 15,
  'prod-gate': 40,
  prod: 50,
  'smoke-prod': 10,
  'rollback-prod': 50,
  'resmoke-prod': 10,
  'record-prod': 5,
}

// Each job's permissions, exactly (C11-D55, DPW-02): an id-token in the five environment jobs alone.
const READ = { contents: 'read' }
const DEPLOYING = { 'id-token': 'write', contents: 'read', deployments: 'write' }
const ROLLING_BACK = { 'id-token': 'write', contents: 'read', deployments: 'read' }
export const JOB_PERMISSIONS: Readonly<Record<JobId, Readonly<Record<string, string>>>> = {
  gate: { contents: 'read', actions: 'read', deployments: 'read', 'pull-requests': 'read' },
  build: READ,
  synth: READ,
  nonprod: DEPLOYING,
  'smoke-nonprod': READ,
  'rollback-nonprod': ROLLING_BACK,
  'resmoke-nonprod': READ,
  'record-nonprod': { deployments: 'write' },
  'prod-plan': { 'id-token': 'write', contents: 'read' },
  'prod-gate': { contents: 'read', actions: 'read', deployments: 'read' },
  prod: DEPLOYING,
  'smoke-prod': READ,
  'rollback-prod': ROLLING_BACK,
  'resmoke-prod': READ,
  'record-prod': { deployments: 'write' },
}

// The bot test every job after the gate starts its if: with (C11-D57, DPW-09): a re-run of one job skips
// the gate, so each job refuses a bot itself.
export const BOT_TEST = "!endsWith(github.triggering_actor, '[bot]') && !endsWith(github.actor, '[bot]')"

interface Job {
  id: string
  job: WorkflowJob
  steps: WorkflowStep[]
}

function jobsOf(text: string): Map<string, Job> {
  return new Map(workflowJobs(text).map(job => [job.id, { id: job.id, job, steps: parsedSteps(job) }]))
}

// Each job's lines in the file, from its id's line to the next job's (a job's own comment, above its id,
// falls in the job before it), and the lines before the first job.
function jobSpans(text: string): Map<string, readonly [number, number]> {
  const lines = text.split('\n')
  const start = lines.findIndex(line => /^jobs:\s*(?:#.*)?$/.test(line))
  const spans = new Map<string, readonly [number, number]>()
  if (start < 0) return spans
  const headers: Array<[string, number]> = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (/^\S/.test(line) && !line.startsWith('#')) break
    const header = /^ {2}([\w-]+):\s*(?:#.*)?$/.exec(line)
    if (header) headers.push([header[1] ?? '', i])
  }
  for (const [i, [id, from]] of headers.entries()) spans.set(id, [from, headers[i + 1]?.[1] ?? lines.length])
  return spans
}

const at = (path: string, id: string, rule: string): Finding => `${path}: ${id} ${rule}`
const label = (step: WorkflowStep, index: number) => `${step.name ?? `step ${index + 1}`}`
const isCredentials = (step: WorkflowStep) => step.uses?.startsWith('aws-actions/configure-aws-credentials@') === true
const credentialsAt = (steps: readonly WorkflowStep[]) => steps.findIndex(isCredentials)
const sameMap = (map: ReadonlyMap<string, string>, record: Readonly<Record<string, string>>) =>
  map.size === Object.keys(record).length && Object.entries(record).every(([key, value]) => map.get(key) === value)
const lineIndexOf = (lines: readonly string[], line: string) => lines.findIndex(each => each.trim() === line)
// A GitHub expression as the workflow writes it, ${{ inner }}.
const expr = (inner: string) => `\${{ ${inner} }}`

// --- Reading a run as bash reads it ---------------------------------------------------------------------

// Two views of a run, each the run's length and lines: its text with comments blanked, and its code,
// with comments blanked and quoted text written as underscores too, except what bash runs inside a
// quoted string (a $( … ) or a backtick substitution, kept as code) and its expansions ($NAME, ${…}),
// kept as written. A single quote inside double quotes, a $# or a ${#…} is read as bash reads it, an
// ANSI-C string ($'…') to its closing quote past each backslash escape, an unquoted ${…} as one word to
// its matching brace, and a # starts a comment only where bash's would: at the start of a word, never
// after a backslash (an escaped blank, or a backslash-newline that joins a word to the next line's) or a
// substitution's closing ) ($( … ), $(( … )), <( … ) or >( … ), which goes on as part of its word).
// A blank is bash's: a space or a tab (a newline ends the line), never another character JavaScript
// counts as white space (a no-break space, a vertical tab, a form feed, U+FEFF), which bash reads as part
// of a word, so a # after one is no comment. nestedCase says whether the word case stands inside a
// substitution or a backtick substitution, whose patterns' ) this reader would take for the
// substitution's end; odd names what bash might read otherwise than this reader: a comment whose #
// stands after anything but a blank or a line's start, or inside a substitution; an ANSI-C string but
// $'\t'; a ${…} holding a quote, a backtick, a substitution, another ${ or a transformation (@ and a
// letter, as ${x@P}, which expands its value as a prompt and runs a $( … ) in it), or unquoted, a blank,
// or with no closing brace; and the old arithmetic expansion $[ … ], quoted or not. A credentialed run
// refuses either (DPW-10, DPW-13). The views depend on the run's text alone, so each text's are read once
// and kept (keptByText), every rule reading the same ones.
interface ShellViews {
  readonly text: string
  readonly code: string
  readonly quotedLines: ReadonlySet<number>
  readonly nestedCase: boolean
  readonly odd: ReadonlySet<'comment' | 'ansi-c' | 'brace' | 'arithmetic'>
}
// A reader whose answer depends on a run's text alone, kept per text so each rule reading the same run
// reads it once (at most 4096 texts, then the store starts again).
function keptByText<T>(read: (run: string) => T): (run: string) => T {
  const store = new Map<string, T>()
  return run => {
    const kept = store.get(run)
    if (kept !== undefined) return kept
    if (store.size >= 4096) store.clear()
    const value = read(run)
    store.set(run, value)
    return value
  }
}
const VIEWS = keptByText(readViews)
export function shellViews(run: string): ShellViews {
  return VIEWS(run)
}
function readViews(run: string): ShellViews {
  let text = ''
  let code = ''
  const stack: Array<{ kind: 'double' } | { kind: 'paren'; depth: number } | { kind: 'tick' }> = []
  const blank = (c: string) => (c === '\n' ? '\n' : ' ')
  // The lines that start inside a quoted string, whose first word is no command.
  const quotedLines = new Set<number>()
  const odd = new Set<'comment' | 'ansi-c' | 'brace' | 'arithmetic'>()
  let line = 0
  // Whether the next character starts a word: at the start, and after an unescaped blank (a space or a
  // tab), a newline or ; & | ( ), but never right after a substitution's closing ).
  let boundary = true
  // Whether the character before is a backtick, after which a command starts too.
  let afterTick = false
  let nestedCase = false
  const keep = (part: string) => {
    text += part
    code += part
    line += part.split('\n').length - 1
  }
  // A quoted string's text stands in the code as underscores, so it stays one word with what is next to it.
  const quoted = (part: string) => {
    text += part
    for (const c of part) {
      code += c === '\n' ? '\n' : '_'
      if (c === '\n') quotedLines.add(++line)
    }
  }
  // A ${ … } from i: up to its matching brace (each { inside opens one more), a backslash escaping the
  // character after it; its end (past the brace, or the run's end with none) and its body.
  const braceEnd = (i: number) => {
    let depth = 0
    for (let at = i + 1; at < run.length; at++) {
      const c = run[at]
      if (c === '\\') at++
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) return { end: at + 1, body: run.slice(i + 2, at), closed: true }
    }
    return { end: run.length, body: run.slice(i + 2), closed: false }
  }
  const BRACE_ODD = /['"`]|\$[({]|@[A-Za-z]/
  let i = 0
  while (i < run.length) {
    const c = run[i] ?? ''
    const next = run[i + 1] ?? ''
    const frame = stack[stack.length - 1]
    const opened = afterTick
    afterTick = false
    if (frame?.kind === 'double') {
      if (c === '\\') {
        quoted(c + next)
        i += 2
      } else if (c === '"') {
        keep(c)
        stack.pop()
        i++
        boundary = false
      } else if (c === '$' && next === '(') {
        keep('$(')
        stack.push({ kind: 'paren', depth: 1 })
        i += 2
        boundary = true
      } else if (c === '`') {
        keep(c)
        stack.push({ kind: 'tick' })
        i++
        afterTick = true
      } else if (c === '$' && next === '[') {
        odd.add('arithmetic')
        quoted(c)
        i++
      } else if (c === '$' && next === '{') {
        const end = run.indexOf('}', i)
        const stop = end < 0 ? run.length : end + 1
        if (end < 0 || BRACE_ODD.test(run.slice(i + 2, stop - 1))) odd.add('brace')
        keep(run.slice(i, stop))
        i = stop
      } else if (c === '$' && /[A-Za-z_@#?*!$0-9]/.test(next)) {
        const name = /^\$(?:[A-Za-z_]\w*|[@#?*!$0-9])/.exec(run.slice(i))?.[0] ?? '$'
        keep(name)
        i += name.length
      } else {
        quoted(c)
        i++
      }
      continue
    }
    if (c === '\\') {
      keep(c + next)
      i += 2
      // A backslash-newline joins the lines, so the word goes on as before it; an escaped character is
      // part of a word.
      if (next !== '\n') boundary = false
    } else if (c === '#' && boundary) {
      if ((i > 0 && !/[ \t\n]/.test(run[i - 1] ?? '')) || stack.length > 0) odd.add('comment')
      const end = run.indexOf('\n', i)
      const stop = end < 0 ? run.length : end
      const comment = [...run.slice(i, stop)].map(blank).join('')
      text += comment
      code += comment
      i = stop
    } else if (c === '$' && next === "'") {
      // An ANSI-C string: to the first quote no backslash escapes.
      let close = i + 2
      while (close < run.length && run[close] !== "'") close += run[close] === '\\' ? 2 : 1
      const body = run.slice(i + 2, Math.min(close, run.length))
      if (body !== '\\t' || close >= run.length) odd.add('ansi-c')
      keep("$'")
      quoted(body)
      if (close < run.length) keep("'")
      i = Math.min(close + 1, run.length)
      boundary = false
    } else if (c === "'") {
      const end = run.indexOf("'", i + 1)
      const close = end < 0 ? run.length : end
      keep("'")
      quoted(run.slice(i + 1, close))
      if (end >= 0) keep("'")
      i = end < 0 ? close : close + 1
      boundary = false
    } else if (c === '"') {
      keep(c)
      stack.push({ kind: 'double' })
      i++
      boundary = false
    } else if (c === '`') {
      keep(c)
      if (frame?.kind === 'tick') stack.pop()
      else {
        stack.push({ kind: 'tick' })
        afterTick = true
      }
      i++
      boundary = false
    } else if (c === '$' && next === '{') {
      // An unquoted ${ … }: one word to its matching brace, inside which no # starts a comment.
      const { end, body, closed } = braceEnd(i)
      if (!closed || /\s/.test(body) || BRACE_ODD.test(body)) odd.add('brace')
      keep(run.slice(i, end))
      i = end
      boundary = false
    } else if (c === '$' && next === '[') {
      // The old arithmetic expansion, which evaluates a variable's value as arithmetic.
      odd.add('arithmetic')
      keep(c)
      i++
      boundary = false
    } else if ((c === '$' || c === '<' || c === '>') && next === '(') {
      // A substitution ($( … ), $(( … )), <( … ) or >( … )): its frame, whose closing ) goes on as its word.
      keep(c + next)
      stack.push({ kind: 'paren', depth: 1 })
      i += 2
      boundary = true
    } else {
      // (A backtick starts a command too, though a # right after one reads as code here, never a comment.)
      if (
        /^case\s/.test(run.slice(i, i + 5)) &&
        stack.some(each => each.kind !== 'double') &&
        (opened || (boundary && ENDS_AT_COMMAND_START.test(code.slice(code.lastIndexOf('\n') + 1))))
      ) {
        nestedCase = true
      }
      if (frame?.kind === 'paren' && c === '(') frame.depth++
      keep(c)
      i++
      boundary = /[ \t\n;&|()]/.test(c)
      if (frame?.kind === 'paren' && c === ')' && --frame.depth === 0) {
        stack.pop()
        boundary = false
      }
    }
  }
  return { text, code, quotedLines, nestedCase, odd }
}

// Blanks every character of a span but what a $( … ) inside it runs, newlines kept.
function keepSubstitutions(span: string): string {
  let out = ''
  let depth = 0
  for (let i = 0; i < span.length; i++) {
    const c = span[i] ?? ''
    if (depth === 0 && c === '$' && span[i + 1] === '(') {
      out += '$('
      depth = 1
      i++
    } else if (depth > 0) {
      if (c === '(') depth++
      if (c === ')') depth--
      out += c
    } else {
      out += c === '\n' ? '\n' : ' '
    }
  }
  return out
}

// Where a command may start (COMMAND's first part): a line's start, after ; | ! & (not a redirection's),
// $( (not arithmetic's $(( ), <( or >(, a subshell's (, a group's {, each followed by any keywords (then,
// do, else, elif, if, while, until) that themselves stand where a command starts, so a keyword that is a
// command's argument (echo then case …) starts nothing.
const COMMAND_BOUNDARY = String.raw`^|[;|!]|(?<![<>])&(?!>)|\$\((?!\()|[<>]\(|(?<![=$<>\w(])\(|(?<![$\w])\{(?=\s)`
const COMMAND_START = String.raw`(?:${COMMAND_BOUNDARY})(?:\s*\b(?:then|do|else|elif|if|while|until)(?=\s))*`
const ENDS_AT_COMMAND_START = new RegExp(`(?:${COMMAND_START})\\s*$`)

// The code view with the words bash reads as operands and not as commands blanked too: a [[ … ]] test's
// operands and patterns, and each case item's patterns, all but the $( … ) substitutions inside them. Only
// a [[ or a case where a command starts is one (as an argument either is a word like any other), and a
// line a backslash-newline continues starts no command, so neither hides what bash runs. A case is read
// across lines as bash reads it: its subject up to in, then each item's pattern up to its ), then the
// item's commands up to ;; (or ;&, ;;&) or esac, so a one-line case or several items on a line are read
// too.
function commandCode(code: string): string {
  const raw = code.split('\n')
  const continued = raw.map((_, n) => n > 0 && code.includes('\\') && /(?:^|[^\\])(?:\\\\)*\\$/.test(raw[n - 1] ?? ''))
  const startsCommand = (line: string, n: number, at: number) =>
    !(continued[n] && line.slice(0, at).trim() === '') && ENDS_AT_COMMAND_START.test(line.slice(0, at))
  const text = raw
    .map((line, n) =>
      line.replace(/\[\[([^\n]*?)\]\]/g, (whole, inner: string, at: number) =>
        startsCommand(line, n, at) ? `[[${keepSubstitutions(inner)}]]` : whole,
      ),
    )
    .join('\n')
  // (A text with no case word has nothing more to blank.)
  if (!/(?<![\w-])case\s/.test(text)) return text
  const out = [...text]
  // A word at i: the run of characters from a word's start (the start, or after a blank or ; & | ( ) < >).
  const word = /[^\s;&|()<>]+/y
  const wordAt = (i: number) => {
    if (i > 0 && !/[\s;&|()<>]/.test(text[i - 1] ?? '')) return ''
    word.lastIndex = i
    return word.exec(text)?.[0] ?? ''
  }
  // Each line's start, so a position's line is found as the scan moves forward.
  const lineStarts = [0]
  for (let at = 0; at < text.length; at++) if (text[at] === '\n') lineStarts.push(at + 1)
  let lineNo = 0
  const commandAt = (i: number) => {
    while (lineNo + 1 < lineStarts.length && (lineStarts[lineNo + 1] ?? 0) <= i) lineNo++
    const from = lineStarts[lineNo] ?? 0
    return startsCommand(text.slice(from, i), lineNo, i - from)
  }
  const states: Array<{ in: 'subject' | 'pattern' | 'body'; level: number }> = []
  // Where to look next in each state, so the scan jumps from one place that matters to the next: a case
  // word outside any case; in a body, a ;; ;& or ;;&, an esac or a case; in a subject, a parenthesis or in.
  const OUTSIDE = /(?<![\w-])case(?=\s)/g
  const BODY = /;;&?|;&|(?<![\w-])(?:esac|case)(?![\w-])/g
  const SUBJECT = /[()]|(?<![^\s;&|()<>])in(?![^\s;&|()<>])/g
  const next = (pattern: RegExp, from: number) => {
    pattern.lastIndex = from
    const found = pattern.exec(text)
    return found === null ? undefined : { at: found.index, what: found[0] }
  }
  let i = 0
  while (i < text.length) {
    const top = states[states.length - 1]
    if (top === undefined) {
      const found = next(OUTSIDE, i)
      if (found === undefined) break
      if (commandAt(found.at)) states.push({ in: 'subject', level: 0 })
      i = found.at + 4
    } else if (top.in === 'subject') {
      const found = next(SUBJECT, i)
      if (found === undefined) break
      if (found.what === '(') top.level++
      else if (found.what === ')') top.level--
      else if (top.level === 0) top.in = 'pattern'
      i = found.at + found.what.length
    } else if (top.in === 'pattern') {
      const c = text[i] ?? ''
      if (/\s/.test(c)) {
        i++
        continue
      }
      if (c === 'e' && wordAt(i) === 'esac') {
        states.pop()
        i += 4
        continue
      }
      // The pattern, from an optional ( to its ) at the same depth, blanked but for its substitutions; its )
      // reads as a ;, since the item's first command starts after it.
      let level = 0
      let end = c === '(' ? i + 1 : i
      for (; end < text.length; end++) {
        if (text[end] === '(') level++
        else if (text[end] === ')') {
          if (level === 0) break
          level--
        }
      }
      const blanked = keepSubstitutions(text.slice(i, end))
      for (let at = 0; at < blanked.length; at++) out[i + at] = blanked[at] ?? ''
      if (end < text.length) out[end] = ';'
      top.in = 'body'
      i = end + 1
    } else {
      const found = next(BODY, i)
      if (found === undefined) break
      if (found.what.startsWith(';')) top.in = 'pattern'
      else if (found.what === 'esac' && commandAt(found.at)) states.pop()
      else if (found.what === 'case' && commandAt(found.at)) states.push({ in: 'subject', level: 0 })
      i = found.at + found.what.length
    }
  }
  return out.join('')
}

// A command bash would run, by its line in the run: its word (as the code view shows it, a quoted word's
// text blanked), the prefixes before it (run, get, a wrapper such as exec, command or env with its flags,
// an assignment, a redirection), and whether it is the first command of a $( … ), whose output is
// captured. A word starts a command at the start of a line, after ; & | ! or a keyword (never a keyword
// itself), inside $( … ), <( … ) or a subshell's ( … ), or after a group's {.
export interface ShellCommand {
  line: number
  prefixes: string[]
  word: string
  substituted: boolean
  // Its arguments as the command code shows them, up to the next ;, |, &, ) or substitution.
  rest: string
  // The rest of its line as the command code shows it, up to the next ;, | or &.
  tail: string
}

// The words that run the command after them (time, bash's keyword, among them). The reader reads
// through each with its flags, so the command it runs is seen, and a credentialed run uses none (DPW-10).
export const WRAPPERS: readonly string[] = [
  'exec',
  'command',
  'builtin',
  'nohup',
  'time',
  'sudo',
  'xargs',
  'timeout',
  'env',
]

// What may stand before a command's word: run, get, a wrapper with its flags, an assignment, a redirection.
const PREFIXES = String.raw`((?:(?:run|get|(?:exec|command|builtin|nohup|time|sudo|xargs)(?:\s+-\S*)*|timeout(?:\s+-\S+)*\s+\S+|env(?:\s+-\S+)*(?:\s+[A-Za-z_]\w*=\S*)*|[A-Za-z_]\w*=(?:[^\s$]|\$(?!\())*|(?:\d+|&)?(?:>>|<<<|<<-?|<>|>&|<&|>\||[<>])(?!\()\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s;&|()<>'"]+))\s+)*)`
const COMMAND = new RegExp(
  String.raw`(${COMMAND_START})\s*${PREFIXES}` +
    String.raw`(?!(?:then|do|else|elif|if|while|until)(?![\w-])|\$\(|!\s)("[^"\n]*"|'[^'\n]*'|(?:[^\s;&|()<>'"$]|\$(?!\())+)`,
  'g',
)
// A command whose word starts with a bare $( (bash runs what that substitution prints), which COMMAND reads
// as the substitution's own command alone (DPW-10, DPW-13).
const SUBSTITUTED_WORD = new RegExp(String.raw`(?:${COMMAND_START})\s*${PREFIXES}\$\((?!\()`, 'm')

// The command code with each outermost substitution ($( … ), $(( … )), <( … ) or >( … ), its newlines
// included) written as SPAN and underscores to its closing ), and each newline inside a quoted string as
// an underscore: the same length, so an offset in one is the same in the other, and read as bash reads
// the words around it. An assignment's value or a redirection's target that holds a substitution or a
// quoted newline is one word there (X=$( … ) cp, < <( … ) cp, <$( … ) cp, a quoted value over two lines), so the word after
// it is read as the command it is, which the code view, whose PREFIXES stop at a $( and at a line's end,
// never reads; and a substitution as a command's word after such a prefix starts with SPAN.
const SPAN = '\uE000'
function outerCode(code: string, quotedLines: ReadonlySet<number>): string {
  const out = code.split('')
  const open: number[] = []
  let line = 0
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    if (c === '\n' && quotedLines.has(++line)) out[i] = '_'
    else if ((c === '$' || c === '<' || c === '>') && code[i + 1] === '(') {
      open.push(i)
      i++
    } else if (c === '(') open.push(-1)
    else if (c === ')') {
      const from = open.pop()
      if (from !== undefined && from >= 0 && open.every(each => each < 0)) {
        out.fill('_', from, i + 1)
        out[from] = SPAN
      }
    }
  }
  return out.join('')
}
const OUTER_SUBSTITUTED_WORD = new RegExp(String.raw`(?:${COMMAND_START})\s*${PREFIXES}${SPAN}`, 'm')
const WORD_AT = /"[^"\n]*"|'[^'\n]*'|(?:[^\s;&|()<>'"$]|\$(?!\())+/y

// Read once per run's text (keptByText), each caller given its own copy of the list.
const COMMANDS = keptByText(readCommands)
export function shellCommands(run: string): ShellCommand[] {
  return [...COMMANDS(run)]
}
function readCommands(run: string): ShellCommand[] {
  const views = shellViews(run)
  const code = commandCode(views.code)
  const lines = code.split('\n')
  const starts: number[] = []
  lines.reduce((at, text) => {
    starts.push(at)
    return at + text.length + 1
  }, 0)
  // The line an offset of the code stands on, by binary search over the lines' starts.
  const lineOf = (offset: number) => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if ((starts[middle] ?? 0) <= offset) low = middle
      else high = middle - 1
    }
    return low
  }
  const found = new Map<number, ShellCommand>()
  // Each command COMMAND finds in a text that starts at an offset of the code, read as a line starts
  // (one that starts inside a quoted string starts no command there).
  const read = (text: string, from: number, outer: boolean) => {
    const quoted = views.quotedLines.has(lineOf(from))
    const shown = quoted ? `)${text}` : text
    for (const match of shown.matchAll(COMMAND)) {
      const at = from + match.index + match[0].length - (match[3] ?? '').length - (quoted ? 1 : 0)
      if (found.has(at) || (outer && text[at - from] === SPAN)) continue
      WORD_AT.lastIndex = at
      const word = outer ? (WORD_AT.exec(code)?.[0] ?? '') : (match[3] ?? '')
      const prefixes = (match[2] ?? '').trim().split(/\s+/).filter(Boolean)
      // An assignment alone (X=$(…)) runs nothing itself, what it substitutes is read after it, and a
      // word that starts with -, = or a digit is an operand (a test's ! -L, a != , a redirection's 2),
      // but after a wrapper, whose flag or operand it is (command -p, timeout 5), it is kept, so the
      // wrapper is seen.
      if (word === '' || /^[A-Za-z_]\w*\+?=/.test(word)) continue
      if (/^[-=\d]/.test(word) && !prefixes.some(prefix => WRAPPERS.includes(prefix))) continue
      const line = lineOf(at)
      const after = (lines[line] ?? '').slice(at - (starts[line] ?? 0) + word.length)
      found.set(at, {
        line,
        prefixes,
        word,
        substituted: !outer && match[1] === '$(',
        rest: after.slice(0, after.search(/[;|&)]|[$<>]\(|$/)),
        tail: after.slice(0, after.search(/[;|&]|$/)),
      })
    }
  }
  for (const [line, text] of lines.entries()) read(text, starts[line] ?? 0, false)
  // Then the outer reading, a line joined to the next where a substitution or a quoted string goes on
  // across it, for the commands the first reading never reached (a code with neither reads the same).
  if (/[$<>]\(/.test(code) || views.quotedLines.size > 0) {
    let from = 0
    for (const text of outerCode(code, views.quotedLines).split('\n')) {
      read(text, from, true)
      from += text.length + 1
    }
  }
  return [...found.entries()].sort(([a], [b]) => a - b).map(([, command]) => command)
}

// The functions a run defines, in either of bash's spellings (name () body, or function name body), each
// with its line in the run.
const FUNCTION_NAME = String.raw`[^\s;&|()<>'"$=\`\\]+`
const DEFINITION = new RegExp(
  String.raw`(?:^|[\s;&|(){}])(?:function\s+(${FUNCTION_NAME})|(${FUNCTION_NAME})\s*\(\s*\))`,
  'g',
)
// Read once per run's text (keptByText), each caller given its own copy of the list.
const DEFINITIONS = keptByText(readDefinitions)
export function functionDefinitions(run: string): Array<{ name: string; line: number }> {
  return [...DEFINITIONS(run)]
}
function readDefinitions(run: string): Array<{ name: string; line: number }> {
  const found: Array<{ name: string; line: number }> = []
  commandCode(shellViews(run).code)
    .split('\n')
    .forEach((text, line) => {
      for (const match of text.matchAll(DEFINITION)) found.push({ name: match[1] ?? match[2] ?? '', line })
    })
  return found
}

// An assignment to one of the names in any of bash's spellings: NAME=, NAME+=, NAME[i]=, export, local
// or readonly NAME=, (( NAME = … )), $(( NAME += … )) and ${NAME:=…}. (printf -v, read, mapfile and for
// set a variable too: a credentialed run uses them only on DPW-10's SETTER_LINES.)
const assigns = (names: string) =>
  new RegExp(String.raw`(?<![\w$.-])(?:${names})(?:\[[^\]]*\])?\s*(?:[-+*/%&|^:]|<<|>>)?=(?!=)`)
const STAGE_ASSIGNMENT = assigns('STAGE')
const CDK_ASSIGNMENT = assigns('CDK')
const ASSEMBLY_ASSIGNMENT = assigns('ASSEMBLY')
const DIFF_ASSIGNMENT = assigns('DIFF')

// Each line of a run with its two views, for the rules that read a line's text or its code.
function runLines(
  run: string,
  views: ReturnType<typeof shellViews> = shellViews(run),
): Array<{ index: number; raw: string; text: string; code: string }> {
  const text = views.text.split('\n')
  const code = views.code.split('\n')
  return run.split('\n').map((raw, index) => ({ index, raw, text: text[index] ?? '', code: code[index] ?? '' }))
}

// The canonical texts, which a run may hold whole: each read by shellViews() and shellCommands(), written in
// the shell they read (readsAsBash()) and evaluating only what it sets itself (outsideEvaluations()), both
// held by the tests; a run's own lines, every line outside a canonical text standing whole, are read by
// SHELL_TABLE alone (readShell()).
export const CANONICAL_BY_NAME = (): Readonly<Record<string, string>> => ({
  PREAMBLE,
  CDK_FOLDER,
  CLI_CHECK,
  ASSET_CHECK,
  AWS_CHECK,
  TASKS_OUTPUTS,
  ONE_OFF,
  PROBE,
  NEWEST_RELEASE,
  PULL_CHECKS,
  MAIN_CI,
  PROD_GATE_CALL,
  FAST_RECHECK_NONPROD,
  FAST_RECHECK_PROD,
  SMOKE_ATTEMPT,
  RESTORE_DOWN,
})
const CANONICAL_TEXTS = (): readonly string[] => Object.values(CANONICAL_BY_NAME())
// Each canonical text standing whole in a run, from a line's start to a line's end, with its first line, but
// one inside another that stands there too.
function canonicalPlaces(run: string): Array<{ text: string; first: number; count: number }> {
  const places: Array<{ text: string; first: number; count: number }> = []
  for (const text of CANONICAL_TEXTS()) {
    for (let at = run.indexOf(text); at >= 0; at = run.indexOf(text, at + 1)) {
      const end = at + text.length
      if ((at > 0 && run[at - 1] !== '\n') || (end < run.length && run[end] !== '\n')) continue
      places.push({ text, first: run.slice(0, at).split('\n').length - 1, count: text.split('\n').length })
    }
  }
  return places.filter(
    place =>
      !places.some(
        other =>
          other !== place &&
          other.count > place.count &&
          other.first <= place.first &&
          other.first + other.count >= place.first + place.count,
      ),
  )
}
// The lines of a run inside a canonical text that stands whole in it.
function canonicalLines(run: string): ReadonlySet<number> {
  const lines = new Set<number>()
  for (const { first, count } of canonicalPlaces(run)) for (let n = first; n < first + count; n++) lines.add(n)
  return lines
}

// What bash evaluates as arithmetic or a name, on the code view: (( or $(( )), a [[ … ]] comparing as numbers
// or asking -v or -R, a [ or test asking -v or -R, an indirect ${!…}, a ${name[…]} but [@] or [*], an offset
// of a substring (${name:offset}, ${@:offset}, ${*:offset} or ${1:offset}), an assignment to name[…] and a
// compound assignment naming a subscript (a=([i]=1)). The tests pin each canonical text's lines that hold one.
const ESCAPED_BREAK = /\\(?:[\s#]|$)/m
const HERE_DOCUMENT = /(?<!<)<<(?!<)/
const EVALUATED = [
  /\(\(/,
  /\[\[(?:(?!\]\]).)*(?<![\w-])-(?:eq|ne|lt|le|gt|ge|v|R)(?![\w-])/,
  /(?:^|[\s;&|(!])(?:\[|test)\s(?:(?!\]).)*(?<![\w-])-[vR](?![\w-])/,
  /\$\{!/,
  /\$\{#?[A-Za-z_]\w*\[(?![@*]\])/,
  /\$\{(?:[A-Za-z_]\w*(?:\[[@*]\])?|[@*#?$!-]|\d+):(?![-=?+])/,
  /(?<![\w$])[A-Za-z_]\w*\[[^\]\n]*\]\+?=/,
  /(?:^|[\s(])\[[^\]\n]*\]\+?=/,
]
// A name local or export is given as written: NAME, NAME= or NAME+= (a flag is the rules' own).
const GIVEN_NAME = /^(?:[-+][A-Za-z]+|[A-Za-z_]\w*(?:\+?=.*)?)$/s
// A command's words in the code view, split at the blanks outside its parentheses.
function words(text: string): string[] {
  const found: string[] = []
  let word = ''
  let depth = 0
  for (const c of text) {
    if (c === '(') depth++
    if (c === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && /[ \t]/.test(c)) {
      if (word !== '') found.push(word)
      word = ''
    } else word += c
  }
  if (word !== '') found.push(word)
  return found
}
// The lines of a text, by index, that bash evaluates as arithmetic or a name (EVALUATED, on the code view).
export function evaluatedLines(run: string): number[] {
  return shellViews(run)
    .code.split('\n')
    .flatMap((line, n) => (EVALUATED.some(pattern => pattern.test(line)) ? [n] : []))
}
// Whether a canonical text is written in the shell shellViews() and shellCommands() read, so the rules read its
// commands as bash runs them: no unquoted backslash before a blank, a # or a line's end, no case inside a
// substitution, no command whose word is a substitution's output, none of what shellViews() names odd, no
// backtick substitution, no here-document, no local or export of a name it builds, and, outside a canonical
// text standing whole in it, nothing EVALUATED names (a canonical text's own are held by
// outsideEvaluations()).
export function readsAsBash(run: string, views: ReturnType<typeof shellViews> = shellViews(run)): boolean {
  if (views.nestedCase || views.odd.size > 0) return false
  if (ESCAPED_BREAK.test(views.code) || SUBSTITUTED_WORD.test(views.code)) return false
  if (OUTER_SUBSTITUTED_WORD.test(outerCode(views.code, views.quotedLines))) return false
  if (views.code.includes('`') || HERE_DOCUMENT.test(views.code)) return false
  // (Only a text whose code names local or export has one to read.)
  const names = /\b(?:local|export)\b/.test(views.code)
    ? shellCommands(run).filter(command => command.word === 'local' || command.word === 'export')
    : []
  if (names.some(command => !words(command.tail).every(word => GIVEN_NAME.test(word)))) return false
  const canonical = canonicalLines(run)
  return views.code.split('\n').every((line, n) => !EVALUATED.some(pattern => pattern.test(line)) || canonical.has(n))
}

// The lines of a canonical text at which bash evaluates, as arithmetic, a subscript, an offset, a name or a
// prompt, a value from outside the text. Every name the text evaluates must be bash's own SECONDS (whose value
// read is always its count of seconds, whatever was assigned to it) or assigned within the text before its
// first evaluation, every assignment of it a literal number, a for loop over literal words, a local with no
// value, or arithmetic over such names; and nothing else is evaluated: no $( … ), quote, escape or
// positional parameter inside arithmetic or a subscript, no $[ … ], ${!…} or ${…@…}, no let, no declare,
// typeset or local given -i, -n or -A, no [[ … ]] comparing as numbers, and no -v or -R. A name printf -v
// sets is built only from such names. So no value from a step's env, an output, an artifact's file or a
// run's own lines is ever evaluated inside a canonical text.
const OUTSIDE = /\$\(|[`'"\\]|\$[0-9@*#?$!-]|\$\{(?![A-Za-z_]\w*\})/
const REFUSED_EVALUATION =
  /\$\[|\$\{!|\$\{[^}\n]*@[A-Za-z]|(?<![\w-])(?:let|declare|typeset)(?![\w-])|(?<![\w-])local\s+-[A-Za-z]*[inA]/g
export function outsideEvaluations(text: string): number[] {
  const views = shellViews(text)
  const code = views.code
  const lineOf = (at: number) => code.slice(0, at).split('\n').length - 1
  const sites: Array<{ at: number; names: readonly string[] | undefined }> = []
  const namesIn = (expression: string) =>
    [...expression.matchAll(/(?<![\w$])\$?\{?([A-Za-z_]\w*)/g)].map(match => match[1] ?? '')
  // An arithmetic expression as written: its names, or none to allow when it holds anything bash expands
  // first but $NAME and ${NAME}.
  const arithmetic = (at: number, expression: string) =>
    sites.push({ at, names: OUTSIDE.test(expression) ? undefined : namesIn(expression) })
  // The text inside the parentheses that open at an offset of the text, to the ) that closes them.
  const inside = (open: number) => {
    let depth = 0
    for (let end = open; end < text.length; end++) {
      if (text[end] === '(') depth++
      else if (text[end] === ')' && --depth === 0) return text.slice(open + 1, end)
    }
    return text.slice(open + 1)
  }
  // A value as written from an offset of the text: $(( … )) whole, or up to a blank or a ;.
  const valueAt = (from: number) =>
    text.startsWith('$((', from) ? `$(${inside(from + 1)})` : (/^[^\s;]*/.exec(text.slice(from))?.[0] ?? '')
  for (const match of code.matchAll(/\$?\(\(/g)) {
    const open = match.index + match[0].length - 2
    arithmetic(match.index, inside(open).slice(1, -1))
  }
  for (const match of code.matchAll(REFUSED_EVALUATION)) sites.push({ at: match.index, names: undefined })
  // $[ … ] in double quotes too, which the code view writes as quoted text.
  for (const match of views.text.matchAll(/\$\[/g)) sites.push({ at: match.index, names: undefined })
  let offset = 0
  for (const line of code.split('\n')) {
    if (EVALUATED.slice(1, 3).some(pattern => pattern.test(line))) sites.push({ at: offset, names: undefined })
    offset += line.length + 1
  }
  // A ${…}'s subscript, offset and length, an assignment's subscript and printf -v's name.
  for (const match of code.matchAll(/\$\{#?([A-Za-z_]\w*|[0-9@*])(?:\[([^\]\n]*)\])?(?::(?![-=?+])([^}\n]*))?\}/g)) {
    const [, name, subscript, range] = match
    if (subscript !== undefined && subscript !== '@' && subscript !== '*') arithmetic(match.index, subscript)
    if (range !== undefined) arithmetic(match.index, range.replace(':', ' '))
    if (range !== undefined && !/^[A-Za-z_]/.test(name ?? '')) sites.push({ at: match.index, names: undefined })
  }
  for (const match of code.matchAll(/(?<![\w$])[A-Za-z_]\w*\[([^\]\n]*)\]\+?=|(?:^|[\s(])\[([^\]\n]*)\]\+?=/gm)) {
    arithmetic(match.index, match[1] ?? match[2] ?? '')
  }
  for (const match of code.matchAll(/(?<![\w-])printf\s+-v\s+/g)) {
    const name = valueAt(match.index + match[0].length)
    const outside = /\[|\$\(|`|\$[0-9@*#?$!-]/.test(name)
    sites.push({
      at: match.index,
      names: outside ? undefined : [...name.matchAll(/\$\{?([A-Za-z_]\w*)/g)].map(each => each[1] ?? ''),
    })
  }
  // Each assignment of a name, by its offset in the code and its value as written ('' for a local with none or
  // a for loop over literal words; $ for one that read, mapfile, printf -v or another for loop sets).
  const assignments = (name: string): Array<{ at: number; value: string }> => {
    const found: Array<{ at: number; value: string }> = []
    for (const match of code.matchAll(new RegExp(String.raw`(?<![\w$-])${name}\+?=`, 'g'))) {
      found.push({ at: match.index, value: valueAt(match.index + match[0].length) })
    }
    const local = String.raw`(?<![\w-])local\s[^;\n]*?(?<![\w$=-])${name}(?![\w=])`
    for (const match of code.matchAll(new RegExp(local, 'g'))) found.push({ at: match.index, value: '' })
    for (const match of code.matchAll(new RegExp(String.raw`(?<![\w-])for\s+${name}\s+in\s+([^;\n]*)`, 'g'))) {
      found.push({ at: match.index, value: /^[\w\s-]+$/.test(match[1] ?? '') ? '' : '$' })
    }
    const setters = String.raw`(?<![\w-])(?:read|mapfile|readarray|getopts|select)\s[^;\n|]*(?<![\w$])${name}(?!\w)`
    for (const match of code.matchAll(new RegExp(setters, 'g'))) found.push({ at: match.index, value: '$' })
    const printf = String.raw`(?<![\w-])printf\s+-v\s+"?${name}(?![\w])`
    for (const match of code.matchAll(new RegExp(printf, 'g'))) found.push({ at: match.index, value: '$' })
    return found
  }
  const allowed = (name: string, at: number, seen: ReadonlySet<string>): boolean => {
    const all = assignments(name)
    if (name === 'SECONDS') return all.length === 0
    if (!all.some(each => each.at < at)) return false
    return all.every(({ value }) => {
      if (value === '' || /^[0-9]+$/.test(value)) return true
      const nested = /^\$\(\((.*)\)\)$/s.exec(value)?.[1]
      if (nested === undefined || OUTSIDE.test(nested)) return false
      return namesIn(nested).every(each => seen.has(each) || allowed(each, at, new Set([...seen, each])))
    })
  }
  const lines = new Set<number>()
  for (const { at, names } of sites) {
    if (names === undefined || !names.every(name => allowed(name, at, new Set([name])))) lines.add(lineOf(at))
  }
  return [...lines].sort((a, b) => a - b)
}

export const GUARD = 'scripts/guards/deploy-workflow.ts'
// DPW-10's rule over the canonical texts, which a run may hold whole: each is written in the shell
// shellViews() and shellCommands() read (readsAsBash()), so the rules read its commands as bash runs them,
// and evaluates nothing from outside it (outsideEvaluations()), each line that does named. The guard's own
// texts never change while it runs, so their findings are read once (CANONICAL_FOUND).
let CANONICAL_FOUND: readonly Finding[] | undefined
export function canonicalTextFindings(texts?: Readonly<Record<string, string>>): Finding[] {
  if (texts === undefined) {
    CANONICAL_FOUND ??= canonicalTextFindings(CANONICAL_BY_NAME())
    return [...CANONICAL_FOUND]
  }
  const found: Finding[] = []
  for (const [name, text] of Object.entries(texts)) {
    if (!readsAsBash(text)) found.push(`${GUARD}: DPW-10 ${name}: is written in the shell shellViews() reads`)
    for (const line of outsideEvaluations(text)) {
      found.push(
        `${GUARD}: DPW-10 ${name}, line ${line + 1}: evaluates as arithmetic, a subscript, an offset, a name or a prompt only what it sets itself`,
      )
    }
  }
  return found
}

// --- Reading a run's own lines through a table (DPW-07, DPW-10, DPW-13) ------------------------------------

// The shell a run of deploy.yml may hold outside its canonical texts, entry by entry, each with what bash
// 5.2 does with it. readShell() reads a run's own lines (every line outside a canonical text standing
// whole) by this table alone, and refuses the first thing it doesn't name: a character, a quoting form, an
// expansion, a substitution, an operator, a redirection, a keyword, a test, a pattern, a function or an
// assignment of another shape. The canonical texts are fixed here, read by shellViews() and
// shellCommands(), and evaluate only what each sets itself (outsideEvaluations()).
export const SHELL_TABLE = {
  // A blank, between words: a space or a tab. bash splits words at these alone (a newline ends a command),
  // so a no-break space, a form feed or any other character is part of a word, and is refused here.
  blank: /^[ \t]$/,
  // A comment: bash discards a # and the rest of its line where a word starts. Read only at a line's start
  // or after a blank, and never inside a substitution, whose ) it would hide.
  comment: '#',
  // An unquoted word's characters: bash reads each as itself, with no expansion, glob (*, ?, [), brace
  // ({, }), tilde (~), quote or escape among them.
  wordCharacter: /^[A-Za-z0-9_./:=@-]$/,
  // A command's word: a builtin's, a function's, a program's name or path, of these characters alone (no
  // =, so no word bash reads as an assignment, NAME+=VALUE, stands as a command).
  commandCharacter: /^[A-Za-z0-9_./-]$/,
  // A single-quoted string: bash reads everything up to the next ' as itself, over lines too. Printable
  // ASCII only.
  singleQuoted: /^'[\x20-\x26\x28-\x7e\n]*'/,
  // A double-quoted string: bash reads each printable ASCII character but $, `, " and \ as itself, and in it
  // only the expansions and substitutions below. No backslash, backtick or line break.
  doubleQuotedCharacter: /^[\x20-\x21\x23\x25-\x5b\x5d-\x5f\x61-\x7e]$/,
  // The expansions, each to a value bash then uses as data (no word splitting or glob in double quotes or
  // an assignment's value), in double quotes unless said otherwise.
  expansions: [
    // $NAME: the variable's value, its name every letter, digit and _ that follows.
    { form: /^\$[A-Za-z_][A-Za-z0-9_]*/, where: 'quoted or value' },
    // ${NAME}: the same, braced.
    { form: /^\$\{[A-Za-z_][A-Za-z0-9_]*\}/, where: 'quoted' },
    // $1 to $9: a function's arguments, each one digit, no digit after it.
    { form: /^\$[1-9](?![0-9])/, where: 'quoted' },
    // ${NAME##*/}: the value with everything up to its last / taken off, a literal pattern.
    { form: /^\$\{[A-Za-z_][A-Za-z0-9_]*##\*\/\}/, where: 'quoted or value' },
    // ${#NAME[@]}: how many elements the array holds.
    { form: /^\$\{#[A-Za-z_][A-Za-z0-9_]*\[@\]\}/, where: 'quoted' },
    // "${NAME[@]}": each element as a word of its own, the whole double-quoted word.
    { form: /^\$\{[A-Za-z_][A-Za-z0-9_]*\[@\]\}/, where: 'whole' },
    // $?: the last command's status, an assignment's whole value.
    { form: /^\$\?/, where: 'whole value' },
  ],
  // A command substitution, $( … ): bash runs the pipeline inside, read by this table (simple commands
  // joined by |, on one line but inside quotes, no comment) and puts its output in place; in double quotes
  // or as an assignment's value.
  substitution: '$(',
  // A process substitution, < <( … ): bash runs the pipeline inside and hands its output as a file; only
  // as mapfile -t NAME's input.
  processSubstitution: '< <(',
  // The operators: | pipes a command's output into the next; && and || run the next only if the last
  // succeeded or failed; ; ends a command; ;; ends a case item; ! at a pipeline's start, before a blank,
  // negates its status. A line break may follow |, && and ||.
  operators: ['|', '&&', '||', ';', ';;', '!'],
  // The redirections, each straight before its target: > writes a file anew, >> appends to it, < and 2>
  // read it or write the errors to it, <<< hands a double-quoted word as the input, 2>&1 sends the errors
  // where the output goes and >&2 the output where the errors go. A target is double-quoted or a word.
  redirections: ['2>&1', '>&2', '<<<', '>>', '2>', '>', '<'],
  // The keywords, each where a command starts: if … then … elif … else … fi; for NAME in WORDS; do … done
  // over literal or double-quoted words; case "WORD" in PATTERN) … ;; esac; { … }, a group run in this
  // shell, its { before a blank and its } where a command starts.
  keywords: ['if', 'then', 'elif', 'else', 'fi', 'for', 'in', 'do', 'done', 'case', 'esac', '{', '}'],
  // A test, [[ "WORD" =~ REGEX ]], && joining more than one: bash matches the double-quoted word against
  // the regular expression, with no word splitting or glob, and evaluates nothing. The expression is of
  // these characters, a $ only at its end and a | only inside parentheses.
  regex: /^\^?(?:[A-Za-z0-9[\]{},:+-]|\((?:[A-Za-z0-9[\]{},:+|-])+\))+\$?$/,
  // A case pattern: the word's characters, *, which bash matches against anything, and single-quoted
  // strings; | between alternatives, ) after the last.
  casePattern: /^(?:[A-Za-z0-9_./:=@-]|\*|'[\x20-\x26\x28-\x7e]*')+$/,
  // A function definition, NAME() { at a line's start and its } where a command starts: bash keeps the
  // body to run when the name is a command. Only these names, which shadow no builtin or tool.
  functions: ['record', 'release_payload'],
  // An assignment where a command starts, NAME=VALUE: bash sets the variable, the value neither split nor
  // globbed; before a command's word, for that command alone. The value: the word's characters, quoted
  // strings, $NAME, ${NAME##*/}, $? whole, or $( … ). NAME=( … ) sets an array to its literal or
  // double-quoted words, none of them a [subscript]=.
  assignment: /^[A-Za-z_][A-Za-z0-9_]*=/,
  // bash's own variables (and the loaders'), which change how it or what it runs reads: no assignment,
  // local, for or mapfile names one.
  bashVariables:
    /^(?:BASH\w*|COMP_\w+|LC_\w+|HIST\w*|READLINE_\w+|PS[0-4]|MAIL\w*|LD_\w+|IFS|PATH|HOME|ENV|CDPATH|SHELLOPTS|POSIXLY_CORRECT|GLOBIGNORE|GLOBSORT|EXECIGNORE|FIGNORE|FUNCNEST|PROMPT_COMMAND|PROMPT_DIRTRIM|TMPDIR|TIMEFORMAT|TMOUT|LANG|LANGUAGE|SECONDS|RANDOM|SRANDOM|LINENO|OPTIND|OPTARG|OPTERR|REPLY|MAPFILE|PIPESTATUS|FUNCNAME|DIRSTACK|GROUPS|EUID|UID|PPID|PWD|OLDPWD|SHELL|SHLVL|HOSTNAME|HOSTTYPE|MACHTYPE|OSTYPE|IGNOREEOF|INPUTRC|INSIDE_EMACS|EMACS|COLUMNS|LINES|CHILD_MAX|COPROC|EPOCHREALTIME|EPOCHSECONDS|HOSTFILE|FCEDIT|BASHOPTS)$/,
  // The builtins a run's own lines may run, each held to what they give it; bash runs these itself.
  builtins: {
    // echo prints its words; never a first word that reads as a flag.
    echo: (args: readonly ShellWord[]) => args.length > 0 && !(args[0]?.value ?? '').startsWith('-'),
    // exit ends the step with a status: a number, or one expansion's value.
    exit: (args: readonly ShellWord[]) =>
      args.length === 1 && (/^[0-9]+$/.test(args[0]?.value ?? '') || /^"\$[A-Za-z_]\w*"$/.test(args[0]?.raw ?? '')),
    // continue starts a loop's next round.
    continue: (args: readonly ShellWord[]) => args.length === 0,
    // set sets the shell's options: only -euo pipefail.
    set: (args: readonly ShellWord[]) => args.map(arg => arg.raw).join(' ') === '-euo pipefail',
    // [ compares two words, =, != or -gt (a number bash reads as digits, never evaluated), and nothing else
    // (never -v, which evaluates a subscript).
    '[': (args: readonly ShellWord[]) =>
      args.length === 4 &&
      ['=', '!=', '-gt'].includes(args[1]?.raw ?? '') &&
      args[3]?.raw === ']' &&
      [args[0], args[2]].every(arg => arg !== undefined && (arg.quoted || !arg.raw.startsWith('-'))),
    // local declares a function's variables by their names alone.
    local: (args: readonly ShellWord[]) =>
      args.length > 0 && args.every(arg => /^[A-Za-z_]\w*$/.test(arg.raw) && !SHELL_TABLE.bashVariables.test(arg.raw)),
    // mapfile -t NAME reads its input's lines into an array (its input a process substitution).
    mapfile: (args: readonly ShellWord[]) =>
      args.length === 2 &&
      args[0]?.raw === '-t' &&
      /^[A-Za-z_]\w*$/.test(args[1]?.raw ?? '') &&
      !SHELL_TABLE.bashVariables.test(args[1]?.raw ?? ''),
    // printf prints one word by a fixed format, '%s' or '%s\n' (never -v, which sets a variable by name).
    printf: (args: readonly ShellWord[]) =>
      args.length === 2 && (args[0]?.raw === "'%s'" || args[0]?.raw === "'%s\\n'"),
  } as Readonly<Record<string, (args: readonly ShellWord[]) => boolean>>,
  // Every other builtin and keyword bash has, each of which changes how the shell reads or what it runs
  // (eval, source, ., trap, alias, shopt, enable, builtin, command, exec, let, declare, read, cd, …).
  refused: [
    '.',
    ':',
    'alias',
    'bg',
    'bind',
    'break',
    'builtin',
    'caller',
    'cd',
    'command',
    'compgen',
    'complete',
    'compopt',
    'coproc',
    'declare',
    'dirs',
    'disown',
    'enable',
    'eval',
    'exec',
    'export',
    'false',
    'fc',
    'fg',
    'function',
    'getopts',
    'hash',
    'help',
    'history',
    'jobs',
    'kill',
    'let',
    'logout',
    'popd',
    'pushd',
    'pwd',
    'read',
    'readarray',
    'readonly',
    'return',
    'select',
    'shift',
    'shopt',
    'source',
    'suspend',
    'test',
    'time',
    'times',
    'trap',
    'true',
    'type',
    'typeset',
    'ulimit',
    'umask',
    'unalias',
    'unset',
    'until',
    'wait',
    'while',
    '[[',
    ']]',
    '!',
    'then',
    'elif',
    'else',
    'fi',
    'in',
    'do',
    'done',
    'esac',
    'case',
    'if',
    'for',
    '{',
    '}',
  ],
} as const

// A word as the table reads it: as written, its value when it expands nothing (quotes taken off), whether
// it holds a quote, and the names it expands.
export interface ShellWord {
  raw: string
  value: string | undefined
  quoted: boolean
  expands: readonly string[]
}

// A command a run's own lines run, as the table reads it: its line in the run, its name (the command's word,
// or if, for, case, { or [[ for a compound one; none for assignments alone), the assignments before it, its
// words and redirections, whether it is the first command of a substitution, and its place in its pipeline.
export interface GlueCommand {
  line: number
  name: string | undefined
  assignments: ReadonlyArray<{ name: string; raw: string; value: ShellWord }>
  args: readonly ShellWord[]
  redirections: ReadonlyArray<{ op: string; target: ShellWord | undefined }>
  substituted: boolean
  inSubstitution: boolean
  previous: string | undefined
  raw: string
}

export interface ShellRead {
  // The first thing the table doesn't name, by its line in the run and what it is.
  refused: { line: number; what: string } | undefined
  commands: GlueCommand[]
  functions: Array<{ name: string; line: number }>
}

class Refusal extends Error {
  readonly at: number
  readonly what: string
  constructor(at: number, what: string) {
    super(what)
    this.at = at
    this.what = what
  }
}

const NAME_AT = /^[A-Za-z_][A-Za-z0-9_]*/
const RESERVED_END = /^(?:then|elif|else|fi|do|done|esac|\})(?=[ \t\n;|&<>)]|$)/
const COMPOUND = /^(?:if|for|case|\{|\[\[)(?=[ \t\n]|$)/

class ShellReader {
  readonly commands: GlueCommand[] = []
  readonly functions: Array<{ name: string; line: number }> = []
  private i = 0
  private readonly breaks: number[] = []
  private readonly s: string
  private readonly offset: number

  constructor(s: string, offset: number) {
    this.s = s
    this.offset = offset
    for (let at = 0; at < s.length; at++) if (s[at] === '\n') this.breaks.push(at)
  }

  lineAt(at: number): number {
    let low = 0
    let high = this.breaks.length
    while (low < high) {
      const middle = (low + high) >> 1
      if ((this.breaks[middle] ?? 0) < at) low = middle + 1
      else high = middle
    }
    return this.offset + low
  }

  private refuse(what: string, at = this.i): never {
    throw new Refusal(at, what)
  }
  private peek(n = 0): string {
    return this.s[this.i + n] ?? ''
  }
  private rest(): string {
    return this.s.slice(this.i, this.i + 200)
  }
  private starts(text: string): boolean {
    return this.s.startsWith(text, this.i)
  }
  private blanks(): void {
    while (SHELL_TABLE.blank.test(this.peek())) this.i++
  }
  // A # where a word may start is a comment after a blank or at a line's start, and refused elsewhere.
  private comment(): boolean {
    if (this.peek() !== SHELL_TABLE.comment) return false
    const before = this.s[this.i - 1]
    if (this.i > 0 && before !== '\n' && !SHELL_TABLE.blank.test(before ?? '')) this.refuse('a # that is no comment')
    const end = this.s.indexOf('\n', this.i)
    this.i = end < 0 ? this.s.length : end
    return true
  }
  // Blanks, comments and line breaks.
  private linebreak(): void {
    for (;;) {
      this.blanks()
      if (this.comment()) continue
      if (this.peek() === '\n') {
        this.i++
        continue
      }
      return
    }
  }

  read(): void {
    this.list(['EOF'], true)
  }

  // A list of and-or lists, each ended by ; or a line break, up to one of its ends: a keyword where a
  // command starts, ;; or the run's end. It returns the end it found.
  private list(ends: readonly string[], top = false): string {
    let count = 0
    for (;;) {
      this.linebreak()
      if (this.i >= this.s.length) {
        if (ends.includes('EOF')) return 'EOF'
        this.refuse('a compound command its lines leave open')
      }
      const reserved = RESERVED_END.exec(this.rest())?.[0]
      const end = reserved ?? (this.starts(';;') ? ';;' : undefined)
      if (end !== undefined) {
        if (!ends.includes(end)) this.refuse('a keyword or operator where the table reads none')
        if (count === 0) this.refuse('an empty list')
        return end
      }
      if (top && this.atDefinition()) this.definition()
      else this.andOr()
      count++
      this.blanks()
      this.comment()
      if (this.peek() === ';' && this.peek(1) !== ';') {
        this.i++
        continue
      }
      if (this.peek() === '\n' || this.i >= this.s.length || this.starts(';;')) continue
      this.refuse('an operator the table does not name')
    }
  }

  private andOr(): void {
    this.pipeline()
    for (;;) {
      this.blanks()
      if (this.starts('&&') || this.starts('||')) {
        this.i += 2
        this.linebreak()
        this.pipeline()
        continue
      }
      return
    }
  }

  private pipeline(): void {
    this.blanks()
    if (this.peek() === '!' && SHELL_TABLE.blank.test(this.peek(1))) {
      this.i++
      this.blanks()
    }
    let previous: string | undefined
    for (;;) {
      previous = this.command(previous)
      this.blanks()
      if (this.peek() === '|' && this.peek(1) !== '|') {
        if (this.peek(1) === '&') this.refuse('an operator the table does not name')
        this.i++
        this.linebreak()
        continue
      }
      return
    }
  }

  private emit(command: Omit<GlueCommand, 'raw'>, from: number): void {
    this.commands.push({ ...command, raw: this.s.slice(from, this.i).trim() })
  }

  // A command where one starts: a compound one by its keyword, or a simple one. Its name, for the next
  // command of its pipeline.
  private command(previous: string | undefined): string {
    this.blanks()
    const from = this.i
    const keyword = COMPOUND.exec(this.rest())?.[0]
    if (keyword === undefined) return this.simple({ previous, inSubstitution: false, first: false })
    const line = this.lineAt(from)
    const base = { line, assignments: [], args: [], substituted: false, inSubstitution: false, previous }
    if (keyword === 'if') {
      this.i += 2
      this.expect(this.list(['then']), 'then')
      let end = this.list(['elif', 'else', 'fi'])
      while (end === 'elif') {
        this.i += 4
        this.expect(this.list(['then']), 'then')
        end = this.list(['elif', 'else', 'fi'])
      }
      if (end === 'else') {
        this.i += 4
        this.list(['fi'])
      }
      this.i += 2
      this.emit({ ...base, name: 'if', redirections: [] }, from)
    } else if (keyword === 'for') {
      this.i += 3
      this.blanks()
      const name = NAME_AT.exec(this.rest())?.[0] ?? this.refuse('a for loop the table does not read')
      if (SHELL_TABLE.bashVariables.test(name)) this.refuse("an assignment to one of bash's own variables")
      this.i += name.length
      if (!/^[ \t]+in[ \t]/.test(this.rest())) this.refuse('a for loop the table does not read')
      this.blanks()
      this.i += 2
      const words: ShellWord[] = []
      for (;;) {
        this.blanks()
        if (this.peek() === ';') break
        const word = this.word('for')
        words.push(word)
      }
      if (words.length === 0) this.refuse('a for loop the table does not read')
      this.i++
      this.blanks()
      if (!/^do(?=[ \t\n])/.test(this.rest())) this.refuse('a for loop the table does not read')
      this.i += 2
      this.list(['done'])
      this.i += 4
      this.emit({ ...base, name: 'for', args: words, redirections: [] }, from)
    } else if (keyword === 'case') {
      this.i += 4
      this.blanks()
      const subject = this.word('subject')
      this.blanks()
      if (!/^in(?=[ \t\n])/.test(this.rest())) this.refuse('a case the table does not read')
      this.i += 2
      for (;;) {
        this.linebreak()
        if (/^esac(?=[ \t\n;|&)]|$)/.test(this.rest())) break
        for (;;) {
          const pattern = this.word('pattern')
          if (!SHELL_TABLE.casePattern.test(pattern.raw)) this.refuse('a case pattern the table does not name')
          this.blanks()
          if (this.peek() === ')') break
          if (this.peek() !== '|') this.refuse('a case pattern the table does not name')
          this.i++
          this.blanks()
        }
        this.i++
        this.list([';;'])
        this.i += 2
      }
      this.i += 4
      this.emit({ ...base, name: 'case', args: [subject], redirections: [] }, from)
    } else if (keyword === '{') {
      this.i++
      this.list(['}'])
      this.i++
      const redirections = this.redirections()
      this.emit({ ...base, name: '{', redirections }, from)
    } else {
      this.i += 2
      const args: ShellWord[] = []
      for (;;) {
        this.blanks()
        args.push(this.word('test'))
        this.blanks()
        if (!this.starts('=~ ')) this.refuse('a [[ test the table does not name')
        this.i += 3
        this.blanks()
        const start = this.i
        while (this.i < this.s.length && !/[ \t\n]/.test(this.peek())) this.i++
        const regex = this.s.slice(start, this.i)
        if (!SHELL_TABLE.regex.test(regex)) this.refuse('a regular expression the table does not name', start)
        this.blanks()
        if (this.starts(']]')) {
          this.i += 2
          break
        }
        if (!this.starts('&& ')) this.refuse('a [[ test the table does not name')
        this.i += 2
      }
      this.emit({ ...base, name: '[[', args, redirections: [] }, from)
    }
    if (!/^(?:[ \t\n;|&]|$)/.test(this.rest())) this.refuse('a compound command the table does not read')
    return keyword
  }

  private expect(found: string, want: string): void {
    if (found !== want) this.refuse('a compound command the table does not read')
    this.i += want.length
  }

  private atDefinition(): boolean {
    return (this.i === 0 || this.s[this.i - 1] === '\n') && /^[A-Za-z_]\w*\(\) \{\n/.test(this.rest())
  }
  private definition(): void {
    const name = NAME_AT.exec(this.rest())?.[0] ?? ''
    if (!(SHELL_TABLE.functions as readonly string[]).includes(name)) {
      this.refuse('a function the table does not name')
    }
    this.functions.push({ name, line: this.lineAt(this.i) })
    this.i += name.length + 4
    this.list(['}'])
    this.i++
  }

  // A redirection's op and target where one starts, or undefined.
  private redirection(): { op: string; target: ShellWord | undefined } | undefined {
    const c = this.peek()
    if (!(c === '<' || c === '>' || (/[0-9]/.test(c) && /^[0-9]+[<>]/.test(this.rest())) || this.starts('&>'))) {
      return undefined
    }
    if (this.starts('< <(')) {
      this.i += 4
      return { op: SHELL_TABLE.processSubstitution, target: undefined }
    }
    const op = SHELL_TABLE.redirections.find(each => this.starts(each))
    if (op === undefined || (op === '>' && /^>[|&]/.test(this.rest())) || (op === '<' && /^<[<>&]/.test(this.rest()))) {
      this.refuse('a redirection the table does not name')
    }
    this.i += op.length
    if (op === '2>&1' || op === '>&2') {
      if (!/^(?:[ \t\n;|&)]|$)/.test(this.rest())) this.refuse('a redirection the table does not name')
      return { op, target: undefined }
    }
    if (op === '<<<' && this.peek() !== '"') this.refuse('a redirection the table does not name')
    const target = this.word('target')
    return { op, target }
  }

  private redirections(): Array<{ op: string; target: ShellWord | undefined }> {
    const found: Array<{ op: string; target: ShellWord | undefined }> = []
    for (;;) {
      this.blanks()
      const redirection = this.redirection()
      if (redirection === undefined) return found
      if (redirection.op === SHELL_TABLE.processSubstitution)
        this.refuse('a process substitution the table does not name')
      found.push(redirection)
    }
  }

  private atCommandEnd(inSubstitution: boolean): boolean {
    const c = this.peek()
    return (
      this.i >= this.s.length ||
      c === ';' ||
      c === '\n' ||
      c === '|' ||
      c === '&' ||
      (inSubstitution && c === ')') ||
      (c === '#' && SHELL_TABLE.blank.test(this.s[this.i - 1] ?? ''))
    )
  }

  // A simple command: its assignments, its word, then its words and redirections. Its name.
  private simple(at: { previous: string | undefined; inSubstitution: boolean; first: boolean }): string {
    this.blanks()
    const from = this.i
    const line = this.lineAt(from)
    const assignments: Array<{ name: string; raw: string; value: ShellWord }> = []
    while (SHELL_TABLE.assignment.test(this.rest())) {
      const start = this.i
      const name = NAME_AT.exec(this.rest())?.[0] ?? ''
      if (SHELL_TABLE.bashVariables.test(name)) this.refuse("an assignment to one of bash's own variables")
      this.i += name.length + 1
      const value = this.peek() === '(' ? this.array() : this.word('value')
      assignments.push({ name, raw: this.s.slice(start, this.i), value })
      this.blanks()
    }
    const base = { line, assignments, substituted: at.first, inSubstitution: at.inSubstitution, previous: at.previous }
    if (this.atCommandEnd(at.inSubstitution)) {
      if (assignments.length === 0) this.refuse('a command the table does not read')
      this.emit({ ...base, name: undefined, args: [], redirections: [] }, from)
      return '='
    }
    const start = this.i
    let name: string
    if (this.starts('[ ')) {
      name = '['
      this.i++
    } else {
      while (SHELL_TABLE.commandCharacter.test(this.peek())) this.i++
      name = this.s.slice(start, this.i)
      if (name === '' || !/^(?:[ \t\n;|&<>)]|$)/.test(this.rest()))
        this.refuse("a command's word the table does not read")
    }
    if ((SHELL_TABLE.refused as readonly string[]).includes(name)) this.refuse('a builtin or keyword the table refuses')
    const args: ShellWord[] = []
    const redirections: Array<{ op: string; target: ShellWord | undefined }> = []
    for (;;) {
      this.blanks()
      if (this.atCommandEnd(at.inSubstitution)) break
      const redirection = this.redirection()
      if (redirection !== undefined) {
        if (redirection.op === SHELL_TABLE.processSubstitution) {
          if (name !== 'mapfile' || at.inSubstitution) this.refuse('a process substitution the table does not name')
          this.substitution()
        }
        redirections.push(redirection)
        continue
      }
      args.push(this.word(name === '[' ? 'test-arg' : 'arg'))
    }
    const hold = SHELL_TABLE.builtins[name]
    if (hold !== undefined && !hold(args)) this.refuse('a builtin given what the table does not name', start)
    if (name === 'mapfile' && redirections.map(each => each.op).join() !== SHELL_TABLE.processSubstitution) {
      this.refuse('a builtin given what the table does not name', start)
    }
    this.emit({ ...base, name, args, redirections }, from)
    return name
  }

  // An array's literal or double-quoted words, NAME=( … ), on one line.
  private array(): ShellWord {
    const start = this.i
    this.i++
    for (;;) {
      this.blanks()
      if (this.peek() === ')') break
      this.word('element')
    }
    this.i++
    return { raw: this.s.slice(start, this.i), value: undefined, quoted: true, expands: [] }
  }

  // A substitution's pipeline, after its opening, to its ).
  private substitution(): void {
    let previous: string | undefined
    let first = true
    for (;;) {
      this.blanks()
      previous = this.simple({ previous, inSubstitution: true, first })
      first = false
      this.blanks()
      if (this.peek() === '|' && this.peek(1) !== '|' && this.peek(1) !== '&') {
        this.i++
        continue
      }
      break
    }
    if (this.peek() !== ')') this.refuse('a substitution the table does not read')
    this.i++
  }

  // A word in one of its places: its parts, each a quoted string, the word's characters or (in an
  // assignment's value) an expansion or a substitution, up to a blank or an operator.
  private word(
    place: 'arg' | 'test-arg' | 'value' | 'target' | 'subject' | 'pattern' | 'for' | 'element' | 'test',
  ): ShellWord {
    const start = this.i
    let value: string | undefined = ''
    let quoted = false
    const expands: string[] = []
    const add = (text: string | undefined) => {
      value = value === undefined || text === undefined ? undefined : value + text
    }
    for (;;) {
      const c = this.peek()
      if (this.i >= this.s.length || /[ \t\n;|&<>()]/.test(c)) break
      if (place === 'pattern' && c === '*') {
        this.i++
        add(c)
      } else if (place === 'test-arg' && c === ']' && this.i === start && /^\](?:[ \t\n;|&]|$)/.test(this.rest())) {
        this.i++
        add(c)
      } else if (place === 'test-arg' && this.i === start && /^!=[ \t]/.test(this.rest())) {
        this.i += 2
        add('!=')
      } else if (SHELL_TABLE.wordCharacter.test(c)) {
        this.i++
        add(c)
      } else if (c === "'") {
        const found = SHELL_TABLE.singleQuoted.exec(this.s.slice(this.i))?.[0]
        if (found === undefined) this.refuse('a single-quoted string the table does not read')
        if (place === 'pattern' && found.includes('\n')) this.refuse('a case pattern the table does not name')
        this.i += found.length
        quoted = true
        add(found.slice(1, -1))
      } else if (c === '"') {
        quoted = true
        const inner = this.double(start)
        expands.push(...inner.expands)
        add(inner.value)
      } else if (c === '$' && place === 'value') {
        const found = this.expansion('value', start)
        expands.push(...found)
        add(undefined)
      } else {
        this.refuse('a character or form the table does not name')
      }
    }
    if (this.i === start) this.refuse('a word the table does not read')
    const raw = this.s.slice(start, this.i)
    if (place === 'subject' && !/^"[^"]*"$/.test(raw)) this.refuse('a case the table does not read', start)
    if (place === 'test' && !/^"[^"]*"$/.test(raw)) this.refuse('a [[ test the table does not name', start)
    if (place === 'target' && !(/^"[^"]*"$/.test(raw) || raw === '/dev/null')) {
      this.refuse('a redirection the table does not name', start)
    }
    if ((place === 'for' || place === 'element') && raw.includes("'"))
      this.refuse('a word the table does not read', start)
    return { raw, value, quoted, expands }
  }

  // A double-quoted string from its opening quote: its value (undefined when it expands anything) and the
  // names it expands.
  private double(wordStart: number): { value: string | undefined; expands: string[] } {
    const open = this.i
    this.i++
    let value: string | undefined = ''
    const expands: string[] = []
    for (;;) {
      const c = this.peek()
      if (this.i >= this.s.length) this.refuse('a double-quoted string its lines leave open', open)
      if (c === '"') {
        this.i++
        return { value, expands }
      }
      if (c === '$') {
        const whole = open === wordStart
        expands.push(...this.expansion(whole ? 'quoted-start' : 'quoted', open))
        value = undefined
        continue
      }
      if (!SHELL_TABLE.doubleQuotedCharacter.test(c))
        this.refuse('a character in double quotes the table does not name')
      this.i++
      if (value !== undefined) value += c
    }
  }

  // An expansion or a substitution at a $, in double quotes or as an assignment's value; the names it
  // expands.
  private expansion(place: 'value' | 'quoted' | 'quoted-start', open: number): string[] {
    const text = this.rest()
    if (text.startsWith('$(') && !text.startsWith('$((')) {
      this.i += 2
      this.substitution()
      return []
    }
    for (const { form, where } of SHELL_TABLE.expansions) {
      const found = form.exec(text)?.[0]
      if (found === undefined) continue
      if (where === 'whole value') {
        if (place !== 'value' || this.i !== open || !/^(?:[ \t\n;|&)]|$)/.test(this.s.slice(this.i + found.length))) {
          continue
        }
      } else if (where === 'whole') {
        if (place !== 'quoted-start' || this.s[this.i + found.length] !== '"') continue
      } else if (where === 'quoted' && place === 'value') continue
      this.i += found.length
      const name = /[A-Za-z_][A-Za-z0-9_]*|[1-9?]/.exec(found)?.[0] ?? ''
      return [name]
    }
    return this.refuse('an expansion the table does not name')
  }
}

// A run's own lines read by the table, each stretch between its canonical texts from the top, since each
// canonical text ends where bash would start a command and each stretch must close everything it opens.
export function readShell(run: string): ShellRead {
  const lines = run.split('\n')
  const canonical = canonicalLines(run)
  const read: ShellRead = { refused: undefined, commands: [], functions: [] }
  for (let from = 0; from < lines.length; ) {
    if (canonical.has(from)) {
      from++
      continue
    }
    let to = from
    while (to < lines.length && !canonical.has(to)) to++
    const reader = new ShellReader(lines.slice(from, to).join('\n'), from)
    try {
      reader.read()
    } catch (error) {
      if (!(error instanceof Refusal)) throw error
      read.refused ??= { line: reader.lineAt(error.at), what: error.what }
    }
    read.commands.push(...reader.commands)
    read.functions.push(...reader.functions)
    from = to
  }
  return read
}

// A run's own command as the rules read every command (ShellCommand): run and get read through to the
// program they run, its words written out as they stand.
function asShellCommand(command: GlueCommand): ShellCommand[] {
  if (command.name === undefined) return []
  const [first, ...rest] = command.args
  const wrapped = (command.name === 'run' || command.name === 'get') && first !== undefined
  const args = (wrapped ? rest : command.args).map(arg => ` ${arg.raw}`).join('')
  return [
    {
      line: command.line,
      prefixes: [...command.assignments.map(each => each.raw), ...(wrapped ? [command.name] : [])],
      word: wrapped ? first.raw : command.name,
      substituted: command.substituted,
      rest: args,
      tail: args + command.redirections.map(each => ` ${each.op}${each.target?.raw ?? ''}`).join(''),
    },
  ]
}
// The commands of a run as the rules read them: its own lines' by the table, exactly, and every line's by
// shellCommands(), the regex reader, as a second layer that only ever adds a command (each canonical text is
// written in the shell it reads); and the functions it defines, likewise.
export function commandsOf(run: string, read: ShellRead = readShell(run)): ShellCommand[] {
  return [...shellCommands(run), ...read.commands.flatMap(asShellCommand)]
}
export function definitionsOf(run: string, read: ShellRead = readShell(run)): Array<{ name: string; line: number }> {
  return [...functionDefinitions(run), ...read.functions]
}
// A run's first line the table refuses, as a finding's place: its job, its step and its line, counted from
// the run's first line as 1.
const refusedAt = (where: string, read: ShellRead) =>
  read.refused === undefined ? undefined : `${where}, line ${read.refused.line + 1}`
const AS_BASH =
  'is written in the shell the guard reads: outside a canonical text standing whole, only what SHELL_TABLE names (blanks that are a space or a tab, its word characters, single and double quotes, its expansions, substitutions, operators, redirections, keywords, tests, case patterns, functions and assignments, its builtins as it holds them, a comment only at a line’s start or after a blank), each stretch closing all it opens'

// --- Reading an if: as GitHub reads it -------------------------------------------------------------------

// What an if: can come to when only some values are known: true, false, or undefined when it turns on a
// value that isn't (Kleene's logic over GitHub's expressions: && and || return an operand, ! binds tighter
// than == and !=, == on ASCII strings ignores case, and every function but endsWith, startsWith and contains
// is unknown). An if: is only ever read whole as ${{ … }}: with anything beside it (a space, a block
// scalar's newline) GitHub reads a string, always true, so any other value is unknown (and DPW-02 refuses
// it in deploy.yml). && and || return an operand, so one whose value isn't known stays unknown though its
// truth may be (unknown || 'a' is truthy, of no known value or type), never a made-up true or false.
// GitHub compares values of two types by coercing both to numbers (null and '' to 0, a boolean to 0 or 1,
// a string to its JSON number or NaN), and strings by upper-casing them by its own rules; this reads any
// such comparison, and any string function or comparison with a character outside ASCII, as unknown, so
// it never says false where GitHub would say true.
const UNKNOWN = Symbol('unknown')
const TRUTHY_UNKNOWN = Symbol('truthy, value unknown')
const FALSY_UNKNOWN = Symbol('falsy, value unknown')
type Value = string | number | boolean | null | typeof UNKNOWN | typeof TRUTHY_UNKNOWN | typeof FALSY_UNKNOWN

function truth(value: Value): boolean | undefined {
  if (value === UNKNOWN) return undefined
  if (value === TRUTHY_UNKNOWN) return true
  if (value === FALSY_UNKNOWN) return false
  if (typeof value === 'string') return value !== ''
  if (typeof value === 'number') return value !== 0
  return value === true
}

// Two strings as GitHub compares them, case ignored, for ASCII alone.
const ascii = (text: string) => [...text].every(c => c.charCodeAt(0) < 128)
const folded = (a: string, b: string): readonly [string, string] | undefined =>
  ascii(a) && ascii(b) ? [a.toUpperCase(), b.toUpperCase()] : undefined

export function evaluateIf(expression: string, known: Readonly<Record<string, string>>): boolean | undefined {
  const whole = /^\$\{\{([\s\S]*)\}\}$/.exec(expression)
  if (whole === null) return undefined
  const body = whole[1] ?? ''
  const tokens = body.match(/'(?:[^']|'')*'|&&|\|\||==|!=|<=|>=|[<>!(),]|[A-Za-z_][\w.*-]*|\d+(?:\.\d+)?|\S/g) ?? []
  let i = 0
  const peek = () => tokens[i]
  const take = () => tokens[i++]
  const or = (): Value => {
    let left = and()
    while (peek() === '||') {
      take()
      const right = and()
      const t = truth(left)
      left = t === true ? left : t === false ? right : truth(right) === true ? TRUTHY_UNKNOWN : UNKNOWN
    }
    return left
  }
  const and = (): Value => {
    let left = compare()
    while (peek() === '&&') {
      take()
      const right = compare()
      const t = truth(left)
      left = t === false ? left : t === true ? right : truth(right) === false ? FALSY_UNKNOWN : UNKNOWN
    }
    return left
  }
  // Comparisons, left to right, between unary operands: !a == b is (!a) == b, as GitHub reads it.
  const compare = (): Value => {
    let left = not()
    for (
      let op = peek();
      op === '==' || op === '!=' || op === '<' || op === '>' || op === '<=' || op === '>=';
      op = peek()
    ) {
      take()
      const right = not()
      if (
        typeof left === 'symbol' ||
        typeof right === 'symbol' ||
        (op !== '==' && op !== '!=') ||
        typeof left !== typeof right
      ) {
        left = UNKNOWN
        continue
      }
      let same = left === right
      if (typeof left === 'string' && typeof right === 'string') {
        const pair = folded(left, right)
        if (pair === undefined) {
          left = UNKNOWN
          continue
        }
        same = pair[0] === pair[1]
      }
      left = op === '==' ? same : !same
    }
    return left
  }
  const not = (): Value => {
    if (peek() === '!') {
      take()
      const t = truth(not())
      return t === undefined ? UNKNOWN : !t
    }
    return primary()
  }
  const primary = (): Value => {
    const token = take() ?? ''
    if (token === '(') {
      const value = or()
      take()
      return value
    }
    if (token.startsWith("'")) return token.slice(1, -1).replace(/''/g, "'")
    if (/^\d/.test(token)) return Number(token)
    if (token === 'true' || token === 'false') return token === 'true'
    if (token === 'null') return null
    if (peek() === '(') {
      take()
      const args: Value[] = []
      while (peek() !== undefined && peek() !== ')') {
        args.push(or())
        if (peek() === ',') take()
      }
      take()
      const [a, b] = args
      if (typeof a !== 'string' || typeof b !== 'string') return UNKNOWN
      const pair = folded(a, b)
      if (pair === undefined) return UNKNOWN
      const [x, y] = pair
      if (token === 'endsWith') return x.endsWith(y)
      if (token === 'startsWith') return x.startsWith(y)
      if (token === 'contains') return x.includes(y)
      return UNKNOWN
    }
    return Object.hasOwn(known, token) ? (known[token] ?? UNKNOWN) : UNKNOWN
  }
  const value = or()
  return i === tokens.length ? truth(value) : undefined
}

// --- DPW-01: what starts the workflow ---------------------------------------------------------------------

// The dispatch's inputs (C11-D49, C11-D59): each one's type, options and default; a description each.
const INPUTS: Readonly<Record<string, Readonly<Record<string, string | readonly string[]>>>> = {
  target: { type: 'choice', options: ['nonprod', 'prod', 'restore'], default: 'nonprod' },
  mode: { type: 'choice', options: ['deploy', 'rollback', 'drill-break', 'drill-smoke'], default: 'deploy' },
  release: { type: 'string', default: '' },
  restore: { type: 'choice', options: ['none', 'up', 'down'], default: 'none' },
}

const isMap = (value: BlockValue | undefined): value is ReadonlyMap<string, BlockValue> => value instanceof Map
const keysAre = (value: ReadonlyMap<string, BlockValue>, keys: readonly string[]) =>
  value.size === keys.length && keys.every(key => value.has(key))
const sameList = (value: BlockValue | undefined, list: readonly string[]) =>
  Array.isArray(value) && value.length === list.length && list.every((item, i) => value[i] === item)

function onIsAsWritten(on: BlockValue | undefined): boolean {
  if (!isMap(on) || !keysAre(on, ['push', 'workflow_dispatch'])) return false
  const push = on.get('push')
  if (!isMap(push) || !keysAre(push, ['branches']) || !sameList(push.get('branches'), ['main'])) return false
  const dispatch = on.get('workflow_dispatch')
  if (!isMap(dispatch) || !keysAre(dispatch, ['inputs'])) return false
  const inputs = dispatch.get('inputs')
  if (!isMap(inputs) || !keysAre(inputs, Object.keys(INPUTS))) return false
  return Object.entries(INPUTS).every(([name, want]) => {
    const input = inputs.get(name)
    if (!isMap(input) || !keysAre(input, ['description', ...Object.keys(want)])) return false
    const description = input.get('description')
    if (typeof description !== 'string' || description === '') return false
    return Object.entries(want).every(([key, value]) =>
      typeof value === 'string' ? input.get(key) === value : sameList(input.get(key), value),
    )
  })
}

// Every scalar, list item and key a value holds, at any depth.
function namesIn(value: BlockValue): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(item => namesIn(item))
  return [...(value as ReadonlyMap<string, BlockValue>)].flatMap(([key, each]) => [key, ...namesIn(each)])
}
const FORBIDDEN_EVENTS = /\b(?:pull_request_target|workflow_run)\b/

// DPW-01 (C11-D47, C11-D62): deploy.yml starts on a push to main and a person's dispatch with exactly the
// four inputs, nothing else; no workflow uses pull_request_target or workflow_run, in any spelling its on:
// can take (read as YAML lines and through blockValue, and with no block scalar under on:); main's ruleset still
// requires check and migrations and names no deploy.yml job, and no ci.yml job needs one, so the deploy
// workflow never gates merging and CLAUDE.md's way of adding a required check stays open.
export function triggerFindings(workflows: Texts, ruleset: string): Finding[] {
  const found: Finding[] = []
  const deploy = workflows.get(DEPLOY) ?? ''
  if (!onIsAsWritten(blockValue(workflowTop(deploy).get('on') ?? []))) {
    found.push(
      at(
        DEPLOY,
        'DPW-01',
        'on: is a push to main and a dispatch with exactly the target, mode, release and restore inputs',
      ),
    )
  }
  for (const [path, text] of workflows) {
    const on = workflowTop(text).get('on') ?? []
    if (
      yamlLines(text).some(line => FORBIDDEN_EVENTS.test(line.text)) ||
      namesIn(blockValue(on)).some(name => FORBIDDEN_EVENTS.test(name))
    ) {
      found.push(at(path, 'DPW-01', 'uses neither pull_request_target nor workflow_run'))
    }
    // A block scalar under on: (on: |-, a key's > value) holds text yamlLines skips, which GitHub reads as
    // an event's name or a filter.
    if (
      on.some(line => !/^\s*#/.test(line) && /^\s*(?:-\s+)?(?:[^\s:#][^:#]*:\s*)?[|>][^\s]*\s*(?:#.*)?$/.test(line))
    ) {
      found.push(at(path, 'DPW-01', 'writes on: with no block scalar, so every event it names is read'))
    }
    if (path === DEPLOY) continue
    const own = new Set(workflowJobs(text).map(job => job.id))
    for (const job of workflowJobs(text)) {
      if (jobNeeds(job).some(need => (JOB_IDS as readonly string[]).includes(need) && !own.has(need))) {
        found.push(at(path, 'DPW-01', `${job.id}: needs no deploy.yml job`))
      }
    }
  }
  let contexts: unknown[] = []
  try {
    const rules = (JSON.parse(ruleset) as { rules?: Array<{ type?: string; parameters?: Record<string, unknown> }> })
      .rules
    const checks = rules?.find(rule => rule.type === 'required_status_checks')?.parameters?.required_status_checks
    contexts = Array.isArray(checks) ? checks.map(check => (check as { context?: unknown }).context) : []
  } catch {
    contexts = []
  }
  if (
    !contexts.includes('check') ||
    !contexts.includes('migrations') ||
    contexts.some(context => (JOB_IDS as readonly unknown[]).includes(context))
  ) {
    found.push(at(RULESET, 'DPW-01', 'the required checks include check and migrations and name no deploy.yml job'))
  }
  return found
}

// --- DPW-02: permissions ---------------------------------------------------------------------------------

// ciSynthProblems' id-token clause, widened (C11-D62): no id-token or write-all anywhere, comments
// included, in any case, and no double-quoted scalar holding a backslash anywhere on a YAML line (a key,
// a value, a sequence item or a flow sequence's item), since an escape (id\x2Dtoken, pull_request\x5F…)
// could spell a word a rule looks for unseen.
const ID_TOKEN = /id-token|write-all/i
const ESCAPE = /"(?:[^"\\\n]|\\.)*\\/
const escaped = (text: string) => yamlLines(text).some(line => ESCAPE.test(line.text))

const SHAPE =
  'is written in the shape workflow.ts reads: two-space block nesting, each key once in its mapping, each value whole on its line'
// An if: as GitHub reads an expression: a plain scalar that is one ${{ … }} and nothing else (a comment
// aside), with no ${{ or }} inside it.
const IF_LINE = /^\s*(?:-\s+)?if: \$\{\{(?:(?!\}\}|\$\{\{).)*\}\}(?:\s+#.*)?$/

const describePermissions = (record: Readonly<Record<string, string>>) =>
  Object.entries(record)
    .map(([scope, level]) => `${scope}: ${level}`)
    .join(', ')

// A character the guard would read otherwise than GitHub's YAML reader or bash (DPW-02): a carriage return,
// which YAML reads as a line break (workflow.ts splits only at a newline, so what follows one, in a comment
// or a run, would be a step, a key or a command no rule reads); NEL, LS and PS, which YAML 1.1 readers
// break lines at too; any other control or format character (a vertical tab, a form feed, DEL, U+FEFF,
// the bidirectional ones); and any blank but a space (a no-break space, U+2003), which JavaScript reads as
// white space and bash as part of a word, so a # after one is no comment. The first such character a
// workflow holds, by its line and code point, never the text.
const UNREAD_CHARACTER = /(?![\t\n])[\p{C}\p{Zl}\p{Zp}]|(?! )\p{Zs}/u
const CHARACTERS =
  'a workflow holds only tabs, newlines and printable text: no carriage return, NEL, line or paragraph separator, other control or format character, or blank but a space or a tab'
function unreadCharacter(text: string): string | undefined {
  const match = UNREAD_CHARACTER.exec(text)
  if (match === null) return undefined
  const line = text.slice(0, match.index).split('\n').length
  const point = (match[0].codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')
  return `line ${line} holds U+${point}`
}

// DPW-02 (C11-D55): deploy.yml's top-level permissions are contents: read alone; each job's are exactly
// its own, an id-token in the five environment jobs alone and nowhere else in the file; no write-all,
// read-all or {}; every environment: a literal name; the file is block mappings (no flow mapping, anchor,
// alias or quoted key, which workflow.ts can't read), its block scalars literal (literalProblems), every
// if: a plain ${{ … }} with nothing beside it (IF_LINE), and it spells nothing with an escape. Every
// workflow is in the shape workflow.ts reads (shapeProblems: no anchor, alias, tag or flow mapping but
// {}), so none is read wrong, and holds only tabs, newlines and printable text (unreadCharacter). Every
// other workflow holds the id-token clause, spells nothing with an escape, names no environment, and gives
// no block scalar an indentation indicator (indicatorProblems).
export function permissionFindings(workflows: Texts): Finding[] {
  const found: Finding[] = []
  const deploy = workflows.get(DEPLOY) ?? ''
  const top = permissionsOf(workflowTop(deploy).get('permissions'))
  if (!(top instanceof Map) || !sameMap(top, READ)) {
    found.push(at(DEPLOY, 'DPW-02', 'the top-level permissions are contents: read alone'))
  }
  for (const { id, job } of jobsOf(deploy).values()) {
    const want = (JOB_PERMISSIONS as Readonly<Record<string, Readonly<Record<string, string>>>>)[id]
    const have = jobPermissions(job)
    if (want === undefined) found.push(at(DEPLOY, 'DPW-02', `${id}: is none of the fifteen jobs`))
    else if (!(have instanceof Map) || !sameMap(have, want)) {
      found.push(at(DEPLOY, 'DPW-02', `${id}: its permissions are exactly ${describePermissions(want)}`))
    }
    const environment = jobEnvironment(job)
    if (environment !== undefined && typeof environment !== 'string') {
      found.push(at(DEPLOY, 'DPW-02', `${id}: names its environment by a literal name`))
    }
  }
  const lines = deploy.split('\n')
  const spans = jobSpans(deploy)
  const outside = lines.filter((_, index) =>
    CREDENTIALED.every(id => {
      const span = spans.get(id)
      return span === undefined || index < span[0] || index >= span[1]
    }),
  )
  if (ID_TOKEN.test(outside.join('\n'))) {
    found.push(
      at(DEPLOY, 'DPW-02', 'only the five environment jobs ask for an id-token, and nothing asks for write-all'),
    )
  }
  const yaml = yamlLines(deploy).map(line => line.text)
  if (
    yaml.some(
      line =>
        /:\s*\{(?!\{)/.test(line.replace(/\$\{\{.*?\}\}/g, '')) ||
        /^\s*-\s*\{/.test(line) ||
        /(?:^|:\s+|-\s+)[&*][\w-]/.test(line) ||
        /^\s*(?:-\s+)?(?:["']|<<\s*:)/.test(line),
    )
  ) {
    found.push(at(DEPLOY, 'DPW-02', 'is written in block mappings: no flow mapping, anchor, alias or quoted key'))
  }
  if (escaped(deploy)) {
    found.push(
      at(DEPLOY, 'DPW-02', 'spells no key or value with an escape, which could name id-token or write-all unseen'),
    )
  }
  // Every if: a plain ${{ … }} and nothing beside it: GitHub reads anything else around the expression (a
  // space inside quotes, a block scalar's newline) as a string, always true, while the guard would read
  // the expression alone.
  if (yaml.some(line => /^\s*(?:-\s+)?if\s*:/.test(line) && !IF_LINE.test(line))) {
    found.push(
      at(
        DEPLOY,
        'DPW-02',
        `writes every if: as a plain \${{ … }} alone on its line: quoted, as a block scalar or with text beside it, GitHub reads a string, always true`,
      ),
    )
  }
  // A folded block scalar or an indentation indicator: GitHub hands bash another text than the guard read.
  if (literalProblems(deploy).length > 0) {
    found.push(
      at(
        DEPLOY,
        'DPW-02',
        'writes every block scalar literal (|, |- or |+), never folded (>) or with an indentation indicator',
      ),
    )
  }
  // Every workflow holds only tabs, newlines and printable text, read before anything else, so nothing
  // after a line break workflow.ts doesn't split at, or a blank bash doesn't, passes unread.
  for (const [path, text] of workflows) {
    const odd = unreadCharacter(text)
    if (odd !== undefined) found.push(at(path, 'DPW-02', `${odd}, but ${CHARACTERS}`))
  }
  // Every workflow is in the shape workflow.ts reads, so no step, key or value is read wrong or passes
  // unread (a step's keys at another indent, a run continued on the next line, a key given twice).
  for (const [path, text] of workflows) {
    if (shapeProblems(text).length > 0) found.push(at(path, 'DPW-02', SHAPE))
  }
  for (const [path, text] of workflows) {
    if (path === DEPLOY) continue
    if (ID_TOKEN.test(text)) found.push(at(path, 'DPW-02', 'no job may ask for an id-token'))
    if (escaped(text)) {
      found.push(
        at(path, 'DPW-02', 'no key or value is spelled with an escape, which could name id-token or write-all unseen'),
      )
    }
    if (yamlLines(text).some(line => /^\s*(?:-\s+)?environment\s*:/.test(line.text))) {
      found.push(at(path, 'DPW-02', 'names no environment'))
    }
    if (indicatorProblems(text).length > 0) {
      found.push(
        at(
          path,
          'DPW-02',
          'gives no block scalar an indentation indicator, which sets an indent workflow.ts doesn’t take',
        ),
      )
    }
  }
  return found
}

// --- DPW-03: which jobs hold AWS credentials ------------------------------------------------------------------

const runsAws = (step: WorkflowStep) =>
  isCredentials(step) ||
  (step.run !== undefined && /(?<![\w$.-])(?:aws|skopeo)(?![\w-])|"\$CDK"|\$\{?CDK\b/.test(shellViews(step.run).code))

// DPW-03 (C11-D55, C11-D56): the jobs that run aws, the CDK CLI or skopeo, or take credentials, are exactly
// nonprod, rollback-nonprod, prod-plan, prod and rollback-prod, each naming its own environment (nonprod,
// nonprod, prod-plan, prod, prod) and taking its credentials through the credentials action; no other job
// names an environment, so none other can assume a deploy role.
export function credentialJobFindings(workflows: Texts): Finding[] {
  const found: Finding[] = []
  for (const { id, job, steps } of jobsOf(workflows.get(DEPLOY) ?? '').values()) {
    const want = ENVIRONMENT_JOBS[id]
    const environment = jobEnvironment(job)
    if (want === undefined) {
      if (steps.some(runsAws)) {
        found.push(
          at(
            DEPLOY,
            'DPW-03',
            `${id}: runs aws, the CDK CLI or skopeo, or takes credentials, which only the five environment jobs may`,
          ),
        )
      }
      if (environment !== undefined) found.push(at(DEPLOY, 'DPW-03', `${id}: names no environment`))
      continue
    }
    if (environment !== want) found.push(at(DEPLOY, 'DPW-03', `${id}: names the environment ${want}`))
    if (!steps.some(isCredentials)) {
      found.push(at(DEPLOY, 'DPW-03', `${id}: takes its credentials through the credentials action`))
    }
  }
  return found
}

// --- DPW-04: action pins -------------------------------------------------------------------------------------

const PIN =
  /^(?:actions\/checkout|actions\/setup-node|actions\/upload-artifact|actions\/download-artifact|aws-actions\/configure-aws-credentials)@[0-9a-f]{40} # v\d+\.\d+\.\d+$/

// DPW-04 (C11-D48, C11-D79): every uses: in deploy.yml is one of the five actions at a 40-hex commit with its
// version in a comment; no local action, docker:// image or reusable workflow.
export function actionPinFindings(workflows: Texts): Finding[] {
  const text = workflows.get(DEPLOY) ?? ''
  const spans = jobSpans(text)
  const found = new Set<Finding>()
  for (const { index, text: line } of yamlLines(text)) {
    const uses = /(?:^|[\s{,])uses\s*:\s*(.*)$/.exec(line)
    if (!uses) continue
    if (PIN.test((uses[1] ?? '').trim())) continue
    const job = [...spans].find(([, [from, to]]) => index >= from && index < to)?.[0] ?? 'the top level'
    found.add(
      at(
        DEPLOY,
        'DPW-04',
        `${job}: every uses: is checkout, setup-node, upload-artifact, download-artifact or the credentials action, at a 40-hex commit with its version comment`,
      ),
    )
  }
  return [...found]
}

// --- DPW-05: timeouts and concurrency ---------------------------------------------------------------------

const GROUPS = /deploy-(?:nonprod|prod)/i
const GROUP_OF: Readonly<Record<string, string>> = {
  nonprod: 'deploy-nonprod',
  'rollback-nonprod': 'deploy-nonprod',
  prod: 'deploy-prod',
  'rollback-prod': 'deploy-prod',
}

// DPW-05 (C11-D47, C11-D79): every job has a timeout at most its figure and sets cache-mode: none; nonprod and
// rollback-nonprod hold exactly the group deploy-nonprod and prod and rollback-prod deploy-prod, each with
// cancel-in-progress false; no other job and no workflow-level concurrency; and no other workflow names
// either group in any letter case, or sets a concurrency group by an expression, which could come to
// either (groups are the repository's and ignore case, so one there could hold or cancel a deploy).
export function timeoutAndGroupFindings(workflows: Texts): Finding[] {
  const found: Finding[] = []
  const text = workflows.get(DEPLOY) ?? ''
  for (const { id, job } of jobsOf(text).values()) {
    const most = (TIMEOUTS as Readonly<Record<string, number>>)[id]
    const minutes = job.timeoutMinutes
    if (most === undefined || minutes === undefined || !Number.isInteger(minutes) || minutes < 1 || minutes > most) {
      found.push(at(DEPLOY, 'DPW-05', `${id}: timeout-minutes is set, at most ${most ?? 0}`))
    }
    if (jobScalar(job, 'cache-mode') !== 'none') found.push(at(DEPLOY, 'DPW-05', `${id}: sets cache-mode: none`))
    const group = GROUP_OF[id]
    const concurrency = jobConcurrency(job)
    if (group === undefined) {
      if (concurrency !== undefined) found.push(at(DEPLOY, 'DPW-05', `${id}: holds no concurrency group`))
    } else if (
      concurrency?.group !== group ||
      concurrency.cancelInProgress !== 'false' ||
      concurrency.other.length > 0 ||
      job.keys.get('concurrency')?.some(line => line.includes('${{'))
    ) {
      found.push(at(DEPLOY, 'DPW-05', `${id}: its concurrency is the group ${group} with cancel-in-progress false`))
    }
  }
  if (concurrencyOf(workflowTop(text).get('concurrency')) !== undefined) {
    found.push(at(DEPLOY, 'DPW-05', 'has no workflow-level concurrency'))
  }
  const spans = jobSpans(text)
  text.split('\n').forEach((line, index) => {
    if (!GROUPS.test(line)) return
    const job = [...spans].find(([, [from, to]]) => index >= from && index < to)?.[0]
    const group = job === undefined ? undefined : GROUP_OF[job]
    if (group === undefined || line !== `      group: ${group}`) {
      found.push(
        at(
          DEPLOY,
          'DPW-05',
          `${job ?? 'the top level'}: names deploy-nonprod or deploy-prod only as a deploy job's group`,
        ),
      )
    }
  })
  for (const [path, other] of workflows) {
    if (path === DEPLOY) continue
    if (GROUPS.test(other)) {
      found.push(at(path, 'DPW-05', 'names neither deploy-nonprod nor deploy-prod, in any letter case'))
    }
    if (concurrencyBlocks(other).some(block => block.includes('${{'))) {
      found.push(
        at(
          path,
          'DPW-05',
          'sets no concurrency group by an expression, which could come to deploy-nonprod or deploy-prod',
        ),
      )
    }
  }
  return found
}

// Each concurrency: key in a workflow, at any depth (the top level's or a job's), with its value and every
// line under it, comments blanked.
function concurrencyBlocks(text: string): string[] {
  const lines = text.split('\n').map(line => line.replace(/(^|\s)#.*$/, '$1'))
  const blocks: string[] = []
  lines.forEach((line, index) => {
    const key = /^(\s*)(?:-\s+)?concurrency\s*:(.*)$/.exec(line)
    if (!key) return
    const depth = (key[1] ?? '').length
    const block = [key[2] ?? '']
    for (const next of lines.slice(index + 1)) {
      if (next.trim() !== '' && next.length - next.trimStart().length <= depth) break
      block.push(next)
    }
    blocks.push(block.join('\n'))
  })
  return blocks
}

// --- DPW-06: the deploy jobs' steps ------------------------------------------------------------------------

// What each deploy job calls aws_check with, and the environment it reads (DPW-06).
export const AWS_CHECK_CALLS: Readonly<Record<string, string>> = {
  nonprod: 'case "$MODE" in\n  drill-break | drill-smoke) aws_check drill ;;\n  *) aws_check "$MODE" ;;\nesac',
  'rollback-nonprod': 'aws_check auto',
  prod: 'if [ "$TARGET" = restore ]; then\n  aws_check restore\nelse\n  aws_check "$MODE"\nfi',
  'rollback-prod': 'aws_check auto',
}
const RELEASE_OUTPUT = expr('steps.release.outputs.release')
const PREVIOUS_OUTPUT = expr('steps.release.outputs.previous')
const MODE = expr('needs.gate.outputs.mode')
const AWS_CHECK_ENV: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  nonprod: { RELEASE: RELEASE_OUTPUT, MODE, FIRST: expr('needs.gate.outputs.first_nonprod') },
  'rollback-nonprod': {
    RELEASE: RELEASE_OUTPUT,
    PREVIOUS: PREVIOUS_OUTPUT,
    REPLACED: expr('needs.nonprod.outputs.replaced'),
    FIRST: expr('needs.gate.outputs.first_nonprod'),
  },
  prod: {
    RELEASE: RELEASE_OUTPUT,
    MODE,
    TARGET: expr('needs.gate.outputs.target'),
    RESTORE: expr('needs.gate.outputs.restore'),
    FIRST: expr('needs.gate.outputs.first_prod'),
  },
  'rollback-prod': {
    RELEASE: RELEASE_OUTPUT,
    PREVIOUS: PREVIOUS_OUTPUT,
    REPLACED: expr('needs.prod.outputs.replaced'),
    FIRST: expr('needs.gate.outputs.first_prod'),
  },
}

// Where each CLI line may run (DPW-06): a forward deploy and Services in nonprod and prod, the drill in
// nonprod, a rollback in the four deploy jobs, restore=down in prod, the diffs in prod-plan.
const CDK_LINE_JOBS: Readonly<Record<string, readonly string[]>> = {
  [CDK_DEPLOY_FORWARD]: ['nonprod', 'prod'],
  [CDK_DEPLOY_SERVICES]: ['nonprod', 'prod'],
  [CDK_DEPLOY_DRILL]: ['nonprod'],
  [CDK_DEPLOY_ROLLBACK]: ['nonprod', 'prod', 'rollback-nonprod', 'rollback-prod'],
  [CDK_DEPLOY_DOWN]: ['prod'],
  [CDK_DIFF_PROD]: ['prod-plan'],
  [CDK_DIFF_ROLLBACK]: ['prod-plan'],
}

// Each job's STAGE (DPW-06): set once, at the job, from a literal, or for prod the one expression that
// yields restore for a restore and prod otherwise.
export const STAGES: Readonly<Record<string, string>> = {
  nonprod: 'nonprod',
  'rollback-nonprod': 'nonprod',
  'prod-plan': 'prod',
  prod: expr("needs.gate.outputs.target == 'restore' && 'restore' || 'prod'"),
  'rollback-prod': 'prod',
}

// When each deploy job's probe and migrate run (DPW-06): the probe after every Services deploy but a
// drill-break's (which changes nothing) and restore=down's; migrate for a deploy alone, as the push.
const PROBE_IF: Readonly<Record<string, string>> = {
  nonprod: expr("needs.gate.outputs.mode != 'drill-break'"),
  'rollback-nonprod': expr("steps.aws.outputs.go == 'true'"),
  prod: expr("!(needs.gate.outputs.target == 'restore' && needs.gate.outputs.restore == 'down')"),
  'rollback-prod': expr("steps.aws.outputs.go == 'true'"),
}
export const PUSH_IF: Readonly<Record<string, string>> = {
  nonprod: expr("needs.gate.outputs.mode == 'deploy'"),
  prod: expr("needs.gate.outputs.mode == 'deploy' && needs.gate.outputs.target == 'prod'"),
}
const RESTORE_DOWN_IF = expr("needs.gate.outputs.target == 'restore' && needs.gate.outputs.restore == 'down'")
// The if: of each step that runs a CLI line, by its job and line (DPW-06): each line only in the modes that
// call for it, and a rollback job's only once AWS_CHECK said go.
const FORWARD_IF: Readonly<Record<string, string>> = {
  nonprod: expr("needs.gate.outputs.mode == 'deploy' || needs.gate.outputs.mode == 'drill-smoke'"),
  prod: expr(
    "(needs.gate.outputs.mode == 'deploy' && needs.gate.outputs.target == 'prod') || (needs.gate.outputs.target == 'restore' && needs.gate.outputs.restore == 'up')",
  ),
}
const GO_IF = expr("steps.aws.outputs.go == 'true'")
const CLI_STEP_IF: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  nonprod: {
    [CDK_DEPLOY_FORWARD]: FORWARD_IF.nonprod ?? '',
    [CDK_DEPLOY_SERVICES]: FORWARD_IF.nonprod ?? '',
    [CDK_DEPLOY_ROLLBACK]: expr("needs.gate.outputs.mode == 'rollback'"),
    [CDK_DEPLOY_DRILL]: expr("needs.gate.outputs.mode == 'drill-break'"),
  },
  'rollback-nonprod': { [CDK_DEPLOY_ROLLBACK]: GO_IF },
  prod: {
    [CDK_DEPLOY_FORWARD]: FORWARD_IF.prod ?? '',
    [CDK_DEPLOY_SERVICES]: FORWARD_IF.prod ?? '',
    [CDK_DEPLOY_ROLLBACK]: expr("needs.gate.outputs.mode == 'rollback' && needs.gate.outputs.target == 'prod'"),
    [CDK_DEPLOY_DOWN]: RESTORE_DOWN_IF,
  },
  'rollback-prod': { [CDK_DEPLOY_ROLLBACK]: GO_IF },
}
// GitHub's status functions: an if: that calls one isn't joined to success(), so its step or job runs
// after a failure before it.
const STATUS_FUNCTION = /\b(?:always|success|failure|cancelled)\s*\(/i
const GOES_ON =
  "lets no failure pass: no continue-on-error, and no step's if: calls always(), success(), failure() or cancelled()"

const FORBIDDEN_RUN_FLAGS =
  /(?<![\w-])(?:--cli-input-json|--cli-input-yaml|--generate-cli-skeleton|--enable-execute-command|--tags)(?![\w-])/
const ONE_OFF_LINES = new Set(ONE_OFF.split('\n').map(line => line.trim()))
const stepWith = (steps: readonly WorkflowStep[], line: string) =>
  steps.findIndex(step => step.run !== undefined && lineIndexOf(step.run.split('\n'), line) >= 0)

// DPW-06 (C11-D52, C11-D53; TECH-SPEC T24 items 5, 11, 13, 15 and 18): AWS_CHECK, byte for byte, is the step
// right after the credentials action in each deploy job, before any push or deploy. Every run-task line
// is RUN_TASK_MIGRATE or RUN_TASK_PROBE, with its kind's NET_JQ line, the probe's override OVERRIDES_JQ's
// alone, and its job's own TOKEN; no other aws option that could widen a one-off. The probe is its
// canonical run, after every Services deploy but restore=down's; migrate is its canonical run, in nonprod
// and prod alone, for a deploy, after the push and before Services. Only the one-off's end reads a
// task's log. Every CLI line is a canonical one in a job that may run it, naming its stacks through
// "$STAGE", which each job sets once, in a step whose if: is its own: a forward deploy is Platform, Data
// and Tasks, then migrate, then Services; restore=down is RESTORE_DOWN's three calls; a rollback job's
// only once AWS_CHECK said go. No failure passes: nothing in the workflow has continue-on-error, no
// step's if: calls a status function, and a credentialed job runs every step up to its credentials
// action (and AWS_CHECK after them) unconditionally, but its downloads.
export function deployStepFindings(workflows: Texts): Finding[] {
  const found = new Set<Finding>()
  const add = (id: string, rule: string) => found.add(at(DEPLOY, 'DPW-06', `${id}: ${rule}`))
  for (const { id, job, steps } of jobsOf(workflows.get(DEPLOY) ?? '').values()) {
    const deploy = DEPLOY_JOBS[id]
    // STAGE, set once at the job.
    const env = blockValue(job.keys.get('env') ?? [])
    const stage = isMap(env) ? env.get('STAGE') : undefined
    const wantStage = STAGES[id]
    if (wantStage === undefined ? stage !== undefined : stage !== wantStage) {
      add(id, wantStage === undefined ? 'sets no STAGE' : `sets STAGE once, at the job, to ${wantStage}`)
    }
    const tokens = new Set(
      deploy === undefined
        ? []
        : deploy.rollback
          ? [tokenLine('probe', deploy.stage, 'rollback')]
          : [tokenLine('migrate', deploy.stage, 'deploy'), tokenLine('probe', deploy.stage, 'deploy')],
    )
    for (const step of steps) {
      if (step.env.has('STAGE')) add(id, `sets STAGE once, at the job, to ${wantStage ?? 'nothing'}`)
      if (step.run === undefined) continue
      const run = step.run
      for (const line of runLines(run)) {
        const raw = line.raw.trim()
        if (line.text.includes('run-task') && raw !== RUN_TASK_MIGRATE && raw !== RUN_TASK_PROBE) {
          add(id, 'every aws ecs run-task line is RUN_TASK_MIGRATE or RUN_TASK_PROBE byte for byte')
        }
        if (/--overrides(?![\w-])/.test(line.text) && raw !== RUN_TASK_PROBE) {
          add(id, "--overrides is on the probe's run-task line alone")
        }
        if (FORBIDDEN_RUN_FLAGS.test(line.text)) {
          add(
            id,
            'passes no --cli-input-json, --cli-input-yaml, --generate-cli-skeleton, --enable-execute-command or --tags',
          )
        }
        const net = /(?:^|[\s;&|(])NET_(MIGRATE|PROBE)=/.exec(line.code)
        if (net && raw !== NET_JQ[net[1] === 'MIGRATE' ? 'migrate' : 'probe']) {
          add(
            id,
            "a one-off's network configuration is NET_JQ's: its kind's own group, the isolated subnets, no public IP",
          )
        }
        if (/(?:^|[\s;&|(])OVERRIDES=/.test(line.code) && raw !== OVERRIDES_JQ) {
          add(id, "the probe's override is OVERRIDES_JQ's, PROBE_TARGETS alone")
        }
        if (/(?:^|[\s;&|(])TOKEN=/.test(line.code) && !tokens.has(raw)) {
          add(id, 'its TOKEN is <kind>-<env>-<deploy or rollback>-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT, its own')
        }
        if (line.text.includes('get-log-events') && !(ONE_OFF_LINES.has(raw) && run.includes(ONE_OFF))) {
          add(id, "only the one-off's end reads a task's log, and prints only its kind's lines")
        }
        if (STAGE_ASSIGNMENT.test(line.code)) {
          add(id, `sets STAGE once, at the job, to ${wantStage ?? 'nothing'}`)
        }
        const cdk = /"\$CDK"|\$\{?CDK\b/.test(line.text) && !/(?:^|[\s;&|(])CDK=/.test(line.code)
        if (cdk && !(CDK_LINE_JOBS[raw] ?? []).includes(id)) {
          add(id, 'every CLI line is one of the canonical deploy and diff lines, in a job that may run it')
        }
      }
      // A one-off's step holds only its canonical parts.
      const probe = run.includes('one_off_end probe') || run.includes(RUN_TASK_PROBE) || step.name === 'Probe'
      if (probe && (deploy === undefined || run !== probeRun(deploy.stage, deploy.rollback ? 'rollback' : 'deploy'))) {
        add(id, "the probe's step is the preamble, its TOKEN, TASKS_OUTPUTS, ONE_OFF and PROBE, byte for byte")
      }
      const migrate = run.includes('one_off_end migrate') || run.includes(RUN_TASK_MIGRATE) || step.name === 'Migrate'
      if (migrate) {
        const head =
          deploy === undefined ? undefined : [PREAMBLE, TASKS_OUTPUTS, ONE_OFF, migrateRun(deploy.stage)].join('\n')
        if (deploy === undefined || deploy.rollback) add(id, 'runs no migrate: only nonprod and prod do, for a deploy')
        else if (head === undefined || !run.startsWith(`${head}\n`)) {
          add(
            id,
            "migrate's step is the preamble, TASKS_OUTPUTS, ONE_OFF and migrate's run, byte for byte, with no override",
          )
        }
      }
    }
    // No failure passes: a failed AWS_CHECK, gate or check stops its job, and a failed job its dependants.
    if (
      job.keyNames.includes('continue-on-error') ||
      steps.some(step => step.keyNames.includes('continue-on-error') || STATUS_FUNCTION.test(step.if ?? ''))
    ) {
      add(id, GOES_ON)
    }
    const credentials = credentialsAt(steps)
    // Every step up to the credentials (and AWS_CHECK after them) runs, so none of the checks is skipped.
    if (ENVIRONMENT_JOBS[id] !== undefined) {
      const last = deploy === undefined ? credentials : credentials + 1
      if (
        steps
          .slice(0, last + 1)
          .some(step => step.if !== undefined && !step.uses?.startsWith('actions/download-artifact@'))
      ) {
        add(
          id,
          'runs every step up to its credentials action, and AWS_CHECK after it, unconditionally, but its downloads',
        )
      }
    }
    if (deploy === undefined) continue
    // Each CLI line only in the modes that call for it.
    for (const [line, want] of Object.entries(CLI_STEP_IF[id] ?? {})) {
      if (
        steps.some(step => step.run !== undefined && lineIndexOf(step.run.split('\n'), line) >= 0 && step.if !== want)
      ) {
        add(id, "runs each CLI line only in the modes that call for it: its step's if: as written")
      }
    }
    // AWS_CHECK, right after the credentials, before anything moves.
    const check = steps[credentials + 1]
    const wantCheck = [PREAMBLE, AWS_CHECK, AWS_CHECK_CALLS[id] ?? ''].join('\n')
    const moved = steps
      .slice(0, credentials + 2)
      .some(step => step.run !== undefined && /skopeo copy|"\$CDK" deploy/.test(step.run))
    if (
      credentials < 0 ||
      check?.run !== wantCheck ||
      check.id !== 'aws' ||
      !sameMap(check.env, AWS_CHECK_ENV[id] ?? {}) ||
      moved
    ) {
      add(
        id,
        'AWS_CHECK, byte for byte, is the step right after the credentials action, before any push or deploy, called with its mode',
      )
    }
    // The probe: one, after every deploy of Services.
    const probes = steps.flatMap((step, index) => (step.run?.includes('one_off_end probe') ? [index] : []))
    const lastDeploy = Math.max(
      stepWith(steps, CDK_DEPLOY_SERVICES),
      stepWith(steps, CDK_DEPLOY_ROLLBACK),
      stepWith(steps, CDK_DEPLOY_FORWARD),
    )
    const probe = probes[0]
    if (probes.length !== 1 || probe === undefined || probe < lastDeploy || steps[probe]?.if !== PROBE_IF[id]) {
      add(id, 'probes once, after every Services deploy but restore=down’s')
    }
    if (deploy.rollback) continue
    // The forward order, and migrate's place in it.
    const push = steps.findIndex(step => step.id === 'push')
    const forward = stepWith(steps, CDK_DEPLOY_FORWARD)
    const services = stepWith(steps, CDK_DEPLOY_SERVICES)
    const migrates = steps.flatMap((step, index) => (step.run?.includes('one_off_end migrate') ? [index] : []))
    const migrate = migrates[0]
    if (
      migrates.length !== 1 ||
      migrate === undefined ||
      push < 0 ||
      !(push < forward && forward < migrate && migrate < services) ||
      steps[migrate]?.if !== PUSH_IF[id]
    ) {
      add(
        id,
        'a forward deploy is the push, Platform, Data and Tasks, then migrate (for a deploy alone), then Services',
      )
    }
    if (id === 'prod') {
      const down = steps.findIndex(step => step.run?.includes(RESTORE_DOWN))
      const downLines = steps.filter(
        step => step.run !== undefined && lineIndexOf(step.run.split('\n'), CDK_DEPLOY_DOWN) >= 0,
      )
      if (down < 0 || steps[down]?.if !== RESTORE_DOWN_IF || downLines.length !== 1 || downLines[0] !== steps[down]) {
        add(
          id,
          'restore=down takes Services, then Data, then Platform down, one call each, each only for a stack that exists and has settled',
        )
      }
    }
  }
  return [...found]
}

// --- DPW-07: what a log, a summary or an output can show --------------------------------------------------

const SECRETS: Readonly<Record<string, readonly string[]>> = {
  nonprod: ['AWS_DEPLOY_ROLE', 'AWS_ACCOUNT_ID'],
  'rollback-nonprod': ['AWS_DEPLOY_ROLE', 'AWS_ACCOUNT_ID'],
  'prod-plan': ['AWS_DIFF_ROLE', 'AWS_ACCOUNT_ID'],
  prod: ['AWS_DEPLOY_ROLE', 'AWS_ACCOUNT_ID'],
  'rollback-prod': ['AWS_DEPLOY_ROLE', 'AWS_ACCOUNT_ID'],
}
const credentialsWith = (role: string): Readonly<Record<string, string>> => ({
  'role-to-assume': `\${{ secrets.${role} }}`,
  'aws-region': 'ap-southeast-1',
  'allowed-account-ids': expr('secrets.AWS_ACCOUNT_ID'),
  'role-session-name': `gha-${expr('github.run_id')}-${expr('github.run_attempt')}`,
  'role-duration-seconds': '3600',
  'mask-aws-account-id': 'true',
  'translate-env-variables': 'false',
})

const TRACE =
  /\bset\s+(?:-[A-Za-z]*x[A-Za-z]*\b|[-+]o\s+xtrace\b)|\bprintenv\b|\b(?:export|declare|typeset)\s+-[A-Za-z]*p\b/
// env as a word outside quotes and comments: as a command (env -0, env -u X) or handed to one (xargs env,
// jq -n env), each of which prints the environment. No run uses it.
const ENV_WORD = /(?<![\w.$/-])env(?![\w./=-])/
// What prints the environment in a credentialed run beyond ENV_WORD, which reads no quoted text (C11-D61):
// in quoted text, jq's env builtin and $ENV in a program (env as an object's key, env: …, prints nothing);
// anywhere, a /proc file (environ) and an AWS_ variable's expansion, whose value is a credential. No run
// uses any.
const QUOTED_ENV = /(?<![\w.$"-])env(?![\w"-])(?!\s*:)|\$ENV\b/
const CREDENTIAL_READ = /\/proc\/|\$\{?!?AWS_/
// A line's quoted text alone, everything else blanked: the code view writes quoted text as underscores.
const quotedText = (line: { text: string; code: string }) =>
  [...line.text].map((c, i) => (line.code[i] === '_' ? c : ' ')).join('')
// The builtins that print every variable they're given no name for (declare -x, local, readonly).
const PRINTS_VARIABLES = ['declare', 'typeset', 'export', 'readonly', 'local']
// The preamble's functions and the sed mask runs, which a credentialed run defines only in its preamble
// and never unsets or shadows by an alias, so every later run …, $(get …) and summary write is filtered.
const FILTER_FUNCTIONS = ['mask', 'run', 'get', 'sed']
const PREAMBLE_LINES = PREAMBLE.split('\n').length
// What comes right before a write to the job summary: mask as a command after a pipe (or first on its line,
// a pipe's next line), then tee -a or >>.
const SUMMARY_THROUGH_MASK = /(?:^|\|)\s*mask\s*(?:\|\s*tee\s+-a\s+|>>\s*)"\$\{?$/
const AWS_ENV_ASSIGNMENT = assigns('AWS_[A-Z0-9_]*|ROLE_TO_ASSUME')

// DPW-07 (C11-D61): nothing a run prints shows what it shouldn't. No set -x, set -o xtrace, env as a word
// outside quotes, bare set, printenv, export -p, declare -p or a declare, export, local or readonly given no
// name; in a credentialed run no jq program's env or $ENV, /proc file or AWS_ variable's expansion; no ${{ }}
// inside a run (inputs and outputs come through env:); secrets. names only the role and the account id in
// the five environment jobs, and never GITHUB_TOKEN; in each environment job the account id is masked
// before the credentials action, every run after it starts with the preamble, whose mask, run and get no
// later definition, alias or unset changes, every aws, CDK and skopeo command is run … or $(get …), get
// only ever first in a $( … ), whose output is kept (the registry login alone piped into skopeo login,
// then the filter), each write to the job summary goes through mask, the credentials action takes
// exactly its seven inputs, and no AWS_ variable or ROLE_TO_ASSUME is set.
export function maskingFindings(workflows: Texts): Finding[] {
  const found = new Set<Finding>()
  const text = workflows.get(DEPLOY) ?? ''
  const add = (where: string, rule: string) => found.add(at(DEPLOY, 'DPW-07', `${where}: ${rule}`))
  const spans = jobSpans(text)
  text.split('\n').forEach((line, index) => {
    const job = [...spans].find(([, [from, to]]) => index >= from && index < to)?.[0]
    const allowed = job === undefined ? [] : (SECRETS[job] ?? [])
    for (const match of line.matchAll(/\bsecrets\b(?:\s*\.\s*(\w+))?/g)) {
      if (match[1] === undefined || !allowed.includes(match[1])) {
        add(
          job ?? 'the top level',
          allowed.length === 0 ? 'names no secret' : `names no secret but ${allowed.join(' and ')}, never GITHUB_TOKEN`,
        )
      }
    }
  })
  for (const { id, job, steps } of jobsOf(text).values()) {
    const credentialed = ENVIRONMENT_JOBS[id] !== undefined
    const credentials = credentialsAt(steps)
    steps.forEach((step, index) => {
      const where = `${id} (${label(step, index)})`
      if (credentialed && Object.keys(Object.fromEntries(step.env)).some(key => /^AWS_|^ROLE_TO_ASSUME$/.test(key))) {
        add(id, 'sets no AWS_ variable and no ROLE_TO_ASSUME')
      }
      if (step.run === undefined) return
      const run = step.run
      if (run.includes('${{')) add(where, 'takes inputs and outputs through env:, never an expression in its run')
      const lines = runLines(run)
      const read = readShell(run)
      const commands = commandsOf(run, read)
      // A run of a job that neither holds credentials nor writes records is read by the table here, the
      // others' by DPW-10 and DPW-13.
      const refused = refusedAt(where, read)
      if (refused !== undefined && !credentialed && !RECORD_JOBS.includes(id)) add(refused, AS_BASH)
      // env or printenv, by name or path, as a command or a word handed to one.
      const printsEnvironment = read.commands.some(
        command =>
          /(?:^|\/)(?:env|printenv)$/.test(command.name ?? '') ||
          command.args.some(arg => !arg.quoted && /(?:^|\/)(?:env|printenv)$/.test(arg.value ?? '')),
      )
      if (
        printsEnvironment ||
        lines.some(line => TRACE.test(line.code) || ENV_WORD.test(line.code)) ||
        commands.some(
          command =>
            (['env', 'set', 'declare', 'typeset', 'export'].includes(command.word) &&
              command.prefixes.length === 0 &&
              /^\s*(?:$|[|;&>)])/.test(
                (lines[command.line]?.code ?? '').slice(
                  (lines[command.line]?.code ?? '').indexOf(command.word) + command.word.length,
                ),
              )) ||
            (PRINTS_VARIABLES.includes(command.word) && /^(?:\s+[-+]\S+)*\s*$/.test(command.tail)),
        )
      ) {
        add(
          where,
          'runs no set -x, set -o xtrace, env, printenv, export -p or declare -p, and no set, declare, export, local or readonly given no name',
        )
      }
      for (const command of commands) {
        const wrapped = command.word === '"$CDK"' ? ['run'] : ['run', 'get']
        const tool = command.word === 'aws' || command.word === 'skopeo' || /^"?\$\{?CDK\b/.test(command.word)
        const login = (lines[command.line]?.raw.trim() ?? '') === SKOPEO_LOGIN
        // get's output is kept for use, never printed: it is the first command of a $( … ), but in the
        // registry login, which pipes the password into skopeo login.
        const prefix = command.prefixes[0] ?? ''
        if (
          tool &&
          !(login && command.word === 'skopeo') &&
          !(
            command.prefixes.length === 1 &&
            wrapped.includes(prefix) &&
            (prefix !== 'get' || command.substituted || login)
          )
        ) {
          add(where, 'runs every aws, CDK and skopeo command as run … or $(get …)')
        }
      }
      if (!credentialed) return
      if (
        read.commands.some(command =>
          [
            ...command.args,
            ...command.assignments.map(each => each.value),
            ...command.redirections.flatMap(each => each.target ?? []),
          ].some(word => word.expands.some(name => name.startsWith('AWS_'))),
        ) ||
        lines.some(
          line => CREDENTIAL_READ.test(line.text) || (/env|ENV/.test(line.text) && QUOTED_ENV.test(quotedText(line))),
        )
      ) {
        add(
          where,
          'hands no jq program env or $ENV, reads no /proc file and expands no AWS_ variable, any of which prints the credentials',
        )
      }
      const preambled = run === PREAMBLE || run.startsWith(`${PREAMBLE}\n`)
      if (credentials >= 0 && index > credentials && !preambled) {
        add(where, 'a run after the credentials action starts with the preamble')
      }
      if (
        definitionsOf(run, read).some(
          each => FILTER_FUNCTIONS.includes(each.name) && !(preambled && each.line < PREAMBLE_LINES),
        ) ||
        commands.some(
          command =>
            command.word === 'alias' ||
            (command.word === 'unset' &&
              new RegExp(String.raw`(?:^|\s)(?:-[A-Za-z]*f|${FILTER_FUNCTIONS.join('|')})(?=\s|$)`).test(command.tail)),
        )
      ) {
        add(
          where,
          'defines mask, run and get only in its preamble, and no later definition, alias or unset changes them',
        )
      }
      // A run's own write to the summary is >> from mask, or tee -a straight after mask, in a pipeline after
      // what it filters; the summary named in no other word.
      const summary = (word: ShellWord | undefined) => word?.raw.includes('GITHUB_STEP_SUMMARY') === true
      if (
        read.commands.some(command => {
          const toSummary = command.redirections.filter(each => summary(each.target))
          const teed = command.name === 'tee' && command.args.some(summary)
          return (
            toSummary.some(each => each.op !== '>>' || command.name !== 'mask' || command.previous === undefined) ||
            (teed && command.previous !== 'mask') ||
            (!teed && command.args.some(summary)) ||
            command.assignments.some(each => summary(each.value))
          )
        })
      ) {
        add(where, 'writes the job summary only through mask')
      }
      for (const line of lines) {
        // Each write to the summary on its own: piped through mask straight into it.
        const writes = [...line.text.matchAll(/GITHUB_STEP_SUMMARY/g)]
        if (writes.some(write => !SUMMARY_THROUGH_MASK.test(line.text.slice(0, write.index)))) {
          add(where, 'writes the job summary only through mask')
        }
        if (AWS_ENV_ASSIGNMENT.test(line.code)) add(id, 'sets no AWS_ variable and no ROLE_TO_ASSUME')
      }
    })
    if (!credentialed) continue
    const jobEnv = blockValue(job.keys.get('env') ?? [])
    if (isMap(jobEnv) && [...jobEnv.keys()].some(key => /^AWS_|^ROLE_TO_ASSUME$/.test(key))) {
      add(id, 'sets no AWS_ variable and no ROLE_TO_ASSUME')
    }
    const mask = steps.findIndex(
      step =>
        step.run === 'echo "::add-mask::$ACCOUNT_ID"' && step.env.get('ACCOUNT_ID') === expr('secrets.AWS_ACCOUNT_ID'),
    )
    if (mask < 0 || credentials < 0 || mask > credentials) {
      add(id, 'masks secrets.AWS_ACCOUNT_ID (::add-mask::) before the credentials action')
    }
    const role = id === 'prod-plan' ? 'AWS_DIFF_ROLE' : 'AWS_DEPLOY_ROLE'
    for (const step of steps.filter(isCredentials)) {
      if (!sameMap(step.with, credentialsWith(role))) {
        add(
          id,
          "the credentials action's with: is exactly role-to-assume, aws-region, allowed-account-ids, role-session-name, role-duration-seconds, mask-aws-account-id: true and translate-env-variables: false",
        )
      }
    }
  }
  return [...found]
}

// --- DPW-08: the way to prod -------------------------------------------------------------------------------

const has = (run: string | undefined, ...parts: readonly string[]) =>
  run !== undefined && parts.every(part => run.includes(part))
// Each fast re-check's run, pinned, and the record id it compares.
const RECHECK: Readonly<Record<string, { record: string; run: string }>> = {
  nonprod: { record: expr('needs.gate.outputs.current_nonprod_id'), run: FAST_RECHECK_NONPROD },
  prod: { record: expr('needs.prod-gate.outputs.current_prod_id'), run: FAST_RECHECK_PROD },
}
const READS_CHECKS = /check-runs|check-suites|commits\/[^/\s"]+\/status|\/statuses\/|\bcheck_runs\b/
// Each smoke and the job whose read-back it judges (DPW-08).
const SMOKES: Readonly<Record<string, string>> = {
  'smoke-nonprod': 'nonprod',
  'resmoke-nonprod': 'rollback-nonprod',
  'smoke-prod': 'prod',
  'resmoke-prod': 'rollback-prod',
}

// DPW-08 (C11-D52): prod needs prod-gate and prod-plan; prod-plan's if: requires non-prod's smoke for a
// deploy; prod-gate names no environment and holds no id-token, waits for main's check and migrations
// for a deploy alone, read from ci.yml's own run and its jobs (MAIN_CI, and the gate the pull request's
// the same way, PULL_CHECKS), never from a check run, and runs history.ts prod-gate with the mode
// (PROD_GATE_CALL); the fast re-checks (FAST_RECHECK_NONPROD and FAST_RECHECK_PROD) come before the
// credentials and cover a deploy (ancestry, and in prod both digests) and a rollback or restore (the
// record id; in prod every mode's, and a prod deploy's or rollback's approval is held to prod-plan's
// diff of this attempt, prod-plan outputting its attempt), each of those runs pinned whole, so no early
// exit 0 or forged output passes it; each smoke judges only the read-back its job wrote in this
// attempt (the job outputs attempt, and the smoke's one
// step reading READBACK first refuses another, SMOKE_ATTEMPT); each rollback job needs build, takes this
// run's digest from build for a deploy and from the gate for a drill-smoke, runs only once its
// deploy job set services_started, and judges the release that deploy replaced from that job's own
// AWS_CHECK (the deploy job outputs replaced from its aws step, whose value AWS_CHECK_ENV pins as the
// rollback's REPLACED);
// rollback-prod's steps are rollback-nonprod's but for the environment's name; and only prod and
// rollback-prod deploy to prod, rollback-prod only the previous release's Tasks and Services.
export function prodPathFindings(workflows: Texts): Finding[] {
  const found = new Set<Finding>()
  const text = workflows.get(DEPLOY) ?? ''
  const add = (id: string, rule: string) => found.add(at(DEPLOY, 'DPW-08', `${id}: ${rule}`))
  const jobs = jobsOf(text)
  const prod = jobs.get('prod')
  if (prod === undefined || !['prod-gate', 'prod-plan'].every(need => jobNeeds(prod.job).includes(need))) {
    add('prod', 'needs prod-gate and prod-plan')
  }
  const plan = jobs.get('prod-plan')
  const planIf = plan === undefined ? '' : (jobScalar(plan.job, 'if') ?? '')
  if (
    !planIf.includes(
      "((needs.gate.outputs.mode == 'deploy' && needs.smoke-nonprod.result == 'success') || needs.gate.outputs.mode == 'rollback')",
    ) ||
    evaluateIf(planIf, { 'needs.gate.outputs.mode': 'deploy', 'needs.smoke-nonprod.result': 'failure' }) !== false
  ) {
    add('prod-plan', "its if: requires smoke-nonprod's success for a deploy")
  }
  const gate = jobs.get('prod-gate')
  const gatePermissions = gate === undefined ? undefined : jobPermissions(gate.job)
  if (
    gate === undefined ||
    jobEnvironment(gate.job) !== undefined ||
    !(gatePermissions instanceof Map) ||
    gatePermissions.has('id-token')
  ) {
    add('prod-gate', 'names no environment and holds no id-token')
  }
  // Each run the gates rest on is pinned whole, so no early exit 0, || true or forged output passes them.
  const wait = gate?.steps.find(step => step.name === "main's own CI")
  if (
    wait?.if !== expr("needs.gate.outputs.mode == 'deploy' && needs.gate.outputs.target == 'prod'") ||
    wait.run !== MAIN_CI
  ) {
    add(
      'prod-gate',
      "waits for main's check and migrations for a deploy alone, read from ci.yml's own run and its jobs",
    )
  }
  const prodGate = gate?.steps.find(step => step.id === 'check')
  if (prodGate?.run !== PROD_GATE_CALL || prodGate.env.get('MODE') !== MODE) {
    add('prod-gate', 'runs history.ts prod-gate with the mode')
  }
  const pull = jobs
    .get('gate')
    ?.steps.find(step => step.name === 'The pull request that made this commit, and its checks')
  if (pull?.run !== PULL_CHECKS) {
    add('gate', "reads its pull request's check and migrations from ci.yml's own run on its head and that run's jobs")
  }
  for (const { id, steps } of jobs.values()) {
    if (steps.some(step => READS_CHECKS.test(step.run ?? '')))
      add(id, 'reads no check run, check suite or commit status')
  }
  for (const [id, want] of Object.entries(RECHECK)) {
    const steps = jobs.get(id)?.steps ?? []
    const recheck = steps.findIndex(step => step.name === 'The fast re-check')
    const step = steps[recheck]
    const credentials = credentialsAt(steps)
    if (
      step === undefined ||
      credentials < 0 ||
      recheck > credentials ||
      step.run !== want.run ||
      step.env.get('RECORD_ID') !== want.record ||
      (id === 'prod' &&
        (step.env.get('BUILD_DIGEST') !== expr('needs.build.outputs.digest') ||
          step.env.get('NONPROD_DIGEST') !== expr('needs.nonprod.outputs.digest') ||
          step.env.get('PLAN_ATTEMPT') !== expr('needs.prod-plan.outputs.attempt')))
    ) {
      add(
        id,
        "the fast re-check comes before the credentials and checks a deploy's ancestry (and in prod both digests) and any other mode's record id",
      )
    }
  }
  // A prod deploy or rollback is approved against prod-plan's diff of this attempt: prod-plan outputs its
  // attempt, which prod's fast re-check (pinned above, with PLAN_ATTEMPT) holds to GITHUB_RUN_ATTEMPT, so a
  // re-run of prod alone, whose prod-plan keeps an earlier attempt's outputs, refuses before the credentials.
  const planOutputs = blockValue(plan?.job.keys.get('outputs') ?? [])
  if (!isMap(planOutputs) || planOutputs.size !== 1 || planOutputs.get('attempt') !== expr('github.run_attempt')) {
    add('prod-plan', "outputs its attempt alone, which prod's fast re-check holds to its own")
  }
  // A smoke judges only a read-back from this attempt: a re-run of it alone (whose deploy job keeps its
  // outputs from an earlier attempt) refuses before smoke.ts runs, so no stale pass is recorded or staged.
  for (const [smoke, source] of Object.entries(SMOKES)) {
    const outputs = blockValue(jobs.get(source)?.job.keys.get('outputs') ?? [])
    const readers = (jobs.get(smoke)?.steps ?? []).filter(step => step.env.has('READBACK') || step.env.has('ATTEMPT'))
    const reader = readers[0]
    if (
      !isMap(outputs) ||
      outputs.get('attempt') !== expr('github.run_attempt') ||
      readers.length !== 1 ||
      reader === undefined ||
      reader.env.get('READBACK') !== expr(`needs.${source}.outputs.readback`) ||
      reader.env.get('ATTEMPT') !== expr(`needs.${source}.outputs.attempt`) ||
      !(reader.run ?? '').startsWith(`set -euo pipefail\n${SMOKE_ATTEMPT}\n`)
    ) {
      add(
        smoke,
        `judges only the read-back ${source} wrote in this attempt: ${source} outputs attempt, and the smoke refuses first unless it is GITHUB_RUN_ATTEMPT`,
      )
    }
  }
  for (const [rollback, deploy] of [
    ['rollback-nonprod', 'nonprod'],
    ['rollback-prod', 'prod'],
  ] as const) {
    const job = jobs.get(rollback)
    const release = job?.steps.find(step => step.id === 'release')
    const condition = job === undefined ? '' : (jobScalar(job.job, 'if') ?? '')
    const deployOutputs = blockValue(jobs.get(deploy)?.job.keys.get('outputs') ?? [])
    if (!isMap(deployOutputs) || deployOutputs.get('replaced') !== expr('steps.aws.outputs.replaced')) {
      add(deploy, `outputs replaced from its AWS_CHECK step, for ${rollback}'s auto check`)
    }
    if (
      job === undefined ||
      !jobNeeds(job.job).includes('build') ||
      release?.env.get('BUILD_DIGEST') !== expr('needs.build.outputs.digest') ||
      release.env.get('GATE_DIGEST') !== expr('needs.gate.outputs.digest') ||
      !has(release.run, 'DIGEST=$GATE_DIGEST\nif [ "$MODE" = deploy ]; then DIGEST=$BUILD_DIGEST; fi') ||
      !condition.includes(`needs.${deploy}.outputs.services_started == 'true'`) ||
      evaluateIf(condition, { [`needs.${deploy}.outputs.services_started`]: '' }) !== false
    ) {
      add(
        rollback,
        `needs build, takes this run's digest from build for a deploy and from the gate for a drill-smoke, and runs only once ${deploy} set services_started`,
      )
    }
  }
  // rollback-nonprod's steps with nonprod read as prod are rollback-prod's, line for line.
  const asProd =
    jobs.get('rollback-nonprod')?.steps.map(step => step.lines.join('\n').replaceAll('nonprod', 'prod')) ?? []
  const prodSteps = jobs.get('rollback-prod')?.steps.map(step => step.lines.join('\n')) ?? []
  if (asProd.length === 0 || prodSteps.length !== asProd.length || prodSteps.some((step, i) => step !== asProd[i])) {
    add('rollback-prod', "its steps are rollback-nonprod's but for the environment's name")
  }
  for (const { id, job, steps } of jobs.values()) {
    if (jobEnvironment(job) === 'prod' && id !== 'prod' && id !== 'rollback-prod') {
      add(id, 'deploys nothing to prod: only prod and rollback-prod do')
    }
    if (id === 'rollback-prod') {
      const lines = steps.flatMap(step => runLines(step.run ?? ''))
      if (lines.some(line => /"\$CDK"|\bskopeo\b/.test(line.text) && line.raw.trim() !== CDK_DEPLOY_ROLLBACK)) {
        add(id, "deploys only the previous release's Tasks and Services")
      }
    }
  }
  return [...found]
}

// --- DPW-09: the gate, the bot test and the environments -----------------------------------------------

export const PLAN_CALL =
  'if ! PLAN=$(node infra/scripts/deploy/history.ts plan --event "$EVENT" --ref "$REF" --actor "$ACTOR" --triggering-actor "$TRIGGERING_ACTOR" --sha "$SHA" --target "$TARGET" --mode "$MODE" --release "$RELEASE" --restore "$RESTORE" --records "$RUNNER_TEMP/records" --checks "$RUNNER_TEMP/checks.json" 2>"$RUNNER_TEMP/plan-ignored.txt"); then'
const PLAN_ENV: Readonly<Record<string, string>> = {
  EVENT: expr('github.event_name'),
  REF: expr('github.ref'),
  ACTOR: expr('github.actor'),
  TRIGGERING_ACTOR: expr('github.triggering_actor'),
  SHA: expr('github.sha'),
  TARGET: expr('inputs.target'),
  MODE: expr('inputs.mode'),
  RELEASE: expr('inputs.release'),
  RESTORE: expr('inputs.restore'),
}
const ENVIRONMENTS_CHECK = 'scripts/protect-environments.sh check "$REPO"'
// The jobs whose if: no drill may pass (C11-D59): drills are non-prod's alone.
const NO_DRILL = ['prod-plan', 'prod-gate', 'prod', 'rollback-prod', 'record-prod'] as const
// The jobs each job runs only once they succeeded, with what else its if: is then told (DPW-09): an if:
// that calls a status function (!cancelled(), say) isn't joined to success(), so it must ask itself.
const REQUIRES: Readonly<Record<string, ReadonlyArray<readonly [string, Readonly<Record<string, string>>]>>> = {
  synth: [['gate', {}]],
  nonprod: [['synth', {}]],
  'smoke-nonprod': [['nonprod', {}]],
  'prod-plan': [
    ['synth', {}],
    ['smoke-nonprod', { 'needs.gate.outputs.mode': 'deploy' }],
  ],
  'prod-gate': [
    ['gate', {}],
    ['prod-plan', { 'needs.gate.outputs.target': 'prod' }],
  ],
  prod: [
    ['synth', {}],
    ['prod-gate', {}],
  ],
  'smoke-prod': [['prod', {}]],
}
const ENVIRONMENT_FILES = ['nonprod.json', 'prod-plan.json', 'prod.json'] as const
const ENVIRONMENT_KEYS = [
  'environment',
  'required_reviewers',
  'prevent_self_review',
  'wait_timer',
  'can_admins_bypass',
  'deployment_branch_policy',
  'branch_policies',
]

function environmentFile(name: string, text: string): Record<string, unknown> | undefined {
  try {
    const json = JSON.parse(text) as unknown
    if (typeof json !== 'object' || json === null || Array.isArray(json)) return undefined
    const record = json as Record<string, unknown>
    const keys = Object.keys(record).sort()
    const policy = record.deployment_branch_policy as Record<string, unknown> | null | undefined
    const branches = record.branch_policies as Array<Record<string, unknown>> | undefined
    const reviewers = record.required_reviewers
    const ok =
      keys.length === ENVIRONMENT_KEYS.length &&
      [...ENVIRONMENT_KEYS].sort().every((key, i) => keys[i] === key) &&
      record.environment === name.replace(/\.json$/, '') &&
      typeof reviewers === 'number' &&
      Number.isInteger(reviewers) &&
      reviewers >= 0 &&
      reviewers <= 6 &&
      typeof record.prevent_self_review === 'boolean' &&
      record.wait_timer === 0 &&
      typeof record.can_admins_bypass === 'boolean' &&
      typeof policy === 'object' &&
      policy !== null &&
      Object.keys(policy).length === 2 &&
      policy.protected_branches === false &&
      policy.custom_branch_policies === true &&
      Array.isArray(branches) &&
      branches.length === 1 &&
      Object.keys(branches[0] ?? {}).length === 2 &&
      branches[0]?.name === 'main' &&
      branches[0]?.type === 'branch'
    return ok ? record : undefined
  } catch {
    return undefined
  }
}

// DPW-09 (C11-D49, C11-D56, C11-D59, C11-D69): the gate plans through history.ts plan, every input through
// env: (its refusals are history.ts's, which the test drives), after protect-environments.sh check; every
// job after it starts its if: with the bot test, which no if: can then pass with a bot as either actor,
// since a re-run of one job skips the gate; no if: of the prod jobs admits a drill; a job whose if: calls
// a status function runs only once the jobs it relies on succeeded (REQUIRES); .github/environments
// holds exactly the three files, each the environment file's shape: prod.json asks for at least one
// reviewer and no admin bypass, prod-plan.json for none, nonprod.json for one exactly when non-prod
// holds real data (C0.12's flip can't land half done); and the script's agent markers are the Owner
// bootstrap script's.
export function gateFindings(
  workflows: Texts,
  environments: Texts,
  nonprodHoldsRealData: boolean,
  protectEnvironments: string,
  agentMarkers: readonly string[],
): Finding[] {
  const found: Finding[] = []
  const add = (id: string, rule: string) => found.push(at(DEPLOY, 'DPW-09', `${id}: ${rule}`))
  const jobs = jobsOf(workflows.get(DEPLOY) ?? '')
  const gate = jobs.get('gate')?.steps ?? []
  const plan = gate.findIndex(step => step.id === 'plan')
  const planStep = gate[plan]
  if (
    planStep?.run === undefined ||
    lineIndexOf(planStep.run.split('\n'), PLAN_CALL) < 0 ||
    !sameMap(planStep.env, PLAN_ENV)
  ) {
    add('gate', 'plans through history.ts plan, every input and actor through env:')
  }
  const check = gate.findIndex(step => step.run === ENVIRONMENTS_CHECK)
  if (check < 0 || plan < 0 || check > plan) add('gate', 'runs scripts/protect-environments.sh check before it plans')
  for (const { id, job } of jobs.values()) {
    if (id === 'gate') continue
    const condition = jobScalar(job, 'if') ?? ''
    const starts = condition.startsWith(`\${{ ${BOT_TEST} && `) || condition === `\${{ ${BOT_TEST} }}`
    const bot = 'dependabot[bot]'
    if (
      !starts ||
      evaluateIf(condition, { 'github.triggering_actor': bot }) !== false ||
      evaluateIf(condition, { 'github.actor': bot }) !== false
    ) {
      add(id, 'its if: starts with the bot test on github.triggering_actor and github.actor, and no bot passes it')
    }
    if ((NO_DRILL as readonly string[]).includes(id)) {
      const drill = ['drill-break', 'drill-smoke'].some(
        mode => evaluateIf(condition, { 'needs.gate.outputs.mode': mode }) !== false,
      )
      if (drill) add(id, 'its if: admits no drill: drills are non-prod’s alone')
    }
    const requires = REQUIRES[id] ?? []
    const passes = requires.some(([need, given]) =>
      ['failure', 'cancelled', 'skipped'].some(
        result => evaluateIf(condition, { ...given, [`needs.${need}.result`]: result }) !== false,
      ),
    )
    if (STATUS_FUNCTION.test(condition) && passes) {
      add(id, `its if: runs it only once ${requires.map(([need]) => need).join(' and ')} succeeded`)
    }
  }
  const names = [...environments.keys()].map(path => path.slice(`${ENVIRONMENTS_DIR}/`.length)).sort()
  if (names.length !== ENVIRONMENT_FILES.length || ENVIRONMENT_FILES.some(name => !names.includes(name))) {
    found.push(at(ENVIRONMENTS_DIR, 'DPW-09', 'holds exactly nonprod.json, prod-plan.json and prod.json'))
  }
  for (const name of ENVIRONMENT_FILES) {
    const path = `${ENVIRONMENTS_DIR}/${name}`
    const text = environments.get(path)
    const record = text === undefined ? undefined : environmentFile(name, text)
    if (record === undefined) {
      if (text !== undefined) {
        found.push(
          at(
            path,
            'DPW-09',
            'is an environment file: its name, required_reviewers, prevent_self_review, wait_timer 0, can_admins_bypass, the custom branch policy and main alone',
          ),
        )
      }
      continue
    }
    const reviewers = record.required_reviewers as number
    if (name === 'prod.json' && (reviewers < 1 || record.can_admins_bypass !== false)) {
      found.push(at(path, 'DPW-09', 'asks for at least one reviewer and no admin bypass'))
    }
    if (name === 'prod-plan.json' && reviewers !== 0) found.push(at(path, 'DPW-09', 'asks for no reviewer'))
    if (name === 'nonprod.json' && reviewers >= 1 !== nonprodHoldsRealData) {
      found.push(at(path, 'DPW-09', 'asks for a reviewer exactly when PROFILES.nonprod.holdsRealData is true'))
    }
  }
  const markers = /^AGENT_MARKERS=\(([^)]*)\)$/m.exec(protectEnvironments)?.[1]?.trim().split(/\s+/) ?? []
  if (markers.length !== agentMarkers.length || agentMarkers.some((marker, i) => markers[i] !== marker)) {
    found.push(at(PROTECT_ENVIRONMENTS, 'DPW-09', "its agent markers are the Owner bootstrap script's AGENT_MARKERS"))
  }
  return found
}

// --- DPW-10: no repository code where the credentials are ---------------------------------------------

// What a credentialed job may run (C11-D48): bash's own builtins and keywords, the functions its step
// defines, gh, git and jq, the text tools it reads with, aws and skopeo (through run and get), the pinned
// CLI (through run) and npm for the one install line. Anything else, a script by path, a variable or
// quoted word run as a command, a wrapper (exec, command, env, …) or a builtin that sets what runs
// (unset, wait -p, select), is refused, and so is a function named as a program.
const BASH_OWN = [
  '[',
  '[[',
  ']]',
  ':',
  '!',
  '{',
  '}',
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'case',
  'esac',
  'in',
  'for',
  'while',
  'until',
  'do',
  'done',
  'function',
  'echo',
  'printf',
  'local',
  'return',
  'exit',
  'export',
  'read',
  'mapfile',
  'readarray',
  'cd',
  'pwd',
  'shift',
  'set',
  'true',
  'false',
  'test',
  'break',
  'continue',
]
// The tools a credentialed run uses, with aws and skopeo: each only reads the files it is named (tee, sort,
// mktemp and find are held to their uses below), so none, as uniq or cp would, rewrites a file the CLI
// then runs.
const TOOLS = [
  'jq',
  'gh',
  'git',
  'sed',
  'grep',
  'tee',
  'cat',
  'head',
  'wc',
  'sort',
  'mktemp',
  'readlink',
  'realpath',
  'find',
  'aws',
  'skopeo',
]
// The tools that could run another program or write a file, held to the one use each job makes of them:
// git only to ask whether one commit is an ancestor of another, gh only as gh api, sed only as the
// preamble's mask, find only in ASSET_CHECK's search for a symbolic link, sort only with its plain flags,
// tee only appending to the summary, mapfile with no callback, aws only for the reads and one-offs the
// workflow makes (no s3 cp, which would write a file), skopeo only as the registry login and the push,
// set only as set -euo pipefail (no set --, which would hand "$@" a program), and local
// and export with no flag (no -n, which would set another variable through a name). (trap, which runs its
// text, is no builtin a job may use.)
const MASK_LINE = PREAMBLE.split('\n').find(line => line.startsWith('mask()')) ?? ''
const FIND_LINE = ASSET_CHECK.split('\n').find(line => line.includes('find ')) ?? ''
const AWS_CALLS =
  /^\s+(?:ecs\s+(?:run-task|describe-tasks|describe-services|list-tasks|stop-task|wait\s+tasks-stopped|describe-task-definition)|elbv2\s+describe-(?:target-groups|target-group-attributes|target-health|load-balancers|load-balancer-attributes)|cloudformation\s+describe-stacks|ecr\s+(?:describe-images|get-login-password)|logs\s+get-log-events)(?:\s|$)/
const NO_FLAG = (command: ShellCommand) => !/(?:^|\s)[-+][A-Za-z]/.test(command.tail)
const TOOL_USES: Readonly<Record<string, (command: ShellCommand, raw: string) => boolean>> = {
  git: ({ rest }) => /^\s+merge-base\s+--is-ancestor\s/.test(rest),
  gh: ({ rest }) => /^\s+api\s/.test(rest),
  sed: (_, raw) => raw === MASK_LINE.trim(),
  find: (_, raw) => raw === FIND_LINE.trim(),
  sort: ({ rest }) => /^(?:\s+-[nruV]+)*\s*$/.test(rest),
  tee: ({ rest }) => /^\s+-a\s+"\$GITHUB_STEP_SUMMARY"\s*$/.test(rest),
  mapfile: ({ rest }) => !/(?:^|\s)-[A-Za-z]*C/.test(rest),
  readarray: ({ rest }) => !/(?:^|\s)-[A-Za-z]*C/.test(rest),
  aws: ({ rest }) => AWS_CALLS.test(rest),
  skopeo: (_, raw) => raw === SKOPEO_LOGIN || raw === SKOPEO_COPY,
  set: ({ tail }) => /^\s+-euo\s+pipefail\s*$/.test(tail),
  local: NO_FLAG,
  export: NO_FLAG,
}

// What each command a credentialed or record job's own lines run (read by the table) may be given: the flags
// and arguments those lines use, so none runs code, reads a file the guard can't see or writes one (DPW-10,
// DPW-13). A command no entry names, with no function of its run's by that name, is refused; so is any
// assignment before a command's word, a write to a file but the outputs, the summary, prod-plan's diff and
// /dev/null, and a read of a file but the diff.
const argText = (args: readonly ShellWord[]) => args.map(arg => arg.raw).join(' ')
// jq's flags the lines use: -e (status by the output), -n (no input), -c (one line), -r (raw strings), and
// --arg and --argjson NAME VALUE, which bind a value to $NAME; never -f, --from-file, --rawfile,
// --slurpfile, -L, --args or --jsonargs, which read a file or take a program from elsewhere.
const JQ_FLAGS = ['-e', '-n', '-c', '-r', '-nc', '-ec']
// The words a jq program in those lines calls, besides a key and a function it defines itself: none reads a
// file, the environment (env, $ENV) or the program's own arguments, and none imports or includes a module.
const JQ_WORDS = [
  'all',
  'and',
  'as',
  'ascii_downcase',
  'contains',
  'else',
  'end',
  'endswith',
  'false',
  'first',
  'if',
  'index',
  'keys',
  'length',
  'map',
  'not',
  'null',
  'or',
  'select',
  'split',
  'test',
  'then',
  'to_entries',
  'tonumber',
  'tostring',
  'type',
]
// Whether a jq program holds only strings with no interpolation, fields, keys, its own definitions, the
// variables bound to it (given, or by as or a definition's parameters) and JQ_WORDS: no comment, format (@sh)
// or other word.
export function jqProgramIsHeld(program: string, given: readonly string[]): boolean {
  const bound = new Set(given)
  for (const match of program.matchAll(/\bas\s+\$([A-Za-z_]\w*)/g)) bound.add(match[1] ?? '')
  const defined = new Set<string>()
  for (const match of program.matchAll(/\bdef\s+([A-Za-z_]\w*)(?:\(([^)]*)\))?\s*:/g)) {
    defined.add(match[1] ?? '')
    for (const parameter of (match[2] ?? '').matchAll(/\$([A-Za-z_]\w*)/g)) bound.add(parameter[1] ?? '')
  }
  let previous = ''
  for (let i = 0; i < program.length; ) {
    const rest = program.slice(i)
    const c = program[i] ?? ''
    const token =
      /^\s+/.exec(rest)?.[0] ??
      /^"(?:[^"\\]|\\[^(])*"/.exec(rest)?.[0] ??
      /^\$[A-Za-z_]\w*/.exec(rest)?.[0] ??
      /^\.[A-Za-z_]\w*/.exec(rest)?.[0] ??
      /^[A-Za-z_]\w*/.exec(rest)?.[0] ??
      (/^[^"#@$\sA-Za-z_]/.test(c) ? c : undefined)
    if (token === undefined) return false
    i += token.length
    if (/^\s/.test(token)) continue
    if (token.startsWith('$') && !bound.has(token.slice(1))) return false
    if (/^[A-Za-z_]/.test(token)) {
      const key = (previous === '{' || previous === ',') && /^\s*:/.test(program.slice(i))
      if (!(key || previous === 'def' || defined.has(token) || token === 'def' || JQ_WORDS.includes(token))) {
        return false
      }
    }
    previous = token
  }
  return true
}
// jq given its flags, then one program (single-quoted, or . alone) and no file to read.
function jqIsHeld(args: readonly ShellWord[]): boolean {
  const given: string[] = []
  let i = 0
  for (; i < args.length; i++) {
    const raw = args[i]?.raw ?? ''
    if (JQ_FLAGS.includes(raw)) continue
    if (raw !== '--arg' && raw !== '--argjson') break
    const name = args[i + 1]?.raw ?? ''
    if (!/^[A-Za-z_]\w*$/.test(name) || args[i + 2] === undefined) return false
    given.push(name)
    i += 2
  }
  const program = args[i]
  if (program === undefined || i !== args.length - 1) return false
  return program.raw === '.' || (program.raw.startsWith("'") && jqProgramIsHeld(program.value ?? '', given))
}
// gh api only as the records' calls: a deployment made from the body on its input, its status, or the newest
// migration record read with a held program.
const GH_CALLS = [
  /^api -X POST "repos\/\$REPO\/deployments" --input - --jq \.id$/,
  /^api -X POST "repos\/\$REPO\/deployments\/\$(?:ID|id)\/statuses" --input - --silent$/,
]
const GH_MIGRATED = 'api "repos/$REPO/deployments?environment=$ENVIRONMENT&task=hearth-migrated&per_page=1" --jq'
function ghIsHeld(args: readonly ShellWord[]): boolean {
  if (GH_CALLS.some(call => call.test(argText(args)))) return true
  const program = args[args.length - 1]
  return (
    argText(args.slice(0, -1)) === GH_MIGRATED &&
    program !== undefined &&
    program.raw.startsWith("'") &&
    jqProgramIsHeld(program.value ?? '', [])
  )
}
// aws only through run or get, as the calls the lines make (AWS_CALLS), each option one they use with its
// values, none of them a file:// or fileb:// the CLI would read; never --endpoint-url, --cli-input-json,
// --profile, --ca-bundle or another that reads a file or sends the request elsewhere.
const AWS_OPTIONS = [
  '--region',
  '--repository-name',
  '--image-ids',
  '--query',
  '--output',
  '--cluster',
  '--task-definition',
  '--launch-type',
  '--platform-version',
  '--count',
  '--network-configuration',
  '--propagate-tags',
  '--started-by',
  '--client-token',
  '--services',
  '--stack-name',
  '--service-name',
  '--desired-status',
  '--tasks',
  '--names',
  '--target-group-arn',
  '--load-balancer-arn',
]
function awsIsHeld(args: readonly ShellWord[]): boolean {
  if (!AWS_CALLS.test(` ${argText(args)}`)) return false
  let option = ''
  return args.slice(2).every(arg => {
    if (arg.raw.startsWith('-')) {
      option = arg.raw
      return AWS_OPTIONS.includes(arg.raw)
    }
    return option !== '' && !/^["']?(?:file|fileb|https?):/i.test(arg.raw)
  })
}
// The CLI only through run, as one of its lines; skopeo only as the push (through run) or the login (fed
// the password by get, its errors to the filter).
const CLI_LINES = [
  CDK_DEPLOY_FORWARD,
  CDK_DEPLOY_SERVICES,
  CDK_DEPLOY_ROLLBACK,
  CDK_DEPLOY_DOWN,
  CDK_DIFF_PROD,
  CDK_DIFF_ROLLBACK,
]
const SKOPEO_LOGIN_COMMAND = 'skopeo login --username AWS --password-stdin "$REGISTRY" 2>&1'
const wrapped = (command: GlueCommand) => {
  const program = command.args[0]?.raw
  const rest = command.args.slice(1)
  if (program === 'aws') return awsIsHeld(rest)
  if (program === '"$CDK"') return command.name === 'run' && CLI_LINES.includes(command.raw)
  if (program === 'skopeo') return command.name === 'run' && command.raw === SKOPEO_COPY
  return false
}
const GLUE_USES: Readonly<Record<string, (command: GlueCommand) => boolean>> = {
  jq: ({ args }) => jqIsHeld(args),
  gh: ({ args }) => ghIsHeld(args),
  // The step's own files: the pushed digest and prod-plan's diff.
  cat: ({ args }) => argText(args) === '"$RUNNER_TEMP/pushed"' || argText(args) === '"$DIFF"',
  head: ({ args }) => argText(args) === '-c 921600 "$DIFF"',
  wc: ({ args }) => argText(args) === '-c',
  tee: ({ args }) => argText(args) === '-a "$GITHUB_STEP_SUMMARY"',
  mask: ({ args }) => args.length === 0,
  run: wrapped,
  get: wrapped,
  skopeo: ({ raw, previous }) => raw === SKOPEO_LOGIN_COMMAND && previous === 'get',
  npm: ({ raw }) => raw === INSTALL,
}
// The commands the table holds itself, and the compound ones.
const TABLE_HELD = [...Object.keys(SHELL_TABLE.builtins), 'if', 'for', 'case', '{', '[[']
// Whether a command a credentialed or record job's own lines run is held to its uses.
function glueIsHeld(command: GlueCommand, own: ReadonlySet<string>): boolean {
  const name = command.name
  const redirections = command.redirections.every(({ op, target }) =>
    op === '<' ? target?.raw === '"$DIFF"' : op.startsWith('<') || op.includes('&') || WRITABLE.test(target?.raw ?? ''),
  )
  if (name === undefined) return redirections
  if (!redirections || command.assignments.length > 0) return false
  const use = GLUE_USES[name]
  if (use !== undefined) return use(command)
  return TABLE_HELD.includes(name) || own.has(name)
}
const HELD =
  'gives each command its own lines run only the flags and arguments the workflow uses (GLUE_USES), no assignment before it, and no file to read but the diff or to write but its outputs, its summary, the diff and /dev/null, so none runs code, reads a file the guard can’t see or writes one'
// The words no credentialed run names anywhere outside a comment, so no tool can be handed one to run (a
// find -exec, a sort --compress-program, a git alias, a trap's text, a variable): the interpreters and
// the downloaders. node is a word, so node_modules passes; a jq path (.source) and the push's docker://
// transport are data.
const RUNNER_WORDS =
  /(?<![\w.-])(?:node|nodejs|npx|tsx|ts-node|deno|bun|python[\d.]*|perl|ruby|php|bash|sh|zsh|dash|ksh|eval|source|curl|wget|make|docker(?!:\/\/))(?![\w-])/
// The variables that choose what a later command runs, where the CLI's assembly is read from or where an
// output is written, which no credentialed run sets (but CDK_FOLDER's fresh HOME): PATH and the shell's
// own, the loaders', npm's, git's and gh's, and GitHub's and the runner's (RUNNER_TEMP, GITHUB_OUTPUT,
// GITHUB_WORKSPACE, …); and the files that set a later step's environment or path.
const LOADER_NAMES = String.raw`PATH|HOME|BASH\w*|ENV|CDPATH|SHELLOPTS|PS4|PROMPT_COMMAND|TMPDIR|LD_\w+|NODE_\w+|NPM_\w+|npm_\w+|GIT_\w+|GH_\w+|GITHUB_\w+|RUNNER_\w+`
const LOADER_ASSIGNMENT = assigns(LOADER_NAMES)
const LOADER_NAME = new RegExp(`^(?:${LOADER_NAMES})$`)
const STEP_FILES = /\bGITHUB_(?:ENV|PATH)\b/
// What a credentialed run may write to: nothing but its outputs, its summary, prod-plan's diff (DIFF, set
// by its one line) and /dev/null, so no file the CLI or a tool then runs (node_modules/aws-cdk/bin/cdk,
// say) is rewritten. A write is any redirection that opens its target for writing: >, >>, >|, &>, a
// descriptor's (2>) and the read-write <> (1<>file, which rewrites the file in place).
const REDIRECTION = /(?<![<>&])(?:\d+|&)?(?:<>|>>?\|?)\s*(\(|[^\s;|()<>]+)/g
const WRITABLE = /^(?:\/dev\/null|&[12]|"\$(?:GITHUB_OUTPUT|GITHUB_STEP_SUMMARY|DIFF)")$/
const DIFF_LINE = 'DIFF="$RUNNER_TEMP/diff.txt"'
// The canonical texts that define functions, and the lines on which a credentialed run sets a variable by
// printf -v, read, mapfile or for: the canonical texts' own, and the read-back's and the rollback jobs'
// two loops, whose variables choose nothing that runs. "$@" runs only inside the preamble's run and get.
const DEFINING_TEXTS = [PREAMBLE, ASSET_CHECK, AWS_CHECK, TASKS_OUTPUTS, ONE_OFF, NEWEST_RELEASE] as const
const SETTERS = ['read', 'mapfile', 'readarray', 'for', 'select', 'getopts']
const isSetter = (command: ShellCommand) =>
  SETTERS.includes(command.word) || (command.word === 'printf' && /(?:^|\s)-/.test(command.rest))
const SETTER_LINES: ReadonlySet<string> = new Set([
  ...[PREAMBLE, ASSET_CHECK, AWS_CHECK, TASKS_OUTPUTS, ONE_OFF, PROBE, NEWEST_RELEASE, RESTORE_DOWN].flatMap(text => {
    const lines = text.split('\n')
    return shellCommands(text)
      .filter(isSetter)
      .map(command => lines[command.line]?.trim() ?? '')
  }),
  'for ROLE in api realtime; do',
  'for RELEASE in "$COMMIT:$DIGEST" "$PREVIOUS_COMMIT:$PREVIOUS_DIGEST"; do',
])
const PREAMBLE_RUNNERS = PREAMBLE.split('\n').filter(line => line.includes('"$@"'))

// Whether each function a run defines stands where a canonical text that defines it stands in the run,
// line for line, so no run defines a function of its own or redefines one (a cp, a jq, the preamble's
// mask) after its canonical text.
const CANONICAL_DEFINITIONS = DEFINING_TEXTS.map(text => ({ text, defined: functionDefinitions(text) }))
function definitionsAreCanonical(run: string): boolean {
  const allowed = new Set<string>()
  for (const { text, defined } of CANONICAL_DEFINITIONS) {
    for (let at = run.indexOf(text); at >= 0; at = run.indexOf(text, at + 1)) {
      const end = at + text.length
      if ((at > 0 && run[at - 1] !== '\n') || (end < run.length && run[end] !== '\n')) continue
      const first = run.slice(0, at).split('\n').length - 1
      for (const each of defined) allowed.add(`${each.name}@${first + each.line}`)
    }
  }
  return functionDefinitions(run).every(each => allowed.has(`${each.name}@${each.line}`))
}

// The shape of every job and step (DPW-10): the top level, each job's keys and runner, each step's keys,
// each action's inputs and every env: key are the ones the workflow uses, so no shell, container,
// service, default, strategy, reusable workflow, self-hosted runner, artifact from another run or
// variable that chooses what runs (BASH_ENV, PATH, NODE_OPTIONS) comes in unseen.
const TOP_KEYS = ['name', 'on', 'permissions', 'jobs']
const JOB_KEYS = [
  'needs',
  'if',
  'runs-on',
  'timeout-minutes',
  'cache-mode',
  'permissions',
  'environment',
  'concurrency',
  'outputs',
  'env',
  'steps',
]
const RUNNER = (id: string) => (id === 'build' ? 'ubuntu-24.04-arm' : 'ubuntu-24.04')
const STEP_KEYS = ['name', 'id', 'if', 'uses', 'with', 'env', 'run']
const WITH_KEYS: Readonly<Record<string, readonly string[]>> = {
  'actions/checkout': ['fetch-depth', 'persist-credentials', 'ref', 'path'],
  'actions/setup-node': ['node-version-file', 'package-manager-cache'],
  'actions/upload-artifact': ['name', 'path', 'archive', 'retention-days', 'if-no-files-found', 'include-hidden-files'],
  'actions/download-artifact': ['artifact-ids', 'path'],
  'aws-actions/configure-aws-credentials': [
    'role-to-assume',
    'aws-region',
    'allowed-account-ids',
    'role-session-name',
    'role-duration-seconds',
    'mask-aws-account-id',
    'translate-env-variables',
  ],
}
const ENV_KEYS = [
  'ACCOUNT_ID',
  'ACTOR',
  'ATTEMPT',
  'BUILD',
  'BUILD_DIGEST',
  'COMMIT',
  'CURRENT_PROD_ID',
  'DIGEST',
  'ENVIRONMENT',
  'EVENT',
  'FIRST',
  'GATE_DIGEST',
  'GH_TOKEN',
  'MODE',
  'NONPROD_DIGEST',
  'PREVIOUS',
  'PREVIOUS_COMMIT',
  'PREVIOUS_DIGEST',
  'PLAN_ATTEMPT',
  'PROFILE_AT',
  'READBACK',
  'RECORD_ID',
  'REF',
  'RELEASE',
  'REPLACED',
  'REPO',
  'RESMOKE',
  'RESTORE',
  'ROLLBACK_SERVICES',
  'SERVICES',
  'SHA',
  'SMOKE',
  'STAGE',
  'TARGET',
  'TRIGGERING_ACTOR',
]
const onceEach = (names: readonly string[], allowed: readonly string[]) =>
  names.every(name => allowed.includes(name)) && new Set(names).size === names.length

// The keys a mapping value's lines hold (a job's env:), each as often as it appears.
const mappingKeys = (lines: readonly string[] | undefined) =>
  (lines ?? []).slice(1).flatMap(line => /^ {6}([\w-]+):/.exec(line)?.[1] ?? [])

function shapeOfJobsFindings(text: string, add: (where: string, rule: string) => void): void {
  const top = yamlLines(text).flatMap(line => /^([\w-]+):/.exec(line.text)?.[1] ?? [])
  if (!onceEach(top, TOP_KEYS) || !TOP_KEYS.every(key => top.includes(key))) {
    add('the top level', 'holds only name, on, permissions and jobs: no env, defaults or concurrency')
  }
  for (const { id, job, steps } of jobsOf(text).values()) {
    if (!onceEach(job.keyNames, JOB_KEYS)) {
      add(
        id,
        'holds only needs, if, runs-on, timeout-minutes, cache-mode, permissions, environment, concurrency, outputs, env and steps, each once: no container, services, defaults, strategy, uses or continue-on-error',
      )
    }
    if (jobScalar(job, 'runs-on') !== RUNNER(id)) add(id, `runs on ${RUNNER(id)}, GitHub's own runner`)
    if (!onceEach(mappingKeys(job.keys.get('env')), ENV_KEYS)) {
      add(id, 'sets only the environment variables the workflow uses: no BASH_ENV, PATH or NODE_OPTIONS')
    }
    steps.forEach((step, index) => {
      const where = `${id} (${label(step, index)})`
      if (!onceEach(step.keyNames, id === 'synth' ? [...STEP_KEYS, 'working-directory'] : STEP_KEYS)) {
        add(
          where,
          'holds only name, id, if, uses, with, env and run (and working-directory in synth), each once: no shell or continue-on-error',
        )
      }
      const action = step.uses?.split('@')[0]
      if (action !== undefined && !onceEach([...step.with.keys()], WITH_KEYS[action] ?? [])) {
        add(where, 'gives its action only the inputs the workflow uses: no repository, run-id, token or other source')
      }
      if (!onceEach([...step.env.keys()], ENV_KEYS)) {
        add(where, 'sets only the environment variables the workflow uses: no BASH_ENV, PATH or NODE_OPTIONS')
      }
    })
  }
}

const INSTALL = 'npm ci --ignore-scripts -w @hearth/infra'
const PREAMBLE_CDK = 'CDK="$GITHUB_WORKSPACE/node_modules/aws-cdk/bin/cdk"'
const ALLOWED_USES = /^(?:actions\/checkout|actions\/download-artifact|aws-actions\/configure-aws-credentials)@/
const REFUSED_CLI =
  /(?<![\w-])(?:--no-rollback|-R|--express|--hotswap|--hotswap-fallback|--import-existing-resources|--force|--all|--method[= ](?:direct|prepare-change-set|execute-change-set)|--revert-drift|--outputs-file|--parameters|--notification-arns|--role-arn|--toolkit-stack-name|--plugin)(?![\w-])|"\$CDK"\s+(?:synth|destroy|bootstrap|import|publish-assets|watch|migrate|refactor|gc|drift|context|acknowledge|init|rollback)\b/
const CLI_DEPLOY = /"\$CDK" deploy --app "\$ASSEMBLY" /
const CLI_DIFF = /"\$CDK" diff --app "\$ASSEMBLY" /

// What the CLI is run with (DPW-10): deploy or diff, --app "$ASSEMBLY", --no-lookups and --no-notices, and
// for a deploy --require-approval never, --ci and --exclusively.
function cliLineIsSafe(line: string): boolean {
  const flags = ['--no-lookups', '--no-notices']
  if (CLI_DEPLOY.test(line)) flags.push('--require-approval never', '--ci', '--exclusively')
  else if (!CLI_DIFF.test(line)) return false
  return flags.every(flag => new RegExp(`(?:^|\\s)${flag}(?=\\s|;|$)`).test(line))
}

// DPW-10 (C11-D48, C11-D76): a credentialed job runs no repository code. Its uses: are only checkout,
// download-artifact and the credentials action; npm runs only as the one install line, followed by
// CLI_CHECK, both before the credentials action; it runs no npx, node, shell, source, eval, docker, tsx,
// ts-node, npm exec, python, make, curl, wget, db:reset, check-server, script by path or wrapper, nor
// anything outside its list; it defines a function only where a canonical text does, and calls only its
// own step's (a function doesn't outlive its step); it sets a variable by printf -v, read, mapfile or for
// only on SETTER_LINES, and never PATH, RUNNER_TEMP or another that chooses what runs; CDK is assigned
// only by the preamble, as the registry package's own bin; the CLI runs only as deploy or diff with --app
// "$ASSEMBLY" (set once in its step to the folder it downloaded), after CDK_FOLDER, with no other change of
// folder, and with its safe flags; no line anywhere passes a refused flag or subcommand. Across the
// repository no workspace is named aws-cdk or declares a cdk bin, and the lockfile's aws-cdk is the
// registry's at infra's pin.
export function credentialedCodeFindings(workflows: Texts, manifests: Texts, lockfile: string): Finding[] {
  const found = new Set<Finding>(canonicalTextFindings())
  const add = (where: string, rule: string) => found.add(at(DEPLOY, 'DPW-10', `${where}: ${rule}`))
  shapeOfJobsFindings(workflows.get(DEPLOY) ?? '', add)
  for (const { id, steps } of jobsOf(workflows.get(DEPLOY) ?? '').values()) {
    const credentialed = ENVIRONMENT_JOBS[id] !== undefined
    steps.forEach((step, index) => {
      const where = `${id} (${label(step, index)})`
      const run = step.run ?? ''
      const views = shellViews(run)
      const lines = runLines(run, views)
      if (lines.some(line => REFUSED_CLI.test(line.text)))
        add(where, 'passes none of the CLI’s refused flags or subcommands')
      for (const line of lines) {
        if (CDK_ASSIGNMENT.test(line.code) && line.raw.trim() !== PREAMBLE_CDK) {
          add(where, 'assigns CDK only in the preamble, as the registry package’s node_modules/aws-cdk/bin/cdk')
        }
      }
      if (!credentialed) return
      if (step.uses !== undefined && !ALLOWED_USES.test(step.uses)) {
        add(where, 'uses only checkout, download-artifact and the credentials action')
      }
      const read = readShell(run)
      const commands = commandsOf(run, read)
      const own = new Set(definitionsOf(run, read).map(each => each.name))
      const raw = (command: ShellCommand) => lines[command.line]?.raw.trim() ?? ''
      const wrong = commands.some(command => {
        const word = command.word
        if (command.prefixes.some(prefix => WRAPPERS.includes(prefix))) return true
        if (word === '"$CDK"') return false
        if (word === '"$@"') return !PREAMBLE_RUNNERS.includes(raw(command))
        if (word === 'npm') return run !== INSTALL
        if (/^["'$]|\/|\.(?:sh|ts|js|mjs|cjs|py)$/.test(word)) return true
        const use = TOOL_USES[word]
        if (use !== undefined && !use(command, raw(command))) return true
        return !(BASH_OWN.includes(word) || TOOLS.includes(word) || own.has(word))
      })
      if (
        wrong ||
        lines.some(line => RUNNER_WORDS.test(line.text) || /\bdb:reset\b|\bcheck-server\b/.test(line.text))
      ) {
        add(
          where,
          'runs nothing but bash’s own, its functions, gh api, git merge-base, jq, the text tools, aws, skopeo and the pinned CLI, and names no npx, node, shell, source, eval, docker, python, make, curl, wget or script: no tool is handed a program to run',
        )
      }
      // Its own lines are read by the table, each command held to its uses.
      const refused = refusedAt(where, read)
      if (refused !== undefined) add(refused, AS_BASH)
      if (read.commands.some(command => !glueIsHeld(command, own))) add(where, HELD)
      if (read.functions.length > 0 || !definitionsAreCanonical(run)) {
        add(
          where,
          'defines a function only where a canonical text (the preamble, ASSET_CHECK, AWS_CHECK, TASKS_OUTPUTS, ONE_OFF or NEWEST_RELEASE) does, as it does',
        )
      }
      if (commands.some(command => isSetter(command) && !SETTER_LINES.has(raw(command)))) {
        add(
          where,
          "sets a variable by printf -v, read, mapfile or for only on a canonical text's line, or the read-back's or the release loop's",
        )
      }
      // Nothing it writes or sets chooses what a later command or step runs.
      const code = commandCode(shellViews(run).code).split('\n')
      if (
        code.some(line =>
          [...line.matchAll(REDIRECTION)].some(write => write[1] !== '(' && !WRITABLE.test(write[1] ?? '')),
        ) ||
        lines.some(line => DIFF_ASSIGNMENT.test(line.code) && line.raw.trim() !== DIFF_LINE)
      ) {
        add(where, "writes no file but its outputs, its summary, prod-plan's diff and /dev/null")
      }
      if (
        read.commands.some(command => command.assignments.some(each => LOADER_NAME.test(each.name))) ||
        lines.some(
          line => STEP_FILES.test(line.text) || (LOADER_ASSIGNMENT.test(line.code) && line.raw.trim() !== CDK_FOLDER),
        )
      ) {
        add(
          where,
          "sets no PATH, HOME (but CDK_FOLDER's), BASH_ENV or other variable that chooses what runs, and writes neither GITHUB_ENV nor GITHUB_PATH",
        )
      }
      const cli = lines.filter(line => /"\$CDK"|\$\{?CDK\b/.test(line.text) && !CDK_ASSIGNMENT.test(line.code))
      if (cli.length === 0) return
      const first = cli[0]?.index ?? 0
      const folder = lines.filter(line => line.raw.trim() === CDK_FOLDER)
      const assembly = lines.filter(line => ASSEMBLY_ASSIGNMENT.test(line.code))
      const wantAssembly = DEPLOY_JOBS[id]?.rollback
        ? 'ASSEMBLY="$RUNNER_TEMP/assembly-previous"'
        : 'ASSEMBLY="$RUNNER_TEMP/assembly"'
      const moves = commands.filter(command => ['cd', 'pushd', 'popd'].includes(command.word))
      if (
        cli.some(line => !cliLineIsSafe(line.text)) ||
        assembly.length !== 1 ||
        assembly[0]?.raw.trim() !== wantAssembly ||
        (assembly[0]?.index ?? first) > first ||
        folder.length !== 1 ||
        (folder[0]?.index ?? first) > first ||
        moves.length !== 1 ||
        moves[0]?.line !== folder[0]?.index
      ) {
        add(
          where,
          'runs the CLI only as deploy or diff, with --app "$ASSEMBLY" (set once to the folder it downloaded), after CDK_FOLDER and no other change of folder, with --no-lookups --no-notices, and a deploy with --require-approval never --ci --exclusively',
        )
      }
    })
    if (!credentialed) continue
    const install = steps.findIndex(step => step.run === INSTALL)
    const cliCheck = steps.findIndex(step => step.run === CLI_CHECK)
    const credentials = credentialsAt(steps)
    if (install < 0 || cliCheck !== install + 1 || credentials < 0 || cliCheck > credentials) {
      add(
        id,
        'installs only the pinned CLI (npm ci --ignore-scripts -w @hearth/infra), then runs CLI_CHECK, before the credentials action',
      )
    }
  }
  let pin: unknown
  for (const [path, text] of manifests) {
    let manifest: { name?: unknown; bin?: unknown; devDependencies?: Record<string, unknown> } = {}
    try {
      manifest = JSON.parse(text) as typeof manifest
    } catch {
      found.add(at(path, 'DPW-10', 'is a package.json npm can read'))
      continue
    }
    if (path === 'infra/package.json') pin = manifest.devDependencies?.['aws-cdk']
    const bin = manifest.bin
    const cdkBin =
      (typeof bin === 'string' && (manifest.name === 'cdk' || manifest.name === 'aws-cdk')) ||
      (typeof bin === 'object' && bin !== null && Object.hasOwn(bin, 'cdk'))
    if (manifest.name === 'aws-cdk' || cdkBin) {
      found.add(at(path, 'DPW-10', 'no workspace is named aws-cdk or declares a cdk bin'))
    }
  }
  let entry: Record<string, unknown> | undefined
  try {
    const packages = (JSON.parse(lockfile) as { packages?: Record<string, Record<string, unknown>> }).packages
    entry = packages?.['node_modules/aws-cdk']
  } catch {
    entry = undefined
  }
  if (
    entry === undefined ||
    typeof entry.resolved !== 'string' ||
    !entry.resolved.startsWith('https://registry.npmjs.org/aws-cdk/-/') ||
    typeof entry.integrity !== 'string' ||
    Object.hasOwn(entry, 'link') ||
    typeof pin !== 'string' ||
    entry.version !== pin
  ) {
    found.add(
      at(
        'package-lock.json',
        'DPW-10',
        "node_modules/aws-cdk is the registry's package at infra's pin, with an integrity and no link",
      ),
    )
  }
  return [...found]
}

// --- DPW-11, DPW-12: every workflow -----------------------------------------------------------------------

// DPW-11 (C11-D48): every actions/checkout, in every workflow, leaves no credential in the checkout. The
// action is named in any letter case (GitHub resolves an owner and a repository so), and its uses: is read
// unquoted.
const CHECKOUT = /^actions\/checkout(?![\w.-])/i
export function checkoutFindings(workflows: Texts): Finding[] {
  const found: Finding[] = []
  for (const [path, text] of workflows) {
    for (const job of workflowJobs(text)) {
      parsedSteps(job).forEach((step, index) => {
        if (CHECKOUT.test(step.uses ?? '') && step.with.get('persist-credentials') !== 'false') {
          found.push(
            at(path, 'DPW-11', `${job.id} (${label(step, index)}): actions/checkout has persist-credentials: false`),
          )
        }
      })
    }
  }
  return found
}

// The words DPW-12 refuses (C11-D63, C11-D64): the Owner bootstrap script's input and the script, a secret's
// value, an ECS exec or Session Manager session, a database token, the landing-zone entry and the
// break-glass helper, none of which a workflow ever needs. ci.yml runs the bootstrap script's check and
// names the landing-zone entry, so the other workflows are held to the six general ones.
export const DEPLOY_WORDS = [
  'OWNER_BOOTSTRAP_INPUT',
  'owner-bootstrap',
  'get-secret-value',
  'execute-command',
  'start-session',
  'generate-db-auth-token',
  'bin/landing-zone',
  'break-glass.sh',
] as const
export const GENERAL_WORDS = DEPLOY_WORDS.filter(word => word !== 'owner-bootstrap' && word !== 'bin/landing-zone')
const wordIn = (text: string, word: string) =>
  new RegExp(`(?<![\\w-])${word.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\w-])`, 'i').test(text)

// DPW-12 (C11-D63, C11-D64): deploy.yml, comments included, names none of DEPLOY_WORDS anywhere, even inside
// a longer word (check-owner-bootstrap, x-get-secret-value); every other workflow, its YAML comments
// stripped (commentLines: a line starting with # inside a run is bash's, and in a quoted string or a
// here-document no comment at all), none of GENERAL_WORDS as a word.
export function forbiddenWordFindings(workflows: Texts): Finding[] {
  const found: Finding[] = []
  for (const [path, text] of workflows) {
    if (path === DEPLOY) {
      for (const word of DEPLOY_WORDS) {
        if (text.toLowerCase().includes(word.toLowerCase())) found.push(at(path, 'DPW-12', `names ${word}`))
      }
      continue
    }
    const comments = new Set(commentLines(text))
    const read = text
      .split('\n')
      .filter((_, index) => !comments.has(index))
      .join('\n')
    for (const word of GENERAL_WORDS) if (wordIn(read, word)) found.push(at(path, 'DPW-12', `names ${word}`))
  }
  return found
}

// --- DPW-13: what is built, pushed, synthesised and recorded --------------------------------------------

const BUILD_IF = `\${{ ${BOT_TEST} && needs.gate.outputs.build == 'true' }}`

// Each gh api call in a run as written (comments blanked), from gh to the end of its command: the next ;,
// |, & or ) outside a $( … ), or the end of a line no backslash continues.
function ghApiCalls(run: string): string[] {
  const { text, code } = shellViews(run)
  const calls: string[] = []
  for (const match of code.matchAll(/(?<![\w$-])gh\s+api(?![\w-])/g)) {
    let end = match.index + match[0].length
    let depth = 0
    for (; end < code.length; end++) {
      const c = code[end] ?? ''
      if (c === '$' && code[end + 1] === '(') {
        depth++
        end++
      } else if (c === ')' && depth > 0) depth--
      else if (depth === 0 && (/[;|&)]/.test(c) || (c === '\n' && code[end - 1] !== '\\'))) break
    }
    calls.push(text.slice(match.index, end))
  }
  return calls
}

// Whether a gh api call writes (DPW-13): a body in any spelling (--input, -f, -F, --field, --raw-field,
// a flag's value attached or not, gh then sending a POST), a method other than GET in any spelling (-X
// POST, -XPOST, --method=POST), or GraphQL.
const GH_BODY = /^(?:--input|--field|--raw-field)(?:=|$)|^-[A-Za-z]*[fF]/
function ghWrites(call: string): boolean {
  const words = call
    .split(/\s+/)
    .slice(2)
    .map(word => word.replace(/^(["'])(.*)\1$/, '$2'))
  return words.some((word, i) => {
    if (GH_BODY.test(word) || word === 'graphql') return true
    const method = /^--method(?:=(.*))?$/.exec(word) ?? /^-[A-Za-z]*X(.*)$/.exec(word)
    if (!method) return false
    return (method[1] || words[i + 1] || '').replace(/^["']|["']$/g, '').toUpperCase() !== 'GET'
  })
}
const NAMES_DEPLOYMENTS = /\/deployments(?![\w-])/
// What a record job runs beside its deployments: write (DPW-13): bash's own, its step's functions, jq and
// gh api, in one step with no action, so no checkout and no repository code runs where records can be
// written; local with no flag (no -n or -i, either of which evaluates a value it is later given).
const RECORD_JOBS = ['record-nonprod', 'record-prod']
const RECORD_WORDS = [
  '[',
  '[[',
  ']]',
  '{',
  '}',
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'echo',
  'local',
  'exit',
  'set',
  'jq',
  'gh',
]
const RECORD_BODY = ['jq -n', 'ref: "main"', 'auto_merge: false', 'required_contexts: []']
const MIGRATED_BODY = 'task: "hearth-migrated"'
const MIGRATE_END = 'one_off_end migrate "$MIGRATE_LINES" "$RUN"'

// DPW-13 (C11-D44, C11-D50, C11-D51, C11-D61, C11-D79; T24 item 10): build runs only when the gate says so (a
// deploy, not a restore); no :latest and no image named by a tag but this run's own push; the push is
// SKOPEO_COPY (--preserve-digests, --digestfile, the tag sha-$COMMIT-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT), in
// the deploy-mode push step of nonprod and prod alone, so no rollback, drill or restore pushes; the synth
// is the pipeline's own, by mode, never synth:ci, synth:lz, HEARTH_FAKE_RELEASE or cdk synth; release
// records are written by record-nonprod and record-prod alone (and restore records by record-prod), the
// migration record by nonprod's and prod's migrate steps alone, after migrate's own end, a write being
// any gh api call with a body or a method other than GET, however spelled (ghWrites), and no other
// GitHub API write made; each record's body built whole by jq -n with ref main, auto_merge false and no
// required contexts, and sent with --input -; and each record job is one step, with no action (so no
// checkout), running only bash's own, its functions, jq and gh api. (Every deploy of a recorded digest
// checks ECR's tags for its commit inside AWS_CHECK, which DPW-06 pins.)
export function releaseFindings(workflows: Texts): Finding[] {
  const found = new Set<Finding>()
  const text = workflows.get(DEPLOY) ?? ''
  const add = (where: string, rule: string) => found.add(at(DEPLOY, 'DPW-13', `${where}: ${rule}`))
  const jobs = jobsOf(text)
  const build = jobs.get('build')
  if (build === undefined || jobScalar(build.job, 'if') !== BUILD_IF || jobNeeds(build.job).join(',') !== 'gate') {
    add('build', 'runs only when the gate says so: a deploy, not a restore')
  }
  if (/:latest\b/i.test(text)) add('deploy.yml', 'names no image :latest')
  if (/synth:ci|synth:lz|HEARTH_FAKE_RELEASE|\bcdk\s+synth\b|"\$CDK"\s+synth/.test(text)) {
    add(
      'deploy.yml',
      "synthesises only with the pipeline's npm run synth, never synth:ci, synth:lz, HEARTH_FAKE_RELEASE or cdk synth",
    )
  }
  for (const id of RECORD_JOBS) {
    const steps = jobs.get(id)?.steps ?? []
    const run = steps[0]?.run ?? ''
    const read = readShell(run)
    const own = new Set(definitionsOf(run, read).map(each => each.name))
    if (
      steps.length !== 1 ||
      steps[0]?.uses !== undefined ||
      runLines(run).some(line => RUNNER_WORDS.test(line.text)) ||
      commandsOf(run, read).some(
        command =>
          command.prefixes.some(prefix => WRAPPERS.includes(prefix)) ||
          !(RECORD_WORDS.includes(command.word) || own.has(command.word)) ||
          (command.word === 'gh' && !/^\s+api\s/.test(command.rest)) ||
          (command.word === 'local' && !NO_FLAG(command)),
      )
    ) {
      add(id, 'runs one step, with no action, of only bash’s own, its functions, jq and gh api: no repository code')
    }
    // Its own lines are read by the table, each command held to its uses.
    const where = steps[0] === undefined ? id : `${id} (${label(steps[0], 0)})`
    const refused = refusedAt(where, read)
    if (refused !== undefined) add(refused, AS_BASH)
    if (read.commands.some(command => !glueIsHeld(command, own))) add(where, HELD)
  }
  for (const { id, steps } of jobs.values()) {
    steps.forEach((step, index) => {
      const where = `${id} (${label(step, index)})`
      const run = step.run ?? ''
      for (const line of runLines(run)) {
        const raw = line.raw.trim()
        if (/docker:\/\//.test(line.text) && raw !== SKOPEO_COPY)
          add(where, 'names an image by no tag but the push’s own')
        if (/skopeo\s+copy/.test(line.text)) {
          if (raw !== SKOPEO_COPY) {
            add(
              where,
              'pushes only as SKOPEO_COPY: --preserve-digests, --digestfile and the tag sha-$COMMIT-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT',
            )
          }
          if (step.id !== 'push' || PUSH_IF[id] === undefined || step.if !== PUSH_IF[id]) {
            add(
              where,
              'pushes only in the deploy-mode push step of nonprod and prod: no rollback, drill or restore pushes',
            )
          }
        }
        if (/npm\s+run\s+synth\b|CONTEXT=|-c\s+release=/.test(line.code) && !SYNTH_LINES.includes(raw)) {
          add(
            where,
            'synthesises only as npm run synth -w @hearth/infra -- -c release="$COMMIT:$DIGEST", by mode -c drill=break:nonprod or -c restoreActive=true, and -o',
          )
        }
      }
      // Every write through gh api is a record's (a deployment or its status), its body sent whole.
      const writes = ghApiCalls(run).filter(ghWrites)
      if (writes.some(call => !NAMES_DEPLOYMENTS.test(call))) {
        add(where, 'makes no GitHub API write but a record’s')
      }
      if (
        writes.some(
          call =>
            !/\s--input\s+-(?:\s|$)/.test(call) || /\s(?:-[A-Za-z]*[fF]|--field|--raw-field)(?:[\s=]|$)/.test(call),
        )
      ) {
        add(where, 'sends a record’s body whole, with --input -')
      }
      if (!writes.some(call => NAMES_DEPLOYMENTS.test(call))) return
      const record = id === 'record-nonprod' || id === 'record-prod'
      const migrate = run.includes(MIGRATED_BODY)
      if (!record && !(migrate && (id === 'nonprod' || id === 'prod'))) {
        add(
          where,
          'writes no record: release records are record-nonprod’s and record-prod’s, migration records migrate’s',
        )
      }
      if (record && (run.includes('hearth-migrated"') || (id === 'record-nonprod' && /\bhearth-restore\b/.test(run)))) {
        add(where, 'writes release records (and in record-prod restore records) alone')
      }
      if (!RECORD_BODY.every(part => run.includes(part))) {
        add(where, 'builds each record’s body whole by jq -n, with ref main, auto_merge false and no required contexts')
      }
      if (migrate) {
        const end = lineIndexOf(run.split('\n'), MIGRATE_END)
        const body = run.split('\n').findIndex(line => line.includes(MIGRATED_BODY))
        if (end < 0 || body < end) {
          add(where, 'writes the migration record only after migrate’s own end, which fails on any exit but 0')
        }
        // Its one record and that record's status, and no release or restore record beside them.
        if (writes.length !== 2 || /hearth-(?:release|restore)\b/.test(run)) {
          add(where, 'writes in its migrate step the one migration record and its status alone')
        }
      }
    })
  }
  return [...found]
}

// --- DPW-14: the asset and release checks -------------------------------------------------------------------

const RUNNER_TEMP = `${expr('runner.temp')}/`
const assetCheckRun = (folders: readonly string[], variable: string) =>
  [
    'set -euo pipefail',
    ASSET_CHECK,
    ...folders.flatMap(folder => [
      `check_assembly "$RUNNER_TEMP/${folder}"`,
      `check_release_in "$RUNNER_TEMP/${folder}" "$${variable}"`,
    ]),
  ].join('\n')

// DPW-14 (C11-D76): every credentialed job runs ASSET_CHECK, check_assembly then check_release_in with the
// release it deploys, on each folder it downloaded, after its downloads and before the credentials
// action; synth runs it on each folder it uploads, before the upload; every download-artifact step's if:
// requires its artifact-ids non-empty (an empty one downloads every artifact of the run); and every step
// that runs the CLI starts it in CDK_FOLDER's fresh folder.
export function assetCheckFindings(workflows: Texts): Finding[] {
  const found = new Set<Finding>()
  const add = (where: string, rule: string) => found.add(at(DEPLOY, 'DPW-14', `${where}: ${rule}`))
  for (const { id, steps } of jobsOf(workflows.get(DEPLOY) ?? '').values()) {
    steps.forEach((step, index) => {
      const where = `${id} (${label(step, index)})`
      if (step.uses?.startsWith('actions/download-artifact@')) {
        const ids = /^\$\{\{\s*([\w.-]+)\s*\}\}$/.exec(step.with.get('artifact-ids') ?? '')?.[1]
        if (ids === undefined || step.if === undefined || evaluateIf(step.if, { [ids]: '' }) !== false) {
          add(where, 'downloads only with an if: that requires its artifact-ids to be non-empty')
        }
      }
      const lines = (step.run ?? '').split('\n').map(line => line.trim())
      const cli = lines.findIndex(line => line.includes('"$CDK"') && !line.startsWith('CDK='))
      if (cli >= 0 && !lines.slice(0, cli).includes(CDK_FOLDER))
        add(where, 'starts the CLI in CDK_FOLDER’s fresh folder')
    })
    if (ENVIRONMENT_JOBS[id] !== undefined) {
      const downloads = steps.flatMap((step, index) =>
        step.uses?.startsWith('actions/download-artifact@') ? [index] : [],
      )
      const folders = downloads
        .map(index => steps[index]?.with.get('path') ?? '')
        .filter(path => path !== `${RUNNER_TEMP}image`)
        .map(path => (path.startsWith(RUNNER_TEMP) ? path.slice(RUNNER_TEMP.length) : path))
      const rollback = DEPLOY_JOBS[id]?.rollback === true
      const variable = rollback ? 'PREVIOUS' : 'RELEASE'
      const check = steps.findIndex(step => step.run === assetCheckRun(folders, variable))
      const credentials = credentialsAt(steps)
      if (
        folders.length === 0 ||
        check < 0 ||
        check < Math.max(...downloads) ||
        credentials < 0 ||
        check > credentials ||
        steps[check]?.env.get(variable) !== (rollback ? PREVIOUS_OUTPUT : RELEASE_OUTPUT)
      ) {
        add(
          id,
          'runs ASSET_CHECK on each folder it downloaded, with the release it deploys, after its downloads and before the credentials action',
        )
      }
    }
    if (id === 'synth') {
      steps.forEach((step, index) => {
        if (!step.uses?.startsWith('actions/upload-artifact@')) return
        const path = step.with.get('path') ?? ''
        const folder = path.startsWith(RUNNER_TEMP) ? path.slice(RUNNER_TEMP.length) : path
        const checked = steps
          .slice(0, index)
          .some(other => other.run === assetCheckRun([folder], 'RELEASE') && other.if === step.if)
        if (!checked)
          add(`synth (${label(step, index)})`, 'runs ASSET_CHECK on each assembly it uploads, before the upload')
      })
    }
  }
  return [...found]
}
