"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Pause, Play, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { BlobMedia } from "./blob-media";
import { feedDataSource } from "./feed-source";
import { useMediaAudio } from "./use-media-audio";
import { moveStory, type StoryGroup, type StoryCursor } from "./story-model";

type Props = { groups: StoryGroup[]; initial: StoryCursor; onClose: () => void; onProfile: (id: string) => void; onSeen?: (id: string) => void; onDelete?: (id: string) => void };

function StorySlide({ groups, cursor, onMove, onClose, onProfile, onSeen, onDelete }: Omit<Props, "initial"> & { cursor: StoryCursor; onMove: (direction: 1 | -1) => void }) {
  const group = groups[cursor.group];
  const story = group.stories[cursor.story];
  const isVideo = story.kind === "video";
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState("");
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [muted, setMuted] = useMediaAudio();
  const [ready, setReady] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const elapsed = useRef(0);
  const pointer = useRef<{ x: number; y: number; time: number } | null>(null);
  const stopped = paused || held || hidden;
  useEffect(() => {
    let cancelled = false, value: string | undefined;
    (story.media ? Promise.resolve(story.media) : story.mediaUrl ? Promise.resolve(story.mediaUrl) : feedDataSource.media(story.id)).then((resource) => {
      if (!cancelled) { if (typeof resource === "string") setUrl(resource); else { value = URL.createObjectURL(resource); setUrl(value); } }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (value) URL.revokeObjectURL(value); };
  }, [story.media, story.mediaUrl, story.id]);
  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    changed(); document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => { if (ready) onSeen?.(story.id); }, [ready, story.id, onSeen]);
  useEffect(() => {
    if (!isVideo || !url) return;
    const element = video.current;
    if (!element) return;
    if (stopped) element.pause();
    else void element.play().catch(() => setPaused(true));
  }, [isVideo, url, stopped]);
  useEffect(() => {
    if (!ready || stopped || buffering || failed) return;
    let frame = 0, last = performance.now();
    const tick = (time: number) => {
      if (Date.now() - story.createdAt >= 86400000) { onMove(1); return; }
      if (isVideo) {
        const element = video.current;
        if (element && Number.isFinite(element.duration) && element.duration > 0) setProgress(Math.min(1, element.currentTime / element.duration));
      } else {
        elapsed.current += Math.min(time - last, 250);
        const next = Math.min(1, elapsed.current / 5000);
        setProgress(next);
        if (next === 1) { onMove(1); return; }
      }
      last = time; frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready, stopped, buffering, failed, isVideo, onMove, story.createdAt]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") { event.preventDefault(); onMove(1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); onMove(-1); }
      if (event.code === "Space" && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); setPaused((value) => !value); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onMove]);
  return <>
    <button type="button" className="story-side-arrow previous" aria-label="Historia anterior" onClick={() => onMove(-1)}><ChevronLeft size={26} /></button>
    <div className="story-screen">
      <div className="story-timeline" aria-label={`Historia ${cursor.story + 1} de ${group.stories.length}`}>
        {group.stories.map((item, index) => <span key={item.id} role={index === cursor.story ? "progressbar" : undefined} aria-valuemin={index === cursor.story ? 0 : undefined} aria-valuemax={index === cursor.story ? 100 : undefined} aria-valuenow={index === cursor.story ? Math.round(progress * 100) : undefined} aria-label={index === cursor.story ? "Progreso de la historia" : undefined}><i style={{ transform: `scaleX(${index < cursor.story ? 1 : index === cursor.story ? progress : 0})` }} /></span>)}
      </div>
      <header className="story-player-header"><button type="button" className="feed-author" onClick={() => onProfile(group.person.id)}><BlobMedia blob={group.avatar} fallback={group.person.image} loopSrc={group.person.avatarVideo} className="feed-avatar" alt={group.person.name} /><span><strong>{group.person.name}</strong><small>{new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(story.createdAt)}</small></span></button><div><button type="button" aria-label={paused ? "Reanudar historia" : "Pausar historia"} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={19} /> : <Pause size={19} />}</button>{isVideo && <button type="button" aria-label={muted ? "Activar sonido" : "Silenciar"} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>}{onDelete && group.person.id === "me" && <button type="button" aria-label="Eliminar tu historia" onClick={() => onDelete(story.id)}><Trash2 size={17} /></button>}<button type="button" aria-label="Cerrar historias" onClick={onClose}><X size={22} /></button></div></header>
      <div className="story-playback" onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); pointer.current = { x: event.clientX, y: event.clientY, time: performance.now() }; setHeld(true); }} onPointerCancel={() => { pointer.current = null; setHeld(false); }} onPointerUp={(event) => {
        const start = pointer.current; pointer.current = null; setHeld(false); if (!start) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { onMove(dx < 0 ? 1 : -1); return; }
        if (dy > 100 && Math.abs(dy) > Math.abs(dx)) { onClose(); return; }
        if (performance.now() - start.time > 250) return;
        if (isVideo) setPaused((value) => !value);
        else { const bounds = event.currentTarget.getBoundingClientRect(); const position = (event.clientX - bounds.left) / bounds.width; if (position < .3) onMove(-1); else if (position > .7) onMove(1); else setPaused((value) => !value); }
      }}>
        {url && (isVideo ? <video poster={story.posterUrl} ref={video} src={url} playsInline muted={muted} preload="auto" onLoadedMetadata={() => setReady(true)} onWaiting={() => setBuffering(true)} onPlaying={() => { setBuffering(false); setReady(true); }} onEnded={() => onMove(1)} onError={() => setFailed(true)} /> : <img src={url} alt={story.caption || `Historia de ${group.person.name}`} draggable={false} onLoad={() => setReady(true)} onError={() => setFailed(true)} />)}
        {failed ? <div className="story-status">No se pudo reproducir este archivo.<button type="button" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onClick={() => onMove(1)}>Siguiente historia</button></div> : (!ready || buffering) ? <span className="story-status" role="status">Cargando…</span> : stopped ? <span className="story-paused"><Pause size={32} /></span> : null}
      </div>
      <footer className="story-player-caption">{story.caption && <p>{story.caption}</p>}<small>{isVideo ? "Toca el video para pausar · Desliza para avanzar" : "Toca los lados para avanzar · Mantén pulsado para pausar"}</small><div className="story-mobile-nav"><button type="button" onClick={() => onMove(-1)}><ChevronLeft size={18} /> Anterior</button><button type="button" onClick={() => onMove(1)}>Siguiente <ChevronRight size={18} /></button></div></footer>
    </div>
    <button type="button" className="story-side-arrow next" aria-label="Historia siguiente" onClick={() => onMove(1)}><ChevronRight size={26} /></button>
  </>;
}

export default function StoryPlayer({ groups, initial, onClose, onProfile, onSeen, onDelete }: Props) {
  const [cursor, setCursor] = useState(initial);
  const root = useRef<HTMLDivElement>(null);
  const move = useCallback((direction: 1 | -1) => { const next = moveStory(groups, cursor, direction); if (next) setCursor(next); else onClose(); }, [groups, cursor, onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; root.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => { if (!root.current?.contains(document.activeElement)) root.current?.focus(); }, [cursor]);
  const group = groups[cursor.group];
  if (!group?.stories[cursor.story]) return null;
  return createPortal(<div className="story-player-backdrop" ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Historias de ${group.person.name}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={(event) => {
    event.stopPropagation();
    if (event.key === "Escape") onClose();
    if (event.key === "Tab") {
      const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button") ?? []).filter((item) => item.getClientRects().length);
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first?.focus(); }
    }
  }}><StorySlide key={group.stories[cursor.story].id} groups={groups} cursor={cursor} onMove={move} onClose={onClose} onProfile={onProfile} onSeen={onSeen} onDelete={onDelete} /></div>, document.body);
}
