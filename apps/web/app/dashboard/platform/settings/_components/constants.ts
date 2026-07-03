import { Cpu, Users, type LucideIcon } from "lucide-react";

export type SectionId = "models" | "personas";

export interface MenuSection {
  id: SectionId;
  labelKey: string;
  icon: LucideIcon;
}

export const MENU_SECTIONS: MenuSection[] = [
  { id: "models", labelKey: "sidebar.models", icon: Cpu },
  { id: "personas", labelKey: "sidebar.personas", icon: Users },
];

export interface Model {
  id: string;
  server: string;
  provider: string;
  name: string;
  profile: string;
  modelId: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ProviderPreset {
  id: string;
  name: string;
  icon: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "Anthropic", name: "Anthropic", icon: "/claude.png" },
  { id: "Amazon", name: "Amazon", icon: "/amazon.svg" },
  { id: "Moonshot", name: "Moonshot", icon: "/moonshot-ai.svg" },
  { id: "Z.ai", name: "Z.ai", icon: "/z-ai.svg" },
];

export const CUSTOM_PROVIDER_ID = "__custom__";
export const CUSTOM_MODEL_ID = "__custom_model__";

export interface InferenceProviderPreset {
  id: string;
  name: string;
  icon: string;
}

export const INFERENCE_PROVIDER_PRESETS: InferenceProviderPreset[] = [
  { id: "Amazon Bedrock", name: "Amazon Bedrock", icon: "/Bedrock.svg" },
];

export interface PersonaGroup {
  id: string;
  displayName: string;
  email?: string | null;
}

export interface Persona {
  id: string;
  name: string;
  provider: string;
  externalId: string;
  displayName: string;
  email: string | null;
  groups: PersonaGroup[];
  metadata: Record<string, unknown>;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface PersonaProviderPreset {
  id: string;
  name: string;
  icon: string;
}

export const PERSONA_PROVIDERS: PersonaProviderPreset[] = [
  { id: "entra-id", name: "Entra ID", icon: "/entra-id.png" },
  { id: "cognito", name: "AWS Cognito", icon: "/amazon-cognito.png" },
];
