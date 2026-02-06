/**
 * IORS Birth Flow Handler
 *
 * Unlike the old onboarding (separate Claude call, no tools),
 * birth flow routes through the FULL processUserMessage() pipeline
 * with all 30+ tools. The BIRTH_SYSTEM_PROMPT_PREFIX is prepended
 * to the system prompt via the personality fragment mechanism.
 *
 * Flow:
 * 1. Gateway detects: iors_birth_enabled=true && iors_birth_completed=false
 * 2. handleBirthMessage() sets a birth prompt prefix on the session
 * 3. processUserMessage() runs normally with ALL tools available
 * 4. After response, check for ###BIRTH_COMPLETE### JSON
 * 5. If found: save personality, mark birth complete, transition to normal mode
 */

import {
  getOrCreateSession,
  processUserMessage,
  updateSession,
} from "../voice/conversation-handler";
import type { GatewayChannel, GatewayResponse } from "../gateway/types";
import {
  BIRTH_SYSTEM_PROMPT_PREFIX,
  BIRTH_FIRST_MESSAGE,
} from "./birth-prompt";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { IORSPersonality } from "./types";
import { DEFAULT_PERSONALITY } from "./types";
import { getThreadContext } from "../unified-thread";

/**
 * Check if a tenant is in the birth flow.
 * Returns true if iors_birth_enabled=true AND iors_birth_completed=false.
 */
export async function isBirthPending(tenantId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("exo_tenants")
    .select("iors_birth_enabled, iors_birth_completed")
    .eq("id", tenantId)
    .single();

  if (!data) return false;
  return data.iors_birth_enabled === true && data.iors_birth_completed !== true;
}

/**
 * Handle a message during the IORS birth flow.
 *
 * Uses the FULL processUserMessage pipeline with birth prompt prefix.
 * This means ALL 30+ tools are available from the first conversation.
 */
export async function handleBirthMessage(
  tenantId: string,
  text: string,
  channel: GatewayChannel,
): Promise<GatewayResponse> {
  try {
    // Check if this is the very first message — send birth greeting
    const history = await getThreadContext(tenantId, 5);
    const userMessages = history.filter((m) => m.role === "user");

    if (userMessages.length <= 1) {
      // First message — return greeting directly
      // (the current message was already appended by gateway)
      return {
        text: BIRTH_FIRST_MESSAGE,
        toolsUsed: [],
        channel,
      };
    }

    // Get or create session with birth prompt prefix
    const session = await getOrCreateSession(tenantId, channel);

    // Inject birth prompt prefix into session context
    // processUserMessage reads session.systemPromptPrefix if present
    const birthSession = {
      ...session,
      systemPromptPrefix: BIRTH_SYSTEM_PROMPT_PREFIX,
    };

    // Run through FULL pipeline (all 30+ tools available)
    const result = await processUserMessage(birthSession, text);

    // Check for birth completion marker in response
    const birthMatch = result.text.match(
      /###BIRTH_COMPLETE###\s*([\s\S]*?)\s*###END_BIRTH_COMPLETE###/,
    );

    if (birthMatch) {
      // Extract personality data
      const cleanReply = result.text
        .replace(/###BIRTH_COMPLETE###[\s\S]*###END_BIRTH_COMPLETE###/, "")
        .trim();

      // Complete birth in background (don't block response)
      completeBirth(tenantId, birthMatch[1]).catch((err) => {
        console.error("[BirthFlow] completeBirth failed:", {
          tenantId,
          error: err instanceof Error ? err.message : err,
        });
      });

      return {
        text: cleanReply,
        toolsUsed: result.toolsUsed || [],
        channel,
      };
    }

    return {
      text: result.text,
      toolsUsed: result.toolsUsed || [],
      channel,
    };
  } catch (error) {
    console.error("[BirthFlow] handleBirthMessage failed:", {
      tenantId,
      channel,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      text: "Przepraszam, coś poszło nie tak. Napisz jeszcze raz — chcę Cię poznać!",
      toolsUsed: [],
      channel,
    };
  }
}

/**
 * Complete the IORS birth — save personality and mark as born.
 */
async function completeBirth(
  tenantId: string,
  birthDataJson: string,
): Promise<void> {
  const supabase = getServiceSupabase();

  let birthData: {
    iors_name?: string;
    personality?: Partial<IORSPersonality["style"]>;
    language?: string;
    user_insights?: string[];
    proposed_mods?: string[];
  };

  try {
    birthData = JSON.parse(birthDataJson);
  } catch {
    console.error("[BirthFlow] Invalid birth JSON:", {
      tenantId,
      raw: birthDataJson.substring(0, 200),
    });
    // Still mark as complete even if JSON is bad — user can adjust later
    await supabase
      .from("exo_tenants")
      .update({
        iors_birth_completed: true,
        iors_birth_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);
    return;
  }

  // Build personality from birth data
  const personality: IORSPersonality = {
    name: birthData.iors_name || DEFAULT_PERSONALITY.name,
    voice_id: DEFAULT_PERSONALITY.voice_id,
    language:
      (birthData.language as IORSPersonality["language"]) ||
      DEFAULT_PERSONALITY.language,
    proactivity: DEFAULT_PERSONALITY.proactivity,
    communication_hours: DEFAULT_PERSONALITY.communication_hours,
    style: {
      formality:
        birthData.personality?.formality ?? DEFAULT_PERSONALITY.style.formality,
      humor: birthData.personality?.humor ?? DEFAULT_PERSONALITY.style.humor,
      directness:
        birthData.personality?.directness ??
        DEFAULT_PERSONALITY.style.directness,
      empathy:
        birthData.personality?.empathy ?? DEFAULT_PERSONALITY.style.empathy,
      detail_level:
        birthData.personality?.detail_level ??
        DEFAULT_PERSONALITY.style.detail_level,
    },
  };

  // Save to DB
  const { error } = await supabase
    .from("exo_tenants")
    .update({
      iors_birth_completed: true,
      iors_birth_date: new Date().toISOString(),
      iors_name: personality.name,
      iors_personality: personality,
      onboarding_status: "completed",
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  if (error) {
    console.error("[BirthFlow] DB update failed:", {
      tenantId,
      error: error.message,
    });
    return;
  }

  // Grant default autonomy permission (log in all domains)
  try {
    const { grantPermission } = await import("./autonomy");
    await grantPermission(tenantId, "log", "*", {
      granted_via: "birth",
    });
  } catch (err) {
    console.error("[BirthFlow] Default permission grant failed:", {
      tenantId,
      error: err instanceof Error ? err.message : err,
    });
  }

  console.log("[BirthFlow] Birth complete:", {
    tenantId,
    iors_name: personality.name,
    insights: birthData.user_insights?.length ?? 0,
    proposed_mods: birthData.proposed_mods?.length ?? 0,
  });
}
