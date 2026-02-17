/**
 * POST /api/emotion/analyze
 *
 * Analyze text for emotional content + crisis detection.
 * For web chat integration and testing.
 */

import { NextRequest, NextResponse } from "next/server";
import { analyzeEmotion } from "@/lib/emotion";
import { detectCrisis } from "@/lib/emotion/crisis-detector";
import { getAdaptivePrompt } from "@/lib/emotion/adaptive-responses";
import { verifyTenantAuth } from "@/lib/auth/verify-tenant";

import { withApiLog } from "@/lib/api/request-logger";
export const dynamic = "force-dynamic";

export const POST = withApiLog(async function POST(req: NextRequest) {
  try {
    const auth = await verifyTenantAuth(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.tenantId;

    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'text' field" },
        { status: 400 },
      );
    }

    // Analyze emotion
    const emotion = await analyzeEmotion(text);

    // Check for crisis
    const crisis = await detectCrisis(text, emotion);

    // Get adaptive mode
    const adaptive = getAdaptivePrompt(emotion);

    return NextResponse.json({
      emotion: {
        primary: emotion.primary_emotion,
        intensity: emotion.intensity,
        valence: emotion.valence,
        arousal: emotion.arousal,
        dominance: emotion.dominance,
        confidence: emotion.confidence,
        secondary: emotion.secondary_emotions,
        source: emotion.source,
      },
      crisis: {
        detected: crisis.detected,
        type: crisis.type || null,
        severity: crisis.severity || null,
        indicators: crisis.indicators,
        confidence: crisis.confidence,
      },
      adaptive_mode: adaptive.mode,
      tenant_id: tenantId,
    });
  } catch (error) {
    console.error("[EmotionAnalyze] API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
