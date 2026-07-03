export type PolicyValidationErrorCode =
  | "UNKNOWN_ACTION"
  | "UNKNOWN_ENTITY_TYPE"
  | "MISSING_REQUIRED_CONTEXT"
  | "INVALID_CONTEXT_TYPE"
  | "PRINCIPAL_NOT_ALLOWED"
  | "RESOURCE_NOT_ALLOWED";

// Thrown when an authorization request violates the policy schema; carries a code.
export class PolicyValidationError extends Error {
  public readonly code: PolicyValidationErrorCode;

  constructor(code: PolicyValidationErrorCode, message: string) {
    super(message);
    this.name = "PolicyValidationError";
    this.code = code;
  }
}
