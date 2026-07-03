// Expense management tools for the example scenario.
// Expense tool supports functions: 
//   submitExpense / listMyExpenses / listTeamExpenses / approveExpense / rejectExpense

import prisma from "@package/database/client";
import { PolicyMapper } from "@package/policy";
import { expenseSchema } from "./expense-schema";

// Need to inject AVP policy store ID created from platform
const mapper = new PolicyMapper({
  region: process.env.AWS_REGION ?? "us-east-1",
  policyStoreId: process.env.AVP_POLICY_STORE_ID ?? "",
  schema: expenseSchema,
});

interface GatewayLambdaContext {
  clientContext?: {
    custom?: {
      bedrockAgentCoreToolName?: string;
    };
  };
}

type ToolEvent = Record<string, unknown>;
type ToolResult = Record<string, unknown>;

interface Caller {
  email: string;
  name: string;
  groups: string[];
}

// Gateway Lambda entry point: resolves caller identity from interceptor-injected
// args, then dispatches to the submit/list/approve/reject expense tool by tool name.
export const handler = async (
  event: ToolEvent,
  context: GatewayLambdaContext,
): Promise<ToolResult> => {
  console.log("event:", JSON.stringify(event));
  console.log("clientContext:", JSON.stringify(context.clientContext));

  const rawToolName = context.clientContext?.custom?.bedrockAgentCoreToolName;
  const toolName = rawToolName?.split("___").pop();

  const args = (event.arguments as ToolEvent | undefined) ?? event;

  // Caller identity comes from the Request Interceptor on the gateway.
  // callerGroups carries the caller's full group membership.
  const rawGroups = Array.isArray(args.callerGroups) ? args.callerGroups : [];
  const caller: Caller = {
    email: String(args.callerEmail ?? ""),
    name: String(args.callerName ?? ""),
    groups: rawGroups.map((g) => String(g)).filter((g) => g.length > 0),
  };

  if (!caller.email) {
    return { success: false, error: "missing_caller_identity" };
  }

  switch (toolName) {
    case "submitExpense":
      return submitExpense(args, caller);
    case "listMyExpenses":
      return listMyExpenses(caller);
    case "listTeamExpenses":
      return listTeamExpenses(caller);
    case "approveExpense":
      return approveExpense(args, caller);
    case "rejectExpense":
      return rejectExpense(args);
    default:
      return { success: false, error: "unknown_tool", tool: toolName };
  }
};

async function submitExpense(args: ToolEvent, caller: Caller): Promise<ToolResult> {
  const amount = Number(args.amount);
  const category = String(args.category ?? "");
  const description = String(args.description ?? "");
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "invalid_amount" };
  }

  const count = await prisma.expense.count();
  const id = `exp_${String(count + 1).padStart(3, "0")}`;
  const expense = await prisma.expense.create({
    data: {
      id,
      submitterEmail: caller.email,
      submitterName: caller.name,
      submitterDepartment: "Engineering",
      amount: Math.round(amount),
      category,
      description,
      status: "pending",
    },
  });
  return { success: true, expense };
}

async function listMyExpenses(caller: Caller): Promise<ToolResult> {
  const expenses = await prisma.expense.findMany({
    where: { submitterEmail: caller.email },
    orderBy: { submittedAt: "desc" },
  });
  return { success: true, expenses };
}

async function listTeamExpenses(_caller: Caller): Promise<ToolResult> {
  const expenses = await prisma.expense.findMany({
    orderBy: { submittedAt: "desc" },
  });
  return { success: true, expenses };
}

async function approveExpense(args: ToolEvent, caller: Caller): Promise<ToolResult> {
  const expenseId = String(args.expenseId ?? "");
  if (!expenseId) return { success: false, error: "missing_expenseId" };

  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense) return { success: false, error: "expense_not_found" };

  // AVP IsAuthorized — Lambda constructs principal from the verified caller identity (sourced from the JWT by the gateway interceptor).
  const decision = await mapper.authorize({
    principal: { type: "User", id: caller.email },
    action: "approveExpense",
    resource: { type: "Expense", id: expense.id },
    entities: [
      {
        identifier: { type: "User", id: caller.email },
        parents: caller.groups.map((g) => ({ type: "Group", id: g })),
      },
      {
        identifier: { type: "Expense", id: expense.id },
        attributes: {
          amount: expense.amount,
          submitterEmail: expense.submitterEmail,
          status: expense.status,
        },
      },
    ],
  });

  if (!decision.allowed) {
    return {
      success: false,
      error: "forbidden",
      layer: "amazon_verified_permissions",
      determiningPolicies: decision.determiningPolicies,
    };
  }

  const updated = await prisma.expense.update({
    where: { id: expense.id },
    data: { status: "approved" },
  });
  return { success: true, expense: updated };
}

async function rejectExpense(args: ToolEvent): Promise<ToolResult> {
  const expenseId = String(args.expenseId ?? "");
  if (!expenseId) return { success: false, error: "missing_expenseId" };
  const reason = String(args.reason ?? "");
  const updated = await prisma.expense.update({
    where: { id: expenseId },
    data: { status: "rejected" },
  });
  return { success: true, expense: updated, reason };
}
