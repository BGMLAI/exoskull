"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, getStatusType } from "@/components/admin/status-badge";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

type LogTab = "errors" | "api";

export default function AdminLogsPage() {
  const [tab, setTab] = useState<LogTab>("errors");
  const [errors, setErrors] = useState<any[]>([]);
  const [apiLogs, setApiLogs] = useState<any[]>([]);
  const [latency, setLatency] = useState<{
    p50: number;
    p95: number;
    p99: number;
  }>({ p50: 0, p95: 0, p99: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (severityFilter) params.set("severity", severityFilter);
      if (filter) params.set("source", filter);

      const res = await fetch(`/api/admin/logs/errors?${params}`);
      if (res.ok) {
        const data = await res.json();
        setErrors(data.errors || []);
      }
    } catch (err) {
      console.error("[AdminLogs] Error fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [severityFilter, filter]);

  const fetchApiLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter) params.set("path", filter);

      const res = await fetch(`/api/admin/logs/api?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApiLogs(data.logs || []);
        setLatency(data.latency || { p50: 0, p95: 0, p99: 0 });
      }
    } catch (err) {
      console.error("[AdminLogs] API log fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (tab === "errors") fetchErrors();
    else fetchApiLogs();
  }, [tab, fetchErrors, fetchApiLogs]);

  // Auto-refresh errors
  useEffect(() => {
    if (tab !== "errors") return;
    const interval = setInterval(fetchErrors, 30000);
    return () => clearInterval(interval);
  }, [tab, fetchErrors]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Logs</h1>

      {/* Tabs */}
      <div className="flex gap-1">
        {(["errors", "api"] as LogTab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setFilter("");
            }}
            className={`px-4 py-2 text-sm rounded-md transition-colors capitalize ${
              tab === t
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80"
            }`}
          >
            {t === "api" ? "API Requests" : "Error Log"}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={
              tab === "errors" ? "Filter by source..." : "Filter by path..."
            }
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        {tab === "errors" && (
          <div className="flex gap-1">
            {["", "error", "fatal", "warn", "info"].map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  severityFilter === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                {s || "All"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* API Latency Stats */}
      {tab === "api" && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold">{latency.p50}ms</p>
              <p className="text-xs text-muted-foreground">p50 Latency</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold">{latency.p95}ms</p>
              <p className="text-xs text-muted-foreground">p95 Latency</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p
                className={`text-2xl font-bold ${latency.p99 > 5000 ? "text-red-500" : ""}`}
              >
                {latency.p99}ms
              </p>
              <p className="text-xs text-muted-foreground">p99 Latency</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error Log */}
      {tab === "errors" && (
        <div className="space-y-1">
          {loading && errors.length === 0 ? (
            <Card className="animate-pulse">
              <CardContent className="py-6">
                <div className="h-4 w-48 bg-muted rounded" />
              </CardContent>
            </Card>
          ) : errors.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No errors found.
            </p>
          ) : (
            errors.map((err) => (
              <div
                key={err.id}
                className="border rounded-md p-3 hover:bg-muted/30 cursor-pointer"
                onClick={() =>
                  setExpandedId(expandedId === err.id ? null : err.id)
                }
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="mt-0.5">
                      {expandedId === err.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <StatusBadge
                      status={getStatusType(err.severity)}
                      label={err.severity}
                    />
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">
                        {err.source}
                      </p>
                      <p className="text-sm truncate">{err.message}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {new Date(err.created_at).toLocaleString("en-GB", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {expandedId === err.id && (
                  <div className="mt-3 ml-6 space-y-2">
                    <p className="text-sm">{err.message}</p>
                    {err.stack_trace && (
                      <pre className="text-xs bg-zinc-950 text-zinc-300 p-3 rounded overflow-x-auto max-h-48">
                        {err.stack_trace}
                      </pre>
                    )}
                    {err.context && Object.keys(err.context).length > 0 && (
                      <pre className="text-xs bg-muted p-3 rounded">
                        {JSON.stringify(err.context, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* API Request Log */}
      {tab === "api" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-left">
                <th className="pb-2 font-medium">Method</th>
                <th className="pb-2 font-medium">Path</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Duration</th>
                <th className="pb-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {loading && apiLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center animate-pulse">
                    <div className="h-4 w-32 bg-muted rounded mx-auto" />
                  </td>
                </tr>
              ) : apiLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-4 text-center text-muted-foreground"
                  >
                    No API logs recorded. Integrate the API logging middleware.
                  </td>
                </tr>
              ) : (
                apiLogs.map((log) => (
                  <tr key={log.id} className="border-b border-border/50">
                    <td className="py-2">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                        {log.method}
                      </span>
                    </td>
                    <td className="py-2 font-mono text-xs truncate max-w-md">
                      {log.path}
                    </td>
                    <td className="py-2">
                      <span
                        className={`text-xs font-medium ${
                          log.status_code >= 500
                            ? "text-red-500"
                            : log.status_code >= 400
                              ? "text-yellow-500"
                              : "text-green-500"
                        }`}
                      >
                        {log.status_code}
                      </span>
                    </td>
                    <td className="py-2 text-xs">
                      <span
                        className={
                          log.duration_ms > 5000
                            ? "text-red-500"
                            : log.duration_ms > 1000
                              ? "text-yellow-500"
                              : ""
                        }
                      >
                        {log.duration_ms}ms
                      </span>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
