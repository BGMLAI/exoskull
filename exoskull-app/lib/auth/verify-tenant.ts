/**
 * Tenant authentication utility.
 *
 * Verifies the caller's identity via JWT (cookie or Bearer token)
 * and returns the authenticated tenant ID.
 *
 * Supports:
 *  - Cookie-based auth (web client via Supabase SSR)
 *  - Bearer token auth (mobile apps, API clients)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
export type TenantAuthResult =
  | { ok: true; tenantId: string }
  | { ok: false; response: NextResponse };

/**
 * Verify the caller's identity and return the tenant ID.
 *
 * Usage:
 * ```ts
 * const auth = await verifyTenantAuth(request);
 * if (!auth.ok) return auth.response;
 * const tenantId = auth.tenantId;
 * ```
 */
export async function verifyTenantAuth(
  request: NextRequest,
): Promise<TenantAuthResult> {
  // Method 1: Cookie-based auth (web client)
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      return { ok: true, tenantId: user.id };
    }
  } catch (error) {
    logger.error("[verifyTenantAuth] Cookie auth failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // Method 2: Bearer token auth (mobile app, API client)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      if (user) {
        return { ok: true, tenantId: user.id };
      }
    } catch (error) {
      logger.error("[verifyTenantAuth] Bearer token auth failed:", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}
