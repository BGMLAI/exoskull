// =====================================================
// LIFECYCLE MANAGER - Archive unused skills
// Called by cron job: /api/cron/skill-lifecycle
// =====================================================

import { createClient } from "@supabase/supabase-js";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Archive skills unused for the specified number of days.
 * Uses the DB function archive_unused_skills() which handles the query.
 */
export async function archiveUnusedSkills(
  daysThreshold: number = 30,
): Promise<{ archivedCount: number; error?: string }> {
  try {
    const supabase = getServiceSupabase();

    const { data, error } = await supabase.rpc("archive_unused_skills", {
      days_threshold: daysThreshold,
    });

    if (error) {
      console.error("[LifecycleManager] Archive error:", error);
      return { archivedCount: 0, error: error.message };
    }

    const archivedCount = typeof data === "number" ? data : 0;

    if (archivedCount > 0) {
      console.log(
        `[LifecycleManager] Archived ${archivedCount} unused skills (>${daysThreshold} days)`,
      );
    }

    return { archivedCount };
  } catch (error) {
    console.error("[LifecycleManager] Error:", error);
    return { archivedCount: 0, error: (error as Error).message };
  }
}

/**
 * Get statistics about skill usage across all tenants
 */
export async function getSkillStats(): Promise<{
  total: number;
  active: number;
  pending: number;
  archived: number;
}> {
  try {
    const supabase = getServiceSupabase();

    const [totalRes, activeRes, pendingRes, archivedRes] = await Promise.all([
      supabase
        .from("exo_generated_skills")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("exo_generated_skills")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "approved")
        .is("archived_at", null),
      supabase
        .from("exo_generated_skills")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending"),
      supabase
        .from("exo_generated_skills")
        .select("id", { count: "exact", head: true })
        .not("archived_at", "is", null),
    ]);

    return {
      total: totalRes.count || 0,
      active: activeRes.count || 0,
      pending: pendingRes.count || 0,
      archived: archivedRes.count || 0,
    };
  } catch (error) {
    console.error("[LifecycleManager] Stats error:", error);
    return { total: 0, active: 0, pending: 0, archived: 0 };
  }
}
