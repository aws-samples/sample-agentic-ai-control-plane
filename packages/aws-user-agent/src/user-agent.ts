// The AWS Solutions metrics token.
//
// AWS attributes service API usage to a solution when outbound AWS SDK calls
// carry an `AWSSOLUTION/<id>/<version>` token in the User-Agent header. The
// token is defined once here and reused everywhere so a release only changes
// this file (and the deployment env var below).
//
// TODO(SO-id): replace SO0000 with the solution ID assigned to this platform.
export const SOLUTION_ID = "SO0000";

// Version reported in the token. The deployment sets USER_AGENT_STRING with the
// real release version; this constant is only the local-dev fallback.
export const SOLUTION_VERSION = "0.1.0";

// The token this build would emit if the deployment does not set
// USER_AGENT_STRING. Format: AWSSOLUTION/<id>/v<version>.
export const DEFAULT_SOLUTION_UA = `AWSSOLUTION/${SOLUTION_ID}/v${SOLUTION_VERSION}`;

// The token actually appended to outbound requests.
//
// Deployments (CDK for the agent/web containers, Vercel for a2a-agent) set
// USER_AGENT_STRING so the id/version is defined once in deployment automation,
// per the AWS Solutions onboarding guidance. When it is unset — local dev — we
// fall back to the constant above so behavior is identical everywhere.
export function solutionUserAgent(): string {
  return process.env.USER_AGENT_STRING?.trim() || DEFAULT_SOLUTION_UA;
}
