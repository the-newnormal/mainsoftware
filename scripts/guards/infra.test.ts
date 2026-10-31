// The infra source guard (IG, C0.11; TECH-SPEC T24 item 28): what the CDK app's source must and
// mustn't hold, before any template is synthesised. Each case is first proved on planted text, then
// held over the repository. The templates themselves are the assertion tests' (IAC, infra/**/*.test.ts).
// Cases so far (C0.11 PR 1 and PR 2): IG-01 to IG-12, and C11-D62's synth:lz script and ci.yml step.
// This file and infra.ts are on the owner's-read list (C11-D74).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MODEL_ACTIONS, MODEL_SERVICE_PREFIXES } from '../../infra/src/config/models.ts'
import { CASE_REFERENCE_PATTERN, type CaseReference, formatCaseReference } from '../../packages/shared/src/cases.ts'
import { AGENT_MARKERS } from '../owner-bootstrap/target.ts'
import type { Workspace } from './boundaries'
import { ACCOUNT_ID, PHONE_NUMBER } from './identifying'
import { importsOf, withoutComments } from './imports'
import {
  ALLOWED_CUSTOM_RESOURCE,
  ASSET_RULES,
  breakGlassFindings,
  cdkJsonProblems,
  ciSynthProblems,
  DESTROY_RULES,
  GROUP_ID,
  IDENTITY_CENTER_ID,
  IMAGE_RULES,
  identifyingIn,
  importGraph,
  infraImportProblem,
  LAMBDA_RULES,
  LOOKUP_RULES,
  MODEL_MODULES,
  modelModuleFindings,
  modelStringFindings,
  ORGANIZATIONS_ID,
  packageFindings,
  readsForIdentifying,
  reasonFormLines,
  regionFindings,
  ruleFindings,
  scriptFindings,
  shellFunction,
  synthScriptProblems,
  testImportFindings,
  workloadGraphFindings,
} from './infra'
import { isScript, readRepoFile, repoFiles, root } from './repo-files'
import { workflowJobs } from './workflow'

const files = repoFiles()
const infraScripts = files.filter(path => path.startsWith('infra/') && isScript(path))
const code = (path: string) => withoutComments(path, readRepoFile(path))
const workspaces: Workspace[] = files
  .filter(path => /^(?:apps\/[^/]+|packages\/[^/]+|infra|demo)\/package\.json$/.test(path))
  .map(path => {
    const manifest = JSON.parse(readRepoFile(path))
    return { dir: path.slice(0, -'package.json'.length), name: manifest.name, imports: manifest.imports }
  })

describe('IG: the guard reads the infra workspace', () => {
  it('finds both entries, the configuration and its tests, the landing zone, the helper and the bootstrap template, so no rule passes by reading nothing', () => {
    expect(infraScripts).toEqual(
      expect.arrayContaining([
        'infra/bin/workload.ts',
        'infra/bin/landing-zone.ts',
        'infra/src/config/env.ts',
        'infra/src/config/models.ts',
        'infra/src/config/profiles.ts',
        'infra/src/testing/fixture.ts',
        'infra/scripts/bootstrap-template.ts',
        'infra/src/foundation/guardrails.ts',
        'infra/src/foundation/log-archive.ts',
        'infra/src/baseline/break-glass.ts',
        'infra/src/aspects/nag.ts',
      ]),
    )
    expect(files).toEqual(expect.arrayContaining(['infra/bin/break-glass.sh', 'infra/bootstrap/hearth-bootstrap.yaml']))
  })
})

describe('IG-01 (C11-D24, C11-D25, C11-D37): no account id, organisation, OU or Identity Center id, ARN, email, group id, phone number or Twilio SID in infra/ or the deploy workflow', () => {
  // Built here, so this file holds no plausible value either.
  const digits = (n: number) => '1'.repeat(n)

  it('finds each shape on planted text, comments included, and lets through only action pins and digests', () => {
    const planted = [
      `const account = '${digits(12)}'`,
      `// the prod account, ${digits(4)}-${digits(4)}-${digits(4)}`,
      `const role = '${['arn', 'aws', 'iam', '', digits(3), 'role/x'].join(':')}'`,
      `const to = '${['ops', 'example.org'].join('@')}'`,
      `const year = ${['3153', '6000'].join('')}`,
      `      - uses: actions/checkout@${'0123456789'.repeat(4)} # v5.0.0`,
      `const commit = '${'0123456789'.repeat(4)}'`,
      `image: x@sha256:${'0123456789abcdef'.repeat(4)}`,
      `const year = 365 * 24 * 60 * 60`,
      "const commit = 'f'.repeat(40)",
      `const sid = '${['AC', 'b'.repeat(32)].join('')}'`,
      `const group = '${['0a1b2c3d', 'e4f5', '4a6b', '8c7d', 'e8f90a1b2c3d'].join('-')}'`,
      `// the on-call group, ${['0a1b2c3d4e', 'f5a6b7c8', '9d0e', '4f1a', 'b2c3', 'd4e5f6a7b8c9'].join('-')}`,
      `const group = fixtureGroupId(1)`,
    ].join('\n')
    expect(identifyingIn('infra/src/x.ts', planted)).toEqual([
      `infra/src/x.ts:1: ${ACCOUNT_ID}`,
      `infra/src/x.ts:2: ${ACCOUNT_ID}`,
      'infra/src/x.ts:3: an ARN',
      'infra/src/x.ts:4: an email address',
      `infra/src/x.ts:5: ${PHONE_NUMBER}`,
      `infra/src/x.ts:7: ${ACCOUNT_ID}`,
      'infra/src/x.ts:11: a Twilio SID',
      `infra/src/x.ts:12: ${GROUP_ID}`,
      `infra/src/x.ts:13: ${GROUP_ID}`,
    ])
    // A SHA is let through only on a `uses:` line, and a finding never holds the value.
    expect(identifyingIn('x', `run: echo @${'0123456789'.repeat(4)}`)).toEqual([`x:1: ${ACCOUNT_ID}`])
    expect(identifyingIn('x', `const a = '${digits(12)}'`).join('')).not.toMatch(/\d{5}/)
  })

  it('finds the organisation’s own ids: organization, root and OU ids, the Identity Center instance and its store', () => {
    const id = (...parts: string[]) => parts.join('-')
    const planted = [
      `const org = '${id('o', 'k3x9q2m7wz')}'`,
      `const root = '${id('r', '7qz2')}'`,
      `const ou = '${id('ou', '7qz2', 'k3x9q2m7')}'`,
      `const sso = '${id('ssoins', '82104a7c5e3b9d6f')}'`,
      `const store = '${id('d', '9067a1b2c3')}'`,
      `// sign in at https://${id('d', '9067a1b2c3')}.awsapps.com/start`,
      "const unused = 'no-unused-vars auto-generated hearth-ou-security'",
      `const parts = [${id('for', 'r', 'abcd')}, ${id('r', 'abcd', 'efgh')}]`,
      "const id = 'o-' + 'a'.repeat(10)",
      "const root = ['r', 'abcd'].join('-')",
    ].join('\n')
    expect(identifyingIn('infra/src/x.ts', planted)).toEqual([
      `infra/src/x.ts:1: ${ORGANIZATIONS_ID}`,
      `infra/src/x.ts:2: ${ORGANIZATIONS_ID}`,
      `infra/src/x.ts:3: ${ORGANIZATIONS_ID}`,
      `infra/src/x.ts:4: ${IDENTITY_CENTER_ID}`,
      `infra/src/x.ts:5: ${IDENTITY_CENTER_ID}`,
      `infra/src/x.ts:6: ${IDENTITY_CENTER_ID}`,
    ])
  })

  it('reads infra/, the deploy workflow, its environments and their script, and nothing else', () => {
    expect(readsForIdentifying('infra/.env.example')).toBe(true)
    expect(readsForIdentifying('infra/cdk.json')).toBe(true)
    expect(readsForIdentifying('.github/workflows/deploy.yml')).toBe(true)
    expect(readsForIdentifying('.github/environments/prod.json')).toBe(true)
    expect(readsForIdentifying('scripts/protect-environments.sh')).toBe(true)
    expect(readsForIdentifying('.github/workflows/ci.yml')).toBe(false)
    expect(readsForIdentifying('apps/server/src/config.ts')).toBe(false)
  })

  it('the real files hold none', () => {
    const read = files.filter(readsForIdentifying)
    expect(read).toEqual(expect.arrayContaining(['infra/.env.example', 'infra/cdk.json', 'infra/package.json']))
    expect(read.flatMap(path => identifyingIn(path, readRepoFile(path)))).toEqual([])
  })
})

describe('IG-02 (C11-D24): no lookup', () => {
  it('finds each lookup on planted code', () => {
    const planted = [
      "ec2.Vpc.fromLookup(this, 'v', {})",
      "route53.HostedZone.fromLookup(this, 'z', { domainName: 'x' })",
      "ssm.StringParameter.valueFromLookup(this, '/x')",
      "ec2.PrefixList.fromLookup(this, 'p', { prefixListName: 'x' })",
      "ssm.StringParameter.valueForStringParameter(this, '/hearth/nonprod/zone/app')",
      "ec2.MachineImage.lookup({ name: 'x' })",
      "new ec2.LookupMachineImage({ name: 'x' })",
      'ec2.MachineImage.latestAmazonLinux2023({ cachedInContext: true })',
      "cdk.ContextProvider.getValue(this, { provider: 'vpc-provider', props: {} })",
      'ec2.MachineImage.latestAmazonLinux2023()',
    ]
    expect(planted.map(line => ruleFindings('x.ts', line, LOOKUP_RULES).length)).toEqual([1, 1, 1, 1, 0, 1, 1, 1, 1, 0])
  })

  it('no infra script makes one', () => {
    expect(infraScripts.flatMap(path => ruleFindings(path, code(path), LOOKUP_RULES))).toEqual([])
  })
})

describe('IG-03 (C11-D24, C11-D48): no context file, cdk.out ignored, cdk.json runs the workload entry with no plugin', () => {
  it('refuses another app or a plugin, on planted JSON', () => {
    expect(cdkJsonProblems({ app: 'node bin/workload.ts', context: {} })).toEqual([])
    expect(cdkJsonProblems({ app: 'npx tsx bin/workload.ts' })).toEqual([
      "infra/cdk.json: IG-03 app must be 'node bin/workload.ts'",
    ])
    expect(cdkJsonProblems({ app: 'node bin/workload.ts', plugin: ['x'] })).toEqual([
      'infra/cdk.json: IG-03 a plugin runs code inside the CLI',
    ])
    expect(cdkJsonProblems([])).toEqual(['infra/cdk.json: IG-03 is not a JSON object'])
    expect(cdkJsonProblems(null)).toEqual(['infra/cdk.json: IG-03 is not a JSON object'])
  })

  it('infra/cdk.json passes', () => {
    expect(cdkJsonProblems(JSON.parse(readRepoFile('infra/cdk.json')))).toEqual([])
  })

  it('no cdk.context.json is tracked or waiting to be, and git ignores it and cdk.out/', () => {
    expect(files.filter(path => /(^|\/)cdk\.context\.json$/.test(path))).toEqual([])
    expect(files.filter(path => /(^|\/)cdk\.out\//.test(path))).toEqual([])
    const ignored = (path: string) => {
      try {
        execFileSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: root })
        return true
      } catch {
        return false
      }
    }
    expect(ignored('infra/cdk.context.json')).toBe(true)
    expect(ignored('infra/cdk.out/manifest.json')).toBe(true)
  })
})

describe('IG-04: nothing stateful or log-holding given away or made deletable', () => {
  it('finds each on planted code', () => {
    const planted = [
      'bucket.grantReadWrite(role)',
      'bucket.grantDelete(role)',
      'secret.grantRead(role)',
      'new s3.Bucket(this, "b", { autoDeleteObjects: true })',
      'logGroup.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY)',
      "new CfnThing(this, 'x').applyRemovalPolicy('destroy' as never)",
      "const props = { removalPolicy: 'destroy' }",
      'bucket.applyRemovalPolicy(RemovalPolicy.RETAIN)',
      // aws-cdk-lib 2.274.0's grants objects, which its deprecation notices steer to, and grantWrite,
      // which on a bucket grants object deletion too.
      'bucket.grantWrite(role)',
      'bucket.grants.readWrite(role)',
      'bucket.grants.delete(role)',
      'bucket . grants . write(role)',
      'bucket.grants.putAcl(role)',
      'const grants = bucket.grants',
      's3.BucketGrants.fromBucket(bucket).write(role)',
      "new ecr.Repository(this, 'r', { emptyOnDelete: true })",
      'bucket.grants.read(role)',
      'bucket.grantRead(role)',
      // ECR's auto-delete, which empties a repository through a Lambda (C11-D44).
      "new ecr.Repository(this, 'r', { autoDeleteImages: true })",
      "new ecr.Repository(this, 'r', { imageScanOnPush: true })",
    ]
    expect(planted.map(line => ruleFindings('x.ts', line, DESTROY_RULES).length)).toEqual([
      1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0,
    ])
  })

  // aws-cdk-lib 2.274.0's other ways to make something deletable, and a grants object destructured
  // (R2GUARD-03).
  it('finds a removal policy over a scope, an L1’s deletion attributes and a destructured grants object', () => {
    const planted = [
      'if (!profile.holdsRealData) cdk.RemovalPolicies.of(this).destroy()',
      'MissingRemovalPolicies.of(this).destroy()',
      'cfnLogGroup.cfnOptions.deletionPolicy = cdk.CfnDeletionPolicy.DELETE',
      "cfnBucket.cfnOptions.updateReplacePolicy = 'Delete' as cdk.CfnDeletionPolicy",
      "cfnBucket.addOverride('DeletionPolicy', 'Delete')",
      "cfnRepository.addDeletionOverride('UpdateReplacePolicy')",
      'const { grants } = bucket; grants.write(role)',
      'const { grants: g } = bucket',
      'grants.delete(role)',
      'cfnLogGroup.cfnOptions.deletionPolicy = cdk.CfnDeletionPolicy.RETAIN',
      "cfnBucket.addOverride('Properties.VersioningConfiguration.Status', 'Enabled')",
      'bucket.grants.read(role)',
    ]
    expect(planted.map(line => ruleFindings('x.ts', line, DESTROY_RULES).length)).toEqual([
      1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 0, 0,
    ])
  })

  it('no infra script does', () => {
    expect(infraScripts.flatMap(path => ruleFindings(path, code(path), DESTROY_RULES))).toEqual([])
  })
})

describe('IG-05 (D37, B.6): every stack in ap-southeast-1, C0.12’s Hearth-*-Edge alone in us-east-1', () => {
  it('finds each other region, and an env it can’t read, on planted code', () => {
    const planted = [
      "new cdk.Stack(app, 'Hearth-nonprod-Platform', { env: { region: REGION } })",
      "new cdk.Stack(app, 'Hearth-Foundation', { env: { account: config.accounts.management, region: 'ap-southeast-1' } })",
      "new cdk.Stack(app, 'Hearth-nonprod-Data', { env: { region: 'us-east-1' } })",
      `new cdk.Stack(app, \`Hearth-\${name}-Edge\`, { env: { region: 'us-east-1' } })`,
      "new cdk.Stack(app, 'Hearth-prod-Services', { env })",
      "new cdk.Stack(app, 'Hearth-prod-Tasks', { env: { region } })",
      "new cdk.Stack(app, 'Hearth-prod-Tasks', { env: { account: '1' } })",
      "new cdk.Stack(app, 'Hearth-prod-Tasks', { env: props.env })",
      "new cdk.Stage(app, 'Edge', { env: { region: 'eu-west-1' } })",
      "new WorkloadStage(app, 'nonprod', { ...props, env: { region: 'ap-southeast-1' } })",
      "class FoundationStack extends cdk.Stack { constructor(s, i) { super(s, i, { env: { region: 'us-east-1' } }) } }",
      "class EdgeStack extends cdk.Stack { constructor(s, i) { super(s, i, { env: { region: 'us-east-1' } }) } }",
      "execFile(node, [entry], { env: { PATH: '/usr/bin' } })",
      "const condition = { StringNotEquals: { 'aws:RequestedRegion': 'us-east-1' }, env: { region: 'x' } }",
    ].join('\n')
    expect(regionFindings('infra/bin/x.ts', planted)).toEqual([
      'infra/bin/x.ts:3: IG-05 env.region must be ap-southeast-1 (REGION)',
      'infra/bin/x.ts:5: IG-05 write env out, as env: { region: REGION }',
      'infra/bin/x.ts:6: IG-05 write region out, as env: { region: REGION }',
      'infra/bin/x.ts:7: IG-05 env.region must be ap-southeast-1 (REGION)',
      'infra/bin/x.ts:8: IG-05 env must be an object literal naming its region',
      'infra/bin/x.ts:9: IG-05 env.region must be ap-southeast-1 (REGION)',
      'infra/bin/x.ts:11: IG-05 env.region must be ap-southeast-1 (REGION)',
    ])
  })

  it('reads every stack and stage class and every props argument, refusing what it can’t read', () => {
    const planted = [
      'class Platform extends cdk.Stack { constructor(s, i, p) { super(s, i, p) } }',
      "new Platform(app, 'Hearth-nonprod-Platform', { env: { region: 'us-east-1' } })",
      "const props = { env: { region: 'eu-west-1' } }",
      "new cdk.Stack(app, 'Hearth-nonprod-Data', props)",
      'class DataStack extends cdk.Stack { constructor(s: Construct, i: string, props: cdk.StackProps) { super(s, i, props) } }',
      'class OtherStack extends cdk.Stack { constructor(s, i) { super(s, i, OTHER) } }',
      "new DataStack(app, 'Hearth-prod-Data', { ...props })",
      "new DataStack(app, 'Hearth-prod-Data', { env: { region: REGION }, ...props })",
      "new DataStack(app, 'Hearth-prod-Data', { ...props, env: { region: REGION } })",
      'const Anon = class extends cdk.Stage {}',
      'class HearthStack extends cdk.Stack {}',
      'class PlatformStack extends HearthStack {}',
      'class Services extends HearthStack {}',
      "function make(app, p) { return new cdk.Stack(app, 'Hearth-x', p) }",
      "class WorkloadStage extends cdk.Stage { constructor(s, i, props: cdk.StageProps) { super(s, i, props); new PlatformStack(this, 'Platform', props) } }",
      "new cdk.Stack(app, 'Hearth-nonprod-Tools')",
      // A spread in env after its region can override it; one before it can't.
      "new cdk.Stack(app, 'Hearth-prod-Data', { env: { region: REGION, ...props.env } })",
      "new cdk.Stack(app, 'Hearth-prod-Data', { env: { ...other } })",
      "new cdk.Stack(app, 'Hearth-prod-Data', { env: { ...props.env, region: REGION } })",
      // An env given by a getter, which the guard can't read.
      "new cdk.Stack(app, 'Hearth-prod-Data', { get env() { return { region: 'us-east-1' } } })",
    ].join('\n')
    expect(regionFindings('infra/bin/x.ts', planted)).toEqual([
      'infra/bin/x.ts:1: IG-05 a class extending a stack or stage is named …Stack or …Stage, so the guard reads its env',
      "infra/bin/x.ts:4: IG-05 props must be an object literal with env written out, or the constructor's own props passed on",
      "infra/bin/x.ts:6: IG-05 props must be an object literal with env written out, or the constructor's own props passed on",
      'infra/bin/x.ts:7: IG-05 write env out after the last spread, as env: { region: REGION }',
      'infra/bin/x.ts:8: IG-05 write env out after the last spread, as env: { region: REGION }',
      'infra/bin/x.ts:10: IG-05 a class extending a stack or stage is named …Stack or …Stage, so the guard reads its env',
      'infra/bin/x.ts:13: IG-05 a class extending a stack or stage is named …Stack or …Stage, so the guard reads its env',
      "infra/bin/x.ts:14: IG-05 props must be an object literal with env written out, or the constructor's own props passed on",
      'infra/bin/x.ts:16: IG-05 a stack or stage with no env deploys wherever the CLI points; write env: { region: REGION }',
      'infra/bin/x.ts:17: IG-05 write region out after the last spread, as env: { region: REGION }',
      'infra/bin/x.ts:18: IG-05 write region out after the last spread, as env: { region: REGION }',
      'infra/bin/x.ts:20: IG-05 write env out, as env: { region: REGION }',
    ])
  })

  // A stack or stage made with no env is environment-agnostic: it deploys into whatever region the
  // CLI's profile names (R2DOCS-01).
  it('refuses a stack or stage made with no env', () => {
    const planted = [
      "new cdk.Stack(app, 'Hearth-Foundation')",
      "new cdk.Stack(app, 'Hearth-LogArchive', { description: 'x' })",
      'class FoundationStack extends cdk.Stack { constructor(s, i) { super(s, i) } }',
      "class LogArchiveStack extends cdk.Stack { constructor(s, i) { super(s, i, { description: 'x' }) } }",
      "new cdk.Stage(app, 'S')",
      'new cdk.Stack()',
      "class ParentStack extends cdk.Stack { constructor(s, i, props: cdk.StackProps) { super(s, i, props); new cdk.NestedStack(this, 'N') } }",
      "new cdk.Stack(app, 'Hearth-Foundation', { description: 'x', env: { region: REGION } })",
    ].join('\n')
    const why = 'IG-05 a stack or stage with no env deploys wherever the CLI points; write env: { region: REGION }'
    expect(regionFindings('infra/bin/x.ts', planted)).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map(line => `infra/bin/x.ts:${line}: ${why}`),
    )
  })

  it('every env in infra/ names ap-southeast-1', () => {
    expect(infraScripts.flatMap(path => regionFindings(path, readRepoFile(path)))).toEqual([])
  })
})

describe('IG-06 (C11-D44, C11-D76): the server image only by digest, never built or published by the CLI', () => {
  it('finds each image asset on planted code', () => {
    const planted = [
      "ecs.ContainerImage.fromAsset('../apps/server')",
      "new DockerImageAsset(this, 'i', { directory: '.' })",
      'ecs.ContainerImage.fromDockerImageAsset(asset)',
      "ecs.ContainerImage.fromTarball('image.tar')",
      "import * as assets from 'aws-cdk-lib/aws-ecr-assets'",
      'ecs.ContainerImage.fromEcrRepository(repository, release.digest)',
      // aws-cdk-lib's own image-asset class, which makes a DockerImageAsset (R2GUARD-02).
      "taskDefinition.addContainer('api', { image: new ecs.AssetImage('../apps/server') })",
      "import { AssetImage } from 'aws-cdk-lib/aws-ecs'",
      // The module through aws-cdk-lib's root.
      "import { aws_ecr_assets as assets } from 'aws-cdk-lib'",
    ]
    expect(planted.map(line => ruleFindings('x.ts', line, IMAGE_RULES).length)).toEqual([1, 1, 1, 1, 1, 0, 1, 1, 1])
  })

  it('no infra script uses one', () => {
    expect(infraScripts.flatMap(path => ruleFindings(path, code(path), IMAGE_RULES))).toEqual([])
  })
})

describe('IG-07 (C11-D70): no package script that deploys, bootstraps or destroys', () => {
  it('finds each on planted manifests', () => {
    expect(
      scriptFindings('infra/package.json', {
        scripts: {
          typecheck: 'tsc --noEmit',
          synth: 'cdk synth --quiet',
          'synth:lz': 'HEARTH_FIXTURE=1 cdk synth --app "node bin/landing-zone.ts"',
          deploy: 'echo no',
          'bootstrap-accounts': 'node x.ts',
          diff: 'cdk diff',
          ship: 'npx cdk deploy --all',
        },
      }),
    ).toEqual([
      'infra/package.json: IG-07 script "deploy": no deploy, bootstrap or destroy script',
      'infra/package.json: IG-07 script "bootstrap-accounts": no deploy, bootstrap or destroy script',
      'infra/package.json: IG-07 script "diff" runs cdk diff: only synth or list',
      'infra/package.json: IG-07 script "ship" runs cdk deploy: only synth or list',
    ])
    expect(scriptFindings('package.json', { scripts: { 'infra:up': 'cdk destroy -w @hearth/infra' } })).toEqual([
      'package.json: IG-07 script "infra:up" runs cdk destroy: only synth or list',
    ])
  })

  it('reads the subcommand past options, versions, chains and nested shells', () => {
    const scripts = {
      a: 'cdk --app cdk.out deploy --all',
      b: 'npx cdk -a cdk.out deploy',
      c: 'npx cdk --profile x destroy',
      d: 'cdk --debug true deploy',
      e: 'npx cdk@2 deploy',
      f: 'cdk --profile p bootstrap',
      g: 'cdk synth && cdk --app cdk.out destroy -f',
      h: 'npx aws-cdk@2.1031.0 deploy',
      i: "sh -c 'cdk --app cdk.out deploy'",
      j: 'npm exec cdk -- deploy',
      k: './node_modules/.bin/cdk gc',
      l: 'cdk synth; cdk -c a=b diff',
      m: 'npx -p aws-cdk cdk deploy',
      n: 'cdk --no-color true synth',
      ok1: 'cdk synth --quiet',
      ok2: 'HEARTH_FIXTURE=1 cdk --app "node bin/landing-zone.ts" synth',
      ok3: 'cdk -a cdk.out ls && cdk --app=cdk.out list',
      ok4: 'cdk --json true --no-lookups -v --app=cdk.out --context a=b -c=x --strict --ci false synth',
      ok5: 'cdk synthesize --no-lookups',
      ok6: 'tsc --noEmit && vitest run',
    }
    expect(scriptFindings('package.json', { scripts })).toEqual([
      'package.json: IG-07 script "a" runs cdk deploy: only synth or list',
      'package.json: IG-07 script "b" runs cdk deploy: only synth or list',
      'package.json: IG-07 script "c" runs cdk destroy: only synth or list',
      'package.json: IG-07 script "d" runs cdk deploy: only synth or list',
      'package.json: IG-07 script "e" runs cdk deploy: only synth or list',
      'package.json: IG-07 script "f" runs cdk bootstrap: only synth or list',
      'package.json: IG-07 script "g" runs cdk destroy: only synth or list',
      'package.json: IG-07 script "h" runs cdk deploy: only synth or list',
      'package.json: IG-07 script "i" runs cdk deploy: only synth or list',
      'package.json: IG-07 script "j" runs cdk deploy: only synth or list',
      'package.json: IG-07 script "k" runs cdk gc: only synth or list',
      'package.json: IG-07 script "l" runs cdk diff: only synth or list',
      'package.json: IG-07 script "m" runs cdk deploy: only synth or list',
      'package.json: IG-07 script "n" runs cdk true: only synth or list',
    ])
  })

  // aws-cdk 2.1146.1's parser isn't strict, so an option it doesn't know takes the next word as its
  // value: `cdk --toolkit-stack-name synth deploy` deploys (R2GUARD-01). A short option with nothing
  // after its = is two words to it, an option named = taking the next: `cdk -c= synth deploy` deploys,
  // and so does `cdk -a= synth` once npm appends a caller's `deploy` (R3PARSE-01).
  it('refuses an option before the subcommand that isn’t one of the CLI’s own, whose value it can’t tell from a subcommand', () => {
    const scripts = {
      a: 'cdk --toolkit-stack-name synth deploy',
      b: 'npx cdk --change-set-name ls deploy --all',
      c: 'cdk -O list deploy',
      d: 'cdk --unknown-thing synth deploy',
      e: 'cdk --roleArn synth deploy',
      f: 'cdk -jo synth deploy',
      g: 'cdk --telemetry-file --toolkit-stack-name synth deploy',
      h: 'cdk  --require-approval never deploy',
      i: 'cdk -c= synth deploy',
      j: 'cdk -a= synth',
      k: 'cdk -c="" synth deploy',
      ok1: 'cdk --toolkit-stack-name=x synth',
      ok2: 'cdk -y --no-staging --profile p --region ap-southeast-1 -a cdk.out ls',
      ok3: 'cdk -c== --context= synth',
    }
    const why = "before its subcommand: the guard reads past only the CLI's own options and options written as one word"
    expect(scriptFindings('package.json', { scripts })).toEqual([
      `package.json: IG-07 script "a" runs cdk with --toolkit-stack-name ${why}`,
      `package.json: IG-07 script "b" runs cdk with --change-set-name ${why}`,
      `package.json: IG-07 script "c" runs cdk with -O ${why}`,
      `package.json: IG-07 script "d" runs cdk with --unknown-thing ${why}`,
      `package.json: IG-07 script "e" runs cdk with --roleArn ${why}`,
      `package.json: IG-07 script "f" runs cdk with -jo ${why}`,
      `package.json: IG-07 script "g" runs cdk with --toolkit-stack-name ${why}`,
      `package.json: IG-07 script "h" runs cdk with --require-approval ${why}`,
      `package.json: IG-07 script "i" runs cdk with -c= ${why}`,
      `package.json: IG-07 script "j" runs cdk with -a= ${why}`,
      `package.json: IG-07 script "k" runs cdk with -c= ${why}`,
    ])
  })

  // npm appends a caller's words to a script, so `"c": "cdk"` and `"d": "npm run c deploy"` deploy, and
  // `cdk --version` with `--no-version deploy` appended deploys too (R2BUILD-02).
  it('refuses a run of the CLI with no subcommand, which would take a caller’s', () => {
    const scripts = {
      passThrough: 'cdk',
      viaOtherScript: 'npm run passThrough deploy',
      version: 'cdk --version',
      npx: 'npx cdk',
      options: 'cdk --app cdk.out',
      valueLast: 'cdk --profile',
      dashes: 'npm exec cdk --',
    }
    const why = "runs cdk with no subcommand: npm appends a caller's words, so name synth or list"
    expect(scriptFindings('package.json', { scripts })).toEqual(
      ['passThrough', 'version', 'npx', 'options', 'valueLast', 'dashes'].map(
        name => `package.json: IG-07 script "${name}" ${why}`,
      ),
    )
  })

  // As a shell reads them: any npm spec after @, a backslash-newline joining the lines, and a
  // redirection, which is no word of its command (R2GUARD-05).
  it('reads the CLI however a script spells it', () => {
    const scripts = {
      range: "npx 'aws-cdk@>=2' deploy",
      continued: 'c\\\ndk deploy --all',
      continuedQuoted: '"c\\\ndk" deploy',
      redirect: 'cdk>/dev/null deploy',
      fd: 'cdk 2>/dev/null destroy',
      ok1: 'cdk 2>/dev/null synth > out.txt',
      ok2: 'cdk synth 2>&1 | tee synth.log',
    }
    expect(scriptFindings('package.json', { scripts })).toEqual([
      'package.json: IG-07 script "range" runs cdk deploy: only synth or list',
      'package.json: IG-07 script "continued" runs cdk deploy: only synth or list',
      'package.json: IG-07 script "continuedQuoted" runs cdk deploy: only synth or list',
      'package.json: IG-07 script "redirect" runs cdk deploy: only synth or list',
      'package.json: IG-07 script "fd" runs cdk destroy: only synth or list',
    ])
  })

  it('no package.json in the repository has one', () => {
    const manifests = files.filter(path => /(^|\/)package\.json$/.test(path))
    expect(manifests).toEqual(expect.arrayContaining(['package.json', 'infra/package.json']))
    expect(manifests.flatMap(path => scriptFindings(path, JSON.parse(readRepoFile(path))))).toEqual([])
  })
})

describe('IG-08 (C11-D24, C11-D58): what infra imports', () => {
  it('lets infra import @hearth/shared, and @hearth/server/config from a test alone, on planted imports', () => {
    expect(infraImportProblem('infra/src/config/retention.ts', '@hearth/shared', workspaces)).toBeUndefined()
    expect(infraImportProblem('infra/src/config/retention.ts', 'aws-cdk-lib/aws-logs', workspaces)).toBeUndefined()
    expect(infraImportProblem('infra/src/x.ts', '@hearth/access', workspaces)).toMatch(/IG-08/)
    expect(infraImportProblem('infra/src/x.ts', '../../packages/access/src/index.ts', workspaces)).toMatch(/IG-08/)
    expect(infraImportProblem('infra/src/workload/s.test.ts', '@hearth/server/config', workspaces)).toBeUndefined()
    expect(infraImportProblem('infra/src/workload/s.ts', '@hearth/server/config', workspaces)).toMatch(/from a test/)
    expect(infraImportProblem('infra/src/workload/s.test.ts', '@hearth/server', workspaces)).toMatch(/from a test/)
  })

  it('follows a graph of relative imports, and finds the landing zone in the workload entry’s', () => {
    const sources = new Map([
      ['infra/bin/workload.ts', "import { x } from '../src/workload/stage.ts'"],
      ['infra/src/workload/stage.ts', "import { y } from '../baseline/zones.ts'\nimport { z } from './z.ts'"],
      ['infra/src/workload/z.ts', "import cdk from 'aws-cdk-lib'"],
      ['infra/src/baseline/zones.ts', "import { readFileSync } from 'node:fs'"],
    ])
    const graph = importGraph('infra/bin/workload.ts', path => sources.get(path), importsOf)
    expect(graph.files.sort()).toEqual([...sources.keys()].sort())
    expect(workloadGraphFindings(graph.files)).toEqual([
      "infra/bin/workload.ts reaches infra/src/baseline/zones.ts: IG-08 the pipeline's synth never needs the landing zone",
    ])
    expect(packageFindings(graph.specifiers)).toEqual([
      'infra/src/workload/z.ts: IG-08 loads aws-cdk-lib, but runs without npm ci',
    ])
    expect(packageFindings(new Map([['a.ts', ['node:fs', './b.ts', 'fs']]]))).toEqual([
      'a.ts: IG-08 loads fs, but runs without npm ci',
    ])
  })

  it('finds a person’s configuration and the fixture in the workload entry’s graph too', () => {
    expect(
      workloadGraphFindings([
        'infra/bin/workload.ts',
        'infra/src/config/profiles.ts',
        'infra/src/config/env.ts',
        'infra/src/testing/fixture.ts',
        'infra/src/foundation/org.ts',
      ]),
    ).toEqual([
      "infra/bin/workload.ts reaches infra/src/config/env.ts: IG-08 the pipeline's synth never needs a person's configuration",
      "infra/bin/workload.ts reaches infra/src/testing/fixture.ts: IG-08 the pipeline's synth never loads the fixture",
      "infra/bin/workload.ts reaches infra/src/foundation/org.ts: IG-08 the pipeline's synth never needs the landing zone",
    ])
  })

  it('every infra file imports only what it may', () => {
    const found = infraScripts.flatMap(path =>
      importsOf(readRepoFile(path), path).flatMap(spec => {
        const why = infraImportProblem(path, spec, workspaces)
        return why ? [`${path}: imports '${spec}' (${why})`] : []
      }),
    )
    expect(found).toEqual([])
  })

  it('the workload entry’s graph never reaches the landing zone', () => {
    const read = (path: string) => (existsSync(join(root, path)) ? readRepoFile(path) : undefined)
    const graph = importGraph('infra/bin/workload.ts', read, importsOf)
    expect(graph.files).toContain('infra/bin/workload.ts')
    expect(workloadGraphFindings(graph.files)).toEqual([])
  })

  it('the rollback floors’ check, once it exists (C0.11 PR 4), loads no npm package', () => {
    const read = (path: string) => (existsSync(join(root, path)) ? readRepoFile(path) : undefined)
    const graph = importGraph('infra/scripts/deploy/floors-check.ts', read, importsOf)
    expect(packageFindings(graph.specifiers)).toEqual([])
  })
})

describe('IG-11 (C11-D29): no Lambda and no custom resource of infra’s own', () => {
  it('finds each on planted code, and lets the VPC’s own restriction through', () => {
    const planted = [
      "new NodejsFunction(this, 'f', { entry: 'x.ts' })",
      "import * as lambda from 'aws-cdk-lib/aws-lambda'",
      "import { AwsCustomResource } from 'aws-cdk-lib/custom-resources'",
      "new cdk.CustomResource(this, 'c', { serviceToken: token })",
      'const runtime = lambda.Runtime.NODEJS_22_X',
      "new logs.LogGroup(this, 'g', { logRetention: logs.RetentionDays.ONE_DAY })",
      "new cdk.CfnResource(this, 'r', { type: 'Custom::Mine' })",
      `const allowed = '${ALLOWED_CUSTOM_RESOURCE}'`,
      'new cdk.CustomResourceProvider(this, "p", {})',
      "new ec2.Vpc(this, 'v', { restrictDefaultSecurityGroup: true })",
    ]
    expect(planted.map(line => ruleFindings('x.ts', line, LAMBDA_RULES).length)).toEqual([1, 1, 2, 1, 1, 1, 1, 0, 1, 0])
  })

  it('finds the constructs whose CDK internals make a Lambda-backed custom resource', () => {
    const planted = [
      "new iam.OpenIdConnectProvider(this, 'gh', { url: 'x' })",
      "new route53.CrossAccountZoneDelegationRecord(this, 'd', {})",
      "new route53.ARecord(this, 'a', { zone, target, deleteExisting: true })",
      "import * as triggers from 'aws-cdk-lib/triggers'",
      "import { BucketDeployment } from 'aws-cdk-lib/aws-s3-deployment'",
      "new BucketDeployment(this, 'd', {})",
      'bucket.addEventNotification(s3.EventType.OBJECT_CREATED, dest)',
      'bucket.addObjectCreatedNotification(dest)',
      "new s3.Bucket(this, 'b', { eventBridgeEnabled: true })",
      "new iam.OidcProviderNative(this, 'gh', { url: 'x' })",
      "new route53.ARecord(this, 'a', { zone, target })",
    ]
    expect(planted.map(line => ruleFindings('x.ts', line, LAMBDA_RULES).length)).toEqual([
      1, 1, 1, 1, 2, 1, 1, 1, 1, 0, 0,
    ])
  })

  // More of aws-cdk-lib 2.274.0's constructs that make a Lambda, and the custom-resource and SAM types
  // the template-level check wouldn't see (R2GUARD-04).
  it('finds log retention, certificate requests, rotation, AwsApi, transforms and the other constructs that make one', () => {
    const planted = [
      "new rds.DatabaseInstance(this, 'db', { cloudwatchLogsExports: ['postgresql'], cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH })",
      "new logs.LogRetention(this, 'r', { logGroupName: 'x', retention: logs.RetentionDays.ONE_DAY })",
      'bucket.enableEventBridgeNotification()',
      "new acm.DnsValidatedCertificate(this, 'c', { domainName: 'x', hostedZone: zone, region: 'us-east-1' })",
      "new targets.AwsApi({ service: 'ECS', action: 'updateService' })",
      'secret.addRotationSingleUser()',
      'secret.addRotationSchedule("r", { hostedRotation: secretsmanager.HostedRotation.postgreSqlSingleUser() })',
      "new secretsmanager.SecretRotation(this, 'r', {})",
      "new cdk.CfnResource(this, 'c', { type: 'AWS::CloudFormation::CustomResource', properties: {} })",
      "new cdk.CfnResource(this, 'a', { type: 'AWS::Serverless::Application', properties: {} })",
      "this.addTransform('AWS::SecretsManager-2024-09-16')",
      "new cdk.Stack(app, 'Hearth-prod-Edge', { env: { region: 'us-east-1' }, crossRegionReferences: true })",
      "new cdk.CfnJson(this, 'conditions', { value: { [key]: 'sts.amazonaws.com' } })",
      "new route53.VpcEndpointServiceDomainName(this, 'd', {})",
      "new cloudtrail.Trail(this, 't', { sendToCloudWatchLogs: true, cloudWatchLogsRetention: logs.RetentionDays.ONE_YEAR })",
      "new logs.LogGroup(this, 'g', { retention: logs.RetentionDays.ONE_MONTH })",
      "new acm.Certificate(this, 'c', { domainName: 'x', validation: acm.CertificateValidation.fromDns(zone) })",
    ]
    expect(planted.map(line => ruleFindings('x.ts', line, LAMBDA_RULES).length)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0,
    ])
  })

  // A transform in each form aws-cdk-lib 2.274.0 documents, and SAM's own module, whose resources its
  // transform expands (R3RULES-04, R3DOCS-03).
  it('finds a transform in every documented form, and SAM’s module', () => {
    const planted = [
      "this.templateOptions.transforms = ['AWS::Include']",
      "stack.templateOptions.transform = 'AWS::LanguageExtensions'",
      "stack.templateOptions.transforms?.push('AWS::SecretsManager-2024-09-16')",
      "stack.templateOptions['transforms'] = ['AWS::Include']",
      "const snippet = cdk.Fn.transform('AWS::Include', { Location: location })",
      "new cdk.CfnResource(this, 'p', { type: 'AWS::SSM::Parameter', properties: { 'Fn::Transform': { Name: 'AWS::Include' } } })",
      "import * as sam from 'aws-cdk-lib/aws-sam'",
      "new cdk.aws_sam.CfnSimpleTable(this, 't', {})",
      "this.templateOptions.description = 'Hearth workload'",
      'const shaped = transformTemplate(transform(template))',
      'expect(template.Transform).toBeUndefined()',
      "import * as s3 from 'aws-cdk-lib/aws-s3'",
    ]
    expect(planted.map(line => ruleFindings('infra/src/x.ts', line, LAMBDA_RULES).length)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0,
    ])
  })

  // The modules that make one, reached through aws-cdk-lib's root rather than a subpath.
  it('finds the Lambda modules through aws-cdk-lib’s root, and lets the plain word through', () => {
    const planted = [
      "new cdk.aws_lambda.DockerImageFunction(this, 'f', { code: cdk.aws_lambda.DockerImageCode.fromEcr(repo) })",
      "import { aws_lambda as lambda } from 'aws-cdk-lib'",
      "import { aws_lambda_nodejs } from 'aws-cdk-lib'",
      "new cdk.custom_resources.Provider(this, 'p', { onEventHandler: handler })",
      'cdk.aws_s3_deployment.Source.data("x", "y")',
      "new cdk.triggers.Trigger(this, 't', { handler })",
      "import { Stack, triggers } from 'aws-cdk-lib'",
      'const triggers = rules.map(rule => rule.id)',
      "new codebuild.Project(this, 'p', { triggers: [] })",
      "import { Stack, aws_s3 as s3 } from 'aws-cdk-lib'",
    ]
    expect(planted.map(line => ruleFindings('infra/src/x.ts', line, LAMBDA_RULES).length)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 0, 0, 0,
    ])
  })

  // The assertion tests look for these types and keys in a synthesised template, which they never
  // deploy, and no other file imports one; what makes one is refused in a test too (R3RULES-01).
  it('lets an assertion test name the types and keys it looks for, and no other file import a test', () => {
    const named = [
      "template.resourceCountIs('AWS::CloudFormation::CustomResource', 0)",
      "expect(types.filter(t => t.startsWith('AWS::Serverless::') || (t.startsWith('Custom::') && t !== 'Custom::VpcRestrictDefaultSG'))).toEqual([])",
      'expect(JSON.stringify(template)).not.toContain(\'"Fn::Transform"\')',
    ]
    const test = 'infra/src/workload/templates.test.ts'
    expect(named.map(line => ruleFindings(test, line, LAMBDA_RULES).length)).toEqual([0, 0, 0])
    expect(named.map(line => ruleFindings('infra/src/workload/templates.ts', line, LAMBDA_RULES).length)).toEqual([
      1, 2, 1,
    ])
    const making = [
      "this.templateOptions.transforms = ['AWS::Include']",
      "new NodejsFunction(this, 'n', { entry: 'x.ts' })",
    ]
    expect(making.map(line => ruleFindings(test, line, LAMBDA_RULES).length)).toEqual([1, 1])
    expect(ruleFindings('scripts/x.test.ts', named[0] ?? '', LAMBDA_RULES)).toHaveLength(1)
    expect(testImportFindings('infra/bin/workload.ts', ['../src/workload/templates.test.ts', '../src/a.ts'])).toEqual([
      'infra/bin/workload.ts: IG-11 imports ../src/workload/templates.test.ts, a test, which may name what a stack may not hold',
    ])
    expect(testImportFindings('infra/src/a.ts', ['./b.test', './c.test.js'])).toHaveLength(2)
    expect(testImportFindings(test, ['../../testing/synth.ts', './other.test.ts'])).toEqual([])
  })

  it('no infra script makes one, and none but a test imports a test', () => {
    expect(infraScripts.flatMap(path => ruleFindings(path, code(path), LAMBDA_RULES))).toEqual([])
    expect(infraScripts.flatMap(path => testImportFindings(path, importsOf(readRepoFile(path), path)))).toEqual([])
  })
})

describe('IG-09 (C11-D11 to C11-D15): the break-glass helper refuses agents, isolates itself, and never exposes a credential', () => {
  const HELPER = 'infra/bin/break-glass.sh'
  const helper = readRepoFile(HELPER)
  const rules = (text: string) =>
    [...new Set(breakGlassFindings(HELPER, text).map(f => /IG-09[a-p]/.exec(f)?.[0]))].sort()
  // A planted copy: the helper with one text changed, which must be there exactly once.
  const plant = (from: string, to: string, base = helper) => {
    expect(base.split(from).length - 1, from).toBe(1)
    return base.replace(from, () => to)
  }
  // The helper's functions run on their own, as bash runs them, with nothing inherited but PATH and
  // what the case sets: CI sets CI and GITHUB_ACTIONS, and a Claude Code shell its own markers, so an
  // inherited environment would refuse the case with none.
  const run = (script: string, args: readonly string[] = [], env: Record<string, string> = {}) =>
    spawnSync(
      'env',
      [
        '-i',
        `PATH=${process.env.PATH ?? ''}`,
        ...Object.entries(env).map(([k, v]) => `${k}=${v}`),
        'bash',
        '-c',
        script,
        '_',
        ...args,
      ],
      { encoding: 'utf8' },
    ).status

  it('the helper passes every rule', () => {
    expect(breakGlassFindings(HELPER, helper)).toEqual([])
  })

  it('finds each breakage planted in a copy, by its rule', () => {
    const afterAssume = (line: string) =>
      plant('assume_role || exit 1\nopen_session\n', `assume_role || exit 1\n${line}\nopen_session\n`)
    const cases: Array<[string, string, string[]]> = [
      ['a: another first statement', plant('set -euo pipefail\n', 'set -eu\n'), ['IG-09a']],
      ['a: a trace', plant('set -f\n', 'set -f\nset -x\n'), ['IG-09a']],
      ['a: a trace descriptor', plant('set -f\n', 'set -f\nexport BASH_XTRACEFD=7\n'), ['IG-09a']],
      ['a: a trace after another option', plant('set -f\n', 'set -f\nset -e -x\n'), ['IG-09a']],
      ['a: xtrace after another -o', plant('set -f\n', 'set -f\nset -o errexit -o xtrace\n'), ['IG-09a']],
      ['a: xtrace taken by a joined -o', plant('set -f\n', 'set -f\nset -eo xtrace\n'), ['IG-09a']],
      ['a: xtrace through shopt', plant('set -f\n', 'set -f\nshopt -s -o xtrace\n'), ['IG-09a']],
      ['a: a traced shell', plant('bash --rcfile "$rc" -i || true', 'bash --rcfile "$rc" -ix || true'), ['IG-09a']],
      ['b: a marker missing', plant('AI_AGENT CI GITHUB_ACTIONS; do', 'AI_AGENT CI; do'), ['IG-09b']],
      ['b: empty passes', plant(`[ -n "\${!name+x}" ]`, `[ -n "\${!name:-}" ]`), ['IG-09b']],
      [
        'b: refused after the first aws command',
        plant(
          'aws sso login --profile "$profile"\n',
          'aws sso login --profile "$profile"\nrefuse_agents\n',
          plant('\nrefuse_agents\nrequire_terminal\n', '\nrequire_terminal\n'),
        ),
        ['IG-09b'],
      ],
      ['c: no C locale', plant('export LC_ALL=C\n', ''), ['IG-09c']],
      ['c: no umask', plant('umask 077\n', ''), ['IG-09c']],
      [
        'd: a check that names aws',
        plant('local reason="$1" form matches=0 rest', 'local reason="$1" form matches=0 rest cli=aws'),
        ['IG-09d'],
      ],
      ['d: no date check', plant('valid_date() {', 'check_date() {'), ['IG-09d']],
      [
        'd: the reason checked after the first aws command',
        plant(
          "command -v jq >/dev/null 2>&1 || refuse 'refused: it needs jq'\n",
          'command -v jq >/dev/null 2>&1 || refuse \'refused: it needs jq\'\nif ! valid_reason "$reason"; then usage; fi\n',
          plant('if ! valid_reason "$reason"; then usage; fi\n', ''),
        ),
        ['IG-09d'],
      ],
      ['e: no regional STS', plant('export AWS_STS_REGIONAL_ENDPOINTS=regional\n', ''), ['IG-09e']],
      ['e: the caller’s HOME', plant('export HOME="$BG_HOME"\n', ''), ['IG-09e']],
      [
        'e: a profile inherited',
        plant('unset AWS_PROFILE AWS_DEFAULT_PROFILE ', 'unset AWS_DEFAULT_PROFILE '),
        ['IG-09e'],
      ],
      [
        'f: no mode check',
        plant(
          'if [ -z "$(find "$BG_HOME" -maxdepth 0 -type d -user "$(id -u)" -perm 700 2>/dev/null)" ]; then',
          'if [ ! -d "$BG_HOME" ]; then',
        ),
        ['IG-09f'],
      ],
      ['g: a pager', plant('export AWS_PAGER=\n', ''), ['IG-09g']],
      ['g: history unchecked', helper.replaceAll('get cli_history', 'get cli_pager'), ['IG-09g']],
      [
        'h: the trap after the sign-in',
        plant(
          'trap \'on_exit\' EXIT INT TERM HUP\naws sso login --profile "$profile"\n',
          'aws sso login --profile "$profile"\ntrap \'on_exit\' EXIT INT TERM HUP\n',
        ),
        ['IG-09h'],
      ],
      [
        'h: no sign-out',
        plant('  aws sso logout >/dev/null 2>&1 || true\n  exit "$status"', '  exit "$status"'),
        ['IG-09h'],
      ],
      ['i: a credential printed', afterAssume('echo "$AWS_SESSION_TOKEN"'), ['IG-09i', 'IG-09o']],
      ['i: a credential exported', afterAssume('export AWS_SESSION_TOKEN'), ['IG-09i']],
      ['i: a credential written', afterAssume('printf \'%s\' "$sk" >"$entry_file"'), ['IG-09i', 'IG-09o']],
      ['i: eval', afterAssume('eval "$reason"'), ['IG-09i']],
      ['i: env alone', afterAssume('env'), ['IG-09i']],
      ['i: declare -p', afterAssume('declare -p'), ['IG-09i']],
      [
        'i: --debug',
        plant('aws sso login --profile "$profile"\n', 'aws sso login --profile "$profile" --debug\n'),
        ['IG-09i'],
      ],
      ['i: a config write', afterAssume('aws configure set region ap-southeast-1'), ['IG-09i']],
      [
        'j: no reason tag',
        plant('--source-identity "$user" --tags "Key=hearth-reason,Value=$reason" \\', '--source-identity "$user" \\'),
        ['IG-09j'],
      ],
      ['j: two hours', plant('--duration-seconds 3600 --query', '--duration-seconds 7200 --query'), ['IG-09j']],
      [
        'j: a second assumption',
        afterAssume('aws sts assume-role --role-arn "$role" --role-session-name x >/dev/null'),
        ['IG-09j'],
      ],
      [
        'k: an entry as JSON text',
        plant(
          '  put_entry "$key" || refuse "the open entry',
          '  printf \'%s\' "{\\"reason\\":\\"$reason\\"}" >"$entry_file"\n  put_entry "$key" || refuse "the open entry',
        ),
        ['IG-09k'],
      ],
      [
        'k: an entry’s fields written into a jq program',
        plant(
          '  put_entry "$key" || refuse "the open entry',
          '  jq -n "{schema: \\"x\\", reason: \\"$reason\\"}" >"$entry_file"\n  put_entry "$key" || refuse "the open entry',
        ),
        ['IG-09k'],
      ],
      [
        'k: a field spliced into a jq program',
        plant(
          '  put_entry "$key" || refuse "the open entry',
          `  jq -n --arg schema "$SCHEMA" '{schema: $schema, reason: "'"$reason"'"}' >"$entry_file"\n  put_entry "$key" || refuse "the open entry`,
        ),
        ['IG-09k'],
      ],
      [
        'k: an entry that may overwrite',
        plant("--checksum-algorithm SHA256 --if-none-match '*' >/dev/null", '--checksum-algorithm SHA256 >/dev/null'),
        ['IG-09k'],
      ],
      [
        'k: the open entry after the shell',
        plant(
          'open_session\nif [ "$console" = yes ]; then open_console; fi\nrun_shell\n',
          'run_shell\nopen_session\nif [ "$console" = yes ]; then open_console; fi\n',
        ),
        ['IG-09k'],
      ],
      [
        'k: the close entry before the shell',
        plant('run_shell\nclose_session prompted\n', 'close_session prompted\nrun_shell\n'),
        ['IG-09k'],
      ],
      [
        'l: curl outside the console',
        afterAssume("curl -fsS --data-urlencode 'Session@-' https://signin.aws.amazon.com/federation"),
        ['IG-09l'],
      ],
      [
        'l: curl elsewhere',
        plant(
          'https://signin.aws.amazon.com/federation 2>/dev/null',
          'https://sign-in.example.org/federation 2>/dev/null',
        ),
        ['IG-09l'],
      ],
      [
        'l: the link printed always',
        plant('if [ "$console" = yes ]; then open_console; fi\n', 'open_console\n'),
        ['IG-09l'],
      ],
      [
        'l: a call that only mentions --console',
        plant(
          'if [ "$console" = yes ]; then open_console; fi\n',
          'if [ "$console" = yes ]; then :; fi; open_console\n',
        ),
        ['IG-09l'],
      ],
      [
        'l: the link printed from the shell’s function',
        plant("  trap ':' INT\n", "  open_console\n  trap ':' INT\n"),
        ['IG-09l'],
      ],
      [
        'l: the link printed from the open entry’s function',
        plant(
          '  printf \'break-glass: open entry written for %s\\n\' "$session"\n',
          '  printf \'break-glass: open entry written for %s\\n\' "$session"\n  open_console\n',
        ),
        ['IG-09l'],
      ],
      [
        'm: another environment',
        plant('nonprod | prod | log-archive) ;;', 'nonprod | prod | log-archive | dev) ;;'),
        ['IG-09m'],
      ],
      [
        'm: another arm takes more environments',
        plant('  nonprod | prod | log-archive) ;;\n', '  nonprod | prod | log-archive) ;;\n  *prod*) ;;\n'),
        ['IG-09m'],
      ],
      ['m: any environment taken', plant('  *) usage ;;\nesac\n', '  *) ;;\nesac\n'), ['IG-09m']],
      [
        'm: log-archive takes any reason',
        plant('incident:* | drill:*) ;;', 'incident:* | drill:* | lz:*) ;;'),
        ['IG-09m'],
      ],
      [
        'm: log-archive refuses no reason',
        plant('    *) usage ;;\n  esac\nfi\n', '    *) ;;\n  esac\nfi\n'),
        ['IG-09m'],
      ],
      [
        'o: a credential through env',
        afterAssume('env AWS_SESSION_TOKEN="$st" aws sts get-caller-identity'),
        ['IG-09o'],
      ],
      [
        'o: a credential through env after another assignment',
        afterAssume('env -i PATH="$PATH" AWS_SESSION_TOKEN="$st" aws sts get-caller-identity'),
        ['IG-09o'],
      ],
      [
        'o: a credential through env after an option’s value',
        afterAssume('env -u HISTFILE AWS_SESSION_TOKEN="$st" aws sts get-caller-identity'),
        ['IG-09o'],
      ],
      [
        'o: a credential through sudo',
        afterAssume('sudo AWS_SESSION_TOKEN="$st" aws sts get-caller-identity'),
        ['IG-09o'],
      ],
      [
        'o: a credential as a later argument in assignment form',
        afterAssume('aws sts get-caller-identity AWS_SESSION_TOKEN="$st" --output text'),
        ['IG-09o'],
      ],
      ['o: an assignment form inside quotes', afterAssume('aws s3 ls "x; AWS_SESSION_TOKEN="$st" y"'), ['IG-09o']],
      [
        'o: an assignment form after an escaped separator',
        afterAssume('aws s3 ls x\\; AWS_SESSION_TOKEN="$st" y'),
        ['IG-09o'],
      ],
      ['o: a credential as an argument', afterAssume('aws s3 ls --secret "$sk"'), ['IG-09o']],
      [
        'o: a prefix after another assignment passes',
        afterAssume('HISTFILE=/dev/null AWS_SESSION_TOKEN="$st" aws sts get-caller-identity >/dev/null'),
        [],
      ],
      [
        'o: a prefix in a command substitution passes',
        afterAssume(
          'caller="$(AWS_ACCESS_KEY_ID="$ak" AWS_SECRET_ACCESS_KEY="$sk" AWS_SESSION_TOKEN="$st" aws sts get-caller-identity)"',
        ),
        [],
      ],
      [
        'o: a prefix after if ! passes',
        afterAssume('if ! AWS_SESSION_TOKEN="$st" aws sts get-caller-identity >/dev/null; then exit 1; fi'),
        [],
      ],
      [
        'o: the session in curl’s arguments',
        plant("--data-urlencode 'Session@-'", '--data-urlencode "Session=$st"'),
        ['IG-09o'],
      ],
      [
        'p: the amend starts the shell',
        plant(
          "  printf 'break-glass: amend entry written\\n'\n",
          "  printf 'break-glass: amend entry written\\n'\n  run_shell\n",
        ),
        ['IG-09k', 'IG-09p'],
      ],
      [
        'p: the amend opens the console',
        plant(
          "  printf 'break-glass: amend entry written\\n'\n",
          "  printf 'break-glass: amend entry written\\n'\n  open_console\n",
        ),
        ['IG-09l', 'IG-09p'],
      ],
      [
        'p: the amend stays signed in',
        plant("  st=''\n  aws sso logout >/dev/null 2>&1 || true\n}\n\n# A console", "  st=''\n}\n\n# A console"),
        ['IG-09p'],
      ],
      [
        'p: an open entry written in the --amend branch',
        plant('  amend_session\n  exit 0\n', '  amend_session\n  open_session\n  exit 0\n'),
        ['IG-09p'],
      ],
      [
        'p: the --amend branch starts the shell',
        plant('  amend_session\n  exit 0\n', '  amend_session\n  run_shell\n  exit 0\n'),
        ['IG-09k', 'IG-09p'],
      ],
      [
        'p: the --amend branch goes on into the session',
        plant('  amend_session\n  exit 0\n', '  amend_session\n'),
        ['IG-09p'],
      ],
      ['p: no --amend branch', plant('if [ -n "$amend" ]; then\n  amend_session\n  exit 0\nfi\n', ''), ['IG-09p']],
      [
        'p: --console beside --amend',
        plant(
          'if [ -n "$amend" ] && [ "$console" = yes ]; then refuse \'refused: --amend opens no console\'; fi\n',
          '',
        ),
        ['IG-09p'],
      ],
    ]
    for (const [name, planted, expected] of cases) expect(rules(planted), name).toEqual(expected)
  })

  it('b: refuse_agents names exactly the Owner bootstrap script’s agent markers, refuses each set alone, even empty, and passes with none', () => {
    const fn = shellFunction(helper, 'refuse_agents') ?? ''
    expect(fn).toContain('refuse_agents() {')
    expect(run(`${fn}\nrefuse_agents`)).toBe(0)
    for (const marker of AGENT_MARKERS) {
      expect(run(`${fn}\nrefuse_agents`, [], { [marker]: '' }), marker).not.toBe(0)
      expect(run(`${fn}\nrefuse_agents`, [], { [marker]: '1' }), marker).not.toBe(0)
    }
    // A planted copy missing a marker lets it through, which the case above would catch.
    const missing = shellFunction(plant('AI_AGENT CI GITHUB_ACTIONS; do', 'AI_AGENT CI; do'), 'refuse_agents') ?? ''
    expect(run(`${missing}\nrefuse_agents`, [], { GITHUB_ACTIONS: 'true' })).toBe(0)
  })

  it('d: valid_reason, run on its own, takes each reason form, refuses every near miss, an impossible date and a future one', () => {
    const check = [
      ...reasonFormLines(helper),
      shellFunction(helper, 'valid_date'),
      shellFunction(helper, 'valid_reason'),
      'valid_reason "$1"',
    ].join('\n')
    expect(reasonFormLines(helper)).toHaveLength(6)
    // The reasons infra/src/baseline/break-glass.test.ts plants (a test imports no test, so they are
    // written again here), with the dates only valid_date can refuse. Its references are made the same
    // way, from CASE_REFERENCE_PATTERN's own alphabet, each letter it allows first.
    const [letters = '', symbols = ''] = [...CASE_REFERENCE_PATTERN.source.matchAll(/\[([^\]]+)\]/g)].map(([, body]) =>
      (body ?? '').replace(/(.)-(.)/g, (_, a: string, b: string) =>
        Array.from({ length: b.charCodeAt(0) - a.charCodeAt(0) + 1 }, (_, i) =>
          String.fromCharCode(a.charCodeAt(0) + i),
        ).join(''),
      ),
    )
    const references = [...letters].map((first, i) => {
      const pick = (k: number) => symbols[(i * 7 + k) % symbols.length] ?? ''
      const reference = `${first}${pick(1)}${pick(2)}${pick(3)}${letters[(i + 3) % letters.length]}${pick(4)}${pick(5)}${pick(6)}`
      expect(CASE_REFERENCE_PATTERN.test(reference), reference).toBe(true)
      return `case:${formatCaseReference(reference as CaseReference)}`
    })
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    const good = [
      ...references,
      'incident:2026-10-31-01',
      'bootstrap:set-up',
      'bootstrap:correct-number',
      'recover:twilio',
      'drill:2026-10-31',
      'drill:2024-02-29',
      'lz:pr-1',
      'lz:pr-42',
      'lz:pr-123',
      'lz:pr-1234',
      'lz:pr-99999',
    ]
    const bad = [
      'Jane Tan',
      'case:BACD-FGHJ',
      'case:BYCD-FGHJ',
      'case:B0CD-FGHJ',
      'case:B1CD-FGHJ',
      'case:BLCD-FGHJ',
      'case:b2cd-fghj',
      'case:2BCD-FGHJ',
      'case:Jane-Tans',
      'incident:2026-1-31-01',
      'incident:2026-02-30-01',
      'drill:2025-02-29',
      'drill:2026-13-01',
      `drill:${future}`,
      `incident:${future}-01`,
      'lz:pr-0',
      'lz:pr-123456',
      'bootstrap:other',
      'recover:aws',
      'recover:twilio ',
      'lz:pr-42 ',
      'lz:pr-1\nlz:pr-2',
      'case:B2CD-FGHJ\nx',
      'incident:٢٠٢٦-10-31-01',
      'drill:２０２６-10-31',
      '',
    ]
    for (const reason of good) expect(run(check, [reason]), reason).toBe(0)
    for (const reason of bad) expect(run(check, [reason]), JSON.stringify(reason)).not.toBe(0)
  })

  it('n: bash parses it, a planted syntax error fails, and its mode is executable', () => {
    expect(spawnSync('bash', ['-n', join(root, HELPER)]).status).toBe(0)
    expect(spawnSync('bash', ['-n', '-c', plant('\nrun_shell\n', '\nif run_shell\n')]).status).not.toBe(0)
    const staged = execFileSync('git', ['ls-files', '-s', HELPER], { cwd: root, encoding: 'utf8' })
    if (staged === '') expect(statSync(join(root, HELPER)).mode & 0o111).toBe(0o111)
    else expect(staged.startsWith('100755 ')).toBe(true)
  })
})

describe('IG-10 (C11-D06): the model lists live in infra/src/config/models.ts alone', () => {
  const [prefix = ''] = MODEL_SERVICE_PREFIXES
  const [action = ''] = MODEL_ACTIONS
  const moduleName = prefix.replace(/-/g, '')
  // A pattern that overlaps the first model action without naming it whole: its service and the start
  // of its action, then a wildcard.
  const overlapping = `${action.slice(0, action.indexOf(':') + 4)}*`

  it('finds a model string in TypeScript, shell and YAML, built from the lists, and lets the rest through', () => {
    const typescript = [
      `const a = '${prefix}:Invoke'`,
      `const b = \`${action}\``,
      "const c = 'sts:AssumeRole'",
      "const d = 'sms-voice:*'",
      "const e = 'cloudwatch:*'",
      `// ${action}, named in a comment`,
      // A template whose service is a hole names no service, which keeps models.test.ts legal.
      `const f = \`\${p}:*\``,
      `const g = '${overlapping}'`,
    ].join('\n')
    const found = modelStringFindings('infra/src/x.ts', typescript).map(f => /:(\d+):/.exec(f)?.[1])
    expect(found).toEqual(['1', '2', '8'])
    expect(modelStringFindings('infra/bin/x.sh', `# ${action}\nX='${prefix}:*'\n`)).toHaveLength(2)
    expect(modelStringFindings('infra/bootstrap/x.yaml', `Action: ${prefix}:*\n`)).toHaveLength(1)
    expect(modelStringFindings('infra/src/config/models.ts', `const a = '${prefix}:*'`)).toEqual([])
    expect(modelStringFindings('infra/bootstrap/hearth-bootstrap.yaml', `"${prefix}:*"`)).toEqual([])
    expect(modelStringFindings('apps/server/src/x.ts', `const a = '${prefix}:*'`)).toEqual([])
  })

  it('finds a model service’s aws-cdk-lib module, imported or reached through the root', () => {
    const planted = [
      `import * as m from 'aws-cdk-lib/aws-${moduleName}'`,
      `export { CfnX } from 'aws-cdk-lib/aws-${moduleName}'`,
      `new cdk.aws_${moduleName}.CfnX(this, 'x', {})`,
      "import * as s3 from 'aws-cdk-lib/aws-s3'",
      "import * as chime from 'aws-cdk-lib/aws-chime'",
      `// aws_${moduleName} in a comment`,
    ]
    expect(
      planted.map(line => modelModuleFindings('infra/src/x.ts', line, withoutComments('infra/src/x.ts', line)).length),
    ).toEqual([1, 1, 1, 0, 0, 0])
  })

  it('refuses real aws-cdk-lib modules, so the derivation isn’t vacuous, and leaves services with only some model actions', () => {
    const exported = Object.keys(JSON.parse(readRepoFile('node_modules/aws-cdk-lib/package.json')).exports)
      .filter(key => key.startsWith('./aws-'))
      .map(key => key.slice('./aws-'.length))
    const refused = exported.filter(name => MODEL_MODULES.includes(name))
    for (const name of [
      'bedrock',
      'bedrockagentcore',
      'bedrockmantle',
      'sagemaker',
      'qbusiness',
      'quicksight',
      'transcribe',
      'wisdom',
      'devopsagent',
    ]) {
      expect(refused, name).toContain(name)
    }
    for (const name of ['chime', 'connect', 'glue', 'datazone', 'neptune', 'cloudwatch', 'iotsitewise']) {
      expect(exported, name).toContain(name)
      expect(refused, name).not.toContain(name)
    }
  })

  it('no file under infra/ but models.ts and the generated template names one, and no infra script imports one', () => {
    const read = files.filter(path => path.startsWith('infra/'))
    expect(read).toEqual(
      expect.arrayContaining(['infra/bin/break-glass.sh', 'infra/cdk.json', 'infra/src/config/models.test.ts']),
    )
    expect(read.flatMap(path => modelStringFindings(path, readRepoFile(path)))).toEqual([])
    expect(infraScripts.flatMap(path => modelModuleFindings(path, readRepoFile(path), code(path)))).toEqual([])
  })
})

describe('IG-12 (C11-D76): no asset the CLI would run or build', () => {
  it('finds each on planted code, and lets the rest through', () => {
    const planted = [
      "stack.synthesizer.addFileAsset({ sourceHash: h, executable: ['sh', '-c', 'x'] })",
      "stack.synthesizer.addDockerImageAsset({ sourceHash: h, directoryName: '.' })",
      'const source = { executable }',
      "source['executable'] = []",
      "new NodejsFunction(this, 'f', { bundling: { minify: true } })",
      "const image = cdk.DockerImage.fromBuild('.')",
      "stack.synthesizer.addFileAsset({ sourceHash: h, fileName: 'a.template.json' })",
      '// an executable is never set',
      'const runnable = isExecutable(source)',
    ]
    expect(
      planted.map(line => ruleFindings('infra/src/x.ts', withoutComments('infra/src/x.ts', line), ASSET_RULES).length),
    ).toEqual([1, 2, 1, 1, 1, 1, 0, 0, 0])
    // An assertion test names what IAC-22 looks for in an asset manifest; it may not make one.
    const test = 'infra/bin/entries.test.ts'
    expect(ruleFindings(test, 'expect(source.executable).toBeUndefined()', ASSET_RULES)).toEqual([])
    expect(ruleFindings(test, 'stack.synthesizer.addDockerImageAsset({ sourceHash: h })', ASSET_RULES)).toHaveLength(1)
  })

  it('no infra script but a test names one', () => {
    expect(infraScripts.flatMap(path => ruleFindings(path, code(path), ASSET_RULES))).toEqual([])
  })
})

describe('C11-D62: synth:lz runs credential-free and offline, and CI runs it after the tests with no AWS credential', () => {
  const synth: string = JSON.parse(readRepoFile('infra/package.json')).scripts['synth:lz']

  it('the script drops the environment, makes a HOME, and synthesises the landing-zone entry with no lookups', () => {
    expect(synthScriptProblems(synth)).toEqual([])
    expect(scriptFindings('infra/package.json', { scripts: { 'synth:lz': synth } })).toEqual([])
  })

  it('finds each change planted in a copy', () => {
    const changed = (from: string, to: string) => {
      expect(synth).toContain(from)
      return synthScriptProblems(synth.replace(from, () => to))
    }
    const env = expect.stringMatching(/C11-D62 sets exactly /)
    expect(changed('HEARTH_FIXTURE=1', 'AWS_PROFILE=x HEARTH_FIXTURE=1')).toEqual([env])
    expect(changed('HOME="$(mktemp -d)"', 'HOME="$HOME"')).toEqual([env])
    expect(changed(' --no-lookups', '')).toEqual(['infra/package.json synth:lz: C11-D62 passes --no-lookups'])
    expect(changed(' --quiet', ' --quiet --profile x')).toEqual([
      'infra/package.json synth:lz: C11-D62 passes no --profile',
    ])
    expect(changed('env -i ', '')).toEqual([
      'infra/package.json synth:lz: C11-D62 starts with env -i, dropping every inherited variable',
      env,
    ])
    expect(changed("--app 'node bin/landing-zone.ts'", "--app 'node bin/workload.ts'")).toEqual([
      "infra/package.json synth:lz: C11-D62 runs cdk synth --app 'node bin/landing-zone.ts'",
    ])
  })

  it('ci.yml runs it straight after npm test, and holds no id-token, credentials action or AWS_ variable', () => {
    const ci = readRepoFile('.github/workflows/ci.yml')
    const stepsOf = (text: string) => workflowJobs(text).find(job => job.id === 'check')?.steps ?? []
    expect(stepsOf(ci).length).toBeGreaterThan(10)
    expect(ciSynthProblems(ci, stepsOf(ci))).toEqual([])
    const planted = (from: string, to: string) => {
      expect(ci).toContain(from)
      const text = ci.replace(from, () => to)
      return ciSynthProblems(text, stepsOf(text))
    }
    expect(planted('      - run: npm run synth:lz -w @hearth/infra\n', '')).toEqual([
      '.github/workflows/ci.yml: C11-D62 the check job runs npm run synth:lz -w @hearth/infra straight after npm test',
    ])
    expect(planted('permissions:\n  contents: read\n', 'permissions:\n  contents: read\n  id-token: write\n')).toEqual([
      '.github/workflows/ci.yml: C11-D62 no job may ask for an id-token',
      '.github/workflows/ci.yml: C11-D62 the top-level permissions are contents: read alone',
    ])
    expect(
      planted('      - run: npm ci\n', '      - uses: aws-actions/configure-aws-credentials@v4\n      - run: npm ci\n'),
    ).toEqual(['.github/workflows/ci.yml: C11-D62 no step takes AWS credentials'])
    expect(
      planted('      - run: npm ci\n', '      - run: npm ci\n        env:\n          AWS_REGION: ap-southeast-1\n'),
    ).toEqual(['.github/workflows/ci.yml: C11-D62 no line sets an AWS_ variable'])
  })
})
