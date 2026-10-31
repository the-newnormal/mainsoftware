// The infra source guard's rules (IG, C0.11; TECH-SPEC T24 item 28), read by infra.test.ts, which
// proves each on planted text and then holds the repository to it. This file and infra.test.ts are on
// the owner's-read list (C11-D74): they hold the rules every infra change is checked against.
//
// Cases so far (C0.11 PR 1 and PR 2): IG-01 to IG-12.
import { posix } from 'node:path'
import ts from 'typescript'
import { globsOverlap, MODEL_ACTIONS, MODEL_SERVICE_PREFIXES } from '../../infra/src/config/models.ts'
import { AGENT_MARKERS } from '../owner-bootstrap/target.ts'
import { boundaryBreach, landsIn, type Workspace } from './boundaries'
import { identifyingMatches } from './identifying'
import { importsOf, packageOf } from './imports'

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
    pattern: /\bautoDeleteImages\b/,
    why: 'auto-delete empties a repository through a Lambda, outside the deletion code',
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
// - a spread in props is followed by env written out, which overrides whatever the spread held, and a
//   spread in env by its region written out;
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
      const inner = env.initializer.properties
      const regionIndex = inner.findLastIndex(p => propertyName(p) === 'region')
      const lastSpread = inner.findLastIndex(p => ts.isSpreadAssignment(p))
      const region = inner[regionIndex]
      const spread = inner[lastSpread]
      if (spread !== undefined && regionIndex < lastSpread) {
        found.push(`${at(spread)}: IG-05 write region out after the last spread, as env: { region: REGION }`)
      } else if (region !== undefined && ts.isShorthandPropertyAssignment(region)) {
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
    } else {
      found.push(`${at(env)}: IG-05 write env out, as env: { region: REGION }`)
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

// --- IG-09: the break-glass helper (infra/bin/break-glass.sh; C11-D11 to C11-D15) ---------------

// The helper's commands as IG-09 reads them: whole-line comments dropped (the shebang kept), lines
// continued by a trailing backslash joined, and a here-document's body joined to the command that
// opens it (it is that command's input), each with the number of its first line. The helper runs top
// to bottom with every function defined before its first use, so a line's place in this list is its
// place in the run, which the order rules read.
export interface ShellLine {
  line: number
  text: string
}

const HEREDOC = /(?<!<)<<(-?)\s*(['"]?)([A-Za-z_]\w*)\2/

export function shellLines(text: string): ShellLine[] {
  const raw = text.split('\n')
  const lines: ShellLine[] = []
  let current: ShellLine | undefined
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i] ?? ''
    if (current === undefined && /^\s*#/.test(line) && !(i === 0 && line.startsWith('#!'))) continue
    if (current === undefined && line.trim() === '') continue
    const part = (line.endsWith('\\') ? line.slice(0, -1) : line).trim()
    current = current === undefined ? { line: i + 1, text: part } : { ...current, text: `${current.text} ${part}` }
    if (line.endsWith('\\')) continue
    const heredoc = HEREDOC.exec(current.text)
    if (heredoc !== null) {
      const strip = heredoc[1] === '-'
      while (i + 1 < raw.length) {
        i += 1
        const body = raw[i] ?? ''
        if ((strip ? body.replace(/^\t+/, '') : body) === heredoc[3]) break
        current.text += `\n${body}`
      }
    }
    lines.push(current)
    current = undefined
  }
  if (current !== undefined) lines.push(current)
  return lines
}

// Each function the helper defines, `name() {` to the next line that is `}` alone, by name, as the
// indices of its body's lines.
export function shellFunctions(lines: readonly ShellLine[]): Map<string, { start: number; end: number }> {
  const found = new Map<string, { start: number; end: number }>()
  for (let i = 0; i < lines.length; i++) {
    const name = /^([A-Za-z_]\w*)\(\) \{$/.exec(lines[i]?.text ?? '')?.[1]
    if (name === undefined) continue
    const end = lines.findIndex((line, j) => j > i && line.text === '}')
    if (end < 0) break
    found.set(name, { start: i + 1, end })
    i = end
  }
  return found
}

// A function's text as the helper writes it, definition and all, for IG-09 to run on its own, or
// undefined when the helper has no such function.
export function shellFunction(text: string, name: string): string | undefined {
  const lines = text.split('\n')
  const start = lines.indexOf(`${name}() {`)
  if (start < 0) return undefined
  const end = lines.indexOf('}', start + 1)
  return end < 0 ? undefined : lines.slice(start, end + 1).join('\n')
}

// The helper's REASON_FORM_* assignments, which its reason check reads.
export const reasonFormLines = (text: string): string[] =>
  text.split('\n').filter(line => /^REASON_FORM_[A-Z]+='[^']*'$/.test(line))

// An `aws` command word: aws then a space, not part of a longer word or path (aws-cli/2. is a version
// string, and no message or here-document in the helper says "aws ").
const AWS_WORD = /(?<![\w./-])aws\s/
const CREDENTIAL_ENV = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'] as const
const CREDENTIAL_NAMES =
  /\b(?:AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|AccessKeyId|SecretAccessKey|SessionToken)\b/
// A command that writes: echo, printf, cat, tee or logger, or a redirect to a file. A redirect to
// /dev/null, or from one descriptor to another, writes nowhere.
const WRITER = /(?:^|[\s;&|(])(?:echo|printf|cat|tee|logger)(?=\s|$)/
const REDIRECT = /&?>>?\s*(&?)([^\s;&|)<>]*)/g
const writes = (text: string): boolean =>
  WRITER.test(text) || [...text.matchAll(REDIRECT)].some(([, dup, target]) => dup !== '&' && target !== '/dev/null')
// What the helper may never run: a trace, anything that prints the environment or variables, a
// debug flag, eval, or a change to the CLI's configuration. A trace is an x in any option word of a
// set, bash or sh command (set -e -x, bash -ix), xtrace named anywhere (set -o, a joined -eo, shopt -o,
// SHELLOPTS), or BASH_XTRACEFD.
const TRACE_NAMED = /\bxtrace\b|BASH_XTRACEFD/
const TRACE_RUN = /(?:^|[\s;&|(!/"'])(?:set|bash|sh)(?=\s)/g
const traces = (text: string): boolean =>
  TRACE_NAMED.test(text) ||
  [...text.matchAll(TRACE_RUN)].some(run =>
    wordsAsWritten(text.slice((run.index ?? 0) + run[0].length)).some(word =>
      /^-[A-Za-z]*x/.test(word.replace(/["']/g, '')),
    ),
  )
// allexport: an a in any option word of a set command (set -a, set -ea), or allexport named anywhere
// (set -o, shopt -o, SHELLOPTS), which hands every variable after it, the credentials read into plain
// variables among them, to every command the helper runs.
const SET_RUN = /(?:^|[\s;&|(!])set(?=\s)/g
const exportsAll = (text: string): boolean =>
  /\ballexport\b/.test(text) ||
  [...text.matchAll(SET_RUN)].some(run =>
    wordsAsWritten(text.slice((run.index ?? 0) + run[0].length)).some(word =>
      /^-[A-Za-z]*a/.test(word.replace(/["']/g, '')),
    ),
  )
const EXPOSING: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:^|[\s;&|(])(?:env|printenv)\s*(?:$|[;&|)])/m, 'env or printenv alone prints every variable'],
  [/(?:^|[\s;&|(])printenv\b/, 'printenv prints a variable'],
  [/\b(?:declare|typeset|export|readonly)\s+-[A-Za-z]*p\b/, 'it prints variables'],
  [/(?:^|[;&|]\s*|\bthen\s+|\bdo\s+|\belse\s+)set\s*(?:$|[;&|])/m, 'set alone prints every variable'],
  [/--debug\b/, '--debug prints requests, credentials among them'],
  [/(?:^|[\s;&|(])eval(?:\s|$)/, 'eval runs text as code'],
  [/\baws\s+configure\s+set\b/, 'aws configure set writes to the CLI configuration'],
]

// The words of the command that starts a text, as written (quotes kept), up to the first operator
// outside quotes (; & | ) < > or a newline). A command substitution outside quotes is part of its word.
function wordsAsWritten(text: string): string[] {
  const words: string[] = []
  let word = ''
  let quote: string | undefined
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? ''
    if (quote === "'") {
      if (c === "'") quote = undefined
    } else if (c === '\\' && i + 1 < text.length) {
      word += c
      i += 1
      word += text[i]
      continue
    } else if (c === '"') {
      quote = quote === '"' ? undefined : '"'
    } else if (quote === undefined && c === "'") {
      quote = "'"
    } else if (quote === undefined && c === '(' && text[i - 1] === '$') {
      depth += 1
    } else if (quote === undefined && depth > 0 && c === ')') {
      depth -= 1
    } else if (quote === undefined && depth === 0 && (c === '\n' || ';&|()<>'.includes(c))) {
      break
    } else if (quote === undefined && depth === 0 && /\s/.test(c)) {
      if (word !== '') words.push(word)
      word = ''
      continue
    }
    word += c
  }
  if (word !== '') words.push(word)
  return words
}

// Each jq run's program as written: the first word after jq that is neither an option nor an
// option's value. A program read from a file (-f) has none here.
const JQ_RUN = /(?:^|[\s;&|(])jq(?=\s)/g
const JQ_TWO_VALUES = new Set(['--arg', '--argjson', '--slurpfile', '--rawfile'])
const JQ_ONE_VALUE = new Set(['--indent', '-L'])
function jqPrograms(text: string): string[] {
  const programs: string[] = []
  for (const run of text.matchAll(JQ_RUN)) {
    const words = wordsAsWritten(text.slice((run.index ?? 0) + run[0].length))
    for (let i = 0; i < words.length; i++) {
      const word = words[i] ?? ''
      if (JQ_TWO_VALUES.has(word)) i += 2
      else if (JQ_ONE_VALUE.has(word)) i += 1
      else if (word === '-f' || word === '--from-file') break
      else if (!word.startsWith('-')) {
        programs.push(word)
        break
      }
    }
  }
  return programs
}

// Whether a word as written expands anything in the shell: a $ or a backquote outside single quotes,
// not escaped.
function expands(word: string): boolean {
  let quote: string | undefined
  for (let i = 0; i < word.length; i++) {
    const c = word[i]
    if (quote === "'") {
      if (c === "'") quote = undefined
    } else if (c === '\\') i += 1
    else if (c === '$' || c === '`') return true
    else if (c === '"') quote = quote === '"' ? undefined : '"'
    else if (c === "'" && quote === undefined) quote = "'"
  }
  return false
}

// The variables the helper reads the role's credentials into: the first three a `read -r` on the
// assume-role line fills, which its --query lists as the key id, the secret and the token.
function credentialVariables(lines: readonly ShellLine[]): string[] {
  const assume = lines.find(line => /\baws\s+sts\s+assume-role\b/.test(line.text))
  const read = assume === undefined ? null : /\bread\s+-r\s+(\w+)\s+(\w+)\s+(\w+)/.exec(assume.text)
  return read === null ? [] : [read[1] ?? '', read[2] ?? '', read[3] ?? '']
}

// Whether a place in a line sits inside quotes. A ( … ) outside quotes, and a command substitution,
// $( … ), even inside double quotes, hold commands whose quotes start afresh; a backslash escapes the
// next character outside single quotes.
function quotedAt(text: string, offset: number): boolean {
  const outer: Array<string | undefined> = []
  let quote: string | undefined
  for (let i = 0; i < offset; i++) {
    const c = text[i]
    if (quote === "'") {
      if (c === "'") quote = undefined
    } else if (c === '\\') i += 1
    else if (quote === '"') {
      if (c === '"') quote = undefined
      else if (c === '$' && text[i + 1] === '(') {
        outer.push(quote)
        quote = undefined
        i += 1
      }
    } else if (c === '"' || c === "'") quote = c
    else if (c === '(') outer.push(undefined)
    else if (c === ')' && outer.length > 0) quote = outer.pop()
  }
  return quote !== undefined
}

// A credential's prefix assignment as bash takes one, NAME="$var" outside quotes, before a simple
// command's command word: at the start of the command (the line's start; after an unescaped ;, & or |
// that isn't part of a redirect; after (, so $( and <( too; or after !, {, then, do, else, if, elif,
// while or until), with nothing between but other assignments. Anywhere else the same text is an
// argument: env's, sudo's, or the command's own.
const ASSIGNMENT_WORD = `[A-Za-z_]\\w*=(?:"(?:[^"\\\\]|\\\\.)*"|'[^']*'|\\\\.|[^\\s"'\\\\;&|()<>])*`
const COMMAND_START = `(?:^|(?<![\\\\<>])[;&|]|(?<!\\\\)\\(|(?:^|\\s)(?:!|\\{|then|do|else|if|elif|while|until)\\s)`
function credentialPrefixes(credentials: readonly string[]): RegExp {
  const name = CREDENTIAL_ENV.join('|')
  const value = `"\\$\\{?(?:${credentials.join('|') || '(?!)'})\\}?"`
  return new RegExp(`(?<=${COMMAND_START}\\s*(?:${ASSIGNMENT_WORD}\\s+)*)(?:${name})=${value}(?=\\s)`, 'g')
}
const withoutPrefixes = (text: string, prefixes: RegExp): string =>
  text.replace(prefixes, (assignment: string, offset: number) => (quotedAt(text, offset) ? assignment : ''))
// A run of env (or /usr/bin/env, command env) or sudo: any AWS_ word among its arguments is in its argv.
const ENV_RUN = /(?:^|[\s;&|(!])(?:\/usr\/bin\/env|command\s+env|env|sudo)(?=\s)/g

// Each IG-09 rule the helper's text breaks, as "path: IG-09<x> why". The rules that run bash (b and d
// extracted, n's parse and mode) are infra.test.ts's, which uses shellFunction and reasonFormLines.
export function breakGlassFindings(path: string, text: string): Finding[] {
  const found: Finding[] = []
  const fail = (rule: string, why: string) => found.push(`${path}: IG-09${rule} ${why}`)
  const lines = shellLines(text)
  const functions = shellFunctions(lines)
  const inFunction = (index: number) => [...functions.values()].some(({ start, end }) => index >= start && index < end)
  const bodyOf = (name: string): ShellLine[] => {
    const range = functions.get(name)
    return range === undefined ? [] : lines.slice(range.start, range.end)
  }
  const defined = new Set(functions.keys())
  const isDefinition = (text: string) => /^[A-Za-z_]\w*\(\) \{$/.test(text)
  // The helper's own top-level commands, by index, and the functions a line calls.
  const main = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line, index }) => !inFunction(index) && !isDefinition(line.text) && line.text !== '}')
  const calls = (text: string) => [...defined].filter(name => new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(text))
  // Whether a line holds a pattern itself, or reaches it through the functions it calls.
  const reaches = (text: string, pattern: RegExp, seen = new Set<string>()): boolean =>
    pattern.test(text) ||
    calls(text).some(name => {
      if (seen.has(name)) return false
      seen.add(name)
      return bodyOf(name).some(line => reaches(line.text, pattern, seen))
    })
  const firstMain = (pattern: RegExp) => main.find(({ line }) => reaches(line.text, pattern))?.index ?? -1
  const firstLine = (pattern: RegExp) => lines.findIndex(line => pattern.test(line.text))
  const firstAws = firstLine(AWS_WORD)
  const before = (index: number, limit: number) => index >= 0 && (limit < 0 || index < limit)

  // a: strict from the first statement, and nothing traces.
  const statements = lines.filter((line, index) => !(index === 0 && line.text.startsWith('#!')))
  if (statements[0]?.text !== 'set -euo pipefail') fail('a', 'its first statement is set -euo pipefail')
  if (lines.some(line => traces(line.text))) fail('a', 'nothing traces: a trace prints every credential it touches')

  // b: a coding agent or CI refused before the first aws command, by exactly the markers the Owner
  // bootstrap script refuses, set or empty.
  const agents = bodyOf('refuse_agents').map(line => line.text)
  const markers = agents
    .map(line => /\bfor\s+\w+\s+in\s+([^;]+);\s*do\b/.exec(line)?.[1])
    .find(list => list !== undefined)
  if (
    markers === undefined ||
    JSON.stringify(markers.trim().split(/\s+/).sort()) !== JSON.stringify([...AGENT_MARKERS].sort()) ||
    !agents.some(line => /\$\{!\w+\+x\}/.test(line)) ||
    !agents.some(line => /\bexit\s+[1-9]/.test(line))
  ) {
    fail('b', `refuse_agents refuses each of ${AGENT_MARKERS.join(', ')}, set even empty, and exits non-zero`)
  }
  if (!before(main.find(({ line }) => /^refuse_agents$/.test(line.text))?.index ?? -1, firstAws)) {
    fail('b', 'refuse_agents runs before the first aws command')
  }

  // c: the C locale and the umask before the reason is checked.
  const reasonCheck = main.find(({ line }) => /\bvalid_reason\b/.test(line.text))?.index ?? -1
  for (const [statement, why] of [
    [/^export LC_ALL=C$/, "export LC_ALL=C, so a character class never matches another locale's characters"],
    [/^umask 077$/, 'umask 077, so every file it writes is its own'],
  ] as const) {
    if (!before(main.find(({ line }) => statement.test(line.text))?.index ?? -1, reasonCheck)) {
      fail('c', `${why}, before the reason is checked`)
    }
  }

  // d: the reason and its date checked by pure functions, before the first aws command.
  for (const name of ['valid_reason', 'valid_date']) {
    if (!functions.has(name)) fail('d', `${name} is defined`)
    else if (bodyOf(name).some(line => /\baws\b/.test(line.text))) fail('d', `${name} runs no aws command`)
  }
  if (!before(reasonCheck, firstAws)) fail('d', 'valid_reason checks the reason before the first aws command')

  // e: its own folder, config and region, and nothing inherited, before the first aws command.
  const exported = (assignment: string) =>
    main.find(({ line }) => /^export\s/.test(line.text) && line.text.split(/\s+/).includes(assignment))?.index ?? -1
  for (const assignment of [
    'AWS_STS_REGIONAL_ENDPOINTS=regional',
    'AWS_REGION=ap-southeast-1',
    'HOME="$BG_HOME"',
    'AWS_CONFIG_FILE="$BG_HOME/.aws/config"',
    'AWS_SHARED_CREDENTIALS_FILE=/dev/null',
    'AWS_EC2_METADATA_DISABLED=true',
  ]) {
    if (!before(exported(assignment), firstAws)) fail('e', `export ${assignment} before the first aws command`)
  }
  const unset = main.find(({ line }) => /^unset\s/.test(line.text))
  const unsetNames = unset?.line.text.split(/\s+/) ?? []
  if (
    !before(unset?.index ?? -1, firstAws) ||
    !['AWS_PROFILE', 'AWS_DEFAULT_PROFILE', ...CREDENTIAL_ENV].every(name => unsetNames.includes(name))
  ) {
    fail('e', 'unset every inherited credential and profile variable before the first aws command')
  }

  // f: its folder is the caller's own, mode 700, before HOME moves there.
  const modeCheck = main.find(({ line }) =>
    /\bfind\s+"\$BG_HOME"\s+-maxdepth\s+0\b.*-user\s+"\$\(id -u\)".*-perm\s+700\b/.test(line.text),
  )?.index
  if (!before(modeCheck ?? -1, exported('HOME="$BG_HOME"'))) {
    fail('f', 'its folder is checked to be the caller’s own, mode 700, before HOME is exported')
  }

  // g: no CLI history, no pager.
  if (!lines.some(line => /\baws\s+configure\s+get\s+cli_history\b/.test(line.text) && /\benabled\b/.test(line.text))) {
    fail('g', "the CLI's history is refused when enabled")
  }
  if (!before(main.find(({ line }) => /^export\s+AWS_PAGER=(?:''|"")?$/.test(line.text))?.index ?? -1, firstAws)) {
    fail('g', 'export AWS_PAGER= before the first aws command')
  }

  // h: a trap on every way out, set before the first sign-in, that signs out.
  const trap = main.find(({ line }) => /^trap\s+'?\w+'?\s+EXIT\s+INT\s+TERM\s+HUP$/.test(line.text))
  const handler = trap === undefined ? undefined : /^trap\s+'?(\w+)/.exec(trap.line.text)?.[1]
  if (trap === undefined || !before(trap.index, firstLine(/\baws\s+sso\s+login\b/))) {
    fail('h', "trap '<handler>' EXIT INT TERM HUP is set before the first aws sso login")
  }
  if (handler === undefined || !bodyOf(handler).some(line => /\baws\s+sso\s+logout\b/.test(line.text))) {
    fail('h', 'the trap’s handler runs aws sso logout')
  }

  // i: no credential written or printed, and nothing that would print one.
  const credentials = credentialVariables(lines)
  const credentialExpansion = new RegExp(`\\$\\{?(?:${[...CREDENTIAL_ENV, ...credentials].join('|')})\\b`)
  for (const line of lines) {
    if (writes(line.text) && (CREDENTIAL_NAMES.test(line.text) || credentialExpansion.test(line.text))) {
      fail('i', `line ${line.line} writes or prints a credential`)
    }
    for (const [pattern, why] of EXPOSING) if (pattern.test(line.text)) fail('i', `line ${line.line}: ${why}`)
    if (exportsAll(line.text)) fail('i', `line ${line.line}: allexport exports every variable, credentials among them`)
    const exports = /\b(?:export|declare\s+-[A-Za-z]*x|typeset\s+-[A-Za-z]*x)\s+(.*)$/.exec(line.text)?.[1] ?? ''
    if (exports.split(/\s+/).some(word => [...CREDENTIAL_ENV, ...credentials].includes(word.split('=')[0] ?? ''))) {
      fail('i', `line ${line.line} exports a credential, which every command would then hold`)
    }
  }

  // j: one assumption of the role, an hour at most, with the person's source identity and the reason.
  const assumes = lines.filter(line => /\baws\s+sts\s+assume-role\b/.test(line.text))
  const assume = assumes[0]?.text ?? ''
  const duration = /--duration-seconds\s+["']?(\d+)/.exec(assume)?.[1]
  if (
    assumes.length !== 1 ||
    !/--source-identity\s/.test(assume) ||
    !/--tags\s+["']?Key=hearth-reason,Value=/.test(assume) ||
    !/--role-session-name\s/.test(assume) ||
    duration === undefined ||
    Number(duration) > 3600
  ) {
    fail(
      'j',
      'exactly one aws sts assume-role, with --source-identity, --tags Key=hearth-reason,Value=…, --role-session-name and --duration-seconds of at most 3600',
    )
  }

  // k: entries built by jq from arguments, never as JSON text; never over another; the open entry
  // before the shell, the close after it.
  if (lines.some(line => /\\?"[\w-]+\\?"\s*:/.test(line.text))) {
    fail('k', 'an entry is built by jq -n --arg, never by writing fields into JSON text')
  }
  if (lines.some(line => jqPrograms(line.text).some(expands))) {
    fail('k', 'a jq program is written whole in single quotes, its fields given by --arg, never expanded into it')
  }
  if (!lines.some(line => /\bjq\s+-[a-z]*n[a-z]*\s.*--arg\s/.test(line.text))) {
    fail('k', 'entries are built by jq -n --arg')
  }
  if (
    lines.some(
      line =>
        /\bput-object\b/.test(line.text) &&
        !(/--if-none-match\s/.test(line.text) && /--checksum-algorithm\s/.test(line.text)),
    )
  ) {
    fail('k', 'each put-object carries --if-none-match and --checksum-algorithm')
  }
  const shell = firstMain(/\bbash\s+--rcfile\b/)
  const open = firstMain(/\bentry:\s*"open"/)
  const closes = main.filter(({ line }) => reaches(line.text, /\bentry:\s*"close"/)).map(({ index }) => index)
  if (shell < 0 || !before(open, shell) || !closes.some(index => index > shell)) {
    fail('k', 'the open entry is written before the shell opens, and the close entry after it ends')
  }

  // l: curl only in the console function, only to the sign-in endpoint, its link printed only when
  // --console asks.
  // A run of curl, not the check that it is installed.
  const curls = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /(?:^|[\s;&|(])curl\s/.test(line.text.replace(/\bcommand\s+-v\s+curl\b/g, '')))
  const consoleFns = [...functions].filter(([, { start, end }]) =>
    curls.some(({ index }) => index >= start && index < end),
  )
  const consoleFn = consoleFns[0]?.[0]
  if (
    curls.length > 0 &&
    (consoleFns.length !== 1 ||
      curls.some(({ index }) => !consoleFns.some(([, r]) => index >= r.start && index < r.end)))
  ) {
    fail('l', 'curl runs only in the console function')
  }
  for (const { line } of curls) {
    const urls = line.text.match(/https?:\/\/[^\s'")]+/g) ?? []
    if (urls.length === 0 || urls.some(url => url !== 'https://signin.aws.amazon.com/federation')) {
      fail('l', `line ${line.line}: curl goes only to https://signin.aws.amazon.com/federation`)
    }
  }
  // The console function runs only from a main-flow line that asks for --console, written
  // `if [ "$console" = yes ]; then <function>; fi`, and no other function calls it, since the run calls
  // those whatever --console says.
  const signIn = lines.map((line, index) => ({ line, index })).filter(({ line }) => /\bAction=login\b/.test(line.text))
  const consoleRange = consoleFn === undefined ? undefined : functions.get(consoleFn)
  const consoleCall = (text: string) => consoleFn !== undefined && calls(text).includes(consoleFn)
  if (
    signIn.some(({ index }) => consoleRange === undefined || index < consoleRange.start || index >= consoleRange.end) ||
    main.some(({ line }) => consoleCall(line.text) && line.text !== `if [ "$console" = yes ]; then ${consoleFn}; fi`) ||
    [...functions].some(
      ([name, { start, end }]) => name !== consoleFn && lines.slice(start, end).some(line => consoleCall(line.text)),
    )
  ) {
    fail('l', 'the sign-in link is made and printed only when --console asks')
  }

  // m: the environment is one of three, and log-archive takes only an incident or a drill.
  const flat = lines
    .map(line => line.text)
    .join('\n')
    .replace(/\s+/g, ' ')
  // Each check whole, from case to esac, so no other arm takes anything more.
  if (!flat.includes('case "$environment" in nonprod | prod | log-archive) ;; *) usage ;; esac')) {
    fail('m', 'the environment is checked against exactly nonprod, prod and log-archive')
  }
  if (
    !flat.includes(
      'if [ "$environment" = log-archive ]; then case "$reason" in incident:* | drill:*) ;; *) usage ;; esac fi',
    )
  ) {
    fail('m', 'in log-archive only an incident: or drill: reason is taken')
  }

  // o: a credential reaches a command only as a bash prefix assignment, never as an argument, through
  // env or sudo, or to curl at all.
  const prefixes = credentialPrefixes(credentials)
  for (const line of lines) {
    if (credentialExpansion.test(withoutPrefixes(line.text, prefixes))) {
      fail('o', `line ${line.line}: a credential reaches a command other than by a prefix assignment`)
    }
    if (
      [...line.text.matchAll(ENV_RUN)].some(run =>
        wordsAsWritten(line.text.slice((run.index ?? 0) + run[0].length)).some(word => word.includes('AWS_')),
      )
    ) {
      fail('o', `line ${line.line}: an AWS_ variable is passed through env or sudo, which puts it in an argument`)
    }
  }
  for (const { line } of curls) {
    if (credentialExpansion.test(line.text) || /Session=/.test(line.text) || !/Session@/.test(line.text)) {
      fail(
        'o',
        `line ${line.line}: curl reads the session only from a file (Session@…), never from a variable or an argument`,
      )
    }
  }

  // p: --amend writes its one entry and signs out: no shell, no console, no open or close entry, and
  // never beside --console. Both the function that writes the amend entry and the run's own --amend
  // branch are read: the branch, from `if [ -n "$amend" ]; then` to its fi, reaches none of them,
  // calls the amend and exits straight after it, so an amend run ends in the amend's sign-out and
  // never goes on into a session.
  const notInAmend = /\bbash\s+--rcfile\b|(?:^|[\s;&|(])curl\s|\bentry:\s*"(?:open|close)"/
  const amend = [...functions.keys()].find(name => bodyOf(name).some(line => /\bentry:\s*"amend"/.test(line.text)))
  const amendBody = amend === undefined ? [] : bodyOf(amend)
  if (
    amend === undefined ||
    amendBody.some(line => reaches(line.text, notInAmend)) ||
    !/^aws\s+sso\s+logout\b/.test(amendBody.at(-1)?.text ?? '')
  ) {
    fail(
      'p',
      'the amend writes its one entry and ends in aws sso logout, reaching no shell, no console and no open or close entry',
    )
  }
  const branchStart = main.find(({ line }) => line.text === 'if [ -n "$amend" ]; then')?.index ?? -1
  let branchEnd = -1
  for (let i = branchStart + 1, depth = 1; branchStart >= 0 && i < lines.length; i++) {
    const text = lines[i]?.text ?? ''
    if (/^if\s.*;\s*then$/.test(text)) depth += 1
    else if (text === 'fi') depth -= 1
    if (depth === 0) {
      branchEnd = i
      break
    }
  }
  const branch = branchEnd < 0 ? [] : lines.slice(branchStart + 1, branchEnd)
  if (
    amend === undefined ||
    branch.length < 2 ||
    branch.some(line => reaches(line.text, notInAmend)) ||
    !/^exit(?:\s+\d+)?$/.test(branch.at(-1)?.text ?? '') ||
    !calls(branch.at(-2)?.text ?? '').includes(amend)
  ) {
    fail(
      'p',
      'the run’s --amend branch reaches no shell, no console and no open or close entry, and exits straight after the amend',
    )
  }
  if (
    !lines.some(
      line =>
        /\$amend\b/.test(line.text) && /\$console\b/.test(line.text) && /\b(?:refuse|usage|exit)\b/.test(line.text),
    )
  ) {
    fail('p', '--console beside --amend is refused')
  }
  return found
}

// --- IG-10: the model lists' one home (C11-D06) -------------------------------------------------

// The files whose model strings are held elsewhere: models.ts, the lists themselves, and the
// generated bootstrap template, which IAC-24 holds byte for byte to what the generator renders from
// them.
export const MODEL_STRINGS_EXEMPT = ['infra/src/config/models.ts', 'infra/bootstrap/hearth-bootstrap.yaml'] as const

// A service:action token, as an IAM action pattern is written.
const MODEL_TOKEN = /(?<![\w-])([a-z][a-z0-9-]*):([A-Za-z0-9*?]+)/gi

// Whether a token names a model service or action: its service is a model prefix, whatever its
// action, or its action isn't exactly `*` and can match a model action.
export function namesModel(service: string, action: string): boolean {
  const lower = `${service}:${action}`.toLowerCase()
  if (MODEL_SERVICE_PREFIXES.some(prefix => prefix === service.toLowerCase())) return true
  return action !== '*' && MODEL_ACTIONS.some(model => globsOverlap(lower, model.toLowerCase()))
}

// The text IG-10 reads of a file: a script's string literals and template text, so a comment or an
// object key is no finding; any other file whole.
function modelTexts(path: string, text: string): Array<{ line: number; text: string }> {
  if (!/\.[cm]?[jt]sx?$/.test(path)) return text.split('\n').map((line, index) => ({ line: index + 1, text: line }))
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const found: Array<{ line: number; text: string }> = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      found.push({ line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: node.text })
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

// Each place a file under infra/ names a model service or action, as "path:line: IG-10 why". The
// deny renders modelDenyActions(), and a test builds what it plants from the lists.
export function modelStringFindings(path: string, text: string): Finding[] {
  if (!path.startsWith('infra/') || (MODEL_STRINGS_EXEMPT as readonly string[]).includes(path)) return []
  const found = new Set<string>()
  for (const { line, text: value } of modelTexts(path, text)) {
    for (const [, service = '', action = ''] of value.matchAll(MODEL_TOKEN)) {
      if (namesModel(service, action)) {
        found.add(
          `${path}:${line}: IG-10 names a model service or action; the lists live in infra/src/config/models.ts alone`,
        )
      }
    }
  }
  return [...found]
}

// The aws-cdk-lib modules of the model services, which infra never imports: each prefix with its
// hyphens dropped, and AWS DevOps Agent's, whose IAM prefix is aidevops.
export const MODEL_MODULES: readonly string[] = [
  ...new Set([...MODEL_SERVICE_PREFIXES.map(prefix => prefix.replace(/-/g, '')), 'devopsagent']),
]

// Each model service module a script imports, re-exports or reaches through aws-cdk-lib's root.
export function modelModuleFindings(path: string, source: string, code: string): Finding[] {
  const found: Finding[] = []
  for (const spec of importsOf(source, path)) {
    const module = /^aws-cdk-lib\/aws-([a-z0-9]+)$/.exec(spec)?.[1]
    if (module !== undefined && MODEL_MODULES.includes(module)) {
      found.push(`${path}: IG-10 imports aws-cdk-lib's ${module} module, a model service's`)
    }
  }
  for (const [, module = ''] of code.matchAll(/\baws_([a-z0-9]+)\b/g)) {
    if (MODEL_MODULES.includes(module))
      found.push(`${path}: IG-10 uses aws-cdk-lib's ${module} module, a model service's`)
  }
  return found
}

// --- IG-12: no executable assets (C11-D76) ------------------------------------------------------

// An asset the CDK CLI would build or run where deploy credentials exist: a file source's executable,
// a Docker image's build folder, the synthesizer's image asset, bundling, and an image built at synth.
// The assertion tests name the first two, to look for them in an asset manifest (IAC-22).
export const ASSET_RULES: readonly CodeRule[] = [
  {
    id: 'IG-12',
    pattern: /\bexecutable\b/,
    why: "an asset source's executable makes the CDK CLI run a command where deploy credentials exist",
    assertionsMayName: true,
  },
  {
    id: 'IG-12',
    pattern: /\bdirectoryName\b/,
    why: "a Docker image asset's build folder makes the CLI run docker build",
    assertionsMayName: true,
  },
  { id: 'IG-12', pattern: /\baddDockerImageAsset\s*\(/, why: 'an image asset makes the CLI build one' },
  { id: 'IG-12', pattern: /\bbundling\s*:/, why: 'bundling runs code or Docker at synth' },
  { id: 'IG-12', pattern: /\bDockerImage\s*\.\s*fromBuild\s*\(/, why: 'an image built at synth runs Docker' },
]

// --- C11-D62: the landing-zone synth runs credential-free and offline ---------------------------

// A command line's words as written, quotes kept, split at whitespace outside quotes.
function rawWords(command: string): string[] {
  const words: string[] = []
  let word = ''
  let quote: string | undefined
  for (const c of command) {
    if (quote !== undefined) {
      word += c
      if (c === quote) quote = undefined
    } else if (c === "'" || c === '"') {
      quote = c
      word += c
    } else if (/\s/.test(c)) {
      if (word !== '') words.push(word)
      word = ''
    } else {
      word += c
    }
  }
  if (word !== '') words.push(word)
  return words
}

// The environment synth:lz runs in: every inherited variable dropped (env -i) but PATH, a HOME made
// for the run (so the CLI reads no ~/.cdk.json and loads no plugin), both AWS files pointed at
// /dev/null, the metadata service, telemetry and the version check off, and the fixture.
export const SYNTH_LZ_ENVIRONMENT = [
  'PATH="$PATH"',
  'HOME="$(mktemp -d)"',
  'AWS_CONFIG_FILE=/dev/null',
  'AWS_SHARED_CREDENTIALS_FILE=/dev/null',
  'AWS_EC2_METADATA_DISABLED=true',
  'CDK_DISABLE_CLI_TELEMETRY=true',
  'CDK_DISABLE_VERSION_CHECK=true',
  'HEARTH_FIXTURE=1',
] as const

// What's wrong with infra's synth:lz script: it must run the CLI in exactly that environment, as
// synth of the landing-zone entry with no lookups, notices or output, and with no profile, role or
// instance credentials.
export function synthScriptProblems(command: string): Finding[] {
  const found: Finding[] = []
  const at = 'infra/package.json synth:lz'
  const words = rawWords(command)
  if (words[0] !== 'env' || words[1] !== '-i')
    found.push(`${at}: C11-D62 starts with env -i, dropping every inherited variable`)
  const cdk = words.indexOf('cdk')
  const assignments = words.slice(2, cdk < 0 ? undefined : cdk)
  if (JSON.stringify([...assignments].sort()) !== JSON.stringify([...SYNTH_LZ_ENVIRONMENT].sort())) {
    found.push(`${at}: C11-D62 sets exactly ${SYNTH_LZ_ENVIRONMENT.join(' ')}`)
  }
  const cli = cdk < 0 ? [] : words.slice(cdk)
  if (cli.slice(0, 4).join(' ') !== "cdk synth --app 'node bin/landing-zone.ts'") {
    found.push(`${at}: C11-D62 runs cdk synth --app 'node bin/landing-zone.ts'`)
  }
  for (const flag of ['--no-lookups', '--no-notices', '--quiet']) {
    if (!cli.includes(flag)) found.push(`${at}: C11-D62 passes ${flag}`)
  }
  for (const flag of ['--profile', '--role-arn', '--ec2creds']) {
    if (cli.some(word => word === flag || word.startsWith(`${flag}=`))) found.push(`${at}: C11-D62 passes no ${flag}`)
  }
  return found
}

// What's wrong with ci.yml for the landing zone's synth (C11-D62): the check job runs synth:lz
// straight after npm test, and the workflow can hold no AWS credential: no id-token permission, only
// contents: read at the top, no credentials action and no AWS_ variable. DPW-02 (C0.11 PR 4) takes
// the id-token clause over for every workflow.
export function ciSynthProblems(text: string, steps: readonly string[]): Finding[] {
  const found: Finding[] = []
  const test = steps.findIndex(step => /^run: npm test$/m.test(step))
  if (test < 0 || !/^run: npm run synth:lz -w @hearth\/infra$/m.test(steps[test + 1] ?? '')) {
    found.push(
      '.github/workflows/ci.yml: C11-D62 the check job runs npm run synth:lz -w @hearth/infra straight after npm test',
    )
  }
  if (text.split('\n').some(line => /^\s*id-token\s*:/.test(line))) {
    found.push('.github/workflows/ci.yml: C11-D62 no job may ask for an id-token')
  }
  if (!/^permissions:\n {2}contents: read\n(?! )/m.test(text)) {
    found.push('.github/workflows/ci.yml: C11-D62 the top-level permissions are contents: read alone')
  }
  if (/aws-actions\/configure-aws-credentials/.test(text)) {
    found.push('.github/workflows/ci.yml: C11-D62 no step takes AWS credentials')
  }
  if (text.split('\n').some(line => !/^\s*#/.test(line) && /(?:^|[\s'"])AWS_[A-Z0-9_]*\s*[:=]/.test(line))) {
    found.push('.github/workflows/ci.yml: C11-D62 no line sets an AWS_ variable')
  }
  return found
}
