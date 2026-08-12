"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import { $orpc } from "@/lib/api";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface CreateRegistryDialogProps {
  onSuccess: () => void;
}

export function CreateRegistryDialog({ onSuccess }: CreateRegistryDialogProps) {
  const t = useTranslations("CreateRegistryDialog");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [autoApproval, setAutoApproval] = useState(false);
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inbound authorization (how consumers access the registry's discovery APIs).
  // AWS_IAM (default) needs no extra config; CUSTOM_JWT needs a discovery URL and
  // optionally allowed audiences/scopes.
  const [authorizerType, setAuthorizerType] = useState<"AWS_IAM" | "CUSTOM_JWT">(
    "AWS_IAM",
  );
  const [jwtDiscoveryUrl, setJwtDiscoveryUrl] = useState("");
  const [jwtAudience, setJwtAudience] = useState("");
  const [jwtScopes, setJwtScopes] = useState("");

  const resetForm = () => {
    setName("");
    setDescription("");
    setAutoApproval(false);
    setAuthorizerType("AWS_IAM");
    setJwtDiscoveryUrl("");
    setJwtAudience("");
    setJwtScopes("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError(t("validation.nameRequired"));
      return;
    }

    // Validate name format
    const nameRegex = /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/;
    if (!nameRegex.test(name)) {
      setError(t("validation.nameFormat"));
      return;
    }

    if (authorizerType === "CUSTOM_JWT" && !jwtDiscoveryUrl.trim()) {
      setError("A discovery URL is required for JWT authorization.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const discoveryConfiguration =
        authorizerType === "CUSTOM_JWT"
          ? {
              authorizerType: "CUSTOM_JWT" as const,
              authorizerConfiguration: {
                customJWTAuthorizer: {
                  discoveryUrl: jwtDiscoveryUrl.trim(),
                  ...(jwtAudience.trim() && {
                    allowedAudience: jwtAudience
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }),
                  ...(jwtScopes.trim() && {
                    allowedScopes: jwtScopes
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }),
                },
              },
            }
          : { authorizerType: "AWS_IAM" as const };

      await $orpc.createRegistry({
        name: name.trim(),
        description: description.trim() || undefined,
        discoveryConfiguration,
        approvalConfiguration: {
          // GA: autoApproval bool -> autoApprovalRules enum array.
          // ["APPROVE_ALL"] == auto-approve; [] == manual approval.
          autoApprovalRules: autoApproval ? ["APPROVE_ALL"] : [],
        },
      });

      toast.success(t("toast.success"));
      setOpen(false);
      resetForm();
      onSuccess();
    } catch (err: any) {
      const errorMessage = err.message || t("toast.error");
      setError(errorMessage);
      toast.error(errorMessage);
      console.error("Error creating registry:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isLoading) {
      setOpen(newOpen);
      if (!newOpen) resetForm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" />
        {t("trigger")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>
              {t("description")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                {t("nameLabel")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
                disabled={isLoading}
                maxLength={48}
              />
              {nameError ? (
                <p className="text-xs text-destructive">{nameError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("nameHint")}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">{t("descriptionLabel")}</Label>
              <Textarea
                id="description"
                placeholder={t("descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isLoading}
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="auto-approval">{t("autoApprovalLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("autoApprovalHint")}
                </p>
              </div>
              <Switch
                id="auto-approval"
                checked={autoApproval}
                onCheckedChange={setAutoApproval}
                disabled={isLoading}
              />
            </div>

            {/* Inbound authorization for the registry's discovery APIs. */}
            <div className="grid gap-2">
              <Label htmlFor="authorizer-type">Consumer authorization</Label>
              <Select
                value={authorizerType}
                onValueChange={(v) =>
                  setAuthorizerType(v as "AWS_IAM" | "CUSTOM_JWT")
                }
                disabled={isLoading}
              >
                <SelectTrigger id="authorizer-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AWS_IAM">AWS IAM (default)</SelectItem>
                  <SelectItem value="CUSTOM_JWT">JWT bearer token</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How consumers authenticate to the registry&apos;s search, browse,
                and MCP endpoints. Does not affect who can manage the registry.
              </p>
            </div>

            {authorizerType === "CUSTOM_JWT" && (
              <div className="grid gap-3 rounded-lg border p-3">
                <div className="grid gap-2">
                  <Label htmlFor="jwt-discovery-url">
                    Discovery URL <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="jwt-discovery-url"
                    placeholder="https://issuer.example.com/.well-known/openid-configuration"
                    value={jwtDiscoveryUrl}
                    onChange={(e) => setJwtDiscoveryUrl(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="jwt-audience">Allowed audience</Label>
                  <Input
                    id="jwt-audience"
                    placeholder="Comma-separated (optional)"
                    value={jwtAudience}
                    onChange={(e) => setJwtAudience(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="jwt-scopes">Allowed scopes</Label>
                  <Input
                    id="jwt-scopes"
                    placeholder="Comma-separated (optional)"
                    value={jwtScopes}
                    onChange={(e) => setJwtScopes(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? t("creating") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
