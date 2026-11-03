import { checkOrigin,failure,HttpError,json } from "../../../../server/http";
import { profiles,interest } from "../../../../server/profiles";
import { messages } from "../../../../server/messages";
import { feed,socialRecord,createPost,postAction } from "../../../../server/social";
import { getMedia,uploadMedia,mediaStatus } from "../../../../server/media";
import { reviewAction } from "../../../../server/reviews";
import { realtimeTicket } from "../../../../server/realtime";
import { nearby,saveLocation } from "../../../../server/locations";
import { chatState } from "../../../../server/chat-state";
import { admin } from "../../../../server/admin";
import { blocks,report } from "../../../../server/safety";

async function handler(request:Request,context:{params:Promise<{path:string[]}>}) {
 try {
  const {path}=await context.params,route=path[0],method=request.method;
  if(method!=='GET')checkOrigin(request);
  if(route==='media-status'&&path.length===2&&method==='GET')return await mediaStatus(request,path[1]);
  if(route==='admin'&&path.length===2&&['GET','POST'].includes(method))return await admin(request,path[1]);
  if(route==='blocks'&&['GET','POST'].includes(method))return await blocks(request);
  if(route==='reports'&&method==='POST')return await report(request);
  if(route==='chat-state'&&method==='GET')return await chatState(request);
  if(route==='auth-options'&&method==='GET')return json({providers:{google:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET),facebook:Boolean(process.env.FACEBOOK_CLIENT_ID&&process.env.FACEBOOK_CLIENT_SECRET),apple:Boolean(process.env.APPLE_CLIENT_ID&&process.env.APPLE_CLIENT_SECRET),azure:Boolean(process.env.MICROSOFT_CLIENT_ID&&process.env.MICROSOFT_CLIENT_SECRET)}});
  if(route==='nearby'&&method==='GET')return await nearby(request);
  if(route==='location'&&['GET','PUT'].includes(method))return await saveLocation(request);
  if(route==='realtime-ticket'&&path.length===1&&method==='POST')return await realtimeTicket(request);
  if(route==='profiles'&&path.length===1&&method==='GET')return await profiles(request,'profiles');
  if(route==='profiles'&&path.length===2&&method==='GET')return await profiles(request,'profiles',path[1]);
  if(route==='me'&&path.length===1&&['GET','PUT'].includes(method))return await profiles(request,'me');
  if(route==='preferences'&&path.length===1&&method==='PUT')return await profiles(request,'preferences');
  if(route==='interests'&&path.length===1&&method==='POST')return await interest(request);
  if(route==='messages'&&path.length===2&&['GET','POST'].includes(method))return await messages(request,path[1]);
  if(route==='messages'&&path.length===3&&['read','typing'].includes(path[2])&&method==='POST')return await messages(request,path[1],path[2]);
  if(route==='feed'&&method==='GET')return await feed(request);
  if(route==='stories'&&method==='GET')return await feed(request,true);
  if(route==='social'&&path.length===2&&method==='GET')return await socialRecord(request,path[1]);
  if(route==='social'&&path.length===2&&method==='POST')return await reviewAction(request,path[1]);
  if(route==='posts'&&path.length===1&&method==='POST')return await createPost(request);
  if(route==='posts'&&path.length===2&&['PATCH','DELETE'].includes(method))return await postAction(request,path[1]);
  if(route==='media'&&path.length===1&&method==='POST')return await uploadMedia(request);
  if(route==='media'&&path.length===2&&method==='GET')return await getMedia(request,path[1]);
  if(route==='status'&&method==='GET')return json({configured:Boolean(process.env.DATABASE_URL&&process.env.BETTER_AUTH_SECRET&&process.env.APP_URL)});
  throw new HttpError(404,'Recurso no disponible.');
 }catch(error){return failure(error);}
}
export const GET=handler;
export const POST=handler;
export const PUT=handler;
export const PATCH=handler;
export const DELETE=handler;
