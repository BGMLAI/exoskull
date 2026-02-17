// =====================================================
// GOOGLE FIT / HEALTHCONNECT CLIENT
// =====================================================

import { RigSyncResult } from "../types";

import { logger } from "@/lib/logger";
const GOOGLE_FIT_API = "https://www.googleapis.com/fitness/v1/users/me";

interface DataPoint {
  startTimeNanos: string;
  endTimeNanos: string;
  value: { intVal?: number; fpVal?: number }[];
}

interface Dataset {
  dataSourceId: string;
  point: DataPoint[];
}

interface AggregateResponse {
  bucket: {
    startTimeMillis: string;
    endTimeMillis: string;
    dataset: Dataset[];
  }[];
}

// =====================================================
// RETRY + RATE LIMIT HELPERS
// =====================================================

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  context: string,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok) return response;

      const errorText = await response.text();
      lastError = new Error(
        `Google Fit API ${response.status}: ${errorText.slice(0, 200)}`,
      );

      logger.error(`[GoogleFit] ${context} attempt ${attempt + 1} failed:`, {
        status: response.status,
        error: errorText.slice(0, 200),
      });

      // Don't retry on auth errors — token is invalid
      if (response.status === 401 || response.status === 403) {
        throw lastError;
      }

      // Retry on 429 (rate limit) and 5xx (server errors)
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt] || 4000;
        logger.info(
          `[GoogleFit] ${context} retrying in ${delay}ms (attempt ${attempt + 2}/${MAX_RETRIES})`,
        );
        await sleep(delay);
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes("401") || err.message.includes("403"))
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.error(`[GoogleFit] ${context} attempt ${attempt + 1} error:`, {
        error: lastError.message,
      });
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAYS[attempt] || 4000);
      }
    }
  }

  throw (
    lastError ||
    new Error(`[GoogleFit] ${context} failed after ${MAX_RETRIES} retries`)
  );
}

// =====================================================
// CLIENT
// =====================================================

export class GoogleFitClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {},
    context = "fetch",
  ): Promise<T> {
    const response = await fetchWithRetry(
      `${GOOGLE_FIT_API}${endpoint}`,
      {
        ...options,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      },
      context,
    );

    return response.json();
  }

  // Get aggregated data for a time range
  async getAggregatedData(
    dataTypeName: string,
    startTime: Date,
    endTime: Date,
  ): Promise<AggregateResponse> {
    const body = {
      aggregateBy: [{ dataTypeName }],
      bucketByTime: { durationMillis: 86400000 }, // 1 day
      startTimeMillis: startTime.getTime().toString(),
      endTimeMillis: endTime.getTime().toString(),
    };

    return this.fetch(
      "/dataset:aggregate",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      `aggregate:${dataTypeName.split(".").pop()}`,
    );
  }

  // Get steps data
  async getSteps(
    startDate: Date,
    endDate: Date,
  ): Promise<{ date: string; steps: number }[]> {
    const response = await this.getAggregatedData(
      "com.google.step_count.delta",
      startDate,
      endDate,
    );

    return response.bucket.map((bucket) => {
      const steps = bucket.dataset[0]?.point[0]?.value[0]?.intVal || 0;
      return {
        date: new Date(parseInt(bucket.startTimeMillis))
          .toISOString()
          .split("T")[0],
        steps,
      };
    });
  }

  // Get heart rate data
  async getHeartRate(
    startDate: Date,
    endDate: Date,
  ): Promise<{ date: string; bpm: number }[]> {
    const response = await this.getAggregatedData(
      "com.google.heart_rate.bpm",
      startDate,
      endDate,
    );

    return response.bucket.map((bucket) => {
      const bpm = bucket.dataset[0]?.point[0]?.value[0]?.fpVal || 0;
      return {
        date: new Date(parseInt(bucket.startTimeMillis))
          .toISOString()
          .split("T")[0],
        bpm: Math.round(bpm),
      };
    });
  }

  // Get calories burned
  async getCalories(
    startDate: Date,
    endDate: Date,
  ): Promise<{ date: string; calories: number }[]> {
    const response = await this.getAggregatedData(
      "com.google.calories.expended",
      startDate,
      endDate,
    );

    return response.bucket.map((bucket) => {
      const calories = bucket.dataset[0]?.point[0]?.value[0]?.fpVal || 0;
      return {
        date: new Date(parseInt(bucket.startTimeMillis))
          .toISOString()
          .split("T")[0],
        calories: Math.round(calories),
      };
    });
  }

  // Get sleep data (from Sleep as Android, Samsung Health, etc.)
  async getSleep(
    startDate: Date,
    endDate: Date,
  ): Promise<{ date: string; durationMinutes: number }[]> {
    const response = await this.getAggregatedData(
      "com.google.sleep.segment",
      startDate,
      endDate,
    );

    return response.bucket.map((bucket) => {
      // Calculate total sleep duration from segments
      const totalNanos =
        bucket.dataset[0]?.point.reduce((sum, point) => {
          const start = parseInt(point.startTimeNanos);
          const end = parseInt(point.endTimeNanos);
          return sum + (end - start);
        }, 0) || 0;

      return {
        date: new Date(parseInt(bucket.startTimeMillis))
          .toISOString()
          .split("T")[0],
        durationMinutes: Math.round(totalNanos / (1000000 * 60)),
      };
    });
  }

  // Get distance (walking, running)
  async getDistance(
    startDate: Date,
    endDate: Date,
  ): Promise<{ date: string; meters: number }[]> {
    const response = await this.getAggregatedData(
      "com.google.distance.delta",
      startDate,
      endDate,
    );

    return response.bucket.map((bucket) => {
      const meters = bucket.dataset[0]?.point[0]?.value[0]?.fpVal || 0;
      return {
        date: new Date(parseInt(bucket.startTimeMillis))
          .toISOString()
          .split("T")[0],
        meters: Math.round(meters),
      };
    });
  }

  // Get all health data for a date range (with error tracking)
  async getAllData(startDate: Date, endDate: Date) {
    const errors: string[] = [];

    // Small delay between requests to respect rate limits
    const fetchWithDelay = async <T>(
      fn: () => Promise<T>,
      label: string,
    ): Promise<T | null> => {
      try {
        const result = await fn();
        await sleep(100); // 100ms between requests
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${label}: ${msg}`);
        logger.error(`[GoogleFit] getAllData.${label} failed:`, msg);
        return null;
      }
    };

    const steps =
      (await fetchWithDelay(
        () => this.getSteps(startDate, endDate),
        "steps",
      )) || [];
    const heartRate =
      (await fetchWithDelay(
        () => this.getHeartRate(startDate, endDate),
        "heartRate",
      )) || [];
    const calories =
      (await fetchWithDelay(
        () => this.getCalories(startDate, endDate),
        "calories",
      )) || [];
    const sleepData =
      (await fetchWithDelay(
        () => this.getSleep(startDate, endDate),
        "sleep",
      )) || [];
    const distance =
      (await fetchWithDelay(
        () => this.getDistance(startDate, endDate),
        "distance",
      )) || [];

    if (errors.length > 0) {
      logger.warn(
        `[GoogleFit] getAllData completed with ${errors.length} errors:`,
        errors,
      );
    }

    return { steps, heartRate, calories, sleep: sleepData, distance, errors };
  }
}

// Sync Google Fit data for a user
export async function syncGoogleFitData(
  connection: { access_token: string | null },
  days: number = 7,
): Promise<RigSyncResult> {
  try {
    if (!connection.access_token) {
      return { success: false, records_synced: 0, error: "No access token" };
    }

    const client = new GoogleFitClient(connection.access_token);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const data = await client.getAllData(startDate, endDate);

    // Count total records
    const recordsSynced =
      data.steps.length +
      data.heartRate.length +
      data.calories.length +
      data.sleep.length +
      data.distance.length;

    return {
      success: true,
      records_synced: recordsSynced,
      data_range: {
        from: startDate.toISOString(),
        to: endDate.toISOString(),
      },
      ...(data.errors.length > 0
        ? { error: `Partial: ${data.errors.join("; ")}` }
        : {}),
    };
  } catch (error) {
    logger.error("[GoogleFit] Sync error:", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      success: false,
      records_synced: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
