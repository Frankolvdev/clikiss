"use client";

import {normalizePersonName} from "../shared/person-name.mjs";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
type User = { id: string; email: string; emailVerified:boolean; user_metadata: { display_name: string; full_name: string } };
type Provider = "google" | "facebook" | "apple" | "azure";
import { HeartHandshake, X, ArrowRight, Mail, LockKeyhole, Apple } from "lucide-react";
import { clearSocialCache } from "./social-store";
import { authClient } from "./auth-client";


type Mode = "login" | "register" | "forgot" | "reset" | "verify" | "factor";
const AuthContext = createContext<{ user: User | null; ready: boolean; requireAccount: () => boolean; openAuth: (mode?: Mode) => void; signOut: () => Promise<void> } | null>(null);
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider required"); return value; }

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const session = authClient.useSession();
  const refetchSession = session.refetch;
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [factorCode,setFactorCode]=useState("");
  const [backupCode,setBackupCode]=useState(false);
  const [resetToken,setResetToken] = useState("");
  const [providers,setProviders] = useState<Record<string,boolean>>({});
  useEffect(()=>{
    void fetch("/api/v1/auth-options").then((response)=>response.json()).then((value)=>setProviders(value.providers??{})).catch(()=>{});
    const params=new URLSearchParams(window.location.search);
    const timer=window.setTimeout(()=>{if(params.get("account")==="reset"&&params.get("token")){setResetToken(params.get("token")!);setMode("reset");window.history.replaceState(null,"",window.location.pathname);}else if(params.get("account")==="verified"){setMode("login");setNotice("Correo confirmado. Ya puedes iniciar sesi\u00f3n.");}else if(params.has("error")){setMode("forgot");setError("El enlace no es v\u00e1lido o ya caduc\u00f3. Solicita uno nuevo.");}},0);
    return()=>window.clearTimeout(timer);
  },[]);
  const dialog = useRef<HTMLDivElement>(null);
  const accountId = useRef<string | null>(null);
  useEffect(() => {
    const login = () => { setError(""); setMode("login"); void refetchSession(); };
    window.addEventListener("conecta-auth-required", login);
    return () => window.removeEventListener("conecta-auth-required", login);
  }, [refetchSession]);
  useEffect(() => {
    const current = session.data?.user;
    const timer = window.setTimeout(() => {
      if (accountId.current !== (current?.id ?? null)) { clearSocialCache(); accountId.current = current?.id ?? null; }
      setUser(current ? { id: current.id, email: current.email, emailVerified:current.emailVerified, user_metadata: { display_name: current.name, full_name: current.name } } : null);
      setReady(!session.isPending);
      if (current) { setMode((value)=>value === "reset" ? value : current.emailVerified ? null : "verify"); if(!current.emailVerified)setEmail(current.email); setPassword(""); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [session.data, session.isPending]);
  useEffect(() => {
    if (!mode) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") setMode(null);
      if (event.key !== "Tab") return;
      const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href]');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [mode]);
  function openAuth(next: Mode = "register") { setError(""); setNotice(""); setPassword(""); setMode(next); }
  function requireAccount() { if (ready && user?.emailVerified) return true; if(user){setEmail(user.email);openAuth("verify");}else openAuth(); return false; }
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
    if (!authClient) { setError("El acceso estará disponible pronto. Inténtalo más tarde."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      if(mode==="factor"){const result=backupCode?await authClient.twoFactor.verifyBackupCode({code:factorCode}):await authClient.twoFactor.verifyTotp({code:factorCode,trustDevice:false});if(result.error){setError("El c\u00f3digo no es v\u00e1lido.");return;}setFactorCode("");setMode(null);await session.refetch();return;}
      if(mode==="forgot"){
        const result=await authClient.requestPasswordReset({email,redirectTo:`${window.location.origin}/?account=reset`});
        if(result.error)throw new Error("No se pudo enviar el correo.");
        setNotice("Si existe una cuenta con ese correo, recibirás un enlace para recuperar el acceso.");return;
      }
      if(mode==="reset"){
        const result=await authClient.resetPassword({newPassword:password,token:resetToken});
        if(result.error){setError("El enlace no es válido o ya caducó. Solicita uno nuevo.");return;}
        setResetToken("");setPassword("");setMode("login");setNotice("Contraseña actualizada. Inicia sesión de nuevo.");await session.refetch();return;
      }
      if(mode==="verify"){
        const result=await authClient.sendVerificationEmail({email,callbackURL:`${window.location.origin}/?account=verified`});
        if(result.error)throw new Error("No se pudo enviar.");setNotice("Si tu cuenta está pendiente, recibirás un nuevo enlace de confirmación.");return;
      }
      const result = mode === "register"
        ? await authClient.signUp.email({ email, password, name: normalizePersonName(name),callbackURL:`${window.location.origin}/?account=verified` })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        if(result.error.code==="EMAIL_NOT_VERIFIED"){setMode("verify");setNotice("Confirma tu correo para entrar. Revisa tu bandeja de entrada.");return;}
        setError(mode === "login" ? "Revisa tu correo y contraseña." : "No pudimos crear tu cuenta. Revisa los datos.");return;
      }
      if(result.data&&"twoFactorRedirect" in result.data&&result.data.twoFactorRedirect){setPassword("");setMode("factor");return;}
      setPassword("");
      if(mode==="register"){setMode("verify");setNotice("Te enviamos un enlace para confirmar tu correo. Revisa también spam.");return;}
      setMode(null);await session.refetch();
    } catch { setError("No pudimos conectar. Comprueba tu conexión e inténtalo de nuevo."); }
    finally { setBusy(false); }
  }
  const titles={factor:"Un paso m\u00e1s.",login:"Qu\u00e9 gusto verte.",register:"La conexi\u00f3n empieza contigo.",forgot:"Recupera tu acceso.",reset:"Una nueva contrase\u00f1a.",verify:"Confirma tu correo."};
  const descriptions={factor:"Introduce el c\u00f3digo de tu autenticador para continuar.",login:"Entra para seguir donde te quedaste.",register:"Crea tu cuenta para conversar y compartir momentos.",forgot:"Te enviaremos un enlace para recuperar tu cuenta.",reset:"Elige una clave de al menos 12 caracteres.",verify:"Abre el enlace que enviamos a tu correo para activar tu cuenta."};
  const labels={factor:"Verificar acceso",login:"Iniciar sesi\u00f3n",register:"Crear mi cuenta",forgot:"Enviar enlace",reset:"Guardar contrase\u00f1a",verify:"Reenviar confirmaci\u00f3n"};
  return <AuthContext.Provider value={{ user, ready, openAuth, requireAccount, signOut: async () => { const result = await authClient.signOut(); if (result?.error) { openAuth("login"); setError("No pudimos cerrar la sesión. Inténtalo de nuevo."); } } }}>
    {children}
    {mode && <div className="account-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMode(null); }}><div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="account-title" aria-describedby="account-description" className="account-dialog">
      <aside className="account-art"><span className="account-brand"><HeartHandshake /> conecta.</span><div><span>UNA CHISPA LO CAMBIA TODO</span><h2>Tu próxima<br />historia<br /><em>empieza aquí.</em></h2><p>Conoce personas. Comparte momentos.<br />Conecta a tu manera.</p></div></aside>
      <section className="account-panel"><button className="modal-close" aria-label="Cerrar acceso" onClick={() => setMode(null)}><X /></button><div className="auth-mark"><HeartHandshake /></div><span className="eyebrow">HAZ ESPACIO PARA ALGO ESPECIAL</span><h2 id="account-title">{titles[mode]}</h2><p id="account-description">{descriptions[mode]}</p>
      {(mode === "login" || mode === "register") && <div className="account-providers">{([{ id: "google", label: "Google", mark: "G" }, { id: "facebook", label: "Facebook", mark: "f" }, { id: "apple", label: "Apple", mark: "" }, { id: "azure", label: "Microsoft", mark: "⊞" }] as const).map((provider) => <button disabled={busy || !providers[provider.id]} title={!providers[provider.id] ? "Próximamente" : undefined} key={provider.id} onClick={() => void oauth(provider.id)}><b className={`provider-${provider.id}`} aria-hidden="true">{provider.id === "apple" ? <Apple size={19} /> : provider.mark}</b>Continuar con {provider.label}</button>)}</div>}
      {(mode === "login" || mode === "register") && <div className="account-divider"><span>o con tu correo</span></div>}<form onSubmit={(event) => void submit(event)}>
      {mode === "register" && <label className="form-field"><span>Tu nombre</span><input required maxLength={80} autoComplete="name" value={name} onBlur={()=>setName(normalizePersonName(name))} onChange={(event) => setName(event.target.value)} placeholder="¿Cómo te llamas?" /></label>}
      {mode !== "reset" && mode !== "factor" && <label className="form-field"><span><Mail size={14} /> Correo electrónico</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" /></label>}
      {(mode === "login" || mode === "register" || mode === "reset") && <label className="form-field"><span><LockKeyhole size={14} /> Contraseña</span><input required type="password" minLength={mode === "login" ? 1 : 12} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "login" ? "Tu contraseña" : "Al menos 12 caracteres"} /></label>}
      {mode === "factor" && <><label className="form-field"><span>{backupCode?"C\u00f3digo de recuperaci\u00f3n":"C\u00f3digo del autenticador"}</span><input required value={factorCode} autoComplete="one-time-code" onChange={(event)=>setFactorCode(event.target.value)}/></label><button type="button" className="auth-switch" onClick={()=>{setBackupCode((value)=>!value);setFactorCode("");}}>{backupCode?"Usar autenticador":"Usar c\u00f3digo de recuperaci\u00f3n"}</button></>}{mode === "register" && <label className="account-consent"><input required type="checkbox" /> Confirmo que tengo 18 años o más.</label>}
      {mode === "login" && <button type="button" className="auth-switch" onClick={()=>openAuth("forgot")}>¿Olvidaste tu contraseña?</button>}{error && <p className="account-error" role="alert">{error}</p>}{notice && <p role="status" className="account-notice">{notice}</p>}
      <button className="auth-submit" disabled={busy || !ready} type="submit">{busy ? "Conectando…" : labels[mode]}<ArrowRight size={18} /></button></form>
      <button className="auth-switch" onClick={() => openAuth(mode === "login" ? "register" : "login")}>{mode === "login" ? "¿Aún no tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}</button><small className="account-footnote">Tú decides qué compartir y con quién conectar.</small></section>
    </div></div>}
  </AuthContext.Provider>;
}
