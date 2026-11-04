"use client";

import {useId,useState} from 'react';
import {Eye,EyeOff,LockKeyhole} from 'lucide-react';

export default function AuthPasswordField({value,onChange,login,error,onBlur,disabled=false,label='Contraseña',fieldName='password'}:{value:string;onChange:(value:string)=>void;login:boolean;error?:string;onBlur?:()=>void;disabled?:boolean;label?:string;fieldName?:string}){
 const id=useId();
 const [visible,setVisible]=useState(false);
 return <div className="form-field">
  <label className="account-password-label" htmlFor={id}><LockKeyhole size={14}/>{label}</label>
  <div className="account-password-input">
   <input id={id} name={fieldName} aria-required="true" aria-invalid={Boolean(error)} aria-describedby={error?`${id}-error`:!login?`${id}-hint`:undefined} disabled={disabled} type={visible?'text':'password'} autoComplete={login?'current-password':'new-password'} value={value} onBlur={onBlur} onChange={event=>onChange(event.target.value)} placeholder={login?'Tu contraseña':'Al menos 12 caracteres'}/>
   <button type="button" disabled={disabled} aria-label={visible?'Ocultar contraseña':'Mostrar contraseña'} aria-pressed={visible} aria-controls={id} onClick={()=>setVisible(current=>!current)}>{visible?<EyeOff size={19}/>:<Eye size={19}/>}</button>
  </div>
  {error?<p id={`${id}-error`} className="auth-field-error">{error}</p>:!login&&<p id={`${id}-hint`} className="auth-field-hint">Entre 12 y 128 caracteres. Puedes usar una frase larga.</p>}
 </div>;
}
