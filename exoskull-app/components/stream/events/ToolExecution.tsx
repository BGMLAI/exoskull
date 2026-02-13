/**
 * ToolExecution — Live view of tool executing in the stream
 *
 * Shows: tool name, status, progress, input/output, logs
 * Like a mini terminal for each tool call.
 */
"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Loader2,
  XCircle,
  Wrench,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamEvent, ToolExecutionData } from "@/lib/stream/types";

interface ToolExecutionProps {
  event: StreamEvent;
}

export function ToolExecution({ event }: ToolExecutionProps) {
  const data = event.data as ToolExecutionData;
  const [expanded, setExpanded] = useState(data.status === "running");

  const statusConfig = {
    queued: {
      icon: <Clock className="w-3.5 h-3.5 text-gray-400" />,
      color: "text-gray-500",
      bg: "bg-gray-500/5",
    },
    running: {
      icon: <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/5",
    },
    done: {
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-500/5",
    },
    error: {
      icon: <XCircle className="w-3.5 h-3.5 text-red-500" />,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-500/5",
    },
  };

  const config = statusConfig[data.status];

  return (
    <div
      className={cn(
        "max-w-lg rounded-lg border border-border/40 overflow-hidden",
        config.bg,
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors"
      >
        {config.icon}
        <Wrench className="w-3 h-3 text-muted-foreground/60" />
        <span
          className={cn(
            "text-xs font-medium flex-1 text-left truncate",
            config.color,
          )}
        >
          {data.displayLabel}
        </span>

        {/* Progress bar */}
        {data.progress !== undefined && data.status === "running" && (
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${data.progress}%` }}
            />
          </div>
        )}

        {/* Duration */}
        {data.durationMs !== undefined && (
          <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">
            {data.durationMs < 1000
              ? `${data.durationMs}ms`
              : `${(data.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}

        {expanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground/50" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
        )}
      </button>

      {/* Detail */}
      {expanded && (
        <div className="px-3 pb-2 space-y-1.5 text-[10px] font-mono">
          {data.inputPreview && (
            <div className="rounded bg-muted/40 px-2 py-1">
              <div className="text-muted-foreground/40 mb-0.5">Input:</div>
              <pre className="text-muted-foreground whitespace-pre-wrap break-words">
                {data.inputPreview}
              </pre>
            </div>
          )}

          {data.outputPreview && (
            <div
              className={cn(
                "rounded px-2 py-1",
                data.status === "error" ? "bg-red-500/10" : "bg-green-500/10",
              )}
            >
              <div className="text-muted-foreground/40 mb-0.5">Output:</div>
              <pre className="text-muted-foreground whitespace-pre-wrap break-words">
                {data.outputPreview}
              </pre>
            </div>
          )}

          {data.logs && data.logs.length > 0 && (
            <div className="rounded bg-[#1e1e2e] dark:bg-[#0d1117] px-2 py-1 max-h-32 overflow-y-auto">
              <div className="text-gray-500 mb-0.5">Logs:</div>
              {data.logs.map((log, i) => (
                <div key={i} className="text-gray-400">
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
