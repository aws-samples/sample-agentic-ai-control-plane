// AWS Solutions API-usage metrics: appends the `AWSSOLUTION/<id>/<version>`
// token to the User-Agent of outbound AWS calls so usage is attributed to this
// solution. See README.md for the onboarding rationale and wiring per surface.
export {
  SOLUTION_ID,
  SOLUTION_VERSION,
  DEFAULT_SOLUTION_UA,
  solutionUserAgent,
} from "./user-agent";
export { installSolutionUserAgentHook } from "./sdk-hook";
export { solutionFetch } from "./solution-fetch";
