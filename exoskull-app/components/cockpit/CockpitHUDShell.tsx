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
import { CockpitZoneSlot } from "./CockpitZoneSlot";

/**
 * CockpitHUDShell — Master overlay layout for the cockpit HUD.
 *
 * Zones:
 *   top-left:     ReactionButtons (default) or pinned widget
 *   top-right:    ChannelOrbs (default) or pinned widget
 *   center:       Chat/Tree/Preview (CenterViewport)
 *   bottom-left:  HUD panel pair or pinned widget
 *   bottom-right: HUD panel pair or pinned widget
 *   left-wing:    Optional expandable pinned widget
 *   right-wing:   Optional expandable pinned widget
 *   actions:      CockpitActionBar (fixed)
 *
 * - 3D scene = full viewport background
 * - Chat = floating bubbles over center
 * - Tab toggles HUD minimize (full 3D mode)
 */

const CHAT_MIN_H = 120;
const CHAT_DEFAULT_H = 420;
const CHAT_MAX_H = 700;

export function CockpitHUDShell() {
  useCockpitKeys();
  const hudMinimized = useCockpitStore((s) => s.hudMinimized);
  const toggleHud = useCockpitStore((s) => s.toggleHudMinimized);
  const zoneWidgets = useCockpitStore((s) => s.zoneWidgets);

  const hasLeftWing = zoneWidgets.some((z) => z.zoneId === "left-wing");
  const hasRightWing = zoneWidgets.some((z) => z.zoneId === "right-wing");
  const hasTopLeft = zoneWidgets.some((z) => z.zoneId === "top-left");
  const hasTopRight = zoneWidgets.some((z) => z.zoneId === "top-right");

  // Load zone widgets from backend on mount
  useEffect(() => {
    fetch("/api/settings/cockpit")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.zone_widgets?.length) {
          useCockpitStore.getState().setZoneWidgets(data.zone_widgets);
        }
        if (data?.cockpit_style) {
          useCockpitStore.getState().setCockpitStyle(data.cockpit_style);
        }
      })
      .catch((err) =>
        console.error("[CockpitHUDShell] Settings load failed:", err),
      );
  }, []);

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

      {/* ── Top-Left: Reaction buttons or pinned widget ── */}
      {hasTopLeft ? (
        <div
          className="cockpit-zone cockpit-zone--top-left"
          style={{
            pointerEvents: "auto",
            position: "fixed",
            top: 64,
            left: 16,
            width: 200,
            zIndex: 10,
          }}
        >
          <CockpitZoneSlot zoneId="top-left" />
        </div>
      ) : (
        <ReactionButtons />
      )}

      {/* ── Top-Right: Channel orbs or pinned widget ── */}
      {hasTopRight ? (
        <div
          className="cockpit-zone cockpit-zone--top-right"
          style={{
            pointerEvents: "auto",
            position: "fixed",
            top: 64,
            right: 16,
            width: 200,
            zIndex: 10,
          }}
        >
          <CockpitZoneSlot zoneId="top-right" />
        </div>
      ) : (
        <ChannelOrbs />
      )}

      {!hudMinimized && (
        <>
          {/* ── Left Wing: Optional pinned widget ── */}
          {hasLeftWing && (
            <div
              className="cockpit-zone cockpit-zone--left-wing"
              style={{
                pointerEvents: "auto",
                position: "fixed",
                left: 8,
                top: "50%",
                transform: "translateY(-50%)",
                width: 220,
                maxHeight: "60vh",
                zIndex: 10,
              }}
            >
              <CockpitZoneSlot zoneId="left-wing" />
            </div>
          )}

          {/* ── Right Wing: Optional pinned widget ── */}
          {hasRightWing && (
            <div
              className="cockpit-zone cockpit-zone--right-wing"
              style={{
                pointerEvents: "auto",
                position: "fixed",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                width: 220,
                maxHeight: "60vh",
                zIndex: 10,
              }}
            >
              <CockpitZoneSlot zoneId="right-wing" />
            </div>
          )}

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
