/**
 * Chat Pause API — Abort a running conversation.
 *
 * POST { conversation_id, tenant_id } → signals abort to running agent.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  abortConversation,
  getActiveConversationCount,
} from "@/lib/chat/active-conversations";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { conversation_id, tenant_id } = body as {
      conversation_id?: string;
      tenant_id?: string;
    };

    if (!conversation_id || !tenant_id) {
      return NextResponse.json(
        { error: "conversation_id and tenant_id required" },
        { status: 400 },
      );
    }

    // Try multiple key formats (gateway uses different patterns)
    const keys = [
      conversation_id,
      `${tenant_id}:${conversation_id}`,
      `web_chat-${tenant_id}-${new Date().toISOString().slice(0, 10)}`,
    ];

    let aborted = false;
    for (const key of keys) {
      if (abortConversation(key)) {
        aborted = true;
        logger.info("[Pause] Conversation aborted:", {
          key,
          tenantId: tenant_id,
        });
        break;
      }
    }

    return NextResponse.json({
      success: true,
      aborted,
      active_conversations: getActiveConversationCount(),
    });
  } catch (err) {
    logger.error("[Pause] Error:", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
