import { NextRequest, NextResponse } from "next/server";
import { getOAuthConfig, buildAuthUrl } from "@/lib/rigs/oauth";
import { validateMagicToken } from "@/lib/rigs/in-chat-connector";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

/**
 * GET /api/rigs/[slug]/magic-connect?t=TOKEN
 *
 * Magic-link OAuth entry point — no browser auth session required.
 * User receives this link in chat (WhatsApp, Telegram, etc.) and opens it.
 * Validates magic token, then redirects to provider OAuth.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const magicToken = searchParams.get("t");

    if (!magicToken) {
      return NextResponse.json(
        { error: "Missing token parameter" },
        { status: 400 },
      );
    }

    // Validate magic token
    const validation = await validateMagicToken(slug, magicToken);
    if (!validation) {
      return NextResponse.json(
        {
          error:
            "Link wygasł lub jest nieprawidłowy. Poproś o nowy link w czacie.",
        },
        { status: 403 },
      );
    }

    // Get OAuth config
    const config = getOAuthConfig(slug);
    if (!config) {
      return NextResponse.json(
        { error: `Integration "${slug}" is not configured` },
        { status: 500 },
      );
    }

    if (!config.clientId) {
      console.error(`[MagicConnect] Missing client ID for ${slug}`);
      return NextResponse.json(
        {
          error: `${slug} integration is not configured. Missing API credentials.`,
        },
        { status: 500 },
      );
    }

    // Build state: encode tenantId + magic token for callback verification
    // Format: "magic:{tenantId}:{magicToken}"
    const state = `magic:${validation.tenantId}:${magicToken}`;

    // Build auth URL and redirect to provider
    const authUrl = buildAuthUrl(config, state);

    logger.info(`[MagicConnect] Redirecting to ${slug} OAuth:`, {
      tenantId: validation.tenantId,
      connectionId: validation.connectionId,
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("[MagicConnect] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
