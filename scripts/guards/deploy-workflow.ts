// The deploy-workflow guard's rules (DPW-01 to DPW-14; C0.11, TECH-SPEC T24 items 20 to 23 and 28):
// what .github/workflows/deploy.yml must be, what every other workflow mustn't do around it, and the
// GitHub environments written as code beside it. deploy-workflow.test.ts proves each case on planted
// text, then holds the repository to it. Each case is one function taking the texts it reads (the
// workflows by path, the environment files, non-prod's holdsRealData, the manifests) and returning
// findings, `<path>: DPW-nn <rule>`, each naming a rule (and a job or step) and never a value.
//
// Beside the cases are the canonical texts the workflow pastes byte for byte wherever it runs them:
// the preamble, the CLI's folder, the CLI, asset and AWS checks, the one-off runs and their parts,
// the newest-release reader, the CLI's lines, the push and the synth's lines, so the workflow and
// its guard can't drift apart unseen. A shell text here is a raw template in which a backtick is
// written \` and a dollar-brace $\{, the one way it differs from the workflow's own text.
//
// The workflow is read through workflow.ts, which refuses any shape it can't read (DPW-02), and each run
// step through shellViews() and shellCommands() below, which set aside what bash reads as data
// (comments, quoted text outside its command substitutions, a test's operands and a case's patterns),
// so a word a rule forbids as a command is found where bash would run it and not where it is a jq path,
// a message or a URL; the words no credentialed job may name at all (an interpreter's, say) are found
// anywhere outside a comment. An if: is read by evaluateIf(), which asks whether any value it doesn't
// know could let a bot, a drill or a failed job through. This file decides who and what may deploy, so
// it is on the owner's-read list (C11-D74).
import {
  type BlockValue,
  blockValue,
  concurrencyOf,
  jobConcurrency,
  jobEnvironment,
  jobNeeds,
  jobPermissions,
  jobScalar,
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
// cdk and skopeo command then runs as `run …`, its output shown through the 12-digit filter, or
// inside `$(get …)`, its output kept and never printed and its errors filtered (DPW-07).
export const PREAMBLE = sh`set -euo pipefail
# Every aws, cdk and skopeo command runs as \`run …\` (its output shown through the account-id filter)
# or inside \`$(get …)\` (its output kept for use and never printed, its errors filtered) (C11-D61).
mask() { sed -uE 's/[0-9]{12}/***/g'; }
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
# goes back to) and FIRST (true when the gate found no release record) from the environment.
# - No Services stack, or one a failed first create left with no Release, is no release, which only
#   a first deploy may find. A stack still moving, or a service with more than one deployment, waits.
# - deploy: what runs is on main at this run's commit. rollback: the target's digest isn't the one
#   running and its commit is strictly older. drill and restore: what runs is the release the gate
#   read. auto: what runs is this run's release, or it outputs rolled=false and deploys nothing
#   (another run deployed since, or this release never went live).
# - Drift (services running a digest other than Release's, as after an incident rollback outside the
#   pipeline) refuses a deploy and a drill, naming the rollback to what runs, and allows a rollback
#   only to the release all three services run.
# - Every recorded digest it deploys is in ECR under its own commit's tag (sha-<commit>-<run>-<attempt>).
# It writes go=true, or go=false, to the step's outputs, and one summary line through the filter.
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
  local mode=$1 stage=$STAGE out status release='' running='' digests=() td image tag
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
    drill | restore)
      [ "$release" = "$RELEASE" ] || aws_refuse 'what runs is not the release the gate read'
      ;;
    auto)
      release_shape "$PREVIOUS" || aws_refuse 'the previous release is not <commit>:<digest>'
      if [ "$release" != "$RELEASE" ]; then
        printf 'go=false\nrolled=false\n' >>"$GITHUB_OUTPUT"
        echo "aws-check: auto: this run's release isn't what runs (another run deployed since, or it never went live), so nothing is rolled back" |
          mask | tee -a "$GITHUB_STEP_SUMMARY"
        return 0
      fi
      ;;
    *) aws_refuse 'the mode is not deploy, rollback, drill, restore or auto' ;;
  esac
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
    withheld=$(($(jq length <<<"$log") - $(printf '%s' "$shown" | grep -c '^' || true)))
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
// payload checked as history.ts checks it, in its order (the api's revision, then the deployment's id).
export const NEWEST_RELEASE = sh`newest_release() {
  gh api "repos/$REPO/deployments?environment=$1&task=hearth-release&per_page=100" | jq -c --arg environment "$1" '
    [.[] | select(.task == "hearth-release" and .environment == $environment and (.payload | type == "object"))
      | {id, payload}
      | select(
          (.payload | keys) == ["commit", "digest", "kind", "migratedCommit", "schema", "services"]
          and .payload.schema == 1
          and (.payload.kind | IN("deploy", "rollback", "pipeline-rollback"))
          and (.payload.commit | type == "string" and test("^[0-9a-f]{40}$"))
          and (.payload.digest | type == "string" and test("^sha256:[0-9a-f]{64}$"))
          and (.payload.migratedCommit == null or (.payload.migratedCommit | type == "string" and test("^[0-9a-f]{40}$")))
          and (.payload.services | type == "object" and keys == ["api", "realtime", "worker"])
          and all(.payload.services | to_entries[]; .key as $role | .value | type == "string" and test("^hearth-" + $environment + "-" + $role + ":[1-9][0-9]{0,5}$")))
      | {id, commit: .payload.commit, revision: (.payload.services.api | split(":")[1] | tonumber)}]
    | sort_by(.revision, .id) | last'
}`

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
// each only for a restore stack that exists and has settled.
export const RESTORE_DOWN = sh`for PART in Services Data Platform; do
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
    ROLLBACK_COMPLETE)
      echo "restore down: Hearth-$STAGE-$PART is what a failed create left, so it is skipped" | mask | tee -a "$GITHUB_STEP_SUMMARY"
      continue
      ;;
    *_IN_PROGRESS)
      echo "restore down: Hearth-$STAGE-$PART is $STATUS: wait for it to settle, then dispatch again" | mask
      exit 1
      ;;
  esac
  ${CDK_DEPLOY_DOWN}
done`

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
// kept as written. A single quote inside double quotes, a $# or a ${#…} is read as bash reads it.
export function shellViews(run: string): { text: string; code: string; quotedLines: ReadonlySet<number> } {
  let text = ''
  let code = ''
  const stack: Array<{ kind: 'double' } | { kind: 'paren'; depth: number } | { kind: 'tick' }> = []
  const blank = (c: string) => (c === '\n' ? '\n' : ' ')
  // The lines that start inside a quoted string, whose first word is no command.
  const quotedLines = new Set<number>()
  let line = 0
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
  let i = 0
  while (i < run.length) {
    const c = run[i] ?? ''
    const next = run[i + 1] ?? ''
    const frame = stack[stack.length - 1]
    if (frame?.kind === 'double') {
      if (c === '\\') {
        quoted(c + next)
        i += 2
      } else if (c === '"') {
        keep(c)
        stack.pop()
        i++
      } else if (c === '$' && next === '(') {
        keep('$(')
        stack.push({ kind: 'paren', depth: 1 })
        i += 2
      } else if (c === '`') {
        keep(c)
        stack.push({ kind: 'tick' })
        i++
      } else if (c === '$' && next === '{') {
        const end = run.indexOf('}', i)
        const stop = end < 0 ? run.length : end + 1
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
    } else if (c === '#' && (code === '' || /[\s;&|()]$/.test(code))) {
      const end = run.indexOf('\n', i)
      const stop = end < 0 ? run.length : end
      const comment = [...run.slice(i, stop)].map(blank).join('')
      text += comment
      code += comment
      i = stop
    } else if (c === "'") {
      const end = run.indexOf("'", i + 1)
      const close = end < 0 ? run.length : end
      keep("'")
      quoted(run.slice(i + 1, close))
      if (end >= 0) keep("'")
      i = end < 0 ? close : close + 1
    } else if (c === '"') {
      keep(c)
      stack.push({ kind: 'double' })
      i++
    } else if (c === '`') {
      keep(c)
      if (frame?.kind === 'tick') stack.pop()
      else stack.push({ kind: 'tick' })
      i++
    } else {
      if (frame?.kind === 'paren' && c === '(') frame.depth++
      keep(c)
      i++
      if (frame?.kind === 'paren' && c === ')' && --frame.depth === 0) stack.pop()
    }
  }
  return { text, code, quotedLines }
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

// The code view with the words bash reads as operands and not as commands blanked too: a [[ … ]] test's
// operands and patterns, and each case item's patterns, all but the $( … ) substitutions inside them.
function commandCode(code: string): string {
  const lines = code.replace(/\[\[([^\n]*?)\]\]/g, (_, inner: string) => `[[${keepSubstitutions(inner)}]]`).split('\n')
  let depth = 0
  let pattern = false
  for (let n = 0; n < lines.length; n++) {
    let line = lines[n] ?? ''
    if (depth > 0 && /^\s*esac\b/.test(line)) {
      depth--
      pattern = depth > 0
      continue
    }
    if (depth > 0 && pattern && line.trim() !== '') {
      const start = line.length - line.trimStart().length
      let level = 0
      let end = -1
      for (let i = start; i < line.length && end < 0; i++) {
        if (line[i] === '(') level++
        else if (line[i] === ')') {
          if (level === 0) end = i
          else level--
        }
      }
      if (end >= 0) {
        line = line.slice(0, start) + keepSubstitutions(line.slice(start, end + 1)) + line.slice(end + 1)
        pattern = false
      }
    }
    if (/\bcase\b.*\bin\s*$/.test(line)) {
      depth++
      pattern = true
    } else if (depth > 0 && line.includes(';;')) {
      pattern = true
    }
    lines[n] = line
  }
  return lines.join('\n')
}

// A command bash would run, by its line in the run: its word (as the code view shows it, a quoted word's
// text blanked), the prefixes before it (run, get, exec, command, env, an assignment, …), and whether it
// is the first command of a $( … ), whose output is captured. A word starts a command at the start of a
// line, after ; & | ! or a keyword (never a keyword itself), inside $( … ), <( … ) or a subshell's ( … ),
// or after a group's {.
export interface ShellCommand {
  line: number
  prefixes: string[]
  word: string
  substituted: boolean
  // Its arguments as the command code shows them, up to the next ;, |, &, ) or substitution.
  rest: string
}

const COMMAND = new RegExp(
  String.raw`(^|[;|!]|(?<![<>])&|\$\((?!\()|[<>]\(|(?<![=$<>\w(])\(|(?<![$\w])\{(?=\s)|\b(?:then|do|else|elif|if|while|until|time)(?=\s))\s*` +
    String.raw`((?:(?:run|get|exec|command|builtin|nohup|sudo(?:\s+-\S+)*|xargs(?:\s+-\S+)*|timeout(?:\s+-\S+)*\s+\S+|env(?:\s+-\S+)*(?:\s+[A-Za-z_]\w*=\S*)*|[A-Za-z_]\w*=(?:[^\s$]|\$(?!\())*)\s+)*)` +
    String.raw`(?!(?:then|do|else|elif|if|while|until|time)(?![\w-])|\$\(|!\s)("[^"\n]*"|'[^'\n]*'|(?:[^\s;&|()<>'"$]|\$(?!\())+)`,
  'g',
)

export function shellCommands(run: string): ShellCommand[] {
  const commands: ShellCommand[] = []
  const views = shellViews(run)
  commandCode(views.code)
    .split('\n')
    .forEach((text, line) => {
      // A line that starts inside a quoted string starts no command there.
      const read = views.quotedLines.has(line) ? `)${text}` : text
      for (const match of read.matchAll(COMMAND)) {
        const word = match[3] ?? ''
        // An assignment alone (X=$(…)) runs nothing itself, what it substitutes is read after it, and a
        // word that starts with -, = or a digit is an operand (a test's ! -L, a != , a redirection's 2).
        if (/^[A-Za-z_]\w*\+?=|^[-=\d]/.test(word)) continue
        const after = read.slice(match.index + match[0].length)
        commands.push({
          line,
          prefixes: (match[2] ?? '').trim().split(/\s+/).filter(Boolean),
          word,
          substituted: match[1] === '$(',
          rest: after.slice(0, after.search(/[;|&)]|[$<>]\(|$/)),
        })
      }
    })
  return commands
}

// The functions a run defines (name() {), each as bash would then run it.
const definedFunctions = (run: string) =>
  [...shellViews(run).code.matchAll(/(?:^|[;&|({]\s*|\n\s*)([A-Za-z_][\w-]*)\s*\(\)\s*\{/g)].map(
    match => match[1] ?? '',
  )

// Each line of a run with its two views, for the rules that read a line's text or its code.
function runLines(run: string): Array<{ index: number; raw: string; text: string; code: string }> {
  const views = shellViews(run)
  const text = views.text.split('\n')
  const code = views.code.split('\n')
  return run.split('\n').map((raw, index) => ({ index, raw, text: text[index] ?? '', code: code[index] ?? '' }))
}

// --- Reading an if: as GitHub reads it -------------------------------------------------------------------

// What an if: can come to when only some values are known: true, false, or undefined when it turns on a
// value that isn't (Kleene's logic over GitHub's expressions: && and || return an operand, == on strings
// ignores case, and every function but endsWith, startsWith and contains is unknown).
const UNKNOWN = Symbol('unknown')
type Value = string | number | boolean | null | typeof UNKNOWN

function truth(value: Value): boolean | undefined {
  if (value === UNKNOWN) return undefined
  if (typeof value === 'string') return value !== ''
  if (typeof value === 'number') return value !== 0
  return value === true
}

export function evaluateIf(expression: string, known: Readonly<Record<string, string>>): boolean | undefined {
  const body = expression.trim().replace(/^\$\{\{([\s\S]*)\}\}$/, '$1')
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
      left = t === true ? left : t === false ? right : truth(right) === true ? true : UNKNOWN
    }
    return left
  }
  const and = (): Value => {
    let left = not()
    while (peek() === '&&') {
      take()
      const right = not()
      const t = truth(left)
      left = t === false ? left : t === true ? right : truth(right) === false ? false : UNKNOWN
    }
    return left
  }
  const not = (): Value => {
    if (peek() === '!') {
      take()
      const t = truth(not())
      return t === undefined ? UNKNOWN : !t
    }
    return compare()
  }
  const compare = (): Value => {
    const left = primary()
    const op = peek()
    if (op !== '==' && op !== '!=' && op !== '<' && op !== '>' && op !== '<=' && op !== '>=') return left
    take()
    const right = primary()
    if (left === UNKNOWN || right === UNKNOWN || (op !== '==' && op !== '!=')) return UNKNOWN
    const same =
      typeof left === 'string' && typeof right === 'string'
        ? left.toLowerCase() === right.toLowerCase()
        : left === right
    return op === '==' ? same : !same
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
      if (token === 'endsWith') return a.toLowerCase().endsWith(b.toLowerCase())
      if (token === 'startsWith') return a.toLowerCase().startsWith(b.toLowerCase())
      if (token === 'contains') return a.toLowerCase().includes(b.toLowerCase())
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

// DPW-01 (C11-D47, C11-D62): deploy.yml starts on a push to main and a person's dispatch with exactly the
// four inputs, nothing else; no workflow uses pull_request_target or workflow_run; main's ruleset still
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
    if (yamlLines(text).some(line => /\b(?:pull_request_target|workflow_run)\b/.test(line.text))) {
      found.push(at(path, 'DPW-01', 'uses neither pull_request_target nor workflow_run'))
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

// ciSynthProblems' id-token clause, as it stood (C11-D62): no id-token or write-all anywhere, comments
// included, in any case, and no double-quoted key, or key's double-quoted value, holding a backslash,
// since an escape (id\x2Dtoken) could spell either unseen.
const ID_TOKEN = /id-token|write-all/i
const QUOTED = String.raw`"(?:[^"\\\n]|\\.)*`
const ESCAPED_KEY = new RegExp(String.raw`${QUOTED}\\(?:[^"\\\n]|\\.)*"\s*:(?:\s|$)`, 'm')
const ESCAPED_VALUE = new RegExp(String.raw`^\s*(?:-\s+)?(?:[\w-]+|${QUOTED}")\s*:\s+${QUOTED}\\`, 'm')
const escaped = (text: string) => ESCAPED_KEY.test(text) || ESCAPED_VALUE.test(text)

const SHAPE =
  'is written in the shape workflow.ts reads: two-space block nesting, each key once in its mapping, each value whole on its line'

const describePermissions = (record: Readonly<Record<string, string>>) =>
  Object.entries(record)
    .map(([scope, level]) => `${scope}: ${level}`)
    .join(', ')

// DPW-02 (C11-D55): deploy.yml's top-level permissions are contents: read alone; each job's are exactly
// its own, an id-token in the five environment jobs alone and nowhere else in the file; no write-all,
// read-all or {}; every environment: a literal name; the file is block mappings (no flow mapping, anchor,
// alias or quoted key, which workflow.ts can't read) and spells nothing with an escape. Every workflow is
// in the shape workflow.ts reads (shapeProblems), so none is read wrong. Every other workflow holds the
// id-token clause as ciSynthProblems held it for ci.yml, and names no environment.
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
  if (escaped(yaml.join('\n'))) {
    found.push(
      at(DEPLOY, 'DPW-02', 'spells no key or value with an escape, which could name id-token or write-all unseen'),
    )
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
// either group in any letter case (groups are the repository's and ignore case, so one there could hold
// or cancel a deploy).
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
    if (path !== DEPLOY && GROUPS.test(other)) {
      found.push(at(path, 'DPW-05', 'names neither deploy-nonprod nor deploy-prod, in any letter case'))
    }
  }
  return found
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
    FIRST: expr('needs.gate.outputs.first_nonprod'),
  },
  prod: {
    RELEASE: RELEASE_OUTPUT,
    MODE,
    TARGET: expr('needs.gate.outputs.target'),
    FIRST: expr('needs.gate.outputs.first_prod'),
  },
  'rollback-prod': {
    RELEASE: RELEASE_OUTPUT,
    PREVIOUS: PREVIOUS_OUTPUT,
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
        if (/(?:^|[\s;&|(])(?:export\s+|declare\s+(?:-\S+\s+)*|local\s+|readonly\s+)?STAGE=/.test(line.code)) {
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
// What comes right before a write to the job summary: mask as a command after a pipe (or first on its line,
// a pipe's next line), then tee -a or >>.
const SUMMARY_THROUGH_MASK = /(?:^|\|)\s*mask\s*(?:\|\s*tee\s+-a\s+|>>\s*)"\$\{?$/
const AWS_ENV_ASSIGNMENT = /(?:^|[\s;&|(])(?:export\s+)?(?:AWS_[A-Z0-9_]*|ROLE_TO_ASSUME)=/

// DPW-07 (C11-D61): nothing a run prints shows what it shouldn't. No set -x, set -o xtrace, bare env or set,
// printenv, export -p or declare -p; no ${{ }} inside a run (inputs and outputs come through env:);
// secrets. names only the role and the account id in the five environment jobs, and never
// GITHUB_TOKEN; in each environment job the account id is masked before the credentials action, every
// run after it starts with the preamble, every aws, CDK and skopeo command is run … or $(get …), get
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
      const commands = shellCommands(run)
      if (
        lines.some(line => TRACE.test(line.code)) ||
        commands.some(
          command =>
            ['env', 'set', 'declare', 'typeset', 'export'].includes(command.word) &&
            command.prefixes.length === 0 &&
            /^\s*(?:$|[|;&>)])/.test(
              (lines[command.line]?.code ?? '').slice(
                (lines[command.line]?.code ?? '').indexOf(command.word) + command.word.length,
              ),
            ),
        )
      ) {
        add(where, 'runs no set -x, set -o xtrace, bare env or set, printenv, export -p or declare -p')
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
      if (credentials >= 0 && index > credentials && !(run === PREAMBLE || run.startsWith(`${PREAMBLE}\n`))) {
        add(where, 'a run after the credentials action starts with the preamble')
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
const RECHECK: Readonly<Record<string, { record: string; parts: readonly string[] }>> = {
  nonprod: {
    record: expr('needs.gate.outputs.current_nonprod_id'),
    parts: [NEWEST_RELEASE, 'newest=$(newest_release nonprod)'],
  },
  prod: {
    record: expr('needs.prod-gate.outputs.current_prod_id'),
    parts: [
      NEWEST_RELEASE,
      'newest=$(newest_release prod)',
      'if ! [[ "$BUILD_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || [ "$BUILD_DIGEST" != "$NONPROD_DIGEST" ]; then',
    ],
  },
}
const ANCESTRY = `if [ "$newest" != null ] && ! git merge-base --is-ancestor "$(jq -r .commit <<<"$newest")" "$GITHUB_SHA"; then`
const SAME_RECORD = `elif [ "$(jq -r '.id // ""' <<<"$newest")" != "$RECORD_ID" ]; then`
const READS_CHECKS = /check-runs|check-suites|commits\/[^/\s"]+\/status|\/statuses\/|\bcheck_runs\b/

// DPW-08 (C11-D52): prod needs prod-gate and prod-plan; prod-plan's if: requires non-prod's smoke for a
// deploy; prod-gate names no environment and holds no id-token, waits for main's check and migrations
// for a deploy alone, read from ci.yml's own run and its jobs (and the gate the pull request's the same
// way), never from a check run, and runs history.ts prod-gate with the mode; the fast re-checks come
// before the credentials and cover a deploy (ancestry, and in prod both digests) and a rollback or
// restore (the record id); each rollback job needs build, takes this run's digest from build for a
// deploy and from the gate for a drill-smoke, and runs only once its deploy job set services_started;
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
  const wait = gate?.steps.find(step => step.run?.includes('actions/runs?head_sha=$SHA&event=push&branch=main'))
  if (
    wait?.if !== expr("needs.gate.outputs.mode == 'deploy' && needs.gate.outputs.target == 'prod'") ||
    !has(
      wait.run,
      '"repos/$REPO/actions/runs?head_sha=$SHA&event=push&branch=main&per_page=100"',
      '.path == ".github/workflows/ci.yml"',
      '"repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100"',
      '("check", "migrations")',
    )
  ) {
    add(
      'prod-gate',
      "waits for main's check and migrations for a deploy alone, read from ci.yml's own run and its jobs",
    )
  }
  const prodGate = gate?.steps.find(step => step.run?.includes('infra/scripts/deploy/history.ts prod-gate'))
  if (
    !has(prodGate?.run, 'node infra/scripts/deploy/history.ts prod-gate --mode "$MODE"') ||
    prodGate?.env.get('MODE') !== MODE
  ) {
    add('prod-gate', 'runs history.ts prod-gate with the mode')
  }
  const pull = jobs.get('gate')?.steps.find(step => step.run?.includes('event=pull_request'))
  if (
    !has(
      pull?.run,
      '"repos/$REPO/actions/runs?head_sha=$HEAD&event=pull_request&per_page=100"',
      '.path == ".github/workflows/ci.yml"',
      '"repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100"',
    )
  ) {
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
      !has(step.run, ...want.parts, ANCESTRY, SAME_RECORD) ||
      step.env.get('RECORD_ID') !== want.record ||
      (id === 'prod' &&
        (step.env.get('BUILD_DIGEST') !== expr('needs.build.outputs.digest') ||
          step.env.get('NONPROD_DIGEST') !== expr('needs.nonprod.outputs.digest')))
    ) {
      add(
        id,
        "the fast re-check comes before the credentials and checks a deploy's ancestry (and in prod both digests) and any other mode's record id",
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
  'if ! PLAN=$(node infra/scripts/deploy/history.ts plan --event "$EVENT" --ref "$REF" --actor "$ACTOR" --triggering-actor "$TRIGGERING_ACTOR" --sha "$SHA" --target "$TARGET" --mode "$MODE" --release "$RELEASE" --restore "$RESTORE" --records "$RUNNER_TEMP/records" --checks "$RUNNER_TEMP/checks.json"); then'
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

// What a credentialed job may run (C11-D48): bash's own builtins and keywords, the functions its steps
// define, gh, git and jq, the text tools, aws and skopeo (through run and get), the pinned CLI (through
// run) and npm for the one install line. Anything else, a script by path, a variable or quoted word run
// as a command, is refused, and so is a function named as a program.
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
  'select',
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
  'unset',
  'true',
  'false',
  'test',
  'break',
  'continue',
  'wait',
]
const TOOLS = [
  'jq',
  'gh',
  'git',
  'sed',
  'grep',
  'tee',
  'cat',
  'head',
  'tail',
  'wc',
  'sort',
  'uniq',
  'tr',
  'cut',
  'mktemp',
  'readlink',
  'realpath',
  'find',
  'basename',
  'dirname',
  'date',
  'sleep',
  'aws',
  'skopeo',
]
// The tools that could run another program, held to the one use each job makes of them: git only to ask
// whether one commit is an ancestor of another, gh only as gh api, sed only as the preamble's mask, find
// only in ASSET_CHECK's search for a symbolic link, sort only with its plain flags, tee only appending to
// the summary, and mapfile with no callback. (trap, which runs its text, is no builtin a job may use.)
const MASK_LINE = PREAMBLE.split('\n').find(line => line.startsWith('mask()')) ?? ''
const FIND_LINE = ASSET_CHECK.split('\n').find(line => line.includes('find ')) ?? ''
const TOOL_USES: Readonly<Record<string, (rest: string, raw: string) => boolean>> = {
  git: rest => /^\s+merge-base\s+--is-ancestor\s/.test(rest),
  gh: rest => /^\s+api\s/.test(rest),
  sed: (_, raw) => raw === MASK_LINE.trim(),
  find: (_, raw) => raw === FIND_LINE.trim(),
  sort: rest => /^(?:\s+-[nruV]+)*\s*$/.test(rest),
  tee: rest => /^\s+-a\s+"\$GITHUB_STEP_SUMMARY"\s*$/.test(rest),
  mapfile: rest => !/(?:^|\s)-[A-Za-z]*C/.test(rest),
  readarray: rest => !/(?:^|\s)-[A-Za-z]*C/.test(rest),
}
// The words no credentialed run names anywhere outside a comment, so no tool can be handed one to run (a
// find -exec, a sort --compress-program, a git alias, a trap's text, a variable): the interpreters and
// the downloaders. node is a word, so node_modules passes; a jq path (.source) and the push's docker://
// transport are data.
const RUNNER_WORDS =
  /(?<![\w.-])(?:node|nodejs|npx|tsx|ts-node|deno|bun|python[\d.]*|perl|ruby|php|bash|sh|zsh|dash|ksh|eval|source|curl|wget|make|docker(?!:\/\/))(?![\w-])/
// The variables that choose what a later command runs or reads its settings from, which no credentialed
// run sets (but CDK_FOLDER's fresh HOME), and the files that set a later step's environment or path.
const LOADER_ASSIGNMENT =
  /(?:^|[\s;&|(])(?:export\s+|declare\s+(?:-\S+\s+)*|typeset\s+(?:-\S+\s+)*|local\s+|readonly\s+)?(?:PATH|HOME|BASH_ENV|ENV|CDPATH|SHELLOPTS|BASHOPTS|PS4|PROMPT_COMMAND|LD_\w+|NODE_\w+|NPM_\w+|npm_\w+|GIT_\w+|GH_\w+)\+?=/
const STEP_FILES = /\bGITHUB_(?:ENV|PATH)\b/
// What a credentialed run may write to: nothing but its outputs, its summary, prod-plan's diff and
// /dev/null, so no file the CLI or a tool then runs (node_modules/aws-cdk/bin/cdk, say) is rewritten.
const REDIRECTION = /(?<![<>&])(?:\d+|&)?>>?\|?\s*(\(|[^\s;|()<>]+)/g
const WRITABLE = /^(?:\/dev\/null|&[12]|"\$(?:GITHUB_OUTPUT|GITHUB_STEP_SUMMARY|DIFF)")$/

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
  'PROFILE_AT',
  'READBACK',
  'RECORD_ID',
  'REF',
  'RELEASE',
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
// ts-node, npm exec, python, make, curl, wget, db:reset, check-server or script by path, nor anything
// outside its list; CDK is assigned only by the preamble, as the registry package's own bin; the CLI
// runs only as deploy or diff with --app "$ASSEMBLY" (set once in its step to the folder it downloaded),
// after CDK_FOLDER, with no other change of folder, and with its safe flags; no line anywhere passes a
// refused flag or subcommand. Across the repository no workspace is named aws-cdk or declares a cdk bin,
// and the lockfile's aws-cdk is the registry's at infra's pin.
export function credentialedCodeFindings(workflows: Texts, manifests: Texts, lockfile: string): Finding[] {
  const found = new Set<Finding>()
  const add = (where: string, rule: string) => found.add(at(DEPLOY, 'DPW-10', `${where}: ${rule}`))
  shapeOfJobsFindings(workflows.get(DEPLOY) ?? '', add)
  for (const { id, steps } of jobsOf(workflows.get(DEPLOY) ?? '').values()) {
    const credentialed = ENVIRONMENT_JOBS[id] !== undefined
    const defined = new Set(steps.flatMap(step => (step.run === undefined ? [] : definedFunctions(step.run))))
    steps.forEach((step, index) => {
      const where = `${id} (${label(step, index)})`
      const run = step.run ?? ''
      const lines = runLines(run)
      if (lines.some(line => REFUSED_CLI.test(line.text)))
        add(where, 'passes none of the CLI’s refused flags or subcommands')
      for (const line of lines) {
        if (
          /(?:^|[\s;&|(])(?:export\s+|declare\s+(?:-\S+\s+)*|local\s+|readonly\s+)?CDK=/.test(line.code) &&
          line.raw.trim() !== PREAMBLE_CDK
        ) {
          add(where, 'assigns CDK only in the preamble, as the registry package’s node_modules/aws-cdk/bin/cdk')
        }
      }
      if (!credentialed) return
      if (step.uses !== undefined && !ALLOWED_USES.test(step.uses)) {
        add(where, 'uses only checkout, download-artifact and the credentials action')
      }
      const wrong = shellCommands(run).some(command => {
        const word = command.word
        if (word === '"$CDK"' || word === '"$@"') return false
        if (word === 'npm') return run !== INSTALL
        if (/^["'$]|\/|\.(?:sh|ts|js|mjs|cjs|py)$/.test(word)) return true
        const use = TOOL_USES[word]
        if (use !== undefined && !use(command.rest, lines[command.line]?.raw.trim() ?? '')) return true
        return !(BASH_OWN.includes(word) || TOOLS.includes(word) || defined.has(word))
      })
      const shadows = definedFunctions(run).some(
        name => TOOLS.includes(name) || BASH_OWN.includes(name) || name === 'npm',
      )
      if (
        wrong ||
        shadows ||
        lines.some(line => RUNNER_WORDS.test(line.text) || /\bdb:reset\b|\bcheck-server\b/.test(line.text))
      ) {
        add(
          where,
          'runs nothing but bash’s own, its functions, gh api, git merge-base, jq, the text tools, aws, skopeo and the pinned CLI, and names no npx, node, shell, source, eval, docker, python, make, curl, wget or script: no tool is handed a program to run',
        )
      }
      // Nothing it writes or sets chooses what a later command or step runs.
      const code = commandCode(shellViews(run).code).split('\n')
      if (
        code.some(line =>
          [...line.matchAll(REDIRECTION)].some(write => write[1] !== '(' && !WRITABLE.test(write[1] ?? '')),
        )
      ) {
        add(where, "writes no file but its outputs, its summary, prod-plan's diff and /dev/null")
      }
      if (
        lines.some(
          line => STEP_FILES.test(line.text) || (LOADER_ASSIGNMENT.test(line.code) && line.raw.trim() !== CDK_FOLDER),
        )
      ) {
        add(
          where,
          "sets no PATH, HOME (but CDK_FOLDER's), BASH_ENV or other variable that chooses what runs, and writes neither GITHUB_ENV nor GITHUB_PATH",
        )
      }
      const cli = lines.filter(line => /"\$CDK"|\$\{?CDK\b/.test(line.text) && !/(?:^|[\s;&|(])CDK=/.test(line.code))
      if (cli.length === 0) return
      const first = cli[0]?.index ?? 0
      const folder = lines.filter(line => line.raw.trim() === CDK_FOLDER)
      const assembly = lines.filter(line => /(?:^|[\s;&|(])ASSEMBLY=/.test(line.code))
      const wantAssembly = DEPLOY_JOBS[id]?.rollback
        ? 'ASSEMBLY="$RUNNER_TEMP/assembly-previous"'
        : 'ASSEMBLY="$RUNNER_TEMP/assembly"'
      const moves = shellCommands(run).filter(command => ['cd', 'pushd', 'popd'].includes(command.word))
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

// DPW-11 (C11-D48): every actions/checkout, in every workflow, leaves no credential in the checkout.
export function checkoutFindings(workflows: Texts): Finding[] {
  const found: Finding[] = []
  for (const [path, text] of workflows) {
    for (const job of workflowJobs(text)) {
      parsedSteps(job).forEach((step, index) => {
        if (step.uses?.startsWith('actions/checkout') && step.with.get('persist-credentials') !== 'false') {
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
// a longer word (check-owner-bootstrap, x-get-secret-value); every other workflow, comments stripped,
// none of GENERAL_WORDS as a word.
export function forbiddenWordFindings(workflows: Texts): Finding[] {
  const found: Finding[] = []
  for (const [path, text] of workflows) {
    if (path === DEPLOY) {
      for (const word of DEPLOY_WORDS) {
        if (text.toLowerCase().includes(word.toLowerCase())) found.push(at(path, 'DPW-12', `names ${word}`))
      }
      continue
    }
    const read = text
      .split('\n')
      .filter(line => !/^\s*#/.test(line))
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
// required contexts, and sent with --input -. (Every deploy of a recorded digest checks ECR's tags for
// its commit inside AWS_CHECK, which DPW-06 pins.)
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
