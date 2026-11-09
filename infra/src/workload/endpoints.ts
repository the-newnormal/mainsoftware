// A workload environment's VPC endpoints (C11-D30), the tasks' only way to AWS: the S3 gateway, and
// the five interface endpoints a Fargate task and the bastion need (ECR's two, Logs, Secrets
// Manager, and ssmmessages for ECS Exec), with private DNS. That Fargate needs no ssm or ecs
// endpoint is proved when non-prod's first task starts, and an endpoint is added by PR otherwise
// (TECH-SPEC T24 item 13); C0.12 adds kms or sts if its code calls them. The interface endpoints sit
// in the profile's endpointAzs of the isolated subnets (one in non-prod and restore, for cost; two in
// prod), and the restore stage has them only while restoreActive is set, since between drills they
// would cost several times prod's budget headroom (C11-D45, C11-Q09). The S3 gateway costs nothing
// and is always there.
//
// Each policy is Allow-based and names only its own service's actions, as AWS's data-perimeter
// endpoint templates are, with the organisation's id read from the parameter each workload Baseline
// writes (no id is held here, IG-01). An interface endpoint admits only an organisation principal's
// calls. Where the profile has the resource statement on (non-prod and restore now, prod after a week
// of clean deploys), it admits them only to an organisation resource, but for the AWS-owned resources
// its service needs: ECR's registry token, and ECS Exec's channels. Logs and Secrets Manager need
// none, since the tasks call them only on the account's own log groups and secret. Each exception,
// and ECR's layer bucket's name, is proved on non-prod's first deploy, where the resource statement
// is on first (TECH-SPEC T24 item 13).
//
// The S3 gateway lets any caller in the VPC read ECR's image layers from ECR's own bucket (ECR's
// presigned layer URLs are signed by no organisation principal), and otherwise only an organisation
// principal read, list or write an organisation bucket, so an anonymous request, or one signed
// outside the organisation, reaches no organisation bucket through it. No delete passes before
// C0.15, which widens it with its code's calls (IAC-10). This file holds the organisation perimeter
// of every endpoint, so it is on the owner's-read list (C11-D74).
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { Construct } from 'constructs'
import { arnPattern } from '../config/arns.ts'
import { type Profile, REGION } from '../config/profiles.ts'
import { document, ECS_EXEC_CHANNELS, type IamDocument } from './roles.ts'

// The interface endpoints, each with its service's actions and the AWS-owned calls its resource
// statement lets through (C11-D30).
export const INTERFACE_ENDPOINTS = [
  { id: 'EcrApi', service: 'ecr.api', actions: 'ecr:*', awsOwned: ['ecr:GetAuthorizationToken'] },
  { id: 'EcrDkr', service: 'ecr.dkr', actions: 'ecr:*', awsOwned: [] },
  // None: the tasks call Logs and Secrets Manager only on their own group and secret (C11-D30).
  { id: 'Logs', service: 'logs', actions: 'logs:*', awsOwned: [] },
  { id: 'SecretsManager', service: 'secretsmanager', actions: 'secretsmanager:*', awsOwned: [] },
  { id: 'SsmMessages', service: 'ssmmessages', actions: 'ssmmessages:*', awsOwned: [...ECS_EXEC_CHANNELS] },
] as const

export type InterfaceEndpoint = (typeof INTERFACE_ENDPOINTS)[number]

// ECR's own bucket for image layers in the Region, which a task's image pull reads through the S3
// gateway (proved on non-prod's first deploy).
export const ECR_LAYER_BUCKET = `prod-${REGION}-starport-layer-bucket`

// Anyone, as AWS's data-perimeter endpoint templates write it: the conditions decide who passes.
const ANYONE = { AWS: '*' }

// An interface endpoint's policy: with the resource statement on, an organisation principal to an
// organisation resource, and to the AWS-owned resources its service needs; with it off, an
// organisation principal to anything.
export function interfacePolicy(endpoint: InterfaceEndpoint, orgId: string, resourceOrg: boolean): IamDocument {
  if (!resourceOrg) {
    return document([
      {
        Sid: 'OrgPrincipals',
        Effect: 'Allow',
        Principal: ANYONE,
        Action: endpoint.actions,
        Resource: '*',
        Condition: { StringEquals: { 'aws:PrincipalOrgID': orgId } },
      },
    ])
  }
  return document([
    {
      Sid: 'OrgPrincipalsToOrgResources',
      Effect: 'Allow',
      Principal: ANYONE,
      Action: endpoint.actions,
      Resource: '*',
      Condition: { StringEquals: { 'aws:PrincipalOrgID': orgId, 'aws:ResourceOrgID': orgId } },
    },
    ...(endpoint.awsOwned.length === 0
      ? []
      : [
          {
            Sid: 'OrgPrincipalsToAwsResources',
            Effect: 'Allow' as const,
            Principal: ANYONE,
            Action: [...endpoint.awsOwned],
            Resource: '*',
            Condition: { StringEquals: { 'aws:PrincipalOrgID': orgId } },
          },
        ]),
  ])
}

// The S3 gateway's policy: ECR's layers from ECR's bucket, and an organisation principal's reads,
// lists and writes of an organisation bucket, never a delete (C0.15's).
export function gatewayPolicy(orgId: string): IamDocument {
  return document([
    {
      Sid: 'EcrImageLayers',
      Effect: 'Allow',
      Principal: ANYONE,
      Action: 's3:GetObject',
      Resource: arnPattern({ service: 's3', resource: `${ECR_LAYER_BUCKET}/*` }),
    },
    {
      Sid: 'OrgResources',
      Effect: 'Allow',
      Principal: ANYONE,
      Action: ['s3:GetObject', 's3:ListBucket', 's3:PutObject'],
      Resource: '*',
      Condition: { StringEquals: { 'aws:PrincipalOrgID': orgId, 'aws:ResourceOrgID': orgId } },
    },
  ])
}

export interface EndpointsProps {
  profile: Profile
  vpc: ec2.Vpc
  // The interface endpoints' security group (network.ts), which admits 443 from every task group.
  group: ec2.CfnSecurityGroup
  // The organisation's id, from /hearth/organisation/id.
  orgId: string
  // Whether the interface endpoints exist: always in non-prod and prod, and in restore only while
  // restoreActive is set (C11-D45).
  interfaces: boolean
}

// The endpoints, as `S3` and one child per interface endpoint. L1s, so a template holds exactly the
// statements above and nothing merges them.
export class Endpoints extends Construct {
  constructor(scope: Construct, id: string, props: EndpointsProps) {
    super(scope, id)
    const { profile, vpc, group, orgId, interfaces } = props
    new ec2.CfnVPCEndpoint(this, 'S3', {
      vpcId: vpc.vpcId,
      serviceName: `com.amazonaws.${REGION}.s3`,
      vpcEndpointType: 'Gateway',
      routeTableIds: vpc.isolatedSubnets.map(subnet => subnet.routeTable.routeTableId),
      policyDocument: gatewayPolicy(orgId),
    })
    if (!interfaces) return
    const subnetIds = vpc.isolatedSubnets.slice(0, profile.endpointAzs).map(subnet => subnet.subnetId)
    if (subnetIds.length !== profile.endpointAzs) {
      throw new Error(`the endpoints need ${profile.endpointAzs} isolated subnets, and the VPC has ${subnetIds.length}`)
    }
    for (const endpoint of INTERFACE_ENDPOINTS) {
      new ec2.CfnVPCEndpoint(this, endpoint.id, {
        vpcId: vpc.vpcId,
        serviceName: `com.amazonaws.${REGION}.${endpoint.service}`,
        vpcEndpointType: 'Interface',
        privateDnsEnabled: true,
        subnetIds,
        securityGroupIds: [group.attrGroupId],
        policyDocument: interfacePolicy(endpoint, orgId, profile.endpointResourceOrg),
      })
    }
  }
}
