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
];
