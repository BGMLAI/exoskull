/**
 * IORS Goal Strategy Tools
 *
 * Tools for viewing and managing goal strategies via conversation.
 * Enables the chat agent to approve/pause strategies when user says "tak"/"stop".
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

export const goalStrategyTools: ToolDefinition[] = [
  {
    definition: {
      name: "view_goal_strategies",
      description:
        "Pokaż strategie realizacji celów użytkownika. Zwraca listę aktywnych i proponowanych strategii z ich krokami. Użyj gdy user pyta o plany, strategie, 'co robisz z moimi celami?', 'jakie masz plany?'.",
      input_schema: {
        type: "object" as const,
        properties: {
          status_filter: {
            type: "string",
            enum: ["all", "proposed", "active"],
            description:
              "Filtruj po statusie (domyślnie: all — pokaż proposed + active)",
          },
        },
        required: [],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const filter = (input.status_filter as string) || "all";

      const statusList = filter === "all" ? ["proposed", "active"] : [filter];

      const { data: strategies, error } = await supabase
        .from("exo_goal_strategies")
        .select(
          "id, goal_id, approach, steps, status, confidence, version, created_at",
        )
        .eq("tenant_id", tenantId)
        .in("status", statusList)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        logger.error("[GoalStrategyTools] view error:", error.message);
        return "Błąd przy pobieraniu strategii.";
      }

      if (!strategies?.length) {
        return "Brak aktywnych lub proponowanych strategii.";
      }

      // Fetch goal names
      const goalIds = [...new Set(strategies.map((s) => s.goal_id))];
      const { data: goals } = await supabase
        .from("exo_user_goals")
        .select("id, name")
        .in("id", goalIds);

      const goalMap = new Map((goals || []).map((g) => [g.id, g.name]));

      const lines: string[] = [];
      for (const s of strategies) {
        const goalName = goalMap.get(s.goal_id) || "Nieznany cel";
        const steps = s.steps as Array<{ title: string; status: string }>;
        const completed = steps.filter(
          (st) => st.status === "completed",
        ).length;
        const total = steps.length;
        const icon = s.status === "active" ? "▶" : "⏸";

        lines.push(
          `${icon} "${goalName}" — ${s.status} (v${s.version}, pewność ${Math.round(s.confidence * 100)}%)`,
        );
        lines.push(`  Podejście: ${s.approach}`);
        lines.push(`  Postęp: ${completed}/${total} kroków`);
        lines.push(
          `  Kroki: ${steps
            .slice(0, 5)
            .map((st) => `${st.status === "completed" ? "✓" : "○"} ${st.title}`)
            .join(", ")}`,
        );
        if (s.status === "proposed") {
          lines.push(`  → Powiedz "tak" aby aktywować ten plan`);
        }
        lines.push("");
      }

      return lines.join("\n");
    },
  },
  {
    definition: {
      name: "approve_goal_strategy",
      description:
        'Aktywuj proponowaną strategię celu. Użyj gdy user potwierdza plan słowami "tak", "ok", "dawaj", "aktywuj", "zatwierdź", "approve". Jeśli user nie sprecyzował którego celu — użyj najpierw view_goal_strategies.',
      input_schema: {
        type: "object" as const,
        properties: {
          goal_id: {
            type: "string",
            description:
              "ID celu którego strategię aktywować. Jeśli nie podano — aktywuje najnowszą proponowaną strategię.",
          },
        },
        required: [],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const goalId = input.goal_id as string | undefined;

      // Find the proposed strategy
      let query = supabase
        .from("exo_goal_strategies")
        .select("id, goal_id, approach, steps, confidence")
        .eq("tenant_id", tenantId)
        .eq("status", "proposed")
        .order("created_at", { ascending: false })
        .limit(1);

      if (goalId) {
        query = query.eq("goal_id", goalId);
      }

      const { data: strategies, error } = await query;

      if (error) {
        logger.error("[GoalStrategyTools] approve error:", error.message);
        return "Błąd przy zatwierdzaniu strategii.";
      }

      if (!strategies?.length) {
        return "Brak strategii do zatwierdzenia. Wszystkie plany są już aktywne lub nie ma żadnych proponowanych.";
      }

      const strategy = strategies[0];

      // Approve it
      const { approveStrategy } = await import("@/lib/goals/strategy-store");
      await approveStrategy(strategy.id);

      // Get goal name
      const { data: goal } = await supabase
        .from("exo_user_goals")
        .select("name")
        .eq("id", strategy.goal_id)
        .single();

      const goalName = goal?.name || "cel";
      const steps = strategy.steps as Array<{ title: string }>;

      logger.info("[GoalStrategyTools] Strategy approved via chat:", {
        tenantId,
        strategyId: strategy.id,
        goalId: strategy.goal_id,
      });

      return `Plan dla "${goalName}" aktywowany! ${steps.length} kroków do realizacji. Zaczynam wykonywanie przy najbliższym cyklu.`;
    },
  },
  {
    definition: {
      name: "pause_goal_strategy",
      description:
        'Wstrzymaj aktywną strategię celu. Użyj gdy user mówi "stop", "wstrzymaj", "zatrzymaj plan", "pauza". Strategia zostaje oznaczona jako abandoned.',
      input_schema: {
        type: "object" as const,
        properties: {
          goal_id: {
            type: "string",
            description:
              "ID celu którego strategię wstrzymać. Jeśli nie podano — wstrzymuje najnowszą aktywną.",
          },
        },
        required: [],
      },
    },
    execute: async (input, tenantId) => {
      const supabase = getServiceSupabase();
      const goalId = input.goal_id as string | undefined;

      let query = supabase
        .from("exo_goal_strategies")
        .select("id, goal_id")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);

      if (goalId) {
        query = query.eq("goal_id", goalId);
      }

      const { data: strategies } = await query;

      if (!strategies?.length) {
        return "Brak aktywnych strategii do wstrzymania.";
      }

      const strategy = strategies[0];

      await supabase
        .from("exo_goal_strategies")
        .update({ status: "abandoned" })
        .eq("id", strategy.id);

      const { data: goal } = await supabase
        .from("exo_user_goals")
        .select("name")
        .eq("id", strategy.goal_id)
        .single();

      logger.info("[GoalStrategyTools] Strategy paused via chat:", {
        tenantId,
        strategyId: strategy.id,
      });

      return `Plan dla "${goal?.name || "cel"}" wstrzymany. Powiedz kiedy chcesz wznowić — wygeneruję nowy plan.`;
    },
  },
];
