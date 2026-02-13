/**
 * IORS Email Tools
 *
 * Tools for the AI to search, summarize, and query email data.
 * - search_emails: Find emails by query/from/category (searches body_text too)
 * - get_full_email: Read complete email body + attachments
 * - read_email: Alias for get_full_email with search_emails ID bridging
 * - email_summary: Inbox overview stats
 * - email_follow_ups: Emails needing response
 * - email_sender_info: Sender profile and patterns
 *
 * Reliability:
 * - Every query wrapped in retryQuery() with 3 attempts + exponential backoff
 * - Structured logging [EmailTools:<tool>:<step>]
 * - Graceful degradation on partial failures
 */

import type { ToolDefinition } from "./index";
import { getServiceSupabase } from "@/lib/supabase/service";

// ============================================================================
// RETRY WRAPPER — 3 attempts, exponential backoff
// ============================================================================

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 300; // 300ms, 600ms, 1200ms

async function retryQuery<T>(
  label: string,
  fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  let lastError: { message: string } | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fn();

      if (result.error) {
        lastError = result.error;
        console.warn(
          `[EmailTools:${label}] Attempt ${attempt}/${MAX_RETRIES} query error:`,
          {
            error: result.error.message,
          },
        );

        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await sleep(delay);
          continue;
        }
        return result;
      }

      if (attempt > 1) {
        console.info(`[EmailTools:${label}] Succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = { message: msg };
      console.warn(
        `[EmailTools:${label}] Attempt ${attempt}/${MAX_RETRIES} threw:`,
        {
          error: msg,
        },
      );

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
        continue;
      }
    }
  }

  return {
    data: null,
    error: lastError || { message: "Unknown error after retries" },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// TOOLS
// ============================================================================

export const emailTools: ToolDefinition[] = [
  // ----------------------------------------------------------------
  // search_emails
  // ----------------------------------------------------------------
  {
    definition: {
      name: "search_emails",
      description:
        "Przeszukaj emaile uzytkownika. Uzywaj gdy user pyta o konkretny email, nadawce, temat. Zwraca ID emaili ktorych mozna uzyc w read_email.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Szukana fraza (temat, nadawca, tresc)",
          },
          from: {
            type: "string",
            description: "Filtr: adres email nadawcy",
          },
          category: {
            type: "string",
            description:
              "Filtr: kategoria (work, personal, finance, newsletter, notification, health, social, spam)",
          },
          priority: {
            type: "string",
            description: "Filtr: priorytet (urgent, high, normal, low)",
          },
          days_back: {
            type: "number",
            description: "Ile dni wstecz szukac (domyslnie 30)",
          },
          limit: {
            type: "number",
            description: "Max wynikow (domyslnie 10)",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const daysBack = (input.days_back as number) || 30;
      const limit = Math.min((input.limit as number) || 10, 20);
      const since = new Date(Date.now() - daysBack * 86400_000).toISOString();
      const searchQuery = input.query as string;

      console.info("[EmailTools:search_emails:start]", {
        tenantId: tenantId.slice(0, 8),
        query: searchQuery,
        daysBack,
        limit,
      });

      const result = await retryQuery("search_emails:query", () => {
        let q = supabase
          .from("exo_analyzed_emails")
          .select(
            "id, subject, from_name, from_email, date_received, category, priority, snippet, action_items, follow_up_needed",
          )
          .eq("tenant_id", tenantId)
          .gte("date_received", since)
          .order("date_received", { ascending: false })
          .limit(limit);

        // Apply filters
        if (input.from) {
          q = q.ilike("from_email", `%${input.from}%`);
        }
        if (input.category) {
          q = q.eq("category", input.category);
        }
        if (input.priority) {
          q = q.eq("priority", input.priority);
        }

        // Text search in subject + snippet + body_text + from_name
        if (searchQuery) {
          q = q.or(
            `subject.ilike.%${searchQuery}%,snippet.ilike.%${searchQuery}%,from_name.ilike.%${searchQuery}%,body_text.ilike.%${searchQuery}%`,
          );
        }

        return q;
      });

      if (result.error) {
        console.error("[EmailTools:search_emails:failed]", {
          tenantId: tenantId.slice(0, 8),
          error: result.error.message,
        });
        return "Blad wyszukiwania emaili. Sprobuj ponownie.";
      }

      const emails = result.data as Array<{
        id: string;
        subject: string | null;
        from_name: string | null;
        from_email: string;
        date_received: string;
        category: string | null;
        priority: string;
        snippet: string | null;
        follow_up_needed: boolean;
      }> | null;

      if (!emails?.length) {
        return `Nie znaleziono emaili pasujacych do "${searchQuery}"`;
      }

      console.info("[EmailTools:search_emails:success]", {
        tenantId: tenantId.slice(0, 8),
        results: emails.length,
      });

      const results = emails.map((e) => {
        const from = e.from_name
          ? `${e.from_name} <${e.from_email}>`
          : e.from_email;
        const date = new Date(e.date_received).toLocaleDateString("pl-PL");
        const flags = [
          e.priority === "urgent" ? "PILNE" : null,
          e.follow_up_needed ? "FOLLOW-UP" : null,
        ]
          .filter(Boolean)
          .join(", ");
        return `- [${date}] ${from}: "${e.subject || "(brak tematu)"}" [${e.category}/${e.priority}]${flags ? ` (${flags})` : ""} (id: ${e.id})`;
      });

      return `Znaleziono ${emails.length} emaili:\n${results.join("\n")}\n\nUzyj read_email z email_id zeby przeczytac pelna tresc.`;
    },
  },

  // ----------------------------------------------------------------
  // get_full_email
  // ----------------------------------------------------------------
  {
    definition: {
      name: "get_full_email",
      description:
        "Pobierz pelna tresc emaila (body) + nazwy zalacznikow + AI podsumowanie. Uzywaj gdy user chce przeczytac caly email lub potrzebuje szczegulow.",
      input_schema: {
        type: "object" as const,
        properties: {
          email_id: {
            type: "string",
            description: "ID emaila z wynikow search_emails (jesli znany)",
          },
          subject: {
            type: "string",
            description: "Temat emaila (do wyszukania jesli brak ID)",
          },
          from_email: {
            type: "string",
            description: "Adres nadawcy (pomaga zawezic wyniki)",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      return await fetchFullEmail(input, tenantId);
    },
  },

  // ----------------------------------------------------------------
  // read_email — alias with cleaner semantics
  // ----------------------------------------------------------------
  {
    definition: {
      name: "read_email",
      description:
        "Przeczytaj caly email — pelna tresc, zalaczniki, analiza AI. Podaj email_id (z search_emails) lub subject/from_email do wyszukania.",
      input_schema: {
        type: "object" as const,
        properties: {
          email_id: {
            type: "string",
            description: "UUID emaila (z wynikow search_emails)",
          },
          subject: {
            type: "string",
            description: "Temat emaila do wyszukania (jesli brak email_id)",
          },
          from_email: {
            type: "string",
            description: "Adres nadawcy (opcjonalnie, zaweza wyniki)",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      return await fetchFullEmail(input, tenantId);
    },
  },

  // ----------------------------------------------------------------
  // email_summary
  // ----------------------------------------------------------------
  {
    definition: {
      name: "email_summary",
      description:
        "Podsumuj stan emaili: ile nieprzeczytanych, pilnych, wymagajacych odpowiedzi. Uzywaj gdy user pyta o skrzynke.",
      input_schema: {
        type: "object" as const,
        properties: {},
      },
    },
    execute: async (_input, tenantId) => {
      const supabase = getServiceSupabase();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      console.info("[EmailTools:email_summary:start]", {
        tenantId: tenantId.slice(0, 8),
      });

      // Run parallel queries with retry wrappers
      const [urgentRes, unreadRes, followUpRes, todayRes, categoryRes] =
        await Promise.allSettled([
          retryQuery("email_summary:urgent", () =>
            supabase
              .from("exo_analyzed_emails")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantId)
              .in("priority", ["urgent", "high"])
              .eq("is_read", false),
          ),
          retryQuery("email_summary:unread", () =>
            supabase
              .from("exo_analyzed_emails")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantId)
              .eq("is_read", false),
          ),
          retryQuery("email_summary:follow_up", () =>
            supabase
              .from("exo_analyzed_emails")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantId)
              .eq("follow_up_needed", true)
              .eq("direction", "inbound")
              .lte("follow_up_by", new Date().toISOString()),
          ),
          retryQuery("email_summary:today", () =>
            supabase
              .from("exo_analyzed_emails")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantId)
              .gte("date_received", today.toISOString()),
          ),
          retryQuery("email_summary:categories", () =>
            supabase
              .from("exo_analyzed_emails")
              .select("category")
              .eq("tenant_id", tenantId)
              .eq("analysis_status", "completed")
              .gte(
                "date_received",
                new Date(Date.now() - 7 * 86400_000).toISOString(),
              ),
          ),
        ]);

      const urgent =
        urgentRes.status === "fulfilled"
          ? (urgentRes.value as { data: unknown; count?: number | null })
              .count || 0
          : 0;
      const unread =
        unreadRes.status === "fulfilled"
          ? (unreadRes.value as { data: unknown; count?: number | null })
              .count || 0
          : 0;
      const overdueFollowUps =
        followUpRes.status === "fulfilled"
          ? (followUpRes.value as { data: unknown; count?: number | null })
              .count || 0
          : 0;
      const todayCount =
        todayRes.status === "fulfilled"
          ? (todayRes.value as { data: unknown; count?: number | null })
              .count || 0
          : 0;

      // Category breakdown
      let categoryBreakdown = "";
      if (categoryRes.status === "fulfilled") {
        const catResult = categoryRes.value as {
          data: Array<{ category: string }> | null;
        };
        if (catResult.data) {
          const counts: Record<string, number> = {};
          for (const c of catResult.data) {
            counts[c.category || "unknown"] =
              (counts[c.category || "unknown"] || 0) + 1;
          }
          categoryBreakdown = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => `${cat}: ${count}`)
            .join(", ");
        }
      }

      console.info("[EmailTools:email_summary:success]", {
        tenantId: tenantId.slice(0, 8),
        unread,
        urgent,
        overdueFollowUps,
        todayCount,
      });

      const lines = [
        `Podsumowanie skrzynki:`,
        `- Nieprzeczytane: ${unread}`,
        `- Pilne (nieodczytane): ${urgent}`,
        `- Przeterminowane follow-upy: ${overdueFollowUps}`,
        `- Dzis otrzymane: ${todayCount}`,
      ];

      if (categoryBreakdown) {
        lines.push(`- Kategorie (7 dni): ${categoryBreakdown}`);
      }

      if (overdueFollowUps > 0) {
        lines.push(
          `\nUWAGA: Masz ${overdueFollowUps} emaili, na ktore powinienes odpowiedziec!`,
        );
      }

      return lines.join("\n");
    },
  },

  // ----------------------------------------------------------------
  // email_follow_ups
  // ----------------------------------------------------------------
  {
    definition: {
      name: "email_follow_ups",
      description:
        "Pokaz emaile wymagajace follow-upu lub odpowiedzi. Uzywaj gdy user pyta 'na co musze odpowiedziec?'",
      input_schema: {
        type: "object" as const,
        properties: {
          include_overdue: {
            type: "boolean",
            description: "Uwzglednij przeterminowane (domyslnie true)",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const includeOverdue = input.include_overdue !== false;

      console.info("[EmailTools:email_follow_ups:start]", {
        tenantId: tenantId.slice(0, 8),
        includeOverdue,
      });

      const result = await retryQuery("email_follow_ups:query", () => {
        let q = supabase
          .from("exo_analyzed_emails")
          .select(
            "id, subject, from_name, from_email, date_received, follow_up_by, priority, snippet",
          )
          .eq("tenant_id", tenantId)
          .eq("follow_up_needed", true)
          .eq("direction", "inbound")
          .order("follow_up_by", { ascending: true })
          .limit(15);

        if (!includeOverdue) {
          q = q.gte("follow_up_by", new Date().toISOString());
        }

        return q;
      });

      if (result.error) {
        console.error("[EmailTools:email_follow_ups:failed]", {
          tenantId: tenantId.slice(0, 8),
          error: result.error.message,
        });
        return "Blad pobierania follow-upow. Sprobuj ponownie.";
      }

      const emails = result.data as Array<{
        id: string;
        subject: string | null;
        from_name: string | null;
        from_email: string;
        date_received: string;
        follow_up_by: string | null;
        priority: string;
        snippet: string | null;
      }> | null;

      if (!emails?.length) {
        return "Brak emaili wymagajacych follow-upu. Wszystko ogarniete!";
      }

      const now = new Date();
      const results = emails.map((e) => {
        const from = e.from_name
          ? `${e.from_name} <${e.from_email}>`
          : e.from_email;
        const followBy = e.follow_up_by ? new Date(e.follow_up_by) : null;
        const isOverdue = followBy && followBy < now;
        const dateStr = followBy
          ? followBy.toLocaleDateString("pl-PL")
          : "brak terminu";
        const overdueTag = isOverdue ? " PRZETERMINOWANE" : "";
        return `- ${from}: "${e.subject || "(brak)"}" -- odpowiedz do: ${dateStr}${overdueTag} [${e.priority}] (id: ${e.id})`;
      });

      const overdueCount = emails.filter(
        (e) => e.follow_up_by && new Date(e.follow_up_by) < now,
      ).length;

      let header = `Emaile wymagajace odpowiedzi (${emails.length}):`;
      if (overdueCount > 0) {
        header += `\n${overdueCount} przeterminowanych!`;
      }

      console.info("[EmailTools:email_follow_ups:success]", {
        tenantId: tenantId.slice(0, 8),
        total: emails.length,
        overdue: overdueCount,
      });

      return `${header}\n${results.join("\n")}`;
    },
  },

  // ----------------------------------------------------------------
  // email_sender_info
  // ----------------------------------------------------------------
  {
    definition: {
      name: "email_sender_info",
      description:
        "Pokaz informacje o nadawcy: ile emaili, jak czesto pisze, jaka relacja. Uzywaj gdy user pyta 'kto to jest?'",
      input_schema: {
        type: "object" as const,
        properties: {
          email: {
            type: "string",
            description: "Adres email nadawcy",
          },
        },
        required: ["email"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const emailAddr = (input.email as string).toLowerCase();

      console.info("[EmailTools:email_sender_info:start]", {
        tenantId: tenantId.slice(0, 8),
        email: emailAddr,
      });

      // Run both queries in parallel with retry
      const [profileResult, recentResult] = await Promise.all([
        retryQuery("email_sender_info:profile", () =>
          supabase
            .from("exo_email_sender_profiles")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("email_address", emailAddr)
            .maybeSingle(),
        ),
        retryQuery("email_sender_info:recent", () =>
          supabase
            .from("exo_analyzed_emails")
            .select("subject, date_received, category, priority")
            .eq("tenant_id", tenantId)
            .eq("from_email", emailAddr)
            .order("date_received", { ascending: false })
            .limit(5),
        ),
      ]);

      const profile = profileResult.data as {
        display_name: string | null;
        email_address: string;
        domain: string | null;
        relationship: string;
        importance_score: number;
        emails_received: number;
        last_email_at: string | null;
      } | null;

      const recentEmails = recentResult.data as Array<{
        subject: string | null;
        date_received: string;
        category: string | null;
        priority: string;
      }> | null;

      if (!profile && !recentEmails?.length) {
        return `Brak danych o nadawcy ${emailAddr}`;
      }

      const lines: string[] = [];

      if (profile) {
        lines.push(`Nadawca: ${profile.display_name || emailAddr}`);
        lines.push(`Email: ${profile.email_address}`);
        lines.push(`Domena: ${profile.domain || "nieznana"}`);
        lines.push(`Relacja: ${profile.relationship}`);
        lines.push(`Waznosc: ${profile.importance_score}/100`);
        lines.push(`Emaili otrzymanych: ${profile.emails_received}`);
        if (profile.last_email_at) {
          lines.push(
            `Ostatni email: ${new Date(profile.last_email_at).toLocaleDateString("pl-PL")}`,
          );
        }
      }

      if (recentEmails?.length) {
        lines.push(`\nOstatnie emaile:`);
        for (const e of recentEmails) {
          const date = new Date(e.date_received).toLocaleDateString("pl-PL");
          lines.push(
            `- [${date}] "${e.subject || "(brak)"}" [${e.category}/${e.priority}]`,
          );
        }
      }

      console.info("[EmailTools:email_sender_info:success]", {
        tenantId: tenantId.slice(0, 8),
        email: emailAddr,
        hasProfile: !!profile,
        recentCount: recentEmails?.length || 0,
      });

      return lines.join("\n");
    },
  },
];

// ============================================================================
// SHARED: fetchFullEmail implementation (used by get_full_email + read_email)
// ============================================================================

async function fetchFullEmail(
  input: Record<string, unknown>,
  tenantId: string,
): Promise<string> {
  const supabase = getServiceSupabase();

  console.info("[EmailTools:get_full_email:start]", {
    tenantId: tenantId.slice(0, 8),
    hasId: !!input.email_id,
    subject: input.subject ? String(input.subject).slice(0, 40) : undefined,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let queryFn: () => PromiseLike<any>;

  if (input.email_id) {
    queryFn = () =>
      supabase
        .from("exo_analyzed_emails")
        .select(
          "id, subject, from_name, from_email, to_emails, cc_emails, date_received, body_text, body_html, attachment_names, attachment_metadata, action_items, key_facts, category, priority, sentiment, direction, has_attachments, follow_up_needed, follow_up_by",
        )
        .eq("tenant_id", tenantId)
        .eq("id", input.email_id as string);
  } else if (input.subject) {
    queryFn = () => {
      let q = supabase
        .from("exo_analyzed_emails")
        .select(
          "id, subject, from_name, from_email, to_emails, cc_emails, date_received, body_text, body_html, attachment_names, attachment_metadata, action_items, key_facts, category, priority, sentiment, direction, has_attachments, follow_up_needed, follow_up_by",
        )
        .eq("tenant_id", tenantId)
        .ilike("subject", `%${input.subject}%`);
      if (input.from_email) {
        q = q.ilike("from_email", `%${input.from_email}%`);
      }
      q = q.order("date_received", { ascending: false }).limit(1);
      return q;
    };
  } else {
    return "Podaj email_id lub temat (subject) emaila do wyszukania.";
  }

  const result = await retryQuery("get_full_email:query", queryFn);

  if (result.error) {
    console.error("[EmailTools:get_full_email:failed]", {
      tenantId: tenantId.slice(0, 8),
      error: result.error.message,
    });
    return "Blad pobierania emaila. Sprobuj ponownie.";
  }

  interface FullEmailRow {
    id: string;
    subject: string | null;
    from_name: string | null;
    from_email: string;
    to_emails: string[];
    cc_emails: string[];
    date_received: string;
    body_text: string | null;
    body_html: string | null;
    attachment_names: string[];
    attachment_metadata: Array<{
      attachmentId: string;
      filename: string;
      mimeType: string;
      size: number;
    }>;
    action_items: Array<{ text: string; due_date?: string }>;
    key_facts: Array<{ fact: string }>;
    category: string | null;
    priority: string | null;
    sentiment: string | null;
    direction: string | null;
    has_attachments: boolean;
    follow_up_needed: boolean;
    follow_up_by: string | null;
  }

  const emails = result.data as FullEmailRow[] | null;

  if (!emails?.length) {
    return "Nie znaleziono emaila o podanych kryteriach.";
  }

  const e = emails[0];
  const from = e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email;
  const date = new Date(e.date_received).toLocaleString("pl-PL");

  const lines: string[] = [
    `ID: ${e.id}`,
    `Od: ${from}`,
    `Do: ${(e.to_emails || []).join(", ")}`,
    e.cc_emails?.length ? `CC: ${e.cc_emails.join(", ")}` : "",
    `Data: ${date}`,
    `Temat: ${e.subject || "(brak tematu)"}`,
    `Kategoria: ${e.category || "?"} | Priorytet: ${e.priority || "?"}`,
    `Kierunek: ${e.direction || "?"}`,
    "",
  ].filter(Boolean);

  // Body text (truncate to 3000 chars for context window)
  const body = (e.body_text || "").slice(0, 3000);
  lines.push("--- TRESC ---");
  lines.push(body || "(brak tresci)");
  if ((e.body_text || "").length > 3000) {
    lines.push("... (skrocone -- pelna wersja dostepna w widoku emaila)");
  }

  // Attachments with download URLs
  if (e.has_attachments && e.attachment_names?.length) {
    lines.push("");
    lines.push(`--- ZALACZNIKI (${e.attachment_names.length}) ---`);
    for (const name of e.attachment_names) {
      const downloadUrl = `/api/emails/${e.id}/attachments/${encodeURIComponent(name)}`;
      lines.push(`- ${name} (pobierz: ${downloadUrl})`);
    }
  }

  // AI analysis
  if (e.action_items?.length || e.key_facts?.length) {
    lines.push("");
    lines.push("--- ANALIZA AI ---");
    if (e.action_items?.length) {
      lines.push("Akcje:");
      for (const item of e.action_items) {
        const due = item.due_date ? ` (do: ${item.due_date})` : "";
        lines.push(`  - ${item.text}${due}`);
      }
    }
    if (e.key_facts?.length) {
      lines.push("Kluczowe fakty:");
      for (const fact of e.key_facts) {
        lines.push(`  - ${fact.fact}`);
      }
    }
  }

  if (e.follow_up_needed) {
    const followBy = e.follow_up_by
      ? new Date(e.follow_up_by).toLocaleDateString("pl-PL")
      : "nieokreslony termin";
    lines.push(`\nFOLLOW-UP wymagany do: ${followBy}`);
  }

  console.info("[EmailTools:get_full_email:success]", {
    tenantId: tenantId.slice(0, 8),
    emailId: e.id,
    bodyLength: (e.body_text || "").length,
    attachments: e.attachment_names?.length || 0,
  });

  return lines.join("\n");
}
