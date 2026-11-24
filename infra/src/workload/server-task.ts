// What every workload task definition shares (C11-D36, C11-D37): the one container, `server`, that runs
// the release's image, and the environment each server role reads. The Tasks and Services stacks
// build their definitions with it.
//
// The container (C11-D36): the server image from the account's own repository by the release's
// digest, never a tag or an asset (IG-06); the image's own user, node; a read-only root but the
// bastion's; a 30 s stop timeout, which the server's drain fits (about 8.5 s at worst); every task's
// open-file limit; and its log lines through awslogs to its own kind's group, by name, in non-blocking
// mode with a 25 MiB buffer, so an outage of the Logs endpoint or its AZ can't stall a request. Every
// definition states its command. Only the three services' containers carry the liveness check, which
// reads /health with no dependency and no shell, so a shared outage replaces no task (T19 item 12),
// and port 3000, which the target groups and the probe reach; the one-offs serve nothing.
//
// The environment (C11-D37), plain values that hold no secret: ROLE, DEPLOY_ENV, APP_ORIGIN, LOG_LEVEL,
// HOST and PORT (written out, so the template states what its port mapping assumes), VALKEY_URL with
// no password until C0.12's ACL users, S3_BUCKET and S3_REGION, and each role's own database login
// alone (T18 item 6): DATABASE_URL for hearth_app on api and realtime, WORKER_DATABASE_URL for
// hearth_worker on the worker, with WORKER_CONCURRENCY. The database URLs are placeholders on a host
// under RFC 2606's reserved .invalid, which no resolver answers, so each pool fails at once until
// C0.12 makes the database, and they carry no password. Each is joined from parts, so no line here
// holds a value with an email's shape (IG-01). S3_BUCKET names a bucket Hearth hasn't made (C0.12's
// buckets replace it), which the config requires and only the api's and the worker's /ready read: no
// task role holds an S3 grant, and the S3 gateway admits no bucket outside the organisation but ECR's
// image layers, so a stranger's bucket of that name is never reached. The AUTH_SECRET goes to the api
// alone, by reference (C11-D35). SMS_PROVIDER, the TWILIO_ variables and TRUST_PROXY are absent: a
// profile that sets smsProvider or hasDatabase is refused here, so a profile change can't deploy the
// placeholders beside a real database or texts.
//
// What C0.12 changes: the database and Valkey URLs become secret references, with IAM tokens for the
// database logins and the RDS CA in the server; TRUST_PROXY joins; the AUTH_SECRET gains
// AUTH_SECRET_PREVIOUS (TECH-SPEC T24 item 15).
import * as cdk from 'aws-cdk-lib'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as logs from 'aws-cdk-lib/aws-logs'
import { DB_LOGIN, logGroupName, SERVER_REPOSITORY, type WorkloadKind } from '../config/names.ts'
import {
  appHost,
  type EnvironmentName,
  NOFILE_LIMIT,
  type Profile,
  REALTIME_HEAP_MIB,
  REGION,
  type ServerRole,
} from '../config/profiles.ts'
import type { Release } from './stage.ts'

// The database's placeholder host (C11-D37): RFC 2606's reserved .invalid, which no resolver answers.
export const PENDING_DB_HOST = 'database.pending.invalid'
// A login's placeholder database URL, joined from parts (IG-01).
export const pendingDatabaseUrl = (login: string) => [`postgres://${login}`, `${PENDING_DB_HOST}:5432/hearth`].join('@')

// The restore stage's app host until C0.17 names the drill's (C11-D45): no browser can hold it.
export const RESTORE_ORIGIN_HOST = 'restore.invalid'
export const appOrigin = (environment: EnvironmentName) => `https://${appHost(environment) ?? RESTORE_ORIGIN_HOST}`

// The services' liveness check (C11-D36): /health over the loopback, with Node's own fetch (the image
// has no curl).
export const HEALTH_SCRIPT = "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

// The port every server role listens on, which the target groups and the probe reach.
export const SERVER_PORT = 3000
const VALKEY_PORT = 6379

// What the drill gives realtime's LOG_LEVEL (C11-D59, IAC-17): no level the config accepts, so the
// release fails to start and the circuit breaker rolls it back.
const DRILL_LOG_LEVEL = 'drill'

// Each server role's environment, exactly (C11-D37).
export function serverEnvironment(
  environment: EnvironmentName,
  role: ServerRole,
  profile: Profile,
  valkeyHost: string,
  drill: boolean,
): Record<string, string> {
  if (profile.hasDatabase) throw new Error('C0.12 moves the database URLs to secrets')
  if (profile.smsProvider !== undefined) throw new Error('C0.12 adds SMS_PROVIDER and the TWILIO_ secrets')
  return {
    ROLE: role,
    DEPLOY_ENV: profile.deployEnv,
    APP_ORIGIN: appOrigin(environment),
    LOG_LEVEL: drill && role === 'realtime' ? DRILL_LOG_LEVEL : 'info',
    HOST: '0.0.0.0',
    PORT: String(SERVER_PORT),
    VALKEY_URL: `rediss://${valkeyHost}:${VALKEY_PORT}`,
    S3_BUCKET: `hearth-pending-${environment}`,
    S3_REGION: REGION,
    ...(role === 'worker'
      ? { WORKER_DATABASE_URL: pendingDatabaseUrl(DB_LOGIN.worker), WORKER_CONCURRENCY: '4' }
      : { DATABASE_URL: pendingDatabaseUrl(DB_LOGIN.app) }),
  }
}

// Each server role's command: realtime with its heap capped inside its memory (C11-D28).
export function serverCommand(role: ServerRole): string[] {
  return role === 'realtime'
    ? ['node', `--max-old-space-size=${REALTIME_HEAP_MIB}`, 'src/main.ts']
    : ['node', 'src/main.ts']
}

export interface ServerContainerProps {
  env: EnvironmentName
  kind: WorkloadKind
  release: Release
  command: string[]
  environment?: Record<string, string>
  secrets?: Record<string, ecs.Secret>
  // A service's container: the liveness check and port 3000.
  service: boolean
  readonlyRoot: boolean
  linuxParameters?: ecs.LinuxParameters
}

// The definition's one container, `server`.
export function serverContainer(
  definition: ecs.FargateTaskDefinition,
  props: ServerContainerProps,
): ecs.ContainerDefinition {
  const { env, kind, release, command, environment, secrets, service, readonlyRoot, linuxParameters } = props
  const repository = ecr.Repository.fromRepositoryName(definition, 'Repository', SERVER_REPOSITORY)
  return definition.addContainer('server', {
    image: ecs.ContainerImage.fromEcrRepository(repository, release.digest),
    command,
    user: 'node',
    readonlyRootFilesystem: readonlyRoot,
    stopTimeout: cdk.Duration.seconds(30),
    ulimits: [{ name: ecs.UlimitName.NOFILE, softLimit: NOFILE_LIMIT, hardLimit: NOFILE_LIMIT }],
    logging: ecs.LogDrivers.awsLogs({
      logGroup: logs.LogGroup.fromLogGroupName(definition, 'LogGroup', logGroupName(env, kind)),
      streamPrefix: kind,
      mode: ecs.AwsLogDriverMode.NON_BLOCKING,
      maxBufferSize: cdk.Size.mebibytes(25),
    }),
    ...(environment === undefined ? {} : { environment }),
    ...(secrets === undefined ? {} : { secrets }),
    ...(linuxParameters === undefined ? {} : { linuxParameters }),
    ...(service
      ? {
          healthCheck: {
            command: ['CMD', 'node', '-e', HEALTH_SCRIPT],
            interval: cdk.Duration.seconds(30),
            retries: 3,
            startPeriod: cdk.Duration.seconds(20),
            timeout: cdk.Duration.seconds(5),
          },
          portMappings: [{ containerPort: SERVER_PORT, protocol: ecs.Protocol.TCP }],
        }
      : {}),
  })
}
