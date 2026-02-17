/**
 * IORS Emergency Contact System
 *
 * Manages crisis contacts with phone verification.
 * When IORS detects a mental health crisis (3-layer detection),
 * it can escalate to the user's designated emergency contact.
 *
 * Flow:
 * 1. User provides emergency contact phone (during birth or settings)
 * 2. IORS sends verification SMS with 6-digit code
 * 3. Contact verifies → marked as verified
 * 4. On crisis: IORS sends SMS to verified contact (no user data shared)
 * 5. Re-verification every 6 months
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import type { EmergencyContact } from "./types";

import { logger } from "@/lib/logger";
/**
 * Add an emergency contact and send verification SMS.
 */
export async function addEmergencyContact(
  tenantId: string,
  phone: string,
  name?: string,
  relationship?: string,
): Promise<{ contactId: string; verificationSent: boolean }> {
  const supabase = getServiceSupabase();
  const normalizedPhone = normalizePhone(phone);

  // Generate 6-digit verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Check if tenant already has a primary contact
  const { data: existing } = await supabase
    .from("exo_emergency_contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_primary", true)
    .maybeSingle();

  // If existing primary, update instead of insert
  if (existing) {
    await supabase
      .from("exo_emergency_contacts")
      .update({
        phone: normalizedPhone,
        name,
        relationship,
        verified: false,
        verification_code: code,
        verification_sent_at: new Date().toISOString(),
        verified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    const sent = await sendVerificationSMS(tenantId, normalizedPhone, code);
    return { contactId: existing.id, verificationSent: sent };
  }

  // Create new primary contact
  const { data, error } = await supabase
    .from("exo_emergency_contacts")
    .insert({
      tenant_id: tenantId,
      phone: normalizedPhone,
      name,
      relationship,
      is_primary: true,
      verification_code: code,
      verification_sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    logger.error("[EmergencyContact] Failed to create:", {
      tenantId,
      error: error.message,
    });
    return { contactId: "", verificationSent: false };
  }

  const sent = await sendVerificationSMS(tenantId, normalizedPhone, code);
  return { contactId: data.id, verificationSent: sent };
}

/**
 * Verify emergency contact with the code they received.
 */
export async function verifyEmergencyContact(
  contactId: string,
  code: string,
): Promise<boolean> {
  const supabase = getServiceSupabase();

  const { data: contact } = await supabase
    .from("exo_emergency_contacts")
    .select("verification_code, verification_sent_at")
    .eq("id", contactId)
    .single();

  if (!contact) return false;

  // Check code expiry (24 hours)
  if (contact.verification_sent_at) {
    const sentAt = new Date(contact.verification_sent_at);
    const hoursElapsed = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60);
    if (hoursElapsed > 24) {
      logger.warn("[EmergencyContact] Verification code expired:", contactId);
      return false;
    }
  }

  // Check code match
  if (contact.verification_code !== code) {
    return false;
  }

  // Mark as verified
  await supabase
    .from("exo_emergency_contacts")
    .update({
      verified: true,
      verified_at: new Date().toISOString(),
      verification_code: null, // Clear code after use
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId);

  return true;
}

/**
 * Get primary emergency contact for a tenant.
 */
export async function getPrimaryEmergencyContact(
  tenantId: string,
): Promise<EmergencyContact | null> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("exo_emergency_contacts")
    .select(
      "id, tenant_id, phone, name, relationship, verified, is_primary, verified_at",
    )
    .eq("tenant_id", tenantId)
    .eq("is_primary", true)
    .maybeSingle();

  return data as EmergencyContact | null;
}

/**
 * Escalate to emergency contact during a crisis.
 * ONLY contacts verified contacts.
 * NEVER shares user data — only informs that "attention may be needed."
 */
export async function escalateToCrisisContact(
  tenantId: string,
  crisisType: string,
  severity: string,
): Promise<{ escalated: boolean; reason: string }> {
  const contact = await getPrimaryEmergencyContact(tenantId);

  if (!contact) {
    logger.warn("[EmergencyContact] No emergency contact set:", tenantId);
    return { escalated: false, reason: "no_contact_set" };
  }

  if (!contact.verified) {
    logger.warn("[EmergencyContact] Contact not verified:", {
      tenantId,
      contactId: contact.id,
    });
    return { escalated: false, reason: "contact_not_verified" };
  }

  // Get tenant name for the message
  const supabase = getServiceSupabase();
  const { data: tenant } = await supabase
    .from("exo_tenants")
    .select("name, first_name, iors_name")
    .eq("id", tenantId)
    .single();

  const userName = tenant?.first_name || tenant?.name || "Twoja bliska osoba";
  const iorsName = tenant?.iors_name || "IORS";

  // Send crisis notification SMS — NO user data shared
  const message = `[${iorsName}] Sytuacja moze wymagac Twojej uwagi. ${userName} moze potrzebowac wsparcia. Prosze skontaktuj sie z nim/nia. W razie zagrozenia zycia dzwon 112.`;

  try {
    const sent = await sendSMS(contact.phone, message);

    logger.info("[EmergencyContact] Crisis escalation:", {
      tenantId,
      contactId: contact.id,
      crisisType,
      severity,
      smsSent: sent,
    });

    return { escalated: sent, reason: sent ? "sms_sent" : "sms_failed" };
  } catch (error) {
    logger.error("[EmergencyContact] Crisis escalation failed:", {
      tenantId,
      error: error instanceof Error ? error.message : error,
    });
    return { escalated: false, reason: "sms_error" };
  }
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (!cleaned.startsWith("+")) {
    if (cleaned.startsWith("48")) {
      cleaned = "+" + cleaned;
    } else {
      cleaned = "+48" + cleaned;
    }
  }
  return cleaned;
}

async function sendVerificationSMS(
  tenantId: string,
  phone: string,
  code: string,
): Promise<boolean> {
  // Get tenant name
  const supabase = getServiceSupabase();
  const { data: tenant } = await supabase
    .from("exo_tenants")
    .select("name, first_name")
    .eq("id", tenantId)
    .single();

  const userName = tenant?.first_name || tenant?.name || "Uzytkownik";
  const message = `ExoSkull: ${userName} wskazal Cie jako kontakt zaufania. Podaj mu/jej ten kod: ${code}`;

  return sendSMS(phone, message);
}

async function sendSMS(to: string, body: string): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    logger.error("[EmergencyContact] Twilio credentials missing");
    return false;
  }

  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, authToken);

    await client.messages.create({
      body,
      from: fromNumber,
      to,
    });

    return true;
  } catch (error) {
    logger.error("[EmergencyContact] SMS send failed:", {
      to,
      error: error instanceof Error ? error.message : error,
    });
    return false;
  }
}
