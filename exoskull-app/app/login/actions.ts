"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signIn(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/login?message=Nieprawidlowy email lub haslo");
  }

  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
      },
    },
  });

  if (authError) {
    console.error("[SignUp] Auth error:", authError);
    redirect(
      `/login?tab=signup&message=${encodeURIComponent(authError.message)}`,
    );
  }

  if (authData.user) {
    const { error: tenantError } = await supabase.from("exo_tenants").insert({
      id: authData.user.id,
      email: authData.user.email!,
      name: name,
    });

    if (tenantError) {
      console.error("[SignUp] Tenant creation error:", tenantError);
    }
  }

  redirect("/login?message=Sprawdz email aby potwierdzic konto");
}

export async function resetPassword(formData: FormData) {
  const email = formData.get("email") as string;
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "https://exoskull.xyz"}/auth/callback?next=/dashboard/settings`,
  });

  if (error) {
    console.error("[ResetPassword] Error:", error);
    redirect(`/reset-password?message=${encodeURIComponent(error.message)}`);
  }

  redirect(
    "/reset-password?message=Link do resetu hasla wyslany na Twoj email",
  );
}
