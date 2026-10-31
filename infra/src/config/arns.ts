// The one ARN builder for policy text (C11-D05, C11-D11, C11-D17): every trust principal, SCP and RCP
// exception, key-policy principal and reviewer resource the landing zone writes is built here, from the
// names in names.ts and the accounts in configuration, so no ARN is written as a literal (IG-01) and a
// change here alone rewrites them all. This file is on the owner's-read list (C11-D74). The tests build
// the ARNs they expect by joining parts themselves, never through these helpers, so a helper that
// changed moves the templates and not the tests.
import * as cdk from 'aws-cdk-lib'

// The landing zone is in ap-southeast-1 alone (D37, B.6), so its partition is fixed. Stack.partition
// would be a token wherever cdk.json's context isn't passed (a plain `node bin/landing-zone.ts`), and a
// policy holding a token renders as an Fn::Join nobody can measure or read.
export const PARTITION = 'aws'

export interface ArnParts {
  service: string
  // Empty for a global service's resources (IAM, S3), `*` for any.
  region?: string
  account?: string
  resource: string
}

// An ARN or ARN pattern from its parts. Every part is literal text: a token (an account the synth
// doesn't know, a resource's attribute) would render an Fn::Join, so it throws instead.
export function arnPattern(parts: ArnParts): string {
  const fields = ['arn', PARTITION, parts.service, parts.region ?? '', parts.account ?? '', parts.resource]
  if (fields.some(field => cdk.Token.isUnresolved(field))) {
    throw new Error(`arnPattern takes literal parts only, never a token (service ${parts.service})`)
  }
  return fields.join(':')
}

// An account's root principal (the account itself, as a trust or key policy names it).
export const accountRoot = (account: string) => arnPattern({ service: 'iam', account, resource: 'root' })

// A role by name or name pattern, in one account or, with `*`, in any.
export const roleArn = (account: string, name: string) =>
  arnPattern({ service: 'iam', account, resource: `role/${name}` })

// An AWS-managed policy by name (`AdministratorAccess`, `ReadOnlyAccess`).
export const awsManagedPolicyArn = (name: string) =>
  arnPattern({ service: 'iam', account: 'aws', resource: `policy/${name}` })

// A bucket by name or name pattern, and its objects.
export const bucketArns = (bucket: string): [string, string] => [
  arnPattern({ service: 's3', resource: bucket }),
  arnPattern({ service: 's3', resource: `${bucket}/*` }),
]
