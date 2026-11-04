import "server-only";
import {z} from 'zod';
import {database} from './db';
import {body,HttpError,json,requireUser} from './http';
import {allowRequest} from './access';
import {CallError,createCallService} from '../shared/video-calls.mjs';

const candidate=z.object({type:z.literal('candidate'),candidate:z.object({candidate:z.string().max(4096),sdpMid:z.string().max(256).nullable().optional(),sdpMLineIndex:z.number().int().min(0).max(128).nullable().optional(),usernameFragment:z.string().max(256).nullable().optional()})});
const description=z.object({type:z.enum(['offer','answer']),sdp:z.string().min(1).max(48000)});
const identity={clientId:z.uuid(),callId:z.uuid()};
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('start'),clientId:z.uuid(),targetId:z.string().min(1).max(128)}),
 z.object({action:z.literal('accept'),...identity}),
 z.object({action:z.literal('end'),...identity,reason:z.enum(['ended','cancelled','rejected','failed','permission-denied','connection-lost']).optional()}),
 z.object({action:z.literal('heartbeat'),...identity,connected:z.boolean(),route:z.enum(['unknown','direct','relay'])}),
 z.object({action:z.literal('signal'),...identity,id:z.uuid(),signals:z.array(z.union([candidate,description])).min(1).max(20)}),
]);
let instance:ReturnType<typeof createCallService>|undefined;
function service(){return instance??=createCallService(database());}
export async function videoCalls(request:Request){
 const user=await requireUser(request);
 try{
  if(request.method==='GET'){
   if(!await allowRequest('video-call-read',user.id,150))throw new HttpError(429,'Espera un momento para sincronizar la llamada.');
   const params=new URL(request.url).searchParams;
   const client=z.uuid().parse(params.get('clientId'));
   const callId=params.get('callId');if(callId)z.uuid().parse(callId);
   const after=z.string().regex(/^\d{1,16}$/).parse(params.get('after')??'0');
   return json(await service().state(user.id,client,callId??undefined,Number(after)));
  }
  const value=await body(request,schema);
  if(value.action==='start'&&!await allowRequest('video-call-start',user.id,8))throw new HttpError(429,'Espera un momento antes de volver a llamar.');
  return json(await service().act(user.id,value));
 }catch(error){if(error instanceof CallError)throw new HttpError(error.status,error.message);throw error;}
}
export async function videoCallMetrics(){
 await service().clean();
 const capacity=await service().availability();
 const stats=(await database().query(`SELECT count(*)::int AS active,
  count(*) FILTER(WHERE status='ringing')::int AS ringing,
  count(*) FILTER(WHERE caller_route='relay' OR callee_route='relay')::int AS relayed,
  count(*) FILTER(WHERE caller_route='direct' AND callee_route='direct')::int AS direct
  FROM video_calls WHERE status<>'ended'`)).rows[0];
 return {...stats,limit:capacity.limit,admitting:capacity.available,reason:capacity.reason,metrics:capacity.metrics};
}
