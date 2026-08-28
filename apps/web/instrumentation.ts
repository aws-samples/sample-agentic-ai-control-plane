// Next.js runs `register()` once when the server process starts, before any
// route handler. Installing the AWS Solutions User-Agent hook here tags every
// outbound AWS SDK v3 call in the web process — the BedrockAgentCoreClient in
// the streaming route and all the @aws-sdk clients constructed by the
// @packages/api routes this app imports. See packages/aws-user-agent.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installSolutionUserAgentHook } = await import(
      "@package/aws-user-agent"
    );
    // This process uses two AWS SDK generations (see packages/aws-user-agent):
    // the pinned 3.1079.x clients and the GA 3.1105.x agent-registry clients,
    // which have different base classes. Pass one client per generation so both
    // are patched.
    const [{ BedrockAgentCoreClient }, { AgentRegistryClient }] =
      await Promise.all([
        import("@aws-sdk/client-bedrock-agentcore"),
        import("@aws-sdk/client-agent-registry"),
      ]);
    installSolutionUserAgentHook([BedrockAgentCoreClient, AgentRegistryClient]);
  }
}
