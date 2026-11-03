"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

export function videoTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

// One small, bounded filmstrip is shared by both controls. No server requests.
export function useVideoFrames(src: string) {
  const [frames, setFrames] = useState<string[]>([]);
  useEffect(() => {
    const abort = new AbortController();
    const video = document.createElement("video");
    video.muted = true; video.preload = "auto"; video.playsInline = true;
    function wait(event: string) {
      return new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timer); video.removeEventListener(event, success);
          video.removeEventListener("error", failure); abort.signal.removeEventListener("abort", failure);
          if (error) reject(error); else resolve();
        };
        const success = () => finish();
        const failure = () => finish(new Error("FRAME_UNAVAILABLE"));
        const timer = setTimeout(failure, 8000);
        video.addEventListener(event, success, { once: true });
        video.addEventListener("error", failure, { once: true });
        abort.signal.addEventListener("abort", failure, { once: true });
      });
    }
    async function sample() {
      setFrames([]);
      if (!src) return;
      const loaded = wait("loadeddata"); video.src = src; await loaded;
      if (!Number.isFinite(video.duration) || !video.videoWidth) return;
      const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 88;
      const context = canvas.getContext("2d"); if (!context) return;
      const result: string[] = [];
      for (let i = 0; i < 8 && !abort.signal.aborted; i++) {
        const time = Math.max(0, video.duration - .2) * (i + .5) / 8;
        const seeked = wait("seeked"); video.currentTime = time; await seeked;
        const scale = Math.max(64 / video.videoWidth, 88 / video.videoHeight);
        context.drawImage(video, (64 - video.videoWidth * scale) / 2, (88 - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale);
        result.push(canvas.toDataURL("image/jpeg", .6));
      }
      if (!abort.signal.aborted) setFrames(result);
    }
    void sample().catch(() => { /* The timeline remains usable without thumbnails. */ });
    return () => { abort.abort(); video.pause(); video.removeAttribute("src"); video.load(); };
  }, [src]);
  return frames;
}

export default function VideoTimeline({ duration, value, onChange, frames, label, point = false, disabled = false }: {
  duration: number; value: number; onChange: (value: number) => void;
  frames: string[]; label: string; point?: boolean; disabled?: boolean;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const span = Math.min(3, duration), maximum = Math.max(0, duration - (point ? .1 : span));
  const left = duration ? value / duration * 100 : 0;
  function seek(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !duration || drag.current === null || !rail.current) return;
    const rect = rail.current.getBoundingClientRect();
    const time = (event.clientX - rect.left) / rect.width * duration - drag.current;
    onChange(Math.min(maximum, Math.round(Math.max(0, Math.min(maximum, time)) * 10) / 10));
  }
  return <div className={`video-timeline ${point ? "is-cover" : "is-window"}`}>
    <div className="timeline-label"><strong>{label}</strong><span>{point ? videoTime(value) : `${videoTime(value)} — ${videoTime(Math.min(duration, value + span))}`}</span></div>
    <div ref={rail} className="timeline-rail" aria-disabled={disabled} onPointerDown={event => {
      if (disabled || !duration) return;
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      const target = event.target as HTMLElement;
      const rect = event.currentTarget.getBoundingClientRect();
      drag.current = !point && target.closest(".timeline-selection") ? (event.clientX - rect.left) / rect.width * duration - value : point ? 0 : span / 2;
      seek(event);
    }} onPointerMove={seek} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="timeline-frames" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <span key={i} style={frames[i] ? { backgroundImage: `url(${frames[i]})` } : undefined} />)}</div>
      <div className="timeline-selection" style={{ left: `${left}%`, width: point ? undefined : `${duration ? span / duration * 100 : 100}%` }} aria-hidden="true"><i/>{!point && <><span>{span.toFixed(span < 3 ? 1 : 0)} s</span><i/></>}</div>
      <input aria-label={label} type="range" min={0} max={maximum} step={.1} value={value} disabled={disabled || !duration} onChange={event => onChange(Number(event.target.value))}/>
    </div>
    <div className="timeline-scale"><span>0:00</span><span>{videoTime(duration)}</span></div>
  </div>;
}
