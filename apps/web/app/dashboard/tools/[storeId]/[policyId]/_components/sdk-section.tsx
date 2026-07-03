"use client";

import { SdkUsage } from "./sdk-usage";
import type {
  ToolPolicy,
  ToolPolicyStore,
} from "../../../_components/constants";

interface SdkSectionProps {
  policy: ToolPolicy;
  store: ToolPolicyStore;
}

export function SdkSection({ policy, store }: SdkSectionProps) {
  return <SdkUsage policy={policy} store={store} />;
}
