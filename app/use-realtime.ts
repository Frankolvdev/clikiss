"use client";
import {useEffect,useState} from "react";
import {send} from "./api-client";

export type ChatEvent={type:"message"|"account"|"sync"|"read"|"typing"|"call";targetId?:string;until?:string|null};
export function useRealtime(userId?:string){
 const [status,setStatus]=useState<"connecting"|"connected"|"offline">("connecting");
 useEffect(()=>{
  if(!userId)return;
  let stopped=false,socket:WebSocket|null=null,timer:ReturnType<typeof setTimeout>|undefined,attempt=0,connecting=false;
  const emit=(event:ChatEvent)=>window.dispatchEvent(new CustomEvent("conecta-chat-event",{detail:event}));
  const retry=()=>{if(stopped)return;setStatus("offline");clearTimeout(timer);timer=setTimeout(()=>void connect(),Math.min(30000,1000*2**Math.min(attempt++,5))+Math.random()*500);};
  async function connect(){
   if(stopped||connecting||socket?.readyState===WebSocket.OPEN||socket?.readyState===WebSocket.CONNECTING)return;
   if(!navigator.onLine){retry();return;}
   connecting=true;setStatus("connecting");
   try{
    const {ticket}=await send<{ticket:string}>("realtime-ticket",{});
    if(stopped)return;
    const configured=process.env.NEXT_PUBLIC_REALTIME_URL;
    const url=configured||(process.env.NODE_ENV==="production"?`${location.protocol==="https:"?"wss":"ws"}://${location.host}/realtime`:`${location.protocol==="https:"?"wss":"ws"}://${location.hostname}:3001/realtime`);
    const current=new WebSocket(url,["conecta-v1",ticket]);socket=current;
    const timeout=setTimeout(()=>current.close(),10000);
    current.onmessage=(message)=>{
     if(stopped||current!==socket)return;
     try{
      const event=JSON.parse(message.data);
      if(event.type==="ready"){clearTimeout(timeout);attempt=0;setStatus("connected");emit({type:"sync"});}
      else if(["message","account","sync","read","typing","call"].includes(event.type))emit(event);
     }catch{/* Ignore malformed frames. */}
    };
    current.onclose=(event)=>{clearTimeout(timeout);if(stopped||current!==socket)return;socket=null;if(event.code===4401){setStatus("offline");window.dispatchEvent(new Event("conecta-auth-required"));return;}retry();};
    current.onerror=()=>current.close();
   }catch{retry();}finally{connecting=false;}
  }
  const resume=()=>{if(stopped)return;if(socket?.readyState===WebSocket.OPEN)emit({type:"sync"});else{clearTimeout(timer);void connect();}};
  const visible=()=>{if(!document.hidden)resume();};
  timer=setTimeout(()=>void connect(),0);
  window.addEventListener("online",resume);document.addEventListener("visibilitychange",visible);
  return()=>{stopped=true;clearTimeout(timer);socket?.close();window.removeEventListener("online",resume);document.removeEventListener("visibilitychange",visible);};
 },[userId]);
 return status;
}
