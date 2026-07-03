export type AttributeType =
  | "String"
  | "Boolean"
  | "Long"
  | "Decimal"
  | "Set"
  | "Record";

export type EntityTypeDefinition = {
  attributes: Record<string, AttributeType>;
};

export type ActionDefinition = {
  principalTypes: string[];
  resourceTypes: string[];
  context?: Record<
    string,
    {
      type: AttributeType;
      required: boolean;
    }
  >;
};

export type PolicySchema = {
  namespace: string;
  entityTypes: Record<string, EntityTypeDefinition>;
  actions: Record<string, ActionDefinition>;
};
