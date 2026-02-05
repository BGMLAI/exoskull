/**
 * Memory Search System
 *
 * Provides keyword and semantic search across:
 * - Unified messages (conversations)
 * - Daily summaries
 * - Memory highlights
 *
 * "najlepsza pamięć na rynku" - search everything, find anything
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Types
export interface SearchResult {
  type: "message" | "summary" | "highlight";
  content: string;
  score: number;
  date: string;
  metadata?: {
    channel?: string;
    role?: string;
    category?: string;
    mood_score?: number;
  };
}

export interface SearchOptions {
  tenantId: string;
  query: string;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  types?: Array<"message" | "summary" | "highlight">;
}

// Admin client
function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

/**
 * Keyword search across all memory sources
 */
export async function keywordSearch(
  options: SearchOptions,
): Promise<SearchResult[]> {
  const { tenantId, query, limit = 20, dateFrom, dateTo, types } = options;
  const supabase = getAdminClient();
  const results: SearchResult[] = [];

  // Prepare search terms for PostgreSQL text search
  const searchTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .join(" & ");

  const searchPattern = `%${query.toLowerCase()}%`;

  // Search types
  const searchTypes = types || ["message", "summary", "highlight"];

  // 1. Search unified messages
  if (searchTypes.includes("message")) {
    let messagesQuery = supabase
      .from("exo_unified_messages")
      .select("content, role, channel, created_at")
      .eq("tenant_id", tenantId)
      .ilike("content", searchPattern)
      .order("created_at", { ascending: false })
      .limit(Math.ceil(limit / 2));

    if (dateFrom) {
      messagesQuery = messagesQuery.gte("created_at", dateFrom);
    }
    if (dateTo) {
      messagesQuery = messagesQuery.lte("created_at", dateTo);
    }

    const { data: messages, error: messagesError } = await messagesQuery;

    if (messagesError) {
      console.error("[MemorySearch] Messages search error:", messagesError);
    } else if (messages) {
      for (const msg of messages) {
        // Calculate simple relevance score based on term frequency
        const content = msg.content.toLowerCase();
        const queryLower = query.toLowerCase();
        const occurrences = (content.match(new RegExp(queryLower, "gi")) || [])
          .length;
        const score = occurrences / Math.max(1, content.split(" ").length / 10);

        results.push({
          type: "message",
          content: msg.content,
          score,
          date: msg.created_at,
          metadata: {
            role: msg.role,
            channel: msg.channel,
          },
        });
      }
    }
  }

  // 2. Search daily summaries
  if (searchTypes.includes("summary")) {
    let summariesQuery = supabase
      .from("exo_daily_summaries")
      .select(
        "summary_date, draft_summary, final_summary, mood_score, key_topics",
      )
      .eq("tenant_id", tenantId)
      .or(
        `draft_summary.ilike.${searchPattern},final_summary.ilike.${searchPattern}`,
      )
      .order("summary_date", { ascending: false })
      .limit(Math.ceil(limit / 4));

    if (dateFrom) {
      summariesQuery = summariesQuery.gte("summary_date", dateFrom);
    }
    if (dateTo) {
      summariesQuery = summariesQuery.lte("summary_date", dateTo);
    }

    const { data: summaries, error: summariesError } = await summariesQuery;

    if (summariesError) {
      console.error("[MemorySearch] Summaries search error:", summariesError);
    } else if (summaries) {
      for (const summary of summaries) {
        const content = summary.final_summary || summary.draft_summary || "";
        const queryLower = query.toLowerCase();
        const occurrences = (
          content.toLowerCase().match(new RegExp(queryLower, "gi")) || []
        ).length;
        const score = occurrences / Math.max(1, content.split(" ").length / 10);

        results.push({
          type: "summary",
          content,
          score,
          date: summary.summary_date,
          metadata: {
            mood_score: summary.mood_score,
          },
        });
      }
    }
  }

  // 3. Search highlights
  if (searchTypes.includes("highlight")) {
    const { data: highlights, error: highlightsError } = await supabase
      .from("user_memory_highlights")
      .select("content, category, importance, created_at")
      .eq("user_id", tenantId)
      .ilike("content", searchPattern)
      .order("importance", { ascending: false })
      .limit(Math.ceil(limit / 4));

    if (highlightsError) {
      console.error("[MemorySearch] Highlights search error:", highlightsError);
    } else if (highlights) {
      for (const highlight of highlights) {
        // Score based on importance + term match
        const content = highlight.content.toLowerCase();
        const queryLower = query.toLowerCase();
        const occurrences = (content.match(new RegExp(queryLower, "gi")) || [])
          .length;
        const score = (occurrences * highlight.importance) / 10;

        results.push({
          type: "highlight",
          content: highlight.content,
          score,
          date: highlight.created_at,
          metadata: {
            category: highlight.category,
          },
        });
      }
    }
  }

  // Sort by score and limit
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Get context around a specific date
 */
export async function getContextAroundDate(
  tenantId: string,
  date: string,
  windowDays: number = 1,
): Promise<SearchResult[]> {
  const supabase = getAdminClient();
  const results: SearchResult[] = [];

  const targetDate = new Date(date);
  const startDate = new Date(targetDate);
  startDate.setDate(startDate.getDate() - windowDays);
  const endDate = new Date(targetDate);
  endDate.setDate(endDate.getDate() + windowDays);

  // Get messages around the date
  const { data: messages } = await supabase
    .from("exo_unified_messages")
    .select("content, role, channel, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  if (messages) {
    for (const msg of messages) {
      results.push({
        type: "message",
        content: msg.content,
        score: 1,
        date: msg.created_at,
        metadata: {
          role: msg.role,
          channel: msg.channel,
        },
      });
    }
  }

  // Get summary for that date
  const { data: summary } = await supabase
    .from("exo_daily_summaries")
    .select("summary_date, draft_summary, final_summary, mood_score")
    .eq("tenant_id", tenantId)
    .eq("summary_date", date)
    .single();

  if (summary) {
    results.push({
      type: "summary",
      content: summary.final_summary || summary.draft_summary || "",
      score: 2, // Prioritize summary
      date: summary.summary_date,
      metadata: {
        mood_score: summary.mood_score,
      },
    });
  }

  return results;
}

/**
 * Find when user last mentioned something
 */
export async function findLastMention(
  tenantId: string,
  topic: string,
): Promise<{ date: string; content: string } | null> {
  const supabase = getAdminClient();
  const searchPattern = `%${topic.toLowerCase()}%`;

  const { data } = await supabase
    .from("exo_unified_messages")
    .select("content, created_at")
    .eq("tenant_id", tenantId)
    .ilike("content", searchPattern)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  return {
    date: data.created_at,
    content: data.content,
  };
}

/**
 * Get memory timeline (for UI)
 */
export async function getMemoryTimeline(
  tenantId: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<{
  summaries: Array<{
    date: string;
    summary: string;
    mood_score: number | null;
    message_count: number;
    reviewed: boolean;
  }>;
  total: number;
}> {
  const supabase = getAdminClient();
  const offset = (page - 1) * pageSize;

  // Get total count
  const { count } = await supabase
    .from("exo_daily_summaries")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  // Get paginated summaries
  const { data } = await supabase
    .from("exo_daily_summaries")
    .select(
      "summary_date, draft_summary, final_summary, mood_score, message_count, reviewed_at",
    )
    .eq("tenant_id", tenantId)
    .order("summary_date", { ascending: false })
    .range(offset, offset + pageSize - 1);

  return {
    summaries: (data || []).map((s) => ({
      date: s.summary_date,
      summary: s.final_summary || s.draft_summary || "Brak podsumowania",
      mood_score: s.mood_score,
      message_count: s.message_count || 0,
      reviewed: !!s.reviewed_at,
    })),
    total: count || 0,
  };
}

/**
 * Format search results for voice/text response
 */
export function formatSearchResultsForResponse(
  results: SearchResult[],
  query: string,
): string {
  if (results.length === 0) {
    return `Nie znalazłem nic o "${query}" w mojej pamięci.`;
  }

  const topResults = results.slice(0, 3);
  const formatted: string[] = [];

  for (const result of topResults) {
    const date = new Date(result.date).toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "short",
    });

    if (result.type === "message") {
      const preview =
        result.content.slice(0, 100) +
        (result.content.length > 100 ? "..." : "");
      formatted.push(`${date}: "${preview}"`);
    } else if (result.type === "summary") {
      const preview =
        result.content.slice(0, 150) +
        (result.content.length > 150 ? "..." : "");
      formatted.push(`Podsumowanie ${date}: ${preview}`);
    } else if (result.type === "highlight") {
      formatted.push(
        `Zapamiętane (${result.metadata?.category}): ${result.content}`,
      );
    }
  }

  if (results.length > 3) {
    formatted.push(`...i ${results.length - 3} więcej wyników.`);
  }

  return `Znalazłem ${results.length} wyników dla "${query}":\n\n${formatted.join("\n\n")}`;
}
