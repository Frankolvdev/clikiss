"use client";
import {useEffect,useRef} from "react";

export default function AnimatedAvatar({image,video,className='',alt=''}:{image?:string;video?:string;className?:string;alt?:string}){
 const ref=useRef<HTMLVideoElement>(null);
 useEffect(()=>{
  const element=ref.current;if(!element||!video)return;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');let visible=false;
  const update=()=>{if(visible&&!document.hidden&&!motion.matches){if(!element.getAttribute('src'))element.src=video;element.muted=true;void element.play().catch(()=>{});}else element.pause();};
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;update();});observer.observe(element);
  element.addEventListener('canplay',update);document.addEventListener('visibilitychange',update);motion.addEventListener('change',update);
  return()=>{observer.disconnect();element.pause();element.removeAttribute('src');element.load();element.removeEventListener('canplay',update);document.removeEventListener('visibilitychange',update);motion.removeEventListener('change',update);};
 },[video]);
 if(!video)return <img src={image} alt={alt} className={className} loading="lazy" decoding="async"/>;
 return <video ref={ref} className={`avatar-motion ${className}`} poster={image} muted loop playsInline preload="none" aria-label={alt}/>;
}
