export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Home, Brain, Settings } from "lucide-react";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CollapsibleSidebar } from "@/components/dashboard/CollapsibleSidebar";

// Voice-first: 3 tabs only
const MOBILE_TAB_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/memory", label: "Pamiec", icon: Brain },
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

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — simplified */}
      <CollapsibleSidebar userEmail={user.email || ""} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card">
          <div>
            <p className="text-base font-semibold">ExoSkull</p>
            <p className="text-xs text-muted-foreground">Voice-First Life OS</p>
          </div>
          <ThemeToggle />
        </header>

        {/* Main content */}
        <main className="flex-1 min-h-0 overflow-hidden pb-16 md:pb-0">
          {children}
        </main>

        {/* Mobile bottom tab bar — 3 tabs */}
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
    </div>
  );
}
