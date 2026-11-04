CREATE TABLE application_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 require_email_verification boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text REFERENCES "user"(id) ON DELETE SET NULL
);
INSERT INTO application_settings(id) VALUES(true);
