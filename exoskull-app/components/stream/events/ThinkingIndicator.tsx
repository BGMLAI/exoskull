"use client";

import { useState, useEffect, useRef } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  ChevronDown,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  StreamEvent,
  ThinkingStepData,
  ThinkingStep,
  ToolAction,
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

function ToolIcon({ status }: { status: ToolAction["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />;
    case "done":
      return (
        <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />
      );
    case "error":
      return <XCircle className="w-3 h-3 text-red-600 dark:text-red-400" />;
  }
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function ThinkingIndicator({ event }: ThinkingIndicatorProps) {
  const data = event.data as ThinkingStepData;
  const [expanded, setExpanded] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tools = data.toolActions || [];
  const stepsAllDone =
    data.steps.length > 0 && data.steps.every((s) => s.status === "done");
  const toolsAllDone =
    tools.length === 0 || tools.every((t) => t.status !== "running");
  const allDone = stepsAllDone && toolsAllDone;

  const currentStep = data.steps.find((s) => s.status === "running");
  const currentTool = tools.find((t) => t.status === "running");
  const label = currentTool
    ? currentTool.displayLabel
    : currentStep?.label || (allDone ? "Gotowe" : "Przetwarzam...");

  const doneToolCount = tools.filter((t) => t.status === "done").length;
  const errorToolCount = tools.filter((t) => t.status === "error").length;

  // Auto-collapse 5s after all steps complete
  useEffect(() => {
    if (allDone && expanded) {
      collapseTimer.current = setTimeout(() => setExpanded(false), 5_000);
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
        {tools.length > 0 && (
          <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
            <Wrench className="w-2.5 h-2.5" />
            {doneToolCount}
            {errorToolCount > 0 && (
              <span className="text-red-500">/{errorToolCount}err</span>
            )}
          </span>
        )}
        <ChevronDown
          className={cn(
            "w-3 h-3 text-muted-foreground/50 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      {/* Expanded process view */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          expanded ? "max-h-80 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="pl-6 pr-3 pb-2 space-y-0.5">
          {/* Thinking steps */}
          {data.steps.map((step, i) => (
            <div key={`s-${i}`} className="flex items-center gap-2">
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

          {/* Tool actions */}
          {tools.length > 0 && data.steps.length > 0 && (
            <div className="h-px bg-border/50 my-1" />
          )}
          {tools.map((tool, i) => (
            <div
              key={`t-${i}`}
              className={cn(
                "flex items-center gap-2 rounded px-1 py-0.5",
                tool.status === "error" && "bg-red-50/50 dark:bg-red-950/20",
              )}
            >
              <ToolIcon status={tool.status} />
              <span
                className={cn(
                  "text-xs flex-1",
                  tool.status === "done"
                    ? "text-muted-foreground/60"
                    : tool.status === "error"
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground",
                )}
              >
                {tool.displayLabel}
              </span>
              {tool.status === "done" && tool.durationMs != null && (
                <span className="text-[10px] text-muted-foreground/50">
                  {formatDuration(tool.durationMs)}
                </span>
              )}
              {tool.resultSummary && tool.status === "done" && (
                <span className="text-[10px] text-muted-foreground/40 truncate max-w-[120px]">
                  {tool.resultSummary}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
