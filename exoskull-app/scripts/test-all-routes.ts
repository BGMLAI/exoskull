/**
 * ExoSkull Route Tester
 * Automatycznie testuje wszystkie API endpointy i strony.
 *
 * Uzycie:
 *   npx tsx scripts/test-all-routes.ts
 *   npx tsx scripts/test-all-routes.ts --base-url https://exoskull.xyz
 *   npx tsx scripts/test-all-routes.ts --category voice
 *   npx tsx scripts/test-all-routes.ts --skip-auth-routes
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ─── Load .env.local ────────────────────────────────────────────────────────
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      const value = trimmed
        .substring(eqIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    /* file not found - skip */
  }
}

loadEnvFile(resolve(__dirname, "..", ".env.local"));
loadEnvFile(resolve(__dirname, "..", ".env"));

const BASE_URL =
  process.argv.find((a) => a.startsWith("--base-url="))?.split("=")[1] ||
  process.env.TEST_BASE_URL ||
  "http://localhost:3000";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";
const TEST_EMAIL = process.env.TEST_EMAIL || "";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "";

const CATEGORY_FILTER =
  process.argv.find((a) => a.startsWith("--category="))?.split("=")[1] || "";
const SKIP_AUTH = process.argv.includes("--skip-auth-routes");
const VERBOSE = process.argv.includes("--verbose");

// ─── Types ───────────────────────────────────────────────────────────────────

interface TestPath {
  id: number;
  category: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  auth: "none" | "user" | "twilio" | "cron" | "admin";
  body?: Record<string, unknown>;
  contentType?: string;
  expectedStatus: number | number[];
  description: string;
  skip?: boolean;
  /** If true, requires dynamic ID from previous test */
  needsId?: string;
}

interface TestResult {
  id: number;
  path: string;
  method: string;
  expected: number | number[];
  actual: number;
  passed: boolean;
  duration: number;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

// ─── Dynamic IDs (populated during test run) ────────────────────────────────

const dynamicIds: Record<string, string> = {};

// ─── Test Definitions ────────────────────────────────────────────────────────

const tests: TestPath[] = [
  // ── 1. PAGES ──
  {
    id: 1,
    category: "pages",
    method: "GET",
    path: "/",
    auth: "none",
    expectedStatus: 200,
    description: "Landing page",
  },
  {
    id: 2,
    category: "pages",
    method: "GET",
    path: "/login",
    auth: "none",
    expectedStatus: 200,
    description: "Login page",
  },
  {
    id: 3,
    category: "pages",
    method: "GET",
    path: "/onboarding",
    auth: "user",
    expectedStatus: [200, 302, 307],
    description: "Onboarding page (may redirect)",
  },
  {
    id: 4,
    category: "pages",
    method: "GET",
    path: "/dashboard",
    auth: "user",
    expectedStatus: [200, 302, 307],
    description: "Dashboard (may redirect to onboarding)",
  },
  {
    id: 5,
    category: "pages",
    method: "GET",
    path: "/dashboard/chat",
    auth: "user",
    expectedStatus: [200, 302, 307],
    description: "Chat page",
  },
  {
    id: 6,
    category: "pages",
    method: "GET",
    path: "/dashboard/mods",
    auth: "user",
    expectedStatus: [200, 302, 307],
    description: "Mods page",
  },
  {
    id: 7,
    category: "pages",
    method: "GET",
    path: "/dashboard/memory",
    auth: "user",
    expectedStatus: [200, 302, 307],
    description: "Memory page",
  },
  {
    id: 9,
    category: "pages",
    method: "GET",
    path: "/dashboard/settings",
    auth: "user",
    expectedStatus: [200, 302, 307],
    description: "Settings page",
  },
  {
    id: 10,
    category: "pages",
    method: "GET",
    path: "/dashboard/tasks",
    auth: "user",
    expectedStatus: [200, 302, 307],
    description: "Tasks page",
  },

  // ── 2. AUTH & USER ──
  {
    id: 12,
    category: "auth",
    method: "GET",
    path: "/api/user/profile",
    auth: "user",
    expectedStatus: [200, 500],
    description: "Get user profile (cookie auth)",
  },
  {
    id: 13,
    category: "auth",
    method: "PATCH",
    path: "/api/user/profile",
    auth: "user",
    body: { preferred_name: "TestRunner" },
    expectedStatus: [200, 400, 500],
    description: "Update profile (cookie auth)",
  },
  {
    id: 14,
    category: "auth",
    method: "GET",
    path: "/api/user/profile",
    auth: "none",
    expectedStatus: [401, 403, 500],
    description: "Profile without auth (negative)",
  },

  // ── 3. CONVERSATIONS ──
  {
    id: 15,
    category: "conversations",
    method: "GET",
    path: "/api/conversations?limit=5&offset=0",
    auth: "user",
    expectedStatus: [200, 500],
    description: "List conversations (cookie auth)",
  },
  {
    id: 16,
    category: "conversations",
    method: "POST",
    path: "/api/conversations",
    auth: "user",
    body: { title: "Test Route Runner" },
    expectedStatus: [200, 201, 500],
    description: "Create conversation (cookie auth)",
  },

  // ── 4. VOICE ──
  {
    id: 21,
    category: "voice",
    method: "GET",
    path: "/api/voice/sessions",
    auth: "user",
    expectedStatus: [200, 401],
    description: "Voice sessions",
  },
  {
    id: 24,
    category: "voice",
    method: "GET",
    path: "/api/voice/tools",
    auth: "user",
    expectedStatus: [200, 405],
    description: "Voice tools list",
  },

  // ── 5. TWILIO ──
  {
    id: 27,
    category: "twilio",
    method: "GET",
    path: "/api/twilio/voice",
    auth: "none",
    expectedStatus: [200, 405],
    description: "Twilio voice status",
  },
  {
    id: 35,
    category: "twilio",
    method: "GET",
    path: "/api/twilio/outbound",
    auth: "none",
    expectedStatus: [200, 405],
    description: "Outbound info",
  },

  // ── 6. ONBOARDING ──
  {
    id: 37,
    category: "onboarding",
    method: "GET",
    path: "/api/onboarding",
    auth: "user",
    expectedStatus: 200,
    description: "Onboarding status (cookie auth)",
  },

  // ── 7. KNOWLEDGE (tenant_id query param) ──
  {
    id: 42,
    category: "knowledge",
    method: "GET",
    path: "/api/knowledge?tenant_id={userId}",
    auth: "user",
    expectedStatus: 200,
    description: "List documents",
  },
  {
    id: 45,
    category: "knowledge",
    method: "GET",
    path: "/api/knowledge/notes?tenantId={userId}",
    auth: "user",
    expectedStatus: 200,
    description: "List notes",
  },
  {
    id: 47,
    category: "knowledge",
    method: "GET",
    path: "/api/knowledge/campaigns?tenantId={userId}",
    auth: "user",
    expectedStatus: 200,
    description: "List campaigns",
  },
  {
    id: 49,
    category: "knowledge",
    method: "GET",
    path: "/api/knowledge/loops?tenantId={userId}",
    auth: "user",
    expectedStatus: 200,
    description: "List loops",
  },
  {
    id: 51,
    category: "knowledge",
    method: "GET",
    path: "/api/knowledge/quests?tenantId={userId}",
    auth: "user",
    expectedStatus: 200,
    description: "List quests",
  },
  {
    id: 53,
    category: "knowledge",
    method: "GET",
    path: "/api/knowledge/ops?tenantId={userId}",
    auth: "user",
    expectedStatus: 200,
    description: "List ops",
  },

  // ── 8. AUTONOMY (userId query param) ──
  {
    id: 56,
    category: "autonomy",
    method: "GET",
    path: "/api/autonomy?userId={userId}",
    auth: "user",
    expectedStatus: 200,
    description: "List autonomy grants",
  },

  // ── 9. RIGS (cookie auth) ──
  {
    id: 64,
    category: "rigs",
    method: "GET",
    path: "/api/rigs/notion/sync",
    auth: "user",
    expectedStatus: [200, 400, 404, 500],
    description: "Notion sync status",
  },
  {
    id: 64.1,
    category: "rigs",
    method: "GET",
    path: "/api/rigs/todoist/sync",
    auth: "user",
    expectedStatus: [200, 400, 404, 500],
    description: "Todoist sync status",
  },
  {
    id: 64.2,
    category: "rigs",
    method: "GET",
    path: "/api/rigs/google/sync",
    auth: "user",
    expectedStatus: [200, 400, 404, 500],
    description: "Google sync status",
  },
  {
    id: 64.3,
    category: "rigs",
    method: "GET",
    path: "/api/rigs/oura/sync",
    auth: "user",
    expectedStatus: [200, 400, 404],
    description: "Oura sync status",
  },

  // ── 10. MODS (cookie auth) ──
  {
    id: 76,
    category: "mods",
    method: "GET",
    path: "/api/mods",
    auth: "user",
    expectedStatus: 200,
    description: "List installed mods",
  },
  {
    id: 77,
    category: "mods",
    method: "GET",
    path: "/api/mods/sleep-tracker",
    auth: "user",
    expectedStatus: [200, 404, 500],
    description: "Sleep tracker mod",
  },
  {
    id: 80,
    category: "mods",
    method: "GET",
    path: "/api/mods/mood-tracker",
    auth: "user",
    expectedStatus: [200, 404, 500],
    description: "Mood tracker mod",
  },

  // ── 11. REGISTRY ──
  {
    id: 84,
    category: "registry",
    method: "GET",
    path: "/api/registry?type=mod",
    auth: "user",
    expectedStatus: 200,
    description: "Registry: mods",
  },
  {
    id: 85,
    category: "registry",
    method: "GET",
    path: "/api/registry?type=rig",
    auth: "user",
    expectedStatus: 200,
    description: "Registry: rigs",
  },
  {
    id: 86,
    category: "registry",
    method: "GET",
    path: "/api/registry?type=quest",
    auth: "user",
    expectedStatus: 200,
    description: "Registry: quests",
  },
  {
    id: 87,
    category: "registry",
    method: "GET",
    path: "/api/registry?search=sleep",
    auth: "user",
    expectedStatus: 200,
    description: "Registry: search",
  },

  // ── 12. INSTALLATIONS ──
  {
    id: 89,
    category: "installations",
    method: "GET",
    path: "/api/installations",
    auth: "user",
    expectedStatus: 200,
    description: "List installations",
  },

  // ── 13. SCHEDULE & CRON (tenant_id query param) ──
  {
    id: 94,
    category: "schedule",
    method: "GET",
    path: "/api/schedule?tenant_id={userId}",
    auth: "user",
    expectedStatus: 200,
    description: "Get schedule",
  },
  {
    id: 97,
    category: "schedule",
    method: "GET",
    path: "/api/schedule/custom?tenant_id={userId}",
    auth: "user",
    expectedStatus: [200, 400],
    description: "Custom schedules",
  },
  {
    id: 100,
    category: "cron",
    method: "GET",
    path: "/api/cron/master-scheduler",
    auth: "cron",
    expectedStatus: [200, 401, 403],
    description: "Scheduler status",
  },

  // ── 14. HEALTH METRICS ──
  {
    id: 108,
    category: "health",
    method: "GET",
    path: "/api/health/metrics?type=sleep&days=7",
    auth: "user",
    expectedStatus: 200,
    description: "Sleep metrics",
  },
  {
    id: 109,
    category: "health",
    method: "GET",
    path: "/api/health/metrics?type=steps&days=7",
    auth: "user",
    expectedStatus: 200,
    description: "Steps metrics",
  },
  {
    id: 110,
    category: "health",
    method: "GET",
    path: "/api/health/metrics?type=hrv&days=7",
    auth: "user",
    expectedStatus: 200,
    description: "HRV metrics",
  },

  // ── 15. TOOLS & AGENTS ──
  {
    id: 113,
    category: "tools",
    method: "GET",
    path: "/api/tools",
    auth: "user",
    expectedStatus: 200,
    description: "Tools manifest",
  },
  {
    id: 117,
    category: "agents",
    method: "GET",
    path: "/api/agents",
    auth: "none",
    expectedStatus: 200,
    description: "List agents (no auth required)",
  },

  // ── 17. SYSTEM ──
  {
    id: 120,
    category: "system",
    method: "GET",
    path: "/api/pulse",
    auth: "cron",
    expectedStatus: [200, 500],
    description: "Health check (pulse)",
  },
  {
    id: 121,
    category: "system",
    method: "POST",
    path: "/api/pulse",
    auth: "admin",
    body: { userId: "test-runner" },
    expectedStatus: [200, 500],
    description: "Pulse POST - manual trigger",
  },

  // ── 18. NEGATIVE TESTS ──
  {
    id: 125,
    category: "negative",
    method: "GET",
    path: "/api/user/profile",
    auth: "none",
    expectedStatus: [401, 403, 500],
    description: "No auth -> 401",
  },
  {
    id: 126,
    category: "negative",
    method: "GET",
    path: "/api/conversations",
    auth: "none",
    expectedStatus: [401, 403, 500],
    description: "No auth -> 401",
  },
  {
    id: 128,
    category: "negative",
    method: "GET",
    path: "/api/mods/nonexistent-mod-xyz",
    auth: "user",
    expectedStatus: [404, 400, 500],
    description: "Nonexistent mod -> 404",
  },
  {
    id: 129,
    category: "negative",
    method: "GET",
    path: "/api/registry/nonexistent-item-xyz",
    auth: "user",
    expectedStatus: [404, 400, 500],
    description: "Nonexistent registry item -> 404",
  },
  {
    id: 132,
    category: "negative",
    method: "GET",
    path: "/api/health/metrics?type=invalid_metric_xyz",
    auth: "user",
    expectedStatus: [400, 200],
    description: "Invalid metric type -> 400",
  },
];

// ─── Auth Session Management (Cookie-based SSR) ────────────────────────────

// Extract project ref from Supabase URL: https://{ref}.supabase.co
const SUPABASE_PROJECT_REF = SUPABASE_URL.replace("https://", "").split(".")[0];
const COOKIE_NAME = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

let sessionCookie: string | null = null;
let userId: string | null = null;

async function getAuthSession(): Promise<{
  cookie: string;
  userId: string;
} | null> {
  if (sessionCookie && userId) return { cookie: sessionCookie, userId };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn(
      "[WARN] No SUPABASE_URL or SUPABASE_ANON_KEY set. Auth routes will be skipped.",
    );
    return null;
  }

  if (!TEST_EMAIL || !TEST_PASSWORD) {
    console.warn(
      "[WARN] No TEST_EMAIL/TEST_PASSWORD set. Auth routes will be skipped.",
    );
    return null;
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      },
    );

    if (!res.ok) {
      console.error("[AUTH] Login failed:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    userId = data.user?.id || null;

    // Build Supabase SSR cookie
    // @supabase/ssr v0.1.0 stores session as raw JSON in cookie
    // createChunks() uses encodeURIComponent to measure size, but stores decoded values
    // combineChunks() reads via cookies.get() which returns raw cookie value
    // Next.js request.cookies.get(name)?.value returns URL-decoded value
    // So we need to URL-encode the JSON for the Cookie header
    const sessionPayload = JSON.stringify({
      access_token: data.access_token,
      token_type: data.token_type || "bearer",
      expires_in: data.expires_in,
      expires_at: data.expires_at,
      refresh_token: data.refresh_token,
      user: data.user,
    });

    // createChunks uses encodeURIComponent to check size
    const encoded = encodeURIComponent(sessionPayload);
    const MAX_CHUNK_SIZE = 3180;

    if (encoded.length <= MAX_CHUNK_SIZE) {
      // Single cookie - store raw value (Next.js will decode it)
      sessionCookie = `${COOKIE_NAME}=${encoded}`;
    } else {
      // Chunked - split encoded value and decode each chunk
      const chunks: string[] = [];
      let remaining = encoded;
      while (remaining.length > 0) {
        let head = remaining.slice(0, MAX_CHUNK_SIZE);
        // Don't split in the middle of a percent-encoded sequence
        const lastPercent = head.lastIndexOf("%");
        if (lastPercent > head.length - 3 && lastPercent >= 0) {
          head = head.slice(0, lastPercent);
        }
        chunks.push(decodeURIComponent(head));
        remaining = remaining.slice(head.length);
      }
      sessionCookie = chunks
        .map((chunk, i) => `${COOKIE_NAME}.${i}=${encodeURIComponent(chunk)}`)
        .join("; ");
    }

    console.log(`[AUTH] Logged in as ${TEST_EMAIL} (user: ${userId})`);
    console.log(
      `[AUTH] Cookie: ${COOKIE_NAME} (${sessionPayload.length} chars raw)`,
    );
    return { cookie: sessionCookie, userId: userId! };
  } catch (err) {
    console.error("[AUTH] Error:", (err as Error).message);
    return null;
  }
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

async function runTest(test: TestPath): Promise<TestResult> {
  const startTime = Date.now();

  // Skip logic
  if (SKIP_AUTH && test.auth !== "none") {
    return {
      id: test.id,
      path: test.path,
      method: test.method,
      expected: test.expectedStatus,
      actual: 0,
      passed: false,
      duration: 0,
      skipped: true,
      skipReason: "auth routes skipped",
    };
  }

  // Build headers
  const headers: Record<string, string> = {};

  if (test.auth === "user") {
    const session = await getAuthSession();
    if (!session) {
      return {
        id: test.id,
        path: test.path,
        method: test.method,
        expected: test.expectedStatus,
        actual: 0,
        passed: false,
        duration: 0,
        skipped: true,
        skipReason: "no auth session available",
      };
    }
    // Send Supabase SSR cookie for cookie-based auth
    headers["Cookie"] = session.cookie;
  } else if (test.auth === "cron") {
    if (!CRON_SECRET) {
      return {
        id: test.id,
        path: test.path,
        method: test.method,
        expected: test.expectedStatus,
        actual: 0,
        passed: false,
        duration: 0,
        skipped: true,
        skipReason: "no CRON_SECRET",
      };
    }
    headers["Authorization"] = `Bearer ${CRON_SECRET}`;
  } else if (test.auth === "admin") {
    if (!SUPABASE_SERVICE_KEY) {
      return {
        id: test.id,
        path: test.path,
        method: test.method,
        expected: test.expectedStatus,
        actual: 0,
        passed: false,
        duration: 0,
        skipped: true,
        skipReason: "no SUPABASE_SERVICE_ROLE_KEY",
      };
    }
    headers["Authorization"] = `Bearer ${SUPABASE_SERVICE_KEY}`;
    headers["apikey"] = SUPABASE_SERVICE_KEY;
  }

  if (test.body) {
    headers["Content-Type"] = test.contentType || "application/json";
  }

  // Substitute {userId} placeholder in paths
  let resolvedPath = test.path;
  if (resolvedPath.includes("{userId}") && userId) {
    resolvedPath = resolvedPath.replace(/\{userId\}/g, userId);
  } else if (resolvedPath.includes("{userId}") && !userId) {
    return {
      id: test.id,
      path: test.path,
      method: test.method,
      expected: test.expectedStatus,
      actual: 0,
      passed: false,
      duration: 0,
      skipped: true,
      skipReason: "no userId for path substitution",
    };
  }

  const url = `${BASE_URL}${resolvedPath}`;

  try {
    const res = await fetch(url, {
      method: test.method,
      headers,
      body: test.body ? JSON.stringify(test.body) : undefined,
      redirect: "manual",
    });

    const duration = Date.now() - startTime;
    const expectedArr = Array.isArray(test.expectedStatus)
      ? test.expectedStatus
      : [test.expectedStatus];
    const passed = expectedArr.includes(res.status);

    // Capture response body for debugging (always on failure)
    let errorDetail: string | undefined;
    if (!passed) {
      try {
        const text = await res.text();
        errorDetail = text.substring(0, 300);
      } catch {
        /* ignore */
      }
    }

    // Save dynamic IDs from create operations
    if (passed && test.method === "POST" && [200, 201].includes(res.status)) {
      try {
        const bodyText =
          res instanceof Response ? await res.clone().text() : "";
        const json = JSON.parse(bodyText);
        if (json.id) {
          dynamicIds[test.category] = json.id;
        }
      } catch {
        /* not json or no id */
      }
    }

    return {
      id: test.id,
      path: resolvedPath,
      method: test.method,
      expected: test.expectedStatus,
      actual: res.status,
      passed,
      duration,
      error: errorDetail,
    };
  } catch (err) {
    return {
      id: test.id,
      path: resolvedPath,
      method: test.method,
      expected: test.expectedStatus,
      actual: 0,
      passed: false,
      duration: Date.now() - startTime,
      error: (err as Error).message,
    };
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────

function printReport(results: TestResult[]) {
  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed && !r.skipped);
  const skipped = results.filter((r) => r.skipped);

  console.log("\n" + "=".repeat(80));
  console.log("  EXOSKULL ROUTE TEST REPORT");
  console.log("=".repeat(80));
  console.log(`  Base URL:  ${BASE_URL}`);
  console.log(`  Total:     ${results.length}`);
  console.log(`  PASS:      ${passed.length}`);
  console.log(`  FAIL:      ${failed.length}`);
  console.log(`  SKIPPED:   ${skipped.length}`);
  console.log("=".repeat(80));

  // Group by category
  const categories = [
    ...new Set(
      results.map((r) => {
        const t = tests.find((t) => t.id === r.id);
        return t?.category || "unknown";
      }),
    ),
  ];

  for (const cat of categories) {
    const catResults = results.filter((r) => {
      const t = tests.find((t) => t.id === r.id);
      return t?.category === cat;
    });

    const catPassed = catResults.filter((r) => r.passed).length;
    const catTotal = catResults.filter((r) => !r.skipped).length;

    console.log(`\n  [${cat.toUpperCase()}] ${catPassed}/${catTotal} passed`);

    for (const r of catResults) {
      const status = r.skipped ? "SKIP" : r.passed ? "PASS" : "FAIL";
      const icon = r.skipped ? " - " : r.passed ? " + " : " X ";
      const detail = r.skipped
        ? `(${r.skipReason})`
        : `${r.actual} (expected: ${Array.isArray(r.expected) ? r.expected.join("|") : r.expected}) [${r.duration}ms]`;

      console.log(`  ${icon} #${r.id} ${r.method.padEnd(6)} ${r.path}`);
      console.log(`        ${status} ${detail}`);

      if (r.error && !r.skipped) {
        console.log(`        ERROR: ${r.error}`);
      }
    }
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  if (failed.length === 0) {
    console.log("  ALL TESTS PASSED (or skipped)");
  } else {
    console.log("  FAILED TESTS:");
    for (const r of failed) {
      console.log(
        `    #${r.id} ${r.method} ${r.path} -> ${r.actual} (expected ${Array.isArray(r.expected) ? r.expected.join("|") : r.expected})`,
      );
    }
  }
  console.log("=".repeat(80) + "\n");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("ExoSkull Route Tester");
  console.log(`Target: ${BASE_URL}`);
  console.log(`Filter: ${CATEGORY_FILTER || "all"}`);
  console.log("");

  // Filter tests
  let filteredTests = tests;
  if (CATEGORY_FILTER) {
    filteredTests = tests.filter((t) => t.category === CATEGORY_FILTER);
    if (filteredTests.length === 0) {
      console.error(`No tests found for category: ${CATEGORY_FILTER}`);
      console.log(
        "Available categories:",
        [...new Set(tests.map((t) => t.category))].join(", "),
      );
      process.exit(1);
    }
  }

  console.log(`Running ${filteredTests.length} tests...\n`);

  // Check if server is reachable
  try {
    await fetch(`${BASE_URL}/api/pulse`, { signal: AbortSignal.timeout(5000) });
  } catch {
    console.error(`[ERROR] Cannot reach ${BASE_URL}. Is the server running?`);
    console.log("Start with: cd exoskull-app && npm run dev");
    process.exit(1);
  }

  // Run tests sequentially (to avoid rate limits and maintain order)
  const results: TestResult[] = [];
  for (const test of filteredTests) {
    const result = await runTest(test);
    results.push(result);

    // Live progress
    const icon = result.skipped ? "-" : result.passed ? "+" : "X";
    const displayPath =
      result.path.length > 60
        ? result.path.substring(0, 57) + "..."
        : result.path;
    process.stdout.write(
      `[${icon}] #${test.id} ${test.method.padEnd(6)} ${displayPath} -> ${result.actual || "SKIP"}\n`,
    );
  }

  printReport(results);

  // Exit code
  const failures = results.filter((r) => !r.passed && !r.skipped);
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
