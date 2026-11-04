"use client";
import {useState} from 'react';
import {Heart} from 'lucide-react';
import type {Profile} from './data';
import {ProfilePhoto} from './components';
import {VideoCallButton} from './video-calls';
import './chat-contact-header.css';

export default function ChatContactHeader({profile,isMatch,liked,onProfile,onLike}:{profile:Profile;isMatch:boolean;liked:boolean;onProfile:()=>void;onLike:()=>Promise<void>}){
 const [busy,setBusy]=useState(false);
 const available=profile.adventureAvailable;
 const status=isMatch?'Tu match':available?'Disponible para charlar o encuentros':liked?'En espera de match':'Aún no le has dado me gusta';
 async function like(){if(busy)return;setBusy(true);try{await onLike();}finally{setBusy(false);}}
 return <header className="chat-header">
  <ProfilePhoto profile={profile} className="chat-header-avatar"/>
  <div className="chat-contact-copy">
   <small className={`chat-contact-status ${isMatch?'matched':available?'available':'pending'}`} role="status">{status}</small>
   <button type="button" className="profile-name-link" onClick={onProfile}><strong>{profile.name} · Ver perfil</strong></button>
   {profile.online&&<span>En línea ahora</span>}
  </div>
  <div className="chat-contact-actions">
   {!isMatch&&!available&&!liked&&<button type="button" className="chat-like-action" disabled={busy} onClick={()=>void like()} aria-label={`Dar me gusta a ${profile.name}`}><Heart size={16}/>{busy?'Enviando…':'Me gusta'}</button>}
   <VideoCallButton targetId={profile.id}/>
  </div>
 </header>;
}
