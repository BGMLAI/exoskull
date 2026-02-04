"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  MessageSquare,
  AlertTriangle,
  Clock,
  DollarSign,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge, getStatusType } from "@/components/admin/status-badge";

interface OverviewData {
  overview: {
    total_users: number;
    active_users_24h: number;
    total_conversations_today: number;
    errors_24h: number;
    cron_failures_24h: number;
    ai_cost_today: number;
  };
  snapshot: any;
  recentErrors: any[];
  recentCrons: any[];
  cronHealth: any[];
  businessMetrics: any;
}

export default function AdminCommandCenter() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview");
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error("[AdminOverview] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Command Center</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
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

  const o = data?.overview || ({} as any);
  const bm = data?.businessMetrics;
  const cronFails = o.cron_failures_24h || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Command Center</h1>
        <span className="text-xs text-muted-foreground">Auto-refresh: 30s</span>
      </div>

      {/* Heartbeat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Users"
          value={o.total_users || 0}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          title="Active (24h)"
          value={o.active_users_24h || 0}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          title="Conversations (24h)"
          value={o.total_conversations_today || 0}
          icon={<MessageSquare className="h-4 w-4" />}
        />
        <StatCard
          title="Errors (24h)"
          value={o.errors_24h || 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          negative={(o.errors_24h || 0) > 0}
        />
        <StatCard
          title="Cron Failures"
          value={cronFails}
          icon={<Clock className="h-4 w-4" />}
          negative={cronFails > 0}
        />
        <StatCard
          title="AI Cost (24h)"
          value={`$${(o.ai_cost_today || 0).toFixed(4)}`}
          icon={<DollarSign className="h-4 w-4" />}
        />
      </div>

      {/* Business Quick Stats */}
      {bm && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="MRR"
            value={`${(bm.mrr_pln || 0).toLocaleString("pl-PL")} PLN`}
          />
          <StatCard
            title="Paying Users"
            value={bm.paying_users || 0}
            description={`${bm.trial_users || 0} in trial`}
          />
          <StatCard
            title="Churn (30d)"
            value={`${((bm.churn_rate_30d || 0) * 100).toFixed(1)}%`}
            negative={(bm.churn_rate_30d || 0) > 0.05}
          />
          <StatCard
            title="ARPU"
            value={`${(bm.arpu_pln || 0).toLocaleString("pl-PL")} PLN`}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Cron Runs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Cron Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-auto">
              {(data?.recentCrons || []).slice(0, 15).map((run: any) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusBadge
                      status={getStatusType(run.status)}
                      label={run.status}
                    />
                    <span className="font-mono text-xs truncate">
                      {run.cron_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    {run.duration_ms != null && (
                      <span>{run.duration_ms}ms</span>
                    )}
                    <span>
                      {new Date(run.started_at).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))}
              {(data?.recentCrons || []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No cron runs recorded yet. Integrate cron-wrapper to start
                  logging.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Errors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Errors (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-auto">
              {(data?.recentErrors || []).map((err: any) => (
                <div
                  key={err.id}
                  className="flex items-start gap-2 text-sm py-1.5 border-b border-border/50 last:border-0"
                >
                  <StatusBadge
                    status={getStatusType(err.severity)}
                    label={err.severity}
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">
                      {err.source}
                    </p>
                    <p className="text-xs truncate">{err.message}</p>
                  </div>
                </div>
              ))}
              {(data?.recentErrors || []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No errors in the last 24 hours.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cron Health Summary */}
      {(data?.cronHealth || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cron Health (48h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="pb-2 font-medium">Job</th>
                    <th className="pb-2 font-medium">Runs</th>
                    <th className="pb-2 font-medium">Success</th>
                    <th className="pb-2 font-medium">Failed</th>
                    <th className="pb-2 font-medium">Avg Duration</th>
                    <th className="pb-2 font-medium">Last Run</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.cronHealth || []).map((h: any) => (
                    <tr key={h.cron_name} className="border-b border-border/50">
                      <td className="py-2 font-mono text-xs">{h.cron_name}</td>
                      <td className="py-2">{h.total_runs}</td>
                      <td className="py-2 text-green-500">
                        {h.successful_runs}
                      </td>
                      <td
                        className={`py-2 ${h.failed_runs > 0 ? "text-red-500 font-medium" : ""}`}
                      >
                        {h.failed_runs}
                      </td>
                      <td className="py-2">
                        {h.avg_duration_ms
                          ? `${Math.round(h.avg_duration_ms)}ms`
                          : "-"}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {h.last_run_at
                          ? new Date(h.last_run_at).toLocaleString("en-GB", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </td>
                      <td className="py-2">
                        <StatusBadge
                          status={getStatusType(h.last_status || "unknown")}
                          label={h.last_status || "unknown"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
