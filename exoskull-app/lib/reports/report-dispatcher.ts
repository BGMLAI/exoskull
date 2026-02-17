/**
 * Report Dispatcher
 *
 * Sends generated report text to a tenant via their preferred channel.
 * Falls back through available channels if the primary one fails.
 *
 * Channels: telegram → whatsapp → slack → discord → signal → imessage → sms → email
 * (voice and web_chat excluded — reports are text-only)
 *
 * Logs every sent report to exo_unified_messages via appendMessage().
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { telegramAdapter } from "@/lib/gateway/adapters/telegram";
import { slackAdapter } from "@/lib/gateway/adapters/slack";
import { discordAdapter } from "@/lib/gateway/adapters/discord";
import { signalAdapter } from "@/lib/gateway/adapters/signal";
import { imessageAdapter } from "@/lib/gateway/adapters/imessage";
import { getWhatsAppClient } from "@/lib/channels/whatsapp/client";
import { appendMessage, UnifiedChannel } from "@/lib/unified-thread";

import { logger } from "@/lib/logger";
// ============================================================================
// TYPES
// ============================================================================

export type ReportType = "weekly" | "monthly" | "insight" | "proactive";

export interface DispatchReportResult {
  success: boolean;
  channel: string;
  error?: string;
}

interface TenantChannelInfo {
  id: string;
  phone: string | null;
  email: string | null;
  preferred_channel: string | null;
  telegram_chat_id: string | null;
  slack_user_id: string | null;
  discord_user_id: string | null;
  signal_phone: string | null;
  imessage_address: string | null;
  language: string;
  name: string | null;
}

type TextChannel =
  | "telegram"
  | "whatsapp"
  | "slack"
  | "discord"
  | "signal"
  | "imessage"
  | "sms"
  | "email"
  | "web_chat";

// Fallback order — web_chat is last resort (saves to unified thread, visible in dashboard)
const FALLBACK_CHAIN: TextChannel[] = [
  "telegram",
  "whatsapp",
  "slack",
  "discord",
  "signal",
  "imessage",
  "sms",
  "email",
  "web_chat",
];

// ============================================================================
// HELPERS
// ============================================================================

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function canSendVia(channel: TextChannel, tenant: TenantChannelInfo): boolean {
  switch (channel) {
    case "telegram":
      return !!tenant.telegram_chat_id;
    case "whatsapp":
      return !!tenant.phone;
    case "slack":
      return !!tenant.slack_user_id;
    case "discord":
      return !!tenant.discord_user_id;
    case "signal":
      return !!tenant.signal_phone && !!process.env.SIGNAL_API_URL;
    case "imessage":
      return !!tenant.imessage_address && !!process.env.BLUEBUBBLES_URL;
    case "sms":
      return !!tenant.phone && !!process.env.TWILIO_ACCOUNT_SID;
    case "email":
      return !!tenant.email && !!process.env.RESEND_API_KEY;
    case "web_chat":
      return true; // Always available — writes to unified thread (visible in dashboard)
    default:
      return false;
  }
}

// ============================================================================
// CHANNEL SENDERS
// ============================================================================

async function sendViaTelegram(chatId: string, text: string): Promise<void> {
  await telegramAdapter.sendResponse(chatId, text);
}

async function sendViaWhatsApp(phone: string, text: string): Promise<void> {
  const client = getWhatsAppClient();
  if (!client) throw new Error("WhatsApp client not configured");
  await client.sendTextMessage(phone, text);
}

async function sendViaSlack(userId: string, text: string): Promise<void> {
  await slackAdapter.sendResponse(userId, text);
}

async function sendViaDiscord(userId: string, text: string): Promise<void> {
  await discordAdapter.sendResponse(userId, text);
}

async function sendViaSignal(phone: string, text: string): Promise<void> {
  await signalAdapter.sendResponse(phone, text);
}

async function sendViaImessage(address: string, text: string): Promise<void> {
  await imessageAdapter.sendResponse(address, text);
}

async function sendViaSms(phone: string, text: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER!;

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: phone,
        From: fromNumber,
        Body: text,
      }),
    },
  );

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || `Twilio SMS error: ${response.status}`);
  }
}

async function sendViaEmail(
  email: string,
  text: string,
  reportType: ReportType,
  language: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY!;

  const subjects: Record<string, Record<string, string>> = {
    weekly: {
      pl: "Podsumowanie tygodnia od ExoSkull",
      en: "Your weekly summary from ExoSkull",
    },
    monthly: {
      pl: "Podsumowanie miesiąca od ExoSkull",
      en: "Your monthly summary from ExoSkull",
    },
    insight: {
      pl: "Dzisiejsze spostrzeżenia od ExoSkull",
      en: "Today's insights from ExoSkull",
    },
    proactive: {
      pl: "Wiadomość od ExoSkull",
      en: "A message from ExoSkull",
    },
  };

  const subject = subjects[reportType]?.[language] || subjects[reportType]?.pl;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "IORS <iors@exoskull.xyz>",
      to: [email],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend error ${response.status}: ${errorText}`);
  }
}

// ============================================================================
// CORE DISPATCH
// ============================================================================

async function sendToChannel(
  channel: TextChannel,
  tenant: TenantChannelInfo,
  text: string,
  reportType: ReportType,
): Promise<void> {
  switch (channel) {
    case "telegram":
      await sendViaTelegram(tenant.telegram_chat_id!, text);
      break;
    case "whatsapp":
      await sendViaWhatsApp(tenant.phone!, text);
      break;
    case "slack":
      await sendViaSlack(tenant.slack_user_id!, text);
      break;
    case "discord":
      await sendViaDiscord(tenant.discord_user_id!, text);
      break;
    case "signal":
      await sendViaSignal(tenant.signal_phone!, text);
      break;
    case "imessage":
      await sendViaImessage(tenant.imessage_address!, text);
      break;
    case "sms":
      await sendViaSms(tenant.phone!, text);
      break;
    case "email":
      await sendViaEmail(tenant.email!, text, reportType, tenant.language);
      break;
    case "web_chat":
      // No external send needed — message will be logged to unified thread below
      // User sees it next time they open the dashboard chat
      break;
    default:
      throw new Error(`Unsupported channel: ${channel}`);
  }
}

/**
 * Dispatch a report to a tenant via their preferred channel with fallback.
 */
export async function dispatchReport(
  tenantId: string,
  reportText: string,
  reportType: ReportType,
): Promise<DispatchReportResult> {
  const supabase = getAdminClient();

  // Fetch tenant channel info
  const { data: tenant, error: tenantErr } = await supabase
    .from("exo_tenants")
    .select(
      "id, phone, email, preferred_channel, telegram_chat_id, slack_user_id, discord_user_id, signal_phone, imessage_address, language, name",
    )
    .eq("id", tenantId)
    .single();

  if (tenantErr || !tenant) {
    logger.error("[ReportDispatcher] Tenant not found:", {
      tenantId,
      error: tenantErr?.message,
    });
    return { success: false, channel: "none", error: "Tenant not found" };
  }

  const info: TenantChannelInfo = {
    id: tenant.id,
    phone: tenant.phone,
    email: tenant.email,
    preferred_channel: tenant.preferred_channel,
    telegram_chat_id: tenant.telegram_chat_id,
    slack_user_id: tenant.slack_user_id,
    discord_user_id: tenant.discord_user_id,
    signal_phone: tenant.signal_phone,
    imessage_address: tenant.imessage_address,
    language: tenant.language || "pl",
    name: tenant.name,
  };

  // Build channel order: preferred first, then fallback chain
  const preferred = (info.preferred_channel || "whatsapp") as TextChannel;
  const channelOrder: TextChannel[] = [
    preferred,
    ...FALLBACK_CHAIN.filter((c) => c !== preferred),
  ];

  // Try channels in order
  const errors: string[] = [];

  for (const channel of channelOrder) {
    if (!canSendVia(channel, info)) continue;

    try {
      await sendToChannel(channel, info, reportText, reportType);

      // Log to unified thread
      const unifiedChannel: UnifiedChannel =
        channel === "sms" ? "sms" : (channel as UnifiedChannel);

      try {
        await appendMessage(tenantId, {
          role: "assistant",
          content: reportText,
          channel: unifiedChannel,
          direction: "outbound",
          metadata: { report_type: reportType, dispatched_via: channel },
        });
      } catch (logErr) {
        logger.error("[ReportDispatcher] Failed to log message:", {
          tenantId,
          error: logErr instanceof Error ? logErr.message : String(logErr),
        });
      }

      if (channel === "web_chat") {
        logger.warn(
          `[ReportDispatcher] Only web_chat available for ${tenantId} — user won't see until dashboard visit`,
          { tenantId, reportType },
        );
      } else {
        logger.info(
          `[ReportDispatcher] ${reportType} report sent to ${tenantId} via ${channel}`,
        );
      }
      return { success: true, channel };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${channel}: ${msg}`);
      logger.error(`[ReportDispatcher] ${channel} failed for ${tenantId}:`, {
        error: msg,
      });
    }
  }

  // All channels failed
  const errorSummary = errors.join("; ");
  logger.error(`[ReportDispatcher] All channels failed for ${tenantId}:`, {
    errors,
  });
  return {
    success: false,
    channel: "none",
    error: `All channels failed: ${errorSummary}`,
  };
}
