import "server-only";
import { z } from "zod";
import { database } from "./db";
import { body,HttpError,json,requireUser } from "./http";

export async function messages(request: Request,target: string,action?:string) {
 const user=await requireUser(request),db=database();
 if(!target||target===user.id)throw new HttpError(400,'Destinatario no válido.');
 if((await db.query('SELECT 1 FROM profiles WHERE user_id=$1 AND suspended_at IS NOT NULL',[target])).rowCount)throw new HttpError(403,'Conversaci\u00f3n no disponible.');
 const pair=[user.id,target].sort();
 if((await db.query('SELECT 1 FROM user_blocks WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1)',[user.id,target])).rowCount)throw new HttpError(403,'Conversación no disponible.');
 let conversation=(await db.query('SELECT id FROM conversations WHERE user_low=LEAST($1::text,$2::text) AND user_high=GREATEST($1::text,$2::text)',pair)).rows[0];
 if(request.method==='POST'&&!conversation&&!action) {
  const profile=await db.query('SELECT 1 FROM profiles WHERE user_id=$1 AND published AND adventure_available',[target]);
  if(!profile.rowCount)throw new HttpError(403,'Necesitas un match para conversar.');
  conversation=(await db.query("INSERT INTO conversations(id,user_low,user_high,kind) VALUES($1,LEAST($2::text,$3::text),GREATEST($2::text,$3::text),'direct') ON CONFLICT(user_low,user_high) DO UPDATE SET user_low=EXCLUDED.user_low RETURNING id",[crypto.randomUUID(),...pair])).rows[0];
 }
 if(!conversation){
  const targetProfile=await db.query('SELECT 1 FROM profiles WHERE user_id=$1 AND published AND adventure_available',[target]);
  if(request.method==='GET'&&targetProfile.rowCount)return json([]);
  throw new HttpError(404,'Conversación no disponible.');
 }
 if(action==='read'){
  const value=await body(request,z.object({messageId:z.uuid()}));
  await db.query(`UPDATE messages SET read_at=now() WHERE conversation_id=$1 AND sender_id<>$2 AND read_at IS NULL
   AND (created_at,id)<=(SELECT created_at,id FROM messages WHERE id=$3 AND conversation_id=$1)`,[conversation.id,user.id,value.messageId]);
  return json({ok:true});
 }
 if(action==='typing'){
  const value=await body(request,z.object({typing:z.boolean()}));
  await db.query(`INSERT INTO chat_typing(conversation_id,user_id,expires_at) VALUES($1,$2,CASE WHEN $3 THEN now()+interval '5 seconds' ELSE now() END)
   ON CONFLICT(conversation_id,user_id) DO UPDATE SET expires_at=EXCLUDED.expires_at`,[conversation.id,user.id,value.typing]);return json({ok:true});
 }
 if(request.method==='POST') {
  const value=await body(request,z.object({id:z.uuid(),text:z.string().trim().min(1).max(4000)}));
  await db.query('INSERT INTO messages(id,conversation_id,sender_id,body) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[value.id,conversation.id,user.id,value.text]);
 }
 const params=new URL(request.url).searchParams,before=params.get('before'),beforeId=params.get('beforeId');
 if(before&&!Number.isFinite(Date.parse(before)))throw new HttpError(400,'Cursor no válido.');
 if(beforeId)z.uuid().parse(beforeId);
 const rows=(await db.query(`SELECT id,body AS text,sender_id=$2 AS "fromMe",created_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,read_at FROM messages WHERE conversation_id=$1
 AND ($3::timestamptz IS NULL OR (created_at,id)<($3,COALESCE($4::uuid,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) ORDER BY created_at DESC,id DESC LIMIT 50`,[conversation.id,user.id,before,beforeId])).rows.reverse();
 return json(rows.map((row)=>({id:row.id,text:row.text,fromMe:row.fromMe,time:new Intl.DateTimeFormat('es-MX',{hour:'2-digit',minute:'2-digit',timeZone:'America/Mexico_City'}).format(row.created_at),createdAt:row.cursor_at,readAt:row.read_at})));
}
