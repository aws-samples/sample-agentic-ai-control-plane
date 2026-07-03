import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import prisma from "@package/database/client";
import { mintPersonaTokenHandler } from "@packages/api/routes/mint-persona-token";

const REGION = process.env.AGENTCORE_REGION || "us-east-1";
const client = new BedrockAgentCoreClient({
  region: REGION,
  requestHandler: new NodeHttpHandler({ requestTimeout: 0 }),
});

function sseEvent(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseChunk(
  raw: string,
): { type: string; [key: string]: unknown } | null {
  let parsed: unknown = raw;
  for (let i = 0; i < 3; i++) {
    try {
      parsed = JSON.parse(parsed as string);
    } catch {
      break;
    }
  }
  if (typeof parsed === "object" && parsed !== null && "type" in parsed) {
    return parsed as { type: string; [key: string]: unknown };
  }
  if (typeof parsed === "string" && parsed.length > 0) {
    return { type: "text", text: parsed };
  }
  return null;
}

const LOCAL_AGENT_URL = "http://localhost:8080/invocations";

export async function POST(request: Request) {
  const reqId = Math.random().toString(36).slice(2, 8);
  console.log(`[invoke-stream:${reqId}] received request`);
  const body = await request.json();
  const {
    agentRuntimeArn,
    agentId,
    prompt,
    sessionId,
    userId,
    personaId,
    qualifier = "DEFAULT",
  } = body as {
    agentRuntimeArn: string;
    agentId?: string;
    prompt: string;
    sessionId?: string;
    userId?: string;
    personaId?: string | null;
    qualifier?: string;
  };

  if (!agentRuntimeArn || !prompt) {
    return new Response(
      JSON.stringify({ error: "agentRuntimeArn and prompt are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[invoke-stream:${reqId}] body parsed agentId=${agentId} personaId=${personaId} arn=${agentRuntimeArn}`);
  let personaBearer: string | undefined;
  if (personaId) {
    try {
      console.log(`[invoke-stream:${reqId}] minting persona token`);
      const result = await mintPersonaTokenHandler({ personaId });
      personaBearer = result.accessToken;
      console.log(`[invoke-stream:${reqId}] persona token minted`);
    } catch (err) {
      console.error(`[invoke-stream:${reqId}] mintPersonaToken failed`, err);
      return new Response(
        JSON.stringify({
          error:
            err instanceof Error
              ? err.message
              : "Failed to mint persona token",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  if (agentRuntimeArn === "__local__") {
    return handleLocalInvocation(prompt, agentId, personaBearer);
  }

  // Resolve agent config in this layer so the runtime container doesn't need
  // DB access. The runtime is on usingPublicNetwork(), but RDS is private —
  // the web tier has VPC connectivity, so we do the lookups here and pass
  // results in the payload.
  let resolvedSystemPrompt: string | undefined;
  let resolvedAllowedTargets: string[] | undefined;
  // Note: agent.preferredModel is intentionally NOT sent to the runtime. The
  // UI lets users select a model for display, but the runtime always uses its
  // DEFAULT_MODEL_ID (set in apps/agent/index.ts) to avoid model-availability
  // mismatches across accounts.
  if (agentId) {
    try {
      console.log(`[invoke-stream:${reqId}] querying agent ${agentId}`);
      const agentConfig = await prisma.agent.findUnique({
        where: { id: agentId },
        include: { preferredModel: true },
      });
      resolvedSystemPrompt = agentConfig?.systemPrompt ?? undefined;

      const agentTools = await prisma.agentTool.findMany({
        where: { agentId, isEnabled: true },
      });
   
      const recordIds = agentTools
        .map(
          (t) =>
            (t.metadata as Record<string, unknown> | null)?.registryRecordId,
        )
        .filter((v): v is string => typeof v === "string");
      if (recordIds.length > 0) {
        const targets = await prisma.gatewayTarget.findMany({
          where: { registryRecordId: { in: recordIds }, status: "READY" },
        });
        resolvedAllowedTargets = targets.map((t) => t.targetName as string);
      } else {
        resolvedAllowedTargets = [];
      }
    } catch (err) {
      return new Response(
        JSON.stringify({
          error:
            err instanceof Error
              ? err.message
              : "Failed to resolve agent config",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const runtimeSessionId =
    sessionId ??
    `session-${Date.now()}-${Math.random().toString(36).substring(2)}-${Math.random().toString(36).substring(2)}`;

  const resolvedUserId = userId ?? "cli-user";

  const payload = JSON.stringify({
    prompt,
    agentId,
    systemPrompt: resolvedSystemPrompt,
    // modelId intentionally omitted — runtime uses its DEFAULT_MODEL_ID
    allowedTargetNames: resolvedAllowedTargets,
    // Pass the persona bearer
    bearerToken: personaBearer,
    user_id: resolvedUserId,
  });

  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn,
    qualifier,
    runtimeSessionId,
    runtimeUserId: resolvedUserId,
    payload: new TextEncoder().encode(payload),
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Flush an SSE comment immediately + every 15s
      controller.enqueue(encoder.encode(": heartbeat\n\n"));
      let firstChunkSeen = false;
      const heartbeatTimer = setInterval(() => {
        if (firstChunkSeen) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // controller may have closed mid-tick; the finally block clears
          // the timer, so just swallow.
        }
      }, 15_000);

      try {
        let bodyStream: ReadableStream<Uint8Array>;

        if (personaBearer) {
          const encodedArn = encodeURIComponent(agentRuntimeArn);
          const url = `https://bedrock-agentcore.${REGION}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=${encodeURIComponent(qualifier)}`;
          console.log(`[invoke-stream:${reqId}] calling AgentCore via bearer`);
          const res = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${personaBearer}`,
              "Content-Type": "application/json",
              Accept: "application/json, text/event-stream",
              "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": runtimeSessionId,
              "X-Amzn-Bedrock-AgentCore-Runtime-User-Id": resolvedUserId,
            },
            body: payload,
          });
          console.log(`[invoke-stream:${reqId}] AgentCore response status=${res.status}`);
          if (!res.ok || !res.body) {
            const text = await res.text();
            controller.enqueue(
              encoder.encode(
                sseEvent("error", {
                  message: text || `Runtime returned HTTP ${res.status}`,
                }),
              ),
            );
            controller.enqueue(encoder.encode(sseEvent("done", {})));
            return;
          }
          bodyStream = res.body;
        } else {
          const response = await client.send(command);

          if (!response.response) {
            controller.enqueue(
              encoder.encode(sseEvent("error", { message: "No response body" })),
            );
            controller.enqueue(encoder.encode(sseEvent("done", {})));
            return;
          }

          // The Python agent streams chunks incrementally (yields oauth_check,
          // then blocks for auth, then yields text).
          bodyStream = response.response.transformToWebStream();
        }

        const reader = bodyStream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          firstChunkSeen = true;

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines as they arrive
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith("event: ") || trimmed.startsWith(":")) continue;
            const data = trimmed.startsWith("data: ")
              ? trimmed.slice(6)
              : trimmed;
            const chunk = parseChunk(data);
            if (chunk) {
              controller.enqueue(encoder.encode(sseEvent(chunk.type, chunk)));
            }
          }
        }

        // Flush any remaining buffer
        if (buffer.trim()) {
          const tail = buffer.trim();
          if (!tail.startsWith("event: ") && !tail.startsWith(":")) {
            const data = tail.startsWith("data: ") ? tail.slice(6) : tail;
            const chunk = parseChunk(data);
            if (chunk) {
              controller.enqueue(encoder.encode(sseEvent(chunk.type, chunk)));
            }
          }
        }

        controller.enqueue(encoder.encode(sseEvent("done", {})));
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to invoke agent runtime";
        controller.enqueue(encoder.encode(sseEvent("error", { message })));
        controller.enqueue(encoder.encode(sseEvent("done", {})));
      } finally {
        clearInterval(heartbeatTimer);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function handleLocalInvocation(
  prompt: string,
  agentId?: string,
  bearerToken?: string,
): Promise<Response> {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const res = await fetch(LOCAL_AGENT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, agentId, bearerToken }),
        });

        if (!res.ok) {
          const text = await res.text();
          controller.enqueue(
            encoder.encode(sseEvent("error", { message: text || `Local agent returned ${res.status}` })),
          );
          controller.enqueue(encoder.encode(sseEvent("done", {})));
          controller.close();
          return;
        }

        if (!res.body) {
          controller.enqueue(
            encoder.encode(sseEvent("error", { message: "No response body from local agent" })),
          );
          controller.enqueue(encoder.encode(sseEvent("done", {})));
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            const lines = block.split("\n");
            let eventType = "";
            let eventData = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7);
              else if (line.startsWith("data: ")) eventData = line.slice(6);
            }

            if (!eventType || !eventData) continue;

            try {
              const parsed = JSON.parse(eventData);
              controller.enqueue(encoder.encode(sseEvent(eventType, parsed)));
            } catch {
              controller.enqueue(
                encoder.encode(sseEvent(eventType, { raw: eventData })),
              );
            }
          }
        }

        if (buffer.trim()) {
          const lines = buffer.trim().split("\n");
          let eventType = "";
          let eventData = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            else if (line.startsWith("data: ")) eventData = line.slice(6);
          }
          if (eventType && eventData) {
            try {
              const parsed = JSON.parse(eventData);
              controller.enqueue(encoder.encode(sseEvent(eventType, parsed)));
            } catch { /* skip */ }
          }
        }

        controller.enqueue(encoder.encode(sseEvent("done", {})));
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to reach local agent";
        controller.enqueue(encoder.encode(sseEvent("error", { message })));
        controller.enqueue(encoder.encode(sseEvent("done", {})));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
