-- Only short-lived signaling and call metadata; no recordings.
CREATE TABLE video_calls (
 id uuid PRIMARY KEY,
 conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 caller_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 callee_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 caller_client uuid NOT NULL, callee_client uuid,
 status text NOT NULL DEFAULT 'ringing' CHECK(status IN ('ringing','connecting','active','ended')),
 created_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz,
 started_at timestamptz, ended_at timestamptz, end_reason text,
 caller_seen timestamptz NOT NULL DEFAULT now(), callee_seen timestamptz,
 caller_route text NOT NULL DEFAULT 'unknown' CHECK(caller_route IN ('unknown','direct','relay')),
 callee_route text NOT NULL DEFAULT 'unknown' CHECK(callee_route IN ('unknown','direct','relay')),
 CHECK(caller_id<>callee_id)
);
CREATE INDEX video_calls_open ON video_calls(created_at) WHERE status<>'ended';
CREATE INDEX video_calls_caller ON video_calls(caller_id,created_at DESC);
CREATE INDEX video_calls_callee ON video_calls(callee_id,created_at DESC);
-- A unique reservation across BOTH caller and callee prevents cross-call races.
CREATE TABLE video_call_slots (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 call_id uuid NOT NULL REFERENCES video_calls(id) ON DELETE CASCADE
);
CREATE INDEX video_call_slots_call ON video_call_slots(call_id);
CREATE TABLE video_call_signals (
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id uuid NOT NULL UNIQUE,
 call_id uuid NOT NULL REFERENCES video_calls(id) ON DELETE CASCADE,
 sender_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX video_call_signals_delivery ON video_call_signals(call_id,seq);

CREATE FUNCTION notify_video_call() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conversation uuid;
BEGIN
 IF TG_TABLE_NAME='video_calls' THEN
  conversation:=NEW.conversation_id;
  IF NEW.status='ended' THEN
   DELETE FROM video_call_slots WHERE call_id=NEW.id;
   DELETE FROM video_call_signals WHERE call_id=NEW.id;
  END IF;
 ELSE
  SELECT conversation_id INTO conversation FROM video_calls WHERE id=NEW.call_id;
 END IF;
 PERFORM pg_notify('conecta_chat',json_build_object('type','call','conversationId',conversation)::text);
 RETURN NEW;
END $$;
CREATE TRIGGER video_call_created AFTER INSERT ON video_calls FOR EACH ROW EXECUTE FUNCTION notify_video_call();
CREATE TRIGGER video_call_changed AFTER UPDATE OF status ON video_calls FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION notify_video_call();
CREATE TRIGGER video_call_signal AFTER INSERT ON video_call_signals FOR EACH ROW EXECUTE FUNCTION notify_video_call();
