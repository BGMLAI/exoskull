-- Add Signal and iMessage channel columns to exo_tenants
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS signal_phone TEXT;
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS imessage_address TEXT;
