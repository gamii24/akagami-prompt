-- Create login_attempts table for rate limiting
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  email TEXT,
  attempt_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  success INTEGER DEFAULT 0
);

-- Index for fast lookup by IP
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, attempt_time);

-- Index for fast lookup by email
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, attempt_time);
