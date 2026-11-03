import "server-only";
import { z } from "zod";
import { database } from "./db";
import { body,HttpError,json,requireUser,viewer } from "./http";
import type { SocialPost } from "../app/social-store";

const visible=`p.deleted_at IS NULL AND p.hidden_at IS NULL AND (p.expires_at IS NULL OR p.expires_at>now()) AND
 (p.author_id=$1 OR EXISTS(SELECT 1 FROM profiles pr WHERE pr.user_id=p.author_id AND pr.published AND pr.suspended_at IS NULL)) AND
 NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=$1 AND b.target_id=p.author_id) OR (b.target_id=$1 AND b.user_id=p.author_id))`;
const selectPosts=`SELECT p.id,p.author_id,p.media_id,p.caption,p.story,p.created_at,m.mime,m.width,m.height,m.preview_key,m.loop_key,(SELECT count(*)::int FROM post_likes lc WHERE lc.post_id=p.id) AS like_count,author.name AS author_name,author.avatar_id,(SELECT av.loop_key FROM media_assets av WHERE av.id=author.avatar_id) AS avatar_loop,
 EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked,
 EXISTS(SELECT 1 FROM post_saves s WHERE s.post_id=p.id AND s.user_id=$1) AS saved,
 COALESCE((SELECT json_agg(c) FROM (SELECT c.id,c.author_id AS "authorId",u.name AS "authorName",c.body AS text,EXTRACT(EPOCH FROM c.created_at)*1000 AS "createdAt" FROM comments c JOIN "user" u ON u.id=c.author_id WHERE c.post_id=p.id ORDER BY c.created_at DESC,c.id DESC LIMIT 20)c),'[]') AS comments
 FROM posts p JOIN media_assets m ON m.id=p.media_id JOIN profiles author ON author.user_id=p.author_id WHERE `;
function person(row:Record<string,unknown>,userId:string|null) {return {id:row.author_id===userId?'me':String(row.author_id),name:String(row.author_name),image:row.avatar_id?`/api/v1/media/${row.avatar_id}?variant=thumbnail`:'',avatarVideo:row.avatar_loop?`/api/v1/media/${row.avatar_id}?variant=loop`:undefined};}
function mapPost(row:Record<string,unknown>,userId:string|null):SocialPost & {mediaUrl:string} {
 return {previewUrl:row.loop_key?`/api/v1/media/${row.media_id}?variant=loop`:undefined,posterUrl:row.preview_key? `/api/v1/media/${row.media_id}?variant=thumbnail`:undefined,likeCount:Number(row.like_count),id:row.id as string,caption:row.caption as string,story:row.story as boolean,createdAt:new Date(row.created_at as string).getTime(),kind:String(row.mime).startsWith('video/')?'video':'photo',width:row.width as number|undefined,height:row.height as number|undefined,likedBy:row.liked?['me']:[],savedBy:row.saved?['me']:[],comments:(row.comments as {authorId:string}[]).map((comment)=>({...comment,authorId:comment.authorId===userId?'me':comment.authorId})) as SocialPost['comments'],mediaUrl:`/api/v1/media/${row.media_id}`};
}
export async function feed(request:Request,stories=false) {
 const user=await viewer(request),params=new URL(request.url).searchParams,filter=z.enum(['all','photo','video','saved']).parse(params.get('filter')??'all');
 if(filter==='saved'&&!user)throw new HttpError(401,'Inicia sesión.');
 const limit=z.coerce.number().int().min(1).max(50).parse(params.get('limit')??12);
 const at=params.get('at'),id=params.get('id');
 if(at&&!Number.isFinite(Number(at)))throw new HttpError(400,'Cursor no válido.');
 if(id)z.uuid().parse(id);
 const rows=(await database().query(selectPosts+visible+` AND p.story=$2
 AND ($3='all' OR $3='saved' AND EXISTS(SELECT 1 FROM post_saves s WHERE s.post_id=p.id AND s.user_id=$1) OR $3='photo' AND m.mime LIKE 'image/%' OR $3='video' AND m.mime LIKE 'video/%')
 AND ($4::timestamptz IS NULL OR (p.created_at,p.id)<($4,$5::uuid)) ORDER BY p.created_at DESC,p.id DESC LIMIT $6`,[user?.id??null,stories,filter,at?new Date(Number(at)):null,id??null,stories?100:limit+1])).rows;
 if(stories){const groups=new Map<string,{profileId:string;posts:unknown[];person:ReturnType<typeof person>;invitations:never[];reviews:never[]}>();for(const row of rows){const pid=row.author_id===user?.id?'me':row.author_id;if(!groups.has(pid))groups.set(pid,{profileId:pid,person:person(row,user?.id??null),posts:[],invitations:[],reviews:[]});groups.get(pid)!.posts.push(mapPost(row,user?.id??null));}return json([...groups.values()]);}
 const hasMore=rows.length>limit,items=rows.slice(0,limit).map((row)=>({profileId:row.author_id===user?.id?'me':row.author_id,post:mapPost(row,user?.id??null),person:person(row,user?.id??null)})),last=items.at(-1)?.post;
 return json({items,nextCursor:hasMore&&last?{id:last.id,createdAt:last.createdAt}:null});
}
export async function socialRecord(request:Request,profileId:string) {
 const user=await viewer(request),id=profileId==='me'?user?.id:profileId;if(!id)throw new HttpError(401,'Inicia sesión.');
 const db=database();
 const profile=(await db.query('SELECT avatar_id,cover_id,card_photo_id,(SELECT loop_key FROM media_assets WHERE id=profiles.avatar_id) AS avatar_loop FROM profiles WHERE user_id=$1 AND suspended_at IS NULL AND (published OR user_id=$2)',[id,user?.id??null])).rows[0];
 if(!profile)return json({profileId,posts:[],invitations:[],reviews:[]});
 const blocked=await db.query('SELECT 1 FROM user_blocks WHERE (user_id=$1 AND target_id=$2) OR (user_id=$2 AND target_id=$1)',[id,user?.id??null]);if(blocked.rowCount)throw new HttpError(404,'Perfil no disponible.');
 const rows=(await db.query(selectPosts+visible+' AND p.author_id=$2 ORDER BY p.created_at DESC,p.id DESC LIMIT 100',[user?.id??null,id])).rows;
 const invitations=(await db.query(`SELECT i.id,i.recipient_id AS "recipientId",u.name AS "recipientName",EXTRACT(EPOCH FROM i.created_at)*1000 AS "createdAt" FROM review_invitations i JOIN "user" u ON u.id=i.recipient_id WHERE i.owner_id=$1 AND ($1=$2 OR i.recipient_id=$2)`,[id,user?.id??null])).rows.map((row)=>({...row,recipientId:row.recipientId===user?.id?'me':row.recipientId}));
 const reviews=(await db.query(`SELECT r.id,i.id AS "invitationId",i.recipient_id AS "authorId",u.name AS "authorName",r.body AS text,r.stars,EXTRACT(EPOCH FROM r.created_at)*1000 AS "createdAt",EXISTS(SELECT 1 FROM reports rp WHERE rp.review_id=r.id AND rp.reporter_id=$2) AS reported FROM reviews r JOIN review_invitations i ON i.id=r.invitation_id JOIN "user" u ON u.id=i.recipient_id WHERE i.owner_id=$1 AND r.hidden_at IS NULL ORDER BY r.created_at DESC LIMIT 100`,[id,user?.id??null])).rows;
 return json({cardUrl:profile.card_photo_id?`/api/v1/media/${profile.card_photo_id}`:null,profileId,posts:rows.map((row)=>mapPost(row,user?.id??null)),invitations,reviews,avatarUrl:profile.avatar_id?`/api/v1/media/${profile.avatar_id}?variant=thumbnail`:null,avatarVideoUrl:profile.avatar_loop?`/api/v1/media/${profile.avatar_id}?variant=loop`:undefined,coverUrl:profile.cover_id?`/api/v1/media/${profile.cover_id}`:null});
}
export async function createPost(request:Request) {
 const user=await requireUser(request),value=await body(request,z.object({id:z.uuid(),mediaId:z.uuid(),caption:z.string().max(500),story:z.boolean(),width:z.number().int().positive().max(50000).optional(),height:z.number().int().positive().max(50000).optional()}));
 const db=database();
 const result=await db.query("SELECT 1 FROM media_assets WHERE id=$1 AND owner_id=$2 AND status='ready'",[value.mediaId,user.id]);if(!result.rowCount)throw new HttpError(403,'Archivo no disponible.');
 await db.query('UPDATE media_assets SET width=COALESCE(width,$2),height=COALESCE(height,$3) WHERE id=$1',[value.mediaId,value.width??null,value.height??null]);
 await db.query("INSERT INTO posts(id,author_id,media_id,caption,story,expires_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $5 THEN now()+interval '24 hours' ELSE NULL END) ON CONFLICT(id) DO NOTHING",[value.id,user.id,value.mediaId,value.caption,value.story]);return json({ok:true},201);
}
export async function postAction(request:Request,id:string) {
 z.uuid().parse(id);const user=await requireUser(request),db=database();
 if(request.method==='DELETE'){await db.query('UPDATE posts SET deleted_at=now() WHERE id=$1 AND author_id=$2',[id,user.id]);return json({ok:true});}
 if(!(await db.query('SELECT p.id FROM posts p WHERE '+visible+' AND p.id=$2',[user.id,id])).rowCount)throw new HttpError(404,'Publicación no disponible.');
 const value=await body(request,z.discriminatedUnion('type',[
 z.object({type:z.enum(['like','save']),value:z.boolean()}),
 z.object({type:z.literal('add-comment'),comment:z.object({id:z.uuid(),text:z.string().trim().min(1).max(500)})}),
 z.object({type:z.literal('delete-comment'),commentId:z.uuid()}),
 ]));
 if(value.type==='like'||value.type==='save'){const table=value.type==='like'?'post_likes':'post_saves';if(value.value)await db.query(`INSERT INTO ${table}(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,user.id]);else await db.query(`DELETE FROM ${table} WHERE post_id=$1 AND user_id=$2`,[id,user.id]);}
 else if(value.type==='add-comment')await db.query('INSERT INTO comments(id,post_id,author_id,body) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[value.comment.id,id,user.id,value.comment.text]);
 else if(value.type==='delete-comment')await db.query('DELETE FROM comments WHERE id=$1 AND post_id=$2 AND author_id=$3',[value.commentId,id,user.id]);
 return json({ok:true});
}
