"use client";
import BrandLogo from "./brand-logo";
import {useEffect,useRef,useState} from "react";
import {mapLibraries} from "./google-maps";
import {MapPin,LocateFixed,Radar,Map as MapIcon,Search} from "lucide-react";
import {api,send} from "./api-client";
import {useAuth} from "./auth-context";
import type {Profile} from "./data";

type Nearby=Profile&{latitude:number;longitude:number};
export default function LocationExplorer({mode,onOpen,onResults}:{mode:"adventure"|"connections";onOpen:(id:string)=>void;onResults:(people:Profile[]|null,label?:string)=>void}){
 const {user,requireAccount}=useAuth();
 const [expanded,setExpanded]=useState(false),[view,setView]=useState<"map"|"radar">("radar");
 const [center,setCenter]=useState({lat:19.43,lng:-99.13}),[label,setLabel]=useState("Ciudad de México");
 const [radius,setRadius]=useState(20),[people,setPeople]=useState<Nearby[]>([]),[visible,setVisible]=useState(false);
 const [geoStatus,setGeoStatus]=useState<"locating"|"centering"|null>(null);
 const geoRequest=useRef(0),geoTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{geoRequest.current++;if(geoTimer.current)clearTimeout(geoTimer.current);},[]);
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const mapRoot=useRef<HTMLDivElement>(null),searchRoot=useRef<HTMLDivElement>(null);
 const map=useRef<google.maps.Map|null>(null),markers=useRef<google.maps.marker.AdvancedMarkerElement[]>([]),circle=useRef<google.maps.Circle|null>(null);
 const openRef=useRef(onOpen);useEffect(()=>{openRef.current=onOpen;},[onOpen]);
 useEffect(()=>{
  if(!expanded)return;let active=true,autocomplete:google.maps.places.PlaceAutocompleteElement|undefined;
  const failure=()=>{if(active)setError("Google Maps no pudo autorizar el mapa. Inténtalo más tarde.");};
  const global=window as unknown as {gm_authFailure?:()=>void};const previous=global.gm_authFailure;global.gm_authFailure=failure;
  void api<{latitude?:number;longitude?:number;label?:string;visible:boolean}>("location").then((zone)=>{if(active){setVisible(zone.visible);if(zone.latitude!=null&&zone.longitude!=null){setCenter({lat:zone.latitude,lng:zone.longitude});setLabel(zone.label||"Mi zona");}}}).catch(()=>{});
  mapLibraries().then(([maps,marker,places])=>{
   if(!active||!mapRoot.current||!searchRoot.current)return;
   map.current=new maps.Map(mapRoot.current,{center:{lat:19.43,lng:-99.13},zoom:11,mapId:process.env.NEXT_PUBLIC_GOOGLE_MAP_ID||"DEMO_MAP_ID",disableDefaultUI:true,zoomControl:true,gestureHandling:"cooperative"});
   autocomplete=new places.PlaceAutocompleteElement({includedPrimaryTypes:["(cities)"]});
   autocomplete.placeholder="Busca una ciudad";searchRoot.current.replaceChildren(autocomplete);
   autocomplete.addEventListener("gmp-select",async(event)=>{try{const place=(event as unknown as {placePrediction:google.maps.places.PlacePrediction}).placePrediction.toPlace();await place.fetchFields({fields:["displayName","formattedAddress","location"]});if(active&&place.location){setCenter({lat:Math.round(place.location.lat()*100)/100,lng:Math.round(place.location.lng()*100)/100});setLabel(place.displayName||place.formattedAddress||"Zona seleccionada");}}catch{if(active)setError("No se pudo localizar esa ciudad.");}});
   void marker;setReady(true);
  }).catch(()=>{if(active)setError("No se pudo cargar Google Maps. Intenta de nuevo.");});
  return()=>{active=false;autocomplete?.remove();for(const item of markers.current)item.map=null;markers.current=[];circle.current?.setMap(null);map.current=null;global.gm_authFailure=previous;};
 },[expanded]);
 useEffect(()=>{
  if(!expanded||!ready||!map.current)return;
  let idle:google.maps.MapsEventListener|undefined;
  if(geoStatus==='centering'){idle=google.maps.event.addListenerOnce(map.current,'idle',()=>{if(geoTimer.current)clearTimeout(geoTimer.current);setGeoStatus(null);setBusy(false);});}
  map.current.panTo(center);circle.current?.setMap(null);
  circle.current=new google.maps.Circle({map:map.current,center,radius:radius*1000,fillColor:"#ed1738",fillOpacity:view==="radar"?.12:.04,strokeColor:"#d8af55",strokeOpacity:.7,strokeWeight:1});
  const bounds=circle.current.getBounds();if(bounds)map.current.fitBounds(bounds,35);
  return()=>idle?.remove();
 },[expanded,ready,center,radius,view,geoStatus]);
 useEffect(()=>{
  if(!expanded||!ready||!map.current)return;
  // Google Maps owns these imperative SDK instances, not React state.
  // eslint-disable-next-line react-hooks/immutability
  for(const item of markers.current)item.map=null;
  markers.current=people.map((person)=>{const pin=document.createElement("button");pin.className="map-person-pin";pin.textContent=person.name.slice(0,1);pin.title=`${person.name} · ubicación aproximada`;const marker=new google.maps.marker.AdvancedMarkerElement({map:map.current,position:{lat:person.latitude,lng:person.longitude},content:pin,title:person.name});marker.addListener("click",()=>openRef.current(person.id));return marker;});
 },[people,expanded,ready]);
 async function search(){
  if(!requireAccount())return;setBusy(true);setError("");
  try{const query=new URLSearchParams({lat:String(center.lat),lng:String(center.lng),radius:String(radius),mode});const results=await api<Nearby[]>(`nearby?${query}`);setPeople(results);onResults(results,label);}
  catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 function locate(){
  if(!requireAccount()||busy)return;
  if(!navigator.geolocation){setError("Tu navegador no permite localizarte.");return;}
  const request=++geoRequest.current;setBusy(true);setError("");setGeoStatus("locating");
  const fail=()=>{if(request!==geoRequest.current)return;setError("No se obtuvo tu ubicaci?n. Puedes buscar una ciudad.");setGeoStatus(null);setBusy(false);};
  try{navigator.geolocation.getCurrentPosition(position=>{
   if(request!==geoRequest.current)return;
   setGeoStatus("centering");setCenter({lat:Math.round(position.coords.latitude*100)/100,lng:Math.round(position.coords.longitude*100)/100});setLabel("Mi zona aproximada");
   geoTimer.current=setTimeout(()=>{if(request===geoRequest.current){setGeoStatus(null);setBusy(false);}},2500);
  },fail,{enableHighAccuracy:false,timeout:10000,maximumAge:300000});}catch{fail();}
 }
 async function save(){if(!requireAccount())return;setBusy(true);setError("");try{await send("location",{latitude:center.lat,longitude:center.lng,label,visible},"PUT");setError(visible?"Zona guardada. Aparecerás en el radar cuando tu perfil esté publicado.":"Zona guardada. Tu perfil no aparecerá en el radar.");}catch(err){setError((err as Error).message);}finally{setBusy(false);}}
 return <section className="location-explorer"><button className="location-toggle" onClick={()=>{if(requireAccount()){if(!expanded)setView("radar");else if(geoStatus){geoRequest.current++;if(geoTimer.current)clearTimeout(geoTimer.current);setGeoStatus(null);setBusy(false);}setExpanded((value)=>!value);setReady(false);}}}><span><Radar size={19}/><strong>Encuentra tu chispa cerca de ti</strong></span><span>{expanded?"Cerrar mapa":"Mapa y radar"}</span></button>
 {expanded&&<div className="location-content"><div className="location-toolbar"><div ref={searchRoot} className="location-place-search"/><button onClick={locate} disabled={busy}><LocateFixed size={16}/> {geoStatus?"Ubicando?":"Mi zona"}</button><label>Radio<select value={radius} onChange={(event)=>setRadius(Number(event.target.value))}>{[2,5,10,20,50,100,200].map((km)=><option key={km} value={km}>{km} km</option>)}</select></label><button onClick={()=>setView(view==="map"?"radar":"map")}>{view==="map"?<Radar size={16}/>:<MapIcon size={16}/>} {view==="map"?"Radar":"Mapa"}</button><button className="map-search-button" disabled={busy} onClick={()=>void search()}><Search size={16}/>Buscar aquí</button></div>
 <div className={`location-map-wrap ${view==="radar"?"is-radar":""}`} aria-busy={Boolean(geoStatus)}><div ref={mapRoot} className="location-map" inert={Boolean(geoStatus)}/>{view==="radar"&&<div className="radar-sweep" aria-hidden="true"/>}{geoStatus&&<div className="location-loading" role="status" aria-live="polite"><div className="location-loading-emblem" aria-hidden="true"><i/><BrandLogo /></div><strong>CliKiss</strong><p>{geoStatus==="locating"?"Buscando tu ubicaci?n":"Ajustando tu radar"}</p><small>{geoStatus==="locating"?"Permite el acceso a tu ubicaci?n si el navegador lo solicita.":"Estamos centrando el mapa en tu zona."}</small></div>}</div>
 <div className="location-footer"><span><MapPin size={15}/>{label} · {people.length} perfiles en la última búsqueda</span><button onClick={()=>{setPeople([]);onResults(null);}}>Ver todos los perfiles</button></div>
 {user&&<div className="location-consent"><label><input type="checkbox" checked={visible} onChange={(event)=>setVisible(event.target.checked)}/>Quiero aparecer con mi zona aproximada en el radar.</label><button disabled={busy} onClick={()=>void save()}>Guardar mi zona y visibilidad</button><small>Tu ubicación exacta no se publica. Usar el mapa no activa tu visibilidad.</small></div>}
 {error&&<p className="location-notice" role="status">{error}</p>}</div>}</section>;
}
