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

// Lists all of the Cognito user pool's groups (name + description).
// ListGroups caps at 60 groups per page, so we follow NextToken until the
// pool is fully drained rather than truncating at the first page.
export async function listCognitoGroupsHandler(): Promise<
  z.infer<typeof OutputSchema>
> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID ?? "";
  if (!userPoolId) {
    throw new Error("COGNITO_USER_POOL_ID is not configured");
  }

  const groups: z.infer<typeof CognitoGroupSchema>[] = [];
  let nextToken: string | undefined;

  do {
    const response = await client.send(
      new ListGroupsCommand({
        UserPoolId: userPoolId,
        Limit: 60,
        NextToken: nextToken,
      }),
    );
    for (const g of response.Groups ?? []) {
      groups.push({
        name: g.GroupName ?? "",
        description: g.Description ?? null,
      });
    }
    nextToken = response.NextToken;
  } while (nextToken);

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
