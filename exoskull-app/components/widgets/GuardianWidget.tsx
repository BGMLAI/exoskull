"use client";

import { useEffect, useState } from "react";
import { Shield, ShieldCheck, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GuardianStats {
  today_approved: number;
  today_blocked: number;
  avg_effectiveness: number | null;
  total_measured: number;
}

export function GuardianWidget() {
  const [stats, setStats] = useState<GuardianStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/autonomy/guardian");
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        }
      } catch (error) {
        console.error("[GuardianWidget] Load error:", error);
      }
      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <div className="h-4 w-24 bg-muted rounded" />
        </CardHeader>
        <CardContent>
          <div className="h-6 w-32 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const totalActions = stats.today_approved + stats.today_blocked;
  const isActive = totalActions > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Guardian</CardTitle>
        {isActive ? (
          <ShieldCheck className="h-4 w-4 text-green-600" />
        ) : (
          <Shield className="h-4 w-4 text-muted-foreground" />
        )}
      </CardHeader>
      <CardContent>
        {isActive ? (
          <>
            <div className="text-2xl font-bold">
              {stats.today_approved + stats.today_blocked} akcji
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-green-600">
                {stats.today_approved} zatwierdzonych
              </span>
              {stats.today_blocked > 0 && (
                <span className="text-xs text-red-600 flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  {stats.today_blocked} zablokowanych
                </span>
              )}
            </div>
            {stats.avg_effectiveness !== null && (
              <p className="text-xs text-muted-foreground mt-1">
                Skutecznosc: {stats.avg_effectiveness}/10 (
                {stats.total_measured} pomiarow)
              </p>
            )}
          </>
        ) : (
          <div>
            <div className="text-lg font-medium text-muted-foreground">
              Brak akcji dzisiaj
            </div>
            {stats.avg_effectiveness !== null && (
              <p className="text-xs text-muted-foreground mt-1">
                Srednia skutecznosc: {stats.avg_effectiveness}/10
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
