/**
 * POST /api/swarm/execute
 *
 * Trigger an agent swarm on-demand.
 * Body: { swarmType: "morning_checkin" | "gap_detection" | "weekly_review" }
 * Auth: Supabase session (tenant_id from JWT)
 *
 * Rate limited: 1 swarm per 15 minutes per tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  executeSwarm,
  getSwarmDefinition,
  collectSwarmContext,
  SWARM_DEFINITIONS,
} from "@/lib/ai/swarm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Simple in-memory rate limit (per-process, resets on redeploy)
const lastExecution: Map<string, number> = new Map();
const RATE_LIMIT_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(req: NextRequest) {
  try {
    // Auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = user.id;

    // Parse body
    const body = await req.json();
    const swarmType = body.swarmType as string;

    if (!swarmType || !SWARM_DEFINITIONS[swarmType]) {
      return NextResponse.json(
        {
          error: "Invalid swarmType",
          valid: Object.keys(SWARM_DEFINITIONS),
        },
        { status: 400 },
      );
    }

    // Rate limit
    const rateKey = `${tenantId}:${swarmType}`;
    const lastRun = lastExecution.get(rateKey);
    if (lastRun && Date.now() - lastRun < RATE_LIMIT_MS) {
      const waitSec = Math.ceil(
        (RATE_LIMIT_MS - (Date.now() - lastRun)) / 1000,
      );
      return NextResponse.json(
        { error: `Rate limited. Try again in ${waitSec}s.` },
        { status: 429 },
      );
    }

    lastExecution.set(rateKey, Date.now());

    // Service client for data collection (bypasses RLS)
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Collect context
    const context = await collectSwarmContext(
      serviceSupabase,
      tenantId,
      swarmType,
    );

    // Get definition and execute
    const definition = getSwarmDefinition(swarmType)!;
    const result = await executeSwarm(definition, context);

    // Store result in learning_events
    await serviceSupabase.from("learning_events").insert({
      tenant_id: tenantId,
      event_type: "swarm_analysis",
      data: {
        swarmType,
        synthesis: result.synthesis,
        agentsSucceeded: result.agentsSucceeded,
        agentsFailed: result.agentsFailed,
        totalCost: result.totalCost,
        totalLatencyMs: result.totalLatencyMs,
        analyzedAt: new Date().toISOString(),
      },
      agent_id: `swarm:${swarmType}`,
    });

    return NextResponse.json({
      status: "completed",
      swarmType,
      synthesis: result.synthesis,
      agents: {
        succeeded: result.agentsSucceeded,
        failed: result.agentsFailed,
        total: definition.agents.length,
      },
      cost: `$${result.totalCost.toFixed(4)}`,
      latencyMs: result.totalLatencyMs,
    });
  } catch (error) {
    console.error("[Swarm API] Execute failed:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { status: "failed", error: "Swarm execution failed" },
      { status: 500 },
    );
  }
}
