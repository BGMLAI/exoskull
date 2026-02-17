/**
 * IORS Communication Tools
 *
 * Tools for sending messages and making calls via conversation.
 * - make_call: Make an outbound call on behalf of the user
 * - send_sms: Send an SMS message
 * - send_email: Send an email via Resend
 * - send_whatsapp: Send a WhatsApp message (placeholder)
 * - send_messenger: Send a Facebook Messenger message (placeholder)
 */

import type { ToolDefinition } from "./shared";
import { getServiceSupabase } from "@/lib/supabase/service";
import { makeOutboundCall } from "@/lib/voice/twilio-client";
import { appendMessage } from "@/lib/unified-thread";

import { logger } from "@/lib/logger";

const E164_REGEX = /^\+?[1-9]\d{1,14}$/;

/** Normalize phone number to E.164 format */
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

/** Validate phone number looks like E.164 after normalization */
function isValidPhone(phone: string): boolean {
  return E164_REGEX.test(phone.replace(/[\s\-\(\)]/g, ""));
}

export const communicationTools: ToolDefinition[] = [
  {
    definition: {
      name: "make_call",
      description:
        "Zadzwoń do osoby trzeciej w imieniu użytkownika (pizzeria, lekarz, firma, znajomy). Zbierz WSZYSTKIE szczegóły PRZED wywołaniem: numer, cel rozmowy, co powiedzieć/zamówić.",
      input_schema: {
        type: "object" as const,
        properties: {
          phone_number: {
            type: "string",
            description:
              "Numer telefonu do zadzwonienia (format: +48XXXXXXXXX lub XXXXXXXXX)",
          },
          purpose: {
            type: "string",
            description:
              'Cel rozmowy - krótko (np. "zamówienie pizzy", "umówienie wizyty u dentysty")',
          },
          instructions: {
            type: "string",
            description:
              'Dokładne instrukcje co powiedzieć/zamówić/ustalić (np. "Zamów pizzę margheritę, odbiór osobisty, na nazwisko Bogumił")',
          },
          user_name: {
            type: "string",
            description: "Imię użytkownika w imieniu którego dzwonisz",
          },
        },
        required: ["phone_number", "purpose", "instructions"],
      },
    },
    execute: async (input, tenantId) => {
      const rawPhone = input.phone_number as string;
      if (!rawPhone || !isValidPhone(rawPhone)) {
        return `Nieprawidłowy numer telefonu: "${rawPhone}". Podaj numer w formacie +48XXXXXXXXX.`;
      }
      const phoneNumber = normalizePhone(rawPhone);
      const purpose = input.purpose as string;
      const instructions = input.instructions as string;
      const userName = (input.user_name as string) || "użytkownik";
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://exoskull.xyz";

      logger.info("[CommunicationTools] make_call:", { phoneNumber, purpose });

      try {
        const supabase = getServiceSupabase();
        const { data: delegateSession, error: sessionError } = await supabase
          .from("exo_voice_sessions")
          .insert({
            call_sid: `delegate_${Date.now()}`,
            tenant_id: tenantId,
            status: "active",
            messages: [],
            started_at: new Date().toISOString(),
            metadata: {
              mode: "delegate",
              purpose,
              instructions,
              user_name: userName,
              target_phone: phoneNumber,
            },
          })
          .select("id")
          .single();

        if (sessionError) {
          console.error(
            "[CommunicationTools] Delegate session error:",
            sessionError,
          );
          return "Błąd: nie udało się przygotować rozmowy";
        }

        const result = await makeOutboundCall({
          to: phoneNumber,
          webhookUrl: `${APP_URL}/api/twilio/voice/delegate?action=start&session_id=${delegateSession.id}`,
          statusCallbackUrl: `${APP_URL}/api/twilio/status`,
          timeout: 45,
        });

        await supabase
          .from("exo_voice_sessions")
          .update({ call_sid: result.callSid })
          .eq("id", delegateSession.id);

        return `Dzwonię pod ${input.phone_number}. Powiadomię Cię jak skończę.`;
      } catch (callError) {
        const errMsg =
          callError instanceof Error ? callError.message : String(callError);
        console.error("[CommunicationTools] make_call error:", {
          error: errMsg,
          phoneNumber,
          purpose,
          tenantId,
        });
        return `Nie udało się zadzwonić pod ${input.phone_number}: ${errMsg}`;
      }
    },
  },
  {
    definition: {
      name: "send_sms",
      description: "Wyślij SMS do dowolnego numeru w imieniu użytkownika.",
      input_schema: {
        type: "object" as const,
        properties: {
          phone_number: {
            type: "string",
            description: "Numer telefonu odbiorcy",
          },
          message: {
            type: "string",
            description: "Treść wiadomości SMS",
          },
        },
        required: ["phone_number", "message"],
      },
    },
    execute: async (input, tenantId) => {
      const phoneNumber = normalizePhone(input.phone_number as string);
      const message = input.message as string;

      logger.info("[CommunicationTools] send_sms:", {
        phoneNumber,
        messageLength: message.length,
      });

      try {
        const twilio = (await import("twilio")).default;
        const twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID!,
          process.env.TWILIO_AUTH_TOKEN!,
        );
        await twilioClient.messages.create({
          to: phoneNumber,
          from: process.env.TWILIO_PHONE_NUMBER!,
          body: message,
        });
        await appendMessage(tenantId, {
          role: "assistant",
          content: `[SMS do ${input.phone_number}]: ${message}`,
          channel: "sms",
          direction: "outbound",
          source_type: "voice_session",
        }).catch((err) => {
          logger.warn(
            "[CommunicationTools] Failed to append SMS to unified thread:",
            {
              error: err instanceof Error ? err.message : String(err),
              tenantId,
              phone: input.phone_number,
            },
          );
        });
        return `SMS wysłany do ${input.phone_number}`;
      } catch (smsError) {
        console.error("[CommunicationTools] send_sms error:", smsError);
        return `Nie udało się wysłać SMS do ${input.phone_number}`;
      }
    },
  },
  {
    definition: {
      name: "send_email",
      description: "Wyślij email w imieniu użytkownika.",
      input_schema: {
        type: "object" as const,
        properties: {
          to: {
            type: "string",
            description: "Adres email odbiorcy",
          },
          subject: {
            type: "string",
            description: "Temat emaila",
          },
          body: {
            type: "string",
            description: "Treść emaila",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
    execute: async (input, tenantId) => {
      const toEmail = input.to as string;
      const subject = input.subject as string;
      const body = input.body as string;

      // Try Composio Gmail first (sends FROM user's actual email)
      try {
        const { hasConnection, executeAction } =
          await import("@/lib/integrations/composio-adapter");
        const gmailConnected = await hasConnection(tenantId, "GMAIL");
        if (gmailConnected) {
          logger.info("[CommunicationTools] send_email via Composio Gmail:", {
            tenantId,
            to: toEmail,
          });
          const result = await executeAction("GMAIL_SEND_EMAIL", tenantId, {
            to: toEmail,
            subject,
            body,
          });
          if (result.success) {
            await appendMessage(tenantId, {
              role: "assistant",
              content: `[Email via Gmail do ${toEmail}] Temat: ${subject}`,
              channel: "email",
              direction: "outbound",
              source_type: "voice_session",
            }).catch(() => {});
            return `Email wysłany do ${toEmail} z Twojego konta Gmail.`;
          }
          logger.warn(
            "[CommunicationTools] Composio Gmail failed, falling back to Resend:",
            result.error,
          );
        }
      } catch (composioErr) {
        logger.warn(
          "[CommunicationTools] Composio check failed, using Resend:",
          {
            error:
              composioErr instanceof Error ? composioErr.message : composioErr,
          },
        );
      }

      // Fallback: Resend (sends FROM iors@exoskull.xyz)
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (!RESEND_API_KEY) {
        return "Email nie jest jeszcze skonfigurowany. Powiedz 'połącz Gmail' żeby wysyłać ze swojego konta.";
      }

      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "IORS <iors@exoskull.xyz>",
            to: [toEmail],
            subject,
            text: body,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            "[CommunicationTools] send_email Resend error:",
            errorText,
          );
          return `Nie udało się wysłać emaila: ${response.status}`;
        }

        await appendMessage(tenantId, {
          role: "assistant",
          content: `[Email do ${toEmail}] Temat: ${subject}`,
          channel: "email",
          direction: "outbound",
          source_type: "voice_session",
        }).catch((err) => {
          logger.warn(
            "[CommunicationTools] Failed to append email to unified thread:",
            {
              error: err instanceof Error ? err.message : String(err),
              tenantId,
              email: toEmail,
            },
          );
        });
        return `Email wysłany do ${toEmail} (z iors@exoskull.xyz)`;
      } catch (emailError) {
        console.error("[CommunicationTools] send_email error:", emailError);
        return `Nie udało się wysłać emaila do ${toEmail}`;
      }
    },
  },
  {
    definition: {
      name: "send_whatsapp",
      description:
        "Wyślij wiadomość WhatsApp do osoby z podanym numerem telefonu.",
      input_schema: {
        type: "object" as const,
        properties: {
          phone_number: {
            type: "string",
            description: "Numer telefonu odbiorcy (z kodem kraju, np. +48...)",
          },
          message: {
            type: "string",
            description: "Treść wiadomości WhatsApp",
          },
        },
        required: ["phone_number", "message"],
      },
    },
    execute: async (input, tenantId) => {
      const phoneNumber = normalizePhone(input.phone_number as string);
      const message = input.message as string;

      logger.info("[CommunicationTools] send_whatsapp:", {
        phoneNumber,
        messageLength: message.length,
      });

      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber =
        process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER;

      if (!sid || !token || !fromNumber) {
        return "WhatsApp nie jest jeszcze skonfigurowany. Spróbuj SMS.";
      }

      try {
        const twilio = (await import("twilio")).default;
        const twilioClient = twilio(sid, token);
        await twilioClient.messages.create({
          to: `whatsapp:${phoneNumber}`,
          from: `whatsapp:${fromNumber}`,
          body: message,
        });

        await appendMessage(tenantId, {
          role: "assistant",
          content: `[WhatsApp do ${input.phone_number}]: ${message}`,
          channel: "whatsapp",
          direction: "outbound",
          source_type: "voice_session",
        }).catch((err) => {
          logger.warn(
            "[CommunicationTools] Failed to append WhatsApp to thread:",
            { error: err instanceof Error ? err.message : String(err) },
          );
        });

        return `WhatsApp wysłany do ${input.phone_number}`;
      } catch (waError) {
        console.error("[CommunicationTools] send_whatsapp error:", {
          error: waError instanceof Error ? waError.message : String(waError),
          phoneNumber,
        });
        return `Nie udało się wysłać WhatsApp do ${input.phone_number}. Spróbuj SMS.`;
      }
    },
  },
  {
    definition: {
      name: "send_messenger",
      description:
        "Wyślij wiadomość Facebook Messenger do kontaktu (po imieniu).",
      input_schema: {
        type: "object" as const,
        properties: {
          contact_name: {
            type: "string",
            description: "Imię i nazwisko kontaktu (szukamy w CRM)",
          },
          message: {
            type: "string",
            description: "Treść wiadomości Messenger",
          },
        },
        required: ["contact_name", "message"],
      },
    },
    execute: async (input: Record<string, unknown>, tenantId?: string) => {
      const contactName = input.contact_name as string;
      const message = input.message as string;

      if (!tenantId) {
        return "Błąd: brak identyfikatora użytkownika.";
      }

      logger.info("[CommunicationTools] send_messenger:", {
        tenantId,
        contact: contactName,
        messageLength: message.length,
      });

      try {
        const { hasConnection, executeAction } =
          await import("@/lib/integrations/composio-adapter");
        const fbConnected = await hasConnection(tenantId, "FACEBOOK");

        if (!fbConnected) {
          return "Messenger wymaga połączenia z Facebook. Powiedz 'połącz Facebook' albo użyj connect_rig.";
        }

        const result = await executeAction("FACEBOOK_SEND_MESSAGE", tenantId, {
          recipient_name: contactName,
          message,
        });

        if (result.success) {
          await appendMessage(tenantId, {
            role: "assistant",
            content: `[Messenger do ${contactName}]: ${message}`,
            channel: "messenger",
            direction: "outbound",
            source_type: "voice_session",
          }).catch((err) => {
            logger.warn(
              "[CommunicationTools] Failed to append Messenger to thread:",
              { error: err instanceof Error ? err.message : String(err) },
            );
          });
          return `Messenger wysłany do ${contactName}.`;
        }

        return `Nie udało się wysłać Messengera do ${contactName}: ${result.error || "nieznany błąd"}`;
      } catch (err) {
        console.error("[CommunicationTools] send_messenger error:", {
          tenantId,
          contact: contactName,
          error: err instanceof Error ? err.message : err,
        });
        return `Błąd wysyłania Messengera: ${err instanceof Error ? err.message : "nieznany"}`;
      }
    },
  },
];
