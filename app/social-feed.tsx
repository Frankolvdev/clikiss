"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Bookmark, Heart, ImagePlus, MessageCircle, Plus, Send, Share2, Sparkles, Trash2 } from "lucide-react";
import { useAuth } from "./auth-context";
import type { Profile } from "./data";
import { BlobMedia } from "./blob-media";
import { updateSocialRecord, type SocialRecord, type SocialPost } from "./social-store";
import { groupStories, type StoryGroup, type StoryCursor } from "./story-model";
import StoryPlayer from "./story-player";
import FeedComposer from "./feed-composer";
import FeedMedia from "./feed-media";
import StoryCarousel from "./story-carousel";
import { feedDataSource } from "./feed-source";
import { applyPostCommand, matchesFeedFilter, type FeedCursor, type FeedItem, type PostCommand } from "./feed-model";

type Person = Pick<Profile, "id" | "name" | "image" | "avatarVideo">;
export default function SocialFeed({ people, onOpen }: { people: Person[]; onOpen: (id: string) => void }) {
  const { requireAccount } = useAuth();
  function compose(kind: "post" | "story") { if (requireAccount()) setComposer(kind); }
  const [records, setRecords] = useState<SocialRecord[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<FeedCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageSize = useRef(12);
  const generation = useRef(0);
  const moreLock = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const profileIdsKey = people.map((person) => person.id).join(",");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "photo" | "video" | "saved">("all");
  const [now, setNow] = useState(() => Date.now());
  const [composer, setComposer] = useState<"story" | "post" | null>(null);
  const [viewer, setViewer] = useState<{ groups: StoryGroup[]; initial: StoryCursor } | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [commentsId, setCommentsId] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  useEffect(() => {
    let active = true;
    pageSize.current = 12;
    moreLock.current = false;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true); setFeedItems([]); setLoadingMore(false);
      try { const saved = JSON.parse(localStorage.getItem("conecta-stories-seen-v1") ?? "[]"); if (Array.isArray(saved)) setSeen(saved.filter((id) => typeof id === "string")); } catch { /* View history is optional. */ }
    });
    const refresh = (event?: Event) => {
      if ((event as (Event & { postId?: string }) | undefined)?.postId) return;
      const request = ++generation.current;
      const fetchLoadedPages = async () => {
        const page = await feedDataSource.page(filter, null, Math.min(120, pageSize.current), profileIdsKey.split(","));
        while (page.nextCursor && page.items.length < pageSize.current && active && request === generation.current) {
          const next = await feedDataSource.page(filter, page.nextCursor, Math.min(120, pageSize.current - page.items.length), profileIdsKey.split(","));
          page.items.push(...next.items); page.nextCursor = next.nextCursor;
        }
        return page;
      };
      Promise.all([fetchLoadedPages(), feedDataSource.stories(Date.now())]).then(([page, stories]) => {
        if (active && request === generation.current) { setFeedItems(page.items); setNextCursor(page.nextCursor); setRecords(stories); setError(""); setNow(Date.now()); }
      }).catch((err) => { if (active && request === generation.current) setError(err.message); }).finally(() => { if (active && request === generation.current) { setLoading(false); moreLock.current = false; setLoadingMore(false); } });
    };
    refresh();
    window.addEventListener("conecta-social-update", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => { active = false; generation.current++; clearInterval(timer); window.removeEventListener("conecta-social-update", refresh); window.removeEventListener("focus", refresh); };
  }, [filter, profileIdsKey]);
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || moreLock.current || loading) return;
    const request = generation.current;
    moreLock.current = true; setLoadingMore(true); setError("");
    try {
      const page = await feedDataSource.page(filter, nextCursor, 12, profileIdsKey.split(","));
      if (request === generation.current) { setFeedItems((items) => [...items, ...page.items]); setNextCursor(page.nextCursor); pageSize.current += page.items.length; }
    } catch (err) { if (request === generation.current) setError(err instanceof Error ? err.message : "No se pudo cargar más contenido."); }
    finally { if (request === generation.current) { moreLock.current = false; setLoadingMore(false); } }
  }, [nextCursor, loadingMore, loading, filter, profileIdsKey, setLoadingMore, setError, setFeedItems, setNextCursor]);
  useEffect(() => {
    if (!sentinel.current || !nextCursor || loading || loadingMore || error || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void loadMore(); }, { rootMargin: "400px" });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [loadMore, nextCursor, loading, loadingMore, error]);
  const markSeen = useCallback((id: string) => {
    setSeen((items) => { if (items.includes(id)) return items; const next = [...items, id].slice(-1000); try { localStorage.setItem("conecta-stories-seen-v1", JSON.stringify(next)); } catch { /* Still playable when storage is unavailable. */ } return next; });
  }, []);
  const closeViewer = useCallback(() => setViewer(null), []);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  for (const item of feedItems) if(item.person) peopleById.set(item.person.id,item.person);
  for (const record of records) if(record.person) peopleById.set(record.person.id,record.person);
  const entries = feedItems.flatMap((item) => { const person = peopleById.get(item.profileId); return person ? [{ post: item.post, person, avatar: item.avatar }] : []; });
  const groups = groupStories(records, [...peopleById.values()], now);
  const ownGroup = groups.find((group) => group.person.id === "me");
  function openStories(personId: string) {
    const index = groups.findIndex((group) => group.person.id === personId);
    if (index < 0) return;
    const unread = groups[index].stories.findIndex((story) => !seen.includes(story.id));
    setViewer({ groups, initial: { group: index, story: unread < 0 ? 0 : unread } });
  }
  async function mutatePost(profileId: string, postId: string, command: PostCommand) {
    if (!requireAccount() || busy) return false;
    setBusy(true); setError("");
    try {
      await feedDataSource.mutate(profileId, postId, command);
      setFeedItems((items) => items.flatMap((item) => {
        if (item.post.id !== postId) return [item];
        const post = applyPostCommand(item.post, command, "me");
        return matchesFeedFilter(post, filter) ? [{ ...item, post }] : [];
      }));
      return true;
    }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar."); return false; }
    finally { setBusy(false); }
  }
  function react(profileId: string, postId: string, field: "likedBy" | "savedBy", likeOnly = false) {
    const post = feedItems.find((item) => item.post.id === postId)?.post;
    void mutatePost(profileId, postId, { type: field === "likedBy" ? "like" : "save", value: likeOnly || !post?.[field]?.includes("me") });
  }
  async function comment(event: FormEvent, profileId: string, postId: string) {
    event.preventDefault(); const text = commentDraft.trim(); if (!text || busy) return;
    const item = { id: crypto.randomUUID(), authorId: "me", authorName: people.find((person) => person.id === "me")?.name ?? "Tú", text, createdAt: Date.now() };
    if (await mutatePost(profileId, postId, { type: "add-comment", comment: item })) setCommentDraft("");
  }
  async function share(post: SocialPost) {
    try {
      const resource = post.media ?? await feedDataSource.media(post.id);
      const media = typeof resource === "string" ? await fetch(resource).then((response) => { if (!response.ok) throw new Error("No se pudo descargar el archivo."); return response.blob(); }) : resource;
      const extension = post.kind === "video" ? (media.type === "video/webm" ? "webm" : "mp4") : media.type.split("/")[1] || "jpg";
      const file = new File([media], `clikiss-${post.id}.${extension}`, { type: media.type });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Un momento en CliKiss", text: post.caption });
      else { const url = URL.createObjectURL(file); const link = document.createElement("a"); link.href = url; link.download = file.name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 10000); }
    } catch (err) { if (!(err instanceof DOMException && err.name === "AbortError")) setError("No se pudo compartir este archivo."); }
  }
  return <section className="social-feed">
    <div className="page-heading"><div><div className="eyebrow"><Sparkles size={14} /> MOMENTOS QUE CONECTAN</div><h1>Descubre su <span>mundo.</span></h1><p>Historias, fotos y videos. Una forma más personal de conocer a alguien.</p></div><button type="button" className="social-profile-launch" onClick={() => compose("post")}><Plus size={16} /> Publicar</button></div>
    <div className="feed-layout"><div className="feed-main">
      <StoryCarousel className="feed-stories"><div className="own-story-control"><button type="button" className={ownGroup ? "story-ring" : "story-add"} onClick={() => ownGroup ? openStories("me") : compose("story")}><span>{ownGroup ? <BlobMedia blob={ownGroup.avatar ?? (ownGroup.stories[0].kind === "photo" ? ownGroup.stories[0].media : undefined)} fallback={ownGroup.stories[0].kind === "photo" ? ownGroup.stories[0].mediaUrl : undefined} alt="Tu historia" /> : <Plus size={22} />}</span>Tu historia</button><button type="button" className="story-add-badge" aria-label="Agregar otra historia" onClick={() => compose("story")}><Plus size={15} /></button></div>{groups.filter((group) => group.person.id !== "me").map((group) => <button type="button" className={`story-ring ${group.stories.every((story) => seen.includes(story.id)) ? "seen" : ""}`} key={group.person.id} onClick={() => openStories(group.person.id)} aria-label={`Ver ${group.stories.length} historias de ${group.person.name}`}><span><BlobMedia blob={group.avatar} fallback={group.person.image} loopSrc={group.person.avatarVideo} alt={group.person.name} /></span><small>{group.person.name}</small></button>)}{!groups.length && <p className="feed-stories-hint">Los momentos duran 24 horas.<br />Comparte el primero.</p>}</StoryCarousel>
      <div className="feed-filters" role="group" aria-label="Filtrar publicaciones">{([{ id: "all", label: "Para ti" }, { id: "photo", label: "Fotos" }, { id: "video", label: "Videos" }, { id: "saved", label: "Guardados" }] as const).map(({ id, label }) => <button type="button" key={id} aria-pressed={filter === id} className={filter === id ? "active" : ""} onClick={() => (id !== "saved" || requireAccount()) && setFilter(id)}>{label}</button>)}</div>
      {loading && <p role="status">Cargando momentos…</p>}{error && <p className="social-error" role="alert">{error}</p>}
      {entries.map(({ post, person, avatar }) => <article className="feed-post" key={`${person.id}-${post.id}`}><header><button type="button" className="feed-author" onClick={() => onOpen(person.id)}><BlobMedia blob={avatar} fallback={person.image} loopSrc={person.avatarVideo} className="feed-avatar" alt={person.name} /><span><strong>{person.name}</strong><small>{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(post.createdAt)}</small></span></button><button type="button" className="social-open-link" onClick={() => onOpen(person.id)} aria-label={`Abrir perfil de ${person.name}`}><ArrowRight size={19} /></button></header><div onDoubleClick={post.kind === "photo" ? () => react(person.id, post.id, "likedBy", true) : undefined}><FeedMedia post={post} suspended={Boolean(composer || viewer)} alt={post.caption || `Publicación de ${person.name}`} /></div><div className="feed-post-copy">
        <div className="feed-actions"><button type="button" disabled={busy} className={post.likedBy?.includes("me") ? "liked" : ""} aria-label={post.likedBy?.includes("me") ? "Quitar me gusta" : "Me gusta"} aria-pressed={Boolean(post.likedBy?.includes("me"))} onClick={() => react(person.id, post.id, "likedBy")}><Heart size={23} fill={post.likedBy?.includes("me") ? "currentColor" : "none"} /></button><button type="button" aria-label="Comentar" onClick={() => { setCommentsId(commentsId === post.id ? "" : post.id); setCommentDraft(""); }}><MessageCircle size={23} /></button><button type="button" aria-label="Compartir archivo o descargar" onClick={() => void share(post)}><Share2 size={21} /></button><button type="button" className="feed-save" disabled={busy} aria-label={post.savedBy?.includes("me") ? "Quitar de guardados" : "Guardar publicación"} aria-pressed={Boolean(post.savedBy?.includes("me"))} onClick={() => react(person.id, post.id, "savedBy")}><Bookmark size={23} fill={post.savedBy?.includes("me") ? "currentColor" : "none"} /></button></div>
        <small className="feed-like-count">{post.likeCount ?? post.likedBy?.length ?? 0} me gusta</small>{post.caption && <p><button type="button" className="profile-name-link" onClick={() => onOpen(person.id)}><strong>{person.name}</strong></button> {post.caption}</p>}<button type="button" className="feed-comments-toggle" onClick={() => { setCommentsId(commentsId === post.id ? "" : post.id); setCommentDraft(""); }}>{commentsId === post.id ? "Ocultar comentarios" : `Ver comentarios (${post.comments?.length ?? 0})`}</button>
        {commentsId === post.id && <div className="feed-comments">{post.comments?.map((item) => <div className="feed-comment" key={item.id}><p><button type="button" className="profile-name-link" onClick={() => onOpen(item.authorId)}><strong>{item.authorName}</strong></button> {item.text}</p>{item.authorId === "me" && <button type="button" disabled={busy} aria-label="Eliminar tu comentario" onClick={() => void mutatePost(person.id, post.id, { type: "delete-comment", commentId: item.id })}><Trash2 size={14} /></button>}</div>)}<form onSubmit={(event) => void comment(event, person.id, post.id)}><input autoFocus aria-label="Agregar comentario" placeholder="Agrega un comentario…" value={commentDraft} maxLength={500} onChange={(event) => setCommentDraft(event.target.value)} /><button type="submit" disabled={busy || !commentDraft.trim()} aria-label="Publicar comentario"><Send size={17} /></button></form></div>}
      </div></article>)}
      <div ref={sentinel} className="feed-load-more">{loadingMore && <p role="status">Cargando más momentos…</p>}{nextCursor && <button type="button" disabled={loadingMore} className="social-profile-launch" onClick={() => void loadMore()}>Ver más momentos</button>}</div>
      {!loading && !error && !entries.length && <div className="social-empty"><ImagePlus size={32} /><h3>{filter === "saved" ? "Tus momentos favoritos van aquí" : filter === "video" ? "Todavía no hay videos" : filter === "photo" ? "Todavía no hay fotos" : "El primer momento puede ser tuyo"}</h3><p>{filter === "saved" ? "Guarda una publicación con el marcador." : "Las publicaciones de la comunidad aparecerán aquí."}</p>{filter !== "saved" && <button type="button" className="like-button" onClick={() => compose("post")}>Compartir un momento</button>}</div>}
    </div><aside className="feed-suggestions"><h2>Personas para descubrir</h2>{people.filter((person) => person.id !== "me").map((person) => <button type="button" key={person.id} className="feed-suggestion" onClick={() => onOpen(person.id)}><BlobMedia fallback={person.image} loopSrc={person.avatarVideo} className="feed-avatar" alt={person.name} /><span><strong>{person.name}</strong><small>Explorar perfil</small></span><ArrowRight size={15} /></button>)}</aside></div>
    {composer && <FeedComposer initialStory={composer === "story"} onClose={() => setComposer(null)} />}
    {viewer && <StoryPlayer groups={viewer.groups} initial={viewer.initial} onClose={closeViewer} onSeen={markSeen} onDelete={(id) => { void updateSocialRecord("me", (record) => ({ ...record, posts: record.posts.filter((post) => post.id !== id) })).then(() => setViewer(null)).catch((err) => { setViewer(null); setError(err.message); }); }} onProfile={(id) => { setViewer(null); onOpen(id); }} />}
  </section>;
}
