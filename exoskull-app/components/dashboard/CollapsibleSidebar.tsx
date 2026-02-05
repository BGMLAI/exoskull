"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CheckSquare,
  Settings,
  Clock,
  FileText,
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
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// ============================================================================
// TYPES
// ============================================================================

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface NavSection {
  id: string;
  label: string;
  emoji: string;
  items: NavItem[];
  defaultExpanded: boolean;
}

// ============================================================================
// NAVIGATION CONFIG
// ============================================================================

const NAV_SECTIONS: NavSection[] = [
  {
    id: "core",
    label: "CORE",
    emoji: "📊",
    defaultExpanded: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Home },
      {
        href: "/dashboard/conversations",
        label: "Rozmowy",
        icon: MessageSquare,
      },
      { href: "/dashboard/tasks", label: "Zadania", icon: CheckSquare },
      { href: "/dashboard/projects", label: "Projekty", icon: FolderKanban },
    ],
  },
  {
    id: "life",
    label: "ZYCIE",
    emoji: "🧠",
    defaultExpanded: true,
    items: [
      { href: "/dashboard/health", label: "Zdrowie", icon: Heart },
      { href: "/dashboard/goals", label: "Cele", icon: Target },
      { href: "/dashboard/mods", label: "Mody", icon: Puzzle },
      { href: "/dashboard/memory", label: "Pamiec", icon: Brain },
      { href: "/dashboard/knowledge", label: "Wiedza", icon: FileText },
    ],
  },
  {
    id: "system",
    label: "SYSTEM",
    emoji: "⚙️",
    defaultExpanded: false,
    items: [
      { href: "/dashboard/autonomy", label: "Autonomia", icon: Shield },
      { href: "/dashboard/skills", label: "Skille", icon: Sparkles },
      { href: "/dashboard/schedule", label: "Harmonogram", icon: Clock },
      { href: "/dashboard/business", label: "Biznes", icon: TrendingUp },
    ],
  },
];

const STORAGE_KEY = "nav-sections-collapsed";

// ============================================================================
// COMPONENT
// ============================================================================

interface CollapsibleSidebarProps {
  userEmail: string;
}

export function CollapsibleSidebar({ userEmail }: CollapsibleSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setCollapsed(JSON.parse(stored));
      } else {
        // Set defaults
        const defaults: Record<string, boolean> = {};
        for (const section of NAV_SECTIONS) {
          defaults[section.id] = !section.defaultExpanded;
        }
        setCollapsed(defaults);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const toggleSection = (id: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

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
          <p className="text-sm text-muted-foreground">Life OS</p>
        </div>
        <ThemeToggle />
      </div>

      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {NAV_SECTIONS.map((section) => {
          const isCollapsed = collapsed[section.id] ?? !section.defaultExpanded;
          return (
            <div key={section.id}>
              <button
                onClick={() => toggleSection(section.id)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                <span>{section.emoji}</span>
                <span className="flex-1 text-left">{section.label}</span>
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              <div
                className={`space-y-0.5 mt-1 transition-all duration-200 ${
                  isCollapsed
                    ? "max-h-0 overflow-hidden opacity-0"
                    : "max-h-96 opacity-100"
                }`}
              >
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                      isActive(item.href)
                        ? "bg-accent font-medium"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t space-y-0.5">
        <Link
          href="/dashboard/notifications"
          className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
            isActive("/dashboard/notifications")
              ? "bg-accent font-medium"
              : "hover:bg-accent/50"
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Powiadomienia</span>
        </Link>
        <Link
          href="/dashboard/settings"
          className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
            isActive("/dashboard/settings")
              ? "bg-accent font-medium"
              : "hover:bg-accent/50"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Ustawienia</span>
        </Link>
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
