import {createHmac,randomUUID} from 'node:crypto';
import {callConfig,measureCallCapacity,capacityDecision} from './call-capacity.mjs';

export const CALL_UNAVAILABLE='Las videollamadas no están disponibles en este momento. Puedes seguir escribiendo e intentarlo más tarde.';
export class CallError extends Error {
 constructor(status,message){super(message);this.status=status;}
}
export function iceConfiguration(config,call,userId){
 const iceServers=config.stunUrls.length?[{urls:config.stunUrls}]:[];
 if(config.configured){
  const expiry=Math.floor(new Date(call.created_at).getTime()/1000)+config.maxMinutes*60+600;
  const username=`${expiry}:${call.id}:${userId}`;
  iceServers.push({urls:config.turnUrls,username,credential:createHmac('sha1',config.secret).update(username).digest('base64')});
 }
 return {iceServers,iceTransportPolicy:config.forceRelay?'relay':'all'};
}
export async function cleanupCalls(db,config=callConfig()){
 await db.query(`UPDATE video_calls v SET status='ended',ended_at=now(),end_reason=CASE
  WHEN EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=v.caller_id AND b.target_id=v.callee_id) OR (b.user_id=v.callee_id AND b.target_id=v.caller_id)) THEN 'blocked'
  WHEN v.status='ringing' THEN 'missed' ELSE 'connection-lost' END
  WHERE status<>'ended' AND (
   (status='ringing' AND created_at<now()-interval '45 seconds') OR
   (status='connecting' AND accepted_at<now()-interval '60 seconds') OR
   (status<>'ringing' AND (caller_seen<now()-interval '75 seconds' OR callee_seen<now()-interval '75 seconds')) OR
   created_at<now()-$1::int*interval '1 minute' OR
   EXISTS(SELECT 1 FROM profiles p WHERE p.user_id IN(v.caller_id,v.callee_id) AND p.suspended_at IS NOT NULL) OR
   EXISTS(SELECT 1 FROM "user" u WHERE u.id IN(v.caller_id,v.callee_id) AND u."emailVerificationRequired" AND NOT u."emailVerified") OR
   EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=v.caller_id AND b.target_id=v.callee_id) OR (b.user_id=v.callee_id AND b.target_id=v.caller_id))
  )`,[config.maxMinutes]);
 // Signals are transient and disappear on hangup; abandoned data is bounded as well.
 await db.query("DELETE FROM video_call_signals WHERE created_at<now()-interval '3 minutes'");
}

export function createCallService(db,{config=callConfig(),measure=()=>measureCallCapacity(config)}={}){
 let cleaned=0;
 async function clean(){if(Date.now()-cleaned>10000){cleaned=Date.now();try{await cleanupCalls(db,config);}catch(error){cleaned=0;throw error;}}}
 async function availability(executor=db){
  const [metrics,count]=await Promise.all([measure(),executor.query("SELECT count(*)::int AS active FROM video_calls WHERE status<>'ended'")]);
  const active=count.rows[0].active;
  return {...capacityDecision(config,metrics,active),active,limit:config.maxActive,metrics};
 }
 async function allowed(client,userId,targetId){
  const row=(await client.query(`SELECT c.id FROM conversations c WHERE
   c.user_low=LEAST($1::text,$2::text) AND c.user_high=GREATEST($1::text,$2::text)
   AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=$1 AND b.target_id=$2) OR (b.user_id=$2 AND b.target_id=$1))
   AND NOT EXISTS(SELECT 1 FROM profiles p WHERE p.user_id IN($1,$2) AND p.suspended_at IS NOT NULL)
   AND EXISTS(SELECT 1 FROM "user" u WHERE u.id=$2 AND (u."emailVerified" OR NOT u."emailVerificationRequired"))`,[userId,targetId])).rows[0];
  if(!row||userId===targetId)throw new CallError(403,'Necesitas una conversación autorizada para llamar. Envía primero un mensaje.');
  return row.id;
 }
 function view(row,userId,clientId){
  if(!row)return null;
  const caller=row.caller_id===userId;
  return {id:row.id,targetId:caller?row.callee_id:row.caller_id,name:row.target_name??'Tu contacto',incoming:!caller,status:row.status,
   controllable:(caller?row.caller_client:row.callee_client)===clientId,
   createdAt:row.created_at,startedAt:row.started_at,endReason:row.end_reason,
  };
 }
 async function state(userId,clientId,callId,after=0){
  await clean();
  const row=(await db.query(`SELECT v.*,u.name AS target_name FROM video_calls v
   JOIN "user" u ON u.id=CASE WHEN v.caller_id=$1 THEN v.callee_id ELSE v.caller_id END
   WHERE (v.caller_id=$1 OR v.callee_id=$1) AND
    (($2::uuid IS NOT NULL AND v.id=$2) OR ($2::uuid IS NULL AND v.status<>'ended'))
   ORDER BY v.created_at DESC LIMIT 1`,[userId,callId??null])).rows[0];
  if(callId&&!row)throw new CallError(404,'Llamada no disponible.');
  const call=view(row,userId,clientId);
  const signals=call?.controllable&&['connecting','active'].includes(call.status)?(await db.query(`SELECT seq::text,id,payload FROM video_call_signals WHERE call_id=$1 AND sender_id<>$2 AND seq>$3::bigint ORDER BY seq LIMIT 100`,[row.id,userId,String(after)])).rows:[];
  // Do not expose resource metrics or credentials until a call has been authorized.
  const capacity=call?{available:true}:await availability();
  return {call,signals,available:capacity.available,message:capacity.available?null:CALL_UNAVAILABLE,
   ...(call?.controllable&&call.status!=='ended'?{rtc:iceConfiguration(config,row,userId)}:{}),maxMinutes:config.maxMinutes};
 }
 async function act(userId,value){
  await clean();
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   if(value.action==='start'){
    await client.query('SELECT pg_advisory_xact_lock(73190230)');
    const conversation=await allowed(client,userId,value.targetId);
    if((await client.query('SELECT 1 FROM video_call_slots WHERE user_id=ANY($1::text[])',[[userId,value.targetId]])).rowCount)throw new CallError(409,'Tú o tu contacto ya tienen una llamada en curso.');
    const capacity=await availability(client);
    if(!capacity.available)throw new CallError(503,CALL_UNAVAILABLE);
    const id=randomUUID();
    await client.query(`INSERT INTO video_calls(id,conversation_id,caller_id,callee_id,caller_client) VALUES($1,$2,$3,$4,$5)`,[id,conversation,userId,value.targetId,value.clientId]);
    await client.query('INSERT INTO video_call_slots(user_id,call_id) VALUES($1,$3),($2,$3)',[userId,value.targetId,id]);
    await client.query('COMMIT');return {id};
   }
   const row=(await client.query('SELECT * FROM video_calls WHERE id=$1 AND (caller_id=$2 OR callee_id=$2) FOR UPDATE',[value.callId,userId])).rows[0];
   if(!row)throw new CallError(404,'Llamada no disponible.');
   const caller=row.caller_id===userId;
   if(row.status==='ended'){await client.query('COMMIT');return {ok:true,ended:true};}
   await allowed(client,userId,caller?row.callee_id:row.caller_id);
   if(value.action==='accept'){
    if(caller||row.status!=='ringing')throw new CallError(409,'La llamada ya fue atendida o terminó.');
    // The reservation already occupies capacity. Do not reject an accepted reserved call.
    await client.query("UPDATE video_calls SET status='connecting',accepted_at=now(),callee_seen=now(),callee_client=$2 WHERE id=$1",[row.id,value.clientId]);
   }else{
    if(value.action==='end'&&row.status==='ringing'&&!caller){
     await client.query("UPDATE video_calls SET status='ended',ended_at=now(),end_reason='rejected' WHERE id=$1",[row.id]);
    }else{
     if((caller?row.caller_client:row.callee_client)!==value.clientId)throw new CallError(409,'Esta llamada se está usando en otra pestaña.');
     if(value.action==='end')await client.query("UPDATE video_calls SET status='ended',ended_at=now(),end_reason=$2 WHERE id=$1",[row.id,value.reason??'ended']);
     else if(value.action==='heartbeat'){
      await client.query(`UPDATE video_calls SET ${caller?'caller_seen':'callee_seen'}=now(),${caller?'caller_route':'callee_route'}=$2,
       status=CASE WHEN $3 AND status='connecting' THEN 'active' ELSE status END,
       started_at=CASE WHEN $3 THEN COALESCE(started_at,now()) ELSE started_at END WHERE id=$1`,[row.id,value.route??'unknown',value.connected??false]);
     }else if(value.action==='signal'){
      if(!['connecting','active'].includes(row.status))throw new CallError(409,'Tu contacto todavía no acepta la llamada.');
      const budget=(await client.query('SELECT count(*)::int AS n,COALESCE(sum(octet_length(payload::text)),0)::int AS bytes FROM video_call_signals WHERE call_id=$1',[row.id])).rows[0];
      if(budget.n>=300||budget.bytes+Buffer.byteLength(JSON.stringify(value.signals))>524288)throw new CallError(429,'Demasiados intentos de conexión.');
      for(const signal of value.signals){
       if(signal.type==='offer'&&!caller||signal.type==='answer'&&caller)throw new CallError(403,'Señal no autorizada.');
      }
      await client.query('INSERT INTO video_call_signals(id,call_id,sender_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[value.id,row.id,userId,JSON.stringify(value.signals)]);
     }
    }
   }
   await client.query('COMMIT');return {ok:true};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 return {state,act,availability,clean};
}
