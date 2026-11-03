"use client";
import {useEffect,useRef,useState} from "react";
import {Check,CheckCheck,Heart} from "lucide-react";
import type {Message} from "./data";
import {send} from "./api-client";

export default function ChatThread({targetId,name,isMatch,messages,onEarlier,hasEarlier,loading,typingUntil}:{targetId:string;name:string;isMatch:boolean;messages:Message[];onEarlier:()=>void;hasEarlier:boolean;loading:boolean;typingUntil?:string|null}){
 const root=useRef<HTMLDivElement>(null),pinned=useRef(true),previousHeight=useRef(0),readId=useRef("");
 const [typing,setTyping]=useState(false);
 useEffect(()=>{
  const end=typingUntil?Date.parse(typingUntil):0;
  const start=setTimeout(()=>setTyping(end>Date.now()),0),finish=setTimeout(()=>setTyping(false),Math.max(0,end-Date.now()));
  return()=>{clearTimeout(start);clearTimeout(finish);};
 },[typingUntil]);
 useEffect(()=>{
  const element=root.current;if(!element)return;
  if(loading)previousHeight.current=element.scrollHeight;
  else if(previousHeight.current){element.scrollTop+=element.scrollHeight-previousHeight.current;previousHeight.current=0;}
  else if(pinned.current)element.scrollTop=element.scrollHeight;
 },[messages,loading]);
 useEffect(()=>{
  const mark=()=>{
   if(document.hidden||!document.hasFocus()||!pinned.current)return;
   const last=messages.filter((item)=>!item.fromMe).at(-1);if(!last||readId.current===last.id)return;
   readId.current=last.id;void send(`messages/${encodeURIComponent(targetId)}/read`,{messageId:last.id}).catch(()=>{readId.current="";});
  };
  mark();window.addEventListener("focus",mark);document.addEventListener("visibilitychange",mark);
  const element=root.current;element?.addEventListener("scroll",mark);
  return()=>{window.removeEventListener("focus",mark);document.removeEventListener("visibilitychange",mark);element?.removeEventListener("scroll",mark);};
 },[messages,targetId]);
 return <div ref={root} className="chat-messages" aria-label={`Mensajes con ${name}`} onScroll={(event)=>{const element=event.currentTarget;pinned.current=element.scrollHeight-element.scrollTop-element.clientHeight<90;if(element.scrollTop<30&&hasEarlier&&!loading)onEarlier();}}>
 {hasEarlier&&<button type="button" className="chat-earlier" disabled={loading} onClick={onEarlier}>{loading?"Cargando…":"Ver mensajes anteriores"}</button>}
 <div className="match-moment"><span className="match-moment-icon"><Heart size={16}/></span><strong>{isMatch?`Tú y ${name} se gustan`:`Conoce a ${name}`}</strong><span>{isMatch?"Una nueva conexión comienza.":"Contacto directo desde Aventura"}</span></div>
 {messages.map((message)=><div key={message.id} className={`message-row ${message.fromMe?"mine":"theirs"}`}><div className="message-bubble-wrap"><div className="message-bubble">{message.text}</div><span>{message.time}{message.fromMe&&(message.readAt?<CheckCheck size={14} aria-label="Leído" className="message-read"/>:<Check size={12} aria-label="Enviado"/>)}</span></div></div>)}
 {typing&&<div role="status" className="chat-typing"><i/><i/><i/>{name} está escribiendo…</div>}</div>;
}
