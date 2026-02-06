"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageSquare,
  Package,
  Brain,
  Plug,
  Settings,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// ============================================================================
// NAVIGATION CONFIG — Canvas-first: 5 screens
// ============================================================================

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/mods", label: "Mody", icon: Package },
  { href: "/dashboard/settings/integrations", label: "Integracje", icon: Plug },
  { href: "/dashboard/memory", label: "Pamiec", icon: Brain },
  { href: "/dashboard/settings", label: "Ustawienia", icon: Settings },
];

// ============================================================================
// COMPONENT
// ============================================================================

interface CollapsibleSidebarProps {
  userEmail: string;
  iorsName?: string;
  birthCompleted?: boolean;
}

export function CollapsibleSidebar({
  userEmail,
  iorsName,
  birthCompleted,
}: CollapsibleSidebarProps) {
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

      {/* IORS Badge */}
      {iorsName && (
        <div className="px-6 py-3 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {iorsName[0]?.toUpperCase() || "I"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{iorsName}</p>
              <p className="text-[10px] text-muted-foreground">
                {birthCompleted ? "Aktywny" : "W narodzinach..."}
              </p>
            </div>
          </div>
        </div>
      )}

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
