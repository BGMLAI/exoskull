-- Fix user-documents bucket: expand allowed MIME types and size limit
-- Original bucket only allowed pdf/txt/md/jpeg/png/docx (6 types) with 10MB limit
-- This caused 400 errors on signed upload URLs for other file types

UPDATE storage.buckets
SET
  file_size_limit = 524288000,  -- 500MB
  allowed_mime_types = ARRAY[
    -- Documents
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/json',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  -- docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        -- xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', -- pptx
    'application/msword',           -- doc
    'application/vnd.ms-excel',     -- xls
    'application/vnd.ms-powerpoint', -- ppt
    -- Images
    'image/jpeg',
    'image/png',
    'image/webp',
    -- Video
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
WHERE id = 'user-documents';
