import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

import * as strands from "@strands-agents/sdk";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { filterToolsByTargets } from "./filter-tools.js";

export { filterToolsByTargets };

const PORT = process.env.PORT || 8080;
const BEDROCK_REGION = process.env.BEDROCK_REGION || "us-east-1";
const RAW_GATEWAY_MCP_URL = process.env.AGENTCORE_GATEWAY_MCP_URL;
if (!RAW_GATEWAY_MCP_URL) {
  throw new Error(
    "AGENTCORE_GATEWAY_MCP_URL env var is required (set in apps/agent/.env.local)",
  );
}
const GATEWAY_MCP_URL: string = RAW_GATEWAY_MCP_URL;
const DEFAULT_MODEL_ID = "global.anthropic.claude-opus-4-6-v1";

// Connects to the AgentCore Gateway MCP endpoint using the caller's persona bearer token. 
async function loadGatewayTools(bearerToken: string | undefined): Promise<{
  tools: strands.Tool[];
  disconnect: () => Promise<void>;
}> {
  if (!GATEWAY_MCP_URL || !bearerToken) {
    return { tools: [], disconnect: async () => {} };
  }

  const transport = new StreamableHTTPClientTransport(
    new URL(GATEWAY_MCP_URL),
    {
      requestInit: {
        headers: { Authorization: `Bearer ${bearerToken}` },
      },
    },
  );
  const mcp = new strands.McpClient({ transport });
  try {
    await mcp.connect();
  } catch (err) {
    console.error("[gateway] connect failed:", err);
    throw err;
  }
  const tools = await mcp.listTools();
  console.log(
    "[gateway] loaded tools:",
    tools.map((t) => t.name),
  );
  return {
    tools,
    disconnect: async () => {
      try {
        await mcp.disconnect();
      } catch {
        // best-effort; transport may already be closed
      }
    },
  };
}

// Builds a Strands agent backed by Bedrock with the given prompt and tools.
function createAgent(
  systemPrompt: string | undefined,
  extraTools: strands.Tool[] = [],
  modelId: string | undefined,
) {
  return new strands.Agent({
    model: new strands.BedrockModel({
      region: BEDROCK_REGION,
      modelId: modelId ?? DEFAULT_MODEL_ID,
    }),
    tools: extraTools,
    systemPrompt,
    printer: false,
  });
}

const app = express();

app.get("/ping", (_: Request, res: Response) =>
  res.json({
    status: "Healthy",
    time_of_last_update: Math.floor(Date.now() / 1000),
  }),
);

app.post(
  "/invocations",
  express.json(),
  async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    // The persona bearer is forwarded from the web layer.
    const headerAuth = req.header("authorization") ?? req.header("Authorization");
    const headerBearer = headerAuth?.toLowerCase().startsWith("bearer ")
      ? headerAuth.slice(7).trim()
      : undefined;

    let gatewayDisconnect: () => Promise<void> = async () => {};

    try {
      const {
        prompt,
        agentId,
        systemPrompt,
        modelId,
        allowedTargetNames: allowedTargetNamesArr,
        bearerToken,
      } = req.body as {
        prompt: string;
        agentId?: string;
        systemPrompt?: string;
        modelId?: string;
        allowedTargetNames?: string[];
        bearerToken?: string;
      };

      if (!prompt) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: "prompt is required" })}\n\n`,
        );
        res.write(`event: done\ndata: ${JSON.stringify({})}\n\n`);
        res.end();
        return;
      }

      const effectiveBearer = bearerToken ?? headerBearer;

      const allowedTargetNames = new Set(allowedTargetNamesArr ?? []);

      const { tools: rawTools, disconnect } = await loadGatewayTools(effectiveBearer);
      gatewayDisconnect = disconnect;

      const filteredTools =
        agentId && allowedTargetNames.size === 0
          ? []
          : agentId
          ? filterToolsByTargets(rawTools, allowedTargetNames)
          : rawTools;

      const agent = createAgent(systemPrompt, filteredTools, modelId);

      const PSEUDO_TAGS = ["tool_call", "tool_result", "tool_response", "thinking"] as const;
      let buffer = "";
      let suppressDepth = 0;

      // Streams model text to the client, stripping any pseudo-tag blocks
      // (tool_call/thinking/etc.) that may span multiple deltas.
      function emitFilteredText(rawDelta: string): void {
        buffer += rawDelta;
        let out = "";
        while (buffer.length > 0) {
          if (suppressDepth > 0) {
            // Look for a closing tag for any pseudo-tag we're currently in.
            const closeMatch = buffer.match(
              new RegExp(`</(?:${PSEUDO_TAGS.join("|")})>`),
            );
            if (!closeMatch) {
              // No close tag yet — keep buffering, drop everything we have.
              buffer = "";
              break;
            }
            // Drop everything up to and including the close tag.
            buffer = buffer.slice(
              (closeMatch.index ?? 0) + closeMatch[0].length,
            );
            suppressDepth -= 1;
            continue;
          }
          // Not suppressing. Look for an opening pseudo-tag.
          const openMatch = buffer.match(
            new RegExp(`<(?:${PSEUDO_TAGS.join("|")})>`),
          );
          if (!openMatch) {
            const lastLt = buffer.lastIndexOf("<");
            if (lastLt >= 0 && buffer.length - lastLt < 16) {
              out += buffer.slice(0, lastLt);
              buffer = buffer.slice(lastLt);
            } else {
              out += buffer;
              buffer = "";
            }
            break;
          }
          // Emit anything before the open tag, then enter suppression.
          out += buffer.slice(0, openMatch.index ?? 0);
          buffer = buffer.slice((openMatch.index ?? 0) + openMatch[0].length);
          suppressDepth += 1;
        }
        if (out.length > 0) {
          res.write(
            `event: text\ndata: ${JSON.stringify({ type: "text", text: out })}\n\n`,
          );
        }
      }

      for await (const event of agent.stream(prompt)) {
        if (
          event.type === "beforeToolCallEvent" ||
          event.type === "afterToolCallEvent" ||
          event.type === "agentResultEvent" ||
          event.type === "afterInvocationEvent"
        ) {
          console.log("[agent stream]", event.type);
        }
        switch (event.type) {
          case "modelStreamUpdateEvent": {
            const inner = event.event;
            if (
              inner.type === "modelContentBlockDeltaEvent" &&
              inner.delta.type === "textDelta"
            ) {
              emitFilteredText(inner.delta.text);
            }
            if (
              inner.type === "modelContentBlockStartEvent" &&
              inner.start?.type === "toolUseStart"
            ) {
              res.write(
                `event: tool_call\ndata: ${JSON.stringify({ type: "tool_call", toolUseId: inner.start.toolUseId, name: inner.start.name })}\n\n`,
              );
            }
            break;
          }
          case "beforeToolCallEvent": {
            res.write(
              `event: tool_input\ndata: ${JSON.stringify({
                type: "tool_input",
                toolUseId: event.toolUse?.toolUseId,
                name: event.toolUse?.name,
                input: event.toolUse?.input,
              })}\n\n`,
            );
            break;
          }
          case "afterToolCallEvent": {
            const result =
              event.result?.content?.[0]?.type === "textBlock"
                ? event.result.content[0].text
                : JSON.stringify(event.result?.content);
            res.write(
              `event: tool_result\ndata: ${JSON.stringify({ type: "tool_result", toolUseId: event.toolUse?.toolUseId, name: event.toolUse?.name, result })}\n\n`,
            );
            break;
          }
          case "agentResultEvent":
            res.write(`event: done\ndata: ${JSON.stringify({})}\n\n`);
            break;
        }
      }

      if (!res.writableEnded) {
        res.write(`event: done\ndata: ${JSON.stringify({})}\n\n`);
        res.end();
      }
    } catch (err) {
      console.error("Error processing request:", err);
      const message =
        err instanceof Error ? err.message : "Internal server error";
      res.write(
        `event: error\ndata: ${JSON.stringify({ message })}\n\n`,
      );
      res.write(`event: done\ndata: ${JSON.stringify({})}\n\n`);
      res.end();
    } finally {
      await gatewayDisconnect();
    }
  },
);

app.listen(PORT, () => {
  console.log(`AgentCore Runtime server listening on port ${PORT}`);
  console.log(`  POST http://0.0.0.0:${PORT}/invocations`);
  console.log(`  GET  http://0.0.0.0:${PORT}/ping`);
});
