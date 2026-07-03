import {
  IsAuthorizedCommand,
  IsAuthorizedWithTokenCommand,
  VerifiedPermissionsClient,
  type ContextDefinition,
  type EntityItem,
} from "@aws-sdk/client-verifiedpermissions";
import { PolicyValidationError } from "./errors";
import type { AttributeType, PolicySchema } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AwsCredentialsProvider = any;

export type EntityRef = { type: string; id: string };

export type AuthorizeRequest = {
  principal: EntityRef;
  action: string;
  resource: EntityRef;
  context?: Record<string, string | number | boolean>;
  entities?: Array<{
    identifier: EntityRef;
    attributes?: Record<string, string | number | boolean>;
    parents?: EntityRef[];
  }>;
};

export type AuthorizeWithTokenRequest = Omit<AuthorizeRequest, "principal"> & {
  identityToken?: string;
  accessToken?: string;
};

export type AuthorizeResult = {
  allowed: boolean;
  determiningPolicies: string[];
  errors: string[];
};

export type PolicyMapperOptions = {
  region: string;
  policyStoreId: string;
  schema: PolicySchema;
  credentials?: AwsCredentialsProvider;
  client?: VerifiedPermissionsClient;
};

// Prefixes a bare entity type with the schema namespace (e.g. "User" -> "App::User").
function qualifiedType(namespace: string, type: string): string {
  if (type.includes("::")) return type;
  return `${namespace}::${type}`;
}

// Wraps a primitive value in the Cedar attribute shape for its declared type.
function cedarAttr(
  value: string | number | boolean,
  type: AttributeType,
): Record<string, unknown> {
  switch (type) {
    case "String":
      return { string: String(value) };
    case "Boolean":
      return { boolean: Boolean(value) };
    case "Long":
      return { long: typeof value === "number" ? value : Number(value) };
    case "Decimal":
      return { decimal: String(value) };
    default:
      return { string: String(value) };
  }
}

// Infers the Cedar attribute type from a JS primitive's runtime type.
function typeOfValue(
  value: string | number | boolean,
): "String" | "Boolean" | "Long" {
  if (typeof value === "boolean") return "Boolean";
  if (typeof value === "number") return "Long";
  return "String";
}

// Validates requests against a policy schema and runs Cedar authorization
// checks via AWS Verified Permissions.
export class PolicyMapper {
  private readonly client: VerifiedPermissionsClient;
  public readonly schema: PolicySchema;
  public readonly policyStoreId: string;

  constructor(opts: PolicyMapperOptions) {
    this.client =
      opts.client ??
      new VerifiedPermissionsClient({
        region: opts.region,
        credentials: opts.credentials,
      });
    this.schema = opts.schema;
    this.policyStoreId = opts.policyStoreId;
  }

  // Asserts the action, principal/resource types, and context fields all
  // conform to the schema; throws PolicyValidationError otherwise.
  private validate(req: {
    action: string;
    principal?: EntityRef;
    resource: EntityRef;
    context?: Record<string, string | number | boolean>;
  }): void {
    const action = this.schema.actions[req.action];
    if (!action) {
      throw new PolicyValidationError(
        "UNKNOWN_ACTION",
        `Action "${req.action}" is not defined in the policy schema.`,
      );
    }

    if (req.principal) {
      const stripped = req.principal.type.split("::").pop() ?? req.principal.type;
      if (!this.schema.entityTypes[stripped]) {
        throw new PolicyValidationError(
          "UNKNOWN_ENTITY_TYPE",
          `Principal entity type "${req.principal.type}" is not defined in the schema.`,
        );
      }
      if (!action.principalTypes.includes(stripped)) {
        throw new PolicyValidationError(
          "PRINCIPAL_NOT_ALLOWED",
          `Action "${req.action}" does not accept principal type "${stripped}".`,
        );
      }
    }

    const resourceStripped =
      req.resource.type.split("::").pop() ?? req.resource.type;
    if (!this.schema.entityTypes[resourceStripped]) {
      throw new PolicyValidationError(
        "UNKNOWN_ENTITY_TYPE",
        `Resource entity type "${req.resource.type}" is not defined in the schema.`,
      );
    }
    if (!action.resourceTypes.includes(resourceStripped)) {
      throw new PolicyValidationError(
        "RESOURCE_NOT_ALLOWED",
        `Action "${req.action}" does not accept resource type "${resourceStripped}".`,
      );
    }

    const declaredContext = action.context ?? {};
    const providedContext = req.context ?? {};
    for (const [key, spec] of Object.entries(declaredContext)) {
      if (spec.required && !(key in providedContext)) {
        throw new PolicyValidationError(
          "MISSING_REQUIRED_CONTEXT",
          `Context field "${key}" is required for action "${req.action}".`,
        );
      }
      if (key in providedContext) {
        const value = providedContext[key];
        const actualType = typeOfValue(value);
        const expected = spec.type;
        if (
          (expected === "String" && actualType !== "String") ||
          (expected === "Boolean" && actualType !== "Boolean") ||
          (expected === "Long" && actualType !== "Long")
        ) {
          throw new PolicyValidationError(
            "INVALID_CONTEXT_TYPE",
            `Context field "${key}" expected ${expected} but got ${actualType}.`,
          );
        }
      }
    }
  }

  // Converts a plain context map into the Cedar ContextDefinition shape.
  private buildContext(
    actionName: string,
    context?: Record<string, string | number | boolean>,
  ): ContextDefinition | undefined {
    if (!context || Object.keys(context).length === 0) return undefined;
    const declared = this.schema.actions[actionName]?.context ?? {};
    const contextMap: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      const spec = declared[key];
      const type = spec?.type ?? typeOfValue(value);
      contextMap[key] = cedarAttr(value, type);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { contextMap } as any;
  }

  // Maps request entities (with attributes and parents) to Cedar EntityItems.
  private buildEntities(
    req: AuthorizeRequest | AuthorizeWithTokenRequest,
  ): EntityItem[] | undefined {
    if (!req.entities || req.entities.length === 0) return undefined;
    return req.entities.map((e) => {
      const attrs: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(e.attributes ?? {})) {
        attrs[k] = cedarAttr(v, typeOfValue(v));
      }
      return {
        identifier: {
          entityType: qualifiedType(this.schema.namespace, e.identifier.type),
          entityId: e.identifier.id,
        },
        attributes: attrs,
        parents: (e.parents ?? []).map((p) => ({
          entityType: qualifiedType(this.schema.namespace, p.type),
          entityId: p.id,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    });
  }

  // Authorizes a request for an explicit principal entity.
  async authorize(req: AuthorizeRequest): Promise<AuthorizeResult> {
    this.validate(req);

    const actionType = `${this.schema.namespace}::Action`;
    const response = await this.client.send(
      new IsAuthorizedCommand({
        policyStoreId: this.policyStoreId,
        principal: {
          entityType: qualifiedType(this.schema.namespace, req.principal.type),
          entityId: req.principal.id,
        },
        action: {
          actionType,
          actionId: req.action,
        },
        resource: {
          entityType: qualifiedType(this.schema.namespace, req.resource.type),
          entityId: req.resource.id,
        },
        context: this.buildContext(req.action, req.context),
        entities: this.buildEntities(req)
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ entityList: this.buildEntities(req) } as any)
          : undefined,
      }),
    );

    return {
      allowed: response.decision === "ALLOW",
      determiningPolicies: (response.determiningPolicies ?? []).map(
        (p) => p.policyId ?? "",
      ),
      errors: (response.errors ?? []).map((e) => e.errorDescription ?? ""),
    };
  }

  // Authorizes a request using a Cognito identity/access token as the principal.
  async authorizeWithToken(
    req: AuthorizeWithTokenRequest,
  ): Promise<AuthorizeResult> {
    this.validate(req);

    const actionType = `${this.schema.namespace}::Action`;
    const response = await this.client.send(
      new IsAuthorizedWithTokenCommand({
        policyStoreId: this.policyStoreId,
        identityToken: req.identityToken,
        accessToken: req.accessToken,
        action: {
          actionType,
          actionId: req.action,
        },
        resource: {
          entityType: qualifiedType(this.schema.namespace, req.resource.type),
          entityId: req.resource.id,
        },
        context: this.buildContext(req.action, req.context),
        entities: this.buildEntities(req)
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ entityList: this.buildEntities(req) } as any)
          : undefined,
      }),
    );

    return {
      allowed: response.decision === "ALLOW",
      determiningPolicies: (response.determiningPolicies ?? []).map(
        (p) => p.policyId ?? "",
      ),
      errors: (response.errors ?? []).map((e) => e.errorDescription ?? ""),
    };
  }
}
