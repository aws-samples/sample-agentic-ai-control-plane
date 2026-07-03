import { os } from "@orpc/server";
import { z } from "zod";

const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || "";
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || "";
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || "";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

// Returns a Microsoft Graph app-only access token via the client-credentials
// flow, caching it in memory until ~60s before expiry.
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    client_secret: MICROSOFT_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to acquire Microsoft access token (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.accessToken;
}

// Performs an authenticated GET against Microsoft Graph, throwing on non-2xx.
async function graphFetch(
  path: string,
  query?: URLSearchParams,
  extraHeaders?: Record<string, string>,
) {
  const token = await getAccessToken();
  const url = new URL(`${GRAPH_BASE_URL}${path}`);
  if (query) {
    query.forEach((value, key) => url.searchParams.append(key, value));
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Microsoft Graph API Error (${response.status}): ${errorText}`,
    );
  }

  return response;
}

const GroupSchema = z
  .object({
    id: z.string(),
    displayName: z.string().nullable(),
    description: z.string().nullable(),
    mail: z.string().nullable(),
    mailEnabled: z.boolean().nullable(),
    securityEnabled: z.boolean().nullable(),
    groupTypes: z.array(z.string()),
    createdDateTime: z.string().nullable(),
    resourceProvisioningOptions: z.array(z.string()).optional(),
  })
  .passthrough();

const ListGroupsResponseSchema = z.object({
  groups: z.array(GroupSchema),
  nextLink: z.string().nullable(),
});

// Lists Entra ID groups (optionally Teams-only or filtered by search), returning
// the page plus a skipToken cursor for the next page.
export const listMicrosoftGroups = os
  .route({
    method: "GET",
    path: "/idp/microsoft/groups",
    tags: ["idp"],
  })
  .input(
    z
      .object({
        teamsOnly: z.coerce.boolean().optional(),
        top: z.coerce.number().int().min(1).max(999).optional(),
        search: z.string().optional(),
        skipToken: z.string().optional(),
      })
      .optional(),
  )
  .output(ListGroupsResponseSchema)
  .handler(async ({ input }) => {
    console.log("Listing Microsoft Entra groups:", input);

    try {
      const query = new URLSearchParams();

      query.append(
        "$select",
        "id,displayName,description,mail,mailEnabled,securityEnabled,groupTypes,createdDateTime,resourceProvisioningOptions",
      );

      if (input?.teamsOnly) {
        query.append(
          "$filter",
          "resourceProvisioningOptions/Any(x:x eq 'Team')",
        );
      }

      if (input?.top) {
        query.append("$top", String(input.top));
      }

      if (input?.search) {
        query.append("$search", `"displayName:${input.search}"`);
      }

      if (input?.skipToken) {
        query.append("$skiptoken", input.skipToken);
      }

      const extraHeaders = input?.search
        ? { ConsistencyLevel: "eventual" }
        : undefined;

      const response = await graphFetch("/groups", query, extraHeaders);
      const data = (await response.json()) as {
        value: z.infer<typeof GroupSchema>[];
        "@odata.nextLink"?: string;
      };

      let nextLink: string | null = null;
      if (data["@odata.nextLink"]) {
        const nextUrl = new URL(data["@odata.nextLink"]);
        nextLink = nextUrl.searchParams.get("$skiptoken");
      }

      console.log("Microsoft Entra groups fetched:", data.value?.length || 0);

      return {
        groups: data.value || [],
        nextLink,
      };
    } catch (error) {
      console.error("Error in listMicrosoftGroups handler:", error);
      throw error;
    }
  });

const UserSchema = z
  .object({
    id: z.string(),
    displayName: z.string().nullable(),
    givenName: z.string().nullable(),
    surname: z.string().nullable(),
    mail: z.string().nullable(),
    userPrincipalName: z.string().nullable(),
    jobTitle: z.string().nullable(),
    department: z.string().nullable(),
    accountEnabled: z.boolean().nullable(),
    createdDateTime: z.string().nullable(),
  })
  .passthrough();

const SearchUsersResponseSchema = z.object({
  users: z.array(UserSchema),
  nextLink: z.string().nullable(),
});

// Searches Entra ID users by name/mail/UPN, returning the page plus a skipToken
// cursor for the next page.
export const searchMicrosoftUsers = os
  .route({
    method: "GET",
    path: "/idp/microsoft/users",
    tags: ["idp"],
  })
  .input(
    z
      .object({
        search: z.string().optional(),
        top: z.coerce.number().int().min(1).max(999).optional(),
        skipToken: z.string().optional(),
      })
      .optional(),
  )
  .output(SearchUsersResponseSchema)
  .handler(async ({ input }) => {
    console.log("Searching Microsoft Entra users:", input);

    try {
      const query = new URLSearchParams();

      query.append(
        "$select",
        "id,displayName,givenName,surname,mail,userPrincipalName,jobTitle,department,accountEnabled,createdDateTime",
      );

      if (input?.search) {
        query.append(
          "$search",
          `"displayName:${input.search}" OR "mail:${input.search}" OR "userPrincipalName:${input.search}"`,
        );
      }

      if (input?.top) {
        query.append("$top", String(input.top));
      }

      if (input?.skipToken) {
        query.append("$skiptoken", input.skipToken);
      }

      // ConsistencyLevel is required whenever $search is used
      const extraHeaders: Record<string, string> = {
        ConsistencyLevel: "eventual",
      };

      const response = await graphFetch("/users", query, extraHeaders);
      const data = (await response.json()) as {
        value: z.infer<typeof UserSchema>[];
        "@odata.nextLink"?: string;
      };

      let nextLink: string | null = null;
      if (data["@odata.nextLink"]) {
        const nextUrl = new URL(data["@odata.nextLink"]);
        nextLink = nextUrl.searchParams.get("$skiptoken");
      }

      console.log("Microsoft Entra users fetched:", data.value?.length || 0);

      return {
        users: data.value || [],
        nextLink,
      };
    } catch (error) {
      console.error("Error in searchMicrosoftUsers handler:", error);
      throw error;
    }
  });

export const idpRouter = {
  listMicrosoftGroups,
  searchMicrosoftUsers,
};
