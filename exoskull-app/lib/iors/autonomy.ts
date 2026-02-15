/**
 * IORS Autonomy Permissions System
 *
 * Granular consent model: user controls what IORS can do autonomously.
 *
 * Permission matrix: action_type × domain
 * - action_type: log, message, schedule, call, create_mod, purchase, cancel, share_data
 * - domain: health, finance, work, social, home, business, * (all)
 *
 * Defaults: only 'log' in '*' domain is granted at birth.
 * Everything else requires explicit user consent.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import type {
  AutonomyPermission,
  AutonomyActionType,
  AutonomyDomain,
  PermissionCheckResult,
} from "./types";

// ============================================================================
// PERMISSION CHECK
// ============================================================================

/**
 * Check if IORS has permission for a specific action in a domain.
 * Checks exact domain first, then wildcard (*).
 * Returns { permitted: false } if no permission found.
 */
export async function checkPermission(
  tenantId: string,
  actionType: AutonomyActionType,
  domain: AutonomyDomain = "*",
): Promise<PermissionCheckResult> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_autonomy_permissions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("action_type", actionType)
    .eq("granted", true)
    .is("revoked_at", null)
    .in("domain", [domain, "*"])
    .order("domain", { ascending: true }) // exact match first
    .limit(1)
    .maybeSingle();

  if (!data) {
    // No permission record found — deny silently.
    // requires_confirmation should only be true when an explicit permission
    // record exists with that flag, not as a default for missing permissions.
    return { permitted: false, requires_confirmation: false };
  }

  return {
    permitted: true,
    requires_confirmation: data.requires_confirmation ?? false,
    permission: data as AutonomyPermission,
  };
}

// ============================================================================
// PERMISSION MANAGEMENT
// ============================================================================

/**
 * Grant an autonomy permission (upsert).
 */
export async function grantPermission(
  tenantId: string,
  actionType: AutonomyActionType,
  domain: AutonomyDomain = "*",
  options?: {
    threshold_amount?: number;
    threshold_frequency?: number;
    requires_confirmation?: boolean;
    granted_via?: AutonomyPermission["granted_via"];
  },
): Promise<void> {
  const supabase = getServiceSupabase();

  const { error } = await supabase.from("exo_autonomy_permissions").upsert(
    {
      tenant_id: tenantId,
      action_type: actionType,
      domain,
      granted: true,
      granted_at: new Date().toISOString(),
      revoked_at: null,
      requires_confirmation: options?.requires_confirmation ?? false,
      threshold_amount: options?.threshold_amount ?? null,
      threshold_frequency: options?.threshold_frequency ?? null,
      granted_via: options?.granted_via ?? "conversation",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,action_type,domain" },
  );

  if (error) {
    console.error("[Autonomy] grantPermission failed:", {
      tenantId,
      actionType,
      domain,
      error: error.message,
    });
  }
}

/**
 * Revoke an autonomy permission.
 */
export async function revokePermission(
  tenantId: string,
  actionType: AutonomyActionType,
  domain: AutonomyDomain = "*",
): Promise<void> {
  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("exo_autonomy_permissions")
    .update({
      granted: false,
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("action_type", actionType)
    .eq("domain", domain);

  if (error) {
    console.error("[Autonomy] revokePermission failed:", {
      tenantId,
      actionType,
      domain,
      error: error.message,
    });
  }
}

/**
 * List all permissions for a tenant.
 */
export async function listPermissions(
  tenantId: string,
): Promise<AutonomyPermission[]> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("exo_autonomy_permissions")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("revoked_at", null)
    .order("action_type");

  if (error) {
    console.error("[Autonomy] listPermissions failed:", {
      tenantId,
      error: error.message,
    });
    return [];
  }

  return (data || []) as AutonomyPermission[];
}

// ============================================================================
// PROPOSAL SYSTEM
// ============================================================================

/**
 * Generate a human-readable permission proposal for IORS to present.
 * Used by the `propose_autonomy` tool.
 */
export function proposePermission(
  actionType: AutonomyActionType,
  domain: AutonomyDomain = "*",
): string {
  const domainLabel = domain === "*" ? "wszystko" : domain;

  const proposals: Record<string, string> = {
    log: `Czy moge automatycznie zapisywac dane (${domainLabel}) bez pytania za kazdym razem?`,
    message: `Czy moge wysylac wiadomosci w Twoim imieniu (domena: ${domainLabel})?`,
    schedule: `Czy moge modyfikowac Twoj kalendarz (domena: ${domainLabel})?`,
    call: `Czy moge dzwonic w Twoim imieniu (domena: ${domainLabel})?`,
    create_mod: `Czy moge tworzyc nowe trackery (Mody) gdy widze potrzebe?`,
    purchase: `Czy moge dokonywac zakupow (domena: ${domainLabel})? Powiedz mi tez jaki limit.`,
    cancel: `Czy moge anulowac rzeczy w Twoim imieniu (domena: ${domainLabel})?`,
    share_data: `Czy moge udostepniac Twoje dane (domena: ${domainLabel}) innym instancjom IORS?`,
  };

  return (
    proposals[actionType] ||
    `Czy moge wykonywac akcje "${actionType}" w domenie "${domainLabel}"?`
  );
}

/**
 * Record a use of an autonomy permission (for tracking frequency).
 */
export async function recordPermissionUse(
  tenantId: string,
  actionType: AutonomyActionType,
  domain: AutonomyDomain = "*",
): Promise<void> {
  const supabase = getServiceSupabase();

  await supabase
    .rpc("increment_autonomy_use", {
      p_tenant_id: tenantId,
      p_action_type: actionType,
      p_domain: domain,
    })
    .then(({ error }) => {
      if (error) {
        // Fallback: direct update if RPC doesn't exist yet
        supabase
          .from("exo_autonomy_permissions")
          .update({
            last_used_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenantId)
          .eq("action_type", actionType)
          .eq("domain", domain)
          .then(() => {});
      }
    });
}
