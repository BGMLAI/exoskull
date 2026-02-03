-- Add assistant_name column to exo_tenants
-- Allows users to customize their IORS assistant name (default: 'IORS')
ALTER TABLE exo_tenants ADD COLUMN IF NOT EXISTS assistant_name TEXT DEFAULT 'IORS';
