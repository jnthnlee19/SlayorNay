CREATE TABLE identity_links (
 identity_id text PRIMARY KEY,
 user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 email text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
