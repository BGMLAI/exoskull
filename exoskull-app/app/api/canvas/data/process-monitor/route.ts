/**
 * Canvas Process Monitor Data API
 *
 * GET /api/canvas/data/process-monitor
 * Returns active processes, recent completed, and system stats
 * for the ProcessMonitorWidget.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";
import { systemBus } from "@/lib/system/inter-system-bus";

export const dynamic = "force-dynamic";

interface ProcessInfo {
  id: string;
  name: string;
  type:
    | "ralph_loop"
    | "agent_swarm"
    | "atlas_pipeline"
    | "gotcha_cycle"
    | "health_check"
    | "self_build";
  status: "running" | "completed" | "failed" | "idle";
  progress?: string;
  startedAt?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const serviceDb = getServiceSupabase();
    const now = new Date();
    const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const h2ago = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    // Parallel queries
    const [recentJournal, systemEvents, devJournalCounts] = await Promise.all([
      // Recent dev journal entries (active + recently completed)
      serviceDb
        .from("exo_dev_journal")
        .select("id, entry_type, title, outcome, details, created_at, metadata")
        .eq("tenant_id", tenantId)
        .gte("created_at", h2ago)
        .order("created_at", { ascending: false })
        .limit(20),

      // System events for process tracking
      serviceDb
        .from("exo_system_events")
        .select("id, event_type, component, message, details, created_at")
        .gte("created_at", h2ago)
        .order("created_at", { ascending: false })
        .limit(30),

      // 24h counts by type
      serviceDb
        .from("exo_dev_journal")
        .select("entry_type")
        .eq("tenant_id", tenantId)
        .gte("created_at", h24ago),
    ]);

    // Build active processes from journal entries
    const activeProcesses: ProcessInfo[] = [];
    const recentCompleted: ProcessInfo[] = [];

    for (const entry of recentJournal.data || []) {
      const entryType = entry.entry_type as string;
      const outcome = entry.outcome as string;
      const details = entry.details as Record<string, unknown> | null;
      const metadata = entry.metadata as Record<string, unknown> | null;
      const createdAt = entry.created_at as string;

      const processType = mapEntryTypeToProcess(entryType);
      if (!processType) continue;

      const startTime = new Date(createdAt).getTime();
      const durationMs = now.getTime() - startTime;

      const process: ProcessInfo = {
        id: entry.id as string,
        name: (entry.title as string) || entryType,
        type: processType,
        status: mapOutcomeToStatus(outcome),
        progress: extractProgress(details, metadata),
        startedAt: createdAt,
        durationMs: outcome === "pending" ? undefined : durationMs,
        details: details || undefined,
      };

      if (outcome === "pending") {
        activeProcesses.push(process);
      } else {
        recentCompleted.push(process);
      }
    }

    // Add running system events as active processes
    for (const event of systemEvents.data || []) {
      const component = event.component as string;
      if (
        component === "ralph_loop" ||
        component === "agent_swarm" ||
        component === "atlas_pipeline"
      ) {
        const eventType = event.event_type as string;
        if (
          eventType.includes("started") &&
          !activeProcesses.some(
            (p) => p.type === mapComponentToProcess(component),
          )
        ) {
          activeProcesses.push({
            id: event.id as string,
            name: (event.message as string) || component,
            type: mapComponentToProcess(component),
            status: "running",
            startedAt: event.created_at as string,
            progress: (event.details as Record<string, unknown>)?.progress as
              | string
              | undefined,
          });
        }
      }
    }

    // Calculate 24h stats
    const journalEntries = devJournalCounts.data || [];
    const ralphCycles24h = journalEntries.filter(
      (e) =>
        (e.entry_type as string) === "build" ||
        (e.entry_type as string) === "fix",
    ).length;
    const swarmSessions24h = journalEntries.filter(
      (e) => (e.entry_type as string) === "swarm_session",
    ).length;
    const atlasPipelines24h = journalEntries.filter(
      (e) => (e.entry_type as string) === "atlas_pipeline",
    ).length;
    const selfBuildActions24h = journalEntries.filter(
      (e) => (e.entry_type as string) === "self_build",
    ).length;

    // Get bus stats
    const busStats = systemBus.getStats();

    return NextResponse.json({
      activeProcesses: activeProcesses.slice(0, 10),
      recentCompleted: recentCompleted.slice(0, 10),
      systemStats: {
        ralphCycles24h,
        swarmSessions24h,
        atlasPipelines24h,
        selfBuildActions24h,
        busEventsTotal: busStats.totalEvents,
      },
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[ProcessMonitor] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function mapEntryTypeToProcess(entryType: string): ProcessInfo["type"] | null {
  switch (entryType) {
    case "build":
    case "fix":
    case "plan":
    case "experiment":
      return "ralph_loop";
    case "swarm_session":
      return "agent_swarm";
    case "atlas_pipeline":
      return "atlas_pipeline";
    case "self_build":
      return "self_build";
    default:
      return null;
  }
}

function mapComponentToProcess(component: string): ProcessInfo["type"] {
  switch (component) {
    case "ralph_loop":
      return "ralph_loop";
    case "agent_swarm":
      return "agent_swarm";
    case "atlas_pipeline":
      return "atlas_pipeline";
    case "health_checker":
      return "health_check";
    case "self_builder":
      return "self_build";
    default:
      return "ralph_loop";
  }
}

function mapOutcomeToStatus(outcome: string): ProcessInfo["status"] {
  switch (outcome) {
    case "pending":
      return "running";
    case "success":
      return "completed";
    case "failed":
      return "failed";
    case "skipped":
      return "idle";
    default:
      return "completed";
  }
}

function extractProgress(
  details: Record<string, unknown> | null,
  metadata: Record<string, unknown> | null,
): string | undefined {
  if (metadata?.progress) return String(metadata.progress);
  if (details?.result) return String(details.result).slice(0, 100);
  if (details?.action_type) return `Action: ${details.action_type}`;
  return undefined;
}
