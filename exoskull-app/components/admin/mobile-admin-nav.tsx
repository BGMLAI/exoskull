"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowLeft } from "lucide-react";
import { AdminSidebarClient } from "./admin-sidebar-client";

interface NavItem {
  href: string;
  label: string;
  iconName: string;
}

export function MobileAdminNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-sidebar-bg border border-sidebar-border text-sidebar-text"
        aria-label="Open admin menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60"
          onClick={() => setOpen(false)}
        >
          {/* Slide-out panel */}
          <aside
            className="w-64 h-full bg-sidebar-bg text-sidebar-text flex flex-col border-r border-sidebar-border"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
              <Link
                href="/admin"
                className="flex items-center gap-2.5"
                onClick={() => setOpen(false)}
              >
                <AdminSidebarClient type="logo" />
                <div>
                  <h1 className="text-base font-heading font-bold">ExoSkull</h1>
                  <p className="text-[10px] text-sidebar-muted tracking-wide uppercase">
                    Admin Panel
                  </p>
                </div>
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-muted hover:text-foreground transition-colors"
                >
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            {/* Bottom */}
            <div className="p-3 space-y-3 border-t border-sidebar-border">
              <AdminSidebarClient type="theme-switcher" />
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-muted hover:bg-muted hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Dashboard</span>
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
