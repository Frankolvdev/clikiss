"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {ChevronLeft,ChevronRight} from "lucide-react";
export default function StoryCarousel({children,className}:{children:ReactNode;className:string}){
 const rail=useRef<HTMLDivElement>(null),[edges,setEdges]=useState({left:false,right:false});
 useEffect(()=>{const element=rail.current;if(!element)return;const update=()=>setEdges({left:element.scrollLeft>3,right:element.scrollLeft+element.clientWidth<element.scrollWidth-3});const frame=requestAnimationFrame(update);const observer=new ResizeObserver(update);observer.observe(element);for(const child of element.children)observer.observe(child);element.addEventListener('scroll',update,{passive:true});return()=>{cancelAnimationFrame(frame);observer.disconnect();element.removeEventListener('scroll',update);};},[children]);
 const move=(direction:number)=>rail.current?.scrollBy({left:direction*rail.current.clientWidth*.8,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 return <div className="story-carousel"><div ref={rail} className={className} aria-label="Carrusel de historias">{children}</div>{edges.left&&<button className="story-carousel-arrow previous" type="button" aria-label="Historias anteriores" onClick={()=>move(-1)}><ChevronLeft size={18}/></button>}{edges.right&&<button className="story-carousel-arrow next" type="button" aria-label="Historias siguientes" onClick={()=>move(1)}><ChevronRight size={18}/></button>}</div>;
}
