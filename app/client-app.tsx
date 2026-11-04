"use client";

import {normalizePersonName} from "../shared/person-name.mjs";
import { useEffect, useState, useCallback, useRef, type FormEvent } from "react";
import {
  ArrowRight, Bell, Check, ChevronDown, Compass, Heart, HeartHandshake,
  LogIn, MapPin, MessageCircle, Search, Send, Settings2, ShieldCheck,
  Sparkles, UserRound, UserRoundPlus, X,
} from "lucide-react";
import NotificationCenter from "./notification-center";
import BrandLogo from "./brand-logo";
import SidebarAvatar from "./sidebar-avatar";
import AppSplash from './app-splash';
import {useProfileDirectory} from './use-profile-directory';
import './directory-loading.css';
import {VideoCallProvider} from './video-calls';
import LocationExplorer from "./location-explorer";
import LocationSearch from "./location-search";
import ChatThread from "./chat-thread";
import ChatContactHeader from "./chat-contact-header";
import './chat-layout.css';
import { chatContacts,mergeMessages } from "./chat-model";
import { useRealtime, type ChatEvent } from "./use-realtime";
import { api, send } from "./api-client";
import AuthProvider, { useAuth } from "./auth-context";
import SocialProfile from "./social-profile";
import SocialFeed from "./social-feed";
import { EmptyState, InterestTag, ProfilePhoto } from "./components";
import {
  emptyCurrentUser, type Message, type Profile,
} from "./data";

type Section = "discover" | "likes" | "matches" | "profile";
type Preferences = { minAge: number; maxAge: number; gender: string; location: string };


const initialPreferences: Preferences = { minAge: 18, maxAge: 99, gender: "Todos", location: "" };
function matchesCity(location:string,filter:string){
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(',')[0].trim().replace(/^cdmx$/,'ciudad de mexico');
 return normalize(location).includes(normalize(filter));
}

export default function ConectaApp() {
 const [contentReady,setContentReady]=useState(false);
 const onContentReady=useCallback(()=>setContentReady(true),[]);
 return <><AuthProvider><SessionContent onContentReady={onContentReady}/></AuthProvider><AppSplash ready={contentReady}/></>;
}

function SessionContent({onContentReady}:{onContentReady:()=>void}) {
  const { user, canUseAccount } = useAuth();
  return <VideoCallProvider key={`${user?.id ?? 'visitor'}:${canUseAccount}`} userId={canUseAccount?user?.id:undefined}><ConectaContent onContentReady={onContentReady}/></VideoCallProvider>;
}

function ConectaContent({onContentReady}:{onContentReady:()=>void}) {
  const { user, requireAccount, openAuth, signOut, canUseAccount } = useAuth();
  const realtimeStatus = useRealtime(canUseAccount ? user?.id : undefined);
  const {profiles:availableProfiles,setProfiles:setAvailableProfiles,status:directoryStatus,refresh:refreshDirectory}=useProfileDirectory(user?.id);
  useEffect(()=>{if(directoryStatus!=='loading')onContentReady();},[directoryStatus,onContentReady]);
  const [contactProfiles, setContactProfiles] = useState<Profile[]>([]);
  function navigate(id: Section) { if (id !== "discover" && !requireAccount()) return; setSection(id); }
  const [experience, setExperience] = useState<"connections" | "adventure" | "feed">("adventure");
  const [directIds, setDirectIds] = useState<string[]>([]);
  const [socialStoryId, setSocialStoryId] = useState("");
  const [socialProfileId, setSocialProfileId] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [section, setSection] = useState<Section>("discover");
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [passedIds, setPassedIds] = useState<string[]>([]);
  const [matchIds, setMatchIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const messageCache=useRef(messages);
  useEffect(()=>{messageCache.current=messages;},[messages]);
  const [currentUser, setCurrentUser] = useState<typeof emptyCurrentUser & {image?:string}>({ ...emptyCurrentUser, name: user?.user_metadata.display_name ?? user?.user_metadata.full_name ?? "" });
  const [preferences, setPreferences] = useState(initialPreferences);
  const [activeMatchId, setActiveMatchId] = useState("");
  const [chatDrafts,setChatDrafts]=useState<Record<string,string>>({});
  const [pendingContacts,setPendingContacts]=useState<Profile[]>([]);
  const [sendingTo,setSendingTo]=useState<string[]>([]);
  const sending=useRef(new Set<string>());
  const [toast, setToast] = useState("");
  const [geoProfiles,setGeoProfiles] = useState<Profile[]|null>(null);
  const [chatState,setChatState] = useState<{targetId:string;unread:number;preview:string|null}[]>([]);
  const [typingUntil,setTypingUntil] = useState<Record<string,string|null>>({});
  const [hasEarlier,setHasEarlier] = useState<Record<string,boolean>>({});
  const [loadingEarlier,setLoadingEarlier] = useState(false);
  const [alertsOpen,setAlertsOpen] = useState(false);
  const lastTyping=useRef(0),stopTyping=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const unreadCount=chatState.reduce((total,item)=>total+item.unread,0);
  const refreshChatState=useCallback(async()=>{setChatState(await api("chat-state"));},[]);



  const refreshAccount = useCallback(async () => {
    const state = await api<{profile: typeof currentUser; prefs: Preferences; likedIds:string[];passedIds:string[];matchIds:string[];directIds:string[];contacts:Profile[]}>("me");
    setCurrentUser(state.profile); setPreferences(state.prefs); setLikedIds(state.likedIds); setPassedIds(state.passedIds); setMatchIds(state.matchIds);setDirectIds(state.directIds);setContactProfiles(state.contacts);
  }, []);
  useEffect(() => {
    let active=true;
    if(canUseAccount) api<{profile:typeof currentUser;prefs:Preferences;likedIds:string[];passedIds:string[];matchIds:string[];directIds:string[];contacts:Profile[]}>("me").then((state)=>{if(!active)return;setCurrentUser(state.profile);setPreferences(state.prefs);setLikedIds(state.likedIds);setPassedIds(state.passedIds);setMatchIds(state.matchIds);setDirectIds(state.directIds);setContactProfiles(state.contacts);}).catch((error)=>{if(active)setToast(error.message);});
    return ()=>{active=false;};
  },[user?.id,canUseAccount]);
  useEffect(()=>{
    const changed=()=>{refreshDirectory();if(user)void refreshAccount().catch(()=>{});setGeoProfiles(null);};
    window.addEventListener("conecta-safety-update",changed);window.addEventListener("conecta-profile-update",changed);return()=>{window.removeEventListener("conecta-safety-update",changed);window.removeEventListener("conecta-profile-update",changed);};
  },[user,refreshAccount,refreshDirectory]);
  const matches=chatContacts(availableProfiles,[...pendingContacts,...contactProfiles],[...matchIds,...directIds,...pendingContacts.map(profile=>profile.id)]);
  const activeMatch=matches.find(profile=>profile.id===activeMatchId)??matches[0];
  const selectedChatId=activeMatch?.id??'';
  const chatDraft=chatDrafts[selectedChatId]??'';
  useEffect(() => {
    if(!canUseAccount)return;
    void api<typeof chatState>("chat-state").then(setChatState).catch(()=>{});
    let active=true,loading=false,queued=false;
    const refresh=async()=>{
      if(loading){queued=true;return;}loading=true;
      try{
        do{queued=false;
          if(section==="matches"&&selectedChatId){
            const items=await api<Message[]>(`messages/${encodeURIComponent(selectedChatId)}`),latestLength=items.length;
            const cached=messageCache.current[selectedChatId]??[],last=cached.at(-1),known=new Set(cached.map(item=>item.id));
            let page=items;
            // A reconnect can deliver more than one page. Fill the gap before merging snapshots.
            while(active&&last?.createdAt&&page.length===50&&!page.some(item=>known.has(item.id))&&page[0]?.createdAt&&page[0].createdAt>last.createdAt){
              const first=page[0],params=new URLSearchParams({before:first.createdAt!,beforeId:first.id});
              page=await api<Message[]>(`messages/${encodeURIComponent(selectedChatId)}?${params}`);items.unshift(...page);
            }
            if(active){setMessages((current)=>({...current,[selectedChatId]:mergeMessages(current[selectedChatId]??[],items)}));setHasEarlier((current)=>current[selectedChatId]===undefined?{...current,[selectedChatId]:latestLength===50}:current);}
          }
        }while(queued&&active);
      }catch(error){if(active)setToast((error as Error).message);}finally{loading=false;}
    };
    const changed=(event:Event)=>{
      const detail=(event as CustomEvent<ChatEvent>).detail;
      if(detail.type==='call')return;
      if(detail.type==="typing"){if(detail.targetId)setTypingUntil((current)=>({...current,[detail.targetId!]:detail.until??null}));return;}
      void refreshChatState().catch(()=>{});
      if(detail.type==="sync"||detail.type==="account")void refreshAccount().catch((error)=>{if(active)setToast(error.message);});
      if(detail.type==="sync"||detail.targetId===selectedChatId)void refresh();
      if(detail.type==="message"&&(document.hidden||section!=="matches"||detail.targetId!==selectedChatId)){
        setToast("Tienes un nuevo mensaje.");
        if("Notification" in window && Notification.permission==="granted"){
          try { const notification=new Notification("Nuevo mensaje en ClicKiss",{body:"Abre tus conversaciones para leerlo.",tag:`chat-${detail.targetId}`});
          notification.onclick=()=>{window.focus();if(detail.targetId)setActiveMatchId(detail.targetId);setSection("matches");notification.close();}; } catch { /* In-app alerts remain available. */ }
        }
      }
    };
    window.addEventListener("conecta-chat-event",changed);void refresh();
    return()=>{active=false;window.removeEventListener("conecta-chat-event",changed);};
  },[user,canUseAccount,section,selectedChatId,refreshAccount,refreshChatState]);

  useEffect(()=>()=>{clearTimeout(stopTyping.current);},[]);
  useEffect(()=>{clearTimeout(stopTyping.current);lastTyping.current=0;},[selectedChatId]);
  function updateDraft(text:string){
    if(!selectedChatId)return;setChatDrafts(current=>({...current,[selectedChatId]:text}));
    const notify=(value:boolean)=>void send(`messages/${encodeURIComponent(selectedChatId)}/typing`,{typing:value}).catch(()=>{});
    if(Date.now()-lastTyping.current>2000){lastTyping.current=Date.now();notify(Boolean(text.trim()));}
    clearTimeout(stopTyping.current);stopTyping.current=setTimeout(()=>notify(false),2500);
  }
  async function loadEarlier(){
    if(loadingEarlier||!selectedChatId)return;const first=messages[selectedChatId]?.[0];if(!first?.createdAt)return;
    setLoadingEarlier(true);
    try{const params=new URLSearchParams({before:first.createdAt,beforeId:first.id});const items=await api<Message[]>(`messages/${encodeURIComponent(selectedChatId)}?${params}`);setMessages((current)=>({...current,[selectedChatId]:mergeMessages(current[selectedChatId]??[],items)}));setHasEarlier((current)=>({...current,[selectedChatId]:items.length===50}));}catch(error){setToast((error as Error).message);}finally{setLoadingEarlier(false);}
  }
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const profiles = (geoProfiles??availableProfiles).filter((profile) =>
    profile.age >= preferences.minAge && profile.age <= preferences.maxAge &&
    (preferences.gender === "Todos" || profile.gender === preferences.gender) &&
    (geoProfiles !== null || !preferences.location || matchesCity(profile.location,preferences.location)) &&
    !likedIds.includes(profile.id) && !passedIds.includes(profile.id),
  );
  const likedProfiles = availableProfiles.filter((profile) => likedIds.includes(profile.id));
  const adventureProfiles = (geoProfiles??availableProfiles).filter((profile) =>
    profile.adventureAvailable &&
    profile.age >= preferences.minAge && profile.age <= preferences.maxAge &&
    (preferences.gender === "Todos" || profile.gender === preferences.gender) &&
    (geoProfiles !== null || !preferences.location || matchesCity(profile.location,preferences.location)),
  );
  const currentProfile = profiles[0];
  const socialPerson = socialProfileId === "me" ? { ...currentUser, id: "me", image: "" } : [...availableProfiles,...contactProfiles].find((profile) => profile.id === socialProfileId);

  async function like(profile: Profile) {
    if(!requireAccount())return;
    try {const result=await send<{match:boolean}>("interests",{targetId:profile.id,kind:"like"});await refreshAccount();if(result.match){setActiveMatchId(profile.id);setSection("matches");setToast(`Es un match con ${profile.name}.`);}else setToast(`Le diste like a ${profile.name}`);}catch(error){setToast((error as Error).message);}
  }

  async function openSocialProfile(id: string, storyId = "") {
    if (id === "me" && !requireAccount()) return;
    if(id !== "me" && !availableProfiles.some((item)=>item.id===id) && !contactProfiles.some((item)=>item.id===id)) {
      try{const profile=await api<Profile>(`profiles/${encodeURIComponent(id)}`);setAvailableProfiles((items)=>[...items.filter(item=>item.id!==profile.id),profile]);}catch(error){setToast((error as Error).message);return;}
    }
    setSocialStoryId(storyId);
    setSocialProfileId(id);
  }

  async function contactDirectly(profile: Profile) {
    if(!requireAccount())return;
    // Creating the conversation is authorized by the server when the first message is sent.
    setPendingContacts(items=>[...items.filter(item=>item.id!==profile.id),profile]);
    setActiveMatchId(profile.id);setSection("matches");
  }

  async function pass(profile: Profile) {
    if(!requireAccount())return;
    try{await send("interests",{targetId:profile.id,kind:"pass"});setPassedIds((items)=>[...items,profile.id]);}catch(error){setToast((error as Error).message);}
  }

  function updatePreference(key: keyof Preferences, value: string) {
    setPreferences((current) => ({
      ...current,
      [key]: key === "minAge" || key === "maxAge" ? Number(value) : value,
    }));
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!requireAccount()||!activeMatch||!chatDraft.trim())return;
    const targetId=activeMatch.id,draft=chatDraft;if(sending.current.has(targetId))return;
    sending.current.add(targetId);setSendingTo([...sending.current]);
    try{const items=await send<Message[]>(`messages/${encodeURIComponent(targetId)}`,{id:crypto.randomUUID(),text:draft.trim()});setMessages((current)=>({...current,[targetId]:mergeMessages(current[targetId]??[],items)}));setChatDrafts(current=>current[targetId]===draft?{...current,[targetId]:''}:current);clearTimeout(stopTyping.current);void send(`messages/${encodeURIComponent(targetId)}/typing`,{typing:false}).catch(()=>{});await refreshAccount();setPendingContacts(current=>current.filter(profile=>profile.id!==targetId));}catch(error){setToast((error as Error).message);}finally{sending.current.delete(targetId);setSendingTo([...sending.current]);}
  }
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!requireAccount())return;
    try{await send("me",currentUser,"PUT");await send("preferences",preferences,"PUT");setToast("Tu perfil y preferencias quedaron guardados.");}catch(error){setToast((error as Error).message);}
  }

  const navItems: { id: Section; label: string; icon: typeof Compass; badge?: number }[] = [
    { id: "discover", label: "Descubrir", icon: Compass },
    { id: "likes", label: "Me gustas", icon: Heart, badge: likedIds.length || undefined },
    { id: "matches", label: "Conexiones", icon: MessageCircle, badge: matches.length || undefined },
    { id: "profile", label: "Mi perfil", icon: UserRound },
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand mobile-brand" href="#inicio" aria-label="ClicKiss, inicio" onClick={(event) => { event.preventDefault(); setSection("discover"); }}>
          <BrandLogo />
        </a>
        <div className="topbar-center"><span className="live-dot" /> Tu conexión. Tu manera.</div>
        <div className="topbar-actions">
          
          <button className={`icon-button notification-trigger ${alertsOpen?"is-open":""}`} type="button" title="Notificaciones" aria-label="Notificaciones" aria-haspopup="dialog" aria-expanded={alertsOpen&&Boolean(user)} aria-controls={alertsOpen&&user?"notification-center":undefined} onClick={() => { if (requireAccount()) setAlertsOpen((value)=>!value); }}><Bell size={19} />{unreadCount>0&&<span className="unread-badge">{unreadCount>99?"99+":unreadCount}</span>}</button>
          {!user && <button className="topbar-login" type="button" onClick={() => openAuth("login")}><LogIn size={16} /> Iniciar sesión</button>}
          {!user && <button className="topbar-signup" type="button" onClick={() => openAuth("register")}><UserRoundPlus size={16} /> Crear cuenta</button>}{user && <button className="topbar-login" onClick={() => void signOut()}>Cerrar sesión</button>}
        </div>
      </header>

      {alertsOpen&&user&&<NotificationCenter items={chatState} contacts={contactProfiles} onClose={()=>setAlertsOpen(false)} onNotice={setToast} onOpen={id=>{setActiveMatchId(id);setSection("matches");setAlertsOpen(false);}}/>}
      <div className="app-body">
        <aside className="sidebar">
          <a className="sidebar-brand" href="#inicio" aria-label="ClicKiss, inicio" onClick={(event) => { event.preventDefault(); setSection("discover"); }}><BrandLogo /></a>
          <div className="sidebar-profile"><SidebarAvatar key={currentUser.image || "initial"} image={user ? currentUser.image : undefined} name={user ? (currentUser.name || user.user_metadata.display_name || user.user_metadata.full_name || user.email) : undefined}/><div className="sidebar-user-copy"><strong>{user ? (user.user_metadata.display_name ?? user.user_metadata.full_name ?? "Tu cuenta") : "Tu próxima conexión"}</strong><span>{user ? "Tu espacio personal" : "Explora y encuentra tu chispa"}</span></div></div>
          <span className="sidebar-label">MENÚ</span>
          <nav className="side-nav" aria-label="Navegación principal">
            {navItems.map(({ id, label, icon: Icon, badge }) => <button key={id} type="button" className={`nav-item ${section === id ? "active" : ""} ${!user && id !== "discover" ? "account-required" : ""}`} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span>{badge ? <span className="nav-badge">{badge}</span> : null}</button>)}
          </nav>
          <div className="sidebar-spacer" />
          <div className="safety-note"><div className="safety-icon"><ShieldCheck size={18} /></div><strong>Conexiones cuidadas</strong><p>Tu seguridad y privacidad importan. Comparte solo lo que te haga sentir bien.</p><button type="button" onClick={() => setToast("Comparte tus datos personales solo con personas de confianza.")}>Más información <ArrowRight size={13} /></button></div>
          <div className="sidebar-footer"><span className="footer-heart">♥</span> Hecho para conectar mejor</div>
        </aside>

        <section className="workspace">
          <div className="mobile-welcome"><span>{user ? "Hola, " + (user.user_metadata.display_name ?? user.user_metadata.full_name ?? "qué gusto verte") : "Encuentra tu próxima conexión"} <span className="wave">✦</span></span></div>
          {section === "discover" && <>
            <div className="experience-switch" role="group" aria-label="Elige tu experiencia">
              <button type="button" className={`experience-card experience-connections ${experience === "connections" ? "selected" : ""}`} aria-pressed={experience === "connections"} onClick={() => setExperience("connections")}><HeartHandshake size={19} /><span><strong>Conexiones</strong><small>Un match, algo especial</small></span></button>
              <button type="button" className={`experience-card experience-adventure ${experience === "adventure" ? "selected adventure" : ""}`} aria-pressed={experience === "adventure"} onClick={() => setExperience("adventure")}><Sparkles size={19} /><span><strong>Aventura</strong><small>Encuentros casuales, a tu ritmo</small></span></button>
              <button type="button" className={`experience-card experience-moments ${experience === "feed" ? "selected" : ""}`} aria-pressed={experience === "feed"} onClick={() => setExperience("feed")}><Compass size={19} /><span><strong>Momentos</strong><small>Historias y publicaciones</small></span></button>
            </div>
            {!user && <div className="guest-invitation"><div><strong>Explora a tu ritmo. Conecta cuando quieras.</strong><p>Crea tu cuenta para conversar, guardar tus favoritos y compartir momentos.</p></div><button type="button" onClick={() => openAuth("register")}>Crear mi cuenta <ArrowRight size={16} /></button></div>}
            {availableProfiles.length===0&&directoryStatus!=="ready"?<div className="directory-loading" role={directoryStatus==="error"?"alert":"status"}>{directoryStatus==="loading"&&<i className="directory-loading-indicator" aria-hidden="true"/>}<p>{directoryStatus==="loading"?"Estamos cargando los perfiles…":"No pudimos cargar los perfiles. Puedes volver a intentarlo sin recargar la página."}</p><button type="button" onClick={refreshDirectory}>{directoryStatus==="loading"?"Reintentar ahora":"Volver a intentar"}</button></div>:experience === "feed" ? <SocialFeed people={[...(user ? [{ id: "me", name: currentUser.name, image: "" }] : []), ...availableProfiles]} onOpen={openSocialProfile} /> : <>
            <LocationExplorer mode={experience} onOpen={openSocialProfile} onResults={(people)=>{setGeoProfiles(people);if(people)setAvailableProfiles((current)=>[...current.filter((item)=>!people.some((person)=>person.id===item.id)),...people]);}} />
            <div className="page-heading discover-heading"><div><div className="eyebrow"><Sparkles size={14} /> {experience === "connections" ? "CONEXIONES CON INTENCIÓN" : "ESPONTÁNEO. MUTUO. A TU RITMO."}</div><h1>{experience === "connections" ? <>Alguien que te <span>entienda.</span></> : <>Sigue la <span>chispa.</span></>}</h1><p>{experience === "connections" ? "Personas afines, conversaciones que fluyen y planes que sí suceden." : "Personas abiertas a encuentros casuales. Contacto directo, sin esperar un match."}</p></div><span className="text-action"><Sparkles size={16} /> Para ti</span></div>
            <div className="discovery-layout">
              <div className={`discovery-stage ${experience === "adventure" ? "adventure-stage" : ""}`}>
                {experience === "adventure" ? <>
                  <div className="adventure-intro"><ShieldCheck size={18} /><p>Encuentros entre adultos, sin pago. Los perfiles de esta sección aceptan recibir mensajes directos.</p></div>
                  {adventureProfiles.length ? <div className="adventure-grid">{adventureProfiles.map((profile) => <article className="person-tile adventure-tile" key={profile.id}>
                    <ProfilePhoto discovery profile={profile} className="adventure-photo"><div className="photo-shade" /><span className="available-badge"><Sparkles size={12} /> Abierto a conversar</span><div className="photo-caption"><button type="button" className="profile-name-link" onClick={() => openSocialProfile(profile.id)} aria-label={`Ver perfil de ${profile.name}`}><h2>{profile.name}, {profile.age}</h2></button><p><MapPin size={14} /> {profile.location}</p></div></ProfilePhoto>
                    <div className="person-tile-copy"><button type="button" className="social-open-link" onClick={() => openSocialProfile(profile.id)}>Ver perfil, fotos e historias <ArrowRight size={14} /></button><p className="adventure-bio">{profile.bio}</p><div className="tile-tags">{profile.interests.slice(0, 3).map((interest) => <InterestTag key={interest}>{interest}</InterestTag>)}</div><button className="direct-contact-button" type="button" onClick={() => contactDirectly(profile)}><MessageCircle size={16} /> Conversar <ArrowRight size={15} /></button></div>
                    <button type="button" className="adventure-profile-hit" aria-label={`Ver perfil completo de ${profile.name}`} onClick={() => openSocialProfile(profile.id)} />
                  </article>)}</div> : <EmptyState icon={<Search size={24} />} title="No hay perfiles con estas preferencias" description="Prueba otra ubicación o amplía tu rango de edad." action={<button type="button" className="secondary-button" onClick={() => setPreferences(initialPreferences)}>Restablecer filtros</button>} />}
                </> : currentProfile ? <>
                  <article className="profile-card-wrap" key={currentProfile.id}>
                    <div className="connection-actions-bar"><span>¿Hay conexión?</span><div className="action-row"><button type="button" className="pass-button" onClick={() => pass(currentProfile)} aria-label={`Pasar a ${currentProfile.name}`} title="Pasar"><X size={20} /></button><button type="button" className="like-button" onClick={() => like(currentProfile)}><Heart size={19} fill="currentColor" /> Me interesa</button></div></div>
                    <ProfilePhoto discovery profile={currentProfile} className="discovery-photo">
                      <div className="photo-shade" />
                      <div className="photo-topline"><span className="verified-label"><Check size={12} /> Conoce su perfil</span><span className="distance-label"><MapPin size={13} /> {currentProfile.distance != null ? `${currentProfile.distance} km` : "Zona privada"}</span></div>
                      <div className="photo-caption"><div className="profile-heading-line"><button type="button" className="profile-name-link" onClick={() => openSocialProfile(currentProfile.id)} aria-label={`Ver perfil de ${currentProfile.name}`}><h2>{currentProfile.name}, {currentProfile.age}</h2></button>{currentProfile.online && <span className="online-pill"><i /> En línea</span>}</div><p><MapPin size={15} /> {currentProfile.location}</p><div className="photo-interests">{currentProfile.interests.slice(0, 3).map((interest) => <InterestTag key={interest}>{interest}</InterestTag>)}</div></div>
                    </ProfilePhoto>
                    <div className="profile-card-footer"><span>Perfil <b>{availableProfiles.length - profiles.length + 1}</b> de {availableProfiles.length}</span><div className="card-progress"><i style={{ width: `${Math.max(14, ((availableProfiles.length - profiles.length + 1) / availableProfiles.length) * 100)}%` }} /></div><button type="button" className="skip-link" onClick={() => pass(currentProfile)}>Siguiente <ArrowRight size={14} /></button></div>
                  </article>
                  <div className="profile-detail-card"><div><button type="button" className="social-open-link" onClick={() => openSocialProfile(currentProfile.id)}>Ver perfil, fotos e historias <ArrowRight size={14} /></button><span className="detail-overline">UN POCO SOBRE {currentProfile.name.toUpperCase()}</span><p>{currentProfile.bio}</p></div></div>
                </> : <EmptyState icon={<Search size={24} />} title="No hay más perfiles por ahora" description="Amplía la edad o ubicación para seguir descubriendo personas." action={<button type="button" className="secondary-button" onClick={() => { setPreferences(initialPreferences); setPassedIds([]); }}>Ampliar búsqueda</button>} />}
              </div>
              <aside className={`filter-panel ${filtersOpen ? "filters-open" : ""}`}>
                <div className="panel-heading"><div><span className="panel-icon"><Settings2 size={17} /></span><div><h2>Tus preferencias</h2><p>Ajusta tu búsqueda</p></div></div><Sparkles className="filter-sparkle" size={16} /></div>
                <button type="button" className="mobile-filter-toggle" aria-expanded={filtersOpen} aria-controls="discovery-filters" onClick={() => setFiltersOpen((open) => !open)}><Settings2 size={18} /><span><strong>Tus preferencias</strong><small>{preferences.location || "Todas las ubicaciones"} · {preferences.minAge}–{preferences.maxAge} años · {preferences.gender}</small></span><ChevronDown size={18} /></button>
                <div id="discovery-filters" className="filter-controls">
                <label className="field-label" htmlFor="location-filter">Ubicación</label><LocationSearch id="location-filter" value={preferences.location} onSelect={(value) => updatePreference("location", value)} />
                <div className="field-label age-label">Rango de edad <span>{preferences.minAge}–{preferences.maxAge}</span></div>
                <div className="range-fields"><label><span>Desde</span><select value={preferences.minAge} onChange={(event) => updatePreference("minAge", event.target.value)}>{[18, 20, 22, 24, 26, 28, 30, 32, 35].map((age) => <option key={age}>{age}</option>)}</select></label><label><span>Hasta</span><select value={preferences.maxAge} onChange={(event) => updatePreference("maxAge", event.target.value)}>{[25, 28, 30, 32, 35, 36, 40, 45, 50, 99].map((age) => <option key={age}>{age}</option>)}</select></label></div>
                <label className="field-label" htmlFor="gender-filter">Me interesa</label><div className="select-wrap"><select id="gender-filter" value={preferences.gender} onChange={(event) => updatePreference("gender", event.target.value)}><option>Todos</option><option>Mujer</option><option>Hombre</option><option value="No binario">Otra identidad de género (no binaria)</option></select><ChevronDown size={15} /></div>
                <div className="filter-divider" /><div className="filter-tip"><span><Heart size={15} /></span><p><strong>Sin prisa, con intención.</strong><br />Las mejores conexiones empiezan siendo tú.</p></div>
                </div>
              </aside>
            </div>
            <div className="discovery-footnote"><span><ShieldCheck size={14} /> Comunidad solo para mayores de 18 años</span><span>{experience === "adventure" ? adventureProfiles.length : profiles.length} perfiles disponibles</span></div>
            </>}
          </>}

          {section === "likes" && <section className="content-view"><div className="page-heading"><div><div className="eyebrow"><Heart size={14} /> TU INTERÉS</div><h1>Me <span>gustan.</span></h1><p>Perfiles que te llamaron la atención.</p></div><span className="count-chip">{likedProfiles.length} perfiles</span></div>{likedProfiles.length ? <div className="people-grid">{likedProfiles.map((profile) => <article className="person-tile" key={profile.id}><ProfilePhoto profile={profile} className="person-tile-photo"><span className="tile-distance"><MapPin size={12} /> {profile.distance != null ? `${profile.distance} km` : "Zona privada"}</span></ProfilePhoto><div className="person-tile-copy"><button type="button" className="profile-name-link" onClick={() => openSocialProfile(profile.id)}><h2>{profile.name}, {profile.age}</h2></button><p><MapPin size={14} /> {profile.location}</p><div className="tile-tags">{profile.interests.slice(0, 2).map((interest) => <InterestTag key={interest}>{interest}</InterestTag>)}</div><button className="tile-message-button" type="button" onClick={() => profile.reciprocal && matches.some((match) => match.id === profile.id) ? (setActiveMatchId(profile.id), setSection("matches")) : setToast("Cuando el interés sea mutuo, podrán conversar aquí.")}><MessageCircle size={15} /> {matchIds.includes(profile.id) ? "Abrir conversación" : "Esperando conexión"}</button></div></article>)}</div> : <EmptyState icon={<Heart size={24} />} title="Todavía no hay likes" description="Cuando un perfil te interese, guárdalo aquí con un corazón." action={<button type="button" className="secondary-button" onClick={() => setSection("discover")}>Descubrir perfiles <ArrowRight size={15} /></button>} />}</section>}

          {section === "matches" && <section className="content-view"><div className="page-heading"><div><div className="eyebrow"><HeartHandshake size={15} /> ALGO EN COMÚN</div><h1>Tus <span>conexiones.</span></h1><p>El siguiente paso empieza con un hola.</p></div><span className="count-chip">{matches.length} conversaciones</span></div>{matches.length ? <div className="chat-layout"><div className="conversation-list"><div className="conversation-list-heading"><h2>Mensajes</h2><span>{matches.length}</span></div>{matches.map((profile) => <button key={profile.id} type="button" className={`conversation-person ${activeMatch?.id === profile.id ? "selected" : ""}`} onClick={() => setActiveMatchId(profile.id)}><ProfilePhoto profile={profile} className="conversation-avatar" /><span className="conversation-person-copy"><strong>{profile.name}</strong><span>{chatState.find((item)=>item.targetId===profile.id)?.preview ?? messages[profile.id]?.at(-1)?.text ?? "Preséntate y empieza a conversar"}</span></span>{Boolean(chatState.find((item)=>item.targetId===profile.id)?.unread)&&<span className="conversation-unread">{chatState.find((item)=>item.targetId===profile.id)?.unread}</span>}</button>)}</div><div className="chat-panel">{activeMatch && <><div className="chat-connection-status" role="status"><i className={realtimeStatus} />{realtimeStatus === "connected" ? "Chat en tiempo real" : realtimeStatus === "connecting" ? "Conectando al chat..." : "Reconectando al chat..."}</div><ChatContactHeader key={`header-${activeMatch.id}`} profile={activeMatch} isMatch={matchIds.includes(activeMatch.id)} liked={likedIds.includes(activeMatch.id)} onProfile={()=>openSocialProfile(activeMatch.id)} onLike={()=>like(activeMatch)}/><ChatThread key={`thread-${activeMatch.id}`} targetId={activeMatch.id} name={activeMatch.name} isMatch={matchIds.includes(activeMatch.id)} messages={messages[activeMatch.id]??[]} onEarlier={()=>void loadEarlier()} hasEarlier={Boolean(hasEarlier[activeMatch.id])} loading={loadingEarlier} typingUntil={typingUntil[activeMatch.id]}/><form className="chat-composer" onSubmit={sendMessage}><input aria-label="Escribe un mensaje" value={chatDraft} onChange={(event) => updateDraft(event.target.value)} placeholder={`Escribe algo bonito a ${activeMatch.name}...`} /><button type="submit" disabled={!chatDraft.trim()||sendingTo.includes(selectedChatId)} aria-label="Enviar mensaje"><Send size={17} /></button></form></>}</div></div> : <EmptyState icon={<MessageCircle size={24} />} title="Tu próxima conversación empieza aquí" description="Cuando tú y otra persona se gusten, su conexión aparecerá en este espacio." action={<button type="button" className="secondary-button" onClick={() => setSection("discover")}>Explorar perfiles <ArrowRight size={15} /></button>} />}</section>}

          {section === "profile" && <section className="content-view"><div className="page-heading"><div><div className="eyebrow"><UserRound size={14} /> TU HISTORIA</div><h1>Así te <span>presentas.</span></h1><p>Un perfil auténtico invita a una conexión auténtica.</p></div><button type="button" className="social-profile-launch" onClick={() => openSocialProfile("me")}><UserRound size={16} /> Mi perfil social</button></div><div className="profile-editor-layout"><form className="profile-form" onSubmit={saveProfile}><div className="form-section-title"><span className="editor-icon"><UserRound size={17} /></span><div><h2>Tu información</h2><p>Cuéntales un poco sobre ti.</p></div></div><div className="form-grid"><label className="form-field"><span>Nombre</span><input required maxLength={80} value={currentUser.name} onBlur={()=>setCurrentUser(user=>({...user,name:normalizePersonName(user.name)}))} onChange={(event) => setCurrentUser((user) => ({ ...user, name: event.target.value }))} /></label><label className="form-field"><span>Edad · Solo mayores de 18</span><input type="number" min="18" max="99" value={currentUser.age} onChange={(event) => setCurrentUser((user) => ({ ...user, age: Math.max(18, Number(event.target.value)) }))} /></label><label className="form-field"><span>Ubicación</span><input maxLength={50} value={currentUser.location} onChange={(event) => setCurrentUser((user) => ({ ...user, location: event.target.value }))} /></label><label className="form-field"><span>Identidad</span><select value={currentUser.gender} onChange={(event) => setCurrentUser((user) => ({ ...user, gender: event.target.value }))}><option>Mujer</option><option>Hombre</option><option value="No binario">Otra identidad de género (no binaria)</option><option>Prefiero no decirlo</option></select></label><label className="form-field full-field"><span>Mi descripción</span><textarea rows={4} maxLength={240} value={currentUser.bio} onChange={(event) => setCurrentUser((user) => ({ ...user, bio: event.target.value }))} /><small className="character-count">{currentUser.bio.length}/240</small></label><label className="form-field full-field"><span>Mis intereses · Sepáralos con comas</span><input value={currentUser.interests.join(", ")} onChange={(event) => setCurrentUser((user) => ({ ...user, interests: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} /></label></div><label className="availability-setting"><input type="checkbox" checked={currentUser.adventureAvailable} onChange={(event) => setCurrentUser((user) => ({ ...user, adventureAvailable: event.target.checked }))} /><span><strong>Disponible en Aventura</strong><small>Quiero aparecer en esta modalidad y recibir mensajes directos.</small></span></label><button type="submit" className="save-button"><Check size={17} /> Guardar cambios</button></form>
            <aside className="profile-preview"><div className="preview-kicker"><Sparkles size={14} /> VISTA PREVIA</div><div className="preview-card"><div className="preview-cover"><div className="preview-initial">{user ? (user.user_metadata.display_name ?? user.user_metadata.full_name ?? user.email ?? "T")[0]?.toUpperCase() : "✦"}</div></div><div className="preview-copy"><h2>{currentUser.name}, {currentUser.age}</h2><p><MapPin size={14} /> {currentUser.location}</p><p className="preview-bio">{currentUser.bio}</p><div className="tile-tags">{currentUser.interests.map((interest) => <InterestTag key={interest}>{interest}</InterestTag>)}</div></div></div><div className="privacy-note"><ShieldCheck size={16} /><span><strong>Tu información, bajo tu control.</strong> Tú decides qué compartir.</span></div><div className="preference-editor"><div className="form-section-title"><span className="editor-icon"><Settings2 size={17} /></span><div><h2>Preferencias</h2><p>A quién quieres conocer.</p></div></div><div className="range-fields"><label><span>Edad desde</span><select value={preferences.minAge} onChange={(event) => updatePreference("minAge", event.target.value)}>{[18, 20, 22, 24, 26, 28, 30, 32, 35].map((age) => <option key={age}>{age}</option>)}</select></label><label><span>Edad hasta</span><select value={preferences.maxAge} onChange={(event) => updatePreference("maxAge", event.target.value)}>{[25, 28, 30, 32, 35, 36, 40, 45, 50, 99].map((age) => <option key={age}>{age}</option>)}</select></label></div><label className="form-field"><span>Me interesa</span><select value={preferences.gender} onChange={(event) => updatePreference("gender", event.target.value)}><option>Todos</option><option>Mujer</option><option>Hombre</option><option value="No binario">Otra identidad de género (no binaria)</option></select></label><label className="form-field"><span>Ubicación</span><input value={preferences.location} onChange={(event) => updatePreference("location", event.target.value)} /></label></div></aside>
          </div></section>}

          <footer className="workspace-footer"><BrandLogo /><span><ShieldCheck size={13} /> Comunidad solo para mayores de 18 años</span></footer>
        </section>
      </div>

      <nav className="mobile-nav" aria-label="Navegación móvil">{navItems.map(({ id, label, icon: Icon, badge }) => <button key={id} type="button" className={section === id ? "active" : ""} onClick={() => navigate(id)} aria-label={label}><Icon size={21} /><span>{label}</span>{badge ? <i>{badge}</i> : null}</button>)}</nav>
      {socialPerson && <SocialProfile key={socialPerson.id} profile={socialPerson} initialStoryId={socialStoryId || undefined} contacts={matches} onClose={() => { setSocialProfileId(""); setSocialStoryId(""); }} onContact={socialPerson.id === "me" ? undefined : () => {
        if (!requireAccount()) return;
        const person = [...availableProfiles,...contactProfiles].find((profile) => profile.id === socialPerson.id);
        if (!person) return;
        if (matchIds.includes(person.id) || directIds.includes(person.id)) { setSocialProfileId("");setActiveMatchId(person.id); setSection("matches"); }
        else if (person.adventureAvailable) {setSocialProfileId("");void contactDirectly(person);}
        else {setToast("Primero necesitas un match en Conexiones para conversar.");return false;}
      }} />}
      {toast && <div className="toast-message" role="status"><span><Check size={15} /></span>{toast}<button type="button" onClick={() => setToast("")} aria-label="Cerrar notificación"><X size={15} /></button></div>}

    </main>
  );
}
