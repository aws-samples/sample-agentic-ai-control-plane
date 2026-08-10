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
  agentCoreGatewayArn: string;
  agentCoreGatewayServiceRoleArn: string;
  agentCoreRuntimeArn: string;
  personaMasterPasswordSecret: secretsmanager.Secret;
  personaUserPoolClient: cognito.UserPoolClient;
}

// Ownership tag stamped on every AVP policy store the dashboard creates. The
// IAM policy below requires this exact tag (aws:RequestTag on create,
// aws:ResourceTag on every other operation), so the task can only act on policy
// stores it owns instead of every store in the account. The same key/value is
// injected into the container so the app tags stores at CreatePolicyStore time
// (see packages/api/routes/tool-policy-stores/stores.ts).
const AVP_OWNER_TAG_KEY = "agentic-ai-platform:managed-by";
const AVP_OWNER_TAG_VALUE = "dashboard-avp-sync";

// Ownership tag stamped on the AgentCore resources the dashboard creates that
// support tagging (policy engines on create; registries via a follow-up
// TagResource call since CreateRegistry has no tags field). The IAM statements
// below gate operations on these resources by aws:ResourceTag so the task can
// only act on resources it owns. Injected into the container so the app applies
// the same key/value (see packages/api/routes/policy-engines.ts and registry.ts).
const AGENTCORE_OWNER_TAG_KEY = "agentic-ai-platform:managed-by";
const AGENTCORE_OWNER_TAG_VALUE = "dashboard-agentcore-sync";

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
        // Ownership tag the app must stamp on every policy store it creates so
        // the task role's tag-scoped IAM policy will permit acting on it.
        AVP_OWNER_TAG_KEY,
        AVP_OWNER_TAG_VALUE,
        // Ownership tag for taggable AgentCore resources (policy engines,
        // registries) — same purpose as above for the AgentCore tag-scoped IAM.
        AGENTCORE_OWNER_TAG_KEY,
        AGENTCORE_OWNER_TAG_VALUE,
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
    // Actions are enumerated to exactly what the dashboard's API routes invoke
    // (see packages/api/routes/tool-policy-stores/* and packages/policy/src/
    // mapper.ts) rather than the wildcard "verifiedpermissions:*".
    //
    // Resources still cannot be enumerated by ARN because policy stores are
    // created at runtime by this task. Instead the grant is scoped by an
    // ownership tag (AVP supports ABAC): the app stamps AVP_OWNER_TAG_KEY on
    // every store it creates, and these statements only permit acting on stores
    // that carry that tag — so the role cannot touch arbitrary policy stores in
    // the account.

    // CreatePolicyStore has no pre-existing ARN, so it stays resource "*" but is
    // gated on aws:RequestTag: the task may only create stores that are being
    // tagged with the ownership tag, and aws:TagKeys forbids attaching any other
    // tag key in the same call.
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "VerifiedPermissionsCreateStore",
        actions: ["verifiedpermissions:CreatePolicyStore"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            [`aws:RequestTag/${AVP_OWNER_TAG_KEY}`]: AVP_OWNER_TAG_VALUE,
          },
          "ForAllValues:StringEquals": {
            "aws:TagKeys": [AVP_OWNER_TAG_KEY],
          },
        },
      }),
    );

    // Every operation against an existing store is gated on aws:ResourceTag, so
    // the task can only act on stores it created (which carry the tag).
    // IsAuthorized/IsAuthorizedWithToken are included here — they target a
    // specific policyStoreId (see packages/policy/src/mapper.ts), so they are
    // resource-scoped and match on the store's tag; they must NOT go in the
    // aws:RequestTag statement above because they send no tags and would be
    // denied. TagResource/UntagResource keep tag management on owned stores.
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "VerifiedPermissionsOwnedStores",
        actions: [
          // Policy stores
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
          // Authorization checks (scoped to the target store)
          "verifiedpermissions:IsAuthorized",
          "verifiedpermissions:IsAuthorizedWithToken",
          // Tag management on owned stores
          "verifiedpermissions:TagResource",
          "verifiedpermissions:UntagResource",
        ],
        resources: ["*"],
        conditions: {
          StringEquals: {
            [`aws:ResourceTag/${AVP_OWNER_TAG_KEY}`]: AVP_OWNER_TAG_VALUE,
          },
        },
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
    // Actions are enumerated to exactly what the dashboard's API routes invoke
    // (see packages/api/routes/*) rather than the wildcard "bedrock-agentcore:*".
    //
    // Resource scoping is done in layers because AgentCore has uneven
    // resource-level IAM support ("Partial" ABAC):
    //
    //  * Gateway + gateway-target actions (below) are scoped to THIS platform's
    //    gateway. The gateway is created at deploy time by AgentCoreGatewayStack,
    //    so its ARN is known and passed in as a prop. Targets are children of
    //    the gateway (arn:...:gateway/<id>/target/*), so both the gateway ARN and
    //    the target sub-resource ARN are listed. ListGateways/ListGatewayTargets
    //    are List operations with no resource-level support, so they go in a
    //    separate "*" statement below. (Pattern mirrors the AWS CDK alpha
    //    construct's own grantRead/grantManage — see aws-bedrock-agentcore-alpha
    //    gateway-base.js.)
    //
    //  * Agent runtime invocation (Phase 2) is scoped to THIS platform's
    //    runtime, created at deploy time by AgentCoreRuntimeStack — its ARN is
    //    passed in as a prop. Invoke also covers the endpoint sub-resource
    //    (arn/*), matching the CDK alpha construct's own grantInvokeRuntime.
    //
    //  * Policy engines, policies, registries, and registry records (Phase 2)
    //    are created at runtime, so they are scoped by an ownership tag (AVP-
    //    style ABAC): CreatePolicyEngine is gated on aws:RequestTag; every op on
    //    an existing engine/registry is gated on aws:ResourceTag. CreateRegistry
    //    has no tags-on-create field, so it stays "*" and the app tags the
    //    registry immediately after (create-then-tag, see registry.ts).
    //
    //    NOTE: AgentCore ABAC is "Partial" — not every resource type is
    //    guaranteed to honor aws:ResourceTag. These conditions MUST be validated
    //    in a dev account before prod (see the validation command in the PR/
    //    commit notes) or the dashboard could be silently denied access to
    //    resources it owns.
    //
    //  * List/Search actions and CreateRegistry cannot be resource- or tag-
    //    scoped and remain in a final "*" statement.
    const gatewayTargetArnPattern = `${props.agentCoreGatewayArn}/target/*`;

    // Gateway + target actions that support resource-level permissions, scoped
    // to this platform's gateway and its targets.
    //
    // Full gateway + gateway-target + gateway-rule API surface (per the
    // AgentCore Service Authorization Reference / SDK command set), minus
    // CreateGateway/DeleteGateway — the gateway itself is provisioned by
    // AgentCoreGatewayStack at deploy time, not by the dashboard, so the task
    // role must not be able to create or destroy gateways. Everything else
    // (target CRUD + sync, gateway rules) operates on this platform's gateway.
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "AgentCoreOwnedGateway",
        actions: [
          // Gateway (no Create/Delete — deploy-time managed)
          "bedrock-agentcore:GetGateway",
          "bedrock-agentcore:UpdateGateway",
          // Gateway targets
          "bedrock-agentcore:CreateGatewayTarget",
          "bedrock-agentcore:GetGatewayTarget",
          "bedrock-agentcore:UpdateGatewayTarget",
          "bedrock-agentcore:DeleteGatewayTarget",
          "bedrock-agentcore:ListGatewayTargets",
          "bedrock-agentcore:SynchronizeGatewayTargets",
          // Gateway rules
          "bedrock-agentcore:CreateGatewayRule",
          "bedrock-agentcore:GetGatewayRule",
          "bedrock-agentcore:UpdateGatewayRule",
          "bedrock-agentcore:DeleteGatewayRule",
          "bedrock-agentcore:ListGatewayRules",
          // Attaching/detaching a policy engine to the gateway (attachGateway →
          // UpdateGateway with policyEngineConfiguration) requires managing the
          // gateway's resource-scoped policy. This is an IAM-authorization-only
          // action (no matching SDK/API command), so it does not appear in the
          // SDK command set — it only surfaces as an AccessDenied at attach time.
          "bedrock-agentcore:ManageResourceScopedPolicy",
        ],
        resources: [props.agentCoreGatewayArn, gatewayTargetArnPattern],
      }),
    );

    // Agent runtime actions scoped to this platform's runtime (and its endpoint
    // sub-resources via arn/*). Invoke plus the read/describe surface the
    // dashboard uses. No Create/Update/Delete — the runtime is provisioned by
    // AgentCoreRuntimeStack at deploy time, so the task role must not manage
    // runtimes. (List* across runtimes has no resource-level support and lives
    // in the unscoped statement below.)
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "AgentCoreOwnedRuntime",
        actions: [
          "bedrock-agentcore:InvokeAgentRuntime",
          "bedrock-agentcore:GetAgentRuntime",
          "bedrock-agentcore:GetAgentRuntimeEndpoint",
          "bedrock-agentcore:ListAgentRuntimeVersions",
        ],
        resources: [
          props.agentCoreRuntimeArn,
          `${props.agentCoreRuntimeArn}/*`,
        ],
      }),
    );

    // CreatePolicyEngine has no pre-existing ARN; gate it on aws:RequestTag so
    // the task can only create engines stamped with the ownership tag, and
    // aws:TagKeys forbids attaching any other tag key in the same call.
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "AgentCoreCreatePolicyEngine",
        actions: ["bedrock-agentcore:CreatePolicyEngine"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            [`aws:RequestTag/${AGENTCORE_OWNER_TAG_KEY}`]:
              AGENTCORE_OWNER_TAG_VALUE,
          },
          "ForAllValues:StringEquals": {
            "aws:TagKeys": [AGENTCORE_OWNER_TAG_KEY],
          },
        },
      }),
    );

    // Ops on an existing policy ENGINE, gated on the engine's ownership tag.
    // These act on the engine resource itself, which the app tags at create
    // time (CreatePolicyEngine supports tags-on-create), so aws:ResourceTag
    // matches.
    //
    // NOTE: policy and policy-generation actions are intentionally NOT here.
    // A policy has its own distinct policyArn (a sub-resource of the engine) and
    // is never tagged — CreatePolicy has no tags field, and IAM has no tag
    // inheritance from the engine. So an aws:ResourceTag condition on a policy
    // action can never match and Get/Update/Delete/CreatePolicy and the
    // policy-generation calls would be silently denied. They live in the
    // unscoped statement below instead. (Same class of bug as registry records.)
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "AgentCoreOwnedPolicyEngines",
        actions: [
          "bedrock-agentcore:GetPolicyEngine",
          "bedrock-agentcore:GetPolicyEngineSummary",
          "bedrock-agentcore:UpdatePolicyEngine",
          "bedrock-agentcore:DeletePolicyEngine",
        ],
        resources: ["*"],
        conditions: {
          StringEquals: {
            [`aws:ResourceTag/${AGENTCORE_OWNER_TAG_KEY}`]:
              AGENTCORE_OWNER_TAG_VALUE,
          },
        },
      }),
    );

    // NOTE (GA migration, 2026-08): the dashboard's registry code now targets the
    // `agent-registry` namespace exclusively (see registry.ts and the
    // AgentRegistry* statements below), so the old `bedrock-agentcore` registry
    // grants — a claim-by-tag `TagResource` and an `AgentCoreOwnedRegistries`
    // Get/Update/Delete statement — have been removed. Registry-record and
    // create/list/search actions were likewise dropped from
    // AgentCoreUnscopedActions below. Workload-identity actions are retained there
    // because they stay under bedrock-agentcore even for agent-registry URL-sync.
    // See docs/agentcore-registry-ga-migration.md.

    // ── AWS Agent Registry GA namespace (agent-registry:*) ──────────────────
    //
    // Every registry IAM action (including account-level ones like
    // ListRegistries) authorizes under the `agent-registry:` prefix, and registry
    // resources use `arn:aws:agent-registry:...` ARNs. This is the sole registry
    // grant set — the old bedrock-agentcore registry grants were removed once the
    // dashboard code migrated to the agent-registry SDK clients (Phase 1/2).
    //
    // NOTE: workload identity is intentionally NOT here — it stays under
    // bedrock-agentcore (see the unscoped statement below) even for agent-registry
    // URL-sync records, which the AWS migration guide calls out explicitly.
    const agentRegistryArnPattern = `arn:aws:agent-registry:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*`;

    // Ops on an existing REGISTRY, gated on the registry's ownership tag (same
    // ABAC pattern as AgentCoreOwnedRegistries above).
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "AgentRegistryOwnedRegistries",
        actions: [
          "agent-registry:GetRegistry",
          "agent-registry:UpdateRegistry",
          "agent-registry:DeleteRegistry",
        ],
        resources: ["*"],
        conditions: {
          StringEquals: {
            [`aws:ResourceTag/${AGENTCORE_OWNER_TAG_KEY}`]:
              AGENTCORE_OWNER_TAG_VALUE,
          },
        },
      }),
    );

    // Claim-by-tag for the agent-registry namespace. CreateRegistry in the new
    // namespace DOES support tags-on-create, so once registry.ts adopts that the
    // create-then-tag dance (and this TagResource grant) can be dropped. Kept for
    // parity during migration; gated on aws:RequestTag so only the owner tag can
    // ever be attached.
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "AgentRegistryClaimByTag",
        actions: ["agent-registry:TagResource"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            [`aws:RequestTag/${AGENTCORE_OWNER_TAG_KEY}`]:
              AGENTCORE_OWNER_TAG_VALUE,
          },
          "ForAllValues:StringEquals": {
            "aws:TagKeys": [AGENTCORE_OWNER_TAG_KEY],
          },
        },
      }),
    );

    // Registry actions that cannot be tag- or ARN-scoped, on the agent-registry
    // resource ARN pattern (create/list/search + record sub-resource CRUD).
    // Mirrors the registry slice of AgentCoreUnscopedActions below. Note the
    // renamed/added data-plane discovery actions:
    //   SearchRegistryRecords            -> SearchDiscoverableRegistryRecords
    //   (new) ListDiscoverableRegistryRecords, GetDiscoverableRegistryRecord
    // BatchGetDiscoverableRegistryRecord has no own action; it authorizes via
    // GetDiscoverableRegistryRecord.
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "AgentRegistryUnscopedActions",
        actions: [
          "agent-registry:CreateRegistry",
          "agent-registry:ListRegistries",
          "agent-registry:ListRegistryRecords",
          // Registry records (sub-resource of the registry, untagged — same
          // untagged-sub-resource caveat as bedrock-agentcore records)
          "agent-registry:CreateRegistryRecord",
          "agent-registry:GetRegistryRecord",
          "agent-registry:UpdateRegistryRecord",
          "agent-registry:DeleteRegistryRecord",
          "agent-registry:UpdateRegistryRecordStatus",
          "agent-registry:SubmitRegistryRecordForApproval",
          // Data-plane discovery (renamed + new in the GA namespace)
          "agent-registry:SearchDiscoverableRegistryRecords",
          "agent-registry:ListDiscoverableRegistryRecords",
          "agent-registry:GetDiscoverableRegistryRecord",
        ],
        resources: [agentRegistryArnPattern],
      }),
    );

    // Actions that cannot be tag- or ARN-scoped, kept on "*":
    //  - List/Search: no resource-level support.
    //  - CreateRegistry: no tags-on-create (residual gap — app tags immediately
    //    after and every later registry op is tag-scoped).
    //  - Policy and registry-RECORD sub-resource actions: these act on
    //    sub-resources (policyArn / recordArn) that are never tagged, and IAM
    //    has no tag inheritance from the parent engine/registry, so an
    //    aws:ResourceTag condition on them can never match. They must stay "*"
    //    (or be scoped some other way) or they're silently denied — this is what
    //    broke SubmitRegistryRecordForApproval.
    //  - Workload identity: created implicitly by CreateRegistry/CreateGateway
    //    via a forward-access call using this role, so the lifecycle actions are
    //    required or CreateRegistry fails "Unable to create workload identity
    //    because access was denied." AgentCore names it (unpredictable), so "*".
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "AgentCoreUnscopedActions",
        actions: [
          // Gateway list
          "bedrock-agentcore:ListGateways",
          // Policy engine list + summaries
          "bedrock-agentcore:ListPolicyEngines",
          "bedrock-agentcore:ListPolicyEngineSummaries",
          // Policies (sub-resource of the engine, untagged — see note above)
          "bedrock-agentcore:CreatePolicy",
          "bedrock-agentcore:GetPolicy",
          "bedrock-agentcore:GetPolicySummary",
          "bedrock-agentcore:UpdatePolicy",
          "bedrock-agentcore:DeletePolicy",
          "bedrock-agentcore:ListPolicies",
          "bedrock-agentcore:ListPolicySummaries",
          // Cedar policy generation (operates against the engine + policies)
          "bedrock-agentcore:StartPolicyGeneration",
          "bedrock-agentcore:GetPolicyGeneration",
          "bedrock-agentcore:GetPolicyGenerationSummary",
          "bedrock-agentcore:ListPolicyGenerations",
          "bedrock-agentcore:ListPolicyGenerationSummaries",
          "bedrock-agentcore:ListPolicyGenerationAssets",
          // NOTE: registry create/list/search + record CRUD actions were removed
          // here at the GA migration — they now live under agent-registry:* (see
          // the AgentRegistry* statements above). Workload identity below stays.
          // Agent runtime list (ListAgentRuntimeVersions targets a specific
          // runtime ARN, so it lives in the scoped runtime statement above)
          "bedrock-agentcore:ListAgentRuntimes",
          "bedrock-agentcore:ListAgentRuntimeEndpoints",
          // Backing workload identity created implicitly by CreateRegistry /
          // CreateGateway.
          "bedrock-agentcore:CreateWorkloadIdentity",
          "bedrock-agentcore:GetWorkloadIdentity",
          "bedrock-agentcore:UpdateWorkloadIdentity",
          "bedrock-agentcore:DeleteWorkloadIdentity",
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

    // Grant Cognito access, scoped to THIS platform's user pool. The pool is
    // created at deploy time by CognitoStack and passed in as a prop, so its
    // ARN is known — every app call targets it via COGNITO_USER_POOL_ID (see
    // packages/api/routes/personas.ts, cognito-groups.ts, mint-persona-token.ts).
    // All of these List*/Admin* actions support the user-pool ARN as their
    // resource, so scoping to it removes the account-wide "*" that let the task
    // administer (create/delete users, reset passwords) any user pool in the
    // account.
    ecsFargateTaskDefinitionDash.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: "CognitoOwnedUserPool",
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
        resources: [props.userPool.userPoolArn],
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
