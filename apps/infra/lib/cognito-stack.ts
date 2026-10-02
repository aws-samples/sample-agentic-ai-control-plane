import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as cr from "aws-cdk-lib/custom-resources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import * as path from "path";

const ENTRA_PLACEHOLDER = "REPLACE_AFTER_DEPLOY";
const ENTRA_CLIENT_ID_PARAM = "/agentic-ai-platform/entra/client-id";
const ENTRA_TENANT_ID_PARAM = "/agentic-ai-platform/entra/tenant-id";
const ENTRA_CLIENT_SECRET_NAME = "agentic-ai-platform/entra/client-secret";
const PLATFORM_ADMIN_GROUP_NAME = "PlatformAdmins";

interface CognitoStackProps extends cdk.StackProps {
  route53domain: string;
}

// Provisions the Cognito user pool, dashboard + persona app clients, optional Entra OIDC federation, and the federation/pre-token group-sync Lambda triggers.
export class CognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolDomain?: cognito.UserPoolDomain;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly personaUserPoolClient: cognito.UserPoolClient;
  public readonly personaMasterPasswordSecret: secretsmanager.Secret;
  public readonly platformAdminGroup: cognito.UserPoolGroup;

  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props);

    // ── Entra federation: SSM params + Secret are always created by CDK so
    // operators never run `aws ssm put-parameter` manually. They fill in
    // values via console once, then redeploy with --context entraFederation=true
    // to activate the OIDC provider against the user pool.
    const entraConfigOps = createEntraConfigPlaceholders(this);
    const entraFederationEnabled =
      this.node.tryGetContext("entraFederation") === true ||
      this.node.tryGetContext("entraFederation") === "true";

    const userPool = new cognito.UserPool(
      this,
      "AgenticAiPlatformUserPool",
      {
        selfSignUpEnabled: false,
        signInCaseSensitive: false,
        signInAliases: {
          email: true,
        },
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireDigits: true,
          requireSymbols: true,
        },
        standardAttributes: {
          email: {
            required: true,
            mutable: true,
          },
          fullname: {
            required: true,
            mutable: true,
          },
        },
        accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
        customAttributes: {
          user_groups: new cognito.StringAttribute({ mutable: true }),
          entra_group_names: new cognito.StringAttribute({ mutable: true }),
          entra_group_ids: new cognito.StringAttribute({ mutable: true }),
          persona_groups: new cognito.StringAttribute({ mutable: true }),
          persona_source: new cognito.StringAttribute({ mutable: true }),
          department: new cognito.StringAttribute({ mutable: true }),
          approval_limit: new cognito.NumberAttribute({ mutable: true }),
        },
      },
    );
    this.userPool = userPool;

    let entraIdProvider: cognito.UserPoolIdentityProviderOidc | undefined;
    const cfnUserPool = userPool.node.defaultChild as cognito.CfnUserPool;

    if (entraFederationEnabled) {
      const entraClientId = ssm.StringParameter.valueForStringParameter(
        this,
        ENTRA_CLIENT_ID_PARAM,
      );
      const entraTenantId = ssm.StringParameter.valueForStringParameter(
        this,
        ENTRA_TENANT_ID_PARAM,
      );
      const entraClientSecret = cdk.SecretValue.secretsManager(
        ENTRA_CLIENT_SECRET_NAME,
      ).unsafeUnwrap();

      entraIdProvider = new cognito.UserPoolIdentityProviderOidc(
        this,
        "EntraIdProvider",
        {
          userPool,
          name: "EntraID",
          clientId: entraClientId,
          clientSecret: entraClientSecret,
          issuerUrl: `https://login.microsoftonline.com/${entraTenantId}/v2.0`,
          scopes: [
            "openid",
            "email",
            "profile",
            "User.Read",
            "GroupMember.Read.All",
          ],
          attributeRequestMethod: cognito.OidcAttributeRequestMethod.GET,
          attributeMapping: {
            email: cognito.ProviderAttribute.other("email"),
            fullname: cognito.ProviderAttribute.other("name"),
            custom: {
              "custom:entra_group_names": cognito.ProviderAttribute.other(
                "custom:entra_group_names",
              ),
              "custom:entra_group_ids": cognito.ProviderAttribute.other(
                "custom:entra_group_ids",
              ),
            },
          },
          endpoints: {
            authorization: `https://login.microsoftonline.com/${entraTenantId}/oauth2/v2.0/authorize`,
            token: `https://login.microsoftonline.com/${entraTenantId}/oauth2/v2.0/token`,
            userInfo: "https://graph.microsoft.com/v1.0/me",
            jwksUri: `https://login.microsoftonline.com/${entraTenantId}/discovery/v2.0/keys`,
          },
        },
      );

      // Inbound Federation trigger — attribute mapping only (user doesn't exist yet)
      const inboundFederationFn = new nodejs.NodejsFunction(
        this,
        "InboundFederationGroupSync",
        {
          runtime: lambda.Runtime.NODEJS_22_X,
          handler: "inboundFederationHandler",
          entry: path.join(
            __dirname,
            "lambdas/inbound-federation-group-sync.ts",
          ),
          timeout: cdk.Duration.seconds(30),
          memorySize: 256,
          environment: {
            MICROSOFT_TENANT_ID: entraTenantId,
            MICROSOFT_CLIENT_ID: entraClientId,
            MICROSOFT_CLIENT_SECRET: entraClientSecret,
          },
          bundling: {
            format: nodejs.OutputFormat.ESM,
            target: "node22",
            mainFields: ["module", "main"],
          },
        },
      );

      inboundFederationFn.addPermission("CognitoInvoke", {
        principal: new iam.ServicePrincipal("cognito-idp.amazonaws.com"),
        sourceArn: userPool.userPoolArn,
      });

      // The function bakes in a {{resolve:secretsmanager:...}} reference to the
      // client secret. Depend on the secret so CloudFormation creates it first
      // and — critically — deletes it *after* the function. Without this, a
      // rollback/delete removes the secret before the function, and the function
      // delete fails (ResourceNotFoundException), wedging the stack in
      // ROLLBACK_FAILED / DELETE_FAILED.
      inboundFederationFn.node.addDependency(entraConfigOps.clientSecret);

      cfnUserPool.addPropertyOverride("LambdaConfig.InboundFederation", {
        LambdaArn: inboundFederationFn.functionArn,
        LambdaVersion: "V1_0",
      });

      // Provider creation must wait until SSM params + Secret exist
      entraIdProvider.node.addDependency(entraConfigOps.clientIdParam);
      entraIdProvider.node.addDependency(entraConfigOps.tenantIdParam);
      entraIdProvider.node.addDependency(entraConfigOps.clientSecret);
    }

    // Domain prefixes are globally unique within an AWS region.
    const userPoolDomain = new cognito.UserPoolDomain(
      this,
      "PlatformUserPoolDomain",
      {
        userPool,
        cognitoDomain: {
          domainPrefix: `agentic-ai-platform-${cdk.Aws.ACCOUNT_ID}`,
        },
      },
    );
    this.userPoolDomain = userPoolDomain;

    // Switch the domain to "Managed login" (v2) instead of the classic hosted UI (v1).
    (userPoolDomain.node.defaultChild as cognito.CfnUserPoolDomain).addPropertyOverride(
      "ManagedLoginVersion",
      2,
    );

    const supportedIdentityProviders = [
      cognito.UserPoolClientIdentityProvider.COGNITO,
    ];
    if (entraFederationEnabled) {
      supportedIdentityProviders.push(
        cognito.UserPoolClientIdentityProvider.custom("EntraID"),
      );
    }

    const userPoolClient = new cognito.UserPoolClient(
      this,
      "AgenticAiPlatformUserPoolClient",
      {
        userPool,
        generateSecret: true,
        authFlows: {
          userPassword: true,
        },
        supportedIdentityProviders,
        oAuth: {
          flows: {
            authorizationCodeGrant: true,
          },
          scopes: [
            cognito.OAuthScope.EMAIL,
            cognito.OAuthScope.OPENID,
            cognito.OAuthScope.PHONE,
            cognito.OAuthScope.PROFILE,
          ],
          callbackUrls: [
            `http://localhost:3000/api/auth/callback/cognito`,
            `https://${props.route53domain}/api/auth/callback/cognito`,
          ],
        },
      },
    );
    if (entraIdProvider) {
      userPoolClient.node.addDependency(entraIdProvider);
    }
    this.userPoolClient = userPoolClient;

    const personaUserPoolClient = new cognito.UserPoolClient(
      this,
      "AgenticAiPlatformPersonaUserPoolClient",
      {
        userPool,
        userPoolClientName: "AgenticAiPlatformPersonaUserPoolClient",
        generateSecret: false,
        authFlows: {
          adminUserPassword: true,
          userPassword: false,
          userSrp: false,
          custom: false,
        },
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.COGNITO,
        ],
        accessTokenValidity: cdk.Duration.minutes(15),
        idTokenValidity: cdk.Duration.minutes(15),
        refreshTokenValidity: cdk.Duration.days(1),
      },
    );
    this.personaUserPoolClient = personaUserPoolClient;

    // Pre-Token Generation V2 trigger — syncs native Cognito groups.
    const preTokenFn = new nodejs.NodejsFunction(this, "PreTokenGroupSync", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "preTokenHandler",
      entry: path.join(__dirname, "lambdas/inbound-federation-group-sync.ts"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        PERSONA_CLIENT_NAME: "AgenticAiPlatformPersonaUserPoolClient",
      },
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: "node22",
        mainFields: ["module", "main"],
      },
    });

    preTokenFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:CreateGroup",
          "cognito-idp:GetGroup",
          "cognito-idp:ListUserPoolClients",
        ],
        resources: ["*"],
      }),
    );

    preTokenFn.addPermission("CognitoInvokePreToken", {
      principal: new iam.ServicePrincipal("cognito-idp.amazonaws.com"),
      sourceArn: userPool.userPoolArn,
    });

    cfnUserPool.addPropertyOverride("LambdaConfig.PreTokenGenerationConfig", {
      LambdaArn: preTokenFn.functionArn,
      LambdaVersion: "V2_0",
    });

    new cdk.CfnOutput(this, "PersonaUserPoolClientId", {
      value: personaUserPoolClient.userPoolClientId,
      description: "Cognito user pool client ID used to mint persona tokens",
      exportName: "AgenticAiPlatformPersonaUserPoolClientId",
    });

    const personaMasterPasswordSecret = new secretsmanager.Secret(
      this,
      "PersonaMasterPassword",
      {
        secretName: "agentic-ai-platform/persona/master-password",
        description:
          "Master password used to mint persona access tokens via AdminInitiateAuth",
        generateSecretString: {
          excludePunctuation: false,
          includeSpace: false,
          passwordLength: 32,
          requireEachIncludedType: true,
        },
      },
    );
    this.personaMasterPasswordSecret = personaMasterPasswordSecret;

    // Dashboard users in this group may create, update, and delete personas
    // (which choose the group claims a minted persona token carries). The
    // dashboard checks live membership via AdminListGroupsForUser.
    const platformAdminGroup = userPool.addGroup("PlatformAdminsGroup", {
      groupName: PLATFORM_ADMIN_GROUP_NAME,
      description:
        "Agentic AI Platform administrators: may create, update, and delete personas",
    });
    this.platformAdminGroup = platformAdminGroup;

    new cdk.CfnOutput(this, "PlatformAdminGroupName", {
      value: platformAdminGroup.groupName,
      description:
        "Add dashboard users to this Cognito group to let them manage personas",
    });

    new cdk.CfnOutput(this, "PersonaMasterPasswordSecretArn", {
      value: personaMasterPasswordSecret.secretArn,
      exportName: "AgenticAiPlatformPersonaMasterPasswordSecretArn",
    });

    // Apply default managed-login branding to the main user pool client.
    // useCognitoProvidedValues=true ⇒ Cognito's default look (no custom CSS/assets).
    new cognito.CfnManagedLoginBranding(this, "ManagedLoginBranding", {
      userPoolId: userPool.userPoolId,
      clientId: userPoolClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    new cdk.CfnOutput(this, "EntraFederationStatus", {
      value: entraFederationEnabled ? "ENABLED" : "DISABLED",
      description: entraFederationEnabled
        ? "Entra federation is active."
        : `OFF. To enable: 1) update ${ENTRA_CLIENT_ID_PARAM} and ${ENTRA_TENANT_ID_PARAM} via SSM Parameter Store console, 2) set the secret value at ${ENTRA_CLIENT_SECRET_NAME} via Secrets Manager console, 3) redeploy CognitoStack with --context entraFederation=true.`,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Entra config helpers
// ────────────────────────────────────────────────────────────────────────────

interface EntraConfigOps {
  clientIdParam: cr.AwsCustomResource;
  tenantIdParam: cr.AwsCustomResource;
  clientSecret: secretsmanager.Secret;
}

// Creates SSM params + Secret with placeholder values on first deploy. Subsequent deploys never overwrite them, so operator-supplied values are preserved across redeploys.
function createEntraConfigPlaceholders(scope: Construct): EntraConfigOps {
  const region = cdk.Stack.of(scope).region;
  const account = cdk.Stack.of(scope).account;

  const makeParam = (id: string, name: string) =>
    new cr.AwsCustomResource(scope, id, {
      onCreate: {
        service: "SSM",
        action: "putParameter",
        parameters: {
          Name: name,
          Value: ENTRA_PLACEHOLDER,
          Type: "String",
          Overwrite: false,
        },
        physicalResourceId: cr.PhysicalResourceId.of(name),
        // The param may already exist from a prior stack instance. Treat
        // "already exists" as success so we never clobber an operator-supplied
        // value and the create doesn't fail the whole stack.
        ignoreErrorCodesMatching: "ParameterAlreadyExists",
      },
      onDelete: {
        service: "SSM",
        action: "deleteParameter",
        parameters: { Name: name },
        ignoreErrorCodesMatching: "ParameterNotFound",
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ["ssm:PutParameter", "ssm:DeleteParameter"],
          resources: [`arn:aws:ssm:${region}:${account}:parameter${name}`],
        }),
      ]),
    });

  const clientIdParam = makeParam("EntraClientIdParam", ENTRA_CLIENT_ID_PARAM);
  const tenantIdParam = makeParam("EntraTenantIdParam", ENTRA_TENANT_ID_PARAM);

  const clientSecret = new secretsmanager.Secret(scope, "EntraClientSecret", {
    secretName: ENTRA_CLIENT_SECRET_NAME,
    description:
      "Microsoft Entra ID app registration client secret. Set the value via AWS console after first deploy.",
    secretStringValue: cdk.SecretValue.unsafePlainText(ENTRA_PLACEHOLDER),
  });

  return { clientIdParam, tenantIdParam, clientSecret };
}

