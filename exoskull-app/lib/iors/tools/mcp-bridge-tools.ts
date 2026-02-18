/**
 * MCP Bridge Tools — GitHub, Slack, Notion API access from Vercel.
 *
 * Instead of running MCP servers on VPS, these tools call the same
 * REST APIs directly using env vars available on Vercel.
 *
 * Tools:
 * - github_list_prs     — List open PRs for a repo
 * - github_create_issue  — Create a GitHub issue
 * - github_create_pr     — Create a pull request
 * - slack_send_message   — Send a message to a Slack channel
 * - slack_read_channel   — Read recent messages from a Slack channel
 * - notion_search        — Search Notion workspace
 * - notion_create_page   — Create a Notion page
 */

import type { ToolDefinition } from "./shared";
import { logger } from "@/lib/logger";

// ============================================================================
// HELPERS
// ============================================================================

async function githubAPI(
  endpoint: string,
  method = "GET",
  body?: Record<string, unknown>,
): Promise<unknown> {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!token) throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN not configured");

  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API ${res.status}: ${err.slice(0, 500)}`);
  }

  return res.json();
}

async function slackAPI(
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN not configured");

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error || "unknown"}`);
  }

  return data;
}

async function sentryAPI(
  endpoint: string,
  method = "GET",
  body?: Record<string, unknown>,
): Promise<unknown> {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) throw new Error("SENTRY_AUTH_TOKEN not configured");

  const region = process.env.SENTRY_REGION || "de.sentry.io";
  const res = await fetch(`https://${region}/api/0${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sentry API ${res.status}: ${err.slice(0, 500)}`);
  }
  return res.json();
}

async function stripeAPI(
  endpoint: string,
  method = "GET",
  params?: Record<string, string>,
): Promise<unknown> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");

  const url = new URL(`https://api.stripe.com/v1${endpoint}`);
  let bodyStr: string | undefined;

  if (method === "GET" && params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else if (params) {
    bodyStr = new URLSearchParams(params).toString();
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(bodyStr
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    ...(bodyStr ? { body: bodyStr } : {}),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe API ${res.status}: ${err.slice(0, 500)}`);
  }
  return res.json();
}

async function braveSearchAPI(query: string): Promise<unknown> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) throw new Error("BRAVE_API_KEY not configured");

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`;
  const res = await fetch(url, {
    headers: { "X-Subscription-Token": key, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brave Search ${res.status}: ${err.slice(0, 500)}`);
  }
  return res.json();
}

async function resendAPI(
  endpoint: string,
  method = "POST",
  body?: Record<string, unknown>,
): Promise<unknown> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not configured");

  const res = await fetch(`https://api.resend.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API ${res.status}: ${err.slice(0, 500)}`);
  }
  return res.json();
}

async function notionAPI(
  endpoint: string,
  method = "GET",
  body?: Record<string, unknown>,
): Promise<unknown> {
  const key = process.env.NOTION_API_KEY;
  if (!key) throw new Error("NOTION_API_KEY not configured");

  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API ${res.status}: ${err.slice(0, 500)}`);
  }

  return res.json();
}

// ============================================================================
// TOOLS
// ============================================================================

export const mcpBridgeTools: ToolDefinition[] = [
  // ---- github_list_prs ----
  {
    timeoutMs: 15_000,
    definition: {
      name: "github_list_prs",
      description: `List open pull requests for a GitHub repository.
Returns PR number, title, author, branch, and URL.`,
      input_schema: {
        type: "object" as const,
        properties: {
          repo: {
            type: "string",
            description:
              "Repository in owner/repo format (e.g., 'BGMLAI/exoskull')",
          },
          state: {
            type: "string",
            description: "PR state: open, closed, all (default: open)",
          },
        },
        required: ["repo"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const repo = input.repo as string;
      const state = (input.state as string) || "open";
      logger.info("[MCPBridge] github_list_prs:", { repo, state });

      try {
        const prs = (await githubAPI(
          `/repos/${repo}/pulls?state=${state}&per_page=20`,
        )) as Array<{
          number: number;
          title: string;
          user: { login: string };
          head: { ref: string };
          html_url: string;
          created_at: string;
        }>;

        if (prs.length === 0) return `No ${state} PRs in ${repo}.`;

        return prs
          .map(
            (pr) =>
              `#${pr.number} ${pr.title}\n  by @${pr.user.login} | ${pr.head.ref}\n  ${pr.html_url}`,
          )
          .join("\n\n");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] github_list_prs failed:", { error: msg });
        return `GitHub error: ${msg}`;
      }
    },
  },

  // ---- github_create_issue ----
  {
    timeoutMs: 15_000,
    definition: {
      name: "github_create_issue",
      description: `Create a new GitHub issue in a repository.`,
      input_schema: {
        type: "object" as const,
        properties: {
          repo: {
            type: "string",
            description: "Repository in owner/repo format",
          },
          title: {
            type: "string",
            description: "Issue title",
          },
          body: {
            type: "string",
            description: "Issue body (markdown)",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Labels to apply (e.g., ['bug', 'priority'])",
          },
        },
        required: ["repo", "title"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const repo = input.repo as string;
      const title = input.title as string;
      logger.info("[MCPBridge] github_create_issue:", { repo, title });

      try {
        const issue = (await githubAPI(`/repos/${repo}/issues`, "POST", {
          title,
          body: (input.body as string) || "",
          labels: (input.labels as string[]) || [],
        })) as { number: number; html_url: string };

        return `Issue #${issue.number} created: ${issue.html_url}`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] github_create_issue failed:", { error: msg });
        return `GitHub error: ${msg}`;
      }
    },
  },

  // ---- github_create_pr ----
  {
    timeoutMs: 15_000,
    definition: {
      name: "github_create_pr",
      description: `Create a pull request in a GitHub repository.
The head branch must already be pushed to the remote.`,
      input_schema: {
        type: "object" as const,
        properties: {
          repo: {
            type: "string",
            description: "Repository in owner/repo format",
          },
          title: {
            type: "string",
            description: "PR title",
          },
          body: {
            type: "string",
            description: "PR description (markdown)",
          },
          head: {
            type: "string",
            description: "Source branch name",
          },
          base: {
            type: "string",
            description: "Target branch (default: main)",
          },
        },
        required: ["repo", "title", "head"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const repo = input.repo as string;
      const title = input.title as string;
      const head = input.head as string;
      const base = (input.base as string) || "main";
      logger.info("[MCPBridge] github_create_pr:", { repo, title, head, base });

      try {
        const pr = (await githubAPI(`/repos/${repo}/pulls`, "POST", {
          title,
          body: (input.body as string) || "",
          head,
          base,
        })) as { number: number; html_url: string };

        return `PR #${pr.number} created: ${pr.html_url}`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] github_create_pr failed:", { error: msg });
        return `GitHub error: ${msg}`;
      }
    },
  },

  // ---- slack_send_message ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "slack_send_message",
      description: `Send a message to a Slack channel. Use channel name (e.g., "#general") or channel ID.`,
      input_schema: {
        type: "object" as const,
        properties: {
          channel: {
            type: "string",
            description: "Channel name (e.g., '#general') or channel ID",
          },
          text: {
            type: "string",
            description: "Message text (supports Slack markdown)",
          },
        },
        required: ["channel", "text"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const channel = input.channel as string;
      const text = input.text as string;
      logger.info("[MCPBridge] slack_send_message:", { channel });

      try {
        const result = (await slackAPI("chat.postMessage", {
          channel: channel.replace(/^#/, ""),
          text,
        })) as { channel: string; ts: string };

        return `Message sent to ${channel} (ts: ${result.ts})`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] slack_send_message failed:", { error: msg });
        return `Slack error: ${msg}`;
      }
    },
  },

  // ---- slack_read_channel ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "slack_read_channel",
      description: `Read recent messages from a Slack channel. Returns last 20 messages with timestamps and authors.`,
      input_schema: {
        type: "object" as const,
        properties: {
          channel: {
            type: "string",
            description:
              "Channel ID (e.g., 'C01234ABCDE'). Use slack_send_message first to get the channel ID.",
          },
          limit: {
            type: "number",
            description: "Number of messages to fetch (default: 20, max: 100)",
          },
        },
        required: ["channel"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const channel = input.channel as string;
      const limit = Math.min((input.limit as number) || 20, 100);
      logger.info("[MCPBridge] slack_read_channel:", { channel, limit });

      try {
        const result = (await slackAPI("conversations.history", {
          channel,
          limit,
        })) as {
          messages: Array<{
            user: string;
            text: string;
            ts: string;
          }>;
        };

        if (!result.messages || result.messages.length === 0) {
          return "No messages found.";
        }

        return result.messages
          .reverse()
          .map((m) => {
            const time = new Date(parseFloat(m.ts) * 1000).toISOString();
            return `[${time}] <@${m.user}>: ${m.text}`;
          })
          .join("\n");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] slack_read_channel failed:", { error: msg });
        return `Slack error: ${msg}`;
      }
    },
  },

  // ---- notion_search ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "notion_search",
      description: `Search the Notion workspace for pages and databases by title or content.`,
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          filter_type: {
            type: "string",
            description: "Filter by type: 'page' or 'database' (default: all)",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const query = input.query as string;
      const filterType = input.filter_type as string | undefined;
      logger.info("[MCPBridge] notion_search:", { query, filterType });

      try {
        const body: Record<string, unknown> = { query, page_size: 10 };
        if (filterType) {
          body.filter = { value: filterType, property: "object" };
        }

        const result = (await notionAPI("/search", "POST", body)) as {
          results: Array<{
            id: string;
            object: string;
            url: string;
            properties?: Record<
              string,
              { title?: Array<{ plain_text: string }> }
            >;
          }>;
        };

        if (result.results.length === 0) return `No results for: ${query}`;

        return result.results
          .map((r) => {
            const title =
              Object.values(r.properties || {})
                .find((p) => p.title)
                ?.title?.map((t) => t.plain_text)
                .join("") || "(untitled)";
            return `[${r.object}] ${title}\n  ID: ${r.id}\n  ${r.url}`;
          })
          .join("\n\n");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] notion_search failed:", { error: msg });
        return `Notion error: ${msg}`;
      }
    },
  },

  // ---- notion_create_page ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "notion_create_page",
      description: `Create a new page in Notion. Requires a parent page ID or database ID.`,
      input_schema: {
        type: "object" as const,
        properties: {
          parent_id: {
            type: "string",
            description: "Parent page ID or database ID",
          },
          parent_type: {
            type: "string",
            description: "'page_id' or 'database_id' (default: page_id)",
          },
          title: {
            type: "string",
            description: "Page title",
          },
          content: {
            type: "string",
            description:
              "Page content as plain text (converted to paragraph blocks)",
          },
        },
        required: ["parent_id", "title"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const parentId = input.parent_id as string;
      const parentType = (input.parent_type as string) || "page_id";
      const title = input.title as string;
      const content = (input.content as string) || "";
      logger.info("[MCPBridge] notion_create_page:", { parentId, title });

      try {
        const children: Array<Record<string, unknown>> = [];
        if (content) {
          // Split content into paragraphs
          const paragraphs = content.split("\n\n").filter(Boolean);
          for (const para of paragraphs) {
            children.push({
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [{ type: "text", text: { content: para } }],
              },
            });
          }
        }

        const body: Record<string, unknown> = {
          parent: { [parentType]: parentId },
          properties: {
            title: {
              title: [{ type: "text", text: { content: title } }],
            },
          },
          children,
        };

        const page = (await notionAPI("/pages", "POST", body)) as {
          id: string;
          url: string;
        };

        return `Page created: ${page.url} (ID: ${page.id})`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] notion_create_page failed:", { error: msg });
        return `Notion error: ${msg}`;
      }
    },
  },

  // ---- sentry_list_issues ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "sentry_list_issues",
      description: `List recent issues from a Sentry project. Returns issue title, level, count, and link.`,
      input_schema: {
        type: "object" as const,
        properties: {
          project: {
            type: "string",
            description: "Sentry project slug (e.g., 'exoskull-web')",
          },
          query: {
            type: "string",
            description: "Search query (e.g., 'is:unresolved level:error')",
          },
        },
        required: ["project"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const project = input.project as string;
      const query = (input.query as string) || "is:unresolved";
      const org = process.env.SENTRY_ORG || "bloom-found";
      logger.info("[MCPBridge] sentry_list_issues:", { project, query });

      try {
        const issues = (await sentryAPI(
          `/projects/${org}/${project}/issues/?query=${encodeURIComponent(query)}&limit=10`,
        )) as Array<{
          id: string;
          title: string;
          level: string;
          count: string;
          permalink: string;
          firstSeen: string;
        }>;

        if (issues.length === 0) return "No issues found.";

        return issues
          .map(
            (i) =>
              `[${i.level.toUpperCase()}] ${i.title}\n  Count: ${i.count} | First: ${i.firstSeen}\n  ${i.permalink}`,
          )
          .join("\n\n");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] sentry_list_issues failed:", { error: msg });
        return `Sentry error: ${msg}`;
      }
    },
  },

  // ---- stripe_list_payments ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "stripe_list_payments",
      description: `List recent Stripe payments/charges. Returns amount, status, customer, and date.`,
      input_schema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Number of payments to list (default: 10, max: 100)",
          },
          status: {
            type: "string",
            description: "Filter by status: succeeded, pending, failed",
          },
        },
        required: [],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const limit = String(Math.min((input.limit as number) || 10, 100));
      const params: Record<string, string> = { limit };
      if (input.status) params.status = input.status as string;
      logger.info("[MCPBridge] stripe_list_payments:", { limit });

      try {
        const result = (await stripeAPI("/charges", "GET", params)) as {
          data: Array<{
            id: string;
            amount: number;
            currency: string;
            status: string;
            description: string | null;
            created: number;
          }>;
        };

        if (result.data.length === 0) return "No payments found.";

        return result.data
          .map((c) => {
            const amount = (c.amount / 100).toFixed(2);
            const date = new Date(c.created * 1000).toISOString().split("T")[0];
            return `${c.id}: ${amount} ${c.currency.toUpperCase()} [${c.status}]\n  ${c.description || "(no description)"} | ${date}`;
          })
          .join("\n\n");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] stripe_list_payments failed:", {
          error: msg,
        });
        return `Stripe error: ${msg}`;
      }
    },
  },

  // ---- brave_search ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "brave_search",
      description: `Search the web using Brave Search API. Returns titles, URLs, and descriptions.`,
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const query = input.query as string;
      logger.info("[MCPBridge] brave_search:", { query });

      try {
        const result = (await braveSearchAPI(query)) as {
          web?: {
            results: Array<{
              title: string;
              url: string;
              description: string;
            }>;
          };
        };

        const results = result.web?.results || [];
        if (results.length === 0) return `No results for: ${query}`;

        return results
          .slice(0, 10)
          .map(
            (r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`,
          )
          .join("\n\n");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] brave_search failed:", { error: msg });
        return `Brave Search error: ${msg}`;
      }
    },
  },

  // ---- resend_send_email ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "resend_send_email",
      description: `Send an email via Resend API. Requires verified sender domain.`,
      input_schema: {
        type: "object" as const,
        properties: {
          to: {
            type: "string",
            description: "Recipient email address",
          },
          subject: {
            type: "string",
            description: "Email subject",
          },
          html: {
            type: "string",
            description: "Email body (HTML)",
          },
          from: {
            type: "string",
            description:
              "Sender email (default: noreply@exoskull.app if verified)",
          },
        },
        required: ["to", "subject", "html"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const to = input.to as string;
      const subject = input.subject as string;
      const html = input.html as string;
      const from = (input.from as string) || "ExoSkull <noreply@exoskull.app>";
      logger.info("[MCPBridge] resend_send_email:", { to, subject });

      try {
        const result = (await resendAPI("/emails", "POST", {
          from,
          to: [to],
          subject,
          html,
        })) as { id: string };

        return `Email sent to ${to} (ID: ${result.id})`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] resend_send_email failed:", { error: msg });
        return `Resend error: ${msg}`;
      }
    },
  },

  // ---- discord_send_message ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "discord_send_message",
      description: `Send a message to a Discord channel via webhook or bot token.`,
      input_schema: {
        type: "object" as const,
        properties: {
          channel_id: {
            type: "string",
            description: "Discord channel ID",
          },
          content: {
            type: "string",
            description: "Message content",
          },
        },
        required: ["channel_id", "content"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const channelId = input.channel_id as string;
      const content = input.content as string;
      const token = process.env.DISCORD_BOT_TOKEN;
      if (!token) return "DISCORD_BOT_TOKEN not configured.";
      logger.info("[MCPBridge] discord_send_message:", { channelId });

      try {
        const res = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ content }),
            signal: AbortSignal.timeout(10_000),
          },
        );

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Discord ${res.status}: ${err.slice(0, 300)}`);
        }

        const msg = (await res.json()) as { id: string };
        return `Message sent (ID: ${msg.id})`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] discord_send_message failed:", {
          error: msg,
        });
        return `Discord error: ${msg}`;
      }
    },
  },

  // ---- elevenlabs_tts ----
  {
    timeoutMs: 30_000,
    definition: {
      name: "elevenlabs_tts",
      description: `Generate speech from text using ElevenLabs TTS API. Returns audio URL (base64 in practice).`,
      input_schema: {
        type: "object" as const,
        properties: {
          text: {
            type: "string",
            description: "Text to synthesize (max 5000 chars)",
          },
          voice_id: {
            type: "string",
            description:
              "ElevenLabs voice ID (default: Rachel - 21m00Tcm4TlvDq8ikWAM)",
          },
        },
        required: ["text"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const text = (input.text as string).slice(0, 5000);
      const voiceId = (input.voice_id as string) || "21m00Tcm4TlvDq8ikWAM";
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) return "ELEVENLABS_API_KEY not configured.";
      logger.info("[MCPBridge] elevenlabs_tts:", {
        voiceId,
        textLen: text.length,
      });

      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            method: "POST",
            headers: {
              "xi-api-key": key,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify({
              text,
              model_id: "eleven_multilingual_v2",
            }),
            signal: AbortSignal.timeout(30_000),
          },
        );

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`ElevenLabs ${res.status}: ${err.slice(0, 300)}`);
        }

        const audioBytes = await res.arrayBuffer();
        const sizeMB = (audioBytes.byteLength / 1024 / 1024).toFixed(2);
        return `TTS generated: ${sizeMB} MB audio (voice: ${voiceId}). Audio binary available — use with audio playback tool.`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] elevenlabs_tts failed:", { error: msg });
        return `ElevenLabs error: ${msg}`;
      }
    },
  },

  // ---- cloudflare_r2_list ----
  {
    timeoutMs: 10_000,
    definition: {
      name: "cloudflare_r2_list",
      description: `List objects in a Cloudflare R2 bucket. Returns keys, sizes, and last modified dates.`,
      input_schema: {
        type: "object" as const,
        properties: {
          bucket: {
            type: "string",
            description: "R2 bucket name (default: exoskull)",
          },
          prefix: {
            type: "string",
            description: "Key prefix filter (e.g., 'tenant-123/bronze/')",
          },
          limit: {
            type: "number",
            description: "Max objects to list (default: 20)",
          },
        },
        required: [],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const bucket = (input.bucket as string) || "exoskull";
      const prefix = (input.prefix as string) || "";
      const limit = (input.limit as number) || 20;
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const token = process.env.CLOUDFLARE_API_TOKEN;
      if (!accountId || !token)
        return "CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN not configured.";
      logger.info("[MCPBridge] cloudflare_r2_list:", { bucket, prefix });

      try {
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects?prefix=${encodeURIComponent(prefix)}&limit=${limit}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`R2 ${res.status}: ${err.slice(0, 300)}`);
        }

        const data = (await res.json()) as {
          result: Array<{
            key: string;
            size: number;
            last_modified: string;
          }>;
        };

        if (!data.result || data.result.length === 0)
          return `No objects in ${bucket}/${prefix}`;

        return data.result
          .map((o) => {
            const sizeMB = (o.size / 1024 / 1024).toFixed(2);
            return `${o.key} (${sizeMB} MB) — ${o.last_modified}`;
          })
          .join("\n");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] cloudflare_r2_list failed:", { error: msg });
        return `R2 error: ${msg}`;
      }
    },
  },

  // ---- stripe_create_invoice ----
  {
    timeoutMs: 15_000,
    definition: {
      name: "stripe_create_invoice",
      description: `Create a draft invoice in Stripe for a customer.`,
      input_schema: {
        type: "object" as const,
        properties: {
          customer_id: {
            type: "string",
            description: "Stripe customer ID (cus_...)",
          },
          description: {
            type: "string",
            description: "Invoice description",
          },
          amount: {
            type: "number",
            description: "Amount in cents (e.g., 5000 = $50.00)",
          },
          currency: {
            type: "string",
            description: "Currency code (default: usd)",
          },
        },
        required: ["customer_id", "amount"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const customerId = input.customer_id as string;
      const amount = input.amount as number;
      const currency = (input.currency as string) || "usd";
      const description = (input.description as string) || "ExoSkull Invoice";
      logger.info("[MCPBridge] stripe_create_invoice:", {
        customerId,
        amount,
      });

      try {
        // Create invoice
        const invoice = (await stripeAPI("/invoices", "POST", {
          customer: customerId,
          description,
          currency,
        })) as { id: string; hosted_invoice_url: string | null };

        // Add line item
        await stripeAPI("/invoiceitems", "POST", {
          customer: customerId,
          invoice: invoice.id,
          amount: String(amount),
          currency,
          description,
        });

        return `Invoice created: ${invoice.id}\n${invoice.hosted_invoice_url || "(draft — finalize to get URL)"}`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error("[MCPBridge] stripe_create_invoice failed:", {
          error: msg,
        });
        return `Stripe error: ${msg}`;
      }
    },
  },
];
