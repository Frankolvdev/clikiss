"use client";

export type VideoCall={id:string;targetId:string;name:string;incoming:boolean;controllable:boolean;status:'ringing'|'connecting'|'active'|'ended';createdAt:string;startedAt:string|null;endReason:string|null};
type Signal={type:'offer'|'answer';sdp:string}|{type:'candidate';candidate:RTCIceCandidateInit};
type StateResponse={call:VideoCall|null;signals:{seq:string;payload:Signal[]}[];available:boolean;message:string|null;rtc?:RTCConfiguration;maxMinutes:number};
export type CallSnapshot={call:VideoCall|null;phase:string;local:MediaStream|null;remote:MediaStream|null;mic:boolean;camera:boolean;available:boolean;notice:string;quality:string;seconds:number;busy:boolean;remotePlaying:boolean};
export const EMPTY_CALL:CallSnapshot={call:null,phase:'idle',local:null,remote:null,mic:true,camera:true,available:true,notice:'',quality:'720p adaptable',seconds:0,busy:false,remotePlaying:false};
const unavailable='Las videollamadas no están disponibles en este momento. Puedes seguir escribiendo e intentarlo más tarde.';
const endLabels:Record<string,string>={rejected:'Tu contacto rechazó la llamada.',missed:'No hubo respuesta.',cancelled:'Llamada cancelada.',failed:'No se pudo conectar la llamada.', 'permission-denied':'No se pudo acceder a la cámara o al micrófono.', 'connection-lost':'Se perdió la conexión de la llamada.',blocked:'La llamada ya no está disponible.',ended:'Llamada finalizada.'};

export class VideoCallController {
 private snapshot:CallSnapshot={...EMPTY_CALL};
 private listeners=new Set<()=>void>();
 private clientId=crypto.randomUUID();
 private callId:string|undefined;
 private cursor='0';
 private pc:RTCPeerConnection|null=null;
 private stream:MediaStream|null=null;
 private remoteStream:MediaStream|null=null;
 private pendingCandidates:RTCIceCandidateInit[]=[];
 private outbound:Signal[]=[];
 private signalTimer:ReturnType<typeof setTimeout>|undefined;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private heartbeat:ReturnType<typeof setInterval>|undefined;
 private statsTimer:ReturnType<typeof setInterval>|undefined;
 private disconnectTimer:ReturnType<typeof setTimeout>|undefined;
 private polling=false;
 private queued=false;
 private disposed=false;
 private preparing:Promise<void>|null=null;
 private mediaRequest:Promise<MediaStream>|null=null;
 private offered=false;
 private restarts=0;
 private route:'unknown'|'direct'|'relay'='unknown';
 private facing:'user'|'environment'='user';
 private badSamples=0;
 private goodSamples=0;
 private level=0;
 private received=new Set<string>();
 private endedIds=new Set<string>();
 private previousLoss:{lost:number;received:number}|null=null;
 constructor(private userId:string){}
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 getSnapshot=()=>this.snapshot;
 private update(value:Partial<CallSnapshot>){if(this.disposed)return;this.snapshot={...this.snapshot,...value};this.listeners.forEach(fn=>fn());}
 private async request<T>(value?:unknown,query=''):Promise<T>{
  const response=await fetch(`/api/v1/calls${query}`,{method:value?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(value?{body:JSON.stringify(value)}:{}),signal:AbortSignal.timeout(12000)});
  const result=await response.json();
  if(!response.ok){const error=new Error(result.message??unavailable) as Error&{status:number};error.status=response.status;throw error;}
  return result;
 }
 private command(value:Record<string,unknown>){return this.request<{ok:boolean}>({...value,clientId:this.clientId,callId:this.callId});}
 mount(){
  this.disposed=false;
  window.addEventListener('conecta-chat-event',this.onEvent);
  window.addEventListener('online',this.wake);
  window.addEventListener('pagehide',this.pagehide);
  document.addEventListener('visibilitychange',this.visible);
  this.heartbeat=setInterval(()=>{
   if(this.snapshot.call?.controllable&&this.callId)void this.command({action:'heartbeat',connected:this.pc?.connectionState==='connected',route:this.route}).catch(error=>{if(error.status===401||error.status===403)this.finishLocal('connection-lost');});
  },15000);
  this.statsTimer=setInterval(()=>{void this.stats();const start=this.snapshot.call?.startedAt;if(start)this.update({seconds:Math.max(0,Math.floor((Date.now()-Date.parse(start))/1000))});},1000);
  this.wake();
 }
 unmount(){this.pagehide();this.disposed=true;clearTimeout(this.timer);clearInterval(this.heartbeat);clearInterval(this.statsTimer);this.release();window.removeEventListener('conecta-chat-event',this.onEvent);window.removeEventListener('online',this.wake);window.removeEventListener('pagehide',this.pagehide);document.removeEventListener('visibilitychange',this.visible);}
 private visible=()=>{if(!document.hidden)this.wake();};
 private onEvent=(event:Event)=>{const type=(event as CustomEvent).detail?.type;if(type==='call'||type==='sync')this.wake();};
 private pagehide=()=>{
  if(this.callId&&this.snapshot.call?.controllable){const data={action:'end',reason:'connection-lost',clientId:this.clientId,callId:this.callId};navigator.sendBeacon('/api/v1/calls',new Blob([JSON.stringify(data)],{type:'application/json'}));}
  this.release();
 };
 private wake=()=>{clearTimeout(this.timer);void this.poll();};
 private async poll(){
  if(this.disposed)return;
  if(this.polling){this.queued=true;return;}
  this.polling=true;
  try{
   const params=new URLSearchParams({clientId:this.clientId,after:this.cursor,...(this.callId?{callId:this.callId}:{})});
   const result=await this.request<StateResponse>(undefined,`?${params}`);
   if(this.disposed)return;
   const call=result.call;
   if(call&&this.endedIds.has(call.id))return;
   if(call?.status==='ended'){this.finishLocal(call.endReason??'ended');return;}
   if(call){
    if(!this.callId){this.callId=call.id;this.cursor='0';this.received.clear();}
    this.update({call,available:true,...(this.pc?{}:{phase:call.incoming&&call.status==='ringing'?'incoming':call.controllable?'calling':'other-tab'})});
    if(call.controllable&&['connecting','active'].includes(call.status)&&result.rtc){
     await this.prepare(result.rtc);
     if(!this.pc||this.callId!==call.id)return;
     if(!call.incoming&&!this.offered){this.offered=true;await this.offer();}
     for(const item of result.signals){
      if(!this.received.has(item.seq)){for(const signal of item.payload)await this.receive(signal);this.received.add(item.seq);}
      this.cursor=item.seq;
     }
    }
   }else{this.update({available:result.available});}
  }catch(error){
   const status=(error as {status?:number}).status;
   if(this.callId&&(status===401||status===403||status===404))this.finishLocal('connection-lost');
   else if(!this.callId)this.update({available:false});
  }finally{
   this.polling=false;
   if(!this.disposed){const delay=this.queued?100:this.callId?(this.pc?.connectionState==='connected'?10000:1500):15000;this.queued=false;clearTimeout(this.timer);this.timer=setTimeout(()=>void this.poll(),delay);}
  }
 }
 async start(targetId:string){
  if(this.snapshot.busy||this.callId)return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){this.update({notice:'Tu navegador necesita HTTPS y acceso a cámara y micrófono para llamar.'});return;}
  this.update({busy:true,notice:''});
  try{
   const result=await this.request<{id:string}>({action:'start',clientId:this.clientId,targetId});
   if(this.disposed)return;
   this.callId=result.id;this.cursor='0';this.received.clear();
   await this.acquireMedia();
   this.wake();
  }catch(error){if(this.callId)await this.end('permission-denied');this.update({notice:(error as Error).message});}
  finally{this.update({busy:false});}
 }
 private async acquireMedia(){
  if(this.stream)return this.stream;
  if(this.mediaRequest)return this.mediaRequest;
  const id=this.callId;
  this.mediaRequest=(async()=>{
   let stream:MediaStream;
   try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:{width:{ideal:1280,max:1280},height:{ideal:720,max:720},frameRate:{ideal:30,max:30},facingMode:this.facing}});}
   catch(error){
    if(['NotFoundError','OverconstrainedError'].includes((error as Error).name))stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
    else throw new Error('Permite el acceso a la cámara y al micrófono para llamar.');
   }
   if(this.disposed||id!==this.callId){stream.getTracks().forEach(t=>t.stop());throw new Error('La llamada terminó.');}
   this.stream=stream;this.update({local:new MediaStream(stream.getTracks()),camera:stream.getVideoTracks().length>0,mic:true});return stream;
  })();
  try{return await this.mediaRequest;}finally{this.mediaRequest=null;}
 }
 async accept(){
  if(!this.callId||this.snapshot.busy)return;
  this.update({busy:true,notice:''});
  try{await this.acquireMedia();await this.command({action:'accept'});this.wake();}
  catch(error){await this.end('permission-denied');this.update({notice:(error as Error).message});}
  finally{this.update({busy:false});}
 }
 private async prepare(rtc:RTCConfiguration){
  if(this.pc)return;
  if(this.preparing)return this.preparing;
  this.preparing=(async()=>{
   const stream=await this.acquireMedia();if(this.disposed||!this.callId)return;
   const pc=new RTCPeerConnection({...rtc,bundlePolicy:'max-bundle'});this.pc=pc;
   this.update({phase:'connecting'});
   for(const track of stream.getAudioTracks())pc.addTrack(track,stream);
   if(stream.getVideoTracks().length)pc.addTrack(stream.getVideoTracks()[0],stream);
   else pc.addTransceiver('video',{direction:'sendrecv'});
   pc.onicecandidate=event=>{if(event.candidate)this.queueSignal({type:'candidate',candidate:event.candidate.toJSON()});};
   pc.ontrack=event=>{
    if(pc!==this.pc)return;
    const remote=this.remoteStream??=new MediaStream();if(!remote.getTracks().some(t=>t.id===event.track.id))remote.addTrack(event.track);
    event.track.onunmute=()=>{if(pc===this.pc)this.update({remote:new MediaStream(remote.getTracks()),remotePlaying:true});};
    this.update({remote:new MediaStream(remote.getTracks()),remotePlaying:true});
   };
   pc.onconnectionstatechange=()=>{
    if(pc!==this.pc)return;
    if(pc.connectionState==='connected'){
     clearTimeout(this.disconnectTimer);this.update({phase:'connected',notice:''});
     void this.setQuality(this.level);
     void this.command({action:'heartbeat',connected:true,route:this.route}).then(this.wake).catch(()=>{});
    }else if(['disconnected','failed'].includes(pc.connectionState)){
     this.update({phase:'reconnecting'});clearTimeout(this.disconnectTimer);
     this.disconnectTimer=setTimeout(()=>void this.recover(),8000);
    }
   };
   await this.setQuality(0);
  })();
  try{await this.preparing;}catch{await this.end('failed');this.update({notice:'No se pudo preparar la videollamada. Revisa los permisos y vuelve a intentarlo.'});}finally{this.preparing=null;}
 }
 private async offer(restart=false){
  const pc=this.pc;if(!pc)return;
  const offer=await pc.createOffer({iceRestart:restart});if(pc!==this.pc)return;
  await pc.setLocalDescription(offer);await this.signal([{type:'offer',sdp:pc.localDescription!.sdp}]);
 }
 private async recover(){
  if(!this.pc||this.pc.connectionState==='connected')return;
  if(!this.snapshot.call?.incoming&&this.restarts++<2){try{await this.offer(true);this.disconnectTimer=setTimeout(()=>void this.recover(),15000);return;}catch{/* End below. */}}
  if(this.snapshot.call?.incoming&&this.restarts++<2){this.disconnectTimer=setTimeout(()=>void this.recover(),15000);return;}
  await this.end('connection-lost');
 }
 private queueSignal(signal:Signal){this.outbound.push(signal);clearTimeout(this.signalTimer);this.signalTimer=setTimeout(()=>void this.flushSignals(),150);}
 private async flushSignals(){
  if(!this.callId||!this.outbound.length)return;
  const batch=this.outbound.splice(0,20);
  try{await this.signal(batch);if(this.outbound.length)this.signalTimer=setTimeout(()=>void this.flushSignals(),150);}
  catch{await this.end('connection-lost');}
 }
 private async signal(signals:Signal[]){
  const id=crypto.randomUUID(),callId=this.callId;
  for(let attempt=0;attempt<3;attempt++){
   try{await this.request({action:'signal',callId,clientId:this.clientId,id,signals});return;}
   catch(error){if(this.disposed||this.callId!==callId||attempt===2||[400,401,403,404,409].includes((error as {status:number}).status))throw error;await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));}
  }
 }
 private async receive(signal:Signal){
  const pc=this.pc;if(!pc)return;
  if(signal.type==='candidate'){
   if(pc.remoteDescription)await pc.addIceCandidate(signal.candidate).catch(()=>{});else this.pendingCandidates.push(signal.candidate);
  }else{
   await pc.setRemoteDescription({type:signal.type,sdp:signal.sdp});
   for(const candidate of this.pendingCandidates.splice(0))await pc.addIceCandidate(candidate).catch(()=>{});
   if(signal.type==='offer'){await pc.setLocalDescription(await pc.createAnswer());await this.signal([{type:'answer',sdp:pc.localDescription!.sdp}]);}
  }
 }
 async end(reason='ended'){
  const id=this.callId;
  this.finishLocal(reason);
  try{if(id)await this.request({action:'end',reason,callId:id,clientId:this.clientId});}catch{/* Lease expiry also releases abandoned calls. */}
  finally{this.wake();}
 }
 private finishLocal(reason:string){if(this.callId)this.endedIds.add(this.callId);this.release();this.callId=undefined;this.cursor='0';this.received.clear();this.update({call:null,phase:'idle',local:null,remote:null,seconds:0,busy:false,notice:endLabels[reason]??'Llamada finalizada.',quality:'720p adaptable'});}
 private release(){
  clearTimeout(this.signalTimer);clearTimeout(this.disconnectTimer);
  this.pc?.close();this.pc=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
  this.remoteStream?.getTracks().forEach(t=>t.stop());this.remoteStream=null;this.outbound=[];this.pendingCandidates=[];this.offered=false;this.restarts=0;this.previousLoss=null;this.badSamples=0;this.goodSamples=0;this.level=0;this.route='unknown';
 }
 toggleMic(){for(const track of this.stream?.getAudioTracks()??[])track.enabled=!this.snapshot.mic;this.update({mic:!this.snapshot.mic});}
 async toggleCamera(){
  const sender=this.pc?.getSenders().find(s=>s.track?.kind==='video')??this.pc?.getTransceivers().find(t=>t.receiver.track.kind==='video')?.sender;
  if(!this.stream)return;
  if(this.snapshot.camera){
   await sender?.replaceTrack(null).catch(()=>{});
   for(const track of this.stream.getVideoTracks()){track.stop();this.stream.removeTrack(track);}
   this.update({camera:false,local:new MediaStream(this.stream.getTracks()),quality:'Solo audio'});
  }else{
   try{
    const callId=this.callId;
    const video=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280,max:1280},height:{ideal:720,max:720},frameRate:{ideal:30,max:30},facingMode:this.facing}});
    if(callId!==this.callId||!this.stream){video.getTracks().forEach(t=>t.stop());return;}
    await sender?.replaceTrack(video.getVideoTracks()[0]);this.stream.addTrack(video.getVideoTracks()[0]);this.update({camera:true,local:new MediaStream(this.stream.getTracks())});await this.setQuality(this.level);
   }catch{this.update({notice:'No se pudo activar la cámara. Puedes continuar con audio.'});}
  }
 }
 async switchCamera(){if(!this.snapshot.camera)return;this.facing=this.facing==='user'?'environment':'user';await this.toggleCamera();await this.toggleCamera();}
 private async setQuality(level:number){
  this.level=level;
  const sender=this.pc?.getSenders().find(s=>s.track?.kind==='video');if(!sender)return;
  const [height,bitrate]=[[720,1500000],[480,800000],[360,350000]][level];
  const params=sender.getParameters();
  if(!params.encodings?.length)params.encodings=[{}];
  params.encodings[0].maxBitrate=bitrate;
  params.encodings[0].maxFramerate=level===0?30:24;
  params.encodings[0].scaleResolutionDownBy=Math.max(1,(sender.track?.getSettings().height??720)/height);
  try{await sender.setParameters(params);}catch{/* Native WebRTC congestion control remains available. */}
  this.update({quality:`${height}p adaptable`});
 }
 private lastStats=0;
 private async stats(){
  if(!this.pc||this.pc.connectionState!=='connected'||Date.now()-this.lastStats<5000)return;
  this.lastStats=Date.now();
  try{
   const pc=this.pc,report=await pc.getStats();if(pc!==this.pc)return;
   let bad=false,healthy=true,severe=false;
   report.forEach(row=>{
    if(row.type==='transport'&&row.selectedCandidatePairId){const pair=report.get(row.selectedCandidatePairId);if(pair){const local=report.get(pair.localCandidateId),remote=report.get(pair.remoteCandidateId);this.route=local?.candidateType==='relay'||remote?.candidateType==='relay'?'relay':'direct';}}
    if(row.type==='candidate-pair'&&row.state==='succeeded'&&row.nominated){
     if(row.availableOutgoingBitrate>0){bad ||=row.availableOutgoingBitrate<600000;healthy &&=row.availableOutgoingBitrate>1400000;severe ||=row.availableOutgoingBitrate<100000;}
     if(row.currentRoundTripTime>0.6){bad=true;healthy=false;}
    }
    if(row.type==='remote-inbound-rtp'&&row.kind==='video'){
     const previous=this.previousLoss;this.previousLoss={lost:row.packetsLost??0,received:row.packetsReceived??0};
     if(previous){const lost=Math.max(0,(row.packetsLost??0)-previous.lost),received=Math.max(0,(row.packetsReceived??0)-previous.received);if(lost/(lost+received||1)>0.08){bad=true;healthy=false;}}
    }
   });
   this.badSamples=bad?this.badSamples+1:0;this.goodSamples=healthy?this.goodSamples+1:0;
   if(this.snapshot.camera&&severe&&this.badSamples>=3){await this.toggleCamera();this.update({notice:'La conexión está limitada. Continuamos solo con audio; puedes volver a activar la cámara.'});}
   else if(this.snapshot.camera&&this.badSamples>=2&&this.level<2){this.badSamples=0;await this.setQuality(this.level+1);}
   else if(this.snapshot.camera&&this.goodSamples>=6&&this.level>0){this.goodSamples=0;await this.setQuality(this.level-1);}
  }catch{/* Stats are best effort on browsers with partial support. */}
 }
 dismiss(){this.update({notice:''});}
}
