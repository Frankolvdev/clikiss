"use client";

import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {ArrowUpRight, Bell, BellRing, CheckCheck, MessageCircle, X} from "lucide-react";
import {ProfilePhoto} from "./components";
import type {Profile} from "./data";

type Alert = {targetId:string; unread:number; preview:string|null};
export default function NotificationCenter({items, contacts, onOpen, onClose, onNotice}:{
 items:Alert[]; contacts:Profile[]; onOpen:(id:string)=>void; onClose:()=>void; onNotice:(text:string)=>void;
}) {
 const [filter,setFilter]=useState<"all"|"unread">("all");
 const [permission,setPermission]=useState<NotificationPermission|"unsupported">(()=>typeof Notification==="undefined"?"unsupported":Notification.permission);
 const [requesting,setRequesting]=useState(false);
 const root=useRef<HTMLDivElement>(null);
 const unread=items.reduce((sum,item)=>sum+item.unread,0);
 const visible=items.filter(item=>(item.preview||item.unread>0)&&(filter==="all"||item.unread>0));
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow="hidden";root.current?.focus();
  return()=>{document.body.style.overflow=overflow;previous?.focus();};
 },[]);
 async function enable() {
  if(requesting||permission!=="default")return;
  setRequesting(true);
  try{const result=await Notification.requestPermission();setPermission(result);onNotice(result==="granted"?"Avisos del navegador activados.":"Puedes seguir viendo tus avisos aquí.");}
  catch{onNotice("No se pudieron activar los avisos. Tus notificaciones siguen disponibles aquí.");}
  finally{setRequesting(false);}
 }
 return createPortal(<div className="notification-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <div ref={root} className="notification-center" id="notification-center" role="dialog" aria-modal="true" aria-labelledby="notification-title" tabIndex={-1} onKeyDown={event=>{
   if(event.key==="Escape"){event.stopPropagation();onClose();}
   if(event.key==="Tab"){
    const nodes=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')??[]),first=nodes[0],last=nodes.at(-1);
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===root.current)){event.preventDefault();first?.focus();}
   }
  }}>
   <div className="notification-mobile-handle" aria-hidden="true"/>
   <header className="notification-heading"><div className="notification-heading-icon"><BellRing size={21}/></div><div><span>TU ACTIVIDAD</span><h2 id="notification-title">Notificaciones</h2></div><button type="button" aria-label="Cerrar notificaciones" onClick={onClose}><X size={19}/></button></header>
   <div className="notification-intro"><p>{unread?<>Tienes <strong>{unread} {unread===1?"mensaje nuevo":"mensajes nuevos"}</strong> por descubrir.</>:"Un lugar para tus próximas conversaciones."}</p><span className={unread?"has-new":""}>{unread?"NUEVO":"AL DÍA"}</span></div>
   <div className="notification-filters" role="group" aria-label="Filtrar notificaciones"><button type="button" aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>Todas</button><button type="button" aria-pressed={filter==="unread"} onClick={()=>setFilter("unread")}>Sin leer{unread>0&&<span>{unread>99?"99+":unread}</span>}</button></div>
   <div className="notification-list">
    {visible.length?<><div className="notification-list-label">CONVERSACIONES<span>{visible.length}</span></div>{visible.map(item=>{
     const person=contacts.find(contact=>contact.id===item.targetId),name=person?.name??"Una conexión";
     return <button type="button" className={`notification-row ${item.unread?"is-unread":""}`} key={item.targetId} onClick={()=>onOpen(item.targetId)}>
      <span className="notification-avatar">{person?.image?<ProfilePhoto profile={person} className="notification-person-photo"/>:<span className="notification-avatar-fallback">{name.charAt(0)}</span>}<i><MessageCircle size={11}/></i></span>
      <span className="notification-copy"><strong>{name}</strong><span>{item.preview||"Te envió un mensaje. Abre la conversación."}</span><small>{item.unread?`${item.unread} ${item.unread===1?"mensaje sin leer":"mensajes sin leer"}`:"Ver conversación"}</small></span>
      <span className="notification-row-end">{item.unread>0&&<i aria-label={`${item.unread} sin leer`}/>}<ArrowUpRight size={16}/></span>
     </button>;
    })}</>:<div className="notification-empty"><div><Bell size={34}/><span><CheckCheck size={17}/></span></div><h3>{filter==="unread"?"Estás al día":"Lo bueno está por llegar"}</h3><p>{filter==="unread"?"Ya revisaste tus mensajes. Aquí aparecerán los nuevos.":"Cuando alguien te escriba, encontrarás su mensaje en este espacio."}</p></div>}
   </div>
   <footer className="notification-footer"><span className="notification-footer-icon"><Bell size={17}/></span><div><strong>{permission==="granted"?"Avisos activados":permission==="denied"?"Avisos en este espacio":"Que no se te pase una conexión"}</strong><p>{permission==="granted"?"Recibirás avisos cuando llegue un mensaje.":permission==="denied"?"Puedes habilitar avisos en los ajustes del navegador.":permission==="unsupported"?"Tus mensajes estarán disponibles aquí.":"Activa los avisos de tu navegador."}</p></div>{permission==="default"&&<button type="button" disabled={requesting} onClick={()=>void enable()}>{requesting?"Activando…":"Activar"}</button>}</footer>
  </div>
 </div>,document.body);
}
