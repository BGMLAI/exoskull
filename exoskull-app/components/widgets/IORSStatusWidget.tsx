"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Shield, Brain } from "lucide-react";
import Link from "next/link";

// ============================================================================
// TYPES
// ============================================================================

interface IORSProfile {
  name: string;
  personality: {
    style?: {
      formality?: number;
      humor?: number;
      directness?: number;
      empathy?: number;
      detail_level?: number;
    };
  } | null;
  birthDate: string | null;
  birthCompleted: boolean;
  activePermissions: number;
  lastEmotion: {
    quadrant: string;
    label: string;
    valence: number;
    arousal: number;
    created_at: string;
  } | null;
}

const TAU_QUADRANT_CONFIG: Record<
  string,
  { emoji: string; label: string; color: string }
> = {
  known_want: { emoji: "😊", label: "Radosc", color: "text-green-500" },
  known_unwant: { emoji: "😤", label: "Frustracja", color: "text-red-500" },
  unknown_want: { emoji: "🤔", label: "Ciekawosc", color: "text-blue-500" },
  unknown_unwant: { emoji: "😶", label: "Apatia", color: "text-gray-500" },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function IORSStatusWidget() {
  const [profile, setProfile] = useState<IORSProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/canvas/iors-profile")
      .then((res) => res.json())
      .then((data) => setProfile(data))
      .catch((err) => console.error("[IORSStatusWidget] Fetch error:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-1/3" />
            <div className="h-3 bg-muted rounded w-2/3" />
            <div className="h-16 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!profile) return null;

  const style = profile.personality?.style;
  const bars = [
    { label: "Formalnosc", value: style?.formality ?? 50 },
    { label: "Humor", value: style?.humor ?? 50 },
    { label: "Bezposredniosc", value: style?.directness ?? 50 },
    { label: "Empatia", value: style?.empathy ?? 50 },
    { label: "Szczegoly", value: style?.detail_level ?? 50 },
  ];

  const emotionConfig = profile.lastEmotion
    ? TAU_QUADRANT_CONFIG[profile.lastEmotion.quadrant]
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-500" />
            {profile.name}
          </span>
          <Link
            href="/dashboard/settings"
            className="text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            Zarzadzaj
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Birth status */}
        <div className="flex items-center gap-2 text-sm">
          {profile.birthCompleted ? (
            <>
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-muted-foreground">
                Aktywny od{" "}
                {profile.birthDate
                  ? new Date(profile.birthDate).toLocaleDateString("pl-PL")
                  : "—"}
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-muted-foreground">W narodzinach...</span>
            </>
          )}
        </div>

        {/* Personality bars */}
        <div className="space-y-1.5">
          {bars.map((bar) => (
            <div key={bar.label} className="flex items-center gap-2 text-xs">
              <span className="w-24 text-muted-foreground truncate">
                {bar.label}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-purple-500/70"
                  style={{ width: `${bar.value}%` }}
                />
              </div>
              <span className="w-6 text-right text-muted-foreground">
                {bar.value}
              </span>
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between pt-1 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            <span>
              {profile.activePermissions} uprawnie
              {profile.activePermissions === 1 ? "nie" : "n"}
            </span>
          </div>
          {emotionConfig && (
            <div className="flex items-center gap-1">
              <Brain className="h-3 w-3" />
              <span className={emotionConfig.color}>
                {emotionConfig.emoji} {emotionConfig.label}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
