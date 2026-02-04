"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  MessageSquare,
  Moon,
  AlertTriangle,
  Sun,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface DailySummaryCardProps {
  tasksDoneToday: number;
  conversationsToday: number;
  sleepHours: number | null;
  hrvValue: number | null;
  alerts: string[];
  loading?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DailySummaryCard({
  tasksDoneToday,
  conversationsToday,
  sleepHours,
  hrvValue,
  alerts,
  loading,
}: DailySummaryCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sun className="h-5 w-5" />
            Dzisiejszy dzien
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sun className="h-5 w-5 text-amber-500" />
          Dzisiejszy dzien
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Key metrics row */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="font-medium">{tasksDoneToday}</span>
            <span className="text-muted-foreground">
              {tasksDoneToday === 1 ? "zadanie" : "zadan"} wykonanych
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-blue-500" />
            <span className="font-medium">{conversationsToday}</span>
            <span className="text-muted-foreground">
              {conversationsToday === 1 ? "rozmowa" : "rozmow"}
            </span>
          </div>
          {sleepHours !== null && (
            <div className="flex items-center gap-1.5">
              <Moon className="h-4 w-4 text-purple-500" />
              <span className="font-medium">{sleepHours}h</span>
              <span className="text-muted-foreground">snu</span>
            </div>
          )}
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-1.5">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-sm p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{alert}</span>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {tasksDoneToday === 0 &&
          conversationsToday === 0 &&
          sleepHours === null &&
          alerts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Brak danych z dzisiejszego dnia. Zacznij rozmowe lub dodaj
              zadanie.
            </p>
          )}
      </CardContent>
    </Card>
  );
}
