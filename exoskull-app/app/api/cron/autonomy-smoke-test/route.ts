// =====================================================
// CRON: /api/cron/autonomy-smoke-test
// Daily E2E verification that the autonomy pipeline works.
// Schedule: Daily at 06:00 UTC
// Tests: generateApp → table created → queryable → cleanup
// =====================================================

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import { getServiceSupabase } from "@/lib/supabase/service";
import { generateApp } from "@/lib/apps/generator/app-generator";
import { sendProactiveMessage } from "@/lib/cron/tenant-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TEST_DESCRIPTION =
  "Smoke Test App. Pola: test_field (text), test_number (integer), data (date).";

async function handler(_req: NextRequest) {
  const startTime = Date.now();
  const supabase = getServiceSupabase();

  // Use first active tenant for smoke test
  const { data: tenants } = await supabase
    .from("exo_tenants")
    .select("id")
    .eq("is_active", true)
    .limit(1);

  const tenantId = tenants?.[0]?.id;
  if (!tenantId) {
    return NextResponse.json({ ok: true, message: "No active tenants" });
  }

  let appId: string | null = null;
  let tableName: string | null = null;
  let widgetSlug: string | null = null;
  const errors: string[] = [];

  try {
    // Step 1: Generate app
    const result = await generateApp({
      tenant_id: tenantId,
      description: TEST_DESCRIPTION,
      source: "smoke_test",
    });

    if (!result.success || !result.app) {
      const error = `App generation failed: ${result.error || "unknown"}`;
      errors.push(error);
      logger.error("[SmokeTest] " + error, { tenantId });
      await reportFailure(tenantId, error);
      return respond(startTime, false, errors);
    }

    appId = result.app.id;
    tableName = result.app.table_name;
    widgetSlug = result.app.slug;

    logger.info("[SmokeTest] App generated:", { appId, tableName });

    // Step 2: Verify table exists and is queryable
    const { error: queryError } = await supabase
      .from(tableName)
      .select("*")
      .limit(1);

    if (queryError) {
      const error = `Table not queryable: ${queryError.message}`;
      errors.push(error);
      logger.error("[SmokeTest] " + error, { tenantId, tableName });
      await reportFailure(tenantId, error);
      // Still cleanup
    } else {
      logger.info("[SmokeTest] Table verified queryable:", { tableName });
    }

    // Step 3: Verify widget created
    const { data: widget } = await supabase
      .from("exo_canvas_widgets")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("widget_type", `app:${widgetSlug}`)
      .limit(1);

    if (!widget || widget.length === 0) {
      errors.push("Widget not created for app");
      logger.warn("[SmokeTest] Widget not found for app:", { widgetSlug });
    }
  } catch (err) {
    const error = `Smoke test exception: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(error);
    logger.error("[SmokeTest] " + error, { tenantId });
    await reportFailure(tenantId, error);
  } finally {
    // Cleanup — remove test app, widget, and table
    await cleanup(supabase, tenantId, appId, tableName, widgetSlug);
  }

  // Log result to dev journal
  const success = errors.length === 0;
  await supabase.from("exo_dev_journal").insert({
    tenant_id: tenantId,
    entry_type: "smoke_test",
    title: success
      ? "Autonomy smoke test PASSED"
      : "Autonomy smoke test FAILED",
    details: { errors, durationMs: Date.now() - startTime },
    outcome: success ? "success" : "failed",
  });

  return respond(startTime, success, errors);
}

async function reportFailure(tenantId: string, error: string) {
  try {
    await sendProactiveMessage(
      tenantId,
      `ExoSkull smoke test FAILED: ${error}`,
      "smoke_test_fail",
      "system",
    );
  } catch {
    logger.error("[SmokeTest] Failed to send failure alert", { tenantId });
  }
}

async function cleanup(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
  appId: string | null,
  tableName: string | null,
  widgetSlug: string | null,
) {
  try {
    if (widgetSlug) {
      await supabase
        .from("exo_canvas_widgets")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("widget_type", `app:${widgetSlug}`);
    }
    if (appId) {
      await supabase.from("exo_generated_apps").delete().eq("id", appId);
    }
    if (tableName) {
      await supabase.rpc("drop_app_table", { p_table_name: tableName });
    }
    logger.info("[SmokeTest] Cleanup complete:", { appId, tableName });
  } catch (err) {
    logger.error("[SmokeTest] Cleanup failed:", {
      error: err instanceof Error ? err.message : err,
    });
  }
}

function respond(startTime: number, success: boolean, errors: string[]) {
  return NextResponse.json({
    ok: success,
    durationMs: Date.now() - startTime,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export const GET = withCronGuard({ name: "autonomy-smoke-test" }, handler);
