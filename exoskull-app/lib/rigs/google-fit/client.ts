// =====================================================
// GOOGLE FIT / HEALTHCONNECT CLIENT
// =====================================================

import { RigConnection, RigSyncResult } from '../types';

const GOOGLE_FIT_API = 'https://www.googleapis.com/fitness/v1/users/me';

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

export class GoogleFitClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${GOOGLE_FIT_API}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Fit API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // Get aggregated data for a time range
  async getAggregatedData(
    dataTypeName: string,
    startTime: Date,
    endTime: Date
  ): Promise<AggregateResponse> {
    const body = {
      aggregateBy: [{ dataTypeName }],
      bucketByTime: { durationMillis: 86400000 }, // 1 day
      startTimeMillis: startTime.getTime().toString(),
      endTimeMillis: endTime.getTime().toString(),
    };

    return this.fetch('/dataset:aggregate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Get steps data
  async getSteps(startDate: Date, endDate: Date): Promise<{ date: string; steps: number }[]> {
    const response = await this.getAggregatedData(
      'com.google.step_count.delta',
      startDate,
      endDate
    );

    return response.bucket.map((bucket) => {
      const steps = bucket.dataset[0]?.point[0]?.value[0]?.intVal || 0;
      return {
        date: new Date(parseInt(bucket.startTimeMillis)).toISOString().split('T')[0],
        steps,
      };
    });
  }

  // Get heart rate data
  async getHeartRate(startDate: Date, endDate: Date): Promise<{ date: string; bpm: number }[]> {
    const response = await this.getAggregatedData(
      'com.google.heart_rate.bpm',
      startDate,
      endDate
    );

    return response.bucket.map((bucket) => {
      const bpm = bucket.dataset[0]?.point[0]?.value[0]?.fpVal || 0;
      return {
        date: new Date(parseInt(bucket.startTimeMillis)).toISOString().split('T')[0],
        bpm: Math.round(bpm),
      };
    });
  }

  // Get calories burned
  async getCalories(startDate: Date, endDate: Date): Promise<{ date: string; calories: number }[]> {
    const response = await this.getAggregatedData(
      'com.google.calories.expended',
      startDate,
      endDate
    );

    return response.bucket.map((bucket) => {
      const calories = bucket.dataset[0]?.point[0]?.value[0]?.fpVal || 0;
      return {
        date: new Date(parseInt(bucket.startTimeMillis)).toISOString().split('T')[0],
        calories: Math.round(calories),
      };
    });
  }

  // Get sleep data (from Sleep as Android, Samsung Health, etc.)
  async getSleep(startDate: Date, endDate: Date): Promise<{ date: string; durationMinutes: number }[]> {
    const response = await this.getAggregatedData(
      'com.google.sleep.segment',
      startDate,
      endDate
    );

    return response.bucket.map((bucket) => {
      // Calculate total sleep duration from segments
      const totalNanos = bucket.dataset[0]?.point.reduce((sum, point) => {
        const start = parseInt(point.startTimeNanos);
        const end = parseInt(point.endTimeNanos);
        return sum + (end - start);
      }, 0) || 0;

      return {
        date: new Date(parseInt(bucket.startTimeMillis)).toISOString().split('T')[0],
        durationMinutes: Math.round(totalNanos / (1000000 * 60)),
      };
    });
  }

  // Get distance (walking, running)
  async getDistance(startDate: Date, endDate: Date): Promise<{ date: string; meters: number }[]> {
    const response = await this.getAggregatedData(
      'com.google.distance.delta',
      startDate,
      endDate
    );

    return response.bucket.map((bucket) => {
      const meters = bucket.dataset[0]?.point[0]?.value[0]?.fpVal || 0;
      return {
        date: new Date(parseInt(bucket.startTimeMillis)).toISOString().split('T')[0],
        meters: Math.round(meters),
      };
    });
  }

  // Get all health data for a date range
  async getAllData(startDate: Date, endDate: Date) {
    const [steps, heartRate, calories, sleep, distance] = await Promise.all([
      this.getSteps(startDate, endDate).catch(() => []),
      this.getHeartRate(startDate, endDate).catch(() => []),
      this.getCalories(startDate, endDate).catch(() => []),
      this.getSleep(startDate, endDate).catch(() => []),
      this.getDistance(startDate, endDate).catch(() => []),
    ]);

    return { steps, heartRate, calories, sleep, distance };
  }
}

// Sync Google Fit data for a user
export async function syncGoogleFitData(
  connection: RigConnection,
  days: number = 7
): Promise<RigSyncResult> {
  try {
    if (!connection.access_token) {
      return { success: false, records_synced: 0, error: 'No access token' };
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
    };
  } catch (error) {
    console.error('[GoogleFit] Sync error:', error);
    return {
      success: false,
      records_synced: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
