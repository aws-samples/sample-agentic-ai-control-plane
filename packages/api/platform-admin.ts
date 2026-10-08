import {
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { prisma } from "@package/database";

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION ?? "us-east-1",
});

// Cognito `sub` values are UUIDs. Validated before being interpolated into the
// ListUsers filter expression.
const COGNITO_SUB_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Returns true only when the dashboard user is currently a member of the
// Cognito group named by PLATFORM_ADMIN_GROUP. Membership is read live from
// Cognito on every call (not from the session or a cached ID token), so
// removing someone from the group revokes access immediately. Fails closed on
// missing configuration or an unresolvable user.
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID ?? "";
  const adminGroup = process.env.PLATFORM_ADMIN_GROUP ?? "";
  if (!userPoolId || !adminGroup) {
    console.error(
      "isPlatformAdmin: COGNITO_USER_POOL_ID or PLATFORM_ADMIN_GROUP not configured; denying",
    );
    return false;
  }

  // Better Auth stores the Cognito `sub` as the account's accountId.
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "cognito" },
    select: { accountId: true },
  });
  const sub = account?.accountId;
  if (!sub || !COGNITO_SUB_PATTERN.test(sub)) {
    return false;
  }

  // Resolve sub -> Cognito username. AdminListGroupsForUser needs the real
  // username for federated users (e.g. "EntraID_..."), which sub alone isn't.
  const users = await cognitoClient.send(
    new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `sub = "${sub}"`,
      Limit: 1,
    }),
  );
  const username = users.Users?.[0]?.Username;
  if (!username) {
    return false;
  }

  let nextToken: string | undefined;
  do {
    const page = await cognitoClient.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: userPoolId,
        Username: username,
        NextToken: nextToken,
      }),
    );
    if (page.Groups?.some((g) => g.GroupName === adminGroup)) {
      return true;
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return false;
}
