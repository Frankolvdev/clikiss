"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Film, Grid2X2, ImagePlus, MapPin, MessageCircle, Plus, Star, Trash2, X } from "lucide-react";
import { useAuth } from "./auth-context";
import type { Profile } from "./data";
import { mediaDimensions } from "./media-metadata";
import StoryPlayer from "./story-player";
import { BlobMedia } from "./blob-media";
import ProfileSafety from "./profile-safety";
import ProfilePostMedia from "./profile-post-media";
import StoryCarousel from "./story-carousel";
import PostInteractions from "./post-interactions";
import UploadEditor, {preparePhoto, type VideoOptions} from "./upload-editor";
import PhotoCropper from "./photo-cropper";
import {send} from "./api-client";
import { activeStories, canReview, emptySocialRecord, readSocialRecord, writeSocialRecord, type SocialPost, type SocialRecord } from "./social-store";

type Person = Pick<Profile, "id" | "name" | "age" | "location" | "bio" | "interests" | "image" | "adventureAvailable" | "avatarVideo">;
type Props = { profile: Person; contacts: Profile[]; onClose: () => void; onContact?: () => void|false; initialStoryId?: string };

export default function SocialProfile({ profile, contacts, onClose, onContact, initialStoryId }: Props) {
  const { user, requireAccount } = useAuth();
  const own = Boolean(user) && profile.id === "me";
  const [record, setRecord] = useState<SocialRecord>(() => emptySocialRecord(profile.id));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [crop,setCrop]=useState<{file:File;field:'avatar'|'card'}|null>(null);
  const [tab, setTab] = useState<"posts" | "videos" | "reviews">("posts");
  const [file, setFile] = useState<File | null>(null);
  const [videoOptions,setVideoOptions]=useState<VideoOptions>({});
  const [caption, setCaption] = useState("");
  const [storyMode, setStoryMode] = useState(false);
  const [story, setStory] = useState<SocialPost | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [recipient, setRecipient] = useState("");
  const [encounterConfirmed, setEncounterConfirmed] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [stars, setStars] = useState(5);
  const root = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    readSocialRecord(profile.id).then((saved) => { if (!cancelled) { setRecord(saved); if (initialStoryId) setStory(activeStories(saved.posts, Date.now()).find((item) => item.id === initialStoryId) ?? null); } }).catch((err) => { if (!cancelled) setError(err.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile.id, initialStoryId]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(timer); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  async function save(next: SocialRecord) {
    if (!requireAccount()) return false;
    setBusy(true); setError(""); setNotice("");
    try { await writeSocialRecord(next); setRecord(next); return true; }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar el contenido."); return false; }
    finally { setBusy(false); }
  }

  function validateFile(selected: File, imageOnly = false,maxImageMB=8) {
    const image = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(selected.type);
    const video = ["video/mp4", "video/webm"].includes(selected.type);
    if (!image && (!video || imageOnly)) throw new Error(imageOnly ? "Elige una imagen JPG, PNG, WebP, GIF o AVIF." : "Elige una imagen o un video MP4 o WebM compatible con tu navegador.");
    if (selected.size > (image ? maxImageMB : 25) * 1024 * 1024) throw new Error(image ? `La imagen debe pesar menos de ${maxImageMB} MB.` : "El video debe pesar menos de 25 MB.");
    return image ? "photo" as const : "video" as const;
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!own || !file || busy || loading) return;
    setBusy(true);
    try {
      const prepared=await preparePhoto(file);
      const kind = validateFile(prepared);
      const post: SocialPost = { ...videoOptions, ...(await mediaDimensions(prepared)), id: crypto.randomUUID(), caption: caption.trim(), createdAt: Date.now(), kind, media: prepared, story: storyMode };
      if (await save({ ...record, posts: [...record.posts.filter((item) => !item.story || Date.now() - item.createdAt < 86400000), post] })) {
        setRecord(await readSocialRecord(profile.id));setFile(null); setCaption(""); if (fileInput.current) fileInput.current.value = "";
        setNow(Date.now()); setNotice(storyMode ? "Historia publicada. Visible durante 24 horas." : "Publicación publicada.");
      }
    } catch (err) { setError((err as Error).message); } finally {setBusy(false);}
  }

  async function changePhoto(selected: File | undefined, field: "avatar" | "cover" | "card") {
    if (!own || !selected || busy || loading) return;
    try {
      validateFile(selected, field !== "avatar",field==='cover'?8:25);
      if(selected.type.startsWith('image/')&&(field==='avatar'||field==='card')){setCrop({file:selected,field});return;}
      if (await save({ ...record, [field]: selected })) {setRecord(await readSocialRecord(profile.id));setNotice("Foto actualizada.");window.dispatchEvent(new Event('conecta-profile-update'));}
    }
    catch (err) { setError((err as Error).message); }
  }
  async function saveCrop(selected:File){
    if(!crop||!own)throw new Error('No se pudo guardar la foto.');
    if(!await save({...record,[crop.field]:selected}))throw new Error('No se pudo guardar la foto. Intenta de nuevo.');
    setRecord(await readSocialRecord(profile.id));setCrop(null);setNotice('Foto guardada.');window.dispatchEvent(new Event('conecta-profile-update'));
  }
  async function resetCardPhoto(){
    if(!own||busy)return;setBusy(true);setError('');
    try{await send('social/me',{type:'photo',field:'card',mediaId:null});setRecord(await readSocialRecord(profile.id));setNotice('Las tarjetas vuelven a usar tu foto de perfil.');window.dispatchEvent(new Event('conecta-profile-update'));}
    catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    const person = contacts.find((contact) => contact.id === recipient);
    if (!own || !profile.adventureAvailable || !person || !encounterConfirmed || busy || loading) return;
    if (record.invitations.some((item) => item.recipientId === recipient)) { setError("Esta persona ya recibió una invitación."); return; }
    const invitation = { id: crypto.randomUUID(), recipientId: person.id, recipientName: person.name, createdAt: Date.now() };
    if (await save({ ...record, invitations: [...record.invitations, invitation] })) { setRecipient(""); setEncounterConfirmed(false); setNotice("Invitación habilitada."); }
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    const invitation = record.invitations.find((item) => item.recipientId === "me");
    const reviewerId = "me";
    if (!invitation || !reviewText.trim() || busy || loading || !canReview(record, invitation.id, reviewerId)) return;
    const review = { id: crypto.randomUUID(), invitationId: invitation.id, authorId: reviewerId, authorName: invitation.recipientName, text: reviewText.trim(), stars, createdAt: Date.now(), simulated: false };
    if (await save({ ...record, reviews: [...record.reviews, review] })) { setReviewText("");  setNotice("Reseña publicada por invitación. El encuentro no está verificado."); }
  }

  const stories = activeStories(record.posts, now);
  const posts = record.posts.filter((post) => !post.story && (tab !== "videos" || post.kind === "video")).sort((a, b) => b.createdAt - a.createdAt);
  const eligibleInvitation = record.invitations.find((item) => item.recipientId === "me" && canReview(record, item.id, "me"));
  const reviewable = Boolean(user && eligibleInvitation && canReview(record, eligibleInvitation.id, eligibleInvitation.recipientId));

  return <div className="social-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="social-dialog" inert={Boolean(crop)} ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="social-title" onKeyDown={(event) => {
      if (event.key === "Escape") { if (story) setStory(null); else onClose(); }
      if (event.key === "Tab") {
        const items = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter((item) => item.getClientRects().length > 0);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <button type="button" className="social-close" onClick={onClose} aria-label="Cerrar perfil"><X size={22} /></button>
      <div className="social-cover" inert={Boolean(story)}><BlobMedia blob={record.cover} fallback={record.coverUrl} className="social-cover-image" alt="Portada del perfil" />{own && <label className="social-photo-edit"><Camera size={15} /> Portada<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={busy || loading} onChange={(event) => { void changePhoto(event.target.files?.[0], "cover"); event.target.value = ""; }} /></label>}</div>
      <div className="social-content" inert={Boolean(story)}>
        <div className="social-identity"><div className="social-avatar"><BlobMedia blob={record.avatar} fallback={record.avatarUrl ?? profile.image} loopSrc={record.avatarVideoUrl??profile.avatarVideo} alt={`Foto de ${profile.name}`} />{own && <label className="social-avatar-edit" aria-label="Cambiar foto de perfil"><Camera size={16} /><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm" disabled={busy || loading} onChange={(event) => { void changePhoto(event.target.files?.[0], "avatar"); event.target.value = ""; }} /></label>}</div><div><h2 id="social-title">{profile.name}, {profile.age}</h2><p><MapPin size={14} /> {profile.location}</p></div>{onContact && <button type="button" className="direct-contact-button social-contact" onClick={()=>{if(onContact()===false)setNotice("Primero necesitas un match en Conexiones para conversar.");}}><MessageCircle size={16} /> Conversar</button>}</div>
        {own&&<section className="profile-card-photo-settings"><div className="card-photo-preview"><BlobMedia fallback={record.cardUrl??record.avatarUrl??profile.image} alt="Foto para Aventura y Conexiones"/></div><div><h3>Foto para Aventura y Conexiones</h3><p>{record.cardUrl?'Estás usando una foto especial para tus tarjetas.':'Tus tarjetas usan tu foto de perfil.'} Puedes elegir otra en formato vertical sin cambiar tu avatar.</p><div className="card-photo-actions"><label>Elegir foto vertical<input type="file" aria-label="Elegir foto para Aventura y Conexiones" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={busy||loading} onChange={(event)=>{void changePhoto(event.target.files?.[0],'card');event.target.value='';}}/></label>{record.cardUrl&&<button type="button" disabled={busy} onClick={()=>void resetCardPhoto()}>Usar foto de perfil</button>}</div></div></section>}
        <ProfileSafety profileId={profile.id} onBlocked={onClose}/>
        <p className="social-bio">{profile.bio}</p><div className="tile-tags">{profile.interests.map((interest, index) => <span className="interest-tag" key={`${interest}-${index}`}>{interest}</span>)}</div>
        
        {loading && <p role="status">Cargando perfil…</p>}{error && <p className="social-error" role="alert">{error}</p>}{notice && <p className="social-notice" role="status">{notice}</p>}
        <StoryCarousel className="social-stories">{own && <button type="button" className="story-add" disabled={loading || busy} onClick={() => { setStoryMode(true); fileInput.current?.click(); }}><span><Plus size={22} /></span>Tu historia</button>}{stories.map((item) => <button type="button" className="story-ring" key={item.id} onClick={() => setStory(item)}><span>{item.kind === "video" ? <BlobMedia fallback={item.posterUrl} loopSrc={item.previewUrl} alt="Portada de historia" /> : <BlobMedia blob={item.media} fallback={item.mediaUrl} alt="Historia" />}</span><small>{new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(item.createdAt)}</small></button>)}</StoryCarousel>
        {own && <form className="social-composer" onSubmit={upload}><div className="social-composer-heading"><ImagePlus size={18} /><strong>Comparte un momento</strong><label><input type="checkbox" checked={storyMode} onChange={(event) => setStoryMode(event.target.checked)} /> Historia · 24 h</label></div><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm" disabled={loading || busy} onChange={(event) => { const selected = event.target.files?.[0]; setFile(null); if (selected) { try { validateFile(selected); setFile(selected);setVideoOptions({}); setError(""); } catch (err) { setError((err as Error).message); } } }} /><small>Fotos hasta 8 MB · Videos hasta 25 MB</small>{file && <UploadEditor key={`${file.name}-${file.size}-${file.lastModified}`} file={file} disabled={busy} onFile={setFile} options={videoOptions} onOptions={setVideoOptions}/>}<textarea maxLength={500} rows={2} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Cuenta algo sobre este momento…" aria-label="Descripción de la publicación" /><button type="submit" className="like-button" disabled={!file || busy || loading}>{busy ? "Guardando…" : storyMode ? "Publicar historia" : "Publicar"}</button></form>}
        <div className="social-tabs" role="group" aria-label="Contenido del perfil"><button type="button" aria-pressed={tab === "posts"} className={tab === "posts" ? "active" : ""} onClick={() => setTab("posts")}><Grid2X2 size={17} /> Publicaciones</button><button type="button" aria-pressed={tab === "videos"} className={tab === "videos" ? "active" : ""} onClick={() => setTab("videos")}><Film size={17} /> Videos</button>{profile.adventureAvailable && <button type="button" aria-pressed={tab === "reviews"} className={tab === "reviews" ? "active" : ""} onClick={() => setTab("reviews")}><Star size={17} /> Reseñas</button>}</div>
        {tab !== "reviews" ? posts.length ? <div className="social-post-grid">{posts.map((post) => <article className="social-post" key={post.id}><ProfilePostMedia post={post} alt={post.caption || `Publicación de ${profile.name}`} /><PostInteractions post={post} onRefresh={async()=>setRecord(await readSocialRecord(profile.id))}/><div><p>{post.caption}</p><time>{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(post.createdAt)}</time>{own && <button type="button" className="social-delete" disabled={busy} aria-label="Eliminar publicación" onClick={() => void save({ ...record, posts: record.posts.filter((item) => item.id !== post.id) })}><Trash2 size={16} /></button>}</div></article>)}</div> : <div className="social-empty"><ImagePlus size={28} /><h3>{tab === "videos" ? "Todavía no hay videos" : "Cada historia empieza con un momento"}</h3><p>{own ? "Sube tu primera foto o video desde el formulario de arriba." : "Las publicaciones de esta persona aparecerán aquí."}</p></div> : <div className="social-reviews">
          <p className="social-local-note">Reseñas sobre encuentros no comerciales, habilitadas por invitación. La invitación no verifica el encuentro.</p>
          {own && <form className="review-invite-form" onSubmit={invite}><h3>Habilitar una reseña</h3><p>Invita a alguien de tus conversaciones. Solo podrá dejar una reseña.</p><label>Persona<select required value={recipient} onChange={(event) => setRecipient(event.target.value)} disabled={loading || busy}><option value="">Selecciona una conversación</option>{contacts.filter((contact) => !record.invitations.some((item) => item.recipientId === contact.id)).map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label><label className="review-consent"><input type="checkbox" checked={encounterConfirmed} onChange={(event) => setEncounterConfirmed(event.target.checked)} required /> Confirmo que tuvimos un encuentro no comercial.</label><button type="submit" className="direct-contact-button" disabled={!recipient || !encounterConfirmed || loading || busy}>Habilitar reseña</button>{!contacts.length && <small>Inicia una conversación para poder invitar a esa persona.</small>}</form>}
          {own && record.invitations.map((invitation) => { const used = record.reviews.some((review) => review.invitationId === invitation.id); return <div key={invitation.id} className="review-invitation"><span>{invitation.recipientName} · {used ? "Reseña publicada" : "Invitación pendiente"}</span>{!used && <><button type="button" disabled={busy} onClick={() => void save({ ...record, invitations: record.invitations.filter((item) => item.id !== invitation.id) })}>Revocar</button></>}</div>; })}
          {reviewable && <form className="review-write-form" onSubmit={submitReview}><h3>Recibiste una invitación</h3><label>Calificación<select value={stars} onChange={(event) => setStars(Number(event.target.value))}>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} estrellas</option>)}</select></label><textarea required maxLength={600} rows={3} value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="Comparte tu experiencia con respeto…" aria-label="Tu reseña" /><button type="submit" className="like-button" disabled={!reviewText.trim() || busy}>Publicar reseña</button></form>}
          {!own && !reviewable && <p className="social-local-note">Solo puedes escribir si esta persona te habilita una invitación.</p>}
          {record.reviews.filter((review) => !review.simulated).length ? record.reviews.filter((review) => !review.simulated).map((review) => <article className="social-review" key={review.id}><strong>{review.authorName}</strong><span className="review-stars" aria-label={`${review.stars} de 5 estrellas`}>{"★".repeat(review.stars)}{"☆".repeat(5-review.stars)}</span><small>Por invitación</small><p>{review.text}</p><button type="button" disabled={busy || review.reported} onClick={() => void save({ ...record, reviews: record.reviews.map((item) => item.id === review.id ? { ...item, reported: true } : item) })}>{review.reported ? "Reportada para revisión" : "Reportar"}</button></article>) : <p className="social-empty">Todavía no hay reseñas.</p>}
        </div>}
      </div>
      {story && stories.length > 0 && <StoryPlayer groups={[{ person: profile, avatar: record.avatar, stories }]} initial={{ group: 0, story: Math.max(0, stories.findIndex((item) => item.id === story.id)) }} onClose={() => setStory(null)} onProfile={() => setStory(null)} onDelete={own ? (id) => { if (!busy) void save({ ...record, posts: record.posts.filter((item) => item.id !== id) }).then((saved) => { if (saved) setStory(null); }); } : undefined} />}
    </div>
    {crop&&<PhotoCropper file={crop.file} title={crop.field==='card'?'Foto para tus tarjetas':'Ajusta tu foto de perfil'} onCancel={()=>setCrop(null)} onSave={saveCrop}/>}
  </div>;
}
