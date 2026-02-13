/**
 * ForgeView — The Forge (Kuźnia)
 *
 * A live visualization of IORS building, coding, and deploying.
 * Three sub-views arranged vertically:
 *
 * ┌─────────────────────────────────────────────┐
 * │  Pipeline Status Bar (IORS activity)        │
 * ├──────────────┬──────────────────────────────┤
 * │  File Tree   │  Code Stream / Preview       │
 * │  (left)      │  (right)                     │
 * │              │                              │
 * └──────────────┴──────────────────────────────┘
 *
 * Integrates with existing stream event types:
 * - tool_execution → pipeline steps
 * - code_block → live code output + file tree
 * - system_evolution → build/fix/optimize outcomes
 */
"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Hammer,
  Wrench,
  Zap,
  Blocks,
  Brain,
  Code2,
  TestTube2,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  FileCode,
  FolderOpen,
  Folder,
  Copy,
  Check,
  ExternalLink,
  Eye,
  Terminal,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  StreamEvent,
  StreamEventData,
  CodeBlockData,
  ToolExecutionData,
  SystemEvolutionData,
} from "@/lib/stream/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** IORS pipeline phases */
type IORSPhase = "idle" | "thinking" | "coding" | "testing" | "done" | "error";

/** A single file in the forge file tree */
interface ForgeFile {
  path: string;
  language: string;
  code: string;
  updatedAt: Date;
  eventId: string;
}

/** A directory node for tree rendering */
interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children: TreeNode[];
  file?: ForgeFile;
}

/** Tabs within the forge main area */
type ForgeTab = "code" | "preview";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Determine current IORS phase from recent events */
function derivePhase(events: StreamEvent[]): IORSPhase {
  // Walk events in reverse to find the latest signal
  for (let i = events.length - 1; i >= 0; i--) {
    const d = events[i].data;

    if (d.type === "system_evolution") {
      const evo = d as SystemEvolutionData;
      if (evo.outcome === "success") return "done";
      if (evo.outcome === "failed") return "error";
      if (evo.outcome === "pending") return "coding";
    }

    if (d.type === "tool_execution") {
      const tool = d as ToolExecutionData;
      if (tool.status === "running") {
        // Heuristic: test-related tools → testing phase
        const name = tool.toolName.toLowerCase();
        if (name.includes("test") || name.includes("verify")) return "testing";
        return "coding";
      }
      if (tool.status === "error") return "error";
      if (tool.status === "done") return "done";
      if (tool.status === "queued") return "thinking";
    }

    if (d.type === "thinking_step") return "thinking";
    if (d.type === "code_block") return "coding";
  }

  return "idle";
}

/** Extract forge-relevant events */
function isForgeEvent(data: StreamEventData): boolean {
  return (
    data.type === "tool_execution" ||
    data.type === "code_block" ||
    data.type === "system_evolution"
  );
}

/** Build file tree structure from flat file list */
function buildFileTree(files: ForgeFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const existing = currentLevel.find((n) => n.name === part);

      if (existing) {
        if (isLast && existing.type === "file") {
          // Update existing file
          existing.file = file;
        } else {
          currentLevel = existing.children;
        }
      } else {
        const node: TreeNode = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          type: isLast ? "file" : "directory",
          children: [],
          file: isLast ? file : undefined,
        };
        currentLevel.push(node);
        if (!isLast) {
          currentLevel = node.children;
        }
      }
    }
  }

  // Sort: directories first, then files, alphabetical within each group
  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children.length > 0) sortNodes(n.children);
    }
  }

  sortNodes(root);
  return root;
}

// ---------------------------------------------------------------------------
// Phase config
// ---------------------------------------------------------------------------

const PHASE_CONFIG: Record<
  IORSPhase,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    animate?: boolean;
  }
> = {
  idle: {
    label: "Gotowy",
    icon: Activity,
    color: "text-muted-foreground",
    bgColor: "bg-muted/30",
  },
  thinking: {
    label: "Analizuję...",
    icon: Brain,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    animate: true,
  },
  coding: {
    label: "Buduję...",
    icon: Code2,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    animate: true,
  },
  testing: {
    label: "Testuję...",
    icon: TestTube2,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    animate: true,
  },
  done: {
    label: "Gotowe",
    icon: CheckCircle2,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  error: {
    label: "Błąd",
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
};

const PIPELINE_PHASES: IORSPhase[] = ["thinking", "coding", "testing", "done"];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Pipeline status bar — shows IORS activity phases */
function PipelineBar({ currentPhase }: { currentPhase: IORSPhase }) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border/40 bg-[#181825]/80 dark:bg-[#0a0e14]/80">
      <div className="flex items-center gap-1.5 mr-3">
        <Hammer className="w-3.5 h-3.5 text-muted-foreground/70" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Kuźnia
        </span>
      </div>

      <div className="flex items-center gap-0.5 flex-1">
        {PIPELINE_PHASES.map((phase, idx) => {
          const config = PHASE_CONFIG[phase];
          const PhaseIcon = config.icon;
          const phaseIdx = PIPELINE_PHASES.indexOf(phase);
          const currentIdx = PIPELINE_PHASES.indexOf(currentPhase);
          const isActive = phase === currentPhase;
          const isPast =
            currentPhase !== "idle" &&
            currentPhase !== "error" &&
            phaseIdx < currentIdx;
          const isError = currentPhase === "error" && phaseIdx <= currentIdx;

          return (
            <React.Fragment key={phase}>
              {idx > 0 && (
                <div
                  className={cn(
                    "h-px w-4 transition-colors duration-300",
                    isPast || isActive
                      ? "bg-emerald-500/50"
                      : isError
                        ? "bg-red-500/30"
                        : "bg-border/30",
                  )}
                />
              )}
              <div
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] transition-all duration-300",
                  isActive && config.bgColor,
                  isActive && config.color,
                  isPast && "text-emerald-500/70",
                  !isActive &&
                    !isPast &&
                    !isError &&
                    "text-muted-foreground/40",
                  isError && "text-red-500/50",
                )}
              >
                <PhaseIcon
                  className={cn(
                    "w-3 h-3",
                    isActive && config.animate && "animate-pulse",
                  )}
                />
                <span className="hidden sm:inline font-medium">
                  {isActive
                    ? config.label
                    : phase === "done"
                      ? "Gotowe"
                      : config.label.replace("...", "")}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Current phase indicator badge */}
      {currentPhase !== "idle" && (
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
            PHASE_CONFIG[currentPhase].bgColor,
            PHASE_CONFIG[currentPhase].color,
          )}
        >
          {PHASE_CONFIG[currentPhase].animate && (
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          )}
          {PHASE_CONFIG[currentPhase].label}
        </div>
      )}
    </div>
  );
}

/** File tree node (recursive) */
function FileTreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (file: ForgeFile) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = node.type === "file" && node.path === selectedPath;

  // Language → color mapping for file icons
  const langColor = node.file
    ? getLangColor(node.file.language)
    : "text-muted-foreground/60";

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "flex items-center gap-1 w-full px-1 py-0.5 text-left rounded-sm",
            "hover:bg-muted/30 transition-colors text-[11px]",
          )}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
          )}
          {expanded ? (
            <FolderOpen className="w-3.5 h-3.5 text-amber-500/70 flex-shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-amber-500/50 flex-shrink-0" />
          )}
          <span className="text-muted-foreground truncate font-medium">
            {node.name}
          </span>
        </button>
        {expanded && (
          <div>
            {node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => node.file && onSelect(node.file)}
      className={cn(
        "flex items-center gap-1 w-full px-1 py-0.5 text-left rounded-sm",
        "hover:bg-muted/30 transition-colors text-[11px]",
        isSelected && "bg-primary/10 text-primary",
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      {/* Spacer for alignment with directory chevrons */}
      <span className="w-3 flex-shrink-0" />
      <FileCode className={cn("w-3.5 h-3.5 flex-shrink-0", langColor)} />
      <span
        className={cn(
          "truncate",
          isSelected ? "text-primary font-medium" : "text-muted-foreground",
        )}
      >
        {node.name}
      </span>
    </button>
  );
}

/** Get language-based color for file icon */
function getLangColor(lang: string): string {
  const map: Record<string, string> = {
    typescript: "text-blue-500",
    tsx: "text-blue-500",
    javascript: "text-yellow-500",
    jsx: "text-yellow-500",
    python: "text-green-500",
    rust: "text-orange-500",
    go: "text-cyan-500",
    html: "text-orange-400",
    css: "text-violet-500",
    json: "text-yellow-600",
    yaml: "text-rose-400",
    yml: "text-rose-400",
    markdown: "text-gray-400",
    md: "text-gray-400",
    sql: "text-emerald-500",
    shell: "text-green-400",
    bash: "text-green-400",
  };
  return map[lang.toLowerCase()] || "text-blue-400";
}

/** Code viewer — terminal-like display with syntax-aware styling */
function CodeViewer({ file }: { file: ForgeFile }) {
  const [copied, setCopied] = useState(false);
  const lines = file.code.split("\n");

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(file.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [file.code]);

  return (
    <div className="flex flex-col h-full">
      {/* File header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] dark:bg-[#0a0e14] border-b border-border/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileCode
            className={cn("w-3.5 h-3.5", getLangColor(file.language))}
          />
          <span className="text-xs text-gray-400 font-mono truncate">
            {file.path}
          </span>
          <span className="text-[10px] text-muted-foreground/40 font-mono">
            {file.language}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400">Skopiowano</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Kopiuj</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <div className="flex-1 overflow-auto forge-scroll">
        <pre className="text-xs leading-5 p-0">
          <code>
            {lines.map((line, i) => (
              <div
                key={i}
                className="flex hover:bg-white/[0.03] transition-colors"
              >
                <span className="select-none text-gray-600 text-right pr-3 pl-3 py-0 w-10 inline-block flex-shrink-0 font-mono">
                  {i + 1}
                </span>
                <span className="text-gray-200 py-0 pr-4 whitespace-pre font-mono">
                  {line || " "}
                </span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

/** Preview iframe for the app being built */
function PreviewPane({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-3">
        <Eye className="w-8 h-8" />
        <p className="text-xs text-center max-w-[200px]">
          Podgląd pojawi się gdy IORS wdroży aplikację
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] dark:bg-[#0a0e14] border-b border-border/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs text-gray-400 font-mono truncate">
            {url}
          </span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <div className="flex-1">
        <iframe
          src={url}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="Preview"
        />
      </div>
    </div>
  );
}

/** Evolution event — compact forge-style */
function EvolutionEntry({ event }: { event: StreamEvent }) {
  const data = event.data as SystemEvolutionData;
  const icons: Record<string, React.ElementType> = {
    build: Hammer,
    fix: Wrench,
    optimize: Zap,
    register_tool: Blocks,
  };
  const colors: Record<string, string> = {
    build: "text-emerald-500",
    fix: "text-amber-500",
    optimize: "text-blue-500",
    register_tool: "text-violet-500",
  };

  const Icon = icons[data.evolutionType] || Wrench;
  const color = colors[data.evolutionType] || "text-muted-foreground";

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-white/[0.02] transition-colors">
      <Icon className={cn("w-3.5 h-3.5 mt-0.5 flex-shrink-0", color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-gray-200 truncate">
            {data.title}
          </span>
          {data.outcome === "success" && (
            <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
          )}
          {data.outcome === "failed" && (
            <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
          )}
          {data.outcome === "pending" && (
            <Loader2 className="w-3 h-3 text-muted-foreground animate-spin flex-shrink-0" />
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/60 truncate">
          {data.description}
        </p>
      </div>
      <span className="text-[9px] text-muted-foreground/40 font-mono flex-shrink-0 mt-0.5">
        {event.timestamp.toLocaleTimeString("pl-PL", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </span>
    </div>
  );
}

/** Tool execution — compact forge-style */
function ToolEntry({ event }: { event: StreamEvent }) {
  const data = event.data as ToolExecutionData;

  const statusIcon = {
    queued: <Loader2 className="w-3 h-3 text-gray-400" />,
    running: <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />,
    done: <CheckCircle2 className="w-3 h-3 text-emerald-500" />,
    error: <XCircle className="w-3 h-3 text-red-500" />,
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1 hover:bg-white/[0.02] transition-colors">
      {statusIcon[data.status]}
      <Terminal className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
      <span className="text-[11px] text-gray-300 truncate flex-1">
        {data.displayLabel}
      </span>
      {data.progress !== undefined && data.status === "running" && (
        <div className="w-12 h-1 bg-muted/40 rounded-full overflow-hidden flex-shrink-0">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${data.progress}%` }}
          />
        </div>
      )}
      {data.durationMs !== undefined && (
        <span className="text-[9px] font-mono text-muted-foreground/40 flex-shrink-0">
          {data.durationMs < 1000
            ? `${data.durationMs}ms`
            : `${(data.durationMs / 1000).toFixed(1)}s`}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface ForgeViewProps {
  /** All stream events to derive forge state from */
  events: StreamEvent[];
  /** Optional preview URL for the app being built */
  previewUrl?: string | null;
  /** Additional class names */
  className?: string;
}

export function ForgeView({ events, previewUrl, className }: ForgeViewProps) {
  const [activeTab, setActiveTab] = useState<ForgeTab>("code");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  // ── Derived state ────────────────────────────────────────────────────

  /** Filter to forge-relevant events */
  const forgeEvents = useMemo(
    () => events.filter((e) => isForgeEvent(e.data)),
    [events],
  );

  /** Current IORS pipeline phase */
  const currentPhase = useMemo(() => derivePhase(events), [events]);

  /** Extract files from code_block events */
  const files = useMemo(() => {
    const fileMap = new Map<string, ForgeFile>();

    for (const event of forgeEvents) {
      if (event.data.type === "code_block") {
        const cb = event.data as CodeBlockData;
        const path = cb.filename || `untitled.${cb.language || "txt"}`;

        fileMap.set(path, {
          path,
          language: cb.language,
          code: cb.code,
          updatedAt: event.timestamp,
          eventId: event.id,
        });
      }
    }

    return Array.from(fileMap.values()).sort((a, b) =>
      a.path.localeCompare(b.path),
    );
  }, [forgeEvents]);

  /** File tree structure */
  const fileTree = useMemo(() => buildFileTree(files), [files]);

  /** Currently selected file */
  const selectedFile = useMemo(
    () => files.find((f) => f.path === selectedFilePath) ?? files[0] ?? null,
    [files, selectedFilePath],
  );

  /** Activity log — tool_execution + system_evolution events, recent first */
  const activityLog = useMemo(
    () =>
      forgeEvents
        .filter(
          (e) =>
            e.data.type === "tool_execution" ||
            e.data.type === "system_evolution",
        )
        .reverse()
        .slice(0, 50),
    [forgeEvents],
  );

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleFileSelect = useCallback((file: ForgeFile) => {
    setSelectedFilePath(file.path);
    setActiveTab("code");
  }, []);

  // ── Empty state ──────────────────────────────────────────────────────

  if (forgeEvents.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full bg-[#1e1e2e] dark:bg-[#0d1117] rounded-lg",
          className,
        )}
      >
        <div className="forge-empty-glow relative flex flex-col items-center gap-4 p-8">
          <div className="relative">
            <Hammer className="w-10 h-10 text-muted-foreground/30" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-muted/50 flex items-center justify-center">
              <Code2 className="w-2.5 h-2.5 text-muted-foreground/50" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-muted-foreground/50">
              Kuźnia czeka
            </p>
            <p className="text-[11px] text-muted-foreground/30 max-w-[220px]">
              Gdy IORS zacznie budować, tutaj zobaczysz żywy widok kodu, plików
              i postępu
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[#1e1e2e] dark:bg-[#0d1117] rounded-lg overflow-hidden border border-border/30",
        className,
      )}
    >
      {/* Pipeline status bar */}
      <PipelineBar currentPhase={currentPhase} />

      {/* Main area: file tree + code/preview */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left: File Tree + Activity Log ─────────────────────── */}
        <div className="w-48 flex-shrink-0 border-r border-border/20 flex flex-col bg-[#181825]/50 dark:bg-[#0a0e14]/50">
          {/* File tree */}
          <div className="flex-1 overflow-y-auto forge-scroll py-1">
            {files.length > 0 ? (
              <div>
                <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/40 font-semibold">
                  Pliki ({files.length})
                </div>
                {fileTree.map((node) => (
                  <FileTreeNode
                    key={node.path}
                    node={node}
                    depth={0}
                    selectedPath={selectedFile?.path ?? null}
                    onSelect={handleFileSelect}
                  />
                ))}
              </div>
            ) : (
              <div className="px-3 py-4 text-center">
                <FileCode className="w-5 h-5 mx-auto text-muted-foreground/20 mb-1" />
                <p className="text-[10px] text-muted-foreground/30">
                  Brak plików
                </p>
              </div>
            )}

            {/* Divider */}
            {activityLog.length > 0 && (
              <>
                <div className="mx-2 my-2 h-px bg-border/20" />
                <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/40 font-semibold">
                  Aktywność
                </div>
                {activityLog.slice(0, 15).map((event) => {
                  if (event.data.type === "system_evolution") {
                    return <EvolutionEntry key={event.id} event={event} />;
                  }
                  return <ToolEntry key={event.id} event={event} />;
                })}
              </>
            )}
          </div>
        </div>

        {/* ── Right: Code / Preview ──────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tab bar */}
          <div className="flex items-center gap-0 border-b border-border/20 bg-[#181825]/50 dark:bg-[#0a0e14]/50 flex-shrink-0">
            <button
              onClick={() => setActiveTab("code")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors border-b-2",
                activeTab === "code"
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground/60 hover:text-muted-foreground",
              )}
            >
              <Code2 className="w-3.5 h-3.5" />
              Kod
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors border-b-2",
                activeTab === "preview"
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground/60 hover:text-muted-foreground",
              )}
            >
              <Eye className="w-3.5 h-3.5" />
              Podgląd
            </button>

            {/* File count badge */}
            {files.length > 0 && (
              <span className="ml-auto mr-3 text-[9px] font-mono text-muted-foreground/40">
                {files.length} {files.length === 1 ? "plik" : "plików"}
              </span>
            )}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0">
            {activeTab === "code" ? (
              selectedFile ? (
                <CodeViewer file={selectedFile} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40 gap-2">
                  <Code2 className="w-6 h-6" />
                  <p className="text-xs">Wybierz plik z drzewa po lewej</p>
                </div>
              )
            ) : (
              <PreviewPane url={previewUrl ?? null} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
