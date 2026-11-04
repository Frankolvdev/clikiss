"use client";
import {useEffect,useState} from 'react';
import {api} from '../api-client';

type Capacity={active:number;ringing:number;direct:number;relayed:number;limit:number;admitting:boolean;metrics:{cpu:number;freeMb:number;networkMbps:number|null}};
export default function CallCapacity(){
 const [capacity,setCapacity]=useState<Capacity|null>(null);
 useEffect(()=>{
  let active=true;
  const refresh=()=>void api<Capacity>('admin/calls').then(value=>{if(active)setCapacity(value);}).catch(()=>{});
  refresh();const timer=setInterval(refresh,15000);return()=>{active=false;clearInterval(timer);};
 },[]);
 return <section className="admin-call-capacity" aria-label="Capacidad de videollamadas"><h2>Videollamadas</h2>{capacity?<>
  <p>{capacity.admitting?'Disponible para nuevas llamadas':'Nuevas llamadas pausadas'} · {capacity.active} de {capacity.limit} cupos reservados</p>
  <dl><div><dt>Conexión directa</dt><dd>{capacity.direct}</dd></div><div><dt>Con retransmisión</dt><dd>{capacity.relayed}</dd></div><div><dt>Esperando respuesta</dt><dd>{capacity.ringing}</dd></div><div><dt>CPU</dt><dd>{Math.round(capacity.metrics.cpu*100)}%</dd></div><div><dt>Memoria disponible</dt><dd>{Math.round(capacity.metrics.freeMb)} MB</dd></div><div><dt>Tráfico de red</dt><dd>{capacity.metrics.networkMbps===null?'Sin medir':`${capacity.metrics.networkMbps.toFixed(1)} Mbps`}</dd></div></dl>
 </>:<p>No se pudo consultar la capacidad. Comprueba la migración y configuración de llamadas.</p>}</section>;
}
