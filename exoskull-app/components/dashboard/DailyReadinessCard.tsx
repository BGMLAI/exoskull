"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, TrendingUp, Lightbulb } from "lucide-react";

// ============================================================================
// COMPONENT
// ============================================================================

export function DailyReadinessCard() {
  const [readiness, setReadiness] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReadiness() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        // Fetch latest data for composite score
        const [healthRes, moodRes, taskRes] = await Promise.all([
          supabase
            .from("exo_health_metrics")
            .select("metric_type, value")
            .eq("tenant_id", user.id)
            .in("metric_type", ["sleep", "hrv"])
            .order("recorded_at", { ascending: false })
            .limit(2),
          supabase
            .from("exo_emotion_log")
            .select("intensity, valence")
            .eq("tenant_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single(),
          supabase
            .from("exo_tasks")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", user.id)
            .eq("status", "pending"),
        ]);

        const sleep = healthRes.data?.find(
          (h) => h.metric_type === "sleep",
        )?.value;
        const hrv = healthRes.data?.find((h) => h.metric_type === "hrv")?.value;
        // Map intensity (0-100) + valence (-1 to 1) to a 1-10 mood score
        const rawIntensity = moodRes.data?.intensity;
        const rawValence = moodRes.data?.valence;
        const mood =
          rawIntensity != null
            ? rawValence != null
              ? Math.round(((rawValence + 1) / 2) * 10) // valence-based: -1→0, 0→5, 1→10
              : Math.round(rawIntensity / 10) // fallback: intensity 0-100 → 0-10
            : null;
        const pendingTasks = taskRes.count || 0;

        // Composite readiness: sleep quality 30% + HRV trend 25% + mood 25% + task load 20%
        let score = 50; // baseline
        const recs: string[] = [];

        if (sleep !== null && sleep !== undefined) {
          const sleepScore = Math.min(100, (sleep / 8) * 100);
          score = score * 0.7 + sleepScore * 0.3;
          if (sleep < 6)
            recs.push("Sen ponizej 6h — rozważ wczesniejszy odpoczynek");
        }

        if (hrv !== null && hrv !== undefined) {
          const hrvScore = Math.min(100, (hrv / 60) * 100);
          score = score * 0.75 + hrvScore * 0.25;
          if (hrv < 30) recs.push("Niskie HRV — rozważ techniki oddechowe");
        }

        if (mood !== null && mood !== undefined) {
          const moodScore = mood * 10;
          score = score * 0.75 + moodScore * 0.25;
          if (mood < 5) recs.push("Nastroj ponizej sredniej — zadbaj o siebie");
        }

        // Task load penalty
        if (pendingTasks > 10) {
          score = score * 0.9;
          recs.push(
            `${pendingTasks} oczekujacych zadan — skup sie na priorytetach`,
          );
        }

        if (recs.length === 0) {
          recs.push("Swietnie sie trzymasz! Kontynuuj.");
        }

        setReadiness(Math.round(Math.max(0, Math.min(100, score))));
        setRecommendations(recs.slice(0, 3));
      } catch (error) {
        console.error("[DailyReadinessCard] Fetch error:", {
          error: error instanceof Error ? error.message : error,
        });
      } finally {
        setLoading(false);
      }
    }

    fetchReadiness();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const getColor = (score: number) => {
    if (score >= 70) return "text-green-600";
    if (score >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <TrendingUp className="w-5 h-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">
                Gotowosc na dzisiaj
              </span>
              <span
                className={`text-2xl font-bold ${getColor(readiness || 0)}`}
              >
                {readiness !== null ? `${readiness}%` : "—"}
              </span>
            </div>
            {readiness !== null && (
              <Progress value={readiness} className="mt-2 h-2" />
            )}
          </div>
        </div>

        {recommendations.length > 0 && (
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{rec}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
