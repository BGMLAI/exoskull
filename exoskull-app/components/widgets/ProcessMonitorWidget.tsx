"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  RefreshCw,
  Cpu,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Bot,
  Workflow,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface ProcessInfo {
  id: string;
  name: string;
  type:
    | "ralph_loop"
    | "agent_swarm"
    | "atlas_pipeline"
    | "gotcha_cycle"
    | "health_check"
    | "self_build";
  status: "running" | "completed" | "failed" | "idle";
  progress?: string;
  startedAt?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

interface ProcessMonitorData {
  activeProcesses: ProcessInfo[];
  recentCompleted: ProcessInfo[];
  systemStats: {
    ralphCycles24h: number;
    swarmSessions24h: number;
    atlasPipelines24h: number;
    selfBuildActions24h: number;
    busEventsTotal: number;
  };
  timestamp: string;
}

// ============================================================================
// CONFIG
// ============================================================================

const TYPE_CONFIG: Record<
  ProcessInfo["type"],
  { icon: typeof Activity; color: string; label: string }
> = {
  ralph_loop: { icon: Bot, color: "text-indigo-500", label: "Ralph Loop" },
  agent_swarm: { icon: Cpu, color: "text-purple-500", label: "Agent Swarm" },
  atlas_pipeline: {
    icon: Workflow,
    color: "text-cyan-500",
    label: "ATLAS Pipeline",
  },
  gotcha_cycle: { icon: Zap, color: "text-amber-500", label: "GOTCHA Cycle" },
  health_check: {
    icon: Shield,
    color: "text-emerald-500",
    label: "Health Check",
  },
  self_build: { icon: Activity, color: "text-rose-500", label: "Self-Build" },
};

const STATUS_ICONS: Record<
  ProcessInfo["status"],
  { icon: typeof Loader2; color: string }
> = {
  running: { icon: Loader2, color: "text-blue-500 animate-spin" },
  completed: { icon: CheckCircle2, color: "text-emerald-500" },
  failed: { icon: XCircle, color: "text-red-500" },
  idle: { icon: Clock, color: "text-muted-foreground" },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function ProcessMonitorWidget() {
  const [data, setData] = useState<ProcessMonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/canvas/data/process-monitor");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("[ProcessMonitor] Fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Poll every 15 seconds for live process updates
    const interval = setInterval(() => fetchData(true), 15_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-1/3" />
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-2/3" />
            <div className="h-3 bg-muted rounded w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-4 flex flex-col items-center justify-center h-full">
          <Activity className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Brak danych o procesach.
          </p>
        </CardContent>
      </Card>
    );
  }

  const activeCount = data.activeProcesses.filter(
    (p) => p.status === "running",
  ).length;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-500" />
            Procesy systemu
            {activeCount > 0 && (
              <span className="ml-1 inline-flex items-center gap-1 text-xs bg-blue-500/15 text-blue-500 rounded-full px-2 py-0.5 font-medium">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                </span>
                {activeCount} aktywny
              </span>
            )}
          </span>
          <button
            onClick={() => fetchData(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Odswiez"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
          </button>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {/* Active processes */}
        {data.activeProcesses.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Aktywne procesy
            </p>
            <div className="space-y-2">
              {data.activeProcesses.map((process) => (
                <ProcessRow key={process.id} process={process} />
              ))}
            </div>
          </div>
        )}

        {/* Recent completed */}
        {data.recentCompleted.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Ostatnie zakonczone
            </p>
            <div className="space-y-1.5">
              {data.recentCompleted.slice(0, 5).map((process) => (
                <ProcessRow key={process.id} process={process} compact />
              ))}
            </div>
          </div>
        )}

        {/* System stats */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Statystyki (24h)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <StatBadge
              label="Ralph cykli"
              value={data.systemStats.ralphCycles24h}
              icon={Bot}
              color="text-indigo-500"
            />
            <StatBadge
              label="Swarm sesji"
              value={data.systemStats.swarmSessions24h}
              icon={Cpu}
              color="text-purple-500"
            />
            <StatBadge
              label="ATLAS"
              value={data.systemStats.atlasPipelines24h}
              icon={Workflow}
              color="text-cyan-500"
            />
            <StatBadge
              label="Self-build"
              value={data.systemStats.selfBuildActions24h}
              icon={Activity}
              color="text-rose-500"
            />
          </div>
        </div>

        {/* Empty state */}
        {data.activeProcesses.length === 0 &&
          data.recentCompleted.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6">
              <Clock className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                System w stanie spoczynku
              </p>
            </div>
          )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ProcessRow({
  process,
  compact = false,
}: {
  process: ProcessInfo;
  compact?: boolean;
}) {
  const typeConfig = TYPE_CONFIG[process.type] || TYPE_CONFIG.ralph_loop;
  const statusConfig = STATUS_ICONS[process.status] || STATUS_ICONS.idle;

  const TypeIcon = typeConfig.icon;
  const StatusIcon = statusConfig.icon;

  const duration = process.durationMs
    ? process.durationMs > 60_000
      ? `${Math.round(process.durationMs / 60_000)}min`
      : `${Math.round(process.durationMs / 1000)}s`
    : null;

  if (compact) {
    return (
      <div className="flex items-center justify-between py-0.5 px-1 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <TypeIcon className={cn("h-3 w-3 shrink-0", typeConfig.color)} />
          <span className="truncate text-muted-foreground">{process.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {duration && (
            <span className="text-muted-foreground/70">{duration}</span>
          )}
          <StatusIcon className={cn("h-3 w-3", statusConfig.color)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 p-2 rounded-lg bg-muted/30 border border-border/50">
      <div className="shrink-0 mt-0.5">
        <TypeIcon className={cn("h-4 w-4", typeConfig.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate">{process.name}</span>
          <StatusIcon className={cn("h-4 w-4 shrink-0", statusConfig.color)} />
        </div>
        {process.progress && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {process.progress}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground/70">
          <span>{typeConfig.label}</span>
          {duration && (
            <>
              <span>·</span>
              <span>{duration}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBadge({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/30 border border-border/50">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  );
}
