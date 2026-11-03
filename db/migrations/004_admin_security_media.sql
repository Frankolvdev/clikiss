ALTER TABLE profiles ADD COLUMN suspended_at timestamptz;
ALTER TABLE posts ADD COLUMN hidden_at timestamptz;
ALTER TABLE reviews ADD COLUMN hidden_at timestamptz;
ALTER TABLE reports ADD COLUMN status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed'));
ALTER TABLE reports ADD COLUMN post_id uuid REFERENCES posts(id);
ALTER TABLE reports ADD COLUMN target_user_id text REFERENCES "user"(id);
CREATE INDEX reports_open ON reports(created_at DESC,id) WHERE status='open';
ALTER TABLE audit_events ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
CREATE TABLE rate_limits (
 scope text NOT NULL, actor_id text NOT NULL, bucket bigint NOT NULL, count integer NOT NULL,
 PRIMARY KEY(scope,actor_id,bucket)
);
CREATE INDEX rate_limits_bucket ON rate_limits(bucket);
ALTER TABLE media_assets ADD COLUMN status text NOT NULL DEFAULT 'ready' CHECK(status IN ('queued','processing','ready','failed'));
ALTER TABLE media_assets ADD COLUMN preview_key text;
ALTER TABLE media_assets ADD COLUMN duration_ms integer;
ALTER TABLE media_assets ADD COLUMN processing_started_at timestamptz;
ALTER TABLE media_assets ADD COLUMN processing_attempts integer NOT NULL DEFAULT 0;
CREATE INDEX media_processing ON media_assets(created_at,id) WHERE status IN ('queued','processing');
CREATE INDEX media_owner_quota ON media_assets(owner_id);
