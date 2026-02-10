"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  type UnifiedExtension,
  type RawInstalledMod,
  type RawSkill,
  type RawApp,
  normalizeMod,
  normalizeSkill,
  normalizeApp,
} from "./types";

// ============================================================================
// RAW MOD TEMPLATE TYPE (for marketplace)
// ============================================================================

export interface ModTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  config: Record<string, unknown>;
  is_template: boolean;
  created_at: string;
}

// ============================================================================
// HOOK RETURN TYPE
// ============================================================================

export interface UseExtensionsResult {
  /** All active extensions (installed mods + approved skills + active apps) */
  active: UnifiedExtension[];
  /** Mod templates available for installation */
  marketplace: ModTemplate[];
  /** Pending approval (skills + apps) */
  pending: UnifiedExtension[];
  /** Stats */
  stats: {
    totalActive: number;
    modCount: number;
    skillCount: number;
    appCount: number;
    pendingCount: number;
  };
  loading: boolean;
  userId: string | null;
  /** Refresh all data */
  refresh: () => Promise<void>;
  /** Install a mod template by slug */
  installMod: (slug: string) => Promise<boolean>;
  /** Archive a skill by ID */
  archiveSkill: (id: string) => Promise<boolean>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useExtensions(): UseExtensionsResult {
  const [active, setActive] = useState<UnifiedExtension[]>([]);
  const [marketplace, setMarketplace] = useState<ModTemplate[]>([]);
  const [pending, setPending] = useState<UnifiedExtension[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;
      setUserId(user.id);

      // Parallel fetch all 3 sources + marketplace templates
      const [modsRes, skillsRes, appsRes, templatesRes] =
        await Promise.allSettled([
          fetch("/api/mods").then((r) => r.json()),
          supabase
            .from("exo_generated_skills")
            .select(
              "id, slug, name, description, version, tier, risk_level, capabilities, approval_status, usage_count, last_used_at, created_at, updated_at, archived_at",
            )
            .eq("tenant_id", user.id)
            .is("archived_at", null)
            .order("created_at", { ascending: false }),
          fetch("/api/apps").then((r) => r.json()),
          supabase
            .from("exo_mod_registry")
            .select("*")
            .eq("is_template", true)
            .order("category", { ascending: true }),
        ]);

      // Parse results
      const mods: RawInstalledMod[] =
        modsRes.status === "fulfilled" ? modsRes.value.mods || [] : [];
      const skills: RawSkill[] =
        skillsRes.status === "fulfilled" ? skillsRes.value.data || [] : [];
      const apps: RawApp[] =
        appsRes.status === "fulfilled" ? appsRes.value.apps || [] : [];
      const templates: ModTemplate[] =
        templatesRes.status === "fulfilled"
          ? templatesRes.value.data || []
          : [];

      // Normalize into unified extensions
      const normalizedMods = mods.filter((m) => m.mod).map(normalizeMod);
      const normalizedSkills = skills.map(normalizeSkill);
      const normalizedApps = apps.map(normalizeApp);

      // Split into active vs pending
      const allExtensions = [
        ...normalizedMods,
        ...normalizedSkills,
        ...normalizedApps,
      ];
      setActive(allExtensions.filter((e) => e.status === "active"));
      setPending(allExtensions.filter((e) => e.status === "pending"));

      // Marketplace: templates not yet installed
      const installedSlugs = new Set(
        mods.map((m) => m.mod?.slug).filter(Boolean),
      );
      setMarketplace(templates.filter((t) => !installedSlugs.has(t.slug)));
    } catch (error) {
      console.error("[useExtensions] Fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Actions
  const installMod = useCallback(
    async (slug: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/mods/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        if (res.ok) {
          await fetchAll();
          return true;
        }
        const err = await res.json();
        console.error("[useExtensions] Install error:", { slug, error: err });
        return false;
      } catch (error) {
        console.error("[useExtensions] Install error:", { slug, error });
        return false;
      }
    },
    [fetchAll],
  );

  const archiveSkill = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
        if (res.ok) {
          await fetchAll();
          return true;
        }
        return false;
      } catch (error) {
        console.error("[useExtensions] Archive error:", { id, error });
        return false;
      }
    },
    [fetchAll],
  );

  // Stats
  const stats = {
    totalActive: active.length,
    modCount: active.filter((e) => e.type === "mod").length,
    skillCount: active.filter((e) => e.type === "skill").length,
    appCount: active.filter((e) => e.type === "app").length,
    pendingCount: pending.length,
  };

  return {
    active,
    marketplace,
    pending,
    stats,
    loading,
    userId,
    refresh: fetchAll,
    installMod,
    archiveSkill,
  };
}
