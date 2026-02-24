import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Loader2, FileText, File, Image, FileSpreadsheet } from "lucide-react";
import CloudUploader from "../components/uploader/CloudUploader";

interface KnowledgeDocument {
  id: string;
  original_name: string;
  file_type?: string;
  file_size?: number;
  category?: string;
  status?: string;
  summary?: string;
  tags?: string[];
  created_at?: string;
}

interface SearchResult {
  content: string;
  filename?: string;
  category?: string;
  similarity?: number;
}

const fileIcon = (type?: string) => {
  if (!type) return <File className="h-5 w-5 shrink-0 text-muted-foreground" />;
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(type))
    return <Image className="h-5 w-5 shrink-0 text-blue-400" />;
  if (["pdf"].includes(type))
    return <FileText className="h-5 w-5 shrink-0 text-red-400" />;
  if (["csv", "xlsx", "xls"].includes(type))
    return <FileSpreadsheet className="h-5 w-5 shrink-0 text-green-400" />;
  return <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />;
};

const formatSize = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const statusBadge = (status?: string) => {
  switch (status) {
    case "ready":
      return "bg-green-500/10 text-green-500";
    case "processing":
      return "bg-yellow-500/10 text-yellow-500";
    case "failed":
      return "bg-red-500/10 text-red-500";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const loadDocuments = async () => {
    try {
      const data = await invoke<KnowledgeDocument[]>("get_documents");
      setDocuments(data || []);
    } catch (err) {
      console.error("Failed to load documents:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await invoke<SearchResult[]>("search_knowledge", { query });
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
          {loading ? "Loading..." : `${documents.length} documents`}
        </p>
      </div>

      <div className="p-6 space-y-6">
        <CloudUploader />

        {/* Search */}
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
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </button>
        </form>

        {/* Search results */}
        {results.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Search Results ({results.length})</h2>
            {results.map((result, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    {result.filename && <h3 className="font-medium truncate">{result.filename}</h3>}
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{result.content}</p>
                    <div className="mt-1 flex gap-2">
                      {result.similarity != null && (
                        <span className="text-xs text-muted-foreground">
                          Relevance: {Math.round(result.similarity * 100)}%
                        </span>
                      )}
                      {result.category && (
                        <span className="text-xs text-muted-foreground">{result.category}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Documents list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="mb-2 h-12 w-12" />
            <p>No documents yet. Upload files to build your knowledge base.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">All Documents</h2>
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                {fileIcon(doc.file_type)}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{doc.original_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {doc.file_size && (
                      <span className="text-xs text-muted-foreground">{formatSize(doc.file_size)}</span>
                    )}
                    {doc.category && (
                      <span className="text-xs text-muted-foreground">{doc.category}</span>
                    )}
                    {doc.created_at && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                {doc.status && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(doc.status)}`}>
                    {doc.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
