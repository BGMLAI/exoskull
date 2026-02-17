/**
 * IORS Self-Modification Tools
 *
 * 4 tools that allow IORS to modify its own configuration:
 * 1. modify_own_config — temperature, TTS speed, model preferences
 * 2. modify_own_prompt — custom instructions, behavior presets, system prompt override
 * 3. modify_loop_config — evaluation frequency, AI budget
 * 4. build_app — stub for AppGenerator (full app building)
 *
 * All tools use the consent gate for permission checking.
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";
import { checkSelfModifyConsent, logSelfModification } from "./consent-gate";
import { logger } from "@/lib/logger";

// ── Tool 1: modify_own_config ──

async function executeModifyOwnConfig(
  input: Record<string, unknown>,
  tenantId: string,
): Promise<string> {
  const supabase = getServiceSupabase();
  const changes: string[] = [];
  const isDirectRequest = (input._direct_request as boolean) ?? false;

  // Load current config
  const { data: tenant, error } = await supabase
    .from("exo_tenants")
    .select("iors_ai_config")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    return "Blad: nie udalo sie zaladowac konfiguracji AI.";
  }

  const current = (tenant.iors_ai_config as Record<string, unknown>) ?? {};
  const updated = { ...current };

  // Temperature
  if (input.temperature !== undefined) {
    const consent = await checkSelfModifyConsent(
      tenantId,
      "temperature",
      isDirectRequest,
    );
    if (consent.mode === "denied") return consent.reason;
    if (consent.mode === "needs_approval") {
      await logSelfModification({
        tenantId,
        parameterName: "temperature",
        permissionKey: "temperature",
        beforeState: current.temperature,
        afterState: input.temperature,
        status: "proposed",
        reason: `Zmiana temperatury z ${current.temperature} na ${input.temperature}`,
      });
      return `Zaproponowalem zmiane temperatury na ${input.temperature}. Czekam na zatwierdzenie w Ustawienia → Optymalizacja.`;
    }
    const temp = Math.max(0, Math.min(2, Number(input.temperature)));
    await logSelfModification({
      tenantId,
      parameterName: "temperature",
      permissionKey: "temperature",
      beforeState: current.temperature,
      afterState: temp,
      status: "applied",
    });
    updated.temperature = temp;
    changes.push(`temperatura: ${current.temperature} → ${temp}`);
  }

  // TTS speed
  if (input.tts_speed !== undefined) {
    const consent = await checkSelfModifyConsent(
      tenantId,
      "tts_speed",
      isDirectRequest,
    );
    if (consent.mode === "denied") return consent.reason;
    if (consent.mode === "needs_approval") {
      await logSelfModification({
        tenantId,
        parameterName: "tts_speed",
        permissionKey: "tts_speed",
        beforeState: current.tts_speed,
        afterState: input.tts_speed,
        status: "proposed",
      });
      return `Zaproponowalem zmiane predkosci mowy na ${input.tts_speed}. Czekam na zatwierdzenie.`;
    }
    const speed = Math.max(0.5, Math.min(2.0, Number(input.tts_speed)));
    await logSelfModification({
      tenantId,
      parameterName: "tts_speed",
      permissionKey: "tts_speed",
      beforeState: current.tts_speed,
      afterState: speed,
      status: "applied",
    });
    updated.tts_speed = speed;
    changes.push(`predkosc mowy: ${current.tts_speed} → ${speed}`);
  }

  // Model preferences
  if (input.model_preferences && typeof input.model_preferences === "object") {
    const prefs = input.model_preferences as Record<string, string>;
    const currentPrefs =
      (current.model_preferences as Record<string, string>) ?? {};
    const updatedPrefs = { ...currentPrefs };
    const validModels = ["auto", "flash", "haiku", "sonnet", "opus"];
    const categoryPermMap: Record<string, string> = {
      chat: "model_chat",
      analysis: "model_analysis",
      coding: "model_coding",
      creative: "model_creative",
      crisis: "model_crisis",
    };

    for (const [category, model] of Object.entries(prefs)) {
      if (!categoryPermMap[category] || !validModels.includes(model)) continue;

      const consent = await checkSelfModifyConsent(
        tenantId,
        categoryPermMap[category],
        isDirectRequest,
      );
      if (consent.mode === "denied") continue;
      if (consent.mode === "needs_approval") {
        await logSelfModification({
          tenantId,
          parameterName: `model_${category}`,
          permissionKey: categoryPermMap[category],
          beforeState: currentPrefs[category],
          afterState: model,
          status: "proposed",
        });
        changes.push(
          `model ${category}: propozycja zmiany na ${model} (oczekuje zatwierdzenia)`,
        );
        continue;
      }
      updatedPrefs[category] = model;
      changes.push(`model ${category}: ${currentPrefs[category]} → ${model}`);
      await logSelfModification({
        tenantId,
        parameterName: `model_${category}`,
        permissionKey: categoryPermMap[category],
        beforeState: currentPrefs[category],
        afterState: model,
        status: "applied",
      });
    }
    updated.model_preferences = updatedPrefs;
  }

  if (changes.length === 0) {
    return "Nie zmieniono zadnych parametrow.";
  }

  // Save
  const { error: updateError } = await supabase
    .from("exo_tenants")
    .update({
      iors_ai_config: updated,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  if (updateError) {
    logger.error("[ModifyOwnConfig] Update failed:", {
      tenantId,
      error: updateError.message,
    });
    return "Blad: nie udalo sie zapisac zmian konfiguracji.";
  }

  return `Zmieniono konfiguracje AI:\n${changes.map((c) => `- ${c}`).join("\n")}`;
}

// ── Tool 2: modify_own_prompt ──

async function executeModifyOwnPrompt(
  input: Record<string, unknown>,
  tenantId: string,
): Promise<string> {
  const supabase = getServiceSupabase();
  const action = input.action as string;
  const isDirectRequest = (input._direct_request as boolean) ?? false;

  // Load current state
  const { data: tenant, error } = await supabase
    .from("exo_tenants")
    .select(
      "iors_custom_instructions, iors_behavior_presets, iors_system_prompt_override",
    )
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    return "Blad: nie udalo sie zaladowac konfiguracji.";
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  switch (action) {
    case "append_instruction": {
      const consent = await checkSelfModifyConsent(
        tenantId,
        "prompt_add",
        isDirectRequest,
      );
      if (consent.mode === "denied") return consent.reason;

      const instruction = String(input.instruction ?? "").slice(0, 500);
      if (!instruction) return "Blad: brak tresci instrukcji.";

      const current = (tenant.iors_custom_instructions as string) ?? "";
      const newInstructions = current
        ? `${current}\n${instruction}`
        : instruction;

      if (consent.mode === "needs_approval") {
        await logSelfModification({
          tenantId,
          parameterName: "custom_instructions",
          permissionKey: "prompt_add",
          beforeState: current,
          afterState: newInstructions,
          status: "proposed",
          reason: `Dodanie instrukcji: "${instruction}"`,
        });
        return `Zaproponowalem dodanie instrukcji: "${instruction}". Czekam na zatwierdzenie.`;
      }

      updatePayload.iors_custom_instructions = newInstructions.slice(0, 2000);
      await logSelfModification({
        tenantId,
        parameterName: "custom_instructions",
        permissionKey: "prompt_add",
        beforeState: current,
        afterState: newInstructions.slice(0, 2000),
        status: "applied",
      });
      break;
    }

    case "remove_instruction": {
      const consent = await checkSelfModifyConsent(
        tenantId,
        "prompt_remove",
        isDirectRequest,
      );
      if (consent.mode === "denied") return consent.reason;

      const fragment = String(input.instruction ?? "");
      const current = (tenant.iors_custom_instructions as string) ?? "";
      const cleaned = current
        .split("\n")
        .filter((line) => !line.includes(fragment))
        .join("\n")
        .trim();

      if (consent.mode === "needs_approval") {
        await logSelfModification({
          tenantId,
          parameterName: "custom_instructions",
          permissionKey: "prompt_remove",
          beforeState: current,
          afterState: cleaned || null,
          status: "proposed",
          reason: `Usuniecie instrukcji zawierajacej: "${fragment}"`,
        });
        return `Zaproponowalem usuniecie instrukcji. Czekam na zatwierdzenie.`;
      }

      updatePayload.iors_custom_instructions = cleaned || null;
      await logSelfModification({
        tenantId,
        parameterName: "custom_instructions",
        permissionKey: "prompt_remove",
        beforeState: current,
        afterState: cleaned || null,
        status: "applied",
      });
      break;
    }

    case "preset_toggle": {
      const consent = await checkSelfModifyConsent(
        tenantId,
        "preset_toggle",
        isDirectRequest,
      );
      if (consent.mode === "denied") return consent.reason;

      const preset = String(input.preset_toggle ?? "");
      const validPresets = [
        "motivator",
        "coach",
        "analyst",
        "friend",
        "plan_day",
        "monitor_health",
        "track_goals",
        "find_gaps",
        "no_meditation",
        "no_finance",
        "no_calls",
        "weekend_quiet",
      ];
      if (!validPresets.includes(preset)) {
        return `Nieznany preset: ${preset}. Dostepne: ${validPresets.join(", ")}`;
      }

      const currentPresets = (
        (tenant.iors_behavior_presets as string[]) ?? []
      ).filter((p) => typeof p === "string");
      const isActive = currentPresets.includes(preset);
      const newPresets = isActive
        ? currentPresets.filter((p) => p !== preset)
        : [...currentPresets, preset];

      if (consent.mode === "needs_approval") {
        await logSelfModification({
          tenantId,
          parameterName: "behavior_presets",
          permissionKey: "preset_toggle",
          beforeState: currentPresets,
          afterState: newPresets,
          status: "proposed",
          reason: `${isActive ? "Wylaczenie" : "Wlaczenie"} presetu: ${preset}`,
        });
        return `Zaproponowalem ${isActive ? "wylaczenie" : "wlaczenie"} presetu "${preset}". Czekam na zatwierdzenie.`;
      }

      updatePayload.iors_behavior_presets = newPresets;
      await logSelfModification({
        tenantId,
        parameterName: "behavior_presets",
        permissionKey: "preset_toggle",
        beforeState: currentPresets,
        afterState: newPresets,
        status: "applied",
      });
      break;
    }

    case "set_override": {
      const consent = await checkSelfModifyConsent(
        tenantId,
        "prompt_override",
        isDirectRequest,
      );
      if (consent.mode === "denied") return consent.reason;

      const override = String(input.instruction ?? "").slice(0, 10000);
      if (!override) return "Blad: brak tresci nadpisania system prompt.";

      if (consent.mode === "needs_approval") {
        await logSelfModification({
          tenantId,
          parameterName: "system_prompt_override",
          permissionKey: "prompt_override",
          beforeState: tenant.iors_system_prompt_override,
          afterState: override,
          status: "proposed",
          reason: "Nadpisanie system prompt",
        });
        return "Zaproponowalem nadpisanie system prompt. Czekam na zatwierdzenie.";
      }

      updatePayload.iors_system_prompt_override = override;
      await logSelfModification({
        tenantId,
        parameterName: "system_prompt_override",
        permissionKey: "prompt_override",
        beforeState: tenant.iors_system_prompt_override,
        afterState: override,
        status: "applied",
      });
      break;
    }

    case "reset_to_default": {
      const consent = await checkSelfModifyConsent(
        tenantId,
        "prompt_override",
        isDirectRequest,
      );
      if (consent.mode === "denied") return consent.reason;

      updatePayload.iors_system_prompt_override = null;
      await logSelfModification({
        tenantId,
        parameterName: "system_prompt_override",
        permissionKey: "prompt_override",
        beforeState: tenant.iors_system_prompt_override,
        afterState: null,
        status: "applied",
        reason: "Reset system prompt do domyslnego",
      });
      break;
    }

    default:
      return `Nieznana akcja: ${action}. Dostepne: append_instruction, remove_instruction, preset_toggle, set_override, reset_to_default`;
  }

  const { error: updateError } = await supabase
    .from("exo_tenants")
    .update(updatePayload)
    .eq("id", tenantId);

  if (updateError) {
    logger.error("[ModifyOwnPrompt] Update failed:", {
      tenantId,
      error: updateError.message,
    });
    return "Blad: nie udalo sie zapisac zmian.";
  }

  return `Zmiana "${action}" zastosowana pomyslnie.`;
}

// ── Tool 3: modify_loop_config ──

async function executeModifyLoopConfig(
  input: Record<string, unknown>,
  tenantId: string,
): Promise<string> {
  const supabase = getServiceSupabase();
  const changes: string[] = [];
  const isDirectRequest = (input._direct_request as boolean) ?? false;

  // Load current
  const { data: config, error } = await supabase
    .from("exo_tenant_loop_config")
    .select("user_eval_interval_minutes, daily_ai_budget_cents")
    .eq("tenant_id", tenantId)
    .single();

  if (error || !config) {
    return "Blad: nie znaleziono konfiguracji petli dla tego uzytkownika.";
  }

  const updatePayload: Record<string, unknown> = {};

  // Eval interval
  if (input.eval_interval_minutes !== undefined) {
    const consent = await checkSelfModifyConsent(
      tenantId,
      "loop_frequency",
      isDirectRequest,
    );
    if (consent.mode === "denied") return consent.reason;

    const validIntervals = [0, 5, 15, 30, 60];
    const interval = Number(input.eval_interval_minutes);
    if (!validIntervals.includes(interval)) {
      return `Nieprawidlowy interwal: ${interval}. Dostepne: ${validIntervals.join(", ")} (0=wylaczona)`;
    }

    if (consent.mode === "needs_approval") {
      await logSelfModification({
        tenantId,
        parameterName: "eval_interval_minutes",
        permissionKey: "loop_frequency",
        beforeState: config.user_eval_interval_minutes,
        afterState: interval || null,
        status: "proposed",
      });
      return `Zaproponowalem zmiane czestotliwosci petli na ${interval || "wylaczona"}. Czekam na zatwierdzenie.`;
    }

    updatePayload.user_eval_interval_minutes = interval || null;
    await logSelfModification({
      tenantId,
      parameterName: "eval_interval_minutes",
      permissionKey: "loop_frequency",
      beforeState: config.user_eval_interval_minutes,
      afterState: interval || null,
      status: "applied",
    });
    changes.push(
      `czestotliwosc petli: ${config.user_eval_interval_minutes ?? "auto"} → ${interval === 0 ? "wylaczona" : `${interval} min`}`,
    );
  }

  // Budget
  if (input.daily_ai_budget_cents !== undefined) {
    const consent = await checkSelfModifyConsent(
      tenantId,
      "ai_budget",
      isDirectRequest,
    );
    if (consent.mode === "denied") return consent.reason;

    const budget = Math.max(
      10,
      Math.min(500, Number(input.daily_ai_budget_cents)),
    );

    if (consent.mode === "needs_approval") {
      await logSelfModification({
        tenantId,
        parameterName: "daily_ai_budget_cents",
        permissionKey: "ai_budget",
        beforeState: config.daily_ai_budget_cents,
        afterState: budget,
        status: "proposed",
      });
      return `Zaproponowalem zmiane budzetu AI na ${budget}¢. Czekam na zatwierdzenie.`;
    }

    updatePayload.daily_ai_budget_cents = budget;
    await logSelfModification({
      tenantId,
      parameterName: "daily_ai_budget_cents",
      permissionKey: "ai_budget",
      beforeState: config.daily_ai_budget_cents,
      afterState: budget,
      status: "applied",
    });
    changes.push(`budzet AI: ${config.daily_ai_budget_cents}¢ → ${budget}¢`);
  }

  if (Object.keys(updatePayload).length === 0) {
    return "Nie zmieniono zadnych parametrow.";
  }

  const { error: updateError } = await supabase
    .from("exo_tenant_loop_config")
    .update(updatePayload)
    .eq("tenant_id", tenantId);

  if (updateError) {
    logger.error("[ModifyLoopConfig] Update failed:", {
      tenantId,
      error: updateError.message,
    });
    return "Blad: nie udalo sie zapisac zmian petli.";
  }

  return `Zmieniono konfiguracje petli:\n${changes.map((c) => `- ${c}`).join("\n")}`;
}

// ── Tool 4: build_app (stub) ──

// ── Export all self-config tools ──
// Note: build_app is in app-builder-tools.ts (full AppGenerator implementation)

export const selfConfigTools: ToolDefinition[] = [
  {
    definition: {
      name: "modify_own_config",
      description:
        "Zmien parametry AI asystenta: temperature (kreatywnosc 0-2), predkosc mowy (0.5-2.0), wybor modeli per kategoria. Wymaga uprawnienia uzytkownika.",
      input_schema: {
        type: "object" as const,
        properties: {
          temperature: {
            type: "number",
            description:
              "Kreatywnosc AI: 0=przewidywalny, 0.7=balans, 2=kreatywny",
          },
          tts_speed: {
            type: "number",
            description:
              "Predkosc mowy TTS: 0.5=wolno, 1.0=normalnie, 2.0=szybko",
          },
          model_preferences: {
            type: "object",
            description:
              "Preferencje modeli per kategoria. Wartosci: auto, flash, haiku, sonnet, opus",
            properties: {
              chat: { type: "string" },
              analysis: { type: "string" },
              coding: { type: "string" },
              creative: { type: "string" },
              crisis: { type: "string" },
            },
          },
          _direct_request: {
            type: "boolean",
            description:
              "True jesli uzytkownik bezposrednio poprosil o te zmiane w czacie",
          },
        },
      },
    },
    execute: executeModifyOwnConfig,
  },
  {
    definition: {
      name: "modify_own_prompt",
      description:
        "Dodaj/usun instrukcje systemowe, zmien zachowania (presety), nadpisz system prompt. Wymaga uprawnienia uzytkownika.",
      input_schema: {
        type: "object" as const,
        properties: {
          action: {
            type: "string",
            enum: [
              "append_instruction",
              "remove_instruction",
              "preset_toggle",
              "set_override",
              "reset_to_default",
            ],
            description: "Typ zmiany",
          },
          instruction: {
            type: "string",
            description: "Tresc instrukcji (dla append/remove/set_override)",
          },
          preset_toggle: {
            type: "string",
            description:
              "Preset do wlaczenia/wylaczenia: motivator, coach, analyst, friend, plan_day, monitor_health, track_goals, find_gaps, no_meditation, no_finance, no_calls, weekend_quiet",
          },
          _direct_request: {
            type: "boolean",
            description:
              "True jesli uzytkownik bezposrednio poprosil o te zmiane",
          },
        },
        required: ["action"],
      },
    },
    execute: executeModifyOwnPrompt,
  },
  {
    definition: {
      name: "modify_loop_config",
      description:
        "Zmien czestotliwosc ewaluacji petli MAPEK i budzet AI. 0=wylaczona, 5/15/30/60=minuty. Wymaga uprawnienia uzytkownika.",
      input_schema: {
        type: "object" as const,
        properties: {
          eval_interval_minutes: {
            type: "number",
            description:
              "Czestotliwosc petli w minutach: 0=wylaczona, 5, 15, 30, 60",
          },
          daily_ai_budget_cents: {
            type: "number",
            description: "Dzienny budzet AI w centach (10-500)",
          },
          _direct_request: {
            type: "boolean",
            description:
              "True jesli uzytkownik bezposrednio poprosil o te zmiane",
          },
        },
      },
    },
    execute: executeModifyLoopConfig,
  },
];
