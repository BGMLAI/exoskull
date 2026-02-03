# Data Pipeline Testing Guide

This document describes how to stress-test each stage of the ExoSkull Bronze -> Silver -> Gold data pipeline.

## Architecture Overview

```
[Supabase Tables] --> [Bronze ETL] --> [R2 Parquet] --> [Silver ETL] --> [Silver Tables] --> [Gold ETL] --> [Materialized Views]
     ^                    hourly            ^              hourly             ^               daily              ^
     |                   01:00 UTC          |            02:00 UTC            |             03:00 UTC            |
  Source data        Raw data archive    Compressed      Cleaned data      Query-ready      Pre-aggregated
```

## Prerequisites

1. Environment variables configured in `.env.local`:
   - R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
   - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   - CRON_SECRET

2. Migrations applied:
   - `20260201000006_bronze_sync_log.sql`
   - `20260202000007_silver_to_public.sql`
   - `20260202000006_gold_schema.sql`
   - `20260202000026_gold_refresh_function.sql`

---

## Testing Bronze ETL

### 1. Check R2 Connection

```bash
curl -X GET "https://exoskull.xyz/api/cron/bronze-etl" \
  -H "Accept: application/json"
```

Expected response:
```json
{
  "status": "ready",
  "r2_connected": true,
  "schedule": "0 1 * * * (daily at 01:00 UTC)"
}
```

If `r2_connected: false`, check R2 credentials.

### 2. Trigger Bronze ETL

```bash
curl -X POST "https://exoskull.xyz/api/cron/bronze-etl" \
  -H "x-cron-secret: exoskull-cron-2026" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "status": "completed",
  "tenants_processed": 1,
  "total_records": 30,
  "total_bytes": 5800,
  "errors": []
}
```

### 3. Test Single Tenant

```bash
curl -X POST "https://exoskull.xyz/api/cron/bronze-etl" \
  -H "x-cron-secret: exoskull-cron-2026" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "YOUR_TENANT_UUID"}'
```

### 4. Verify R2 Files

Use Cloudflare R2 dashboard or AWS CLI (S3-compatible):

```bash
aws s3 ls s3://exoskull-bronze/ \
  --endpoint-url https://ACCOUNT_ID.r2.cloudflarestorage.com \
  --recursive
```

Expected structure:
```
{tenant_id}/bronze/conversations/year=2026/month=02/day=02/{timestamp}.parquet
{tenant_id}/bronze/messages/year=2026/month=02/day=02/{timestamp}.parquet
```

### 5. Performance Benchmarks

| Metric | Target | Actual |
|--------|--------|--------|
| Duration per tenant | <5s | ~1.5s |
| Records/second | >50 | ~200 |
| Parquet compression | >70% | ~80% |

---

## Testing Silver ETL

### 1. Check Status

```bash
curl -X GET "https://exoskull.xyz/api/cron/silver-etl" \
  -H "Accept: application/json"
```

Expected response:
```json
{
  "status": "ready",
  "r2_connected": true,
  "silver_tables": {
    "exo_silver_conversations": 20,
    "exo_silver_messages": 150
  }
}
```

### 2. Trigger Silver ETL

```bash
curl -X POST "https://exoskull.xyz/api/cron/silver-etl" \
  -H "x-cron-secret: exoskull-cron-2026" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "status": "completed",
  "tenants_processed": 1,
  "results": [
    { "data_type": "conversations", "success": true, "records_inserted": 5 },
    { "data_type": "messages", "success": true, "records_inserted": 12 }
  ]
}
```

### 3. Verify Silver Tables

```sql
-- Count records
SELECT 'conversations' as table_name, COUNT(*) FROM exo_silver_conversations
UNION ALL
SELECT 'messages', COUNT(*) FROM exo_silver_messages
UNION ALL
SELECT 'voice_calls', COUNT(*) FROM exo_silver_voice_calls
UNION ALL
SELECT 'sms_logs', COUNT(*) FROM exo_silver_sms_logs;

-- Check sync log
SELECT * FROM exo_silver_sync_log ORDER BY last_sync_at DESC LIMIT 10;
```

### 4. Data Quality Checks

```sql
-- Validate channel values
SELECT channel, COUNT(*) FROM exo_silver_conversations GROUP BY channel;
-- Expected: only 'voice', 'sms', 'web', 'api'

-- Validate role values
SELECT role, COUNT(*) FROM exo_silver_messages GROUP BY role;
-- Expected: only 'user', 'assistant', 'system'

-- Check for null tenant_ids
SELECT COUNT(*) FROM exo_silver_conversations WHERE tenant_id IS NULL;
-- Expected: 0
```

### 5. Performance Benchmarks

| Metric | Target | Actual |
|--------|--------|--------|
| Duration per tenant | <10s | ~3s |
| Deduplication rate | >0% | varies |
| Upsert throughput | >100/s | ~500/s |

---

## Testing Gold ETL

### 1. Check Status

```bash
curl -X GET "https://exoskull.xyz/api/cron/gold-etl" \
  -H "Accept: application/json"
```

Expected response:
```json
{
  "status": "ready",
  "views": {
    "exo_gold_daily_summary": 10,
    "exo_gold_weekly_summary": 4,
    "exo_gold_monthly_summary": 2,
    "exo_gold_messages_daily": 10
  }
}
```

### 2. Trigger Gold ETL (All Views)

```bash
curl -X POST "https://exoskull.xyz/api/cron/gold-etl" \
  -H "x-cron-secret: exoskull-cron-2026" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "status": "completed",
  "results": [
    { "view_name": "exo_gold_daily_summary", "success": true, "rows_count": 10, "duration_ms": 150 },
    { "view_name": "exo_gold_weekly_summary", "success": true, "rows_count": 4, "duration_ms": 120 },
    { "view_name": "exo_gold_monthly_summary", "success": true, "rows_count": 2, "duration_ms": 100 },
    { "view_name": "exo_gold_messages_daily", "success": true, "rows_count": 10, "duration_ms": 140 }
  ],
  "totals": {
    "views_refreshed": 4,
    "views_failed": 0
  }
}
```

### 3. Trigger Single View Refresh

```bash
curl -X POST "https://exoskull.xyz/api/cron/gold-etl" \
  -H "x-cron-secret: exoskull-cron-2026" \
  -H "Content-Type: application/json" \
  -d '{"view_name": "exo_gold_daily_summary"}'
```

### 4. Verify Materialized Views

```sql
-- Daily summary
SELECT * FROM exo_gold_daily_summary ORDER BY date DESC LIMIT 10;

-- Weekly summary
SELECT * FROM exo_gold_weekly_summary ORDER BY week_start DESC LIMIT 5;

-- Check refresh history
SELECT * FROM exo_gold_sync_log ORDER BY refreshed_at DESC LIMIT 20;
```

### 5. Test RPC Function Directly

```sql
-- Single view refresh
SELECT public.refresh_gold_view('exo_gold_daily_summary');

-- All views refresh
SELECT * FROM public.refresh_all_gold_views();
```

### 6. Performance Benchmarks

| Metric | Target | Actual |
|--------|--------|--------|
| Daily view refresh | <500ms | ~150ms |
| Weekly view refresh | <500ms | ~120ms |
| All views refresh | <2s | ~500ms |
| Query from Gold | <100ms | ~20ms |

---

## End-to-End Pipeline Test

### 1. Insert Test Data

```sql
-- Insert test conversation
INSERT INTO exo_conversations (id, tenant_id, channel, started_at, duration_seconds, summary)
VALUES (
  gen_random_uuid(),
  'YOUR_TENANT_UUID',
  'voice',
  NOW(),
  120,
  'Test conversation'
);

-- Insert test messages
INSERT INTO exo_messages (id, conversation_id, tenant_id, role, content, timestamp)
VALUES
  (gen_random_uuid(), 'CONV_UUID', 'TENANT_UUID', 'user', 'Hello', NOW()),
  (gen_random_uuid(), 'CONV_UUID', 'TENANT_UUID', 'assistant', 'Hi!', NOW());
```

### 2. Run Full Pipeline

```bash
# 1. Bronze ETL
curl -X POST "https://exoskull.xyz/api/cron/bronze-etl" \
  -H "x-cron-secret: exoskull-cron-2026"

# Wait 5 seconds

# 2. Silver ETL
curl -X POST "https://exoskull.xyz/api/cron/silver-etl" \
  -H "x-cron-secret: exoskull-cron-2026"

# Wait 5 seconds

# 3. Gold ETL
curl -X POST "https://exoskull.xyz/api/cron/gold-etl" \
  -H "x-cron-secret: exoskull-cron-2026"
```

### 3. Verify Data Propagation

```sql
-- Check Bronze sync log
SELECT * FROM exo_bronze_sync_log WHERE data_type = 'conversations' ORDER BY last_sync_at DESC LIMIT 1;

-- Check Silver tables
SELECT COUNT(*) FROM exo_silver_conversations;

-- Check Gold views
SELECT * FROM exo_gold_daily_summary WHERE date = CURRENT_DATE;
```

---

## Using Analytics Library

### Query Gold Layer (Fast)

```typescript
import { getDailySummary, getWeeklySummary } from '@/lib/analytics'

// Last 30 days
const daily = await getDailySummary(tenantId, 30)
console.log(daily.data, daily.durationMs) // Should be <100ms

// Last 12 weeks
const weekly = await getWeeklySummary(tenantId, 12)
```

### Query Silver Layer (Real-time)

```typescript
import { getRealTimeStats, getRecentConversations } from '@/lib/analytics'

// Today's stats
const stats = await getRealTimeStats(tenantId)

// Recent conversations with message counts
const recent = await getRecentConversations(tenantId, 10)
```

### Generate DuckDB SQL (Ad-hoc Analytics)

```typescript
import { generateDuckDBSQL, ANALYTICS_QUERIES, getDuckDBConfig } from '@/lib/analytics'

// Generate SQL for daily conversations
const sql = generateDuckDBSQL(ANALYTICS_QUERIES.dailyConversations(tenantId))

// Get DuckDB connection config for R2
const config = getDuckDBConfig()
```

---

## Troubleshooting

### Bronze ETL Fails

1. Check R2 credentials: `GET /api/cron/bronze-etl`
2. Check source tables have data: `SELECT COUNT(*) FROM exo_conversations`
3. Check sync log for errors: `SELECT * FROM exo_bronze_sync_log WHERE error IS NOT NULL`

### Silver ETL Fails

1. Check R2 connection (needs to read Bronze)
2. Check Bronze files exist in R2
3. Check Silver tables exist: `\dt exo_silver_*`
4. Check sync log: `SELECT * FROM exo_silver_sync_log WHERE errors != '{}' ORDER BY last_sync_at DESC`

### Gold ETL Fails

1. Check if Silver tables have data
2. Check RPC function exists: `\df refresh_gold_view`
3. Check materialized views have unique indexes
4. Check sync log: `SELECT * FROM exo_gold_sync_log WHERE status = 'error' ORDER BY refreshed_at DESC`

### Data Not Appearing in Gold

1. Gold views source from `exo_silver_*` tables (not raw `exo_*`)
2. Run Silver ETL first, then Gold ETL
3. Check `synced_at` timestamps in Silver tables

---

## Cron Schedule Summary

| Job | Schedule | Path |
|-----|----------|------|
| Bronze ETL | 01:00 UTC daily | `/api/cron/bronze-etl` |
| Silver ETL | 02:00 UTC daily | `/api/cron/silver-etl` |
| Gold ETL | 03:00 UTC daily | `/api/cron/gold-etl` |
| Master Scheduler | 06:00 UTC daily | `/api/cron/master-scheduler` |

All times in UTC. Vercel Cron triggers these automatically.
