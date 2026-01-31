-- Prompt images table (multiple images per prompt)
CREATE TABLE IF NOT EXISTS prompt_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_prompt_images_prompt_id ON prompt_images(prompt_id);
