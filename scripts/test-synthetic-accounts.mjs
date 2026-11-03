import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {hashPassword} from 'better-auth/crypto';
import nextEnv from '@next/env';
import {processTestBatch,decryptTestCredential} from '../shared/test-accounts.mjs';
import {removeMedia} from '../shared/media-storage.mjs';
nextEnv.loadEnvConfig(process.cwd(),true);
const origin=process.env.APP_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error('Solo servicios locales.');
const db=new Pool({connectionString:process.env.DATABASE_URL}),id=randomUUID(),password=`Qa!${randomUUID()}`,email=`synthetic-qa-${randomUUID()}@example.test`;let batchId,cookie='';const objects=[];
async function call(route,method='GET',body,status=200){const response=await fetch(origin+route,{method,headers:{Origin:origin,Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const headers=response.headers.getSetCookie();if(headers.length)cookie=headers.map((value)=>value.split(';')[0]).join('; ');assert.equal(response.status,status,`${method} ${route}: ${response.status}`);return response;}
const realBefore=(await db.query('SELECT user_id FROM profiles WHERE NOT synthetic ORDER BY user_id')).rows.map((row)=>row.user_id);
try{
 await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,\'QA Temporal\',$2,true,now(),now())',[id,email]);
 await db.query('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),id,await hashPassword(password)]);
 await db.query("INSERT INTO staff_roles(user_id,role) VALUES($1,'admin')",[id]);
 await call('/api/auth/sign-in/email','POST',{email,password});
 const catalog=await (await call('/api/v1/admin/test-users')).json();assert(catalog.catalog.total>=400);
 batchId=(await (await call('/api/v1/admin/test-users','POST',{action:'create',label:'QA temporal eliminable',count:2,publications:3},202)).json()).id;
 for(let i=0;i<5;i++){await processTestBatch(db);const row=(await db.query('SELECT status FROM test_batches WHERE id=$1',[batchId])).rows[0];if(row.status==='ready')break;}
 const batch=(await db.query('SELECT * FROM test_batches WHERE id=$1',[batchId])).rows[0];assert.equal(batch.status,'ready');assert.equal(batch.created,2);
 const accounts=(await db.query('SELECT t.*,p.age,p.synthetic FROM test_accounts t JOIN LATERAL(SELECT synthetic,EXTRACT(YEAR FROM age(birth_date))::int AS age FROM profiles WHERE user_id=t.user_id)p ON true WHERE batch_id=$1 ORDER BY position',[batchId])).rows;assert.equal(accounts.length,2);assert(accounts.every((row)=>row.synthetic&&row.age>=26));
 const files=(await db.query('SELECT m.object_key,m.preview_key FROM media_assets m JOIN test_accounts t ON t.user_id=m.owner_id WHERE t.batch_id=$1',[batchId])).rows;for(const file of files)objects.push(file.object_key,file.preview_key);
 const posts=(await db.query('SELECT p.*,m.owner_id FROM posts p JOIN media_assets m ON m.id=p.media_id JOIN test_accounts t ON t.user_id=p.author_id WHERE t.batch_id=$1',[batchId])).rows;assert.equal(posts.length,3);assert(posts.every((post)=>post.owner_id===post.author_id));assert.equal(posts.filter((post)=>post.story).length,1);
 const credentials=decryptTestCredential(accounts[0].credential_cipher);assert(!accounts[0].credential_cipher.includes(credentials.password));
 const exported=await (await call('/api/v1/admin/test-users','POST',{action:'export',id:batchId})).text();assert(exported.includes(credentials.email)&&exported.includes(credentials.password));
 const adminCookie=cookie;await call('/api/auth/sign-out','POST',{});await call('/api/auth/sign-in/email','POST',credentials);
 await call('/api/v1/me');await call('/api/v1/admin/test-users','GET',null,403);
 cookie=adminCookie; // Administrative session remains valid; sign-out above revoked it, so sign in again.
 await call('/api/auth/sign-in/email','POST',{email,password});
 await call('/api/v1/admin/test-users','POST',{action:'delete-all',confirmation:'incorrecta'},400);
 await call('/api/v1/admin/test-users','POST',{action:'delete',id:batchId},202);
 for(let i=0;i<5;i++){await processTestBatch(db);if((await db.query('SELECT status FROM test_batches WHERE id=$1',[batchId])).rows[0].status==='deleted')break;}
 assert.equal((await db.query('SELECT count(*)::int AS n FROM test_accounts WHERE batch_id=$1',[batchId])).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM "user" WHERE id=ANY($1::text[])',[accounts.map((row)=>row.user_id)])).rows[0].n,0);
 assert.deepEqual((await db.query('SELECT user_id FROM profiles WHERE NOT synthetic ORDER BY user_id')).rows.map((row)=>row.user_id),realBefore);
 console.log('Cuentas sintéticas OK: catálogo 400, lotes, credenciales cifradas, login real, contenidos propios, permisos y eliminación sin tocar perfiles reales.');
}finally{
 if(batchId){await db.query("UPDATE test_batches SET status='deleting' WHERE id=$1 AND status<>'deleted'",[batchId]);for(let i=0;i<5;i++){if(!(await db.query('SELECT 1 FROM test_accounts WHERE batch_id=$1',[batchId])).rowCount)break;await processTestBatch(db);}await db.query('DELETE FROM test_batches WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM test_accounts WHERE batch_id=$1)',[batchId]);}
 await db.query('DELETE FROM audit_events WHERE actor_id=$1',[id]);await db.query('DELETE FROM "user" WHERE id=$1',[id]);
 for(const object of objects){await removeMedia(object).catch(()=>{});await db.query('DELETE FROM media_deletions WHERE object_key=$1',[object]);}await db.end();
}
