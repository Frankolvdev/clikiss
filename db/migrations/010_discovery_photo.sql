ALTER TABLE profiles ADD COLUMN card_photo_id uuid REFERENCES media_assets(id);
