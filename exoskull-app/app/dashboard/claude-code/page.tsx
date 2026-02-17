"use client";

import { useState, useCallback, useMemo } from "react";
import { Code2, PanelLeftClose, PanelLeftOpen, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ClaudeCodeChat } from "@/components/claude-code/ClaudeCodeChat";
import { WorkspaceFileBrowser } from "@/components/claude-code/WorkspaceFileBrowser";
import { CodePanel } from "@/components/claude-code/CodePanel";

interface DiffData {
  filePath: string;
  before: string;
  after: string;
  hunks: Array<{
    oldStart: number;
    newStart: number;
    lines: Array<{ type: "context" | "add" | "remove"; content: string }>;
  }>;
}

export default function ClaudeCodePage() {
  const [showFileBrowser, setShowFileBrowser] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());

  const sessionId = useMemo(
    () => `cc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );

  const handleFileChange = useCallback(
    (change: { filePath: string; language: string; operation: string }) => {
      setModifiedFiles((prev) => new Set(prev).add(change.filePath));
    },
    [],
  );

  const handleDiffView = useCallback((diff: DiffData) => {
    setDiffData(diff);
  }, []);

  const handleSelectFile = useCallback((filePath: string) => {
    setSelectedFile(filePath);
    setDiffData(null);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b px-4 py-2 shrink-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="flex items-center gap-2">
          <Code2 className="h-5 w-5 text-primary" />
          <h1 className="text-sm font-semibold">Claude Code</h1>
        </div>

        <button
          onClick={() => setShowFileBrowser(!showFileBrowser)}
          className="ml-auto p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
          title={showFileBrowser ? "Hide file browser" : "Show file browser"}
        >
          {showFileBrowser ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </button>
      </header>

      {/* Main 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: File Browser */}
        {showFileBrowser && (
          <div className="w-[240px] shrink-0 border-r overflow-hidden">
            <WorkspaceFileBrowser
              onSelectFile={handleSelectFile}
              modifiedFiles={modifiedFiles}
            />
          </div>
        )}

        {/* Center: Chat */}
        <div
          className={cn(
            "flex-1 min-w-0 border-r",
            !showFileBrowser && "border-l-0",
          )}
        >
          <ClaudeCodeChat
            sessionId={sessionId}
            onFileChange={handleFileChange}
            onDiffView={handleDiffView}
            onSelectFile={handleSelectFile}
          />
        </div>

        {/* Right: Code/Diff Panel */}
        <div className="w-[400px] shrink-0 hidden lg:block">
          <CodePanel selectedFile={selectedFile} diffData={diffData} />
        </div>
      </div>
    </div>
  );
}
