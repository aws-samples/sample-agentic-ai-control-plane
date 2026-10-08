import { agentRuntimeInvokeRouter } from "./routes/agent-runtime";
import { agentToolsRouter } from "./routes/agent-tools";
import { agentsRouter } from "./routes/agents";
import { cedarRouter } from "./routes/cedar";
import { cognitoGroupsRouter } from "./routes/cognito-groups";
import { dashboardMetricsRouter } from "./routes/dashboard-metrics";
import { gatewayTargetsRouter } from "./routes/gateway-targets";
import { gatewaysRouter } from "./routes/gateways";
import { health } from "./routes/health";
import { idpRouter } from "./routes/idp";
import { mcpRouter } from "./routes/mcp";
import { modelsRouter } from "./routes/models";
import { personasRouter } from "./routes/personas";
import { policyEnginesRouter } from "./routes/policy-engines";
import { policyLibraryRouter } from "./routes/policy-library";
import { registryRouter } from "./routes/registry";
import { toolPolicyStoresRouter } from "./routes/tool-policy-stores";

export const router = {
  health,
  ...registryRouter,
  ...agentsRouter,
  ...agentToolsRouter,
  ...agentRuntimeInvokeRouter,
  ...modelsRouter,
  ...personasRouter,
  ...idpRouter,
  ...mcpRouter,
  ...policyEnginesRouter,
  ...policyLibraryRouter,
  ...toolPolicyStoresRouter,
  ...gatewayTargetsRouter,
  ...gatewaysRouter,
  ...cedarRouter,
  ...cognitoGroupsRouter,
  ...dashboardMetricsRouter,
};
