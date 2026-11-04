import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {chromium} from 'playwright';
import WebSocket from 'ws';
import {hashPassword} from 'better-auth/crypto';
import nextEnv from '@next/env';
import {registrationSettings,saveRegistrationSettings} from '../shared/registration-settings.mjs';
import {verifyAccount,accountMail} from './mail-test-helpers.mjs';

nextEnv.loadEnvConfig(process.cwd(),true);
const origin=process.env.APP_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local services only; start npm run dev:qa to isolate test mail.');
const db=new Pool({connectionString:process.env.DATABASE_URL});
const original=await registrationSettings(db),users=[],contexts=[],emails=[],diagnostics=[];
let revision=original.revision,adminId,ws;
const password=`Registration-${randomUUID()}!`,hash=await hashPassword(password);
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??'msedge',headless:true});
await mkdir('.data/qa/registration-settings',{recursive:true});
async function signIn(context,email){
 let response;
 for(let i=0;i<6;i++){
  response=await context.request.post(origin+'/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}});
  if(response.status()!==429)return response;
  await new Promise(resolve=>setTimeout(resolve,Math.min(30000,(Number(response.headers()['retry-after'])||10)*1000+250)));
 }
 return response;
}
try{
 for(const role of ['admin','moderator','member']){
  const id=randomUUID(),email=`settings-${id}@example.test`;users.push(id);if(role==='admin')adminId=id;
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,`Settings ${role}`,email]);
  await db.query('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),id,hash]);
  if(role!=='member')await db.query('INSERT INTO staff_roles VALUES($1,$2)',[id,role]);
  const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);
  assert.equal((await signIn(context,email)).status(),200);
 }
 for(const context of contexts.slice(1)){
  assert.equal((await context.request.get(origin+'/api/v1/admin/settings')).status(),403);
  assert.equal((await context.request.post(origin+'/api/v1/admin/settings',{headers:{Origin:origin},data:{requireEmailVerification:false,revision}})).status(),403);
 }
 if(!original.requireEmailVerification)revision=(await saveRegistrationSettings(db,adminId,true,revision)).revision;
 const page=await contexts[0].newPage();page.on('pageerror',e=>{if(diagnostics.length<8)diagnostics.push(e.message);});page.on('console',message=>{if(['warning','error'].includes(message.type())&&diagnostics.length<8)diagnostics.push(message.text());});await page.goto(origin+'/admin');await page.getByRole('button',{name:'Configuración',exact:true}).click();
 const toggle=page.getByRole('switch',{name:'Exigir verificación de correo',exact:true});await toggle.waitFor();
 assert.equal(await toggle.getAttribute('aria-checked'),'true');
 async function clickSwitch(expected){
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/v1/admin/settings')&&r.request().method()==='POST');
  await toggle.click();const response=await responsePromise;assert.equal(response.status(),200);const value=await response.json();revision=value.revision;assert.equal(value.requireEmailVerification,expected);
  await page.waitForFunction(required=>document.querySelector('[role="switch"]')?.getAttribute('aria-checked')===String(required),expected);
 }
 await clickSwitch(false);await page.screenshot({path:'.data/qa/registration-settings/off.png'});
 assert.equal((await (await contexts[0].request.get(origin+'/api/v1/auth-options')).json()).requireEmailVerification,false);
 const memberContext=await browser.newContext({viewport:{width:390,height:1000}});contexts.push(memberContext);
 const memberPage=await memberContext.newPage(),email=`settings-new-${randomUUID()}@example.test`;
 emails.push(email);
 await memberPage.goto(origin);await memberPage.getByRole('button',{name:'Crear cuenta',exact:true}).click();
 assert((await memberPage.title()).includes('CliKiss'));
 const consent=await memberPage.getByRole('checkbox',{name:'Confirmo que tengo 18 años o más.'}).boundingBox();assert(consent&&consent.width===18&&consent.height===18,'Age consent must stay 18px on mobile');
 await memberPage.screenshot({path:'.data/qa/registration-settings/register-mobile.png'});
 await memberPage.getByRole('textbox',{name:'Tu nombre',exact:true}).fill('Registro sin confirmación');await memberPage.getByRole('textbox',{name:'Correo electrónico',exact:true}).fill(email);
 await memberPage.getByLabel('Contraseña',{exact:true}).fill(password);await memberPage.getByRole('checkbox',{name:'Confirmo que tengo 18 años o más.'}).check();
 await memberPage.getByRole('dialog').getByRole('button',{name:'Crear mi cuenta',exact:true}).click();await memberPage.getByRole('dialog').waitFor({state:'hidden',timeout:15000});
 const registered=(await db.query('SELECT id,"emailVerified" FROM "user" WHERE email=$1',[email])).rows[0];assert(registered);users.push(registered.id);assert.equal(registered.emailVerified,false);
 assert.equal((await memberContext.request.get(origin+'/api/v1/me')).status(),200);
 const ticket=await memberContext.request.post(origin+'/api/v1/realtime-ticket',{headers:{Origin:origin},data:{}});assert.equal(ticket.status(),200);
 const token=(await ticket.json()).ticket;
 ws=new WebSocket(`ws://127.0.0.1:${process.env.REALTIME_PORT??3001}/realtime`,['conecta-v1',token],{origin});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Realtime did not connect.')),5000);ws.on('error',reject);ws.on('message',raw=>{if(JSON.parse(raw).type==='ready'){clearTimeout(timer);resolve();}});});
 const unreadInbox=await fetch('http://127.0.0.1:8025/api/v1/messages?limit=200').then(r=>r.json());assert(!unreadInbox.messages.some(m=>m.To.some(to=>to.Address===email)),'Disabled verification must not send mail.');
 let closed=false;ws.on('close',()=>{closed=true;});
 await clickSwitch(true);
 assert.equal((await memberContext.request.get(origin+'/api/v1/me')).status(),200);
 assert.equal((await memberContext.request.post(origin+'/api/v1/realtime-ticket',{headers:{Origin:origin},data:{}})).status(),200);
 assert.equal(closed,false);
 await memberPage.bringToFront();await memberPage.evaluate(()=>window.dispatchEvent(new Event('conecta-registration-settings')));
 assert.equal(await memberPage.getByRole('heading',{name:'Confirma tu correo.',exact:true}).count(),0);
 const fresh=await browser.newContext();contexts.push(fresh);const denied=await signIn(fresh,email);assert.equal(denied.status(),200);
 assert.equal((await fresh.request.get(origin+'/api/v1/me')).status(),200);
 assert.equal((await db.query('SELECT "emailVerificationRequired" FROM "user" WHERE id=$1',[registered.id])).rows[0].emailVerificationRequired,false);
 const requiredContext=await browser.newContext();contexts.push(requiredContext);
 const requiredEmail=`settings-confirm-${randomUUID()}@example.test`;
 emails.push(requiredEmail);
 const registration=await requiredContext.request.post(origin+'/api/auth/sign-up/email',{headers:{Origin:origin},data:{name:'Registro con confirmación',email:requiredEmail,password,emailVerificationRequired:false}});assert.equal(registration.status(),200);assert.equal((await registration.json()).token,null);
 users.push((await db.query('SELECT id FROM "user" WHERE email=$1',[requiredEmail])).rows[0].id);
 await accountMail(requiredEmail,'Confirma');assert.equal((await requiredContext.request.get(origin+'/api/v1/me')).status(),401);
 assert.equal((await signIn(requiredContext,requiredEmail)).status(),403);
 await clickSwitch(false);assert.equal((await signIn(requiredContext,requiredEmail)).status(),403);await clickSwitch(true);
 await verifyAccount(requiredEmail);assert.equal((await signIn(requiredContext,requiredEmail)).status(),200);
 assert((await db.query("SELECT 1 FROM audit_events WHERE actor_id=$1 AND action='settings.registration'",[adminId])).rowCount);
 await page.bringToFront();await page.reload();await page.getByRole('button',{name:'Configuración',exact:true}).click();assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'true');
 await page.screenshot({path:'.data/qa/registration-settings/on.png'});
 console.log('Configuración OK: switch persistente, permisos de administrador, registro sin correo, confirmación obligatoria, acceso HTTP/WebSocket, actualización de sesiones y auditoría.');
}catch(error){
 console.log(JSON.stringify({diagnostics}));
 for(const [i,context] of contexts.entries())for(const page of context.pages()){await page.screenshot({path:`.data/qa/registration-settings/failure-${i}.png`}).catch(()=>{});console.log(JSON.stringify({page:i,title:await page.title().catch(()=>''),errors:await page.locator('.admin-error,.admin-gate').allTextContents().catch(()=>[])}));}
 throw error;
}finally{
 ws?.close();await Promise.all(contexts.map(context=>context.close()));await browser.close();
 try{const current=await registrationSettings(db);if(adminId&&current.revision===revision&&current.requireEmailVerification!==original.requireEmailVerification)await saveRegistrationSettings(db,adminId,original.requireEmailVerification,revision);}
 finally{
  const extra=(await db.query('SELECT id FROM "user" WHERE email=ANY($1::text[])',[emails])).rows.map(r=>r.id);const all=[...new Set([...users,...extra])];
  await db.query('DELETE FROM audit_events WHERE actor_id=ANY($1::text[])',[all]);await db.query('DELETE FROM rate_limits WHERE actor_id=ANY($1::text[])',[all]);await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[all]);await db.end();
 }
}
