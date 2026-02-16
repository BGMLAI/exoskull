"use client";

import { useCockpitStore } from "@/lib/stores/useCockpitStore";

/**
 * NavBreadcrumb — shows the current drill-in path.
 * Each segment is clickable to navigate to that depth.
 * Rendered in CockpitTopBar.
 */
export function NavBreadcrumb() {
  const navStack = useCockpitStore((s) => s.navStack);
  const navigateTo = useCockpitStore((s) => s.navigateTo);
  const resetNav = useCockpitStore((s) => s.resetNav);

  if (navStack.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: "11px",
        fontFamily: "monospace",
      }}
    >
      {/* Overview root */}
      <span
        onClick={resetNav}
        style={{
          color: "var(--hud-cyan, #06b6d4)",
          cursor: "pointer",
          opacity: 0.7,
          transition: "opacity 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "0.7";
        }}
      >
        OVERVIEW
      </span>

      {navStack.map((entry, i) => (
        <span
          key={entry.id}
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <span style={{ color: "var(--hud-text-muted, #666)", opacity: 0.5 }}>
            /
          </span>
          <span
            onClick={() => navigateTo(i + 1)}
            style={{
              color:
                i === navStack.length - 1
                  ? "var(--hud-green, #10b981)"
                  : "var(--hud-cyan, #06b6d4)",
              cursor: "pointer",
              opacity: i === navStack.length - 1 ? 1 : 0.7,
              fontWeight: i === navStack.length - 1 ? 600 : 400,
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity =
                i === navStack.length - 1 ? "1" : "0.7";
            }}
          >
            {entry.label.toUpperCase()}
          </span>
        </span>
      ))}
    </div>
  );
}
