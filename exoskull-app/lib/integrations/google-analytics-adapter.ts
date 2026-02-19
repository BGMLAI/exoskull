/**
 * Google Analytics GA4 Adapter
 *
 * Uses Analytics Data API v1beta for reports and Admin API for property listing.
 * Auth: OAuth token from google rig.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/rigs/oauth";
import { logger } from "@/lib/logger";

const ANALYTICS_DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const ANALYTICS_ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";

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
        logger.error(
          `[GoogleAnalytics] Token refresh failed for ${slug}:`,
          err,
        );
        continue;
      }
    }
  }

  return null;
}

async function analyticsApiFetch<T>(
  token: string,
  url: string,
  options?: RequestInit,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Analytics API ${res.status}: ${errText}` };
    }

    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

export async function listAnalyticsProperties(
  tenantId: string,
): Promise<{ ok: boolean; formatted?: string; error?: string }> {
  const token = await getValidToken(tenantId);
  if (!token)
    return { ok: false, error: "Brak połączenia Google. Połącz konto Google." };

  const result = await analyticsApiFetch<{
    accountSummaries?: Array<{
      account: string;
      displayName: string;
      propertySummaries?: Array<{
        property: string;
        displayName: string;
        propertyType: string;
      }>;
    }>;
  }>(token, `${ANALYTICS_ADMIN_API}/accountSummaries`);

  if (!result.ok) return { ok: false, error: result.error };

  const summaries = result.data?.accountSummaries || [];
  if (!summaries.length)
    return { ok: true, formatted: "Brak kont Google Analytics." };

  const lines: string[] = [];
  for (const account of summaries) {
    lines.push(`**${account.displayName}**`);
    for (const prop of account.propertySummaries || []) {
      const propertyId = prop.property.replace("properties/", "");
      lines.push(
        `  - ${prop.displayName} (${prop.propertyType}) | Property ID: ${propertyId}`,
      );
    }
  }

  return {
    ok: true,
    formatted: `Konta Google Analytics:\n${lines.join("\n")}`,
  };
}

export async function getAnalyticsReport(
  tenantId: string,
  propertyId: string,
  metrics: string[],
  dimensions: string[],
  dateRange: { startDate: string; endDate: string },
): Promise<{ ok: boolean; formatted?: string; error?: string }> {
  const token = await getValidToken(tenantId);
  if (!token) return { ok: false, error: "Brak połączenia Google." };

  const result = await analyticsApiFetch<{
    rows?: Array<{
      dimensionValues: Array<{ value: string }>;
      metricValues: Array<{ value: string }>;
    }>;
    totals?: Array<{ metricValues: Array<{ value: string }> }>;
  }>(token, `${ANALYTICS_DATA_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    body: JSON.stringify({
      dateRanges: [dateRange],
      metrics: metrics.map((m) => ({ name: m })),
      dimensions: dimensions.map((d) => ({ name: d })),
      limit: 25,
    }),
  });

  if (!result.ok) return { ok: false, error: result.error };

  const rows = result.data?.rows || [];
  if (!rows.length)
    return { ok: true, formatted: "Brak danych za wybrany okres." };

  // Format as table
  const header = [...dimensions, ...metrics].join(" | ");
  const separator = "-".repeat(header.length);
  const dataLines = rows.map((r) => {
    const dimVals = r.dimensionValues.map((v) => v.value);
    const metVals = r.metricValues.map((v) => {
      const num = parseFloat(v.value);
      return isNaN(num) ? v.value : num.toLocaleString("pl-PL");
    });
    return [...dimVals, ...metVals].join(" | ");
  });

  // Totals
  const totals = result.data?.totals?.[0]?.metricValues;
  let totalsLine = "";
  if (totals) {
    totalsLine = `\nSuma: ${metrics.map((m, i) => `${m}: ${parseFloat(totals[i]?.value || "0").toLocaleString("pl-PL")}`).join(", ")}`;
  }

  return {
    ok: true,
    formatted: `Analytics (${dateRange.startDate} — ${dateRange.endDate}):\n${header}\n${separator}\n${dataLines.join("\n")}${totalsLine}`,
  };
}

export async function getAnalyticsRealtime(
  tenantId: string,
  propertyId: string,
): Promise<{ ok: boolean; formatted?: string; error?: string }> {
  const token = await getValidToken(tenantId);
  if (!token) return { ok: false, error: "Brak połączenia Google." };

  const result = await analyticsApiFetch<{
    rows?: Array<{
      dimensionValues: Array<{ value: string }>;
      metricValues: Array<{ value: string }>;
    }>;
  }>(
    token,
    `${ANALYTICS_DATA_API}/properties/${propertyId}:runRealtimeReport`,
    {
      method: "POST",
      body: JSON.stringify({
        metrics: [{ name: "activeUsers" }],
        dimensions: [{ name: "country" }],
        limit: 10,
      }),
    },
  );

  if (!result.ok) return { ok: false, error: result.error };

  const rows = result.data?.rows || [];
  const totalUsers = rows.reduce(
    (sum, r) => sum + parseInt(r.metricValues[0]?.value || "0"),
    0,
  );

  if (!totalUsers) {
    return { ok: true, formatted: "Aktualnie 0 aktywnych użytkowników." };
  }

  const countryLines = rows
    .slice(0, 10)
    .map(
      (r) =>
        `  ${r.dimensionValues[0].value}: ${r.metricValues[0].value} użytkowników`,
    );

  return {
    ok: true,
    formatted: `**Realtime:** ${totalUsers} aktywnych użytkowników\nKraje:\n${countryLines.join("\n")}`,
  };
}
