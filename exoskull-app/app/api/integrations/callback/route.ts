/**
 * Generic OAuth2 Callback — AI Superintegrator
 *
 * Handles OAuth callbacks for ANY service connected via Superintegrator.
 * The state parameter identifies which connection this callback belongs to.
 */

import { NextRequest, NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/integrations/superintegrator";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    logger.error("[OAuth Callback] Provider error:", { error });
    return new NextResponse(
      htmlResponse(
        "Autoryzacja nie powiodła się",
        `Usługa zwróciła błąd: ${error}. Wróć do czatu i spróbuj ponownie.`,
        false,
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  if (!code || !state) {
    return new NextResponse(
      htmlResponse(
        "Brak kodu autoryzacji",
        "Nieprawidłowe żądanie. Wróć do czatu i spróbuj ponownie.",
        false,
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  const result = await handleOAuthCallback(state, code);

  if (!result.success) {
    logger.error("[OAuth Callback] Failed:", { error: result.error });
    return new NextResponse(
      htmlResponse(
        "Połączenie nie powiodło się",
        `Błąd: ${result.error}. Wróć do czatu i spróbuj ponownie.`,
        false,
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  return new NextResponse(
    htmlResponse(
      `${result.service_name} połączony!`,
      "Możesz zamknąć to okno i wrócić do czatu. Dżin już wie o połączeniu.",
      true,
    ),
    { headers: { "Content-Type": "text/html" } },
  );
}

function htmlResponse(
  title: string,
  message: string,
  success: boolean,
): string {
  const color = success ? "#22c55e" : "#ef4444";
  const icon = success ? "✓" : "✗";
  return `<!DOCTYPE html>
<html><head><title>ExoSkull - ${title}</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fff}
.card{text-align:center;padding:3rem;border-radius:1rem;border:1px solid ${color}33;max-width:400px}
.icon{font-size:4rem;color:${color};margin-bottom:1rem}
h1{font-size:1.5rem;margin:0 0 1rem}
p{color:#888;line-height:1.6}</style></head>
<body><div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${message}</p></div></body></html>`;
}
