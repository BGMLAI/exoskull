/**
 * Dynamic Context Builder
 *
 * Builds the dynamic portion of the IORS system prompt based on tenant data.
 * Queries: profile, tasks, mods, personality, thread history, goals, skill suggestions.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { getThreadSummary } from "../unified-thread";
import { getPendingSuggestions } from "../skills/detector";
import { listConnections } from "@/lib/integrations/composio-adapter";

import { logger } from "@/lib/logger";
/** Per-provider configuration stored in iors_ai_config.providers */
export interface ProviderConfig {
  api_key?: string;
  enabled?: boolean;
  model?: string; // e.g. "gpt-4o" for OpenAI
}

/** Per-user AI configuration from iors_ai_config JSONB */
export interface TenantAIConfig {
  temperature: number;
  tts_speed: number;
  tts_voice_id: string | null;
  model_preferences: {
    chat: string;
    analysis: string;
    coding: string;
    creative: string;
    crisis: string;
  };
  permissions: Record<string, { with_approval: boolean; autonomous: boolean }>;
  providers?: {
    anthropic?: ProviderConfig;
    openai?: ProviderConfig;
    gemini?: ProviderConfig;
  };
  default_provider?: "anthropic" | "openai" | "gemini";
}

/** Result from buildDynamicContext — includes context string + per-user overrides */
export interface DynamicContextResult {
  context: string;
  systemPromptOverride: string | null;
  aiConfig: TenantAIConfig | null;
}

const DEFAULT_AI_CONFIG: TenantAIConfig = {
  temperature: 0.7,
  tts_speed: 1.0,
  tts_voice_id: null,
  model_preferences: {
    chat: "auto",
    analysis: "auto",
    coding: "auto",
    creative: "auto",
    crisis: "auto",
  },
  permissions: {},
  providers: {
    anthropic: { enabled: true },
    openai: { enabled: true },
    gemini: { enabled: true },
  },
  default_provider: "anthropic",
};

/**
 * Build dynamic context string for the IORS system prompt.
 * Runs 6+ DB queries in parallel where possible.
 * Returns context string + system prompt override + AI config for per-user customization.
 */
export async function buildDynamicContext(
  tenantId: string,
): Promise<DynamicContextResult> {
  const supabase = getServiceSupabase();
  const startTime = Date.now();

  // ── ALL queries in parallel (was sequential = ~700ms, now ~150ms) ──
  const [
    tenantResult,
    taskResult,
    modsResult,
    threadResult,
    goalsResult,
    suggestionsResult,
    docsResult,
    connectionsResult,
  ] = await Promise.allSettled([
    // 1. User profile + custom instructions + presets + AI config + prompt override
    supabase
      .from("exo_tenants")
      .select(
        "name, preferred_name, communication_style, iors_personality, iors_name, iors_custom_instructions, iors_behavior_presets, iors_system_prompt_override, iors_ai_config",
      )
      .eq("id", tenantId)
      .single(),
    // 2. Pending tasks count
    supabase
      .from("exo_tasks")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending"),
    // 3. Installed mods
    supabase
      .from("exo_tenant_mods")
      .select("mod_id, exo_mod_registry(slug, name)")
      .eq("tenant_id", tenantId)
      .eq("active", true),
    // 4. Thread summary
    getThreadSummary(tenantId).catch(() => null),
    // 5. Goal statuses
    import("../goals/engine")
      .then(({ getGoalStatus }) => getGoalStatus(tenantId))
      .catch(() => []),
    // 6. Skill suggestions
    getPendingSuggestions(tenantId, 3).catch(() => []),
    // 7. Knowledge base document count
    supabase
      .from("exo_user_documents")
      .select("status", { count: "exact" })
      .eq("tenant_id", tenantId),
    // 8. Composio connected integrations
    listConnections(tenantId).catch(() => []),
  ]);

  // ── Extract results safely ──
  const tenant =
    tenantResult.status === "fulfilled" ? tenantResult.value.data : null;
  const taskCount =
    taskResult.status === "fulfilled" ? taskResult.value.count : 0;
  const mods = modsResult.status === "fulfilled" ? modsResult.value.data : null;
  const threadSummary =
    threadResult.status === "fulfilled" ? threadResult.value : null;
  const goalStatuses =
    goalsResult.status === "fulfilled"
      ? (goalsResult.value as Array<{
          trajectory: string;
          progress_percent: number;
          days_remaining: number | null;
          goal: { name: string };
        }>)
      : [];
  const suggestions =
    suggestionsResult.status === "fulfilled"
      ? (suggestionsResult.value as Array<{
          id: string;
          source: string;
          description: string;
          confidence: number;
        }>)
      : [];
  const docsData = docsResult.status === "fulfilled" ? docsResult.value : null;
  const connections =
    connectionsResult.status === "fulfilled"
      ? (connectionsResult.value as Array<{ toolkit: string; status: string }>)
      : [];

  // ── Build context string ──
  const now = new Date();
  const timeString = now.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayOfWeek = now.toLocaleDateString("pl-PL", { weekday: "long" });

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
    context += `- Zainstalowane trackery: ${modList}\n`;
  }

  // IORS Personality + Custom Instructions + Behavior Presets
  try {
    const {
      getPersonalityPromptFragment,
      getBehaviorPresetsFragment,
      getCustomInstructionsFragment,
    } = await import("@/lib/iors/personality");
    const personalityFragment = getPersonalityPromptFragment(
      (tenant as Record<string, unknown>)?.iors_personality ?? null,
    );
    if (personalityFragment) {
      context += personalityFragment;
    }
    // Behavior presets
    const presetsFragment = getBehaviorPresetsFragment(
      (tenant as Record<string, unknown>)?.iors_behavior_presets as
        | string[]
        | null,
    );
    if (presetsFragment) {
      context += presetsFragment;
    }
    // Custom instructions (highest priority)
    const instructionsFragment = getCustomInstructionsFragment(
      (tenant as Record<string, unknown>)?.iors_custom_instructions as
        | string
        | null,
    );
    if (instructionsFragment) {
      context += instructionsFragment;
    }
  } catch (err) {
    logger.warn(
      "[DynamicContext] Personality fragment failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // Thread summary
  if (threadSummary && threadSummary !== "Brak historii rozmow.") {
    context += `- Historia rozmow: ${threadSummary}\n`;
  }

  // Goals
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
      const days = s.days_remaining !== null ? `, ${s.days_remaining} dni` : "";
      context += `- ${s.goal.name}: ${Math.round(s.progress_percent)}% [${status}]${days}\n`;
    }
    context += `Gdy user pyta o cele, użyj "check_goals". Gdy raportuje postęp, użyj "log_goal_progress".\n`;
  }

  // Knowledge base
  if (docsData && "count" in docsData && (docsData.count ?? 0) > 0) {
    const totalDocs = docsData.count ?? 0;
    const readyDocs = (docsData.data ?? []).filter(
      (d: { status: string }) => d.status === "ready",
    ).length;
    context += `- Baza wiedzy: ${totalDocs} dokumentow (${readyDocs} gotowych do przeszukania)\n`;
    context += `  → Gdy user pyta o COKOLWIEK co mogl wgrac w plikach, ZAWSZE uzyj "search_knowledge" ZANIM powiesz "nie wiem".\n`;
  }

  // Connected integrations (Composio)
  if (connections.length > 0) {
    const connList = connections.map((c) => c.toolkit).join(", ");
    context += `- Podlaczone integracje: ${connList}\n`;
    context += `  → Mozesz uzywac tych uslug (np. wyslij email przez Gmail, sprawdz kalendarz). Uzyj "composio_action".\n`;
  }

  // Skill suggestions
  if (suggestions.length > 0) {
    context += `\n## SUGESTIE NOWYCH UMIEJĘTNOŚCI\n`;
    context += `System wykrył potrzeby użytkownika. Naturalnie zaproponuj te skille gdy pasuje do rozmowy:\n`;
    for (const s of suggestions) {
      context += `- [${s.source}] ${s.description} (pewność: ${Math.round(s.confidence * 100)}%) | ID: ${s.id}\n`;
    }
    context += `Gdy użytkownik się zgodzi, użyj narzędzia "accept_skill_suggestion" z ID sugestii.\n`;
    context += `Gdy odmówi, użyj "dismiss_skill_suggestion". NIE naciskaj - zaproponuj raz, naturalnie.\n`;
  }

  // Extract system prompt override + AI config from tenant
  const systemPromptOverride =
    ((tenant as Record<string, unknown>)?.iors_system_prompt_override as
      | string
      | null) ?? null;
  const rawAiConfig = (tenant as Record<string, unknown>)?.iors_ai_config;
  const aiConfig: TenantAIConfig =
    rawAiConfig && typeof rawAiConfig === "object"
      ? { ...DEFAULT_AI_CONFIG, ...(rawAiConfig as Partial<TenantAIConfig>) }
      : DEFAULT_AI_CONFIG;

  logger.info(`[DynamicContext] Built in ${Date.now() - startTime}ms`);
  return { context, systemPromptOverride, aiConfig };
}

/**
 * Lightweight voice context — only tenant profile + task count.
 * Skips: goals, suggestions, connections, docs, mods, thread summary.
 * Cuts pre-Claude latency from ~1-3s to ~200ms.
 */
export async function buildVoiceContext(
  tenantId: string,
): Promise<DynamicContextResult> {
  const supabase = getServiceSupabase();
  const startTime = Date.now();

  // 3 queries (vs 8 in full context) — added thread summary for cross-channel awareness
  const [tenantResult, taskResult, threadSummaryResult] =
    await Promise.allSettled([
      supabase
        .from("exo_tenants")
        .select(
          "name, preferred_name, communication_style, iors_personality, iors_name, iors_custom_instructions, iors_ai_config",
        )
        .eq("id", tenantId)
        .single(),
      supabase
        .from("exo_tasks")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending"),
      getThreadSummary(tenantId),
    ]);

  const tenant =
    tenantResult.status === "fulfilled" ? tenantResult.value.data : null;
  const taskCount =
    taskResult.status === "fulfilled" ? taskResult.value.count : 0;

  const now = new Date();
  const timeString = now.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayOfWeek = now.toLocaleDateString("pl-PL", { weekday: "long" });

  let context = `\n\n## AKTUALNY KONTEKST\n`;
  context += `- Czas: ${dayOfWeek}, ${timeString}\n`;

  if (tenant?.preferred_name || tenant?.name) {
    context += `- Uzytkownik: ${tenant.preferred_name || tenant.name} (UZYWAJ IMIENIA)\n`;
  }

  if (tenant?.communication_style) {
    context += `- Styl: ${tenant.communication_style}\n`;
  }

  context += `- Zadania: ${taskCount || 0}\n`;

  // Thread summary — cross-channel awareness (what happened in chat, SMS, etc.)
  const threadSummary =
    threadSummaryResult.status === "fulfilled"
      ? threadSummaryResult.value
      : null;
  if (threadSummary && threadSummary !== "Brak historii rozmow.") {
    context += `- Historia: ${threadSummary}\n`;
  }

  context += `- Kanal: ROZMOWA GLOSOWA. Odpowiadaj KROTKO (1-2 zdania). Unikaj list, markdown, emoji.\n`;
  context += `- WAZNE: Masz kontekst z WSZYSTKICH kanalow (chat, SMS, email). Odwoluj sie do nich naturalnie.\n`;

  // Custom instructions (highest priority)
  const customInstructions = (tenant as Record<string, unknown>)
    ?.iors_custom_instructions as string | null;
  if (customInstructions) {
    context += `\n## INSTRUKCJE UZYTKOWNIKA\n${customInstructions}\n`;
  }

  const rawAiConfig = (tenant as Record<string, unknown>)?.iors_ai_config;
  const aiConfig: TenantAIConfig =
    rawAiConfig && typeof rawAiConfig === "object"
      ? { ...DEFAULT_AI_CONFIG, ...(rawAiConfig as Partial<TenantAIConfig>) }
      : DEFAULT_AI_CONFIG;

  logger.info(`[VoiceContext] Built in ${Date.now() - startTime}ms`);
  return { context, systemPromptOverride: null, aiConfig };
}
