// The infra source guard's rules (IG, C0.11; TECH-SPEC T24 item 28), read by infra.test.ts, which
// proves each on planted text and then holds the repository to it. This file and infra.test.ts are on
// the owner's-read list (C11-D74): they hold the rules every infra change is checked against.
//
// Cases so far (C0.11 PR 1): IG-01 to IG-08 and IG-11. IG-09 (the break-glass helper), IG-10 (the
// model lists' one home) and IG-12 (no executable assets) join with C0.11 PR 2, which brings the code
// they read.
import { posix } from 'node:path'
import ts from 'typescript'
import { boundaryBreach, landsIn, type Workspace } from './boundaries'
import { identifyingMatches } from './identifying'
import { packageOf } from './imports'

// One finding: where, and the rule's reason. Never the value that matched.
export type Finding = string

// --- IG-01: no identifying shape in infra/ or the deploy workflow ---------------------------------

// The files IG-01 reads whole, comments included: everything under infra/, and the deploy pipeline's
// workflow, its environments and the script that applies them (C0.11 PR 4).
export function readsForIdentifying(path: string): boolean {
  return (
    path.startsWith('infra/') ||
    path === '.github/workflows/deploy.yml' ||
    path.startsWith('.github/environments/') ||
    path === 'scripts/protect-environments.sh'
  )
}

// The spans of a line IG-01 lets through: a 40-hex commit SHA after @ on a workflow's `uses:` line
// (DPW-04's pin), and a sha256: digest of 64 hex, either of which can hold a 12-digit run.
function exemptSpans(line: string): Array<readonly [number, number]> {
  const spans: Array<readonly [number, number]> = []
  if (/^\s*(?:-\s+)?uses:\s/.test(line)) {
    for (const match of line.matchAll(/@[0-9a-f]{40}(?![0-9a-f])/g)) {
      const start = match.index ?? 0
      spans.push([start, start + match[0].length])
    }
  }
  for (const match of line.matchAll(/sha256:[0-9a-f]{64}(?![0-9a-f])/g)) {
    const start = match.index ?? 0
    spans.push([start, start + match[0].length])
  }
  return spans
}

// IG-01's one shape beyond the shared list (identifying.ts): an Identity Center group id, the identity
// store's UUID (sometimes after 10 hex digits and a hyphen), which names the organisation's groups and
// comes only from a person's environment (env.ts, C11-D25). infra/ needs no UUID of its own, so any
// UUID there counts; the fixture builds its made-up ones from parts (fixtureGroupId).
export const GROUP_ID = 'an Identity Center group id (a UUID)'
const GROUP_ID_SHAPE = /(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])/i

// The organisation's own ids, which env.ts reads from a person's environment for the same reason
// (C11-D25): the organization (o-…), its root (r-…) and its OUs (ou-…-…), and the Identity Center
// instance (ssoins-…) and its identity store (d-…, also the access portal's sign-in host). Each is
// taken only as a whole word, never as part of a longer hyphenated name (`hearth-ou-security`), and a
// made-up one is built from parts (fixture.ts).
export const ORGANIZATIONS_ID = 'an AWS Organizations id (organization, root or OU)'
export const IDENTITY_CENTER_ID = 'an Identity Center instance or identity store id'
const WHOLE = (body: string) => new RegExp(`(?<![\\w-])${body}(?![\\w-])`)
const ORGANIZATIONS_ID_SHAPES = [
  WHOLE('o-[a-z0-9]{10,32}'),
  WHOLE('r-[0-9a-z]{4,32}'),
  WHOLE('ou-[0-9a-z]{4,32}-[a-z0-9]{8,32}'),
]
const IDENTITY_CENTER_ID_SHAPES = [WHOLE('ssoins-[0-9a-f]{16}'), WHOLE('d-[0-9a-f]{10}')]

// Each identifying shape in a file, as "path:line: kind", each kind once a line. Anything else that
// would match a shape is built from parts in the source (a duration computed, an address joined).
export function identifyingIn(path: string, text: string): Finding[] {
  const found: Finding[] = []
  for (const [index, line] of text.split('\n').entries()) {
    const spans = exemptSpans(line)
    const kinds = new Set<string>()
    for (const match of identifyingMatches(line)) {
      if (!spans.some(([start, end]) => start <= match.start && match.end <= end)) kinds.add(match.kind)
    }
    if (GROUP_ID_SHAPE.test(line)) kinds.add(GROUP_ID)
    if (ORGANIZATIONS_ID_SHAPES.some(shape => shape.test(line))) kinds.add(ORGANIZATIONS_ID)
    if (IDENTITY_CENTER_ID_SHAPES.some(shape => shape.test(line))) kinds.add(IDENTITY_CENTER_ID)
    for (const kind of kinds) found.push(`${path}:${index + 1}: ${kind}`)
  }
  return found
}

// --- Code rules, on a script with its comments stripped and its strings kept ----------------------

export interface CodeRule {
  id: string
  pattern: RegExp
  why: string
  // The rule matches a CloudFormation type or key by name (`'Custom::…'`, `'Fn::Transform'`), which an
  // assertion test names to look for it in a synthesised template, so it doesn't apply to one
  // (isAssertionTest).
  assertionsMayName?: true
}

// IG-02: no lookup. Every value comes from configuration, a profile or an SSM parameter by name, so
// no synth calls AWS and no cdk.context.json records an account (C11-D24).
const LOOKUP_WHY = 'a lookup calls AWS at synth and records the answer'
export const LOOKUP_RULES: readonly CodeRule[] = [
  { id: 'IG-02', pattern: /\bfromLookup\w*\s*\(/, why: LOOKUP_WHY },
  { id: 'IG-02', pattern: /\bvalueFromLookup\s*\(/, why: LOOKUP_WHY },
  { id: 'IG-02', pattern: /\bMachineImage\s*\.\s*lookup\s*\(/, why: LOOKUP_WHY },
  { id: 'IG-02', pattern: /\bLookupMachineImage\b/, why: LOOKUP_WHY },
  { id: 'IG-02', pattern: /\bcachedInContext\s*:\s*true\b/, why: LOOKUP_WHY },
  { id: 'IG-02', pattern: /\bContextProvider\s*\.\s*getValue\s*\(/, why: LOOKUP_WHY },
]

// IG-04: nothing stateful or log-holding is given away or made deletable from code (CLAUDE.md,
// Database: deletes go through the deletion code; the log classes age out on their own).
export const DESTROY_RULES: readonly CodeRule[] = [
  {
    id: 'IG-04',
    pattern: /\bgrant(?:ReadWrite|Delete|FullAccess|PutAcl)\s*\(/,
    why: 'a broad or deleting grant; name the actions a role needs',
  },
  {
    id: 'IG-04',
    pattern: /\bgrantWrite\s*\(/,
    why: "grantWrite on a bucket grants object deletion too; name the actions a role needs (a log group's writer: logs:CreateLogStream and logs:PutLogEvents)",
  },
  // aws-cdk-lib 2.274.0's grants objects (`bucket.grants.write(…)`), to which its deprecation notices
  // steer: the broad or deleting ones, a grants object kept to call later, and the factories.
  {
    id: 'IG-04',
    pattern: /\.\s*grants\s*\.\s*(?:readWrite|write|delete|putAcl|fullAccess)\s*\(/,
    why: 'a broad or deleting grant; name the actions a role needs',
  },
  {
    id: 'IG-04',
    pattern: /(?<!\w|\.\s*)grants\s*\.\s*(?:readWrite|write|delete|putAcl|fullAccess)\s*\(/,
    why: 'a broad or deleting grant; name the actions a role needs',
  },
  {
    id: 'IG-04',
    pattern: /\.\s*grants\b(?!\s*\.\s*\w+\s*\()/,
    why: "a grants object kept aside can't be read; call the one grant a role needs where it is made",
  },
  {
    id: 'IG-04',
    pattern: /\{[^{}]*\bgrants\b[^{}]*\}\s*=(?![=>])/,
    why: "a grants object kept aside can't be read; call the one grant a role needs where it is made",
  },
  {
    id: 'IG-04',
    pattern: /\b\w+Grants\s*\.\s*from\w*\s*\(/,
    why: "a grants object made aside can't be read; name the actions a role needs",
  },
  {
    id: 'IG-04',
    pattern: /\bemptyOnDelete\s*:\s*true\b/,
    why: 'empty-on-delete empties a repository through a Lambda, outside the deletion code',
  },
  {
    id: 'IG-04',
    pattern: /\bautoDeleteObjects\b/,
    why: 'auto-delete empties a bucket through a Lambda, outside the deletion code',
  },
  {
    id: 'IG-04',
    pattern: /\bRemovalPolicy\s*\.\s*DESTROY\b/,
    why: 'stateful and log-holding resources are retained',
  },
  {
    id: 'IG-04',
    pattern: /\b(?:removalPolicy\s*:|applyRemovalPolicy\s*\()\s*['"`]destroy['"`]/i,
    why: 'stateful and log-holding resources are retained',
  },
  // aws-cdk-lib 2.274.0's ways round RemovalPolicy: one policy over a whole scope, and an L1's own
  // deletion attributes, set or removed (which on an L2's resource undoes the Retain it sets).
  {
    id: 'IG-04',
    pattern: /\b(?:Missing)?RemovalPolicies\s*\.\s*of\b/,
    why: 'a removal policy over a whole scope can make stateful and log-holding resources deletable',
  },
  {
    id: 'IG-04',
    pattern: /\bCfnDeletionPolicy\s*\.\s*DELETE\b/,
    why: 'stateful and log-holding resources are retained',
  },
  {
    id: 'IG-04',
    pattern: /\b(?:deletionPolicy|updateReplacePolicy)\s*[:=]\s*['"`]Delete['"`]/i,
    why: 'stateful and log-holding resources are retained',
  },
  {
    id: 'IG-04',
    pattern: /\badd(?:Deletion)?Override\s*\(\s*['"`](?:DeletionPolicy|UpdateReplacePolicy)\b/,
    why: 'an override of a deletion attribute can make a retained resource deletable',
  },
]

// IG-06: the server image is deployed only by digest, from the release the pipeline pushed, never
// built or published by the CDK CLI (C11-D44, C11-D76).
export const IMAGE_RULES: readonly CodeRule[] = [
  { id: 'IG-06', pattern: /\bfromAsset\s*\(/, why: 'an asset makes the CLI build or publish; use the release digest' },
  { id: 'IG-06', pattern: /\b(?:DockerImageAsset|TarballImageAsset)\b/, why: 'an image asset makes the CLI build one' },
  { id: 'IG-06', pattern: /\bfrom(?:DockerImageAsset|Tarball)\s*\(/, why: 'an image asset makes the CLI build one' },
  { id: 'IG-06', pattern: /\bAssetImage\b/, why: 'ecs.AssetImage makes a DockerImageAsset, which the CLI builds' },
  { id: 'IG-06', pattern: /['"`]aws-cdk-lib\/aws-ecr-assets['"`]/, why: 'an image asset makes the CLI build one' },
  { id: 'IG-06', pattern: /\baws_ecr_assets\b/, why: 'an image asset makes the CLI build one' },
]

// The one custom resource infra may synthesise: the VPC's default-security-group restriction, which
// aws-cdk-lib adds itself (IAC-13 holds the templates to it).
export const ALLOWED_CUSTOM_RESOURCE = 'Custom::VpcRestrictDefaultSG'

// IG-11: no Lambda and no custom resource of infra's own: each is code that runs with a role in the
// account, outside the review a template gets, and a Lambda would need a route out (C11-D29).
export const LAMBDA_RULES: readonly CodeRule[] = [
  { id: 'IG-11', pattern: /\bNodejsFunction\b/, why: 'a Lambda runs code with a role in the account' },
  {
    id: 'IG-11',
    pattern: /['"`]aws-cdk-lib\/aws-lambda[\w-]*['"`]/,
    why: 'a Lambda runs code with a role in the account',
  },
  { id: 'IG-11', pattern: /['"`]aws-cdk-lib\/custom-resources['"`]/, why: 'a custom resource runs a Lambda' },
  {
    id: 'IG-11',
    pattern: /\b(?:AwsCustomResource|CfnCustomResource|CustomResourceProvider|SingletonFunction)\b/,
    why: 'a custom resource runs a Lambda',
  },
  { id: 'IG-11', pattern: /\bnew\s+(?:\w+\.)?CustomResource\s*\(/, why: 'a custom resource runs a Lambda' },
  {
    id: 'IG-11',
    pattern: /\bRuntime\s*\.\s*(?:NODEJS|PYTHON|JAVA|DOTNET|GO|RUBY|PROVIDED)/,
    why: 'a Lambda runtime',
  },
  {
    id: 'IG-11',
    pattern: /\blogRetention\s*:/,
    why: "logRetention makes a Lambda; make the log group with its class's retention (IAC-07)",
  },
  {
    id: 'IG-11',
    pattern: new RegExp(`['"\`]Custom::(?!${ALLOWED_CUSTOM_RESOURCE.slice('Custom::'.length)}['"\`])`),
    why: `the one custom resource allowed is ${ALLOWED_CUSTOM_RESOURCE}`,
    assertionsMayName: true,
  },
  // Constructs whose CDK internals make a Lambda-backed custom resource, which the template-level
  // check (IAC-13) sees only in workload templates.
  {
    id: 'IG-11',
    pattern: /\bOpenIdConnectProvider\b/,
    why: 'OpenIdConnectProvider runs a Lambda; use iam.OidcProviderNative',
  },
  {
    id: 'IG-11',
    pattern: /\bCrossAccountZoneDelegationRecord\b/,
    why: 'a cross-account delegation record runs a Lambda; delegate NS records by hand (the runbook)',
  },
  {
    id: 'IG-11',
    pattern: /\bdeleteExisting\s*:\s*true\b/,
    why: 'deleteExisting runs a Lambda that deletes records outside the template',
  },
  {
    id: 'IG-11',
    pattern: /['"`]aws-cdk-lib\/(?:triggers|aws-s3-deployment)['"`]/,
    why: 'triggers and bucket deployments run a Lambda',
  },
  // The same modules reached through aws-cdk-lib's root (`cdk.aws_lambda`, `import { custom_resources }
  // from 'aws-cdk-lib'`), whose names nothing else in infra uses; `triggers`, a plain word, only as a
  // namespace member or imported from the root.
  {
    id: 'IG-11',
    pattern:
      /\b(?:aws_lambda\w*|custom_resources|aws_s3_deployment)\b|\.\s*triggers\s*\.|\{[^}]*\btriggers\b[^}]*\}\s*from\s*['"`]aws-cdk-lib['"`]/,
    why: "aws-cdk-lib's Lambda, custom resource, trigger and bucket deployment modules run a Lambda",
  },
  { id: 'IG-11', pattern: /\bBucketDeployment\b/, why: 'a bucket deployment runs a Lambda' },
  {
    id: 'IG-11',
    pattern: /\badd(?:Event|ObjectCreated|ObjectRemoved)Notification\s*\(/,
    why: 'bucket notifications are made by a Lambda',
  },
  {
    id: 'IG-11',
    pattern: /\b(?:eventBridgeEnabled\s*:\s*true\b|enableEventBridgeNotification\s*\()/,
    why: 'bucket notifications are made by a Lambda',
  },
  {
    id: 'IG-11',
    pattern: /\b(?:LogRetention\b|cloudwatchLogsRetention\s*:)/,
    why: "log retention set this way is a Lambda; make the log group with its class's retention (IAC-07)",
  },
  {
    id: 'IG-11',
    pattern: /\bDnsValidatedCertificate\b/,
    why: 'DnsValidatedCertificate requests the certificate from a Lambda; use acm.Certificate',
  },
  { id: 'IG-11', pattern: /\bAwsApi\b/, why: 'an AwsApi target runs a Lambda' },
  {
    id: 'IG-11',
    pattern:
      /\b(?:addRotation(?:SingleUser|MultiUser|Schedule)\s*\(|SecretRotation\b|HostedRotation\b|(?:Cfn)?RotationSchedule\b|hostedRotationLambda\s*:)/,
    why: 'secret rotation runs a Lambda (a hosted one through a SAM application or transform)',
  },
  {
    id: 'IG-11',
    pattern: /['"`]AWS::(?:CloudFormation::CustomResource|Serverless)\b/,
    why: 'a custom resource or a SAM resource runs a Lambda',
    assertionsMayName: true,
  },
  {
    id: 'IG-11',
    pattern: /['"`]aws-cdk-lib\/aws-sam['"`]|\baws_sam\b/,
    why: "SAM's resources are expanded by its transform at deploy, and its functions and applications are Lambdas",
  },
  // A transform in each form aws-cdk-lib 2.274.0 documents: the stack's addTransform and its
  // templateOptions' transforms (or the deprecated transform), and the Fn::Transform intrinsic.
  {
    id: 'IG-11',
    pattern: /\b(?:addTransform\s*\(|templateOptions\s*(?:\.\s*|\[\s*['"`])transforms?\b|Fn\s*\.\s*transform\s*\()/,
    why: 'a transform rewrites the template at deploy, outside its review (SAM and hosted rotation make a Lambda, AWS::Include pulls in a snippet)',
  },
  {
    id: 'IG-11',
    pattern: /['"`]Fn::Transform\b/,
    why: 'a transform rewrites the template at deploy, outside its review (AWS::Include pulls in a snippet)',
    assertionsMayName: true,
  },
  {
    id: 'IG-11',
    pattern: /\bcrossRegionReferences\s*:\s*true\b/,
    why: 'cross-region references are written and read by a Lambda',
  },
  { id: 'IG-11', pattern: /\bCfnJson\b/, why: 'CfnJson resolves its value in a Lambda' },
  {
    id: 'IG-11',
    pattern: /\bVpcEndpointServiceDomainName\b/,
    why: "an endpoint service's domain name is verified by a Lambda",
  },
]

// The assertion tests (infra/**/*.test.ts, IAC) synthesise templates and never deploy one: neither
// entry imports a test (testImportFindings), so a rule marked assertionsMayName doesn't apply to them,
// and they may name the types and keys the template-level check looks for.
export function isAssertionTest(path: string): boolean {
  return path.startsWith('infra/') && path.endsWith('.test.ts')
}

// Each test file an infra file that isn't one imports, which would carry an assertion test's names
// into a stack.
export function testImportFindings(path: string, specifiers: readonly string[]): Finding[] {
  if (isAssertionTest(path)) return []
  return specifiers
    .filter(spec => /\.test(?:\.[cm]?[jt]sx?)?$/.test(spec))
    .map(spec => `${path}: IG-11 imports ${spec}, a test, which may name what a stack may not hold`)
}

// Each rule a script's code breaks, as "path: id why".
export function ruleFindings(path: string, code: string, rules: readonly CodeRule[]): Finding[] {
  return rules
    .filter(rule => !(rule.assertionsMayName === true && isAssertionTest(path)))
    .filter(rule => rule.pattern.test(code))
    .map(rule => `${path}: ${rule.id} ${rule.why}`)
}

// --- IG-03: cdk.json and the context file ---------------------------------------------------------

// What's wrong with infra/cdk.json: the app must be the workload entry run by Node, and no plugin may
// load code into the CLI, which runs it with the deploy job's credentials (C11-D48).
export function cdkJsonProblems(json: unknown): Finding[] {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return ['infra/cdk.json: IG-03 is not a JSON object']
  }
  const found: Finding[] = []
  const config = json as Record<string, unknown>
  if (config.app !== 'node bin/workload.ts') found.push("infra/cdk.json: IG-03 app must be 'node bin/workload.ts'")
  if ('plugin' in config) found.push('infra/cdk.json: IG-03 a plugin runs code inside the CLI')
  return found
}

// --- IG-05: every stack in ap-southeast-1 ---------------------------------------------------------

const EDGE_ID = /^Hearth-[\w${}.-]*-Edge$/

// The text of a string or no-substitution template, or a template's text with its holes kept as
// written, so `Hearth-${env}-Edge` reads as such.
function idText(node: ts.Expression | undefined): string | undefined {
  if (node === undefined) return undefined
  if (ts.isStringLiteralLike(node)) return node.text
  if (ts.isTemplateExpression(node)) return node.getText().slice(1, -1)
  return undefined
}

const STACK_OR_STAGE = /(?:Stack|Stage)$/

// Whether a class extends something named …Stack or …Stage: cdk.Stack, cdk.Stage, cdk.NestedStack,
// or one of infra's own, which IG-05 holds to the same naming.
function extendsStackOrStage(cls: ts.ClassLikeDeclaration): boolean {
  return (cls.heritageClauses ?? []).some(
    clause =>
      clause.token === ts.SyntaxKind.ExtendsKeyword &&
      clause.types.some(type => STACK_OR_STAGE.test(type.expression.getText())),
  )
}

function enclosingClass(node: ts.Node): ts.ClassLikeDeclaration | undefined {
  for (let parent: ts.Node | undefined = node.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isClassLike(parent)) return parent
  }
  return undefined
}

// A stack's or a stage's construction, whose third argument is its props: `new …Stack(scope, id,
// props)`, `new …Stage(…)`, or `super(scope, id, props)` in a class extending one.
function stackCall(node: ts.Node): ts.NewExpression | ts.CallExpression | undefined {
  if (ts.isNewExpression(node) && STACK_OR_STAGE.test(node.expression.getText())) return node
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.SuperKeyword) {
    const cls = enclosingClass(node)
    if (cls !== undefined && extendsStackOrStage(cls)) return node
  }
  return undefined
}

// Whether a props argument is the enclosing stack's or stage's own constructor parameter, passed on:
// its env is then read where that class is constructed. A function between them that declares the
// same name shadows it.
function isOwnProps(argument: ts.Expression, call: ts.Node): boolean {
  if (!ts.isIdentifier(argument)) return false
  const declares = (fn: ts.SignatureDeclaration) =>
    fn.parameters.some(param => ts.isIdentifier(param.name) && param.name.text === argument.text)
  for (let parent: ts.Node | undefined = call.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isConstructorDeclaration(parent)) {
      return ts.isClassLike(parent.parent) && extendsStackOrStage(parent.parent) && declares(parent)
    }
    if (ts.isFunctionLike(parent) && declares(parent)) return false
  }
  return false
}

// Whether a stack call is C0.12's Edge stack: its id is Hearth-…-Edge, or, for a super call, its class
// is named for the edge.
function isEdge(call: ts.NewExpression | ts.CallExpression): boolean {
  if (ts.isNewExpression(call)) {
    const id = idText(call.arguments?.[1])
    return id !== undefined && EDGE_ID.test(id)
  }
  return /Edge/.test(enclosingClass(call)?.name?.text ?? '')
}

const propertyName = (property: ts.ObjectLiteralElementLike): string | undefined =>
  property.name === undefined ? undefined : property.name.getText().replace(/['"]/g, '')

// Each stack or stage `env` in a script that doesn't put it in ap-southeast-1, each one the guard
// can't read, and each construction with none, as "path:line: why". An env is an object literal whose
// region is 'ap-southeast-1' or profiles.ts's REGION; only C0.12's Hearth-…-Edge stack (CloudFront's
// certificate and WAF) may say 'us-east-1'. So that every one is read:
// - every construction of a stack or stage has props with env written out (a stack in a stage too),
//   since one without deploys into whatever region the CLI's profile names (a nested stack, whose
//   props take no env, is refused too: none is planned, and the guard would learn one first);
// - a class extending a stack or stage is named …Stack or …Stage, so its constructions are seen;
// - props are an object literal, or the enclosing stack's or stage's own constructor parameter passed
//   on (read where that class is constructed), never another value;
// - a spread in props is followed by env written out, which overrides whatever the spread held;
// - env and its region are written out, never by shorthand or as another value.
// The templates' regions are IAC-13's, from C0.11 PR 3.
export function regionFindings(path: string, source: string): Finding[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const found: Finding[] = []
  const at = (node: ts.Node) => `${path}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
  const checkEnv = (call: ts.NewExpression | ts.CallExpression, env: ts.ObjectLiteralElementLike) => {
    if (ts.isShorthandPropertyAssignment(env)) {
      found.push(`${at(env)}: IG-05 write env out, as env: { region: REGION }`)
    } else if (ts.isPropertyAssignment(env) && !ts.isObjectLiteralExpression(env.initializer)) {
      found.push(`${at(env)}: IG-05 env must be an object literal naming its region`)
    } else if (ts.isPropertyAssignment(env) && ts.isObjectLiteralExpression(env.initializer)) {
      const region = env.initializer.properties.find(p => propertyName(p) === 'region')
      if (region !== undefined && ts.isShorthandPropertyAssignment(region)) {
        found.push(`${at(region)}: IG-05 write region out, as env: { region: REGION }`)
      } else {
        const value = region !== undefined && ts.isPropertyAssignment(region) ? region.initializer : undefined
        const ok =
          value !== undefined &&
          ((ts.isIdentifier(value) && value.text === 'REGION') ||
            (ts.isStringLiteralLike(value) &&
              (value.text === 'ap-southeast-1' || (value.text === 'us-east-1' && isEdge(call)))))
        if (!ok) found.push(`${at(env)}: IG-05 env.region must be ap-southeast-1 (REGION)`)
      }
    }
  }
  const visit = (node: ts.Node): void => {
    if (ts.isClassLike(node) && extendsStackOrStage(node) && !STACK_OR_STAGE.test(node.name?.text ?? '')) {
      found.push(
        `${at(node)}: IG-05 a class extending a stack or stage is named …Stack or …Stage, so the guard reads its env`,
      )
    }
    const call = stackCall(node)
    const props = call?.arguments?.[2]
    const noEnv = 'IG-05 a stack or stage with no env deploys wherever the CLI points; write env: { region: REGION }'
    if (call !== undefined && props === undefined) {
      found.push(`${at(call)}: ${noEnv}`)
    } else if (call !== undefined && props !== undefined) {
      if (ts.isObjectLiteralExpression(props)) {
        const properties = props.properties
        const lastSpread = properties.findLastIndex(p => ts.isSpreadAssignment(p))
        const envIndex = properties.findLastIndex(p => propertyName(p) === 'env')
        const env = properties[envIndex]
        const spread = properties[lastSpread]
        if (spread !== undefined && envIndex < lastSpread) {
          found.push(`${at(spread)}: IG-05 write env out after the last spread, as env: { region: REGION }`)
        } else if (env !== undefined) {
          checkEnv(call, env)
        } else {
          found.push(`${at(props)}: ${noEnv}`)
        }
      } else if (!isOwnProps(props, call)) {
        found.push(
          `${at(props)}: IG-05 props must be an object literal with env written out, or the constructor's own props passed on`,
        )
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

// --- IG-07: no deploy, bootstrap or destroy script ------------------------------------------------

// The CDK subcommands a package script may run: synth and list, which build or name stacks without
// deploying anything.
const CDK_ALLOWED = new Set(['synth', 'synthesize', 'ls', 'list'])
// The CLI itself, however it is called: cdk or aws-cdk, by path, or with any npm spec after @.
const CDK_BINARY = /(?:^|\/)(?:aws-)?cdk(?:@[\s\S]*)?$/
// What may stand between the CLI and its subcommand, from aws-cdk 2.1146.1's own parser (yargs, which
// isn't strict, so an option it doesn't know takes the next word as its value). Its global booleans,
// and yargs's --version and --help, each of which takes a following true or false as yargs does (the
// CLI's --no-color is no entry here: yargs reads any --no- form as one word, taking nothing after it,
// and so does the guard, below):
const CDK_FLAG_OPTIONS = new Set([
  '--trace',
  '--strict',
  '--lookups',
  '--ignore-errors',
  '--json',
  '-j',
  '--verbose',
  '-v',
  '--debug',
  '--debug-app',
  '--debug-cli',
  '--ec2creds',
  '-i',
  '--version-reporting',
  '--telemetry',
  '--path-metadata',
  '--asset-metadata',
  '--staging',
  '--notices',
  '--color',
  '--ci',
  '--yes',
  '-y',
  '--version',
  '--help',
  '-h',
])
// its global string and array options, each with the one word after it that doesn't start with -. A
// following word that does is read as an option of its own, so refused unless the guard reads past it,
// even where yargs takes it as the value, as it takes a lone - or a negative number;
const CDK_VALUE_OPTIONS = new Set([
  '--app',
  '-a',
  '--build',
  '--context',
  '-c',
  '--plugin',
  '-p',
  '--profile',
  '--region',
  '--proxy',
  '--ca-bundle-path',
  '--role-arn',
  '-r',
  '--output',
  '-o',
  '--unstable',
  '--telemetry-file',
])
// and any option written as one word: --name=value, -x=value with a value after the = (yargs reads a
// bare -x= as x and then an option named =, which takes the next word as its value), or --no-name.
// Every other option before the subcommand is refused, since the guard can't tell whether the CLI
// takes the next word as its value: this is what keeps IG-07 fail-closed.
const ONE_WORD_OPTION = /^(?:--[^=]+=|-[^-]=[\s\S]|--no-.)/

// A command line split into commands, each a list of words, as a shell splits it for this purpose:
// quotes group, a backslash escapes, a backslash before a newline joins the lines (unquoted or in
// double quotes), a redirection (`>out`, `2>&1`, `<in`) is no word of its command, and ; & | ( ) `
// and newlines end a command. It reads the words a script writes, not what a variable expands to.
function shellCommands(line: string): string[][] {
  const commands: string[][] = []
  let words: string[] = []
  let word = ''
  let inWord = false
  let quote: string | undefined
  // Whether the next word is a redirection's target.
  let target = false
  const endWord = () => {
    if (inWord && !target) words.push(word)
    if (inWord) target = false
    word = ''
    inWord = false
  }
  const endCommand = () => {
    endWord()
    target = false
    if (words.length > 0) commands.push(words)
    words = []
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i] ?? ''
    if (c === '\\' && line[i + 1] === '\n' && quote !== "'") {
      i++
    } else if (quote !== undefined) {
      if (c === quote) quote = undefined
      else if (c === '\\' && quote === '"' && i + 1 < line.length) word += line[++i]
      else word += c
    } else if (c === "'" || c === '"') {
      quote = c
      inWord = true
    } else if (c === '\\' && i + 1 < line.length) {
      word += line[++i]
      inWord = true
    } else if (c === '\n' || ';&|()`'.includes(c)) {
      endCommand()
    } else if (c === '<' || c === '>') {
      // A file descriptor written against the operator is part of it, as is the rest of the operator.
      if (inWord && /^\d+$/.test(word)) {
        word = ''
        inWord = false
      }
      endWord()
      while ('<>&|'.includes(line[i + 1] ?? ' ')) i++
      target = true
    } else if (/\s/.test(c)) {
      endWord()
    } else {
      word += c
      inWord = true
    }
  }
  endCommand()
  return commands
}

// What a run of the CLI at words[index] does that a script may not, or undefined: a subcommand but
// synth or list, an option before the subcommand the guard can't read past, or no subcommand at all,
// since npm appends a caller's words to a script (`npm run c deploy` runs `cdk deploy` when c is
// `cdk`, and `cdk --version` with `--no-version deploy` appended deploys too).
function refusedCdkRun(words: readonly string[], index: number): string | undefined {
  let next = index + 1
  while (next < words.length) {
    const option = words[next] ?? ''
    if (option === '--') {
      next += 1
      break
    }
    if (!option.startsWith('-')) break
    if (ONE_WORD_OPTION.test(option)) next += 1
    else if (CDK_FLAG_OPTIONS.has(option)) next += /^(?:true|false)$/.test(words[next + 1] ?? '') ? 2 : 1
    else if (CDK_VALUE_OPTIONS.has(option)) next += (words[next + 1] ?? '-').startsWith('-') ? 1 : 2
    else
      return `runs cdk with ${option} before its subcommand: the guard reads past only the CLI's own options and options written as one word`
  }
  const subcommand = words[next]
  if (subcommand === undefined)
    return "runs cdk with no subcommand: npm appends a caller's words, so name synth or list"
  // `npx -p aws-cdk cdk …`: the second cdk is read on its own.
  if (CDK_BINARY.test(subcommand) || CDK_ALLOWED.has(subcommand)) return undefined
  return `runs cdk ${subcommand}: only synth or list`
}

// Every run of the CLI in a command line that a script may not make (refusedCdkRun), through chains
// and into quoted command lines (`sh -c '…'`, `--app "…"`).
function refusedCdkRuns(line: string): string[] {
  const found: string[] = []
  for (const words of shellCommands(line)) {
    for (const [index, word] of words.entries()) {
      if (/[\s;&|()`]/.test(word)) found.push(...refusedCdkRuns(word))
      if (!CDK_BINARY.test(word)) continue
      const refused = refusedCdkRun(words, index)
      if (refused !== undefined) found.push(refused)
    }
  }
  return found
}

// Each script in a manifest that deploys, bootstraps or destroys, or runs the CDK CLI other than as
// synth or list. Agents run package scripts, so none may reach an account (C11-D70).
export function scriptFindings(path: string, manifest: unknown): Finding[] {
  const scripts = (manifest as { scripts?: Record<string, unknown> } | null)?.scripts ?? {}
  const found: Finding[] = []
  for (const [name, command] of Object.entries(scripts)) {
    if (path === 'infra/package.json' && /deploy|bootstrap|destroy/i.test(name)) {
      found.push(`${path}: IG-07 script "${name}": no deploy, bootstrap or destroy script`)
    }
    const refused = typeof command === 'string' ? refusedCdkRuns(command) : []
    for (const what of new Set(refused)) found.push(`${path}: IG-07 script "${name}" ${what}`)
  }
  return found
}

// --- IG-08: what infra imports ----------------------------------------------------------------------

// Why an import from an infra file is refused, or undefined. Among workspaces infra loads only
// @hearth/shared, and @hearth/server/config only from a test (IAC-21), so neither entry can pull in
// the server or another app.
export function infraImportProblem(file: string, specifier: string, workspaces: Workspace[]): string | undefined {
  const from = workspaces.find(w => w.dir === 'infra/')
  const to = landsIn(file, specifier, workspaces)
  if (from === undefined || to === undefined) return undefined
  return boundaryBreach(from, to, { file, specifier })
}

// The files a script's relative imports reach, itself included, read through `read` (undefined for a
// file that doesn't exist).
export function importGraph(
  entry: string,
  read: (path: string) => string | undefined,
  importsOf: (source: string, path: string) => string[],
): { files: string[]; specifiers: Map<string, string[]> } {
  const seen = new Set<string>()
  const specifiers = new Map<string, string[]>()
  const queue = [entry]
  while (queue.length > 0) {
    const path = queue.shift() ?? ''
    if (seen.has(path)) continue
    const source = read(path)
    if (source === undefined) continue
    seen.add(path)
    const specs = importsOf(source, path)
    specifiers.set(path, specs)
    for (const spec of specs) {
      if (spec.startsWith('.')) queue.push(posix.normalize(posix.join(posix.dirname(path), spec)))
    }
  }
  return { files: [...seen], specifiers }
}

// The landing zone's folders, which the workload entry never reaches (C11-D24).
export const LANDING_ZONE_DIRS = ['infra/src/foundation/', 'infra/src/baseline/'] as const

// What the workload entry's graph never reaches, by path prefix, and why: the landing zone, the reader
// of a person's configuration, and the fixture, so the pipeline's synth runs on the committed profiles
// alone (C11-D24, C11-D25).
const WORKLOAD_NEVER: ReadonlyArray<readonly [string, string]> = [
  ...LANDING_ZONE_DIRS.map(dir => [dir, "the pipeline's synth never needs the landing zone"] as const),
  ['infra/src/config/env.ts', "the pipeline's synth never needs a person's configuration"],
  ['infra/src/testing/', "the pipeline's synth never loads the fixture"],
]

// Each file in the workload entry's graph that it never reaches.
export function workloadGraphFindings(files: readonly string[]): Finding[] {
  return files.flatMap(path => {
    const rule = WORKLOAD_NEVER.find(([prefix]) => path.startsWith(prefix))
    return rule === undefined ? [] : [`infra/bin/workload.ts reaches ${path}: IG-08 ${rule[1]}`]
  })
}

// Each npm package a graph loads, as "path: package". The rollback floors' check runs in the gate
// without npm ci, so it and what it imports load only Node's built-ins and each other (C11-D58).
export function packageFindings(specifiers: ReadonlyMap<string, readonly string[]>): Finding[] {
  const found: Finding[] = []
  for (const [path, specs] of specifiers) {
    for (const spec of specs) {
      if (spec.startsWith('node:') || spec.startsWith('.')) continue
      const name = packageOf(spec)
      if (name !== undefined) found.push(`${path}: IG-08 loads ${name}, but runs without npm ci`)
    }
  }
  return found
}
