import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

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

    const elbv2AlbListener = new elbv2.ApplicationListener(
      this,
      "elbv2AlbListener",
      {
        defaultAction: elbv2.ListenerAction.redirect({
          path: "/dashboard",
        }),
        loadBalancer: elbv2Alb,
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
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
        elbv2.ListenerCondition.httpHeader("X-CloudFront-Origin", ["true"]),
      ],
      priority: 1,
    });

    this.dashTargetGroup = elbv2TargetGroupDash;
  }
}
