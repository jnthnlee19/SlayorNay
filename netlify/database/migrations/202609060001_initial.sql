CREATE TABLE users (
 id text PRIMARY KEY, username text NOT NULL UNIQUE,
 password_hash text NOT NULL, recovery_hash text NOT NULL,
 is_admin boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE products (
 id text PRIMARY KEY, name text NOT NULL, brand text NOT NULL, category text NOT NULL,
 description text NOT NULL DEFAULT '', image text NOT NULL DEFAULT '', url text NOT NULL DEFAULT '',
 affiliate boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_identity ON products(lower(brand),lower(name));
CREATE TABLE votes (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 product_id text NOT NULL REFERENCES products(id),
 choice text NOT NULL CHECK(choice IN ('slay','nay')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,product_id)
);
CREATE INDEX votes_product ON votes(product_id);
CREATE INDEX votes_date ON votes(created_at);
CREATE TABLE submissions (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id),
 name text NOT NULL, brand text NOT NULL, category text NOT NULL,
 description text NOT NULL DEFAULT '', image text NOT NULL DEFAULT '', url text NOT NULL DEFAULT '',
 submitter_type text NOT NULL CHECK(submitter_type IN ('tech','brand')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rate_limits (key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);
CREATE TABLE settings (key text PRIMARY KEY, value text NOT NULL);
INSERT INTO products(id,name,brand,category,description,image,url) VALUES
('opi-bubble-bath','Bubble Bath','OPI','Polish','A sheer, soft pink nail lacquer. Tried it at your nail desk? Give it your verdict.','https://cdn.shopify.com/s/files/1/0649/4879/7673/products/bubble-bath-nls86-nail-lacquer-22001014085_fcdd1b92-e288-4052-843e-c77cd3b88188.jpg?v=1668559271&width=3840','https://www.opi.com/products/nail-lacquer-bubble-bath'),
('cnd-solaroil','SolarOil Nail & Cuticle Oil','CND','Nail care','Nail and cuticle oil for your finishing routine. Does it earn a place on your desk?','https://www.cnd.com/cdn/shop/files/CND-SolarOil-0.5oz-4500x4500.webp?v=1762897257&width=1080','https://www.cnd.com/products/solaroil'),
('opi-big-apple-red','Big Apple Red','OPI','Polish','A classic red nail lacquer. Tell the community how it performs in real life.','https://cdn.shopify.com/s/files/1/0649/4879/7673/products/big-apple-red-nln25-nail-lacquer-22001014069_5d248308-fefd-4aef-a1c2-abaedcd41a56.jpg?v=1668556954&width=3840','https://www.opi.com/products/nail-lacquer-big-apple-red'),
('opi-top-coat','OPI Top Coat','OPI','Prep & finish','The finishing layer. Vote on your experience with wear, shine, and application.','https://cdn.shopify.com/s/files/1/0649/4879/7673/products/opi-top-coat-ntt30-top-base-coats-22001009000_ff514194-e7e4-4812-b969-bde44fb55f2f.jpg?v=1670286127&width=128','https://www.opi.com/products/top-base-coats-opi-top-coat');
