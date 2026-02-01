-- Bronze Layer Sync Log
-- Tracks last sync time per tenant/data_type for incremental ETL
--
-- This table enables incremental data extraction:
-- - Each tenant/data_type combination has a separate sync cursor
-- - ETL job fetches only records newer than last_sync_at
-- - Prevents re-processing already synced data

-- Create the sync log table
CREATE TABLE IF NOT EXISTS public.exo_bronze_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  data_type TEXT NOT NULL,  -- 'conversations', 'messages', 'voice_calls', etc.
  last_sync_at TIMESTAMPTZ NOT NULL,
  records_synced INTEGER DEFAULT 0,
  bytes_written BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Foreign key to tenants (optional - may fail if tenant doesn't exist)
  -- CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES public.exo_tenants(id) ON DELETE CASCADE,

  -- Unique constraint for upsert
  CONSTRAINT unique_tenant_data_type UNIQUE(tenant_id, data_type)
);

-- Add foreign key only if exo_tenants exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'exo_tenants') THEN
    ALTER TABLE public.exo_bronze_sync_log
      ADD CONSTRAINT fk_bronze_sync_tenant
      FOREIGN KEY (tenant_id)
      REFERENCES public.exo_tenants(id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enable RLS
ALTER TABLE public.exo_bronze_sync_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access (used by ETL job)
-- No user access - this is an internal system table
CREATE POLICY "Service role only for bronze sync log"
  ON public.exo_bronze_sync_log FOR ALL
  USING (false);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_bronze_sync_tenant_type
  ON public.exo_bronze_sync_log(tenant_id, data_type);

CREATE INDEX IF NOT EXISTS idx_bronze_sync_last_sync
  ON public.exo_bronze_sync_log(last_sync_at);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_bronze_sync_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_bronze_sync_updated_at ON public.exo_bronze_sync_log;
CREATE TRIGGER trigger_bronze_sync_updated_at
  BEFORE UPDATE ON public.exo_bronze_sync_log
  FOR EACH ROW
  EXECUTE FUNCTION update_bronze_sync_updated_at();

-- Add comments
COMMENT ON TABLE public.exo_bronze_sync_log IS 'Tracks Bronze layer ETL sync state per tenant/data_type. Used for incremental data extraction.';
COMMENT ON COLUMN public.exo_bronze_sync_log.data_type IS 'Type of data: conversations, messages, voice_calls, sms_logs, transactions, device_data';
COMMENT ON COLUMN public.exo_bronze_sync_log.last_sync_at IS 'Timestamp of last successful sync. ETL fetches records newer than this.';
COMMENT ON COLUMN public.exo_bronze_sync_log.records_synced IS 'Number of records synced in last batch';
COMMENT ON COLUMN public.exo_bronze_sync_log.bytes_written IS 'Bytes written to R2 in last batch';

-- Grant permissions to service role
GRANT ALL ON public.exo_bronze_sync_log TO service_role;
