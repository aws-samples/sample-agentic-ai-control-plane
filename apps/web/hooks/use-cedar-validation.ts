"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  CheckParseAnswer,
  FormattingAnswer,
  DetailedError,
} from "@cedar-policy/cedar-wasm";

type CedarModule = typeof import("@cedar-policy/cedar-wasm");

export type CedarDiagnostic = {
  message: string;
  severity: "error" | "warning" | "advice";
  help: string | null;
  start?: number;
  end?: number;
};

export type CedarValidationResult = {
  isValid: boolean;
  diagnostics: CedarDiagnostic[];
};

function toDiagnostics(errors: DetailedError[]): CedarDiagnostic[] {
  return errors.map((e) => ({
    message: e.message,
    severity: e.severity ?? "error",
    help: e.help,
    start: e.sourceLocations?.[0]?.start,
    end: e.sourceLocations?.[0]?.end,
  }));
}

export function useCedarValidation() {
  const cedarRef = useRef<CedarModule | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@cedar-policy/cedar-wasm")
      .then((mod) => {
        if (!cancelled) {
          cedarRef.current = mod;
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const checkParse = useCallback(
    (policyText: string): CedarValidationResult => {
      const cedar = cedarRef.current;
      if (!cedar) return { isValid: false, diagnostics: [] };

      const result: CheckParseAnswer = cedar.checkParsePolicySet({
        staticPolicies: policyText,
      });

      if (result.type === "success") {
        return { isValid: true, diagnostics: [] };
      }

      return {
        isValid: false,
        diagnostics: toDiagnostics(result.errors),
      };
    },
    [],
  );

  const formatPolicy = useCallback(
    (
      policyText: string,
      options?: { lineWidth?: number; indentWidth?: number },
    ): { success: boolean; formatted?: string; errors?: CedarDiagnostic[] } => {
      const cedar = cedarRef.current;
      if (!cedar)
        return {
          success: false,
          errors: [
            {
              message: "Cedar WASM not loaded",
              severity: "error",
              help: null,
            },
          ],
        };

      const result: FormattingAnswer = cedar.formatPolicies({
        policyText,
        lineWidth: options?.lineWidth ?? 80,
        indentWidth: options?.indentWidth ?? 2,
      });

      if (result.type === "success") {
        return { success: true, formatted: result.formatted_policy };
      }

      return { success: false, errors: toDiagnostics(result.errors) };
    },
    [],
  );

  return {
    isLoading,
    loadError,
    checkParse,
    formatPolicy,
  };
}
