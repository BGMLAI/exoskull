"use client";

import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, AgentActionData } from "@/lib/stream/types";

interface AgentActionProps {
  event: StreamEvent;
}

export function AgentAction({ event }: AgentActionProps) {
  const data = event.data as AgentActionData;

  return (
    <div className="flex items-center gap-2 px-3 py-1 animate-in fade-in duration-200">
      {data.status === "running" && (
        <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
      )}
      {data.status === "done" && (
        <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />
      )}
      {data.status === "error" && (
        <XCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
      )}
      <span className="text-xs text-muted-foreground">{data.displayLabel}</span>
      {data.status === "done" && data.durationMs != null && (
        <span className="text-[10px] text-muted-foreground/60">
          {data.durationMs < 1000
            ? `${data.durationMs}ms`
            : `${(data.durationMs / 1000).toFixed(1)}s`}
        </span>
      )}
    </div>
  );
}
