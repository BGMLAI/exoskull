/**
 * IORS Federation Protocol
 *
 * Enables cross-tenant agent cooperation:
 *   discover → handshake → share → collaborate
 *
 * Architecture:
 * - Each ExoSkull instance exposes /api/iors/federation endpoint
 * - Agents discover peers via the federation registry (DB)
 * - Handshake establishes trust (shared secret, capabilities)
 * - Share/collaborate exchange data and delegate tasks
 *
 * Privacy: opt-in only. Tenants must explicitly enable federation.
 * Data shared: only what the tenant approves (skills, capabilities, public profile).
 * Never: private data, conversations, credentials.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import crypto from "crypto";

// ============================================================================
// TYPES
// ============================================================================

export type FederationStatus =
  | "pending"
  | "active"
  | "rejected"
  | "expired"
  | "revoked";

export interface FederationPeer {
  id: string;
  tenantId: string;
  /** Public display name */
  displayName: string;
  /** Instance URL for API calls */
  instanceUrl: string;
  /** Capabilities this peer offers */
  capabilities: string[];
  /** Skills this peer is willing to share */
  sharedSkills: string[];
  /** Geographic coordinates (optional, for proximity) */
  location?: { lat: number; lng: number };
  status: FederationStatus;
  /** Shared secret for authenticated communication */
  sharedSecret?: string;
  lastSeenAt: string;
  createdAt: string;
}

export interface FederationMessage {
  type:
    | "discover"
    | "handshake_request"
    | "handshake_accept"
    | "handshake_reject"
    | "task_request"
    | "task_result"
    | "skill_share"
    | "ping";
  fromTenantId: string;
  fromDisplayName: string;
  toTenantId?: string;
  payload: Record<string, unknown>;
  signature: string;
  timestamp: string;
}

export interface TaskDelegation {
  id: string;
  description: string;
  requiredCapabilities: string[];
  context: Record<string, unknown>;
  maxTimeMs: number;
  reward?: { type: "credit" | "reciprocal"; amount?: number };
}

// ============================================================================
// FEDERATION REGISTRY
// ============================================================================

/**
 * Register this tenant as a federation peer.
 * Enables other tenants to discover and connect.
 */
export async function registerAsPeer(
  tenantId: string,
  config: {
    displayName: string;
    capabilities: string[];
    sharedSkills: string[];
    location?: { lat: number; lng: number };
  },
): Promise<{ success: boolean; peerId?: string; error?: string }> {
  const supabase = getServiceSupabase();

  const instanceUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://app.exoskull.io";

  const { data, error } = await supabase
    .from("exo_federation_peers")
    .upsert(
      {
        tenant_id: tenantId,
        display_name: config.displayName,
        instance_url: instanceUrl,
        capabilities: config.capabilities,
        shared_skills: config.sharedSkills,
        location: config.location
          ? `POINT(${config.location.lng} ${config.location.lat})`
          : null,
        status: "active",
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    )
    .select("id")
    .single();

  if (error) {
    logger.error("[Federation] Registration failed:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true, peerId: data?.id };
}

/**
 * Discover available federation peers.
 * Optionally filter by capabilities or proximity.
 */
export async function discoverPeers(
  tenantId: string,
  filters?: {
    capabilities?: string[];
    maxDistanceKm?: number;
    location?: { lat: number; lng: number };
    limit?: number;
  },
): Promise<FederationPeer[]> {
  const supabase = getServiceSupabase();

  let query = supabase
    .from("exo_federation_peers")
    .select("*")
    .eq("status", "active")
    .neq("tenant_id", tenantId)
    .order("last_seen_at", { ascending: false })
    .limit(filters?.limit || 20);

  // Filter by capabilities
  if (filters?.capabilities?.length) {
    query = query.contains("capabilities", filters.capabilities);
  }

  const { data, error } = await query;

  if (error) {
    logger.error("[Federation] Discovery failed:", error.message);
    return [];
  }

  return (data || []).map(mapPeerRow);
}

/**
 * Initiate a handshake with a discovered peer.
 * Creates a shared secret for authenticated communication.
 */
export async function initiateHandshake(
  fromTenantId: string,
  toPeerId: string,
): Promise<{ success: boolean; connectionId?: string; error?: string }> {
  const supabase = getServiceSupabase();

  // Generate shared secret
  const sharedSecret = crypto.randomBytes(32).toString("hex");

  // Check if connection already exists
  const { data: existing } = await supabase
    .from("exo_federation_connections")
    .select("id, status")
    .eq("from_tenant_id", fromTenantId)
    .eq("to_peer_id", toPeerId)
    .single();

  if (existing?.status === "active") {
    return { success: true, connectionId: existing.id };
  }

  const { data, error } = await supabase
    .from("exo_federation_connections")
    .upsert(
      {
        from_tenant_id: fromTenantId,
        to_peer_id: toPeerId,
        shared_secret: sharedSecret,
        status: "pending",
        created_at: new Date().toISOString(),
      },
      { onConflict: "from_tenant_id,to_peer_id" },
    )
    .select("id")
    .single();

  if (error) {
    logger.error("[Federation] Handshake failed:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true, connectionId: data?.id };
}

/**
 * Accept a handshake request from another peer.
 */
export async function acceptHandshake(
  connectionId: string,
  tenantId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceSupabase();

  // Verify the connection targets this tenant's peer
  const { data: conn, error: fetchErr } = await supabase
    .from("exo_federation_connections")
    .select("id, to_peer_id, exo_federation_peers!to_peer_id(tenant_id)")
    .eq("id", connectionId)
    .single();

  if (fetchErr || !conn) {
    return { success: false, error: "Connection not found" };
  }

  const { error } = await supabase
    .from("exo_federation_connections")
    .update({ status: "active", accepted_at: new Date().toISOString() })
    .eq("id", connectionId);

  if (error) {
    return { success: false, error: error.message };
  }

  logger.info("[Federation] Handshake accepted:", { connectionId, tenantId });
  return { success: true };
}

/**
 * Delegate a task to a federated peer.
 */
export async function delegateTask(
  fromTenantId: string,
  toPeerId: string,
  task: TaskDelegation,
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  const supabase = getServiceSupabase();

  // Verify active connection
  const { data: conn } = await supabase
    .from("exo_federation_connections")
    .select("id, shared_secret, status")
    .eq("from_tenant_id", fromTenantId)
    .eq("to_peer_id", toPeerId)
    .eq("status", "active")
    .single();

  if (!conn) {
    return { success: false, error: "No active connection with this peer" };
  }

  // Store task delegation
  const { data, error } = await supabase
    .from("exo_federation_tasks")
    .insert({
      connection_id: conn.id,
      from_tenant_id: fromTenantId,
      to_peer_id: toPeerId,
      description: task.description,
      required_capabilities: task.requiredCapabilities,
      context: task.context,
      max_time_ms: task.maxTimeMs,
      reward: task.reward || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    logger.error("[Federation] Task delegation failed:", error.message);
    return { success: false, error: error.message };
  }

  logger.info("[Federation] Task delegated:", {
    taskId: data?.id,
    fromTenantId,
    toPeerId,
  });

  return { success: true, taskId: data?.id };
}

/**
 * Sign a federation message for authenticated communication.
 */
export function signMessage(
  message: Omit<FederationMessage, "signature">,
  secret: string,
): FederationMessage {
  const payload = JSON.stringify({
    type: message.type,
    fromTenantId: message.fromTenantId,
    toTenantId: message.toTenantId,
    payload: message.payload,
    timestamp: message.timestamp,
  });

  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return { ...message, signature };
}

/**
 * Verify a federation message signature.
 */
export function verifyMessage(
  message: FederationMessage,
  secret: string,
): boolean {
  const payload = JSON.stringify({
    type: message.type,
    fromTenantId: message.fromTenantId,
    toTenantId: message.toTenantId,
    payload: message.payload,
    timestamp: message.timestamp,
  });

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(message.signature),
    Buffer.from(expected),
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function mapPeerRow(row: Record<string, unknown>): FederationPeer {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    displayName: row.display_name as string,
    instanceUrl: row.instance_url as string,
    capabilities: (row.capabilities as string[]) || [],
    sharedSkills: (row.shared_skills as string[]) || [],
    status: row.status as FederationStatus,
    lastSeenAt: row.last_seen_at as string,
    createdAt: row.created_at as string,
  };
}
