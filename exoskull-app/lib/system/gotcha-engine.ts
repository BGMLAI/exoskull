/**
 * GOTCHA Engine
 *
 * Makes the GOTCHA framework executable — not just documentation, but runtime.
 * Each cycle: Goals → Orchestration → Tools → Context → HardPrompts → Args
 *
 * Used by:
 * - Ralph Loop (every development cycle)
 * - App Builder (every build)
 * - Skill execution (every skill run)
 */

import { getServiceSupabase } from "@/lib/supabase/service";

// ============================================================================
// TYPES
// ============================================================================

export interface GOTCHAContext {
  goals: GoalDefinition[];
  tools: ToolManifestEntry[];
  context: ContextEntry[];
  hardPrompts: HardPromptTemplate[];
  args: ArgsConfig;
}

export interface GoalDefinition {
  id: string;
  name: string;
  objective: string;
  inputs: string[];
  tools: string[];
  expectedOutputs: string[];
  edgeCases: string[];
}

export interface ToolManifestEntry {
  name: string;
  description: string;
  path: string;
  category: string;
  isAvailable: boolean;
}

export interface ContextEntry {
  key: string;
  value: string;
  category: "voice" | "icp" | "examples" | "domain" | "user_profile";
}

export interface HardPromptTemplate {
  id: string;
  name: string;
  template: string;
  variables: string[];
}

export interface ArgsConfig {
  mode: string;
  tier: number;
  maxRetries: number;
  timeoutMs: number;
  budgetLimit: number;
  features: Record<string, boolean>;
}

// ============================================================================
// GOAL LOADING
// ============================================================================

const goalCache = new Map<string, GoalDefinition[]>();

/**
 * Load goals from database (replaces file-based goals/ directory in cloud)
 */
export async function loadGoals(tenantId: string): Promise<GoalDefinition[]> {
  const cached = goalCache.get(tenantId);
  if (cached) return cached;

  const supabase = getServiceSupabase();

  // Load from system goals + tenant-specific goals
  const { data: systemGoals } = await supabase
    .from("exo_system_goals")
    .select("*")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("is_active", true);

  const goals: GoalDefinition[] = (systemGoals || []).map((g) => ({
    id: g.id,
    name: g.name,
    objective: g.objective || "",
    inputs: g.inputs || [],
    tools: g.tools || [],
    expectedOutputs: g.expected_outputs || [],
    edgeCases: g.edge_cases || [],
  }));

  // Built-in goals (always available)
  goals.push(
    {
      id: "build_app",
      name: "Build Application",
      objective: "Build a full-stack application following ATLAS workflow",
      inputs: ["description", "requirements", "user_context"],
      tools: [
        "generate_fullstack_app",
        "modify_code",
        "run_tests",
        "deploy_app",
      ],
      expectedOutputs: ["working app", "deployment URL", "test results"],
      edgeCases: [
        "VPS unavailable → local generation",
        "Build fails → retry with simpler approach",
      ],
    },
    {
      id: "heal_integration",
      name: "Heal Integration",
      objective: "Diagnose and fix a broken integration",
      inputs: ["integration_name", "error_log", "tenant_id"],
      tools: ["composio_action", "composio_connect", "search_web"],
      expectedOutputs: ["integration restored", "root cause identified"],
      edgeCases: [
        "OAuth expired → re-auth flow",
        "API changed → update adapter",
      ],
    },
    {
      id: "generate_content",
      name: "Generate Content",
      objective: "Create high-quality content (docs, posts, media)",
      inputs: ["content_type", "topic", "audience", "tone", "channels"],
      tools: [
        "search_web",
        "search_knowledge",
        "generate_image",
        "generate_document",
      ],
      expectedOutputs: ["content files", "distribution plan"],
      edgeCases: [
        "Brand voice mismatch → regenerate",
        "Platform limits → adapt format",
      ],
    },
  );

  goalCache.set(tenantId, goals);
  setTimeout(() => goalCache.delete(tenantId), 5 * 60_000); // Cache 5 min
  return goals;
}

// ============================================================================
// TOOL REGISTRY
// ============================================================================

/**
 * Get available tools for the current context
 */
export async function loadToolManifest(
  tenantId: string,
): Promise<ToolManifestEntry[]> {
  // Import IORS tools dynamically
  const { getToolsForTenant } = await import("@/lib/iors/tools");
  const result = await getToolsForTenant(tenantId);

  return result.definitions.map(
    (t: { name: string; description?: string }) => ({
      name: t.name,
      description: t.description || "",
      path: `iors/tools/${t.name}`,
      category: categorizeToolByName(t.name),
      isAvailable: true,
    }),
  );
}

function categorizeToolByName(name: string): string {
  if (name.includes("email")) return "communication";
  if (name.includes("composio")) return "integration";
  if (name.includes("task")) return "productivity";
  if (name.includes("knowledge") || name.includes("search")) return "knowledge";
  if (
    name.includes("code") ||
    name.includes("build") ||
    name.includes("deploy")
  )
    return "development";
  if (name.includes("value") || name.includes("goal") || name.includes("quest"))
    return "planning";
  if (name.includes("debate")) return "intelligence";
  return "general";
}

// ============================================================================
// CONTEXT LOADING
// ============================================================================

/**
 * Load context for the current operation
 */
export async function loadContext(tenantId: string): Promise<ContextEntry[]> {
  const supabase = getServiceSupabase();
  const context: ContextEntry[] = [];

  // User profile context
  const { data: tenant } = await supabase
    .from("exo_tenants")
    .select("iors_name, personality, language, voice_config, preferences")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenant) {
    if (tenant.personality) {
      context.push({
        key: "personality",
        value: JSON.stringify(tenant.personality),
        category: "user_profile",
      });
    }
    if (tenant.language) {
      context.push({
        key: "language",
        value: tenant.language,
        category: "user_profile",
      });
    }
    if (tenant.preferences) {
      context.push({
        key: "preferences",
        value: JSON.stringify(tenant.preferences),
        category: "user_profile",
      });
    }
  }

  // Recent memory highlights
  const { data: highlights } = await supabase
    .from("user_memory_highlights")
    .select("content, category")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("importance", { ascending: false })
    .limit(10);

  for (const h of highlights || []) {
    context.push({
      key: `memory_${h.category}`,
      value: h.content,
      category: "domain",
    });
  }

  return context;
}

// ============================================================================
// ARGS LOADING
// ============================================================================

/**
 * Load runtime args (behavior configuration)
 */
export async function loadArgs(tenantId: string): Promise<ArgsConfig> {
  const supabase = getServiceSupabase();

  const { data: config } = await supabase
    .from("exo_tenants")
    .select("ai_config, autonomy_config")
    .eq("id", tenantId)
    .maybeSingle();

  return {
    mode: (config?.ai_config as Record<string, string>)?.mode || "balanced",
    tier: (config?.ai_config as Record<string, number>)?.defaultTier || 2,
    maxRetries: 3,
    timeoutMs: 55_000,
    budgetLimit:
      (config?.ai_config as Record<string, number>)?.dailyBudget || 5.0,
    features: {
      lateralThinking: true,
      agentDebate: true,
      autoHeal: true,
      selfBuild:
        (config?.autonomy_config as Record<string, boolean>)?.selfBuild ||
        false,
      ...(config?.ai_config as Record<string, Record<string, boolean>>)
        ?.features,
    },
  };
}

// ============================================================================
// GOTCHA CYCLE
// ============================================================================

/**
 * Execute a full GOTCHA cycle — load all layers, build context for AI
 */
export async function buildGOTCHAContext(
  tenantId: string,
  goalId?: string,
): Promise<GOTCHAContext> {
  const [goals, tools, context, args] = await Promise.all([
    loadGoals(tenantId),
    loadToolManifest(tenantId),
    loadContext(tenantId),
    loadArgs(tenantId),
  ]);

  // Filter goals if specific goal requested
  const relevantGoals = goalId ? goals.filter((g) => g.id === goalId) : goals;

  return {
    goals: relevantGoals,
    tools,
    context,
    hardPrompts: [], // Loaded on-demand per task
    args,
  };
}

/**
 * Generate a system prompt enriched with GOTCHA context
 */
export function buildGOTCHAPrompt(
  gotcha: GOTCHAContext,
  taskDescription: string,
): string {
  const goalSection =
    gotcha.goals.length > 0
      ? `## Available Goals\n${gotcha.goals.map((g) => `- **${g.name}**: ${g.objective}\n  Tools: ${g.tools.join(", ")}`).join("\n")}`
      : "";

  const toolSection = `## Available Tools (${gotcha.tools.length})\n${gotcha.tools
    .filter((t) => t.isAvailable)
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n")}`;

  const contextSection =
    gotcha.context.length > 0
      ? `## Context\n${gotcha.context.map((c) => `- [${c.category}] ${c.key}: ${c.value.slice(0, 200)}`).join("\n")}`
      : "";

  const argsSection = `## Runtime Config\n- Mode: ${gotcha.args.mode}\n- Tier: ${gotcha.args.tier}\n- Features: ${Object.entries(
    gotcha.args.features,
  )
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ")}`;

  return [
    "# GOTCHA Framework Active",
    "",
    `Task: ${taskDescription}`,
    "",
    goalSection,
    "",
    toolSection,
    "",
    contextSection,
    "",
    argsSection,
    "",
    "Follow the GOTCHA cycle: analyze goal → select tools → apply context → execute.",
  ]
    .filter(Boolean)
    .join("\n");
}
