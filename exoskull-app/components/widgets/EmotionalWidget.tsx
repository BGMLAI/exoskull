"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface EmotionData {
  currentEmotion: string | null;
  emotionHistory: { date: string; emotion: string; intensity: number | null }[];
}

const EMOTION_CONFIG: Record<
  string,
  { emoji: string; label: string; color: string; bgColor: string }
> = {
  happy: {
    emoji: "😊",
    label: "Szczesliwy",
    color: "text-green-500",
    bgColor: "bg-green-500",
  },
  sad: {
    emoji: "😔",
    label: "Smutny",
    color: "text-blue-400",
    bgColor: "bg-blue-400",
  },
  angry: {
    emoji: "😤",
    label: "Zly",
    color: "text-red-500",
    bgColor: "bg-red-500",
  },
  fearful: {
    emoji: "😰",
    label: "Przestraszony",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500",
  },
  disgusted: {
    emoji: "😖",
    label: "Zniesmaczony",
    color: "text-orange-500",
    bgColor: "bg-orange-500",
  },
  surprised: {
    emoji: "😲",
    label: "Zaskoczony",
    color: "text-purple-500",
    bgColor: "bg-purple-500",
  },
  neutral: {
    emoji: "😐",
    label: "Neutralny",
    color: "text-gray-500",
    bgColor: "bg-gray-400",
  },
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
    currentEmotion: null,
    emotionHistory: [],
  });

  useEffect(() => {
    const supabase = createClient();

    async function loadEmotions() {
      try {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const { data: logs } = await supabase
          .from("exo_emotion_log")
          .select("primary_emotion, intensity, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", weekAgo.toISOString())
          .order("created_at", { ascending: false })
          .limit(30);

        if (logs && logs.length > 0) {
          setData({
            currentEmotion: logs[0].primary_emotion,
            emotionHistory: logs.map((l) => ({
              date: l.created_at,
              emotion: l.primary_emotion,
              intensity: l.intensity,
            })),
          });
        }
      } catch (err) {
        console.error("[EmotionalWidget] Load error:", err);
      }
    }

    loadEmotions();
  }, [tenantId]);

  const config = data.currentEmotion
    ? EMOTION_CONFIG[data.currentEmotion]
    : null;
  const emotionCounts = data.emotionHistory.reduce(
    (acc, h) => {
      acc[h.emotion] = (acc[h.emotion] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const dominantEmotion = Object.entries(emotionCounts).sort(
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
              {data.emotionHistory
                .slice(0, 7)
                .reverse()
                .map((h, i) => {
                  const ec = EMOTION_CONFIG[h.emotion];
                  return (
                    <div
                      key={i}
                      className={cn(
                        "w-2 h-2 rounded-full",
                        ec?.bgColor || "bg-gray-400",
                      )}
                      title={ec?.label}
                    />
                  );
                })}
              <span className="text-[10px] text-muted-foreground ml-1">7d</span>
            </div>

            {dominantEmotion && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Dominujacy:{" "}
                {EMOTION_CONFIG[dominantEmotion[0]]?.label ||
                  dominantEmotion[0]}
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
