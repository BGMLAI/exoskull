"use client";

import { useState, useCallback, useEffect } from "react";
import { PanelRightClose, PanelRightOpen, Code2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkspaceFileBrowser } from "@/components/claude-code/WorkspaceFileBrowser";
import { CodePanel } from "@/components/claude-code/CodePanel";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";

/**
 * CodeSidebar — Toggleable right panel with file browser + code viewer.
 *
 * Reads open/toggle/lastChangedFile from useCockpitStore.
 * Auto-opens when file_change events arrive via the store.
 */
export function CodeSidebar() {
  const open = useCockpitStore((s) => s.codeSidebarOpen);
  const toggleCodeSidebar = useCockpitStore((s) => s.toggleCodeSidebar);
  const lastChangedFile = useCockpitStore((s) => s.lastChangedFile);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());

  // When a file_change comes in, mark it as modified and select it
  useEffect(() => {
    if (!lastChangedFile) return;
    setModifiedFiles((prev) => new Set(prev).add(lastChangedFile));
    setSelectedFile(lastChangedFile);
  }, [lastChangedFile]);

  const handleSelectFile = useCallback((filePath: string) => {
    setSelectedFile(filePath);
  }, []);

  return (
    <>
      {/* Toggle button — always visible, vertically centered on right edge */}
      <button
        onClick={toggleCodeSidebar}
        className={cn(
          "fixed z-[60] top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 px-2 py-3 text-xs font-mono rounded-l-lg",
          "backdrop-blur-sm border-l border-t border-b transition-all duration-200 shadow-lg",
          open
            ? "right-[480px] text-primary bg-card/90 border-primary/50 shadow-primary/20 hover:bg-accent"
            : "right-0 text-primary bg-card/90 border-primary/50 shadow-primary/20 hover:bg-accent hover:text-foreground hover:border-primary/70",
          modifiedFiles.size > 0 &&
            !open &&
            "border-amber-500/70 text-amber-500 bg-amber-900/30 shadow-amber-500/20",
        )}
        title={open ? "Close code panel" : "Open code panel"}
      >
        <Code2 className="w-4 h-4" />
        {open ? (
          <PanelRightClose className="w-4 h-4" />
        ) : (
          <PanelRightOpen className="w-4 h-4" />
        )}
        {modifiedFiles.size > 0 && !open && (
          <span className="px-1 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded leading-none">
            {modifiedFiles.size}
          </span>
        )}
      </button>

      {/* Sidebar panel */}
      <div
        className={cn(
          "fixed top-0 right-0 z-30 h-full flex flex-col",
          "bg-[#0a0a1a]/95 backdrop-blur-xl border-l border-white/10",
          "transition-all duration-300 ease-in-out",
          open ? "w-[480px] translate-x-0" : "w-0 translate-x-full",
        )}
      >
        {open && (
          <>
            {/* Header with close button */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <span className="text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">
                Code
              </span>
              <button
                onClick={toggleCodeSidebar}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Zamknij"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* File browser — top portion */}
            <div className="h-[35%] border-b border-white/10 overflow-hidden">
              <WorkspaceFileBrowser
                onSelectFile={handleSelectFile}
                modifiedFiles={modifiedFiles}
              />
            </div>

            {/* Code panel — bottom portion */}
            <div className="flex-1 overflow-hidden">
              <CodePanel selectedFile={selectedFile} diffData={null} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
