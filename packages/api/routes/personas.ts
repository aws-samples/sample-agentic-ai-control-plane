import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
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

// ─── Client singletons ──────────────────────────────────────────────────────

const COGNITO_REGION = process.env.COGNITO_REGION ?? "us-east-1";
const cognitoClient = new CognitoIdentityProviderClient({
  region: COGNITO_REGION,
});
const secretsClient = new SecretsManagerClient({ region: COGNITO_REGION });

// ─── Master password cache ──────────────────────────────────────────────────

let cachedMasterPassword: { value: string; expiresAt: number } | null = null;

// Exported so tests can reset module-level state between cases.
export function __resetPersonaHelperCachesForTest(): void {
  cachedMasterPassword = null;
}

// Returns the shared persona master password from Secrets Manager, cached in
// memory for 5 minutes.
async function getPersonaMasterPassword(): Promise<string> {
  if (cachedMasterPassword && Date.now() < cachedMasterPassword.expiresAt) {
    return cachedMasterPassword.value;
  }
  const secretArn = process.env.PERSONA_MASTER_PASSWORD_SECRET_ARN ?? "";
  if (!secretArn) {
    throw new Error("PERSONA_MASTER_PASSWORD_SECRET_ARN not configured");
  }
  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  if (!result.SecretString) {
    throw new Error("Persona master password secret has no SecretString");
  }
  cachedMasterPassword = {
    value: result.SecretString,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5-minute cache
  };
  return cachedMasterPassword.value;
}

// ─── Cognito helpers ────────────────────────────────────────────────────────

// Serializes a persona's groups to a JSON string for the Cognito custom
// attribute, formatting Entra groups as "EntraGroup-{id}" to mirror federation.
function serializePersonaGroups(
  provider: string,
  groups: Array<{ displayName?: string; id?: string }> | undefined,
): string {
  const list = (groups ?? [])
    .map((g) => {
      // For Entra personas, the backing Cognito user must carry group strings
      // formatted EXACTLY as the Pre-Token Lambda writes them for real Entra
      // federation: "EntraGroup-{entraGroupId}". This way Cedar policies
      // written for real Entra sign-ins also fire for persona simulation.
      if (provider === "entra-id") {
        const id = g.id?.trim();
        return id ? `EntraGroup-${id}` : "";
      }
      return g.displayName?.trim() ?? "";
    })
    .filter((n) => n.length > 0);
  return JSON.stringify(list);
}

// Creates the backing Cognito user for a persona and sets its permanent
// master password, suppressing any welcome email.
async function adminCreateCognitoPersonaUser(params: {
  username: string;
  name: string;
  personaGroupsJson: string;
}): Promise<void> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID ?? "";
  if (!userPoolId) {
    throw new Error("COGNITO_USER_POOL_ID not configured");
  }
  // Username IS the email — the pool has signInAliases: { email: true } and
  // email is a required standard attribute, so they must match. The admin's
  // display email (if any) lives in the Prisma row only.
  const attrs: { Name: string; Value: string }[] = [
    { Name: "email", Value: params.username },
    { Name: "email_verified", Value: "true" },
    { Name: "name", Value: params.name },
    { Name: "custom:persona_groups", Value: params.personaGroupsJson },
    { Name: "custom:persona_source", Value: "platform" },
  ];

  await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: params.username,
      MessageAction: "SUPPRESS",
      UserAttributes: attrs,
    }),
  );

  const password = await getPersonaMasterPassword();
  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: params.username,
      Password: password,
      Permanent: true,
    }),
  );
}

// Best-effort delete of a Cognito user used for rollback cleanup; swallows
// not-found and logs other failures instead of throwing.
async function tryAdminDeleteCognitoUser(username: string): Promise<void> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID ?? "";
  if (!userPoolId) {
    console.error(
      "tryAdminDeleteCognitoUser: COGNITO_USER_POOL_ID not configured; skipping cleanup",
    );
    return;
  }
  try {
    await cognitoClient.send(
      new AdminDeleteUserCommand({
        UserPoolId: userPoolId,
        Username: username,
      }),
    );
  } catch (err) {
    if (err instanceof UserNotFoundException) return;
    console.warn(`Cleanup: adminDeleteUser(${username}) failed:`, err);
  }
}

// Updates the custom:persona_groups attribute on a persona's Cognito user.
async function adminUpdateCognitoPersonaGroups(params: {
  username: string;
  personaGroupsJson: string;
}): Promise<void> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID ?? "";
  if (!userPoolId) {
    throw new Error("COGNITO_USER_POOL_ID not configured");
  }
  await cognitoClient.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: params.username,
      UserAttributes: [
        { Name: "custom:persona_groups", Value: params.personaGroupsJson },
      ],
    }),
  );
}

// Deletes a persona's backing Cognito user, throwing on failure.
async function adminDeleteCognitoPersonaUser(username: string): Promise<void> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID ?? "";
  if (!userPoolId) {
    throw new Error("COGNITO_USER_POOL_ID not configured");
  }
  await cognitoClient.send(
    new AdminDeleteUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    }),
  );
}

function generateCuid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// Cognito user pool requires the Username to be email-formatted. Personas are
// internal simulations — we synthesize an address here; SES / SMTP is never
// involved because AdminCreateUser is called with MessageAction: SUPPRESS.
const PERSONA_USERNAME_DOMAIN = "personas.agent-platform.local";

function generatePersonaUsername(): string {
  return `persona-${generateCuid()}@${PERSONA_USERNAME_DOMAIN}`;
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const PersonaGroupSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string().nullable().optional(),
});

const PersonaSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  externalId: z.string(),
  displayName: z.string(),
  email: z.string().nullable(),
  groups: z.any(),
  metadata: z.any(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type PersonaGroupInput = z.infer<typeof PersonaGroupSchema>;

export interface CreatePersonaInput {
  name: string;
  provider: string;
  externalId?: string;
  displayName?: string;
  email?: string | null;
  groups?: PersonaGroupInput[];
  metadata?: unknown;
}

export interface UpdatePersonaInput {
  id: string;
  name?: string;
  displayName?: string;
  email?: string | null;
  groups?: PersonaGroupInput[];
  metadata?: unknown;
}

export interface DeletePersonaInput {
  id: string;
}

// ─── Handler functions (pure, testable) ─────────────────────────────────────

// Persona simulation always rides Cognito's master-password mint flow, even
// for Entra-provider personas. The provider field is metadata for UI/IAM
// attribution; the JWT path is the same. For Entra personas, group strings
// are formatted "EntraGroup-{id}" so the same Cedar policy that fires for
// real Entra federation also fires for the simulated persona.
const PROVIDERS_WITH_COGNITO_BACKING = new Set(["cognito", "entra-id"]);

// Creates a persona row and, for Cognito-backed providers, its backing Cognito
// user; rolls back both the Cognito user and DB row if user creation fails.
export async function createPersonaHandler(input: CreatePersonaInput) {
  const externalId = PROVIDERS_WITH_COGNITO_BACKING.has(input.provider)
    ? generatePersonaUsername()
    : input.externalId ||
      `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const persona = await prisma.persona.create({
    data: {
      name: input.name,
      provider: input.provider,
      externalId,
      displayName: input.displayName || input.name,
      email: input.email ?? null,
      groups: (input.groups ?? []) as never,
      metadata: (input.metadata ?? {}) as never,
    },
  });

  if (PROVIDERS_WITH_COGNITO_BACKING.has(input.provider)) {
    const personaGroupsJson = serializePersonaGroups(
      input.provider,
      input.groups,
    );
    try {
      await adminCreateCognitoPersonaUser({
        username: persona.externalId,
        name: persona.name,
        personaGroupsJson,
      });
    } catch (err) {
      // Best-effort cleanup: remove half-created Cognito user, then rollback DB.
      await tryAdminDeleteCognitoUser(persona.externalId);
      await prisma.persona
        .delete({ where: { id: persona.id } })
        .catch(() => {});
      throw err;
    }
  }

  return { persona };
}

// Updates a persona row and, when groups change for a Cognito-backed provider,
// syncs the backing Cognito user's group attribute.
export async function updatePersonaHandler(input: UpdatePersonaInput) {
  const { id, ...data } = input;

  const existing = await prisma.persona.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Persona ${id} not found`);
  }

  const persona = await prisma.persona.update({
    where: { id },
    data: data as never,
  });

  if (
    PROVIDERS_WITH_COGNITO_BACKING.has(existing.provider) &&
    input.groups !== undefined
  ) {
    const personaGroupsJson = serializePersonaGroups(
      existing.provider,
      input.groups,
    );
    await adminUpdateCognitoPersonaGroups({
      username: existing.externalId,
      personaGroupsJson,
    });
  }

  return { persona };
}

// Deletes a persona and its backing Cognito user (if any); idempotent when the
// persona or Cognito user no longer exists.
export async function deletePersonaHandler(input: DeletePersonaInput) {
  const existing = await prisma.persona.findUnique({ where: { id: input.id } });
  if (!existing) {
    return { success: true };
  }

  if (PROVIDERS_WITH_COGNITO_BACKING.has(existing.provider)) {
    try {
      await adminDeleteCognitoPersonaUser(existing.externalId);
    } catch (err) {
      if (!(err instanceof UserNotFoundException)) {
        throw err;
      }
    }
  }

  await prisma.persona.delete({ where: { id: input.id } });
  return { success: true };
}

// ─── oRPC routes (thin wrappers) ────────────────────────────────────────────

// Lists personas, optionally filtered by provider, ordered by name.
export const listPersonas = os
  .route({
    method: "GET",
    path: "/personas/list",
    tags: ["personas"],
  })
  .input(
    z
      .object({
        provider: z.string().optional(),
      })
      .optional(),
  )
  .output(z.object({ personas: z.array(PersonaSchema) }))
  .handler(async ({ input }) => {
    const where: Record<string, string> = {};
    if (input?.provider) where.provider = input.provider;

    const personas = await prisma.persona.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return { personas };
  });

// Route wrapper for createPersonaHandler.
export const createPersona = os
  .route({
    method: "POST",
    path: "/personas/create",
    tags: ["personas"],
  })
  .input(
    z.object({
      name: z.string().min(1, "Name is required").max(128),
      provider: z.string().min(1, "Provider is required"),
      externalId: z.string().optional(),
      displayName: z.string().optional(),
      email: z.string().nullable().optional(),
      groups: z.array(PersonaGroupSchema).optional(),
      metadata: z.any().optional(),
    }),
  )
  .output(z.object({ persona: PersonaSchema }))
  .handler(async ({ input }) => createPersonaHandler(input));

// Route wrapper for updatePersonaHandler.
export const updatePersona = os
  .route({
    method: "PATCH",
    path: "/personas/update",
    tags: ["personas"],
  })
  .input(
    z.object({
      id: z.string().min(1, "Persona ID is required"),
      name: z.string().min(1).max(128).optional(),
      displayName: z.string().min(1).optional(),
      email: z.string().nullable().optional(),
      groups: z.array(PersonaGroupSchema).optional(),
      metadata: z.any().optional(),
    }),
  )
  .output(z.object({ persona: PersonaSchema }))
  .handler(async ({ input }) => updatePersonaHandler(input));

// Route wrapper for deletePersonaHandler.
export const deletePersona = os
  .route({
    method: "DELETE",
    path: "/personas/delete",
    tags: ["personas"],
  })
  .input(
    z.object({
      id: z.string().min(1, "Persona ID is required"),
    }),
  )
  .output(
    z.object({
      success: z.boolean(),
    }),
  )
  .handler(async ({ input }) => deletePersonaHandler(input));

export const personasRouter = {
  listPersonas,
  createPersona,
  updatePersona,
  deletePersona,
};
