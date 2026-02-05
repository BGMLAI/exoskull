"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react";
import type { AutonomyData } from "./useAutonomyData";

interface Props {
  data: AutonomyData;
}

const TRIGGER_CONFIG: Record<string, { label: string; color: string }> = {
  cron: {
    label: "CRON",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  event: {
    label: "Event",
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  },
  manual: {
    label: "Reczny",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
};

const CYCLE_STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode }
> = {
  completed: {
    label: "Ukonczony",
    icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  },
  failed: {
    label: "Blad",
    icon: <XCircle className="w-4 h-4 text-red-500" />,
  },
  running: {
    label: "W toku",
    icon: <Clock className="w-4 h-4 text-blue-500 animate-spin" />,
  },
};

export function ActivityLogTab({ data }: Props) {
  const { cycles, runCycle } = data;

  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Log aktywnosci</h2>
          <p className="text-sm text-muted-foreground">
            Cykle MAPE-K i operacje systemu
          </p>
        </div>
        <Button size="sm" onClick={() => runCycle()}>
          <Play className="w-4 h-4 mr-2" />
          Uruchom cykl
        </Button>
      </div>

      {/* Cycles */}
      {cycles.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Zap className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Brak cykli MAPE-K</h3>
            <p className="text-muted-foreground">
              Cykle uruchamiaja sie automatycznie co 6h lub mozesz uruchomic
              recznie
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {cycles.map((cycle) => {
            const trigger =
              TRIGGER_CONFIG[cycle.trigger_type] || TRIGGER_CONFIG.cron;
            const status =
              CYCLE_STATUS_CONFIG[cycle.status] ||
              CYCLE_STATUS_CONFIG.completed;

            return (
              <Card key={cycle.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {status.icon}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {status.label}
                          </span>
                          <Badge
                            variant="outline"
                            className={`border-0 text-xs ${trigger.color}`}
                          >
                            {trigger.label}
                          </Badge>
                          {cycle.trigger_event && (
                            <span className="text-xs text-muted-foreground">
                              ({cycle.trigger_event})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span>
                            {new Date(cycle.started_at).toLocaleString(
                              "pl-PL",
                              {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                          <span>Czas: {formatDuration(cycle.duration_ms)}</span>
                        </div>
                        {cycle.error && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
                            <AlertCircle className="w-3 h-3" />
                            {cycle.error}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-4 text-center shrink-0">
                      <div>
                        <p className="text-lg font-bold">
                          {cycle.interventions_proposed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Zaproponowane
                        </p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">
                          {cycle.interventions_executed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Wykonane
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
