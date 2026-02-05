// =====================================================
// MODS - User-facing Abilities & Extensions
// =====================================================

export type ModCategory = "health" | "productivity" | "finance" | "wellbeing";

export type BuiltinModSlug =
  | "sleep-tracker"
  | "energy-monitor"
  | "hrv-tracker"
  | "focus-mode"
  | "task-manager"
  | "calendar-assistant"
  | "mood-tracker"
  | "habit-tracker"
  | "spending-tracker";

// Dynamic skills use custom-* prefix (e.g., "custom-water-tracker")
export type ModSlug = BuiltinModSlug | `custom-${string}`;

export interface ModDefinition {
  slug: ModSlug;
  name: string;
  description: string;
  icon: string;
  category: ModCategory;

  // Required Rigs (at least one must be connected)
  requires_rigs: string[];

  // Configuration schema (JSON Schema)
  config_schema: Record<string, unknown>;

  // Capabilities
  capabilities: {
    insights: boolean; // Can generate insights
    notifications: boolean; // Can send notifications
    actions: boolean; // Can take actions
    voice: boolean; // Has voice interface
  };
}

export interface ModInstallation {
  id: string;
  tenant_id: string;
  registry_id: string;
  config: Record<string, unknown>;
  enabled: boolean;
  installed_at: string;
  updated_at: string;
}

export interface ModInsight {
  type: "info" | "warning" | "success" | "alert";
  title: string;
  message: string;
  data?: Record<string, unknown>;
  action?: {
    label: string;
    type: "link" | "button";
    href?: string;
    onClick?: string;
  };
  created_at: string;
}

export interface ModAction {
  slug: string;
  name: string;
  description: string;
  params_schema: Record<string, unknown>;
}

// Base interface for all Mod implementations
export interface IModExecutor {
  readonly slug: ModSlug;

  // Get current data/state
  getData(tenant_id: string): Promise<Record<string, unknown>>;

  // Generate insights based on data
  getInsights(tenant_id: string): Promise<ModInsight[]>;

  // Execute an action
  executeAction(
    tenant_id: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: unknown; error?: string }>;

  // Get available actions
  getActions(): ModAction[];
}

// Quest types (extends Mod)
export type QuestSlug =
  | "7-day-sleep"
  | "digital-detox"
  | "morning-routine"
  | "mindfulness-week"
  | "fitness-kickstart";

export interface QuestProgress {
  day: number;
  date: string;
  completed: boolean;
  tasks: {
    id: string;
    title: string;
    completed: boolean;
    completed_at?: string;
  }[];
  notes?: string;
}

export interface QuestInstallation extends ModInstallation {
  started_at: string | null;
  completed_at: string | null;
  progress: QuestProgress[];
}
