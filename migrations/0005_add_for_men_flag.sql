-- Add for_men column to prompts table
ALTER TABLE prompts ADD COLUMN for_men BOOLEAN DEFAULT 0;

-- Add index for filtering
CREATE INDEX idx_prompts_for_men ON prompts(for_men);
