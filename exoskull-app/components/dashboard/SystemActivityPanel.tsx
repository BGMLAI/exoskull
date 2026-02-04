"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, CheckCircle2, XCircle, Cpu, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface SystemActivity {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  status: "running" | "completed" | "failed";
  progress: number;
  started_at: string;
  completed_at: string | null;
}

interface SystemActivityPanelProps {
  tenantId: string;
  className?: string;
}

// ============================================================================
// ACTIVITY TYPE LABELS
// ============================================================================

const TYPE_LABELS: Record<string, string> = {
  mod_build: "Budowanie Modu",
  data_analysis: "Analiza danych",
  health_check: "Sprawdzanie zdrowia",
  intervention_plan: "Planowanie interwencji",
  sync: "Synchronizacja",
  agent_task: "Zadanie agenta",
};

// ============================================================================
// COMPONENT
// ============================================================================

export function SystemActivityPanel({
  tenantId,
  className,
}: SystemActivityPanelProps) {
  const [activities, setActivities] = useState<SystemActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function loadActivities() {
      try {
        const { data } = await supabase
          .from("exo_system_activities")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("started_at", { ascending: false })
          .limit(30);

        setActivities(data || []);
      } catch (err) {
        console.error("[SystemActivityPanel] Load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadActivities();

    // Real-time subscription
    const channel = supabase
      .channel(`activities-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exo_system_activities",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setActivities((prev) => [payload.new as SystemActivity, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setActivities((prev) =>
              prev.map((a) =>
                a.id === payload.new.id ? (payload.new as SystemActivity) : a,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  const runningActivities = activities.filter((a) => a.status === "running");
  const completedActivities = activities.filter((a) => a.status !== "running");

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full overflow-y-auto", className)}>
      {/* Running activities */}
      <div className="p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Aktywne ({runningActivities.length})
        </h3>

        {runningActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Cpu className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">System gotowy</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Brak aktywnych zadan w tle
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {runningActivities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </div>

      {/* Completed activities */}
      {completedActivities.length > 0 && (
        <div className="p-4 border-t">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Zakonczone
          </h3>
          <div className="space-y-2">
            {completedActivities.slice(0, 15).map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ACTIVITY CARD
// ============================================================================

function ActivityCard({ activity }: { activity: SystemActivity }) {
  const isRunning = activity.status === "running";
  const isFailed = activity.status === "failed";

  const statusIcon = isRunning ? (
    <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
  ) : isFailed ? (
    <XCircle className="h-4 w-4 text-destructive" />
  ) : (
    <CheckCircle2 className="h-4 w-4 text-green-500" />
  );

  const typeLabel =
    TYPE_LABELS[activity.activity_type] || activity.activity_type;

  const timeAgo = getTimeAgo(activity.started_at);

  return (
    <div
      className={cn(
        "p-3 rounded-lg border transition-colors",
        isRunning &&
          "bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800/40",
        isFailed &&
          "bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-800/40",
        !isRunning && !isFailed && "bg-card",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5">{statusIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {typeLabel}
            </span>
            <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
          </div>
          <p className="text-sm font-medium leading-tight mt-0.5">
            {activity.title}
          </p>
          {activity.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {activity.description}
            </p>
          )}

          {/* Progress bar */}
          {isRunning && activity.progress > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">
                  Postep
                </span>
                <span className="text-[10px] font-medium">
                  {activity.progress}%
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${activity.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "teraz";
  if (diffMin < 60) return `${diffMin} min temu`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h temu`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d temu`;
}
