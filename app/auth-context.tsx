"use client";

import {normalizePersonName} from "../shared/person-name.mjs";
import { createContext, useContext, useCallback, useEffect, useId, useRef, useState, type ReactNode, type FormEvent } from "react";
type User = { id: string; email: string; emailVerified:boolean; emailVerificationRequired:boolean; user_metadata: { display_name: string; full_name: string } };
type PolicySessionUser={id:string;email:string;emailVerified:boolean;name:string;emailVerificationRequired?:boolean};
type Provider = "google" | "facebook" | "apple" | "azure";
import { X, ArrowRight, Mail, Apple } from "lucide-react";
import AuthPasswordField from './auth-password-field';
import BrandLogo from "./brand-logo";
import { clearSocialCache } from "./social-store";
import { authClient } from "./auth-client";
import {validateAuthForm,type AuthField,type AuthFieldErrors,type AuthValues} from '../shared/auth-validation';


type Mode = "login" | "register" | "forgot" | "reset" | "verify" | "factor";
const AuthContext = createContext<{ user: User | null; ready: boolean; canUseAccount:boolean; requireAccount: () => boolean; openAuth: (mode?: Mode) => void; refreshSession: () => Promise<void>; signOut: () => Promise<void> } | null>(null);
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider required"); return value; }

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [initialCheckExpired,setInitialCheckExpired]=useState(false);
  const session = authClient.useSession();
  const refetchSession = session.refetch;
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [consent,setConsent]=useState(false);
  const [fieldErrors,setFieldErrors]=useState<AuthFieldErrors>({});
  const form=useRef<HTMLFormElement>(null);
  const formId=useId();
  const nextField=useRef<AuthField|undefined>(undefined);
  const [factorCode,setFactorCode]=useState("");
  const [backupCode,setBackupCode]=useState(false);
  const [resetToken,setResetToken] = useState("");
  const [providers,setProviders] = useState<Record<string,boolean>>({});
  const [verificationRequired,setVerificationRequired]=useState(true);
  const [optionsReady,setOptionsReady]=useState(false);
  const canUseAccount=Boolean(user&&(user.emailVerified||!user.emailVerificationRequired));
  const loadAuthOptions=useCallback(async()=>{
    const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch('/api/v1/auth-options',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('No se pudo consultar la configuración de acceso.');
      const value=await response.json();
      setProviders(value.providers??{});
      const required=value.requireEmailVerification!==false;setVerificationRequired(required);return required;
    }finally{window.clearTimeout(timeout);setOptionsReady(true);}
  },[]);
  useEffect(()=>{
    // Public browsing must not depend indefinitely on an unavailable session service.
    if(ready)return;
    const timeout=window.setTimeout(()=>setInitialCheckExpired(true),8000);
    return()=>window.clearTimeout(timeout);
  },[ready]);
  useEffect(()=>{
    void loadAuthOptions().catch(()=>{});
    const params=new URLSearchParams(window.location.search);
    const timer=window.setTimeout(()=>{if(params.get("account")==="reset"&&params.get("token")){setResetToken(params.get("token")!);setMode("reset");window.history.replaceState(null,"",window.location.pathname);}else if(params.get("account")==="verified"){setMode("login");setNotice("Correo confirmado. Ya puedes iniciar sesi\u00f3n.");}else if(params.has("error")){setMode("forgot");setError("El enlace no es v\u00e1lido o ya caduc\u00f3. Solicita uno nuevo.");}},0);
    return()=>window.clearTimeout(timer);
  },[loadAuthOptions]);
  useEffect(()=>{
    const refresh=()=>{void loadAuthOptions().catch(()=>{});};
    const storage=(event:StorageEvent)=>{if(event.key==='clikiss-registration-policy-updated')refresh();};
    const visible=()=>{if(!document.hidden)refresh();};
    const timer=window.setInterval(refresh,30000);
    window.addEventListener('conecta-registration-settings',refresh);window.addEventListener('storage',storage);document.addEventListener('visibilitychange',visible);
    return()=>{clearInterval(timer);window.removeEventListener('conecta-registration-settings',refresh);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',visible);};
  },[loadAuthOptions]);
  const dialog = useRef<HTMLDivElement>(null);
  const accountId = useRef<string | null>(null);
  useEffect(() => {
    const login = () => { setError(""); setFieldErrors({}); setMode("login"); void loadAuthOptions().catch(()=>{}); void refetchSession(); };
    window.addEventListener("conecta-auth-required", login);
    return () => window.removeEventListener("conecta-auth-required", login);
  }, [refetchSession,loadAuthOptions]);
  useEffect(() => {
    const current = session.data?.user as PolicySessionUser | undefined;
    const timer = window.setTimeout(() => {
      if (accountId.current !== (current?.id ?? null)) { clearSocialCache(); accountId.current = current?.id ?? null; }
      setUser(current ? { id: current.id, email: current.email, emailVerified:current.emailVerified,emailVerificationRequired:current.emailVerificationRequired!==false, user_metadata: { display_name: current.name, full_name: current.name } } : null);
      setReady(previous=>previous||initialCheckExpired||(!session.isPending&&optionsReady));
      if (current&&optionsReady) { setMode((value)=>value === "reset" ? value : current.emailVerified||current.emailVerificationRequired===false ? null : "verify"); if(!current.emailVerified&&current.emailVerificationRequired!==false)setEmail(current.email); setPassword(""); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [session.data, session.isPending,verificationRequired,optionsReady,initialCheckExpired]);
  useEffect(() => {
    if (!mode) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if(nextField.current){dialog.current?.querySelector<HTMLInputElement>(`input[name="${nextField.current}"]`)?.focus();nextField.current=undefined;}else dialog.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") setMode(null);
      if (event.key !== "Tab") return;
      const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [mode]);
  function openAuth(next: Mode = "register") { setError(""); setFieldErrors({}); setNotice(""); setPassword(""); if(next==='register')setConsent(false); setMode(next); void loadAuthOptions().catch(()=>{}); }
  function validateField(field:AuthField){
    const {errors}=validateAuthForm(mode??'login',{name,email,password,consent,factorCode},backupCode);
    setFieldErrors(current=>({...current,[field]:errors[field]??current[field]}));
  }
  function editField(field:AuthField,value:string|boolean){
    if(field==='name')setName(String(value));else if(field==='email'){setEmail(String(value));setNotice('');}else if(field==='password')setPassword(String(value));else if(field==='consent')setConsent(Boolean(value));else setFactorCode(String(value));
    setError('');
    if(fieldErrors[field]){const input={name,email,password,consent,factorCode,[field]:value} as AuthValues;const {errors}=validateAuthForm(mode??'login',input,backupCode);setFieldErrors(current=>({...current,[field]:errors[field]}));}
  }
  function showFieldErrors(errors:AuthFieldErrors){
    setFieldErrors(errors);
    const first=(['name','email','password','factorCode','consent'] as AuthField[]).find(field=>errors[field]);
    if(first)requestAnimationFrame(()=>form.current?.querySelector<HTMLInputElement>(`input[name="${first}"]`)?.focus());
  }
  function requireAccount() { if (ready && canUseAccount) return true; if(user){setEmail(user.email);openAuth("verify");}else openAuth(); return false; }
  async function oauth(provider: Provider) {
    if (!authClient) { setError("El acceso estará disponible pronto. Inténtalo más tarde."); return; }
    setBusy(true); setError("");
    try {
      const { error } = await authClient.signIn.social({ provider: provider === "azure" ? "microsoft" : provider, callbackURL: "/" });
      if (error) setError("No pudimos conectar con este proveedor. Intenta de nuevo o usa tu correo.");
    } catch { setError("No pudimos conectar. Comprueba tu conexión e inténtalo de nuevo."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if(busy||!mode)return;
    const {values,errors}=validateAuthForm(mode,{name,email,password,consent,factorCode},backupCode);
    if(Object.values(errors).some(Boolean)){setError('Revisa los campos marcados para continuar.');setNotice('');showFieldErrors(errors);return;}
    setFieldErrors({});setEmail(values.email);if(mode==='register')setName(values.name);
    if (!authClient) { setError("El acceso estará disponible pronto. Inténtalo más tarde."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      if(mode==="factor"){const result=backupCode?await authClient.twoFactor.verifyBackupCode({code:values.factorCode}):await authClient.twoFactor.verifyTotp({code:values.factorCode,trustDevice:false});if(result.error){showFieldErrors({factorCode:'El código no es válido. Revísalo e inténtalo de nuevo.'});return;}setFactorCode("");setMode(null);await session.refetch();return;}
      if(mode==="forgot"){
        const result=await authClient.requestPasswordReset({email:values.email,redirectTo:`${window.location.origin}/?account=reset`});
        if(result.error)throw new Error("No se pudo enviar el correo.");
        setNotice("Si existe una cuenta con ese correo, recibirás un enlace para recuperar el acceso.");return;
      }
      if(mode==="reset"){
        const result=await authClient.resetPassword({newPassword:values.password,token:resetToken});
        if(result.error){setError("El enlace no es válido o ya caducó. Solicita uno nuevo.");return;}
        setResetToken("");setPassword("");setMode("login");setNotice("Contraseña actualizada. Inicia sesión de nuevo.");await session.refetch();return;
      }
      if(mode==="verify"){
        const result=await authClient.sendVerificationEmail({email:values.email,callbackURL:`${window.location.origin}/?account=verified`});
        if(result.error)throw new Error("No se pudo enviar.");setNotice("Si tu cuenta está pendiente, recibirás un nuevo enlace de confirmación.");return;
      }
      await loadAuthOptions();
      const result = mode === "register"
        ? await authClient.signUp.email({ email:values.email, password:values.password, name:values.name,callbackURL:`${window.location.origin}/?account=verified` })
        : await authClient.signIn.email({ email:values.email, password:values.password });
      if (result.error) {
        const code=String(result.error.code??'');
        if(result.error.status===429){setError('Demasiados intentos. Espera un momento y vuelve a intentarlo.');return;}
        if(mode==='register'&&['EMAIL_ALREADY_REGISTERED','USER_ALREADY_EXISTS','USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'].includes(code)){setPassword('');setConsent(false);setFieldErrors({});nextField.current='password';setMode('login');setNotice('Ya existe una cuenta con este correo. Inicia sesión para continuar.');return;}
        if(mode==='login'&&code==='EMAIL_NOT_REGISTERED'){showFieldErrors({email:'No existe una cuenta con este correo. Revisa que esté escrito correctamente.'});return;}
        if(mode==='login'&&code==='INVALID_EMAIL_OR_PASSWORD'){showFieldErrors({password:'Tu contraseña es incorrecta.'});return;}
        if(code==='PASSWORD_NOT_SET'){setError('Esta cuenta usa un proveedor de acceso. Continúa con ese proveedor o restablece tu contraseña.');return;}
        if(code==='EMAIL_NOT_VERIFIED'){setPassword('');setVerificationRequired(true);setMode('verify');setNotice('Confirma tu correo para entrar. Revisa tu bandeja de entrada.');return;}
        setError(mode === "login" ? "Revisa tu correo y contraseña." : "No pudimos crear tu cuenta. Revisa los datos.");return;
      }
      if(result.data&&"twoFactorRedirect" in result.data&&result.data.twoFactorRedirect){setPassword("");setMode("factor");return;}
      setPassword("");
      if(mode==="register"&&!result.data?.token){setMode("verify");setNotice("Te enviamos un enlace para confirmar tu correo. Revisa también spam.");return;}
      if(mode==='register')setVerificationRequired(false);
      setMode(null);await session.refetch();
    } catch { setError("No pudimos conectar. Comprueba tu conexión e inténtalo de nuevo."); }
    finally { setBusy(false); }
  }
  const titles={factor:"Un paso m\u00e1s.",login:"Qu\u00e9 gusto verte.",register:"La conexi\u00f3n empieza contigo.",forgot:"Recupera tu acceso.",reset:"Una nueva contrase\u00f1a.",verify:"Confirma tu correo."};
  const descriptions={factor:"Introduce el c\u00f3digo de tu autenticador para continuar.",login:"Entra para seguir donde te quedaste.",register:"Crea tu cuenta para conversar y compartir momentos.",forgot:"Te enviaremos un enlace para recuperar tu cuenta.",reset:"Elige una clave de al menos 12 caracteres.",verify:"Abre el enlace que enviamos a tu correo para activar tu cuenta."};
  const labels={factor:"Verificar acceso",login:"Iniciar sesi\u00f3n",register:"Crear mi cuenta",forgot:"Enviar enlace",reset:"Guardar contrase\u00f1a",verify:"Reenviar confirmaci\u00f3n"};
  return <AuthContext.Provider value={{ user, ready, canUseAccount, openAuth, requireAccount, refreshSession: async () => { await session.refetch(); }, signOut: async () => { const result = await authClient.signOut(); if (result?.error) { openAuth("login"); setError("No pudimos cerrar la sesión. Inténtalo de nuevo."); } } }}>
    {children}
    {mode && <div className="account-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMode(null); }}><div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="account-title" aria-describedby="account-description" className="account-dialog">
      <aside className="account-art"><span className="account-brand"><BrandLogo /></span><div><span>UNA CHISPA LO CAMBIA TODO</span><h2>Tu próxima<br />historia<br /><em>empieza aquí.</em></h2><p>Conoce personas. Comparte momentos.<br />Conecta a tu manera.</p></div></aside>
      <section className="account-panel"><button className="modal-close" aria-label="Cerrar acceso" onClick={() => setMode(null)}><X /></button><span className="eyebrow">HAZ ESPACIO PARA ALGO ESPECIAL</span><h2 id="account-title">{titles[mode]}</h2><p id="account-description">{descriptions[mode]}</p>
      {(mode === "login" || mode === "register") && <div className="account-providers">{([{ id: "google", label: "Google", mark: "G" }, { id: "facebook", label: "Facebook", mark: "f" }, { id: "apple", label: "Apple", mark: "" }, { id: "azure", label: "Microsoft", mark: "⊞" }] as const).map((provider) => <button disabled={busy || !providers[provider.id]} title={!providers[provider.id] ? "Próximamente" : undefined} key={provider.id} onClick={() => void oauth(provider.id)}><b className={`provider-${provider.id}`} aria-hidden="true">{provider.id === "apple" ? <Apple size={19} /> : provider.mark}</b>Continuar con {provider.label}</button>)}</div>}
      {(mode === "login" || mode === "register") && <div className="account-divider"><span>o con tu correo</span></div>}<form ref={form} noValidate aria-busy={busy} onSubmit={(event) => void submit(event)}>
      {mode === "register" && <div className="form-field"><label htmlFor={`${formId}-name`} className="auth-field-label">Tu nombre</label><input id={`${formId}-name`} name="name" aria-required="true" aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name?`${formId}-name-error`:undefined} disabled={busy} autoComplete="name" value={name} onBlur={()=>{setName(normalizePersonName(name));validateField('name');}} onChange={event=>editField('name',event.target.value)} placeholder="¿Cómo te llamas?"/>{fieldErrors.name&&<p id={`${formId}-name-error`} className="auth-field-error">{fieldErrors.name}</p>}</div>}
      {mode !== "reset" && mode !== "factor" && <div className="form-field"><label htmlFor={`${formId}-email`} className="auth-field-label"><Mail size={14}/>Correo electrónico</label><input id={`${formId}-email`} name="email" aria-required="true" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email?`${formId}-email-error`:undefined} disabled={busy} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onBlur={()=>validateField('email')} onChange={event=>editField('email',event.target.value)} placeholder="tu@correo.com"/>{fieldErrors.email&&<p id={`${formId}-email-error`} className="auth-field-error">{fieldErrors.email}</p>}</div>}
      {(mode === "login" || mode === "register" || mode === "reset") && <AuthPasswordField key={mode} value={password} onChange={value=>editField('password',value)} onBlur={()=>validateField('password')} error={fieldErrors.password} disabled={busy} login={mode==='login'}/>}
      {mode === "factor" && <><div className="form-field"><label htmlFor={`${formId}-factor`} className="auth-field-label">{backupCode?'Código de recuperación':'Código del autenticador'}</label><input id={`${formId}-factor`} name="factorCode" aria-required="true" aria-invalid={Boolean(fieldErrors.factorCode)} aria-describedby={fieldErrors.factorCode?`${formId}-factor-error`:undefined} disabled={busy} value={factorCode} inputMode={backupCode?'text':'numeric'} autoComplete="one-time-code" onBlur={()=>validateField('factorCode')} onChange={event=>editField('factorCode',event.target.value)}/>{fieldErrors.factorCode&&<p id={`${formId}-factor-error`} className="auth-field-error">{fieldErrors.factorCode}</p>}</div><button type="button" disabled={busy} className="auth-switch" onClick={()=>{setBackupCode(value=>!value);setFactorCode('');setFieldErrors({});}}>{backupCode?'Usar autenticador':'Usar código de recuperación'}</button></>}
      {mode === "register" && <div className="form-field"><label className="account-consent"><input name="consent" type="checkbox" aria-required="true" aria-invalid={Boolean(fieldErrors.consent)} aria-describedby={fieldErrors.consent?`${formId}-consent-error`:undefined} disabled={busy} checked={consent} onBlur={()=>validateField('consent')} onChange={event=>editField('consent',event.target.checked)}/>Confirmo que tengo 18 años o más.</label>{fieldErrors.consent&&<p id={`${formId}-consent-error`} className="auth-field-error">{fieldErrors.consent}</p>}</div>}
      {mode === "login" && <button type="button" className="auth-switch" onClick={()=>openAuth("forgot")}>¿Olvidaste tu contraseña?</button>}{error && <p className="account-error" role="alert">{error}</p>}{notice && <p role="status" className="account-notice">{notice}</p>}
      <button className="auth-submit" disabled={busy || !ready} type="submit">{busy ? "Conectando…" : labels[mode]}<ArrowRight size={18} /></button></form>
      <button className="auth-switch" disabled={busy} onClick={() => openAuth(mode === "login" ? "register" : "login")}>{mode === "login" ? "¿Aún no tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}</button><small className="account-footnote">Tú decides qué compartir y con quién conectar.</small></section>
    </div></div>}
  </AuthContext.Provider>;
}
