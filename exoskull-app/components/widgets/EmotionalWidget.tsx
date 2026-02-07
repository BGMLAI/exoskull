"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface EmotionData {
  currentMood: string | null;
  moodHistory: { date: string; mood: string; stress: number | null }[];
}

const MOOD_CONFIG: Record<
  string,
  { emoji: string; label: string; color: string }
> = {
  positive: { emoji: "😊", label: "Pozytywny", color: "text-green-500" },
  calm: { emoji: "😌", label: "Spokojny", color: "text-blue-500" },
  stressed: { emoji: "😰", label: "Zestresowany", color: "text-red-500" },
  low: { emoji: "😔", label: "Przygnebiony", color: "text-gray-500" },
  focused: { emoji: "🎯", label: "Skupiony", color: "text-purple-500" },
};

// ============================================================================
// COMPONENT
// ============================================================================

interface EmotionalWidgetProps {
  tenantId: string;
  className?: string;
}

export function EmotionalWidget({ tenantId, className }: EmotionalWidgetProps) {
  const [data, setData] = useState<EmotionData>({
    currentMood: null,
    moodHistory: [],
  });

  useEffect(() => {
    const supabase = createClient();

    async function loadEmotions() {
      try {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const { data: logs } = await supabase
          .from("exo_emotion_log")
          .select("mood, stress_level, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", weekAgo.toISOString())
          .order("created_at", { ascending: false })
          .limit(30);

        if (logs && logs.length > 0) {
          setData({
            currentMood: logs[0].mood,
            moodHistory: logs.map((l) => ({
              date: l.created_at,
              mood: l.mood,
              stress: l.stress_level,
            })),
          });
        }
      } catch (err) {
        console.error("[EmotionalWidget] Load error:", err);
      }
    }

    loadEmotions();
  }, [tenantId]);

  const config = data.currentMood ? MOOD_CONFIG[data.currentMood] : null;
  const moodCounts = data.moodHistory.reduce(
    (acc, h) => {
      acc[h.mood] = (acc[h.mood] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const dominantMood = Object.entries(moodCounts).sort(
    ([, a], [, b]) => b - a,
  )[0];

  return (
    <div className={cn("block", className)}>
      <div className="p-3 rounded-lg border bg-card">
        {config ? (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{config.emoji}</span>
              <span className={cn("text-sm font-medium", config.color)}>
                {config.label}
              </span>
            </div>

            {/* Mini sparkline using dots */}
            <div className="flex items-center gap-0.5 mt-2">
              {data.moodHistory
                .slice(0, 7)
                .reverse()
                .map((h, i) => {
                  const mc = MOOD_CONFIG[h.mood];
                  return (
                    <div
                      key={i}
                      className={cn(
                        "w-2 h-2 rounded-full",
                        h.mood === "positive" && "bg-green-500",
                        h.mood === "calm" && "bg-blue-500",
                        h.mood === "stressed" && "bg-red-500",
                        h.mood === "low" && "bg-gray-400",
                        h.mood === "focused" && "bg-purple-500",
                      )}
                      title={mc?.label}
                    />
                  );
                })}
              <span className="text-[10px] text-muted-foreground ml-1">7d</span>
            </div>

            {dominantMood && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Dominujacy:{" "}
                {MOOD_CONFIG[dominantMood[0]]?.label || dominantMood[0]}
              </p>
            )}
          </>
        ) : (
          <div className="text-center py-1">
            <span className="text-lg">🧠</span>
            <p className="text-xs text-muted-foreground mt-1">Nastroj</p>
            <p className="text-[10px] text-muted-foreground">Brak danych</p>
          </div>
        )}
      </div>
    </div>
  );
}
