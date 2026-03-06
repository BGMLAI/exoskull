/**
 * v3 Channel Tools — Phase 6
 *
 * 3 outbound tools: send_sms, send_email, make_call
 * Thin wrappers around existing Twilio/Resend infrastructure.
 */

import { type V3ToolDefinition, errMsg } from "./index";

// ============================================================================
// #1 send_sms — Twilio SMS
// ============================================================================

const sendSmsTool: V3ToolDefinition = {
  definition: {
    name: "send_sms",
    description:
      "Wyślij SMS. Użyj do powiadomień, przypomnień, briefingów. Automatycznie normalizuje numer (+48 jeśli brak).",
    input_schema: {
      type: "object" as const,
      properties: {
        phone_number: {
          type: "string",
          description:
            "Numer telefonu (E.164 np. +48123456789) lub z profilu usera",
        },
        message: {
          type: "string",
          description: "Treść SMS (max 1500 znaków, auto-przycinane)",
        },
        use_user_phone: {
          type: "boolean",
          description: "Użyj numeru z profilu usera zamiast podawać ręcznie",
        },
      },
      required: ["message"],
    },
  },
  timeoutMs: 15_000,
  async execute(input, tenantId) {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        return "Twilio nie skonfigurowane (brak TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER).";
      }

      let toNumber = input.phone_number as string | undefined;

      // Get user's phone if not provided
      if (!toNumber || input.use_user_phone) {
        const { getServiceSupabase } = await import("@/lib/supabase/service");
        const supabase = getServiceSupabase();
        const { data } = await supabase
          .from("exo_tenants")
          .select("phone")
          .eq("id", tenantId)
          .single();
        toNumber = data?.phone || toNumber;
      }

      if (!toNumber)
        return "Brak numeru telefonu. Podaj numer lub ustaw w profilu.";

      // Normalize to E.164
      if (!toNumber.startsWith("+")) {
        toNumber = toNumber.startsWith("48")
          ? `+${toNumber}`
          : `+48${toNumber}`;
      }

      const message = (input.message as string).slice(0, 1500);

      // Send via Twilio REST API
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const body = new URLSearchParams({
        To: toNumber,
        From: fromNumber,
        Body: message,
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
        body: body.toString(),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const err = await response.text();
        return `Błąd SMS: ${response.status} — ${err.slice(0, 200)}`;
      }

      const result = await response.json();

      // Log to autonomy log
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();
      await supabase.from("exo_autonomy_log").insert({
        tenant_id: tenantId,
        event_type: "sms_sent",
        payload: {
          to: toNumber,
          message_sid: result.sid,
          message: message.slice(0, 200),
          status: result.status,
        },
      });

      return `📱 SMS wysłany do ${toNumber}: "${message.slice(0, 100)}${message.length > 100 ? "..." : ""}" (SID: ${result.sid})`;
    } catch (err) {
      return `Błąd SMS: ${errMsg(err)}`;
    }
  },
};

// ============================================================================
// #2 send_email — Resend or raw SMTP
// ============================================================================

const sendEmailTool: V3ToolDefinition = {
  definition: {
    name: "send_email",
    description:
      "Wyślij email. Użyj do raportów, podsumowań, powiadomień. Obsługuje HTML i plain text.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: {
          type: "string",
          description: "Adres email odbiorcy (lub z profilu usera)",
        },
        subject: { type: "string", description: "Temat" },
        body: {
          type: "string",
          description: "Treść (Markdown → auto-konwersja do HTML)",
        },
        use_user_email: {
          type: "boolean",
          description: "Wyślij na email z profilu usera",
        },
      },
      required: ["subject", "body"],
    },
  },
  timeoutMs: 15_000,
  async execute(input, tenantId) {
    try {
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) return "Resend nie skonfigurowane (brak RESEND_API_KEY).";

      let toEmail = input.to as string | undefined;

      if (!toEmail || input.use_user_email) {
        const { getServiceSupabase } = await import("@/lib/supabase/service");
        const supabase = getServiceSupabase();
        const { data } = await supabase
          .from("exo_tenants")
          .select("email")
          .eq("id", tenantId)
          .single();
        toEmail = data?.email || toEmail;
      }

      if (!toEmail)
        return "Brak adresu email. Podaj email lub ustaw w profilu.";

      // Try verified domain first, fallback to Resend test address
      const fromAddresses = [
        "ExoSkull <noreply@exoskull.xyz>",
        "Onboarding <onboarding@resend.dev>",
      ];

      let response: Response | null = null;
      let lastErr = "";

      for (const fromAddr of fromAddresses) {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: fromAddr,
            to: [toEmail],
            subject: input.subject as string,
            text: input.body as string,
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) break;
        lastErr = await response.text();
      }

      if (!response?.ok) {
        return `Błąd email: ${response?.status} — ${lastErr.slice(0, 200)}`;
      }

      const result = await response.json();

      // Log
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();
      await supabase.from("exo_autonomy_log").insert({
        tenant_id: tenantId,
        event_type: "email_sent",
        payload: {
          to: toEmail,
          subject: input.subject,
          email_id: result.id,
        },
      });

      return `📧 Email wysłany do ${toEmail}: "${input.subject}" (ID: ${result.id})`;
    } catch (err) {
      return `Błąd email: ${errMsg(err)}`;
    }
  },
};

// ============================================================================
// #3 make_call — Twilio outbound voice call
// ============================================================================

const makeCallTool: V3ToolDefinition = {
  definition: {
    name: "make_call",
    description:
      "Zadzwoń na numer. Agent prowadzi rozmowę telefoniczną wg instrukcji. Użyj do umówienia wizyt, negocjacji, follow-upów.",
    input_schema: {
      type: "object" as const,
      properties: {
        phone_number: {
          type: "string",
          description: "Numer do zadzwonienia (E.164)",
        },
        purpose: { type: "string", description: "Cel rozmowy" },
        instructions: {
          type: "string",
          description:
            "Szczegółowe instrukcje co powiedzieć i czego się dowiedzieć",
        },
        user_name: {
          type: "string",
          description: "Imię użytkownika (do przedstawienia się)",
        },
        call_user: {
          type: "boolean",
          description: "Zadzwoń do samego usera (z profilu)",
        },
      },
      required: ["purpose", "instructions"],
    },
  },
  timeoutMs: 20_000,
  async execute(input, tenantId) {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        return "Twilio nie skonfigurowane.";
      }

      let toNumber = input.phone_number as string | undefined;

      if (!toNumber || input.call_user) {
        const { getServiceSupabase } = await import("@/lib/supabase/service");
        const supabase = getServiceSupabase();
        const { data } = await supabase
          .from("exo_tenants")
          .select("phone")
          .eq("id", tenantId)
          .single();
        toNumber = data?.phone || toNumber;
      }

      if (!toNumber) return "Brak numeru telefonu.";

      if (!toNumber.startsWith("+")) {
        toNumber = toNumber.startsWith("48")
          ? `+${toNumber}`
          : `+48${toNumber}`;
      }

      // Get the base URL for the voice webhook
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://exoskull.xyz";

      // Make outbound call via Twilio REST API
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
      const purposeParam = encodeURIComponent(
        (input.purpose as string).slice(0, 200),
      );
      const instructionsParam = input.instructions
        ? `&instructions=${encodeURIComponent((input.instructions as string).slice(0, 500))}`
        : "";
      const body = new URLSearchParams({
        To: toNumber,
        From: fromNumber,
        Url: `${baseUrl}/api/twilio/voice?action=start&tenant_id=${tenantId}&purpose=${purposeParam}${instructionsParam}`,
        StatusCallback: `${baseUrl}/api/twilio/voice?action=end&tenant_id=${tenantId}`,
        Timeout: "30",
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const err = await response.text();
        return `Błąd dzwonienia: ${response.status} — ${err.slice(0, 200)}`;
      }

      const result = await response.json();

      // Log
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const supabase = getServiceSupabase();
      await supabase.from("exo_autonomy_log").insert({
        tenant_id: tenantId,
        event_type: "call_made",
        payload: {
          to: toNumber,
          call_sid: result.sid,
          purpose: input.purpose,
          instructions: (input.instructions as string).slice(0, 500),
          status: result.status,
        },
      });

      return `📞 Dzwonię na ${toNumber} — "${input.purpose}". Call SID: ${result.sid}. Status: ${result.status}.`;
    } catch (err) {
      return `Błąd: ${errMsg(err)}`;
    }
  },
};

// ============================================================================
// EXPORT
// ============================================================================

export const channelTools: V3ToolDefinition[] = [
  sendSmsTool,
  sendEmailTool,
  makeCallTool,
];
