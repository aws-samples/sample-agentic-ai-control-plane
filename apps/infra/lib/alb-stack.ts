import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

// CloudFront sends this header (value = the origin-verify secret) on every
// origin request; the ALB only forwards requests that carry it. The secret has
// a fixed name so CloudFrontStack can resolve it with a dynamic reference.
export const ORIGIN_VERIFY_HEADER = "X-CloudFront-Origin";
export const ORIGIN_VERIFY_SECRET_NAME =
  "agentic-ai-platform/cloudfront/origin-verify";

// AWS-managed prefix list of the IP ranges CloudFront uses to reach origins.
const CLOUDFRONT_ORIGIN_FACING_PREFIX_LIST =
  "com.amazonaws.global.cloudfront.origin-facing";

interface AlbStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class AlbStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly listener: elbv2.ApplicationListener;
  public readonly dashTargetGroup: elbv2.ApplicationTargetGroup;

  constructor(scope: Construct, id: string, props: AlbStackProps) {
    super(scope, id, props);

    const elbv2Alb = new elbv2.ApplicationLoadBalancer(this, "elbV2Alb", {
      internetFacing: true,
      vpc: props.vpc,
    });

    this.alb = elbv2Alb;

    // Only CloudFront may reach the ALB at the network level. The prefix list
    // ID differs per region, so it is resolved at deploy time in the target
    // region instead of being hardcoded.
    const cloudFrontPrefixList = new cr.AwsCustomResource(
      this,
      "CloudFrontOriginFacingPrefixList",
      {
        onUpdate: {
          service: "EC2",
          action: "describeManagedPrefixLists",
          parameters: {
            Filters: [
              {
                Name: "prefix-list-name",
                Values: [CLOUDFRONT_ORIGIN_FACING_PREFIX_LIST],
              },
            ],
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            CLOUDFRONT_ORIGIN_FACING_PREFIX_LIST,
          ),
          outputPaths: ["PrefixLists.0.PrefixListId"],
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      },
    );
    elbv2Alb.connections.allowFrom(
      ec2.Peer.prefixList(
        cloudFrontPrefixList.getResponseField("PrefixLists.0.PrefixListId"),
      ),
      ec2.Port.tcp(80),
      "CloudFront origin-facing IP ranges only",
    );

    // The prefix list admits every CloudFront distribution, not just ours, so
    // the ALB also requires a secret header only our distribution sends.
    const originVerifySecret = new secretsmanager.Secret(
      this,
      "OriginVerifySecret",
      {
        secretName: ORIGIN_VERIFY_SECRET_NAME,
        description:
          "Shared secret CloudFront sends to the ALB; requests without it are rejected",
        generateSecretString: {
          // ALB header conditions treat * and ? as wildcards; stay alphanumeric.
          excludePunctuation: true,
          includeSpace: false,
          passwordLength: 48,
        },
      },
    );

    const elbv2AlbListener = new elbv2.ApplicationListener(
      this,
      "elbv2AlbListener",
      {
        // Requests without the origin-verify header never reach the app.
        defaultAction: elbv2.ListenerAction.fixedResponse(403, {
          contentType: "text/plain",
          messageBody: "Forbidden",
        }),
        loadBalancer: elbv2Alb,
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        // Don't add a 0.0.0.0/0 ingress rule; see the prefix-list rule above.
        open: false,
      },
    );

    this.listener = elbv2AlbListener;

    // Create target groups
    const elbv2TargetGroupDash = new elbv2.ApplicationTargetGroup(
      this,
      "elbv2TargetGroupDash",
      {
        port: 3000,
        vpc: props.vpc,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
      },
    );

    elbv2TargetGroupDash.configureHealthCheck({
      path: "/api/status",
      protocol: elbv2.Protocol.HTTP,
      port: "3000",
    });

    // Add listener rules
    elbv2AlbListener.addAction("elbv2ListenerActionDash", {
      action: elbv2.ListenerAction.forward([elbv2TargetGroupDash]),
      conditions: [
        elbv2.ListenerCondition.pathPatterns(["/*"]),
        elbv2.ListenerCondition.httpHeader(ORIGIN_VERIFY_HEADER, [
          originVerifySecret.secretValue.unsafeUnwrap(),
        ]),
      ],
      priority: 1,
    });

    this.dashTargetGroup = elbv2TargetGroupDash;
  }
}
