"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SceneCanvas } from "@/components/scene/SceneCanvas";
import { ChatHUD } from "@/components/hud/ChatHUD";
import { CommandPalette } from "@/components/hud/CommandPalette";
import { WidgetHUD } from "@/components/hud/WidgetHUD";
import { ActivityBar } from "@/components/hud/ActivityBar";
import { useChatEngine } from "@/lib/hooks/useChatEngine";
import { useSpatialStore } from "@/lib/stores/useSpatialStore";

/**
 * SpatialApp — root component for the Spatial Chat OS.
 *
 * Structure:
 * - SceneCanvas (3D background: knowledge graph OR orb, z=0)
 * - ActivityBar (IORS status bar when active, z=40)
 * - ChatHUD (2D overlay: message list + input bar, z=10)
 * - CommandPalette (Ctrl+K modal, z=50)
 *
 * Workspace artifacts appear INLINE in the chat stream,
 * not in a separate panel.
 */
export function SpatialApp() {
  const router = useRouter();
  const engine = useChatEngine();
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    activeHashtag,
    is3DMode,
    sceneMode,
  } = useSpatialStore();

  // ── Sync IORS state with scene mode + active task ──
  // When IORS starts working → switch to orb mode, extract task context
  // When IORS goes idle → clear task, switch back to graph mode
  useEffect(() => {
    const store = useSpatialStore.getState();
    if (engine.iorsState !== "idle" && store.sceneMode === "graph") {
      store.setSceneMode("orb");

      // Extract tags from the last user message (hashtags + key words)
      const lastUserEvent = [...engine.events]
        .reverse()
        .find((e) => e.data.type === "user_message");
      const userText =
        lastUserEvent?.data.type === "user_message"
          ? (lastUserEvent.data as { content: string }).content
          : "";

      // Extract #hashtags from message
      const hashtags = (userText.match(/#[\w\u0100-\u024F]+/g) || []).map((t) =>
        t.slice(1),
      );

      // Extract key nouns (simple: words longer than 4 chars, not common)
      const STOP_WORDS = new Set([
        "about",
        "could",
        "would",
        "should",
        "there",
        "their",
        "which",
        "these",
        "those",
        "where",
        "while",
        "being",
        "other",
        "please",
        "zrob",
        "chce",
        "prosze",
        "moze",
        "trzeba",
        "jeszcze",
        "bardzo",
      ]);
      const keywords = userText
        .replace(/#[\w]+/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 4 && !STOP_WORDS.has(w.toLowerCase()))
        .map((w) => w.replace(/[^a-zA-Z\u0100-\u024F]/g, ""))
        .filter((w) => w.length > 3)
        .slice(0, 4);

      const tags = [...new Set([...hashtags, ...keywords])].slice(0, 6);

      if (tags.length > 0 || userText.length > 0) {
        store.startTask({
          title: userText.slice(0, 60) || "Working...",
          tags,
        });
      }
    } else if (engine.iorsState === "idle" && store.sceneMode === "orb") {
      // Small delay before switching back to graph (avoid flickering)
      const timeout = setTimeout(() => {
        const current = useSpatialStore.getState();
        if (current.sceneMode === "orb") {
          current.clearTask();
        }
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [engine.iorsState, engine.events]);

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

      {/* Layer 0: 3D Scene — knowledge graph (idle) or orb (active) */}
      <SceneCanvas
        iorsState={engine.iorsState}
        activeHashtag={activeHashtag}
        is3DMode={is3DMode}
        sceneMode={sceneMode}
      />

      {/* Layer 1: Activity Bar — shows what IORS is doing */}
      <ActivityBar iorsState={engine.iorsState} />

      {/* Layer 1: Widget HUD (floating cards on edges) */}
      <WidgetHUD />

      {/* Layer 2: Chat HUD (messages + input) — workspace artifacts render inline here */}
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
