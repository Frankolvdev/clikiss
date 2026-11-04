import "server-only";
import {z} from "zod";
import {database} from "./db";
import {body,HttpError,json,requireUser} from "./http";
import {testAccounts} from "./test-accounts";
import {adminUsers} from './admin-users';
import {videoCallMetrics} from './video-calls';
import {registrationSettings,saveRegistrationSettings,SettingsError} from '../shared/registration-settings.mjs';

export async function staff(request:Request){
 const user=await requireUser(request);
 if(!user.emailVerified)throw new HttpError(403,'Confirma tu correo para acceder a administración.');
 const role=(await database().query('SELECT role FROM staff_roles WHERE user_id=$1',[user.id])).rows[0]?.role as 'admin'|'moderator'|'support'|undefined;
 if(!role)throw new HttpError(403,'No tienes acceso al panel de administración.');
 const enabled=Boolean((await database().query('SELECT "twoFactorEnabled" AS enabled FROM "user" WHERE id=$1',[user.id])).rows[0]?.enabled);
 return {user,role,enabled};
}
export async function admin(request:Request,section:string){
 const {user,role,enabled}=await staff(request),db=database();
 const required=process.env.NODE_ENV==='production'&&process.env.ENFORCE_STAFF_2FA!=='false';
 if(required&&!enabled){if(section==='overview'&&request.method==='GET')return json({role,counts:{},requiresTwoFactor:true,twoFactorEnabled:false});throw new HttpError(403,'Activa la autenticación de dos factores para continuar.');}
 if(section==='user-management')return adminUsers(request,user.id,role);
 if(section==='settings'){
  if(role!=='admin')throw new HttpError(403,'Solo administración puede gestionar la configuración.');
  if(request.method==='GET')return json(await registrationSettings(db));
  const value=await body(request,z.object({requireEmailVerification:z.boolean(),revision:z.number().int().min(0)}));
  try{return json(await saveRegistrationSettings(db,user.id,value.requireEmailVerification,value.revision));}
  catch(error){if(error instanceof SettingsError)throw new HttpError(error.status,error.message);throw error;}
 }
 if(section==='test-users'){if(role!=='admin')throw new HttpError(403,'Solo administración puede gestionar cuentas de prueba.');return testAccounts(request,user.id);}
 if(request.method==='GET'){
  if(section==='calls'&&role==='admin')return json(await videoCallMetrics());
  const params=new URL(request.url).searchParams,q=(params.get('q')??'').slice(0,100),page=Math.max(0,Math.min(10000,Number(params.get('page'))||0));
  if(section==='overview'){
   const counts=(await db.query(`SELECT (SELECT count(*) FROM "user") AS users,(SELECT count(*) FROM profiles WHERE suspended_at IS NOT NULL) AS suspended,(SELECT count(*) FROM posts WHERE deleted_at IS NULL) AS posts,(SELECT count(*) FROM reports WHERE status='open') AS reports,(SELECT count(*) FROM media_assets WHERE status IN ('queued','processing')) AS queued`)).rows[0];return json({role,counts,twoFactorEnabled:enabled,requiresTwoFactor:false});
  }
  if(section==='users')return json((await db.query(`SELECT u.id,u.name,u.email,u."emailVerified" AS verified,u."createdAt" AS created_at,p.suspended_at,s.role FROM "user" u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN staff_roles s ON s.user_id=u.id WHERE u.name ILIKE $1 OR u.email ILIKE $1 ORDER BY u."createdAt" DESC,u.id LIMIT 30 OFFSET $2`,[`%${q}%`,page*30])).rows);
  if(section==='reports')return json((await db.query(`SELECT r.*,p.name AS reporter FROM reports r JOIN profiles p ON p.user_id=r.reporter_id ORDER BY (r.status='open') DESC,r.created_at DESC LIMIT 30 OFFSET $1`,[page*30])).rows);
  if(section==='posts'&&role!=='support')return json((await db.query(`SELECT p.id,p.caption,p.created_at,p.hidden_at,p.deleted_at,u.name AS author,m.mime,m.status,p.media_id FROM posts p JOIN "user" u ON u.id=p.author_id JOIN media_assets m ON m.id=p.media_id WHERE p.deleted_at IS NULL AND p.caption ILIKE $1 ORDER BY p.created_at DESC,p.id DESC LIMIT 30 OFFSET $2`,[`%${q}%`,page*30])).rows);
  if(section==='audit'&&role==='admin')return json((await db.query('SELECT a.*,u.name AS actor FROM audit_events a LEFT JOIN "user" u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 50 OFFSET $1',[page*50])).rows);
  throw new HttpError(403,'No tienes permiso para esta sección.');
 }
 const value=await body(request,z.discriminatedUnion('action',[
  z.object({action:z.enum(['suspend','restore']),userId:z.string().min(1).max(128),reason:z.string().trim().min(5).max(500)}),
  z.object({action:z.enum(['hide-post','restore-post']),id:z.uuid(),reason:z.string().trim().min(5).max(500)}),
  z.object({action:z.enum(['hide-review','restore-review']),id:z.uuid(),reason:z.string().trim().min(5).max(500)}),
  z.object({action:z.literal('report-status'),id:z.uuid(),status:z.enum(['resolved','dismissed']),reason:z.string().trim().min(5).max(500)}),
  z.object({action:z.literal('role'),userId:z.string().min(1).max(128),role:z.enum(['admin','moderator','support','none']),reason:z.string().trim().min(5).max(500)}),
 ]));
 if(role==='support')throw new HttpError(403,'Tu rol solo permite consultar.');
 if(value.action==='role'&&role!=='admin')throw new HttpError(403,'Solo administración puede cambiar roles.');
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(73190211)');
  const currentRole=(await client.query('SELECT role FROM staff_roles WHERE user_id=$1',[user.id])).rows[0]?.role;
  if(currentRole!==role)throw new HttpError(403,'Tus permisos cambiaron. Actualiza el panel.');
  if('userId' in value){
   if(value.userId===user.id)throw new HttpError(400,'No puedes modificar tu propio acceso desde este panel.');
   if(value.action==='role'&&(await client.query('SELECT 1 FROM profiles WHERE user_id=$1 AND synthetic',[value.userId])).rowCount)throw new HttpError(400,'Las cuentas de prueba no pueden recibir roles del equipo.');
   const targetRole=(await client.query('SELECT role FROM staff_roles WHERE user_id=$1 FOR UPDATE',[value.userId])).rows[0]?.role;
   if(targetRole&&role!=='admin')throw new HttpError(403,'No puedes modificar a otro miembro del equipo.');
   if(value.action==='suspend'||value.action==='restore'){
    await client.query('UPDATE profiles SET suspended_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE user_id=$1',[value.userId,value.action==='suspend']);
    if(value.action==='suspend')await client.query('DELETE FROM session WHERE "userId"=$1',[value.userId]);
   }else if(value.action==='role'){
    if(value.role==='none')await client.query('DELETE FROM staff_roles WHERE user_id=$1',[value.userId]);
    else await client.query('INSERT INTO staff_roles(user_id,role) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role',[value.userId,value.role]);
   }
  }else if(value.action==='hide-post'||value.action==='restore-post')await client.query('UPDATE posts SET hidden_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1',[value.id,value.action==='hide-post']);
  else if(value.action==='hide-review'||value.action==='restore-review')await client.query('UPDATE reviews SET hidden_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1',[value.id,value.action==='hide-review']);
  else if(value.action==='report-status')await client.query('UPDATE reports SET status=$2 WHERE id=$1',[value.id,value.status]);
  await client.query('INSERT INTO audit_events(actor_id,action,target_id,details) VALUES($1,$2,$3,$4)',[user.id,value.action,'userId' in value?value.userId:value.id,JSON.stringify(value)]);
  await client.query('COMMIT');return json({ok:true});
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
