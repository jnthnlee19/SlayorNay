-- Retain a private audit copy while removing all existing catalog image links.
CREATE TABLE retired_product_images (
 product_id text PRIMARY KEY, image text NOT NULL, retired_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO retired_product_images(product_id,image) SELECT id,image FROM products WHERE image<>'';
UPDATE products SET image='';
ALTER TABLE submissions ADD COLUMN retired_image text NOT NULL DEFAULT '';
UPDATE submissions SET retired_image=image,image='';
ALTER TABLE submissions ADD COLUMN target_product_id text REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE submissions ADD COLUMN submission_kind text NOT NULL DEFAULT 'product' CHECK(submission_kind IN ('product','photo'));
ALTER TABLE submissions ADD COLUMN photo_key text NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN original_filename text NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN consent_text text NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN consent_version text NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN consent_at timestamptz;
ALTER TABLE submissions ADD COLUMN reviewed_at timestamptz;
ALTER TABLE submissions ADD COLUMN reviewed_by text REFERENCES users(id);
