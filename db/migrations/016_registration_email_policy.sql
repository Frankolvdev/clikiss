-- Store the registration policy per account. Never falsify emailVerified.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emailVerificationRequired" boolean NOT NULL DEFAULT true;
-- Accounts already exempt under the previous global setting retain their access.
UPDATE "user" SET "emailVerificationRequired"=false
WHERE NOT COALESCE((SELECT require_email_verification FROM application_settings WHERE id=true),true);

CREATE FUNCTION stamp_registration_email_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT require_email_verification INTO NEW."emailVerificationRequired"
 FROM application_settings WHERE id=true FOR SHARE;
 NEW."emailVerificationRequired":=COALESCE(NEW."emailVerificationRequired",true);
 RETURN NEW;
END $$;
CREATE TRIGGER registration_email_policy BEFORE INSERT ON "user"
FOR EACH ROW EXECUTE FUNCTION stamp_registration_email_policy();
