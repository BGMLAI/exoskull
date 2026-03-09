/**
 * Tau Matrix — User Behavioral Model
 *
 * 5 dimensions that model user personality and preferences.
 * Updated on each interaction via weighted moving average.
 * Stored in exo_tenants.metadata.tau_matrix.
 * Injected into context building for personalized responses.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export interface TauMatrix {
  /** How the user prefers to communicate: "formal" | "casual" | "technical" | "brief" */
  communication_style: number; // 0 = formal → 1 = casual
  /** User's typical energy level in interactions */
  energy_level: number; // 0 = low → 1 = high
  /** Baseline stress level (inferred from language patterns) */
  stress_baseline: number; // 0 = calm → 1 = stressed
  /** Peak productivity window (24h clock, normalized 0-1) */
  productivity_window: number; // 0 = midnight, 0.5 = noon, etc.
  /** Value priorities: work-life balance spectrum */
  value_priorities: number; // 0 = work-focused → 1 = life-focused
}

const DEFAULT_TAU: TauMatrix = {
  communication_style: 0.5,
  energy_level: 0.5,
  stress_baseline: 0.3,
  productivity_window: 0.375, // 9 AM
  value_priorities: 0.5,
};

/** Weighted moving average alpha — how much each new signal shifts the matrix */
const LEARNING_RATE = 0.15;

/**
 * Get the current Tau Matrix for a tenant.
 */
export async function getTauMatrix(tenantId: string): Promise<TauMatrix> {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("exo_tenants")
      .select("metadata")
      .eq("id", tenantId)
      .single();

    const metadata = data?.metadata as Record<string, unknown> | null;
    const stored = metadata?.tau_matrix as Partial<TauMatrix> | undefined;

    if (stored) {
      return { ...DEFAULT_TAU, ...stored };
    }
    return { ...DEFAULT_TAU };
  } catch {
    return { ...DEFAULT_TAU };
  }
}

/**
 * Update the Tau Matrix based on a new interaction signal.
 * Uses weighted moving average to smoothly shift dimensions.
 */
export async function updateTauMatrix(
  tenantId: string,
  signal: Partial<TauMatrix>,
): Promise<void> {
  try {
    const current = await getTauMatrix(tenantId);
    const updated = { ...current };

    for (const [key, newValue] of Object.entries(signal)) {
      if (
        typeof newValue === "number" &&
        key in current &&
        newValue >= 0 &&
        newValue <= 1
      ) {
        const k = key as keyof TauMatrix;
        updated[k] =
          current[k] * (1 - LEARNING_RATE) + newValue * LEARNING_RATE;
      }
    }

    const supabase = getServiceSupabase();

    // Merge into existing metadata (don't overwrite other fields)
    const { data: existing } = await supabase
      .from("exo_tenants")
      .select("metadata")
      .eq("id", tenantId)
      .single();

    const existingMeta = (existing?.metadata as Record<string, unknown>) || {};

    await supabase
      .from("exo_tenants")
      .update({
        metadata: {
          ...existingMeta,
          tau_matrix: updated,
          tau_matrix_updated_at: new Date().toISOString(),
        },
      })
      .eq("id", tenantId);
  } catch (err) {
    logger.warn("[TauMatrix] Update failed (non-blocking):", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Infer Tau signals from message characteristics.
 */
export function inferTauFromMessage(
  message: string,
  hour: number,
): Partial<TauMatrix> {
  const signal: Partial<TauMatrix> = {};

  // Communication style: formal vs casual
  const formalIndicators =
    /\b(proszę|uprzejmie|szanown|dziękuję|z poważaniem|please|thank you|regards)\b/i;
  const casualIndicators =
    /\b(hej|siema|cześć|spoko|ok|lol|xd|haha|yo|hey|sup)\b/i;

  if (formalIndicators.test(message)) signal.communication_style = 0.2;
  else if (casualIndicators.test(message)) signal.communication_style = 0.8;

  // Energy level: inferred from message length and punctuation
  const hasExclamation = (message.match(/!/g) || []).length > 1;
  const hasUppercase = message.length > 10 && message === message.toUpperCase();
  if (hasExclamation || hasUppercase) signal.energy_level = 0.8;
  else if (message.length < 20) signal.energy_level = 0.3;

  // Productivity window: when user is active
  signal.productivity_window = hour / 24;

  return signal;
}

/**
 * Generate a context injection string from the Tau Matrix.
 */
export function tauMatrixToContext(tau: TauMatrix): string {
  const style =
    tau.communication_style > 0.6
      ? "swobodny"
      : tau.communication_style < 0.4
        ? "formalny"
        : "zrównoważony";

  const energy =
    tau.energy_level > 0.6
      ? "wysoka"
      : tau.energy_level < 0.4
        ? "niska"
        : "średnia";

  const stress =
    tau.stress_baseline > 0.6
      ? "podwyższony"
      : tau.stress_baseline < 0.3
        ? "niski"
        : "umiarkowany";

  const prodHour = Math.round(tau.productivity_window * 24);
  const prodWindow = `${prodHour}:00`;

  return (
    `[Tau Matrix] Profil użytkownika: ` +
    `styl komunikacji=${style}, energia=${energy}, ` +
    `stres bazowy=${stress}, okno produktywności=~${prodWindow}, ` +
    `priorytet wartości=${tau.value_priorities > 0.6 ? "life-focused" : tau.value_priorities < 0.4 ? "work-focused" : "balanced"}`
  );
}
