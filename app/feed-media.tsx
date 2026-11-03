"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { feedDataSource } from "./feed-source";
import { mediaFrame } from "./feed-model";
import { registerFeedVideo } from "./feed-playback";
import type { SocialPost } from "./social-store";
import { useMediaAudio } from "./use-media-audio";

export default function FeedMedia({ post, suspended, alt }: { post: SocialPost; suspended: boolean; alt: string }) {
  const root = useRef<HTMLDivElement>(null);
  const instance=useId();
  const video = useRef<HTMLVideoElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const registration = useRef<ReturnType<typeof registerFeedVideo> | null>(null);
  const [near, setNear] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useMediaAudio();
  const [error, setError] = useState("");
  const [dimensions, setDimensions] = useState({ width: post.width ?? 1, height: post.height ?? 1 });
  const frame = mediaFrame(dimensions.width, dimensions.height);
  useEffect(() => {
    const target = root.current;
    if (!target) return;
    if (!("IntersectionObserver" in window)) { const timer = setTimeout(() => setNear(true), 0); return () => clearTimeout(timer); }
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: "600px 0px" });
    observer.observe(target); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!near) return;
    let cancelled = false, url: string | undefined;
    const element = post.kind === "video" ? video.current : image.current;
    if (!element) return;
    (post.media ? Promise.resolve(post.media) : post.mediaUrl?Promise.resolve(post.mediaUrl):feedDataSource.media(post.id)).then((resource) => {
      if (cancelled) return;
      if (typeof resource === "string") element.src = resource;
      else { url = URL.createObjectURL(resource); element.src = url; }
      setLoaded(true); setError("");
    }).catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; if (post.kind === "video") (element as HTMLVideoElement).pause(); element.removeAttribute("src"); if (post.kind === "video") (element as HTMLVideoElement).load(); if (url) URL.revokeObjectURL(url); setLoaded(false); };
  }, [near, post.id, post.media, post.mediaUrl, post.kind]);
  useEffect(() => {
    const element = video.current;
    if (post.kind !== "video" || !element || !near || suspended || !loaded) return;
    const controller = registerFeedVideo(instance, element, setActive); registration.current = controller;
    if(!('IntersectionObserver' in window)){controller.visibility(1);return()=>{controller.dispose();registration.current=null;};}
    const observer = new IntersectionObserver(([entry]) => {
      const availableHeight = Math.min(entry.boundingClientRect.height, entry.rootBounds?.height ?? window.innerHeight);
      controller.visibility(entry.isIntersecting && availableHeight > 0 ? entry.intersectionRect.height / availableHeight : 0);
    }, { threshold: [0, .15, .25, .4, .55, .7, .85, 1], rootMargin: "-74px 0px 0px" });
    observer.observe(element);
    return () => { observer.disconnect(); controller.dispose(); registration.current = null; };
  }, [instance, post.id, post.kind, near, suspended, loaded]);
  useEffect(() => {
    const element = video.current; if (!element || !loaded) return;
    if (!active || paused || suspended) element.pause();
    else void element.play().catch((error) => {
      if(error.name==='NotAllowedError'){element.muted=true;void element.play().catch(()=>{});}
      // A scroll, source change or dialog can interrupt play(); this is not a user pause.
    });
  }, [active, paused, suspended, loaded, muted]);
  function toggle() {
    if (!video.current) return;
    if (video.current.paused && !active) { registration.current?.visibility(1); setPaused(false); }
    else setPaused((value) => !value);
  }
  const style = { aspectRatio: String(frame.ratio), "--media-fit": frame.fit } as CSSProperties;
  return <div className="feed-media-frame" ref={root} style={style}>
    {post.kind === "video" ? <><video poster={post.posterUrl} ref={video} className="feed-post-media" muted={muted} playsInline loop preload="none" onLoadedMetadata={() => { const element = video.current; if (element) setDimensions({ width: element.videoWidth, height: element.videoHeight }); }} onClick={toggle} onError={() => { if (near && loaded) setError("No se pudo reproducir este video."); }} /><div className="feed-video-controls"><button type="button" aria-label={active && !paused ? "Pausar video" : "Reproducir video"} onClick={toggle}>{active && !paused ? <Pause size={18} /> : <Play size={18} />}</button><button type="button" aria-label={muted ? "Activar sonido" : "Silenciar video"} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button></div></> : <img ref={image} className="feed-post-media" loading="lazy" decoding="async" alt={alt} onLoad={() => { const element = image.current; if (element) setDimensions({ width: element.naturalWidth, height: element.naturalHeight }); }} onError={() => { if (near && loaded) setError("No se pudo cargar esta imagen."); }} />}
    {error && <p className="feed-media-error" role="status">{error}</p>}
  </div>;
}
