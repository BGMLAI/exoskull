/**
 * Facebook / Instagram IORS Tools
 *
 * 12 tools: page posting, page insights, FB Ads (5), Instagram publish (2), Instagram DM (1)
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/rigs/oauth";
import { logger } from "@/lib/logger";

const GRAPH_API = "https://graph.facebook.com/v21.0";

// ---------------------------------------------------------------------------
// TOKEN HELPERS
// ---------------------------------------------------------------------------

async function getFacebookToken(tenantId: string): Promise<string | null> {
  const supabase = getServiceSupabase();
  const { data: conn } = await supabase
    .from("exo_rig_connections")
    .select("id, rig_slug, access_token, refresh_token, expires_at")
    .eq("tenant_id", tenantId)
    .eq("rig_slug", "facebook")
    .maybeSingle();

  if (!conn?.access_token) return null;

  try {
    return await ensureFreshToken(conn);
  } catch (err) {
    logger.error("[FacebookTools] Token refresh failed:", err);
    return null;
  }
}

async function getPageToken(
  tenantId: string,
  pageId?: string,
): Promise<{ pageId: string; pageToken: string; igAccountId?: string } | null> {
  const token = await getFacebookToken(tenantId);
  if (!token) return null;

  try {
    // Fetch pages with access tokens
    const res = await fetch(
      `${GRAPH_API}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${token}`,
    );
    if (!res.ok) return null;

    const data = await res.json();
    const pages = data.data || [];

    let page;
    if (pageId) {
      page = pages.find((p: Record<string, unknown>) => p.id === pageId);
    } else {
      page = pages[0]; // First page
    }

    if (!page?.access_token) return null;
    return {
      pageId: page.id,
      pageToken: page.access_token,
      igAccountId: (page.instagram_business_account as Record<string, string>)
        ?.id,
    };
  } catch {
    return null;
  }
}

const NO_FB = "Brak połączenia Facebook. Powiedz 'połącz Facebook'.";

// ---------------------------------------------------------------------------
// PAGE TOOLS
// ---------------------------------------------------------------------------

export const facebookTools: ToolDefinition[] = [
  // 4A: Page posting + insights
  {
    definition: {
      name: "publish_page_post",
      description: "Opublikuj post na stronie Facebook.",
      input_schema: {
        type: "object" as const,
        properties: {
          message: { type: "string", description: "Treść posta" },
          link: {
            type: "string",
            description: "URL do załączenia (opcjonalnie)",
          },
          page_id: {
            type: "string",
            description: "ID strony (opcjonalnie — użyje pierwszej)",
          },
        },
        required: ["message"],
      },
    },
    execute: async (input, tenantId) => {
      const pageInfo = await getPageToken(
        tenantId,
        input.page_id as string | undefined,
      );
      if (!pageInfo) return NO_FB;

      try {
        const body: Record<string, string> = {
          message: input.message as string,
        };
        if (input.link) body.link = input.link as string;

        const res = await fetch(`${GRAPH_API}/${pageInfo.pageId}/feed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, access_token: pageInfo.pageToken }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return `Błąd publikacji: ${(err as Record<string, Record<string, string>>).error?.message || res.status}`;
        }

        const result = await res.json();
        return `Post opublikowany na stronie Facebook! ID: ${result.id}`;
      } catch (err) {
        logger.error("[FacebookTools] publish_page_post error:", err);
        return `Błąd publikacji: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    definition: {
      name: "get_page_insights",
      description:
        "Pobierz statystyki strony Facebook (zasięg, zaangażowanie).",
      input_schema: {
        type: "object" as const,
        properties: {
          page_id: { type: "string", description: "ID strony" },
          period: {
            type: "string",
            enum: ["day", "week", "days_28"],
            description: "Okres (domyślnie day)",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const pageInfo = await getPageToken(
        tenantId,
        input.page_id as string | undefined,
      );
      if (!pageInfo) return NO_FB;

      try {
        const period = (input.period as string) || "day";
        const res = await fetch(
          `${GRAPH_API}/${pageInfo.pageId}/insights?metric=page_impressions,page_engaged_users,page_post_engagements,page_fan_adds,page_views_total&period=${period}&access_token=${pageInfo.pageToken}`,
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return `Błąd: ${(err as Record<string, Record<string, string>>).error?.message || res.status}`;
        }

        const data = await res.json();
        const insights = data.data || [];

        if (!insights.length) return "Brak danych insights dla tej strony.";

        const lines = insights.map((metric: Record<string, unknown>) => {
          const values =
            (metric.values as Array<{
              value: number | Record<string, number>;
            }>) || [];
          const latest = values[values.length - 1];
          const val =
            typeof latest?.value === "number"
              ? latest.value
              : JSON.stringify(latest?.value);
          return `${metric.title}: ${val}`;
        });

        return `Insights strony (${period}):\n${lines.join("\n")}`;
      } catch (err) {
        logger.error("[FacebookTools] get_page_insights error:", err);
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
  },

  // 4B: Facebook Ads wrappers
  {
    definition: {
      name: "list_fb_ad_campaigns",
      description: "Pokaż kampanie reklamowe Facebook Ads.",
      input_schema: {
        type: "object" as const,
        properties: {
          account_id: {
            type: "string",
            description: "ID konta reklamowego (opcjonalnie)",
          },
          status: {
            type: "string",
            enum: ["ACTIVE", "PAUSED"],
            description: "Filtruj po statusie",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const token = await getFacebookToken(tenantId);
      if (!token) return NO_FB;

      try {
        const { FacebookAdsClient } =
          await import("@/lib/rigs/facebook/ads-client");
        const client = new FacebookAdsClient(token);

        let accountId = input.account_id as string | undefined;
        if (!accountId) {
          const accounts = await client.getAdAccounts();
          if (!accounts.length) return "Brak kont reklamowych Facebook.";
          accountId = accounts[0].account_id;
        }

        const campaigns = await client.getCampaigns(
          accountId,
          input.status as "ACTIVE" | "PAUSED" | undefined,
        );
        if (!campaigns.length) return "Brak kampanii.";

        const lines = campaigns.map(
          (c, i) =>
            `${i + 1}. **${c.name}** [${c.status}] | Cel: ${c.objective} | Budżet: ${c.daily_budget ? (parseInt(c.daily_budget) / 100).toFixed(2) + " PLN/dzień" : c.lifetime_budget ? (parseInt(c.lifetime_budget) / 100).toFixed(2) + " PLN total" : "?"} | ID: ${c.id}`,
        );
        return `Kampanie FB Ads:\n${lines.join("\n")}`;
      } catch (err) {
        logger.error("[FacebookTools] list_fb_ad_campaigns error:", err);
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    definition: {
      name: "get_fb_ad_performance",
      description:
        "Pobierz wyniki reklam Facebook (wyświetlenia, zasięg, kliknięcia, wydatki).",
      input_schema: {
        type: "object" as const,
        properties: {
          account_id: { type: "string", description: "ID konta reklamowego" },
          date_preset: {
            type: "string",
            enum: ["today", "yesterday", "last_7d", "last_30d", "this_month"],
            description: "Zakres dat (domyślnie last_7d)",
          },
          level: {
            type: "string",
            enum: ["account", "campaign", "adset", "ad"],
            description: "Poziom raportowania (domyślnie account)",
          },
        },
        required: ["account_id"],
      },
    },
    execute: async (input, tenantId) => {
      const token = await getFacebookToken(tenantId);
      if (!token) return NO_FB;

      try {
        const { FacebookAdsClient } =
          await import("@/lib/rigs/facebook/ads-client");
        const client = new FacebookAdsClient(token);
        const insights = await client.getAccountInsights(
          input.account_id as string,
          (input.date_preset as
            | "today"
            | "yesterday"
            | "last_7d"
            | "last_30d") || "last_7d",
          (input.level as "account" | "campaign" | "adset" | "ad") || "account",
        );

        if (!insights.length) return "Brak danych za wybrany okres.";

        const lines = insights.map((i) => {
          const spend = parseFloat(i.spend || "0").toFixed(2);
          return `${i.date_start} — ${i.date_stop}: Zasięg: ${i.reach} | Kliknięcia: ${i.clicks} | Wydatki: ${spend} PLN | CTR: ${i.ctr || "?"}%`;
        });

        return `FB Ads wyniki:\n${lines.join("\n")}`;
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    definition: {
      name: "create_fb_ad_campaign",
      description: "Utwórz nową kampanię Facebook Ads.",
      input_schema: {
        type: "object" as const,
        properties: {
          account_id: { type: "string", description: "ID konta reklamowego" },
          name: { type: "string", description: "Nazwa kampanii" },
          objective: {
            type: "string",
            description:
              "Cel kampanii (AWARENESS, TRAFFIC, ENGAGEMENT, LEADS, APP_PROMOTION, SALES)",
          },
          status: {
            type: "string",
            enum: ["ACTIVE", "PAUSED"],
            description: "Status (domyślnie PAUSED)",
          },
        },
        required: ["account_id", "name", "objective"],
      },
    },
    execute: async (input, tenantId) => {
      const token = await getFacebookToken(tenantId);
      if (!token) return NO_FB;

      try {
        const { FacebookAdsClient } =
          await import("@/lib/rigs/facebook/ads-client");
        const client = new FacebookAdsClient(token);
        const result = await client.createCampaign(
          input.account_id as string,
          input.name as string,
          input.objective as string,
          (input.status as "ACTIVE" | "PAUSED") || "PAUSED",
        );
        return `Kampania utworzona! ID: ${result.id}`;
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    definition: {
      name: "pause_fb_ad_campaign",
      description: "Wstrzymaj kampanię Facebook Ads.",
      input_schema: {
        type: "object" as const,
        properties: {
          campaign_id: { type: "string", description: "ID kampanii" },
        },
        required: ["campaign_id"],
      },
    },
    execute: async (input, tenantId) => {
      const token = await getFacebookToken(tenantId);
      if (!token) return NO_FB;

      try {
        const { FacebookAdsClient } =
          await import("@/lib/rigs/facebook/ads-client");
        const client = new FacebookAdsClient(token);
        await client.updateCampaignStatus(
          input.campaign_id as string,
          "PAUSED",
        );
        return "Kampania wstrzymana (PAUSED).";
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    definition: {
      name: "get_fb_ad_accounts",
      description: "Pokaż konta reklamowe Facebook Ads użytkownika.",
      input_schema: { type: "object" as const, properties: {} },
    },
    execute: async (_input, tenantId) => {
      const token = await getFacebookToken(tenantId);
      if (!token) return NO_FB;

      try {
        const { FacebookAdsClient } =
          await import("@/lib/rigs/facebook/ads-client");
        const client = new FacebookAdsClient(token);
        const accounts = await client.getAdAccounts();

        if (!accounts.length) return "Brak kont reklamowych.";

        const lines = accounts.map(
          (a, i) =>
            `${i + 1}. **${a.name}** | Status: ${a.account_status === 1 ? "Aktywne" : "Nieaktywne"} | Waluta: ${a.currency} | Wydano: ${(parseInt(a.amount_spent || "0") / 100).toFixed(2)} | ID: ${a.account_id}`,
        );
        return `Konta FB Ads:\n${lines.join("\n")}`;
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
  },

  // 4C: Instagram publishing
  {
    definition: {
      name: "publish_instagram_post",
      description:
        "Opublikuj zdjęcie na Instagramie (wymaga FB Page z połączonym IG Business).",
      input_schema: {
        type: "object" as const,
        properties: {
          image_url: {
            type: "string",
            description: "URL obrazu (publicznie dostępny)",
          },
          caption: { type: "string", description: "Opis posta" },
          page_id: {
            type: "string",
            description: "ID strony Facebook z połączonym IG",
          },
        },
        required: ["image_url", "caption"],
      },
    },
    execute: async (input, tenantId) => {
      const pageInfo = await getPageToken(
        tenantId,
        input.page_id as string | undefined,
      );
      if (!pageInfo?.igAccountId)
        return "Brak połączonego konta Instagram Business. Połącz IG z FB Page.";

      try {
        // Step 1: Create media container
        const createRes = await fetch(
          `${GRAPH_API}/${pageInfo.igAccountId}/media`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image_url: input.image_url,
              caption: input.caption,
              access_token: pageInfo.pageToken,
            }),
          },
        );

        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          return `Błąd tworzenia kontenera IG: ${(err as Record<string, Record<string, string>>).error?.message || createRes.status}`;
        }

        const { id: containerId } = await createRes.json();

        // Step 2: Publish
        const publishRes = await fetch(
          `${GRAPH_API}/${pageInfo.igAccountId}/media_publish`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              creation_id: containerId,
              access_token: pageInfo.pageToken,
            }),
          },
        );

        if (!publishRes.ok) {
          const err = await publishRes.json().catch(() => ({}));
          return `Błąd publikacji IG: ${(err as Record<string, Record<string, string>>).error?.message || publishRes.status}`;
        }

        const result = await publishRes.json();
        return `Post opublikowany na Instagramie! ID: ${result.id}`;
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
    timeoutMs: 30000,
  },
  {
    definition: {
      name: "publish_instagram_reel",
      description: "Opublikuj Reel na Instagramie.",
      input_schema: {
        type: "object" as const,
        properties: {
          video_url: {
            type: "string",
            description: "URL wideo (publicznie dostępny)",
          },
          caption: { type: "string", description: "Opis Reela" },
          page_id: {
            type: "string",
            description: "ID strony Facebook z połączonym IG",
          },
        },
        required: ["video_url", "caption"],
      },
    },
    execute: async (input, tenantId) => {
      const pageInfo = await getPageToken(
        tenantId,
        input.page_id as string | undefined,
      );
      if (!pageInfo?.igAccountId)
        return "Brak połączonego konta Instagram Business.";

      try {
        // Step 1: Create reel container
        const createRes = await fetch(
          `${GRAPH_API}/${pageInfo.igAccountId}/media`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              video_url: input.video_url,
              caption: input.caption,
              media_type: "REELS",
              access_token: pageInfo.pageToken,
            }),
          },
        );

        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          return `Błąd: ${(err as Record<string, Record<string, string>>).error?.message || createRes.status}`;
        }

        const { id: containerId } = await createRes.json();

        // Step 2: Publish (may need polling for video processing)
        const publishRes = await fetch(
          `${GRAPH_API}/${pageInfo.igAccountId}/media_publish`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              creation_id: containerId,
              access_token: pageInfo.pageToken,
            }),
          },
        );

        if (!publishRes.ok) {
          const err = await publishRes.json().catch(() => ({}));
          return `Błąd publikacji: ${(err as Record<string, Record<string, string>>).error?.message || publishRes.status}`;
        }

        const result = await publishRes.json();
        return `Reel opublikowany na Instagramie! ID: ${result.id}`;
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
    timeoutMs: 30000,
  },

  // 4D: Instagram DMs
  {
    definition: {
      name: "send_instagram_dm",
      description: "Wyślij wiadomość prywatną (DM) na Instagramie.",
      input_schema: {
        type: "object" as const,
        properties: {
          recipient_id: {
            type: "string",
            description: "Instagram-scoped ID odbiorcy",
          },
          message: { type: "string", description: "Treść wiadomości" },
          page_id: {
            type: "string",
            description: "ID strony Facebook z połączonym IG",
          },
        },
        required: ["recipient_id", "message"],
      },
    },
    execute: async (input, tenantId) => {
      const pageInfo = await getPageToken(
        tenantId,
        input.page_id as string | undefined,
      );
      if (!pageInfo?.igAccountId)
        return "Brak połączonego konta Instagram Business.";

      try {
        const res = await fetch(
          `${GRAPH_API}/${pageInfo.igAccountId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: input.recipient_id },
              message: { text: input.message },
              access_token: pageInfo.pageToken,
            }),
          },
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return `Błąd DM: ${(err as Record<string, Record<string, string>>).error?.message || res.status}`;
        }

        return `DM Instagram wysłany do ${input.recipient_id}.`;
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
];
