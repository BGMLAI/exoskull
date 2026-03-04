/**
 * v3 Dynamic Context Builder
 *
 * Simplified from v1's 15 parallel queries → 6 essential queries.
 * Builds tenant context for the mission prompt.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { getThreadSummary } from "@/lib/unified-thread";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface V3DynamicContextResult {
  context: string;
}

// ============================================================================
// CACHE (30s TTL per tenant)
// ============================================================================

interface CachedContext {
  result: V3DynamicContextResult;
  timestamp: number;
}

const CACHE_TTL_MS = 300_000; // 5 min (was 30s — wasteful for fast conversations)
const contextCache = new Map<string, CachedContext>();

export function invalidateContextCache(tenantId: string): void {
  contextCache.delete(tenantId);
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build dynamic context for v3 mission prompt.
 * 6 parallel queries (~150-300ms).
 */
export async function buildV3DynamicContext(
  tenantId: string,
): Promise<V3DynamicContextResult> {
  // Cache hit
  const cached = contextCache.get(tenantId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  const supabase = getServiceSupabase();
  const startTime = Date.now();

  // 6 parallel queries
  const [
    tenantResult,
    threadResult,
    goalsResult,
    knowledgeResult,
    recentOpsResult,
    autonomyLogResult,
  ] = await Promise.allSettled([
    // 1. User profile
    supabase
      .from("exo_tenants")
      .select("name, preferred_name, communication_style, permission_level")
      .eq("id", tenantId)
      .single(),
    // 2. Thread summary (cross-channel awareness)
    getThreadSummary(tenantId).catch(() => null),
    // 3. Active goals (Tyrolka loops)
    supabase
      .from("user_loops")
      .select("title, status, progress_percent")
      .eq("tenant_id", tenantId)
      .in("status", ["active", "paused"])
      .order("created_at", { ascending: false })
      .limit(10),
    // 4. Organism knowledge (top 10 by confidence)
    supabase
      .from("exo_organism_knowledge")
      .select("category, content, confidence")
      .eq("tenant_id", tenantId)
      .order("confidence", { ascending: false })
      .limit(10),
    // 5. Recent ops (tasks)
    supabase
      .from("user_ops")
      .select("title, status, priority")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "active"])
      .order("priority", { ascending: false })
      .limit(10),
    // 6. Recent autonomy actions (last 24h)
    supabase
      .from("exo_autonomy_log")
      .select("event_type, payload, created_at")
      .eq("tenant_id", tenantId)
      .gte(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      )
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Extract results safely
  const tenant =
    tenantResult.status === "fulfilled" ? tenantResult.value.data : null;
  const threadSummary =
    threadResult.status === "fulfilled" ? threadResult.value : null;
  const goals =
    goalsResult.status === "fulfilled"
      ? (goalsResult.value.data as Array<{
          title: string;
          status: string;
          progress_percent: number | null;
        }> | null)
      : null;
  const knowledge =
    knowledgeResult.status === "fulfilled"
      ? (knowledgeResult.value.data as Array<{
          category: string;
          content: string;
          confidence: number;
        }> | null)
      : null;
  const ops =
    recentOpsResult.status === "fulfilled"
      ? (recentOpsResult.value.data as Array<{
          title: string;
          status: string;
          priority: number;
        }> | null)
      : null;
  const autonomyLog =
    autonomyLogResult.status === "fulfilled"
      ? (autonomyLogResult.value.data as Array<{
          event_type: string;
          payload: Record<string, unknown>;
          created_at: string;
        }> | null)
      : null;

  // Build context string
  const now = new Date();
  const timeString = now.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayOfWeek = now.toLocaleDateString("pl-PL", { weekday: "long" });

  let context = `\n\n## AKTUALNY KONTEKST\n`;
  context += `- Czas: ${dayOfWeek}, ${timeString}\n`;

  if (tenant?.preferred_name || tenant?.name) {
    context += `- Użytkownik: ${tenant.preferred_name || tenant.name} (UŻYWAJ IMIENIA)\n`;
  }

  if (tenant?.communication_style) {
    context += `- Styl komunikacji: ${tenant.communication_style}\n`;
  }

  if (tenant?.permission_level) {
    context += `- Poziom autonomii: ${tenant.permission_level}\n`;
  }

  // Thread summary
  if (threadSummary && threadSummary !== "Brak historii rozmow.") {
    context += `- Historia rozmów: ${threadSummary}\n`;
  }

  // Goals
  if (goals && goals.length > 0) {
    context += `\n## CELE UŻYTKOWNIKA (${goals.length} aktywnych)\n`;
    for (const g of goals) {
      const progress =
        g.progress_percent != null
          ? `${Math.round(g.progress_percent)}%`
          : "brak danych";
      context += `- ${g.title}: ${progress} [${g.status}]\n`;
    }
    context += `PRIORYTET: cele zagrożone > cele na dobrej drodze. Proaktywnie proponuj akcje.\n`;
  }

  // Tasks
  if (ops && ops.length > 0) {
    context += `\n## ZADANIA (${ops.length} aktywnych)\n`;
    for (const op of ops.slice(0, 5)) {
      context += `- [P${op.priority}] ${op.title} (${op.status})\n`;
    }
    if (ops.length > 5) {
      context += `  ... i ${ops.length - 5} więcej\n`;
    }
  }

  // Organism knowledge (learned facts)
  if (knowledge && knowledge.length > 0) {
    context += `\n## CO WIEM O UŻYTKOWNIKU\n`;
    for (const k of knowledge) {
      const label =
        k.category === "pattern"
          ? "wzorzec"
          : k.category === "preference"
            ? "preferencja"
            : k.category === "anti_pattern"
              ? "unikaj"
              : "fakt";
      context += `- [${label}] ${k.content}\n`;
    }
  }

  // Recent autonomous actions
  if (autonomyLog && autonomyLog.length > 0) {
    context += `\n## MOJE OSTATNIE DZIAŁANIA (24h)\n`;
    for (const entry of autonomyLog) {
      const time = new Date(entry.created_at).toLocaleTimeString("pl-PL", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const desc =
        typeof entry.payload === "object" && entry.payload !== null
          ? (entry.payload as Record<string, unknown>).description ||
            entry.event_type
          : entry.event_type;
      context += `- ${time}: ${desc}\n`;
    }
  }

  // Memory reminder
  context += `\n## PAMIĘĆ\n`;
  context += `Masz dostęp do pełnej pamięci. Użyj "search_brain" gdy user pyta o przeszłość.\n`;
  context += `NIGDY nie mów "nie pamiętam" — MASZ pamięć, przeszukaj ją.\n`;

  const result = { context };

  // Cache
  contextCache.set(tenantId, { result, timestamp: Date.now() });
  logger.info(`[v3:DynamicContext] Built in ${Date.now() - startTime}ms`);

  return result;
}
