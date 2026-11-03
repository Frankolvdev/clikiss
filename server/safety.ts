import "server-only";
import {z} from "zod";
import {database} from "./db";
import {body,HttpError,json,requireUser} from "./http";

export async function blocks(request:Request){
 const user=await requireUser(request),db=database();
 if(request.method==='GET')return json((await db.query('SELECT b.target_id AS id,u.name FROM user_blocks b JOIN "user" u ON u.id=b.target_id WHERE b.user_id=$1 ORDER BY u.name',[user.id])).rows);
 const value=await body(request,z.object({targetId:z.string().min(1).max(128),blocked:z.boolean()}));
 if(value.targetId===user.id)throw new HttpError(400,'No puedes bloquear tu propia cuenta.');
 if(value.blocked)await db.query('INSERT INTO user_blocks(user_id,target_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[user.id,value.targetId]);
 else await db.query('DELETE FROM user_blocks WHERE user_id=$1 AND target_id=$2',[user.id,value.targetId]);
 return json({ok:true});
}
export async function report(request:Request){
 const user=await requireUser(request),value=await body(request,z.object({targetUserId:z.string().min(1).max(128).optional(),postId:z.uuid().optional(),reason:z.string().trim().min(5).max(500)}).refine((value)=>Boolean(value.targetUserId||value.postId)));
 if(value.targetUserId===user.id)throw new HttpError(400,'Destinatario no válido.');
 await database().query('INSERT INTO reports(id,reporter_id,target_user_id,post_id,reason) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),user.id,value.targetUserId??null,value.postId??null,value.reason]);
 return json({ok:true},201);
}
