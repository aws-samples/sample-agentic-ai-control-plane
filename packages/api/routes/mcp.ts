import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { createMCPClient } from "@ai-sdk/mcp";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { os } from "@orpc/server";
import { solutionUserAgent } from "@package/aws-user-agent";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import { z } from "zod";

const DEFAULT_REGION = process.env.AGENTCORE_REGISTRY_REGION || "us-west-2";

const AuthTypeSchema = z.enum(["none", "sigv4", "jwt"]).default("none");

// ── SigV4 Helpers ────────────────────────────────────────────────────────────

// Extracts the AWS region from a bedrock-agentcore endpoint URL, falling back
// to the default region.
function extractRegionFromUrl(url: string): string {
  const match = url.match(/bedrock-agentcore\.([a-z0-9-]+)\.amazonaws\.com/);
  return match?.[1] || DEFAULT_REGION;
}

// fetch wrapper that SigV4-signs the request for the bedrock-agentcore service.
async function sigv4Fetch(url: string, init?: RequestInit): Promise<Response> {
  const region = extractRegionFromUrl(url);
  const parsedUrl = new URL(url);
  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region,
    service: "bedrock-agentcore",
    sha256: Sha256,
  });

  const request = new HttpRequest({
    method: (init?.method as string) || "POST",
    protocol: parsedUrl.protocol,
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    headers: {
      "Content-Type": "application/json",
      host: parsedUrl.hostname,
      // AWS Solutions metrics token — this path hand-signs instead of using an
      // @aws-sdk client, so the SDK base-class hook does not reach it.
      "user-agent": solutionUserAgent(),
      ...(init?.headers as Record<string, string>),
    },
    body: init?.body as string,
  });

  const signed = await signer.sign(request);
  return fetch(url, {
    method: signed.method,
    headers: signed.headers as Record<string, string>,
    body: signed.body,
  });
}

// ── MCP Client Factory ───────────────────────────────────────────────────────

// Builds an MCP client for an endpoint, wiring SigV4 signing or a JWT bearer
// header based on the requested auth type.
async function createTestClient(
  endpoint: string,
  authType: "none" | "sigv4" | "jwt",
  bearerToken?: string,
) {
  if (authType === "sigv4") {
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
      fetch: (url, init) => sigv4Fetch(url.toString(), init),
    });
    return createMCPClient({ transport });
  }

  return createMCPClient({
    transport: {
      type: "http",
      url: endpoint,
      headers:
        authType === "jwt" && bearerToken
          ? { Authorization: `Bearer ${bearerToken}` }
          : undefined,
    },
  });
}

// ── Routes ───────────────────────────────────────────────────────────────────

// Connects to an MCP endpoint and lists its tools to verify reachability/auth,
// returning { success: false, error } instead of throwing on failure.
export const testMcpEndpoint = os
  .route({ method: "POST", path: "/mcp/test-endpoint", tags: ["mcp"] })
  .input(
    z.object({
      endpoint: z.string().url(),
      authType: AuthTypeSchema,
      bearerToken: z.string().optional(),
    }),
  )
  .output(
    z.object({
      success: z.boolean(),
      tools: z
        .array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            inputSchema: z.any().optional(),
          }),
        )
        .optional(),
      error: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    let client: Awaited<ReturnType<typeof createMCPClient>> | undefined;
    try {
      client = await createTestClient(
        input.endpoint,
        input.authType,
        input.bearerToken,
      );
      const { tools: mcpTools } = await client.listTools();
      const tools = mcpTools.map((t) => ({
        name: t.name,
        description: t.description || "",
        inputSchema: t.inputSchema,
      }));
      return { success: true, tools };
    } catch (error: any) {
      return { success: false, error: error.message || "Failed to connect" };
    } finally {
      await client?.close();
    }
  });

// Invokes a named tool on an MCP endpoint with the given arguments, returning
// { success: false, error } if the tool is missing or the call throws.
export const callMcpTool = os
  .route({ method: "POST", path: "/mcp/call-tool", tags: ["mcp"] })
  .input(
    z.object({
      endpoint: z.string().url(),
      authType: AuthTypeSchema,
      bearerToken: z.string().optional(),
      toolName: z.string().min(1),
      arguments: z.record(z.string(), z.any()).default({}),
    }),
  )
  .output(
    z.object({
      success: z.boolean(),
      result: z.any().optional(),
      error: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    let client: Awaited<ReturnType<typeof createMCPClient>> | undefined;
    try {
      client = await createTestClient(
        input.endpoint,
        input.authType,
        input.bearerToken,
      );
      const toolSet = await client.tools();
      const tool = toolSet[input.toolName];
      if (!tool) {
        return {
          success: false,
          error: `Tool "${input.toolName}" not found`,
        };
      }
      const result = await tool.execute(input.arguments, {
        messages: [],
        toolCallId: `test-${Date.now()}`,
      });
      return { success: true, result };
    } catch (error: any) {
      return { success: false, error: error.message || "Failed to call tool" };
    } finally {
      await client?.close();
    }
  });

export const mcpRouter = { testMcpEndpoint, callMcpTool };
