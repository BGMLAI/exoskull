import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, Plus, Trash2, Loader2 } from "lucide-react";

interface WatchedFolder {
  id: number;
  path: string;
  enabled: boolean;
  created_at: string;
}

export default function WatchedFolders() {
  const [folders, setFolders] = useState<WatchedFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPath, setNewPath] = useState("");

  const loadFolders = async () => {
    try {
      const data = await invoke<WatchedFolder[]>("get_watched_folders");
      setFolders(data || []);
    } catch (err) {
      console.error("Failed to load watched folders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFolders();
  }, []);

  const addFolder = async () => {
    if (!newPath.trim()) return;
    try {
      await invoke("add_watched_folder", { path: newPath });
      setNewPath("");
      loadFolders();
    } catch (err) {
      console.error("Failed to add folder:", err);
    }
  };

  const removeFolder = async (id: number) => {
    try {
      await invoke("remove_watched_folder", { id });
      loadFolders();
    } catch (err) {
      console.error("Failed to remove folder:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium">Watched Folders</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        New files in these folders will be automatically uploaded
      </p>

      {folders.length > 0 && (
        <div className="mb-4 space-y-2">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{folder.path}</span>
              </div>
              <button
                onClick={() => removeFolder(folder.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          placeholder="/path/to/watch"
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={addFolder}
          className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
