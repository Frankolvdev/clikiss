"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import {ShieldCheck,Users,Flag,Image as ImageIcon,History,LayoutDashboard,Search,ArrowLeft,LogOut} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import StaffSecurity from "./security";
import TestUsers from "./test-users";
import AuthProvider,{useAuth} from "../auth-context";
import {api,send} from "../api-client";
import "./admin.css";

type Row=Record<string,string|number|boolean|null>;
type Section='overview'|'users'|'posts'|'reports'|'audit'|'test-users';
export default function AdminPage(){return <AuthProvider><AdminSession /></AuthProvider>;}
function AdminSession(){const {user}=useAuth();return <Admin key={user?.id??"guest"}/>;}
function Admin(){
 const {user,ready,openAuth,signOut}=useAuth();
 const [role,setRole]=useState(''),[section,setSection]=useState<Section>('overview'),[counts,setCounts]=useState<Row>({}),[rows,setRows]=useState<Row[]>([]);
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [security,setSecurity]=useState(false),[factorEnabled,setFactorEnabled]=useState(false);
 const [action,setAction]=useState<Record<string,unknown>|null>(null),[reason,setReason]=useState('');
 const refresh=useCallback(async()=>{
  if(!user?.emailVerified)return;
  setLoading(true);setError('');
  try{const overview=await api<{role:string;counts:Row;requiresTwoFactor:boolean;twoFactorEnabled:boolean}>('admin/overview');setRole(overview.role);setCounts(overview.counts);setFactorEnabled(overview.twoFactorEnabled);if(overview.requiresTwoFactor){setSecurity(true);setRows([]);return;}
   if(section!=='overview'&&section!=='test-users')setRows(await api<Row[]>(`admin/${section}?${new URLSearchParams({q:search,page:String(page)})}`));
  }catch(err){setError((err as Error).message);}finally{setLoading(false);}
 },[user,section,search,page]);
 useEffect(()=>{const timer=setTimeout(()=>void refresh(),0);return()=>clearTimeout(timer);},[refresh]);
 async function submit(event:FormEvent){event.preventDefault();if(!action)return;setLoading(true);try{await send('admin/actions',{...action,reason});setAction(null);setReason('');await refresh();}catch(err){setError((err as Error).message);}finally{setLoading(false);}}
 const tabs=[{id:'overview',label:'Resumen',icon:LayoutDashboard},{id:'users',label:'Usuarios',icon:Users},{id:'reports',label:'Reportes',icon:Flag},...(role!=='support'?[{id:'posts',label:'Publicaciones',icon:ImageIcon}]:[]),...(role==='admin'?[{id:'test-users',label:'Cuentas de prueba',icon:Users},{id:'audit',label:'Auditoría',icon:History}]:[])];
 if(!ready)return <main className="admin-gate">Cargando administración…</main>;
 if(!user||!role)return <main className="admin-gate"><ShieldCheck size={36}/><h1>Administración de Conecta</h1><p>{error||'Inicia sesión con una cuenta autorizada para continuar.'}</p><button onClick={()=>openAuth('login')}>Iniciar sesión</button>{user&&<button onClick={()=>void signOut()}>Cerrar sesión</button>}<Link href="/">Volver a Conecta</Link></main>;
 return <main className="admin-shell"><aside className="admin-sidebar"><Link className="admin-brand" href="/"><ShieldCheck/>conecta<span>administración</span></Link><nav>{tabs.map(({id,label,icon:Icon})=><button key={id} className={section===id?'selected':''} onClick={()=>{setSection(id as Section);setPage(0);setSearch('');setQuery('');}}><Icon size={18}/>{label}</button>)}</nav><div className="admin-account"><strong>{user.user_metadata.display_name}</strong><small>{role}</small><button onClick={()=>void signOut()}><LogOut size={15}/>Cerrar sesión</button><Link href="/"><ArrowLeft size={14}/>Volver a la plataforma</Link></div></aside>
 <section className="admin-workspace"><header><div><span>CONTROL DE LA COMUNIDAD</span><h1>{tabs.find((tab)=>tab.id===section)?.label}</h1><p>Decisiones claras. Acciones registradas.</p></div><button onClick={()=>void refresh()} disabled={loading}>{loading?'Actualizando…':'Actualizar'}</button></header>
 {error&&<p className="admin-error" role="alert">{error}</p>}
 {security?<StaffSecurity onDone={()=>{setSecurity(false);void refresh();}}/>:section==='test-users'?<TestUsers/>:section==='overview'?<><div className="admin-stats">{[{key:'users',label:'Cuentas'},{key:'posts',label:'Publicaciones'},{key:'reports',label:'Reportes abiertos'},{key:'suspended',label:'Suspendidos'},{key:'queued',label:'Archivos en proceso'}].map((stat)=><article key={stat.key}><span>{stat.label}</span><strong>{counts[stat.key]??0}</strong></article>)}</div><div className="admin-welcome">{!factorEnabled&&<button onClick={()=>setSecurity(true)}>Activar segundo factor</button>}<ShieldCheck size={30}/><h2>Un espacio que se cuida</h2><p>Gestiona perfiles, revisa reportes y modera contenido desde el menú. Las acciones requieren un motivo y quedan en auditoría.</p></div></>:<>
 {['users','posts'].includes(section)&&<form className="admin-search" onSubmit={(event)=>{event.preventDefault();setPage(0);setSearch(query);}}><Search size={17}/><input aria-label="Buscar" placeholder={section==='users'?'Nombre o correo':'Texto de la publicación'} value={query} onChange={(event)=>setQuery(event.target.value)}/><button>Buscar</button></form>}
 <div className="admin-records">{rows.map((row)=><article key={String(row.id)}><div className="admin-record-copy"><strong>{String(row.name??row.caption??row.reason??row.action??'Registro')}</strong><small>{String(row.email??row.author??row.reporter??row.actor??'')} · {String(row.created_at??'').slice(0,19).replace('T',' ')}</small>{section==='users'&&<span>{row.suspended_at?'Suspendido':'Activo'} · {row.verified?'Correo confirmado':'Sin confirmar'}{row.role?` · ${row.role}`:''}</span>}{section==='reports'&&<span>Estado: {row.status} · Perfil: {row.target_user_id??'—'} · Publicación: {row.post_id??'—'} · Reseña: {row.review_id??'—'}</span>}{section==='audit'&&<span>Destino: {row.target_id??'—'}</span>}</div>
 {section==='posts'&&<div className="admin-media">{String(row.mime).startsWith('image/')?<Image unoptimized width={130} height={130} alt="Publicación a revisar" src={`/api/v1/media/${row.media_id}?moderation=1`}/>:<video controls preload="none" src={`/api/v1/media/${row.media_id}?moderation=1`}/>}</div>}
 <div className="admin-actions">{section==='users'&&role!=='support'&&row.id!==user.id&&<><button onClick={()=>setAction({action:row.suspended_at?'restore':'suspend',userId:row.id})}>{row.suspended_at?'Restaurar cuenta':'Suspender cuenta'}</button>{role==='admin'&&<select aria-label="Cambiar rol" value={String(row.role??'none')} onChange={(event)=>setAction({action:'role',userId:row.id,role:event.target.value})}><option value="none">Sin rol</option><option value="support">Soporte</option><option value="moderator">Moderador</option><option value="admin">Administrador</option></select>}</>}
 {section==='posts'&&<button onClick={()=>setAction({action:row.hidden_at?'restore-post':'hide-post',id:row.id})}>{row.hidden_at?'Restaurar publicación':'Ocultar publicación'}</button>}
 {section==='reports'&&role!=='support'&&row.status==='open'&&<><button onClick={()=>setAction({action:'report-status',id:row.id,status:'resolved'})}>Resolver</button><button onClick={()=>setAction({action:'report-status',id:row.id,status:'dismissed'})}>Descartar</button>{row.review_id&&<button onClick={()=>setAction({action:"hide-review",id:row.review_id})}>Ocultar reseña</button>}{row.post_id&&<button onClick={()=>setAction({action:'hide-post',id:row.post_id})}>Ocultar publicación</button>}{row.target_user_id&&<button onClick={()=>setAction({action:'suspend',userId:row.target_user_id})}>Suspender perfil</button>}</>}</div></article>)}{!rows.length&&<p className="admin-empty">No hay registros para esta búsqueda.</p>}</div>
 <footer className="admin-pagination"><button disabled={!page||loading} onClick={()=>setPage((value)=>value-1)}>Anterior</button><span>Página {page+1}</span><button disabled={rows.length<(section==='audit'?50:30)||loading} onClick={()=>setPage((value)=>value+1)}>Siguiente</button></footer></>}
 </section>{action&&<div className="admin-confirm"><form role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title" onSubmit={(event)=>void submit(event)}><h2 id="admin-confirm-title">Confirmar acción</h2><p>Explica el motivo. Quedará registrado para el equipo.</p><textarea required minLength={5} maxLength={500} aria-label="Motivo de la acción" value={reason} onChange={(event)=>setReason(event.target.value)} autoFocus/><div><button type="button" onClick={()=>{setAction(null);setReason('');}}>Cancelar</button><button disabled={loading||reason.trim().length<5}>Confirmar</button></div></form></div>}</main>;
}
