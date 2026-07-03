"use client";

import { $orpc } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AgentForm } from "./_components";
import type { Agent } from "./_components/constants";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchAgent = async () => {
      try {
        const { agent } = await $orpc.getAgent({ id });
        setAgent(agent);
      } catch (err: any) {
        setError(err.message || "Failed to load agent");
        console.error("Error fetching agent:", err);
      }
    };

    fetchAgent();
  }, [id]);

  if (error) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full flex-col items-center justify-center gap-2">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full flex-col items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return <AgentForm agent={agent} onAgentUpdated={setAgent} />;
}
