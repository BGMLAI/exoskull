import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ConversationView } from "@/components/conversation/ConversationView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ExoSkull" };

/**
 * Dashboard Page — Conversation-centric home.
 * Replaced CyberpunkDashboard with clean ConversationView.
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

  return (
    <>
      <h1 className="sr-only">ExoSkull Dashboard</h1>
      <ConversationView />
    </>
  );
}
