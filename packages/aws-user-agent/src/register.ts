// Side-effect entrypoint: `import "@package/aws-user-agent/register";` installs
// the AWS SDK v3 User-Agent hook for the whole process. Import this before any
// module that constructs an AWS client (in apps/agent, before Strands loads).
//
// This module has no exports on purpose. If your linter strips "unused"
// side-effect imports, call `installSolutionUserAgentHook()` explicitly instead.
import { installSolutionUserAgentHook } from "./sdk-hook";

installSolutionUserAgentHook();
