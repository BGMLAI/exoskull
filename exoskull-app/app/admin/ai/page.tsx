"use client";

import { useEffect, useState, useCallback } from "react";
import { Brain, DollarSign, Zap, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";

interface AIData {
  period: string;
  summary: {
    totalRequests: number;
    totalCost: number;
    errorRate: number;
  };
  byModel: {
    model: string;
    tier: number;
    requests: number;
    totalCost: number;
    totalTokens: number;
    errors: number;
  }[];
  dailyCosts: { date: string; total_cost: number; total_requests: number }[];
}

const TIER_LABELS: Record<number, string> = {
  1: "Flash (T1)",
  2: "Haiku (T2)",
  3: "Kimi (T3)",
  4: "Opus (T4)",
};

const TIER_COLORS: Record<number, string> = {
  1: "bg-blue-500",
  2: "bg-green-500",
  3: "bg-yellow-500",
  4: "bg-purple-500",
};

export default function AdminAIPage() {
  const [data, setData] = useState<AIData | null>(null);
  const [period, setPeriod] = useState("7d");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ai/usage?period=${period}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("[AdminAI] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">AI Router</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 w-20 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-24 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">AI Router</h1>
        <div className="flex gap-1">
          {["7d", "30d", "90d"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Requests"
          value={(s?.totalRequests || 0).toLocaleString()}
          icon={<Zap className="h-4 w-4" />}
        />
        <StatCard
          title="Total Cost"
          value={`$${(s?.totalCost || 0).toFixed(4)}`}
          description={
            s?.totalRequests
              ? `$${(s.totalCost / s.totalRequests).toFixed(6)} per request`
              : undefined
          }
          icon={<DollarSign className="h-4 w-4" />}
        />
        <StatCard
          title="Error Rate"
          value={`${((s?.errorRate || 0) * 100).toFixed(2)}%`}
          icon={<AlertTriangle className="h-4 w-4" />}
          negative={(s?.errorRate || 0) > 0.05}
        />
      </div>

      {/* Per-Model Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage by Model</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="pb-2 font-medium">Model</th>
                  <th className="pb-2 font-medium">Tier</th>
                  <th className="pb-2 font-medium">Requests</th>
                  <th className="pb-2 font-medium">Cost</th>
                  <th className="pb-2 font-medium">Tokens</th>
                  <th className="pb-2 font-medium">Errors</th>
                  <th className="pb-2 font-medium">Error Rate</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byModel || []).map((m) => (
                  <tr key={m.model} className="border-b border-border/50">
                    <td className="py-2 font-mono text-xs">{m.model}</td>
                    <td className="py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs text-white ${TIER_COLORS[m.tier] || "bg-zinc-500"}`}
                      >
                        {TIER_LABELS[m.tier] || `T${m.tier}`}
                      </span>
                    </td>
                    <td className="py-2">{m.requests.toLocaleString()}</td>
                    <td className="py-2">${m.totalCost.toFixed(4)}</td>
                    <td className="py-2">{m.totalTokens.toLocaleString()}</td>
                    <td
                      className={`py-2 ${m.errors > 0 ? "text-red-500" : ""}`}
                    >
                      {m.errors}
                    </td>
                    <td className="py-2">
                      {m.requests > 0
                        ? `${((m.errors / m.requests) * 100).toFixed(1)}%`
                        : "0%"}
                    </td>
                  </tr>
                ))}
                {(data?.byModel || []).length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-4 text-center text-muted-foreground"
                    >
                      No AI usage data for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Tier Distribution */}
      {(data?.byModel || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tier Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(data?.byModel || []).map((m) => {
                const pct =
                  s && s.totalRequests > 0
                    ? (m.requests / s.totalRequests) * 100
                    : 0;
                return (
                  <div key={m.model}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-mono text-xs">{m.model}</span>
                      <span className="text-muted-foreground text-xs">
                        {pct.toFixed(1)}% ({m.requests})
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${TIER_COLORS[m.tier] || "bg-zinc-500"}`}
                        style={{ width: `${Math.max(pct, 0.5)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Cost Trend */}
      {(data?.dailyCosts || []).length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Cost Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-40">
              {(data?.dailyCosts || []).map((day) => {
                const maxCost = Math.max(
                  ...(data?.dailyCosts || []).map((d) => d.total_cost || 0),
                  0.001,
                );
                const height = ((day.total_cost || 0) / maxCost) * 100;
                return (
                  <div
                    key={day.date}
                    className="flex-1 bg-primary/20 hover:bg-primary/40 rounded-t transition-colors relative group"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  >
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-popover border rounded px-2 py-1 text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                      {day.date}: ${(day.total_cost || 0).toFixed(4)}
                      <br />
                      {day.total_requests} requests
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
