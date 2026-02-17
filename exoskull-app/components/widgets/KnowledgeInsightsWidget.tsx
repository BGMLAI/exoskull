"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Brain,
  AlertTriangle,
  TrendingDown,
  Link2,
  Search,
  Lightbulb,
  PartyPopper,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DataFreshness } from "./DataFreshness";

// ============================================================================
// TYPES
// ============================================================================

interface KnowledgeInsightEntry {
  id: string;
  analysis_type: string;
  insights: Array<{
    type: string;
    title: string;
    description: string;
    confidence: number;
    domains: string[];
    action: {
      type: string;
      priority: string;
    };
  }>;
  actions_proposed: number;
  actions_executed: number;
  cost_cents: number;
  created_at: string;
}

// ============================================================================
// CONFIG
// ============================================================================

const INSIGHT_CONFIG: Record<
  string,
  { icon: typeof Brain; color: string; bg: string }
> = {
  pattern: { icon: Lightbulb, color: "text-blue-500", bg: "bg-blue-500/10" },
  gap: { icon: Search, color: "text-yellow-500", bg: "bg-yellow-500/10" },
  drift: {
    icon: TrendingDown,
    color: "text-red-500",
    bg: "bg-red-500/10",
  },
  correlation: {
    icon: Link2,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  opportunity: {
    icon: Lightbulb,
    color: "text-green-500",
    bg: "bg-green-500/10",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
  celebration: {
    icon: PartyPopper,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
};

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  high: { label: "Pilne", className: "bg-red-500/20 text-red-600" },
  medium: { label: "Srednie", className: "bg-yellow-500/20 text-yellow-600" },
  low: { label: "Niskie", className: "bg-gray-500/20 text-gray-500" },
};

// ============================================================================
// HELPERS
// ============================================================================

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min temu`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h temu`;
  return new Date(dateStr).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================================
// COMPONENT
// ============================================================================

export function KnowledgeInsightsWidget() {
  const [analyses, setAnalyses] = useState<KnowledgeInsightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/canvas/data/knowledge-insights");
      if (res.ok) {
        const data = await res.json();
        setAnalyses(data.analyses || []);
        setLastUpdated(data.lastUpdated || null);
      }
    } catch (err) {
      console.error("[KnowledgeInsights] Fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Flatten all insights from recent analyses
  const allInsights = analyses.flatMap((a) =>
    a.insights.map((insight) => ({
      ...insight,
      analysisId: a.id,
      analysisType: a.analysis_type,
      createdAt: a.created_at,
    })),
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-1/3" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-2">
                <div className="h-6 w-6 bg-muted rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-2 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            Analiza wiedzy
          </span>
          <div className="flex items-center gap-2">
            <DataFreshness timestamp={lastUpdated} />
            <button
              onClick={() => fetchData(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Odswiez"
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
              />
            </button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {allInsights.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Brain className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Brak insightow.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              System codziennie analizuje Twoje dane i wykrywa wzorce.
            </p>
          </div>
        ) : (
          allInsights.map((insight, idx) => {
            const config = INSIGHT_CONFIG[insight.type] || {
              icon: Lightbulb,
              color: "text-muted-foreground",
              bg: "bg-muted",
            };
            const Icon = config.icon;
            const badge = PRIORITY_BADGE[insight.action?.priority ?? "low"];

            return (
              <div
                key={`${insight.analysisId}-${idx}`}
                className="flex items-start gap-2.5 py-2 border-b border-border/50 last:border-0"
              >
                <div
                  className={cn(
                    "shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5",
                    config.bg,
                  )}
                >
                  <Icon className={cn("h-4 w-4", config.color)} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-tight">
                    {insight.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {insight.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">
                      {relativeTime(insight.createdAt)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {(insight.confidence * 100).toFixed(0)}%
                    </span>
                    {badge && insight.action?.priority !== "low" && (
                      <span
                        className={cn(
                          "text-[10px] px-1 py-0.5 rounded",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    )}
                    {insight.domains.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/60">
                        {insight.domains.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
