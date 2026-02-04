/**
 * Tyrolka Context API
 *
 * Returns user's synthesized self-image:
 * Self-Image = (Ja × Nie-Ja) + Main Objective
 *            = (Experience × Research) + Objectives
 *
 * Used for voice system prompts and agent decision-making.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface TyrolkaContext {
  ja: {
    highlights: Array<{
      content: string;
      category: string;
      importance: number;
    }>;
    patterns: Array<{
      type: string;
      description: string;
      confidence: number;
    }>;
    recentExperiences: Array<{
      title: string;
      summary: string;
      capturedAt: string;
    }>;
  };
  nieJa: {
    research: Array<{
      title: string;
      summary: string;
      source: string;
    }>;
    worldContext: {
      dayOfWeek: number;
      timeOfDay: string;
      isWeekend: boolean;
    };
  };
  objectives: Array<{
    rank: number;
    objective: string;
    score: number;
    reasoning: string;
  }>;
  activeContext: {
    ops: Array<{
      title: string;
      priority: number;
      dueDate: string | null;
    }>;
    quests: Array<{
      title: string;
      progress: number;
    }>;
    campaigns: Array<{
      title: string;
      vision: string;
    }>;
  };
  synthesis: {
    currentState: string;
    gaps: string[];
    suggestedFocus: string;
  };
}

// ============================================================================
// GET - Get Tyrolka context
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const format = searchParams.get("format") || "full"; // 'full' | 'prompt' | 'minimal'

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    // Try using database function first
    const { data: dbContext, error: rpcError } = await supabase.rpc(
      "get_tyrolka_context",
      {
        p_tenant_id: tenantId,
      },
    );

    if (!rpcError && dbContext) {
      // Format for prompt if requested
      if (format === "prompt") {
        const promptText = formatForPrompt(dbContext);
        return NextResponse.json({ prompt: promptText });
      }

      return NextResponse.json({ context: dbContext });
    }

    // Fallback to manual assembly
    const context = await assembleTyrolkaContext(tenantId);

    if (format === "prompt") {
      const promptText = formatForPrompt(context);
      return NextResponse.json({ prompt: promptText });
    }

    if (format === "minimal") {
      return NextResponse.json({
        context: {
          ja: context.ja.highlights.slice(0, 5),
          objectives: context.objectives,
          activeOps: context.activeContext.ops.slice(0, 3),
        },
      });
    }

    return NextResponse.json({ context });
  } catch (error) {
    console.error("[Tyrolka API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// ASSEMBLE CONTEXT
// ============================================================================

async function assembleTyrolkaContext(
  tenantId: string,
): Promise<TyrolkaContext> {
  const supabase = getSupabase();
  const now = new Date();
  const hour = now.getHours();

  // Parallel queries
  const [
    highlightsResult,
    patternsResult,
    experiencesResult,
    researchResult,
    mitsResult,
    opsResult,
    questsResult,
    campaignsResult,
  ] = await Promise.all([
    // Ja - Highlights
    supabase
      .from("user_memory_highlights")
      .select("content, category, importance")
      .eq("user_id", tenantId)
      .eq("is_active", true)
      .order("importance", { ascending: false })
      .limit(10),

    // Ja - Patterns
    supabase
      .from("user_patterns")
      .select("pattern_type, description, confidence")
      .eq("tenant_id", tenantId)
      .order("confidence", { ascending: false })
      .limit(5),

    // Ja - Recent experiences (notes)
    supabase
      .from("user_notes")
      .select("title, ai_summary, captured_at")
      .eq("tenant_id", tenantId)
      .eq("is_experience", true)
      .order("captured_at", { ascending: false })
      .limit(5),

    // Nie-Ja - Research notes
    supabase
      .from("user_notes")
      .select("title, ai_summary, source_url")
      .eq("tenant_id", tenantId)
      .eq("is_research", true)
      .order("captured_at", { ascending: false })
      .limit(5),

    // Objectives - MITs
    supabase
      .from("user_mits")
      .select("rank, objective, score, reasoning")
      .eq("tenant_id", tenantId)
      .order("rank"),

    // Active Ops
    supabase
      .from("user_ops")
      .select("title, priority, due_date")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "active"])
      .order("priority", { ascending: false })
      .limit(5),

    // Active Quests
    supabase
      .from("user_quests")
      .select("title, completed_ops, target_ops")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(3),

    // Active Campaigns
    supabase
      .from("user_campaigns")
      .select("title, vision")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(2),
  ]);

  // Build context object
  const context: TyrolkaContext = {
    ja: {
      highlights: (highlightsResult.data || []).map((h) => ({
        content: h.content,
        category: h.category,
        importance: h.importance,
      })),
      patterns: (patternsResult.data || []).map((p) => ({
        type: p.pattern_type,
        description: p.description,
        confidence: p.confidence,
      })),
      recentExperiences: (experiencesResult.data || []).map((e) => ({
        title: e.title || "Untitled",
        summary: e.ai_summary || "",
        capturedAt: e.captured_at,
      })),
    },
    nieJa: {
      research: (researchResult.data || []).map((r) => ({
        title: r.title || "Untitled",
        summary: r.ai_summary || "",
        source: r.source_url || "",
      })),
      worldContext: {
        dayOfWeek: now.getDay(),
        timeOfDay: getTimeOfDay(hour),
        isWeekend: now.getDay() === 0 || now.getDay() === 6,
      },
    },
    objectives: (mitsResult.data || []).map((m) => ({
      rank: m.rank,
      objective: m.objective,
      score: m.score,
      reasoning: m.reasoning || "",
    })),
    activeContext: {
      ops: (opsResult.data || []).map((o) => ({
        title: o.title,
        priority: o.priority,
        dueDate: o.due_date,
      })),
      quests: (questsResult.data || []).map((q) => ({
        title: q.title,
        progress: q.target_ops
          ? Math.round((q.completed_ops / q.target_ops) * 100)
          : 0,
      })),
      campaigns: (campaignsResult.data || []).map((c) => ({
        title: c.title,
        vision: c.vision || "",
      })),
    },
    synthesis: synthesize(
      highlightsResult.data || [],
      mitsResult.data || [],
      opsResult.data || [],
    ),
  };

  return context;
}

// ============================================================================
// SYNTHESIS (Tyrolka formula application)
// ============================================================================

function synthesize(
  highlights: Array<{ content: string; category: string; importance: number }>,
  mits: Array<{ rank: number; objective: string; score: number }>,
  ops: Array<{ title: string; priority: number; due_date: string | null }>,
): TyrolkaContext["synthesis"] {
  // Current state summary
  const topHighlights = highlights
    .slice(0, 3)
    .map((h) => h.content)
    .join("; ");
  const currentState =
    topHighlights || "Brak wystarczających danych o użytkowniku";

  // Detect gaps (objectives without supporting ops/highlights)
  const gaps: string[] = [];
  for (const mit of mits) {
    const hasRelatedOps = ops.some(
      (op) =>
        op.title
          .toLowerCase()
          .includes(mit.objective.toLowerCase().split(" ")[0]) ||
        mit.objective
          .toLowerCase()
          .includes(op.title.toLowerCase().split(" ")[0]),
    );

    if (!hasRelatedOps) {
      gaps.push(`Brak aktywnych zadań dla celu: "${mit.objective}"`);
    }
  }

  // Suggested focus
  const overdueOps = ops.filter(
    (o) => o.due_date && new Date(o.due_date) < new Date(),
  );
  const highPriorityOps = ops.filter((o) => o.priority >= 8);

  let suggestedFocus = "";
  if (overdueOps.length > 0) {
    suggestedFocus = `Priorytet: ${overdueOps.length} zaległych zadań`;
  } else if (highPriorityOps.length > 0) {
    suggestedFocus = `Focus: ${highPriorityOps[0].title}`;
  } else if (mits.length > 0) {
    suggestedFocus = `Główny cel: ${mits[0].objective}`;
  } else {
    suggestedFocus = "Odkryj swoje główne cele";
  }

  return {
    currentState,
    gaps,
    suggestedFocus,
  };
}

// ============================================================================
// FORMAT FOR PROMPT
// ============================================================================

function formatForPrompt(
  context: TyrolkaContext | Record<string, unknown>,
): string {
  const parts: string[] = [];

  // Handle both formats (DB function result vs assembled)
  const ja =
    (context as TyrolkaContext).ja || (context as Record<string, unknown>).ja;
  const nieJa =
    (context as TyrolkaContext).nieJa ||
    (context as Record<string, unknown>).nieJa;
  const objectives =
    (context as TyrolkaContext).objectives ||
    (context as Record<string, unknown>).objectives;
  const activeContext = (context as TyrolkaContext).activeContext || {};
  const synthesis = (context as TyrolkaContext).synthesis;

  // JA section
  parts.push("## O użytkowniku (Ja)");
  if (Array.isArray(ja?.highlights)) {
    for (const h of ja.highlights.slice(0, 5)) {
      parts.push(`- ${h.content}`);
    }
  }
  if (Array.isArray((ja as TyrolkaContext["ja"])?.patterns)) {
    parts.push("\n**Wzorce:**");
    for (const p of (ja as TyrolkaContext["ja"]).patterns.slice(0, 3)) {
      parts.push(`- ${p.description}`);
    }
  }

  // NIE-JA section
  if (
    Array.isArray((nieJa as TyrolkaContext["nieJa"])?.research) &&
    (nieJa as TyrolkaContext["nieJa"]).research.length > 0
  ) {
    parts.push("\n## Wiedza zewnętrzna (Nie-Ja)");
    for (const r of (nieJa as TyrolkaContext["nieJa"]).research.slice(0, 3)) {
      parts.push(`- ${r.title}: ${r.summary}`);
    }
  }

  // OBJECTIVES section
  if (Array.isArray(objectives) && objectives.length > 0) {
    parts.push("\n## Główne cele (Objectives)");
    for (const o of objectives) {
      parts.push(`${o.rank}. ${o.objective}`);
    }
  }

  // ACTIVE CONTEXT section
  if (
    Array.isArray((activeContext as TyrolkaContext["activeContext"])?.ops) &&
    (activeContext as TyrolkaContext["activeContext"]).ops.length > 0
  ) {
    parts.push("\n## Aktywne zadania");
    for (const op of (
      activeContext as TyrolkaContext["activeContext"]
    ).ops.slice(0, 3)) {
      const dueStr = op.dueDate
        ? ` (do: ${new Date(op.dueDate).toLocaleDateString("pl-PL")})`
        : "";
      parts.push(`- [P${op.priority}] ${op.title}${dueStr}`);
    }
  }

  // SYNTHESIS section
  if (synthesis) {
    parts.push("\n## Synteza");
    parts.push(`**Focus:** ${synthesis.suggestedFocus}`);
    if (synthesis.gaps.length > 0) {
      parts.push(`**Luki:** ${synthesis.gaps.slice(0, 2).join("; ")}`);
    }
  }

  return parts.join("\n");
}

function getTimeOfDay(hour: number): string {
  if (hour >= 5 && hour < 9) return "early_morning";
  if (hour >= 9 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}
