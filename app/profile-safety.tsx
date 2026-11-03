"use client";
import {useEffect,useState,type FormEvent} from "react";
import {ShieldBan,Flag} from "lucide-react";
import {api,send} from "./api-client";
import {useAuth} from "./auth-context";
export default function ProfileSafety({profileId,onBlocked}:{profileId:string;onBlocked:()=>void}){
 const {requireAccount,user}=useAuth(),own=profileId==='me';
 const [blocked,setBlocked]=useState<{id:string;name:string}[]>([]),[reporting,setReporting]=useState(false),[reason,setReason]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(own&&user)void api<{id:string;name:string}[]>('blocks').then(setBlocked).catch(()=>{});},[own,user]);
 async function block(targetId:string,value:boolean){if(!requireAccount())return;setBusy(true);try{await send('blocks',{targetId,blocked:value});window.dispatchEvent(new CustomEvent('conecta-safety-update',{detail:{targetId,blocked:value}}));if(value)onBlocked();else setBlocked((items)=>items.filter((item)=>item.id!==targetId));}catch(err){setNotice((err as Error).message);}finally{setBusy(false);}}
 async function report(event:FormEvent){event.preventDefault();if(!requireAccount())return;setBusy(true);try{await send('reports',{targetUserId:profileId,reason});setReporting(false);setReason('');setNotice('Reporte enviado al equipo de moderación.');}catch(err){setNotice((err as Error).message);}finally{setBusy(false);}}
 return <section className="profile-safety">{own?<details><summary>Personas bloqueadas ({blocked.length})</summary>{blocked.map((person)=><div key={person.id}><span>{person.name}</span><button disabled={busy} onClick={()=>void block(person.id,false)}>Desbloquear</button></div>)}{!blocked.length&&<p>No tienes personas bloqueadas.</p>}</details>:<><button disabled={busy} onClick={()=>void block(profileId,true)}><ShieldBan size={15}/>Bloquear perfil</button><button onClick={()=>{if(requireAccount())setReporting((value)=>!value);}}><Flag size={15}/>Reportar perfil</button>{reporting&&<form onSubmit={(event)=>void report(event)}><label>¿Qué ocurrió?<textarea required minLength={5} maxLength={500} value={reason} onChange={(event)=>setReason(event.target.value)} /></label><button disabled={busy||reason.trim().length<5}>Enviar reporte</button></form>}</>}{notice&&<p role="status">{notice}</p>}</section>;
}
