/**
 * IORS Canvas Tools
 *
 * Tools for managing dashboard widgets through conversation.
 * IORS can add, remove, show, or hide widgets on the user's canvas.
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
export const canvasTools: ToolDefinition[] = [
  {
    definition: {
      name: "manage_canvas",
      description:
        "Zarzadzaj widgetami na dashboardzie uzytkownika. Dodaj, usun, pokaz lub ukryj widget. Uzywaj gdy uzytkownik mowi o dashboardzie, widgetach, lub chce zmienic uklad.",
      input_schema: {
        type: "object" as const,
        properties: {
          action: {
            type: "string",
            enum: ["add", "remove", "show", "hide"],
            description:
              "Akcja: add=dodaj, remove=usun, show=pokaz, hide=ukryj",
          },
          widget_type: {
            type: "string",
            description:
              "Typ widgetu: voice_hero, health, tasks, calendar, conversations, emotional, guardian, quick_actions, integrations, email_inbox, knowledge, iors_status, dynamic_mod:{slug}",
          },
          widget_id: {
            type: "string",
            description:
              "ID widgetu (wymagane dla remove/show/hide, opcjonalne dla add)",
          },
          title: {
            type: "string",
            description: "Opcjonalny tytul widgetu",
          },
        },
        required: ["action", "widget_type"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const action = input.action as string;
      const widgetType = input.widget_type as string;
      const widgetId = input.widget_id as string | undefined;
      const title = input.title as string | undefined;

      try {
        switch (action) {
          case "add": {
            // Check if non-mod widget already exists
            if (!widgetType.startsWith("dynamic_mod:")) {
              const { data: existing } = await supabase
                .from("exo_canvas_widgets")
                .select("id")
                .eq("tenant_id", tenantId)
                .eq("widget_type", widgetType)
                .maybeSingle();

              if (existing) {
                // Already exists — just make visible
                await supabase
                  .from("exo_canvas_widgets")
                  .update({
                    visible: true,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existing.id);
                return `Widget ${widgetType} juz istnieje — pokazalem go na dashboardzie.`;
              }
            }

            const modSlug = widgetType.startsWith("dynamic_mod:")
              ? widgetType.replace("dynamic_mod:", "")
              : null;

            const { error } = await supabase.from("exo_canvas_widgets").insert({
              tenant_id: tenantId,
              widget_type: widgetType,
              title: title || null,
              mod_slug: modSlug,
              position_x: 0,
              position_y: 100, // auto-place at bottom
              size_w: 2,
              size_h: 2,
              created_by: "iors_proposed",
            });

            if (error) {
              logger.error("[CanvasTools] Add failed:", {
                tenantId,
                widgetType,
                error: error.message,
              });
              return "Nie udalo sie dodac widgetu. Sprobuj ponownie.";
            }
            return `Dodalem widget ${title || widgetType} na Twoj dashboard.`;
          }

          case "remove": {
            const id =
              widgetId || (await findWidgetId(supabase, tenantId, widgetType));
            if (!id)
              return `Nie znalazlem widgetu ${widgetType} na dashboardzie.`;

            const { data: widget } = await supabase
              .from("exo_canvas_widgets")
              .select("pinned")
              .eq("id", id)
              .eq("tenant_id", tenantId)
              .single();

            if (widget?.pinned) {
              return "Ten widget jest przypierty i nie mozna go usunac.";
            }

            await supabase
              .from("exo_canvas_widgets")
              .delete()
              .eq("id", id)
              .eq("tenant_id", tenantId);

            return `Usuniety widget ${widgetType} z dashboardu.`;
          }

          case "show": {
            const id =
              widgetId ||
              (await findWidgetId(supabase, tenantId, widgetType, false));
            if (!id) return `Nie znalazlem ukrytego widgetu ${widgetType}.`;

            await supabase
              .from("exo_canvas_widgets")
              .update({ visible: true, updated_at: new Date().toISOString() })
              .eq("id", id)
              .eq("tenant_id", tenantId);

            return `Widget ${widgetType} jest teraz widoczny.`;
          }

          case "hide": {
            const id =
              widgetId || (await findWidgetId(supabase, tenantId, widgetType));
            if (!id) return `Nie znalazlem widgetu ${widgetType}.`;

            const { data: widget } = await supabase
              .from("exo_canvas_widgets")
              .select("pinned")
              .eq("id", id)
              .eq("tenant_id", tenantId)
              .single();

            if (widget?.pinned) {
              return "Ten widget jest przypierty i nie mozna go ukryc.";
            }

            await supabase
              .from("exo_canvas_widgets")
              .update({ visible: false, updated_at: new Date().toISOString() })
              .eq("id", id)
              .eq("tenant_id", tenantId);

            return `Widget ${widgetType} ukryty.`;
          }

          default:
            return `Nieznana akcja: ${action}. Uzyj: add, remove, show, hide.`;
        }
      } catch (error) {
        logger.error("[manage_canvas] Error:", {
          action,
          widgetType,
          tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
        return "Wystapil blad przy zarzadzaniu widgetami. Sprobuj ponownie.";
      }
    },
  },
];

/** Find a widget ID by type for the given tenant */
async function findWidgetId(
  supabase: ReturnType<typeof getServiceSupabase>,
  tenantId: string,
  widgetType: string,
  visibleOnly = true,
): Promise<string | null> {
  const query = supabase
    .from("exo_canvas_widgets")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("widget_type", widgetType);

  if (visibleOnly) query.eq("visible", true);

  const { data } = await query.maybeSingle();
  return data?.id || null;
}
