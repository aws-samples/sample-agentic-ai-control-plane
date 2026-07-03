import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  AdminInitiateAuthCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

vi.mock("@package/database", () => ({
  prisma: {
    persona: { findUnique: vi.fn() },
  },
}));

// See personas.test.ts for why these casts are needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cognitoMock = mockClient(CognitoIdentityProviderClient as never) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const secretsMock = mockClient(SecretsManagerClient as never) as any;

beforeEach(async () => {
  vi.clearAllMocks();
  cognitoMock.reset();
  secretsMock.reset();
  process.env.COGNITO_USER_POOL_ID = "us-east-1_TEST";
  process.env.PERSONA_USER_POOL_CLIENT_ID = "persona-client-abc";
  process.env.PERSONA_MASTER_PASSWORD_SECRET_ARN =
    "arn:aws:secretsmanager:us-east-1:000:secret:test";
  secretsMock
    .on(GetSecretValueCommand)
    .resolves({ SecretString: "MasterPassword123!" });

  const mod = await import("./mint-persona-token.js");
  mod.__resetMintTokenCachesForTest();
});

describe("mintPersonaTokenHandler", () => {
  it("returns access token on happy path", async () => {
    const { mintPersonaTokenHandler } = await import(
      "./mint-persona-token.js"
    );
    const { prisma } = await import("@package/database");

    (prisma.persona.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p1",
      provider: "cognito",
      externalId: "persona-p1",
    });
    cognitoMock.on(AdminInitiateAuthCommand).resolves({
      AuthenticationResult: {
        AccessToken: "abc.def.ghi",
        ExpiresIn: 3600,
      },
    });

    const result = await mintPersonaTokenHandler({ personaId: "p1" });

    expect(result.accessToken).toBe("abc.def.ghi");
    expect(result.expiresIn).toBe(3600);

    const calls = cognitoMock.commandCalls(AdminInitiateAuthCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.AuthFlow).toBe("ADMIN_USER_PASSWORD_AUTH");
    expect(calls[0].args[0].input.ClientId).toBe("persona-client-abc");
    expect(calls[0].args[0].input.AuthParameters?.USERNAME).toBe(
      "persona-p1",
    );
    expect(calls[0].args[0].input.AuthParameters?.PASSWORD).toBe(
      "MasterPassword123!",
    );
  });

  it("mints for entra-id provider personas via the same Cognito flow", async () => {
    const { mintPersonaTokenHandler } = await import(
      "./mint-persona-token.js"
    );
    const { prisma } = await import("@package/database");

    cognitoMock.on(AdminInitiateAuthCommand).resolves({
      AuthenticationResult: {
        AccessToken: "entra-persona-token",
        ExpiresIn: 3600,
      },
    });

    (prisma.persona.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p2",
      provider: "entra-id",
      externalId: "persona-abc@personas.agent-platform.local",
    });

    const result = await mintPersonaTokenHandler({ personaId: "p2" });
    expect(result.accessToken).toBe("entra-persona-token");
  });

  it("throws when persona not found", async () => {
    const { mintPersonaTokenHandler } = await import(
      "./mint-persona-token.js"
    );
    const { prisma } = await import("@package/database");

    (prisma.persona.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    await expect(
      mintPersonaTokenHandler({ personaId: "ghost" }),
    ).rejects.toThrow(/not found/i);
  });

  it("throws when AdminInitiateAuth returns no AuthenticationResult", async () => {
    const { mintPersonaTokenHandler } = await import(
      "./mint-persona-token.js"
    );
    const { prisma } = await import("@package/database");

    (prisma.persona.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p9",
      provider: "cognito",
      externalId: "persona-p9",
    });
    cognitoMock.on(AdminInitiateAuthCommand).resolves({});

    await expect(
      mintPersonaTokenHandler({ personaId: "p9" }),
    ).rejects.toThrow(/AuthenticationResult/i);
  });
});
