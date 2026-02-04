"use client";

import { useEffect, useState, useCallback } from "react";
import { Shield, CheckCircle, XCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge, getStatusType } from "@/components/admin/status-badge";

interface AutonomyData {
  summary: {
    totalInterventions: number;
    approved: number;
    blocked: number;
    approvalRate: number;
    avgBenefitScore: number;
    avgEffectiveness: number;
  };
  feedbackBreakdown: Record<string, number>;
  recentInterventions: any[];
  effectiveness: any[];
  unresolvedConflicts: any[];
  recentCycles: any[];
}

export default function AdminAutonomyPage() {
  const [data, setData] = useState<AutonomyData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/autonomy/overview");
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("[AdminAutonomy] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Autonomy & Guardian</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 w-20 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-muted rounded" />
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
      <h1 className="text-2xl font-bold">Autonomy & Guardian</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Interventions"
          value={s?.totalInterventions || 0}
          icon={<Shield className="h-4 w-4" />}
        />
        <StatCard
          title="Approval Rate"
          value={`${((s?.approvalRate || 0) * 100).toFixed(1)}%`}
          description={`${s?.approved || 0} approved / ${s?.blocked || 0} blocked`}
          icon={<CheckCircle className="h-4 w-4" />}
        />
        <StatCard
          title="Avg Benefit Score"
          value={s?.avgBenefitScore?.toFixed(2) || "0"}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          title="Avg Effectiveness"
          value={s?.avgEffectiveness?.toFixed(2) || "0"}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Feedback */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">User Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(data?.feedbackBreakdown || {}).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(data?.feedbackBreakdown || {}).map(
                  ([feedback, count]) => {
                    const total = Object.values(
                      data?.feedbackBreakdown || {},
                    ).reduce((s, v) => s + v, 0);
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={feedback}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="capitalize">{feedback}</span>
                          <span className="text-muted-foreground">
                            {count} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No user feedback collected yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Unresolved Value Conflicts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Unresolved Value Conflicts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.unresolvedConflicts || []).length > 0 ? (
              <div className="space-y-2">
                {(data?.unresolvedConflicts || []).map((c: any) => (
                  <div
                    key={c.id}
                    className="text-sm border-b border-border/50 pb-2"
                  >
                    <p>{c.description || c.conflict_type || "Conflict"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(c.created_at).toLocaleString("en-GB")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No unresolved conflicts.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Interventions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Interventions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Priority</th>
                  <th className="pb-2 font-medium">Guardian</th>
                  <th className="pb-2 font-medium">Benefit</th>
                  <th className="pb-2 font-medium">Feedback</th>
                  <th className="pb-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recentInterventions || []).map((i: any) => (
                  <tr key={i.id} className="border-b border-border/50">
                    <td className="py-2 capitalize text-xs">
                      {i.intervention_type}
                    </td>
                    <td className="py-2">
                      <StatusBadge
                        status={
                          i.priority === "critical"
                            ? "error"
                            : i.priority === "high"
                              ? "warning"
                              : "neutral"
                        }
                        label={i.priority || "normal"}
                      />
                    </td>
                    <td className="py-2">
                      <StatusBadge
                        status={getStatusType(i.guardian_verdict || "unknown")}
                        label={i.guardian_verdict || "pending"}
                      />
                    </td>
                    <td className="py-2 text-xs">
                      {i.benefit_score?.toFixed(2) || "—"}
                    </td>
                    <td className="py-2 text-xs capitalize">
                      {i.user_feedback || "—"}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {new Date(i.created_at).toLocaleString("en-GB", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
                {(data?.recentInterventions || []).length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-4 text-center text-muted-foreground"
                    >
                      No interventions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* MAPE-K Cycles */}
      {(data?.recentCycles || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent MAPE-K Cycles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data?.recentCycles || []).map((c: any) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between text-sm py-1.5 border-b border-border/50"
                >
                  <span className="capitalize text-xs">
                    {c.phase || "cycle"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString("en-GB")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
