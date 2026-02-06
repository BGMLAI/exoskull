"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteDocument } from "@/lib/api/knowledge";
import { toast } from "sonner";
import {
  FileText,
  FileImage,
  FileVideo,
  FileSpreadsheet,
  File,
  Trash2,
  Clock,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface Document {
  id: string;
  filename: string;
  original_name: string;
  file_type: string;
  file_size: number;
  category: string;
  status: string;
  created_at: string;
}

interface DocumentsListProps {
  documents: Document[];
  loading: boolean;
  tenantId: string;
  onRefresh: () => void;
}

function getFileIcon(fileType: string) {
  switch (fileType) {
    case "pdf":
    case "txt":
    case "md":
    case "doc":
    case "docx":
      return FileText;
    case "jpg":
    case "jpeg":
    case "png":
    case "webp":
      return FileImage;
    case "mp4":
    case "webm":
    case "mov":
      return FileVideo;
    case "xls":
    case "xlsx":
    case "csv":
      return FileSpreadsheet;
    default:
      return File;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "uploaded":
      return { label: "Oczekuje", variant: "secondary" as const, icon: Clock };
    case "processing":
      return {
        label: "Przetwarzanie",
        variant: "default" as const,
        icon: Loader2,
      };
    case "ready":
      return {
        label: "Gotowy",
        variant: "outline" as const,
        icon: CheckCircle2,
      };
    default:
      return { label: status, variant: "secondary" as const, icon: Clock };
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function DocumentSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-6 w-20" />
      </div>
    </Card>
  );
}

export function DocumentsList({
  documents,
  loading,
  tenantId,
  onRefresh,
}: DocumentsListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = (doc: Document) => {
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!documentToDelete) return;

    setDeleting(true);
    try {
      await deleteDocument(tenantId, documentToDelete.id);
      onRefresh();
    } catch (err) {
      console.error("[DocumentsList] Delete error:", err);
      toast.error(
        err instanceof Error ? err.message : "Blad usuwania dokumentu",
      );
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <DocumentSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Brak dokumentow</h3>
        <p className="text-sm text-muted-foreground">
          Przeciagnij pliki powyzej lub kliknij aby dodac dokumenty
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {documents.map((doc) => {
          const FileIcon = getFileIcon(doc.file_type);
          const statusInfo = getStatusBadge(doc.status);
          const StatusIcon = statusInfo.icon;

          return (
            <Card key={doc.id} className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                  <FileIcon className="h-5 w-5 text-muted-foreground" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{doc.original_name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span>•</span>
                    <span>{doc.category}</span>
                    <span>•</span>
                    <span>
                      {new Date(doc.created_at).toLocaleDateString("pl-PL")}
                    </span>
                  </div>
                </div>

                <Badge variant={statusInfo.variant} className="gap-1">
                  <StatusIcon
                    className={`h-3 w-3 ${doc.status === "processing" ? "animate-spin" : ""}`}
                  />
                  {statusInfo.label}
                </Badge>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteClick(doc)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunac dokument?</AlertDialogTitle>
            <AlertDialogDescription>
              Czy na pewno chcesz usunac &quot;{documentToDelete?.original_name}
              &quot;? Ta operacja jest nieodwracalna.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Usuwanie..." : "Usun"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
