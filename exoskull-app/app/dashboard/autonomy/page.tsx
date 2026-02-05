"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Loader2,
  Plus,
  ThumbsUp,
  ThumbsDown,
  Minus,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  AlertTriangle,
  Zap,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface AutonomyGrant {
  id: string;
  user_id: string;
  action_pattern: string;
  category: string;
  granted_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  use_count: number;
  error_count: number;
  spending_limit: number | null;
  daily_limit: number | null;
  is_active: boolean;
}

interface Intervention {
  id: string;
  tenant_id: string;
  intervention_type: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  urgency_score: number;
  requires_approval: boolean;
  executed_at: string | null;
  user_feedback: string | null;
  feedback_notes: string | null;
  created_at: string;
}

interface AutonomyStats {
  total_interventions: number;
  completed: number;
  failed: number;
  avg_effectiveness: number;
  active_grants: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_LABELS: Record<string, string> = {
  communication: "Komunikacja",
  tasks: "Zadania",
  health: "Zdrowie",
  finance: "Finanse",
  calendar: "Kalendarz",
  smart_home: "Smart Home",
  other: "Inne",
};

const CATEGORY_ICONS: Record<string, string> = {
  communication: "💬",
  tasks: "✅",
  health: "❤️",
  finance: "💰",
  calendar: "📅",
  smart_home: "🏠",
  other: "⚙️",
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  proposed: {
    label: "Zaproponowane",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  approved: {
    label: "Zatwierdzone",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  executing: {
    label: "Wykonywane",
    color:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  },
  completed: {
    label: "Wykonane",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  failed: {
    label: "Nieudane",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  rejected: {
    label: "Odrzucone",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
  expired: {
    label: "Wygasle",
    color: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500",
  },
  cancelled: {
    label: "Anulowane",
    color: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500",
  },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Niski", color: "text-green-600" },
  medium: { label: "Sredni", color: "text-yellow-600" },
  high: { label: "Wysoki", color: "text-orange-600" },
  critical: { label: "Krytyczny", color: "text-red-600" },
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function AutonomyPage() {
  const [grants, setGrants] = useState<Record<string, AutonomyGrant[]>>({});
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [pending, setPending] = useState<Intervention[]>([]);
  const [stats, setStats] = useState<AutonomyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // New grant form
  const [showNewGrant, setShowNewGrant] = useState(false);
  const [newGrantPattern, setNewGrantPattern] = useState("");
  const [newGrantCategory, setNewGrantCategory] = useState("other");

  // --------------------------------------------------------------------------
  // DATA FETCHING
  // --------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;
      setUserId(user.id);

      const [grantsRes, pendingRes, historyRes, statsRes] = await Promise.all([
        fetch(`/api/autonomy?userId=${user.id}`),
        fetch(`/api/autonomy/execute?tenantId=${user.id}&type=pending`),
        fetch(
          `/api/autonomy/execute?tenantId=${user.id}&type=history&limit=20`,
        ),
        fetch(`/api/autonomy/execute?tenantId=${user.id}&type=stats&days=30`),
      ]);

      if (grantsRes.ok) {
        const data = await grantsRes.json();
        setGrants(data.grants || data || {});
      }
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPending(data.interventions || data || []);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setInterventions(data.interventions || data || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats || data || null);
      }
    } catch (error) {
      console.error("[AutonomyPage] Fetch error:", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --------------------------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------------------------

  const handleCreateGrant = async () => {
    if (!userId || !newGrantPattern.trim()) return;
    try {
      const res = await fetch("/api/autonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          actionPattern: newGrantPattern,
          category: newGrantCategory,
        }),
      });
      if (res.ok) {
        setNewGrantPattern("");
        setShowNewGrant(false);
        await fetchData();
      } else {
        const err = await res.json();
        console.error("[AutonomyPage] Create grant error:", err);
      }
    } catch (error) {
      console.error("[AutonomyPage] Create grant error:", {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  const handleToggleGrant = async (grantId: string, isActive: boolean) => {
    if (!userId) return;
    try {
      const res = await fetch("/api/autonomy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId, userId, isActive: !isActive }),
      });
      if (res.ok) await fetchData();
    } catch (error) {
      console.error("[AutonomyPage] Toggle grant error:", {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  const handleDeleteGrant = async (grantId: string) => {
    if (!userId) return;
    try {
      const res = await fetch(
        `/api/autonomy?grantId=${grantId}&userId=${userId}`,
        { method: "DELETE" },
      );
      if (res.ok) await fetchData();
    } catch (error) {
      console.error("[AutonomyPage] Delete grant error:", {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  const handleApprove = async (interventionId: string) => {
    if (!userId) return;
    try {
      await fetch("/api/autonomy/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "approve",
          tenantId: userId,
          interventionId,
        }),
      });
      await fetchData();
    } catch (error) {
      console.error("[AutonomyPage] Approve error:", {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  const handleReject = async (interventionId: string) => {
    if (!userId) return;
    try {
      await fetch("/api/autonomy/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "reject",
          tenantId: userId,
          interventionId,
        }),
      });
      await fetchData();
    } catch (error) {
      console.error("[AutonomyPage] Reject error:", {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  const handleFeedback = async (interventionId: string, feedback: string) => {
    if (!userId) return;
    try {
      await fetch("/api/autonomy/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "feedback",
          tenantId: userId,
          interventionId,
          feedback,
        }),
      });
      await fetchData();
    } catch (error) {
      console.error("[AutonomyPage] Feedback error:", {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  // --------------------------------------------------------------------------
  // COMPUTED
  // --------------------------------------------------------------------------

  const allGrants = Object.values(grants).flat();
  const activeGrants = allGrants.filter((g) => g.is_active);

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
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-7 h-7" />
          Autonomia
        </h1>
        <p className="text-muted-foreground">
          Kontroluj co ExoSkull moze robic samodzielnie
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeGrants.length}</p>
                <p className="text-sm text-muted-foreground">Aktywne granty</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Zap className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.completed || 0}</p>
                <p className="text-sm text-muted-foreground">Wykonane (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pending.length}</p>
                <p className="text-sm text-muted-foreground">Oczekujace</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Activity className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {stats?.avg_effectiveness
                    ? `${(stats.avg_effectiveness * 10).toFixed(0)}%`
                    : "—"}
                </p>
                <p className="text-sm text-muted-foreground">Skutecznosc</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Interventions */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Oczekujace na Twoja decyzje ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map((item) => (
              <Card
                key={item.id}
                className="border-yellow-200 dark:border-yellow-800"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">{item.title}</h3>
                        <Badge
                          variant="outline"
                          className={`border-0 text-xs ${PRIORITY_CONFIG[item.priority]?.color || ""}`}
                        >
                          {PRIORITY_CONFIG[item.priority]?.label ||
                            item.priority}
                        </Badge>
                      </div>
                      {item.description && (
                        <p className="text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleApprove(item.id)}>
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Zatwierdz
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(item.id)}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Odrzuc
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Grants */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Uprawnienia</h2>
          <Dialog open={showNewGrant} onOpenChange={setShowNewGrant}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Dodaj uprawnienie
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nowe uprawnienie</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Wzorzec akcji</label>
                  <Input
                    placeholder="np. send_sms:*, schedule_meeting:*"
                    value={newGrantPattern}
                    onChange={(e) => setNewGrantPattern(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Uzyj * jako wildcard. Np. send_sms:family, health:*
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Kategoria</label>
                  <Select
                    value={newGrantCategory}
                    onValueChange={setNewGrantCategory}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {CATEGORY_ICONS[k]} {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowNewGrant(false)}
                >
                  Anuluj
                </Button>
                <Button onClick={handleCreateGrant}>Dodaj</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {Object.keys(grants).length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Brak uprawnien</h3>
              <p className="text-muted-foreground">
                Dodaj uprawnienia zeby ExoSkull mogl dzialac autonomicznie
              </p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(grants).map(([category, categoryGrants]) => (
            <Card key={category}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>{CATEGORY_ICONS[category] || "⚙️"}</span>
                  {CATEGORY_LABELS[category] || category}
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {categoryGrants.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {categoryGrants.map((grant) => (
                  <div
                    key={grant.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <code className="text-sm font-mono">
                        {grant.action_pattern}
                      </code>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>Uzyto: {grant.use_count}x</span>
                        {grant.daily_limit && (
                          <span>Limit: {grant.daily_limit}/d</span>
                        )}
                        {grant.error_count > 0 && (
                          <span className="text-red-500">
                            Bledy: {grant.error_count}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={grant.is_active ? "outline" : "default"}
                        onClick={() =>
                          handleToggleGrant(grant.id, grant.is_active)
                        }
                      >
                        {grant.is_active ? (
                          <ShieldCheck className="w-4 h-4" />
                        ) : (
                          <ShieldOff className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteGrant(grant.id)}
                      >
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Intervention History */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Historia dzialan</h2>
        {interventions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Brak historii</h3>
              <p className="text-muted-foreground">
                Dzialania autonomiczne pojawia sie tutaj
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {interventions.map((item) => {
              const statusCfg =
                STATUS_CONFIG[item.status] || STATUS_CONFIG.completed;
              return (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-sm">{item.title}</h4>
                          <Badge
                            variant="outline"
                            className={`border-0 text-xs ${statusCfg.color}`}
                          >
                            {statusCfg.label}
                          </Badge>
                        </div>
                        {item.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {item.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(item.created_at).toLocaleString("pl-PL", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      {item.status === "completed" && !item.user_feedback && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleFeedback(item.id, "helpful")}
                            title="Pomocne"
                          >
                            <ThumbsUp className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleFeedback(item.id, "unhelpful")}
                            title="Niepomocne"
                          >
                            <ThumbsDown className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                      {item.user_feedback && (
                        <Badge
                          variant="outline"
                          className={`border-0 text-xs ${
                            item.user_feedback === "helpful"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                          }`}
                        >
                          {item.user_feedback === "helpful" ? "👍" : "👎"}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
