/**
 * Twilio Status Callback
 *
 * Receives call status updates from Twilio.
 * Used to track call lifecycle and cleanup resources.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cleanupSessionAudio } from "@/lib/voice/elevenlabs-tts";

export const dynamic = "force-dynamic";

// ============================================================================
// CONFIGURATION
// ============================================================================

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ============================================================================
// TYPES
// ============================================================================

type CallStatus =
  | "queued"
  | "initiated"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "no-answer"
  | "failed"
  | "canceled";

interface StatusUpdate {
  CallSid: string;
  CallStatus: CallStatus;
  CallDuration?: string;
  From?: string;
  To?: string;
  Direction?: "inbound" | "outbound-api" | "outbound-dial";
  Timestamp?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

async function parseFormData(req: NextRequest): Promise<StatusUpdate> {
  const formData = await req.formData();
  const data: Record<string, string> = {};

  formData.forEach((value, key) => {
    data[key] = value.toString();
  });

  return data as unknown as StatusUpdate;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const data = await parseFormData(req);

    console.log("[Twilio Status] Update:", {
      callSid: data.CallSid,
      status: data.CallStatus,
      duration: data.CallDuration,
      direction: data.Direction,
    });

    const supabase = getSupabase();

    // Find session by call_sid
    const { data: session } = await supabase
      .from("exo_voice_sessions")
      .select("id, status")
      .eq("call_sid", data.CallSid)
      .single();

    if (!session) {
      console.log("[Twilio Status] No session found for:", data.CallSid);
      return NextResponse.json({ success: true });
    }

    // Handle different statuses
    switch (data.CallStatus) {
      case "completed":
      case "busy":
      case "no-answer":
      case "failed":
      case "canceled":
        // Call ended - update session and cleanup
        await supabase
          .from("exo_voice_sessions")
          .update({
            status: "ended",
            ended_at: new Date().toISOString(),
            metadata: {
              duration: data.CallDuration ? parseInt(data.CallDuration) : null,
              direction: data.Direction,
              final_status: data.CallStatus,
              error_code: data.ErrorCode,
              error_message: data.ErrorMessage,
            },
          })
          .eq("id", session.id);

        console.log("[Twilio Status] Session ended:", {
          sessionId: session.id,
          status: data.CallStatus,
          duration: data.CallDuration,
        });

        // Cleanup audio files (async, don't wait)
        cleanupSessionAudio(session.id).catch((err) => {
          console.error("[Twilio Status] Audio cleanup failed:", err);
        });

        break;

      case "in-progress":
        // Call answered - mark as active
        if (session.status !== "active") {
          await supabase
            .from("exo_voice_sessions")
            .update({
              status: "active",
              metadata: {
                direction: data.Direction,
                answered_at: new Date().toISOString(),
              },
            })
            .eq("id", session.id);
        }
        break;

      case "ringing":
      case "initiated":
      case "queued":
        // Pre-answer states - no action needed
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Twilio Status] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Allow GET for health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "Twilio Status Callback",
  });
}
