"use client";

import { useEffect, useState, useCallback } from "react";
import { Database, ArrowRight, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, getStatusType } from "@/components/admin/status-badge";

interface PipelineData {
  stages: {
    bronze: any;
    silver: any;
    gold: any;
  };
  goldSyncLog: any[];
  rigSyncLog: any[];
  goldViewCounts: Record<string, number>;
}

export default function AdminDataPipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pipeline/status");
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("[AdminPipeline] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Data Pipeline</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-8">
                <div className="h-6 w-24 bg-muted rounded mx-auto" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const renderStage = (
    name: string,
    label: string,
    schedule: string,
    stage: any,
  ) => (
    <Card>
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-base">{label}</CardTitle>
        <p className="text-xs text-muted-foreground">{schedule}</p>
      </CardHeader>
      <CardContent className="text-center">
        {stage ? (
          <>
            <StatusBadge
              status={getStatusType(stage.status)}
              label={stage.status}
            />
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <p>
                Duration: {stage.duration_ms ? `${stage.duration_ms}ms` : "—"}
              </p>
              <p>
                Last run:{" "}
                {stage.started_at
                  ? new Date(stage.started_at).toLocaleString("en-GB", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Never"}
              </p>
              {stage.error_message && (
                <p className="text-red-500 text-xs mt-1">
                  {stage.error_message}
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No runs recorded</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Data Pipeline</h1>

      {/* Pipeline Stages */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
        {renderStage(
          "bronze",
          "Bronze (Raw)",
          "Daily 01:00 UTC",
          data?.stages?.bronze,
        )}
        <div className="hidden md:flex justify-center">
          <ArrowRight className="h-6 w-6 text-muted-foreground" />
        </div>
        {renderStage(
          "silver",
          "Silver (Clean)",
          "Daily 02:00 UTC",
          data?.stages?.silver,
        )}
        <div className="hidden md:flex justify-center">
          <ArrowRight className="h-6 w-6 text-muted-foreground" />
        </div>
        {renderStage(
          "gold",
          "Gold (Aggregated)",
          "Daily 04:00 UTC",
          data?.stages?.gold,
        )}
      </div>

      {/* Gold View Row Counts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gold Materialized Views</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(data?.goldViewCounts || {}).map(([view, count]) => (
              <div
                key={view}
                className="text-center p-3 bg-muted/30 rounded-lg"
              >
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {view.replace("exo_gold_", "")}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gold Sync Log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gold ETL Sync Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-auto">
              {(data?.goldSyncLog || []).map((log: any) => (
                <div
                  key={log.id || log.started_at}
                  className="flex items-center justify-between text-sm py-1.5 border-b border-border/50"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={getStatusType(log.status)}
                      label={log.status}
                    />
                    <span className="text-xs">
                      {log.rows_count != null && `${log.rows_count} rows`}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {log.duration_ms && `${log.duration_ms}ms • `}
                    {log.started_at &&
                      new Date(log.started_at).toLocaleString("en-GB", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                  </div>
                </div>
              ))}
              {(data?.goldSyncLog || []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No gold sync records.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Rig Sync Log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rig Integration Syncs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-auto">
              {(data?.rigSyncLog || []).map((log: any) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between text-sm py-1.5 border-b border-border/50"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={getStatusType(log.status)}
                      label={log.status}
                    />
                    <span className="font-mono text-xs">
                      {log.connection?.rig_slug || "unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {log.records_synced != null &&
                        `${log.records_synced} records`}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {log.started_at &&
                      new Date(log.started_at).toLocaleString("en-GB", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                  </span>
                </div>
              ))}
              {(data?.rigSyncLog || []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No rig syncs recorded.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
