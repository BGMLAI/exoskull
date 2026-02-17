import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

import { logger } from "@/lib/logger";
export interface AdminUser {
  userId: string;
  role: "admin" | "super_admin";
}

/**
 * Get Supabase admin client (service role, bypasses RLS)
 */
export function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

/**
 * Verify that the current user has admin access.
 * Returns AdminUser if authorized, null otherwise.
 */
export async function verifyAdmin(): Promise<AdminUser | null> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const adminDb = getAdminSupabase();
    const { data: admin } = await adminDb
      .from("admin_users")
      .select("role")
      .eq("tenant_id", user.id)
      .single();

    if (!admin) return null;

    return {
      userId: user.id,
      role: admin.role as "admin" | "super_admin",
    };
  } catch (error) {
    logger.error("[AdminAuth] Verification failed:", error);
    return null;
  }
}

/**
 * Verify admin for API routes. Returns AdminUser or throws Response.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await verifyAdmin();
  if (!admin) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return admin;
}
