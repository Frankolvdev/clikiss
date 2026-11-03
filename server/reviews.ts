import "server-only";
import { z } from "zod";
import { database } from "./db";
import { body,HttpError,json,requireUser } from "./http";

export async function reviewAction(request:Request,profileId:string) {
 const user=await requireUser(request),owner=profileId==='me'?user.id:profileId,db=database();
 const value=await body(request,z.discriminatedUnion('type',[
  z.object({type:z.literal('invite'),id:z.uuid(),recipientId:z.string().min(1).max(128)}),
  z.object({type:z.literal('revoke'),id:z.uuid()}),
  z.object({type:z.literal('review'),id:z.uuid(),invitationId:z.uuid(),text:z.string().trim().min(1).max(600),stars:z.number().int().min(1).max(5)}),
  z.object({type:z.literal('report'),id:z.uuid()}),
  z.object({type:z.literal('photo'),field:z.enum(['avatar','cover','card']),mediaId:z.uuid().nullable()}),
 ]));
 if(value.type==='photo') {
  if(owner!==user.id)throw new HttpError(403,'No permitido.');
  if(value.mediaId===null){if(value.field!=='card')throw new HttpError(400,'Elige una imagen.');await db.query('UPDATE profiles SET card_photo_id=NULL WHERE user_id=$1',[user.id]);return json({ok:true});}
  const media=await db.query("SELECT 1 FROM media_assets WHERE id=$1 AND owner_id=$2 AND status='ready' AND (mime LIKE 'image/%' OR ($3='avatar' AND mime LIKE 'video/%' AND loop_key IS NOT NULL))",[value.mediaId,user.id,value.field]);if(!media.rowCount)throw new HttpError(403,'Archivo no disponible.');
  const field=value.field==='avatar'?'avatar_id':value.field==='card'?'card_photo_id':'cover_id';await db.query(`UPDATE profiles SET ${field}=$2 WHERE user_id=$1`,[user.id,value.mediaId]);
 } else if(value.type==='invite') {
  if(owner!==user.id||value.recipientId===user.id)throw new HttpError(403,'No permitido.');
  const pair=[user.id,value.recipientId].sort();
  if(!(await db.query('SELECT 1 FROM conversations c JOIN profiles p ON p.user_id=$1 WHERE c.user_low=LEAST($2::text,$3::text) AND c.user_high=GREATEST($2::text,$3::text) AND p.adventure_available',[user.id,...pair])).rowCount)throw new HttpError(403,'Necesitas una conversación y estar disponible en Aventura.');
  await db.query('INSERT INTO review_invitations(id,owner_id,recipient_id) VALUES($1,$2,$3) ON CONFLICT(owner_id,recipient_id) DO NOTHING',[value.id,user.id,value.recipientId]);
 } else if(value.type==='revoke') {
  await db.query('DELETE FROM review_invitations i WHERE i.id=$1 AND i.owner_id=$2 AND NOT EXISTS(SELECT 1 FROM reviews r WHERE r.invitation_id=i.id)',[value.id,user.id]);
 } else if(value.type==='review') {
  const result=await db.query('INSERT INTO reviews(id,invitation_id,body,stars) SELECT $1,i.id,$3,$4 FROM review_invitations i WHERE i.id=$2 AND i.recipient_id=$5 AND i.owner_id=$6 AND i.owner_id<>$5 ON CONFLICT(invitation_id) DO NOTHING RETURNING id',[value.id,value.invitationId,value.text,value.stars,user.id,owner]);
  if(!result.rowCount)throw new HttpError(403,'La invitación no está disponible o ya fue utilizada.');
 } else {
  await db.query('INSERT INTO reports(id,reporter_id,review_id) SELECT $1,$2,r.id FROM reviews r WHERE r.id=$3 ON CONFLICT(reporter_id,review_id) DO NOTHING',[crypto.randomUUID(),user.id,value.id]);
 }
 return json({ok:true});
}
