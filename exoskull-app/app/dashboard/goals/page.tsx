"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  CalendarDays,
  Flame,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type {
  GoalCategory,
  GoalFrequency,
  GoalDirection,
  Momentum,
  Trajectory,
} from "@/lib/goals/types";

// ============================================================================
// TYPES (DB row shape)
// ============================================================================

interface GoalRow {
  id: string;
  name: string;
  category: GoalCategory;
  description: string | null;
  target_value: number | null;
  target_unit: string | null;
  baseline_value: number | null;
  current_value: number | null;
  frequency: GoalFrequency;
  direction: GoalDirection;
  start_date: string;
  target_date: string | null;
  is_active: boolean;
  created_at: string;
}

interface CheckpointRow {
  progress_percent: number | null;
  momentum: Momentum;
  trajectory: Trajectory;
  value: number;
  checkpoint_date: string;
}

interface GoalWithStatus extends GoalRow {
  latest_checkpoint: CheckpointRow | null;
  days_remaining: number | null;
  streak_days: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TRAJECTORY_CONFIG: Record<
  Trajectory,
  { label: string; color: string; barColor: string }
> = {
  on_track: {
    label: "Na dobrej drodze",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    barColor: "[&>div]:bg-green-500",
  },
  at_risk: {
    label: "Zagrozony",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    barColor: "[&>div]:bg-yellow-500",
  },
  off_track: {
    label: "Wymaga uwagi",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    barColor: "[&>div]:bg-red-500",
  },
  completed: {
    label: "Osiagniety!",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    barColor: "[&>div]:bg-blue-500",
  },
  unknown: {
    label: "Brak danych",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    barColor: "[&>div]:bg-gray-500",
  },
};

const CATEGORY_CONFIG: Record<string, { label: string; emoji: string }> = {
  health: { label: "Zdrowie", emoji: "💪" },
  productivity: { label: "Produktywnosc", emoji: "⚡" },
  finance: { label: "Finanse", emoji: "💰" },
  mental: { label: "Psychika", emoji: "🧠" },
  social: { label: "Relacje", emoji: "👥" },
  learning: { label: "Nauka", emoji: "📚" },
  creativity: { label: "Kreatywnosc", emoji: "🎨" },
};

const MOMENTUM_ICON: Record<Momentum, React.ReactNode> = {
  up: <TrendingUp className="h-4 w-4 text-green-500" />,
  down: <TrendingDown className="h-4 w-4 text-red-500" />,
  stable: <Minus className="h-4 w-4 text-muted-foreground" />,
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function GoalsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [goals, setGoals] = useState<GoalWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // New goal dialog
  const [isNewGoalOpen, setIsNewGoalOpen] = useState(false);
  const [newGoal, setNewGoal] = useState({
    name: "",
    category: "health" as GoalCategory,
    target_value: "",
    target_unit: "",
    frequency: "daily" as GoalFrequency,
    direction: "increase" as GoalDirection,
    target_date: "",
  });
  const [saving, setSaving] = useState(false);

  // Log progress dialog
  const [logGoalId, setLogGoalId] = useState<string | null>(null);
  const [logValue, setLogValue] = useState("");
  const [logSaving, setLogSaving] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    setUserId(user.id);
    await loadGoals(user.id);
  }

  const loadGoals = useCallback(
    async (tenantId: string) => {
      try {
        setLoading(true);

        // Load active goals
        const { data: goalRows, error } = await supabase
          .from("exo_user_goals")
          .select(
            "id, name, category, description, target_value, target_unit, baseline_value, current_value, frequency, direction, start_date, target_date, is_active, created_at",
          )
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("[Goals] Load error:", error);
          return;
        }

        if (!goalRows || goalRows.length === 0) {
          setGoals([]);
          return;
        }

        // Load latest checkpoint for each goal
        const enriched: GoalWithStatus[] = await Promise.all(
          goalRows.map(async (goal) => {
            const { data: cp } = await supabase
              .from("exo_goal_checkpoints")
              .select(
                "progress_percent, momentum, trajectory, value, checkpoint_date",
              )
              .eq("goal_id", goal.id)
              .order("checkpoint_date", { ascending: false })
              .limit(1)
              .maybeSingle();

            // Calculate days remaining
            let days_remaining: number | null = null;
            if (goal.target_date) {
              const diff = new Date(goal.target_date).getTime() - Date.now();
              days_remaining = Math.max(0, Math.ceil(diff / 86400000));
            }

            // Calculate streak (count consecutive days with checkpoints ending today)
            const { data: recentCps } = await supabase
              .from("exo_goal_checkpoints")
              .select("checkpoint_date")
              .eq("goal_id", goal.id)
              .order("checkpoint_date", { ascending: false })
              .limit(30);

            let streak_days = 0;
            if (recentCps && recentCps.length > 0) {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              for (let i = 0; i < recentCps.length; i++) {
                const cpDate = new Date(recentCps[i].checkpoint_date);
                cpDate.setHours(0, 0, 0, 0);
                const expected = new Date(today);
                expected.setDate(expected.getDate() - i);
                if (cpDate.getTime() === expected.getTime()) {
                  streak_days++;
                } else {
                  break;
                }
              }
            }

            return {
              ...goal,
              latest_checkpoint: cp || null,
              days_remaining,
              streak_days,
            };
          }),
        );

        setGoals(enriched);
      } catch (error) {
        console.error("[Goals] Load error:", error);
      } finally {
        setLoading(false);
      }
    },
    [supabase],
  );

  async function handleCreateGoal() {
    if (!userId || !newGoal.name.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase.from("exo_user_goals").insert({
        tenant_id: userId,
        name: newGoal.name.trim(),
        category: newGoal.category,
        target_type: newGoal.target_value ? "numeric" : "boolean",
        target_value: newGoal.target_value
          ? Number(newGoal.target_value)
          : null,
        target_unit: newGoal.target_unit || null,
        frequency: newGoal.frequency,
        direction: newGoal.direction,
        target_date: newGoal.target_date || null,
        is_active: true,
        measurable_proxies: [],
        wellbeing_weight: 1.0,
      });

      if (error) {
        console.error("[Goals] Create error:", error);
        return;
      }

      setIsNewGoalOpen(false);
      setNewGoal({
        name: "",
        category: "health",
        target_value: "",
        target_unit: "",
        frequency: "daily",
        direction: "increase",
        target_date: "",
      });
      await loadGoals(userId);
    } catch (error) {
      console.error("[Goals] Create error:", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogProgress() {
    if (!userId || !logGoalId || !logValue) return;

    setLogSaving(true);
    try {
      const res = await fetch(`/api/goals/${logGoalId}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: Number(logValue) }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("[Goals] Log progress error:", errData);
        return;
      }

      setLogGoalId(null);
      setLogValue("");
      await loadGoals(userId);
    } catch (error) {
      console.error("[Goals] Log progress error:", error);
    } finally {
      setLogSaving(false);
    }
  }

  // Stats
  const stats = {
    total: goals.length,
    on_track: goals.filter(
      (g) => g.latest_checkpoint?.trajectory === "on_track",
    ).length,
    at_risk: goals.filter(
      (g) =>
        g.latest_checkpoint?.trajectory === "at_risk" ||
        g.latest_checkpoint?.trajectory === "off_track",
    ).length,
    completed: goals.filter(
      (g) => g.latest_checkpoint?.trajectory === "completed",
    ).length,
  };

  return (
    <div className="p-4 md:p-8 space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Target className="h-8 w-8 text-blue-500" />
            Cele
          </h1>
          <p className="text-muted-foreground">
            Definiuj cele, sledz postep, osiagaj wiecej
          </p>
        </div>
        <Dialog
          open={isNewGoalOpen}
          onOpenChange={(open) => {
            setIsNewGoalOpen(open);
            if (!open) {
              setNewGoal({
                name: "",
                category: "health",
                target_value: "",
                target_unit: "",
                frequency: "daily",
                direction: "increase",
                target_date: "",
              });
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nowy cel
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Nowy cel</DialogTitle>
              <DialogDescription>
                Okresl swoj cel. Mozesz tez powiedziec glosowo np. &quot;Chce
                biegac 3 razy w tygodniu&quot;.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="goal-name">Nazwa celu *</Label>
                <Input
                  id="goal-name"
                  value={newGoal.name}
                  onChange={(e) =>
                    setNewGoal({ ...newGoal, name: e.target.value })
                  }
                  placeholder='np. "Schudnac 5kg", "Czytac 30 min dziennie"'
                  disabled={saving}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Kategoria</Label>
                  <Select
                    value={newGoal.category}
                    onValueChange={(v) =>
                      setNewGoal({ ...newGoal, category: v as GoalCategory })
                    }
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>
                          {cfg.emoji} {cfg.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Czestotliwosc</Label>
                  <Select
                    value={newGoal.frequency}
                    onValueChange={(v) =>
                      setNewGoal({ ...newGoal, frequency: v as GoalFrequency })
                    }
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Codziennie</SelectItem>
                      <SelectItem value="weekly">Tygodniowo</SelectItem>
                      <SelectItem value="monthly">Miesiecznie</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="target-value">Wartosc docelowa</Label>
                  <Input
                    id="target-value"
                    type="number"
                    value={newGoal.target_value}
                    onChange={(e) =>
                      setNewGoal({ ...newGoal, target_value: e.target.value })
                    }
                    placeholder="np. 5"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target-unit">Jednostka</Label>
                  <Input
                    id="target-unit"
                    value={newGoal.target_unit}
                    onChange={(e) =>
                      setNewGoal({ ...newGoal, target_unit: e.target.value })
                    }
                    placeholder="np. kg, min, razy"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Kierunek</Label>
                  <Select
                    value={newGoal.direction}
                    onValueChange={(v) =>
                      setNewGoal({ ...newGoal, direction: v as GoalDirection })
                    }
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="increase">Wiecej = lepiej</SelectItem>
                      <SelectItem value="decrease">Mniej = lepiej</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-date">Termin (opcjonalny)</Label>
                <Input
                  id="target-date"
                  type="date"
                  value={newGoal.target_date}
                  onChange={(e) =>
                    setNewGoal({ ...newGoal, target_date: e.target.value })
                  }
                  disabled={saving}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsNewGoalOpen(false)}
                disabled={saving}
              >
                Anuluj
              </Button>
              <Button
                onClick={handleCreateGoal}
                disabled={saving || newGoal.name.trim().length < 2}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Tworzenie...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Utworz cel
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Aktywne cele</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Na dobrej drodze
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.on_track}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Zagrozone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.at_risk}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <Target className="h-4 w-4 text-blue-600" />
              Osiagniete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Goals List */}
      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Ladowanie celow...
            </CardContent>
          </Card>
        ) : goals.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <h3 className="font-medium mb-1">Brak celow</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Utworz pierwszy cel, aby zaczac sledzic postepy. Mozesz tez
                powiedziec glosowo &quot;Chce biegac 3 razy w tygodniu&quot;.
              </p>
              <Button onClick={() => setIsNewGoalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Utworz pierwszy cel
              </Button>
            </CardContent>
          </Card>
        ) : (
          goals.map((goal) => {
            const cp = goal.latest_checkpoint;
            const trajectory = cp?.trajectory || "on_track";
            const tConfig = TRAJECTORY_CONFIG[trajectory];
            const catConfig =
              CATEGORY_CONFIG[goal.category] || CATEGORY_CONFIG.health;
            const progressPercent = Math.min(
              100,
              Math.max(0, cp?.progress_percent || 0),
            );

            return (
              <Card key={goal.id}>
                <CardContent className="p-4 md:p-6">
                  <div className="space-y-4">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg">{catConfig.emoji}</span>
                          <h3 className="font-semibold text-lg">{goal.name}</h3>
                          <Badge className={tConfig.color}>
                            {tConfig.label}
                          </Badge>
                        </div>
                        {goal.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {goal.description}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setLogGoalId(goal.id);
                          setLogValue("");
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Loguj
                      </Button>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Postep</span>
                        <span className="font-medium">
                          {Math.round(progressPercent)}%
                        </span>
                      </div>
                      <Progress
                        value={progressPercent}
                        className={`h-3 ${tConfig.barColor}`}
                      />
                    </div>

                    {/* Metadata row */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {/* Momentum */}
                      <span className="flex items-center gap-1">
                        {MOMENTUM_ICON[cp?.momentum || "stable"]}
                        {cp?.momentum === "up"
                          ? "Trend wzrostowy"
                          : cp?.momentum === "down"
                            ? "Trend spadkowy"
                            : "Stabilny"}
                      </span>

                      {/* Target */}
                      {goal.target_value && (
                        <span>
                          Cel: {goal.target_value}{" "}
                          {goal.target_unit === "currency"
                            ? "PLN"
                            : goal.target_unit === "weight"
                              ? "kg"
                              : goal.target_unit === "percent"
                                ? "%"
                                : goal.target_unit === "distance"
                                  ? "km"
                                  : goal.target_unit === "time"
                                    ? "min"
                                    : goal.target_unit === "calories"
                                      ? "kcal"
                                      : goal.target_unit || ""}
                        </span>
                      )}

                      {/* Current value */}
                      {cp?.value !== undefined && (
                        <span>
                          Aktualnie: {cp.value}{" "}
                          {goal.target_unit === "currency"
                            ? "PLN"
                            : goal.target_unit === "weight"
                              ? "kg"
                              : goal.target_unit === "percent"
                                ? "%"
                                : goal.target_unit === "distance"
                                  ? "km"
                                  : goal.target_unit === "time"
                                    ? "min"
                                    : goal.target_unit === "calories"
                                      ? "kcal"
                                      : goal.target_unit || ""}
                        </span>
                      )}

                      {/* Days remaining */}
                      {goal.days_remaining !== null && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-4 w-4" />
                          {goal.days_remaining} dni
                        </span>
                      )}

                      {/* Streak */}
                      {goal.streak_days > 0 && (
                        <span className="flex items-center gap-1">
                          <Flame className="h-4 w-4 text-orange-500" />
                          {goal.streak_days}d seria
                        </span>
                      )}

                      {/* Frequency */}
                      <span className="text-xs">
                        {goal.frequency === "daily"
                          ? "Codziennie"
                          : goal.frequency === "weekly"
                            ? "Tygodniowo"
                            : "Miesiecznie"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Log Progress Dialog */}
      <Dialog
        open={!!logGoalId}
        onOpenChange={(open) => {
          if (!open) {
            setLogGoalId(null);
            setLogValue("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Zaloguj postep</DialogTitle>
            <DialogDescription>
              {logGoalId &&
                (() => {
                  const g = goals.find((g) => g.id === logGoalId);
                  return g
                    ? `${g.name}${g.target_unit ? ` (${g.target_unit})` : ""}`
                    : "";
                })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="log-value">Wartosc</Label>
              <Input
                id="log-value"
                type="number"
                value={logValue}
                onChange={(e) => setLogValue(e.target.value)}
                placeholder="np. 5"
                autoFocus
                disabled={logSaving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLogGoalId(null)}
              disabled={logSaving}
            >
              Anuluj
            </Button>
            <Button
              onClick={handleLogProgress}
              disabled={logSaving || !logValue}
            >
              {logSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Zapisywanie...
                </>
              ) : (
                "Zapisz"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
