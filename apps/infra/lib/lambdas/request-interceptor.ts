// AgentCore Gateway Request Interceptor.
//
// Decodes the persona's Cognito JWT and injects callerEmail/callerName/
// callerGroups into the tool-call arguments before the gateway evaluates
// Cedar and invokes the target Lambda.
//
// JWT signature verification is skipped — the AgentCore Gateway has already
// validated the bearer token (it's the gateway's own authentication). We
// just decode the payload.

interface InterceptorEvent {
  interceptorInputVersion?: string;
  mcp?: {
    gatewayRequest?: {
      headers?: Record<string, string>;
      body?: {
        jsonrpc?: string;
        id?: unknown;
        method?: string;
        params?: {
          name?: string;
          arguments?: Record<string, unknown>;
        };
      };
    };
  };
}

interface JwtClaims {
  email?: string;
  name?: string;
  sub?: string;
  username?: string;
  "cognito:groups"?: string[];
  "cognito:username"?: string;
}

function decodeJwtPayload(authHeader: string | undefined): JwtClaims {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("missing_authorization_header");
  }
  const token = authHeader.substring(7);
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("invalid_jwt_format");
  }
  const pad = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
  // base64url → base64 for Buffer.from
  const b64 = pad.replace(/-/g, "+").replace(/_/g, "/");
  const payload = Buffer.from(b64, "base64").toString("utf-8");
  return JSON.parse(payload) as JwtClaims;
}

function lowercaseHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

export const handler = async (
  event: InterceptorEvent,
): Promise<Record<string, unknown>> => {
  if (event.interceptorInputVersion !== "1.0") {
    return errorResponse("invalid_interceptor_version");
  }

  const req = event.mcp?.gatewayRequest;
  if (!req?.body) {
    return errorResponse("missing_gateway_request_body");
  }

  const body = req.body;
  const method = body.method ?? "";

  // Only mutate tools/call — pass tools/list and other methods through.
  if (method !== "tools/call") {
    return passthrough(body);
  }

  let claims: JwtClaims;
  try {
    const lower = lowercaseHeaders(req.headers);
    claims = decodeJwtPayload(lower["authorization"]);
  } catch (err) {
    console.error("[interceptor] JWT decode failed:", err);
    return errorResponse(
      `jwt_decode_failed: ${(err as Error).message}`,
    );
  }

  // Cognito access tokens (returned by AdminInitiateAuth) don't carry the
  // standard `email`/`name` profile claims — only ID tokens do. Personas in
  // this platform are created with username == email (see personas.ts), so
  // we fall back to cognito:username when email isn't present.
  const email =
    claims.email ?? claims["cognito:username"] ?? claims.username ?? "";
  const name = claims.name ?? claims["cognito:username"] ?? "";
  // Inject the caller's FULL group list. An identity may belong to many groups
  // (federated users routinely do); Cedar evaluates `principal in Group::"X"`
  // against every parent, so the tool Lambda must see all of them.
  const groups = claims["cognito:groups"] ?? [];

  const params = body.params ?? {};
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  const toolName = params.name ?? "";

  console.log(
    "[interceptor] injecting identity",
    JSON.stringify({ tool: toolName, email, groups }),
  );

  const transformed = {
    interceptorOutputVersion: "1.0",
    mcp: {
      transformedGatewayRequest: {
        body: {
          jsonrpc: "2.0",
          id: body.id,
          method,
          params: {
            name: toolName,
            arguments: {
              ...args,
              callerEmail: email,
              callerName: name,
              callerGroups: groups,
            },
          },
        },
      },
    },
  };
  return transformed;
};

function passthrough(body: unknown): Record<string, unknown> {
  return {
    interceptorOutputVersion: "1.0",
    mcp: { transformedGatewayRequest: { body } },
  };
}

function errorResponse(message: string): Record<string, unknown> {
  return {
    interceptorOutputVersion: "1.0",
    mcp: {
      transformedGatewayResponse: {
        statusCode: 400,
        body: { error: message },
      },
    },
  };
}
