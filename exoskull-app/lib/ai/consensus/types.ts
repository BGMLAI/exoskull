/**
 * Byzantine Consensus Types
 */

export type ConsensusDecision = "approve" | "reject" | "escalate";

export interface ValidatorVote {
  model: string;
  provider: string;
  decision: ConsensusDecision;
  reasoning: string;
  confidence: number; // 0-1
  latencyMs: number;
}

export interface ConsensusResult {
  /** Final decision based on supermajority */
  decision: ConsensusDecision;
  /** Individual validator votes */
  votes: ValidatorVote[];
  /** Number of validators that agreed with the decision */
  agreementCount: number;
  /** Total validators */
  totalValidators: number;
  /** Whether supermajority was reached (2/3) */
  supermajorityReached: boolean;
  /** Reasoning summary from majority voters */
  reasoning: string;
  /** Total tokens across all validators */
  totalTokens: number;
  /** Total latency (parallel execution, so max latency of validators) */
  latencyMs: number;
}

export interface ByzantineAction {
  /** What the user/system wants to do */
  actionType: string;
  /** Description of the action */
  description: string;
  /** Domain context */
  domain: string;
  /** User/tenant context */
  tenantContext?: string;
  /** Risk level assessment */
  riskLevel: "medium" | "high" | "critical";
}
