/**
 * Async Tasks CRON Worker
 *
 * Processes queued async tasks one at a time.
 * Runs every 1 minute to minimize latency between queue and delivery.
 *
 * Each invocation:
 * 1. Releases expired locks (crashed workers)
 * 2. Claims ONE task (safe within 60s Vercel timeout)
 * 3. Processes via full AI pipeline (processUserMessage)
 * 4. Delivers result back on originating channel
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronGuard } from "@/lib/admin/cron-guard";
import {
  claimNextTask,
  releaseExpiredLocks,
  getPendingCount,
  completeTask,
  failTask,
} from "@/lib/async-tasks/queue";
import type { AsyncTask } from "@/lib/async-tasks/queue";
import {
  getOrCreateSession,
  processUserMessage,
  updateSession,
} from "@/lib/voice/conversation-handler";
import { appendMessage } from "@/lib/unified-thread";
import type { GatewayChannel } from "@/lib/gateway/types";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================================
// DELIVERY — resolve channel → adapter → send
// ============================================================================

async function deliverResult(task: AsyncTask, text: string): Promise<void> {
  const { channel, reply_to, channel_metadata } = task;

  try {
    switch (channel as GatewayChannel) {
      case "telegram": {
        const { telegramAdapter } =
          await import("@/lib/gateway/adapters/telegram");
        await telegramAdapter.sendResponse(reply_to, text, channel_metadata);
        break;
      }

      case "slack": {
        const { slackAdapter } = await import("@/lib/gateway/adapters/slack");
        await slackAdapter.sendResponse(reply_to, text, channel_metadata);
        break;
      }

      case "discord": {
        const { discordAdapter } =
          await import("@/lib/gateway/adapters/discord");
        await discordAdapter.sendResponse(reply_to, text, channel_metadata);
        break;
      }

      case "sms": {
        const twilio = (await import("twilio")).default;
        const client = twilio(
          process.env.TWILIO_ACCOUNT_SID!,
          process.env.TWILIO_AUTH_TOKEN!,
        );
        await client.messages.create({
          to: reply_to,
          from: process.env.TWILIO_PHONE_NUMBER!,
          body: text.slice(0, 1600), // SMS limit
        });
        break;
      }

      case "whatsapp": {
        const twilio = (await import("twilio")).default;
        const client = twilio(
          process.env.TWILIO_ACCOUNT_SID!,
          process.env.TWILIO_AUTH_TOKEN!,
        );
        await client.messages.create({
          to: `whatsapp:${reply_to}`,
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER}`,
          body: text.slice(0, 4096),
        });
        break;
      }

      case "signal": {
        const { signalAdapter } = await import("@/lib/gateway/adapters/signal");
        await signalAdapter.sendResponse(reply_to, text);
        break;
      }

      case "imessage": {
        const { imessageAdapter } =
          await import("@/lib/gateway/adapters/imessage");
        await imessageAdapter.sendResponse(reply_to, text);
        break;
      }

      case "web_chat":
        // Result is already stored in exo_async_tasks.result
        // Frontend polls or subscribes to Supabase realtime
        break;

      default:
        logger.warn("[AsyncCRON] No delivery adapter for channel:", channel);
    }

    logger.info("[AsyncCRON] Delivered:", {
      taskId: task.id,
      channel,
      replyTo: reply_to,
      textLength: text.length,
    });
  } catch (error) {
    console.error("[AsyncCRON] Delivery failed:", {
      taskId: task.id,
      channel,
      replyTo: reply_to,
      error: (error as Error).message,
    });
    throw error;
  }
}

// ============================================================================
// TASK PROCESSING
// ============================================================================

async function processTask(task: AsyncTask): Promise<void> {
  const startTime = Date.now();

  try {
    logger.info("[AsyncCRON] Processing task:", {
      taskId: task.id,
      tenantId: task.tenant_id,
      channel: task.channel,
      promptLength: task.prompt.length,
      retryCount: task.retry_count,
    });

    // 1. Rebuild session
    const sessionId =
      task.session_id ||
      `async-${task.channel}-${task.tenant_id}-${new Date().toISOString().slice(0, 10)}`;
    const session = await getOrCreateSession(sessionId, task.tenant_id);

    // 2. Process through full AI pipeline (28 tools)
    const result = await processUserMessage(session, task.prompt);

    // 3. Update session (writes both user+assistant to unified thread)
    const sessionChannel: "voice" | "web_chat" =
      task.channel === "voice" ? "voice" : "web_chat";
    await updateSession(session.id, task.prompt, result.text, {
      channel: sessionChannel,
    });
    // Note: updateSession already appends assistant to unified thread — no duplicate appendMessage needed

    // 5. Mark complete in DB
    await completeTask(task.id, result.text, result.toolsUsed);

    // 6. Deliver result back to user
    await deliverResult(task, result.text);

    logger.info("[AsyncCRON] Task completed:", {
      taskId: task.id,
      channel: task.channel,
      toolsUsed: result.toolsUsed,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    const err = error as Error;
    console.error("[AsyncCRON] Task failed:", {
      taskId: task.id,
      error: err.message,
      stack: err.stack,
      durationMs: Date.now() - startTime,
    });

    const { exhausted } = await failTask(task.id, err.message);

    // If all retries exhausted, notify user of failure
    if (exhausted) {
      try {
        await deliverResult(
          task,
          "Przepraszam, nie udalo sie przetworzyc Twojego zapytania. Sprobuj powtorzyc pytanie prosciej.",
        );
      } catch (deliveryErr) {
        console.error("[AsyncCRON] Failed to deliver error message:", {
          taskId: task.id,
          error: (deliveryErr as Error).message,
        });
      }
    }
  }
}

// ============================================================================
// CRON ENDPOINT
// ============================================================================

async function handler(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Step 1: Release any expired locks from crashed workers
    const releasedLocks = await releaseExpiredLocks();

    // Step 2: Claim next task (atomic, skip-locked)
    const workerId = `cron-${Date.now()}`;
    const task = await claimNextTask(workerId);

    if (!task) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        releasedLocks,
        pending: await getPendingCount(),
        durationMs: Date.now() - startTime,
      });
    }

    // Step 3: Process the task (includes AI pipeline + delivery)
    await processTask(task);

    const pending = await getPendingCount();

    return NextResponse.json({
      ok: true,
      processed: 1,
      taskId: task.id,
      channel: task.channel,
      releasedLocks,
      pending,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("[AsyncCRON] Error:", error);
    return NextResponse.json(
      {
        error: "Async task processing failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const GET = withCronGuard({ name: "async-tasks" }, handler);
