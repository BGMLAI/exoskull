import { getAdminSupabase } from "./auth";

type Severity = "info" | "warn" | "error" | "fatal";

/**
 * Log a structured error to admin_error_log
 */
export async function logAdminError(
  source: string,
  severity: Severity,
  message: string,
  context?: Record<string, unknown>,
  stackTrace?: string,
): Promise<void> {
  try {
    const db = getAdminSupabase();
    await db.from("admin_error_log").insert({
      source,
      severity,
      message,
      stack_trace: stackTrace,
      context: context || {},
    });
  } catch (err) {
    console.error("[AdminLogger] Failed to log error:", err);
  }
}

/**
 * Log cron job start. Returns the run ID for later completion.
 */
export async function logCronStart(cronName: string): Promise<string | null> {
  try {
    const db = getAdminSupabase();
    const { data } = await db
      .from("admin_cron_runs")
      .insert({
        cron_name: cronName,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    return data?.id || null;
  } catch (err) {
    console.error("[AdminLogger] Failed to log cron start:", err);
    return null;
  }
}

/**
 * Log cron job completion
 */
export async function logCronComplete(
  runId: string | null,
  resultSummary?: Record<string, unknown>,
  httpStatus?: number,
): Promise<void> {
  if (!runId) return;
  try {
    const db = getAdminSupabase();
    const startRow = await db
      .from("admin_cron_runs")
      .select("started_at")
      .eq("id", runId)
      .single();

    const startedAt = startRow.data?.started_at
      ? new Date(startRow.data.started_at)
      : new Date();
    const durationMs = Date.now() - startedAt.getTime();

    await db
      .from("admin_cron_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        result_summary: resultSummary || {},
        http_status: httpStatus || 200,
      })
      .eq("id", runId);
  } catch (err) {
    console.error("[AdminLogger] Failed to log cron complete:", err);
  }
}

/**
 * Log cron job failure
 */
export async function logCronFailed(
  runId: string | null,
  error: unknown,
  httpStatus?: number,
): Promise<void> {
  if (!runId) return;
  try {
    const db = getAdminSupabase();
    const errMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    const startRow = await db
      .from("admin_cron_runs")
      .select("started_at, cron_name")
      .eq("id", runId)
      .single();

    const startedAt = startRow.data?.started_at
      ? new Date(startRow.data.started_at)
      : new Date();
    const durationMs = Date.now() - startedAt.getTime();

    await db
      .from("admin_cron_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_message: errMsg,
        http_status: httpStatus || 500,
      })
      .eq("id", runId);

    // Also log to error log
    await logAdminError(
      `cron:${startRow.data?.cron_name || "unknown"}`,
      "error",
      errMsg,
      { runId },
      stack,
    );
  } catch (err) {
    console.error("[AdminLogger] Failed to log cron failure:", err);
  }
}

/**
 * Log an API request
 */
export async function logApiRequest(
  path: string,
  method: string,
  statusCode: number,
  durationMs: number,
  tenantId?: string,
  errorMessage?: string,
): Promise<void> {
  try {
    const db = getAdminSupabase();
    await db.from("admin_api_logs").insert({
      path,
      method,
      status_code: statusCode,
      duration_ms: durationMs,
      tenant_id: tenantId || null,
      error_message: errorMessage || null,
    });
  } catch (err) {
    // Silently fail - don't let logging break the API
  }
}
