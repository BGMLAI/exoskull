/**
 * Cloudflare R2 Storage Client
 * S3-compatible object storage for Bronze layer
 *
 * @see https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
 */

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3'

// Environment variables (set in .env.local and Vercel)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ''
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ''
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ''
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'exoskull-bronze'

/**
 * S3-compatible client for Cloudflare R2
 */
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

export type DataType = 'conversations' | 'messages' | 'device_data' | 'voice_calls' | 'sms_logs' | 'transactions'

export interface BronzeWriteParams {
  tenantId: string
  dataType: DataType
  data: Buffer | Uint8Array
  date?: Date
  metadata?: Record<string, string>
}

export interface BronzeWriteResult {
  success: boolean
  key: string
  bytesWritten: number
  error?: string
}

/**
 * Generate Bronze layer path following architecture spec
 * Path: {tenant_id}/bronze/{data_type}/year={YYYY}/month={MM}/day={DD}/{timestamp}.parquet
 */
export function generateBronzePath(params: { tenantId: string; dataType: DataType; date?: Date }): string {
  const date = params.date || new Date()
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const timestamp = date.toISOString().replace(/[:.]/g, '-')

  return `${params.tenantId}/bronze/${params.dataType}/year=${year}/month=${month}/day=${day}/${timestamp}.parquet`
}

/**
 * Write Parquet data to Bronze layer
 */
export async function writeToBronze(params: BronzeWriteParams): Promise<BronzeWriteResult> {
  const key = generateBronzePath({
    tenantId: params.tenantId,
    dataType: params.dataType,
    date: params.date,
  })

  const buffer = params.data instanceof Buffer ? params.data : Buffer.from(params.data)

  try {
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'application/vnd.apache.parquet',
      Metadata: {
        'tenant-id': params.tenantId,
        'data-type': params.dataType,
        'created-at': new Date().toISOString(),
        'records-count': params.metadata?.recordsCount || '0',
        ...params.metadata,
      },
    }))

    return {
      success: true,
      key,
      bytesWritten: buffer.byteLength,
    }
  } catch (error) {
    console.error('[R2] Failed to write to Bronze:', error)
    return {
      success: false,
      key,
      bytesWritten: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Read Parquet data from Bronze layer
 */
export async function readFromBronze(key: string): Promise<{ success: boolean; data?: Buffer; error?: string }> {
  try {
    const response = await r2Client.send(new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }))

    if (!response.Body) {
      return { success: false, error: 'Empty response body' }
    }

    const chunks: Uint8Array[] = []
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }

    return {
      success: true,
      data: Buffer.concat(chunks),
    }
  } catch (error) {
    console.error('[R2] Failed to read from Bronze:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * List files in Bronze layer for a tenant/data_type
 */
export async function listBronzeFiles(params: {
  tenantId: string
  dataType: DataType
  year?: number
  month?: number
  day?: number
  maxKeys?: number
}): Promise<{ success: boolean; keys?: string[]; error?: string }> {
  let prefix = `${params.tenantId}/bronze/${params.dataType}/`

  if (params.year) {
    prefix += `year=${params.year}/`
    if (params.month) {
      prefix += `month=${String(params.month).padStart(2, '0')}/`
      if (params.day) {
        prefix += `day=${String(params.day).padStart(2, '0')}/`
      }
    }
  }

  try {
    const response = await r2Client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: params.maxKeys || 1000,
    }))

    const keys = response.Contents?.map(obj => obj.Key!).filter(Boolean) || []

    return { success: true, keys }
  } catch (error) {
    console.error('[R2] Failed to list Bronze files:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check if R2 is configured and accessible
 */
export async function checkR2Connection(): Promise<{ connected: boolean; error?: string }> {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return {
      connected: false,
      error: 'R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env.local',
    }
  }

  try {
    // Try to list objects (even if bucket is empty)
    await r2Client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      MaxKeys: 1,
    }))

    return { connected: true }
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Failed to connect to R2',
    }
  }
}

/**
 * Get bucket statistics
 */
export async function getBronzeStats(tenantId?: string): Promise<{
  totalFiles: number
  totalBytes: number
  byDataType: Record<DataType, { files: number; bytes: number }>
}> {
  const stats = {
    totalFiles: 0,
    totalBytes: 0,
    byDataType: {} as Record<DataType, { files: number; bytes: number }>,
  }

  const dataTypes: DataType[] = ['conversations', 'messages', 'device_data', 'voice_calls', 'sms_logs', 'transactions']

  for (const dataType of dataTypes) {
    stats.byDataType[dataType] = { files: 0, bytes: 0 }
  }

  try {
    let continuationToken: string | undefined

    do {
      const response = await r2Client.send(new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: tenantId ? `${tenantId}/bronze/` : undefined,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }))

      for (const obj of response.Contents || []) {
        if (!obj.Key || !obj.Size) continue

        stats.totalFiles++
        stats.totalBytes += obj.Size

        // Extract data type from path
        const match = obj.Key.match(/bronze\/([^/]+)\//)
        if (match) {
          const dataType = match[1] as DataType
          if (stats.byDataType[dataType]) {
            stats.byDataType[dataType].files++
            stats.byDataType[dataType].bytes += obj.Size
          }
        }
      }

      continuationToken = response.NextContinuationToken
    } while (continuationToken)

    return stats
  } catch (error) {
    console.error('[R2] Failed to get stats:', error)
    return stats
  }
}
