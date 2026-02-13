/**
 * System Manifest — Complete catalog of all ExoSkull components
 *
 * Provides full self-awareness: every CRON, tool, widget, integration,
 * API route, and generated app is cataloged with health status.
 *
 * Used by:
 * - Ralph Loop (to know what exists and what's broken)
 * - System Health dashboard (to show all subsystems)
 * - IORS system prompt (to know own capabilities)
 * - Self-healing loop (to detect and fix issues)
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { IORS_EXTENSION_TOOLS } from "@/lib/iors/tools/index";
import { WIDGET_REGISTRY } from "@/lib/canvas/widget-registry";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface ComponentEntry {
  name: string;
  type: ComponentType;
  status: "active" | "degraded" | "down" | "unknown";
  category: string;
  description?: string;
  lastCheckAt?: string;
  details?: Record<string, unknown>;
}

export type ComponentType =
  | "cron"
  | "iors_tool"
  | "canvas_widget"
  | "integration"
  | "api_route"
  | "generated_app"
  | "dynamic_tool"
  | "gateway_adapter";

export interface SystemManifest {
  generatedAt: string;
  totalComponents: number;
  components: {
    crons: ComponentEntry[];
    iorsTools: ComponentEntry[];
    canvasWidgets: ComponentEntry[];
    integrations: ComponentEntry[];
    generatedApps: ComponentEntry[];
    dynamicTools: ComponentEntry[];
    gatewayAdapters: ComponentEntry[];
  };
  summary: {
    active: number;
    degraded: number;
    down: number;
    unknown: number;
  };
}

// ============================================================================
// STATIC CATALOGS (known at build time)
// ============================================================================

/** All 36 CRON jobs with their schedules */
const CRON_CATALOG: Array<{
  name: string;
  schedule: string;
  category: string;
  description: string;
}> = [
  // MAPEK Loop
  {
    name: "petla",
    schedule: "*/1 * * * *",
    category: "mapek",
    description: "1min triage event bus",
  },
  {
    name: "loop-15",
    schedule: "*/15 * * * *",
    category: "mapek",
    description: "15min tenant evaluation + Ralph Loop",
  },
  {
    name: "loop-daily",
    schedule: "0 2 * * *",
    category: "mapek",
    description: "24h maintenance (backfill, cleanup)",
  },

  // Autonomous briefings
  {
    name: "morning-briefing",
    schedule: "0 5 * * *",
    category: "briefing",
    description: "05:00 UTC morning check-in",
  },
  {
    name: "evening-reflection",
    schedule: "0 19 * * *",
    category: "briefing",
    description: "19:00 UTC evening reflection",
  },
  {
    name: "impulse",
    schedule: "*/15 * * * *",
    category: "proactive",
    description: "15min 6-handler proactive engine",
  },

  // Data Lake ETL
  {
    name: "bronze-etl",
    schedule: "0 * * * *",
    category: "data_lake",
    description: "Hourly raw data → R2 Parquet",
  },
  {
    name: "silver-etl",
    schedule: "0 * * * *",
    category: "data_lake",
    description: "Hourly clean + validate",
  },
  {
    name: "gold-etl",
    schedule: "0 2 * * *",
    category: "data_lake",
    description: "Daily aggregate views",
  },

  // Email
  {
    name: "email-sync",
    schedule: "*/15 * * * *",
    category: "email",
    description: "Sync emails from providers",
  },
  {
    name: "email-analyze",
    schedule: "*/5 * * * *",
    category: "email",
    description: "AI classification + extraction",
  },

  // Summaries
  {
    name: "daily-summary",
    schedule: "0 22 * * *",
    category: "summary",
    description: "Daily summary generation",
  },
  {
    name: "weekly-summary",
    schedule: "0 8 * * 1",
    category: "summary",
    description: "Weekly summary (Monday)",
  },
  {
    name: "monthly-summary",
    schedule: "0 8 1 * *",
    category: "summary",
    description: "Monthly summary (1st)",
  },

  // Intelligence
  {
    name: "gap-detection",
    schedule: "0 9 * * 0",
    category: "intelligence",
    description: "Weekly gap detection (Sunday)",
  },
  {
    name: "predictions",
    schedule: "0 3 * * *",
    category: "intelligence",
    description: "Daily predictions engine",
  },
  {
    name: "insight-push",
    schedule: "0 10 * * *",
    category: "intelligence",
    description: "Push insights to user",
  },
  {
    name: "self-optimization",
    schedule: "0 4 * * *",
    category: "intelligence",
    description: "System self-optimization",
  },

  // Scoring & health
  {
    name: "engagement-scoring",
    schedule: "0 1 * * *",
    category: "scoring",
    description: "User engagement scores",
  },
  {
    name: "guardian-values",
    schedule: "0 6 * * *",
    category: "guardian",
    description: "Value guardian check",
  },
  {
    name: "guardian-effectiveness",
    schedule: "0 3 * * 1",
    category: "guardian",
    description: "Guardian effectiveness review",
  },
  {
    name: "integration-health",
    schedule: "*/30 * * * *",
    category: "health",
    description: "Check all integration connections",
  },
  {
    name: "skill-health",
    schedule: "0 5 * * *",
    category: "health",
    description: "Skill system health check",
  },
  {
    name: "skill-lifecycle",
    schedule: "0 4 * * *",
    category: "skills",
    description: "Skill lifecycle management",
  },

  // Operations
  {
    name: "async-tasks",
    schedule: "*/1 * * * *",
    category: "operations",
    description: "Process async task queue",
  },
  {
    name: "post-conversation",
    schedule: "*/5 * * * *",
    category: "operations",
    description: "Post-conversation processing",
  },
  {
    name: "highlight-decay",
    schedule: "0 3 * * *",
    category: "operations",
    description: "Memory highlight decay",
  },
  {
    name: "intervention-executor",
    schedule: "*/5 * * * *",
    category: "operations",
    description: "Execute approved interventions",
  },
  {
    name: "outbound-monitor",
    schedule: "*/10 * * * *",
    category: "operations",
    description: "Monitor outbound calls",
  },
  {
    name: "voice-transcription",
    schedule: "*/5 * * * *",
    category: "operations",
    description: "Process voice transcriptions",
  },
  {
    name: "goal-progress",
    schedule: "0 22 * * *",
    category: "operations",
    description: "Track goal progress",
  },

  // Business
  {
    name: "admin-metrics",
    schedule: "0 0 * * *",
    category: "business",
    description: "Admin dashboard metrics",
  },
  {
    name: "business-metrics",
    schedule: "0 1 * * *",
    category: "business",
    description: "Business KPIs",
  },
  {
    name: "drip-engine",
    schedule: "*/30 * * * *",
    category: "business",
    description: "Drip campaign engine",
  },
  {
    name: "dunning",
    schedule: "0 8 * * *",
    category: "business",
    description: "Payment dunning",
  },
  {
    name: "master-scheduler",
    schedule: "0 0 * * *",
    category: "operations",
    description: "Master CRON scheduler",
  },

  // Health monitoring
  {
    name: "system-report",
    schedule: "*/15 * * * *",
    category: "health",
    description: "Active health checks + user alerting",
  },
];

/** Gateway adapters for multi-channel messaging */
const GATEWAY_ADAPTERS = [
  { name: "telegram", category: "messaging", description: "Telegram Bot API" },
  { name: "slack", category: "messaging", description: "Slack Events API" },
  {
    name: "discord",
    category: "messaging",
    description: "Discord Bot (Ed25519)",
  },
  { name: "signal", category: "messaging", description: "Signal Messenger" },
  {
    name: "imessage",
    category: "messaging",
    description: "iMessage (via bridge)",
  },
  {
    name: "whatsapp",
    category: "messaging",
    description: "WhatsApp via Meta API",
  },
  { name: "web_chat", category: "core", description: "Web chat (SSE)" },
  { name: "voice", category: "core", description: "Twilio ConversationRelay" },
  { name: "sms", category: "messaging", description: "SMS via Twilio" },
  {
    name: "email_inbound",
    category: "messaging",
    description: "Email → IORS pipeline",
  },
];

// ============================================================================
// MANIFEST GENERATION
// ============================================================================

/**
 * Generate complete system manifest with live health data.
 * Runs ~10 parallel queries for health status.
 */
export async function generateSystemManifest(
  tenantId?: string,
): Promise<SystemManifest> {
  const supabase = getServiceSupabase();
  const now = new Date();
  const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Parallel health queries
  const [cronRuns, toolExecs, integrationHealth, generatedApps, dynamicTools] =
    await Promise.all([
      // Recent CRON runs
      supabase
        .from("admin_cron_runs")
        .select("cron_name, status, started_at, error_message")
        .gte("started_at", h24ago)
        .order("started_at", { ascending: false })
        .limit(500),

      // Tool execution stats (last 24h)
      supabase
        .from("exo_tool_executions")
        .select("tool_name, success")
        .gte("created_at", h24ago)
        .limit(2000),

      // Integration health
      tenantId
        ? supabase
            .from("exo_integration_health")
            .select("*")
            .eq("tenant_id", tenantId)
        : supabase.from("exo_integration_health").select("*").limit(100),

      // Generated apps
      tenantId
        ? supabase
            .from("exo_generated_apps")
            .select("slug, name, status, last_used_at, table_name")
            .eq("tenant_id", tenantId)
        : supabase
            .from("exo_generated_apps")
            .select("slug, name, status, last_used_at, table_name")
            .limit(100),

      // Dynamic tools
      tenantId
        ? supabase
            .from("exo_dynamic_tools")
            .select("name, description, enabled")
            .eq("tenant_id", tenantId)
        : supabase
            .from("exo_dynamic_tools")
            .select("name, description, enabled")
            .limit(100),
    ]);

  // -- Build CRON status map --
  const cronStatusMap = new Map<
    string,
    { status: "active" | "degraded" | "down"; lastRun?: string; error?: string }
  >();
  for (const run of cronRuns.data || []) {
    if (!cronStatusMap.has(run.cron_name)) {
      cronStatusMap.set(run.cron_name, {
        status: run.status === "failed" ? "degraded" : "active",
        lastRun: run.started_at,
        error: run.error_message || undefined,
      });
    }
  }

  const cronEntries: ComponentEntry[] = CRON_CATALOG.map((c) => {
    const health = cronStatusMap.get(c.name);
    return {
      name: c.name,
      type: "cron" as const,
      status: health?.status || "unknown",
      category: c.category,
      description: c.description,
      lastCheckAt: health?.lastRun,
      details: {
        schedule: c.schedule,
        error: health?.error,
      },
    };
  });

  // -- Build tool success rate map --
  const toolStats = new Map<string, { total: number; failures: number }>();
  for (const exec of toolExecs.data || []) {
    const existing = toolStats.get(exec.tool_name) || { total: 0, failures: 0 };
    existing.total++;
    if (!exec.success) existing.failures++;
    toolStats.set(exec.tool_name, existing);
  }

  const toolEntries: ComponentEntry[] = IORS_EXTENSION_TOOLS.map((t) => {
    const stats = toolStats.get(t.definition.name);
    const failRate = stats ? stats.failures / Math.max(stats.total, 1) : 0;
    return {
      name: t.definition.name,
      type: "iors_tool" as const,
      status: failRate > 0.5 ? "down" : failRate > 0.2 ? "degraded" : "active",
      category: getCategoryFromToolName(t.definition.name),
      description: t.definition.description?.slice(0, 100),
      details: stats
        ? {
            total24h: stats.total,
            failures24h: stats.failures,
            failRate: Math.round(failRate * 100),
          }
        : undefined,
    };
  });

  // -- Canvas widgets (always active — they're UI components) --
  const widgetEntries: ComponentEntry[] = Object.values(WIDGET_REGISTRY).map(
    (w) => ({
      name: w.type,
      type: "canvas_widget" as const,
      status: "active" as const,
      category: w.category,
      description: w.label,
    }),
  );

  // -- Integrations --
  const integrationEntries: ComponentEntry[] = (
    integrationHealth.data || []
  ).map((i: Record<string, unknown>) => ({
    name: (i.provider as string) || "unknown",
    type: "integration" as const,
    status: (i.status as "active" | "degraded" | "down") || "unknown",
    category: "integration",
    lastCheckAt: i.last_check_at as string | undefined,
    details: {
      error: i.last_error,
      connected_at: i.connected_at,
    },
  }));

  // -- Generated apps --
  const appEntries: ComponentEntry[] = (generatedApps.data || []).map(
    (a: Record<string, unknown>) => ({
      name: a.slug as string,
      type: "generated_app" as const,
      status:
        (a.status as string) === "active"
          ? ("active" as const)
          : ("down" as const),
      category: "app",
      description: a.name as string,
      details: {
        table_name: a.table_name,
        last_used_at: a.last_used_at,
      },
    }),
  );

  // -- Dynamic tools --
  const dynamicToolEntries: ComponentEntry[] = (dynamicTools.data || []).map(
    (d: Record<string, unknown>) => ({
      name: d.name as string,
      type: "dynamic_tool" as const,
      status: d.enabled ? ("active" as const) : ("down" as const),
      category: "dynamic",
      description: (d.description as string)?.slice(0, 100),
    }),
  );

  // -- Gateway adapters (static, assume active) --
  const adapterEntries: ComponentEntry[] = GATEWAY_ADAPTERS.map((a) => ({
    name: a.name,
    type: "gateway_adapter" as const,
    status: "active" as const,
    category: a.category,
    description: a.description,
  }));

  // -- Summary --
  const allComponents = [
    ...cronEntries,
    ...toolEntries,
    ...widgetEntries,
    ...integrationEntries,
    ...appEntries,
    ...dynamicToolEntries,
    ...adapterEntries,
  ];

  const summary = {
    active: allComponents.filter((c) => c.status === "active").length,
    degraded: allComponents.filter((c) => c.status === "degraded").length,
    down: allComponents.filter((c) => c.status === "down").length,
    unknown: allComponents.filter((c) => c.status === "unknown").length,
  };

  return {
    generatedAt: now.toISOString(),
    totalComponents: allComponents.length,
    components: {
      crons: cronEntries,
      iorsTools: toolEntries,
      canvasWidgets: widgetEntries,
      integrations: integrationEntries,
      generatedApps: appEntries,
      dynamicTools: dynamicToolEntries,
      gatewayAdapters: adapterEntries,
    },
    summary,
  };
}

/**
 * Generate a concise text summary for IORS system prompt context.
 * Keeps it under 500 chars so it doesn't bloat the prompt.
 */
export async function getManifestSummaryForPrompt(
  tenantId?: string,
): Promise<string> {
  try {
    const manifest = await generateSystemManifest(tenantId);
    const { summary, components } = manifest;

    const degradedCrons = components.crons
      .filter((c) => c.status !== "active")
      .map((c) => c.name);
    const failingTools = components.iorsTools
      .filter((t) => t.status === "degraded" || t.status === "down")
      .map((t) => t.name);
    const downIntegrations = components.integrations
      .filter((i) => i.status === "down")
      .map((i) => i.name);

    const lines = [
      `System: ${manifest.totalComponents} komponentow (${summary.active} ok, ${summary.degraded} degraded, ${summary.down} down)`,
      `CRONs: ${components.crons.length} (${degradedCrons.length > 0 ? `problemy: ${degradedCrons.slice(0, 3).join(", ")}` : "wszystkie ok"})`,
      `Tools: ${components.iorsTools.length} IORS + ${components.dynamicTools.length} dynamic`,
      `Widgets: ${components.canvasWidgets.length}, Apps: ${components.generatedApps.length}`,
      `Kanaly: ${components.gatewayAdapters.length} adapterow`,
    ];

    if (failingTools.length > 0) {
      lines.push(`Failing tools: ${failingTools.slice(0, 5).join(", ")}`);
    }
    if (downIntegrations.length > 0) {
      lines.push(`Down integrations: ${downIntegrations.join(", ")}`);
    }

    return lines.join("\n");
  } catch (error) {
    logger.error("[SystemManifest] Summary generation failed:", {
      error: error instanceof Error ? error.message : error,
    });
    return "System manifest unavailable";
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getCategoryFromToolName(name: string): string {
  if (name.startsWith("composio_")) return "integration";
  if (name.includes("email")) return "email";
  if (name.includes("knowledge") || name.includes("search_"))
    return "knowledge";
  if (name.includes("canvas") || name.includes("widget")) return "canvas";
  if (name.includes("task") || name.includes("quest") || name.includes("goal"))
    return "productivity";
  if (name.includes("mod") || name.includes("skill")) return "skills";
  if (name.includes("emotion") || name.includes("crisis")) return "wellbeing";
  if (name.includes("call") || name.includes("sms") || name.includes("send_"))
    return "communication";
  if (name.includes("ralph") || name.includes("dev_journal"))
    return "self_development";
  if (name.includes("app") || name.includes("build")) return "app_builder";
  if (name.includes("web") || name.includes("fetch")) return "web";
  if (name.includes("value") || name.includes("area")) return "values";
  if (name.includes("code") || name.includes("generate")) return "code_gen";
  return "other";
}
