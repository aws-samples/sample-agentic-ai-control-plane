import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

// Provisions the platform VPC (public/private subnets, single NAT gateway) with VPC flow logs to CloudWatch.
export class VPCStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Create a VPC for the agent poc that has public and provate subnets
     * and a subnet for the agent and reactome deployments.
     * Room is left for future subnets and internet access is provided
     * for the private subnets via a NatGateway and an InternetGateway.
     */
    const vpc = new ec2.Vpc(this, "VPC", {
      vpcName: "agentic-ai-platform-vpc",
      maxAzs: 2,
      natGateways: 1,
      createInternetGateway: true,
    });

    this.vpc = vpc;

    const vpcFlowLogGroup = new logs.LogGroup(this, "VPCFlowLogGroup", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new ec2.FlowLog(this, "VPCFlowLog", {
      resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(vpcFlowLogGroup),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });
  }
}
