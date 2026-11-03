import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import sharp from 'sharp';
import {Pool} from 'pg';
import nextEnv from '@next/env';
import {verifyAccount} from './mail-test-helpers.mjs';
import {removeMedia} from '../shared/media-storage.mjs';
nextEnv.loadEnvConfig(process.cwd(),true);
const origin=process.env.APP_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error('Solo servicios locales.');
const db=new Pool({connectionString:process.env.DATABASE_URL}),users=[],dir=await mkdtemp(path.join(tmpdir(),'conecta-qa-'));
const password=`Test-${randomUUID()}!`;
function client(){let cookie='';return async(route,method='GET',body,status=200,extra={})=>{
 const response=await fetch(origin+route,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...extra},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
 const cookies=response.headers.getSetCookie();if(cookies.length)cookie=cookies.map((item)=>item.split(';')[0]).join('; ');
 const result=(response.headers.get('content-type')??'').includes('json')?await response.json():await response.arrayBuffer();assert.equal(response.status,status,`${method} ${route}: ${JSON.stringify(result)}`);return result;
};}
const admin=client(),support=client(),member=client(),guest=client();
try{
 for(const [call,role] of [[admin,'admin'],[support,'support'],[member,null]]){
  const email=`qa-${randomUUID()}@example.test`,value=await call('/api/auth/sign-up/email','POST',{email,password,name:'Prueba temporal'});users.push(value.user.id);
  await verifyAccount(email);await call('/api/auth/sign-in/email','POST',{email,password});await call('/api/v1/me');
  await call('/api/v1/me','PUT',{name:'Prueba temporal',age:28,location:'CDMX',gender:'Prefiero no decirlo',bio:'Cuenta temporal de QA',interests:[],adventureAvailable:true});
  if(role)await db.query('INSERT INTO staff_roles(user_id,role) VALUES($1,$2)',[value.user.id,role]);
 }
 await guest('/api/v1/admin/overview','GET',null,401);
 await member('/api/v1/admin/overview','GET',null,403);
 await support('/api/v1/admin/audit','GET',null,403);
 const action={action:'suspend',userId:users[2],reason:'Prueba de permisos'};
 await support('/api/v1/admin/actions','POST',action,403);
 await admin('/api/v1/admin/overview');
 const form=new FormData();form.set('file',new Blob([await sharp({create:{width:32,height:24,channels:3,background:'#ee1732'}}).png().toBuffer()],{type:'image/png'}),'image.png');
 const image=await member('/api/v1/media','POST',form,201),postId=randomUUID();
 await member('/api/v1/posts','POST',{id:postId,mediaId:image.id,caption:'Prueba moderación',story:false},201);
 await guest(`/api/v1/media/${image.id}?variant=thumbnail`);
 await support('/api/v1/reports','POST',{postId,reason:'Reporte de prueba'},201);
 await admin('/api/v1/admin/actions','POST',{action:'hide-post',id:postId,reason:'Prueba moderación'});
 await guest(`/api/v1/media/${image.id}`,'GET',null,404);
 await admin(`/api/v1/media/${image.id}?moderation=1`);
 await admin('/api/v1/admin/actions','POST',{action:'restore-post',id:postId,reason:'Prueba restauración'});
 await support('/api/v1/blocks','POST',{targetId:users[2],blocked:true});
 await support(`/api/v1/media/${image.id}`,'GET',null,404);
 await support('/api/v1/blocks','POST',{targetId:users[2],blocked:false});
 await new Promise((resolve,reject)=>{const child=spawn(ffmpeg,['-y','-f','lavfi','-i','color=c=red:s=160x120:d=1','-c:v','libx264','-pix_fmt','yuv420p',path.join(dir,'test.mp4')],{stdio:'ignore',windowsHide:true});child.on('error',reject);child.on('exit',(code)=>code===0?resolve():reject(new Error('Video fixture')));});
 const videoForm=new FormData();videoForm.set('file',new Blob([await readFile(path.join(dir,'test.mp4'))],{type:'video/mp4'}),'test.mp4');
 const video=await member('/api/v1/media','POST',videoForm,201);let state;
 for(let i=0;i<40;i++){state=await member(`/api/v1/media-status/${video.id}`);if(state.status==='ready'||state.status==='failed')break;await new Promise((resolve)=>setTimeout(resolve,1000));}
 assert.equal(state.status,'ready');
 await member(`/api/v1/media/${video.id}`,'GET',null,206,{Range:'bytes=0-31'});
 await member(`/api/v1/media/${video.id}?variant=thumbnail`);
 await admin('/api/v1/admin/actions','POST',action);
 await member('/api/v1/me','GET',null,401);
 await admin('/api/v1/admin/actions','POST',{...action,action:'restore'});
 assert((await admin('/api/v1/admin/audit')).some((row)=>row.target_id===users[2]&&row.action==='suspend'));
 console.log('Admin/media OK: roles, permisos, moderación, bloqueo, revocación, auditoría, imagen WebP, video procesado, miniatura y streaming parcial.');
}finally{
 const files=users.length?(await db.query('SELECT object_key,preview_key FROM media_assets WHERE owner_id=ANY($1::text[])',[users])).rows:[];
 if(users.length){await db.query('DELETE FROM reports WHERE reporter_id=ANY($1::text[])',[users]);await db.query('DELETE FROM audit_events WHERE actor_id=ANY($1::text[])',[users]);await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[users]);}
 for(const item of files){await removeMedia(item.object_key).catch(()=>{});if(item.preview_key)await removeMedia(item.preview_key).catch(()=>{});}
 if(path.dirname(path.resolve(dir))!==path.resolve(tmpdir())||!path.basename(dir).startsWith('conecta-qa-'))throw new Error('UNSAFE_TEMP_PATH');await rm(dir,{recursive:true,force:true});await db.end();
}
