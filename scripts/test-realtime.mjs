import assert from 'node:assert/strict';
import {verifyAccount} from './mail-test-helpers.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';
import WebSocket from 'ws';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),true);
const origin=process.env.APP_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error('Estas pruebas requieren servicios locales.');
const endpoint=`ws://127.0.0.1:${process.env.REALTIME_PORT??3001}/realtime`;
const db=new Pool({connectionString:process.env.DATABASE_URL});
const users=[],sockets=[];
function client(){let cookie='';return async(path,{body,method='GET',status=200}={})=>{
 const request=()=>fetch(origin+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 let response=await request();
 for(let attempt=0;response.status===429&&attempt<2;attempt++){
  const seconds=Number(response.headers.get('retry-after'))||10;
  await response.arrayBuffer();
  await new Promise((resolve)=>setTimeout(resolve,Math.min(30000,Math.max(1000,seconds*1000+200))));
  response=await request();
 }
 const set=response.headers.getSetCookie();if(set.length)cookie=set.map((item)=>item.split(';')[0]).join('; ');
 const data=await response.json();assert.equal(response.status,status,`${path}: ${JSON.stringify(data)}`);return data;
};}
function event(socket,predicate,timeout=5000){return new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{cleanup();reject(new Error('No llegó el evento WebSocket esperado.'));},timeout);
 const message=(raw)=>{const value=JSON.parse(raw.toString());if(predicate(value)){cleanup();resolve(value);}};
 function cleanup(){clearTimeout(timer);socket.off('message',message);}
 socket.on('message',message);
});}
async function connect(ticket,source=origin){
 const socket=new WebSocket(endpoint,['conecta-v1',ticket],{origin:source});sockets.push(socket);socket.on('error',()=>{});
 const ready=event(socket,(value)=>value.type==='ready');await ready;return socket;
}
async function reject(ticket,source=origin){
 await new Promise((resolve,rejectPromise)=>{
  const socket=new WebSocket(endpoint,['conecta-v1',ticket],{origin:source});sockets.push(socket);
  const timer=setTimeout(()=>{socket.terminate();rejectPromise(new Error('No se rechazó el acceso inválido.'));},4000);
  socket.on('unexpected-response',(_request,response)=>{clearTimeout(timer);assert.equal(response.statusCode,401);response.resume();socket.terminate();resolve();});
  socket.on('error',()=>{});socket.on('open',()=>{clearTimeout(timer);socket.close();rejectPromise(new Error('Acceso inválido aceptado.'));});
 });
}
const a=client(),b=client(),c=client(),anonymous=client();
try{
 const suffix=randomUUID();
 for(const [call,name] of [[a,'A'],[b,'B'],[c,'C']]){
  const password=`Test-${randomUUID()}!`;
  const result=await call('/api/auth/sign-up/email',{method:'POST',body:{name:`WebSocket ${name}`,email:`ws-${name}-${suffix}@example.test`,password}});users.push(result.user.id);
  await verifyAccount(`ws-${name}-${suffix}@example.test`);await call('/api/auth/sign-in/email',{method:'POST',body:{email:`ws-${name}-${suffix}@example.test`,password}});
  await call('/api/v1/me');await call('/api/v1/me',{method:'PUT',body:{name:`WebSocket ${name}`,age:25,gender:'Prefiero no decirlo',location:'CDMX',bio:'',interests:[],adventureAvailable:true}});
 }
 await anonymous('/api/v1/realtime-ticket',{method:'POST',body:{},status:401});
 const ticketA=(await a('/api/v1/realtime-ticket',{method:'POST',body:{}})).ticket;
 await reject(ticketA,'https://other.example');
 const socketA=await connect(ticketA);
 await reject(ticketA); // Replay is not allowed.
 const socketB=await connect((await b('/api/v1/realtime-ticket',{method:'POST',body:{}})).ticket);
 const socketC=await connect((await c('/api/v1/realtime-ticket',{method:'POST',body:{}})).ticket);
 let unrelated=0;socketC.on('message',(raw)=>{if(JSON.parse(raw).type==='message')unrelated++;});
 const gotA=event(socketA,(value)=>value.type==='message'&&value.targetId===users[1]);
 const gotB=event(socketB,(value)=>value.type==='message'&&value.targetId===users[0]);
 const messageId=randomUUID();await a(`/api/v1/messages/${users[1]}`,{method:'POST',body:{id:messageId,text:'Entrega en tiempo real'}});
 await Promise.all([gotA,gotB]);assert.equal(unrelated,0);
 const history=await b(`/api/v1/messages/${users[0]}`);assert(history.some((row)=>row.id===messageId));
 const read=event(socketA,(value)=>value.type==='read'&&value.targetId===users[1]);
 await b(`/api/v1/messages/${users[0]}/read`,{method:'POST',body:{messageId}});await read;
 const typing=event(socketB,(value)=>value.type==='typing'&&value.targetId===users[0]&&Date.parse(value.until)>Date.now());
 await a(`/api/v1/messages/${users[1]}/typing`,{method:'POST',body:{typing:true}});await typing;

 // Reconnection backfills messages from PostgreSQL even if notifications were missed.
 socketB.close();await a(`/api/v1/messages/${users[1]}`,{method:'POST',body:{id:randomUUID(),text:'Mientras estaba desconectado'}});
 const replacement=await connect((await b('/api/v1/realtime-ticket',{method:'POST',body:{}})).ticket);
 assert.equal((await b(`/api/v1/messages/${users[0]}`)).length,2);
 const session=(await db.query('SELECT id FROM session WHERE "userId"=$1 LIMIT 1',[users[1]])).rows[0].id;
 const expired=(await b('/api/v1/realtime-ticket',{method:'POST',body:{}})).ticket;
 await db.query('UPDATE realtime_tickets SET expires_at=now()-interval \'1 second\' WHERE token_hash=$1',[createHash('sha256').update(expired).digest('hex')]);await reject(expired);
 const revoked=(await b('/api/v1/realtime-ticket',{method:'POST',body:{}})).ticket;
 let leaked=false;replacement.on('message',(raw)=>{if(JSON.parse(raw).type==='message')leaked=true;});
 await db.query('DELETE FROM session WHERE id=$1',[session]);
 await reject(revoked);
 const closed=new Promise((resolve,rejectPromise)=>{const timeout=setTimeout(()=>rejectPromise(new Error('Sesión revocada no cerró la conexión.')),5000);replacement.on('close',(code)=>{clearTimeout(timeout);assert.equal(code,4401);resolve();});});
 await a(`/api/v1/messages/${users[1]}`,{method:'POST',body:{id:randomUUID(),text:'No entregar a sesión revocada'}});await closed;assert.equal(leaked,false);
 console.log('WebSockets OK: autenticación, origen, tickets de un uso/caducados, entrega a ambas cuentas, aislamiento, reconexión e invalidación de sesión.');
}finally{
 for(const socket of sockets)socket.terminate();
 if(users.length)await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[users]);
 await db.end();
}
