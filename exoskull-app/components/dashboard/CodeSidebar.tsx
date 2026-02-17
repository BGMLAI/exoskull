"use client";

import { useState, useCallback, useEffect } from "react";
import { PanelRightClose, PanelRightOpen, Code2 } from "lucide-react";
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
      {/* Toggle button — always visible */}
      <button
        onClick={toggleCodeSidebar}
        className={cn(
          "fixed z-50 top-4 right-44 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded",
          "bg-black/50 backdrop-blur-sm border transition-all duration-200",
          open
            ? "text-cyan-400 border-cyan-600/50 hover:bg-cyan-900/30"
            : "text-slate-400 border-slate-700/50 hover:text-white hover:border-slate-600/50",
          modifiedFiles.size > 0 &&
            !open &&
            "border-amber-500/50 text-amber-400",
        )}
        title={open ? "Close code panel" : "Open code panel"}
      >
        <Code2 className="w-3.5 h-3.5" />
        {open ? (
          <PanelRightClose className="w-3.5 h-3.5" />
        ) : (
          <PanelRightOpen className="w-3.5 h-3.5" />
        )}
        {modifiedFiles.size > 0 && !open && (
          <span className="ml-0.5 px-1 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded">
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
