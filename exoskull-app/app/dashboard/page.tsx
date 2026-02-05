import { createClient } from "@/lib/supabase/server";
import { DashboardInboxView } from "@/components/dashboard/DashboardInboxView";
import { VoiceHero } from "@/components/dashboard/VoiceHero";

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

  return (
    <div className="h-full flex flex-col">
      {/* Voice-first hero — primary interaction */}
      <VoiceHero tenantId={user.id} assistantName={assistantName} />

      {/* Chat/Inbox — takes remaining space */}
      <div className="flex-1 min-h-0">
        <DashboardInboxView tenantId={user.id} assistantName={assistantName} />
      </div>
    </div>
  );
}
