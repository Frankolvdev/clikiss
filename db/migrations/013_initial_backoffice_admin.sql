-- Bootstrap the initial backoffice administrator using a Better Auth scrypt hash.
-- Preserve existing credentials when this email already has an account.
DO $$
DECLARE
  admin_id text;
BEGIN
  PERFORM pg_advisory_xact_lock(73190211);

  SELECT id INTO admin_id FROM "user" WHERE lower(email) = 'clikiss@gmail.com';
  IF admin_id IS NULL THEN
    admin_id := gen_random_uuid()::text;
    INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    VALUES (admin_id, 'Administrador', 'clikiss@gmail.com', true, now(), now());
  ELSE
    UPDATE "user" SET "emailVerified" = true, "updatedAt" = now() WHERE id = admin_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM account WHERE "userId" = admin_id AND "providerId" = 'credential'
  ) THEN
    INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, admin_id, 'credential', admin_id,
      'dcfcc73a455f49a24ef301941af5e0d1:e3dea42b850a753a3b1539dfcc640272bca57c210f33bb580af4991c04f17e44908ee63c7f6dcd32e068e683a151842b20c4dea9459f3e01f5dcc61deb01d497',
      now(), now());
  END IF;

  INSERT INTO staff_roles (user_id, role) VALUES (admin_id, 'admin')
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO audit_events (action, target_id, details)
  VALUES ('staff.bootstrap', admin_id, '{"role":"admin","source":"migration-013"}'::jsonb);
END $$;
