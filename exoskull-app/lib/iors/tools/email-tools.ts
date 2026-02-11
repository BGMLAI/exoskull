/**
 * IORS Email Tools
 *
 * Tools for the AI to search, summarize, and query email data.
 * - search_emails: Find emails by query/from/category
 * - email_summary: Inbox overview stats
 * - email_follow_ups: Emails needing response
 * - email_sender_info: Sender profile and patterns
 */

import type { ToolDefinition } from "./index";
import { getServiceSupabase } from "@/lib/supabase/service";

export const emailTools: ToolDefinition[] = [
  // ----------------------------------------------------------------
  // search_emails
  // ----------------------------------------------------------------
  {
    definition: {
      name: "search_emails",
      description:
        "Przeszukaj emaile uzytkownika. Uzywaj gdy user pyta o konkretny email, nadawce, temat.",
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

      let query = supabase
        .from("exo_analyzed_emails")
        .select(
          "subject, from_name, from_email, date_received, category, priority, snippet, action_items, follow_up_needed",
        )
        .eq("tenant_id", tenantId)
        .gte("date_received", since)
        .order("date_received", { ascending: false })
        .limit(limit);

      // Apply filters
      if (input.from) {
        query = query.ilike("from_email", `%${input.from}%`);
      }
      if (input.category) {
        query = query.eq("category", input.category);
      }
      if (input.priority) {
        query = query.eq("priority", input.priority);
      }

      // Text search in subject + snippet
      const searchQuery = input.query as string;
      if (searchQuery) {
        query = query.or(
          `subject.ilike.%${searchQuery}%,snippet.ilike.%${searchQuery}%,from_name.ilike.%${searchQuery}%`,
        );
      }

      const { data: emails, error } = await query;

      if (error) {
        console.error("[EmailTools] search_emails error:", error);
        return "Blad wyszukiwania emaili";
      }
      if (!emails?.length) {
        return `Nie znaleziono emaili pasujacych do "${searchQuery}"`;
      }

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
        return `- [${date}] ${from}: "${e.subject || "(brak tematu)"}" [${e.category}/${e.priority}]${flags ? ` (${flags})` : ""}`;
      });

      return `Znaleziono ${emails.length} emaili:\n${results.join("\n")}`;
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

      // Run parallel queries
      const [urgentRes, unreadRes, followUpRes, todayRes, categoryRes] =
        await Promise.allSettled([
          supabase
            .from("exo_analyzed_emails")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("priority", ["urgent", "high"])
            .eq("is_read", false),
          supabase
            .from("exo_analyzed_emails")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("is_read", false),
          supabase
            .from("exo_analyzed_emails")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("follow_up_needed", true)
            .eq("direction", "inbound")
            .lte("follow_up_by", new Date().toISOString()),
          supabase
            .from("exo_analyzed_emails")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .gte("date_received", today.toISOString()),
          supabase
            .from("exo_analyzed_emails")
            .select("category")
            .eq("tenant_id", tenantId)
            .eq("analysis_status", "completed")
            .gte(
              "date_received",
              new Date(Date.now() - 7 * 86400_000).toISOString(),
            ),
        ]);

      const urgent =
        urgentRes.status === "fulfilled"
          ? (urgentRes.value as { count: number | null }).count || 0
          : 0;
      const unread =
        unreadRes.status === "fulfilled"
          ? (unreadRes.value as { count: number | null }).count || 0
          : 0;
      const overdueFollowUps =
        followUpRes.status === "fulfilled"
          ? (followUpRes.value as { count: number | null }).count || 0
          : 0;
      const todayCount =
        todayRes.status === "fulfilled"
          ? (todayRes.value as { count: number | null }).count || 0
          : 0;

      // Category breakdown
      let categoryBreakdown = "";
      if (
        categoryRes.status === "fulfilled" &&
        (categoryRes.value as { data: { category: string }[] | null }).data
      ) {
        const cats = (categoryRes.value as { data: { category: string }[] })
          .data;
        const counts: Record<string, number> = {};
        for (const c of cats) {
          counts[c.category || "unknown"] =
            (counts[c.category || "unknown"] || 0) + 1;
        }
        categoryBreakdown = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([cat, count]) => `${cat}: ${count}`)
          .join(", ");
      }

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

      let query = supabase
        .from("exo_analyzed_emails")
        .select(
          "subject, from_name, from_email, date_received, follow_up_by, priority, snippet",
        )
        .eq("tenant_id", tenantId)
        .eq("follow_up_needed", true)
        .eq("direction", "inbound")
        .order("follow_up_by", { ascending: true })
        .limit(15);

      if (!includeOverdue) {
        query = query.gte("follow_up_by", new Date().toISOString());
      }

      const { data: emails, error } = await query;

      if (error) {
        console.error("[EmailTools] email_follow_ups error:", error);
        return "Blad pobierania follow-upow";
      }
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
        const overdueTag = isOverdue ? " ⚠️ PRZETERMINOWANE" : "";
        return `- ${from}: "${e.subject || "(brak)"}" — odpowiedz do: ${dateStr}${overdueTag} [${e.priority}]`;
      });

      const overdueCount = emails.filter(
        (e) => e.follow_up_by && new Date(e.follow_up_by) < now,
      ).length;

      let header = `Emaile wymagajace odpowiedzi (${emails.length}):`;
      if (overdueCount > 0) {
        header += `\n⚠️ ${overdueCount} przeterminowanych!`;
      }

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

      // Get sender profile
      const { data: profile } = await supabase
        .from("exo_email_sender_profiles")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("email_address", emailAddr)
        .maybeSingle();

      // Get recent emails from this sender
      const { data: recentEmails } = await supabase
        .from("exo_analyzed_emails")
        .select("subject, date_received, category, priority")
        .eq("tenant_id", tenantId)
        .eq("from_email", emailAddr)
        .order("date_received", { ascending: false })
        .limit(5);

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

      return lines.join("\n");
    },
  },
];
