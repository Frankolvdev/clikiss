CREATE TABLE realtime_tickets (
 token_hash text PRIMARY KEY,
 session_id text NOT NULL REFERENCES session(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX realtime_tickets_expiry ON realtime_tickets(expires_at);

-- NOTIFY is delivered only after the transaction commits. No message text is broadcast.
CREATE OR REPLACE FUNCTION notify_message_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_notify('conecta_chat',json_build_object('type','message','conversationId',NEW.conversation_id)::text);
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION notify_conversation_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_notify('conecta_chat',json_build_object('type','account','conversationId',NEW.id)::text);
 RETURN NEW;
END;
$$;
CREATE TRIGGER messages_realtime AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION notify_message_event();
CREATE TRIGGER conversations_realtime AFTER INSERT OR UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION notify_conversation_event();
