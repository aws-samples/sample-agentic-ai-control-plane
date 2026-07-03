import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
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

vi.mock("@package/database", () => ({
  prisma: {
    persona: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Cast to `never` because aws-sdk-client-mock's type param doesn't align with
// the AWS SDK client classes across @smithy/types version skew in this repo.
// The runtime behaviour is unaffected — this is purely a TS compatibility shim.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cognitoMock = mockClient(CognitoIdentityProviderClient as never) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const secretsMock = mockClient(SecretsManagerClient as never) as any;

beforeEach(async () => {
  vi.clearAllMocks();
  cognitoMock.reset();
  secretsMock.reset();
  process.env.COGNITO_USER_POOL_ID = "us-east-1_TEST";
  process.env.PERSONA_MASTER_PASSWORD_SECRET_ARN =
    "arn:aws:secretsmanager:us-east-1:000:secret:test";
  secretsMock
    .on(GetSecretValueCommand)
    .resolves({ SecretString: "MasterPassword123!" });

  const mod = await import("./personas.js");
  mod.__resetPersonaHelperCachesForTest();
});

describe("createPersonaHandler - cognito provider", () => {
  it("creates DB row and Cognito user on success", async () => {
    const { createPersonaHandler } = await import("./personas.js");
    const { prisma } = await import("@package/database");

    (prisma.persona.create as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "p1",
        name: data.name,
        provider: data.provider,
        externalId: data.externalId,
        displayName: data.displayName,
        email: data.email ?? null,
        groups: data.groups ?? [],
        metadata: data.metadata ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    cognitoMock.on(AdminCreateUserCommand).resolves({});
    cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

    const result = await createPersonaHandler({
      name: "Alice",
      provider: "cognito",
      email: "alice@example.com",
      groups: [{ id: "g1", displayName: "Designers" }],
    });

    expect(result.persona.provider).toBe("cognito");
    expect(result.persona.externalId).toMatch(/^persona-/);

    const createCalls = cognitoMock.commandCalls(AdminCreateUserCommand);
    expect(createCalls).toHaveLength(1);
    const attrs = createCalls[0].args[0].input.UserAttributes ?? [];
    const personaGroupsAttr = attrs.find(
      (a: { Name?: string; Value?: string }) =>
        a.Name === "custom:persona_groups",
    );
    expect(personaGroupsAttr?.Value).toBe('["Designers"]');
    const nameAttr = attrs.find(
      (a: { Name?: string }) => a.Name === "name",
    );
    expect(nameAttr?.Value).toBe("Alice");
    // Cognito's email attribute must equal the Username (pool uses email as
    // sign-in alias). Admin-entered emails are stored in Prisma only.
    const emailAttr = attrs.find(
      (a: { Name?: string }) => a.Name === "email",
    );
    expect(emailAttr?.Value).toBe(result.persona.externalId);
    expect(result.persona.externalId).toMatch(
      /^persona-[a-z0-9]+@personas\.agent-platform\.local$/,
    );

    const setPwCalls = cognitoMock.commandCalls(AdminSetUserPasswordCommand);
    expect(setPwCalls).toHaveLength(1);
    expect(setPwCalls[0].args[0].input.Password).toBe("MasterPassword123!");
    expect(setPwCalls[0].args[0].input.Permanent).toBe(true);
  });

  it("rolls back DB and cleans up Cognito when AdminSetUserPassword fails", async () => {
    const { createPersonaHandler } = await import("./personas.js");
    const { prisma } = await import("@package/database");

    (prisma.persona.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p2",
      name: "Bob",
      provider: "cognito",
      externalId: "persona-p2",
      displayName: "Bob",
      email: null,
      groups: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    (prisma.persona.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    cognitoMock.on(AdminCreateUserCommand).resolves({});
    cognitoMock
      .on(AdminSetUserPasswordCommand)
      .rejects(new Error("InvalidPassword"));
    cognitoMock.on(AdminDeleteUserCommand).resolves({});

    await expect(
      createPersonaHandler({
        name: "Bob",
        provider: "cognito",
        groups: [],
      }),
    ).rejects.toThrow("InvalidPassword");

    expect(cognitoMock.commandCalls(AdminDeleteUserCommand)).toHaveLength(1);
    expect(prisma.persona.delete).toHaveBeenCalledWith({
      where: { id: "p2" },
    });
  });

  it("provisions a Cognito backing user for entra-id personas with EntraGroup-{id} groups", async () => {
    const { createPersonaHandler } = await import("./personas.js");
    const { prisma } = await import("@package/database");

    (prisma.persona.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p3",
      name: "Carol",
      provider: "entra-id",
      externalId: "persona-entra@personas.agent-platform.local",
      displayName: "Carol",
      email: null,
      groups: [{ id: "729c9802-aaaa", displayName: "Sales" }],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    cognitoMock.on(AdminCreateUserCommand).resolves({});
    cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

    await createPersonaHandler({
      name: "Carol",
      provider: "entra-id",
      groups: [{ id: "729c9802-aaaa", displayName: "Sales" }],
    });

    const createCalls = cognitoMock.commandCalls(AdminCreateUserCommand);
    expect(createCalls).toHaveLength(1);
    const attrs = createCalls[0].args[0].input.UserAttributes ?? [];
    const groupsAttr = attrs.find(
      (a: { Name?: string }) => a.Name === "custom:persona_groups",
    );
    expect(groupsAttr?.Value).toBe(
      JSON.stringify(["EntraGroup-729c9802-aaaa"]),
    );
  });
});

describe("updatePersonaHandler - cognito provider", () => {
  it("syncs groups attribute to Cognito when groups change", async () => {
    const { updatePersonaHandler } = await import("./personas.js");
    const { prisma } = await import("@package/database");

    (prisma.persona.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p4",
      provider: "cognito",
      externalId: "persona-p4",
    });
    (prisma.persona.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p4",
      name: "Alice",
      provider: "cognito",
      externalId: "persona-p4",
      displayName: "Alice",
      email: null,
      groups: [{ id: "g2", displayName: "Executives" }],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

    await updatePersonaHandler({
      id: "p4",
      groups: [{ id: "g2", displayName: "Executives" }],
    });

    const calls = cognitoMock.commandCalls(AdminUpdateUserAttributesCommand);
    expect(calls).toHaveLength(1);
    const attrs = calls[0].args[0].input.UserAttributes ?? [];
    expect(
      attrs.find(
        (a: { Name?: string }) => a.Name === "custom:persona_groups",
      )?.Value,
    ).toBe('["Executives"]');
  });

  it("does not call Cognito when groups not in update input", async () => {
    const { updatePersonaHandler } = await import("./personas.js");
    const { prisma } = await import("@package/database");

    (prisma.persona.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p5",
      provider: "cognito",
      externalId: "persona-p5",
    });
    (prisma.persona.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p5",
      name: "New Name",
      provider: "cognito",
      externalId: "persona-p5",
      displayName: "New Name",
      email: null,
      groups: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await updatePersonaHandler({ id: "p5", name: "New Name" });

    expect(
      cognitoMock.commandCalls(AdminUpdateUserAttributesCommand),
    ).toHaveLength(0);
  });
});

describe("deletePersonaHandler - cognito provider", () => {
  it("deletes Cognito user then DB row", async () => {
    const { deletePersonaHandler } = await import("./personas.js");
    const { prisma } = await import("@package/database");

    (prisma.persona.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p6",
      provider: "cognito",
      externalId: "persona-p6",
    });
    (prisma.persona.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    cognitoMock.on(AdminDeleteUserCommand).resolves({});

    const result = await deletePersonaHandler({ id: "p6" });

    expect(result.success).toBe(true);
    expect(cognitoMock.commandCalls(AdminDeleteUserCommand)).toHaveLength(1);
    expect(prisma.persona.delete).toHaveBeenCalledWith({
      where: { id: "p6" },
    });
  });

  it("swallows UserNotFoundException and still deletes DB row", async () => {
    const { deletePersonaHandler } = await import("./personas.js");
    const { prisma } = await import("@package/database");

    (prisma.persona.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p7",
      provider: "cognito",
      externalId: "persona-p7",
    });
    (prisma.persona.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    cognitoMock
      .on(AdminDeleteUserCommand)
      .rejects(
        new UserNotFoundException({ $metadata: {}, message: "not found" }),
      );

    const result = await deletePersonaHandler({ id: "p7" });

    expect(result.success).toBe(true);
    expect(prisma.persona.delete).toHaveBeenCalled();
  });

  it("aborts DB delete on non-UserNotFound Cognito error", async () => {
    const { deletePersonaHandler } = await import("./personas.js");
    const { prisma } = await import("@package/database");

    (prisma.persona.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p8",
      provider: "cognito",
      externalId: "persona-p8",
    });
    cognitoMock
      .on(AdminDeleteUserCommand)
      .rejects(new Error("InternalError"));

    await expect(deletePersonaHandler({ id: "p8" })).rejects.toThrow(
      "InternalError",
    );

    expect(prisma.persona.delete).not.toHaveBeenCalled();
  });
});
