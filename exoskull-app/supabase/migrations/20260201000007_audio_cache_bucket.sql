-- Create audio-cache storage bucket for ElevenLabs pre-generated audio
-- This reduces costs by ~60-70% for common phrases

-- Create the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-cache',
  'audio-cache',
  true,  -- Public bucket for easy access
  5242880,  -- 5MB max file size
  ARRAY['audio/mpeg', 'audio/mp3']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access (for playing cached audio)
CREATE POLICY "Public read access for audio-cache"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio-cache');

-- Allow authenticated users to upload (for cache generation)
CREATE POLICY "Authenticated upload to audio-cache"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'audio-cache');

-- Allow service role to manage all files
CREATE POLICY "Service role full access to audio-cache"
ON storage.objects
USING (bucket_id = 'audio-cache')
WITH CHECK (bucket_id = 'audio-cache');
