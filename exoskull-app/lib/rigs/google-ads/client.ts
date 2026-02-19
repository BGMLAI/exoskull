/**
 * Google Ads API Client
 *
 * Uses Google Ads API v18 REST. Auth: OAuth token from google rig + customer ID.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/rigs/oauth";
import { logger } from "@/lib/logger";

const ADS_API = "https://googleads.googleapis.com/v18";

const GOOGLE_SLUGS = ["google", "google-workspace"];

async function getValidToken(tenantId: string): Promise<string | null> {
  const supabase = getServiceSupabase();

  for (const slug of GOOGLE_SLUGS) {
    const { data: conn } = await supabase
      .from("exo_rig_connections")
      .select("id, rig_slug, access_token, refresh_token, expires_at")
      .eq("tenant_id", tenantId)
      .eq("rig_slug", slug)
      .maybeSingle();

    if (conn?.access_token) {
      try {
        return await ensureFreshToken(conn);
      } catch (err) {
        logger.error(`[GoogleAds] Token refresh failed for ${slug}:`, err);
        continue;
      }
    }
  }

  return null;
}

interface AdsQueryResponse {
  results?: Array<Record<string, unknown>>;
  fieldMask?: string;
}

async function adsQuery(
  token: string,
  customerId: string,
  query: string,
): Promise<{ ok: boolean; data?: AdsQueryResponse; error?: string }> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken)
    return { ok: false, error: "Brak GOOGLE_ADS_DEVELOPER_TOKEN." };

  try {
    const res = await fetch(
      `${ADS_API}/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": devToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Google Ads API ${res.status}: ${errText}` };
    }

    const data = await res.json();
    // searchStream returns array of batches
    const results = Array.isArray(data)
      ? data.flatMap((batch: AdsQueryResponse) => batch.results || [])
      : data.results || [];

    return { ok: true, data: { results } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

async function adsMutate(
  token: string,
  customerId: string,
  operations: Array<Record<string, unknown>>,
  resourceType: string,
): Promise<{ ok: boolean; error?: string }> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken)
    return { ok: false, error: "Brak GOOGLE_ADS_DEVELOPER_TOKEN." };

  try {
    const res = await fetch(
      `${ADS_API}/customers/${customerId}/${resourceType}:mutate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": devToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ operations }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return {
        ok: false,
        error: `Google Ads mutate ${res.status}: ${errText}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

export async function getCustomerId(tenantId: string): Promise<string | null> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("exo_rig_connections")
    .select("metadata")
    .eq("tenant_id", tenantId)
    .in("rig_slug", GOOGLE_SLUGS)
    .not("metadata->google_ads_customer_id", "is", null)
    .maybeSingle();

  return (
    (data?.metadata as Record<string, string>)?.google_ads_customer_id || null
  );
}

export async function listAdCampaigns(
  tenantId: string,
  status?: string,
): Promise<{ ok: boolean; formatted?: string; error?: string }> {
  const token = await getValidToken(tenantId);
  if (!token)
    return { ok: false, error: "Brak połączenia Google. Połącz konto Google." };

  const customerId = await getCustomerId(tenantId);
  if (!customerId)
    return {
      ok: false,
      error: "Brak Google Ads customer ID. Skonfiguruj w ustawieniach.",
    };

  let query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
    campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.cost_micros
    FROM campaign`;

  if (status && status !== "ALL") {
    query += ` WHERE campaign.status = '${status}'`;
  }
  query += " ORDER BY metrics.cost_micros DESC LIMIT 25";

  const result = await adsQuery(token, customerId, query);
  if (!result.ok) return { ok: false, error: result.error };

  const campaigns = result.data?.results || [];
  if (!campaigns.length)
    return { ok: true, formatted: "Brak kampanii Google Ads." };

  const lines = campaigns.map((c: Record<string, unknown>, i: number) => {
    const camp = c.campaign as Record<string, string>;
    const metrics = c.metrics as Record<string, string>;
    const budget = c.campaignBudget as Record<string, string> | undefined;
    const spend = metrics?.costMicros
      ? (parseInt(metrics.costMicros) / 1e6).toFixed(2)
      : "0";
    const budgetAmt = budget?.amountMicros
      ? (parseInt(budget.amountMicros) / 1e6).toFixed(2)
      : "?";
    return `${i + 1}. **${camp.name}** [${camp.status}] | Budżet: ${budgetAmt} PLN | Wydano: ${spend} PLN | Wyświetlenia: ${metrics?.impressions || 0} | Kliknięcia: ${metrics?.clicks || 0} | ID: ${camp.id}`;
  });

  return { ok: true, formatted: `Kampanie Google Ads:\n${lines.join("\n")}` };
}

export async function getAdPerformance(
  tenantId: string,
  campaignId: string,
  dateRange: string = "LAST_7_DAYS",
): Promise<{ ok: boolean; formatted?: string; error?: string }> {
  const token = await getValidToken(tenantId);
  if (!token) return { ok: false, error: "Brak połączenia Google." };

  const customerId = await getCustomerId(tenantId);
  if (!customerId) return { ok: false, error: "Brak Google Ads customer ID." };

  const query = `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros,
    metrics.conversions, metrics.ctr, metrics.average_cpc
    FROM campaign WHERE campaign.id = ${campaignId}
    AND segments.date DURING ${dateRange}
    ORDER BY segments.date`;

  const result = await adsQuery(token, customerId, query);
  if (!result.ok) return { ok: false, error: result.error };

  const rows = result.data?.results || [];
  if (!rows.length)
    return { ok: true, formatted: "Brak danych za wybrany okres." };

  const lines = rows.map((r: Record<string, unknown>) => {
    const seg = r.segments as Record<string, string>;
    const m = r.metrics as Record<string, string>;
    const spend = m?.costMicros
      ? (parseInt(m.costMicros) / 1e6).toFixed(2)
      : "0";
    return `  ${seg?.date}: ${m?.impressions || 0} wyśw. | ${m?.clicks || 0} klik. | ${spend} PLN | CTR: ${m?.ctr || "0"}%`;
  });

  return {
    ok: true,
    formatted: `Wyniki kampanii ${campaignId}:\n${lines.join("\n")}`,
  };
}

export async function pauseAdCampaign(
  tenantId: string,
  campaignId: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = await getValidToken(tenantId);
  if (!token) return { ok: false, error: "Brak połączenia Google." };

  const customerId = await getCustomerId(tenantId);
  if (!customerId) return { ok: false, error: "Brak Google Ads customer ID." };

  return adsMutate(
    token,
    customerId,
    [
      {
        update: {
          resourceName: `customers/${customerId}/campaigns/${campaignId}`,
          status: "PAUSED",
        },
        updateMask: "status",
      },
    ],
    "campaigns",
  );
}

export async function enableAdCampaign(
  tenantId: string,
  campaignId: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = await getValidToken(tenantId);
  if (!token) return { ok: false, error: "Brak połączenia Google." };

  const customerId = await getCustomerId(tenantId);
  if (!customerId) return { ok: false, error: "Brak Google Ads customer ID." };

  return adsMutate(
    token,
    customerId,
    [
      {
        update: {
          resourceName: `customers/${customerId}/campaigns/${campaignId}`,
          status: "ENABLED",
        },
        updateMask: "status",
      },
    ],
    "campaigns",
  );
}

export async function getAdAccountSummary(
  tenantId: string,
): Promise<{ ok: boolean; formatted?: string; error?: string }> {
  const token = await getValidToken(tenantId);
  if (!token) return { ok: false, error: "Brak połączenia Google." };

  const customerId = await getCustomerId(tenantId);
  if (!customerId) return { ok: false, error: "Brak Google Ads customer ID." };

  const query = `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros,
    metrics.conversions, metrics.ctr, metrics.average_cpc
    FROM customer WHERE segments.date DURING LAST_30_DAYS`;

  const result = await adsQuery(token, customerId, query);
  if (!result.ok) return { ok: false, error: result.error };

  const rows = result.data?.results || [];
  if (!rows.length)
    return {
      ok: true,
      formatted: "Brak danych Google Ads za ostatnie 30 dni.",
    };

  const m = rows[0].metrics as Record<string, string>;
  const spend = m?.costMicros ? (parseInt(m.costMicros) / 1e6).toFixed(2) : "0";
  const cpc = m?.averageCpc ? (parseInt(m.averageCpc) / 1e6).toFixed(2) : "0";

  const formatted = [
    "**Podsumowanie Google Ads (ostatnie 30 dni):**",
    `Wydatki: ${spend} PLN`,
    `Wyświetlenia: ${m?.impressions || 0}`,
    `Kliknięcia: ${m?.clicks || 0}`,
    `CTR: ${m?.ctr || 0}%`,
    `Średni CPC: ${cpc} PLN`,
    `Konwersje: ${m?.conversions || 0}`,
  ].join("\n");

  return { ok: true, formatted };
}
