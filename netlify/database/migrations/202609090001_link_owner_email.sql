-- One-time owner-requested correction. Only the verified invited Identity can move.
DO $$
DECLARE source_id text; target_id text;
BEGIN
 SELECT i.user_id INTO source_id FROM identity_links i JOIN users u ON u.id=i.user_id
 WHERE i.identity_id='009be7a0-4e2e-474f-8b81-1c66004f9aab'
 AND lower(i.email)='glossortossapp@gmail.com' AND u.username='glossortoss';
 SELECT id INTO target_id FROM users WHERE username='slayornay' AND is_admin=true;
 IF source_id IS NULL OR target_id IS NULL THEN
  RAISE EXCEPTION 'Expected owner accounts not found; no accounts changed';
 END IF;
 IF EXISTS(SELECT 1 FROM identity_links WHERE user_id=target_id) THEN
  RAISE EXCEPTION 'Original owner already linked; no accounts changed';
 END IF;
 INSERT INTO votes(user_id,product_id,choice,created_at)
 SELECT target_id,product_id,choice,created_at FROM votes WHERE user_id=source_id
 ON CONFLICT(user_id,product_id) DO UPDATE SET choice=EXCLUDED.choice,created_at=EXCLUDED.created_at
 WHERE EXCLUDED.created_at>votes.created_at;
 DELETE FROM votes WHERE user_id=source_id;
 UPDATE submissions SET user_id=target_id WHERE user_id=source_id;
 UPDATE identity_links SET user_id=target_id WHERE user_id=source_id
 AND identity_id='009be7a0-4e2e-474f-8b81-1c66004f9aab';
 DELETE FROM sessions WHERE user_id IN(source_id,target_id);
END $$;
