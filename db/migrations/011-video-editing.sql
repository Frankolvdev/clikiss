ALTER TABLE media_assets ADD COLUMN preview_start double precision NOT NULL DEFAULT 0 CHECK (preview_start >= 0 AND preview_start <= 86400);
ALTER TABLE media_assets ADD COLUMN cover_time double precision NOT NULL DEFAULT 0 CHECK (cover_time >= 0 AND cover_time <= 86400);
ALTER TABLE media_assets ADD COLUMN custom_cover boolean NOT NULL DEFAULT false;
