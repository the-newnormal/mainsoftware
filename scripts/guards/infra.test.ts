// The infra source guard (IG, C0.11; TECH-SPEC T24 item 28): what the CDK app's source must and
// mustn't hold, before any template is synthesised. Each case is first proved on planted text, then
// held over the repository. The templates themselves are the assertion tests' (IAC, infra/**/*.test.ts).
// Cases so far (C0.11 PR 1 and PR 2): IG-01 to IG-12, and C11-D62's synth:lz script, with no hook
// around it and no script-shell in a root .npmrc, and its ci.yml step.
// This file and infra.ts are on the owner's-read list (C11-D74).
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
  npmrcProblems,
  ORGANIZATIONS_ID,
  packageFindings,
  RESERVED_FUNCTION_NAMES,
  readsForIdentifying,
  reasonFormLines,
  regionFindings,
  ruleFindings,
  scriptFindings,
  shellFunction,
  synthHookProblems,
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
  }, 30_000)
})

describe('IG-03 (C11-D24, C11-D48): no context file, cdk.out ignored, cdk.json runs the workload entry with no plugin or build command', () => {
  it('refuses another app, a plugin, a build command or any other key, on planted JSON', () => {
    expect(cdkJsonProblems({ app: 'node bin/workload.ts', context: {} })).toEqual([])
    expect(cdkJsonProblems({ app: 'npx tsx bin/workload.ts' })).toEqual([
      "infra/cdk.json: IG-03 app must be 'node bin/workload.ts'",
    ])
    expect(cdkJsonProblems({ app: 'node bin/workload.ts', plugin: ['x'] })).toEqual([
      'infra/cdk.json: IG-03 a plugin runs code inside the CLI',
    ])
    // A build command runs beside cdk.json before the CLI reads any app, an assembly named by --app
    // included, with whoever's credentials run it (C0.11 review 5 DOCS-01).
    const today = JSON.parse(readRepoFile('infra/cdk.json')) as Record<string, unknown>
    expect(cdkJsonProblems({ ...today, build: 'npm run prepare' })).toEqual([
      'infra/cdk.json: IG-03 a build command runs before the CLI reads any app',
    ])
    expect(cdkJsonProblems({ ...today, watch: { include: ['**'] }, requireApproval: 'never' })).toEqual([
      'infra/cdk.json: IG-03 holds only app, context and versionReporting, not "watch"',
      'infra/cdk.json: IG-03 holds only app, context and versionReporting, not "requireApproval"',
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
  }, 30_000)
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
  }, 30_000)
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
  }, 30_000)
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
  }, 30_000)
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
  }, 30_000)

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
  }, 30_000)
})

describe('IG-09 (C11-D11 to C11-D15): the break-glass helper refuses agents, isolates itself, and never exposes a credential', () => {
  const HELPER = 'infra/bin/break-glass.sh'
  const helper = readRepoFile(HELPER)
  const rules = (text: string) =>
    [...new Set(breakGlassFindings(HELPER, text).map(f => /IG-09[a-q]/.exec(f)?.[0]))].sort()
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
      [
        'a: a traced shell',
        plant('bash --rcfile "$rc" -i || true', 'bash --rcfile "$rc" -ix || true'),
        ['IG-09a', 'IG-09i'],
      ],
      ['b: a marker missing', plant('AI_AGENT CI GITHUB_ACTIONS; do', 'AI_AGENT CI; do'), ['IG-09b']],
      ['b: empty passes', plant(`[ -n "\${!name+x}" ]`, `[ -n "\${!name:-}" ]`), ['IG-09b', 'IG-09o']],
      [
        'b: refused after the first aws command',
        plant(
          'aws sso login --profile "$profile"\n',
          'aws sso login --profile "$profile"\nrefuse_agents\n',
          plant('\nrefuse_agents\nrequire_terminal\n', '\nrequire_terminal\n'),
        ),
        ['IG-09b'],
      ],
      [
        'b: the agents check inside a block that never runs',
        plant('\nrefuse_agents\nrequire_terminal\n', '\nif false; then\n  refuse_agents\nfi\nrequire_terminal\n'),
        ['IG-09b'],
      ],
      ['b: no terminal check', plant('\nrefuse_agents\nrequire_terminal\n', '\nrefuse_agents\n'), ['IG-09b']],
      [
        'b: the terminal check skipped by the line before',
        plant('\nrefuse_agents\nrequire_terminal\n', '\nrefuse_agents\ntrue ||\n  require_terminal\n'),
        ['IG-09b'],
      ],
      [
        'b: the terminal check inverted',
        plant('if ! [ -t 0 ] || ! [ -t 1 ]; then', 'if [ -t 0 ] && [ -t 1 ]; then'),
        ['IG-09b'],
      ],
      [
        'b: the terminal check only warns',
        plant("output both a terminal\\n' >&2\n    exit 3\n", "output both a terminal\\n' >&2\n"),
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
      [
        'd: the reason check’s answer ignored',
        plant('if ! valid_reason "$reason"; then usage; fi\n', 'valid_reason "$reason" || true\n'),
        ['IG-09d'],
      ],
      [
        'd: the reason check only warns',
        plant(
          'if ! valid_reason "$reason"; then usage; fi\n',
          'if ! valid_reason "$reason"; then printf \'break-glass: odd reason\\n\'; fi\n',
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
      [
        'f: the mode check’s refusal made inert',
        plant("  refuse 'refused: make its folder first", "  : 'refused: make its folder first"),
        ['IG-09f'],
      ],
      ['f: the mode check inverted', plant('if [ -z "$(find "$BG_HOME"', 'if ! [ -z "$(find "$BG_HOME"'), ['IG-09f']],
      ['g: a pager', plant('export AWS_PAGER=\n', ''), ['IG-09g']],
      ['g: history unchecked', helper.replaceAll('get cli_history', 'get cli_pager'), ['IG-09g']],
      [
        'g: the history check’s refusal made inert',
        plant('  refuse "refused: the AWS CLI\'s history', '  : "refused: the AWS CLI\'s history'),
        ['IG-09g'],
      ],
      [
        'g: the entry profile’s history unchecked',
        plant(
          ' ||\n  [ "$(aws configure get cli_history --profile "$profile"',
          ' &&\n  [ "$(aws configure get cli_history --profile "$profile"',
        ),
        ['IG-09g'],
      ],
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
        plant(
          '  aws sso logout >/dev/null 2>&1 || true\n  read -r holder 2>/dev/null <"$run_dir/pid"',
          '  read -r holder 2>/dev/null <"$run_dir/pid"',
        ),
        ['IG-09h'],
      ],
      [
        'h: the handler gives the signals their default action back',
        plant("  trap '' INT TERM HUP QUIT\n  trap - EXIT\n", '  trap - EXIT INT TERM HUP\n'),
        ['IG-09h'],
      ],
      ['h: errexit left on in the handler', plant('  trap - EXIT\n  set +e\n', '  trap - EXIT\n'), ['IG-09h']],
      ['h: a hang-up not ignored', plant("  trap '' INT TERM HUP QUIT\n", "  trap '' INT TERM QUIT\n"), ['IG-09h']],
      [
        'h: the signals ignored only after the close',
        plant(
          "  trap '' INT TERM HUP QUIT\n  trap - EXIT\n  set +e\n",
          "  trap - EXIT\n  set +e\n  close_session unprompted || true\n  trap '' INT TERM HUP QUIT\n",
        ),
        ['IG-09h'],
      ],
      ['i: a credential printed', afterAssume('echo "$AWS_SESSION_TOKEN"'), ['IG-09i', 'IG-09o']],
      ['i: a credential exported', afterAssume('export AWS_SESSION_TOKEN'), ['IG-09i']],
      ['i: a credential written', afterAssume('printf \'%s\' "$sk" >|"$entry_file"'), ['IG-09i', 'IG-09o']],
      ['i: eval', afterAssume('eval "$reason"'), ['IG-09i']],
      ['i: env alone', afterAssume('env'), ['IG-09i']],
      ['i: declare -p', afterAssume('declare -p'), ['IG-09i']],
      ['i: allexport', plant('set -f\n', 'set -f\nset -a\n'), ['IG-09i']],
      ['i: allexport joined', plant('set -f\n', 'set -f\nset -ea\n'), ['IG-09i']],
      ['i: allexport by name', plant('set -f\n', 'set -f\nset -o allexport\n'), ['IG-09i']],
      [
        'i: --debug',
        plant('aws sso login --profile "$profile"\n', 'aws sso login --profile "$profile" --debug\n'),
        ['IG-09i'],
      ],
      ['i: a config write', afterAssume('aws configure set region ap-southeast-1'), ['IG-09i']],
      [
        'i: the credentials exported by the CLI',
        afterAssume(
          'AWS_ACCESS_KEY_ID="$ak" AWS_SECRET_ACCESS_KEY="$sk" AWS_SESSION_TOKEN="$st" aws configure export-credentials',
        ),
        ['IG-09i'],
      ],
      [
        'i: jq prints a credential from its environment',
        afterAssume(`AWS_SESSION_TOKEN="$st" jq -rn 'env.AWS_SESSION_TOKEN'`),
        ['IG-09i', 'IG-09o'],
      ],
      [
        'i: jq prints a credential through $ENV',
        afterAssume(`AWS_SESSION_TOKEN="$st" jq -rn '$ENV.AWS_SESSION_TOKEN'`),
        ['IG-09i', 'IG-09o'],
      ],
      [
        'i: a credential written through a function',
        plant(
          'assume_role || exit 1\nopen_session\n',
          'assume_role || exit 1\nsecret_json >"$BG_HOME/k.json"\nopen_session\n',
          plant(
            '# The open entry, written before',
            `secret_json() {\n  AWS_SECRET_ACCESS_KEY="$sk" jq -n '{k: env.AWS_SECRET_ACCESS_KEY}'\n}\n\n# The open entry, written before`,
          ),
        ),
        ['IG-09i', 'IG-09o'],
      ],
      [
        'i: the console’s session printed, not sent',
        plant("sessionToken: env.AWS_SESSION_TOKEN}' |\n", "sessionToken: env.AWS_SESSION_TOKEN}' >&2\n"),
        ['IG-09i', 'IG-09o'],
      ],
      [
        'j: no reason tag',
        plant('--source-identity "$user" --tags "Key=hearth-reason,Value=$reason" \\', '--source-identity "$user" \\'),
        ['IG-09j'],
      ],
      ['j: two hours', plant('--duration-seconds 3600 --query', '--duration-seconds 7200 --query'), ['IG-09j']],
      [
        'j: the role’s answer kept in a file',
        plant('--output text 2>/dev/null); then', '--output text 2>/dev/null | tee "$BG_HOME/role"); then'),
        ['IG-09i', 'IG-09j'],
      ],
      [
        'j: the role’s answer written to a file, with no query naming the credentials',
        plant(
          "--query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken,Expiration]' \\\n    --output text 2>/dev/null); then",
          '--output json >"$BG_HOME/role" 2>/dev/null); then',
        ),
        ['IG-09j'],
      ],
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
        'k: a failed open entry ignored',
        plant(
          `put_entry "$key" || refuse "the open entry wasn't written, so nothing was done; see docs/runbooks/break-glass.md"`,
          'put_entry "$key" || true',
        ),
        ['IG-09k'],
      ],
      [
        'k: a failed open entry only warned of',
        plant(
          `put_entry "$key" || refuse "the open entry wasn't written, so nothing was done; see docs/runbooks/break-glass.md"`,
          `put_entry "$key" || printf 'break-glass: the open entry failed\\n' >&2`,
        ),
        ['IG-09k'],
      ],
      [
        'k: the close entry never put',
        plant('  put_entry "$key" || return 1\n  closed=yes\n', '  closed=yes\n'),
        ['IG-09k'],
      ],
      [
        'k: opened=yes before the put',
        plant(
          '  put_entry "$key" || refuse "the open entry',
          '  opened=yes\n  put_entry "$key" || refuse "the open entry',
        ),
        ['IG-09k'],
      ],
      [
        'k: a failed put ignored inside put_entry',
        plant("--if-none-match '*' >/dev/null 2>&1\n}", "--if-none-match '*' >/dev/null 2>&1 || true\n}"),
        ['IG-09k'],
      ],
      [
        'k: put_entry succeeds whatever the put',
        plant("--if-none-match '*' >/dev/null 2>&1\n}", "--if-none-match '*' >/dev/null 2>&1\n  return 0\n}"),
        ['IG-09k'],
      ],
      ['k: the open entry called under ||', plant('\nopen_session\n', '\nopen_session || true\n'), ['IG-09k']],
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
        // The console's exchange is the one into the sign-in endpoint, so its jq and prefixes are found too.
        ['IG-09i', 'IG-09l', 'IG-09o'],
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
      ['o: a credential read by another name', afterAssume(`n=sk\naws s3 ls --x "\${!n}"`), ['IG-09o']],
      ['o: a nameref to a credential', afterAssume('declare -n r=sk\naws s3 ls --x "$r"'), ['IG-09o']],
      [
        'o: a credential handed to awk',
        afterAssume(`AWS_SESSION_TOKEN="$st" awk 'BEGIN { print ENVIRON["AWS_SESSION_TOKEN"] }'`),
        ['IG-09o'],
      ],
      [
        'o: a credential handed to python',
        afterAssume(`AWS_SESSION_TOKEN="$st" python3 -c 'import os; print(os.environ["AWS_SESSION_TOKEN"])'`),
        ['IG-09o'],
      ],
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
        // The curl run is pinned whole too (l).
        ['IG-09l', 'IG-09o'],
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
      [
        'q: refuse_agents defined again, inert, before its call',
        plant(
          '\nrefuse_agents\nrequire_terminal\n',
          `\nrefuse_agents() {\n  local name\n  for name in ${AGENT_MARKERS.join(' ')}; do\n    if [ -n "\${!name+x}" ] && false; then\n      exit 3\n    fi\n  done\n}\n\nrefuse_agents\nrequire_terminal\n`,
        ),
        ['IG-09q'],
      ],
      [
        'q: valid_reason defined again on one line',
        plant(
          '\nrefuse_agents\nrequire_terminal\n',
          '\nvalid_reason() { return 0; }\nrefuse_agents\nrequire_terminal\n',
        ),
        ['IG-09q'],
      ],
      [
        'q: refuse_agents defined again with the function keyword',
        plant(
          '\nrefuse_agents\nrequire_terminal\n',
          '\nfunction refuse_agents {\n  :\n}\nrefuse_agents\nrequire_terminal\n',
        ),
        ['IG-09q'],
      ],
      [
        'q: valid_date defined twice',
        plant('\nvalid_reason() {\n', '\nvalid_date() {\n  return 0\n}\n\nvalid_reason() {\n'),
        ['IG-09q'],
      ],
      ['q: a definition in another form', plant('refuse_agents() {', 'refuse_agents () {'), ['IG-09b', 'IG-09q']],
      [
        'q: a builtin replaced',
        plant('\nrefuse_agents\nrequire_terminal\n', '\nexit() {\n  :\n}\n\nrefuse_agents\nrequire_terminal\n'),
        ['IG-09q'],
      ],
      ['q: aliases on', plant('set -f\n', 'set -f\nshopt -s expand_aliases\n'), ['IG-09q']],
      [
        'q: refuse returns',
        plant(
          `printf 'break-glass: %s\\n' "$1" >&2\n  exit 2\n}`,
          `printf 'break-glass: %s\\n' "$1" >&2\n  return 0\n}`,
        ),
        ['IG-09q'],
      ],
      ['q: usage carries on', plant('USAGE\n  exit 2\n}', 'USAGE\n  return 0\n}'), ['IG-09q']],
    ]
    for (const [name, planted, expected] of cases) expect(rules(planted), name).toEqual(expected)
  }, 30_000)

  // What a later line can do to a checked value or to the clean-up, each planted in a copy: the
  // trap dropped, replaced or a signal reset however it is spelt, the run ended around the handler,
  // the handler leaving before its sign-out, the reason or a flag set again in another spelling, a
  // pinned variable set again, and a command that prints every variable.
  it('finds each later line that undoes a checked value or the clean-up, planted in a copy, by its rule', () => {
    const afterAssume = (line: string) =>
      plant('assume_role || exit 1\nopen_session\n', `assume_role || exit 1\n${line}\nopen_session\n`)
    const inHandler = (line: string) => plant('  trap - EXIT\n  set +e\n', `  trap - EXIT\n  set +e\n${line}\n`)
    const afterOpenPrint = (line: string) =>
      plant(
        '  printf \'break-glass: open entry written for %s\\n\' "$session"\n',
        `  printf 'break-glass: open entry written for %s\\n' "$session"\n${line}\n`,
      )
    const holder = '  read -r holder 2>/dev/null <"$run_dir/pid"'
    const signOut = `  aws sso logout >/dev/null 2>&1 || true\n${holder}`
    const cases: Array<[string, string, string[]]> = [
      ['a: errexit off before the role', afterAssume('set +e'), ['IG-09a']],
      ['a: pipefail off', afterAssume('set +o pipefail'), ['IG-09a']],
      ['a: globbing back on', afterAssume('set +f'), ['IG-09a']],
      [
        'a: nounset off in a function',
        plant('close_session() {\n  local key\n', 'close_session() {\n  local key\n  set +u\n'),
        ['IG-09a'],
      ],
      ['h: a signal reset by its SIG name', inHandler('  trap - SIGINT SIGTERM SIGHUP'), ['IG-09h']],
      ['h: a signal reset by a lone sigspec', inHandler('  trap INT'), ['IG-09h']],
      ['h: signals reset by number', inHandler('  trap - 1 2 15'), ['IG-09h']],
      ['h: a signal reset after --', inHandler('  trap -- - INT'), ['IG-09h']],
      [
        'h: signals reset in a function the handler calls',
        plant('close_session() {\n  local key\n', 'close_session() {\n  local key\n  trap - INT TERM HUP\n'),
        ['IG-09h'],
      ],
      [
        'h: the trap dropped after the open entry',
        plant('\nopen_session\n', '\nopen_session\ntrap - EXIT INT TERM HUP\n'),
        ['IG-09h'],
      ],
      ['h: EXIT ignored after the open entry', plant('\nopen_session\n', "\nopen_session\ntrap '' EXIT\n"), ['IG-09h']],
      [
        'h: the handler replaced before the role',
        plant('\nassume_role || exit 1\n', "\ntrap ':' EXIT INT TERM HUP\nassume_role || exit 1\n"),
        ['IG-09h'],
      ],
      [
        'h: the trap dropped in the shell’s function',
        plant("  trap ':' INT\n", "  trap ':' INT\n  trap - EXIT\n"),
        ['IG-09h'],
      ],
      [
        'h: a clean-up trap in another function',
        plant('  local all=', `  trap 'rm -f "$BG_HOME/x"' EXIT\n  local all=`),
        ['IG-09h'],
      ],
      [
        'h: the shell’s pair the wrong way round',
        plant(
          "  trap ':' INT\n  AWS_ACCESS_KEY_ID=",
          "  trap 'on_exit' INT\n  AWS_ACCESS_KEY_ID=",
          plant("-i || true\n  trap 'on_exit' INT\n", "-i || true\n  trap ':' INT\n"),
        ),
        ['IG-09h'],
      ],
      [
        'h: killed after the shell',
        plant('\nrun_shell\nclose_session', '\nrun_shell\nkill -KILL "$$"\nclose_session'),
        ['IG-09h'],
      ],
      [
        'h: replaced after the shell',
        plant('\nrun_shell\nclose_session', '\nrun_shell\nexec bash -i\nclose_session'),
        ['IG-09h'],
      ],
      ['h: the handler leaves before the close', inHandler('  exit "$status"'), ['IG-09h']],
      ['h: the handler returns before the close', inHandler('  return 0'), ['IG-09h']],
      [
        'h: the handler leaves when nothing opened',
        inHandler('  if [ "$opened" = no ]; then exit "$status"; fi'),
        ['IG-09h'],
      ],
      [
        'h: the sign-out under if false',
        plant(signOut, `  if false; then\n    aws sso logout >/dev/null 2>&1 || true\n  fi\n${holder}`),
        ['IG-09h'],
      ],
      [
        'h: the sign-out only when a session opened',
        plant(signOut, `  if [ "$opened" = yes ]; then\n    aws sso logout >/dev/null 2>&1 || true\n  fi\n${holder}`),
        ['IG-09h'],
      ],
      [
        'h: errexit back on before the sign-out',
        plant(`  st=''\n${signOut}`, `  st=''\n  set -e\n${signOut}`),
        ['IG-09h'],
      ],
      [
        'h: the close refuses, which exits before the sign-out',
        plant(
          '  put_entry "$key" || return 1\n  closed=yes\n',
          '  put_entry "$key" || refuse \'no close\'\n  closed=yes\n',
        ),
        ['IG-09h'],
      ],
      [
        'h: the close never run',
        plant('  if [ "$opened" = yes ] && [ "$closed" = no ]; then\n', '  if false; then\n'),
        ['IG-09h'],
      ],
      ['j: the tag takes another value', plant('Value=$reason"', `Value=\${HEARTH_REASON:-$reason}"`), ['IG-09j']],
      ['j: the tag takes the argument', plant('Value=$reason"', 'Value=$2"'), ['IG-09j']],
      [
        'd: the reason set again after its check',
        plant(
          'if ! valid_reason "$reason"; then usage; fi\n',
          `if ! valid_reason "$reason"; then usage; fi\nreason="\${HEARTH_REASON:-$reason}"\n`,
        ),
        ['IG-09d'],
      ],
      [
        'd: the reason read again',
        plant(
          'if ! valid_reason "$reason"; then usage; fi\n',
          'if ! valid_reason "$reason"; then usage; fi\nread -r reason <"$HOME/.reason" || true\n',
        ),
        ['IG-09d'],
      ],
      ['d: the reason set by printf -v', afterAssume("printf -v reason '%s' x"), ['IG-09d']],
      [
        'd: a local reason in a caller of the assumption',
        plant('close_session() {\n  local key\n', `close_session() {\n  local key reason="\${HEARTH_REASON:-x}"\n`),
        ['IG-09d'],
      ],
      [
        'k: closed set, quoted, inline',
        plant(
          '  if [ "$1" = prompted ]; then collect_close; fi\n',
          '  if [ "$1" = prompted ]; then closed=\'yes\'; return 0; fi\n',
        ),
        ['IG-09k'],
      ],
      ['k: closed set by printf -v', afterOpenPrint("  printf -v closed '%s' yes"), ['IG-09k']],
      ['k: closed set by declare -g', afterOpenPrint('  declare -g closed=yes'), ['IG-09k']],
      ['k: closed set by an expansion', afterAssume(`: "\${closed:=yes}"`), ['IG-09k']],
      ['k: closed set inside an if', afterAssume('if true; then closed=yes; fi'), ['IG-09k']],
      ['k: closed never started', plant('\nclosed=no\n', '\n'), ['IG-09k']],
      // C0.11 review 4 HELPER-02: the role is taken for a late close only on a sign-in this run has checked.
      ['k: the close’s sign-in check dropped', plant('    [ "$sign_in" = checked ] || return 1\n', ''), ['IG-09k']],
      [
        'k: the close’s sign-in check carried on from a line before',
        plant('    [ "$sign_in" = checked ] || return 1\n', '    true ||\n    [ "$sign_in" = checked ] || return 1\n'),
        ['IG-09k'],
      ],
      [
        'k: the close’s sign-in check after the assumption',
        plant(
          '    [ "$sign_in" = checked ] || return 1\n    assume_role || return 1\n',
          '    assume_role || return 1\n    [ "$sign_in" = checked ] || return 1\n',
        ),
        ['IG-09k'],
      ],
      ['k: the second sign-in never marked unchecked', plant('  sign_in=unchecked\n', ''), ['IG-09k']],
      [
        'k: the second sign-in marked unchecked after its login',
        plant(
          '  sign_in=unchecked\n  aws sso login --profile "$profile" || return 1\n',
          '  aws sso login --profile "$profile" || return 1\n  sign_in=unchecked\n',
        ),
        ['IG-09k'],
      ],
      [
        'k: the second sign-in marked checked before its check',
        plant(
          '  sign_in=checked\n}\n',
          '}\n',
          plant('  sign_in=unchecked\n', '  sign_in=unchecked\n  sign_in=checked\n'),
        ),
        ['IG-09k'],
      ],
      ['k: the sign-in flag set again', afterAssume('sign_in=checked'), ['IG-09k']],
      ['k: the sign-in flag set by printf -v', afterAssume("printf -v sign_in '%s' checked"), ['IG-09k']],
      ['k: the sign-in flag never started', plant('\nsign_in=checked\n', '\n'), ['IG-09k']],
      [
        'e: the credentials file set again',
        plant(
          'export CDK_HOME="$BG_HOME/.cdk"\n',
          `export CDK_HOME="$BG_HOME/.cdk"\nexport AWS_SHARED_CREDENTIALS_FILE="\${HEARTH_CREDS:-/dev/null}"\n`,
        ),
        ['IG-09e'],
      ],
      [
        'e: another config as a prefix',
        afterAssume('AWS_CONFIG_FILE="$HOME/.aws/config" aws sts get-caller-identity >/dev/null'),
        ['IG-09e'],
      ],
      ['e: HOME unset', afterAssume('unset HOME'), ['IG-09e']],
      ['c: the locale set back', afterAssume('LC_ALL=en_US.UTF-8'), ['IG-09c']],
      ['g: a pager set again', afterAssume('export AWS_PAGER=less'), ['IG-09g']],
      ['i: set into a file', afterAssume('set >"$BG_HOME/state"'), ['IG-09i']],
      ['i: set with its errors silenced', afterAssume('set 2>/dev/null'), ['IG-09i']],
      ['i: set in braces', afterAssume('{ set; }'), ['IG-09i']],
      ['i: set in a subshell', afterAssume('( set )'), ['IG-09i']],
      ['i: set in a substitution', afterAssume('x=$(set)'), ['IG-09i']],
      ['i: declare alone', afterAssume('declare'), ['IG-09i']],
      ['i: typeset alone', afterAssume('typeset'), ['IG-09i']],
      ['i: declare into a file', afterAssume('declare >"$BG_HOME/x"'), ['IG-09i']],
      ['i: declare piped', afterAssume('declare | cat'), ['IG-09i']],
      [
        'i: local alone in the console’s function',
        plant('  token="$(token="$token" jq', '  local\n  token="$(token="$token" jq'),
        ['IG-09i'],
      ],
      ['i: export given only an option', afterAssume('export -n'), ['IG-09i']],
      ['i: set given options passes', afterAssume('set -euo pipefail'), []],
      ['i: declare naming a variable passes', afterAssume('declare n=1'), []],
    ]
    for (const [name, planted, expected] of cases) expect(rules(planted), name).toEqual(expected)
  }, 30_000)

  it('finds a curl run other than the pinned line (without -q first, or with a trace, output or certificate option), an inherited TLS setting, and a folder lock moved or released early, planted in a copy, by its rule', () => {
    const afterAssume = (line: string) =>
      plant('assume_role || exit 1\nopen_session\n', `assume_role || exit 1\n${line}\nopen_session\n`)
    const tls =
      'unset CURL_HOME XDG_CONFIG_HOME SSLKEYLOGFILE REQUESTS_CA_BUNDLE CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR\n'
    const node = 'unset NODE_TLS_REJECT_UNAUTHORIZED NODE_OPTIONS NODE_USE_SYSTEM_CA\n'
    const loop =
      'for inherited in $(compgen -e); do\n  case "$inherited" in\n    AWS_* | aws_*) unset "$inherited" ;;\n  esac\ndone\n'
    const release =
      '  read -r holder 2>/dev/null <"$run_dir/pid"\n  if [ "$holder" = "$$" ]; then rm -f "$entry_file" "$rc" "$run_dir/pid" && rmdir "$run_dir"; fi\n'
    const signOut = '  aws sso logout >/dev/null 2>&1 || true\n'
    const cases: Array<[string, string, string[]]> = [
      ['l: curl without -q, so it reads a .curlrc', plant('curl -q -fsS', 'curl -fsS'), ['IG-09l']],
      ['l: -q after another option, where curl ignores it', plant('curl -q -fsS', 'curl -fsS -q'), ['IG-09l']],
      // Each of curl's own options that writes the exchange (the POST body holding the role's session,
      // or the answer holding its sign-in token) to a file or the terminal, reads more options, or
      // stops checking the certificate (C0.11 review 6 HELPER-02): the run is pinned whole, so none is
      // let in.
      ...[
        '--trace "$BG_HOME/curl.trace"',
        '--trace-ascii "$BG_HOME/curl.trace"',
        '--libcurl "$BG_HOME/curl.c"',
        '-v',
        '--stderr "$BG_HOME/curl.err"',
        '-o "$BG_HOME/token.json"',
        '--output "$BG_HOME/token.json"',
        '-D "$BG_HOME/headers"',
        '-K "$BG_HOME/curl.cfg"',
        '--config "$BG_HOME/curl.cfg"',
        '-k',
        '--insecure',
      ].map((option): [string, string, string[]] => [
        `l: curl given ${option.split(' ')[0]}`,
        plant('curl -q -fsS', `curl -q ${option} -fsS`),
        ['IG-09l'],
      ]),
      [
        'l: a trace option after the endpoint',
        plant(
          'https://signin.aws.amazon.com/federation 2>/dev/null',
          'https://signin.aws.amazon.com/federation --trace-ascii "$BG_HOME/curl.trace" 2>/dev/null',
        ),
        ['IG-09l'],
      ],
      [
        'l: curl’s errors written to a file',
        plant(
          'https://signin.aws.amazon.com/federation 2>/dev/null',
          'https://signin.aws.amazon.com/federation 2>"$BG_HOME/curl.err"',
        ),
        ['IG-09l'],
      ],
      [
        'l: the sign-in answer kept in a file',
        plant(" 2>/dev/null | jq -r '.SigninToken", ' 2>/dev/null | tee "$BG_HOME/token.json" | jq -r \'.SigninToken'),
        ['IG-09l'],
      ],
      ['e: curl’s config, a key log and the CA overrides inherited', plant(tls, ''), ['IG-09e']],
      [
        'e: the TLS settings unset only after the first aws command',
        plant(
          "command -v jq >/dev/null 2>&1 || refuse 'refused: it needs jq'\n",
          `command -v jq >/dev/null 2>&1 || refuse 'refused: it needs jq'\n${tls}`,
          plant(`still checked.\n${tls}`, 'still checked.\n'),
        ),
        ['IG-09e'],
      ],
      ['e: one of them left out', plant(tls, tls.replace(' SSLKEYLOGFILE', '')), ['IG-09e']],
      ['e: Node’s certificate check, options and system CAs inherited', plant(node, ''), ['IG-09e']],
      ['e: Node’s options left in', plant(node, node.replace(' NODE_OPTIONS', '')), ['IG-09e']],
      [
        'e: Node’s certificate check turned off again',
        afterAssume('export NODE_TLS_REJECT_UNAUTHORIZED=0'),
        ['IG-09e'],
      ],
      ['e: a lower-case aws_ca_bundle inherited', plant('AWS_* | aws_*) unset', 'AWS_*) unset'), ['IG-09e']],
      ['e: the inherited AWS variables’ loop gone', plant(loop, ''), ['IG-09e']],
      ['e: a key log set again', afterAssume('export SSLKEYLOGFILE="$BG_HOME/keys"'), ['IG-09e']],
      [
        'e: a CA override as a prefix',
        afterAssume('REQUESTS_CA_BUNDLE=/tmp/ca aws sts get-caller-identity >/dev/null'),
        ['IG-09e'],
      ],
      ['h: the lock released before the sign-out', plant(`${signOut}${release}`, `${release}${signOut}`), ['IG-09h']],
      [
        'h: the entry outside the run’s folder',
        plant('entry_file="$run_dir/entry.json"', 'entry_file="$BG_HOME/entry.json"'),
        ['IG-09h'],
      ],
      ['h: the rc file set again', afterAssume('rc="$BG_HOME/shell.rc"'), ['IG-09h']],
      [
        'h: the lock taken after the trap',
        plant("hold_folder\ntrap 'on_exit' EXIT INT TERM HUP\n", "trap 'on_exit' EXIT INT TERM HUP\nhold_folder\n"),
        ['IG-09h'],
      ],
      ['h: the lock never taken', plant("hold_folder\ntrap 'on_exit'", "trap 'on_exit'"), ['IG-09h']],
      [
        'h: a held lock not refused',
        plant('  if ! mkdir "$run_dir" 2>/dev/null; then\n', '  if ! mkdir -p "$run_dir" 2>/dev/null; then\n'),
        ['IG-09h'],
      ],
      [
        'h: the folder removed in the close',
        plant('close_session() {\n  local key\n', 'close_session() {\n  local key\n  rm -rf "$run_dir"\n'),
        ['IG-09h'],
      ],
      [
        'h: the folder moved aside after the shell',
        plant('\nrun_shell\nclose_session', '\nrun_shell\nmv "$run_dir" "$BG_HOME/old"\nclose_session'),
        ['IG-09h'],
      ],
    ]
    for (const [name, planted, expected] of cases) expect(rules(planted), name).toEqual(expected)
  }, 30_000)

  // The shell's rc file runs inside the shell that holds the role's credentials in its environment: a
  // line added to it, or a change to how the shell starts; and env given no command to run, shopt
  // turning an option of set back off, and a pinned folder, lock or name set again after its check,
  // each planted in a copy.
  it('finds a line added to the shell’s rc or start, env printing, shopt turning an option off, and a pinned name set again, planted in a copy, by its rule', () => {
    const afterAssume = (line: string) =>
      plant('assume_role || exit 1\nopen_session\n', `assume_role || exit 1\n${line}\nopen_session\n`)
    const inRc = (line: string) =>
      plant('unset HISTFILE\nhearth_bg_prompt', `unset HISTFILE\n${line}\nhearth_bg_prompt`)
    const afterModeCheck = (line: string) =>
      plant("(docs/runbooks/break-glass.md)'\nfi\n", `(docs/runbooks/break-glass.md)'\nfi\n${line}\n`)
    const profile = 'profile="hearth-$environment-entry"\n'
    const cases: Array<[string, string, string[]]> = [
      ['i: env into a file in the shell’s rc', inRc('env >"$HOME/session.env"'), ['IG-09i']],
      ['i: env, its errors silenced, into a file in the rc', inRc('env 2>/dev/null >"$HOME/session.env"'), ['IG-09i']],
      ['i: env -0 into a file in the rc', inRc('env -0 >"$HOME/session.env"'), ['IG-09i']],
      ['i: env -u into a file in the rc', inRc('env -u PS1 >"$HOME/session.env"'), ['IG-09i']],
      ['i: the environment read from /proc in the rc', inRc('cat /proc/self/environ >"$HOME/session.env"'), ['IG-09i']],
      [
        'i: awk printing its environment in the rc',
        inRc(`awk 'BEGIN { for (k in ENVIRON) print k, ENVIRON[k] }' >"$HOME/session.env"`),
        ['IG-09i'],
      ],
      ['i: the rc keeps history', plant('unset HISTFILE\nhearth_bg_prompt', 'hearth_bg_prompt'), ['IG-09i']],
      ['i: the shell keeps history', plant(' HISTFILE=/dev/null \\\n', ' \\\n'), ['IG-09i']],
      [
        'i: a line appended to the rc after it is written',
        plant("RC\n  printf 'break-glass: the role", "RC\n  echo 'PS0=x' >>\"$rc\"\n  printf 'break-glass: the role"),
        ['IG-09i'],
      ],
      [
        'i: a line appended to the rc by its path',
        plant(
          "RC\n  printf 'break-glass: the role",
          "RC\n  echo 'PS0=x' >>\"$run_dir/shell.rc\"\n  printf 'break-glass: the role",
        ),
        ['IG-09i'],
      ],
      ['i: env into a file', afterAssume('env >"$BG_HOME/session.env"'), ['IG-09i']],
      ['i: env by its path into a file', afterAssume('/usr/bin/env >"$BG_HOME/session.env"'), ['IG-09i']],
      ['i: env given an assignment, into a file', afterAssume('env TZ=UTC >"$BG_HOME/session.env"'), ['IG-09i']],
      ['i: env in backquotes', afterAssume('saved=`env`'), ['IG-09i']],
      ['i: env running a command passes', afterAssume('env -u PS1 TZ=UTC date -u'), []],
      ['a: errexit off through shopt', plant('set -f\n', 'set -f\nshopt -uo errexit\n'), ['IG-09a']],
      ['a: errexit off through shopt -ou', plant('set -f\n', 'set -f\nshopt -ou errexit\n'), ['IG-09a']],
      ['a: nounset off through shopt -u -o', plant('set -f\n', 'set -f\nshopt -u -o nounset\n'), ['IG-09a']],
      ['a: pipefail off through shopt', afterAssume('shopt -uo pipefail'), ['IG-09a']],
      ['a: globbing back on through shopt', afterAssume('shopt -uo noglob'), ['IG-09a']],
      [
        'a: nounset off through shopt in a function',
        plant('close_session() {\n  local key\n', 'close_session() {\n  local key\n  shopt -uo nounset\n'),
        ['IG-09a'],
      ],
      ['a: a shopt option of its own passes', afterAssume('shopt -s checkwinsize'), []],
      [
        'h: the lock made per run',
        plant('run_dir="$BG_HOME/run.lock"\n', 'run_dir="$BG_HOME/run.lock"\nrun_dir="$run_dir.$$"\n'),
        ['IG-09h'],
      ],
      [
        'h: the lock made per run by printf -v',
        plant('rc="$run_dir/shell.rc"\n', `rc="$run_dir/shell.rc"\nprintf -v run_dir '%s.%s' "$run_dir" "$$"\n`),
        ['IG-09h'],
      ],
      [
        'h: the lock removed through HOME',
        plant('aws sso login --profile "$profile"\n', 'aws sso login --profile "$profile"\nrm -rf "$HOME/run.lock"\n'),
        ['IG-09h'],
      ],
      [
        'h: the lock removed through ~',
        plant(
          'aws sso login --profile "$profile"\n',
          'aws sso login --profile "$profile"\nrm -rf ~/.hearth-break-glass/run.lock\n',
        ),
        ['IG-09h'],
      ],
      ['f: the folder set again after its check', afterModeCheck(`BG_HOME="\${HEARTH_BG_ALT:-$BG_HOME}"`), ['IG-09f']],
      [
        'm: the environment set again after its checks',
        plant(profile, `environment="\${HEARTH_BG_ENV:-$environment}"\n${profile}`),
        ['IG-09m'],
      ],
      [
        'm: the profile taken from outside',
        plant(profile, `profile="\${HEARTH_BG_PROFILE:-hearth-$environment-entry}"\n`),
        ['IG-09m'],
      ],
    ]
    for (const [name, planted, expected] of cases) expect(rules(planted), name).toEqual(expected)
  }, 30_000)

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
  }, 30_000)

  it('b: require_terminal, run on its own with standard input and output piped, refuses', () => {
    const fn = shellFunction(helper, 'require_terminal') ?? ''
    expect(fn).toContain('require_terminal() {')
    expect(run(`${fn}\nrequire_terminal`)).toBe(3)
    // An inverted copy lets a piped run through, which the case above would catch.
    const inverted = plant('if ! [ -t 0 ] || ! [ -t 1 ]; then', 'if [ -t 0 ] && [ -t 1 ]; then')
    expect(run(`${shellFunction(inverted, 'require_terminal') ?? ''}\nrequire_terminal`)).toBe(0)
  }, 30_000)

  it('q: usage and refuse, run on their own, exit non-zero, so every refusal ends the run', () => {
    const usage = shellFunction(helper, 'usage') ?? ''
    const refuse = shellFunction(helper, 'refuse') ?? ''
    expect(usage).toContain('usage() {')
    expect(refuse).toContain('refuse() {')
    expect(run(`${usage}\nusage\nexit 0`)).toBe(2)
    expect(run(`${refuse}\nrefuse 'refused'\nexit 0`)).toBe(2)
    const returns = plant(
      `printf 'break-glass: %s\\n' "$1" >&2\n  exit 2\n}`,
      `printf 'break-glass: %s\\n' "$1" >&2\n}`,
    )
    expect(run(`${shellFunction(returns, 'refuse') ?? ''}\nrefuse 'refused'\nexit 0`)).toBe(0)
  }, 30_000)

  it('q: a function defined twice is not extracted, so no test runs a body bash wouldn’t', () => {
    const twice = plant(
      '\nrefuse_agents\nrequire_terminal\n',
      '\nrefuse_agents() {\n  :\n}\n\nrefuse_agents\nrequire_terminal\n',
    )
    expect(shellFunction(twice, 'refuse_agents')).toBeUndefined()
    expect(shellFunction(plant('refuse_agents() {', 'function refuse_agents {'), 'refuse_agents')).toBeUndefined()
    expect(shellFunction(helper, 'valid_reason')).toContain('valid_reason() {')
  })

  it('q: no function may take the name of a builtin or keyword bash lists', () => {
    const listed = spawnSync('bash', ['-c', 'compgen -b; compgen -k'], { encoding: 'utf8' }).stdout.split('\n')
    const names = listed.map(name => name.trim()).filter(name => name !== '')
    expect(names.length).toBeGreaterThan(50)
    expect(names.filter(name => !RESERVED_FUNCTION_NAMES.includes(name))).toEqual([])
  }, 30_000)

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
  }, 30_000)

  it('d: a reason’s date is never after today in Singapore, so in the evening, UTC, Singapore’s next day is taken and the day after refused', () => {
    const check = [shellFunction(helper, 'valid_date'), 'valid_date "$1"'].join('\n')
    // A date shim first on PATH that runs the real date at 18:00 UTC on 31 Oct 2026, 02:00 on
    // 1 Nov in Singapore, honouring TZ and -u as the real one does (GNU's -d @, else BSD's -r).
    const real = execFileSync('bash', ['-c', 'command -v date'], { encoding: 'utf8' }).trim()
    const epoch = Date.UTC(2026, 9, 31, 18) / 1000
    const shims = mkdtempSync(join(tmpdir(), 'ig09-date-'))
    try {
      writeFileSync(
        join(shims, 'date'),
        [
          '#!/bin/bash',
          `if '${real}' -d @0 +%s >/dev/null 2>&1; then exec '${real}' -d @${epoch} "$@"; fi`,
          `exec '${real}' -r ${epoch} "$@"`,
          '',
        ].join('\n'),
      )
      chmodSync(join(shims, 'date'), 0o755)
      const pinned = { PATH: `${shims}:${process.env.PATH ?? ''}` }
      expect(execFileSync(join(shims, 'date'), ['-u', '+%Y-%m-%d'], { encoding: 'utf8' }).trim()).toBe('2026-10-31')
      for (const date of ['2026-10-31', '2026-11-01']) expect(run(check, [date], pinned), date).toBe(0)
      for (const date of ['2026-11-02', '2027-01-01']) expect(run(check, [date], pinned), date).not.toBe(0)
      // A copy that counts the day in UTC refuses Singapore's day, so this case would catch it.
      const utc = check.replace('TZ=SGT-8 date +%Y-%m-%d', 'date -u +%Y-%m-%d')
      expect(utc).not.toBe(check)
      expect(run(utc, ['2026-11-01'], pinned)).not.toBe(0)
    } finally {
      rmSync(shims, { recursive: true, force: true })
    }
  }, 30_000)

  // C0.11 review 5 HELPER-01 and HELPER-02.
  it('a, k: the start-up gate, the dropped functions, the >| writes and the pending continuation are each pinned', () => {
    const loop = 'for exported_function in $(compgen -A function); do\n  unset -f "$exported_function"\ndone\n'
    const cases: Array<[string, string, string[]]> = [
      [
        'a: the start-up gate never called',
        plant('require_terminal\nrefuse_inherited_shell\n', 'require_terminal\n'),
        ['IG-09a'],
      ],
      [
        'a: the start-up gate after the first aws command',
        plant('require_terminal\nrefuse_inherited_shell\n', 'require_terminal\n').replace(
          '\nassume_role || exit 1\n',
          '\nrefuse_inherited_shell\nassume_role || exit 1\n',
        ),
        ['IG-09a'],
      ],
      ['a: POSIX mode let through', plant(' || [[ :$SHELLOPTS: == *:posix:* ]]', ''), ['IG-09a']],
      [
        'a: BASH_ENV let through',
        plant('SHELLOPTS | BASHOPTS | BASH_ENV) exported=yes', 'SHELLOPTS | BASHOPTS) exported=yes'),
        ['IG-09a'],
      ],
      [
        'a: the gate returns',
        plant('break-glass.md)\\n" >&2\n    exit 3\n', 'break-glass.md)\\n" >&2\n    return 0\n'),
        ['IG-09a'],
      ],
      ['a: exported functions kept', plant(loop, ''), ['IG-09a']],
      [
        'a: exported functions dropped after the helper defines its own',
        plant(loop, '').replace('\nrefuse_agents\nrequire_terminal\n', `\n${loop}refuse_agents\nrequire_terminal\n`),
        ['IG-09a'],
      ],
      [
        'k: the close written with >',
        plant(`outcome: $outcome}' \\\n    >|"$entry_file"`, `outcome: $outcome}' \\\n    >"$entry_file"`),
        ['IG-09k'],
      ],
      [
        'k: the open entry written with >',
        plant(
          `expires: $expires}' \\\n    >|"$entry_file"\n  put_entry "$key" || refuse`,
          `expires: $expires}' \\\n    >"$entry_file"\n  put_entry "$key" || refuse`,
        ),
        ['IG-09k'],
      ],
      // C0.11 review 7 CR-05: an append keeps the earlier body and adds the new one, an invalid entry.
      [
        'k: the close appended with >>',
        plant(`outcome: $outcome}' \\\n    >|"$entry_file"`, `outcome: $outcome}' \\\n    >>"$entry_file"`),
        ['IG-09k'],
      ],
      [
        'k: the open entry appended with >>',
        plant(
          `expires: $expires}' \\\n    >|"$entry_file"\n  put_entry "$key" || refuse`,
          `expires: $expires}' \\\n    >> "$entry_file"\n  put_entry "$key" || refuse`,
        ),
        ['IG-09k'],
      ],
      [
        'k: the amend appended with &>>',
        plant(`ids: $ids}' \\\n    >|"$entry_file"`, `ids: $ids}' \\\n    &>>"$entry_file"`),
        ['IG-09k'],
      ],
      [
        'k: the continuation written with >&',
        plant(
          `expires: $expires}' \\\n      >|"$entry_file"\n    put_entry "$(entry_key "$session" continuation)"`,
          `expires: $expires}' \\\n      >&"$entry_file"\n    put_entry "$(entry_key "$session" continuation)"`,
        ),
        ['IG-09k'],
      ],
      [
        'k: the close written with 1>',
        plant(`outcome: $outcome}' \\\n    >|"$entry_file"`, `outcome: $outcome}' \\\n    1>"\${entry_file}"`),
        ['IG-09k'],
      ],
      [
        'k: the continuation only straight after the role is taken',
        plant(
          '    assume_role || return 1\n  fi\n  if [ "$session" != "$first_session" ] && [ "$session" != "$continued" ]; then\n',
          '    assume_role || return 1\n  if [ "$session" != "$first_session" ] && [ "$session" != "$continued" ]; then\n',
        ).replace('    continued="$session"\n  fi\n', '    continued="$session"\n  fi\n  fi\n'),
        ['IG-09k'],
      ],
      ['k: the continuation never recorded', plant('    continued="$session"\n', ''), ['IG-09k']],
      [
        'k: continued set by printf -v',
        plant('    continued="$session"\n', `    continued="$session"\n    printf -v continued '%s' x\n`),
        ['IG-09k'],
      ],
      ['k: continued never started', plant("\ncontinued=''\n", '\n'), ['IG-09k']],
    ]
    for (const [name, planted, expected] of cases) expect(rules(planted), name).toEqual(expected)
  }, 30_000)

  it('a: refuse_inherited_shell, run as a script, refuses each start-up state bash inherits and passes with none', () => {
    const fn = shellFunction(helper, 'refuse_inherited_shell') ?? ''
    expect(fn).toContain('refuse_inherited_shell() {')
    const dir = mkdtempSync(join(tmpdir(), 'ig09-start-'))
    try {
      // As the helper runs it: after its own set -euo pipefail and set -f, from a file, since bash -c
      // adds c to $-.
      const gate = (body: string) => {
        const path = join(dir, `gate-${Math.random().toString(36).slice(2)}.sh`)
        writeFileSync(path, ['set -euo pipefail', 'set -f', body, 'refuse_inherited_shell', ''].join('\n'))
        return path
      }
      const start = (path: string, shell: string, env: Record<string, string> = {}) =>
        spawnSync(
          'env',
          [
            '-i',
            `PATH=${process.env.PATH ?? ''}`,
            ...Object.entries(env).map(([k, v]) => `${k}=${v}`),
            'bash',
            '-c',
            `${shell} "$0"`,
            path,
          ],
          { encoding: 'utf8' },
        ).status
      const script = gate(fn)
      for (const shell of ['bash', 'bash -p', 'f() { :; }; export -f f; bash'])
        expect(start(script, shell), shell).toBe(0)
      const refused: Array<[string, string, Record<string, string>?]> = [
        ['a trace', 'bash -x'],
        ['verbose', 'bash -v'],
        ['noclobber', 'bash -C'],
        ['every variable exported', 'bash -a'],
        ['keyword mode', 'bash -k'],
        ['POSIX mode', 'bash --posix'],
        ['POSIXLY_CORRECT', 'bash', { POSIXLY_CORRECT: '1' }],
        ['SHELLOPTS exported, noclobber in it', 'set -o noclobber; export SHELLOPTS; bash'],
        ['SHELLOPTS exported, defaults only', 'export SHELLOPTS; bash'],
        ['BASHOPTS exported', 'shopt -s nocasematch; export BASHOPTS; bash'],
        ['BASH_ENV', 'bash', { BASH_ENV: '/dev/null' }],
        ['BASH_ENV empty', 'bash', { BASH_ENV: '' }],
      ]
      for (const [name, shell, env] of refused) expect(start(script, shell, env), name).toBe(3)
      // A copy without the POSIX check lets POSIX mode through, which the case above would catch.
      const lax = gate(fn.replace(' || [[ :$SHELLOPTS: == *:posix:* ]]', ''))
      expect(start(lax, 'bash --posix')).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)

  it('n: bash parses it, a planted syntax error fails, and its mode is executable', () => {
    expect(spawnSync('bash', ['-n', join(root, HELPER)]).status).toBe(0)
    expect(spawnSync('bash', ['-n', '-c', plant('\nrun_shell\n', '\nif run_shell\n')]).status).not.toBe(0)
    const staged = execFileSync('git', ['ls-files', '-s', HELPER], { cwd: root, encoding: 'utf8' })
    if (staged === '') expect(statSync(join(root, HELPER)).mode & 0o111).toBe(0o111)
    else expect(staged.startsWith('100755 ')).toBe(true)
  }, 30_000)
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
  }, 30_000)
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
  }, 30_000)
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
    // Anything run beside the synth runs in npm's shell with the caller's environment, AWS keys and
    // all; and an option the parts don't name (a plugin) is one more than the script's.
    const whole = [
      expect.stringMatching(/C11-D62 is exactly env -i .* --quiet, one command, so nothing runs outside env -i$/),
    ]
    for (const after of [
      ' && aws sts get-caller-identity',
      "; cdk synth --app 'node bin/landing-zone.ts' --no-lookups --no-notices --quiet",
      ' && cdk ls',
      ' && node -e "1"',
      ' | tee x',
      ' > out',
      ' --plugin ./x.js',
      ' -p ./x.js',
    ]) {
      expect(changed(' --quiet', ` --quiet${after}`), after).toEqual(whole)
    }
    // A line break where a space was: sh runs env -i alone, then the synth with every variable.
    expect(changed('env -i ', 'env -i\n')).toEqual(whole)
  })

  // npm runs a pre or post hook, and a root .npmrc's script-shell, with the caller's environment,
  // outside env -i; IG-07 lets `cdk ls` stand in any script, so these two pins are what find one.
  it('npm runs no hook around it, and no tracked root .npmrc names a script shell', () => {
    const manifest = JSON.parse(readRepoFile('infra/package.json'))
    expect(synthHookProblems(manifest)).toEqual([])
    const tracked = execFileSync('git', ['ls-files', '--cached', '--', '.npmrc'], { cwd: root, encoding: 'utf8' })
    expect(tracked.trim() === '' ? [] : npmrcProblems(readRepoFile('.npmrc'))).toEqual([])

    const hooked = (text: string) => synthHookProblems(JSON.parse(text))
    const manifestText = readRepoFile('infra/package.json')
    const scriptsKey = '"scripts": {\n'
    expect(manifestText).toContain(scriptsKey)
    const plant = (hooks: string) => manifestText.replace(scriptsKey, () => `${scriptsKey}${hooks}`)
    const pre =
      "infra/package.json presynth:lz: C11-D62 no presynth:lz script: npm runs it with the caller's environment, outside env -i"
    const post =
      "infra/package.json postsynth:lz: C11-D62 no postsynth:lz script: npm runs it with the caller's environment, outside env -i"
    expect(hooked(plant('    "presynth:lz": "cdk ls",\n'))).toEqual([pre])
    expect(hooked(plant(`    "postsynth:lz": "cdk ls --app 'node bin/landing-zone.ts'",\n`))).toEqual([post])
    expect(hooked(plant('    "presynth:lz": "cdk ls",\n    "postsynth:lz": "cdk ls",\n'))).toEqual([pre, post])
    // A key spelled with a JSON escape is the same key to npm.
    expect(hooked(plant('    "pre\\u0073ynth:lz": "cdk ls",\n'))).toEqual([pre])
    // IG-07 passes each of them, which is why this pin exists.
    expect(scriptFindings('infra/package.json', JSON.parse(plant('    "presynth:lz": "cdk ls",\n')))).toEqual([])
    // Hooks of other scripts, and a script whose name only starts like one, are not synth:lz's.
    expect(hooked(plant('    "pretypecheck": "true",\n    "presynth:lzx": "true",\n'))).toEqual([])

    const shell = [
      ".npmrc: C11-D62 sets no script-shell: npm hands synth:lz to it with the caller's environment, before env -i",
    ]
    expect(npmrcProblems('script-shell=./scripts/sh.sh\n')).toEqual(shell)
    expect(npmrcProblems('engine-strict=true\n"script-shell" = /bin/bash\n')).toEqual(shell)
    expect(npmrcProblems("  'script-shell'=bash\r\n")).toEqual(shell)
    expect(npmrcProblems('SCRIPT_SHELL=bash\n')).toEqual(shell)
    expect(npmrcProblems('engine-strict=true\nsave-exact=true\n; script-shell=bash\n# script-shell=bash\n')).toEqual([])
  }, 30_000)

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
    // The step gone, or either step skipped or let fail, so a synth the CLI can't run would merge green.
    const step = [
      '.github/workflows/ci.yml: C11-D62 the check job runs npm run synth:lz -w @hearth/infra straight after npm test, each step its run line alone',
    ]
    const synthStep = '      - run: npm run synth:lz -w @hearth/infra\n'
    expect(planted(synthStep, '')).toEqual(step)
    expect(planted(synthStep, '      - if: false\n        run: npm run synth:lz -w @hearth/infra\n')).toEqual(step)
    expect(planted(synthStep, `${synthStep}        continue-on-error: true\n`)).toEqual(step)
    expect(planted('      - run: npm test\n', '      - if: false\n        run: npm test\n')).toEqual(step)
    expect(planted('      - run: npm test\n', '      - run: npm test\n        continue-on-error: true\n')).toEqual(step)
    expect(planted('permissions:\n  contents: read\n', 'permissions:\n  contents: read\n  id-token: write\n')).toEqual([
      '.github/workflows/ci.yml: C11-D62 no job may ask for an id-token',
      '.github/workflows/ci.yml: C11-D62 the top-level permissions are contents: read alone',
    ])
    // A job's own permissions, in every spelling that grants an id-token, a uses: job's included.
    const idToken = ['.github/workflows/ci.yml: C11-D62 no job may ask for an id-token']
    const check = '  check:\n    needs: [secrets, audit]\n'
    expect(planted(check, `${check}    permissions: write-all\n`)).toEqual(idToken)
    expect(planted(check, `${check}    permissions: { contents: read, id-token: write }\n`)).toEqual(idToken)
    expect(planted(check, `${check}    permissions:\n      contents: read\n      'id-token': write\n`)).toEqual(idToken)
    expect(planted(check, `${check}    permissions:\n      "id-token": write\n`)).toEqual(idToken)
    expect(
      planted(
        '  secrets:\n    uses: ./.github/workflows/secrets.yml\n',
        '  secrets:\n    permissions:\n      id-token: write\n    uses: ./.github/workflows/secrets.yml\n',
      ),
    ).toEqual(idToken)
    // An escape spells either word unseen, in a key or a value.
    const escaped = [
      '.github/workflows/ci.yml: C11-D62 no key or value is spelled with an escape, which could name id-token or write-all unseen',
    ]
    expect(planted(check, `${check}    permissions: { "id\\x2Dtoken": write }\n`)).toEqual(escaped)
    expect(planted(check, `${check}    permissions:\n      "id\\u002Dtoken": write\n`)).toEqual(escaped)
    expect(planted(check, `${check}    permissions: "write\\x2Dall"\n`)).toEqual(escaped)
    expect(
      planted('      - run: npm ci\n', '      - uses: aws-actions/configure-aws-credentials@v4\n      - run: npm ci\n'),
    ).toEqual(['.github/workflows/ci.yml: C11-D62 no step takes AWS credentials'])
    expect(
      planted('      - run: npm ci\n', '      - run: npm ci\n        env:\n          AWS_REGION: ap-southeast-1\n'),
    ).toEqual(['.github/workflows/ci.yml: C11-D62 no line sets an AWS_ variable'])
  })
})
