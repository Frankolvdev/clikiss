"use client";
import {useEffect,useState} from 'react';
import {MailCheck} from 'lucide-react';
import {api,send} from '../api-client';
import './registration-settings.css';

type Settings={requireEmailVerification:boolean;revision:number;updatedAt:string|null};
export default function RegistrationSettings(){
 const [settings,setSettings]=useState<Settings|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;
  void api<Settings>('admin/settings').then(value=>{if(active)setSettings(value);}).catch(error=>{if(active)setError(error.message);});
  return()=>{active=false;};
 },[]);
 async function toggle(){
  if(!settings||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const value=await send<Settings>('admin/settings',{requireEmailVerification:!settings.requireEmailVerification,revision:settings.revision});
   setSettings(value);setNotice('Configuración guardada.');
   window.dispatchEvent(new Event('conecta-registration-settings'));
   try{localStorage.setItem('clikiss-registration-policy-updated',String(Date.now()));}catch{/* Other tabs refresh on focus as well. */}
  }catch(error){setError((error as Error).message);}finally{setBusy(false);}
 }
 return <section className="registration-settings" aria-labelledby="registration-settings-title">
  <div className="registration-settings-heading"><MailCheck size={24}/><div><h2 id="registration-settings-title">Registro de usuarios</h2><p>Configura la confirmación del correo electrónico.</p></div></div>
  {settings?<><div className="registration-setting-row"><div><h3 id="verification-setting-label">Exigir verificación de correo</h3><p id="verification-setting-description">{settings.requireEmailVerification?'Los usuarios deben confirmar su correo mediante un enlace antes de ingresar.':'Los usuarios pueden registrarse e ingresar sin confirmar su correo.'}</p></div>
   <button type="button" role="switch" aria-checked={settings.requireEmailVerification} aria-labelledby="verification-setting-label" aria-describedby="verification-setting-description" aria-busy={busy} disabled={busy} className="registration-switch" onClick={()=>void toggle()}><span/></button>
  </div><p className="registration-setting-state">{busy?'Guardando…':settings.requireEmailVerification?'Verificación obligatoria activada':'Verificación obligatoria desactivada'}</p>
  <p className="registration-setting-help">Si vuelves a activar esta opción, las cuentas que aún no hayan confirmado su correo deberán hacerlo para continuar. El estado de confirmación de cada cuenta se conserva. Los cambios quedan registrados en auditoría.</p></>:!error&&<p role="status">Cargando configuración…</p>}
  {error&&<p className="admin-error" role="alert">{error}</p>}{notice&&<p className="registration-setting-saved" role="status">{notice}</p>}
 </section>;
}
