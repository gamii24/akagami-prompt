-- Add user_agent and ip_address to user_sessions for device tracking
ALTER TABLE user_sessions ADD COLUMN user_agent TEXT;
ALTER TABLE user_sessions ADD COLUMN ip_address TEXT;
ALTER TABLE user_sessions ADD COLUMN last_activity DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Create index for last_activity cleanup
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);
