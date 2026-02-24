import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface RecallEntry {
  id: number;
  timestamp: string;
  app_name: string | null;
  window_title: string | null;
  ocr_text: string | null;
  image_path: string;
  thumbnail_path: string | null;
  synced: boolean;
}

interface RecallSearchResult extends RecallEntry {
  rank: number;
  snippet: string | null;
}

export function useRecall() {
  const [timeline, setTimeline] = useState<RecallEntry[]>([]);
  const [searchResults, setSearchResults] = useState<RecallSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTimeline = useCallback(
    async (date?: string, appFilter?: string, limit = 100, offset = 0) => {
      setLoading(true);
      try {
        const data = await invoke<RecallEntry[]>("get_recall_timeline", {
          date,
          appFilter,
          limit,
          offset,
        });
        setTimeline(data || []);
      } catch (err) {
        console.error("Failed to load timeline:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const search = useCallback(async (query: string, limit = 50) => {
    setLoading(true);
    try {
      const data = await invoke<RecallSearchResult[]>("search_recall", {
        query,
        limit,
      });
      setSearchResults(data || []);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const startCapture = useCallback(async () => {
    await invoke("start_recall");
  }, []);

  const stopCapture = useCallback(async () => {
    await invoke("stop_recall");
  }, []);

  return {
    timeline,
    searchResults,
    loading,
    loadTimeline,
    search,
    startCapture,
    stopCapture,
  };
}
