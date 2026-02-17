/**
 * File uploader - POST /api/agent/upload flow
 *
 * 1. get-url → signedUrl
 * 2. PUT file to signedUrl
 * 3. confirm → triggers processDocument
 */

import fs from "node:fs";
import path from "node:path";
import { getValidToken, getApiUrl } from "./auth.js";
import { upsertFile, markSynced, markFailed, hashExists } from "./state.js";
import { hashFile } from "../utils/file-hash.js";
import { getExtension, getMimeType } from "../utils/mime-types.js";
import { retry } from "../utils/retry.js";
import { logger } from "./logger.js";

interface GetUrlResponse {
  presignedUrl: string;
  r2Key: string;
  documentId: string;
  mimeType: string;
}

interface ConfirmResponse {
  success: boolean;
  document: {
    id: string;
    filename: string;
    status: string;
    category: string;
  };
}

async function apiCall<T>(
  action: string,
  body: Record<string, any>,
): Promise<T> {
  const token = await getValidToken();
  const apiUrl = getApiUrl();

  const res = await fetch(`${apiUrl}/api/agent/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...body }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(`API ${action} failed (${res.status}): ${errBody.error || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export interface UploadResult {
  filePath: string;
  success: boolean;
  documentId?: string;
  skipped?: boolean;
  error?: string;
}

export async function uploadFile(
  filePath: string,
  watchedFolder: string,
  category: string = "other",
): Promise<UploadResult> {
  const filename = path.basename(filePath);
  const tag = "Uploader";

  try {
    // Hash the file
    const fileHash = await hashFile(filePath);
    const fileStat = fs.statSync(filePath);
    const fileSize = fileStat.size;

    // Check dedup: same hash already synced?
    const existingDocId = hashExists(fileHash);
    if (existingDocId) {
      logger.info(tag, `Skipped (duplicate hash): ${filename}`);
      upsertFile(filePath, {
        file_hash: fileHash,
        file_size: fileSize,
        document_id: existingDocId,
        status: "skipped",
        watched_folder: watchedFolder,
      });
      return { filePath, success: true, documentId: existingDocId, skipped: true };
    }

    // Track as uploading
    upsertFile(filePath, {
      file_hash: fileHash,
      file_size: fileSize,
      status: "uploading",
      watched_folder: watchedFolder,
    });

    // Step 1: Get signed URL
    logger.info(tag, `Uploading: ${filename} (${(fileSize / 1024).toFixed(1)}KB)`);

    const urlData = await retry(
      () => apiCall<GetUrlResponse>("get-url", { filename, fileSize, category }),
      { attempts: 3, label: `get-url:${filename}` },
    );

    // Step 2: Upload file to R2 presigned URL
    const fileBuffer = fs.readFileSync(filePath);
    const contentType = urlData.mimeType || getMimeType(filePath);

    await retry(
      async () => {
        const uploadRes = await fetch(urlData.presignedUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: fileBuffer,
        });

        if (!uploadRes.ok) {
          throw new Error(`R2 upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
        }
      },
      { attempts: 3, label: `r2-put:${filename}` },
    );

    // Step 3: Confirm upload
    const confirmData = await retry(
      () => apiCall<ConfirmResponse>("confirm", { documentId: urlData.documentId }),
      { attempts: 3, label: `confirm:${filename}` },
    );

    // Mark as synced
    markSynced(filePath, urlData.documentId);
    logger.info(tag, `Synced: ${filename} → ${urlData.documentId}`);

    return { filePath, success: true, documentId: urlData.documentId };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(tag, `Failed: ${filename}`, { error: errMsg });
    markFailed(filePath, errMsg);
    return { filePath, success: false, error: errMsg };
  }
}

export async function uploadFiles(
  files: { path: string; watchedFolder: string; category: string }[],
  concurrency: number = 3,
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  const queue = [...files];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      const result = await uploadFile(item.path, item.watchedFolder, item.category);
      results.push(result);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, files.length) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
}
