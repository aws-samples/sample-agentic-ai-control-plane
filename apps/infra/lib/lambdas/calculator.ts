// Lambda handler invoked by AgentCore Gateway's Lambda target.
//
// Event contract (per AgentCore Gateway samples):
//   Arguments arrive as top-level keys on the event. Numbers arrive as
//   strings and must be parsed.
//
// Tool dispatch:
//   context.clientContext.custom.bedrockAgentCoreToolName holds
//   "<targetName>___<toolName>" (three underscores). We split off the
//   target-name prefix to get the bare tool name the caller invoked.
//
// Response:
//   Return a plain object; Gateway wraps it as an MCP tool_result.

interface GatewayLambdaContext {
  clientContext?: {
    custom?: { bedrockAgentCoreToolName?: string };
  };
}

interface CalculatorEvent {
  firstNumber?: string | number;
  secondNumber?: string | number;
  minuend?: string | number;
  subtrahend?: string | number;
  multiplicand?: string | number;
  multiplier?: string | number;
  dividend?: string | number;
  divisor?: string | number;
}

function toNumber(value: string | number | undefined, field: string): number {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required field: ${field}`);
  }
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) {
    throw new Error(`Field ${field} is not a valid number: ${value}`);
  }
  return n;
}

export const handler = async (
  event: CalculatorEvent,
  context: GatewayLambdaContext,
): Promise<Record<string, number>> => {
  console.log("event:", JSON.stringify(event));
  console.log("clientContext:", JSON.stringify(context.clientContext));

  const extendedToolName =
    context.clientContext?.custom?.bedrockAgentCoreToolName;
  if (!extendedToolName) {
    throw new Error(
      "Missing bedrockAgentCoreToolName in clientContext; not invoked via Gateway?",
    );
  }

  // "<targetName>___<toolName>" → "<toolName>"
  const parts = extendedToolName.split("___");
  const toolName = parts.length >= 2 ? parts[1] : parts[0];

  switch (toolName) {
    case "add_numbers": {
      const a = toNumber(event.firstNumber, "firstNumber");
      const b = toNumber(event.secondNumber, "secondNumber");
      return { sum: a + b };
    }
    case "subtract_numbers": {
      const a = toNumber(event.minuend, "minuend");
      const b = toNumber(event.subtrahend, "subtrahend");
      return { difference: a - b };
    }
    case "multiply_numbers": {
      const a = toNumber(event.multiplicand, "multiplicand");
      const b = toNumber(event.multiplier, "multiplier");
      return { product: a * b };
    }
    case "divide_numbers": {
      const divisor = toNumber(event.divisor, "divisor");
      const dividend = toNumber(event.dividend, "dividend");
      if (divisor === 0) {
        throw new Error("Divisor cannot be zero");
      }
      return { quotient: dividend / divisor };
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
};
