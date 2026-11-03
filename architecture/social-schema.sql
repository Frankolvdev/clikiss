-- HISTORICAL REFERENCE ONLY. Active migrations: db/migrations/*.sql. Do not apply this file.
-- PostgreSQL design reference. Not applied; authentication and services are still pending.
-- UUIDs are assigned by the service. Blob files live in object storage, not these tables.
CREATE TABLE app_users (
  id uuid PRIMARY KEY,
  display_name varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE media_assets (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES app_users(id),
  object_key text NOT NULL UNIQUE,
  media_type text NOT NULL CHECK (media_type IN ('photo', 'video')),
  status text NOT NULL CHECK (status IN ('processing', 'ready', 'rejected')),
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  duration_ms integer CHECK (duration_ms > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE social_posts (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES app_users(id),
  media_id uuid NOT NULL REFERENCES media_assets(id),
  caption varchar(500) NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('draft', 'published', 'hidden', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CHECK (expires_at IS NULL OR expires_at > created_at)
);
CREATE INDEX social_feed_chronological ON social_posts (created_at DESC, id DESC)
  WHERE status = 'published' AND expires_at IS NULL;
CREATE INDEX social_profile_chronological ON social_posts (author_id, created_at DESC, id DESC)
  WHERE status = 'published';
CREATE INDEX social_active_stories ON social_posts (author_id, expires_at, created_at, id)
  WHERE status = 'published' AND expires_at IS NOT NULL;

CREATE TABLE post_likes (
  post_id uuid NOT NULL REFERENCES social_posts(id),
  user_id uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE post_saves (
  user_id uuid NOT NULL REFERENCES app_users(id),
  post_id uuid NOT NULL REFERENCES social_posts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX saved_posts_chronological ON post_saves (user_id, created_at DESC, post_id DESC);

CREATE TABLE post_comments (
  id uuid PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES social_posts(id),
  author_id uuid NOT NULL REFERENCES app_users(id),
  body varchar(500) NOT NULL CHECK (length(trim(body)) > 0),
  client_request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (author_id, client_request_id)
);
CREATE INDEX post_comments_chronological ON post_comments (post_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
