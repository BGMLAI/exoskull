/**
 * Swarm Orchestrator
 *
 * Executes N parallel Kimi K2.5 calls (one per agent),
 * then synthesizes all outputs into a holistic report.
 *
 * Architecture:
 * 1. Fan-out: Promise.allSettled on all agent calls
 * 2. Collect: Gather results (partial OK if some fail)
 * 3. Synthesize: Final Kimi call combines all outputs
 */

import { aiChat, type AIMessage, type AIResponse } from "../index";

import { logger } from "@/lib/logger";
// =====================================================
// TYPES
// =====================================================

export interface SwarmAgent {
  name: string;
  role: string;
  systemPrompt: string;
  userPrompt: string; // Template — use {{key}} for context injection
  maxTokens?: number;
}

export interface SwarmDefinition {
  name: string; // "morning_checkin", "gap_detection", "weekly_review"
  description: string;
  agents: SwarmAgent[];
  synthesizerPrompt: string; // System prompt for the synthesizer agent
  timeoutMs?: number; // Default 30_000
}

export interface SwarmAgentResult {
  name: string;
  role: string;
  output: string;
  latencyMs: number;
  success: boolean;
  error?: string;
  cost: number;
}

export interface SwarmResult {
  swarmName: string;
  agentResults: SwarmAgentResult[];
  synthesis: string;
  totalCost: number;
  totalLatencyMs: number;
  agentsSucceeded: number;
  agentsFailed: number;
}

// =====================================================
// ORCHESTRATOR
// =====================================================

/**
 * Execute a swarm: fan-out N agents in parallel, then synthesize.
 *
 * @param definition - Swarm configuration (agents + synthesizer)
 * @param context - Data context to inject into agent prompts
 * @returns SwarmResult with individual + synthesized outputs
 */
export async function executeSwarm(
  definition: SwarmDefinition,
  context: Record<string, unknown>,
): Promise<SwarmResult> {
  const swarmStart = Date.now();
  const timeoutMs = definition.timeoutMs ?? 30_000;

  console.info(
    `[Swarm:${definition.name}] Starting with ${definition.agents.length} agents`,
  );

  // 1. Fan-out: execute all agents in parallel
  const agentPromises = definition.agents.map((agent) =>
    executeAgent(agent, context, timeoutMs),
  );

  const settled = await Promise.allSettled(agentPromises);

  // 2. Collect results
  const agentResults: SwarmAgentResult[] = settled.map((result, i) => {
    const agent = definition.agents[i];
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      name: agent.name,
      role: agent.role,
      output: "",
      latencyMs: 0,
      success: false,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
      cost: 0,
    };
  });

  const succeeded = agentResults.filter((r) => r.success);
  const failed = agentResults.filter((r) => !r.success);

  console.info(
    `[Swarm:${definition.name}] Agents: ${succeeded.length} OK, ${failed.length} failed`,
  );

  if (failed.length > 0) {
    logger.warn(
      `[Swarm:${definition.name}] Failed agents:`,
      failed.map((f) => f.name),
    );
  }

  // 3. Synthesize (only if we have at least 1 successful result)
  let synthesis = "Brak wystarczających danych do syntezy.";
  let synthesisCost = 0;

  if (succeeded.length > 0) {
    try {
      const synthResult = await synthesizeResults(
        definition.synthesizerPrompt,
        succeeded,
        context,
        timeoutMs,
      );
      synthesis = synthResult.content;
      synthesisCost = synthResult.cost;
    } catch (error) {
      console.error(`[Swarm:${definition.name}] Synthesis failed:`, error);
      // Fallback: concatenate agent outputs
      synthesis = succeeded
        .map((r) => `### ${r.name}\n${r.output}`)
        .join("\n\n");
    }
  }

  const totalCost =
    agentResults.reduce((sum, r) => sum + r.cost, 0) + synthesisCost;
  const totalLatencyMs = Date.now() - swarmStart;

  console.info(
    `[Swarm:${definition.name}] Done in ${totalLatencyMs}ms, cost: $${totalCost.toFixed(4)}`,
  );

  return {
    swarmName: definition.name,
    agentResults,
    synthesis,
    totalCost,
    totalLatencyMs,
    agentsSucceeded: succeeded.length,
    agentsFailed: failed.length,
  };
}

// =====================================================
// INTERNAL
// =====================================================

async function executeAgent(
  agent: SwarmAgent,
  context: Record<string, unknown>,
  timeoutMs: number,
): Promise<SwarmAgentResult> {
  const start = Date.now();

  try {
    // Inject context into user prompt
    const userPrompt = injectContext(agent.userPrompt, context);

    const messages: AIMessage[] = [
      { role: "system", content: agent.systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const response: AIResponse = await Promise.race([
      aiChat(messages, {
        forceModel: "kimi-k2.5",
        maxTokens: agent.maxTokens ?? 1024,
        temperature: 0.5,
      }),
      timeoutPromise<AIResponse>(timeoutMs, `Agent ${agent.name} timed out`),
    ]);

    return {
      name: agent.name,
      role: agent.role,
      output: response.content,
      latencyMs: Date.now() - start,
      success: true,
      cost: response.usage.estimatedCost,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Swarm] Agent ${agent.name} failed:`, errorMsg);

    return {
      name: agent.name,
      role: agent.role,
      output: "",
      latencyMs: Date.now() - start,
      success: false,
      error: errorMsg,
      cost: 0,
    };
  }
}

async function synthesizeResults(
  synthesizerPrompt: string,
  results: SwarmAgentResult[],
  context: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ content: string; cost: number }> {
  const agentOutputs = results
    .map((r) => `## ${r.name} (${r.role})\n${r.output}`)
    .join("\n\n---\n\n");

  const userName = (context.userName as string) || "użytkownik";

  const messages: AIMessage[] = [
    { role: "system", content: synthesizerPrompt },
    {
      role: "user",
      content: `Synthesize these agent analyses for ${userName}:\n\n${agentOutputs}`,
    },
  ];

  const response = await Promise.race([
    aiChat(messages, {
      forceModel: "kimi-k2.5",
      maxTokens: 2048,
      temperature: 0.6,
    }),
    timeoutPromise<AIResponse>(timeoutMs, "Synthesizer timed out"),
  ]);

  return {
    content: response.content,
    cost: response.usage.estimatedCost,
  };
}

/**
 * Replace {{key}} placeholders in prompt with context values.
 */
function injectContext(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = context[key];
    if (value === undefined || value === null) return "(brak danych)";
    if (typeof value === "string") return value;
    return JSON.stringify(value, null, 2);
  });
}

function timeoutPromise<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}
