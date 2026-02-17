/**
 * IORS Mod Tools
 *
 * Tools for managing mods (tracking modules) via conversation.
 * - log_mod_data: Write data to a mod
 * - get_mod_data: Read data from a mod
 * - install_mod: Install an existing mod template
 * - create_mod: Create a custom mod on-the-fly
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";

export const modTools: ToolDefinition[] = [
  {
    definition: {
      name: "log_mod_data",
      description:
        "Zapisz dane do zainstalowanego Moda (np. sen, nastrój, trening, wydatek). Użyj gdy user mówi o czymś co pasuje do jego Modów.",
      input_schema: {
        type: "object" as const,
        properties: {
          mod_slug: {
            type: "string",
            description:
              "Slug Moda: sleep-tracker, mood-tracker, exercise-logger, habit-tracker, food-logger, water-tracker, reading-log, finance-monitor, social-tracker, journal, goal-setter, weekly-review",
          },
          data: {
            type: "object",
            description:
              "Dane do zapisania (zależne od Moda). Np. sleep-tracker: {hours: 7, quality: 8}, mood-tracker: {mood: 7, energy: 6}",
          },
        },
        required: ["mod_slug", "data"],
      },
    },
    execute: async (input, tenantId) => {
      const modSlug = input.mod_slug as string;
      const data = input.data;

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return `Błąd: dane muszą być obiektem (np. {hours: 7, quality: 8}), otrzymano: ${typeof data}`;
      }

      if (Object.keys(data as Record<string, unknown>).length === 0) {
        return `Błąd: dane nie mogą być pustym obiektem`;
      }

      const supabase = getServiceSupabase();
      const { error } = await supabase.from("exo_mod_data").insert({
        tenant_id: tenantId,
        mod_slug: modSlug,
        data,
      });

      if (error) {
        console.error("[ModTools] log_mod_data error:", {
          error,
          modSlug,
          tenantId,
        });
        return `Błąd: nie udało się zapisać danych do ${modSlug}: ${error.message}`;
      }

      return `Zapisano dane do ${modSlug}`;
    },
  },
  {
    definition: {
      name: "get_mod_data",
      description:
        'Pobierz ostatnie dane z Moda. Użyj gdy user pyta o swoje dane (np. "ile spałem", "jaki był mój nastrój").',
      input_schema: {
        type: "object" as const,
        properties: {
          mod_slug: {
            type: "string",
            description: "Slug Moda z którego pobrać dane",
          },
          limit: {
            type: "number",
            description: "Ile ostatnich wpisów pobrać (domyślnie 5)",
            default: 5,
          },
        },
        required: ["mod_slug"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const limit = (input.limit as number) || 5;
      const { data: entries, error } = await supabase
        .from("exo_mod_data")
        .select("data, created_at")
        .eq("tenant_id", tenantId)
        .eq("mod_slug", input.mod_slug as string)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error || !entries || entries.length === 0) {
        return `Brak danych w ${input.mod_slug}`;
      }

      const summary = entries
        .map((e) => {
          const values = Object.entries(e.data as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
          return values;
        })
        .join(" | ");

      return `Ostatnie ${entries.length} wpisów (${input.mod_slug}): ${summary}`;
    },
  },
  {
    definition: {
      name: "install_mod",
      description:
        'Zainstaluj nowy Mod. Użyj gdy user chce śledzić coś nowego (np. "chcę śledzić czytanie" → install reading-log).',
      input_schema: {
        type: "object" as const,
        properties: {
          mod_slug: {
            type: "string",
            description: "Slug Moda do zainstalowania",
          },
        },
        required: ["mod_slug"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const modSlug = input.mod_slug as string;

      const { data: existing } = await supabase
        .from("exo_mod_registry")
        .select("id")
        .eq("slug", modSlug)
        .single();

      if (!existing) {
        return `Mod "${modSlug}" nie istnieje`;
      }

      const { error } = await supabase.from("exo_tenant_mods").upsert(
        {
          tenant_id: tenantId,
          mod_id: existing.id,
          active: true,
        },
        { onConflict: "tenant_id,mod_id" },
      );

      if (error) {
        console.error("[ModTools] install_mod error:", error);
        return `Błąd: nie udało się zainstalować Moda`;
      }

      return `Zainstalowano Mod: ${modSlug}`;
    },
  },
  {
    definition: {
      name: "create_mod",
      description:
        "Stwórz nowy, niestandardowy Mod (moduł śledzenia) dla usera. Użyj gdy user chce śledzić coś, czego nie ma w standardowych Modach. Np. 'chcę śledzić kawę' → create_mod slug=caffeine-tracker.",
      input_schema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Nazwa wyświetlana (np. 'Caffeine Tracker')",
          },
          slug: {
            type: "string",
            description: "Slug (lowercase, hyphens, np. 'caffeine-tracker')",
          },
          description: {
            type: "string",
            description: "Krótki opis co Mod śledzi",
          },
          category: {
            type: "string",
            enum: [
              "health",
              "productivity",
              "finance",
              "relationships",
              "growth",
              "custom",
            ],
            description: "Kategoria Moda",
          },
          icon: {
            type: "string",
            description: "Emoji ikona (np. '☕')",
          },
        },
        required: ["name", "slug", "description", "category"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const slug = (input.slug as string).toLowerCase().replace(/\s+/g, "-");

      // Check if slug already exists
      const { data: existing } = await supabase
        .from("exo_mod_registry")
        .select("id")
        .eq("slug", slug)
        .single();

      if (existing) {
        // Already exists — just install it
        await supabase
          .from("exo_tenant_mods")
          .upsert(
            { tenant_id: tenantId, mod_id: existing.id, active: true },
            { onConflict: "tenant_id,mod_id" },
          );
        return `Mod "${slug}" już istnieje — zainstalowano.`;
      }

      // Create in registry
      const { data: newMod, error: createError } = await supabase
        .from("exo_mod_registry")
        .insert({
          slug,
          name: input.name as string,
          description: input.description as string,
          category: input.category as string,
          icon: (input.icon as string) || "📊",
          is_template: false,
        })
        .select("id")
        .single();

      if (createError || !newMod) {
        console.error("[ModTools] create_mod error:", createError);
        return `Nie udało się stworzyć Moda: ${createError?.message}`;
      }

      // Auto-install for the user
      await supabase.from("exo_tenant_mods").insert({
        tenant_id: tenantId,
        mod_id: newMod.id,
        active: true,
      });

      return `Stworzono i zainstalowano nowy Mod: ${input.name} (${slug})`;
    },
  },
];
