-- Keep the existing Identity links (including the owner's original admin ID).
-- Preserve photo permissions and moderation history when an old account is removed.
ALTER TABLE submissions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE submissions DROP CONSTRAINT submissions_user_id_fkey;
ALTER TABLE submissions ADD CONSTRAINT submissions_user_id_fkey
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE submissions DROP CONSTRAINT submissions_reviewed_by_fkey;
ALTER TABLE submissions ADD CONSTRAINT submissions_reviewed_by_fkey
 FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

DELETE FROM users u WHERE NOT EXISTS (
 SELECT 1 FROM identity_links i WHERE i.user_id=u.id AND btrim(i.email)<>''
);
-- Old cookies and recovery links no longer authenticate anyone.
DELETE FROM sessions;
DELETE FROM settings WHERE key LIKE 'password-reset:%';
-- Retain the inert columns for a safe rolling deployment, never old credentials.
UPDATE users SET password_hash='identity-only',recovery_hash='identity-only';
