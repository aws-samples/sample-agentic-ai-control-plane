"use client";

import { $orpc } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PlatformSettings } from "./_components";
import type { Model, Persona } from "./_components/constants";

export default function Page() {
  const [models, setModels] = useState<Model[] | null>(null);
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [modelsRes, personasRes] = await Promise.all([
          $orpc.listModels(),
          $orpc.listPersonas(),
        ]);
        setModels(modelsRes.models);
        setPersonas(personasRes.personas);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load settings data",
        );
        console.error("Error fetching settings data:", err);
      }
    };

    fetchData();
  }, []);

  if (error) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full flex-col items-center justify-center gap-2">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  if (!models || !personas) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full flex-col items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <PlatformSettings
      models={models}
      onModelsChanged={setModels}
      personas={personas}
      onPersonasChanged={setPersonas}
    />
  );
}
