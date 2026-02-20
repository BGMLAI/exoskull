/**
 * Knowledge API Helper Functions
 * CRUD operations for Loops, Campaigns, Quests, Ops, Notes
 */

import {
  CreateLoopInput,
  CreateCampaignInput,
  CreateQuestInput,
  CreateOpInput,
  CreateNoteInput,
  Loop,
  Campaign,
  Quest,
  Op,
  Note,
  OpStatus,
} from "@/lib/types/knowledge";

// ============================================================================
// LOOPS
// ============================================================================

export async function createLoop(
  tenantId: string,
  input: CreateLoopInput,
): Promise<Loop> {
  const res = await fetch("/api/knowledge/loops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, ...input }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad tworzenia loop");
  }

  const data = await res.json();
  return data.loop;
}

export async function updateLoop(
  tenantId: string,
  loopId: string,
  input: Partial<CreateLoopInput>,
): Promise<Loop> {
  const res = await fetch("/api/knowledge/loops", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, loopId, ...input }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad aktualizacji loop");
  }

  const data = await res.json();
  return data.loop;
}

export async function deleteLoop(
  tenantId: string,
  loopId: string,
): Promise<void> {
  const res = await fetch(
    `/api/knowledge/loops?tenantId=${tenantId}&loopId=${loopId}`,
    {
      method: "DELETE",
    },
  );

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad usuwania loop");
  }
}

// ============================================================================
// CAMPAIGNS
// ============================================================================

export async function createCampaign(
  tenantId: string,
  input: CreateCampaignInput,
): Promise<Campaign> {
  const res = await fetch("/api/knowledge/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, ...input }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad tworzenia campaign");
  }

  const data = await res.json();
  return data.campaign;
}

export async function updateCampaign(
  tenantId: string,
  campaignId: string,
  input: Partial<CreateCampaignInput> & { status?: string },
): Promise<Campaign> {
  const res = await fetch("/api/knowledge/campaigns", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, campaignId, ...input }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad aktualizacji campaign");
  }

  const data = await res.json();
  return data.campaign;
}

export async function deleteCampaign(
  tenantId: string,
  campaignId: string,
): Promise<void> {
  const res = await fetch(
    `/api/knowledge/campaigns?tenantId=${tenantId}&campaignId=${campaignId}`,
    {
      method: "DELETE",
    },
  );

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad usuwania campaign");
  }
}

// ============================================================================
// QUESTS
// ============================================================================

export async function createQuest(
  tenantId: string,
  input: CreateQuestInput,
): Promise<Quest> {
  const res = await fetch("/api/knowledge/quests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, ...input }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad tworzenia quest");
  }

  const data = await res.json();
  return data.quest;
}

export async function updateQuest(
  tenantId: string,
  questId: string,
  input: Partial<CreateQuestInput> & { status?: string },
): Promise<Quest> {
  const res = await fetch("/api/knowledge/quests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, questId, ...input }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad aktualizacji quest");
  }

  const data = await res.json();
  return data.quest;
}

export async function deleteQuest(
  tenantId: string,
  questId: string,
): Promise<void> {
  const res = await fetch(
    `/api/knowledge/quests?tenantId=${tenantId}&questId=${questId}`,
    {
      method: "DELETE",
    },
  );

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad usuwania quest");
  }
}

// ============================================================================
// OPS
// ============================================================================

export async function createOp(
  tenantId: string,
  input: CreateOpInput,
): Promise<Op> {
  const res = await fetch("/api/knowledge/ops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, ...input }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad tworzenia op");
  }

  const data = await res.json();
  return data.op;
}

export async function updateOp(
  tenantId: string,
  opId: string,
  input: Partial<CreateOpInput> & { status?: OpStatus },
): Promise<Op> {
  const res = await fetch("/api/knowledge/ops", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, opId, ...input }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad aktualizacji op");
  }

  const data = await res.json();
  return data.op;
}

export async function toggleOpStatus(
  tenantId: string,
  opId: string,
  currentStatus: OpStatus,
): Promise<Op> {
  const newStatus: OpStatus =
    currentStatus === "completed" ? "pending" : "completed";
  return updateOp(tenantId, opId, { status: newStatus });
}

export async function deleteOp(tenantId: string, opId: string): Promise<void> {
  const res = await fetch(
    `/api/knowledge/ops?tenantId=${tenantId}&opId=${opId}`,
    {
      method: "DELETE",
    },
  );

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad usuwania op");
  }
}

// ============================================================================
// NOTES
// ============================================================================

export async function createNote(
  tenantId: string,
  input: CreateNoteInput,
): Promise<Note> {
  const res = await fetch("/api/knowledge/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, ...input }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad tworzenia note");
  }

  const data = await res.json();
  return data.note;
}

export async function updateNote(
  tenantId: string,
  noteId: string,
  input: Partial<CreateNoteInput>,
): Promise<Note> {
  const res = await fetch("/api/knowledge/notes", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, noteId, ...input }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad aktualizacji note");
  }

  const data = await res.json();
  return data.note;
}

export async function deleteNote(
  tenantId: string,
  noteId: string,
): Promise<void> {
  const res = await fetch("/api/knowledge/notes", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, noteId }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad usuwania note");
  }
}

// ============================================================================
// DOCUMENTS (File Uploads)
// ============================================================================

export interface UploadDocumentResult {
  id: string;
  filename: string;
  status: string;
  category: string;
}

/** Threshold above which we use signed URL upload (bypasses Vercel 4.5MB body limit) */
const SIGNED_URL_THRESHOLD = 4 * 1024 * 1024; // 4MB

export async function uploadDocument(
  tenantId: string,
  file: File,
  category?: string,
  onProgress?: (pct: number) => void,
): Promise<UploadDocumentResult> {
  if (file.size > SIGNED_URL_THRESHOLD) {
    return uploadViaSignedUrl(tenantId, file, category, onProgress);
  }
  return uploadDirect(tenantId, file, category, onProgress);
}

/** Small files: direct FormData through Vercel serverless function */
async function uploadDirect(
  tenantId: string,
  file: File,
  category?: string,
  onProgress?: (pct: number) => void,
): Promise<UploadDocumentResult> {
  onProgress?.(10);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("tenant_id", tenantId);
  if (category) formData.append("category", category);

  const res = await fetch("/api/knowledge/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad uploadu pliku");
  }

  onProgress?.(100);
  const data = await res.json();
  return data.document;
}

/** Large files: signed URL upload directly to Supabase Storage (bypasses Vercel) */
async function uploadViaSignedUrl(
  tenantId: string,
  file: File,
  category?: string,
  onProgress?: (pct: number) => void,
): Promise<UploadDocumentResult> {
  onProgress?.(2);

  // Step 1: Get signed upload URL
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const urlRes = await fetch("/api/knowledge/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      fileSize: file.size,
      category: category || "other",
    }),
  });

  if (!urlRes.ok) {
    const err = await urlRes.json();
    if (err.useMultipart) {
      throw new Error(
        `Plik za duzy (max 500MB dla tego typu uploadu). Uzyj mniejszego pliku.`,
      );
    }
    throw new Error(err.error || "Nie udalo sie uzyskac URL uploadu");
  }

  const { signedUrl, token, documentId, mimeType } = await urlRes.json();

  onProgress?.(5);

  // Step 2: Upload file directly to Supabase Storage via XHR (real progress)
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        // Map upload progress to 5-90% range
        const pct = 5 + Math.round((e.loaded / e.total) * 85);
        onProgress?.(pct);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Blad sieci podczas uploadu"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload anulowany"));
    });

    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader(
      "Content-Type",
      mimeType || file.type || "application/octet-stream",
    );
    xhr.send(file);
  });

  onProgress?.(92);

  // Step 3: Confirm upload — triggers document processing
  const confirmRes = await fetch("/api/knowledge/confirm-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId }),
  });

  if (!confirmRes.ok) {
    const err = await confirmRes.json();
    throw new Error(err.error || "Nie udalo sie potwierdzic uploadu");
  }

  onProgress?.(100);
  const data = await confirmRes.json();
  return data.document;
}

export async function deleteDocument(
  tenantId: string,
  documentId: string,
): Promise<void> {
  const res = await fetch("/api/knowledge", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, documentId }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Blad usuwania dokumentu");
  }
}
