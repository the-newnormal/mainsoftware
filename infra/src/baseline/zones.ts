// A workload account's public hosted zones (C11-D43, C11-Q08): prod holds the two registrable
// domains (DOMAINS), the app's and user content's, and non-prod holds `nonprod.` under each. Each
// zone allows only Amazon's certificate authority (CAA) and is retained. Prod delegates `nonprod.` to
// non-prod's zones by NS records whose values are committed in profiles.ts after non-prod's Baseline
// first deploys and prints its name servers, never looked up or delegated by a Lambda (IG-02,
// IG-11); until then prod renders none. The zone ids sit in SSM parameters for the workload stacks
// (C11-D24). No DNSSEC: its key would sit in us-east-1 (TECH-SPEC T24 item 17).
import * as cdk from 'aws-cdk-lib'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'
import { SSM_PARAMETER } from '../config/names.ts'
import { appHost, userContentHost } from '../config/profiles.ts'
import type { NameServers } from '../foundation/options.ts'

export interface ZonesProps {
  workloadAccount: 'nonprod' | 'prod'
  // Non-prod's name servers, which prod delegates `nonprod.` to (prod only).
  nonprodNameServers: NameServers
}

export class Zones extends Construct {
  readonly app: route53.PublicHostedZone
  readonly userContent: route53.PublicHostedZone

  constructor(scope: Construct, id: string, props: ZonesProps) {
    super(scope, id)
    const environment = props.workloadAccount
    const zone = (zoneId: string, zoneName: string | undefined) => {
      if (zoneName === undefined) throw new Error(`${environment} has no ${zoneId} host`)
      const made = new route53.PublicHostedZone(this, zoneId, { zoneName, caaAmazon: true })
      made.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
      return made
    }
    this.app = zone('App', appHost(environment))
    this.userContent = zone('UserContent', userContentHost(environment))

    if (environment === 'prod') {
      const delegate = (recordId: string, parent: route53.PublicHostedZone, values: readonly string[]) => {
        if (values.length === 0) return
        new route53.NsRecord(this, recordId, {
          zone: parent,
          recordName: 'nonprod',
          values: [...values],
          ttl: cdk.Duration.days(2),
        })
      }
      delegate('NonprodApp', this.app, props.nonprodNameServers.app)
      delegate('NonprodUserContent', this.userContent, props.nonprodNameServers.userContent)
    } else {
      // Non-prod's name servers, for the person to copy into NONPROD_NAME_SERVERS, by the plain
      // output names the runbook reads.
      const nameServers = (outputId: string, made: route53.PublicHostedZone) => {
        const servers = made.hostedZoneNameServers
        if (servers === undefined) throw new Error('a public hosted zone has name servers')
        new cdk.CfnOutput(this, outputId, {
          description: `The name servers of ${made.zoneName}, for prod's delegation (C11-D43)`,
          value: cdk.Fn.join(',', servers),
        }).overrideLogicalId(outputId)
      }
      nameServers('AppNameServers', this.app)
      nameServers('UserContentNameServers', this.userContent)
    }

    new ssm.StringParameter(this, 'AppZoneId', {
      parameterName: SSM_PARAMETER.zoneApp(environment),
      stringValue: this.app.hostedZoneId,
      description: "The app's hosted zone (C11-D43)",
    })
    new ssm.StringParameter(this, 'UserContentZoneId', {
      parameterName: SSM_PARAMETER.zoneUserContent(environment),
      stringValue: this.userContent.hostedZoneId,
      description: "User content's hosted zone (C11-D43)",
    })
  }
}
