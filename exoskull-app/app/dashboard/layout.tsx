export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Home, MessageSquare, TreePine, Settings } from "lucide-react";

export const metadata: Metadata = {
  title: {
    template: "%s | ExoSkull",
    default: "Dashboard | ExoSkull",
  },
};

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CollapsibleSidebar } from "@/components/dashboard/CollapsibleSidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FloatingCallButton } from "@/components/voice/FloatingCallButton";
import { NeuralBackground } from "@/components/ui/NeuralBackground";

// react-grid-layout CSS — loaded in globals.css via @import or inline here
// Note: exports field doesn't expose CSS, so we'll add styles inline in the client component

// Mobile bottom tabs — 4 core items (matching simplified sidebar)
const MOBILE_TAB_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/values", label: "Wartosci", icon: TreePine },
  { href: "/dashboard/settings", label: "Ustawienia", icon: Settings },
];

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

  // Fetch IORS data for sidebar badge
  let iorsName: string | undefined;
  let birthCompleted: boolean | undefined;
  try {
    const { data: tenant } = await supabase
      .from("exo_tenants")
      .select("iors_name, iors_birth_completed")
      .eq("id", user.id)
      .single();
    iorsName = tenant?.iors_name || undefined;
    birthCompleted = tenant?.iors_birth_completed ?? undefined;
  } catch {
    // Tenant may not exist yet
  }

  return (
    <div className="min-h-screen flex relative">
      {/* Neural network background — subtle ambient animation */}
      <NeuralBackground
        nodeCount={12}
        pulseIntensity="subtle"
        className="fixed inset-0 z-0"
      />

      {/* Sidebar — with IORS badge */}
      <CollapsibleSidebar
        userEmail={user.email || ""}
        iorsName={iorsName}
        birthCompleted={birthCompleted}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card">
          <div>
            <p className="text-base font-semibold">ExoSkull</p>
            <p className="text-xs text-muted-foreground">
              {iorsName || "Voice-First Life OS"}
            </p>
          </div>
          <ThemeToggle />
        </header>

        {/* Main content */}
        <main className="flex-1 min-h-0 overflow-hidden pb-16 md:pb-0">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>

        {/* Mobile bottom tab bar — 4 tabs */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t flex items-center justify-around py-2 z-40">
          {MOBILE_TAB_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Floating call button — visible on ALL dashboard pages */}
      <FloatingCallButton tenantId={user.id} />
    </div>
  );
}
