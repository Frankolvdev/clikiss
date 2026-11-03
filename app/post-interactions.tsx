"use client";

import {useRef, useState} from "react";
import {Heart, Bookmark, MessageCircle, Trash2, Send} from "lucide-react";
import {useAuth} from "./auth-context";
import {feedDataSource} from "./feed-source";
import type {PostCommand} from "./feed-model";
import type {SocialPost} from "./social-store";

export default function PostInteractions({post, onRefresh}: {post: SocialPost; onRefresh: () => Promise<void>}) {
  const {requireAccount} = useAuth();
  const [busy, setBusy] = useState(false), [text, setText] = useState(""), [open, setOpen] = useState(false), [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function act(command: PostCommand) {
    if (!requireAccount() || busy) return;
    setBusy(true); setError("");
    try {
      await feedDataSource.mutate("", post.id, command);
      await onRefresh();
      window.dispatchEvent(new Event("conecta-social-update"));
      if (command.type === "add-comment") {setText(""); input.current?.focus();}
    } catch (err) {setError((err as Error).message);}
    finally {setBusy(false);}
  }
  const liked = post.likedBy?.includes("me") ?? false;
  const saved = post.savedBy?.includes("me") ?? false;
  const count = post.likeCount ?? post.likedBy?.length ?? 0;
  function toggleComments() {
    if (!requireAccount()) return;
    setOpen(!open);
    if (!open) requestAnimationFrame(() => input.current?.focus());
  }
  return <section className="profile-interactions" aria-label="Interacciones de la publicación">
    <div className="profile-action-bar">
      <button type="button" disabled={busy} aria-label="Me gusta" aria-pressed={liked} onClick={() => void act({type:"like", value:!liked})}><Heart size={22} fill={liked ? "currentColor" : "none"}/></button>
      <button type="button" aria-label="Comentar" aria-expanded={open} onClick={toggleComments}><MessageCircle size={22}/></button>
      <button className="profile-save-action" type="button" disabled={busy} aria-label="Guardar publicación" aria-pressed={saved} onClick={() => void act({type:"save", value:!saved})}><Bookmark size={21} fill={saved ? "currentColor" : "none"}/></button>
    </div>
    <div className="profile-reaction-summary"><strong>{count.toLocaleString("es-MX")} me gusta</strong><button type="button" onClick={toggleComments}>{open ? "Ocultar comentarios" : `Ver comentarios (${post.comments?.length ?? 0})`}</button></div>
    {open && <div className="profile-comment-panel">
      <ul className="profile-comment-list">{[...(post.comments ?? [])].reverse().map(comment => <li key={comment.id}>
        <span className="comment-initial" aria-hidden="true">{comment.authorName.charAt(0).toUpperCase() || "C"}</span>
        <div className="comment-copy"><p><strong>{comment.authorName}</strong> <span>{comment.text}</span></p><time dateTime={new Date(comment.createdAt).toISOString()}>{new Intl.DateTimeFormat("es-MX", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"}).format(comment.createdAt)}</time></div>
        {comment.authorId === "me" && <button className="comment-delete" type="button" disabled={busy} aria-label="Eliminar comentario" onClick={() => void act({type:"delete-comment", commentId:comment.id})}><Trash2 size={14}/></button>}
      </li>)}</ul>
      {!post.comments?.length && <p className="comment-empty">Inicia la conversación. Comparte algo bonito.</p>}
      <form className="profile-comment-form" onSubmit={event => {event.preventDefault(); if (text.trim()) void act({type:"add-comment", comment:{id:crypto.randomUUID(), text:text.trim(), authorId:"me", authorName:"", createdAt:Date.now()}});}}>
        <input ref={input} aria-label="Escribe un comentario" maxLength={500} value={text} disabled={busy} onChange={event => setText(event.target.value)} placeholder="Añade un comentario…"/>
        <button type="submit" aria-label="Publicar" disabled={busy || !text.trim()}><Send size={17}/></button>
      </form>
    </div>}
    {error && <p className="interaction-error" role="alert">{error}</p>}
  </section>;
}
