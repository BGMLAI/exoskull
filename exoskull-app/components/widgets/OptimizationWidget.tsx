"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Brain,
  CheckCircle,
  XCircle,
  Shield,
  Star,
  Zap,
  Clock,
} from "lucide-react";
import type { OptimizationStats } from "@/lib/dashboard/types";
import { DataFreshness } from "./DataFreshness";

interface OptimizationWidgetProps {
  stats: OptimizationStats;
  lastUpdated?: string | null;
}

export function OptimizationWidget({
  stats,
  lastUpdated,
}: OptimizationWidgetProps) {
  const {
    learningProgress,
    interventionSuccess,
    userSatisfaction,
    weekOverWeek,
    lastCycle,
  } = stats;

  const total = interventionSuccess.total;
  const successPct = interventionSuccess.successRate;
  const failPct =
    total > 0 ? Math.round((interventionSuccess.failed / total) * 100) : 0;
  const blockedPct =
    total > 0
      ? Math.round((interventionSuccess.guardianBlocked / total) * 100)
      : 0;

  return (
    <Card className="h-full overflow-auto">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Optymalizacja IORS
          </span>
          <DataFreshness timestamp={lastUpdated} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Learning Progress */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Nauka (ostatnie 7 dni)
          </p>
          <div className="grid grid-cols-3 gap-2">
            <StatBadge
              icon={<Brain className="h-3 w-3" />}
              value={learningProgress.highlightsExtracted}
              label="Wzorce"
            />
            <StatBadge
              icon={<Zap className="h-3 w-3" />}
              value={learningProgress.patternsDetected}
              label="Patterny"
            />
            <StatBadge
              icon={<Star className="h-3 w-3" />}
              value={learningProgress.skillsCreated}
              label="Skille"
            />
          </div>
        </div>

        {/* Intervention Success Rate — mini bar */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Skutecznosc interwencji ({total} lacznie)
          </p>
          {total > 0 ? (
            <>
              <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                {successPct > 0 && (
                  <div
                    className="bg-green-500"
                    style={{ width: `${successPct}%` }}
                  />
                )}
                {blockedPct > 0 && (
                  <div
                    className="bg-amber-500"
                    style={{ width: `${blockedPct}%` }}
                  />
                )}
                {failPct > 0 && (
                  <div
                    className="bg-red-500"
                    style={{ width: `${failPct}%` }}
                  />
                )}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  {successPct}%
                </span>
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3 text-amber-500" />
                  {blockedPct}%
                </span>
                <span className="flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-red-500" />
                  {failPct}%
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Brak danych</p>
          )}
        </div>

        {/* User Satisfaction */}
        {userSatisfaction.totalRated > 0 && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Satysfakcja
              </p>
              <div className="flex items-center gap-1 mt-1">
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                <span className="text-sm font-semibold">
                  {userSatisfaction.avgRating}/5
                </span>
                <span className="text-xs text-muted-foreground ml-1">
                  ({userSatisfaction.totalRated} ocen)
                </span>
              </div>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="text-green-600">
                +{userSatisfaction.positive}
              </span>
              <span className="text-red-600">-{userSatisfaction.negative}</span>
            </div>
          </div>
        )}

        {/* Week over week */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            Tydzien do tygodnia
          </span>
          <Badge
            variant={
              weekOverWeek.percentChange >= 0 ? "default" : "destructive"
            }
            className="text-xs"
          >
            {weekOverWeek.percentChange >= 0 ? (
              <TrendingUp className="h-3 w-3 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1" />
            )}
            {weekOverWeek.percentChange >= 0 ? "+" : ""}
            {weekOverWeek.percentChange}%
          </Badge>
        </div>

        {/* Last MAPE-K cycle */}
        {lastCycle.ranAt && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              MAPE-K: {formatRelative(lastCycle.ranAt)}
              {lastCycle.issuesFound > 0 &&
                ` · ${lastCycle.issuesFound} problem${lastCycle.issuesFound > 1 ? "ow" : ""}`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBadge({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center p-2 rounded-lg bg-muted/50">
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-lg font-bold">{value}</span>
      </div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min temu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h temu`;
  const days = Math.floor(hours / 24);
  return `${days}d temu`;
}
