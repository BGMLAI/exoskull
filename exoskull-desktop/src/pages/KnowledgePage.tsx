import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BookOpen, Upload, Search, Loader2, FileText } from "lucide-react";
import CloudUploader from "../components/uploader/CloudUploader";

interface SearchResult {
  id: string;
  title: string;
  content: string;
  score: number;
}

export default function KnowledgePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await invoke<SearchResult[]>("search_knowledge", {
        query,
      });
      setResults(data || []);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground">
          Upload files and search your knowledge
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Upload section */}
        <CloudUploader />

        {/* Search */}
        <div>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your knowledge..."
                className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Search"
              )}
            </button>
          </form>

          {results.length > 0 && (
            <div className="mt-4 space-y-3">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div>
                      <h3 className="font-medium">{result.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-3">
                        {result.content}
                      </p>
                      <span className="mt-1 text-xs text-muted-foreground">
                        Relevance: {Math.round(result.score * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
