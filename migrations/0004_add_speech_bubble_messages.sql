-- Create speech_bubble_messages table
CREATE TABLE IF NOT EXISTS speech_bubble_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default messages
INSERT INTO speech_bubble_messages (message, display_order) VALUES
  ('ありがとう', 1),
  ('楽しんで', 2),
  ('AIって最高', 3),
  ('いいね！', 4),
  ('素敵✨', 5),
  ('やったね', 6),
  ('うれしい', 7),
  ('ナイス', 8),
  ('最高', 9),
  ('グッド👍', 10),
  ('応援してる', 11),
  ('がんばって', 12);
