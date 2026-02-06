/**
 * In-Chat Onboarding Handler
 *
 * Routes new users (onboarding_status='pending'/'in_progress') through
 * a discovery conversation via their messaging channel (WhatsApp, Telegram, etc.).
 *
 * Reuses:
 * - DISCOVERY_SYSTEM_PROMPT (60-topic natural conversation)
 * - DISCOVERY_FIRST_MESSAGE (warm greeting)
 * - EXTRACTION_PROMPT (structured profile extraction)
 * - autoInstallMods() (post-onboarding Mod setup)
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { getThreadContext } from "../unified-thread";
import {
  DISCOVERY_SYSTEM_PROMPT,
  DISCOVERY_FIRST_MESSAGE,
  EXTRACTION_PROMPT,
} from "../onboarding/discovery-prompt";
import { autoInstallMods } from "../builder/proactive-engine";
import type { GatewayChannel, GatewayResponse } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/**
 * Check tenant's onboarding status.
 * Returns null if tenant not found.
 */
export async function getOnboardingStatus(
  tenantId: string,
): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("exo_tenants")
    .select("onboarding_status")
    .eq("id", tenantId)
    .single();

  return data?.onboarding_status ?? null;
}

/**
 * Handle a message from a user who hasn't completed onboarding.
 * Routes through discovery conversation instead of the normal 28-tool pipeline.
 */
export async function handleOnboardingMessage(
  tenantId: string,
  text: string,
  channel: GatewayChannel,
): Promise<GatewayResponse> {
  const supabase = getSupabase();

  try {
    // Mark as in_progress if still pending
    await supabase
      .from("exo_tenants")
      .update({ onboarding_status: "in_progress" })
      .eq("id", tenantId)
      .eq("onboarding_status", "pending");

    // Get conversation history from unified thread
    const history = await getThreadContext(tenantId, 30);

    // First message ever — send discovery greeting
    if (history.length === 0) {
      return {
        text: DISCOVERY_FIRST_MESSAGE,
        toolsUsed: [],
        channel,
      };
    }

    // Build messages for Claude
    const messages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Add closing instruction if conversation is long enough
    const exchangeCount = messages.filter((m) => m.role === "user").length;
    let systemPrompt = DISCOVERY_SYSTEM_PROMPT;

    if (exchangeCount >= 8) {
      systemPrompt += `\n\n## INSTRUKCJA DODATKOWA (koniec rozmowy)

Rozmowa trwa juz ${exchangeCount} wymian. Jeśli czujesz że poznałeś użytkownika wystarczająco, zakończ rozmowę naturalnie i dodaj na końcu JSON:

###PROFILE_DATA###
{
  "preferred_name": "...",
  "primary_goal": "...",
  "secondary_goals": [],
  "conditions": [],
  "communication_style": "direct|warm|coaching",
  "preferred_channel": "${channel}",
  "morning_checkin_time": "HH:MM lub null",
  "evening_checkin_time": "HH:MM lub null",
  "language": "pl|en",
  "insights": [],
  "quotes": []
}
###END_PROFILE_DATA###

Jeśli nie masz jeszcze wystarczająco info — kontynuuj naturalnie.`;
    }

    // Call Claude
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages,
    });

    let reply =
      response.content[0]?.type === "text"
        ? response.content[0].text
        : "Przepraszam, coś poszło nie tak. Spróbuj ponownie.";

    // Check for profile extraction in response
    const profileMatch = reply.match(
      /###PROFILE_DATA###\s*([\s\S]*?)\s*###END_PROFILE_DATA###/,
    );

    if (profileMatch) {
      try {
        const profileData = JSON.parse(profileMatch[1]);
        // Remove JSON from visible reply
        reply = reply
          .replace(/###PROFILE_DATA###[\s\S]*###END_PROFILE_DATA###/, "")
          .trim();

        // Complete onboarding in background (don't block response)
        completeOnboardingInChat(tenantId, profileData, channel).catch(
          (err) => {
            console.error("[OnboardingHandler] completeOnboarding failed:", {
              tenantId,
              error: err instanceof Error ? err.message : err,
            });
          },
        );
      } catch (parseErr) {
        console.error("[OnboardingHandler] Profile JSON parse failed:", {
          tenantId,
          error: parseErr instanceof Error ? parseErr.message : parseErr,
        });
      }
    }

    return {
      text: reply,
      toolsUsed: [],
      channel,
    };
  } catch (error) {
    console.error("[OnboardingHandler] handleOnboardingMessage failed:", {
      tenantId,
      channel,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      text: "Przepraszam, wystąpił problem. Napisz jeszcze raz — chcę Cię poznać!",
      toolsUsed: [],
      channel,
    };
  }
}

/**
 * Complete onboarding from in-chat discovery conversation.
 * Sets profile fields, schedules check-in, auto-installs Mods.
 */
async function completeOnboardingInChat(
  tenantId: string,
  profileData: Record<string, unknown>,
  channel: GatewayChannel,
): Promise<void> {
  const supabase = getSupabase();

  // Build update payload from extracted profile
  const updatePayload: Record<string, unknown> = {
    onboarding_status: "completed",
    onboarding_completed_at: new Date().toISOString(),
    preferred_channel: channel,
  };

  // Map profile fields to tenant columns
  const fieldMap: Record<string, string> = {
    preferred_name: "preferred_name",
    primary_goal: "primary_goal",
    secondary_goals: "secondary_goals",
    conditions: "conditions",
    communication_style: "communication_style",
    morning_checkin_time: "morning_checkin_time",
    evening_checkin_time: "evening_checkin_time",
    language: "language",
  };

  for (const [profileKey, dbColumn] of Object.entries(fieldMap)) {
    if (profileData[profileKey] != null) {
      updatePayload[dbColumn] = profileData[profileKey];
    }
  }

  // Store full discovery data as JSONB
  updatePayload.discovery_data = profileData;

  // Also set first_name from preferred_name if available
  if (profileData.preferred_name) {
    updatePayload.first_name = profileData.preferred_name;
  }

  // Update tenant
  const { error: updateError } = await supabase
    .from("exo_tenants")
    .update(updatePayload)
    .eq("id", tenantId);

  if (updateError) {
    console.error("[OnboardingHandler] Tenant update failed:", {
      tenantId,
      error: updateError.message,
    });
    throw updateError;
  }

  // Log to onboarding sessions (non-critical)
  try {
    await supabase.from("exo_onboarding_sessions").insert({
      tenant_id: tenantId,
      step: 1,
      step_name: "in_chat_discovery",
      completed_at: new Date().toISOString(),
      data: { method: "in_chat", channel },
    });
  } catch (e) {
    console.warn("[OnboardingHandler] Session log failed (non-critical):", e);
  }

  // Schedule morning check-in (non-critical)
  try {
    const morningTime = (profileData.morning_checkin_time as string) || "07:00";
    const { data: morningJob } = await supabase
      .from("exo_scheduled_jobs")
      .select("id")
      .eq("job_name", "morning_checkin")
      .single();

    if (morningJob) {
      await supabase.from("exo_user_job_preferences").upsert({
        tenant_id: tenantId,
        job_id: morningJob.id,
        enabled: true,
        preferred_time: morningTime,
        custom_message: `Cześć ${profileData.preferred_name || ""}! Jak się dziś czujesz?`,
      });
    }
  } catch (e) {
    console.warn("[OnboardingHandler] Check-in scheduling failed:", e);
  }

  // Auto-install Mods based on goals (fire-and-forget)
  autoInstallMods(tenantId).catch((err) =>
    console.error("[OnboardingHandler] autoInstallMods failed:", {
      tenantId,
      error: err instanceof Error ? err.message : err,
    }),
  );

  console.log("[OnboardingHandler] Onboarding completed:", {
    tenantId,
    channel,
    preferred_name: profileData.preferred_name,
    primary_goal: profileData.primary_goal,
  });
}
