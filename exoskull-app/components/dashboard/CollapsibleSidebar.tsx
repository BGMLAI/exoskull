"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Brain, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// ============================================================================
// NAVIGATION CONFIG — Voice-First: 3 screens only
// ============================================================================

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/memory", label: "Pamiec", icon: Brain },
  { href: "/dashboard/settings", label: "Ustawienia", icon: Settings },
];

// ============================================================================
// COMPONENT
// ============================================================================

interface CollapsibleSidebarProps {
  userEmail: string;
}

export function CollapsibleSidebar({ userEmail }: CollapsibleSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside className="hidden md:flex w-64 bg-card border-r flex-col">
      {/* Header */}
      <div className="p-6 border-b flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ExoSkull</h1>
          <p className="text-sm text-muted-foreground">Voice-First Life OS</p>
        </div>
        <ThemeToggle />
      </div>

      {/* Navigation — flat list */}
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors text-sm ${
              isActive(item.href)
                ? "bg-accent font-medium"
                : "hover:bg-accent/50"
            }`}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t">
        <div className="px-4 pt-2">
          <p className="text-xs font-medium truncate">{userEmail}</p>
          <form action="/api/auth/signout" method="post">
            <button className="text-xs text-muted-foreground hover:text-foreground mt-1">
              Wyloguj
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
