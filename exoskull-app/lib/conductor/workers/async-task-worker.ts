/**
 * Async Task Worker — Process one pending async task from the queue.
 * Delegates to the same pipeline as the async-tasks CRON.
 */

import type { WorkContext, WorkResult } from "../work-catalog";
import { logger } from "@/lib/logger";

export async function processOneAsyncTask(
  ctx: WorkContext,
): Promise<WorkResult> {
  try {
    const { claimNextTask, releaseExpiredLocks, completeTask, failTask } =
      await import("@/lib/async-tasks/queue");
    const { getOrCreateSession, updateSession } =
      await import("@/lib/voice/conversation-handler");
    const { runExoSkullAgent } = await import("@/lib/agent-sdk");
    type AgentChannel = import("@/lib/agent-sdk").AgentChannel;

    // Release expired locks first
    await releaseExpiredLocks();

    // Claim one task atomically
    const task = await claimNextTask(ctx.workerId);
    if (!task) {
      return {
        success: true,
        costCents: 0,
        result: { processed: 0, reason: "no_tasks" },
      };
    }

    try {
      // Rebuild session
      const sessionId =
        task.session_id ||
        `async-${task.channel}-${task.tenant_id}-${new Date().toISOString().slice(0, 10)}`;

      // Process through Agent SDK (all tools, async config)
      const result = await runExoSkullAgent({
        tenantId: task.tenant_id,
        sessionId,
        userMessage: task.prompt,
        channel: (task.channel || "web_chat") as AgentChannel,
        isAsync: true,
        skipThreadAppend: true,
      });

      // Update session
      const session = await getOrCreateSession(sessionId, task.tenant_id);
      const sessionChannel: "voice" | "web_chat" =
        task.channel === "voice" ? "voice" : "web_chat";
      await updateSession(session.id, task.prompt, result.text, {
        channel: sessionChannel,
      });

      // Mark complete
      await completeTask(task.id, result.text, result.toolsUsed);

      return {
        success: true,
        costCents: 3,
        result: { processed: 1, taskId: task.id },
      };
    } catch (taskErr) {
      const errMsg =
        taskErr instanceof Error ? taskErr.message : String(taskErr);
      await failTask(task.id, errMsg);
      throw taskErr;
    }
  } catch (err) {
    logger.error("[AsyncTaskWorker] Failed:", { error: err });
    return {
      success: false,
      costCents: 1,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
