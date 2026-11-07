// A live environment's load balancer (C11-D41, C11-D42) and its `origin.` name (C11-D43): built
// only where the profile has one (non-prod and prod; the restore stage has none, C11-D45).
//
// One internet-facing ALB, hearth-<env>, in the public subnets, answering 443 alone with an
// ap-southeast-1 certificate for origin.<app host>, validated by DNS in the app zone (whose id the
// Baseline writes to SSM), and an alias record to it. CloudFront uses that name as its origin from
// C0.12, and the smoke checks use it until then, so no record moves later; the app host's own
// records are C0.12's. Until C0.12's CloudFront it is open to the internet (C11-D31); nothing
// behind it holds data or can send an SMS. A profile asking for the CloudFront ingress throws:
// C0.12 builds it.
//
// Two rules, by path only, on the app's own host as the browser sees it: /ws to realtime (priority
// 10) and /api/* to the api (20); anything else answers a fixed 404, so /health and /ready are
// never reachable through it. Realtime's targets are checked on /ready/local and the api's on
// /health (C11-D42): with /ready, a shared outage would fail every api task's check at once and ECS
// would replace them all, so /ready gates a release through the readiness probe instead (C11-D53).
// Both target groups are plain HTTP to port 3000 inside the VPC until C0.19 decides (C11-Q11), with
// no stickiness, round robin, and a 10 s deregistration delay, the server's drain after SIGTERM
// (T19 item 16).
//
// The idle timeout is 60 s, where C11-D41 said 120 s (TECH-SPEC T24 item 16): the server keeps an
// idle connection open for Fastify's default 72 s, and a load balancer whose idle timeout outlasts
// its target's keep-alive may send on a connection the target has closed and answer 502. 60 s still
// meets T19 item 16's floor and stays above the 25 s heartbeat; apps/server/src/app.test.ts pins
// the server's side above it. The listener's TLS policy is passed explicitly: cdk.json's
// post-quantum flag alone would default to the policy that isn't restricted to TLS 1.3 and 1.2's
// strongest suites.
import * as cdk from 'aws-cdk-lib'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as targets from 'aws-cdk-lib/aws-route53-targets'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'
import { loadBalancerName, SSM_PARAMETER, targetGroupName } from '../config/names.ts'
import { appHost, type EnvironmentName, originHost, type Profile } from '../config/profiles.ts'

// The two roles the load balancer routes to.
export const ROUTED_ROLES = ['api', 'realtime'] as const
export type RoutedRole = (typeof ROUTED_ROLES)[number]

// Each target group's health check (C11-D41, C11-D42).
const HEALTH_CHECKS: Readonly<Record<RoutedRole, elbv2.HealthCheck>> = {
  realtime: {
    path: '/ready/local',
    interval: cdk.Duration.seconds(10),
    timeout: cdk.Duration.seconds(5),
    healthyThresholdCount: 2,
    unhealthyThresholdCount: 3,
    healthyHttpCodes: '200',
  },
  api: {
    path: '/health',
    interval: cdk.Duration.seconds(15),
    timeout: cdk.Duration.seconds(5),
    healthyThresholdCount: 2,
    unhealthyThresholdCount: 3,
    healthyHttpCodes: '200',
  },
}

export interface LoadBalancerProps {
  environment: EnvironmentName
  profile: Profile
  vpc: ec2.Vpc
  // The load balancer's security group (network.ts).
  albGroup: ec2.CfnSecurityGroup
}

export class LoadBalancer extends Construct {
  // Each routed role's target group, which the Platform stack writes to SSM for the Services stack.
  readonly targetGroupArns: Readonly<Record<RoutedRole, string>>

  constructor(scope: Construct, id: string, props: LoadBalancerProps) {
    super(scope, id)
    const { environment, profile, vpc, albGroup } = props
    if (profile.alb === undefined) throw new Error(`${environment} has no load balancer`)
    if (profile.alb.ingress !== 'internet') throw new Error('C0.12 builds the CloudFront ingress')
    const zoneName = appHost(environment)
    const origin = originHost(environment)
    if (zoneName === undefined || origin === undefined) throw new Error(`${environment} has no app host`)
    const stack = cdk.Stack.of(this)

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'AppZone', {
      hostedZoneId: ssm.StringParameter.valueForStringParameter(stack, SSM_PARAMETER.zoneApp(environment)),
      zoneName,
    })
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: origin,
      validation: acm.CertificateValidation.fromDns(zone),
    })
    certificate.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE)

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetGroupName: 'public' },
      securityGroup: ec2.SecurityGroup.fromSecurityGroupId(this, 'AlbGroup', albGroup.attrGroupId, {
        mutable: false,
        allowAllOutbound: false,
      }),
      loadBalancerName: loadBalancerName(environment),
      idleTimeout: cdk.Duration.seconds(60),
      dropInvalidHeaderFields: true,
      desyncMitigationMode: elbv2.DesyncMitigationMode.DEFENSIVE,
      http2Enabled: true,
      deletionProtection: profile.alb.deletionProtection,
    })

    const targetGroup = (role: RoutedRole, id: string) => {
      const group = new elbv2.ApplicationTargetGroup(this, id, {
        vpc,
        targetGroupName: targetGroupName(environment, role),
        port: 3000,
        protocol: elbv2.ApplicationProtocol.HTTP,
        protocolVersion: elbv2.ApplicationProtocolVersion.HTTP1,
        targetType: elbv2.TargetType.IP,
        deregistrationDelay: cdk.Duration.seconds(10),
        loadBalancingAlgorithmType: elbv2.TargetGroupLoadBalancingAlgorithmType.ROUND_ROBIN,
        healthCheck: HEALTH_CHECKS[role],
      })
      // Off by default; written out so the template states it (IAC-08).
      group.setAttribute('stickiness.enabled', 'false')
      return group
    }
    const apiTargets = targetGroup('api', 'ApiTargets')
    const realtimeTargets = targetGroup('realtime', 'RealtimeTargets')

    // open: false, or aws-cdk-lib would add 443 from anywhere to the group itself (network.ts holds
    // the group's one inline rule).
    const listener = alb.addListener('Https', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      open: false,
      certificates: [elbv2.ListenerCertificate.fromCertificateManager(certificate)],
      sslPolicy: elbv2.SslPolicy.TLS13_12_RES_PQ,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, { contentType: 'text/plain', messageBody: 'Not found' }),
    })
    new elbv2.ApplicationListenerRule(this, 'WsRule', {
      listener,
      priority: 10,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/ws'])],
      action: elbv2.ListenerAction.forward([realtimeTargets]),
    })
    new elbv2.ApplicationListenerRule(this, 'ApiRule', {
      listener,
      priority: 20,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/api/*'])],
      action: elbv2.ListenerAction.forward([apiTargets]),
    })

    new route53.ARecord(this, 'OriginRecord', {
      zone,
      recordName: `${origin}.`,
      target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb)),
    })

    this.targetGroupArns = { api: apiTargets.targetGroupArn, realtime: realtimeTargets.targetGroupArn }
  }
}
