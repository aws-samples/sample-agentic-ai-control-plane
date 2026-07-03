"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";
import type { ToolPolicy } from "../../../_components/constants";

interface PolicyDefinitionProps {
  policy: ToolPolicy;
}

export function PolicyDefinition({ policy }: PolicyDefinitionProps) {
  const t = useTranslations("ToolPolicyDetail");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          {t("definition.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {policy.cedarCode ? (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("definition.cedar")}
            </p>
            <pre className="rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
              {policy.cedarCode}
            </pre>
            {policy.isTemplateLinked && policy.templateLinkId && (
              <p className="text-xs text-muted-foreground">
                {t("definition.templateNote")}{" "}
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
                  {policy.templateLinkId}
                </code>
                {" · "}
                <a
                  href="https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/policy-templates-create-policy.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:no-underline"
                >
                  {t("definition.templateDocs")}
                </a>
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("definition.noDefinition")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
