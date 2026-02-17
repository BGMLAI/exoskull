"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { useCockpitKeys } from "@/lib/hooks/useCockpitKeys";
import { CockpitTopBar } from "./CockpitTopBar";
import { CockpitActionBar } from "./CockpitActionBar";
import { BottomPanelGrid } from "./BottomPanelGrid";
import { CenterViewport } from "./CenterViewport";
import { ChannelOrbs } from "./ChannelOrbs";
import { ReactionButtons } from "./ReactionButtons";

/**
 * CockpitHUDShell — Master overlay layout for the cockpit HUD.
 *
 * NEW LAYOUT (per user mockup):
 * ┌──────────────────────────────────────────────────────┐
 * │ [reactions]    3D SCENE (full bg)        [channels]  │
 * │  ❌ ✅ 😆     orbs, grid, skybox        📷🟢📞@    │
 * │                                                      │
 * │         ┌── message from iors ──┐                    │
 * │                    ┌── my message ──┐                │
 * │         ┌── message from iors ──┐                    │
 * │                                                      │
 * │ ┌──────────┬──────────┐  ┌──────────┬──────────┐    │
 * │ │ iors     │kalendarz │  │ plan     │ moje     │    │
 * │ │ activity │ /teraz   │  │          │ taski    │    │
 * │ └──────────┴──────────┘  └──────────┴──────────┘    │
 * │ ┌──────┬──────────┬───────────┬──────────┬──────┐   │
 * │ │delete│ proces   │  [input]  │ wiedza/  │zacho-│   │
 * │ │      │ iors     │           │ kontekst │ waj  │   │
 * │ └──────┴──────────┴───────────┴──────────┴──────┘   │
 * └──────────────────────────────────────────────────────┘
 *
 * - 3D scene = full viewport background (no wings)
 * - Chat = floating bubbles over center
 * - Bottom panels = 2x2 glass panels
 * - Action bar = 5-cell bar at very bottom
 * - Top-right: channel icons
 * - Top-left: reaction/action buttons
 * - Tab toggles HUD minimize (full 3D mode)
 */

const CHAT_MIN_H = 120;
const CHAT_DEFAULT_H = 260;
const CHAT_MAX_H = 500;

export function CockpitHUDShell() {
  useCockpitKeys();
  const hudMinimized = useCockpitStore((s) => s.hudMinimized);
  const toggleHud = useCockpitStore((s) => s.toggleHudMinimized);

  // Chat area height (draggable)
  const [chatH, setChatH] = useState(CHAT_DEFAULT_H);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onChatDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startH.current = chatH;
    },
    [chatH],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY;
      const newH = Math.max(
        CHAT_MIN_H,
        Math.min(CHAT_MAX_H, startH.current + delta),
      );
      setChatH(newH);
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div
      className="cockpit-hud cockpit-hud-v2"
      style={{ pointerEvents: "none" }}
    >
      {/* ── Top Bar (minimal, transparent) ── */}
      <div
        className="cockpit-zone cockpit-zone--top"
        style={{ pointerEvents: "auto" }}
      >
        <CockpitTopBar />
      </div>

      {/* ── Top-Left: Reaction buttons ── */}
      <ReactionButtons />

      {/* ── Top-Right: Channel orbs ── */}
      <ChannelOrbs />

      {!hudMinimized && (
        <>
          {/* ── Center: Floating chat area ── */}
          <section
            aria-label="Czat z IORS"
            className="cockpit-zone cockpit-zone--chat"
            style={{
              height: chatH,
              pointerEvents: "auto",
            }}
          >
            {/* Drag handle at top of chat */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Zmień rozmiar panelu czatu"
              aria-valuenow={chatH}
              aria-valuemin={CHAT_MIN_H}
              aria-valuemax={CHAT_MAX_H}
              tabIndex={0}
              onMouseDown={onChatDragStart}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setChatH((h) => Math.min(CHAT_MAX_H, h + 20));
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setChatH((h) => Math.max(CHAT_MIN_H, h - 20));
                }
              }}
              className="cockpit-chat-drag-handle"
            >
              <div className="cockpit-chat-drag-pill" />
            </div>

            <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
              <CenterViewport />
            </div>
          </section>

          {/* ── Bottom: Panel grid (2x2) ── */}
          <div
            className="cockpit-zone cockpit-zone--panels"
            style={{ pointerEvents: "auto" }}
          >
            <BottomPanelGrid />
          </div>

          {/* ── Bottom: Action bar (5 cells) ── */}
          <div
            className="cockpit-zone cockpit-zone--actions"
            style={{ pointerEvents: "auto" }}
          >
            <CockpitActionBar />
          </div>
        </>
      )}

      {/* ── Toggle HUD button (always visible) ── */}
      <button
        type="button"
        onClick={toggleHud}
        aria-label={hudMinimized ? "Pokaż panel HUD" : "Tryb pełnego 3D"}
        aria-pressed={!hudMinimized}
        className="cockpit-hud-toggle"
        style={{
          pointerEvents: "auto",
          bottom: hudMinimized ? 16 : 8,
        }}
      >
        {hudMinimized ? "SHOW HUD [Tab]" : "FULL 3D [Tab]"}
      </button>
    </div>
  );
}
