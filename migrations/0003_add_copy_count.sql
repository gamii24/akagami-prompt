-- Add copy_count column to prompts table
ALTER TABLE prompts ADD COLUMN copy_count INTEGER DEFAULT 0;

-- Create index for copy_count to optimize sorting by popularity
CREATE INDEX IF NOT EXISTS idx_prompts_copy_count ON prompts(copy_count DESC);
