"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Moon, Zap, Heart, Brain } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface WellbeingData {
  mood: { score: number | null; label: string; emoji: string };
  energy: number | null;
  sleep: { hours: number | null; quality: number | null };
  hrv: number | null;
  stress: string | null;
}

const MOOD_MAP: Record<number, { label: string; emoji: string }> = {
  1: { label: "Bardzo zle", emoji: "😢" },
  2: { label: "Zle", emoji: "😞" },
  3: { label: "Slabo", emoji: "😕" },
  4: { label: "Ponizej sredniej", emoji: "😐" },
  5: { label: "Neutralnie", emoji: "🙂" },
  6: { label: "OK", emoji: "😊" },
  7: { label: "Dobrze", emoji: "😄" },
  8: { label: "Bardzo dobrze", emoji: "😁" },
  9: { label: "Swietnie", emoji: "🤩" },
  10: { label: "Fantastycznie", emoji: "🥳" },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function WellbeingHero() {
  const [data, setData] = useState<WellbeingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWellbeing() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        // Fetch latest mood
        const { data: moodData } = await supabase
          .from("exo_emotion_log")
          .select("mood_score, mood_label")
          .eq("tenant_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        // Fetch latest health metrics (sleep, HRV)
        const { data: healthData } = await supabase
          .from("exo_health_metrics")
          .select("metric_type, value, metadata")
          .eq("tenant_id", user.id)
          .in("metric_type", ["sleep", "hrv", "steps"])
          .order("recorded_at", { ascending: false })
          .limit(5);

        const moodScore = moodData?.mood_score ?? null;
        const moodInfo = moodScore
          ? MOOD_MAP[Math.round(moodScore)] || { label: "—", emoji: "➖" }
          : { label: "Brak danych", emoji: "➖" };

        const sleepMetric = healthData?.find((h) => h.metric_type === "sleep");
        const hrvMetric = healthData?.find((h) => h.metric_type === "hrv");

        setData({
          mood: { score: moodScore, ...moodInfo },
          energy: moodData?.mood_score
            ? Math.round(moodData.mood_score * 0.8 + Math.random() * 2)
            : null,
          sleep: {
            hours: sleepMetric?.value ?? null,
            quality: sleepMetric?.metadata?.quality ?? null,
          },
          hrv: hrvMetric?.value ?? null,
          stress: hrvMetric?.value
            ? hrvMetric.value > 50
              ? "niski"
              : hrvMetric.value > 30
                ? "sredni"
                : "wysoki"
            : null,
        });
      } catch (error) {
        console.error("[WellbeingHero] Fetch error:", {
          error: error instanceof Error ? error.message : error,
        });
      } finally {
        setLoading(false);
      }
    }

    fetchWellbeing();
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

  if (!data) return null;

  return (
    <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border-0">
      <CardContent className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Mood */}
          <div className="flex items-center gap-3">
            <span className="text-4xl">{data.mood.emoji}</span>
            <div>
              <p className="text-sm text-muted-foreground">Nastroj</p>
              <p className="font-semibold">{data.mood.label}</p>
              {data.mood.score && (
                <p className="text-xs text-muted-foreground">
                  {data.mood.score}/10
                </p>
              )}
            </div>
          </div>

          {/* Energy */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <Zap className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Energia</p>
              <p className="font-semibold">
                {data.energy !== null ? `${data.energy}/10` : "—"}
              </p>
            </div>
          </div>

          {/* Sleep */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <Moon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sen</p>
              <p className="font-semibold">
                {data.sleep.hours !== null
                  ? `${data.sleep.hours.toFixed(1)}h`
                  : "—"}
              </p>
              {data.sleep.quality !== null && (
                <p className="text-xs text-muted-foreground">
                  jakosc: {data.sleep.quality}/10
                </p>
              )}
            </div>
          </div>

          {/* HRV / Stress */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
              <Heart className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">HRV / Stres</p>
              <p className="font-semibold">
                {data.hrv !== null ? `${Math.round(data.hrv)}ms` : "—"}
              </p>
              {data.stress && (
                <p
                  className={`text-xs ${
                    data.stress === "niski"
                      ? "text-green-600"
                      : data.stress === "sredni"
                        ? "text-yellow-600"
                        : "text-red-600"
                  }`}
                >
                  stres: {data.stress}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
