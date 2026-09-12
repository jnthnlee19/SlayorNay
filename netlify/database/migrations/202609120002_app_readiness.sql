ALTER TABLE submissions ADD COLUMN approved_product_id text;
-- Preserve provenance for previous approvals without changing product records.
UPDATE submissions s SET approved_product_id=p.id FROM products p WHERE s.status='approved' AND ((s.submission_kind='photo' AND s.target_product_id=p.id) OR (s.submission_kind='product' AND lower(s.name)=lower(p.name) AND lower(s.brand)=lower(p.brand)));
CREATE TABLE content_reports(id text PRIMARY KEY,user_id text REFERENCES users(id) ON DELETE SET NULL,product_id text REFERENCES products(id) ON DELETE SET NULL,reason text NOT NULL,details text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX content_reports_status ON content_reports(status,created_at);
