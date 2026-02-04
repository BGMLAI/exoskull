"use client";

import { useEffect, useState, useCallback } from "react";
import { Play, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, getStatusType } from "@/components/admin/status-badge";

interface CronJob {
  name: string;
  schedule: string;
  description: string;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  avg_duration_ms: number | null;
  last_run_at: string | null;
  last_status: string;
  recent_runs: any[];
}

export default function AdminCronPage() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [triggering, setTriggering] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cron");
      if (res.ok) {
        const data = await res.json();
        setCrons(data.crons || []);
      }
    } catch (err) {
      console.error("[AdminCron] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const triggerCron = async (cronName: string) => {
    setTriggering(cronName);
    try {
      const res = await fetch("/api/admin/cron/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronName }),
      });
      const result = await res.json();
      console.log("[AdminCron] Trigger result:", result);
      // Refresh after trigger
      setTimeout(fetchData, 2000);
    } catch (err) {
      console.error("[AdminCron] Trigger failed:", err);
    } finally {
      setTriggering(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Cron Jobs</h1>
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="h-5 w-48 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cron Jobs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {crons.length} jobs configured. Auto-refresh: 60s.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground text-left">
              <th className="pb-3 font-medium w-8" />
              <th className="pb-3 font-medium">Job Name</th>
              <th className="pb-3 font-medium">Schedule</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Runs (48h)</th>
              <th className="pb-3 font-medium">Avg Duration</th>
              <th className="pb-3 font-medium">Last Run</th>
              <th className="pb-3 font-medium w-24">Action</th>
            </tr>
          </thead>
          <tbody>
            {crons.map((cron) => {
              const isExpanded = expanded.has(cron.name);
              const successRate =
                cron.total_runs > 0
                  ? (cron.successful_runs / cron.total_runs) * 100
                  : 0;

              return (
                <>
                  <tr
                    key={cron.name}
                    className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                    onClick={() => toggleExpand(cron.name)}
                  >
                    <td className="py-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </td>
                    <td className="py-3">
                      <div>
                        <span className="font-mono text-xs font-medium">
                          {cron.name}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {cron.description}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 font-mono text-xs">{cron.schedule}</td>
                    <td className="py-3">
                      <StatusBadge
                        status={getStatusType(cron.last_status)}
                        label={cron.last_status}
                      />
                    </td>
                    <td className="py-3">
                      <span className="text-green-500">
                        {cron.successful_runs}
                      </span>
                      {cron.failed_runs > 0 && (
                        <span className="text-red-500 ml-1">
                          / {cron.failed_runs} failed
                        </span>
                      )}
                      {cron.total_runs > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({successRate.toFixed(0)}%)
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-xs">
                      {cron.avg_duration_ms
                        ? `${Math.round(cron.avg_duration_ms)}ms`
                        : "-"}
                    </td>
                    <td className="py-3 text-xs text-muted-foreground">
                      {cron.last_run_at
                        ? new Date(cron.last_run_at).toLocaleString("en-GB", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Never"}
                    </td>
                    <td className="py-3" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => triggerCron(cron.name)}
                        disabled={triggering === cron.name}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        {triggering === cron.name ? "Running..." : "Run Now"}
                      </Button>
                    </td>
                  </tr>
                  {isExpanded && cron.recent_runs.length > 0 && (
                    <tr key={`${cron.name}-detail`}>
                      <td colSpan={8} className="bg-muted/20 px-8 py-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Recent Executions
                        </p>
                        <div className="space-y-1">
                          {cron.recent_runs.map((run: any) => (
                            <div
                              key={run.id}
                              className="flex items-center justify-between text-xs py-1"
                            >
                              <div className="flex items-center gap-2">
                                <StatusBadge
                                  status={getStatusType(run.status)}
                                  label={run.status}
                                />
                                <span className="text-muted-foreground">
                                  {new Date(run.started_at).toLocaleString(
                                    "en-GB",
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                {run.duration_ms != null && (
                                  <span>{run.duration_ms}ms</span>
                                )}
                                {run.error_message && (
                                  <span className="text-red-500 truncate max-w-64">
                                    {run.error_message}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
