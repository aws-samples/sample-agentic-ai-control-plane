import * as agentcore from "@aws-cdk/aws-bedrock-agentcore-alpha";
import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";

interface AgentCoreGatewayStackProps extends cdk.StackProps {
  userPool: cognito.UserPool;
  personaUserPoolClient: cognito.UserPoolClient;
}

// Provisions the AgentCore MCP Gateway (Cognito persona-client inbound auth) plus its Policy Engine / Lambda-invoke IAM grants and the request interceptor Lambda.
export class AgentCoreGatewayStack extends cdk.Stack {
  public readonly gateway: agentcore.Gateway;
  public readonly gatewayServiceRoleArn: string;

  constructor(
    scope: Construct,
    id: string,
    props: AgentCoreGatewayStackProps,
  ) {
    super(scope, id, props);

    // Gateway MCP endpoint. Inbound JWT auth uses the persona client so the same bearer we mint in mintPersonaToken authenticates here; that JWT's cognito:groups claim flows to the attached Policy Engine.
    this.gateway = new agentcore.Gateway(this, "AgentPlatformGateway", {
      gatewayName: "agent-platform-gateway",
      description:
        "AgentCore MCP Gateway (persona-client inbound auth; targets materialized per agent)",
      protocolConfiguration: new agentcore.McpProtocolConfiguration({
        supportedVersions: [agentcore.MCPProtocolVersion.MCP_2025_03_26],
        searchType: agentcore.McpGatewaySearchType.SEMANTIC,
      }),
      authorizerConfiguration: agentcore.GatewayAuthorizer.usingCognito({
        userPool: props.userPool,
        allowedClients: [props.personaUserPoolClient],
      }),
    });

    // Grant the Gateway's service role the permissions AgentCore requires for Policy Engine evaluation.
    const policyEngineArnPattern = `arn:${cdk.Aws.PARTITION}:bedrock-agentcore:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:policy-engine/*`;
    const policyEnginesSubResourcePattern = `arn:${cdk.Aws.PARTITION}:bedrock-agentcore:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:/policy-engines/*`;
    const policyEnginesTargetResourcePattern = `arn:${cdk.Aws.PARTITION}:bedrock-agentcore:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:/policy-engines/*/target-resource/*`;
    const gatewayArnPattern = `arn:${cdk.Aws.PARTITION}:bedrock-agentcore:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:gateway/*`;

    this.gateway.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "PolicyEngineConfiguration",
        effect: iam.Effect.ALLOW,
        actions: ["bedrock-agentcore:GetPolicyEngine"],
        resources: [policyEngineArnPattern, policyEnginesSubResourcePattern],
      }),
    );

    this.gateway.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "PolicyEngineAuthorization",
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock-agentcore:AuthorizeAction",
          "bedrock-agentcore:PartiallyAuthorizeActions",
          "bedrock-agentcore:CheckAuthorizePermissions",
        ],
        resources: [
          policyEngineArnPattern,
          policyEnginesSubResourcePattern,
          policyEnginesTargetResourcePattern,
          gatewayArnPattern,
        ],
      }),
    );

    // Permits the Gateway to invoke any Lambda in this account+region. 
    this.gateway.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "LambdaTargetInvocation",
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [
          `arn:${cdk.Aws.PARTITION}:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:*`,
        ],
      }),
    );

    this.gatewayServiceRoleArn = this.gateway.role.roleArn;

    // Request Interceptor — decodes the persona JWT and injects callerEmail /
    // callerName / callerGroups into tool args before the gateway evaluates
    // Cedar and invokes the target Lambda.
    const interceptorFn = new nodejs.NodejsFunction(this, "RequestInterceptor", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler",
      entry: path.join(__dirname, "lambdas/request-interceptor.ts"),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: "node22",
        mainFields: ["module", "main"],
      },
    });

    // Attach the interceptor to the gateway using the construct's native API.
    // LambdaInterceptor.forRequest grants the gateway's IAM role
    // lambda:InvokeFunction on the interceptoråå
    this.gateway.addInterceptor(
      agentcore.LambdaInterceptor.forRequest(interceptorFn, {
        passRequestHeaders: true,
      }),
    );

    new cdk.CfnOutput(this, "RequestInterceptorArn", {
      value: interceptorFn.functionArn,
      description: "Request Interceptor Lambda ARN (attached to the gateway)",
      exportName: "RequestInterceptorArn",
    });

    new cdk.CfnOutput(this, "GatewayId", {
      value: this.gateway.gatewayId,
      description: "AgentCore Gateway ID",
      exportName: "AgenticAiPlatformGatewayId",
    });

    new cdk.CfnOutput(this, "GatewayArn", {
      value: this.gateway.gatewayArn,
      description: "AgentCore Gateway ARN (use in Cedar policy resource)",
      exportName: "AgenticAiPlatformGatewayArn",
    });

    new cdk.CfnOutput(this, "GatewayMcpUrl", {
      value: this.gateway.gatewayUrl ?? "",
      description: "AgentCore Gateway MCP endpoint URL",
      exportName: "AgenticAiPlatformGatewayMcpUrl",
    });
  }
}
