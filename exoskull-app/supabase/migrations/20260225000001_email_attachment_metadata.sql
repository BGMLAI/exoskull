-- Add attachment metadata and retry_count to analyzed emails
ALTER TABLE exo_analyzed_emails
  ADD COLUMN IF NOT EXISTS attachment_metadata JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

COMMENT ON COLUMN exo_analyzed_emails.attachment_metadata IS 'Array of {attachmentId, filename, mimeType, size} for Gmail API download';
COMMENT ON COLUMN exo_analyzed_emails.retry_count IS 'Number of failed analysis attempts (max 3 before permanent failure)';
