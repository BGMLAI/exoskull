/**
 * Unified Extension Type System
 *
 * Normalizes Mods, Skills, and Apps into a single UnifiedExtension type
 * so they can be displayed together in the Skills page tabs.
 */

// ============================================================================
// TYPES
// ============================================================================

export type ExtensionType = "mod" | "skill" | "app";

export type ExtensionStatus =
  | "active"
  | "inactive"
  | "pending"
  | "rejected"
  | "archived";

export interface UnifiedExtension {
  id: string;
  type: ExtensionType;
  name: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  status: ExtensionStatus;
  createdAt: string;
  /** Route for detail view */
  detailHref: string | null;
  /** Type-specific metadata */
  meta: ModMeta | SkillMeta | AppMeta;
}

export interface ModMeta {
  kind: "mod";
  slug: string;
  active: boolean;
  installedAt: string;
}

export interface SkillMeta {
  kind: "skill";
  slug: string;
  version: string;
  riskLevel: "low" | "medium" | "high";
  usageCount: number;
  approvalStatus: "pending" | "approved" | "rejected" | "revoked";
  capabilities: {
    database: string[];
    tables: string[];
    notifications: boolean;
    externalApi: boolean;
  };
}

export interface AppMeta {
  kind: "app";
  slug: string;
  tableName: string;
  usageCount: number;
  appStatus: string;
}

// ============================================================================
// BADGE CONFIG
// ============================================================================

export const TYPE_BADGE_CONFIG: Record<
  ExtensionType,
  { label: string; color: string; iconName: string }
> = {
  mod: {
    label: "Mod",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    iconName: "Package",
  },
  skill: {
    label: "Skill",
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    iconName: "Sparkles",
  },
  app: {
    label: "App",
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    iconName: "LayoutGrid",
  },
};

export const CATEGORY_LABELS: Record<string, string> = {
  health: "Zdrowie",
  productivity: "Produktywnosc",
  finance: "Finanse",
  growth: "Rozwoj",
  relationships: "Relacje",
  wellbeing: "Wellbeing",
};

export const CATEGORY_COLORS: Record<string, string> = {
  health:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  productivity:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  finance:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  growth:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  relationships:
    "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  wellbeing: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
};

// ============================================================================
// CONVERTERS
// ============================================================================

/** Raw installed mod from /api/mods */
interface RawInstalledMod {
  id: string;
  active: boolean;
  installed_at: string;
  mod: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    icon: string | null;
    category: string | null;
    config: Record<string, unknown>;
  };
}

/** Raw skill from exo_generated_skills */
interface RawSkill {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  tier: string;
  risk_level: "low" | "medium" | "high";
  capabilities: {
    database: string[];
    tables: string[];
    notifications: boolean;
    externalApi: boolean;
  };
  approval_status: "pending" | "approved" | "rejected" | "revoked";
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/** Raw app from /api/apps */
interface RawApp {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  table_name: string;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
}

export function normalizeMod(raw: RawInstalledMod): UnifiedExtension {
  const mod = raw.mod;
  return {
    id: raw.id,
    type: "mod",
    name: mod.name,
    description: mod.description,
    icon: mod.icon,
    category: mod.category,
    status: raw.active ? "active" : "inactive",
    createdAt: raw.installed_at,
    detailHref: `/dashboard/mods/${mod.slug}`,
    meta: {
      kind: "mod",
      slug: mod.slug,
      active: raw.active,
      installedAt: raw.installed_at,
    },
  };
}

export function normalizeSkill(raw: RawSkill): UnifiedExtension {
  const statusMap: Record<string, ExtensionStatus> = {
    approved: "active",
    pending: "pending",
    rejected: "rejected",
    revoked: "archived",
  };
  return {
    id: raw.id,
    type: "skill",
    name: raw.name,
    description: raw.description,
    icon: null,
    category: null,
    status: statusMap[raw.approval_status] || "pending",
    createdAt: raw.created_at,
    detailHref: `/dashboard/skills/${raw.id}`,
    meta: {
      kind: "skill",
      slug: raw.slug,
      version: raw.version,
      riskLevel: raw.risk_level,
      usageCount: raw.usage_count,
      approvalStatus: raw.approval_status,
      capabilities: raw.capabilities || {
        database: [],
        tables: [],
        notifications: false,
        externalApi: false,
      },
    },
  };
}

export function normalizeApp(raw: RawApp): UnifiedExtension {
  const statusMap: Record<string, ExtensionStatus> = {
    active: "active",
    pending_approval: "pending",
    archived: "archived",
  };
  return {
    id: raw.id,
    type: "app",
    name: raw.name,
    description: raw.description,
    icon: null,
    category: null,
    status: statusMap[raw.status] || "pending",
    createdAt: raw.created_at,
    detailHref: null,
    meta: {
      kind: "app",
      slug: raw.slug,
      tableName: raw.table_name,
      usageCount: raw.usage_count,
      appStatus: raw.status,
    },
  };
}

export type { RawInstalledMod, RawSkill, RawApp };
