/**
 * Cloudflare R2 Storage Client
 * S3-compatible object storage for Bronze layer
 *
 * @see https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Environment variables (set in .env.local and Vercel)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "exoskull-bronze";

/**
 * S3-compatible client for Cloudflare R2
 */
export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export type DataType =
  | "conversations"
  | "messages"
  | "device_data"
  | "voice_calls"
  | "sms_logs"
  | "transactions"
  | "emails";

export interface BronzeWriteParams {
  tenantId: string;
  dataType: DataType;
  data: Buffer | Uint8Array;
  date?: Date;
  metadata?: Record<string, string>;
}

export interface BronzeWriteResult {
  success: boolean;
  key: string;
  bytesWritten: number;
  error?: string;
}

/**
 * Generate Bronze layer path following architecture spec
 * Path: {tenant_id}/bronze/{data_type}/year={YYYY}/month={MM}/day={DD}/{timestamp}.parquet
 */
export function generateBronzePath(params: {
  tenantId: string;
  dataType: DataType;
  date?: Date;
}): string {
  const date = params.date || new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const timestamp = date.toISOString().replace(/[:.]/g, "-");

  return `${params.tenantId}/bronze/${params.dataType}/year=${year}/month=${month}/day=${day}/${timestamp}.parquet`;
}

/**
 * Write Parquet data to Bronze layer
 */
export async function writeToBronze(
  params: BronzeWriteParams,
): Promise<BronzeWriteResult> {
  const key = generateBronzePath({
    tenantId: params.tenantId,
    dataType: params.dataType,
    date: params.date,
  });

  const buffer =
    params.data instanceof Buffer ? params.data : Buffer.from(params.data);

  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: "application/vnd.apache.parquet",
        Metadata: {
          "tenant-id": params.tenantId,
          "data-type": params.dataType,
          "created-at": new Date().toISOString(),
          "records-count": params.metadata?.recordsCount || "0",
          ...params.metadata,
        },
      }),
    );

    return {
      success: true,
      key,
      bytesWritten: buffer.byteLength,
    };
  } catch (error) {
    console.error("[R2] Failed to write to Bronze:", error);
    return {
      success: false,
      key,
      bytesWritten: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Read Parquet data from Bronze layer
 */
export async function readFromBronze(
  key: string,
): Promise<{ success: boolean; data?: Buffer; error?: string }> {
  try {
    const response = await r2Client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      }),
    );

    if (!response.Body) {
      return { success: false, error: "Empty response body" };
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return {
      success: true,
      data: Buffer.concat(chunks),
    };
  } catch (error) {
    console.error("[R2] Failed to read from Bronze:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * List files in Bronze layer for a tenant/data_type
 */
export async function listBronzeFiles(params: {
  tenantId: string;
  dataType: DataType;
  year?: number;
  month?: number;
  day?: number;
  maxKeys?: number;
}): Promise<{ success: boolean; keys?: string[]; error?: string }> {
  let prefix = `${params.tenantId}/bronze/${params.dataType}/`;

  if (params.year) {
    prefix += `year=${params.year}/`;
    if (params.month) {
      prefix += `month=${String(params.month).padStart(2, "0")}/`;
      if (params.day) {
        prefix += `day=${String(params.day).padStart(2, "0")}/`;
      }
    }
  }

  try {
    const response = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: params.maxKeys || 1000,
      }),
    );

    const keys =
      response.Contents?.map((obj) => obj.Key!).filter(Boolean) || [];

    return { success: true, keys };
  } catch (error) {
    console.error("[R2] Failed to list Bronze files:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if R2 is configured and accessible
 */
export async function checkR2Connection(): Promise<{
  connected: boolean;
  error?: string;
}> {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return {
      connected: false,
      error:
        "R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env.local",
    };
  }

  try {
    // Try to list objects (even if bucket is empty)
    await r2Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        MaxKeys: 1,
      }),
    );

    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Failed to connect to R2",
    };
  }
}

/**
 * Get bucket statistics
 */
export async function getBronzeStats(tenantId?: string): Promise<{
  totalFiles: number;
  totalBytes: number;
  byDataType: Record<DataType, { files: number; bytes: number }>;
}> {
  const stats = {
    totalFiles: 0,
    totalBytes: 0,
    byDataType: {} as Record<DataType, { files: number; bytes: number }>,
  };

  const dataTypes: DataType[] = [
    "conversations",
    "messages",
    "device_data",
    "voice_calls",
    "sms_logs",
    "transactions",
    "emails",
  ];

  for (const dataType of dataTypes) {
    stats.byDataType[dataType] = { files: 0, bytes: 0 };
  }

  try {
    let continuationToken: string | undefined;

    do {
      const response = await r2Client.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET_NAME,
          Prefix: tenantId ? `${tenantId}/bronze/` : undefined,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        }),
      );

      for (const obj of response.Contents || []) {
        if (!obj.Key || !obj.Size) continue;

        stats.totalFiles++;
        stats.totalBytes += obj.Size;

        // Extract data type from path
        const match = obj.Key.match(/bronze\/([^/]+)\//);
        if (match) {
          const dataType = match[1] as DataType;
          if (stats.byDataType[dataType]) {
            stats.byDataType[dataType].files++;
            stats.byDataType[dataType].bytes += obj.Size;
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return stats;
  } catch (error) {
    console.error("[R2] Failed to get stats:", error);
    return stats;
  }
}

// ============================================================================
// MULTIPART UPLOAD — for large files up to 10GB
// ============================================================================

/** Minimum part size for S3 multipart: 5MB */
const MIN_PART_SIZE = 5 * 1024 * 1024;
/** Default part size: 100MB (good for large files) */
const DEFAULT_PART_SIZE = 100 * 1024 * 1024;
/** Maximum file size: 10GB */
export const MAX_MULTIPART_SIZE = 10 * 1024 * 1024 * 1024;

export interface MultipartUploadInit {
  tenantId: string;
  key: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface MultipartUploadSession {
  uploadId: string;
  key: string;
  partSize: number;
  totalParts: number;
}

/**
 * Initiate a multipart upload on R2.
 * Returns the uploadId and key for subsequent part uploads.
 */
export async function initiateMultipartUpload(
  params: MultipartUploadInit,
): Promise<{
  success: boolean;
  session?: MultipartUploadSession;
  error?: string;
}> {
  try {
    const command = new CreateMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME,
      Key: params.key,
      ContentType: params.contentType || "application/octet-stream",
      Metadata: {
        "tenant-id": params.tenantId,
        "created-at": new Date().toISOString(),
        ...params.metadata,
      },
    });

    const response = await r2Client.send(command);

    if (!response.UploadId) {
      return { success: false, error: "No UploadId returned from R2" };
    }

    return {
      success: true,
      session: {
        uploadId: response.UploadId,
        key: params.key,
        partSize: DEFAULT_PART_SIZE,
        totalParts: 0, // Will be set by caller
      },
    };
  } catch (error) {
    console.error("[R2:multipart:init:failed]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to initiate multipart upload",
    };
  }
}

/**
 * Generate a presigned URL for uploading a single part.
 * Client uploads directly to R2 using this URL.
 */
export async function getPresignedPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn: number = 3600,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const command = new UploadPartCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    const url = await getSignedUrl(r2Client, command, { expiresIn });

    return { success: true, url };
  } catch (error) {
    console.error("[R2:multipart:presign:failed]", { key, partNumber, error });
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate presigned URL",
    };
  }
}

/**
 * Generate presigned URLs for all parts of a multipart upload.
 * Returns array of { partNumber, url } for client-side parallel upload.
 */
export async function getPresignedPartUrls(
  key: string,
  uploadId: string,
  totalParts: number,
  expiresIn: number = 3600,
): Promise<{
  success: boolean;
  parts?: Array<{ partNumber: number; url: string }>;
  error?: string;
}> {
  try {
    const parts: Array<{ partNumber: number; url: string }> = [];

    for (let i = 1; i <= totalParts; i++) {
      const result = await getPresignedPartUrl(key, uploadId, i, expiresIn);
      if (!result.success || !result.url) {
        return {
          success: false,
          error: `Failed to generate URL for part ${i}: ${result.error}`,
        };
      }
      parts.push({ partNumber: i, url: result.url });
    }

    return { success: true, parts };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate presigned URLs",
    };
  }
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

/**
 * Complete a multipart upload after all parts have been uploaded.
 */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: CompletedPart[],
): Promise<{ success: boolean; error?: string }> {
  try {
    await r2Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({
              PartNumber: p.partNumber,
              ETag: p.etag,
            })),
        },
      }),
    );

    return { success: true };
  } catch (error) {
    console.error("[R2:multipart:complete:failed]", { key, uploadId, error });
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to complete multipart upload",
    };
  }
}

/**
 * Abort a multipart upload (cleanup on failure).
 */
export async function abortMultipartUpload(
  key: string,
  uploadId: string,
): Promise<{ success: boolean }> {
  try {
    await r2Client.send(
      new AbortMultipartUploadCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
      }),
    );
    return { success: true };
  } catch (error) {
    console.error("[R2:multipart:abort:failed]", { key, uploadId, error });
    return { success: false };
  }
}

/**
 * Upload a buffer directly using multipart (server-side, for large processing).
 * Splits buffer into parts and uploads sequentially.
 */
export async function uploadLargeBuffer(
  key: string,
  data: Buffer,
  tenantId: string,
  contentType?: string,
): Promise<{ success: boolean; error?: string }> {
  const partSize = Math.max(MIN_PART_SIZE, Math.ceil(data.length / 10000));
  const totalParts = Math.ceil(data.length / partSize);

  const initResult = await initiateMultipartUpload({
    tenantId,
    key,
    contentType,
    metadata: {
      "file-size": String(data.length),
      "total-parts": String(totalParts),
    },
  });

  if (!initResult.success || !initResult.session) {
    return { success: false, error: initResult.error };
  }

  const { uploadId } = initResult.session;
  const completedParts: CompletedPart[] = [];

  try {
    for (let i = 0; i < totalParts; i++) {
      const start = i * partSize;
      const end = Math.min(start + partSize, data.length);
      const partData = data.subarray(start, end);

      const response = await r2Client.send(
        new UploadPartCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
          UploadId: uploadId,
          PartNumber: i + 1,
          Body: partData,
        }),
      );

      if (!response.ETag) {
        throw new Error(`Part ${i + 1} upload returned no ETag`);
      }

      completedParts.push({ partNumber: i + 1, etag: response.ETag });
    }

    return await completeMultipartUpload(key, uploadId, completedParts);
  } catch (error) {
    // Cleanup on failure
    await abortMultipartUpload(key, uploadId);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Multipart upload failed",
    };
  }
}
