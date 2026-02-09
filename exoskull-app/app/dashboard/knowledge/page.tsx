"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileUp,
  File,
  FileText,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

type Document = {
  id: string;
  original_name: string;
  file_type: string;
  file_size: number;
  category: string;
  status: "uploading" | "uploaded" | "processing" | "ready" | "failed";
  created_at: string;
};

const STATUS_CONFIG = {
  uploading: {
    label: "Wgrywanie...",
    color: "bg-yellow-100 text-yellow-800",
    icon: Loader2,
  },
  uploaded: {
    label: "Wgrane",
    color: "bg-blue-100 text-blue-800",
    icon: Clock,
  },
  processing: {
    label: "Przetwarzanie...",
    color: "bg-blue-100 text-blue-800",
    icon: Loader2,
  },
  ready: {
    label: "Gotowe",
    color: "bg-green-100 text-green-800",
    icon: CheckCircle2,
  },
  failed: { label: "Blad", color: "bg-red-100 text-red-800", icon: XCircle },
};

const ALLOWED_EXTENSIONS = [
  "pdf",
  "txt",
  "md",
  "csv",
  "docx",
  "doc",
  "xlsx",
  "xls",
  "pptx",
  "ppt",
  "json",
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function KnowledgePage() {
  const supabase = createClient();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("exo_user_documents")
        .select(
          "id, original_name, file_type, file_size, category, status, created_at",
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("[Knowledge] Load failed:", error);
      toast.error("Nie udalo sie zaladowac dokumentow");
    } finally {
      setLoading(false);
    }
  }

  async function uploadFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error(`Nieobslugiwany format: .${ext}`);
      return;
    }

    setUploading(true);
    try {
      // 1. Get presigned upload URL
      const urlRes = await fetch("/api/knowledge/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileSize: file.size,
        }),
      });

      if (!urlRes.ok) {
        const err = await urlRes.json();
        throw new Error(err.error || "Nie udalo sie uzyskac URL uploadu");
      }

      const { signedUrl, token, documentId, mimeType } = await urlRes.json();

      // 2. Upload directly to Supabase Storage
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": mimeType || file.type,
          "x-upsert": "true",
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      // 3. Confirm upload (triggers processing pipeline)
      const confirmRes = await fetch("/api/knowledge/confirm-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });

      if (!confirmRes.ok) {
        const err = await confirmRes.json();
        throw new Error(err.error || "Potwierdzenie uploadu nie powiodlo sie");
      }

      toast.success(`Wgrano: ${file.name}. Przetwarzanie w toku...`);
      await loadDocuments();
    } catch (error) {
      console.error("[Knowledge] Upload failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Upload nie powiodl sie",
      );
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(docId: string, name: string) {
    if (!confirm(`Usunac "${name}"?`)) return;

    try {
      const { error } = await supabase
        .from("exo_user_documents")
        .delete()
        .eq("id", docId);

      if (error) throw error;
      toast.success("Dokument usuniety");
      await loadDocuments();
    } catch (error) {
      console.error("[Knowledge] Delete failed:", error);
      toast.error("Nie udalo sie usunac dokumentu");
    }
  }

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files?.length) {
        Array.from(e.dataTransfer.files).forEach(uploadFile);
      }
    },
    [uploadFile],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      Array.from(e.target.files).forEach(uploadFile);
    }
    e.target.value = "";
  };

  const stats = {
    total: documents.length,
    ready: documents.filter((d) => d.status === "ready").length,
    processing: documents.filter(
      (d) =>
        d.status === "processing" ||
        d.status === "uploading" ||
        d.status === "uploaded",
    ).length,
    failed: documents.filter((d) => d.status === "failed").length,
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Baza Wiedzy</h1>
        <p className="text-muted-foreground">
          Wgraj dokumenty — IORS bedzie z nich korzystac w rozmowach
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Dokumenty</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Gotowe</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.ready}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Przetwarzanie</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats.processing}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Bledy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {stats.failed}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Zone */}
      <Card>
        <CardContent className="p-6">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Wgrywanie i przetwarzanie...
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <FileUp className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    Przeciagnij pliki tutaj lub{" "}
                    <label className="text-primary cursor-pointer hover:underline">
                      wybierz z dysku
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(
                          ",",
                        )}
                        onChange={handleFileSelect}
                      />
                    </label>
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    PDF, DOCX, TXT, MD, CSV, JSON, XLSX — max 500MB
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Documents List */}
      <div className="space-y-3">
        {loading ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Ladowanie dokumentow...
            </CardContent>
          </Card>
        ) : documents.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Brak dokumentow. Wgraj pierwszy plik powyzej.
            </CardContent>
          </Card>
        ) : (
          documents.map((doc) => {
            const statusCfg = STATUS_CONFIG[doc.status];
            const StatusIcon = statusCfg.icon;

            return (
              <Card key={doc.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* File icon */}
                    <div className="flex-shrink-0">
                      {doc.file_type === "pdf" ? (
                        <FileText className="h-8 w-8 text-red-500" />
                      ) : (
                        <File className="h-8 w-8 text-blue-500" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {doc.original_name}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(doc.file_size)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(doc.created_at).toLocaleDateString("pl-PL")}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    <Badge className={statusCfg.color}>
                      <StatusIcon
                        className={`h-3 w-3 mr-1 ${
                          doc.status === "processing" ||
                          doc.status === "uploading"
                            ? "animate-spin"
                            : ""
                        }`}
                      />
                      {statusCfg.label}
                    </Badge>

                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteDocument(doc.id, doc.original_name)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
