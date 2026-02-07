// ============================================================================
// Dunning Management - Failed payment retry with escalating notifications
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import type { DunningResult } from "./types";

import { logger } from "@/lib/logger";
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Dunning escalation schedule
const DUNNING_SCHEDULE = [
  {
    attempt: 1,
    delayDays: 1,
    channel: "email" as const,
    action: "soft_reminder",
  },
  {
    attempt: 2,
    delayDays: 3,
    channel: "sms" as const,
    action: "payment_reminder",
  },
  {
    attempt: 3,
    delayDays: 7,
    channel: "email" as const,
    action: "final_warning",
  },
  {
    attempt: 4,
    delayDays: 14,
    channel: "sms" as const,
    action: "account_suspension",
  },
];

/**
 * Process all pending dunning attempts.
 * Called by cron every 6 hours.
 */
export async function processDunning(): Promise<DunningResult> {
  const supabase = getServiceClient();
  const result: DunningResult = {
    processed: 0,
    recovered: 0,
    escalated: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Find dunning attempts due for retry
    const { data: dueAttempts, error } = await supabase
      .from("exo_dunning_attempts")
      .select("*, exo_tenants!inner(email, phone, name)")
      .eq("status", "retrying")
      .lte("next_retry_at", new Date().toISOString())
      .order("next_retry_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[Dunning] Query error:", { error: error.message });
      result.errors.push(error.message);
      return result;
    }

    for (const attempt of dueAttempts || []) {
      result.processed++;

      try {
        // Check if payment was recovered (check Stripe status)
        const wasRecovered = await checkPaymentRecovered(
          attempt.stripe_invoice_id,
        );

        if (wasRecovered) {
          await handlePaymentRecovered(
            attempt.tenant_id,
            attempt.stripe_invoice_id,
          );
          result.recovered++;
          continue;
        }

        // Get escalation step
        const step = DUNNING_SCHEDULE.find(
          (s) => s.attempt === attempt.attempt_number,
        );

        if (!step || attempt.attempt_number > DUNNING_SCHEDULE.length) {
          // Max attempts reached - mark as permanently failed
          await supabase
            .from("exo_dunning_attempts")
            .update({
              status: "failed_permanently",
              updated_at: new Date().toISOString(),
            })
            .eq("id", attempt.id);

          // Downgrade tenant to free tier
          await supabase
            .from("exo_tenants")
            .update({
              subscription_tier: "free",
              subscription_status: "cancelled",
              subscription_cancelled_at: new Date().toISOString(),
            })
            .eq("id", attempt.tenant_id);

          result.failed++;
          continue;
        }

        // Send notification for current step
        await sendDunningNotification(
          attempt.tenant_id,
          step.channel,
          step.action,
          attempt.amount_pln,
          attempt.exo_tenants,
        );

        // Advance to next attempt
        const nextStep = DUNNING_SCHEDULE[attempt.attempt_number]; // 0-indexed next
        const nextRetry = nextStep
          ? new Date(
              Date.now() + nextStep.delayDays * 24 * 60 * 60 * 1000,
            ).toISOString()
          : null;

        await supabase
          .from("exo_dunning_attempts")
          .update({
            attempt_number: attempt.attempt_number + 1,
            notification_sent: true,
            notification_channel: step.channel,
            next_retry_at: nextRetry,
            status: nextRetry ? "retrying" : "failed_permanently",
            updated_at: new Date().toISOString(),
          })
          .eq("id", attempt.id);

        result.escalated++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[Dunning] Processing error:", {
          error: errMsg,
          attemptId: attempt.id,
          tenantId: attempt.tenant_id,
        });
        result.errors.push(`Attempt ${attempt.id}: ${errMsg}`);
      }
    }

    logger.info("[Dunning] Processing complete:", result);
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[Dunning] Fatal error:", { error: errMsg });
    result.errors.push(errMsg);
    return result;
  }
}

/**
 * Handle a failed payment event from Stripe webhook.
 */
export async function handlePaymentFailed(
  tenantId: string,
  invoiceId: string,
  amount: number,
  errorMessage?: string,
): Promise<void> {
  const supabase = getServiceClient();

  try {
    // Check if dunning already exists for this invoice
    const { data: existing } = await supabase
      .from("exo_dunning_attempts")
      .select("id")
      .eq("stripe_invoice_id", invoiceId)
      .eq("tenant_id", tenantId)
      .single();

    if (existing) {
      logger.info("[Dunning] Already tracking invoice:", {
        invoiceId,
        tenantId,
      });
      return;
    }

    // Create dunning attempt
    const firstStep = DUNNING_SCHEDULE[0];
    const nextRetry = new Date(
      Date.now() + firstStep.delayDays * 24 * 60 * 60 * 1000,
    );

    await supabase.from("exo_dunning_attempts").insert({
      tenant_id: tenantId,
      stripe_invoice_id: invoiceId,
      attempt_number: 1,
      status: "retrying",
      next_retry_at: nextRetry.toISOString(),
      amount_pln: amount,
      error_message: errorMessage || null,
    });

    // Increment failed payments counter
    await supabase.rpc("increment_usage", {
      p_tenant_id: tenantId,
      p_field: "ai_requests_count", // Reusing usage tracking
      p_amount: 0, // Don't actually increment
    });

    // Update tenant failed payments count
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("failed_payments")
      .eq("id", tenantId)
      .single();

    await supabase
      .from("exo_tenants")
      .update({
        failed_payments: (tenant?.failed_payments || 0) + 1,
      })
      .eq("id", tenantId);

    // Log business event
    await supabase.from("exo_business_events").insert({
      tenant_id: tenantId,
      event_type: "payment_failed",
      amount_pln: amount,
      stripe_invoice_id: invoiceId,
      metadata: { error_message: errorMessage },
    });

    logger.info("[Dunning] Payment failure tracked:", {
      tenantId,
      invoiceId,
      amount,
      nextRetry: nextRetry.toISOString(),
    });
  } catch (error) {
    console.error("[Dunning] handlePaymentFailed error:", {
      error: error instanceof Error ? error.message : String(error),
      tenantId,
      invoiceId,
    });
    throw error;
  }
}

/**
 * Handle a recovered payment (payment succeeded after dunning).
 */
export async function handlePaymentRecovered(
  tenantId: string,
  invoiceId: string,
): Promise<void> {
  const supabase = getServiceClient();

  try {
    await supabase
      .from("exo_dunning_attempts")
      .update({
        status: "recovered",
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_invoice_id", invoiceId)
      .eq("tenant_id", tenantId);

    // Reset failed payments counter
    await supabase
      .from("exo_tenants")
      .update({ failed_payments: 0 })
      .eq("id", tenantId);

    // Log recovery event
    await supabase.from("exo_business_events").insert({
      tenant_id: tenantId,
      event_type: "payment_succeeded",
      stripe_invoice_id: invoiceId,
      metadata: { recovered_from_dunning: true },
    });

    logger.info("[Dunning] Payment recovered:", { tenantId, invoiceId });
  } catch (error) {
    console.error("[Dunning] handlePaymentRecovered error:", {
      error: error instanceof Error ? error.message : String(error),
      tenantId,
      invoiceId,
    });
    throw error;
  }
}

// --- Internal helpers ---

async function checkPaymentRecovered(invoiceId: string): Promise<boolean> {
  // In production: check Stripe API for invoice status
  // For now: check if a payment_succeeded event exists after the failure
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("exo_business_events")
    .select("id")
    .eq("stripe_invoice_id", invoiceId)
    .eq("event_type", "payment_succeeded")
    .limit(1);

  return (data || []).length > 0;
}

async function sendDunningNotification(
  tenantId: string,
  channel: "email" | "sms",
  action: string,
  amount: number,
  tenant: { email?: string; phone?: string; name?: string },
): Promise<void> {
  const messages: Record<string, { subject: string; body: string }> = {
    soft_reminder: {
      subject: "Platnosc nie powiodla sie",
      body: `Cześć${tenant.name ? ` ${tenant.name}` : ""}! Twoja platnosc na kwote ${amount} PLN nie powiodla sie. Prosimy o aktualizacje metody platnosci.`,
    },
    payment_reminder: {
      subject: "Przypomnienie o platnosci - ExoSkull",
      body: `Twoja platnosc ${amount} PLN wciaz oczekuje. Zaktualizuj metode platnosci aby uniknac przerwy w usludze.`,
    },
    final_warning: {
      subject: "Ostatnie przypomnienie - zagrożenie usługą",
      body: `Twoje konto ExoSkull zostanie zawieszone za 7 dni z powodu niezaplaconej faktury (${amount} PLN). Zaktualizuj platnosc teraz.`,
    },
    account_suspension: {
      subject: "Konto zawieszone - ExoSkull",
      body: `Twoje konto ExoSkull zostalo zdegradowane do planu darmowego z powodu niezaplaconej faktury. Oplac fakture aby przywrocic pelny dostep.`,
    },
  };

  const msg = messages[action] || messages.soft_reminder;

  if (channel === "email" && tenant.email) {
    // Use existing email infrastructure (Resend)
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "ExoSkull <noreply@exoskull.xyz>",
          to: [tenant.email],
          subject: msg.subject,
          text: msg.body,
        }),
      });

      if (!response.ok) {
        console.error("[Dunning] Email send failed:", {
          status: response.status,
          tenantId,
        });
      }
    } catch (error) {
      console.error("[Dunning] Email error:", {
        error: error instanceof Error ? error.message : String(error),
        tenantId,
      });
    }
  } else if (channel === "sms" && tenant.phone) {
    // Use Twilio for SMS
    try {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

      if (twilioSid && twilioToken && twilioFrom) {
        const params = new URLSearchParams({
          To: tenant.phone,
          From: twilioFrom,
          Body: msg.body,
        });

        await fetch(
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
      }
    } catch (error) {
      console.error("[Dunning] SMS error:", {
        error: error instanceof Error ? error.message : String(error),
        tenantId,
      });
    }
  }
}
