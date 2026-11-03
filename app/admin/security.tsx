"use client";
import {useState,type FormEvent} from "react";
import {authClient} from "../auth-client";

export default function StaffSecurity({onDone}:{onDone:()=>void}){
 const [password,setPassword]=useState(''),[code,setCode]=useState(''),[secret,setSecret]=useState(''),[backup,setBackup]=useState<string[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{
  if(!secret){const result=await authClient.twoFactor.enable({password});if(result.error)throw new Error('No se pudo preparar el segundo factor. Comprueba tu contraseña.');const data=result.data as {totpURI:string;backupCodes:string[]};setSecret(new URL(data.totpURI).searchParams.get('secret')??'');setBackup(data.backupCodes);setPassword('');}
  else{const result=await authClient.twoFactor.verifyTotp({code,trustDevice:false});if(result.error)throw new Error('El código no es válido.');setSecret('');setBackup([]);onDone();}
 }catch(err){setError((err as Error).message);}finally{setBusy(false);}}
 return <section className="admin-welcome"><h2>Protege tu acceso con dos factores</h2><p>Configura una aplicación de autenticación. En producción es obligatorio para entrar al panel.</p><form onSubmit={(event)=>void submit(event)}>{!secret?<label>Contraseña de tu cuenta<input required type="password" autoComplete="current-password" value={password} onChange={(event)=>setPassword(event.target.value)}/></label>:<><p>Introduce esta clave manualmente en tu autenticador:</p><code className="admin-secret">{secret}</code><p>Guarda estos códigos de recuperación en un lugar privado:</p><code className="admin-secret">{backup.join(' · ')}</code><label>Código del autenticador<input required inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" value={code} onChange={(event)=>setCode(event.target.value)}/></label></>}<button disabled={busy}>{busy?'Comprobando…':secret?'Verificar y activar':'Preparar segundo factor'}</button>{error&&<p role="alert">{error}</p>}</form></section>;
}
