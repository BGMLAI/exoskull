"use client";

import { useCallback, lazy, Suspense } from "react";
import { Terminal, FolderOpen, FileCode, Eye, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useWorkspaceStore,
  type WorkspaceTab,
} from "@/lib/stores/useWorkspaceStore";
import { WorkspaceFileBrowser } from "@/components/claude-code/WorkspaceFileBrowser";
import { CodePanel } from "@/components/claude-code/CodePanel";

// Dynamic import for TerminalTab (xterm.js is client-only, heavy)
const TerminalTab = lazy(() =>
  import("./TerminalTab").then((m) => ({ default: m.TerminalTab })),
);

// Dynamic import for PreviewTab
const PreviewTab = lazy(() =>
  import("./PreviewTab").then((m) => ({ default: m.PreviewTab })),
);

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

const TABS: { id: WorkspaceTab; label: string; icon: typeof Terminal }[] = [
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "code", label: "Code", icon: FileCode },
  { id: "preview", label: "Preview", icon: Eye },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SharedWorkspace() {
  const {
    activeTab,
    setActiveTab,
    isOpen,
    setOpen,
    selectedFile,
    diffData,
    previewUrl,
    previewHtml,
    openFile,
  } = useWorkspaceStore();

  const handleSelectFile = useCallback(
    (filePath: string) => {
      openFile(filePath);
    },
    [openFile],
  );

  if (!isOpen) return null;

  return (
    <div className="workspace-panel arwes-frame arwes-corners flex flex-col h-full bg-background/95 backdrop-blur-sm overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border/50 shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors relative",
                isActive
                  ? "text-foreground studio-tab-active"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}

        {/* Close button */}
        <button
          onClick={() => setOpen(false)}
          className="ml-auto p-2 text-muted-foreground hover:text-foreground transition-colors"
          title="Close workspace"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "terminal" && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <TerminalTab />
          </Suspense>
        )}

        {activeTab === "files" && (
          <WorkspaceFileBrowser
            onSelectFile={handleSelectFile}
            className="h-full"
          />
        )}

        {activeTab === "code" && (
          <CodePanel
            selectedFile={selectedFile}
            diffData={diffData}
            className="h-full"
          />
        )}

        {activeTab === "preview" && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <PreviewTab url={previewUrl} html={previewHtml} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
