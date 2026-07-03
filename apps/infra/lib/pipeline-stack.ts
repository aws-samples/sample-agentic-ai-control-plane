import * as cdk from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codecommit from "aws-cdk-lib/aws-codecommit";
import * as iam from "aws-cdk-lib/aws-iam";
import * as pipelines from "aws-cdk-lib/pipelines";
import { Construct } from "constructs";
import { createPlatformStacks } from "./platform";

// Name of the CodeCommit repository the pipeline watches. Override via the
// `repoName` context key (`cdk deploy -c repoName=...`).
const DEFAULT_REPO_NAME = "agentic-ai-platform";
const DEFAULT_BRANCH = "main";

// CDK Stage wrapping all platform stacks so the pipeline can deploy them as a
// unit. Reuses createPlatformStacks for a single source of truth.
class AgenticAiPlatformStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);
    createPlatformStacks(this, props?.env);
  }
}

export interface AgenticAiPlatformPipelineStackProps extends cdk.StackProps {
  // CodeCommit repo name to source from; defaults to DEFAULT_REPO_NAME.
  repoName?: string;
  // Branch to track; defaults to DEFAULT_BRANCH.
  branch?: string;
}

// Self-mutating CDK Pipeline: CodeCommit push -> CodeBuild synth (with Docker
// image asset builds) -> deploy the platform stage. Removes any need for
// contributors to have Docker locally.
export class AgenticAiPlatformPipelineStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props?: AgenticAiPlatformPipelineStackProps,
  ) {
    super(scope, id, props);

    const repoName =
      props?.repoName ??
      (this.node.tryGetContext("repoName") as string | undefined) ??
      DEFAULT_REPO_NAME;
    const branch =
      props?.branch ??
      (this.node.tryGetContext("branch") as string | undefined) ??
      DEFAULT_BRANCH;

    const repository = codecommit.Repository.fromRepositoryName(
      this,
      "PlatformRepo",
      repoName,
    );

    const pipeline = new pipelines.CodePipeline(this, "Pipeline", {
      selfMutation: true,
      // Build the platform's Docker image assets (dashboard, agent, prisma
      // migrate) on the CodeBuild runner instead of a contributor's machine.
      dockerEnabledForSynth: true,
      synth: new pipelines.ShellStep("Synth", {
        input: pipelines.CodePipelineSource.codeCommit(repository, branch),
        commands: [
          "npm install -g corepack@latest",
          "corepack enable",
          "pnpm install --frozen-lockfile",
          // Generate the Prisma client — it's gitignored, so CodeBuild must
          // create it before esbuild can bundle the Lambdas that import it.
          "pnpm --filter @package/database db:generate",
          "cd apps/infra && pnpm cdk synth",
        ],
        primaryOutputDirectory: "apps/infra/cdk.out",
      }),
      // ARM + larger compute: matches the LINUX_ARM64 Docker image assets and
      // speeds up the container builds.
      codeBuildDefaults: {
        buildEnvironment: {
          buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2023_STANDARD_3_0,
          computeType: codebuild.ComputeType.X_LARGE,
        },
        // Pin Node 22 — Prisma 7 and the Lambda bundles require Node 20+, but
        // the build image defaults to an older runtime.
        partialBuildSpec: codebuild.BuildSpec.fromObject({
          version: "0.2",
          phases: {
            install: {
              "runtime-versions": { nodejs: 22 },
            },
          },
        }),
        // Allow synth to assume the CDK bootstrap lookup role so context
        // lookups (e.g. VPC availability zones) work in CodeBuild.
        rolePolicy: [
          new iam.PolicyStatement({
            actions: ["sts:AssumeRole"],
            resources: [
              `arn:aws:iam::${this.account}:role/cdk-hnb659fds-lookup-role-${this.account}-${this.region}`,
            ],
          }),
        ],
      },
    });

    const deployStage = new AgenticAiPlatformStage(this, "Platform", {
      env: {
        account: this.account,
        region: this.region,
      },
    });

    // Gate the deploy behind a manual approval so the synthesized changes can
    // be reviewed before they reach AWS.
    pipeline.addStage(deployStage, {
      pre: [
        new pipelines.ManualApprovalStep("ApproveDeployment", {
          comment: "Review the synthesized templates, then approve to deploy.",
        }),
      ],
    });
  }
}
