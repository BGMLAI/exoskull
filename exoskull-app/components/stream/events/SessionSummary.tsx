"use client";

import { useState } from "react";
import { Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, SessionSummaryData } from "@/lib/stream/types";

interface SessionSummaryProps {
  event: StreamEvent;
}

export function SessionSummary({ event }: SessionSummaryProps) {
  const data = event.data as SessionSummaryData;
  const [expanded, setExpanded] = useState(false);

  const shortTopics =
    data.topics.length > 2
      ? data.topics.slice(0, 2).join(", ") + `... (+${data.topics.length - 2})`
      : data.topics.join(", ");

  return (
    <div className="flex justify-center py-2 animate-in fade-in duration-300">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-muted/50 hover:bg-muted transition-colors text-xs text-muted-foreground"
      >
        <Clock className="w-3 h-3" />
        <span>Sesja ({data.duration})</span>
        {!expanded && data.topics.length > 0 && (
          <span className="text-muted-foreground/60">— {shortTopics}</span>
        )}
        <ChevronDown
          className={cn(
            "w-3 h-3 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="absolute mt-8 bg-popover border border-border rounded-lg p-3 text-xs shadow-lg z-10 min-w-[200px]">
          <div className="space-y-2">
            {data.topics.length > 0 && (
              <div>
                <span className="text-muted-foreground font-medium">
                  Tematy:
                </span>
                <ul className="mt-1 space-y-0.5">
                  {data.topics.map((t, i) => (
                    <li key={i} className="text-foreground">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.toolsUsed.length > 0 && (
              <div>
                <span className="text-muted-foreground font-medium">
                  Narzedzia:
                </span>
                <span className="text-foreground ml-1">
                  {data.toolsUsed.join(", ")}
                </span>
              </div>
            )}
            {data.emotionSummary && (
              <div>
                <span className="text-muted-foreground font-medium">
                  Emocje:
                </span>
                <span className="text-foreground ml-1">
                  {data.emotionSummary}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
