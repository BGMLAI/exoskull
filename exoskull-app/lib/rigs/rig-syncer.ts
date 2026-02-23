/**
 * Universal Rig Sync Dispatcher
 *
 * Shared sync logic used by both CRON (rig-sync) and manual sync (POST /api/rigs/[slug]/sync).
 * Each rig_slug delegates to its client's getDashboardData() + upserts to exo_health_metrics.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { RigConnection } from "./types";
import { createNotionClient } from "./notion/client";
import { createTodoistClient } from "./todoist/client";
import { createGoogleWorkspaceClient } from "./google-workspace/client";
import { createMicrosoft365Client } from "./microsoft-365/client";
import { createGoogleClient } from "./google/client";
import { createFacebookClient } from "./facebook/client";
import { createFacebookAdsClient } from "./facebook/ads-client";
import { createFacebookCommerceClient } from "./facebook/commerce-client";
import { OuraClient } from "./oura/client";
import type { OuraSleepPeriod, OuraDailyActivity } from "./oura/client";
import { ingestGmailMessages, ingestOutlookMessages } from "./email-ingest";
import { logger } from "@/lib/logger";

// ── Rigs that CRON auto-syncs ──
export const CRON_SYNCABLE_SLUGS = new Set([
  "google",
  "google-workspace",
  "oura",
  "notion",
  "todoist",
  "microsoft-365",
  "facebook",
]);

export interface SyncResult {
  success: boolean;
  records: number;
  error?: string;
  data?: unknown;
}

interface HealthMetricInsert {
  tenant_id: string;
  metric_type: string;
  value: number;
  unit: string;
  recorded_at: string;
  source: string;
  metadata?: Record<string, unknown>;
}

/**
 * Sync a single rig connection. Dispatches to the correct client based on rig_slug.
 * Returns structured result with records count + optional data payload.
 */
export async function syncRig(
  connection: RigConnection,
  supabase: SupabaseClient,
): Promise<SyncResult> {
  const slug = connection.rig_slug;
  const tenantId = connection.tenant_id;

  switch (slug) {
    case "notion": {
      const client = createNotionClient(connection);
      if (!client) throw new Error("Failed to create Notion client");
      const dashboard = await client.getDashboardData();
      return {
        success: true,
        records: dashboard.recentPages.length,
        data: { user: dashboard.user?.name, totalPages: dashboard.totalPages },
      };
    }

    case "todoist": {
      const client = createTodoistClient(connection);
      if (!client) throw new Error("Failed to create Todoist client");
      const dashboard = await client.getDashboardData();
      return {
        success: true,
        records: dashboard.summary.totalTasks,
        data: dashboard.summary,
      };
    }

    case "google-workspace": {
      const client = createGoogleWorkspaceClient(connection);
      if (!client) throw new Error("Failed to create Google Workspace client");
      const dashboard = await client.getDashboardData();
      const userEmail = dashboard.gmail.recentEmails[0]?.to || "";
      const emailResult = await ingestGmailMessages(
        tenantId,
        dashboard.gmail.recentEmails,
        userEmail,
      );
      return {
        success: true,
        records:
          dashboard.gmail.recentEmails.length +
          dashboard.calendar.todaysEvents.length +
          dashboard.drive.recentFiles.length,
        data: {
          unreadEmails: dashboard.gmail.unreadCount,
          todaysEvents: dashboard.calendar.todaysEvents.length,
          recentFiles: dashboard.drive.recentFiles.length,
          emails_ingested: emailResult.ingested,
          emails_skipped: emailResult.skipped,
        },
      };
    }

    case "microsoft-365": {
      const client = createMicrosoft365Client(connection);
      if (!client) throw new Error("Failed to create Microsoft 365 client");
      const dashboard = await client.getDashboardData();
      const userEmail = dashboard.profile?.mail || "";
      const emailResult = await ingestOutlookMessages(
        tenantId,
        dashboard.outlook.recentEmails,
        userEmail,
      );
      return {
        success: true,
        records:
          dashboard.outlook.recentEmails.length +
          dashboard.calendar.todaysEvents.length +
          dashboard.onedrive.recentFiles.length,
        data: {
          unreadEmails: dashboard.outlook.unreadCount,
          todaysEvents: dashboard.calendar.todaysEvents.length,
          recentFiles: dashboard.onedrive.recentFiles.length,
          emails_ingested: emailResult.ingested,
          emails_skipped: emailResult.skipped,
        },
      };
    }

    case "oura": {
      if (!connection.access_token)
        throw new Error("Missing Oura access token");
      const client = new OuraClient(connection.access_token);
      const days = 7;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startStr = startDate.toISOString().split("T")[0];
      const endStr = endDate.toISOString().split("T")[0];

      const [sleepPeriods, dailyActivity] = await Promise.all([
        client.getSleepPeriods(startStr, endStr),
        client.getDailyActivity(startStr, endStr),
      ]);

      const metrics = buildMetricsFromOura({
        tenantId,
        sleepPeriods: sleepPeriods.data || [],
        dailyActivity: dailyActivity.data || [],
        source: "oura",
      });

      if (metrics.length > 0) {
        const { error: upsertErr } = await supabase
          .from("exo_health_metrics")
          .upsert(metrics, {
            onConflict: "tenant_id,metric_type,recorded_at,source",
            ignoreDuplicates: true,
          });
        if (upsertErr) {
          logger.warn(
            "[RigSyncer] Oura metrics upsert error:",
            upsertErr.message,
          );
        }
      }

      return {
        success: true,
        records: metrics.length,
        data: { days, metrics: summarizeMetrics(metrics) },
      };
    }

    case "google": {
      const client = createGoogleClient(connection);
      if (!client) throw new Error("Failed to create Google client");
      const dashboard = await client.getDashboardData();

      const healthMetrics = buildGoogleDashboardMetrics(
        tenantId,
        dashboard.fit,
        "google",
      );
      if (healthMetrics.length > 0) {
        const { error: upsertErr } = await supabase
          .from("exo_health_metrics")
          .upsert(healthMetrics, {
            onConflict: "tenant_id,metric_type,recorded_at,source",
            ignoreDuplicates: true,
          });
        if (upsertErr) {
          logger.warn(
            "[RigSyncer] Google metrics upsert error:",
            upsertErr.message,
          );
        }
      }

      const userEmail = dashboard.workspace.gmail.recentEmails[0]?.to || "";
      const emailResult = await ingestGmailMessages(
        tenantId,
        dashboard.workspace.gmail.recentEmails,
        userEmail,
      );

      return {
        success: true,
        records:
          dashboard.fit.steps.length +
          dashboard.fit.heartRate.length +
          dashboard.workspace.gmail.recentEmails.length +
          dashboard.workspace.calendar.todaysEvents.length +
          dashboard.workspace.tasks.activeTasks.length +
          dashboard.youtube.recentVideos.length +
          dashboard.contacts.recentContacts.length +
          dashboard.photos.recentPhotos.length,
        data: {
          fit: {
            todaySteps: dashboard.fit.todaySteps,
            todayCalories: dashboard.fit.todayCalories,
            avgHeartRate: dashboard.fit.avgHeartRate,
          },
          workspace: {
            unreadEmails: dashboard.workspace.gmail.unreadCount,
            todaysEvents: dashboard.workspace.calendar.todaysEvents.length,
            activeTasks: dashboard.workspace.tasks.activeCount,
            overdueTasks: dashboard.workspace.tasks.overdueCount,
          },
          youtube: {
            channelName: dashboard.youtube.channel?.title || null,
            recentVideos: dashboard.youtube.recentVideos.length,
          },
          contacts: { total: dashboard.contacts.totalCount },
          photos: { recent: dashboard.photos.recentPhotos.length },
          metrics_upserted: healthMetrics.length,
          emails_ingested: emailResult.ingested,
          emails_skipped: emailResult.skipped,
        },
      };
    }

    case "facebook": {
      const fbClient = createFacebookClient(connection);
      if (!fbClient) throw new Error("Failed to create Facebook client");
      const fbDashboard = await fbClient.getDashboardData();

      let adsData: {
        totalSpend: number;
        activeCampaigns: number;
        totalImpressions: number;
      } | null = null;
      let commerceData: {
        catalogs: number;
        totalProducts: number;
        recentOrders: number;
      } | null = null;

      try {
        const adsClient = createFacebookAdsClient(connection.access_token!);
        const adsDashboard = await adsClient.getDashboardData();
        adsData = {
          totalSpend: adsDashboard.totalSpend,
          activeCampaigns: adsDashboard.activeCampaigns.length,
          totalImpressions: adsDashboard.totalImpressions,
        };
      } catch {
        // Ads API may not be available
      }

      try {
        const commerceClient = createFacebookCommerceClient(
          connection.access_token!,
        );
        const commerceDashboard = await commerceClient.getDashboardData();
        commerceData = {
          catalogs: commerceDashboard.catalogs.length,
          totalProducts: commerceDashboard.totalProducts,
          recentOrders: commerceDashboard.recentOrders.length,
        };
      } catch {
        // Commerce API may not be available
      }

      return {
        success: true,
        records:
          (fbDashboard.profile ? 1 : 0) +
          fbDashboard.posts.length +
          fbDashboard.photos.length +
          fbDashboard.friends.list.length +
          fbDashboard.pages.length +
          fbDashboard.groups.length +
          fbDashboard.events.length +
          fbDashboard.videos.length +
          (fbDashboard.instagram.profile ? 1 : 0) +
          fbDashboard.instagram.recentMedia.length,
        data: {
          profile: fbDashboard.profile
            ? { name: fbDashboard.profile.name, id: fbDashboard.profile.id }
            : null,
          posts: fbDashboard.posts.length,
          photos: fbDashboard.photos.length,
          friends: fbDashboard.friends.totalCount,
          pages: fbDashboard.pages.length,
          groups: fbDashboard.groups.length,
          events: fbDashboard.events.length,
          videos: fbDashboard.videos.length,
          instagram: {
            username: fbDashboard.instagram.profile?.username || null,
            followers: fbDashboard.instagram.profile?.followers_count || 0,
            recentMedia: fbDashboard.instagram.recentMedia.length,
          },
          ads: adsData,
          commerce: commerceData,
        },
      };
    }

    default:
      return {
        success: false,
        records: 0,
        error: `Sync not implemented for ${slug}`,
      };
  }
}

// ── Metric builders ──

function toRecordedAt(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toISOString();
}

export function buildMetricsFromOura(params: {
  tenantId: string;
  sleepPeriods: OuraSleepPeriod[];
  dailyActivity: OuraDailyActivity[];
  source: string;
}): HealthMetricInsert[] {
  const sleepByDay = new Map<
    string,
    {
      totalSleepSeconds: number;
      longestSleepSeconds: number;
      hrv: number | null;
      heartRate: number | null;
    }
  >();

  for (const period of params.sleepPeriods) {
    if (period.type !== "sleep" && period.type !== "long_sleep") continue;
    const existing = sleepByDay.get(period.day) || {
      totalSleepSeconds: 0,
      longestSleepSeconds: 0,
      hrv: null,
      heartRate: null,
    };
    existing.totalSleepSeconds += period.total_sleep_duration;
    if (period.total_sleep_duration >= existing.longestSleepSeconds) {
      existing.longestSleepSeconds = period.total_sleep_duration;
      existing.hrv = period.average_hrv ?? null;
      existing.heartRate = period.average_heart_rate ?? null;
    }
    sleepByDay.set(period.day, existing);
  }

  const activityByDay = new Map<string, { steps: number; calories: number }>();
  for (const activity of params.dailyActivity) {
    activityByDay.set(activity.day, {
      steps: activity.steps || 0,
      calories: activity.active_calories || 0,
    });
  }

  const allDays = new Set([...sleepByDay.keys(), ...activityByDay.keys()]);
  const metrics: HealthMetricInsert[] = [];

  for (const day of allDays) {
    const recordedAt = toRecordedAt(day);
    const sleep = sleepByDay.get(day);

    if (sleep && sleep.totalSleepSeconds > 0) {
      metrics.push({
        tenant_id: params.tenantId,
        metric_type: "sleep",
        value: Math.round(sleep.totalSleepSeconds / 60),
        unit: "minutes",
        recorded_at: recordedAt,
        source: params.source,
      });
    }
    if (sleep?.hrv !== null && sleep?.hrv !== undefined) {
      metrics.push({
        tenant_id: params.tenantId,
        metric_type: "hrv",
        value: Math.round(sleep.hrv),
        unit: "ms",
        recorded_at: recordedAt,
        source: params.source,
      });
    }
    if (sleep?.heartRate !== null && sleep?.heartRate !== undefined) {
      metrics.push({
        tenant_id: params.tenantId,
        metric_type: "heart_rate",
        value: Math.round(sleep.heartRate),
        unit: "bpm",
        recorded_at: recordedAt,
        source: params.source,
      });
    }

    const activity = activityByDay.get(day);
    if (activity?.steps && activity.steps > 0) {
      metrics.push({
        tenant_id: params.tenantId,
        metric_type: "steps",
        value: activity.steps,
        unit: "count",
        recorded_at: recordedAt,
        source: params.source,
      });
    }
    if (activity?.calories && activity.calories > 0) {
      metrics.push({
        tenant_id: params.tenantId,
        metric_type: "calories",
        value: activity.calories,
        unit: "kcal",
        recorded_at: recordedAt,
        source: params.source,
      });
    }
  }

  return metrics;
}

function buildGoogleDashboardMetrics(
  tenantId: string,
  fit: {
    steps: { date: string; steps: number }[];
    heartRate: { date: string; bpm: number }[];
    calories: { date: string; calories: number }[];
    sleep: { date: string; durationMinutes: number }[];
  },
  source: string,
): HealthMetricInsert[] {
  const metrics: HealthMetricInsert[] = [];

  for (const item of fit.steps) {
    if (item.steps > 0) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: "steps",
        value: item.steps,
        unit: "count",
        recorded_at: toRecordedAt(item.date),
        source,
      });
    }
  }
  for (const item of fit.heartRate) {
    if (item.bpm > 0) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: "heart_rate",
        value: item.bpm,
        unit: "bpm",
        recorded_at: toRecordedAt(item.date),
        source,
      });
    }
  }
  for (const item of fit.calories) {
    if (item.calories > 0) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: "calories",
        value: item.calories,
        unit: "kcal",
        recorded_at: toRecordedAt(item.date),
        source,
      });
    }
  }
  for (const item of fit.sleep) {
    if (item.durationMinutes > 0) {
      metrics.push({
        tenant_id: tenantId,
        metric_type: "sleep",
        value: item.durationMinutes,
        unit: "minutes",
        recorded_at: toRecordedAt(item.date),
        source,
      });
    }
  }

  return metrics;
}

function summarizeMetrics(
  metrics: HealthMetricInsert[],
): Record<string, number> {
  return metrics.reduce<Record<string, number>>((acc, m) => {
    acc[m.metric_type] = (acc[m.metric_type] || 0) + 1;
    return acc;
  }, {});
}
