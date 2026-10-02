import { call, isProcedure, ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminAuthed } from "./context.js";
import { router } from "./router.js";

const { getSession, isPlatformAdmin } = vi.hoisted(() => ({
  getSession: vi.fn(),
  isPlatformAdmin: vi.fn(),
}));

vi.mock("@package/auth/server", () => ({ auth: { api: { getSession } } }));
vi.mock("./platform-admin.js", () => ({ isPlatformAdmin }));

// Handlers must never be reached; mock the DB so nothing tries to connect.
vi.mock("@package/database", () => ({ prisma: {} }));
vi.mock("@package/database/client", () => ({ default: {} }));

const SIGNED_IN = {
  session: { id: "sess_test" },
  user: { id: "user_test", name: "Test User", email: "test@example.com" },
};

// Procedures intentionally reachable without a session.
const PUBLIC_PROCEDURES = new Set(["health"]);

// Procedures that additionally require platform-admin group membership.
const ADMIN_PROCEDURES = ["createPersona", "updatePersona", "deletePersona"];

function collectProcedures(
  node: unknown,
  path: string[] = [],
): Array<[string, unknown]> {
  if (isProcedure(node)) return [[path.join("."), node]];
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, child]) =>
      collectProcedures(child, [...path, key]),
    );
  }
  return [];
}

const procedures = collectProcedures(router);
const protectedProcedures = procedures.filter(
  ([name]) => !PUBLIC_PROCEDURES.has(name),
);
const adminProcedures = procedures.filter(([name]) =>
  ADMIN_PROCEDURES.includes(name),
);

function invoke(procedure: unknown) {
  return call(procedure as never, undefined as never, {
    context: { headers: new Headers() },
  });
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  isPlatformAdmin.mockReset().mockResolvedValue(false);
});

describe("router authentication", () => {
  it("covers the persona routes reported in the incident", () => {
    const names = protectedProcedures.map(([name]) => name);
    expect(names).toEqual(
      expect.arrayContaining(["listPersonas", ...ADMIN_PROCEDURES]),
    );
  });

  it("does not expose a persona token mint endpoint", () => {
    expect(procedures.map(([name]) => name)).not.toContain("mintPersonaToken");
  });

  it.each(protectedProcedures)(
    "%s rejects requests without a session",
    async (_name, procedure) => {
      const result = invoke(procedure);
      await expect(result).rejects.toBeInstanceOf(ORPCError);
      await expect(result).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    },
  );

  it("keeps health reachable without a session", async () => {
    const result = await call(router.health, undefined, {
      context: { headers: new Headers() },
    });
    expect(result).toEqual({ message: "healthy" });
  });
});

describe("persona management authorization", () => {
  it("finds every admin-gated persona procedure in the router", () => {
    expect(adminProcedures.map(([name]) => name).sort()).toEqual(
      [...ADMIN_PROCEDURES].sort(),
    );
  });

  it.each(adminProcedures)(
    "%s rejects signed-in users outside the admin group",
    async (_name, procedure) => {
      getSession.mockResolvedValue(SIGNED_IN);

      const result = invoke(procedure);
      await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(isPlatformAdmin).toHaveBeenCalledWith("user_test");
    },
  );

  it("lets platform admins through the admin middleware", async () => {
    getSession.mockResolvedValue(SIGNED_IN);
    isPlatformAdmin.mockResolvedValue(true);

    const probe = adminAuthed.handler(() => "ok");
    await expect(invoke(probe)).resolves.toBe("ok");
  });

  it("checks the session before admin membership", async () => {
    const probe = adminAuthed.handler(() => "ok");
    await expect(invoke(probe)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(isPlatformAdmin).not.toHaveBeenCalled();
  });
});
