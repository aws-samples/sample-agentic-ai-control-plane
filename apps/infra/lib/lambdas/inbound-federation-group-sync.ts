import {
  CognitoIdentityProviderClient,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  CreateGroupCommand,
  GetGroupCommand,
  ListUserPoolClientsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { buildPersonaPreTokenResponse } from "./pre-token-persona";

// Direct env var (legacy / override). When set, skips the runtime lookup.
const PERSONA_CLIENT_ID_ENV = process.env.PERSONA_CLIENT_ID ?? "";
// Name of the Cognito app client used for persona token minting.
// We look up its ID at runtime via ListUserPoolClients to avoid creating
// a CDK stack-time dependency cycle (UserPool -> Trigger -> Lambda ->
// PersonaClient -> UserPool).
const PERSONA_CLIENT_NAME = process.env.PERSONA_CLIENT_NAME ?? "";

const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID ?? "";
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? "";
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? "";

const cognitoClient = new CognitoIdentityProviderClient({});

// Cached after first successful lookup to avoid listing on every invocation.
let cachedPersonaClientId: string | null = null;

async function resolvePersonaClientId(userPoolId: string): Promise<string> {
  if (PERSONA_CLIENT_ID_ENV) return PERSONA_CLIENT_ID_ENV;
  if (cachedPersonaClientId !== null) return cachedPersonaClientId;
  if (!PERSONA_CLIENT_NAME) {
    cachedPersonaClientId = "";
    return "";
  }
  try {
    let nextToken: string | undefined;
    do {
      const response = await cognitoClient.send(
        new ListUserPoolClientsCommand({
          UserPoolId: userPoolId,
          MaxResults: 60,
          NextToken: nextToken,
        }),
      );
      const match = (response.UserPoolClients ?? []).find(
        (c) => c.ClientName === PERSONA_CLIENT_NAME,
      );
      if (match?.ClientId) {
        cachedPersonaClientId = match.ClientId;
        return match.ClientId;
      }
      nextToken = response.NextToken;
    } while (nextToken);
  } catch (err) {
    console.warn(
      "Failed to list user pool clients to resolve persona client:",
      PERSONA_CLIENT_NAME,
      err,
    );
  }
  cachedPersonaClientId = "";
  return "";
}

interface EntraGroup {
  id: string;
  displayName: string;
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function getStringClaim(
  claims: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = claims[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (Array.isArray(value)) {
      const firstString = value.find(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      );
      if (firstString) {
        return firstString;
      }
    }
  }

  return undefined;
}

async function getGraphAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    client_secret: MICROSOFT_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph token acquisition failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

async function fetchUserGroupsFromGraph(userIdentifier: string): Promise<EntraGroup[]> {
  const token = await getGraphAccessToken();
  const groups: EntraGroup[] = [];

  let url: string | null =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userIdentifier)}/transitiveMemberOf/microsoft.graph.group?$select=id,displayName&$top=999&$count=true`;

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ConsistencyLevel: "eventual",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Graph API failed (${response.status}): ${errorText}`);
      break;
    }

    const data = (await response.json()) as {
      value: Array<{ id: string; displayName: string }>;
      "@odata.nextLink"?: string;
    };

    for (const member of data.value) {
      if (member.displayName) {
        groups.push({ id: member.id, displayName: member.displayName });
      }
    }

    url = data["@odata.nextLink"] ?? null;
  }

  return groups;
}

async function ensureCognitoGroupExists(
  userPoolId: string,
  groupName: string,
  entraGroupId: string,
): Promise<void> {
  try {
    await cognitoClient.send(
      new GetGroupCommand({ GroupName: groupName, UserPoolId: userPoolId }),
    );
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "ResourceNotFoundException") {
      await cognitoClient.send(
        new CreateGroupCommand({
          GroupName: groupName,
          UserPoolId: userPoolId,
          Description: `Synced from Entra ID group ${entraGroupId}`,
        }),
      );
      console.log(`Created Cognito group: ${groupName}`);
    } else {
      throw err;
    }
  }
}

async function getCurrentCognitoGroups(userPoolId: string, username: string): Promise<string[]> {
  const groups: string[] = [];
  let nextToken: string | undefined;

  do {
    const response = await cognitoClient.send(
      new AdminListGroupsForUserCommand({
        Username: username,
        UserPoolId: userPoolId,
        NextToken: nextToken,
      }),
    );
    for (const group of response.Groups ?? []) {
      if (group.GroupName) groups.push(group.GroupName);
    }
    nextToken = response.NextToken;
  } while (nextToken);

  return groups;
}

async function syncCognitoGroups(
  userPoolId: string,
  username: string,
  entraGroups: EntraGroup[],
): Promise<void> {
  const desiredGroupNames = new Set(
    entraGroups.filter((g) => g.displayName).map((g) => g.displayName),
  );
  const currentGroups = new Set(await getCurrentCognitoGroups(userPoolId, username));

  for (const group of entraGroups) {
    if (!group.displayName) continue;
    if (!currentGroups.has(group.displayName)) {
      await ensureCognitoGroupExists(userPoolId, group.displayName, group.id);
      await cognitoClient.send(
        new AdminAddUserToGroupCommand({
          Username: username,
          GroupName: group.displayName,
          UserPoolId: userPoolId,
        }),
      );
      console.log(`Added user ${username} to group: ${group.displayName}`);
    }
  }

  for (const existingGroup of currentGroups) {
    if (!desiredGroupNames.has(existingGroup)) {
      try {
        const groupDetail = await cognitoClient.send(
          new GetGroupCommand({ GroupName: existingGroup, UserPoolId: userPoolId }),
        );
        const desc = groupDetail.Group?.Description ?? "";
        if (desc.startsWith("Synced from Entra ID group")) {
          await cognitoClient.send(
            new AdminRemoveUserFromGroupCommand({
              Username: username,
              GroupName: existingGroup,
              UserPoolId: userPoolId,
            }),
          );
          console.log(`Removed user ${username} from stale group: ${existingGroup}`);
        }
      } catch (err) {
        console.warn("Failed to check/remove group:", existingGroup, err);
      }
    }
  }
}

/**
 * Inbound Federation trigger: attribute mapping + inline groups.
 * Fires BEFORE user creation — cannot call Cognito admin APIs here.
 * Stores groups as custom:user_groups (truncated to 2048 chars if needed).
 * The Post-Auth trigger handles native Cognito groups separately.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const inboundFederationHandler = async (event: any) => {
  console.log("Inbound Federation trigger invoked", JSON.stringify({
    providerName: event.request.providerName,
    providerType: event.request.providerType,
    userName: event.userName,
  }));

  const { providerType, attributes } = event.request;

  let userAttributesFromIdp: Record<string, unknown> = {};
  if (providerType === "SAML") {
    userAttributesFromIdp = attributes.samlResponse ?? {};
  } else {
    userAttributesFromIdp = {
      ...attributes,
      ...(attributes.userInfo ?? {}),
      ...(attributes.idToken ?? {}),
    };
  }

  const attributesToMap: Record<string, string> = {};

  const sub = getStringClaim(userAttributesFromIdp, "sub");
  if (sub) attributesToMap.sub = sub;

  // Entra can expose the user's email under different claim names depending
  // on token type and tenant configuration. Cognito requires the standard
  // `email` attribute because the user pool marks it as required.
  const email = getStringClaim(
    userAttributesFromIdp,
    "email",
    "mail",
    "preferred_username",
    "userPrincipalName",
    "upn",
  );
  if (email) {
    attributesToMap.email = email;
    attributesToMap.email_verified = "true";
  }

  const fullName = getStringClaim(
    userAttributesFromIdp,
    "name",
    "displayName",
    "fullname",
    "given_name",
    "preferred_username",
  );
  if (fullName) {
    // CDK exposes the Cognito standard `name` attribute as `fullname`.
    // Set both keys here so the inbound federation trigger works whether
    // Cognito validates against the raw attribute name or the CDK alias.
    attributesToMap.fullname = fullName;
    attributesToMap.name = fullName;
  }

  // Fetch groups and store as custom attributes
  const idToken = attributes.idToken as Record<string, unknown> | undefined;
  const userInfo = attributes.userInfo as Record<string, unknown> | undefined;
  const graphUserId =
    getStringClaim(idToken ?? {}, "oid") ??
    getStringClaim(userInfo ?? {}, "oid") ??
    getStringClaim(idToken ?? {}, "userPrincipalName", "preferred_username", "email") ??
    getStringClaim(userInfo ?? {}, "userPrincipalName", "mail", "email");

  let entraGroups: EntraGroup[] = [];
  try {
    if (graphUserId) {
      entraGroups = await fetchUserGroupsFromGraph(String(graphUserId));
    }
  } catch (err) {
    console.error("Failed to fetch groups for custom attributes:", err);
  }

  if (entraGroups.length > 0) {
    let namesStr = entraGroups.map((g) => g.displayName).join(",");
    if (namesStr.length > 2048) {
      namesStr = namesStr.substring(0, 2045) + "...";
      console.warn("Truncated custom:entra_group_names to 2048 chars");
    }
    attributesToMap["custom:entra_group_names"] = namesStr;

    let idsStr = entraGroups.map((g) => g.id).join(",");
    if (idsStr.length > 2048) {
      idsStr = idsStr.substring(0, 2045) + "...";
      console.warn("Truncated custom:entra_group_ids to 2048 chars");
    }
    attributesToMap["custom:entra_group_ids"] = idsStr;
  }

  console.log("Resolved IdP claim keys:", Object.keys(userAttributesFromIdp).sort());
  console.log("Returning userAttributesToMap:", JSON.stringify(attributesToMap));

  if (!event.response) {
    event.response = {};
  }
  event.response.userAttributesToMap = attributesToMap;
  return event;
};

/**
 * Pre-Token Generation V2 trigger: creates native Cognito groups.
 * Fires when Cognito generates tokens — the user exists at this point.
 * Reads group IDs from custom:entra_group_ids and group names from
 * custom:entra_group_names (both set by Inbound Federation).
 * Creates native Cognito groups named EntraGroup-{id}.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const preTokenHandler = async (event: any) => {
  const userPoolId: string = event.userPoolId;
  const username: string = event.userName;
  const callerClientId: string | undefined = event.callerContext?.clientId;

  const personaClientId = await resolvePersonaClientId(userPoolId);

  console.log(
    "Pre-Token group sync invoked",
    JSON.stringify({
      userName: username,
      userPoolId,
      triggerSource: event.triggerSource,
      clientId: callerClientId,
      branch:
        callerClientId && callerClientId === personaClientId
          ? "persona"
          : "entra",
    }),
  );

  if (
    personaClientId &&
    callerClientId &&
    callerClientId === personaClientId
  ) {
    const response = buildPersonaPreTokenResponse(
      event.request.userAttributes ?? {},
    );
    if (!event.response) event.response = {};
    Object.assign(event.response, response);
    console.log(
      `Persona branch: overriding groups to ${JSON.stringify(
        response.claimsAndScopeOverrideDetails.groupOverrideDetails
          .groupsToOverride,
      )}`,
    );
    return event;
  }

  const groupIdsStr: string =
    event.request.userAttributes?.["custom:entra_group_ids"] ?? "";
  const groupNamesStr: string =
    event.request.userAttributes?.["custom:entra_group_names"] ?? "";

  if (!groupIdsStr) {
    console.log("No custom:entra_group_ids attribute, skipping group sync");
    return event;
  }

  const groupIds = groupIdsStr.split(",").map((g: string) => g.trim()).filter(Boolean);
  const groupNames = groupNamesStr.split(",").map((g: string) => g.trim());
  console.log(`Syncing ${groupIds.length} native Cognito groups`);

  for (let i = 0; i < groupIds.length; i++) {
    const groupId = groupIds[i];
    const displayName = groupNames[i] ?? groupId;
    const cognitoGroupName = `EntraGroup-${groupId}`;

    try {
      await ensureCognitoGroupExists(userPoolId, cognitoGroupName, `${displayName} (${groupId})`);
      await cognitoClient.send(
        new AdminAddUserToGroupCommand({
          Username: username,
          GroupName: cognitoGroupName,
          UserPoolId: userPoolId,
        }),
      );
    } catch (err: unknown) {
      if ((err as { name?: string }).name !== "ResourceConflictException") {
        console.warn("Failed to add user to group:", cognitoGroupName, err);
      }
    }
  }

  console.log(`Group sync complete for user ${username}`);
  return event;
};
