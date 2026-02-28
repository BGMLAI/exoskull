/**
 * Self-Build Tools — Agent can generate new tools at runtime.
 *
 * When the agent encounters a task it can't handle with existing tools,
 * it calls build_tool() to generate a new dynamic tool, validate it,
 * save to DB, and register it immediately for use in the same conversation.
 *
 * Handler types:
 * - app_crud: CRUD on exo_app_* tables (agent specifies table + schema)
 * - query: Read-only Supabase queries
 * - composite: Chain of existing tools
 * - skill_exec: Sandboxed code execution (approved skills)
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";
import { invalidateDynamicToolCache } from "./dynamic-handler";
import { logger } from "@/lib/logger";

export const selfBuildTools: ToolDefinition[] = [
  {
    definition: {
      name: "build_tool",
      description:
        "Zbuduj nowy dynamiczny tool w runtime. Użyj gdy brakuje narzędzia do wykonania zadania. " +
        "Tool zostanie zarejestrowany i natychmiast dostępny. " +
        "Typy handlerów: app_crud (CRUD na tabelach exo_app_*), query (read-only Supabase), " +
        "composite (łańcuch istniejących narzędzi).",
      input_schema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description:
              "Unikalna nazwa toola (snake_case, bez prefiksu dyn_). Np: ocr_reader, budget_tracker",
          },
          description: {
            type: "string",
            description:
              "Opis co tool robi — widoczny dla agenta przy wyborze narzędzia",
          },
          handler_type: {
            type: "string",
            enum: ["app_crud", "query", "composite"],
            description:
              "Typ handlera: app_crud (CRUD), query (read-only), composite (chain tools)",
          },
          input_schema: {
            type: "object",
            description:
              "JSON Schema parametrów wejściowych toola (properties + required)",
          },
          handler_config: {
            type: "object",
            description:
              "Konfiguracja handlera. Dla app_crud: { table_name, operation }. " +
              "Dla query: { table_name, select_columns, order_by, limit }. " +
              "Dla composite: { steps: [{ tool_name, input_mapping }] }.",
          },
          reason: {
            type: "string",
            description: "Dlaczego ten tool jest potrzebny (do audytu)",
          },
        },
        required: [
          "name",
          "description",
          "handler_type",
          "input_schema",
          "handler_config",
          "reason",
        ],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const name = input.name as string;
      const description = input.description as string;
      const handlerType = input.handler_type as string;
      const inputSchema = input.input_schema as Record<string, unknown>;
      const handlerConfig = input.handler_config as Record<string, unknown>;
      const reason = input.reason as string;

      // Validate name
      if (!/^[a-z][a-z0-9_]{2,40}$/.test(name)) {
        return "Error: nazwa musi być snake_case, 3-40 znaków, zaczynać się od litery.";
      }

      // Validate handler type
      if (!["app_crud", "query", "composite"].includes(handlerType)) {
        return "Error: handler_type musi być: app_crud, query, lub composite.";
      }

      // Validate handler config based on type
      const configError = validateHandlerConfig(handlerType, handlerConfig);
      if (configError) return `Error: ${configError}`;

      // Validate input schema
      if (
        !inputSchema.properties ||
        typeof inputSchema.properties !== "object"
      ) {
        return "Error: input_schema musi mieć properties (obiekt).";
      }

      const supabase = getServiceSupabase();

      // Check if tool with this name already exists
      const { data: existing } = await supabase
        .from("exo_dynamic_tools")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("name", name)
        .maybeSingle();

      if (existing) {
        // Update existing tool
        const { error } = await supabase
          .from("exo_dynamic_tools")
          .update({
            description,
            input_schema: inputSchema,
            handler_type: handlerType,
            handler_config: handlerConfig,
            enabled: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) return `Error: aktualizacja toola: ${error.message}`;

        invalidateDynamicToolCache(tenantId);
        logger.info("[SelfBuild] Tool updated:", { name, tenantId, reason });
        return `Tool "dyn_${name}" zaktualizowany i aktywny. Możesz go teraz użyć.`;
      }

      // Create new tool
      const { error } = await supabase.from("exo_dynamic_tools").insert({
        tenant_id: tenantId,
        name,
        description,
        input_schema: inputSchema,
        handler_type: handlerType,
        handler_config: handlerConfig,
        enabled: true,
      });

      if (error) return `Error: tworzenie toola: ${error.message}`;

      // Invalidate cache so the tool is immediately available
      invalidateDynamicToolCache(tenantId);

      // Log to dev journal
      await supabase.from("exo_dev_journal").insert({
        tenant_id: tenantId,
        entry_type: "self_build",
        title: `Agent zbudował tool: ${name}`,
        details: {
          name,
          handler_type: handlerType,
          handler_config: handlerConfig,
          reason,
          description,
        },
        outcome: "success",
        related_entity: `dynamic_tool:${name}`,
      });

      logger.info("[SelfBuild] Tool created:", {
        name,
        tenantId,
        handlerType,
        reason,
      });
      return (
        `Tool "dyn_${name}" zbudowany i zarejestrowany. ` +
        `Opis: ${description}. Możesz go teraz użyć wywołując dyn_${name}.`
      );
    },
  },

  {
    definition: {
      name: "list_dynamic_tools",
      description:
        "Wylistuj dynamiczne narzędzia zbudowane w runtime dla tego użytkownika.",
      input_schema: {
        type: "object" as const,
        properties: {
          include_disabled: {
            type: "boolean",
            description:
              "Czy pokazać też wyłączone narzędzia (domyślnie: false)",
          },
        },
        required: [],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const supabase = getServiceSupabase();
      let query = supabase
        .from("exo_dynamic_tools")
        .select("name, description, handler_type, enabled, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!input.include_disabled) {
        query = query.eq("enabled", true);
      }

      const { data, error } = await query;
      if (error) return `Error: ${error.message}`;
      if (!data || data.length === 0)
        return "Brak dynamicznych narzędzi. Użyj build_tool aby zbudować nowe.";

      return data
        .map(
          (t) =>
            `- dyn_${t.name} [${t.handler_type}] ${t.enabled ? "✓" : "✗"}: ${t.description}`,
        )
        .join("\n");
    },
  },

  {
    definition: {
      name: "disable_tool",
      description:
        "Wyłącz dynamiczne narzędzie (nie usuwa, można ponownie włączyć).",
      input_schema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Nazwa toola do wyłączenia (bez prefiksu dyn_)",
          },
        },
        required: ["name"],
      },
    },
    execute: async (
      input: Record<string, unknown>,
      tenantId: string,
    ): Promise<string> => {
      const name = input.name as string;
      const supabase = getServiceSupabase();

      const { error, count } = await supabase
        .from("exo_dynamic_tools")
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("name", name);

      if (error) return `Error: ${error.message}`;
      if (count === 0) return `Tool "${name}" nie znaleziony.`;

      invalidateDynamicToolCache(tenantId);
      return `Tool "dyn_${name}" wyłączony.`;
    },
  },
];

function validateHandlerConfig(
  handlerType: string,
  config: Record<string, unknown>,
): string | null {
  switch (handlerType) {
    case "app_crud": {
      const table = config.table_name as string;
      if (!table) return "app_crud wymaga table_name w handler_config";
      if (!table.startsWith("exo_app_"))
        return "app_crud dozwolone tylko na tabelach exo_app_* (bezpieczeństwo)";
      return null;
    }
    case "query": {
      const table = config.table_name as string;
      if (!table) return "query wymaga table_name w handler_config";
      if (!table.startsWith("exo_"))
        return "query dozwolone tylko na tabelach exo_* (bezpieczeństwo)";
      return null;
    }
    case "composite": {
      const steps = config.steps as unknown[];
      if (!steps || !Array.isArray(steps) || steps.length === 0)
        return "composite wymaga steps[] w handler_config";
      if (steps.length > 5) return "composite: max 5 kroków";
      return null;
    }
    default:
      return `Nieznany handler_type: ${handlerType}`;
  }
}
