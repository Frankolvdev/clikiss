-- Recover earlier exemptions from the audited switch history. New registrations
-- already have an immutable policy stamped by migration 016's insert trigger.
UPDATE "user" u SET "emailVerificationRequired"=false
WHERE u."emailVerificationRequired" AND NOT u."emailVerified"
AND u."createdAt"<=(SELECT applied_at FROM schema_migrations WHERE name='016_registration_email_policy.sql')
AND COALESCE(
 (SELECT (a.details->>'required')::boolean FROM audit_events a
  WHERE a.action='settings.registration' AND a.details->>'required' IN ('true','false')
  AND a.created_at<=u."createdAt" ORDER BY a.created_at DESC,a.id DESC LIMIT 1),
 (SELECT (a.details->>'previous')::boolean FROM audit_events a
  WHERE a.action='settings.registration' AND a.details->>'previous' IN ('true','false')
  ORDER BY a.created_at,a.id LIMIT 1),
 (SELECT require_email_verification FROM application_settings WHERE id=true),true
)=false;
