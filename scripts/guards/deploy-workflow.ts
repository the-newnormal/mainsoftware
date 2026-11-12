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
// the CLI's lines, the push and the synth's lines, and every run of every job whole (PINNED_RUNS), so
// the workflow and its guard can't drift apart unseen. A shell text here is a raw template in which a
// backtick is written \` and a dollar-brace $\{, the one way it differs from the workflow's own text.
// Every action the workflow uses is pinned to the one commit ACTION_PINS (action-pins.ts) names, which
// CI's check job proves against the action's own repository (scripts/check-action-pins.ts), so no
// commit that exists only in a fork, which GitHub resolves under the action's name, runs in a job.
//
// The workflow is read through workflow.ts, which refuses any shape it can't read (DPW-02), and any block
// scalar but a run:, whose last line break GitHub keeps in the value and the reader drops. Each run is
// read twice. Its own lines, every line outside a canonical text standing whole, are read by readShell()
// through SHELL_TABLE, an allowlist of the shell forms the workflow uses (blanks, word characters, quoting,
// expansions, substitutions, operators, redirections, keywords, tests, case patterns, functions,
// assignments and builtins as it holds them), so any form the table doesn't name is refused at its line
// (DPW-10 in a credentialed job, DPW-13 in a record job, DPW-07 in every other), whatever it is, and no
// review has to find it first; each command it reads in a credentialed or record job is held to the flags
// and arguments the workflow uses (GLUE_USES: a jq or gh program one whole single-quoted string, every aws
// word as aws reads it, an expansion in an aws value only as one of the words the workflow writes there,
// whole, a canonical text's function or a record job's own only as the workflow calls it), no line of its
// own sets an input a pinned line reads (its step's or job's env:, a canonical text's variable, REGISTRY or
// RUN, ACCOUNT_ID, or a name an aws value reads but by a command its step's pinned run holds), and none
// expands a name the run doesn't own (its step's or job's env: but GH_TOKEN, what it sets itself, and the
// runner's outputs, summary, folder and run ids), so the OIDC request token the runner hands every run step
// of a job with an id-token is never handed to a tool that could print it in pieces. The wiring between the
// runs is pinned too: every job's steps are the guard's, in order, by name and action (JOB_STEPS), so no
// step of its own stands before a pinned run in any job, and no run of any job names GITHUB_ENV,
// GITHUB_PATH or GITHUB_STATE, which would hand a later step a variable (BASH_ENV, say), a path or a
// state; every env: and every job's outputs: is the guard's, whole (STEP_ENVS, STAGES, JOB_OUTPUTS),
// written as a block mapping and never as one expression GitHub would read as the whole mapping, and every
// step's id is the guard's (STEP_IDS), so no step of its own answers for a pinned step's outputs; each run
// a gate, an approval, a smoke, a rollback or a record rests on is pinned whole with its step's if:
// (PINNED_RUNS), so no line of its own or if: ends or skips one early, writes an output, a file or a record
// of its own, or hands it another input; and so is every other run of every job, the five that hold the
// deploy role and build's and synth's (each synth step in its own folder) included, so no run of
// deploy.yml has a line of its own at all, and the table and the text rules are a second layer there (a
// word bash joins from quoted or expanded parts, or npm's and the CLI's own aliases, would pass a rule
// that reads the text); outside build and synth no other step writes an output. Build and synth still
// run repository code by design (the install, the synth, the image), which could write a later step's
// file by its folder, so synth's own asset check holds only against deploy.yml's text: each credentialed
// job's ASSET_CHECK, pinned in that job, is the check a deploy rests on. Every other workflow's jobs call
// only a workflow of this repository at the same commit, which every rule reads, and hand it no secret. A
// canonical text is read whole, so it is held instead to bash's own reading of it (readsAsBash()) and to
// evaluating only what it sets itself (outsideEvaluations()).
// Beside that, the regex reader shellViews() and shellCommands() still reads every run as a second layer
// that only ever adds a command: it sets aside what bash reads as data (comments, quoted text outside its
// command substitutions, a test's operands and a case's patterns) and reads through what comes before a
// command (an assignment, a redirection, a wrapper such as exec, command or env), so a word a rule forbids
// as a command is found where bash would run it and not where it is a jq path, a message or a URL; the
// words no credentialed job may name at all (an interpreter's, say) are found anywhere outside a comment.
// An if: is read by evaluateIf(), which asks whether any value it doesn't know could let a bot, a drill or
// a failed job through. This file decides who and what may deploy, so it is on the owner's-read list
// (C11-D74).
import { ACTION_PINS } from './action-pins'
import {
  type BlockValue,
  blockScalarProblems,
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
CDK="$RUNNER_TEMP/aws-cdk/package/bin/cdk"
export CDK_DISABLE_CLI_TELEMETRY=true CDK_DISABLE_VERSION_CHECK=true`

// The CLI's folder (C11-D76, DPW-10, DPW-14): before any CDK line, an empty folder made for the run and a
// fresh HOME, so no cdk.json (which could name a plugin or a build command) and no ~/.cdk.json waits there.
export const CDK_FOLDER = sh`cd "$(mktemp -d)" && HOME="$(mktemp -d)" && export HOME`

// The CLI's fetch (C11-D48, C11-D76, DPW-10): the whole run of the step that installs the CLI, before the
// credentials action. No npm runs in a job that holds the OIDC request token: npm would read the repository's
// .npmrc (whose git key names the program it runs for a git dependency) and lockfile, and the runner's npm 10
// runs a git dependency's prepare script under --ignore-scripts, so either would run code no review of
// deploy.yml sees. Instead the registry's aws-cdk tarball at infra's pin is fetched by its fixed URL into a
// folder of the runner's temp folder that CLI_FETCH makes itself (so nothing a download left can stand
// there), checked against the lockfile's sha512 integrity for it and unpacked there; aws-cdk has no
// dependencies, so the tarball is the whole CLI.
export const CLI_FETCH = sh`set -euo pipefail
# The pinned CDK CLI (CLI_FETCH; C11-D48, C11-D76): the registry's aws-cdk tarball at infra's pin, fetched
# and unpacked without npm, so nothing of the repository's (an .npmrc, a git dependency in the lockfile, a
# package script) runs or steers a program in a job that holds the OIDC request token. The lockfile's
# entry for it names that tarball with an integrity and no link; the tarball is fetched into a folder made
# for it here, and its sha512 must be that integrity before it is unpacked there, where CLI_CHECK then
# reads it. aws-cdk has no dependencies, so the tarball is the whole CLI. One line names a failure.
pin=$(jq -r '.devDependencies["aws-cdk"]' infra/package.json)
[[ "$pin" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "cli-fetch: infra's aws-cdk isn't pinned to one version"; exit 1; }
integrity=$(jq -er --arg pin "$pin" '.packages["node_modules/aws-cdk"] | select(type == "object" and .version == $pin and .resolved == "https://registry.npmjs.org/aws-cdk/-/aws-cdk-\($pin).tgz" and (has("link") | not)) | .integrity | select(type == "string" and test("\\Asha512-[A-Za-z0-9+/]{86}==\\z"))' package-lock.json) ||
  { echo "cli-fetch: the lockfile's aws-cdk isn't the registry's tarball at infra's pin"; exit 1; }
mkdir "$RUNNER_TEMP/aws-cdk"
curl -q --fail --silent --show-error --proto '=https' --tlsv1.2 --max-time 300 --max-filesize 104857600 --output "$RUNNER_TEMP/aws-cdk/aws-cdk.tgz" "https://registry.npmjs.org/aws-cdk/-/aws-cdk-$pin.tgz"
[ "sha512-$(openssl dgst -sha512 -binary "$RUNNER_TEMP/aws-cdk/aws-cdk.tgz" | base64 -w0)" = "$integrity" ] ||
  { echo "cli-fetch: the tarball's sha512 isn't the lockfile's integrity"; exit 1; }
tar -xzf "$RUNNER_TEMP/aws-cdk/aws-cdk.tgz" -C "$RUNNER_TEMP/aws-cdk" --no-same-owner`

// The CLI check (C11-D48, C11-D76, DPW-10): the whole run of the step after CLI_FETCH, before the credentials
// action. The CLI is the registry's aws-cdk at infra's pin as CLI_FETCH unpacked it, never a workspace's or a
// link.
export const CLI_CHECK = sh`set -euo pipefail
# The CLI check (CLI_CHECK; C11-D48, C11-D76): the CDK CLI this job runs is the registry's aws-cdk at
# infra's pin, as CLI_FETCH unpacked it, never a workspace's or a link: its manifest names aws-cdk at that
# version with its cdk bin and no dependency, nothing unpacked is a symbolic link, and its bin stays inside
# it. One line names a failure.
pin=$(jq -r '.devDependencies["aws-cdk"]' infra/package.json)
[[ "$pin" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "cli-check: infra's aws-cdk isn't pinned to one version"; exit 1; }
[ -z "$(find "$RUNNER_TEMP/aws-cdk" -type l -print -quit)" ] || { echo 'cli-check: the unpacked CLI holds a symbolic link'; exit 1; }
jq -e --arg pin "$pin" '.name == "aws-cdk" and .version == $pin and .bin.cdk == "bin/cdk" and ((.dependencies // {}) | length == 0)' "$RUNNER_TEMP/aws-cdk/package/package.json" >/dev/null ||
  { echo "cli-check: the unpacked aws-cdk isn't the registry's package at infra's pin"; exit 1; }
case "$(readlink -f "$RUNNER_TEMP/aws-cdk/package/bin/cdk")" in
  "$(readlink -f "$RUNNER_TEMP/aws-cdk/package")"/*) ;;
  *) echo 'cli-check: the CLI resolves outside the aws-cdk package'; exit 1 ;;
esac`

// The asset and release checks (C11-D76, DPW-14): check_assembly and check_release_in, defined here and called
// by each step that runs them on each folder it downloaded or uploads.
export const ASSET_CHECK = sh`# The asset and release checks (ASSET_CHECK; C11-D76, DPW-14). A downloaded cloud assembly is data
# the CLI acts on, so before any credential each one is walked from its root manifest through every
# nested assembly, the files its manifests name and not file names, and refused for: missing context
# (the CLI would look it up with this job's credentials); an artifact type a workload synth never
# writes; a named file that isn't a plain name in its own folder (letters, digits, dots, dashes and
# underscores, no ..); a legacy asset entry in any artifact's metadata, inline or in its metadata file
# (the CLI would build or upload it whatever the asset manifests say); a container image asset, or a
# file asset that runs a command, is packaged otherwise than file or zip, or whose path leaves the
# tree; a file asset with other than one destination, or whose destination isn't the staging bucket,
# its region and its file-publishing role spelled as the synth writes them (the CLI resolves a
# placeholder before it publishes, so another spelling would name the same object unseen), or whose key
# isn't content-addressed (a file's the sha256 of its bytes and .json, read from a plain name in its own
# folder, a zip's 64 hex digits and .zip): the CLI uploads nothing to a key that already holds an
# object, so whatever an earlier call or run put at a template's key is what CloudFormation gets, and
# with keys held to their bytes that is the template itself; no asset manifest at all; a stack whose
# deploy facts aren't the workload synth's (its environment, its deploy, execution and lookup roles,
# its bootstrap version and the parameter the CLI reads it from with the deploy role and prints when
# it isn't a number, termination protection on Platform and Data alone, and no notification topic,
# tag, parameter or other property: none is in a template or the approver's diff), or an asset
# manifest's (its bootstrap version and parameter alone); a stack whose name isn't Hearth- and its
# stage's id (the CLI would otherwise name it by its artifact's id), or whose template CloudFormation is
# handed isn't its own templateFile (the CLI hands CloudFormation the object stackTemplateAssetObjectUrl
# names, which the asset manifests upload, never the templateFile itself, so that URL must name an s3
# object that this folder's asset manifests upload from the stack's templateFile alone, as a file); any
# symbolic link.
# The release check then requires every Services template's Release output to be the release this
# job deploys, and every container image in the Tasks and Services templates to be the server image
# at its digest, reading the templateFile the CLI uploads, deploys and diffs. A refusal is one line
# naming the rule, never a path or value from the assembly.
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
  local root dir file path manifests=0 queue stackfiles
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
    jq -e '(.artifacts // {}) | all(.[]; if .type == "aws:cloudformation:stack" then .environment == "aws://unknown-account/ap-southeast-1" and (.properties | type == "object" and keys == ["additionalDependencies", "assumeRoleArn", "bootstrapStackVersionSsmParameter", "cloudFormationExecutionRoleArn", "lookupRole", "requiresBootstrapStackVersion", "stackName", "stackTemplateAssetObjectUrl", "templateFile", "terminationProtection", "validateOnSynth"] and .assumeRoleArn == "arn:$\{AWS::Partition}:iam::$\{AWS::AccountId}:role/cdk-hearthapp-deploy-role-$\{AWS::AccountId}-ap-southeast-1" and .cloudFormationExecutionRoleArn == "arn:$\{AWS::Partition}:iam::$\{AWS::AccountId}:role/cdk-hearthapp-cfn-exec-role-$\{AWS::AccountId}-ap-southeast-1" and .lookupRole == {arn: "arn:$\{AWS::Partition}:iam::$\{AWS::AccountId}:role/cdk-hearthapp-lookup-role-$\{AWS::AccountId}-ap-southeast-1", requiresBootstrapStackVersion: 8, bootstrapStackVersionSsmParameter: "/cdk-bootstrap/hearthapp/version"} and .requiresBootstrapStackVersion == 6 and .bootstrapStackVersionSsmParameter == "/cdk-bootstrap/hearthapp/version" and .validateOnSynth == false and .terminationProtection == (.stackName | type == "string" and test("-(Platform|Data)\\z"))) elif .type == "cdk:asset-manifest" then .properties == {file: .properties.file, requiresBootstrapStackVersion: 6, bootstrapStackVersionSsmParameter: "/cdk-bootstrap/hearthapp/version"} else true end)' "$dir/manifest.json" >/dev/null 2>&1 ||
      asset_refuse "a stack's or an asset manifest's deploy facts aren't the workload synth's: its environment, roles and bootstrap version, termination protection on Platform and Data alone, and no topic, tag, parameter or other property"
    jq -e '[(.artifacts // {})[] | (.additionalMetadataFile // empty), (if .type == "aws:cloudformation:stack" then .properties.templateFile elif .type == "cdk:cloud-assembly" then .properties.directoryName elif .type == "cdk:asset-manifest" or .type == "cdk:tree" then .properties.file else empty end)] | all(.[]; type == "string" and test("\\A[A-Za-z0-9][A-Za-z0-9_.-]*\\z") and (contains("..") | not))' "$dir/manifest.json" >/dev/null ||
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
      jq -e '(.files // {}) | all(.[]; (.source.packaging != "file" or (.source.path | test("\\A[A-Za-z0-9][A-Za-z0-9_.-]*\\z") and (contains("..") | not))) and (.destinations | type == "object" and length == 1) and all(.destinations[]; type == "object" and keys == ["assumeRoleArn", "bucketName", "objectKey", "region"] and .bucketName == "cdk-hearthapp-assets-$\{AWS::AccountId}-ap-southeast-1" and .region == "ap-southeast-1" and .assumeRoleArn == "arn:$\{AWS::Partition}:iam::$\{AWS::AccountId}:role/cdk-hearthapp-file-publishing-role-$\{AWS::AccountId}-ap-southeast-1" and (.objectKey | type == "string" and test("\\A[0-9a-f]{64}\\.(json|zip)\\z"))) and ((.source.packaging == "zip") == (.destinations[] | .objectKey | endswith(".zip"))))' "$dir/$file" >/dev/null 2>&1 ||
        asset_refuse "a file asset's one destination isn't the staging bucket, its region and its publishing role as the synth spells them, at a key of 64 hex digits that ends as its packaging does, or a file asset isn't a plain name in its own folder"
      while IFS=$'\t' read -r path key; do
        [ -f "$dir/$path" ] || asset_refuse "a file asset's key isn't the sha256 of its bytes"
        [ "$(sha256sum <"$dir/$path")" = "$\{key%.json}  -" ] || asset_refuse "a file asset's key isn't the sha256 of its bytes"
      done < <(jq -r '(.files // {})[] | select(.source.packaging == "file") | [.source.path, (.destinations[] | .objectKey)] | @tsv' "$dir/$file")
      manifests=$((manifests + 1))
    done < <(jq -r '(.artifacts // {})[] | select(.type == "cdk:asset-manifest") | .properties.file' "$dir/manifest.json")
    stackfiles=()
    while IFS= read -r file; do
      stackfiles+=("$dir/$file")
    done < <(jq -r '(.artifacts // {})[] | select(.type == "cdk:asset-manifest") | .properties.file' "$dir/manifest.json")
    jq -se '.[0] as $m | [.[1:][] | (.files // {})[]] as $files | [($m.artifacts // {})[] | select(.type == "aws:cloudformation:stack")] | all(.[]; (.displayName | type == "string") and (.properties.stackName | type == "string" and test("\\A[A-Za-z][A-Za-z0-9-]{0,127}\\z")) and .properties.stackName == "Hearth-" + (.displayName | gsub("/"; "-")) and (.properties.stackTemplateAssetObjectUrl | type == "string" and test("\\As3://[^/]+/[^/]+\\z")) and (.properties.templateFile as $t | (.properties.stackTemplateAssetObjectUrl | capture("\\As3://(?<b>[^/]+)/(?<k>[^/]+)\\z")) as $u | [$files[] | select(any((.destinations // {})[]; .bucketName == $u.b and .objectKey == $u.k))] | length > 0 and all(.[]; .source == {path: $t, packaging: "file"})))' "$dir/manifest.json" "$\{stackfiles[@]}" >/dev/null 2>&1 ||
      asset_refuse "a stack's name isn't Hearth- and its stage's id, or the template CloudFormation is handed isn't its own templateFile"
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
    status=$(jq -er '.[0] | select(type == "string" and test("^[A-Z_]{1,64}$"))' <<<"$out") || aws_refuse "the Services stack's status can't be read"
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
# history.ts prod-gate (C11-D52, C11-D58): a deploy's commit descends from prod's newest release, which
# is at or after the expansion of every floor at this commit whose migration it lacks, and its image is
# the one non-prod deployed in this run; a rollback's target is still recorded, on main, at
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

// The build's runs (C11-D50, C11-D79, DPW-13): the containerd image store, the PostgreSQL client, the
// install, the local stack and database, the image, its check and its migrate step. The build holds no
// secret and runs repository code by design, but its runs make the image every deploy pushes, so none has
// a line of its own: a word bash joins from quoted or expanded parts (a script's name, env) would pass a
// rule that reads the text.
export const CONTAINERD_RUN = sh`set -euo pipefail
# The containerd image store, which the OCI export and a docker load of that same archive need and
# the runner's Docker doesn't use by default (C11-D50).
sudo mkdir -p /etc/docker
CURRENT='{}'
if sudo test -s /etc/docker/daemon.json; then CURRENT=$(sudo cat /etc/docker/daemon.json); fi
jq '.features["containerd-snapshotter"] = true' <<<"$CURRENT" | sudo tee /etc/docker/daemon.json >/dev/null
sudo systemctl restart docker
if ! docker info --format '{{json .DriverStatus}}' | jq -e 'any(.[]; .[0] == "driver-type" and .[1] == "io.containerd.snapshotter.v1")' >/dev/null; then
  echo "build: Docker isn't on the containerd image store"
  exit 1
fi`
export const PSQL_RUN = sh`set -euo pipefail
# db:reset needs psql, which the Arm runner image leaves out.
sudo apt-get update
sudo apt-get install -y --no-install-recommends postgresql-client`
export const INSTALL_RUN = 'npm ci --ignore-scripts'
export const IMAGE_RUN = sh`set -euo pipefail
# The image (C11-D50): built once for ARM, with no provenance or SBOM manifest, exported as an OCI
# archive named hearth-server:build. Its digest is the build's metadata, which must be the archive's
# one manifest; the very archive this job checks is the one the deploy jobs push.
docker buildx build --platform linux/arm64 --provenance=false --sbom=false -f apps/server/Dockerfile --metadata-file "$RUNNER_TEMP/meta.json" --output "type=oci,dest=$RUNNER_TEMP/image.tar,name=hearth-server:build" .
DIGEST=$(jq -er '."containerimage.digest" | select(test("^sha256:[0-9a-f]{64}$"))' "$RUNNER_TEMP/meta.json")
INDEX=$(tar -xOf "$RUNNER_TEMP/image.tar" index.json | jq -er '.manifests | select(length == 1) | .[0].digest')
if [ "$DIGEST" != "$INDEX" ]; then
  echo "build: the build's digest isn't the archive's one manifest"
  exit 1
fi
echo "digest=$DIGEST" >>"$GITHUB_OUTPUT"
echo "build: hearth-server@$DIGEST" >>"$GITHUB_STEP_SUMMARY"`
export const LOAD_RUN = sh`set -euo pipefail
# The archive, loaded, checked as CI checks its image: every role starts, answers and stops cleanly.
docker load -i "$RUNNER_TEMP/image.tar"
IMAGE=hearth-server:build scripts/check-server.sh`
export const MIGRATE_IMAGE_RUN = sh`set -euo pipefail
# The image's pre-deploy migrate step, as ci.yml runs it (T3): the image must hold every migration. The
# database URL is built from parts, so no line has an email's shape (IG-01).
HOST=127.0.0.1
docker run --rm --read-only --network host -e "MIGRATION_DATABASE_URL=postgres://postgres:postgres@$\{HOST}:5432/hearth" hearth-server:build node src/db/migrate.ts`

// The synth's runs (C11-D51, C11-D76, DPW-13): the release's synth, by mode, and each previous release's,
// each in its own checkout's folder (its working-directory, pinned with its run); the asset checks before
// each upload are DPW-14's assetCheckRun. Synth holds no secret and runs repository code by design, but
// its runs choose the commit, the release and the context the assembly is synthesised with, so none has a
// line of its own: npm's and the CLI's own aliases (run-script, synthesize, --context) or a quoted word
// would pass a rule that reads the text. Synth's own asset check holds only against these texts, never
// against the repository code its install and synth run (which could rewrite the assembly after it):
// each credentialed job's own ASSET_CHECK, pinned in that job, is the check a deploy rests on.
export const SYNTH_RUN = sh`set -euo pipefail
# The pipeline's synth (C11-D51; TECH-SPEC T24 item 10): the workload entry with the release's commit
# and digest, the build's for a deploy and the record's otherwise, a drill-break's context or a
# restore up's restoreActive, written straight into its own folder. cdk-nag isn't registered here:
# IAC-15 runs it on every PR over every build the pipeline deploys (T24 item 28).
DIGEST=$GATE_DIGEST
if [ "$BUILD" = true ]; then DIGEST=$BUILD_DIGEST; fi
${SYNTH_LINES.slice(0, 4).join('\n')}
echo "release=$COMMIT:$DIGEST" >>"$GITHUB_OUTPUT"`
export const previousSynthRun = (stage: 'nonprod' | 'prod') => sh`set -euo pipefail
# The release ${stage} runs now, for its automatic rollback, synthesised only after the run's own
# assembly is checked and uploaded, so no other commit's code runs while that one can still change.
npm run synth -w @hearth/infra -- -c release="$COMMIT:$DIGEST" -o "$RUNNER_TEMP/assembly-previous-${stage}"`

// --- The runs the guard pins whole (DPW-08, DPW-09, DPW-10, DPW-13) --------------------------------------

// Each run whose exit or outputs a gate, an approval, a smoke, a rollback or a record rests on, pinned whole
// as the workflow pastes it, so no line of its own can end it early, write an output, a file or a record of
// its own, or hand one of its lines another input: the gate's reads of the records and main's ruleset (and
// its plan, PLAN_STEP), prod-gate's read of prod's records, the deploy jobs' release, push, migrate and its
// record, services_started and read-back, the rollback jobs' releases, read-back and rolled, prod-plan's
// diff, the smokes and the record jobs; every other run of a job that holds the deploy role; and the gate's
// and prod-gate's other reads, and every run of build and synth, so no run of deploy.yml has a line of its
// own (PINNED_RUNS). The rest of each such run's rules still read it.

// The gate's read of the release, migration and restore records (C11-D58, C11-D61, DPW-09), which
// history.ts plan reads as data.
export const GATE_RECORDS = sh`set -euo pipefail
# The records (C11-D58, C11-D61), one page each, the newest 100 (ECR keeps 50 images, so an older
# release couldn't start): history.ts reads them as data, ignores any whose payload fails validation,
# and orders them itself.
mkdir -p "$RUNNER_TEMP/records"
for environment in nonprod prod; do
  gh api "repos/$REPO/deployments?environment=$environment&task=hearth-release&per_page=100" >"$RUNNER_TEMP/records/release-$environment.json"
  gh api "repos/$REPO/deployments?environment=$environment&task=hearth-migrated&per_page=100" >"$RUNNER_TEMP/records/migrated-$environment.json"
done
gh api "repos/$REPO/deployments?environment=prod&task=hearth-restore&per_page=100" >"$RUNNER_TEMP/records/restore-prod.json"`

// The gate's read of main's ruleset (C11-D49, DPW-09).
export const RULESET_CHECK = sh`set -euo pipefail
# main's ruleset is live (C11-D49): a deploy's tree argument rests on it, so the gate refuses unless
# main's rules are deletion, non_fast_forward, pull_request and required_status_checks naming check
# and migrations.
RULES=$(gh api "repos/$REPO/rules/branches/main")
if ! jq -e '
  [.[].type] as $types
  | [.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[]?.context] as $checks
  | all("deletion", "non_fast_forward", "pull_request", "required_status_checks"; . as $type | any($types[]; . == $type))
    and any($checks[]; . == "check") and any($checks[]; . == "migrations")' <<<"$RULES" >/dev/null; then
  echo "gate: main's ruleset isn't live"
  exit 1
fi`

// The gate's check that the GitHub environments are live as .github/environments writes them (C11-D56,
// DPW-09), before it plans.
export const ENVIRONMENTS_CHECK = 'scripts/protect-environments.sh check "$REPO"'

// prod-gate's read of prod's release records (C11-D52, DPW-08), which history.ts prod-gate reads as data.
export const PROD_RECORDS = sh`set -euo pipefail
mkdir -p "$RUNNER_TEMP/records"
gh api "repos/$REPO/deployments?environment=prod&task=hearth-release&per_page=100" >"$RUNNER_TEMP/records/release-prod.json"`

// The release a deploy job and prod-plan deploy (C11-D50, C11-D52, DPW-13): the commit the push tags and
// every later check reads, and its digest.
export const RELEASE_STEP = sh`set -euo pipefail
# The release this job deploys: the run's commit with the build's digest for a deploy, the gate's
# commit and digest (a rollback's target, or the release a drill or a restore runs) otherwise.
DIGEST=$GATE_DIGEST
if [ "$BUILD" = true ]; then DIGEST=$BUILD_DIGEST; fi
if ! [[ "$COMMIT:$DIGEST" =~ ^[0-9a-f]{40}:sha256:[0-9a-f]{64}$ ]]; then
  echo 'release: the release is not <commit>:<digest>'
  exit 1
fi
{
  echo "commit=$COMMIT"
  echo "digest=$DIGEST"
  echo "release=$COMMIT:$DIGEST"
} >>"$GITHUB_OUTPUT"`

// A rollback job's two releases (C11-D52, C11-D58, DPW-08): this run's, which its AWS_CHECK judges, and
// the previous one it deploys and its smoke judges.
export const PREVIOUS_STEP = sh`set -euo pipefail
# This run's release, which the deploy job deployed (the build's digest for a deploy, the gate's for a
# drill-smoke), and the previous release it goes back to.
DIGEST=$GATE_DIGEST
if [ "$MODE" = deploy ]; then DIGEST=$BUILD_DIGEST; fi
for RELEASE in "$COMMIT:$DIGEST" "$PREVIOUS_COMMIT:$PREVIOUS_DIGEST"; do
  if ! [[ "$RELEASE" =~ ^[0-9a-f]{40}:sha256:[0-9a-f]{64}$ ]]; then
    echo 'release: a release is not <commit>:<digest>'
    exit 1
  fi
done
{
  echo "release=$COMMIT:$DIGEST"
  echo "previous=$PREVIOUS_COMMIT:$PREVIOUS_DIGEST"
} >>"$GITHUB_OUTPUT"`

// The push's registry (C11-D50, DPW-07, DPW-13): the environment's own, which the login and the copy name.
export const REGISTRY_LINE = 'REGISTRY="$ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com"'
// The push (C11-D50, C11-D79, DPW-13): the login, the copy to this run's own tag, and the digest and tag
// checks, prod's against the digest non-prod deployed too.
export const pushRun = (stage: Stage) => sh`${PREAMBLE}
# The push (C11-D50, C11-D79): the build's own archive, to a tag of its own, sha-<commit>-<run>-<attempt>,
# so no push collides, keeping its digest; the pushed digest must be the build's, and ECR must name it
# by the new tag. It comes before anything moves, and AWS_CHECK refused this job if any image's commit
# isn't this run's or an ancestor of it, so the images' commits stay on one line of main's history and
# every commit that has migrated the database is one of them; ECR's push times are never the order.
${REGISTRY_LINE}
${SKOPEO_LOGIN}
${SKOPEO_COPY}
PUSHED=$(cat "$RUNNER_TEMP/pushed")
if [ "$PUSHED" != "$DIGEST" ]${stage === 'prod' ? ' || [ "$PUSHED" != "$NONPROD_DIGEST" ]' : ''}; then
  echo "push: the pushed digest isn't the one the build made" | mask
  exit 1
fi
TAGS=$(get aws ecr describe-images --repository-name hearth-server --image-ids "imageDigest=$DIGEST" --query 'imageDetails[0].imageTags' --output json)
if ! jq -e --arg tag "sha-$COMMIT-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" 'index($tag) != null' <<<"$TAGS" >/dev/null; then
  echo "push: ECR doesn't name the image by this run's tag" | mask
  exit 1
fi
echo "digest=$PUSHED" >>"$GITHUB_OUTPUT"
echo "push: hearth-server@$PUSHED, tagged for this run" | mask | tee -a "$GITHUB_STEP_SUMMARY"`

// migrate's record (C11-D58, DPW-13): after migrate's own end, the commit the database was migrated by.
export const migrationRecord = (
  stage: Stage,
) => sh`# The migration record (C11-D58; TECH-SPEC T24 item 23): the commit the database was migrated by,
# written as soon as migrate exits 0, while this job holds its group.
BODY=$(jq -n --arg environment "${stage}" --arg commit "$COMMIT" '{ref: "main", task: "hearth-migrated", environment: $environment, auto_merge: false, required_contexts: [], transient_environment: false, production_environment: ($environment == "prod"), payload: {schema: 1, commit: $commit}}')
ID=$(gh api -X POST "repos/$REPO/deployments" --input - --jq .id <<<"$BODY")
if ! [[ "$ID" =~ ^[0-9]+$ ]]; then
  echo 'migrate: GitHub made no migration record' | mask
  exit 1
fi
jq -n --arg url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" '{state: "success", auto_inactive: false, log_url: $url}' |
  gh api -X POST "repos/$REPO/deployments/$ID/statuses" --input - --silent
echo "migrate: recorded $COMMIT as the commit ${stage}'s database was migrated by" | mask | tee -a "$GITHUB_STEP_SUMMARY"`

// The step before Services change (C11-D52, DPW-08): from here a failure starts the rollback job.
export const MARK_RUN = sh`${PREAMBLE}
# From here a failure of this job starts its rollback job, as a failed smoke does.
echo "services_started=true" >>"$GITHUB_OUTPUT"`

// A rollback job's last step (C11-D52, DPW-08): the rollback ran, for the second smoke.
export const DONE_RUN = sh`${PREAMBLE}
echo "rolled=true" >>"$GITHUB_OUTPUT"`

// The read-back (C11-D54, DPW-07, DPW-08): what runs, by health states, counts, digests and settings alone,
// for the smoke to judge.
export const READ_BACK = sh`# The read-back (C11-D54, C11-D61): what runs, for the smoke to judge as SMK-06 and SMK-07 read it,
# states, counts, AZ names, settings and digests, never an ARN or an address: each service's counts,
# deployments and running tasks (AZ, state, health, image digest); where there is a load balancer,
# each target group's target states, deregistration delay, stickiness and health path, and the load
# balancer's idle timeout. A service that doesn't exist (a restore stage taken down) is left out. Its
# outputs: the read-back, each service's PRIMARY definition as family:revision, and the release the
# Services stack now says it runs.
SERVICE_LIST='[]'
FAMILIES='{}'
for ROLE in api realtime worker; do
  if ! SERVICE=$(get aws ecs describe-services --cluster "hearth-$STAGE" --services "hearth-$STAGE-$ROLE" --query 'services[?status!=\`INACTIVE\`] | [0].{desired: desiredCount, running: runningCount, deployments: deployments[].{status: status, rollout: rolloutState, desired: desiredCount, running: runningCount, failed: failedTasks}, family: deployments[?status==\`PRIMARY\`] | [0].taskDefinition}' --output json 2>&1); then
    case "$SERVICE" in
      *ClusterNotFoundException*) SERVICE=null ;;
      *)
        echo "read-back: hearth-$STAGE-$ROLE can't be read" | mask
        exit 1
        ;;
    esac
  fi
  [ "$SERVICE" != null ] || continue
  ARNS=$(get aws ecs list-tasks --cluster "hearth-$STAGE" --service-name "hearth-$STAGE-$ROLE" --desired-status RUNNING --query 'taskArns' --output json)
  mapfile -t TASK_ARNS < <(jq -r '.[]' <<<"$ARNS")
  TASKS='[]'
  if [ "$\{#TASK_ARNS[@]}" -gt 0 ]; then
    TASKS=$(get aws ecs describe-tasks --cluster "hearth-$STAGE" --tasks "$\{TASK_ARNS[@]}" --query "tasks[].{az: availabilityZone, last: lastStatus, health: healthStatus, digest: containers[?name=='server'] | [0].imageDigest}" --output json)
  fi
  FAMILY=$(jq -r '.family // ""' <<<"$SERVICE")
  FAMILIES=$(jq -c --arg role "$ROLE" --arg family "$\{FAMILY##*/}" '. + {($role): $family}' <<<"$FAMILIES")
  SERVICE_LIST=$(jq -c --arg role "$ROLE" --argjson service "$SERVICE" --argjson tasks "$TASKS" '. + [{role: $role, desired: $service.desired, running: $service.running, deployments: $service.deployments, tasks: $tasks}]' <<<"$SERVICE_LIST")
done
GROUP_LIST='[]'
LOAD_BALANCER=null
if [ "$STAGE" != restore ]; then
  TARGET_GROUPS=$(get aws elbv2 describe-target-groups --names "hearth-$STAGE-api" "hearth-$STAGE-realtime" --query 'TargetGroups[].{name: TargetGroupName, arn: TargetGroupArn, path: HealthCheckPath}' --output json)
  for ROLE in api realtime; do
    GROUP=$(jq -ec --arg name "hearth-$STAGE-$ROLE" 'first(.[] | select(.name == $name))' <<<"$TARGET_GROUPS")
    GROUP_ARN=$(jq -r '.arn' <<<"$GROUP")
    STATES=$(get aws elbv2 describe-target-health --target-group-arn "$GROUP_ARN" --query 'TargetHealthDescriptions[].TargetHealth.State' --output json)
    ATTRIBUTES=$(get aws elbv2 describe-target-group-attributes --target-group-arn "$GROUP_ARN" --query 'Attributes' --output json)
    GROUP_LIST=$(jq -c --arg role "$ROLE" --argjson group "$GROUP" --argjson states "$STATES" --argjson attributes "$ATTRIBUTES" '
      def attribute($key): first($attributes[] | select(.Key == $key) | .Value);
      . + [{
        role: $role,
        healthy: ($states | map(select(. == "healthy")) | length),
        other: ($states | map(select(. != "healthy")) | length),
        deregistration: (attribute("deregistration_delay.timeout_seconds") | tonumber),
        stickiness: (attribute("stickiness.enabled") == "true"),
        healthPath: $group.path
      }]' <<<"$GROUP_LIST")
  done
  BALANCER=$(get aws elbv2 describe-load-balancers --names "hearth-$STAGE" --query 'LoadBalancers[0].LoadBalancerArn' --output text)
  IDLE=$(get aws elbv2 describe-load-balancer-attributes --load-balancer-arn "$BALANCER" --query 'Attributes[?Key==\`idle_timeout.timeout_seconds\`].Value | [0]' --output text)
  LOAD_BALANCER=$(jq -nc --arg idle "$IDLE" '{idleTimeout: ($idle | tonumber)}')
fi
if ! STACK=$(get aws cloudformation describe-stacks --stack-name "Hearth-$STAGE-Services" --query 'Stacks[0].[StackStatus, Outputs[?OutputKey==\`Release\`].OutputValue | [0]]' --output json 2>&1); then
  case "$STACK" in
    *'does not exist'*) STACK=null ;;
    *)
      echo "read-back: Hearth-$STAGE-Services can't be read" | mask
      exit 1
      ;;
  esac
fi
# No Services stack, or for restore=down one a failed create left with no Release (ROLLBACK_COMPLETE or
# REVIEW_IN_PROGRESS, which down skips), runs the release this job was given; any other's Release is read.
if [ "$STACK" = null ] || { [ "$STAGE" = restore ] && [ "$RESTORE" = down ] &&
  jq -e '.[0] == "ROLLBACK_COMPLETE" or .[0] == "REVIEW_IN_PROGRESS"' <<<"$STACK" >/dev/null && jq -e '.[1] == null' <<<"$STACK" >/dev/null; }; then
  DEPLOYED=$RELEASE
else
  DEPLOYED=$(jq -r '.[1] // ""' <<<"$STACK")
fi
# The release goes out as a job output and into the summary, so it is held to its shape first (a value
# with anything else in it, or none, is refused).
if ! [[ "$DEPLOYED" =~ ^[0-9a-f]{40}:sha256:[0-9a-f]{64}$ ]]; then
  echo "read-back: Hearth-$STAGE-Services' Release isn't <commit>:<digest>" | mask
  exit 1
fi
PROBE=ran
if [ "$MODE" = drill-break ] || [ "$RESTORE" = down ]; then
  PROBE=skipped
  echo "probe: skipped (mode $MODE, restore $RESTORE): a drill-break leaves the tasks that ran before it, and a restore taken down runs none" | mask | tee -a "$GITHUB_STEP_SUMMARY"
fi
READBACK=$(jq -nc --arg stage "$STAGE" --arg release "$DEPLOYED" --arg probe "$PROBE" --argjson services "$SERVICE_LIST" --argjson groups "$GROUP_LIST" --argjson balancer "$LOAD_BALANCER" '{schema: 1, env: $stage, release: $release, probe: $probe, services: $services, targetGroups: $groups, loadBalancer: $balancer}')
if ! jq -e 'tostring | ascii_downcase | contains("arn:") | not' <<<"$READBACK" >/dev/null; then
  echo 'read-back: it would hold an ARN' | mask
  exit 1
fi
{
  echo "readback=$READBACK"
  echo "services=$FAMILIES"
  echo "deployed=$DEPLOYED"
} >>"$GITHUB_OUTPUT"
echo "read-back: Hearth-$STAGE-Services runs $DEPLOYED" | mask | tee -a "$GITHUB_STEP_SUMMARY"`

// prod-plan's diff (C11-D51, DPW-08): what the approver reads, into the log and the summary.
export const DIFF_RUN = sh`${PREAMBLE}
# The diff the approver reads (C11-D51): the assembly against prod's deployed templates, read with
# the plan role's own credentials (its lookup role is refused), for a deploy every prod stack and for
# a rollback its Tasks and Services; into the log, and into the summary cut at 900 KB, both through
# the filter. A diff that fails still shows the CLI's message in both, then fails the step.
ASSEMBLY="$RUNNER_TEMP/assembly"
DIFF="$RUNNER_TEMP/diff.txt"
STATUS=0
${CDK_FOLDER}
if [ "$MODE" = rollback ]; then
  {
    ${CDK_DIFF_ROLLBACK}
  } >"$DIFF" || STATUS=$?
else
  {
    ${CDK_DIFF_PROD}
  } >"$DIFF" || STATUS=$?
fi
cat "$DIFF"
{
  echo "### What prod's $MODE changes"
  echo '\`\`\`'
  head -c 921600 "$DIFF"
  echo '\`\`\`'
  if [ "$(wc -c <"$DIFF")" -gt 921600 ]; then echo "The diff is cut at 900 KB here; the job's log holds it whole."; fi
  if [ "$STATUS" != 0 ]; then echo "The diff failed (exit $STATUS), so this plan fails; the CLI's message is above."; fi
} | mask >>"$GITHUB_STEP_SUMMARY"
exit "$STATUS"`

// A smoke's run (C11-D54, DPW-08): SMOKE_ATTEMPT, the read-back to a file, then smoke.ts by its job's flags.
export const smokeRun = (job: 'smoke-nonprod' | 'smoke-prod' | 'resmoke-nonprod' | 'resmoke-prod') =>
  [
    'set -euo pipefail',
    SMOKE_ATTEMPT,
    {
      'smoke-nonprod': sh`printf '%s' "$READBACK" >"$RUNNER_TEMP/readback.json"
# drill-smoke inverts SMK-05, so this smoke fails and the rollback runs (C11-D59).
STAGE_FLAGS=(--env nonprod)
if [ "$MODE" = drill-smoke ]; then STAGE_FLAGS=(--env nonprod --invert SMK-05); fi
node infra/scripts/deploy/smoke.ts "$\{STAGE_FLAGS[@]}" --release "$RELEASE" --readback "$RUNNER_TEMP/readback.json" --profile-at "$PROFILE_AT"`,
      'smoke-prod': sh`printf '%s' "$READBACK" >"$RUNNER_TEMP/readback.json"
# A restore is judged as the restore stage, by SMK-06's services half alone.
STAGE_FLAGS=(--env prod)
if [ "$TARGET" = restore ]; then STAGE_FLAGS=(--env restore --restore "$RESTORE"); fi
node infra/scripts/deploy/smoke.ts "$\{STAGE_FLAGS[@]}" --release "$RELEASE" --readback "$RUNNER_TEMP/readback.json" --profile-at "$PROFILE_AT"`,
      'resmoke-nonprod': sh`printf '%s' "$READBACK" >"$RUNNER_TEMP/readback.json"
STAGE_FLAGS=(--env nonprod)
node infra/scripts/deploy/smoke.ts "$\{STAGE_FLAGS[@]}" --release "$RELEASE" --readback "$RUNNER_TEMP/readback.json" --profile-at "$PROFILE_AT"`,
      'resmoke-prod': sh`printf '%s' "$READBACK" >"$RUNNER_TEMP/readback.json"
STAGE_FLAGS=(--env prod)
node infra/scripts/deploy/smoke.ts "$\{STAGE_FLAGS[@]}" --release "$RELEASE" --readback "$RUNNER_TEMP/readback.json" --profile-at "$PROFILE_AT"`,
    }[job],
  ].join('\n')

// A record job's run (C11-D58, C11-D61, DPW-13): its two functions, the newest migration record read
// afresh, then a release record, or in record-prod a restore's record, and the job red unless its own
// smoke passed.
const RECORD_HEAD = sh`set -euo pipefail
# The release record (C11-D58, C11-D61; TECH-SPEC T24 items 22 and 23), a GitHub deployment of task
# hearth-release: written only for a release that passed its smoke (a deploy, or a rollback a person
# dispatched), or for the release the pipeline rolled back to once its second smoke passed. Each body
# is built whole by jq, its payload an object, then given its success status, and goes into this
# job's summary; migratedCommit is the newest migration record's commit, read afresh. The job fails
# whenever the release's own smoke didn't pass, so the run ends red whatever the rollback did.
URL="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
record() {
  local body id
  body=$(jq -n --arg environment "$ENVIRONMENT" --arg task "$1" --argjson payload "$2" '{ref: "main", task: $task, environment: $environment, auto_merge: false, required_contexts: [], transient_environment: false, production_environment: ($environment == "prod"), payload: $payload}')
  id=$(gh api -X POST "repos/$REPO/deployments" --input - --jq .id <<<"$body")
  if ! [[ "$id" =~ ^[0-9]+$ ]]; then
    echo 'record: GitHub made no deployment'
    exit 1
  fi
  jq -n --arg url "$URL" '{state: "success", auto_inactive: false, log_url: $url}' |
    gh api -X POST "repos/$REPO/deployments/$id/statuses" --input - --silent
  {
    echo "### The $1 record in $ENVIRONMENT (deployment $id)"
    echo '\`\`\`json'
    jq . <<<"$2"
    echo '\`\`\`'
  } >>"$GITHUB_STEP_SUMMARY"
}
release_payload() {
  if ! [[ "$2:$3" =~ ^[0-9a-f]{40}:sha256:[0-9a-f]{64}$ ]] ||
    ! jq -e --arg environment "$ENVIRONMENT" 'type == "object" and keys == ["api", "realtime", "worker"] and all(to_entries[]; .key as $role | .value | type == "string" and test("\\Ahearth-" + $environment + "-" + $role + ":[1-9][0-9]{0,5}\\z"))' <<<"$4" >/dev/null; then
    echo 'record: the release or its services are not of their shapes' >&2
    exit 1
  fi
  jq -n --arg kind "$1" --arg commit "$2" --arg digest "$3" --arg migrated "$MIGRATED" --argjson services "$4" '{schema: 1, kind: $kind, commit: $commit, digest: $digest, migratedCommit: (if $migrated == "" then null else $migrated end), services: $services}'
}
MIGRATED=$(gh api "repos/$REPO/deployments?environment=$ENVIRONMENT&task=hearth-migrated&per_page=1" --jq '.[0].payload | if type == "object" and (.commit | type == "string" and test("\\A[0-9a-f]{40}\\z")) then .commit else "" end')`
const RECORD_RELEASE = sh`if [ "$SMOKE" = success ] && [ "$MODE" != drill-smoke ]; then
  KIND=deploy
  if [ "$MODE" = rollback ]; then KIND=rollback; fi
  PAYLOAD=$(release_payload "$KIND" "$COMMIT" "$DIGEST" "$SERVICES")
  record hearth-release "$PAYLOAD"
elif [ "$RESMOKE" = success ]; then
  PAYLOAD=$(release_payload pipeline-rollback "$PREVIOUS_COMMIT" "$PREVIOUS_DIGEST" "$ROLLBACK_SERVICES")
  record hearth-release "$PAYLOAD"
fi`
const RECORD_RESTORE = sh`# A restore's record is its own task, hearth-restore, so prod's release history never sees it.
if [ "$TARGET" = restore ]; then
  if [ "$SMOKE" = success ]; then
    if ! [[ "$COMMIT:$DIGEST" =~ ^[0-9a-f]{40}:sha256:[0-9a-f]{64}$ && "$RESTORE" =~ ^(up|down)$ ]]; then
      echo 'record: the restore is not of its shape'
      exit 1
    fi
    PAYLOAD=$(jq -n --arg kind "$RESTORE" --arg commit "$COMMIT" --arg digest "$DIGEST" '{schema: 1, kind: $kind, commit: $commit, digest: $digest}')
    record hearth-restore "$PAYLOAD"
  fi
else`
const RECORD_TAIL = sh`if [ "$SMOKE" != success ] || [ "$MODE" = drill-smoke ]; then
  echo "record: the release's own smoke didn't pass, so the run ends red"
  exit 1
fi`
export const recordRun = (stage: Stage) =>
  stage === 'prod'
    ? [
        RECORD_HEAD,
        RECORD_RESTORE,
        ...RECORD_RELEASE.split('\n').map(line => (line === '' ? line : `  ${line}`)),
        'fi',
        RECORD_TAIL,
      ].join('\n')
    : [RECORD_HEAD, RECORD_RELEASE, RECORD_TAIL].join('\n')

// Every other run of the five jobs that hold the deploy role, or the OIDC request token that gets it
// (C11-D48, C11-D61, C11-D76, DPW-10), pinned whole too, so no run there has a line of its own to read,
// split, print or send what the job holds (the request token, the account id, an AWS answer) or to
// hand a pinned line another input: the asset check on each folder its job downloaded, CLI_FETCH and
// CLI_CHECK, the account id's mask, AWS_CHECK with its job's call, each CLI step and the probe; the fast
// re-checks are canonical texts standing whole.
export const MASK_RUN = 'echo "::add-mask::$ACCOUNT_ID"'
export const assetCheckRun = (folders: readonly string[], variable: string) =>
  [
    'set -euo pipefail',
    ASSET_CHECK,
    ...folders.flatMap(folder => [
      `check_assembly "$RUNNER_TEMP/${folder}"`,
      `check_release_in "$RUNNER_TEMP/${folder}" "$${variable}"`,
    ]),
  ].join('\n')
// A step that runs one CLI line: the preamble, what it is, its folder, CDK_FOLDER and the line.
const cliRun = (what: string, assembly: 'assembly' | 'assembly-previous', line: string) =>
  [PREAMBLE, what, `ASSEMBLY="$RUNNER_TEMP/${assembly}"`, CDK_FOLDER, line].join('\n')
export const FORWARD_RUN = cliRun(
  sh`# A forward deploy's first call (C11-D52; TECH-SPEC T24 item 11): the stacks the services stand on,
# by their stage ids, each change set from the downloaded assembly alone.`,
  'assembly',
  CDK_DEPLOY_FORWARD,
)
export const SERVICES_RUN = cliRun(
  sh`# Services (C11-D52; TECH-SPEC T24 item 11): the release's services alone, after the stacks they stand
# on (and after migrate, from C0.12).`,
  'assembly',
  CDK_DEPLOY_SERVICES,
)
export const MANUAL_ROLLBACK_RUN = cliRun(
  sh`# A rollback a person dispatched (C11-D52, C11-D58): the target's Tasks and Services alone, over the
# Platform and Data that run; never a push and never migrate.`,
  'assembly',
  CDK_DEPLOY_ROLLBACK,
)
export const ROLLBACK_RUN = cliRun(
  sh`# The pipeline's rollback (C11-D52, C11-D58): the previous release's Tasks and Services, from its own
# assembly; never a push and never migrate.`,
  'assembly-previous',
  CDK_DEPLOY_ROLLBACK,
)
export const DOWN_RUN = cliRun(
  sh`# restore=down (C11-D45; TECH-SPEC T24 item 18): Services, then Data, then Platform, one call each, since
# one call would order them by dependency; each only for a restore stack that exists and has settled.
# One a failed create left (ROLLBACK_COMPLETE or REVIEW_IN_PROGRESS, nothing billed) or that doesn't
# exist is skipped, and one still moving refuses, so down works after a failed or partial up and
# never creates a stack. One whose failed create couldn't roll back (ROLLBACK_FAILED, which may hold
# billed resources, and which the CLI would delete and create again) is skipped too, the later stacks
# are still taken down, and the step then fails, since that stack waits for tier 2.`,
  'assembly',
  RESTORE_DOWN,
)
export const DRILL_RUN = sh`${PREAMBLE}
# drill-break (C11-D59): a Services deploy whose realtime can't start must fail, the circuit breaker
# and CloudFormation must put realtime back on the revision it ran, one deployment, PRIMARY and
# COMPLETED, and leave the stack UPDATE_ROLLBACK_COMPLETE; the smoke then passes on what runs. A14
# emails, as expected. No probe and no record: nothing changed.
BEFORE=$(get aws ecs describe-services --cluster "hearth-$STAGE" --services "hearth-$STAGE-realtime" --query 'services[0].deployments[?status==\`PRIMARY\`] | [0].taskDefinition' --output text)
BEFORE=$\{BEFORE##*/}
if ! [[ "$BEFORE" =~ ^hearth-nonprod-realtime:[1-9][0-9]{0,5}$ ]]; then
  echo "drill-break: realtime's revision can't be read" | mask
  exit 1
fi
ASSEMBLY="$RUNNER_TEMP/assembly"
${CDK_FOLDER}
${CDK_DEPLOY_DRILL}
  echo 'drill-break: the broken Services deploy succeeded, so the drill proved nothing' | mask
  exit 1
fi
AFTER=$(get aws ecs describe-services --cluster "hearth-$STAGE" --services "hearth-$STAGE-realtime" --query 'services[0].deployments[].{status: status, rollout: rolloutState, definition: taskDefinition}' --output json)
if ! jq -e --arg before "$BEFORE" 'length == 1 and .[0].status == "PRIMARY" and .[0].rollout == "COMPLETED" and (.[0].definition | endswith("/" + $before))' <<<"$AFTER" >/dev/null; then
  echo "drill-break: realtime isn't back on the revision it ran" | mask
  exit 1
fi
STACK=$(get aws cloudformation describe-stacks --stack-name "Hearth-$STAGE-Services" --query 'Stacks[0].StackStatus' --output text)
if [ "$STACK" != UPDATE_ROLLBACK_COMPLETE ]; then
  echo "drill-break: the Services stack is $STACK, not UPDATE_ROLLBACK_COMPLETE" | mask
  exit 1
fi
echo "drill-break: the broken deploy failed and realtime runs $BEFORE again" | mask | tee -a "$GITHUB_STEP_SUMMARY"`

// Each pinned run by its job and its step's name, with its step's if: (none, unless named), since an if:
// that skips the step passes its job as surely as an early exit 0 would, its working-directory (cwd, synth's
// alone), and the rule that holds it whole: the gate's records, ruleset, environments and plan under DPW-09;
// the gate's read of its pull request's checks, prod-gate's records, wait for main's CI and call, the
// smokes, services_started, the read-back, the rollback jobs' releases and rolled, and prod-plan's diff
// under DPW-08; the build's and the synth's runs, the release, the push, migrate with its record and the
// record jobs under DPW-13; every other run of a job that holds credentials under DPW-10. No run of
// deploy.yml is outside it (DPW-13 refuses one in a job that holds no credentials, DPW-10 in one that does).
type Pinned = Readonly<
  Record<string, { run: string; rule: 'DPW-08' | 'DPW-09' | 'DPW-10' | 'DPW-13'; if?: string; cwd?: string }>
>
const deployRuns = (stage: Stage): Pinned => ({
  'The release this job deploys': { run: RELEASE_STEP, rule: 'DPW-13' },
  'Push the image': { run: pushRun(stage), rule: 'DPW-13', if: PUSH_IF[stage] },
  Migrate: {
    run: [PREAMBLE, TASKS_OUTPUTS, ONE_OFF, migrateRun(stage), migrationRecord(stage)].join('\n'),
    rule: 'DPW-13',
    if: PUSH_IF[stage],
  },
  'Services are about to change': {
    run: MARK_RUN,
    rule: 'DPW-08',
    if: expr(stage === 'prod' ? "needs.gate.outputs.target == 'prod'" : "needs.gate.outputs.mode != 'drill-break'"),
  },
  'Read back what runs': { run: [PREAMBLE, READ_BACK].join('\n'), rule: 'DPW-08' },
})
const rollbackRuns = (): Pinned => ({
  "This run's release and the previous one": { run: PREVIOUS_STEP, rule: 'DPW-08' },
  'Read back what runs': { run: [PREAMBLE, READ_BACK].join('\n'), rule: 'DPW-08', if: GO_IF },
  'Rolled back': { run: DONE_RUN, rule: 'DPW-08', if: GO_IF },
})
// A credentialed job's other runs (DPW-10): before the credentials action its asset check, the fast
// re-check (nonprod and prod), CLI_FETCH, CLI_CHECK and the mask; after them AWS_CHECK with its job's
// call, its CLI steps and its probe, each under its own if:.
const checksBefore = (id: string, recheck?: string): Pinned => ({
  ...(DEPLOY_JOBS[id]?.rollback === true
    ? { 'Check the previous assembly': { run: assetCheckRun(['assembly-previous'], 'PREVIOUS'), rule: 'DPW-10' } }
    : { 'Check the assembly': { run: assetCheckRun(['assembly'], 'RELEASE'), rule: 'DPW-10' } }),
  ...(recheck === undefined ? {} : { 'The fast re-check': { run: recheck, rule: 'DPW-10' } }),
  'The pinned CDK CLI': { run: CLI_FETCH, rule: 'DPW-10' },
  "The CLI is the registry's": { run: CLI_CHECK, rule: 'DPW-10' },
  'Mask the account id': { run: MASK_RUN, rule: 'DPW-10' },
})
const whatRuns = (id: string): Pinned => ({
  'What runs': { run: [PREAMBLE, AWS_CHECK, AWS_CHECK_CALLS[id] ?? ''].join('\n'), rule: 'DPW-10' },
})
const credentialedRuns = (id: 'nonprod' | 'prod' | 'prod-plan' | 'rollback-nonprod' | 'rollback-prod'): Pinned => {
  const ifOf = (line: string) => CLI_STEP_IF[id]?.[line]
  const probe = (stage: Stage, job: 'deploy' | 'rollback'): Pinned => ({
    Probe: { run: probeRun(stage, job), rule: 'DPW-10', if: PROBE_IF[id] },
  })
  switch (id) {
    case 'prod-plan':
      return checksBefore(id)
    case 'nonprod':
    case 'prod':
      return {
        ...checksBefore(id, id === 'prod' ? FAST_RECHECK_PROD : FAST_RECHECK_NONPROD),
        ...whatRuns(id),
        'Deploy Platform, Data and Tasks': { run: FORWARD_RUN, rule: 'DPW-10', if: ifOf(CDK_DEPLOY_FORWARD) },
        'Deploy Services': { run: SERVICES_RUN, rule: 'DPW-10', if: ifOf(CDK_DEPLOY_SERVICES) },
        'Roll back to the target': { run: MANUAL_ROLLBACK_RUN, rule: 'DPW-10', if: ifOf(CDK_DEPLOY_ROLLBACK) },
        ...(id === 'prod'
          ? { 'Take the restore stage down': { run: DOWN_RUN, rule: 'DPW-10', if: ifOf(CDK_DEPLOY_DOWN) } }
          : { 'drill-break': { run: DRILL_RUN, rule: 'DPW-10', if: ifOf(CDK_DEPLOY_DRILL) } }),
        ...probe(id, 'deploy'),
      }
    default:
      return {
        ...checksBefore(id),
        ...whatRuns(id),
        'Roll back Tasks and Services': { run: ROLLBACK_RUN, rule: 'DPW-10', if: ifOf(CDK_DEPLOY_ROLLBACK) },
        ...probe(id === 'rollback-prod' ? 'prod' : 'nonprod', 'rollback'),
      }
  }
}
// The build's runs and the synth's, each synth step's in its own checkout's folder (its working-directory,
// pinned with it), under DPW-13.
const buildRuns = (): Pinned => ({
  "Docker's containerd image store": { run: CONTAINERD_RUN, rule: 'DPW-13' },
  'The PostgreSQL client': { run: PSQL_RUN, rule: 'DPW-13' },
  Install: { run: INSTALL_RUN, rule: 'DPW-13' },
  'The local stack': { run: 'docker compose up -d --wait', rule: 'DPW-13' },
  'The local database': { run: 'npm run db:reset', rule: 'DPW-13' },
  'Build the image': { run: IMAGE_RUN, rule: 'DPW-13' },
  'Check the image': { run: LOAD_RUN, rule: 'DPW-13' },
  "The image's migrate step": { run: MIGRATE_IMAGE_RUN, rule: 'DPW-13' },
})
const synthRuns = (): Pinned => {
  const previous = (stage: 'nonprod' | 'prod'): Pinned => {
    const condition = expr(`needs.gate.outputs.previous_${stage}_commit != ''`)
    const cwd = `previous-${stage}`
    return {
      [`Install ${stage}'s previous release`]: { run: INSTALL_RUN, rule: 'DPW-13', if: condition, cwd },
      [`Synthesise ${stage}'s previous release`]: {
        run: previousSynthRun(stage),
        rule: 'DPW-13',
        if: condition,
        cwd,
      },
      [`Check ${stage}'s previous assembly`]: {
        run: assetCheckRun([`assembly-previous-${stage}`], 'RELEASE'),
        rule: 'DPW-13',
        if: condition,
      },
    }
  }
  return {
    'Install the release': { run: INSTALL_RUN, rule: 'DPW-13', cwd: 'release' },
    'Synthesise the release': { run: SYNTH_RUN, rule: 'DPW-13', cwd: 'release' },
    "Check the release's assembly": { run: assetCheckRun(['assembly'], 'RELEASE'), rule: 'DPW-13' },
    ...previous('nonprod'),
    ...previous('prod'),
  }
}
export const PINNED_RUNS = (): Readonly<Record<string, Pinned>> => ({
  gate: {
    'The release, migration and restore records': { run: GATE_RECORDS, rule: 'DPW-09' },
    'The pull request that made this commit, and its checks': { run: PULL_CHECKS, rule: 'DPW-08' },
    "main's ruleset is live": { run: RULESET_CHECK, rule: 'DPW-09' },
    'The environments are live as written': { run: ENVIRONMENTS_CHECK, rule: 'DPW-09' },
    Plan: { run: PLAN_STEP, rule: 'DPW-09' },
  },
  build: buildRuns(),
  synth: synthRuns(),
  'prod-gate': {
    "Prod's release records": { run: PROD_RECORDS, rule: 'DPW-08' },
    "main's own CI": {
      run: MAIN_CI,
      rule: 'DPW-08',
      if: expr("needs.gate.outputs.mode == 'deploy' && needs.gate.outputs.target == 'prod'"),
    },
    'The prod gate': { run: PROD_GATE_CALL, rule: 'DPW-08' },
  },
  nonprod: { ...deployRuns('nonprod'), ...credentialedRuns('nonprod') },
  prod: { ...deployRuns('prod'), ...credentialedRuns('prod') },
  'prod-plan': {
    'The release this job deploys': { run: RELEASE_STEP, rule: 'DPW-13' },
    Diff: { run: DIFF_RUN, rule: 'DPW-08' },
    ...credentialedRuns('prod-plan'),
  },
  'rollback-nonprod': { ...rollbackRuns(), ...credentialedRuns('rollback-nonprod') },
  'rollback-prod': { ...rollbackRuns(), ...credentialedRuns('rollback-prod') },
  'smoke-nonprod': { Smoke: { run: smokeRun('smoke-nonprod'), rule: 'DPW-08' } },
  'smoke-prod': { Smoke: { run: smokeRun('smoke-prod'), rule: 'DPW-08' } },
  'resmoke-nonprod': { Smoke: { run: smokeRun('resmoke-nonprod'), rule: 'DPW-08' } },
  'resmoke-prod': { Smoke: { run: smokeRun('resmoke-prod'), rule: 'DPW-08' } },
  'record-nonprod': { 'Write the record': { run: recordRun('nonprod'), rule: 'DPW-13' } },
  'record-prod': { 'Write the record': { run: recordRun('prod'), rule: 'DPW-13' } },
})

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

// The steps PINNED_RUNS holds under a rule whose run or if: isn't the one it names, whole, or that its job
// holds other than once, each as a finding's place: its job and its step.
function unpinnedRuns(jobs: ReadonlyMap<string, Job>, rule: string): string[] {
  const places: string[] = []
  for (const [id, pinned] of Object.entries(PINNED_RUNS())) {
    for (const [name, { run, rule: its, if: condition, cwd }] of Object.entries(pinned)) {
      if (its !== rule) continue
      const steps = jobs.get(id)?.steps.filter(step => step.name === name) ?? []
      if (
        steps.length !== 1 ||
        steps[0]?.run !== run ||
        steps[0]?.if !== condition ||
        steps[0]?.keys.get('working-directory') !== cwd
      ) {
        places.push(`${id} (${name})`)
      }
    }
  }
  return places
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
  CLI_FETCH,
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
  // A for loop's variable, and the command a pipeline's command pipes into.
  variable?: string
  next?: string
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
    let last: GlueCommand | undefined
    for (;;) {
      previous = this.command(previous)
      // The command before it in the pipeline learns what it pipes into.
      if (last !== undefined) last.next = previous
      last = this.commands[this.commands.length - 1]
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
      this.emit({ ...base, name: 'for', args: words, redirections: [], variable: name }, from)
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
const BLOCK_SCALARS =
  "writes a block scalar only as a run:, never as an env: entry, an output, an input or any other value, whose last line break GitHub keeps and the guard's reader drops"
// A reusable workflow a job may call (DPW-02): one of this repository's at the caller's own commit, named by
// its local path, ./.github/workflows/<file>.yml, which GitHub reads from the same commit as the caller.
const CALLED_WORKFLOW = /^\.\/(\.github\/workflows\/[^/@\s]+\.ya?ml)$/
const CALLS_OWN =
  'calls only another workflow of this repository at this commit (./.github/workflows/<file>.yml), never deploy.yml, one of another repository or one at another ref'
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
// alias or quoted key, which workflow.ts can't read), its block scalars literal (literalProblems) and only
// a run: (blockScalarProblems, since GitHub keeps a block scalar's last line break in any other
// value), every if: a plain ${{ … }} with nothing beside it (IF_LINE), and it spells nothing with an
// escape. Every workflow is in the shape workflow.ts reads (shapeProblems: no anchor, alias, tag or flow
// mapping but {}), so none is read wrong, and holds only tabs, newlines and printable text
// (unreadCharacter). Every other workflow holds the id-token clause, spells nothing with an escape, names
// no environment, gives no block scalar an indentation indicator (indicatorProblems), and has each job that
// calls a reusable workflow call another of this repository's at this commit (CALLED_WORKFLOW), never
// deploy.yml, handing it no secret.
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
  // A block scalar on any key but run: GitHub keeps its last line break in the value (an env:
  // entry's, an output's, an input's, a group's), which the reader drops, so the value the guard pins
  // isn't the one a step reads.
  if (blockScalarProblems(deploy).length > 0) {
    found.push(at(DEPLOY, 'DPW-02', BLOCK_SCALARS))
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
    // A job that calls a reusable workflow calls one of this repository's at this commit, which every
    // rule here reads as it reads this one, and never deploy.yml: a workflow of another repository, or of
    // this one at another ref, could name an environment or join a deploy group unread, and no secret is
    // handed to one, whose job naming an environment would receive that environment's secrets too.
    for (const job of workflowJobs(text)) {
      const uses = job.keys.has('uses') ? jobScalar(job, 'uses') : undefined
      const called = uses === undefined ? undefined : CALLED_WORKFLOW.exec(uses)?.[1]
      if (job.keys.has('uses') && (called === undefined || called === DEPLOY || !workflows.has(called))) {
        found.push(at(path, 'DPW-02', `${job.id}: ${CALLS_OWN}`))
      }
      if (job.keys.has('secrets')) found.push(at(path, 'DPW-02', `${job.id}: hands no secret to a called workflow`))
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

// DPW-04 (C11-D48, C11-D79): every uses: in deploy.yml is one of the five actions at exactly the commit and
// version comment ACTION_PINS names for it (scripts/guards/action-pins.ts), which CI's check job proves
// against the action's own repository (scripts/check-action-pins.ts), so no commit pushed only to a fork,
// which GitHub resolves under the action's name, and no older release's commit under a newer comment, runs
// in a job that holds the OIDC request token; no local action, docker:// image or reusable workflow. And
// .github/workflows holds workflows alone (WORKFLOW_FILE), so no actions lockfile, which could name a commit
// for an action the guard never reads, stands beside them.
export function actionPinFindings(workflows: Texts, folder?: readonly string[]): Finding[] {
  const text = workflows.get(DEPLOY) ?? ''
  const spans = jobSpans(text)
  const found = new Set<Finding>()
  for (const { index, text: line } of yamlLines(text)) {
    const uses = /(?:^|[\s{,])uses\s*:\s*(.*)$/.exec(line)
    if (!uses) continue
    const value = (uses[1] ?? '').trim()
    const action = value.split('@')[0] ?? ''
    if (Object.hasOwn(ACTION_PINS, action) && value === `${action}@${ACTION_PINS[action]}`) continue
    const job = [...spans].find(([, [from, to]]) => index >= from && index < to)?.[0] ?? 'the top level'
    found.add(
      at(
        DEPLOY,
        'DPW-04',
        `${job}: every uses: is checkout, setup-node, upload-artifact, download-artifact or the credentials action, at exactly the commit and version comment ACTION_PINS names, which CI proves against the action's own repository`,
      ),
    )
  }
  for (const path of folder ?? []) {
    if (path.startsWith('.github/workflows/') && !WORKFLOW_FILE.test(path)) {
      found.add(
        at(
          DEPLOY,
          'DPW-04',
          '.github/workflows holds workflows alone (<name>.yml or <name>.yaml): no actions lockfile or other file beside them',
        ),
      )
    }
  }
  return [...found]
}
// A workflow file as GitHub runs it and the guard reads it: one level under .github/workflows.
export const WORKFLOW_FILE = /^\.github\/workflows\/[^/]+\.ya?ml$/

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
// The runner's own names a credentialed or record run's own lines may expand: its outputs, its summary, its
// folder and the run's ids and address, none of them a credential. Not GH_TOKEN, which gh reads itself,
// and none of the names the runner hands a job a credential in (the OIDC request token and its URL, the
// AWS session), which a jq split or slice would print in pieces no mask matches.
const RUNNER_EXPANSIONS = [
  'GITHUB_OUTPUT',
  'GITHUB_STEP_SUMMARY',
  'RUNNER_TEMP',
  'GITHUB_RUN_ID',
  'GITHUB_RUN_ATTEMPT',
  'GITHUB_SERVER_URL',
  'GITHUB_REPOSITORY',
]
const TOKEN_NAMES = ['GH_TOKEN']
// Whether a run's own lines expand only a name its step's or job's env: sets (but a token's), one its own
// lines or a canonical text standing in it set, one of RUNNER_EXPANSIONS, a function's argument ($1 to $9)
// or the last status ($?).
function expandsOnlyItsOwn(run: string, read: ShellRead, env: readonly string[]): boolean {
  const own = new Set<string>([...env.filter(name => !TOKEN_NAMES.includes(name)), ...RUNNER_EXPANSIONS])
  for (const command of read.commands) for (const name of namesSet(command)) own.add(name)
  for (const place of canonicalPlaces(run)) for (const name of NAMES_SET_BY(place.text)) own.add(name)
  return read.commands.every(command =>
    [
      ...command.args,
      ...command.assignments.map(each => each.value),
      ...command.redirections.flatMap(each => each.target ?? []),
    ].every(word => word.expands.every(name => own.has(name) || /^(?:[1-9]|\?)$/.test(name))),
  )
}
const EXPANDS_ITS_OWN =
  "expands on its own lines only a name its step's or job's env: sets (never GH_TOKEN, which gh reads itself), one its run sets, a function's argument, the last status or the runner's outputs, summary, folder and run ids, so no line reads the OIDC request token or another credential the runner hands it"

// The secrets context and the job's token as GitHub reads them (actions/runner looks a context's name and a
// property up ignoring case): secrets by property (secrets.NAME, a name captured) or by index (secrets['NAME'])
// or whole (toJSON(secrets)), in any letter case; github.token or github['token'] in any case, and the
// github context's values by its object filter (github.*, every value of the context, the token first,
// which join(), toJSON() or an index then hand on); and, in an expression, the github context whole
// (toJSON(github), which holds the token). Only the workflow's own spelling of a name its job may use passes
// (secrets.AWS_ACCOUNT_ID), and github.token only as a GH_TOKEN env value, whose step env STEP_ENVS pins; any
// other spelling is refused, so an action's input, which no rule pins by value, can't name a secret or the
// token another way.
const SECRETS_NAMED = /\bsecrets\b(?:\s*\.\s*(\w+)\b(?!\s*[.[(]))?/gi
const JOB_TOKEN = /\bgithub\s*(?:\.\s*(?:token\b|\*)|\[)/i
const GITHUB_CONTEXT = /\bgithub\b(\s*[.[])?/gi
const GH_TOKEN_LINE = `GH_TOKEN: ${expr('github.token')}`

// DPW-07 (C11-D61): nothing a run prints shows what it shouldn't. No set -x, set -o xtrace, env as a word
// outside quotes, bare set, printenv, export -p, declare -p or a declare, export, local or readonly given no
// name; in a credentialed or record run's own lines no expansion but of its own names (EXPANDS_ITS_OWN), and
// in a credentialed run no jq program's env or $ENV, /proc file or AWS_ variable's expansion; no ${{ }}
// inside a run (inputs and outputs come through env:); secrets, in any letter case or form, names only the
// role and the account id, as secrets.NAME, in the five environment jobs, and never GITHUB_TOKEN; github.token
// only as a GH_TOKEN env value, and the github context never whole, nor its values by github.*; in each
// environment job the account id is masked before the credentials action, every run after it starts with
// the preamble, whose mask, run and get no later definition, alias or unset changes, every aws, CDK and
// skopeo command is run … or $(get …), get only ever first in a $( … ), whose output is kept (the registry
// login alone piped into skopeo login, then the filter), each write to the job summary goes through mask,
// the credentials action takes exactly its seven inputs, and no AWS_ variable or ROLE_TO_ASSUME is set.
export function maskingFindings(workflows: Texts): Finding[] {
  const found = new Set<Finding>()
  const text = workflows.get(DEPLOY) ?? ''
  const add = (where: string, rule: string) => found.add(at(DEPLOY, 'DPW-07', `${where}: ${rule}`))
  const spans = jobSpans(text)
  text.split('\n').forEach((line, index) => {
    const job = [...spans].find(([, [from, to]]) => index >= from && index < to)?.[0]
    const allowed = job === undefined ? [] : (SECRETS[job] ?? [])
    for (const match of line.matchAll(SECRETS_NAMED)) {
      if (match[1] === undefined || !allowed.includes(match[1]) || match[0] !== `secrets.${match[1]}`) {
        add(
          job ?? 'the top level',
          allowed.length === 0 ? 'names no secret' : `names no secret but ${allowed.join(' and ')}, never GITHUB_TOKEN`,
        )
      }
    }
    const expressions = line.indexOf('${{') < 0 ? '' : line.slice(line.indexOf('${{'))
    if (
      line.trim() !== GH_TOKEN_LINE &&
      (JOB_TOKEN.test(line) || [...expressions.matchAll(GITHUB_CONTEXT)].some(each => each[1] === undefined))
    ) {
      add(job ?? 'the top level', 'names github.token only as a GH_TOKEN env value, and the github context never whole')
    }
  })
  for (const { id, job, steps } of jobsOf(text).values()) {
    const credentialed = ENVIRONMENT_JOBS[id] !== undefined
    const credentials = credentialsAt(steps)
    const jobEnv = blockValue(job.keys.get('env') ?? [])
    const jobNames = isMap(jobEnv) ? [...jobEnv.keys()] : []
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
      // A credentialed or record run's own lines expand only the names it owns, so none hands the OIDC
      // request token, the AWS session or the GitHub token to a tool that prints it in pieces.
      if (
        (credentialed || RECORD_JOBS.includes(id)) &&
        !expandsOnlyItsOwn(run, read, [...jobNames, ...step.env.keys()])
      ) {
        add(where, EXPANDS_ITS_OWN)
      }
      // env or printenv, by name or path, as a command or a word handed to one (sudo printenv, xargs env,
      // find -exec /usr/bin/env), quoted or not, since bash hands a program the word with its quotes taken
      // off. A program the run starts is handed a script only as one word (bash -c "printenv X"), which DPW-07
      // doesn't read: that is build's and synth's, which hold no secret and run repository code by design.
      const printsEnvironment = read.commands.some(
        command =>
          /(?:^|\/)(?:env|printenv)$/.test(command.name ?? '') ||
          command.args.some(arg => /(?:^|\/)(?:env|printenv)$/.test(arg.value ?? '')),
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
      // The registry password, a credential good for twelve hours, is asked for only by the login, piped
      // straight into skopeo login; any other line naming it could print it or keep it.
      if (lines.some(line => line.text.includes('get-login-password') && line.raw.trim() !== SKOPEO_LOGIN)) {
        add(where, 'asks ECR for the registry password only as SKOPEO_LOGIN, piped straight into skopeo login')
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
    if (jobNames.some(key => /^AWS_|^ROLE_TO_ASSUME$/.test(key))) {
      add(id, 'sets no AWS_ variable and no ROLE_TO_ASSUME')
    }
    const mask = steps.findIndex(
      step => step.run === MASK_RUN && step.env.get('ACCOUNT_ID') === expr('secrets.AWS_ACCOUNT_ID'),
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
// rollback-prod's steps are rollback-nonprod's but for the environment's name; only prod and
// rollback-prod deploy to prod, rollback-prod only the previous release's Tasks and Services; the runs a
// smoke, a rollback, prod-gate or the approver rests on are pinned whole (PINNED_RUNS: prod's records, the
// smokes, services_started, the read-back, the rollback jobs' releases and rolled, prod-plan's diff); and
// outside build and synth only a pinned run, AWS_CHECK's step and prod-gate's call write an output.
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
  // What a smoke, a rollback, prod-gate or the approver judges, each run pinned whole, so no line of its own
  // ends one early, writes an output or a file of its own, or hands it another input.
  for (const place of unpinnedRuns(jobs, 'DPW-08')) {
    add(
      place,
      "runs as written, whole and under its own if: (PINNED_RUNS): the pull request's checks, main's CI, the prod gate, prod's records, the smoke, services_started, the read-back, a rollback's releases and rolled, and the approver's diff, so no line of its own ends one early or writes an output or a file of its own",
    )
  }
  // An output only from a run the guard pins whole, outside build and synth (which run repository code by
  // design): PINNED_RUNS', AWS_CHECK's step and history.ts prod-gate's.
  const outputRuns = new Set([
    ...Object.values(PINNED_RUNS()).flatMap(pinned => Object.values(pinned).map(each => each.run)),
    ...Object.values(AWS_CHECK_CALLS).map(call => [PREAMBLE, AWS_CHECK, call].join('\n')),
    PROD_GATE_CALL,
  ])
  for (const { id, steps } of jobs.values()) {
    if (id === 'build' || id === 'synth') continue
    steps.forEach((step, index) => {
      if (step.run?.includes('GITHUB_OUTPUT') && !outputRuns.has(step.run)) {
        add(`${id} (${label(step, index)})`, 'writes an output only from a run the guard pins whole')
      }
    })
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
// The gate's plan (C11-D49, C11-D58, DPW-09): PLAN_CALL, then the plan's lines checked, written to the
// outputs and summarised, pinned whole so no line of its own writes an output or ends it early.
export const PLAN_STEP = sh`set -euo pipefail
# The plan (C11-D49, C11-D58): who started the run and where, the inputs, DOMAINS, a deploy's pull
# request, each environment's current release (for a deploy, at or after the expansion of every floor
# at this commit whose migration it lacks) and, for a deploy or a drill-smoke, the release each
# automatic rollback goes back to and whether it may (above every floor at this commit). Every commit
# it outputs is on main at this run's commit. A refusal is one line, \`history: refused <code>: <why>\`.
# Each record history.ts ignores gets one line naming its id (its stderr), in the log and the summary.
${PLAN_CALL}
  tee -a "$GITHUB_STEP_SUMMARY" <"$RUNNER_TEMP/plan-ignored.txt" >&2
  printf '%s\n' "$PLAN"
  exit 1
fi
tee -a "$GITHUB_STEP_SUMMARY" <"$RUNNER_TEMP/plan-ignored.txt" >&2
if grep -Evq '^[a-z_]+=[0-9a-z:._-]*$' <<<"$PLAN"; then
  echo 'gate: the plan printed a line that is not key=value'
  exit 1
fi
printf '%s\n' "$PLAN" >>"$GITHUB_OUTPUT"
{
  echo '### The plan'
  grep -E '^(mode|target|restore|commit|digest|current_nonprod|current_prod|previous_nonprod_commit|previous_prod_commit|rollback_nonprod|rollback_prod|first_nonprod|first_prod)=' <<<"$PLAN" | sed 's/^/- /'
} >>"$GITHUB_STEP_SUMMARY"`
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
// holds real data (C0.12's flip can't land half done); the script's agent markers are the Owner
// bootstrap script's; and the gate's reads of the records and main's ruleset, its check of the live
// environments and its plan are pinned whole under their own if: (GATE_RECORDS, RULESET_CHECK,
// ENVIRONMENTS_CHECK, PLAN_STEP), so no line of their own or if: ends or skips one, forges what the plan
// reads or writes a gate output.
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
  // The steps the plan rests on, each pinned whole under its own if:, so no line of its own or if: ends or
  // skips one, forges a file the plan reads or writes a gate output of its own.
  for (const place of unpinnedRuns(jobs, 'DPW-09')) {
    add(
      place,
      "runs as written, whole and under its own if: (PINNED_RUNS): the records, main's ruleset and the live environments the plan rests on and the plan itself, so no line of its own ends one early, skips one, forges what the plan reads or writes an output of its own",
    )
  }
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
// CLI (through run), and the fetch of the CLI on CLI_FETCH's own lines alone (FETCH_TOOLS); never npm.
// Anything else, a script by path, a variable or quoted word run as a command, a wrapper (exec, command,
// env, …) or a builtin that sets what runs (unset, wait -p, select), is refused, and so is a function
// named as a program.
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
// mktemp, find and sha256sum are held to their uses below), so none, as uniq or cp would, rewrites a file
// the CLI then runs.
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
  'sha256sum',
  'aws',
  'skopeo',
]
// The tools that could run another program or write a file, held to the one use each job makes of them:
// git only to ask whether one commit is an ancestor of another, gh only as gh api, sed only as the
// preamble's mask, find only in ASSET_CHECK's and CLI_CHECK's searches for a symbolic link, sha256sum only
// in ASSET_CHECK's hash of a file asset's bytes from its input, sort only with its plain flags,
// tee only appending to the summary, mapfile with no callback, aws only for the reads and one-offs the
// workflow makes (no s3 cp, which would write a file), skopeo only as the registry login and the push,
// set only as set -euo pipefail (no set --, which would hand "$@" a program), and local
// and export with no flag (no -n, which would set another variable through a name). (trap, which runs its
// text, is no builtin a job may use.)
const MASK_LINE = PREAMBLE.split('\n').find(line => line.startsWith('mask()')) ?? ''
const FIND_LINE = ASSET_CHECK.split('\n').find(line => line.includes('find ')) ?? ''
const CLI_FIND_LINE = CLI_CHECK.split('\n').find(line => line.includes('find ')) ?? ''
const KEY_HASH_LINE = ASSET_CHECK.split('\n').find(line => line.includes('sha256sum ')) ?? ''
// The tools CLI_FETCH alone runs, each only on its own line of that text and only in a run that is CLI_FETCH
// whole: mkdir makes the CLI's folder, curl fetches the registry's tarball by its fixed URL (the one network
// call a credentialed run makes outside aws, gh and skopeo), openssl and base64 hash it, and tar unpacks it
// into the folder. None writes anywhere but the CLI's folder and its tarball, before CLI_CHECK.
const fetchTextLine = (start: string) => CLI_FETCH.split('\n').find(line => line.startsWith(start)) ?? ''
const HASH_LINE = fetchTextLine('[ "sha512-$(openssl ')
const FETCH_TOOLS: Readonly<Record<string, string>> = {
  mkdir: fetchTextLine('mkdir '),
  curl: fetchTextLine('curl '),
  openssl: HASH_LINE,
  base64: HASH_LINE,
  tar: fetchTextLine('tar '),
}
const AWS_CALLS =
  /^\s+(?:ecs\s+(?:run-task|describe-tasks|describe-services|list-tasks|stop-task|wait\s+tasks-stopped|describe-task-definition)|elbv2\s+describe-(?:target-groups|target-group-attributes|target-health|load-balancers|load-balancer-attributes)|cloudformation\s+describe-stacks|ecr\s+(?:describe-images|get-login-password)|logs\s+get-log-events)(?:\s|$)/
const NO_FLAG = (command: ShellCommand) => !/(?:^|\s)[-+][A-Za-z]/.test(command.tail)
const TOOL_USES: Readonly<Record<string, (command: ShellCommand, raw: string) => boolean>> = {
  git: ({ rest }) => /^\s+merge-base\s+--is-ancestor\s/.test(rest),
  gh: ({ rest }) => /^\s+api\s/.test(rest),
  sed: (_, raw) => raw === MASK_LINE.trim(),
  find: (_, raw) => raw === FIND_LINE.trim() || raw === CLI_FIND_LINE.trim(),
  sha256sum: (_, raw) => raw === KEY_HASH_LINE.trim(),
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
// A jq program as a word: . alone, or one whole single-quoted string, which bash hands jq as written. Any
// other word (one joining a quoted string to an expansion, '.'"$P" say) hands jq a program built at run
// time, which no hold can read, so it is refused whatever its quoted part holds.
const WHOLE_PROGRAM = /^'[^']*'$/
const programOf = (word: ShellWord | undefined): string | undefined =>
  word === undefined
    ? undefined
    : word.raw === '.'
      ? '.'
      : WHOLE_PROGRAM.test(word.raw) && word.value !== undefined && word.expands.length === 0
        ? word.value
        : undefined
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
  const program = programOf(args[i])
  if (program === undefined || i !== args.length - 1) return false
  return jqProgramIsHeld(program, given)
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
  const program = programOf(args[args.length - 1])
  return argText(args.slice(0, -1)) === GH_MIGRATED && program !== undefined && jqProgramIsHeld(program, [])
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
// A word as the program it is handed reads it: its quotes taken off and each expansion written \0, or
// undefined for one holding a substitution (no aws word of the workflow's own lines holds one). The table
// admits only $NAME, ${…}, $1 to $9 and $? as expansions, so each ends at its name, brace or character.
function wordSkeleton(raw: string): string | undefined {
  let out = ''
  let quote: string | undefined
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] ?? ''
    if (quote === "'") {
      if (c === "'") quote = undefined
      else out += c
    } else if (c === "'" && quote === undefined) quote = "'"
    else if (c === '"') quote = quote === '"' ? undefined : '"'
    else if (c === '$') {
      const rest = raw.slice(i)
      const found = /^\$(?:\{[^}]*\}|[A-Za-z_]\w*|[0-9?])/.exec(rest)?.[0]
      if (found === undefined) return undefined
      out += '\0'
      i += found.length - 1
    } else out += c
  }
  return out
}
// The words an aws value on a run's own lines may hold an expansion in, each exactly as the workflow
// writes it: the variables it passes whole (the cluster, the task definition, the network and the token
// migrate runs with, set by a canonical text from AWS's own answers or by a run the guard pins whole; the
// read-back's tasks, target group and load balancer, from AWS's answers in the read-back), and the names
// it builds from the stage (STAGES' job env), the release's digest, a role the read-back loops over and
// the run's own ids. No own line outside a step whose run the guard pins whole sets a name they read
// (AWS_VALUE_LINES), and no other word holds an expansion, so neither a value the CLI loads from a file
// (file://, fileb://) nor a shorthand file load (imageTag@=file://…, built from a glue variable after a
// literal key) is put together at run time.
const AWS_VALUE_WORDS = [
  '"$CLUSTER"',
  '"$MIGRATE_TD"',
  '"$NET_MIGRATE"',
  '"$TOKEN"',
  sh`"$\{TASK_ARNS[@]}"`,
  '"$GROUP_ARN"',
  '"$BALANCER"',
  '"imageDigest=$DIGEST"',
  '"gha-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"',
  '"hearth-$STAGE"',
  '"hearth-$STAGE-api"',
  '"hearth-$STAGE-realtime"',
  '"hearth-$STAGE-$ROLE"',
  '"Hearth-$STAGE-Services"',
]
// The names those words read that a run's own lines could set, which no own line sets outside a step whose
// run the guard pins whole, but TOKEN on the lines DPW-06 pins (a literal and the run's ids). STAGE is the
// job's env and the GITHUB_ names the runner's, which no own line sets either (SETS_INPUT, the loader
// names).
const AWS_VALUE_NAMES = [
  'CLUSTER',
  'MIGRATE_TD',
  'NET_MIGRATE',
  'TOKEN',
  'TASK_ARNS',
  'GROUP_ARN',
  'BALANCER',
  'DIGEST',
  'ROLE',
]
// aws on a run's own lines: the call (AWS_CALLS) and each option, written plainly, from AWS_OPTIONS, the
// options told apart from values as aws tells them, by the text it is handed (so a quoted '--debug' is
// an option too); each value, as aws reads it, holding no scheme (file://, fileb://, https://) or
// shorthand file load (key@=) anywhere, and holding an expansion, anywhere in it, only as one of
// AWS_VALUE_WORDS, whole.
function awsIsHeld(args: readonly ShellWord[]): boolean {
  if (!AWS_CALLS.test(` ${argText(args)}`)) return false
  let option = ''
  return args.slice(2).every(arg => {
    const value = wordSkeleton(arg.raw)
    if (value === undefined) return false
    if (value.startsWith('-')) {
      option = arg.raw
      return arg.raw === value && AWS_OPTIONS.includes(arg.raw)
    }
    if (option === '' || /:\/\/|@=/.test(value) || /^(?:file|fileb|https?):/i.test(value)) return false
    return !value.includes('\0') || AWS_VALUE_WORDS.includes(arg.raw)
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
  // The registry password only through get, first in its pipeline, in no substitution and piped straight
  // into skopeo: the login's.
  if (program === 'aws' && argText(rest).startsWith('ecr get-login-password')) {
    return (
      command.name === 'get' &&
      !command.inSubstitution &&
      command.previous === undefined &&
      command.next === 'skopeo' &&
      argText(rest) === 'ecr get-login-password --region ap-southeast-1'
    )
  }
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
}
// The commands the table holds itself, and the compound ones.
const TABLE_HELD = [...Object.keys(SHELL_TABLE.builtins), 'if', 'for', 'case', '{', '[[']
// The calls a credentialed run's own lines make of the functions its canonical texts define, each as
// written, with the arguments the workflow gives it, so none is handed a pattern, a task, a folder or a
// release of another's (one_off_end given '.' prints every line of a task's log, say). mask, run and get
// are GLUE_USES's.
const CANONICAL_CALLS: ReadonlyMap<string, readonly string[]> = new Map([
  ['one_off_end', ['one_off_end migrate "$MIGRATE_LINES" "$RUN"']],
  ['aws_check', ['aws_check drill', 'aws_check "$MODE"', 'aws_check auto', 'aws_check restore']],
  ['check_assembly', ['check_assembly "$RUNNER_TEMP/assembly"', 'check_assembly "$RUNNER_TEMP/assembly-previous"']],
  [
    'check_release_in',
    [
      'check_release_in "$RUNNER_TEMP/assembly" "$RELEASE"',
      'check_release_in "$RUNNER_TEMP/assembly-previous" "$PREVIOUS"',
    ],
  ],
])
// The calls a record job's own lines make of its own two functions, each as written: a release record in
// either, a restore record in record-prod alone, each from the payload release_payload built from the
// step's env (DPW-13), so no record of another task, environment or commit is written.
const recordCalls = (id: string): ReadonlyMap<string, readonly string[]> =>
  new Map([
    [
      'record',
      id === 'record-prod'
        ? ['record hearth-release "$PAYLOAD"', 'record hearth-restore "$PAYLOAD"']
        : ['record hearth-release "$PAYLOAD"'],
    ],
    [
      'release_payload',
      [
        'release_payload "$KIND" "$COMMIT" "$DIGEST" "$SERVICES"',
        'release_payload pipeline-rollback "$PREVIOUS_COMMIT" "$PREVIOUS_DIGEST" "$ROLLBACK_SERVICES"',
      ],
    ],
  ])
// Whether a command a credentialed or record job's own lines run is held to its uses: GLUE_USES's, the
// table's own, or a function's call as calls names it.
function glueIsHeld(command: GlueCommand, calls: ReadonlyMap<string, readonly string[]>): boolean {
  const name = command.name
  const redirections = command.redirections.every(({ op, target }) =>
    op === '<' ? target?.raw === '"$DIFF"' : op.startsWith('<') || op.includes('&') || WRITABLE.test(target?.raw ?? ''),
  )
  if (name === undefined) return redirections
  if (!redirections || command.assignments.length > 0) return false
  const use = GLUE_USES[name]
  if (use !== undefined) return use(command)
  return TABLE_HELD.includes(name) || calls.get(name)?.includes(command.raw) === true
}
const HELD =
  'gives each command its own lines run only the flags and arguments the workflow uses (GLUE_USES), no assignment before it, and no file to read but the diff or to write but its outputs, its summary, the diff and /dev/null, so none runs code, reads a file the guard can’t see or writes one'
// The names a command on a run's own lines sets: its assignments, a for loop's variable, mapfile's array
// and local's names.
const namesSet = (command: GlueCommand): string[] => [
  ...command.assignments.map(each => each.name),
  ...(command.variable === undefined ? [] : [command.variable]),
  ...(command.name === 'mapfile' ? [command.args[1]?.raw ?? ''] : []),
  ...(command.name === 'local' ? command.args.map(arg => arg.raw) : []),
]
// The names each canonical text sets, read on its code view (quoted text blanked): its assignments, its
// locals, its for loops' variables and its arrays read by mapfile or read; TASKS_OUTPUTS sets MIGRATE_TD
// and PROBE_TD by printf -v on a name it builds.
const BUILT_NAMES: ReadonlyMap<string, readonly string[]> = new Map([[TASKS_OUTPUTS, ['MIGRATE_TD', 'PROBE_TD']]])
const NAMES_SET_BY = keptByText((text: string): readonly string[] => {
  const names = new Set<string>(BUILT_NAMES.get(text) ?? [])
  for (const line of shellViews(text).code.split('\n')) {
    for (const match of line.matchAll(/(?:^|[\s;&|(!{])([A-Za-z_]\w*)(?:\[[^\]]*\])?\+?=(?!=)/g))
      names.add(match[1] ?? '')
    for (const match of line.matchAll(/\blocal\s+([^;&|]*)/g)) {
      for (const word of (match[1] ?? '').split(/\s+/)) names.add(/^[A-Za-z_]\w*/.exec(word)?.[0] ?? '')
    }
    for (const match of line.matchAll(/\bfor\s+([A-Za-z_]\w*)\s+in\b/g)) names.add(match[1] ?? '')
    for (const match of line.matchAll(/\b(?:mapfile|readarray|read)\s+(?:-\S+\s+)*([A-Za-z_]\w*)/g))
      names.add(match[1] ?? '')
  }
  names.delete('')
  return [...names]
})
// The lines that alone may set a name a pinned line reads on a run's own lines: the registry the login and
// the push name, the one-off migrate's end waits on, and none the account id REGISTRY_LINE builds the
// registry from, which comes only from the masked secret in its step's env:, so no own line points the
// login, and the registry password with it, or the push at another host. (TOKEN, NET_MIGRATE, OVERRIDES,
// ASSEMBLY, DIFF, CDK and STAGE are pinned by the rules that read them.)
const ASSIGNED_ONLY_BY: ReadonlyMap<string, readonly string[]> = new Map([
  ['REGISTRY', [REGISTRY_LINE]],
  ['RUN', [RUN_TASK_MIGRATE]],
  ['ACCOUNT_ID', []],
])
// Every name an aws value reads (AWS_VALUE_NAMES) is set on a run's own lines only by a command its step's
// pinned run holds (the release's DIGEST, the read-back's tasks, target group, load balancer and roles,
// migrate's network), so a line added to a pinned run that sets one is this rule's finding as well as the
// pin's, but TOKEN, also on the lines DPW-06 pins; a name a canonical text sets (CLUSTER, the task
// definitions) never on an own line.
const AWS_VALUE_LINES: ReadonlyMap<string, readonly string[]> = new Map(
  AWS_VALUE_NAMES.map((name): [string, readonly string[]] => [
    name,
    name === 'TOKEN'
      ? (['migrate', 'probe'] as const).flatMap(kind =>
          (['nonprod', 'prod'] as const).flatMap(stage =>
            (['deploy', 'rollback'] as const).map(job => tokenLine(kind, stage, job)),
          ),
        )
      : [],
  ]),
)
// The runs the guard pins whole (PINNED_RUNS), by their job and their step's name.
const PINNED_RUN_TEXTS: ReadonlyMap<string, string> = new Map(
  Object.entries(PINNED_RUNS()).flatMap(([id, pinned]) =>
    Object.entries(pinned).map(([name, { run }]): [string, string] => [`${id}\n${name}`, run]),
  ),
)
const pinnedRunOf = (id: string, step: WorkflowStep) => PINNED_RUN_TEXTS.get(`${id}\n${step.name ?? ''}`)
// The commands a pinned run's own lines run, as the table reads them.
const PINNED_COMMANDS = keptByText((run: string): readonly string[] => readShell(run).commands.map(each => each.raw))
// Whether a run's own lines set an input its pinned lines read (DPW-10, DPW-13): a name its step's or its
// job's env: sets, one a canonical text standing in the run sets, one ASSIGNED_ONLY_BY names on any line
// but its own, or one an aws value reads by any command but AWS_VALUE_LINES' own and its step's pinned
// run's.
function setsAnInput(run: string, read: ShellRead, env: readonly string[], pinned: string | undefined): boolean {
  const canonical = new Set(canonicalPlaces(run).flatMap(place => NAMES_SET_BY(place.text)))
  const held = pinned === undefined ? [] : PINNED_COMMANDS(pinned)
  const onlyOn = (lines: readonly string[] | undefined, raw: string) => lines !== undefined && !lines.includes(raw)
  return read.commands.some(command =>
    namesSet(command).some(
      name =>
        env.includes(name) ||
        canonical.has(name) ||
        onlyOn(ASSIGNED_ONLY_BY.get(name), command.raw) ||
        (onlyOn(AWS_VALUE_LINES.get(name), command.raw) && !held.includes(command.raw)),
    ),
  )
}
const SETS_INPUT =
  "sets no variable its step's or its job's env: sets or a canonical text in its run sets, no name an aws value reads but by a command its step's pinned run holds (TOKEN also on its own lines), REGISTRY and RUN only on their own lines and ACCOUNT_ID on none, so no line the guard holds is handed another input"
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
// by its one line) and /dev/null, so no file the CLI or a tool then runs (the CLI CLI_FETCH unpacked, say)
// is rewritten. A write is any redirection that opens its target for writing: >, >>, >|, &>, a
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
// variable that chooses what runs (BASH_ENV, PATH, NODE_OPTIONS) comes in unseen; every env: and job's
// outputs: is the guard's, whole, each a block mapping, and every step's id too (STEP_ENVS, JOB_OUTPUTS,
// STEP_IDS below); and every job's steps are the guard's, in every job (JOB_STEPS), none of whose runs
// names a file command that hands a later step something (GITHUB_ENV, GITHUB_PATH, GITHUB_STATE).
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

// Every env: and every job's outputs: in the workflow, whole (DPW-10): each value the expression it reads,
// so no pinned run reads an input another step, job or context hands it (a TARGET from prod-gate's
// outputs, which hold none, reads as '' and skips the checks it guards), no push tags an image by another
// commit, and no gate output is taken from another of the plan's. A job's env: is STAGES' alone.
const gateOutput = (name: string) => expr(`needs.gate.outputs.${name}`)
const GH_ENV = { GH_TOKEN: expr('github.token'), REPO: expr('github.repository') }
const ACCOUNT_ENV = { ACCOUNT_ID: expr('secrets.AWS_ACCOUNT_ID') }
const BUILD_DIGEST = expr('needs.build.outputs.digest')
const NONPROD_DIGEST = expr('needs.nonprod.outputs.digest')
const RELEASE_ENV = {
  BUILD: gateOutput('build'),
  COMMIT: gateOutput('commit'),
  GATE_DIGEST: gateOutput('digest'),
  BUILD_DIGEST,
}
const readBackEnv = (release: string) => ({ RELEASE: release, MODE, RESTORE: gateOutput('restore') })
const previousRelease = (stage: Stage) =>
  `${gateOutput(`previous_${stage}_commit`)}:${gateOutput(`previous_${stage}_digest`)}`
const deployEnvs = (stage: Stage): Readonly<Record<string, Readonly<Record<string, string>>>> => ({
  'The release this job deploys': RELEASE_ENV,
  'Check the assembly': { RELEASE: RELEASE_OUTPUT },
  'The fast re-check':
    stage === 'nonprod'
      ? { ...GH_ENV, MODE, RECORD_ID: gateOutput('current_nonprod_id') }
      : {
          ...GH_ENV,
          MODE,
          TARGET: gateOutput('target'),
          RECORD_ID: expr('needs.prod-gate.outputs.current_prod_id'),
          PLAN_ATTEMPT: expr('needs.prod-plan.outputs.attempt'),
          BUILD_DIGEST,
          NONPROD_DIGEST,
        },
  'Mask the account id': ACCOUNT_ENV,
  'What runs': AWS_CHECK_ENV[stage] ?? {},
  'Push the image': {
    ...ACCOUNT_ENV,
    COMMIT: expr('steps.release.outputs.commit'),
    DIGEST: expr('steps.release.outputs.digest'),
    ...(stage === 'prod' ? { NONPROD_DIGEST } : {}),
  },
  Migrate: { ...GH_ENV, COMMIT: expr('steps.release.outputs.commit') },
  'Read back what runs': readBackEnv(RELEASE_OUTPUT),
})
const rollbackEnvs = (stage: Stage): Readonly<Record<string, Readonly<Record<string, string>>>> => ({
  "This run's release and the previous one": {
    MODE,
    COMMIT: gateOutput('commit'),
    GATE_DIGEST: gateOutput('digest'),
    BUILD_DIGEST,
    PREVIOUS_COMMIT: gateOutput(`previous_${stage}_commit`),
    PREVIOUS_DIGEST: gateOutput(`previous_${stage}_digest`),
  },
  'Check the previous assembly': { PREVIOUS: PREVIOUS_OUTPUT },
  'Mask the account id': ACCOUNT_ENV,
  'What runs': AWS_CHECK_ENV[`rollback-${stage}`] ?? {},
  'Read back what runs': readBackEnv(PREVIOUS_OUTPUT),
})
const smokeEnv = (stage: Stage, resmoke: boolean) => {
  const source = resmoke ? `rollback-${stage}` : stage
  return {
    Smoke: {
      READBACK: expr(`needs.${source}.outputs.readback`),
      ATTEMPT: expr(`needs.${source}.outputs.attempt`),
      RELEASE: resmoke ? previousRelease(stage) : `${gateOutput('commit')}:${expr(`needs.${stage}.outputs.digest`)}`,
      PROFILE_AT: resmoke ? gateOutput(`previous_${stage}_commit`) : gateOutput('commit'),
      MODE,
      ...(stage === 'prod' ? { TARGET: gateOutput('target'), RESTORE: gateOutput('restore') } : {}),
    },
  }
}
const recordEnv = (stage: Stage) => ({
  'Write the record': {
    ...GH_ENV,
    ENVIRONMENT: stage,
    MODE,
    ...(stage === 'prod' ? { TARGET: gateOutput('target'), RESTORE: gateOutput('restore') } : {}),
    COMMIT: gateOutput('commit'),
    DIGEST: expr(`needs.${stage}.outputs.digest`),
    SERVICES: expr(`needs.${stage}.outputs.services`),
    SMOKE: expr(`needs.smoke-${stage}.result`),
    RESMOKE: expr(`needs.resmoke-${stage}.result`),
    PREVIOUS_COMMIT: gateOutput(`previous_${stage}_commit`),
    PREVIOUS_DIGEST: gateOutput(`previous_${stage}_digest`),
    ROLLBACK_SERVICES: expr(`needs.rollback-${stage}.outputs.services`),
  },
})
// Each step's env:, by its job and its name; a step not named sets none.
export const STEP_ENVS: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>> = {
  gate: {
    'The release, migration and restore records': GH_ENV,
    'The pull request that made this commit, and its checks': {
      ...GH_ENV,
      SHA: expr('github.sha'),
      MODE: expr('inputs.mode'),
      TARGET: expr('inputs.target'),
    },
    "main's ruleset is live": GH_ENV,
    'The environments are live as written': GH_ENV,
    Plan: PLAN_ENV,
  },
  synth: {
    'Synthesise the release': {
      MODE,
      RESTORE: gateOutput('restore'),
      BUILD: gateOutput('build'),
      COMMIT: gateOutput('commit'),
      GATE_DIGEST: gateOutput('digest'),
      BUILD_DIGEST,
    },
    "Check the release's assembly": { RELEASE: expr('steps.synth.outputs.release') },
    "Synthesise nonprod's previous release": {
      COMMIT: gateOutput('previous_nonprod_commit'),
      DIGEST: gateOutput('previous_nonprod_digest'),
    },
    "Check nonprod's previous assembly": { RELEASE: previousRelease('nonprod') },
    "Synthesise prod's previous release": {
      COMMIT: gateOutput('previous_prod_commit'),
      DIGEST: gateOutput('previous_prod_digest'),
    },
    "Check prod's previous assembly": { RELEASE: previousRelease('prod') },
  },
  nonprod: deployEnvs('nonprod'),
  'smoke-nonprod': smokeEnv('nonprod', false),
  'rollback-nonprod': rollbackEnvs('nonprod'),
  'resmoke-nonprod': smokeEnv('nonprod', true),
  'record-nonprod': recordEnv('nonprod'),
  'prod-plan': {
    'The release this job deploys': RELEASE_ENV,
    'Check the assembly': { RELEASE: RELEASE_OUTPUT },
    'Mask the account id': ACCOUNT_ENV,
    Diff: { MODE },
  },
  'prod-gate': {
    "Prod's release records": GH_ENV,
    "main's own CI": { ...GH_ENV, SHA: expr('github.sha') },
    'The prod gate': {
      MODE,
      TARGET: gateOutput('target'),
      SHA: expr('github.sha'),
      COMMIT: gateOutput('commit'),
      DIGEST: gateOutput('digest'),
      CURRENT_PROD_ID: gateOutput('current_prod_id'),
      BUILD_DIGEST,
      NONPROD_DIGEST,
    },
  },
  prod: deployEnvs('prod'),
  'smoke-prod': smokeEnv('prod', false),
  'rollback-prod': rollbackEnvs('prod'),
  'resmoke-prod': smokeEnv('prod', true),
  'record-prod': recordEnv('prod'),
}
const stepOutput = (step: string, name: string) => expr(`steps.${step}.outputs.${name}`)
const deployOutputs = {
  digest: expr('steps.push.outputs.digest || steps.release.outputs.digest'),
  services: stepOutput('readback', 'services'),
  readback: stepOutput('readback', 'readback'),
  deployed: stepOutput('readback', 'deployed'),
  services_started: stepOutput('mark', 'services_started'),
  replaced: stepOutput('aws', 'replaced'),
  attempt: expr('github.run_attempt'),
}
const rollbackOutputs = {
  rolled: expr('steps.done.outputs.rolled || steps.aws.outputs.rolled'),
  services: stepOutput('readback', 'services'),
  readback: stepOutput('readback', 'readback'),
  attempt: expr('github.run_attempt'),
}
// Each job's outputs:, by its job; a job not named has none. The gate's are the plan's, key for key.
export const JOB_OUTPUTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  gate: Object.fromEntries(
    [
      'mode',
      'target',
      'restore',
      'commit',
      'digest',
      'build',
      'nonprod',
      'prod',
      'current_nonprod',
      'current_nonprod_id',
      'current_prod',
      'current_prod_id',
      'previous_nonprod_commit',
      'previous_nonprod_digest',
      'previous_prod_commit',
      'previous_prod_digest',
      'rollback_nonprod',
      'rollback_prod',
      'first_nonprod',
      'first_prod',
    ].map(name => [name, stepOutput('plan', name)]),
  ),
  build: { digest: stepOutput('image', 'digest'), image: stepOutput('upload', 'artifact-id') },
  synth: {
    assembly: stepOutput('assembly', 'artifact-id'),
    assembly_previous_nonprod: stepOutput('previous-nonprod', 'artifact-id'),
    assembly_previous_prod: stepOutput('previous-prod', 'artifact-id'),
  },
  nonprod: deployOutputs,
  'rollback-nonprod': rollbackOutputs,
  'prod-plan': { attempt: expr('github.run_attempt') },
  'prod-gate': { current_prod_id: stepOutput('check', 'current_prod_id') },
  prod: deployOutputs,
  'rollback-prod': rollbackOutputs,
}
// Each step's id, by its job and its name; a step not named has none. With JOB_OUTPUTS and the pins on
// the runs that write them, every output a job hands on is its pinned step's, never one a step of its own
// takes the id of.
const deployIds = { 'The release this job deploys': 'release', 'What runs': 'aws', 'Push the image': 'push' }
const markIds = { 'Services are about to change': 'mark', 'Read back what runs': 'readback' }
const rollbackIds = {
  "This run's release and the previous one": 'release',
  'What runs': 'aws',
  'Read back what runs': 'readback',
  'Rolled back': 'done',
}
export const STEP_IDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  gate: { Plan: 'plan' },
  build: { 'Build the image': 'image', 'Upload the image': 'upload' },
  synth: {
    'Synthesise the release': 'synth',
    "Upload the release's assembly": 'assembly',
    "Upload nonprod's previous assembly": 'previous-nonprod',
    "Upload prod's previous assembly": 'previous-prod',
  },
  nonprod: { ...deployIds, ...markIds },
  'rollback-nonprod': rollbackIds,
  'prod-plan': { 'The release this job deploys': 'release' },
  'prod-gate': { 'The prod gate': 'check' },
  prod: { ...deployIds, ...markIds },
  'rollback-prod': rollbackIds,
}
const IDS = "names each step's id as STEP_IDS does, so every output a job hands on is its pinned step's"
// Each job's steps, in order, each by its name and, for a step that uses an action, the action (its pin is
// DPW-04's; a run step uses none). With STEP_ENVS, STEP_IDS and the pinned runs, no step of its own stands
// before, between or after them, in any job, credentialed or not: none can write GITHUB_ENV (a BASH_ENV
// that bash reads before a pinned smoke, gate or prod gate runs, say, and which no rule of the run itself
// would see), GITHUB_PATH or a file a later step reads, and none of the job's own steps is dropped or
// moved.
type Steps = ReadonlyArray<readonly [name: string, action?: string]>
const CHECKOUT_STEP = ["Check out the run's commit", 'actions/checkout'] as const
const NODE_STEP = ['Node, from .nvmrc', 'actions/setup-node'] as const
const CLI_STEPS: Steps = [
  ['The pinned CDK CLI'],
  ["The CLI is the registry's"],
  ['Mask the account id'],
  ['AWS credentials', 'aws-actions/configure-aws-credentials'],
]
const SMOKE_STEPS: Steps = [CHECKOUT_STEP, NODE_STEP, ['Smoke']]
const synthSteps = (release: string, assembly: string): Steps => [
  [`Install ${release}`],
  [`Synthesise ${release}`],
  [`Check ${assembly}`],
  [`Upload ${assembly}`, 'actions/upload-artifact'],
]
const deploySteps = (stage: Stage): Steps => [
  CHECKOUT_STEP,
  ['The release this job deploys'],
  ['Download the assembly', 'actions/download-artifact'],
  ['Download the image', 'actions/download-artifact'],
  ['Check the assembly'],
  ['The fast re-check'],
  ...CLI_STEPS,
  ['What runs'],
  ['Push the image'],
  ['Deploy Platform, Data and Tasks'],
  ['Migrate'],
  ['Services are about to change'],
  ['Deploy Services'],
  ['Roll back to the target'],
  [stage === 'prod' ? 'Take the restore stage down' : 'drill-break'],
  ['Probe'],
  ['Read back what runs'],
]
const ROLLBACK_STEPS: Steps = [
  CHECKOUT_STEP,
  ["This run's release and the previous one"],
  ['Download the previous assembly', 'actions/download-artifact'],
  ['Check the previous assembly'],
  ...CLI_STEPS,
  ['What runs'],
  ['Roll back Tasks and Services'],
  ['Probe'],
  ['Read back what runs'],
  ['Rolled back'],
]
export const JOB_STEPS: Readonly<Record<JobId, Steps>> = {
  gate: [
    CHECKOUT_STEP,
    NODE_STEP,
    ['The release, migration and restore records'],
    ['The pull request that made this commit, and its checks'],
    ["main's ruleset is live"],
    ['The environments are live as written'],
    ['Plan'],
  ],
  build: [
    CHECKOUT_STEP,
    NODE_STEP,
    ["Docker's containerd image store"],
    ['The PostgreSQL client'],
    ['Install'],
    ['The local stack'],
    ['The local database'],
    ['Build the image'],
    ['Check the image'],
    ["The image's migrate step"],
    ['Upload the image', 'actions/upload-artifact'],
  ],
  synth: [
    ["Check out the release's commit", 'actions/checkout'],
    NODE_STEP,
    ...synthSteps('the release', "the release's assembly"),
    ["Check out nonprod's previous release", 'actions/checkout'],
    ...synthSteps("nonprod's previous release", "nonprod's previous assembly"),
    ["Check out prod's previous release", 'actions/checkout'],
    ...synthSteps("prod's previous release", "prod's previous assembly"),
  ],
  nonprod: deploySteps('nonprod'),
  'smoke-nonprod': SMOKE_STEPS,
  'rollback-nonprod': ROLLBACK_STEPS,
  'resmoke-nonprod': SMOKE_STEPS,
  'record-nonprod': [['Write the record']],
  'prod-plan': [
    CHECKOUT_STEP,
    ['The release this job deploys'],
    ['Download the assembly', 'actions/download-artifact'],
    ['Check the assembly'],
    ...CLI_STEPS,
    ['Diff'],
  ],
  'prod-gate': [CHECKOUT_STEP, NODE_STEP, ["Prod's release records"], ["main's own CI"], ['The prod gate']],
  prod: deploySteps('prod'),
  'smoke-prod': SMOKE_STEPS,
  'rollback-prod': ROLLBACK_STEPS,
  'resmoke-prod': SMOKE_STEPS,
  'record-prod': [['Write the record']],
}
const STEPS =
  'runs the steps JOB_STEPS names, in order, each by its name with the action it names (a run step none): no step of its own before, between or after them, and none dropped or moved'
// No run of any job names a file command that hands a later step of its job something: GITHUB_ENV (a
// variable, BASH_ENV say, which bash reads before the next step's run), GITHUB_PATH (a folder searched
// first for every command) or GITHUB_STATE. Only GITHUB_OUTPUT (DPW-08's) and GITHUB_STEP_SUMMARY are
// written. Read in the whole run, comments included, so no spelling of the name passes. The file itself
// has a path of its own under the runner's temp folder, which no text test can name in every spelling
// (find reaches it by its folder): that route is closed by every run being pinned whole (PINNED_RUNS),
// and stays open only to the repository code build and synth run by design, so synth's own asset check
// holds only against deploy.yml's text, and each credentialed job's pinned ASSET_CHECK, in a job of its
// own (file commands don't cross jobs), is the check a deploy rests on.
const FILE_COMMANDS = /GITHUB_(?:ENV|PATH|STATE)(?![A-Za-z0-9_])/
const FILES =
  'names no GITHUB_ENV, GITHUB_PATH or GITHUB_STATE, in any job: no step hands a later one of its job a variable (BASH_ENV, say, which bash reads before a pinned run), a folder to search first or a state'
// A mapping as a block of its lines alone: a key whose value the reader reads as a mapping (a step's env:
// or with:, a job's env: or outputs:) holds nothing on its own line but a comment, since GitHub reads one
// expression there (env: ${{ fromJSON(…) }}) as the whole mapping, which the reader would read as none.
const INLINE_VALUE = /^\s*(?:-\s+)?[\w-]+:[ \t]*(?:[^\s#].*)$/
const inlineMappings = (lines: readonly string[], indent: number, keys: readonly string[]) =>
  lines.some(line => {
    const key = new RegExp(`^ {${indent}}(?:- )?(${keys.join('|')}):`).exec(line.replace(/^( {6})- /, '$1  '))
    return key !== null && INLINE_VALUE.test(line)
  })
const sameValues = (value: BlockValue | undefined, record: Readonly<Record<string, string>>) =>
  value === undefined || value === ''
    ? Object.keys(record).length === 0
    : isMap(value) &&
      [...value.values()].every(each => typeof each === 'string') &&
      sameMap(value as ReadonlyMap<string, string>, record)
const ENV =
  'sets only the environment variables the workflow uses, each to the value STEP_ENVS names (a job, STAGE alone): no BASH_ENV, PATH or NODE_OPTIONS, and no input from another step, job or context'
const OUTPUTS = 'outputs only what JOB_OUTPUTS names, each from the step it names'
const MAPPING =
  'writes env:, with: and outputs: as block mappings, never one expression GitHub would read as the whole mapping'

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
    const stage = STAGES[id]
    if (
      !onceEach(mappingKeys(job.keys.get('env')), ENV_KEYS) ||
      !sameValues(blockValue(job.keys.get('env') ?? []), stage === undefined ? {} : { STAGE: stage })
    ) {
      add(id, ENV)
    }
    if (!sameValues(blockValue(job.keys.get('outputs') ?? []), JOB_OUTPUTS[id] ?? {})) add(id, OUTPUTS)
    if (['env', 'outputs'].some(key => inlineMappings((job.keys.get(key) ?? []).slice(0, 1), 4, [key]))) {
      add(id, MAPPING)
    }
    const want = (JOB_STEPS as Readonly<Record<string, Steps>>)[id] ?? []
    if (
      steps.length !== want.length ||
      steps.some((step, index) => {
        const [name, action] = want[index] ?? []
        return step.name !== name || step.uses?.split('@')[0] !== action
      })
    ) {
      add(id, STEPS)
    }
    steps.forEach((step, index) => {
      const where = `${id} (${label(step, index)})`
      if (FILE_COMMANDS.test(step.run ?? '')) add(where, FILES)
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
      if (!onceEach([...step.env.keys()], ENV_KEYS) || !sameMap(step.env, STEP_ENVS[id]?.[step.name ?? ''] ?? {})) {
        add(where, ENV)
      }
      if (inlineMappings(step.lines, 8, ['env', 'with'])) add(where, MAPPING)
      if (step.id !== STEP_IDS[id]?.[step.name ?? '']) add(where, IDS)
    })
  }
}

const PREAMBLE_CDK = 'CDK="$RUNNER_TEMP/aws-cdk/package/bin/cdk"'
const ALLOWED_USES = /^(?:actions\/checkout|actions\/download-artifact|aws-actions\/configure-aws-credentials)@/
const REFUSED_CLI =
  /(?<![\w-])(?:--no-rollback|-R|--express|--hotswap|--hotswap-fallback|--import-existing-resources|--force|--all|--method[= ](?:direct|prepare-change-set|execute-change-set)|--revert-drift|--outputs-file|--parameters|--notification-arns|--role-arn|--toolkit-stack-name|--plugin)(?![\w-])|"\$CDK"\s+(?:synth|destroy|bootstrap|import|publish-assets|watch|migrate|refactor|gc|drift|context|acknowledge|init|rollback)\b/
const CLI_DEPLOY = /"\$CDK" deploy --app "\$ASSEMBLY" /
const CLI_DIFF = /"\$CDK" diff --app "\$ASSEMBLY" /

const PINNED_CREDENTIALED =
  'runs as written, whole and under its own if: (PINNED_RUNS): every run of a job that holds the deploy role, or the OIDC request token that gets it, so no line of its own reads, splits, prints or sends what the job holds or hands a pinned line another input'

// What the CLI is run with (DPW-10): deploy or diff, --app "$ASSEMBLY", --no-lookups and --no-notices, and
// for a deploy --require-approval never, --ci and --exclusively.
function cliLineIsSafe(line: string): boolean {
  const flags = ['--no-lookups', '--no-notices']
  if (CLI_DEPLOY.test(line)) flags.push('--require-approval never', '--ci', '--exclusively')
  else if (!CLI_DIFF.test(line)) return false
  return flags.every(flag => new RegExp(`(?:^|\\s)${flag}(?=\\s|;|$)`).test(line))
}

// DPW-10 (C11-D48, C11-D76): a credentialed job runs no repository code. Its uses: are only checkout,
// download-artifact and the credentials action; the CLI is fetched only by CLI_FETCH (mkdir, curl, openssl,
// base64 and tar only on its own lines, in its run whole), never by npm, which would read the repository's
// .npmrc and lockfile and, as the runner's npm 10 does, run a git dependency's prepare script, followed by
// CLI_CHECK, both before the credentials action; it runs no npm, npx, node, shell, source, eval, docker, tsx,
// ts-node, python, make, curl or wget (but CLI_FETCH's), db:reset, check-server, script by path or wrapper, nor
// anything outside its list; it defines a function only where a canonical text does, and calls only its
// own step's (a function doesn't outlive its step); it sets a variable by printf -v, read, mapfile or for
// only on SETTER_LINES, and never PATH, RUNNER_TEMP or another that chooses what runs; CDK is assigned
// only by the preamble, as the bin of the registry package CLI_FETCH unpacked; the CLI runs only as deploy or diff with --app
// "$ASSEMBLY" (set once in its step to the folder it downloaded), after CDK_FOLDER, with no other change of
// folder, and with its safe flags; no line anywhere passes a refused flag or subcommand; every run of it is
// one PINNED_RUNS pins whole, under its own if: (its CLI steps, the probe, AWS_CHECK's step and the checks
// before the credentials under this rule, the rest under DPW-08 and DPW-13), so none has a line of its own;
// and its own lines, the pinned texts' included, are read by SHELL_TABLE, each command held to GLUE_USES,
// and set no input a pinned line reads (SETS_INPUT). In every job, credentialed or not, its steps are
// JOB_STEPS' and no run names GITHUB_ENV, GITHUB_PATH or GITHUB_STATE (shapeOfJobsFindings). Across the
// repository no workspace is named aws-cdk or declares a cdk bin, and the lockfile's aws-cdk is the
// registry's tarball at infra's pin, by its fixed URL, with a sha512 integrity and no link.
export function credentialedCodeFindings(workflows: Texts, manifests: Texts, lockfile: string): Finding[] {
  const found = new Set<Finding>(canonicalTextFindings())
  const add = (where: string, rule: string) => found.add(at(DEPLOY, 'DPW-10', `${where}: ${rule}`))
  shapeOfJobsFindings(workflows.get(DEPLOY) ?? '', add)
  const jobs = jobsOf(workflows.get(DEPLOY) ?? '')
  // Every run of a credentialed job is one PINNED_RUNS pins whole, under its own if:, so none has a line
  // of its own: those it pins under DPW-10 are held here, the rest by the rule each names.
  for (const place of unpinnedRuns(jobs, 'DPW-10')) add(place, PINNED_CREDENTIALED)
  for (const { id, job, steps } of jobs.values()) {
    const credentialed = ENVIRONMENT_JOBS[id] !== undefined
    const jobEnv = blockValue(job.keys.get('env') ?? [])
    const jobNames = isMap(jobEnv) ? [...jobEnv.keys()] : []
    steps.forEach((step, index) => {
      const where = `${id} (${label(step, index)})`
      if (credentialed && step.run !== undefined && pinnedRunOf(id, step) === undefined) add(where, PINNED_CREDENTIALED)
      const run = step.run ?? ''
      const views = shellViews(run)
      const lines = runLines(run, views)
      if (lines.some(line => REFUSED_CLI.test(line.text)))
        add(where, 'passes none of the CLI’s refused flags or subcommands')
      for (const line of lines) {
        if (CDK_ASSIGNMENT.test(line.code) && line.raw.trim() !== PREAMBLE_CDK) {
          add(where, 'assigns CDK only in the preamble, as the bin of the registry package CLI_FETCH unpacked')
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
        const fetchLine = FETCH_TOOLS[word]
        if (fetchLine !== undefined) return run !== CLI_FETCH || raw(command) !== fetchLine
        if (/^["'$]|\/|\.(?:sh|ts|js|mjs|cjs|py)$/.test(word)) return true
        const use = TOOL_USES[word]
        if (use !== undefined && !use(command, raw(command))) return true
        return !(BASH_OWN.includes(word) || TOOLS.includes(word) || own.has(word))
      })
      if (
        wrong ||
        lines.some(
          line =>
            (RUNNER_WORDS.test(line.text) && !(run === CLI_FETCH && line.raw.trim() === FETCH_TOOLS.curl)) ||
            /\bdb:reset\b|\bcheck-server\b/.test(line.text),
        )
      ) {
        add(
          where,
          'runs nothing but bash’s own, its functions, gh api, git merge-base, jq, the text tools, aws, skopeo, the pinned CLI and CLI_FETCH’s fetch, and names no npm, npx, node, shell, source, eval, docker, python, make, curl or wget but that fetch, or script: no tool is handed a program to run',
        )
      }
      // Its own lines are read by the table, each command held to its uses.
      const refused = refusedAt(where, read)
      if (refused !== undefined) add(refused, AS_BASH)
      if (read.commands.some(command => !glueIsHeld(command, CANONICAL_CALLS))) add(where, HELD)
      if (setsAnInput(run, read, [...jobNames, ...step.env.keys()], pinnedRunOf(id, step))) add(where, SETS_INPUT)
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
    const install = steps.findIndex(step => step.run === CLI_FETCH)
    const cliCheck = steps.findIndex(step => step.run === CLI_CHECK)
    const credentials = credentialsAt(steps)
    if (install < 0 || cliCheck !== install + 1 || credentials < 0 || cliCheck > credentials) {
      add(id, 'fetches only the pinned CLI (CLI_FETCH, never npm), then runs CLI_CHECK, before the credentials action')
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
  // As CLI_FETCH reads it, so a lockfile it would refuse fails here first: the registry's tarball at infra's
  // pin, by its fixed URL, with a sha512 integrity and no link.
  if (
    entry === undefined ||
    typeof pin !== 'string' ||
    entry.version !== pin ||
    entry.resolved !== `https://registry.npmjs.org/aws-cdk/-/aws-cdk-${pin}.tgz` ||
    typeof entry.integrity !== 'string' ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity) ||
    Object.hasOwn(entry, 'link')
  ) {
    found.add(
      at(
        'package-lock.json',
        'DPW-10',
        "node_modules/aws-cdk is the registry's tarball at infra's pin, with a sha512 integrity and no link",
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
// required contexts, and sent with --input -; each record job is one step, with no action (so no
// checkout), running only bash's own, its functions (each called only as written), jq and gh api, and
// setting no input its env: or a pinned line reads; the release steps, the push, migrate with its record,
// the record jobs and every run of build and synth (each synth step in its own folder) are pinned whole
// (PINNED_RUNS), so the synth's words can't be quoted or aliased past the text rules (npm run-script, cdk
// synthesize, --context); and every run of a job that holds no credentials is one PINNED_RUNS names
// (UNPINNED; a credentialed job's are DPW-10's), so no run of deploy.yml has a line of its own. (Every
// deploy of a recorded digest checks ECR's tags for its commit inside AWS_CHECK, which DPW-06 pins.)
const UNPINNED = 'runs only what PINNED_RUNS pins whole: no run of deploy.yml has a line of its own'
export function releaseFindings(workflows: Texts): Finding[] {
  const found = new Set<Finding>()
  const text = workflows.get(DEPLOY) ?? ''
  const add = (where: string, rule: string) => found.add(at(DEPLOY, 'DPW-13', `${where}: ${rule}`))
  const jobs = jobsOf(text)
  const build = jobs.get('build')
  if (build === undefined || jobScalar(build.job, 'if') !== BUILD_IF || jobNeeds(build.job).join(',') !== 'gate') {
    add('build', 'runs only when the gate says so: a deploy, not a restore')
  }
  // The release, the push, migrate with its record and the record jobs, each run pinned whole.
  for (const place of unpinnedRuns(jobs, 'DPW-13')) {
    add(
      place,
      'runs as written, whole and under its own if: (PINNED_RUNS) and in its own folder: the build, the synth, the release, the push, migrate with its record and the record job, so no line of its own builds, synthesises, tags, migrates or records by another commit, context, task or environment, or runs, prints or writes what a rule reading the text would miss',
    )
  }
  // Every run of every other job is one PINNED_RUNS names too (a credentialed job's are DPW-10's), so no run
  // of deploy.yml has a line of its own, even a step JOB_STEPS were to gain without a pinned run.
  for (const { id, steps } of jobs.values()) {
    if (ENVIRONMENT_JOBS[id] !== undefined) continue
    steps.forEach((step, index) => {
      if (step.run !== undefined && pinnedRunOf(id, step) === undefined) add(`${id} (${label(step, index)})`, UNPINNED)
    })
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
    if (read.commands.some(command => !glueIsHeld(command, recordCalls(id)))) add(where, HELD)
    const jobEnv = blockValue(jobs.get(id)?.job.keys.get('env') ?? [])
    const envNames = [...(isMap(jobEnv) ? jobEnv.keys() : []), ...(steps[0]?.env.keys() ?? [])]
    if (setsAnInput(run, read, envNames, steps[0] === undefined ? undefined : pinnedRunOf(id, steps[0]))) {
      add(where, SETS_INPUT)
    }
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
