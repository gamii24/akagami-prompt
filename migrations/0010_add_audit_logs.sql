-- Create audit_logs table for tracking security events
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL, -- 'login', 'logout', 'password_change', 'submission_approved', 'submission_rejected', 'submission_deleted'
  user_id INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  details TEXT, -- JSON string with event details
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
