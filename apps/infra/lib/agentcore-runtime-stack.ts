import * as agentcore from "@aws-cdk/aws-bedrock-agentcore-alpha";
import * as bedrock from "@aws-cdk/aws-bedrock-alpha";
import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import * as path from "path";
import { SOLUTION_USER_AGENT } from "./solution";

interface AgentCoreRuntimeStackProps extends cdk.StackProps {
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  // Persona tokens used for playground invocations are minted with the dedicated persona client
  personaUserPoolClient: cognito.UserPoolClient;
  // MCP endpoint URL of the AgentCore Gateway to attach as a tool source.
  gatewayMcpUrl: string;
  // VPC for runtime ENIs — required so the runtime can reach RDS without going public
  vpc: ec2.IVpc;
  // RDS instance the agent reads from for per-agent tool filtering
  database: rds.DatabaseInstance;
  // SG defined in DatabaseStack and pre-authorized to reach Postgres. Attaching
  // it to runtime ENIs is what grants DB access (no cross-stack ingress needed).
  runtimeAccessSecurityGroup: ec2.ISecurityGroup;
  dbSchema: string;
}

// Provisions the AgentCore Runtime (Strands agent image, Cognito JWT auth, VPC networking) with IAM to read the DB secret and invoke Bedrock models.
export class AgentCoreRuntimeStack extends cdk.Stack {
  public readonly runtime: agentcore.Runtime;

  constructor(scope: Construct, id: string, props: AgentCoreRuntimeStackProps) {
    super(scope, id, props);

    // Build the agent Docker image from the monorepo root 
    const agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset(
      path.join(__dirname, "../../.."),
      {
        file: "apps/agent/Dockerfile",
        exclude: ["**/cdk.out", "**/node_modules", "**/.git"],
      },
    );

    this.runtime = new agentcore.Runtime(this, "AgentPlatformRuntime", {
      runtimeName: "agentPlatformRuntime",
      agentRuntimeArtifact,
      description:
        "Strands-based agent with Cognito JWT inbound auth for the Agentic AI Platform",
      authorizerConfiguration:
        agentcore.RuntimeAuthorizerConfiguration.usingCognito(props.userPool, [
          props.userPoolClient,
          props.personaUserPoolClient,
        ]),
      networkConfiguration: agentcore.RuntimeNetworkConfiguration.usingVpc(
        this,
        {
          vpc: props.vpc,
          vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
          securityGroups: [props.runtimeAccessSecurityGroup],
        },
      ),
      environmentVariables: {
        BEDROCK_REGION: cdk.Stack.of(this).region,
        AGENTCORE_GATEWAY_MCP_URL: props.gatewayMcpUrl,
        NODE_ENV: "production",
        DB_SECRET_ARN: props.database.secret!.secretArn,
        DB_SCHEMA: props.dbSchema,
        USER_AGENT_STRING: SOLUTION_USER_AGENT,
      },
    });

    // The runtime's execution role needs to read the RDS credentials secret.
    props.database.secret!.grantRead(this.runtime);

    // The agent runtime calls AWS Bedrock for the foundation model and the gateway via MCP. 
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "ReadDatabaseSecret",
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [props.database.secret!.secretArn],
      }),
    );

    // Allow the runtime to invoke any Bedrock foundation model or inference
    // profile in this account. 
    this.runtime.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "InvokeBedrockModels",
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: [
          `arn:aws:bedrock:*::foundation-model/*`,
          `arn:aws:bedrock:*:${cdk.Stack.of(this).account}:inference-profile/*`,
          `arn:aws:bedrock:*:${cdk.Stack.of(this).account}:application-inference-profile/*`,
        ],
      }),
    );
  }
}
