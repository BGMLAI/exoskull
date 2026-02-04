import { createClient } from "@/lib/supabase/server";
import { UnifiedThreadView } from "@/components/dashboard/UnifiedThreadView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">
          Zaloguj sie, aby zobaczyc dashboard
        </h1>
      </div>
    );
  }

  // Get tenant profile
  let assistantName = "IORS";
  try {
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("assistant_name")
      .eq("id", user.id)
      .single();
    assistantName = tenant?.assistant_name || "IORS";
  } catch (e: unknown) {
    console.error("[Dashboard] Failed to load tenant:", e);
  }

  return <UnifiedThreadView tenantId={user.id} assistantName={assistantName} />;
}
