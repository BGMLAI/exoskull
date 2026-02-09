"use client";

import { useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, InsightCardData } from "@/lib/stream/types";

interface InsightCardProps {
  event: StreamEvent;
}

export function InsightCard({ event }: InsightCardProps) {
  const data = event.data as InsightCardData;
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="animate-in fade-in slide-in-from-left-2 duration-300">
      <div
        className={cn(
          "border-l-4 border-primary bg-primary/5 rounded-lg p-3 relative",
          "max-w-[85%]",
        )}
      >
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 p-0.5 rounded hover:bg-background/50 transition-colors text-muted-foreground/50 hover:text-muted-foreground"
        >
          <X className="w-3 h-3" />
        </button>

        <div className="flex items-start gap-2 pr-5">
          <Lightbulb className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{data.title}</p>
            <p className="text-xs text-muted-foreground">{data.body}</p>
            <span className="inline-block text-[10px] text-muted-foreground/60 bg-muted rounded px-1.5 py-0.5">
              {data.source}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
