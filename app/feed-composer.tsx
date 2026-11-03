"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "./auth-context";
import { createPortal } from "react-dom";
import { Camera, Film, X } from "lucide-react";
import UploadEditor, {preparePhoto,type VideoOptions} from "./upload-editor";
import { mediaDimensions } from "./media-metadata";
import { updateSocialRecord, type SocialPost } from "./social-store";

export default function FeedComposer({ initialStory, onClose }: { initialStory: boolean; onClose: () => void }) {
  const { requireAccount } = useAuth();
  const [story, setStory] = useState(initialStory);
  const [files, setFiles] = useState<File[]>([]);
  const [options,setOptions]=useState<VideoOptions[]>([]);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; root.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  function kind(file: File) {
    const photo = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(file.type);
    if (!photo && !["video/mp4", "video/webm"].includes(file.type)) throw new Error("Selecciona fotos JPG, PNG, WebP, GIF, AVIF o videos MP4/WebM.");
    if (file.size > (photo ? 8 : 25) * 1024 * 1024) throw new Error(`${file.name}: máximo ${photo ? 8 : 25} MB.`);
    return photo ? "photo" as const : "video" as const;
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!requireAccount() || !files.length || busy) return;
    setBusy(true); setError("");
    try {
      const created = Date.now();
      const posts: SocialPost[] = await Promise.all(files.map(async (file, index) => {const prepared=await preparePhoto(file);return {...options[index], ...(await mediaDimensions(prepared)), id: crypto.randomUUID(), caption: caption.trim(), createdAt: created + index, kind: kind(prepared), media: prepared, story };}));
      await updateSocialRecord("me", (record) => ({ ...record, posts: [...record.posts.filter((post) => !post.story || created - post.createdAt < 86400000), ...posts] }));
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo publicar."); }
    finally { setBusy(false); }
  }
  return createPortal(<div className="feed-composer-backdrop" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}><div className="feed-composer-dialog" ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="feed-composer-title" onKeyDown={(event) => {
    if (event.key === "Escape" && !busy) onClose();
    if (event.key === "Tab") {
      const controls = Array.from(root.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)") ?? []).filter((item) => item.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first?.focus(); }
    }
  }}><button type="button" className="social-close" disabled={busy} aria-label="Cerrar publicación" onClick={onClose}><X size={22} /></button><h2 id="feed-composer-title">{story ? "Comparte tu historia" : "Crea una publicación"}</h2><p>Publica directamente en Momentos.</p><form onSubmit={submit}><div className="feed-filters"><button type="button" disabled={busy} aria-pressed={!story} className={!story ? "active" : ""} onClick={() => { setStory(false); setFiles((items) => items.slice(0, 1)); }}>Publicación</button><button type="button" disabled={busy} aria-pressed={story} className={story ? "active" : ""} onClick={() => setStory(true)}>Historia · 24 h</button></div><label className="composer-file-label"><span><Camera size={20} /><Film size={20} /> Elegir fotos o videos</span><input type="file" multiple={story} disabled={busy} accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm" onChange={(event) => {
      try { const selected = Array.from(event.target.files ?? []); if (selected.length > 10) throw new Error("Puedes publicar hasta 10 historias a la vez."); selected.forEach(kind); setFiles(selected);setOptions([]); setError(""); }
      catch (err) { setFiles([]); setError((err as Error).message); event.target.value = ""; }
    }} /></label><small>Fotos hasta 8 MB · Videos hasta 25 MB{story ? " · Hasta 10 historias en orden" : ""}</small><div className="composer-previews">{files.map((file, index) => <figure key={`${file.name}-${index}`}><UploadEditor key={`${file.name}-${file.size}-${file.lastModified}`} file={file} disabled={busy} onFile={value=>setFiles(items=>items.map((item,i)=>i===index?value:item))} options={options[index]??{}} onOptions={value=>setOptions(items=>{const next=[...items];next[index]=value;return next;})}/><figcaption>{index + 1}. {file.name}</figcaption></figure>)}</div><textarea aria-label="Descripción" maxLength={500} rows={3} placeholder="Cuenta algo sobre este momento…" value={caption} disabled={busy} onChange={(event) => setCaption(event.target.value)} />{error && <p role="alert" className="social-error">{error}</p>}<button type="submit" className="like-button" disabled={!files.length || busy}>{busy ? "Publicando…" : story ? `Publicar ${files.length > 1 ? "historias" : "historia"}` : "Publicar"}</button></form></div></div>, document.body);
}
