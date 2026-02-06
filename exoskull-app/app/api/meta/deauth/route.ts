/**
 * Facebook Data Deletion / Deauthorization Callback
 *
 * Required by Facebook Login for App Review.
 * Called when a user removes the app from their Facebook settings.
 * https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * Parse and verify the signed_request from Facebook.
 */
function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): { user_id: string } | null {
  try {
    const [encodedSig, payload] = signedRequest.split(".", 2);
    if (!encodedSig || !payload) return null;

    const sig = Buffer.from(
      encodedSig.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    );
    const data = JSON.parse(
      Buffer.from(
        payload.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8"),
    );

    const expectedSig = crypto
      .createHmac("sha256", appSecret)
      .update(payload)
      .digest();

    if (!crypto.timingSafeEqual(sig, expectedSig)) {
      console.error("[MetaDeauth] Invalid signature");
      return null;
    }

    return data;
  } catch (error) {
    console.error("[MetaDeauth] Failed to parse signed_request:", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const signedRequest = formData.get("signed_request") as string;

    if (!signedRequest) {
      return NextResponse.json(
        { error: "Missing signed_request" },
        { status: 400 },
      );
    }

    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appSecret) {
      console.error("[MetaDeauth] FACEBOOK_APP_SECRET not configured");
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 500 },
      );
    }

    const data = parseSignedRequest(signedRequest, appSecret);
    if (!data?.user_id) {
      return NextResponse.json(
        { error: "Invalid signed_request" },
        { status: 400 },
      );
    }

    console.log(
      "[MetaDeauth] Data deletion request for FB user:",
      data.user_id,
    );

    // Generate a confirmation code for tracking
    const confirmationCode = crypto.randomUUID();

    // Deactivate all meta pages associated with this FB user
    // Note: We don't have a direct FB user -> tenant mapping here,
    // but we can log the request and handle it asynchronously
    const supabase = getServiceSupabase();

    // Store the deletion request for audit
    await supabase.from("exo_conversations").insert({
      context: {
        channel: "system",
        type: "fb_data_deletion_request",
        fb_user_id: data.user_id,
        confirmation_code: confirmationCode,
      },
      message_count: 0,
      user_messages: 0,
      agent_messages: 0,
    });

    // Return the required response format
    return NextResponse.json({
      url: `https://exoskull.xyz/data-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    console.error("[MetaDeauth] Error:", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
