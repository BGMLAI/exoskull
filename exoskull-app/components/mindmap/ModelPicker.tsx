"use client";

/**
 * ModelPicker — Search and attach 3D models from Sketchfab.
 * Dialog with search, preview, and confirm workflow.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Search,
  X,
  Box,
  Download,
  ExternalLink,
  Upload,
  Link2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SketchfabModel } from "@/lib/services/sketchfab";

interface ModelPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (modelUrl: string, thumbnailUrl?: string) => void;
}

type TabId = "sketchfab" | "upload" | "url";

export function ModelPicker({ isOpen, onClose, onSelect }: ModelPickerProps) {
  const [activeTab, setActiveTab] = useState<TabId>("sketchfab");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SketchfabModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<SketchfabModel | null>(
    null,
  );
  const [urlInput, setUrlInput] = useState("");
  const searchTimeout = useRef<NodeJS.Timeout>();

  // Debounced search
  useEffect(() => {
    if (!query.trim() || activeTab !== "sketchfab") return;

    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/models/search?q=${encodeURIComponent(query)}&maxVertices=50000`,
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.models || []);
        }
      } catch (err) {
        console.error("[ModelPicker] Search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(searchTimeout.current);
  }, [query, activeTab]);

  // Handle model selection
  const handleConfirm = useCallback(() => {
    if (selectedModel) {
      onSelect(
        selectedModel.viewerUrl, // Use viewer URL; actual download URL via separate API
        selectedModel.thumbnailUrl,
      );
    }
    onClose();
  }, [selectedModel, onSelect, onClose]);

  // Handle URL submit
  const handleUrlSubmit = useCallback(() => {
    if (urlInput.trim()) {
      onSelect(urlInput.trim());
      onClose();
    }
  }, [urlInput, onSelect, onClose]);

  // Handle file upload
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/knowledge/upload", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            onSelect(data.url);
            onClose();
          }
        }
      } catch (err) {
        console.error("[ModelPicker] Upload failed:", err);
      }
      e.target.value = "";
    },
    [onSelect, onClose],
  );

  if (!isOpen) return null;

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "sketchfab", label: "Sketchfab", icon: Box },
    { id: "upload", label: "Wgraj", icon: Upload },
    { id: "url", label: "URL", icon: Link2 },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[80vh] bg-card border border-border rounded-xl shadow-2xl shadow-black/20 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-mono font-semibold text-cyan-400 uppercase tracking-wider">
            Wybierz model 3D
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 py-3 bg-muted/50">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] transition-colors",
                  activeTab === tab.id
                    ? "bg-cyan-900/30 text-cyan-300"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-3 h-3" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Sketchfab tab */}
          {activeTab === "sketchfab" && (
            <>
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Szukaj modeli 3D..."
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
                  autoFocus
                />
              </div>

              {/* Results grid */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                </div>
              ) : results.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {results.map((model) => (
                    <button
                      key={model.uid}
                      onClick={() => setSelectedModel(model)}
                      className={cn(
                        "rounded-lg border overflow-hidden text-left transition-all",
                        selectedModel?.uid === model.uid
                          ? "border-cyan-500 ring-1 ring-cyan-500/30"
                          : "border-border hover:border-border/80",
                      )}
                    >
                      <img
                        src={model.thumbnailUrl}
                        alt={model.name}
                        className="w-full h-28 object-cover bg-muted"
                        loading="lazy"
                      />
                      <div className="px-2.5 py-2">
                        <div className="text-[11px] text-foreground font-medium line-clamp-1">
                          {model.name}
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          {(model.vertexCount / 1000).toFixed(1)}k vertices ·{" "}
                          {model.user.displayName}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : query.trim() ? (
                <div className="text-center py-12 text-xs text-muted-foreground">
                  Brak wynikow dla &quot;{query}&quot;
                </div>
              ) : (
                <div className="text-center py-12">
                  <Box className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-xs text-muted-foreground">
                    Wpisz zapytanie aby wyszukac modele 3D
                  </p>
                </div>
              )}
            </>
          )}

          {/* Upload tab */}
          {activeTab === "upload" && (
            <div className="text-center py-12">
              <label className="inline-flex flex-col items-center gap-3 cursor-pointer">
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-cyan-800/30 flex items-center justify-center hover:border-cyan-600/40 transition-colors">
                  <Upload className="w-8 h-8 text-cyan-700" />
                </div>
                <span className="text-xs text-muted-foreground">
                  Wgraj plik glTF, GLB lub FBX
                </span>
                <input
                  type="file"
                  accept=".gltf,.glb,.fbx,.obj"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* URL tab */}
          {activeTab === "url" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">
                  URL do modelu 3D (glTF/GLB)
                </label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/model.glb"
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
                />
              </div>
              <button
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim()}
                className="w-full px-4 py-2.5 bg-cyan-700/30 hover:bg-cyan-700/40 border border-cyan-700/40 rounded-lg text-xs text-cyan-300 transition-colors disabled:opacity-50"
              >
                Dodaj model
              </button>
            </div>
          )}
        </div>

        {/* Footer (with confirm button for Sketchfab) */}
        {activeTab === "sketchfab" && selectedModel && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-muted/50">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Box className="w-3.5 h-3.5 text-cyan-500" />
              <span className="truncate max-w-[200px]">
                {selectedModel.name}
              </span>
            </div>
            <div className="flex gap-2">
              <a
                href={selectedModel.viewerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Podglad
              </a>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Download className="w-3 h-3" />
                Uzyj modelu
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
