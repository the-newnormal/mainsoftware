// The deploy-workflow guard's rules (DPW-01 to DPW-14; C0.11, TECH-SPEC T24 items 20 to 23 and 28):
// what .github/workflows/deploy.yml must be, what every other workflow mustn't do around it, and the
// GitHub environments written as code beside it. deploy-workflow.test.ts proves each case on planted
// text, then holds the repository to it. Each case is one function taking the texts it reads (the
// workflows by path, the environment files, non-prod's holdsRealData, the manifests) and returning
// findings, `<path>: DPW-nn <rule>`, each naming a rule (and a job or step) and never a value.
//
// Beside the cases are the canonical texts the workflow pastes byte for byte wherever it runs them:
// the preamble, the CLI's folder, the CLI, image, asset and AWS checks, the one-off runs and their parts,
// the newest-release reader, the gates' reads of the CI runs and prod-gate's call, the fast re-checks,
// the CLI's lines, the push and the synth's lines, and every run of every job whole (PINNED_RUNS), so
// the workflow and its guard can't drift apart unseen. A shell text here is a raw template in which a
// backtick is written \` and a dollar-brace $\{, the one way it differs from the workflow's own text.
// Every action the workflow uses is pinned to the one commit ACTION_PINS (action-pins.ts) names, which CI
// proves against the action's own repository (scripts/check-action-pins.ts) in a job of its own that check
// needs, before any of the repository's code and with git reading no configuration, so no commit that exists
// only in a fork, which GitHub resolves under the action's name, runs in a job. The check reads deploy.yml's
// uses: itself too, as Node reads the file, and this guard and its tests import every module by its .ts
// file, in a scripts/ that holds no other module flavour (SHADOW_FILE), so the table the guard binds
// deploy.yml to under Vitest is the one the check proves. That job's own checkout and setup-node run before
// the check can prove anything, so they are held to PINS_JOB_ACTIONS, apart from ACTION_PINS, which a person
// proves by hand when they move, and ci.yml sets no env: or defaults: at its top, which would reach the
// check's step, and check no key of its own but needs, if, runs-on, timeout-minutes and steps, so nothing
// decides how its first step's exit 1 runs; and check and migrations are named by their ids alone, no job's
// name: either's, since GitHub reports a job, and the ruleset, the gate and prod-gate read one, by its name.
// The CDK CLI's pin check (scripts/check-cli-pin.ts) runs the same way, in ci.yml's job cli-pin that check
// needs, behind the same two held actions with no npm cache and before any of the repository's code, reading
// the manifest as the head commits it (round 12): in migrations it would run after npm ci and the migration order
// check, either of which could write over what it read. A checkout writes each file through every
// .gitattributes while the owner reads the blob: an ident attribute on infra/package.json checked out a lower
// CLI than its blob pinned, which CLI_FETCH read on main, and one on check-action-pins.ts made a comparison its
// blob held into one that never did (round 12's third iteration). Each job checks out into a folder below the
// workspace where setup-node runs node, npm and yarn, since Yarn 1 runs the program a .yarnrc's yarn-path names
// from the folder it runs in or any above it, and writes every file again as its blob before node runs
// (BLOB_RESET), since a drift check in node can't hold its own file; and since that reset also writes away the
// drift a deploy job's checkout of main would read, the CLI pin's step first refuses, in its own shell, a checkout
// whose regular files aren't HEAD's blobs byte for byte (CLI_PIN_DRIFT; round 12's third iteration, its second
// pass: an ident in infra/.gitattributes passed the job after the reset); no Yarn file stands in the tree
// (YARN_FILE); and
// every deploy.yml job but the build's checks out below its setup-node too (DPW-11), the gate, prod-gate and the
// smokes into REPO_FOLDER (round 12's fourth iteration: a .yarnrc decided both checks, the plan, prod-gate's
// verdict and every smoke).
// GitHub ties no run to the pull request that started it, so the gate reads the merged pull request's own
// ci.yml run as the newest at its head, from its head repository and branch, whose latest attempt started
// while it was open, and refuses a head another pull request from that branch shared (open at any moment
// while it was, or at its head commit) or whose pull requests it can't read whole (PULL_CHECKS); one that
// closed before it opened, at another commit, as Renovate's reused branch names leave, shares nothing. What
// stays is what GitHub's own required checks, which read a commit's checks by its sha, can't tell either: a
// re-run, inside that window, of a closed pull request's earlier run at the same commit, which needs the
// branch pushed back to that commit. ci.yml runs on a pull request's edited activity too, a change of its base
// among them, so the newest run tests the merge into the base it merges into (DPW-04 holds its triggers: round
// 12's third iteration, its second pass, where a retarget started no run and the gate read a run that tested the
// merge into the old base). .nvmrc, which chooses that job's Node and every deploy job's, is
// 24 alone (NVMRC), which every setup-node reads the same way, so no manifest read apart gives one job a
// Node on which a script's entry runs nothing and exits 0.
// Every run of a job that holds the deploy role, or the OIDC request token that gets it, but the account
// id's mask starts by stopping the runner reading workflow commands for the rest of its step (STOP_HEAD,
// the preamble's first lines), before the credentials action as after it, so no ##[add-mask] or other
// command in what it prints (the CLI's, aws's or skopeo's output, a template's text, what tar says of the
// build's image archive) hides a line of the log or the approver's diff or drops a job output, and no line of
// any run or canonical text but STOP_COMMANDS's two names the token that would resume them; before any download,
// each such job holds every artifact id it downloads, another job's output, to one number naming this run's
// artifact under the name its upload gives it, with a digest of upload-artifact's shape or none (ARTIFACT_NAMES),
// since download-artifact prints that name and the digest the upload recorded (which the uploading job's code
// chooses) in an action's step, which no stop-commands reaches, so no job's code names an artifact, or records a
// digest, ##[add-mask] or the like and drops services_started with it, and holds an empty id to the gate's word that this run makes no such artifact
// for the job (DUE_ENVS), so no job's code skips a download, and the checks and the diff that read it, by
// leaving its id empty; prod-plan
// diffs what every approval in prod deploys, against the stage as it read it first (PLAN_BASIS: each stack's status
// and last change, none still moving), which prod reads again before anything moves and goes on only while it
// reads the same, so no rollback or deploy another run made since, recorded or not, deploys under that approval,
// every deploy passing --no-previous-parameters so each template parameter
// deploys from the Default that diff shows (an SSM-typed parameter's names a parameter-store entry whose value no diff
// shows, so ASSET_CHECK holds every one to the workload's own entries and refuses Conditions, Mappings and a brace a
// dynamic reference could be joined from; an Fn::ImportValue or Fn::GetStackOutput reads another stack's output, another
// account's among them, as the stack deploys, which the diff shows only as a reference, so ASSET_CHECK holds every
// template to the intrinsic functions the workload's templates write, each in its own section, and refuses an export),
// a restore's too (DPW-08), a restore taken down read by PLAN_BASIS too and deploying only the stacks
// that diff showed (prod-plan outputs what it read of each, and down refuses before any deploy unless it reads the
// same), and writes the diff into its summary as an indented code block, which no line of a release's own text can end
// or turn into HTML that hides the rest; a credentialed run writes no file by a redirection but its outputs, its
// summary and /dev/null, and the diff in prod-plan's two diff runs alone, a > after && being a write of its own
// (round 12's fourth iteration, its second pass: &&>"$f" emptied the CLI), and every run, in every job, writes
// the summary and its outputs only by appending, expanding either file's name only as a >> target or tee -a's
// operand (appendsOnly(), its second pass: a > erased the gate's lines naming the records history.ts ignored; and
// round 12's lenses: a name holding the path, or cp, mv, dd, truncate or sed -i onto it, erased them too)
// (CLI_FETCH's and IMAGE_CHECK's tools write only their own folders, each on its own line: FETCH_TOOLS,
// IMAGE_TOOLS); and ASSET_CHECK holds every template to the
// workload's stacks write, each named in it, so none hands CloudFormation another template or a handler by reference
// (a nested stack, a stack set, a macro, a module, a registered type, a transform), which neither the CLI's diff nor
// the release check reads, or a grant the diff never shows (a role, user or group policy, whose statements the diff's
// IAM table reads under no principal, and an added resource's properties, which it never prints), holds every role
// to the keys the workload writes and the account's own boundary, so none attaches a managed policy by its ARN, which
// the diff lists by that ARN alone and never prints the statements of, and to inline policies of distinct names, since
// IAM keeps one document to a name while the diff shows both, holds every metadata entry of the assembly to the
// types the synth writes and the CLI's three annotations, so no stack tags (which an older CLI hands CloudFormation
// for every resource of the stack, in no template or diff) and no legacy asset reach the CLI, holds the one
// custom resource the workload writes, CDK's default security group handler, whose answer its handler decides at
// deploy time, to a Platform stack, its own function's zip in the staging bucket, that function's properties CDK's
// own and no others (no layer, environment, network or role elsewhere, so no other account's code runs before the
// handler, as a layer and AWS_LAMBDA_EXEC_WRAPPER would make it) and no value of its template that names it, so no
// handler of a release's own or another account's answers into a grant the diff shows only by an attribute's name
// (the handler's code itself is the release's own, as the image is: ASSET_CHECK holds a zip asset's key to 64 hex
// digits and .zip, never to the zip's bytes, which it doesn't read, and the CLI uploads nothing to a key already
// in the bucket, so the first release to upload a key decides what every later one naming it runs; what that
// code can do is its role's grant, which the diff's IAM table shows, so the function runs as its own unnamed role,
// trusted by Lambda alone, as a flow log delivers as its own, trusted by VPC flow logs alone, and a named role is
// trusted by ECS tasks alone: round 12's fourth iteration, where the handler run as the api's execution role
// printed, on a first create, as an honest release's function line beside that role's own grants), refuses a
// file asset whose id, which
// the CLI joins to the path it writes a packaged zip to or uploads one from, isn't its key's digits, and holds
// every resource to the property paths and forms the workload synth writes for its type (one jq object literal
// in its text), every ARN, account id and stage name in a template to the account and the stack's own stage, and
// each value a service acts on (a task's roles, image, logs, secret and tags and its one container, named server,
// which the canonical texts read by that name, the Services stack's three services, each on its own family, as
// AWS_CHECK and the records need them, a service's network, ECS Exec and
// target groups, a security group's egress, which must be there, and a rule's peer, a VPC endpoint's service and
// each statement of its policy, held to the organisation's principals and, but in prod until its reviewed change,
// its resources, the load balancer's attributes, a listener's and record's targets (a listener HTTPS on 443 with
// a certificate), a route's table, never an isolated subnet's, no subnet giving a public address, and in the
// restore stage no internet gateway, route, load balancer, listener, rule, target group, certificate or record, no
// group open to any address and no service behind a load balancer (round 12's fourth iteration, its second pass:
// prod's way in, copied into the restore stage under its own names, passed, the restore stage holding no rule of
// its own, which IAC-20 holds over CI's fake release alone), a parameter's stored value, a role's trust and, but in prod until that change, a task role's
// network perimeter, a tag's key, and each stack's outputs, which the one-offs, the release checks and the
// read-back read) to the synth's shape, since the stage's own code that writes them is rendered only for a real
// release and the diff prints an added resource as one line (a container's environment, command and health check
// stay the release's own, as its image is). And it holds the label the diff names each resource by, its
// construct path (or an artifact's logical id entry), never its logical id or name, in its resource lines and its
// IAM and security group tables: every path is under its stack, of plain construct ids (no line break), unique
// as the diff prints it (less its stage and a last Resource or Default: round 12's third iteration), its logical
// id's but for CDK's hash, and a role, security group, task definition or service carries the path
// its name, or what names it, gives it, so no release shows a grant on the api task role as one on the migrate
// task role's, or swaps two roles' ids and paths so the diff of a restore up or prod's first deploy reads byte
// for byte as an honest release's (round 12). That ties principals and groups; a grant's resource is labelled
// too, a Ref or GetAtt by its resource's path and a parameter by its logical id entry, which can read as a
// resource's path, tied to nothing CloudFormation resolves it to (a log group's name, a parameter's stored
// value). So no role names anything by a reference but the account's id, the template's VPC and its default
// security group, the only ones the synth writes there, and a grant names anything else by a literal ARN, which
// the IAM table prints whole (round 12's second iteration); and a template holds one VPC at most, at the synth's
// path, since every rule that reads the template's network held a VPC by its type alone and a second VPC at
// <stage>/Platform/Network/Vpc printed as the workload's own, so a condition naming it, or a flow log moved to it,
// read in the diff byte for byte as the workload's (round 12's third iteration). And a template's rules and
// parameters take CDK's own ids alone (its bootstrap version check, its bootstrap version and its SSM parameter
// values), which no resource takes, nor an output's id: the CLI labels each other id of the release's template by
// its first logical id entry, and a resource the release removes by that label when the release reuses its id,
// so a removed api task role printed its destroy line and its trust under the bastion's label, through a rule the
// non-strict diff never shows or a parameter (round 12's third iteration, its second pass).
// protect-environments.sh, which the gate runs as a file, has its first line (the interpreter) held whole
// and its head read as bash reads it, so no shebang or line JavaScript calls a comment skips its refusal; and
// the code the gate's check runs, from its first code line to its end, is pinned whole by its SHA-256, since
// the tests run it with neither the gate step's environment nor a gh that answers, so no line keyed on what
// they differ in can pass the gate's check over environments that have drifted.
//
// The workflow is read through workflow.ts, which refuses each shape it knows it can't read (DPW-02), and any block
// scalar but a run:, whose last line break GitHub keeps in the value and the reader drops. Each run is
// read twice. Its own lines, every line outside a canonical text standing whole, are read by readShell()
// through SHELL_TABLE, an allowlist of the shell forms the workflow uses (blanks, word characters, quoting,
// expansions of names bash neither sets nor reads for itself, so never $_, which holds the last word of the command
// before, substitutions, operators, redirections after a command's word alone, since bash takes 2>/dev/null set as
// set's, keywords, tests, case patterns, functions, assignments and builtins as it holds them), so any form the
// table doesn't name is refused at its line (DPW-10 in a credentialed job, DPW-13 in a record job, DPW-07 in
// every other), whatever it is, while a form it names that bash or jq reads otherwise is a gap in it, behind the
// owner's read of the changed line (the last paragraph); each command it reads in a credentialed or
// record job is held to the flags and arguments the workflow uses (GLUE_USES: a jq or gh program one whole single-quoted string, read as jq
// tokenises it, so a string defines and binds nothing, and no name it defines or binds, nor any word it runs, is one
// that reaches outside it (env and $ENV, input, include, import, debug and the rest, JQ_REACH_NAMES), a name a key
// only straight inside braces (in .[0, env:1] env is a slice's start jq runs), no word bash hands on as several
// ("${NAME[@]}") to any command but aws, as a list option's values, tr and sed
// only as prod-plan's diff summary's, every aws word as aws reads it, an expansion in an aws value only as one of the words the workflow writes there,
// whole, a canonical text's function or a record job's own only as the workflow calls it, standing alone,
// outside any substitution, pipeline, negation, and-or list or condition, so its refusal ends the step, as
// every job's call of a check does, the synths' too, and each deploy of the CLI and smoke.ts does, but the
// drill's if: round 12's fourth iteration, where a group's } || STATUS=$? went on past a failed deploy or
// smoke; and prod-plan's diff runs, the one form exempt, held to it, each ending with exit "$STATUS" standing
// alone after its diff lines' wrappings, its STATUS and DOWN_STATUS set only as the committed texts set them
// (diffFormHolds(): its second pass, where the rollback diff with no exit, or the diff ending exit
// "$DOWN_STATUS", ended prod-plan green after a failed diff), no line of its
// own sets an input a pinned line reads (its step's or job's env:, a canonical text's variable, REGISTRY or
// RUN, ACCOUNT_ID, or a name an aws value reads or the read-back builds one from but by the commands
// AWS_VALUE_LINES writes, each from AWS's answer to a call by the stage's names, never a stack's outputs, and
// never vouched for by its own pinned run), and none, in any job, expands a name the run doesn't own (its
// step's or job's env: but GH_TOKEN, what it sets itself but a name the runner hands a step, and the runner's
// outputs, summary, folder and run ids), an array's elements' names among them (round 12's second iteration:
// SEEN=("$ACTIONS_ID_TOKEN_REQUEST_TOKEN") read none and made the token a name of the run's own), so neither the
// OIDC request token the runner hands every run step of a job with an id-token nor the job's token is handed, in
// any form the table reads, to a tool that could print it in pieces; nor does a canonical text make a name a step's
// env: gives from a secret its own by setting it (round 12's fourth iteration, its second pass:
// ACCOUNT_ID="${ACCOUNT_ID:-}", the set -u default, then printed the account id in halves). The wiring between the runs is pinned too: every job's steps are the guard's, in order, by name and
// action (JOB_STEPS), so no step of its own stands before a pinned run in any job, and no run of any job names
// GITHUB_ENV, GITHUB_PATH or GITHUB_STATE, which would hand a later step a variable (BASH_ENV, say), a path or a
// state; every env: and every job's outputs: is the guard's, whole (STEP_ENVS, STAGES, JOB_OUTPUTS),
// written as a block mapping and never as one expression GitHub would read as the whole mapping, every
// action step's with: is the guard's, whole (STEP_WITHS: no checkout but the three synths' names a ref, one to a
// job, each its own commit into its own folder, the gate's, prod-gate's and the smokes' check out into
// REPO_FOLDER and every other's into the workspace, and no job checks out two commits, so no
// runner that synthesises or reads an assembly runs a second commit's code), every step's id is the guard's
// (STEP_IDS), so no step of its own answers for a pinned step's outputs, and every steps.<id> and needs.<job>
// an expression reads is bound to what writes it (bindingFindings(): a step of the job, before a step that reads
// it, writing the key on a code line that opens the value with <key>= after a quote or a printf \n and writes it
// to $GITHUB_OUTPUT, by its own redirection or tee or a group's closing } >>"$GITHUB_OUTPUT" (round 12's third
// iteration: echo "services_started=true" | mask wrote nothing), never in a comment or a longer key, and a job the
// reader needs, its result or one of its outputs), since GitHub reads any
// other as '' with no error, so a step's id, a job's output or a run's key renamed with the table that pins it
// can't leave services_started, replaced or rolled empty and the pipeline's rollback off (round 12; replaced from
// its second iteration, whose write AWS_CHECK's comment named), and the step whose id each deploy job's
// services_started output reads stands before its Deploy Services, Roll back to the target, drill-break or Take the
// restore stage down, Probe and Read back what runs, read as written, never through JOB_STEPS (DPW-08, round 12's
// second iteration: moved after the Probe with JOB_STEPS, GitHub's default success() skipped it once the Probe
// failed, so a release whose probe failed stayed live with no rollback), and writes services_started on one code
// line, echo "services_started=true" >>"$GITHUB_OUTPUT", as each rollback job's last step writes rolled=true, the
// values the rollback's and the resmoke's if: compare, read as written (DPW-08, round 12's third iteration, its
// second pass: written as the run's attempt, as yes or as "true ", it read as not 'true', and no rollback ran),
// and so are
// every job's if: and needs: and every action step's if:, whole (JOB_IFS, JOB_NEEDS, ACTION_IFS), so no
// decision GitHub makes about running a job or a step (an automatic rollback, say) is read only in part;
// each run a gate, an approval, a smoke, a rollback or a record rests on is pinned whole with its step's if:
// (PINNED_RUNS), so no line of its own or if: ends or skips one early, writes an output, a file or a record
// of its own, or hands it another input (a record job's COMMIT:DIGEST and SERVICES, and their previous
// release's, being its smokes' RELEASE and read-back's job as the workflow writes them, its SMOKE and RESMOKE its
// smoke's and resmoke's results as written (its second pass: SMOKE from the deploy job's result recorded a release
// whose smoke failed as deployed), and a rollback's REPLACED
// its deploy job's replaced output, each compared as written: round 12's fourth iteration, where github.sha and
// the gate's current release, each equal to what it replaced on a push, read otherwise in a dispatched
// rollback), and in a record's writer no line but the guard's own literals
// (RECORD_JOB_LINES, migrationRecordLines()) sets a name, runs jq or calls gh, so no line the pins admit
// rewrites what a record says; and so is every other run of every job, the five that hold the
// deploy role and build's and the synths' (each release on a runner of its own) included, so no run of
// deploy.yml has a line of its own at all, and the table and the text rules are a second layer there (a
// word bash joins from quoted or expanded parts, or npm's own aliases, would pass a rule
// that reads the text), behind the owner's read of any change to a pinned run (the last paragraph); outside
// build and the synths only a pinned run writes an output. The CLI's own lines are held to the words the
// canonical lines write (CLI_WORDS: its stacks and its flags, each once), never by a list of names to refuse,
// since its yargs reads every option by a short alias too and options no list named (--build, a shell command
// it runs with the job's environment, a diff's --security-only), and every variable in its environment whose
// name starts with CDK, underscore or not (CDKBUILD as CDK_BUILD), as the option the rest of its name spells, so
// no env: and no credentialed run names one but the preamble's two. Which stacks each line names is held to
// literal sets too (CLI_STACKS), never read from the lines: a deploy never takes every stack, and prod deploys
// only the stacks prod-plan's diff for its mode names. Build and the synths
// still run repository code by design (the install, the synth, the image), which could write a later step's
// file by its folder, so a synth's own asset check holds only against deploy.yml's text: each credentialed
// job's ASSET_CHECK, pinned in that job, is the check a deploy rests on. The image archive the build
// uploads is data the same way: nonprod and prod each list it and unpack it themselves, before the
// credentials action (IMAGE_CHECK), handing GNU tar the archive on its standard input, where it refuses a
// compressed one rather than run the decompressor its first bytes name, and skopeo copies only from the
// folder they checked, never from an archive it would unpack itself, writing a member through a link another
// made (over the CLI, say).
// Every other workflow's jobs call only a workflow of this repository at the same commit, which every rule
// reads, and hand it no secret, and every step of every workflow is an ordinary one, of the keys workflow.ts
// reads, never a step group or a background, wait or cancel step, whose steps or kind no rule reads, and names
// another repository's action (owner/repo@ref), never one of this repository's (./, .\ or $/, or this repository
// by its owner/name, which the tests read from GitHub's GITHUB_REPOSITORY or the origin remote, an old name GitHub
// still redirects after a rename being the residual), nor one in any repository's .github folder or by a path with
// a . or .. segment or a \, which the runner keeps and joins to the folder it fetched, whose action.yml
// no rule reads and no owner's read covers, or a docker:// image (a remote action's own steps are read by no rule
// either, behind the owner's read of its uses: line); no workflow line ends in a blank, which workflow.ts reads
// as gone from a block scalar's line of blanks while YAML keeps it; an environment: is a scalar on its own
// line, never a mapping, whose deployment: false would have GitHub record no deployment for the job; and every
// workflow is at most 500,000 bytes (workflowSizeFindings()), since GitHub starts no run of a workflow file over
// 500 KB, and no workflow's name holds an @, so the path before a run path's first @ names its file exactly, as
// the gate's and prod-gate's reads of ci.yml's runs take it (round 12's fourth iteration: a ci.yml@x.yml read as
// ci.yml), and the two runs ci.yml's held jobs run are literal block scalars (literalRun(): its second pass, where
// the pins check written run: >- read as PINS_RUN here while YAML folded it into one printf that never ran the
// check): deploy.yml is over 500 KB as committed, so no run of it starts until the owner's change to its structure
// (TECH-SPEC T24 item 20), and the tests name it as the one finding until then. GitHub reads a workflow's blob as
// git holds it, and the owner reads every file's, while the rules, CI and the deploy jobs read the checkout, so no
// tracked file carries a git attribute, as the working tree's or the index's .gitattributes gives it
// (gitAttributeFindings() over gitAttributes(), which asks git check-attr both ways, since a checkout reads the
// index's first: a working-tree-encoding wrote a NEL, which GitHub breaks a line at, as a byte the rules read as
// U+FFFD, hiding every line after it in a comment, eol, text, ident and filter rewrite a file too, and a
// .gitattributes that gave itself an encoding checked out as text the working tree's reading can't parse), and the
// rules read the bytes GitHub reads (round 12; every file from its third iteration). A
// canonical text is read whole, so it is held instead, behind the owner's read of any change to it (the last
// paragraph says what that read holds), to bash's own reading of it (readsAsBash(), which refuses a backslash at a
// line's end anywhere in the text, quoted or not, since in double quotes bash removes it with the line break and
// joins a $ to the next line's (, { or ((, which the code view writes as quoted text, and an unquoted $ that ends a
// brace expansion's alternative, since bash makes {$,}NAME into $NAME before it expands it, and a # after more ((
// or [[ than )) or ]], which bash reads as text inside an arithmetic command or a regex's group, running what
// follows on its line, any unquoted (( but $((, and a $(( whose inner ( doesn't close with )), or any <(( or >((,
// which bash reads as a substitution holding a subshell whose command no rule here would read, and an & that runs
// the list before it in the background, where a refusal's exit 1 ends a subshell alone and set -e never sees it:
// round 12's third iteration; and a then, do, else or elif straight after ]], ) or }, a for NAME do and a
// function whose body isn't a { … } group, each where bash starts a command the reader reads none: round 12's
// fourth iteration; and an append before a command's word, NAME+=, or redirections written with no blank between
// them, read as no prefix, and a function's body counted to a } that was an argument or escaped, each hiding a
// command or an exit: its second pass), to ending a step or a function only by a literal status, opening no
// subshell where a
// command starts and refusing inside no substitution (verdictLines(): a refusal's bare exit after echo … | mask,
// and ( … ) || echo around PROBE's call, each ended the step with 0: round 12's fourth iteration; and an exit, or
// a call of a function that exits, in a $( … ), <( … ) or >( … ) ends that subshell alone, so : "$( … ||
// aws_refuse …)" went on with 0: its third iteration's second pass), to evaluating
// only what it sets itself (outsideEvaluations(): every arithmetic, test operator, subscript, name a builtin takes,
// descriptor's variable and variable bash evaluates, a default or an element's assignment counting as the name's, a
// name arithmetic re-reads as an expression counting only when it is lower-case, assigned before that site and, if
// a for loop sets it, given numbers alone (never REPLY, MAPFILE, _ or a loop's words), and a number wherever every
// other canonical text and pinned run sets it and set by no env:, since the texts run joined in one shell and bash's
// variables are the shell's, not a text's (an assignment's value read to its word's end, so $((0))$y is none), a
// setter builtin's words read to its command's end past its redirections (>&, <&, &> and >| among them), read's
// line read to its end and a for loop with no in list setting its name from the positional parameters (round
// 12's fourth iteration: for version; do evaluated each argument of a helper), a
// [[ test read to its real ]] wherever a ${…}, $(…) or parenthesis holds one, a [ or test with a word bash could
// split, glob or expand a tilde in, that expands to several ("$@", "${a[@]}"), holds a backslash outside quotes or
// is an operator in quotes ('-v'), whose ] isn't its command's last word and only ], or that stands where no shape
// check reads it (after a redirection, an assignment, run or get) counting as a site, and a line it can't read
// that plainly is refused), to expanding only a name it
// sets, one its step's or job's env: gives from no secret or token, the one-offs' TOKEN, the assembly's folder,
// prod-plan's diff file or the runner's outputs, summary, folder, run ids, address and commit
// (foreignExpansionLines(), DPW-07), so no canonical text prints, in any form these rules read, the OIDC request
// token or another credential its job holds, to running only the commands CANONICAL_COMMANDS names and the
// canonical texts' functions, each by a plain word, each function defined once by a plain lower-case name of its
// own that no builtin, keyword, command or other text has, nor command_not_found_handle, which bash runs for a
// command it can't find and takes the status of (functionNameLines(): bash finds a function before a builtin, so
// an exit() would make every later exit 1 carry on), with no environment of its own (canonicalCommandLines():
// export only on its listed lines, no flag to local or export, set only as -euo pipefail, no assignment before
// a command but IFS's before read, read only with -r after IFS= or IFS=$'\t' and mapfile only with -t, so no
// backslash in what a loop reads joins two lines or escapes a character (readerLines()), no assignment, in any
// spelling, to one of bash's own variables
// (SHELL_TABLE.bashVariables: EXECIGNORE, which hides a command from bash's lookup, GLOBIGNORE, PS4 and the rest)
// but IFS's before read, no wrapper, and
// no name read, mapfile, printf -v or a for loop sets that is PATH, HOME or another loader's, so no TAR_OPTIONS or
// other variable a held tool reads reaches it, nor one a rule holds to its one line (HELD_NAMES: CDK, ASSEMBLY,
// DIFF, STAGE) set in any spelling but the preamble's CDK line, nor an AWS_ name or ROLE_TO_ASSUME set in any
// spelling, which the credentials action exports for every later step: round 12's third iteration), and to every
// program it runs being held by what it
// is handed (canonicalToolLines()): jq and gh only their held flags, as bash reads each word, a program written on the
// line (each word of jq's that reaches outside it, env and $ENV among them, read wherever jq would, so -env.X, jq's
// negation of env.X, is one) and, for jq, only data the seven words JQ_FILE_WORDS writes, whose names (dir, file,
// template and those they're built from) only ASSET_CHECK's own lines set and its loops' own done lines feed
// (fileNameLines()); printf only a single-quoted format whose one conversion is %s (never %n, which sets the
// variable an argument names) and a plain -v name, never one built from an expansion; aws
// only the calls and options the workflow uses (never --endpoint-url, --no-verify-ssl, --ca-bundle, --profile or
// --debug), one value to each option but a list's, so no expansion in a second word hands aws an option, and a value
// that expands only as one of the words the texts write there (AWS_TEXT_VALUE_WORDS, each from a name a text
// checks against its shape or builds with jq), never one naming a scheme, so no value read from a stack's output
// reaches an option aws would load from a file on the runner (file://) or fetch; tee only
// appending to the summary; no word of these bash splits, globs or expands a tilde in (~- is OLDPWD and ~+ PWD,
// wherever bash expands one, a ${…}'s default and a double-quoted replacement among them), nor any that expands to
// several words but PROBE's task list
// and ASSET_CHECK's list of templates; and every other program CANONICAL_COMMANDS names (grep, wc, readlink,
// realpath, git, node, sort, sleep, mktemp, cd and pwd as much as sed, tar, find, curl, openssl, base64, mkdir and
// sha256sum) only on its lines as the guard writes them, as is any read of a file by a redirection, glued to the
// word before it or not; the lines the
// tool holds compare against (TOOL_LINE_TEXTS) are the guard's own literals, never read from a canonical text, so a
// text can't widen what it is held to. What a variable a held line names holds is the text's own, set from AWS's
// answers, the job's env or a literal in every text the guard writes, which a change to the text shows; each name
// an aws value expands, and each it is read from, is set only on its text's own lines (AWS_NAME_LINES, the
// guard's literals) and read only in its own loop (awsNameLines(), a text that writes a do or done anywhere but
// at a line's start or after a ; having every setter refused, since bash also ends a loop's list at one after &, a
// subshell's ) or a group's }: round 12's third iteration), and a function's argument reaches one only
// from that function's own calls, each as the guard writes it (AWS_ARGUMENT_CALLS), so a change that sets one from
// another source, a stack's outputs among them, changes the guard's list as well as the text; a change that drops a
// value's shape check is the owner's read's to catch, and so is what a credentialed text prints of an answer get
// kept (an echo of it, say), which no rule holds: every committed print goes through mask, and the runner's
// redaction of the account id's secret, MASK_RUN's ::add-mask:: and the credentials action's own mask keep the
// account id out of the log whatever is printed (round 12's third iteration).
// A jq handed -e, in a canonical text or a run's own line, is given a program that prints one value
// (jqPrintsOne()), since -e takes jq's status from the last value alone: a check over each entry written X[] | f,
// jq's usual idiom, reads in a diff as all(X[]; f) but holds the last entry alone, so outside what all, any,
// first, map or an array it builds collects, a program iterates nothing, writes no comma between values and names
// only JQ_ONE_NAMES and its own definitions that hold to the same (a [ after an object's } iterates it, so
// {a: X, b: Y}[] prints two); DPW-14's cases also plant each per-entry breakage in an entry that isn't its
// list's last, and run ASSET_CHECK over the real builds with a jq that notes any -e call printing other than one
// value. jq also runs its program once for each value it reads, so a jq -e fed a stream holds its last value
// alone whatever its program prints: no jq -e is fed by a pipe unless it is given -n or -s (JQ_PIPED_RULE,
// jq -c '.[]' <<<"$X" | jq -e 'f' among them; round 12), and none is given more than one file, or
// "${stackfiles[@]}", unless it is given -n or -s, since jq reads each file as inputs of its own and -e holds the
// last file alone (round 12's second iteration); and, since what matters is where it reads and not whether a |
// stands before it, a canonical text's jq -e reads one file or a here-string on its own command unless given -n
// or -s, never its standard input otherwise, and a run's own jq that reads no here-string of its own counts as
// piped (round 12's third iteration: a comment after the |, a helper its caller pipes into, a group, get or
// < <( … ) fed AWS_CHECK's every count is one a stream), a process substitution being a file it is given, never a
// redirection, and a here-string its input only as the last redirection of descriptor 0 (its second pass: <( … )
// after the one file, and < <( … ) after the here-string, each fed jq a value its line didn't show). And a jq given
// -n is handed no data at all, no file, here-string, input redirection or pipe (JQ_UNREAD_RULE, jqIsHeld()), since
// it reads none and checks null: jq -ne '…' "$dir/$file" passed whatever the template held (round 12's fourth
// iteration, its second pass). A here-string
// holding several JSON texts is read the same
// way, which no rule reads: the texts' here-strings hand jq a value read whole from AWS, GitHub or an earlier jq, a
// variable built of several (by += or from jq -c '.[]') being the owner's read's to catch; each file is an
// assembly's, which the CLI parses as one JSON text.
// Beside that, the regex reader shellViews() and shellCommands() still reads every run as a second layer
// that only ever adds a command: it sets aside what bash reads as data (comments, quoted text outside its
// command substitutions, a test's operands and a case's patterns, outside the command and process substitutions
// in them, which bash runs there too: round 12) and reads through what comes before a
// command (an assignment, a redirection, a wrapper such as exec, command or env), so a word a rule forbids
// as a command is found where bash would run it and not where it is a jq path, a message or a URL, and a
// group's { where a command starts is read as the keywords are, so the group's first command is read as the
// command it is (true || { tar …; } hid its tar as the tail of a command named {), and an unquoted ${ … } closes
// at the first } bash closes it at, a bare { inside it opening nothing (${mode:-{})} closed a brace late and
// read a command after it as quoted text), and a ${ … } holding a ;, ( or ), or an unquoted \( or \), is no
// shape it reads, since its case scanner counts those to find an item's end and a pattern's ) (round 12); a ! or
// { starts a command only as a word of its own, as bash reads them, and a ${ … } holding a | or & (or, in double
// quotes, where its body may hold blanks, a !, { or line break), or an unquoted backslash before a ;, &, |, !,
// {, < or >, is no shape it reads either, since a command start read there began a [[ or case whose operands or
// patterns it blanks (ready! [[, plan.{ [[ and plan\;[[ hid the commands bash ran after them); and a
// redirection's target before a command's word is a word of joined parts, as bash reads it, so <<<"$step"'' or
// >&2'' hides no command after it (round 12's second iteration); a ! or { starts a command only where a command
// starts, in the chain after a boundary as the keywords do, and a function definition's head before its body's {,
// so echo x ! [[ hands echo two words and hides nothing (round 12's third iteration); the | of >| is a
// redirection's, never a boundary, so a [[ as its target is no test (round 12's fourth iteration); a test starts
// only at the word [[, a blank or ( after it, as bash's reserved word does, and a case pattern holding the word [[
// is no shape it reads, since bash reads it there as a pattern (a pattern [[:lower:]_]*) read as a test blanked to
// a later ]] past its ), and every command up to the next unmatched ) anywhere, the esac and lines after it among
// them, read as pattern: round 12's third iteration, its second pass); the words no
// credentialed
// job may name at all
// (an interpreter's, say) are found anywhere outside a comment.
// An if: is read by evaluateIf(), which asks whether any value it doesn't know could let a bot, a drill or
// a failed job through, or a rollback the gate refused or after its release passed, beside the pins that
// hold every if: whole. This file decides who and what may deploy, so it is on the owner's-read list
// (C11-D74).
//
// What holds a change to a pinned text. Every run in deploy.yml is pinned whole, its glue lines and the
// canonical texts inside it alike, and so are its jobs' if: and needs:, their steps, env:, with: and outputs:,
// so any change to what deploy.yml runs changes this file's constants and deploy.yml together. Both are on the
// owner's-read list, as are every other workflow, the environments, protect-environments.sh, the pins check
// and the files this guard reads its rules from (action-pins.ts, workflow.ts, repo-files.ts and imports.ts,
// beside this one), so the owner reads every changed line as written. The rules
// here read bash, jq and GitHub's YAML and expressions, which no reader short of the real one models whole, so
// over such a change they are a second layer behind that read. They catch a form an author could write by
// mistake, or that reads as harmless in a diff: an unquoted expansion, a value carried from one place into
// another's arithmetic, test, command or aws value, a refactor that reads a value from a stack output, an
// artifact or another step where it read AWS, a helper that passes its arguments on, an idiom whose effect
// only bash's or GitHub's rules show. A construct written to get past them or to do harm (a credential renamed
// as the run's own, a jq program reaching the environment or a module, a string spelt to look like a
// definition, a builtin setting a name the text then writes through, a subscript or callback after a
// redirection, a path built to climb out of its folder, a line that resumes workflow commands, a form chosen
// to hide a command) is held by the owner's read of the changed lines, which the rules don't replace. So where
// this file says a run, a workflow or a canonical text does, or can't do, something, it means as these
// constants pin it and in every form these rules read. Nothing that needs no such change leans on that read:
// the checks over what code off the owner's-read list builds or renders and over what AWS, GitHub or an
// artifact answers (ASSET_CHECK, IMAGE_CHECK, CLI_CHECK, ARTIFACT_NAMES, the read-back's schema, the smokes),
// and a defect in these files as committed, keep their full claims.
import { createHash } from 'node:crypto'
import { ACTION_PINS, PIN_SHAPE, PINS_JOB_ACTIONS } from './action-pins.ts'
import {
  type BlockValue,
  blockScalarProblems,
  blockValue,
  commentLines,
  concurrencyOf,
  expandRunAliases,
  indicatorProblems,
  jobConcurrency,
  jobEnvironment,
  jobNeeds,
  jobPermissions,
  jobScalar,
  literalProblems,
  literalRun,
  parsedSteps,
  permissionsOf,
  type RunAnchors,
  type RunsWrittenOut,
  runAnchors,
  shapeProblems,
  type WorkflowJob,
  type WorkflowStep,
  workflowJobs,
  workflowTop,
  yamlLines,
} from './workflow.ts'

// A shell text written as a raw template: \` stands for a backtick and $\{ for a dollar-brace, which a
// template can't hold as written; nothing else changes.
function sh(strings: TemplateStringsArray, ...values: readonly string[]): string {
  const raw = strings.raw.map(part => part.replaceAll('\\`', '`').replaceAll('$\\{', '$' + '{'))
  return String.raw({ raw }, ...values)
}

// --- The canonical texts ------------------------------------------------------------------------------

// The preamble's first command (DPW-07, the fifth review's fourth attack): the runner reads ##[name] anywhere in a
// line, and ::name:: at its start, as a workflow command, on stdout and stderr, and drops a line it
// processes from the log. add-mask, one of them, is job-wide: it hides its value in every later line and in
// the step summary, and the runner drops any job output whose value it would change. The CLI prints a
// template's description, outputs and properties as they are, so a release's own template could hide what
// prod-plan's diff shows the approver, or drop services_started and with it the pipeline's rollback. So the
// step stops reading commands before anything runs, under a token of its own (which the runner masks), and
// reads none for the rest of the step; the account id's mask is its own step's, before.
export const STOP_COMMANDS = sh`stop_token=$(openssl rand -hex 16)
echo "::stop-commands::$stop_token"`
// The stop token is named on STOP_COMMANDS's two lines alone, in every run and every canonical text: made there
// and printed once, as the command that stops the runner reading workflow commands. A line that named it anywhere
// else could print ::<token>:: and resume them, so a ##[add-mask] in what the step prints after (a release's own
// template text in prod-plan's diff, say) would hide a line of the approver's diff (the eighth review's second
// attack). No spelling these rules read reaches it but its name: a canonical text and a run's own lines have no
// ${!…}, eval, declare -p or bare set, whatever stands before it, and no $_, which holds the echo's last word, the
// token among it, after STOP_COMMANDS (_ is one of bash's own variables, which no line assigns and no run's own line
// expands, the ninth review's third attack); a line written to reach it another way is the owner's read's (the
// header's last paragraph).
// The two lines are written here as literals, never read from STOP_COMMANDS, so a third line added to it is one
// of neither.
const STOP_TOKEN_LINES: readonly string[] = [
  'stop_token=$(openssl rand -hex 16)',
  'echo "::stop-commands::$stop_token"',
]
export function stopTokenLines(text: string): number[] {
  return text
    .split('\n')
    .flatMap((line, n) => (line.includes('stop_token') && !STOP_TOKEN_LINES.includes(line.trim()) ? [n] : []))
}
const STOP_TOKEN_RULE =
  "names the stop token only on STOP_COMMANDS's two lines, where it is made and stops the runner reading workflow commands, so no line prints ::<token>:: and resumes them"

// The first lines of every run of a job that holds the deploy role, or the OIDC request token that gets it,
// but the account id's mask (DPW-07): set -euo pipefail, then STOP_COMMANDS, before anything the run reads
// or prints. The runs before the credentials action read what other jobs made, which repository code can
// shape (the build's image archive, whose pax headers GNU tar names on stderr as they are, the synth's
// assembly, the records), so they stop reading commands as the runs after it do; a stop lasts only its own
// step, so the mask's step still adds its mask. An action's own step (download-artifact's, which prints each
// artifact's name) is out of its reach, so ARTIFACT_NAMES holds those names before any download.
export const STOP_HEAD = sh`set -euo pipefail
# The runner reads a line holding ##[name] anywhere, or starting with ::name::, as a workflow command
# (add-mask among them, which hides text in the log and the summary and drops any job output it matches),
# so from here to the step's end it reads none: what this step prints, a downloaded file's, a template's
# or a tool's text among it, is only shown. The token that would resume them is made here, and the runner
# masks it.
${STOP_COMMANDS}`

// The preamble (C11-D61): the first lines of every run step after the credentials action. It stops the
// runner reading workflow commands for the step (STOP_HEAD); then every aws, cdk and skopeo command
// runs as `run …`, its output shown through the account-id filter (a run of twelve digits with no digit
// or lowercase hex letter beside it, so a commit or digest stays whole), or inside `$(get …)`, its output
// kept and never printed and its errors filtered (DPW-07).
export const PREAMBLE = sh`${STOP_HEAD}
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
export const CLI_FETCH = sh`${STOP_HEAD}
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
export const CLI_CHECK = sh`${STOP_HEAD}
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
// by each step that runs them on each folder it downloaded or uploads. The run's own text judges every older
// release's assembly too, which that release's own code synthesised: each synth-previous job's check of its
// environment's previous assembly (a refusal there fails that job, so nothing deploys), a rollback's target and
// a restore at prod's newest record. So a change to what it pins exactly (a stack's properties, roles,
// bootstrap version or termination protection, the asset manifests' shape, the outputs, and from review 10 each
// resource type's property paths in its literal and each value it holds to the synth's shape, from round 11 a
// task's one container, server, and the Services stack's three services) keeps accepting
// each shape a release among ECR's newest 50 images wrote, or every run fails at a synth and every pipeline
// rollback or restore to a release before the change is refused (T24 item 22). No case can plant an older shape
// until one exists.
export const ASSET_CHECK = sh`# The asset and release checks (ASSET_CHECK; C11-D76, DPW-14). A downloaded cloud assembly is data
# the CLI acts on, so before any credential each one is walked from its root manifest through every
# nested assembly, the files its manifests name and not file names, and refused for: missing context
# (the CLI would look it up with this job's credentials); an artifact type a workload synth never
# writes; a named file that isn't a plain name in its own folder (letters, digits, dots, dashes and
# underscores, no ..); a metadata entry, inline or in an artifact's metadata file, of a type but those the
# workload synth writes and the CLI's three annotations, which it only prints or, an error, refuses on (so
# no legacy asset, which the CLI would build or upload whatever the asset manifests say, and no stack tags,
# which an older CLI hands CloudFormation for every resource of the stack, as no template or diff shows
# them); a logical id entry whose path isn't a stage's stack and plain construct ids, or whose id isn't
# letters and digits (the diff labels by it what carries no path of its own); a container image asset, or a
# file asset that runs a command, is packaged otherwise than file or zip, or whose path leaves the
# tree; a file asset with other than one destination, or whose destination isn't the staging bucket,
# its region and its file-publishing role spelled as the synth writes them (the CLI resolves a
# placeholder before it publishes, so another spelling would name the same object unseen), or whose key
# isn't the synth's shape (a file's the sha256 of its bytes and .json, read from a plain name in its own
# folder, a zip's 64 hex digits and .zip, which ties it to no bytes): the CLI uploads nothing to a key
# that already holds an object, so whatever an earlier call or run put at a key is what CloudFormation
# gets, at a template's key, held to its bytes, the template itself, and at a zip's the bytes its first
# upload carried, which this check never reads (a zip is the release's own, as the image is); a file
# asset whose id, its key in the manifest's files, isn't its key's 64 hex digits (the CLI writes the zip
# it packages to .cache/<id>.zip beside the manifest, or uploads the file already there, so a / or ..
# in an id would have it write or read a file outside the tree); no asset manifest at all; a stack whose
# deploy facts aren't the workload synth's (its environment, its deploy, execution and lookup roles,
# its bootstrap version and the parameter the CLI reads it from with the deploy role and prints when
# it isn't a number, termination protection on Platform and Data alone, and no notification topic,
# tag, parameter or other property: none is in a template or the approver's diff), or an asset
# manifest's (its bootstrap version and parameter alone); a stack whose name isn't Hearth- and its
# stage's id (the CLI would otherwise name it by its artifact's id), or whose template CloudFormation is
# handed isn't its own templateFile (the CLI hands CloudFormation the object stackTemplateAssetObjectUrl
# names, which the asset manifests upload, never the templateFile itself, so that URL must name an s3
# object that this folder's asset manifests upload from the stack's templateFile alone, as a file); a
# template holding a section, a transform or a resource type a workload synth never writes (a section
# other than CloudFormation's own nine but Conditions and Mappings, a Transform or Fn::Transform, or a
# type but those the workload's stacks write, each named in the check below): so no module, registered
# type, nested stack, stack set, macro, SAM or Service Catalog type, each of which hands CloudFormation a
# template or a handler by reference, which neither the diff nor the release check reads (the CLI diffs a
# nested stack from the file its metadata names, wherever that is, while CloudFormation deploys the object
# its TemplateURL names); and no IAM policy, user, group or key, whose grant the approver's diff never
# shows (it prints an added resource as one line with no properties, and its IAM table reads a role,
# user or group policy's statements under no principal); a change that writes another type names it
# there, and one that stops writing a type keeps it while a previous release still holds it; a template
# that takes a value at deploy time the diff doesn't
# show: a parameter but an SSM-typed one, with no key but its type, default and description, whose default
# names one of the workload's own entries (the bootstrap version, the organisation's id, or a stage's
# subnets, zone, Valkey endpoint, auth secret, target groups or security groups), since CloudFormation
# deploys the value the parameter store holds under that name when the stack deploys, which a stack
# deployed earlier in the run can write and the diff shows as one line with no value; or a brace in a
# string but an empty {} and Fn::Sub's $\{name}, so no string, joined, split or substituted, makes a
# {{resolve:...}} dynamic reference, which CloudFormation resolves from the store the same way (with no
# Conditions or Mappings, nothing branches on such a value); or an intrinsic function but those the
# workload's templates write (Fn::GetAtt, Fn::GetAZs, Fn::Join, Fn::Select and Fn::Sub in its resources
# and outputs, Fn::Contains and Fn::Not in CDK's bootstrap version rule), so no Fn::ImportValue or
# Fn::GetStackOutput hands CloudFormation another stack's output, another account's among them, which it
# reads when the stack deploys and the diff shows only as a reference, and no intrinsic AWS adds later
# does either; or an output with a key but its value and description, so none exports a value another
# stack could import; or a role with a key but its trust policy, its inline policies, its name and its
# boundary, or a boundary but the account's own as the synth spells it, so no role attaches a managed
# policy by its ARN, whose grant the diff names by that ARN alone and never prints (the account's own
# boundary attached as a policy would grant everything it bounds), or two inline policies whose names are
# one name but for case (IAM keeps one document to a name, while the diff's IAM table shows both, so a grant
# could stand where the diff shows a Deny); any symbolic link.
# The release check then holds the one custom resource the workload writes, CDK's
# Custom::VpcRestrictDefaultSG, whose answer its handler decides at deploy time and no diff shows: it
# and its handler's function, one of each or neither, stand in a Platform stack alone, its ServiceToken
# is that function's Arn (never a function elsewhere, another account's among them), the function's
# code is a zip in the staging bucket (never inline: the zip's bytes are the release's own, as the image
# is, read by no check, so what the code can do is its role's grant, which the diff's IAM table shows)
# and its properties CDK's own and no others (CDK's entry point on a Node.js runtime, run by its own
# unnamed role of its template, trusted by Lambda alone, so the grant the diff's IAM table shows under that
# role's label is the code's and no other role's, which on a first create the diff would print only as
# grants beside that role's own, with no line tying the function to it; with no layer, environment, network
# or other key, so no other account's code runs before the handler), and no string in its template names
# it, so no grant, output or other value reads its
# answer. It holds every resource to the keys the workload synth writes for its type: its own keys (type,
# properties, metadata of CDK's path and asset notes alone, DependsOn and its two deletion policies), and
# every key and nested key of its properties, with each intrinsic function within them by its name, to its
# type's list of paths below, each key of letters, digits, : and - alone. The diff prints an added resource as
# one line and a changed one as its property tree, so otherwise a container's environment files, a log
# group's resource policy or key, a load balancer's access logs, a target group's targets, a secret's replicas
# or a literal ARN of another account where the synth writes a reference would reach CloudFormation unread,
# in non-prod with no approver at all. It holds what each stack's values name, for that stack's own stage: no
# string (a literal, or a Join or Sub with the account's id and partition filled in) holds an ARN but one in
# the account's own namespace, in ap-southeast-1 or IAM's (or the one S3 ARN, ECR's image-layer bucket, which
# the S3 gateway endpoint's one statement names), an account id (12 digits in a row outside a 64-hex digest),
# or a Hearth name or parameter of another stage. And it holds each value a service acts on to the synth's
# shape: a task definition's family is one of its stage's six, its task and execution roles its family's own
# by name in the account, its image the server's repository in the account at a digest, its log group and
# stream prefix its family's own, its one secret its stage's auth-secret parameter, and its hearth-role tag,
# which the deploy and break-glass roles' grants read, its own kind on the one-off definitions alone, and it
# holds one container, named server, which the pipeline's checks, probe, read-back and one-offs read by that
# name; a service runs on its stage's cluster, on Fargate, in its stage's isolated subnets and security
# groups, behind its stage's target groups, with no public address and no ECS Exec, and a Services stack runs
# exactly the three, api, realtime and worker, each on its own family's definition, as AWS_CHECK and the
# records need them, and no other stack runs one; a security group's inline egress
# is CDK's disallow-all alone, never left out (EC2 opens a group written with none to everything), and its
# inline ingress HTTPS from anywhere alone, and each rule resource names the template's own groups or S3's
# managed prefix list; a VPC endpoint names one of the six services the synth writes in ap-southeast-1
# (ecr.api, ecr.dkr, logs, secretsmanager, ssmmessages and s3), the template's network and a policy of the
# synth's statements alone: the S3 gateway's two, ECR's image layers and the organisation's principals
# getting, listing and putting objects in the organisation's buckets, and each interface endpoint's, the
# organisation's principals calling its own service in the organisation's resources (and ecr.api's and
# ssmmessages' named calls to AWS's own), each binding principals by aws:PrincipalOrgID and resources by
# aws:ResourceOrgID, or, in prod alone until a reviewed change turns its resource statement on, one statement
# binding principals alone; the load balancer and target groups hold the attributes the synth writes (no
# access, connection or health-check log destination), the template's network and targets by IP alone; a
# listener serves HTTPS on 443 with the template's certificates and a fixed response, a rule forwards to the
# template's target groups, the record is an alias of the template's load balancer in its stage's zone, routes
# reach the template's internet gateway from no route table of an isolated subnet (those its stage's
# isolated-subnets parameter names), no subnet gives a public address on launch, and flow logs the template's
# log group by their own unnamed role, trusted by VPC flow logs alone; the restore stage, sealed, holds no
# internet gateway, route, load balancer, listener, rule, target group, certificate or record, no group open
# to any address and no service behind a load balancer (IAC-20 holds the same of CI's synth alone); and SSM
# parameters, the secret, log groups, roles, the cache and tags are its stage's, each
# parameter holding the template's own resource's value (or a host name for Valkey's endpoint), each role
# trusted by ECS tasks, VPC flow logs or Lambda alone, in the account, a named role (a task or execution
# role) by ECS tasks alone, and each task role, but in prod until the same change, bound by its network
# perimeter: every call but rds-db:connect denied from outside the template's network unless an AWS service
# makes it.
# Each stack's outputs are the synth's alone, each of its shape (Services' release; Tasks' cluster, whether a
# database is there, isolated subnets and the one-offs' security groups and task definitions; no other
# stack's), since the one-offs, the release checks and the read-back read them, and aws-cli loads a file://
# value as the file it names. What a container is handed beside
# these (its environment, command, health check and user) is the release's own, as the image is, held to
# its keys alone. It holds each resource's construct path (aws:cdk:path), by which the diff names it in its
# resource lines and its IAM and security group tables (each grant's principal and resource, each rule's
# groups), never by its name, to the synth's: under its own stage and stack, of plain construct ids (letters,
# digits and :, so no line break), unique in its template as the diff prints it (less its stage and a last
# Default or Resource, so no two resources share a label), and its logical id's (its ids less Default and
# Resource, letters and digits alone) but for CDK's 8-hex hash; a VPC to the one a template holds at most, at
# the synth's path, so every rule that reads the template's network (a VPC endpoint's, a group's, a flow
# log's, CDK's handler's, a task role's network perimeter) reads the workload's own; and a role, security
# group, task definition and service to the path what it is gives it: a role's name (CDK's two unnamed roles,
# the flow log's or the function's that takes it), the parameter, load balancer or endpoints that name a
# group, a task definition's family and a service's name, so no release shows a grant to one role, or a rule
# on one group, under another's label. It holds a template's rules and parameters to CDK's own ids (its
# bootstrap version check, its bootstrap version and its SSM parameter values), and no resource to one of
# those ids or an output's: the diff labels every other id of the release's template by its first logical
# id entry, and a resource the release removes by that label when the release reuses its id, so a rule
# (which the non-strict diff never shows) or a parameter could print a removed role's grants, or a removed
# group's rules, under another's label. And no role names anything by a reference but the account's id, the
# template's VPC and its default security group (the network perimeter's aws:SourceVpc and CDK's handler's
# grant): the diff prints any other reference in a grant or a trust by a label no rule ties to what it
# resolves to (a log group's name, or a parameter's stored value under a logical id entry that can read as a
# resource's path), so a release names anything else a grant reaches by a literal ARN, which the IAM table
# prints whole.
# Then it requires every Services template's Release output to be the release this job
# deploys, and every container image in the Tasks and Services templates to be the server image at its
# digest, reading the templateFile the CLI uploads, deploys and diffs. A refusal is one line naming the
# rule, never a path or value from the assembly.
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
    jq -e '(.missing // []) | length == 0' "$dir/manifest.json" >/dev/null 2>&1 ||
      asset_refuse 'a manifest has missing context, which the CLI would look up'
    jq -e '(.artifacts // {}) | all(.[]; .type | IN("aws:cloudformation:stack", "cdk:asset-manifest", "cdk:cloud-assembly", "cdk:tree", "cdk:feature-flag-report"))' "$dir/manifest.json" >/dev/null 2>&1 ||
      asset_refuse 'an artifact type is not one a workload synth writes'
    jq -e '(.artifacts // {}) | all(.[]; if .type == "aws:cloudformation:stack" then .environment == "aws://unknown-account/ap-southeast-1" and (.properties | type == "object" and keys == ["additionalDependencies", "assumeRoleArn", "bootstrapStackVersionSsmParameter", "cloudFormationExecutionRoleArn", "lookupRole", "requiresBootstrapStackVersion", "stackName", "stackTemplateAssetObjectUrl", "templateFile", "terminationProtection", "validateOnSynth"] and .assumeRoleArn == "arn:$\{AWS::Partition}:iam::$\{AWS::AccountId}:role/cdk-hearthapp-deploy-role-$\{AWS::AccountId}-ap-southeast-1" and .cloudFormationExecutionRoleArn == "arn:$\{AWS::Partition}:iam::$\{AWS::AccountId}:role/cdk-hearthapp-cfn-exec-role-$\{AWS::AccountId}-ap-southeast-1" and .lookupRole == {arn: "arn:$\{AWS::Partition}:iam::$\{AWS::AccountId}:role/cdk-hearthapp-lookup-role-$\{AWS::AccountId}-ap-southeast-1", requiresBootstrapStackVersion: 8, bootstrapStackVersionSsmParameter: "/cdk-bootstrap/hearthapp/version"} and .requiresBootstrapStackVersion == 6 and .bootstrapStackVersionSsmParameter == "/cdk-bootstrap/hearthapp/version" and .validateOnSynth == false and .terminationProtection == (.stackName | type == "string" and test("-(Platform|Data)\\z"))) elif .type == "cdk:asset-manifest" then .properties == {file: .properties.file, requiresBootstrapStackVersion: 6, bootstrapStackVersionSsmParameter: "/cdk-bootstrap/hearthapp/version"} else true end)' "$dir/manifest.json" >/dev/null 2>&1 ||
      asset_refuse "a stack's or an asset manifest's deploy facts aren't the workload synth's: its environment, roles and bootstrap version, termination protection on Platform and Data alone, and no topic, tag, parameter or other property"
    jq -e '[(.artifacts // {})[] | (.additionalMetadataFile // empty), (if .type == "aws:cloudformation:stack" then .properties.templateFile elif .type == "cdk:cloud-assembly" then .properties.directoryName elif .type == "cdk:asset-manifest" or .type == "cdk:tree" then .properties.file else empty end)] | all(.[]; type == "string" and test("\\A[A-Za-z0-9][A-Za-z0-9_.-]*\\z") and (contains("..") | not))' "$dir/manifest.json" >/dev/null 2>&1 ||
      asset_refuse 'a manifest names a file that is not a plain name in its own folder'
    while IFS= read -r file; do
      jq -e 'type == "object" and (keys - ["AWSTemplateFormatVersion", "Description", "Metadata", "Outputs", "Parameters", "Resources", "Rules"] | length == 0) and ([.. | objects | select(has("Fn::Transform"))] | length == 0) and (.Resources | type == "object" and all(.[]; type == "object" and (.Type | type == "string" and IN("AWS::CertificateManager::Certificate", "AWS::EC2::FlowLog", "AWS::EC2::InternetGateway", "AWS::EC2::Route", "AWS::EC2::RouteTable", "AWS::EC2::SecurityGroup", "AWS::EC2::SecurityGroupEgress", "AWS::EC2::SecurityGroupIngress", "AWS::EC2::Subnet", "AWS::EC2::SubnetRouteTableAssociation", "AWS::EC2::VPC", "AWS::EC2::VPCEndpoint", "AWS::EC2::VPCGatewayAttachment", "AWS::ECS::Cluster", "AWS::ECS::Service", "AWS::ECS::TaskDefinition", "AWS::ElastiCache::ParameterGroup", "AWS::ElastiCache::ReplicationGroup", "AWS::ElastiCache::SubnetGroup", "AWS::ElasticLoadBalancingV2::Listener", "AWS::ElasticLoadBalancingV2::ListenerRule", "AWS::ElasticLoadBalancingV2::LoadBalancer", "AWS::ElasticLoadBalancingV2::TargetGroup", "AWS::IAM::Role", "AWS::Lambda::Function", "AWS::Logs::LogGroup", "AWS::Route53::RecordSet", "AWS::SSM::Parameter", "AWS::SecretsManager::Secret", "Custom::VpcRestrictDefaultSG"))))' "$dir/$file" >/dev/null 2>&1 ||
        asset_refuse 'a template holds a section, a transform or a resource type a workload synth never writes, which hands CloudFormation a template, a handler or a grant that neither the diff nor the release check shows'
      jq -e '(.Parameters // {} | type == "object" and all(.[]; type == "object" and (keys - ["Default", "Description", "Type"] | length == 0) and (.Type | IN("AWS::SSM::Parameter::Value<String>", "AWS::SSM::Parameter::Value<List<String>>")) and (.Default | type == "string" and test("\\A/(cdk-bootstrap/hearthapp/version|hearth/organisation/id|hearth/((non)?prod|restore)/(network/isolated-subnets|zone/app|valkey/endpoint|auth-secret/arn|target-group/(api|realtime)|security-group/(api|realtime|worker|migrate|probe|valkey)))\\z")))) and ([.. | objects | keys[] | gsub("\\{\\}"; "") | test("[{}]")] | any | not) and ([paths(type == "string") as $p | getpath($p) | if ($p[-1] == "Fn::Sub") or ($p | length > 1 and .[-2] == "Fn::Sub" and .[-1] == 0) then gsub("\\$\\{[A-Za-z0-9_:.]+\\}"; "_") else . end | gsub("\\{\\}"; "") | test("[{}]")] | any | not)' "$dir/$file" >/dev/null 2>&1 ||
        asset_refuse "a template takes a value at deploy time that the diff doesn't show: a parameter but an SSM-typed one naming one of the workload's own entries, or a brace a string could join into a dynamic reference"
      jq -e '(to_entries | all(.[]; .key as $section | [.value | .. | objects | keys[] | select(ascii_downcase | startswith("fn::"))] | all(.[]; IN(if $section == "Rules" then ("Fn::Contains", "Fn::Not") elif $section == "Resources" or $section == "Outputs" then ("Fn::GetAtt", "Fn::GetAZs", "Fn::Join", "Fn::Select", "Fn::Sub") else empty end)))) and (.Outputs // {} | type == "object" and all(.[]; type == "object" and (keys - ["Description", "Value"] | length == 0)))' "$dir/$file" >/dev/null 2>&1 ||
        asset_refuse "a template calls an intrinsic function a workload synth never writes, another stack's output among them, which CloudFormation reads when the stack deploys and the diff never shows, or exports an output"
      jq -e '[.Resources // {} | .[] | select(.Type == "AWS::IAM::Role") | .Properties] | all(.[]; type == "object" and (keys - ["AssumeRolePolicyDocument", "PermissionsBoundary", "Policies", "RoleName"] | length == 0) and .PermissionsBoundary == {"Fn::Join": ["", [(["arn", "aws", "iam", "", ""] | join(":")), {"Ref": "AWS::AccountId"}, ":policy/hearth-boundary"]]} and (.Policies // [] | type == "array" and ([.[] | .PolicyName] | all(.[]; type == "string") and (map(ascii_downcase) | unique | length) == length)))' "$dir/$file" >/dev/null 2>&1 ||
        asset_refuse "a role holds a key a workload synth never writes, a managed policy attached by its ARN among them, whose grant the diff never prints, a boundary but the account's own, or two inline policies of one name, of which IAM keeps one while the diff shows both"
    done < <(jq -r '(.artifacts // {})[] | select(.type == "aws:cloudformation:stack") | .properties.templateFile' "$dir/manifest.json")
    jq -e '(.artifacts // {}) | all(.[]; (.metadata // {}) | type == "object" and all(.[]; type == "array" and all(.[]; type == "object")))' "$dir/manifest.json" >/dev/null 2>&1 ||
      asset_refuse "an artifact's metadata is not a JSON object of entry lists"
    jq -e '[(.artifacts // {})[] | (.metadata // {})[][] | .type] | all(.[]; IN("aws:cdk:acknowledged-rules", "aws:cdk:analytics:construct", "aws:cdk:analytics:method", "aws:cdk:creationStack", "aws:cdk:error", "aws:cdk:info", "aws:cdk:is-custom-resource-handler-customResourceProvider", "aws:cdk:logicalId", "aws:cdk:templateFile", "aws:cdk:warning"))' "$dir/manifest.json" >/dev/null 2>&1 ||
      asset_refuse 'an artifact carries a metadata entry of a type a workload synth never writes: a legacy asset, which the CLI would build or upload, stack tags, which an older CLI applies to every resource of its stack, or another'
    jq -e '[(.artifacts // {})[] | (.metadata // {}) | to_entries[] | select(any(.value[]; .type == "aws:cdk:logicalId"))] | all(.[]; (.key | test("\\A/((non)?prod|restore)/(Platform|Data|Tasks|Services)(/[A-Za-z0-9:.-]+)+\\z")) and all(.value[] | select(.type == "aws:cdk:logicalId"); .data | type == "string" and test("\\A[A-Za-z0-9]{1,255}\\z")))' "$dir/manifest.json" >/dev/null 2>&1 ||
      asset_refuse "an artifact's logical id entry names a path or an id of another shape than a workload synth writes, which the diff would label a template's value by"
    while IFS= read -r file; do
      [ -f "$dir/$file" ] || asset_refuse 'a metadata file is missing'
      jq -e 'type == "object" and all(.[]; type == "array" and all(.[]; type == "object"))' "$dir/$file" >/dev/null 2>&1 ||
        asset_refuse 'a metadata file is not a JSON object of entry lists'
      jq -e '[.[][] | .type] | all(.[]; IN("aws:cdk:acknowledged-rules", "aws:cdk:analytics:construct", "aws:cdk:analytics:method", "aws:cdk:creationStack", "aws:cdk:error", "aws:cdk:info", "aws:cdk:is-custom-resource-handler-customResourceProvider", "aws:cdk:logicalId", "aws:cdk:templateFile", "aws:cdk:warning"))' "$dir/$file" >/dev/null 2>&1 ||
        asset_refuse 'an artifact carries a metadata entry of a type a workload synth never writes: a legacy asset, which the CLI would build or upload, stack tags, which an older CLI applies to every resource of its stack, or another'
      jq -e '[to_entries[] | select(any(.value[]; .type == "aws:cdk:logicalId"))] | all(.[]; (.key | test("\\A/((non)?prod|restore)/(Platform|Data|Tasks|Services)(/[A-Za-z0-9:.-]+)+\\z")) and all(.value[] | select(.type == "aws:cdk:logicalId"); .data | type == "string" and test("\\A[A-Za-z0-9]{1,255}\\z")))' "$dir/$file" >/dev/null 2>&1 ||
        asset_refuse "an artifact's logical id entry names a path or an id of another shape than a workload synth writes, which the diff would label a template's value by"
    done < <(jq -r '(.artifacts // {})[] | .additionalMetadataFile // empty' "$dir/manifest.json")
    while IFS= read -r file; do
      [ -f "$dir/$file" ] || asset_refuse 'an asset manifest is missing'
      jq -e '(.dockerImages // {}) | length == 0' "$dir/$file" >/dev/null 2>&1 || asset_refuse 'an asset manifest holds a container image asset'
      jq -e '(.files // {}) | all(.[]; (.source | type == "object") and (.source | has("executable") | not) and (.source.packaging | IN("file", "zip")) and (.source.path | type == "string" and (startswith("/") | not) and (test("[[:cntrl:]]") | not)))' "$dir/$file" >/dev/null 2>&1 ||
        asset_refuse 'a file asset runs a command, is packaged otherwise than file or zip, or names no relative path'
      while IFS= read -r path; do
        case "$(realpath -m -- "$dir/$path")" in
          "$root"/*) ;;
          *) asset_refuse 'an asset path leaves the assembly' ;;
        esac
      done < <(jq -r '(.files // {})[] | .source.path' "$dir/$file")
      jq -e '(.files // {}) | all(.[]; (.source.packaging != "file" or (.source.path | test("\\A[A-Za-z0-9][A-Za-z0-9_.-]*\\z") and (contains("..") | not))) and (.destinations | type == "object" and length == 1) and all(.destinations[]; type == "object" and keys == ["assumeRoleArn", "bucketName", "objectKey", "region"] and .bucketName == "cdk-hearthapp-assets-$\{AWS::AccountId}-ap-southeast-1" and .region == "ap-southeast-1" and .assumeRoleArn == "arn:$\{AWS::Partition}:iam::$\{AWS::AccountId}:role/cdk-hearthapp-file-publishing-role-$\{AWS::AccountId}-ap-southeast-1" and (.objectKey | type == "string" and test("\\A[0-9a-f]{64}\\.(json|zip)\\z"))) and ((.source.packaging == "zip") == (.destinations[] | .objectKey | endswith(".zip"))))' "$dir/$file" >/dev/null 2>&1 ||
        asset_refuse "a file asset's one destination isn't the staging bucket, its region and its publishing role as the synth spells them, at a key of 64 hex digits that ends as its packaging does, or a file asset isn't a plain name in its own folder"
      jq -e '(.files // {}) | to_entries | all(.[]; .key as $id | ($id | test("\\A[0-9a-f]{64}\\z")) and all(.value.destinations[]; .objectKey == $id + ".json" or .objectKey == $id + ".zip"))' "$dir/$file" >/dev/null 2>&1 ||
        asset_refuse "a file asset's id isn't its key's 64 hex digits (the CLI packages a zip at, and uploads one it finds at, .cache/<id>.zip)"
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
      jq -e --arg stack "$stack" '(.Resources // {}) as $r | [$r | to_entries[] | select(.value.Type == "Custom::VpcRestrictDefaultSG") | .key] as $c | [$r | to_entries[] | select(.value.Type == "AWS::Lambda::Function") | .key] as $f | [paths(type == "string") as $p | getpath($p)] as $s | ($c | length) == ($f | length) and ($c | length) <= (if $stack | test("-Platform\\z") then 1 else 0 end) and all($c[]; $r[.].Properties.ServiceToken == {"Fn::GetAtt": [$f[0], "Arn"]}) and all($f[]; $r[.].Properties | type == "object" and keys == ["Code", "Description", "Handler", "MemorySize", "Role", "Runtime", "Timeout"] and .Handler == "__entrypoint__.handler" and (.Runtime | type == "string" and test("\\Anodejs[0-9]{1,3}\\.x\\z")) and (.Description | type == "string") and (.MemorySize | type == "number") and (.Timeout | type == "number") and (.Role | type == "object" and keys == ["Fn::GetAtt"] and (.["Fn::GetAtt"] | type == "array" and length == 2 and .[1] == "Arn" and (.[0] | type == "string") and $r[.[0]].Type == "AWS::IAM::Role" and ($r[.[0]].Properties | (has("RoleName") | not) and (.AssumeRolePolicyDocument.Statement | type == "array" and length > 0 and all(.[]; .Principal.Service == "lambda.amazonaws.com"))))) and (.Code | type == "object" and keys == ["S3Bucket", "S3Key"] and .S3Bucket == {"Fn::Sub": "cdk-hearthapp-assets-$\{AWS::AccountId}-ap-southeast-1"} and (.S3Key | type == "string" and test("\\A[0-9a-f]{64}\\.zip\\z")))) and all($c[]; . as $id | all($s[]; contains($id) | not))' "$dir/$template" >/dev/null 2>&1 ||
        asset_refuse "a custom resource isn't CDK's one default security group handler, run by its own function as its own unnamed role trusted by Lambda alone, as CDK writes it, from the staging bucket in a Platform stack alone, or a value in its template reads its answer"
      # Each resource type's properties as the workload synth writes them, as paths: every key and nested key,
      # [] for a list's item and each intrinsic function by its name, joined by _, which no key may hold, so a
      # path reads one way (and the key of a container's secret values, whose name DPW-07 refuses standing alone
      # on any line of the workflow, stays part of a longer word). A key the synth never writes is refused, and so
      # is a value the synth writes as a reference written as a literal (an ARN or id of another account's
      # resource) or the other way round.
      # A change that writes another key, or a property in another form, adds its path here, which the owner
      # reads; a path stays while a previous release's assembly (any of ECR's newest 50 images, which
      # synth-previous-*, a rollback or a restore may deploy) still writes it.
      jq -e '{
        "AWS::CertificateManager::Certificate": [
          "DomainName", "DomainValidationOptions_[]_DomainName", "DomainValidationOptions_[]_HostedZoneId_Ref",
          "Tags_[]_Key", "Tags_[]_Value", "ValidationMethod"
        ],
        "AWS::EC2::FlowLog": [
          "DeliverLogsPermissionArn_Fn::GetAtt_[]", "LogDestinationType", "LogGroupName_Ref",
          "MaxAggregationInterval", "ResourceId_Ref", "ResourceType", "TrafficType"
        ],
        "AWS::EC2::InternetGateway": ["Tags_[]_Key", "Tags_[]_Value"],
        "AWS::EC2::Route": ["DestinationCidrBlock", "GatewayId_Ref", "RouteTableId_Ref"],
        "AWS::EC2::RouteTable": ["Tags_[]_Key", "Tags_[]_Value", "VpcId_Ref"],
        "AWS::EC2::SecurityGroup": [
          "GroupDescription", "SecurityGroupEgress_[]_CidrIp", "SecurityGroupEgress_[]_Description",
          "SecurityGroupEgress_[]_FromPort", "SecurityGroupEgress_[]_IpProtocol", "SecurityGroupEgress_[]_ToPort",
          "SecurityGroupIngress_[]_CidrIp", "SecurityGroupIngress_[]_Description", "SecurityGroupIngress_[]_FromPort",
          "SecurityGroupIngress_[]_IpProtocol", "SecurityGroupIngress_[]_ToPort", "VpcId_Ref"
        ],
        "AWS::EC2::SecurityGroupEgress": [
          "Description", "DestinationPrefixListId", "DestinationSecurityGroupId_Fn::GetAtt_[]", "FromPort",
          "GroupId_Fn::GetAtt_[]", "IpProtocol", "ToPort"
        ],
        "AWS::EC2::SecurityGroupIngress": [
          "Description", "FromPort", "GroupId_Fn::GetAtt_[]", "IpProtocol", "SourceSecurityGroupId_Fn::GetAtt_[]",
          "ToPort"
        ],
        "AWS::EC2::Subnet": [
          "AvailabilityZone_Fn::Select_[]", "AvailabilityZone_Fn::Select_[]_Fn::GetAZs", "CidrBlock",
          "MapPublicIpOnLaunch", "Tags_[]_Key", "Tags_[]_Value", "VpcId_Ref"
        ],
        "AWS::EC2::SubnetRouteTableAssociation": ["RouteTableId_Ref", "SubnetId_Ref"],
        "AWS::EC2::VPC": [
          "CidrBlock", "EnableDnsHostnames", "EnableDnsSupport", "InstanceTenancy", "Tags_[]_Key", "Tags_[]_Value"
        ],
        "AWS::EC2::VPCEndpoint": [
          "PolicyDocument_Statement_[]_Action", "PolicyDocument_Statement_[]_Action_[]",
          "PolicyDocument_Statement_[]_Condition_StringEquals_aws:PrincipalOrgID_Ref",
          "PolicyDocument_Statement_[]_Condition_StringEquals_aws:ResourceOrgID_Ref",
          "PolicyDocument_Statement_[]_Effect", "PolicyDocument_Statement_[]_Principal_AWS",
          "PolicyDocument_Statement_[]_Resource", "PolicyDocument_Statement_[]_Sid", "PolicyDocument_Version",
          "PrivateDnsEnabled", "RouteTableIds_[]_Ref", "SecurityGroupIds_[]_Fn::GetAtt_[]", "ServiceName",
          "SubnetIds_[]_Ref", "VpcEndpointType", "VpcId_Ref"
        ],
        "AWS::EC2::VPCGatewayAttachment": ["InternetGatewayId_Ref", "VpcId_Ref"],
        "AWS::ECS::Cluster": [
          "ClusterName", "ClusterSettings_[]_Name", "ClusterSettings_[]_Value",
          "Configuration_ExecuteCommandConfiguration_Logging"
        ],
        "AWS::ECS::Service": [
          "AvailabilityZoneRebalancing", "Cluster", "DeploymentConfiguration_DeploymentCircuitBreaker_Enable",
          "DeploymentConfiguration_DeploymentCircuitBreaker_Rollback", "DeploymentConfiguration_MaximumPercent",
          "DeploymentConfiguration_MinimumHealthyPercent", "DesiredCount", "EnableExecuteCommand",
          "HealthCheckGracePeriodSeconds", "LaunchType", "LoadBalancers_[]_ContainerName",
          "LoadBalancers_[]_ContainerPort", "LoadBalancers_[]_TargetGroupArn_Ref",
          "NetworkConfiguration_AwsvpcConfiguration_AssignPublicIp",
          "NetworkConfiguration_AwsvpcConfiguration_SecurityGroups_[]_Ref",
          "NetworkConfiguration_AwsvpcConfiguration_Subnets_Ref", "PlatformVersion", "ServiceName",
          "TaskDefinition_Ref"
        ],
        "AWS::ECS::TaskDefinition": [
          "ContainerDefinitions_[]_Command_[]", "ContainerDefinitions_[]_Environment_[]_Name",
          "ContainerDefinitions_[]_Environment_[]_Value", "ContainerDefinitions_[]_Environment_[]_Value_Fn::Join_[]",
          "ContainerDefinitions_[]_Environment_[]_Value_Fn::Join_[]_[]",
          "ContainerDefinitions_[]_Environment_[]_Value_Fn::Join_[]_[]_Ref", "ContainerDefinitions_[]_Essential",
          "ContainerDefinitions_[]_HealthCheck_Command_[]", "ContainerDefinitions_[]_HealthCheck_Interval",
          "ContainerDefinitions_[]_HealthCheck_Retries", "ContainerDefinitions_[]_HealthCheck_StartPeriod",
          "ContainerDefinitions_[]_HealthCheck_Timeout", "ContainerDefinitions_[]_Image_Fn::Join_[]",
          "ContainerDefinitions_[]_Image_Fn::Join_[]_[]", "ContainerDefinitions_[]_Image_Fn::Join_[]_[]_Ref",
          "ContainerDefinitions_[]_LinuxParameters_Capabilities",
          "ContainerDefinitions_[]_LinuxParameters_InitProcessEnabled",
          "ContainerDefinitions_[]_LogConfiguration_LogDriver",
          "ContainerDefinitions_[]_LogConfiguration_Options_awslogs-group",
          "ContainerDefinitions_[]_LogConfiguration_Options_awslogs-region",
          "ContainerDefinitions_[]_LogConfiguration_Options_awslogs-stream-prefix",
          "ContainerDefinitions_[]_LogConfiguration_Options_max-buffer-size",
          "ContainerDefinitions_[]_LogConfiguration_Options_mode", "ContainerDefinitions_[]_Name",
          "ContainerDefinitions_[]_PortMappings_[]_ContainerPort", "ContainerDefinitions_[]_PortMappings_[]_Protocol",
          "ContainerDefinitions_[]_ReadonlyRootFilesystem", "ContainerDefinitions_[]_Secrets_[]_Name",
          "ContainerDefinitions_[]_Secrets_[]_ValueFrom_Ref", "ContainerDefinitions_[]_StopTimeout",
          "ContainerDefinitions_[]_Ulimits_[]_HardLimit", "ContainerDefinitions_[]_Ulimits_[]_Name",
          "ContainerDefinitions_[]_Ulimits_[]_SoftLimit", "ContainerDefinitions_[]_User", "Cpu",
          "ExecutionRoleArn_Fn::Join_[]", "ExecutionRoleArn_Fn::Join_[]_[]", "ExecutionRoleArn_Fn::Join_[]_[]_Ref",
          "Family", "Memory", "NetworkMode", "RequiresCompatibilities_[]", "RuntimePlatform_CpuArchitecture",
          "RuntimePlatform_OperatingSystemFamily", "Tags_[]_Key", "Tags_[]_Value", "TaskRoleArn_Fn::Join_[]",
          "TaskRoleArn_Fn::Join_[]_[]", "TaskRoleArn_Fn::Join_[]_[]_Ref"
        ],
        "AWS::ElastiCache::ParameterGroup": [
          "CacheParameterGroupFamily", "Description", "Properties_maxmemory-policy"
        ],
        "AWS::ElastiCache::ReplicationGroup": [
          "AtRestEncryptionEnabled", "AutomaticFailoverEnabled", "CacheNodeType", "CacheParameterGroupName_Ref",
          "CacheSubnetGroupName_Ref", "Engine", "EngineVersion", "MultiAZEnabled", "NumCacheClusters", "Port",
          "ReplicationGroupDescription", "ReplicationGroupId", "SecurityGroupIds_[]_Ref", "SnapshotRetentionLimit",
          "TransitEncryptionEnabled", "TransitEncryptionMode"
        ],
        "AWS::ElastiCache::SubnetGroup": ["Description", "SubnetIds_Ref"],
        "AWS::ElasticLoadBalancingV2::Listener": [
          "Certificates_[]_CertificateArn_Ref", "DefaultActions_[]_FixedResponseConfig_ContentType",
          "DefaultActions_[]_FixedResponseConfig_MessageBody", "DefaultActions_[]_FixedResponseConfig_StatusCode",
          "DefaultActions_[]_Type", "LoadBalancerArn_Ref", "Port", "Protocol", "SslPolicy"
        ],
        "AWS::ElasticLoadBalancingV2::ListenerRule": [
          "Actions_[]_TargetGroupArn_Ref", "Actions_[]_Type", "Conditions_[]_Field",
          "Conditions_[]_PathPatternConfig_Values_[]", "ListenerArn_Ref", "Priority"
        ],
        "AWS::ElasticLoadBalancingV2::LoadBalancer": [
          "LoadBalancerAttributes_[]_Key", "LoadBalancerAttributes_[]_Value", "Name", "Scheme",
          "SecurityGroups_[]_Fn::GetAtt_[]", "Subnets_[]_Ref", "Type"
        ],
        "AWS::ElasticLoadBalancingV2::TargetGroup": [
          "HealthCheckIntervalSeconds", "HealthCheckPath", "HealthCheckTimeoutSeconds", "HealthyThresholdCount",
          "Matcher_HttpCode", "Name", "Port", "Protocol", "ProtocolVersion", "TargetGroupAttributes_[]_Key",
          "TargetGroupAttributes_[]_Value", "TargetType", "UnhealthyThresholdCount", "VpcId_Ref"
        ],
        "AWS::IAM::Role": [
          "AssumeRolePolicyDocument_Statement_[]_Action",
          "AssumeRolePolicyDocument_Statement_[]_Condition_ArnLike_aws:SourceArn_Fn::Join_[]",
          "AssumeRolePolicyDocument_Statement_[]_Condition_ArnLike_aws:SourceArn_Fn::Join_[]_[]",
          "AssumeRolePolicyDocument_Statement_[]_Condition_ArnLike_aws:SourceArn_Fn::Join_[]_[]_Ref",
          "AssumeRolePolicyDocument_Statement_[]_Condition_StringEquals_aws:SourceAccount_Ref",
          "AssumeRolePolicyDocument_Statement_[]_Effect", "AssumeRolePolicyDocument_Statement_[]_Principal_Service",
          "AssumeRolePolicyDocument_Statement_[]_Sid", "AssumeRolePolicyDocument_Version",
          "PermissionsBoundary_Fn::Join_[]", "PermissionsBoundary_Fn::Join_[]_[]",
          "PermissionsBoundary_Fn::Join_[]_[]_Ref", "Policies_[]_PolicyDocument_Statement_[]_Action",
          "Policies_[]_PolicyDocument_Statement_[]_Action_[]",
          "Policies_[]_PolicyDocument_Statement_[]_Condition_BoolIfExists_aws:ViaAWSService",
          "Policies_[]_PolicyDocument_Statement_[]_Condition_StringNotEqualsIfExists_aws:SourceVpc_Ref",
          "Policies_[]_PolicyDocument_Statement_[]_Effect", "Policies_[]_PolicyDocument_Statement_[]_NotAction",
          "Policies_[]_PolicyDocument_Statement_[]_Resource",
          "Policies_[]_PolicyDocument_Statement_[]_Resource_Fn::Join_[]",
          "Policies_[]_PolicyDocument_Statement_[]_Resource_Fn::Join_[]_[]",
          "Policies_[]_PolicyDocument_Statement_[]_Resource_Fn::Join_[]_[]_Ref",
          "Policies_[]_PolicyDocument_Statement_[]_Resource_[]_Fn::Join_[]",
          "Policies_[]_PolicyDocument_Statement_[]_Resource_[]_Fn::Join_[]_[]",
          "Policies_[]_PolicyDocument_Statement_[]_Resource_[]_Fn::Join_[]_[]_Fn::GetAtt_[]",
          "Policies_[]_PolicyDocument_Statement_[]_Resource_[]_Fn::Join_[]_[]_Ref",
          "Policies_[]_PolicyDocument_Statement_[]_Sid", "Policies_[]_PolicyDocument_Version",
          "Policies_[]_PolicyName", "RoleName"
        ],
        "AWS::Lambda::Function": [
          "Code_S3Bucket_Fn::Sub", "Code_S3Key", "Description", "Handler", "MemorySize", "Role_Fn::GetAtt_[]",
          "Runtime", "Timeout"
        ],
        "AWS::Logs::LogGroup": ["LogGroupClass", "LogGroupName", "RetentionInDays"],
        "AWS::Route53::RecordSet": [
          "AliasTarget_DNSName_Fn::Join_[]", "AliasTarget_DNSName_Fn::Join_[]_[]",
          "AliasTarget_DNSName_Fn::Join_[]_[]_Fn::GetAtt_[]", "AliasTarget_HostedZoneId_Fn::GetAtt_[]",
          "HostedZoneId_Ref", "Name", "Type"
        ],
        "AWS::SSM::Parameter": [
          "Name", "Type", "Value", "Value_Fn::GetAtt_[]", "Value_Fn::Join_[]", "Value_Fn::Join_[]_[]_Ref", "Value_Ref"
        ],
        "AWS::SecretsManager::Secret": [
          "Description", "GenerateSecretString_ExcludePunctuation", "GenerateSecretString_PasswordLength", "Name"
        ],
        "Custom::VpcRestrictDefaultSG": [
          "Account_Ref", "DefaultSecurityGroupId_Fn::GetAtt_[]", "ServiceToken_Fn::GetAtt_[]"
        ]
      } as $held | def leaf: if type == "object" or type == "array" then length == 0 else true end;
        .Resources // {} | type == "object" and all(.[]; type == "object" and (keys - ["DeletionPolicy", "DependsOn", "Metadata", "Properties", "Type", "UpdateReplacePolicy"] | length == 0) and (.Metadata // {} | type == "object" and (keys - ["aws:asset:path", "aws:asset:property", "aws:cdk:path"] | length == 0)) and (.Properties | type == "object") and ([.Properties | .. | objects | keys[] | select(test("\\A[A-Za-z0-9:-]+\\z") | not)] | length == 0) and ($held[.Type] | type == "array") and ([.Properties | paths(leaf) | map(if type == "number" then "[]" else . end) | join("_")] - $held[.Type] | length == 0))' "$dir/$template" >/dev/null 2>&1 ||
        asset_refuse "a resource holds a key, or writes a property in a form, that a workload synth never writes for its type"
      jq -e --arg stack "$stack" '($stack | capture("\\AHearth-(?<s>(non)?prod|restore)-").s) as $s |
        def rendered: if type == "string" then . elif type == "number" or type == "boolean" then tostring elif type == "object" and keys == ["Ref"] then (if .Ref == "AWS::AccountId" then "<account>" elif .Ref == "AWS::Partition" then "aws" else "<ref>" end) elif type == "object" and keys == ["Fn::Join"] and (.["Fn::Join"] | type == "array" and length == 2 and (.[0] | type == "string") and (.[1] | type == "array")) then .["Fn::Join"][0] as $d | [.["Fn::Join"][1][] | rendered] | join($d) elif type == "object" and keys == ["Fn::Sub"] and (.["Fn::Sub"] | type == "string") then .["Fn::Sub"] | gsub("\\$\\{AWS::AccountId\\}"; "<account>") | gsub("\\$\\{AWS::Partition\\}"; "aws") | gsub("\\$\\{[^}]*\\}"; "<ref>") else "<ref>" end;
        def renderings: if type == "object" and (keys == ["Ref"] or keys == ["Fn::Join"] or keys == ["Fn::Sub"]) then rendered elif type == "object" or type == "array" then .[] | renderings else rendered end;
        (.Parameters // {} | all(.[]; .Default | type == "string" and (IN("/cdk-bootstrap/hearthapp/version", "/hearth/organisation/id") or startswith("/hearth/" + $s + "/")))) and
        all(.Resources // {} | .[] | .Properties | renderings | ascii_downcase; (. == (["arn", "aws", "s3", "", "", "prod-ap-southeast-1-starport-layer-bucket/*"] | join(":")) or (test("(?<![a-z0-9])arn:(?!aws:([a-z0-9-]+:ap-southeast-1|iam:):<account>:)") | not)) and (gsub("[0-9a-f]{64}"; "") | test("[0-9]{12}") | not) and all(scan("hearth[-/]((non)?prod|restore)(?![a-z0-9])"); .[0] == $s))' "$dir/$template" >/dev/null 2>&1 ||
        asset_refuse "a template names something outside its stage: an ARN but its own account's, an account id, or a parameter or name of another stage"
      jq -e --arg stack "$stack" '(.Resources // {}) as $r | (.Parameters // {}) as $p | ($stack | capture("\\AHearth-(?<s>(non)?prod|restore)-").s) as $s |
        def own($t): type == "string" and $r[.].Type == $t;
        def ref($t): type == "object" and keys == ["Ref"] and (.Ref | own($t));
        def att($t; $a): type == "object" and keys == ["Fn::GetAtt"] and (.["Fn::GetAtt"] | type == "array" and length == 2 and (.[0] | own($t)) and .[1] == $a);
        def param($n): type == "object" and keys == ["Ref"] and $p[.Ref].Default == $n;
        def of($t): $r[] | select(.Type == $t) | .Properties;
        def role($n): {"Fn::Join": ["", [(["arn", "aws", "iam", "", ""] | join(":")), {"Ref": "AWS::AccountId"}, (":role/" + $n)]]};
        all(of("AWS::ECS::TaskDefinition"); .Family as $f | ($f | type == "string" and test("\\Ahearth-" + $s + "-(api|realtime|worker|migrate|probe|bastion)\\z")) and ($f | ltrimstr("hearth-" + $s + "-")) as $kind | .TaskRoleArn == role($f + "-task") and .ExecutionRoleArn == role($f + "-exec") and (.Tags // []) == (if $kind | IN("migrate", "probe", "bastion") then [{"Key": "hearth-role", "Value": $kind}] else [] end) and (.ContainerDefinitions | type == "array" and length > 0 and all(.[]; (.Image | type == "object" and keys == ["Fn::Join"] and (.["Fn::Join"] | length == 2 and .[0] == "" and (.[1] | type == "array" and length == 4 and .[0] == {"Ref": "AWS::AccountId"} and .[1] == ".dkr.ecr.ap-southeast-1." and .[2] == {"Ref": "AWS::URLSuffix"} and (.[3] | type == "string" and test("\\A/hearth-server@sha256:[0-9a-f]{64}\\z"))))) and .LogConfiguration.LogDriver == "awslogs" and (.LogConfiguration.Options | .["awslogs-group"] == "/hearth/" + $s + "/" + $kind and .["awslogs-stream-prefix"] == $kind and .["awslogs-region"] == "ap-southeast-1") and all(.. | objects | select(has("ValueFrom")); .ValueFrom | param("/hearth/" + $s + "/auth-secret/arn"))))) and
        all(of("AWS::ECS::Service"); .Cluster == "hearth-" + $s and (.ServiceName | type == "string" and test("\\Ahearth-" + $s + "-(api|realtime|worker)\\z")) and .LaunchType == "FARGATE" and (.EnableExecuteCommand // false) == false and (.TaskDefinition | ref("AWS::ECS::TaskDefinition")) and (.NetworkConfiguration.AwsvpcConfiguration | (.AssignPublicIp // "DISABLED") == "DISABLED" and (.Subnets | param("/hearth/" + $s + "/network/isolated-subnets")) and (.SecurityGroups | type == "array" and all(.[]; type == "object" and keys == ["Ref"] and ($p[.Ref].Default | type == "string" and test("\\A/hearth/" + $s + "/security-group/(api|realtime|worker)\\z"))))) and all(.LoadBalancers // [] | .[]; .TargetGroupArn | type == "object" and keys == ["Ref"] and ($p[.Ref].Default | type == "string" and test("\\A/hearth/" + $s + "/target-group/(api|realtime)\\z")))) and
        all(of("AWS::ECS::Cluster"); .ClusterName == "hearth-" + $s) and
        all(of("AWS::ECS::TaskDefinition"); .ContainerDefinitions | length == 1 and .[0].Name == "server") and
        ([of("AWS::ECS::Service") | [.ServiceName, $r[.TaskDefinition.Ref].Properties.Family]] | sort) == (if $stack | test("-Services\\z") then ["api", "realtime", "worker"] | map("hearth-" + $s + "-" + .) | map([., .]) else [] end)' "$dir/$template" >/dev/null 2>&1 ||
        asset_refuse "a task definition, service or cluster isn't the workload's: its roles, image, log group, secret, tags, network, target groups, ECS Exec, names or containers of another shape, or a Services stack's services other than api, realtime and worker, each on its own family"
      jq -e --arg stack "$stack" '(.Resources // {}) as $r | (.Parameters // {}) as $p | ($stack | capture("\\AHearth-(?<s>(non)?prod|restore)-").s) as $s |
        def own($t): type == "string" and $r[.].Type == $t;
        def ref($t): type == "object" and keys == ["Ref"] and (.Ref | own($t));
        def att($t; $a): type == "object" and keys == ["Fn::GetAtt"] and (.["Fn::GetAtt"] | type == "array" and length == 2 and (.[0] | own($t)) and .[1] == $a);
        def param($n): type == "object" and keys == ["Ref"] and $p[.Ref].Default == $n;
        def of($t): $r[] | select(.Type == $t) | .Properties;
        def org: param("/hearth/organisation/id");
        def allow($sid; $action): type == "object" and keys == ["Action", "Condition", "Effect", "Principal", "Resource", "Sid"] and .Sid == $sid and .Effect == "Allow" and .Principal == {"AWS": "*"} and .Action == $action and .Resource == "*";
        def principals: .Condition | type == "object" and keys == ["StringEquals"] and (.StringEquals | type == "object" and keys == ["aws:PrincipalOrgID"] and (.["aws:PrincipalOrgID"] | org));
        def resources: .Condition | type == "object" and keys == ["StringEquals"] and (.StringEquals | type == "object" and keys == ["aws:PrincipalOrgID", "aws:ResourceOrgID"] and all(.[]; org));
        ([of("AWS::SSM::Parameter") | select(.Name == "/hearth/" + $s + "/network/isolated-subnets") | .Value | objects | .["Fn::Join"] | arrays | .[1] | arrays | .[] | objects | .Ref]) as $isolated |
        ([of("AWS::EC2::Route") | .RouteTableId | objects | .Ref]) as $routed |
        ($s != "restore" or (all($r[]; .Type | IN("AWS::EC2::InternetGateway", "AWS::EC2::VPCGatewayAttachment", "AWS::EC2::Route", "AWS::ElasticLoadBalancingV2::LoadBalancer", "AWS::ElasticLoadBalancingV2::Listener", "AWS::ElasticLoadBalancingV2::ListenerRule", "AWS::ElasticLoadBalancingV2::TargetGroup", "AWS::CertificateManager::Certificate", "AWS::Route53::RecordSet") | not) and all(of("AWS::EC2::SecurityGroup"); (.SecurityGroupIngress // []) == []) and all(of("AWS::ECS::Service"); (.LoadBalancers // []) == []))) and
        all(of("AWS::EC2::Subnet"); (.MapPublicIpOnLaunch // false) == false) and
        all(of("AWS::EC2::SecurityGroup"); (.VpcId | ref("AWS::EC2::VPC")) and (.SecurityGroupEgress | type == "array" and length > 0 and all(.[]; . == {"CidrIp": "255.255.255.255/32", "Description": "Disallow all traffic", "FromPort": 252, "IpProtocol": "icmp", "ToPort": 86})) and all(.SecurityGroupIngress // [] | .[]; .CidrIp == "0.0.0.0/0" and .IpProtocol == "tcp" and .FromPort == 443 and .ToPort == 443)) and
        all(of("AWS::EC2::SecurityGroupEgress"); (.GroupId | att("AWS::EC2::SecurityGroup"; "GroupId")) and (if has("DestinationPrefixListId") then .DestinationPrefixListId == "pl-6fa54006" else .DestinationSecurityGroupId | att("AWS::EC2::SecurityGroup"; "GroupId") end)) and
        all(of("AWS::EC2::SecurityGroupIngress"); (.GroupId | att("AWS::EC2::SecurityGroup"; "GroupId")) and (.SourceSecurityGroupId | att("AWS::EC2::SecurityGroup"; "GroupId"))) and
        all(of("AWS::EC2::VPCEndpoint"); .ServiceName as $service | ($service | type == "string" and test("\\Acom\\.amazonaws\\.ap-southeast-1\\.(ecr\\.api|ecr\\.dkr|logs|secretsmanager|ssmmessages|s3)\\z")) and (.VpcId | ref("AWS::EC2::VPC")) and all(.SubnetIds // [] | .[]; ref("AWS::EC2::Subnet")) and all(.RouteTableIds // [] | .[]; ref("AWS::EC2::RouteTable")) and all(.SecurityGroupIds // [] | .[]; att("AWS::EC2::SecurityGroup"; "GroupId")) and (.PolicyDocument | type == "object" and keys == ["Statement", "Version"] and .Version == "2012-10-17") and (($service | ltrimstr("com.amazonaws.ap-southeast-1.")) as $name | .PolicyDocument.Statement as $all | if $name == "s3" then .VpcEndpointType == "Gateway" and ($all | type == "array" and length == 2 and .[0] == {"Sid": "EcrImageLayers", "Effect": "Allow", "Principal": {"AWS": "*"}, "Action": "s3:GetObject", "Resource": (["arn", "aws", "s3", "", "", "prod-ap-southeast-1-starport-layer-bucket/*"] | join(":"))} and (.[1] | allow("OrgResources"; ["s3:GetObject", "s3:ListBucket", "s3:PutObject"]) and resources)) else .VpcEndpointType == "Interface" and ($name | split(".")[0] + ":*") as $actions | ({"ecr.api": ["ecr:GetAuthorizationToken"], "ssmmessages": ["ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel"]}[$name] // []) as $owned | ($all | type == "array" and ((length == (if $owned == [] then 1 else 2 end) and (.[0] | allow("OrgPrincipalsToOrgResources"; $actions) and resources) and ($owned == [] or (.[1] | allow("OrgPrincipalsToAwsResources"; $owned) and principals))) or ($s == "prod" and length == 1 and (.[0] | allow("OrgPrincipals"; $actions) and principals)))) end)) and
        all(of("AWS::ElasticLoadBalancingV2::LoadBalancer"); .Name == "hearth-" + $s and .Type == "application" and all(.Subnets // [] | .[]; ref("AWS::EC2::Subnet")) and all(.SecurityGroups // [] | .[]; att("AWS::EC2::SecurityGroup"; "GroupId")) and all(.LoadBalancerAttributes // [] | .[]; .Key | IN("deletion_protection.enabled", "routing.http2.enabled", "idle_timeout.timeout_seconds", "routing.http.drop_invalid_header_fields.enabled", "routing.http.desync_mitigation_mode"))) and
        all(of("AWS::ElasticLoadBalancingV2::TargetGroup"); (.Name | type == "string" and test("\\Ahearth-" + $s + "-(api|realtime)\\z")) and .TargetType == "ip" and (.VpcId | ref("AWS::EC2::VPC")) and all(.TargetGroupAttributes // [] | .[]; .Key | IN("deregistration_delay.timeout_seconds", "stickiness.enabled", "load_balancing.algorithm.type"))) and
        all(of("AWS::ElasticLoadBalancingV2::Listener"); (.LoadBalancerArn | ref("AWS::ElasticLoadBalancingV2::LoadBalancer")) and .Port == 443 and .Protocol == "HTTPS" and (.Certificates | type == "array" and length > 0 and all(.[]; .CertificateArn | ref("AWS::CertificateManager::Certificate"))) and all(.DefaultActions // [] | .[]; .Type == "fixed-response")) and
        all(of("AWS::ElasticLoadBalancingV2::ListenerRule"); (.ListenerArn | ref("AWS::ElasticLoadBalancingV2::Listener")) and all(.Actions // [] | .[]; .Type == "forward" and (.TargetGroupArn | ref("AWS::ElasticLoadBalancingV2::TargetGroup")))) and
        all(of("AWS::Route53::RecordSet"); (.HostedZoneId | param("/hearth/" + $s + "/zone/app")) and (.AliasTarget.HostedZoneId | att("AWS::ElasticLoadBalancingV2::LoadBalancer"; "CanonicalHostedZoneID")) and .AliasTarget.DNSName == {"Fn::Join": ["", ["dualstack.", {"Fn::GetAtt": [.AliasTarget.HostedZoneId["Fn::GetAtt"][0], "DNSName"]}]]}) and
        all(of("AWS::CertificateManager::Certificate"); .ValidationMethod == "DNS" and all(.DomainValidationOptions // [] | .[]; .HostedZoneId | param("/hearth/" + $s + "/zone/app"))) and
        all(of("AWS::EC2::Route"); (.GatewayId | ref("AWS::EC2::InternetGateway")) and (.RouteTableId | ref("AWS::EC2::RouteTable"))) and
        all(of("AWS::EC2::SubnetRouteTableAssociation"); (.SubnetId | ref("AWS::EC2::Subnet")) and (.RouteTableId | ref("AWS::EC2::RouteTable")) and (((.SubnetId.Ref | IN($isolated[])) and (.RouteTableId.Ref | IN($routed[]))) | not)) and
        all(of("AWS::EC2::VPCGatewayAttachment"); .InternetGatewayId | ref("AWS::EC2::InternetGateway")) and
        all($r[] | .Properties | select(has("VpcId")); .VpcId | ref("AWS::EC2::VPC")) and
        all(of("AWS::EC2::FlowLog"); .LogDestinationType == "cloud-watch-logs" and (.LogGroupName | ref("AWS::Logs::LogGroup")) and (.DeliverLogsPermissionArn | att("AWS::IAM::Role"; "Arn") and ($r[.["Fn::GetAtt"][0]].Properties | (has("RoleName") | not) and (.AssumeRolePolicyDocument.Statement | type == "array" and length > 0 and all(.[]; .Principal.Service == "vpc-flow-logs.amazonaws.com")))) and (.ResourceId | ref("AWS::EC2::VPC"))) and
        all(of("Custom::VpcRestrictDefaultSG"); .Account == {"Ref": "AWS::AccountId"} and (.DefaultSecurityGroupId | att("AWS::EC2::VPC"; "DefaultSecurityGroup")))' "$dir/$template" >/dev/null 2>&1 ||
        asset_refuse "a network resource isn't the workload's: a security group rule, VPC endpoint or its policy, load balancer, target group, listener, record, route or flow log naming or opening something of another shape, or a flow log delivering as a role but its own unnamed one trusted by VPC flow logs alone; a listener other than HTTPS on 443 with a certificate; a subnet that gives a public address, or the restore stage holding an internet gateway, a route, a load balancer, a listener, a target group, a certificate, a record, a group open to any address or a service behind a load balancer"
      jq -e --arg stack "$stack" '(.Resources // {}) as $r | (.Parameters // {}) as $p | ($stack | capture("\\AHearth-(?<s>(non)?prod|restore)-").s) as $s |
        def own($t): type == "string" and $r[.].Type == $t;
        def ref($t): type == "object" and keys == ["Ref"] and (.Ref | own($t));
        def att($t; $a): type == "object" and keys == ["Fn::GetAtt"] and (.["Fn::GetAtt"] | type == "array" and length == 2 and (.[0] | own($t)) and .[1] == $a);
        def param($n): type == "object" and keys == ["Ref"] and $p[.Ref].Default == $n;
        def of($t): $r[] | select(.Type == $t) | .Properties;
        all(of("AWS::SSM::Parameter"); (.Name | type == "string" and startswith("/hearth/" + $s + "/")) and ((.Name | ltrimstr("/hearth/" + $s + "/")) as $n | .Value | if $n == "auth-secret/arn" then ref("AWS::SecretsManager::Secret") elif $n == "network/isolated-subnets" then type == "object" and keys == ["Fn::Join"] and .["Fn::Join"][0] == "," and (.["Fn::Join"][1] | type == "array" and all(.[]; ref("AWS::EC2::Subnet"))) elif $n | test("\\Asecurity-group/(api|realtime|worker|migrate|probe|valkey|bastion)\\z") then att("AWS::EC2::SecurityGroup"; "GroupId") elif $n | test("\\Atarget-group/(api|realtime)\\z") then ref("AWS::ElasticLoadBalancingV2::TargetGroup") elif $n == "valkey/endpoint" then att("AWS::ElastiCache::ReplicationGroup"; "PrimaryEndPoint.Address") or (type == "string" and test("\\A[a-z0-9.-]+\\z")) else false end)) and
        all(of("AWS::SecretsManager::Secret"); .Name == "hearth/" + $s + "/auth-secret") and
        all(of("AWS::Logs::LogGroup"); .LogGroupName | type == "string" and test("\\A/hearth/" + $s + "/[a-z-]+\\z")) and
        all(of("AWS::IAM::Role"); ((has("RoleName") | not) or ((.RoleName | type == "string" and test("\\Ahearth-" + $s + "-(api|realtime|worker|migrate|probe|bastion)-(task|exec)\\z")) and all(.AssumeRolePolicyDocument.Statement[]?; .Principal.Service == "ecs-tasks.amazonaws.com"))) and (.AssumeRolePolicyDocument.Statement | type == "array" and all(.[]; .Effect == "Allow" and .Action == "sts:AssumeRole" and (.Principal.Service | IN("ecs-tasks.amazonaws.com", "vpc-flow-logs.amazonaws.com", "lambda.amazonaws.com")) and ((.Condition.StringEquals // {}) | (has("aws:SourceAccount") | not) or .["aws:SourceAccount"] == {"Ref": "AWS::AccountId"})))) and
        all(of("AWS::IAM::Role") | select(.RoleName | type == "string" and endswith("-task")); $s == "prod" or any(.Policies[]?.PolicyDocument.Statement[]?; type == "object" and keys == ["Condition", "Effect", "NotAction", "Resource", "Sid"] and .Sid == "NetworkPerimeter" and .Effect == "Deny" and .NotAction == "rds-db:connect" and .Resource == "*" and (.Condition | type == "object" and keys == ["BoolIfExists", "StringNotEqualsIfExists"] and .BoolIfExists == {"aws:ViaAWSService": "false"} and (.StringNotEqualsIfExists | type == "object" and keys == ["aws:SourceVpc"] and (.["aws:SourceVpc"] | ref("AWS::EC2::VPC")))))) and
        all(of("AWS::ElastiCache::ReplicationGroup"); .ReplicationGroupId == "hearth-" + $s and (.CacheParameterGroupName | ref("AWS::ElastiCache::ParameterGroup")) and (.CacheSubnetGroupName | ref("AWS::ElastiCache::SubnetGroup")) and all(.SecurityGroupIds // [] | .[]; param("/hearth/" + $s + "/security-group/valkey"))) and
        all(of("AWS::ElastiCache::SubnetGroup"); .SubnetIds | param("/hearth/" + $s + "/network/isolated-subnets")) and
        all($r[] | select(.Type != "AWS::ECS::TaskDefinition") | .Properties.Tags // [] | .[]; .Key | IN("Name", "aws-cdk:subnet-name", "aws-cdk:subnet-type"))' "$dir/$template" >/dev/null 2>&1 ||
        asset_refuse "a parameter, secret, log group, role, cache or tag isn't the workload's: a name, a stored value, a role's trust (a named role's ECS tasks' alone) or a task role's network perimeter of another shape"
      jq -e --arg stack "$stack" '(.Resources // {}) as $r | (.Parameters // {}) as $p | ($stack | capture("\\AHearth-(?<s>(non)?prod|restore)-(?<part>Platform|Data|Tasks|Services)\\z")) as $at | $at.s as $s |
        def own($t): type == "string" and $r[.].Type == $t;
        def ref($t): type == "object" and keys == ["Ref"] and (.Ref | own($t));
        def param($n): type == "object" and keys == ["Ref"] and $p[.Ref].Default == $n;
        def family($kind): ref("AWS::ECS::TaskDefinition") and $r[.Ref].Properties.Family == "hearth-" + $s + "-" + $kind;
        (.Outputs // {}) as $o |
        ($o | type == "object" and keys == (if $at.part == "Services" then ["Release"] elif $at.part == "Tasks" then ["Cluster", "HasDatabase", "IsolatedSubnets", "MigrateSecurityGroup", "MigrateTaskDefinition", "ProbeSecurityGroup", "ProbeTaskDefinition"] else [] end) and all(.[]; type == "object" and (.Description | type == "string"))) and
        all($o | to_entries[]; .key as $key | .value.Value | if $key == "Release" then type == "string" and test("\\A[0-9a-f]{40}:sha256:[0-9a-f]{64}\\z") elif $key == "Cluster" then . == "hearth-" + $s elif $key == "HasDatabase" then IN("true", "false") elif $key == "IsolatedSubnets" then type == "object" and keys == ["Fn::Join"] and (.["Fn::Join"] | type == "array" and length == 2 and .[0] == "," and (.[1] | param("/hearth/" + $s + "/network/isolated-subnets"))) elif $key == "MigrateSecurityGroup" then param("/hearth/" + $s + "/security-group/migrate") elif $key == "ProbeSecurityGroup" then param("/hearth/" + $s + "/security-group/probe") elif $key == "MigrateTaskDefinition" then family("migrate") elif $key == "ProbeTaskDefinition" then family("probe") else false end)' "$dir/$template" >/dev/null 2>&1 ||
        asset_refuse "a stack's outputs aren't the workload's: an output the workload synth never writes for its stack, or a value of another shape, which the one-offs, the release checks and the read-back would read"
      jq -e '(.Resources // {}) as $r | [$r[] | select(.Type == "AWS::IAM::Role") | .Properties | .. | objects | select(has("Ref") or has("Fn::GetAtt"))] |
        all(.[]; . == {"Ref": "AWS::AccountId"} or (keys == ["Ref"] and (.Ref | type == "string") and $r[.Ref].Type == "AWS::EC2::VPC") or (keys == ["Fn::GetAtt"] and (.["Fn::GetAtt"] | type == "array" and length == 2 and (.[0] | type == "string") and $r[.[0]].Type == "AWS::EC2::VPC" and .[1] == "DefaultSecurityGroup")))' "$dir/$template" >/dev/null 2>&1 ||
        asset_refuse "a role names something by a reference but the account's id, the template's VPC or its default security group, which the diff prints by a label no rule ties to what it resolves to: a grant names anything else by a literal ARN"
      jq -e --arg stack "$stack" '(.Resources // {}) as $r | ($stack | capture("\\AHearth-(?<s>(non)?prod|restore)-(?<part>Platform|Data|Tasks|Services)\\z")) as $at | ($at.s + "/" + $at.part) as $base |
        {"api": "Api", "realtime": "Realtime", "worker": "Worker", "migrate": "Migrate", "probe": "Probe", "bastion": "Bastion", "valkey": "Valkey", "task": "Task", "exec": "Exec"} as $cap |
        [$r[] | .Metadata["aws:cdk:path"]] as $paths |
        ((.Rules // {}) | keys | all(. == "CheckBootstrapVersion")) and ((.Parameters // {}) | keys | all(test("\\A(BootstrapVersion|SsmParameterValue[A-Za-z0-9]+Parameter)\\z"))) and
        ([.Rules, .Parameters, .Outputs | . // {} | keys[]] as $own | all($r | keys[]; test("\\A(BootstrapVersion|CheckBootstrapVersion|SsmParameterValue[A-Za-z0-9]*Parameter)\\z") or IN($own[]) | not)) and
        all($paths[]; type == "string" and test("\\A" + $base + "(/[A-Za-z0-9:]+)+\\z")) and
        ([$paths[] | strings | sub("/(Default|Resource)\\z"; "")] as $labels | all($labels[]; . as $label | ($labels | map(select(. == $label)) | length) == 1)) and
        ([$r[] | select(.Type == "AWS::EC2::VPC") | .Metadata["aws:cdk:path"]] | . == [] or . == [$at.s + "/Platform/Network/Vpc/Resource"]) and
        all($r | to_entries[]; .key as $id | ("/" + (.value.Metadata["aws:cdk:path"] | gsub("\\A" + $base; "")) + "/" | gsub("/(Default|Resource)(?=/)"; "") | gsub("[^A-Za-z0-9]"; "")) as $l | $l != "" and ($id == $l or ($id | test("\\A" + $l + "[0-9A-F]{8}\\z")))) and
        all($r | to_entries[] | select(.value.Type == "AWS::IAM::Role"); .key as $id | {"Fn::GetAtt": [$id, "Arn"]} as $att | (if .value.Properties | has("RoleName") then [.value.Properties.RoleName | capture("\\Ahearth-[a-z]+-(?<k>[a-z]+)-(?<t>task|exec)\\z") | "Roles/" + $cap[.k] + $cap[.t]] else [($r[] | select(.Type == "AWS::EC2::FlowLog" and .Properties.DeliverLogsPermissionArn == $att) | "Network/FlowLogRole"), ($r[] | select(.Type == "AWS::Lambda::Function" and .Properties.Role == $att) | "Custom::VpcRestrictDefaultSGCustomResourceProvider/Role")] end) as $labels | ($labels | length) > 0 and all($labels[]; . == $labels[0]) and .value.Metadata["aws:cdk:path"] == $base + "/" + $labels[0]) and
        all($r | to_entries[] | select(.value.Type == "AWS::EC2::SecurityGroup"); .key as $id | {"Fn::GetAtt": [$id, "GroupId"]} as $att | [($r[] | select(.Type == "AWS::SSM::Parameter" and .Properties.Value == $att) | .Properties.Name | capture("\\A/hearth/[a-z]+/security-group/(?<k>[a-z]+)\\z") | $cap[.k]), ($r[] | select(.Type == "AWS::ElasticLoadBalancingV2::LoadBalancer" and any(.Properties.SecurityGroups[]?; . == $att)) | "Alb"), ($r[] | select(.Type == "AWS::EC2::VPCEndpoint" and any(.Properties.SecurityGroupIds[]?; . == $att)) | "Endpoints")] as $labels | all($labels[]; . == $labels[0]) and (($labels | length) == 0 or .value.Metadata["aws:cdk:path"] == $base + "/Network/Groups/" + $labels[0])) and
        all($r[] | select(.Type == "AWS::ECS::TaskDefinition"); [.Properties.Family | capture("\\Ahearth-[a-z]+-(?<k>[a-z]+)\\z") | $base + "/" + $cap[.k] + "Task/Resource"] == [.Metadata["aws:cdk:path"]]) and
        all($r[] | select(.Type == "AWS::ECS::Service"); [.Properties.ServiceName | capture("\\Ahearth-[a-z]+-(?<k>[a-z]+)\\z") | $base + "/" + $cap[.k] + "Service"] == [.Metadata["aws:cdk:path"]])' "$dir/$template" >/dev/null 2>&1 ||
        asset_refuse "a resource's construct path, which the diff's tables name it by, isn't the synth's: under its own stack, of plain construct ids, unique as the diff prints it, its logical id's but for CDK's hash, one VPC at most and at the synth's path, and for a role, security group, task definition or service the one its name, or what names it, gives it; or a rule or parameter takes an id but CDK's own, or a resource one of theirs or an output's, under which the diff would label a resource the release removes"
      case "$stack" in
        Hearth-*-Services)
          services=$((services + 1))
          jq -e --arg release "$release" '.Outputs.Release.Value == $release' "$dir/$template" >/dev/null 2>&1 ||
            asset_refuse "a Services template's Release is not this job's release"
          ;;&
        Hearth-*-Tasks | Hearth-*-Services)
          jq -e --arg image "/hearth-server@$digest" '[.Resources[]? | select(.Type == "AWS::ECS::TaskDefinition") | .Properties.ContainerDefinitions[]?.Image] | length > 0 and all(.[]; type == "object" and (.["Fn::Join"] | type == "array") and (.["Fn::Join"][1] | type == "array" and (last | type == "string" and endswith($image))))' "$dir/$template" >/dev/null 2>&1 ||
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
  # The three services: one deployment each, and the image each runs, asked of ECS by each one's task
  # definition only once that is one of its stage's own families' (a restore leaves prod's alone).
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
        [[ "$td" =~ ^arn:[a-z-]+:ecs:ap-southeast-1:[0-9]{12}:task-definition/hearth-$stage-(api|realtime|worker):[1-9][0-9]{0,5}$ ]] ||
          aws_refuse "a service's task definition isn't one of its stage's"
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
    case "$kind" in
      migrate) MIGRATE_TD="$\{definition##*/}" ;;
      probe) PROBE_TD="$\{definition##*/}" ;;
    esac
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
  local kind=$1 lines=$2 placed=$3 task ended log='[]' page joined cursor='' next='' pages=0 whole=0 shown='' withheld=0 stopped=0 stopping
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
  # The task's log from its head, page by page: GetLogEvents can answer a page partly full or even empty
  # while more follow, so the read goes on with the forward token, held to its shape before aws reads it,
  # until the token comes back as sent (the stream's end), five pages at most. No step of it fails the job;
  # a read that stops short of the end says so.
  while [ "$pages" -lt 5 ]; do
    if [ -z "$cursor" ]; then
      page=$(get aws logs get-log-events --log-group-name "/hearth/$STAGE/$kind" --log-stream-name "$kind/server/$\{task##*/}" --start-from-head --query '{events: events[].message, next: nextForwardToken}' --output json) || break
    else
      page=$(get aws logs get-log-events --log-group-name "/hearth/$STAGE/$kind" --log-stream-name "$kind/server/$\{task##*/}" --start-from-head --next-token "$cursor" --query '{events: events[].message, next: nextForwardToken}' --output json) || break
    fi
    pages=$((pages + 1))
    joined=$(jq -c --argjson more "$(jq -c '.events // []' <<<"$page" 2>/dev/null)" '. + $more' <<<"$log" 2>/dev/null) || break
    log=$joined
    next=$(jq -r '.next // ""' <<<"$page" 2>/dev/null) || break
    [[ "$next" =~ ^[A-Za-z0-9][A-Za-z0-9/+=_-]{0,511}$ ]] || break
    if [ "$next" = "$cursor" ]; then
      whole=1
      break
    fi
    cursor=$next
  done
  shown=$(jq -r '.[]' <<<"$log" | grep -E "$lines" || true)
  withheld=$(jq --argjson shown "$(printf '%s' "$shown" | grep -c '^' || true)" 'length - $shown' <<<"$log" || true)
  if [ -n "$shown" ]; then printf '%s\n' "$shown" | mask | tee -a "$GITHUB_STEP_SUMMARY"; fi
  echo "$kind: $withheld log lines withheld" | mask | tee -a "$GITHUB_STEP_SUMMARY"
  if [ "$whole" = 0 ]; then echo "$kind: the log may hold lines the job didn't read" | mask | tee -a "$GITHUB_STEP_SUMMARY"; fi
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

// The artifacts' names (DPW-10 pins it, and DPW-14 holds each call alone; the ninth review's first attack):
// before any download in a credentialed job, each artifact id another job's output carries is held to one number
// naming an artifact of this run under the name its upload gives it, and a digest of the shape upload-artifact
// records (or none), so download-artifact, whose own log no stop-commands reaches, prints that name, the id, a
// size and that digest alone.
export const ARTIFACT_NAMES = sh`# The artifacts' names (C11-D61): download-artifact prints each artifact it fetches, by its name, on
# a line of its own in an action's step, which no stop-commands reaches, and the runner reads a
# ##[name] anywhere in such a line as a workflow command (add-mask among them, job-wide: it drops
# services_started, and with it the pipeline's rollback, and hides words of the approver's diff).
# The id each download takes is another job's output, which that job's code can choose, and so the
# artifact's name, so before any download each id is held to one number naming an artifact of this
# run under the name its upload gives it. The download's line also prints the id, the size and the
# digest the upload recorded, which the uploading job's code chooses as it chooses the name (its
# finalize call sends the digest it computed), so the artifact's digest is held to sha256 and 64
# lower-case hex digits, as upload-artifact writes it, or none; a planted one reads as not this run's
# artifact. The line then holds the name, numbers and that digest alone (and download-artifact
# fails its step when the digest isn't the bytes' it fetched, before any later step runs). The id,
# never a name, is what binds the download to the artifact its job uploaded, which no later job can
# replace.
# An empty id is no download (its step's if:), and so no check or diff of what it would hold, and
# the code of the job that makes the artifact can leave it empty (its upload replaced on disk), so
# an empty id passes only where the call's third word is false, which its step's env sets from the
# gate's outputs where this run makes no such artifact for this job; anywhere else the job stops.
artifact_named() {
  local found
  if [ -z "$1" ]; then
    if [ "$3" = false ]; then return 0; fi
    echo "artifacts: this run makes $2 for this job, and its id is empty"
    exit 1
  fi
  if ! [[ "$1" =~ ^[1-9][0-9]{0,18}$ ]]; then
    echo 'artifacts: an artifact id is not one number'
    exit 1
  fi
  found=$(gh api "repos/$REPO/actions/artifacts/$1" --jq 'select(.digest == null or (.digest | test("\\Asha256:[0-9a-f]{64}\\z"))) | .name + " " + (.workflow_run.id | tostring)')
  if [ "$found" != "$2 $GITHUB_RUN_ID" ]; then
    echo "artifacts: artifact $1 is not this run's $2"
    exit 1
  fi
}`

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
// on its own head repository and branch (never another fork's at the same commit) whose latest attempt
// started while the pull request was open, and its jobs; and whether another pull request from its head
// could have made such a run (shared), read from every page of the head's pull requests; for history.ts
// plan to decide. GitHub ties no run to the pull request that started it, so the merged one's own run is
// told only by when it started and which pull requests from its head were open then: one from the same
// branch name that closed before it opened, at another commit (Renovate reuses its branch names), leaves it
// unshared, while one open at any moment while it was, or one at its head commit, shares it. GitHub's own
// required checks read a commit's checks by its sha too, and a re-run, inside that window, of a closed pull
// request's earlier run at the same commit (which needs the branch pushed back to that commit) can't be
// told apart: that is what stays. A base changed while the pull request was open starts a run on the merge
// into the new base, since ci.yml runs on the edited activity too (CI_ON), so the newest run is that one: by
// GitHub's default activities a base change started none, and the newest run had tested the merge into the old
// base, whose own commits (a test excluded, say) had passed checks the merged tree failed (round 12's third
// iteration, its second pass).
export const PULL_CHECKS = sh`set -euo pipefail
# For a deploy (C11-D49): the merged pull request into main whose merge commit is this run's, its
# head's tree, and the conclusions of its ci.yml run's check and migrations jobs on that head: the
# newest such run from the pull request's own head repository and branch (so another fork's pull
# request at the same commit is never read; its path read without any @<ref> GitHub adds, which is
# exact since no workflow's own name holds an @, DPW-04's folder rule) whose
# latest attempt started (run_started_at) at or after the pull request's created_at and at or before
# its merged_at, so a run re-run after the merge isn't counted and, with no other, its checks read as
# missing; read from the run and its jobs, never from a check run, which any token with checks: write
# can make, and from a listing of runs read whole (a full page reads as none).
# GitHub ties no run to the pull request that triggered it, so a run of another pull request from the
# same head at the same commit (into another base, testing another merge) would read as the merged
# one's. So shared is true when another pull request from that head, in any state, was open at any
# moment while the merged one was (created at or before its merged_at, and closed at or after its
# created_at, or never closed), or has its head commit as its own, or when the head's pull requests
# can't be read whole (every page, up to ten of 100, every entry from that head, the merged one among
# them once), and history.ts refuses a shared head. One from the same branch that closed before this one
# opened, at another commit, leaves it unshared: Renovate reuses its branch names. What stays: GitHub's
# own required checks read a commit's checks by its sha too, and a re-run, inside that window, of a
# closed pull request's earlier run at the same commit (which needs the branch pushed back to that
# commit) can't be told apart.
# history.ts plan decides; no merged pull request writes pull: null. PULL keeps only the fields the
# step reads, never the body its author writes (or anyone who can push to its head, after the merge),
# since PULL is one argument to jq and Linux refuses one over 128 KiB.
if [ "$\{MODE:-deploy}" != deploy ] || [ "$TARGET" = restore ]; then exit 0; fi
PULLS=$(gh api "repos/$REPO/commits/$SHA/pulls")
PULL=$(jq -c --arg sha "$SHA" '[.[] | select(.merged_at != null and .base.ref == "main" and .merge_commit_sha == $sha)] | if length == 1 then .[0] | {number, created_at, merged_at, merge_commit_sha, base: {ref: .base.ref}, head: {sha: .head.sha, ref: .head.ref, label: .head.label, repo: {id: .head.repo.id}}} else null end' <<<"$PULLS")
if [ "$PULL" = null ]; then
  jq -n '{pull: null, base: "", mergeCommit: "", headTree: "", shared: false, check: "", migrations: ""}' >"$RUNNER_TEMP/checks.json"
  exit 0
fi
HEAD=$(jq -er '.head.sha | select(test("^[0-9a-f]{40}$"))' <<<"$PULL")
TREE=$(gh api "repos/$REPO/git/commits/$HEAD" --jq .tree.sha)
LABEL=$(jq -er '.head.label | select(type == "string" and test("\\A[A-Za-z0-9-]+:[^[:cntrl:]]+\\z")) | @uri' <<<"$PULL")
OPENED='[]'
WHOLE=false
for PAGE in 1 2 3 4 5 6 7 8 9 10; do
  LISTED=$(gh api "repos/$REPO/pulls?state=all&head=$LABEL&sort=created&direction=asc&per_page=100&page=$PAGE" --jq '[.[] | {number, label: .head.label, sha: .head.sha, created_at, closed_at}]')
  OPENED=$(jq -c --argjson listed "$LISTED" '. + $listed' <<<"$OPENED")
  if jq -e 'length < 100' <<<"$LISTED" >/dev/null; then
    WHOLE=true
    break
  fi
done
SHARED=$(jq --argjson pull "$PULL" --argjson whole "$WHOLE" '
  ($pull.created_at | fromdateiso8601) as $created | ($pull.merged_at | fromdateiso8601) as $merged
  | ($whole | not) or ([.[] | select(.number == $pull.number)] | length) != 1 or any(.[]; .label != $pull.head.label)
    or any(.[]; .number != $pull.number and (.sha == $pull.head.sha or ((.created_at | fromdateiso8601) <= $merged and (.closed_at == null or (.closed_at | fromdateiso8601) >= $created))))' <<<"$OPENED")
RUNS=$(gh api "repos/$REPO/actions/runs?head_sha=$HEAD&event=pull_request&per_page=100")
RUN_ID=$(jq -r --arg head "$HEAD" --argjson pull "$PULL" '($pull.created_at | fromdateiso8601) as $created | ($pull.merged_at | fromdateiso8601) as $merged | if (.workflow_runs | length) >= 100 then "" else [.workflow_runs[] | select((.path | sub("@.*$"; "")) == ".github/workflows/ci.yml" and .head_sha == $head and ($pull.head.repo.id | type == "number") and .head_repository.id == $pull.head.repo.id and .head_branch == $pull.head.ref and (.run_started_at | type == "string") and (.run_started_at | fromdateiso8601) >= $created and (.run_started_at | fromdateiso8601) <= $merged)] | max_by(.id) | .id // "" end' <<<"$RUNS")
JOBS='{"jobs": []}'
if [ -n "$RUN_ID" ]; then JOBS=$(gh api "repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100"); fi
jq -n --argjson pull "$PULL" --arg tree "$TREE" --argjson jobs "$JOBS" --argjson shared "$SHARED" '
  def conclusion($name): [$jobs.jobs[] | select(.name == $name)] | if length == 1 then (.[0].conclusion // "pending") else "missing" end;
  {pull: $pull.number, base: $pull.base.ref, mergeCommit: $pull.merge_commit_sha, headTree: $tree, shared: $shared, check: conclusion("check"), migrations: conclusion("migrations")}' >"$RUNNER_TEMP/checks.json"`

// prod-gate's wait for main's own CI (C11-D52, DPW-08): ci.yml's push run on main for this commit, its check
// and migrations jobs, until both succeed.
export const MAIN_CI = sh`set -euo pipefail
# main's own CI on this commit (C11-D52): ci.yml's push run on main (its path read without any @<ref>
# GitHub adds, which is exact since no workflow's own name holds an @, DPW-04's folder rule), the
# newest, read from the run and its jobs (never a check run, which any token with
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
# the gate's digest and above every floor at this commit; and prod's newest record is the gate's.
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
export const FAST_RECHECK_NONPROD = sh`${STOP_HEAD}
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
export const FAST_RECHECK_PROD = sh`${STOP_HEAD}
# The fast re-check (C11-D52), after the approval and before the credentials. A prod deploy, rollback
# or restore is approved against the diff prod-plan read in this attempt: a re-run of this job alone,
# or of the failed jobs, keeps an earlier attempt's diff (and prod-gate's read, unless prod-gate
# was re-run too), so it refuses, and re-running prod-plan re-runs prod-gate and this job after it,
# while no prod release has been recorded since the gate (prod-gate refuses record-changed then, and
# all jobs are re-run, or the run dispatched afresh).
# Then prod's newest release record, read again and checked by its shape, is the one prod-gate
# read; a deploy's commit descends from it (none on a first deploy) and its image is the one the
# build made and non-prod deployed in this run.
if [ "$PLAN_ATTEMPT" != "$GITHUB_RUN_ATTEMPT" ]; then
  echo "fast re-check: prod-plan's diff is from another attempt of this run: re-run prod-plan, which re-runs prod-gate and this job after it, or, once a prod release has been recorded since this run's gate, re-run all jobs (while the commit is main's head) or dispatch afresh (deploy-and-rollback.md)"
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
// which its step sets once; every deploy with --exclusively and --no-previous-parameters. The CLI's default,
// --previous-parameters, sends CloudFormation UsePreviousValue for every parameter the deployed stack already
// has, so its template's Default, the only value prod-plan's diff can show, would never deploy: a release
// could add a parameter read by nothing, then change its Default and make a grant conditional on it, and the
// approver would read the new Default while the stack kept the old value (the eighth review's second
// attack). With the flag, every parameter takes its template's Default, or the deploy refuses one with none.
const DEPLOY_FLAGS =
  '--exclusively --no-previous-parameters --require-approval never --no-lookups --no-notices --ci --progress events'
export const CDK_DEPLOY_FORWARD = `run "$CDK" deploy --app "$ASSEMBLY" "$STAGE/Platform" "$STAGE/Data" "$STAGE/Tasks" --exclusively --concurrency 2 --no-previous-parameters --require-approval never --no-lookups --no-notices --ci --progress events`
export const CDK_DEPLOY_SERVICES = `run "$CDK" deploy --app "$ASSEMBLY" "$STAGE/Services" ${DEPLOY_FLAGS}`
export const CDK_DEPLOY_DRILL = `if ${CDK_DEPLOY_SERVICES}; then`
export const CDK_DEPLOY_ROLLBACK = `run "$CDK" deploy --app "$ASSEMBLY" "$STAGE/Tasks" "$STAGE/Services" ${DEPLOY_FLAGS}`
export const CDK_DEPLOY_DOWN = `run "$CDK" deploy --app "$ASSEMBLY" "$STAGE/$PART" ${DEPLOY_FLAGS}`
export const CDK_DIFF_PROD = `run "$CDK" diff --app "$ASSEMBLY" "$STAGE/*" --method template --no-lookups --no-notices --no-color --fail-on never`
export const CDK_DIFF_ROLLBACK = `run "$CDK" diff --app "$ASSEMBLY" "$STAGE/Tasks" "$STAGE/Services" --exclusively --method template --no-lookups --no-notices --no-color --fail-on never`
// A restore taken down's diff: one stack at a time, each one restore=down deploys (RESTORE_DOWN_DIFF).
export const CDK_DIFF_DOWN = `run "$CDK" diff --app "$ASSEMBLY" "$STAGE/$PART" --exclusively --method template --no-lookups --no-notices --no-color --fail-on never`
// restore=down (C11-D45; TECH-SPEC T24 item 18, DPW-06): Services, then Data, then Platform, one call each,
// each only for a restore stack that exists and has settled; one a failed create left (ROLLBACK_COMPLETE,
// or REVIEW_IN_PROGRESS, which never settles) is skipped, and one whose rollback failed too
// (ROLLBACK_FAILED, which the CLI would delete and create again) is skipped and fails the step after the
// others are down. First it reads every stack's status as prod-plan's RESTORE_DOWN_DIFF did and refuses,
// before any deploy, unless it reads what prod-plan read (PLANNED, its down output), so down deploys only the
// stacks the approved diff showed: one that didn't exist or that a failed create left when prod-plan read it,
// and that another restore's up has since created or recreated, is never deployed from a template no diff
// showed (the eighth review's first attack).
export const RESTORE_DOWN = sh`SEEN=''
for PART in Services Data Platform; do
  if ! STATUS=$(get aws cloudformation describe-stacks --stack-name "Hearth-$STAGE-$PART" --query 'Stacks[0].StackStatus' --output text 2>&1); then
    case "$STATUS" in
      *'does not exist'*)
        STATUS=missing
        ;;
      *)
        echo "restore down: Hearth-$STAGE-$PART can't be read" | mask
        exit 1
        ;;
    esac
  fi
  SEEN="$SEEN$PART:$STATUS,"
done
if [ "$SEEN" != "$PLANNED" ]; then
  echo "restore down: the restore stage changed since prod-plan diffed it (prod-plan read $PLANNED, down reads $SEEN), so nothing is taken down: dispatch restore=down again" | mask | tee -a "$GITHUB_STEP_SUMMARY"
  exit 1
fi
KEPT=''
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

// A restore taken down's diff (C11-D45, C11-D51, DPW-08; review 7 ACTIONS-01): prod-plan diffs only what
// restore=down deploys, each stack decided as RESTORE_DOWN decides it, by the status the diff role reads. The
// CLI diffs a stack that doesn't exist against an empty template, every resource as added, and down skips such
// a stack, one a failed create left and one whose failed create couldn't roll back, so a diff of all three
// showed the approver a down creating what it never deploys (three ECS services, after an up that failed
// before Services); and a stack whose create waits for review has no template to read, so the diff failed and
// down could never run. Each stack down skips is named in the summary above the diff, through the filter, and
// not diffed; one still moving, or one that can't be read, fails the diff, as down would refuse it.
export const RESTORE_DOWN_DIFF = sh`# A restore taken down (RESTORE_DOWN_DIFF; C11-D45, C11-D51): only what restore=down deploys, each stack
# alone and in its order, decided as RESTORE_DOWN decides it, so the diff shows no stack down skips as
# created. One that doesn't exist, that a failed create left or whose failed create couldn't roll back is
# named above the diff, through the filter, and not diffed; one still moving, or one that can't be read,
# fails the diff, as it would fail down. Its status is DOWN_STATUS, which the run then takes as the diff's.
# What it read of each stack (DOWN_READ: missing, or its status) is the job's down output, which the prod
# job's down holds the stage to, so down deploys no stack this diff didn't show.
DOWN_STATUS=0
DOWN_READ=''
if [ "$MODE" != rollback ] && [ "$RESTORE" = down ]; then
  : >"$DIFF"
  for PART in Services Data Platform; do
    if ! PART_STATUS=$(get aws cloudformation describe-stacks --stack-name "Hearth-$STAGE-$PART" --query 'Stacks[0].StackStatus' --output text 2>&1); then
      case "$PART_STATUS" in
        *'does not exist'*)
          echo "restore down: Hearth-$STAGE-$PART doesn't exist, so down skips it and it isn't diffed" | mask | tee -a "$GITHUB_STEP_SUMMARY"
          DOWN_READ="$DOWN_READ$PART:missing,"
          continue
          ;;
        *)
          echo "restore down: Hearth-$STAGE-$PART can't be read, so the diff fails" | mask | tee -a "$GITHUB_STEP_SUMMARY"
          DOWN_STATUS=1
          break
          ;;
      esac
    fi
    case "$PART_STATUS" in
      '' | *[!A-Z_]*)
        echo "restore down: Hearth-$STAGE-$PART can't be read, so the diff fails" | mask | tee -a "$GITHUB_STEP_SUMMARY"
        DOWN_STATUS=1
        break
        ;;
    esac
    DOWN_READ="$DOWN_READ$PART:$PART_STATUS,"
    case "$PART_STATUS" in
      ROLLBACK_COMPLETE | REVIEW_IN_PROGRESS)
        echo "restore down: Hearth-$STAGE-$PART is what a failed create left, so down skips it and it isn't diffed" | mask | tee -a "$GITHUB_STEP_SUMMARY"
        continue
        ;;
      ROLLBACK_FAILED)
        echo "restore down: Hearth-$STAGE-$PART is ROLLBACK_FAILED (a failed create whose rollback failed), so down skips it and it isn't diffed: down takes the others down, then fails, since it waits for tier 2" | mask | tee -a "$GITHUB_STEP_SUMMARY"
        continue
        ;;
      *_IN_PROGRESS)
        echo "restore down: Hearth-$STAGE-$PART is $PART_STATUS, which down refuses, so the diff fails: wait for it to settle, then dispatch again" | mask | tee -a "$GITHUB_STEP_SUMMARY"
        DOWN_STATUS=1
        break
        ;;
    esac
    {
      ${CDK_DIFF_DOWN}
    } >>"$DIFF" || {
      DOWN_STATUS=$?
      break
    }
  done
  if [ "$DOWN_STATUS" = 0 ]; then echo "down=$DOWN_READ" >>"$GITHUB_OUTPUT"; fi
fi`

// What prod-plan diffed (PLAN_BASIS; DPW-08, TECH-SPEC T24 item 20; round 11). An approval in prod was tied to
// prod-plan's diff only by the attempt and by prod's newest record, which prod-gate reads after prod-plan, so
// another run's rollback (or deploy, or a change outside the pipeline) that moved prod's stacks after prod-plan
// diffed them, recorded before prod-gate read or not yet recorded, had prod deploy over a state no line of the
// approved diff showed: a rolled-back release's Tasks and Services changes went in again unseen. prod-plan now
// reads each of its stage's four stacks before it diffs, its status and the time of its last change, refusing
// one still moving, and outputs that read; prod reads the same once it holds its credentials, before it checks,
// pushes or deploys anything, and goes on only while it reads exactly what prod-plan read. A restore taken down
// reads it too (round 11): its own read (RESTORE_DOWN's PLANNED) is each restore stack's status alone, which
// decides the stacks down skips, and every restore stack reads UPDATE_COMPLETE after each up or down, so an
// up between prod-plan's diff and down's deploy left every status as prod-plan read it and down deployed over
// templates its approved diff never showed.
export const PLAN_BASIS = sh`# What prod-plan diffed (PLAN_BASIS; DPW-08): each of the stage's four stacks as CloudFormation answers for
# it, its status and the time of its last change (its last update, or its creation for one never updated), or
# missing. prod-plan reads it before its diff and outputs it (plan), refusing a stack still moving (every
# status in progress but REVIEW_IN_PROGRESS, which a create that never ran leaves), whose template its diff
# would read on its way elsewhere; prod reads it again once it holds its credentials, before anything else
# (check), and goes on only while it reads exactly what prod-plan read, so no change to the stage since the
# diff, another run's rollback or deploy, recorded or not, among them, deploys under an approval of a diff that
# never showed it. A restore taken down reads it too: down's own read (PLANNED) holds only which stacks it
# skips, by status alone, which an up between the two leaves as it was (every restore stack UPDATE_COMPLETE).
plan_basis() {
  local step=$1 PART answer status basis=''
  for PART in Platform Data Tasks Services; do
    if ! answer=$(get aws cloudformation describe-stacks --stack-name "Hearth-$STAGE-$PART" --query 'Stacks[0].[StackStatus, LastUpdatedTime || CreationTime]' --output json 2>&1); then
      case "$answer" in
        *'does not exist'*)
          basis="$basis$PART:missing,"
          continue
          ;;
        *)
          echo "plan-basis: Hearth-$STAGE-$PART can't be read" | mask | tee -a "$GITHUB_STEP_SUMMARY"
          exit 1
          ;;
      esac
    fi
    if ! status=$(jq -er 'select(type == "array" and length == 2 and (.[0] | type == "string" and test("\\A[A-Z_]+\\z")) and (.[1] | type == "string" and test("\\A[0-9][0-9:.TZ+-]*\\z"))) | "\(.[0])@\(.[1])"' <<<"$answer"); then
      echo "plan-basis: Hearth-$STAGE-$PART can't be read" | mask | tee -a "$GITHUB_STEP_SUMMARY"
      exit 1
    fi
    case "$status" in
      REVIEW_IN_PROGRESS@*) ;;
      *_IN_PROGRESS@*)
        echo "plan-basis: Hearth-$STAGE-$PART is $\{status%%@*}: wait for it to settle, then re-run prod-plan" | mask | tee -a "$GITHUB_STEP_SUMMARY"
        exit 1
        ;;
    esac
    basis="$basis$PART:$status,"
  done
  case "$step" in
    plan)
      echo "basis=$basis" >>"$GITHUB_OUTPUT"
      ;;
    check)
      if [ "$basis" != "$BASIS" ]; then
        echo "plan-basis: Hearth-$STAGE changed since prod-plan diffed it (prod-plan read $BASIS, this job reads $basis), so nothing moves: re-run prod-plan, read its fresh diff and approve again, or, once a prod release has been recorded since this run's gate, re-run all jobs (while the commit is main's head) or dispatch afresh (deploy-and-rollback.md)" | mask | tee -a "$GITHUB_STEP_SUMMARY"
        exit 1
      fi
      echo "plan-basis: Hearth-$STAGE is as prod-plan diffed it" | mask | tee -a "$GITHUB_STEP_SUMMARY"
      ;;
  esac
}`

// The image check (C11-D50, C11-D79, DPW-13): check_image_archive and unpack_image, defined here and called by
// nonprod's and prod's step that checks and unpacks the downloaded archive, before the credentials action,
// and check_image_archive by the build on the archive buildx wrote. The archive is written by a job that runs
// repository code, and skopeo's oci-archive source unpacks every member as it comes, following an absolute
// symbolic link an earlier member made, so a member could rewrite the CLI CLI_CHECK checked or the assembly
// ASSET_CHECK checked; skopeo is instead handed the folder GNU tar unpacked, an OCI layout it only reads,
// once the listing and the folder hold only what buildx's OCI export writes.
export const IMAGE_CHECK = sh`# The image's archive (IMAGE_CHECK; C11-D50, C11-D79, DPW-13). The build job runs repository code, so the
# archive it uploads is data: before any credential, a deploy job lists it, unpacks it itself and pushes
# from the folder it unpacked, never handing skopeo the archive, whose oci-archive source unpacks every
# member as it comes and writes a later one through a link an earlier one made (over the CLI, say).
# check_image_archive lists it with GNU tar and refuses any member that isn't a folder blobs/ or
# blobs/sha256/, or a file oci-layout, index.json or blobs/sha256/<64 hex>, as buildx's OCI export writes
# them: no symbolic or hard link, device, fifo, absolute, escaped or other name. unpack_image then has the
# same tar unpack it into a folder it makes, and refuses unless that folder holds only those folders and
# files, which skopeo reads as an OCI layout. Each count is compared whole, so a tool that fails refuses.
# Both hand tar the archive on its standard input, never by name: given a file, GNU tar runs whatever
# decompressor the archive's first bytes name (gzip, bzip2, xz, zstd) over the build's bytes, with the
# step's environment; reading standard input it refuses a compressed archive and runs nothing.
# The build runs check_image_archive on the archive buildx wrote, so a change in buildx's export fails
# there first; the deploy job's own check, of the file it downloaded, is the one its push rests on.
check_image_archive() {
  local listing
  listing=$(tar --list --verbose --numeric-owner --quoting-style=escape --file - <"$1") ||
    { echo "image-check: the image's archive can't be read"; exit 1; }
  [ "$(grep -Ec '^(-[-rwxsStT]{9} [0-9]+/[0-9]+ +[0-9]+ [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} (oci-layout|index\.json|blobs/sha256/[0-9a-f]{64})|d[-rwxsStT]{9} [0-9]+/[0-9]+ +0 [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} blobs/(sha256/)?)$' <<<"$listing")" = "$(wc -l <<<"$listing")" ] ||
    { echo "image-check: the image's archive holds a member buildx's OCI export never writes"; exit 1; }
}
unpack_image() {
  local entries
  mkdir "$2"
  tar --extract --file - --directory "$2" --no-same-owner --no-same-permissions <"$1"
  entries=$(find "$2" -mindepth 1 -printf '%y %P\n')
  [ "$(grep -Ec '^(f (oci-layout|index\.json|blobs/sha256/[0-9a-f]{64})|d blobs(/sha256)?)$' <<<"$entries")" = "$(wc -l <<<"$entries")" ] ||
    { echo "image-check: the unpacked image holds a link or a file buildx's OCI export never writes"; exit 1; }
}`
// The deploy jobs' step that checks and unpacks the image (DPW-13), before the credentials action, under the
// push's if:: the archive the build uploaded, into the folder the push copies from. It stops the runner
// reading workflow commands first (STOP_HEAD): GNU tar names an unknown pax header keyword on stderr as it
// is, and a keyword may hold a line break, so the archive's own headers could otherwise end a line with
// ##[add-mask] and a value of the build's choosing.
export const IMAGE_LAYOUT = '$RUNNER_TEMP/image-layout'
export const IMAGE_UNPACK_RUN = [
  STOP_HEAD,
  IMAGE_CHECK,
  'check_image_archive "$RUNNER_TEMP/image/image.tar"',
  `unpack_image "$RUNNER_TEMP/image/image.tar" "${IMAGE_LAYOUT}"`,
].join('\n')

// The push (C11-D50, C11-D79, DPW-07, DPW-13): the login, the only skopeo line not through run, and the copy
// of the build's own image, its digest kept, to this run's own tag, from the OCI layout IMAGE_CHECK unpacked
// and checked (never oci-archive:, whose source would unpack the archive itself).
export const SKOPEO_LOGIN = `get aws ecr get-login-password --region ap-southeast-1 | skopeo login --username AWS --password-stdin "$REGISTRY" 2>&1 | mask`
export const SKOPEO_COPY = `run skopeo copy --preserve-digests --digestfile "$RUNNER_TEMP/pushed" "oci:${IMAGE_LAYOUT}:build" "docker://$REGISTRY/hearth-server:sha-$COMMIT-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"`

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
# one manifest, and its members must be the ones buildx's OCI export writes (IMAGE_CHECK); the very
# archive this job checks is the one each deploy job checks again, unpacks itself and pushes.
docker buildx build --platform linux/arm64 --provenance=false --sbom=false -f apps/server/Dockerfile --metadata-file "$RUNNER_TEMP/meta.json" --output "type=oci,dest=$RUNNER_TEMP/image.tar,name=hearth-server:build" .
DIGEST=$(jq -er '."containerimage.digest" | select(test("^sha256:[0-9a-f]{64}$"))' "$RUNNER_TEMP/meta.json")
INDEX=$(tar -xOf "$RUNNER_TEMP/image.tar" index.json | jq -er '.manifests | select(length == 1) | .[0].digest')
if [ "$DIGEST" != "$INDEX" ]; then
  echo "build: the build's digest isn't the archive's one manifest"
  exit 1
fi
${IMAGE_CHECK}
check_image_archive "$RUNNER_TEMP/image.tar"
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
// each upload are DPW-14's ASSET_CHECK_RUN. Synth holds no secret and runs repository code by design, but
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
# The release ${stage} runs now, for its automatic rollback, synthesised on a runner of its own,
# which runs no other commit's code, so neither this commit's code nor the release's changes the other.
npm run synth -w @hearth/infra -- -c release="$COMMIT:$DIGEST" -o "$RUNNER_TEMP/assembly-previous-${stage}"`

// --- The runs the guard pins whole (DPW-08, DPW-09, DPW-10, DPW-13) --------------------------------------

// Each run whose exit or outputs a gate, an approval, a smoke, a rollback or a record rests on, pinned whole
// as the workflow pastes it, so no line of its own can end it early, write an output, a file or a record of
// its own, or hand one of its lines another input: the gate's reads of the records and main's ruleset (and
// its plan, PLAN_STEP), prod-gate's read of prod's records, the deploy jobs' release, push, migrate and its
// record, services_started and read-back, the rollback jobs' releases, read-back and rolled, prod-plan's
// diff, the smokes and the record jobs; every other run of a job that holds the deploy role; and the gate's
// and prod-gate's other reads, and every run of build and synth, so no run of deploy.yml has a line of its
// own (PINNED_RUNS). A change to one, a glue line included, changes this constant and deploy.yml together,
// and the owner's read of it holds the change (the header's last paragraph); the rest of each such run's rules
// still read it, as a second layer.

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
export const RELEASE_STEP = sh`${STOP_HEAD}
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
export const PREVIOUS_STEP = sh`${STOP_HEAD}
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
# balancer's idle timeout. A service that doesn't exist (a restore stage never brought up) is left out;
# one a restore taken down keeps at desired 0 is read back as it stands. Its outputs: the read-back, each
# service's PRIMARY definition as family:revision, and the release the Services stack now says it runs.
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

// prod-plan's diff (C11-D51, DPW-08): what the approver reads, into the log and the summary. The summary is
// GitHub Flavored Markdown, and the diff prints a release's own text as it is (a template's strings, an
// annotation, a validation report), so the diff is written as an indented code block: every line four
// spaces in, every carriage return made a line break first (Markdown reads a lone one as a line's end), so
// no line of it can end the block or open HTML that hides the rest, as a line of three backticks would end
// a fenced block and a line starting <!-- then hide everything after it. Four spaces a line can make the
// text five times longer, so it is cut at 200 KB, under a step summary's 1 MiB.
export const DIFF_CUT = 204800
export const DIFF_RUN = sh`${PREAMBLE}
${PLAN_BASIS}
# The diff the approver reads (C11-D51): the assembly against the templates deployed in prod's account,
# read with the plan role's own credentials (its lookup role is refused), for a deploy every prod stack,
# for a rollback its Tasks and Services, for a restore up every restore stack (STAGE), and for one taken
# down the stacks it deploys (RESTORE_DOWN_DIFF); into the log, and into the summary cut at 200 KB, both
# through the filter. A diff that fails still shows the CLI's message in both, then fails the step. In the
# summary it is an indented code block, each line four spaces in and each carriage return a line break, so
# no line of a release's own text ends the block or opens HTML that hides what follows. What it diffs against is
# read first (PLAN_BASIS) and is the job's basis output, which prod holds the stage to.
ASSEMBLY="$RUNNER_TEMP/assembly"
DIFF="$RUNNER_TEMP/diff.txt"
STATUS=0
${CDK_FOLDER}
plan_basis plan
if [ "$MODE" = rollback ]; then
  {
    ${CDK_DIFF_ROLLBACK}
  } >"$DIFF" || STATUS=$?
elif [ "$RESTORE" != down ]; then
  {
    ${CDK_DIFF_PROD}
  } >"$DIFF" || STATUS=$?
fi
${RESTORE_DOWN_DIFF}
if [ "$DOWN_STATUS" != 0 ]; then STATUS="$DOWN_STATUS"; fi
cat "$DIFF"
{
  if [ "$STAGE" = restore ]; then echo "### What the restore changes"; else echo "### What prod's $MODE changes"; fi
  echo ''
  head -c ${String(DIFF_CUT)} "$DIFF" | tr '\r' '\n' | sed 's/^/    /'
  echo ''
  echo ''
  if [ "$(wc -c <"$DIFF")" -gt ${String(DIFF_CUT)} ]; then echo "The diff is cut at 200 KB here; the job's log holds it whole."; fi
  if [ "$STATUS" != 0 ]; then echo "The diff failed (exit $STATUS), so this plan fails; the CLI's message is above."; fi
} | mask >>"$GITHUB_STEP_SUMMARY"
exit "$STATUS"`

// The automatic rollback's diff (C11-D51; the seventh review's second attack): prod's previous release as
// prod's rollback job would deploy it, the assembly synth-previous-prod made by rebuilding that release from
// its own code, against the Tasks and Services deployed in prod's account now, which are that release's, so
// it shows no change unless the rebuild differs from what runs, or a prod run since prod's newest record got
// past its Tasks deploy and wrote none (review 7 ROLLBACK-01). A release's own code can tell a rebuild from its own deploy (the
// CLI hands the app its output folder, CDK_OUTDIR) and write a resource only into the rebuild; the rollback
// job deploys the very artifact read here, by its id, so the approver reads before approving prod, and again
// before approving the rollback, what the rollback would deploy. Its Tasks and Services alone, as the
// rollback deploys them, into the log and the summary as the release's diff is.
export const ROLLBACK_DIFF_RUN = sh`${PREAMBLE}
# The automatic rollback's diff (C11-D51): prod's previous release as prod's rollback job would deploy it
# (synth-previous-prod's assembly, a rebuild of that release's own code), against the Tasks and Services
# deployed in prod's account now, read with the plan role's own credentials. It shows no change unless the
# rebuild differs from what runs, or a prod run since prod's newest record got past its Tasks deploy and
# wrote none, whose templates it shows going back (deploy-and-rollback.md step 4); into the log, and into
# the summary cut at 200 KB, as the release's diff is.
ASSEMBLY="$RUNNER_TEMP/assembly-previous"
DIFF="$RUNNER_TEMP/diff.txt"
STATUS=0
${CDK_FOLDER}
{
  ${CDK_DIFF_ROLLBACK}
} >"$DIFF" || STATUS=$?
cat "$DIFF"
{
  echo "### What prod's automatic rollback changes"
  echo ''
  head -c ${String(DIFF_CUT)} "$DIFF" | tr '\r' '\n' | sed 's/^/    /'
  echo ''
  echo ''
  if [ "$(wc -c <"$DIFF")" -gt ${String(DIFF_CUT)} ]; then echo "The diff is cut at 200 KB here; the job's log holds it whole."; fi
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
  if [ "$SMOKE" = skipped ] || [ "$SMOKE" = cancelled ]; then
    echo "record: the release's smoke didn't run or didn't finish (its deploy job was rejected, refused or failed, or the smoke was cancelled), so the run ends red"
  else
    echo "record: the release's own smoke didn't pass, so the run ends red"
  fi
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
// The asset check every step that checks an assembly runs (DPW-14): STOP_HEAD, ASSET_CHECK and its two calls, one
// text for every folder, so deploy.yml writes it once (RUN_ANCHORS). Each call reads the folder from the step's
// ASSEMBLY_FOLDER and the release that folder holds from its RELEASE (in a previous assembly's check, the previous
// release, which the step's PREVIOUS, now read by nothing, names too), both from the step's env:, which GitHub sets
// before bash starts: STEP_ENVS pins each step's two values, DPW-14 holds its ASSEMBLY_FOLDER to ASSEMBLY_FOLDERS and the folder
// its download or upload names and its RELEASE to the release that folder holds, no canonical text sets either
// (ENV_GIVEN_RULE, DPW-10), and no canonical text expands ASSEMBLY_FOLDER (OWN_LINE_NAMES, DPW-07), so only these
// two lines read it. Each expansion is double-quoted, so neither is split or globbed, and every folder is a plain
// name: each call is handed exactly the words the literal folder and release once wrote on it.
export const ASSET_CHECK_CALLS = [
  'check_assembly "$RUNNER_TEMP/$ASSEMBLY_FOLDER"',
  'check_release_in "$RUNNER_TEMP/$ASSEMBLY_FOLDER" "$RELEASE"',
] as const
export const ASSET_CHECK_RUN = [STOP_HEAD, ASSET_CHECK, ...ASSET_CHECK_CALLS].join('\n')
// The folders an asset check's ASSEMBLY_FOLDER may name (DPW-14): the release's assembly, a rollback's or
// prod-plan's previous one as its download writes it, and each synth-previous job's own.
export const ASSEMBLY_FOLDERS = [
  'assembly',
  'assembly-previous',
  'assembly-previous-nonprod',
  'assembly-previous-prod',
] as const
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
# are still taken down, and the step then fails, since that stack waits for tier 2. Nothing is taken down
# unless every stack reads as prod-plan read it (PLANNED), so down deploys only what the approved diff showed.`,
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
# The status after proves the broken deploy reached CloudFormation only if this deploy moved it there:
# CloudFormation changes a stack's status only when it runs a change set, and a failure before one (an
# asset publish, a throttle, a change set it refuses) leaves the stack as it was. So the drill starts only
# on a stack whose last operation succeeded; one an earlier rollback left (the last drill-break, or a
# forward deploy CloudFormation rolled back) waits for a forward deploy to non-prod.
SETTLED=$(get aws cloudformation describe-stacks --stack-name "Hearth-$STAGE-Services" --query 'Stacks[0].StackStatus' --output text)
if [ "$SETTLED" != UPDATE_COMPLETE ] && [ "$SETTLED" != CREATE_COMPLETE ]; then
  echo "drill-break: the Services stack is $SETTLED before the drill, so its status after couldn't show this deploy reached CloudFormation: dispatch deploy to nonprod first (deploy-and-rollback.md)" | mask
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
  'Check and unpack the image': { run: IMAGE_UNPACK_RUN, rule: 'DPW-13', if: PUSH_IF[stage] },
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
// A credentialed job's artifact check, before its downloads (DPW-10): STOP_HEAD, ARTIFACT_NAMES and a call for
// each artifact the job downloads, each id from the output its download reads (STEP_ENVS) held to the name its
// upload gives it: the release's assembly, the build's image, an environment's previous assembly. Each call's
// third word says whether this run makes that artifact for the job: true where it always does (the synth's
// assembly, and a rollback job's previous one, which runs only when the gate names a previous release), else a
// step env value (DUE_ENVS) that reads false only where the gate's outputs say the artifact's upload doesn't
// run or the download wouldn't, so an empty id never skips a download, and the checks and the diff that read
// it, that the run has an artifact for (the tenth review's second attack: prod's previous release replaced
// the upload action on disk, its job succeeded with no id, and prod-plan skipped the previous assembly's
// check and the rollback diff).
export const ARTIFACTS_STEP = "The artifacts' names"
export const ARTIFACT_CALLS: Readonly<Record<string, readonly string[]>> = {
  nonprod: ['artifact_named "$ASSEMBLY_ID" assembly true', 'artifact_named "$IMAGE_ID" image.tar "$IMAGE_DUE"'],
  'prod-plan': [
    'artifact_named "$ASSEMBLY_ID" assembly true',
    'artifact_named "$PREVIOUS_ID" assembly-previous-prod "$PREVIOUS_DUE"',
  ],
  prod: ['artifact_named "$ASSEMBLY_ID" assembly true', 'artifact_named "$IMAGE_ID" image.tar "$IMAGE_DUE"'],
  'rollback-nonprod': ['artifact_named "$PREVIOUS_ID" assembly-previous-nonprod true'],
  'rollback-prod': ['artifact_named "$PREVIOUS_ID" assembly-previous-prod true'],
}
export const artifactNamesRun = (id: string) => [STOP_HEAD, ARTIFACT_NAMES, ...(ARTIFACT_CALLS[id] ?? [])].join('\n')
// A credentialed job's other runs (DPW-10): before the credentials action its artifact check, its asset check, the
// fast re-check (nonprod and prod), CLI_FETCH, CLI_CHECK and the mask; after them AWS_CHECK with its job's
// call, its CLI steps and its probe, each under its own if:.
const checksBefore = (id: string, recheck?: string): Pinned => ({
  [ARTIFACTS_STEP]: { run: artifactNamesRun(id), rule: 'DPW-10' },
  ...(DEPLOY_JOBS[id]?.rollback === true
    ? { 'Check the previous assembly': { run: ASSET_CHECK_RUN, rule: 'DPW-10' } }
    : { 'Check the assembly': { run: ASSET_CHECK_RUN, rule: 'DPW-10' } }),
  ...(recheck === undefined ? {} : { 'The fast re-check': { run: recheck, rule: 'DPW-10' } }),
  'The pinned CDK CLI': { run: CLI_FETCH, rule: 'DPW-10' },
  "The CLI is the registry's": { run: CLI_CHECK, rule: 'DPW-10' },
  'Mask the account id': { run: MASK_RUN, rule: 'DPW-10' },
})
// What runs' run in a deploy job: AWS_CHECK and its call, and in prod PLAN_BASIS before it, whose check comes
// first, so nothing is checked, pushed or deployed once the stage has changed since prod-plan diffed it.
export const whatRunsText = (id: string): string =>
  [PREAMBLE, AWS_CHECK, ...(id === 'prod' ? [PLAN_BASIS] : []), AWS_CHECK_CALLS[id] ?? ''].join('\n')
const whatRuns = (id: string): Pinned => ({
  'What runs': { run: whatRunsText(id), rule: 'DPW-10' },
})
const credentialedRuns = (id: 'nonprod' | 'prod' | 'prod-plan' | 'rollback-nonprod' | 'rollback-prod'): Pinned => {
  const ifOf = (line: string) => CLI_STEP_IF[id]?.[line]
  const probe = (stage: Stage, job: 'deploy' | 'rollback'): Pinned => ({
    Probe: { run: probeRun(stage, job), rule: 'DPW-10', if: PROBE_IF[id] },
  })
  switch (id) {
    case 'prod-plan':
      return {
        ...checksBefore(id),
        'Check the previous assembly': { run: ASSET_CHECK_RUN, rule: 'DPW-10', if: PLAN_PREVIOUS_IF },
      }
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
// The folder the gate, prod-gate and the four smokes check the run's commit out into, and the folder each of
// their steps that reads the checkout runs in (round 12's fourth iteration): setup-node runs node, npm and yarn
// with --version in its job's workspace, and Yarn 1 runs the program a .yarnrc's yarn-path names, from the
// folder it runs in or any above it, before it reads its arguments. Checked out at the workspace's root, a
// .yarnrc and its program (neither on the owner's-read list) would put another node first on the PATH for
// every later step, and decide the plan, prod-gate's verdict and every smoke. In a folder of its own, the
// checkout is below where setup-node runs, which then reads nothing of the repository's.
export const REPO_FOLDER = 'repo'
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
const previousSynthRuns = (stage: 'nonprod' | 'prod'): Pinned => {
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
    [`Check ${stage}'s previous assembly`]: { run: ASSET_CHECK_RUN, rule: 'DPW-13', if: condition },
  }
}
const synthRuns = (): Pinned => ({
  'Install the release': { run: INSTALL_RUN, rule: 'DPW-13', cwd: 'release' },
  'Synthesise the release': { run: SYNTH_RUN, rule: 'DPW-13', cwd: 'release' },
  "Check the release's assembly": { run: ASSET_CHECK_RUN, rule: 'DPW-13' },
})
export const PINNED_RUNS = (): Readonly<Record<string, Pinned>> => ({
  gate: {
    'The release, migration and restore records': { run: GATE_RECORDS, rule: 'DPW-09' },
    'The pull request that made this commit, and its checks': { run: PULL_CHECKS, rule: 'DPW-08' },
    "main's ruleset is live": { run: RULESET_CHECK, rule: 'DPW-09' },
    'The environments are live as written': { run: ENVIRONMENTS_CHECK, rule: 'DPW-09', cwd: REPO_FOLDER },
    Plan: { run: PLAN_STEP, rule: 'DPW-09', cwd: REPO_FOLDER },
  },
  build: buildRuns(),
  synth: synthRuns(),
  'synth-previous-nonprod': previousSynthRuns('nonprod'),
  'synth-previous-prod': previousSynthRuns('prod'),
  'prod-gate': {
    "Prod's release records": { run: PROD_RECORDS, rule: 'DPW-08' },
    "main's own CI": {
      run: MAIN_CI,
      rule: 'DPW-08',
      if: expr("needs.gate.outputs.mode == 'deploy' && needs.gate.outputs.target == 'prod'"),
    },
    'The environments are live as written': { run: ENVIRONMENTS_CHECK, rule: 'DPW-09', cwd: REPO_FOLDER },
    'The prod gate': { run: PROD_GATE_CALL, rule: 'DPW-08', cwd: REPO_FOLDER },
  },
  nonprod: { ...deployRuns('nonprod'), ...credentialedRuns('nonprod') },
  prod: { ...deployRuns('prod'), ...credentialedRuns('prod') },
  'prod-plan': {
    'The release this job deploys': { run: RELEASE_STEP, rule: 'DPW-13' },
    Diff: { run: DIFF_RUN, rule: 'DPW-08' },
    'Diff the rollback': { run: ROLLBACK_DIFF_RUN, rule: 'DPW-08', if: PLAN_PREVIOUS_IF },
    ...credentialedRuns('prod-plan'),
  },
  'rollback-nonprod': { ...rollbackRuns(), ...credentialedRuns('rollback-nonprod') },
  'rollback-prod': { ...rollbackRuns(), ...credentialedRuns('rollback-prod') },
  'smoke-nonprod': { Smoke: { run: smokeRun('smoke-nonprod'), rule: 'DPW-08', cwd: REPO_FOLDER } },
  'smoke-prod': { Smoke: { run: smokeRun('smoke-prod'), rule: 'DPW-08', cwd: REPO_FOLDER } },
  'resmoke-nonprod': { Smoke: { run: smokeRun('resmoke-nonprod'), rule: 'DPW-08', cwd: REPO_FOLDER } },
  'resmoke-prod': { Smoke: { run: smokeRun('resmoke-prod'), rule: 'DPW-08', cwd: REPO_FOLDER } },
  'record-nonprod': { 'Write the record': { run: recordRun('nonprod'), rule: 'DPW-13' } },
  'record-prod': { 'Write the record': { run: recordRun('prod'), rule: 'DPW-13' } },
})

// DPW-02, the shared runs: the names deploy.yml may anchor a step's run under (run: &name | on the first step
// that runs it, run: *name on each later one), each with the text it holds, built from the constants PINNED_RUNS
// pins, so a name tells its reader the text an alias runs, and with the names of its steps' env: the text reads
// beyond its job's, which its comments name. Each text is one that two or more steps run whole, of at least
// ALIAS_MIN_BYTES, so the file stays under GitHub's 500 KB for a workflow file (WORKFLOW_BYTES); no name holds
// uses, a word the pins proof refuses on any line of deploy.yml.
export interface SharedRun {
  text: string
  reads?: readonly string[]
}
export const RUN_ANCHORS = (): Readonly<Record<string, SharedRun>> => ({
  'asset-check': { text: ASSET_CHECK_RUN, reads: ['ASSEMBLY_FOLDER', 'RELEASE'] },
  'read-back': { text: [PREAMBLE, READ_BACK].join('\n') },
  'rollback-what-runs': { text: whatRunsText('rollback-nonprod') },
  'cli-fetch': { text: CLI_FETCH },
  'cli-check': { text: CLI_CHECK },
  'image-unpack': { text: IMAGE_UNPACK_RUN },
  'artifact-names': { text: artifactNamesRun('nonprod') },
  'release-step': { text: RELEASE_STEP },
  'forward-run': { text: FORWARD_RUN },
  'manual-rollback-run': { text: MANUAL_ROLLBACK_RUN },
  'rollback-run': { text: ROLLBACK_RUN },
  'services-run': { text: SERVICES_RUN },
  'previous-step': { text: PREVIOUS_STEP },
  'mark-run': { text: MARK_RUN },
  'done-run': { text: DONE_RUN },
})
// The fewest bytes a shared run's text holds, as the reader reads it: a shorter one saves too little to cost its
// reader a look elsewhere.
export const ALIAS_MIN_BYTES = 1_000
// A step's place, as a shared-run comment names it: its job's id and its name.
export interface StepPlace {
  job: string
  step: string | undefined
}
const namesInOrder = (names: readonly string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
// The comment DPW-02 holds above a shared run's anchor (form 'anchor', places the steps that alias it, in file
// order) or alias (form 'alias', places its anchor's step), as YAML comment lines at the step's keys' eight
// spaces, wrapped at 120 columns, so a reader of either line sees where the text is written and every job that
// runs it, prod's among them. workflow.ts's expandRunAliases() drops it, so the rules read each step as written out.
export function sharedRunComment(
  form: 'anchor' | 'alias',
  name: string,
  places: readonly StepPlace[],
  reads: readonly string[] = RUN_ANCHORS()[name]?.reads ?? [],
): string[] {
  const named = namesInOrder(places.map(place => `${place.job} (${place.step ?? 'a step with no name'})`))
  const text =
    form === 'anchor'
      ? `Shared run &${name}${reads.length > 0 ? `, reading each step's ${namesInOrder(reads)}` : ''}: written once here, and run as written by ${named}.`
      : `Shared run *${name}${reads.length > 0 ? `, reading this step's ${namesInOrder(reads)}` : ''}: the text written in ${named}.`
  const lines: string[] = []
  let line = '        #'
  for (const word of text.split(' ')) {
    if (line.length + 1 + word.length > 120 && line !== '        #') {
      lines.push(line)
      line = '        #'
    }
    line += ` ${word}`
  }
  lines.push(line)
  return lines
}

// --- The workflow's jobs, as the cases read them ------------------------------------------------------

export type Finding = string
export type Texts = ReadonlyMap<string, string>

export const DEPLOY = '.github/workflows/deploy.yml'
export const CI = '.github/workflows/ci.yml'
export const RULESET = '.github/rulesets/protect-main.json'
export const ENVIRONMENTS_DIR = '.github/environments'
export const PROTECT_ENVIRONMENTS = 'scripts/protect-environments.sh'

// The refusal protect-environments.sh makes first (C11-D56): every command but check, under any agent or
// CI marker, before anything else runs, gh included. No coding agent runs apply by any route, so the test
// proves it on the script run as a file with no command, and DPW-09 holds its first line (the interpreter the
// kernel runs) and the lines that make it the first code that runs, read as bash reads them, after the five
// assignments it reads, with no other line naming AGENT_MARKERS.
export const MARKER_REFUSAL = `if [ "\${1:-}" != check ]; then
  for marker in "\${AGENT_MARKERS[@]}"; do
    if [ -n "\${!marker+x}" ]; then
      echo "protect-environments: refused while $marker is set: a repo admin runs apply as the separate operating-system user that holds their gh login, never a coding agent or CI" >&2
      exit 1
    fi
  done
fi`
// The script's first line, which the kernel reads and bash skips as a comment: DPW-09 holds it whole.
export const PROTECT_ENVIRONMENTS_SHEBANG = '#!/usr/bin/env bash'

// A script's lines as bash runs them, comments and blank lines dropped as bash drops them: a comment line is
// a # after spaces and tabs alone (bash reads any other blank, a no-break space, a carriage return or a
// vertical tab, as part of a word, so a line JavaScript's trim() would call a comment runs whatever follows
// a ; on it), and a line after a code line that ends in a backslash is joined to it (bash reads `x=\` then
// `#;cmd` as `x=#;cmd`), so it is code whatever it starts with. A comment line's trailing backslash joins
// nothing. A code line whose trailing comment ends in a backslash is read as joining the next line too, though
// bash joins nothing there: that only adds a line to what the checks read, so it can refuse a correct script
// but never miss a line bash runs. withoutComment() can't tell that comment apart, since it reads a # after a
// blank inside ${ … } as one, where bash reads text and joins the next line.
export function codeLinesAsBash(lines: readonly string[]): string[] {
  const code: string[] = []
  let joined = false
  for (const line of lines) {
    if (!joined && /^[ \t]*(?:#[\s\S]*)?$/.test(line)) continue
    code.push(line)
    joined = line.endsWith('\\')
  }
  return code
}

// What the gate's check runs of protect-environments.sh, pinned whole: its text from the first line bash runs
// (past the interpreter line and the comments under it, which bash skips) to its end, by its SHA-256. The
// head and the refusal are held line by line above; the rest (the comparison, its status, the dispatch and the
// gh calls) runs in the gate with the gate step's environment and a gh that answers, and the tests run it with
// neither, so a line keyed on anything the two differ in (a variable, a file, what gh answers) would end the
// check differently in the gate and in every test. Pinned, the code changes only with the pin, in the same PR,
// an owner's read (EXPAND-A4-02, round 6). The comments above the first code line stay free to edit.
export const PROTECT_ENVIRONMENTS_SHA256 = '3988fecde6f1d0da2fcf1e5fc62a7ff8559385538690d11caf37e82e424c1d25'
export function pinnedScriptText(script: string): string {
  const lines = script.split('\n')
  const first = lines.findIndex((line, i) => i > 0 && !/^[ \t]*(?:#[\s\S]*)?$/.test(line))
  return first < 0 ? '' : lines.slice(first).join('\n')
}

// What bash added after 3.2, which a repo admin's Mac runs protect-environments.sh under (its /bin/bash) and no
// CI runner has to run it under: DPW-09 refuses each in the script's code lines, as bash reads them. Some
// (`[[ -v`, `|&`, `&>>`, a case fall-through) are parse errors there, and bash parses a whole compound command
// before it runs any of it, so one inside the marker refusal's `if` stops every command before anything runs;
// the rest fail, or mean something else, when they run (review 6 ENVS-01). A test's -v or -R is found wherever
// an operand stands: after [[, [ or test, after !, &&, ||, ( or [ and test's -a and -o, and at the start of a
// line that continues a [[ test after one of those (review 7 ENVS-01) or after a bare [[ ending its line; a
// line a backslash continues is read joined to the next, as bash reads it (review 8 ENVS-01); and a comment that
// ends the line before (`&& # why`, or a comment line a backslash joins, whose own backslash joins nothing) is
// read as bash reads it, to its line's end (review 9 ENVS-01). It is a list read
// line by line, not a parser: a construct it doesn't name, or one it can't see (built from an expansion, held
// in a variable, or an arithmetic subscript such as $(( a[-1] ))), passes, so the list grows with each one
// found.
export const BASH_AFTER_3_2: readonly (readonly [string, RegExp])[] = [
  ['test -v or -R', /(?:\[\[?|\btest|!|&&|\|\||\()\s*-[vR]\s/],
  ['test -v or -R', /(?:\[|\btest)\s.*\s-[ao]\s+-[vR]\s/],
  ['mapfile or readarray', /\b(?:mapfile|readarray)\b/],
  [
    'an associative array, nameref, global or case attribute',
    /\b(?:declare|local|typeset|readonly)(?:\s+-[a-zA-Z]+)*\s+-[a-zA-Z]*[Agnlu]/,
  ],
  ['a case change or @ transformation', /\$\{[#!]?(?:\w+|[@*])(?:\[[^\]]*\])?(?:[,^]|@[a-zA-Z])/],
  ['a negative subscript', /\$\{[#!]?\w+\[\s*-|(?:^|[\s;&|(])\w+\[\s*-[^\]]*\]\+?=|\bunset\s+['"]?\w+\[\s*-/],
  ['a negative substring length', /\$\{[#!]?(?:\w+|[@*])(?:\[[^\]]*\])?:(?![-=?+])[^:}]*:\s*-/],
  ['a brace expansion with a step or zero padding', /\{-?\w+\.\.-?\w+\.\.-?\w+\}|\{-?0\d+\.\.|\.\.-?0\d+\}/],
  ['& in a pattern substitution', /\$\{[#!]?(?:\w+|[@*])(?:\[[^\]]*\])?\/[/#%]?[^/}]*\/[^}]*&/],
  ['coproc', /\bcoproc\b/],
  ['|& or &>>', /\|&|&>>/],
  ['a case fall-through', /;;?&/],
  ['a named file descriptor', /(?<!\$)\{\w+\}[<>]/],
  ['wait -n, -f or -p', /\bwait\s+-[a-zA-Z]*[nfp]/],
  ['read -i or -N', /\bread(?:\s+-[a-zA-Z]+)*?\s+-[a-zA-Z]*[iN]\b/],
  ['printf %(…)T', /%\([^)]*\)T/],
  ['shopt', /\bshopt\b/],
  ['a variable bash 3.2 lacks', /\b(?:BASHPID|EPOCHSECONDS|EPOCHREALTIME|SRANDOM|BASH_ARGV0)\b/],
]
// A [[ test's operands may go on over a line break after [[, &&, || or (, and bash 3.2 stops on a -v or -R
// there too: a code line that starts with one, after a line that ends with one of those or with !, as written
// or with its comment taken off (bash reads `&& # why` and then a line break as `&&` and the break).
const CONTINUED_TEST = /(?:\[\[|&&|\|\||\(|!)[ \t]*$/
const CONTINUED_OPERAND = /^[ \t]*-[vR]\s/
// A line without its comment, as bash's reader finds one: a # that starts a word (at the line's start, or after
// a blank or one of ; & | ( ) < > that no backslash escapes) outside quotes begins a comment that runs to the
// line's end, a backslash there included. It reads quotes and backslashes alone, not ${…}, $(…) or $'…': a #
// inside one of the first two after a blank reads as a comment's start, which only adds a reading, since the
// checks read every line both as written and without its comment; and a $'…' holding \' leaves the rest of its
// line read as quoted, so a comment after one is missed (a list, not a parser, as above).
function withoutComment(line: string): string {
  let quote = ''
  let wordStart = true
  for (let i = 0; i < line.length; i++) {
    const c = line[i] ?? ''
    if (quote === "'") {
      if (c === "'") quote = ''
      continue
    }
    if (c === '\\') {
      i++
      wordStart = false
      continue
    }
    if (quote === '"') {
      if (c === '"') quote = ''
      continue
    }
    if (c === '#' && wordStart) return line.slice(0, i)
    if (c === "'" || c === '"') quote = c
    wordStart = quote === '' && /[ \t;&|()<>]/.test(c)
  }
  return line
}
// The code as bash reads it before it parses: a line that ends in a backslash no other backslash escapes goes
// on with the next, the backslash and the line break dropped, so a test's operands over such a break are read
// on one line. Read with withoutComment, a backslash that ends a comment joins nothing, as bash reads it (a
// continued `&& \` and then `# why \` ends at the comment's line break).
function continuedLines(code: readonly string[], read: (line: string) => string = line => line): string[] {
  const lines: string[] = []
  let pending: string | undefined
  for (const line of code) {
    const whole = pending === undefined ? line : `${pending}${line}`
    pending = /(?:^|[^\\])(?:\\\\)*\\$/.test(read(whole)) ? whole.slice(0, -1) : undefined
    if (pending === undefined) lines.push(whole)
  }
  if (pending !== undefined) lines.push(pending)
  return lines
}
// bash before 4.4 calls an empty array unbound under set -u, so the script expands an array's elements only as
// ${a[@]+"${a[@]}"}, or bare for the two lists its head declares with words (markerHead), never empty.
const GUARDED_ARRAY = /\$\{(\w+)\[@\]\+"\$\{\1\[@\]\}"\}/g
const ARRAY_ELEMENTS = /\$\{!?(\w+)\[[@*]\]/g
const LISTED_ARRAYS = ['ENVIRONMENTS', 'AGENT_MARKERS']
// The code is read twice, its lines joined as written and as bash joins them past a comment, and each line before
// a -v or -R is read as written and without its comment, so a comment's reading only adds what it finds.
export function bashAfter32(code: readonly string[]): string[] {
  const found: string[] = []
  for (const lines of [continuedLines(code), continuedLines(code, withoutComment)]) {
    for (const [n, line] of lines.entries()) {
      for (const [what, pattern] of BASH_AFTER_3_2) if (pattern.test(line)) found.push(what)
      const before = lines[n - 1] ?? ''
      if (CONTINUED_OPERAND.test(line) && (CONTINUED_TEST.test(before) || CONTINUED_TEST.test(withoutComment(before))))
        found.push('test -v or -R')
      for (const match of line.replace(GUARDED_ARRAY, '').matchAll(ARRAY_ELEMENTS)) {
        if (!LISTED_ARRAYS.includes(match[1] ?? '')) found.push('an unguarded array expansion')
      }
    }
  }
  return [...new Set(found)]
}

const markerHead = (markers: readonly string[]) => [
  'set -euo pipefail',
  'root=$(CDPATH= cd "$(dirname "$0")/.." && pwd)',
  'dir="$root/.github/environments"',
  'ENVIRONMENTS=(nonprod prod-plan prod)',
  `AGENT_MARKERS=(${markers.join(' ')})`,
  `CLAIM_KEYS='["repo","context","job_workflow_ref"]'`,
  ...MARKER_REFUSAL.split('\n'),
]

// The seventeen jobs, in the workflow's order (C11-D47 to C11-D52, T24 item 20).
export const JOB_IDS = [
  'gate',
  'build',
  'synth',
  'synth-previous-nonprod',
  'synth-previous-prod',
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
  'synth-previous-nonprod': 25,
  'synth-previous-prod': 25,
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
const DEPLOYING = { 'id-token': 'write', contents: 'read', actions: 'read', deployments: 'write' }
const ROLLING_BACK = { 'id-token': 'write', contents: 'read', actions: 'read', deployments: 'read' }
export const JOB_PERMISSIONS: Readonly<Record<JobId, Readonly<Record<string, string>>>> = {
  gate: { contents: 'read', actions: 'read', deployments: 'read', 'pull-requests': 'read' },
  build: READ,
  synth: READ,
  'synth-previous-nonprod': READ,
  'synth-previous-prod': READ,
  nonprod: DEPLOYING,
  'smoke-nonprod': READ,
  'rollback-nonprod': ROLLING_BACK,
  'resmoke-nonprod': READ,
  'record-nonprod': { deployments: 'write' },
  'prod-plan': { 'id-token': 'write', contents: 'read', actions: 'read' },
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
// falls in the job before it), and the lines before the first job. It reads only a file with every shared run
// written out (expandRunAliases()), so a rule that reads lines by job reads a shared run's text in every job that
// runs it, never in its anchor's job alone (DPW-02, the shared runs).
function jobSpans(text: RunsWrittenOut): Map<string, readonly [number, number]> {
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
// $'\t'; a ${…} holding a quote, a backtick, a substitution, another ${, a tilde (which bash expands in its
// word, and in a replacement even in double quotes: "${x/a/~}") or a transformation (@ and a letter, as
// ${x@P}, which expands its value as a prompt and runs a $( … ) in it), or unquoted, a blank,
// or with no closing brace; the old arithmetic expansion $[ … ], quoted or not; and an unquoted tilde
// but the =~ operator's (a word's ~, ~+ or ~- is $HOME, $PWD or $OLDPWD, after an assignment's = or : too),
// which a reader of the words as written takes for itself (the seventh review's fourth attack, where ~-
// handed aws an --endpoint-url its text never wrote). A credentialed run refuses either (DPW-10, DPW-13).
// The views depend on the run's text alone, so each text's are read once and kept (keptByText), every rule
// reading the same ones.
interface ShellViews {
  readonly text: string
  readonly code: string
  readonly quotedLines: ReadonlySet<number>
  readonly nestedCase: boolean
  readonly odd: ReadonlySet<'comment' | 'ansi-c' | 'brace' | 'arithmetic' | 'tilde'>
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
  const odd = new Set<'comment' | 'ansi-c' | 'brace' | 'arithmetic' | 'tilde'>()
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
  // A ${ … } from i: up to its closing brace, as bash closes one: at the first } no backslash escapes, a bare {
  // inside being a literal that opens nothing, and only a nested ${ needing a } of its own; its end (past the
  // brace, or the run's end with none) and its body. Counting a bare { as well closed ${x:-{} a brace after
  // bash, which then read a $( … ) around it as still open and a command after it as quoted text. A body
  // holding a nested ${ or a substitution is odd (BRACE_ODD), so it is refused whatever its braces, and so is
  // one holding a ;, ( or ) (round 12): the case scanner counts those in the code view to find an item's end
  // and a pattern's ), so ${basis//;;/,} in an item, or ${step/(/} in a pattern, had it blank the item's
  // commands, which bash runs.
  const braceEnd = (i: number) => {
    let depth = 1
    for (let at = i + 2; at < run.length; at++) {
      const c = run[at]
      if (c === '\\') at++
      else if (c === '$' && run[at + 1] === '{') {
        depth++
        at++
      } else if (c === '}' && --depth === 0) return { end: at + 1, body: run.slice(i + 2, at), closed: true }
    }
    return { end: run.length, body: run.slice(i + 2), closed: false }
  }
  // From round 12's second iteration a | or & too, which the reader takes for a command's start wherever it
  // stands, and in a double-quoted body, which may hold blanks and which the code view keeps as code, a !, { or
  // line break as well (QUOTED_BRACE_ODD), each a command's start after a blank: "${step:+! [[ }" read as one and
  // a [[ that blanked the commands after it. An unquoted body holds no blank (refused below), so a ! or { in it
  // starts nothing.
  const BRACE_ODD = /['"`~;()|&]|\$[({]|@[A-Za-z]/
  const QUOTED_BRACE_ODD = /[!{\n]/
  // Whether the ( at an offset (a $(('s inner one) closes with a ) straight before another ), as an arithmetic
  // expansion's does: bash reads $(( … )) as arithmetic only then, and otherwise as $( … ) holding a subshell.
  const arithmeticCloses = (from: number) => {
    let depth = 0
    for (let at = from; at < run.length; at++) {
      const c = run[at]
      if (c === '(') depth++
      else if (c === ')' && --depth === 0) return run[at + 1] === ')'
    }
    return false
  }
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
        if (run[i + 2] === '(' && !arithmeticCloses(i + 2)) odd.add('arithmetic')
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
        const body = run.slice(i + 2, stop - 1)
        if (end < 0 || BRACE_ODD.test(body) || QUOTED_BRACE_ODD.test(body)) odd.add('brace')
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
      // bash reads a # as text inside an arithmetic command, (( … )), and inside a [[ … ]] test's regex group, so
      // a # there starts no comment, and what follows the )) or ]] on its line runs (round 11): a # after more ((
      // or [[ than )) or ]] so far is odd.
      const open = (pattern: RegExp) => code.match(pattern)?.length ?? 0
      if (
        (i > 0 && !/[ \t\n]/.test(run[i - 1] ?? '')) ||
        stack.length > 0 ||
        open(/\(\(/g) > open(/\)\)/g) ||
        open(/\[\[/g) > open(/\]\]/g)
      ) {
        odd.add('comment')
      }
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
    } else if (c === '$' && (next === ',' || next === '}')) {
      // A $ that ends a brace expansion's alternative: bash expands {$,}NAME to $NAME and NAME before it
      // expands parameters, so the $ then expands the name after the brace, which no rule here reads as an
      // expansion (round 11). No text writes one, and nothing else ends an alternative.
      odd.add('brace')
      keep(c)
      i++
      boundary = false
    } else if ((c === '$' || c === '<' || c === '>') && next === '(') {
      // A substitution ($( … ), $(( … )), <( … ) or >( … )): its frame, whose closing ) goes on as its word.
      // bash reads $(( as arithmetic only when its inner ( closes with )) (round 11): $((set) ) is a command
      // substitution holding a subshell, whose command the rules here would read as arithmetic's names, and so
      // are <(( and >((, so each such form is odd. No text writes one.
      if (run[i + 2] === '(' && (c !== '$' || !arithmeticCloses(i + 2))) odd.add('arithmetic')
      keep(c + next)
      stack.push({ kind: 'paren', depth: 1 })
      i += 2
      boundary = true
    } else if (c === '~' && !(run[i - 1] === '=' && /[ \t]/.test(run[i - 2] ?? '') && /[ \t]/.test(next))) {
      // An unquoted tilde but [[ … =~ … ]]'s operator, wherever it stands.
      odd.add('tilde')
      keep(c)
      i++
      boundary = false
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
      // An arithmetic command, (( … )), which no text writes: bash reads its text up to )) as one expression,
      // evaluating every name in it and reading a # in it as text (round 11). $(( … )) opens a frame above.
      if (c === '(' && next === '(') odd.add('arithmetic')
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

// Blanks every character of a span but what a $( … ), <( … ) or >( … ) inside it runs, newlines kept: bash
// runs a process substitution in a [[ … ]] operand and in a case pattern as it runs a command substitution
// there (round 12), so neither hides its command from the rules.
function keepSubstitutions(span: string): string {
  let out = ''
  let depth = 0
  for (let i = 0; i < span.length; i++) {
    const c = span[i] ?? ''
    if (depth === 0 && (c === '$' || c === '<' || c === '>') && span[i + 1] === '(') {
      out += `${c}(`
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

// Whether the & or | at an offset of a text is part of a redirection's operator (>&, <&, &>, &>>, >|), which
// bash reads as one, so it ends no command and starts none.
const inRedirection = (text: string, at: number) =>
  text[at] === '&' ? /[<>]/.test(text[at - 1] ?? '') || text[at + 1] === '>' : text[at] === '|' && text[at - 1] === '>'
// A command's end in the command code: a ;, & or | that is no redirection's (>&2, &>x and >|x go on), and
// for its arguments a ) or a substitution too.
const COMMAND_END = ';|(?<![<>])&(?!>)|(?<!>)\\|'
const TAIL_END = new RegExp(`${COMMAND_END}|$`)
const REST_END = new RegExp(String.raw`${COMMAND_END}|\)|[$<>]\(|$`)
// Where a command may start (COMMAND's first part): a line's start, after ; | & (not a redirection's),
// $( (not arithmetic's $(( ), <( or >(, a subshell's (, each followed by any keywords (then, do, else,
// elif, if, while, until), any ! and any group's { that themselves stand where a command starts, so a
// keyword that is a command's argument (echo then case …) starts nothing, and the word after a { that
// opens a group where a command starts (true || { cmd; }, then { cmd; }) is read as the command it is,
// never as the tail of a command named { (the eighth review's fourth attack, where a group's first command,
// a tar with --to-command among them, was seen by no rule). A ! or { starts a command only as a word of its own,
// as bash reads it (round 12's second iteration): read anywhere, the ! of ready! [[ or the { of plan.{ [[ had
// commandCode() blank a [[ … ]] test's operands, or a case's patterns, from there, and the commands bash ran
// in between were seen by no rule. And only where a command starts (round 12's third iteration): as an
// argument, echo x ! [[ hands echo the words ! and [[, while a ! or { read as a boundary anywhere had the same
// blanking hide the commands after it, so each is read only in the chain after a boundary, as the keywords are,
// and a function definition's head (name () or function name, with or without its ()) stands in that chain
// before its body's {.
const COMMAND_BOUNDARY = String.raw`^|;|(?<!>)\||(?<![<>])&(?!>)|\$\((?!\()|[<>]\(|(?<![=$<>\w(])\(`
const COMMAND_CHAIN = String.raw`(?:\s*(?:\b(?:then|do|else|elif|if|while|until)|\{|!)(?=\s))*`
const FUNCTION_HEAD = String.raw`\s*(?:function\s+[^\s;&|()<>'"$=\x60\\]+(?:\s*\(\s*\))?|[^\s;&|()<>'"$=\x60\\]+\s*\(\s*\))(?=\s*\{)`
const COMMAND_START = `(?:${COMMAND_BOUNDARY})${COMMAND_CHAIN}(?:${FUNCTION_HEAD}${COMMAND_CHAIN})?`
const ENDS_AT_COMMAND_START = new RegExp(`(?:${COMMAND_START})\\s*$`)

// A case pattern that holds the word [[ (at the pattern's start, or after a blank, | or ( , and a blank or ( after
// it), which commandCode() marks with PATTERN_TEST in its first character and readsAsBash() refuses.
const PATTERN_WORD_TEST = /(?:^|[\s|(])\[\[[ \t(]/
const PATTERN_TEST = '\uE001'
// The code view with the words bash reads as operands and not as commands blanked too: a [[ … ]] test's
// operands and patterns, and each case item's patterns, all but the $( … ) substitutions inside them. Only
// a [[ or a case where a command starts is one (as an argument either is a word like any other), and a
// line a backslash-newline continues starts no command, so neither hides what bash runs. A case is read
// across lines as bash reads it: its subject up to in, then each item's pattern up to its ), then the
// item's commands up to ;; (or ;&, ;;&) or esac, so a one-line case or several items on a line are read
// too. A test starts only at the word [[, as bash's reserved word is, a blank or ( after it (round 12's third
// iteration, its second pass): a case pattern [[:lower:]_]*) glues [[ to the rest of its word, and read as a test
// it had the blanking run to the next ]] on its line, past the pattern's ), so the scan read the pattern on to
// the next unmatched ) anywhere, and every command bash ran in between, lines after the esac among them, was
// seen by no rule. A pattern that holds the word [[ (bash reads it there as a pattern, never a test) is marked
// with PATTERN_TEST, and readsAsBash() refuses the text.
function commandCode(code: string): string {
  const raw = code.split('\n')
  const continued = raw.map((_, n) => n > 0 && code.includes('\\') && /(?:^|[^\\])(?:\\\\)*\\$/.test(raw[n - 1] ?? ''))
  const startsCommand = (line: string, n: number, at: number) =>
    !(continued[n] && line.slice(0, at).trim() === '') && ENDS_AT_COMMAND_START.test(line.slice(0, at))
  const text = raw
    .map((line, n) =>
      line.replace(/\[\[(?=[ \t(])([^\n]*?)\]\]/g, (whole, inner: string, at: number) =>
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
      if (PATTERN_WORD_TEST.test(text.slice(i, end))) out[i] = PATTERN_TEST
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
  // Its arguments as the command code shows them, up to the next ;, |, &, ) or substitution (an & or | in a
  // redirection's operator, >&2 or >|x, is none).
  rest: string
  // The rest of its line as the command code shows it, up to the next ;, | or & (but a redirection's).
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
// A redirection's target is a word, any run of quoted and bare parts joined, as bash reads it (round 12,
// second iteration): read as one part alone, <<<"$step"'' or >&2'' took no prefix and the line read as no command
// at all, so the command bash ran after it was seen by no rule. An assignment may append (NAME+=), and a
// redirection may be followed straight by the next one, as bash reads both (round 12's fourth iteration, its
// second pass): basis+='' cp …, or >&2<<<x . …, took the assignment or the descriptor for the command's word, so
// the cp onto the CLI, or the source of the assembly's file, that bash ran was read by no command rule.
const PREFIXES = String.raw`((?:(?:run|get|(?:exec|command|builtin|nohup|time|sudo|xargs)(?:\s+-\S*)*|timeout(?:\s+-\S+)*\s+\S+|env(?:\s+-\S+)*(?:\s+[A-Za-z_]\w*=\S*)*|[A-Za-z_]\w*\+?=(?:[^\s$]|\$(?!\())*)\s+|(?:\d+|&)?(?:>>|<<<|<<-?|<>|>&|<&|>\||[<>])(?!\()\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s;&|()<>'"])+(?:\s+|(?=(?:\d+|&)?[<>])))*)`
const COMMAND = new RegExp(
  String.raw`(${COMMAND_START})\s*${PREFIXES}` +
    String.raw`(?!(?:then|do|else|elif|if|while|until)(?![\w-])|\{\s|\$\(|!\s)("[^"\n]*"|'[^'\n]*'|(?:[^\s;&|()<>'"$]|\$(?!\())+)`,
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
        rest: after.slice(0, after.search(REST_END)),
        tail: after.slice(0, after.search(TAIL_END)),
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
// or readonly NAME=, (( NAME = … )), $(( NAME += … )) and ${NAME:=…}. (printf -v, read, mapfile, local, for,
// select and getopts set a variable by a word they are handed, which builtinNames() reads: a credentialed run
// uses them only on DPW-10's SETTER_LINES, and none of them names HELD_NAMES anywhere.)
const assigns = (names: string) =>
  new RegExp(String.raw`(?<![\w$.-])(?:${names})(?:\[[^\]]*\])?\s*(?:[-+*/%&|^:]|<<|>>)?=(?!=)`)
const STAGE_ASSIGNMENT = assigns('STAGE')
const CDK_ASSIGNMENT = assigns('CDK')
const ASSEMBLY_ASSIGNMENT = assigns('ASSEMBLY')
const DIFF_ASSIGNMENT = assigns('DIFF')
// The names a rule holds to the one line that sets them (DPW-06, DPW-10): CDK, the CLI the preamble names;
// ASSEMBLY, the folder the CLI reads; DIFF, the file prod-plan's diff runs write; and STAGE, the job's. Each
// rule reads its name in every spelling bash sets one in, an assignment (assigns()) and a word a builtin is
// handed (builtinNames()), and no canonical text sets one at all but the preamble's CDK line, so no printf -v,
// read, mapfile or for loop points the diff's write at the CLI CLI_CHECK checked, or "$CDK" at another
// program (the eighth review's first attack, which assigns() alone let through).
const HELD_NAMES: readonly string[] = ['CDK', 'ASSEMBLY', 'DIFF', 'STAGE']
const HELD_ASSIGNMENT = assigns(HELD_NAMES.join('|'))
const handsName = (name: string) => (command: ShellCommand) => builtinNames(command).includes(name)

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
// the shell they read (readsAsBash()) and evaluating only what it sets itself in every form
// outsideEvaluations() reads, both held by the tests; a run's own lines, every line outside a canonical text
// standing whole, are read by SHELL_TABLE alone (readShell()). Both readings are a second layer behind the
// owner's read of a changed run (the header's last paragraph).
export const CANONICAL_BY_NAME = (): Readonly<Record<string, string>> => ({
  STOP_HEAD,
  PREAMBLE,
  CDK_FOLDER,
  CLI_FETCH,
  CLI_CHECK,
  IMAGE_CHECK,
  ASSET_CHECK,
  ARTIFACT_NAMES,
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
  RESTORE_DOWN_DIFF,
  PLAN_BASIS,
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
// or asking -v or -R, by an operator standing anywhere after a [[ on its line (wherever the test closes, so no
// ]]-shaped text in an operand, ${x/ ]] /}, ${x:- ]] }, ${x//[[:space:]]/} or a group's ( ]]), hides one: the
// seventh review's first and fourth attacks), a [[ that doesn't close on its own line (testOpenAtEnd()), a [
// or test asking -v or -R anywhere after it on its line, an indirect ${!…}, a ${name[…]…} but [@] or [*],
// whatever follows the subscript, an offset of a substring (${name:offset}, ${@:offset}, ${*:offset} or
// ${1:offset}), an assignment to name[…], a compound assignment naming a subscript (a=([i]=1)), and what
// unplainLines() names (a name handed to read, unset or wait -p, a test of another shape, bash's own
// evaluating names). The tests pin each canonical text's lines that hold one.
// A backslash before a blank, a #, a line's end, or (round 12) a ( or ), which the case scanner, counting
// parentheses in the code view, would read as a pattern's own, so \(|*) had it blank the item's commands; and
// from round 12's second iteration before a ;, &, |, !, {, < or >, which the code view keeps and the reader of
// command starts takes for an operator, so plan\;[[ had commandCode() blank the commands after it; and from
// round 12's fourth iteration, its second pass, before a }, which exitingFunctions() would read as a group's
// close, though bash keeps it inside ${step:-\}}. The canonical texts' only unquoted escape is \.
const ESCAPED_BREAK = /\\(?:[\s#();&|!{}<>]|$)/m
// A backslash at a line's end anywhere in a text as written, quoted or not: inside double quotes bash removes
// it with the line break and joins the two lines into one word, so a $ and a backslash ending one line and
// (cmd) or {NAME} starting the next run cmd or expand NAME, as outside quotes and in a here-document, while
// the code view writes the quoted pair as text, so ESCAPED_BREAK, which reads the code view, never sees it
// (the ninth review's fourth attack). No canonical text holds one.
const LINE_JOIN = /\\$/m
const HERE_DOCUMENT = /(?<!<)<<(?!<)/
// A code view's line with each ${…} and $( … ) that closes on it written as underscores, so nothing inside one
// (a ]] in ${x/ ]] /} or in a substitution's own text) ends a [[.
function spansBlanked(line: string): string {
  let out = ''
  for (let i = 0; i < line.length; i++) {
    const open = line[i + 1]
    if (line[i] === '$' && (open === '{' || open === '(')) {
      const close = open === '{' ? '}' : ')'
      let depth = 0
      let end = -1
      for (let at = i + 1; at < line.length; at++) {
        if (line[at] === open) depth++
        else if (line[at] === close && --depth === 0) {
          end = at
          break
        }
      }
      if (end >= 0) {
        out += '_'.repeat(end - i + 1)
        i = end
        continue
      }
    }
    out += line[i] ?? ''
  }
  return out
}
// Whether a [[ where a command starts on a code view's line doesn't close on it: past each ${…} and $( … ) the
// line closes, and outside any parentheses the test opens (a regex's group, an extglob's, inside which bash
// reads ]] as text: [[ $x =~ ( ]]) ]]), no ]] stands as a word, after a blank and before a blank, an operator,
// a ) or the line's end. A command starts after a case pattern's ) too, and a [[ at the line's end opens a test
// whose operands bash reads from the next line (round 11).
function testOpenAtEnd(line: string): boolean {
  const blanked = spansBlanked(line)
  for (const match of blanked.matchAll(/(?:^|[\s;&|(!{)])\[\[(?=\s|$)/g)) {
    let depth = 0
    let closed = false
    for (let at = match.index + match[0].length; at < blanked.length && !closed; at++) {
      const c = blanked[at]
      if (c === '(') depth++
      else if (c === ')') depth = Math.max(0, depth - 1)
      else if (
        depth === 0 &&
        blanked.startsWith(']]', at) &&
        /\s/.test(blanked[at - 1] ?? '') &&
        /^(?:[\s;&|)]|$)/.test(blanked.slice(at + 2, at + 3))
      ) {
        closed = true
      }
    }
    if (!closed) return true
  }
  return false
}
const TEST_EVALUATIONS: ReadonlyArray<{ test(line: string): boolean }> = [
  /\[\[.*(?<![\w-])-(?:eq|ne|lt|le|gt|ge|v|R)(?![\w-])/,
  { test: testOpenAtEnd },
  /(?:^|[\s;&|(!{])(?:\[|test)\s.*(?<![\w-])-[vR](?![\w-])/,
]
const EVALUATED = [
  /\(\(/,
  ...TEST_EVALUATIONS,
  /\$\{!/,
  /\$\{#?[A-Za-z_]\w*\[(?![@*]\])/,
  /\$\{(?:[A-Za-z_]\w*(?:\[[@*]\])?|[@*#?$!-]|\d+):(?![-=?+])/,
  /(?<![\w$])[A-Za-z_]\w*\[[^\]\n]*\]\+?=/,
  /(?:^|[\s(])\[[^\]\n]*\]\+?=/,
]
// The builtins that set or unset a variable by a name they are handed, whose subscript bash evaluates (read,
// unset, wait -p) or whose callback it runs (mapfile -C): in a canonical text read, unset, mapfile and
// readarray are given -r, -t and plain names alone, and wait no -p, so no name is built from a value, quoted
// or subscripted. (printf -v is held by outsideEvaluations(), local and export by GIVEN_NAME, and declare,
// typeset and let are refused there.) NAME_TAKER reads them on the code view to the first redirection;
// setterLines() reads each as shellCommands() does, to its command's end with its redirections and their
// targets taken off, since bash takes a word after a redirection as the command's (read -r x < <(…)
// 'a[$(…)]', mapfile < <(…) -C '…': the eighth review's third attack).
const NAME_TAKER = /(?<![\w$/.{-])(read|unset|wait|mapfile|readarray)(?![\w-])([^;&|<>()\n]*)/g
const NAME_SETTERS = ['read', 'unset', 'wait', 'mapfile', 'readarray']
const PLAIN_FLAGS = ['-r', '-t']
const PLAIN_NAME = /^[A-Za-z_]\w*$/
// bash's own names that evaluate what is assigned to them (RANDOM, SRANDOM, OPTIND and HISTCMD as arithmetic,
// PS0 to PS4 and PROMPT_COMMAND as a prompt, whose $( … ) runs), and set -x, which expands PS4 before each
// command: a canonical text names none and traces nothing.
const EVALUATING_NAME =
  /(?<![\w$])(?:RANDOM|SRANDOM|OPTIND|HISTCMD|PS[0-4]|PROMPT_COMMAND)(?!\w)|(?<![\w-])set\s+(?:[-+][A-Za-z]*x|[-+]o\s+xtrace)/
// A [ or test, where a command starts, whose words, after one !, are one word, a unary test of TEST_UNARY and a
// word, or a word, a binary test of TEST_BINARY and a word, each operator written plainly: no -v or -R, which
// evaluate a name, and no operator in quotes or given by an expansion, which test reads after bash takes its
// quotes off and expands it; and no word bash could split into several (wordSplits(): an expansion or a
// substitution outside double quotes, a glob, a brace or a tilde), since [ reads its words only after bash
// splits them, so an unquoted [ -n $x ] hands it -v and a subscript to evaluate when x's value holds them
// (the eighth review's first attack).
const TEST_START = /(?:^|[;&|(){!]|\b(?:if|then|elif|else|while|until|do)\b)[ \t]*(\[|test)(?=[ \t])/g
const TEST_UNARY = ['-n', '-z', '-d', '-f', '-e', '-s', '-L', '-h', '-r', '-x']
const TEST_BINARY = ['=', '==', '!=', '-eq', '-ne', '-lt', '-le', '-gt', '-ge']
// The words of a [ or test from an offset of a code view's line, each as the code view and the text write it,
// split at the blanks outside its parentheses (a backslash's next character is the word's, never a parenthesis
// or a blank), to the end of its command, as bash hands [ every word to its command's end and requires only
// the last to be ]; for a [, the words before that ], and undefined unless the last word, and no other, is ]
// (an early ] hides the rest: [ -n ] -o '-v' "$x" ] is no [ -n ], the eighth review's second attack).
interface TestWord {
  readonly code: string
  readonly raw: string
}
function testWords(line: string, raw: string, from: number, bracket: boolean): TestWord[] | undefined {
  const found: TestWord[] = []
  let start = -1
  let depth = 0
  const end = (at: number) => {
    if (start >= 0) found.push({ code: line.slice(start, at), raw: raw.slice(start, at) })
    start = -1
  }
  let at = from
  for (; at < line.length; at++) {
    const c = line[at] ?? ''
    if (c === '\\') {
      if (start < 0) start = at
      at++
      continue
    }
    if (c === '(') depth++
    if (c === ')') depth--
    if (depth < 0 || (depth === 0 && /[;&|]/.test(c))) break
    if (depth === 0 && /[ \t]/.test(c)) end(at)
    else if (start < 0) start = at
  }
  end(at)
  if (!bracket) return found
  if (found.at(-1)?.code !== ']' || found.slice(0, -1).some(word => word.code === ']')) return undefined
  return found.slice(0, -1)
}
// A word of a test bash could hand [ as several or as an operator it doesn't show: one that expands to several
// ("$@", "$*", "${name[@]}" and the like, a helper's need() { [ "$@" ]; } among them, whose callers' words no
// shape check reads; a count, ${#name[@]}, is one), one holding a backslash outside quotes (\( and \) are the
// parentheses [ groups by, which no shape here has), and a quoted one bash hands [ as an operator ('-v', "(",
// "!"), which TEST_EVALUATIONS' literal -v never sees (the eighth review's second attack).
const TEST_COUNT = /\$\{#[A-Za-z_]\w*\[[@*]\]\}/g
const TEST_OPERATOR = /^(?:-.*|[()![\]]|=|==|!=)$/
const unplainTestWord = ({ code, raw }: TestWord) =>
  wordSplits(code) ||
  expandsToMany(raw.replace(TEST_COUNT, '')) ||
  code.includes('\\') ||
  (/['"]/.test(raw) && TEST_OPERATOR.test(wordAsRead(raw)))
const testShaped = (found: readonly TestWord[] | undefined) => {
  if (found === undefined || found.some(unplainTestWord)) return false
  const words = found.map(word => word.code)
  const operands = words[0] === '!' ? words.slice(1) : words
  if (operands.length === 1) return true
  if (operands.length === 2) return TEST_UNARY.includes(operands[0] ?? '')
  return operands.length === 3 && TEST_BINARY.includes(operands[1] ?? '')
}
// The lines of a code view on which bash would evaluate a name or an operator a value hands it: a name read,
// unset, mapfile or readarray is given that isn't plain, a flag of theirs but -r and -t, wait's -p, one of
// bash's own evaluating names, set -x, and a [ or test of any other shape, or one TEST_START doesn't read
// (unreadTests(), given the text the code view is of).
function unplainLines(code: string, text?: string): number[] {
  const unread = new Set(text === undefined ? [] : [...unreadTests(text, code), ...setterLines(text)])
  const raws = (text === undefined ? code : shellViews(text).text).split('\n')
  return code.split('\n').flatMap((line, n) => {
    if (unread.has(n)) return [n]
    const names = [...line.matchAll(NAME_TAKER)].some(([, builtin, rest]) => {
      const words = (rest ?? '')
        .trim()
        .split(/[ \t]+/)
        .filter(Boolean)
      if (builtin === 'wait') return words.some(word => /^-[A-Za-z]*p/.test(word))
      return words.some(word => !PLAIN_FLAGS.includes(word) && (!PLAIN_NAME.test(word) || EVALUATING_NAME.test(word)))
    })
    const tests = [...line.matchAll(TEST_START)].some(
      match => !testShaped(testWords(line, raws[n] ?? line, match.index + match[0].length, match[1] === '[')),
    )
    return names || tests || EVALUATING_NAME.test(line) ? [n] : []
  })
}
// The lines of a text on which a setter builtin is handed, anywhere to its command's end past its redirections,
// a word but -r, -t and a plain name that isn't one of bash's evaluating names (wait any word but -p), or a
// printf -v that a redirection comes before, which outsideEvaluations() reads only as printf -v.
function setterLines(text: string): number[] {
  return shellCommands(text).flatMap(command => {
    const written = words(command.tail)
    const given = withoutRedirections(written)
    if (command.word === 'printf') return given[0] === '-v' && written[0] !== '-v' ? [command.line] : []
    if (!NAME_SETTERS.includes(command.word)) return []
    const plain =
      command.word === 'wait'
        ? given.every(word => !/^-[A-Za-z]*p/.test(word))
        : given.every(word => PLAIN_FLAGS.includes(word) || (PLAIN_NAME.test(word) && !EVALUATING_NAME.test(word)))
    return plain ? [] : [command.line]
  })
}
// The lines of a text on which shellCommands() reads more [ and test commands than TEST_START finds where a
// command starts: one after a redirection, an assignment or a wrapper (run [ -n $x ], say), whose words
// testShaped() would never read, so it is refused whatever they are.
function unreadTests(text: string, code: string): number[] {
  const counts = new Map<number, number>()
  for (const command of shellCommands(text)) {
    if (command.word === '[' || command.word === 'test') counts.set(command.line, (counts.get(command.line) ?? 0) + 1)
  }
  const lines = code.split('\n')
  return [...counts].filter(([n, count]) => count > [...(lines[n] ?? '').matchAll(TEST_START)].length).map(([n]) => n)
}
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
  const code = shellViews(run).code
  const unplain = new Set(unplainLines(code, run))
  return code
    .split('\n')
    .flatMap((line, n) => (EVALUATED.some(pattern => pattern.test(line)) || unplain.has(n) ? [n] : []))
}
// Whether a canonical text is written in the shell shellViews() and shellCommands() read, so the rules read its
// commands as bash runs them: no unquoted backslash before a blank, a #, a ( or ), or a line's end, no case inside a
// substitution, no command whose word is a substitution's output, none of what shellViews() names odd, no
// backtick substitution, no here-document, no local or export of a name it builds, no & that runs what comes
// before it in the background (BACKGROUND), no command started where COMMAND_START reads none (UNREAD_START,
// FOR_NAME_DO, a function whose body isn't a { … } group), and, outside a canonical text standing whole in it,
// nothing EVALUATED names (a canonical text's own are held by outsideEvaluations()).
export function readsAsBash(run: string, views: ReturnType<typeof shellViews> = shellViews(run)): boolean {
  if (views.nestedCase || views.odd.size > 0 || BACKGROUND.test(views.code)) return false
  if (UNREAD_START.test(views.code) || FOR_NAME_DO.test(views.code) || bodyNotGroup(views.code)) return false
  if (ESCAPED_BREAK.test(views.code) || LINE_JOIN.test(run) || SUBSTITUTED_WORD.test(views.code)) return false
  if (OUTER_SUBSTITUTED_WORD.test(outerCode(views.code, views.quotedLines))) return false
  if (views.code.includes('`') || HERE_DOCUMENT.test(views.code)) return false
  if (/(?<![\w-])case\s/.test(views.code) && commandCode(views.code).includes(PATTERN_TEST)) return false
  // (Only a text whose code names local or export has one to read.)
  const names = /\b(?:local|export)\b/.test(views.code)
    ? shellCommands(run).filter(command => command.word === 'local' || command.word === 'export')
    : []
  if (names.some(command => !words(command.tail).every(word => GIVEN_NAME.test(word)))) return false
  const canonical = canonicalLines(run)
  const unplain = new Set(unplainLines(views.code, run))
  return views.code
    .split('\n')
    .every((line, n) => !(EVALUATED.some(pattern => pattern.test(line)) || unplain.has(n)) || canonical.has(n))
}

// Where bash starts a command that the reader's COMMAND_START doesn't read as one (round 12's fourth iteration):
// a then, do, else or elif straight after a compound command's ]], ) or }, with no ; between (if [[ … ]] then
// CMD); a for loop with no in list and no ; before its do (for NAME do CMD); and a function whose body is a
// compound command other than { … } (name() while CMD; …, name() if CMD; …, name() case … in P) CMD ;; esac). No
// canonical text writes any of them, and the commands they start read as none, so no rule held them. Reading them
// as command starts would make ) a boundary, which every $( … ) holds; so the text is refused instead.
const UNREAD_START = /(?:\]\]|[)}])[ \t]+(?:then|do|else|elif)(?![\w-])/
const FOR_NAME_DO = /(?<![\w-])for[ \t]+[A-Za-z_]\w*[ \t]+do(?![\w-])/
function bodyNotGroup(code: string): boolean {
  for (const match of code.matchAll(DEFINITION)) {
    if (!/^(?:\s*\(\s*\))?\s*\{/.test(code.slice(match.index + match[0].length))) return true
  }
  return false
}
// An & that is a control operator, which runs the list before it in a subshell of its own in the background (round
// 12's third iteration): set -e never sees its status and no text may wait for it, so an exit 1 in a refusal, a
// group, a subshell or an if … fi followed by & ended that subshell alone and the step went on as if it had
// passed. The glue's table names no & either; && , |&, >&, <&, &>, 2>&1 and a case item's ;;& or ;& are no such &.
const BACKGROUND = /(?<![&|<>;])&(?![&>])/
// The lines of a canonical text at which bash evaluates, as arithmetic, a subscript, an offset, a name or a
// prompt, a value from outside the text. Every name the text evaluates must be bash's own SECONDS (whose value
// read is always its count of seconds, whatever was assigned to it) or a lower-case name (a letter, then
// letters, digits and _) assigned within the text before its first evaluation, every assignment of it a
// literal number, a for loop over literal words, a local with no value, or arithmetic over such names; where
// bash evaluates it as arithmetic (arithmetic, a subscript or an offset), a for loop's words are numbers too,
// since arithmetic reads a name's value as an expression in its turn, so a loop's count over the word
// revision evaluated $revision, which held an outside value (the eighth review's third attack); and the names
// bash sets on its own (REPLY and MAPFILE, which read and mapfile set when handed no name, BASH_REMATCH, _,
// OPTARG and the rest) are all upper-case or _, so none is ever one. Since the texts run joined in one shell,
// the name is also a number wherever any other canonical text or pinned run sets it (given those, Elsewhere),
// and no env: hands it (the eighth review's fourth attack: TASKS_OUTPUTS' global revision, set from an AWS
// answer, was PROBE's $(( revision ))). Nothing else is evaluated: no $( … ), quote, escape or
// positional parameter inside arithmetic or a subscript, no $[ … ], ${!…} or ${…@…}, no let, no declare,
// typeset or local given -i, -n or -A, no [[ … ]] comparing as numbers, and no -v or -R. A name printf -v
// sets is built only from such names. So no value from a step's env, an output, an artifact's file or a
// run's own lines is evaluated inside a canonical text in any form this reads (a form written to get past it
// is the owner's read's: the header's last paragraph).
const OUTSIDE = /\$\(|[`'"\\]|\$[0-9@*#?$!-]|\$\{(?![A-Za-z_]\w*\})/
// Refused wherever they stand: $[ … ], ${!…}, a transformation, let, declare and typeset, a local given -i,
// -n or -A, a default assignment (${name=…}, ${name:=…}, ${name[…]:=…}), which sets a name no assignment of
// it shows, and a redirection that names its descriptor's variable ({name}>, {name[…]}<), which sets one
// and evaluates its subscript (the seventh review's second attack).
const REFUSED_EVALUATION =
  /\$\[|\$\{!|\$\{[^}\n]*@[A-Za-z]|(?<![\w-])(?:let|declare|typeset)(?![\w-])|(?<![\w-])local\s+-[A-Za-z]*[inA]|\$\{[A-Za-z_]\w*(?:\[[^\]\n]*\])?:?=|(?<![\w$])\{[^\s{}]+\}(?=[<>])/g
// A name the text may evaluate: lower-case, so never one bash sets on its own; and the value a for loop over
// literal words that aren't all numbers gives, which only a printf -v name built from it may take.
const OWN_NAME = /^[a-z][a-z0-9_]*$/
const WORDS = '\0words'
// The text inside the parentheses that open at an offset of a text, to the ) that closes them.
function insideParentheses(text: string, open: number): string {
  let depth = 0
  for (let end = open; end < text.length; end++) {
    if (text[end] === '(') depth++
    else if (text[end] === ')' && --depth === 0) return text.slice(open + 1, end)
  }
  return text.slice(open + 1)
}
// A value as written from an offset of a text, up to a blank or a ;, a $(( … )) in it read whole: the word
// bash assigns, so n=$((0))$y is no number when y holds a[$(…)] (the eighth review's fourth attack).
function valueAt(text: string, from: number): string {
  let at = from
  while (at < text.length && !/[\s;]/.test(text[at] ?? '')) {
    at += text.startsWith('$((', at) ? `$(${insideParentheses(text, at + 1)})`.length : 1
  }
  return text.slice(from, at)
}
// Each assignment of a name in a text, by its offset in the code view and its value as written ('' for a
// local with none or a for loop over literal numbers; WORDS for a for loop over other literal words, which
// only a name built from them may take; $ for one that read, mapfile, printf -v or another for loop sets).
// An element's assignment (name[…]=) is the name's too, since $name reads its first element.
type Assignment = { at: number; value: string }
const ASSIGNMENTS = keptByText((text: string): ((name: string) => Assignment[]) => {
  const code = shellViews(text).code
  const found = new Map<string, Assignment[]>()
  // Every name a builtin sets by a word it is handed, as the command reader reads it (builtinNames), at its
  // line's start, as an outside value: read's, mapfile's, getopts', select's, printf -v's, and a for loop's
  // with no in list, which bash's for NAME; do and for NAME do set from the positional parameters, a
  // function's arguments (round 12's fourth iteration: a helper's for version; do [ "$(( version ))" -le 8 ]
  // evaluated each argument, a value from the assembly, while the regexes below read only for NAME in, and a |
  // in a substitution before read's name stopped both the reader's command and the setters' regex, which now
  // reads to the line's end). local's names and a for loop over an in list are read below, by their values.
  const starts: number[] = []
  let offset = 0
  for (const line of code.split('\n')) {
    starts.push(offset)
    offset += line.length + 1
  }
  const byBuiltin = shellCommands(text).flatMap(command =>
    command.word === 'local' || (command.word === 'for' && words(command.tail)[1] === 'in')
      ? []
      : builtinNames(command).map(name => ({ name, at: starts[command.line] ?? 0 })),
  )
  return (name: string) => {
    const kept = found.get(name)
    if (kept !== undefined) return kept
    const all: Assignment[] = byBuiltin.filter(each => each.name === name).map(({ at }) => ({ at, value: '$' }))
    for (const match of code.matchAll(
      new RegExp(String.raw`(?<![\w-])for\s+${name}(?!\s+in(?![\w-]))(?=[\s;])`, 'g'),
    )) {
      all.push({ at: match.index, value: '$' })
    }
    for (const match of code.matchAll(new RegExp(String.raw`(?<![\w$-])${name}(?:\[[^\]\n]*\])?\+?=`, 'g'))) {
      all.push({ at: match.index, value: valueAt(text, match.index + match[0].length) })
    }
    const local = String.raw`(?<![\w-])local\s[^;\n]*?(?<![\w$=-])${name}(?![\w=])`
    for (const match of code.matchAll(new RegExp(local, 'g'))) all.push({ at: match.index, value: '' })
    for (const match of code.matchAll(new RegExp(String.raw`(?<![\w-])for\s+${name}\s+in\s+([^;\n]*)`, 'g'))) {
      const listed = match[1] ?? ''
      all.push({ at: match.index, value: /^[\d\s+-]+$/.test(listed) ? '' : /^[\w\s-]+$/.test(listed) ? WORDS : '$' })
    }
    const setters = String.raw`(?<![\w-])(?:read|mapfile|readarray|getopts|select)\s[^\n]*(?<![\w$])${name}(?!\w)`
    for (const match of code.matchAll(new RegExp(setters, 'g'))) all.push({ at: match.index, value: '$' })
    const printf = String.raw`(?<![\w-])printf\s+-v\s+"?${name}(?![\w])`
    for (const match of code.matchAll(new RegExp(printf, 'g'))) all.push({ at: match.index, value: '$' })
    found.set(name, all)
    return all
  }
})
// What sets a name outside the text being read (FLOW-A4-01, the eighth review's fourth attack): the canonical
// texts beside it and the pinned runs that hold them, which run joined in one shell (TASKS_OUTPUTS' global
// revision was PROBE's $(( revision )), though PROBE gave it 0 first when it was empty), and the names a
// step's or a job's env: hands every run.
export interface Elsewhere {
  readonly texts: readonly string[]
  readonly given: ReadonlySet<string>
}
const NOWHERE: Elsewhere = { texts: [], given: new Set() }
// Whether a value an assignment gives is a number wherever it is evaluated: none ('' for a local or a numeric
// loop), digits, a loop's literal words where the name is no arithmetic's, or one arithmetic whole, whose
// result is a number and whose expression is a site of its own text.
const numberValue = (value: string, evaluated: boolean) => {
  if (value === '' || /^[0-9]+$/.test(value)) return true
  if (value === WORDS) return !evaluated
  const nested = /^\$\(\((.*)\)\)$/s.exec(value)?.[1]
  return nested !== undefined && !OUTSIDE.test(nested)
}
export function outsideEvaluations(text: string, elsewhere: Elsewhere = NOWHERE): number[] {
  const views = shellViews(text)
  const code = views.code
  const lineOf = (at: number) => code.slice(0, at).split('\n').length - 1
  const sites: Array<{ at: number; names: readonly string[] | undefined; arithmetic?: boolean }> = []
  const namesIn = (expression: string) =>
    [...expression.matchAll(/(?<![\w$])\$?\{?([A-Za-z_]\w*)/g)].map(match => match[1] ?? '')
  // An arithmetic expression as written: its names, or none to allow when it holds anything bash expands
  // first but $NAME and ${NAME}.
  const arithmetic = (at: number, expression: string) =>
    sites.push({ at, names: OUTSIDE.test(expression) ? undefined : namesIn(expression), arithmetic: true })
  const inside = (open: number) => insideParentheses(text, open)
  for (const match of code.matchAll(/\$?\(\(/g)) {
    const open = match.index + match[0].length - 2
    arithmetic(match.index, inside(open).slice(1, -1))
  }
  for (const match of code.matchAll(REFUSED_EVALUATION)) sites.push({ at: match.index, names: undefined })
  // $[ … ] in double quotes too, which the code view writes as quoted text.
  for (const match of views.text.matchAll(/\$\[/g)) sites.push({ at: match.index, names: undefined })
  let offset = 0
  const unplain = new Set(unplainLines(code, text))
  for (const [n, line] of code.split('\n').entries()) {
    if (TEST_EVALUATIONS.some(pattern => pattern.test(line)) || unplain.has(n)) {
      sites.push({ at: offset, names: undefined })
    }
    offset += line.length + 1
  }
  // A ${…}'s subscript, whatever follows it (${a[i]:-}, ${a[i]/x/y} and ${#a[i]} evaluate it as ${a[i]}
  // does), its offset and length, an assignment's subscript and printf -v's name.
  for (const match of code.matchAll(/\$\{#?([A-Za-z_]\w*)\[([^\]\n]*)\]/g)) {
    const subscript = match[2] ?? ''
    if (subscript !== '@' && subscript !== '*') arithmetic(match.index, subscript)
  }
  for (const match of code.matchAll(/\$\{#?([A-Za-z_]\w*|[0-9@*])(?:\[([^\]\n]*)\])?(?::(?![-=?+])([^}\n]*))?\}/g)) {
    const [, name, , range] = match
    if (range !== undefined) arithmetic(match.index, range.replace(':', ' '))
    if (range !== undefined && !/^[A-Za-z_]/.test(name ?? '')) sites.push({ at: match.index, names: undefined })
  }
  for (const match of code.matchAll(/(?<![\w$])[A-Za-z_]\w*\[([^\]\n]*)\]\+?=|(?:^|[\s(])\[([^\]\n]*)\]\+?=/gm)) {
    arithmetic(match.index, match[1] ?? match[2] ?? '')
  }
  for (const match of code.matchAll(/(?<![\w-])printf\s+-v\s+/g)) {
    const name = valueAt(text, match.index + match[0].length)
    const outside = /\[|\$\(|`|\$[0-9@*#?$!-]/.test(name)
    sites.push({
      at: match.index,
      names: outside ? undefined : [...name.matchAll(/\$\{?([A-Za-z_]\w*)/g)].map(each => each[1] ?? ''),
    })
  }
  const assignments = ASSIGNMENTS(text)
  // Every value the texts and runs beside this one give the name: a name evaluated here must be a number
  // wherever else it is set, and set by no env: at all, since bash's variables are the shell's, not a text's.
  const setElsewhere = (name: string) =>
    elsewhere.texts.flatMap(other => (other === text ? [] : ASSIGNMENTS(other)(name).map(each => each.value)))
  const allowed = (name: string, at: number, seen: ReadonlySet<string>, evaluated: boolean): boolean => {
    const all = assignments(name)
    if (elsewhere.given.has(name)) return false
    if (name === 'SECONDS') return all.length === 0 && setElsewhere(name).length === 0
    if (!OWN_NAME.test(name) || !all.some(each => each.at < at)) return false
    if (!setElsewhere(name).every(value => numberValue(value, evaluated))) return false
    return all.every(({ value }) => {
      if (value === '' || /^[0-9]+$/.test(value)) return true
      if (value === WORDS) return !evaluated
      const nested = /^\$\(\((.*)\)\)$/s.exec(value)?.[1]
      if (nested === undefined || OUTSIDE.test(nested)) return false
      return namesIn(nested).every(each => seen.has(each) || allowed(each, at, new Set([...seen, each]), true))
    })
  }
  const lines = new Set<number>()
  for (const { at, names, arithmetic: evaluated = false } of sites) {
    if (names === undefined || !names.every(name => allowed(name, at, new Set([name]), evaluated))) {
      lines.add(lineOf(at))
    }
  }
  return [...lines].sort((a, b) => a - b)
}

export const GUARD = 'scripts/guards/deploy-workflow.ts'

// The words of a command in a text view from an offset, each as written (quotes and all), split at the
// blanks outside its quotes and substitutions, to its end: an unquoted newline, ;, & or |, or a ) that closes
// nothing it opened, but an & or | inside a redirection's operator (>&, <&, &>, >|), which ends nothing, so a
// word after >&2 is the command's as bash hands it (the eighth review's third attack). A single-quoted string
// reads to its next quote, a double-quoted one to its own, and a $( … ) or ( … ) to its ), each quoting as
// bash quotes inside it.
function commandWords(text: string, from: number): string[] {
  const found: string[] = []
  const stack: Array<'"' | ')'> = []
  let word = ''
  for (let at = from; at < text.length; at++) {
    const c = text[at] ?? ''
    const top = stack[stack.length - 1]
    if (top === undefined && /[ \t]/.test(c)) {
      if (word !== '') found.push(word)
      word = ''
      continue
    }
    if (top === undefined && /[\n;&|)]/.test(c) && !inRedirection(text, at)) break
    word += c
    if (c === '\\') {
      word += text[at + 1] ?? ''
      at++
    } else if (c === "'" && top !== '"') {
      const close = text.indexOf("'", at + 1)
      const end = close < 0 ? text.length : close + 1
      word += text.slice(at + 1, end)
      at = end - 1
    } else if (c === '"') {
      if (top === '"') stack.pop()
      else stack.push('"')
    } else if (c === '(' && (top !== '"' || text[at - 1] === '$')) stack.push(')')
    else if (c === ')' && top === ')') stack.pop()
  }
  if (word !== '') found.push(word)
  return found
}
// A word as the program it is handed reads it: its quotes and escapes taken off as bash takes them (a
// backslash in double quotes only before $, `, " or \), and each expansion or substitution written \0,
// which could stand for anything, an option among it, an unquoted tilde among them (~- is $OLDPWD). So
// "-f", '-f', \-f and -\f are all -f.
export function wordAsRead(word: string): string {
  let out = ''
  let quote: '"' | "'" | undefined
  for (let i = 0; i < word.length; i++) {
    const c = word[i] ?? ''
    if (quote === "'") {
      if (c === "'") quote = undefined
      else out += c
    } else if (c === "'" && quote === undefined) quote = "'"
    else if (c === '"') quote = quote === '"' ? undefined : '"'
    else if (c === '\\') {
      const next = word[i + 1] ?? ''
      out += quote === '"' && !/[$`"\\]/.test(next) ? c + next : next
      i++
    } else if (c === '$' || c === '`') {
      // An expansion to its end: a ( … ) or { … } by its depth, a backtick to the next, or a name or one
      // character.
      const open = word[i + 1] ?? ''
      if (c === '`') i = word.indexOf('`', i + 1) < 0 ? word.length : word.indexOf('`', i + 1)
      else if (open === '(' || open === '{') {
        const close = open === '(' ? ')' : '}'
        let depth = 0
        for (i++; i < word.length; i++) {
          if (word[i] === open) depth++
          else if (word[i] === close && --depth === 0) break
        }
      } else i += /^[A-Za-z_]\w*/.exec(word.slice(i + 1))?.[0].length ?? 1
      out += '\0'
    } else if (c === '~' && quote === undefined) out += '\0'
    else out += c
  }
  return out
}
// Whether bash could make a word into several, or into another program's option, as it runs: an expansion or a
// substitution outside double quotes (split at blanks), or a glob, a brace or a tilde outside any quotes
// (* ? [ { ~, the last the value of HOME, PWD or OLDPWD, an option among them), each read as wordAsRead() reads
// quotes, escapes and the expansions inside double quotes.
export function wordSplits(word: string): boolean {
  let quote: '"' | "'" | undefined
  for (let i = 0; i < word.length; i++) {
    const c = word[i] ?? ''
    if (quote === "'") {
      if (c === "'") quote = undefined
    } else if (c === "'" && quote === undefined) quote = "'"
    else if (c === '"') quote = quote === '"' ? undefined : '"'
    else if (c === '\\') i++
    else if (c === '$' || c === '`') {
      if (quote === undefined) return true
      const open = word[i + 1] ?? ''
      if (c === '`') i = word.indexOf('`', i + 1) < 0 ? word.length : word.indexOf('`', i + 1)
      else if (open === '(' || open === '{') {
        const close = open === '(' ? ')' : '}'
        let depth = 0
        for (i++; i < word.length; i++) {
          if (word[i] === open) depth++
          else if (word[i] === close && --depth === 0) break
        }
      }
    } else if (quote === undefined && /[*?[{~]/.test(c)) return true
  }
  return false
}
// A redirection's word (<<<"$x", >/dev/null, 2>&1, &>/dev/null), with its target when the target is a word of
// its own. A process substitution, <( … ) or >( … ), is no redirection: bash hands the command its path
// (/dev/fd/63) as an argument, so it is kept as one (round 12's third iteration, its second pass: read as a
// redirection, jq -e '…' "$dir/manifest.json" <(echo '{}') counted one file, and jq read the last alone).
const REDIRECTING = /^\d*(?:<<<|<<-?|<>|>>|>&|<&|>\||[<>])|^&>>?/
const PROCESS_SUBSTITUTION = /^[<>]\(/
function withoutRedirections(words: readonly string[]): string[] {
  const kept: string[] = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? ''
    const operator = PROCESS_SUBSTITUTION.test(word) ? undefined : REDIRECTING.exec(word)?.[0]
    if (operator === undefined) kept.push(word)
    else if (operator === word) i++
  }
  return kept
}
// What a canonical text hands jq and gh, which could take a program from a file, read a file or the
// environment, or send a file (DPW-10): jq only -e, -r, -c, -n and -s (in any mix) and --arg and --argjson
// with a name and a value, each written plainly, then its program written on the line (one single-quoted
// string, or a .field path), then only data: one of JQ_FILE_WORDS (an assembly's manifest, file or template,
// ASSET_CHECK's list of asset manifests, "${stackfiles[@]}", the one array, whose words could otherwise be jq's
// options after its program, and the CLI's unpacked manifest), whose names only ASSET_CHECK's own lines set
// (fileNameLines()), or a path in the checkout written plainly (infra/package.json) with no .. part,
// so never a file elsewhere (the registry login skopeo keeps under $XDG_RUNTIME_DIR, say, which jq would
// print in slices no mask matches; the seventh review's third attack); gh only as gh api on a double-quoted
// path under repos/, with at most --jq and a program written the same way; neither's program holding a word
// of JQ_REACH or reading as an option; and no word of either that bash splits or globs (wordSplits()) or that
// expands to several words but that list (an --arg's "$@", say), so no expansion hands jq an option after its
// program. Each word is judged as the program receives it
// (wordAsRead), so a quoted or escaped flag ('-f', "--from-file", \-f) in the program's place or after it is
// the flag it is (the seventh review's second attack). These are the ways a canonical text's line changed by
// a review that reads it alone could still hand either a file, the environment or a program from elsewhere:
// jq's -f, --from-file, -L, --rawfile, --slurpfile, --args and --jsonargs, gh's --input, -F and -f among them.
// JQ_REACH reads a word of jq's own wherever jq would: a - beside one is jq's operator, never part of a name
// (jq names hold no -), so -env.X, .a-env and -$ENV.X each read the environment, and negating or subtracting
// a string throws an error that prints it, in slices no mask matches (the eighth review's third attack); only
// a letter, digit, _, $ or . before a word makes it another name, a variable or a field.
// jq's data words: the seven the texts write, each a literal: ASSET_CHECK's manifest, file and template under an
// assembly's folder and its list of asset manifests, CLI_CHECK's unpacked manifest, and the two files of the
// checkout CLI_FETCH and CLI_CHECK read. A word that expands any other name ("$RUNNER_TEMP/$x", say) is none,
// since what the name holds isn't on the line: a local set to a path that climbed out of the temp folder with ..
// read the registry login skopeo keeps under XDG_RUNTIME_DIR and printed it (the eighth review's second
// attack); nor is any other path in the checkout, where a committed link could stand. The names these words
// expand are held to ASSET_CHECK's own lines (FILE_NAMES, fileNameLines()).
const JQ_FILE_WORDS: readonly string[] = [
  '"$dir/manifest.json"',
  '"$dir/$file"',
  '"$dir/$template"',
  sh`"$\{stackfiles[@]}"`,
  '"$RUNNER_TEMP/aws-cdk/package/package.json"',
  'infra/package.json',
  'package-lock.json',
]
const jqFileHeld = (word: string) => JQ_FILE_WORDS.includes(word)
// The names JQ_FILE_WORDS expand and those their values are built from (dir from queue, queue from root, dir,
// name and file, stackfiles from dir and file), which only ASSET_CHECK sets, each on a line of its own that
// FILE_NAME_LINES writes here as a literal, never read from the text, and each read of one in a while loop that
// takes its input only from a done line FILE_NAME_LOOPS pairs with it: no assignment, local, for, printf -v,
// mapfile or read elsewhere, and no other input to its loop, gives jq a path the line doesn't show. What the
// loops read is the assembly's own manifests, which ASSET_CHECK's checks before them hold to plain names in
// their own folder (its tests run them).
const FILE_NAMES = ['dir', 'file', 'template', 'stackfiles', 'queue', 'name', 'root']
const FILE_NAME_ASSIGNMENT = assigns(FILE_NAMES.join('|'))
const FILE_NAME_LINES = (): ReadonlyArray<readonly [string, string]> => [
  [sh`local queue=("$1") dir name`, 'ASSET_CHECK'],
  [sh`dir=$\{queue[0]}`, 'ASSET_CHECK'],
  [sh`queue=("$\{queue[@]:1}")`, 'ASSET_CHECK'],
  [sh`while IFS= read -r name; do`, 'ASSET_CHECK'],
  [sh`queue+=("$dir/$name")`, 'ASSET_CHECK'],
  [sh`local root dir file path manifests=0 queue stackfiles`, 'ASSET_CHECK'],
  [sh`root=$(cd "$1" && pwd -P)`, 'ASSET_CHECK'],
  [sh`queue=("$root")`, 'ASSET_CHECK'],
  [sh`while IFS= read -r file; do`, 'ASSET_CHECK'],
  [sh`stackfiles=()`, 'ASSET_CHECK'],
  [sh`stackfiles+=("$dir/$file")`, 'ASSET_CHECK'],
  [sh`queue+=("$dir/$file")`, 'ASSET_CHECK'],
  [sh`local root release=$2 digest services=0 dir stack template`, 'ASSET_CHECK'],
  [sh`while IFS= read -r dir; do`, 'ASSET_CHECK'],
  [sh`while IFS=$'\t' read -r stack template; do`, 'ASSET_CHECK'],
]
// Each loop that reads one of FILE_NAMES: its while line, the done line that feeds it, and the text it is in.
const FILE_NAME_LOOPS = (): ReadonlyArray<readonly [string, string, string]> => [
  [
    sh`while IFS= read -r name; do`,
    sh`done < <(jq -r '(.artifacts // {})[] | select(.type == "cdk:cloud-assembly") | .properties.directoryName' "$dir/manifest.json")`,
    'ASSET_CHECK',
  ],
  [
    sh`while IFS= read -r file; do`,
    sh`done < <(jq -r '(.artifacts // {})[] | select(.type == "aws:cloudformation:stack") | .properties.templateFile' "$dir/manifest.json")`,
    'ASSET_CHECK',
  ],
  [
    sh`while IFS= read -r file; do`,
    sh`done < <(jq -r '(.artifacts // {})[] | .additionalMetadataFile // empty' "$dir/manifest.json")`,
    'ASSET_CHECK',
  ],
  [
    sh`while IFS= read -r file; do`,
    sh`done < <(jq -r '(.artifacts // {})[] | select(.type == "cdk:asset-manifest") | .properties.file' "$dir/manifest.json")`,
    'ASSET_CHECK',
  ],
  [
    sh`while IFS= read -r file; do`,
    sh`done < <(jq -r '(.artifacts // {})[] | select(.type == "cdk:cloud-assembly") | .properties.directoryName' "$dir/manifest.json")`,
    'ASSET_CHECK',
  ],
  [sh`while IFS= read -r dir; do`, sh`done < <(assembly_dirs "$root")`, 'ASSET_CHECK'],
  [
    sh`while IFS=$'\t' read -r stack template; do`,
    sh`done < <(jq -r '(.artifacts // {})[] | select(.type == "aws:cloudformation:stack") | [.properties.stackName, .properties.templateFile] | @tsv' "$dir/manifest.json")`,
    'ASSET_CHECK',
  ],
]
const JQ_FLAG = /^-[cenrs]+$/
const JQ_PROGRAM = /^'[^']*'?$|^\.(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)?$/
const JQ_REACH =
  /(?<![\w$.])(?:\$?ENV|env|inputs?|input_filename|input_line_number|\$__loc__|\$__prog_args|import|include|modulemeta|get_search_list|get_prog_origin|get_jq_origin|debug|stderr|halt_error|halt)(?!\w)/
const programHeld = (program: string | undefined) =>
  program !== undefined && JQ_PROGRAM.test(program) && !JQ_REACH.test(program) && !wordAsRead(program).startsWith('-')
function jqHeld(words: readonly string[]): boolean {
  if (words.some(word => wordSplits(word) || (expandsToMany(word) && word !== sh`"$\{stackfiles[@]}"`))) return false
  let i = 0
  for (; i < words.length; i++) {
    const word = words[i] ?? ''
    if (JQ_FLAG.test(word)) continue
    if (word !== '--arg' && word !== '--argjson') break
    if (!/^[A-Za-z_]\w*$/.test(words[i + 1] ?? '') || words[i + 2] === undefined) return false
    i += 2
  }
  if (!programHeld(words[i])) return false
  return words.slice(i + 1).every(jqFileHeld)
}
// jq's -e sets its status from the last value the program prints alone (jq's manual, under --exit-status), so a
// check over every entry written X[] | f, jq's usual way to check each, passes whenever X's last entry passes,
// though it reads in a diff as all(X[]; f), which prints one value. So a program a canonical text or a run's
// own line hands jq with -e prints one value (jqPrintsOne): outside the arguments of all, any, first and map and
// an array it builds ([ … ]), each of which collects what it holds into one value, it iterates nothing (.[] or
// ..), writes no comma but between an object's entries, and no ?//; it names only JQ_ONE_NAMES, each of which
// prints at most one value for each it is given, and its own definitions whose bodies hold to the same (one
// that iterates, as ASSET_CHECK's of() does, only where its values are collected), capture with one plain string
// literal for its argument alone (with flags, given as a second argument or in an array with the pattern, "g"
// prints a value a match), and writes no comment. A program it can't read is refused.
const JQ_ONE_NAMES: ReadonlySet<string> = new Set([
  'and',
  'or',
  'not',
  'if',
  'then',
  'elif',
  'else',
  'end',
  'as',
  'true',
  'false',
  'null',
  'all',
  'any',
  'first',
  'map',
  'type',
  'length',
  'keys',
  'has',
  'select',
  'test',
  'capture',
  'sort',
  'to_entries',
  'tostring',
  'join',
  'gsub',
  'ascii_downcase',
  'contains',
  'endswith',
  'index',
])
const JQ_COLLECTS: ReadonlySet<string> = new Set(['all', 'any', 'first', 'map'])
// One jq string literal with no interpolation (\( … )), blanks around it aside.
const JQ_PLAIN_STRING = /^\s*"(?:[^"\\]|\\[^(])*"\s*$/
// The keywords after which a [ starts an array (if … then [ … ]) rather than indexing what comes before it.
const JQ_TERM_KEYWORDS: ReadonlySet<string> = new Set(['if', 'then', 'elif', 'else', 'and', 'or', 'as'])
export function jqPrintsOne(program: string): boolean {
  type Scope = { names: string[]; bad: boolean }
  type Definition = { names: string[]; bad: boolean; params: string[] }
  const definitions = new Map<string, Definition[]>()
  let scope: Scope = { names: [], bad: false }
  let at = 0
  // A program that doesn't read as jq's (a bracket or string left open or closed by the wrong one, a comment,
  // a definition's head) is refused whole.
  let broken = false
  // The identifier that ends just before end (blanks aside), and whether it is a bare word (not a field, a
  // variable or a format).
  const wordBefore = (end: number) => {
    const match = /([A-Za-z_]\w*)\s*$/.exec(program.slice(0, end))
    if (match === null) return undefined
    const before = program[end - match[0].length - 1] ?? ''
    return /[\w.$@]/.test(before) ? undefined : match[1]
  }
  const lastCharacter = (end: number) => /(\S)\s*$/.exec(program.slice(0, end))?.[1] ?? ''
  // Reads up to close (or to the end, for the program itself); counts the ; at its own depth.
  const read = (close: string, collecting: boolean, object: boolean): number => {
    let semicolons = 0
    while (at < program.length) {
      const c = program[at] ?? ''
      if (c === close) {
        at++
        return semicolons
      }
      if (c === ')' || c === ']' || c === '}' || c === '#') {
        broken = true
        at++
        continue
      }
      if (c === ';') {
        semicolons++
        at++
        continue
      }
      if (c === '"') {
        at++
        readString(collecting)
        continue
      }
      if (c === '(') {
        const name = wordBefore(at)
        at++
        const start = at
        const collects = name !== undefined && JQ_COLLECTS.has(name) && !definitions.has(name)
        const counted = read(')', collecting || collects, false)
        // capture's one argument may also be an array of a pattern and its flags, which jq reads as the
        // two-argument form, so it is one plain string literal (no interpolation), never an expression.
        const argument = program.slice(start, at - 1)
        if (name === 'capture' && (counted > 0 || !JQ_PLAIN_STRING.test(argument))) scope.bad = true
        continue
      }
      if (c === '[') {
        const previous = lastCharacter(at)
        const keyword = wordBefore(at)
        // A [ after a term indexes it: a name, a field, a ], ), } or string's end, or ?. A } closes an object, which
        // {a: X, b: Y}[] iterates (two values; round 12), never a new term.
        const indexes = /[\w.\])}"?]/.test(previous) && !(keyword !== undefined && JQ_TERM_KEYWORDS.has(keyword))
        at++
        if (indexes && /^\s*\]/.test(program.slice(at)) && !collecting) scope.bad = true
        read(']', collecting || !indexes, false)
        continue
      }
      if (c === '{') {
        at++
        read('}', collecting, true)
        continue
      }
      if (c === ',' && !collecting && !object) scope.bad = true
      if (program.startsWith('..', at) && !collecting) scope.bad = true
      if (program.startsWith('?//', at) && !collecting) scope.bad = true
      const word = /^[A-Za-z_]\w*/.exec(program.slice(at))?.[0]
      if (word === undefined) {
        at++
        continue
      }
      const before = program[at - 1] ?? ''
      at += word.length
      if (/[\w.$@]/.test(before) || (object && /^\s*:/.test(program.slice(at)))) continue
      if (word === 'def') {
        const head = /^\s+([A-Za-z_]\w*)\s*(?:\(([^()]*)\))?\s*:/.exec(program.slice(at))
        if (head === null) {
          broken = true
          continue
        }
        at += head[0].length
        const outer = scope
        scope = { names: [], bad: false }
        read(';', false, false)
        const params = (head[2] ?? '').split(';').map(each => each.trim())
        const list = definitions.get(head[1] ?? '') ?? []
        list.push({ ...scope, params: params.filter(each => PLAIN_NAME.test(each)) })
        definitions.set(head[1] ?? '', list)
        if (params.some(each => each !== '' && !PLAIN_NAME.test(each) && !/^\$[A-Za-z_]\w*$/.test(each))) {
          broken = true
        }
        scope = outer
        continue
      }
      if (!collecting) scope.names.push(word)
    }
    if (close !== '') broken = true
    return semicolons
  }
  const readString = (collecting: boolean) => {
    while (at < program.length) {
      const c = program[at]
      if (c === '\\' && program[at + 1] === '(') {
        at += 2
        read(')', collecting, false)
        continue
      }
      at += c === '\\' ? 2 : 1
      if (c === '"') return
    }
    broken = true
  }
  read('', false, false)
  // A name prints one value if it is one of JQ_ONE_NAMES no definition of the program's own replaces, or a
  // definition every one of whose bodies does, by the same reading (its own name and its filter parameters
  // within it); a definition that reaches itself through another is read as printing many.
  const one = (name: string, seen: ReadonlySet<string>): boolean => {
    const own = definitions.get(name)
    if (own === undefined) return JQ_ONE_NAMES.has(name)
    if (seen.has(name)) return false
    const within = new Set([...seen, name])
    return own.every(
      each => !each.bad && each.names.every(used => used === name || each.params.includes(used) || one(used, within)),
    )
  }
  return !broken && !scope.bad && scope.names.every(name => one(name, new Set()))
}
function ghHeld(words: readonly string[]): boolean {
  if (words.some(word => wordSplits(word) || expandsToMany(word))) return false
  const [api, path, ...rest] = words
  if (api !== 'api' || path === undefined || !/^"repos\/[^"]*"$/.test(path)) return false
  if (rest.length === 0) return true
  return rest.length === 2 && rest[0] === '--jq' && programHeld(rest[1])
}
// printf in a canonical text: a format first, one whole single-quoted string that reads as no option, or -v
// written plainly as a word of its own, then a plain name written as it is and such a format; never -v joined
// to its name (-vNAME, -v"a[…]"), quoted ("-v") or escaped, never a format an expansion gives, each of which
// bash reads as -v and a name whose subscript it evaluates (the seventh review's second attack), and never a
// name built from an expansion ("${kind^^}_TD"), which sets a name no rule that reads assignments sees, one
// the text later evaluates or PATH among them (the seventh review's third attack). The format's one conversion
// is %s (and %% a percent sign), as every canonical text writes it: bash's printf sets the variable an argument
// names for each %n, a plain name it reads as no assignment, PATH or a held name among them, and the other
// conversions read numbers, quote or expand escapes, which no text asks of it (round 11).
const PRINTF_FORMAT = /^'(?!-)(?:[^'%]|%[s%])*'$/
function printfHeld(words: readonly string[]): boolean {
  if (words[0] === '-v' && !PLAIN_NAME.test(words[1] ?? '')) return false
  const format = words[0] === '-v' ? words[2] : words[0]
  return format !== undefined && PRINTF_FORMAT.test(format)
}
// Every command CANONICAL_COMMANDS names is held by what it is handed (the seventh review's third attack, where
// a grep added to AWS_CHECK read the job's environment by /dev/fd/../environ and printed it in pieces no mask
// joins, and an aws line in it took --endpoint-url, which no rule read): bash's keywords and the builtins
// SHELL_OWN names, which read no file and run nothing by their words (what they set and evaluate is
// outsideEvaluations()'s and canonicalCommandLines()'s, and what they read by a redirection is below); jq,
// gh and printf by the rules above, aws by awsTextHeld() (its calls and options, AWS_TEXT_OPTIONS) and tee
// only appending to the summary (RULE_HELD); and every other, the plain tools (grep, wc, readlink, realpath,
// git, node, sort, sleep, mktemp, cd, pwd) as much as those that could run a program, write a file or fetch
// one (sed, tar, find, curl, openssl, base64, mkdir, sha256sum), only on a line written as TOOL_LINE_TEXTS
// holds it, so no flag that runs a program per member or checkpoint (tar's --to-command,
// --checkpoint-action, -I), per file (find's -exec) or per line (sed's e), writes a file (sed's w) or reads
// one the guard can't see (grep's operands), reaches any job. A tool a later change adds to
// CANONICAL_COMMANDS is line-held until a rule says otherwise.
const SHELL_OWN = [
  ':',
  '[',
  '[[',
  '{',
  '}',
  'break',
  'case',
  'continue',
  'done',
  'echo',
  'esac',
  'exit',
  'export',
  'fi',
  'for',
  'local',
  'mapfile',
  'read',
  'return',
  'set',
  'true',
]
const RULE_HELD: Readonly<Record<string, (words: readonly string[]) => boolean>> = {
  jq: jqHeld,
  gh: ghHeld,
  printf: printfHeld,
  aws: words => awsTextHeld(words),
  tee: words => words.length === 2 && words[0] === '-a' && words[1] === '"$GITHUB_STEP_SUMMARY"',
}
const lineHeld = (word: string) =>
  CANONICAL_COMMANDS.includes(word) && !SHELL_OWN.includes(word) && !Object.hasOwn(RULE_HELD, word)
// A redirection that reads a file (DPW-10): < or <> with a descriptor or none, $(< …) among them, but a
// here-string (<<<), a process substitution (< <( … )) and a duplicated descriptor (<&), with the start of its
// target, glued to the word before it or not (bash reads x<file as the word x and a read of file: round 11). A <
// that compares, in (( … )) or [[ … ]], reads as one too: a canonical text compares numbers with -lt or -gt in
// [ … ].
const FILE_READ = /(?<![<$])\d*(?:<>|<(?![<(&]))[ \t]*(<\()?/g
// The lines of a text that read a file by a redirection, but from /dev/null.
function fileReadLines(views: ShellViews): number[] {
  const text = views.text.split('\n')
  return views.code
    .split('\n')
    .flatMap((line, n) =>
      [...line.matchAll(FILE_READ)].some(
        match =>
          match[1] === undefined &&
          /^[^\s;&|()<>]*/.exec((text[n] ?? '').slice(match.index + match[0].length))?.[0] !== '/dev/null',
      )
        ? [n]
        : [],
    )
}
// The lines of a canonical text on which a command is handed what the rules above don't hold it to, or a file
// is read by a redirection on a line TOOL_LINE_TEXTS doesn't hold (the one such read the texts make outside a
// held tool's line is prod-gate's ignored lines into the summary).
export function canonicalToolLines(text: string): number[] {
  const views = shellViews(text)
  const raw = text.split('\n')
  const held = new Set(TOOL_LINE_TEXTS().map(([line]) => line))
  const isHeld = (n: number) => held.has(raw[n]?.trim() ?? '')
  const lines = new Set<number>()
  let offset = 0
  for (const [n, line] of views.code.split('\n').entries()) {
    for (const match of line.matchAll(/(?<![\w$/.{-])(jq|gh|printf|aws|tee)(?![\w-])/g)) {
      const words = withoutRedirections(commandWords(views.text, offset + match.index + match[0].length))
      if (!RULE_HELD[match[1] ?? '']?.(words)) lines.add(n)
    }
    offset += line.length + 1
  }
  for (const command of shellCommands(text)) {
    if (lineHeld(command.word) && !isHeld(command.line)) lines.add(command.line)
  }
  for (const n of fileReadLines(views)) if (!isHeld(n)) lines.add(n)
  return [...lines].sort((a, b) => a - b)
}

// The lines of a canonical text that hand jq -e (alone or among its other flags) a program that may print other
// than one value (jqPrintsOne), whose last value alone would decide the check (DPW-10).
const JQ_STATUS_RULE =
  'hands jq -e only a program that prints one value, since -e reads the last alone: outside all, any, first, map and an array it builds, no .[], .., comma, ?// or name but JQ_ONE_NAMES and its own definitions that hold to the same'
export function jqStatusLines(text: string): number[] {
  return lineNumbers(jqCalls(text).filter(call => call.status && !jqPrintsOne(call.program)))
}
// jq runs its program once for each value it reads and -e takes its status from the last output alone, so a jq -e
// fed a stream of values reads the last value alone, whatever its program prints for each: printf 'false\ntrue\n'
// | jq -e . exits 0, and jq -c '.[]' <<<"$X" | jq -e 'f', which reads as every entry holding f, holds the last
// alone (round 12). So no jq -e a canonical text writes is fed by a pipe, unless it is given -n (it reads no
// input) or -s (it reads every input as one array). jq reads each file it is given as inputs of its own too, so a
// jq -e given several files reads the last file alone (round 12's second iteration: jq -r -e '(.dockerImages //
// {}) | length == 0' "${stackfiles[@]}" read in a diff as no asset manifest holding a container image and held
// the last alone), so neither is one given more than one data word, or "${stackfiles[@]}", unless it is given
// -n or -s. A here-string holding several JSON texts is read the same way, which no rule reads: the texts'
// here-strings hand jq a value read whole from AWS, GitHub or an earlier jq; and each file is an assembly's,
// which the CLI parses as one JSON text. Whether a pipe stands before the jq is not where it reads, though (round
// 12's third iteration): a comment between the | and the jq, a helper function its caller pipes into (one() {
// jq -e '. == 1'; } called as … | one), a group after the pipe, get, or a < <( … ) each fed it a stream the
// reader saw no pipe before. So a jq -e reads one file, or a here-string written on its own command, or is given
// -n or -s; it never reads its standard input otherwise, from a pipe at any distance or anything else.
const JQ_PIPED_RULE =
  "hands jq -e no stream of values: it reads one file or a here-string on its own command, unless it is given -n or -s, and never its standard input otherwise (a pipe, a group, a function's caller, < <( … )) or more than one file, since -e reads the last value it reads alone"
export function jqPipedLines(text: string): number[] {
  return lineNumbers(
    jqCalls(text).filter(
      call => call.status && !call.oneInput && (call.piped || call.files > 1 || (call.files === 0 && !call.hereString)),
    ),
  )
}
// A jq given -n reads no input at all (jq's manual: the filter runs once, with null as its input), so a check
// written jq -ne '…' "$dir/$file" or jq -n -e '…' <<<"$X" checked null, and every (.X // {}) | all(…),
// [ … .[] … ] | all(…) or … | not then passed whatever its data held (round 12's fourth iteration, its second
// pass). So a jq given -n is handed no data: no file, no here-string or other redirection of its input, and no
// pipe; it builds only from --arg and --argjson, as every committed jq -n does.
const JQ_UNREAD_RULE =
  'hands a jq given -n no data, no file, here-string, input redirection or pipe, since it reads none of it and checks null'
export function jqUnreadLines(text: string): number[] {
  return lineNumbers(jqCalls(text).filter(call => call.noInput && call.fed))
}
const lineNumbers = (calls: ReadonlyArray<{ line: number }>) =>
  [...new Set(calls.map(call => call.line))].sort((a, b) => a - b)
// Whether the code before a command ends with a pipe that feeds it: a | or |& (never || or >|), then only blanks,
// a group's { or (, a ! and the keywords a command may follow.
const PIPED = /(?:^|[^|>])\|&?(?:\s|[{(!]|\b(?:then|do|else|elif|if|while|until|time)\b)*$/
// Each jq a text calls, as the code view reads it: its line, whether it is given -e, and -n or -s, whether a pipe
// feeds it, how many files it is given (a word that expands to several, "${stackfiles[@]}", counted as two),
// whether its own words hand it a here-string, and its program (a single-quoted one unquoted).
// A word that redirects standard input (<, <<<, <>, <&, with 0 or no descriptor before it), but a process
// substitution, which is an argument.
const INPUT_REDIRECTION = /^0?(?:<<<|<>|<&|<(?![<(]))/
type JqCall = {
  line: number
  status: boolean
  oneInput: boolean
  noInput: boolean
  fed: boolean
  piped: boolean
  files: number
  hereString: boolean
  program: string
}
function jqCalls(text: string): JqCall[] {
  const views = shellViews(text)
  const calls: JqCall[] = []
  let offset = 0
  for (const [n, line] of views.code.split('\n').entries()) {
    for (const match of line.matchAll(/(?<![\w$/.{-])jq(?![\w-])/g)) {
      const at = offset + match.index
      const written = commandWords(views.text, at + match[0].length)
      // jq's standard input is the last redirection of descriptor 0 its words write (bash applies them left to
      // right), so a here-string feeds it only if no <, <>, <& or 0< comes after it, and only on descriptor 0.
      const inputs = written.filter(word => INPUT_REDIRECTION.test(word))
      const hereString = /^0?<<</.test(inputs.at(-1) ?? '')
      const words = withoutRedirections(written)
      let i = 0
      let status = false
      let noInput = false
      let slurp = false
      for (; i < words.length; i++) {
        const word = words[i] ?? ''
        if (JQ_FLAG.test(word)) {
          status ||= word.includes('e')
          noInput ||= word.includes('n')
          slurp ||= word.includes('s')
        } else if (word === '--arg' || word === '--argjson') i += 2
        else break
      }
      const program = words[i] ?? ''
      const body = /^'[^']*'$/.test(program) ? program.slice(1, -1) : program
      const piped = PIPED.test(views.code.slice(Math.max(0, at - 200), at))
      const files = words.slice(i + 1).reduce((count, word) => count + (expandsToMany(word) ? 2 : 1), 0)
      // Whether its words or a pipe hand it data, which with -n it reads none of (JQ_UNREAD_RULE, its own rule:
      // JQ_PIPED_RULE still reads -n as reading no stream).
      const fed = files > 0 || inputs.length > 0 || piped
      const oneInput = slurp || noInput
      calls.push({ line: n, status, oneInput, noInput, fed, piped, files, hereString, program: body })
    }
    offset += line.length + 1
  }
  return calls
}

// The lines of a canonical text that set one of FILE_NAMES on a line FILE_NAME_LINES doesn't hold for that text,
// or that read one in a loop whose done line FILE_NAME_LOOPS doesn't pair with the loop's while line (DPW-10).
// A loop's do and done are paired by their nesting: a do ending a line or after a ;, a done starting a line or
// after a ;, as the texts write them; a text whose do and done don't pair has every setting line refused, and so
// does one that writes either word anywhere else (round 12's third iteration: bash also ends a loop's list at a
// do or done after &, a subshell's ) or a group's }, so : & done < <(…) fed the held read from any line and the
// held done line closed an until : & do : loop the pairing never saw).
const FILE_NAME_RULE =
  "sets a name jq's data words build a path from (dir, file, template, stackfiles, queue, name, root) only on ASSET_CHECK's own lines, and reads one only in a loop fed by its own done line, so jq reads no file a line doesn't show"
export const fileNameLines = (text: string, name: string): number[] =>
  heldNameLines(text, name, FILE_NAMES, FILE_NAME_ASSIGNMENT, FILE_NAME_LINES(), FILE_NAME_LOOPS())
// The lines of a canonical text named owner that set one of names (by an assignment the given pattern reads, or a
// word a builtin is handed) on a line lines doesn't hold for owner, or read one in a loop whose done line loops
// doesn't pair with its while line.
function heldNameLines(
  text: string,
  owner: string,
  names: readonly string[],
  assignment: RegExp,
  heldLines: ReadonlyArray<readonly [string, string]>,
  heldLoops: ReadonlyArray<readonly [string, string, string]>,
): number[] {
  const raw = text.split('\n')
  const lineOf = (n: number) => raw[n]?.trim() ?? ''
  const held = new Set(heldLines.flatMap(([line, by]) => (by === owner ? [line] : [])))
  const loops = new Set(heldLoops.flatMap(([open, close, by]) => (by === owner ? [`${open}\n${close}`] : [])))
  const code = shellViews(text).code.split('\n')
  const setters = new Set<number>()
  code.forEach((line, n) => {
    if (assignment.test(line)) setters.add(n)
  })
  const readers = new Set<number>()
  for (const command of shellCommands(text)) {
    const named = builtinNames(command).filter(each => names.includes(each))
    if (named.length === 0) continue
    setters.add(command.line)
    if (command.word === 'read') readers.add(command.line)
  }
  // Each do's line, paired with its done's.
  const closes = new Map<number, number>()
  const open: number[] = []
  let paired = true
  code.forEach((line, n) => {
    for (const match of line.matchAll(/(?:^|;)[ \t]*(do|done)(?=[ \t;<>)|&]|$)/g)) {
      if (match[1] === 'do') open.push(n)
      else {
        const from = open.pop()
        if (from === undefined) paired = false
        else closes.set(from, n)
      }
    }
  })
  if (open.length > 0) paired = false
  const count = (pattern: RegExp) => code.reduce((total, line) => total + [...line.matchAll(pattern)].length, 0)
  if (count(/(?:^|;)[ \t]*(?:do|done)(?=[ \t;<>)|&]|$)/g) !== count(/(?<![\w$./-])(?:do|done)(?![\w./-])/g))
    paired = false
  const lines = new Set<number>()
  for (const n of setters) {
    if (!paired || !held.has(lineOf(n))) lines.add(n)
  }
  for (const n of readers) {
    const close = closes.get(n)
    if (close === undefined || !loops.has(`${lineOf(n)}\n${lineOf(close)}`)) lines.add(close ?? n)
  }
  return [...lines].sort((a, b) => a - b)
}

// The names an aws value in a canonical text starts with (AWS_TEXT_VALUE_WORDS' "$td", "$CLUSTER", "$task",
// "$kind/…", "${TASK_ARNS[@]}", "$PROBE_TD", "$NET_PROBE", "$TOKEN" and "$OVERRIDES", where a value from
// elsewhere could hand aws-cli a scheme it loads a file by), and the names each is read from, back to an aws call
// by the stage's own names, a literal, the job's env or a function's argument: each set only on the lines
// AWS_NAME_LINES writes here as literals, never read from a text, in the text it names, and each read of one by
// read only in a loop whose done line AWS_NAME_LOOPS pairs with it (the tenth review's first attack, where
// AWS_CHECK read td from the Services stack's outputs, which a release writes, and a file:// output had aws-cli
// load the runner's environment and send it to ECS). A text that sets one anywhere else, or feeds its loop from
// anything else, is refused, whatever its shape check; a new setter joins this list in the same change, which the
// owner reads as a rule's change. Round 11 added the names AWS_CHECK's drift lookup builds "imageDigest=…" from
// (digests and image), the one-off's placement PROBE hands one_off_end (RUN) and the releases ecr_has is handed
// (RELEASE and PREVIOUS, the job's env, which no text sets), and holds a function's argument as a root only where
// the function's own calls, as written, hand it (AWS_ARGUMENT_CALLS), since a digest from a stack's outputs set
// digests, or handed ecr_has, and reached aws as a shorthand file load (imageTag@=file://…). The one-off's log
// read added cursor, the forward token it hands --next-token, read from next and page, its log's own answer,
// which ONE_OFF holds to a shape with no colon and no leading dash (no scheme, no option) before aws reads it.
const AWS_NAMES = [
  'td',
  'image',
  'digests',
  'RUN',
  'RELEASE',
  'PREVIOUS',
  'out',
  'CLUSTER',
  'outputs',
  'definition',
  'MIGRATE_TD',
  'PROBE_TD',
  'kind',
  'task',
  'placed',
  'ARNS',
  'TASK_ARNS',
  'OVERRIDES',
  'NET_PROBE',
  'NET_MIGRATE',
  'TOKEN',
  'cursor',
  'next',
  'page',
]
const AWS_NAME_ASSIGNMENT = assigns(AWS_NAMES.join('|'))
const AWS_NAME_LINES = (): ReadonlyArray<readonly [string, string]> => [
  [
    sh`local mode=$1 stage=$STAGE out status release='' running='' digests=() td image tag pushed='' commit`,
    'AWS_CHECK',
  ],
  [
    sh`if ! out=$(get aws cloudformation describe-stacks --stack-name "Hearth-$stage-Services" --query 'Stacks[0].[StackStatus, Outputs[?OutputKey==\`Release\`].OutputValue | [0]]' --output json 2>&1); then`,
    'AWS_CHECK',
  ],
  [
    sh`out=$(get aws ecr describe-images --repository-name hearth-server --query 'imageDetails[].imageTags[]' --output json) ||`,
    'AWS_CHECK',
  ],
  [
    sh`if ! out=$(get aws ecs describe-services --cluster "hearth-$stage" --services "hearth-$stage-api" "hearth-$stage-realtime" "hearth-$stage-worker" --query '{services: services[?status!=\`INACTIVE\`].deployments[].taskDefinition, counts: services[?status!=\`INACTIVE\`].length(deployments)}' --output json 2>&1); then`,
    'AWS_CHECK',
  ],
  [sh`*ClusterNotFoundException*) out='{"services": [], "counts": []}' ;;`, 'AWS_CHECK'],
  [sh`while IFS= read -r td; do`, 'AWS_CHECK'],
  [
    sh`image=$(get aws ecs describe-task-definition --task-definition "$td" --query "taskDefinition.containerDefinitions[?name=='server'].image | [0]" --output text)`,
    'AWS_CHECK',
  ],
  [sh`digests+=("$\{image##*@}")`, 'AWS_CHECK'],
  [sh`local outputs kind definition`, 'TASKS_OUTPUTS'],
  [
    sh`outputs=$(get aws cloudformation describe-stacks --stack-name "Hearth-$STAGE-Tasks" --query 'Stacks[0].Outputs' --output json)`,
    'TASKS_OUTPUTS',
  ],
  [sh`CLUSTER=$(output Cluster)`, 'TASKS_OUTPUTS'],
  [sh`for kind in migrate probe; do`, 'TASKS_OUTPUTS'],
  [sh`definition=$(output "$\{kind^}TaskDefinition")`, 'TASKS_OUTPUTS'],
  [sh`migrate) MIGRATE_TD="$\{definition##*/}" ;;`, 'TASKS_OUTPUTS'],
  [sh`probe) PROBE_TD="$\{definition##*/}" ;;`, 'TASKS_OUTPUTS'],
  [
    sh`local kind=$1 lines=$2 placed=$3 task ended log='[]' page joined cursor='' next='' pages=0 whole=0 shown='' withheld=0 stopped=0 stopping`,
    'ONE_OFF',
  ],
  [sh`task=$(jq -r '.tasks[0]' <<<"$placed")`, 'ONE_OFF'],
  [
    sh`page=$(get aws logs get-log-events --log-group-name "/hearth/$STAGE/$kind" --log-stream-name "$kind/server/$\{task##*/}" --start-from-head --query '{events: events[].message, next: nextForwardToken}' --output json) || break`,
    'ONE_OFF',
  ],
  [
    sh`page=$(get aws logs get-log-events --log-group-name "/hearth/$STAGE/$kind" --log-stream-name "$kind/server/$\{task##*/}" --start-from-head --next-token "$cursor" --query '{events: events[].message, next: nextForwardToken}' --output json) || break`,
    'ONE_OFF',
  ],
  [sh`next=$(jq -r '.next // ""' <<<"$page" 2>/dev/null) || break`, 'ONE_OFF'],
  [sh`cursor=$next`, 'ONE_OFF'],
  [
    sh`ARNS=$(get aws ecs list-tasks --cluster "$CLUSTER" --service-name "hearth-$STAGE-$ROLE" --desired-status RUNNING --query 'taskArns' --output json)`,
    'PROBE',
  ],
  [sh`mapfile -t TASK_ARNS < <(jq -r '.[]' <<<"$ARNS")`, 'PROBE'],
  [OVERRIDES_JQ, 'PROBE'],
  [NET_JQ.probe, 'PROBE'],
  [RUN_TASK_PROBE, 'PROBE'],
]
const AWS_NAME_LOOPS = (): ReadonlyArray<readonly [string, string, string]> => [
  [sh`while IFS= read -r td; do`, sh`done < <(jq -r '.services[]' <<<"$out")`, 'AWS_CHECK'],
]
// The functions an aws value reads an argument of (ecr_has's "imageDigest=$2", and one_off_end's third, the
// placement it reads the task it waits on from), each called in a canonical text only on the lines written here
// (a credentialed run's own lines call one only as CANONICAL_CALLS writes it), and the lines whose aws value
// expands a positional parameter, each in its own text, so no other function hands aws an argument and no call
// hands one a value from elsewhere (round 11).
const AWS_ARGUMENT_CALLS = (): ReadonlyArray<readonly [string, string, string]> => [
  [
    'ecr_has',
    sh`rollback | drill | restore) ecr_has "$\{RELEASE%%:*}" "$\{RELEASE#*:}" || aws_refuse "ECR holds no image of the release under its commit's tag" ;;`,
    'AWS_CHECK',
  ],
  [
    'ecr_has',
    sh`auto) ecr_has "$\{PREVIOUS%%:*}" "$\{PREVIOUS#*:}" || aws_refuse "ECR holds no image of the previous release under its commit's tag" ;;`,
    'AWS_CHECK',
  ],
  ['one_off_end', sh`one_off_end probe "$PROBE_LINES" "$RUN"`, 'PROBE'],
]
const AWS_ARGUMENT_LINES = (): ReadonlyArray<readonly [string, string]> => [
  [
    sh`tags=$(get aws ecr describe-images --repository-name hearth-server --image-ids "imageDigest=$2" --query 'imageDetails[0].imageTags' --output json) || return 1`,
    'AWS_CHECK',
  ],
]
const AWS_NAME_RULE =
  "sets a name an aws value starts with, or one it is read from, only on its text's own lines, from an aws call by the stage's names, a literal, the job's env or a function's argument, which only that function's own calls, as written, hand it, and reads one only in a loop fed by its own done line, so no value from elsewhere (a stack's outputs, say) reaches aws, where a file:// would load a file"
export function awsNameLines(text: string, name: string): number[] {
  const lines = new Set(heldNameLines(text, name, AWS_NAMES, AWS_NAME_ASSIGNMENT, AWS_NAME_LINES(), AWS_NAME_LOOPS()))
  const raw = text.split('\n')
  const lineOf = (n: number) => raw[n]?.trim() ?? ''
  const calls = AWS_ARGUMENT_CALLS()
  const called = new Set(calls.map(([fn]) => fn))
  // Each line's calls of one, less its definitions on that line (shellCommands() reads f() { as a call of f).
  const counts = new Map<string, { fn: string; line: number; calls: number }>()
  const at = (fn: string, line: number) => {
    const key = `${fn} ${line}`
    const entry = counts.get(key) ?? { fn, line, calls: 0 }
    counts.set(key, entry)
    return entry
  }
  for (const command of shellCommands(text)) if (called.has(command.word)) at(command.word, command.line).calls++
  for (const definition of functionDefinitions(text)) {
    if (called.has(definition.name)) at(definition.name, definition.line).calls--
  }
  for (const { fn, line, calls: made } of counts.values()) {
    const written = calls.some(([each, held, by]) => each === fn && by === name && held === lineOf(line))
    if (made > 0 && !written) lines.add(line)
  }
  // A word an aws value may hold that expands a positional parameter stands only on its held line.
  const positional = AWS_TEXT_VALUE_WORDS.filter(word => /\$\{?[0-9@*#]/.test(word))
  const held = new Set(AWS_ARGUMENT_LINES().flatMap(([line, by]) => (by === name ? [line] : [])))
  raw.forEach((line, n) => {
    if (positional.some(word => line.includes(word)) && !held.has(lineOf(n))) lines.add(n)
  })
  return [...lines].sort((a, b) => a - b)
}

// The lines of a canonical text on which read is handed no -r or runs without IFS= or IFS=$'\t' before it, or
// mapfile or readarray is handed no -t (the tenth review's first attack, where a read with no -r in ASSET_CHECK's
// loop over asset paths joined a path that ends in a backslash to the next one, so the check read one path inside
// the assembly while the CLI read two, the second outside it): without -r, read takes a backslash as an escape and
// one at a line's end as joining the line to the next; without IFS=, it trims each line's blanks; and without -t,
// mapfile keeps each line's break in its element. So every line of what a loop reads is read as written.
const READER_RULE =
  "hands read -r, after IFS= or IFS=$'\\t', and mapfile and readarray -t, so no backslash in what it reads escapes a character or joins two lines into one, no line is trimmed and no element keeps its line break"
export function readerLines(text: string): number[] {
  return shellCommands(text).flatMap(command => {
    const given = withoutRedirections(words(command.tail))
    if (command.word === 'read') {
      const separated = command.prefixes.some(prefix => IFS_PREFIXES.includes(prefix))
      return given.includes('-r') && separated ? [] : [command.line]
    }
    if (command.word === 'mapfile' || command.word === 'readarray') return given.includes('-t') ? [] : [command.line]
    return []
  })
}

// The commands a canonical text runs (DPW-10), a closed list, so it loads, sets or runs nothing its own lines
// don't show: bash's own that hand the shell nothing to run, load or export (no eval, source, ., trap, alias,
// shopt, enable, builtin, command, exec, coproc, readonly, declare, typeset, let, unset, wait, getopts,
// select, readarray or ulimit), the tools the texts use, each held by the rules beside it, and the functions
// the canonical texts define; never a word bash takes from a quote, an escape or an expansion ("jq", \jq,
// $tool), which no list names, but the preamble's "$@" in run and get and the CLI's "$CDK" on a CLI line.
const CANONICAL_COMMANDS = [
  ':',
  '[',
  '[[',
  '{',
  '}',
  'break',
  'case',
  'cd',
  'continue',
  'done',
  'echo',
  'esac',
  'exit',
  'export',
  'fi',
  'for',
  'local',
  'mapfile',
  'printf',
  'pwd',
  'read',
  'return',
  'set',
  'true',
  'aws',
  'base64',
  'curl',
  'find',
  'gh',
  'git',
  'grep',
  'jq',
  'mkdir',
  'mktemp',
  'node',
  'openssl',
  'readlink',
  'realpath',
  'sed',
  'sha256sum',
  'sleep',
  'sort',
  'tar',
  'tee',
  'wc',
]
// What a canonical text puts into the environment of what it runs is a closed list too (the seventh review's
// second attack, where an export of TAR_OPTIONS handed the CLI's held tar a checkpoint action from outside
// its held line): export only on EXPORT_LINES (the preamble's CDK settings and CDK_FOLDER's fresh HOME),
// local with no flag (no -x), set only as set -euo pipefail (no -a or -k, which export each assignment), no
// assignment before a command's word but IFS's before read, a builtin, which hands no child an environment,
// no wrapper (env, command, …), and no assignment, anywhere, of a name that chooses what a program runs or
// reads (LOADER_NAMES) but CDK_FOLDER's HOME, nor of one a rule holds to its one line (HELD_NAMES) but the
// preamble's CDK, in any spelling. A held tool's line is held with its environment.
const EXPORT_LINES = (): ReadonlySet<string> => new Set([PREAMBLE.split('\n').at(-1) ?? '', CDK_FOLDER])
const IFS_PREFIXES = ['IFS=', "IFS=$'__'"]
// The names a builtin sets by a word it is handed rather than by NAME=, which LOADER_ASSIGNMENT doesn't read:
// read's, mapfile's and readarray's names, a for or select loop's, getopts', printf -v's and local's (each a
// plain word, by the rules above), so none is PATH, HOME or another of LOADER_NAMES (the seventh review's third
// attack), nor one of HELD_NAMES (the eighth review's first); each read past the command's redirections, so a
// printf < x -v PATH, whose name a redirection comes before, is read as the -v it is.
const builtinNames = ({ word, tail }: ShellCommand): string[] => {
  const given = withoutRedirections(words(tail))
  if (word === 'read' || word === 'mapfile' || word === 'readarray') return given.filter(each => PLAIN_NAME.test(each))
  if (word === 'for' || word === 'select') return given.slice(0, 1)
  if (word === 'getopts') return given.slice(1, 2)
  if (word === 'local') return given.map(each => /^[A-Za-z_]\w*(?=\+?=|$)/.exec(each)?.[0] ?? '').filter(Boolean)
  return word === 'printf' && given[0] === '-v' ? given.slice(1, 2) : []
}
// The names the credentials action exports for every later step (the session's keys, its region) and the role it
// assumes, which no canonical text sets by a builtin's word or an assignment, in any spelling (round 12's third
// iteration: for AWS_REGION in …, read, printf -v or local sent every later aws read of the text elsewhere,
// while the workflow-level rule read only NAME=).
const AWS_ENV_NAME = /^(?:AWS_\w*|ROLE_TO_ASSUME)$/
const AWS_ENV_SET = assigns(String.raw`AWS_\w*|ROLE_TO_ASSUME`)
// The lines of a canonical text that run a command CANONICAL_COMMANDS doesn't name (or no function the
// canonical texts define), or that hand what they run an environment of their own.
export function canonicalCommandLines(text: string, functions: ReadonlySet<string>): number[] {
  const raw = text.split('\n')
  const lineOf = (n: number) => raw[n]?.trim() ?? ''
  const lines = new Set<number>()
  for (const command of shellCommands(text)) {
    const { word, prefixes } = command
    const assigned = prefixes.filter(prefix => /^[A-Za-z_]\w*\+?=/.test(prefix))
    const wrapped = prefixes.filter(prefix => !assigned.includes(prefix))
    const allowed =
      CANONICAL_COMMANDS.includes(word) ||
      functions.has(word) ||
      (word === '"$@"' && PREAMBLE_RUNNERS.includes(lineOf(command.line))) ||
      (word === '"$CDK"' && CLI_LINES.includes(lineOf(command.line)))
    const environment =
      (word === 'export' && !EXPORT_LINES().has(lineOf(command.line))) ||
      ((word === 'local' || word === 'export') && /(?:^|\s)[-+][A-Za-z]/.test(command.tail)) ||
      (word === 'set' && !/^\s+-euo\s+pipefail\s*$/.test(command.tail)) ||
      (assigned.length > 0 && !(word === 'read' && assigned.every(prefix => IFS_PREFIXES.includes(prefix)))) ||
      wrapped.some(prefix => prefix !== 'run' && prefix !== 'get') ||
      builtinNames(command).some(
        name =>
          LOADER_NAME.test(name) ||
          HELD_NAMES.includes(name) ||
          SHELL_TABLE.bashVariables.test(name) ||
          AWS_ENV_NAME.test(name),
      )
    if (!allowed || environment) lines.add(command.line)
  }
  const code = shellViews(text).code.split('\n')
  for (const [n, line] of code.entries()) {
    if (LOADER_ASSIGNMENT.test(line) && lineOf(n) !== CDK_FOLDER) lines.add(n)
    if (HELD_ASSIGNMENT.test(line) && lineOf(n) !== PREAMBLE_CDK) lines.add(n)
    if (AWS_ENV_SET.test(line)) lines.add(n)
    if (bashVariableAssigned(line) && lineOf(n) !== CDK_FOLDER) lines.add(n)
  }
  return [...lines].sort((a, b) => a - b)
}
// Whether a code view's line assigns one of bash's own variables (SHELL_TABLE.bashVariables, which the glue
// refuses too), but IFS as a prefix before read, which the command's own rule holds to IFS_PREFIXES: they
// change how bash reads, finds or runs what follows (the ninth review's first attack, where EXECIGNORE='*/find'
// hid find from bash's search, so ASSET_CHECK's [ -z "$(find …)" ] read an empty answer and passed; TMOUT,
// FUNCNEST, GLOBIGNORE, POSIXLY_CORRECT, a standalone IFS, LANG and LC_ALL change a check's reading as quietly).
// Read in every spelling assigns() reads; builtinNames() reads the names a builtin sets.
const ASSIGNED_NAME = /(?<![\w$.-])([A-Za-z_]\w*)(?:\[[^\]]*\])?\s*(?:[-+*/%&|^:]|<<|>>)?=(?!=)/g
const IFS_BEFORE_READ = /^(?:\$'_*'|'_*'|"_*"|[^\s;&|]*)\s+read(?![\w-])/
function bashVariableAssigned(line: string): boolean {
  for (const match of line.matchAll(ASSIGNED_NAME)) {
    const name = match[1] ?? ''
    if (!SHELL_TABLE.bashVariables.test(name)) continue
    if (name === 'IFS' && IFS_BEFORE_READ.test(line.slice((match.index ?? 0) + match[0].length))) continue
    return true
  }
  return false
}
// Every name bash 5.2 knows as a builtin or a keyword (compgen -b and compgen -k), which a function of that
// name would shadow: outside POSIX mode bash looks a function up before a builtin, special builtins included.
const BASH_BUILTINS_AND_KEYWORDS = new Set(
  (
    '. : [ alias bg bind break builtin caller cd command compgen complete compopt continue declare dirs disown echo ' +
    'enable eval exec exit export false fc fg getopts hash help history jobs kill let local logout mapfile popd ' +
    'printf pushd pwd read readarray readonly return set shift shopt source suspend test times trap true type ' +
    'typeset ulimit umask unalias unset wait if then else elif fi case esac for select while until do done in ' +
    'function time { } ! [[ ]] coproc'
  ).split(' '),
)
// The function names bash itself calls (round 12): bash 5.2 runs
// command_not_found_handle, with the words of any command it can't find, and takes its status in place of 127,
// so command_not_found_handle() { return 0; } made a call to a missing function carry on past its || refusal.
const BASH_HOOKS = ['command_not_found_handle']
// A function a canonical text defines (round 11): a plain lower-case name, never a builtin's or keyword's
// (exit() { :; } made every later exit 1 in an aws_refuse or asset_refuse carry on, since bash finds a function
// first), a command's a text or a run's own lines run (CANONICAL_COMMANDS, the glue's GLUE_USES and its own
// functions), nor one another text defines, so no text redefines what another's calls run; each defined once in
// the text it comes from (a text that holds another whole, as a fast re-check holds NEWEST_RELEASE, defines that
// text's functions as it does).
const FUNCTION_NAME_SHAPE = /^[a-z][a-z0-9_]*$/
const FUNCTION_NAME_RULE =
  "defines a function only by a plain lower-case name of its own, once: never a builtin's or keyword's (bash finds a function before a builtin, exit and return among them), one bash itself calls (command_not_found_handle), a command's a text or a run runs, or one another canonical text defines"
export function functionNameLines(text: string, all: Readonly<Record<string, string>>): number[] {
  const reserved = new Set<string>([
    ...BASH_BUILTINS_AND_KEYWORDS,
    ...BASH_HOOKS,
    ...CANONICAL_COMMANDS,
    ...SHELL_TABLE.refused,
    ...Object.keys(SHELL_TABLE.builtins),
    ...SHELL_TABLE.keywords,
    ...SHELL_TABLE.functions,
    // The glue's commands, but the canonical texts' own functions it calls (mask, run, get).
    ...Object.keys(GLUE_USES).filter(
      command =>
        !Object.values(CANONICAL_BY_NAME()).some(each => functionDefinitions(each).some(d => d.name === command)),
    ),
  ])
  const definitions = functionDefinitions(text)
  const texts = Object.values(all)
  const lines = new Set<number>()
  for (const { name, line } of definitions) {
    // The texts that define the name, and one of them that each of the others holds whole.
    const definers = texts.filter(each => functionDefinitions(each).some(definition => definition.name === name))
    const origin = definers.find(each => definers.every(definer => definer.includes(each)))
    if (
      !FUNCTION_NAME_SHAPE.test(name) ||
      reserved.has(name) ||
      definitions.filter(definition => definition.name === name).length !== 1 ||
      origin === undefined ||
      functionDefinitions(origin).filter(definition => definition.name === name).length !== 1
    ) {
      lines.add(line)
    }
  }
  return [...lines].sort((a, b) => a - b)
}
// The functions the canonical texts define, which any of them may call.
const CANONICAL_FUNCTIONS = (texts: Readonly<Record<string, string>>): ReadonlySet<string> =>
  new Set(
    [...Object.values(CANONICAL_BY_NAME()), ...Object.values(texts)].flatMap(text =>
      functionDefinitions(text).map(each => each.name),
    ),
  )

// The names a canonical text may expand (DPW-07; the seventh review's fourth attack, where an echo added to
// AWS_CHECK printed the OIDC request token spaced out, which no mask matches, since expandsOnlyItsOwn() reads a
// run's own lines alone): the runner's own that a run's own lines may expand (RUNNER_EXPANSIONS), the run's
// commit (GITHUB_SHA) and bash's SECONDS; and, outside the runner's and the credentials' namespaces (ACTIONS_,
// GITHUB_, RUNNER_, AWS_, GH_, INPUT_, STATE_), a name a canonical text sets, one a step's env: (STEP_ENVS) or a
// job's (STAGE) gives from no secret or token, but those only a pinned run's own lines read (OWN_LINE_NAMES), or
// the one-offs' TOKEN, the assembly's folder (ASSEMBLY) and prod-plan's diff file (DIFF, RESTORE_DOWN_DIFF's),
// which a run's own lines set before the texts that read them. So no canonical text expands, in any form this
// reads, the OIDC request token or its URL, the runtime token, an AWS_ variable, the job's token or a secret an
// env: hands its step, even after setting the name to itself (NAME="$NAME"), whose expansion bash reads first.
const CREDENTIAL_NAMESPACE = /^(?:ACTIONS|GITHUB|RUNNER|AWS|GH|INPUT|STATE)_/
// The names a step's env: gives that only a pinned run's own lines expand, never a canonical text: an asset
// check's ASSEMBLY_FOLDER, which its two calls (ASSET_CHECK_CALLS) read, so the folder ASSET_CHECK checks is the
// one its call names, and no line of ASSET_CHECK reads which folder its step names.
const OWN_LINE_NAMES: readonly string[] = ['ASSEMBLY_FOLDER']
const RUNNER_NAMES = (): readonly string[] => [...RUNNER_EXPANSIONS, 'GITHUB_SHA', 'SECONDS']
// The names a step's env: gives from a secret or the job's token (round 12's fourth iteration, its second pass:
// only canonicalGiven() dropped them, so a canonical text that set ACCOUNT_ID="${ACCOUNT_ID:-}", the ordinary set -u
// default, made the push's account id, from secrets.AWS_ACCOUNT_ID, a name of its own, and printed it in two
// halves, which neither the runner's masks nor mask match). No text's own assignment makes one its own.
let SECRET_GIVEN: ReadonlySet<string> | undefined
const secretGiven = (): ReadonlySet<string> => {
  SECRET_GIVEN ??= new Set(
    Object.values(STEP_ENVS)
      .flatMap(steps => Object.values(steps).flatMap(env => Object.entries(env)))
      .filter(([, value]) => /secrets|github\s*\.\s*token/i.test(value))
      .map(([name]) => name),
  )
  return SECRET_GIVEN
}
const namesSetIn = (text: string): string[] => [...NAMES_SET_BY(text), ...shellCommands(text).flatMap(builtinNames)]
// A name no text may make its own: the runner's and the credentials' namespaces, the tokens, and a secret's.
const foreign = (name: string) =>
  CREDENTIAL_NAMESPACE.test(name) || TOKEN_NAMES.includes(name) || secretGiven().has(name)
let CANONICAL_GIVEN: ReadonlySet<string> | undefined
const canonicalGiven = (): ReadonlySet<string> => {
  if (CANONICAL_GIVEN === undefined) {
    const envs = Object.values(STEP_ENVS).flatMap(steps => Object.values(steps).flatMap(env => Object.entries(env)))
    CANONICAL_GIVEN = new Set(
      [
        ...envs.map(([name]) => name),
        'STAGE',
        'TOKEN',
        'ASSEMBLY',
        'DIFF',
        ...Object.values(CANONICAL_BY_NAME()).flatMap(namesSetIn),
      ].filter(name => !secretGiven().has(name) && !CREDENTIAL_NAMESPACE.test(name) && !OWN_LINE_NAMES.includes(name)),
    )
  }
  return CANONICAL_GIVEN
}
// The lines of a canonical text that expand a name it may not ($NAME, ${NAME…}, ${#NAME…}, read on the code
// view, so a jq program's own $name in single quotes is none), given the names the texts beside it set.
export function foreignExpansionLines(text: string, alsoSet: readonly string[] = []): number[] {
  const views = shellViews(text)
  const allowed = new Set([...canonicalGiven(), ...alsoSet.filter(name => !foreign(name)), ...RUNNER_NAMES()])
  const lines = new Set<number>()
  for (const match of views.code.matchAll(/\$\{?[#!]?(?=[A-Za-z_])/g)) {
    const name = /^\$\{?[#!]?([A-Za-z_]\w*)/.exec(views.text.slice(match.index))?.[1] ?? ''
    if (!allowed.has(name)) lines.add(views.code.slice(0, match.index).split('\n').length - 1)
  }
  return [...lines].sort((a, b) => a - b)
}
const CANONICAL_EXPANDS_RULE =
  "expands only a name a canonical text sets, one its step's or job's env: gives from no secret or token (but ASSEMBLY_FOLDER, which only an asset check's own calls read), the one-offs' TOKEN, the assembly's folder, prod-plan's diff file, or the runner's outputs, summary, folder, run ids, address and commit, so no canonical text prints the OIDC request token or another credential its job holds"

// The names a step's or a job's env: gives a run (DPW-10): every STEP_ENVS name and the job's STAGE, none of which
// a canonical text sets, by an assignment in any spelling assigns() reads or a word a builtin is handed (read,
// mapfile, for, printf -v, local and the rest builtinNames() reads), on any line; declare, typeset, unset,
// readonly, eval and export off its lines canonicalCommandLines() refuses already. So a pinned call line that reads
// one (an asset check's ASSEMBLY_FOLDER and RELEASE, say) reads what STEP_ENVS pins for its step, whatever the
// texts before it run (round 13: with the folder read from the step's env:, a line of ASSET_CHECK setting
// ASSEMBLY_FOLDER would point its own calls at another folder, which no other rule reads).
let ENV_GIVEN: { names: readonly string[]; assignment: RegExp } | undefined
const envGiven = () => {
  if (ENV_GIVEN === undefined) {
    const names = [
      ...new Set([
        'STAGE',
        ...Object.values(STEP_ENVS).flatMap(steps => Object.values(steps).flatMap(env => Object.keys(env))),
      ]),
    ].sort()
    ENV_GIVEN = { names, assignment: assigns(names.join('|')) }
  }
  return ENV_GIVEN
}
export const envGivenLines = (text: string, name: string): number[] =>
  heldNameLines(text, name, envGiven().names, envGiven().assignment, [], [])
const ENV_GIVEN_RULE =
  "sets no name a step's or a job's env: gives (STEP_ENVS's names and STAGE), in any spelling, so a pinned call line reads from its step's env: what STEP_ENVS pins"

// DPW-10's rule over the canonical texts, which a run may hold whole: each is written in the shell
// shellViews() and shellCommands() read (readsAsBash()), so the rules read its commands as bash runs them,
// evaluates nothing from outside it (outsideEvaluations()), expands no credential (foreignExpansionLines(),
// DPW-07's), and hands jq, gh and the tools that could run a program or write a file only what
// canonicalToolLines() holds them to, each line that does otherwise named. Each holds in every form these
// rules read, a second layer behind the owner's read of a changed text (the header's last paragraph). The
// guard's own texts never change while it runs, so their findings are read once (CANONICAL_FOUND).
let CANONICAL_FOUND: readonly Finding[] | undefined
export function canonicalTextFindings(texts?: Readonly<Record<string, string>>): Finding[] {
  if (texts === undefined) {
    CANONICAL_FOUND ??= canonicalTextFindings(CANONICAL_BY_NAME())
    return [...CANONICAL_FOUND]
  }
  const found: Finding[] = []
  const functions = CANONICAL_FUNCTIONS(texts)
  const exiting = exitingFunctions(Object.values({ ...CANONICAL_BY_NAME(), ...texts }))
  const alsoSet = Object.values(texts).flatMap(namesSetIn)
  // Every text a canonical text runs joined with: the others (the guard's own, with any given in their place)
  // and every pinned run, own lines and all; and every name an env: hands a step or a job.
  const elsewhere: Elsewhere = {
    texts: [
      ...new Set([
        ...Object.values({ ...CANONICAL_BY_NAME(), ...texts }),
        ...Object.values(PINNED_RUNS()).flatMap(steps => Object.values(steps).map(step => step.run)),
      ]),
    ],
    given: new Set([
      'STAGE',
      ...Object.values(STEP_ENVS).flatMap(steps => Object.values(steps).flatMap(env => Object.keys(env))),
    ]),
  }
  const all = { ...CANONICAL_BY_NAME(), ...texts }
  for (const [name, text] of Object.entries(texts)) {
    if (!readsAsBash(text)) found.push(`${GUARD}: DPW-10 ${name}: is written in the shell shellViews() reads`)
    for (const line of functionNameLines(text, all)) {
      found.push(`${GUARD}: DPW-10 ${name}, line ${line + 1}: ${FUNCTION_NAME_RULE}`)
    }
    for (const line of foreignExpansionLines(text, alsoSet)) {
      found.push(`${GUARD}: DPW-07 ${name}, line ${line + 1}: ${CANONICAL_EXPANDS_RULE}`)
    }
    for (const line of stopTokenLines(text))
      found.push(`${GUARD}: DPW-07 ${name}, line ${line + 1}: ${STOP_TOKEN_RULE}`)
    for (const line of outsideEvaluations(text, elsewhere)) {
      found.push(
        `${GUARD}: DPW-10 ${name}, line ${line + 1}: evaluates as arithmetic, a subscript, an offset, a name or a prompt only what it sets itself`,
      )
    }
    for (const line of canonicalToolLines(text)) {
      found.push(
        `${GUARD}: DPW-10 ${name}, line ${line + 1}: hands jq and gh only their held flags and a program written on the line, printf a single-quoted format whose one conversion is %s and a plain -v name, aws only its calls and options, tee only the summary and every other tool only its line as the guard writes it, and reads a file by a redirection only on such a line`,
      )
    }
    for (const line of jqStatusLines(text)) {
      found.push(`${GUARD}: DPW-10 ${name}, line ${line + 1}: ${JQ_STATUS_RULE}`)
    }
    for (const line of jqPipedLines(text)) {
      found.push(`${GUARD}: DPW-10 ${name}, line ${line + 1}: ${JQ_PIPED_RULE}`)
    }
    for (const line of jqUnreadLines(text)) {
      found.push(`${GUARD}: DPW-10 ${name}, line ${line + 1}: ${JQ_UNREAD_RULE}`)
    }
    for (const line of fileNameLines(text, name)) {
      found.push(`${GUARD}: DPW-10 ${name}, line ${line + 1}: ${FILE_NAME_RULE}`)
    }
    for (const line of awsNameLines(text, name)) {
      found.push(`${GUARD}: DPW-10 ${name}, line ${line + 1}: ${AWS_NAME_RULE}`)
    }
    for (const line of envGivenLines(text, name)) {
      found.push(`${GUARD}: DPW-10 ${name}, line ${line + 1}: ${ENV_GIVEN_RULE}`)
    }
    for (const line of readerLines(text)) {
      found.push(`${GUARD}: DPW-10 ${name}, line ${line + 1}: ${READER_RULE}`)
    }
    for (const line of verdictLines(text, exiting)) {
      found.push(`${GUARD}: DPW-10 ${name}, line ${line + 1}: ${VERDICT_RULE}`)
    }
    for (const line of canonicalCommandLines(text, functions)) {
      found.push(
        `${GUARD}: DPW-10 ${name}, line ${line + 1}: runs only the commands CANONICAL_COMMANDS names and the canonical texts' functions, each by a plain word, and hands them no environment of its own: export only on its listed lines, no flag to local or export, set only as -euo pipefail, no assignment before a command but IFS's before read, no wrapper and no variable that chooses what runs or that a rule holds to its one line`,
      )
    }
  }
  return found
}

// How a canonical text ends a step or a function (round 12's fourth iteration): exit and return only with a
// literal status, and a bare return only straight after ||, where it returns the failing command's status; and no
// subshell opened where a command starts. A refusal written echo "…" | mask, then a bare exit, ended its step with
// mask's status, 0, and PROBE's last call wrapped in ( … ) || echo "…" turned the probe's exit 1 into a step that
// passed: the glue's table holds exit to one argument and each check's call to stand alone, while a canonical
// text's own exits and subshells were held by nothing. Nor does a substitution ($( … ), <( … ) or >( … )) hold an
// exit or a call of a canonical function that exits, itself or through another (round 12's third iteration, its
// second pass): there the exit ends the substitution's subshell alone (bash clears errexit in it), so
// : "$([ … ] || aws_refuse "…")" went on with :'s status, 0, past AWS_CHECK's refusal, and TASKS_OUTPUTS' shape
// check in : "$( … )" handed aws a cluster of any shape. No committed text writes any of them.
const VERDICT_RULE =
  'exits or returns only with a literal status (a bare return only after ||, which returns the failing command’s), opens no subshell where a command starts and refuses inside no substitution (no exit, and no call of a function that exits, in a $( … ), <( … ) or >( … )), so no refusal ends its step with status 0 or a subshell alone'
const SUBSHELL = /(?:^|[;&|!{]|(?<![\w-])(?:then|do|else|elif|if|while|until))[ \t]*\((?!\()/gm
const EXIT_WORD = /(?<![\w$-])exit(?![\w-])/
const callsAny = (code: string, names: ReadonlySet<string>) =>
  [...names].some(name =>
    new RegExp(String.raw`(?<![\w$.-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\w-])`).test(code),
  )
// The canonical functions whose body (read on the command code, from its { to the } that closes it) exits, or calls
// one that does. A } closes a group only where a command starts (a line's start, or after ;, & or |, and blanks),
// and an escaped character or a ${ … } is stepped over whole (round 12's fourth iteration, its second pass): a
// plain count closed the body at : ${step:-\}} or : }, so an exit after it was read as outside the function and
// its call in a substitution passed. bash refuses a } at such a place inside a group but as its close (a case
// pattern there is a syntax error), and a } it reads as a close after fi, done, esac, ) or ]], which this reads
// as no close, only lengthens the body, so more is read as exiting, never less.
export function exitingFunctions(texts: readonly string[]): ReadonlySet<string> {
  const bodies = new Map<string, string>()
  for (const text of texts) {
    const code = commandCode(shellViews(text).code)
    for (const match of code.matchAll(DEFINITION)) {
      const name = match[1] ?? match[2] ?? ''
      const open = code.indexOf('{', match.index + match[0].length)
      if (open < 0) continue
      let depth = 0
      let end = open
      for (; end < code.length; end++) {
        if (code[end] === '\\') {
          end++
          continue
        }
        if (code.startsWith('${', end)) {
          let inner = 1
          for (end += 2; end < code.length && inner > 0; end++) {
            if (code[end] === '\\') end++
            else if (code.startsWith('${', end)) {
              inner++
              end++
            } else if (code[end] === '}') inner--
          }
          end--
          continue
        }
        if (code[end] === '{') depth++
        else if (
          code[end] === '}' &&
          /(?:^|[;&|])[ \t]*$/.test(code.slice(code.lastIndexOf('\n', end - 1) + 1, end)) &&
          --depth === 0
        )
          break
      }
      bodies.set(name, `${bodies.get(name) ?? ''}\n${code.slice(open, end + 1)}`)
    }
  }
  const exiting = new Set<string>()
  for (let grew = true; grew; ) {
    grew = false
    for (const [name, body] of bodies) {
      if (!exiting.has(name) && (EXIT_WORD.test(body) || callsAny(body, exiting))) {
        exiting.add(name)
        grew = true
      }
    }
  }
  return exiting
}
// Each $( … ), <( … ) and >( … ) of the command code (never arithmetic's $(( ), nested ones too: its start and
// what it runs.
function substitutionSpans(code: string): Array<{ at: number; inner: string }> {
  const spans: Array<{ at: number; inner: string }> = []
  for (let i = 0; i < code.length; i++) {
    if (!'$<>'.includes(code[i] ?? '') || code[i + 1] !== '(' || (code[i] === '$' && code[i + 2] === '(')) continue
    let depth = 0
    let end = i + 1
    for (; end < code.length; end++) {
      if (code[end] === '(') depth++
      else if (code[end] === ')' && --depth === 0) break
    }
    spans.push({ at: i, inner: code.slice(i + 2, end) })
  }
  return spans
}
export function verdictLines(text: string, exiting: ReadonlySet<string> = exitingFunctions([text])): number[] {
  const code = commandCode(shellViews(text).code)
  const lineOf = (at: number) => code.slice(0, at).split('\n').length - 1
  const lines = new Set<number>()
  for (const match of code.matchAll(/(?<![\w$-])(exit|return)(?![\w-])/g)) {
    const after = code.slice(match.index + match[0].length)
    const numbered = /^[ \t]+[0-9]+(?=[ \t]*(?:[;)}&|\n]|$))/.test(after)
    const passed =
      match[1] === 'return' && /\|\|[ \t]*$/.test(code.slice(0, match.index)) && /^[ \t]*(?:[;)}\n]|$)/.test(after)
    if (!numbered && !passed) lines.add(lineOf(match.index))
  }
  for (const match of code.matchAll(SUBSHELL)) lines.add(lineOf(match.index))
  for (const span of substitutionSpans(code)) {
    if (EXIT_WORD.test(span.inner) || callsAny(span.inner, exiting)) lines.add(lineOf(span.at))
  }
  return [...lines].sort((a, b) => a - b)
}

// --- Reading a run's own lines through a table (DPW-07, DPW-10, DPW-13) ------------------------------------

// The shell a run of deploy.yml may hold outside its canonical texts, entry by entry, each with what bash
// 5.2 does with it. readShell() reads a run's own lines (every line outside a canonical text standing
// whole) by this table alone, and refuses the first thing it doesn't name: a character, a quoting form, an
// expansion, a substitution, an operator, a redirection, a keyword, a test, a pattern, a function or an
// assignment of another shape. The canonical texts are fixed here, read by shellViews() and
// shellCommands(), and evaluate only what each sets itself in every form outsideEvaluations() reads. The table
// is a second layer behind the owner's read of a changed run, since every run is pinned whole (the header's last
// paragraph): it refuses every form it doesn't name, and a form it names that bash reads otherwise is a gap in it.
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
    // "${NAME[@]}": each element as a word of its own, the whole double-quoted word, handed to aws alone, through
    // run or get, as a list option's values (glueIsHeld()), and never to [ or jq, which would read an element as a
    // flag, an operator or a program.
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
  // local, for or mapfile names one, and no expansion reads one, since bash sets several itself from what ran
  // before, which no reader follows: $_ above all, the last word of the command before, which after
  // STOP_COMMANDS's echo is ::stop-commands:: and the stop token (the ninth review's third attack), and
  // BASH_COMMAND, BASH_REMATCH, REPLY and MAPFILE beside it.
  bashVariables:
    /^(?:_|BASH\w*|COMP_\w+|LC_\w+|HIST\w*|READLINE_\w+|PS[0-4]|MAIL\w*|LD_\w+|IFS|PATH|HOME|ENV|CDPATH|SHELLOPTS|POSIXLY_CORRECT|GLOBIGNORE|GLOBSORT|EXECIGNORE|FIGNORE|FUNCNEST|PROMPT_COMMAND|PROMPT_DIRTRIM|TMPDIR|TIMEFORMAT|TMOUT|LANG|LANGUAGE|SECONDS|RANDOM|SRANDOM|LINENO|OPTIND|OPTARG|OPTERR|REPLY|MAPFILE|PIPESTATUS|FUNCNAME|DIRSTACK|GROUPS|EUID|UID|PPID|PWD|OLDPWD|SHELL|SHLVL|HOSTNAME|HOSTTYPE|MACHTYPE|OSTYPE|IGNOREEOF|INPUTRC|INSIDE_EMACS|EMACS|COLUMNS|LINES|CHILD_MAX|COPROC|EPOCHREALTIME|EPOCHSECONDS|HOSTFILE|FCEDIT|BASHOPTS)$/,
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
    // (never -v, which evaluates a subscript): each operand one word as bash hands it, never "${NAME[@]}",
    // whose elements [ would read as words of their own, -v and a name among them (the ninth review's second
    // attack).
    '[': (args: readonly ShellWord[]) =>
      args.length === 4 &&
      ['=', '!=', '-gt'].includes(args[1]?.raw ?? '') &&
      args[3]?.raw === ']' &&
      [args[0], args[2]].every(arg => arg !== undefined && !manyWords(arg) && (arg.quoted || !arg.raw.startsWith('-'))),
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
// Whether bash hands a word on as several: "${NAME[@]}", the one such form the table reads, and only whole.
function manyWords(word: ShellWord): boolean {
  return /^"\$\{[A-Za-z_]\w*\[@\]\}"$/.test(word.raw)
}

// A command a run's own lines run, as the table reads it: its line in the run, its name (the command's word,
// or if, for, case, { or [[ for a compound one; none for assignments alone), the assignments before it, its
// words and redirections, whether it is the first command of a substitution, its place in its pipeline, and
// whether it stands alone: in a pipeline of itself, not negated, the whole of its and-or list and in no
// if's or elif's condition, nor inside a compound command that is any of these, so its failure ends the
// step under set -e and an exit in it ends the step.
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
  alone: boolean
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
    const start = this.commands.length
    this.pipeline()
    for (;;) {
      this.blanks()
      if (this.starts('&&') || this.starts('||')) {
        this.i += 2
        this.linebreak()
        this.pipeline()
        this.together(start)
        continue
      }
      return
    }
  }

  private pipeline(): void {
    const start = this.commands.length
    this.blanks()
    const negated = this.peek() === '!' && SHELL_TABLE.blank.test(this.peek(1))
    if (negated) {
      this.i++
      this.blanks()
    }
    let previous: string | undefined
    let last: GlueCommand | undefined
    let count = 0
    for (;;) {
      previous = this.command(previous)
      count++
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
      if (negated || count > 1) this.together(start)
      return
    }
  }

  // The commands read since a point no longer stand alone: they are in a pipeline, a negation, an and-or
  // list or a condition, or inside a compound command that is.
  private together(from: number): void {
    for (const command of this.commands.slice(from)) command.alone = false
  }

  private emit(command: Omit<GlueCommand, 'raw' | 'alone'>, from: number): void {
    this.commands.push({ ...command, raw: this.s.slice(from, this.i).trim(), alone: true })
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
      const condition = this.commands.length
      this.expect(this.list(['then']), 'then')
      this.together(condition)
      let end = this.list(['elif', 'else', 'fi'])
      while (end === 'elif') {
        this.i += 4
        const next = this.commands.length
        this.expect(this.list(['then']), 'then')
        this.together(next)
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
    // bash takes a redirection before a command's word as that command's (2>/dev/null set runs set), where the
    // word below would read its descriptor as the command, so the table reads a redirection only after the word.
    if (/^[0-9]*[<>]/.test(this.rest())) this.refuse("a redirection before a command's word")
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

  // An array's literal or double-quoted words, NAME=( … ), on one line, with every name its elements expand
  // (round 12's second iteration): dropped, an element's names were never read by EXPANDS_ITS_OWN, so
  // SEEN=("$ACTIONS_ID_TOKEN_REQUEST_TOKEN") made the token a name of the run's own, which a later line may
  // print in pieces.
  private array(): ShellWord {
    const start = this.i
    const expands: string[] = []
    this.i++
    for (;;) {
      this.blanks()
      if (this.peek() === ')') break
      expands.push(...this.word('element').expands)
    }
    this.i++
    return { raw: this.s.slice(start, this.i), value: undefined, quoted: true, expands }
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
      const name = /[A-Za-z_][A-Za-z0-9_]*|[1-9?]/.exec(found)?.[0] ?? ''
      if (SHELL_TABLE.bashVariables.test(name)) this.refuse("an expansion of one of bash's own variables")
      this.i += found.length
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
  'is written in the shell the guard reads: outside a canonical text standing whole, only what SHELL_TABLE names (blanks that are a space or a tab, its word characters, single and double quotes, its expansions of names bash neither sets nor reads for itself, substitutions, operators, redirections after a command’s word, keywords, tests, case patterns, functions and assignments, its builtins as it holds them, a comment only at a line’s start or after a blank), each stretch closing all it opens'

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
// included, in any case, and no double-quoted scalar holding a backslash on any YAML line (a key, a value,
// a sequence item or a flow sequence's item, after a node property too), since an escape (id\x2Dtoken,
// pull_request\x5F…) could spell a word a rule looks for unseen. A double-quoted scalar is the only one
// whose escapes YAML reads: a backslash in a plain scalar (run: grep -E "^v[0-9]+\." .nvmrc), a
// single-quoted one or a comment is the same text to GitHub as to the guard, so it passes (escapedLine).
const ID_TOKEN = /id-token|write-all/i
const ESCAPE = /"(?:[^"\\\n]|\\.)*\\/
// A double-quoted scalar left open on a line (escapedLine's column) runs on to the next double quote, over
// lines yamlLines may take for comments: a backslash before that quote is an escape YAML reads.
function escaped(text: string): boolean {
  const starts: number[] = []
  let offset = 0
  for (const line of text.split('\n')) {
    starts.push(offset)
    offset += line.length + 1
  }
  return yamlLines(text).some(({ index, text: line }) => {
    const found = escapedLine(line)
    if (typeof found === 'boolean') return found
    const rest = text.slice((starts[index] ?? 0) + found + 1)
    const backslash = rest.indexOf('\\')
    const close = rest.indexOf('"')
    return backslash >= 0 && (close < 0 || backslash < close)
  })
}

// Whether a YAML line holds a double-quoted scalar with a backslash, the line read as YAML starts its nodes:
// at its start; after an indicator that a blank or the line's end follows (a sequence's -, a complex key's
// ?, a value's :, a document marker); after a node property (an anchor, a tag or an alias); and after the
// key's : that ends a plain or quoted key. A plain scalar runs to that : or to a blank and #, which starts
// a comment, as YAML reads one in a block. A double-quoted scalar not closed on its line answers the column
// of its opening quote, for escaped to read on to its close (shapeProblems refuses it too). In a flow
// collection, or wherever a character stands that YAML takes in no node's place there, any double quote
// with a backslash after it on the rest of the line counts, as it did for the whole line before (ESCAPE),
// so what this reading can't place is refused, never passed.
function escapedLine(line: string): boolean | number {
  let rest = line
  for (;;) {
    rest = rest.replace(/^[ \t]+/, '')
    if (rest === '' || rest.startsWith('#')) return false
    const indicator = /^(?:[-?:]|---|\.\.\.)(?=[ \t]|$)|^[&!*]\S*/.exec(rest)
    if (indicator) {
      rest = rest.slice(indicator[0].length)
      continue
    }
    if (rest.startsWith('"') || rest.startsWith("'")) {
      if (/^"[^"]*\\/.test(rest)) return true
      const quoted = rest.startsWith('"') ? /^"[^"]*"/.exec(rest) : /^'(?:[^']|'')*'/.exec(rest)
      // A double-quoted scalar not closed here goes on over the next lines, which escaped reads on to its
      // close; a single-quoted one reads no escape on any of them.
      if (!quoted) return rest.startsWith('"') ? line.length - rest.length : false
      rest = rest.slice(quoted[0].length).replace(/^[ \t]+/, '')
      if (rest === '' || rest.startsWith('#')) return false
      if (/^:(?:[ \t]|$)/.test(rest)) {
        rest = rest.slice(1)
        continue
      }
      return ESCAPE.test(rest)
    }
    // A block scalar's header, with no more than a comment after it: its content isn't a YAML line.
    if (/^[|>][1-9+-]*(?:[ \t]+#.*)?[ \t]*$/.test(rest)) return false
    if (/^[|>[\]{},%@`]/.test(rest)) return ESCAPE.test(rest)
    // A plain scalar: to the : and blank that end a key, or the blank and # that start a comment.
    const plain = /^.*?(?=:(?:[ \t]|$)|[ \t]#|$)/.exec(rest)?.[0] ?? rest
    rest = rest.slice(plain.length)
    if (!rest.startsWith(':')) return false
    rest = rest.slice(1)
  }
}

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
// aside), with no ${{ or }} inside it. Blanks after it are no part of it: YAML ends a plain scalar at its
// last character that isn't a blank, so GitHub reads the expression alone, as the guard does.
const IF_LINE = /^\s*(?:-\s+)?if: \$\{\{(?:(?!\}\}|\$\{\{).)*\}\}(?:[ \t]+#.*)?[ \t]*$/

const describePermissions = (record: Readonly<Record<string, string>>) =>
  Object.entries(record)
    .map(([scope, level]) => `${scope}: ${level}`)
    .join(', ')

// A character the guard would read otherwise than GitHub's YAML reader or bash (DPW-02): a tab, which YAML
// never reads as indentation, while workflow.ts read one as a column (a key indented with spaces and then a
// tab sat at its level for the shape check and at none for the job and step readers, which match spaces
// alone, so an env: and its BASH_ENV under it reached no rule) and YAML readers differ on (some refuse it,
// some skip it); a carriage return, which YAML reads as a line break (workflow.ts splits only at a newline,
// so what follows one, in a comment or a run, would be a step, a key or a command no rule reads); NEL, LS
// and PS, which YAML 1.1 readers break lines at too; any other control or format character (a vertical
// tab, a form feed, DEL, U+FEFF, the bidirectional ones); and any blank but a space (a no-break space,
// U+2003), which JavaScript reads as white space and bash as part of a word, so a # after one is no
// comment. A run that needs a tab writes $'\t', as the canonical texts do. The first such character a
// workflow holds, by its line and code point, never the text.
const UNREAD_CHARACTER = /(?!\n)[\p{C}\p{Zl}\p{Zp}]|(?! )\p{Zs}/u
const CHARACTERS =
  'a workflow holds only newlines and printable text: no tab, carriage return, NEL, line or paragraph separator, other control or format character, or blank but a space'
function unreadCharacter(text: string): string | undefined {
  const match = UNREAD_CHARACTER.exec(text)
  if (match === null) return undefined
  const line = text.slice(0, match.index).split('\n').length
  const point = (match[0].codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')
  return `line ${line} holds U+${point}`
}

// DPW-02 (C11-D55): deploy.yml's top-level permissions are contents: read alone; each job's are exactly
// its own, an id-token in the five environment jobs alone and nowhere else in the file; no write-all,
// read-all or {}; every environment: a literal name; the file is block mappings (no flow mapping, quoted
// key, or anchor or alias but a step's shared run, which workflow.ts can't read), its block scalars literal
// (literalProblems) and only a run: (blockScalarProblems, since GitHub keeps a block scalar's last line break
// in any other value), every if: a plain ${{ … }} with nothing beside it (IF_LINE), and it spells nothing with
// an escape. Every workflow is in the shape workflow.ts reads (shapeProblems: no anchor, alias, tag, merge key
// or flow mapping but {}, and no anchor or alias but a step's shared run), so none is read wrong in a shape it
// names, and holds only newlines and printable text, no tab (unreadCharacter). Every other workflow holds the
// id-token clause, spells nothing with an escape, names no environment, gives no block scalar an indentation
// indicator (indicatorProblems), and has each job that calls a reusable workflow call another of this
// repository's at this commit (CALLED_WORKFLOW), never deploy.yml, handing it no secret. Every workflow is on
// the owner's-read list, so these holds are a second layer behind the owner's read of a changed line (the
// header's last paragraph). ownRepository is this repository's owner/name, which the tests read from GitHub's
// GITHUB_REPOSITORY in CI, or else the origin remote, since a step naming this repository's own action by its
// full name runs a folder no rule reads.
// DPW-02, the size (round 11): GitHub starts no run of a workflow file over 500 KB ("A workflow file larger
// than 500 KB will not start runs", its Actions limits), so every workflow is held to 500,000 bytes as
// written, the stricter reading of 500 KB. deploy.yml is over it as committed, its canonical texts pasted into
// every run that runs them (ASSET_CHECK into nine), so no push to main and no dispatch starts it until it is
// brought under the limit, a change to its structure that is the owner's to choose (TECH-SPEC T24 item 20);
// until then the tests hold every other workflow to the limit and name deploy.yml's as the one finding.
export const WORKFLOW_BYTES = 500_000
export function workflowSizeFindings(workflows: Texts): Finding[] {
  return [...workflows]
    .filter(([, text]) => Buffer.byteLength(text, 'utf8') > WORKFLOW_BYTES)
    .map(([path]) =>
      at(
        path,
        'DPW-02',
        `is at most ${WORKFLOW_BYTES} bytes, since GitHub starts no run of a workflow file over 500 KB`,
      ),
    )
}
// DPW-02, what the rules read (round 12): GitHub reads a workflow's blob as git holds it, while every rule here
// reads the working tree, which a checkout writes through the path's git attributes: a working-tree-encoding
// re-encodes it (a NEL, which GitHub's YAML reader breaks a line at and the character rule refuses, written as
// one byte Node reads as U+FFFD, so the lines GitHub read after it stayed inside a comment for every rule: a job
// naming prod-plan's environment among them), and eol, text, ident and filter rewrite it. The owner reads every
// file's blob too, while CI's checks, Node and the deploy jobs run and read the checkout: an ident attribute on
// infra/package.json checked out a lower CDK CLI than its blob pinned, which CLI_FETCH fetched, and one on
// check-action-pins.ts made a comparison its blob held into one that never did (round 12's third iteration).
// So no tracked file carries a git attribute, as git check-attr --all reads it from the working tree's
// .gitattributes, $GIT_DIR/info/attributes and core.attributesFile, and as --cached reads it from the index's
// .gitattributes, which a checkout reads first (gitAttributes() asks both: a .gitattributes that gave itself a
// working-tree-encoding checked out as text git can't parse, so the working tree's reading named no attribute
// while the checkout had re-encoded a workflow through the index's). This is the second layer: the CLI pin's step
// refuses, in its own shell before anything else, a checkout whose regular files aren't HEAD's blobs
// (CLI_PIN_DRIFT), and both pins checks run on the blobs (BLOB_RESET).
export function gitAttributeFindings(attributes: ReadonlyMap<string, readonly string[]>): Finding[] {
  return [...attributes]
    .filter(([, set]) => set.length > 0)
    .map(([path]) =>
      at(
        path,
        'DPW-02',
        'carries no git attribute, so a checkout writes its blob, which the owner reads and GitHub runs a workflow from, and CI, the deploy jobs and these rules read the same bytes (an ident, eol, text, filter or working-tree-encoding would write others)',
      ),
    )
}
// DPW-02, the shared runs (round 13): deploy.yml holds each run several steps run whole once, anchored on the
// first step that runs it (run: &name |) and aliased by each later one (run: *name), which GitHub reads as the
// anchored text, as workflow.ts's runAnchors() and expandRunAliases() do: a name RUN_ANCHORS names over that
// entry's text, of at least ALIAS_MIN_BYTES, defined once and before its aliases (shapeProblems() refuses a second
// anchor of a name and an alias before its anchor or of none), aliased at least once, and each anchor and alias
// under the comment sharedRunComment() writes for it, with no such comment anywhere else, so none goes stale or
// names a step that doesn't share the text. No other workflow holds an anchor or alias of a step's run, and
// every other anchor, alias, tag or merge key is a shapeProblems() line in every workflow (and in deploy.yml the
// block-mapping rule's too). The expansion is itself in workflow.ts's shape whenever the file as stored is (the
// shape rule asks that of every file), with no anchor, alias or shared-run comment left and every shared run a
// literal block scalar, so every rule reads a file it would read written out.
// The rules that read lines by job read the expansion (jobSpans() takes only it), every other rule reads jobs
// and steps through workflowJobs(), which expands, and the file-shape rules (characters, blank ends, shape,
// literal, block scalar, indicator, escapes, if: lines, top keys, triggers, forbidden words, the size and these)
// read the file as stored: an alias adds no text, its anchor holding every word it runs.
const BLOCK_MAPPINGS =
  "is written in block mappings: no flow mapping or quoted key, and no anchor, alias or merge key but a step's shared run (run: &name | and run: *name)"
const SHARED_RUNS = `shares a step's run only as RUN_ANCHORS names it: each anchor a RUN_ANCHORS name holding that entry's text, of at least ${ALIAS_MIN_BYTES} bytes, aliased by a later step at least once, and each anchor and alias under the comment sharedRunComment() writes for it, with no such comment elsewhere`
const NO_SHARED_RUNS = "writes no anchor or alias: only deploy.yml shares a step's run so"
const EXPANDED_SHAPE =
  'reads, with every shared run written out, in the shape workflow.ts reads: no anchor, alias or shared-run comment left, and every shared run a literal block scalar (run: |)'
// A comment line that reads as a shared run's, wherever it stands.
const SHARED_RUN_COMMENT = /^\s*#\s*shared run\b/i
// Whether deploy.yml's shared runs are as RUN_ANCHORS (or the table given) names them, with their comments.
export function sharedRunsHold(
  text: string,
  table: Readonly<Record<string, SharedRun>> = RUN_ANCHORS(),
  shared: RunAnchors = runAnchors(text),
): boolean {
  const lines = text.split('\n')
  const commentOf = new Map(shared.comments.map(comment => [comment.of, comment.lines]))
  const anchorAt = new Map(shared.anchors.map(anchor => [anchor.line, anchor]))
  const commented = (line: number, want: readonly string[]) =>
    (commentOf.get(line) ?? []).map(each => lines[each] ?? '').join('\n') === want.join('\n')
  const anchorsHold = shared.anchors.every(anchor => {
    const entry = Object.hasOwn(table, anchor.name) ? table[anchor.name] : undefined
    const aliases = shared.aliases.filter(alias => alias.anchor === anchor.line)
    return (
      entry !== undefined &&
      anchor.text === entry.text &&
      Buffer.byteLength(anchor.text, 'utf8') >= ALIAS_MIN_BYTES &&
      aliases.length > 0 &&
      commented(anchor.line, sharedRunComment('anchor', anchor.name, aliases, entry.reads))
    )
  })
  const aliasesHold = shared.aliases.every(alias => {
    const anchor = alias.anchor === undefined ? undefined : anchorAt.get(alias.anchor)
    const reads = Object.hasOwn(table, alias.name) ? table[alias.name]?.reads : undefined
    return anchor !== undefined && commented(alias.line, sharedRunComment('alias', alias.name, [anchor], reads))
  })
  const held = new Set(shared.comments.flatMap(comment => comment.lines))
  const stray = commentLines(text).some(each => !held.has(each) && SHARED_RUN_COMMENT.test(lines[each] ?? ''))
  return anchorsHold && aliasesHold && !stray
}
// The expansion's shape is asked only of a file in the shape as stored, which the shape rule asks of every file:
// so a file that shares no run, its own expansion, is never refused twice, and a file refused for its shape is
// refused alike whichever layout its shared runs are in.
function expandedShapeHolds(text: string, shared: RunAnchors, shape: readonly number[]): boolean {
  if (shared.anchors.length + shared.aliases.length === 0) return true
  const written = expandRunAliases(text)
  const left = runAnchors(written)
  const shapeLost = shape.length === 0 && shapeProblems(written).length > 0
  if (shapeLost || left.anchors.length + left.aliases.length + left.comments.length > 0) return false
  const jobs = jobsOf(written)
  return [...shared.anchors, ...shared.aliases].every(place => {
    const step = jobs.get(place.job)?.steps[place.index]
    return step !== undefined && literalRun(step)
  })
}
export function permissionFindings(workflows: Texts, ownRepository = ''): Finding[] {
  const found: Finding[] = []
  const deploy = workflows.get(DEPLOY) ?? ''
  const top = permissionsOf(workflowTop(deploy).get('permissions'))
  if (!(top instanceof Map) || !sameMap(top, READ)) {
    found.push(at(DEPLOY, 'DPW-02', 'the top-level permissions are contents: read alone'))
  }
  for (const { id, job } of jobsOf(deploy).values()) {
    const want = (JOB_PERMISSIONS as Readonly<Record<string, Readonly<Record<string, string>>>>)[id]
    const have = jobPermissions(job)
    if (want === undefined) found.push(at(DEPLOY, 'DPW-02', `${id}: is none of the seventeen jobs`))
    else if (!(have instanceof Map) || !sameMap(have, want)) {
      found.push(at(DEPLOY, 'DPW-02', `${id}: its permissions are exactly ${describePermissions(want)}`))
    }
    const environment = jobEnvironment(job)
    if (environment !== undefined && typeof environment !== 'string') {
      found.push(at(DEPLOY, 'DPW-02', `${id}: names its environment by a literal name`))
    }
  }
  // Read with every shared run written out, so a run an alias shares counts in every job that runs it.
  const written = expandRunAliases(deploy)
  const lines = written.split('\n')
  const spans = jobSpans(written)
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
  // A step's shared run, in the two forms runAnchors() reads, is the one anchor and alias the file may hold.
  const shared = runAnchors(deploy)
  const forms = new Set([...shared.anchors, ...shared.aliases].map(each => each.line))
  const yaml = yamlLines(deploy)
    .filter(line => !forms.has(line.index))
    .map(line => line.text)
  if (
    yaml.some(
      line =>
        /:\s*\{(?!\{)/.test(line.replace(/\$\{\{.*?\}\}/g, '')) ||
        /^\s*-\s*\{/.test(line) ||
        /(?:^|:\s+|-\s+)[&*][\w-]/.test(line) ||
        /^\s*(?:-\s+)?(?:["']|<<\s*:)/.test(line),
    )
  ) {
    found.push(at(DEPLOY, 'DPW-02', BLOCK_MAPPINGS))
  }
  // Each workflow's shape problems, read once.
  const shapes = new Map([...workflows].map(([path, text]) => [path, shapeProblems(text)]))
  if (!sharedRunsHold(deploy, RUN_ANCHORS(), shared)) found.push(at(DEPLOY, 'DPW-02', SHARED_RUNS))
  if (!expandedShapeHolds(deploy, shared, shapes.get(DEPLOY) ?? [])) found.push(at(DEPLOY, 'DPW-02', EXPANDED_SHAPE))
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
  // Every workflow holds only newlines and printable text, read before anything else, so nothing after a
  // line break workflow.ts doesn't split at, a blank bash doesn't, or a tab YAML doesn't indent with, passes
  // unread.
  for (const [path, text] of workflows) {
    const odd = unreadCharacter(text)
    if (odd !== undefined) found.push(at(path, 'DPW-02', `${odd}, but ${CHARACTERS}`))
  }
  // Every workflow is in the shape workflow.ts reads, so no step, key or value is read wrong or passes
  // unread (a step's keys at another indent, a run continued on the next line, a key given twice).
  for (const [path] of workflows) {
    if ((shapes.get(path) ?? []).length > 0) found.push(at(path, 'DPW-02', SHAPE))
  }
  for (const [path, text] of workflows) {
    if (path === DEPLOY) continue
    const shared = runAnchors(text)
    if (shared.anchors.length + shared.aliases.length > 0) found.push(at(path, 'DPW-02', NO_SHARED_RUNS))
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
    // Every step is an ordinary one, of the keys workflow.ts reads a step by (the seventh review's second
    // attack): a step group (parallel:, whose steps GitHub runs as background steps) holds steps the reader
    // reads as one step with no uses:, so a checkout in one was never held to DPW-11, and a background,
    // wait, wait-all or cancel step is one no rule here reads either.
    for (const job of workflowJobs(text)) {
      parsedSteps(job).forEach((step, index) => {
        if (!step.keyNames.every(key => ORDINARY_STEP_KEYS.includes(key))) {
          found.push(at(path, 'DPW-02', `${job.id} (${label(step, index)}): ${ORDINARY_STEP}`))
        }
      })
    }
  }
  // In every workflow (round 11): a step's action is another repository's, owner/repo[/path]@ref, never one of
  // this repository's (./, .\ or $/, or this repository by its full name, whose action.yml no rule here reads and
  // no owner's read covers, so its own checkout could keep the job's token for every later step) or a docker://
  // image; and no line ends in a blank, which workflow.ts reads as gone from a block scalar's line of blanks while
  // YAML keeps it.
  for (const [path, text] of workflows) {
    for (const job of workflowJobs(text)) {
      parsedSteps(job).forEach((step, index) => {
        if (step.uses !== undefined && !isRemoteAction(step.uses, ownRepository)) {
          found.push(at(path, 'DPW-02', `${job.id} (${label(step, index)}): ${REMOTE_ACTION_RULE}`))
        }
      })
    }
    if (text.split('\n').some(line => /[ \t]$/.test(line))) found.push(at(path, 'DPW-02', 'ends no line in a blank'))
  }
  return found
}
// A step's action as GitHub reads one of another repository (owner/repo, a path in it, then @ and a ref), so never
// a path in this repository (./, .\ or $/, read from the job's checkout or this commit) or a docker:// image. The
// runner splits the part before the @ at / and at \, drops only empty segments and joins the rest to the folder
// it fetched the repository's ref into, keeping . and .. (round 11): actions/setup-node/../../checkout/v5@v5 ran
// the job's checkout action, and a deeper climb the job's own workspace, under another repository's name. So the
// name and its path are segments of letters, digits, ., _ and -, split at / alone, none . or .., with no \
// anywhere; no path segment is .github, where a repository keeps its own actions; and the repository isn't this
// one (ownRepository, in any letter case), whose actions are its own folders, which no rule reads.
const REMOTE_ACTION =
  /^[A-Za-z0-9][A-Za-z0-9-]*\/(?!\.\.?(?:\/|@))[A-Za-z0-9._-]+(?:\/(?!\.\.?(?:\/|@))[A-Za-z0-9._-]+)*@[^@\s\\]+$/
function isRemoteAction(uses: string, ownRepository: string): boolean {
  if (!REMOTE_ACTION.test(uses)) return false
  const segments = (uses.split('@')[0] ?? '').split('/')
  if (segments.slice(2).some(segment => segment.toLowerCase() === '.github')) return false
  return ownRepository === '' || segments.slice(0, 2).join('/').toLowerCase() !== ownRepository.toLowerCase()
}
const REMOTE_ACTION_RULE =
  "uses another repository's action, owner/repo@ref, never one of this repository's (./, .\\ or $/, or this repository by its name), whose action.yml no rule reads, an action in a repository's .github folder or a path that climbs out of its own (. or ..) or splits at \\, or a docker:// image"
// The keys of an ordinary step, every one GitHub reads beside the step kinds (parallel, background, wait,
// wait-all, cancel), which workflow.ts doesn't read.
const ORDINARY_STEP_KEYS = [
  'name',
  'id',
  'if',
  'uses',
  'with',
  'env',
  'run',
  'shell',
  'working-directory',
  'continue-on-error',
  'timeout-minutes',
]
const ORDINARY_STEP =
  'is an ordinary step, of the keys workflow.ts reads (no parallel group, background, wait, wait-all or cancel step, whose steps or kind no rule reads)'

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
// version comment ACTION_PINS names for it (scripts/guards/action-pins.ts), which CI proves against the
// action's own repository (scripts/check-action-pins.ts), so no commit pushed only to a fork,
// which GitHub resolves under the action's name, and no older release's commit under a newer comment, runs
// in a job that holds the OIDC request token; no local action, docker:// image or reusable workflow. And
// .github/workflows holds workflows alone (WORKFLOW_FILE), so no actions lockfile, which could name a commit
// for an action the guard never reads, stands beside them. The check that proves the pins runs where nothing
// of the repository's ran first (pinsJobHolds): ci.yml's job action-pins, on GitHub's own runner, is
// checkout without credentials, Node from .nvmrc with no cache and the check, and check needs it, so no
// test, install script or build that runs in check can leave a git configuration (a url.<base>.insteadOf
// that sends the read to a fork), a file or a variable behind for the check to read, or change the check.
// And .nvmrc, which chooses that job's Node and every deploy.yml job's, is 24 alone (NVMRC): setup-node
// reads a JSON .nvmrc as a manifest, and its versions read one apart (7.1 takes devEngines.runtime, which 5
// doesn't know, before engines.node), so a .nvmrc no rule held could give the pins job, and every deploy
// job, a Node older than 24.2, which has no import.meta.main: the check, history.ts and smoke.ts would then
// run nothing and exit 0, the pins unproved and a broken release's smoke passed, while check, on 5, still
// ran a Node new enough to pass.
export function actionPinFindings(workflows: Texts, folder?: readonly string[], nvmrc?: string): Finding[] {
  const text = expandRunAliases(workflows.get(DEPLOY) ?? '')
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
          '.github/workflows holds workflows alone (<name>.yml or <name>.yaml, with no @ in the name): no actions lockfile or other file beside them',
        ),
      )
    }
    if (SHADOW_FILE.test(path)) found.add(at(SCRIPTS, 'DPW-04', SHADOW_RULE))
    if (YARN_FILE.test(path)) found.add(at(path, 'DPW-04', YARN_RULE))
  }
  if (!pinsJobHolds(workflows.get(CI) ?? '')) found.add(at(CI, 'DPW-04', PINS_JOB_RULE))
  if (!cliPinJobHolds(workflows.get(CI) ?? '')) found.add(at(CI, 'DPW-04', CLI_PIN_JOB_RULE))
  if (!requiredJobsNamed(workflows.get(CI) ?? '')) found.add(at(CI, 'DPW-04', REQUIRED_NAMES_RULE))
  if (!ciOnHolds(workflows.get(CI) ?? '')) found.add(at(CI, 'DPW-04', CI_ON_RULE))
  if (nvmrc !== undefined && nvmrc !== NVMRC) found.add(at(NVMRC_FILE, 'DPW-04', NVMRC_RULE))
  return [...found]
}
// The Node every setup-node of ci.yml and deploy.yml reads (node-version-file: .nvmrc, and synth's release's
// own): the major version alone, which each version of setup-node reads the same way, as a Node 24 (CLAUDE.md:
// Node stays on 24): with check-latest unset, as in every step here, the newest Node 24 in the runner's tool
// cache, or the newest in actions/node-versions' manifest when the cache holds none. GitHub's ubuntu-24.04
// image caches a Node 24 well past 24.2, so no manifest, range or older release chooses an older Node in some
// jobs; the deploy scripts and the pins check refuse one older than 24.2 all the same.
export const NVMRC_FILE = '.nvmrc'
export const NVMRC = '24\n'
const NVMRC_RULE =
  'is 24 alone, a line of its own, which every setup-node reads as a Node 24 (the newest the runner caches, or the newest in the manifest when it caches none), so no manifest, range or release read differently by the two setup-node versions gives the pins check or a deploy job a Node without import.meta.main, on which it would run nothing and exit 0'
// The job that proves the pins: a step before it in its job (a test that wrote url.<fork>.insteadOf to
// $HOME/.gitconfig, say, or wrote the check over, or a GITHUB_PATH that put another git first) would decide
// what it reads. A job runs on a runner of its own, so this one, whose only steps are GitHub's checkout and
// setup-node and the check, runs it before any of the repository's code: the checkout goes into REPO_FOLDER,
// below the workspace where setup-node runs node, npm and yarn with --version, since Yarn 1 runs the program a
// .yarnrc's yarn-path names from the folder it runs in or any above it (a pull request's .yarnrc put a git
// first on the PATH that answered ls-remote with a fork's commit: round 12's fourth iteration), and the
// check's step runs BLOB_RESET first, so node runs the blobs the owner read whatever .gitattributes says,
// which the script's own drift check can't hold for itself. Those two actions run first, so
// the check can't prove them: an action at a commit pushed only to a fork, there, would own the workspace,
// the check itself and the git it calls. So each is held to its commit in PINS_JOB_ACTIONS
// (action-pins.ts), apart from ACTION_PINS, so moving a pin there moves neither, and a change to them is one
// a person proves against the action's own repository (the fifth review's fourth attack). And ci.yml holds only
// name, on, permissions and jobs at its top: a workflow's env: reaches every step of every job (BASH_ENV,
// which bash reads before the check's line, NODE_OPTIONS, which node runs before the check, PATH, which
// chooses its git), and so does its defaults: (a shell, a folder). check, which gates merging on the job
// only by failing first, holds no key of its own but needs, if, runs-on (GitHub's ubuntu-24.04),
// timeout-minutes and steps: a job's env: reaches each of its steps as a workflow's does (a BASH_ENV whose
// command substitution, which bash runs before the step, turns its exit 1 into exit 0, or a SHELLOPTS of
// noexec, under which bash reads the line and runs nothing), and so does its defaults: (a shell that skips
// the line), a container: (another bash) or a self-hosted runner, and continue-on-error: keeps the run
// from failing when check fails, so any of them would let check pass when the pins check failed (the sixth
// review's second attack). These holds are a second layer, not the control: they run in check's own npm
// test, inside the run they guard. In CI they find a key or a step that leaves that test running (and a
// local npm run check finds every one), but a pull request that also stops the test (a SHELLOPTS of noexec
// at ci.yml's top or on check, under which every run step reads its lines, runs none and passes; a shell
// that skips npm test; check's npm test step, the root's test script or vitest.config.ts changed so this
// file doesn't run; an install script or a workspace's typecheck script that check runs first) switches
// them off in its own CI, and at ci.yml's top the pins check and check's exit 1 with them. What holds ci.yml
// is the owner's read of it (CLAUDE.md's list); the test script, vitest.config.ts and the scripts check runs
// first are off that list.
export const PINS_JOB = 'action-pins'
// The working tree reset to its blobs before node runs (round 12's fourth iteration): the checkout writes each
// file through .gitattributes (an ident on check-action-pins.ts itself turned the drift check its main() calls
// into a comment, so the blob the owner read refused and the checkout passed), and this run is read from the
// workflow's blob, which no checkout writes. info/attributes is git's highest-precedence attribute source, so
// every path is read with no conversion; read-tree clears the index's stat data, without which checkout-index
// skips a file whose size and time match it, and checkout-index then writes every file as its blob.
export const BLOB_RESET = `printf '* -text -eol -ident -filter -working-tree-encoding\\n' >.git/info/attributes
git read-tree HEAD
git checkout-index --all --force`
export const PINS_CHECK = 'node scripts/check-action-pins.ts'
// Both held runs are written run: |, a literal block scalar (literalRun(); round 12's fourth iteration, its second
// pass): written run: >-, the pins check's four lines read as PINS_RUN here while YAML folded them into one printf,
// so check-action-pins.ts never ran and the job went green.
export const PINS_RUN = `${BLOB_RESET}\n${PINS_CHECK}`
const NEEDS_FAILED = expr(
  "contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled') || contains(needs.*.result, 'skipped')",
)
const PINS_JOB_RULE = `runs ${PINS_CHECK} in a job of its own, ${PINS_JOB}, on GitHub's runner ubuntu-24.04, whose steps are only checkout without credentials into ${REPO_FOLDER} and setup-node with Node from ${REPO_FOLDER}/.nvmrc and no cache, each at its commit and version comment in PINS_JOB_ACTIONS, and the check, in ${REPO_FOLDER} after BLOB_RESET, in a workflow that holds only name, on, permissions and jobs at its top (no env: or defaults:, which reach every step), so nothing of the repository's and no action the check can't prove runs before it; check needs it, runs under always() on ubuntu-24.04 with no key of its own but needs, if, runs-on, timeout-minutes and steps (no env:, defaults:, container:, services:, strategy: or continue-on-error:, which decide how its steps run or whether its failure counts), and first fails, by that step's if: and exit 1 alone, when a job it needs didn't succeed`
// setup-node's inputs in both jobs: Node from the checkout's folder's .nvmrc, with no cache.
const PINS_NODE_WITH = { 'node-version-file': `${REPO_FOLDER}/.nvmrc`, 'package-manager-cache': 'false' }
// A step that runs the action at its commit in PINS_JOB_ACTIONS, its version comment on its line.
function atJobPin(step: WorkflowStep | undefined, action: string): boolean {
  const pin = PINS_JOB_ACTIONS[action] ?? ''
  const commit = PIN_SHAPE.exec(pin)?.[1]
  return (
    step !== undefined &&
    commit !== undefined &&
    step.uses === `${action}@${commit}` &&
    step.lines.some(line => /^\s*(?:- )?uses: (.*)$/.exec(line)?.[1] === `${action}@${pin}`)
  )
}
function pinsJobHolds(ci: string): boolean {
  const jobs = workflowJobs(ci)
  const pins = jobs.filter(job => job.id === PINS_JOB)
  const check = jobs.find(job => job.id === 'check')
  const job = pins[0]
  if (pins.length !== 1 || job === undefined || check === undefined) return false
  const steps = parsedSteps(job)
  const [checkout, node, run] = steps
  const only = (step: WorkflowStep | undefined, keys: readonly string[]) =>
    step !== undefined && onceEach(step.keyNames, keys)
  const first = parsedSteps(check)[0]
  return (
    onceEach([...workflowTop(ci).keys()], ['name', 'on', 'permissions', 'jobs']) &&
    onceEach(job.keyNames, ['runs-on', 'timeout-minutes', 'steps']) &&
    jobScalar(job, 'runs-on') === 'ubuntu-24.04' &&
    steps.length === 3 &&
    only(checkout, ['name', 'uses', 'with']) &&
    atJobPin(checkout, 'actions/checkout') &&
    sameMap(checkout?.with ?? new Map(), { 'persist-credentials': 'false', path: REPO_FOLDER }) &&
    only(node, ['name', 'uses', 'with']) &&
    atJobPin(node, 'actions/setup-node') &&
    sameMap(node?.with ?? new Map(), PINS_NODE_WITH) &&
    only(run, ['name', 'working-directory', 'run']) &&
    run?.keys.get('working-directory') === REPO_FOLDER &&
    run.run === PINS_RUN &&
    literalRun(run) &&
    onceEach(check.keyNames, ['needs', 'if', 'runs-on', 'timeout-minutes', 'steps']) &&
    jobScalar(check, 'runs-on') === 'ubuntu-24.04' &&
    jobNeeds(check).includes(PINS_JOB) &&
    jobScalar(check, 'if') === 'always()' &&
    only(first, ['if', 'run']) &&
    first?.if === NEEDS_FAILED &&
    first.run === 'exit 1'
  )
}
// The job that holds the CDK CLI's pin to its base branch's (round 12's second iteration): check-cli-pin.ts alone
// keeps the pin from going down, and it ran in migrations after npm ci and the migration order check, both off
// the owner's-read list, either of which could write the working tree's manifest back to the base's (one line
// in the order check did, and a lowered pin passed), move a remote-tracking ref, or put another node or git
// first through GITHUB_PATH; and after setup-node's npm cache, which asks npm for its folder through the pull
// request's own .npmrc and restores into it. So it runs as the pins check does, in a job of its own whose
// steps are only the pins job's checkout (with the whole history, which the base's manifest needs) and
// setup-node with no cache, held to PINS_JOB_ACTIONS, and the check, on a pull request, against the base's
// remote-tracking name, in REPO_FOLDER after BLOB_RESET as the pins job's (a pull request's .yarnrc moved
// origin/main to HEAD, and a lowered pin passed: round 12's fourth iteration), and before that reset after
// CLI_PIN_DRIFT, which refuses a checkout that isn't HEAD's blobs (round 12's third iteration, its second
// pass); check needs it, and on a push
// the step is skipped and the job succeeds, since check
// fails on a skipped need. The script reads HEAD's committed manifest too. This is a second layer, as
// pinsJobHolds is: the owner's read of ci.yml holds it.
export const CLI_PIN_JOB = 'cli-pin'
export const CLI_PIN_CHECK = 'node scripts/check-cli-pin.ts "$BASE"'
// The checkout compared with HEAD's blobs in the step's own shell, before BLOB_RESET (round 12's third iteration,
// its second pass): the deploy jobs read the CLI's pin from main's checkout, which git writes through every
// .gitattributes, so here a drift is itself what the check refuses, and BLOB_RESET, which makes node run the blobs
// the owner read, also wrote away the drift that check-cli-pin.ts's own checkoutDrift() looks for: an ident in
// infra/.gitattributes checked out a lower pin than the manifest's blob held, the job passed, and every deploy job
// fetched the lower CLI. So the run, read from the workflow's blob, which no attribute rewrites, first hashes every
// regular file of HEAD's tree as the working tree holds it, with no filter, and refuses unless each is its blob (a
// symbolic link or a submodule takes no attribute's bytes). GitHub runs a step with no shell: as bash -e on a file,
// with no pipefail, so a git that fails leaves the listing empty, or the comparison unequal, either of which
// refuses, or fails the reset after it; and a path git quotes (a byte at or above 0x80, a control character, a
// double quote or a backslash) hash-object --stdin-paths unquotes, reading a line that starts with a double quote
// C-style, so every regular file is compared by its own bytes, whatever its name.
export const CLI_PIN_DRIFT = `blobs=$(git ls-tree -r HEAD | awk '$1 == "100644" || $1 == "100755"')
[ -n "$blobs" ] && [ "$(cut -f1 <<<"$blobs" | cut -d' ' -f3)" = "$(cut -f2- <<<"$blobs" | git hash-object --no-filters --stdin-paths)" ] ||
  { echo "cli-pin: the checkout isn't HEAD's blobs byte for byte (a git attribute, such as ident, eol, text, filter or working-tree-encoding, wrote other bytes), which a deploy job's checkout of main would read"; exit 1; }`
export const CLI_PIN_RUN = `${CLI_PIN_DRIFT}\n${BLOB_RESET}\n${CLI_PIN_CHECK}`
const CLI_PIN_JOB_RULE = `runs ${CLI_PIN_CHECK} in a job of its own, ${CLI_PIN_JOB}, on GitHub's runner ubuntu-24.04, whose steps are only checkout of the whole history without credentials into ${REPO_FOLDER} and setup-node with Node from ${REPO_FOLDER}/.nvmrc and no cache, each at its commit and version comment in PINS_JOB_ACTIONS, and the check, in ${REPO_FOLDER} after CLI_PIN_DRIFT, which refuses a checkout that isn't HEAD's blobs, and BLOB_RESET, on a pull request alone, with BASE the base branch's remote-tracking name, so nothing of the repository's, no package manager and no action the pins check can't prove runs before it; check needs it`
function cliPinJobHolds(ci: string): boolean {
  const jobs = workflowJobs(ci)
  const own = jobs.filter(job => job.id === CLI_PIN_JOB)
  const check = jobs.find(job => job.id === 'check')
  const job = own[0]
  if (own.length !== 1 || job === undefined || check === undefined) return false
  const steps = parsedSteps(job)
  const [checkout, node, run] = steps
  const only = (step: WorkflowStep | undefined, keys: readonly string[]) =>
    step !== undefined && onceEach(step.keyNames, keys)
  return (
    onceEach(job.keyNames, ['runs-on', 'timeout-minutes', 'steps']) &&
    jobScalar(job, 'runs-on') === 'ubuntu-24.04' &&
    steps.length === 3 &&
    only(checkout, ['name', 'uses', 'with']) &&
    atJobPin(checkout, 'actions/checkout') &&
    sameMap(checkout?.with ?? new Map(), { 'persist-credentials': 'false', 'fetch-depth': '0', path: REPO_FOLDER }) &&
    only(node, ['name', 'uses', 'with']) &&
    atJobPin(node, 'actions/setup-node') &&
    sameMap(node?.with ?? new Map(), PINS_NODE_WITH) &&
    only(run, ['name', 'if', 'working-directory', 'env', 'run']) &&
    run?.if === expr("github.event_name == 'pull_request'") &&
    run.keys.get('working-directory') === REPO_FOLDER &&
    sameMap(run.env, { BASE: `origin/${expr('github.base_ref')}` }) &&
    run.run === CLI_PIN_RUN &&
    literalRun(run) &&
    jobNeeds(check).includes(CLI_PIN_JOB)
  )
}
// ci.yml's triggers (round 12's third iteration, its second pass): a pull request when it is opened, synchronised,
// reopened or edited, and a push to main, nothing else. GitHub's default activities for pull_request are the
// first three alone, and a change of a pull request's base is the edited activity, so a retarget started no run:
// the head kept the result of a run that tested its merge into the old base, which main's ruleset, the gate's
// PULL_CHECKS and history.ts plan all read as the merged pull request's own. This is a second layer: the owner's
// read of ci.yml holds it.
const CI_ON = new Map<string, readonly string[]>([
  ['pull_request', ['opened', 'synchronize', 'reopened', 'edited']],
  ['push', ['main']],
])
const CI_ON_RULE =
  "starts on a pull request when it is opened, synchronised, reopened or edited (a change of its base is an edit, so the newest run tests the merge into the base it merges into, which main's ruleset, the gate and history.ts plan read) and on a push to main, and on nothing else"
function ciOnHolds(ci: string): boolean {
  const on = blockValue(workflowTop(ci).get('on') ?? [])
  if (!isMap(on) || !keysAre(on, [...CI_ON.keys()])) return false
  const pull = on.get('pull_request')
  const push = on.get('push')
  return (
    isMap(pull) &&
    keysAre(pull, ['types']) &&
    sameList(pull.get('types'), CI_ON.get('pull_request') ?? []) &&
    isMap(push) &&
    keysAre(push, ['branches']) &&
    sameList(push.get('branches'), CI_ON.get('push') ?? [])
  )
}
// The required checks by their names (round 11): GitHub reports a job, and the ruleset's required check, the gate's
// PULL_CHECKS and prod-gate's MAIN_CI read one, by its name: key, or its id with none. So ci.yml's check and
// migrations have no name:, and no other job's name: is either of theirs, in any letter case, or an expression
// GitHub would evaluate to one, so no stand-in that always succeeds reports under a required check's name while
// the real job fails.
const REQUIRED_JOBS = ['check', 'migrations']
const REQUIRED_NAMES_RULE =
  "names check and migrations only by their ids: neither has a name:, and no other job's name: is either's, in any letter case, or an expression, since GitHub reports a job, and the ruleset, the gate and prod-gate read one, by its name"
function requiredJobsNamed(ci: string): boolean {
  const jobs = workflowJobs(ci)
  return (
    REQUIRED_JOBS.every(id => jobs.some(job => job.id === id)) &&
    jobs.every(job => {
      if (!job.keys.has('name')) return true
      const name = jobScalar(job, 'name')?.trim()
      return (
        name !== undefined &&
        !REQUIRED_JOBS.includes(job.id) &&
        !name.includes('${{') &&
        !REQUIRED_JOBS.includes(name.toLowerCase())
      )
    })
  )
}
// A workflow file as GitHub runs it and the guard reads it: one level under .github/workflows, with no @ in its
// name (round 12's fourth iteration): GitHub may give a run's path a ref after an @, so the gate's PULL_CHECKS
// and prod-gate's MAIN_CI read ci.yml's runs as the path before the first @, and a workflow named ci.yml@x.yml,
// whose jobs check and migrations always passed, read as ci.yml, its run newer than ci.yml's own. With no @ in
// any workflow's name, the path before the first @ names its file exactly.
export const WORKFLOW_FILE = /^\.github\/workflows\/[^/@]+\.ya?ml$/
// The folder the guard's own modules live in (this file, action-pins.ts, workflow.ts, the tests) and the pins
// check beside them, and a file there that a module resolver could load in place of a .ts one: JavaScript,
// another TypeScript flavour, or a name with no extension. Vitest resolves an import that names a module
// without its extension to a file of that very name first, then .mjs, .js and .mts before .ts (Vite's
// DEFAULT_EXTENSIONS), while Node loads the .ts a full name gives; so an action-pins.mjs beside
// action-pins.ts, holding a moved pin, was the table DPW-04 read under Vitest while the pins check proved
// the .ts (the sixth review's second attack). The guard and its tests name every module they import by its
// .ts file, which the test holds, the pins check reads deploy.yml's uses: itself, and scripts/ holds none
// of these, so no such file stands beside any guard's module either.
const SCRIPTS = 'scripts'
// A Yarn file anywhere in the tree (round 12's fourth iteration): setup-node runs yarn --version in its job's
// workspace, and Yarn 1, which GitHub's image ships, reads .yarnrc (or .yarnrc.yml) from the folder it runs in
// and every one above it, and runs the program its yarn-path names (a file under .yarn/, as yarn policies
// set-version writes it) before it reads an argument. The repository uses npm alone, so no Yarn file belongs in
// it. Every job that runs only owner's-read code checks out into a folder below setup-node's (DPW-04's job
// holds, DPW-11), which is the control; this is a second layer, since neither file is on the owner's-read list.
const YARN_FILE = /(?:^|\/)(?:\.yarnrc(?:\.ya?ml)?$|\.yarn\/)/
const YARN_RULE =
  'is a Yarn file (.yarnrc, .yarnrc.yml or under .yarn/): the repository uses npm alone, and Yarn 1, which setup-node runs in its job’s workspace, runs the program a .yarnrc’s yarn-path names'
const SHADOW_FILE = /^scripts\/(?:[^/]+\/)*(?:[^/.]+|[^/]+\.(?:[cm]?js|jsx|[cm]ts|tsx))$/
const SHADOW_RULE =
  'holds no JavaScript, no other TypeScript flavour (.js, .mjs, .cjs, .jsx, .mts, .cts, .tsx) and no file without an extension, any of which Vitest would load in place of a guard module named without its .ts'

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
  // Every shared run written out, so a group named in a shared run counts in every job that runs it.
  const text = expandRunAliases(workflows.get(DEPLOY) ?? '')
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
  prod: 'plan_basis check\nif [ "$TARGET" = restore ]; then\n  aws_check restore\nelse\n  aws_check "$MODE"\nfi',
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
    BASIS: expr('needs.prod-plan.outputs.basis'),
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
  [CDK_DIFF_DOWN]: ['prod-plan'],
}

// Each job's STAGE (DPW-06): set once, at the job, from a literal, or for prod and prod-plan the one
// expression that yields restore for a restore and prod otherwise, so prod-plan diffs the stacks prod then
// deploys.
const PROD_STAGE = expr("needs.gate.outputs.target == 'restore' && 'restore' || 'prod'")
export const STAGES: Readonly<Record<string, string>> = {
  nonprod: 'nonprod',
  'rollback-nonprod': 'nonprod',
  'prod-plan': PROD_STAGE,
  prod: PROD_STAGE,
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
// prod-plan's download, check and diff of prod's previous assembly: a deploy's, when prod has a previous
// release, whose assembly prod's rollback job would deploy.
const PLAN_PREVIOUS_IF = expr("needs.synth-previous-prod.outputs.assembly != '' && needs.gate.outputs.mode == 'deploy'")
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
// The commands whose status is the step's verdict, each standing alone (round 12's fourth iteration): a deploy
// of the CLI and smoke.ts. Wrapped as the diff runs wrap the CLI (STATUS=0, a { … } group, } || STATUS=$?, a
// summary line) but with no exit "$STATUS" after, or as { … } || echo, a failed deploy went on to migrate and
// Services over stacks that hadn't moved, and a failed smoke started no rollback and recorded the release:
// bash lifts set -e from what stands left of an || or &&, in an if's condition and after a !, and the CLI line
// and smoke.ts's line, each held whole, stayed whole inside the group. So each stands alone as standsAlone()
// holds a check's call: outside any substitution, pipeline, negation, and-or list (a group's or a subshell's
// included) or condition. Two forms are the workflow's own: the drill's if, whose CDK_DEPLOY_DRILL line is
// the deploy that must fail and whose body refuses when it doesn't, and prod-plan's diffs (DIFF_RUNS), each
// in { … } >"$DIFF" || STATUS=$? and ended by exit "$STATUS", which no deploy is, a form diffFormHolds() holds.
const VERDICT_ALONE =
  'runs each deploy of the CLI and smoke.ts standing alone, outside any substitution, pipeline, negation, and-or list (a group’s or subshell’s included) or condition but the drill’s if, so its failure ends the step'
const isVerdict = (command: GlueCommand) =>
  (command.name === 'run' && command.args[0]?.raw === '"$CDK"' && command.args[1]?.raw === 'deploy') ||
  (command.name === 'node' && command.args[0]?.raw === 'infra/scripts/deploy/smoke.ts')
function verdictsStandAlone(run: string): boolean {
  // A run the table can't read whole (a subshell, which it names no entry for) is refused by the table's own
  // rule in every job (DPW-07, DPW-10, DPW-13), since the reader stops where it refuses.
  const read = readShell(run)
  const lines = run.split('\n')
  return read.commands.every(
    command =>
      !isVerdict(command) ||
      standsAlone(command, read.commands) ||
      (run === DRILL_RUN &&
        lines[command.line]?.trim() === CDK_DEPLOY_DRILL &&
        read.commands.some(
          each => each.name === 'if' && each.line === command.line && standsAlone(each, read.commands),
        )),
  )
}

// prod-plan's diffs, held to the form the exemption above rests on (round 12's fourth iteration, its second pass):
// it named their exit "$STATUS" and no rule read it, so a diff run with that last line dropped, or ending
// exit "$DOWN_STATUS", ended prod-plan green after a failed diff (|| lifts set -e from the CLI's line), the summary
// still saying the plan fails, and prod waited for approval over a diff of only the stacks the CLI reached. A run
// that diffs (a CLI diff line, or RESTORE_DOWN_DIFF) ends with exit "$STATUS" standing alone, its only exit or
// return of its own; wraps each of its own diff lines in { … } >"$DIFF" || STATUS=$? and each down diff line in
// { … } >>"$DIFF" || { DOWN_STATUS=$?; break; }, each on lines of their own; sets STATUS only by one STATUS=0,
// those lines and if [ "$DOWN_STATUS" != 0 ]; then STATUS="$DOWN_STATUS"; fi, and DOWN_STATUS only by one
// DOWN_STATUS=0, DOWN_STATUS=1 and the down wrapping's; and sets neither by a builtin's word.
const DIFF_FORM =
  'ends each diff run with exit "$STATUS" standing alone, its only exit, wraps each diff line in { … } >"$DIFF" || STATUS=$? (a down diff’s in { … } >>"$DIFF" || { DOWN_STATUS=$?; break; }), and sets STATUS and DOWN_STATUS only as the diff runs do, so a failed diff fails prod-plan'
const DIFF_WRAP = ['{', '} >"$DIFF" || STATUS=$?']
const DOWN_WRAP = ['{', '} >>"$DIFF" || {', 'DOWN_STATUS=$?', 'break', '}']
const STATUS_LINES = new Map([
  ['STATUS', ['STATUS=0', DIFF_WRAP[1], 'if [ "$DOWN_STATUS" != 0 ]; then STATUS="$DOWN_STATUS"; fi']],
  ['DOWN_STATUS', ['DOWN_STATUS=0', 'DOWN_STATUS=1', 'DOWN_STATUS=$?']],
])
export function diffFormHolds(run: string): boolean {
  const lines = run.replace(/\n+$/, '').split('\n')
  const trimmed = lines.map(line => line.trim())
  const own = [CDK_DIFF_PROD, CDK_DIFF_ROLLBACK]
  if (!trimmed.some(line => own.includes(line) || line === CDK_DIFF_DOWN) && !run.includes(RESTORE_DOWN_DIFF)) {
    return true
  }
  const wrapped = (at: number, wrap: readonly string[]) =>
    trimmed[at - 1] === wrap[0] && wrap.slice(1).every((line, i) => trimmed[at + 1 + i] === line)
  const code = shellViews(run).code.split('\n')
  // Each line that sets STATUS or DOWN_STATUS by an assignment, read on the code view, so a quoted word is none.
  const setting = (name: string) =>
    code.flatMap((line, at) => (new RegExp(`(?:^|[\\s;&|(){}])${name}\\+?=`).test(line) ? [at] : []))
  const read = readShell(run)
  const last = lines.length - 1
  const [exit, ...others] = read.commands.filter(command => command.name === 'exit' || command.name === 'return')
  return (
    trimmed.every((line, at) => !own.includes(line) || wrapped(at, DIFF_WRAP)) &&
    trimmed.every((line, at) => line !== CDK_DIFF_DOWN || wrapped(at, DOWN_WRAP)) &&
    [...STATUS_LINES].every(([name, allowed]) => {
      const at = setting(name)
      const first = at.filter(line => trimmed[line] === `${name}=0`)
      return (
        at.every(line => allowed.includes(trimmed[line] ?? '')) &&
        (name === 'DOWN_STATUS' && at.length === 0 ? first.length === 0 : first.length === 1) &&
        at.every(line => line >= (first[0] ?? 0)) &&
        at.every(
          line =>
            trimmed[line] !== 'DOWN_STATUS=$?' || (trimmed[line - 2] === CDK_DIFF_DOWN && wrapped(line - 2, DOWN_WRAP)),
        )
      )
    }) &&
    !shellCommands(run)
      .flatMap(builtinNames)
      .some(name => STATUS_LINES.has(name)) &&
    lines[last] === 'exit "$STATUS"' &&
    !/(?:\\|&&|\|\||\||[({])\s*$/.test(lines[last - 1] ?? '') &&
    others.length === 0 &&
    exit?.line === last &&
    exit.alone &&
    !exit.substituted &&
    !exit.inSubstitution
  )
}

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
// "$STAGE", which each job sets once, in a step whose if: is its own, and naming the stacks its step
// deploys or diffs as CLI_STEP_STACKS writes them, literal sets never read from the canonical lines: a forward
// deploy is Platform, Data and Tasks, then migrate, then Services; restore=down is RESTORE_DOWN's three calls;
// a rollback is Tasks and Services, and a rollback job's only once AWS_CHECK said go. No failure passes: nothing in the workflow has continue-on-error, no
// step's if: calls a status function, and a credentialed job runs every step up to its credentials
// action (and AWS_CHECK after them) unconditionally, but its downloads.
const UNCONDITIONAL =
  'runs every step up to its credentials action, and AWS_CHECK after it, unconditionally, but its downloads, a download’s asset check under that download’s if:, and its image check, under the push’s if:'
const CLI_STEP_STACK =
  "names on each CLI line the stacks its step deploys or diffs, as CLI_STACKS writes them: Platform, Data and Tasks forward, then Services (the drill's too), a rollback's Tasks and Services, restore=down's one stack, and prod-plan's diff of every stack, the rollback's Tasks and Services or restore=down's one stack"
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
      if (shellCommands(run).some(handsName('STAGE')))
        add(id, `sets STAGE once, at the job, to ${wantStage ?? 'nothing'}`)
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
        // Each CLI line names the stacks its step deploys or diffs, as CLI_STEP_STACKS writes them.
        const named = cdk ? cliStacksOf(line.text) : undefined
        const sets = CLI_STEP_STACKS[id]?.[step.name ?? ''] ?? []
        if (cdk && (named === undefined || !sets.some(set => sameStacks(named.stacks, set)))) {
          add(id, CLI_STEP_STACK)
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
    if (steps.some(step => step.run !== undefined && !verdictsStandAlone(step.run))) add(id, VERDICT_ALONE)
    if (steps.some(step => step.run !== undefined && !diffFormHolds(step.run))) add(id, DIFF_FORM)
    const credentials = credentialsAt(steps)
    // Every step up to the credentials (and AWS_CHECK after them) runs, so none of the checks is skipped: but
    // the downloads, a download's asset check (ASSET_CHECK_RUN on the folder it downloaded, by its step's
    // ASSEMBLY_FOLDER), which runs exactly when its download does (prod-plan's of the previous assembly), and the
    // image check, which runs exactly when the push it guards does (DPW-13).
    if (ENVIRONMENT_JOBS[id] !== undefined) {
      const last = deploy === undefined ? credentials : credentials + 1
      const checkedUnder = new Set(
        steps.flatMap(step => {
          if (!step.uses?.startsWith('actions/download-artifact@')) return []
          const path = step.with.get('path') ?? ''
          const folder = path.startsWith(RUNNER_TEMP) ? path.slice(RUNNER_TEMP.length) : path
          return [JSON.stringify([ASSET_CHECK_RUN, folder, step.if ?? ''])]
        }),
      )
      if (
        steps
          .slice(0, last + 1)
          .some(
            step =>
              step.if !== undefined &&
              !step.uses?.startsWith('actions/download-artifact@') &&
              !(step.run === IMAGE_UNPACK_RUN && step.if === PUSH_IF[id]) &&
              !checkedUnder.has(JSON.stringify([step.run ?? '', step.env.get('ASSEMBLY_FOLDER') ?? '', step.if])),
          )
      ) {
        add(id, UNCONDITIONAL)
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
    const wantCheck = whatRunsText(id)
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
// in quoted text, jq's env builtin and $ENV in a program, a - beside either jq's operator and never part of a
// name (-env.X prints the value in the error negating it throws), and env as an object's key, env: … straight
// inside braces the line opens, after their { or a , (quotedEnvIsKey()), nothing, but the same env: inside [ ]
// or ( ) is a slice's start jq evaluates (.[0, env:1]; the ninth review's second attack); anywhere, a /proc
// file (environ), or /proc reached through /dev/fd or /dev/stdin, /dev/stdout or /dev/stderr
// (/dev/fd/../environ is the run's own; the seventh review's third attack), and an AWS_ variable's expansion,
// whose value is a credential. No run uses any. A path built from parts is the canonical rule's to refuse,
// which reads a file only on a line the guard writes (canonicalToolLines()).
const QUOTED_ENV = /(?<![\w.$"])env(?![\w"])|\$ENV\b/g
// Whether the env at a line's quoted text's index is an object's key: a : after it, and before it, on the line,
// a { or a , with braces the innermost bracket open there (jq's strings read as strings, never brackets).
function quotedEnvIsKey(text: string, at: number): boolean {
  if (!/^env\s*:/.test(text.slice(at))) return false
  const open: string[] = []
  let previous = ''
  for (let i = 0; i < at; i++) {
    const c = text[i] ?? ''
    if (c === '"') {
      for (i++; i < at && text[i] !== '"'; i++) if (text[i] === '\\') i++
      previous = c
      continue
    }
    if (c === '{' || c === '[' || c === '(') open.push(c)
    if (c === '}' || c === ']' || c === ')') open.pop()
    if (!/\s/.test(c)) previous = c
  }
  return open.at(-1) === '{' && (previous === '{' || previous === ',')
}
const quotedEnv = (text: string) =>
  [...text.matchAll(QUOTED_ENV)].some(match => match[0] !== 'env' || !quotedEnvIsKey(text, match.index))
// A path to the process's own environment or descriptors, /proc and /dev/fd, however its folders are spelt between
// (/dev/./fd/../environ is /proc/self/environ: round 11), or the file's own name, or an AWS_ variable.
const CREDENTIAL_READ = /\/proc(?![\w.-])|\/dev\/[./]*(?:fd|std(?:in|out|err))(?![\w.-])|\benviron\b|\$\{?!?AWS_/
// A line's quoted text alone, everything else blanked: the code view writes quoted text as underscores.
const quotedText = (line: { text: string; code: string }) =>
  [...line.text].map((c, i) => (line.code[i] === '_' ? c : ' ')).join('')
// The builtins that print every variable they're given no name for (declare -x, local, readonly).
const PRINTS_VARIABLES = ['declare', 'typeset', 'export', 'readonly', 'local']
// The preamble's functions and the sed mask runs, which a credentialed run defines only in its preamble
// and never unsets or shadows by an alias, so every later run …, $(get …) and summary write is filtered.
const FILTER_FUNCTIONS = ['mask', 'run', 'get', 'sed']
const PREAMBLE_LINES = PREAMBLE.split('\n').length
// A run that stops the runner reading workflow commands before anything it runs can print: it starts with
// STOP_HEAD, set -euo pipefail and then STOP_COMMANDS, whole.
const stopsCommandsFirst = (run: string): boolean => run.startsWith(`${STOP_HEAD}\n`)
const STOPS_FIRST =
  "starts with STOP_HEAD, which stops the runner reading workflow commands before anything it runs reads or prints (every run but the account id's mask, before the credentials action or after it), so no ##[add-mask] or other command in what it prints, a downloaded archive's or assembly's text or the CLI's, aws's or skopeo's among it, hides a line of the log or the approver's diff or drops a job output"
// What comes right before a write to the job summary: mask as a command after a pipe (or first on its line,
// a pipe's next line), then tee -a or >>.
const SUMMARY_THROUGH_MASK = /(?:^|\|)\s*mask\s*(?:\|\s*tee\s+-a\s+|>>\s*)"\$\{?$/
const AWS_ENV_ASSIGNMENT = assigns('AWS_[A-Z0-9_]*|ROLE_TO_ASSUME')
// The runner's own names a run's own lines may expand, in any job: its outputs, its summary, its folder and the
// run's ids and address, none of them a credential. Not GH_TOKEN, which gh reads itself, and none of the names the
// runner hands a job a credential in (the OIDC request token and its URL, the AWS session), which a jq split or
// slice would print in pieces no mask matches.
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
// Whether a run's own lines expand only a name its step's or job's env: sets, or its own lines or a canonical text
// standing in it set, one of RUNNER_EXPANSIONS, a function's argument ($1 to $9) or the last status ($?); never a
// token's (GH_TOKEN) or another name the runner hands a step (CREDENTIAL_NAMESPACE's) but RUNNER_EXPANSIONS, which
// neither an env: nor setting it makes the run's own (an own line's ACTIONS_ID_TOKEN_REQUEST_TOKEN='' after a jq
// handed the live token, the ninth review's fourth attack), as canonicalGiven() holds the canonical texts.
function expandsOnlyItsOwn(run: string, read: ShellRead, env: readonly string[]): boolean {
  const own = new Set<string>(RUNNER_EXPANSIONS)
  const given = [
    ...env,
    ...read.commands.flatMap(namesSet),
    ...canonicalPlaces(run).flatMap(place => NAMES_SET_BY(place.text)),
  ]
  for (const name of given) if (!TOKEN_NAMES.includes(name) && !CREDENTIAL_NAMESPACE.test(name)) own.add(name)
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
// name; in every run's own lines, in every job, no expansion but of its own names (EXPANDS_ITS_OWN), a name the
// runner hands a step never one of them but RUNNER_EXPANSIONS, and
// in a credentialed run no jq program's env or $ENV, /proc file or AWS_ variable's expansion; no ${{ }}
// inside a run (inputs and outputs come through env:); secrets, in any letter case or form, names only the
// role and the account id, as secrets.NAME, in the five environment jobs, and never GITHUB_TOKEN; github.token
// only as a GH_TOKEN env value, and the github context never whole, nor its values by github.*; in each
// environment job the account id is masked before the credentials action, every run after it starts with
// the preamble, whose mask, run and get no later definition, alias or unset changes, every aws, CDK and
// skopeo command is run … or $(get …), get only ever first in a $( … ), whose output is kept (the registry
// login alone piped into skopeo login, then the filter), each write to the job summary goes through mask,
// the credentials action takes exactly its seven inputs, and no AWS_ variable or ROLE_TO_ASSUME is set.
// Every run, in every job, writes the job summary and its outputs only by appending (round 12's fourth iteration,
// its second pass): a redirection of any descriptor into either is >> (or &>>), and a tee into either is tee -a. The
// gate's Plan step's } >"$GITHUB_STEP_SUMMARY" erased the lines naming the records history.ts ignored, and a > into
// the outputs erases the step's earlier outputs while bindingFindings() still reads them as written; only a
// credentialed run's summary writes were held to >>. Read on the command code, so a quoted word is none.
// And either file's name is expanded only as such a target or tee -a's operand, the whole word (round 12's
// lenses): a redirection's text alone let a write through a name holding the path (summary="$GITHUB_STEP_SUMMARY"
// and then } >"$summary") or by a program (cp, mv, dd of=, truncate, sed -i onto it), each erasing it as > does.
const APPENDS_ONLY =
  'writes the job summary and its outputs only by appending (>> or tee -a), expanding either file’s name only as that whole target or operand, so no write erases what the step wrote there before'
const STEP_FILE_WRITE = /(?<![<>]|(?<!&)&)((?:\d+|&)?(?:<>|>>?\|?))\s*([^\s;|()<>]+)/g
const STEP_FILE = /GITHUB_(?:OUTPUT|STEP_SUMMARY)/
// An expansion of either name in the command code ($NAME or ${NAME…}, quoted or not), the whole word it may stand
// as (the code keeps a double quote and writes the text inside one as _), and what may stand before that word: >>
// (with a descriptor or &), or tee -a where a command starts.
const STEP_FILE_EXPANSION = /\$\{?GITHUB_(?:OUTPUT|STEP_SUMMARY)(?![A-Za-z0-9_])/g
const STEP_FILE_WORD = /"?\$(?:GITHUB_(?:OUTPUT|STEP_SUMMARY)|\{GITHUB_(?:OUTPUT|STEP_SUMMARY)\})"?(?=$|[ \t;&|)])/y
const APPEND_BEFORE = /(?:^|[^<>&\d])(?:\d+|&)?>>[ \t]*$/
const TEE_BEFORE = /tee[ \t]+-a[ \t]+$/
const appendedAt = (line: string, at: number) => {
  const start = line[at - 1] === '"' ? at - 1 : at
  STEP_FILE_WORD.lastIndex = start
  if (STEP_FILE_WORD.exec(line) === null) return false
  const before = line.slice(0, start)
  const tee = TEE_BEFORE.exec(before)
  return APPEND_BEFORE.test(before) || (tee !== null && ENDS_AT_COMMAND_START.test(before.slice(0, tee.index)))
}
export function appendsOnly(run: string): boolean {
  const code = commandCode(shellViews(run).code)
  return (
    [...code.matchAll(STEP_FILE_WRITE)].every(
      ([, op, target]) => !STEP_FILE.test(target ?? '') || /^(?:\d+|&)?>>$/.test(op ?? ''),
    ) &&
    shellCommands(run).every(
      command => command.word !== 'tee' || !STEP_FILE.test(command.tail) || /^\s*-a\s/.test(command.tail),
    ) &&
    code
      .split('\n')
      .every(line => [...line.matchAll(STEP_FILE_EXPANSION)].every(({ index }) => appendedAt(line, index)))
  )
}
export function maskingFindings(workflows: Texts): Finding[] {
  const found = new Set<Finding>()
  // Every shared run written out, so a secret named in a shared run counts in every job that runs it.
  const text = expandRunAliases(workflows.get(DEPLOY) ?? '')
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
      // A run's own lines expand only the names it owns, in every job, so none hands the OIDC request token, the
      // AWS session or the job's token to a tool that prints it in pieces (the ninth review's fourth attack: the
      // gate's own echo "$GH_TOKEN" | sed 's/./& /g', in a job this rule once left out, spaced out its token).
      if (!expandsOnlyItsOwn(run, read, [...jobNames, ...step.env.keys()])) add(where, EXPANDS_ITS_OWN)
      if (!appendsOnly(run)) add(where, APPENDS_ONLY)
      // env or printenv, by name or path, as a command or a word handed to one (sudo printenv, xargs env,
      // find -exec /usr/bin/env), quoted or not, since bash hands a program the word with its quotes taken
      // off. A program the run starts is handed a script only as one word (bash -c "printenv X"), which DPW-07
      // doesn't read: that is build's and synth's, which hold no secret and run repository code by design.
      // env, set, declare, typeset or export given no word is read whatever stands before it, by what follows
      // its own word: a redirection (2>/dev/null set), an assignment or a wrapper leaves set printing every
      // variable (the ninth review's third attack).
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
              /^\s*(?:$|[|;&>)])/.test(command.tail)) ||
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
      if (stopTokenLines(run).length > 0) add(where, STOP_TOKEN_RULE)
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
          line => CREDENTIAL_READ.test(line.text) || (/env|ENV/.test(line.text) && quotedEnv(quotedText(line))),
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
      // Every run, before the credentials action or after it, but the account id's mask, which must add its
      // mask and prints only the secret.
      if (run !== MASK_RUN && !stopsCommandsFirst(run)) add(where, STOPS_FIRST)
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
// deploy, and lets it run for a restore, whose prod-gate requires its success as a prod deploy's and
// rollback's does, so every prod approval, a restore's too, comes after a diff of what it deploys (the
// seventh review's fourth attack); prod-gate names no environment and holds no id-token, waits for main's
// check and migrations for a deploy alone, read from ci.yml's own run and its jobs (MAIN_CI, and the gate
// the pull request's the same way, PULL_CHECKS), never from a check run, and runs history.ts prod-gate with the mode
// (PROD_GATE_CALL); the fast re-checks (FAST_RECHECK_NONPROD and FAST_RECHECK_PROD) come before the
// credentials and cover a deploy (ancestry, and in prod both digests) and a rollback or restore (the
// record id; in prod every mode's, and every approval in prod is held to prod-plan's diff of this
// attempt, prod-plan outputting its attempt), each of those runs pinned whole, so no early
// exit 0 or forged output passes it; each smoke judges only the read-back its job wrote in this
// attempt (the job outputs attempt, and the smoke's one
// step reading READBACK first refuses another, SMOKE_ATTEMPT); each rollback job needs build, takes this
// run's digest from build for a deploy and from the gate for a drill-smoke, runs only when the gate allows
// the automatic rollback (rollback_<env>), once its deploy job set services_started (in a step that stands
// before every step from the Services deploy on, so a failure there starts it) and only once its
// smoke or its deploy job failed (its if: whole is JOB_IFS', DPW-10), and judges the release that deploy
// replaced from that job's own
// AWS_CHECK (the deploy job outputs replaced from its aws step, whose value AWS_CHECK_ENV pins as the
// rollback's REPLACED);
// rollback-prod's steps are rollback-nonprod's but for the environment's name; only prod and
// rollback-prod deploy to prod, rollback-prod only the previous release's Tasks and Services, and every prod
// deploy line names only stacks prod-plan's diff for its mode names (CLI_STACKS, literal sets); the runs a
// smoke, a rollback, prod-gate or the approver rests on are pinned whole (PINNED_RUNS: prod's records, the
// smokes, services_started, the read-back, the rollback jobs' releases and rolled, prod-plan's diff); and
// outside build and synth only a pinned run, AWS_CHECK's step and prod-gate's call write an output.
// The lines the mark and a rollback's last step write their outputs by (DPW-08), written here, never read from
// MARK_RUN or DONE_RUN, which move with the workflow.
const MARK_WRITE = 'echo "services_started=true" >>"$GITHUB_OUTPUT"'
const DONE_WRITE = 'echo "rolled=true" >>"$GITHUB_OUTPUT"'
// Whether a step's run writes a key on exactly one code line (whole-line comments aside), that line the literal.
function writesExactly(step: WorkflowStep | undefined, key: string, literal: string): boolean {
  const lines = (step?.run ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => !line.startsWith('#') && line.includes(key))
  return lines.length === 1 && lines[0] === literal
}
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
    evaluateIf(planIf, {
      'needs.gate.outputs.target': 'prod',
      'needs.gate.outputs.mode': 'deploy',
      'needs.smoke-nonprod.result': 'failure',
    }) !== false
  ) {
    add('prod-plan', "its if: requires smoke-nonprod's success for a deploy")
  }
  // A restore is approved against prod-plan's diff of the restore stage's stacks, as a prod deploy or rollback
  // is against its diff of prod's (the seventh review's fourth attack, where a restore's templates reached
  // prod's account with no diff in any run): prod-plan runs for a restore, and prod-gate, which prod needs,
  // requires prod-plan's success for every target.
  const gateJob = jobs.get('prod-gate')
  const gateIf = gateJob === undefined ? '' : (jobScalar(gateJob.job, 'if') ?? '')
  const restore = { 'needs.gate.outputs.target': 'restore', 'needs.gate.outputs.mode': 'deploy' }
  if (
    evaluateIf(planIf, {
      ...restore,
      'github.triggering_actor': 'person',
      'github.actor': 'person',
      'needs.synth.result': 'success',
      'needs.synth-previous-prod.result': 'success',
      'needs.smoke-nonprod.result': 'skipped',
    }) === false ||
    ['failure', 'cancelled', 'skipped'].some(
      result =>
        evaluateIf(gateIf, { ...restore, 'needs.gate.result': 'success', 'needs.prod-plan.result': result }) !== false,
    )
  ) {
    add(
      'prod-plan',
      'runs for a restore, whose prod-gate (and so prod) requires its success, so a restore is approved against its diff',
    )
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
  // A restore taken down is approved against the stacks its diff showed: prod-plan outputs what its Diff step
  // read of each restore stack (down, RESTORE_DOWN_DIFF's), and prod's down step (pinned whole, PLANNED its
  // env) refuses before any deploy unless it reads the same, so no stack another restore created or recreated
  // since is deployed from a template no diff showed (the eighth review's first attack). Every other prod
  // approval is bound the same way (PLAN_BASIS, round 11): prod-plan outputs what its Diff step read of the
  // stage's four stacks before it diffed (basis), and prod's What runs (pinned whole, BASIS its env) refuses
  // before it checks, pushes or deploys anything unless it reads the same, so no rollback or deploy that moved
  // the stage after prod-plan diffed it, recorded or not, is deployed over unseen.
  const planOutputs = blockValue(plan?.job.keys.get('outputs') ?? [])
  if (
    !isMap(planOutputs) ||
    planOutputs.size !== 3 ||
    planOutputs.get('attempt') !== expr('github.run_attempt') ||
    planOutputs.get('down') !== stepOutput('diff', 'down') ||
    planOutputs.get('basis') !== stepOutput('diff', 'basis')
  ) {
    add(
      'prod-plan',
      "outputs its attempt, which prod's fast re-check holds to its own, its diff's read of the restore stage, which prod's down holds the stage to, and its read of the stage it diffed, which prod's What runs holds the stage to, and nothing else",
    )
  }
  const takeDown = jobs.get('prod')?.steps.find(step => step.name === 'Take the restore stage down')
  if (
    takeDown?.run !== DOWN_RUN ||
    takeDown.env.get('PLANNED') !== expr('needs.prod-plan.outputs.down') ||
    plan?.steps.find(step => step.name === 'Diff')?.id !== 'diff'
  ) {
    add('prod', "takes the restore stage down only as prod-plan's diff read it (PLANNED, its down output)")
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
    ...Object.keys(AWS_CHECK_CALLS).map(whatRunsText),
    PROD_GATE_CALL,
  ])
  for (const { id, steps } of jobs.values()) {
    if (id === 'build' || SYNTH_JOBS.includes(id)) continue
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
    // The rollback's auto check reads that output as REPLACED, compared here as written, never through
    // AWS_CHECK_ENV, which moves with the workflow (round 12's fourth iteration): REPLACED read from the gate's
    // current_<env>, the newest record, which for a deploy is the previous release itself, made the check's
    // second test always pass, so a rollback a person made after the gate read the records was followed by
    // a move forward to the release they had rolled back from.
    if (job?.steps.find(step => step.id === 'aws')?.env.get('REPLACED') !== expr(`needs.${deploy}.outputs.replaced`)) {
      add(rollback, `judges what ${deploy} replaced by REPLACED, its deploy job's replaced output as written`)
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
    // The step that writes services_started (the one the deploy job's output reads, by its id) stands before
    // every step from the Services deploy on, read here as written, never through JOB_STEPS, which moves with
    // the workflow (round 12's second iteration): GitHub skips a step whose if: names no status function once
    // an earlier one has failed, so the mark moved after the Probe was skipped when the Probe failed,
    // services_started read '' and a release whose probe failed stayed live with no rollback.
    const deploySteps = jobs.get(deploy)?.steps ?? []
    const started = isMap(deployOutputs) ? deployOutputs.get('services_started') : undefined
    const markId =
      typeof started === 'string'
        ? /^\$\{\{ steps\.([\w-]+)\.outputs\.services_started \}\}$/.exec(started)?.[1]
        : undefined
    const placesOf = (holds: (step: WorkflowStep) => boolean) =>
      deploySteps.flatMap((step, index) => (holds(step) ? [index] : []))
    const marks = placesOf(step => markId !== undefined && step.id === markId)
    const later = [
      'Deploy Services',
      'Roll back to the target',
      deploy === 'prod' ? 'Take the restore stage down' : 'drill-break',
      'Probe',
      'Read back what runs',
    ]
    if (
      marks.length !== 1 ||
      later.some(name => {
        const places = placesOf(step => step.name === name)
        return places.length === 0 || places.some(place => place < (marks[0] ?? 0))
      })
    ) {
      add(
        deploy,
        `writes services_started (the step its output reads) before ${later.slice(0, -1).join(', ')} and ${later.at(-1)}, each there, so a failure from the Services deploy on starts ${rollback}`,
      )
    }
    // The values those two steps write, held as written beside what the if:s compare (round 12's third
    // iteration, its second pass): the mark's place, the rollback's if: and the pinned runs were each held, but
    // never the value, so services_started written as the run's attempt, as yes or as "true " (GitHub compares
    // strings whole, ignoring case alone) read as not 'true', and a release whose smoke failed stayed live with
    // no rollback; rolled the same left the rollback with no resmoke and no record. Each is written on one code
    // line, the literal below, by the step its job's output reads, and resmoke-<env>'s if: compares rolled to
    // 'true' as written.
    const mark = deploySteps.find(step => markId !== undefined && step.id === markId)
    if (!writesExactly(mark, 'services_started', MARK_WRITE)) {
      add(
        deploy,
        `writes services_started on one line alone, ${MARK_WRITE}, the value ${rollback}'s if: compares ('true')`,
      )
    }
    const rollbackOutputs = blockValue(job?.job.keys.get('outputs') ?? [])
    const rolledOutput = isMap(rollbackOutputs) ? rollbackOutputs.get('rolled') : undefined
    const doneId =
      typeof rolledOutput === 'string'
        ? /^\$\{\{ steps\.([\w-]+)\.outputs\.rolled(?: \|\| steps\.aws\.outputs\.rolled)? \}\}$/.exec(rolledOutput)?.[1]
        : undefined
    const done = job?.steps.find(step => doneId !== undefined && doneId !== 'aws' && step.id === doneId)
    const resmoke = jobs.get(`resmoke-${deploy}`)
    const resmokeIf = resmoke === undefined ? '' : (jobScalar(resmoke.job, 'if') ?? '')
    if (
      !writesExactly(done, 'rolled', DONE_WRITE) ||
      !resmokeIf.includes(`needs.${rollback}.outputs.rolled == 'true'`) ||
      evaluateIf(resmokeIf, { [`needs.${rollback}.outputs.rolled`]: '' }) !== false
    ) {
      add(
        rollback,
        `writes rolled on one line alone, ${DONE_WRITE}, from the step its rolled output reads first, the value resmoke-${deploy}'s if: compares ('true') as written, so the resmoke and its record follow a rollback`,
      )
    }
    // The gate's verdict on the automatic rollback (floor-crossed, say, refuses it) and the failure it
    // answers: with either clause gone, GitHub rolls back across a floor the gate refused, or rolls back a
    // release that passed, which the record job then records as running.
    if (evaluateIf(condition, { [`needs.gate.outputs.rollback_${deploy}`]: 'false' }) !== false) {
      add(rollback, `runs only when the gate allows the automatic rollback (rollback_${deploy})`)
    }
    const passed = { [`needs.smoke-${deploy}.result`]: 'success', [`needs.${deploy}.result`]: 'success' }
    if (evaluateIf(condition, passed) !== false) {
      add(rollback, `runs only once smoke-${deploy} or ${deploy} failed`)
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
  for (const finding of prodDiffStackFindings()) found.add(finding)
  return [...found]
}

// What an approval in prod deploys is what prod-plan's diff for its mode showed (DPW-08): a rollback's stacks
// are the rollback diff's, restore=down's its diff's, and a forward deploy's within the diff of every stack,
// each read from the canonical lines themselves (or the ones given, as the tests plant them) and held to
// CLI_STACKS' literal sets, so no change to a deploy line's stacks leaves the approver reading a diff of fewer.
export function prodDiffStackFindings(given: Readonly<Record<string, string>> = {}): Finding[] {
  const lines: Readonly<Record<string, string>> = {
    CDK_DEPLOY_FORWARD,
    CDK_DEPLOY_SERVICES,
    CDK_DEPLOY_ROLLBACK,
    CDK_DEPLOY_DOWN,
    CDK_DIFF_PROD,
    CDK_DIFF_ROLLBACK,
    CDK_DIFF_DOWN,
    ...given,
  }
  const stacksOf = (name: string) => cliStacksOf(lines[name] ?? '')?.stacks ?? []
  const within = (deployed: readonly string[], diffed: readonly string[]) =>
    deployed.length > 0 &&
    !deployed.includes('*') &&
    (sameStacks(diffed, CLI_STACKS.diff.prod) || deployed.every(stack => diffed.includes(stack)))
  const holds =
    sameStacks(stacksOf('CDK_DEPLOY_ROLLBACK'), stacksOf('CDK_DIFF_ROLLBACK')) &&
    sameStacks(stacksOf('CDK_DEPLOY_ROLLBACK'), CLI_STACKS.deploy.rollback) &&
    sameStacks(stacksOf('CDK_DIFF_ROLLBACK'), CLI_STACKS.diff.rollback) &&
    sameStacks(stacksOf('CDK_DEPLOY_DOWN'), stacksOf('CDK_DIFF_DOWN')) &&
    sameStacks(stacksOf('CDK_DEPLOY_DOWN'), CLI_STACKS.deploy.down) &&
    sameStacks(stacksOf('CDK_DIFF_DOWN'), CLI_STACKS.diff.down) &&
    sameStacks(stacksOf('CDK_DIFF_PROD'), CLI_STACKS.diff.prod) &&
    sameStacks(stacksOf('CDK_DEPLOY_FORWARD'), CLI_STACKS.deploy.forward) &&
    sameStacks(stacksOf('CDK_DEPLOY_SERVICES'), CLI_STACKS.deploy.services) &&
    within(stacksOf('CDK_DEPLOY_FORWARD'), stacksOf('CDK_DIFF_PROD')) &&
    within(stacksOf('CDK_DEPLOY_SERVICES'), stacksOf('CDK_DIFF_PROD'))
  return holds
    ? []
    : [
        at(
          DEPLOY,
          'DPW-08',
          "prod: deploys only the stacks prod-plan's diff for its mode shows: a rollback's Tasks and Services as the rollback diff, restore=down's one stack as its diff, and a forward deploy's within the diff of every stack",
        ),
      ]
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
// The jobs that synthesise an assembly, each one commit's on a runner of its own (C11-D51): the release's,
// and each environment's previous release's, for its automatic rollback.
const SYNTH_JOBS: readonly string[] = ['synth', 'synth-previous-nonprod', 'synth-previous-prod']
// The jobs whose checkout is a folder of its own, so a step of theirs may name it as its working-directory:
// the synths' and the jobs that check the run's commit out into REPO_FOLDER.
const FOLDER_JOBS: readonly string[] = [
  ...SYNTH_JOBS,
  'gate',
  'prod-gate',
  'smoke-nonprod',
  'resmoke-nonprod',
  'smoke-prod',
  'resmoke-prod',
]
// The jobs whose if: no drill may pass (C11-D59): drills are non-prod's alone.
const NO_DRILL = ['prod-plan', 'prod-gate', 'prod', 'rollback-prod', 'record-prod'] as const
// The jobs each job runs only once they succeeded, with what else its if: is then told (DPW-09): an if:
// that calls a status function (!cancelled(), say) isn't joined to success(), so it must ask itself.
const REQUIRES: Readonly<Record<string, ReadonlyArray<readonly [string, Readonly<Record<string, string>>]>>> = {
  synth: [['gate', {}]],
  'synth-previous-nonprod': [['gate', {}]],
  'synth-previous-prod': [['gate', {}]],
  nonprod: [
    ['synth', {}],
    ['synth-previous-nonprod', {}],
  ],
  'smoke-nonprod': [['nonprod', {}]],
  'prod-plan': [
    ['synth', {}],
    ['synth-previous-prod', {}],
    ['smoke-nonprod', { 'needs.gate.outputs.mode': 'deploy', 'needs.gate.outputs.target': 'prod' }],
  ],
  'prod-gate': [
    ['gate', {}],
    ['prod-plan', {}],
  ],
  prod: [
    ['synth', {}],
    ['synth-previous-prod', {}],
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
// holds exactly the three files, each the environment file's shape and none letting an admin bypass its
// rules: prod.json asks for at least one reviewer, prod-plan.json for none, nonprod.json for one exactly
// when non-prod holds real data (C0.12's flip can't land half done); the script's agent markers are the Owner
// bootstrap script's; prod-gate runs the same check again, just before its own verdict, since a re-run of
// prod-plan re-runs prod-gate and prod but never the gate; and the gate's reads of the records and main's
// ruleset, its check of the live environments (and prod-gate's) and its plan are pinned whole under their own
// if: (GATE_RECORDS, RULESET_CHECK, ENVIRONMENTS_CHECK, PLAN_STEP), so no line of their own or if: ends or
// skips one, forges what the plan reads or writes a gate output.
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
  // prod-gate checks them again, last before its own verdict: a re-run of prod-plan re-runs prod-gate and prod
  // but never the gate, and GitHub applies prod's protection as it stands when prod queues, so the gate's check
  // alone would leave prod, on a re-run or long after a fresh run's gate, deploying under settings nothing read.
  const prodGate = jobs.get('prod-gate')?.steps ?? []
  const verdict = prodGate.findIndex(step => step.id === 'check')
  const again = prodGate.findIndex(step => step.run === ENVIRONMENTS_CHECK)
  if (again < 0 || verdict < 0 || again !== verdict - 1) {
    add('prod-gate', 'runs scripts/protect-environments.sh check just before its own verdict')
  }
  // The steps the plan rests on, each pinned whole under its own if:, so no line of its own or if: ends or
  // skips one, forges a file the plan reads or writes a gate output of its own.
  for (const place of unpinnedRuns(jobs, 'DPW-09')) {
    add(
      place,
      "runs as written, whole and under its own if: (PINNED_RUNS): the records, main's ruleset and the live environments the plan and prod-gate rest on and the plan itself, so no line of its own ends one early, skips one, forges what the plan reads or writes an output of its own",
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
    // No admin bypass in any environment: once non-prod holds real data its reviewer stands as prod's does,
    // and a repo admin could otherwise force a deploy past either (GitHub lets admins bypass by default).
    if (record.can_admins_bypass !== false) found.push(at(path, 'DPW-09', 'lets no admin bypass its rules'))
    if (name === 'prod.json' && reviewers < 1) found.push(at(path, 'DPW-09', 'asks for at least one reviewer'))
    if (name === 'prod-plan.json' && reviewers !== 0) found.push(at(path, 'DPW-09', 'asks for no reviewer'))
    if (name === 'nonprod.json' && reviewers >= 1 !== nonprodHoldsRealData) {
      found.push(at(path, 'DPW-09', 'asks for a reviewer exactly when PROFILES.nonprod.holdsRealData is true'))
    }
  }
  const markers = /^AGENT_MARKERS=\(([^)]*)\)$/m.exec(protectEnvironments)?.[1]?.trim().split(/\s+/) ?? []
  if (markers.length !== agentMarkers.length || agentMarkers.some((marker, i) => markers[i] !== marker)) {
    found.push(at(PROTECT_ENVIRONMENTS, 'DPW-09', "its agent markers are the Owner bootstrap script's AGENT_MARKERS"))
  }
  // The gate and a person run the script as a file, so its first line is the interpreter the kernel runs it
  // with: exactly PROTECT_ENVIRONMENTS_SHEBANG (an env -S that unsets a marker, bash -n, another shell or an
  // option would skip the refusal, or the whole check). Its code lines, read as bash reads them, open with
  // markerHead, and only the declaration and the refusal's loop name AGENT_MARKERS, so no line before the
  // refusal runs anything else and no later assignment, unset or read empties the list it reads. A line is a
  // comment or blank only as bash sees one (codeLinesAsBash).
  const lines = protectEnvironments.split('\n')
  if (lines[0] !== PROTECT_ENVIRONMENTS_SHEBANG) {
    found.push(
      at(
        PROTECT_ENVIRONMENTS,
        'DPW-09',
        `runs as a file under ${PROTECT_ENVIRONMENTS_SHEBANG} alone, its first line (PROTECT_ENVIRONMENTS_SHEBANG)`,
      ),
    )
  }
  const code = codeLinesAsBash(lines.slice(1))
  if (
    markerHead(markers).some((line, i) => code[i] !== line) ||
    code.filter(line => line.includes('AGENT_MARKERS')).length !== 2
  ) {
    found.push(
      at(
        PROTECT_ENVIRONMENTS,
        'DPW-09',
        'refuses every command but check under each agent marker, before anything else runs (MARKER_REFUSAL)',
      ),
    )
  }
  if (
    createHash('sha256').update(pinnedScriptText(protectEnvironments)).digest('hex') !== PROTECT_ENVIRONMENTS_SHA256
  ) {
    found.push(
      at(
        PROTECT_ENVIRONMENTS,
        'DPW-09',
        'runs in the gate the code pinned whole from its first code line (PROTECT_ENVIRONMENTS_SHA256), which moves only with it',
      ),
    )
  }
  const later = bashAfter32(code)
  if (later.length > 0) {
    found.push(at(PROTECT_ENVIRONMENTS, 'DPW-09', `keeps to bash 3.2's syntax (BASH_AFTER_3_2): ${later.join(', ')}`))
  }
  return found
}

// --- DPW-10: no repository code where the credentials are ---------------------------------------------

// What a credentialed job may run (C11-D48): bash's own builtins and keywords, the functions its step
// defines, gh, git and jq, the text tools it reads with, aws and skopeo (through run and get), the pinned
// CLI (through run), the fetch of the CLI on CLI_FETCH's own lines alone (FETCH_TOOLS), and the image's
// listing and unpacking on IMAGE_CHECK's own lines alone (IMAGE_TOOLS); never npm.
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
// text, is no builtin a job may use.) Each line such a tool is held to below is written here as it is, never
// read out of the canonical text it stands in, so a change to that text's line (a sed command that runs
// what it reads, a tar that runs a program per member or per checkpoint, a find that copies a file) is
// refused until the line here moves too; the tests hold each to standing whole in its text
// (TOOL_LINE_TEXTS).
export const MASK_LINE = String.raw`mask() { sed -uE ':a; s/(^|[^0-9a-f])[0-9]{12}([^0-9a-f]|$)/\1***\2/; ta'; }`
export const FIND_LINE = `[ -z "$(find "$root" -type l -print -quit)" ] || asset_refuse 'the assembly holds a symbolic link'`
export const CLI_FIND_LINE = `[ -z "$(find "$RUNNER_TEMP/aws-cdk" -type l -print -quit)" ] || { echo 'cli-check: the unpacked CLI holds a symbolic link'; exit 1; }`
export const KEY_HASH_LINE = sh`[ "$(sha256sum <"$dir/$path")" = "$\{key%.json}  -" ] || asset_refuse "a file asset's key isn't the sha256 of its bytes"`
// The tools CLI_FETCH alone runs, each only on its own line of that text and only in a run that is CLI_FETCH
// whole: mkdir makes the CLI's folder, curl fetches the registry's tarball by its fixed URL (the one network
// call a credentialed run makes outside aws, gh and skopeo), openssl and base64 hash it, and tar unpacks it
// into the folder. None writes anywhere but the CLI's folder and its tarball, before CLI_CHECK.
const HASH_LINE = `[ "sha512-$(openssl dgst -sha512 -binary "$RUNNER_TEMP/aws-cdk/aws-cdk.tgz" | base64 -w0)" = "$integrity" ] ||`
export const FETCH_TOOLS: Readonly<Record<string, string>> = {
  mkdir: 'mkdir "$RUNNER_TEMP/aws-cdk"',
  curl: `curl -q --fail --silent --show-error --proto '=https' --tlsv1.2 --max-time 300 --max-filesize 104857600 --output "$RUNNER_TEMP/aws-cdk/aws-cdk.tgz" "https://registry.npmjs.org/aws-cdk/-/aws-cdk-$pin.tgz"`,
  openssl: HASH_LINE,
  base64: HASH_LINE,
  tar: 'tar -xzf "$RUNNER_TEMP/aws-cdk/aws-cdk.tgz" -C "$RUNNER_TEMP/aws-cdk" --no-same-owner',
}
// The tools IMAGE_CHECK runs, each only on its own lines of that text and only in a run that is
// IMAGE_UNPACK_RUN whole: tar lists the archive and then unpacks it into the folder mkdir makes, reading it
// from its standard input each time (the redirection a read these lines hold), so it runs no decompressor,
// and find lists what it unpacked. None writes anywhere but that folder, before the credentials action.
export const IMAGE_TOOLS: Readonly<Record<string, readonly string[]>> = {
  tar: [
    'listing=$(tar --list --verbose --numeric-owner --quoting-style=escape --file - <"$1") ||',
    'tar --extract --file - --directory "$2" --no-same-owner --no-same-permissions <"$1"',
  ],
  mkdir: ['mkdir "$2"'],
  find: [String.raw`entries=$(find "$2" -mindepth 1 -printf '%y %P\n')`],
}
// The tools prod-plan's diffs alone run beyond the text tools, each only on its summary's diff line and only
// in a run that is DIFF_RUN or ROLLBACK_DIFF_RUN whole: tr makes each carriage return a line break and sed sets each line four spaces
// in, so the summary holds the diff as one indented code block; neither reads or writes a file.
export const DIFF_SUMMARY_LINE = String.raw`head -c 204800 "$DIFF" | tr '\r' '\n' | sed 's/^/    /'`
const DIFF_TOOLS: ReadonlySet<string> = new Set(['tr', 'sed'])
const DIFF_RUNS: readonly string[] = [DIFF_RUN, ROLLBACK_DIFF_RUN]
// openssl also makes the stop token (STOP_COMMANDS), on that line of STOP_HEAD alone, at a run's start: it
// only prints random bytes.
export const STOP_TOKEN_LINE = 'stop_token=$(openssl rand -hex 16)'
const STOP_TOKEN_AT = STOP_HEAD.split('\n').indexOf(STOP_TOKEN_LINE)
// The lines on which the canonical texts run their plain tools, or read a file by a redirection outside a line
// above (the seventh review's third attack): grep and wc count the image's listing and its unpacked entries
// and keep a one-off's log lines that match its pattern, readlink and realpath resolve the CLI's paths and a
// file asset's, git asks whether one commit is an ancestor of another, node runs prod-gate's history.ts,
// sort sorts the running digests, sleep waits for main's CI, mktemp and cd make and enter CDK_FOLDER's folder,
// cd and pwd find an assembly's root, and tee reads prod-gate's ignored lines into the summary. Each runs only
// the program it names (node only history.ts, which the owner's read holds), writes only the summary or
// prod-gate's own file of ignored lines, and reads only the file it names.
export const TEXT_TOOL_LINES = (): ReadonlyArray<readonly [string, string]> => [
  [
    String.raw`[ "$(grep -Ec '^(-[-rwxsStT]{9} [0-9]+/[0-9]+ +[0-9]+ [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} (oci-layout|index\.json|blobs/sha256/[0-9a-f]{64})|d[-rwxsStT]{9} [0-9]+/[0-9]+ +0 [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} blobs/(sha256/)?)$' <<<"$listing")" = "$(wc -l <<<"$listing")" ] ||`,
    IMAGE_CHECK,
  ],
  [
    String.raw`[ "$(grep -Ec '^(f (oci-layout|index\.json|blobs/sha256/[0-9a-f]{64})|d blobs(/sha256)?)$' <<<"$entries")" = "$(wc -l <<<"$entries")" ] ||`,
    IMAGE_CHECK,
  ],
  [`shown=$(jq -r '.[]' <<<"$log" | grep -E "$lines" || true)`, ONE_OFF],
  [
    `withheld=$(jq --argjson shown "$(printf '%s' "$shown" | grep -c '^' || true)" 'length - $shown' <<<"$log" || true)`,
    ONE_OFF,
  ],
  ['case "$(readlink -f "$RUNNER_TEMP/aws-cdk/package/bin/cdk")" in', CLI_CHECK],
  ['"$(readlink -f "$RUNNER_TEMP/aws-cdk/package")"/*) ;;', CLI_CHECK],
  ['case "$(realpath -m -- "$dir/$path")" in', ASSET_CHECK],
  ['root=$(cd "$1" && pwd -P)', ASSET_CHECK],
  ['is_ancestor() { git merge-base --is-ancestor "$1" "$2" 2>/dev/null; }', AWS_CHECK],
  [
    'if [ "$newest" != null ] && ! git merge-base --is-ancestor "$(jq -r .commit <<<"$newest")" "$GITHUB_SHA"; then',
    FAST_RECHECK_NONPROD,
  ],
  [
    'if [ "$newest" != null ] && ! git merge-base --is-ancestor "$(jq -r .commit <<<"$newest")" "$GITHUB_SHA"; then',
    FAST_RECHECK_PROD,
  ],
  [sh`running=$(printf '%s\n' "$\{digests[@]}" | sort -u)`, AWS_CHECK],
  ['sleep 30', MAIN_CI],
  [
    'if ! OUT=$(node infra/scripts/deploy/history.ts prod-gate --mode "$MODE" --target "$TARGET" --sha "$SHA" --commit "$COMMIT" --digest "$DIGEST" --record-id "$CURRENT_PROD_ID" --build-digest "$BUILD_DIGEST" --nonprod-digest "$NONPROD_DIGEST" --records "$RUNNER_TEMP/records" 2>"$RUNNER_TEMP/prod-gate-ignored.txt"); then',
    PROD_GATE_CALL,
  ],
  ['tee -a "$GITHUB_STEP_SUMMARY" <"$RUNNER_TEMP/prod-gate-ignored.txt" >&2', PROD_GATE_CALL],
  ['cd "$(mktemp -d)" && HOME="$(mktemp -d)" && export HOME', CDK_FOLDER],
]
// Where the tests find each line above standing whole, trimmed, in its canonical text.
export const TOOL_LINE_TEXTS = (): ReadonlyArray<readonly [string, string]> => [
  ...TEXT_TOOL_LINES(),
  [MASK_LINE, PREAMBLE],
  [FIND_LINE, ASSET_CHECK],
  [CLI_FIND_LINE, CLI_CHECK],
  [KEY_HASH_LINE, ASSET_CHECK],
  ...Object.values(FETCH_TOOLS).map(line => [line, CLI_FETCH] as const),
  ...Object.values(IMAGE_TOOLS).flatMap(lines => lines.map(line => [line, IMAGE_CHECK] as const)),
  [DIFF_SUMMARY_LINE, DIFF_RUN],
  [STOP_TOKEN_LINE, STOP_COMMANDS],
  ...PREAMBLE_RUNNERS.map(line => [line, PREAMBLE] as const),
]
const AWS_CALLS =
  /^\s+(?:ecs\s+(?:run-task|describe-tasks|describe-services|list-tasks|stop-task|wait\s+tasks-stopped|describe-task-definition)|elbv2\s+describe-(?:target-groups|target-group-attributes|target-health|load-balancers|load-balancer-attributes)|cloudformation\s+describe-stacks|ecr\s+(?:describe-images|get-login-password)|logs\s+get-log-events)(?:\s|$)/
const NO_FLAG = (command: ShellCommand) => !/(?:^|\s)[-+][A-Za-z]/.test(command.tail)
const TOOL_USES: Readonly<Record<string, (command: ShellCommand, raw: string) => boolean>> = {
  git: ({ rest }) => /^\s+merge-base\s+--is-ancestor\s/.test(rest),
  gh: ({ rest }) => /^\s+api\s/.test(rest),
  sed: (_, raw) => raw === MASK_LINE,
  find: (_, raw) => raw === FIND_LINE || raw === CLI_FIND_LINE,
  sha256sum: (_, raw) => raw === KEY_HASH_LINE,
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
// The names by which jq reaches past its input and its own program: the environment (env, $ENV), files and
// other inputs, its own arguments and location, modules (import, include) and stderr (debug, stderr, halt).
// No glue program names one but as an object's key, binds or defines one, so neither a definition (def env:
// …, which would shadow nothing it may not call) nor a binding (as $ENV) ever stands in for the builtin.
const JQ_REACH_NAMES =
  /^(?:ENV|env|inputs?|input_filename|input_line_number|__loc__|__prog_args|import|include|modulemeta|get_search_list|get_prog_origin|get_jq_origin|debug|stderr|halt_error|halt)$/
// Whether a jq program holds only strings with no interpolation, fields, keys, its own definitions, the
// variables bound to it (given, or by as or a definition's parameters) and JQ_WORDS: no comment, format (@sh)
// or other word. The definitions and bindings are read from the program's tokens, after its strings, so a
// string that reads like one ("def include:", "as $ENV") defines and binds nothing (the ninth review's first
// attack: a string counted as a definition let jq's own include load a module from the checkout, and env read
// a credential); and no name jq reaches past its input by (JQ_REACH_NAMES) is called, defined or bound.
export function jqProgramIsHeld(program: string, given: readonly string[]): boolean {
  const tokens: string[] = []
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
    tokens.push(token)
  }
  const code = tokens.filter(token => !/^\s/.test(token))
  const bound = new Set(given)
  const defined = new Set<string>()
  code.forEach((token, n) => {
    const next = code[n + 1] ?? ''
    if (token === 'as' && next.startsWith('$')) bound.add(next.slice(1))
    if (token !== 'def' || !/^[A-Za-z_]\w*$/.test(next)) return
    defined.add(next)
    if (code[n + 2] !== '(') return
    for (let p = n + 3; p < code.length && code[p] !== ')'; p++) {
      if (code[p]?.startsWith('$')) bound.add(code[p]?.slice(1) ?? '')
    }
  })
  if ([...bound, ...defined].some(name => JQ_REACH_NAMES.test(name))) return false
  let previous = ''
  let at = 0
  // The brackets open where each token stands: a name is an object's key only straight inside braces, after
  // the { or a , there and before a :, since inside [ ] or ( ) the same name and colon are a slice's start
  // (.[0, env:1] evaluates env, halt or debug there; the ninth review's second attack).
  const open: string[] = []
  for (const token of tokens) {
    at += token.length
    if (/^\s/.test(token)) continue
    if (token === '{' || token === '[' || token === '(') open.push(token)
    if (token === '}' || token === ']' || token === ')') open.pop()
    if (token.startsWith('$') && !bound.has(token.slice(1))) return false
    if (/^[A-Za-z_]/.test(token)) {
      const key = open.at(-1) === '{' && (previous === '{' || previous === ',') && /^\s*:/.test(program.slice(at))
      if (JQ_REACH_NAMES.test(token) && !key) return false
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
// jq given its flags, then one program (single-quoted, or . alone) and no file to read; no word of which
// expands to several ("${NAME[@]}" as an --arg's value hands jq each element as a word, a program among them;
// the ninth review's second attack); and, given -e, a program that prints one value, fed by no pipe unless it is
// also given -n (JQ_PIPED_RULE, round 12); and, given -n, fed nothing at all, by a pipe, a here-string or a
// redirection, which it would never read (JQ_UNREAD_RULE, round 12's fourth iteration, its second pass).
export function jqIsHeld(args: readonly ShellWord[], piped = false, fed = false): boolean {
  if (args.some(manyWords)) return false
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
  const flags = args.slice(0, i).filter(arg => JQ_FLAGS.includes(arg.raw))
  const status = flags.some(arg => arg.raw.includes('e'))
  const noInput = flags.some(arg => arg.raw.includes('n'))
  if (noInput && fed) return false
  return jqProgramIsHeld(program, given) && (!status || (jqPrintsOne(program) && (!piped || noInput)))
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
// the run's own ids. No own line sets a name they read, or one the read-back builds one from, but by the
// commands AWS_VALUE_LINES writes, and no other word holds an expansion, so neither a value the CLI loads from a file
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
// The names those words read that a run's own lines could set, which no own line sets but by the commands
// AWS_VALUE_LINES writes (TOKEN on the lines DPW-06 pins, a literal and the run's ids). STAGE is the job's env
// and the GITHUB_ names the runner's, which no own line sets either (SETS_INPUT, the loader names).
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
// AWS_VALUE_WORDS, whole; and one value after each option but a list's (awsValueTaken()).
function awsIsHeld(args: readonly ShellWord[]): boolean {
  if (!AWS_CALLS.test(` ${argText(args)}`)) return false
  let option = ''
  let values = 0
  return args.slice(2).every(arg => {
    const value = wordSkeleton(arg.raw)
    if (value === undefined) return false
    if (value.startsWith('-')) {
      option = arg.raw
      values = 0
      return arg.raw === value && AWS_OPTIONS.includes(arg.raw)
    }
    if (!awsValueTaken(option, ++values, value)) return false
    if (/:\/\/|@=/.test(value) || /^(?:file|fileb|https?):/i.test(value)) return false
    return !value.includes('\0') || AWS_VALUE_WORDS.includes(arg.raw)
  })
}
// Whether aws takes a word as the given option's value, the count-th after it: the first after any option,
// and a later one only after a list option the workflow hands several (--services, --names, --tasks), and
// then only a word that starts with no expansion. argparse refuses an option with no value, so an expansion
// that makes the one value after an option into an option stops the call; but after a value, one that does
// is read as an option of its own (the seventh review's fourth attack, where "$where" "$endpoint" after
// --stack-name's value handed aws --endpoint-url).
const AWS_LIST_OPTIONS = ['--services', '--names', '--tasks']
const awsValueTaken = (option: string, count: number, read: string) =>
  option !== '' && (count === 1 || (AWS_LIST_OPTIONS.includes(option) && !read.startsWith('\0')))
// aws in a canonical text (DPW-10; the seventh review's third attack, where an aws line in AWS_CHECK took
// --endpoint-url and sent the deploy role's signed request elsewhere, since no rule read a canonical text's aws
// options): one of the calls the workflow makes (AWS_CALLS) but the registry password, which only the push's own
// line asks for, written plainly; then each option written plainly, from AWS_OPTIONS and the one-offs' and the log's
// own (--task, --reason, --overrides, --log-group-name, --log-stream-name, --next-token and the flag
// --start-from-head), so never --endpoint-url, --no-verify-ssl, --ca-bundle, --profile, --debug, --cli-input-json or
// another that sends the request elsewhere, reads a file or prints the signed request; and each value after an
// option, as aws reads it, with no scheme (file://, fileb://, https://) or shorthand file load (key@=), and no word
// bash splits, globs or expands by a tilde (wordSplits()) and no expansion of more than one word but PROBE's
// "${TASK_ARNS[@]}" (an array or "$@" would hand aws each of its words, an option among them), and one value after
// each option but a list's, whose later values start with no expansion (awsValueTaken()), so no value becomes
// another option as it runs: an expansion that makes the one value after an option into an option leaves that option
// with none, which argparse refuses. What a value's variable holds is the text's own: AWS's answers and the job's
// env in every text the guard writes (TASK_ARNS from list-tasks' answer, by mapfile).
const AWS_TEXT_OPTIONS = [
  ...AWS_OPTIONS,
  '--task',
  '--reason',
  '--overrides',
  '--log-group-name',
  '--log-stream-name',
  '--next-token',
]
const AWS_TEXT_FLAGS = ['--start-from-head']
// The words an aws value in a canonical text may hold an expansion in, each exactly as the texts write it (the ninth
// review's first attack, where a value written "$group", set from a stack output no text checked, handed aws-cli a
// file:// to load and send): a name a text builds from the stage, its own loop or a literal call (stage, STAGE,
// kind, ROLE, PART), the run's own ids, a digest AWS_CHECK checks, and the names a text shape-checks or builds
// itself before aws reads them (CLUSTER, the definitions, the networks, the token, the overrides, td, task and
// TASK_ARNS from ECS's answers, and cursor, the log's forward token, from its own read). A value from an AWS answer
// reaches aws only after the text holds it to its shape (td to its stage's three service families, since the tenth
// review's first attack, where AWS_CHECK's loop read td from the Services stack's outputs), so a new one joins this
// list with that check, in the same change, and each name is set only on its text's own lines (AWS_NAMES,
// awsNameLines()).
const AWS_TEXT_VALUE_WORDS = [
  '"imageDigest=$2"',
  sh`"imageDigest=$\{digests[0]}"`,
  '"Hearth-$stage-Services"',
  '"hearth-$stage"',
  '"hearth-$stage-api"',
  '"hearth-$stage-realtime"',
  '"hearth-$stage-worker"',
  '"$td"',
  '"Hearth-$STAGE-Tasks"',
  '"Hearth-$STAGE-$PART"',
  '"$CLUSTER"',
  '"$task"',
  '"/hearth/$STAGE/$kind"',
  sh`"$kind/server/$\{task##*/}"`,
  '"hearth-$STAGE-$ROLE"',
  sh`"$\{TASK_ARNS[@]}"`,
  `"${TARGETS_QUERY}"`,
  '"$PROBE_TD"',
  '"$NET_PROBE"',
  '"gha-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"',
  '"$TOKEN"',
  '"$OVERRIDES"',
  '"$cursor"',
]
// An expansion bash makes into as many words as it holds: "$@", "$*", "${@…}", "${*…}" and an array's [@] or [*],
// outside single quotes (a jq program's own text is no expansion).
const MANY_WORDS = /\$[@*]|\$\{[@*]|\[[@*]\]/
const expandsToMany = (word: string) => MANY_WORDS.test(word.replace(/'[^']*'?/g, ''))
function awsTextHeld(words: readonly string[]): boolean {
  const call = words[1] === 'wait' ? 3 : 2
  const head = words.slice(0, call).join(' ')
  if (!AWS_CALLS.test(` ${head}`) || /^ecr\s+get-login-password$/.test(head) || words.some(wordSplits)) return false
  if (words.some(word => expandsToMany(word) && word !== sh`"$\{TASK_ARNS[@]}"`)) return false
  let option = ''
  let values = 0
  return words.slice(call).every(word => {
    const read = wordAsRead(word)
    if (read.startsWith('-')) {
      option = AWS_TEXT_FLAGS.includes(word) ? '' : word
      values = 0
      return word === read && (AWS_TEXT_FLAGS.includes(word) || AWS_TEXT_OPTIONS.includes(word))
    }
    return (
      awsValueTaken(option, ++values, read) &&
      !/:\/\/|@=/.test(read) &&
      !/^(?:file|fileb|https?):/i.test(read) &&
      (!read.includes('\0') || AWS_TEXT_VALUE_WORDS.includes(word))
    )
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
  CDK_DIFF_DOWN,
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
  // A jq reads a here-string of its own, or else its standard input, which counts as a pipe's whatever feeds it
  // (round 12's third iteration: a group or a function after a pipe holds a jq that no previous command feeds).
  jq: ({ args, previous, redirections }) =>
    jqIsHeld(
      args,
      previous !== undefined || !redirections.some(each => each.op === '<<<'),
      previous !== undefined || redirections.some(each => each.op.startsWith('<')),
    ),
  gh: ({ args }) => ghIsHeld(args),
  // The step's own files: the pushed digest and prod-plan's diff.
  cat: ({ args }) => argText(args) === '"$RUNNER_TEMP/pushed"' || argText(args) === '"$DIFF"',
  head: ({ args }) => argText(args) === `-c ${DIFF_CUT} "$DIFF"`,
  // prod-plan's diff into its summary as an indented code block: each carriage return a line break, then
  // each line four spaces in, piped from the diff's head.
  tr: ({ args, previous }) => argText(args) === String.raw`'\r' '\n'` && previous === 'head',
  sed: ({ args, previous }) => argText(args) === "'s/^/    /'" && previous === 'tr',
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
  ['artifact_named', [...new Set(Object.values(ARTIFACT_CALLS).flat())]],
  ['one_off_end', ['one_off_end migrate "$MIGRATE_LINES" "$RUN"']],
  ['aws_check', ['aws_check drill', 'aws_check "$MODE"', 'aws_check auto', 'aws_check restore']],
  ['plan_basis', ['plan_basis plan', 'plan_basis check']],
  ['check_image_archive', ['check_image_archive "$RUNNER_TEMP/image/image.tar"']],
  ['unpack_image', [`unpack_image "$RUNNER_TEMP/image/image.tar" "${IMAGE_LAYOUT}"`]],
  ['check_assembly', [ASSET_CHECK_CALLS[0]]],
  ['check_release_in', [ASSET_CHECK_CALLS[1]]],
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
// Where a call of a canonical text's function, or of a record job's own, stands (the seventh review's second
// attack, where a check called as CHECKED=$(check_assembly …) || echo "$CHECKED" refused only in the
// substitution's subshell, and the || went on): alone (GlueCommand's alone) and outside any substitution, so
// the check's refusal, an exit 1 or a failure set -e ends the step on, ends the step; but release_payload,
// which stands as the whole substitution of PAYLOAD=$( … ), an assignment that stands alone, whose failure
// set -e still ends the step on. What reaches the call (an if around it, an exit before it) is the run's
// own text, pinned whole, which the owner reads.
function standsAlone(command: GlueCommand, commands: readonly GlueCommand[]): boolean {
  if (command.name === 'release_payload') {
    return (
      command.substituted &&
      command.next === undefined &&
      commands.some(
        outer =>
          outer.name === undefined &&
          outer.line === command.line &&
          outer.alone &&
          !outer.inSubstitution &&
          outer.raw === `PAYLOAD=$(${command.raw})`,
      )
    )
  }
  return command.alone && !command.substituted && !command.inSubstitution
}
// Whether a command a credentialed or record job's own lines run is held to its uses: GLUE_USES's, the
// table's own, or a function's call as calls names it, standing where standsAlone() holds it.
function glueIsHeld(
  command: GlueCommand,
  calls: ReadonlyMap<string, readonly string[]>,
  commands: readonly GlueCommand[],
  diffRun = false,
): boolean {
  const name = command.name
  const redirections = command.redirections.every(({ op, target }) =>
    op === '<'
      ? target?.raw === DIFF_TARGET
      : op.startsWith('<') || op.includes('&') || writable(target?.raw ?? '', diffRun),
  )
  if (name === undefined) return redirections
  if (!redirections || command.assignments.length > 0) return false
  // A word bash hands on as several only to aws, through run or get, whose hold reads each as the list
  // option's values (AWS_VALUE_WORDS): to any other command each element would be a word of its own, a flag
  // or a program among them (the ninth review's second attack).
  if (name !== 'run' && name !== 'get' && command.args.some(manyWords)) return false
  const use = GLUE_USES[name]
  if (use !== undefined) return use(command)
  if (TABLE_HELD.includes(name)) return true
  return calls.get(name)?.includes(command.raw) === true && standsAlone(command, commands)
}
const HELD =
  'gives each command its own lines run only the flags and arguments the workflow uses (GLUE_USES), no assignment before it, and no file to read but the diff or to write but its outputs, its summary, the diff and /dev/null, so none runs code, reads a file the guard can’t see or writes one; and calls each check standing alone, outside any substitution, pipeline, negation, and-or list or condition, so its refusal ends the step'
// The names a command on a run's own lines sets: its assignments, a for loop's variable, mapfile's array
// and local's names.
const namesSet = (command: GlueCommand): string[] => [
  ...command.assignments.map(each => each.name),
  ...(command.variable === undefined ? [] : [command.variable]),
  ...(command.name === 'mapfile' ? [command.args[1]?.raw ?? ''] : []),
  ...(command.name === 'local' ? command.args.map(arg => arg.raw) : []),
]
// The names each canonical text sets, read on its code view (quoted text blanked): its assignments, its
// locals, its for loops' variables, its arrays read by mapfile or read, and printf -v's names, each a plain word
// (printfHeld(); TASKS_OUTPUTS sets MIGRATE_TD and PROBE_TD by a literal assignment for each kind).
const NAMES_SET_BY = keptByText((text: string): readonly string[] => {
  const names = new Set<string>()
  for (const line of shellViews(text).code.split('\n')) {
    for (const match of line.matchAll(/\bprintf\s+-v\s+([A-Za-z_]\w*)/g)) names.add(match[1] ?? '')
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
// Every name an aws value reads (AWS_VALUE_NAMES), and every name the read-back builds one from (ARNS, which
// TASK_ARNS is read from, and TARGET_GROUPS and GROUP, which GROUP_ARN is), is set on a run's own lines only by
// the commands written here, each as the workflow writes it (a for loop by its first line): the release's
// DIGEST from the job's own env, migrate's network, TOKEN on the lines DPW-06 pins, and the read-back's tasks,
// target groups, load balancer and roles from AWS's answers to the calls that name them (ECS's list-tasks,
// ELB's describe-target-groups and describe-load-balancers by the stage's names), never from a stack's
// outputs, which the release writes; a name a canonical text sets (CLUSTER, the task definitions) never on an
// own line. A pinned run doesn't vouch for its own setters (the ninth review's second attack, where the
// read-back and its pin, changed together, read the load balancer, a target group or the tasks from the
// Services stack's outputs, and a file:// output had aws-cli load a runner file and send it): a new setter
// joins this list in the same change, which the owner reads as a rule's change.
const AWS_VALUE_LINES: ReadonlyMap<string, readonly string[]> = new Map([
  ...AWS_VALUE_NAMES.map((name): [string, readonly string[]] => [name, []]),
  [
    'TOKEN',
    (['migrate', 'probe'] as const).flatMap(kind =>
      (['nonprod', 'prod'] as const).flatMap(stage =>
        (['deploy', 'rollback'] as const).map(job => tokenLine(kind, stage, job)),
      ),
    ),
  ],
  ['NET_MIGRATE', [NET_JQ.migrate]],
  ['DIGEST', ['DIGEST=$GATE_DIGEST', 'DIGEST=$BUILD_DIGEST']],
  ['ROLE', ['for ROLE in api realtime worker; do', 'for ROLE in api realtime; do']],
  [
    'ARNS',
    [
      `ARNS=$(get aws ecs list-tasks --cluster "hearth-$STAGE" --service-name "hearth-$STAGE-$ROLE" --desired-status RUNNING --query 'taskArns' --output json)`,
    ],
  ],
  ['TASK_ARNS', [`mapfile -t TASK_ARNS < <(jq -r '.[]' <<<"$ARNS")`]],
  [
    'TARGET_GROUPS',
    [
      `TARGET_GROUPS=$(get aws elbv2 describe-target-groups --names "hearth-$STAGE-api" "hearth-$STAGE-realtime" --query 'TargetGroups[].{name: TargetGroupName, arn: TargetGroupArn, path: HealthCheckPath}' --output json)`,
    ],
  ],
  [
    'GROUP',
    [`GROUP=$(jq -ec --arg name "hearth-$STAGE-$ROLE" 'first(.[] | select(.name == $name))' <<<"$TARGET_GROUPS")`],
  ],
  ['GROUP_ARN', [`GROUP_ARN=$(jq -r '.arn' <<<"$GROUP")`]],
  [
    'BALANCER',
    [
      `BALANCER=$(get aws elbv2 describe-load-balancers --names "hearth-$STAGE" --query 'LoadBalancers[0].LoadBalancerArn' --output text)`,
    ],
  ],
])
// A command as AWS_VALUE_LINES names it: a for loop by its first line, any other whole.
const setterText = (command: GlueCommand) => (command.name === 'for' ? (command.raw.split('\n')[0] ?? '') : command.raw)
// Whether a run's own lines set an input its pinned lines read (DPW-10, DPW-13): a name its step's or its
// job's env: sets, one a canonical text standing in the run sets, one ASSIGNED_ONLY_BY names on any line
// but its own, or one AWS_VALUE_LINES names by any command but its own.
function setsAnInput(run: string, read: ShellRead, env: readonly string[]): boolean {
  const canonical = new Set(canonicalPlaces(run).flatMap(place => NAMES_SET_BY(place.text)))
  const onlyOn = (lines: readonly string[] | undefined, raw: string) => lines !== undefined && !lines.includes(raw)
  return read.commands.some(command =>
    namesSet(command).some(
      name =>
        env.includes(name) ||
        canonical.has(name) ||
        onlyOn(ASSIGNED_ONLY_BY.get(name), command.raw) ||
        onlyOn(AWS_VALUE_LINES.get(name), setterText(command)),
    ),
  )
}
// setsAnInput() over a run read by the table, for the guard's cases: a pinned run changed with its pin still
// sets an input by any setter AWS_VALUE_LINES doesn't write.
export const ownLinesSetAnInput = (run: string, env: readonly string[] = []) => setsAnInput(run, readShell(run), env)
const SETS_INPUT =
  "sets no variable its step's or its job's env: sets or a canonical text in its run sets, no name an aws value reads or the read-back builds one from but by the commands AWS_VALUE_LINES writes (the read-back's from AWS's answers, never a stack's outputs), REGISTRY and RUN only on their own lines and ACCOUNT_ID on none, so no line the guard holds is handed another input"
// The runs the guard pins whole (PINNED_RUNS), by their job and their step's name.
const PINNED_RUN_TEXTS: ReadonlyMap<string, string> = new Map(
  Object.entries(PINNED_RUNS()).flatMap(([id, pinned]) =>
    Object.entries(pinned).map(([name, { run }]): [string, string] => [`${id}\n${name}`, run]),
  ),
)
const pinnedRunOf = (id: string, step: WorkflowStep) => PINNED_RUN_TEXTS.get(`${id}\n${step.name ?? ''}`)
// The words no credentialed run names anywhere outside a comment, so no tool can be handed one to run (a
// find -exec, a sort --compress-program, a git alias, a trap's text, a variable): the interpreters and
// the downloaders. node is a word, so node_modules passes; a jq path (.source) and the push's docker://
// transport are data.
const RUNNER_WORDS =
  /(?<![\w.-])(?:node|nodejs|npx|tsx|ts-node|deno|bun|python[\d.]*|perl|ruby|php|bash|sh|zsh|dash|ksh|eval|source|curl|wget|make|docker(?!:\/\/))(?![\w-])/
// The variables that choose what a later command runs, where the CLI's assembly is read from or where an
// output is written, which no credentialed run or canonical text sets (but CDK_FOLDER's fresh HOME): PATH
// and the shell's own, the loaders', npm's, git's and gh's, the XDG folders git, gh and curl read their
// configuration from, and GitHub's and the runner's (RUNNER_TEMP, GITHUB_OUTPUT, GITHUB_WORKSPACE, …), and the
// folders a tilde stands for (~+ is PWD, ~- OLDPWD); and the files that set a later step's environment or path.
const LOADER_NAMES = String.raw`PATH|HOME|PWD|OLDPWD|BASH\w*|ENV|CDPATH|SHELLOPTS|PS4|PROMPT_COMMAND|TMPDIR|LD_\w+|NODE_\w+|NPM_\w+|npm_\w+|GIT_\w+|GH_\w+|GITHUB_\w+|RUNNER_\w+|XDG_\w+`
const LOADER_ASSIGNMENT = assigns(LOADER_NAMES)
const LOADER_NAME = new RegExp(`^(?:${LOADER_NAMES})$`)
const STEP_FILES = /\bGITHUB_(?:ENV|PATH)\b/
// What a credentialed run may write to: nothing but its outputs, its summary and /dev/null, and in
// prod-plan's two diff runs alone (DIFF_RUNS) the diff (DIFF, set by its one line and by no builtin, which
// HELD_NAMES holds), so no write these rules read rewrites a file the CLI or a tool then runs (the CLI
// CLI_FETCH unpacked, say), whatever a canonical text sets DIFF to. A write is any redirection that opens its
// target for writing: >, >>, >|, &>, a descriptor's (2>) and the read-write <> (1<>file, which rewrites the
// file in place). Only a > after < or >, or after the single & of &>, is the same write's; one after && is a write
// of its own (round 12's fourth iteration, its second pass: [ -n "$step" ] &&>"$f" emptied the CLI before
// prod-plan's diff, which then ran an empty file with status 0, and read as no write).
const REDIRECTION = /(?<![<>]|(?<!&)&)(?:\d+|&)?(?:<>|>>?\|?)\s*(\(|[^\s;|()<>]+)/g
const WRITABLE = /^(?:\/dev\/null|&[12]|"\$(?:GITHUB_OUTPUT|GITHUB_STEP_SUMMARY)")$/
const DIFF_TARGET = '"$DIFF"'
const writable = (target: string, diffRun: boolean) => WRITABLE.test(target) || (diffRun && target === DIFF_TARGET)
const DIFF_LINE = 'DIFF="$RUNNER_TEMP/diff.txt"'
// The canonical texts that define functions, and the lines on which a credentialed run sets a variable by
// printf -v, read, mapfile or for: the canonical texts' own, and the read-back's and the rollback jobs'
// two loops, whose variables choose nothing that runs. "$@" runs only inside the preamble's run and get.
const DEFINING_TEXTS = [
  PREAMBLE,
  IMAGE_CHECK,
  ASSET_CHECK,
  ARTIFACT_NAMES,
  AWS_CHECK,
  TASKS_OUTPUTS,
  ONE_OFF,
  NEWEST_RELEASE,
  PLAN_BASIS,
] as const
const SETTERS = ['read', 'mapfile', 'readarray', 'for', 'select', 'getopts']
const isSetter = (command: ShellCommand) =>
  SETTERS.includes(command.word) || (command.word === 'printf' && /(?:^|\s)-/.test(command.rest))
const SETTER_LINES: ReadonlySet<string> = new Set([
  ...[
    PREAMBLE,
    ASSET_CHECK,
    AWS_CHECK,
    TASKS_OUTPUTS,
    ONE_OFF,
    PROBE,
    NEWEST_RELEASE,
    RESTORE_DOWN,
    RESTORE_DOWN_DIFF,
    PLAN_BASIS,
  ].flatMap(text => {
    const lines = text.split('\n')
    return shellCommands(text)
      .filter(isSetter)
      .map(command => lines[command.line]?.trim() ?? '')
  }),
  'for ROLE in api realtime; do',
  'for RELEASE in "$COMMIT:$DIGEST" "$PREVIOUS_COMMIT:$PREVIOUS_DIGEST"; do',
])
// The preamble's run and get, written as they are (TOOL_LINE_TEXTS).
const PREAMBLE_RUNNERS = ['run() { "$@" 2>&1 | mask; }', 'get() { "$@" 2> >(mask >&2); }']

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
// variable that chooses what runs (BASH_ENV, PATH, NODE_OPTIONS) comes in unseen; every env:, every action
// step's with: and every job's outputs: is the guard's, whole, each a block mapping, and every step's id too
// (STEP_ENVS, STEP_WITHS, JOB_OUTPUTS, STEP_IDS below), so no checkout but synth's names a ref, synth's each
// check out their own commit into their own folder, and the gate's, prod-gate's and the smokes' check out into
// REPO_FOLDER; every job's if: and needs: and every action
// step's if: are the guard's, whole (JOB_IFS, JOB_NEEDS, ACTION_IFS), so no decision GitHub makes about
// running a job or an action is read only in part; and every job's steps are the guard's, in every job (JOB_STEPS), none of whose runs names a file
// command that hands a later step something (GITHUB_ENV, GITHUB_PATH, GITHUB_STATE).
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
  'ASSEMBLY_FOLDER',
  'ASSEMBLY_ID',
  'ATTEMPT',
  'BASIS',
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
  'IMAGE_DUE',
  'IMAGE_ID',
  'MODE',
  'NONPROD_DIGEST',
  'PREVIOUS',
  'PREVIOUS_COMMIT',
  'PREVIOUS_DIGEST',
  'PREVIOUS_DUE',
  'PREVIOUS_ID',
  'PLAN_ATTEMPT',
  'PLANNED',
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
// The artifact check's env: the job's token and repository, which gh reads, and the ids its downloads read, each
// from the same output (STEP_WITHS).
const ASSEMBLY_ID = expr('needs.synth.outputs.assembly')
const IMAGE_ID = expr('needs.build.outputs.image')
const previousId = (stage: Stage) => expr(`needs.synth-previous-${stage}.outputs.assembly`)
// Whether this run makes an artifact for a job's download, as the string true or false: the gate's condition
// for the artifact's upload (the build's job if:, the previous synth's upload if:) and the download's own if:
// but for its id, both from the gate's outputs alone, which no job that makes an artifact can change. An
// empty id passes ARTIFACT_NAMES only where this reads false.
const due = (condition: string) => expr(`${condition} && 'true' || 'false'`)
const DEPLOY_MODE = "needs.gate.outputs.mode == 'deploy'"
export const DUE_ENVS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  nonprod: { IMAGE_DUE: due(`needs.gate.outputs.build == 'true' && ${DEPLOY_MODE}`) },
  'prod-plan': { PREVIOUS_DUE: due(`needs.gate.outputs.previous_prod_commit != '' && ${DEPLOY_MODE}`) },
  prod: {
    IMAGE_DUE: due(`needs.gate.outputs.build == 'true' && ${DEPLOY_MODE} && needs.gate.outputs.target == 'prod'`),
  },
}
const deployEnvs = (stage: Stage): Readonly<Record<string, Readonly<Record<string, string>>>> => ({
  'The release this job deploys': RELEASE_ENV,
  [ARTIFACTS_STEP]: { ...GH_ENV, ASSEMBLY_ID, IMAGE_ID, ...DUE_ENVS[stage] },
  'Check the assembly': { RELEASE: RELEASE_OUTPUT, ASSEMBLY_FOLDER: 'assembly' },
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
  ...(stage === 'prod' ? { 'Take the restore stage down': { PLANNED: expr('needs.prod-plan.outputs.down') } } : {}),
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
  [ARTIFACTS_STEP]: { ...GH_ENV, PREVIOUS_ID: previousId(stage) },
  'Check the previous assembly': {
    PREVIOUS: PREVIOUS_OUTPUT,
    ASSEMBLY_FOLDER: 'assembly-previous',
    RELEASE: PREVIOUS_OUTPUT,
  },
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
    "Check the release's assembly": { RELEASE: expr('steps.synth.outputs.release'), ASSEMBLY_FOLDER: 'assembly' },
  },
  'synth-previous-nonprod': {
    "Synthesise nonprod's previous release": {
      COMMIT: gateOutput('previous_nonprod_commit'),
      DIGEST: gateOutput('previous_nonprod_digest'),
    },
    "Check nonprod's previous assembly": {
      RELEASE: previousRelease('nonprod'),
      ASSEMBLY_FOLDER: 'assembly-previous-nonprod',
    },
  },
  'synth-previous-prod': {
    "Synthesise prod's previous release": {
      COMMIT: gateOutput('previous_prod_commit'),
      DIGEST: gateOutput('previous_prod_digest'),
    },
    "Check prod's previous assembly": { RELEASE: previousRelease('prod'), ASSEMBLY_FOLDER: 'assembly-previous-prod' },
  },
  nonprod: deployEnvs('nonprod'),
  'smoke-nonprod': smokeEnv('nonprod', false),
  'rollback-nonprod': rollbackEnvs('nonprod'),
  'resmoke-nonprod': smokeEnv('nonprod', true),
  'record-nonprod': recordEnv('nonprod'),
  'prod-plan': {
    'The release this job deploys': RELEASE_ENV,
    [ARTIFACTS_STEP]: { ...GH_ENV, ASSEMBLY_ID, PREVIOUS_ID: previousId('prod'), ...DUE_ENVS['prod-plan'] },
    'Check the assembly': { RELEASE: RELEASE_OUTPUT, ASSEMBLY_FOLDER: 'assembly' },
    'Check the previous assembly': {
      PREVIOUS: previousRelease('prod'),
      ASSEMBLY_FOLDER: 'assembly-previous',
      RELEASE: previousRelease('prod'),
    },
    'Mask the account id': ACCOUNT_ENV,
    Diff: { MODE, RESTORE: gateOutput('restore') },
  },
  'prod-gate': {
    "Prod's release records": GH_ENV,
    "main's own CI": { ...GH_ENV, SHA: expr('github.sha') },
    'The environments are live as written': GH_ENV,
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
// Each action step's with:, by its job and its name, whole (DPW-10): which commit each checkout checks out
// and into which folder, which .nvmrc sets Node, which artifact each download fetches into which folder,
// what each upload sends and the credentials action's inputs. So no checkout of the gate, build, a deploy,
// rollback or smoke job, prod-plan or prod-gate names a ref (each checks out the run's commit, which the gate
// holds to main: the build's, a deploy's, a rollback's and prod-plan's into the workspace, the gate's,
// prod-gate's and the smokes' into REPO_FOLDER, below where their setup-node runs), and the three synths'
// check out exactly the release, nonprod's and prod's previous release, each into its own folder, one to a
// job, so no runner that makes an assembly runs a second commit's code: a ref added, dropped or pointed at
// another output (an input, a branch, a commit) or two folders swapped would have the gate plan by, or a
// synth build, another commit's code, under labels and checks that read only the env: (the pins read the
// folder by name).
const TEMP = `${expr('runner.temp')}/`
const CHECKOUT_FULL = { 'fetch-depth': '0', 'persist-credentials': 'false' }
const CHECKOUT_SHALLOW = { 'persist-credentials': 'false' }
const NODE_WITH = { 'node-version-file': '.nvmrc', 'package-manager-cache': 'false' }
const checkoutOf = (commit: string, folder: string) => ({
  ref: gateOutput(commit),
  path: folder,
  'persist-credentials': 'false',
})
const downloadOf = (ids: string, folder: string) => ({ 'artifact-ids': expr(ids), path: `${TEMP}${folder}` })
const uploadOf = (name: string) => ({
  name,
  path: `${TEMP}${name}`,
  'include-hidden-files': 'false',
  'retention-days': '14',
  'if-no-files-found': 'error',
})
const CHECKOUT_NAME = "Check out the run's commit"
const NODE_NAME = 'Node, from .nvmrc'
const deployWiths = (credentials: string) => ({
  [CHECKOUT_NAME]: CHECKOUT_FULL,
  'Download the assembly': downloadOf('needs.synth.outputs.assembly', 'assembly'),
  'AWS credentials': credentialsWith(credentials),
})
const rollbackWiths = (stage: Stage) => ({
  [CHECKOUT_NAME]: CHECKOUT_FULL,
  'Download the previous assembly': downloadOf(`needs.synth-previous-${stage}.outputs.assembly`, 'assembly-previous'),
  'AWS credentials': credentialsWith('AWS_DEPLOY_ROLE'),
})
const SMOKE_WITHS = {
  [CHECKOUT_NAME]: { ...CHECKOUT_FULL, path: REPO_FOLDER },
  [NODE_NAME]: { ...NODE_WITH, 'node-version-file': `${REPO_FOLDER}/.nvmrc` },
}
export const STEP_WITHS: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>> = {
  gate: SMOKE_WITHS,
  build: {
    [CHECKOUT_NAME]: CHECKOUT_SHALLOW,
    [NODE_NAME]: NODE_WITH,
    'Upload the image': {
      path: `${TEMP}image.tar`,
      archive: 'false',
      'retention-days': '14',
      'if-no-files-found': 'error',
    },
  },
  synth: {
    "Check out the release's commit": checkoutOf('commit', 'release'),
    [NODE_NAME]: { ...NODE_WITH, 'node-version-file': 'release/.nvmrc' },
    "Upload the release's assembly": uploadOf('assembly'),
  },
  'synth-previous-nonprod': {
    "Check out nonprod's previous release": checkoutOf('previous_nonprod_commit', 'previous-nonprod'),
    [NODE_NAME]: { ...NODE_WITH, 'node-version-file': 'previous-nonprod/.nvmrc' },
    "Upload nonprod's previous assembly": uploadOf('assembly-previous-nonprod'),
  },
  'synth-previous-prod': {
    "Check out prod's previous release": checkoutOf('previous_prod_commit', 'previous-prod'),
    [NODE_NAME]: { ...NODE_WITH, 'node-version-file': 'previous-prod/.nvmrc' },
    "Upload prod's previous assembly": uploadOf('assembly-previous-prod'),
  },
  nonprod: {
    ...deployWiths('AWS_DEPLOY_ROLE'),
    'Download the image': downloadOf('needs.build.outputs.image', 'image'),
  },
  'smoke-nonprod': SMOKE_WITHS,
  'rollback-nonprod': rollbackWiths('nonprod'),
  'resmoke-nonprod': SMOKE_WITHS,
  'prod-plan': {
    ...deployWiths('AWS_DIFF_ROLE'),
    [CHECKOUT_NAME]: CHECKOUT_SHALLOW,
    "Download prod's previous assembly": downloadOf('needs.synth-previous-prod.outputs.assembly', 'assembly-previous'),
  },
  'prod-gate': SMOKE_WITHS,
  prod: {
    ...deployWiths('AWS_DEPLOY_ROLE'),
    'Download the image': downloadOf('needs.build.outputs.image', 'image'),
  },
  'smoke-prod': SMOKE_WITHS,
  'rollback-prod': rollbackWiths('prod'),
  'resmoke-prod': SMOKE_WITHS,
}
const WITH =
  'gives its action exactly the inputs STEP_WITHS names, each its value: no checkout names a ref but the three synths’, one to a job, each its own commit into its own folder, the gate’s, prod-gate’s and the smokes’ check out into repo, and no download, upload, Node or credentials input is another'
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
  synth: { assembly: stepOutput('assembly', 'artifact-id') },
  'synth-previous-nonprod': { assembly: stepOutput('previous-nonprod', 'artifact-id') },
  'synth-previous-prod': { assembly: stepOutput('previous-prod', 'artifact-id') },
  nonprod: deployOutputs,
  'rollback-nonprod': rollbackOutputs,
  'prod-plan': {
    attempt: expr('github.run_attempt'),
    down: stepOutput('diff', 'down'),
    basis: stepOutput('diff', 'basis'),
  },
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
  synth: { 'Synthesise the release': 'synth', "Upload the release's assembly": 'assembly' },
  'synth-previous-nonprod': { "Upload nonprod's previous assembly": 'previous-nonprod' },
  'synth-previous-prod': { "Upload prod's previous assembly": 'previous-prod' },
  nonprod: { ...deployIds, ...markIds },
  'rollback-nonprod': rollbackIds,
  'prod-plan': { 'The release this job deploys': 'release', Diff: 'diff' },
  'prod-gate': { 'The prod gate': 'check' },
  prod: { ...deployIds, ...markIds },
  'rollback-prod': rollbackIds,
}
const IDS = "names each step's id as STEP_IDS does, so every output a job hands on is its pinned step's"
// Each job's needs:, in order, and its if:, whole (the gate has neither): the jobs it waits for and every
// clause GitHub decides it by, which are the bot test, the gate's verdicts (build, nonprod, prod and
// rollback_<env>), the jobs' results, the mode and target, and services_started. With every run's if:
// pinned with its run (PINNED_RUNS) and every action's here (ACTION_IFS), no if: in deploy.yml is read only
// in part: a clause dropped, added or changed (an automatic rollback the gate refused, or one after its
// release passed) or a need dropped, whose result and outputs an if: or env: would then read as '', is
// found whatever the rules that read single clauses (DPW-08, DPW-09) still pass.
const jobIf = (...clauses: readonly string[]) => expr([BOT_TEST, ...clauses].join(' && '))
const DEPLOY_OR_ROLLBACK = "(needs.gate.outputs.mode == 'deploy' || needs.gate.outputs.mode == 'rollback')"
export const JOB_IFS: Readonly<Record<JobId, string | undefined>> = {
  gate: undefined,
  build: jobIf("needs.gate.outputs.build == 'true'"),
  synth: jobIf(
    '!cancelled()',
    "needs.gate.result == 'success'",
    "(needs.build.result == 'success' || (needs.build.result == 'skipped' && needs.gate.outputs.build != 'true'))",
  ),
  'synth-previous-nonprod': jobIf('!cancelled()', "needs.gate.result == 'success'"),
  'synth-previous-prod': jobIf('!cancelled()', "needs.gate.result == 'success'"),
  nonprod: jobIf(
    '!cancelled()',
    "needs.synth.result == 'success'",
    "needs.synth-previous-nonprod.result == 'success'",
    "needs.gate.outputs.nonprod == 'true'",
  ),
  'smoke-nonprod': jobIf('!cancelled()', "needs.nonprod.result == 'success'"),
  'rollback-nonprod': jobIf(
    '!cancelled()',
    "needs.gate.outputs.rollback_nonprod == 'true'",
    "(needs.gate.outputs.mode == 'deploy' || needs.gate.outputs.mode == 'drill-smoke')",
    "needs.nonprod.outputs.services_started == 'true'",
    "(needs.smoke-nonprod.result == 'failure' || needs.nonprod.result == 'failure')",
  ),
  'resmoke-nonprod': jobIf('!cancelled()', "needs.rollback-nonprod.outputs.rolled == 'true'"),
  'record-nonprod': jobIf(
    '!cancelled()',
    "needs.gate.outputs.nonprod == 'true'",
    "needs.gate.outputs.mode != 'drill-break'",
    "(needs.nonprod.result == 'success' || needs.nonprod.result == 'failure')",
  ),
  'prod-plan': jobIf(
    '!cancelled()',
    "needs.synth.result == 'success'",
    "needs.synth-previous-prod.result == 'success'",
    "((needs.gate.outputs.target == 'prod' && ((needs.gate.outputs.mode == 'deploy' && needs.smoke-nonprod.result == 'success') || needs.gate.outputs.mode == 'rollback')) || (needs.gate.outputs.target == 'restore' && needs.gate.outputs.mode == 'deploy'))",
  ),
  'prod-gate': jobIf(
    '!cancelled()',
    "needs.gate.result == 'success'",
    DEPLOY_OR_ROLLBACK,
    "(needs.gate.outputs.target == 'prod' || needs.gate.outputs.target == 'restore')",
    "needs.prod-plan.result == 'success'",
  ),
  prod: jobIf(
    '!cancelled()',
    "needs.synth.result == 'success'",
    "needs.synth-previous-prod.result == 'success'",
    "needs.prod-gate.result == 'success'",
    DEPLOY_OR_ROLLBACK,
  ),
  'smoke-prod': jobIf('!cancelled()', "needs.prod.result == 'success'"),
  'rollback-prod': jobIf(
    '!cancelled()',
    "needs.gate.outputs.rollback_prod == 'true'",
    "needs.gate.outputs.target == 'prod'",
    "needs.gate.outputs.mode == 'deploy'",
    "needs.prod.outputs.services_started == 'true'",
    "(needs.smoke-prod.result == 'failure' || needs.prod.result == 'failure')",
  ),
  'resmoke-prod': jobIf('!cancelled()', "needs.rollback-prod.outputs.rolled == 'true'"),
  'record-prod': jobIf(
    '!cancelled()',
    "needs.gate.outputs.prod == 'true'",
    DEPLOY_OR_ROLLBACK,
    "(needs.prod.result == 'success' || needs.prod.result == 'failure')",
  ),
}
export const JOB_NEEDS: Readonly<Record<JobId, readonly string[]>> = {
  gate: [],
  build: ['gate'],
  synth: ['gate', 'build'],
  'synth-previous-nonprod': ['gate'],
  'synth-previous-prod': ['gate'],
  nonprod: ['gate', 'build', 'synth', 'synth-previous-nonprod'],
  'smoke-nonprod': ['gate', 'nonprod'],
  'rollback-nonprod': ['gate', 'build', 'synth-previous-nonprod', 'nonprod', 'smoke-nonprod'],
  'resmoke-nonprod': ['gate', 'rollback-nonprod'],
  'record-nonprod': ['gate', 'nonprod', 'smoke-nonprod', 'rollback-nonprod', 'resmoke-nonprod'],
  'prod-plan': ['gate', 'build', 'synth', 'synth-previous-prod', 'smoke-nonprod'],
  'prod-gate': ['gate', 'build', 'nonprod', 'smoke-nonprod', 'prod-plan'],
  prod: ['gate', 'build', 'synth', 'synth-previous-prod', 'nonprod', 'prod-plan', 'prod-gate'],
  'smoke-prod': ['gate', 'prod'],
  'rollback-prod': ['gate', 'build', 'synth-previous-prod', 'prod', 'smoke-prod'],
  'resmoke-prod': ['gate', 'rollback-prod'],
  'record-prod': ['gate', 'prod', 'smoke-prod', 'rollback-prod', 'resmoke-prod'],
}
// Each action step's if:, by its job and its name; a step not named runs under none (a run step's is
// pinned with its run).
const previousCommit = (stage: Stage) => expr(`needs.gate.outputs.previous_${stage}_commit != ''`)
const ASSEMBLY_DOWNLOAD = expr("needs.synth.outputs.assembly != ''")
export const ACTION_IFS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'synth-previous-nonprod': {
    "Check out nonprod's previous release": previousCommit('nonprod'),
    [NODE_NAME]: previousCommit('nonprod'),
    "Upload nonprod's previous assembly": previousCommit('nonprod'),
  },
  'synth-previous-prod': {
    "Check out prod's previous release": previousCommit('prod'),
    [NODE_NAME]: previousCommit('prod'),
    "Upload prod's previous assembly": previousCommit('prod'),
  },
  nonprod: {
    'Download the assembly': ASSEMBLY_DOWNLOAD,
    'Download the image': expr("needs.build.outputs.image != '' && needs.gate.outputs.mode == 'deploy'"),
  },
  'rollback-nonprod': {
    'Download the previous assembly': expr("needs.synth-previous-nonprod.outputs.assembly != ''"),
  },
  'prod-plan': { 'Download the assembly': ASSEMBLY_DOWNLOAD, "Download prod's previous assembly": PLAN_PREVIOUS_IF },
  prod: {
    'Download the assembly': ASSEMBLY_DOWNLOAD,
    'Download the image': expr(
      "needs.build.outputs.image != '' && needs.gate.outputs.mode == 'deploy' && needs.gate.outputs.target == 'prod'",
    ),
  },
  'rollback-prod': {
    'Download the previous assembly': expr("needs.synth-previous-prod.outputs.assembly != ''"),
  },
}
const JOB_IF =
  "runs under the if: JOB_IFS names, whole (the gate under none): no clause GitHub decides it by (the bot test, a gate's verdict, a job's result, the mode or target, services_started) dropped, added or changed"
const JOB_NEED =
  "needs exactly the jobs JOB_NEEDS names, in order: none dropped, whose result and outputs an if: or env: would read as '', and none added"
const ACTION_IF = 'runs its action under the if: ACTION_IFS names, whole (none where it names none)'
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
  [ARTIFACTS_STEP],
  ['Download the assembly', 'actions/download-artifact'],
  ['Download the image', 'actions/download-artifact'],
  ['Check and unpack the image'],
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
  [ARTIFACTS_STEP],
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
  ],
  'synth-previous-nonprod': [
    ["Check out nonprod's previous release", 'actions/checkout'],
    NODE_STEP,
    ...synthSteps("nonprod's previous release", "nonprod's previous assembly"),
  ],
  'synth-previous-prod': [
    ["Check out prod's previous release", 'actions/checkout'],
    NODE_STEP,
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
    [ARTIFACTS_STEP],
    ['Download the assembly', 'actions/download-artifact'],
    ["Download prod's previous assembly", 'actions/download-artifact'],
    ['Check the assembly'],
    ['Check the previous assembly'],
    ...CLI_STEPS,
    ['Diff'],
    ['Diff the rollback'],
  ],
  'prod-gate': [
    CHECKOUT_STEP,
    NODE_STEP,
    ["Prod's release records"],
    ["main's own CI"],
    ['The environments are live as written'],
    ['The prod gate'],
  ],
  prod: deploySteps('prod'),
  'smoke-prod': SMOKE_STEPS,
  'rollback-prod': ROLLBACK_STEPS,
  'resmoke-prod': SMOKE_STEPS,
  'record-prod': [['Write the record']],
}
const ONE_CHECKOUT =
  "checks out one commit at most, so no runner that synthesises an assembly, or reads one, runs a second commit's code"
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
// The CDK CLI's yargs reads every variable in its environment whose name starts with CDK as the option the
// rest of its name spells (yargs.env("CDK"), whose parser takes any name with that prefix, underscore or not:
// CDK_BUILD and CDKBUILD as --build, a shell command it runs with the job's environment, CDK_PLUGIN and
// CDKPLUGIN as --plugin, a module it loads, CDKroleArn as --role-arn), so no env: names one, in any letter
// case, and no credentialed run names a word that starts with CDK and goes on (but "$CDK", the CLI's path) but
// the preamble's export of the two that turn its telemetry and version check off (round 11).
const CDK_VARIABLE = /^cdk/i
const CDK_WORD = /(?<![\w$])cdk\w/i
const PREAMBLE_CDK_EXPORT = 'export CDK_DISABLE_CLI_TELEMETRY=true CDK_DISABLE_VERSION_CHECK=true'
const CDK_ENV =
  "names no variable whose name starts with CDK, which the CDK CLI reads as the option the rest of its name spells (CDK_BUILD or CDKBUILD as --build, CDK_PLUGIN or CDKPLUGIN as --plugin), but the preamble's export of its telemetry and version check"

// GitHub reads steps.<id>.outputs.<key> naming no step of its job (or none before the step reading it) or a key
// that step never writes, and needs.<job>.<property> naming a job the reader doesn't need or an output that job
// doesn't hand on, as an empty string, with no error (its contexts reference). So a step's id, a job's output or
// a run's key renamed with the table that pins it (STEP_IDS, JOB_OUTPUTS, PINNED_RUNS) left every expression that
// read the old name reading '': the deploy jobs' services_started, and with it the pipeline's rollback, the
// rollback jobs' rolled, with their resmoke and record, and the read-back (round 12). So in deploy.yml every
// steps.<id> a job's outputs: reads names a step of that job, and one a step's if:, env: or with: reads a step
// before it, and for an output one that writes the key (a code line of a run opening a written value with <key>=,
// after a quote or a printf \n, never a comment's or a longer key's, the gate's plan and
// prod-gate's call printing their job's outputs, as history.ts does and its tests hold, and upload-artifact its
// artifact-id); no other key of a job reads a step; and every needs.<job> names a job in its needs: and that job's
// result or one of its outputs:.
const ACTION_OUTPUTS: Readonly<Record<string, readonly string[]>> = { 'actions/upload-artifact': ['artifact-id'] }
const PRINTED_OUTPUTS: Readonly<Record<string, Readonly<Record<string, () => readonly string[]>>>> = {
  gate: { plan: () => Object.keys(JOB_OUTPUTS.gate ?? {}) },
  'prod-gate': { check: () => ['current_prod_id'] },
}
const BINDING =
  "reads steps.<id> only from a step of its job (one before it, for a step) and an output only one that step writes, and needs.<job> only from a job it needs and only its result or outputs, since GitHub reads any other as ''"
const STEP_READ = /\bsteps\.([\w-]+)(?:\.([\w-]+)(?:\.([\w-]+))?)?/g
// A line's own write to the output file: a redirection or tee -a to "$GITHUB_OUTPUT".
const TO_OUTPUT = /(?:>>?|\btee\s+-a)\s*"\$GITHUB_OUTPUT"/
const NEEDS_READ = /\bneeds\.([\w-]+)(?:\.([\w-]+)(?:\.([\w-]+))?)?/g
const outputKeys = (job: WorkflowJob) => {
  const value = blockValue(job.keys.get('outputs') ?? [])
  return isMap(value) ? [...value.keys()] : []
}
function bindingFindings(jobs: ReadonlyMap<string, Job>, add: (where: string, rule: string) => void): void {
  const outputsOf = new Map([...jobs.values()].map(({ id, job }) => [id, outputKeys(job)]))
  const writes = (jobId: string, step: WorkflowStep, key: string) => {
    const action = step.uses?.split('@')[0]
    if (action !== undefined) return ACTION_OUTPUTS[action]?.includes(key) ?? false
    const printed = PRINTED_OUTPUTS[jobId]?.[step.id ?? '']
    if (printed !== undefined) return printed().includes(key)
    // A code line of the run that opens a written value with <key>=, right after a quote or a printf \n (round 12,
    // second iteration): read anywhere in the run, a comment naming replaced=, a longer key or an argument
    // counted as AWS_CHECK's write of replaced, so that write renamed or removed left the rollback jobs reading
    // '' with no finding. And that writes it to the output file (round 12's third iteration: echo
    // "services_started=true" | mask sent the mark's one write to the log, GitHub read the output as '' and the
    // pipeline's rollback was off): the line itself redirects or tees to "$GITHUB_OUTPUT", or it stands in a group
    // whose { opens a line of its own and whose closing line is } >>"$GITHUB_OUTPUT".
    const written = new RegExp(`(?:["']|\\\\n)${key}=`)
    const lines = codeLinesAsBash((step.run ?? '').split('\n')).map(withoutComment)
    const grouped = new Set<number>()
    let open: number | undefined
    lines.forEach((line, n) => {
      if (/^\s*\{\s*$/.test(line)) open = n
      else if (open !== undefined && /^\s*\}/.test(line)) {
        if (/^\s*\}\s*>>\s*"\$GITHUB_OUTPUT"\s*$/.test(line)) for (let at = open + 1; at < n; at++) grouped.add(at)
        open = undefined
      }
    })
    return lines.some((line, n) => written.test(line) && (TO_OUTPUT.test(line) || grouped.has(n)))
  }
  for (const { id, job, steps } of jobs.values()) {
    const needs = jobNeeds(job)
    const needsHeld = (text: string) =>
      [...text.matchAll(NEEDS_READ)].every(
        ([, need = '', property, key]) =>
          needs.includes(need) &&
          ((property === 'result' && key === undefined) ||
            (property === 'outputs' && key !== undefined && (outputsOf.get(need) ?? []).includes(key))),
      )
    const stepsHeld = (text: string, before: readonly WorkflowStep[]) =>
      [...text.matchAll(STEP_READ)].every(([, stepId = '', property, key]) => {
        const step = before.find(each => each.id === stepId)
        if (step === undefined) return false
        if (property === 'outcome' || property === 'conclusion') return key === undefined
        return property === 'outputs' && key !== undefined && writes(id, step, key)
      })
    const uncommented = (lines: readonly string[] | undefined) =>
      (lines ?? []).filter(line => !/^\s*#/.test(line)).join('\n')
    for (const key of job.keys.keys()) {
      if (key === 'steps') continue
      const text = uncommented(job.keys.get(key))
      if (!needsHeld(text) || !stepsHeld(text, key === 'outputs' ? steps : [])) add(id, BINDING)
    }
    steps.forEach((step, index) => {
      const read = [step.if ?? '', ...step.env.values(), ...step.with.values()].join('\n')
      if (!needsHeld(read) || !stepsHeld(read, steps.slice(0, index))) add(`${id} (${label(step, index)})`, BINDING)
    })
  }
}

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
    const condition = (JOB_IFS as Readonly<Record<string, string | undefined>>)[id]
    if (condition === undefined ? job.keys.has('if') : jobScalar(job, 'if') !== condition) add(id, JOB_IF)
    const needs = (JOB_NEEDS as Readonly<Record<string, readonly string[]>>)[id] ?? []
    const have = jobNeeds(job)
    if (
      (needs.length === 0 && job.keys.has('needs')) ||
      have.length !== needs.length ||
      have.some((need, i) => need !== needs[i])
    ) {
      add(id, JOB_NEED)
    }
    const stage = STAGES[id]
    if (mappingKeys(job.keys.get('env')).some(key => CDK_VARIABLE.test(key))) add(id, CDK_ENV)
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
    // No runner runs two commits' code: a job checks out once, so the code a commit's install or synth runs
    // (a process left behind, a file written over) never meets another commit's checkout, and an assembly a
    // rollback deploys is made only by its own commit (the seventh review's first attack).
    if (steps.filter(step => /^actions\/checkout@/i.test(step.uses ?? '')).length > 1) add(id, ONE_CHECKOUT)
    steps.forEach((step, index) => {
      const where = `${id} (${label(step, index)})`
      if (FILE_COMMANDS.test(step.run ?? '')) add(where, FILES)
      if (!onceEach(step.keyNames, FOLDER_JOBS.includes(id) ? [...STEP_KEYS, 'working-directory'] : STEP_KEYS)) {
        add(
          where,
          'holds only name, id, if, uses, with, env and run (and working-directory in the synths, the gate, prod-gate and the smokes), each once: no shell or continue-on-error',
        )
      }
      const action = step.uses?.split('@')[0]
      if (action !== undefined && !onceEach([...step.with.keys()], WITH_KEYS[action] ?? [])) {
        add(where, 'gives its action only the inputs the workflow uses: no repository, run-id, token or other source')
      }
      if (step.uses !== undefined && !sameMap(step.with, STEP_WITHS[id]?.[step.name ?? ''] ?? {})) add(where, WITH)
      const actionIf = ACTION_IFS[id]?.[step.name ?? '']
      if (step.uses !== undefined && (actionIf === undefined ? step.keyNames.includes('if') : step.if !== actionIf)) {
        add(where, ACTION_IF)
      }
      if (!onceEach([...step.env.keys()], ENV_KEYS) || !sameMap(step.env, STEP_ENVS[id]?.[step.name ?? ''] ?? {})) {
        add(where, ENV)
      }
      if ([...step.env.keys()].some(key => CDK_VARIABLE.test(key))) add(where, CDK_ENV)
      if (inlineMappings(step.lines, 8, ['env', 'with'])) add(where, MAPPING)
      if (step.id !== STEP_IDS[id]?.[step.name ?? '']) add(where, IDS)
    })
  }
}

const PREAMBLE_CDK = 'CDK="$RUNNER_TEMP/aws-cdk/package/bin/cdk"'
const ALLOWED_USES = /^(?:actions\/checkout|actions\/download-artifact|aws-actions\/configure-aws-credentials)@/
const REFUSED_CLI =
  /(?<![\w-])(?:--no-rollback|-R|--express|--hotswap|--hotswap-fallback|--import-existing-resources|--force|--all|--method[= ](?:direct|prepare-change-set|execute-change-set)|--revert-drift|--outputs-file|--parameters|--notification-arns|--role-arn|--toolkit-stack-name|--plugin)(?![\w-])|"\$CDK"\s+(?:synth|destroy|bootstrap|import|publish-assets|watch|migrate|refactor|gc|drift|context|acknowledge|init|rollback)\b/

const PINNED_CREDENTIALED =
  'runs as written, whole and under its own if: (PINNED_RUNS): every run of a job that holds the deploy role, or the OIDC request token that gets it, so no line of its own reads, splits, prints or sends what the job holds or hands a pinned line another input'

// What the CLI is run with (DPW-10): deploy or diff, --app "$ASSEMBLY", --no-lookups and --no-notices, and
// for a deploy --require-approval never, --ci, --exclusively and --no-previous-parameters, the one word on
// its line that names previous parameters in any spelling (--previous-parameters, --previousParameters or a
// =true after it would set them back, and the last one yargs reads wins), so every parameter deploys from its
// template's Default, which prod-plan's diff shows: for an SSM-typed parameter, the name of the parameter-store
// entry whose value deploys, which ASSET_CHECK holds to the workload's own entries; and for a diff --method
// template. Every word after the subcommand is one the canonical lines write (CLI_WORDS), each once, so no
// option the CLI reads stands on the line in any spelling (round 11): its yargs reads every option by its
// short alias too (-p for --plugin, which loads a module, -t for --tags, which CloudFormation applies to every
// resource unseen, -r, -O, -f, -m), and options a list of long names never held (--build, a shell command the
// CLI runs with the job's environment before it reads --app, and on a diff --security-only, --template or
// --context-lines, which would show the approver less than the deploy changes).
const CLI_SELECTOR = /^"\$STAGE\/(?:Platform|Data|Tasks|Services|\$PART|\*)"$/
// The stacks a CLI line names (DPW-06, DPW-08, DPW-10), as sets written here as literals and never read from
// the canonical lines, so a change to which stacks a line deploys or diffs changes this table too: a deploy
// takes Platform, Data and Tasks (forward), Services (Services and the drill), Tasks and Services (a rollback)
// or one restore stack ($PART, restore=down), never every stack ("$STAGE/*" would take Services before migrate
// and a rollback's Platform and Data, which no approval's diff shows); a diff takes every stack (prod's forward
// and a restore up), Tasks and Services (a rollback's) or one restore stack (restore=down's).
const CLI_STACKS = {
  deploy: {
    forward: ['Platform', 'Data', 'Tasks'],
    services: ['Services'],
    rollback: ['Tasks', 'Services'],
    down: ['$PART'],
  },
  diff: { prod: ['*'], rollback: ['Tasks', 'Services'], down: ['$PART'] },
} as const
type CliCommand = keyof typeof CLI_STACKS
// The command and stacks a CLI line names, in its order, or undefined for a line of no CLI shape.
export function cliStacksOf(line: string): { command: CliCommand; stacks: string[] } | undefined {
  const shape = /^(?:if )?run "\$CDK" (deploy|diff) --app "\$ASSEMBLY" (.*?)(?:; then)?$/.exec(line.trim())
  if (shape === null) return undefined
  const stacks: string[] = []
  for (const word of (shape[2] ?? '').split(' ')) {
    const stack = /^"\$STAGE\/(.+)"$/.exec(word)?.[1]
    if (stack === undefined) break
    stacks.push(stack)
  }
  return { command: shape[1] as CliCommand, stacks }
}
const sameStacks = (have: readonly string[], want: readonly string[]) =>
  have.length === want.length && new Set(have).size === have.length && want.every(stack => have.includes(stack))
// Whether a CLI line's stacks are one of its command's sets in CLI_STACKS.
const cliStacksAllowed = (line: string): boolean => {
  const named = cliStacksOf(line)
  return (
    named !== undefined &&
    Object.values(CLI_STACKS[named.command]).some(set => sameStacks(named.stacks, set as readonly string[]))
  )
}
// Which set each CLI step's lines name, by its job and step (DPW-06), again as literals: prod-plan's Diff
// runs prod's forward diff, its rollback diff or restore=down's, by mode, and its Diff the rollback the
// rollback diff alone.
const CLI_STEP_STACKS: Readonly<Record<string, Readonly<Record<string, readonly (readonly string[])[]>>>> = {
  nonprod: {
    'Deploy Platform, Data and Tasks': [CLI_STACKS.deploy.forward],
    'Deploy Services': [CLI_STACKS.deploy.services],
    'Roll back to the target': [CLI_STACKS.deploy.rollback],
    'drill-break': [CLI_STACKS.deploy.services],
  },
  prod: {
    'Deploy Platform, Data and Tasks': [CLI_STACKS.deploy.forward],
    'Deploy Services': [CLI_STACKS.deploy.services],
    'Roll back to the target': [CLI_STACKS.deploy.rollback],
    'Take the restore stage down': [CLI_STACKS.deploy.down],
  },
  'rollback-nonprod': { 'Roll back Tasks and Services': [CLI_STACKS.deploy.rollback] },
  'rollback-prod': { 'Roll back Tasks and Services': [CLI_STACKS.deploy.rollback] },
  'prod-plan': {
    Diff: [CLI_STACKS.diff.rollback, CLI_STACKS.diff.prod, CLI_STACKS.diff.down],
    'Diff the rollback': [CLI_STACKS.diff.rollback],
  },
}
const CLI_WORDS: Readonly<Record<'deploy' | 'diff', readonly string[]>> = {
  deploy: [
    '--exclusively',
    '--concurrency 2',
    '--no-previous-parameters',
    '--require-approval never',
    '--no-lookups',
    '--no-notices',
    '--ci',
    '--progress events',
  ],
  diff: ['--exclusively', '--method template', '--no-lookups', '--no-notices', '--no-color', '--fail-on never'],
}
const CLI_NEEDS: Readonly<Record<'deploy' | 'diff', readonly string[]>> = {
  deploy: [
    '--require-approval never',
    '--ci',
    '--exclusively',
    '--no-previous-parameters',
    '--no-lookups',
    '--no-notices',
  ],
  diff: ['--method template', '--no-lookups', '--no-notices'],
}
function cliLineIsSafe(line: string): boolean {
  const shape = /^(if )?run "\$CDK" (deploy|diff) --app "\$ASSEMBLY" (.*?)(; then)?$/.exec(line.trim())
  if (shape === null || (shape[1] === undefined) !== (shape[4] === undefined)) return false
  const command = shape[2] as 'deploy' | 'diff'
  const words = (shape[3] ?? '').split(' ')
  const selectors = words.filter(word => CLI_SELECTOR.test(word))
  if (selectors.length === 0 || new Set(selectors).size !== selectors.length) return false
  if (!cliStacksAllowed(line)) return false
  // The selectors, then the flags, each a word or a word and its value, as the canonical lines write them.
  const rest = words.slice(selectors.length).join(' ')
  if (words.slice(0, selectors.length).some(word => !CLI_SELECTOR.test(word))) return false
  const flags: string[] = []
  let left = rest
  while (left !== '') {
    const flag = CLI_WORDS[command].find(each => left === each || left.startsWith(`${each} `))
    if (flag === undefined || flags.includes(flag)) return false
    flags.push(flag)
    left = left.slice(flag.length).trimStart()
  }
  return CLI_NEEDS[command].every(flag => flags.includes(flag))
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
  bindingFindings(jobs, add)
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
      if (
        credentialed &&
        lines.some(
          line => (/cdk_/i.test(line.text) || CDK_WORD.test(line.text)) && line.raw.trim() !== PREAMBLE_CDK_EXPORT,
        )
      ) {
        add(where, CDK_ENV)
      }
      if (
        lines.some(line => CDK_ASSIGNMENT.test(line.code) && line.raw.trim() !== PREAMBLE_CDK) ||
        shellCommands(run).some(handsName('CDK'))
      ) {
        add(where, 'assigns CDK only in the preamble, as the bin of the registry package CLI_FETCH unpacked')
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
        const imageLines = IMAGE_TOOLS[word]
        if (imageLines !== undefined && run === IMAGE_UNPACK_RUN && imageLines.includes(raw(command))) return false
        if (DIFF_TOOLS.has(word) && DIFF_RUNS.includes(run) && raw(command) === DIFF_SUMMARY_LINE) return false
        if (
          word === 'openssl' &&
          raw(command) === STOP_TOKEN_LINE &&
          command.line === STOP_TOKEN_AT &&
          stopsCommandsFirst(run)
        ) {
          return false
        }
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
          'runs nothing but bash’s own, its functions, gh api, git merge-base, jq, the text tools, aws, skopeo, the pinned CLI, CLI_FETCH’s fetch, IMAGE_CHECK’s listing and unpacking and the preamble’s stop token, and names no npm, npx, node, shell, source, eval, docker, python, make, curl or wget but that fetch, or script: no tool is handed a program to run',
        )
      }
      // Its own lines are read by the table, each command held to its uses.
      const refused = refusedAt(where, read)
      if (refused !== undefined) add(refused, AS_BASH)
      const diffRun = DIFF_RUNS.includes(run)
      if (read.commands.some(command => !glueIsHeld(command, CANONICAL_CALLS, read.commands, diffRun))) add(where, HELD)
      if (setsAnInput(run, read, [...jobNames, ...step.env.keys()])) add(where, SETS_INPUT)
      if (read.functions.length > 0 || !definitionsAreCanonical(run)) {
        add(
          where,
          'defines a function only where a canonical text (the preamble, IMAGE_CHECK, ASSET_CHECK, ARTIFACT_NAMES, AWS_CHECK, TASKS_OUTPUTS, ONE_OFF, NEWEST_RELEASE or PLAN_BASIS) does, as it does',
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
          [...line.matchAll(REDIRECTION)].some(write => write[1] !== '(' && !writable(write[1] ?? '', diffRun)),
        ) ||
        lines.some(line => DIFF_ASSIGNMENT.test(line.code) && line.raw.trim() !== DIFF_LINE) ||
        commands.some(handsName('DIFF'))
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
      const wantAssembly =
        DEPLOY_JOBS[id]?.rollback || run === ROLLBACK_DIFF_RUN
          ? 'ASSEMBLY="$RUNNER_TEMP/assembly-previous"'
          : 'ASSEMBLY="$RUNNER_TEMP/assembly"'
      const moves = commands.filter(command => ['cd', 'pushd', 'popd'].includes(command.word))
      if (
        cli.some(line => !cliLineIsSafe(line.text)) ||
        commands.some(handsName('ASSEMBLY')) ||
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
          'runs the CLI only as deploy or diff, with --app "$ASSEMBLY" (set once to the folder it downloaded), after CDK_FOLDER and no other change of folder, with --no-lookups --no-notices, a deploy with --require-approval never --ci --exclusively --no-previous-parameters and a diff with --method template, and no word but its stacks, one of the sets CLI_STACKS writes for its command (a deploy never every stack), and the flags the canonical lines write, so no short alias or other option the CLI reads',
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
// action is read as GitHub's runner reads a step's uses: (its PipelineTemplateConverter): the part before
// the @, split at / and at \ with the empty segments dropped, the first two naming the repository in any
// letter case, so actions\checkout@v5, actions//checkout@v5 and /actions/checkout@v5 are the checkout they
// run (the eighth review's fourth attack); its uses: is read unquoted.
export const actionRepository = (uses: string): string =>
  (uses.split('@')[0] ?? '')
    .split(/[\\/]/)
    .filter(segment => segment !== '')
    .slice(0, 2)
    .join('/')
    .toLowerCase()
export function checkoutFindings(workflows: Texts): Finding[] {
  const found: Finding[] = []
  for (const [path, text] of workflows) {
    for (const job of workflowJobs(text)) {
      if (path === DEPLOY && job.id !== 'build' && !nodeBelowCheckout(parsedSteps(job))) {
        found.push(at(path, 'DPW-11', `${job.id}: ${NODE_BELOW_CHECKOUT}`))
      }
      parsedSteps(job).forEach((step, index) => {
        if (
          actionRepository(step.uses ?? '') === 'actions/checkout' &&
          step.with.get('persist-credentials') !== 'false'
        ) {
          found.push(
            at(path, 'DPW-11', `${job.id} (${label(step, index)}): actions/checkout has persist-credentials: false`),
          )
        }
      })
    }
  }
  return found
}

// DPW-11 (round 12's fourth iteration): setup-node runs node, npm and yarn with --version in its job's workspace
// (its working folder, which the runner sets to github.workspace), and Yarn 1, which GitHub's image ships, reads
// a .yarnrc from the folder it runs in and every folder above it and runs the program its yarn-path names before
// it reads an argument. So in deploy.yml every job with a setup-node step but the build's, which runs the
// repository's code by design, checks out once, into a folder of its own that setup-node comes after and reads
// .nvmrc from, and every working-directory of the job is that folder: the workspace setup-node runs in then
// holds none of the repository's files, and nothing a .yarnrc names runs before the job's own code. This holds
// the shape, whatever folder the pins name; ci.yml's action-pins and cli-pin are held the same way by DPW-04.
const NODE_BELOW_CHECKOUT =
  'checks out once, into a folder of its own (path:), before setup-node, which reads that folder’s .nvmrc, and runs every step that names a working-directory there, so setup-node’s node, npm and yarn run in a workspace that holds none of the repository’s files (a .yarnrc’s yarn-path would run its program there)'
function nodeBelowCheckout(steps: readonly WorkflowStep[]): boolean {
  const node = steps.findIndex(step => actionRepository(step.uses ?? '') === 'actions/setup-node')
  if (node < 0) return true
  const checkouts = steps.flatMap((step, index) =>
    actionRepository(step.uses ?? '') === 'actions/checkout' ? [index] : [],
  )
  const folder = steps[checkouts[0] ?? -1]?.with.get('path') ?? ''
  return (
    checkouts.length === 1 &&
    (checkouts[0] ?? node) < node &&
    /^[a-z][a-z0-9-]*$/.test(folder) &&
    steps.filter(step => actionRepository(step.uses ?? '') === 'actions/setup-node').length === 1 &&
    steps[node]?.with.get('node-version-file') === `${folder}/.nvmrc` &&
    steps.every(step => !step.keys.has('working-directory') || step.keys.get('working-directory') === folder)
  )
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
// What a record job writes is what its smokes judged (round 12's fourth iteration), read from the workflow's own
// env: maps, never through STEP_ENVS, which moves with them: its COMMIT:DIGEST is its smoke's RELEASE expression
// for expression, its SERVICES the services output of the job whose read-back its smoke's READBACK reads, and
// its PREVIOUS_COMMIT:PREVIOUS_DIGEST and ROLLBACK_SERVICES its resmoke's the same way. COMMIT read from
// github.sha, the run's commit, which the gate's commit equals on every push and dispatched deploy, wrote a
// dispatched rollback's record under main's head with the target's image, so the next deploy's expansion check
// asked about main's head and passed a floor the release that runs hadn't reached, and the pipeline's rollback
// would go back to main's head's code with that image. The verdicts that decide whether it writes, and what, are
// held the same way (round 12's fourth iteration, its second pass): SMOKE is its smoke's result and RESMOKE its
// resmoke's, each written here. SMOKE read from the deploy job's result, a one-token change that lined it up with
// DIGEST and SERVICES beside it, recorded a release whose smoke failed as deployed, the job green, while the
// pipeline's rollback had put the previous release back; the next gate then read the failed release as what runs.
const JUDGED =
  "records what its smokes judged: COMMIT:DIGEST its smoke's RELEASE and SERVICES the services of the job whose read-back that smoke read, PREVIOUS_COMMIT:PREVIOUS_DIGEST and ROLLBACK_SERVICES its resmoke's the same way, and SMOKE and RESMOKE that smoke's and resmoke's results"
function recordsWhatWasJudged(jobs: ReadonlyMap<string, Job>, id: string): boolean {
  const stage = id.replace(/^record-/, '')
  const envOf = (job: string, step: string) => jobs.get(job)?.steps.find(each => each.name === step)?.env
  const record = envOf(id, 'Write the record')
  const servicesOf = (readback: string | undefined) =>
    expr(
      `needs.${/^\$\{\{ needs\.([\w-]+)\.outputs\.readback \}\}$/.exec(readback ?? '')?.[1] ?? '\0'}.outputs.services`,
    )
  const judged = (smoke: string, commit: string, digest: string, services: string) => {
    const env = envOf(smoke, 'Smoke')
    return (
      env !== undefined &&
      record !== undefined &&
      record.get(commit) !== undefined &&
      record.get(digest) !== undefined &&
      `${record.get(commit)}:${record.get(digest)}` === env.get('RELEASE') &&
      record.get(services) === servicesOf(env.get('READBACK'))
    )
  }
  return (
    judged(`smoke-${stage}`, 'COMMIT', 'DIGEST', 'SERVICES') &&
    judged(`resmoke-${stage}`, 'PREVIOUS_COMMIT', 'PREVIOUS_DIGEST', 'ROLLBACK_SERVICES') &&
    record?.get('SMOKE') === expr(`needs.smoke-${stage}.result`) &&
    record.get('RESMOKE') === expr(`needs.resmoke-${stage}.result`)
  )
}
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
// The lines on which a record's writer sets a name, runs jq or calls gh (DPW-13), each written here whole and
// never read from the texts that hold them (RECORD_HEAD, RECORD_RELEASE, RECORD_RESTORE, migrationRecord()), so a
// change to a record's text that rewrites what it writes (a filter or an if after the body's object, the body,
// the payload or the environment set again, another task, environment or commit in its place, another write:
// the seventh review's fourth attack) leaves a line no list holds. A record job's run holds these lines alone
// (record-prod's a restore's payload too); migrate's step, from migrate's own end, the migration record's three,
// with its own environment's name.
const RECORD_JOB_LINES = [
  sh`URL="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"`,
  sh`local body id`,
  sh`body=$(jq -n --arg environment "$ENVIRONMENT" --arg task "$1" --argjson payload "$2" '{ref: "main", task: $task, environment: $environment, auto_merge: false, required_contexts: [], transient_environment: false, production_environment: ($environment == "prod"), payload: $payload}')`,
  sh`id=$(gh api -X POST "repos/$REPO/deployments" --input - --jq .id <<<"$body")`,
  sh`jq -n --arg url "$URL" '{state: "success", auto_inactive: false, log_url: $url}' |`,
  sh`jq . <<<"$2"`,
  sh`! jq -e --arg environment "$ENVIRONMENT" 'type == "object" and keys == ["api", "realtime", "worker"] and all(to_entries[]; .key as $role | .value | type == "string" and test("\\Ahearth-" + $environment + "-" + $role + ":[1-9][0-9]{0,5}\\z"))' <<<"$4" >/dev/null; then`,
  sh`jq -n --arg kind "$1" --arg commit "$2" --arg digest "$3" --arg migrated "$MIGRATED" --argjson services "$4" '{schema: 1, kind: $kind, commit: $commit, digest: $digest, migratedCommit: (if $migrated == "" then null else $migrated end), services: $services}'`,
  sh`MIGRATED=$(gh api "repos/$REPO/deployments?environment=$ENVIRONMENT&task=hearth-migrated&per_page=1" --jq '.[0].payload | if type == "object" and (.commit | type == "string" and test("\\A[0-9a-f]{40}\\z")) then .commit else "" end')`,
  sh`KIND=deploy`,
  sh`if [ "$MODE" = rollback ]; then KIND=rollback; fi`,
  sh`PAYLOAD=$(release_payload "$KIND" "$COMMIT" "$DIGEST" "$SERVICES")`,
  sh`PAYLOAD=$(release_payload pipeline-rollback "$PREVIOUS_COMMIT" "$PREVIOUS_DIGEST" "$ROLLBACK_SERVICES")`,
  sh`gh api -X POST "repos/$REPO/deployments/$id/statuses" --input - --silent`,
]
const RESTORE_PAYLOAD_LINE = sh`PAYLOAD=$(jq -n --arg kind "$RESTORE" --arg commit "$COMMIT" --arg digest "$DIGEST" '{schema: 1, kind: $kind, commit: $commit, digest: $digest}')`
const migrationRecordLines = (stage: Stage) => [
  sh`BODY=$(jq -n --arg environment "${stage}" --arg commit "$COMMIT" '{ref: "main", task: "hearth-migrated", environment: $environment, auto_merge: false, required_contexts: [], transient_environment: false, production_environment: ($environment == "prod"), payload: {schema: 1, commit: $commit}}')`,
  sh`ID=$(gh api -X POST "repos/$REPO/deployments" --input - --jq .id <<<"$BODY")`,
  sh`jq -n --arg url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" '{state: "success", auto_inactive: false, log_url: $url}' |`,
  sh`gh api -X POST "repos/$REPO/deployments/$ID/statuses" --input - --silent`,
]
const recordLines = (id: string): ReadonlySet<string> =>
  new Set(
    id === 'record-nonprod' || id === 'record-prod'
      ? [...RECORD_JOB_LINES, ...(id === 'record-prod' ? [RESTORE_PAYLOAD_LINE] : [])]
      : id === 'nonprod' || id === 'prod'
        ? migrationRecordLines(id)
        : [],
  )
// The commands that set a name or write or read a record by what they are handed.
const RECORD_SETTERS = ['jq', 'gh', 'local', 'read', 'mapfile', 'readarray', 'printf', 'export', 'declare']
const RECORD_LINES_RULE =
  'sets a name, runs jq or calls gh in a record’s writer only on a line RECORD_JOB_LINES or migrationRecordLines() holds, so nothing rewrites what a record says'
// The lines of a record's writer, counted from 0, that set a name, run jq or call gh other than as the lists
// above hold them: the whole of a record job's run, and migrate's step from migrate's own end.
export function unheldRecordLines(id: string, run: string): number[] {
  const lines = run.split('\n')
  const from = id === 'record-nonprod' || id === 'record-prod' ? 0 : Math.max(0, lineIndexOf(lines, MIGRATE_END))
  const held = recordLines(id)
  const unheld = readShell(run).commands.filter(
    command =>
      command.line >= from &&
      (command.assignments.length > 0 ||
        command.variable !== undefined ||
        RECORD_SETTERS.includes(command.name ?? '')) &&
      !held.has(lines[command.line]?.trim() ?? ''),
  )
  return [...new Set(unheld.map(command => command.line))].sort((a, b) => a - b)
}
const MIGRATED_BODY = 'task: "hearth-migrated"'
const MIGRATE_END = 'one_off_end migrate "$MIGRATE_LINES" "$RUN"'

// DPW-13 (C11-D44, C11-D50, C11-D51, C11-D61, C11-D79; T24 item 10): build runs only when the gate says so (a
// deploy, not a restore); no :latest and no image named by a tag but this run's own push; the push is
// SKOPEO_COPY (--preserve-digests, --digestfile, the tag sha-$COMMIT-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT), in
// the deploy-mode push step of nonprod and prod alone, so no rollback, drill or restore pushes, and it copies
// from the OCI layout its job's own IMAGE_CHECK step listed and unpacked from the downloaded archive after
// that download and before the credentials action, under the push's if: (no skopeo source names an archive,
// which skopeo would unpack itself, writing through a link one member made), while the build checks the
// archive buildx wrote (IMAGE_RUN); the synth
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
  // The push's archive is checked and unpacked by its own job, before the credentials action.
  for (const id of ['nonprod', 'prod']) {
    const steps = jobs.get(id)?.steps ?? []
    const unpack = steps.findIndex(step => step.run === IMAGE_UNPACK_RUN)
    const download = steps.findIndex(step => step.name === 'Download the image')
    const credentials = credentialsAt(steps)
    if (
      unpack < 0 ||
      download < 0 ||
      unpack < download ||
      credentials < 0 ||
      unpack > credentials ||
      steps[unpack]?.if !== PUSH_IF[id] ||
      steps[download]?.with.get('path') !== `${expr('runner.temp')}/image`
    ) {
      add(
        id,
        'checks and unpacks the image archive it downloaded (IMAGE_CHECK) after the download and before the credentials action, under the push’s if:',
      )
    }
  }
  if (/\b(?:oci-archive|docker-archive):/.test(text)) {
    add('deploy.yml', 'hands skopeo no archive, which it would unpack itself: the push copies from an OCI layout')
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
    if (read.commands.some(command => !glueIsHeld(command, recordCalls(id), read.commands))) add(where, HELD)
    if (!recordsWhatWasJudged(jobs, id)) add(where, JUDGED)
    const jobEnv = blockValue(jobs.get(id)?.job.keys.get('env') ?? [])
    const envNames = [...(isMap(jobEnv) ? jobEnv.keys() : []), ...(steps[0]?.env.keys() ?? [])]
    if (setsAnInput(run, read, envNames)) {
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
      if ((record || (migrate && (id === 'nonprod' || id === 'prod'))) && unheldRecordLines(id, run).length > 0) {
        add(where, RECORD_LINES_RULE)
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
// that runs the CLI starts it in CDK_FOLDER's fresh folder; and in every job each check's call stands alone.
// Each check is ASSET_CHECK_RUN, one text for every folder, which reads the folder from its step's ASSEMBLY_FOLDER
// and the release from its step's RELEASE: so the step that checks a folder is the one whose ASSEMBLY_FOLDER names
// it, one of ASSEMBLY_FOLDERS, and its RELEASE must be the release that folder holds (in a previous assembly's
// check, the previous release, though What runs beside it in a rollback job reads RELEASE as this run's: each
// step's RELEASE is its own).
const CHECK_NAMES = [...CANONICAL_CALLS.keys()]
const STANDS_ALONE =
  'calls each check standing alone, outside any substitution, pipeline, negation, and-or list or condition, so its refusal ends the step'
const CHECKED_FOLDERS =
  "runs ASSET_CHECK on each folder it downloaded, in a step of its own that checks the folder its ASSEMBLY_FOLDER names (one of ASSEMBLY_FOLDERS, the download's) against the release its RELEASE names (the one that folder holds), after its download, under its download's if: or none, and before the credentials action"
const CHECKED_UPLOADS =
  "runs ASSET_CHECK on each assembly it uploads, before the upload, in a step that checks the folder its ASSEMBLY_FOLDER names (one of ASSEMBLY_FOLDERS, the upload's) against the release its RELEASE names (the one its job synthesised)"
// The release each synth job's upload holds: the release's own synth's, or the gate's previous release of its stage.
const SYNTHESISED: Readonly<Record<string, string>> = {
  synth: expr('steps.synth.outputs.release'),
  'synth-previous-nonprod': previousRelease('nonprod'),
  'synth-previous-prod': previousRelease('prod'),
}
// Whether a step checks a folder: ASSET_CHECK_RUN, its ASSEMBLY_FOLDER that folder and one of ASSEMBLY_FOLDERS, and
// its RELEASE the given release.
const checksFolder = (step: WorkflowStep | undefined, folder: string, release: string | undefined) =>
  step?.run === ASSET_CHECK_RUN &&
  (ASSEMBLY_FOLDERS as readonly string[]).includes(folder) &&
  step.env.get('ASSEMBLY_FOLDER') === folder &&
  release !== undefined &&
  step.env.get('RELEASE') === release
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
      // Each assembly it downloads is checked in a step of its own, with the release that folder holds (the
      // release's, or the previous release's, which the rollback jobs deploy and prod-plan diffs), after its
      // download, under its download's if: or none, and before the credentials action.
      const downloads = steps.flatMap((step, index) =>
        step.uses?.startsWith('actions/download-artifact@') && step.with.get('path') !== `${RUNNER_TEMP}image`
          ? [index]
          : [],
      )
      const rollback = DEPLOY_JOBS[id]?.rollback === true
      const credentials = credentialsAt(steps)
      const checked = (index: number) => {
        const download = steps[index]
        const path = download?.with.get('path') ?? ''
        const folder = path.startsWith(RUNNER_TEMP) ? path.slice(RUNNER_TEMP.length) : path
        const previous = folder === 'assembly-previous'
        const release = !previous
          ? RELEASE_OUTPUT
          : rollback
            ? PREVIOUS_OUTPUT
            : previousRelease(id === 'prod-plan' ? 'prod' : ((STAGES[id] ?? '') as Stage))
        const check = steps.findIndex(step => checksFolder(step, folder, release))
        const step = steps[check]
        return (
          check > index &&
          credentials >= 0 &&
          check < credentials &&
          step !== undefined &&
          (step.if === undefined || step.if === download?.if)
        )
      }
      if (downloads.length === 0 || !downloads.every(checked)) add(id, CHECKED_FOLDERS)
    }
    // In every job, synth's and synth-previous' among them, each check's call stands alone (standsAlone), so a
    // refusal swallowed by an || or a substitution never hands an assembly on as checked. A run the table
    // can't read whole is refused here too, since the reader stops where it refuses.
    steps.forEach((step, index) => {
      if (step.run === undefined || !CHECK_NAMES.some(name => step.run?.includes(name))) return
      const read = readShell(step.run)
      if (
        read.refused !== undefined ||
        read.commands.some(each => CHECK_NAMES.includes(each.name ?? '') && !standsAlone(each, read.commands))
      ) {
        add(`${id} (${label(step, index)})`, STANDS_ALONE)
      }
    })
    if (SYNTH_JOBS.includes(id)) {
      steps.forEach((step, index) => {
        if (!step.uses?.startsWith('actions/upload-artifact@')) return
        const path = step.with.get('path') ?? ''
        const folder = path.startsWith(RUNNER_TEMP) ? path.slice(RUNNER_TEMP.length) : path
        const checked = steps
          .slice(0, index)
          .some(other => checksFolder(other, folder, SYNTHESISED[id]) && other.if === step.if)
        if (!checked) add(`${id} (${label(step, index)})`, CHECKED_UPLOADS)
      })
    }
  }
  return [...found]
}
