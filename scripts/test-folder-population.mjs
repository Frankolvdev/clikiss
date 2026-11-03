import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {Pool} from 'pg';
import {hashPassword} from 'better-auth/crypto';
import nextEnv from '@next/env';
import {chromium} from 'playwright';
import {populationCatalog} from '../shared/folder-population.mjs';
import {processTestBatch,decryptTestCredential} from '../shared/test-accounts.mjs';
import {removeMedia} from '../shared/media-storage.mjs';
nextEnv.loadEnvConfig(process.cwd(),true);
const origin=process.env.APP_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error('Solo servicios locales.');
const db=new Pool({connectionString:process.env.DATABASE_URL});
if((await db.query("SELECT 1 FROM test_batches WHERE source='folders' AND status<>'deleted'")).rowCount){await db.end();throw new Error('Ejecutar antes de crear el ambiente real para no modificarlo.');}
await mkdir('.data/qa',{recursive:true});const fixture=await mkdtemp(path.resolve('.data/qa/folder-fixture-')),previousRoot=process.env.TEST_USERS_ROOT;process.env.TEST_USERS_ROOT=fixture;
const actor=randomUUID(),email=`folder-qa-${randomUUID()}@example.test`,password=`Qa!${randomUUID()}`,realBefore=(await db.query('SELECT user_id FROM profiles WHERE NOT synthetic ORDER BY user_id')).rows.map((row)=>row.user_id);let cookie='',batchId,browser;const objects=[];
async function call(route,method='GET',body,status=200){const response=await fetch(origin+route,{method,headers:{Origin:origin,Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const cookies=response.headers.getSetCookie();if(cookies.length)cookie=cookies.map((value)=>value.split(';')[0]).join('; ');assert.equal(response.status,status,`${method} ${route}: ${response.status}`);return response;}
async function file(person,name,color){const target=path.join(fixture,person,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,await sharp({create:{width:40,height:48,channels:3,background:color}}).jpeg().toBuffer());}
async function run(){for(let attempt=0;attempt<12;attempt++){await processTestBatch(db);const batch=(await db.query('SELECT * FROM test_batches WHERE id=$1',[batchId])).rows[0];if(batch.status==='failed')throw new Error('Sincronización fallida');if(batch.status==='ready'||batch.status==='deleted')return batch;}throw new Error('No terminó la sincronización');}
try{
 await file('persona-0001','perfil.jpg','#ab3040');await file('persona-0001','publicacion/foto.jpg','#ab3041');await file('persona-0002','perfil.jpg','#3020ab');
 const first=await populationCatalog();assert.equal(first.length,500);assert.equal(first.filter((person)=>person.ready).length,2);assert(first.every((person)=>person.age>=18&&person.age<=31&&person.gender==='Mujer'));
 await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,\'QA Temporal\',$2,true,now(),now())',[actor,email]);
 await db.query('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),actor,await hashPassword(password)]);
 await db.query("INSERT INTO staff_roles(user_id,role) VALUES($1,'admin')",[actor]);await call('/api/auth/sign-in/email','POST',{email,password});
 const snapshot=await (await call('/api/v1/admin/test-users')).json();assert.equal(snapshot.catalog.total,500);assert.equal(snapshot.catalog.ready,51);
 const csv=await (await call('/api/v1/admin/test-users?catalog=csv')).text();assert.equal(csv.trim().split('\r\n').length,501);
 batchId=(await (await call('/api/v1/admin/test-users','POST',{action:'add-all'},202)).json()).id;
 await run();
 const before=(await db.query('SELECT t.user_id,t.population_key,t.credential_cipher,p.name,p.birth_date FROM test_accounts t JOIN profiles p ON p.user_id=t.user_id WHERE batch_id=$1 ORDER BY t.position',[batchId])).rows;assert.equal(before.length,2);
 const credential=decryptTestCredential(before[0].credential_cipher);
 await call('/api/v1/admin/test-users','POST',{action:'sync'},202);await run();
 assert.equal((await db.query('SELECT count(*)::int AS n FROM posts WHERE author_id=ANY($1::text[])',[before.map((row)=>row.user_id)])).rows[0].n,1);
 await file('persona-0003','perfil.jpg','#20ab34');await file('persona-0003','publicacion/foto.jpg','#20ab35');await file('persona-0001','publicacion/nueva.jpg','#ab3042');
 await call('/api/v1/admin/test-users','POST',{action:'sync'},202);await run();
 const after=(await db.query('SELECT t.user_id,t.population_key,t.credential_cipher,p.name,p.birth_date FROM test_accounts t JOIN profiles p ON p.user_id=t.user_id WHERE batch_id=$1 ORDER BY t.position',[batchId])).rows;assert.equal(after.length,3);assert.deepEqual(after.slice(0,2),before);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM posts WHERE author_id=ANY($1::text[])',[after.map((row)=>row.user_id)])).rows[0].n,4); // Three posts plus persona-0003's story.
 const ownership=(await db.query('SELECT 1 FROM posts p JOIN media_assets m ON m.id=p.media_id WHERE p.author_id<>m.owner_id')).rowCount;assert.equal(ownership,0);
 const adminCookie=cookie;await call('/api/auth/sign-in/email','POST',credential);await call('/api/v1/me');await call('/api/v1/admin/test-users','GET',null,403);cookie=adminCookie;
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});const signin=await context.request.post(origin+'/api/auth/sign-in/email',{data:{email,password},headers:{Origin:origin}});assert(signin.ok());const page=await context.newPage();await page.goto(origin+'/admin');await page.getByRole('button',{name:'Cuentas de prueba',exact:true}).click();await page.getByRole('heading',{name:'500 fichas fijas. Tu biblioteca, a tu ritmo.'}).waitFor();await page.getByText('51 mujeres disponibles',{exact:true}).waitFor();await page.screenshot({path:'.data/qa/folder-population-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.data/qa/folder-population-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await browser.close();browser=null;
 for(const row of (await db.query('SELECT object_key,preview_key FROM media_assets WHERE owner_id IN(SELECT user_id FROM test_accounts WHERE batch_id=$1)',[batchId])).rows)objects.push(row.object_key,row.preview_key);
 await call('/api/v1/admin/test-users','POST',{action:'delete-all',confirmation:'ELIMINAR CUENTAS DE PRUEBA'},202);assert.equal((await run()).status,'deleted');assert.equal((await db.query('SELECT count(*)::int AS n FROM test_accounts WHERE batch_id=$1',[batchId])).rows[0].n,0);
 assert.deepEqual((await db.query('SELECT user_id FROM profiles WHERE NOT synthetic ORDER BY user_id')).rows.map((row)=>row.user_id),realBefore);
 console.log('Carpetas OK: 500 fichas, edades estables 18–31, altas incrementales, contenidos propios, sincronización sin duplicados, login, permisos, backoffice móvil y borrado solo de pruebas.');
}finally{
 if(browser)await browser.close();
 if(batchId){await db.query("UPDATE test_batches SET status='deleting' WHERE id=$1 AND status<>'deleted'",[batchId]);for(let i=0;i<10;i++){await processTestBatch(db);if(!(await db.query('SELECT 1 FROM test_accounts WHERE batch_id=$1',[batchId])).rowCount)break;}await db.query('DELETE FROM test_batches WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM test_accounts WHERE batch_id=$1)',[batchId]);}
 await db.query('DELETE FROM audit_events WHERE actor_id=$1',[actor]);await db.query('DELETE FROM "user" WHERE id=$1',[actor]);
 for(const object of objects.filter(Boolean)){await removeMedia(object).catch(()=>{});await db.query('DELETE FROM media_deletions WHERE object_key=$1',[object]);}await db.end();
 if(path.dirname(path.resolve(fixture))!==path.resolve('.data/qa')||!path.basename(fixture).startsWith('folder-fixture-'))throw new Error('UNSAFE_FIXTURE_PATH');await rm(fixture,{recursive:true,force:true});
 if(previousRoot===undefined)delete process.env.TEST_USERS_ROOT;else process.env.TEST_USERS_ROOT=previousRoot;
}
