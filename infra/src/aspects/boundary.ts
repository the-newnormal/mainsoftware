// Every workload role carries hearth-boundary (C11-D26; TECH-SPEC T24 item 11): the hearthapp execution role
// may create a role only with it (hearth-workload-fences-2's AppRolesBounded, hearth-boundary's BoundedRolesOnly),
// and only the hearthbase execution role may put one on later, so it is set at creation. The policy object is
// made in the stack (made in a Stage it throws), and the aspect reaches every AWS::IAM::Role, raw ones included.
// It decides what bounds every workload role, so it is on the owner's-read list (C11-D74).
import type * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import { BOUNDARY } from '../config/names.ts'

export function applyBoundary(stack: cdk.Stack): void {
  iam.PermissionsBoundary.of(stack).apply(iam.ManagedPolicy.fromManagedPolicyName(stack, 'Boundary', BOUNDARY))
}
