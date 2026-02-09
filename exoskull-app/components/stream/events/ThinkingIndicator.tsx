"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle2, Circle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  StreamEvent,
  ThinkingStepData,
  ThinkingStep,
} from "@/lib/stream/types";

interface ThinkingIndicatorProps {
  event: StreamEvent;
}

function StepIcon({ status }: { status: ThinkingStep["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="w-3 h-3 text-primary animate-spin" />;
    case "done":
      return (
        <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />
      );
    default:
      return <Circle className="w-3 h-3 text-muted-foreground/40" />;
  }
}

export function ThinkingIndicator({ event }: ThinkingIndicatorProps) {
  const data = event.data as ThinkingStepData;
  const [expanded, setExpanded] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allDone =
    data.steps.length > 0 && data.steps.every((s) => s.status === "done");
  const currentStep = data.steps.find((s) => s.status === "running");
  const label = currentStep?.label || (allDone ? "Gotowe" : "Przetwarzam...");

  // Auto-collapse 2s after all steps complete
  useEffect(() => {
    if (allDone && expanded) {
      collapseTimer.current = setTimeout(() => setExpanded(false), 2000);
    }
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, [allDone, expanded]);

  return (
    <div className="animate-in fade-in duration-200">
      {/* Collapsed bar */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 w-full text-left rounded-lg hover:bg-muted/50 transition-colors"
      >
        {allDone ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
        ) : (
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
        )}
        <span className="text-xs text-muted-foreground flex-1">{label}</span>
        <ChevronDown
          className={cn(
            "w-3 h-3 text-muted-foreground/50 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {/* Expanded steps */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          expanded ? "max-h-60 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="pl-6 pr-3 pb-2 space-y-1">
          {data.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <StepIcon status={step.status} />
              <span
                className={cn(
                  "text-xs",
                  step.status === "done"
                    ? "text-muted-foreground/60"
                    : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
