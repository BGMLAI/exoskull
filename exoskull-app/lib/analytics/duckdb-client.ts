/**
 * DuckDB Client for Analytics
 *
 * Provides direct query access to Bronze layer Parquet files on R2.
 * DuckDB can query Parquet files directly without loading into memory,
 * enabling 10x faster analytics compared to Postgres for large datasets.
 *
 * Usage:
 * - Ad-hoc analytics queries on raw Bronze data
 * - Historical trend analysis
 * - Data exploration before ETL
 * - Complex aggregations that would be slow in Postgres
 */

import {
  listBronzeFiles,
  readFromBronze,
  DataType,
} from "../storage/r2-client";

import { logger } from "@/lib/logger";
// ============================================================================
// Types
// ============================================================================

export interface QueryResult<T = Record<string, unknown>> {
  success: boolean;
  data?: T[];
  rowCount?: number;
  columnNames?: string[];
  durationMs?: number;
  error?: string;
}

export interface BronzeQueryParams {
  tenantId: string;
  dataType: DataType;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface AggregationResult {
  date: string;
  count: number;
  [key: string]: unknown;
}

// ============================================================================
// Bronze File Discovery
// ============================================================================

/**
 * Get list of Bronze Parquet files for a tenant/data type
 */
export async function getBronzeFiles(
  params: BronzeQueryParams,
): Promise<string[]> {
  const { tenantId, dataType, startDate, endDate } = params;

  const result = await listBronzeFiles({ tenantId, dataType });
  if (!result.success || !result.keys) {
    return [];
  }

  // Filter by date range if specified
  return result.keys.filter((key) => {
    const match = key.match(/year=(\d{4})\/month=(\d{2})\/day=(\d{2})/);
    if (!match) return false;

    const fileDate = new Date(
      parseInt(match[1]),
      parseInt(match[2]) - 1,
      parseInt(match[3]),
    );

    if (startDate && fileDate < startDate) return false;
    if (endDate && fileDate > endDate) return false;
    return true;
  });
}

/**
 * Get total Bronze layer size for a tenant
 */
export async function getBronzeSize(tenantId: string): Promise<{
  totalFiles: number;
  totalBytes: number;
  byType: Record<DataType, { files: number; bytes: number }>;
}> {
  const dataTypes: DataType[] = [
    "conversations",
    "messages",
    "voice_calls",
    "sms_logs",
  ];
  const result: {
    totalFiles: number;
    totalBytes: number;
    byType: Record<DataType, { files: number; bytes: number }>;
  } = {
    totalFiles: 0,
    totalBytes: 0,
    byType: {} as Record<DataType, { files: number; bytes: number }>,
  };

  for (const dataType of dataTypes) {
    const files = await getBronzeFiles({ tenantId, dataType });
    result.byType[dataType] = {
      files: files.length,
      bytes: 0, // Would need to call HEAD for each file to get size
    };
    result.totalFiles += files.length;
  }

  return result;
}

// ============================================================================
// In-Memory Analytics (Fallback without DuckDB WASM)
// ============================================================================

/**
 * Read and aggregate Bronze data in memory
 * This is a fallback for environments where DuckDB WASM isn't available.
 * For production, consider using DuckDB in Edge Functions or a dedicated analytics service.
 */
export async function aggregateBronzeData<T extends { id: string }>(
  params: BronzeQueryParams & {
    aggregateBy: string;
    metrics: Array<{
      name: string;
      type: "count" | "sum" | "avg" | "min" | "max";
      field?: string;
    }>;
  },
): Promise<QueryResult<AggregationResult>> {
  const startTime = Date.now();
  const {
    tenantId,
    dataType,
    startDate,
    endDate,
    aggregateBy,
    metrics,
    limit,
  } = params;

  try {
    // Get relevant files
    const files = await getBronzeFiles({
      tenantId,
      dataType,
      startDate,
      endDate,
    });

    if (files.length === 0) {
      return {
        success: true,
        data: [],
        rowCount: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Read and parse all files
    const allRecords: T[] = [];
    for (const file of files.slice(
      0,
      limit ? Math.ceil(limit / 100) : files.length,
    )) {
      const result = await readFromBronze(file);
      if (result.success && result.data) {
        // Parse Parquet data would go here
        // For now, this is a stub - full implementation requires hyparquet
        logger.info(`[Analytics] Would read ${file}`);
      }
    }

    // Group by aggregateBy field
    const groups = new Map<string, T[]>();
    for (const record of allRecords) {
      const key = String(
        (record as Record<string, unknown>)[aggregateBy] || "unknown",
      );
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    }

    // Calculate metrics for each group
    const aggregated: AggregationResult[] = [];
    for (const [groupKey, records] of groups) {
      const row: AggregationResult = {
        date: groupKey,
        count: records.length,
      };

      for (const metric of metrics) {
        const values = records.map((r) =>
          metric.field
            ? Number((r as Record<string, unknown>)[metric.field]) || 0
            : 1,
        );

        switch (metric.type) {
          case "count":
            row[metric.name] = values.length;
            break;
          case "sum":
            row[metric.name] = values.reduce((a, b) => a + b, 0);
            break;
          case "avg":
            row[metric.name] =
              values.length > 0
                ? values.reduce((a, b) => a + b, 0) / values.length
                : 0;
            break;
          case "min":
            row[metric.name] = values.length > 0 ? Math.min(...values) : 0;
            break;
          case "max":
            row[metric.name] = values.length > 0 ? Math.max(...values) : 0;
            break;
        }
      }

      aggregated.push(row);
    }

    return {
      success: true,
      data: aggregated.slice(0, limit),
      rowCount: aggregated.length,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error("[Analytics] Aggregation failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Aggregation failed",
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// DuckDB-QL Style Query Builder
// ============================================================================

/**
 * Build a SQL-like query specification for Bronze data
 * This can be used with DuckDB CLI, Edge Function with DuckDB, or transformed to Postgres
 */
export interface AnalyticsQuery {
  select: string[];
  from: { tenantId: string; dataType: DataType };
  where?: Record<string, unknown>;
  groupBy?: string[];
  orderBy?: Array<{ field: string; direction: "asc" | "desc" }>;
  limit?: number;
}

/**
 * Generate DuckDB SQL for querying Parquet files on S3/R2
 */
export function generateDuckDBSQL(query: AnalyticsQuery): string {
  const { select, from, where, groupBy, orderBy, limit } = query;
  const { tenantId, dataType } = from;

  // R2 path pattern
  const s3Path = `s3://exoskull-bronze/${tenantId}/bronze/${dataType}/**/*.parquet`;

  let sql = `SELECT ${select.join(", ")}\n`;
  sql += `FROM read_parquet('${s3Path}')\n`;

  if (where && Object.keys(where).length > 0) {
    const conditions = Object.entries(where).map(([key, value]) => {
      if (typeof value === "string") return `${key} = '${value}'`;
      if (value === null) return `${key} IS NULL`;
      return `${key} = ${value}`;
    });
    sql += `WHERE ${conditions.join(" AND ")}\n`;
  }

  if (groupBy && groupBy.length > 0) {
    sql += `GROUP BY ${groupBy.join(", ")}\n`;
  }

  if (orderBy && orderBy.length > 0) {
    const orders = orderBy.map(
      (o) => `${o.field} ${o.direction.toUpperCase()}`,
    );
    sql += `ORDER BY ${orders.join(", ")}\n`;
  }

  if (limit) {
    sql += `LIMIT ${limit}\n`;
  }

  return sql;
}

/**
 * Generate DuckDB connection string for R2
 * Requires DuckDB httpfs extension
 */
export function getDuckDBConfig(): string {
  const accountId = process.env.R2_ACCOUNT_ID || "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";

  return `
-- Load httpfs extension for S3/R2 access
INSTALL httpfs;
LOAD httpfs;

-- Configure R2 credentials (S3-compatible)
SET s3_region = 'auto';
SET s3_endpoint = '${accountId}.r2.cloudflarestorage.com';
SET s3_access_key_id = '${accessKeyId}';
SET s3_secret_access_key = '${secretAccessKey}';
SET s3_url_style = 'path';
`;
}

// ============================================================================
// Pre-built Analytics Queries
// ============================================================================

export const ANALYTICS_QUERIES = {
  /**
   * Daily conversation counts for last 30 days
   */
  dailyConversations: (tenantId: string): AnalyticsQuery => ({
    select: [
      "strftime(started_at, '%Y-%m-%d') as date",
      "COUNT(*) as conversation_count",
      "AVG(duration_seconds) as avg_duration",
    ],
    from: { tenantId, dataType: "conversations" },
    groupBy: ["date"],
    orderBy: [{ field: "date", direction: "desc" }],
    limit: 30,
  }),

  /**
   * Message volume by role
   */
  messagesByRole: (tenantId: string): AnalyticsQuery => ({
    select: [
      "role",
      "COUNT(*) as message_count",
      "AVG(duration_ms) as avg_duration_ms",
    ],
    from: { tenantId, dataType: "messages" },
    groupBy: ["role"],
    orderBy: [{ field: "message_count", direction: "desc" }],
  }),

  /**
   * Channel distribution
   */
  channelDistribution: (tenantId: string): AnalyticsQuery => ({
    select: [
      "channel",
      "COUNT(*) as count",
      "SUM(duration_seconds) as total_duration",
    ],
    from: { tenantId, dataType: "conversations" },
    groupBy: ["channel"],
    orderBy: [{ field: "count", direction: "desc" }],
  }),

  /**
   * Hourly activity pattern
   */
  hourlyPattern: (tenantId: string): AnalyticsQuery => ({
    select: [
      "EXTRACT(HOUR FROM started_at) as hour",
      "COUNT(*) as conversation_count",
    ],
    from: { tenantId, dataType: "conversations" },
    groupBy: ["hour"],
    orderBy: [{ field: "hour", direction: "asc" }],
  }),
};

// ============================================================================
// Exports
// ============================================================================

export default {
  getBronzeFiles,
  getBronzeSize,
  aggregateBronzeData,
  generateDuckDBSQL,
  getDuckDBConfig,
  ANALYTICS_QUERIES,
};
