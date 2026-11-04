import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {chromium} from 'playwright';
import {hashPassword} from 'better-auth/crypto';
import nextEnv from '@next/env';
import {callConfig} from '../shared/call-capacity.mjs';
import {iceConfiguration} from '../shared/video-calls.mjs';

nextEnv.loadEnvConfig(process.cwd(),true);
const origin=process.env.APP_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local test services only.');
const db=new Pool({connectionString:process.env.DATABASE_URL});
const users=[],contexts=[];
const relay=process.argv.includes('--relay');
await mkdir('.data/qa/video-calls',{recursive:true});
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??'msedge',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const password=`Video-${randomUUID()}!`;
const hash=await hashPassword(password);
try{
 for(let i=0;i<4;i++){
  const id=randomUUID(),email=`video-qa-${id}@example.test`;users.push(id);
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,`Video QA ${i+1}`,email]);
  await db.query('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),id,hash]);
  await db.query("INSERT INTO profiles(user_id,name,birth_date,published,synthetic) VALUES($1,$2,'1995-01-01',true,true)",[id,`Video QA ${i+1}`]);
  await db.query('INSERT INTO preferences(user_id) VALUES($1)',[id]);
  const context=await browser.newContext({viewport:{width:i===1?390:1440,height:1000},permissions:['camera','microphone']});contexts.push(context);
  await context.addInitScript(()=>{const Original=window.RTCPeerConnection;window.__callTestPeers=[];window.__callTestIceErrors=[];window.RTCPeerConnection=class extends Original{constructor(...args){super(...args);window.__callTestPeers.push(this);this.addEventListener('icecandidateerror',e=>window.__callTestIceErrors.push({code:e.errorCode,text:e.errorText}));}};});
  if(relay)await context.route('**/api/v1/calls?**',async route=>{
   const response=await route.fetch();const value=await response.json();
   if(value.rtc)value.rtc=iceConfiguration(callConfig({TURN_URLS:'turn:127.0.0.1:3479?transport=tcp',TURN_SHARED_SECRET:'a'.repeat(64),VIDEO_CALL_FORCE_RELAY:'true'}),{id:value.call.id,created_at:value.call.createdAt},id);
   await route.fulfill({response,json:value});
  });
  let response;
  for(let attempt=0;attempt<6;attempt++){
   response=await context.request.post(origin+'/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}});
   if(response.status()!==429)break;
   const seconds=Number(response.headers()['retry-after'])||10;
   await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Math.max(1000,seconds*1000+250))));
  }
  assert(response.ok(),`Sign in failed: ${response.status()}`);
 }
 for(const other of [users[0],users[2]])await db.query("INSERT INTO conversations(id,user_low,user_high,kind) VALUES($1,LEAST($2::text,$3::text),GREATEST($2::text,$3::text),'direct')",[randomUUID(),other,users[1]]);
 await db.query("INSERT INTO conversations(id,user_low,user_high,kind) VALUES($1,LEAST($2::text,$3::text),GREATEST($2::text,$3::text),'direct')",[randomUUID(),users[2],users[3]]);
 const a=await contexts[0].newPage(),b=await contexts[1].newPage();
 const errors=[];for(const page of [a,b])page.on('pageerror',e=>errors.push(e.message));
 await Promise.all([a.goto(origin),b.goto(origin)]);
 await a.getByRole('button',{name:'Conexiones',exact:true}).click();
 await a.getByRole('button',{name:'Videollamada',exact:true}).waitFor();
 await a.getByRole('button',{name:'Videollamada',exact:true}).click();
 await b.getByRole('heading',{name:/^Video QA 1$/i}).waitFor({timeout:25000});
 await b.getByRole('button',{name:'Aceptar',exact:true}).click();
 await Promise.all([a.getByText('En llamada',{exact:true}).waitFor({timeout:35000}),b.getByText('En llamada',{exact:true}).waitFor({timeout:35000})]);
 for(const page of [a,b])await page.waitForFunction(()=>{const v=document.querySelector('.call-remote video');return v?.videoWidth>0&&v.currentTime>0.2;},{},{timeout:20000});
 let live;
 for(let attempt=0;attempt<40;attempt++){
  live=(await db.query("SELECT id,caller_route,callee_route FROM video_calls WHERE caller_id=$1 AND status='active'",[users[0]])).rows[0];
  if(live?.caller_route===(relay?'relay':'direct')&&live?.callee_route===(relay?'relay':'direct'))break;
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert(live);assert.equal(live.caller_route,relay?'relay':'direct');assert.equal(live.callee_route,relay?'relay':'direct');
 const forbidden=await contexts[2].request.get(`${origin}/api/v1/calls?clientId=${randomUUID()}&callId=${live.id}`);assert.equal(forbidden.status(),404);
 const busy=await contexts[2].request.post(origin+'/api/v1/calls',{headers:{Origin:origin},data:{action:'start',clientId:randomUUID(),targetId:users[1]}});assert.equal(busy.status(),409);
 // Two independent media calls must coexist without taking over each other.
 const c=await contexts[2].newPage(),d=await contexts[3].newPage();
 await Promise.all([c.goto(origin),d.goto(origin)]);
 await c.getByRole('button',{name:'Conexiones',exact:true}).click();
 await c.locator('.conversation-person').filter({hasText:/Video QA 4/i}).click();
 await c.getByRole('button',{name:'Videollamada',exact:true}).click();
 await d.getByRole('button',{name:'Aceptar',exact:true}).waitFor({timeout:25000});await d.getByRole('button',{name:'Aceptar',exact:true}).click();
 await Promise.all([c.getByText('En llamada',{exact:true}).waitFor({timeout:35000}),d.getByText('En llamada',{exact:true}).waitFor({timeout:35000})]);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM video_calls WHERE caller_id=ANY($1::text[]) AND status='active'",[users])).rows[0].n,2);
 await c.getByRole('button',{name:'Finalizar llamada',exact:true}).click();await d.locator('.call-backdrop').waitFor({state:'hidden',timeout:15000});await c.close();await d.close();
 const wrongOrigin=await contexts[0].request.post(origin+'/api/v1/calls',{headers:{Origin:'https://other.example.test'},data:{action:'start',clientId:randomUUID(),targetId:users[1]}});assert.equal(wrongOrigin.status(),403);
 const otherTab=await contexts[0].newPage();await otherTab.goto(origin);await otherTab.getByText('Tu videollamada está abierta en otra pestaña.',{exact:false}).waitFor();assert.equal(await otherTab.locator('.call-backdrop').count(),0);await otherTab.close();
 await a.getByRole('button',{name:'Silenciar micrófono',exact:true}).click();await a.getByRole('button',{name:'Activar micrófono',exact:true}).waitFor();
 await a.getByRole('button',{name:'Apagar cámara',exact:true}).click();await a.getByRole('button',{name:'Activar cámara',exact:true}).waitFor();
 await a.getByRole('button',{name:'Activar cámara',exact:true}).click();await a.getByRole('button',{name:'Apagar cámara',exact:true}).waitFor();
 await a.getByRole('button',{name:'Cambiar cámara',exact:true}).click();await a.getByRole('button',{name:'Apagar cámara',exact:true}).waitFor();
 await a.screenshot({path:'.data/qa/video-calls/desktop.png'});await b.screenshot({path:'.data/qa/video-calls/mobile.png'});
 await a.getByRole('button',{name:'Finalizar llamada',exact:true}).click();
 await Promise.all([a.locator('.call-backdrop').waitFor({state:'hidden'}),b.locator('.call-backdrop').waitFor({state:'hidden',timeout:15000})]);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM video_call_slots WHERE user_id=ANY($1::text[])',[users])).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM video_call_signals WHERE call_id=$1',[live.id])).rows[0].n,0);
 // Reject a second invitation without opening camera or microphone.
 await a.getByRole('button',{name:'Videollamada',exact:true}).click();await b.getByRole('button',{name:'Rechazar',exact:true}).waitFor({timeout:25000});await b.getByRole('button',{name:'Rechazar',exact:true}).click();await a.locator('.call-backdrop').waitFor({state:'hidden',timeout:15000});
 // Permission denial must release the reservation and leave messaging usable.
 await a.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied by test','NotAllowedError');};});
 await a.getByRole('button',{name:'Videollamada',exact:true}).click();await a.getByText('Permite el acceso a la cámara y al micrófono para llamar.',{exact:true}).waitFor();
 assert.equal((await db.query('SELECT count(*)::int AS n FROM video_call_slots WHERE user_id=ANY($1::text[])',[users])).rows[0].n,0);
 await a.route('**/api/v1/calls?**',async route=>{
  const response=await route.fetch();const value=await response.json();await route.fulfill({response,json:{...value,available:false,message:'Las videollamadas no están disponibles en este momento. Puedes seguir escribiendo e intentarlo más tarde.'}});
 });
 await a.evaluate(()=>window.dispatchEvent(new CustomEvent('conecta-chat-event',{detail:{type:'sync'}})));
 await a.locator('.chat-call-action small').waitFor();assert(await a.getByRole('button',{name:'Videollamada',exact:true}).isDisabled());
 await a.getByRole('textbox',{name:'Escribe un mensaje'}).fill('El chat sigue disponible después de una llamada.');await a.getByRole('button',{name:'Enviar mensaje',exact:true}).click();
 for(let i=0;i<20;i++){if((await db.query('SELECT 1 FROM messages WHERE sender_id=$1 AND body=$2',[users[0],'El chat sigue disponible después de una llamada.'])).rowCount)break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert((await db.query('SELECT 1 FROM messages WHERE sender_id=$1 AND body=$2',[users[0],'El chat sigue disponible después de una llamada.'])).rowCount);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'passed',media:'synthetic cameras and microphones',layouts:['desktop','mobile viewport'],checks:['remote frames','two simultaneous calls','accept','reject','busy','unauthorized','origin','other tab','microphone','camera and switch','hangup','permission denial','slot and signal cleanup','unavailable notice','text chat still usable'],routes:live}));
}catch(error){
 for(const [i,context] of contexts.entries())for(const page of context.pages()){await page.screenshot({path:`.data/qa/video-calls/failure-${i}.png`}).catch(()=>{});console.log(JSON.stringify({page:i,notice:await page.locator('.call-notice').allTextContents(),dialogs:await page.locator('.call-heading').allTextContents(),buttons:await page.locator('.chat-call-action').allTextContents(),ice:await page.evaluate(async()=>({errors:window.__callTestIceErrors,peers:await Promise.all(window.__callTestPeers.map(async pc=>({state:pc.connectionState,candidates:[...(await pc.getStats()).values()].filter(s=>s.type==='local-candidate'||s.type==='remote-candidate'||s.type==='candidate-pair').map(s=>({type:s.type,candidateType:s.candidateType,state:s.state,protocol:s.protocol,bytesSent:s.bytesSent,bytesReceived:s.bytesReceived}))})))})).catch(()=>({}))}));}
 console.log(JSON.stringify({calls:(await db.query('SELECT status,end_reason,caller_id=ANY($1::text[]) AS own,caller_seen,callee_seen FROM video_calls WHERE caller_id=ANY($1::text[])',[users])).rows}));
 throw error;
}finally{
 await Promise.all(contexts.map(c=>c.close()));await browser.close();
 await db.query('DELETE FROM rate_limits WHERE actor_id=ANY($1::text[])',[users]);
 await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[users]);await db.end();
}
