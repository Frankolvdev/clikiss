ALTER TABLE profiles ADD COLUMN synthetic boolean NOT NULL DEFAULT false;
CREATE TABLE test_batches (
 id uuid PRIMARY KEY, creator_id text REFERENCES "user"(id) ON DELETE SET NULL,
 label varchar(80) NOT NULL, requested integer NOT NULL CHECK(requested BETWEEN 1 AND 400),
 publications integer NOT NULL CHECK(publications BETWEEN 0 AND 800),
 created integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'queued'
 CHECK(status IN ('queued','running','waiting-images','ready','failed','deleting','deleted')),
 error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE test_accounts (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 batch_id uuid NOT NULL REFERENCES test_batches(id), position integer NOT NULL,
 catalog_key text NOT NULL, credential_cipher text NOT NULL,
 UNIQUE(batch_id,position), UNIQUE(batch_id,catalog_key)
);
CREATE INDEX test_accounts_batch ON test_accounts(batch_id);
CREATE INDEX test_batches_pending ON test_batches(created_at) WHERE status IN ('queued','running','waiting-images','deleting');
