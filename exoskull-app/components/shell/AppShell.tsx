"use client";

import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileNav } from "./MobileNav";
import { useAppStore } from "@/lib/stores/useAppStore";

interface AppShellProps {
  children: React.ReactNode;
  /** Slot rendered inside TopBar between logo and user menu (for GoalStrip) */
  topBarSlot?: React.ReactNode;
}

/**
 * AppShell — Master layout replacing CyberpunkDashboard.
 *
 * Desktop: Sidebar | TopBar + Content
 * Mobile: TopBar + Content + BottomNav
 */
export function AppShell({ children, topBarSlot }: AppShellProps) {
  // Close sidebar on mobile on first render
  useEffect(() => {
    if (window.innerWidth < 768) {
      useAppStore.getState().setSidebarOpen(false);
    }
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Sidebar (desktop: always, mobile: overlay) */}
      <Sidebar />

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar>{topBarSlot}</TopBar>

        {/* Content area */}
        <main className="flex-1 min-h-0 overflow-hidden" id="main-content">
          {children}
        </main>

        {/* Mobile bottom navigation */}
        <MobileNav />
      </div>
    </div>
  );
}
