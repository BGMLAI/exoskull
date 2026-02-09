"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { StreamEvent, EmotionReadingData } from "@/lib/stream/types";

interface EmotionCardProps {
  event: StreamEvent;
}

const quadrantColors: Record<EmotionReadingData["quadrant"], string> = {
  known_want: "bg-green-500",
  known_unwant: "bg-red-500",
  unknown_want: "bg-blue-500",
  unknown_unwant: "bg-amber-500",
};

const quadrantLabels: Record<EmotionReadingData["quadrant"], string> = {
  known_want: "Pozytywny",
  known_unwant: "Negatywny",
  unknown_want: "Ciekawość",
  unknown_unwant: "Niepewność",
};

export function EmotionCard({ event }: EmotionCardProps) {
  const data = event.data as EmotionReadingData;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex justify-center animate-in fade-in duration-300">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <span
          className={cn("w-2 h-2 rounded-full", quadrantColors[data.quadrant])}
          style={{ opacity: 0.4 + data.intensity * 0.6 }}
        />
        <span>Wykryto: {data.primaryEmotion}</span>
      </button>

      {expanded && (
        <div className="absolute mt-7 bg-popover border border-border rounded-lg p-2 text-xs shadow-lg z-10">
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Kwadrant:</span>
              <span>{quadrantLabels[data.quadrant]}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Walencja:</span>
              <span>{data.valence.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Pobudzenie:</span>
              <span>{(data.intensity * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
