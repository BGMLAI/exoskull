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

/** UI configuration for the app widget */
export interface AppUiConfig {
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
    | "rating";
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
