ALTER TABLE conversations ADD COLUMN activity_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE messages ADD COLUMN read_at timestamptz;
CREATE INDEX messages_unread ON messages(conversation_id,sender_id) WHERE read_at IS NULL;
CREATE TABLE chat_typing (
 conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, PRIMARY KEY(conversation_id,user_id)
);
CREATE FUNCTION notify_read_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.read_at IS NULL AND NEW.read_at IS NOT NULL THEN
  PERFORM pg_notify('conecta_chat',json_build_object('type','read','conversationId',NEW.conversation_id)::text);
 END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER messages_read_realtime AFTER UPDATE OF read_at ON messages FOR EACH ROW EXECUTE FUNCTION notify_read_event();
CREATE FUNCTION notify_typing_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_notify('conecta_chat',json_build_object('type','typing','conversationId',NEW.conversation_id)::text);
 RETURN NEW;
END;
$$;
CREATE TRIGGER typing_realtime AFTER INSERT OR UPDATE ON chat_typing FOR EACH ROW EXECUTE FUNCTION notify_typing_event();

ALTER TABLE profiles ADD COLUMN latitude double precision CHECK(latitude BETWEEN -90 AND 90);
ALTER TABLE profiles ADD COLUMN longitude double precision CHECK(longitude BETWEEN -180 AND 180);
ALTER TABLE profiles ADD COLUMN radar_visible boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD CHECK((latitude IS NULL)=(longitude IS NULL));
CREATE INDEX profiles_radar ON profiles(latitude,longitude) WHERE published AND radar_visible;
