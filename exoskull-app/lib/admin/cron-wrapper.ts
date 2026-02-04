import { NextRequest, NextResponse } from "next/server";
import { logCronStart, logCronComplete, logCronFailed } from "./logger";

type CronHandler = (req: NextRequest) => Promise<NextResponse>;

/**
 * Wraps a cron route handler to automatically log execution to admin_cron_runs.
 *
 * Usage:
 * ```ts
 * export const POST = withCronLogging("bronze-etl", async (req) => {
 *   // ... existing cron logic
 *   return NextResponse.json({ ok: true });
 * });
 * ```
 */
export function withCronLogging(
  cronName: string,
  handler: CronHandler,
): CronHandler {
  return async (req: NextRequest) => {
    const runId = await logCronStart(cronName);

    try {
      const response = await handler(req);
      const status = response.status;

      // Try to extract result summary from response body
      let resultSummary: Record<string, unknown> = {};
      try {
        const cloned = response.clone();
        resultSummary = await cloned.json();
      } catch {
        // Response might not be JSON
      }

      if (status >= 400) {
        await logCronFailed(
          runId,
          new Error((resultSummary?.error as string) || `HTTP ${status}`),
          status,
        );
      } else {
        await logCronComplete(runId, resultSummary, status);
      }

      return response;
    } catch (error) {
      await logCronFailed(runId, error);
      throw error;
    }
  };
}
