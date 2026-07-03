"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  CircleAlert,
  Info,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { $orpc } from "@/lib/api";

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: any;
};

type AuthType = "none" | "sigv4" | "jwt";

interface McpToolTesterProps {
  endpoint: string | null;
  protocol: string;
}

export function McpToolTester({ endpoint, protocol }: McpToolTesterProps) {
  const [tools, setTools] = useState<McpTool[]>([]);
  const [selectedTool, setSelectedTool] = useState("");
  const [args, setArgs] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [authType, setAuthType] = useState<AuthType>("none");
  const [bearerToken, setBearerToken] = useState("");

  if (protocol === "A2A") {
    return (
      <div className="rounded-lg border bg-muted/30 px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0" />
        A2A agent card testing is not available yet.
      </div>
    );
  }

  if (!endpoint) {
    return (
      <div className="rounded-lg border bg-muted/30 px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0" />
        No endpoint URL found in the server schema.
      </div>
    );
  }

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    setConnected(false);
    setTools([]);
    setResult(null);
    setResultError(null);
    try {
      const res = await $orpc.testMcpEndpoint({
        endpoint,
        authType,
        bearerToken: authType === "jwt" ? bearerToken : undefined,
      });
      if (res.success && res.tools) {
        setTools(res.tools);
        setConnected(true);
        if (res.tools.length > 0) {
          setSelectedTool(res.tools[0].name);
          setArgs({});
        }
      } else {
        setError(res.error || "Failed to connect");
      }
    } catch (err: any) {
      setError(err.message || "Connection failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToolChange = (name: string | null) => {
    if (!name) return;
    setSelectedTool(name);
    setArgs({});
    setResult(null);
    setResultError(null);
  };

  const handleExecute = async () => {
    if (!selectedTool) return;
    setIsExecuting(true);
    setResult(null);
    setResultError(null);
    const tool = tools.find((t) => t.name === selectedTool);
    const properties = tool?.inputSchema?.properties || {};
    const parsedArgs: Record<string, any> = {};
    for (const [key, value] of Object.entries(args)) {
      if (!value) continue;
      const propType = properties[key]?.type;
      parsedArgs[key] =
        propType === "number" || propType === "integer" ? Number(value) : value;
    }
    try {
      const res = await $orpc.callMcpTool({
        endpoint,
        authType,
        bearerToken: authType === "jwt" ? bearerToken : undefined,
        toolName: selectedTool,
        arguments: parsedArgs,
      });
      if (res.success) setResult(res.result);
      else setResultError(res.error || "Execution failed");
    } catch (err: any) {
      setResultError(err.message || "Execution failed");
    } finally {
      setIsExecuting(false);
    }
  };

  const currentTool = tools.find((t) => t.name === selectedTool);
  const properties = currentTool?.inputSchema?.properties || {};
  const required: string[] = currentTool?.inputSchema?.required || [];

  return (
    <div className="space-y-4">
      <code className="block text-xs bg-muted px-3 py-2 rounded-md font-mono truncate">
        {endpoint}
      </code>

      {/* Auth Configuration */}
      <div className="space-y-3 rounded-lg border p-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Authentication</Label>
          <Select
            value={authType}
            onValueChange={(v) => {
              setAuthType(v as AuthType);
              setConnected(false);
              setTools([]);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="sigv4">SigV4 (AWS IAM)</SelectItem>
              <SelectItem value="jwt">JWT (Bearer Token)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {authType === "jwt" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Bearer Token</Label>
            <Input
              type="password"
              placeholder="Paste your JWT token"
              value={bearerToken}
              onChange={(e) => setBearerToken(e.target.value)}
            />
          </div>
        )}
      </div>

      {!connected && (
        <Button className="w-full" onClick={handleConnect} disabled={isLoading}>
          {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          {isLoading ? "Connecting..." : "Connect"}
        </Button>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm flex items-center gap-2 text-destructive">
          <CircleAlert className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {connected && tools.length > 0 && (
        <>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-3 text-sm flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            Connected — {tools.length} tool(s) available
            <Button size="xs" variant="ghost" onClick={handleConnect} className="ml-auto">
              <RefreshCw className="size-3" />
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Select Tool</Label>
            <Select value={selectedTool} onValueChange={handleToolChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tools.map((t) => (
                  <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentTool?.description && (
              <p className="text-xs text-muted-foreground">{currentTool.description}</p>
            )}
          </div>

          {Object.keys(properties).length > 0 && (
            <div className="space-y-3 rounded-lg border p-3">
              {Object.entries(properties).map(([key, prop]: [string, any]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">
                    {key}
                    {required.includes(key) && <span className="text-destructive ml-0.5">*</span>}
                  </Label>
                  {prop.enum ? (
                    <Select value={args[key] || ""} onValueChange={(v) => { if (v) setArgs((prev) => ({ ...prev, [key]: v })); }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={prop.description || `Select ${key}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {prop.enum.map((val: string) => (
                          <SelectItem key={val} value={val}>{val}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={prop.type === "number" || prop.type === "integer" ? "number" : "text"}
                      placeholder={prop.description || key}
                      value={args[key] || ""}
                      onChange={(e) => setArgs((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <Button className="w-full" onClick={handleExecute} disabled={isExecuting || !selectedTool}>
            {isExecuting ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {isExecuting ? "Executing..." : "Execute"}
          </Button>

          {result && (
            <div className="rounded-lg border bg-muted">
              <div className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">Result</div>
              <pre className="text-xs p-3 overflow-auto max-h-[300px] whitespace-pre-wrap break-all">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {resultError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm flex items-center gap-2 text-destructive">
              <CircleAlert className="size-4 shrink-0" />
              {resultError}
            </div>
          )}
        </>
      )}
    </div>
  );
}
