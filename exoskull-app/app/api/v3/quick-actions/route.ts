/**
 * A3: Adaptive Quick Actions — returns goal-based suggestions instead of hardcoded list.
 * Reads user's active goals and generates contextual quick action prompts.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const DEFAULT_ACTIONS = [
  "Co wiesz o mnie?",
  "Jakie mam cele?",
  "Zaplanuj mój tydzień",
];

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ actions: DEFAULT_ACTIONS });
    }
    const { tenantId } = auth;

    const supabase = getServiceSupabase();

    // Get active goals (graph nodes)
    const { data: goals } = await supabase
      .from("nodes")
      .select("name, status")
      .eq("tenant_id", tenantId)
      .eq("type", "goal")
      .in("status", ["active", "in_progress"])
      .limit(5);

    // Get pending tasks (graph nodes)
    const { data: tasks } = await supabase
      .from("nodes")
      .select("name, status")
      .eq("tenant_id", tenantId)
      .eq("type", "task")
      .eq("status", "pending")
      .limit(3);

    const actions: string[] = [];

    // Goal-based actions
    if (goals?.length) {
      actions.push("Jaki jest postęp moich celów?");
      const topGoal = goals[0].name;
      if (topGoal) {
        actions.push(`Co powinienem dziś zrobić dla "${topGoal}"?`);
      }
    } else {
      actions.push("Pomóż mi ustawić cele");
    }

    // Task-based actions
    if (tasks?.length) {
      actions.push(`Mam ${tasks.length} zaległych zadań — pokaż je`);
    } else {
      actions.push("Zaplanuj mój dzień");
    }

    // Always useful
    actions.push("Co nowego się nauczyłeś o mnie?");

    // Cap at 5
    return NextResponse.json({ actions: actions.slice(0, 5) });
  } catch (error) {
    logger.error("[quick-actions] Error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ actions: DEFAULT_ACTIONS });
  }
}
