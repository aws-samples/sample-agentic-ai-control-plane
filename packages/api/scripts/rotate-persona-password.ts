#!/usr/bin/env -S npx tsx
/**
 * Rotates the persona master password:
 *   1. Generates a new strong password.
 *   2. Updates the Secrets Manager secret.
 *   3. Calls AdminSetUserPassword on every persona user in the pool.
 *
 * Run (from repo root):
 *   npx tsx packages/api/scripts/rotate-persona-password.ts
 *
 * Env required:
 *   COGNITO_USER_POOL_ID
 *   PERSONA_MASTER_PASSWORD_SECRET_ARN
 *   COGNITO_REGION (optional, default us-east-1)
 */

import {
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  PutSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { randomBytes } from "node:crypto";

const REGION = process.env.COGNITO_REGION ?? "us-east-1";
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? "";
const SECRET_ARN = process.env.PERSONA_MASTER_PASSWORD_SECRET_ARN ?? "";

function generatePassword(): string {
  // 32+ char base64url with guaranteed lower/upper/digit/symbol classes so
  // the pool's password policy (upper, digit, symbol, length >= 8) is met.
  const buf = randomBytes(24).toString("base64url");
  return `A1!${buf}`;
}

async function main() {
  if (!USER_POOL_ID || !SECRET_ARN) {
    throw new Error(
      "Set COGNITO_USER_POOL_ID and PERSONA_MASTER_PASSWORD_SECRET_ARN",
    );
  }
  const cognito = new CognitoIdentityProviderClient({ region: REGION });
  const secrets = new SecretsManagerClient({ region: REGION });

  const newPassword = generatePassword();

  console.log("Updating secret...");
  await secrets.send(
    new PutSecretValueCommand({
      SecretId: SECRET_ARN,
      SecretString: newPassword,
    }),
  );

  console.log("Enumerating persona users...");
  const users: string[] = [];
  let paginationToken: string | undefined;
  do {
    const response = await cognito.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Filter: 'email ^= "persona-"',
        Limit: 60,
        PaginationToken: paginationToken,
      }),
    );
    for (const u of response.Users ?? []) {
      if (u.Username) users.push(u.Username);
    }
    paginationToken = response.PaginationToken;
  } while (paginationToken);

  console.log(`Found ${users.length} persona users; updating passwords...`);
  for (const username of users) {
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        Password: newPassword,
        Permanent: true,
      }),
    );
    console.log(`  - ${username}`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
