import {
  AdminInitiateAuthCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { os } from "@orpc/server";
import { prisma } from "@package/database";
import { z } from "zod";

const REGION = process.env.COGNITO_REGION ?? "us-east-1";

const cognito = new CognitoIdentityProviderClient({ region: REGION });
const secrets = new SecretsManagerClient({ region: REGION });

let cachedPw: { value: string; expiresAt: number } | null = null;

// Exported so tests can reset module-level state between cases.
export function __resetMintTokenCachesForTest(): void {
  cachedPw = null;
}

// Returns the shared persona master password from Secrets Manager, caching it
// in memory for 5 minutes to avoid a fetch on every token mint.
async function getMasterPassword(): Promise<string> {
  if (cachedPw && Date.now() < cachedPw.expiresAt) return cachedPw.value;
  const secretArn = process.env.PERSONA_MASTER_PASSWORD_SECRET_ARN ?? "";
  if (!secretArn) {
    throw new Error("PERSONA_MASTER_PASSWORD_SECRET_ARN not configured");
  }
  const result = await secrets.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  if (!result.SecretString) {
    throw new Error("Master password secret has no SecretString");
  }
  cachedPw = {
    value: result.SecretString,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  return cachedPw.value;
}

export interface MintPersonaTokenInput {
  personaId: string;
}

// Authenticates the persona's Cognito user via ADMIN_USER_PASSWORD_AUTH and
// returns its access token plus expiry for calling AgentCore runtimes.
export async function mintPersonaTokenHandler(input: MintPersonaTokenInput) {
  const userPoolId = process.env.COGNITO_USER_POOL_ID ?? "";
  const personaClientId = process.env.PERSONA_USER_POOL_CLIENT_ID ?? "";

  if (!userPoolId || !personaClientId) {
    throw new Error(
      "COGNITO_USER_POOL_ID or PERSONA_USER_POOL_CLIENT_ID not configured",
    );
  }

  const persona = await prisma.persona.findUnique({
    where: { id: input.personaId },
  });
  if (!persona) {
    throw new Error(`Persona ${input.personaId} not found`);
  }

  const password = await getMasterPassword();
  let response;
  try {
    response = await cognito.send(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: personaClientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: persona.externalId,
          PASSWORD: password,
        },
      }),
    );
  } catch (err) {
    // Orphaned persona: the DB row exists but its backing Cognito user was
    // never created (or was deleted out from under us). Surface an actionable
    // message instead of a raw UserNotFoundException 500, since the fix is to
    // recreate the persona so the app reprovisions the Cognito user.
    if (err instanceof UserNotFoundException) {
      throw new Error(
        `Persona "${persona.name}" (${persona.id}) has no backing Cognito user ` +
          `for username ${persona.externalId}. The persona is out of sync with ` +
          `the user pool — delete and recreate it to reprovision the Cognito user.`,
      );
    }
    throw err;
  }

  // Return the access token. AgentCore Runtime's Cognito authorizer accepts
  // access tokens (token_use=access) but rejects ID tokens with 401. Profile
  // claims (email/name) aren't in the access token by default — the
  // interceptor falls back to cognito:username for caller identity.
  const accessToken = response.AuthenticationResult?.AccessToken;
  const expiresIn = response.AuthenticationResult?.ExpiresIn;
  if (!accessToken || !expiresIn) {
    throw new Error("AdminInitiateAuth returned no AuthenticationResult");
  }

  return { accessToken, expiresIn };
}

export const mintPersonaToken = os
  .route({
    method: "POST",
    path: "/personas/mint-token",
    tags: ["personas"],
  })
  .input(z.object({ personaId: z.string().min(1) }))
  .output(
    z.object({
      accessToken: z.string(),
      expiresIn: z.number(),
    }),
  )
  .handler(async ({ input }) => mintPersonaTokenHandler(input));

export const mintPersonaTokenRouter = { mintPersonaToken };
