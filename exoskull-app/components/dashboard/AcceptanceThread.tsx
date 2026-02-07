"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CheckSquare,
  Heart,
  Calendar,
  FileText,
  Check,
  X,
  Bell,
  Lightbulb,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { EmotionalWidget } from "@/components/widgets/EmotionalWidget";

// ============================================================================
// TYPES
// ============================================================================

interface Intervention {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  intervention_type: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  is_read: boolean;
  priority: string;
  created_at: string;
}

interface StatusCardData {
  tasksPending: number;
  tasksInProgress: number;
  sleepHours: number | null;
  nextEvent: string | null;
  loopsCount: number;
}

interface AcceptanceThreadProps {
  tenantId: string;
  className?: string;
  compact?: boolean;
}

// ============================================================================
// STATUS CARDS
// ============================================================================

function StatusCards({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<StatusCardData>({
    tasksPending: 0,
    tasksInProgress: 0,
    sleepHours: null,
    nextEvent: null,
    loopsCount: 0,
  });

  useEffect(() => {
    const supabase = createClient();

    async function loadData() {
      try {
        // Tasks
        const { data: tasks } = await supabase
          .from("exo_tasks")
          .select("status")
          .eq("tenant_id", tenantId)
          .in("status", ["pending", "in_progress"]);

        // Health (latest sleep)
        const { data: health } = await supabase
          .from("exo_health_metrics")
          .select("value")
          .eq("tenant_id", tenantId)
          .eq("metric_type", "sleep")
          .order("recorded_at", { ascending: false })
          .limit(1);

        // Knowledge
        const { count: loops } = await supabase
          .from("user_loops")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId);

        setData({
          tasksPending:
            tasks?.filter((t) => t.status === "pending").length ?? 0,
          tasksInProgress:
            tasks?.filter((t) => t.status === "in_progress").length ?? 0,
          sleepHours: health?.[0]?.value
            ? Math.round((health[0].value / 60) * 10) / 10
            : null,
          nextEvent: null,
          loopsCount: loops ?? 0,
        });
      } catch (err) {
        console.error("[StatusCards] Load error:", err);
      }
    }

    loadData();
  }, [tenantId]);

  const cards = [
    {
      icon: CheckSquare,
      label: "Zadania",
      value: `${data.tasksPending} oczekuje`,
      sub:
        data.tasksInProgress > 0 ? `${data.tasksInProgress} w toku` : undefined,
      href: "/dashboard/tasks",
      color: "text-blue-500",
    },
    {
      icon: Heart,
      label: "Sen",
      value: data.sleepHours !== null ? `${data.sleepHours}h` : "Brak danych",
      href: "/dashboard/mods",
      color: "text-red-500",
    },
    {
      icon: FileText,
      label: "Wiedza",
      value: `${data.loopsCount} loopow`,
      href: "/dashboard/memory",
      color: "text-purple-500",
    },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 px-1">
      {cards.map((card) => (
        <Link
          key={card.label}
          href={card.href}
          className="flex-shrink-0 min-w-[120px]"
        >
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <card.icon className={cn("h-3.5 w-3.5", card.color)} />
                <span className="text-xs text-muted-foreground">
                  {card.label}
                </span>
              </div>
              <p className="text-sm font-medium">{card.value}</p>
              {card.sub && (
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              )}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

// ============================================================================
// INTERVENTION CARD
// ============================================================================

function InterventionCard({
  intervention,
  onApprove,
  onReject,
  isProcessing,
}: {
  intervention: Intervention;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isProcessing: boolean;
}) {
  const priorityColors: Record<string, string> = {
    high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    medium:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    low: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };

  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                priorityColors[intervention.priority] || priorityColors.low,
              )}
            >
              {intervention.priority}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {intervention.intervention_type}
            </span>
          </div>
          <p className="text-sm font-medium leading-tight">
            {intervention.title}
          </p>
          {intervention.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {intervention.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2.5">
        <button
          onClick={() => onApprove(intervention.id)}
          disabled={isProcessing}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isProcessing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Zatwierdz
        </button>
        <button
          onClick={() => onReject(intervention.id)}
          disabled={isProcessing}
          className="flex items-center gap-1 px-3 py-1.5 bg-muted text-muted-foreground rounded-md text-xs font-medium hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
        >
          <X className="h-3 w-3" />
          Odrzuc
        </button>
        {intervention.scheduled_for && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {new Date(intervention.scheduled_for).toLocaleString("pl-PL", {
              hour: "2-digit",
              minute: "2-digit",
              day: "2-digit",
              month: "2-digit",
            })}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// NOTIFICATION ITEM
// ============================================================================

function NotificationItem({ notification }: { notification: Notification }) {
  const typeConfig: Record<string, { icon: typeof Bell; color: string }> = {
    insight: { icon: Lightbulb, color: "text-yellow-500" },
    alert: { icon: AlertTriangle, color: "text-red-500" },
    completion: { icon: Check, color: "text-green-500" },
    suggestion: { icon: Sparkles, color: "text-purple-500" },
    system: { icon: Bell, color: "text-blue-500" },
  };

  const config = typeConfig[notification.type] || typeConfig.system;
  const Icon = config.icon;

  const content = (
    <div
      className={cn(
        "flex items-start gap-2.5 p-2.5 rounded-lg transition-colors",
        notification.is_read ? "opacity-60" : "bg-muted/50",
        notification.action_url && "hover:bg-accent cursor-pointer",
      )}
    >
      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", config.color)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.body}
          </p>
        )}
        <span className="text-[10px] text-muted-foreground mt-1 block">
          {new Date(notification.created_at).toLocaleString("pl-PL", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
          })}
        </span>
      </div>
      {notification.action_url && (
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      )}
    </div>
  );

  if (notification.action_url) {
    return <Link href={notification.action_url}>{content}</Link>;
  }

  return content;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AcceptanceThread({
  tenantId,
  className,
  compact = false,
}: AcceptanceThreadProps) {
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient();

        // Load pending interventions
        const { data: intData } = await supabase
          .from("exo_interventions")
          .select(
            "id, title, description, priority, intervention_type, status, scheduled_for, created_at",
          )
          .eq("tenant_id", tenantId)
          .eq("status", "proposed")
          .order("created_at", { ascending: false })
          .limit(20);

        setInterventions(intData || []);

        // Load notifications
        const { data: notifData } = await supabase
          .from("exo_notifications")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(30);

        setNotifications(notifData || []);
      } catch (err) {
        console.error("[AcceptanceThread] Load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [tenantId]);

  // Real-time subscriptions
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`acceptance-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exo_interventions",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (
            payload.eventType === "INSERT" &&
            payload.new.status === "proposed"
          ) {
            setInterventions((prev) => [payload.new as Intervention, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setInterventions((prev) =>
              prev.filter(
                (i) =>
                  i.id !== payload.new.id || payload.new.status === "proposed",
              ),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "exo_notifications",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  // Approve intervention
  const handleApprove = useCallback(
    async (id: string) => {
      setProcessing(id);
      try {
        const res = await fetch("/api/autonomy/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "approve",
            tenantId,
            interventionId: id,
          }),
        });

        if (res.ok) {
          setInterventions((prev) => prev.filter((i) => i.id !== id));
        }
      } catch (err) {
        console.error("[AcceptanceThread] Approve error:", err);
      } finally {
        setProcessing(null);
      }
    },
    [tenantId],
  );

  // Reject intervention
  const handleReject = useCallback(
    async (id: string) => {
      setProcessing(id);
      try {
        const res = await fetch("/api/autonomy/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "reject",
            tenantId,
            interventionId: id,
          }),
        });

        if (res.ok) {
          setInterventions((prev) => prev.filter((i) => i.id !== id));
        }
      } catch (err) {
        console.error("[AcceptanceThread] Reject error:", err);
      } finally {
        setProcessing(null);
      }
    },
    [tenantId],
  );

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className={cn("flex flex-col h-full overflow-y-auto", className)}>
      {/* Status Cards + Emotional Widget */}
      <div className="p-3 border-b space-y-2">
        <StatusCards tenantId={tenantId} />
        <EmotionalWidget tenantId={tenantId} />
      </div>

      {/* Pending Interventions */}
      <div className="p-3 border-b">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Do zatwierdzenia ({interventions.length})
        </h3>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : interventions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Brak akcji oczekujacych na zatwierdzenie
          </p>
        ) : (
          <div className="space-y-2">
            {interventions.map((intervention) => (
              <InterventionCard
                key={intervention.id}
                intervention={intervention}
                onApprove={handleApprove}
                onReject={handleReject}
                isProcessing={processing === intervention.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Notifications */}
      <div className="p-3 flex-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Powiadomienia{" "}
          {unreadCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-primary text-primary-foreground rounded-full text-[10px]">
              {unreadCount}
            </span>
          )}
        </h3>
        {notifications.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Brak powiadomien
          </p>
        ) : (
          <div className="space-y-1">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Export unread count hook for badge
export function useUnreadCount(tenantId: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();

    async function loadCount() {
      try {
        const { count: unread } = await supabase
          .from("exo_notifications")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("is_read", false);

        // Also count pending interventions
        const { count: pending } = await supabase
          .from("exo_interventions")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "proposed");

        setCount((unread ?? 0) + (pending ?? 0));
      } catch (err) {
        console.error("[useUnreadCount] Error:", err);
      }
    }

    loadCount();

    const channel = supabase
      .channel(`badge-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exo_notifications",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => loadCount(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exo_interventions",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => loadCount(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  return count;
}
