/**
 * Dynamic Context Builder
 *
 * Builds the dynamic portion of the IORS system prompt based on tenant data.
 * Queries: profile, tasks, mods, personality, thread history, goals, skill suggestions.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { getThreadSummary } from "../unified-thread";
import { getPendingSuggestions } from "../skills/detector";

import { logger } from "@/lib/logger";
/**
 * Build dynamic context string for the IORS system prompt.
 * Runs 6+ DB queries in parallel where possible.
 */
export async function buildDynamicContext(tenantId: string): Promise<string> {
  const supabase = getServiceSupabase();

  // Get user profile
  const { data: tenant } = await supabase
    .from("exo_tenants")
    .select(
      "name, preferred_name, communication_style, iors_personality, iors_name",
    )
    .eq("id", tenantId)
    .single();

  // Get pending tasks count
  const { count: taskCount } = await supabase
    .from("exo_tasks")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "pending");

  // Get current time in Polish format
  const now = new Date();
  const timeString = now.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayOfWeek = now.toLocaleDateString("pl-PL", { weekday: "long" });

  // Get installed mods
  const { data: mods } = await supabase
    .from("exo_tenant_mods")
    .select("mod_id, exo_mod_registry(slug, name)")
    .eq("tenant_id", tenantId)
    .eq("active", true);

  // Build context
  let context = `\n\n## AKTUALNY KONTEKST\n`;
  context += `- Czas: ${dayOfWeek}, ${timeString}\n`;

  if (tenant?.preferred_name || tenant?.name) {
    const userName = tenant.preferred_name || tenant.name;
    context += `- Uzytkownik: ${userName} (UZYWAJ IMIENIA w rozmowie)\n`;
  }

  if (tenant?.communication_style) {
    context += `- Styl komunikacji: ${tenant.communication_style}\n`;
  }

  context += `- Aktywne zadania: ${taskCount || 0}\n`;

  if (mods && mods.length > 0) {
    const modList = mods
      .map((m) => {
        const reg = m.exo_mod_registry;
        if (Array.isArray(reg)) return reg[0]?.slug || "unknown";
        return "unknown";
      })
      .join(", ");
    context += `- Zainstalowane Mody: ${modList}\n`;
  }

  // IORS Personality — dynamic prompt fragment based on user preferences
  try {
    const { getPersonalityPromptFragment } =
      await import("@/lib/iors/personality");
    const personalityFragment = getPersonalityPromptFragment(
      (tenant as Record<string, unknown>)?.iors_personality ?? null,
    );
    if (personalityFragment) {
      context += personalityFragment;
    }
  } catch (err) {
    logger.warn(
      "[DynamicContext] Personality fragment failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // Cross-channel conversation summary
  try {
    const threadSummary = await getThreadSummary(tenantId);
    if (threadSummary && threadSummary !== "Brak historii rozmow.") {
      context += `- Historia rozmow: ${threadSummary}\n`;
    }
  } catch (err) {
    logger.warn(
      "[DynamicContext] Thread summary failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // Active goals status
  try {
    const { getGoalStatus } = await import("../goals/engine");
    const goalStatuses = await getGoalStatus(tenantId);
    if (goalStatuses.length > 0) {
      context += `\n## CELE UŻYTKOWNIKA\n`;
      for (const s of goalStatuses) {
        const status =
          s.trajectory === "on_track"
            ? "na dobrej drodze"
            : s.trajectory === "at_risk"
              ? "ZAGROŻONY"
              : s.trajectory === "completed"
                ? "OSIĄGNIĘTY"
                : "WYMAGA UWAGI";
        const days =
          s.days_remaining !== null ? `, ${s.days_remaining} dni` : "";
        context += `- ${s.goal.name}: ${Math.round(s.progress_percent)}% [${status}]${days}\n`;
      }
      context += `Gdy user pyta o cele, użyj "check_goals". Gdy raportuje postęp, użyj "log_goal_progress".\n`;
    }
  } catch (err) {
    logger.warn(
      "[DynamicContext] Goal status fetch failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // Pending skill suggestions (from Need Detector)
  try {
    const suggestions = await getPendingSuggestions(tenantId, 3);
    if (suggestions.length > 0) {
      context += `\n## SUGESTIE NOWYCH UMIEJĘTNOŚCI\n`;
      context += `System wykrył potrzeby użytkownika. Naturalnie zaproponuj te skille gdy pasuje do rozmowy:\n`;
      for (const s of suggestions) {
        context += `- [${s.source}] ${s.description} (pewność: ${Math.round(s.confidence * 100)}%) | ID: ${s.id}\n`;
      }
      context += `Gdy użytkownik się zgodzi, użyj narzędzia "accept_skill_suggestion" z ID sugestii.\n`;
      context += `Gdy odmówi, użyj "dismiss_skill_suggestion". NIE naciskaj - zaproponuj raz, naturalnie.\n`;
    }
  } catch (err) {
    logger.warn(
      "[DynamicContext] Skill suggestions fetch failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return context;
}
