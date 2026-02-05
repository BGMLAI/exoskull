"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  AutonomyGrantUI,
  InterventionUI,
  AutonomyStatsUI,
  GuardianDataUI,
  MAPEKCycleUI,
} from "./types";

// ============================================================================
// Hook Return Type
// ============================================================================

export interface AutonomyData {
  // State
  userId: string | null;
  grants: Record<string, AutonomyGrantUI[]>;
  allGrants: AutonomyGrantUI[];
  activeGrants: AutonomyGrantUI[];
  pending: InterventionUI[];
  interventions: InterventionUI[];
  stats: AutonomyStatsUI | null;
  guardianData: GuardianDataUI | null;
  cycles: MAPEKCycleUI[];
  loading: boolean;
  error: string | null;

  // Mutations — Grants
  createGrant: (
    pattern: string,
    category: string,
    opts?: { dailyLimit?: number; spendingLimit?: number; expiresAt?: string },
  ) => Promise<boolean>;
  toggleGrant: (grantId: string, isActive: boolean) => Promise<void>;
  updateGrant: (
    grantId: string,
    updates: {
      dailyLimit?: number;
      spendingLimit?: number;
      expiresAt?: string;
    },
  ) => Promise<void>;
  deleteGrant: (grantId: string) => Promise<void>;

  // Mutations — Interventions
  approveIntervention: (id: string) => Promise<void>;
  rejectIntervention: (id: string, reason?: string) => Promise<void>;
  sendFeedback: (id: string, feedback: string, notes?: string) => Promise<void>;

  // Mutations — Cycles
  runCycle: () => Promise<void>;

  // Mutations — Guardian
  updateValue: (
    value_area: string,
    importance: number,
    description: string,
  ) => Promise<void>;
  resolveConflict: (conflictId: string, resolution: string) => Promise<void>;
  updateGuardianConfig: (config: {
    max_interventions_per_day?: number;
    cooldown_minutes?: number;
    min_benefit_score?: number;
  }) => Promise<void>;

  // Refresh
  refresh: () => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useAutonomyData(): AutonomyData {
  const [userId, setUserId] = useState<string | null>(null);
  const [grants, setGrants] = useState<Record<string, AutonomyGrantUI[]>>({});
  const [pending, setPending] = useState<InterventionUI[]>([]);
  const [interventions, setInterventions] = useState<InterventionUI[]>([]);
  const [stats, setStats] = useState<AutonomyStatsUI | null>(null);
  const [guardianData, setGuardianData] = useState<GuardianDataUI | null>(null);
  const [cycles, setCycles] = useState<MAPEKCycleUI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Fetch all data
  // --------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;
      setUserId(user.id);

      const [
        grantsRes,
        pendingRes,
        historyRes,
        statsRes,
        guardianRes,
        cyclesRes,
      ] = await Promise.all([
        fetch(`/api/autonomy?userId=${user.id}`),
        fetch(`/api/autonomy/execute?tenantId=${user.id}&type=pending`),
        fetch(
          `/api/autonomy/execute?tenantId=${user.id}&type=history&limit=50`,
        ),
        fetch(`/api/autonomy/execute?tenantId=${user.id}&type=stats&days=30`),
        fetch(`/api/autonomy/guardian`),
        fetch(`/api/autonomy/execute?tenantId=${user.id}&type=cycles&limit=20`),
      ]);

      if (grantsRes.ok) {
        const data = await grantsRes.json();
        setGrants(data.byCategory || {});
      }
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPending(data.interventions || []);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setInterventions(data.interventions || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        // Normalize stats from the raw API response
        const iStats = data.interventions || [];
        const completed = iStats
          .filter((s: Record<string, unknown>) => s.intervention_type)
          .reduce(
            (sum: number, s: Record<string, unknown>) =>
              sum + ((s as { completed_count?: number }).completed_count || 0),
            0,
          );
        const failed = iStats.reduce(
          (sum: number, s: Record<string, unknown>) =>
            sum + ((s as { failed_count?: number }).failed_count || 0),
          0,
        );
        const total = iStats.reduce(
          (sum: number, s: Record<string, unknown>) =>
            sum + ((s as { total_count?: number }).total_count || 0),
          0,
        );
        setStats({
          total_interventions: total,
          completed,
          failed,
          avg_effectiveness: data.cycles?.successRate || 0,
          active_grants: 0, // computed from grants below
        });
      }
      if (guardianRes.ok) {
        const data = await guardianRes.json();
        setGuardianData(data);
      }
      if (cyclesRes.ok) {
        const data = await cyclesRes.json();
        setCycles(data.cycles || []);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[useAutonomyData] Fetch error:", { error: msg });
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --------------------------------------------------------------------------
  // Computed
  // --------------------------------------------------------------------------

  const allGrants = Object.values(grants).flat();
  const activeGrants = allGrants.filter((g) => g.is_active);

  // Patch active_grants into stats
  const patchedStats = stats
    ? { ...stats, active_grants: activeGrants.length }
    : null;

  // --------------------------------------------------------------------------
  // Mutations
  // --------------------------------------------------------------------------

  const createGrant = async (
    pattern: string,
    category: string,
    opts?: { dailyLimit?: number; spendingLimit?: number; expiresAt?: string },
  ): Promise<boolean> => {
    if (!userId || !pattern.trim()) return false;
    try {
      const res = await fetch("/api/autonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          actionPattern: pattern,
          category,
          dailyLimit: opts?.dailyLimit,
          spendingLimit: opts?.spendingLimit,
          expiresAt: opts?.expiresAt,
        }),
      });
      if (res.ok) {
        await fetchData();
        return true;
      }
      const err = await res.json();
      console.error("[useAutonomyData] Create grant error:", err);
      return false;
    } catch (err) {
      console.error("[useAutonomyData] Create grant error:", {
        error: err instanceof Error ? err.message : err,
      });
      return false;
    }
  };

  const toggleGrant = async (grantId: string, isActive: boolean) => {
    if (!userId) return;
    try {
      const res = await fetch("/api/autonomy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId, userId, isActive: !isActive }),
      });
      if (res.ok) await fetchData();
    } catch (err) {
      console.error("[useAutonomyData] Toggle grant error:", {
        error: err instanceof Error ? err.message : err,
      });
    }
  };

  const updateGrant = async (
    grantId: string,
    updates: {
      dailyLimit?: number;
      spendingLimit?: number;
      expiresAt?: string;
    },
  ) => {
    if (!userId) return;
    try {
      const res = await fetch("/api/autonomy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId, userId, ...updates }),
      });
      if (res.ok) await fetchData();
    } catch (err) {
      console.error("[useAutonomyData] Update grant error:", {
        error: err instanceof Error ? err.message : err,
      });
    }
  };

  const deleteGrant = async (grantId: string) => {
    if (!userId) return;
    try {
      const res = await fetch(
        `/api/autonomy?grantId=${grantId}&userId=${userId}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) await fetchData();
    } catch (err) {
      console.error("[useAutonomyData] Delete grant error:", {
        error: err instanceof Error ? err.message : err,
      });
    }
  };

  const approveIntervention = async (id: string) => {
    if (!userId) return;
    try {
      await fetch("/api/autonomy/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "approve",
          tenantId: userId,
          interventionId: id,
        }),
      });
      await fetchData();
    } catch (err) {
      console.error("[useAutonomyData] Approve error:", {
        error: err instanceof Error ? err.message : err,
      });
    }
  };

  const rejectIntervention = async (id: string, reason?: string) => {
    if (!userId) return;
    try {
      await fetch("/api/autonomy/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "reject",
          tenantId: userId,
          interventionId: id,
          reason,
        }),
      });
      await fetchData();
    } catch (err) {
      console.error("[useAutonomyData] Reject error:", {
        error: err instanceof Error ? err.message : err,
      });
    }
  };

  const sendFeedback = async (id: string, feedback: string, notes?: string) => {
    if (!userId) return;
    try {
      await fetch("/api/autonomy/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "feedback",
          tenantId: userId,
          interventionId: id,
          feedback,
          notes,
        }),
      });
      await fetchData();
    } catch (err) {
      console.error("[useAutonomyData] Feedback error:", {
        error: err instanceof Error ? err.message : err,
      });
    }
  };

  const runCycle = async () => {
    if (!userId) return;
    try {
      await fetch("/api/autonomy/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "run_cycle",
          tenantId: userId,
          trigger: "manual",
        }),
      });
      await fetchData();
    } catch (err) {
      console.error("[useAutonomyData] Run cycle error:", {
        error: err instanceof Error ? err.message : err,
      });
    }
  };

  const updateValue = async (
    value_area: string,
    importance: number,
    description: string,
  ) => {
    try {
      const res = await fetch("/api/autonomy/guardian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_value",
          data: { value_area, importance, description },
        }),
      });
      if (res.ok) await fetchData();
    } catch (err) {
      console.error("[useAutonomyData] Update value error:", {
        error: err instanceof Error ? err.message : err,
      });
    }
  };

  const resolveConflict = async (conflictId: string, resolution: string) => {
    try {
      const res = await fetch("/api/autonomy/guardian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve_conflict",
          data: { conflict_id: conflictId, resolution },
        }),
      });
      if (res.ok) await fetchData();
    } catch (err) {
      console.error("[useAutonomyData] Resolve conflict error:", {
        error: err instanceof Error ? err.message : err,
      });
    }
  };

  const updateGuardianConfig = async (config: {
    max_interventions_per_day?: number;
    cooldown_minutes?: number;
    min_benefit_score?: number;
  }) => {
    try {
      const res = await fetch("/api/autonomy/guardian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_config", data: config }),
      });
      if (res.ok) await fetchData();
    } catch (err) {
      console.error("[useAutonomyData] Update config error:", {
        error: err instanceof Error ? err.message : err,
      });
    }
  };

  return {
    userId,
    grants,
    allGrants,
    activeGrants,
    pending,
    interventions,
    stats: patchedStats,
    guardianData,
    cycles,
    loading,
    error,
    createGrant,
    toggleGrant,
    updateGrant,
    deleteGrant,
    approveIntervention,
    rejectIntervention,
    sendFeedback,
    runCycle,
    updateValue,
    resolveConflict,
    updateGuardianConfig,
    refresh: fetchData,
  };
}
