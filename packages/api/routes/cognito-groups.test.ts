import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  CognitoIdentityProviderClient,
  ListGroupsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { listCognitoGroupsHandler } from "./cognito-groups";

const cognitoMock = mockClient(CognitoIdentityProviderClient);

beforeEach(() => {
  cognitoMock.reset();
  process.env.COGNITO_USER_POOL_ID = "us-east-1_TEST";
});

describe("listCognitoGroups", () => {
  it("returns groups from Cognito", async () => {
    cognitoMock.on(ListGroupsCommand).resolves({
      Groups: [
        { GroupName: "Designers", Description: "Design team" },
        { GroupName: "Executives", Description: undefined },
      ],
    });

    const result = await listCognitoGroupsHandler();

    expect(result.groups).toEqual([
      { name: "Designers", description: "Design team" },
      { name: "Executives", description: null },
    ]);
  });

  it("returns empty array when no groups", async () => {
    cognitoMock.on(ListGroupsCommand).resolves({ Groups: [] });
    const result = await listCognitoGroupsHandler();
    expect(result.groups).toEqual([]);
  });
});
