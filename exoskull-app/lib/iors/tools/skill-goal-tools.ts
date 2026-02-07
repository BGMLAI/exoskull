/**
 * IORS Skill & Goal Tools
 *
 * Tools for managing skill suggestions and user goals via conversation.
 * - accept_skill_suggestion: Accept a suggested skill
 * - dismiss_skill_suggestion: Dismiss a suggested skill
 * - define_goal: Create a new user goal
 * - log_goal_progress: Record progress toward a goal
 * - check_goals: Show goals and their progress
 */

import type { ToolDefinition } from "./index";
import { getServiceSupabase } from "@/lib/supabase/service";
import { updateSuggestionStatus } from "@/lib/skills/detector";
import { logger } from "@/lib/logger";
import {
  defineGoal,
  logProgressByName,
  getGoalsForVoice,
} from "@/lib/goals/engine";

export const skillGoalTools: ToolDefinition[] = [
  {
    definition: {
      name: "accept_skill_suggestion",
      description:
        'Zaakceptuj sugestię nowego skilla. Użyj gdy użytkownik zgadza się na propozycję nowej umiejętności, np. "tak, chcę to", "zbuduj to", "dobry pomysł".',
      input_schema: {
        type: "object" as const,
        properties: {
          suggestion_id: {
            type: "string",
            description: "ID sugestii z kontekstu SUGESTIE NOWYCH UMIEJĘTNOŚCI",
          },
        },
        required: ["suggestion_id"],
      },
    },
    execute: async (input, tenantId) => {
      const suggestionId = input.suggestion_id as string;

      logger.info("[SkillGoalTools] accept_skill_suggestion:", {
        suggestionId,
        tenantId,
      });

      try {
        await updateSuggestionStatus(suggestionId, "accepted");

        const supabase = getServiceSupabase();
        const { data: suggestion } = await supabase
          .from("exo_skill_suggestions")
          .select("description, suggested_slug")
          .eq("id", suggestionId)
          .single();

        if (!suggestion) {
          return "Nie znaleziono sugestii o podanym ID.";
        }

        const { generateSkill } =
          await import("@/lib/skills/generator/skill-generator");
        const result = await generateSkill({
          tenant_id: tenantId,
          description: suggestion.description,
          source: "user_request",
        });

        if (result.success && result.skill) {
          await updateSuggestionStatus(
            suggestionId,
            "generated",
            result.skill.id,
          );
          return `Skill "${suggestion.description}" został wygenerowany! Status: oczekuje na zatwierdzenie. Dostaniesz SMS z kodem potwierdzającym.`;
        } else {
          return `Nie udało się wygenerować skilla: ${result.error || "nieznany błąd"}. Spróbuję ponownie później.`;
        }
      } catch (error) {
        console.error("[SkillGoalTools] accept_skill_suggestion error:", error);
        return "Nie udało się zaakceptować sugestii. Spróbuj ponownie.";
      }
    },
  },
  {
    definition: {
      name: "dismiss_skill_suggestion",
      description:
        'Odrzuć sugestię skilla. Użyj gdy użytkownik nie chce propozycji, np. "nie", "nie potrzebuję", "może później".',
      input_schema: {
        type: "object" as const,
        properties: {
          suggestion_id: {
            type: "string",
            description: "ID sugestii do odrzucenia",
          },
        },
        required: ["suggestion_id"],
      },
    },
    execute: async (input) => {
      const suggestionId = input.suggestion_id as string;

      logger.info("[SkillGoalTools] dismiss_skill_suggestion:", {
        suggestionId,
      });

      try {
        await updateSuggestionStatus(suggestionId, "rejected");
        return "Sugestia odrzucona. Nie będę więcej proponować tego skilla.";
      } catch (error) {
        console.error(
          "[SkillGoalTools] dismiss_skill_suggestion error:",
          error,
        );
        return "Nie udało się odrzucić sugestii.";
      }
    },
  },
  {
    definition: {
      name: "define_goal",
      description:
        'Zdefiniuj nowy cel użytkownika. Użyj gdy mówi "chcę...", "mój cel to...", "planuję...", np. "Chcę biegać 3 razy w tygodniu", "Chcę schudnąć 5kg do lata", "Chcę czytać 30 minut dziennie".',
      input_schema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description:
              "Cel w słowach użytkownika, np. 'Biegać 3x w tygodniu'",
          },
          target_value: {
            type: "number",
            description: "Wartość docelowa, np. 3 (razy), 5 (kg), 30 (minut)",
          },
          target_unit: {
            type: "string",
            description:
              "Jednostka: razy, kg, minut, kroków, złotych, stron, itp.",
          },
          target_date: {
            type: "string",
            description: "Termin w formacie YYYY-MM-DD (opcjonalne)",
          },
        },
        required: ["name"],
      },
    },
    execute: async (input, tenantId) => {
      logger.info("[SkillGoalTools] define_goal:", { tenantId, input });

      try {
        const goal = await defineGoal(tenantId, {
          name: input.name as string,
          target_value: input.target_value as number | undefined,
          target_unit: input.target_unit as string | undefined,
          target_date: input.target_date as string | undefined,
        });

        const deadline = goal.target_date
          ? ` Termin: ${goal.target_date}.`
          : "";
        return `Cel utworzony: "${goal.name}" (${goal.category}).${deadline} Będę śledzić Twój postęp i informować Cię regularnie.`;
      } catch (error) {
        console.error("[SkillGoalTools] define_goal error:", error);
        return "Nie udało się utworzyć celu. Spróbuj powiedzieć inaczej.";
      }
    },
  },
  {
    definition: {
      name: "log_goal_progress",
      description:
        'Zapisz postęp w celu. Użyj gdy user raportuje osiągnięcia, np. "Dziś przebiegłem 5km", "Ważę 83kg", "Przeczytałem 40 stron", "Wydałem 50 zł".',
      input_schema: {
        type: "object" as const,
        properties: {
          goal_name: {
            type: "string",
            description:
              "Nazwa lub fragment nazwy celu (system dopasuje automatycznie)",
          },
          value: {
            type: "number",
            description: "Wartość do zapisania, np. 5, 83, 40",
          },
        },
        required: ["goal_name", "value"],
      },
    },
    execute: async (input, tenantId) => {
      logger.info("[SkillGoalTools] log_goal_progress:", {
        tenantId,
        goalName: input.goal_name,
        value: input.value,
      });

      try {
        const checkpoint = await logProgressByName(
          tenantId,
          input.goal_name as string,
          input.value as number,
          "voice",
        );

        if (!checkpoint) {
          return `Nie znalazłem pasującego celu do "${input.goal_name}". Sprawdź swoje cele mówiąc "jakie mam cele".`;
        }

        const progressText =
          checkpoint.progress_percent != null
            ? ` Postęp: ${Math.round(checkpoint.progress_percent)}%.`
            : "";
        const momentumText =
          checkpoint.momentum === "up"
            ? " Trend wzrostowy!"
            : checkpoint.momentum === "down"
              ? " Uwaga, trend spadkowy."
              : "";
        return `Zapisano: ${input.value}.${progressText}${momentumText}`;
      } catch (error) {
        console.error("[SkillGoalTools] log_goal_progress error:", error);
        return "Nie udało się zapisać postępu.";
      }
    },
  },
  {
    definition: {
      name: "check_goals",
      description:
        'Pokaż cele użytkownika i ich postęp. Użyj gdy pyta "jak idą moje cele?", "jaki mam postęp?", "ile mi brakuje?".',
      input_schema: {
        type: "object" as const,
        properties: {},
      },
    },
    execute: async (_input, tenantId) => {
      logger.info("[SkillGoalTools] check_goals:", { tenantId });

      try {
        return await getGoalsForVoice(tenantId);
      } catch (error) {
        console.error("[SkillGoalTools] check_goals error:", error);
        return "Nie udało się pobrać celów.";
      }
    },
  },
];
