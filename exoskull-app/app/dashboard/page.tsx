import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DualInterface } from "@/components/dual-interface/DualInterface";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ExoSkull" };

/**
 * Dashboard Page — DualInterface (Chat River + Tree Graph)
 *
 * No separate home, settings, or menu pages.
 * Everything flows from chat or the tree system.
 */
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

  // Get tenant profile (including IORS name)
  let iorsName: string | undefined;
  try {
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("iors_name, assistant_name")
      .eq("id", user.id)
      .single();
    iorsName = tenant?.iors_name || tenant?.assistant_name || undefined;
  } catch (e: unknown) {
    console.error("[Dashboard] Failed to load tenant:", e);
  }

  return <DualInterface tenantId={user.id} iorsName={iorsName} />;
}
