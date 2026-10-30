// The infra source guard (IG, C0.11; TECH-SPEC T24 item 28): what the CDK app's source must and
// mustn't hold, before any template is synthesised. Each case is first proved on planted text, then
// held over the repository. The templates themselves are the assertion tests' (IAC, infra/**/*.test.ts).
// Cases so far: IG-01 to IG-08 and IG-11; IG-09, IG-10 and IG-12 join with C0.11 PR 2. This file and
// infra.ts are on the owner's-read list (C11-D74).
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Workspace } from './boundaries'
import { ACCOUNT_ID, PHONE_NUMBER } from './identifying'
import { importsOf, withoutComments } from './imports'
import {
  ALLOWED_CUSTOM_RESOURCE,
  cdkJsonProblems,
  DESTROY_RULES,
  GROUP_ID,
  IDENTITY_CENTER_ID,
  IMAGE_RULES,
  identifyingIn,
  importGraph,
  infraImportProblem,
  LAMBDA_RULES,
  LOOKUP_RULES,
  ORGANIZATIONS_ID,
  packageFindings,
  readsForIdentifying,
  regionFindings,
  ruleFindings,
  scriptFindings,
  workloadGraphFindings,
} from './infra'
import { isScript, readRepoFile, repoFiles, root } from './repo-files'

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
  it('finds both entries, the configuration and its tests, so no rule passes by reading nothing', () => {
    expect(infraScripts).toEqual(
      expect.arrayContaining([
        'infra/bin/workload.ts',
        'infra/bin/landing-zone.ts',
        'infra/src/config/env.ts',
        'infra/src/config/models.ts',
        'infra/src/config/profiles.ts',
        'infra/src/testing/fixture.ts',
      ]),
    )
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
    ]
    expect(planted.map(line => ruleFindings('x.ts', line, DESTROY_RULES).length)).toEqual([
      1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0,
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
    ]
    expect(planted.map(line => ruleFindings('x.ts', line, IMAGE_RULES).length)).toEqual([1, 1, 1, 1, 1, 0, 1, 1])
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
    ])
  })

  // aws-cdk 2.1146.1's parser isn't strict, so an option it doesn't know takes the next word as its
  // value: `cdk --toolkit-stack-name synth deploy` deploys (R2GUARD-01).
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
      ok1: 'cdk --toolkit-stack-name=x synth',
      ok2: 'cdk -y --no-staging --profile p --region ap-southeast-1 -a cdk.out ls',
    }
    const why = "before its subcommand: the guard reads past only the CLI's own options"
    expect(scriptFindings('package.json', { scripts })).toEqual([
      `package.json: IG-07 script "a" runs cdk with --toolkit-stack-name ${why}`,
      `package.json: IG-07 script "b" runs cdk with --change-set-name ${why}`,
      `package.json: IG-07 script "c" runs cdk with -O ${why}`,
      `package.json: IG-07 script "d" runs cdk with --unknown-thing ${why}`,
      `package.json: IG-07 script "e" runs cdk with --roleArn ${why}`,
      `package.json: IG-07 script "f" runs cdk with -jo ${why}`,
      `package.json: IG-07 script "g" runs cdk with --toolkit-stack-name ${why}`,
      `package.json: IG-07 script "h" runs cdk with --require-approval ${why}`,
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

  it('no infra script makes one', () => {
    expect(infraScripts.flatMap(path => ruleFindings(path, code(path), LAMBDA_RULES))).toEqual([])
  })
})
