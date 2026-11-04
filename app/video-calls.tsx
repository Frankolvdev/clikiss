"use client";

import {createContext,useContext,useEffect,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {Video,VideoOff,Mic,MicOff,Phone,PhoneOff,SwitchCamera,X,Volume2} from 'lucide-react';
import {VideoCallController,EMPTY_CALL,type CallSnapshot} from './video-call-controller';

const CallContext=createContext<{controller:VideoCallController|null;state:CallSnapshot}>({controller:null,state:EMPTY_CALL});
const serverSnapshot=()=>EMPTY_CALL;
const emptySubscribe=()=>()=>{};

export function VideoCallProvider({userId,children}:{userId?:string;children:ReactNode}){
 const [controller]=useState(()=>userId?new VideoCallController(userId):null);
 const state=useSyncExternalStore(controller?.subscribe??emptySubscribe,controller?.getSnapshot??serverSnapshot,serverSnapshot);
 useEffect(()=>{controller?.mount();return()=>controller?.unmount();},[controller]);
 return <CallContext.Provider value={{controller,state}}>{children}{controller&&<CallOverlay controller={controller} state={state}/>}</CallContext.Provider>;
}

export function VideoCallButton({targetId}:{targetId:string}){
 const {controller,state}=useContext(CallContext);
 if(!controller)return null;
 return <div className="chat-call-action"><button type="button" className="call-start" disabled={state.busy||Boolean(state.call)||!state.available} onClick={()=>void controller.start(targetId)}><Video size={17}/>Videollamada</button>
 {!state.available&&<small role="status">Las videollamadas no están disponibles en este momento. Puedes seguir escribiendo e intentarlo más tarde.</small>}
 </div>;
}

function StreamVideo({stream,muted=false,className='',label}:{stream:MediaStream|null;muted?:boolean;className?:string;label:string}){
 const ref=useRef<HTMLVideoElement>(null);
 const [blocked,setBlocked]=useState(false);
 useEffect(()=>{
  const video=ref.current;if(!video)return;
  video.srcObject=stream;
  let active=true;
  if(stream)void video.play().then(()=>{if(active)setBlocked(false);}).catch(()=>{if(active)setBlocked(true);});
  return()=>{active=false;video.srcObject=null;};
 },[stream]);
 return <div className={className}><video ref={ref} autoPlay playsInline muted={muted} aria-label={label}/>{blocked&&<button className="call-play" onClick={()=>void ref.current?.play().then(()=>setBlocked(false))}><Volume2 size={18}/>Activar audio y video</button>}</div>;
}

function CallOverlay({controller,state}:{controller:VideoCallController;state:CallSnapshot}){
 const dialog=useRef<HTMLDivElement>(null);
 const call=state.call;
 const callId=call?.id;
 useEffect(()=>{
  if(!callId)return;
  const previous=document.activeElement as HTMLElement|null;
  dialog.current?.focus();
  const trap=(event:KeyboardEvent)=>{
   if(event.key!=='Tab')return;
   const items=dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');if(!items?.length)return;
   const first=items[0],last=items[items.length-1];
   if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',trap);
  return()=>{document.removeEventListener('keydown',trap);previous?.focus();};
 },[callId]);
 if(!call)return state.notice?<div className="call-notice" role="status"><span>{state.notice}</span><button aria-label="Cerrar aviso de llamada" onClick={()=>controller.dismiss()}><X size={16}/></button></div>:null;
 const incoming=call.incoming&&call.status==='ringing';
 const other=state.phase==='other-tab'&&!incoming;
 const phase=incoming?'Videollamada entrante':other?'Llamada abierta en otra pestaña':({calling:'Llamando…',connecting:'Conectando…',connected:'En llamada',reconnecting:'Recuperando conexión…'}[state.phase]??'Preparando llamada…');
 if(other)return <div className="call-notice" role="status">Tu videollamada está abierta en otra pestaña. Puedes seguir usando el chat aquí.</div>;
 const duration=`${Math.floor(state.seconds/60).toString().padStart(2,'0')}:${(state.seconds%60).toString().padStart(2,'0')}`;
 return <div className="call-backdrop"><div className="call-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="call-title">
  <header className="call-heading"><div><span>{phase}</span><h2 id="call-title">{call.name}</h2></div>{state.phase==='connected'&&<div className="call-duration" aria-label="Duración de la llamada">{duration}<small>{state.quality}</small></div>}</header>
  {!incoming&&!other&&<div className="call-stage"><StreamVideo stream={state.remote} className="call-remote" label="Video de tu contacto"/>{!state.remote&&<div className="call-waiting"><Video size={38}/><p>{phase}</p></div>}<StreamVideo stream={state.local} muted className={`call-local ${state.camera?'':'camera-off'}`} label="Tu cámara"/>{!state.camera&&<span className="call-audio-label">Tu cámara está apagada</span>}</div>}
  {(incoming||other)&&<div className="call-invitation"><Video size={44}/><p>{incoming?'Puedes aceptar o rechazar esta videollamada.': 'Continúa desde la pestaña donde iniciaste o aceptaste la llamada.'}</p></div>}
  {state.notice&&<p className="call-inline-notice" role="status">{state.notice}</p>}
  <div className="call-controls">
   {incoming?<><button className="call-accept" disabled={state.busy} onClick={()=>void controller.accept()}><Phone size={20}/>{state.busy?'Preparando…':'Aceptar'}</button><button className="call-end" disabled={state.busy} onClick={()=>void controller.end('rejected')}><PhoneOff size={20}/>Rechazar</button></>:!other?<>
    <button aria-label={state.mic?'Silenciar micrófono':'Activar micrófono'} aria-pressed={!state.mic} onClick={()=>controller.toggleMic()}>{state.mic?<Mic size={21}/>:<MicOff size={21}/>}</button>
    <button aria-label={state.camera?'Apagar cámara':'Activar cámara'} aria-pressed={!state.camera} onClick={()=>void controller.toggleCamera()}>{state.camera?<Video size={21}/>:<VideoOff size={21}/>}</button>
    <button aria-label="Cambiar cámara" disabled={!state.camera} onClick={()=>void controller.switchCamera()}><SwitchCamera size={21}/></button>
    <button className="call-end" aria-label="Finalizar llamada" onClick={()=>void controller.end(call.status==='ringing'?'cancelled':'ended')}><PhoneOff size={21}/>Finalizar</button>
   </>:<button onClick={()=>controller.dismiss()}>La llamada terminará al cerrar la otra pestaña</button>}
  </div>
  <p className="call-privacy">Llamada privada · Sin grabación · Calidad adaptable a tu conexión</p>
 </div></div>;
}
