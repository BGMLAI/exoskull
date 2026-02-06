-- Add index on exo_tenants.phone for gateway message lookups
-- Without this, every inbound SMS/WhatsApp/Signal message causes a full table scan

CREATE INDEX IF NOT EXISTS idx_exo_tenants_phone
  ON exo_tenants(phone)
  WHERE phone IS NOT NULL;
