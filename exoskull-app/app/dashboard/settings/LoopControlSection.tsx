"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw } from "lucide-react";

interface LoopConfig {
  activity_class: string;
  last_eval_at: string | null;
  next_eval_at: string | null;
  cycles_today: number;
  interventions_today: number;
  user_eval_interval_minutes: number | null;
  daily_ai_budget_cents: number;
  spent_today_cents: number;
}

const ACTIVITY_CLASS_COLORS: Record<string, string> = {
  active:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  normal: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  dormant:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  sleeping: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const FREQUENCY_OPTIONS = [
  { value: "auto", label: "Automatyczna (system decyduje)" },
  { value: "5", label: "Co 5 min" },
  { value: "15", label: "Co 15 min" },
  { value: "30", label: "Co 30 min" },
  { value: "60", label: "Co 60 min" },
  { value: "0", label: "Wylaczona" },
];

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const absDiff = Math.abs(diff);
  const mins = Math.floor(absDiff / 60000);
  if (mins < 1) return diff > 0 ? "teraz" : "za chwile";
  if (mins < 60) return diff > 0 ? `${mins} min temu` : `za ${mins} min`;
  const hours = Math.floor(mins / 60);
  return diff > 0 ? `${hours}h temu` : `za ${hours}h`;
}

export function LoopControlSection() {
  const [config, setConfig] = useState<LoopConfig | null>(null);
  const [frequency, setFrequency] = useState("auto");
  const [budget, setBudget] = useState(50);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/loop-config");
        if (!res.ok) throw new Error("Nie udalo sie pobrac konfiguracji petli");
        const data = await res.json();
        setConfig(data);
        setFrequency(
          data.user_eval_interval_minutes === null
            ? "auto"
            : String(data.user_eval_interval_minutes),
        );
        setBudget(data.daily_ai_budget_cents ?? 50);
      } catch (err) {
        console.error("[LoopControlSection] Load error:", {
          error: err instanceof Error ? err.message : err,
        });
        setError(err instanceof Error ? err.message : "Nieznany blad");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function save() {
    try {
      setSaving(true);
      setSaved(false);
      setError(null);
      const res = await fetch("/api/settings/loop-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_eval_interval_minutes:
            frequency === "auto" ? null : parseInt(frequency, 10),
          daily_ai_budget_cents: budget,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nie udalo sie zapisac");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("[LoopControlSection] Save error:", {
        error: err instanceof Error ? err.message : err,
      });
      setError(err instanceof Error ? err.message : "Nieznany blad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Petla MAPEK
        </CardTitle>
        <CardDescription>
          Status, czestotliwosc ewaluacji i budzet AI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <>
            {/* Status (read-only) */}
            {config && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      Klasa aktywnosci
                    </p>
                    <Badge
                      variant="secondary"
                      className={
                        ACTIVITY_CLASS_COLORS[config.activity_class] || ""
                      }
                    >
                      {config.activity_class}
                    </Badge>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      Ostatnia ewaluacja
                    </p>
                    <p className="text-sm font-medium">
                      {relativeTime(config.last_eval_at)}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Nastepna</p>
                    <p className="text-sm font-medium">
                      {relativeTime(config.next_eval_at)}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      Cykle dzisiaj
                    </p>
                    <p className="text-sm font-medium">{config.cycles_today}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      Interwencje dzisiaj
                    </p>
                    <p className="text-sm font-medium">
                      {config.interventions_today}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Frequency */}
            <div className="space-y-2">
              <Label>Czestotliwosc ewaluacji</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Automatyczna zmienia czestotliwosc na podstawie Twojej
                aktywnosci (5-240 min)
              </p>
            </div>

            {/* AI Budget */}
            <div className="space-y-2">
              <Label>
                Budzet AI dzienny:{" "}
                <span className="font-normal text-muted-foreground">
                  ${(budget / 100).toFixed(2)}
                </span>
              </Label>
              <input
                type="range"
                min="10"
                max="500"
                step="10"
                value={budget}
                onChange={(e) => setBudget(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>$0.10</span>
                <span>$5.00</span>
              </div>
              {config && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>
                      Wydane dzisiaj: $
                      {(config.spent_today_cents / 100).toFixed(2)}
                    </span>
                    <span>
                      {budget > 0
                        ? Math.round((config.spent_today_cents / budget) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                  <Progress
                    value={
                      budget > 0
                        ? Math.min(
                            100,
                            (config.spent_today_cents / budget) * 100,
                          )
                        : 0
                    }
                    className="h-2"
                  />
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving}>
                {saving ? "Zapisywanie..." : "Zapisz ustawienia petli"}
              </Button>
              {saved && (
                <span className="text-sm text-green-600">Zapisano</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
