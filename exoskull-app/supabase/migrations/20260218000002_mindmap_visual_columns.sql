-- Mind Map Visual Columns
-- Adds visual_type, model_url, thumbnail_url, source_urls, tags
-- to all hierarchy tables for 3D mind map node rendering.

-- exo_values
ALTER TABLE exo_values ADD COLUMN IF NOT EXISTS visual_type TEXT DEFAULT 'orb';
ALTER TABLE exo_values ADD COLUMN IF NOT EXISTS model_url TEXT;
ALTER TABLE exo_values ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE exo_values ADD COLUMN IF NOT EXISTS source_urls TEXT[];
ALTER TABLE exo_values ADD COLUMN IF NOT EXISTS tags TEXT[];

-- user_loops
ALTER TABLE user_loops ADD COLUMN IF NOT EXISTS visual_type TEXT DEFAULT 'orb';
ALTER TABLE user_loops ADD COLUMN IF NOT EXISTS model_url TEXT;
ALTER TABLE user_loops ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE user_loops ADD COLUMN IF NOT EXISTS source_urls TEXT[];
ALTER TABLE user_loops ADD COLUMN IF NOT EXISTS tags TEXT[];

-- user_quests
ALTER TABLE user_quests ADD COLUMN IF NOT EXISTS visual_type TEXT DEFAULT 'orb';
ALTER TABLE user_quests ADD COLUMN IF NOT EXISTS model_url TEXT;
ALTER TABLE user_quests ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE user_quests ADD COLUMN IF NOT EXISTS source_urls TEXT[];
ALTER TABLE user_quests ADD COLUMN IF NOT EXISTS tags TEXT[];

-- user_missions
ALTER TABLE user_missions ADD COLUMN IF NOT EXISTS visual_type TEXT DEFAULT 'orb';
ALTER TABLE user_missions ADD COLUMN IF NOT EXISTS model_url TEXT;
ALTER TABLE user_missions ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE user_missions ADD COLUMN IF NOT EXISTS source_urls TEXT[];
ALTER TABLE user_missions ADD COLUMN IF NOT EXISTS tags TEXT[];

-- user_challenges
ALTER TABLE user_challenges ADD COLUMN IF NOT EXISTS visual_type TEXT DEFAULT 'orb';
ALTER TABLE user_challenges ADD COLUMN IF NOT EXISTS model_url TEXT;
ALTER TABLE user_challenges ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE user_challenges ADD COLUMN IF NOT EXISTS source_urls TEXT[];
ALTER TABLE user_challenges ADD COLUMN IF NOT EXISTS tags TEXT[];
