import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Upload, Loader2, CheckCircle2, XCircle, FolderOpen } from "lucide-react";

interface Props {
  onUploadComplete?: () => void;
}

export default function CloudUploader({ onUploadComplete }: Props) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Handle Tauri drag & drop events
  useEffect(() => {
    const webview = getCurrentWebview();
    const unlisten = webview.onDragDropEvent(async (event) => {
      if (event.payload.type === "drop") {
        const paths = event.payload.paths;
        if (paths.length > 0) {
          await uploadFiles(paths);
        }
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const uploadFiles = async (paths: string[]) => {
    setUploading(true);
    setStatus("idle");
    setProgress({ current: 0, total: paths.length });
    let successCount = 0;

    for (let i = 0; i < paths.length; i++) {
      setProgress({ current: i + 1, total: paths.length });
      try {
        await invoke("upload_file", { filePath: paths[i] });
        successCount++;
      } catch (err) {
        console.error("Upload failed:", paths[i], err);
        setStatus("error");
        setStatusMsg(`Failed: ${String(err)}`);
      }
    }

    if (successCount > 0) {
      setStatus("success");
      setStatusMsg(`${successCount} file(s) uploaded`);
      onUploadComplete?.();
    }
    setUploading(false);
  };

  const handleBrowse = async () => {
    const selected = await open({
      multiple: true,
      title: "Select files to upload",
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    await uploadFiles(paths);
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      className="rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/50"
    >
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Uploading {progress.current}/{progress.total}...
          </p>
        </div>
      ) : status === "success" ? (
        <div className="flex flex-col items-center gap-2">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
          <p className="text-sm text-green-500">{statusMsg}</p>
          <button
            onClick={() => setStatus("idle")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Upload more
          </button>
        </div>
      ) : status === "error" ? (
        <div className="flex flex-col items-center gap-2">
          <XCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{statusMsg}</p>
          <button
            onClick={() => setStatus("idle")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            Drag & drop files here to upload
          </p>
          <p className="text-xs text-muted-foreground">
            Files will be added to your knowledge base
          </p>
          <button
            onClick={handleBrowse}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <FolderOpen className="h-4 w-4" />
            Browse Files
          </button>
        </div>
      )}
    </div>
  );
}
