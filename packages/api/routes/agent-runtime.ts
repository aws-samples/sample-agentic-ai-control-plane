import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import { os } from "@orpc/server";
import { z } from "zod";

const REGION = process.env.AGENTCORE_REGION || "us-east-1";

const client = new BedrockAgentCoreClient({ region: REGION });

// Invokes a Bedrock AgentCore runtime with a prompt and returns the parsed
// response, surfacing failures as { success: false, error } rather than throwing.
export const invokeAgentRuntime = os
  .route({
    method: "POST",
    path: "/agent-runtimes/invoke",
    tags: ["agent-runtimes"],
  })
  .input(
    z.object({
      agentRuntimeArn: z.string().min(1),
      prompt: z.string().min(1),
      sessionId: z.string().optional(),
      qualifier: z.string().default("DEFAULT"),
    }),
  )
  .output(
    z.object({
      success: z.boolean(),
      response: z.any().optional(),
      error: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    try {
      const command = new InvokeAgentRuntimeCommand({
        agentRuntimeArn: input.agentRuntimeArn,
        qualifier: input.qualifier,
        runtimeSessionId:
          input.sessionId ??
          `session-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        payload: new TextEncoder().encode(input.prompt),
      });

      const response = await client.send(command);
      const text = await response.response?.transformToString();
      const parsed = text ? JSON.parse(text) : null;

      return { success: true, response: parsed };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to invoke agent runtime",
      };
    }
  });

export const agentRuntimeInvokeRouter = { invokeAgentRuntime };
