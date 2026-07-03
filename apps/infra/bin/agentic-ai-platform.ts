#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { AgenticAiPlatformPipelineStack } from "../lib/pipeline-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// The platform deploys via a self-mutating CDK Pipeline (CodeCommit + CodeBuild),
// so the images build in the cloud and deployers don't need local Docker. The
// pipeline wraps the platform stacks in a Stage named `Platform`, producing
// `Platform-*` stacks (e.g. `Platform-CognitoStack`).
new AgenticAiPlatformPipelineStack(app, "AgenticAiPlatformPipelineStack", {
  env,
});

app.synth();
