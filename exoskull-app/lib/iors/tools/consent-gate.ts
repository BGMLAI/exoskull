/**
 * Consent Gate for IORS Self-Modification
 *
 * Two-tier permission system:
 * 1. "autonomous" = IORS changes freely, user gets notified
 * 2. "with_approval" = IORS proposes, user approves in Settings → Optimization
 * 3. Both false = IORS cannot touch this parameter
 *
 * Direct user requests always bypass the gate.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export type ConsentResult =
  | { mode: "allowed" }
  | { mode: "needs_approval" }
  | { mode: "denied"; reason: string };

/**
 * Check whether IORS is allowed to modify a given parameter.
 *
 * @param tenantId - User ID
 * @param permissionKey - Key from iors_ai_config.permissions (e.g. 'style_formality', 'temperature')
 * @param isDirectUserRequest - True if user explicitly asked IORS to change this in chat
 */
export async function checkSelfModifyConsent(
  tenantId: string,
  permissionKey: string,
  isDirectUserRequest: boolean,
): Promise<ConsentResult> {
  // Direct user request = always allowed (user said it in chat)
  if (isDirectUserRequest) {
    return { mode: "allowed" };
  }

  try {
    const supabase = getServiceSupabase();
    const { data: tenant, error } = await supabase
      .from("exo_tenants")
      .select("iors_ai_config")
      .eq("id", tenantId)
      .single();

    if (error || !tenant) {
      logger.warn("[ConsentGate] Failed to load config:", {
        tenantId,
        error: error?.message,
      });
      return {
        mode: "denied",
        reason: "Nie udalo sie zaladowac konfiguracji.",
      };
    }

    const aiConfig = tenant.iors_ai_config as Record<string, unknown> | null;
    const permissions = (aiConfig?.permissions ?? {}) as Record<
      string,
      { with_approval?: boolean; autonomous?: boolean }
    >;

    const perm = permissions[permissionKey];

    if (!perm) {
      // Unknown permission key — deny by default
      return {
        mode: "denied",
        reason: `Nieznany klucz uprawnien: ${permissionKey}. Wlacz w Ustawienia → Optymalizacja.`,
      };
    }

    if (perm.autonomous) {
      return { mode: "allowed" };
    }

    if (perm.with_approval) {
      return { mode: "needs_approval" };
    }

    return {
      mode: "denied",
      reason: `Brak uprawnien do zmiany ${permissionKey}. Wlacz w Ustawienia → Optymalizacja.`,
    };
  } catch (error) {
    logger.error("[ConsentGate] Unexpected error:", {
      tenantId,
      permissionKey,
      error: error instanceof Error ? error.message : error,
    });
    return {
      mode: "denied",
      reason: "Blad wewnetrzny przy sprawdzaniu uprawnien.",
    };
  }
}

/**
 * Log a self-modification to system_optimizations table.
 * Used by all self-modification tools to track changes.
 */
export async function logSelfModification(opts: {
  tenantId: string;
  parameterName: string;
  permissionKey: string;
  beforeState: unknown;
  afterState: unknown;
  status: "applied" | "proposed" | "rolled_back" | "rejected";
  reason?: string;
}): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("system_optimizations").insert({
      tenant_id: opts.tenantId,
      optimization_type: "self_modification",
      parameter_name: opts.parameterName,
      permission_key: opts.permissionKey,
      before_state: opts.beforeState,
      after_state: opts.afterState,
      status: opts.status,
      description: opts.reason ?? `IORS zmienil ${opts.parameterName}`,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("[ConsentGate] Failed to log modification:", {
      tenantId: opts.tenantId,
      parameter: opts.parameterName,
      error: error instanceof Error ? error.message : error,
    });
  }
}
