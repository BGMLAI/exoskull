// =====================================================
// APP BUILDER - Core Types
// =====================================================

/** Column definition for a generated app table */
export interface AppColumn {
  name: string;
  type:
    | "text"
    | "integer"
    | "bigint"
    | "numeric"
    | "boolean"
    | "date"
    | "timestamptz"
    | "jsonb"
    | "real";
  nullable?: boolean;
  default_value?: string;
  description?: string;
}

/** Index definition */
export interface AppIndex {
  columns: string[];
  unique?: boolean;
}

/** Layout type for dynamic app rendering */
export type AppLayout =
  | "table"
  | "cards"
  | "timeline"
  | "kanban"
  | "stats-grid"
  | "mindmap";

/** UI configuration for the app widget */
export interface AppUiConfig {
  /** Layout mode — determines how entries are rendered. Default: "table" */
  layout?: AppLayout;
  /** Columns to show in list view */
  display_columns: string[];
  /** Fields for the add/edit form */
  form_fields: AppFormField[];
  /** Optional chart configuration */
  chart?: {
    type: "bar" | "line" | "pie";
    x_column: string;
    y_column: string;
    label?: string;
  };
  /** Lucide icon name */
  icon?: string;
  /** Accent color (tailwind class) */
  color?: string;
  /** Summary stat to show at top */
  summary?: {
    column: string;
    aggregation: "count" | "sum" | "avg" | "min" | "max";
    label: string;
  };
  /** Card layout: which column is the card title */
  card_title_column?: string;
  /** Card layout: which column is the card subtitle/description */
  card_subtitle_column?: string;
  /** Card layout: which column determines card color/badge */
  card_badge_column?: string;
  /** Timeline layout: which column is the timestamp */
  timeline_date_column?: string;
  /** Timeline layout: which column is the event label */
  timeline_label_column?: string;
  /** Kanban layout: which column defines the swim lanes */
  kanban_group_column?: string;
  /** Kanban layout: possible values for swim lanes */
  kanban_columns?: string[];
  /** Stats grid: columns to show as stat cards */
  stats_columns?: {
    column: string;
    label: string;
    aggregation: "count" | "sum" | "avg" | "min" | "max" | "latest";
    format?: "number" | "currency" | "percent";
  }[];
  /** Conditional row styles */
  conditional_styles?: {
    column: string;
    operator: "eq" | "gt" | "lt" | "contains";
    value: string | number;
    class: string;
  }[];
  /** Mindmap layout: which column is the central node label */
  mindmap_center_label?: string;
  /** Mindmap layout: which column groups entries into branches */
  mindmap_group_column?: string;
  /** Mindmap layout: which column is the node label */
  mindmap_node_label?: string;
  /** Media rich: which column holds image/media URLs */
  media_column?: string;
  /** Media rich: display mode for media */
  media_display?: "thumbnail" | "cover" | "avatar";
}

/** Form field configuration */
export interface AppFormField {
  column: string;
  label: string;
  type:
    | "text"
    | "number"
    | "date"
    | "boolean"
    | "select"
    | "textarea"
    | "rating"
    | "url"
    | "image_url";
  required?: boolean;
  placeholder?: string;
  options?: string[]; // For select fields
  min?: number;
  max?: number;
}

/** Status of a generated app */
export type AppStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "active"
  | "archived"
  | "failed";

/** Risk level classification */
export type AppRiskLevel = "low" | "medium" | "high";

/** Approval status */
export type AppApprovalStatus = "pending" | "approved" | "rejected" | "revoked";

/** Generated App (DB row representation) */
export interface GeneratedApp {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  description: string | null;
  status: AppStatus;
  table_name: string;
  columns: AppColumn[];
  indexes: AppIndex[];
  ui_config: AppUiConfig;
  widget_size: { w: number; h: number };
  generation_prompt: string | null;
  generated_by: string;
  generation_model: string | null;
  schema_sql: string | null;
  risk_level: AppRiskLevel;
  approval_status: AppApprovalStatus;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  usage_count: number;
  last_used_at: string | null;
  error_count: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Request to generate a new app */
export interface AppGenerationRequest {
  tenant_id: string;
  description: string;
  source: "user_request" | "iors_suggestion" | "chat_command";
}

/** Result of app generation */
export interface AppGenerationResult {
  success: boolean;
  app?: GeneratedApp;
  error?: string;
}

/** AI-generated app specification (intermediate format) */
export interface AppSpec {
  slug: string;
  name: string;
  description: string;
  table_name: string;
  columns: AppColumn[];
  indexes: AppIndex[];
  ui_config: AppUiConfig;
  widget_size: { w: number; h: number };
}
