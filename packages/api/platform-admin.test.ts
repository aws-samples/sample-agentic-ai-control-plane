import {
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPlatformAdmin } from "./platform-admin.js";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@package/database", () => ({ prisma: { account: { findFirst } } }));

const cognitoMock = mockClient(CognitoIdentityProviderClient);

const SUB = "a4c89438-a0a1-7027-60ec-07bde48d521b";

beforeEach(() => {
  cognitoMock.reset();
  findFirst.mockReset().mockResolvedValue({ accountId: SUB });
  process.env.COGNITO_USER_POOL_ID = "us-east-1_test";
  process.env.PLATFORM_ADMIN_GROUP = "PlatformAdmins";
  cognitoMock
    .on(ListUsersCommand)
    .resolves({ Users: [{ Username: "EntraID_alice" }] });
});

describe("isPlatformAdmin", () => {
  it("returns true for a member of the admin group", async () => {
    cognitoMock
      .on(AdminListGroupsForUserCommand)
      .resolves({ Groups: [{ GroupName: "Other" }, { GroupName: "PlatformAdmins" }] });

    await expect(isPlatformAdmin("user_1")).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: "user_1", providerId: "cognito" },
      select: { accountId: true },
    });
    expect(cognitoMock.commandCalls(ListUsersCommand)[0].args[0].input).toMatchObject({
      UserPoolId: "us-east-1_test",
      Filter: `sub = "${SUB}"`,
    });
    // Looks groups up by the resolved username, not the sub.
    expect(
      cognitoMock.commandCalls(AdminListGroupsForUserCommand)[0].args[0].input,
    ).toMatchObject({ Username: "EntraID_alice" });
  });

  it("returns false for a signed-in user outside the admin group", async () => {
    cognitoMock
      .on(AdminListGroupsForUserCommand)
      .resolves({ Groups: [{ GroupName: "EntraGroup-123" }] });

    await expect(isPlatformAdmin("user_1")).resolves.toBe(false);
  });

  it("follows pagination of the user's groups", async () => {
    cognitoMock
      .on(AdminListGroupsForUserCommand)
      .resolvesOnce({ Groups: [{ GroupName: "Other" }], NextToken: "page2" })
      .resolvesOnce({ Groups: [{ GroupName: "PlatformAdmins" }] });

    await expect(isPlatformAdmin("user_1")).resolves.toBe(true);
    expect(cognitoMock.commandCalls(AdminListGroupsForUserCommand)).toHaveLength(2);
  });

  it("denies when the admin group is not configured", async () => {
    delete process.env.PLATFORM_ADMIN_GROUP;

    await expect(isPlatformAdmin("user_1")).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("denies a user with no Cognito account", async () => {
    findFirst.mockResolvedValue(null);

    await expect(isPlatformAdmin("user_1")).resolves.toBe(false);
    expect(cognitoMock.commandCalls(ListUsersCommand)).toHaveLength(0);
  });

  it("rejects a non-UUID sub instead of building a filter from it", async () => {
    findFirst.mockResolvedValue({ accountId: 'x" or name ^= "' });

    await expect(isPlatformAdmin("user_1")).resolves.toBe(false);
    expect(cognitoMock.commandCalls(ListUsersCommand)).toHaveLength(0);
  });

  it("denies when the sub no longer resolves to a Cognito user", async () => {
    cognitoMock.on(ListUsersCommand).resolves({ Users: [] });

    await expect(isPlatformAdmin("user_1")).resolves.toBe(false);
    expect(cognitoMock.commandCalls(AdminListGroupsForUserCommand)).toHaveLength(0);
  });
});
