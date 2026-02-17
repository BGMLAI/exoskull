// =====================================================
// IORS Tools: App Builder
// Allows IORS to build custom apps from conversation
// =====================================================

import type { ToolDefinition } from "./shared";
import { generateApp } from "@/lib/apps/generator/app-generator";
import { getServiceSupabase } from "@/lib/supabase/service";

export const appBuilderTools: ToolDefinition[] = [
  {
    definition: {
      name: "build_app",
      description:
        "Build a custom application (tracker, dashboard, CRUD tool) from a natural language description. " +
        "Creates a database table, configures UI, and adds a widget to the user's dashboard. " +
        "Use when the user asks for a new tracker, logger, or custom data tool. " +
        "Example: 'Chcę śledzić moje czytanie' → builds reading tracker app.",
      input_schema: {
        type: "object" as const,
        required: ["description"],
        properties: {
          description: {
            type: "string",
            description:
              "Natural language description of the app to build. Include what to track, what data fields are needed, and any special requirements.",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const description = input.description as string;

      if (!description || description.trim().length < 5) {
        return "Potrzebuję dokładniejszego opisu. Powiedz co chcesz śledzić i jakie dane są ważne.";
      }

      const result = await generateApp({
        tenant_id: tenantId,
        description,
        source: "chat_command",
      });

      if (!result.success) {
        return `Nie udało się zbudować aplikacji: ${result.error}. Spróbuj opisać dokładniej co chcesz śledzić.`;
      }

      const app = result.app!;
      const columnList = app.columns
        .map((c) => `  - ${c.name}: ${c.description || c.type}`)
        .join("\n");

      return [
        `Aplikacja "${app.name}" została zbudowana!`,
        "",
        `Slug: ${app.slug}`,
        `Tabela: ${app.table_name}`,
        `Kolumny:`,
        columnList,
        "",
        `Widget został dodany do dashboardu.`,
        `Możesz go zobaczyć po odświeżeniu strony.`,
        "",
        `Aby dodać dane, użyj widgetu lub powiedz mi co chcesz zalogować.`,
      ].join("\n");
    },
  },
  {
    definition: {
      name: "list_apps",
      description:
        "List all custom applications built for the user. Shows name, status, and usage stats.",
      input_schema: {
        type: "object" as const,
        properties: {},
      },
    },
    execute: async (_input, tenantId) => {
      const supabase = getServiceSupabase();
      const { data: apps, error } = await supabase
        .from("exo_generated_apps")
        .select("slug, name, status, usage_count, created_at")
        .eq("tenant_id", tenantId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        return `Błąd podczas pobierania aplikacji: ${error.message}`;
      }

      if (!apps || apps.length === 0) {
        return "Nie masz jeszcze żadnych custom aplikacji. Powiedz mi co chcesz śledzić, a zbuduję dla Ciebie aplikację!";
      }

      const list = apps
        .map(
          (a) =>
            `- ${a.name} (${a.slug}) — ${a.status}, użyto ${a.usage_count}x`,
        )
        .join("\n");

      return `Twoje aplikacje (${apps.length}):\n${list}`;
    },
  },
  {
    definition: {
      name: "app_log_data",
      description:
        "Log a data entry to a custom app. Use when user wants to add data to one of their custom apps. " +
        "Requires the app slug and data as key-value pairs matching the app's columns.",
      input_schema: {
        type: "object" as const,
        required: ["app_slug", "data"],
        properties: {
          app_slug: {
            type: "string",
            description:
              "The slug of the app to log data to (e.g. 'reading-tracker')",
          },
          data: {
            type: "object",
            description:
              "Key-value pairs matching the app's columns. E.g. {book_title: 'Dune', pages_read: 50, rating: 5}",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const appSlug = input.app_slug as string;
      const data = input.data as Record<string, unknown>;

      const supabase = getServiceSupabase();

      // Fetch app config
      const { data: app, error: appError } = await supabase
        .from("exo_generated_apps")
        .select("table_name, columns, name")
        .eq("tenant_id", tenantId)
        .eq("slug", appSlug)
        .eq("status", "active")
        .single();

      if (appError || !app) {
        return `Nie znaleziono aktywnej aplikacji o slug "${appSlug}". Sprawdź listę aplikacji.`;
      }

      // Validate data keys match app columns
      const validColumns = new Set(
        (app.columns as Array<{ name: string }>).map((c) => c.name),
      );
      const invalidKeys = Object.keys(data).filter((k) => !validColumns.has(k));
      if (invalidKeys.length > 0) {
        return `Nieznane kolumny: ${invalidKeys.join(", ")}. Dostępne: ${Array.from(validColumns).join(", ")}`;
      }

      // Insert data
      const { error: insertError } = await supabase
        .from(app.table_name)
        .insert({
          tenant_id: tenantId,
          ...data,
        });

      if (insertError) {
        return `Błąd zapisu: ${insertError.message}`;
      }

      // Update usage stats
      await supabase
        .from("exo_generated_apps")
        .update({ last_used_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("slug", appSlug);

      return `Zapisano dane w "${app.name}"!`;
    },
  },
  {
    definition: {
      name: "app_get_data",
      description:
        "Retrieve data from a custom app. Returns recent entries from the app's table.",
      input_schema: {
        type: "object" as const,
        required: ["app_slug"],
        properties: {
          app_slug: {
            type: "string",
            description: "The slug of the app to read data from",
          },
          limit: {
            type: "number",
            description: "Max number of entries to return (default 10)",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const appSlug = input.app_slug as string;
      const limit = (input.limit as number) || 10;

      const supabase = getServiceSupabase();

      // Fetch app config
      const { data: app, error: appError } = await supabase
        .from("exo_generated_apps")
        .select("table_name, columns, name")
        .eq("tenant_id", tenantId)
        .eq("slug", appSlug)
        .eq("status", "active")
        .single();

      if (appError || !app) {
        return `Nie znaleziono aktywnej aplikacji o slug "${appSlug}".`;
      }

      // Fetch data
      const { data: entries, error: fetchError } = await supabase
        .from(app.table_name)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (fetchError) {
        return `Błąd odczytu: ${fetchError.message}`;
      }

      if (!entries || entries.length === 0) {
        return `Brak danych w "${app.name}". Zaloguj pierwszy wpis!`;
      }

      // Format entries
      const columnNames = (app.columns as Array<{ name: string }>).map(
        (c) => c.name,
      );
      const formatted = entries
        .map((entry, i) => {
          const values = columnNames
            .filter((col) => entry[col] !== null && entry[col] !== undefined)
            .map((col) => `  ${col}: ${entry[col]}`)
            .join("\n");
          return `#${i + 1} (${new Date(entry.created_at).toLocaleDateString("pl")}):\n${values}`;
        })
        .join("\n\n");

      return `${app.name} — ostatnie ${entries.length} wpisów:\n\n${formatted}`;
    },
  },
];
