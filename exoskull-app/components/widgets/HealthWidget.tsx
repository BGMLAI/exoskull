"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Heart,
  Activity,
  Moon,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import Link from "next/link";
import { HealthSummary } from "@/lib/dashboard/types";
import { AreaChartWrapper } from "@/components/charts/AreaChartWrapper";

interface HealthWidgetProps {
  summary: HealthSummary;
}

export function HealthWidget({ summary }: HealthWidgetProps) {
  const sleepHours = summary.sleepMinutes
    ? Math.floor(summary.sleepMinutes / 60)
    : null;
  const sleepMinutes = summary.sleepMinutes ? summary.sleepMinutes % 60 : null;
  const hasSeries = summary.sleepSeries.some((point) => point.value > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            Zdrowie
          </span>
          <Link
            href="/dashboard/mods"
            className="text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            Mody zdrowia
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Activity className="h-4 w-4" />
              Kroki
            </div>
            <p className="text-base font-semibold">
              {summary.steps ? summary.steps.toLocaleString() : "--"}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Moon className="h-4 w-4" />
              Sen
            </div>
            <p className="text-base font-semibold">
              {summary.sleepMinutes ? `${sleepHours}h ${sleepMinutes}m` : "--"}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Heart className="h-4 w-4" />
              HRV
            </div>
            <p className="text-base font-semibold">
              {summary.hrv ? `${Math.round(summary.hrv)} ms` : "--"}
            </p>
          </div>
        </div>

        {hasSeries && (
          <AreaChartWrapper
            data={summary.sleepSeries}
            color="#a855f7"
            height={90}
            showXAxis
          />
        )}

        {summary.predictions && summary.predictions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Prognozy
            </p>
            {summary.predictions.map((pred, i) => {
              const severityColors = {
                low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                medium:
                  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
                high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
                critical:
                  "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
              };
              const SeverityIcon =
                pred.severity === "critical" || pred.severity === "high"
                  ? AlertTriangle
                  : pred.severity === "medium"
                    ? TrendingDown
                    : TrendingUp;

              return (
                <div
                  key={`${pred.metric}-${i}`}
                  className={`flex items-start gap-2 p-2 rounded-lg text-xs ${severityColors[pred.severity]}`}
                >
                  <SeverityIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium leading-tight">{pred.message}</p>
                    <p className="opacity-70 mt-0.5">
                      {Math.round(pred.probability * 100)}% prawdop. ·{" "}
                      {Math.round(pred.confidence * 100)}% pewnosc
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
