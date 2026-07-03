import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

const getDatabaseUrl = async () => {
  if (process.env.NODE_ENV === "production") {
    const { DB_SECRET_ARN, DB_SCHEMA } = process.env;

    if (DB_SECRET_ARN && DB_SCHEMA) {
      const client = new SecretsManagerClient({});
      const secret = await client.send(
        new GetSecretValueCommand({ SecretId: DB_SECRET_ARN }),
      );

      if (!secret.SecretString) {
        throw new Error("Database secret is empty");
      }

      const { username, password, host, port } = JSON.parse(
        secret.SecretString,
      );

      return `postgresql://${username}:${encodeURIComponent(
        password,
      )}@${host}:${port}/${DB_SCHEMA}?sslmode=require&uselibpqcompat=true`;
    }
  }

  return (
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/agentic_ai_platform"
  );
};

const getPrismaClient = async (forceRefresh = false) => {
  // Check if we need to create a new client (doesn't exist or forced refresh)
  if (forceRefresh || !global.prisma) {
    // Disconnect old client if it exists
    if (global.prisma) {
      await global.prisma.$disconnect();
    }

    const url = await getDatabaseUrl();

    const adapter = new PrismaPg(
      { connectionString: url },
      { schema: process.env.DB_SCHEMA },
    );
    const baseClient = new PrismaClient({
      adapter,
    });

    global.prisma = baseClient;
  }

  return global.prisma;
};

const prisma = await getPrismaClient();

export default prisma;
