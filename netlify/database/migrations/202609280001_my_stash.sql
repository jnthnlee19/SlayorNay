-- Private collection data follows the existing app account lifecycle.
CREATE TABLE stash_items (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 polish_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,polish_id)
);
CREATE TABLE stash_colors (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 polish_id text NOT NULL,
 hex text CHECK(hex IS NULL OR hex ~ '^#[0-9a-f]{6}$'),
 family text CHECK(family IS NULL OR family IN ('reds','oranges','yellows','greens','teals','blues','purples','pinks','browns','nudes','whites','grays','blacks')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(hex IS NOT NULL OR family IS NOT NULL),
 PRIMARY KEY(user_id,polish_id)
);
