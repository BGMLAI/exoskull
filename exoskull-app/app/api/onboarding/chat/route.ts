import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { NextRequest, NextResponse } from "next/server";
import { DISCOVERY_SYSTEM_PROMPT } from "@/lib/onboarding/discovery-prompt";

export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * POST /api/onboarding/chat - Get AI response for text-based discovery
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { conversationId, message, history } = await request.json();

    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    // Build messages array for OpenAI
    const messages: ChatMessage[] = [
      { role: "system", content: DISCOVERY_SYSTEM_PROMPT },
      ...((history || []) as ChatMessage[]),
      { role: "user", content: message },
    ];

    // Check if this seems like a closing conversation
    const lowerMessage = message.toLowerCase();
    const isClosing =
      lowerMessage.includes("dziękuję") ||
      lowerMessage.includes("dzięki") ||
      lowerMessage.includes("to wszystko") ||
      lowerMessage.includes("na razie") ||
      history?.length > 20; // After ~10 exchanges

    // Add instruction if conversation might be ending
    if (isClosing || history?.length > 15) {
      messages.push({
        role: "system",
        content: `Jeśli czujesz że poznałeś użytkownika wystarczająco (masz info o celach, preferencjach, stylu komunikacji), zakończ rozmowę naturalnie. Odpowiedz i dodaj na końcu JSON z wyekstrahowanymi danymi w formacie:

###PROFILE_DATA###
{
  "preferred_name": "...",
  "primary_goal": "...",
  "communication_style": "direct|warm|coaching",
  "morning_checkin_time": "HH:MM",
  "insights": ["..."]
}
###END_PROFILE_DATA###`,
      });
    }

    // Verify OpenAI API key before calling
    if (!process.env.OPENAI_API_KEY) {
      console.error("[Chat API] OPENAI_API_KEY not configured");
      return NextResponse.json(
        { error: "Chat service unavailable — OPENAI_API_KEY not configured" },
        { status: 503 },
      );
    }

    // Call OpenAI
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          temperature: 0.8,
          max_tokens: 500,
        }),
      },
    );

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("[Chat API] OpenAI error:", errorText);
      return NextResponse.json({ error: "AI request failed" }, { status: 500 });
    }

    const openaiResult = await openaiResponse.json();
    let reply =
      openaiResult.choices?.[0]?.message?.content ||
      "Przepraszam, nie zrozumiałem.";

    // Check for profile data in response
    let shouldComplete = false;
    let profileData = null;

    const profileMatch = reply.match(
      /###PROFILE_DATA###\s*([\s\S]*?)\s*###END_PROFILE_DATA###/,
    );
    if (profileMatch) {
      try {
        profileData = JSON.parse(profileMatch[1]);
        shouldComplete = true;
        // Remove the JSON from the reply
        reply = reply
          .replace(/###PROFILE_DATA###[\s\S]*###END_PROFILE_DATA###/, "")
          .trim();
      } catch (e) {
        console.error("[Chat API] Failed to parse profile data:", e);
      }
    }

    return NextResponse.json({
      reply,
      shouldComplete,
      profileData,
    });
  } catch (error) {
    console.error("[Chat API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
