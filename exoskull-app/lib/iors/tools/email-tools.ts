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

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
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
        logger.warn(
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
        logger.info(`[EmailTools:${label}] Succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = { message: msg };
      logger.warn(
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
            description:
              "Szukana fraza — szuka w temacie, tresci, nazwie nadawcy I adresie email nadawcy. Podaj imie, nazwisko, adres email lub temat.",
          },
          from: {
            type: "string",
            description:
              "Filtr: adres email nadawcy (dokladny lub czesc). Uzyj gdy user podaje adres email.",
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
            description:
              "Ile dni wstecz szukac (domyslnie 30). Uzyj 90 lub 365 jesli nie ma wynikow.",
          },
          limit: {
            type: "number",
            description: "Max wynikow (domyslnie 10)",
          },
        },
        required: [],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const daysBack = (input.days_back as number) || 30;
      const limit = Math.min((input.limit as number) || 10, 20);
      const since = new Date(Date.now() - daysBack * 86400_000).toISOString();
      const searchQuery = (input.query as string) || "";

      logger.info("[EmailTools:search_emails:start]", {
        tenantId: tenantId.slice(0, 8),
        query: searchQuery || "(empty)",
        from: input.from || "(none)",
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

        // Exact from_email filter (when user provides email address)
        if (input.from) {
          q = q.ilike("from_email", `%${input.from}%`);
        }
        if (input.category) {
          q = q.eq("category", input.category);
        }
        if (input.priority) {
          q = q.eq("priority", input.priority);
        }

        // Text search in subject + snippet + body_text + from_name + from_email
        if (searchQuery) {
          q = q.or(
            `subject.ilike.%${searchQuery}%,snippet.ilike.%${searchQuery}%,from_name.ilike.%${searchQuery}%,from_email.ilike.%${searchQuery}%,body_text.ilike.%${searchQuery}%`,
          );
        }

        return q;
      });

      if (result.error) {
        logger.error("[EmailTools:search_emails:failed]", {
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
        // Check total email count + account status in parallel
        const [countResult, accountResult] = await Promise.all([
          retryQuery("search_emails:count", () =>
            supabase
              .from("exo_analyzed_emails")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantId),
          ),
          retryQuery("search_emails:account_check", () =>
            supabase
              .from("exo_email_accounts")
              .select(
                "id, email_address, sync_enabled, last_sync_at, sync_error",
              )
              .eq("tenant_id", tenantId)
              .limit(5),
          ),
        ]);

        // Supabase returns count on the response object (not inside data) when head:true
        const totalEmails =
          (countResult as unknown as { count?: number | null }).count ?? 0;

        const accounts =
          (accountResult.data as Array<{
            id: string;
            email_address: string;
            sync_enabled: boolean;
            last_sync_at: string | null;
            sync_error: string | null;
          }> | null) || [];

        if (totalEmails === 0) {
          // Give detailed diagnostic based on account status
          if (accounts.length === 0) {
            return `Brak polaczonego konta email. Polacz Gmail/Outlook w Ustawienia > Integracje.`;
          }

          const acct = accounts[0];
          if (!acct.sync_enabled) {
            return `Konto ${acct.email_address} jest polaczone ale synchronizacja jest wylaczona. Wlacz ja w Ustawienia > Integracje.`;
          }
          if (acct.sync_error) {
            return `Konto ${acct.email_address} ma blad synchronizacji: ${acct.sync_error}. Sprobuj ponownie polaczyc w Ustawienia > Integracje.`;
          }
          if (!acct.last_sync_at) {
            return `Konto ${acct.email_address} jest polaczone. Pierwsza synchronizacja jeszcze nie nastapila — powinna ruszyc w ciagu kilku minut.`;
          }

          // Account exists, sync enabled, no error, but 0 emails — sync might be stale
          const lastSync = new Date(acct.last_sync_at);
          const minutesAgo = Math.round(
            (Date.now() - lastSync.getTime()) / 60000,
          );
          return `Konto ${acct.email_address} jest polaczone (ostatnia sync: ${minutesAgo} min temu), ale w bazie brak emaili. Mozliwe ze synchronizacja nie pobiera wiadomosci — sprawdz logi lub polacz ponownie.`;
        }

        const hint =
          daysBack < 90
            ? ` Sprobuj z wiekszym zakresem dat (np. days_back=365).`
            : "";
        return `Nie znaleziono emaili pasujacych do "${searchQuery || input.from || "brak frazy"}" w ostatnich ${daysBack} dniach (w bazie jest ${totalEmails} emaili).${hint}`;
      }

      logger.info("[EmailTools:search_emails:success]", {
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

      logger.info("[EmailTools:email_summary:start]", {
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

      logger.info("[EmailTools:email_summary:success]", {
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

      logger.info("[EmailTools:email_follow_ups:start]", {
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
        logger.error("[EmailTools:email_follow_ups:failed]", {
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

      logger.info("[EmailTools:email_follow_ups:success]", {
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

      logger.info("[EmailTools:email_sender_info:start]", {
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

      logger.info("[EmailTools:email_sender_info:success]", {
        tenantId: tenantId.slice(0, 8),
        email: emailAddr,
        hasProfile: !!profile,
        recentCount: recentEmails?.length || 0,
      });

      return lines.join("\n");
    },
  },
  // ----------------------------------------------------------------
  // list_newsletters — find all newsletter senders for unsubscribe
  // ----------------------------------------------------------------
  {
    definition: {
      name: "list_newsletters",
      description:
        "Pokaz liste newsletterow i emaili marketingowych. Uzywaj gdy user chce wiedziec z czego sie wypisac lub mowi 'wypisz mnie ze wszystkiego'.",
      input_schema: {
        type: "object" as const,
        properties: {
          include_unsubscribed: {
            type: "boolean",
            description: "Pokaz tez juz wypisane (domyslnie false)",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const includeUnsub = input.include_unsubscribed === true;

      logger.info("[EmailTools:list_newsletters:start]", {
        tenantId: tenantId.slice(0, 8),
      });

      // Get newsletter senders with email counts and unsubscribe status
      const result = await retryQuery("list_newsletters:query", () => {
        let q = supabase
          .from("exo_email_sender_profiles")
          .select(
            "id, email_address, display_name, emails_received, is_newsletter, is_unsubscribed, unsubscribe_url, importance_score",
          )
          .eq("tenant_id", tenantId)
          .order("emails_received", { ascending: false })
          .limit(50);

        if (!includeUnsub) {
          q = q.or("is_unsubscribed.is.null,is_unsubscribed.eq.false");
        }

        return q;
      });

      if (result.error) {
        logger.error("[EmailTools:list_newsletters:failed]", {
          error: result.error.message,
        });
        return "Blad pobierania listy newsletterow.";
      }

      // Also check analyzed emails for senders with unsubscribe URLs
      const emailResult = await retryQuery("list_newsletters:emails", () =>
        supabase
          .from("exo_analyzed_emails")
          .select("from_email, from_name, unsubscribe_url, category")
          .eq("tenant_id", tenantId)
          .eq("is_newsletter", true)
          .not("unsubscribe_url", "is", null)
          .order("date_received", { ascending: false })
          .limit(200),
      );

      // Build unique sender map with unsubscribe URLs
      const senderMap = new Map<
        string,
        {
          name: string;
          count: number;
          hasUnsub: boolean;
          unsubscribed: boolean;
          category: string;
        }
      >();

      // From sender profiles
      const profiles =
        (result.data as Array<{
          email_address: string;
          display_name: string | null;
          emails_received: number;
          is_newsletter: boolean;
          is_unsubscribed: boolean;
          unsubscribe_url: string | null;
        }>) || [];

      for (const p of profiles) {
        if (p.is_newsletter || p.emails_received > 3) {
          senderMap.set(p.email_address, {
            name: p.display_name || p.email_address,
            count: p.emails_received,
            hasUnsub: !!p.unsubscribe_url,
            unsubscribed: !!p.is_unsubscribed,
            category: "newsletter",
          });
        }
      }

      // From emails with unsubscribe URLs (may add senders not in profiles)
      const emails =
        (emailResult.data as Array<{
          from_email: string;
          from_name: string | null;
          unsubscribe_url: string | null;
          category: string | null;
        }>) || [];

      for (const e of emails) {
        const existing = senderMap.get(e.from_email);
        if (existing) {
          existing.hasUnsub = existing.hasUnsub || !!e.unsubscribe_url;
        } else {
          senderMap.set(e.from_email, {
            name: e.from_name || e.from_email,
            count: 1,
            hasUnsub: !!e.unsubscribe_url,
            unsubscribed: false,
            category: e.category || "newsletter",
          });
        }
      }

      if (senderMap.size === 0) {
        return "Nie znaleziono newsletterow ani emaili marketingowych. Mozliwe ze synchronizacja jeszcze nie wykryla List-Unsubscribe headerow.";
      }

      const sorted = [...senderMap.entries()].sort(
        (a, b) => b[1].count - a[1].count,
      );

      const lines = sorted.map(([email, info]) => {
        const status = info.unsubscribed
          ? " [WYPISANY]"
          : info.hasUnsub
            ? " [mozna wypisac]"
            : " [brak linka unsub]";
        return `- ${info.name} (${email}) — ${info.count} emaili${status}`;
      });

      const canUnsub = sorted.filter(
        ([, info]) => info.hasUnsub && !info.unsubscribed,
      ).length;

      logger.info("[EmailTools:list_newsletters:success]", {
        tenantId: tenantId.slice(0, 8),
        total: sorted.length,
        canUnsub,
      });

      return `Newslettery i maile marketingowe (${sorted.length}):\n${lines.join("\n")}\n\n${canUnsub} z nich mozna automatycznie wypisac. Uzyj unsubscribe_email z adresem nadawcy lub bulk_unsubscribe zeby wypisac ze wszystkich.`;
    },
  },

  // ----------------------------------------------------------------
  // unsubscribe_email — unsubscribe from a specific sender
  // ----------------------------------------------------------------
  {
    definition: {
      name: "unsubscribe_email",
      description:
        "Wypisz usera z newslettera/emaili marketingowych od konkretnego nadawcy. Klika link List-Unsubscribe jesli dostepny. Uzywaj gdy user mowi 'wypisz mnie z X'.",
      input_schema: {
        type: "object" as const,
        properties: {
          sender_email: {
            type: "string",
            description: "Adres email nadawcy od ktorego chcemy sie wypisac",
          },
        },
        required: ["sender_email"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const senderEmail = (input.sender_email as string).toLowerCase().trim();

      logger.info("[EmailTools:unsubscribe_email:start]", {
        tenantId: tenantId.slice(0, 8),
        sender: senderEmail,
      });

      // Find the most recent email with unsubscribe URL from this sender
      const { data: emails } = await retryQuery("unsubscribe:find_url", () =>
        supabase
          .from("exo_analyzed_emails")
          .select("id, unsubscribe_url, list_unsubscribe_post, from_name")
          .eq("tenant_id", tenantId)
          .ilike("from_email", `%${senderEmail}%`)
          .not("unsubscribe_url", "is", null)
          .order("date_received", { ascending: false })
          .limit(1),
      );

      const email = (
        emails as Array<{
          id: string;
          unsubscribe_url: string;
          list_unsubscribe_post: string | null;
          from_name: string | null;
        }>
      )?.[0];

      if (!email?.unsubscribe_url) {
        // Try to find any email from this sender to check
        const { data: anyEmail } = await retryQuery(
          "unsubscribe:check_sender",
          () =>
            supabase
              .from("exo_analyzed_emails")
              .select("id, from_name")
              .eq("tenant_id", tenantId)
              .ilike("from_email", `%${senderEmail}%`)
              .limit(1),
        );

        if (
          !(anyEmail as Array<{ id: string; from_name: string | null }>)?.length
        ) {
          return `Nie znaleziono emaili od ${senderEmail}. Sprawdz adres.`;
        }

        // Mark as unsubscribed in profile even without URL
        await supabase
          .from("exo_email_sender_profiles")
          .update({
            is_unsubscribed: true,
            unsubscribed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenantId)
          .eq("email_address", senderEmail);

        return `Oznaczono ${senderEmail} jako wypisany, ale nie znaleziono linku List-Unsubscribe. Emaile od tego nadawcy beda oznaczane jako spam/ignorowane. Jesli chcesz calkowicie sie wypisac, otworz ostatni email od nich i kliknij "Unsubscribe" w stopce.`;
      }

      // Try to execute unsubscribe
      let unsubResult: "success" | "failed" | "pending" = "pending";
      const unsubUrl = email.unsubscribe_url;

      try {
        if (email.list_unsubscribe_post) {
          // RFC 8058: One-click unsubscribe via POST
          const resp = await fetch(unsubUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: email.list_unsubscribe_post,
            signal: AbortSignal.timeout(10_000),
          });
          unsubResult = resp.ok ? "success" : "failed";
          if (!resp.ok) {
            logger.warn("[EmailTools:unsubscribe_email:post_failed]", {
              status: resp.status,
              url: unsubUrl,
            });
          }
        } else {
          // GET request to unsubscribe URL
          const resp = await fetch(unsubUrl, {
            method: "GET",
            signal: AbortSignal.timeout(10_000),
            redirect: "follow",
          });
          // Most unsubscribe pages return 200 even if they need confirmation
          unsubResult = resp.ok ? "success" : "failed";
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("[EmailTools:unsubscribe_email:fetch_failed]", {
          error: msg,
          url: unsubUrl,
        });
        unsubResult = "failed";
      }

      // Update sender profile
      await supabase.from("exo_email_sender_profiles").upsert(
        {
          tenant_id: tenantId,
          email_address: senderEmail,
          display_name: email.from_name,
          is_unsubscribed: true,
          is_newsletter: true,
          unsubscribe_url: unsubUrl,
          unsubscribed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,email_address" },
      );

      logger.info("[EmailTools:unsubscribe_email:done]", {
        tenantId: tenantId.slice(0, 8),
        sender: senderEmail,
        result: unsubResult,
      });

      if (unsubResult === "success") {
        return `Wypisano z ${email.from_name || senderEmail}. Link unsubscribe zostal klikniety pomyslnie.`;
      } else {
        return `Proba wypisania z ${email.from_name || senderEmail} — link unsubscribe nie odpowiedzial prawidlowo. Oznaczylem nadawce jako wypisanego w systemie. Moze byc konieczne reczne klikniecie linku w emailu.`;
      }
    },
  },

  // ----------------------------------------------------------------
  // bulk_unsubscribe — unsubscribe from all newsletters at once
  // ----------------------------------------------------------------
  {
    definition: {
      name: "bulk_unsubscribe",
      description:
        "Wypisz usera ze WSZYSTKICH newsletterow i emaili marketingowych naraz. Klika linki List-Unsubscribe dla kazdego nadawcy. Uzywaj gdy user mowi 'wypisz mnie ze wszystkich' lub 'wypisz mnie ze wszystkich newsletterow'.",
      input_schema: {
        type: "object" as const,
        properties: {
          dry_run: {
            type: "boolean",
            description:
              "Jesli true, tylko pokaz co zostanie wypisane (bez akcji). Domyslnie false.",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const dryRun = input.dry_run === true;

      logger.info("[EmailTools:bulk_unsubscribe:start]", {
        tenantId: tenantId.slice(0, 8),
        dryRun,
      });

      // Find all newsletter senders with unsubscribe URLs
      const { data: newsletters } = await retryQuery(
        "bulk_unsubscribe:find",
        () =>
          supabase
            .from("exo_analyzed_emails")
            .select(
              "from_email, from_name, unsubscribe_url, list_unsubscribe_post",
            )
            .eq("tenant_id", tenantId)
            .eq("is_newsletter", true)
            .not("unsubscribe_url", "is", null)
            .order("date_received", { ascending: false }),
      );

      if (!(newsletters as Array<{ from_email: string }>)?.length) {
        return "Nie znaleziono newsletterow z linkami unsubscribe. Sprawdz czy synchronizacja emaili dziala i czy przyszly nowe emaile.";
      }

      // Deduplicate by sender email, keep most recent
      const senderMap = new Map<
        string,
        {
          name: string;
          url: string;
          post: string | null;
        }
      >();

      for (const nl of newsletters as Array<{
        from_email: string;
        from_name: string | null;
        unsubscribe_url: string;
        list_unsubscribe_post: string | null;
      }>) {
        const key = nl.from_email.toLowerCase();
        if (!senderMap.has(key)) {
          senderMap.set(key, {
            name: nl.from_name || nl.from_email,
            url: nl.unsubscribe_url,
            post: nl.list_unsubscribe_post,
          });
        }
      }

      // Check which are already unsubscribed
      const { data: alreadyUnsub } = await retryQuery(
        "bulk_unsubscribe:check_existing",
        () =>
          supabase
            .from("exo_email_sender_profiles")
            .select("email_address")
            .eq("tenant_id", tenantId)
            .eq("is_unsubscribed", true),
      );

      const alreadySet = new Set(
        ((alreadyUnsub as Array<{ email_address: string }>) || []).map((a) =>
          a.email_address.toLowerCase(),
        ),
      );

      // Filter out already unsubscribed
      const toProcess = [...senderMap.entries()].filter(
        ([email]) => !alreadySet.has(email),
      );

      if (toProcess.length === 0) {
        return `Wszystkie znalezione newslettery (${senderMap.size}) sa juz wypisane.`;
      }

      if (dryRun) {
        const lines = toProcess.map(
          ([email, info]) => `- ${info.name} (${email})`,
        );
        return `Znaleziono ${toProcess.length} newsletterow do wypisania:\n${lines.join("\n")}\n\nUzyj bulk_unsubscribe bez dry_run zeby wypisac ze wszystkich.`;
      }

      // Execute unsubscribe for each sender (parallel, max 5 concurrent)
      const results: Array<{
        email: string;
        name: string;
        ok: boolean;
      }> = [];

      const batchSize = 5;
      for (let i = 0; i < toProcess.length; i += batchSize) {
        const batch = toProcess.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(async ([email, info]) => {
            try {
              const method = info.post ? "POST" : "GET";
              const fetchOpts: RequestInit = {
                method,
                signal: AbortSignal.timeout(8_000),
                redirect: "follow",
              };
              if (info.post) {
                fetchOpts.headers = {
                  "Content-Type": "application/x-www-form-urlencoded",
                };
                fetchOpts.body = info.post;
              }

              const resp = await fetch(info.url, fetchOpts);

              // Update sender profile
              await supabase.from("exo_email_sender_profiles").upsert(
                {
                  tenant_id: tenantId,
                  email_address: email,
                  display_name: info.name,
                  is_unsubscribed: true,
                  is_newsletter: true,
                  unsubscribe_url: info.url,
                  unsubscribed_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "tenant_id,email_address" },
              );

              return { email, name: info.name, ok: resp.ok };
            } catch {
              // Mark as unsubscribed in DB even if fetch failed
              await supabase.from("exo_email_sender_profiles").upsert(
                {
                  tenant_id: tenantId,
                  email_address: email,
                  display_name: info.name,
                  is_unsubscribed: true,
                  is_newsletter: true,
                  unsubscribe_url: info.url,
                  unsubscribed_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "tenant_id,email_address" },
              );
              return { email, name: info.name, ok: false };
            }
          }),
        );

        for (const r of batchResults) {
          if (r.status === "fulfilled") {
            results.push(r.value);
          }
        }
      }

      const succeeded = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;

      logger.info("[EmailTools:bulk_unsubscribe:done]", {
        tenantId: tenantId.slice(0, 8),
        total: results.length,
        succeeded,
        failed,
      });

      const lines: string[] = [];
      for (const r of results) {
        lines.push(
          `- ${r.name} (${r.email}): ${r.ok ? "WYPISANY" : "link nie odpowiedzial — oznaczony w systemie"}`,
        );
      }

      return `Bulk unsubscribe zakonczone:\n- Wypisano: ${succeeded}\n- Nie udalo sie kliknac linku (oznaczone jako wypisane): ${failed}\n\n${lines.join("\n")}\n\nWszystcy nadawcy zostali oznaczeni jako wypisani w systemie. Jesli link nie zadzialal, emaile od tych nadawcow beda ignorowane.`;
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

  logger.info("[EmailTools:get_full_email:start]", {
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
    logger.error("[EmailTools:get_full_email:failed]", {
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

  logger.info("[EmailTools:get_full_email:success]", {
    tenantId: tenantId.slice(0, 8),
    emailId: e.id,
    bodyLength: (e.body_text || "").length,
    attachments: e.attachment_names?.length || 0,
  });

  return lines.join("\n");
}
