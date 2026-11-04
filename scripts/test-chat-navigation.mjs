import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {chromium} from 'playwright';
import {hashPassword} from 'better-auth/crypto';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd(),true);
const origin=process.env.APP_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local services only.');
const db=new Pool({connectionString:process.env.DATABASE_URL}),ids=[randomUUID(),randomUUID(),randomUUID()],conversationIds=[randomUUID(),randomUUID()];
const password=`Chat-${randomUUID()}!`,hash=await hashPassword(password),email=`chat-navigation-${ids[0]}@example.test`,errors=[];
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??'msedge',headless:true});
await mkdir('.data/qa/chat-navigation',{recursive:true});
let releaseSend;
try{
 for(const [index,id] of ids.entries()){
  const name=['Mi Cuenta','Contacto Uno','Contacto Dos'][index];
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,name,index?`chat-navigation-${id}@example.test`:email]);
  await db.query('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),id,hash]);
  await db.query("INSERT INTO profiles(user_id,name,birth_date,published,adventure_available) VALUES($1,$2,'1995-01-01',true,true)",[id,name]);
  if(index)await db.query("INSERT INTO conversations(id,user_low,user_high,kind) VALUES($1,$2,$3,'direct')",[conversationIds[index-1],...[ids[0],id].sort()]);
 }
 // PostgreSQL microseconds must survive the history cursor, including pages inside one millisecond.
 for(let i=0;i<123;i++)await db.query("INSERT INTO messages(id,conversation_id,sender_id,body,created_at) VALUES($1,$2,$3,$4,'2026-01-01T12:00:00Z'::timestamptz+$5::int*interval '1 microsecond')",[randomUUID(),conversationIds[0],ids[1],`Historial ${String(i).padStart(3,'0')}`,i]);
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 let login;for(let i=0;i<6;i++){login=await context.request.post(origin+'/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}});if(login.status()!==429)break;await new Promise(resolve=>setTimeout(resolve,11000));}assert.equal(login.status(),200);
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&/same key|hydration/i.test(message.text()))errors.push(message.text());});
 await page.route('**/api/v1/profiles',async route=>{const response=await route.fetch();const profiles=await response.json();const duplicate=profiles.find(profile=>profile.id===ids[1]);await route.fulfill({response,json:[...profiles,...(duplicate?[duplicate]:[])]});});
 await page.goto(origin);await page.getByRole('button',{name:/Conexiones/}).first().click();
 const select=name=>page.locator('.conversation-person').filter({hasText:name}).click();
 await select('Contacto Uno');await page.getByText('Historial 122',{exact:true}).waitFor();await page.waitForFunction(()=>{const el=document.querySelector('.chat-messages');return el&&el.scrollHeight>el.clientHeight&&document.querySelectorAll('.message-row').length>=50;});
 assert.equal(await page.locator('.conversation-person').count(),2);if(await page.locator('.chat-header').count()!==1){await page.screenshot({path:'.data/qa/chat-navigation/duplicate.png'});console.log(await page.locator('.chat-header').evaluateAll(elements=>elements.map(el=>({html:el.outerHTML,parent:el.parentElement?.className}))));}assert.equal(await page.locator('.chat-header').count(),1);
 async function composerVisible(){const composer=await page.locator('.chat-composer').boundingBox(),panel=await page.locator('.chat-panel').boundingBox();assert(composer&&panel);assert(composer.y+composer.height<=panel.y+panel.height+1,'Composer is clipped');const metrics=await page.locator('.chat-messages').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,css:getComputedStyle(el).cssText,parent:el.parentElement.clientHeight,layout:el.parentElement.parentElement.clientHeight}));assert(metrics.height>50&&metrics.scroll>metrics.height,'History needs an internal scroll area: '+JSON.stringify(metrics));}
 await composerVisible();
 for(let i=0;i<4&&await page.locator('.message-row').count()<123;i++){await page.getByRole('button',{name:'Ver mensajes anteriores',exact:true}).click();await page.getByRole('button',{name:'Cargando…',exact:true}).waitFor({state:'hidden'});}
 assert.equal(await page.locator('.message-row').count(),123);assert.equal(await page.locator('.message-bubble').first().innerText(),'Historial 000');
 const input=page.getByRole('textbox',{name:'Escribe un mensaje',exact:true});await input.fill('Borrador del primer contacto');await select('Contacto Dos');assert.equal(await input.inputValue(),'');await input.fill('Borrador del segundo contacto');await select('Contacto Uno');assert.equal(await input.inputValue(),'Borrador del primer contacto');
 let intercepted;const started=new Promise(resolve=>{intercepted=resolve;});const held=new Promise(resolve=>{releaseSend=resolve;});
 await page.route(`**/api/v1/messages/${ids[1]}`,async route=>{if(route.request().method()==='POST'){intercepted();await held;}await route.continue();});
 await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await started;await select('Contacto Dos');releaseSend();
 await page.waitForResponse(response=>response.url().endsWith(`/messages/${ids[1]}`)&&response.request().method()==='POST');assert.equal(await input.inputValue(),'Borrador del segundo contacto');
 await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.locator('.message-bubble').getByText('Borrador del segundo contacto',{exact:true}).waitFor();
 assert.equal((await db.query('SELECT conversation_id FROM messages WHERE body=$1',['Borrador del primer contacto'])).rows[0].conversation_id,conversationIds[0]);assert.equal((await db.query('SELECT conversation_id FROM messages WHERE body=$1',['Borrador del segundo contacto'])).rows[0].conversation_id,conversationIds[1]);
 for(let i=0;i<8;i++){await select(i%2?'Contacto Uno':'Contacto Dos');assert.equal(await page.locator('.chat-header').count(),1);}
 await select('Contacto Uno');await context.setOffline(true);
 for(let i=0;i<65;i++)await db.query("INSERT INTO messages(id,conversation_id,sender_id,body,created_at) VALUES($1,$2,$3,$4,clock_timestamp()+$5::int*interval '1 microsecond')",[randomUUID(),conversationIds[0],ids[1],`Reconexión ${String(i).padStart(3,'0')}`,i]);
 await context.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new CustomEvent('conecta-chat-event',{detail:{type:'sync'}})));await page.locator('.message-bubble').getByText('Reconexión 064',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.message-row').length===189);assert.equal(await page.locator('.message-row').count(),189,'Reconnect must fill more than one page');
 await select('Contacto Uno');await page.screenshot({path:'.data/qa/chat-navigation/desktop.png'});await page.setViewportSize({width:390,height:844});await composerVisible();await page.screenshot({path:'.data/qa/chat-navigation/mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 // Remove the selected contact: header, history and composer must all fall back to the same remaining person.
 await db.query('INSERT INTO user_blocks(user_id,target_id) VALUES($1,$2)',[ids[0],ids[1]]);await page.evaluate(()=>window.dispatchEvent(new Event('conecta-safety-update')));await page.locator('.conversation-person').filter({hasText:'Contacto Uno'}).waitFor({state:'hidden'});await page.locator('.chat-header').getByText('Contacto Dos · Ver perfil',{exact:true}).waitFor();
 await input.fill('Después de retirar el contacto');await page.getByRole('button',{name:'Enviar mensaje',exact:true}).click();await page.locator('.message-bubble').getByText('Después de retirar el contacto',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);await context.close();console.log('Chat navigation OK: duplicate profiles, one header, 123 messages with microsecond cursors, per-contact drafts, send/switch race, selected-contact removal and visible composer on desktop/mobile.');
}finally{releaseSend?.();await browser.close();await db.query('DELETE FROM rate_limits WHERE actor_id=ANY($1::text[])',[ids]);await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[ids]);await db.end();}
