import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { AlbStack, ORIGIN_VERIFY_HEADER } from "../lib/alb-stack";
import { CloudFrontStack } from "../lib/cloudfront-stack";

function synth() {
  const app = new cdk.App();
  const vpcStack = new cdk.Stack(app, "TestVpcStack");
  const vpc = new ec2.Vpc(vpcStack, "Vpc");
  const albStack = new AlbStack(app, "TestAlbStack", { vpc });
  const cloudFrontStack = new CloudFrontStack(app, "TestCloudFrontStack", {
    alb: albStack.alb,
  });
  return {
    alb: Template.fromStack(albStack),
    cloudFront: Template.fromStack(cloudFrontStack),
  };
}

describe("ALB is only reachable through CloudFront", () => {
  const { alb, cloudFront } = synth();

  test("ALB security group has no internet-wide ingress", () => {
    for (const sg of Object.values(
      alb.findResources("AWS::EC2::SecurityGroup"),
    )) {
      for (const rule of sg.Properties.SecurityGroupIngress ?? []) {
        expect(rule.CidrIp).not.toBe("0.0.0.0/0");
        expect(rule.CidrIpv6).not.toBe("::/0");
      }
    }
    for (const rule of Object.values(
      alb.findResources("AWS::EC2::SecurityGroupIngress"),
    )) {
      expect(rule.Properties.CidrIp).toBeUndefined();
      expect(rule.Properties.CidrIpv6).toBeUndefined();
    }
  });

  test("ingress is limited to the CloudFront origin-facing prefix list", () => {
    alb.hasResourceProperties("Custom::AWS", {
      Create: Match.stringLikeRegexp(
        "com\\.amazonaws\\.global\\.cloudfront\\.origin-facing",
      ),
    });
    alb.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      FromPort: 80,
      ToPort: 80,
      SourcePrefixListId: Match.anyValue(),
    });
  });

  test("requests without the origin-verify header get 403", () => {
    alb.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      DefaultActions: [
        Match.objectLike({
          Type: "fixed-response",
          FixedResponseConfig: Match.objectLike({ StatusCode: "403" }),
        }),
      ],
    });
  });

  test("ALB and CloudFront share a generated secret, not a fixed value", () => {
    alb.hasResourceProperties("AWS::SecretsManager::Secret", {
      GenerateSecretString: Match.objectLike({ ExcludePunctuation: true }),
    });

    const rules = Object.values(
      alb.findResources("AWS::ElasticLoadBalancingV2::ListenerRule"),
    );
    expect(rules).toHaveLength(1);
    const headerCondition = rules[0].Properties.Conditions.find(
      (c: { Field: string }) => c.Field === "http-header",
    );
    expect(headerCondition.HttpHeaderConfig.HttpHeaderName).toBe(
      ORIGIN_VERIFY_HEADER,
    );
    expect(JSON.stringify(headerCondition.HttpHeaderConfig.Values)).toContain(
      "{{resolve:secretsmanager:",
    );

    cloudFront.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Origins: [
          Match.objectLike({
            OriginCustomHeaders: [
              {
                HeaderName: ORIGIN_VERIFY_HEADER,
                HeaderValue: Match.stringLikeRegexp(
                  "^\\{\\{resolve:secretsmanager:",
                ),
              },
            ],
          }),
        ],
      }),
    });
  });
});
