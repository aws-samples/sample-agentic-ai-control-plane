import type { PolicySchema } from "@package/policy";

// Schema authored alongside the AVP policy store. Mirrors the JSON schema the admin pastes into the Schema Editor on the tool store detail page.
export const expenseSchema: PolicySchema = {
  namespace: "AnyCompany",
  entityTypes: {
    User: {
      attributes: {
        "custom:department": "String",
        "custom:approval_limit": "Long",
      },
    },
    Group: {
      attributes: {},
    },
    Expense: {
      attributes: {
        amount: "Long",
        submitterEmail: "String",
        status: "String",
      },
    },
  },
  actions: {
    approveExpense: {
      principalTypes: ["User"],
      resourceTypes: ["Expense"],
      context: {},
    },
  },
};
