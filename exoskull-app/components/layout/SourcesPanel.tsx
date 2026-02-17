"use client";

/**
 * SourcesPanel — NotebookLM-style sources list.
 * Shows knowledge base documents, supports upload and URL import.
 */

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Link2,
  Upload,
  Search,
  Globe,
  File,
  Image,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KnowledgeSource {
  id: string;
  original_name: string;
  filename: string;
  file_type: string | null;
  file_size: number | null;
  summary: string | null;
  category: string | null;
  status: string;
  tags: string[] | null;
  created_at: string;
  storage_path: string;
}

interface SourcesPanelProps {
  tenantId: string;
}

export function SourcesPanel({ tenantId }: SourcesPanelProps) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  // Fetch knowledge sources
  useEffect(() => {
    async function fetchSources() {
      try {
        const res = await fetch("/api/knowledge");
        if (res.ok) {
          const data = await res.json();
          setSources(data.documents || []);
        }
      } catch (err) {
        console.error("[SourcesPanel] Failed to fetch:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSources();
  }, []);

  // Handle file upload
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        try {
          const res = await fetch("/api/knowledge/upload", {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            const data = await res.json();
            setSources((prev) => [
              {
                id: data.id || crypto.randomUUID(),
                original_name: file.name,
                filename: data.filename || file.name,
                file_type: file.type || null,
                file_size: file.size || null,
                summary: null,
                category: null,
                status: "uploaded",
                tags: null,
                created_at: new Date().toISOString(),
                storage_path: data.storage_path || "",
              },
              ...prev,
            ]);
          }
        } catch (err) {
          console.error("[SourcesPanel] Upload failed:", err);
        }
      }
      e.target.value = "";
    },
    [],
  );

  // Handle URL import
  const handleUrlImport = useCallback(async () => {
    if (!urlInput.trim()) return;
    try {
      const res = await fetch("/api/knowledge/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setSources((prev) => [
          {
            id: data.id || crypto.randomUUID(),
            original_name: data.title || urlInput.trim(),
            filename: data.filename || urlInput.trim(),
            file_type: "url",
            file_size: null,
            summary: null,
            category: null,
            status: "uploaded",
            tags: null,
            created_at: new Date().toISOString(),
            storage_path: data.storage_path || "",
          },
          ...prev,
        ]);
        setUrlInput("");
        setShowUrlInput(false);
      }
    } catch (err) {
      console.error("[SourcesPanel] URL import failed:", err);
    }
  }, [urlInput]);

  // Filter sources
  const filtered = searchQuery
    ? sources.filter(
        (s) =>
          s.original_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.category?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : sources;

  // Icon for source type
  function getSourceIcon(fileType: string | null) {
    const t = fileType || "";
    if (t.includes("pdf")) return FileText;
    if (t.includes("image") || t.includes("png") || t.includes("jpg"))
      return Image;
    if (t === "url" || t.includes("http")) return Globe;
    return File;
  }

  // Status badge color
  function getStatusColor(status: string) {
    switch (status) {
      case "ready":
        return "text-green-400 bg-green-900/20";
      case "processing":
        return "text-yellow-400 bg-yellow-900/20";
      case "failed":
        return "text-red-400 bg-red-900/20";
      default:
        return "text-slate-400 bg-slate-900/20";
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-sm font-mono font-semibold text-cyan-400 uppercase tracking-wider mb-3">
          Zrodla
        </h2>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj..."
            className="w-full pl-8 pr-3 py-2 bg-black/30 border border-cyan-900/20 rounded-lg text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-700/40"
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-cyan-900/20 hover:bg-cyan-900/30 border border-cyan-800/20 rounded-lg text-[11px] text-cyan-400 cursor-pointer transition-colors">
            <Upload className="w-3 h-3" />
            Wgraj
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          <button
            onClick={() => setShowUrlInput(!showUrlInput)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 border rounded-lg text-[11px] transition-colors",
              showUrlInput
                ? "bg-cyan-800/30 border-cyan-700/40 text-cyan-300"
                : "bg-cyan-900/20 hover:bg-cyan-900/30 border-cyan-800/20 text-cyan-400",
            )}
          >
            <Link2 className="w-3 h-3" />
            URL
          </button>
        </div>

        {/* URL input */}
        {showUrlInput && (
          <div className="mt-2 flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://..."
              className="flex-1 px-3 py-1.5 bg-black/30 border border-cyan-900/20 rounded-lg text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-700/40"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUrlImport();
              }}
            />
            <button
              onClick={handleUrlImport}
              className="px-3 py-1.5 bg-cyan-700/30 hover:bg-cyan-700/40 border border-cyan-700/40 rounded-lg text-[11px] text-cyan-300 transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Sources list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 chat-scroll">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-slate-500">
            Ladowanie zrodel...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-500">
              {searchQuery ? "Brak wynikow" : "Brak zrodel"}
            </p>
            <p className="text-[10px] text-slate-600 mt-1">
              Wgraj pliki lub dodaj URL
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((source) => {
              const Icon = getSourceIcon(source.file_type);
              return (
                <button
                  key={source.id}
                  className="w-full text-left px-3 py-2.5 rounded-lg bg-black/20 hover:bg-cyan-900/10 border border-transparent hover:border-cyan-900/20 transition-all group"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded bg-cyan-900/20 text-cyan-500 mt-0.5">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white truncate">
                        {source.original_name}
                      </div>
                      {source.summary && (
                        <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">
                          {source.summary}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-slate-600">
                          {new Date(source.created_at).toLocaleDateString("pl")}
                        </span>
                        {source.category && (
                          <span className="text-[9px] text-cyan-600">
                            {source.category}
                          </span>
                        )}
                        <span
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded-full",
                            getStatusColor(source.status),
                          )}
                        >
                          {source.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
