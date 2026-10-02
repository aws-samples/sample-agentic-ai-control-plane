import {
  BedrockAgentCoreControlClient,
  GetGatewayCommand,
  ListGatewaysCommand,
  ListPoliciesCommand,
  ListPolicyEnginesCommand,
} from "@aws-sdk/client-bedrock-agentcore-control";
import {
  CloudWatchClient,
  GetMetricDataCommand,
  type MetricDataQuery,
} from "@aws-sdk/client-cloudwatch";
import { authed } from "../context";
import { z } from "zod";

const REGION =
  process.env.CLOUDWATCH_REGION ||
  process.env.AGENTCORE_REGION ||
  "us-east-1";

const cw = new CloudWatchClient({ region: REGION });
const agentcore = new BedrockAgentCoreControlClient({ region: REGION });

// AgentCore publishes both gateway and policy-engine metrics under a single
// namespace: AWS/Bedrock-AgentCore (capital C, "AWS/" prefix).
const POLICY_NAMESPACE = "AWS/Bedrock-AgentCore";
const GATEWAY_NAMESPACE = "AWS/Bedrock-AgentCore";
// Only AllowDecisions/DenyDecisions carry a PolicyEngine dimension. The
// "Invocations" metric is gateway-side (Operation/Method/Protocol/Resource)
// and has no PolicyEngine dimension, so total tool requests are derived as
// allow + deny instead of queried directly.
const METRICS = {
  allow: "AllowDecisions",
  deny: "DenyDecisions",
} as const;
const GATEWAY_METRICS = {
  invocations: { name: "Invocations", stat: "Sum" },
  systemErrors: { name: "SystemErrors", stat: "Sum" },
  userErrors: { name: "UserErrors", stat: "Sum" },
  throttles: { name: "Throttles", stat: "Sum" },
  latency: { name: "Latency", stat: "Average" },
} as const;

const RangeSchema = z.enum(["7d", "30d", "90d"]).default("90d");

// Maps a "7d"/"30d"/"90d" range string to its day count.
function rangeToDays(range: z.infer<typeof RangeSchema>): number {
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  return 90;
}

// Returns every policy engine id across all pages.
async function listAllPolicyEngineIds(): Promise<string[]> {
  const ids: string[] = [];
  let nextToken: string | undefined;
  do {
    const res = await agentcore.send(
      new ListPolicyEnginesCommand({ nextToken, maxResults: 100 }),
    );
    for (const pe of res.policyEngines ?? []) {
      if (pe.policyEngineId) ids.push(pe.policyEngineId);
    }
    nextToken = res.nextToken ?? undefined;
  } while (nextToken);
  return ids;
}

// Normalizes an id into a CloudWatch-query-safe token (lowercase, [a-z0-9_]).
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
}

// Builds CloudWatch metric-math queries that SEARCH per-engine allow/deny
// decision counts and SUM them into one "allow_total"/"deny_total" series each.
function buildQueries(
  engineIds: string[],
  periodSeconds: number,
  returnData: boolean,
): MetricDataQuery[] {
  const queries: MetricDataQuery[] = [];

  for (const [key, metricName] of Object.entries(METRICS)) {
    const perEngineIds: string[] = [];
    engineIds.forEach((engineId, idx) => {
      const id = `${key}_${idx}_${sanitizeId(engineId).slice(0, 40)}`;
      perEngineIds.push(id);
      const safeId = engineId.replace(/"/g, '\\"');
      // Count per-tool tools/list pre-filter decisions. Each conversation
      // turn evaluates one decision per registered tool, so denials reflect
      // policies actively hiding tools from unauthorized users.
      const searchExpr =
        `SUM(SEARCH('{"${POLICY_NAMESPACE}",TargetResource,ToolName,OperationName,PolicyEngine} ` +
        `MetricName="${metricName}" OperationName="PartiallyAuthorizeActions" PolicyEngine="${safeId}"', 'Sum', ${periodSeconds}))`;
      queries.push({
        Id: id,
        Expression: searchExpr,
        ReturnData: false,
      });
    });

    queries.push({
      Id: `${key}_total`,
      Expression:
        perEngineIds.length > 0
          ? `SUM([${perEngineIds.join(",")}])`
          : "TIME_SERIES(0)",
      Label: key,
      ReturnData: returnData,
    });
  }

  return queries;
}

// Returns the numeric values of the metric-data result with the given Id (empty
// array if absent).
function findSeriesValues(
  results: Array<{ Id?: string; Values?: number[] }>,
  id: string,
): number[] {
  const r = results.find((x) => x.Id === id);
  return (r?.Values ?? []).map((v) => Number(v ?? 0));
}

// Returns aggregate policy-decision counts (approvals, denials, derived total
// requests) and the count of ACTIVE policies over the requested range.
export const getDashboardStats = authed
  .route({
    method: "GET",
    path: "/dashboard/stats",
    tags: ["dashboard"],
  })
  .input(z.object({ range: RangeSchema }))
  .output(
    z.object({
      totalToolRequests: z.number(),
      toolApprovals: z.number(),
      toolDenials: z.number(),
      activePolicies: z.number(),
    }),
  )
  .handler(async ({ input }) => {
    const days = rangeToDays(input.range);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
    const periodSeconds = days * 24 * 60 * 60;

    const engineIds = await listAllPolicyEngineIds();

    let totalToolRequests = 0;
    let toolApprovals = 0;
    let toolDenials = 0;

    if (engineIds.length > 0) {
      const queries = buildQueries(engineIds, periodSeconds, true);
      const res = await cw.send(
        new GetMetricDataCommand({
          MetricDataQueries: queries,
          StartTime: startTime,
          EndTime: endTime,
          ScanBy: "TimestampAscending",
        }),
      );
      const results = res.MetricDataResults ?? [];
      const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
      toolApprovals = sum(findSeriesValues(results, "allow_total"));
      toolDenials = sum(findSeriesValues(results, "deny_total"));
      // Invocations has no PolicyEngine dimension; every tool request resolves
      // to an allow or a deny, so total requests = approvals + denials.
      totalToolRequests = toolApprovals + toolDenials;
    }

    let activePolicies = 0;
    for (const engineId of engineIds) {
      let nextToken: string | undefined;
      do {
        const res = await agentcore.send(
          new ListPoliciesCommand({
            policyEngineId: engineId,
            nextToken,
            maxResults: 100,
          }),
        );
        for (const p of res.policies ?? []) {
          if (p.status === "ACTIVE") activePolicies += 1;
        }
        nextToken = res.nextToken ?? undefined;
      } while (nextToken);
    }

    return {
      totalToolRequests: Math.round(totalToolRequests),
      toolApprovals: Math.round(toolApprovals),
      toolDenials: Math.round(toolDenials),
      activePolicies,
    };
  });

// Returns per-day approval/denial/derived-call counts across the range for
// charting (one point per UTC day, zero-filled).
export const getDashboardTimeseries = authed
  .route({
    method: "GET",
    path: "/dashboard/timeseries",
    tags: ["dashboard"],
  })
  .input(z.object({ range: RangeSchema }))
  .output(
    z.object({
      points: z.array(
        z.object({
          date: z.string(),
          calls: z.number(),
          approvals: z.number(),
          denials: z.number(),
        }),
      ),
    }),
  )
  .handler(async ({ input }) => {
    const days = rangeToDays(input.range);
    const endTime = new Date();
    endTime.setUTCHours(23, 59, 59, 999);
    const startTime = new Date(endTime.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    startTime.setUTCHours(0, 0, 0, 0);
    const periodSeconds = 86400;

    const engineIds = await listAllPolicyEngineIds();

    const pointsByDate = new Map<
      string,
      { date: string; calls: number; approvals: number; denials: number }
    >();

    const toDateKey = (d: Date): string => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    for (let i = 0; i < days; i += 1) {
      const d = new Date(startTime.getTime() + i * 86400 * 1000);
      const key = toDateKey(d);
      pointsByDate.set(key, { date: key, calls: 0, approvals: 0, denials: 0 });
    }

    if (engineIds.length > 0) {
      const queries = buildQueries(engineIds, periodSeconds, true);
      const res = await cw.send(
        new GetMetricDataCommand({
          MetricDataQueries: queries,
          StartTime: startTime,
          EndTime: endTime,
          ScanBy: "TimestampAscending",
        }),
      );
      const results = res.MetricDataResults ?? [];

      const applySeries = (
        id: string,
        field: "calls" | "approvals" | "denials",
      ) => {
        const r = results.find((x) => x.Id === id);
        const timestamps = r?.Timestamps ?? [];
        const values = r?.Values ?? [];
        for (let i = 0; i < timestamps.length; i += 1) {
          const ts = timestamps[i];
          if (!ts) continue;
          const key = toDateKey(new Date(ts));
          const point = pointsByDate.get(key);
          if (point) point[field] += Number(values[i] ?? 0);
        }
      };

      applySeries("allow_total", "approvals");
      applySeries("deny_total", "denials");
    }

    const points = Array.from(pointsByDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({
        date: p.date,
        // Invocations has no PolicyEngine dimension; per-day tool requests are
        // the sum of that day's approvals and denials.
        calls: Math.round(p.approvals + p.denials),
        approvals: Math.round(p.approvals),
        denials: Math.round(p.denials),
      }));

    return { points };
  });

// Returns every gateway across all pages paired with its ARN, skipping any
// gateway whose ARN lookup fails.
async function listAllGateways(): Promise<
  Array<{ gatewayId: string; arn: string }>
> {
  const summaries: Array<{ gatewayId: string }> = [];
  let nextToken: string | undefined;
  do {
    const res = await agentcore.send(
      new ListGatewaysCommand({ nextToken, maxResults: 100 }),
    );
    for (const gw of res.items ?? []) {
      if (gw.gatewayId) summaries.push({ gatewayId: gw.gatewayId });
    }
    nextToken = res.nextToken ?? undefined;
  } while (nextToken);

  const withArns = await Promise.all(
    summaries.map(async ({ gatewayId }) => {
      try {
        const res = await agentcore.send(
          new GetGatewayCommand({ gatewayIdentifier: gatewayId }),
        );
        if (res.gatewayArn) return { gatewayId, arn: res.gatewayArn };
      } catch {
        // ignore per-gateway errors; skip from metrics
      }
      return null;
    }),
  );

  return withArns.filter(
    (x): x is { gatewayId: string; arn: string } => x !== null,
  );
}

// Builds CloudWatch metric-math queries that SEARCH per-gateway invocation/
// error/latency metrics and aggregate them into one total series per metric.
function buildGatewayQueries(
  arns: string[],
  periodSeconds: number,
  returnData: boolean,
): MetricDataQuery[] {
  const queries: MetricDataQuery[] = [];

  // AgentCore Gateway re-publishes each invocation under multiple overlapping
  // dimension combinations — {Resource,Operation,Protocol} as a roll-up AND
  // {Resource,Operation,Method,Protocol} per method. A partial-dimension
  // SEARCH matches both and double-counts (one invocation showed up as ~16).
  // Pin SEARCH to the {Resource,Operation,Protocol} roll-up schema so each
  // invocation is counted exactly once, then SUM across gateways.
  for (const [key, { name, stat }] of Object.entries(GATEWAY_METRICS)) {
    const perGatewayIds: string[] = [];
    arns.forEach((arn, idx) => {
      const id = `gw_${key}_${idx}`;
      perGatewayIds.push(id);
      const safeArn = arn.replace(/"/g, '\\"');
      const aggregator = stat === "Sum" ? "SUM" : "AVG";
      const searchExpr =
        `${aggregator}(SEARCH('{"${GATEWAY_NAMESPACE}",Resource,Operation,Protocol} ` +
        `MetricName="${name}" Resource="${safeArn}"', '${stat}', ${periodSeconds}))`;
      queries.push({
        Id: id,
        Expression: searchExpr,
        ReturnData: false,
      });
    });

    const expression =
      perGatewayIds.length === 0
        ? "TIME_SERIES(0)"
        : stat === "Sum"
          ? `SUM([${perGatewayIds.join(",")}])`
          : `AVG([${perGatewayIds.join(",")}])`;

    queries.push({
      Id: `gw_${key}_total`,
      Expression: expression,
      Label: key,
      ReturnData: returnData,
    });
  }

  return queries;
}

// Returns aggregate gateway metrics (count, invocations, errors, throttles,
// average latency) over the requested range.
export const getGatewayStats = authed
  .route({
    method: "GET",
    path: "/dashboard/gateway/stats",
    tags: ["dashboard"],
  })
  .input(z.object({ range: RangeSchema }))
  .output(
    z.object({
      gatewayCount: z.number(),
      invocations: z.number(),
      systemErrors: z.number(),
      userErrors: z.number(),
      throttles: z.number(),
      avgLatencyMs: z.number(),
    }),
  )
  .handler(async ({ input }) => {
    const days = rangeToDays(input.range);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
    const periodSeconds = days * 24 * 60 * 60;

    const gateways = await listAllGateways();
    const arns = gateways.map((g) => g.arn);

    let invocations = 0;
    let systemErrors = 0;
    let userErrors = 0;
    let throttles = 0;
    let avgLatencyMs = 0;

    if (arns.length > 0) {
      const queries = buildGatewayQueries(arns, periodSeconds, true);
      const res = await cw.send(
        new GetMetricDataCommand({
          MetricDataQueries: queries,
          StartTime: startTime,
          EndTime: endTime,
          ScanBy: "TimestampAscending",
        }),
      );
      const results = res.MetricDataResults ?? [];
      const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
      invocations = sum(findSeriesValues(results, "gw_invocations_total"));
      systemErrors = sum(findSeriesValues(results, "gw_systemErrors_total"));
      userErrors = sum(findSeriesValues(results, "gw_userErrors_total"));
      throttles = sum(findSeriesValues(results, "gw_throttles_total"));
      const latencyValues = findSeriesValues(results, "gw_latency_total");
      avgLatencyMs =
        latencyValues.length > 0
          ? latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length
          : 0;
    }

    return {
      gatewayCount: gateways.length,
      invocations: Math.round(invocations),
      systemErrors: Math.round(systemErrors),
      userErrors: Math.round(userErrors),
      throttles: Math.round(throttles),
      avgLatencyMs: Math.round(avgLatencyMs),
    };
  });

// Returns per-day gateway invocation/error/latency metrics across the range
// for charting (one point per UTC day, zero-filled).
export const getGatewayTimeseries = authed
  .route({
    method: "GET",
    path: "/dashboard/gateway/timeseries",
    tags: ["dashboard"],
  })
  .input(z.object({ range: RangeSchema }))
  .output(
    z.object({
      points: z.array(
        z.object({
          date: z.string(),
          invocations: z.number(),
          systemErrors: z.number(),
          userErrors: z.number(),
          avgLatencyMs: z.number(),
        }),
      ),
    }),
  )
  .handler(async ({ input }) => {
    const days = rangeToDays(input.range);
    const endTime = new Date();
    endTime.setUTCHours(23, 59, 59, 999);
    const startTime = new Date(
      endTime.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
    );
    startTime.setUTCHours(0, 0, 0, 0);
    const periodSeconds = 86400;

    const gateways = await listAllGateways();
    const arns = gateways.map((g) => g.arn);

    const toDateKey = (d: Date): string => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const pointsByDate = new Map<
      string,
      {
        date: string;
        invocations: number;
        systemErrors: number;
        userErrors: number;
        avgLatencyMs: number;
      }
    >();

    for (let i = 0; i < days; i += 1) {
      const d = new Date(startTime.getTime() + i * 86400 * 1000);
      const key = toDateKey(d);
      pointsByDate.set(key, {
        date: key,
        invocations: 0,
        systemErrors: 0,
        userErrors: 0,
        avgLatencyMs: 0,
      });
    }

    if (arns.length > 0) {
      const queries = buildGatewayQueries(arns, periodSeconds, true);
      const res = await cw.send(
        new GetMetricDataCommand({
          MetricDataQueries: queries,
          StartTime: startTime,
          EndTime: endTime,
          ScanBy: "TimestampAscending",
        }),
      );
      const results = res.MetricDataResults ?? [];

      const applySeries = (
        id: string,
        field: "invocations" | "systemErrors" | "userErrors" | "avgLatencyMs",
      ) => {
        const r = results.find((x) => x.Id === id);
        const timestamps = r?.Timestamps ?? [];
        const values = r?.Values ?? [];
        for (let i = 0; i < timestamps.length; i += 1) {
          const ts = timestamps[i];
          if (!ts) continue;
          const key = toDateKey(new Date(ts));
          const point = pointsByDate.get(key);
          if (point) point[field] = Number(values[i] ?? 0);
        }
      };

      applySeries("gw_invocations_total", "invocations");
      applySeries("gw_systemErrors_total", "systemErrors");
      applySeries("gw_userErrors_total", "userErrors");
      applySeries("gw_latency_total", "avgLatencyMs");
    }

    const points = Array.from(pointsByDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({
        date: p.date,
        invocations: Math.round(p.invocations),
        systemErrors: Math.round(p.systemErrors),
        userErrors: Math.round(p.userErrors),
        avgLatencyMs: Math.round(p.avgLatencyMs),
      }));

    return { points };
  });

export const dashboardMetricsRouter = {
  getDashboardStats,
  getDashboardTimeseries,
  getGatewayStats,
  getGatewayTimeseries,
};
