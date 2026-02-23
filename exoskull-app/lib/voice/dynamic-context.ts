/**
 * Dynamic Context Builder
 *
 * Builds the dynamic portion of the IORS system prompt based on tenant data.
 * Queries: profile, tasks, mods, personality, thread history, goals, skill suggestions.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { getThreadSummary } from "../unified-thread";
import { getPendingSuggestions } from "../skills/detector";
import { getTaskStats } from "@/lib/tasks/task-service";
import {
  getUserHighlights,
  formatHighlightsForPrompt,
} from "@/lib/memory/highlights";
import { getGraphSummary } from "@/lib/memory/knowledge-graph";

import { logger } from "@/lib/logger";

// ============================================================================
// IN-MEMORY CONTEXT CACHE (30s TTL per tenant)
// Eliminates repeated DB queries within same conversation burst.
// Invalidated on write via invalidateContextCache().
// ============================================================================

interface CachedContext {
  result: DynamicContextResult;
  timestamp: number;
}

const CONTEXT_CACHE_TTL_MS = 30_000; // 30 seconds
const contextCache = new Map<string, CachedContext>();

/** Invalidate cached context for a tenant (call after task/goal/setting changes) */
export function invalidateContextCache(tenantId: string): void {
  contextCache.delete(tenantId);
}

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
  // Cache hit — return immediately (~0ms vs ~300-600ms)
  const cached = contextCache.get(tenantId);
  if (cached && Date.now() - cached.timestamp < CONTEXT_CACHE_TTL_MS) {
    logger.info(
      `[DynamicContext] Cache hit for ${tenantId} (age: ${Date.now() - cached.timestamp}ms)`,
    );
    return cached.result;
  }

  const supabase = getServiceSupabase();
  const startTime = Date.now();

  // ── ALL queries in parallel (15 queries, ~150-400ms) ──
  const [
    tenantResult,
    taskResult,
    modsResult,
    threadResult,
    goalsResult,
    suggestionsResult,
    docsResult,
    connectionsResult,
    appsResult,
    proactiveResult,
    memoryResult,
    highlightsResult,
    graphResult,
    recentNotesResult,
    pendingInterventionsResult,
  ] = await Promise.allSettled([
    // 1. User profile + custom instructions + presets + AI config + prompt override
    supabase
      .from("exo_tenants")
      .select(
        "name, preferred_name, communication_style, iors_personality, iors_name, iors_custom_instructions, iors_behavior_presets, iors_system_prompt_override, iors_ai_config",
      )
      .eq("id", tenantId)
      .single(),
    // 2. Pending tasks count (via task-service: dual-read Tyrolka first, legacy fallback)
    getTaskStats(tenantId, supabase).then((s) => ({ count: s.pending })),
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
    // 7. Knowledge base document count (planned = uses index, not full table scan)
    supabase
      .from("exo_user_documents")
      .select("status", { count: "planned" })
      .eq("tenant_id", tenantId),
    // 8. Connected rigs (integrations)
    supabase
      .from("exo_rig_connections")
      .select("rig_slug, sync_status, sync_error, last_sync_at")
      .eq("tenant_id", tenantId)
      .not("access_token", "is", null),
    // 9. Generated apps (self-awareness)
    supabase
      .from("exo_generated_apps")
      .select("slug, name, status, description")
      .eq("tenant_id", tenantId)
      .in("status", ["active", "draft", "pending_approval"])
      .order("created_at", { ascending: false })
      .limit(10),
    // 10. Recent proactive actions (last 24h — what IORS did autonomously)
    supabase
      .from("exo_proactive_log")
      .select("trigger_type, channel, metadata, created_at")
      .eq("tenant_id", tenantId)
      .gte(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      )
      .order("created_at", { ascending: false })
      .limit(10),
    // 11. Memory stats — existence checks (NO count:exact — causes full table scans)
    Promise.all([
      supabase
        .from("exo_daily_summaries")
        .select("summary_date, mood_score")
        .eq("tenant_id", tenantId)
        .order("summary_date", { ascending: false })
        .limit(3),
      supabase
        .from("user_memory_highlights")
        .select("id")
        .eq("user_id", tenantId)
        .limit(1),
      supabase
        .from("exo_unified_messages")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(1),
    ]).catch(() => [null, null, null]),
    // 12. Memory highlights content (top 10 by importance)
    getUserHighlights(supabase, tenantId, 10).catch(() => []),
    // 13. Knowledge graph summary
    getGraphSummary(tenantId).catch(() => ""),
    // 14. Recent notes (last 5)
    supabase
      .from("user_notes")
      .select("title, ai_summary, type, captured_at")
      .eq("tenant_id", tenantId)
      .order("captured_at", { ascending: false })
      .limit(5),
    // 15. Pending interventions awaiting user approval
    supabase
      .from("exo_interventions")
      .select("id, intervention_type, title, description, priority, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "proposed")
      .order("created_at", { ascending: false })
      .limit(5),
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
  const rigConnections =
    connectionsResult.status === "fulfilled"
      ? (connectionsResult.value.data as Array<{
          rig_slug: string;
          sync_status: string | null;
          sync_error: string | null;
          last_sync_at: string | null;
        }> | null)
      : null;
  const apps =
    appsResult.status === "fulfilled"
      ? (appsResult.value.data as Array<{
          slug: string;
          name: string;
          status: string;
          description: string | null;
        }> | null)
      : null;
  const proactiveActions =
    proactiveResult.status === "fulfilled"
      ? (proactiveResult.value.data as Array<{
          trigger_type: string;
          channel: string;
          metadata: Record<string, unknown> | null;
          created_at: string;
        }> | null)
      : null;

  // Extract memory stats (existence checks, not counts)
  const memoryData =
    memoryResult.status === "fulfilled"
      ? (memoryResult.value as [
          {
            data: Array<{
              summary_date: string;
              mood_score: number | null;
            }> | null;
          } | null,
          { data: Array<{ id: string }> | null } | null,
          { data: Array<{ id: string }> | null } | null,
        ])
      : [null, null, null];
  const summariesData = memoryData[0]?.data ?? [];
  const hasHighlights = (memoryData[1]?.data ?? []).length > 0;
  const hasMessages = (memoryData[2]?.data ?? []).length > 0;

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

  // Connected integrations (rigs)
  if (rigConnections && rigConnections.length > 0) {
    context += `\n## POŁĄCZONE INTEGRACJE\n`;
    for (const rig of rigConnections) {
      const statusLabel =
        rig.sync_status === "success"
          ? "OK"
          : rig.sync_status === "error"
            ? "BŁĄD"
            : rig.sync_status === "syncing"
              ? "synchronizacja..."
              : "oczekuje";
      const lastSync = rig.last_sync_at
        ? new Date(rig.last_sync_at).toLocaleString("pl-PL", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "nigdy";
      const errorNote =
        rig.sync_status === "error" && rig.sync_error
          ? ` (${rig.sync_error.slice(0, 60)})`
          : "";
      context += `- ${rig.rig_slug}: [${statusLabel}] ostatni sync: ${lastSync}${errorNote}\n`;
    }
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
    const offTrack = goalStatuses.filter(
      (s) => s.trajectory === "off_track" || s.trajectory === "at_risk",
    );
    context += `\n## CELE UŻYTKOWNIKA (${goalStatuses.length} aktywnych${offTrack.length > 0 ? `, ${offTrack.length} wymaga uwagi` : ""})\n`;
    for (const s of goalStatuses) {
      const status =
        s.trajectory === "on_track"
          ? "na dobrej drodze"
          : s.trajectory === "at_risk"
            ? "ZAGROŻONY"
            : s.trajectory === "completed"
              ? "OSIĄGNIĘTY"
              : s.trajectory === "off_track"
                ? "WYMAGA UWAGI"
                : "brak danych";
      const days = s.days_remaining !== null ? `, ${s.days_remaining} dni` : "";
      const m = (s as Record<string, unknown>).momentum;
      const momentum = m === "up" ? " ↑" : m === "down" ? " ↓" : "";
      context += `- ${s.goal.name}: ${Math.round(s.progress_percent)}% [${status}]${days}${momentum}\n`;
    }
    context += `PRIORYTET: cele zagrożone > cele na dobrej drodze. Proaktywnie proponuj akcje dla celów off-track.\n`;
    context += `Komendy: "check_goals" (status), "log_goal_progress" (postęp), "define_goal" (nowy cel).\n`;
    context += `User może: "wstrzymaj cel X", "zmień termin celu", "pokaż strategię celu X".\n`;
  }

  // Knowledge base — ALWAYS mention tools exist
  context += `\n## Baza wiedzy\n`;
  if (docsData && "count" in docsData && (docsData.count ?? 0) > 0) {
    const totalDocs = docsData.count ?? 0;
    const readyDocs = (docsData.data ?? []).filter(
      (d: { status: string }) => d.status === "ready",
    ).length;
    context += `- Baza wiedzy: ${totalDocs} dokumentow (${readyDocs} gotowych do przeszukania)\n`;
  }
  context += `- ZAWSZE uzyj "search_knowledge" gdy user pyta o dokumenty, pliki, wiedze, lub cokolwiek co mogl wgrac.\n`;
  context += `- Jesli search_knowledge zwraca 0 wynikow, poinformuj usera o statusie dokumentow i zasugeruj ponowne wgranie.\n`;

  // Memory system — daily summaries, highlights, conversation history
  const hasSummaries = summariesData.length > 0;
  if (hasSummaries || hasHighlights || hasMessages) {
    context += `\n## PAMIĘĆ\n`;
    context += `Masz dostęp do pełnej pamięci użytkownika:\n`;
    if (hasMessages) {
      context += `- Historia rozmów: aktywna (wszystkie kanały)\n`;
    }
    if (hasSummaries) {
      const lastDate = summariesData[0]?.summary_date;
      context += `- Podsumowania dzienne: aktywne${lastDate ? ` (ostatnie: ${lastDate})` : ""}\n`;
    }
    if (hasHighlights) {
      context += `- Zapamiętane fakty: aktywne\n`;
    }
    context += `\n→ ZAWSZE gdy user pyta o przeszłość, wspomnienia, "kiedy mówiłem o...", "co robiłem...", "czy pamiętasz..." — użyj "search_memory".\n`;
    context += `→ Gdy user pyta o podsumowanie dnia — użyj "get_daily_summary".\n`;
    context += `→ NIGDY nie mów "nie mam dostępu do pamięci" ani "nie pamiętam". MASZ PAMIĘĆ. Przeszukaj ją.\n`;
  } else {
    // Even with no data yet, tell AI it HAS memory tools
    context += `- Pamięć: aktywna (brak danych — to nowy użytkownik). Narzędzia "search_memory" i "get_daily_summary" dostępne.\n`;
  }

  // Memory highlights (top facts about user, grouped by category)
  const highlights =
    highlightsResult.status === "fulfilled" ? highlightsResult.value : [];
  if (Array.isArray(highlights) && highlights.length > 0) {
    const highlightsPrompt = formatHighlightsForPrompt(highlights);
    if (highlightsPrompt) {
      context += `\n${highlightsPrompt}\n`;
    }
  }

  // Knowledge graph summary (top entities + relationships)
  const graphSummary =
    graphResult.status === "fulfilled" ? graphResult.value : "";
  if (graphSummary && graphSummary !== "Knowledge graph: empty.") {
    context += `\n### GRAF WIEDZY\n${graphSummary}\n`;
  }

  // Recent notes (last 5)
  const recentNotes =
    recentNotesResult.status === "fulfilled"
      ? (recentNotesResult.value.data as Array<{
          title: string | null;
          ai_summary: string | null;
          type: string;
          captured_at: string;
        }> | null)
      : null;
  if (recentNotes && recentNotes.length > 0) {
    context += `\n### OSTATNIE NOTATKI\n`;
    for (const note of recentNotes) {
      const date = new Date(note.captured_at).toLocaleDateString("pl-PL", {
        day: "numeric",
        month: "short",
      });
      const desc = note.ai_summary || note.title || "(bez tytułu)";
      context += `- ${date} [${note.type}]: ${desc}\n`;
    }
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

  // Generated apps (system self-awareness)
  if (apps && apps.length > 0) {
    context += `\n## MOJE APLIKACJE (zbudowane dla użytkownika)\n`;
    for (const app of apps) {
      const statusLabel =
        app.status === "active"
          ? "✅ aktywna"
          : app.status === "draft"
            ? "📝 szkic"
            : app.status === "pending_approval"
              ? "⏳ czeka na zatwierdzenie"
              : app.status;
      context += `- ${app.name} [${statusLabel}]${app.description ? ` — ${app.description}` : ""}\n`;
    }
    context += `Mozesz logowac dane: "app_log_data", pobierac: "app_get_data", budowac nowe: "build_app".\n`;
  }

  // Recent autonomous actions (last 24h — what I did for the user)
  if (proactiveActions && proactiveActions.length > 0) {
    const actionLabels: Record<string, string> = {
      crisis_followup: "Follow-up kryzysowy",
      inactivity: "Przypomnienie (brak aktywności)",
      emotion_trend: "Reakcja na trend emocji",
      gap: "Wykrycie luki w systemie",
      overdue_task: "Alert o zaległym zadaniu",
      insight: "Dostarczenie insightu",
      goal_nudge: "Przypomnienie o celu",
      email_sync: "Synchronizacja emaili",
      auto_build: "Automatyczne zbudowanie aplikacji",
    };
    context += `\n## MOJE OSTATNIE DZIAŁANIA (24h)\n`;
    for (const action of proactiveActions.slice(0, 5)) {
      const label = actionLabels[action.trigger_type] || action.trigger_type;
      const time = new Date(action.created_at).toLocaleTimeString("pl-PL", {
        hour: "2-digit",
        minute: "2-digit",
      });
      context += `- ${time}: ${label} via ${action.channel}\n`;
    }
    if (proactiveActions.length > 5) {
      context += `  ... i ${proactiveActions.length - 5} więcej akcji\n`;
    }
    context += `Gdy user pyta "co robiłeś?", "nad czym pracujesz?" — opisz te działania.\n`;
  }

  // Pending interventions awaiting user approval
  const pendingInterventions =
    pendingInterventionsResult.status === "fulfilled"
      ? (pendingInterventionsResult.value.data as Array<{
          id: string;
          intervention_type: string;
          title: string;
          description: string | null;
          priority: string;
          created_at: string;
        }> | null)
      : null;
  if (pendingInterventions && pendingInterventions.length > 0) {
    context += `\n## OCZEKUJĄCE PROPOZYCJE SYSTEMU\n`;
    context += `Masz ${pendingInterventions.length} propozycji czekających na akceptację użytkownika:\n`;
    for (const p of pendingInterventions) {
      context += `- [${p.priority}] ${p.title}: ${p.description?.slice(0, 100) || "brak opisu"} (ID: ${p.id})\n`;
    }
    context += `→ Gdy kontekst rozmowy jest odpowiedni, ZAPROPONUJ te akcje użytkownikowi naturalnie.\n`;
    context += `→ Jeśli user się zgodzi, użyj narzędzia "approve_intervention" z ID interwencji.\n`;
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

  const result = { context, systemPromptOverride, aiConfig };

  // Cache for subsequent requests in same conversation burst
  contextCache.set(tenantId, { result, timestamp: Date.now() });

  logger.info(
    `[DynamicContext] Built in ${Date.now() - startTime}ms (cached for ${CONTEXT_CACHE_TTL_MS / 1000}s)`,
  );
  return result;
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

  // 5 queries (vs 15 in full context) — added thread summary + highlights + rigs
  const [
    tenantResult,
    taskResult,
    threadSummaryResult,
    voiceHighlightsResult,
    voiceRigsResult,
  ] = await Promise.allSettled([
    supabase
      .from("exo_tenants")
      .select(
        "name, preferred_name, communication_style, iors_personality, iors_name, iors_custom_instructions, iors_ai_config",
      )
      .eq("id", tenantId)
      .single(),
    // Pending tasks count (via task-service: dual-read Tyrolka first, legacy fallback)
    getTaskStats(tenantId, supabase).then((s) => ({ count: s.pending })),
    getThreadSummary(tenantId),
    // Top 5 highlights for voice context (+20ms, within budget)
    getUserHighlights(supabase, tenantId, 5).catch(() => []),
    // Connected rig slugs (minimal — just names)
    supabase
      .from("exo_rig_connections")
      .select("rig_slug")
      .eq("tenant_id", tenantId)
      .not("access_token", "is", null),
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

  // Connected integrations (minimal list for voice)
  const voiceRigs =
    voiceRigsResult.status === "fulfilled"
      ? (voiceRigsResult.value.data as Array<{ rig_slug: string }> | null)
      : null;
  if (voiceRigs && voiceRigs.length > 0) {
    context += `- Integracje: ${voiceRigs.map((r) => r.rig_slug).join(", ")}\n`;
  }

  context += `- Kanal: ROZMOWA GLOSOWA. Odpowiadaj KROTKO (1-2 zdania). Unikaj list, markdown, emoji.\n`;
  context += `- WAZNE: Masz kontekst z WSZYSTKICH kanalow (chat, SMS, email). Odwoluj sie do nich naturalnie.\n`;

  // Highlights — key facts about the user for personalized voice
  const voiceHighlights =
    voiceHighlightsResult.status === "fulfilled"
      ? voiceHighlightsResult.value
      : [];
  if (Array.isArray(voiceHighlights) && voiceHighlights.length > 0) {
    const highlightsPrompt = formatHighlightsForPrompt(voiceHighlights);
    if (highlightsPrompt) {
      context += `\n${highlightsPrompt}\n`;
    }
  }

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
