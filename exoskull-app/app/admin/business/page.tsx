"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp,
  Users,
  CreditCard,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/admin/stat-card";

interface BusinessData {
  latest: any;
  history: any[];
  engagementDistribution: Record<string, number>;
  tierDistribution: Record<string, number>;
  dunning: any[];
  referralStats: { total: number; converted: number };
}

const ENGAGEMENT_COLORS: Record<string, string> = {
  power_user: "bg-blue-500",
  high: "bg-green-500",
  medium: "bg-yellow-500",
  low: "bg-orange-500",
  dormant: "bg-red-500",
};

export default function AdminBusinessPage() {
  const [data, setData] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/business/kpis");
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("[AdminBusiness] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Business KPIs</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 w-20 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-24 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const m = data?.latest;
  const history = data?.history || [];
  const prevDay = history.length > 1 ? history[history.length - 2] : null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Business KPIs</h1>

      {!m ? (
        <p className="text-muted-foreground">
          No business metrics data yet. Run the business-metrics cron first.
        </p>
      ) : (
        <>
          {/* Primary Revenue KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="MRR"
              value={`${(m.mrr_pln || 0).toLocaleString("pl-PL")} PLN`}
              description={`ARR: ${(m.arr_pln || 0).toLocaleString("pl-PL")} PLN`}
              icon={<TrendingUp className="h-4 w-4" />}
              trend={prevDay ? m.mrr_pln - prevDay.mrr_pln : undefined}
              trendLabel="PLN vs prev"
            />
            <StatCard
              title="Active (30d)"
              value={m.active_users_30d}
              description={`${m.total_users} total / ${m.paying_users} paying`}
              icon={<Users className="h-4 w-4" />}
            />
            <StatCard
              title="Churn (30d)"
              value={`${((m.churn_rate_30d || 0) * 100).toFixed(1)}%`}
              description={`${m.churned_users_30d || 0} churned`}
              icon={<AlertTriangle className="h-4 w-4" />}
              negative={(m.churn_rate_30d || 0) > 0.05}
            />
            <StatCard
              title="LTV"
              value={`${(m.ltv_estimated_pln || 0).toLocaleString("pl-PL")} PLN`}
              description={`ARPU: ${(m.arpu_pln || 0).toLocaleString("pl-PL")} PLN`}
              icon={<CreditCard className="h-4 w-4" />}
            />
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title="Revenue Today"
              value={`${(m.revenue_today_pln || 0).toLocaleString("pl-PL")} PLN`}
              icon={<ArrowUpRight className="h-4 w-4" />}
            />
            <StatCard
              title="Trial Conversion"
              value={`${((m.trial_to_paid_rate || 0) * 100).toFixed(1)}%`}
              description={`${m.trial_users || 0} in trial`}
            />
            <StatCard
              title="Referrals"
              value={data?.referralStats?.total || 0}
              description={`${data?.referralStats?.converted || 0} converted`}
            />
          </div>

          {/* MRR History Chart */}
          {history.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  MRR Trend (last 90d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-40">
                  {history.map((day) => {
                    const maxMRR = Math.max(
                      ...history.map((h: any) => h.mrr_pln),
                      1,
                    );
                    const height = (day.mrr_pln / maxMRR) * 100;
                    return (
                      <div
                        key={day.date}
                        className="flex-1 bg-primary/20 hover:bg-primary/40 rounded-t transition-colors relative group"
                        style={{ height: `${Math.max(height, 2)}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover border rounded px-2 py-1 text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                          {new Date(day.date).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                          : {day.mrr_pln} PLN
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tier Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscription Tiers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data?.tierDistribution || {}).map(
                ([tier, count]) => {
                  const total = Object.values(
                    data?.tierDistribution || {},
                  ).reduce((s, v) => s + v, 0);
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={tier}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize">{tier}</span>
                        <span className="text-muted-foreground">
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </CardContent>
        </Card>

        {/* Engagement Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engagement Levels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(data?.engagementDistribution || {}).map(
                ([level, count]) => {
                  const total = Object.values(
                    data?.engagementDistribution || {},
                  ).reduce((s, v) => s + v, 0);
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={level}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize">
                          {level.replace("_", " ")}
                        </span>
                        <span className="text-muted-foreground">
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${ENGAGEMENT_COLORS[level] || "bg-zinc-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dunning */}
      {(data?.dunning || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Dunning Attempts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Amount</th>
                    <th className="pb-2 font-medium">Attempt</th>
                    <th className="pb-2 font-medium">Next Retry</th>
                    <th className="pb-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.dunning || []).map((d: any) => (
                    <tr key={d.id} className="border-b border-border/50">
                      <td className="py-2 capitalize">{d.status}</td>
                      <td className="py-2">{d.amount_pln} PLN</td>
                      <td className="py-2">#{d.attempt_number}</td>
                      <td className="py-2 text-xs">
                        {d.next_retry_at
                          ? new Date(d.next_retry_at).toLocaleString("en-GB")
                          : "-"}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {new Date(d.created_at).toLocaleString("en-GB")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
