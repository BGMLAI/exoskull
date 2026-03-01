/**
 * GET /api/v3/test-autonomy — Run 5 autonomy & self-modification tests
 *
 * TEMPORARY endpoint. Remove after testing.
 * Protected by CRON_SECRET to prevent abuse.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { v3Tools, executeV3Tool } from "@/lib/v3/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ADMIN_TENANT_ID = "be769cc4-43db-4b26-bcc2-046c6653e3b3";

interface TestResult {
  name: string;
  description: string;
  passed: boolean;
  durationMs: number;
  toolResult?: string;
  error?: string;
}

async function runTest(
  name: string,
  description: string,
  fn: () => Promise<{ result: string; error?: boolean }>,
): Promise<TestResult> {
  const start = Date.now();
  try {
    const { result, error } = await fn();
    return {
      name,
      description,
      passed: !error && result.length > 0,
      durationMs: Date.now() - start,
      toolResult: result.slice(0, 500),
      error: error ? "Tool returned isError" : undefined,
    };
  } catch (err) {
    return {
      name,
      description,
      passed: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET(request: NextRequest) {
  // Auth check - require CRON_SECRET
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: TestResult[] = [];

  // ═══════════════════════════════════════════════════
  // TEST 1: search_brain — Memory search works
  // ═══════════════════════════════════════════════════
  results.push(
    await runTest(
      "search_brain",
      "Search memory for user preferences and goals",
      async () => {
        const { result, isError } = await executeV3Tool(
          "search_brain",
          { query: "preferencje użytkownika" },
          ADMIN_TENANT_ID,
        );
        return { result, error: isError };
      },
    ),
  );

  // ═══════════════════════════════════════════════════
  // TEST 2: remember — Can persist knowledge
  // ═══════════════════════════════════════════════════
  results.push(
    await runTest("remember", "Save a fact to organism knowledge", async () => {
      const { result, isError } = await executeV3Tool(
        "remember",
        {
          content: `[AUTONOMY_TEST] System autonomy verified at ${new Date().toISOString()}`,
          category: "fact",
        },
        ADMIN_TENANT_ID,
      );
      return { result, error: isError };
    }),
  );

  // ═══════════════════════════════════════════════════
  // TEST 3: search_web — Internet search via Tavily
  // ═══════════════════════════════════════════════════
  results.push(
    await runTest(
      "search_web",
      "Search the internet via Tavily API",
      async () => {
        const { result, isError } = await executeV3Tool(
          "search_web",
          { query: "ExoSkull adaptive life operating system", max_results: 2 },
          ADMIN_TENANT_ID,
        );
        return { result, error: isError };
      },
    ),
  );

  // ═══════════════════════════════════════════════════
  // TEST 4: self_modify — Self-modification via GitHub
  // ═══════════════════════════════════════════════════
  results.push(
    await runTest(
      "self_modify",
      "Create a code modification via GitHub API (branch + commit)",
      async () => {
        const { result, isError } = await executeV3Tool(
          "self_modify",
          {
            action: "add_feature",
            description:
              "Add a comment '// ExoSkull autonomy test: self-modification verified' at the end of the health check file app/api/v3/health/route.ts",
            target_files: ["app/api/v3/health/route.ts"],
          },
          ADMIN_TENANT_ID,
        );
        return { result, error: isError };
      },
    ),
  );

  // ═══════════════════════════════════════════════════
  // TEST 5: log_note + search_brain chain — Multi-tool autonomy
  // ═══════════════════════════════════════════════════
  results.push(
    await runTest(
      "multi_tool_chain",
      "Log a note then search for it (2-tool chain)",
      async () => {
        // Step 1: Log a note
        const noteResult = await executeV3Tool(
          "log_note",
          {
            title: "Autonomy Test Note",
            content: `System autonomy chain test at ${new Date().toISOString()}. All subsystems operational.`,
            type: "observation",
          },
          ADMIN_TENANT_ID,
        );

        if (noteResult.isError) {
          return { result: noteResult.result, error: true };
        }

        // Step 2: Verify via direct DB check
        const supabase = getServiceSupabase();
        const { data, error } = await supabase
          .from("user_notes")
          .select("id, title, content")
          .eq("tenant_id", ADMIN_TENANT_ID)
          .eq("title", "Autonomy Test Note")
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) {
          return {
            result: `Note saved but verification failed: ${error.message}`,
            error: true,
          };
        }

        const found = data && data.length > 0;
        return {
          result: found
            ? `Chain OK: Note saved (${noteResult.result}) → Verified in DB (id: ${data[0].id})`
            : `Note saved (${noteResult.result}) but not found in DB`,
          error: !found,
        };
      },
    ),
  );

  // ═══════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════
  const passed = results.filter((r) => r.passed).length;
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  return NextResponse.json({
    summary: {
      passed,
      failed: results.length - passed,
      total: results.length,
      totalDurationMs: totalMs,
      timestamp: new Date().toISOString(),
      verdict:
        passed === results.length
          ? "ALL_PASS"
          : passed >= 3
            ? "PARTIAL"
            : "FAIL",
    },
    tests: results,
  });
}
