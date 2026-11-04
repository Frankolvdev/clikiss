export async function registrationSettings(db){
 const row=(await db.query('SELECT require_email_verification,revision,updated_at FROM application_settings WHERE id=true')).rows[0];
 return {requireEmailVerification:row?.require_email_verification??true,revision:row?.revision??0,updatedAt:row?.updated_at??null};
}
export class SettingsError extends Error{constructor(status,message){super(message);this.status=status;}}
export async function saveRegistrationSettings(db,actorId,required,revision){
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  // Serialize with staff role changes so a demoted administrator cannot save.
  await client.query('SELECT pg_advisory_xact_lock(73190211)');
  const actor=(await client.query('SELECT s.role,u."emailVerified" FROM staff_roles s JOIN "user" u ON u.id=s.user_id WHERE s.user_id=$1',[actorId])).rows[0];
  if(actor?.role!=='admin'||!actor.emailVerified)throw new SettingsError(403,'Solo un administrador con correo confirmado puede cambiar la configuración.');
  const previous=await registrationSettings(client);
  const result=await client.query('UPDATE application_settings SET require_email_verification=$1,revision=revision+1,updated_at=now(),updated_by=$2 WHERE id=true AND revision=$3 RETURNING revision',[required,actorId,revision]);
  if(!result.rowCount)throw new SettingsError(409,'La configuración cambió en otra sesión. Actualiza la página e inténtalo de nuevo.');
  await client.query('INSERT INTO audit_events(actor_id,action,target_id,details) VALUES($1,$2,$3,$4)',[actorId,'settings.registration','email-verification',JSON.stringify({previous:previous.requireEmailVerification,required})]);
  const current=await registrationSettings(client);
  await client.query('COMMIT');return current;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

// Shared by realtime authorization. Re-evaluated on each delivery/heartbeat.
export const verifiedSessionSql=`SELECT s.id FROM session s JOIN "user" u ON u.id=s."userId"
 WHERE s.id=ANY($1::text[]) AND s."expiresAt">now()
 AND (u."emailVerified" OR NOT COALESCE((SELECT require_email_verification FROM application_settings WHERE id=true),true))`;
