import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { generateText } from "ai";
import { authed } from "../context";
import { z } from "zod";

const REGION =
  process.env.BEDROCK_REGION || process.env.AGENTCORE_REGION || "us-east-1";

const bedrock = createAmazonBedrock({
  region: REGION,
  credentialProvider: fromNodeProviderChain(),
});

const CEDAR_SYSTEM_PROMPT = `You are an expert in the Cedar policy language used by Amazon Verified Permissions and Amazon Bedrock AgentCore.

Your task is to convert a natural language description of an authorization policy into valid Cedar policy syntax.

Rules:
- Output ONLY valid Cedar policy code. No markdown fences, no explanations, no comments unless they clarify complex logic.
- Each policy statement must begin with either \`permit\` or \`forbid\`.
- Use \`principal\`, \`action\`, \`resource\`, and \`context\` as appropriate.
- Use \`when\` and \`unless\` clauses for conditions.
- Use proper Cedar operators: \`in\`, \`has\`, \`like\`, \`is\`, \`==\`, \`!=\`, \`&&\`, \`||\`.
- For entity references use the format \`EntityType::"id"\`.
- For action references use \`AgentCore::Action::"<targetName>___<toolName>"\` — the gateway target name and the tool name separated by THREE underscores. Never use the bare tool name on its own; the gateway prefix is mandatory.
- For gateway resources use \`AgentCore::Gateway::"<full-gateway-arn>"\` (the full ARN starting with \`arn:aws:bedrock-agentcore:\`). Never use the gateway ID alone.
- For principals use \`AgentCore::OAuthUser\` or \`AgentCore::Group\`.
- Use \`principal.hasTag("key")\` and \`principal.getTag("key")\` for tag-based checks (scopes, roles, usernames).
- Use \`context.input has field\` and \`context.input.field\` to inspect tool input parameters.
- If the description is ambiguous, produce a reasonable default policy and add a short Cedar comment explaining assumptions.
- If multiple policies are needed, output them sequentially separated by blank lines.
- If an existing policy is provided, use it as a starting point and apply the requested changes. Preserve structure and entity types from the existing policy where possible.
- When entity references are provided (e.g. Entra ID users/groups, gateways, targets, tools), use their actual IDs in the Cedar policy. Map Entra ID groups to Cognito group names using \`principal.getTag("cognito:groups") like "*EntraGroup-{groupId}*"\` where {groupId} is the Entra group object ID (GUID). Map Entra ID users to \`AgentCore::OAuthUser\`, gateways to \`AgentCore::Gateway\`, and tools to \`AgentCore::Action\`.
- For group-based policies, always use \`principal.hasTag("cognito:groups")\` to check for group membership and \`principal.getTag("cognito:groups") like "*EntraGroup-{groupId}*"\` for matching specific groups. Use the Entra ID group object ID (GUID), not the display name. The Cognito group naming convention is \`EntraGroup-{entraGroupId}\`.

Here are reference examples of valid Cedar policies for Amazon Bedrock AgentCore:

Example 1 — Multi-action permit (allow multiple read actions):
permit(
  principal is AgentCore::OAuthUser,
  action in [
    AgentCore::Action::"InsuranceAPI___get_policy",
    AgentCore::Action::"InsuranceAPI___get_claim_status"
  ],
  resource == AgentCore::Gateway::"arn:aws:bedrock-agentcore:us-west-2:123456789012:gateway/insurance"
);

Example 2 — Scope-based authorization (check OAuth scope via tags):
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"InsuranceAPI___file_claim",
  resource == AgentCore::Gateway::"arn:aws:bedrock-agentcore:us-west-2:123456789012:gateway/insurance"
)
when {
  principal.hasTag("scope") &&
  principal.getTag("scope") like "*insurance:claim*"
};

Example 3 — Role-based forbid with unless (block unless user has specific role):
forbid(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"InsuranceAPI___update_coverage",
  resource == AgentCore::Gateway::"arn:aws:bedrock-agentcore:us-west-2:123456789012:gateway/insurance"
)
unless {
  principal.hasTag("role") &&
  (principal.getTag("role") == "senior-adjuster" || principal.getTag("role") == "manager")
};

Example 4 — Input parameter validation with OR logic:
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"InsuranceAPI___file_claim",
  resource == AgentCore::Gateway::"arn:aws:bedrock-agentcore:us-west-2:123456789012:gateway/insurance"
)
when {
  context.input has claimType &&
  (context.input.claimType == "health" ||
   context.input.claimType == "property" ||
   context.input.claimType == "auto")
};

Example 5 — Require optional field (forbid unless field is present):
forbid(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"InsuranceAPI___file_claim",
  resource == AgentCore::Gateway::"arn:aws:bedrock-agentcore:us-west-2:123456789012:gateway/insurance"
)
unless {
  context.input has description
};

Example 6 — Username-based authorization:
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"InsuranceAPI___update_coverage",
  resource == AgentCore::Gateway::"arn:aws:bedrock-agentcore:us-west-2:123456789012:gateway/insurance"
)
when {
  principal.hasTag("username") &&
  principal.getTag("username") == "Clare"
};

Example 7 — Pattern matching with like operator:
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"InsuranceAPI___calculate_premium",
  resource == AgentCore::Gateway::"arn:aws:bedrock-agentcore:us-west-2:123456789012:gateway/insurance"
)
when {
  context.input has coverageType &&
  context.input.coverageType like "*auto*"
};

Example 8 — Combined conditions with AND:
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"InsuranceAPI___update_coverage",
  resource == AgentCore::Gateway::"arn:aws:bedrock-agentcore:us-west-2:123456789012:gateway/insurance"
)
when {
  context.input has coverageType &&
  context.input has newLimit &&
  (context.input.coverageType == "liability" || context.input.coverageType == "collision")
};

Example 9 — Group-based authorization (allow members of an Entra ID group by ID):
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"InsuranceAPI___get_policy",
  resource == AgentCore::Gateway::"arn:aws:bedrock-agentcore:us-west-2:123456789012:gateway/insurance"
)
when {
  principal.hasTag("cognito:groups") &&
  principal.getTag("cognito:groups") like "*EntraGroup-a1b2c3d4-e5f6-7890-abcd-ef1234567890*"
};

Example 10 — Group-based forbid with unless (block unless user belongs to admin group by ID):
forbid(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"InsuranceAPI___update_coverage",
  resource == AgentCore::Gateway::"arn:aws:bedrock-agentcore:us-west-2:123456789012:gateway/insurance"
)
unless {
  principal.hasTag("cognito:groups") &&
  principal.getTag("cognito:groups") like "*EntraGroup-f9e8d7c6-b5a4-3210-fedc-ba0987654321*"
};

Key authorization semantics:
- Default deny: if no permit policy matches, the request is denied.
- Forbid wins: if any forbid policy matches, the request is denied even if a permit also matches.
- Policy layering: multiple policies can apply to the same request and all must be satisfied.`;

const MentionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum([
    "entra-user",
    "entra-group",
    "cognito-group",
    "gateway",
    "gateway-target",
    "gateway-tool",
    "agent-runtime",
  ]),
  subtitle: z.string().optional(),
  gatewayId: z.string().optional(),
  gatewayName: z.string().optional(),
  gatewayArn: z.string().optional(),
  targetId: z.string().optional(),
  targetName: z.string().optional(),
  toolName: z.string().optional(),
  agentRuntimeId: z.string().optional(),
  agentRuntimeName: z.string().optional(),
});

type Mention = z.infer<typeof MentionSchema>;

const GATEWAY_REGION =
  process.env.AGENTCORE_REGION || process.env.BEDROCK_REGION || "us-east-1";
const GATEWAY_ACCOUNT_ID =
  process.env.AGENTCORE_ACCOUNT_ID || process.env.AWS_ACCOUNT_ID || "";

// Returns the full gateway ARN, building it from id + region/account when only
// a bare gateway id is supplied (passes through values already in ARN form).
function deriveGatewayArn(gatewayId: string): string {
  if (gatewayId.startsWith("arn:")) return gatewayId;
  if (!GATEWAY_ACCOUNT_ID) return gatewayId;
  return `arn:aws:bedrock-agentcore:${GATEWAY_REGION}:${GATEWAY_ACCOUNT_ID}:gateway/${gatewayId}`;
}

// Renders referenced entities (users, groups, gateways, targets, tools) into a
// prompt block telling the model the exact Cedar IDs/ARNs/action names to use.
function buildMentionContext(mentions: Mention[]): string {
  if (mentions.length === 0) return "";

  const lines: string[] = ["Referenced entities:"];
  for (const m of mentions) {
    switch (m.category) {
      case "entra-user":
        lines.push(
          `- Entra ID User: "${m.name}" (ID: ${m.id}${m.subtitle ? `, email: ${m.subtitle}` : ""})`,
        );
        break;
      case "entra-group":
        lines.push(
          `- Entra ID Group: "${m.name}" (Cognito group: "EntraGroup-${m.id}", Entra ID: ${m.id}${m.subtitle ? `, description: ${m.subtitle}` : ""})`,
        );
        break;
      case "cognito-group":
        lines.push(
          `- Cognito Group: "${m.name}" (admin-created, no Entra mirror — match with principal.getTag("cognito:groups") like "*${m.name}*"${m.subtitle ? `, description: ${m.subtitle}` : ""})`,
        );
        break;
      case "gateway": {
        const arn = m.gatewayArn ?? deriveGatewayArn(m.id);
        lines.push(
          `- AgentCore Gateway: "${m.name}" (use this exact ARN as the resource: ${arn}${m.subtitle ? `, description: ${m.subtitle}` : ""})`,
        );
        break;
      }
      case "gateway-target": {
        const arn = m.gatewayArn ?? deriveGatewayArn(m.gatewayId ?? "");
        lines.push(
          `- AgentCore Gateway Target: "${m.name}" (use ${arn} as the resource ARN; tools under this target use action name "${m.name}___<toolName>")`,
        );
        break;
      }
      case "gateway-tool": {
        const arn = m.gatewayArn ?? deriveGatewayArn(m.gatewayId ?? "");
        const toolName = m.toolName ?? m.name;
        const target = m.targetName ?? "";
        const fullActionName = target && toolName.indexOf("___") === -1
          ? `${target}___${toolName}`
          : toolName;
        lines.push(
          `- AgentCore Gateway Tool: use action name AgentCore::Action::"${fullActionName}" and resource AgentCore::Gateway::"${arn}". (Tool: "${toolName}", target: "${target}", gateway: "${m.gatewayName}")`,
        );
        break;
      }
      case "agent-runtime":
        lines.push(
          `- AgentCore Runtime Endpoint: "${m.name}" (ID: ${m.id}, runtime: "${m.agentRuntimeName}" [${m.agentRuntimeId}]${m.subtitle ? `, description: ${m.subtitle}` : ""})`,
        );
        break;
    }
  }
  return lines.join("\n");
}

// Generates a Cedar policy from natural language via Bedrock, incorporating any
// existing policy and mentioned entities, and strips markdown fences from output.
export const generateCedarPolicy = authed
  .route({ method: "POST", path: "/cedar/generate", tags: ["cedar"] })
  .input(
    z.object({
      naturalLanguage: z.string().min(1),
      existingPolicy: z.string().optional(),
      mentions: z.array(MentionSchema).optional(),
    }),
  )
  .output(z.object({ cedarPolicy: z.string() }))
  .handler(async ({ input }) => {
    const parts: string[] = [];

    if (input.existingPolicy?.trim()) {
      parts.push(
        `Existing Cedar policy:\n\`\`\`cedar\n${input.existingPolicy.trim()}\n\`\`\``,
      );
    }

    const mentionContext = buildMentionContext(input.mentions ?? []);
    if (mentionContext) {
      parts.push(mentionContext);
    }

    parts.push(
      input.existingPolicy?.trim()
        ? `Requested changes:\n${input.naturalLanguage}`
        : input.naturalLanguage,
    );

    const { text } = await generateText({
      model: bedrock("global.anthropic.claude-sonnet-4-6"),
      system: CEDAR_SYSTEM_PROMPT,
      prompt: parts.join("\n\n"),
    });

    let policy = text.trim();
    // Strip markdown code fences if the model wraps its output
    policy = policy
      .replace(/^```(?:cedar)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    return { cedarPolicy: policy };
  });

export const cedarRouter = { generateCedarPolicy };
