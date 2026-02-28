"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SceneCanvas } from "@/components/scene/SceneCanvas";
import { ChatHUD } from "@/components/hud/ChatHUD";
import { CommandPalette } from "@/components/hud/CommandPalette";
import { WidgetHUD } from "@/components/hud/WidgetHUD";
import { useChatEngine } from "@/lib/hooks/useChatEngine";
import { useSpatialStore } from "@/lib/stores/useSpatialStore";

/**
 * SpatialApp — root component for the Spatial Chat OS.
 *
 * Structure:
 * - SceneCanvas (3D background: grid + orb, z=0)
 * - ChatHUD (2D overlay: message list + input bar, z=10)
 * - CommandPalette (Ctrl+K modal, z=50)
 */
export function SpatialApp() {
  const router = useRouter();
  const engine = useChatEngine();
  const { commandPaletteOpen, setCommandPaletteOpen, activeHashtag, is3DMode } =
    useSpatialStore();

  // ── Keyboard shortcuts ──

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const handleNavigate = useCallback(
    (path: string) => {
      router.push(path);
    },
    [router],
  );

  const handleSendFromPalette = useCallback(
    (text: string) => {
      engine.sendMessage(text, "text");
    },
    [engine],
  );

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-background"
      onDragOver={engine.handleDragOver}
      onDragLeave={engine.handleDragLeave}
      onDrop={engine.handleDrop}
    >
      {/* Drag overlay */}
      {engine.isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg">
          <p className="text-lg font-medium text-primary">Upusc pliki tutaj</p>
        </div>
      )}

      {/* Layer 0: 3D Scene / 2D gradient background */}
      <SceneCanvas
        iorsState={engine.iorsState}
        activeHashtag={activeHashtag}
        is3DMode={is3DMode}
      />

      {/* Layer 1: Widget HUD (floating cards on edges) */}
      <WidgetHUD />

      {/* Layer 2: Chat HUD (messages + input) */}
      <ChatHUD engine={engine} />

      {/* Layer 2: Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={handleNavigate}
        onSendMessage={handleSendFromPalette}
      />
    </div>
  );
}
