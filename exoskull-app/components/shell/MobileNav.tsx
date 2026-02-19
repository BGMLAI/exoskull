"use client";

import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, LayoutGrid, Plug, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const MOBILE_TABS = [
  { id: "home", label: "Czat", icon: MessageSquare, href: "/dashboard" },
  { id: "apps", label: "Aplikacje", icon: LayoutGrid, href: "/dashboard/apps" },
  {
    id: "hub",
    label: "Integracje",
    icon: Plug,
    href: "/dashboard/integrations",
  },
  {
    id: "settings",
    label: "Ustawienia",
    icon: Settings,
    href: "/dashboard/settings",
  },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav
      className="md:hidden shrink-0 border-t bg-card flex items-stretch z-20"
      role="navigation"
      aria-label="Mobile navigation"
    >
      {MOBILE_TABS.map((tab) => {
        const isActive =
          tab.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname?.startsWith(tab.href);

        return (
          <button
            key={tab.id}
            onClick={() => router.push(tab.href)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors",
              isActive ? "text-primary font-medium" : "text-muted-foreground",
            )}
          >
            <tab.icon className="w-5 h-5" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
