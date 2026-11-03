ALTER TABLE test_batches DROP CONSTRAINT test_batches_requested_check;
ALTER TABLE test_batches ADD CHECK(requested BETWEEN 1 AND 500);
ALTER TABLE test_batches ADD COLUMN source text NOT NULL DEFAULT 'legacy' CHECK(source IN ('legacy','folders'));
CREATE UNIQUE INDEX test_population_active ON test_batches(source) WHERE source='folders' AND status<>'deleted';
ALTER TABLE test_accounts ADD COLUMN population_key text UNIQUE;
ALTER TABLE test_accounts ADD COLUMN source_fingerprint text;
CREATE TABLE test_import_assets (
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 source_path text NOT NULL,
 content_hash text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('profile','post','story')),
 media_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
 published boolean NOT NULL DEFAULT false,
 post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
 story_id uuid REFERENCES posts(id) ON DELETE SET NULL,
 PRIMARY KEY(user_id,source_path)
);
