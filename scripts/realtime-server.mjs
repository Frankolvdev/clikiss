import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {Pool,Client} from 'pg';
import {WebSocketServer,WebSocket} from 'ws';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd(),process.env.NODE_ENV!=='production');
if(!process.env.DATABASE_URL||!process.env.APP_URL)throw new Error('Configura DATABASE_URL y APP_URL antes de iniciar WebSockets.');
const origin=new URL(process.env.APP_URL).origin;
const port=Number(process.env.REALTIME_PORT??3001);
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:5000,statement_timeout:10000});
const sockets=new Set();
pool.on('error',()=>{for(const socket of sockets)socket.close(1013,'Reconecta para sincronizar.');});
let stopping=false,listener=null,retryTimer=null;
let upgrading=0;
const server=createServer((_request,response)=>{response.writeHead(404);response.end();});
const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false,handleProtocols:()=> 'conecta-v1'});

function send(socket,event){if(socket.readyState!==WebSocket.OPEN)return;if(socket.bufferedAmount>64*1024){socket.close(1013,'Reconecta para sincronizar.');return;}socket.send(JSON.stringify(event));}
server.on('upgrade',async(request,connection,head)=>{
 connection.on('error',()=>{});
 const reject=()=>{if(!connection.destroyed){connection.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');connection.destroy();}};
 if(stopping||upgrading>=50||!['/realtime','/'].includes(request.url)||request.headers.origin!==origin||sockets.size>=2000)return reject();
 const protocols=(request.headers['sec-websocket-protocol']??'').split(',').map((item)=>item.trim());
 const token=protocols[1];
 if(protocols.length!==2||protocols[0]!=='conecta-v1'||!/^[A-Za-z0-9_-]{43}$/.test(token??''))return reject();
 upgrading++;
 try{
  const hash=createHash('sha256').update(token).digest('hex');
  // Atomic DELETE makes each ticket single use, even on multiple realtime processes.
  const result=await pool.query(`DELETE FROM realtime_tickets t USING session s
   WHERE t.token_hash=$1 AND t.expires_at>now() AND s.id=t.session_id AND s."expiresAt">now()
   RETURNING s.id AS session_id,s."userId" AS user_id`,[hash]);
  const identity=result.rows[0];if(!identity||connection.destroyed)return reject();
  wss.handleUpgrade(request,connection,head,(socket)=>{
   socket.identity=identity;socket.alive=true;sockets.add(socket);
   socket.on('pong',()=>{socket.alive=true;});
   socket.on('error',()=>{});
   socket.on('close',()=>sockets.delete(socket));
   // The durable POST endpoint is the only write path; clients cannot subscribe to arbitrary users.
   socket.on('message',()=>socket.close(1008,'Protocolo no permitido.'));
   send(socket,{type:'ready'});
  });
 }catch{reject();}finally{upgrading--;}
});

async function notify(notification){
 let event;try{event=JSON.parse(notification.payload);}catch{return;}
 if(!['message','account','typing','read'].includes(event.type)||typeof event.conversationId!=='string')return;
 try{
  const participants=(await pool.query(`SELECT c.user_low,c.user_high FROM conversations c WHERE c.id=$1 AND
   NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=c.user_low AND b.target_id=c.user_high) OR (b.user_id=c.user_high AND b.target_id=c.user_low))`,[event.conversationId])).rows[0];
  if(!participants)return;
  const recipients=[...sockets].filter((socket)=>[participants.user_low,participants.user_high].includes(socket.identity.user_id));
  if(!recipients.length)return;
  const sessions=new Set((await pool.query('SELECT id FROM session WHERE id=ANY($1::text[]) AND "expiresAt">now()',[recipients.map((socket)=>socket.identity.session_id)])).rows.map((row)=>row.id));
  const typing=event.type==='typing'?(await pool.query('SELECT user_id,expires_at FROM chat_typing WHERE conversation_id=$1',[event.conversationId])).rows:[];
  for(const socket of recipients){if(!sessions.has(socket.identity.session_id)){socket.close(4401,'Sesión finalizada.');continue;}const targetId=socket.identity.user_id===participants.user_low?participants.user_high:participants.user_low;send(socket,{type:event.type,targetId,...(event.type==='typing'?{until:typing.find((row)=>row.user_id===targetId)?.expires_at??null}:{})});}
 }catch{for(const socket of sockets)socket.close(1013,'Reconecta para sincronizar.');}
}

async function listen(){
 if(stopping)return;
 const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});listener=client;
 let failed=false;
 const disconnected=()=>{
  if(failed||stopping)return;failed=true;void client.end().catch(()=>{});
  for(const socket of sockets)socket.close(1013,'Reconecta para sincronizar.');
  retryTimer=setTimeout(()=>void listen(),2000);
 };
 client.on('error',disconnected);client.on('end',disconnected);client.on('notification',(event)=>void notify(event));
 try{await client.connect();await client.query('LISTEN conecta_chat');if(stopping)return;for(const socket of sockets)send(socket,{type:'sync'});}
 catch{disconnected();}
}
const heartbeat=setInterval(async()=>{
 try{
  const active=[...sockets];
  const sessions=new Set(active.length?(await pool.query('SELECT id FROM session WHERE id=ANY($1::text[]) AND "expiresAt">now()',[active.map((socket)=>socket.identity.session_id)])).rows.map((row)=>row.id):[]);
  for(const socket of active){if(!sessions.has(socket.identity.session_id)){socket.close(4401,'Sesión finalizada.');continue;}if(!socket.alive){socket.terminate();continue;}socket.alive=false;socket.ping();}
 }catch{for(const socket of sockets)socket.close(1013,'Reconecta para sincronizar.');}
},20000);

server.listen(port,process.env.REALTIME_HOST??'127.0.0.1',()=>console.log(`Chat WebSocket disponible en el puerto ${port}.`));
void listen();
async function shutdown(){if(stopping)return;stopping=true;clearInterval(heartbeat);clearTimeout(retryTimer);for(const socket of sockets)socket.close(1001,'Servidor reiniciándose.');server.close();wss.close();await listener?.end().catch(()=>{});await pool.end();process.exit(0);}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
