import * as cdk from "aws-cdk-lib";
import * as triggers from "aws-cdk-lib/triggers";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as rds from "aws-cdk-lib/aws-rds";

import { Construct } from "constructs";
import { join } from "path";

interface DatabaseStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  DB_SCHEMA: string;
}

// Provisions the encrypted RDS PostgreSQL instance, its access security groups, and a Lambda-backed custom resource that runs Prisma migrations on deploy.
export class DatabaseStack extends cdk.Stack {
  public readonly database: rds.DatabaseInstance;
  public readonly databaseSecurityGroup: ec2.SecurityGroup;
  // Pre-authorized SG for AgentCore Runtime ENIs. Runtime stacks attach this
  // SG to their ENIs to gain Postgres access without creating a cyclic
  // cross-stack dependency on DatabaseStack.
  public readonly runtimeAccessSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // **** RDS PostgreSQL ****

    const dbSecurityGroup = new ec2.SecurityGroup(
      this,
      "DatabaseSecurityGroup",
      {
        vpc: props.vpc,
        description: "Security group for RDS PostgreSQL instance",
        allowAllOutbound: true,
      },
    );
    this.databaseSecurityGroup = dbSecurityGroup;

    const database = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17_5,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
      storageEncrypted: true,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSecurityGroup],
      databaseName: props.DB_SCHEMA,
      credentials: rds.Credentials.fromGeneratedSecret("postgres"),
      allocatedStorage: 20,
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      iamAuthentication: true,
    });

    this.database = database;

    // Security group for Lambda functions
    const lambdaSecurityGroup = new ec2.SecurityGroup(
      this,
      "Lambda Security Group",
      {
        vpc: props.vpc,
        description: "Security group for Lambda function",
        allowAllOutbound: true,
      },
    );

    // Allow Lambda to connect to the database
    dbSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      "Allow Lambda to connect to database",
    );

    // Pre-create a SG for AgentCore Runtime use and authorize it to reach RDS.
    const runtimeAccessSg = new ec2.SecurityGroup(this, "RuntimeAccessSg", {
      vpc: props.vpc,
      description: "Attached to AgentCore Runtime ENIs; pre-authorized for RDS",
      allowAllOutbound: true,
    });
    dbSecurityGroup.addIngressRule(
      runtimeAccessSg,
      ec2.Port.tcp(5432),
      "Allow AgentCore Runtimes (via runtime access SG) to reach RDS",
    );
    this.runtimeAccessSecurityGroup = runtimeAccessSg;

    const databasePackagePath = join(__dirname, "../../../packages/database");

    const migrationFunction = new lambda.DockerImageFunction(
      this,
      "PrismaMigration",
      {
        code: lambda.DockerImageCode.fromImageAsset(databasePackagePath, {
          file: "Dockerfile.migrate",
          platform: ecr_assets.Platform.LINUX_ARM64,
        }),
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: cdk.Duration.minutes(5),
        vpc: props.vpc,
        securityGroups: [lambdaSecurityGroup],
        environment: {
          DB_SECRET_ARN: database.secret!.secretArn,
          DB_SCHEMA: props.DB_SCHEMA,
        },
      },
    );

    database.secret!.grantRead(migrationFunction);

    // Auto-invoke the database migration Lambda on every stack create/update.
    const runMigrations = new triggers.Trigger(this, "RunMigrations", {
      handler: migrationFunction,
      timeout: cdk.Duration.minutes(6),
      executeAfter: [database],
    });
    runMigrations.node.addDependency(migrationFunction);
  }
}
