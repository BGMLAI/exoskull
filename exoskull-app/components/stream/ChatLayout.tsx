"use client";

import { useState, useCallback } from "react";
import { UnifiedStream } from "./UnifiedStream";
import { ContextPanel } from "./ContextPanel";
import {
  SharedWorkspace,
  WorkspaceToggle,
} from "@/components/workspace/SharedWorkspace";

export function ChatLayout() {
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("exo-tts-enabled") === "true";
  });

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);

  const toggleTTS = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("exo-tts-enabled", String(next));
      return next;
    });
  }, []);

  return (
    <div className="flex h-full relative">
      {/* Chat / Unified Stream — left side */}
      <div
        className={`flex flex-col ${workspaceOpen && !workspaceExpanded ? "w-1/2 lg:w-3/5" : workspaceExpanded ? "hidden" : "flex-1"}`}
      >
        <UnifiedStream
          className="flex-1"
          ttsEnabled={ttsEnabled}
          onToggleTTS={toggleTTS}
          workspaceToggle={
            <WorkspaceToggle
              onClick={() => setWorkspaceOpen(!workspaceOpen)}
              isOpen={workspaceOpen}
            />
          }
        />
      </div>

      {/* Shared Workspace — right side */}
      {workspaceOpen && (
        <div
          className={`${workspaceExpanded ? "w-full" : "w-1/2 lg:w-2/5"} flex flex-col`}
        >
          <SharedWorkspace
            onClose={() => {
              setWorkspaceOpen(false);
              setWorkspaceExpanded(false);
            }}
            isExpanded={workspaceExpanded}
            onToggleExpand={() => setWorkspaceExpanded(!workspaceExpanded)}
          />
        </div>
      )}

      {/* Context panel — only when workspace is closed */}
      {!workspaceOpen && (
        <div className="hidden lg:block">
          <ContextPanel ttsEnabled={ttsEnabled} onToggleTTS={toggleTTS} />
        </div>
      )}
    </div>
  );
}
