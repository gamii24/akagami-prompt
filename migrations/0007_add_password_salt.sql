-- Add password_salt column to users table
ALTER TABLE users ADD COLUMN password_salt TEXT;

-- Note: Existing users will need to reset their passwords
-- because we cannot recover the original passwords to re-hash with salt
