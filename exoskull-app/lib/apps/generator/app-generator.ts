// =====================================================
// APP GENERATOR — Orchestrates app creation pipeline
// AI spec generation → validation → approval → table creation → registration
// =====================================================

import { aiChat } from "@/lib/ai";
import { buildAppSystemPrompt, buildAppUserPrompt } from "./prompts/app-prompt";
import {
  AppGenerationRequest,
  AppGenerationResult,
  AppSpec,
  AppColumn,
} from "../types";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

const MAX_RETRIES = 3;

/**
 * Generate a new app from a natural language description.
 * Pipeline: AI spec → validate → store as PENDING → notify user → await approval
 * Table + widget are created only after user approves via activateApp().
 */
export async function generateApp(
  request: AppGenerationRequest,
): Promise<AppGenerationResult> {
  const { tenant_id, description } = request;

  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Step 1: Generate app spec via AI
      const spec = await generateAppSpec(description, lastError);
      if (!spec) {
        lastError = "AI returned invalid spec";
        continue;
      }

      // Step 2: Validate spec
      const validationErrors = validateAppSpec(spec);
      if (validationErrors.length > 0) {
        lastError = validationErrors.join("; ");
        logger.warn(
          `[AppGenerator] Validation failed (attempt ${attempt}):`,
          validationErrors,
        );
        continue;
      }

      // Step 3: Check for duplicate slug
      const supabase = getServiceSupabase();
      const { data: existing } = await supabase
        .from("exo_generated_apps")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("slug", spec.slug)
        .maybeSingle();

      if (existing) {
        lastError = `App with slug "${spec.slug}" already exists`;
        // Append random suffix to try again
        spec.slug = `${spec.slug}-${Date.now().toString(36).slice(-4)}`;
        spec.table_name = `exo_app_${spec.slug.replace(/-/g, "_")}`;
      }

      // Step 4: Build the schema SQL for reference (table NOT created yet)
      const schemaSql = buildSchemaSql(spec);

      // Step 5: Store in app registry as PENDING (no table or widget yet)
      const { data: app, error: insertError } = await supabase
        .from("exo_generated_apps")
        .insert({
          tenant_id,
          slug: spec.slug,
          name: spec.name,
          description: spec.description,
          status: "pending_approval",
          table_name: spec.table_name,
          columns: spec.columns,
          indexes: spec.indexes,
          ui_config: spec.ui_config,
          widget_size: spec.widget_size,
          generation_prompt: description,
          generated_by: "auto-routed",
          schema_sql: schemaSql,
          risk_level: "low",
          approval_status: "pending",
        })
        .select()
        .single();

      if (insertError) {
        logger.error("[AppGenerator] DB insert error:", insertError);
        return {
          success: false,
          error: `Database error: ${insertError.message}`,
        };
      }

      // Step 6: Send SMS notification to tenant about pending app
      await sendAppApprovalNotification(supabase, tenant_id, spec);

      logger.info(
        `[AppGenerator] App spec stored as PENDING: ${spec.slug} (attempt ${attempt})`,
      );

      return { success: true, app, pending_approval: true };
    } catch (error) {
      lastError = (error as Error).message;
      logger.error(`[AppGenerator] Attempt ${attempt} failed:`, error);
    }
  }

  return {
    success: false,
    error: `Failed after ${MAX_RETRIES} attempts: ${lastError}`,
  };
}

/**
 * Call AI to generate app specification JSON
 */
async function generateAppSpec(
  description: string,
  previousError: string | null,
): Promise<AppSpec | null> {
  const systemPrompt = buildAppSystemPrompt();
  let userPrompt = buildAppUserPrompt(description);

  if (previousError) {
    userPrompt += `\n\nIMPORTANT: Your previous attempt had this error: ${previousError}\nFix it and try again.`;
  }

  const response = await aiChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    {
      taskCategory: "code_generation",
      maxTokens: 4096,
    },
  );

  // Parse JSON from response
  let jsonStr = response.content.trim();
  // Remove markdown code blocks if present
  jsonStr = jsonStr.replace(/^```(?:json)?\n?/m, "");
  jsonStr = jsonStr.replace(/\n?```\s*$/m, "");
  jsonStr = jsonStr.trim();

  try {
    return JSON.parse(jsonStr) as AppSpec;
  } catch {
    logger.error(
      "[AppGenerator] Failed to parse AI response as JSON:",
      jsonStr.slice(0, 200),
    );
    return null;
  }
}

/**
 * Validate app spec for safety and correctness
 */
function validateAppSpec(spec: AppSpec): string[] {
  const errors: string[] = [];

  // Slug validation
  if (!spec.slug || !/^[a-z0-9-]+$/.test(spec.slug)) {
    errors.push(
      "slug must be kebab-case (lowercase letters, numbers, hyphens)",
    );
  }
  if (spec.slug && spec.slug.length > 40) {
    errors.push("slug must be max 40 characters");
  }

  // Table name validation
  if (!spec.table_name || !spec.table_name.startsWith("exo_app_")) {
    errors.push("table_name must start with exo_app_");
  }
  if (spec.table_name && /[^a-z0-9_]/.test(spec.table_name)) {
    errors.push(
      "table_name must contain only lowercase letters, numbers, underscores",
    );
  }

  // Name
  if (!spec.name || spec.name.length > 100) {
    errors.push("name is required and must be max 100 characters");
  }

  // Columns validation
  if (!Array.isArray(spec.columns) || spec.columns.length === 0) {
    errors.push("columns must be a non-empty array");
  }

  const ALLOWED_TYPES = new Set([
    "text",
    "integer",
    "bigint",
    "numeric",
    "boolean",
    "date",
    "timestamptz",
    "jsonb",
    "real",
    "double precision",
  ]);

  const reservedColumns = new Set([
    "id",
    "tenant_id",
    "created_at",
    "updated_at",
  ]);

  for (const col of spec.columns || []) {
    if (reservedColumns.has(col.name)) {
      errors.push(`Column "${col.name}" is reserved (auto-added)`);
    }
    if (/[^a-z0-9_]/.test(col.name)) {
      errors.push(
        `Column "${col.name}" must contain only lowercase letters, numbers, underscores`,
      );
    }
    if (!ALLOWED_TYPES.has(col.type)) {
      errors.push(`Column "${col.name}" has invalid type "${col.type}"`);
    }
  }

  // UI config validation
  if (!spec.ui_config) {
    errors.push("ui_config is required");
  } else {
    if (
      !Array.isArray(spec.ui_config.display_columns) ||
      spec.ui_config.display_columns.length === 0
    ) {
      errors.push("ui_config.display_columns must be a non-empty array");
    }
    if (
      !Array.isArray(spec.ui_config.form_fields) ||
      spec.ui_config.form_fields.length === 0
    ) {
      errors.push("ui_config.form_fields must be a non-empty array");
    }
  }

  // SQL injection prevention — no dangerous keywords in any string field
  const dangerousPatterns =
    /\b(DROP|DELETE|TRUNCATE|ALTER|GRANT|REVOKE|EXECUTE|COPY)\b/i;
  const allStrings = JSON.stringify(spec);
  if (dangerousPatterns.test(allStrings)) {
    errors.push("Spec contains dangerous SQL keywords");
  }

  return errors;
}

/**
 * Build reference SQL string for the app (for auditing, not execution)
 */
function buildSchemaSql(spec: AppSpec): string {
  const cols = spec.columns
    .map((c: AppColumn) => {
      let line = `  ${c.name} ${c.type}`;
      if (c.nullable === false) line += " NOT NULL";
      if (c.default_value) line += ` DEFAULT ${c.default_value}`;
      return line;
    })
    .join(",\n");

  return `-- Auto-generated by ExoSkull App Builder
CREATE TABLE ${spec.table_name} (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES exo_tenants(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
${cols}
);`;
}

/**
 * Activate a pending app: create data table + widget + mark approved.
 * Called after user explicitly approves via chat or SMS.
 */
export async function activateApp(
  appId: string,
  tenantId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceSupabase();

  // Fetch pending app
  const { data: app, error: fetchError } = await supabase
    .from("exo_generated_apps")
    .select("*")
    .eq("id", appId)
    .eq("tenant_id", tenantId)
    .eq("approval_status", "pending")
    .single();

  if (fetchError || !app) {
    return { success: false, error: "App not found or already approved" };
  }

  // Create the data table via RPC
  const { data: tableResult, error: tableError } = await supabase.rpc(
    "create_app_table",
    {
      p_table_name: app.table_name,
      p_columns: app.columns,
      p_tenant_id: tenantId,
    },
  );

  if (tableError || !tableResult?.success) {
    const errMsg =
      tableError?.message ||
      tableResult?.error ||
      "Unknown table creation error";
    logger.error("[AppGenerator] activateApp table creation failed:", {
      errMsg,
      appId,
    });
    return { success: false, error: `Table creation failed: ${errMsg}` };
  }

  // Update app status to approved + active
  await supabase
    .from("exo_generated_apps")
    .update({
      status: "active",
      approval_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: "user",
    })
    .eq("id", appId);

  // Add widget to canvas
  const spec: AppSpec = {
    slug: app.slug,
    name: app.name,
    description: app.description || "",
    table_name: app.table_name,
    columns: app.columns,
    indexes: app.indexes || [],
    ui_config: app.ui_config,
    widget_size: app.widget_size || { w: 4, h: 3 },
  };
  await addAppWidget(supabase, tenantId, spec);

  logger.info(`[AppGenerator] App activated: ${app.slug} (${appId})`);
  return { success: true };
}

/**
 * Send SMS notification to tenant about a pending app awaiting approval.
 */
async function sendAppApprovalNotification(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
  spec: AppSpec,
): Promise<void> {
  try {
    // Get tenant phone number
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("phone, name")
      .eq("id", tenantId)
      .single();

    if (!tenant?.phone) {
      logger.info(
        "[AppGenerator] No phone for tenant, skipping SMS notification",
      );
      return;
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      logger.warn(
        "[AppGenerator] Missing Twilio credentials for app approval SMS",
      );
      return;
    }

    const body = [
      `ExoSkull wygenerował nową aplikację:`,
      `"${spec.name}" — ${spec.description}`,
      ``,
      `Kolumny: ${spec.columns.map((c) => c.name).join(", ")}`,
      ``,
      `Aby zatwierdzić, napisz: "zatwierdź aplikację ${spec.slug}"`,
      `Aby odrzucić, napisz: "odrzuć aplikację ${spec.slug}"`,
    ].join("\n");

    const params = new URLSearchParams({
      To: tenant.phone,
      From: fromNumber,
      Body: body.length > 1500 ? body.substring(0, 1497) + "..." : body,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("[AppGenerator] SMS notification failed:", {
        status: response.status,
        body: errorBody,
      });
    } else {
      logger.info(
        `[AppGenerator] Approval SMS sent to ${tenant.phone} for app: ${spec.slug}`,
      );
    }
  } catch (error) {
    // Non-fatal — app is still pending, user can approve via chat
    logger.error("[AppGenerator] Failed to send approval SMS:", error);
  }
}

/**
 * Add the app as a canvas widget for the tenant
 */
async function addAppWidget(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
  spec: AppSpec,
): Promise<void> {
  try {
    // Find the next available Y position
    const { data: widgets } = await supabase
      .from("exo_canvas_widgets")
      .select("position_y, size_h")
      .eq("tenant_id", tenantId)
      .order("position_y", { ascending: false })
      .limit(1);

    const nextY =
      widgets && widgets.length > 0
        ? widgets[0].position_y + widgets[0].size_h
        : 0;

    await supabase.from("exo_canvas_widgets").insert({
      tenant_id: tenantId,
      widget_type: `app:${spec.slug}`,
      title: spec.name,
      position_x: 0,
      position_y: nextY,
      size_w: spec.widget_size.w,
      size_h: spec.widget_size.h,
      min_w: 2,
      min_h: 2,
      config: { app_slug: spec.slug },
      visible: true,
      pinned: false,
      sort_order: 999,
      created_by: "iors_proposed",
    });
  } catch (error) {
    // Non-fatal — app still works without widget
    logger.error("[AppGenerator] Failed to add widget:", error);
  }
}
