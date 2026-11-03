import "server-only";
import { z } from "zod";
import { database } from "./db";
import { body, HttpError, json, requireUser, viewer } from "./http";
import {normalizePersonName} from "../shared/person-name.mjs";

export const profileSchema = z.object({
 name: z.string().transform(normalizePersonName).pipe(z.string().min(1).max(80)), age: z.number().int().min(18).max(99),
 location: z.string().trim().max(100), gender: z.string().max(40), bio: z.string().max(500),
 interests: z.array(z.string().trim().min(1).max(40)).max(20), adventureAvailable: z.boolean(),
});
export const preferenceSchema = z.object({ minAge: z.number().int().min(18).max(99), maxAge: z.number().int().min(18).max(99), gender: z.string().max(40), location: z.string().max(100) }).refine((value)=>value.minAge<=value.maxAge);
export const publicProfileSql = `SELECT p.user_id AS id,p.name,COALESCE(EXTRACT(YEAR FROM age(p.birth_date))::int,18) AS age,
 p.location,p.gender,p.bio,p.interests,p.synthetic AS "isTest",p.adventure_available AS "adventureAvailable",
 CASE WHEN p.avatar_id IS NOT NULL THEN '/api/v1/media/'||p.avatar_id||'?variant=thumbnail' ELSE '' END AS image,
 CASE WHEN EXISTS(SELECT 1 FROM media_assets av WHERE av.id=p.avatar_id AND av.loop_key IS NOT NULL) THEN '/api/v1/media/'||p.avatar_id||'?variant=loop' END AS "avatarVideo",
 p.card_photo_id IS NOT NULL AS "hasDiscoveryPhoto",
 CASE WHEN p.card_photo_id IS NOT NULL THEN '/api/v1/media/'||p.card_photo_id WHEN p.avatar_id IS NOT NULL THEN '/api/v1/media/'||p.avatar_id||CASE WHEN EXISTS(SELECT 1 FROM media_assets av WHERE av.id=p.avatar_id AND av.mime LIKE 'video/%') THEN '?variant=thumbnail' ELSE '' END END AS "discoveryImage",
 false AS online,false AS reciprocal,NULL::double precision AS distance FROM profiles p`;
export async function ensureProfile(id: string, name: string) {
 await database().query("INSERT INTO profiles(user_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING",[id,name]);
 await database().query("INSERT INTO preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING",[id]);
}
export async function profiles(request: Request, action: string, target?: string) {
 const db=database(), user=await viewer(request);
 if(action==='profiles') {
  const result=await db.query(publicProfileSql+` WHERE p.published AND p.suspended_at IS NULL AND ($1::text IS NULL OR p.user_id<>$1)
   AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=$1 AND b.target_id=p.user_id) OR (b.target_id=$1 AND b.user_id=p.user_id))
   AND ($2::text IS NULL OR p.user_id=$2) ORDER BY p.created_at DESC,p.user_id LIMIT 100`,[user?.id??null,target??null]);
  if(target&&!result.rowCount)throw new HttpError(404,'Perfil no disponible.');
  return json(target?result.rows[0]:result.rows);
 }
 const account=await requireUser(request);
 await ensureProfile(account.id,account.name);
 if(request.method==='GET') {
  const profile=(await db.query(publicProfileSql+' WHERE p.user_id=$1',[account.id])).rows[0];
  const prefs=(await db.query('SELECT min_age AS "minAge",max_age AS "maxAge",gender,location FROM preferences WHERE user_id=$1',[account.id])).rows[0];
  const interests=(await db.query('SELECT target_id,kind FROM profile_interests WHERE user_id=$1',[account.id])).rows;
  const contacts=(await db.query(`SELECT c.id,c.kind,CASE WHEN c.user_low=$1 THEN c.user_high ELSE c.user_low END AS target FROM conversations c WHERE (c.user_low=$1 OR c.user_high=$1) AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=c.user_low AND b.target_id=c.user_high) OR (b.target_id=c.user_low AND b.user_id=c.user_high)) AND NOT EXISTS(SELECT 1 FROM profiles suspended WHERE suspended.user_id IN(c.user_low,c.user_high) AND suspended.suspended_at IS NOT NULL)`,[account.id])).rows;
  const contactIds=contacts.map((row)=>row.target);
  const contactProfiles=contactIds.length?(await db.query(publicProfileSql+' WHERE p.user_id=ANY($1::text[])',[contactIds])).rows:[];
  return json({ profile,prefs, likedIds:interests.filter((row)=>row.kind==='like').map((row)=>row.target_id), passedIds:interests.filter((row)=>row.kind==='pass').map((row)=>row.target_id), matchIds:contacts.filter((row)=>row.kind==='match').map((row)=>row.target), directIds:contacts.filter((row)=>row.kind==='direct').map((row)=>row.target), contacts:contactProfiles });
 }
 if(action==='preferences') {
  const value=await body(request,preferenceSchema);
  await db.query('UPDATE preferences SET min_age=$2,max_age=$3,gender=$4,location=$5 WHERE user_id=$1',[account.id,value.minAge,value.maxAge,value.gender,value.location]);return json({ok:true});
 }
 const value=await body(request,profileSchema);
 await db.query(`UPDATE profiles SET name=$2,birth_date=COALESCE(birth_date,(CURRENT_DATE-make_interval(years=>$3))::date),location=$4,gender=$5,bio=$6,interests=$7,adventure_available=$8,published=true,updated_at=now() WHERE user_id=$1`,[account.id,value.name,value.age,value.location,value.gender,value.bio,value.interests,value.adventureAvailable]);
 return json({ok:true});
}
export async function interest(request: Request) {
 const user=await requireUser(request), value=await body(request,z.object({targetId:z.string().min(1).max(128),kind:z.enum(['like','pass'])}));
 if(value.targetId===user.id) throw new HttpError(400,'No puedes elegir tu propio perfil.');
 const db=database(),client=await db.connect();
 try {
  await client.query('BEGIN');
  const pair=[user.id,value.targetId].sort();
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[pair.join(':')]);
  const target=await client.query('SELECT 1 FROM profiles WHERE user_id=$1 AND published',[value.targetId]);
  if(!target.rowCount) throw new HttpError(404,'Perfil no disponible.');
  const blocked=await client.query('SELECT 1 FROM user_blocks WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1)',[user.id,value.targetId]);
  if(blocked.rowCount) throw new HttpError(403,'Perfil no disponible.');
  await client.query('INSERT INTO profile_interests(user_id,target_id,kind) VALUES($1,$2,$3) ON CONFLICT(user_id,target_id) DO UPDATE SET kind=EXCLUDED.kind',[user.id,value.targetId,value.kind]);
  const mutual=value.kind==='like'&&(await client.query("SELECT 1 FROM profile_interests WHERE user_id=$1 AND target_id=$2 AND kind='like'",[value.targetId,user.id])).rowCount;
  if(mutual) await client.query("INSERT INTO conversations(id,user_low,user_high,kind) VALUES($1,LEAST($2::text,$3::text),GREATEST($2::text,$3::text),'match') ON CONFLICT(user_low,user_high) DO UPDATE SET kind='match'",[crypto.randomUUID(),...pair]);
  await client.query('COMMIT');return json({match:Boolean(mutual)});
 } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
