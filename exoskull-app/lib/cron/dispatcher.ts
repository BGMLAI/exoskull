/**
 * Job Dispatcher for ExoSkull CRON
 *
 * Handles dispatching scheduled jobs to:
 * - Twilio (voice calls + SMS)
 * - Resend (email)
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export interface ScheduledJob {
  id: string
  job_name: string
  job_type: string
  handler_endpoint: string
  time_window_start: string
  time_window_end: string
  default_channel: 'voice' | 'sms' | 'email' | 'whatsapp' | 'both'
  display_name: string
}

export interface UserJobConfig {
  tenant_id: string
  phone: string
  email?: string
  timezone: string
  language: string
  preferred_channel: string
  custom_time: string | null
  tenant_name: string
  schedule_settings: {
    notification_channels?: { voice?: boolean; sms?: boolean; email?: boolean; whatsapp?: boolean }
    rate_limits?: { max_calls_per_day?: number; max_sms_per_day?: number }
    quiet_hours?: { start?: string; end?: string }
    skip_weekends?: boolean
  } | null
}

export interface DispatchResult {
  success: boolean
  channel: 'voice' | 'sms' | 'email' | 'whatsapp'
  call_id?: string
  message_sid?: string
  error?: string
  provider?: 'twilio' | 'resend'
}

// Twilio Configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+48732143210'
const RESEND_API_KEY = process.env.RESEND_API_KEY

/**
 * Get the system prompt for a specific job type
 */
function getJobSystemPrompt(job: ScheduledJob, user: UserJobConfig): string {
  const name = user.tenant_name || 'there'
  const language = user.language || 'pl'

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
Be warm, brief. End: "Good luck! Talk later."`
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
Be supportive. End: "Good night!"`
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
Brief and to the point.`
    },
    weekly_summary: {
      pl: `Jesteś ExoSkull. Piątkowe podsumowanie tygodnia dla ${name}.
1. "Hej! Koniec tygodnia - jak poszło?"
2. "Co było najtrudniejsze?"
3. "Plany na weekend?"`,
      en: `You are ExoSkull. Friday week summary for ${name}.
1. "Hey! Week's over - how did it go?"
2. "What was hardest?"
3. "Weekend plans?"`
    }
  }

  const jobPrompts = prompts[job.job_type] || prompts.morning_checkin
  return jobPrompts[language] || jobPrompts.pl
}

/**
 * Dispatch a voice call via Twilio
 * Uses Twilio <Gather> for STT + Claude for LLM + ElevenLabs for TTS
 */
export async function dispatchVoiceCall(
  job: ScheduledJob,
  user: UserJobConfig
): Promise<DispatchResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return { success: false, channel: 'voice', error: 'Twilio credentials not configured' }
  }

  if (!user.phone) {
    return { success: false, channel: 'voice', error: 'User has no phone number' }
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://exoskull.app'
    const webhookUrl = `${baseUrl}/api/twilio/voice?action=start&tenant_id=${user.tenant_id}&job_type=${job.job_type}`

    const authHeader = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: user.phone,
        From: TWILIO_PHONE_NUMBER,
        Url: webhookUrl,
        StatusCallback: `${baseUrl}/api/twilio/status`,
        Timeout: '30',
      }).toString()
    })

    const data = await response.json()

    if (response.ok && data.sid) {
      console.log(`[Dispatcher] Twilio call initiated for ${user.tenant_id}: ${data.sid}`)
      return { success: true, channel: 'voice', call_id: data.sid, provider: 'twilio' }
    } else {
      console.error(`[Dispatcher] Twilio call failed for ${user.tenant_id}:`, data)
      return { success: false, channel: 'voice', error: data.message || JSON.stringify(data) }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Dispatcher] Twilio dispatch error for ${user.tenant_id}:`, errorMessage)
    return { success: false, channel: 'voice', error: errorMessage }
  }
}

/**
 * Get SMS message for a job type
 */
function getSmsMessage(job: ScheduledJob, user: UserJobConfig): string {
  const name = user.tenant_name || ''
  const language = user.language || 'pl'

  const messages: Record<string, Record<string, string>> = {
    day_summary: {
      pl: `Dzień dobry${name ? ` ${name}` : ''}! Twoje podsumowanie dnia czeka w ExoSkull. Odpowiedz "zadzwoń" jeśli chcesz pogadać.`,
      en: `Good morning${name ? ` ${name}` : ''}! Your day summary is ready in ExoSkull. Reply "call" if you want to chat.`
    },
    meal_reminder: {
      pl: `Hej${name ? ` ${name}` : ''}! Nie zalogowałeś posiłku. Co dzisiaj jadłeś? Odpowiedz jednym zdaniem.`,
      en: `Hey${name ? ` ${name}` : ''}! No meal logged yet. What did you eat today? Reply with one sentence.`
    },
    bedtime_reminder: {
      pl: `${name ? `${name}, ` : ''}czas się wyciszyć. Twój cel snu jest za 30 minut. Dobranoc!`,
      en: `${name ? `${name}, ` : ''}time to wind down. Your sleep goal is in 30 minutes. Good night!`
    },
    task_overdue: {
      pl: `${name ? `${name}, ` : ''}masz przeterminowane zadania. Odpowiedz "zadzwoń" żeby przejrzeć listę.`,
      en: `${name ? `${name}, ` : ''}you have overdue tasks. Reply "call" to review.`
    },
    goal_checkin: {
      pl: `Połowa miesiąca! Jak idą Twoje cele? Odpowiedz liczbą 1-10.`,
      en: `Halfway through the month! How are your goals going? Reply with 1-10.`
    },
    social_alert: {
      pl: `${name ? `${name}, ` : ''}nie widziałem żadnych spotkań od 30 dni. Może czas na kawę z kimś?`,
      en: `${name ? `${name}, ` : ''}no social events in 30 days. Maybe time for a coffee with someone?`
    }
  }

  const jobMessages = messages[job.job_name] || messages.day_summary
  return jobMessages[language] || jobMessages.pl
}

/**
 * Dispatch SMS via Twilio
 */
export async function dispatchSms(
  job: ScheduledJob,
  user: UserJobConfig
): Promise<DispatchResult> {
  if (!user.phone) {
    return { success: false, channel: 'sms', error: 'User has no phone number' }
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return { success: false, channel: 'sms', error: 'Twilio not configured' }
  }

  const message = getSmsMessage(job, user)

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: user.phone,
          From: TWILIO_PHONE_NUMBER,
          Body: message
        })
      }
    )

    const data = await response.json()

    if (response.ok && data.sid) {
      console.log(`[Dispatcher] SMS sent to ${user.tenant_id}: ${data.sid}`)
      return { success: true, channel: 'sms', message_sid: data.sid, provider: 'twilio' }
    } else {
      console.error(`[Dispatcher] SMS failed for ${user.tenant_id}:`, data)
      return { success: false, channel: 'sms', error: data.message || JSON.stringify(data) }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Dispatcher] SMS error for ${user.tenant_id}:`, errorMessage)
    return { success: false, channel: 'sms', error: errorMessage }
  }
}

/**
 * Dispatch Email via Resend
 */
export async function dispatchEmail(
  job: ScheduledJob,
  user: UserJobConfig
): Promise<DispatchResult> {
  if (!user.email) {
    return { success: false, channel: 'email', error: 'User has no email address' }
  }

  if (!RESEND_API_KEY) {
    return { success: false, channel: 'email', error: 'Email not configured (missing RESEND_API_KEY)' }
  }

  const language = user.language || 'pl'

  const subjects: Record<string, Record<string, string>> = {
    day_summary: {
      pl: 'Twoje podsumowanie dnia od ExoSkull',
      en: 'Your daily summary from ExoSkull'
    },
    weekly_summary: {
      pl: 'Podsumowanie tygodnia od ExoSkull',
      en: 'Your weekly summary from ExoSkull'
    }
  }

  const subject = subjects[job.job_name]?.[language] || subjects.day_summary[language]
  const body = getSmsMessage(job, user)

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'IORS <iors@exoskull.xyz>',
        to: [user.email],
        subject,
        text: body,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Dispatcher] Email failed for ${user.tenant_id}:`, errorText)
      return { success: false, channel: 'email', error: `Resend error: ${response.status}` }
    }

    console.log(`[Dispatcher] Email sent to ${user.tenant_id}`)
    return { success: true, channel: 'email', provider: 'resend' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Dispatcher] Email error for ${user.tenant_id}:`, errorMessage)
    return { success: false, channel: 'email', error: errorMessage }
  }
}

/**
 * WhatsApp not available (requires direct Meta API integration)
 */
export async function dispatchWhatsApp(
  _job: ScheduledJob,
  _user: UserJobConfig
): Promise<DispatchResult> {
  return { success: false, channel: 'whatsapp', error: 'WhatsApp not configured' }
}

/**
 * Dispatch job to appropriate channel
 */
export async function dispatchJob(
  job: ScheduledJob,
  user: UserJobConfig
): Promise<DispatchResult> {
  const channel = (user.preferred_channel || job.default_channel) as 'voice' | 'sms' | 'email' | 'whatsapp' | 'both'

  // Check if channel is enabled in user settings
  const channels = user.schedule_settings?.notification_channels || { voice: true, sms: true, email: true, whatsapp: true }

  // Channel priority: Voice > WhatsApp > SMS > Email
  if (channel === 'voice' && channels.voice !== false) {
    return await dispatchVoiceCall(job, user)
  } else if (channel === 'whatsapp' && channels.whatsapp !== false) {
    return await dispatchWhatsApp(job, user)
  } else if (channel === 'sms' && channels.sms !== false) {
    return await dispatchSms(job, user)
  } else if (channel === 'email' && channels.email !== false) {
    return await dispatchEmail(job, user)
  } else if (channel === 'both') {
    // For "both", try in priority order with fallback
    if (channels.voice !== false) {
      const voiceResult = await dispatchVoiceCall(job, user)
      if (voiceResult.success) return voiceResult
    }
    if (channels.whatsapp !== false) {
      const whatsappResult = await dispatchWhatsApp(job, user)
      if (whatsappResult.success) return whatsappResult
    }
    if (channels.sms !== false) {
      const smsResult = await dispatchSms(job, user)
      if (smsResult.success) return smsResult
    }
    if (channels.email !== false) {
      return await dispatchEmail(job, user)
    }
  }

  return { success: false, channel: 'voice', error: 'No enabled channel available' }
}
