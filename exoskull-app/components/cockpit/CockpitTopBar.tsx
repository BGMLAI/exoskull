"use client";

import { useEffect, useState } from "react";
import { useSceneStore } from "@/lib/stores/useSceneStore";
import { NavBreadcrumb } from "./NavBreadcrumb";

/**
 * CockpitTopBar — Status bar at the top of the cockpit HUD.
 * Left: clock, Center: IORS status, Right: active tool.
 */
export function CockpitTopBar() {
  const [time, setTime] = useState("");
  const effect = useSceneStore((s) => s.effect);
  const activeTool = useSceneStore((s) => s.activeTool);

  // Clock update every second
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("pl-PL", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // Map effect to status label
  const statusLabel =
    effect === "thinking"
      ? "THINKING"
      : effect === "executing"
        ? "EXECUTING"
        : "IDLE";

  const statusClass =
    effect === "thinking"
      ? "hud-status-thinking"
      : effect === "executing"
        ? "hud-status-executing"
        : "hud-status-idle";

  // Active tool display
  const toolDisplay = activeTool
    ? activeTool.name.replace(/_/g, " ").toUpperCase()
    : null;

  return (
    <div className="hud-topbar">
      {/* Left: Clock */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "var(--hud-cyan)", opacity: 0.6 }}>{time}</span>
        <span style={{ color: "var(--hud-text-muted)" }}>EXOSKULL</span>
      </div>

      {/* Center: Nav breadcrumb or IORS Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <NavBreadcrumb />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            className={`hud-indicator-pulse ${statusClass}`}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "currentColor",
              display: "inline-block",
            }}
          />
          <span className={statusClass}>{statusLabel}</span>
        </div>
      </div>

      {/* Right: Active tool */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {toolDisplay ? (
          <>
            <span style={{ color: "var(--hud-cyan)" }}>{toolDisplay}</span>
          </>
        ) : (
          <span style={{ color: "var(--hud-green)", opacity: 0.5 }}>
            ONLINE
          </span>
        )}
      </div>
    </div>
  );
}
