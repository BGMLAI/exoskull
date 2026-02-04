"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  TrendingUp,
  TrendingDown,
  Users,
  CreditCard,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BusinessDailyMetrics } from "@/lib/business/types";

export default function BusinessDashboardPage() {
  const [metrics, setMetrics] = useState<BusinessDailyMetrics | null>(null);
  const [history, setHistory] = useState<BusinessDailyMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMetrics() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );

      // Latest metrics
      const { data: latest } = await supabase
        .from("exo_business_daily_metrics")
        .select("*")
        .order("date", { ascending: false })
        .limit(1)
        .single();

      if (latest) setMetrics(latest as BusinessDailyMetrics);

      // History (last 30 days)
      const { data: hist } = await supabase
        .from("exo_business_daily_metrics")
        .select("*")
        .order("date", { ascending: true })
        .limit(30);

      if (hist) setHistory(hist as BusinessDailyMetrics[]);
      setLoading(false);
    }

    loadMetrics();
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Biznes</h1>
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

  if (!metrics) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Biznes</h1>
        <p className="text-muted-foreground mt-2">
          Brak danych. Metryki pojawia sie po pierwszym uruchomieniu crona
          business-metrics.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Biznes</h1>
          <p className="text-sm text-muted-foreground">
            Dane z {new Date(metrics.date).toLocaleDateString("pl-PL")}
          </p>
        </div>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="MRR"
          value={`${metrics.mrr_pln.toLocaleString("pl-PL")} PLN`}
          description={`ARR: ${metrics.arr_pln.toLocaleString("pl-PL")} PLN`}
          icon={<TrendingUp className="h-4 w-4" />}
          trend={
            history.length > 1
              ? metrics.mrr_pln - history[history.length - 2]?.mrr_pln
              : undefined
          }
        />
        <MetricCard
          title="Aktywni (30d)"
          value={metrics.active_users_30d.toString()}
          description={`${metrics.total_users} total / ${metrics.paying_users} platnych`}
          icon={<Users className="h-4 w-4" />}
        />
        <MetricCard
          title="Churn (30d)"
          value={`${(metrics.churn_rate_30d * 100).toFixed(1)}%`}
          description={`${metrics.churned_users_30d} odejsc`}
          icon={<AlertTriangle className="h-4 w-4" />}
          negative={metrics.churn_rate_30d > 0.05}
        />
        <MetricCard
          title="LTV"
          value={`${metrics.ltv_estimated_pln.toLocaleString("pl-PL")} PLN`}
          description={`ARPU: ${metrics.arpu_pln.toLocaleString("pl-PL")} PLN`}
          icon={<CreditCard className="h-4 w-4" />}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Przychod dzisiaj"
          value={`${metrics.revenue_today_pln.toLocaleString("pl-PL")} PLN`}
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
        <MetricCard
          title="Konwersja trial"
          value={`${(metrics.trial_to_paid_rate * 100).toFixed(1)}%`}
          description={`${metrics.trial_users} w trialu`}
        />
        <MetricCard
          title="Platni uzytkownicy"
          value={metrics.paying_users.toString()}
          description={`z ${metrics.total_users} total`}
        />
      </div>

      {/* MRR History Chart (simple bar chart) */}
      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>MRR (ostatnie 30 dni)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-40">
              {history.map((day, i) => {
                const maxMRR = Math.max(...history.map((h) => h.mrr_pln), 1);
                const height = (day.mrr_pln / maxMRR) * 100;

                return (
                  <div
                    key={day.date}
                    className="flex-1 bg-primary/20 hover:bg-primary/40 rounded-t transition-colors relative group"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover border rounded px-2 py-1 text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                      {new Date(day.date).toLocaleDateString("pl-PL", {
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
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon,
  trend,
  negative,
}: {
  title: string;
  value: string;
  description?: string;
  icon?: React.ReactNode;
  trend?: number;
  negative?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold ${negative ? "text-destructive" : ""}`}
        >
          {value}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend !== undefined && (
          <p
            className={`text-xs mt-1 flex items-center gap-1 ${trend >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {trend >= 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {trend >= 0 ? "+" : ""}
            {trend.toFixed(0)} PLN vs wczoraj
          </p>
        )}
      </CardContent>
    </Card>
  );
}
