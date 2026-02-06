import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SleepChart } from "@/components/health/SleepChart";
import { ActivityChart } from "@/components/health/ActivityChart";
import { HRVChart } from "@/components/health/HRVChart";
import { EmotionTrendsChart } from "@/components/health/EmotionTrendsChart";
import { Progress } from "@/components/ui/progress";
import {
  Heart,
  Footprints,
  Moon,
  Activity,
  Flame,
  Smartphone,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Zdrowie" };

interface HealthMetric {
  metric_type: string;
  value: number;
  unit: string;
  recorded_at: string;
}

interface DailySummary {
  date: string;
  steps_total: number | null;
  sleep_minutes: number | null;
  heart_rate_avg: number | null;
  hrv_avg: number | null;
  calories_total: number | null;
  distance_meters: number | null;
}

export default async function HealthDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">
          Zaloguj sie, aby zobaczyc dane zdrowotne
        </h1>
      </div>
    );
  }

  // Check Health Connect connection status
  const { data: connection } = await supabase
    .from("exo_rig_connections")
    .select("id, sync_status, last_sync_at, metadata, created_at")
    .eq("tenant_id", user.id)
    .eq("rig_slug", "health-connect")
    .single();

  const isConnected = !!connection;

  // Get today's metrics
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: todayMetrics } = await supabase
    .from("exo_health_metrics")
    .select("metric_type, value, unit, recorded_at")
    .eq("tenant_id", user.id)
    .gte("recorded_at", today.toISOString())
    .order("recorded_at", { ascending: false });

  // Aggregate today's metrics by type (get latest value for each)
  const metricsByType: Record<string, HealthMetric> = {};
  for (const m of todayMetrics || []) {
    if (!metricsByType[m.metric_type]) {
      metricsByType[m.metric_type] = m;
    }
  }

  // Get weekly summary (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: weeklyMetrics } = await supabase
    .from("exo_health_metrics")
    .select("metric_type, value, recorded_at")
    .eq("tenant_id", user.id)
    .gte("recorded_at", weekAgo.toISOString())
    .eq("metric_type", "steps");

  // Calculate weekly steps average
  const stepsByDay: Record<string, number> = {};
  for (const m of weeklyMetrics || []) {
    const day = new Date(m.recorded_at).toDateString();
    if (!stepsByDay[day] || m.value > stepsByDay[day]) {
      stepsByDay[day] = m.value;
    }
  }
  const avgSteps =
    Object.values(stepsByDay).length > 0
      ? Math.round(
          Object.values(stepsByDay).reduce((a, b) => a + b, 0) /
            Object.values(stepsByDay).length,
        )
      : 0;

  // Get sleep data for last 14 days (for week-over-week comparison)
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const { data: sleepMetrics14d } = await supabase
    .from("exo_health_metrics")
    .select("value, recorded_at")
    .eq("tenant_id", user.id)
    .eq("metric_type", "sleep")
    .gte("recorded_at", twoWeeksAgo.toISOString())
    .order("recorded_at", { ascending: false });

  // Calculate sleep debt (target: 8h = 480min)
  const targetSleepMin = 480;
  let sleepDebtMin = 0;
  const sleepByDay14: Record<string, number> = {};
  for (const m of sleepMetrics14d || []) {
    const day = new Date(m.recorded_at).toDateString();
    if (!sleepByDay14[day] || m.value > sleepByDay14[day]) {
      sleepByDay14[day] = m.value;
    }
  }
  // Last 7 days sleep debt
  const last7Days = Object.entries(sleepByDay14).slice(0, 7);
  for (const [, minutes] of last7Days) {
    sleepDebtMin += Math.max(0, targetSleepMin - minutes);
  }
  const sleepDebtHours = Math.round((sleepDebtMin / 60) * 10) / 10;

  // Week-over-week: this week vs last week
  const thisWeekEntries = Object.entries(sleepByDay14).slice(0, 7);
  const lastWeekEntries = Object.entries(sleepByDay14).slice(7, 14);
  const thisWeekAvgSleep =
    thisWeekEntries.length > 0
      ? Math.round(
          thisWeekEntries.reduce((s, [, v]) => s + v, 0) /
            thisWeekEntries.length,
        )
      : 0;
  const lastWeekAvgSleep =
    lastWeekEntries.length > 0
      ? Math.round(
          lastWeekEntries.reduce((s, [, v]) => s + v, 0) /
            lastWeekEntries.length,
        )
      : 0;

  // Get mood data for last 14 days
  const { data: moodMetrics14d } = await supabase
    .from("exo_emotion_log")
    .select("mood_score, created_at")
    .eq("tenant_id", user.id)
    .gte("created_at", twoWeeksAgo.toISOString())
    .order("created_at", { ascending: false });

  const moodByDay: Record<string, number[]> = {};
  for (const m of moodMetrics14d || []) {
    const day = new Date(m.created_at).toDateString();
    if (!moodByDay[day]) moodByDay[day] = [];
    moodByDay[day].push(m.mood_score);
  }
  const moodDays = Object.entries(moodByDay);
  const thisWeekMood = moodDays.slice(0, 7);
  const lastWeekMood = moodDays.slice(7, 14);
  const thisWeekAvgMood =
    thisWeekMood.length > 0
      ? Math.round(
          (thisWeekMood.reduce(
            (s, [, vs]) => s + vs.reduce((a, b) => a + b, 0) / vs.length,
            0,
          ) /
            thisWeekMood.length) *
            10,
        ) / 10
      : 0;
  const lastWeekAvgMood =
    lastWeekMood.length > 0
      ? Math.round(
          (lastWeekMood.reduce(
            (s, [, vs]) => s + vs.reduce((a, b) => a + b, 0) / vs.length,
            0,
          ) /
            lastWeekMood.length) *
            10,
        ) / 10
      : 0;

  // Wellbeing composite score (sleep 30% + HRV 25% + mood 25% + steps 20%)
  let wellbeingScore = 50;
  const sleepVal = metricsByType.sleep?.value;
  const hrvVal = metricsByType.hrv?.value;
  const moodVal = moodMetrics14d?.[0]?.mood_score;
  const stepsVal = metricsByType.steps?.value;

  if (sleepVal)
    wellbeingScore =
      wellbeingScore * 0.7 +
      Math.min(100, (sleepVal / targetSleepMin) * 100) * 0.3;
  if (hrvVal)
    wellbeingScore =
      wellbeingScore * 0.75 + Math.min(100, (hrvVal / 60) * 100) * 0.25;
  if (moodVal) wellbeingScore = wellbeingScore * 0.75 + moodVal * 10 * 0.25;
  if (stepsVal)
    wellbeingScore =
      wellbeingScore * 0.8 + Math.min(100, (stepsVal / 10000) * 100) * 0.2;
  wellbeingScore = Math.round(Math.max(0, Math.min(100, wellbeingScore)));

  // Get recent sync logs
  const { data: syncLogs } = await supabase
    .from("exo_rig_sync_log")
    .select("success, records_synced, created_at")
    .eq("tenant_id", user.id)
    .eq("rig_slug", "health-connect")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Heart className="h-8 w-8 text-red-500" />
            Zdrowie
          </h1>
          <p className="text-muted-foreground">
            Dane z Oura, Google Fit i Health Connect
          </p>
        </div>
        <Badge
          variant={isConnected ? "default" : "secondary"}
          className="flex items-center gap-1"
        >
          {isConnected ? (
            <>
              <CheckCircle2 className="h-3 w-3" />
              Polaczony
            </>
          ) : (
            <>
              <XCircle className="h-3 w-3" />
              Niepodlaczony
            </>
          )}
        </Badge>
      </div>

      {/* Connection status card */}
      {!isConnected && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Smartphone className="h-5 w-5" />
              Polacz Health Connect
            </CardTitle>
            <CardDescription>
              Zainstaluj aplikacje ExoSkull na Androidzie, aby synchronizowac
              dane zdrowotne
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Instrukcje:</h4>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                <li>Pobierz aplikacje ExoSkull z Google Play (wkrotce)</li>
                <li>Zaloguj sie tym samym kontem</li>
                <li>Przyznaj dostep do Health Connect</li>
                <li>Dane beda synchronizowane automatycznie</li>
              </ol>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">
                <strong>Tymczasowo:</strong> Mozesz testowac API wysylajac dane
                manualnie przez endpoint{" "}
                <code className="px-1 py-0.5 bg-muted rounded text-xs">
                  POST /api/rigs/health-connect/sync
                </code>
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Jesli nie masz Androida, podlacz Oura lub Google Fit w
                Exoskulletonie.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<Footprints className="h-5 w-5" />}
          label="Kroki"
          value={metricsByType.steps?.value || 0}
          unit=""
          color="text-blue-500"
          hasData={!!metricsByType.steps}
        />
        <MetricCard
          icon={<Moon className="h-5 w-5" />}
          label="Sen"
          value={
            metricsByType.sleep ? Math.round(metricsByType.sleep.value / 60) : 0
          }
          unit="h"
          subValue={
            metricsByType.sleep
              ? `${metricsByType.sleep.value % 60}min`
              : undefined
          }
          color="text-purple-500"
          hasData={!!metricsByType.sleep}
        />
        <MetricCard
          icon={<Heart className="h-5 w-5" />}
          label="Puls"
          value={metricsByType.heart_rate?.value || 0}
          unit="bpm"
          color="text-red-500"
          hasData={!!metricsByType.heart_rate}
        />
        <MetricCard
          icon={<Activity className="h-5 w-5" />}
          label="HRV"
          value={Math.round(metricsByType.hrv?.value || 0)}
          unit="ms"
          color="text-green-500"
          hasData={!!metricsByType.hrv}
        />
      </div>

      {/* Wellbeing Score + Sleep Debt */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20 border-0">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-muted-foreground">
                Wellbeing Score
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span
                className={`text-4xl font-bold ${
                  wellbeingScore >= 70
                    ? "text-green-600"
                    : wellbeingScore >= 40
                      ? "text-yellow-600"
                      : "text-red-600"
                }`}
              >
                {wellbeingScore}
              </span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <Progress value={wellbeingScore} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Sen 30% + HRV 25% + Nastroj 25% + Aktywnosc 20%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Moon className="h-5 w-5 text-indigo-500" />
              <span className="text-sm font-medium text-muted-foreground">
                Dlug sennych (7 dni)
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span
                className={`text-4xl font-bold ${
                  sleepDebtHours <= 3
                    ? "text-green-600"
                    : sleepDebtHours <= 6
                      ? "text-yellow-600"
                      : "text-red-600"
                }`}
              >
                {sleepDebtHours}h
              </span>
              <span className="text-sm text-muted-foreground">
                ponizej celu (8h/noc)
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {sleepDebtHours === 0
                ? "Brak dlugu — swietnie!"
                : sleepDebtHours <= 3
                  ? "Niewielki dlug — mozna nadrobic"
                  : sleepDebtHours <= 6
                    ? "Sredni dlug — zadbaj o regularny sen"
                    : "Duzy dlug — priorytet: odpoczynek!"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Week-over-week trends */}
      {(thisWeekAvgSleep > 0 || thisWeekAvgMood > 0 || avgSteps > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Tydzien vs tydzien</CardTitle>
            <CardDescription>Porownanie z poprzednim tygodniem</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {thisWeekAvgSleep > 0 && (
                <TrendCard
                  label="Sredni sen"
                  thisWeek={`${Math.round((thisWeekAvgSleep / 60) * 10) / 10}h`}
                  lastWeek={
                    lastWeekAvgSleep > 0
                      ? `${Math.round((lastWeekAvgSleep / 60) * 10) / 10}h`
                      : "—"
                  }
                  trend={
                    lastWeekAvgSleep > 0
                      ? thisWeekAvgSleep - lastWeekAvgSleep
                      : 0
                  }
                />
              )}
              {thisWeekAvgMood > 0 && (
                <TrendCard
                  label="Sredni nastroj"
                  thisWeek={`${thisWeekAvgMood}/10`}
                  lastWeek={lastWeekAvgMood > 0 ? `${lastWeekAvgMood}/10` : "—"}
                  trend={
                    lastWeekAvgMood > 0 ? thisWeekAvgMood - lastWeekAvgMood : 0
                  }
                />
              )}
              {avgSteps > 0 && (
                <TrendCard
                  label="Srednie kroki"
                  thisWeek={avgSteps.toLocaleString()}
                  lastWeek="—"
                  trend={0}
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SleepChart />
        <ActivityChart />
        <HRVChart />
      </div>

      {/* Emotion Trends */}
      <EmotionTrendsChart />

      {/* Weekly summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Podsumowanie tygodnia</CardTitle>
          <CardDescription>Ostatnie 7 dni</CardDescription>
        </CardHeader>
        <CardContent>
          {avgSteps > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">
                  {avgSteps.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">
                  Srednia krokow/dzien
                </p>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">
                  {Object.keys(stepsByDay).length}
                </p>
                <p className="text-sm text-muted-foreground">Dni z danymi</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Brak danych z ostatniego tygodnia</p>
              <p className="text-sm">
                Polacz Health Connect, aby zaczac sledzic
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent syncs */}
      {isConnected && syncLogs && syncLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Ostatnie synchronizacje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {syncLogs.map((log, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    {log.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm">
                      {log.records_synced} rekordow
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(new Date(log.created_at))}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================
// COMPONENTS
// =====================================================

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  subValue?: string;
  color: string;
  hasData: boolean;
}

function MetricCard({
  icon,
  label,
  value,
  unit,
  subValue,
  color,
  hasData,
}: MetricCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className={`flex items-center gap-2 mb-2 ${color}`}>
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        {hasData ? (
          <div>
            <span className="text-3xl font-bold">{value.toLocaleString()}</span>
            <span className="text-sm text-muted-foreground ml-1">{unit}</span>
            {subValue && (
              <span className="text-sm text-muted-foreground ml-1">
                {subValue}
              </span>
            )}
          </div>
        ) : (
          <div className="text-2xl font-bold text-muted-foreground">--</div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================
// HELPERS
// =====================================================

interface TrendCardProps {
  label: string;
  thisWeek: string;
  lastWeek: string;
  trend: number;
}

function TrendCard({ label, thisWeek, lastWeek, trend }: TrendCardProps) {
  return (
    <div className="p-4 rounded-lg bg-muted/50">
      <p className="text-sm text-muted-foreground mb-2">{label}</p>
      <div className="flex items-center justify-between">
        <span className="text-xl font-bold">{thisWeek}</span>
        <div className="flex items-center gap-1">
          {trend > 0 ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : trend < 0 ? (
            <TrendingDown className="h-4 w-4 text-red-500" />
          ) : (
            <Minus className="h-4 w-4 text-gray-500" />
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Poprzedni: {lastWeek}
      </p>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "przed chwila";
  if (diffMins < 60) return `${diffMins} min temu`;
  if (diffHours < 24) return `${diffHours}h temu`;
  return `${diffDays}d temu`;
}
