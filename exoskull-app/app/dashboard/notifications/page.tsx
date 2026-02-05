"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  BellOff,
  Loader2,
  CheckCheck,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Info,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface Notification {
  id: string;
  tenant_id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  is_read: boolean;
  priority: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  insight: {
    label: "Insight",
    icon: <Lightbulb className="w-4 h-4" />,
    color: "text-purple-500",
  },
  alert: {
    label: "Alert",
    icon: <AlertTriangle className="w-4 h-4" />,
    color: "text-red-500",
  },
  completion: {
    label: "Ukonczone",
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: "text-green-500",
  },
  suggestion: {
    label: "Sugestia",
    icon: <Sparkles className="w-4 h-4" />,
    color: "text-blue-500",
  },
  system: {
    label: "System",
    icon: <Info className="w-4 h-4" />,
    color: "text-gray-500",
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  // --------------------------------------------------------------------------
  // DATA FETCHING
  // --------------------------------------------------------------------------

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?filter=${filter}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error("[NotificationsPage] Fetch error:", {
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // --------------------------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------------------------

  const handleMarkRead = async (ids: string[]) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) await fetchNotifications();
    } catch (error) {
      console.error("[NotificationsPage] Mark read error:", {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      if (res.ok) await fetchNotifications();
    } catch (error) {
      console.error("[NotificationsPage] Mark all read error:", {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  const handleClick = (notif: Notification) => {
    if (!notif.is_read) {
      handleMarkRead([notif.id]);
    }
    if (notif.action_url) {
      router.push(notif.action_url);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return "teraz";
    if (diffMin < 60) return `${diffMin}min`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
  };

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-7 h-7" />
            Powiadomienia
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {unreadCount}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground">
            Insighty, alerty i aktualizacje systemu
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            <CheckCheck className="w-4 h-4 mr-2" />
            Oznacz wszystko
          </Button>
        )}
      </div>

      {/* Filter */}
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Filtruj" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Wszystkie</SelectItem>
          <SelectItem value="unread">Nieprzeczytane</SelectItem>
          <SelectItem value="insight">Insighty</SelectItem>
          <SelectItem value="alert">Alerty</SelectItem>
          <SelectItem value="completion">Ukonczone</SelectItem>
          <SelectItem value="suggestion">Sugestie</SelectItem>
        </SelectContent>
      </Select>

      {/* List */}
      {notifications.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <BellOff className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Brak powiadomien</h3>
            <p className="text-muted-foreground">
              {filter === "unread"
                ? "Wszystko przeczytane!"
                : "Powiadomienia pojawia sie gdy ExoSkull znajdzie cos waznego"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => {
            const typeCfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
            return (
              <Card
                key={notif.id}
                className={`cursor-pointer hover:shadow-md transition-shadow ${
                  !notif.is_read ? "border-l-4 border-l-blue-500" : ""
                }`}
                onClick={() => handleClick(notif)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${typeCfg.color}`}>
                      {typeCfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4
                          className={`text-sm ${!notif.is_read ? "font-semibold" : "font-medium"}`}
                        >
                          {notif.title}
                        </h4>
                        <Badge variant="outline" className="text-xs border-0">
                          {typeCfg.label}
                        </Badge>
                      </div>
                      {notif.body && (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                          {notif.body}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTime(notif.created_at)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
