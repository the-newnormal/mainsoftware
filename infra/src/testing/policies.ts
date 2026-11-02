// A walker over every IAM-style policy a synthesised template holds, for the assertion tests that
// read policies whatever resource carries them (IAC-01's model check, IAC-02's SCPs and RCP, IAC-10's
// IAM rules, IAC-11's break-glass trust, IAC-12's endpoint policies, IAC-23's archive readers): role
// trusts and inline policies, managed and inline policy resources, bucket, key, topic, queue,
// repository, secret and log resource policies, endpoint policies, SCPs and RCPs, and permission
// sets' inline policies. A document given as an intrinsic (a Fn::Join building JSON) can't be read
// statically, so it is returned as unreadable rather than skipped, and a test fails on it; so is one
// with a statement that isn't an object with a literal Effect, or an Action or NotAction entry that
// isn't a string (an intrinsic building `bedrock:*` would otherwise read as no model action). A
// statement given as Fn::If, as the CDK CLI's bootstrap template adds its trusted accounts' trust, is
// read as each of its branches (AWS::NoValue dropped), marked conditional, and so is every statement
// of a resource that carries a Condition; a Fn::If above a statement (around a whole document or a
// Policies entry) is reported unreadable. aws-cdk-lib renders a log resource policy whose statement
// holds a token (an ARN, an account) as a Fn::Join, so infra writes those with literal values.
// The walker reads documents only: a managed policy attached by ARN (ManagedPolicyArns, a permission
// set's ManagedPolicies) and an Allow's NotAction are for the check reading these statements to refuse
// or allow-list, and a YAML template is parsed with CloudFormation's short tags as intrinsics, never
// as plain strings.

import { grantsModelAction } from '../config/models.ts'

// Where each resource type keeps its policy documents. `Policies` is a list of { PolicyDocument }.
const DOCUMENT_PROPERTIES: Readonly<Record<string, readonly string[]>> = {
  'AWS::IAM::Role': ['AssumeRolePolicyDocument', 'Policies'],
  'AWS::IAM::User': ['Policies'],
  'AWS::IAM::Group': ['Policies'],
  'AWS::IAM::Policy': ['PolicyDocument'],
  'AWS::IAM::ManagedPolicy': ['PolicyDocument'],
  'AWS::IAM::RolePolicy': ['PolicyDocument'],
  'AWS::IAM::UserPolicy': ['PolicyDocument'],
  'AWS::IAM::GroupPolicy': ['PolicyDocument'],
  'AWS::S3::BucketPolicy': ['PolicyDocument'],
  'AWS::KMS::Key': ['KeyPolicy'],
  'AWS::KMS::ReplicaKey': ['KeyPolicy'],
  'AWS::Backup::BackupVault': ['AccessPolicy'],
  'AWS::EC2::VPCEndpoint': ['PolicyDocument'],
  'AWS::SNS::TopicPolicy': ['PolicyDocument'],
  'AWS::SQS::QueuePolicy': ['PolicyDocument'],
  'AWS::ECR::Repository': ['RepositoryPolicyText'],
  'AWS::SecretsManager::ResourcePolicy': ['ResourcePolicy'],
  'AWS::Logs::ResourcePolicy': ['PolicyDocument'],
  'AWS::Organizations::Policy': ['Content'],
  'AWS::SSO::PermissionSet': ['InlinePolicy'],
}

// The Organizations policy types whose content is an IAM policy (the AI opt-out's isn't).
const IAM_ORGANIZATIONS_TYPES = new Set(['SERVICE_CONTROL_POLICY', 'RESOURCE_CONTROL_POLICY'])

// One policy document and where it was found.
export interface PolicyDocumentAt {
  logicalId: string
  type: string
  // The property path, e.g. 'AssumeRolePolicyDocument' or 'Policies[0].PolicyDocument'.
  where: string
  // The document, or undefined when it is an intrinsic no static reading can resolve.
  document: { Statement?: unknown } | undefined
  // Whether the resource carries a Condition, which decides whether it, and so the document, exists.
  conditional: boolean
}

// One statement, with its list fields normalised to arrays.
export interface PolicyStatementAt {
  logicalId: string
  type: string
  where: string
  // A branch of a statement given as Fn::If, or a statement of a resource that carries a Condition: a
  // check that no Allow grants something reads it, but a check that a Deny is in place can't count it,
  // since a condition decides whether it's there (even when both branches deny alike).
  conditional: boolean
  sid: string | undefined
  effect: 'Allow' | 'Deny'
  actions: string[]
  notActions: string[]
  resources: unknown[]
  notResources: unknown[]
  principal: unknown
  notPrincipal: unknown
  condition: unknown
}

const asList = (value: unknown): unknown[] => (value === undefined ? [] : Array.isArray(value) ? value : [value])
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isNoValue = (value: unknown): boolean =>
  isObject(value) && Object.keys(value).length === 1 && value.Ref === 'AWS::NoValue'

// An Fn::If's two branches, or undefined when the value isn't one.
function ifBranches(value: unknown): [unknown, unknown] | undefined {
  if (!isObject(value) || Array.isArray(value) || Object.keys(value).length !== 1) return undefined
  const args = value['Fn::If']
  return Array.isArray(args) && args.length === 3 ? [args[1], args[2]] : undefined
}

// A document's statements, each with whether a condition decides it is there: a statement given as
// Fn::If is each of its branches, read the same way, and an AWS::NoValue branch is none.
function statementsOf(document: { Statement?: unknown }): { statement: unknown; conditional: boolean }[] {
  const expand = (statement: unknown, conditional: boolean): { statement: unknown; conditional: boolean }[] => {
    const branches = ifBranches(statement)
    if (branches === undefined) return [{ statement, conditional }]
    return branches.filter(branch => !isNoValue(branch)).flatMap(branch => expand(branch, true))
  }
  return asList(document.Statement).flatMap(statement => expand(statement, false))
}

// A statement policyStatements reads as CloudFormation will: an object with a literal Effect and
// literal Action and NotAction entries. A Resource, Principal or Condition may hold intrinsics (a Ref,
// a GetAtt), which the tests read as values.
function isReadable(statement: unknown): statement is Record<string, unknown> & { Effect: 'Allow' | 'Deny' } {
  return (
    isObject(statement) &&
    !Array.isArray(statement) &&
    (statement.Effect === 'Allow' || statement.Effect === 'Deny') &&
    asList(statement.Action).every(action => typeof action === 'string') &&
    asList(statement.NotAction).every(action => typeof action === 'string')
  )
}

// A document as a template gives it: an object, or JSON text (Organizations' Content, a permission
// set's InlinePolicy and a log resource policy may be either). Anything else is an intrinsic.
function readDocument(value: unknown): { Statement?: unknown } | undefined {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return isObject(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }
  if (isObject(value) && ('Statement' in value || 'Version' in value)) return value
  return undefined
}

// Every policy document in a template, readable or not.
export function policyDocuments(template: Record<string, unknown>): PolicyDocumentAt[] {
  const resources = isObject(template.Resources) ? template.Resources : {}
  const found: PolicyDocumentAt[] = []
  for (const [logicalId, resource] of Object.entries(resources)) {
    if (!isObject(resource) || typeof resource.Type !== 'string') continue
    const type = resource.Type
    const properties = isObject(resource.Properties) ? resource.Properties : {}
    const conditional = typeof resource.Condition === 'string'
    if (type === 'AWS::Organizations::Policy' && typeof properties.Type !== 'string') {
      // A policy type no static reading resolves may be an SCP or RCP, so its content is unreadable.
      found.push({ logicalId, type, where: 'Content', document: undefined, conditional })
      continue
    }
    if (type === 'AWS::Organizations::Policy' && !IAM_ORGANIZATIONS_TYPES.has(String(properties.Type))) continue
    for (const property of DOCUMENT_PROPERTIES[type] ?? []) {
      const value = properties[property]
      if (value === undefined) continue
      if (property === 'Policies') {
        for (const [index, policy] of asList(value).entries()) {
          const document = isObject(policy) ? policy.PolicyDocument : undefined
          found.push({
            logicalId,
            type,
            where: `Policies[${index}].PolicyDocument`,
            document: readDocument(document),
            conditional,
          })
        }
      } else {
        found.push({ logicalId, type, where: property, document: readDocument(value), conditional })
      }
    }
  }
  return found
}

// Every readable statement of every readable document in a template. A document that can't be read,
// or a statement that can't, is left out here and reported by unreadablePolicies, which a test asserts
// empty, so a check over these statements never passes on what it couldn't read.
export function policyStatements(template: Record<string, unknown>): PolicyStatementAt[] {
  return policyDocuments(template).flatMap(({ logicalId, type, where, document, conditional: onCondition }) =>
    (document === undefined ? [] : statementsOf(document)).flatMap(({ statement, conditional }) => {
      if (!isReadable(statement)) return []
      return [
        {
          logicalId,
          type,
          where,
          conditional: onCondition || conditional,
          sid: typeof statement.Sid === 'string' ? statement.Sid : undefined,
          effect: statement.Effect,
          actions: asList(statement.Action).map(String),
          notActions: asList(statement.NotAction).map(String),
          resources: asList(statement.Resource),
          notResources: asList(statement.NotResource),
          principal: statement.Principal,
          notPrincipal: statement.NotPrincipal,
          condition: statement.Condition,
        } satisfies PolicyStatementAt,
      ]
    }),
  )
}

// The Allow statements that can grant a model action (D41, IAC-01's check): one whose Action names
// one (grantsModelAction, `*` included), and any with NotAction, which grants every action it doesn't
// name, model actions among them, so the check refuses it rather than reason about what its list
// leaves out. A conditional Allow counts, since a condition may put it there.
export function modelGrants(statements: readonly PolicyStatementAt[]): PolicyStatementAt[] {
  return statements.filter(
    statement =>
      statement.effect === 'Allow' && (statement.notActions.length > 0 || statement.actions.some(grantsModelAction)),
  )
}

// The documents no static reading resolves, or that hold a statement none does, as "logicalId where".
export function unreadablePolicies(template: Record<string, unknown>): string[] {
  return policyDocuments(template)
    .filter(
      found =>
        found.document === undefined || !statementsOf(found.document).every(({ statement }) => isReadable(statement)),
    )
    .map(found => `${found.logicalId} ${found.where}`)
}
