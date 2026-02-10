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
import { Skeleton } from "@/components/ui/skeleton";
import { Database } from "lucide-react";

interface DataTypeStatus {
  data_type: string;
  last_sync: string | null;
  record_count: number;
}

interface ETLStatus {
  layer: string;
  last_run: string | null;
}

interface PipelineData {
  data_types: DataTypeStatus[];
  etl: ETLStatus[];
}

const DATA_TYPE_LABELS: Record<string, string> = {
  conversations: "Rozmowy",
  messages: "Wiadomosci",
  voice_calls: "Polaczenia glosowe",
  sms_logs: "SMS",
  device_data: "Dane urzadzen",
};

function freshnessBadge(lastSync: string | null): {
  label: string;
  className: string;
} {
  if (!lastSync)
    return {
      label: "Brak danych",
      className:
        "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500",
    };
  const diffHours =
    (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
  if (diffHours < 1)
    return {
      label: "Swieze",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    };
  if (diffHours < 24)
    return {
      label: "Nieaktualne",
      className:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    };
  return {
    label: "Stare",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DataPipelineSection() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/data-pipeline");
        if (!res.ok) throw new Error("Nie udalo sie pobrac statusu pipeline");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("[DataPipelineSection] Load error:", {
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
          <Database className="h-5 w-5" />
          Pipeline danych
        </CardTitle>
        <CardDescription>
          Status synchronizacji i swiezosc danych
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : data ? (
          <>
            {/* Data Types Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">
                      Typ danych
                    </th>
                    <th className="text-left py-2 pr-4 font-medium">
                      Ostatni sync
                    </th>
                    <th className="text-right py-2 pr-4 font-medium">
                      Rekordy
                    </th>
                    <th className="text-center py-2 font-medium">Swiezosc</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data_types.map((dt) => {
                    const freshness = freshnessBadge(dt.last_sync);
                    return (
                      <tr
                        key={dt.data_type}
                        className="border-b border-muted/50"
                      >
                        <td className="py-2 pr-4">
                          {DATA_TYPE_LABELS[dt.data_type] || dt.data_type}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {formatDate(dt.last_sync)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {dt.record_count.toLocaleString("pl-PL")}
                        </td>
                        <td className="py-2 text-center">
                          <Badge
                            variant="secondary"
                            className={freshness.className}
                          >
                            {freshness.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ETL Status */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Warstwy ETL
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {data.etl.map((layer) => (
                  <div key={layer.layer} className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground capitalize">
                      {layer.layer}
                    </p>
                    <p className="text-sm font-medium">
                      {formatDate(layer.last_run)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
