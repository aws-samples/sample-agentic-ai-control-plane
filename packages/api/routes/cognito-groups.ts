import {
  CognitoIdentityProviderClient,
  ListGroupsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { os } from "@orpc/server";
import { z } from "zod";

const REGION = process.env.COGNITO_REGION ?? "us-east-1";
const client = new CognitoIdentityProviderClient({ region: REGION });

const CognitoGroupSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
});

const OutputSchema = z.object({ groups: z.array(CognitoGroupSchema) });

// Lists the Cognito user pool's groups (name + description), up to 60.
export async function listCognitoGroupsHandler(): Promise<
  z.infer<typeof OutputSchema>
> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID ?? "";
  if (!userPoolId) {
    throw new Error("COGNITO_USER_POOL_ID is not configured");
  }
  // TODO: paginate when pools with >60 groups appear; ListGroups caps at 60/page.
  const response = await client.send(
    new ListGroupsCommand({ UserPoolId: userPoolId, Limit: 60 }),
  );
  const groups = (response.Groups ?? []).map((g) => ({
    name: g.GroupName ?? "",
    description: g.Description ?? null,
  }));
  return { groups };
}

export const listCognitoGroups = os
  .route({
    method: "GET",
    path: "/cognito/groups",
    tags: ["cognito"],
  })
  .output(OutputSchema)
  .handler(listCognitoGroupsHandler);

export const cognitoGroupsRouter = { listCognitoGroups };
