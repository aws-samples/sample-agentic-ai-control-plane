import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface DashboardStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  ecsCluster: ecs.Cluster;
  alb: elbv2.ApplicationLoadBalancer;
  dashTargetGroup: elbv2.ApplicationTargetGroup;
  domain: string;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  cognitoDomain: string;
  database: rds.DatabaseInstance;
  databaseSecurityGroup: ec2.SecurityGroup;
  dbSchema: string;
  agentCoreGatewayId: string;
  agentCoreGatewayServiceRoleArn: string;
  personaMasterPasswordSecret: secretsmanager.Secret;
  personaUserPoolClient: cognito.UserPoolClient;
}

// Provisions the dashboard web app as a Fargate service behind the ALB, with task-role IAM for AVP, Bedrock, AgentCore, Cognito, CloudWatch, and secrets.
export class DashboardStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DashboardStackProps) {
    super(scope, id, props);

    const betterAuthSecret = new secretsmanager.Secret(
      this,
      "BetterAuthSecret",
      {
        description: "Secret used by Better Auth for session signing",
        generateSecretString: {
          excludeCharacters: '"@/\\',
          passwordLength: 64,
        },
      },
    );

    const ecsFargateTaskDefinitionDash = new ecs.FargateTaskDefinition(
      this,
      "ecsTaskDefinitionDash",
      {
        memoryLimitMiB: 1024,
        runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.ARM64 },
      },
    );

    const publicUrl = `https://${props.domain}`;

    ecsFargateTaskDefinitionDash.addContainer("ecsContainerDash", {
      containerName: "dashboard",
      image: ecs.ContainerImage.fromAsset("../..", {
        file: "apps/web/Dockerfile",
        platform: Platform.LINUX_ARM64,
        exclude: ["**/cdk.out", "**/node_modules", "**/.git"],
      }),
      logging: new ecs.AwsLogDriver({
        streamPrefix: "dash",
      }),
      memoryLimitMiB: 1024,
      environment: {
        NODE_ENV: "production",
        NEXT_PUBLIC_URL: publicUrl,
        COGNITO_CLIENT_ID: props.userPoolClient.userPoolClientId,
        COGNITO_CLIENT_SECRET:
          props.userPoolClient.userPoolClientSecret.unsafeUnwrap(),
        COGNITO_DOMAIN: `${props.cognitoDomain}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`,
        COGNITO_REGION: cdk.Stack.of(this).region,
        COGNITO_USER_POOL_ID: props.userPool.userPoolId,
        BETTER_AUTH_URL: publicUrl,
        TRUSTED_ORIGINS: publicUrl,
        DB_SECRET_ARN: props.database.secret!.secretArn,
        DB_SCHEMA: props.dbSchema,
        AGENTCORE_REGION: cdk.Stack.of(this).region,
        AGENTCORE_ACCOUNT_ID: cdk.Stack.of(this).account,
        AGENTCORE_REGISTRY_REGION: cdk.Stack.of(this).region,
        AGENTCORE_GATEWAY_ID: props.agentCoreGatewayId,
        AVP_REGION: cdk.Stack.of(this).region,
        PERSONA_MASTER_PASSWORD_SECRET_ARN:
          props.personaMasterPasswordSecret.secretArn,
        PERSONA_USER_POOL_CLIENT_ID:
          props.personaUserPoolClient.userPoolClientId,
      },
      secrets: {
        BETTER_AUTH_SECRET: ecs.Secret.fromSecretsManager(betterAuthSecret),
      },
    });

    ecsFargateTaskDefinitionDash.defaultContainer!.addPortMappings({
      containerPort: 3000,
    });

    const ec2SecurityGroupEcsServiceDash = new ec2.SecurityGroup(
      this,
      "ec2SecurityGroupEcsServiceDash",
      {
        vpc: props.vpc,
        allowAllOutbound: true,
        description: "Security group for Dashboard ECS service",
      },
    );
    ec2SecurityGroupEcsServiceDash.connections.allowFrom(
      props.alb,
      ec2.Port.tcp(3000),
      "alb to ecs service",
    );

    props.databaseSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      "Allow Dashboard ECS service to connect to database",
    );

    props.database.secret!.grantRead(ecsFargateTaskDefinitionDash.taskRole);

    // Grant Amazon Verified Permissions access for the tools/AVP sync flow.
    //
    // Enumerated to the specific operations the dashboard's API routes invoke
    // (see packages/api/routes/tool-policy-stores/* and packages/policy/src/
    // mapper.ts) instead of the wildcard "verifiedpermissions:*", which granted
    // admin-equivalent control over every policy store in the account.
    //
    // Resources remain "*" because policy stores are created at runtime by this
    // task (CreatePolicyStore), so their ARNs are not known at deploy time and
    // cannot be enumerated here. Scope to owned policy stores via a resource tag
    // condition once the sync flow tags the stores it creates.
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          // Policy stores
          "verifiedpermissions:CreatePolicyStore",
          "verifiedpermissions:GetPolicyStore",
          "verifiedpermissions:UpdatePolicyStore",
          "verifiedpermissions:DeletePolicyStore",
          // Schema
          "verifiedpermissions:GetSchema",
          "verifiedpermissions:PutSchema",
          // Policies
          "verifiedpermissions:CreatePolicy",
          "verifiedpermissions:GetPolicy",
          "verifiedpermissions:UpdatePolicy",
          "verifiedpermissions:DeletePolicy",
          // Policy templates
          "verifiedpermissions:CreatePolicyTemplate",
          "verifiedpermissions:UpdatePolicyTemplate",
          "verifiedpermissions:DeletePolicyTemplate",
          // Authorization checks
          "verifiedpermissions:IsAuthorized",
          "verifiedpermissions:IsAuthorizedWithToken",
        ],
        resources: ["*"],
      }),
    );

    // Grant Bedrock access 
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:Converse",
          "bedrock:ConverseStream",
          "bedrock:Retrieve",
          "bedrock:RetrieveAndGenerate",
        ],
        resources: ["*"],
      }),
    );

    // Grant Bedrock AgentCore access.
    //
    // Enumerated to the specific operations the dashboard's API routes invoke
    // (see packages/api/routes/*) instead of the wildcard "bedrock-agentcore:*",
    // which granted admin-equivalent control over every gateway, target, policy
    // engine, registry, and runtime in the account.
    //
    // Resources remain "*" because AgentCore has uneven resource-level IAM
    // support and several of these are List/Create operations that cannot be
    // scoped to a specific ARN. Tighten to ARNs derived from props as AgentCore
    // adds resource-level support.
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          // Gateways
          "bedrock-agentcore:ListGateways",
          "bedrock-agentcore:GetGateway",
          "bedrock-agentcore:UpdateGateway",
          // Gateway targets
          "bedrock-agentcore:CreateGatewayTarget",
          "bedrock-agentcore:UpdateGatewayTarget",
          "bedrock-agentcore:GetGatewayTarget",
          "bedrock-agentcore:ListGatewayTargets",
          // Policy engines
          "bedrock-agentcore:CreatePolicyEngine",
          "bedrock-agentcore:GetPolicyEngine",
          "bedrock-agentcore:UpdatePolicyEngine",
          "bedrock-agentcore:DeletePolicyEngine",
          "bedrock-agentcore:ListPolicyEngines",
          // Policies
          "bedrock-agentcore:CreatePolicy",
          "bedrock-agentcore:GetPolicy",
          "bedrock-agentcore:UpdatePolicy",
          "bedrock-agentcore:DeletePolicy",
          "bedrock-agentcore:ListPolicies",
          // Registries
          "bedrock-agentcore:CreateRegistry",
          "bedrock-agentcore:UpdateRegistry",
          "bedrock-agentcore:DeleteRegistry",
          "bedrock-agentcore:ListRegistries",
          // Registry records
          "bedrock-agentcore:CreateRegistryRecord",
          "bedrock-agentcore:GetRegistryRecord",
          "bedrock-agentcore:ListRegistryRecords",
          "bedrock-agentcore:UpdateRegistryRecord",
          "bedrock-agentcore:DeleteRegistryRecord",
          "bedrock-agentcore:UpdateRegistryRecordStatus",
          "bedrock-agentcore:SubmitRegistryRecordForApproval",
          "bedrock-agentcore:SearchRegistryRecords",
          // Agent runtimes
          "bedrock-agentcore:ListAgentRuntimes",
          "bedrock-agentcore:ListAgentRuntimeEndpoints",
          "bedrock-agentcore:InvokeAgentRuntime",
        ],
        resources: ["*"],
      }),
    );

    // PassRole for AgentCore Gateway service role. CreateGatewayTarget /
    // UpdateGatewayTarget on Lambda targets call AgentCore on behalf of the
    // gateway, which requires passing the gateway's service role.
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "PassGatewayServiceRole",
        actions: ["iam:PassRole"],
        resources: [props.agentCoreGatewayServiceRoleArn],
        conditions: {
          StringEquals: {
            "iam:PassedToService": "bedrock-agentcore.amazonaws.com",
          },
        },
      }),
    );

    // Read-only CloudWatch metrics for the analytics widgets on the dashboard.
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudwatch:GetMetricData",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
        ],
        resources: ["*"],
      }),
    );

    // Grant cognito access
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:ListUsers",
          "cognito-idp:ListGroups",
          "cognito-idp:ListUserPoolClients",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:AdminAddUserToGroup",
        ],
        resources: ["*"],
      }),
    );

    // Allow reading the persona master password secret to mint persona tokens
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:agentic-ai-platform/persona/*`,
        ],
      }),
    );

    const ecsServiceDash = new ecs.FargateService(this, "ecsServiceDash", {
      assignPublicIp: false,
      cluster: props.ecsCluster,
      desiredCount: 1,
      securityGroups: [ec2SecurityGroupEcsServiceDash],
      taskDefinition: ecsFargateTaskDefinitionDash,
      
      circuitBreaker: { rollback: true },
    });

    ecsServiceDash.attachToApplicationTargetGroup(props.dashTargetGroup);
  }
}
