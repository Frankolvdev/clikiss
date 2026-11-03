"use client";
import {useEffect,useId,useRef,useState} from "react";
import {MapPin,X} from "lucide-react";
import {placesLibrary} from "./google-maps";

export default function LocationSearch({id,value,onSelect}:{id?:string;value:string;onSelect:(value:string)=>void}){
 const generated=useId(),inputId=id??generated,listId=`${inputId}-suggestions`;
 const [draft,setDraft]=useState({saved:value,text:value,dirty:false});
 if(draft.saved!==value)setDraft({saved:value,text:value,dirty:false});
 const [open,setOpen]=useState(false),[items,setItems]=useState<google.maps.places.PlacePrediction[]>([]),[active,setActive]=useState(-1),[status,setStatus]=useState("");
 const token=useRef<google.maps.places.AutocompleteSessionToken|null>(null),sequence=useRef(0);
 useEffect(()=>{
  if(!open||!draft.dirty||draft.text.trim().length<3)return;
  let cancelled=false;const query=draft.text.trim(),request=++sequence.current;
  const timer=setTimeout(()=>{
   setStatus("Buscando ubicaciones…");setItems([]);setActive(-1);
   void placesLibrary().then(async(library)=>{
    if(cancelled)return;
    token.current??=new library.AutocompleteSessionToken();
    const result=await library.AutocompleteSuggestion.fetchAutocompleteSuggestions({input:query,sessionToken:token.current,includedPrimaryTypes:["(regions)"],language:"es"});
    if(cancelled||request!==sequence.current)return;
    const predictions=result.suggestions.flatMap((item)=>item.placePrediction?[item.placePrediction]:[]);
    setItems(predictions);setStatus(predictions.length?"":"No encontramos esa ubicación. Prueba con ciudad y estado.");
   }).catch(()=>{if(!cancelled&&request===sequence.current)setStatus("No pudimos cargar las sugerencias. Intenta de nuevo.");});
  },300);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[draft.text,draft.dirty,open]);
 async function select(item:google.maps.places.PlacePrediction){
  const request=++sequence.current;setStatus("Seleccionando ubicación…");
  try{
   const place=item.toPlace();await place.fetchFields({fields:["id"]});
   if(request!==sequence.current)return;
   const selected=item.text.toString().slice(0,100);token.current=null;
   setDraft({saved:selected,text:selected,dirty:false});setOpen(false);setItems([]);setStatus("");onSelect(selected);
  }catch{if(request===sequence.current)setStatus("No se pudo seleccionar la ubicación. Intenta de nuevo.");}
 }
 const show=open&&draft.dirty&&draft.text.trim().length>=3;
 return <div className="city-search" onBlur={(event)=>{if(!event.currentTarget.contains(event.relatedTarget)){setOpen(false);sequence.current++;}}}>
  <div className="city-search-input"><MapPin size={16}/><input id={inputId} role="combobox" aria-autocomplete="list" aria-expanded={show} aria-controls={listId} aria-activedescendant={show&&active>=0?`${listId}-${active}`:undefined} aria-label={id?undefined:"Ciudad o zona"} autoComplete="off" placeholder="Ciudad o zona" maxLength={100} value={draft.text} onFocus={()=>setOpen(true)} onChange={(event)=>{sequence.current++;setDraft({saved:value,text:event.target.value,dirty:true});setItems([]);setStatus("");setActive(-1);setOpen(true);}} onKeyDown={(event)=>{
   if(event.key==="ArrowDown"&&items.length){event.preventDefault();setActive((index)=>(index+1)%items.length);}
   if(event.key==="ArrowUp"&&items.length){event.preventDefault();setActive((index)=>(index+items.length-1)%items.length);}
   if(event.key==="Escape"){event.preventDefault();setOpen(false);}
   if(event.key==="Enter"&&show){event.preventDefault();if(active>=0&&items[active])void select(items[active]);}
  }}/>{draft.text&&<button type="button" aria-label="Borrar ubicación" onClick={()=>{sequence.current++;token.current=null;setDraft({saved:"",text:"",dirty:false});setOpen(false);setItems([]);onSelect("");}}><X size={15}/></button>}</div>
  {show&&<div className="city-search-popup"><div id={listId} role="listbox" aria-label="Ubicaciones sugeridas">{items.map((item,index)=><button type="button" role="option" aria-selected={index===active} id={`${listId}-${index}`} key={item.placeId} onMouseDown={(event)=>event.preventDefault()} onClick={()=>void select(item)}><MapPin size={16}/><span>{item.text.toString()}</span></button>)}</div>{status&&<p role="status">{status}</p>}<small>Google Maps</small></div>}
 </div>;
}
