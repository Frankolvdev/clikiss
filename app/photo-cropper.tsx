"use client";
import {useEffect,useRef,useState,type PointerEvent} from "react";
import {Move,RotateCcw,X,ZoomIn} from "lucide-react";

export default function PhotoCropper({file,title,onCancel,onSave,ratio=3/4,onRatio}:{ratio?:number;onRatio?:(ratio:number)=>void;file:File;title:string;onCancel:()=>void;onSave:(file:File)=>Promise<void>}){
 const [src,setSrc]=useState(''),[size,setSize]=useState({width:0,height:0}),[width,setWidth]=useState(300),[zoom,setZoom]=useState(1),[position,setPosition]=useState({x:0,y:0}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const frame=useRef<HTMLDivElement>(null),root=useRef<HTMLDivElement>(null),image=useRef<HTMLImageElement>(null),drag=useRef<{x:number;y:number;offsetX:number;offsetY:number}|null>(null);
 const height=width/ratio,scale=size.width?Math.max(width/size.width,height/size.height)*zoom:1;
 const imageWidth=size.width*scale,imageHeight=size.height*scale,limitX=Math.max(0,(imageWidth-width)/2),limitY=Math.max(0,(imageHeight-height)/2);
 useEffect(()=>{const url=URL.createObjectURL(file);const timer=setTimeout(()=>setSrc(url),0);return()=>{clearTimeout(timer);URL.revokeObjectURL(url);};},[file]);
 useEffect(()=>{const element=frame.current;if(!element)return;const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;root.current?.focus();return()=>previous?.focus();},[]);
 const reset=()=>{setZoom(1);setPosition({x:0,y:0});};
 function move(event:PointerEvent<HTMLDivElement>){if(!drag.current)return;setPosition({x:limitX?Math.max(-1,Math.min(1,drag.current.offsetX+(event.clientX-drag.current.x)/limitX)):0,y:limitY?Math.max(-1,Math.min(1,drag.current.offsetY+(event.clientY-drag.current.y)/limitY)):0});}
 async function save(){
  if(!image.current||!size.width||busy)return;setBusy(true);setError('');
  try{
   const sourceWidth=width/scale,sourceHeight=height/scale,left=Math.max(0,(imageWidth-width)/2/scale-position.x*limitX/scale),top=Math.max(0,(imageHeight-height)/2/scale-position.y*limitY/scale);
   const canvas=document.createElement('canvas');canvas.width=Math.min(1080,Math.max(3,Math.floor(sourceWidth/3)*3));canvas.height=Math.round(canvas.width/ratio);
   const context=canvas.getContext('2d');if(!context)throw new Error('No se pudo preparar la imagen.');context.drawImage(image.current,left,top,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob((result)=>result?resolve(result):reject(new Error('No se pudo recortar la imagen.')),'image/webp',.86));
   await onSave(new File([blob],'foto-ajustada.webp',{type:blob.type}));
  }catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 return <div className="photo-crop-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!busy)onCancel();}}><div ref={root} tabIndex={-1} className="photo-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-crop-title" onKeyDown={(event)=>{
  event.stopPropagation();
  if(event.key==='Escape'){event.stopPropagation();if(!busy)onCancel();}
  if(event.key==='Tab'){const nodes=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')??[]),first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===root.current)){event.preventDefault();first?.focus();}}
 }}><header><div><span>AJUSTA EL ENCUADRE</span><h2 id="photo-crop-title">{title}</h2></div><button type="button" aria-label="Cerrar recorte" disabled={busy} onClick={onCancel}><X size={20}/></button></header><p>Arrastra la foto y ajusta el zoom. Solo se guardará el área visible.</p>
 <div className="crop-formats">{onRatio&&[[1,"Cuadrado"],[3/4,"Vertical"],[9/16,"Historia"],[1.91,"Horizontal"]].map(([value,label])=><button type="button" key={label} aria-pressed={ratio===value} onClick={()=>{onRatio(Number(value));reset();}}>{label}</button>)}</div>
 <div ref={frame} className="photo-crop-frame" style={{aspectRatio:String(ratio)}} onPointerDown={(event)=>{if(!size.width)return;event.currentTarget.setPointerCapture(event.pointerId);drag.current={x:event.clientX,y:event.clientY,offsetX:position.x,offsetY:position.y};}} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
 {src&&<img ref={image} src={src} draggable={false} alt="Vista previa del recorte" style={{width:imageWidth,height:imageHeight,left:width/2+position.x*limitX,top:height/2+position.y*limitY}} onLoad={(event)=>{const element=event.currentTarget;if(element.naturalWidth*element.naturalHeight>40000000){setError('La imagen es demasiado grande. Máximo 40 megapíxeles.');return;}setSize({width:element.naturalWidth,height:element.naturalHeight});}} onError={()=>setError('No pudimos abrir esta imagen. Prueba con JPG, PNG o WebP.')}/>}
 <div className="photo-crop-grid" aria-hidden="true"/><span className="photo-crop-hint"><Move size={14}/>Arrastra para encuadrar</span></div>
 <div className="photo-crop-controls"><label><ZoomIn size={16}/>Zoom<input aria-label="Zoom del recorte" type="range" min="1" max="3" step=".01" value={zoom} onChange={(event)=>setZoom(Number(event.target.value))}/></label><details><summary>Ajustar posición</summary><label>Horizontal<input aria-label="Posición horizontal" type="range" min="-1" max="1" step=".01" value={position.x} onChange={(event)=>setPosition((current)=>({...current,x:Number(event.target.value)}))}/></label><label>Vertical<input aria-label="Posición vertical" type="range" min="-1" max="1" step=".01" value={position.y} onChange={(event)=>setPosition((current)=>({...current,y:Number(event.target.value)}))}/></label></details></div>
 {error&&<p className="social-error" role="alert">{error}</p>}<footer><button type="button" onClick={reset} disabled={busy}><RotateCcw size={15}/>Centrar</button><button type="button" disabled={busy} onClick={onCancel}>Cancelar</button><button type="button" className="photo-crop-save" disabled={busy||!size.width} onClick={()=>void save()}>{busy?'Guardando…':'Guardar foto'}</button></footer></div></div>;
}
