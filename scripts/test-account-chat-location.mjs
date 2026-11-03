import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import nextEnv from '@next/env';
import {verifyAccount,accountMail} from './mail-test-helpers.mjs';
nextEnv.loadEnvConfig(process.cwd(),true);
const origin=process.env.APP_URL;
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error('Solo servicios locales.');
const db=new Pool({connectionString:process.env.DATABASE_URL}),users=[];
function client(){let cookie='';return async(path,{method='GET',body,status=200}={})=>{
 const request=()=>fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 let response=await request();for(let attempt=0;response.status===429&&attempt<2;attempt++){const wait=Number(response.headers.get('retry-after'))||10;await response.arrayBuffer();await new Promise((resolve)=>setTimeout(resolve,Math.min(30000,wait*1000+200)));response=await request();}
 const set=response.headers.getSetCookie();if(set.length)cookie=set.map((value)=>value.split(';')[0]).join('; ');
 const value=await response.json();assert.equal(response.status,status,`${path}: ${JSON.stringify(value)}`);return value;
};}
const a=client(),b=client(),guest=client(),suffix=randomUUID(),password=`Test-${randomUUID()}!`;
try{
 for(const [call,name] of [[a,'a'],[b,'b']]){
  const email=`features-${name}-${suffix}@example.test`,signup=await call('/api/auth/sign-up/email',{method:'POST',body:{name:'Persona de prueba',email,password}});users.push(signup.user.id);
  await call('/api/auth/sign-in/email',{method:'POST',body:{email,password},status:403});
  await verifyAccount(email);await call('/api/auth/sign-in/email',{method:'POST',body:{email,password}});
  await call('/api/v1/me');await call('/api/v1/me',{method:'PUT',body:{name:'Persona de prueba',age:27,location:'CDMX',gender:'Prefiero no decirlo',bio:'',interests:[],adventureAvailable:true}});
 }
 await b('/api/v1/location',{method:'PUT',body:{latitude:19.432678,longitude:-99.133456,label:'CDMX',visible:false}});
 let people=await a('/api/v1/nearby?lat=19.43&lng=-99.13&radius=10');assert(!people.some((person)=>person.id===users[1]));
 await b('/api/v1/location',{method:'PUT',body:{latitude:19.432678,longitude:-99.133456,label:'CDMX',visible:true}});
 people=await a('/api/v1/nearby?lat=19.43&lng=-99.13&radius=10');const person=people.find((value)=>value.id===users[1]);assert(person);assert.equal(person.latitude,19.43);assert.equal(person.longitude,-99.13);
 assert.equal((await a('/api/v1/nearby?lat=40&lng=-99&radius=2')).some((value)=>value.id===users[1]),false);
 await guest('/api/v1/nearby?lat=19&lng=-99',{status:401});await a('/api/v1/nearby?lat=999&lng=-99',{status:400});
 await a(`/api/v1/messages/${users[1]}`,{method:'POST',body:{id:randomUUID(),text:'Mensaje nuevo'}});
 let state=await b('/api/v1/chat-state');assert.equal(state.find((value)=>value.targetId===users[0]).unread,1);
 const history=await b(`/api/v1/messages/${users[0]}`);await b(`/api/v1/messages/${users[0]}/read`,{method:'POST',body:{messageId:history[0].id}});
 assert((await a(`/api/v1/messages/${users[1]}`))[0].readAt);
 state=await b('/api/v1/chat-state');assert.equal(state.find((value)=>value.targetId===users[0]).unread,0);
 await a(`/api/v1/messages/${users[1]}/typing`,{method:'POST',body:{typing:true}});
 const conversation=(await db.query('SELECT id FROM conversations WHERE user_low=LEAST($1::text,$2::text) AND user_high=GREATEST($1::text,$2::text)',users)).rows[0].id;
 assert.equal((await db.query('SELECT 1 FROM chat_typing WHERE conversation_id=$1 AND expires_at>now()',[conversation])).rowCount,1);
 // Equal timestamps must not drop records between history pages.
 const stamp='2026-10-18T12:00:00Z';for(let index=0;index<60;index++)await db.query('INSERT INTO messages(id,conversation_id,sender_id,body,created_at) VALUES($1,$2,$3,$4,$5)',[randomUUID(),conversation,users[0],`Anterior ${index}`,stamp]);
 const first=await b(`/api/v1/messages/${users[0]}`),cursor=first[0];const second=await b(`/api/v1/messages/${users[0]}?before=${encodeURIComponent(cursor.createdAt)}&beforeId=${cursor.id}`);
 assert.equal(new Set([...first,...second].map((value)=>value.id)).size,61);
 const email=`features-a-${suffix}@example.test`;
 await guest('/api/auth/request-password-reset',{method:'POST',body:{email,redirectTo:origin+'/?account=reset'}});
 const mail=await accountMail(email,'Restablece'),link=mail.Text.match(/https?:\/\/\S+/)?.[0];assert(link);
 const redirect=await fetch(link,{redirect:'manual'});assert.equal(redirect.status,302);const token=new URL(redirect.headers.get('location')).searchParams.get('token');assert(token);
 const nextPassword=`Changed-${randomUUID()}!`;await guest('/api/auth/reset-password',{method:'POST',body:{token,newPassword:nextPassword}});
 await a('/api/v1/me',{status:401});
 await guest('/api/auth/sign-in/email',{method:'POST',body:{email,password},status:401});await guest('/api/auth/sign-in/email',{method:'POST',body:{email,password:nextPassword}});
 await guest('/api/auth/reset-password',{method:'POST',body:{token,newPassword:password},status:400});
 console.log('Cuentas/chat/ubicación OK: correo confirmado, recuperación, token de un uso, sesiones revocadas, lecturas, escritura, paginación y radar privado con zonas aproximadas.');
}finally{
 if(users.length)await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[users]);await db.end();
}
