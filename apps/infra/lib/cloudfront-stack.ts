import * as cdk from "aws-cdk-lib";
import { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  AllowedMethods,
  BehaviorOptions,
  CachePolicy,
  Distribution,
  DistributionProps,
  HttpVersion,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { LoadBalancerV2Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

interface CloudFrontProps extends cdk.StackProps {
  domainName?: string;
  certificate?: ICertificate;
  privateKeySecretArn?: string;
  publicKeyId?: string;
  alb: elbv2.ApplicationLoadBalancer;
}

// Fronts the ALB with a CloudFront distribution (HTTP/2+3, TLS 1.2+, caching disabled, all viewer headers/methods forwarded).
export class CloudFrontStack extends cdk.Stack {
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: CloudFrontProps) {
    super(scope, id, props);

    const albOrigin = new LoadBalancerV2Origin(props.alb, {
      protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
      httpPort: 80,
      originPath: "/",
      customHeaders: {
        "X-CloudFront-Origin": "true",
      },
      connectionAttempts: 3,
      connectionTimeout: cdk.Duration.seconds(10),
      readTimeout: cdk.Duration.seconds(60),
    });

    const defaultBehavior: BehaviorOptions = {
      origin: albOrigin,
      cachePolicy: CachePolicy.CACHING_DISABLED,
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: AllowedMethods.ALLOW_ALL,
      compress: false,
    };

    const distributionProps: DistributionProps = {
      comment: `Agentic AI Platform`,
      enabled: true,
      defaultBehavior,
      additionalBehaviors: {},
      domainNames: props.domainName ? [props.domainName] : [],
      certificate: props.certificate ? props.certificate : undefined,
      httpVersion: HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
    };

    const distribution = new Distribution(
      this,
      "Distribution",
      distributionProps,
    );

    this.distribution = distribution;
  }
}
