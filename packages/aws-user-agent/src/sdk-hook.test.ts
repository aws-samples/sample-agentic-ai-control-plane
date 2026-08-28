import {
  AgentRegistryClient,
  ListDiscoverableRegistryRecordsCommand,
} from "@aws-sdk/client-agent-registry";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  ListSecretsCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { describe, expect, it } from "vitest";

import { installSolutionUserAgentHook } from "./sdk-hook.js";
import { solutionFetch } from "./solution-fetch.js";
import { solutionUserAgent } from "./user-agent.js";

// Cover both AWS SDK generations present in the monorepo: the pinned 3.1079.x
// clients (bedrock-runtime/secrets-manager) and the GA 3.1105.x agent-registry
// clients, which have a different base class.
installSolutionUserAgentHook([BedrockRuntimeClient, AgentRegistryClient]);

const TOKEN = solutionUserAgent();
const PROBE = "captureUserAgent";

// Returns the User-Agent header of the next request `send` would issue, then
// aborts it — so no credentials and no billable call are needed. Removes its
// probe afterward so a second call on the same client is not aborted too.
async function capturedUserAgent(
  client: { middlewareStack: { add: Function; remove: Function } },
  send: () => Promise<unknown>,
): Promise<string> {
  let ua = "";
  client.middlewareStack.add(
    () => async (arg: { request: { headers: Record<string, string> } }) => {
      const headers = arg.request.headers;
      ua = headers["user-agent"] ?? headers["x-amz-user-agent"] ?? "";
      throw new Error("__stop__");
    },
    { step: "finalizeRequest", name: PROBE, tags: ["LAST"], priority: "low" },
  );
  try {
    await send();
  } catch {
    // Expected: the probe above aborts the request once headers are built.
  }
  client.middlewareStack.remove(PROBE);
  return ua;
}

const occurrences = (ua: string) =>
  ua.split(" ").filter((t) => t === TOKEN).length;

describe("solution user-agent hook", () => {
  it("appends the token exactly once, and not again on retry", async () => {
    const client = new BedrockRuntimeClient({ region: "us-east-1" });
    const cmd = new ConverseCommand({
      modelId: "x",
      messages: [{ role: "user", content: [{ text: "hi" }] }],
    });
    expect(occurrences(await capturedUserAgent(client, () => client.send(cmd)))).toBe(1);
    // Second call on the same client must not double the token.
    expect(occurrences(await capturedUserAgent(client, () => client.send(cmd)))).toBe(1);
  });

  it("covers other clients sharing the same base class (3.1079)", async () => {
    const client = new SecretsManagerClient({ region: "us-east-1" });
    const ua = await capturedUserAgent(client, () =>
      client.send(new ListSecretsCommand({})),
    );
    expect(occurrences(ua)).toBe(1);
  });

  it("covers the second SDK generation (3.1105 agent-registry)", async () => {
    const client = new AgentRegistryClient({ region: "us-east-1" });
    const ua = await capturedUserAgent(client, () =>
      // registryId is a required HTTP label — supply it so the request reaches
      // the finalizeRequest step where the probe captures the header.
      client.send(new ListDiscoverableRegistryRecordsCommand({ registryId: "r" })),
    );
    expect(occurrences(ua)).toBe(1);
  });
});

describe("solutionFetch (for @ai-sdk/amazon-bedrock)", () => {
  it("appends the token to the request user-agent header exactly once", async () => {
    let seen = "";
    const fakeFetch = (async (_input: unknown, init?: { headers?: Headers }) => {
      seen = init?.headers?.get("user-agent") ?? "";
      return new Response(null);
    }) as unknown as typeof fetch;

    const wrapped = solutionFetch(fakeFetch);
    await wrapped("https://bedrock-runtime.us-east-1.amazonaws.com/", {
      headers: { "user-agent": "aws-sdk-js/x" },
    });
    expect(seen.split(" ").filter((t) => t === TOKEN).length).toBe(1);
    expect(seen).toContain("aws-sdk-js/x");
  });
});
