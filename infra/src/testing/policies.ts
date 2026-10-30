// A walker over every IAM-style policy a synthesised template holds, for the assertion tests that
// read policies whatever resource carries them (IAC-01's model check, IAC-02's SCPs and RCP, IAC-10's
// IAM rules, IAC-11's break-glass trust, IAC-12's endpoint policies, IAC-23's archive readers): role
// trusts and inline policies, managed and inline policy resources, bucket, key, topic, queue,
// repository, secret and log resource policies, endpoint policies, SCPs and RCPs, and permission
// sets' inline policies. A document given as an intrinsic (a Fn::Join building JSON) can't be read
// statically, so it is returned as unreadable rather than skipped, and a test fails on it.

// Where each resource type keeps its policy documents. `Policies` is a list of { PolicyDocument }.
const DOCUMENT_PROPERTIES: Readonly<Record<string, readonly string[]>> = {
  'AWS::IAM::Role': ['AssumeRolePolicyDocument', 'Policies'],
  'AWS::IAM::User': ['Policies'],
  'AWS::IAM::Group': ['Policies'],
  'AWS::IAM::Policy': ['PolicyDocument'],
  'AWS::IAM::ManagedPolicy': ['PolicyDocument'],
  'AWS::IAM::RolePolicy': ['PolicyDocument'],
  'AWS::S3::BucketPolicy': ['PolicyDocument'],
  'AWS::KMS::Key': ['KeyPolicy'],
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
}

// One statement, with its list fields normalised to arrays.
export interface PolicyStatementAt {
  logicalId: string
  type: string
  where: string
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
          })
        }
      } else {
        found.push({ logicalId, type, where: property, document: readDocument(value) })
      }
    }
  }
  return found
}

// Every statement of every readable document in a template. Documents that can't be read are left
// to unreadablePolicies, which a test asserts empty.
export function policyStatements(template: Record<string, unknown>): PolicyStatementAt[] {
  return policyDocuments(template).flatMap(({ logicalId, type, where, document }) =>
    asList(document?.Statement).flatMap(statement => {
      if (!isObject(statement)) return []
      const effect = statement.Effect === 'Deny' ? 'Deny' : 'Allow'
      return [
        {
          logicalId,
          type,
          where,
          sid: typeof statement.Sid === 'string' ? statement.Sid : undefined,
          effect,
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

// The documents no static reading resolves, as "logicalId where".
export function unreadablePolicies(template: Record<string, unknown>): string[] {
  return policyDocuments(template)
    .filter(found => found.document === undefined)
    .map(found => `${found.logicalId} ${found.where}`)
}
