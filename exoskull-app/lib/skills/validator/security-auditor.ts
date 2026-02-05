// =====================================================
// SECURITY AUDITOR - Risk scoring and vulnerability detection
// =====================================================

import {
  SecurityAuditResult,
  SkillRiskLevel,
  SkillCapabilities,
  StaticAnalysisResult,
} from "../types";
import { analyzeCode } from "./static-analyzer";

/**
 * Performs full security audit on generated skill code
 * Returns audit result with risk level and any detected issues
 */
export function auditSkillCode(
  code: string,
  capabilities: SkillCapabilities,
): SecurityAuditResult {
  const staticAnalysis = analyzeCode(code);

  // Calculate risk score (0-100)
  const riskScore = calculateRiskScore(staticAnalysis, capabilities);

  return {
    passed: staticAnalysis.passed,
    blockedPatterns: staticAnalysis.blockedPatterns.map((p) => p.pattern),
    warnings: staticAnalysis.warnings,
    riskScore,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Classify risk level based on capabilities and audit results
 */
export function classifyRiskLevel(
  capabilities: SkillCapabilities,
): SkillRiskLevel {
  // High risk: any delete, external API, or write to non-standard tables
  if (capabilities.externalApi) return "high";

  // Medium risk: write operations
  if (capabilities.database.includes("write")) return "medium";

  // Low risk: read-only
  return "low";
}

/**
 * Calculate risk score 0-100 based on multiple factors
 */
function calculateRiskScore(
  staticAnalysis: StaticAnalysisResult,
  capabilities: SkillCapabilities,
): number {
  let score = 0;

  // Blocked patterns = immediate high risk
  if (!staticAnalysis.passed) {
    score += 80;
  }

  // Warnings add moderate risk
  score += Math.min(staticAnalysis.warnings.length * 5, 20);

  // Capability-based risk
  if (capabilities.database.includes("write")) score += 15;
  if (capabilities.externalApi) score += 30;
  if (capabilities.notifications) score += 5;

  // Number of tables accessed
  score += Math.min(capabilities.tables.length * 3, 15);

  return Math.min(score, 100);
}

/**
 * Extract capabilities from the generated code by analyzing patterns
 */
export function extractCapabilities(code: string): SkillCapabilities {
  const capabilities: SkillCapabilities = {
    database: [],
    tables: [],
    notifications: false,
    externalApi: false,
  };

  // Detect database operations
  if (/\.select\s*\(/.test(code)) {
    if (!capabilities.database.includes("read")) {
      capabilities.database.push("read");
    }
  }

  if (
    /\.insert\s*\(/.test(code) ||
    /\.update\s*\(/.test(code) ||
    /\.upsert\s*\(/.test(code)
  ) {
    if (!capabilities.database.includes("write")) {
      capabilities.database.push("write");
    }
  }

  // Extract table names from .from("table_name") patterns
  const tableMatches = code.matchAll(/\.from\s*\(\s*["']([^"']+)["']\s*\)/g);
  const tables = new Set<string>();
  for (const match of tableMatches) {
    tables.add(match[1]);
  }
  capabilities.tables = Array.from(tables);

  // Check for fetch/HTTP (shouldn't be there, but detect it)
  if (
    /fetch\s*\(/.test(code) ||
    /XMLHttpRequest/.test(code) ||
    /\.get\s*\(\s*["']http/.test(code)
  ) {
    capabilities.externalApi = true;
  }

  // Check for notification patterns
  if (/send_sms|send_email|notification|alert\s*\(/.test(code)) {
    capabilities.notifications = true;
  }

  return capabilities;
}
