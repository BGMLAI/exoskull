"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  MessageSquare,
  Wrench,
  Bot,
  Clock,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface ActivityEntry {
  id: string;
  action_type: string;
  action_name: string;
  description: string;
  status: string;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// CONFIG
// ============================================================================

const ACTION_CONFIG: Record<
  string,
  { icon: typeof Activity; color: string; bg: string }
> = {
  chat_message: {
    icon: MessageSquare,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  tool_call: { icon: Wrench, color: "text-green-500", bg: "bg-green-500/10" },
  loop_eval: { icon: Bot, color: "text-purple-500", bg: "bg-purple-500/10" },
  cron_action: {
    icon: Clock,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
  },
  intervention: {
    icon: AlertTriangle,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
  error: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10" },
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  success: { label: "OK", className: "bg-green-500/20 text-green-600" },
  failed: { label: "Blad", className: "bg-red-500/20 text-red-600" },
  pending: {
    label: "W toku",
    className: "bg-yellow-500/20 text-yellow-600",
  },
  skipped: {
    label: "Pominieto",
    className: "bg-gray-500/20 text-gray-500",
  },
};

const REFRESH_INTERVAL_MS = 30_000; // 30 seconds

// ============================================================================
// HELPERS
// ============================================================================

/** Map raw descriptions to human-readable Polish labels */
function humanizeDescription(desc: string): string {
  // Strip "(uzyto: ...)" suffix
  let clean = desc.replace(/\s*\(uzyto:.*?\)\s*$/, "").trim();

  // Channel labels
  const channelMap: Record<string, string> = {
    web_chat: "czacie",
    voice: "rozmowie glosowej",
    sms: "SMS",
    whatsapp: "WhatsApp",
    telegram: "Telegram",
    email: "e-mail",
    messenger: "Messenger",
    slack: "Slack",
    discord: "Discord",
  };
  for (const [key, label] of Object.entries(channelMap)) {
    clean = clean.replace(`via ${key}`, `na ${label}`);
    clean = clean.replace(`Odpowiedz via ${key}`, `Rozmowa na ${label}`);
  }

  // Tool labels
  const toolMap: Record<string, string> = {
    grant_autonomy: "Przyznano autonomie",
    check_goals: "Sprawdzono cele",
    search_knowledge: "Przeszukano baze wiedzy",
    manage_canvas: "Zarzadzanie widgetami",
    check_health: "Sprawdzono zdrowie",
    create_task: "Utworzono zadanie",
    update_task: "Zaktualizowano zadanie",
    send_email: "Wyslano e-mail",
    manage_schedule: "Zarzadzanie kalendarzem",
    propose_intervention: "Zaproponowano interwencje",
  };
  for (const [key, label] of Object.entries(toolMap)) {
    if (clean === `Narzedzie: ${key}`) return label;
  }

  return clean;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;

  if (diff < 60_000) return "teraz";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min temu`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h temu`;
  return new Date(dateStr).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ActivityFeedWidget() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchActivity = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/canvas/activity-feed?limit=30");
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch (err) {
      console.error("[ActivityFeed] Fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch + auto-refresh
  useEffect(() => {
    fetchActivity();
    const interval = setInterval(
      () => fetchActivity(true),
      REFRESH_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, [fetchActivity]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-1/3" />
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-2">
                <div className="h-6 w-6 bg-muted rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-2 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            Aktywnosc IORS
          </span>
          <button
            onClick={() => fetchActivity(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Odswiez"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Activity className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Brak aktywnosci.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Napisz wiadomosc w czacie, zeby zobaczyc co IORS robi.
            </p>
          </div>
        ) : (
          entries.map((entry) => {
            const config = ACTION_CONFIG[entry.action_type] || {
              icon: Activity,
              color: "text-muted-foreground",
              bg: "bg-muted",
            };
            const Icon = config.icon;
            const badge = STATUS_BADGE[entry.status];

            return (
              <div
                key={entry.id}
                className="flex items-start gap-2.5 py-1.5 group"
              >
                {/* Icon */}
                <div
                  className={cn(
                    "shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5",
                    config.bg,
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", config.color)} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-tight truncate">
                    {humanizeDescription(entry.description)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      {relativeTime(entry.created_at)}
                    </span>
                    {badge && entry.status !== "success" && (
                      <span
                        className={cn(
                          "text-[10px] px-1 py-0.5 rounded",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
