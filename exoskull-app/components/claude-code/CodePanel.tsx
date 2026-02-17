"use client";

import { useState, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Loader2, FileCode, GitCompare } from "lucide-react";
import { cn } from "@/lib/utils";
import { DiffViewer } from "./DiffViewer";

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

interface CodePanelProps {
  selectedFile: string | null;
  diffData: DiffData | null;
  className?: string;
}

function getLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    css: "css",
    html: "html",
    json: "json",
    md: "markdown",
    sql: "sql",
    sh: "bash",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    rb: "ruby",
    php: "php",
  };
  return langMap[ext] || "text";
}

export function CodePanel({
  selectedFile,
  diffData,
  className,
}: CodePanelProps) {
  const [activeTab, setActiveTab] = useState<"code" | "diff">(
    diffData ? "diff" : "code",
  );
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Switch to diff tab when new diff arrives
  useEffect(() => {
    if (diffData) setActiveTab("diff");
  }, [diffData]);

  // Load file content when selected
  useEffect(() => {
    if (!selectedFile) return;
    setActiveTab("code");
    setLoading(true);

    fetch(`/api/claude-code/workspace?file=${encodeURIComponent(selectedFile)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.content) {
          // Strip line numbers (cat -n format: "     1\tline content")
          const raw = data.content
            .split("\n")
            .map((l: string) => l.replace(/^\s*\d+\t/, ""))
            .join("\n");
          setFileContent(raw);
        } else {
          setFileContent("// Failed to load file");
        }
      })
      .catch(() => setFileContent("// Failed to load file"))
      .finally(() => setLoading(false));
  }, [selectedFile]);

  const showFile = selectedFile || diffData?.filePath;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Tab bar */}
      <div className="flex items-center border-b">
        <button
          onClick={() => setActiveTab("code")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
            activeTab === "code"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <FileCode className="h-3.5 w-3.5" />
          Code
        </button>
        <button
          onClick={() => setActiveTab("diff")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
            activeTab === "diff"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
            !diffData && "opacity-50 cursor-not-allowed",
          )}
          disabled={!diffData}
        >
          <GitCompare className="h-3.5 w-3.5" />
          Diff
        </button>

        {showFile && (
          <span className="ml-auto pr-3 text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
            {showFile}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {!showFile && !loading && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a file or wait for agent edits
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {activeTab === "code" && fileContent && !loading && (
          <SyntaxHighlighter
            language={getLanguage(selectedFile || "")}
            style={oneDark}
            showLineNumbers
            customStyle={{
              margin: 0,
              borderRadius: 0,
              fontSize: "12px",
              lineHeight: "1.5",
              minHeight: "100%",
            }}
          >
            {fileContent}
          </SyntaxHighlighter>
        )}

        {activeTab === "diff" && diffData && (
          <DiffViewer
            filePath={diffData.filePath}
            hunks={diffData.hunks}
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}
