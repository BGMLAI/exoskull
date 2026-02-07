/**
 * IORS Lead Manager
 *
 * Handles pre-registration conversations with potential users (leads).
 * IORS talks to leads BEFORE they sign up, remembers conversations,
 * and merges data when lead converts to tenant.
 *
 * Lead conversations use Tier 1 (Gemini Flash) for cost efficiency.
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import type { GatewayChannel } from "@/lib/gateway/types";
import type { LeadRecord, LeadConversationEntry } from "./types";

import { logger } from "@/lib/logger";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://exoskull.xyz";

const LEAD_SYSTEM_PROMPT = `Jestes IORS — osobisty asystent AI. Rozmawiasz z potencjalnym uzytkownikiem ktory jeszcze sie nie zarejestrowal.

ZASADY:
1. Badz przyjazny, ciekawy, ale nie nachalny
2. Wyjasniaj czym jest IORS — rozszerzenie umyslu, cyfrowy blizniak
3. NIGDY nie wymuszaj rejestracji — user sam zdecyduje
4. Pamietaj o czym rozmawiacie — konwersacja jest ciagla
5. Jezeli user chce sie zarejestrowac, powiedz: "Super! Wejdz na ${APP_URL} zeby zalozyc konto."
6. Odpowiadaj krotko (2-3 zdania max)
7. Mow w jezyku usera (po polsku lub po angielsku)
8. Po 10+ wymianach, delikatnie zaproponuj rejestracje (raz). Nie powtarzaj.

WARTOSC IORS:
- Jeden punkt kontaktu zamiast 50 aplikacji
- Dziala 24/7, proaktywnie (nie czeka na pytania)
- Voice-first: mozesz po prostu dzwonic/rozmawiac
- Pamięta WSZYSTKO, forever
- 12 kanalow (SMS, WhatsApp, Telegram, voice, web...)
- Autonomiczne akcje (w ramach Twoich zgod)`;

/**
 * Find an existing lead by phone, email, or channel-specific ID.
 */
export async function findLead(
  channel: GatewayChannel,
  from: string,
): Promise<LeadRecord | null> {
  const supabase = getServiceSupabase();

  // Try phone first (most common for messaging channels)
  const phoneQuery = supabase
    .from("exo_leads")
    .select("*")
    .eq("phone", from)
    .neq("lead_status", "converted")
    .limit(1)
    .maybeSingle();

  const { data } = await phoneQuery;

  if (data) return data as LeadRecord;

  // Try email
  if (from.includes("@")) {
    const { data: emailData } = await supabase
      .from("exo_leads")
      .select("*")
      .eq("email", from)
      .neq("lead_status", "converted")
      .limit(1)
      .maybeSingle();

    if (emailData) return emailData as LeadRecord;
  }

  return null;
}

/**
 * Create a new lead record for an unregistered sender.
 */
export async function createLead(
  channel: GatewayChannel,
  from: string,
  senderName?: string,
): Promise<LeadRecord> {
  const supabase = getServiceSupabase();

  const isEmail = from.includes("@");
  const leadData = {
    phone: isEmail ? undefined : from,
    email: isEmail ? from : undefined,
    name: senderName || undefined,
    channel,
    conversations: [] as LeadConversationEntry[],
    lead_status: "new" as const,
    metadata: {},
  };

  const { data, error } = await supabase
    .from("exo_leads")
    .insert(leadData)
    .select()
    .single();

  if (error) {
    console.error("[LeadManager] Failed to create lead:", {
      error: error.message,
      from,
      channel,
    });
    throw error;
  }

  return data as LeadRecord;
}

/**
 * Find or create a lead for an unregistered sender.
 */
export async function findOrCreateLead(
  channel: GatewayChannel,
  from: string,
  senderName?: string,
): Promise<{ lead: LeadRecord; isNew: boolean }> {
  const existing = await findLead(channel, from);
  if (existing) {
    return { lead: existing, isNew: false };
  }

  const newLead = await createLead(channel, from, senderName);
  return { lead: newLead, isNew: true };
}

/**
 * Handle a message from a lead (unregistered user).
 * Uses Tier 1 AI (Gemini Flash) for cost efficiency.
 */
export async function handleLeadMessage(
  lead: LeadRecord,
  text: string,
  channel: GatewayChannel,
): Promise<{ text: string; toolsUsed: string[]; channel: GatewayChannel }> {
  const supabase = getServiceSupabase();

  try {
    // Build conversation history for context
    const messages = lead.conversations.map((c) => ({
      role: c.role as "user" | "assistant",
      content: c.content,
    }));

    // Add current message
    messages.push({ role: "user", content: text });

    // Use Tier 1 (Gemini Flash) for lead conversations — cost efficient
    const { getModelRouter } = await import("@/lib/ai/model-router");
    const router = getModelRouter();
    const response = await router.route({
      messages: [{ role: "system", content: LEAD_SYSTEM_PROMPT }, ...messages],
      taskCategory: "simple_response",
      tenantId: lead.id,
      maxTokens: 300,
    });

    const assistantText = response.content || "Hej! Opowiedz mi o sobie.";

    // Append both messages to lead's conversation history
    const updatedConversations: LeadConversationEntry[] = [
      ...lead.conversations,
      {
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
        channel,
      },
      {
        role: "assistant",
        content: assistantText,
        timestamp: new Date().toISOString(),
        channel,
      },
    ];

    // Update lead status based on engagement depth
    const exchangeCount = updatedConversations.filter(
      (c) => c.role === "user",
    ).length;
    let newStatus = lead.lead_status;

    if (newStatus === "new" && exchangeCount >= 2) {
      newStatus = "engaged";
    }
    if (newStatus === "engaged" && exchangeCount >= 5) {
      newStatus = "qualified";
    }

    await supabase
      .from("exo_leads")
      .update({
        conversations: updatedConversations,
        lead_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    // On first qualification, append signup suggestion (one-time)
    if (newStatus === "qualified" && lead.lead_status !== "qualified") {
      const signupHint = `\n\nPS: Jezeli chcesz zeby IORS pamietal wszystko i dzialal proaktywnie, zaloz konto: ${APP_URL}`;
      return {
        text: assistantText + signupHint,
        toolsUsed: ["lead_conversation", "lead_qualified"],
        channel,
      };
    }

    return {
      text: assistantText,
      toolsUsed: ["lead_conversation"],
      channel,
    };
  } catch (error) {
    console.error("[LeadManager] handleLeadMessage failed:", {
      error: error instanceof Error ? error.message : error,
      leadId: lead.id,
    });

    return {
      text: "Hej! Jestem IORS. Opowiedz mi o sobie — czym sie zajmujesz?",
      toolsUsed: ["lead_conversation_fallback"],
      channel,
    };
  }
}

/**
 * Convert a lead to a full tenant.
 * Copies conversation history into unified thread + sets birth date.
 */
export async function convertLeadToTenant(
  leadId: string,
  tenantId: string,
): Promise<void> {
  const supabase = getServiceSupabase();

  const { data: lead } = await supabase
    .from("exo_leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (!lead) {
    console.error("[LeadManager] Lead not found for conversion:", leadId);
    return;
  }

  // Mark lead as converted
  await supabase
    .from("exo_leads")
    .update({
      converted_tenant_id: tenantId,
      converted_at: new Date().toISOString(),
      lead_status: "converted",
    })
    .eq("id", leadId);

  // Set IORS birth date to lead creation date (pre-birth memory)
  await supabase
    .from("exo_tenants")
    .update({
      iors_birth_date: lead.created_at,
      iors_birth_enabled: true,
    })
    .eq("id", tenantId);

  // Copy lead conversations into unified thread (so IORS remembers pre-birth)
  const conversations = (lead.conversations as LeadConversationEntry[]) || [];
  if (conversations.length > 0) {
    try {
      const { appendMessage } = await import("@/lib/unified-thread");
      for (const entry of conversations) {
        await appendMessage(tenantId, {
          role: entry.role,
          content: entry.content,
          channel: (entry.channel ||
            "web_chat") as import("@/lib/unified-thread").UnifiedChannel,
          direction: entry.role === "user" ? "inbound" : "outbound",
          metadata: {
            from_lead: true,
            lead_id: leadId,
            original_timestamp: entry.timestamp,
          },
        });
      }
    } catch (threadErr) {
      logger.warn(
        "[LeadManager] Failed to copy lead conversations to thread:",
        {
          error: threadErr instanceof Error ? threadErr.message : threadErr,
        },
      );
    }
  }

  logger.info("[LeadManager] Lead converted to tenant:", {
    leadId,
    tenantId,
    conversationsCopied: conversations.length,
  });
}
