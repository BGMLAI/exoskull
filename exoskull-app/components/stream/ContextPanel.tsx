"use client";

import { useEffect, useState } from "react";
import { User, CheckSquare, Activity, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContextPanelProps {
  ttsEnabled: boolean;
  onToggleTTS: () => void;
}

interface ProfileSummary {
  name: string;
  email?: string;
}

interface TaskCount {
  total: number;
  completed: number;
}

interface EmotionTrend {
  avg_valence: number;
  total_signals: number;
}

export function ContextPanel({ ttsEnabled, onToggleTTS }: ContextPanelProps) {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [tasks, setTasks] = useState<TaskCount | null>(null);
  const [emotions, setEmotions] = useState<EmotionTrend | null>(null);

  useEffect(() => {
    // Fetch profile
    fetch("/api/user/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data)
          setProfile({
            name: data.name || data.email || "User",
            email: data.email,
          });
      })
      .catch(() => {});

    // Fetch task counts
    fetch("/api/canvas/tasks")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tasks) {
          const total = data.tasks.length;
          const completed = data.tasks.filter(
            (t: { status: string }) => t.status === "completed",
          ).length;
          setTasks({ total, completed });
        }
      })
      .catch(() => {});

    // Fetch emotion trend (last 7 days)
    fetch("/api/canvas/data/emotions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.trend) {
          setEmotions({
            avg_valence: data.trend.avg_valence ?? 0,
            total_signals: data.trend.total_signals ?? 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="w-80 border-l border-border bg-background/50 p-4 space-y-5 overflow-y-auto">
      {/* Profile */}
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <User className="w-3 h-3" />
          Profil
        </h3>
        {profile ? (
          <div className="text-sm">
            <p className="font-medium">{profile.name}</p>
            {profile.email && (
              <p className="text-xs text-muted-foreground">{profile.email}</p>
            )}
          </div>
        ) : (
          <div className="h-8 bg-muted/50 rounded animate-pulse" />
        )}
      </section>

      {/* Tasks */}
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <CheckSquare className="w-3 h-3" />
          Zadania
        </h3>
        {tasks ? (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">
              {tasks.completed}/{tasks.total}
            </span>
            <span className="text-xs text-muted-foreground">ukonczonych</span>
          </div>
        ) : (
          <div className="h-8 bg-muted/50 rounded animate-pulse" />
        )}
      </section>

      {/* Emotions */}
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="w-3 h-3" />
          Emocje (7 dni)
        </h3>
        {emotions ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    emotions.avg_valence >= 0 ? "bg-green-500" : "bg-red-500",
                  )}
                  style={{
                    width: `${Math.abs(emotions.avg_valence) * 50 + 50}%`,
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-10 text-right">
                {emotions.avg_valence >= 0 ? "+" : ""}
                {emotions.avg_valence.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {emotions.total_signals} odczytow
            </p>
          </div>
        ) : (
          <div className="h-8 bg-muted/50 rounded animate-pulse" />
        )}
      </section>

      {/* Settings */}
      <section className="space-y-2 pt-2 border-t border-border">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Ustawienia
        </h3>
        <button
          onClick={onToggleTTS}
          className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted transition-colors text-sm"
        >
          {ttsEnabled ? (
            <Volume2 className="w-4 h-4 text-primary" />
          ) : (
            <VolumeX className="w-4 h-4 text-muted-foreground" />
          )}
          <span>{ttsEnabled ? "TTS wlaczony" : "TTS wylaczony"}</span>
        </button>
      </section>
    </div>
  );
}
