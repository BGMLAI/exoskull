"use client";

import { useState } from "react";
import { Phone, ChevronDown, ChevronUp, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, CallTranscriptData } from "@/lib/stream/types";

interface CallTranscriptProps {
  event: StreamEvent;
}

export function CallTranscript({ event }: CallTranscriptProps) {
  const data = event.data as CallTranscriptData;
  const [expanded, setExpanded] = useState(false);
  const isInbound = data.direction === "inbound";

  const preview =
    data.transcript.length > 150
      ? data.transcript.slice(0, 150) + "..."
      : data.transcript;

  const durationFormatted = data.durationSec
    ? `${Math.floor(data.durationSec / 60)}:${String(data.durationSec % 60).padStart(2, "0")}`
    : null;

  return (
    <div className="pl-3 border-l-2 border-l-amber-500 animate-in fade-in duration-300">
      <div className="flex items-center gap-1.5 mb-1">
        <Phone className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
          {isInbound ? "Polaczenie przychodzace" : "Polaczenie wychodzace"}
        </span>
        {data.callerName && (
          <span className="text-xs text-muted-foreground">
            {data.callerName}
          </span>
        )}
        {durationFormatted && (
          <span className="text-xs text-muted-foreground ml-auto">
            {durationFormatted}
          </span>
        )}
      </div>

      <p className="text-sm text-foreground whitespace-pre-wrap">
        {expanded ? data.transcript : preview}
      </p>

      <div className="flex items-center gap-2 mt-1">
        {data.transcript.length > 150 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" /> Zwiń
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" /> Rozwin
              </>
            )}
          </button>
        )}
        {data.recordingUrl && (
          <a
            href={data.recordingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-xs text-primary hover:underline"
          >
            <Play className="w-3 h-3" /> Nagranie
          </a>
        )}
      </div>
    </div>
  );
}
