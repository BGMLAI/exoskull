/**
 * Threads IORS Tools
 *
 * 3 tools: publish_threads_post, list_threads_posts, reply_threads_post
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/rigs/oauth";
import { logger } from "@/lib/logger";

async function getThreadsClient(tenantId: string) {
  const supabase = getServiceSupabase();

  // Try threads rig first, then facebook rig
  for (const slug of ["threads", "facebook"]) {
    const { data: conn } = await supabase
      .from("exo_rig_connections")
      .select("id, rig_slug, access_token, refresh_token, expires_at, metadata")
      .eq("tenant_id", tenantId)
      .eq("rig_slug", slug)
      .maybeSingle();

    if (conn?.access_token) {
      try {
        const token = await ensureFreshToken(conn);
        const userId =
          (conn.metadata as Record<string, string>)?.threads_user_id ||
          (conn.metadata as Record<string, string>)?.facebook_user_id ||
          "me";

        const { ThreadsClient } = await import("@/lib/channels/threads/client");
        return new ThreadsClient(token, userId);
      } catch (err) {
        logger.error(`[ThreadsTools] Token refresh failed for ${slug}:`, err);
        continue;
      }
    }
  }

  return null;
}

const NO_THREADS = "Brak połączenia Threads. Powiedz 'połącz Threads'.";

export const threadsTools: ToolDefinition[] = [
  {
    definition: {
      name: "publish_threads_post",
      description: "Opublikuj post na Threads.",
      input_schema: {
        type: "object" as const,
        properties: {
          text: { type: "string", description: "Treść posta" },
          image_url: {
            type: "string",
            description: "URL obrazu (opcjonalnie)",
          },
        },
        required: ["text"],
      },
    },
    execute: async (input, tenantId) => {
      const client = await getThreadsClient(tenantId);
      if (!client) return NO_THREADS;

      try {
        const result = await client.publishPost(
          input.text as string,
          input.image_url as string | undefined,
        );
        return `Post opublikowany na Threads! ID: ${result.id}`;
      } catch (err) {
        logger.error("[ThreadsTools] publish error:", err);
        return `Błąd publikacji: ${err instanceof Error ? err.message : err}`;
      }
    },
    timeoutMs: 15000,
  },
  {
    definition: {
      name: "list_threads_posts",
      description: "Pokaż ostatnie posty na Threads.",
      input_schema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Ile postów pokazać (domyślnie 10)",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const client = await getThreadsClient(tenantId);
      if (!client) return NO_THREADS;

      try {
        const posts = await client.listPosts((input.limit as number) || 10);
        if (!posts.length) return "Brak postów na Threads.";

        const lines = posts.map((p, i) => {
          const date = new Date(p.timestamp).toLocaleDateString("pl-PL");
          const text = p.text ? p.text.slice(0, 200) : "(bez tekstu)";
          return `${i + 1}. [${date}] ${text} | ${p.permalink} | ID: ${p.id}`;
        });
        return `Posty Threads:\n${lines.join("\n")}`;
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    definition: {
      name: "reply_threads_post",
      description: "Odpowiedz na post na Threads.",
      input_schema: {
        type: "object" as const,
        properties: {
          post_id: { type: "string", description: "ID posta do odpowiedzi" },
          text: { type: "string", description: "Treść odpowiedzi" },
        },
        required: ["post_id", "text"],
      },
    },
    execute: async (input, tenantId) => {
      const client = await getThreadsClient(tenantId);
      if (!client) return NO_THREADS;

      try {
        const result = await client.replyToPost(
          input.post_id as string,
          input.text as string,
        );
        return `Odpowiedź opublikowana na Threads! ID: ${result.id}`;
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
    timeoutMs: 15000,
  },
];
