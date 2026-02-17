import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("onboarding_status")
      .eq("id", user.id)
      .single();

    const needsOnboarding =
      !tenant?.onboarding_status ||
      tenant.onboarding_status === "pending" ||
      tenant.onboarding_status === "in_progress";

    redirect(needsOnboarding ? "/onboarding" : "/dashboard");
  }

  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
