import assert from 'node:assert/strict';
import sharp from 'sharp';
import {verifyAccount} from './mail-test-helpers.mjs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const origin=process.env.APP_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error('Estas pruebas solo se ejecutan contra servicios locales.');
const db=new Pool({connectionString:process.env.DATABASE_URL});
const users=[];
function client(){let cookie='';return async(path,{body,method='GET',status=200,originHeader=origin}={})=>{
 const request=()=>fetch(origin+path,{method,headers:{Origin:originHeader,...(cookie?{Cookie:cookie}:{}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
 let response=await request();
 for(let attempt=0;response.status===429&&attempt<2;attempt++){
  const seconds=Number(response.headers.get('retry-after'))||10;
  await response.arrayBuffer();
  await new Promise((resolve)=>setTimeout(resolve,Math.min(30000,Math.max(1000,seconds*1000+200))));
  response=await request();
 }
 const cookies=response.headers.getSetCookie();if(cookies.length)cookie=cookies.map((item)=>item.split(';')[0]).join('; ');
 const type=response.headers.get('content-type')??'';const data=type.includes('json')?await response.json():await response.arrayBuffer();
 assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data)}`);return data;
};}
const a=client(),b=client(),guest=client();
try{
 const suffix=randomUUID(),password=`Test-${randomUUID()}!`;
 for(const [call,name] of [[a,'Persona A'],[b,'Persona B']]){
  const result=await call('/api/auth/sign-up/email',{method:'POST',body:{name,email:`${name.endsWith('A')?'a':'b'}-${suffix}@example.test`,password}});users.push(result.user.id);
  const email=`${name.endsWith('A')?'a':'b'}-${suffix}@example.test`;
  await verifyAccount(email);await call('/api/auth/sign-in/email',{method:'POST',body:{email,password}});
  await call('/api/v1/me');
  await call('/api/v1/me',{method:'PUT',body:{name,age:27,location:'CDMX',gender:'Prefiero no decirlo',bio:'Perfil de prueba automatizada',interests:['Arte'],adventureAvailable:true}});
 }
 await guest('/api/v1/me',{status:401});
 await a('/api/v1/me',{method:'PUT',originHeader:'https://invalid.example',body:{},status:403});
 const catalog=await guest('/api/v1/profiles');assert(catalog.some((row)=>row.id===users[0]));
 await a('/api/v1/interests',{method:'POST',body:{targetId:users[1],kind:'like'}});
 const match=await b('/api/v1/interests',{method:'POST',body:{targetId:users[0],kind:'like'}});assert.equal(match.match,true);
 const messageId=randomUUID();for(let index=0;index<2;index++)await a(`/api/v1/messages/${users[1]}`,{method:'POST',body:{id:messageId,text:'Hola desde PostgreSQL'}});
 const history=await b(`/api/v1/messages/${users[0]}`);assert.equal(history.filter((row)=>row.id===messageId).length,1);assert.equal(history[0].fromMe,false);
 const form=new FormData();form.set('file',new Blob([await sharp({create:{width:8,height:8,channels:3,background:'#ff1734'}}).png().toBuffer()],{type:'image/png'}),'pixel.png');
 const media=await a('/api/v1/media',{method:'POST',body:form,status:201});
 const postId=randomUUID();
 await b('/api/v1/posts',{method:'POST',body:{id:randomUUID(),mediaId:media.id,caption:'No permitido',story:false},status:403});
 await a('/api/v1/posts',{method:'POST',body:{id:postId,mediaId:media.id,caption:'Publicación PostgreSQL',story:false,width:1,height:1},status:201});
 const page=await guest('/api/v1/feed');assert(page.items.some((item)=>item.post.id===postId));
 await guest('/api/v1/media/'+media.id);
 for(let index=0;index<2;index++)await b(`/api/v1/posts/${postId}`,{method:'PATCH',body:{type:'like',value:true}});
 assert.equal(Number((await db.query('SELECT count(*) FROM post_likes WHERE post_id=$1',[postId])).rows[0].count),1);
 const commentId=randomUUID();await b(`/api/v1/posts/${postId}`,{method:'PATCH',body:{type:'add-comment',comment:{id:commentId,text:'Comentario persistente'}}});
 await a(`/api/v1/posts/${postId}`,{method:'PATCH',body:{type:'delete-comment',commentId}});
 assert.equal((await db.query('SELECT id FROM comments WHERE id=$1',[commentId])).rowCount,1);
 await b(`/api/v1/posts/${postId}`,{method:'DELETE'});assert.equal((await db.query('SELECT id FROM posts WHERE id=$1 AND deleted_at IS NULL',[postId])).rowCount,1);
 const invitationId=randomUUID();await a('/api/v1/social/me',{method:'POST',body:{type:'invite',id:invitationId,recipientId:users[1]}});
 const reviewId=randomUUID();await b(`/api/v1/social/${users[0]}`,{method:'POST',body:{type:'review',id:reviewId,invitationId,text:'Encuentro no comercial',stars:5}});
 await b(`/api/v1/social/${users[0]}`,{method:'POST',body:{type:'review',id:randomUUID(),invitationId,text:'Duplicada',stars:5},status:403});
 await a('/api/v1/posts/'+postId,{method:'DELETE'});await guest('/api/v1/media/'+media.id,{status:404});
 await a('/api/auth/sign-out',{method:'POST',body:{}});await a('/api/v1/me',{status:401});
 console.log('PostgreSQL OK: registro, sesión, perfiles, match, mensajes idempotentes, archivos, feed, likes, comentarios, permisos, reseñas y cierre de sesión.');
}finally{
 // Delete only the accounts created by this run and their test files.
 const files=users.length?(await db.query('SELECT object_key FROM media_assets WHERE owner_id=ANY($1::text[])',[users])).rows:[];
 if(users.length){await db.query('DELETE FROM reports WHERE reporter_id=ANY($1::text[])',[users]);await db.query('DELETE FROM reviews WHERE invitation_id IN(SELECT id FROM review_invitations WHERE owner_id=ANY($1::text[]) OR recipient_id=ANY($1::text[]))',[users]);await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[users]);}
 const {unlink}=await import('node:fs/promises');const path=await import('node:path');for(const file of files)await unlink(path.resolve(process.env.MEDIA_ROOT??'.data/media',file.object_key)).catch(()=>{});
 await db.end();
}
