// ============================================================================
// Drip Engine - Automated email/SMS sequences
// ============================================================================

import { createClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ============================================================================
// SEQUENCE DEFINITIONS
// ============================================================================

interface DripStep {
  dayOffset: number;
  templateId: string;
  channel: "email" | "sms";
  subject?: string;
  body: string;
}

const SEQUENCES: Record<string, DripStep[]> = {
  onboarding: [
    {
      dayOffset: 0,
      templateId: "onboarding_welcome",
      channel: "email",
      subject: "Witaj w ExoSkull!",
      body: "Cześć! Twój ExoSkull jest gotowy. Zacznij od pierwszej rozmowy - po prostu napisz lub zadzwoń.",
    },
    {
      dayOffset: 1,
      templateId: "onboarding_first_chat",
      channel: "sms",
      body: "Hej! Masz ochote na krotka rozmowe z ExoSkull? Wystarczy odpowiedziec na tego SMSa.",
    },
    {
      dayOffset: 3,
      templateId: "onboarding_connect_device",
      channel: "email",
      subject: "Polacz swoje urzadzenie",
      body: "Polacz Oura, Apple Watch lub Google Fit zeby ExoSkull mogl lepiej Ci pomagac z monitorowaniem zdrowia.",
    },
    {
      dayOffset: 7,
      templateId: "onboarding_week_summary",
      channel: "email",
      subject: "Twoj pierwszy tydzien z ExoSkull",
      body: "Minol tydzien! Sprawdz co ExoSkull odkryl o Twoich wzorcach i jak moze Ci pomoc.",
    },
    {
      dayOffset: 12,
      templateId: "onboarding_trial_ending",
      channel: "email",
      subject: "Twoj trial konczy sie za 2 dni",
      body: "Twoj darmowy okres probny konczy sie za 2 dni. Przejdz na plan platny zeby nie stracic swoich danych i wzorcow.",
    },
  ],
  reengagement: [
    {
      dayOffset: 3,
      templateId: "reengage_miss_you",
      channel: "email",
      subject: "Dawno Cie nie bylo...",
      body: "Cześć! Zauwazylismy ze nie rozmawialismy od kilku dni. Wszystko ok?",
    },
    {
      dayOffset: 7,
      templateId: "reengage_new_feature",
      channel: "email",
      subject: "Nowe mozliwosci w ExoSkull",
      body: "Od Twojej ostatniej wizyty dodalismy kilka nowych funkcji. Sprawdz co nowego!",
    },
    {
      dayOffset: 14,
      templateId: "reengage_last_chance",
      channel: "sms",
      body: "Twoj ExoSkull czeka na Ciebie. Wracasz? Odpowiedz TAK zeby wznowic.",
    },
  ],
  churn_prevention: [
    {
      dayOffset: 0,
      templateId: "churn_value_reminder",
      channel: "email",
      subject: "Co ExoSkull zrobil dla Ciebie",
      body: "Oto podsumowanie co ExoSkull zrobil w ostatnim miesiacu - moze byc tego wiecej niz myslisz!",
    },
    {
      dayOffset: 3,
      templateId: "churn_offer",
      channel: "email",
      subject: "Specjalna oferta dla Ciebie",
      body: "Chcemy Cie zatrzymac! Oto ekskluzywna znizka na nastepny miesiac.",
    },
  ],
};

// ============================================================================
// ENGINE
// ============================================================================

export interface DripResult {
  processed: number;
  sent: number;
  completed: number;
  errors: string[];
}

/**
 * Process all active drip sequences.
 * Called by cron every 6 hours.
 */
export async function processDripSequences(): Promise<DripResult> {
  const supabase = getServiceClient();
  const result: DripResult = {
    processed: 0,
    sent: 0,
    completed: 0,
    errors: [],
  };
  const now = new Date();

  try {
    // Find drip states ready for next send
    const { data: dueStates } = await supabase
      .from("exo_drip_state")
      .select("*, exo_tenants!inner(email, phone, name)")
      .eq("completed", false)
      .eq("paused", false)
      .lte("next_send_at", now.toISOString())
      .limit(100);

    for (const state of dueStates || []) {
      result.processed++;

      try {
        const sequence = SEQUENCES[state.sequence_name];
        if (!sequence) {
          result.errors.push(`Unknown sequence: ${state.sequence_name}`);
          continue;
        }

        const currentStep = sequence[state.current_step];
        if (!currentStep) {
          // Sequence complete
          await supabase
            .from("exo_drip_state")
            .update({ completed: true, updated_at: now.toISOString() })
            .eq("id", state.id);
          result.completed++;
          continue;
        }

        // Check if user unsubscribed
        const { data: lastCampaign } = await supabase
          .from("exo_campaign_sends")
          .select("unsubscribed")
          .eq("tenant_id", state.tenant_id)
          .eq("unsubscribed", true)
          .limit(1);

        if (lastCampaign && lastCampaign.length > 0) {
          await supabase
            .from("exo_drip_state")
            .update({ paused: true, updated_at: now.toISOString() })
            .eq("id", state.id);
          continue;
        }

        // Send message
        const tenant = state.exo_tenants;
        const sent = await sendDripMessage(
          state.tenant_id,
          currentStep,
          tenant,
        );

        if (sent) {
          // Log campaign send
          await supabase.from("exo_campaign_sends").insert({
            tenant_id: state.tenant_id,
            campaign_type:
              state.sequence_name === "onboarding"
                ? "onboarding_drip"
                : state.sequence_name === "reengagement"
                  ? "reengagement"
                  : "churn_prevention",
            channel: currentStep.channel,
            template_id: currentStep.templateId,
          });

          // Advance to next step
          const nextStepIndex = state.current_step + 1;
          const nextStep = sequence[nextStepIndex];

          await supabase
            .from("exo_drip_state")
            .update({
              current_step: nextStepIndex,
              last_sent_at: now.toISOString(),
              next_send_at: nextStep
                ? new Date(
                    Date.now() +
                      (nextStep.dayOffset - currentStep.dayOffset) *
                        24 *
                        60 *
                        60 *
                        1000,
                  ).toISOString()
                : null,
              completed: !nextStep,
              updated_at: now.toISOString(),
            })
            .eq("id", state.id);

          result.sent++;
          if (!nextStep) result.completed++;
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`State ${state.id}: ${errMsg}`);
      }
    }

    logger.info("[DripEngine] Processing complete:", result);
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[DripEngine] Fatal error:", { error: errMsg });
    result.errors.push(errMsg);
    return result;
  }
}

/**
 * Start a drip sequence for a tenant.
 */
export async function startDripSequence(
  tenantId: string,
  sequenceName: string,
): Promise<void> {
  const supabase = getServiceClient();
  const sequence = SEQUENCES[sequenceName];
  if (!sequence || sequence.length === 0) return;

  const firstStep = sequence[0];
  const nextSendAt = new Date(
    Date.now() + firstStep.dayOffset * 24 * 60 * 60 * 1000,
  );

  await supabase.from("exo_drip_state").upsert(
    {
      tenant_id: tenantId,
      sequence_name: sequenceName,
      current_step: 0,
      next_send_at: nextSendAt.toISOString(),
      completed: false,
      paused: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,sequence_name" },
  );

  logger.info("[DripEngine] Sequence started:", { tenantId, sequenceName });
}

/**
 * Trigger re-engagement sequence for users at churn risk.
 */
export async function triggerReengagement(tenantId: string): Promise<void> {
  const supabase = getServiceClient();

  // Check if already in a reengagement sequence
  const { data: existing } = await supabase
    .from("exo_drip_state")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sequence_name", "reengagement")
    .eq("completed", false)
    .single();

  if (existing) return; // Already in sequence

  await startDripSequence(tenantId, "reengagement");
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

async function sendDripMessage(
  tenantId: string,
  step: DripStep,
  tenant: { email?: string; phone?: string; name?: string },
): Promise<boolean> {
  try {
    if (step.channel === "email" && tenant.email) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "ExoSkull <hello@exoskull.xyz>",
          to: [tenant.email],
          subject: step.subject || "ExoSkull",
          text: step.body.replace("{name}", tenant.name || ""),
        }),
      });

      if (!response.ok) {
        console.error("[DripEngine] Email failed:", {
          status: response.status,
          tenantId,
          template: step.templateId,
        });
        return false;
      }
      return true;
    }

    if (step.channel === "sms" && tenant.phone) {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

      if (!twilioSid || !twilioToken || !twilioFrom) return false;

      const params = new URLSearchParams({
        To: tenant.phone,
        From: twilioFrom,
        Body: step.body.replace("{name}", tenant.name || ""),
      });

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        },
      );

      return response.ok;
    }

    return false;
  } catch (error) {
    console.error("[DripEngine] Send error:", {
      error: error instanceof Error ? error.message : String(error),
      tenantId,
      template: step.templateId,
    });
    return false;
  }
}
