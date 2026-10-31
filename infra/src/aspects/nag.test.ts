// IAC-15 and IAC-16 (C11-D70; TECH-SPEC T24 item 28): the landing zone's two template checks and the
// exceptions they keep.
// - IAC-15 runs cdk-nag 3.0.2's AwsSolutions pack over each landing-zone stack, here alone (cdk-nag
//   is a devDependency no entry loads), and expects nothing left once NAG_ALLOWANCES has removed the
//   findings it keeps, each matched by its rule (the finding's name before any bracket) and its
//   violating resource's construct path, one resource at a time, since one finding can list several.
// - IAC-16 holds each allowance, and each CloudFormation Validate acknowledgement acknowledgeValidate()
//   applies, to the same rules: a rule or id of the right shape; a reason of at least 20 characters
//   citing the C11 decision that keeps it; a path that is exactly one resource, never a stack or the
//   app, so nothing is kept in bulk; no entry twice; and each one used, so a stale one fails. A
//   Validate acknowledgement is used when the synth's validation report lists the finding it
//   suppressed; one raised on a stack can't name a resource, so it is fixed rather than kept.
// - acknowledgeValidate() applies an acknowledgement only in a run that builds its stack, since a
//   person's run builds one target, and refuses one naming no landing-zone stack in any run.
// - No acknowledgement escapes the list: in infra/, only nag.ts and the bootstrap template's generator
//   acknowledge a Validate finding.
// Each rule is proved on planted lists first. This file holds the rules every exception is held to, so
// it is on the owner's-read list (C11-D74).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cdk from 'aws-cdk-lib'
import { AwsSolutionsChecks } from 'cdk-nag'
import { beforeAll, describe, expect, it } from 'vitest'
import { addLandingZone } from '../foundation/landing-zone.ts'
import { fixtureConfig } from '../testing/fixture.ts'
import { type LandingZoneSynth, synthLandingZone } from '../testing/landing-zone.ts'
import { testApp } from '../testing/synth.ts'
import {
  acknowledgeValidate,
  NAG_ALLOWANCES,
  type NagAllowance,
  VALIDATE_ACKNOWLEDGEMENTS,
  type ValidateAcknowledgement,
} from './nag.ts'

let lz: LandingZoneSynth

beforeAll(() => {
  lz = synthLandingZone()
}, 60_000)

// One cdk-nag finding on one resource: its rule without the bracketed detail, and the resource's path.
interface Finding {
  rule: string
  path: string
}

// Every AwsSolutions finding in an app's stacks, resource by resource, worked out once per app.
const findingsOf = new WeakMap<cdk.App, Finding[]>()
function nagFindings(app: cdk.App): Finding[] {
  const known = findingsOf.get(app)
  if (known !== undefined) return known
  const found = app.node.children.filter(cdk.Stack.isStack).flatMap(stack =>
    new AwsSolutionsChecks().validateScope(stack).violations.flatMap(violation =>
      violation.violatingResources.map(resource => ({
        rule: violation.ruleName.replace(/\[.*$/, ''),
        path: resource.constructPath ?? `${stack.node.path}/${resource.resourceLogicalId ?? '(no id)'}`,
      })),
    ),
  )
  findingsOf.set(app, found)
  return found
}

const allowed = (finding: Finding, list: readonly NagAllowance[]) =>
  list.some(allowance => allowance.rule === finding.rule && allowance.path === finding.path)

// --- IAC-16's rules, shared by both lists ----------------------------------------------------------

const NAG_RULE = /^AwsSolutions-[A-Z]+\d+$/
const VALIDATE_ID = /^CloudFormation-Validate::[EFW]\d+$/
const CITES_C11 = /\bC11-[DQ]\d{2}\b/

// Why a reason can't keep a finding: too short to say why, or citing no C11 decision.
function reasonProblems(reason: string): string[] {
  return [
    ...(reason.length < 20 ? ['its reason is under 20 characters'] : []),
    ...(CITES_C11.test(reason) ? [] : ['its reason cites no C11 decision']),
  ]
}

// Why a path can't name what an exception is kept on: it must be exactly one construct of the app,
// a CloudFormation resource, never a stack or the app, so no exception covers more than one resource.
function pathProblems(path: string, app: cdk.App): string[] {
  const found = app.node.findAll().filter(construct => construct.node.path === path)
  const [target] = found
  if (found.length !== 1 || target === undefined) return [`its path is ${found.length} constructs, not one`]
  if (target === app || cdk.Stack.isStack(target)) return ['its path is a whole stack or the app']
  if (!cdk.CfnResource.isCfnResource(target)) return ["its path isn't a resource"]
  return []
}

// IAC-16 over NAG_ALLOWANCES: every rule above, and each allowance used by a finding on its resource.
function allowanceProblems(list: readonly NagAllowance[], app: cdk.App): string[] {
  const findings = nagFindings(app)
  const seen = new Set<string>()
  return list.flatMap(allowance => {
    const at = `${allowance.rule} ${allowance.path}`
    const problems = [
      ...(NAG_RULE.test(allowance.rule) ? [] : ['its rule is no AwsSolutions rule']),
      ...reasonProblems(allowance.reason),
      ...pathProblems(allowance.path, app),
      ...(seen.has(at) ? ['it is listed twice'] : []),
      ...(findings.some(finding => finding.rule === allowance.rule && finding.path === allowance.path)
        ? []
        : ['it matches no finding']),
    ]
    seen.add(at)
    return problems.map(problem => `${at}: ${problem}`)
  })
}

// What CloudFormation Validate kept in a synth: each suppressed finding's acknowledged id and the
// constructs it was raised on, from the assembly's validation report.
interface ValidationReport {
  pluginReports: Array<{
    pluginName: string
    violations: unknown[]
    suppressedViolations?: Array<{ acknowledgedId: string; violatingConstructs: Array<{ constructPath: string }> }>
  }>
}
function validateReport(outdir: string): ValidationReport['pluginReports'][number] {
  const report = JSON.parse(readFileSync(join(outdir, 'validation-report.json'), 'utf8')) as ValidationReport
  const validate = report.pluginReports.find(plugin => plugin.pluginName === 'CloudFormation Validate')
  if (validate === undefined) throw new Error('the synth ran no CloudFormation Validate')
  return validate
}

// IAC-16 over VALIDATE_ACKNOWLEDGEMENTS: every rule above, in an app that builds every stack, and each
// acknowledgement used: the report suppressed a finding of its id on its path, which the synth would
// otherwise have failed on.
function acknowledgementProblems(
  list: readonly ValidateAcknowledgement[],
  app: cdk.App,
  report: ValidationReport['pluginReports'][number],
): string[] {
  const seen = new Set<string>()
  return list.flatMap(entry => {
    const at = `${entry.id} ${entry.path}`
    const used = (report.suppressedViolations ?? []).some(
      suppressed =>
        suppressed.acknowledgedId === entry.id &&
        suppressed.violatingConstructs.some(construct => construct.constructPath === entry.path),
    )
    const problems = [
      ...(VALIDATE_ID.test(entry.id) ? [] : ['its id is no CloudFormation Validate finding']),
      ...reasonProblems(entry.reason),
      ...pathProblems(entry.path, app),
      ...(seen.has(at) ? ['it is listed twice'] : []),
      ...(used ? [] : ['it suppressed no finding']),
    ]
    seen.add(at)
    return problems.map(problem => `${at}: ${problem}`)
  })
}

// --- IAC-15 ---------------------------------------------------------------------------------------

describe('IAC-15 C11-D70: cdk-nag’s AwsSolutions pack over the landing zone', () => {
  it('IAC-15: without its allowances the pack finds exactly the rules and resources NAG_ALLOWANCES keeps, so the check reads every stack', () => {
    const pairs = [...new Set(nagFindings(lz.app).map(finding => `${finding.rule} ${finding.path}`))].sort()
    expect(pairs.length).toBeGreaterThan(0)
    expect(pairs).toEqual(NAG_ALLOWANCES.map(allowance => `${allowance.rule} ${allowance.path}`).sort())
  })

  it('IAC-15: no finding is left once NAG_ALLOWANCES has removed the ones it keeps', () => {
    const left = nagFindings(lz.app).filter(finding => !allowed(finding, NAG_ALLOWANCES))
    expect(left.map(finding => `${finding.rule} ${finding.path}`)).toEqual([])
  })

  it('IAC-15 C11-D27: each stack’s top-level construct ids, which every allowance’s and acknowledgement’s path starts from', () => {
    const children = (stack: cdk.Stack | undefined) => stack?.node.children.map(child => child.node.id)
    const bootstrap = ['BootstrapVersion', 'CheckBootstrapVersion']
    const baseline = ['Boundary', 'GithubOidc', 'BreakGlass', 'OpsAlerts', 'FastAlarms', 'ServerRepository', 'Zones']
    expect(children(lz.stacks.foundation)).toEqual([
      'Guardrails',
      'IdentityCenter',
      'OrgTrail',
      'OpsAlerts',
      'Sentinel',
      'Budgets',
      ...bootstrap,
    ])
    expect(children(lz.stacks.logArchive)).toEqual([
      'SecKey',
      'ArchiveKey',
      'TrailBucket',
      'BreakGlassLogBucket',
      'ArchiveBucket',
      'OpsAlerts',
      'SecurityServices',
      'BreakGlass',
      'FastAlarms',
      'BreakGlassLogBucketName',
      ...bootstrap,
    ])
    expect(children(lz.stacks.nonprodBaseline)).toEqual([...baseline, 'BreakGlassLogBucketName', ...bootstrap])
    expect(children(lz.stacks.prodBaseline)).toEqual([...baseline, 'BreakGlassLogBucketName', ...bootstrap])
  })
})

// --- IAC-16 ---------------------------------------------------------------------------------------

describe('IAC-16 C11-D70: every exception the landing zone keeps', () => {
  it('IAC-16 finds a bad rule, a short reason, a reason citing nothing, an unknown path, a stack, a construct that is no resource, a duplicate and an unused allowance, on planted lists', () => {
    const reason = 'A planted allowance for the test, which cites C11-D70'
    const planted: NagAllowance[] = [
      { rule: 'AwsSolutions-IAM5[Resource::*]', path: 'Hearth-LogArchive/BreakGlass/Role', reason },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/TrailBucket/Resource', reason: 'Short (C11-D17)' },
      {
        rule: 'AwsSolutions-S1',
        path: 'Hearth-LogArchive/ArchiveBucket/Resource',
        reason: 'A reason long enough that cites no decision',
      },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/NoSuchBucket/Resource', reason },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive', reason },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/TrailBucket', reason },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/BreakGlassLogBucket/Resource', reason },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/BreakGlassLogBucket/Resource', reason },
      { rule: 'AwsSolutions-S1', path: 'Hearth-LogArchive/SecKey/Resource', reason },
    ]
    expect(allowanceProblems(planted, lz.app)).toEqual([
      'AwsSolutions-IAM5[Resource::*] Hearth-LogArchive/BreakGlass/Role: its rule is no AwsSolutions rule',
      'AwsSolutions-IAM5[Resource::*] Hearth-LogArchive/BreakGlass/Role: it matches no finding',
      'AwsSolutions-S1 Hearth-LogArchive/TrailBucket/Resource: its reason is under 20 characters',
      'AwsSolutions-S1 Hearth-LogArchive/ArchiveBucket/Resource: its reason cites no C11 decision',
      'AwsSolutions-S1 Hearth-LogArchive/NoSuchBucket/Resource: its path is 0 constructs, not one',
      'AwsSolutions-S1 Hearth-LogArchive/NoSuchBucket/Resource: it matches no finding',
      'AwsSolutions-S1 Hearth-LogArchive: its path is a whole stack or the app',
      'AwsSolutions-S1 Hearth-LogArchive: it matches no finding',
      "AwsSolutions-S1 Hearth-LogArchive/TrailBucket: its path isn't a resource",
      'AwsSolutions-S1 Hearth-LogArchive/TrailBucket: it matches no finding',
      'AwsSolutions-S1 Hearth-LogArchive/BreakGlassLogBucket/Resource: it is listed twice',
      'AwsSolutions-S1 Hearth-LogArchive/SecKey/Resource: it matches no finding',
    ])
  })

  it('IAC-16: every NAG_ALLOWANCES entry keeps one rule on one resource, for a cited reason, and is used', () => {
    expect(allowanceProblems(NAG_ALLOWANCES, lz.app)).toEqual([])
  })

  it('IAC-16 finds a bad id, a short reason, a reason citing nothing, an unknown path, a stack, a duplicate and an unused acknowledgement, on planted lists', () => {
    const report = validateReport(lz.synthesised.outdir)
    const reason = 'A planted acknowledgement for the test, which cites C11-D70'
    const entry = (id: ValidateAcknowledgement['id'], path: string, why = reason): ValidateAcknowledgement => ({
      id,
      path,
      reason: why,
    })
    const planted = [
      entry('CloudFormation-Validate::E3510[x]', 'Hearth-Foundation/IdentityCenter/BreakGlassEntry'),
      entry('CloudFormation-Validate::E3510', 'Hearth-Foundation/IdentityCenter/NonprodOperator', 'Short (C11-D10)'),
      entry(
        'CloudFormation-Validate::E3510',
        'Hearth-Foundation/IdentityCenter/NonprodOperator',
        'Long enough, but cites nothing',
      ),
      entry('CloudFormation-Validate::E3510', 'Hearth-Foundation/IdentityCenter/NoSuchSet'),
      entry('CloudFormation-Validate::W1001', 'Hearth-Foundation'),
      entry('CloudFormation-Validate::E3510', 'Hearth-Foundation/IdentityCenter/OrgAdmin'),
    ]
    expect(acknowledgementProblems(planted, lz.app, report)).toEqual([
      'CloudFormation-Validate::E3510[x] Hearth-Foundation/IdentityCenter/BreakGlassEntry: its id is no CloudFormation Validate finding',
      'CloudFormation-Validate::E3510[x] Hearth-Foundation/IdentityCenter/BreakGlassEntry: it suppressed no finding',
      'CloudFormation-Validate::E3510 Hearth-Foundation/IdentityCenter/NonprodOperator: its reason is under 20 characters',
      'CloudFormation-Validate::E3510 Hearth-Foundation/IdentityCenter/NonprodOperator: its reason cites no C11 decision',
      'CloudFormation-Validate::E3510 Hearth-Foundation/IdentityCenter/NonprodOperator: it is listed twice',
      'CloudFormation-Validate::E3510 Hearth-Foundation/IdentityCenter/NoSuchSet: its path is 0 constructs, not one',
      'CloudFormation-Validate::E3510 Hearth-Foundation/IdentityCenter/NoSuchSet: it suppressed no finding',
      'CloudFormation-Validate::W1001 Hearth-Foundation: its path is a whole stack or the app',
      'CloudFormation-Validate::W1001 Hearth-Foundation: it suppressed no finding',
      'CloudFormation-Validate::E3510 Hearth-Foundation/IdentityCenter/OrgAdmin: it suppressed no finding',
    ])
  })

  it('IAC-16 C11-D10 C11-D11: every VALIDATE_ACKNOWLEDGEMENTS entry keeps one finding on one resource of the four-stack build, for a cited reason, and suppressed it; Validate left nothing else', () => {
    const report = validateReport(lz.synthesised.outdir)
    expect(acknowledgementProblems(VALIDATE_ACKNOWLEDGEMENTS, lz.app, report)).toEqual([])
    expect(report.violations).toEqual([])
    const suppressed = (report.suppressedViolations ?? []).flatMap(violation =>
      violation.violatingConstructs.map(construct => `${violation.acknowledgedId} ${construct.constructPath}`),
    )
    expect(suppressed.sort()).toEqual(VALIDATE_ACKNOWLEDGEMENTS.map(entry => `${entry.id} ${entry.path}`).sort())
  })

  it('IAC-16 C11-D25: in a run that builds one target, acknowledgeValidate() refuses a misspelt stack and a bad path in the stack it builds, and skips an entry for a stack it doesn’t build', () => {
    const app = testApp()
    addLandingZone(app, { config: fixtureConfig(), targets: ['log-archive'] })
    const reason = 'A planted acknowledgement for the test, which cites C11-D70'
    const id = 'CloudFormation-Validate::E3510' as const
    expect(() =>
      acknowledgeValidate(app, [{ id, path: 'Hearth-Fundation/IdentityCenter/BreakGlassEntry', reason }]),
    ).toThrow('names Hearth-Fundation/IdentityCenter/BreakGlassEntry, in no stack the landing zone builds')
    expect(() => acknowledgeValidate(app, [{ id, path: 'Hearth-LogArchive/NoSuchKey', reason }])).toThrow(
      'names Hearth-LogArchive/NoSuchKey, which is 0 constructs, not one',
    )
    expect(() => acknowledgeValidate(app, [{ id, path: 'Hearth-LogArchive', reason }])).toThrow(
      'names Hearth-LogArchive, a whole stack or the app',
    )
    expect(() => acknowledgeValidate(app, [{ id, path: 'Hearth-Foundation/NoSuchSet', reason }])).not.toThrow()
  })
})

// --- No acknowledgement outside the list ------------------------------------------------------------

const INFRA = fileURLToPath(new URL('../..', import.meta.url))
// The two files that may acknowledge a Validate finding: this list's own, and the bootstrap template's
// generator, which acknowledges the stock template's findings on the stack it never deploys.
const ACKNOWLEDGERS = ['src/aspects/nag.ts', 'scripts/bootstrap-template.ts']
// A Validate acknowledgement, however spelt across a line break.
const ACKNOWLEDGES = [/\bValidations\s*\.\s*of\s*\(/, /\.\s*acknowledge\s*\(/]

// Every TypeScript file under infra/, as a path relative to it, but its dependencies and assemblies.
function infraScripts(folder = ''): string[] {
  return readdirSync(join(INFRA, folder), { withFileTypes: true }).flatMap(entry => {
    const path = folder === '' ? entry.name : `${folder}/${entry.name}`
    if (entry.isDirectory()) return ['node_modules', 'cdk.out'].includes(entry.name) ? [] : infraScripts(path)
    return /\.[cm]?ts$/.test(entry.name) ? [path] : []
  })
}

describe('IAC-16 C11-D70: no acknowledgement escapes the list', () => {
  it('IAC-16: only nag.ts and the bootstrap template’s generator acknowledge a Validate finding in infra/', () => {
    const acknowledging = infraScripts().filter(path => {
      const text = readFileSync(join(INFRA, path), 'utf8')
      return ACKNOWLEDGES.some(pattern => pattern.test(text))
    })
    expect(acknowledging.sort()).toEqual([...ACKNOWLEDGERS].sort())
  })
})
