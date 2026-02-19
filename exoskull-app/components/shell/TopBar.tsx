"use client";

import { Menu, User, LogOut, Palette } from "lucide-react";
import { useAppStore } from "@/lib/stores/useAppStore";
import { ThemeSwitcher } from "@/components/ui/ThemeSwitcher";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TopBarProps {
  /** Slot for GoalStrip (Phase 3) */
  children?: React.ReactNode;
}

export function TopBar({ children }: TopBarProps) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  return (
    <header className="h-12 shrink-0 border-b bg-card flex items-center gap-3 px-3 z-20">
      {/* Sidebar toggle (mobile: hamburger, desktop: collapse) */}
      <button
        onClick={toggleSidebar}
        className="p-2 rounded-lg hover:bg-muted transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Logo */}
      <span className="font-heading font-bold text-base tracking-tight select-none">
        ExoSkull
      </span>

      {/* Goal strip slot — grows to fill space */}
      <div className="flex-1 min-w-0 overflow-hidden">{children}</div>

      {/* User menu */}
      <UserMenu />
    </header>
  );
}

function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-2 rounded-full hover:bg-muted transition-colors"
          aria-label="User menu"
        >
          <User className="w-5 h-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            <span>Motyw</span>
            <div className="ml-auto">
              <ThemeSwitcher />
            </div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/dashboard/settings" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Ustawienia
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action="/api/auth/signout" method="post" className="w-full">
            <button
              type="submit"
              className="flex items-center gap-2 w-full text-destructive"
            >
              <LogOut className="w-4 h-4" />
              Wyloguj
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
