// The server image's repository in a workload account (C11-D44): tags never move once pushed, every
// push is scanned, and the newest 50 images are kept, which is the rollback window. Its policy lets
// only hearth-gh-deploy push and nobody delete an image by hand, so the window shrinks only by the
// lifecycle rule; with no Allow for another account, pulls stay within the account. Scan on push
// holds only while the registry's scanning configuration is the default, which the set-up runbook
// reads back. The repository's name sits in an SSM parameter for the workload stacks (C11-D24).
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
      removalPolicy: cdk.RemovalPolicy.RETAIN,
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
