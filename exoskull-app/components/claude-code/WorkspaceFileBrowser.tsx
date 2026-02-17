"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
  loaded?: boolean;
}

interface WorkspaceFileBrowserProps {
  onSelectFile: (filePath: string) => void;
  modifiedFiles?: Set<string>;
  className?: string;
}

/**
 * Parse tree command output into a file node structure.
 */
function parseTree(treeOutput: string): FileNode[] {
  const lines = treeOutput.split("\n").filter((l) => l.trim());
  const nodes: FileNode[] = [];
  const stack: { node: FileNode; depth: number }[] = [];

  for (const line of lines) {
    // Skip tree header and summary lines
    if (line.startsWith(".") && lines.indexOf(line) === 0) continue;
    if (/^\d+ directories/.test(line)) continue;

    // Parse tree formatting (|-- or `-- or |   )
    const match = line.match(/^([|` ]+)(?:--|--)\s+(.+)$/);
    if (!match) continue;

    const indent = match[1];
    const name = match[2].replace(/\/$/, "");
    const depth = Math.floor(indent.length / 4);
    const isDir = line.endsWith("/") || !name.includes(".");

    const node: FileNode = {
      name,
      path: "",
      isDir,
      children: isDir ? [] : undefined,
      loaded: false,
    };

    // Build path from parent stack
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    if (stack.length > 0) {
      const parent = stack[stack.length - 1].node;
      node.path = `${parent.path}/${name}`;
      parent.children?.push(node);
    } else {
      node.path = name;
      nodes.push(node);
    }

    if (isDir) {
      stack.push({ node, depth });
    }
  }

  return nodes;
}

/**
 * Simple fallback parser — split lines into flat list.
 */
function parseFlat(treeOutput: string): FileNode[] {
  return treeOutput
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("."))
    .filter((l) => !/^\d+ directories/.test(l))
    .map((line) => {
      const cleaned = line.replace(/[|`\- ]+/g, "").trim();
      if (!cleaned) return null;
      const isDir = !cleaned.includes(".");
      return {
        name: cleaned,
        path: cleaned,
        isDir,
        children: isDir ? [] : undefined,
        loaded: false,
      };
    })
    .filter(Boolean) as FileNode[];
}

function FileTreeNode({
  node,
  onSelect,
  modifiedFiles,
  depth = 0,
}: {
  node: FileNode;
  onSelect: (path: string) => void;
  modifiedFiles?: Set<string>;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isModified = modifiedFiles?.has(node.path);

  return (
    <div>
      <button
        onClick={() => {
          if (node.isDir) {
            setExpanded(!expanded);
          } else {
            onSelect(node.path);
          }
        }}
        className={cn(
          "flex items-center gap-1 w-full text-left text-xs py-0.5 px-1 rounded hover:bg-muted/80 transition-colors",
          isModified && "text-amber-500",
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {node.isDir ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3" />
        )}

        {node.isDir ? (
          <Folder className="h-3.5 w-3.5 shrink-0 text-blue-500" />
        ) : (
          <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        <span className="truncate">{node.name}</span>

        {isModified && (
          <span className="ml-auto text-[10px] text-amber-500 shrink-0">M</span>
        )}
      </button>

      {expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              onSelect={onSelect}
              modifiedFiles={modifiedFiles}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkspaceFileBrowser({
  onSelectFile,
  modifiedFiles,
  className,
}: WorkspaceFileBrowserProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/claude-code/workspace?depth=4");
      const data = await res.json();

      if (data.tree) {
        let nodes = parseTree(data.tree);
        if (nodes.length === 0) {
          nodes = parseFlat(data.tree);
        }
        setTree(nodes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Files
        </span>
        <button
          onClick={loadTree}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Refresh"
        >
          <RefreshCw
            className={cn(
              "h-3 w-3 text-muted-foreground",
              loading && "animate-spin",
            )}
          />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-1">
        {loading && tree.length === 0 && (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            Loading workspace...
          </div>
        )}

        {error && (
          <div className="px-3 py-2 text-xs text-destructive">{error}</div>
        )}

        {tree.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            onSelect={onSelectFile}
            modifiedFiles={modifiedFiles}
          />
        ))}
      </div>
    </div>
  );
}
