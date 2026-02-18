/**
 * Kernel Guard — Immutable file protection for self-modification engine.
 *
 * Single source of truth for which files can NEVER be modified by the system.
 * This file is itself in KERNEL_PATHS, preventing recursive self-modification.
 *
 * Safety hierarchy:
 *   KERNEL  → BLOCKED (hard stop, never reaches PR)
 *   HIGH    → SMS + 2FA confirmation required
 *   MEDIUM  → SMS to user, manual merge
 *   LOW     → Auto-merge if tests pass + guardian > 7
 */

// ============================================================================
// KERNEL PATHS — files the system CANNOT modify (immutable)
// ============================================================================

const KERNEL_PATHS: string[] = [
  // Auth & session
  "middleware.ts",
  "lib/supabase/middleware.ts",
  "lib/supabase/service.ts",

  // Multi-tenancy enforcement
  "lib/supabase/server.ts",

  // Billing & payments
  "app/api/webhooks/stripe/route.ts",

  // Security core
  "lib/security/safety-guardrails.ts",
  "lib/autonomy/guardian.ts",
  "lib/autonomy/permission-model.ts",

  // Self-modification engine itself (prevents recursive takeover)
  "lib/self-modification/kernel-guard.ts",
  "lib/self-modification/source-engine.ts",
  "lib/self-modification/diff-generator.ts",
  "lib/self-modification/pr-pipeline.ts",

  // Admin & cron protection
  "lib/admin/cron-guard.ts",
  "lib/admin/auth.ts",
];

// Normalized set for fast lookup
const KERNEL_SET = new Set(KERNEL_PATHS.map(normalizePath));

// ============================================================================
// PROTECTED PATTERNS — regex patterns that cannot appear in generated code
// ============================================================================

const PROTECTED_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /process\.env\./, label: "process.env access" },
  { pattern: /eval\s*\(/, label: "eval()" },
  { pattern: /Function\s*\(/, label: "Function constructor" },
  { pattern: /require\s*\(/, label: "dynamic require()" },
  { pattern: /child_process/, label: "child_process module" },
  { pattern: /fs\.(write|unlink|rm)/, label: "filesystem write/delete" },
  { pattern: /supabase\.auth/, label: "auth manipulation" },
  { pattern: /\.rpc\(['"]check_autonomy/, label: "permission bypass" },
  { pattern: /KERNEL_PATHS/, label: "kernel config modification" },
  { pattern: /exec\s*\(/, label: "exec()" },
  { pattern: /spawn\s*\(/, label: "spawn()" },
];

// ============================================================================
// HIGH-RISK PATH PATTERNS — require elevated approval
// ============================================================================

const HIGH_RISK_PATTERNS: RegExp[] = [
  /^lib\/autonomy\//,
  /^lib\/ai\//,
  /^app\/api\/webhooks\//,
  /^lib\/security\//,
];

const MEDIUM_RISK_PATTERNS: RegExp[] = [/^lib\//, /^app\/api\//];

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if a file path is a kernel-protected file.
 * Kernel files can NEVER be modified by the self-modification engine.
 */
export function isKernelFile(filePath: string): boolean {
  return KERNEL_SET.has(normalizePath(filePath));
}

/**
 * Validate generated code against protected patterns.
 * Returns { safe: true } if no violations, or { safe: false, violations } otherwise.
 */
export function validateGeneratedCode(code: string): {
  safe: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  for (const { pattern, label } of PROTECTED_PATTERNS) {
    if (pattern.test(code)) {
      violations.push(label);
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}

/**
 * Classify the modification risk level for a given file path.
 *
 * - "kernel"  → KERNEL_PATHS match → BLOCKED, never allowed
 * - "high"    → lib/autonomy/*, lib/ai/*, app/api/webhooks/*
 * - "medium"  → lib/*, app/api/*
 * - "low"     → new files, app/(dashboard)/*, tests/*
 */
export function getModificationRisk(
  filePath: string,
): "kernel" | "high" | "medium" | "low" {
  const normalized = normalizePath(filePath);

  // Kernel check first
  if (KERNEL_SET.has(normalized)) {
    return "kernel";
  }

  // High risk
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(normalized)) {
      return "high";
    }
  }

  // Medium risk
  for (const pattern of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(normalized)) {
      return "medium";
    }
  }

  // Everything else is low risk
  return "low";
}

/**
 * Get the overall risk level for a set of files.
 * Returns the highest risk among all files.
 */
export function getOverallRisk(
  filePaths: string[],
): "kernel" | "high" | "medium" | "low" {
  let highest: "kernel" | "high" | "medium" | "low" = "low";
  const order = { kernel: 3, high: 2, medium: 1, low: 0 } as const;

  for (const fp of filePaths) {
    const risk = getModificationRisk(fp);
    if (order[risk] > order[highest]) {
      highest = risk;
    }
    if (highest === "kernel") return "kernel"; // Early exit
  }

  return highest;
}

/**
 * Check multiple files against kernel guard at once.
 * Returns blocked files (if any) and overall risk.
 */
export function checkFiles(filePaths: string[]): {
  allowed: boolean;
  blockedFiles: string[];
  overallRisk: "kernel" | "high" | "medium" | "low";
} {
  const blockedFiles = filePaths.filter((fp) => isKernelFile(fp));
  const overallRisk = getOverallRisk(filePaths);

  return {
    allowed: blockedFiles.length === 0,
    blockedFiles,
    overallRisk,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
}
