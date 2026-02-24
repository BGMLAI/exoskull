import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTauriEvent } from "./useTauriEvent";

interface UploadEvent {
  id: number;
  file_name: string;
}

interface UploadQueueItem {
  id: number;
  file_path: string;
  file_name: string;
  file_size: number | null;
  status: string;
  retries: number;
  error: string | null;
  created_at: string;
  uploaded_at: string | null;
}

export function useCloudSync() {
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [loading, setLoading] = useState(false);

  const uploadQueued = useTauriEvent<UploadEvent | null>("upload-queued", null);
  const uploadComplete = useTauriEvent<UploadEvent | null>("upload-complete", null);
  const uploadFailed = useTauriEvent<UploadEvent | null>("upload-failed", null);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const data = await invoke<UploadQueueItem[]>("get_upload_queue");
      setQueue(data || []);
    } catch (err) {
      console.error("Failed to load upload queue:", err);
    } finally {
      setLoading(false);
    }
  };

  // Refresh queue on events
  useEffect(() => {
    loadQueue();
  }, [uploadQueued, uploadComplete, uploadFailed]);

  const pendingCount = queue.filter((q) => q.status === "pending").length;
  const uploadedCount = queue.filter((q) => q.status === "uploaded").length;
  const failedCount = queue.filter((q) => q.status === "failed").length;

  return {
    queue,
    loading,
    loadQueue,
    pendingCount,
    uploadedCount,
    failedCount,
  };
}
