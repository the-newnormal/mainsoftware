// The server image's repository in a workload account (C11-D44): tags never move once pushed, every
// push is scanned, and the newest 50 images are kept, which is the rollback window. Its policy lets
// only hearth-gh-deploy push and nobody delete an image by hand (BatchDeleteImage), so otherwise an
// image leaves only by the lifecycle rule; with no Allow for another account, pulls stay within the
// account. The policy doesn't bind whoever administers the repository itself: a principal that may
// replace its lifecycle policy or its repository policy, or delete the repository (forced, that
// takes every image), can still shrink the window or lift both denies, and nothing alarms on it. No
// guardrail or boundary statement names those writes, so in a workload account they are open to the
// hearthbase execution role under an lz:pr- reason, to OrganizationAccountAccessRole under tier 2
// and, from C0.11 PR 3, to any workload role a merged workload change grants them, which C11-D26
// leaves open (a merged change may change the workload, never its own trust, the break-glass role
// or the alarms). Scan on push holds only while the registry's scanning configuration is the
// default, which the set-up runbook reads back. The repository's name sits in an SSM parameter for
// the workload stacks (C11-D24).
import * as cdk from 'aws-cdk-lib'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'
import { roleArn } from '../config/arns.ts'
import { ROLE, SERVER_REPOSITORY, SSM_PARAMETER } from '../config/names.ts'

export interface ServerRepositoryProps {
  account: string
  workloadAccount: 'nonprod' | 'prod'
}

export class ServerRepository extends Construct {
  readonly repository: ecr.Repository

  constructor(scope: Construct, id: string, props: ServerRepositoryProps) {
    super(scope, id)
    this.repository = new ecr.Repository(this, 'Repository', {
      repositoryName: SERVER_REPOSITORY,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      encryption: ecr.RepositoryEncryption.AES_256,
      lifecycleRules: [
        {
          rulePriority: 1,
          description: 'Keep the newest 50 images: the rollback window (C11-D44)',
          tagStatus: ecr.TagStatus.ANY,
          maxImageCount: 50,
        },
      ],
      // Retained once made, but deleted when the create that made it rolls back, so a failed first
      // deploy leaves nothing behind to refuse its retry by name.
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    })
    this.repository.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'PushOnlyFromDeploy',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['ecr:PutImage', 'ecr:InitiateLayerUpload', 'ecr:UploadLayerPart', 'ecr:CompleteLayerUpload'],
        conditions: { ArnNotEquals: { 'aws:PrincipalArn': roleArn(props.account, ROLE.ghDeploy) } },
      }),
    )
    this.repository.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'NoImageDeletes',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['ecr:BatchDeleteImage'],
      }),
    )
    new ssm.StringParameter(this, 'Name', {
      parameterName: SSM_PARAMETER.ecrServer(props.workloadAccount),
      stringValue: SERVER_REPOSITORY,
      description: "The server image's repository (C11-D44)",
    })
  }
}
