/**
 * Skill Smoke Test — Verify generated code actually works.
 *
 * After AI generates code and it passes static/schema/security validation,
 * we run it in the sandbox and call getActions() + getData() to verify
 * it doesn't crash. This catches runtime errors that static analysis misses.
 *
 * Pattern inspired by OpenClaw probe-based verification + E2B execute-verify loop.
 */

import { executeInSandbox } from "../sandbox/restricted-function";
import { SkillExecutionResult } from "../types";

export interface SmokeTestResult {
  passed: boolean;
  getActionsResult: SkillExecutionResult | null;
  getDataResult: SkillExecutionResult | null;
  errors: string[];
  durationMs: number;
}

/**
 * Run smoke test on generated skill code.
 * Executes getActions() and getData() in sandbox to verify basic functionality.
 *
 * @param code - The generated TypeScript code
 * @param tenantId - Tenant ID for data context
 * @param skillId - Skill ID for logging
 */
export async function runSmokeTest(
  code: string,
  tenantId: string,
  skillId: string,
): Promise<SmokeTestResult> {
  const start = performance.now();
  const errors: string[] = [];

  // Test 1: getActions() — must return an array (pure function, no DB needed)
  const actionsResult = await executeInSandbox(
    {
      tenant_id: tenantId,
      skill_id: skillId,
      method: "getActions",
      args: [],
    },
    code,
  );

  if (!actionsResult.success) {
    errors.push(`getActions() failed: ${actionsResult.error}`);
  } else if (!Array.isArray(actionsResult.result)) {
    errors.push(
      `getActions() must return array, got ${typeof actionsResult.result}`,
    );
  }

  // Test 2: getData() — must return an object (may query DB, empty data is OK)
  const dataResult = await executeInSandbox(
    {
      tenant_id: tenantId,
      skill_id: skillId,
      method: "getData",
      args: [],
    },
    code,
  );

  if (!dataResult.success) {
    errors.push(`getData() failed: ${dataResult.error}`);
  } else if (
    dataResult.result === null ||
    typeof dataResult.result !== "object"
  ) {
    errors.push(
      `getData() must return object, got ${typeof dataResult.result}`,
    );
  }

  const durationMs = Math.round(performance.now() - start);

  return {
    passed: errors.length === 0,
    getActionsResult: actionsResult,
    getDataResult: dataResult,
    errors,
    durationMs,
  };
}

/**
 * Run health check on an approved skill — same as smoke test but also tests getInsights().
 * Used by CRON job to verify skills still work over time.
 */
export async function runHealthCheck(
  code: string,
  tenantId: string,
  skillId: string,
): Promise<SmokeTestResult> {
  const baseResult = await runSmokeTest(code, tenantId, skillId);

  // Additionally test getInsights()
  const insightsResult = await executeInSandbox(
    {
      tenant_id: tenantId,
      skill_id: skillId,
      method: "getInsights",
      args: [],
    },
    code,
  );

  if (!insightsResult.success) {
    baseResult.errors.push(`getInsights() failed: ${insightsResult.error}`);
    baseResult.passed = false;
  } else if (!Array.isArray(insightsResult.result)) {
    baseResult.errors.push(
      `getInsights() must return array, got ${typeof insightsResult.result}`,
    );
    baseResult.passed = false;
  }

  return baseResult;
}
