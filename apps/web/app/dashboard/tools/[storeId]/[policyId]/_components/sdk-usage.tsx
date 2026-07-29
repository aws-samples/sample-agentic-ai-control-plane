"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, ChevronRight, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import MonacoEditor from "@monaco-editor/react";
// Self-host Monaco under the app CSP (no CDN) — see lib/monaco-setup.ts
import "@/lib/monaco-setup";
import type { ToolPolicy, ToolPolicyStore } from "../../../_components/constants";

interface SdkUsageProps {
  policy: ToolPolicy;
  store: ToolPolicyStore;
}

function CodeBlock({
  code,
  label,
  defaultOpen = false,
}: {
  code: string;
  label?: string;
  defaultOpen?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const { resolvedTheme } = useTheme();

  const lineCount = code.split("\n").length;
  const editorHeight = Math.min(Math.max(lineCount * 19 + 24, 80), 500);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-3 py-2">
          <CollapsibleTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              />
            }
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
            />
            {label}
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
        </div>
        <CollapsibleContent>
          <div className="border-t overflow-hidden">
            <MonacoEditor
              height={editorHeight}
              defaultLanguage="typescript"
              theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
              value={code}
              options={{
                readOnly: true,
                fontSize: 12,
                fontFamily:
                  "var(--font-mono, 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace)",
                minimap: { enabled: false },
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                padding: { top: 8, bottom: 8 },
                renderLineHighlight: "none",
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: {
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6,
                  alwaysConsumeMouseWheel: false,
                },
                automaticLayout: true,
                domReadOnly: true,
                contextmenu: false,
                folding: true,
                guides: { indentation: false },
              }}
              loading={
                <div className="flex items-center justify-center" style={{ height: editorHeight }}>
                  <p className="text-xs text-muted-foreground">Loading...</p>
                </div>
              }
            />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function CollapsibleSection({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border">
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            />
          }
        >
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          />
          {label}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function generateSchemaSnippet(policy: ToolPolicy, store: ToolPolicyStore): string {
  if (store.schemaJson) {
    return `import type { PolicySchema } from "@package/policy";

// Authored schema pulled from the policy store in AWS Verified Permissions.
const schema: PolicySchema = ${store.schemaJson};`;
  }

  const contextEntries = policy.contextFields
    .map((f) => {
      return `        ${f.name}: { type: "${f.type}", required: ${f.required} },`;
    })
    .join("\n");

  return `import type { PolicySchema } from "@package/policy";

const schema: PolicySchema = {
  namespace: "${store.namespace}",

  entityTypes: {
${policy.principalTypes.map((pt) => `    ${pt}: {\n      attributes: {\n        tenantId: "String",\n        role: "String",\n      },\n    },`).join("\n")}
${policy.resourceTypes.map((rt) => `    ${rt}: {\n      attributes: {\n        tenantId: "String",\n      },\n    },`).join("\n")}
  },

  actions: {
    ${policy.action || "DefaultAction"}: {
      principalTypes: [${policy.principalTypes.map((p) => `"${p}"`).join(", ")}],
      resourceTypes: [${policy.resourceTypes.map((r) => `"${r}"`).join(", ")}],
      context: {
${contextEntries}
      },
    },
  },
};`;
}

function generateUsageSnippet(policy: ToolPolicy, store: ToolPolicyStore): string {
  const contextArgs = policy.contextFields
    .map((f) => {
      if (f.type === "String") return `    ${f.name}: session.${f.name},`;
      if (f.type === "Boolean") return `    ${f.name}: session.${f.name}Verified,`;
      return `    ${f.name}: session.${f.name},`;
    })
    .join("\n");

  const principalType = policy.principalTypes[0] ?? "User";
  const resourceType = policy.resourceTypes[0] ?? "Resource";
  const resourceIdVar = resourceType.charAt(0).toLowerCase() + resourceType.slice(1) + "Id";

  return `import { PolicyMapper } from "@package/policy";

const auth = new PolicyMapper({
  region: "${store.region}",
  policyStoreId: "${store.awsPolicyStoreId ?? ""}",
  schema,
});

const result = await auth.authorize({
  principal: { type: "${principalType}", id: session.userId },
  action: "${policy.action}",
  resource: { type: "${resourceType}", id: ${resourceIdVar} },
  context: {
${contextArgs}
  },
});

if (!result.allowed) {
  throw new ForbiddenError("Access denied: ${policy.action}");
}`;
}

function generateErrorHandlingSnippet(policy: ToolPolicy): string {
  return `import { PolicyMapper, PolicyValidationError } from "@package/policy";

try {
  const result = await auth.authorize({
    principal: { type: "${policy.principalTypes[0] ?? "User"}", id: userId },
    action: "${policy.action}",
    resource: { type: "${policy.resourceTypes[0] ?? "Resource"}", id: resourceId },
    context: {
${policy.contextFields.filter((f) => f.required).map((f) => `      ${f.name}: /* ${f.type} value */,`).join("\n")}
    },
  });

  if (result.allowed) {
    // Proceed with the operation
  } else {
    console.warn("Denied by policies:", result.determiningPolicies);
  }
} catch (error) {
  if (error instanceof PolicyValidationError) {
    // Schema mismatch — fix the request shape
    console.error(\`Validation: \${error.code} — \${error.message}\`);
  }
  // Fail closed by default
  throw error;
}`;
}

export function SdkUsage({ policy, store }: SdkUsageProps) {
  const t = useTranslations("ToolPolicyDetail");

  const schemaSnippet = useMemo(() => generateSchemaSnippet(policy, store), [policy, store]);
  const usageSnippet = useMemo(() => generateUsageSnippet(policy, store), [policy, store]);
  const errorSnippet = useMemo(() => generateErrorHandlingSnippet(policy), [policy]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          {t("sdk.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("sdk.description")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <CodeBlock code={schemaSnippet} label={t("sdk.schema")} defaultOpen />
        <CodeBlock code={usageSnippet} label={t("sdk.usage")} />
        <CodeBlock code={errorSnippet} label={t("sdk.errorHandling")} />

        <CollapsibleSection label={t("sdk.contextMapping")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("sdk.table.field")}</TableHead>
                  <TableHead className="text-xs">{t("sdk.table.type")}</TableHead>
                  <TableHead className="text-xs">{t("sdk.table.required")}</TableHead>
                  <TableHead className="text-xs">{t("sdk.table.mapsTo")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policy.contextFields.map((field) => (
                  <TableRow key={field.name}>
                    <TableCell>
                      <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
                        {field.name}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {field.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {field.required ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30"
                        >
                          {t("sdk.required")}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t("sdk.optional")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
                        context.{field.name}
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
                {policy.principalTypes.map((pt) => (
                  <TableRow key={`principal-${pt}`}>
                    <TableCell>
                      <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
                        principal ({pt})
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        Entity
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30"
                      >
                        {t("sdk.required")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
                        principal.entityId
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
                {policy.resourceTypes.map((rt) => (
                  <TableRow key={`resource-${rt}`}>
                    <TableCell>
                      <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
                        resource ({rt})
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        Entity
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30"
                      >
                        {t("sdk.required")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
                        resource.entityId
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </CollapsibleSection>
      </CardContent>
    </Card>
  );
}
