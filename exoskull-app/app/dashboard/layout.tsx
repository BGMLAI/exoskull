export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppShell } from "@/components/shell/AppShell";
import { GoalStrip } from "@/components/shell/GoalStrip";

export const metadata: Metadata = {
  title: {
    template: "%s | ExoSkull",
    default: "ExoSkull",
  },
};

/**
 * Dashboard Layout — AppShell wrapper with auth check.
 * GoalStrip rendered in TopBar slot.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <ErrorBoundary>
      <AppShell topBarSlot={<GoalStrip />}>{children}</AppShell>
    </ErrorBoundary>
  );
}
