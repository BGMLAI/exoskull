/**
 * Stripe Webhook Handler
 *
 * Processes Stripe events and logs them to exo_business_events.
 * Handles: payment_succeeded, payment_failed, subscription lifecycle, etc.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  handlePaymentFailed,
  handlePaymentRecovered,
} from "@/lib/business/dunning";
import type { BusinessEventType } from "@/lib/business/types";

export const dynamic = "force-dynamic";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  // Verify webhook signature — MANDATORY
  let event: any;
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error(
        "[StripeWebhook] CRITICAL: STRIPE_WEBHOOK_SECRET not configured",
      );
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 },
      );
    }
    if (!signature) {
      console.error("[StripeWebhook] Missing stripe-signature header");
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }
    const stripe = await getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error("[StripeWebhook] Signature verification failed:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getServiceClient();

  try {
    const type = event.type;
    const data = event.data.object;

    // Map Stripe event to business event
    let eventType: BusinessEventType | null = null;
    let tenantId: string | null = null;
    let amount = 0;

    // Resolve tenant from Stripe customer ID
    if (data.customer) {
      const { data: tenant } = await supabase
        .from("exo_tenants")
        .select("id")
        .eq("stripe_customer_id", data.customer)
        .single();

      tenantId = tenant?.id || null;
    }

    if (!tenantId) {
      // Try to find by email from Stripe
      if (data.customer_email || data.receipt_email) {
        const email = data.customer_email || data.receipt_email;
        const { data: tenant } = await supabase
          .from("exo_tenants")
          .select("id")
          .eq("email", email)
          .single();

        tenantId = tenant?.id || null;
      }
    }

    if (!tenantId) {
      console.warn("[StripeWebhook] No tenant found for event:", {
        type,
        customer: data.customer,
      });
      return NextResponse.json({ received: true, warning: "no_tenant_match" });
    }

    switch (type) {
      case "invoice.payment_succeeded":
        eventType = "payment_succeeded";
        amount = (data.amount_paid || 0) / 100; // Stripe uses grosze
        await supabase
          .from("exo_tenants")
          .update({
            last_payment_at: new Date().toISOString(),
          })
          .eq("id", tenantId);
        // Increment total_paid_pln
        try {
          await supabase.rpc("increment_usage", {
            p_tenant_id: tenantId,
            p_resource: "total_paid_pln",
            p_amount: amount,
          });
        } catch {
          console.warn(
            "[StripeWebhook] increment_usage RPC not available, skipping total_paid_pln increment",
          );
        }
        // Check if this recovers a dunning attempt
        if (data.id) {
          await handlePaymentRecovered(tenantId, data.id);
        }
        break;

      case "invoice.payment_failed":
        eventType = "payment_failed";
        amount = (data.amount_due || 0) / 100;
        if (data.id) {
          await handlePaymentFailed(
            tenantId,
            data.id,
            amount,
            data.last_payment_error?.message,
          );
        }
        break;

      case "customer.subscription.created":
        eventType = "subscription_started";
        amount = (data.items?.data?.[0]?.price?.unit_amount || 0) / 100;
        await supabase
          .from("exo_tenants")
          .update({
            stripe_subscription_id: data.id,
            subscription_status: "active",
            subscription_started_at: new Date().toISOString(),
          })
          .eq("id", tenantId);
        break;

      case "customer.subscription.updated":
        // Check if upgraded or downgraded
        if (data.previous_attributes?.items) {
          const oldAmount =
            data.previous_attributes.items?.data?.[0]?.price?.unit_amount || 0;
          const newAmount = data.items?.data?.[0]?.price?.unit_amount || 0;
          eventType =
            newAmount > oldAmount
              ? "subscription_upgraded"
              : "subscription_downgraded";
          amount = newAmount / 100;
        } else {
          eventType = "subscription_renewed";
          amount = (data.items?.data?.[0]?.price?.unit_amount || 0) / 100;
        }
        break;

      case "customer.subscription.deleted":
        eventType = "subscription_cancelled";
        await supabase
          .from("exo_tenants")
          .update({
            subscription_status: "cancelled",
            subscription_cancelled_at: new Date().toISOString(),
            subscription_tier: "free",
          })
          .eq("id", tenantId);
        break;

      default:
        // Unhandled event type - just acknowledge
        return NextResponse.json({ received: true, handled: false });
    }

    if (eventType && tenantId) {
      await supabase.from("exo_business_events").insert({
        tenant_id: tenantId,
        event_type: eventType,
        amount_pln: amount,
        stripe_payment_intent_id: data.payment_intent || null,
        stripe_invoice_id: data.id || null,
        stripe_subscription_id: data.subscription || data.id || null,
        metadata: {
          stripe_event_id: event.id,
          stripe_event_type: type,
        },
      });
    }

    console.log("[StripeWebhook] Processed:", {
      type,
      eventType,
      tenantId,
      amount,
    });

    return NextResponse.json({ received: true, eventType });
  } catch (error) {
    console.error("[StripeWebhook] Processing error:", {
      error: error instanceof Error ? error.message : String(error),
      eventType: event?.type,
    });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}

async function getStripe() {
  const Stripe = (await import("stripe")).default;
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia" as any,
  });
}
