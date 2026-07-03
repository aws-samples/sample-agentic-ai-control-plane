// Parses the custom:persona_groups attribute (a JSON string array) into a clean
// list of group names; returns [] for missing/malformed values.
export function computePersonaGroupOverride(
  userAttributes: Record<string, string | undefined>,
): string[] {
  const raw = userAttributes["custom:persona_groups"];
  if (!raw || typeof raw !== "string" || raw.trim() === "") {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export interface PreTokenPersonaResponse {
  claimsAndScopeOverrideDetails: {
    groupOverrideDetails: {
      groupsToOverride: string[];
      iamRolesToOverride?: string[];
      preferredRole?: string;
    };
    accessTokenGeneration?: {
      claimsToAddOrOverride?: Record<string, string>;
    };
    idTokenGeneration?: {
      claimsToAddOrOverride?: Record<string, string>;
    };
  };
}

// Builds the Pre-Token V2 override response for persona tokens: overrides groups
// and adds email/name claims so the gateway interceptor can read the persona identity.
export function buildPersonaPreTokenResponse(
  userAttributes: Record<string, string | undefined>,
): PreTokenPersonaResponse {
  // Gateway interceptor reads persona's details
  const claimsToAddOrOverride: Record<string, string> = {};
  const email = userAttributes["email"];
  const name = userAttributes["name"];
  if (email) claimsToAddOrOverride["email"] = email;
  if (name) claimsToAddOrOverride["name"] = name;

  const hasClaims = Object.keys(claimsToAddOrOverride).length > 0;

  return {
    claimsAndScopeOverrideDetails: {
      groupOverrideDetails: {
        groupsToOverride: computePersonaGroupOverride(userAttributes),
      },
      ...(hasClaims
        ? {
            accessTokenGeneration: { claimsToAddOrOverride },
            idTokenGeneration: { claimsToAddOrOverride },
          }
        : {}),
    },
  };
}
