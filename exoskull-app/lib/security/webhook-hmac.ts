/**
 * Webhook HMAC Verification
 *
 * Verifies X-Hub-Signature-256 for Meta webhooks (WhatsApp, Messenger).
 * Uses timing-safe comparison to prevent timing attacks.
 */

import crypto from "crypto";

/**
 * Verify Meta webhook signature (WhatsApp / Messenger).
 *
 * Meta sends `X-Hub-Signature-256: sha256=<hex>` header on every POST.
 * The HMAC is computed over the raw request body using the App Secret.
 *
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader) {
    console.error("[WebhookHMAC] Missing X-Hub-Signature-256 header");
    return false;
  }

  if (!appSecret) {
    console.error("[WebhookHMAC] META_APP_SECRET not configured");
    return false;
  }

  const expectedPrefix = "sha256=";
  if (!signatureHeader.startsWith(expectedPrefix)) {
    console.error("[WebhookHMAC] Invalid signature format:", {
      prefix: signatureHeader.substring(0, 10),
    });
    return false;
  }

  const receivedHex = signatureHeader.slice(expectedPrefix.length);

  const computedHmac = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedHex, "hex"),
      Buffer.from(computedHmac, "hex"),
    );
  } catch (error) {
    console.error("[WebhookHMAC] Signature comparison failed:", {
      error: (error as Error).message,
      receivedLength: receivedHex.length,
      expectedLength: computedHmac.length,
    });
    return false;
  }
}
