import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CanvasGrid } from "@/components/canvas/CanvasGrid";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home" };

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

  // Get tenant profile (including IORS data)
  let assistantName = "IORS";
  let phoneNumber: string | undefined;
  try {
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("assistant_name, phone_number, iors_name")
      .eq("id", user.id)
      .single();
    assistantName = tenant?.iors_name || tenant?.assistant_name || "IORS";
    phoneNumber = tenant?.phone_number || undefined;
  } catch (e: unknown) {
    console.error("[Dashboard] Failed to load tenant:", e);
  }

  return (
    <div className="h-full overflow-auto">
      <CanvasGrid
        tenantId={user.id}
        assistantName={assistantName}
        phoneNumber={phoneNumber}
      />
    </div>
  );
}
