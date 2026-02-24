import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Loader2, Eye } from "lucide-react";

interface RecallSearchResult {
  id: number;
  timestamp: string;
  app_name: string | null;
  window_title: string | null;
  ocr_text: string | null;
  image_path: string;
  thumbnail_path: string | null;
  rank: number;
  snippet: string | null;
}

/** Strip HTML tags from snippet for safe rendering */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

export default function RecallSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RecallSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await invoke<RecallSearchResult[]>("search_recall", {
        query,
        limit: 50,
      });
      setResults(data || []);
      setSearched(true);
    } catch (err) {
      console.error("Recall search failed:", err);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across all captured text..."
            className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </button>
      </form>

      {searched && results.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <Eye className="mx-auto mb-2 h-12 w-12" />
          <p>No results found for "{query}"</p>
        </div>
      )}

      <div className="space-y-3">
        {results.map((result) => (
          <div
            key={result.id}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-start gap-4">
              <div className="aspect-video w-32 shrink-0 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                {new Date(result.timestamp).toLocaleTimeString()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {new Date(result.timestamp).toLocaleDateString()}
                  </span>
                  {result.app_name && (
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">
                      {result.app_name}
                    </span>
                  )}
                </div>
                {result.window_title && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {result.window_title}
                  </p>
                )}
                {result.snippet && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {stripHtml(result.snippet)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
