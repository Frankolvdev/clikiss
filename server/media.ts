import "server-only";
import sharp from "sharp";
import {putMedia,removeMedia,mediaSize,streamMedia} from "../shared/media-storage.mjs";
import { database } from "./db";
import { HttpError,json,requireUser,viewer } from "./http";
import { z } from "zod";

function validBytes(bytes: Buffer,mime: string) {
 if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==='image/png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(mime==='image/gif')return ['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString());
 if(mime==='image/webp')return bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(mime==='image/avif')return bytes.subarray(4,8).toString()==='ftyp'&&['avif','avis'].includes(bytes.subarray(8,12).toString());
 if(mime==='video/mp4')return bytes.subarray(4,8).toString()==='ftyp';
 if(mime==='video/webm')return bytes.subarray(0,4).equals(Buffer.from([26,69,223,163]));
 return false;
}
export async function uploadMedia(request: Request) {
 const user=await requireUser(request),limit=29*1024*1024;
 if(!request.body)throw new HttpError(400,'Archivo requerido.');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 while(true){const result=await reader.read();if(result.done)break;length+=result.value.length;if(length>limit){await reader.cancel();throw new HttpError(413,'Archivo demasiado grande.');}chunks.push(result.value);}
 const raw=Buffer.concat(chunks);
 const form=await new Request('http://local',{method:'POST',headers:{'content-type':request.headers.get('content-type')??''},body:raw}).formData();
 const file=form.get('file');
 if(!(file instanceof File)||!file.size)throw new HttpError(400,'Archivo requerido.');
 if(file.size>(file.type.startsWith('image/')?8:25)*1024*1024)throw new HttpError(413,'Archivo demasiado grande.');
 const bytes=Buffer.from(await file.arrayBuffer());
 if(!validBytes(bytes,file.type))throw new HttpError(400,'Formato de archivo no compatible.');
 const previewStart=z.coerce.number().finite().min(0).max(86400).parse(form.get('previewStart')??0),coverTime=z.coerce.number().finite().min(0).max(86400).parse(form.get('coverTime')??0);
 const cover=form.get('cover');let coverBytes:Buffer|undefined;
 if(cover instanceof File&&cover.size){if(cover.size>2*1024*1024||!cover.type.startsWith('image/'))throw new HttpError(400,'Portada no compatible.');const bytes=Buffer.from(await cover.arrayBuffer());if(!validBytes(bytes,cover.type))throw new HttpError(400,'Portada no compatible.');coverBytes=await sharp(bytes,{limitInputPixels:40000000}).rotate().resize({width:640,height:640,fit:'inside'}).webp({quality:80}).toBuffer();}
 const id=crypto.randomUUID(),db=database(),client=await db.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`media:${user.id}`]);
  const usage=Number((await client.query('SELECT COALESCE(sum(bytes),0) AS used FROM media_assets WHERE owner_id=$1',[user.id])).rows[0].used);
  const quota=Number(process.env.MEDIA_QUOTA_MB??500)*1024*1024;
  if(usage+file.size>quota)throw new HttpError(413,'Alcanzaste el espacio disponible para archivos.');
  await client.query("INSERT INTO media_assets(id,owner_id,object_key,mime,bytes,status,preview_start,cover_time,custom_cover) VALUES($1,$2,$5,$3,$4,'processing',$6,$7,$8)",[id,user.id,file.type,file.size,id,previewStart,coverTime,Boolean(coverBytes)]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 try{
  if(file.type.startsWith('image/')){
   const result=await sharp(bytes,{limitInputPixels:40000000}).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer({resolveWithObject:true});
   const preview=await sharp(result.data).resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).webp({quality:72}).toBuffer();
   await putMedia(id,result.data,'image/webp');await putMedia(id+'.preview',preview,'image/webp');
   await db.query("UPDATE media_assets SET mime='image/webp',bytes=$2,width=$3,height=$4,preview_key=$5,status='ready' WHERE id=$1",[id,result.data.length,result.info.width,result.info.height,id+'.preview']);
  }else{if(coverBytes)await putMedia(id+'.preview',coverBytes,'image/webp');await putMedia(id,bytes,file.type);await db.query("UPDATE media_assets SET status='queued' WHERE id=$1",[id]);}
 }catch{await removeMedia(id).catch(()=>{});await removeMedia(id+'.preview').catch(()=>{});await db.query('DELETE FROM media_assets WHERE id=$1',[id]);throw new HttpError(400,'No se pudo procesar el archivo.');}
 return json({id,status:file.type.startsWith('image/')?'ready':'queued'},201);
}
export async function mediaStatus(request:Request,id:string){z.uuid().parse(id);const user=await requireUser(request);const row=(await database().query('SELECT status FROM media_assets WHERE id=$1 AND owner_id=$2',[id,user.id])).rows[0];if(!row)throw new HttpError(404,'Archivo no disponible.');return json(row);}
export async function getMedia(request: Request,id:string) {
 z.uuid().parse(id);const user=await viewer(request);
 const db=database();const requireFactor=process.env.NODE_ENV==='production'&&process.env.ENFORCE_STAFF_2FA!=='false';
 const moderate=Boolean(user&&new URL(request.url).searchParams.get('moderation')==='1'&&(await db.query('SELECT 1 FROM staff_roles s JOIN "user" u ON u.id=s.user_id WHERE s.user_id=$1 AND s.role IN (\'admin\',\'moderator\') AND (NOT $2::boolean OR u."twoFactorEnabled"=true)',[user.id,requireFactor])).rowCount);
 const result=await db.query(`SELECT m.object_key,m.preview_key,m.loop_key,m.mime,m.owner_id FROM media_assets m WHERE m.id=$1 AND m.status='ready' AND
 ($3 OR m.owner_id=$2 OR EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=m.owner_id AND p.published AND p.suspended_at IS NULL AND
 (p.avatar_id=m.id OR p.cover_id=m.id OR p.card_photo_id=m.id OR EXISTS(SELECT 1 FROM posts s WHERE s.media_id=m.id AND s.deleted_at IS NULL AND s.hidden_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now())))))
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=$2 AND b.target_id=m.owner_id) OR (b.target_id=$2 AND b.user_id=m.owner_id))`,[id,user?.id??null,moderate]);
 const media=result.rows[0];if(!media)throw new HttpError(404,'Archivo no disponible.');
 const preview=new URL(request.url).searchParams.get('variant')==='thumbnail'&&media.preview_key;
 const loop=new URL(request.url).searchParams.get('variant')==='loop';if(loop&&!media.loop_key)throw new HttpError(404,'Animación no disponible.');
 const object=loop?media.loop_key:preview?media.preview_key:media.object_key,size=await mediaSize(object);
 const headers:Record<string,string>={'Content-Type':loop?'video/mp4':preview?'image/webp':media.mime,'Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'};
 const range=request.headers.get('range');
 if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)return new Response(null,{status:416});const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),size-1):size-1;if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});return new Response(await streamMedia(object,{start,end}),{status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${size}`}});}
 return new Response(await streamMedia(object),{headers:{...headers,'Content-Length':String(size)}});
}
