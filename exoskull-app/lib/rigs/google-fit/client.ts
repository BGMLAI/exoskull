// =====================================================
// GOOGLE FIT CLIENT — DEPRECATED
//
// Google Fit REST API was shut down June 2025.
// Health data now comes from:
//   - Oura Ring (via lib/rigs/oura/client.ts)
//   - Health Connect (Android app push)
//   - Manual input (via IORS tools)
//
// All data is stored in exo_health_metrics and read via
// lib/integrations/google-fit-adapter.ts (DB queries).
//
// This client is kept for backward compatibility with
// the unified Google client (lib/rigs/google/client.ts)
// which calls getAllData(). It now returns empty data
// immediately without making any API calls.
// =====================================================

import { RigSyncResult } from "../types";

import { logger } from "@/lib/logger";

export class GoogleFitClient {
  constructor(_accessToken: string) {
    // No-op — API is dead
  }

  // Returns empty data immediately — no API calls
  async getAllData(_startDate: Date, _endDate: Date) {
    logger.info(
      "[GoogleFit] getAllData() skipped — Google Fit API deprecated (June 2025)",
    );
    return {
      steps: [],
      heartRate: [],
      calories: [],
      sleep: [],
      distance: [],
      errors: [
        "Google Fit REST API shut down June 2025. Data sourced from Oura/Health Connect.",
      ],
    };
  }
}

// Sync function — returns empty result
export async function syncGoogleFitData(
  _connection: { access_token: string | null },
  _days: number = 7,
): Promise<RigSyncResult> {
  return {
    success: true,
    records_synced: 0,
    error:
      "Google Fit API deprecated. Health data sourced from Oura/Health Connect.",
  };
}
