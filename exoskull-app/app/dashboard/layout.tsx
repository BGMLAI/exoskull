export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Home,
  CheckSquare,
  Settings,
  Clock,
  FileText,
  Menu,
  Heart,
  TrendingUp,
  Sparkles,
  Target,
  Puzzle,
  Brain,
  Shield,
  Bell,
  MessageSquare,
  FolderKanban,
} from "lucide-react";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CollapsibleSidebar } from "@/components/dashboard/CollapsibleSidebar";

// All nav items for mobile dropdown (full list)
const ALL_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/conversations", label: "Rozmowy", icon: MessageSquare },
  { href: "/dashboard/tasks", label: "Zadania", icon: CheckSquare },
  { href: "/dashboard/projects", label: "Projekty", icon: FolderKanban },
  { href: "/dashboard/health", label: "Zdrowie", icon: Heart },
  { href: "/dashboard/goals", label: "Cele", icon: Target },
  { href: "/dashboard/mods", label: "Mody", icon: Puzzle },
  { href: "/dashboard/memory", label: "Pamiec", icon: Brain },
  { href: "/dashboard/knowledge", label: "Wiedza", icon: FileText },
  { href: "/dashboard/autonomy", label: "Autonomia", icon: Shield },
  { href: "/dashboard/skills", label: "Skille", icon: Sparkles },
  { href: "/dashboard/schedule", label: "Harmonogram", icon: Clock },
  { href: "/dashboard/business", label: "Biznes", icon: TrendingUp },
  { href: "/dashboard/notifications", label: "Powiadomienia", icon: Bell },
];

// Subset for mobile bottom tab bar (5 max for usability)
const MOBILE_TAB_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/conversations", label: "Rozmowy", icon: MessageSquare },
  { href: "/dashboard/health", label: "Zdrowie", icon: Heart },
  { href: "/dashboard/mods", label: "Mody", icon: Puzzle },
  { href: "/dashboard/settings", label: "Wiecej", icon: Settings },
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
      {/* Sidebar — collapsible sections */}
      <CollapsibleSidebar userEmail={user.email || ""} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card">
          <div>
            <p className="text-base font-semibold">ExoSkull</p>
            <p className="text-xs text-muted-foreground">Life OS</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {user.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ALL_NAV_ITEMS.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    href="/dashboard/settings"
                    className="flex items-center gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Ustawienia</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form
                  action="/api/auth/signout"
                  method="post"
                  className="w-full"
                >
                  <DropdownMenuItem asChild>
                    <button className="w-full text-left">Wyloguj</button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 min-h-0 overflow-hidden pb-16 md:pb-0">
          {children}
        </main>

        {/* Mobile bottom tab bar */}
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
