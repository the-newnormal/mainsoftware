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
//
// From C0.11 PR 2 the file also holds IAC-01's check itself (modelCheck), which the landing-zone
// templates' and the bootstrap template's tests both call (a test never imports a test), with what it
// stands on: the attachments the walker doesn't read as documents (managedPolicyAttachments), whose
// principal a statement binds (principalOf), which deny counts as in place (isModelDenyInPlace), which
// Allow names a model action outright (namesModelAction), and a value's text as CloudFormation would
// render it (renderedString). This file holds IAC-01's rules, so it is on the owner's-read list
// (C11-D74). No ARN is written here whole (IG-01): one is joined from its parts where it is rendered.

import {
  globsOverlap,
  grantsModelAction,
  MODEL_ACTIONS,
  MODEL_SERVICE_PREFIXES,
  modelDenyActions,
} from '../config/models.ts'

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

// --- IAC-01's model check (C11-D06, C11-D10, C11-D75) ---------------------------------------------

type Template = Record<string, unknown>

const resourcesIn = (template: Template): Record<string, unknown> =>
  isObject(template.Resources) ? template.Resources : {}
const parametersIn = (template: Template): Record<string, unknown> =>
  isObject(template.Parameters) ? template.Parameters : {}
const typeOf = (template: Template, logicalId: string): string | undefined => {
  const resource = resourcesIn(template)[logicalId]
  return isObject(resource) && typeof resource.Type === 'string' ? resource.Type : undefined
}
const propertiesOf = (template: Template, logicalId: string): Record<string, unknown> => {
  const resource = resourcesIn(template)[logicalId]
  return isObject(resource) && isObject(resource.Properties) ? resource.Properties : {}
}

// An ARN joined from its parts, the partition fixed: the landing zone is in ap-southeast-1 alone.
const arnOf = (service: string, region: string, account: string, resource: string) =>
  ['arn', 'aws', service, region, account, resource].join(':')

// What renderedString knows of the stack whose template it reads: its account and Region, which its
// pseudo-parameters render to.
export interface RenderContext {
  account?: string
  region?: string
  template: Template
}

function pseudoParameter(name: string, context: RenderContext): string | undefined {
  if (name === 'AWS::Partition') return 'aws'
  if (name === 'AWS::URLSuffix') return 'amazonaws.com'
  if (name === 'AWS::Region') return context.region
  if (name === 'AWS::AccountId') return context.account
  return undefined
}

// A resource's IAM path and name as an ARN's resource part (`role/hearth-break-glass`).
function pathedName(kind: string, path: unknown, name: string | undefined): string | undefined {
  if (name === undefined) return undefined
  if (path !== undefined && typeof path !== 'string') return undefined
  const prefix = path === undefined || path === '/' ? '/' : path
  return prefix.startsWith('/') && prefix.endsWith('/') ? `${kind}${prefix}${name}` : undefined
}

// What a Ref to one of the template's resources renders to, where its properties fix it: a bucket's,
// role's or log group's name, a topic's, OIDC provider's or managed policy's ARN. A key's id, a
// parameter (the deployer may pass anything) and every other resource are undefined.
function refText(logicalId: string, context: RenderContext): string | undefined {
  const pseudo = pseudoParameter(logicalId, context)
  if (logicalId.startsWith('AWS::')) return pseudo
  const properties = propertiesOf(context.template, logicalId)
  const text = (value: unknown) => renderedString(value, context)
  switch (typeOf(context.template, logicalId)) {
    case 'AWS::S3::Bucket':
      return text(properties.BucketName)
    case 'AWS::IAM::Role':
      return text(properties.RoleName)
    case 'AWS::Logs::LogGroup':
      return text(properties.LogGroupName)
    case 'AWS::SNS::Topic': {
      const name = text(properties.TopicName)
      if (name === undefined || context.region === undefined || context.account === undefined) return undefined
      return arnOf('sns', context.region, context.account, name)
    }
    case 'AWS::IAM::OIDCProvider': {
      const url = text(properties.Url)
      if (url === undefined || context.account === undefined || !url.startsWith('https://')) return undefined
      return arnOf('iam', '', context.account, `oidc-provider/${url.slice('https://'.length)}`)
    }
    case 'AWS::IAM::ManagedPolicy': {
      const resource = pathedName('policy', properties.Path, text(properties.ManagedPolicyName))
      if (resource === undefined || context.account === undefined) return undefined
      return arnOf('iam', '', context.account, resource)
    }
    default:
      return undefined
  }
}

// What an Fn::GetAtt renders to, where the resource's properties fix it: a bucket's, role's, log
// group's, topic's or OIDC provider's ARN, and a topic's name.
function getAttText(logicalId: string, attribute: string, context: RenderContext): string | undefined {
  const properties = propertiesOf(context.template, logicalId)
  const text = (value: unknown) => renderedString(value, context)
  switch (`${typeOf(context.template, logicalId)}.${attribute}`) {
    case 'AWS::S3::Bucket.Arn': {
      const name = text(properties.BucketName)
      return name === undefined ? undefined : arnOf('s3', '', '', name)
    }
    case 'AWS::IAM::Role.Arn': {
      const resource = pathedName('role', properties.Path, text(properties.RoleName))
      if (resource === undefined || context.account === undefined) return undefined
      return arnOf('iam', '', context.account, resource)
    }
    case 'AWS::Logs::LogGroup.Arn': {
      const name = text(properties.LogGroupName)
      if (name === undefined || context.region === undefined || context.account === undefined) return undefined
      return arnOf('logs', context.region, context.account, `log-group:${name}:*`)
    }
    case 'AWS::SNS::Topic.TopicArn':
    case 'AWS::IAM::OIDCProvider.Arn':
    case 'AWS::IAM::ManagedPolicy.PolicyArn':
      return refText(logicalId, context)
    case 'AWS::SNS::Topic.TopicName':
      return text(properties.TopicName)
    default:
      return undefined
  }
}

// An Fn::Sub's text with each ${…} replaced: its own variables, pseudo-parameters, a resource's Ref
// or GetAtt, and ${!…} as the literal ${…}. Anything it can't render makes the whole undefined.
function subText(text: string, variables: Record<string, unknown>, context: RenderContext): string | undefined {
  let unresolved = false
  const rendered = text.replace(/\$\{([^}]*)\}/g, (_whole, name: string) => {
    if (name.startsWith('!')) return `\${${name.slice(1)}}`
    const value =
      name in variables
        ? renderedString(variables[name], context)
        : name.includes('.') && !name.startsWith('AWS::')
          ? getAttText(name.slice(0, name.indexOf('.')), name.slice(name.indexOf('.') + 1), context)
          : refText(name, context)
    if (value === undefined) unresolved = true
    return value ?? ''
  })
  return unresolved ? undefined : rendered
}

// A value as CloudFormation would render it, where the template alone decides it: a literal string; a
// Ref to AWS::Partition, AWS::Region, AWS::AccountId or AWS::URLSuffix (the last two from the stack's
// env); an Fn::Join or Fn::Sub over those; and a Ref or GetAtt of a bucket, role, log group, topic,
// OIDC provider or managed policy whose properties fix it. Anything else (a key's id, a parameter, an
// Fn::If, an import) is undefined, which a check reads as "could be anything" and so fails closed.
// IAC-02, IAC-11, IAC-18 and IAC-23 compare resources and conditions with it.
export function renderedString(value: unknown, context: RenderContext): string | undefined {
  if (typeof value === 'string') return value
  if (!isObject(value) || Array.isArray(value) || Object.keys(value).length !== 1) return undefined
  if (typeof value.Ref === 'string') return refText(value.Ref, context)
  const getAtt = value['Fn::GetAtt']
  if (getAtt !== undefined) {
    const [logicalId, attribute] =
      typeof getAtt === 'string'
        ? [getAtt.slice(0, getAtt.indexOf('.')), getAtt.slice(getAtt.indexOf('.') + 1)]
        : Array.isArray(getAtt)
          ? getAtt
          : []
    if (typeof logicalId !== 'string' || typeof attribute !== 'string' || logicalId === '') return undefined
    return getAttText(logicalId, attribute, context)
  }
  const join = value['Fn::Join']
  if (join !== undefined) {
    if (!Array.isArray(join) || join.length !== 2 || typeof join[0] !== 'string' || !Array.isArray(join[1])) {
      return undefined
    }
    const parts = join[1].map((part: unknown) => renderedString(part, context))
    return parts.every(part => part !== undefined) ? parts.join(join[0]) : undefined
  }
  const sub = value['Fn::Sub']
  if (typeof sub === 'string') return subText(sub, {}, context)
  if (Array.isArray(sub) && sub.length === 2 && typeof sub[0] === 'string' && isObject(sub[1])) {
    return subText(sub[0], sub[1], context)
  }
  return undefined
}

// A managed policy as an attachment names it: an AWS-managed policy by name, a template parameter the
// deployer fills (whatever it is passed), a managed policy the same template makes, or something no
// static reading resolves, which the check refuses.
export type AttachedPolicy =
  | { kind: 'aws'; name: string }
  | { kind: 'parameter'; name: string }
  | { kind: 'template'; logicalId: string }
  | { kind: 'unreadable' }

// An attachment as modelCheck's allow-list writes it: the AWS-managed policy's name,
// `parameter:<name>` or `template:<logical id>`; undefined for one that can't be read.
export function attachedPolicyName(policy: AttachedPolicy): string | undefined {
  if (policy.kind === 'aws') return policy.name
  if (policy.kind === 'parameter') return `parameter:${policy.name}`
  if (policy.kind === 'template') return `template:${policy.logicalId}`
  return undefined
}

// One managed policy a resource attaches by ARN or reference rather than holding as a document.
export interface ManagedPolicyAttachment {
  logicalId: string
  type: string
  // The property, e.g. 'ManagedPolicyArns[0]', 'CustomerManagedPolicyReferences[0]' or
  // 'PermissionsBoundary'.
  where: string
  // Whether a condition decides it is there: a Fn::If branch, or a resource carrying a Condition.
  conditional: boolean
  // The principal it attaches to: role:<id>, user:<id>, group:<id> or set:<id> (a permission set).
  principal: string
  policy: AttachedPolicy
}

// A policy's ARN or reference, normalised: `arn:${AWS::Partition}:iam::aws:policy/X` (an Fn::Sub), a
// literal ARN of any partition or an Fn::Join building one is `aws` X; a Ref to a parameter is that
// parameter; a Ref to a managed policy the template makes is that resource.
function attachedPolicy(value: unknown, template: Template): AttachedPolicy {
  if (isObject(value) && !Array.isArray(value) && Object.keys(value).length === 1 && typeof value.Ref === 'string') {
    if (value.Ref in parametersIn(template)) return { kind: 'parameter', name: value.Ref }
    if (typeOf(template, value.Ref) === 'AWS::IAM::ManagedPolicy') return { kind: 'template', logicalId: value.Ref }
    return { kind: 'unreadable' }
  }
  const text = typeof value === 'string' ? value : renderedString(value, { template })
  const parts = text?.split(':') ?? []
  const [arn, partition, service, region, account] = parts
  const resource = parts.slice(5).join(':')
  if (
    arn === 'arn' &&
    partition !== undefined &&
    /^aws(?:-[a-z-]+)?$/.test(partition) &&
    service === 'iam' &&
    region === '' &&
    account === 'aws' &&
    /^policy\/.+/.test(resource)
  ) {
    return { kind: 'aws', name: resource.slice('policy/'.length) }
  }
  return { kind: 'unreadable' }
}

// A list property's entries as CloudFormation reads them: a list's items, each Fn::If branch of an
// item or of the whole list (marked conditional, AWS::NoValue dropped), and a single value standing
// for the whole list (a Ref to a list parameter).
function listEntries(value: unknown, conditional: boolean): { value: unknown; conditional: boolean }[] {
  const branches = ifBranches(value)
  if (branches !== undefined) {
    return branches.filter(branch => !isNoValue(branch)).flatMap(branch => listEntries(branch, true))
  }
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      const itemBranches = ifBranches(item)
      if (itemBranches === undefined) return [{ value: item, conditional }]
      return itemBranches.filter(branch => !isNoValue(branch)).flatMap(branch => listEntries([branch], true))
    })
  }
  return [{ value, conditional }]
}

// Where each principal type keeps the policies it attaches by ARN or reference, and the key prefix
// its principal takes.
const ATTACHING_TYPES: Readonly<Record<string, { key: string; lists: readonly string[]; boundary: boolean }>> = {
  'AWS::IAM::Role': { key: 'role', lists: ['ManagedPolicyArns'], boundary: true },
  'AWS::IAM::User': { key: 'user', lists: ['ManagedPolicyArns'], boundary: true },
  'AWS::IAM::Group': { key: 'group', lists: ['ManagedPolicyArns'], boundary: false },
  'AWS::SSO::PermissionSet': {
    key: 'set',
    lists: ['ManagedPolicies', 'CustomerManagedPolicyReferences'],
    boundary: true,
  },
}

// Every managed policy a template attaches that the walker doesn't read as a document: a role's,
// user's or group's ManagedPolicyArns, a permission set's ManagedPolicies and
// CustomerManagedPolicyReferences (whose documents live outside the template, so each is unreadable),
// and a role's, user's or permission set's PermissionsBoundary.
export function managedPolicyAttachments(template: Template): ManagedPolicyAttachment[] {
  const found: ManagedPolicyAttachment[] = []
  for (const [logicalId, resource] of Object.entries(resourcesIn(template))) {
    if (!isObject(resource) || typeof resource.Type !== 'string') continue
    const shape = ATTACHING_TYPES[resource.Type]
    if (shape === undefined) continue
    const type = resource.Type
    const onCondition = typeof resource.Condition === 'string'
    const properties = isObject(resource.Properties) ? resource.Properties : {}
    const principal = `${shape.key}:${logicalId}`
    for (const list of shape.lists) {
      if (properties[list] === undefined) continue
      for (const [index, entry] of listEntries(properties[list], onCondition).entries()) {
        found.push({
          logicalId,
          type,
          where: `${list}[${index}]`,
          conditional: entry.conditional,
          principal,
          policy:
            list === 'CustomerManagedPolicyReferences' ? { kind: 'unreadable' } : attachedPolicy(entry.value, template),
        })
      }
    }
    if (shape.boundary && properties.PermissionsBoundary !== undefined) {
      for (const entry of listEntries(properties.PermissionsBoundary, onCondition)) {
        // A permission set names its boundary as { ManagedPolicyArn } or a customer-managed reference.
        const value =
          type === 'AWS::SSO::PermissionSet'
            ? isObject(entry.value) && entry.value.ManagedPolicyArn !== undefined
              ? entry.value.ManagedPolicyArn
              : undefined
            : entry.value
        found.push({
          logicalId,
          type,
          where: 'PermissionsBoundary',
          conditional: entry.conditional,
          principal,
          policy: value === undefined ? { kind: 'unreadable' } : attachedPolicy(value, template),
        })
      }
    }
  }
  return found
}

// The principal a role, user or group name in a policy's Roles, Users or Groups refers to: a Ref to
// one of the template's, or a literal name one of them is given. One it can't resolve gets a key of
// its own, which no deny ever covers.
function namedPrincipal(value: unknown, kind: 'role' | 'user' | 'group', template: Template, where: string): string {
  const type = { role: 'AWS::IAM::Role', user: 'AWS::IAM::User', group: 'AWS::IAM::Group' }[kind]
  const nameProperty = { role: 'RoleName', user: 'UserName', group: 'GroupName' }[kind]
  if (isObject(value) && typeof value.Ref === 'string' && typeOf(template, value.Ref) === type) {
    return `${kind}:${value.Ref}`
  }
  if (typeof value === 'string') {
    const named = Object.keys(resourcesIn(template)).find(
      id => typeOf(template, id) === type && propertiesOf(template, id)[nameProperty] === value,
    )
    if (named !== undefined) return `${kind}:${named}`
  }
  return `unresolved:${where}`
}

// The principals an identity statement binds, as keys: a role's, user's or group's inline policies
// belong to it (role:<id>, user:<id>, group:<id>); an AWS::IAM::Policy or ManagedPolicy to each
// Roles, Users or Groups entry it names, and a managed policy attached to none is managed:<id> (as a
// boundary, or attached by ARN); a RolePolicy, UserPolicy or GroupPolicy to its one principal; a
// permission set's inline policy to set:<id>. A trust, a resource policy (bucket, key, topic, queue,
// repository, secret, logs, endpoint, vault), an SCP and an RCP bind no principal of the template's,
// so they are undefined.
export function principalOf(statement: PolicyStatementAt, template: Template): string[] | undefined {
  const { logicalId, type, where } = statement
  const properties = propertiesOf(template, logicalId)
  const at = (property: string, index?: number) => `${logicalId}.${property}${index === undefined ? '' : `[${index}]`}`
  switch (type) {
    case 'AWS::IAM::Role':
      return where.startsWith('Policies[') ? [`role:${logicalId}`] : undefined
    case 'AWS::IAM::User':
      return [`user:${logicalId}`]
    case 'AWS::IAM::Group':
      return [`group:${logicalId}`]
    case 'AWS::SSO::PermissionSet':
      return [`set:${logicalId}`]
    case 'AWS::IAM::RolePolicy':
      return [namedPrincipal(properties.RoleName, 'role', template, at('RoleName'))]
    case 'AWS::IAM::UserPolicy':
      return [namedPrincipal(properties.UserName, 'user', template, at('UserName'))]
    case 'AWS::IAM::GroupPolicy':
      return [namedPrincipal(properties.GroupName, 'group', template, at('GroupName'))]
    case 'AWS::IAM::Policy':
    case 'AWS::IAM::ManagedPolicy': {
      const keys = (['Roles', 'Users', 'Groups'] as const).flatMap(property => {
        const kind = ({ Roles: 'role', Users: 'user', Groups: 'group' } as const)[property]
        const value = properties[property]
        if (value === undefined) return []
        if (!Array.isArray(value)) return [`unresolved:${at(property)}`]
        return value.map((entry, index) => namedPrincipal(entry, kind, template, at(property, index)))
      })
      if (keys.length > 0) return keys
      return [type === 'AWS::IAM::ManagedPolicy' ? `managed:${logicalId}` : `policy:${logicalId}`]
    }
    default:
      return undefined
  }
}

// Whether a statement is a model deny in place: a Deny no condition decides (neither CloudFormation's
// nor IAM's: a deny under aws:PrincipalArn or a tag binds only some callers), on every resource
// (exactly `*`, with no NotResource or NotAction), naming every action modelDenyActions() renders.
export function isModelDenyInPlace(statement: PolicyStatementAt): boolean {
  if (statement.effect !== 'Deny' || statement.conditional || statement.condition !== undefined) return false
  if (statement.notActions.length > 0 || statement.notResources.length > 0) return false
  if (statement.resources.length !== 1 || statement.resources[0] !== '*') return false
  const actions = new Set(statement.actions)
  return modelDenyActions().every(action => actions.has(action))
}

// Whether an Allow's action pattern names a model action outright (IAC-01's first rule), which no deny
// beside it excuses: any pattern but exactly `*` whose service part can match a model service, or
// whose action part isn't exactly `*` and which can match a model action (IAM matches without
// regard to case). `<service>:*` of an allowed service and `*` are left to the second rule, which
// asks for the principal's deny; `cloudwatch:Get*`, `logs:StartQuery` and `cloudtrail:LookupEvents`
// name none.
export function namesModelAction(pattern: string): boolean {
  const lower = pattern.toLowerCase()
  if (lower === '*') return false
  const colon = lower.indexOf(':')
  if (colon < 0) {
    return (
      MODEL_SERVICE_PREFIXES.some(prefix => globsOverlap(lower, `${prefix}:*`)) ||
      MODEL_ACTIONS.some(action => globsOverlap(lower, action.toLowerCase()))
    )
  }
  if (MODEL_SERVICE_PREFIXES.some(prefix => globsOverlap(lower.slice(0, colon), prefix))) return true
  if (lower.slice(colon + 1) === '*') return false
  return MODEL_ACTIONS.some(action => globsOverlap(lower, action.toLowerCase()))
}

// What a template may hold beyond IAC-01's rules: Allows that may grant a model action (`*` or a
// model-overlapping `<service>:*`) without their principal's own deny, by logical id, optionally Sid,
// and a check on the template that must hold for the allowance to apply (a condition and a
// parameter's default); and the managed policies a resource may attach, as attachedPolicyName writes
// them.
export interface ModelCheckAllowance {
  grants: ReadonlyArray<{ logicalId: string; sid?: string; when?: (template: Template) => boolean }>
  attachments: ReadonlyArray<{ logicalId: string; policy: string }>
}

// IAC-01 (C11-D06, C11-D10, C11-D75), as problems, empty when the template passes:
// - every policy document reads statically (unreadablePolicies);
// - rule 1: no Allow, in any document, names a model action (namesModelAction), whatever deny sits
//   beside it and whatever the allowance says, and no Allow has NotAction;
// - rule 2: every other Allow that can grant a model action (`*`, or a `<service>:*` that overlaps one)
//   binds principals that each carry a model deny in place, or whose unconditional permissions
//   boundary is a managed policy of the template that does, or is allowed; one in a trust, resource
//   policy, SCP or RCP, which binds no principal of the template's, never passes;
// - every managed policy attached by ARN or reference (not a boundary, which only narrows) is readable,
//   no customer-managed reference, allowed, and attached to a principal that rule 2 would cover.
export function modelCheck(template: Template, allow: ModelCheckAllowance): string[] {
  const problems = unreadablePolicies(template).map(entry => `${entry}: unreadable`)
  const statements = policyStatements(template)
  const attachments = managedPolicyAttachments(template)
  const where = (s: PolicyStatementAt) => `${s.logicalId} ${s.where}${s.sid === undefined ? '' : ` ${s.sid}`}`

  const denied = new Set(statements.filter(isModelDenyInPlace).flatMap(s => principalOf(s, template) ?? []))
  const deniesInPlace = (logicalId: string) => statements.some(s => s.logicalId === logicalId && isModelDenyInPlace(s))
  const covered = (key: string) =>
    denied.has(key) ||
    attachments.some(
      a =>
        a.principal === key &&
        a.where === 'PermissionsBoundary' &&
        !a.conditional &&
        a.policy.kind === 'template' &&
        deniesInPlace(a.policy.logicalId),
    )
  const allowedGrant = (s: PolicyStatementAt) =>
    allow.grants.some(
      g => g.logicalId === s.logicalId && (g.sid === undefined || g.sid === s.sid) && (g.when?.(template) ?? true),
    )

  for (const s of statements.filter(s => s.effect === 'Allow')) {
    for (const action of s.actions.filter(namesModelAction)) {
      problems.push(`${where(s)}: an Allow names a model action (${action})`)
    }
    if (s.notActions.length > 0) problems.push(`${where(s)}: an Allow with NotAction grants what it doesn't name`)
    const grant = s.actions.find(action => grantsModelAction(action) && !namesModelAction(action))
    if (grant === undefined || s.notActions.length > 0) continue
    const keys = principalOf(s, template)
    if (keys === undefined) {
      problems.push(`${where(s)}: ${grant} in a trust, resource policy, SCP or RCP can grant a model action`)
    } else if (!allowedGrant(s)) {
      for (const key of keys.filter(key => !covered(key))) {
        problems.push(`${where(s)}: ${grant} can grant a model action, and ${key} has no model deny in place`)
      }
    }
  }

  for (const a of attachments.filter(a => a.where !== 'PermissionsBoundary')) {
    const at = `${a.logicalId} ${a.where}`
    const name = attachedPolicyName(a.policy)
    if (a.where.startsWith('CustomerManagedPolicyReferences')) {
      problems.push(`${at}: a customer-managed policy reference, whose document isn't in the template`)
    } else if (name === undefined) {
      problems.push(`${at}: a managed policy no static reading resolves`)
    } else if (!allow.attachments.some(entry => entry.logicalId === a.logicalId && entry.policy === name)) {
      problems.push(`${at}: ${name} isn't on the allow-list`)
    }
    if (!covered(a.principal)) problems.push(`${at}: attached to ${a.principal}, which has no model deny in place`)
  }
  return problems
}
