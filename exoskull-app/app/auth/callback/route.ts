// =====================================================
// UNIVERSAL AUTH CALLBACK
// Handles OAuth callbacks from social providers (Google, Facebook, Apple)
// Supabase Auth exchanges the code and creates/links the user
// =====================================================

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if user needs onboarding
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Ensure tenant record exists (for new social sign-ups)
        const { data: existingTenant } = await supabase
          .from("exo_tenants")
          .select("id, onboarding_status")
          .eq("id", user.id)
          .single();

        if (!existingTenant) {
          // First-time social login - create tenant
          const name =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "User";

          await supabase.from("exo_tenants").insert({
            id: user.id,
            email: user.email!,
            name,
            metadata: {
              auth_provider: user.app_metadata?.provider || "social",
              created_via: "social_login",
            },
          });

          return NextResponse.redirect(`${origin}/onboarding`);
        }

        const needsOnboarding =
          !existingTenant.onboarding_status ||
          existingTenant.onboarding_status === "pending" ||
          existingTenant.onboarding_status === "in_progress";

        if (needsOnboarding) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("[Auth Callback] Session exchange error:", error);
  }

  // Auth error - redirect to login with message
  return NextResponse.redirect(
    `${origin}/login?message=${encodeURIComponent("Nie udalo sie zalogowac. Sprobuj ponownie.")}`,
  );
}
