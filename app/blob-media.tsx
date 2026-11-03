"use client";

import { useEffect, useRef } from "react";
import { Camera } from "lucide-react";
import { useMediaAudio } from "./use-media-audio";
import AnimatedAvatar from "./animated-avatar";

export function BlobMedia({ blob, fallback, loopSrc, video = false, className = "", alt = "", onDimensions }: { blob?: Blob; fallback?: string; loopSrc?:string; video?: boolean; className?: string; alt?: string; onDimensions?: (width: number, height: number) => void }) {
  const [muted, setMuted] = useMediaAudio();
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video ? videoRef.current : imageRef.current;
    if (!blob || !element) return;
    const url = URL.createObjectURL(blob);
    element.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob, video]);
  if (!blob && !fallback) return <div className={`social-media-placeholder ${className}`}><Camera size={24} /></div>;
  if(loopSrc&&!blob)return <AnimatedAvatar image={fallback} video={loopSrc} className={className} alt={alt}/>;
  return video ? <video ref={videoRef} src={blob ? undefined : fallback} className={className} muted={muted} onVolumeChange={(event) => setMuted(event.currentTarget.muted)} onLoadedMetadata={(event) => onDimensions?.(event.currentTarget.videoWidth, event.currentTarget.videoHeight)} controls playsInline preload="metadata" /> : <img ref={imageRef} src={blob ? undefined : fallback} className={className} alt={alt} onLoad={(event) => onDimensions?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} />;
}
