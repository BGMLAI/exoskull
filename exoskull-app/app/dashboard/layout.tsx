export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: {
    template: "%s | ExoSkull",
    default: "ExoSkull",
  },
};

/**
 * Dashboard Layout — auth check only, no shell wrapper.
 * SpatialApp provides its own fullscreen layout.
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

  return <ErrorBoundary>{children}</ErrorBoundary>;
}
