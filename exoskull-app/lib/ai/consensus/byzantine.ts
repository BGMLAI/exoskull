/**
 * Byzantine Consensus — Multi-model validation for critical decisions.
 *
 * When ExoSkull is about to take a real-world action (spending money,
 * calling strangers, granting autonomy, deleting data), it runs the
 * action through 4 independent AI validators using different models.
 *
 * A 2/3 supermajority is required to approve. If no supermajority,
 * the action is escalated to the user.
 *
 * Validators:
 *   1. Gemini Pro     — analytical/data-focused validation
 *   2. Claude Sonnet  — balanced risk assessment
 *   3. Claude Haiku   — fast practical check
 *   4. Gemini Flash   — speed validator (tie-breaker)
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import type {
  ByzantineAction,
  ConsensusResult,
  ValidatorVote,
  ConsensusDecision,
} from "./types";

export type {
  ByzantineAction,
  ConsensusResult,
  ValidatorVote,
  ConsensusDecision,
};

// ============================================================================
// VALIDATOR CONFIGS
// ============================================================================

interface ValidatorConfig {
  name: string;
  model: string;
  provider: "anthropic" | "gemini";
  role: string;
}

const VALIDATORS: ValidatorConfig[] = [
  {
    name: "Risk Analyst",
    model: "gemini-2.0-flash",
    provider: "gemini",
    role: "You are a risk analyst. Focus on potential downsides, financial exposure, and worst-case scenarios.",
  },
  {
    name: "Ethics & Safety",
    model: "claude-sonnet-4-5-20250929",
    provider: "anthropic",
    role: "You are an ethics and safety reviewer. Focus on user consent, privacy, legal implications, and potential harm.",
  },
  {
    name: "Practical Validator",
    model: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    role: "You are a practical validator. Focus on whether the action is feasible, reversible, and proportionate to the goal.",
  },
  {
    name: "Speed Check",
    model: "gemini-2.0-flash",
    provider: "gemini",
    role: "You are a quick-check validator. Give a fast, decisive assessment of whether this action should proceed.",
  },
];

const VALIDATOR_PROMPT = `You are a validator in a Byzantine consensus system for an AI life operating system called ExoSkull.

{role}

## Action to Validate
Type: {actionType}
Description: {description}
Domain: {domain}
Risk Level: {riskLevel}
{tenantContext}

## Your Task
Decide whether this action should be APPROVED, REJECTED, or ESCALATED to the user.

Consider:
1. Is this action safe for the user?
2. Does the user likely want this?
3. Are there irreversible consequences?
4. Is the risk proportionate to the benefit?

Reply with EXACTLY this format:
DECISION: APPROVE | REJECT | ESCALATE
CONFIDENCE: 0.0-1.0
REASONING: (2-3 sentences)`;

// ============================================================================
// VALIDATORS
// ============================================================================

async function runAnthropicValidator(
  config: ValidatorConfig,
  action: ByzantineAction,
): Promise<ValidatorVote> {
  const startMs = Date.now();

  const prompt = VALIDATOR_PROMPT.replace("{role}", config.role)
    .replace("{actionType}", action.actionType)
    .replace("{description}", action.description)
    .replace("{domain}", action.domain)
    .replace("{riskLevel}", action.riskLevel)
    .replace(
      "{tenantContext}",
      action.tenantContext ? `Context: ${action.tenantContext}` : "",
    );

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return parseVote(config, text, Date.now() - startMs);
  } catch (err) {
    logger.error(`[Byzantine] ${config.name} validator failed:`, {
      error: err instanceof Error ? err.message : String(err),
    });
    // Failed validator = escalate (conservative)
    return {
      model: config.model,
      provider: config.provider,
      decision: "escalate",
      reasoning: `Validator failed: ${err instanceof Error ? err.message : "unknown"}`,
      confidence: 0,
      latencyMs: Date.now() - startMs,
    };
  }
}

async function runGeminiValidator(
  config: ValidatorConfig,
  action: ByzantineAction,
): Promise<ValidatorVote> {
  const startMs = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // Fallback to Anthropic
    return runAnthropicValidator(
      { ...config, model: "claude-haiku-4-5-20251001", provider: "anthropic" },
      action,
    );
  }

  const prompt = VALIDATOR_PROMPT.replace("{role}", config.role)
    .replace("{actionType}", action.actionType)
    .replace("{description}", action.description)
    .replace("{domain}", action.domain)
    .replace("{riskLevel}", action.riskLevel)
    .replace(
      "{tenantContext}",
      action.tenantContext ? `Context: ${action.tenantContext}` : "",
    );

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 256 },
        }),
      },
    );

    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return parseVote(config, text, Date.now() - startMs);
  } catch (err) {
    logger.error(`[Byzantine] ${config.name} Gemini validator failed:`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      model: config.model,
      provider: config.provider,
      decision: "escalate",
      reasoning: `Gemini validator failed`,
      confidence: 0,
      latencyMs: Date.now() - startMs,
    };
  }
}

function parseVote(
  config: ValidatorConfig,
  text: string,
  latencyMs: number,
): ValidatorVote {
  let decision: ConsensusDecision = "escalate";
  if (/DECISION:\s*APPROVE/i.test(text)) decision = "approve";
  else if (/DECISION:\s*REJECT/i.test(text)) decision = "reject";
  else if (/DECISION:\s*ESCALATE/i.test(text)) decision = "escalate";

  const confidenceMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;

  const reasoningMatch = text.match(/REASONING:\s*(.+)/is);
  const reasoning = reasoningMatch
    ? reasoningMatch[1].trim().slice(0, 300)
    : "No reasoning provided.";

  return {
    model: config.model,
    provider: config.provider,
    decision,
    reasoning,
    confidence: Math.min(Math.max(confidence, 0), 1),
    latencyMs,
  };
}

// ============================================================================
// CONSENSUS ENGINE
// ============================================================================

/**
 * Run Byzantine consensus for a critical action.
 *
 * 4 validators run in parallel. 2/3 supermajority required for approve/reject.
 * Otherwise: escalate to user.
 */
export async function runByzantineConsensus(
  action: ByzantineAction,
): Promise<ConsensusResult> {
  const startMs = Date.now();

  logger.info("[Byzantine] Starting consensus for:", {
    actionType: action.actionType,
    riskLevel: action.riskLevel,
    domain: action.domain,
  });

  // Run all validators in parallel
  const votePromises = VALIDATORS.map((config) =>
    config.provider === "gemini"
      ? runGeminiValidator(config, action)
      : runAnthropicValidator(config, action),
  );

  const votes = await Promise.all(votePromises);
  const latencyMs = Date.now() - startMs;

  // Count votes
  const counts: Record<ConsensusDecision, number> = {
    approve: 0,
    reject: 0,
    escalate: 0,
  };
  for (const vote of votes) {
    counts[vote.decision]++;
  }

  // Supermajority = 2/3 of total validators (3 out of 4)
  const supermajorityThreshold = Math.ceil((VALIDATORS.length * 2) / 3);
  let decision: ConsensusDecision = "escalate";
  let supermajorityReached = false;

  if (counts.approve >= supermajorityThreshold) {
    decision = "approve";
    supermajorityReached = true;
  } else if (counts.reject >= supermajorityThreshold) {
    decision = "reject";
    supermajorityReached = true;
  }
  // If no supermajority → escalate (conservative default)

  // Build reasoning from majority voters
  const majorityVotes = votes.filter((v) => v.decision === decision);
  const reasoning =
    majorityVotes.length > 0
      ? majorityVotes.map((v) => v.reasoning).join(" | ")
      : "No consensus reached — escalating to user for decision.";

  const result: ConsensusResult = {
    decision,
    votes,
    agreementCount: counts[decision],
    totalValidators: VALIDATORS.length,
    supermajorityReached,
    reasoning,
    totalTokens: 0, // Token tracking would need provider-specific extraction
    latencyMs,
  };

  logger.info("[Byzantine] Consensus result:", {
    decision,
    votes: counts,
    supermajority: supermajorityReached,
    latencyMs,
  });

  return result;
}

/**
 * Check if an action requires Byzantine consensus.
 */
export function requiresConsensus(actionType: string): boolean {
  const CRITICAL_ACTIONS = new Set([
    "make_call", // Calling strangers
    "purchase", // Spending money
    "grant_autonomy", // Granting system permissions
    "delete_data", // Deleting user data
    "send_money", // Financial transactions
    "deploy_app", // Deploying to production
    "cancel_service", // Canceling subscriptions
    "share_data", // Sharing user data externally
  ]);

  return CRITICAL_ACTIONS.has(actionType);
}
