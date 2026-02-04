"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Zap,
  Target,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/status-badge";

interface Insight {
  id: string;
  type: "optimization" | "warning" | "anomaly" | "suggestion" | "revenue";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  metric?: string;
  currentValue?: number;
  threshold?: number;
  action?: string;
}

interface InsightsData {
  insights: Insight[];
  generatedAt: string;
  totalInsights: number;
  criticalCount: number;
  warningCount: number;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  optimization: <Zap className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  anomaly: <Target className="h-4 w-4" />,
  suggestion: <Lightbulb className="h-4 w-4" />,
  revenue: <TrendingUp className="h-4 w-4" />,
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-red-500/30 bg-red-500/5",
  warning: "border-yellow-500/30 bg-yellow-500/5",
  info: "border-blue-500/30 bg-blue-500/5",
};

export default function AdminInsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/insights");
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("[AdminInsights] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Insights</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Self-optimization engine: analyzes metrics, feedback, errors &
            revenue to propose improvements
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`}
          />
          Re-analyze
        </Button>
      </div>

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-3xl font-bold">{data.totalInsights}</p>
              <p className="text-xs text-muted-foreground">Total Insights</p>
            </CardContent>
          </Card>
          <Card className={data.criticalCount > 0 ? "border-red-500/30" : ""}>
            <CardContent className="py-4 text-center">
              <p
                className={`text-3xl font-bold ${data.criticalCount > 0 ? "text-red-500" : ""}`}
              >
                {data.criticalCount}
              </p>
              <p className="text-xs text-muted-foreground">Critical</p>
            </CardContent>
          </Card>
          <Card className={data.warningCount > 0 ? "border-yellow-500/30" : ""}>
            <CardContent className="py-4 text-center">
              <p
                className={`text-3xl font-bold ${data.warningCount > 0 ? "text-yellow-500" : ""}`}
              >
                {data.warningCount}
              </p>
              <p className="text-xs text-muted-foreground">Warnings</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-muted-foreground mt-1">
                Last analyzed
              </p>
              <p className="text-sm font-medium mt-0.5">
                {new Date(data.generatedAt).toLocaleString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "numeric",
                  month: "short",
                })}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Insights List */}
      {loading && !data ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="h-5 w-64 bg-muted rounded" />
                <div className="h-4 w-96 bg-muted rounded mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data?.insights.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Lightbulb className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No insights generated. System metrics are within normal ranges.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(data?.insights || []).map((insight) => (
            <Card
              key={insight.id}
              className={`border ${SEVERITY_STYLES[insight.severity] || ""}`}
            >
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-muted-foreground">
                    {TYPE_ICONS[insight.type] || (
                      <Lightbulb className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge
                        status={
                          insight.severity === "critical"
                            ? "error"
                            : insight.severity === "warning"
                              ? "warning"
                              : "info"
                        }
                        label={insight.severity}
                      />
                      <span className="text-xs text-muted-foreground capitalize bg-muted px-2 py-0.5 rounded">
                        {insight.type}
                      </span>
                    </div>
                    <h3 className="font-medium text-sm">{insight.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {insight.description}
                    </p>
                    {insight.action && (
                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                        <span className="font-medium">
                          Recommended action:{" "}
                        </span>
                        {insight.action}
                      </div>
                    )}
                    {insight.metric && insight.currentValue !== undefined && (
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          Metric:{" "}
                          <code className="font-mono">{insight.metric}</code>
                        </span>
                        <span>
                          Current:{" "}
                          <strong>
                            {typeof insight.currentValue === "number" &&
                            insight.currentValue < 1
                              ? `${(insight.currentValue * 100).toFixed(1)}%`
                              : insight.currentValue}
                          </strong>
                        </span>
                        {insight.threshold !== undefined && (
                          <span>
                            Threshold:{" "}
                            {typeof insight.threshold === "number" &&
                            insight.threshold < 1
                              ? `${(insight.threshold * 100).toFixed(0)}%`
                              : insight.threshold}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
