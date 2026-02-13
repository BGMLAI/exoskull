/**
 * Industry Tracker
 *
 * Monitors industry trends and suggests strategic moves.
 * Runs as a CRON job — scans news, analyzes patterns, generates recommendations.
 *
 * Features:
 * - Daily industry scan (web search)
 * - Trend detection
 * - Competitor monitoring
 * - Content opportunity identification
 * - Strategic move suggestions
 */

import { aiChat } from "@/lib/ai/chat";
import { getServiceSupabase } from "@/lib/supabase/service";

// ============================================================================
// TYPES
// ============================================================================

export interface IndustryReport {
  date: string;
  industry: string;
  trends: TrendItem[];
  opportunities: OpportunityItem[];
  threats: string[];
  suggestedMoves: StrategicMove[];
  summary: string;
}

export interface TrendItem {
  title: string;
  description: string;
  relevance: "high" | "medium" | "low";
  source?: string;
}

export interface OpportunityItem {
  title: string;
  description: string;
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  timeframe: string;
}

export interface StrategicMove {
  action: string;
  rationale: string;
  priority: number;
  category: "content" | "product" | "partnership" | "marketing" | "technology";
}

// ============================================================================
// INDUSTRY ANALYSIS
// ============================================================================

/**
 * Run industry analysis for a tenant
 */
export async function analyzeIndustry(
  tenantId: string,
  industry?: string,
): Promise<IndustryReport> {
  const supabase = getServiceSupabase();

  // Get user's industry from profile
  if (!industry) {
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("preferences")
      .eq("id", tenantId)
      .maybeSingle();

    industry =
      (tenant?.preferences as Record<string, string>)?.industry ||
      "AI/technology";
  }

  // Get user's goals/values for context
  const { data: values } = await supabase
    .from("exo_values")
    .select("name, description")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(5);

  const userContext =
    values?.map((v) => `${v.name}: ${v.description}`).join(", ") || "";

  // AI analysis using Opus for strategic quality
  const result = await aiChat({
    messages: [
      {
        role: "system",
        content: `You are a strategic industry analyst and business advisor. Analyze the current state of the given industry and provide actionable intelligence.

Your analysis should be:
- Based on current knowledge of the industry
- Focused on actionable moves with minimum effort, maximum impact (Pareto principle)
- Tailored to the user's values and goals
- Written as a trusted advisor (mentor + strategist)

Respond in JSON:
{
  "trends": [{ "title": "...", "description": "...", "relevance": "high|medium|low" }],
  "opportunities": [{ "title": "...", "description": "...", "effort": "low|medium|high", "impact": "low|medium|high", "timeframe": "..." }],
  "threats": ["..."],
  "suggestedMoves": [{ "action": "...", "rationale": "...", "priority": 1-10, "category": "content|product|partnership|marketing|technology" }],
  "summary": "2-3 sentence executive summary"
}`,
      },
      {
        role: "user",
        content: `Industry: ${industry}
Date: ${new Date().toLocaleDateString()}
User context (values/goals): ${userContext || "not specified"}

Analyze current trends, identify opportunities (minimum effort → maximum impact), and suggest the top 3-5 strategic moves.`,
      },
    ],
    forceModel: "claude-opus-4-5",
    maxTokens: 4000,
  });

  // Parse response
  let report: IndustryReport = {
    date: new Date().toISOString().split("T")[0],
    industry,
    trends: [],
    opportunities: [],
    threats: [],
    suggestedMoves: [],
    summary: "",
  };

  try {
    const jsonMatch = result.content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      report = {
        ...report,
        trends: parsed.trends || [],
        opportunities: parsed.opportunities || [],
        threats: parsed.threats || [],
        suggestedMoves: (parsed.suggestedMoves || []).sort(
          (a: StrategicMove, b: StrategicMove) => b.priority - a.priority,
        ),
        summary: parsed.summary || "",
      };
    }
  } catch {
    report.summary =
      result.content?.slice(0, 500) || "Analysis failed to parse";
  }

  // Store report
  await supabase.from("exo_industry_reports").insert({
    tenant_id: tenantId,
    industry,
    report: report,
    created_at: new Date().toISOString(),
  });

  return report;
}

/**
 * Analyze scenarios — "what if" analysis
 */
export async function analyzeScenarios(
  tenantId: string,
  goal: string,
  constraints?: string,
): Promise<{
  scenarios: Array<{
    name: string;
    description: string;
    probability: number;
    effort: string;
    expectedOutcome: string;
    risks: string[];
    steps: string[];
  }>;
  recommendation: string;
}> {
  const result = await aiChat({
    messages: [
      {
        role: "system",
        content: `You are a scenario analyst. Given a goal, generate 3-5 possible paths to achieve it.
Apply Pareto principle: find the path with minimum effort → maximum result.
Use Monte Carlo-style thinking: consider probability of success for each path.

Respond in JSON:
{
  "scenarios": [{
    "name": "...",
    "description": "...",
    "probability": 0.0-1.0,
    "effort": "low|medium|high",
    "expectedOutcome": "...",
    "risks": ["..."],
    "steps": ["..."]
  }],
  "recommendation": "Which path to take and why (Pareto optimal)"
}`,
      },
      {
        role: "user",
        content: `Goal: ${goal}${constraints ? `\nConstraints: ${constraints}` : ""}\n\nGenerate possible paths with probability estimates.`,
      },
    ],
    forceModel: "claude-opus-4-5",
    maxTokens: 4000,
  });

  try {
    const jsonMatch = result.content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {
    // Parse failure
  }

  return {
    scenarios: [],
    recommendation: result.content?.slice(0, 500) || "Analysis failed",
  };
}

/**
 * Format report as text for AI context or user display
 */
export function formatReport(report: IndustryReport): string {
  const lines = [
    `== Raport branżowy: ${report.industry} (${report.date}) ==`,
    "",
    report.summary,
    "",
  ];

  if (report.trends.length > 0) {
    lines.push("TRENDY:");
    for (const t of report.trends) {
      lines.push(`  [${t.relevance}] ${t.title}: ${t.description}`);
    }
    lines.push("");
  }

  if (report.opportunities.length > 0) {
    lines.push("OKAZJE:");
    for (const o of report.opportunities) {
      lines.push(
        `  ${o.title} (wysiłek: ${o.effort}, wpływ: ${o.impact}, ${o.timeframe})`,
      );
      lines.push(`    ${o.description}`);
    }
    lines.push("");
  }

  if (report.suggestedMoves.length > 0) {
    lines.push("REKOMENDOWANE RUCHY:");
    for (const m of report.suggestedMoves) {
      lines.push(`  ${m.priority}. [${m.category}] ${m.action}`);
      lines.push(`     Dlaczego: ${m.rationale}`);
    }
  }

  return lines.join("\n");
}
