import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { AgentCoreGatewayStack } from "./agentcore-gateway-stack";
import { AgentCoreRuntimeStack } from "./agentcore-runtime-stack";
import { AlbStack } from "./alb-stack";
import { CloudFrontStack } from "./cloudfront-stack";
import { CognitoStack } from "./cognito-stack";
import { DashboardStack } from "./dashboard-stack";
import { DatabaseStack } from "./database-stack";
import { EcsClusterStack } from "./ecs-cluster-stack";
import { LambdaToolStack } from "./lambda-tool-stack";
import { VPCStack } from "./vpc-stack";

const DB_SCHEMA = "agentic_ai_platform";

// Instantiates all platform stacks under the given scope and wires their
// cross-stack dependencies. Shared by both the direct-deploy Construct and the
// pipeline Stage so there is a single source of truth for the stack graph.
export function createPlatformStacks(
  scope: Construct,
  env?: cdk.Environment,
): void {
  const vpc = new VPCStack(scope, "VPCStack", { env });

  const alb = new AlbStack(scope, "AlbStack", {
    env,
    vpc: vpc.vpc,
  });

  const database = new DatabaseStack(scope, "DatabaseStack", {
    env,
    vpc: vpc.vpc,
    DB_SCHEMA,
  });

  const cloudfront = new CloudFrontStack(scope, "CloudFrontStack", {
    env,
    domainName: undefined,
    certificate: undefined,
    alb: alb.alb,
  });

  const ecsCluster = new EcsClusterStack(scope, "EcsClusterStack", {
    env,
    vpc: vpc.vpc,
  });

  const cognito = new CognitoStack(scope, "CognitoStack", {
    env,
    route53domain: cloudfront.distribution.distributionDomainName,
  });

  // Example tool Lambdas (calculator, expense tools) the agent can register.
  // Created before the gateway so its invoke grant can be scoped to exactly
  // these function ARNs.
  const lambdaTools = new LambdaToolStack(scope, "LambdaToolStack", {
    env,
    vpc: vpc.vpc,
    database: database.database,
    runtimeAccessSecurityGroup: database.runtimeAccessSecurityGroup,
    dbSchema: DB_SCHEMA,
  });
  lambdaTools.addDependency(database);

  const agentCoreGateway = new AgentCoreGatewayStack(
    scope,
    "AgentCoreGatewayStack",
    {
      env,
      userPool: cognito.userPool,
      personaUserPoolClient: cognito.personaUserPoolClient,
      toolFunctions: [lambdaTools.calculatorFn, lambdaTools.expenseToolsFn],
    },
  );
  agentCoreGateway.addDependency(lambdaTools);

  const agentCoreRuntime = new AgentCoreRuntimeStack(
    scope,
    "AgentCoreRuntimeStack",
    {
      env,
      userPool: cognito.userPool,
      userPoolClient: cognito.userPoolClient,
      personaUserPoolClient: cognito.personaUserPoolClient,
      gatewayMcpUrl: agentCoreGateway.gateway.gatewayUrl ?? "",
      vpc: vpc.vpc,
      database: database.database,
      runtimeAccessSecurityGroup: database.runtimeAccessSecurityGroup,
      dbSchema: DB_SCHEMA,
    },
  );
  agentCoreRuntime.addDependency(agentCoreGateway);
  agentCoreRuntime.addDependency(database);

  const dashboard = new DashboardStack(scope, "DashboardStack", {
    env,
    vpc: vpc.vpc,
    ecsCluster: ecsCluster.cluster,
    alb: alb.alb,
    dashTargetGroup: alb.dashTargetGroup,
    domain: cloudfront.distribution.distributionDomainName,
    userPool: cognito.userPool,
    userPoolClient: cognito.userPoolClient,
    cognitoDomain: `agentic-ai-platform-${cdk.Aws.ACCOUNT_ID}`,
    database: database.database,
    databaseSecurityGroup: database.databaseSecurityGroup,
    dbSchema: DB_SCHEMA,
    agentCoreGatewayId: agentCoreGateway.gateway.gatewayId,
    agentCoreGatewayArn: agentCoreGateway.gateway.gatewayArn,
    agentCoreGatewayServiceRoleArn: agentCoreGateway.gatewayServiceRoleArn,
    agentCoreRuntimeArn: agentCoreRuntime.runtime.agentRuntimeArn,
    personaMasterPasswordSecret: cognito.personaMasterPasswordSecret,
    personaUserPoolClient: cognito.personaUserPoolClient,
  });
  dashboard.addDependency(agentCoreGateway);
  dashboard.addDependency(agentCoreRuntime);
  dashboard.addDependency(database);
}
