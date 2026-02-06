/**
 * Job Dispatcher for ExoSkull CRON
 *
 * Handles dispatching scheduled jobs to:
 * - Twilio (voice calls + SMS)
 * - Resend (email)
 * - WhatsApp (Meta Cloud API)
 * - Messenger (Meta Send API)
 */

import { createClient } from "@supabase/supabase-js";
import { getWhatsAppClient } from "@/lib/channels/whatsapp/client";
import { getMessengerClient } from "@/lib/channels/messenger/client";
import { telegramAdapter } from "@/lib/gateway/adapters/telegram";
import { slackAdapter } from "@/lib/gateway/adapters/slack";
import { discordAdapter } from "@/lib/gateway/adapters/discord";
import { signalAdapter } from "@/lib/gateway/adapters/signal";
import { imessageAdapter } from "@/lib/gateway/adapters/imessage";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface ScheduledJob {
  id: string;
  job_name: string;
  job_type: string;
  handler_endpoint: string;
  time_window_start: string;
  time_window_end: string;
  default_channel:
    | "voice"
    | "sms"
    | "email"
    | "whatsapp"
    | "messenger"
    | "telegram"
    | "slack"
    | "discord"
    | "signal"
    | "imessage"
    | "both";
  display_name: string;
}

export interface UserJobConfig {
  tenant_id: string;
  phone: string;
  email?: string;
  timezone: string;
  language: string;
  preferred_channel: string;
  custom_time: string | null;
  tenant_name: string;
  schedule_settings: {
    notification_channels?: {
      voice?: boolean;
      sms?: boolean;
      email?: boolean;
      whatsapp?: boolean;
      messenger?: boolean;
      telegram?: boolean;
      slack?: boolean;
      discord?: boolean;
      signal?: boolean;
      imessage?: boolean;
    };
    rate_limits?: { max_calls_per_day?: number; max_sms_per_day?: number };
    quiet_hours?: { start?: string; end?: string };
    skip_weekends?: boolean;
  } | null;
}

export interface DispatchResult {
  success: boolean;
  channel:
    | "voice"
    | "sms"
    | "email"
    | "whatsapp"
    | "messenger"
    | "telegram"
    | "slack"
    | "discord"
    | "signal"
    | "imessage";
  call_id?: string;
  message_sid?: string;
  error?: string;
  provider?:
    | "twilio"
    | "resend"
    | "meta"
    | "telegram"
    | "slack"
    | "discord"
    | "signal"
    | "bluebubbles";
}

// Twilio Configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

/**
 * Get the system prompt for a specific job type
 */
function getJobSystemPrompt(job: ScheduledJob, user: UserJobConfig): string {
  const name = user.tenant_name || "there";
  const language = user.language || "pl";

  const prompts: Record<string, Record<string, string>> = {
    morning_checkin: {
      pl: `Jesteś ExoSkull - drugi mózg użytkownika ${name}. Zadzwoniłeś o poranku żeby sprawdzić jak się czuje.
Zapytaj krótko:
1. "Cześć ${name}! Jak się dziś czujesz?"
2. Po odpowiedzi: "Energia od 1 do 10?"
3. "Jakieś plany na dziś?"
Bądź ciepły, krótki, nie przesadzaj. Zakończ: "Powodzenia! Do usłyszenia."`,
      en: `You are ExoSkull - ${name}'s second brain. You called for a morning check-in.
Ask briefly:
1. "Hey ${name}! How are you feeling today?"
2. After response: "Energy from 1 to 10?"
3. "Any plans for today?"
Be warm, brief. End: "Good luck! Talk later."`,
    },
    evening_checkin: {
      pl: `Jesteś ExoSkull - drugi mózg użytkownika ${name}. Zadzwoniłeś wieczorem na refleksję.
Zapytaj:
1. "Hej ${name}! Jak minął dzień?"
2. "Co poszło dobrze?"
3. "Co jutro inaczej?"
Bądź wspierający. Zakończ: "Dobranoc!"`,
      en: `You are ExoSkull - ${name}'s second brain. Evening reflection call.
Ask:
1. "Hey ${name}! How was your day?"
2. "What went well?"
3. "What would you do differently tomorrow?"
Be supportive. End: "Good night!"`,
    },
    weekly_preview: {
      pl: `Jesteś ExoSkull. Poniedziałkowy przegląd tygodnia dla ${name}.
1. "Dzień dobry! Jak tam weekend?"
2. "Co ważnego w tym tygodniu?"
3. "Jakieś priorytety?"
Krótko i na temat.`,
      en: `You are ExoSkull. Monday week preview for ${name}.
1. "Good morning! How was your weekend?"
2. "What's important this week?"
3. "Any priorities?"
Brief and to the point.`,
    },
    weekly_summary: {
      pl: `Jesteś ExoSkull. Piątkowe podsumowanie tygodnia dla ${name}.
1. "Hej! Koniec tygodnia - jak poszło?"
2. "Co było najtrudniejsze?"
3. "Plany na weekend?"`,
      en: `You are ExoSkull. Friday week summary for ${name}.
1. "Hey! Week's over - how did it go?"
2. "What was hardest?"
3. "Weekend plans?"`,
    },
  };

  const jobPrompts = prompts[job.job_type] || prompts.morning_checkin;
  return jobPrompts[language] || jobPrompts.pl;
}

/**
 * Dispatch a voice call via Twilio
 * Uses Twilio <Gather> for STT + Claude for LLM + ElevenLabs for TTS
 */
export async function dispatchVoiceCall(
  job: ScheduledJob,
  user: UserJobConfig,
): Promise<DispatchResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return {
      success: false,
      channel: "voice",
      error: "Twilio credentials not configured",
    };
  }

  if (!user.phone) {
    return {
      success: false,
      channel: "voice",
      error: "User has no phone number",
    };
  }

  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL ||
      "https://exoskull.app";
    const webhookUrl = `${baseUrl}/api/twilio/voice?action=start&tenant_id=${user.tenant_id}&job_type=${job.job_type}`;

    const authHeader = Buffer.from(
      `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`,
    ).toString("base64");

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: user.phone,
          From: TWILIO_PHONE_NUMBER,
          Url: webhookUrl,
          StatusCallback: `${baseUrl}/api/twilio/status`,
          Timeout: "30",
        }).toString(),
      },
    );

    const data = await response.json();

    if (response.ok && data.sid) {
      console.log(
        `[Dispatcher] Twilio call initiated for ${user.tenant_id}: ${data.sid}`,
      );
      return {
        success: true,
        channel: "voice",
        call_id: data.sid,
        provider: "twilio",
      };
    } else {
      console.error(
        `[Dispatcher] Twilio call failed for ${user.tenant_id}:`,
        data,
      );
      return {
        success: false,
        channel: "voice",
        error: data.message || JSON.stringify(data),
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[Dispatcher] Twilio dispatch error for ${user.tenant_id}:`,
      errorMessage,
    );
    return { success: false, channel: "voice", error: errorMessage };
  }
}

/**
 * Get SMS message for a job type
 */
function getSmsMessage(job: ScheduledJob, user: UserJobConfig): string {
  const name = user.tenant_name || "";
  const language = user.language || "pl";

  const messages: Record<string, Record<string, string>> = {
    day_summary: {
      pl: `Dzień dobry${name ? ` ${name}` : ""}! Twoje podsumowanie dnia czeka w ExoSkull. Odpowiedz "zadzwoń" jeśli chcesz pogadać.`,
      en: `Good morning${name ? ` ${name}` : ""}! Your day summary is ready in ExoSkull. Reply "call" if you want to chat.`,
    },
    meal_reminder: {
      pl: `Hej${name ? ` ${name}` : ""}! Nie zalogowałeś posiłku. Co dzisiaj jadłeś? Odpowiedz jednym zdaniem.`,
      en: `Hey${name ? ` ${name}` : ""}! No meal logged yet. What did you eat today? Reply with one sentence.`,
    },
    bedtime_reminder: {
      pl: `${name ? `${name}, ` : ""}czas się wyciszyć. Twój cel snu jest za 30 minut. Dobranoc!`,
      en: `${name ? `${name}, ` : ""}time to wind down. Your sleep goal is in 30 minutes. Good night!`,
    },
    task_overdue: {
      pl: `${name ? `${name}, ` : ""}masz przeterminowane zadania. Odpowiedz "zadzwoń" żeby przejrzeć listę.`,
      en: `${name ? `${name}, ` : ""}you have overdue tasks. Reply "call" to review.`,
    },
    goal_checkin: {
      pl: `Połowa miesiąca! Jak idą Twoje cele? Odpowiedz liczbą 1-10.`,
      en: `Halfway through the month! How are your goals going? Reply with 1-10.`,
    },
    social_alert: {
      pl: `${name ? `${name}, ` : ""}nie widziałem żadnych spotkań od 30 dni. Może czas na kawę z kimś?`,
      en: `${name ? `${name}, ` : ""}no social events in 30 days. Maybe time for a coffee with someone?`,
    },
  };

  const jobMessages = messages[job.job_name] || messages.day_summary;
  return jobMessages[language] || jobMessages.pl;
}

/**
 * Dispatch SMS via Twilio
 */
export async function dispatchSms(
  job: ScheduledJob,
  user: UserJobConfig,
): Promise<DispatchResult> {
  if (!user.phone) {
    return {
      success: false,
      channel: "sms",
      error: "User has no phone number",
    };
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return { success: false, channel: "sms", error: "Twilio not configured" };
  }

  const message = getSmsMessage(job, user);

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString(
              "base64",
            ),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: user.phone,
          From: TWILIO_PHONE_NUMBER,
          Body: message,
        }),
      },
    );

    const data = await response.json();

    if (response.ok && data.sid) {
      console.log(`[Dispatcher] SMS sent to ${user.tenant_id}: ${data.sid}`);
      return {
        success: true,
        channel: "sms",
        message_sid: data.sid,
        provider: "twilio",
      };
    } else {
      console.error(`[Dispatcher] SMS failed for ${user.tenant_id}:`, data);
      return {
        success: false,
        channel: "sms",
        error: data.message || JSON.stringify(data),
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[Dispatcher] SMS error for ${user.tenant_id}:`,
      errorMessage,
    );
    return { success: false, channel: "sms", error: errorMessage };
  }
}

/**
 * Dispatch Email via Resend
 */
export async function dispatchEmail(
  job: ScheduledJob,
  user: UserJobConfig,
): Promise<DispatchResult> {
  if (!user.email) {
    return {
      success: false,
      channel: "email",
      error: "User has no email address",
    };
  }

  if (!RESEND_API_KEY) {
    return {
      success: false,
      channel: "email",
      error: "Email not configured (missing RESEND_API_KEY)",
    };
  }

  const language = user.language || "pl";

  const subjects: Record<string, Record<string, string>> = {
    day_summary: {
      pl: "Twoje podsumowanie dnia od ExoSkull",
      en: "Your daily summary from ExoSkull",
    },
    weekly_summary: {
      pl: "Podsumowanie tygodnia od ExoSkull",
      en: "Your weekly summary from ExoSkull",
    },
  };

  const subject =
    subjects[job.job_name]?.[language] || subjects.day_summary[language];
  const body = getSmsMessage(job, user);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "IORS <iors@exoskull.xyz>",
        to: [user.email],
        subject,
        text: body,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Dispatcher] Email failed for ${user.tenant_id}:`,
        errorText,
      );
      return {
        success: false,
        channel: "email",
        error: `Resend error: ${response.status}`,
      };
    }

    console.log(`[Dispatcher] Email sent to ${user.tenant_id}`);
    return { success: true, channel: "email", provider: "resend" };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[Dispatcher] Email error for ${user.tenant_id}:`,
      errorMessage,
    );
    return { success: false, channel: "email", error: errorMessage };
  }
}

/**
 * Dispatch WhatsApp message via Meta Cloud API
 */
export async function dispatchWhatsApp(
  job: ScheduledJob,
  user: UserJobConfig,
): Promise<DispatchResult> {
  if (!user.phone) {
    return {
      success: false,
      channel: "whatsapp",
      error: "User has no phone number",
    };
  }

  const client = getWhatsAppClient();
  if (!client) {
    return {
      success: false,
      channel: "whatsapp",
      error:
        "WhatsApp not configured (missing META_WHATSAPP_TOKEN or META_PHONE_NUMBER_ID)",
    };
  }

  const message = getSmsMessage(job, user);

  try {
    const result = await client.sendTextMessage(user.phone, message);
    const messageId = result.messages?.[0]?.id;

    console.log(
      `[Dispatcher] WhatsApp sent to ${user.tenant_id}: ${messageId}`,
    );
    return {
      success: true,
      channel: "whatsapp",
      message_sid: messageId,
      provider: "meta",
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[Dispatcher] WhatsApp error for ${user.tenant_id}:`, {
      error: errorMessage,
      phone: user.phone,
    });
    return { success: false, channel: "whatsapp", error: errorMessage };
  }
}

/**
 * Dispatch Messenger message via Meta Send API
 */
export async function dispatchMessenger(
  job: ScheduledJob,
  user: UserJobConfig,
): Promise<DispatchResult> {
  // Messenger uses PSIDs, not phone numbers - look for messenger_psid in schedule_settings or tenant metadata
  const messengerPsid = (user.schedule_settings as Record<string, unknown>)
    ?.messenger_psid as string | undefined;

  if (!messengerPsid) {
    return {
      success: false,
      channel: "messenger",
      error: "User has no Messenger PSID configured",
    };
  }

  const client = getMessengerClient();
  if (!client) {
    return {
      success: false,
      channel: "messenger",
      error: "Messenger not configured (missing MESSENGER_PAGE_ACCESS_TOKEN)",
    };
  }

  const message = getSmsMessage(job, user);

  try {
    const result = await client.sendTextMessage(messengerPsid, message);

    console.log(
      `[Dispatcher] Messenger sent to ${user.tenant_id}: ${result.message_id}`,
    );
    return {
      success: true,
      channel: "messenger",
      message_sid: result.message_id,
      provider: "meta",
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[Dispatcher] Messenger error for ${user.tenant_id}:`, {
      error: errorMessage,
      psid: messengerPsid,
    });
    return { success: false, channel: "messenger", error: errorMessage };
  }
}

/**
 * Dispatch Telegram message via Bot API
 */
export async function dispatchTelegram(
  job: ScheduledJob,
  user: UserJobConfig,
): Promise<DispatchResult> {
  const chatId = (user.schedule_settings as Record<string, unknown>)
    ?.telegram_chat_id as string | undefined;

  if (!chatId) {
    return {
      success: false,
      channel: "telegram",
      error: "User has no Telegram chat ID configured",
    };
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return {
      success: false,
      channel: "telegram",
      error: "Telegram not configured (missing TELEGRAM_BOT_TOKEN)",
    };
  }

  const message = getSmsMessage(job, user);

  try {
    await telegramAdapter.sendResponse(chatId, message);
    console.log(`[Dispatcher] Telegram sent to ${user.tenant_id}`);
    return { success: true, channel: "telegram", provider: "telegram" };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[Dispatcher] Telegram error for ${user.tenant_id}:`, {
      error: errorMessage,
      chatId,
    });
    return { success: false, channel: "telegram", error: errorMessage };
  }
}

/**
 * Dispatch Slack message via Web API
 */
export async function dispatchSlack(
  job: ScheduledJob,
  user: UserJobConfig,
): Promise<DispatchResult> {
  const slackChannelId = (user.schedule_settings as Record<string, unknown>)
    ?.slack_channel_id as string | undefined;

  if (!slackChannelId) {
    return {
      success: false,
      channel: "slack",
      error: "User has no Slack channel ID configured",
    };
  }

  if (!process.env.SLACK_BOT_TOKEN) {
    return {
      success: false,
      channel: "slack",
      error: "Slack not configured (missing SLACK_BOT_TOKEN)",
    };
  }

  const message = getSmsMessage(job, user);

  try {
    await slackAdapter.sendResponse(slackChannelId, message, {
      slack_channel_id: slackChannelId,
    });
    console.log(`[Dispatcher] Slack sent to ${user.tenant_id}`);
    return { success: true, channel: "slack", provider: "slack" };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[Dispatcher] Slack error for ${user.tenant_id}:`, {
      error: errorMessage,
      channelId: slackChannelId,
    });
    return { success: false, channel: "slack", error: errorMessage };
  }
}

/**
 * Dispatch Discord message via REST API
 */
export async function dispatchDiscord(
  job: ScheduledJob,
  user: UserJobConfig,
): Promise<DispatchResult> {
  const discordChannelId = (user.schedule_settings as Record<string, unknown>)
    ?.discord_channel_id as string | undefined;

  if (!discordChannelId) {
    return {
      success: false,
      channel: "discord",
      error: "User has no Discord channel ID configured",
    };
  }

  if (!process.env.DISCORD_BOT_TOKEN) {
    return {
      success: false,
      channel: "discord",
      error: "Discord not configured (missing DISCORD_BOT_TOKEN)",
    };
  }

  const message = getSmsMessage(job, user);

  try {
    await discordAdapter.sendResponse(discordChannelId, message, {
      discord_channel_id: discordChannelId,
    });
    console.log(`[Dispatcher] Discord sent to ${user.tenant_id}`);
    return { success: true, channel: "discord", provider: "discord" };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[Dispatcher] Discord error for ${user.tenant_id}:`, {
      error: errorMessage,
      channelId: discordChannelId,
    });
    return { success: false, channel: "discord", error: errorMessage };
  }
}

/**
 * Dispatch Signal message via signal-cli REST API
 */
export async function dispatchSignal(
  job: ScheduledJob,
  user: UserJobConfig,
): Promise<DispatchResult> {
  const signalPhone = (user.schedule_settings as Record<string, unknown>)
    ?.signal_phone as string | undefined;

  if (!signalPhone) {
    return {
      success: false,
      channel: "signal",
      error: "User has no Signal phone configured",
    };
  }

  if (!process.env.SIGNAL_API_URL) {
    return {
      success: false,
      channel: "signal",
      error: "Signal not configured (missing SIGNAL_API_URL)",
    };
  }

  const message = getSmsMessage(job, user);

  try {
    await signalAdapter.sendResponse(signalPhone, message);
    console.log(`[Dispatcher] Signal sent to ${user.tenant_id}`);
    return { success: true, channel: "signal", provider: "signal" };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[Dispatcher] Signal error for ${user.tenant_id}:`, {
      error: errorMessage,
      phone: signalPhone,
    });
    return { success: false, channel: "signal", error: errorMessage };
  }
}

/**
 * Dispatch iMessage via BlueBubbles Server
 */
export async function dispatchImessage(
  job: ScheduledJob,
  user: UserJobConfig,
): Promise<DispatchResult> {
  const imessageAddress = (user.schedule_settings as Record<string, unknown>)
    ?.imessage_address as string | undefined;

  if (!imessageAddress) {
    return {
      success: false,
      channel: "imessage",
      error: "User has no iMessage address configured",
    };
  }

  if (!process.env.BLUEBUBBLES_URL) {
    return {
      success: false,
      channel: "imessage",
      error: "iMessage not configured (missing BLUEBUBBLES_URL)",
    };
  }

  const message = getSmsMessage(job, user);

  try {
    await imessageAdapter.sendResponse(imessageAddress, message);
    console.log(`[Dispatcher] iMessage sent to ${user.tenant_id}`);
    return { success: true, channel: "imessage", provider: "bluebubbles" };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[Dispatcher] iMessage error for ${user.tenant_id}:`, {
      error: errorMessage,
      address: imessageAddress,
    });
    return { success: false, channel: "imessage", error: errorMessage };
  }
}

/**
 * Dispatch job to appropriate channel
 */
export async function dispatchJob(
  job: ScheduledJob,
  user: UserJobConfig,
): Promise<DispatchResult> {
  const channel = (user.preferred_channel || job.default_channel) as
    | "voice"
    | "sms"
    | "email"
    | "whatsapp"
    | "messenger"
    | "telegram"
    | "slack"
    | "discord"
    | "signal"
    | "imessage"
    | "both";

  // Check if channel is enabled in user settings
  const channels = user.schedule_settings?.notification_channels || {
    voice: true,
    sms: true,
    email: true,
    whatsapp: true,
    messenger: true,
    telegram: true,
    slack: true,
    discord: true,
    signal: true,
    imessage: true,
  };

  // Channel priority: Voice > Telegram > WhatsApp > Slack > Discord > Signal > iMessage > Messenger > SMS > Email
  if (channel === "voice" && channels.voice !== false) {
    return await dispatchVoiceCall(job, user);
  } else if (channel === "telegram" && channels.telegram !== false) {
    return await dispatchTelegram(job, user);
  } else if (channel === "whatsapp" && channels.whatsapp !== false) {
    return await dispatchWhatsApp(job, user);
  } else if (channel === "slack" && channels.slack !== false) {
    return await dispatchSlack(job, user);
  } else if (channel === "discord" && channels.discord !== false) {
    return await dispatchDiscord(job, user);
  } else if (channel === "signal" && channels.signal !== false) {
    return await dispatchSignal(job, user);
  } else if (channel === "imessage" && channels.imessage !== false) {
    return await dispatchImessage(job, user);
  } else if (channel === "messenger" && channels.messenger !== false) {
    return await dispatchMessenger(job, user);
  } else if (channel === "sms" && channels.sms !== false) {
    return await dispatchSms(job, user);
  } else if (channel === "email" && channels.email !== false) {
    return await dispatchEmail(job, user);
  } else if (channel === "both") {
    // For "both", try in priority order with fallback
    if (channels.voice !== false) {
      const voiceResult = await dispatchVoiceCall(job, user);
      if (voiceResult.success) return voiceResult;
    }
    if (channels.telegram !== false) {
      const telegramResult = await dispatchTelegram(job, user);
      if (telegramResult.success) return telegramResult;
    }
    if (channels.whatsapp !== false) {
      const whatsappResult = await dispatchWhatsApp(job, user);
      if (whatsappResult.success) return whatsappResult;
    }
    if (channels.slack !== false) {
      const slackResult = await dispatchSlack(job, user);
      if (slackResult.success) return slackResult;
    }
    if (channels.discord !== false) {
      const discordResult = await dispatchDiscord(job, user);
      if (discordResult.success) return discordResult;
    }
    if (channels.signal !== false) {
      const signalResult = await dispatchSignal(job, user);
      if (signalResult.success) return signalResult;
    }
    if (channels.imessage !== false) {
      const imessageResult = await dispatchImessage(job, user);
      if (imessageResult.success) return imessageResult;
    }
    if (channels.messenger !== false) {
      const messengerResult = await dispatchMessenger(job, user);
      if (messengerResult.success) return messengerResult;
    }
    if (channels.sms !== false) {
      const smsResult = await dispatchSms(job, user);
      if (smsResult.success) return smsResult;
    }
    if (channels.email !== false) {
      return await dispatchEmail(job, user);
    }
  }

  return {
    success: false,
    channel: "voice",
    error: "No enabled channel available",
  };
}
