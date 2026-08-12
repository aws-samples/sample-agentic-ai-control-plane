import * as cdk from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

// Captures AWS Agent Registry lifecycle events into a CloudWatch Logs group as a
// durable audit trail. AWS Agent Registry (GA, agent-registry namespace) emits
// EventBridge events to the account's default bus:
//
//   * Registry lifecycle (7 detail types): Registry Creating / Ready /
//     Create Failed / Updating / Update Failed / Deleting / Delete Failed
//   * Registry-record approval lifecycle (5 detail types): Registry Record State
//     changed to Draft / Pending Approval / Approved / Rejected / Deprecated

export class RegistryEventsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Audit log group for all captured registry events. Retained 90 days.
    const logGroup = new logs.LogGroup(this, "RegistryEventsLogGroup", {
      logGroupName: "/agentic-ai-platform/agent-registry/events",
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Single rule matching every AWS Agent Registry event by source. Both event
    // families (registry lifecycle + registry-record approval lifecycle) share
    // this audit sink, so one source-only match captures all 12 detail types and
    // any new ones AWS adds — with no risk of double-logging and no brittle
    // detail-type filtering. Narrow with a detailType allow-list here only if a
    // future consumer needs a subset.
    new events.Rule(this, "RegistryEventsRule", {
      description:
        "AWS Agent Registry — all registry + registry-record lifecycle events (aws.agent-registry)",
      eventPattern: {
        source: ["aws.agent-registry"],
      },
      targets: [new targets.CloudWatchLogGroup(logGroup)],
    });

    new cdk.CfnOutput(this, "RegistryEventsLogGroupName", {
      value: logGroup.logGroupName,
      description: "CloudWatch Logs group capturing AWS Agent Registry events",
    });
  }
}
