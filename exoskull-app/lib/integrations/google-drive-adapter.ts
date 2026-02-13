/**
 * Google Drive Direct Adapter
 *
 * Bypasses Composio for Drive operations - direct REST API.
 * Handles: file listing, reading, content extraction (docx, xlsx, pdf, images).
 * Uses mammoth for DOCX, and native APIs for other formats.
 */

import { getServiceSupabase } from "@/lib/supabase/service";

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";

// ============================================================================
// TOKEN MANAGEMENT (shared pattern with Google Fit)
// ============================================================================

async function getValidToken(tenantId: string): Promise<string | null> {
  const supabase = getServiceSupabase();
  const { data: tokens } = await supabase
    .from("exo_integration_tokens")
    .select("access_token, refresh_token, expiry_date")
    .eq("tenant_id", tenantId)
    .eq("provider", "google_drive")
    .maybeSingle();

  if (!tokens) return null;

  // Token still valid (5 min buffer)
  if (
    (tokens as { expiry_date: number }).expiry_date >
    Date.now() + 5 * 60_000
  ) {
    return (tokens as { access_token: string }).access_token;
  }

  // Refresh token
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: (tokens as { refresh_token: string }).refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();

    await supabase
      .from("exo_integration_tokens")
      .update({
        access_token: data.access_token,
        expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("provider", "google_drive");

    return data.access_token;
  } catch {
    return null;
  }
}

async function driveFetch(
  tenantId: string,
  path: string,
  options?: RequestInit & { rawResponse?: boolean },
): Promise<{
  ok: boolean;
  data?: unknown;
  buffer?: ArrayBuffer;
  error?: string;
}> {
  const token = await getValidToken(tenantId);
  if (!token)
    return {
      ok: false,
      error: "No valid Google Drive token. Please reconnect.",
    };

  try {
    const res = await fetch(`${DRIVE_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options?.headers || {}),
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Drive API error ${res.status}: ${errText}` };
    }

    if (options?.rawResponse) {
      const buffer = await res.arrayBuffer();
      return { ok: true, buffer };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: `Drive request failed: ${err instanceof Error ? err.message : err}`,
    };
  }
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  parents?: string[];
}

/**
 * List files in Drive (with optional query)
 */
export async function listFiles(
  tenantId: string,
  query?: string,
  limit: number = 20,
  folderId?: string,
): Promise<{ ok: boolean; files?: DriveFile[]; error?: string }> {
  const qParts: string[] = ["trashed = false"];
  if (folderId) qParts.push(`'${folderId}' in parents`);
  if (query)
    qParts.push(`(name contains '${query}' or fullText contains '${query}')`);

  const q = encodeURIComponent(qParts.join(" and "));
  const fields = encodeURIComponent(
    "files(id,name,mimeType,size,modifiedTime,parents)",
  );

  const result = await driveFetch(
    tenantId,
    `/files?q=${q}&fields=${fields}&pageSize=${limit}&orderBy=modifiedTime desc`,
  );

  if (!result.ok) return { ok: false, error: result.error };

  const files = (result.data as { files?: DriveFile[] })?.files || [];
  return { ok: true, files };
}

/**
 * Read file content - handles different MIME types
 */
export async function readFileContent(
  tenantId: string,
  fileId: string,
  mimeType?: string,
): Promise<{
  ok: boolean;
  content?: string;
  images?: string[];
  error?: string;
}> {
  // Get file metadata if mimeType not provided
  if (!mimeType) {
    const meta = await driveFetch(
      tenantId,
      `/files/${fileId}?fields=mimeType,name`,
    );
    if (!meta.ok) return { ok: false, error: meta.error };
    mimeType = (meta.data as { mimeType: string }).mimeType;
  }

  // Google Docs/Sheets/Slides → export as text
  if (mimeType?.startsWith("application/vnd.google-apps.")) {
    return await exportGoogleDoc(tenantId, fileId, mimeType);
  }

  // DOCX → extract with mammoth
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return await extractDocx(tenantId, fileId);
  }

  // Plain text, JSON, CSV, Markdown
  if (
    mimeType?.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/csv"
  ) {
    const result = await driveFetch(tenantId, `/files/${fileId}?alt=media`, {
      rawResponse: true,
    });
    if (!result.ok) return { ok: false, error: result.error };
    const content = new TextDecoder().decode(result.buffer);
    return { ok: true, content: content.slice(0, 50000) }; // Limit to 50k chars
  }

  // PDF → download and extract text (basic)
  if (mimeType === "application/pdf") {
    return await extractPdf(tenantId, fileId);
  }

  // Images → download URL for analysis
  if (mimeType?.startsWith("image/")) {
    return {
      ok: true,
      content: `[Image file - use image analysis tool to inspect]`,
      images: [`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`],
    };
  }

  return { ok: false, error: `Unsupported file type: ${mimeType}` };
}

async function exportGoogleDoc(
  tenantId: string,
  fileId: string,
  mimeType: string,
): Promise<{ ok: boolean; content?: string; error?: string }> {
  let exportMime = "text/plain";
  if (mimeType.includes("spreadsheet")) exportMime = "text/csv";
  if (mimeType.includes("presentation")) exportMime = "text/plain";

  const result = await driveFetch(
    tenantId,
    `/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
    { rawResponse: true },
  );

  if (!result.ok) return { ok: false, error: result.error };
  const content = new TextDecoder().decode(result.buffer);
  return { ok: true, content: content.slice(0, 50000) };
}

async function extractDocx(
  tenantId: string,
  fileId: string,
): Promise<{
  ok: boolean;
  content?: string;
  images?: string[];
  error?: string;
}> {
  const result = await driveFetch(tenantId, `/files/${fileId}?alt=media`, {
    rawResponse: true,
  });
  if (!result.ok) return { ok: false, error: result.error };

  try {
    // Dynamic import mammoth (it's already in dependencies)
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(result.buffer!);
    const extracted = await mammoth.convertToHtml({ buffer });

    // Strip HTML tags for plain text
    const text = extracted.value
      .replace(/<[^>]+>/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Extract image references
    const imgMatches = extracted.value.match(/src="([^"]+)"/g) || [];
    const images = imgMatches.map((m) =>
      m.replace('src="', "").replace('"', ""),
    );

    return {
      ok: true,
      content: text.slice(0, 50000),
      images: images.length > 0 ? images : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: `DOCX extraction failed: ${err instanceof Error ? err.message : err}`,
    };
  }
}

async function extractPdf(
  tenantId: string,
  fileId: string,
): Promise<{ ok: boolean; content?: string; error?: string }> {
  // Download PDF binary
  const result = await driveFetch(tenantId, `/files/${fileId}?alt=media`, {
    rawResponse: true,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // Basic PDF text extraction - for production, use pdf-parse or similar
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(
      result.buffer,
    );
    // Extract readable strings from PDF (basic heuristic)
    const readable = text
      .split(/[^\x20-\x7E\xA0-\xFF]+/)
      .filter((s) => s.length > 3)
      .join(" ")
      .slice(0, 50000);

    if (readable.length < 100) {
      return {
        ok: true,
        content:
          "[PDF with limited extractable text - may need OCR for full content]",
      };
    }

    return { ok: true, content: readable };
  } catch {
    return {
      ok: true,
      content:
        "[PDF file - text extraction limited. Use document processing for full content.]",
    };
  }
}

/**
 * Search files across Drive
 */
export async function searchFiles(
  tenantId: string,
  query: string,
): Promise<{ ok: boolean; results?: string; error?: string }> {
  const res = await listFiles(tenantId, query, 10);
  if (!res.ok) return { ok: false, error: res.error };

  if (!res.files?.length) {
    return {
      ok: true,
      results: `Nie znaleziono plikow pasujacych do "${query}"`,
    };
  }

  const lines = res.files.map((f) => {
    const date = new Date(f.modifiedTime).toLocaleDateString("pl-PL");
    const size = f.size ? `${Math.round(parseInt(f.size) / 1024)}KB` : "";
    return `- ${f.name} [${f.mimeType}] ${size} (${date}) id:${f.id}`;
  });

  return {
    ok: true,
    results: `Znaleziono ${res.files.length} plikow:\n${lines.join("\n")}\n\nUzyj read_drive_file z file_id zeby przeczytac tresc.`,
  };
}
