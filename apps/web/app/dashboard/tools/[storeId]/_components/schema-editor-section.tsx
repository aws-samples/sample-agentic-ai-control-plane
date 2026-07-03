"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { $orpc } from "@/lib/api";
import {
  SYNC_STATUS_CLASSES,
  type ToolPolicyStore,
} from "../../_components/constants";

interface SchemaEditorSectionProps {
  store: ToolPolicyStore;
  onSaved: () => void | Promise<void>;
}

function prettify(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function SchemaEditorSection({ store, onSaved }: SchemaEditorSectionProps) {
  const t = useTranslations("ToolStoreList.schema");
  const [text, setText] = useState<string>(() => prettify(store.schemaJson));
  const [isSaving, setIsSaving] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    setText(prettify(store.schemaJson));
  }, [store.schemaJson]);

  const isDirty = useMemo(
    () => text !== prettify(store.schemaJson),
    [text, store.schemaJson],
  );

  const handleValidate = (value: string): boolean => {
    if (!value.trim()) {
      setParseError(t("emptyError"));
      return false;
    }
    try {
      JSON.parse(value);
      setParseError(null);
      return true;
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
      return false;
    }
  };

  const handleSave = async () => {
    if (!handleValidate(text)) return;
    if (!store.awsPolicyStoreId) {
      toast.error(t("notReadyOnAws"));
      return;
    }
    setIsSaving(true);
    try {
      await $orpc.putToolPolicyStoreSchema({ id: store.id, schemaJson: text });
      toast.success(t("savedToast"));
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-sm font-semibold">{t("title")}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${SYNC_STATUS_CLASSES[store.schemaSyncStatus]}`}
          >
            {t(`syncValues.${store.schemaSyncStatus}`)}
          </Badge>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !isDirty || !!parseError || !store.awsPolicyStoreId}
            className="active:scale-[0.96]"
          >
            {isSaving ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Upload className="size-3.5 mr-1.5" />
            )}
            {t("saveAndSync")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (parseError) handleValidate(e.target.value);
          }}
          onBlur={() => handleValidate(text)}
          placeholder={t("placeholder")}
          spellCheck={false}
          className="font-mono text-xs min-h-[420px] leading-relaxed"
        />
        {parseError ? (
          <p className="text-xs text-destructive">{parseError}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">{t("hint")}</p>
        )}
      </CardContent>
    </Card>
  );
}
