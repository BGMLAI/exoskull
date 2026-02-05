// =====================================================
// DYNAMIC SKILLS - Core Types
// =====================================================

import { ModInsight, ModAction } from "../mods/types";

// =====================================================
// Skill Capabilities & Security
// =====================================================

export interface SkillCapabilities {
  database: ("read" | "write")[];
  tables: string[];
  notifications: boolean;
  externalApi: boolean;
}

export interface SecurityAuditResult {
  passed: boolean;
  blockedPatterns: string[];
  warnings: string[];
  riskScore: number; // 0-100
  analyzedAt: string;
}

export type SkillRiskLevel = "low" | "medium" | "high";
export type SkillApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revoked";
export type SkillTier = "custom" | "community" | "verified";

// =====================================================
// Generated Skill (DB row representation)
// =====================================================

export interface GeneratedSkill {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  tier: SkillTier;
  executor_code: string;
  config_schema: Record<string, unknown>;
  capabilities: SkillCapabilities;
  allowed_tools: string[];
  risk_level: SkillRiskLevel;
  generation_prompt: string | null;
  generated_by: string;
  generation_tokens: number | null;
  approval_status: SkillApprovalStatus;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  security_audit: SecurityAuditResult;
  last_audit_at: string | null;
  usage_count: number;
  last_used_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

// =====================================================
// Skill Generation
// =====================================================

export interface SkillGenerationRequest {
  tenant_id: string;
  description: string;
  source: "user_request" | "gap_detection" | "pattern_match";
}

export interface SkillGenerationResult {
  success: boolean;
  skill?: GeneratedSkill;
  error?: string;
  validationErrors?: string[];
}

// =====================================================
// Skill Execution
// =====================================================

export interface SkillExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTimeMs: number;
  memoryUsedMb?: number;
}

export interface SkillExecutionContext {
  tenant_id: string;
  skill_id: string;
  method: "getData" | "getInsights" | "executeAction" | "getActions";
  args: unknown[];
}

// =====================================================
// Validation
// =====================================================

export interface StaticAnalysisResult {
  passed: boolean;
  blockedPatterns: { pattern: string; line: number; column: number }[];
  warnings: string[];
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
  detectedSlug: string | null;
  detectedMethods: string[];
  detectedActions: string[];
}

// =====================================================
// Approval
// =====================================================

export interface SkillApprovalRequest {
  id: string;
  tenant_id: string;
  skill_id: string;
  request_reason: string;
  capability_disclosure: Record<string, unknown>;
  status:
    | "pending"
    | "channel_1_confirmed"
    | "approved"
    | "rejected"
    | "expired";
  confirmation_code: string;
  requires_2fa: boolean;
  channel_1: string | null;
  channel_1_confirmed_at: string | null;
  channel_2: string | null;
  channel_2_confirmed_at: string | null;
  requested_at: string;
  expires_at: string;
  responded_at: string | null;
}

// =====================================================
// Skill Version
// =====================================================

export interface SkillVersion {
  id: string;
  skill_id: string;
  version: string;
  executor_code: string;
  config_schema: Record<string, unknown>;
  capabilities: SkillCapabilities;
  changelog: string | null;
  created_at: string;
}
