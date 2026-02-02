# Plan: Silver Layer Implementation

## Cel
Transformacja danych Bronze (R2 Parquet) → Silver (Supabase Postgres)
- Deduplikacja
- Walidacja schema
- Normalizacja timestamps (UTC)
- Czyszczenie danych

## Pliki do utworzenia

### 1. Supabase Migration
**Plik:** `supabase/migrations/20260202000001_silver_schema.sql`

```sql
-- Create silver schema
CREATE SCHEMA IF NOT EXISTS silver;

-- Silver conversations (cleaned)
CREATE TABLE silver.conversations_clean (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  channel TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  summary TEXT,
  context JSONB DEFAULT '{}',
  insights JSONB DEFAULT '[]',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  bronze_source TEXT -- R2 path reference
);

-- Silver messages (cleaned)
CREATE TABLE silver.messages_clean (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  audio_url TEXT,
  transcription_confidence REAL,
  context JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Silver sync tracking
CREATE TABLE silver.sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  data_type TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ NOT NULL,
  records_synced INTEGER DEFAULT 0,
  bronze_files_processed TEXT[] DEFAULT '{}',
  UNIQUE(tenant_id, data_type)
);

-- Indexes
CREATE INDEX idx_silver_conv_tenant ON silver.conversations_clean(tenant_id);
CREATE INDEX idx_silver_conv_started ON silver.conversations_clean(started_at);
CREATE INDEX idx_silver_msg_conv ON silver.messages_clean(conversation_id);
CREATE INDEX idx_silver_msg_tenant ON silver.messages_clean(tenant_id);

-- RLS
ALTER TABLE silver.conversations_clean ENABLE ROW LEVEL SECURITY;
ALTER TABLE silver.messages_clean ENABLE ROW LEVEL SECURITY;
ALTER TABLE silver.sync_log ENABLE ROW LEVEL SECURITY;
```

### 2. Parquet Reader
**Plik:** `lib/storage/parquet-reader.ts`

```typescript
// Use hyparquet for reading Parquet from R2
import { parquetRead } from 'hyparquet'
import { readFromBronze } from './r2-client'

export async function readParquetFromR2(key: string): Promise<Record<string, unknown>[]>
```

### 3. Silver ETL Logic
**Plik:** `lib/datalake/silver-etl.ts`

```typescript
// Main transformation logic:
// 1. List unprocessed Bronze files (since last sync)
// 2. Read Parquet from R2
// 3. Transform:
//    - Parse timestamps → UTC
//    - Validate required fields
//    - Parse JSON strings → JSONB
//    - Deduplicate by id
// 4. Upsert to silver.* tables
// 5. Update sync log

export async function etlConversationsToSilver(tenantId: string): Promise<ETLResult>
export async function etlMessagesToSilver(tenantId: string): Promise<ETLResult>
export async function runSilverETL(): Promise<ETLSummary>
```

### 4. Cron Endpoint
**Plik:** `app/api/cron/silver-etl/route.ts`

```typescript
// Hourly cron at minute 15 (offset from bronze at minute 5)
// Verifies auth, runs full Silver ETL, returns summary
```

### 5. Vercel Cron Config
**Plik:** `vercel.json` (update)

```json
{
  "crons": [
    { "path": "/api/cron/master-scheduler", "schedule": "0 6 * * *" },
    { "path": "/api/cron/bronze-etl", "schedule": "5 * * * *" },
    { "path": "/api/cron/silver-etl", "schedule": "15 * * * *" }
  ]
}
```

## Transformacje

| Pole | Bronze (raw) | Silver (clean) |
|------|--------------|----------------|
| timestamps | STRING (ISO) | TIMESTAMPTZ (UTC) |
| context | STRING (JSON) | JSONB |
| insights | STRING (JSON array) | JSONB |
| nulls | Może być null | Domyślne wartości |
| duplicates | Możliwe | Deduplikowane (UPSERT) |

## Flow

```
R2 Bronze Parquet
      ↓
[Read via hyparquet]
      ↓
[Parse & Validate]
      ↓
[Transform]
      ↓
[Upsert to Supabase]
      ↓
Silver Tables
```

## Dependencies

- `hyparquet` - już zainstalowane (używane do zapisu, działa też do odczytu)
- `@supabase/supabase-js` - już zainstalowane
- `@aws-sdk/client-s3` - już zainstalowane

## Testy

1. Sprawdzić czy Bronze ma dane (GET /api/cron/bronze-etl)
2. Uruchomić Silver ETL (POST /api/cron/silver-etl)
3. Sprawdzić silver.* tabele w Supabase
4. Zweryfikować dedup i transformacje

## Szacowany zakres

- 5 plików do utworzenia/modyfikacji
- ~300 linii kodu
- 1 migracja Supabase
