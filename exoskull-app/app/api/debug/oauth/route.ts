import { NextResponse } from "next/server";
import { getOAuthConfig, buildAuthUrl } from "@/lib/rigs/oauth";

export const dynamic = "force-dynamic";

// Temporary diagnostic endpoint - DELETE after OAuth is fixed
export async function GET() {
  const config = getOAuthConfig("google");

  if (!config) {
    return NextResponse.json({ error: "No config for google" });
  }

  const testAuthUrl = buildAuthUrl(config, "diagnostic-test-state");

  return NextResponse.json({
    clientId: config.clientId
      ? {
          value: `${config.clientId.substring(0, 12)}...${config.clientId.substring(config.clientId.length - 20)}`,
          length: config.clientId.length,
          hasLeadingWhitespace: config.clientId !== config.clientId.trimStart(),
          hasTrailingWhitespace: config.clientId !== config.clientId.trimEnd(),
          startsWithDigit: /^\d/.test(config.clientId),
          endsWithExpected: config.clientId.endsWith(
            ".apps.googleusercontent.com",
          ),
          charCodes: Array.from(config.clientId.substring(0, 5)).map((c) =>
            c.charCodeAt(0),
          ),
        }
      : "MISSING",
    clientSecret: config.clientSecret
      ? {
          length: config.clientSecret.length,
          prefix: config.clientSecret.substring(0, 8),
          hasWhitespace: config.clientSecret !== config.clientSecret.trim(),
        }
      : "MISSING",
    redirectUri: config.redirectUri,
    scopes: config.scopes,
    generatedAuthUrl: testAuthUrl.substring(0, 300),
    envCheck: {
      GOOGLE_CLIENT_ID_exists: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_ID_length: process.env.GOOGLE_CLIENT_ID?.length,
      GOOGLE_CLIENT_SECRET_exists: !!process.env.GOOGLE_CLIENT_SECRET,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
  });
}
