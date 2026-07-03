import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

import { PrismaPg } from "@prisma/adapter-pg";
import { exec } from "child_process";
import * as path from "path";
import { promisify } from "util";
import { PrismaClient } from "./generated/prisma/client";
import { seedExampleExpenses } from "./seed";

async function cleanupGatewayOrphans(): Promise<{
  policyEngines: number;
  enginePolicies: number;
  gatewayAttachments: number;
  gatewayTargets: number;
  syncBatches: number;
  syncEvents: number;
}> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaPg(
    { connectionString: url },
    { schema: process.env.DB_SCHEMA },
  );
  const prisma = new PrismaClient({ adapter });
  try {
    // Order matters: child rows before parent rows.
    const events = await prisma.syncEvent.deleteMany();
    const batches = await prisma.syncBatch.deleteMany();
    const targets = await prisma.gatewayTarget.deleteMany();
    const attachments = await prisma.gatewayAttachment.deleteMany();
    const enginePolicies = await prisma.enginePolicy.deleteMany();
    const engines = await prisma.policyEngine.deleteMany();
    return {
      policyEngines: engines.count,
      enginePolicies: enginePolicies.count,
      gatewayAttachments: attachments.count,
      gatewayTargets: targets.count,
      syncBatches: batches.count,
      syncEvents: events.count,
    };
  } finally {
    await prisma.$disconnect();
  }
}

interface MigrationEvent {
  command?: string;
}

export const handler = async (event: MigrationEvent) => {
  const { DB_SECRET_ARN, DB_SCHEMA } = process.env;

  if (!DB_SECRET_ARN || !DB_SCHEMA) {
    throw new Error(
      "Missing required environment variables: DB_SECRET_ARN, DB_SCHEMA",
    );
  }

  const client = new SecretsManagerClient({});
  const secret = await client.send(
    new GetSecretValueCommand({ SecretId: DB_SECRET_ARN }),
  );

  if (!secret.SecretString) {
    throw new Error("Database secret is empty");
  }

  const { username, password, host, port } = JSON.parse(secret.SecretString);

  process.env.DATABASE_URL = `postgresql://${username}:${encodeURIComponent(password)}@${host}:${port}/${DB_SCHEMA}?schema=${DB_SCHEMA}&sslmode=require&uselibpqcompat=true`;

  // Available commands are:
  //   deploy: create new database if absent and apply all migrations to the existing database.
  //   reset: delete existing database, create new one, and apply all migrations. NOT for production environment.
  //   cleanup-gateway-orphans: delete PolicyEngine + EnginePolicy + GatewayAttachment + GatewayTarget rows.
  //     Use after recreating gateway/runtime in AWS to reset DB state without nuking expenses/personas.
  // If you want to add commands, please refer to: https://www.prisma.io/docs/concepts/components/prisma-migrate
  const command: string = event.command ?? "deploy";

  if (command === "cleanup-gateway-orphans") {
    const result = await cleanupGatewayOrphans();
    console.log("Cleanup complete:", JSON.stringify(result));
    return { command, result };
  }

  let options: string[] = [];

  if (command == "reset") {
    // skip confirmation and code generation
    options = ["--force", "--skip-generate"];
  }

  // Currently we don't have any direct method to invoke prisma migration programmatically.
  // As a workaround, we spawn migration script as a child process and wait for its completion.
  // Please also refer to the following GitHub issue: https://github.com/prisma/prisma/issues/4703

  // Use require.resolve to find the Prisma CLI in the bundled Lambda environment
  let prismaCliPath: string;
  try {
    prismaCliPath = path.resolve("./node_modules/prisma/build/index.js");
  } catch (error) {
    console.error("Failed to resolve prisma CLI path:", error);
    throw new Error("Prisma CLI not found in Lambda environment");
  }

  console.log("Prisma CLI path:", prismaCliPath);
  console.log("Current directory:", process.cwd());
  console.log("Environment:", process.env.LAMBDA_TASK_ROOT);

  const execAsync = promisify(exec);

  try {
    const { stdout, stderr } = await execAsync(
      `node ${prismaCliPath} migrate ${command} ${options.join(" ")}`,
    );
    console.log("Migration output:", stdout);
    if (stderr) console.error("Migration errors:", stderr);
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }

  if (command === "deploy" || command === "reset") {
    try {
      await seedExampleExpenses();
    } catch (error) {
      console.error("Example seed failed:", error);
      throw error;
    }
  }
};
