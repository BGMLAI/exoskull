"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye } from "lucide-react";

interface MIT {
  objective: string;
  reasoning: string;
  rank: number;
}

interface Pattern {
  id: string;
  pattern_type: string;
  description: string;
  confidence: number;
}

interface LearningEvent {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
}

interface Engagement {
  level: string;
  churn_risk: string;
}

interface MyData {
  mits: MIT[];
  patterns: Pattern[];
  learning_events: LearningEvent[];
  engagement: Engagement | null;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  highlight_added:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  highlight_boosted:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  pattern_detected:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

const PATTERN_TYPE_COLORS: Record<string, string> = {
  behavioral:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  health: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  productivity:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  social: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
};

const ENGAGEMENT_COLORS: Record<string, string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  medium:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const CHURN_RISK_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  medium:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export function MyDataSection() {
  const [data, setData] = useState<MyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/user/my-data");
        if (!res.ok) throw new Error("Nie udalo sie pobrac danych");
        const json = await res.json();

        // Map API response to component's expected shape
        const mits: MIT[] = (json.mits ?? []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (m: any, i: number) => ({
            objective: m.objective ?? m.content ?? "",
            reasoning: m.reasoning ?? m.category ?? "",
            rank: m.rank ?? i + 1,
          }),
        );
        const patterns: Pattern[] = (json.patterns ?? []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => ({
            id: p.id,
            pattern_type: p.pattern_type ?? "",
            description: p.description ?? "",
            confidence: p.confidence ?? 0,
          }),
        );
        // API returns "learningEvents", component expects "learning_events"
        const learning_events: LearningEvent[] = (
          json.learning_events ??
          json.learningEvents ??
          []
        ).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (e: any) => ({
            id: e.id,
            event_type: e.event_type ?? "",
            description: e.description ?? "",
            created_at: e.created_at ?? "",
          }),
        );
        const engagement: Engagement | null = json.engagement
          ? {
              level: json.engagement.level ?? "unknown",
              churn_risk: json.engagement.churn_risk ?? "unknown",
            }
          : null;

        setData({ mits, patterns, learning_events, engagement });
      } catch (err) {
        console.error("[MyDataSection] Load error:", {
          error: err instanceof Error ? err.message : err,
        });
        setError(err instanceof Error ? err.message : "Nieznany blad");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Co IORS wie o Tobie
        </CardTitle>
        <CardDescription>
          Cele, wzorce, nauka i engagement — wszystko co IORS zebraI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-20 w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : data ? (
          <>
            {/* MITs */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Najwazniejsze cele (MITs)
              </p>
              {data.mits.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Brak zdefiniowanych celow
                </p>
              ) : (
                <div className="space-y-2">
                  {data.mits.map((mit, i) => (
                    <div
                      key={i}
                      className="p-3 bg-muted/50 rounded-lg flex gap-3"
                    >
                      <span className="text-lg font-bold text-muted-foreground">
                        #{mit.rank}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{mit.objective}</p>
                        <p className="text-xs text-muted-foreground">
                          {mit.reasoning}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Patterns */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Wykryte wzorce
              </p>
              {data.patterns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Brak wykrytych wzorcow
                </p>
              ) : (
                <div className="space-y-2">
                  {data.patterns.map((pattern) => (
                    <div
                      key={pattern.id}
                      className="p-3 bg-muted/50 rounded-lg space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={
                            PATTERN_TYPE_COLORS[pattern.pattern_type] || ""
                          }
                        >
                          {pattern.pattern_type}
                        </Badge>
                        <span className="text-sm">{pattern.description}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Pewnosc:
                        </span>
                        <Progress
                          value={pattern.confidence * 100}
                          className="h-1.5 flex-1"
                        />
                        <span className="text-xs text-muted-foreground">
                          {Math.round(pattern.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Learning Events */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Czego sie nauczyl (30d)
              </p>
              {data.learning_events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Brak zdarzen nauki
                </p>
              ) : (
                <div className="space-y-2">
                  {data.learning_events.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg"
                    >
                      <Badge
                        variant="secondary"
                        className={EVENT_TYPE_COLORS[event.event_type] || ""}
                      >
                        {event.event_type}
                      </Badge>
                      <span className="text-sm flex-1">
                        {event.description}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(event.created_at).toLocaleDateString(
                          "pl-PL",
                          {
                            day: "numeric",
                            month: "short",
                          },
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Engagement */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Engagement
              </p>
              {data.engagement ? (
                <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Poziom:
                    </span>
                    <Badge
                      variant="secondary"
                      className={ENGAGEMENT_COLORS[data.engagement.level] || ""}
                    >
                      {data.engagement.level}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Ryzyko churnu:
                    </span>
                    <Badge
                      variant="secondary"
                      className={
                        CHURN_RISK_COLORS[data.engagement.churn_risk] || ""
                      }
                    >
                      {data.engagement.churn_risk}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Brak danych o engagement
                </p>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
