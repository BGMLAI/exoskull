"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  HeartPulse,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface SubsystemStatus {
  status: "healthy" | "degraded" | "down";
  details: Record<string, unknown>;
}

interface HealthData {
  overall_status: "healthy" | "degraded" | "critical";
  subsystems: Record<string, SubsystemStatus>;
  alerts: string[];
  timestamp: string;
}

// ============================================================================
// CONFIG
// ============================================================================

const STATUS_CONFIG = {
  healthy: {
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-500",
    pulse: "bg-emerald-400",
    label: "Zdrowy",
  },
  degraded: {
    icon: AlertTriangle,
    color: "text-yellow-500",
    bg: "bg-yellow-500",
    pulse: "bg-yellow-400",
    label: "Zdegradowany",
  },
  critical: {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-500",
    pulse: "bg-red-400",
    label: "Krytyczny",
  },
  down: {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-500",
    pulse: "bg-red-400",
    label: "Niedzialajacy",
  },
};

const SUBSYSTEM_LABELS: Record<string, string> = {
  crons: "CRONy",
  integrations: "Integracje",
  tools: "Narzedzia",
  apps: "Aplikacje",
  ralph: "Ralph (dev)",
  mapek: "MAPEK Loop",
};

// ============================================================================
// COMPONENT
// ============================================================================

export function SystemHealthWidget() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/canvas/data/system-health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.error("[SystemHealth] Fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-1/3" />
            <div className="flex justify-center py-4">
              <div className="h-12 w-12 bg-muted rounded-full" />
            </div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-3 bg-muted rounded w-1/4" />
                <div className="h-3 bg-muted rounded w-1/6" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!health) {
    return (
      <Card>
        <CardContent className="p-4 flex flex-col items-center justify-center h-full">
          <HeartPulse className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Brak danych o zdrowiu systemu.
          </p>
        </CardContent>
      </Card>
    );
  }

  const overallConfig =
    STATUS_CONFIG[health.overall_status] || STATUS_CONFIG.healthy;
  const OverallIcon = overallConfig.icon;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-rose-500" />
            Zdrowie systemu
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
      <CardContent className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Pulsing status indicator */}
        <div className="flex flex-col items-center mb-4">
          <div className="relative">
            <div
              className={cn(
                "absolute inset-0 rounded-full animate-ping opacity-30",
                overallConfig.pulse,
              )}
              style={{ animationDuration: "2s" }}
            />
            <div
              className={cn(
                "relative w-10 h-10 rounded-full flex items-center justify-center",
                overallConfig.bg,
              )}
            >
              <OverallIcon className="h-5 w-5 text-white" />
            </div>
          </div>
          <span className={cn("text-sm font-medium mt-2", overallConfig.color)}>
            {overallConfig.label}
          </span>
        </div>

        {/* Subsystem status rows */}
        <div className="space-y-1.5">
          {Object.entries(health.subsystems).map(([key, sub]) => {
            const subConfig =
              STATUS_CONFIG[sub.status] || STATUS_CONFIG.healthy;
            const SubIcon = subConfig.icon;
            return (
              <div
                key={key}
                className="flex items-center justify-between py-1 px-1"
              >
                <span className="text-sm text-foreground">
                  {SUBSYSTEM_LABELS[key] || key}
                </span>
                <div className="flex items-center gap-1.5">
                  <SubIcon className={cn("h-3.5 w-3.5", subConfig.color)} />
                  <span className={cn("text-xs", subConfig.color)}>
                    {subConfig.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Alerts */}
        {health.alerts.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Alerty
            </p>
            {health.alerts.slice(0, 3).map((alert, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 text-xs text-yellow-600 bg-yellow-500/10 rounded px-2 py-1"
              >
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{alert}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
