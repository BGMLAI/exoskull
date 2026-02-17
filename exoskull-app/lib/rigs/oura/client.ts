// =====================================================
// OURA RING CLIENT (Sleep, Activity, Readiness, HRV)
// API v2: https://cloud.ouraring.com/v2/docs
// =====================================================

import { RigConnection, RigSyncResult } from "../types";
import type {
  OuraDailyActivity,
  OuraDailyReadiness,
  OuraDailySleep,
  OuraDashboardData,
  OuraHeartRate,
  OuraPersonalInfo,
  OuraSleepPeriod,
  OuraTag,
  OuraWorkout,
} from "./types";

import { logger } from "@/lib/logger";
export type {
  OuraDailyActivity,
  OuraDailyReadiness,
  OuraDailySleep,
  OuraDashboardData,
  OuraHeartRate,
  OuraPersonalInfo,
  OuraReadinessContributors,
  OuraSleepPeriod,
  OuraTag,
  OuraTimeSeries,
  OuraWorkout,
} from "./types";

const OURA_API = "https://api.ouraring.com/v2";

// =====================================================
// TYPES (imported from ./types)
// =====================================================

// =====================================================
// CLIENT
// =====================================================

export class OuraClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${OURA_API}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error("[OuraClient] API error:", {
        status: response.status,
        endpoint,
        error,
      });
      throw new Error(`Oura API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // =====================================================
  // PERSONAL INFO
  // =====================================================

  async getPersonalInfo(): Promise<OuraPersonalInfo> {
    return this.fetch("/usercollection/personal_info");
  }

  // =====================================================
  // SLEEP
  // =====================================================

  async getSleepPeriods(
    startDate: string,
    endDate: string,
  ): Promise<{ data: OuraSleepPeriod[] }> {
    return this.fetch(
      `/usercollection/sleep?start_date=${startDate}&end_date=${endDate}`,
    );
  }

  async getDailySleep(
    startDate: string,
    endDate: string,
  ): Promise<{ data: OuraDailySleep[] }> {
    return this.fetch(
      `/usercollection/daily_sleep?start_date=${startDate}&end_date=${endDate}`,
    );
  }

  async getLastNightSleep(): Promise<OuraSleepPeriod | null> {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const response = await this.getSleepPeriods(
      yesterday.toISOString().split("T")[0],
      today.toISOString().split("T")[0],
    );

    // Get the most recent sleep period
    const sleepPeriods = response.data.filter(
      (s) => s.type === "long_sleep" || s.type === "sleep",
    );
    return sleepPeriods.length > 0
      ? sleepPeriods[sleepPeriods.length - 1]
      : null;
  }

  // =====================================================
  // ACTIVITY
  // =====================================================

  async getDailyActivity(
    startDate: string,
    endDate: string,
  ): Promise<{ data: OuraDailyActivity[] }> {
    return this.fetch(
      `/usercollection/daily_activity?start_date=${startDate}&end_date=${endDate}`,
    );
  }

  async getTodayActivity(): Promise<OuraDailyActivity | null> {
    const today = new Date().toISOString().split("T")[0];
    const response = await this.getDailyActivity(today, today);
    return response.data.length > 0 ? response.data[0] : null;
  }

  // =====================================================
  // READINESS
  // =====================================================

  async getDailyReadiness(
    startDate: string,
    endDate: string,
  ): Promise<{ data: OuraDailyReadiness[] }> {
    return this.fetch(
      `/usercollection/daily_readiness?start_date=${startDate}&end_date=${endDate}`,
    );
  }

  async getTodayReadiness(): Promise<OuraDailyReadiness | null> {
    const today = new Date().toISOString().split("T")[0];
    const response = await this.getDailyReadiness(today, today);
    return response.data.length > 0 ? response.data[0] : null;
  }

  // =====================================================
  // HEART RATE
  // =====================================================

  async getHeartRate(
    startDateTime: string,
    endDateTime: string,
  ): Promise<{ data: OuraHeartRate[] }> {
    return this.fetch(
      `/usercollection/heartrate?start_datetime=${startDateTime}&end_datetime=${endDateTime}`,
    );
  }

  async getRestingHeartRate(): Promise<number | null> {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const response = await this.getHeartRate(
      yesterday.toISOString(),
      today.toISOString(),
    );

    // Get average resting heart rate
    const restingHR = response.data.filter(
      (hr) => hr.source === "rest" || hr.source === "sleep",
    );
    if (restingHR.length === 0) return null;

    const avg =
      restingHR.reduce((sum, hr) => sum + hr.bpm, 0) / restingHR.length;
    return Math.round(avg);
  }

  // =====================================================
  // WORKOUTS
  // =====================================================

  async getWorkouts(
    startDate: string,
    endDate: string,
  ): Promise<{ data: OuraWorkout[] }> {
    return this.fetch(
      `/usercollection/workout?start_date=${startDate}&end_date=${endDate}`,
    );
  }

  // =====================================================
  // TAGS
  // =====================================================

  async getTags(
    startDate: string,
    endDate: string,
  ): Promise<{ data: OuraTag[] }> {
    return this.fetch(
      `/usercollection/tag?start_date=${startDate}&end_date=${endDate}`,
    );
  }

  // =====================================================
  // DASHBOARD DATA (Comprehensive)
  // =====================================================

  async getDashboardData(days: number = 7): Promise<OuraDashboardData> {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);

    const startStr = startDate.toISOString().split("T")[0];
    const endStr = today.toISOString().split("T")[0];

    const [
      personalInfo,
      dailySleep,
      dailyActivity,
      dailyReadiness,
      heartRate,
      workouts,
    ] = await Promise.all([
      this.getPersonalInfo().catch(() => null),
      this.getDailySleep(startStr, endStr).catch(() => ({ data: [] })),
      this.getDailyActivity(startStr, endStr).catch(() => ({ data: [] })),
      this.getDailyReadiness(startStr, endStr).catch(() => ({ data: [] })),
      this.getHeartRate(startDate.toISOString(), today.toISOString()).catch(
        () => ({ data: [] }),
      ),
      this.getWorkouts(startStr, endStr).catch(() => ({ data: [] })),
    ]);

    // Get last night's sleep details
    const lastNight = await this.getLastNightSleep().catch(() => null);

    // Calculate today's values
    const todayStr = today.toISOString().split("T")[0];
    const todaySleep = dailySleep.data.find((s) => s.day === todayStr);
    const todayActivity = dailyActivity.data.find((a) => a.day === todayStr);
    const todayReadiness = dailyReadiness.data.find((r) => r.day === todayStr);

    // Calculate weekly sleep average
    const weeklyAverage =
      dailySleep.data.length > 0
        ? Math.round(
            dailySleep.data.reduce((sum, s) => sum + s.score, 0) /
              dailySleep.data.length,
          )
        : 0;

    // Get latest HRV from last night's sleep
    const latestHRV = lastNight?.average_hrv ?? null;

    // Get resting heart rate
    const restingHR = lastNight?.average_heart_rate ?? null;

    return {
      personalInfo,
      sleep: {
        todayScore: todaySleep?.score ?? null,
        lastNight,
        weeklyAverage,
        recentSleep: dailySleep.data.slice(-7),
      },
      activity: {
        todayScore: todayActivity?.score ?? null,
        todaySteps: todayActivity?.steps ?? 0,
        todayCalories: todayActivity?.active_calories ?? 0,
        recentActivity: dailyActivity.data.slice(-7),
      },
      readiness: {
        todayScore: todayReadiness?.score ?? null,
        recentReadiness: dailyReadiness.data.slice(-7),
      },
      heartRate: {
        restingHR,
        latestHRV,
        recentHeartRate: heartRate.data.slice(-100), // Last 100 measurements
      },
      workouts: workouts.data.slice(-10),
    };
  }

  // =====================================================
  // SUMMARY (for voice assistant / quick glance)
  // =====================================================

  async getQuickSummary(): Promise<{
    sleepScore: number | null;
    sleepDuration: string | null;
    readinessScore: number | null;
    activityScore: number | null;
    steps: number;
    restingHR: number | null;
    hrv: number | null;
  }> {
    const lastNight = await this.getLastNightSleep();
    const todayReadiness = await this.getTodayReadiness();
    const todayActivity = await this.getTodayActivity();

    // Convert sleep duration to human readable
    let sleepDuration: string | null = null;
    if (lastNight) {
      const hours = Math.floor(lastNight.total_sleep_duration / 3600);
      const minutes = Math.floor((lastNight.total_sleep_duration % 3600) / 60);
      sleepDuration = `${hours}h ${minutes}m`;
    }

    return {
      sleepScore: lastNight?.efficiency ?? null,
      sleepDuration,
      readinessScore: todayReadiness?.score ?? null,
      activityScore: todayActivity?.score ?? null,
      steps: todayActivity?.steps ?? 0,
      restingHR: lastNight?.average_heart_rate ?? null,
      hrv: lastNight?.average_hrv ?? null,
    };
  }
}

// =====================================================
// SYNC FUNCTION
// =====================================================

export async function syncOuraData(
  connection: RigConnection,
  days: number = 7,
): Promise<RigSyncResult> {
  try {
    if (!connection.access_token) {
      return { success: false, records_synced: 0, error: "No access token" };
    }

    const client = new OuraClient(connection.access_token);
    const data = await client.getDashboardData(days);

    // Count records
    const sleepRecords =
      data.sleep.recentSleep.length + (data.sleep.lastNight ? 1 : 0);
    const activityRecords = data.activity.recentActivity.length;
    const readinessRecords = data.readiness.recentReadiness.length;
    const heartRateRecords = data.heartRate.recentHeartRate.length;
    const workoutRecords = data.workouts.length;

    const totalRecords =
      sleepRecords +
      activityRecords +
      readinessRecords +
      heartRateRecords +
      workoutRecords;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return {
      success: true,
      records_synced: totalRecords,
      data_range: {
        from: startDate.toISOString(),
        to: endDate.toISOString(),
      },
    };
  } catch (error) {
    logger.error("[Oura] Sync error:", error);
    return {
      success: false,
      records_synced: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// =====================================================
// FACTORY
// =====================================================

export function createOuraClient(connection: RigConnection): OuraClient | null {
  if (!connection.access_token) return null;
  return new OuraClient(connection.access_token);
}
