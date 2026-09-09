CREATE TABLE watchlist (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,product_id)
);
