/**
 * Emergency Contact Notifier — Layer 16 Autonomous Outbound
 *
 * Sends SMS to user's emergency contact when:
 * 1. Crisis detected AND user hasn't responded to follow-up
 * 2. User consented to emergency contact notification
 * 3. Crisis type matches contact's notify_for[] array
 *
 * SAFETY:
 * - Only sends if user_consented = true
 * - Only sends for matching crisis types
 * - Logs everything to exo_proactive_log
 * - Never reveals conversation details — only that user is unreachable
 */

import { createServiceClient } from "@/lib/supabase/service-client";
import twilio from "twilio";

// ============================================================================
// TYPES
// ============================================================================

interface EmergencyContact {
  id: string;
  tenant_id: string;
  name: string;
  relationship: string | null;
  phone: string;
  notify_for: string[];
  notify_after_hours: number;
  user_consented: boolean;
  is_active: boolean;
  last_notified_at: string | null;
  notification_count: number;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Notify the user's emergency contact via SMS.
 *
 * @param tenantId - User whose emergency contact to notify
 * @param reason - Why we're notifying (human-readable)
 * @param crisisType - Crisis type for filtering contacts
 * @returns Success status + contacted person's name
 */
export async function notifyEmergencyContact(
  tenantId: string,
  reason: string,
  crisisType?: string,
): Promise<{
  success: boolean;
  contactedName?: string;
  error?: string;
}> {
  try {
    const supabase = createServiceClient();

    // Get user info
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("display_name, phone")
      .eq("id", tenantId)
      .single();

    if (!tenant) {
      return { success: false, error: "Tenant not found" };
    }

    // Find active emergency contacts with consent
    const { data: contacts } = await supabase
      .from("exo_emergency_contacts")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .eq("user_consented", true)
      .order("created_at", { ascending: true });

    if (!contacts || contacts.length === 0) {
      console.log(
        "[EmergencyNotifier] No consented emergency contacts for tenant:",
        tenantId,
      );
      return { success: false, error: "No emergency contacts configured" };
    }

    // Filter by crisis type if specified
    const matchingContacts = crisisType
      ? (contacts as EmergencyContact[]).filter((c) =>
          c.notify_for.includes(crisisType),
        )
      : (contacts as EmergencyContact[]);

    if (matchingContacts.length === 0) {
      return {
        success: false,
        error: `No contacts configured for crisis type: ${crisisType}`,
      };
    }

    // Notify first matching contact
    const contact = matchingContacts[0];

    // Build message (don't reveal conversation details)
    const userName = tenant.display_name || "użytkownik";
    const relationship = contact.relationship
      ? ` (${contact.relationship} ${userName})`
      : "";

    const message = [
      `Dzień dobry, ${contact.name}${relationship}.`,
      `Jestem IORS, asystent ${userName}.`,
      `${userName} nie odpowiada od dłuższego czasu i chcieliśmy się upewnić że wszystko jest w porządku.`,
      `Jeśli możesz, skontaktuj się z ${userName}.`,
      `W razie potrzeby: Telefon Zaufania 116 123, Pogotowie 112.`,
    ].join(" ");

    // Send SMS
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER!;

    const twilioClient = twilio(accountSid, authToken);
    await twilioClient.messages.create({
      to: contact.phone,
      from: fromNumber,
      body: message,
    });

    // Update contact record
    await supabase
      .from("exo_emergency_contacts")
      .update({
        last_notified_at: new Date().toISOString(),
        notification_count: contact.notification_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contact.id);

    // Log to proactive log
    await supabase.from("exo_proactive_log").insert({
      tenant_id: tenantId,
      trigger_type: "crisis_followup",
      channel: "emergency",
      metadata: {
        contact_name: contact.name,
        contact_phone: contact.phone,
        crisis_type: crisisType,
        reason,
      },
    });

    console.log(
      `[EmergencyNotifier] Notified ${contact.name} (${contact.phone}) for tenant ${tenantId}`,
    );

    return { success: true, contactedName: contact.name };
  } catch (error) {
    console.error("[EmergencyNotifier] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
