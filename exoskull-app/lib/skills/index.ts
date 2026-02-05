// =====================================================
// DYNAMIC SKILLS - Public API
// =====================================================

// Types
export type {
  GeneratedSkill,
  SkillCapabilities,
  SecurityAuditResult,
  SkillRiskLevel,
  SkillApprovalStatus,
  SkillGenerationRequest,
  SkillGenerationResult,
  SkillExecutionResult,
  SkillExecutionContext,
  StaticAnalysisResult,
  SchemaValidationResult,
  SkillApprovalRequest,
  SkillVersion,
} from "./types";

// Generator
export { generateSkill } from "./generator/skill-generator";

// Validators
export { analyzeCode } from "./validator/static-analyzer";
export {
  auditSkillCode,
  extractCapabilities,
  classifyRiskLevel,
} from "./validator/security-auditor";
export { validateSchema } from "./validator/schema-validator";

// Sandbox
export { executeInSandbox } from "./sandbox/restricted-function";
export { logExecution } from "./sandbox/execution-logger";

// Approval
export {
  initiateApproval,
  confirmChannel,
  rejectApproval,
} from "./approval/approval-gateway";
export { generateDisclosure } from "./approval/disclosure-generator";

// Registry
export {
  getDynamicSkillExecutor,
  hasDynamicSkill,
  getActiveSkillsForTenant,
  invalidateSkillCache,
  clearSkillCache,
} from "./registry/dynamic-registry";
export {
  saveVersion,
  getVersions,
  rollbackToVersion,
} from "./registry/version-manager";
