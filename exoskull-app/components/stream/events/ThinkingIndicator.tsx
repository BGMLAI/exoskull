"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  ChevronDown,
  ChevronRight,
  Wrench,
  Brain,
  Clock,
  Zap,
  Code2,
  Search,
  Database,
  Globe,
  Mail,
  FileText,
  Terminal,
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

// ---------------------------------------------------------------------------
// Tool icon mapping — context-aware icons for different tool types
// ---------------------------------------------------------------------------

const TOOL_ICON_MAP: Record<string, React.ElementType> = {
  search_web: Globe,
  fetch_webpage: Globe,
  import_url: Globe,
  search_emails: Mail,
  send_email: Mail,
  email_summary: Mail,
  build_app: Code2,
  code_generation: Code2,
  search_knowledge: Search,
  knowledge_search: Search,
  query_database: Database,
  create_calendar_event: Clock,
  check_calendar: Clock,
  execute_code: Terminal,
};

function getToolIcon(toolName: string): React.ElementType {
  return TOOL_ICON_MAP[toolName] || Wrench;
}

// ---------------------------------------------------------------------------
// Neural pathway connector — animated vertical line with flowing dots
// ---------------------------------------------------------------------------

function NeuralPathway({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="absolute left-[18px] top-8 bottom-2 w-px">
      {/* Static gradient line */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/30 via-primary/10 to-transparent" />
      {/* Animated pulse dots */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="w-1.5 h-1.5 rounded-full bg-primary/80 absolute left-[-2px] animate-neural-pulse"
          style={{ animationDelay: "0ms" }}
        />
        <div
          className="w-1.5 h-1.5 rounded-full bg-primary/60 absolute left-[-2px] animate-neural-pulse"
          style={{ animationDelay: "600ms" }}
        />
        <div
          className="w-1.5 h-1.5 rounded-full bg-primary/40 absolute left-[-2px] animate-neural-pulse"
          style={{ animationDelay: "1200ms" }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step status icons — color-coded by state
// ---------------------------------------------------------------------------

function StepIcon({ status }: { status: ThinkingStep["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
    case "done":
      return (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
      );
    default:
      return <Circle className="w-3.5 h-3.5 text-muted-foreground/30" />;
  }
}

// ---------------------------------------------------------------------------
// Tool status icons — color-coded by state
// ---------------------------------------------------------------------------

function ToolStatusIcon({ status }: { status: ToolAction["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
    case "done":
      return (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
      );
    case "error":
      return <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />;
  }
}

// ---------------------------------------------------------------------------
// Duration formatter
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

// ---------------------------------------------------------------------------
// Elapsed timer — live counter for running steps
// ---------------------------------------------------------------------------

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(Date.now() - startedAt);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 100);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">
      {formatDuration(elapsed)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Individual tool action row — Claude Code style
// ---------------------------------------------------------------------------

function ToolActionRow({
  tool,
  isLast,
}: {
  tool: ToolAction;
  isLast: boolean;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const ToolIcon = getToolIcon(tool.toolName);
  const hasDetails = !!(
    tool.inputPreview ||
    tool.outputPreview ||
    tool.resultSummary
  );

  return (
    <div className="relative">
      {/* Connector line to next tool */}
      {!isLast && (
        <div className="absolute left-[7px] top-7 bottom-0 w-px bg-border/40" />
      )}

      <div
        className={cn(
          "flex items-start gap-2 rounded-md px-2 py-1.5 transition-all duration-200 group/tool",
          tool.status === "running" &&
            "bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/10",
          tool.status === "error" &&
            "bg-red-50/50 dark:bg-red-950/20 border border-red-500/10",
          tool.status === "done" && "opacity-70 hover:opacity-100",
        )}
      >
        {/* Tool icon (context-aware) */}
        <div className="flex-shrink-0 mt-0.5 relative">
          <ToolIcon
            className={cn(
              "w-3.5 h-3.5",
              tool.status === "running"
                ? "text-blue-500"
                : tool.status === "error"
                  ? "text-red-500"
                  : "text-muted-foreground/60",
            )}
          />
          {/* Status dot overlay */}
          <div className="absolute -bottom-0.5 -right-0.5">
            {tool.status === "running" && (
              <span className="block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            )}
            {tool.status === "error" && (
              <span className="block w-1.5 h-1.5 rounded-full bg-red-500" />
            )}
          </div>
        </div>

        {/* Tool info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs font-medium truncate",
                tool.status === "running"
                  ? "text-blue-700 dark:text-blue-300"
                  : tool.status === "error"
                    ? "text-red-600 dark:text-red-400"
                    : "text-foreground/70",
              )}
            >
              {tool.displayLabel}
            </span>

            {/* Duration or live timer */}
            {tool.status === "done" && tool.durationMs != null && (
              <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 font-mono tabular-nums">
                {formatDuration(tool.durationMs)}
              </span>
            )}
            {tool.status === "running" && (
              <ElapsedTimer startedAt={Date.now()} />
            )}

            {/* Expand button for details */}
            {hasDetails && tool.status !== "running" && (
              <button
                onClick={() => setDetailOpen((v) => !v)}
                className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground/40 hover:text-muted-foreground transition-colors opacity-0 group-hover/tool:opacity-100"
              >
                {detailOpen ? (
                  <ChevronDown className="w-2.5 h-2.5" />
                ) : (
                  <ChevronRight className="w-2.5 h-2.5" />
                )}
              </button>
            )}
          </div>

          {/* Brief result summary (always visible when done) */}
          {tool.resultSummary && tool.status === "done" && !detailOpen && (
            <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
              {tool.resultSummary}
            </p>
          )}

          {/* Expanded detail view */}
          {detailOpen && (
            <div className="mt-1.5 space-y-1 text-[10px] font-mono">
              {tool.inputPreview && (
                <div className="rounded bg-muted/50 px-2 py-1">
                  <span className="text-muted-foreground/40 block mb-0.5">
                    Input:
                  </span>
                  <pre className="text-muted-foreground whitespace-pre-wrap break-words">
                    {tool.inputPreview}
                  </pre>
                </div>
              )}
              {(tool.outputPreview || tool.resultSummary) && (
                <div
                  className={cn(
                    "rounded px-2 py-1",
                    tool.status === "error"
                      ? "bg-red-50 dark:bg-red-950/30"
                      : "bg-green-50 dark:bg-green-950/20",
                  )}
                >
                  <span className="text-muted-foreground/40 block mb-0.5">
                    Output:
                  </span>
                  <pre className="text-muted-foreground whitespace-pre-wrap break-words">
                    {tool.outputPreview || tool.resultSummary}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status indicator on right */}
        <div className="flex-shrink-0 mt-0.5">
          <ToolStatusIcon status={tool.status} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component — Claude Code-inspired thinking process view
// ---------------------------------------------------------------------------

export function ThinkingIndicator({ event }: ThinkingIndicatorProps) {
  const data = event.data as ThinkingStepData;
  const [expanded, setExpanded] = useState(true);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tools = data.toolActions || [];
  const stepsAllDone =
    data.steps.length > 0 && data.steps.every((s) => s.status === "done");
  const toolsAllDone =
    tools.length === 0 || tools.every((t) => t.status !== "running");
  const allDone = stepsAllDone && toolsAllDone;

  // Current active elements
  const currentStep = data.steps.find((s) => s.status === "running");
  const currentTool = tools.find((t) => t.status === "running");
  const label = currentTool
    ? currentTool.displayLabel
    : currentStep?.label || (allDone ? "Gotowe" : "Przetwarzam...");

  // Counts
  const doneToolCount = tools.filter((t) => t.status === "done").length;
  const errorToolCount = tools.filter((t) => t.status === "error").length;
  const totalSteps = data.steps.length + tools.length;
  const completedSteps =
    data.steps.filter((s) => s.status === "done").length + doneToolCount;

  // Progress percentage
  const progress = useMemo(
    () =>
      totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
    [totalSteps, completedSteps],
  );

  // Auto-collapse 5s after all steps complete
  useEffect(() => {
    if (allDone && expanded) {
      collapseTimer.current = setTimeout(() => setExpanded(false), 5_000);
    }
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, [allDone, expanded]);

  // Auto-expand when new activity starts
  useEffect(() => {
    if (!allDone && !expanded) {
      setExpanded(true);
    }
  }, [allDone, expanded]);

  return (
    <div className="animate-in fade-in duration-200 relative max-w-[90%]">
      {/* Neural pathway animation (only while processing) */}
      <NeuralPathway active={expanded && !allDone} />

      {/* ─── Header bar ─── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 w-full text-left rounded-lg transition-all duration-200",
          "border",
          allDone
            ? "border-green-500/10 hover:bg-green-500/5 dark:hover:bg-green-500/5"
            : "bg-gradient-to-r from-blue-500/5 to-purple-500/5 border-blue-500/15 hover:from-blue-500/10 hover:to-purple-500/10",
        )}
      >
        {/* Brain / Done icon */}
        <div className="relative flex-shrink-0">
          {allDone ? (
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : (
            <>
              <Brain className="w-4 h-4 text-primary" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary animate-neural-dot" />
            </>
          )}
        </div>

        {/* Label + progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs block truncate font-medium",
                allDone
                  ? "text-green-700 dark:text-green-400"
                  : "text-foreground/80",
              )}
            >
              {allDone ? `Gotowe — ${completedSteps} krokow` : label}
            </span>
            {!allDone && (
              <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                {progress}%
              </span>
            )}
          </div>

          {/* Progress bar */}
          {!allDone && totalSteps > 0 && (
            <div className="mt-1 h-1 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  "bg-gradient-to-r from-blue-500 to-purple-500",
                )}
                style={{ width: `${Math.max(progress, 3)}%` }}
              />
            </div>
          )}
        </div>

        {/* Tool count badge */}
        {tools.length > 0 && (
          <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1 flex-shrink-0 bg-muted/50 rounded-full px-2 py-0.5">
            <Zap className="w-2.5 h-2.5" />
            {doneToolCount + errorToolCount}/{tools.length}
            {errorToolCount > 0 && (
              <span className="text-red-500 font-medium">
                ({errorToolCount} err)
              </span>
            )}
          </span>
        )}

        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200 flex-shrink-0",
            expanded && "rotate-180",
          )}
        />
      </button>

      {/* ─── Expanded process detail view ─── */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300",
          expanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="pl-4 pr-3 pb-2 pt-2 space-y-0.5">
          {/* ── Thinking steps ── */}
          {data.steps.length > 0 && (
            <div className="space-y-0.5">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40 font-medium pl-1">
                Rozumowanie
              </span>
              {data.steps.map((step, i) => (
                <div key={`s-${i}`} className="relative">
                  {/* Connector line between steps */}
                  {i < data.steps.length - 1 && (
                    <div className="absolute left-[7px] top-6 bottom-0 w-px bg-border/30" />
                  )}
                  <div
                    className={cn(
                      "flex items-start gap-2 py-1 px-1.5 rounded-md transition-all duration-200",
                      step.status === "running" && "bg-blue-500/5",
                      step.status === "done" && "opacity-60 hover:opacity-100",
                    )}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <StepIcon status={step.status} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className={cn(
                          "text-xs",
                          step.status === "running"
                            ? "text-blue-700 dark:text-blue-300 font-medium"
                            : step.status === "done"
                              ? "text-muted-foreground"
                              : "text-muted-foreground/50",
                        )}
                      >
                        {step.label}
                      </span>
                      {step.detail && (
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5 truncate">
                          {step.detail}
                        </p>
                      )}
                      {/* Nested sub-steps */}
                      {step.subSteps && step.subSteps.length > 0 && (
                        <div className="ml-3 mt-1 space-y-0.5 border-l border-border/20 pl-2">
                          {step.subSteps.map((sub, j) => (
                            <div
                              key={`sub-${j}`}
                              className="flex items-center gap-1.5"
                            >
                              <StepIcon status={sub.status} />
                              <span className="text-[10px] text-muted-foreground/60">
                                {sub.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Duration */}
                    {step.completedAt && step.startedAt && (
                      <span className="text-[10px] font-mono text-muted-foreground/40 flex-shrink-0 tabular-nums">
                        {formatDuration(step.completedAt - step.startedAt)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Separator ── */}
          {tools.length > 0 && data.steps.length > 0 && (
            <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent my-2" />
          )}

          {/* ── Tool actions ── */}
          {tools.length > 0 && (
            <div className="space-y-0.5">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40 font-medium pl-1">
                Narzedzia
              </span>
              {tools.map((tool, i) => (
                <ToolActionRow
                  key={`t-${i}`}
                  tool={tool}
                  isLast={i === tools.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
