/**
 * Value Hierarchy IORS Tools
 *
 * Manage user-defined core values and the full hierarchy:
 * Values > Areas (Loops) > Quests > Missions > Ops > Notes
 */

import type { ToolDefinition } from "./index";
import { getServiceSupabase } from "@/lib/supabase/service";

export const valueTools: ToolDefinition[] = [
  // =========================================================================
  // LIST VALUES
  // =========================================================================
  {
    definition: {
      name: "list_values",
      description:
        "Pokaz wartosci zyciowe uzytkownika — co jest dla niego najwazniejsze. Kazda wartosc ma powiazane obszary (loops) i questy.",
      input_schema: {
        type: "object" as const,
        properties: {
          include_loops: {
            type: "boolean",
            description:
              "Czy uwzglednic powiazane petle/obszary (domyslnie: true)",
            default: true,
          },
          include_quests: {
            type: "boolean",
            description: "Czy uwzglednic questy pod kazdym obszarem",
            default: false,
          },
        },
        required: [],
      },
    },
    execute: async (_input, tenantId) => {
      const supabase = getServiceSupabase();
      const includeLoops = _input.include_loops !== false;
      const includeQuests = _input.include_quests === true;

      const { data: values, error } = await supabase
        .from("exo_values")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("priority", { ascending: false });

      if (error) {
        console.error("[list_values] Failed:", {
          error: error.message,
          tenantId,
        });
        return `Blad pobierania wartosci: ${error.message}`;
      }

      if (!values || values.length === 0) {
        return "Brak zdefiniowanych wartosci. Uzyj create_value aby dodac swoja pierwsza wartosc.";
      }

      let result = `**Twoje wartosci (${values.length}):**\n\n`;

      for (const v of values) {
        result += `${v.icon || "***"} **${v.name}** (priorytet: ${v.priority}/10)`;
        if (v.description) result += `\n   ${v.description}`;

        if (includeLoops) {
          const { data: loops } = await supabase
            .from("user_loops")
            .select("id, name, slug, icon")
            .eq("tenant_id", tenantId)
            .eq("value_id", v.id)
            .eq("is_active", true);

          if (loops && loops.length > 0) {
            const loopDetails: string[] = [];
            for (const l of loops) {
              let loopStr = `${l.icon || ""} ${l.name}`;

              if (includeQuests) {
                const { data: quests } = await supabase
                  .from("user_quests")
                  .select("title, status")
                  .eq("tenant_id", tenantId)
                  .or(`loop_id.eq.${l.id},loop_slug.eq.${l.slug}`)
                  .in("status", ["active", "draft"]);

                if (quests && quests.length > 0) {
                  const questNames = quests.map((q) => q.title).join(", ");
                  loopStr += ` [${quests.length} questy: ${questNames}]`;
                }
              }

              loopDetails.push(loopStr);
            }
            result += `\n   Obszary: ${loopDetails.join("; ")}`;
          }
        }
        result += "\n\n";
      }

      return result.trim();
    },
  },

  // =========================================================================
  // CREATE VALUE
  // =========================================================================
  {
    definition: {
      name: "create_value",
      description:
        "Stworz nowa wartosc zyciowa dla uzytkownika. Wartosci to najwyzszy poziom hierarchii — definiuja co jest wazne.",
      input_schema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Nazwa wartosci, np. 'Zdrowie', 'Rodzina', 'Kariera'",
          },
          description: {
            type: "string",
            description: "Krotki opis wartosci",
          },
          icon: {
            type: "string",
            description:
              "Emoji ikona, np. '&#x1F49A;', '&#x1F468;&#x200D;&#x1F469;&#x200D;&#x1F467;', '&#x1F4BC;'",
          },
          color: {
            type: "string",
            description: "Kolor hex, np. '#10B981'",
          },
          priority: {
            type: "number",
            description: "Priorytet 1-10 (10=najwyzszy)",
            default: 5,
          },
          loop_slugs: {
            type: "array",
            items: { type: "string" },
            description:
              "Slugi petli do powiazania z ta wartoscia, np. ['health', 'fun']",
          },
        },
        required: ["name"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();

      const { data, error } = await supabase
        .from("exo_values")
        .insert({
          tenant_id: tenantId,
          name: input.name as string,
          description: (input.description as string) || null,
          icon: (input.icon as string) || null,
          color: (input.color as string) || null,
          priority: (input.priority as number) || 5,
          is_default: false,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return `Wartosc "${input.name}" juz istnieje.`;
        }
        console.error("[create_value] Failed:", {
          error: error.message,
          tenantId,
          name: input.name,
        });
        return `Blad tworzenia wartosci: ${error.message}`;
      }

      // Link loops if specified
      const loopSlugs = input.loop_slugs as string[] | undefined;
      if (loopSlugs && loopSlugs.length > 0 && data) {
        await supabase
          .from("user_loops")
          .update({ value_id: data.id, updated_at: new Date().toISOString() })
          .eq("tenant_id", tenantId)
          .in("slug", loopSlugs);
      }

      return `Utworzono wartosc: ${data.icon || "***"} **${data.name}** (priorytet: ${data.priority}/10)${loopSlugs?.length ? `. Powiazano z obszarami: ${loopSlugs.join(", ")}` : ""}`;
    },
  },

  // =========================================================================
  // UPDATE VALUE
  // =========================================================================
  {
    definition: {
      name: "update_value",
      description:
        "Zaktualizuj istniejaca wartosc zyciowa — zmien nazwe, priorytet, opis, kolor lub ikone.",
      input_schema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Obecna nazwa wartosci do znalezienia",
          },
          new_name: {
            type: "string",
            description: "Nowa nazwa (jesli zmieniamy)",
          },
          priority: {
            type: "number",
            description: "Nowy priorytet 1-10",
          },
          description: {
            type: "string",
            description: "Nowy opis",
          },
          icon: {
            type: "string",
            description: "Nowa ikona emoji",
          },
          color: {
            type: "string",
            description: "Nowy kolor hex",
          },
        },
        required: ["name"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();

      // Find value by name
      const { data: existing } = await supabase
        .from("exo_values")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .eq("name", input.name as string)
        .single();

      if (!existing) {
        return `Nie znaleziono wartosci o nazwie "${input.name}".`;
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.new_name) updates.name = input.new_name;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.description !== undefined)
        updates.description = input.description;
      if (input.icon !== undefined) updates.icon = input.icon;
      if (input.color !== undefined) updates.color = input.color;

      const { error } = await supabase
        .from("exo_values")
        .update(updates)
        .eq("id", existing.id)
        .eq("tenant_id", tenantId);

      if (error) {
        console.error("[update_value] Failed:", {
          error: error.message,
          tenantId,
          valueId: existing.id,
        });
        return `Blad aktualizacji: ${error.message}`;
      }

      return `Zaktualizowano wartosc "${input.name}"${input.new_name ? ` -> "${input.new_name}"` : ""}.`;
    },
  },

  // =========================================================================
  // LINK AREA TO VALUE
  // =========================================================================
  {
    definition: {
      name: "link_area_to_value",
      description:
        "Powiaz obszar (petla/loop) z wartoscia. Kazdy obszar powinien nalezec do jednej wartosci.",
      input_schema: {
        type: "object" as const,
        properties: {
          value_name: {
            type: "string",
            description: "Nazwa wartosci",
          },
          loop_slug: {
            type: "string",
            description:
              "Slug petli/obszaru do powiazania, np. 'health', 'work'",
          },
        },
        required: ["value_name", "loop_slug"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();

      // Find value
      const { data: value } = await supabase
        .from("exo_values")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .eq("name", input.value_name as string)
        .single();

      if (!value) {
        return `Nie znaleziono wartosci "${input.value_name}".`;
      }

      // Update loop
      const { data: loop, error } = await supabase
        .from("user_loops")
        .update({
          value_id: value.id,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("slug", input.loop_slug as string)
        .select("name, slug")
        .single();

      if (error || !loop) {
        return `Nie znaleziono obszaru "${input.loop_slug}" lub blad powiazania.`;
      }

      return `Powiazano obszar "${loop.name}" (${loop.slug}) z wartoscia "${value.name}".`;
    },
  },

  // =========================================================================
  // CREATE AREA (LOOP)
  // =========================================================================
  {
    definition: {
      name: "create_area",
      description:
        "Stworz nowy obszar zyciowy (petla/loop). Opcjonalnie powiaz z wartoscia.",
      input_schema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "Nazwa obszaru, np. 'Sport', 'Side Project'",
          },
          slug: {
            type: "string",
            description:
              "Slug (lowercase, bez spacji), np. 'sport', 'side_project'",
          },
          value_name: {
            type: "string",
            description: "Nazwa wartosci do powiazania (opcjonalnie)",
          },
          icon: {
            type: "string",
            description: "Emoji ikona",
          },
          color: {
            type: "string",
            description: "Kolor hex",
          },
          priority: {
            type: "number",
            description: "Priorytet 1-10",
            default: 5,
          },
        },
        required: ["name", "slug"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();

      // Find value if specified
      let valueId: string | null = null;
      if (input.value_name) {
        const { data: value } = await supabase
          .from("exo_values")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("name", input.value_name as string)
          .single();
        valueId = value?.id ?? null;
      }

      const { data, error } = await supabase
        .from("user_loops")
        .insert({
          tenant_id: tenantId,
          slug: input.slug as string,
          name: input.name as string,
          icon: (input.icon as string) || null,
          color: (input.color as string) || null,
          priority: (input.priority as number) || 5,
          value_id: valueId,
          is_default: false,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return `Obszar "${input.slug}" juz istnieje.`;
        }
        console.error("[create_area] Failed:", {
          error: error.message,
          tenantId,
          slug: input.slug,
        });
        return `Blad tworzenia obszaru: ${error.message}`;
      }

      return `Utworzono obszar: ${data.icon || ""} **${data.name}** (${data.slug})${valueId ? " — powiazany z wartoscia" : ""}`;
    },
  },

  // =========================================================================
  // CREATE MISSION
  // =========================================================================
  {
    definition: {
      name: "create_mission",
      description:
        "Stworz nowa misje (projekt) w ramach questa. Misje grupuja zadania (ops) w logiczna calosc.",
      input_schema: {
        type: "object" as const,
        properties: {
          quest_title: {
            type: "string",
            description: "Tytul questa, do ktorego nalezy misja",
          },
          title: {
            type: "string",
            description: "Tytul misji",
          },
          description: {
            type: "string",
            description: "Opis misji",
          },
          target_date: {
            type: "string",
            description: "Termin ukonczenia (YYYY-MM-DD)",
          },
        },
        required: ["title"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();

      // Find quest if specified
      let questId: string | null = null;
      let loopSlug: string | null = null;

      if (input.quest_title) {
        const { data: quest } = await supabase
          .from("user_quests")
          .select("id, loop_slug")
          .eq("tenant_id", tenantId)
          .ilike("title", `%${input.quest_title as string}%`)
          .in("status", ["active", "draft"])
          .limit(1)
          .single();

        if (quest) {
          questId = quest.id;
          loopSlug = quest.loop_slug;
        }
      }

      const { data, error } = await supabase
        .from("user_missions")
        .insert({
          tenant_id: tenantId,
          quest_id: questId,
          title: input.title as string,
          description: (input.description as string) || null,
          loop_slug: loopSlug,
          target_date: (input.target_date as string) || null,
          status: "active",
        })
        .select()
        .single();

      if (error) {
        console.error("[create_mission] Failed:", {
          error: error.message,
          tenantId,
          title: input.title,
        });
        return `Blad tworzenia misji: ${error.message}`;
      }

      return `Utworzono misje: **${data.title}**${questId ? " (w ramach questa)" : ""}`;
    },
  },

  // =========================================================================
  // CREATE CHALLENGE
  // =========================================================================
  {
    definition: {
      name: "create_challenge",
      description:
        "Stworz nowe wyzwanie (challenge) w ramach misji. Wyzwania to konkretne zadania do wykonania.",
      input_schema: {
        type: "object" as const,
        properties: {
          mission_title: {
            type: "string",
            description: "Tytul misji, do ktorej nalezy wyzwanie",
          },
          quest_title: {
            type: "string",
            description:
              "Tytul questa, jesli brak misji — wyzwanie podpinamy do questa",
          },
          title: {
            type: "string",
            description: "Tytul wyzwania",
          },
          description: {
            type: "string",
            description: "Opis wyzwania",
          },
          difficulty: {
            type: "number",
            description: "Trudnosc 1-5 (1=latwe, 5=trudne)",
            default: 1,
          },
          due_date: {
            type: "string",
            description: "Termin (YYYY-MM-DD)",
          },
          is_recurring: {
            type: "boolean",
            description: "Czy powtarzalne (daily/weekly)",
            default: false,
          },
          recurrence_pattern: {
            type: "string",
            description: "Wzorzec: 'daily', 'weekly', 'monthly'",
          },
        },
        required: ["title"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();

      let missionId: string | null = null;
      let questId: string | null = null;
      let loopSlug: string | null = null;

      // Find mission if specified
      if (input.mission_title) {
        const { data: mission } = await supabase
          .from("user_missions")
          .select("id, quest_id, loop_slug")
          .eq("tenant_id", tenantId)
          .ilike("title", `%${input.mission_title as string}%`)
          .in("status", ["active", "draft"])
          .limit(1)
          .single();

        if (mission) {
          missionId = mission.id;
          questId = mission.quest_id;
          loopSlug = mission.loop_slug;
        }
      }

      // Find quest if no mission but quest specified
      if (!missionId && input.quest_title) {
        const { data: quest } = await supabase
          .from("user_quests")
          .select("id, loop_slug")
          .eq("tenant_id", tenantId)
          .ilike("title", `%${input.quest_title as string}%`)
          .in("status", ["active", "draft"])
          .limit(1)
          .single();

        if (quest) {
          questId = quest.id;
          loopSlug = quest.loop_slug;
        }
      }

      const { data, error } = await supabase
        .from("user_challenges")
        .insert({
          tenant_id: tenantId,
          mission_id: missionId,
          quest_id: questId,
          title: input.title as string,
          description: (input.description as string) || null,
          difficulty: (input.difficulty as number) || 1,
          due_date: (input.due_date as string) || null,
          is_recurring: (input.is_recurring as boolean) || false,
          recurrence_pattern: (input.recurrence_pattern as string) || null,
          loop_slug: loopSlug,
          status: "active",
        })
        .select()
        .single();

      if (error) {
        console.error("[create_challenge] Failed:", {
          error: error.message,
          tenantId,
          title: input.title,
        });
        return `Blad tworzenia wyzwania: ${error.message}`;
      }

      return `Utworzono wyzwanie: **${data.title}** (trudnosc: ${data.difficulty}/5)${missionId ? " — w ramach misji" : questId ? " — w ramach questa" : ""}`;
    },
  },

  // =========================================================================
  // CREATE NOTE IN HIERARCHY
  // =========================================================================
  {
    definition: {
      name: "create_note_in_hierarchy",
      description:
        "Dodaj notatke polaczona z hierarchia wartosci — moze byc przypisana do wartosci, obszaru, questa, misji lub wyzwania.",
      input_schema: {
        type: "object" as const,
        properties: {
          content: {
            type: "string",
            description: "Tresc notatki",
          },
          title: {
            type: "string",
            description: "Tytul notatki (opcjonalny)",
          },
          value_name: {
            type: "string",
            description: "Nazwa wartosci do powiazania",
          },
          loop_slug: {
            type: "string",
            description: "Slug obszaru do powiazania",
          },
          quest_title: {
            type: "string",
            description: "Tytul questa do powiazania",
          },
          mission_title: {
            type: "string",
            description: "Tytul misji do powiazania",
          },
          challenge_title: {
            type: "string",
            description: "Tytul wyzwania do powiazania",
          },
        },
        required: ["content"],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();

      // Resolve hierarchy IDs
      let valueId: string | null = null;
      let loopId: string | null = null;
      let questId: string | null = null;
      let missionId: string | null = null;
      let challengeId: string | null = null;

      if (input.value_name) {
        const { data } = await supabase
          .from("exo_values")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("name", input.value_name as string)
          .single();
        valueId = data?.id ?? null;
      }

      if (input.loop_slug) {
        const { data } = await supabase
          .from("user_loops")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("slug", input.loop_slug as string)
          .single();
        loopId = data?.id ?? null;
      }

      if (input.quest_title) {
        const { data } = await supabase
          .from("user_quests")
          .select("id")
          .eq("tenant_id", tenantId)
          .ilike("title", `%${input.quest_title as string}%`)
          .limit(1)
          .single();
        questId = data?.id ?? null;
      }

      if (input.mission_title) {
        const { data } = await supabase
          .from("user_missions")
          .select("id")
          .eq("tenant_id", tenantId)
          .ilike("title", `%${input.mission_title as string}%`)
          .limit(1)
          .single();
        missionId = data?.id ?? null;
      }

      if (input.challenge_title) {
        const { data } = await supabase
          .from("user_challenges")
          .select("id")
          .eq("tenant_id", tenantId)
          .ilike("title", `%${input.challenge_title as string}%`)
          .limit(1)
          .single();
        challengeId = data?.id ?? null;
      }

      const { data: note, error } = await supabase
        .from("user_notes")
        .insert({
          tenant_id: tenantId,
          title: (input.title as string) || null,
          content: input.content as string,
          source: "iors",
          value_id: valueId,
          loop_id: loopId,
          quest_id: questId,
          mission_id: missionId,
          challenge_id: challengeId,
        })
        .select("id")
        .single();

      if (error) {
        console.error("[create_note_in_hierarchy] Failed:", {
          error: error.message,
          tenantId,
        });
        return `Blad tworzenia notatki: ${error.message}`;
      }

      const links: string[] = [];
      if (valueId) links.push("wartosc");
      if (loopId) links.push("obszar");
      if (questId) links.push("quest");
      if (missionId) links.push("misja");
      if (challengeId) links.push("wyzwanie");

      return `Notatka dodana (${note.id.substring(0, 8)}...)${links.length > 0 ? ` — powiazana z: ${links.join(", ")}` : ""}`;
    },
  },

  // =========================================================================
  // GET VALUE HIERARCHY (full tree)
  // =========================================================================
  {
    definition: {
      name: "get_value_hierarchy",
      description:
        "Pokaz pelna hierarchie wartosci uzytkownika: Wartosci > Obszary > Questy > Misje > Wyzwania. Uzywaj do przegladu calej struktury.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    execute: async (_input, tenantId) => {
      const supabase = getServiceSupabase();

      // Try the full hierarchy RPC first (most efficient, includes challenges)
      try {
        const { data: hierarchy, error } = await supabase.rpc(
          "get_value_hierarchy_full",
          { p_tenant_id: tenantId },
        );

        if (
          !error &&
          hierarchy &&
          Array.isArray(hierarchy) &&
          hierarchy.length > 0
        ) {
          let result = "**Hierarchia wartosci:**\n\n";

          for (const v of hierarchy) {
            result += `${v.icon || "***"} **${v.name}** (${v.priority}/10)`;
            if (v.notes_count > 0) result += ` [${v.notes_count} notatek]`;
            result += "\n";

            if (v.loops && v.loops.length > 0) {
              for (const l of v.loops) {
                result += `  ${l.icon || ""} ${l.name}`;
                if (l.notes_count > 0) result += ` [${l.notes_count} notatek]`;
                result += "\n";

                if (l.quests && l.quests.length > 0) {
                  for (const q of l.quests) {
                    result += `    -> ${q.title} [${q.status}]`;
                    if (q.ops_count > 0) result += ` (${q.ops_count} zadan)`;
                    if (q.notes_count > 0)
                      result += ` [${q.notes_count} notatek]`;
                    result += "\n";

                    if (q.missions && q.missions.length > 0) {
                      for (const m of q.missions) {
                        result += `       * ${m.title} [${m.status}]`;
                        if (m.total_ops > 0)
                          result += ` (${m.completed_ops}/${m.total_ops})`;
                        result += "\n";

                        // Challenges
                        if (m.challenges && m.challenges.length > 0) {
                          for (const c of m.challenges) {
                            result += `         ! ${c.title} [${c.status}]`;
                            if (c.difficulty > 1)
                              result += ` (trudnosc: ${c.difficulty}/5)`;
                            if (c.due_date)
                              result += ` (termin: ${c.due_date})`;
                            if (c.notes_count > 0)
                              result += ` [${c.notes_count} notatek]`;
                            result += "\n";
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            result += "\n";
          }

          return result.trim();
        }
      } catch (rpcErr) {
        // RPC might not exist yet — fall back to old RPC or manual
        console.warn("[get_value_hierarchy] Full RPC fallback:", rpcErr);
      }

      // Try old RPC
      try {
        const { data: hierarchy, error } = await supabase.rpc(
          "get_value_hierarchy",
          { p_tenant_id: tenantId },
        );

        if (
          !error &&
          hierarchy &&
          Array.isArray(hierarchy) &&
          hierarchy.length > 0
        ) {
          let result = "**Hierarchia wartosci:**\n\n";

          for (const v of hierarchy) {
            result += `${v.icon || "***"} **${v.name}** (${v.priority}/10)\n`;

            if (v.loops && v.loops.length > 0) {
              for (const l of v.loops) {
                result += `  ${l.icon || ""} ${l.name}\n`;

                if (l.quests && l.quests.length > 0) {
                  for (const q of l.quests) {
                    result += `    -> ${q.title} [${q.status}]`;
                    if (q.ops_count > 0) result += ` (${q.ops_count} zadan)`;
                    result += "\n";

                    if (q.missions && q.missions.length > 0) {
                      for (const m of q.missions) {
                        result += `       * ${m.title} [${m.status}]`;
                        if (m.total_ops > 0)
                          result += ` (${m.completed_ops}/${m.total_ops})`;
                        result += "\n";
                      }
                    }
                  }
                }
              }
            }
            result += "\n";
          }

          return result.trim();
        }
      } catch (rpcErr) {
        console.warn("[get_value_hierarchy] Old RPC fallback:", rpcErr);
      }

      // Fallback: manual query
      const { data: values } = await supabase
        .from("exo_values")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("priority", { ascending: false });

      if (!values || values.length === 0) {
        return "Brak wartosci. Porozmawiaj z IORS o tym, co jest dla Ciebie najwazniejsze.";
      }

      let result = `**Hierarchia wartosci (${values.length}):**\n\n`;

      for (const v of values) {
        result += `${v.icon || "***"} **${v.name}** (${v.priority}/10)\n`;

        const { data: loops } = await supabase
          .from("user_loops")
          .select("id, name, slug, icon")
          .eq("tenant_id", tenantId)
          .eq("value_id", v.id)
          .eq("is_active", true);

        if (loops && loops.length > 0) {
          for (const l of loops) {
            result += `  ${l.icon || ""} ${l.name}\n`;

            const { data: quests } = await supabase
              .from("user_quests")
              .select("title, status")
              .eq("tenant_id", tenantId)
              .or(`loop_id.eq.${l.id},loop_slug.eq.${l.slug}`)
              .in("status", ["active", "draft"]);

            if (quests && quests.length > 0) {
              for (const q of quests) {
                result += `    -> ${q.title} [${q.status}]\n`;
              }
            }
          }
        }
        result += "\n";
      }

      return result.trim();
    },
  },

  // =========================================================================
  // SEED HIERARCHY (init defaults + starter quests)
  // =========================================================================
  {
    definition: {
      name: "seed_hierarchy",
      description:
        "Zainicjalizuj domyslna hierarchie wartosci dla uzytkownika — tworzy wartosci, obszary i startowe questy.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    execute: async (_input, tenantId) => {
      const supabase = getServiceSupabase();

      try {
        // Try RPC (creates values + loops + links + starter quests)
        const { error } = await supabase.rpc("seed_value_hierarchy", {
          p_tenant_id: tenantId,
        });

        if (error) {
          // Fallback: just create defaults
          await supabase.rpc("create_default_values", {
            p_tenant_id: tenantId,
          });
          await supabase.rpc("create_default_loops", { p_tenant_id: tenantId });
          await supabase.rpc("link_default_values_to_loops", {
            p_tenant_id: tenantId,
          });
        }
      } catch (err) {
        console.error("[seed_hierarchy] Failed:", {
          error: err instanceof Error ? err.message : err,
          tenantId,
        });
        return "Blad inicjalizacji hierarchii. Sprobuj ponownie.";
      }

      // Count what was created
      const { count: valuesCount } = await supabase
        .from("exo_values")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);

      const { count: loopsCount } = await supabase
        .from("user_loops")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("is_active", true);

      const { count: questsCount } = await supabase
        .from("user_quests")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["active", "draft"]);

      return `Hierarchia zainicjalizowana: ${valuesCount || 0} wartosci, ${loopsCount || 0} obszarow, ${questsCount || 0} questow. Mozesz teraz dostosowac ja do swoich potrzeb.`;
    },
  },
];
