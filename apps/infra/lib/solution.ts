// AWS Solutions API-usage metrics token, defined once for all deployed compute.
//
// Setting USER_AGENT_STRING on each container/function is what makes the
// runtime code (via packages/aws-user-agent) append `AWSSOLUTION/<id>/<version>`
// to outbound AWS calls. Keep the id/version here in sync with the fallback in
// packages/aws-user-agent/src/user-agent.ts.
//
// Bump the version on each release.
const SOLUTION_ID = "SO0364";
const SOLUTION_VERSION = "0.1.0";

export const SOLUTION_USER_AGENT = `AWSSOLUTION/${SOLUTION_ID}/v${SOLUTION_VERSION}`;
