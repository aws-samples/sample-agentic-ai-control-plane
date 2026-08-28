import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import { SOLUTION_USER_AGENT } from "./solution";

interface LambdaToolStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  database: rds.DatabaseInstance;
  // SG that DatabaseStack pre-authorizes to reach Postgres. Attaching it to
  // the expense Lambda's ENIs is what grants DB access.
  runtimeAccessSecurityGroup: ec2.ISecurityGroup;
  dbSchema: string;
}

// Example Lambdas the agent can register as tools
export class LambdaToolStack extends cdk.Stack {
  public readonly calculatorFn: nodejs.NodejsFunction;
  public readonly expenseToolsFn: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: LambdaToolStackProps) {
    super(scope, id, props);

    this.calculatorFn = new nodejs.NodejsFunction(this, "CalculatorFn", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler",
      entry: path.join(__dirname, "lambdas/calculator.ts"),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: "node22",
        mainFields: ["module", "main"],
      },
    });

    // Expense tools Lambda — single function backing five MCP-style tools
    this.expenseToolsFn = new nodejs.NodejsFunction(this, "ExpenseToolsFn", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler",
      entry: path.join(__dirname, "lambdas/expense-tools.ts"),
      timeout: cdk.Duration.seconds(15),
      memorySize: 512,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.runtimeAccessSecurityGroup],
      environment: {
        AVP_POLICY_STORE_ID: process.env.AVP_POLICY_STORE_ID ?? "",
        DB_SECRET_ARN: props.database.secret!.secretArn,
        DB_SCHEMA: props.dbSchema,
        NODE_ENV: "production",
        USER_AGENT_STRING: SOLUTION_USER_AGENT,
      },
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: "node22",
        mainFields: ["module", "main"],
        banner:
          "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
    });

    props.database.secret!.grantRead(this.expenseToolsFn);

    // AVP IsAuthorized / IsAuthorizedWithToken for the approveExpense tool.
    this.expenseToolsFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "VerifiedPermissionsIsAuthorized",
        effect: iam.Effect.ALLOW,
        actions: [
          "verifiedpermissions:IsAuthorized",
          "verifiedpermissions:IsAuthorizedWithToken",
        ],
        resources: [
          `arn:${cdk.Aws.PARTITION}:verifiedpermissions::${cdk.Aws.ACCOUNT_ID}:policy-store/*`,
        ],
      }),
    );

    // No exportName on these outputs: nothing imports them (they're just ARNs
    // to paste into a tool registry), and a hardcoded global export name
    // collides if a second copy of this stack exists in the same account/region
    // (e.g. a manual `cdk deploy` alongside the pipeline). Letting CDK scope the
    // export per-stack keeps the informational output without the collision.
    new cdk.CfnOutput(this, "CalculatorFunctionArn", {
      value: this.calculatorFn.functionArn,
      description:
        "Calculator Lambda ARN — paste into a CUSTOM registry record",
    });

    new cdk.CfnOutput(this, "ExpenseToolsFunctionArn", {
      value: this.expenseToolsFn.functionArn,
      description:
        "Expense tools Lambda ARN — register five tools (submitExpense, listMyExpenses, listTeamExpenses, approveExpense, rejectExpense) all pointing at this ARN",
    });
  }
}
