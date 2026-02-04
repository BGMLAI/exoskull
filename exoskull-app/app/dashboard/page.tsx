import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { queryDatabase } from "@/lib/db-direct";
import { QuickActionsWidget } from "@/components/widgets/QuickActionsWidget";
import { IntegrationsWidget } from "@/components/widgets/IntegrationsWidget";
import { CalendarWidget } from "@/components/widgets/CalendarWidget";
import { HealthWidget } from "@/components/widgets/HealthWidget";
import { KnowledgeWidget } from "@/components/widgets/KnowledgeWidget";
import { DashboardRealtime } from "@/components/dashboard/DashboardRealtime";
import { DynamicModWidget } from "@/components/widgets/DynamicModWidget";
import {
  CalendarItem,
  ConversationStats,
  DataPoint,
  HealthSummary,
  KnowledgeSummary,
  TaskStats,
} from "@/lib/dashboard/types";
import { MessageSquare, Package, Clock } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Get user data
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">
          Zaloguj sie, aby zobaczyc dashboard
        </h1>
      </div>
    );
  }

  // Get tenant profile
  let tenantName = "";
  let assistantName = "IORS";
  try {
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("preferred_name, name, assistant_name")
      .eq("id", user.id)
      .single();
    tenantName = tenant?.preferred_name || tenant?.name || "";
    assistantName = tenant?.assistant_name || "IORS";
  } catch (e: any) {
    console.error("[Dashboard] Failed to load tenant:", e);
  }

  // Get installed Mods
  let installedMods: any[] = [];
  try {
    const { data: mods } = await supabase
      .from("exo_tenant_mods")
      .select(
        "id, mod_id, config_overrides, active, exo_mod_registry(slug, name, description, icon, category, config)",
      )
      .eq("tenant_id", user.id)
      .eq("active", true);

    installedMods = (mods || []).map((m: any) => ({
      id: m.id,
      ...(m.exo_mod_registry || {}),
    }));
  } catch (e: any) {
    console.error("[Dashboard] Failed to load mods:", e);
  }

  // Get task stats
  let taskStats: TaskStats = {
    total: 0,
    pending: 0,
    in_progress: 0,
    done: 0,
    blocked: 0,
  };
  let taskSeries: DataPoint[] = [];
  let tasks: any[] = [];

  try {
    tasks = await queryDatabase("exo_tasks", {
      filter: { tenant_id: user.id },
    });

    if (tasks) {
      taskStats = {
        total: tasks.length,
        pending: tasks.filter((t: any) => t.status === "pending").length,
        in_progress: tasks.filter((t: any) => t.status === "in_progress")
          .length,
        done: tasks.filter((t: any) => t.status === "done").length,
        blocked: tasks.filter((t: any) => t.status === "blocked").length,
      };

      const completedDates = tasks
        .filter((t: any) => t.completed_at)
        .map((t: any) => t.completed_at);

      taskSeries = buildDailySeries(completedDates, 7);
    }
  } catch (e: any) {
    console.error("Failed to load tasks:", e);
  }

  // Get conversation stats
  let conversationStats: ConversationStats = {
    totalToday: 0,
    totalWeek: 0,
    avgDuration: 0,
  };
  let conversationSeries: DataPoint[] = [];

  try {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const conversations = await queryDatabase("exo_conversations", {
      filter: { tenant_id: user.id },
    });

    if (conversations) {
      const todayConvs = conversations.filter(
        (c: any) => new Date(c.started_at) >= startOfDay,
      );
      const weekConvs = conversations.filter(
        (c: any) => new Date(c.started_at) >= startOfWeek,
      );
      const durations = conversations
        .filter((c: any) => c.duration_seconds)
        .map((c: any) => c.duration_seconds);

      conversationStats = {
        totalToday: todayConvs.length,
        totalWeek: weekConvs.length,
        avgDuration:
          durations.length > 0
            ? Math.round(
                durations.reduce((a: number, b: number) => a + b, 0) /
                  durations.length,
              )
            : 0,
      };

      const startedDates = conversations.map((c: any) => c.started_at);
      conversationSeries = buildDailySeries(startedDates, 7);
    }
  } catch (e: any) {
    console.error("Failed to load conversations:", e);
  }

  // Health summary (last 7 days)
  let healthSummary: HealthSummary = {
    steps: null,
    sleepMinutes: null,
    hrv: null,
    sleepSeries: [],
  };

  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: healthMetrics } = await supabase
      .from("exo_health_metrics")
      .select("metric_type, value, recorded_at")
      .eq("tenant_id", user.id)
      .gte("recorded_at", weekAgo.toISOString())
      .order("recorded_at", { ascending: true });

    if (healthMetrics && healthMetrics.length > 0) {
      const latestByType: Record<string, { value: number; ts: number }> = {};
      const sleepByDate = new Map<string, number>();

      for (const metric of healthMetrics) {
        const timestamp = new Date(metric.recorded_at).getTime();

        if (
          !latestByType[metric.metric_type] ||
          latestByType[metric.metric_type].ts < timestamp
        ) {
          latestByType[metric.metric_type] = {
            value: metric.value,
            ts: timestamp,
          };
        }

        if (metric.metric_type === "sleep") {
          const key = new Date(metric.recorded_at).toISOString().split("T")[0];
          sleepByDate.set(key, (sleepByDate.get(key) || 0) + metric.value);
        }
      }

      healthSummary = {
        steps: latestByType.steps?.value ?? null,
        sleepMinutes: latestByType.sleep?.value ?? null,
        hrv: latestByType.hrv?.value ?? null,
        sleepSeries: buildDailyValueSeries(
          sleepByDate,
          7,
          (value) => Math.round((value / 60) * 10) / 10,
        ),
      };
    }
  } catch (e: any) {
    console.error("Failed to load health metrics:", e);
  }

  // Knowledge summary (loops/campaigns)
  let knowledgeSummary: KnowledgeSummary = {
    loopsTotal: 0,
    activeCampaigns: 0,
  };

  try {
    const { data: loops } = await supabase
      .from("user_loops")
      .select("name, icon, attention_score, is_active")
      .eq("tenant_id", user.id);

    const { data: campaigns } = await supabase
      .from("user_campaigns")
      .select("status")
      .eq("tenant_id", user.id);

    const topLoop = loops
      ? [...loops].sort(
          (a, b) => (b.attention_score || 0) - (a.attention_score || 0),
        )[0]
      : null;

    knowledgeSummary = {
      loopsTotal: loops?.length || 0,
      activeCampaigns:
        campaigns?.filter((c) => c.status === "active").length || 0,
      topLoop: topLoop
        ? {
            name: topLoop.name,
            icon: topLoop.icon,
            attentionScore: topLoop.attention_score,
          }
        : undefined,
    };
  } catch (e: any) {
    console.error("Failed to load knowledge summary:", e);
  }

  // Calendar items
  let calendarItems: CalendarItem[] = [];

  try {
    const scheduledJobs = await queryDatabase("exo_scheduled_jobs", {
      filter: { is_active: true },
    });

    const jobPreferences = await queryDatabase("exo_user_job_preferences", {
      filter: { tenant_id: user.id },
    });

    const customJobs = await queryDatabase("exo_custom_scheduled_jobs", {
      filter: { tenant_id: user.id },
    });

    calendarItems = buildCalendarItems({
      tasks,
      scheduledJobs: scheduledJobs || [],
      jobPreferences: jobPreferences || [],
      customJobs: customJobs || [],
    });
  } catch (e: any) {
    console.error("Failed to load calendar items:", e);
  }

  // Get rig connections
  let rigConnections: any[] = [];
  try {
    const connections = await queryDatabase("exo_rig_connections", {
      filter: { tenant_id: user.id },
    });
    rigConnections = connections || [];
  } catch (e: any) {
    console.error("Failed to load rig connections:", e);
  }

  // Planned actions (autonomy interventions)
  let plannedActions: any[] = [];
  try {
    const { data: interventions } = await supabase
      .from("exo_interventions")
      .select(
        "id, title, description, priority, intervention_type, status, scheduled_for, created_at",
      )
      .eq("tenant_id", user.id)
      .in("status", ["proposed", "approved"])
      .order("created_at", { ascending: false })
      .limit(10);
    plannedActions = interventions || [];
  } catch (e: any) {
    console.error("Failed to load planned actions:", e);
  }

  // Available mod templates (for ModStore)
  let availableMods: any[] = [];
  try {
    const { data: mods } = await supabase
      .from("exo_mod_registry")
      .select("id, slug, name, description, icon, category")
      .eq("is_template", true)
      .order("name");
    availableMods = mods || [];
  } catch (e: any) {
    console.error("Failed to load available mods:", e);
  }

  // Get greeting based on time
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Dzien dobry" : hour < 18 ? "Witaj" : "Dobry wieczor";

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {greeting}
            {tenantName ? `, ${tenantName}` : ""}!
          </h1>
          <p className="text-muted-foreground">Oto Twoj dzisiejszy przeglad</p>
        </div>
        <Link
          href="/dashboard/chat"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <MessageSquare className="h-4 w-4" />
          Porozmawiaj z {assistantName}
        </Link>
      </div>

      {/* Installed Mods */}
      {installedMods.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Twoje Mody</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {installedMods.map((mod: any) => (
              <DynamicModWidget
                key={mod.id}
                slug={mod.slug}
                name={mod.name}
                icon={mod.icon || ""}
                config={mod.config || { fields: [], widget: "log" }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <DashboardRealtime
          tenantId={user.id}
          initialTaskStats={taskStats}
          initialConversationStats={conversationStats}
          initialTaskSeries={taskSeries}
          initialConversationSeries={conversationSeries}
        />
        <CalendarWidget items={calendarItems} />
        <HealthWidget summary={healthSummary} />
        <KnowledgeWidget summary={knowledgeSummary} />
      </div>

      {/* Quick actions & Integrations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <QuickActionsWidget />
        <IntegrationsWidget connections={rigConnections} />
      </div>

      {/* Planned Actions (from autonomy) */}
      {plannedActions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              Zaplanowane akcje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {plannedActions.map((action: any) => (
                <div
                  key={action.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {action.title}
                    </p>
                    {action.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {action.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        action.priority === "high"
                          ? "bg-red-100 text-red-700"
                          : action.priority === "medium"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                      }`}
                    >
                      {action.priority}
                    </span>
                    {action.scheduled_for && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(action.scheduled_for).toLocaleString(
                          "pl-PL",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "2-digit",
                          },
                        )}
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        action.status === "approved"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {action.status === "proposed"
                        ? "Oczekuje"
                        : "Zatwierdzone"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* App Builder / Mod Store */}
      {installedMods.length === 0 ? (
        <Card className="border-dashed border-2 border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-500" />
              {assistantName} buduje aplikacje dla Ciebie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Powiedz {assistantName} czego potrzebujesz, a zbuduje Ci
              dopasowane narzedzia. Mozesz tez przejrzec gotowe Mody i
              zainstalowac je jednym kliknieciem.
            </p>
            <div className="flex gap-3">
              <Link
                href="/dashboard/chat"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <MessageSquare className="h-4 w-4" />
                Porozmawiaj z {assistantName}
              </Link>
            </div>
            {availableMods.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">
                  Gotowe Mody do instalacji:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {availableMods.slice(0, 6).map((mod: any) => (
                    <div
                      key={mod.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-white border hover:border-blue-300 transition-colors cursor-pointer"
                    >
                      <span className="text-lg">{mod.icon || "📦"}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">
                          {mod.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {mod.category || ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        availableMods.length > installedMods.length && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                Wiecej Modow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {availableMods
                  .filter(
                    (mod: any) =>
                      !installedMods.some((im: any) => im.slug === mod.slug),
                  )
                  .slice(0, 5)
                  .map((mod: any) => (
                    <span
                      key={mod.id}
                      className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs"
                    >
                      <span>{mod.icon || "📦"}</span>
                      {mod.name}
                    </span>
                  ))}
              </div>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}

function buildDailySeries(dateStrings: string[], days: number): DataPoint[] {
  const counts = new Map<string, number>();
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  dateStrings.forEach((dateStr) => {
    const date = new Date(dateStr);
    if (date < start) return;
    const key = date.toISOString().split("T")[0];
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const series: DataPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = date.toISOString().split("T")[0];
    series.push({
      date: key,
      value: counts.get(key) || 0,
      label: formatShortDate(date),
    });
  }

  return series;
}

function buildDailyValueSeries(
  valuesByDate: Map<string, number>,
  days: number,
  transform?: (value: number) => number,
): DataPoint[] {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const series: DataPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = date.toISOString().split("T")[0];
    const rawValue = valuesByDate.get(key) || 0;
    const value = transform ? transform(rawValue) : rawValue;

    series.push({
      date: key,
      value,
      label: formatShortDate(date),
    });
  }

  return series;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
  });
}

function buildCalendarItems({
  tasks,
  scheduledJobs,
  jobPreferences,
  customJobs,
}: {
  tasks: any[];
  scheduledJobs: any[];
  jobPreferences: any[];
  customJobs: any[];
}): CalendarItem[] {
  const now = new Date();
  const prefsMap = new Map(
    jobPreferences.map((pref: any) => [pref.job_id, pref]),
  );

  const taskItems = tasks
    .filter((task) => task.due_date && task.status !== "done")
    .map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      date: task.due_date,
      type: "task" as const,
      link: "/dashboard/tasks",
      meta: "Zadanie",
    }))
    .filter((item) => new Date(item.date) >= now);

  const checkinItems = scheduledJobs
    .filter((job) => !job.is_system)
    .map((job) => {
      const pref = prefsMap.get(job.id);
      const isEnabled = pref?.is_enabled ?? true;
      if (!isEnabled) return null;

      const time = pref?.custom_time || job.time_window_start;
      const nextDate = getNextOccurrenceFromTime(time);
      if (!nextDate) return null;

      return {
        id: `job-${job.id}`,
        title: job.display_name,
        date: nextDate,
        type: "checkin" as const,
        link: "/dashboard/schedule",
        meta: pref?.preferred_channel || job.default_channel || "check-in",
      };
    })
    .filter(Boolean) as CalendarItem[];

  const customItems = customJobs
    .filter((job) => job.is_enabled)
    .map((job) => ({
      id: `custom-${job.id}`,
      title: job.display_name,
      date: job.next_execution_at || getNextOccurrenceFromTime(job.time_of_day),
      type: "custom" as const,
      link: "/dashboard/schedule",
      meta: job.job_type || "custom",
    }))
    .filter((item) => item.date) as CalendarItem[];

  return [...taskItems, ...checkinItems, ...customItems]
    .filter((item) => new Date(item.date) >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);
}

function getNextOccurrenceFromTime(timeStr: string | null): string | null {
  if (!timeStr) return null;
  const [hour, minute] = timeStr.split(":").map((value) => parseInt(value, 10));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);

  if (next < now) {
    next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}
