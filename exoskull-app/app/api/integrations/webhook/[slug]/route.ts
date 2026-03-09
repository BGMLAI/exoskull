/**
 * Inbound Webhook Handler for Superintegrator
 *
 * Receives events from connected services (Stripe, GitHub, etc.)
 * and routes them to the autonomy queue for processing.
 *
 * URL pattern: /api/integrations/webhook/{service_slug}/{webhook_id}
 * The webhook_id is part of the slug path: "stripe/abc123"
 */

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import crypto from "crypto";

export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const slug = params.slug;
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  try {
    const body = await req.text();
    const contentType = req.headers.get("content-type") || "";

    // Find the integration by webhook URL containing this slug
    const { data: integration, error: findError } = await supabase
      .from("exo_integrations")
      .select("id, tenant_id, service_name, service_slug, metadata")
      .eq("auth_method", "webhook")
      .eq("status", "connected")
      .filter("webhook_url", "ilike", `%/${slug}%`)
      .single();

    if (findError || !integration) {
      logger.warn("[Webhook] No integration found for slug:", { slug });
      return NextResponse.json({ error: "Unknown webhook" }, { status: 404 });
    }

    // Validate webhook signature if configured
    const meta = integration.metadata as Record<string, unknown> | null;
    const webhookSecret = meta?.webhook_secret as string | undefined;
    if (webhookSecret) {
      const signature =
        req.headers.get("x-webhook-signature") ||
        req.headers.get("x-hub-signature-256") ||
        req.headers.get("stripe-signature");

      if (signature) {
        const hmac = crypto
          .createHmac("sha256", webhookSecret)
          .update(body)
          .digest("hex");
        const expected = `sha256=${hmac}`;
        if (signature !== expected && signature !== hmac) {
          logger.warn("[Webhook] Invalid signature for:", {
            slug,
            tenantId: integration.tenant_id,
          });
          return NextResponse.json(
            { error: "Invalid signature" },
            { status: 401 },
          );
        }
      }
    }

    // Parse body
    let payload: unknown;
    try {
      payload = contentType.includes("json") ? JSON.parse(body) : { raw: body };
    } catch {
      payload = { raw: body };
    }

    // Log to autonomy queue for processing by heartbeat CRON
    const { error: queueError } = await supabase
      .from("exo_autonomy_queue")
      .insert({
        tenant_id: integration.tenant_id,
        type: "webhook_event",
        payload: {
          service_slug: integration.service_slug,
          service_name: integration.service_name,
          event_data: payload,
          received_at: new Date().toISOString(),
          headers: {
            "content-type": contentType,
            "x-webhook-event":
              req.headers.get("x-github-event") ||
              req.headers.get("x-webhook-event") ||
              undefined,
          },
        },
        priority: 5,
        source: "webhook",
      });

    if (queueError) {
      logger.error("[Webhook] Failed to queue event:", {
        slug,
        error: queueError.message,
      });
      return NextResponse.json({ error: "Failed to process" }, { status: 500 });
    }

    // Log to autonomy log
    await supabase.from("exo_autonomy_log").insert({
      tenant_id: integration.tenant_id,
      event_type: "webhook_received",
      payload: {
        service: integration.service_slug,
        integration_id: integration.id,
      },
    });

    logger.info("[Webhook] Event received:", {
      slug,
      service: integration.service_slug,
      tenantId: integration.tenant_id,
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error("[Webhook] Handler error:", {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
