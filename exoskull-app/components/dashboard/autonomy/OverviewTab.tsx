"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Zap, Clock, Activity, Play, Plus } from "lucide-react";
import type { AutonomyData } from "./useAutonomyData";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "./types";

interface Props {
  data: AutonomyData;
  onSwitchTab?: (tab: string) => void;
}

export function OverviewTab({ data, onSwitchTab }: Props) {
  const { stats, pending, interventions, activeGrants, runCycle } = data;

  const recentInterventions = interventions.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          }
          iconBg="bg-blue-100 dark:bg-blue-900/30"
          value={activeGrants.length}
          label="Aktywne granty"
        />
        <StatCard
          icon={<Zap className="w-5 h-5 text-green-600 dark:text-green-400" />}
          iconBg="bg-green-100 dark:bg-green-900/30"
          value={stats?.completed || 0}
          label="Wykonane (30d)"
        />
        <StatCard
          icon={
            <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          }
          iconBg="bg-yellow-100 dark:bg-yellow-900/30"
          value={pending.length}
          label="Oczekujace"
        />
        <StatCard
          icon={
            <Activity className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          }
          iconBg="bg-purple-100 dark:bg-purple-900/30"
          value={
            stats?.avg_effectiveness
              ? `${(stats.avg_effectiveness * 100).toFixed(0)}%`
              : "—"
          }
          label="Skutecznosc"
        />
      </div>

      {/* Quick Actions */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium mb-3 text-muted-foreground">
            Szybkie akcje
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => runCycle()}>
              <Play className="w-4 h-4 mr-2" />
              Uruchom cykl MAPE-K
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSwitchTab?.("permissions")}
            >
              <Plus className="w-4 h-4 mr-2" />
              Dodaj uprawnienie
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pending Alert */}
      {pending.length > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-yellow-700 dark:text-yellow-400">
                {pending.length} interwencji oczekuje na decyzje
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSwitchTab?.("interventions")}
              >
                Przejdz
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {pending[0]?.title}
              {pending.length > 1 && ` i ${pending.length - 1} wiecej...`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Ostatnia aktywnosc
            </h3>
            {interventions.length > 5 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onSwitchTab?.("interventions")}
                className="text-xs"
              >
                Zobacz wszystko
              </Button>
            )}
          </div>
          {recentInterventions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Brak dzialan autonomicznych
            </p>
          ) : (
            <div className="space-y-2">
              {recentInterventions.map((item) => {
                const statusCfg =
                  STATUS_CONFIG[item.status] || STATUS_CONFIG.completed;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString("pl-PL", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`border-0 text-xs ${statusCfg.color}`}
                      >
                        {statusCfg.label}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`border-0 text-xs ${PRIORITY_CONFIG[item.priority]?.color || ""}`}
                      >
                        {PRIORITY_CONFIG[item.priority]?.label || item.priority}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Stat Card
// ============================================================================

function StatCard({
  icon,
  iconBg,
  value,
  label,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: string | number;
  label: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
