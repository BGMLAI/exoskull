"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Clock, TrendingUp } from "lucide-react";
import { ConversationStats, DataPoint } from "@/lib/dashboard/types";
import Link from "next/link";
import { AreaChartWrapper } from "@/components/charts/AreaChartWrapper";

interface ConversationsWidgetProps {
  stats: ConversationStats;
  series?: DataPoint[];
  lastUpdated?: string | null;
  loading?: boolean;
}

export function ConversationsWidget({
  stats,
  series = [],
  lastUpdated,
  loading,
}: ConversationsWidgetProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Rozmowy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const avgMinutes = Math.round(stats.avgDuration / 60);
  const hasSeries = series.some((point) => point.value > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Rozmowy
          </CardTitle>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Aktualizacja: {formatTime(lastUpdated)}
              </span>
            )}
            <Link
              href="/dashboard/chat"
              className="text-sm font-normal text-muted-foreground hover:text-foreground"
            >
              Rozpocznij rozmowe
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-3xl font-bold">
          {stats.totalWeek}
          <span className="text-sm font-normal text-muted-foreground ml-2">
            w tym tygodniu
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-green-500" />
            <span>{stats.totalToday} dzis</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-blue-500" />
            <span>~{avgMinutes} min/rozmowa</span>
          </div>
        </div>

        {hasSeries && (
          <AreaChartWrapper
            data={series}
            color="#3b82f6"
            height={80}
            showXAxis
          />
        )}
      </CardContent>
    </Card>
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
