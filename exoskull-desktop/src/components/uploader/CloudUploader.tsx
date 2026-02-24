import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Upload, Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function CloudUploader() {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    setUploading(true);
    setStatus("idle");
    let successCount = 0;

    for (const file of Array.from(files)) {
      try {
        // For Tauri, we'd use the dialog plugin to get file paths
        // In the webview, we can read the file and pass the path
        await invoke("upload_file", { filePath: (file as any).path || file.name });
        successCount++;
      } catch (err) {
        console.error("Upload failed:", err);
        setStatus("error");
        setStatusMsg(String(err));
      }
    }

    if (successCount > 0) {
      setStatus("success");
      setStatusMsg(`${successCount} file(s) uploaded`);
    }
    setUploading(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/50"
    >
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Uploading...</p>
        </div>
      ) : status === "success" ? (
        <div className="flex flex-col items-center gap-2">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
          <p className="text-sm text-green-500">{statusMsg}</p>
        </div>
      ) : status === "error" ? (
        <div className="flex flex-col items-center gap-2">
          <XCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{statusMsg}</p>
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
        </div>
      )}
    </div>
  );
}
