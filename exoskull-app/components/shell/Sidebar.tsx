"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  MessageSquare,
  LayoutGrid,
  Plug,
  Settings,
  Target,
  Brain,
  ChevronLeft,
  TreePine,
} from "lucide-react";
import { useAppStore } from "@/lib/stores/useAppStore";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Czat", icon: MessageSquare },
  { href: "/dashboard/goals", label: "Cele", icon: Target },
  { href: "/dashboard/apps", label: "Aplikacje", icon: LayoutGrid },
  { href: "/dashboard/integrations", label: "Integracje", icon: Plug },
  { href: "/dashboard/values", label: "Bieguny", icon: TreePine },
  { href: "/dashboard/knowledge", label: "Wiedza", icon: Brain },
  { href: "/dashboard/settings", label: "Ustawienia", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={cn(
          "shrink-0 bg-[hsl(var(--sidebar-bg))] border-r border-[hsl(var(--sidebar-border))] flex flex-col z-40 transition-all duration-200",
          // Mobile: fixed overlay
          "fixed inset-y-0 left-0 md:relative md:inset-auto",
          sidebarOpen
            ? "w-56"
            : "w-0 md:w-14 -translate-x-full md:translate-x-0",
        )}
      >
        {/* Collapse button (desktop only) */}
        <div className="hidden md:flex items-center justify-end p-2">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-[hsl(var(--sidebar-muted))]"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <ChevronLeft
              className={cn(
                "w-4 h-4 transition-transform",
                !sidebarOpen && "rotate-180",
              )}
            />
          </button>
        </div>

        {/* Nav items */}
        <nav
          className="flex-1 px-2 space-y-1 overflow-y-auto"
          role="navigation"
          aria-label="Main navigation"
        >
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  // Close mobile sidebar on nav
                  if (window.innerWidth < 768) toggleSidebar();
                }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-text))] font-medium"
                    : "text-[hsl(var(--sidebar-text))] hover:bg-muted",
                  !sidebarOpen && "md:justify-center md:px-0",
                )}
                title={!sidebarOpen ? item.label : undefined}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
