import { verifyTenantAuth } from "@/lib/auth/verify-tenant";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { EXTRACTION_PROMPT } from "@/lib/onboarding/discovery-prompt";

import { logger } from "@/lib/logger";
import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/extract - Extract profile from conversation
 */
export const POST = withApiLog(async function POST(request: NextRequest) {
  try {
    const auth = await verifyTenantAuth(request);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const supabase = await createClient();

    const { conversationId } = await request.json();

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId required" },
        { status: 400 },
      );
    }

    // Fetch conversation messages
    const { data: messages, error: messagesError } = await supabase
      .from("exo_messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      logger.error("[Extract API] Error fetching messages:", messagesError);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 },
      );
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "No messages found" }, { status: 404 });
    }

    // Build transcript
    const transcript = messages
      .map((m) => `${m.role === "user" ? "User" : "ExoSkull"}: ${m.content}`)
      .join("\n\n");

    // Call Gemini Flash for extraction
    const extractionResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY!,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: EXTRACTION_PROMPT + transcript }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!extractionResponse.ok) {
      const errorText = await extractionResponse.text();
      logger.error("[Extract API] Gemini error:", errorText);
      return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
    }

    const extractionResult = await extractionResponse.json();
    const extractedText =
      extractionResult.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!extractedText) {
      logger.error("[Extract API] No extraction result");
      return NextResponse.json(
        { error: "No extraction result" },
        { status: 500 },
      );
    }

    // Parse extracted JSON
    let profileData;
    try {
      profileData = JSON.parse(extractedText);
    } catch (e) {
      logger.error("[Extract API] Failed to parse extraction:", e);
      return NextResponse.json(
        { error: "Invalid extraction format" },
        { status: 500 },
      );
    }

    // Save to exo_tenants
    const updateData: Record<string, any> = {
      discovery_data: profileData,
      onboarding_status: "in_progress",
    };

    if (profileData.preferred_name)
      updateData.preferred_name = profileData.preferred_name;
    if (profileData.primary_goal)
      updateData.primary_goal = profileData.primary_goal;
    if (profileData.secondary_goals)
      updateData.secondary_goals = profileData.secondary_goals;
    if (profileData.conditions) updateData.conditions = profileData.conditions;
    if (profileData.communication_style)
      updateData.communication_style = profileData.communication_style;
    if (profileData.preferred_channel)
      updateData.preferred_channel = profileData.preferred_channel;
    if (profileData.morning_checkin_time)
      updateData.morning_checkin_time = profileData.morning_checkin_time;
    if (profileData.evening_checkin_time)
      updateData.evening_checkin_time = profileData.evening_checkin_time;
    if (profileData.timezone) updateData.timezone = profileData.timezone;
    if (profileData.language) updateData.language = profileData.language;

    const { error: updateError } = await supabase
      .from("exo_tenants")
      .update(updateData)
      .eq("id", tenantId);

    if (updateError) {
      logger.error("[Extract API] Error saving profile:", updateError);
      return NextResponse.json(
        { error: "Failed to save profile" },
        { status: 500 },
      );
    }

    // Save individual extractions
    if (profileData.insights && Array.isArray(profileData.insights)) {
      for (const insight of profileData.insights) {
        await supabase.from("exo_discovery_extractions").insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          extraction_type: "insight",
          value: insight,
          confidence: profileData.confidence || 0.8,
        });
      }
    }

    if (profileData.quotes && Array.isArray(profileData.quotes)) {
      for (const quote of profileData.quotes) {
        await supabase.from("exo_discovery_extractions").insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          extraction_type: "insight",
          value: `Quote: "${quote}"`,
          confidence: 1.0,
        });
      }
    }

    logger.info(
      "[Extract API] Profile extracted successfully for user:",
      tenantId,
    );

    return NextResponse.json({
      success: true,
      profile: profileData,
    });
  } catch (error) {
    logger.error("[Extract API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
