"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import AuthPasswordField from '../auth-password-field';
import {adminUserSchema} from '../../shared/admin-user-validation';
import type {ManagedUser} from './users-manager';

export type EditorState={action:'create'|'edit'|'password'|'delete';user?:ManagedUser};
export default function UserEditor({editor,onClose,onSaved}:{editor:EditorState;onClose:()=>void;onSaved:(result:{self:boolean;sessionRevoked:boolean})=>void}){
 const dialog=useRef<HTMLDialogElement>(null),form=useRef<HTMLFormElement>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[errors,setErrors]=useState<Record<string,string>>({});
 const [values,setValues]=useState({name:editor.user?.name??'',email:editor.user?.email??'',verified:editor.user?.verified??false,location:editor.user?.location??'',gender:editor.user?.gender??'Prefiero no decirlo',bio:editor.user?.bio??'',password:'',confirmPassword:'',confirmEmail:'',reason:''});
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 function update(field:string,value:string|boolean){setValues(current=>({...current,[field]:value,...(field==='email'?{verified:false}:{})}));setErrors(current=>({...current,[field]:''}));setError('');}
 function showErrors(next:Record<string,string>){setErrors(next);requestAnimationFrame(()=>form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());}
 async function submit(event:FormEvent){
  event.preventDefault();if(busy)return;
  const parsed=adminUserSchema.safeParse({...values,action:editor.action,userId:editor.user?.id,version:editor.user?.version});
  if(!parsed.success){const next:Record<string,string>={};for(const issue of parsed.error.issues)next[String(issue.path[0])]??=issue.message;showErrors(next);return;}
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/v1/admin/user-management',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(parsed.data)});
   const result=await response.json();
   if(!response.ok){showErrors(result.fieldErrors??{});throw new Error(result.message??'No se pudo guardar la cuenta.');}
   onSaved(result);
  }catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 const title=editor.action==='create'?'Registrar usuario':editor.action==='edit'?'Editar usuario':editor.action==='delete'?'Eliminar usuario':'Cambiar contraseña';
 function field(name:'name'|'email'|'location'|'gender'|'bio'|'reason'|'confirmEmail',label:string,type='text'){
  const id=`admin-user-${name}`;
  return <div className="form-field"><label htmlFor={id}>{label}</label>{name==='bio'||name==='reason'?<textarea id={id} name={name} value={values[name]} disabled={busy} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name]?`${id}-error`:undefined} onChange={event=>update(name,event.target.value)}/>:<input id={id} name={name} type={type} autoComplete="off" value={values[name]} disabled={busy} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name]?`${id}-error`:undefined} onChange={event=>update(name,event.target.value)}/>}{errors[name]&&<p id={`${id}-error`} className="auth-field-error">{errors[name]}</p>}</div>;
 }
 return <dialog ref={dialog} className="admin-user-dialog" aria-labelledby="user-editor-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
  <form ref={form} className="admin-user-form" noValidate onSubmit={event=>void submit(event)}>
   <header><h2 id="user-editor-title">{title}</h2><button type="button" aria-label="Cerrar formulario" disabled={busy} onClick={onClose}>×</button></header>
   {editor.user&&<p className="user-editor-account">{editor.user.name} · {editor.user.email}</p>}
   {error&&<p className="admin-error" role="alert">{error}</p>}
   {(editor.action==='create'||editor.action==='edit')&&<>{field('name','Nombre')}{field('email','Correo electrónico','email')}
    <label className="user-verification"><input type="checkbox" name="verified" checked={values.verified} disabled={busy} aria-invalid={Boolean(errors.verified)} onChange={event=>update('verified',event.target.checked)}/>Correo confirmado por administración</label>
    {errors.verified&&<p className="auth-field-error">{errors.verified}</p>}
    <p className="user-help">Marca esta opción solo si has confirmado la titularidad del correo. Cada cuenta conserva la política de verificación que tenía al registrarse.</p>
   </>}
   {editor.action==='edit'&&<>{field('location','Ubicación')}{field('gender','Género')}{field('bio','Biografía')}<p className="user-help">Cambiar el correo o retirar su confirmación cierra las sesiones abiertas de esta cuenta.</p></>}
   {(editor.action==='create'||editor.action==='password')&&<><AuthPasswordField login={false} value={values.password} onChange={value=>update('password',value)} error={errors.password} disabled={busy}/><AuthPasswordField login={false} label="Confirmar contraseña" fieldName="confirmPassword" value={values.confirmPassword} onChange={value=>update('confirmPassword',value)} error={errors.confirmPassword} disabled={busy}/><p className="user-help">Al cambiar la contraseña se cierran todas las sesiones y se invalidan los enlaces de recuperación pendientes.</p></>}
   {editor.action==='create'&&<p className="user-help">El usuario completará su perfil y fecha de nacimiento al entrar en la aplicación.</p>}
   {editor.action==='delete'&&<><p className="user-delete-warning">Esta acción elimina permanentemente la cuenta y sus contenidos asociados. Se cerrarán sus sesiones. No se puede deshacer.</p>{field('confirmEmail','Correo para confirmar','email')}</>}
   {field('reason','Motivo del cambio')}
   <footer><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className={editor.action==='delete'?'user-danger':'user-primary'} disabled={busy}>{busy?'Guardando…':editor.action==='delete'?'Eliminar definitivamente':editor.action==='create'?'Crear cuenta':'Guardar cambios'}</button></footer>
  </form>
 </dialog>;
}
