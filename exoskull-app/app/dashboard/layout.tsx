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
 * Dashboard Layout — Minimal wrapper
 *
 * The old layout had sidebar, mobile nav, etc.
 * New paradigm: DualInterface handles everything.
 * Layout only does auth check and provides error boundary.
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
    <main id="main-content" role="main" aria-label="Dashboard">
      <ErrorBoundary>{children}</ErrorBoundary>
    </main>
  );
}
